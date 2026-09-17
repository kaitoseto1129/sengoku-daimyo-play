// GoatCounter の数を取って admin/stats.json に書く（GitHub Actions が動かす。鍵は Actions の secret に置く）
const SITE = process.env.GOATCOUNTER_SITE || "https://kaito.goatcounter.com";
const TOKEN = process.env.GOATCOUNTER_TOKEN;
if (!TOKEN) { console.error("GOATCOUNTER_TOKEN がありません"); process.exit(1); }
const fmt = d => d.toISOString().slice(0, 10);
const today = new Date(); const day = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return fmt(d); };
const H = { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" };
async function get(path, params) {
  const u = new URL(SITE + "/api/v0/" + path); for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  await new Promise(r => setTimeout(r, 300));   // 秒に四つまで
  const r = await fetch(u, { headers: H });
  const text = await r.text();
  if (!r.ok) return { error: r.status + " " + text.slice(0, 200) };
  try { return JSON.parse(text); } catch (e) { return { error: "json: " + text.slice(0, 200) }; }
}
async function hitsAll(start, end) {
  // 道（path）ごとの数。多ければ続きも取る
  const out = []; let after = undefined;
  for (let i = 0; i < 20; i++) {
    const r = await get("stats/hits", { start, end, daily: "true", limit: 100, ...(after !== undefined ? { after } : {}) });
    if (r.error) { out.error = r.error; break; }
    out.push(...(r.hits || []));
    if (!r.more || !r.hits || !r.hits.length) break;
    after = r.hits[r.hits.length - 1].path_id;
  }
  return out;
}
const out = { site: SITE, generated: new Date().toISOString(), ranges: {} };
for (const [name, days] of [["d7", 6], ["d30", 29], ["d90", 89]]) {
  const start = day(days), end = day(0);
  out.ranges[name] = {
    start, end,
    total: await get("stats/total", { start, end, daily: "true" }),
    hits: await hitsAll(start, end),
  };
}
// 三十日ぶんの内訳
{ const start = day(29), end = day(0);
  out.breakdown = {};
  for (const k of ["browsers", "systems", "sizes", "locations", "languages", "toprefs"]) out.breakdown[k] = await get("stats/" + k, { start, end, limit: 20 });
}
import { writeFileSync } from "node:fs";
writeFileSync(new URL("./stats.json", import.meta.url), JSON.stringify(out));
console.log("wrote stats.json", Object.keys(out.ranges).map(k => k + ":" + ((out.ranges[k].hits || []).length) + "paths").join(" "));
