// ======================================================================
// 大坂の陣　真田丸の戦い（慶長十九年十二月四日）
// 大坂城の南に突き出た出丸・真田丸。外に柵、その内に空堀、土塁の上に塀と櫓。塀の内から鉄砲が並ぶ。
// 足軽は前田利常の手（先手・山崎長徳の組）。①篠山を取る ②柵を破る組を守る ③城内の爆発を合図と思い込んだ
// 寄せ手が堀へ殺到して撃ち崩され、真田が打って出る ④殿として真田の打って出を食い止め、味方を退かせれば任務は果たせる
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ攻める
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, yagura, tawara, hut, stumps } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, samaTs } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, move } from './b_depth.js';

// 縄張り：真田丸の中心 C。土塁と塀は半径 WALL_R、空堀は MOAT、外の柵は FENCE_R。どれも南へ開いた弧（角は +z から測る）
const C = { x: 0, z: -40 };
const WALL_R = 30, MOAT = { r0: 34, r1: 42 }, FENCE_R = 46;
const SPAN = 1.75;                    // 弧の広がり（左右それぞれ、ラジアン）
const SASA = { x: 20, z: 64, r: 9 };  // 篠山
const RETREAT_Z = 74;                 // 退き口の線（篠山の南）
const TOWERS = [-0.9, 0, 0.9];        // 櫓の角

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const polar = (a, r) => ({ x: C.x + Math.sin(a) * r, z: C.z + Math.cos(a) * r });
const angOf = (x, z) => Math.atan2(x - C.x, z - C.z);
const rOf = (x, z) => Math.hypot(x - C.x, z - C.z);
const outside = (o) => rOf(o.pos.x, o.pos.z) > FENCE_R - 0.5 || Math.abs(angOf(o.pos.x, o.pos.z)) > SPAN + 0.1;
const gone = (g) => !g || g.count === 0 || g.routed;
// 真田の鉄砲は、当たれば痛いが一発では倒れない強さに
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; return g; };

// 家ごとの見た目
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MAEDA = { flag: 'maeda' };
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'igeta' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.3 * Math.sin(z * 0.06 + x * 0.02);
  // 大坂の台地は北へ少し上がる。篠山は小さな丘
  h += Math.max(0, -z - 60) * 0.06 + 6 * gauss(x, z, SASA.x, SASA.z, 260);
  const r = rOf(x, z), a = Math.abs(angOf(x, z));
  const inArc = clamp01((SPAN + 0.15 - a) / 0.2);
  // 真田丸：内は一段高く、縁に土塁
  h += 2.2 * clamp01((WALL_R + 1 - r) / 2) * inArc + 1.2 * clamp01(1 - Math.abs(r - WALL_R) / 2.4) * inArc;
  // 空堀
  h -= 3.6 * trap(Math.abs(r - (MOAT.r0 + MOAT.r1) / 2), (MOAT.r1 - MOAT.r0) / 2, 2.2) * inArc;
  // 惣構の堀（城の南の大きな堀。真田丸の後ろ）
  h -= 4 * trap(Math.abs(z + 92), 6, 3) * (Math.abs(x) > 18 ? 1 : 0);
  return h;
}

// ---------------- 城の小道具 ----------------
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts, block = true) {
  const m = new THREE.Mesh(mergeGeometries(parts), MAT);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.camBlock = block;
  return m;
}
function boxAlong(parts, hex, ax, az, bx, bz, w, h, d, y) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len * w, h, d);
  g.rotateY(Math.atan2(-(bz - az), bx - ax));
  g.translate((ax + bx) / 2, y, (az + bz) / 2);
  parts.push(paint(g, hex));
}
// 板塀：土塁の上の黒い板の塀に、瓦の笠と狭間
// 狭間は一間ごとに一つ（o.samaStep の割り方。城兵はこの穴の真後ろに立って撃つ）
function itabei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const parts = [];
  const len = Math.hypot(bx - ax, bz - az);
  const n = samaTs(len, o.samaStep || 1.6).length;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
    const y = world.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
    boxAlong(parts, [0x2a241e, 0x302820, 0x28221c][i % 3], x0, z0, x1, z1, 1.02, 2.2, 0.26, y + 1.1);
    boxAlong(parts, 0x3b3a3a, x0, z0, x1, z1, 1.04, 0.14, 0.8, y + 2.3);
    boxAlong(parts, 0x0e0c0a, x0, z0, x1, z1, i % 2 ? 0.13 : 0.2, i % 2 ? 0.3 : 0.2, 0.3, y + (i % 2 ? 1.5 : 1.3));
  }
  return mesh(parts);
}
// 大坂城：惣構の向こうの石垣と、黒い五重の天守（遠景）
function osakaCastle(world, x, z) {
  const parts = [];
  const y = world.heightAt(x, z);
  const base = new THREE.CylinderGeometry(26, 32, 12, 4); base.rotateY(Math.PI / 4); base.translate(x, y + 6, z); parts.push(paint(base, 0x6a655c));
  const tiers = [[20, 7], [16.5, 6.2], [13, 5.6], [10, 5], [7.4, 4.6]];
  let yy = y + 12;
  tiers.forEach(([w, h], i) => {
    const b = new THREE.BoxGeometry(w, h, w * 0.82); b.translate(x, yy + h / 2, z); parts.push(paint(b, i === 4 ? 0x1c1a18 : 0x24211e));
    const band = new THREE.BoxGeometry(w + 0.1, 0.5, w * 0.82 + 0.1); band.translate(x, yy + h * 0.7, z); parts.push(paint(band, 0xb08a3a));
    const roof = new THREE.CylinderGeometry(w * 0.45, w * 0.8, 1.6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 0.82); roof.translate(x, yy + h + 0.6, z); parts.push(paint(roof, 0x2a2e30));
    yy += h + 1.2;
  });
  const top = new THREE.ConeGeometry(4.2, 3, 4); top.rotateY(Math.PI / 4); top.translate(x, yy + 1.2, z); parts.push(paint(top, 0x2a2e30));
  // 惣構の塀と櫓（横に長く）
  for (let wx = -170; wx <= 170; wx += 20) {
    if (Math.abs(wx) < 22) continue;
    const wy = world.heightAt(wx, -100);
    const w = new THREE.BoxGeometry(20, 3, 0.8); w.translate(wx, wy + 1.5, -100); parts.push(paint(w, 0xd8d1c0));
    const r = new THREE.BoxGeometry(20.4, 0.3, 1.6); r.translate(wx, wy + 3.1, -100); parts.push(paint(r, 0x3b3a3a));
    if (Math.abs(wx) % 60 === 30) { const t = new THREE.BoxGeometry(6, 5, 6); t.translate(wx, wy + 5.5, -102); parts.push(paint(t, 0xd8d1c0)); const tr = new THREE.ConeGeometry(5, 2, 4); tr.rotateY(Math.PI / 4); tr.translate(wx, wy + 9, -102); parts.push(paint(tr, 0x3b3a3a)); }
  }
  return mesh(parts, false);
}
// 竹束（寄せ手の盾）
function takeTaba(world, x, z, rot) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
    g.rotateX(-0.22); g.translate((i - 4) * 0.15, 1.0, (i % 2) * 0.05);
    parts.push(paint(g, [0x7c7a48, 0x6e6c3e, 0x86804e][i % 3]));
  }
  const m = mesh(parts, false);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

