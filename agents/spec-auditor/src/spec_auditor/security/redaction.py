"""秘匿情報のマスキング。

外部の LLM ゲートウェイへ本文を送る前に、機微情報をプレースホルダへ置換する。
対応表はプロセス内（およびセッションファイル）にしか持たず、送信しない。
完全な検知は原理的に不可能なので、これは「多層防御の 1 枚目」であって
唯一の防御ではない。機密度の高い文書は self-host した OrcaRouter Lite など
外に出ない経路と併用すること。
"""

from __future__ import annotations

import dataclasses
import re

# (ラベル, 正規表現) の順に適用する。順序に意味がある。
# 鍵類を先に潰し、桁数の多い CARD を MYNUMBER/PHONE より先に見る
# （そうしないと 16 桁のカード番号の一部が 12 桁として拾われる）。
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("APIKEY", re.compile(r"\b(?:sk-orca-|sk-|ghp_|gho_|github_pat_|AKIA|ASIA)[A-Za-z0-9_\-]{12,}\b")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b")),
    ("URLCRED", re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s/@]+:[^\s/@]+@[^\s]+")),
    ("EMAIL", re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")),
    ("CARD", re.compile(r"(?<![0-9\-])(?:\d[ \-]?){12,18}\d(?![0-9\-])")),
    ("MYNUMBER", re.compile(r"(?<!\d)(?<!\d[ \-])\d{4}[ \-]?\d{4}[ \-]?\d{4}(?![ \-]?\d)(?!-)")),
    ("PHONE", re.compile(r"(?<!\d)(?<!\d[ \-])0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}(?![ \-]?\d)")),
]

# CARD は Luhn を通ったものだけ置換する（伝票番号などの誤爆を減らす）。
_LUHN_LABELS = {"CARD"}


def _luhn_ok(digits: str) -> bool:
    nums = [int(c) for c in digits if c.isdigit()]
    if not 13 <= len(nums) <= 19:
        return False
    total, parity = 0, len(nums) % 2
    for i, n in enumerate(nums):
        if i % 2 == parity:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


@dataclasses.dataclass
class RedactionResult:
    text: str
    mapping: dict[str, str]           # placeholder -> 元の文字列（ローカル保持のみ）
    counts: dict[str, int]            # ラベル -> 置換件数

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    def restore(self, text: str) -> str:
        """LLM 応答に紛れ込んだプレースホルダを元へ戻す（レポート表示用）。"""
        for placeholder, original in self.mapping.items():
            text = text.replace(placeholder, original)
        return text


def redact(text: str) -> RedactionResult:
    mapping: dict[str, str] = {}
    reverse: dict[str, str] = {}
    counts: dict[str, int] = {}

    def make_sub(label: str):
        def _sub(match: re.Match[str]) -> str:
            value = match.group(0)
            if label in _LUHN_LABELS and not _luhn_ok(value):
                return value
            if value in reverse:
                return reverse[value]
            counts[label] = counts.get(label, 0) + 1
            placeholder = f"[[{label}_{counts[label]:03d}]]"
            mapping[placeholder] = value
            reverse[value] = placeholder
            return placeholder

        return _sub

    out = text
    for label, pattern in _PATTERNS:
        out = pattern.sub(make_sub(label), out)
    return RedactionResult(text=out, mapping=mapping, counts=counts)


def restore_all(obj, mapping: dict[str, str]):
    """dict / list / str を再帰的に走査してプレースホルダを復元する。"""
    if isinstance(obj, str):
        for placeholder, original in mapping.items():
            obj = obj.replace(placeholder, original)
        return obj
    if isinstance(obj, list):
        return [restore_all(v, mapping) for v in obj]
    if isinstance(obj, dict):
        return {k: restore_all(v, mapping) for k, v in obj.items()}
    return obj
