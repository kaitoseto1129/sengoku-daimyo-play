// ======================================================================
// 豊臣編 12　小田原征伐（天正十八年 1590・四月〜七月五日）　巨大包囲戦・天下統一
// 筋書きの正：docs/chapter2_toyotomi.md の「12. 小田原征伐」
// 秀吉はおよそ二十万で、町ごと堀と土塁で囲んだ小田原城（総構え）を囲む。石垣山に城を築き、木を伐って一夜で現れたように見せる。
// 主人公は城主として総構えの南西（早川口）の一角を受け持つ。最後は黒田官兵衛の開城の使いを城の門まで守る。
// 段：①総構えの外に陣を張る（陸と海の包囲・諸大名の軍議） ②夜、城から出る夜討ちを返す ③支城が次々に落ちる知らせ ④石垣山の城が姿を見せ、北条が揺れる ⑤打って出た北条勢を堀の外で返し、口を固める ⑥官兵衛を城の門まで守り届け、降伏・開城（力攻めで城を取らない）
// 向き：北が -z。東（+x）に総構えと小田原城、南西に石垣山、南東は海。ゲームの 1 はおよそ実の 8m（国土地理院の標高 dem_odawara と同じ縮め）
// ======================================================================
import * as THREE from 'three';
import { useTerrain } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, hut, kagaribi, kobune, yagura, castleMat } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { MEM_TIGHT } from './settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';
import { toyoClash } from './toyo_mob.js';

// ---- 場所（ゲームの座標） ----
const CASTLE = { x: 51, z: -131 };       // 小田原城の本丸
const KGATE = { x: 26, z: -96 };         // 城の門（官兵衛を届ける所）
const ISHI = { x: -68, z: 118 };         // 石垣山（一夜城）
const JIN = { x: -92, z: -24 };          // 受け持ちの陣（総構えの外）
const GATE = { x: -29, z: -30 };         // 総構えの早川口
const INSIDE = { x: -12, z: -40 };       // 口の内（土塁を越えた所）
// 総構えの土塁（西の一辺）。堀はその外（西）
const SOGAMAE = [[-14, 40], [-26, -10], [-36, -70], [-46, -140], [-44, -230]];
const MOAT = SOGAMAE.map(([x, z]) => [x - 8, z]);
// 早川（西の山から海へ）
const HAYAKAWA = [[-235, -10], [-170, 6], [-110, 22], [-60, 36], [-20, 44], [6, 52]];
// 官兵衛の道（早川口から町を抜けて城の門へ）
const ENVOY = [GATE, INSIDE, { x: 0, z: -62 }, { x: 14, z: -82 }, KGATE];
// 海岸線（これより南東は海）
const coastZ = (x) => 46 - Math.max(0, x + 2) * 0.62;

