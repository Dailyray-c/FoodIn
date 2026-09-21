#!/usr/bin/env bash
# ============================================================
# FoodIn 清理后「完整」推送脚本  push-clean.sh
# ------------------------------------------------------------
# 场景：工作区清理整理后，把「应进仓库」的全部改动一次性安全推送。
#
# 安全原则（沿用 push-safe.sh 事故教训 + 本次敏感信息核查）：
#   1) 绝不 `git add .` / `git add -A`。
#      - `git add -u` 仅更新【已跟踪】文件改动（含清理时把根目录文件移到
#        docs/ 产生的「删除」+ README/UI规范/push-safe 的修改），不碰未跟踪。
#      - 再显式 add 新增目录：docs/、历史副本 versions/、CI 脚本 scripts/
#        （v2.35.0 补：scripts/ 曾漏掉，导致新增的 cloud_io.py 不会入库 →
#         GitHub Actions 报 ModuleNotFoundError），另含 proxy/、push-readme.sh。
#   2) 提交前护栏：扫描暂存区文件名，命中敏感/本地数据模式立即中止，绝不提交：
#        *真实数据* / *库存备份_* / node_modules/ / .workbuddy/ / _paddle_models/
#        / _test_imgs/ / *.bak
#   3) 直连 GitHub 强制清代理 + FETCH_HEAD OID 判活；非快进重演重试；不用 rebase/stash。
#   4) 不碰 .gitignore 已屏蔽项（node_modules/.workbuddy/调试产物等）。
#
# 用法：./push-clean.sh "chore: 清理工作区 + 补充 README/规范/文档"
#       AUTO_YES=1 ./push-clean.sh "..."   # 非交互
# ============================================================

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
MSG="${1:-chore: 清理工作区 + 补充 README/规范/文档}"

git_remote() {
  if GIT_HTTP_PROXY= GIT_HTTPS_PROXY= \
       NO_PROXY='*' no_proxy='*' \
       git -c http.proxy= -c https.proxy= "$@" 2>/tmp/foodin_git_err; then
    return 0
  fi
  echo "✗ 失败：$(tail -3 /tmp/foodin_git_err 2>/dev/null)"
  return 1
}

echo "[1/5] 拉取远程最新 ..."
if ! git_remote fetch origin master; then
  echo "✗ fetch 失败：GitHub 不可达（直连超时 / 代理 502）。改动仍在工作树，网络恢复后重跑。"
  exit 1
fi
FETCH_OID=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null)
[ -z "$FETCH_OID" ] && { echo "✗ fetch 空响应（疑似代理 502 假成功），请本机直连重跑。"; exit 1; }

echo "[2/5] 对齐远程（工作树改动保持不动）..."
git reset --mixed "$FETCH_OID" 2>/dev/null || git reset --mixed origin/master 2>/dev/null || { echo "✗ reset 失败，.git 可能损坏。"; exit 1; }

echo "[3/5] 暂存清理后的全部改动 ..."
git add -u                                   # 已跟踪变更（含根目录文件移到 docs/ 的删除 + README/UI规范/push-safe 修改）
git add docs/ versions/ proxy/ scripts/ push-readme.sh   # 新增：文档目录 / 历史副本 / 百度OCR代理服务 / 新脚本

# 护栏：暂存区不得含敏感/本地数据
BAD=""
while IFS= read -r f; do
  case "$f" in
    *真实数据*|*库存备份_*|node_modules/*|.workbuddy/*|_paddle_models/*|_test_imgs/*|*.bak)
      BAD="${BAD}${f}"$'\n' ;;
  esac
done < <(git diff --cached --name-only)
if [ -n "$BAD" ]; then
  echo "✗ 危险：暂存区混入不应提交的文件，已中止提交："
  printf '%s\n' "$BAD"
  echo "   请排查后不要强制推送。"
  exit 1
fi

echo "待提交内容（确认无敏感/无调试产物）："
git status --short
echo ""
if [ "${AUTO_YES:-0}" = "1" ]; then ans="y"; else printf '确认以上为清理后工作区内容并提交推送？(y/N) '; read -r ans; fi
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消。"; exit 0; }

echo "[4/5] 提交 ..."
git commit -m "$MSG" || { echo "（无新改动，跳过。）"; exit 0; }

echo "[5/5] 推送 ..."
if git_remote push origin master; then
  echo "✓ 推送成功，GitHub Pages 约 1 分钟生效：https://dailyray-c.github.io/FoodIn/"
else
  echo "  ↻ 非快进，重演后重试 ..."
  if git_remote fetch origin master \
     && F2=$(git rev-parse -q --verify FETCH_HEAD 2>/dev/null) && [ -n "$F2" ] \
     && git reset --mixed "$F2" \
     && git add -u \
     && git add docs/ versions/ proxy/ scripts/ push-readme.sh \
     && git commit -m "$MSG" \
     && git_remote push origin master; then
    echo "✓ 推送成功（已基于最新远程重演）。"
  else
    echo "✗ 推送失败，改动安全留在工作树，请排查网络后重跑（幂等）。"
    exit 1
  fi
fi
