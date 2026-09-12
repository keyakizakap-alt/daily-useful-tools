"""OrcaRouter（OpenAI 互換 /v1/chat/completions）クライアント。

依存ライブラリを増やさないため標準ライブラリのみで実装している
（サプライチェーンの攻撃面を増やさないことも狙い）。

確認した仕様（2026-09-12 時点 / 一次情報ではなく公開情報からの確認）:
  base_url          https://api.orcarouter.ai/v1
  認証              Authorization: Bearer <ORCAROUTER_API_KEY>
  モデル ID         provider/model 形式（例 orcarouter/auto, anthropic/claude-opus-4.7）
自己ホスト（OrcaRouter Lite）を使う場合は ORCAROUTER_BASE_URL を差し替える。
"""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request

from ..config import Config
from ..security.audit import AuditLog, sha256_text
from ..security.policy import Budget
from .base import LLMError

_RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4


class OrcaRouterClient:
    def __init__(
        self,
        config: Config,
        *,
        budget: Budget,
        audit: AuditLog | None = None,
        session_id: str = "",
    ) -> None:
        if config.api_key is None:
            raise LLMError("APIキーが設定されていません。")
        self._config = config
        self.model = config.model
        self._budget = budget
        self._audit = audit
        self.session_id = session_id  # 監査ログ用。セッション確定後に設定される。
        # 証明書検証は常に有効。企業プロキシの CA は SSL_CERT_FILE 等で渡す。
        self._ssl_context = ssl.create_default_context()

    @property
    def endpoint(self) -> str:
        return f"{self._config.base_url}/chat/completions"

    def complete_json(self, *, system: str, user: str, purpose: str) -> str:
        self._budget.charge(len(system) + len(user))

        payload = {
            "model": self.model,
            "temperature": self._config.temperature,
            "max_tokens": self._config.max_output_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        if self._audit:
            self._audit.record(
                "llm_request",
                session=self.session_id,
                purpose=purpose,
                host=self._config.host,
                model=self.model,
                chars=len(system) + len(user),
                prompt_sha256=sha256_text(system + "\n" + user),
            )

        text = self._post(body)
        content = self._extract_content(text)

        if self._audit:
            self._audit.record(
                "llm_response",
                session=self.session_id,
                purpose=purpose,
                chars=len(content),
                response_sha256=sha256_text(content),
            )
        return content

    # --- HTTP ---------------------------------------------------------
    def _post(self, body: bytes) -> str:
        last_error: Exception | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            request = urllib.request.Request(
                self.endpoint,
                data=body,
                method="POST",
                headers={
                    "Authorization": f"Bearer {self._config.api_key.reveal()}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "spec-auditor/1.0",
                },
            )
            try:
                with urllib.request.urlopen(
                    request, timeout=self._config.timeout_sec, context=self._ssl_context
                ) as response:
                    return response.read().decode("utf-8")
            except urllib.error.HTTPError as exc:
                detail = self._safe_detail(exc)
                if exc.code in {401, 403}:
                    raise LLMError(
                        f"認証に失敗しました（HTTP {exc.code}）。ORCAROUTER_API_KEY を確認してください。"
                    ) from None
                if exc.code not in _RETRYABLE_STATUS or attempt == _MAX_ATTEMPTS:
                    raise LLMError(f"LLM 呼び出しが失敗しました（HTTP {exc.code}）: {detail}") from None
                last_error = exc
            except urllib.error.URLError as exc:
                if attempt == _MAX_ATTEMPTS:
                    raise LLMError(f"LLM エンドポイントへ接続できません: {exc.reason}") from None
                last_error = exc
            time.sleep(min(2 ** attempt, 16))
        raise LLMError(f"LLM 呼び出しに繰り返し失敗しました: {last_error}")

    @staticmethod
    def _safe_detail(exc: urllib.error.HTTPError) -> str:
        """エラー本文を短く切って返す。鍵が echo される実装もあるため長文は載せない。"""
        try:
            raw = exc.read().decode("utf-8", "replace")
        except Exception:  # pragma: no cover - 読めなければ理由だけ
            return exc.reason or "詳細不明"
        return raw[:300].replace("\n", " ")

    @staticmethod
    def _extract_content(text: str) -> str:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            raise LLMError("LLM の応答が JSON ではありませんでした。") from None
        if isinstance(data, dict) and data.get("error"):
            message = data["error"]
            if isinstance(message, dict):
                message = message.get("message", message)
            raise LLMError(f"LLM がエラーを返しました: {str(message)[:300]}")
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise LLMError("LLM 応答の形式が想定と異なります（choices が取り出せません）。") from None
