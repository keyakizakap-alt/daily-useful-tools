"use strict";
/*
 * 購読情報の保存先: Upstash Redis（REST API）。
 * Vercel の Marketplace から Upstash を追加すると KV_REST_API_URL / KV_REST_API_TOKEN が設定される。
 * Upstash から直接作った場合の UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN も受け付ける。
 */
function storeFromEnv(env, fetchImpl) {
  const e = env || process.env;
  const url = (e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  const doFetch = fetchImpl || fetch;
  const call = async (path, body) => {
    const res = await doFetch(url + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new Error("store HTTP " + res.status);
    return json;
  };
  return {
    /** 1コマンド: cmd("SET", "k", "v") */
    async cmd(...args) {
      const r = await call("", args.map(String));
      if (r.error) throw new Error("store: " + r.error);
      return r.result;
    },
    /** まとめて実行: pipeline([["GET","a"],["GET","b"]]) → 結果の配列 */
    async pipeline(cmds) {
      if (!cmds.length) return [];
      const r = await call("/pipeline", cmds.map(c => c.map(String)));
      return r.map(x => { if (x.error) throw new Error("store: " + x.error); return x.result; });
    }
  };
}

module.exports = { storeFromEnv };
