// 全戦共通の遠景。兵や任務には触れず、既存の軽い軍勢だけを補う。
import { HALF, WIND_STATE } from './world.js';
import { S } from './settings.js';
import { signal, sfx, withPan, farNext } from './audio.js';
import { jinkeiInit, jinkeiTick } from './jinkei.js';

const EMPTY = [];
const limit = (W) => (W.half || HALF) - 24;
const clamp = (v, W) => Math.max(-limit(W), Math.min(limit(W), v));
function side() {
  return { x: 0, z: 0, px: 0, pz: 0, hx: 0, hz: 0, n: 0, total: 0,
    flag: null, armor: undefined, guns: false,
    routed: 0, retreat: 0, fight: 0, charge: 0, seen: false, headquarters: false,
    soundT: 0, roarT: 0, roarStep: 0, heard: '', point: { x: 0, z: 0 }, state: 'ADVANCE' };
}

// 本陣は総大将・備から、前線は本陣と予備を除いた備から拾う。
// 備のない古い戦も、本物の組を読むだけで同じ見せ方になる。
function scan(rt, D) {
  for (let team = 0; team < 2; team++) {
    const T = D.sides[team];
    T.px = T.x; T.pz = T.z;
    T.x = T.z = T.n = T.total = T.routed = T.retreat = T.fight = T.charge = 0;
    const H = rt.taisho && (team === 0 ? rt.taisho.a : rt.taisho.b);
    T.flag = rt.def.sides?.[team ? 'b' : 'a']?.mon || H?.mon || null;
    T.guns = false;
    let largest = 0;
    // 借りた家の兵でも、実際に持つ旗と具足を優先する。
    for (const g of rt.army.groups) {
      if (g.team !== team || g.people || g.civ || g.hidden || g.hideFlags || g.isRunner || g.routed) continue;
      let n = 0, look = null;
      for (const u of g.units) {
        if (!u.alive || u.isStruct || u.fleeing || u.type === 'porter' || u.type === 'dummy') continue;
        n++; look = look || u.look;
        if (u.type === 'gun' || u.lookWeapon === 'gun') T.guns = true;
      }
      if (n > largest && look) {
        largest = n; T.armor = look.armor;
        if (!rt.def.sides?.[team ? 'b' : 'a']?.mon && !H?.mon) T.flag = look.standard || look.flag || look.mon || T.flag;
      }
    }
    const hp = H && H.state !== 'dead' && !H.captured && (H.u ? (H.u.alive && H.u.pos) : H.at);
    let honjin = hp;
    for (const s of rt.sonae || EMPTY) {
      if (rt.withdrawal) continue;
      if (s.team !== team) continue;
      if (s.b.real?.hidden || s.b.real?.hideFlags) continue;
      if (s.line === 'honjin') {
        if (s.b.aliveNominal() && s.state !== '敗走') honjin = s.b.pos;
        continue;
      }
      if (s.line === 'gotsume') continue;
      const n = s.b.aliveNominal();
      T.total += Math.max(1, n);
      if (!n || s.state === '敗走') { T.routed += Math.max(1, n); continue; }
      T.x += s.b.pos.x * n; T.z += s.b.pos.z * n; T.n += n;
      if (s.state === '後退中' || s.b.cmd.id === 'retreat') T.retreat += n;
      if (s.state === '交戦中') T.fight += n;
      if (s.b.cmd.id === 'charge') T.charge += n;
    }
    if (!T.total) for (const g of rt.army.groups) {
      if (g.team !== team || g.people || g.civ || g.hidden || g.hideFlags || g.isRunner || (H && g === H.g)) continue;
      let n = 0, x = 0, z = 0;
      for (const u of g.units) {
        if (!u.alive || u.isStruct || u.type === 'dummy' || u.type === 'porter') continue;
        x += u.pos.x; z += u.pos.z; n++;
        // 柵は線分か直接の座標を持ち、兵の pos は持たない。兵同士の交戦だけを数える。
        if (u.target && u.target.alive && !u.target.isStruct && u.target.team !== team && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 8) T.fight++;
      }
      T.total += n;
      if (g.routed) { T.routed += n; continue; }
      T.x += x; T.z += z; T.n += n;
      if (g.order === 'retreat') T.retreat += n;
      if (g.order === 'charge') T.charge += n;
    }
    // 既存の本陣も読む。自分で足した飾りから本陣を推測し直さない。
    if (!honjin && !(H && (H.state === 'dead' || H.captured))) for (const a of rt.world.armies || EMPTY) {
      if (a.team !== team || a._autoDistant || a.kind !== 'honjin' || a.rout || !a.mesh.visible) continue;
      T.point.x = a.mesh.position.x + a.cx + a.off.x;
      T.point.z = a.mesh.position.z + a.cz + a.off.z;
      honjin = T.point;
      break;
    }
    T.headquarters = !!honjin;
    // 本物がまだ近くにいない戦は、既存の軽い軍勢を戦線にする。
    if (!T.total) for (const a of rt.world.armies || EMPTY) {
      if (a.team !== team || a._autoDistant || a.people || !a.mesh.visible || a.kind === 'honjin') continue;
      const n = Math.max(0, a.n - (a.took || 0));
      T.flag = T.flag || a.mon;
      if (a.kind === 'gun' || a.kinds?.includes(1)) T.guns = true;
      T.total += n;
      if (a.rout) { T.routed += n; continue; }
      T.x += (a.mesh.position.x + a.cx + a.off.x) * n;
      T.z += (a.mesh.position.z + a.cz + a.off.z) * n; T.n += n;
      if (a.tw?.back) T.retreat += n;
      if (a.tw?.charge) T.charge += n;
    }
    if (!T.total) for (const c of rt.world.clashes || EMPTY) {
      if (c._autoDistant) continue;
      const a = team === 0 ? c.A : c.B;
      if (a.P.team !== team || a.P.hidden) continue;
      T.flag = T.flag || a.P.flag || a.P.flagTex?.userData.mon;
      if (a.P.guns) T.guns = true;
      T.total += a.alive;
      if (a.routed) { T.routed += a.alive; continue; }
      T.x += c.x * a.alive; T.z += c.z * a.alive; T.n += a.alive;
      if (c.phase === 'fight') T.fight += a.alive;
    }
    if (T.n) { T.x /= T.n; T.z /= T.n; }
    else if (T.seen) { T.x = T.px; T.z = T.pz; }
    else {
      const p = rt.def.spawn || rt.player.u.pos, h = rt.def.spawn?.heading || 0;
      T.x = p.x + Math.sin(h) * team * 90; T.z = p.z + Math.cos(h) * team * 90;
    }
    if (honjin) { T.hx = honjin.x; T.hz = honjin.z; }
    else { T.hx = T.x; T.hz = T.z; }
  }
  const A = D.sides[0], B = D.sides[1];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  D.facing = len > 1 ? Math.atan2(dx, dz) : (rt.def.spawn?.heading || 0);
  D.x = (A.x + B.x) / 2; D.z = (A.z + B.z) / 2;
  for (let team = 0; team < 2; team++) {
    const T = D.sides[team], sign = team === 0 ? 1 : -1;
    const step = ((T.x - T.px) * Math.sin(D.facing) + (T.z - T.pz) * Math.cos(D.facing)) * sign;
    const wasSeen = T.seen;
    if (T.total) T.seen = true;
    if ((wasSeen && !T.n) || (T.total && T.routed / T.total >= 0.6)) T.state = 'ROUT';
    else if (T.retreat > T.n * 0.3 || (wasSeen && step < -1.5)) T.state = 'RETREAT';
    else if (T.charge > T.n * 0.3 || (T.fight && wasSeen && step > 0.7)) T.state = 'PUSH';
    else if (T.fight || (T.n && len < 38)) T.state = 'FIGHT';
    else T.state = 'ADVANCE';
  }
}

