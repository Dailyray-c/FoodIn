#!/usr/bin/env python3
"""
Daily Expiry Check Script
Reads food inventory data from the cloud (Upstash Redis, 旧 jsonbin 作回退),
checks for expiring/expired items, and pushes a notification to WeChat / WeCom.

Required environment variables（两套取其一，优先 Upstash）:
  UPSTASH_REST_URL   - Upstash 数据库 REST URL（如 https://xxx-yyy-12345.upstash.io）
  UPSTASH_REST_TOKEN - Upstash REST Token
  JSONBIN_API_KEY    - （旧后端，回退用）jsonbin.io X-Master-Key
  JSONBIN_BIN_ID     - （旧后端，回退用）jsonbin.io Bin ID

Push channels (at least one must be configured; both may be used together):
  WECOM_WEBHOOKS      - 企业微信群机器人 Webhook 地址（可多个，英文逗号分隔）
                        格式 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
                        群聊推送走这条 —— 群里所有成员都能收到，可用手机号 @ 指定人。
  SERVERCHAN_SENDKEY  - sct.ftqq.com SendKey（可选，私聊推给自己，保留向后兼容）

v2.34.5 变更：新增企业微信群机器人通道（支持多群），Server酱 降级为可选。
v2.34.6 变更：企微消息改为「分层瘦身 + 单行压缩」，默认不再截断（详见 build_wecom_markdown）。
v2.35.0 变更：数据源由 jsonbin 换成 Upstash Redis（旧 jsonbin 保留为回退）；推送通道与 Webhook 配置不变。
"""

import os
import sys
import json
import gzip
import base64
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

from cloud_io import resolve_backend, backend_name, missing_hint, fetch_cloud, put_cloud

# Beijing timezone (UTC+8)
BJT = timezone(timedelta(hours=8))


def decode_record(record):
    """
    v2.17.1 起 App 端云端结构为 v3 gzip 压缩：
      { schemaVersion: 3, compressed: true, algo: 'gzip', data: <base64> }
    这里解压为 v2 等价结构 { schemaVersion: 2, events, snapshot, ... }；
    旧平铺结构（{ products, settings, ... }）原样返回。
    返回 (inner, outer)：inner 为业务数据，outer 为待写回云端的完整包裹。
    """
    if (
        isinstance(record, dict)
        and record.get("schemaVersion") == 3
        and record.get("compressed")
        and record.get("data")
    ):
        try:
            raw = base64.b64decode(record["data"])
            inner = json.loads(gzip.decompress(raw).decode("utf-8"))
            return inner, record
        except Exception as e:
            print(f"  WARN: failed to decompress v3 record: {e}")
            return record, record
    return record, record


def update_last_push_date(backend, data, today_str):
    """把 lastPushDate 写回云端，供同日重跑跳过（读写细节统一由 cloud_io 处理）。"""
    data["lastPushDate"] = today_str
    if put_cloud(backend, data):
        print(f"  lastPushDate updated -> {today_str}")


def get_expiry_status(expiry_date_str, expiring_days):
    """
    Returns (status, days_diff) where:
      status = 'expired' | 'expiring' | 'normal'
      days_diff = days until expiry (negative = already expired)

    v2.26.1 修复（与 App 端对齐）：分界改为 diff <= 0 → expired。
    此前这里用 diff < 0 → expired、diff <= expiring_days → expiring，导致「今天到期」的商品
    在本脚本里算「临期」（推送「剩 0 天 · 优先食用」），而 App 内 getExpiryStatus 把它算
    expired（首页红色「今天到期」）。同一天、同一商品两边结论相反，推送计数与统计页必然对不上。
    现与 App 对齐：今天是到期日即视为过期（App 既有约定），文案侧再对 0 天单独措辞。
    """
    if not expiry_date_str:
        return ("normal", None)
    try:
        expiry = datetime.strptime(expiry_date_str, "%Y-%m-%d").replace(tzinfo=BJT)
    except (ValueError, TypeError):
        return ("normal", None)
    today = datetime.now(BJT).replace(hour=0, minute=0, second=0, microsecond=0)
    diff = (expiry - today).days
    if diff <= 0:
        return ("expired", diff)
    elif diff <= expiring_days:
        return ("expiring", diff)
    return ("normal", diff)


def collect_expiry(products, expiring_days):
    """把商品按状态分好组，供两套渲染器复用（避免重复遍历）。"""
    expired_items = []
    expiring_items = []
    for p in products:
        status, days = get_expiry_status(p.get("expiryDate", ""), expiring_days)
        if status == "expired":
            expired_items.append((p, days))
        elif status == "expiring":
            expiring_items.append((p, days))
    return expired_items, expiring_items


