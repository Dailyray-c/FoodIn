#!/usr/bin/env bash
# ============================================================
# FoodIn 仅推送 README 专用脚本  push-readme.sh
# ------------------------------------------------------------
# 场景：大版本已推完，只需单独补推 README.md（仓库文档）。
#
# 安全原则（沿用 push-safe.sh 的事故教训）：
#   1) 只 add 明确的一个文件 README.md，绝不用 git add . / -A，
#      不会误带其他 _ 调试产物或清理时移动产生的 D / ?? 改动。
#   2) 直连 GitHub 时强制清掉环境变量代理与 git http.proxy，
#      避免代理返回空 502 被误报成「推送成功」。
#   3) 用 FETCH_HEAD 的 OID 判活，空响应立即报错。
#   4) 全程 fetch + reset --mixed（不碰工作树文件），
#      遇到非快进（每日备份任务抢先提交）自动重演，不用 rebase。
#
# 用法：
#   ./push-readme.sh "docs: 更新 README 说明"
#   AUTO_YES=1 ./push-readme.sh "docs: 更新 README 说明"   # 非交互
# ============================================================

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

MSG="${1:-docs: 更新 README}"

# 统一远程操作包装：绕过代理直连 GitHub。
git_remote() {
  if GIT_HTTP_PROXY= GIT_HTTPS_PROXY= \
       NO_PROXY='*' no_proxy='*' \
       git -c http.proxy= -c https.proxy= "$@" 2>/tmp/foodin_git_err; then
    return 0
  fi
  echo "✗ 失败：$(tail -3 /tmp/foodin_git_err 2>/dev/null)"
  return 1
}

echo "[1/4] 拉取远程最新 ..."
if ! git_remote fetch origin master; then
  echo "✗ fetch 失败：GitHub 当前不可达（直连超时 / 代理 502）。"
  echo "   改动仍在本地工作树，网络恢复后重跑本脚本即可。"
  exit 1
fi

FETCH_OID=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null)
if [ -z "$FETCH_OID" ]; then
  echo "✗ fetch 看似成功，但未取到任何提交——极可能被代理拦截返回空响应（HTTP 502）。"
  echo "  请在本机能直连 GitHub 的终端重跑；先排查代理："
  echo "    env | grep -i proxy"
  echo "    git ls-remote origin        # 能列出 refs 即说明可达"
  exit 1
fi

echo "[2/4] 对齐到远程最新（工作树 README 改动保持不动）..."
if ! git reset --mixed "$FETCH_OID" 2>/dev/null; then
  git reset --mixed origin/master 2>/dev/null || { echo "✗ reset 失败，.git 可能已损坏。"; exit 1; }
fi

echo "[3/4] 仅暂存 README.md ..."
git add README.md
echo "待提交内容（应只有 README.md）："
git status --short README.md
echo ""

if [ "${AUTO_YES:-0}" = "1" ]; then
  ans="y"
else
  printf '确认仅提交并推送 README？(y/N) '
  read -r ans
fi
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消，未提交任何内容。"; exit 0; }

echo "[4/4] 提交并推送 ..."
if git commit -m "$MSG" && git_remote push origin master; then
  echo ""
  echo "✓ README 已推送。master 触发一次 deploy.yml 重建（README 不参与运行时，线上无变化，约 1 分钟完成）。"
  echo "  查看仓库：https://github.com/Dailyray-c/FoodIn"
else
  # 非快进：基于最新远程重演后重试，不用 rebase。
  echo "  ↻ 推送被拒绝（远程已有新提交），重新基于最新远程提交后重试 ..."
  if git_remote fetch origin master \
     && FETCH_OID2=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null) \
     && [ -n "$FETCH_OID2" ] \
     && git reset --mixed "$FETCH_OID2" \
     && git add README.md \
     && git commit -m "$MSG" \
     && git_remote push origin master; then
    echo ""
    echo "✓ README 已推送（已基于最新远程重演提交）。"
  else
    echo "✗ 推送失败。README 改动仍安全留在本地工作树，请排查网络后重跑（幂等，可重跑）。"
    exit 1
  fi
fi
