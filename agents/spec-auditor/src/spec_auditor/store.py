"""セッションの保存・読み込み。

途中で中断しても人間判断からやり直せるよう、各段の後で保存する。
セッションには仕様書由来の本文（マスキング前の原文引用を含む）が入るため、
0600 で書き出す。
"""

from __future__ import annotations

import json
import os
import pathlib

from .models import Session


class StoreError(RuntimeError):
    pass


def save_session(session: Session, path: pathlib.Path) -> pathlib.Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(session.to_dict(), ensure_ascii=False, indent=2)
    tmp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, data.encode("utf-8"))
    finally:
        os.close(fd)
    os.replace(tmp, path)
    return path


def load_session(path: pathlib.Path) -> Session:
    if not path.is_file():
        raise StoreError(f"セッションファイルが見つかりません: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StoreError(f"セッションファイルが壊れています: {path} ({exc})") from None
    if not isinstance(data, dict):
        raise StoreError(f"セッションファイルの形式が不正です: {path}")
    return Session.from_dict(data)


def write_text(path: pathlib.Path, text: str, *, mode: int = 0o600) -> pathlib.Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    try:
        os.write(fd, text.encode("utf-8"))
    finally:
        os.close(fd)
    return path
