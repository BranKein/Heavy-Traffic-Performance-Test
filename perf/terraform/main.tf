terraform {
  required_version = ">= 1.5"

  # HCP Terraform 원격 실행(CLI-driven). 로컬에서 `terraform apply/destroy` 를 쳐도
  # 실제 실행은 HCP 러너에서 이뤄져 노트북 인터넷이 끊겨도 런이 계속된다.
  # organization 은 각자의 HCP 조직명으로 교체할 것(아래 REPLACE_WITH_YOUR_HCP_ORG).
  cloud {
    organization = "yeonhyuk-me"
    workspaces {
      name = "htpt-ws"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# 최신 Ubuntu 22.04 LTS AMI (amd64 — c6i/t3 는 x86_64)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 노드 조인용 공유 토큰(server/agent 동일). 사후 조회 없이 IaC 로 고정 주입.
resource "random_password" "k3s_token" {
  length  = 48
  special = false
}

# ── 네트워크 (단일 VPC / AZ 분리) ────────────────────────────────────────
# 단일 k3s 클러스터를 유지한다(VPC 하나, AZ만 분리 → flannel VXLAN·SG self-rule 그대로
# 동작, 멀티 VPC/피어링 불필요). harness 는 public(AZ-a), sut/deps 는 private(AZ-c).
resource "aws_vpc" "perf" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # NLB internal DNS 해석에 필요
  tags                 = { Name = "heavy-traffic-perf-vpc" }
}

resource "aws_subnet" "public_load" { # AZ-a: harness (public IP, IGW)
  vpc_id                  = aws_vpc.perf.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.az_load
  map_public_ip_on_launch = true
  tags                    = { Name = "htp-public-load-a" }
}

resource "aws_subnet" "public_sut" { # AZ-c: NLB(internal) + NAT Gateway
  vpc_id                  = aws_vpc.perf.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = var.az_sut
  map_public_ip_on_launch = true
  tags                    = { Name = "htp-public-sut-c" }
}

resource "aws_subnet" "private_sut" { # AZ-c: sut + deps (public IP 없음, egress→NAT)
  vpc_id            = aws_vpc.perf.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = var.az_sut
  tags              = { Name = "htp-private-sut-c" }
}

resource "aws_internet_gateway" "perf" {
  vpc_id = aws_vpc.perf.id
  tags   = { Name = "htp-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "htp-nat-eip" }
}

resource "aws_nat_gateway" "perf" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_sut.id # NAT 는 public 서브넷(AZ-c)에
  depends_on    = [aws_internet_gateway.perf]
  tags          = { Name = "htp-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.perf.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.perf.id
  }
  tags = { Name = "htp-rt-public" }
}

resource "aws_route_table_association" "public_load" {
  subnet_id      = aws_subnet.public_load.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_sut" {
  subnet_id      = aws_subnet.public_sut.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.perf.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.perf.id
  }
  tags = { Name = "htp-rt-private" }
}

resource "aws_route_table_association" "private_sut" {
  subnet_id      = aws_subnet.private_sut.id
  route_table_id = aws_route_table.private.id
}

# ── Security Group 3개 ───────────────────────────────────────────────────
# cluster↔nlb 가 서로를 참조하므로 규칙은 aws_vpc_security_group_ingress_rule(별도
# 리소스)로 분리해 순환참조 사이클을 끊는다.
resource "aws_security_group" "cluster" { # 3개 노드 전부에 부착
  name        = "htp-cluster"
  description = "k6 perf 3-node k3s cluster (intra-cluster + NLB→NodePort)"
  vpc_id      = aws_vpc.perf.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "htp-cluster" }
}

# k3s intra-cluster 전체 허용(6443 API / 8472 flannel VXLAN / 10250 kubelet / pod).
# SSH bastion(harness→sut/deps:22)·Prometheus scrape 도 이 규칙으로 커버.
resource "aws_vpc_security_group_ingress_rule" "cluster_self" {
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = aws_security_group.cluster.id
  ip_protocol                  = "-1"
  description                  = "intra-cluster (k3s api/flannel/kubelet/pod/ssh-bastion)"
}

# NLB → sut NodePort (chat)
resource "aws_vpc_security_group_ingress_rule" "cluster_from_nlb" {
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = aws_security_group.nlb.id
  from_port                    = var.chat_nodeport
  to_port                      = var.chat_nodeport
  ip_protocol                  = "tcp"
  description                  = "NLB -> sut chat NodePort"
}

