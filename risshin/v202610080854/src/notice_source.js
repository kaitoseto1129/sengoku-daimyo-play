// 出来事の字幕だけを運ぶ。勝敗・任務・戦の時計は待たせない。
import { sightPoint } from './battle_sight.js';
import { sendOrder } from './denrei.js';
import { weatherSees } from './weather_gameplay.js';
import { smokeDepth } from './wind_smoke.js';
function witnessed(rt, u, at) {
  const a = u.pos, ay = a.y + 1.6, by = (at.y ?? rt.world.heightAt(at.x, at.z)) + 1.6;
  if (rt.army.wallBetween(a, 0, at) || !weatherSees(rt.world, a, at) || smokeDepth(rt.world, a, at, ay, by) > 0.45) return false;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    if (rt.world.heightAt(a.x + (at.x - a.x) * t, a.z + (at.z - a.z) * t) > ay + (by - ay) * t - 0.3) return false;
  }
  return true;
}
const FACT = /討死(?=！|!|。|、|$|した)|討たれた|討ち取った|倒れた|崩れた|全滅(?=した|！|!|。|$)|退いた|逃げ戻|人を倒した/;
export function roughPeople(text) {
  return String(text ?? '').replace(/戦功\s*[+＋-]?\d+/g, '働き').replace(/[（(](残り|あと)\d+人[）)]/g, '').replace(/(残り|あと)\d+人/g, '残る者').replace(/\d+人を倒した/g, '敵を倒したようだ');
}
export function relayNotice(rt, speaker, text, deliver) {
  if (!rt.ready || rt.over || rt.def.dojo || rt.def.town || rt._deliveredNotice || !FACT.test(text)) return false;
  if (heardRecently(rt, text)) return true;
  let at = rt._noticeAt;
  if (!at) for (const u of rt.army.units) if (u.name && text.includes(u.name)) { at = u.pos; break; }
  if (!at) for (const g of rt.army.groups) if (g.name && text.includes(g.name)) { at = g.center(); break; }
  // 場所が特定できない声を、足元にいる架空の兵の証言にしない。
  if (!at) return true;
  if (sightPoint(rt, at)) return false;
  let witness = null, best = 24;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== rt.player.u.team || u.isPlayer || u.civ || u.fleeing || u.isRunner) continue;
    const d = Math.hypot(u.pos.x - at.x, u.pos.z - at.z);
    if (d < best && witnessed(rt, u, at)) { witness = u; best = d; }
  }
  const t0 = rt.t;
  if (witness) sendOrder(rt, witness, rt.player.u, { id: 'news', apply: () => {
    if (rt.over) return;
    if (heardRecently(rt, text, 30) || rt.t - t0 > 40) return;
    (rt.heardNotices || (rt.heardNotices = new Set())).add(text);
    rt._deliveredNotice = true;
    try { deliver(); } finally { rt._deliveredNotice = false; }
  } }, { team: rt.player.u.team, faction: witness.group?.faction, name: '出来事の知らせ' });
  return true;
}

// 任務の条件はそのまま動かし、遠い出来事の説明だけを札から外す。
export function noticeText(rt, text) {
  text = roughPeople(text);
  if (!FACT.test(text) || rt.over || rt.def.dojo || rt.def.town || text.startsWith('使番「') || rt.heardNotices?.has(text)) return text;
  return text.replace(/[^。！!\n]+[。！!]?/g, (line) => {
    if (!FACT.test(line)) return line;
    for (const u of rt.army.units) if (u.name && line.includes(u.name) && sightPoint(rt, u.pos)) return line;
    for (const g of rt.army.groups) if (g.name && line.includes(g.name) && sightPoint(rt, g.center())) return line;
    // 一文に下知もある時は、その行動を落とさない。
    const command = line.match(/[^。！!]*(?:退け|戻れ|守れ|集めよ|進め|押せ|待て|下がれ)[。！!]?/);
    if (command) return command[0].replace(/^.*(?:、|。)/, '');
    return '遠くの様子は分からぬ。';
  });
}

// 目の前で聞いた台詞・知らせを、使番が後から運び直さない。
const norm = (t) => String(t).replace(/^[^「\n]{1,30}「([\s\S]+)」$/, '$1').replace(/[\s、。！!？?]+/g, '');
export function noteHeard(rt, text) {
  const m = rt._heardAt || (rt._heardAt = new Map());
  if (m.size > 60) for (const [k, t] of m) if (rt.t - t > 90) m.delete(k);
  m.set(norm(text), rt.t);
}
export function heardRecently(rt, text, sec = 60) {
  const t = rt._heardAt?.get(norm(text));
  return t !== undefined && rt.t - t < sec;
}
