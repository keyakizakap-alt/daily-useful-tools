// そらならべのサーバー通知に使う鍵を作る。出力を Vercel の環境変数に登録する（Sensitive を推奨）。
//   node scripts/push/gen-keys.mjs
// 秘密鍵と CRON_SECRET は誰にも見せず、リポジトリにも書かないこと。
import crypto from "node:crypto";
const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });   // d / x / y はそれぞれ 32 バイト
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
console.log("VAPID_PUBLIC_KEY=" + pub.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + jwk.d);
console.log("CRON_SECRET=" + crypto.randomBytes(32).toString("base64url"));
