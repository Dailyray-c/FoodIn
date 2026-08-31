#!/usr/bin/env python3
"""Migrate old version food inventory JSON to current version format."""

import json
import os

INPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "库存备份_2026_8_9_old.json")
# We'll read from the user-provided file directly
USER_INPUT = r"C:\Users\Administrator\xwechat_files\wxid_39t6ex6frb1j22_5003\msg\file\2026-08\库存备份_2026_8_9.json"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "库存备份_迁移后.json")


def ms_to_iso(ms):
    """Convert millisecond timestamp to ISO 8601 string."""
    if not ms:
        return ""
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    # Format as ISO string matching JS new Date().toISOString()
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def migrate():
    with open(USER_INPUT, "r", encoding="utf-8") as f:
        old = json.load(f)

    # Build a lookup map from itemId -> item (for barcode lookup in records)
    item_map = {}
    for item in old.get("items", []):
        item_map[item["id"]] = item

    # --- Migrate products (items -> products) ---
    new_products = []
    for item in old.get("items", []):
        product = {
            "id": item.get("id", ""),
            "name": item.get("name", ""),
            "barcode": item.get("barcode", ""),
            "location": item.get("location", ""),
            "stockInDate": item.get("purchaseDate", ""),  # purchaseDate -> stockInDate
            "productionDate": item.get("produceDate", ""),  # produceDate -> productionDate
            "expiryDate": item.get("expiryDate", ""),
            "shelfLife": item.get("shelfLifeDays", ""),  # shelfLifeDays -> shelfLife
            "quantity": item.get("quantity", 0),
            "createdAt": ms_to_iso(item.get("createdAt", 0)),
            "updatedAt": ms_to_iso(item.get("createdAt", 0)),  # Use createdAt as updatedAt
        }
        new_products.append(product)

    # --- Migrate records ---
    new_records = []
    for rec in old.get("records", []):
        # Look up barcode from item map
        item_ref = item_map.get(rec.get("itemId", ""))
        barcode = item_ref.get("barcode", "") if item_ref else ""

        rtype = rec.get("type", "")
        delta = rec.get("delta", 0)

        # Build detail string matching current version's style
        if rtype == "in":
            detail = f"入库 {'+' + str(delta) if delta >= 0 else str(delta)}"
        elif rtype == "eat":
            detail = f"正常吃完 {delta}"
        elif rtype == "adjust":
            detail = "属性调整"
        elif rtype == "waste":
            detail = f"浪费丢弃 {delta}"
        else:
            detail = rec.get("detail", "")

        # If record has location info and item not found, include it in detail
        if not item_ref and rec.get("location"):
            detail += f"（位置：{rec['location']}）"

        record = {
            "id": rec.get("id", ""),
            "type": rtype,
            "productId": rec.get("itemId", ""),  # itemId -> productId
            "productName": rec.get("itemName", ""),  # itemName -> productName
            "barcode": barcode,
            "quantity": delta,  # delta -> quantity
            "detail": detail,
            "createdAt": ms_to_iso(rec.get("timestamp", 0)),  # timestamp -> createdAt
        }
        new_records.append(record)

    # --- Build output ---
    result = {
        "products": new_products,
        "records": new_records,
        "settings": {
            "version": "1.4.0",
            "expiringDays": 7,
            "cloudApiKey": "",
            "cloudBinId": "",
            "cloudSyncEnabled": False,
            "cloudLastSync": "",
            "serverChanKey": "",
        },
        "exportDate": "2026-08-09T00:00:00.000Z",
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Print summary
    print(f"Migration complete!")
    print(f"  Products: {len(new_products)}")
    print(f"  Records:  {len(new_records)}")
    print(f"  Output:   {OUTPUT_PATH}")

    # Print any records that reference items not in items array
    orphan_records = [r for r in old.get("records", []) if r.get("itemId") not in item_map]
    if orphan_records:
        print(f"\n  Note: {len(orphan_records)} records reference items no longer in inventory (already consumed/deleted):")
        for r in orphan_records:
            print(f"    - {r.get('itemName', '?')} ({r.get('type', '?')})")


if __name__ == "__main__":
    migrate()
