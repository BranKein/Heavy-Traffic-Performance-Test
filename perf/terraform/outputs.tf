output "harness_public_ip" {
  description = "harness 노드(k3s server) 퍼블릭 IP — Grafana/컨트롤패널이 여기로 노출"
  value       = aws_instance.harness.public_ip
}

output "node_private_ips" {
  description = "노드별 프라이빗 IP"
  value = {
    harness = aws_instance.harness.private_ip
    sut     = aws_instance.sut.private_ip
    deps    = aws_instance.deps.private_ip
  }
}

output "ssh_commands" {
  description = "노드별 SSH 접속 명령"
  value = {
    # HCP 실행 시엔 private_key_path 가 비어 있으므로 로컬 키 경로 placeholder 로 표시.
    harness = "ssh -i ${local.ssh_key_hint} ubuntu@${aws_instance.harness.public_ip}"
    sut     = "ssh -i ${local.ssh_key_hint} ubuntu@${aws_instance.sut.public_ip}"
    deps    = "ssh -i ${local.ssh_key_hint} ubuntu@${aws_instance.deps.public_ip}"
  }
}

locals {
  ssh_key_hint = var.private_key_path != "" ? var.private_key_path : "<개인키.pem 경로>"
}

output "grafana_url" {
  description = "Grafana 대시보드 URL"
  value       = "http://${aws_instance.harness.public_ip}:30300"
}

output "control_url" {
  description = "마스터 컨트롤 패널 URL (테스트 시작/중지/조회)"
  value       = "http://${aws_instance.harness.public_ip}:30800"
}
