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
    if (left > 2 && rt.t - F.waitBegan < 10) return;   // 11/12 司令塔：最初の斬り合い60秒・かかれの下知を早く（32→10秒）
    start(rt, C);
    return;
  }
  const t = rt.t - v.zeneiT;
  // 二十秒後の後続も迎えてから、鉄砲衆を破ったと判定する。
  if (!v.zeneiGs.some(live) && t > 10 || t > 25) done(rt, C, t > 25);
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
  // 11/12 手応え（桶狭間の中盤が薄い・突撃が見えない）：敵は鉄砲衆の十数人だけで、本人の前へ押し寄せる塊が無かった。
  //   雨に紛れて、林の奥から今川の先手の槍組が二つ一度に出て押し寄せ、織田の馬廻の騎馬が本人の見える所を横切って突っ込む。
  rt.after(9, () => surge(rt, C));
  sfx('thunder', 0.8);
  rt.after(1, () => rt.say('弥七', '組頭、西の林に今川の鉄砲衆が雨を避けてうずくまっておる！', 3.4));
  rt.after(4.6, () => rt.say('組頭 源八', 'この雨で火縄は湿って撃てぬ。今じゃ、林へ寄って鉄砲衆を突け！', 3.6));
  // 組も一緒に林へ寄せる
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'attack'; H.seekRange = 34; H.aggro = 14; H.focus = v.zeneiGs[0].units.find(ready) || null; }
}

function surge(rt, C) {
  const F = rt.flags, v = F.o15;
  if (v.zeneiDone || rt.over || F.ending || !rt.player.u.alive) return;
  const P = rt.player.u.pos;
  // 敵：林の奥の二方向から槍組が一度に出る（鉄砲衆の後ろ）
  for (const [x, z] of [[-64, -62], [-58, -26]]) {
    const a = C.fieldPoint(x, z);
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '今川の先手の槍組', anchor: a, facing: Math.atan2(P.x - a.x, P.z - a.z),
      formation: 'yari', spacing: 1.4, width: 6, morale: 70, aggro: 26, seekRange: 55, dmgMult: 0.5, fleeDir: C.fieldVector(-0.4, -1) },
    [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]);
    g.order = 'attack'; F.enemies?.push(g); v.zeneiGs.push(g);
  }
  rt.say('組頭 源八', '林の奥から槍が出てきたぞ！　組を固めよ！', 2.8);
  // 味方：馬廻の騎馬が、本人の後ろから林の鉄砲衆の方へ横切って突っ込む
  rt.after(2.5, () => {
    if (v.zeneiDone || rt.over || F.ending) return;
    const T = C.fieldPoint(-44, -38), dx = T.x - P.x, dz = T.z - P.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const a = { x: P.x - ux * 42 - uz * 12, z: P.z - uz * 42 + ux * 12 };   // 味方の厚い所（占められた場）から離れて出す（場所を探して三十m飛ぶのを防ぐ）
    const g = C.allyGroup(rt, { fixed: true, name: '織田の馬廻', anchor: a, facing: Math.atan2(ux, uz), formation: 'line', width: 6, order: 'attack', aggro: 40, seekRange: 70, morale: 100 },
      [{ type: 'cavalry', n: 6, o: { horse: true } }]);
    g.order = 'attack'; g.noRout = true;
    rt.say('弥七', '馬廻が突っ込む！　続け！', 2.6);
  });
}

function done(rt, C, late) {
  const F = rt.flags, v = F.o15;
  if (v.zeneiDone) return;
  v.zeneiDone = true; v.ph = null;
  for (const g of v.zeneiGs) if (live(g)) { g.order = 'retreat'; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(0.3, -1); }
  rt.say('組頭 源八', late ? '鉄砲衆は雨の中を山の方へ退いたか。旗へ戻れ、殿のかかれの下知を待つ' : '鉄砲衆が崩れて逃げたぞ。旗へ戻れ、殿のかかれの下知を待つ', 3.6);
  if (!late) rt.award((t) => t.side.push('雨に紛れて今川の鉄砲衆を討った'), '雨に紛れて今川の鉄砲衆を討った');
  const H = rt.hostGroup;
  if (H && !H.routed) { H.order = 'hold'; H.focus = null; H.aggro = 7; }
  F.waitReadyAt = rt.t + C.RAIN_WAIT + 1;
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
  // 近い戦いでも、次に進む場所のピンを残す。
  return { x: u.pos.x, z: u.pos.z, r: 6, hide: 6, key: 'o15-zenei', always: true, area: true };
}
