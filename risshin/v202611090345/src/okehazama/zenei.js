// ======================================================================
// 桶狭間 4〜6分：雨宿りの今川の鉄砲衆（谷の出口の林）
//   『信長公記』：石氷を投げ打つような急な雨が今川の顔へ吹きつけ、大木も倒れた。織田勢は雨に紛れて山際へ寄せた。
//   谷の出口で雨を待つ間、物見を迎え討った後に、西の林で雨を避けてうずくまる今川の鉄砲衆（二組）が見つかる。
//   火縄は濡れて撃てない（鉄砲は撃たせない）。組と一緒に林へ寄って討つ。崩れたら旗へ戻り、雨が上がるのを待つ（本体の雨待ち）。
//   一分四十秒で決まらなければ、鉄砲衆は雨の中を山の方へ退く（物語は進む）。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const live = (g) => g && !g.routed && g.units.some(ready);

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.zeneiDone || rt.over || F.ending) return;
  if (!v.zeneiT) {
    if (rt.phase !== 'wait' || F.waitBegan == null) return;
    F.waitReadyAt = Infinity;   // 雨待ちに入ったら、鉄砲衆を討つまで雨は止まない
    if (!F.scoutStarted) return;
    const left = (F.road?.[0]?.units || []).filter(ready).length;
    if (left > 2 && rt.t - F.waitBegan < 32) return;
    start(rt, C);
    return;
  }
  const t = rt.t - v.zeneiT;
  if (!v.zeneiGs.some(live) && t > 8 || t > 100) done(rt, C, t > 100);
}

function start(rt, C) {
  const F = rt.flags, v = F.o15;
  v.zeneiT = rt.t; v.ph = 'zenei';
  F.waitReadyAt = Infinity;   // 鉄砲衆を討つまで、雨は止まない（本体の雨待ちを止める）
  v.zeneiGs = [[-36, -52, 0.6], [-44, -38, 0.9]].map(([x, z, f]) => {
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '今川の鉄砲衆', anchor: C.fieldPoint(x, z), facing: f + C.FIELD_TURN,
      formation: 'line', width: 4, morale: 55, aggro: 6, seekRange: 10, dmgMult: 0.45, fleeDir: C.fieldVector(-0.4, -1), ambush: true },
    [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }]);
    g.fire = false;   // 火縄が濡れて撃てない
    F.enemies?.push(g);
    return g;
  });
  // 二十秒の後、林の奥からもう一組（雨宿りの陣は一つでない）
  rt.after(20, () => {
    if (v.zeneiDone || rt.over || F.ending) return;
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '今川の鉄砲衆', anchor: C.fieldPoint(-50, -58), facing: 0.7 + C.FIELD_TURN,
      formation: 'line', width: 4, morale: 60, aggro: 12, seekRange: 22, dmgMult: 0.45, fleeDir: C.fieldVector(-0.4, -1) }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 2 }]);
    g.fire = false; g.order = 'attack'; F.enemies?.push(g); v.zeneiGs.push(g);
    rt.say('組頭 源八', '林の奥にもう一組おるぞ！　逃がすな！', 2.8);
  });
  sfx('thunder', 0.8);
  rt.after(1, () => rt.say('弥七', '組頭、西の林に今川の鉄砲衆が雨を避けてうずくまっておる！', 3.4));
  rt.after(4.6, () => rt.say('組頭 源八', 'この雨で火縄は湿って撃てぬ。今じゃ、林へ寄って鉄砲衆を突け！', 3.6));
  // 組も一緒に林へ寄せる
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 34; H.aggro = 14; H.focus = v.zeneiGs[0].units.find(ready) || null; }
}

function done(rt, C, late) {
  const F = rt.flags, v = F.o15;
  if (v.zeneiDone) return;
  v.zeneiDone = true; v.ph = null;
  for (const g of v.zeneiGs) if (live(g)) { g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0.3, -1); }
  rt.say('組頭 源八', late ? '鉄砲衆は雨の中を山の方へ退いたか。旗へ戻れ、雨の上がるのを待つ' : '鉄砲衆が崩れて逃げたぞ。旗へ戻れ、雨の上がるのを待つ', 3.6);
  if (!late) rt.award((t) => t.side.push('雨に紛れて今川の鉄砲衆を討った'), '雨に紛れて今川の鉄砲衆を討った');
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'hold'; H.focus = null; H.aggro = 7; }
  F.waitReadyAt = rt.t + C.RAIN_WAIT + 4;
  rt.after(16, () => { for (const g of v.zeneiGs) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 40) rt.army.despawn(u); });
}

export function target(rt) {
  const v = rt.flags.o15, P = rt.player.u.pos;
  let best = null, bd = Infinity;
  for (const g of v.zeneiGs || []) for (const u of g.units) {
    if (!ready(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  if (!u) return null;
  const P = rt.player.u.pos;
  if (Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 14) return null;   // 近ければ相手の頭上の赤い▼だけ
  return { x: u.pos.x, z: u.pos.z, r: 6, hide: 6, key: 'o15-zenei', always: true, area: true };
}
