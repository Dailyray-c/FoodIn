#!/usr/bin/env python3
"""
Daily Inventory Backup Script
Fetches the food inventory data from the cloud (Upstash Redis, 旧 jsonbin 作回退)
and saves a dated snapshot into the backups/ directory, then prunes old
snapshots (keeps the newest 30).

Required environment variables（两套取其一，优先 Upstash）:
  UPSTASH_REST_URL   - Upstash 数据库 REST URL（如 https://xxx-yyy-12345.upstash.io）
  UPSTASH_REST_TOKEN - Upstash REST Token
  JSONBIN_API_KEY    - （旧后端，回退用）jsonbin.io X-Master-Key
  JSONBIN_BIN_ID     - （旧后端，回退用）jsonbin.io Bin ID
"""

import os
import sys
import json
import gzip
import base64
import glob
import urllib.request
from datetime import datetime, timezone, timedelta

from cloud_io import resolve_backend, backend_name, missing_hint, fetch_cloud

BJT = timezone(timedelta(hours=8))
KEEP = 30
BACKUP_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backups")
)


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
    backend = resolve_backend()
    if not backend[0]:
        print("Missing cloud credentials.")
        print(missing_hint())
        sys.exit(1)
    print(f"Backend: {backend_name(backend[0])}")

    record = fetch_cloud(backend)
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
