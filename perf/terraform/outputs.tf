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
  description = "노드별 SSH 접속 명령. sut/deps 는 public IP 가 없어 harness 를 bastion(-J)으로 경유."
  value = {
    # HCP 실행 시엔 private_key_path 가 비어 있으므로 로컬 키 경로 placeholder 로 표시.
    harness = "ssh -i ${local.ssh_key_hint} ubuntu@${aws_instance.harness.public_ip}"
    sut     = "ssh -i ${local.ssh_key_hint} -J ubuntu@${aws_instance.harness.public_ip} ubuntu@${aws_instance.sut.private_ip}"
    deps    = "ssh -i ${local.ssh_key_hint} -J ubuntu@${aws_instance.harness.public_ip} ubuntu@${aws_instance.deps.private_ip}"
  }
}

output "chat_nlb_dns" {
  description = "k6 가 때리는 chat 엔드포인트(internal NLB DNS). :80 → sut chat NodePort."
  value       = aws_lb.sut.dns_name
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