const TOYO = { flag: 'toyotomi' };
const KURODA = { flag: 'kuroda' };
const HOJO = { armor: 0x2e2a24, lace: 0x8a7a3a, flag: 'hojo' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const trap = (d, hw, sl) => clamp01((hw + sl - d) / sl);

// ---- 地形：手で描いた形に、国土地理院の起伏（戦場の外だけ）を足す ----
let dem = null;
useTerrain('dem_odawara', (data) => { dem = data; });
function height(x, z) {
  let h = 0.4 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 西と北の山（箱根の裾）・石垣山・八幡山（城の西の丘）
  h += Math.max(0, -x - 130) * 0.16 + Math.max(0, -z - 150) * 0.1 * clamp01((-x - 40) / 60);
  h += 30 * gauss(x, z, ISHI.x, ISHI.z, 1800) + 8 * gauss(x, z, ISHI.x - 40, ISHI.z + 30, 2600);
  h += 6 * gauss(x, z, CASTLE.x - 30, CASTLE.z - 10, 900) + 3.5 * gauss(x, z, CASTLE.x, CASTLE.z, 500);
  // 総構え：土塁（高さ 3）と、外の堀（深さ 2.4）。早川口は土塁が切れ、堀は土橋
  const atGate = Math.hypot(x - GATE.x, z - GATE.z);
  h += 3 * trap(distToPolyline(x, z, SOGAMAE), 2.2, 2.5) * clamp01((atGate - 5) / 3);
  h -= 2.4 * trap(distToPolyline(x, z, MOAT), 2.4, 1.6) * clamp01((atGate - 4) / 2);
  // 早川の河原と流れ
  h -= 1.4 * trap(distToPolyline(x, z, HAYAKAWA), 3, 4);
  // 海へ下る浜
  const cz = coastZ(x);
  if (z > cz - 10) h = h * clamp01((cz - z) / 10) - 1.6 * clamp01((z - cz + 2) / 8);
  if (dem) h += demRelief(dem, x, z, { xy: 8, cx: -40, cz: -40, inner: 150, fade: 50, scale: 0.12 });
  return h;
}

// ---- 一夜城：石垣山の頂の白い壁と櫓。はじめは手前の林に隠れる ----
function ichiyajo(rt) {
  const W = rt.world, F = rt.flags;
  const y0 = W.heightAt(ISHI.x, ISHI.z);
  const castle = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.85 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.7 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(box, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; castle.add(m); };
  // 石垣と白い塀（北を向く一辺が小田原から見える）
  add(stone, 0, 1.2, -9, 26, 2.4, 2.2); add(stone, -12, 1.2, 0, 2.2, 2.4, 18); add(stone, 12, 1.2, 0, 2.2, 2.4, 18);
  add(white, 0, 3.0, -9, 25, 1.4, 0.6); add(white, -12, 3.0, 0, 0.6, 1.4, 17); add(white, 12, 3.0, 0, 0.6, 1.4, 17);
  // 天守代わりの櫓
  add(stone, 2, 1.5, 0, 9, 3, 8); add(white, 2, 5, 0, 7, 4, 6); add(roof, 2, 7.6, 0, 8.6, 1.2, 7.6);
  add(white, 2, 9.0, 0, 4.4, 2.4, 3.6); add(roof, 2, 10.7, 0, 5.6, 1.0, 4.8);
  castle.position.set(ISHI.x, y0 - 0.4, ISHI.z);
  castle.visible = false;
  rt.scene.add(castle);
  // 手前（北）の林：伐られると消える
  const cone = new THREE.ConeGeometry(1.6, 6, 6);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2c3a24, roughness: 1 });
  const N = 60, wood = new THREE.InstancedMesh(cone, leaf, N), m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = -Math.PI * 0.95 + (i / N) * Math.PI * 0.9, r = 12 + (i % 3) * 2.5;
    const x = ISHI.x + Math.cos(a) * r, z = ISHI.z + Math.sin(a) * r;
    m4.makeScale(1, 1 + (i % 4) * 0.15, 1).setPosition(x, W.heightAt(x, z) + 3, z);
    wood.setMatrixAt(i, m4);
  }
  rt.scene.add(wood);
  F.ichiya = { castle, wood };
}

