// 豊臣編の戦の bot が共通で使う「受け」（b_t*_*.js の def.botBrain の頭で呼ぶ）。
// 一太刀で命の半ばを削る作り（player_hurt.js・kaito 11/1 C）なので、構えずに二人の刃を浴びると倒れる。
// 本人へ実際に打ち込んでくる兵を見て、穂先が届く直前に構え、隙に突き返す（利根坂の頭と同じ受け方）。
import { SWING } from './units.js';
import { depthBot } from './b_depth.js';

// 受ける間は true を返す（その戦の頭はそこで止める）。打ち込みが無ければ false
export function toyoGuard(b, inp, { goTo, patientStrike }) {
  const p = b.player, u = p.u;
  if (!u.alive) return false;
  let attacker = null, ad = 10, soonest = Infinity;
  // 11/13 クラウドE：堀の中・柵の向こうから狙うだけで届かない敵に構え続け、山中城の出丸で十五分立ったままだった（体力は満ちたまま）。
  //   同じ相手に八秒構えて、互いに一太刀も通らなければ、その相手は二十秒見限って戦の頭の歩みへ戻す
  const ign = b._tgIgn || (b._tgIgn = new Map());
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.isStruct || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    if (ign.get(o) > b.t) continue;
    if (!o.sidearm && (o.type === 'gun' || o.type === 'bow')) continue;
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow && !o.atk.ranged;
    if (!charge && !atk && !swing) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d > (o.reach || 2.8) + 2.5 || b.army.wallBetween(u.pos, -1, o.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    const motion = atk ? (SWING[o.atk.kind] || SWING.thrust) : null;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) :
      o.atk.t + motion[0] * motion[1] * (o.atk.fast ? 0.7 : 1);
    if (soon < soonest || soon === soonest && d < ad) { attacker = o; ad = d; soonest = soon; }
  }
  if (!attacker) return false;
  // 相手ごとに数える（二人が交互に狙うと、一人ずつの時計では毎回戻って止まり続けた）
  const ks = b._tgKs || (b._tgKs = new Map());
  let k = ks.get(attacker);
  if (!k || u.hp < k.hp - 0.5 || attacker.hp < k.ohp - 0.5 || b.t - k.last > 3) { k = { t: b.t, hp: u.hp, ohp: attacker.hp, last: b.t }; ks.set(attacker, k); }
  k.last = b.t;
  if (b.t - k.t > 8) { ign.set(attacker, b.t + 20); ks.delete(attacker); return false; }
  const guardLead = p.parryWin() * (u.mobbed ? 0.7 : 1) * 0.65 + 0.12;
  // 逃げる・連れて退く段（def.botGuardFlee）は、穂先が届く直前だけ受け、あとは戦の頭の歩みに任せる
  if (b.def.botGuardFlee?.(b) && !attacker.charging && soonest > guardLead) return false;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
  p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
  inp.k.delete('KeyW'); inp.runHeld = false; inp.chargeHold = false;
  inp.guardHold = !!attacker.charging || soonest <= guardLead;
  if (inp.guardHold) { p.botStrikeUntil = 0; inp.leftPressed = false; return true; }
  // 溜めが長い間は詰めて突く（届かない所で受け続けない）
  if (ad > reach * 0.85 && !attacker.charging) goTo(p, inp, attacker.pos.x, attacker.pos.z, reach * 0.85);
  if (ad < reach) patientStrike(p, inp, attacker, ad, true);
  return true;
}

// 戦の def.botBrain の前に受けを挟む。段（b_depth）の間もこの頭を通す（botBrainDepth）
export function withGuard(def) {
  const own = def.botBrain;
  def.botBrainDepth = true;
  // 本人へ同時に打ち込むのは二人まで（織田家編の刀根坂・高遠と同じ。四人の刃を一度に受けると一太刀五割で倒れる）
  def.playerAtkMax = Math.min(def.playerAtkMax ?? 4, 2);
  // 元気な間は、追ってくる兵から味方の列へ退き続けない（受けは上の toyoGuard。退き続けると任務の時が尽きる）
  if (def.botDefendsFort === undefined) def.botDefendsFort = true;
  def.botBrain = function (b, inp, h) {
    const F = b.flags;
    if (!(b.over || b.ended || F.ending || F.holdPlayer) && toyoGuard(b, inp, h)) return true;
    if (own) return own.call(this, b, inp, h);
    if (F.dp && F.dp.on) { depthBot(b, inp, h.goTo); return true; }
    return false;
  };
  return def;
}