// 海・急斜面・建物の中には足さない。既存の遠景の戦とも重ねない。
function land(rt, x, z) {
  const W = rt.world;
  if (Math.abs(x) > limit(W) || Math.abs(z) > limit(W) || W.inWaterAt(x, z)) return false;
  const y = W.heightAt(x, z);
  for (let i = 0; i < 4; i++) {
    const px = x + (i < 2 ? (i ? -12 : 12) : 0), pz = z + (i >= 2 ? (i === 2 ? 12 : -12) : 0);
    if (W.inWaterAt(px, pz) || Math.abs(W.heightAt(px, pz) - y) > 7) return false;
  }
  for (const o of rt.army.solids || EMPTY) {
    if (x >= o.x0 - 14 && x <= o.x1 + 14 && z >= o.z0 - 14 && z <= o.z1 + 14) return false;
  }
  // 遠景の控えを置く時も動かす時も、本物の兵の通り道は空ける。
  // 隊の幅と次の読み直しまでの歩みを含め、真ん中から二十四メートルは離す。
  for (const u of rt.army.units) {
    if (!u.alive || u.type === 'dummy') continue;
    if (u.isStruct && u.seg) {
      const p = u.seg;
      if (x >= Math.min(p[0], p[2]) - 14 && x <= Math.max(p[0], p[2]) + 14 &&
          z >= Math.min(p[1], p[3]) - 14 && z <= Math.max(p[1], p[3]) + 14) return false;
    }
    if (!u.pos) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    if (dx * dx + dz * dz < 24 * 24) return false;
  }
  return true;
}

