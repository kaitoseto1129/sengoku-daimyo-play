// ======================================================================
// 設楽原の決戦　名のある将の討死（docs/shitaragahara_spec_1109.md 19〜20）
//   武将の死はボス撃破の札だけにしない：その将の大旗が倒れる → 武田の兵の「○○様！」の声
//   → その隊と近くの隊の士気が大きく落ち、一部が逃げ出す → 隣の備の軽い大軍も下がる。
//   真田兄弟は二人とも倒れて真田隊が崩れる。山県の死は赤備えの全体の気を落とす。
// 本体の onKill から呼ぶ（v は倒れた兵）。兵は増やさない。
// ======================================================================
import { sfx } from '../audio.js';

const NAMED = {
  '山県昌景': { hq: 'shitara_yamagata', cry: '山県様！', r: 110 },
  '真田信綱': { hq: 'shitara_sanada', cry: '源太左衛門様が討たれた！', r: 80, pair: '真田昌輝' },
  '真田昌輝': { hq: 'shitara_sanada_masateru', cry: '兵部様まで！', r: 80, pair: '真田信綱' },
  '内藤昌豊': { hq: 'shitara_naito', cry: '内藤様！', r: 100 },
  '原昌胤': { hq: 'shitara_hara', cry: '原様が倒れた！', r: 80 },
  '土屋昌次': { hq: 'shitara_tsuchiya', cry: '土屋様！', r: 80 },
  '馬場信春': { hq: 'shitara_baba', cry: '美濃守様！', r: 60 },
};

// ctx：{ groundFlag(rt, flag) }
export function onKill(rt, v, ctx) {
  if (v.team !== 1 || v.type !== 'busho' || !v.name) return;
  const N = NAMED[v.name];
  if (!N) return;
  const F = rt.flags;
  const fallen = F.shFallen || (F.shFallen = new Set());
  if (fallen.has(v.name)) return;
  fallen.add(v.name);
  // その将の大旗が倒れる（陣立ての備の名入りの旗）
  const h = F.jinkeiBound?.[N.hq];
  if (h?.namedFlag) { try { ctx.groundFlag(rt, h.namedFlag); } catch (e) { /* 旗が無くても進む */ } }
  if (h && !h.army?.rout) { try { h.retreat(160, 50); } catch (e) { /* なし */ } }
  // 近くの隊の気が落ち、一部が逃げ出す
  const p = v.pos;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || !g.count) continue;
    const c = g.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > N.r) continue;
    const own = g === v.group;
    g.morale = Math.max(0, (g.morale ?? 100) - (own ? 55 : 30));
    let k = 0;
    for (const u of g.units) if (u.alive && !u.fleeing && u.type !== 'busho' && Math.random() < (own ? 0.3 : 0.15) && k++ < 6) { u.fleeing = true; u.target = null; }
  }
  rt.after(0.6, () => { if (!F.ending) rt.say('武田の足軽', N.cry, 2.2); });
  try { sfx('toki', 0.5); } catch (e) { /* なし */ }
  // 真田は兄弟二人とも倒れて崩れる
  if (N.pair && fallen.has(N.pair)) rt.after(2.6, () => { if (!F.ending) rt.say('組頭', '真田の兄弟、二人とも討たれた！　真田隊が崩れるぞ！', 3.2); });
  // 名のある将が三人を超えたら、川向こうの武田の大軍もじりじり下がり始める
  if (fallen.size >= 3 && !F.shShaken) {
    F.shShaken = true;
    for (const fc of F.far || []) if (fc.v !== 2) { try { fc.m.retreat(40, 12); } catch (e) { /* なし */ } }
  }
}
