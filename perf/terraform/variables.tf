variable "region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

# ── 노드별 인스턴스 타입 ────────────────────────────────────────────────
# harness: 관측(prometheus/grafana/cadvisor) + perf-control + k6 부하기. 측정 대상이
#          아니므로 버스터블(t3) 허용. sut/deps: 측정/의존 부하를 받으므로 반드시
#          고정 성능(c6i) — t3 는 CPU 크레딧 소진 시 스로틀링돼 벤치마크가 왜곡됨.
variable "harness_instance_type" {
  description = "harness 노드(k3s server): 관측 + 컨트롤 + k6"
  type        = string
  default     = "t3.xlarge" # 4 vCPU / 16 GiB
}

variable "sut_instance_type" {
  description = "sut 노드(k3s agent): 테스트 대상 1개만. 고정 성능 필수."
  type        = string
  default     = "c6i.large" # 2 vCPU / 4 GiB (SUT 는 1vCPU/2Gi 로 제한, 나머지는 kubelet 헤드룸)
}

variable "deps_instance_type" {
  description = "deps 노드(k3s agent): postgres + fake-push×5. 고정 성능 필수."
  type        = string
  default     = "c6i.xlarge" # 4 vCPU / 8 GiB
}

variable "key_name" {
  description = "기존 EC2 키페어 이름 (SSH 접속 및 provisioner 용)"
  type        = string
}

# 개인키 주입 (provisioner SSH 용). 둘 중 하나만 채우면 된다:
#  - 로컬 실행: private_key_path 에 .pem 파일 경로 (기존 방식)
#  - HCP 원격 실행: private_key_pem 에 키 "내용"(PEM 텍스트)을 sensitive 변수로 주입
#    (원격 러너엔 로컬 파일이 없으므로 경로 대신 내용을 넘긴다)
variable "private_key_path" {
  description = "키페어 개인키 파일 경로 (로컬 실행용). HCP 에선 비우고 private_key_pem 사용."
  type        = string
  default     = ""
}

variable "private_key_pem" {
  description = "키페어 개인키 내용(PEM 텍스트). HCP sensitive 변수로 주입. 로컬에선 비워도 됨."
  type        = string
  default     = ""
  sensitive   = true
}

# 배포 코드는 harness 노드가 GitHub public repo 에서 직접 clone 한다(러너 파일시스템 비의존
# → 로컬/HCP 원격 실행 모두 동일하게 동작). repo 는 public 이어야 익명 clone 가능.
variable "repo_url" {
  description = "배포 소스(perf/)를 담은 public git repo URL. harness 가 clone 한다."
  type        = string
  default     = "https://github.com/BranKein/Heavy-Traffic-Performance-Test.git"
}

variable "repo_ref" {
  description = "clone 할 브랜치/태그. 배포 전 이 ref 로 commit+push 되어 있어야 한다."
  type        = string
  default     = "main"
}

variable "allowed_cidr" {
  description = "SSH/Grafana/컨트롤패널 접근 허용 CIDR. 본인 IP 로 좁히는 것을 권장 (예: 1.2.3.4/32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "root_volume_gb" {
  description = "루트 볼륨 크기(GB)."
  type        = number
  default     = 30
}

# ── Multi-AZ 네트워크 (NLB 앞단) ────────────────────────────────────────
# 단일 VPC / 단일 k3s 클러스터를 유지하되 AZ 만 분리한다:
#  - harness(부하기)는 az_load(AZ-a) → 요청 경로에 cross-AZ RTT 반영
#  - sut/deps/NLB/NAT 는 az_sut(AZ-c) → SUT↔DB 가 cross-AZ 되지 않게(측정 오염 방지)
variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_load" {
  description = "부하기(harness) AZ. 요청 경로에 cross-AZ RTT 를 반영하기 위해 sut 와 다른 AZ."
  type        = string
  default     = "ap-northeast-2a"
}

variable "az_sut" {
  description = "sut + deps + NLB + NAT AZ. SUT↔DB 를 same-AZ 로 묶어 DB 지연 오염 방지."
  type        = string
  default     = "ap-northeast-2c"
}

variable "chat_nodeport" {
  description = "SUT chat 서버 NodePort (NLB target). k8s chat Service 의 nodePort 와 반드시 일치."
  type        = number
  default     = 30080
}

