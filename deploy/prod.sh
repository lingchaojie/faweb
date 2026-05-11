#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/production" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "错误: 找不到 $ENV_FILE"
  echo ""
  echo "请先创建环境配置文件:"
  echo "  cp $DEPLOY_DIR/.env.production.example $ENV_FILE"
  echo "  然后编辑 $ENV_FILE 填入正式的密码和域名"
  exit 1
fi

cd "$DEPLOY_DIR"

echo "==> 启动 PRD 环境"
echo "    部署目录: $DEPLOY_DIR"
echo "    环境文件: $ENV_FILE"
echo ""

docker compose --env-file .env.production up --build -d "$@"

echo ""
echo "==> PRD 环境已启动"
docker compose --env-file .env.production ps
