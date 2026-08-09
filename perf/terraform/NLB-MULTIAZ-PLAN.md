# Terraform 변경안 — Multi-AZ 부하 + NLB 앞단 (검토 확정본)

> 시각 자료: `perf/terraform/infra-nlb-multiaz.drawio`
> 현재(baseline) 코드: `perf/terraform/main.tf` / `variables.tf` / `outputs.tf`
> 이 문서만 보고 바로 구현 가능하도록 작성. 아래 **작업 체크리스트** 순서대로 진행.

## 확정된 설계 결정 (재확인 불필요)
- **단일 k3s 클러스터 유지** (VPC 하나, AZ만 분리 → flannel VXLAN·SG self-rule 그대로 동작. 멀티 VPC/피어링 안 감).
- **NLB = internal · L4(TCP)** 로 SUT 앞단. cross-zone on. (ALB 안 씀 — 저지연이라 벤치 오염 최소.)
- **deps 는 sut 와 같은 AZ(AZ-c)** — SUT↔DB 가 cross-AZ 가 되지 않게(DB 지연으로 측정 오염 방지).
- **부하기(harness)만 다른 AZ(AZ-a)** — 요청 경로에 cross-AZ RTT 반영.
- **SUT/deps 는 Private Subnet** (인터넷 직접 노출 없음). SSH 는 harness bastion(`-J`)/SSM. Private egress 는 NAT GW.
- 요청 경로: `k6(harness, AZ-a) → NLB(internal, AZ-c) → sut NodePort:30080 → chat pod → postgres/fake-push(deps)`

## 목표 토폴로지
```
VPC 10.0.0.0/16 (enable_dns_hostnames=true)
├─ Public Subnet  AZ-a  10.0.1.0/24   : harness (public IP, IGW)
├─ Public Subnet  AZ-c  10.0.2.0/24   : NLB(internal) + NAT Gateway(EIP)
└─ Private Subnet AZ-c  10.0.10.0/24  : sut, deps (public IP 없음, egress→NAT)
IGW  ─ public RT(0.0.0.0/0→IGW) ← public 서브넷 2개
NAT  ─ private RT(0.0.0.0/0→NAT) ← private 서브넷
```

---

## 작업 체크리스트 (다음 세션은 이 순서로)
1. [ ] `variables.tf` — 신규 변수 추가 (§1)
2. [ ] `main.tf` — VPC/서브넷/IGW/NAT/RouteTable 추가 (§2)
3. [ ] `main.tf` — SG 3개로 재설계 (기존 `aws_security_group.perf` 대체) (§3)
4. [ ] `main.tf` — 3개 `aws_instance` 에 subnet_id/SG/public IP/depends_on 반영 (§4)
5. [ ] `main.tf` — NLB + target group + attachment + listener 추가 (§5)
6. [ ] `main.tf` — `null_resource.deploy` 에 NLB DNS 주입 + depends_on 갱신 (§6)
7. [ ] `outputs.tf` — nlb_dns 추가, ssh_commands 를 bastion 방식으로 (§7)
8. [ ] k8s 매니페스트 — chat Service NodePort 30080 + externalTrafficPolicy, k6 타깃을 NLB 로 (§8)
9. [ ] `terraform validate` → commit+push(배포 전 필수, harness 가 clone) → HCP apply

---

## §1. variables.tf 추가
```hcl
variable "vpc_cidr" { type = string, default = "10.0.0.0/16" }
variable "az_load"  { type = string, default = "ap-northeast-2a" } # 부하기(harness)
variable "az_sut"   { type = string, default = "ap-northeast-2c" } # sut+deps+NLB+NAT
variable "chat_nodeport" {
  description = "SUT chat 서버 NodePort (NLB target). k8s Service 와 반드시 일치."
  type    = number
  default  = 30080
}
```
> 기존 `region`, `*_instance_type`, `key_name`, `private_key_*`, `repo_*`, `allowed_cidr`, `root_volume_gb` 는 그대로 유지.