function build(rt, D) {
  const W = rt.world, f = D.facing, fx = Math.sin(f), fz = Math.cos(f);
  const A = D.sides[0], B = D.sides[1];
  if (!A.n || !B.n || !A.flag || !B.flag) return;
  const flagA = A.flag, flagB = B.flag;
  // 合計の上限を保ち、二軍の兵数差を旗の列の厚さでも見せる。
  const total = A.n + B.n, countA = Math.max(24, Math.min(120, Math.round(144 * A.n / total)));
  const countB = 144 - countA;
  const max = S.quality === 'low' ? 1 : 2;
  for (let k = 0; k < max; k++) {
    const sign = k === 0 ? -1 : 1;
    for (let j = 0; j < 4; j++) {
      const off = sign * (85 + j * 16), x = D.x + fz * off, z = D.z - fx * off;
      if (!land(rt, x, z) || covered(W, x, z)) continue;
      const P = { x, z };
      const C = W.addClash({ x, z, facing: f, w: 22, bw: 6, gap0: 20, seed: 830 + k,
        noWake: true, noRout: true, killRate: 0, maxDrift: 14, nearHide: 60,
        A: { flag: flagA, armor: A.armor, count: countA, team: 0, flagRate: 1 },
        B: { flag: flagB, armor: B.armor, count: countB, team: 1, flagRate: 1 },
        link: () => P });
      C._autoDistant = true;
      D.lines.push({ C, P, offset: off });
      break;
    }
  }
  for (let team = 0; team < 2; team++) {
    const T = D.sides[team], sign = team === 0 ? 1 : -1;
    for (let j = 0; j < 4; j++) {
      const off = sign * (65 + j * 18), x = (T.x + T.hx) / 2 + fz * off, z = (T.z + T.hz) / 2 - fx * off;
      if (!land(rt, x, z) || covered(W, x, z)) continue;
      const target = { x, z, facing: f + (team ? Math.PI : 0) };
      const count = Math.max(16, Math.min(80, Math.round(96 * T.n / total)));
      const g = W.addDistantArmy({ x, z, facing: target.facing, w: 18, d: 10, count, armor: T.armor, kind: 'spear',
        flag: team ? flagB : flagA, flagRate: 1, seed: 840 + team, host: false, near: false, team });
      g.noWake = true; g.army.noWake = true; g.army._autoDistant = true;
      g.follow(() => target);
      D.backs.push({ g, target, team, offset: off, state: 'ADVANCE' });
      break;
    }
  }
  D.built = true;
}

