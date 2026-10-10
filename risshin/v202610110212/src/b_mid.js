// ======================================================================
// 織田家編の中ほどの戦（箕作・長島・野田福島・志賀・伊賀・三木・鳥取・高遠・手取川・雑賀）を濃くする共通の道具
//   b_depth.js の段（rest・pick・fight・hold・move）に、次の三つを足す：
//   ・包囲：round(at, a, r) で、敵の正面（a の向き）・左・右・後ろの寄せ口を出す。敵は左右と後ろへ回り込んで来る
//   ・鉄砲の列：gunLine(...) は鉄砲だけの組（6 挺より多いので units.js で「構え」から揃えて一斉に放つ）を、少し離れた所に並べる
//   ・大軍の激突：lines(rt, [...]) で、本物の兵が受け持つ真ん中の左右に、軽い大軍どうしの押し合い（world.addClash）を並べる
// ======================================================================
import { clash } from './b_sekigahara.js';
import { honjin, farHost, ARMOR } from './b_nagashinojo.js';
import { buildModel, poseArms } from './units.js';
import { flagTexture } from './textures.js';
import { nobori } from './props.js';

export const uS = (n, o) => ({ type: 'samurai', n, ...(o ? { o } : {}) });
export const uA = (n) => ({ type: 'ashigaru', n });
export const uG = (n) => ({ type: 'gun', n });
export const uB = (n) => ({ type: 'bow', n });
export const uC = (n) => ({ type: 'cavalry', n });
export const uBu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, ...o } });

// 寄せ口：at から a の向き（0 = +z、PI/2 = +x）に r 離れた所が正面。左右と後ろも返す
export function round(at, a, r = 50) {
  const p = (d, k = 1) => ({ x: Math.round(at.x + Math.sin(a + d) * r * k), z: Math.round(at.z + Math.cos(a + d) * r * k) });
  return { front: p(0), left: p(Math.PI / 2), right: p(-Math.PI / 2), back: p(Math.PI, 0.9), fl: p(Math.PI / 4), fr: p(-Math.PI / 4), bl: p(Math.PI * 0.75, 0.9), br: p(-Math.PI * 0.75, 0.9) };
}

// 鉄砲の列：鉄砲だけの組。段の場所 at と寄せ口 from の間（at から 45% の所）に横一列で並び、揃えて撃つ
export function gunLine(name, from, at, n = 8, x = {}) {
  const off = { x: Math.round((from.x - at.x) * 0.45), z: Math.round((from.z - at.z) * 0.45) };
  return { name, from, off, list: [uS(1), uG(n)], formation: 'line', width: 20, seek: 75, mass: 110, kind: 'gun', dmg: 0.45, ...x };   // 数が多いので一発は軽め（恐さは音と数で）
}

// 大軍どうしの押し合い（軽い作り）。o：{ x, z, facing, w, seed, A:[flag, armor, count, faction], B:[…], surge, guns, bows }
//   facing は A（味方）の向き。返すのは clash の並び。go() で寄せ合う
export function lines(rt, list) {
  return list.map((o) => {
    const [fa, aa, na, fca] = o.A, [fb, ab, nb, fcb] = o.B;
    return clash(rt, {
      x: o.x, z: o.z, facing: o.facing, w: o.w || 60, gap0: o.gap0 ?? 34, closeSpeed: 3.6, seed: o.seed, noRout: true, killRate: 0.12,
      surge: o.surge === false ? undefined : { k: 'B', every: 50, count: 150, flank: 0.3, ...(o.surge || {}) },
      A: { flag: fa, armor: aa, count: na, team: 0, faction: fca, ...(o.gunsA ? { guns: true } : {}) },
      B: { flag: fb, armor: ab, count: nb, team: 1, faction: fcb, flagRate: o.flagRateB ?? 0.5, ...(o.gunsB ? { guns: true } : {}), ...(o.bowsB ? { bows: true } : {}) },
    });
  });
}
// 押し合いの流れを変える：side の側へ押す（k 0〜1）
export const leanAll = (L, side, k) => { for (const c of L || []) c.push(side, k); };
// 鉄砲の一斉射撃（煙と音）を押し合いの上で
export const volleyAll = (L, side) => { for (const c of L || []) c.volley(side); };