## §2. main.tf — 네트워크 (신규)
```hcl
resource "aws_vpc" "perf" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true          # NLB DNS 해석에 필요
  tags = { Name = "heavy-traffic-perf-vpc" }
}

resource "aws_subnet" "public_load" {          # AZ-a: harness
  vpc_id                  = aws_vpc.perf.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.az_load
  map_public_ip_on_launch = true
  tags = { Name = "htp-public-load-a" }
}
resource "aws_subnet" "public_sut" {           # AZ-c: NLB + NAT
  vpc_id                  = aws_vpc.perf.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = var.az_sut
  map_public_ip_on_launch = true
  tags = { Name = "htp-public-sut-c" }
}
resource "aws_subnet" "private_sut" {          # AZ-c: sut + deps
  vpc_id            = aws_vpc.perf.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = var.az_sut
  tags = { Name = "htp-private-sut-c" }
}

resource "aws_internet_gateway" "perf" {
  vpc_id = aws_vpc.perf.id
  tags   = { Name = "htp-igw" }
}
resource "aws_eip" "nat" { domain = "vpc" }
resource "aws_nat_gateway" "perf" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_sut.id     # NAT 는 public 서브넷(AZ-c)
  depends_on    = [aws_internet_gateway.perf]
  tags          = { Name = "htp-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.perf.id
  route { cidr_block = "0.0.0.0/0", gateway_id = aws_internet_gateway.perf.id }
  tags   = { Name = "htp-rt-public" }
}
resource "aws_route_table_association" "public_load" {
  subnet_id = aws_subnet.public_load.id, route_table_id = aws_route_table.public.id
}
resource "aws_route_table_association" "public_sut" {
  subnet_id = aws_subnet.public_sut.id, route_table_id = aws_route_table.public.id
}
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.perf.id
  route { cidr_block = "0.0.0.0/0", nat_gateway_id = aws_nat_gateway.perf.id }
  tags   = { Name = "htp-rt-private" }
}
resource "aws_route_table_association" "private_sut" {
  subnet_id = aws_subnet.private_sut.id, route_table_id = aws_route_table.private.id
}
```
> HCL 은 map/route 인자에 콤마를 안 쓴다 — 위 한 줄 표기는 가독용. 실제로는 각 인자 줄바꿈으로.

## §3. main.tf — Security Group 3개 (기존 `aws_security_group.perf` 삭제)
> **순환참조 주의**: cluster↔nlb 가 서로를 참조하므로 규칙은 `aws_vpc_security_group_ingress_rule`(별도 리소스)로 분리해 사이클을 끊는다.
```hcl
resource "aws_security_group" "cluster" {       # 3개 노드 전부
  name   = "htp-cluster"
  vpc_id = aws_vpc.perf.id
  egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}
resource "aws_vpc_security_group_ingress_rule" "cluster_self" {   # k3s intra-cluster 전체
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = aws_security_group.cluster.id
  ip_protocol                  = "-1"
}
resource "aws_vpc_security_group_ingress_rule" "cluster_from_nlb" { # NLB → sut NodePort
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = aws_security_group.nlb.id
  from_port = var.chat_nodeport
  to_port   = var.chat_nodeport
  ip_protocol = "tcp"
}

resource "aws_security_group" "harness_public" {  # harness 에만 부착 → 외부 노출 포트
  name   = "htp-harness-public"
  vpc_id = aws_vpc.perf.id
  dynamic "ingress" {
    for_each = [22, 30300, 30800]
    content {
      from_port=ingress.value to_port=ingress.value protocol="tcp"
      cidr_blocks=[var.allowed_cidr]
    }
  }
  egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}

resource "aws_security_group" "nlb" {             # NLB 부착 (NLB 도 SG 지원, provider ~>5)
  name   = "htp-nlb"
  vpc_id = aws_vpc.perf.id
  egress { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}
resource "aws_vpc_security_group_ingress_rule" "nlb_from_cluster" { # harness(k6) → NLB:80
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = aws_security_group.cluster.id
  from_port=80 to_port=80 ip_protocol="tcp"
}
```
> SSH bastion(harness→sut/deps:22)·Prometheus scrape 는 `cluster_self` 규칙(노드 간 전체 허용)으로 이미 커버됨.

## §4. main.tf — aws_instance 3대 수정
```hcl
resource "aws_instance" "harness" {
  # ...ami/type/key/user_data/root_block_device 유지...
  subnet_id                   = aws_subnet.public_load.id
  vpc_security_group_ids      = [aws_security_group.cluster.id, aws_security_group.harness_public.id]
  associate_public_ip_address = true
}
resource "aws_instance" "sut" {
  subnet_id              = aws_subnet.private_sut.id
  vpc_security_group_ids = [aws_security_group.cluster.id]
  depends_on             = [aws_route_table_association.private_sut] # NAT egress 준비 후 cloud-init
  # public IP 없음
}
resource "aws_instance" "deps" {
  subnet_id              = aws_subnet.private_sut.id
  vpc_security_group_ids = [aws_security_group.cluster.id]
  depends_on             = [aws_route_table_association.private_sut]
}
```
- `user_data` 는 그대로. agent 가 참조하는 `aws_instance.harness.private_ip` 는 같은 VPC 라 도달 OK.
- **중요**: private 노드 cloud-init 이 `get.k3s.io`/apt 를 받으므로 NAT 경로가 먼저 서야 함 → 위 depends_on 필수.

