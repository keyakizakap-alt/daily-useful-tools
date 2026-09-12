"""LLM クライアントの共通インターフェース。

パイプラインはこのインターフェースにしか依存しない。OrcaRouter は
OpenAI 互換なので、自己ホストの OrcaRouter Lite や他の互換ゲートウェイへ
``--base-url`` だけで差し替えられる。テストでは MockChatClient を使う。
"""

from __future__ import annotations

import re
from typing import Protocol


class LLMError(RuntimeError):
    pass


class ChatClient(Protocol):
    model: str

    def complete_json(self, *, system: str, user: str, purpose: str) -> str:
        """JSON オブジェクトを返すよう指示して 1 往復する。応答本文を返す。"""
        ...


_ID_RE = re.compile(r"\b(REQ|FND)-[0-9a-f]{8}\b")


class MockChatClient:
    """テスト・オフライン確認用。purpose ごとに決め打ちの応答を返す。

    要件 id は実行のたびに変わるため、応答テンプレートには ``__REQ1__``
    ``__FND2__`` のような番号付きトークンを書ける。プロンプトに現れた
    id を出現順に割り当てて置換する。
    """

    def __init__(self, responses: dict[str, str], model: str = "mock/echo") -> None:
        self.model = model
        self.session_id = ""
        self._responses = responses
        self.calls: list[tuple[str, str, str]] = []

    def complete_json(self, *, system: str, user: str, purpose: str) -> str:
        self.calls.append((purpose, system, user))
        if purpose not in self._responses:
            raise LLMError(f"MockChatClient に purpose={purpose!r} の応答が登録されていません。")
        return self._substitute(self._responses[purpose], user)

    @staticmethod
    def _substitute(template: str, user: str) -> str:
        seen: dict[str, list[str]] = {"REQ": [], "FND": []}
        for match in _ID_RE.finditer(user):
            prefix, value = match.group(1), match.group(0)
            if value not in seen[prefix]:
                seen[prefix].append(value)
        out = template
        for prefix, values in seen.items():
            for index, value in enumerate(values, start=1):
                out = out.replace(f"__{prefix}{index}__", value)
        return out
