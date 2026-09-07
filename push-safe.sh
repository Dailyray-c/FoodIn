#!/usr/bin/env bash
# ============================================================
# FoodIn 安全推送脚本  push-safe.sh
# ------------------------------------------------------------
# 为什么需要它（2026-09-07 事故的教训）：
#
#   1) 代理 502：本机 HTTPS_PROXY=127.0.0.1:5498 对 github.com 经常返回
#      "CONNECT tunnel failed, response 502"，导致 push/fetch 失败。
#      → 本脚本先尝试「github 直连」，失败自动回退「系统代理」。
#
#   2) .git 被写坏：曾在网络不稳时执行 `git stash` + `git rebase` 组合，
#      操作被 SIGTERM 中断，造成 pack 数据文件与 refs/heads/master 丢失，
#      本地历史对象全部不可读（最终只能删 .git 重建）。
#      → 本脚本全程不使用 stash / rebase / reset --hard，
#        改用 fetch + reset --mixed（绝不改动工作树文件）。
#
#   3) 工作区有 200+ 个 `_` 前缀的调试脚本与截图，误用 `git add .`
#      会把它们全部入库。
#      → 本脚本只 add 明确列出的发布文件。
#
# 用法：
#   ./push-safe.sh "提交说明"
# 特性：
#   幂等 —— 失败后网络恢复直接重跑即可，不会产生重复提交。
# ============================================================

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

MSG="${1:-chore: 更新 FoodIn}"

# 统一的远程操作包装：先直连，失败再退回系统代理
git_remote() {
  if env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy \
       no_proxy="github.com,githubusercontent.com" \
       NO_PROXY="github.com,githubusercontent.com" \
       git "$@" 2>/tmp/foodin_git_err; then
    return 0
  fi
  echo "  ↻ 直连失败，改用系统代理重试 ..."
  if git "$@"; then
    return 0
  fi
  echo "✗ 失败：$(tail -2 /tmp/foodin_git_err 2>/dev/null)"
  return 1
}

echo "[1/6] 拉取远程最新 ..."
git_remote fetch origin master || {
  echo "✗ fetch 失败：GitHub 当前不可达（直连超时 / 代理 502）。"
  echo "   提交内容都还在本地工作树里，网络恢复后重跑本脚本即可。"
  exit 1
}

echo "[2/6] 对齐到远程最新（工作树文件保持不动）..."
if ! git reset --mixed origin/master; then
  echo "✗ reset 失败：.git 可能已损坏，请停止其他 git 操作并先修复。"
  exit 1
fi

echo "[3/6] 暂存发布文件 ..."
git add index.html service-worker.js styles.css
LATEST_V="$(ls -1d versions/v* 2>/dev/null | sort -V | tail -1)"
if [ -n "$LATEST_V" ]; then
  git add "$LATEST_V"
  echo "      版本副本: $LATEST_V"
fi

echo ""
echo "[4/6] 待提交内容（确认没有杂项混入）："
git status --short
echo ""
printf '确认以上文件无误并提交？(y/N) '
read -r ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消，未提交任何内容。"; exit 0; }

echo "[5/6] 提交 ..."
if ! git commit -m "$MSG"; then
  echo "（没有需要提交的改动，跳过推送。）"
  exit 0
fi

echo "[6/6] 推送 ..."
if git_remote push origin master; then
  echo ""
  echo "✓ 推送成功。GitHub Pages 约 1 分钟后生效："
  echo "  https://dailyray-c.github.io/FoodIn/"
else
  echo "✗ 推送失败。提交已安全留在本地，网络恢复后重跑本脚本即可（幂等）。"
  exit 1
fi
