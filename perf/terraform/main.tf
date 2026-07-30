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

resource "aws_security_group" "perf" {
  name        = "heavy-traffic-perf"
  description = "k6 perf test 3-node k3s cluster"

  # ── 외부 접근 (allowed_cidr) ──
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }
  ingress {
    description = "Grafana NodePort"
    from_port   = 30300
    to_port     = 30300
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }
  ingress {
    description = "Perf Control Panel NodePort"
    from_port   = 30800
    to_port     = 30800
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  # ── 클러스터 내부 통신 (노드 간 전부 허용) ──
  # k3s: 6443(API), 8472/udp(flannel VXLAN), 10250(kubelet), 그리고 파드 간 통신.
  # 자기참조(self) 규칙으로 이 SG 에 속한 노드끼리는 모든 트래픽 허용.
  ingress {
    description = "intra-cluster (k3s api/flannel/kubelet/pod)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
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
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.harness_instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.perf.id]
  user_data              = local.harness_user_data
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
  vpc_security_group_ids = [aws_security_group.perf.id]
  user_data              = local.agent_user_data["sut"]
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
  vpc_security_group_ids = [aws_security_group.perf.id]
  user_data              = local.agent_user_data["deps"]
  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }
  tags = { Name = "heavy-traffic-perf-deps", Role = "deps" }
}

# ── 배포: harness 노드에만 perf/ 업로드 후 부트스트랩 ─────────────────────
# 이미지는 Docker Hub 에서 pull 하므로(publish-images.sh 로 사전 push) AWS 노드에서
# 빌드하지 않는다 → spring 소스 업로드 불필요, perf/ 만 올린다.
resource "null_resource" "deploy" {
  depends_on = [aws_instance.harness, aws_instance.sut, aws_instance.deps]

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
  provisioner "remote-exec" {
    inline = [
      "sudo rm -rf /home/ubuntu/app",
      "git clone --depth 1 --branch ${var.repo_ref} ${var.repo_url} /home/ubuntu/app",
      "cd /home/ubuntu/app/perf/terraform && chmod +x bootstrap.sh && sudo ./bootstrap.sh",
    ]
  }
}
