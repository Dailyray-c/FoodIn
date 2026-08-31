#!/usr/bin/env python3
"""
Daily Expiry Check Script
Reads food inventory data from jsonbin.io, checks for expiring/expired items,
and pushes a notification to WeChat via Server Chan (sct.ftqq.com).

Required environment variables:
  JSONBIN_API_KEY  - jsonbin.io X-Master-Key
  JSONBIN_BIN_ID   - jsonbin.io Bin ID
  SERVERCHAN_SENDKEY - sct.ftqq.com SendKey
"""

import os
import sys
import json
import gzip
import base64
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# Beijing timezone (UTC+8)
BJT = timezone(timedelta(hours=8))


def fetch_jsonbin(api_key, bin_id):
    """Fetch data from jsonbin.io."""
    url = f"https://api.jsonbin.io/v3/b/{bin_id}/latest"
    req = urllib.request.Request(url, headers={
        "X-Master-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("record", data)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} from jsonbin.io")
        print(f"Response body: {body[:500]}")
        raise Exception(f"HTTP {e.code}: {body[:200]}")


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


def update_last_push_date(api_key, bin_id, data, today_str):
    """Write lastPushDate back to jsonbin so same-day reruns skip."""
    data["lastPushDate"] = today_str
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.jsonbin.io/v3/b/{bin_id}",
        data=body,
        method="PUT",
        headers={
            "X-Master-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            json.loads(resp.read().decode("utf-8"))
        print(f"  lastPushDate updated -> {today_str}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  WARN: failed to update lastPushDate (HTTP {e.code}): {body[:200]}")
    except Exception as e:
        print(f"  WARN: failed to update lastPushDate: {e}")


def get_expiry_status(expiry_date_str, expiring_days):
    """
    Returns (status, days_diff) where:
      status = 'expired' | 'expiring' | 'normal'
      days_diff = days until expiry (negative = already expired)
    """
    if not expiry_date_str:
        return ("normal", None)
    try:
        expiry = datetime.strptime(expiry_date_str, "%Y-%m-%d").replace(tzinfo=BJT)
    except (ValueError, TypeError):
        return ("normal", None)
    today = datetime.now(BJT).replace(hour=0, minute=0, second=0, microsecond=0)
    diff = (expiry - today).days
    if diff < 0:
        return ("expired", diff)
    elif diff <= expiring_days:
        return ("expiring", diff)
    return ("normal", diff)


def build_message(products, expiring_days):
    """Build the push message (方案 B: 分块卡片式). Always returns (title, desp)."""
    expired_items = []
    expiring_items = []

    for p in products:
        status, days = get_expiry_status(p.get("expiryDate", ""), expiring_days)
        if status == "expired":
            expired_items.append((p, days))
        elif status == "expiring":
            expiring_items.append((p, days))

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
            desp += f"**{name}** x{qty}\n\n"
            desp += f"> {location} · 已过期 {abs(days)} 天 · 建议丢弃\n\n"
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


def send_serverchan(sendkey, title, desp):
    """Send message via Server Chan."""
    url = f"https://sctapi.ftqq.com/{sendkey}.send"
    data = urllib.parse.urlencode({"title": title, "desp": desp}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result


def main():
    api_key = os.environ.get("JSONBIN_API_KEY")
    bin_id = os.environ.get("JSONBIN_BIN_ID")
    sendkey = os.environ.get("SERVERCHAN_SENDKEY")

    if not all([api_key, bin_id, sendkey]):
        print("ERROR: Missing required environment variables.")
        print("Required: JSONBIN_API_KEY, JSONBIN_BIN_ID, SERVERCHAN_SENDKEY")
        sys.exit(1)

    today_str = datetime.now(BJT).strftime("%Y-%m-%d")

    # Fetch data from jsonbin.io
    print(f"[{datetime.now(BJT).strftime('%Y-%m-%d %H:%M:%S')}] Fetching data from jsonbin.io...")
    try:
        data = fetch_jsonbin(api_key, bin_id)
    except Exception as e:
        print(f"ERROR: Failed to fetch data from jsonbin.io: {e}")
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

    # Build message (always returns a message — heartbeat if nothing expiring)
    msg = build_message(products, expiring_days)
    title, desp = msg
    print(f"  Title: {title}")

    # Send via Server Chan
    try:
        result = send_serverchan(sendkey, title, desp)
        if result.get("code") == 0:
            print("  Push sent successfully!")
            # v3 结构：写回外层包裹（不重新压缩、不污染内层）；旧结构：写回顶层
            update_last_push_date(api_key, bin_id, outer, today_str)
        else:
            print(f"  Push failed: {result.get('message', 'Unknown error')}")
            sys.exit(1)
    except Exception as e:
        print(f"  Push failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
