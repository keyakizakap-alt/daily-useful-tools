"""送信ポリシーと使用量の上限。

外部へ本文を出すのは不可逆な操作なので、
- 最初の送信前に「どこへ・何を・どれだけ」出すかを人に見せて同意を取る
- 1 セッションあたりの送信文字数・リクエスト回数・所要時間に上限を設ける
の 2 つを必ず通す。--yes で同意をスキップできるのは、非対話実行のため。
"""

from __future__ import annotations

import dataclasses


class PolicyError(RuntimeError):
    pass


class BudgetExceeded(PolicyError):
    pass


class EgressDenied(PolicyError):
    pass


@dataclasses.dataclass
class Budget:
    max_requests: int
    max_chars: int
    used_requests: int = 0
    used_chars: int = 0

    def charge(self, chars: int) -> None:
        if self.used_requests + 1 > self.max_requests:
            raise BudgetExceeded(
                f"LLM 呼び出し回数の上限 {self.max_requests} に達しました。"
                "文書を分割するか --max-requests を上げてください。"
            )
        if self.used_chars + chars > self.max_chars:
            raise BudgetExceeded(
                f"送信文字数の上限 {self.max_chars:,} に達しました"
                f"（今回 {chars:,} 文字 / 既に {self.used_chars:,} 文字）。"
            )
        self.used_requests += 1
        self.used_chars += chars

    def summary(self) -> str:
        return (
            f"LLM呼び出し {self.used_requests}/{self.max_requests} 回、"
            f"送信 {self.used_chars:,}/{self.max_chars:,} 文字"
        )


@dataclasses.dataclass
class EgressNotice:
    """最初の外部送信の前に人へ見せる内容。"""

    host: str
    model: str
    source_name: str
    chars: int
    redacted_counts: dict[str, int]
    redaction_enabled: bool

    def render(self) -> str:
        masked = (
            "、".join(f"{k} {v}件" for k, v in sorted(self.redacted_counts.items()))
            if self.redacted_counts
            else "該当なし"
        )
        lines = [
            "──────────── 外部送信の確認 ────────────",
            f"  送信先ホスト : {self.host}",
            f"  モデル       : {self.model}",
            f"  対象文書     : {self.source_name}",
            f"  送信量（概算）: {self.chars:,} 文字",
            f"  マスキング   : {'有効' if self.redaction_enabled else '無効（!）'} / {masked}",
            "",
            "  仕様書の本文がこのホストへ送られます。マスキングは完全ではありません。",
            "  社外に出せない文書の場合はここで中止し、自己ホスト構成をご検討ください。",
            "────────────────────────────────────────",
        ]
        return "\n".join(lines)


def confirm_egress(notice: EgressNotice, *, assume_yes: bool, input_fn=None) -> None:
    if assume_yes:
        return
    input_fn = input_fn or input
    print(notice.render())
    answer = input_fn("この内容で送信してよろしいですか？ [y/N]: ").strip().lower()
    if answer not in {"y", "yes"}:
        raise EgressDenied("利用者が外部送信を承認しなかったため中止しました。")
