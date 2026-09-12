"""LLM 応答の厳格な検証。

モデルの出力は「未検証の入力」として扱う。JSON として構造を検証し、
想定のキー・型・長さ・語彙に収まるものだけを通す。eval / exec や
シェル実行は一切行わない。
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_FIELD_CHARS = 2_000
MAX_ITEMS = 200


class ResponseError(ValueError):
    pass


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json_object(raw: str) -> dict[str, Any]:
    """応答本文から JSON オブジェクトを取り出す。

    素直に json.loads できなければ、コードフェンス内 → 最初の {...} の順に
    1 回だけ救済を試みる。それでも駄目なら例外にする（推測で埋めない）。
    """
    text = (raw or "").strip()
    for candidate in _json_candidates(text):
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ResponseError("応答を JSON オブジェクトとして解釈できませんでした。")


def _json_candidates(text: str):
    yield text
    fence = _FENCE.search(text)
    if fence:
        yield fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        yield text[start : end + 1]


def require_list(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = payload.get(key)
    if value is None:
        raise ResponseError(f"応答に必須キー {key!r} がありません。")
    if not isinstance(value, list):
        raise ResponseError(f"{key!r} は配列である必要があります（実際: {type(value).__name__}）。")
    if len(value) > MAX_ITEMS:
        raise ResponseError(f"{key!r} の件数が上限 {MAX_ITEMS} を超えています（{len(value)} 件）。")
    rows = [row for row in value if isinstance(row, dict)]
    return rows


def clean_str(value: Any, *, default: str = "", limit: int = MAX_FIELD_CHARS) -> str:
    """文字列フィールドを安全な形に整える。"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        value = str(value)
    if not isinstance(value, str):
        return default
    from .sanitize import normalize

    out = normalize(value).strip()
    if len(out) > limit:
        out = out[: limit - 3] + "..."
    return out or default


def clean_str_list(value: Any, *, limit: int = 50) -> list[str]:
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:limit]:
        text = clean_str(item)
        if text:
            out.append(text)
    return out


def clean_enum(value: Any, allowed: set[str], *, default: str) -> str:
    text = clean_str(value)
    return text if text in allowed else default


def escape_markdown(text: str) -> str:
    """レポートへ差し込む前に、Markdown / HTML として解釈されうる文字を無害化する。

    LLM 出力や仕様書本文がリンクや画像、生 HTML に化けるのを防ぐ。
    """
    out = text.replace("\\", "\\\\")
    # [ と ] を潰せばリンク・画像記法は成立しないので、丸括弧までは潰さない
    # （潰すと日本語の文が読みにくくなる）。
    for char in ("`", "*", "_", "[", "]", "<", ">", "|", "#"):
        out = out.replace(char, "\\" + char)
    return out.replace("\n", " ")