// ---- 総構えの塀と町（見た目だけ） ----
function sogamae(rt) {
  const W = rt.world;
  for (const [x, z] of [[-24, -2], [-31, -48], [-38, -90], [-44, -128]]) rt.scene.add(nobori(W, x + 2, z, 'hojo', 5));
  for (const [x, z, r] of [[-6, -48, 0.2], [4, -58, -0.3], [-2, -74, 0.4], [10, -70, 0.1], [16, -88, -0.2], [-10, -88, 0.3], [6, -40, 0.5], [22, -66, 0]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
  rt.scene.add(nobori(W, KGATE.x + 4, KGATE.z - 3, 'hojo', 7));
  rt.scene.add(nobori(W, KGATE.x - 4, KGATE.z - 3, 'hojo', 7));
}

// ---- 総構えの土塁の上の板塀（史実の目玉：町ごと囲む九km の総構え）。柱と板を一つの形にまとめて一回で描く。早川口は開ける ----
function sogamaeWall(rt) {
  // 本物に寄せる（小田原城の総構えの復元図・山中城の土塁の上の塀の復元）：下見板を横に重ね張りした板塀に、板葺の両流れの笠と、
  //   一間（1.8m）ごとの控え柱。板は castleMat('shitami')（城の下見板と同じ絵・材質を使い回す）。色は柱間ごとに褪せ方を変える
  const W = rt.world, parts = [], wood = [];
  const col = (g, r, gg, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const uvs = (g, w, h, d) => { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 2.4, uv.getY(i) * dims[f][1] / 2.4); } return g; };
  for (let i = 0; i < SOGAMAE.length - 1; i++) {
    const [ax, az] = SOGAMAE[i], [bx, bz] = SOGAMAE[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 3);
    const ry = Math.atan2(bx - ax, bz - az), sl = L / n;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (Math.hypot(x - GATE.x, z - GATE.z) < 8) continue;
      const y = W.heightAt(x, z) - 0.15, f = 0.82 + (Math.sin(k * 2.3 + i) * 0.5 + 0.5) * 0.3;
      const b = uvs(new THREE.BoxGeometry(0.12, 2.5, sl + 0.04), 0.12, 2.5, sl + 0.04); b.rotateY(ry); b.translate(x, y + 1.25, z); parts.push(col(b, f, f * 0.97, f * 0.93));
      // 板葺の笠：両へ流れる二枚の板（棟の木を挟む）
      for (const sd of [-1, 1]) { const c = new THREE.BoxGeometry(0.42, 0.05, sl + 0.12); c.rotateZ(sd * 0.42); c.translate(sd * 0.19, 0, 0); c.rotateY(ry); c.translate(x, y + 2.58, z); wood.push(col(c, 0.36 * f, 0.33 * f, 0.29 * f)); }
      const ridge = new THREE.BoxGeometry(0.1, 0.1, sl + 0.12); ridge.rotateY(ry); ridge.translate(x, y + 2.68, z); wood.push(col(ridge, 0.25, 0.22, 0.19));
      const q = new THREE.BoxGeometry(0.2, 2.75, 0.2); q.rotateY(ry); q.translate(x - Math.sin(ry) * sl / 2, y + 1.3, z - Math.cos(ry) * sl / 2); wood.push(col(q, 0.42 * f, 0.36 * f, 0.29 * f));
      // 控え柱（内側＝東へ斜めに支える）
      if (k % 2 === 0) { const h = new THREE.BoxGeometry(0.12, 2.2, 0.12); h.rotateZ(-0.5); h.translate(-0.62, 0.95, 0); h.rotateY(ry); h.translate(x - Math.sin(ry) * sl / 2, y, z - Math.cos(ry) * sl / 2); wood.push(col(h, 0.4 * f, 0.34 * f, 0.27 * f)); }
    }
  }
  for (const [list, mat] of [[parts, castleMat('shitami')], [wood, new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a7a64 })]]) {
    const geo = mergeGeometries(list.map((g) => g.toNonIndexed())); for (const g of list) g.dispose();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    rt.scene.add(m);
  }
  // 土塁の上の物見の櫓（遠くから総構えの線が分かるように）
  for (const [x, z] of [[-18, 22], [-34, -46], [-40, -98], [-45, -160]]) rt.scene.add(yagura(W, x + 3, z));
}

// ---- 総構えを囲む豊臣の陣の列と、土塁の内に並ぶ北条の兵（軽い作り・本物に替えない）。本人から60m の内は描かれないので、列は南北の地平へ続く ----
function siegeLines(rt) {
  const W = rt.world, T = MEM_TIGHT;
  const far = (o) => { const g = W.addDistantArmy({ host: false, near: false, farFill: true, flagRate: 0.8, w: 46, d: 12, ...o }); g.noWake = true; if (g.army) g.army.noWake = true; return g; };
  let s = 15901;
  for (const [x, z] of [[-46, 34], [-60, -78], [-68, -130], [-70, -186]]) far({ x, z, count: T ? 130 : 220, facing: Math.PI / 2, kind: s % 2 ? 'spear' : 'mixed', flag: 'toyotomi', armor: KIT.ARMOR.oda, team: 0, seed: s++ });
  for (const [x, z] of [[-6, 18], [-12, -6], [-24, -58], [-32, -112]]) far({ x, z, w: 30, d: 8, count: T ? 80 : 140, facing: -Math.PI / 2, kind: 'gun', flag: 'hojo', armor: HOJO.armor, team: 1, seed: s++ });
}

// ---- 地平まで続く豊臣の陣と、総構えの内の北条の兵（軽い作り） ----
function hosts(rt) {
  const F = rt.flags, A = KIT.ARMOR;
  F.far = [];
  const H = (x, z, w, d, n, facing, armor, flag, seed, kind) => F.far.push(KIT.farHost(rt, x, z, w, d, n, facing, armor, flag, seed, kind));
  // 豊臣方：西の山裾から北へ、地平まで
  H(-130, -40, 40, 16, 260, Math.PI / 2, A.oda, 'toyotomi', 1201, 'mixed');
  H(-120, -110, 40, 16, 240, Math.PI / 2, A.oda, 'toyotomi', 1202, 'spear');
  H(-100, -180, 40, 16, 240, Math.PI / 2 + 0.3, A.tokugawa, 'tokugawa', 1203, 'mixed');
  H(-30, -260, 50, 16, 260, 0.2, A.tokugawa, 'tokugawa', 1204, 'spear');
  H(-150, 30, 34, 14, 200, Math.PI / 2, A.oda, 'toyotomi', 1205, 'gun');
  H(-80, 80, 30, 12, 180, 0, A.oda, 'toyotomi', 1206, 'mixed');
  // 北条方：総構えの内
  H(10, -110, 30, 14, 220, -Math.PI / 2, HOJO.armor, 'hojo', 1207, 'spear');
  H(0, -170, 30, 14, 200, -Math.PI / 2, HOJO.armor, 'hojo', 1208, 'mixed');
}