const sanadamaru = {
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1.1,
  spawn: { x: 6, z: 124, heading: Math.PI },
  world: {
    seed: 1614,
    time: 'after',
    mist: true,
    paths: [[[0, 178], [4, 130], [10, 96], [16, 74]]],
    height,
    tint(x, z, h, c) {
      const r = rOf(x, z), a = Math.abs(angOf(x, z));
      // 土塁と空堀は土が出ている
      if (r < FENCE_R + 2 && a < SPAN + 0.2) c.setRGB(c.r * 0.55 + 0.17, c.g * 0.5 + 0.13, c.b * 0.45 + 0.09);
      // 冬枯れの野
      else c.setRGB(c.r * 0.8 + 0.1, c.g * 0.72 + 0.08, c.b * 0.6 + 0.05);
      if (Math.abs(z + 92) < 8 && Math.abs(x) > 18) c.setRGB(c.r * 0.6, c.g * 0.6, c.b * 0.6);
    },
    clear: (x, z) => Math.abs(x) < 90 && z > -90 && z < 150,
    trees: 240,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) > 100 || z > 150 ? 1 : 0.2),
    groves: [{ x: -80, z: 60, r: 12, n: 16 }, { x: 90, z: 40, r: 12, n: 16 }, { x: SASA.x + 8, z: SASA.z + 6, r: 6, n: 8 }],
    // 逃げる真田の兵は、柵の内へ入ったら丸の中へ消える（遊び手を塀の下まで釣り出さない）
    fleeOut: (x, z, team) => team === 1 && rOf(x, z) < FENCE_R - 1 && Math.abs(angOf(x, z)) < SPAN + 0.1,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0;
    // ---- 真田丸：土塁の上の塀（壊せない）、外の柵（寄せ手が破れる）、櫓 ----
    const arc = (r, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const q = polar(a, r); pts.push([q.x, q.z]); } return pts; };
    F.walls = wallLine(rt, arc(WALL_R, -SPAN, SPAN, 18), { team: 1, hp: 1e9, name: '塀', mesh: itabei, segLen: 5, sama: 1.6, h: 2.3 });
    // 外の柵：左右に出入りの口（真田の打って出はここから）
    F.fence = [
      ...wallLine(rt, arc(FENCE_R, -SPAN + 0.1, -1.05, 5), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, -0.9, 0.9, 12), { team: 1, hp: 1100, name: '真田丸の柵', segLen: 6 }),
      ...wallLine(rt, arc(FENCE_R, 1.05, SPAN - 0.1, 5), { team: 1, hp: 1e9, name: '柵', segLen: 6 }),
    ];
    // 寄せ手が破りにかかる柵（正面の一間）
    F.target = F.fence.filter((s) => s.hp < 1e8).sort((a, b) => Math.abs(angOf((a.seg[0] + a.seg[2]) / 2, (a.seg[1] + a.seg[3]) / 2)) - Math.abs(angOf((b.seg[0] + b.seg[2]) / 2, (b.seg[1] + b.seg[3]) / 2)))[0];
    F.target.armor = 0.15;
    for (const a of TOWERS) { const q = polar(a, WALL_R - 3.5); rt.scene.add(yagura(W, q.x, q.z)); }
    rt.scene.add(osakaCastle(W, 0, -150));
    rt.scene.add(hut(W, 0, -52, 10, 6, 0), hut(W, -12, -46, 6, 4, 0.2), tawara(W, 10, -46, 0.3, 5));
    for (const a of [-1.3, -0.6, 0.3, 1.0, 1.5]) { const q = polar(a, WALL_R - 5); rt.scene.add(nobori(W, q.x, q.z, 'sanada', 6)); }
    rt.scene.add(nobori(W, 0, -60, 'toyotomi', 7));

    // ---- 寄せ手の陣：前田の陣幕と竹束 ----
    // 前田利常の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    KIT.honjin(rt, -14, 152, { mon: 'maeda', w: 18, d: 12, armor: 0x24221f });
    for (const [x, z, k, h] of [[-26, 142, 'maeda', 7], [-2, 112, 'maeda', 5], [14, 110, 'maeda', 5]]) rt.scene.add(nobori(W, x, z, k, h));
    for (let x = -30; x <= 30; x += 5) rt.scene.add(takeTaba(W, x + Math.sin(x) * 0.8, 100 + Math.cos(x) * 1.5, Math.PI + Math.sin(x) * 0.1));
    // 遠景の村（寄せ手の陣の東の、冬の田）
    KIT.farVillage(rt, 120, 160, { rot: Math.PI, n: 6, fields: 8, seed: 51 });

    // ---- 大軍（軽い作り）：徳川方十万が真田丸と大坂城の南を埋める ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const TK = 0x24221f;
    F.maedaDA = [DA(44, 150, 36, 6, 200, Math.PI, TK, 'maeda', 61, 'gun'), DA(-4, 174, 70, 12, 300, Math.PI, TK, 'maeda', 62, 'spear')];
    // 井伊直孝の赤備えと、松平忠直の越前勢（城内の爆ぜる音で堀へ殺到する）
    F.surgeDA = [DA(-78, 90, 30, 18, 260, Math.PI * 0.85, 0x8e1f16, 'igeta', 63, 'mixed'), DA(80, 88, 30, 18, 260, -Math.PI * 0.85, TK, 'tokugawa', 64, 'spear')];
    DA(140, 40, 30, 20, 240, -Math.PI * 0.7, TK, 'ichimonji', 65, 'gun');
    DA(-140, 40, 30, 20, 240, Math.PI * 0.7, TK, 'date', 66, 'cavalry');
    DA(-120, 150, 40, 24, 220, Math.PI, TK, 'tokugawa', 67, 'honjin');
    // 真田丸の中の兵（塀の内の鉄砲）
    DA(C.x, C.z - 8, 30, 10, 160, 0, SANADA.armor, 'sanada', 68, 'gun');

    // ---- 味方：前田の先手（山崎長徳の組）、二の手、柵を破る組 ----
    const yam = allyGroup(rt, { faction: 'tokugawa', name: '山崎長徳の組', anchor: { x: 2, z: 116 }, facing: Math.PI, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '山崎長徳', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], MAEDA));
    yam.defMult = 1.2;
    F.yam = yam; F.yamU = yam.units[0];
    F.second = allyGroup(rt, { faction: 'tokugawa', name: '前田の二の手', anchor: { x: -22, z: 118 }, facing: Math.PI, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], MAEDA));
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: 16, z: 122 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1, o: { name: '柵破りの頭 奥村' } }, { type: 'ashigaru', n: 14, o: { hat: 'jingasa_n' } }], MAEDA));
    F.rams = [F.ram];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 8, z: 124 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 真田方：塀の内の鉄砲・弓、櫓の上の射手 ----
    F.wallG = enemyGroup(rt, { faction: 'saito', name: '塀の内の鉄砲', anchor: { x: C.x, z: C.z + WALL_R - 4 }, facing: 0, width: 16, spacing: 2.4, aggro: 0, noRout: true },
      dress([{ type: 'gun', n: 8 }, { type: 'bow', n: 6 }], SANADA));
    F.towerU = [];
    TOWERS.forEach((a, i) => {
      const q = polar(a, WALL_R - 3.5);
      const g = enemyGroup(rt, { faction: 'saito', name: '櫓', anchor: q, facing: a, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        dress([{ type: 'gun', n: 2 }, { type: i === 1 ? 'gun' : 'bow', n: 1 }], SANADA));
      g.units.forEach((u, k) => { u.pos.x = q.x + (k - 1) * 0.7; u.pos.z = q.z; u.speed = u.run = 0; u.tower = q; F.towerU.push(u); });
    });
    // 城からの鉄砲・矢は、当たれば痛いが一発では倒れない強さに
    for (const u of [...F.wallG.units, ...F.towerU]) { u.group.dmgMult = 0.4; if (u.type === 'gun') u.dmg *= 0.4; }
    // 篠山に残る真田の鉄砲（寄ると退く）
    F.sasaG = enemyGroup(rt, { faction: 'saito', name: '篠山の鉄砲', anchor: { x: SASA.x, z: SASA.z - 2 }, facing: 0, width: 4, aggro: 6, morale: 40, fleeDir: { x: -0.3, z: -1 } },
      dress([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3 }], SANADA));
    soften(F.sasaG);
    F.sasaG.fire = false;   // 寄せの下知までは撃たない（陣の中で撃たれて始まらないように）

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', '前田の先手として、真田丸の前の篠山へ寄せよ', 'main');
    rt.obj('saku', '柵を破る組を守り、真田丸の柵を破れ', 'side');
    rt.say('山崎長徳', `${nm(rt)}、あの丸い出丸が真田丸じゃ。空堀と柵、塀の上から鉄砲が狙っておる`, 5);
    rt.say('山崎長徳', '昨日まで、手前の篠山から真田の鉄砲に仕寄りを邪魔された。夜の明けぬうちに篠山を取る', 5);
    rt.bark('真田丸の塀は壊せぬ。寄せ手の足軽が外の柵を破るまで、そばで守れ');
    rt.after(17, () => this.sasayama(rt));
  },

  // ① 篠山を取る
  sasayama(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('sasa');
    sfx('taiko', 1);
    rt.banner('篠山へ', '夜明け前の寄せ');
    rt.say('山崎長徳', '進め！　篠山の鉄砲を追い落とせ！', 3);
    rt.obj('main', '篠山を取れ', 'main');
    rt.zone('sasa', SASA.x, SASA.z, SASA.r);
    rt.marker('sasa', { x: SASA.x, z: SASA.z }, '篠山', { h: 3 });
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 9; }; };
    go(F.yam, SASA.x - 4, SASA.z + 4); go(F.second, -8, SASA.z + 10); go(F.ram, SASA.x + 10, SASA.z + 14);
    F.sasaG.fire = true;
    rt.after(4, () => rt.say('山崎長徳', '篠山の上で止まれ。その先は真田丸の塀の鉄砲が届く。追い過ぎるな', 4));
  },

  // ② 挑発に乗って柵へ
  fence(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fence');
    rt.unzone('sasa'); rt.unmark('sasa');
    rt.award((t) => t.side.push('篠山を取った'), '篠山を取った');
    rt.banner('篠山はもぬけの殻', '真田の兵は丸へ引いていた');
    rt.say('真田の兵', '篠山に何の用じゃ！　雉でも撃ちに来られたか！　寄せたければ真田丸まで来てみよ！', 4.5);
    rt.say('山崎長徳', 'おのれ、言わせておけば……！　柵まで寄せよ！　柵を破る組を前へ！', 4);
    rt.bark('柵を破る組の足軽が柵にとりつく。打って出る真田の兵から守れ');
    rt.obj('main', '柵を破る組を守れ', 'main');
    // 柵を破る組は正面の柵へ。先手はその左右に
    const T = F.target;
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (T.alive ? T : null);
    for (const u of R.units) u.aiT = 0;
    const tq = { x: (T.seg[0] + T.seg[2]) / 2, z: (T.seg[1] + T.seg[3]) / 2 };
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; gg.facing = Math.PI; }; };
    go(F.yam, tq.x + 9, tq.z + 8); go(F.second, tq.x - 12, tq.z + 9);
    rt.marker('ram', () => { const g = F.rams.find((q) => q.count) || R; return g.center(); }, () => `柵を破る組（${F.rams.reduce((a, g) => a + g.count, 0)}人）`);
    rt.marker('fence', tq, () => `真田丸の柵 ${Math.round(Math.max(0, T.hp) / T.maxHp * 100)}%`, { h: 3 });
    // 左右の口から、真田の兵が柵の外へ打って出る
    rt.after(22, () => this.sally(rt, -1));
    rt.after(58, () => this.sally(rt, 1));
    rt.after(100, () => this.sally(rt, -1));
  },
  sally(rt, s) {
    const F = rt.flags;
    if (F.step !== 2) return;
    const q = polar(s * 0.97, FENCE_R + 1);
    const g = enemyGroup(rt, { faction: 'saito', name: '真田の打って出', anchor: q, facing: Math.PI, width: 5, aggro: 10, morale: 85, order: 'attack', seekRange: 60, fleeDir: { x: -s * 0.3, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }], SANADA));
    g.focus = F.rams.flatMap((r) => r.units).find((u) => u.alive) || null;
    F.sallies = [...(F.sallies || []), g];
    rt.army.play('eshout', q, 1.6);
    rt.say('足軽', `${s < 0 ? '西' : '東'}の口から真田の兵が出てきた！　柵を破る組を狙っておる！`, 3.5);
    rt.marker('sally' + F.sallies.length, centerOf(g), () => `打って出た真田の兵・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ③ 城内の爆発 → 寄せ手の殺到 → 真田の打って出
  blast(rt, broke) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('blast');
    rt.unmark('fence'); rt.unmark('ram');
    for (let i = 1; i <= (F.sallies || []).length; i++) rt.unmark('sally' + i);
    if (broke) { rt.objDone('saku'); rt.award((t) => t.side.push('真田丸の柵を破った'), '副任務：真田丸の柵を破った'); } else rt.objFail('saku');
    // 城の中で火薬が爆ぜる
    sfx('thunder', 1); sfx('volley', 0.7);
    for (let i = 0; i < 8; i++) rt.army.smoke((Math.random() - 0.5) * 30, rt.world.heightAt(0, -140) + 18 + Math.random() * 8, -140 + (Math.random() - 0.5) * 20, 0, 1);
    F.blastFire = rt.world.addFire(-14, -128, { h: 12 });
    rt.banner('城内で火薬が爆ぜる', '寄せ手は内応の合図と思い込んだ');
    rt.say('足軽', '城の中で火が上がった！　内応じゃ、裏切りの合図じゃ！', 3.5);
    rt.say('山崎長徳', '待て、早まるな……！', 2.5);
    // 井伊・松平の兵が堀へ殺到する
    F.surge = [];
    for (const [s, lk, nmx] of [[-1, II, '井伊直孝の赤備え'], [1, { flag: 'tokugawa' }, '松平忠直の越前勢']]) {
      const g = allyGroup(rt, { faction: s < 0 ? 'akazonae' : 'tokugawa', name: nmx, anchor: { x: s * 58, z: 40 }, facing: Math.PI, width: 14, aggro: 6, speed: 3.4, morale: 90, fleeDir: { x: s * 0.2, z: 1 } },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], lk));
      const q = polar(s * 1.1, MOAT.r0 + 3);
      g.order = 'move'; g.dest = q;
      F.surge.push(g);
    }
    // 遠くの井伊・越前の大勢も、堀へ向かって一斉に駆け出す
    for (const m of F.surgeDA) m.advance(46, 16, { charge: true });
    KIT.backOf(rt, F.surge[0], { flag: 'igeta', armor: II.armor, kind: 'mixed', w: 18, depth: 12, count: 120, gap: 4, seed: 72 });
    rt.after(6, () => rt.say('足軽', '井伊と越前の兵が堀へ飛び込んでいく！', 3));
    rt.after(16, () => this.sortie(rt));
  },
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('sortie');
    sfx('taiko', 1); sfx('horagai', 0.7);
    rt.banner('真田の打って出', '真田信繁、丸より打って出る');
    rt.say('真田の兵', '今じゃ！　堀の底の者どもを撃て！　打って出よ！', 3.5);
    rt.say('山崎長徳', `退けぇっ！　退き口を守れ！　${nm(rt)}、殿じゃ。味方が篠山の南へ引くまで、真田を食い止めよ！`, 5);
    rt.obj('main', '殿として真田の打って出を食い止め、味方を篠山の南へ退かせよ', 'main');
    // 味方は退く
    const back = (g, x) => { g.order = 'move'; g.dest = { x, z: RETREAT_Z + 12 }; g.speed = 3.0; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z: RETREAT_Z + 12 }; gg.facing = Math.PI; gg.aggro = 8; }; };
    for (const [g, x] of [[F.second, -16], ...F.rams.map((r, i) => [r, 16 + i * 6])]) if (g.count) { g.noRout = true; back(g, x); }
    F.yam.order = 'hold'; F.yam.aggro = 12;
    // 真田信繁と、真田大助
    const mk = (s, name, big) => {
      const q = polar(s * 0.97, FENCE_R + 1);
      const g = enemyGroup(rt, { faction: 'saito', name: `${name}の隊`, anchor: q, facing: Math.PI, width: 10, aggro: 14, morale: 100, noRout: true, order: 'attack', seekRange: 70, fleeDir: { x: -s * 0.2, z: -1 }, dmgMult: 0.8 },
        // 組を持たない足軽の殿（ひとり）が受ける時は、侍を少なめに（侍の一太刀は重いので）
        dress(big ? [{ type: 'samurai', n: rt.squad.length ? 5 : 3 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 4 }]
          : [{ type: 'busho', n: 1, o: { name, horse: true, hat: 'kabuto_m', haori: 0x6a1a12 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], SANADA));
      soften(g);
      // 馬上の将は、殿の足軽ひとりを斬り伏せるより、兵を率いて押すのが役目（一太刀を軽く）
      for (const u of g.units) if (u.type === 'busho') u.dmg *= 0.5;
      if (!rt.squad.length) for (const u of g.units) if (u.type === 'samurai') u.dmg *= 0.8; else if (u.type === 'gun') u.dmg *= 0.75;
      rt.marker('so' + s, centerOf(g), () => `${name}の隊・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    F.nobushige = mk(1, '真田信繁', true);
    // 組を持たない足軽の殿の時は、丸の塀の上の鉄砲も狙いが粗い（退く味方の群れへ撃ちかける）：一発を軽く
    if (!rt.squad.length) for (const u of rt.army.units) if (u.alive && u.type === 'gun' && u.team !== rt.player.u.team && !u._softGun) { u._softGun = true; u.dmg *= 0.6; }
    // 堀の底で撃たれた寄せ手の大勢は崩れて退き、前田の鉄砲の列も下がる
    F.surgeDA.forEach((m, i) => rt.after(2 + i * 4, () => m.rout({ hideAfter: 50 })));
    rt.after(8, () => F.maedaDA[0].retreat(24, 20));
    for (let i = 0; i < 10; i++) rt.world.addCarrion(C.x + (Math.random() - 0.5) * 70, C.z + MOAT.r1 + Math.random() * 10);
    // 打って出る真田の赤備え：丸の口から、同じ六文銭の旗が続く
    KIT.backOf(rt, F.nobushige, { flag: 'sanada', armor: SANADA.armor, kind: 'spear', w: 16, depth: 10, count: 110, gap: 4, seed: 73 });
    // 信繁その人は、東の口の内で馬上から采配を振る（前へは出ず、姿と声で見せる）
    const hq = polar(0.97, FENCE_R - 2.5);
    F.nobuHQ = enemyGroup(rt, { faction: 'saito', name: '真田信繁の旗本', anchor: hq, facing: Math.PI, width: 4, aggro: 3, morale: 100, noRout: true, order: 'hold' },
      dress([{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: true, hat: 'kabuto_f', haori: 0x7a1a12, flagScale: 1.4 } }, { type: 'samurai', n: 3 }], SANADA));
    F.nobuU = F.nobuHQ.units[0]; F.nobuU.announced = true;
    rt.marker('nobu', unitPos(F.nobuU), '真田信繁（采配）', { h: 4 });
    rt.after(3, () => { F.nobuU.cheer = 1.5; rt.army.play('eshout', F.nobuU.pos, 1.5); rt.say('真田信繁', '慌てるな、引きつけて撃て！　打って出る者は、堀の底へ追い落とせ！', 4); });
    rt.after(12, () => rt.unmark('nobu'));
    F.daisuke = mk(-1, '真田大助', false);
    KIT.backOf(rt, F.daisuke, { flag: 'sanada', armor: SANADA.armor, kind: 'spear', w: 12, depth: 8, count: 70, gap: 4, seed: 74 });
    rt.after(45, () => { for (const g of [F.nobushige, F.daisuke]) g.noRout = false; });
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('so1'); rt.unmark('so-1');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '殿を務め、味方を退かせた');
    for (const g of [F.nobushige, F.daisuke]) if (g && g.count) { g.noRout = false; g.order = 'move'; g.dest = polar(0, WALL_R - 6); }
    sfx('horagai', 0.8);
    rt.banner('寄せ手、退く', how);
    rt.say('山崎長徳', `${nm(rt)}、ようしのいだ。寄せ手は大きく損じたが、その方の殿で退き口は保たれた`, 5);
    rt.say('山崎長徳', '真田め……あの出丸がある限り、城の南からは寄せられぬわ', 4);
    rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    // 櫓の射手は櫓の床に立たせる
    for (const u of F.towerU) {
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + 5.58;
      u.pos.y = y;
      u.mesh.position.y = u.alive ? y : y - 0.1;
    }
    // 堀へ殺到した寄せ手は、上から撃たれて崩れていく（鉄砲の煙と音）
    if (F.surge) {
      for (const g of F.surge) {
        if (!g.count || g.routed) continue;
        const c = g.center();
        if (rOf(c.x, c.z) < MOAT.r1 + 6) {
          g.morale -= 5 * dt;
          F.volT = (F.volT || 0) - dt;
          if (F.volT <= 0) {
            F.volT = 2.2 + Math.random() * 2;
            const a = angOf(c.x, c.z);
            for (let i = 0; i < 4; i++) { const q = polar(a + (i - 1.5) * 0.08, WALL_R + 0.5); rt.army.smoke(q.x, rt.world.heightAt(q.x, q.z) + 2.2, q.z, Math.sin(a), Math.cos(a)); }
            rt.army.play('gun', polar(a, WALL_R), 1.3);
          }
        }
      }
    }
    // 塀と櫓の鉄砲は、柵を破る組・堀へ殺到した寄せ手・退く寄せ手の群れを狙う（ひとりの足軽より、群れを撃つ）
    F.aimT = (F.aimT || 0) - dt;
    if (F.aimT <= 0 && F.step >= 2) {
      F.aimT = 1.5;
      const pool = [...(F.surge || []), ...F.rams, F.second, F.yam].filter((g) => g && g.count);
      const shooters = [F.wallG, ...new Set(F.towerU.map((u) => u.group))];
      for (const sg of shooters) {
        if (!sg || !sg.count) continue;
        const c = sg.center();
        let best = null, bd = 58;
        for (const g of pool) for (const u of g.units) if (u.alive) { const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z); if (d < bd) { bd = d; best = u; } }
        sg.focus = best;
      }
    }
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.dpOn) return;
    // 真田丸の塀の鉄砲の間合いへ、ひとりで入り込んだら止める（打って出を受ける③④の前だけ）
    if (F.step <= 1 && rOf(p.x, p.z) < WALL_R + 40 && !(F.warnT > rt.t)) {
      F.warnT = rt.t + 20;
      rt.bark('塀の鉄砲の間合いに入った。篠山まで下がれ', true);
      rt.say('山崎長徳', `${nm(rt)}、戻れ！　ひとりで丸に寄っても撃たれるだけじゃ`, 3.5);
    }
    if (F.step === 1) {
      const d = Math.hypot(p.x - SASA.x, p.z - SASA.z);
      rt.objProgress('main', d < SASA.r ? (gone(F.sasaG) ? '篠山を取った' : '篠山の鉄砲を追い落とせ') : `あと ${Math.max(0, Math.round(d - SASA.r))}m`);
      if ((d < SASA.r && rt.t - F.stepT > 10) || (gone(F.sasaG) && rt.t - F.stepT > 25) || rt.t - F.stepT > 80) { rt.unzone('sasa'); rt.unmark('sasa'); this.deep(rt, 'A', () => this.fence(rt)); }
    }
    if (F.step === 2) {
      const T = F.target;
      const left = F.rams.reduce((a, g) => a + g.count, 0);
      rt.objProgress('main', `柵 ${Math.round(Math.max(0, T.hp) / T.maxHp * 100)}%・組 ${left}人`);
      // 柵を破る組が減ったら、後ろから次の者が出る（止まらないように）
      if (left < 4 && !F.ram2) {
        F.ram2 = true;
        rt.say('山崎長徳', '柵の者が討たれた！　次の者、行けっ！', 3);
        const g = allyGroup(rt, { faction: 'tokugawa', name: '柵を破る組', anchor: { x: 10, z: 70 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], MAEDA));
        g.assault = F.ram.assault;
        F.rams.push(g);
      }
      if (!T.alive) this.blast(rt, true);
      else if (rt.t - F.stepT > 170) this.blast(rt, false);
    }
    if (F.step === 4) {
      const live = [F.nobushige, F.daisuke].reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      const t = rt.t - F.stepT;
      rt.objProgress('main', `真田の兵 ${live}人・退くまで ${Math.max(0, Math.ceil(110 - t))}秒`);
      // 殿が退き口の線より後ろへ逃げたら、叱られる（一度だけ）
      if (p.z > RETREAT_Z + 20 && !F.fled) { F.fled = true; rt.violation('殿を捨てて退いた', ['山崎長徳', '殿が先に逃げてどうする！　戻れ！']); }
      if ((gone(F.nobushige) && gone(F.daisuke)) || t > 110) {
        const how = gone(F.nobushige) && gone(F.daisuke) ? '真田の打って出を押し返した' : '殿を務めきり、味方は篠山の南へ退いた';
        rt.unmark('so1'); rt.unmark('so-1');
        for (const g of [F.nobushige, F.daisuke]) if (g && g.count) { g.noRout = false; g.order = 'move'; g.dest = polar(0, WALL_R - 6); }
        this.deep(rt, 'B', () => this.win(rt, how));
      }
    }
  },

  // 段を重ねる（b_depth.js）：A 篠山の後の挑発（柵へ寄る前）→ B 真田の二の打って出と堀の底の味方（殿の後）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, osCtx(rt), which === 'A' ? osA() : osB(), () => { F.dpOn = false; then(); });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、退く`, '深手を負い、丸へ担ぎ込まれた');
      else rt.say('足軽', `${v.name}が深手じゃ！　真田の者が担いで丸へ引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.sasaG) rt.say('足軽', '篠山の鉄砲が逃げていくぞ！', 2.5);
    if (F.surge && F.surge.includes(g)) rt.say('足軽', `${g.name}が堀から逃げ戻ってくる……ひどい討たれようじゃ`, 3.5);
    if (g === F.nobushige || g === F.daisuke) rt.say('足軽', '真田の兵が丸へ引いていく！', 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.target) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`真田丸の柵が傾いてきた（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    if (s !== rt.flags.target) return;
    rt.scene.add(stumps(rt.world, s.seg));
    sfx('wood', 1.2);
    rt.say('柵破りの頭 奥村', '柵を倒したぞ！　……む、堀が深い。これは登れぬ', 3.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、大坂を囲む徳川方 十万。真田丸に籠もる兵は約六千）
sanadamaru.force = (rt) => {
  const F = rt.flags;
  const surged = F.step >= 3 ? Math.min(1, (rt.t - F.stepT) / 40) * 3000 : 0;   // 堀の中で撃たれた寄せ手（数千と伝わる）
  return { a: Math.round(100000 - (F.ak || 0) * 30 - surged), a0: 100000, b: Math.max(0, 6000 - (F.ek || 0) * 12), b0: 6000 };
};
sanadamaru.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
sanadamaru.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
sanadamaru.sides = { a: { name: '徳川方', mon: 'tokugawa' }, b: { name: '豊臣方 真田丸', mon: 'sanada' } };
sanadamaru.date = (rt) => {
  const t = rt.t < 45 ? '夜明け・朝靄' : rt.t < 200 ? '朝' : '昼';
  return `慶長十九年十二月四日　冬・晴・${t}`;
};
sanadamaru.history = '慶長十九年の大坂冬の陣で、真田信繁（幸村）は大坂城の南に出丸を築いた。十二月四日、真田丸の前の篠山から鉄砲で妨げられていた前田利常の兵が篠山へ寄せたが、真田の兵はすでに引いていた。挑発に乗った前田勢は真田丸の空堀まで押し寄せ、塀と櫓の上から撃たれて大きく損じた。城内で火薬が爆ぜたのを内応の合図と思い込んだ井伊直孝・松平忠直の兵も堀へ殺到し、同じく撃ち崩された。徳川方の損害は数千とも伝わるが、数には諸説がある。この後、家康は力攻めをやめ、大筒で城を撃って和睦へ持ち込んだ。';

// 素直な遊び手：篠山へ登り、柵を破る組のそばで打って出た兵を突き、最後は退き口の前で踏みとどまる
sanadamaru.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 6, RETREAT_Z + 6, 2); return; }
  // 柵の外の敵だけを追う（塀の内や堀の底へは入らない）
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 16 : 12, (o) => !o.fleeing && !o.invuln && !o.tower && outside(o) && (F.step >= 2 || rOf(o.pos.x, o.pos.z) > WALL_R + 40));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  // 柵の内（柵と堀の間）に入り込んでいたら、近い方の口から外へ出る
  if (!outside(u)) {
    const s = angOf(u.pos.x, u.pos.z) < 0 ? -1 : 1;
    const a = angOf(u.pos.x, u.pos.z), ga = s * 0.97;
    const w = Math.abs(a - ga) > 0.05 ? polar(ga, FENCE_R - 2) : polar(ga, FENCE_R + 4);
    goTo(p, inp, w.x, w.z, 0.8);
    return;
  }
  let q = null;
  if (F.step === 1) q = { x: SASA.x, z: SASA.z };
  else if (F.step === 2) { const g = F.rams.find((r) => r.count) || F.ram; const c = g.center(); q = { x: c.x + 3, z: Math.max(c.z + 6, C.z + FENCE_R + 6) }; }
  else if (F.step >= 3) q = { x: 4, z: C.z + FENCE_R + 16 };
  if (q) goTo(p, inp, q.x, q.z, 2);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 真田丸：塀の内の鉄砲がいつも狙っている。真田の兵は左右の口から打って出ては引き、寄せ手を丸の前へ誘い込む
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 70, kind: 'gun', ...o });
const PORT = (s) => polar(s * 0.97, FENCE_R + 1);   // 丸の左右の口
function osCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'sanada', armor: SANADA.armor, dmg: 0.66, mass: 200, look: (l) => dress(l, SANADA),
    friends: () => [F.yam, F.second].filter((g) => g && g.count && !g.routed) };
}
// A 篠山の後：真田の挑発 → 乗るか、止めるか → 丸の前の誘い
function osA() {
  return [
    rest({ dur: 6, heal: 0.2, say: [['真田の兵', '前田の衆は雉撃ちか！　寄せたければ、この丸まで来てみよ！'], ['足軽', 'あいつら、笑うておる……'], ['山崎長徳', '……']] }),
    pick({ title: '真田の兵が挑発してくる。山崎長徳は今にも寄せそうだ。どうする？',
      options: [{ label: '山崎殿を諫め、篠山で竹束を揃えてから寄せる', note: '塀の鉄砲に撃たれにくくなる。その間、丸から誘いの兵が出てくる' }, { label: '挑発に乗り、一気に丸の前まで押し寄せる', note: '柵へ早く寄れる。丸の前で鉄砲組の一斉射を浴びる' }],
      on: (rt, m, i) => { m.osWait = i === 0; rt.say('山崎長徳', i === 0 ? '……うむ。竹束を前へ回せ。頭を冷やせと言うのじゃな' : 'おう、言わせておくものか！　丸の前まで寄せよ！', 3); } }),
    hold({ skip: (rt, m) => !m.osWait, at: { x: SASA.x - 4, z: SASA.z - 4 }, dur: 90, r: SASA.r + 4, title: '竹束を揃える', sub: '篠山の上で竹束を揃える間に、真田の誘いの兵が出る', label: '篠山', obj: '篠山で竹束が揃うまで、丸から出る誘いの兵を受けよ',
      waves: [
        { t: 6, say: ['足軽', '西の口から出てきた！'], foes: () => [{ name: '真田の誘いの兵', from: PORT(-1), list: [uS(2), uA(9)], mass: 120, morale: 80 }] },
        { t: 36, say: ['山崎長徳', '柵の外に鉄砲衆が並んだ！　竹束の陰へ！'], foes: () => [gunLine('柵の外の真田の鉄砲', PORT(1), 8)] },
        { t: 60, say: ['足軽', '東からも来る！　回り込む気じゃ！'], foes: () => [{ name: '東へ回る真田の兵', from: { x: 60, z: 30 }, list: [uS(2), uA(10)], mass: 160 }] },
      ],
      reward: '篠山で竹束を揃えた',
      onEnd: (rt) => { rt.award((t) => t.side.push('頭に血の上った山崎長徳を諫めた'), '山崎長徳を諫めた'); } }),
    fight({ skip: (rt, m) => m.osWait, at: { x: 6, z: C.z + FENCE_R + 10 }, title: '丸の前', sub: '柵の前に、真田の鉄砲衆が並んで待ち受ける', obj: '丸の前の柵の外に出た真田勢を崩せ（鉄砲の構えを見たら伏せよ）',
      foes: () => [gunLine('柵の前の真田の鉄砲衆', { x: -10, z: C.z + FENCE_R + 2 }, 10), { name: '柵の前の真田の槍', from: PORT(1), list: [uS(2), uA(10)], mass: 140 }],
      later: [{ t: 30, title: '二の列', sub: '柵の内からも鉄砲', say: ['足軽', 'もう一列並んだ！'], foes: () => [gunLine('二の列の真田の鉄砲', { x: 14, z: C.z + FENCE_R + 2 }, 8)] },
        { t: 56, title: '横槍', sub: '西の口から真田の兵', say: ['足軽', '西の口から横を突かれる！'], foes: () => [{ name: '西の口の真田の兵', from: PORT(-1), list: [uS(2), uA(10)], mass: 140 }] }],
      max: 140, reward: (t) => { t.special = { label: '丸の前で真田の鉄砲衆を崩した', pts: 20 }; }, rewardLabel: '丸の前で真田の鉄砲衆を崩した' }),
    rest({ dur: 6, bark: '立て直し：竹束の陰で組をまとめる', say: [['山崎長徳', '柵を破る組を前へ！']] }),
  ];
}
// B 殿の後：真田の二の打って出 → 堀の底の手負いを救うか → 退き口
function osB() {
  const at = { x: 4, z: RETREAT_Z - 10 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['足軽', '真田が丸へ引いた……'], ['山崎長徳', '引いたと見せて、また出てくるぞ。気を抜くな']] }),
    hold({ at, dur: 110, r: 14, title: '二の打って出', sub: '真田丸の左右の口から、もう一度真田が打って出る', label: '退き口', obj: '退き口の前で、もう一度打って出る真田勢を受けよ',
      say: [['山崎長徳', '来たぞ！　退き口を渡すな！']],
      waves: [
        { t: 4, say: ['足軽', '東の口から！　六文銭の旗じゃ！'], foes: () => [{ name: '真田の二の打って出', from: PORT(1), list: [uS(3), uA(13)], mass: 260, noRout: 25 }] },
        { t: 28, say: ['山崎長徳', '柵の外で火縄が光った！　伏せよ！'], foes: () => [gunLine('真田の鉄砲衆', { x: -20, z: C.z + FENCE_R + 6 }, 9)] },
        { t: 54, say: ['足軽', '西の口からもじゃ！　横へ回られる！'], foes: () => [{ name: '西の口の真田勢', from: PORT(-1), off: { x: -10, z: 0 }, list: [uS(2), uA(11)], mass: 220 }] },
        { t: 80, say: ['足軽', '騎馬が、退く味方の後ろへ回った！'], foes: () => [{ name: '真田の騎馬', from: { x: 60, z: 40 }, off: { x: 8, z: 10 }, list: [uS(1), uC(5)], mass: 80, kind: 'cavalry' }] },
      ],
      reward: '真田の二の打って出を受け止めた', lost: ['山崎長徳', '押し込まれた……！　じゃが、退き口はまだ開いておる'] }),
    rest({ dur: 7, bark: '立て直し：退き口の前で息を整える', say: [['足軽', '堀の底に……まだ生きておる者がおる。助けを呼んでおる'], ['山崎長徳', '丸の塀の真下じゃ。行けば撃たれる']] }),
    pick({ title: '堀の底に、手負いの味方が取り残されている。どうする？',
      options: [{ label: '組を連れて堀の縁まで戻り、手負いを引き上げる', note: '塀の鉄砲の真下へ行く。救えば味方の心に残る手柄' }, { label: '退き口を固め、味方が退ききるのを待つ', note: '手堅い。堀の底の者は見捨てることになる' }],
      on: (rt, m, i) => { m.osSave = i === 0; rt.say('山崎長徳', i === 0 ? '……行け。竹束を持って行け。長居はするな' : '……すまぬ。退き口を守れ', 3); } }),
    move({ skip: (rt, m) => !m.osSave, to: { x: -6, z: C.z + MOAT.r1 + 6 }, r: 7, label: '堀の縁', obj: '堀の縁まで戻り、手負いの味方を引き上げよ',
      say: [['足軽', '塀の上で、火縄の火が並んだ……！']],
      ambush: { d: 20, t: 18, title: '塀の下', sub: '真田の兵が、堀の縁へ出てくる', say: ['足軽', '真田が出てきた！　斬り抜けろ！'], foes: () => [{ name: '堀の縁の真田勢', from: PORT(-1), list: [uS(2), uA(9)], mass: 120 }, gunLine('柵の外の鉄砲', { x: 16, z: C.z + FENCE_R + 2 }, 7, { mass: 0 })] },
      onEnd: (rt, m, ok) => { if (ok) rt.award((t) => { t.special = { label: '堀の底の手負いを引き上げた', pts: 20 }; }, '堀の底の手負いを引き上げた'); } }),
    hold({ skip: (rt, m) => m.osSave, at, dur: 70, r: 14, title: '退き口', sub: '味方が退ききるまで', label: '退き口', obj: '味方が篠山の南へ退ききるまで、退き口を守れ',
      waves: [
        { t: 4, foes: () => [{ name: '追う真田勢', from: PORT(1), list: [uS(2), uA(10)], mass: 180 }] },
        { t: 34, say: ['足軽', '真田の鉄砲が、また筒先を揃えたぞ！'], foes: () => [gunLine('真田の鉄砲衆', { x: 20, z: C.z + FENCE_R + 6 }, 8)] },
      ],
      reward: '味方が退ききるまで退き口を守った' }),
  ];
}

export { sanadamaru };
