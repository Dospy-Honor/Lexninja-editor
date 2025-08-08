#!/bin/bash

echo "正在启动后端服务..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 启动后端服务
node "$SCRIPT_DIR/src/server.js" &

echo "请在支持的浏览器中打开 index.html 查看前端页面"
