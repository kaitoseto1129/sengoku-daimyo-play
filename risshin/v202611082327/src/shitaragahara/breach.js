// ======================================================================
// 設楽原の決戦　戦況の変わり目（6〜9分）「土屋昌次の柵破り」（docs/oda15_plan_1108.md 17：第二波・一部柵突破・近接戦へ）
//   真田が大宮前で崩れた直後、大宮前と柳田前の間の柵（口の無い所）へ土屋昌次の隊が取り付き、一の柵・二の柵を押し倒す。
//   破れ目から柵の内へ入った土屋勢を、組と予備の槍組で押し返す（柵の内の斬り合い）。
//   土屋昌次は柵際で討死したと伝わる（甲陽軍鑑）。将を討つか、隊が三分の一を切るか、二分で鉄砲に倒れる。
// 兵は十八人だけ。破れ目は柵の二つの区画（三十メートル）。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const BZ = -139;   // 破れ目（大宮前と柳田前の間）

export function active(rt) { const B = rt.flags.shBreach; return !!B && !B.done; }

export function pin(rt) {
  const B = rt.flags.shBreach;
  if (!B || B.done) return null;
  const p = rt.player.u.pos;
  return Math.hypot(p.x - B.IN.x, p.z - B.IN.z) < 7 ? null : B.IN;
}

export function group(rt) { const B = rt.flags.shBreach; return B && !B.done ? B.g : null; }

// ctx：{ SB, black, ready, reserve }
export function start(rt, ctx) {
  const F = rt.flags;
  const B = F.shBreach = { at: rt.t, ctx, s: 0, IN: { x: ctx.SB.x0 - ctx.SB.gap - 3, z: BZ }, done: false };
  B.g = ctx.black(() => enemyGroup(rt, { faction: 'hojo', name: '土屋昌次隊', fixed: true, noGuard: true, anchor: { x: 96, z: BZ }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 14, formation: 'line', morale: 100, noRout: true, speed: 3.6 },
    [{ type: 'busho', n: 1, o: { name: '土屋昌次', flag: 'takeda' } }, { type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 15, o: { flag: 'takeda' } }]));
  B.g.order = 'path'; B.g.pathIdx = 0; B.g.path = [[ctx.SB.x0 + 6, BZ]]; B.g.dest = null;
  B.g.onArrive = () => { B.arrived = true; };
  B.n0 = ctx.ready(B.g);
  rt.after(1.5, () => { try { sfx('toki', 0.8); } catch (e) { /* なし */ } });
  rt.say('使番', '土屋昌次の隊が、口の無い所の柵へ取り付いたぞ！', 3.4);
  return B;
}

function breakFence(rt, B) {
  const F = rt.flags, x0 = B.ctx.SB.x0, gap = B.ctx.SB.gap;
  for (const s of F.fence || []) {
    if (!s.alive || !s.seg) continue;
    const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
    if (mx < x0 - gap - 1 || Math.abs(mz - BZ) > 17) continue;     // 一の柵・二の柵の、破れ目の前の区画だけ
    s.hp = 0; s.alive = false; s.hitFrom = { x: mx + 4, z: mz };
    try { rt.army.structFall(s); } catch (e) { /* 倒す形が無くても進む */ }
    try { rt.army.hooks?.onStructDestroyed?.(s); } catch (e) { /* なし */ }
  }
  try { sfx('gateBreakWood', 1); } catch (e) { /* なし */ }
}

// true の間は本体の step 2（柳田前へ移る）を止める
export function tick(rt, dt) {
  const F = rt.flags, B = F.shBreach;
  if (!B || B.done) return false;
  const p = rt.player.u.pos, T = rt.t - B.at, c = B.ctx, g = B.g;
  if (B.s === 0) {
    // 柵に取り付いたら（三十五秒で必ず）二つの柵を押し倒して中へ
    if (B.arrived || T > 35 || g.center().x < c.SB.x0 + 10) {
      B.s = 1; B.at1 = rt.t;
      breakFence(rt, B);
      rt.say('土屋昌次', '柵を引き倒せ！　中へ入れ！', 2.8);
      rt.after(3, () => rt.say('組頭', '柵が破られた！　破れ目で押し返せ！', 3));
      g.order = 'attack'; g.seekRange = 40; g.aggro = 30; g.anchor.x = B.IN.x; g.anchor.z = B.IN.z;
      const R = c.reserve();
      if (R && !R.routed) { R.order = 'move'; R.dest = { x: B.IN.x - 4, z: BZ + 8 }; R.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 20; }; }
    }
    return true;
  }
  // 一分たつと、隣の口の鉄砲組が破れ目へ向き直って撃ち込む（戦況が動く）
  if (!B.volley && rt.t - B.at1 > 55) {
    B.volley = true;
    rt.say('前田利家', '鉄砲組、破れ目へ向き直れ！　放て！', 2.8);
    try { sfx('volley', 1); } catch (e) { /* なし */ }
    let k = 0;
    for (const u of g.units) if (u.alive && u.name !== '土屋昌次' && k < 3) { rt.army.kill(u, null); k++; }
  }
  const lord = g.units.find((u) => u.name === '土屋昌次');
  if (Math.hypot(p.x - B.IN.x, p.z - B.IN.z) < 32) B.there = true;
  const left = c.ready(g);
  const end = (!lord?.alive) || (B.there && left <= Math.ceil(B.n0 * 0.35)) || rt.t - B.at1 > 110;
  if (!end) return true;
  B.done = true;
  if (lord?.alive) { lord.invuln = false; rt.army.kill(lord, null); }
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'retreat'; g.dest = { x: 500, z: BZ }; g.fleeDir = { x: 1, z: 0 };
  for (const u of g.units) if (u.alive) u.fleeing = true;
  try { sfx('volley', 0.9); } catch (e) { /* なし */ }
  rt.banner('土屋昌次、討死', '柵の破れ目を押し返した');
  rt.say('組頭', '破れ目は守った！　柵の内の道を、組と柳田前へ移るぞ！', 3.8);
  rt.award((t) => { t.side.push('柵の破れ目で土屋昌次の隊を押し返した'); t.special = { label: '柵の破れ目を守った', pts: 12 }; }, '破れ目を守った', B.IN);
  const R = c.reserve();
  if (R && !R.routed) { R.order = 'hold'; R.anchor.x = B.IN.x; R.anchor.z = BZ; R.facing = Math.PI / 2; }
  return false;
}