def build_message(products, expiring_days):
    """Server酱 版消息（方案 B: 分块卡片式）。Always returns (title, desp)."""
    expired_items, expiring_items = collect_expiry(products, expiring_days)

    total = len(products)
    expired_count = len(expired_items)
    expiring_count = len(expiring_items)

    # Heartbeat: no expiring or expired items
    if not expired_items and not expiring_items:
        now_str = datetime.now(BJT).strftime("%Y-%m-%d %H:%M")
        title = f"✅ 食品库存正常 | 共{total}件在库"
        desp = "## ✅ 今日厨房一切正常\n\n"
        desp += f"检查时间：**{now_str}**\n\n"
        desp += f"在库商品：**{total} 件**\n\n"
        desp += "当前无过期、无临期商品，放心享用。\n\n"
        desp += "---\n由 GitHub Actions 每日自动推送（心跳通知）"
        return (title, desp)

    # Reminder message
    title = f"⚠️ 食品库存提醒 | 过期{expired_count}件 临期{expiring_count}件"
    desp = "## 今日厨房提醒\n\n"
    desp += f"汇总：过期 **{expired_count}** 件 · 临期 **{expiring_count}** 件 · 在库 **{total}** 件\n\n"
    desp += "---\n\n"

    if expired_items:
        desp += f"### 🚨 已过期（{expired_count} 件）\n\n"
        for p, days in expired_items:
            name = p.get("name", "未知商品")
            location = p.get("location", "未分类")
            qty = p.get("quantity", 1)
            # v2.26.1：diff==0（今天到期）也归入 expired（与 App 对齐），但文案区分开，
            # 避免出现「已过期 0 天」这种自相矛盾的表述
            if days == 0:
                note = "今天到期 · 建议今日处理"
            else:
                note = f"已过期 {abs(days)} 天 · 建议丢弃"
            desp += f"**{name}** x{qty}\n\n"
            desp += f"> {location} · {note}\n\n"
        desp += "---\n\n"

    if expiring_items:
        desp += f"### ⏰ 即将过期（{expiring_count} 件）\n\n"
        for p, days in expiring_items:
            name = p.get("name", "未知商品")
            location = p.get("location", "未分类")
            qty = p.get("quantity", 1)
            desp += f"**{name}** x{qty}\n\n"
            desp += f"> {location} · 剩 {days} 天 · 优先食用\n\n"

    desp += "---\n由 GitHub Actions 每日自动推送"

    return (title, desp)


WECOM_MAX_BYTES = 4096


def _wecom_compose(products, expiring_days, expired_items, expiring_items,
                   lines_body, style):
    """
    按指定 style 组装整条消息。

    style: 'full' | 'no_loc' | 'name_only'
      full      - `**名**x数量 · 位置 · 状态·动作`   ← 信息最全
      no_loc    - `**名**x数量 · 状态·动作`          ← 砍位置
      name_only - `**名**x数量 · 状态`               ← 只留名称/数量/天数

    ❗每件商品压成**一行**（原为「名称行 + 引用块行」两行）：
      单件从 ~55 字节降到 ~40 字节，且省掉一次换行。30 件时省下约 500 字节，
      是「能否不截断塞进 4096」的关键。
    ❗`action`（丢弃 / 优先吃 / 今天处理）是用户真正要的决策信息，
      瘦身时**最后才砍**；位置反而优先砍掉 —— 位置可以进 App 查，该不该吃不能。
    ❗`lines_body` 为每组最多显示件数；超出时追加一行「…另 N 件见 App」。
    """
    total = len(products)
    expired_count = len(expired_items)
    expiring_count = len(expiring_items)

    out = []
    out.append("### ⚠️ 食品库存提醒")
    out.append(f"> 过期 **{expired_count}** · 临期 **{expiring_count}** · 在库 **{total}**")
    out.append("")

    groups = (
        (expired_items, expiring_count, "**🚨 已过期 {}**", True),
        (expiring_items, expired_count, "**⏰ 即将过期 {}**", False),
    )

    for items, _other, head_fmt, is_expired in groups:
        if not items:
            continue
        out.append(head_fmt.format(len(items)))
        for i, (p, days) in enumerate(items):
            if i >= lines_body:
                out.append(f"<font color=\"comment\">…另 {len(items) - i} 件见 App</font>")
                break
            name = p.get("name", "未知商品")
            qty = p.get("quantity", 1)
            if days == 0:
                state, action = "今天到期", "今天处理"
            elif is_expired:
                state, action = f"过期{abs(days)}天", "丢弃"
            else:
                state, action = f"剩{days}天", "优先吃"
            if style == "full":
                loc = p.get("location", "未分类")
                out.append(f"**{name}**x{qty} · {loc} · {state}·{action}")
            elif style == "no_loc":
                out.append(f"**{name}**x{qty} · {state}·{action}")
            else:
                out.append(f"**{name}**x{qty} · {state}")
        out.append("")

    return "\n".join(out)


