import { readFileSync, writeFileSync } from "node:fs";
// GoatCounter の数を取って admin/stats.json に書く（GitHub Actions が動かす。鍵は Actions の secret に置く）
const SITE = process.env.GOATCOUNTER_SITE || "https://kaito.goatcounter.com";
const TOKEN = process.env.GOATCOUNTER_TOKEN;
const fixture = process.env.VOICE_FIXTURE ? JSON.parse(readFileSync(process.env.VOICE_FIXTURE, "utf8")) : null;
if (!TOKEN && !fixture) { console.error("GOATCOUNTER_TOKEN がありません"); process.exit(1); }
const fmt = d => d.toISOString().slice(0, 10);
const today = new Date(); const day = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return fmt(d); };
const H = { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" };
async function get(path, params) {
  if(fixture){
    if(path==="stats/hits"){
      const excluded=new Set(String(params.exclude_paths||"").split(","));
      const all=fixture.hits.filter(h=>!excluded.has(String(h.path_id)));
      return {hits:all.slice(0,100),more:all.length>100};
    }
    return {};
  }
  const u = new URL(SITE + "/api/v0/" + path); for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  await new Promise(r => setTimeout(r, 300));   // 秒に四つまで
  let r = await fetch(u, { headers: H });
  let text = await r.text();
  if (!r.ok) {   /* 第254巡：たまに 404 が返る。一度だけ取り直す */
    await new Promise(x => setTimeout(x, 1200));
    r = await fetch(u, { headers: H }); text = await r.text();
  }
  if (!r.ok) return { error: r.status + " " + text.slice(0, 200) };
  try { return JSON.parse(text); } catch (e) { return { error: "json: " + text.slice(0, 200) }; }
}
async function hitsAll(start, end) {
  // 道（path）ごとの数。多ければ続きも取る
  /* 戦国立身（/risshin/・risshin/ev/…）も同じサイトに入るので、道はもっと増える。
     GoatCounter の stats/hits は「after」を知らず（一枚目の百で切れていた）、続きは exclude_paths（取った道の id をカンマで）で取る。
     more が true の間、最大 30 枚（3000 の道）まで */
  const out = []; const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const r = await get("stats/hits", { start, end, daily: "true", limit: 100, ...(seen.size ? { exclude_paths: [...seen].join(",") } : {}) });
    if (r.error) { out.error = r.error; break; }
    const got = (r.hits || []).filter(h => !seen.has(h.path_id));
    for (const h of got) { seen.add(h.path_id); out.push(h); }
    if(i===29 && r.more) out.error="道が3000件を超えました。取り残しがあります";
    if (!got.length || r.more === false || (r.more === undefined && (r.hits || []).length < 100)) break;
  }
  return out;
}
const out = { site: SITE, generated: new Date().toISOString(), ranges: {} };
for (const [name, days] of [["d1", 0], ["d7", 6], ["d30", 29], ["d90", 89]]) {   /* 第255巡（作り手）：一日ぶんも見る */
  const start = day(days), end = day(0);
  out.ranges[name] = {
    start, end,
    total: await get("stats/total", { start, end }),
    hits: await hitsAll(start, end),
  };
  if (out.ranges[name].hits.error) out.ranges[name].hitsError = out.ranges[name].hits.error;   // 配列の印は JSON に残らないので別に書く
}
// 三十日ぶんの内訳
{ const start = day(29), end = day(0);
  out.breakdown = {};
  for (const k of ["browsers", "systems", "sizes", "locations", "languages", "toprefs"]) out.breakdown[k] = await get("stats/" + k, { start, end, limit: 20 });
}
// 日ごとの声を蓄積する。重なる90日窓は同じ日・道を上書きし、過去分を消さない。
const feedbackURL=new URL("./feedback.json", import.meta.url);
let previous=[];
try{ previous=JSON.parse(readFileSync(feedbackURL,"utf8")); if(!Array.isArray(previous)) throw Error("配列ではありません"); }
catch(e){ if(e.code!=="ENOENT") throw e; }
const records=new Map(previous.map(x=>[x.date+"/"+x.path,x]));
const range=out.ranges.d90;
if(range.hitsError) throw Error("声の取得失敗："+range.hitsError);
for(const hit of range.hits){
  const path=String(hit.path||"").replace(/^\//,"");
  if(!/^(ev\/)?fb\//.test(path)) continue;
  const parts=path.replace(/^ev\//,"").split("/");
  if(parts.length!==6) continue;
  let scene,rating,build,scenario,text;
  try{ [scene,rating,build,scenario,text]=parts.slice(1).map(decodeURIComponent); }catch(_){ continue; }
  for(const day of hit.stats||[]){
    const count=Number(day.daily??(day.hourly||[]).reduce((a,b)=>a+b,0));
    if(!(count>0)||!/^\d{4}-\d{2}-\d{2}$/.test(day.day)) continue;
    const row={date:day.day,scene,rating,text,build,scenario,count,path};
    records.set(row.date+"/"+path,row);
  }
}
writeFileSync(feedbackURL,JSON.stringify([...records.values()].sort((a,b)=>a.date.localeCompare(b.date)),null,2)+"\n");
// 文そのものは feedback.json にだけ置く。通常の数の集計には持ち込まない。
for(const r of Object.values(out.ranges)) r.hits=r.hits.filter(h=>!/^\/?(?:ev\/)?fb\//.test(h.path||""));
writeFileSync(new URL("./stats.json", import.meta.url), JSON.stringify(out));
console.log("wrote stats.json", Object.keys(out.ranges).map(k => k + ":" + ((out.ranges[k].hits || []).length) + "paths" + (out.ranges[k].hitsError ? "(err " + out.ranges[k].hitsError + ")" : "") + " risshin:" + (out.ranges[k].hits || []).filter(h => /^\/?risshin(\/|$)/.test(h.path || "")).length).join(" "));