// ======================================================================
// 本陣へ近づくほど敵が濃くなる（kaito 10/2）：campDepth(rt, { x, z, facing, mon, armor, label })
//   本陣の前（facing の向き）に軽い大軍を三重に置く（奥ほど多い。寄れば本物の兵に替わる）と、左右に幟。
//   近づくと「この奥に本陣がある」と知らせ、見えたら本陣の印を出す。camp(rt, { depth: true }) からも呼ばれる
// ======================================================================
export function campDepth(rt, o) {
  const W = rt.world, f = o.facing ?? 0, sx = Math.sin(f), sz = Math.cos(f), px = sz, pz = -sx;
  const at = (a, l) => ({ x: o.x + sx * a + px * l, z: o.z + sz * a + pz * l });
  const host = [];
  [[54, 220, 48, 10], [32, 300, 52, 12], [16, 380, 56, 14]].forEach(([a, cnt, w, d], i) => {
    const q = at(a, (i - 1) * 4);
    host.push(W.addDistantArmy({ x: q.x, z: q.z, w, d, count: cnt, facing: f, armor: o.armor ?? 0x2c2a2a, flagTex: flagTexture(o.mon), mon: o.mon, seed: 15900 + Math.round(o.x + o.z) + i, team: 1, host: false, near: false }));
  });
  if (o.controlled) for (const g of host) { g.noWake = true; g.army.noWake = true; g.army.keepNear = true; }
  if (!o.controlled) for (const a of [30, 46]) for (const l of [-14, 14]) { const q = at(a, l); rt.scene.add(nobori(W, q.x, q.z, o.mon, 7)); }
  const name = o.label || '敵の本陣', st = { near: false, mark: false };
  const poll = () => {
    if (rt.ended) return;
    const p = rt.player && rt.player.u && rt.player.u.pos;
    if (p) {
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (!st.near && d < 130) { st.near = true; rt.say('足軽', '奥へ行くほど、敵の旗が濃くなる……この奥に本陣があるぞ', 3.5); }
      if (!st.mark && d < 75) { st.mark = true; rt.marker('hq_' + Math.round(o.x) + '_' + Math.round(o.z), { x: o.x, z: o.z }, name, { red: true, h: 4 }); rt.bark(name + 'が見えた', true); }
    }
    if (!st.mark) rt.after(1, poll);
  };
  rt.after(2, poll);
  return host;
}

// ======================================================================
// 本陣：camp(rt, o)
//   陣幕の囲い（props.js の jinCamp。幕・床几・馬印・幟・陣太鼓）の内に大将（本物の busho・invuln・hold）、
//   周りに旗本（本物の兵。侍・槍・鉄砲）、陣の外に軽い兵の控え（farHost）、使番が一人、時々出入りする
//   o：{ x, z, facing, team: 0|1, faction, mon, general: { name, hat, haori }, guard: 18, reserve: 300, armor, uma: 'ogi'|'fukube', runTo: {x,z} }
//   陣幕の口は +z に開く（jinCamp の決まり）。大将と旗本は facing を向く
//   team 0 で信長で遊ぶ時（rt.G.lord）は大将を置かない（大将は自分）
//   返す物：{ general, guard, pos }
// ======================================================================