// ---- 海の囲み：相模の海に並ぶ豊臣の水軍の船（見た目だけ） ----
function fleet(rt) {
  const W = rt.world;
  for (const [x, z, r] of [[-6, 76, 0.4], [14, 66, 0.2], [34, 52, -0.1], [56, 40, -0.3], [76, 28, -0.5], [24, 88, 0.1], [50, 70, -0.2], [80, 52, -0.4], [100, 30, -0.6]]) {
    if (z < coastZ(x) + 6) continue;
    const b = kobune(x, Math.max(-1.2, W.heightAt(x, z)) + 0.3, z, Math.PI * 0.75 + r, 9);
    if (b) rt.scene.add(b);
  }
}

// ---- 段 ⑤：官兵衛を城の門まで守り届ける（使いが討たれたら負け） ----
function escort() {
  return {
    kind: 'escort', max: 200,
    start(rt, C) {
      const F = rt.flags;
      C.at = GATE; C.goal = GATE; C.i = 1; C.groups = []; C.waves = [10, 32, 54];
      F.envoy = allyGroup(rt, { faction: 'oda', name: '黒田官兵衛の使い', anchor: { ...GATE }, facing: Math.PI / 2, width: 6, aggro: 4, noRout: true, morale: 100 },
        dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', hat: 'kabuto_m', haori: 0x2a2a2a, horse: false } }, { type: 'samurai', n: 4 }], KURODA));
      F.kanU = F.envoy.units[0];
      F.kanU.maxHp = (F.kanU.maxHp || 100) * 3; F.kanU.hp = F.kanU.maxHp;
      F.envoy.defMult = 1.6;
      rt.banner('開城の使い', '黒田官兵衛を小田原城の門まで');
      sfx('horagai', 0.6);
      rt.say('黒田官兵衛', '刀は預けて参る。城の門まで、道を開けてくだされ', 4);
      rt.obj('dp', '官兵衛を城の門まで守り届けよ', 'main');
      rt.marker('dp', KGATE, '城の門', { h: 3 });
      rt.marker('kan', () => F.kanU.pos, '官兵衛', { h: 2.6 });
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags, k = F.kanU;
      if (!k.alive) return true;
      // 抗う北条の侍が、町の辻から使いを狙う
      if (C.waves.length && el >= C.waves[0]) {
        C.waves.shift();
        const from = { x: k.pos.x + 22, z: k.pos.z - 14 };
        const g = enemyGroup(rt, { faction: 'hojo', name: '抗う北条の侍', anchor: from, facing: -Math.PI / 2, order: 'attack', seekRange: 50, aggro: 14, width: 8, morale: 70, dmgMult: 0.55 },
          dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], HOJO));
        g.anchor = { x: k.pos.x, z: k.pos.z };
        C.groups.push(g);
        rt.say('北条の侍', '降るなど許さぬ！　使いを討て！', 3);
      }
      for (const g of C.groups) if (!gone(g) && g.count < 4) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
      // 自分が近くにいる間だけ、使いは前へ進む
      const p = rt.player.u.pos, tgt = ENVOY[Math.min(C.i, ENVOY.length - 1)];
      const near = Math.hypot(p.x - k.pos.x, p.z - k.pos.z) < 18;
      const threat = C.groups.some((g) => !gone(g) && g.units.some((u) => u.alive && !u.fleeing && Math.hypot(u.pos.x - k.pos.x, u.pos.z - k.pos.z) < 10));
      if (near && !threat) F.envoy.anchor = { x: tgt.x, z: tgt.z };
      if (Math.hypot(k.pos.x - tgt.x, k.pos.z - tgt.z) < 4 && C.i < ENVOY.length - 1) C.i++;
      const left = Math.hypot(k.pos.x - KGATE.x, k.pos.z - KGATE.z);
      C.goal = threat ? k.pos : tgt;
      rt.objProgress('dp', near ? `門まで あと${Math.round(left)}m` : '官兵衛のそばへ');
      return C.i >= ENVOY.length - 1 && left < 6 && !threat;
    },
    end(rt, C) {
      const F = rt.flags;
      rt.unmark('dp'); rt.unmark('kan');
      for (const g of C.groups) if (!gone(g)) { g.noRout = false; g.morale = 0; }
      if (F.kanU.alive) { rt.objDone('dp'); rt.award((t) => t.side.push('開城の使いを守り届けた'), '開城の使いを守り届けた'); }
    },
  };
}

