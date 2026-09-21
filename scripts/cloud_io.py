#!/usr/bin/env python3
"""
云同步后端读写（脚本侧）

与 index.html 里的 cloudSync 保持同一套契约：
  Upstash Redis REST（当前后端）
    读  GET  {url}/get/{key}           -> {"result": "<字符串>" | null}
    写  POST {url}/set/{key}  body=值   -> {"result": "OK"}
    鉴权 Authorization: Bearer <token>
    ❗值必须走请求体：负载 gzip+base64 后有几十 KB，拼进 URL 路径会超长失败
  jsonbin（旧后端，仅作回退）
    读  GET  https://api.jsonbin.io/v3/b/{bin_id}/latest
    写  PUT  https://api.jsonbin.io/v3/b/{bin_id}

环境变量优先级：
  1) UPSTASH_REST_URL + UPSTASH_REST_TOKEN   （新，优先使用）
  2) JSONBIN_API_KEY  + JSONBIN_BIN_ID       （旧，回退；两套都没配才报错）
"""

import os
import sys
import json
import urllib.request
import urllib.error

# 必须与 index.html 的 CLOUD_DOC_KEY 完全一致，否则读到的是不同的键
DOC_KEY = "foodin:sync"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")


def resolve_backend():
    """按优先级挑选后端。返回 (kind, cfg)；都缺则 (None, {})。"""
    url = (os.environ.get("UPSTASH_REST_URL") or "").strip().rstrip("/")
    token = (os.environ.get("UPSTASH_REST_TOKEN") or "").strip()
    if url and token:
        return "upstash", {"url": url, "token": token}

    api_key = (os.environ.get("JSONBIN_API_KEY") or "").strip()
    bin_id = (os.environ.get("JSONBIN_BIN_ID") or "").strip()
    if api_key and bin_id:
        return "jsonbin", {"api_key": api_key, "bin_id": bin_id}

    return None, {}


def backend_name(kind):
    return {"upstash": "Upstash Redis", "jsonbin": "jsonbin.io"}.get(kind, "未知")


def missing_hint():
    return ("需要环境变量：UPSTASH_REST_URL + UPSTASH_REST_TOKEN"
            "（回退方案：JSONBIN_API_KEY + JSONBIN_BIN_ID）")


def fetch_cloud(backend):
    """读取云端记录，返回 dict。硬失败抛异常（与旧 fetch_jsonbin 行为一致）。"""
    kind, cfg = backend

    if kind == "upstash":
        req = urllib.request.Request(
            "{}/get/{}".format(cfg["url"], DOC_KEY),
            headers={"Authorization": "Bearer " + cfg["token"], "User-Agent": UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print("HTTP {} from Upstash REST".format(e.code))
            print("Response body: {}".format(body[:500]))
            raise Exception("HTTP {}: {}".format(e.code, body[:200]))

        if isinstance(data, dict) and data.get("error"):
            raise Exception("Upstash error: {}".format(data["error"]))

        raw = data.get("result") if isinstance(data, dict) else None
        if raw is None:
            raise ValueError(
                "Upstash 里还没有键 {} —— 云端是空的，先在 App 里成功同步一次再跑本脚本".format(DOC_KEY)
            )
        if isinstance(raw, (dict, list)):
            # 极少数情况 SDK/接口会直接返回结构化对象
            record = raw
        else:
            record = json.loads(raw)
        if not isinstance(record, dict):
            raise ValueError("云端记录不是对象")
        return record

    if kind == "jsonbin":
        req = urllib.request.Request(
            "https://api.jsonbin.io/v3/b/{}/latest".format(cfg["bin_id"]),
            headers={
                "X-Master-Key": cfg["api_key"],
                "Content-Type": "application/json",
                "User-Agent": UA,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print("HTTP {} from jsonbin.io".format(e.code))
            print("Response body: {}".format(body[:500]))
            raise Exception("HTTP {}: {}".format(e.code, body[:200]))

        record = data.get("record", data)
        if record is None:
            raise ValueError("jsonbin returned an empty record (bin is empty)")
        if not isinstance(record, dict):
            raise ValueError("jsonbin record is not an object")
        return record

    raise ValueError("未配置云后端：" + missing_hint())


def put_cloud(backend, data):
    """
    写回云端。失败**只告警不抛异常**（沿用旧 update_last_push_date 的行为：
    写回 lastPushDate 失败不应让整次推送任务失败）。返回是否成功。
    """
    kind, cfg = backend
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")

    if kind == "upstash":
        req = urllib.request.Request(
            "{}/set/{}".format(cfg["url"], DOC_KEY),
            data=body,
            method="POST",
            headers={
                "Authorization": "Bearer " + cfg["token"],
                "Content-Type": "text/plain",
                "User-Agent": UA,
            },
        )
    elif kind == "jsonbin":
        req = urllib.request.Request(
            "https://api.jsonbin.io/v3/b/{}".format(cfg["bin_id"]),
            data=body,
            method="PUT",
            headers={
                "X-Master-Key": cfg["api_key"],
                "Content-Type": "application/json",
                "User-Agent": UA,
            },
        )
    else:
        print("  WARN: 未配置云后端，跳过写回")
        return False

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")
        # Upstash 即使 HTTP 200 也可能在响应体里带 error
        try:
            j = json.loads(text)
            if isinstance(j, dict) and j.get("error"):
                print("  WARN: 云端拒绝写入: {}".format(j["error"]))
                return False
        except Exception:
            pass
        return True
    except urllib.error.HTTPError as e:
        b = e.read().decode("utf-8", errors="replace")
        print("  WARN: 写回云端失败 (HTTP {}): {}".format(e.code, b[:200]))
        return False
    except Exception as e:
        print("  WARN: 写回云端失败: {}".format(e))
        return False
