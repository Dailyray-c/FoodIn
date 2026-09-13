#!/usr/bin/env bash
# ============================================================
# FoodIn 安全推送脚本  push-safe.sh  (v2.29.3 加固版)
# ------------------------------------------------------------
# 设计原则（源自 2026-09-07 / 09-11 两次事故的教训，绝不再犯）：
#
#   1) 绝不 `git add .` / `git add -A` —— 只 add 明确列出的发布文件，
#      避免把 _ 前缀调试产物 / 旧截图 / 演示 html 误入库。
#
#   2) 绝不 `git stash` + `git rebase` 组合（曾因 SIGTERM 中断写坏 .git，
#      本地历史全部不可读，最终只能删库重建）。
#      本脚本全程只用 fetch + reset --mixed（不碰工作树文件）；
#      遇到非快进（每日备份任务抢先提交）改用
#      「重新对齐远程 → 重新提交 → 重新推送」，完全不用 rebase。
#
#   3) 代理假成功：必须同时清掉「环境变量代理」和「git http.proxy」，
#      直连失败时明确报错，绝不回退到会被 502 静默吞掉的代理分支。
#      （2026-09-11 事故：代理返回空 502，git 收到假 200 误报「✓ 推送成功」，
#       实际远端根本没收到提交。）
#
# 用法：
#   ./push-safe.sh "提交说明"
#   AUTO_YES=1 ./push-safe.sh "提交说明"   # 非交互（CI / 自动化用）
# ============================================================

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

MSG="${1:-chore: 更新 FoodIn}"

# 统一的远程操作包装：始终绕过代理直连 GitHub，并显式清除 git 代理配置。
git_remote() {
  if GIT_HTTP_PROXY= GIT_HTTPS_PROXY= \
       NO_PROXY='*' no_proxy='*' \
       git -c http.proxy= -c https.proxy= "$@" 2>/tmp/foodin_git_err; then
    return 0
  fi
  echo "✗ 失败：$(tail -3 /tmp/foodin_git_err 2>/dev/null)"
  return 1
}

# 仅发布这些文件（绝不包含 _ 前缀调试产物 / versions 历史副本以外的杂项）。
PUBLISH_FILES=(index.html service-worker.js styles.css UI规范.md push-safe.sh .gitignore scripts/daily_expiry_check.py)

echo "[1/6] 拉取远程最新 ..."
if ! git_remote fetch origin master; then
  echo "✗ fetch 失败：GitHub 当前不可达（直连超时 / 代理 502）。"
  echo "   提交内容都还在本地工作树里，网络恢复后重跑本脚本即可。"
  exit 1
fi

# 校验 fetch 确实取到了提交：代理返回空 502 时 git 会误报成功，
# 此时 FETCH_HEAD 不存在/为空，必须显式报错，避免下一步 reset 出现
# 晦涩的 "ambiguous argument 'origin/master' / 'FETCH_HEAD'"。
FETCH_OID=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null)
if [ -z "$FETCH_OID" ]; then
  echo "✗ fetch 看似成功，但未取到任何提交——极可能被代理拦截返回了空响应（HTTP 502）。"
  echo "  请在本机能直连 GitHub 的终端重跑；先排查代理："
  echo "    env | grep -i proxy"
  echo "    git ls-remote origin        # 能列出 refs 即说明可达"
  exit 1
fi

echo "[2/6] 对齐到远程最新（工作树文件保持不动）..."
if ! git reset --mixed "$FETCH_OID"; then
  echo "✗ reset 失败：.git 可能已损坏，请停止其他 git 操作并先修复。"
  exit 1
fi

# CI 每日提交的 backups/ 本地常落后于远程，还原到 HEAD，绝不动它。
git checkout -- backups/ 2>/dev/null || true

echo "[3/6] 暂存发布文件 ..."
git add "${PUBLISH_FILES[@]}"
LATEST_V="$(ls -1d versions/v* 2>/dev/null | sort -V | tail -1)"
if [ -n "$LATEST_V" ]; then
  git add "$LATEST_V"
  echo "      版本副本: $LATEST_V"
fi

echo ""
echo "[4/6] 待提交内容（确认没有杂项混入）："
git status --short
echo ""
if [ "${AUTO_YES:-0}" = "1" ]; then
  ans="y"
else
  printf '确认以上文件无误并提交？(y/N) '
  read -r ans
fi
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
  # 非快进（推送窗口内被每日备份任务抢先提交）：重新对齐到最新远程，
  # 把本次发布「重演」到最新提交之上，再推。全程不用 rebase，绝不写坏 .git。
  echo "  ↻ 推送被拒绝（远程已有新提交），重新基于最新远程提交后重试 ..."
  if git_remote fetch origin master \
     && FETCH_OID2=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null) \
     && [ -n "$FETCH_OID2" ] \
     && git reset --mixed "$FETCH_OID2" \
     && git add "${PUBLISH_FILES[@]}" \
     && [ -n "$LATEST_V" ] && git add "$LATEST_V" \
     && git commit -m "$MSG" \
     && git_remote push origin master; then
    echo ""
    echo "✓ 推送成功（已基于最新远程重演提交）。GitHub Pages 约 1 分钟后生效："
    echo "  https://dailyray-c.github.io/FoodIn/"
  else
    echo "✗ 推送失败。提交已安全留在本地；请排查网络后重跑本脚本（幂等，可重跑）。"
    exit 1
  fi
fi
