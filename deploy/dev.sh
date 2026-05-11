#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_ROOT"

echo "==> 启动 DEV 环境"
echo "    项目目录: $PROJECT_ROOT"
echo ""

docker compose up --build "$@"
