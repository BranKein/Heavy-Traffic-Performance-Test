# 마스터 컨트롤 서버 이미지 (Node + kubectl + docker CLI).
#   - k8s 모드   : in-cluster kubectl 로 perf 네임스페이스의 Job/Deployment 제어
#   - docker 모드 : host docker.sock 에 붙어 k6 컨테이너 제어 (docker-compose 스택용)
FROM node:20-alpine

RUN apk add --no-cache curl docker-cli postgresql-client \
 && KVER="$(curl -sL https://dl.k8s.io/release/stable.txt)" \
 && curl -sLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KVER}/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl

WORKDIR /app
COPY server.mjs db.mjs ./
COPY public ./public

ENV PORT=8088 PERF_ORCH=k8s NAMESPACE=perf PROM_URL=http://prometheus:9090
EXPOSE 8088
CMD ["node", "server.mjs"]
