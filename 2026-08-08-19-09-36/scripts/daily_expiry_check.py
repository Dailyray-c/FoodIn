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
        "Content-Type": "application/json"
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("record", data)


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
    """Build the push message. Returns (title, desp) or None if nothing to push."""
    expired_items = []
    expiring_items = []

    for p in products:
        status, days = get_expiry_status(p.get("expiryDate", ""), expiring_days)
        if status == "expired":
            expired_items.append((p, days))
        elif status == "expiring":
            expiring_items.append((p, days))

    if not expired_items and not expiring_items:
        return None

    title = f"食品库存提醒 | 过期{len(expired_items)}件 临期{len(expiring_items)}件"
    desp = "## 食品过期提醒\n\n"

    if expired_items:
        desp += f"### 已过期（{len(expired_items)} 件）\n\n"
        for p, days in expired_items:
            name = p.get("name", "未知商品")
            location = p.get("location", "未分类")
            qty = p.get("quantity", 1)
            desp += f"- **{name}**（{location}）x{qty} | 已过期 {abs(days)} 天\n"
        desp += "\n"

    if expiring_items:
        desp += f"### 即将过期（{len(expiring_items)} 件）\n\n"
        for p, days in expiring_items:
            name = p.get("name", "未知商品")
            location = p.get("location", "未分类")
            qty = p.get("quantity", 1)
            desp += f"- **{name}**（{location}）x{qty} | {days} 天后到期\n"
        desp += "\n"

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

    # Fetch data from jsonbin.io
    print(f"[{datetime.now(BJT).strftime('%Y-%m-%d %H:%M:%S')}] Fetching data from jsonbin.io...")
    try:
        data = fetch_jsonbin(api_key, bin_id)
    except Exception as e:
        print(f"ERROR: Failed to fetch data from jsonbin.io: {e}")
        sys.exit(1)

    products = data.get("products", [])
    settings = data.get("settings", {})
    expiring_days = settings.get("expiringDays", 7)

    print(f"  Total products: {len(products)}")
    print(f"  Expiring threshold: {expiring_days} days")

    # Build message
    msg = build_message(products, expiring_days)
    if msg is None:
        print("  No expiring or expired items. Skipping push.")
        return

    title, desp = msg
    print(f"  Title: {title}")

    # Send via Server Chan
    try:
        result = send_serverchan(sendkey, title, desp)
        if result.get("code") == 0:
            print("  Push sent successfully!")
        else:
            print(f"  Push failed: {result.get('message', 'Unknown error')}")
            sys.exit(1)
    except Exception as e:
        print(f"  Push failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
