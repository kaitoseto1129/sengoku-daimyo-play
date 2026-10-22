// 集団の戦術の前に立った時の一言（槍衾・鉄砲の列）。
// 個人の腕では崩せない隊の前で、どう動くか・配下に命じるかを短く伝える。
// 半秒ごとに見る。同じ種の声は 30 秒に一度、どの声も 8 秒は空ける。組がいれば号令の丸を数秒だけ目立たせる。
import { isTouch } from './touch.js';

const LOOK = 0.5, SAME = 30, GAP = 8, URGE = 6, DANGER_GAP = 4;

// 短い知らせの入口で危険を記録し、助言直後の押し合いの指図を止める。
export function tacticsCueBarkAllowed(rt, text, warn) {
  if (/^(槍衾だ|鉄砲の列だ)/.test(text)) return true;
  if (warn && /囲ま|四方から敵|取り籠め|後ろ|背後|背を取|脇|横|左右|退け|下がれ|物陰|構え|お命|倒れる|一太刀|矢|鉄砲|筒先|火縄|敵.*来る/.test(text)) {
    rt.flags.tcDangerT = rt.t;
  }
  return warn || !(rt.t < (rt.flags.tcSpokeT ?? -Infinity) + GAP && /押せ|押し込|一押し|槍を入れ|詰めよ|寄せよ|突け|懸かれ|追え/.test(text));
}

function front(rt, c) {
  const p = rt.player, u = p.u;
  const dx = c.x - u.pos.x, dz = c.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
  const yaw = p.yaw ?? u.heading;
  return { d, cos: (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d };
}

export function tacticsCueTick(rt, dt) {
  const F = rt.flags, p = rt.player;
  if (!p || !p.u.alive || rt.over || rt.def.dojo || rt.def.town || rt.def.duel || rt.aftermath) return;
  if ((F.tcLookT = (F.tcLookT || 0) - dt) > 0) return;
  F.tcLookT = LOOK;
  if (rt.t < 20 || rt.t < (F.tcNextT || 0)) return;
  // 危険が続く間は待つ。待っただけでは同じ種の助言の間隔を消費しない。
  if (p.u.mobbed || rt.army.playerMobbed || rt.encircle?.lv > 0 ||
      rt.t <= (F.tcDangerT ?? -Infinity) + DANGER_GAP) return;
  const hasSq = !!rt.squad?.some((o) => o.alive);
  let pick = null;
  for (const g of rt.army.groups || []) {
    if (g.team === p.u.team || g.routed || g.hidden || g.civ || !(g.count >= 5)) continue;
    const c = g.center();
    const { d, cos } = front(rt, c);
    if (cos < 0.35) continue;
    if (g.formation === 'yari' && !g.isGun && !g.cav && d < 20) {
      if (!(rt.t < (F.tcYariT ?? -99) + SAME)) pick = { k: 'yari', d };
    } else if (g.isGun && d < 55 && d > 12) {
      if (!pick && !(rt.t < (F.tcGunT ?? -99) + SAME)) pick = { k: 'gun', d };
    }
  }
  if (!pick) return;
  const cmd = hasSq ? isTouch ? '「号令」で配下に命じて押せ' : '配下に命じて押せ' : '';
  const text = pick.k === 'yari'
    ? `槍衾だ。正面は避け、横へ回れ${cmd ? '。' + cmd : ''}`
    : `鉄砲の列だ。撃ち終わりに詰めよ${cmd ? '。' + cmd : ''}`;
  if (pick.k === 'yari') F.tcYariT = rt.t; else F.tcGunT = rt.t;
  F.tcNextT = rt.t + GAP;
  rt.bark(text, pick.k === 'yari');
  F.tcSpokeT = rt.t;
  if (hasSq) rt.cmdUrgeUntil = rt.t + URGE;
}
