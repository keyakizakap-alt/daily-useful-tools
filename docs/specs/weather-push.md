# そらならべ: アプリを閉じていても届く通知

- ステータス: 実装中（コードとテストは完了。本番の設定と実機での確認が残っている）
- 関連: 雨・警報の通知（アプリを開いている間）の続き

## 目的

アプリを開いていないときでも、雨の降り出し・強まりと、気象警報・注意報の発表を端末に通知する。

## スコープ

- やること: Web Push（VAPID・aes128gcm を Node の標準機能だけで実装）、購読の登録・解除 API、5分ごとに外部 cron から呼ぶ判定と送信の API、サーバー経由のテスト通知、メニューの「アプリを閉じていても通知」、Service Worker の push 受信
- やらないこと: ログイン・アカウント、通知の時間帯指定、雨・警報以外の通知、Vercel の有料プランへの変更

## 構成

| 役割 | 場所 |
|---|---|
| 購読の登録・更新・解除 | `api/push/subscribe.js` |
| 定期実行（判定と送信） | `api/push/cron.js`（外部の cron サービスから `Authorization: Bearer <CRON_SECRET>` 付きで 5 分ごとに呼ぶ） |
| 公開鍵の配布 | `api/push/config.js` |
| サーバー経由のテスト通知 | `api/push/test.js` |
| 暗号化・署名 / 保存 / 天気の判定 | `api/_lib/webpush.js` / `api/_lib/store.js` / `api/_lib/weather.js` |
| 鍵の作成 | `scripts/push/gen-keys.mjs` |

環境変数: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `CRON_SECRET` と、Upstash Redis の `KV_REST_API_URL` / `KV_REST_API_TOKEN`（または `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）。

## 完了条件

- [x] `npm test` が終了コード0で終わる（`tests/weather-push.test.mjs` を含む）
- [x] `tests/weather-push.test.mjs` の暗号化テストが RFC 8291 §5 の例と一致する
- [x] `tests/weather-push.test.mjs` で、プッシュサービス以外の宛先（`https://evil.example.com/` など）を拒否する
- [x] `tests/weather-push.test.mjs` で、`CRON_SECRET` が一致しない `api/push/cron.js` の呼び出しが 401 を返す
- [ ] 本番で `/api/push/config/` が `"enabled":true` を返す
- [ ] 実機（Android の Chrome、または iPhone のホーム画面に追加したアプリ）で、メニューの「テスト通知を送る」により `/api/push/test/` が 200 を返し、アプリを閉じた状態の端末に「そらならべ：テスト通知」が表示される