function covered(W, x, z, ignore = null) {
  for (const a of W.armies || EMPTY) {
    if (a.mesh === ignore || !a.mesh.visible || a.rout) continue;
    const ax = a.mesh.position.x + a.cx + a.off.x, az = a.mesh.position.z + a.cz + a.off.z;
    if (Math.hypot(ax - x, az - z) < Math.max(a.hw0 || 10, a.hd0 || 8) + 24) return true;
  }
  for (const c of W.clashes || EMPTY) if (c !== ignore && c.mesh.visible && Math.hypot(c.x - x, c.z - z) < (c.o.w || 22) * 0.5 + 26) return true;
  return false;
}

// 家紋の旗の林・陣幕・七メートルの馬印を、本当にある本陣だけに足す。
// 既存の本陣は重ねず、兵を戦える実体へ置き換えない。形と材質の片付けも World に任せる。
function headquartersTick(rt, D) {
  for (let team = 0; team < 2; team++) {
    const T = D.sides[team];
    let C = D.heads[team];
    const active = T.headquarters && T.seen && T.state !== 'ROUT';
    if (active && !C) {
      const existing = (rt.world.armies || EMPTY).find((a) => a.team === team && !a._autoDistant && a.kind === 'honjin' && !a.rout && Math.hypot(a.mesh.position.x + a.cx + a.off.x - T.hx, a.mesh.position.z + a.cz + a.off.z - T.hz) < 24);
      if (existing) C = D.heads[team] = { g: existing.mesh, owned: false };
      else if (land(rt, T.hx, T.hz)) {
        const f = D.facing + (team ? Math.PI : 0);
        const mon = T.flag;
        if (!mon) continue;
        const g = rt.world.addDistantArmy({ x: T.hx, z: T.hz, facing: f, kind: 'honjin',
          w: 14, d: 10, count: 18, mon, flag: mon, team,
          host: false, near: false, seed: 860 + team });
        g.noWake = true; g.army.noWake = true; g.army._autoDistant = true;
        C = D.heads[team] = { g, owned: true, y: rt.world.heightAt(T.hx, T.hz) };
      }
    }
    if (C?.owned) {
      C.g.visible = active && land(rt, T.hx, T.hz);
      // 陣幕は歩かせない。本陣の移動に合わせ、開いた側を敵へ向け直す。
      const a = C.g.army, turn = D.facing + (team ? Math.PI : 0) - a.face0;
      const c = Math.cos(turn), s = Math.sin(turn);
      C.g.rotation.y = turn;
      C.g.position.set(T.hx - c * a.cx - s * a.cz, rt.world.heightAt(T.hx, T.hz) - C.y, T.hz + s * a.cx - c * a.cz);
    }
    T.soundT -= 1;
    // 忍ぶ間・開戦の溜めは音を足さない。二軍の合図は時刻と鳴り方を分ける。
    if (rt.def.armySignals === false || !active || rt.flags.quiet || (rt.prelude && rt.prelude !== 'done') || T.soundT > 0) continue;
    T.point.x = T.hx; T.point.z = T.hz;
    const p = rt.camera.position, dx = T.hx - p.x, dz = T.hz - p.z, d = Math.hypot(dx, dz);
    if (d > 420) continue;
    const retreat = T.state === 'RETREAT';
    const kind = retreat ? 'hike' : T.state === 'PUSH' || T.state === 'ADVANCE' ? 'susume' : 'atsumare';
    const back = Math.max(0, -(dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw)) / (d || 1));
    // 遅れ・地形・風は withPan、合図そのものの音量は signal が受け持つ。
    const pan = rt.panAt(T.point);
    farNext(d, back, T.point, rt.camera.position, rt.world, WIND_STATE);
    withPan(pan, () => signal(kind, d, team ? 0.26 : 0.4));
    if (T.heard !== T.state && T.n) {
      T.point.x = T.x; T.point.z = T.z;
      rt.army.play(retreat ? 'cry' : team ? 'eshout' : 'shout', T.point, 0.45);
    }
    T.heard = T.state;
    T.soundT = team ? 35 : 28;
  }
}