// 北国勢（前田利家・上杉景勝）が支城を落として着陣する（陣の北。動かない）
function hokkoku(rt) {
  const F = rt.flags;
  if (F.hokkoku) return;
  F.hokkoku = allyGroup(rt, { faction: 'oda', name: '北国勢', anchor: { x: JIN.x - 20, z: JIN.z - 40 }, facing: Math.PI / 2, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
    [{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: false, flag: 'maeda' } }, { type: 'busho', n: 1, o: { name: '上杉景勝', invuln: true, horse: false, flag: 'uesugi' } }, { type: 'samurai', n: 4, o: { flag: 'maeda' } }]);
  for (const u of F.hokkoku.units) u.invuln = true;
  for (const [x, z, f] of [[JIN.x - 26, JIN.z - 46, 'maeda'], [JIN.x - 12, JIN.z - 46, 'uesugi']]) rt.scene.add(nobori(rt.world, x, z, f, 7));
}

const t12_odawara = {
  spawn: { x: JIN.x - 10, z: JIN.z + 6, heading: Math.PI / 2 },
  noWake: true,
  noFrontFill: true,         // 籠城の囲み（野の斬り合いは無い）。奥は siegeLines の陣の列で埋める
  world: {
    seed: 1590,
    battleViewDistance: 110,  // 八十歩の霞で総構えの塀と囲む陣の列が白く消えた。兵数は増やさない
    time: 'day',
    paths: [[[-200, -30], [-140, -26], [-92, -24], [-50, -28], [GATE.x, GATE.z], [INSIDE.x, INSIDE.z], [0, -62], [14, -82], [KGATE.x, KGATE.z]], [[-92, -24], [-80, 40], [ISHI.x, ISHI.z - 20]]],
    height,
    tint(x, z, h, c) {
      // 海と浜
      const cz = coastZ(x);
      if (z > cz - 4) { const k = clamp01((z - cz + 4) / 6); c.setRGB(c.r * (1 - k) + 0.16 * k, c.g * (1 - k) + 0.24 * k, c.b * (1 - k) + 0.28 * k); return; }
      if (z > cz - 12) { const k = 0.6; c.setRGB(c.r * (1 - k) + 0.55 * k, c.g * (1 - k) + 0.5 * k, c.b * (1 - k) + 0.4 * k); return; }
      // 土塁の土と堀の泥
      const ds = distToPolyline(x, z, SOGAMAE), dm = distToPolyline(x, z, MOAT);
      if (ds < 4.5) c.setRGB(c.r * 0.7 + 0.12, c.g * 0.68 + 0.09, c.b * 0.6 + 0.05);
      else if (dm < 3.6) c.setRGB(c.r * 0.45 + 0.08, c.g * 0.48 + 0.09, c.b * 0.45 + 0.07);
      // 早川の河原
      if (distToPolyline(x, z, HAYAKAWA) < 6) c.setRGB(c.r * 0.5 + 0.25, c.g * 0.5 + 0.24, c.b * 0.5 + 0.21);
      if (h > 8) c.setRGB(c.r * 0.84, c.g * 0.93, c.b * 0.82);
    },
    clear: (x, z) => (x > -130 && x < 40 && z > -120 && z < 30) || Math.hypot(x - ISHI.x, z - ISHI.z) < 16,
    streams: [{ pts: HAYAKAWA, w: 5, depth: 1.0 }],
    trees: 380,
    tufts: 3600,
    treeDensity: (x, z) => (z > coastZ(x) - 8 ? 0 : Math.hypot(x - ISHI.x, z - ISHI.z) < 55 ? 0.9 : x < -130 || z < -150 ? 0.8 : 0.15),
    groves: [{ x: -150, z: -80, r: 16, n: 22 }, { x: -60, z: 70, r: 12, n: 16 }, { x: ISHI.x + 30, z: ISHI.z + 10, r: 14, n: 18 }],
    fleeOut: (x, z, team) => (team === 1 ? x > 30 || z < -140 : x < -200),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false;
    // ---- 豊臣方：自分の手勢と、隣の陣 ----
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: JIN.x + 6, z: JIN.z }, facing: Math.PI / 2, width: 14, aggro: 9, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], TOYO));
    F.next = allyGroup(rt, { faction: 'oda', name: '隣の陣', anchor: { x: JIN.x + 4, z: JIN.z - 26 }, facing: Math.PI / 2, width: 14, aggro: 9, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], TOYO));
    for (const g of [F.mine, F.next]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: JIN.x - 4, z: JIN.z + 8 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 20) }]);
    // ---- 陣・旗・篝火 ----
    rt.scene.add(jinmaku(W, JIN.x - 14, JIN.z, 14, 10, 4, { mon: 'toyotomi' }));
    for (const [x, z] of [[JIN.x + 2, JIN.z - 8], [JIN.x + 2, JIN.z + 8], [JIN.x - 6, JIN.z - 30], [JIN.x - 30, JIN.z - 12]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    for (const [x, z] of [[JIN.x + 8, JIN.z - 4], [JIN.x + 8, JIN.z + 6], [JIN.x - 2, JIN.z - 16]]) rt.scene.add(kagaribi(W, x, z));
    sogamae(rt);
    sogamaeWall(rt);
    siegeLines(rt);
    ichiyajo(rt);
    hosts(rt);
    fleet(rt);
    // 総構えの早川口の堀の手前で、夜明けに打って出た北条の兵と寄せ手が斬り合う（史実：囲みの間も口々で小競り合い。始めの25秒のカメラの右前 32m。手前の味方の列に隠れない所）
    F.sally = toyoClash(rt, { x: -57, z: -12, facing: Math.PI / 2 + 0.55, w: 36, seed: 1209,
      A: { flag: 'toyotomi', armor: KIT.ARMOR.oda, count: 130 }, B: { flag: 'hojo', armor: HOJO.armor, count: 120, guns: true } });
    // 全国から集まった大名の軍議（陣幕の前。動かない）
    F.council = allyGroup(rt, { faction: 'oda', name: '諸大名の軍議', anchor: { x: JIN.x - 24, z: JIN.z + 14 }, facing: Math.PI / 2, width: 7, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([['豊臣秀吉', 'kabuto_w'], ['徳川家康', 'kabuto_m'], ['豊臣秀次', 'kabuto_w'], ['宇喜多秀家', 'kabuto_w'], ['小早川隆景', 'kabuto_m'], ['石田三成', 'kabuto_m']]
        .map(([name, hat]) => ({ type: 'busho', n: 1, o: { name, hat, invuln: true, horse: false } })), TOYO));
    for (const u of F.council.units) u.invuln = true;
    // 総構えの奥の本丸に籠もる北条の当主たち（動かない）
    F.hojo = enemyGroup(rt, { faction: 'hojo', name: '北条の本丸', anchor: { ...CASTLE }, facing: Math.PI / 2, width: 5, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([['北条氏直'], ['北条氏政'], ['北条氏照']].map(([name]) => ({ type: 'busho', n: 1, o: { name, hat: 'kabuto_m', invuln: true, horse: false } })), HOJO));
    for (const u of F.hojo.units) u.invuln = true;

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '小田原城を開かせ、天下を一つにする', 'main');
    // 戦の前（筋書きの一枚の言葉）
    rt.say('豊臣秀吉', '北条は名胡桃の城を奪い、わしの裁きを破った。天下の軍を見せてやれ', 4.5);
    rt.after(5, () => rt.say('徳川家康', '北条とは縁を結んだ仲なれど、此度は殿下の先手を務めまする', 4.5));
    rt.after(10, () => rt.say('黒田官兵衛', '急がずともよい。戦わずに開かせるのが、一番の手柄にございます', 4.5));
    rt.after(15, () => rt.say('豊臣秀吉', `${nm(rt)}、おぬしは早川口の一角を受け持て。攻め入るでないぞ`, 4));
    rt.after(19.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true;
    rt.setPhase('siege');
    sfx('taiko', 0.8);
    depthStart(rt, { faction: 'hojo', flag: 'hojo', armor: HOJO.armor, friends: () => [F.mine, F.next], look: (list) => dress(list, HOJO), scale: 1.4, mass: 140, dmg: 0.6 }, [
      // ① 総構えの外に陣を張る
      DP.move({ to: { x: JIN.x + 14, z: JIN.z }, obj: '総構えの外に陣を張れ', label: '受け持ちの陣', r: 8,
        say: [['使番', '堀から鉄砲の届かぬ所に、柵と陣幕を立てよ']] }),
      DP.rest({ dur: 13, banner: ['小田原の陣', '陸も海も、豊臣の陣と船が囲む'],
        say: [['足軽', '見渡すかぎり、味方の旗じゃ……'], ['手勢の侍', '海にも船が並んでおる。九鬼と長宗我部の水軍じゃ'], ['使番', '毛利輝元殿は京を守り、毛利の船も寄越された'], ['手勢の侍', '北条は、城と町ごと堀で囲うておる']] }),
      // ② 夜、城から出る夜討ちを返す
      DP.hold({ at: { x: JIN.x + 10, z: JIN.z }, dur: 60, r: 16, label: '陣の柵', title: '夜討ち', sub: '北条の兵が総構えから出てきた', obj: '夜討ちを陣の前で返せ',
        say: [['見張り', '堀の向こうに火が動く！　夜討ちじゃ！']],
        waves: () => [
          { t: 4, foes: () => [{ name: '北条の夜討ち', from: { x: GATE.x - 14, z: GATE.z + 4 }, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }] }] },
          { t: 28, foes: () => [{ name: '北条の夜討ち二番', from: { x: GATE.x - 16, z: GATE.z - 22 }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }] }], say: ['見張り', '北からも来る！'] },
        ], reward: '夜討ちを返した' }),
      // ②の後 支城が次々に落ちる（使番の知らせ。北国勢の前田・上杉も着陣）
      DP.rest({ dur: 16, banner: ['支城が落ちていく', '山中・韮山・松井田・鉢形・八王子'],
        fn: (rt2) => { hokkoku(rt2); },
        say: [['使番', '山中城、半日で落ちました！'], ['使番', '松井田の大道寺政繁は降り、北国勢の道案内をしておる'], ['使番', '鉢形城の北条氏邦殿も城を開いた'],
          ['前田利家', '八王子城は落とした。氏照殿の城じゃ'], ['上杉景勝', '関東の北条の城は、もう幾つも残っておらぬ']] }),
      // ③ 石垣山の城が姿を見せる
      DP.rest({ dur: 12, banner: ['石垣山の一夜城', '林が伐られ、山の上に白い城が現れた'],
        fn: (rt2) => { rt2.world.setTime('morning'); const I = rt2.flags.ichiya; if (I) { I.castle.visible = true; I.wood.visible = false; } sfx('horagai', 0.7); },
        say: [['北条の兵', 'あれは何じゃ……一夜で城が建ったぞ！', 3.5], ['手勢の侍', '殿下は、北条の心を折りに来られたのじゃ', 3.5],
          ['北条の兵', '松田憲秀様が、豊臣に内通したとの噂じゃ……', 3.5], ['北条の兵', '城の中は、戦うか降るかで割れておる', 3.5]] }),
      // ④ 追い詰められて早川口から打って出た北条勢を、堀の外で返す（城へは攻め入らない）
      DP.fight({ at: { x: GATE.x - 10, z: GATE.z }, title: '早川口の打って出', sub: '追い詰められた北条勢が口から出てきた', obj: '打って出た北条勢を、堀の外で返せ',
        say: [['使番', '城へは攻め入るな。出てきた者だけを堀の外で返せ']],
        foes: () => [{ name: '打って出た北条勢', from: { x: INSIDE.x, z: INSIDE.z }, list: [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }] }],
        later: [{ t: 30, foes: () => [{ name: '北条の新手', from: { x: INSIDE.x + 10, z: INSIDE.z - 16 }, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }] }], say: ['足軽', '土塁の上から新手じゃ！'] }],
        max: 150, reward: '打って出た北条勢を返した' }),
      DP.hold({ at: { x: GATE.x - 12, z: GATE.z }, dur: 30, r: 14, label: '早川口の前', obj: '早川口の前を固めよ',
        say: [['手勢の侍', '口を塞いだぞ！　城の者に、もう出る道は無いと見せよ']],
        waves: () => [{ t: 6, foes: () => [{ name: '取り返しに来た北条勢', from: { x: INSIDE.x + 24, z: INSIDE.z - 10 }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }] }] }],
        reward: '早川口の前を固めた' }),
      // ⑤ 開城の使いを城の門まで
      escort(),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (!F.kanU || !F.kanU.alive) return this.lose(rt);
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '小田原開城', pts: 60 }; }, '小田原城が開いた');
    sfx('horagai', 0.9);
    rt.banner('小田原城、開城', '天正十八年七月五日　天下が一つになる');
    rt.player.u.invuln = true;
    // 戦の後（筋書きの一枚の言葉）
    rt.say('北条氏直', '城を開く。わしの腹ひとつで、城の者の命を助けてくだされ', 4.4);
    rt.after(4.8, () => rt.say('使番', '氏政殿・氏照殿は腹を召され、氏直殿は高野山へとのこと', 4.2));
    rt.after(9.4, () => rt.say('豊臣秀吉', 'これで日の本は一つじゃ。上様にも見せたかったのう', 4.6));
    rt.after(14.4, () => rt.say('豊臣秀吉', '家康殿、北条の関東はそなたに任せる。江戸に城を構えよ', 4.6));
    rt.after(19.4, () => rt.say('徳川家康', '……ありがたく、お受けいたしまする', 3.6));
    rt.after(23.4, () => rt.say('豊臣秀吉', '足軽から、よう上がった。今日からおぬしも大名じゃ', 4.6));
    rt.finish({}, 29);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('kan');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('任務失敗', '開城の使いが討たれた');
    rt.say('豊臣秀吉', '官兵衛を討たせたか……開城の話は、振り出しじゃ', 4);
    rt.finish({ failureReason: '開城の使いの官兵衛が討たれた' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    // 夜討ちの段だけ夜にする
    const D = F.dp, kind = D && D.on && D.cur ? D.cur.s.kind : '';
    if (kind === 'hold' && D.i === 2 && !F.night) { F.night = true; rt.world.setTime('night'); }
    if (F.kanU && !F.kanU.alive) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

t12_odawara.force = (rt) => ({ a: Math.round(210000 - (rt.flags.ak || 0) * 30), a0: 210000, b: Math.max(0, 50000 - (rt.flags.ek || 0) * 40), b0: 50000 });
t12_odawara.sides = { a: { name: '豊臣軍', mon: 'toyotomi' }, b: { name: '北条軍', mon: 'hojo' } };
t12_odawara.date = (rt) => (rt.flags.night && !rt.flags.ichiya?.castle.visible ? '天正十八年　夏・夜' : '天正十八年（1590）七月　夏・晴');
t12_odawara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t12_odawara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t12_odawara.history = '天正十八年（1590）、豊臣秀吉はおよそ二十万の軍で関東の北条氏を攻めた。前の年、北条方が真田の名胡桃城を奪ったことが、秀吉の裁き（惣無事）を破ったとされ、戦の発端となった。徳川家康・前田利家・上杉景勝・宇喜多秀家・小早川隆景ら全国の大名が加わり、九鬼嘉隆・長宗我部元親らの水軍が海を塞いだ。北条氏政・氏直は、城下の町ごと堀と土塁で囲んだ小田原城の総構え（およそ九km）に籠もった。秀吉は城を見下ろす石垣山に城を築き、まわりの木を伐って一夜で現れたように見せたと伝わる（石垣山一夜城）。三か月あまりの囲みの間、秀吉は茶の湯や能を催し、大軍で北条の心を折った。その間に山中・韮山・松井田・鉢形・八王子などの支城が次々に落ち、重臣の松田憲秀の内通も露見して城の中は揺れた。黒田官兵衛（孝高）らが開城を説き、七月五日に氏直が自らの命と引き換えに城の者を助けるよう申し出て降った。氏政と弟の氏照は腹を切り、氏直は高野山へ送られた。北条の旧領の関東は徳川家康に与えられ、家康は江戸へ移った。奥州の大名も従って、天下は一つになった。\n夜討ちの場面と、早川口での攻め合い、官兵衛を門まで送る道筋は遊びのための復元である。両軍の人数は推定で、北条方の数には別の伝えもある。';
t12_odawara.bushou = [{ name: '黒田官兵衛', g: /官兵衛/ }];

// 素直な遊び手：段の頭（depthBot）に任せる。段の前は陣のそばで待つ
t12_odawara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, JIN.x + 6, JIN.z + 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t12_odawara);

export { t12_odawara };
export default t12_odawara;
