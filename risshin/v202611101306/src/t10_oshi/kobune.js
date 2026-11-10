// ======================================================================
// 忍城攻め　「城は水に浮かぶ」の段（6〜9分）　docs/toyo15_plan_1108.md の 13
// 史実：堰を切って水を入れると、城のまわりは一面の水になり、城は島のように浮いた（浮き城）。城兵は舟で出て寄せ手を悩ませた。
//   同じ六月、関東の北条の城は次々に開いた（鉢形城は六月十四日に開城。韮山はなお抵抗し、八王子へは前田・上杉の勢が向かった）。
// 遊び：時が飛び、水の満ちた沼に城が浮かぶ（水位はこの段の始めにもう一段上がり、田の小屋や木が沈んでいく）。
//   夕暮れ、城から小舟が三度、堤の内の岸へ寄せて兵を揚げる。城兵の狙いは主人公でなく堤（土を掘り、杭を抜く）。
//   堤の傷みは命の棒でなく、傾く杭・崩れる土・染みる水・亀裂で見せ、城兵を払うと人足が直す（docs/oshi_spec_1109.md 9〜11分）。
//   別の戦場の知らせが本陣から届く。三度目を退けると、六月十八日の大雨の夜（堤が切れる段）へ。
// 入れ方：b_t10_oshi.js の openWeir の後に start(rt, C)、update で tick(rt, dt, C)。
// ======================================================================
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { kobune } from '../props.js';
import { sfx } from '../audio.js';

const DIKE_PTS = [[-22, 14], [0, 0], [20, -13]];  // 舟が寄せる堤の三か所（区の西・真ん中・東）
const WAVES = [[0, 1], [2], [0, 1, 2]];           // 寄せの度ごとに使う岸（三度目は三か所から）
const WAVE_AT = [6, 40, 74];   // 11/10 忍城の作り直し：段を足したので詰めた   // 三巡 11/9：十八分に収めるため詰めた（前は 6・62・118）                     // 段の始めからの秒

// 堤の内の岸：堤の上から城の方へ、水際まで下りた所。舟の出る所はさらに沼の内
function landing(rt, C, px, pz) {
  const W = rt.world, F = rt.flags;
  const dx = C.BASIN.x - px, dz = C.BASIN.z - pz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let k = 2;
  for (; k < 40; k += 0.5) if (W.heightAt(px + ux * k, pz + uz * k) < C.LAKE_HI + 0.1) break;   // 満ちた後の水際（水位はこの段の始めに上がりきる）
  const land = { x: px + ux * (k - 1.5), z: pz + uz * (k - 1.5) };
  return { land, from: { x: px + ux * (k + 38), z: pz + uz * (k + 38) }, ux, uz };
}