// 遠い鬨を三つの列が順に返す。既存の合成音と音量の上限を使う。
// 一秒ごとの遠景更新だけで鳴らし、予約や毎コマの入れ物を作らない。
function roarTick(rt, D) {
  if (rt.flags.quiet || (rt.prelude && rt.prelude !== 'done')) return;
  for (let team = 0; team < 2; team++) {
    const T = D.sides[team];
    if (!T.seen || !T.n || T.state === 'ROUT' || T.state === 'RETREAT') continue;
    if (--T.roarT > 0) continue;
    const f = D.facing, lateral = (T.roarStep - 1) * 28;
    T.point.x = T.x + Math.cos(f) * lateral;
    T.point.z = T.z - Math.sin(f) * lateral;
    // 伏兵・隠した軍勢からは鳴らさない。近い声も本物の兵へ任せる。
    const dx = T.point.x - rt.camera.position.x, dz = T.point.z - rt.camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d >= 65 && d < 420) {
      const back = Math.max(0, -(dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw)) / d);
      const pan = rt.panAt(T.point);
      farNext(d, back, T.point, rt.camera.position, rt.world, WIND_STATE);
      const strength = T.state === 'PUSH' ? 0.65 : T.state === 'FIGHT' ? 0.5 : 0.36;
      withPan(pan, () => sfx('toki', strength / (1 + d / 150) * (T.roarStep === 1 ? 1 : 0.7)));
    }
    T.roarStep++;
    if (T.roarStep >= 3) { T.roarStep = 0; T.roarT = (T.state === 'PUSH' ? 14 : 22) + team * 5; }
    else T.roarT = 1;
  }
}

export function distantBattleInit(rt) {
  if (rt.def.dojo) return;
  jinkeiInit(rt);
  if (rt.def.noDistantBattle || rt.def.town || rt.def.duel) return; // 戦固有の備えだけで兵数を表す戦。
  const D = rt._distantBattle = { sides: [side(), side()], lines: [], backs: [], heads: [null, null], t: 0, smokeT: 4, built: false };
  D.sides[0].soundT = 6; D.sides[1].soundT = 17;
  D.sides[0].roarT = 9; D.sides[1].roarT = 18;
  scan(rt, D);
  // 伏兵だけの戦は、敵が出るまで旗や煙で居場所を明かさない。
  if (D.sides[1].seen && !rt.flags.quiet) build(rt, D);
}

