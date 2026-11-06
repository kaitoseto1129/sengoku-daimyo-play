// 崩れた隊を助けに、次の隊が来る（kaito 11/2 Q「柴田が崩れたら林が助けに来る、のような当たり前の動き」）。全戦共通。
// 隊が崩れた（敗走・兵が半分を切った・下がり始めた）時、同じ側の手の空いた隊を一つ、その隊の居た前へ押し出す。
//   兵は足さず、消さない。動かすのは助けに行く隊の要（anchor）・向き・下知だけ。
//   筋書きで動かす隊（noAI・任務の隊・本陣・大将・伏兵・守り）は動かさない（frontline_density の movable と同じ見方）。
//   味方が助けに来る時・敵の新手が来る時は、声の届く所（120m 内）でだけ一言の知らせ（12 秒に一度まで）。
// def.relief = false でその戦だけ止める。
import { movable } from './frontline_density.js';

const SCAN = 1;          // 一秒に一度だけ見る
const FAR = 110;         // 助けに行ける隊の遠さ
const NEAR = 12;         // これより近い隊は、もう同じ所で戦っている
const WEAK = 0.5;        // 兵が始めのこの割合を切ったら崩れたとみなす
const c0 = { x: 0, z: 0 }, c1 = { x: 0, z: 0 };

function engaged(g) {
  let n = 0, e = 0;
  for (const u of g.units) {
    if (!u.alive || u.fleeing) continue;
    n++;
    const t = u.target;
    if (t?.alive && t.pos && t.team !== u.team && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 7) e++;
  }
  return n ? e / n : 1;
}

function chiefName(g) {
  const u = g.units.find((o) => o.alive && o.name && !o.isStandard);
  return u ? u.name.replace(/^.*\s/, '') : '';
}

function broken(rt, g) {
  if (g.routed || g._ai?.mode === 'withdraw') return true;
  return g.count < Math.max(3, (g._reliefMax || 0) * WEAK);
}

// 崩れた隊の居た所（今の兵の真ん中。皆逃げた後なら覚えた持ち場）
function frontOf(g, out) {
  if (g.count > 0) return g.center(out);
  out.x = g.anchor.x; out.z = g.anchor.z;
  return out;
}

function nearestFoe(rt, team, x, z) {
  let best = null, bd = 60 * 60;
  for (const u of rt.army.units) {
    if (!u.alive || u.fleeing || u.team === team || u.team > 1 || u.isStruct || u.noTarget) continue;
    const d = (u.pos.x - x) ** 2 + (u.pos.z - z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

function send(rt, g, h) {
  const at = frontOf(g, c0);
  const foe = nearestFoe(rt, h.team, at.x, at.z);
  // 崩れた隊の居た所の少し手前（味方の側）に立ち、敵の方を向く
  const hc = h.center(c1);
  let dx = at.x - hc.x, dz = at.z - hc.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  h.anchor.x = at.x - dx * 3; h.anchor.z = at.z - dz * 3;
  h.facing = foe ? Math.atan2(foe.pos.x - h.anchor.x, foe.pos.z - h.anchor.z) : Math.atan2(dx, dz);
  if (h.guardOn) h.guardOn = false;
  h.order = 'attack';
  h.aggro = Math.max(h.aggro || 0, 14);
  const A = h._ai;
  if (A) { A.home = { x: h.anchor.x, z: h.anchor.z }; A.ax = null; A.spot = null; A.t = Math.min(A.t ?? 0, 0.4); }
  for (const u of h.units) if (u.alive) u.aiT = 0;
  h._reliefOf = g; g._relievedBy = h;
  rt.army.play?.('eshout', h.anchor, 0.8);
  // 声の届く所でだけ知らせる
  const P = rt.player.u.pos;
  if (Math.hypot(at.x - P.x, at.z - P.z) > 120 || (rt.flags.reliefSayAt ?? -99) + 12 > rt.t) return;
  rt.flags.reliefSayAt = rt.t;
  const who = chiefName(h);
  // 「隊」は明治の言葉。当時の「手」「備」で言う（11/6 刀根坂の頼み）
  if (h.team === rt.player.u.team) rt.bark(who ? `${who}の手が加勢に来たぞ！　前を支えよ` : '後ろの備が加勢に来たぞ！　前を支えよ');
  else rt.bark(who ? `${who}の手が押し出してくるぞ！` : '敵の次の備が押し出してくるぞ！');
}

export function reliefTick(rt, dt) {
  if (rt.def.relief === false || rt.over || rt.aftermath || rt.def.dojo || rt.def.town || (rt.prelude && rt.prelude !== 'done')) return;
  const R = rt._relief || (rt._relief = { t: 0 });
  R.t += dt;
  if (R.t < SCAN) return;
  R.t = 0;
  const groups = rt.army.groups;
  for (const g of groups) {
    if (g.team > 1 || g.civ || g.people || g.isRunner || g.clash || g.hidden || g.isPlayerSquad || g.isTomo || g.isStruct) continue;
    // 始めの兵の数を覚える（戦の途中で兵が加わった時は増やす）
    if (!(g.count <= (g._reliefMax || 0))) g._reliefMax = g.count;
    if (g._relievedBy || (g._reliefMax || 0) < 6 || !broken(rt, g)) continue;
    const at = frontOf(g, c0), ax = at.x, az = at.z;
    let best = null, bd = FAR;
    for (const h of groups) {
      if (h === g || h.team !== g.team || h._reliefOf || h.count < 6 || broken(rt, h) || h.clash || h.cav || h.isGun) continue;
      if (!movable(rt, h)) continue;
      // 退いている手・総大将の旗本は前へ出さない（追い討ちの戦で退く大将が助けに出ていた。11/6 刀根坂の頼み）
      if (h.order === 'retreat' || h._ai?.mode === 'withdraw' || h.units.some((u) => u.isLord && u.alive)) continue;
      const hc = h.center(c1), d = Math.hypot(hc.x - ax, hc.z - az);
      if (d < NEAR || d >= bd || engaged(h) >= 0.25) continue;
      best = h; bd = d;
    }
    // 助けが居なければ、次に見る時まで待つ（隊が空くかもしれない）
    if (best) send(rt, g, best);
  }
  // 助けに行った隊は、着いて敵と斬り合えばふだんの頭へ戻す（崩れた隊は二度は助けない）
  for (const h of groups) {
    if (!h._reliefOf) continue;
    if (h.count <= 0 || h.routed) { h._reliefOf = null; continue; }
    const c = h.center(c1);
    if (Math.hypot(c.x - h.anchor.x, c.z - h.anchor.z) < 6 && engaged(h) > 0.25) {
      if (h._ai) { h._ai.home = { x: h.anchor.x, z: h.anchor.z }; }
      h._reliefOf = null;
    }
  }
}
