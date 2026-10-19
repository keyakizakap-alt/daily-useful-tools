"""repo-harness の最小テスト。assert の失敗メッセージには必ず「直し方」を書く。

`python3 -m unittest discover -s tests` と `pytest tests` のどちらでも動く。
"""
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "harness"))

from check_specs import check_spec_file, check_specs, format_problems  # noqa: E402


class HarnessTest(unittest.TestCase):
    def test_specs_have_objective_done_criteria(self):
        problems = check_specs(REPO_ROOT)
        self.assertEqual(problems, [], "\n" + format_problems(problems))

    def test_spec_with_verifiable_criteria_passes(self):
        spec = "# 例\n\n## 完了条件\n\n- [ ] `npm test` が終了コード0で終わる\n"
        self.assertEqual(
            check_spec_file("docs/specs/example.md", spec),
            [],
            "正しい仕様書を不合格にしている。直し方: scripts/harness/check_specs.py の CHECKBOX / CODE_SPAN の正規表現を確認する",
        )

    def test_missing_done_criteria_is_reported_with_fix(self):
        with tempfile.TemporaryDirectory() as tmp:
            spec_dir = Path(tmp) / "docs" / "specs"
            spec_dir.mkdir(parents=True)
            (spec_dir / "sample.md").write_text("# サンプル\n\n画面が正しく表示される\n", encoding="utf-8")
            problems = check_specs(Path(tmp))
            self.assertEqual(
                len(problems),
                1,
                "完了条件の欠落を検出できていない。直し方: scripts/harness/check_specs.py の DONE_HEADING を確認する",
            )
            self.assertIn(
                "直し方: ",
                format_problems(problems),
                "失敗メッセージに直し方が含まれていない。直し方: format_problems が各問題の fix を出力しているか確認する",
            )


if __name__ == "__main__":
    unittest.main()
