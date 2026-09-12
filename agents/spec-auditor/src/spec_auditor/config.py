"""設定。

API キーは環境変数（または権限 0600 のファイル）からのみ読む。
設定オブジェクトを print / ログしても鍵が漏れないよう ``repr`` を潰してある。
"""

from __future__ import annotations

import dataclasses
import os
import pathlib
import stat

DEFAULT_BASE_URL = "https://api.orcarouter.ai/v1"
DEFAULT_MODEL = "orcarouter/auto"

# 送信量・回数の上限（LLM10 想定外消費への歯止め）。
DEFAULT_MAX_INPUT_CHARS = 120_000
DEFAULT_MAX_EGRESS_CHARS = 500_000
DEFAULT_MAX_REQUESTS = 24
DEFAULT_MAX_OUTPUT_TOKENS = 4_000
DEFAULT_TIMEOUT_SEC = 120


class ConfigError(RuntimeError):
    pass


class Secret:
    """誤って表示・ログ出力しても中身が出ない文字列ラッパ。"""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:  # pragma: no cover - 表示のみ
        return "Secret(***)"

    __str__ = __repr__


@dataclasses.dataclass
class Config:
    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    api_key: Secret | None = None
    temperature: float = 0.0
    max_input_chars: int = DEFAULT_MAX_INPUT_CHARS
    max_egress_chars: int = DEFAULT_MAX_EGRESS_CHARS
    max_requests: int = DEFAULT_MAX_REQUESTS
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS
    timeout_sec: int = DEFAULT_TIMEOUT_SEC
    redact: bool = True
    audit_path: pathlib.Path | None = None

    def __repr__(self) -> str:  # pragma: no cover - 表示のみ
        return (
            f"Config(base_url={self.base_url!r}, model={self.model!r}, "
            f"api_key={'set' if self.api_key else 'unset'}, redact={self.redact})"
        )

    @property
    def host(self) -> str:
        from urllib.parse import urlparse

        return urlparse(self.base_url).netloc or self.base_url


def _read_key_file(path: pathlib.Path) -> str:
    if not path.is_file():
        raise ConfigError(f"APIキーファイルが見つかりません: {path}")
    mode = path.stat().st_mode
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise ConfigError(
            f"APIキーファイルの権限が緩すぎます（他ユーザーが読めます）: {path}\n"
            f"  chmod 600 {path} を実行してください。"
        )
    return path.read_text(encoding="utf-8").strip()


def load_config(
    *,
    model: str | None = None,
    base_url: str | None = None,
    redact: bool = True,
    require_key: bool = True,
    audit_path: pathlib.Path | None = None,
) -> Config:
    """環境変数から設定を組み立てる。

    ``ORCAROUTER_API_KEY``     … APIキー本体（推奨）
    ``ORCAROUTER_API_KEY_FILE``… 0600 のファイルから読む場合のパス
    ``ORCAROUTER_BASE_URL``    … 自己ホスト（OrcaRouter Lite 等）を使う場合
    ``SPEC_AUDITOR_MODEL``     … 既定モデルの上書き
    """
    key_text = os.environ.get("ORCAROUTER_API_KEY", "").strip()
    key_file = os.environ.get("ORCAROUTER_API_KEY_FILE", "").strip()
    if not key_text and key_file:
        key_text = _read_key_file(pathlib.Path(key_file).expanduser())

    if require_key and not key_text:
        raise ConfigError(
            "APIキーが設定されていません。\n"
            "  export ORCAROUTER_API_KEY='sk-orca-...'\n"
            "  もしくは ORCAROUTER_API_KEY_FILE にパーミッション 600 のファイルパスを指定してください。"
        )

    resolved_base = base_url or os.environ.get("ORCAROUTER_BASE_URL", DEFAULT_BASE_URL)
    if not resolved_base.startswith("https://"):
        # 自己ホストを localhost で動かす場合だけ平文を許す。
        from urllib.parse import urlparse

        netloc = urlparse(resolved_base).netloc.split(":")[0]
        if netloc not in {"localhost", "127.0.0.1", "::1"}:
            raise ConfigError(
                f"HTTPS 以外のエンドポイントは許可していません: {resolved_base}"
            )

    return Config(
        base_url=resolved_base.rstrip("/"),
        model=model or os.environ.get("SPEC_AUDITOR_MODEL", DEFAULT_MODEL),
        api_key=Secret(key_text) if key_text else None,
        redact=redact,
        audit_path=audit_path,
    )
