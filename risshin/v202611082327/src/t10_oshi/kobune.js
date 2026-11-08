// ======================================================================
// 忍城攻め　「城は水に浮かぶ」の段（6〜9分）　docs/toyo15_plan_1108.md の 13
// 史実：堰を切って水を入れると、城のまわりは一面の水になり、城は島のように浮いた（浮き城）。城兵は舟で出て寄せ手を悩ませた。
//   同じ六月、関東の北条の城は次々に開いた（鉢形城は六月十四日に開城。韮山はなお抵抗し、八王子へは前田・上杉の勢が向かった）。
// 遊び：時が飛び、水の満ちた沼に城が浮かぶ。城から小舟が三度、堤の内の岸へ寄せて兵を揚げる。区の足軽・鉄砲と岸で迎え撃つ。
//   別の戦場の知らせが本陣から届く。三度目を退けると、六月十八日の大雨の夜（堤が切れる段）へ。
// 入れ方：b_t10_oshi.js の openWeir の後に start(rt, C)、update で tick(rt, dt, C)。
// ======================================================================
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { kobune } from '../props.js';
import { sfx } from '../audio.js';

const LIMIT = 160;                                // 段の長さの限り（秒）
const DIKE_PTS = [[-22, 14], [0, 0], [20, -13]];  // 舟が寄せる堤の三か所（区の西・真ん中・東）
const WAVES = [[0, 1], [2], [0, 1, 2]];           // 寄せの度ごとに使う岸（三度目は三か所から）
const WAVE_AT = [6, 62, 118];                     // 段の始めからの秒

// 堤の内の岸：堤の上から城の方へ、水際まで下りた所。舟の出る所はさらに沼の内
function landing(rt, C, px, pz) {
  const W = rt.world, F = rt.flags;
  const dx = C.BASIN.x - px, dz = C.BASIN.z - pz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let k = 2;
  for (; k < 40; k += 0.5) if (W.heightAt(px + ux * k, pz + uz * k) < F.lakeY + 0.1) break;
  const land = { x: px + ux * (k - 1.5), z: pz + uz * (k - 1.5) };
  return { land, from: { x: px + ux * (k + 38), z: pz + uz * (k + 38) }, ux, uz };
}

export function start(rt, C) {
  const F = rt.flags, W = rt.world;
  if (F.step >= 5) return;
  F.step = 5; F.stepT = rt.t;
  rt.setPhase('kobune');
  rt.obj('main', C.MISSIONS[4], 'main');
  // 時が飛ぶ（水を入れて数日）。沼は満ち、城は島のように浮く
  F.lakeY = C.LAKE_HI; if (F.lake) F.lake.position.y = F.lakeY;
  W.setTime('day'); W.setRainTarget?.(0.25);
  C.warp(rt, C.KU.x + 2, C.KU.z + 4, Math.atan2(C.BASIN.x - C.KU.x, C.BASIN.z - C.KU.z));
  rt.banner('六月　城は水に浮かぶ', '堤へ寄せる城の小舟を追い払え');
  sfx('taiko', 0.7);
  const K = F.kob = { t0: rt.t, wave: 0, boats: [], groups: [], spots: DIKE_PTS.map(([x, z]) => landing(rt, C, x, z)) };
  // 区の足軽は堤の上に戻り、岸を固める。堤の上に石田の鉄砲を並べ、舟を撃つ
  if (C.live(F.guard)) { F.guard.order = 'hold'; F.guard.anchor = { x: C.KU.x - 2, z: C.KU.z - 2 }; F.guard.aggro = 12; F.guard.seekRange = 14; F.guard.ai = false; F.guard.onArrive = null; }
  K.guns = allyGroup(rt, { faction: 'ishida', name: '堤の鉄砲', fullStrength: true, anchor: { x: C.KU.x + 6, z: C.KU.z - 3 }, facing: Math.atan2(C.BASIN.x, C.BASIN.z), width: 6, aggro: 30, order: 'hold', fixed: true, noRout: true, dmgMult: 0.5 },
    C.dress([{ type: 'gun', n: 5 }, { type: 'samurai', n: 1 }], C.ISHI));
  const me = nm(rt);
  rt.after(2.5, () => rt.say(me, '城が……沼の中に島のように浮いておる', 3));
  rt.after(20, () => rt.say('使番', '本陣へ知らせ！　鉢形城、開城！　北条氏邦殿、城を出られた', 3.6));
  rt.after(24.5, () => rt.say('石田三成', '関東の城は次々に開く。忍だけが残るわけにはゆかぬ', 3.4));
  rt.after(84, () => rt.say('使番', '韮山はなお抵抗。八王子へは前田・上杉の勢が向かったとの事', 3.6));
  rt.after(150, () => rt.say(me, '水で囲んでも、城の者は舟で出てくる……沈まぬ城じゃ', 3.2));
}

