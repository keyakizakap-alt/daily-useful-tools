# ハッカソン勝ち筋リサーチ（Web調査ベース）

調査日: 2026-08-28

## 出典
- [How to Win a Hackathon: 10 Tips From 500+ Events (HackerEarth)](https://www.hackerearth.com/blog/10-tips-win-hackathon)
- [How to win a hackathon: Advice from 5 seasoned judges (Devpost)](https://info.devpost.com/blog/hackathon-judging-tips)
- [Understanding hackathon submission and judging criteria (Devpost)](https://info.devpost.com/blog/understanding-hackathon-submission-and-judging-criteria)
- [How to judge a hackathon: 5 criteria to pick winners (Eventornado)](https://eventornado.com/blog/how-to-judge-a-hackathon-5-criteria-to-pick-winners)
- [Hackathon Tips: What Repeat Winners Do Differently (AngelHack)](https://angelhack.com/blog/hackathon-tips-for-winners/)
- [ハッカソンで優勝する方法についての考察 (Zenn)](https://zenn.dev/thirdlf/articles/09-zenn-think-hackson)
- [初めてのハッカソンでわかった勝ち抜くコツとは (Zenn)](https://zenn.dev/transmedia_blog/articles/60bcb01b5a4a13)
- [JPHACKS 審査基準&審査方法](https://jphacks.github.io/2017-guideline/criteria/)
- [ハッカソンでうまいプレゼンをすぐ作る方法 (jack)](https://www.jackapp.jp/blog/2b9f301f-f175-80f9-a855-f4c2d47c9c00)
- [全リソースをキースライドに叩き込んだ (Qiita)](https://qiita.com/Shun_P/items/66200de51bc90ad7fdb5)

## 抽出した勝ち筋（W1-W8）

| ID | 勝ち筋 | 根拠 |
|----|--------|------|
| W1 | **最初の30秒で決まる。** 審査員は冒頭で印象を固め、残りはその裏付け探しをする | Devpost / HackerEarth |
| W2 | **ユーザー価値 > 技術力。** JPHACKSでは「ユーザー価値につながるか」30%に対し「技術的優秀性」20% | JPHACKS |
| W3 | **プレゼン構成の優先度は「課題感 → デモ → 解決策」。** 技術紹介は4分中30秒程度に抑える | jack |
| W4 | **デモは絶対に落ちてはいけない。** 外部サービスはモック化・レスポンスキャッシュ・スクショのフォールバックを用意。オチに到達しないデモは減点 | HackerEarth |
| W5 | **その場で審査員に触らせる。** 体験した審査員は当事者になり記憶に残る | AngelHack / Zenn |
| W6 | **READMEの構成が効く。** 1行目=課題、2行目=デモURL、3行目=GIF/スクショ、その後に技術詳細 | HackerEarth |
| W7 | **原体験・具体性のある課題設定が刺さる。** 抽象的な「社会をよくする」は弱い | Zenn / Eventornado |
| W8 | **将来展望を明示する。** 作れなかった部分をロードマップとして語ると拡張性の評価が上がる | jack |

## 本プロジェクトの設計原則（上記からの帰結）
1. **ゼロ依存・完全オフライン動作**（W4）— APIキー不要、外部CDN不要、ネットが落ちても動く
2. **審査員が自分の手で触れる**（W5）— 見るだけのデモにしない
3. **課題が一文で言える**（W1/W7）— 誰が、いつ、何に困っているか
4. **視覚的インパクトが即座に立ち上がる**（W1）— ロード後3秒以内に「何これ」を発生させる
5. **README first**（W6）