export function start(rt, C) {
  const F = rt.flags, W = rt.world;
  if (F.step >= 5) return;
  F.step = 5; F.stepT = rt.t;
  rt.setPhase('kobune');
  rt.obj('main', C.MISSIONS[4], 'main');
  // 時が飛ぶ（水を入れて数日）。沼はもう一段満ち、田の小屋や木が沈み、城は島のように浮く
  // 前日の堰の寄せは城へ戻っている。新しい岸の任務へ古い敵や標的を持ち越さない。
  if (F.weirRaid) for (const u of F.weirRaid.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.lakeY = Math.max(F.lakeY ?? C.LAKE_MID, C.LAKE_MID); F.lakeTo = C.LAKE_HI; if (F.lake) F.lake.position.y = F.lakeY;
  W.setTime('dusk'); W.setRainTarget?.(0.25);
  C.warp(rt, C.KU.x + 2, C.KU.z + 4, Math.atan2(C.BASIN.x - C.KU.x, C.BASIN.z - C.KU.z));
  rt.banner('六月　城は水に浮かぶ', '舟で寄せる城兵から、堤を守れ');
  sfx('taiko', 0.7);
  const K = F.kob = { t0: rt.t, wave: 0, boats: [], groups: [], spots: DIKE_PTS.map(([x, z]) => landing(rt, C, x, z)) };
  // 堤の傷み（城兵が掘る所）。岸の少し陸の側、堤の内の法
  K.wounds = C.dikeWounds(rt, K.spots.map((S) => [S.land.x - S.ux * 2.5, S.land.z - S.uz * 2.5]));
  K.spots.forEach((S, i) => { S.wound = K.wounds[i]; });
  // 区の足軽は堤の上に戻り、岸を固める。堤の上に石田の鉄砲を並べ、舟を撃つ
  if (C.live(F.guard)) {
    const g = F.guard;
    g.order = 'hold'; g.anchor = { x: C.KU.x - 2, z: C.KU.z - 2 }; g.aggro = 12; g.seekRange = 14; g.ai = false; g.onArrive = null;
    // 要だけ移すと足軽は西の堰に残り、最初の舟を本人一人で受ける。日が替わる時に兵も堤の筋へ戻す。
    let i = 0;
    for (const u of g.units) if (u.alive && !u.gone) {
      const along = ((i >> 1) - 2) * 1.4, side = i++ % 2 ? 0.7 : -0.7;
      const x = g.anchor.x + along * 0.832 + side * 0.555, z = g.anchor.z - along * 0.555 + side * 0.832;
      u.target = null; u.watch = null; u.atk = null;
      u.pos.set(x, W.heightAt(x, z), z);
      if (u.vel) u.vel.x = u.vel.y = u.vel.z = 0;
      if (u.push) u.push.x = u.push.z = 0;
      if (u.mesh) u.mesh.position.copy(u.pos);
    }
  }
  K.guns = allyGroup(rt, { faction: 'ishida', name: '堤の鉄砲', fullStrength: true, anchor: { x: C.KU.x + 6, z: C.KU.z - 3 }, facing: Math.atan2(C.BASIN.x, C.BASIN.z), width: 6, aggro: 30, order: 'hold', fixed: true, noRout: true, dmgMult: 0.5 },
    C.dress([{ type: 'gun', n: 5 }, { type: 'samurai', n: 1 }], C.ISHI));
  const me = nm(rt);
  rt.after(2.5, () => rt.say(me, '昨日まで道だった所が水じゃ。小屋も木も沈んでゆく……', 3.2));
  rt.after(7, () => rt.say('石田勢の足軽', '……まだおるぞ。城の塀に旗が立っておる', 3));
  rt.after(11, () => rt.say(me, '沈まぬな。城は水の上に浮いておる', 3));
  rt.after(20, () => rt.say('使番', '本陣へ知らせ！　鉢形城、開城！　北条氏邦殿、城を出られた', 3.6));
  rt.after(24.5, () => rt.say('石田三成', '関東の城は次々に開く。忍だけが残るわけにはゆかぬ', 3.4));
  rt.after(84, () => rt.say('使番', '韮山はなお抵抗。八王子へは前田・上杉の勢が向かったとの事', 3.6));
  rt.after(150, () => rt.say(me, '水を入れたら、城の者は舟で自在に出てくる。わしらの水が、あちらの道になった', 3.4));
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
  rt.say('石田勢の足軽', i === 2 ? '舟が三方から来るぞ！　堤を切られる！' : i === 1 ? '舟じゃ！　鍬と鋤を積んでおる。堤を掘る気じゃ！' : '城から小舟が出た！　岸へ寄せてくるぞ！', 3);
}

// 舟の上の城兵：舟の床の高さに据え、舟と一緒に動かす（units.js の perch：y を持つと床の高さを保つ）
function aboard(rt, B) {
  const m = B.mesh.position, h = B.mesh.rotation.y, c = Math.cos(h), s = Math.sin(h), y = rt.flags.lakeY + 0.28;
  B.g.units.forEach((u, i) => {
    if (!u.alive || u.gone) return;
    const lz = 2.2 - i * 0.75, lx = (i % 2 ? 0.28 : -0.28);
    const x = m.x + s * lz + c * lx, z = m.z + c * lz - s * lx;
    const perch = u.perch || (u.perch = { x: 0, y: 0, z: 0 });
    perch.x = x; perch.y = y; perch.z = z;
    u.pos.set(x, y, z); if (u.mesh) { u.mesh.position.copy(u.pos); u.mesh.rotation.y = h; } u.heading = h;
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
  // 狙いは堤：掘る所へ行き、寄って来た者とだけ斬り合う
  g.order = 'move'; g.dest = { x: S.wound.x, z: S.wound.z }; g.seekRange = 6; g.aggro = 4; g.speed = 2.6;
  g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: S.wound.x, z: S.wound.z }; };
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
  // 待ち時間は一コマに一度だけ減らす。兵ごとに減らすと人数で間隔が変わり、一人だけが索敵していた。
  K.seekT = (K.seekT || 0) - dt;
  const seek = K.seekT <= 0;
  if (seek) K.seekT = 0.4;
  for (const g of K.groups) {
    if (!C.fighting(g)) continue;
    const left = g.units.filter((u) => u.alive && !u.gone && !u.fleeing);
    if (left.length <= 1 || rt.t - g.landT > 50) { g.noRout = false; g.morale = 0; for (const u of left) u.fleeing = true; }
    for (const u of left) {
      if (!C.near(u.pos, g.S.land, 20)) { u.target = null; continue; }
      // 揚がった城兵は堤を掘る。そばへ寄った寄せ手（主人公も）とだけ斬り合う
      if ((!u.target || !u.target.alive || u.target.gone) && seek) u.target = rt.army.nearestEnemy(u, 5, (o) => C.near(o.pos, g.S.land, 22));
    }
  }
  // 堤の傷み：掘る城兵がいる間は進み、いなくなると人足が直す（見た目だけ。段の進みはこれに頼らない）
  for (const Wd of K.wounds || []) {
    let dig = 0;
    for (const g of K.groups) if (g.S.wound === Wd) for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !(u.target?.alive) && C.near(u.pos, Wd, 4)) dig++;
    const was = Wd.dmg;
    Wd.dmg = Math.max(0, Math.min(1, Wd.dmg + (dig ? dig * 0.012 : -0.03) * dt));
    if (was < 0.35 && Wd.dmg >= 0.35 && !K.warned) { K.warned = rt.t; rt.say('石田勢の足軽', '杭が傾いた！　水が染み出しておる。堤を掘らせるな！', 3); }
    if (Wd.shown < 0 || Math.abs(Wd.dmg - was) > 0) C.showWound(Wd);
  }
  // 退いた城兵は水際で消える（舟に戻った）
  for (const g of K.groups) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && rt.world.heightAt(u.pos.x, u.pos.z) < F.lakeY + 0.3) rt.army.despawn(u);
  const done = K.wave >= WAVES.length && K.boats.every((B) => B.landed) && !K.groups.some(C.fighting);
  // 最後の舟が着き、城兵が退くまで迎え撃つ。時刻だけで残る城兵を消して済ませない。
  const P = rt.player.u;
  const atShore = K.spots.some((S) => C.near(P.pos, S.land, 24));
  if (!K.end && done && P.alive && atShore) {
    K.end = rt.t;
    for (const g of K.groups) if (C.live(g)) { g.noRout = false; g.morale = 0; for (const u of g.units) if (u.alive && !u.gone) u.fleeing = true; }
    rt.award((tr) => { tr.side.push('舟で寄せた城兵を岸で退けた'); }, '舟で寄せた城兵を退けた');
    rt.say('石田勢の侍', '舟は城へ戻った。人足、堤を直せ。……だが、空が暗い。大雨が来るぞ', 3.6);
    rt.after(5, () => { for (const g of K.groups) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); if (K.guns) for (const u of K.guns.units) if (u.alive && !u.gone) rt.army.despawn(u); C.def.storm(rt); });
  }
}

// 行き先：揚がって戦う城兵の岸。いなければ、次の舟の来る岸
export function pin(rt) {
  const F = rt.flags, K = F.kob;
  if (!K || F.step !== 5) return undefined;
  // 引き揚げの知らせから大雨の段へ替わる間も、岸の印を消さない。
  const g = K.groups.find((q) => q.units.some((u) => u.alive && !u.gone && !u.fleeing));
  if (g) return { x: g.S.wound.x, z: g.S.wound.z, r: 6, label: '堤の内の岸' };
  const B = K.boats.find((q) => !q.landed);
  const S = B ? B.S : K.spots[1];
  return { x: S.land.x, z: S.land.z, r: 6, label: '堤の内の岸' };
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
