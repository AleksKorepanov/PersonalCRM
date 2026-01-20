from __future__ import annotations

import base64
import json
from typing import Any, Dict, Optional


def encode_cursor(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> Dict[str, Any]:
    padding = "=" * ((4 - len(cursor) % 4) % 4)
    raw = base64.urlsafe_b64decode((cursor + padding).encode("ascii"))
    return json.loads(raw.decode("utf-8"))


def next_cursor_if_any(next_payload: Optional[Dict[str, Any]]) -> Optional[str]:
    return encode_cursor(next_payload) if next_payload else None
