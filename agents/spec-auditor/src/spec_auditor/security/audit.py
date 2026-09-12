"""監査ログ。

「いつ・どの文書を・どのモデルへ・何バイト送り・人が何を承認したか」を
JSONL で追記する。各行は前行のハッシュを含むチェーンになっており、
途中の行を書き換えたり消したりすると ``verify_chain`` で検出できる。

プロンプト本文そのものは既定では残さない（残せば監査ログ自体が
機密の塊になるため）。残るのは SHA-256 と長さだけ。
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import pathlib
from typing import Any

GENESIS = "0" * 64


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _entry_hash(prev: str, body: dict[str, Any]) -> str:
    payload = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256((prev + payload).encode("utf-8")).hexdigest()


class AuditLog:
    def __init__(self, path: pathlib.Path | str) -> None:
        self.path = pathlib.Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    # --- 書き込み -----------------------------------------------------
    def _last_hash(self) -> str:
        if not self.path.is_file() or self.path.stat().st_size == 0:
            return GENESIS
        last = None
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    last = line
        if not last:
            return GENESIS
        try:
            return json.loads(last)["hash"]
        except (json.JSONDecodeError, KeyError):
            return GENESIS

    def record(self, event: str, **fields: Any) -> dict[str, Any]:
        body = {"ts": _now(), "event": event, **fields}
        prev = self._last_hash()
        entry = {**body, "prev": prev, "hash": _entry_hash(prev, body)}
        line = json.dumps(entry, ensure_ascii=False, sort_keys=True)
        # 追記のみ。ログを後から書き換えないことをファイル権限でも示す。
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, (line + "\n").encode("utf-8"))
        finally:
            os.close(fd)
        return entry

    # --- 検証 ---------------------------------------------------------
    def verify_chain(self) -> tuple[bool, str]:
        if not self.path.is_file():
            return True, "監査ログはまだありません。"
        prev = GENESIS
        for line_no, line in enumerate(self.path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                return False, f"{line_no} 行目が JSON として壊れています。"
            body = {k: v for k, v in entry.items() if k not in {"prev", "hash"}}
            if entry.get("prev") != prev:
                return False, f"{line_no} 行目の prev が直前行のハッシュと一致しません（欠落または改ざん）。"
            if entry.get("hash") != _entry_hash(prev, body):
                return False, f"{line_no} 行目の内容がハッシュと一致しません（改ざん）。"
            prev = entry["hash"]
        return True, "監査ログのハッシュチェーンは整合しています。"