def build_wecom_markdown(products, expiring_days):
    """
    企业微信群机器人 版消息（Markdown）。

    与 Server酱 版的格式差异（企微渲染规则更严格，必须单独适配）：
      - 企微只认 `###` 一种标题，`##` 不生效 → 全部降为 `###`
      - 企微不支持 `---` 分割线 → 用空行分隔
      - 企微支持 `> ` 引用块；颜色用 `<font color="info|warning|comment">`
      - ❗企微 markdown **不支持** @成员；要 @ 得改用 text 类型（见 send_wecom 的说明）

    ❗4096 字节是**硬上限**（UTF-8）。超了接口直接报错、整条消息发不出去 ——
      比截断更糟。所以容量策略是「**分层瘦身，尽量不截断**」：
        ①`full`    信息最全（含位置）
        ②`no_loc`  砍掉位置字段
        ③`name_only` 只留名称/数量/天数
      ← 逐级降级，取第一个能在 4096 内**完整装下全部商品**的方案。
      只有连最瘦的 `name_only` 都装不下时，才按件数截断（并明确告知还剩几件）。

    这样做的意义：宁可单条信息略简，也不让用户在推送里看到「清单被截断」——
    推送的价值在于「一眼知道要处理什么」，断在半截反而不知道漏了什么。

    返回 markdown 字符串（企微 markdown 没有独立标题字段，标题以 `### ` 行内呈现）。
    """
    expired_items, expiring_items = collect_expiry(products, expiring_days)

    total = len(products)

    # ---- 心跳：无过期无临期 ----
    if not expired_items and not expiring_items:
        now_str = datetime.now(BJT).strftime("%m-%d %H:%M")
        lines = [
            "### ✅ 食品库存正常",
            f"> 检查 **{now_str}** · 在库 **{total}** 件",
            "",
            "无过期、无临期，放心吃。",
        ]
        return "\n".join(lines)

    # ---- 分层瘦身：取第一个能完整装下的方案 ----
    for style in ("full", "no_loc", "name_only"):
        md = _wecom_compose(products, expiring_days, expired_items,
                            expiring_items, lines_body=10 ** 6, style=style)
        n = len(md.encode("utf-8"))
        if n <= WECOM_MAX_BYTES:
            print(f"  wecom md: {n} bytes (style={style}, 全部 {len(expired_items)+len(expiring_items)} 件完整装下)")
            return md

    # ---- 兜底：连最瘦方案都装不下 → 按件数截断 ----
    lo, hi = 0, max(len(expired_items), len(expiring_items))
    best_lo = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        md = _wecom_compose(products, expiring_days, expired_items,
                            expiring_items, lines_body=mid, style="name_only")
        if len(md.encode("utf-8")) <= WECOM_MAX_BYTES:
            best_lo = mid
            lo = mid + 1
        else:
            hi = mid - 1

    md = _wecom_compose(products, expiring_days, expired_items,
                        expiring_items, lines_body=best_lo, style="name_only")
    n = len(md.encode("utf-8"))
    shown = min(best_lo, len(expired_items)) + min(best_lo, len(expiring_items))
    print(f"  WARN: 商品过多，已按件数截断（显示 {shown} 件，style=name_only，{n} bytes）")
    return md