export function camp(rt, o = {}) {
  const x = o.x, z = o.z, facing = o.facing ?? 0, team = o.team ?? 1;
  const faction = o.faction || (team === 0 ? 'oda' : 'saito'), mon = o.mon || faction;
  const armor = o.armor ?? ARMOR[faction] ?? 0x2c2a2a;
  const w = o.w || 16, d = o.d || 12, pos = { x, z };
  honjin(rt, x, z, { w, d, mon, armor, uma: o.uma, compact: o.compact, tate: o.tate, people: false });
  const add = (go, list) => { const g = rt.army.addGroup({ team, faction, order: 'hold', ...go }); rt.army.spawn(g, list); return g; };
  // 大将：床几の前に立ち、采配を持つ（名のある busho は落ち着いている間は采配を持つ）
  let general = null;
  if (!(team === 0 && rt.G.lord) && o.general) {
    const gn = o.general;
    const gg = add({ name: gn.name + 'の本陣', anchor: { x, z: z - d / 2 + 3 }, facing, aggro: 4, width: 1, morale: 100, noRout: true },
      [{ type: 'busho', n: 1, o: { name: gn.name, invuln: true, ...(gn.hat ? { hat: gn.hat } : {}), ...(gn.haori != null ? { haori: gn.haori } : {}) } }]);
    general = gg.units[0] || null;
    if (general) gg.leader = general;
  }
  // 旗本：侍（馬廻）・槍・鉄砲を混ぜ、陣幕の口の前に並ぶ
  const n = Math.max(15, Math.min(25, o.guard ?? 18));
  const nS = Math.round(n * 0.4), nG = Math.round(n * 0.25), nA = n - nS - nG;
  const guard = add({ name: (o.general ? o.general.name : '大将') + 'の旗本', anchor: { x, z: z + d / 2 + 5 }, facing, aggro: 14, width: 8, morale: 100, formation: 'line' },
    [{ type: 'samurai', n: nS }, { type: 'ashigaru', n: nA }, { type: 'gun', n: nG }]);
  const lead = guard.units.find((u) => u.type === 'samurai');
  if (lead) guard.leader = lead;
  // 陣の外の控え（軽い兵）：陣の後ろ（facing の逆）に
  const nR = o.reserve ?? 300;
  if (nR > 0) {
    const bx = x - Math.sin(facing) * (d + 14), bz = z - Math.cos(facing) * (d + 14);
    farHost(rt, bx, bz, 34, 14, nR, facing, armor, mon, 31 + Math.round(x + z), 'mixed');
  }
  // 使番：一人の形（使い回し）が、本陣と前（runTo か facing の 70m 先）の間を時々走る
  const to = o.runTo || { x: x + Math.sin(facing) * 70, z: z + Math.cos(facing) * 70 };
  const U = {};
  const m = buildModel(U, { armor: 0x1d1d1f, lace: 0x3c5a8a, hat: 'kabuto', sode: true, flag: null, weapon: 'none', skin: 0xb08a66, horo: 0xe6dfcf });
  U.lookWeapon = 'none'; poseArms(U);
  m.visible = false; rt.scene.add(m);
  const R = { p: { x, z: z + d / 2 }, leg: 0, wait: 6, anim: 0, last: rt.t };
  const tick = () => {
    if (rt.ended) { m.visible = false; return; }
    const dt = Math.min(0.2, rt.t - R.last); R.last = rt.t;
    if (R.wait > 0) { R.wait -= dt; m.visible = false; rt.after(0.25, tick); return; }
    const home = { x, z: z + d / 2 - 1 }, goal = R.leg === 0 ? to : home;
    const dx = goal.x - R.p.x, dz = goal.z - R.p.z, dd = Math.hypot(dx, dz);
    if (dd < 0.8) { R.leg ^= 1; R.wait = R.leg === 0 ? 18 + Math.random() * 14 : 2; rt.after(0.25, tick); return; }
    const st = Math.min(dd, 7 * dt);
    R.p.x += dx / dd * st; R.p.z += dz / dd * st;
    m.position.set(R.p.x, rt.world.heightAt(R.p.x, R.p.z), R.p.z);
    m.rotation.y = Math.atan2(dx, dz);
    const cam = rt.camera && rt.camera.position;
    const cd = cam ? Math.hypot(R.p.x - cam.x, R.p.z - cam.z) : 99;
    m.visible = cd > 6 && cd < 160;
    if (m.visible) {
      R.anim += dt * 11;
      const sw = Math.sin(R.anim) * 0.85;
      U.legL.rotation.x = sw; U.legR.rotation.x = -sw;
      if (U.shinL) { U.shinL.rotation.x = Math.max(0, -Math.cos(R.anim)) * 1.1; U.shinR.rotation.x = Math.max(0, Math.cos(R.anim)) * 1.1; }
      U.body.rotation.x = 0.22; U.body.position.y = Math.abs(Math.sin(R.anim)) * 0.07;
      poseArms(U, R.anim);
    }
    rt.after(0, tick);
  };
  rt.after(R.wait, tick);
  if (o.depth && team === 1) campDepth(rt, { x, z, facing, mon, armor, label: o.general ? o.general.name + 'の本陣' : '敵の本陣' });
  return { general, guard, pos };
}