export function distantBattleTick(rt, dt) {
  jinkeiTick(rt, dt);
  const D = rt._distantBattle;
  if (!D || (rt.over && !rt.withdrawal)) return;
  // 忍ぶ間は既にある飾りも隠す。画質を途中で下げた時も合戦は一か所に絞る。
  for (let i = 0; i < D.lines.length; i++) D.lines[i].C.mesh.visible = !rt.flags.quiet && (S.quality !== 'low' || i === 0);
  for (const R of D.backs) R.g.visible = !rt.flags.quiet;
  if (rt.flags.quiet) {
    for (const H of D.heads) if (H?.owned) H.g.visible = false;
    return;
  }
  D.t -= dt;
  if (D.t > 0) return;
  D.t = 1;
  scan(rt, D);
  headquartersTick(rt, D);
  roarTick(rt, D);
  if (!D.built) { if (D.sides[1].seen) build(rt, D); if (!D.built) return; }
  const fx = Math.sin(D.facing), fz = Math.cos(D.facing);
  const A = D.sides[0].state, B = D.sides[1].state;
  for (const L of D.lines) {
    // 前線が動いても、本物の兵のいる場所へ遠景の押し合いを運ばない。
    const x = D.x + fz * L.offset, z = D.z - fx * L.offset;
    if (land(rt, x, z) && !covered(rt.world, x, z, L.C)) { L.P.x = x; L.P.z = z; }
    if (A !== 'ADVANCE' || B !== 'ADVANCE') L.C.go();
    L.C.push('A', A === 'PUSH' || B === 'RETREAT' ? 0.6 : B === 'PUSH' || A === 'RETREAT' ? -0.6 : 0);
    if (A === 'ROUT' && !L.C.A.routed) L.C.rout('A');
    if (B === 'ROUT' && !L.C.B.routed) L.C.rout('B');
  }
  for (const R of D.backs) {
    const T = D.sides[R.team], sign = R.team === 0 ? 1 : -1;
    const retreat = T.state === 'RETREAT', rout = T.state === 'ROUT';
    const push = T.state === 'PUSH';
    const back = retreat ? -30 : push ? 20 : T.state === 'ADVANCE' ? 10 : 0;
    const x = clamp((T.x + T.hx) / 2 + fz * R.offset + fx * sign * back, rt.world);
    const z = clamp((T.z + T.hz) / 2 - fx * R.offset + fz * sign * back, rt.world);
    if (land(rt, x, z) && !covered(rt.world, x, z, R.g)) { R.target.x = x; R.target.z = z; }
    R.target.facing = D.facing + (R.team ? Math.PI : 0) + (retreat ? Math.PI : 0);
    // 退く列と旗は実際の本陣へ向く。横へ移った本陣も、兵の背を追えば分かる。
    if (retreat && T.headquarters && Math.hypot(T.hx - R.target.x, T.hz - R.target.z) > 2) R.target.facing = Math.atan2(T.hx - R.target.x, T.hz - R.target.z);
    if (rout && R.state !== 'ROUT') R.g.rout();
    else if (!rout && R.state === 'ROUT') R.g.reform();
    R.state = T.state;
  }
  // 最大二か所・数秒おき。既存の煙の使い回しと上限を利用する。
  if (S.reduceMotion || (rt.prelude && rt.prelude !== 'done')) return;
  D.smokeT -= 1;
  if (D.smokeT > 0) return;
  D.smokeT = A === 'PUSH' || B === 'PUSH' ? 5 : A === 'FIGHT' || B === 'FIGHT' ? 9 : 14;
  for (const L of D.lines) {
    const C = L.C, p = rt.player.u.pos;
    if (!C.mesh.visible) continue;
    if (Math.hypot(C.x - p.x, C.z - p.z) < 65 || !land(rt, C.x, C.z)) continue;
    if ((A === 'FIGHT' || A === 'PUSH' || B === 'FIGHT' || B === 'PUSH') && (rt.army.smokes?.length || 0) < (S.quality === 'low' ? 24 : 48)) {
      // 煙は撃ち合う両軍の前列から出す。兵の向きと煙の出どころが一致する。
      for (let team = 0; team < 2; team++) {
        const state = team ? B : A;
        if (!D.sides[team].guns) continue;
        if (state !== 'FIGHT' && state !== 'PUSH') continue;
        const sign = team ? -1 : 1, x = C.x - fx * sign * 6, z = C.z - fz * sign * 6;
        if (land(rt, x, z)) rt.world.gunSmoke(x, z, undefined, true);
      }
    }
    if (!(rt.world.rainLevel > 0.4 || (rt.world.wetness || 0) > 0.5)) {
      const back = A === 'RETREAT' || A === 'ROUT' ? -18 : B === 'RETREAT' || B === 'ROUT' ? 18 : 0;
      rt.world.dustCloud(C.x + fx * back, C.z + fz * back, A === 'PUSH' || B === 'PUSH' || A === 'ROUT' || B === 'ROUT', true);
    }
  }
}