def send_serverchan(sendkey, title, desp):
    """Send message via Server Chan."""
    url = f"https://sctapi.ftqq.com/{sendkey}.send"
    data = urllib.parse.urlencode({"title": title, "desp": desp}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result


def send_wecom(webhook_url, markdown):
    """
    向企业微信群机器人 Webhook 发送 markdown 消息。

    返回 (ok: bool, detail: str)。
    企微返回 {"errcode":0,"errmsg":"ok"} 才算成功；
    常见错误码：93000 无效 key / 45009 频率超限（20 条每分钟）。

    ❗为什么用 markdown 而不是 text：
      企微的 markdown 支持加粗与引用块，手机上看「商品名 + 位置·天数」层次清楚；
      text 类型虽可 @成员，但会把整段挤成一坨纯文本。
      本项目一条推送只发一次，不需要 @ 人，故 markdown 更合适。
      若今后确实需要 @人，改用 text 并填 mentioned_mobile_list 即可。
    """
    payload = json.dumps({"msgtype": "markdown", "markdown": {"content": markdown}}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return False, f"HTTP {e.code}: {body[:200]}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

    if result.get("errcode") == 0:
        return True, "ok"
    return False, f"errcode={result.get('errcode')} errmsg={result.get('errmsg')}"



def main():
    backend = resolve_backend()
    sendkey = (os.environ.get("SERVERCHAN_SENDKEY") or "").strip()
    raw_hooks = (os.environ.get("WECOM_WEBHOOKS") or "").strip()

    # v2.34.5：推送通道改为「至少配一个」。企微群是主通道，Server酱 可选。
    webhooks = [u.strip() for u in raw_hooks.replace("\n", ",").split(",") if u.strip()]
    if not backend[0] or (not webhooks and not sendkey):
        print("ERROR: Missing required environment variables.")
        print("Cloud: " + missing_hint())
        print("Push (at least one): WECOM_WEBHOOKS (可多个，逗号分隔) / SERVERCHAN_SENDKEY")
        sys.exit(1)

    print(f"  Cloud backend: {backend_name(backend[0])}")

    print(f"  Push targets: wecom x{len(webhooks)}" + (", serverchan" if sendkey else ""))
    for i, u in enumerate(webhooks):
        # 只打印 key 前 8 位，避免完整 Webhook 出现在公开的 Actions 日志里
        key = urllib.parse.urlparse(u).query.replace("key=", "")
        print(f"    [{i+1}] ...{key[:8]}***{key[-4:] if len(key) > 12 else ''}")

    today_str = datetime.now(BJT).strftime("%Y-%m-%d")

    # Fetch data from cloud
    print(f"[{datetime.now(BJT).strftime('%Y-%m-%d %H:%M:%S')}] Fetching data from {backend_name(backend[0])}...")
    try:
        data = fetch_cloud(backend)
    except Exception as e:
        print(f"ERROR: Failed to fetch data from cloud: {e}")
        sys.exit(1)

    # Same-day dedup: if already pushed today, skip
    inner, outer = decode_record(data)
    last_push = inner.get("lastPushDate", "") or outer.get("lastPushDate", "")
    if last_push == today_str:
        print(f"  Already pushed today ({today_str}). Skipping this run.")
        return

    # v2.17.1+ 新结构：商品/设置在 snapshot 内；旧平铺结构：直接读顶层（向后兼容）
    snapshot = inner.get("snapshot") or {}
    products = inner.get("products")
    if not isinstance(products, list):
        products = snapshot.get("products") or []
    settings = inner.get("settings")
    if not isinstance(settings, dict):
        settings = snapshot.get("settings") or {}
    expiring_days = settings.get("expiringDays", 7)

    print(f"  Total products: {len(products)}")
    print(f"  Expiring threshold: {expiring_days} days")

    # 两个通道各自渲染（格式不同），有临期时都发提醒、无临期时都发心跳
    title, desp = build_message(products, expiring_days)
    wecom_md = build_wecom_markdown(products, expiring_days)
    print(f"  Title: {title}")

    any_ok = False
    failures = []

    # ---- 企业微信群机器人（主通道，可多个）----
    for i, url in enumerate(webhooks):
        try:
            ok, detail = send_wecom(url, wecom_md)
        except Exception as e:
            ok, detail = False, f"{type(e).__name__}: {e}"
        if ok:
            print(f"  [wecom {i+1}/{len(webhooks)}] Push sent successfully!")
            any_ok = True
        else:
            print(f"  [wecom {i+1}/{len(webhooks)}] Push failed: {detail}")
            failures.append(f"wecom#{i+1}: {detail}")

    # ---- Server酱（可选，向后兼容）----
    if sendkey:
        try:
            result = send_serverchan(sendkey, title, desp)
            if result.get("code") == 0:
                print("  [serverchan] Push sent successfully!")
                any_ok = True
            else:
                msg = result.get("message", "Unknown error")
                print(f"  [serverchan] Push failed: {msg}")
                failures.append(f"serverchan: {msg}")
        except Exception as e:
            print(f"  [serverchan] Push failed: {e}")
            failures.append(f"serverchan: {e}")

    # 全部通道都失败才算失败（任一成功就不重复推第二天，避免漏推或重复轰炸）
    if not any_ok:
        print("ERROR: All push channels failed.")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    if failures:
        print(f"  WARN: 部分通道失败（其余已成功）：{'; '.join(failures)}")

    # v3 结构：写回外层包裹（不重新压缩、不污染内层）；旧结构：写回顶层
    update_last_push_date(backend, outer, today_str)



if __name__ == "__main__":
    main()