# harness 에만 추가 부착 → 외부(allowed_cidr) 노출 포트
resource "aws_security_group" "harness_public" {
  name        = "htp-harness-public"
  description = "harness 외부 노출: SSH + Grafana + Control Panel"
  vpc_id      = aws_vpc.perf.id
  dynamic "ingress" {
    for_each = [22, 30300, 30800]
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = [var.allowed_cidr]
    }
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "htp-harness-public" }
}

# NLB 에 부착(provider ~>5 는 network LB 의 SG 지원)
resource "aws_security_group" "nlb" {
  name        = "htp-nlb"
  description = "internal NLB in front of sut chat NodePort"
  vpc_id      = aws_vpc.perf.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "htp-nlb" }
}

# harness(k6, cluster SG) → NLB:80
resource "aws_vpc_security_group_ingress_rule" "nlb_from_cluster" {
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = aws_security_group.cluster.id
  from_port                    = 80
  to_port                      = 80
  ip_protocol                  = "tcp"
  description                  = "harness(k6) -> NLB:80"
}

# ── cloud-init ──────────────────────────────────────────────────────────
locals {
  # harness = k3s server (traefik 비활성, NodePort 로 직접 노출). ubuntu 유저 kubectl 세팅.
  harness_user_data = <<-EOF
    #!/bin/bash
    set -eux
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y docker.io git curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    usermod -aG docker ubuntu
    curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" K3S_TOKEN='${random_password.k3s_token.result}' sh -
    mkdir -p /home/ubuntu/.kube
    cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
    chown -R ubuntu:ubuntu /home/ubuntu/.kube
    echo "export KUBECONFIG=/home/ubuntu/.kube/config" >> /home/ubuntu/.bashrc
    touch /home/ubuntu/.cloud-init-done
  EOF

  # agent 공통: server 6443 이 열릴 때까지 대기 후 조인. join 시점에 role 라벨+taint 자동 부여.
  # (cadvisor 의 /var/lib/docker 마운트 경로 확보 위해 docker.io 설치)
  agent_user_data = { for role in ["sut", "deps"] : role => <<-EOF
    #!/bin/bash
    set -eux
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y docker.io curl
    until (echo > /dev/tcp/${aws_instance.harness.private_ip}/6443) >/dev/null 2>&1; do echo 'k3s server 대기...'; sleep 5; done
    curl -sfL https://get.k3s.io | K3S_URL='https://${aws_instance.harness.private_ip}:6443' K3S_TOKEN='${random_password.k3s_token.result}' INSTALL_K3S_EXEC="agent --node-label role=${role} --node-taint role=${role}:NoSchedule" sh -
    touch /home/ubuntu/.cloud-init-done
  EOF
  }
}

# ── 노드 3대 ────────────────────────────────────────────────────────────
resource "aws_instance" "harness" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.harness_instance_type
  key_name                    = var.key_name
  subnet_id                   = aws_subnet.public_load.id # AZ-a
  vpc_security_group_ids      = [aws_security_group.cluster.id, aws_security_group.harness_public.id]
  associate_public_ip_address = true
  user_data                   = local.harness_user_data
  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }
  tags = { Name = "heavy-traffic-perf-harness", Role = "harness" }
}

resource "aws_instance" "sut" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.sut_instance_type
  key_name               = var.key_name
  subnet_id              = aws_subnet.private_sut.id # AZ-c, public IP 없음
  vpc_security_group_ids = [aws_security_group.cluster.id]
  user_data              = local.agent_user_data["sut"]
  # private 노드 cloud-init 이 get.k3s.io/apt 를 받으므로 NAT egress 경로가 먼저 서야 함
  depends_on = [aws_route_table_association.private_sut]
  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }
  tags = { Name = "heavy-traffic-perf-sut", Role = "sut" }
}

resource "aws_instance" "deps" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.deps_instance_type
  key_name               = var.key_name
  subnet_id              = aws_subnet.private_sut.id # AZ-c, public IP 없음
  vpc_security_group_ids = [aws_security_group.cluster.id]
  user_data              = local.agent_user_data["deps"]
  depends_on             = [aws_route_table_association.private_sut]
  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }
  tags = { Name = "heavy-traffic-perf-deps", Role = "deps" }
}

