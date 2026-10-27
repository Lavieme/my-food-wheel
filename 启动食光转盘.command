#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 20 或更新版本，再重新打开此文件。"
  read -r "reply?按回车退出…"
  exit 1
fi
node server.mjs
read -r "reply?服务已停止，按回车关闭窗口…"