## §5. main.tf — NLB (신규)
```hcl
resource "aws_lb" "sut" {
  name                             = "htp-sut-nlb"
  internal                         = true
  load_balancer_type               = "network"
  subnets                          = [aws_subnet.public_sut.id]   # AZ-c
  security_groups                  = [aws_security_group.nlb.id]
  enable_cross_zone_load_balancing = true
}
resource "aws_lb_target_group" "sut" {
  name        = "htp-sut-tg"
  port        = var.chat_nodeport
  protocol    = "TCP"
  vpc_id      = aws_vpc.perf.id
  target_type = "instance"
  health_check { protocol = "TCP", port = tostring(var.chat_nodeport) }
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
  default_action { type = "forward", target_group_arn = aws_lb_target_group.sut.arn }
}
```
> NLB TG 는 chat pod 가 뜨기 전엔 unhealthy(정상). bootstrap 이 chat 배포한 뒤 healthy. k6 는 그 후 실행.

## §6. main.tf — null_resource.deploy 갱신
- `connection.host` 는 `aws_instance.harness.public_ip` 그대로(harness 는 여전히 public).
- `depends_on` 에 NLB/서브넷 추가, remote-exec 로 **NLB DNS 를 bootstrap 에 주입**:
```hcl
depends_on = [aws_instance.harness, aws_instance.sut, aws_instance.deps,
              aws_lb_listener.sut, aws_route_table_association.private_sut]
# 두 번째 remote-exec(clone→bootstrap) 를:
provisioner "remote-exec" {
  inline = [
    "sudo rm -rf /home/ubuntu/app",
    "git clone --depth 1 --branch ${var.repo_ref} ${var.repo_url} /home/ubuntu/app",
    "cd /home/ubuntu/app/perf/terraform && chmod +x bootstrap.sh && sudo CHAT_ENDPOINT='${aws_lb.sut.dns_name}:80' ./bootstrap.sh",
  ]
}
```
- `bootstrap.sh` 는 `CHAT_ENDPOINT` env 를 읽어 **k6 chat Job 이 쓸 chat base URL 로 주입**(configmap 또는 job env). 없으면 기존 cluster DNS 로 폴백하게 처리.

## §7. outputs.tf 갱신
```hcl
output "chat_nlb_dns" { value = aws_lb.sut.dns_name }   # k6 가 때리는 chat 엔드포인트(internal)
# harness_public_ip / grafana_url / control_url 유지
# ssh_commands: sut/deps 는 public IP 없음 → bastion(-J) 방식으로
output "ssh_commands" {
  value = {
    harness = "ssh -i <키.pem> ubuntu@${aws_instance.harness.public_ip}"
    sut     = "ssh -i <키.pem> -J ubuntu@${aws_instance.harness.public_ip} ubuntu@${aws_instance.sut.private_ip}"
    deps    = "ssh -i <키.pem> -J ubuntu@${aws_instance.harness.public_ip} ubuntu@${aws_instance.deps.private_ip}"
  }
}
```

## §8. k8s 매니페스트 변경 (Terraform 아님, 하지만 NLB 가 이것 없으면 무의미)
- `k8s/chat-*.yaml` (6종 전부) 의 Service:
  - `type: NodePort`, `nodePort: 30080`(= var.chat_nodeport), `externalTrafficPolicy: Local`.
  - 동시에 하나만 뜨므로 6종이 같은 30080 써도 충돌 없음. Local 이라 NLB instance-target 이 pod 있는 노드(sut)로 정확히 감.
- `k8s/k6-chat-job.yaml`: chat base URL 을 **NLB DNS** 로. bootstrap 이 `CHAT_ENDPOINT` 주입(§6). push 부하(k6-push)는 기존대로.
- 확인 포인트: chat pod 는 이미 `nodeSelector role=sut` 로 sut 고정 → TG 가 sut instance 만 attach 하는 것과 일치.

---

## 배포 순서 / 함정
1. **커밋+푸시 먼저** — harness 가 public repo 를 clone 하므로 변경은 push 돼 있어야 apply 에 반영됨(HCP CLI-driven).
2. NAT→route→private instance 순서(depends_on)로 private 노드 egress 확보. 안 그러면 cloud-init k3s 설치 실패.
3. NLB internal + `enable_dns_hostnames` → harness 에서 NLB DNS 해석/도달 가능해야 함(같은 VPC).
4. 첫 apply 시 NLB TG 는 chat 뜰 때까지 unhealthy — 정상. 컨트롤 패널로 chat 기동 후 k6 실행.
5. cross-zone on 이라 harness(AZ-a)→NLB(AZ-c) 는 의도된 cross-AZ hop.

## 롤백
- baseline 은 git 히스토리의 현행 `main.tf`(default VPC + 단일 self-rule SG). 네트워크 섹션 통째 revert 하면 원복.
- 비용 주의: NAT Gateway + EIP + NLB 는 상시 과금 → 테스트 후 `destroy` 필수(기존 런북대로 `aws` 로 0 검증).
```