function launch(rt, C, i) {
  const F = rt.flags, K = F.kob;
  for (const s of WAVES[i]) {
    const S = K.spots[s];
    const b = kobune(S.from.x, F.lakeY + 0.05, S.from.z, Math.atan2(S.land.x - S.from.x, S.land.z - S.from.z), 7);
    if (!b) continue;
    rt.scene.add(b);
    const B = { mesh: b, S, landed: false, back: false, wave: i };
    // 舟に乗った城兵（舟の上では討てない。岸に揚がってから戦う）
    B.g = enemyGroup(rt, { faction: 'narita', name: '舟で寄せた城兵', anchor: { ...S.from }, facing: Math.atan2(S.land.x - S.from.x, S.land.z - S.from.z), width: 2, noRout: true, noAI: true, order: 'hold', aggro: 0, morale: 80, dmgMult: 0.42 },
      C.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: i === 2 ? 4 : 5 }, { type: 'bow', n: 1 }], C.HOJO));
    B.g.peaceful = true;
    for (const u of B.g.units) { u.invuln = true; u.noTarget = true; }
    aboard(rt, B);
    K.boats.push(B);
  }
  rt.army.play('eshout', K.spots[WAVES[i][0]].from, 1.1);
  rt.say('石田勢の足軽', i === 2 ? '舟が三方から来るぞ！　岸を固めよ！' : '城から小舟が出た！　岸へ寄せてくるぞ！', 3);
}

// 舟の上の城兵：舟の床の高さに据え、舟と一緒に動かす（units.js の perch：y を持つと床の高さを保つ）
function aboard(rt, B) {
  const m = B.mesh.position, h = B.mesh.rotation.y, c = Math.cos(h), s = Math.sin(h), y = rt.flags.lakeY + 0.28;
  B.g.units.forEach((u, i) => {
    if (!u.alive || u.gone) return;
    const lz = 2.2 - i * 0.75, lx = (i % 2 ? 0.28 : -0.28);
    const x = m.x + s * lz + c * lx, z = m.z + c * lz - s * lx;
    u.perch = { x, y, z }; u.pos.set(x, y, z); if (u.mesh) { u.mesh.position.copy(u.pos); u.mesh.rotation.y = h; } u.heading = h;
  });
}
function land(rt, C, B) {
  const K = rt.flags.kob, S = B.S;
  B.landed = true;
  const g = B.g;
  // 岸に跳び下りる：舟から下ろし、討てるようにして斬り込ませる
  g.units.forEach((u, i) => {
    if (!u.alive || u.gone) return;
    u.perch = null; u.invuln = false; u.noTarget = false;
    const k = (i % 3 - 1) * 1.2, r = Math.floor(i / 3) * 1.1;   // 岸に沿って三人ずつ、二列目は陸の側へ
    const x = S.land.x - S.uz * k - S.ux * r, z = S.land.z + S.ux * k - S.uz * r;
    u.pos.set(x, rt.world.heightAt(x, z), z); if (u.mesh) u.mesh.position.copy(u.pos);
  });
  g.peaceful = false; g.noAI = false; g.anchor = { ...S.land }; g.fleeDir = { x: S.ux, z: S.uz }; g.formation = 'line';
  g.order = 'attack'; g.seekRange = 22; g.aggro = 12;
  g.S = S; g.landT = rt.t;
  K.groups.push(g);
  sfx('wade', 0.8);
  rt.army.play('eshout', S.land, 1);
}