# ── NLB (internal, L4/TCP) — SUT 앞단 ────────────────────────────────────
# 요청 경로: k6(harness, AZ-a) → NLB(internal, AZ-c) → sut NodePort → chat pod.
# cross-zone on: harness(AZ-a)→NLB(AZ-c) 는 의도된 cross-AZ hop.
resource "aws_lb" "sut" {
  name                             = "htp-sut-nlb"
  internal                         = true
  load_balancer_type               = "network"
  subnets                          = [aws_subnet.public_sut.id] # AZ-c
  security_groups                  = [aws_security_group.nlb.id]
  enable_cross_zone_load_balancing = true
  tags                             = { Name = "htp-sut-nlb" }
}

resource "aws_lb_target_group" "sut" {
  name        = "htp-sut-tg"
  port        = var.chat_nodeport
  protocol    = "TCP"
  vpc_id      = aws_vpc.perf.id
  target_type = "instance"
  health_check {
    protocol = "TCP"
    port     = tostring(var.chat_nodeport)
  }
}

resource "aws_lb_target_group_attachment" "sut" {
  target_group_arn = aws_lb_target_group.sut.arn
  target_id        = aws_instance.sut.id
  port             = var.chat_nodeport
}

resource "aws_lb_listener" "sut" {
  load_balancer_arn = aws_lb.sut.arn
  port              = 80
  protocol          = "TCP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.sut.arn
  }
}

# ── 배포: harness 노드에만 perf/ 업로드 후 부트스트랩 ─────────────────────
# 이미지는 Docker Hub 에서 pull 하므로(publish-images.sh 로 사전 push) AWS 노드에서
# 빌드하지 않는다 → spring 소스 업로드 불필요, perf/ 만 올린다.
resource "null_resource" "deploy" {
  depends_on = [
    aws_instance.harness, aws_instance.sut, aws_instance.deps,
    aws_lb_listener.sut, aws_route_table_association.private_sut,
  ]

  triggers = {
    harness_id = aws_instance.harness.id
    sut_id     = aws_instance.sut.id
    deps_id    = aws_instance.deps.id
  }

  connection {
    type = "ssh"
    host = aws_instance.harness.public_ip
    user = "ubuntu"
    # HCP(원격): private_key_pem(내용) 사용. 로컬: private_key_path(파일) 사용.
    private_key = var.private_key_pem != "" ? var.private_key_pem : file(var.private_key_path)
    timeout     = "5m"
  }

  # server cloud-init 완료 + agent 2대 조인(Ready) 대기
  provisioner "remote-exec" {
    inline = [
      "echo 'harness cloud-init 대기...'",
      "until [ -f /home/ubuntu/.cloud-init-done ]; do sleep 5; done",
      "sudo k3s kubectl version --client >/dev/null && echo k3s-ready",
      "echo 'agent 노드 조인 대기(총 3 노드 Ready)...'",
      "until [ \"$(sudo k3s kubectl get nodes --no-headers 2>/dev/null | grep -c ' Ready ')\" -ge 3 ]; do sleep 5; done",
      "sudo k3s kubectl get nodes -o wide --show-labels",
    ]
  }

  # 배포 소스는 harness 가 GitHub public repo 에서 직접 clone 한다.
  # (CLI-driven HCP 러너엔 perf/terraform 만 업로드되므로 로컬 tar 업로드 방식은 못 씀.
  #  git clone 은 러너 파일시스템에 비의존이라 로컬/HCP 원격 실행 모두 동일하게 동작.)
  #  → 배포 전 반드시 repo_ref(기본 main) 로 commit + push 되어 있어야 한다.
  #  CHAT_ENDPOINT(NLB DNS:80) 를 주입 → bootstrap 이 k6 chat Job 의 chat base URL 로 쓴다.
  #  (없으면 bootstrap 이 cluster DNS 로 폴백)
  provisioner "remote-exec" {
    inline = [
      "sudo rm -rf /home/ubuntu/app",
      "git clone --depth 1 --branch ${var.repo_ref} ${var.repo_url} /home/ubuntu/app",
      "cd /home/ubuntu/app/perf/terraform && chmod +x bootstrap.sh && sudo CHAT_ENDPOINT='${aws_lb.sut.dns_name}:80' ./bootstrap.sh",
    ]
  }
}
