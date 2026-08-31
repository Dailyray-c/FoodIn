#!/usr/bin/env python3
"""
Daily Inventory Backup Script
Fetches the food inventory data from jsonbin.io and saves a dated snapshot
into the backups/ directory, then prunes old snapshots (keeps the newest 30).

Required environment variables:
  JSONBIN_API_KEY  - jsonbin.io X-Master-Key
  JSONBIN_BIN_ID   - jsonbin.io Bin ID
"""

import os
import sys
import json
import gzip
import base64
import glob
import urllib.request
from datetime import datetime, timezone, timedelta

BJT = timezone(timedelta(hours=8))
KEEP = 30
BACKUP_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backups")
)


def fetch_jsonbin(api_key, bin_id):
    """Fetch the record payload from jsonbin.io (same pattern as daily_expiry_check.py)."""
    url = f"https://api.jsonbin.io/v3/b/{bin_id}/latest"
    req = urllib.request.Request(url, headers={
        "X-Master-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    record = data.get("record", data)
    if record is None:
        raise ValueError("jsonbin returned an empty record (bin is empty)")
    if not isinstance(record, dict):
        raise ValueError("jsonbin record is not an object")
    return record


def decode_record(record):
    """v3 gzip 压缩结构解压为 v2 等价结构；旧平铺结构原样返回。"""
    if (
        isinstance(record, dict)
        and record.get("schemaVersion") == 3
        and record.get("compressed")
        and record.get("data")
    ):
        try:
            raw = base64.b64decode(record["data"])
            return json.loads(gzip.decompress(raw).decode("utf-8"))
        except Exception as e:
            print(f"  WARN: failed to decompress v3 record: {e}")
            return record
    return record


def main():
    api_key = os.environ.get("JSONBIN_API_KEY", "")
    bin_id = os.environ.get("JSONBIN_BIN_ID", "")
    if not api_key or not bin_id:
        print("Missing JSONBIN_API_KEY or JSONBIN_BIN_ID")
        sys.exit(1)

    record = fetch_jsonbin(api_key, bin_id)
    inner = decode_record(record)   # v2.17.1+ 云端是 v3 gzip，解压后才是可读数据

    today = datetime.now(BJT).strftime("%Y-%m-%d")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dated_path = os.path.join(BACKUP_DIR, f"inventory-{today}.json")
    latest_path = os.path.join(BACKUP_DIR, "latest.json")

    content = json.dumps(inner, ensure_ascii=False, indent=2).encode("utf-8")
    with open(dated_path, "wb") as f:
        f.write(content)
    with open(latest_path, "wb") as f:
        f.write(content)

    # Prune old dated snapshots (keep the newest KEEP)
    dated_files = sorted(
        glob.glob(os.path.join(BACKUP_DIR, "inventory-*.json")),
        reverse=True
    )
    removed = 0
    for path in dated_files[KEEP:]:
        os.remove(path)
        removed += 1

    snapshot = inner.get("snapshot") or {}
    products = inner.get("products")
    if not isinstance(products, list):
        products = snapshot.get("products") or []
    records = inner.get("records")
    if not isinstance(records, list):
        records = snapshot.get("records") or []
    print(f"Backup saved: {dated_path}")
    print(f"  items: products={len(products)}, records={len(records)}")
    print(f"  lastModified: {inner.get('lastModified', 'N/A')}")
    print(f"  kept {min(len(dated_files), KEEP)} snapshots, removed {removed} old")


if __name__ == "__main__":
    main()