export function tick(rt, dt, C) {
  const F = rt.flags, K = F.kob;
  if (!K || F.step !== 5) return;
  const t = rt.t - K.t0;
  while (K.wave < WAVES.length && t >= WAVE_AT[K.wave]) launch(rt, C, K.wave++);
  // 舟：岸へ漕ぎ寄せる。兵を揚げたら沼の内へ戻り、消える
  for (const B of K.boats) {
    if (!B.mesh.visible) continue;
    const to = B.back ? B.S.from : B.S.land, m = B.mesh.position;
    const dx = to.x - m.x, dz = to.z - m.z, L = Math.hypot(dx, dz);
    m.y = F.lakeY + 0.05;
    if (L > 2.2) { const v = Math.min(L, dt * 4.2); m.x += dx / L * v; m.z += dz / L * v; B.mesh.rotation.y = Math.atan2(dx, dz); if (!B.landed) aboard(rt, B); }
    else if (!B.back) { land(rt, C, B); B.back = true; }
    else B.mesh.visible = false;
  }
  // 揚がった城兵は岸から離れて堤の奥へは行かない（堤を越えて陣へ流れ込まない）。一人になるか五十秒で舟へ退く
  for (const g of K.groups) {
    if (!C.fighting(g)) continue;
    const left = g.units.filter((u) => u.alive && !u.gone && !u.fleeing);
    if (left.length <= 1 || rt.t - g.landT > 50) { g.noRout = false; g.morale = 0; for (const u of left) u.fleeing = true; }
    for (const u of left) {
      if (!C.near(u.pos, g.S.land, 20)) { u.target = null; continue; }
      // 揚がって立ち尽くさない：狙いが無ければ岸の近くの寄せ手（主人公も）を狙う
      if ((!u.target || !u.target.alive) && (K.seekT = (K.seekT || 0) - dt) <= 0) { K.seekT = 0.4; const e = rt.army.nearestEnemy(u, 22, (o) => C.near(o.pos, g.S.land, 22)); if (e) u.target = e; }
    }
  }
  // 退いた城兵は水際で消える（舟に戻った）
  for (const g of K.groups) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && rt.world.heightAt(u.pos.x, u.pos.z) < F.lakeY + 0.3) rt.army.despawn(u);
  const done = K.wave >= WAVES.length && K.boats.every((B) => B.landed) && !K.groups.some(C.fighting);
  if (!K.end && (done || t > LIMIT)) {
    K.end = rt.t;
    for (const g of K.groups) if (C.live(g)) { g.noRout = false; g.morale = 0; for (const u of g.units) if (u.alive && !u.gone) u.fleeing = true; }
    rt.award((tr) => { tr.side.push('舟で寄せた城兵を岸で退けた'); }, '舟で寄せた城兵を退けた');
    rt.say('石田勢の侍', '舟は城へ戻った。……だが、空が暗い。大雨が来るぞ', 3.4);
    rt.after(5, () => { for (const g of K.groups) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); if (K.guns) for (const u of K.guns.units) if (u.alive && !u.gone) rt.army.despawn(u); C.def.storm(rt); });
  }
}

// 行き先：揚がって戦う城兵の岸。いなければ、次の舟の来る岸
export function pin(rt) {
  const F = rt.flags, K = F.kob;
  if (!K || F.step !== 5) return undefined;
  if (K.end) return null;
  const g = K.groups.find((q) => q.units.some((u) => u.alive && !u.gone && !u.fleeing));
  if (g) return { x: g.S.land.x, z: g.S.land.z, r: 6 };
  const B = K.boats.find((q) => !q.landed);
  const S = B ? B.S : K.spots[1];
  return { x: S.land.x, z: S.land.z, r: 6 };
}

export function bot(b, inp, T, C) {
  const p = b.player, u = p.u, F = b.flags, K = F.kob;
  if (!K || F.step !== 5) return false;
  const e = b.army.nearestEnemy(u, 26, (o) => !o.fleeing && !o.invuln && b.world.heightAt(o.pos.x, o.pos.z) > F.lakeY - 0.3);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) T.goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    T.patientStrike(p, inp, e, d, true);
    return true;
  }
  const q = pin(b);
  if (q) T.goTo(p, inp, q.x, q.z, 3); else inp.k.delete('KeyW');
  return true;
}
