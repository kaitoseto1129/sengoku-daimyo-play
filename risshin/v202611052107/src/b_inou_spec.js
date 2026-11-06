// ======================================================================
// 稲生の戦い（kaito 10/29 夜の仕様 docs/inou_spec_1029.md）
// 南北300m×東西150m。南端から北の土手の林美作守へ。正面の道と葦原の脇道。
// 11/1 kaito（B 節）：練習 → 陣形対陣形の大軍の激突（林の先手）→ 二の備と弓組 → 土手の林美作守。自分は味方の横の列の一組として動く。
// 11/3 kaito の流れ（docs/battle_refs/inou_story.md）：柴田勢 千との乱戦を耐える → 信長が前へ出て「主に刃を向けるのか」の大音声で柴田勢が崩れる
// → 「隊列を整えよ」で列を止め、助けに来た林勢 七百（こちらは四百ほど）へ → 土手の旗本を崩す → 信長が駆けつける中で美作守を討つ。
// 流れ矢が飛ぶ。右上は「目標」の札（stages.js）と小さな地図（美作守の居場所は赤いひし形）。ばかでかい赤い旗印はやめた。
// 以下は 10/29 の仕様の名残り：
// 雑兵は北へ退く槍兵（8mで振り向く）と立ち止まる弓兵。近づいた区画から出す。
// 乱戦激戦（kaito 10/29 夜「同時2体・画面15体は無視。乱戦激戦にしないと」）：正面の道には味方と林勢が押し合う乱戦の塊を
// 先々に置き続け、本人は四方から攻められる（同時に打つのは四人まで。組頭と味方が横で受け止める）。土手は取り巻きと林勢の最後の踏ん張り。
// 地面・田・草・甲冑の見た目は前の稲生（b_inou.js）の world を使う。座標：南が +z、北が −z。
// ======================================================================
import * as THREE from 'three';
import { inou as OLD } from './b_inou.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori, hut } from './props.js';
import { MEM_TIGHT } from './settings.js';
import { plumeTuftGeo, plumeTuftMat } from './world_grass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';

const XW = 74, ZS = 146, ZN = -146;           // 見えない壁（東西 ±74・南北 ±146）
const START = { x: 12, z: 136 };
// 11/3 p100_inou（kaito AT10「無駄に歩かせない」）：土手は前の z −134 から −14 へ寄せた。林勢の先手を崩した所から土手まで四十m余り（前は百三十m）
const BOSS = { x: 8, z: -14 };                // 北の土手の上
const FRONT_X = 12;                            // 正面の道
const SIDE = [[-40, 150], [-46, 80], [-36, 0], [-44, -80], [-30, -122], [0, -132]];   // 葦原の脇道
const sideX = (z) => { for (let i = 0; i < SIDE.length - 1; i++) { const [ax, az] = SIDE[i], [bx, bz] = SIDE[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (az - z) / (az - bz); } return SIDE[SIDE.length - 1][0]; };
// 陣形（kaito 11/1 B 節）：味方は横一列の七組（自分の組は道の真ん中）、林の先手は横一列の六組、二の備は五組と後ろの弓組二つ
const SLOTS = [-27, -14, -1, 25, 38, 51];
// 林勢（先手・弓・土手の組・美作守と旗本）は開戦の時に北の霞の向こう（L2_Z0）に出て、名塚の方から本物の兵のまま駆けつけ、土手の前（L2_HOLD）で構える
const ALLY_Z0 = 130, L1_Z0 = 82, L1_MEET = 104, L2_Z0 = -88, L2_HOLD = 22, L2_MEET = 64, BOW_Z = 8;
// 11/3 kaito の稲生の流れ（docs/battle_refs/inou_story.md）：柴田勢 約千が信長方 七百足らずに押し寄せるので、柴田の列は味方より一組多く厚く
// 兵の比（docs/battle_refs/inou.md）：柴田 千 対 信長方 七百 ≒ 1.4 倍、柴田が崩れた後は林 七百 対 四百 ≒ 1.75 倍。見せかけの軍勢は置かず、本物の兵の数でこの比にする
const L1_X = [-26, -13, 0, 13, 26, 39, 52], L2_X = [-20, -6, 8, 22, 36, 50];
const NK = MEM_TIGHT ? 0.8 : 1;                // 携帯は組の人数を八割に（比は変えない）
const L1_N = Math.round(13 * NK), L2_N = Math.round(12 * NK), ALLY_N = Math.round(10 * NK);
const PRACTICE_T = 45, STAGE_T = 150;
const SHOUT_T = 50;                            // 列がぶつかってから信長の大音声までの乱戦（柴田の列が半分に減れば早まる）
const REGROUP_T = 7;                           // 柴田勢が崩れた後、列を整える間
// 両軍の人数（『信長公記』：信長方 七百足らず、柴田勢 千・林美作守 七百）。字の無い兵の絵の棒（hud_army.js）と開戦の札で見せる
const FORCE = { a: 700, a0: 700, b: 1700, b0: 1700 };
const round10 = (n) => Math.max(0, Math.round(n / 10) * 10);
const TURN = 8;                                // 槍兵が振り向く近さ
const BOW_RANGE = 30;
const BOSS_RANGE = 20;
const BOSS_HP = 115;                           // 美作守の命（四方から攻められる分、一騎打ちは四十秒〜一分に収まるよう軽く）
// 雑兵の装い：黒・茶・柿渋（青にしない）。旗指物は赤でない物
const ZAKO = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'kari', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, ...(s.o || {}) } }));
// 11/5 時代考証：柴田勢は勝家の二つ雁金。林美作守の勢は林家の紋が伝わらないので、主の信勝（弾正忠家）の木瓜を白地で（前は柴田の雁金を林勢にも立て、美作守は朱の雁金で朱漆の胴だった）
const HAYA = { flag: 'nobukatsu' };
const dressH = (list) => dress(list.map((s) => ({ ...s, o: { ...HAYA, ...(s.o || {}) } })));
// 11/5 方角（『信長公記』）：信長は於多井川を渡って東南へ向かう。柴田は東の街道から、林は南の田から。
//   画面の奥（−z）を南東とし、柴田勢は左前（東）の街道から斜めに、林勢は右前（南）の田から寄せる
const L1_DX = -14, L2_DX = 12;

// 北の土手：z 2 から −12 にかけて二メートル半ほど上がる
const bank = (z) => { const k = Math.max(0, Math.min(1, (BOSS.z + 16 - z) / 14)); return k * k * (3 - 2 * k) * 0.5; };  // 11/5 史実の野は平ら：二メートル半から半mの畦ほどに
const baseH = OLD.world.height;
const height = (x, z) => baseH(x, z) + bank(z);

// 稲架（10/30 採点「稲架が無い」）：25秒の所（道の z 100〜110）から八方のどこを向いても一〜二基が入るよう、道の東西と前後に四基。
// 杭と横木と垂らした稲束を、頂点の色だけの材質一つ・形一つにまとめる（絵は足さない。描く数は一つ。影は落とさない）。束は五角の筒で軽く。
// 当たりは付けない（兵の歩く道を変えない）。道（x 12）と葦原の脇道からは離す。
// 11/3 p100_inou：両軍の列が組み合う田の中（x −27〜54）の稲架は兵が素通りしたので、東の端と出だしの裏（南）へ寄せる
const HASA = [[56, 98, Math.PI / 2 + 0.06, 7], [56, 118, Math.PI / 2 - 0.05, 6], [30, 151, 0.08, 8], [-8, 152, -0.1, 7]];
function hasaField(rt) {
  const W = rt.world, parts = [], c = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
  const paint = (g, hex, k) => { c.setHex(hex).multiplyScalar(k); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; } return g; };
  for (const [x, z, rot, len] of HASA) {
    const one = [], tiers = 2, top = 0.75 + tiers * 0.55, n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) { const p = new THREE.CylinderGeometry(0.045, 0.06, top + 0.35, 5, 1, true); p.rotateZ(0.03 * Math.sin(i * 2.7)); p.translate((i / n - 0.5) * len, (top + 0.35) / 2 - 0.15, 0); one.push(paint(p, 0x5a4a38, 0.75 + 0.15 * Math.abs(Math.sin(i * 1.9)))); }
    for (let t = 0; t < tiers; t++) {
      const y = 0.75 + (t + 1) * 0.55 - 0.05;
      const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.5, 4, 1, true); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); one.push(paint(bar, 0x625240, 0.85));
      const m = Math.floor(len / 0.17);
      for (let k = 0; k < m; k++) {
        const lx = -len / 2 + 0.1 + k * 0.17 + 0.02 * Math.sin(k * 3.1 + t);
        const r1 = Math.abs(Math.sin(k * 12.9898 + t * 78.233 + x) * 43758.5453) % 1, r2 = Math.abs(Math.sin(k * 4.1 + t * 9.7 + z) * 9631.7) % 1;
        if (r1 < 0.07) continue;
        const h = 0.42 + 0.22 * r2, k0 = 0.8 + 0.22 * r1 - 0.07 * (tiers - 1 - t);
        for (const s of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.06 + 0.025 * r2, 0.1 + 0.03 * r1, h, 5, 1, true); g.scale(1, 1, 0.6); g.rotateZ((r1 - 0.5) * 0.22);
          g.rotateX(-s * 0.2); g.translate(lx, y - h / 2 + 0.03, s * 0.07);
          one.push(paint(g, r2 < 0.2 ? 0x8a7a5c : s > 0 ? 0xa89878 : 0x9c8c6e, k0));
        }
      }
    }
    const g = mergeGeometries(one); for (const q of one) q.dispose();
    M.compose(V.set(x, W.heightAt(x, z) - 0.05, z), Q.setFromEuler(E.set(0, rot, 0)), O); g.applyMatrix4(M); parts.push(g);
  }
  const geo = mergeGeometries(parts); for (const q of parts) q.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'hasaField'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  rt.scene.add(mesh);
}

// 穂の出た稲田と畦・茅葺きの農家・敵の後ろの大軍（10/30 mini「稲田と茅葺きの農家が無い・敵の後ろに続く大軍が無い」）。
// 25秒の所（道の z 100〜110）から八方のどこを向いても、稲田か農家か大軍のどれかが入るように配る。当たりは付けない（兵の歩く道を変えない）。
// 田の区画は地面の畦の筋と同じ 24×20m。道の区画（x 0〜24）と葦原・稲架・家の所は空ける。
// 11/3 p100_inou：稲生「原」の戦。両軍の列が組み合う所の家は兵が通り抜け、カメラの前で画面の半分をふさいだ。出だしの裏と土手の向こうの家だけ残す
const FARMS = [[40, 140, 0.15], [-4, 142, -0.05], [38, -48, 1.62], [-13, -74, -0.12], [37, -98, 0.1]];
const nearFarm = (x, z, m) => FARMS.some(([fx, fz]) => Math.abs(x - fx) < 4 + m && Math.abs(z - fz) < 3.5 + m) || HASA.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 5.5);
function farmHouses(rt) {
  for (const [x, z, r] of FARMS) rt.scene.add(hut(rt.world, x, z, 7.5, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false, thatchTies: true }));
}
function paddyRice(rt) {
  const W = rt.world, step = MEM_TIGHT ? 1.55 : 1.0;
  // 11/2 c_tree_1102c：幅広の葉二枚と穂一つの株は、白い先の棘の板が田に立つ切り絵に見えた。共通の稲の株
  //   （細い葉が弓なりに開き、黄金の穂が頭を垂れる。風でそよぐ）に替える。携帯は葉と穂を減らし、株の間を広げる。
  const geo = plumeTuftGeo('paddy', MEM_TIGHT), mat = plumeTuftMat();
  const hash = (i, j) => { const f = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return f - Math.floor(f); };
  const chunks = new Map(), ridges = [];
  for (const cx of [-12, 36]) for (let cz = 130; cz > -120; cz -= 20) {
    if (hash(cx, cz) < 0.32 && !(cz > 60)) continue;   // 刈った田も混ぜる（25秒の所の近くは全部実った田）
    const key = Math.floor((cz + 130) / 60), arr = chunks.get(key) || chunks.set(key, []).get(key);
    for (let x = cx - 11.2; x < cx + 11.2; x += step) for (let z = cz - 9.2; z < cz + 9.2; z += step) {
      const r1 = hash(x * 3.1, z * 1.7), r2 = hash(z * 2.3, x * 4.9), jx = x + (r1 - 0.5) * step * 0.6, jz = z + (r2 - 0.5) * step * 0.6;
      if (Math.abs(jx - sideX(jz)) < 13.5 || nearFarm(jx, jz, 1.5)) continue;
      arr.push([jx, jz, r1, r2]);
    }
    ridges.push([cx, cz]);
  }
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (const pts of chunks.values()) {
    if (!pts.length) continue;
    const m = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach(([x, z, r1, r2], i) => {
      o.position.set(x, W.heightAt(x, z) - 0.04, z); o.rotation.set((r2 - 0.5) * 0.12, r1 * Math.PI * 2, (r1 - 0.5) * 0.12);
      const s = 0.85 + 0.3 * r2; o.scale.set(s, s * (0.9 + 0.2 * r1), s); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      c.setRGB(0.88 + 0.2 * r1, 0.88 + 0.16 * r2, 0.85 + 0.15 * r1); m.setColorAt(i, c);
    });
    m.receiveShadow = true; m.computeBoundingSphere(); m.matrixAutoUpdate = false; m.name = 'paddyRice';
    rt.scene.add(m);
  }
  // 畦：実った田の四辺に低い土の盛り（半ば埋めた六角の筒を地面に沿って四m ごとに）。一つの形・一つの描く数
  const seen = new Set(), parts = [], up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
  const seg = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 4));
    for (let i = 0; i < n; i++) {
      const x0 = ax + (bx - ax) * i / n, z0 = az + (bz - az) * i / n, x1 = ax + (bx - ax) * (i + 1) / n, z1 = az + (bz - az) * (i + 1) / n;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.abs(mx - sideX(mz)) < 12 || Math.abs(mx - FRONT_X) < 4 || nearFarm(mx, mz, 0)) continue;
      const y0 = W.heightAt(x0, z0), y1 = W.heightAt(x1, z1), L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      // 11/6 fixc1455（1600×900 で遊んだ写真）：前は筒を向きに回してから平たくしていたので、東西の畦だけ背が高く細い淡い緑の管に見えた。
      //   筒を横に寝かせて上下だけ潰し（幅七十cm・高さ二十cm ほど）、どの向きでも低い土の盛りに。色は頂点の色（線形）なので、写真の濡れた土と枯れ草の暗さに
      const g = new THREE.CylinderGeometry(0.36, 0.36, L + 0.3, 6, 1, true);
      g.rotateZ(Math.PI / 2); g.scale(1, 0.5, 1); g.rotateZ(Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0))); g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      g.translate(mx, (y0 + y1) / 2 - 0.02, mz);
      const k = 0.85 + 0.15 * hash(mx, mz), n2 = g.attributes.position.count, a = new Float32Array(n2 * 3), p = g.attributes.position;
      for (let j = 0; j < n2; j++) { const top = p.getY(j) > (y0 + y1) / 2 + 0.08; a.set(top ? [0.11 * k, 0.1 * k, 0.045 * k] : [0.12 * k, 0.08 * k, 0.045 * k], j * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    }
  };
  for (const [cx, cz] of ridges) for (const [ax, az, bx, bz] of [[cx - 12, cz - 10, cx + 12, cz - 10], [cx - 12, cz + 10, cx + 12, cz + 10], [cx - 12, cz - 10, cx - 12, cz + 10], [cx + 12, cz - 10, cx + 12, cz + 10]]) {
    const key = [ax, az, bx, bz].join(); if (seen.has(key)) continue; seen.add(key); seg(ax, az, bx, bz);
  }
  if (parts.length) {
    const g = mergeGeometries(parts); for (const q of parts) q.dispose();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.name = 'aze'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; rt.scene.add(mesh);
  }
}
// 11/3 p100_inou（kaito AF・AP9・AQ6「見せかけの軍勢・近づくと消える軍勢・棒人間は嫌」）：前は敵の後ろに軽い大軍（addDistantArmy）を置き、
//   本人の 85m 先を保って退かせていた。列の後ろの軽い兵（addBacking）・両翼の軽い合戦（clash）・共通の陣立て（army_jindate）・奥の乱戦の補い（front_fill）もやめ、
//   見える兵は全部本物の兵（斬り合う・倒れる・動く）にした。林勢は北の霞の向こうから本物の兵のまま駆けつける（startLines）。

// 葦原：脇道の両側に背の高い葦（一つの InstancedMesh）
function reeds(rt) {
  // 11/2 c_tree_1102c：幅広の三角を四枚の株は、道の脇に立つ棘の切り絵に見えた。共通の葦の株（茎の途中から細い葉が垂れ、
  //   紫がかった焦げ茶の穂。風でそよぐ）を背丈二m余りに伸ばして使う。携帯は葉と穂を減らした形・株を半分に。
  const W = rt.world, blade = plumeTuftGeo('ashi', MEM_TIGHT), mat = plumeTuftMat();
  const pts = [];
  let s = 1556;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let z = 128; z > -116; z -= 0.8) {
    const cx = sideX(z);
    for (let k = 0; k < 6; k++) {
      if (MEM_TIGHT && k % 2) { rnd(); rnd(); rnd(); continue; }
      const off = (2.2 + rnd() * 10) * (rnd() < 0.5 ? -1 : 1);
      pts.push([cx + off, z + (rnd() - 0.5) * 0.5, rnd()]);
    }
  }
  const m = new THREE.InstancedMesh(blade, mat, pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z, r], i) => {
    o.position.set(x, W.heightAt(x, z) - 0.05, z);
    o.rotation.set((r - 0.5) * 0.25, r * Math.PI * 2, (rnd() - 0.5) * 0.25);
    const sc = 0.75 + r * 0.55; o.scale.set(1.5, sc * 2.3, 1.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    c.setRGB(0.85 + r * 0.3, 0.85 + r * 0.25, 0.8 + r * 0.2); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.receiveShadow = true;
  rt.scene.add(m);
}


const aliveFoes = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === 1 && !u.civ ? 1 : 0), 0);
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveIn = (list) => (list || []).reduce((n, g) => n + g.units.reduce((m, u) => m + (u.alive && !u.gone ? 1 : 0), 0), 0);
// 横の列の真ん中（生きた組の中心の平均）。後ろの軽い大軍が付いて歩く
const lineFront = (list, facing) => {
  let x = 0, z = 0, n = 0;
  for (const g of list || []) if (!g.routing && live(g)) { const c = g.center(); x += c.x; z += c.z; n++; }
  return n ? { x: x / n, z: z / n, facing } : null;
};
// 兵の割合（kaito 10/28）：槍が主・侍一人・弓一人。背の指物は多めに立てて林立させる
// 11/5 時代考証：『信長公記』の稲生に鉄砲の記述は無く、信勝方が鉄砲を持った記録も見つからない。組の飛び道具は弓だけ（前は三組に一人の鉄砲）
const foeKnot = (i, n = 8) => dress([{ type: 'ashigaru', n: Math.ceil((n - 2) * 0.6), o: { flagScale: 1 } }, { type: 'ashigaru', n: (n - 2) - Math.ceil((n - 2) * 0.6) },
  { type: 'samurai', n: 1 }, { type: 'bow', n: 1 }]);
const allyKnot = (n = 6) => [{ type: 'ashigaru', n: n - 2, o: { flagScale: 1 } }, { type: 'ashigaru', n: 1 }, { type: 'samurai', n: 1 }];

// 流れ矢（kaito 11/1 B 節）：列がぶつかってからは、25〜75m 先の林勢の方から矢が数本ずつ自分のまわりへ降る。
// 本人の近く（二〜九歩）を狙い、たまに当たる。射手は遠い林勢の一人（弓の者を先に）。矢と音は共通の弓矢の仕組み。
function strayArrows(rt, dt) {
  const F = rt.flags, P = rt.player.u;
  if (!F.stage || F.ending || F.holdPlayer || !P.alive || F.bossOn) return;
  if ((F.arrowT = (F.arrowT ?? 3) - dt) > 0) return;
  F.arrowT = 2.4 + Math.random() * 3.6;
  let src = null, best = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team !== 1 || u.civ || u.isStruct || u.fleeing || u.group?.routing) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d < 25 || d > 75) continue;
    const s = Math.random() * (u.type === 'bow' ? 3 : 1);
    if (s > best) { best = s; src = u; }
  }
  if (!src) return;
  const n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0), ammo = src.arrowAmmo;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
    src.arrowAmmo = 99;
    try { rt.army.shoot(src, P, null, { x: P.pos.x + Math.cos(a) * r, y: P.pos.y, z: P.pos.z + Math.sin(a) * r }); } catch (e) { F.arrowT = 1e9; }
  }
  src.arrowAmmo = ammo;
}

const guideEnemyAlive = (u) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing && !u.invuln && !u.noTarget;

const inou_spec = {
  missionStyle: 'lesson',
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,   // 共通の物見の足軽は足さない（乱戦の塊はこの定義が置く）
  noFrontFill: true,         // 奥の軽い乱戦（front_fill.js）は置かない。見える兵は全部本物（11/3 p100_inou）
  kumiLead: false,           // 行き先の印は一つだけ（kaito AL・AN）：組頭の青い印は出さず、今の目標の金の▼だけ。組頭と組はこの定義が目標へ動かす
  allyReports: false,        // 使番の「組頭殿の隊は北で移動中」は出さない（組頭は自分を率いる人。字を足さない）
  pinOnlyDestination: true,  // 地面・足元の行き先の矢印は出さない（kaito AP12・BH6）。行き先は真上の金の▼だけ
  noGoalCount: true,         // 美作守が画面の外の時の赤い端の矢印（goal_count.js）も出さない。金の▼の端の印と二つになった
  hideNameTag: (u) => u.name === '組頭',   // 名札は名のある将だけ。組頭の「味方 かしら」は出さない（字を足さない）
  // 11/6 fixc1455：前は goalSignBare で▼の距離まで消していた。九1「距離は m」に従い外す（案内の字は共通で全戦から外れた）
  goalSignOff: () => true,   // 敵本人は赤い▼だけ。黄色い▼と隊の呼び名を重ねない。
  noLeaderFollow: true,      // 同じく、ついていく相手の頭上の青い印・画面の端の青い矢印も出さない（金の▼と二つになった。11/3 p100_inou）
  playerAtkMax: 4,           // 四方から同時に打つのは四人まで（五人目からは後ろで待つ）
  enemyTactics: false,       // 敵の動きはこの定義が決める（退く槍・立つ弓）
  noFieldMap: true,
  fieldMapRight: true,       // 小さな地図は右上の目標の札の下（kaito 11/1 B 節）。美作守の居場所を赤いひし形で
  mapMarks: (rt) => rt.flags.ending ? null : [rt.flags.bossU?.alive ? rt.flags.bossU.pos : BOSS],
  mapNorth: Math.PI * 1.25,   // 11/5 野の奥は南東（信長は於多井川を渡って東南へ）。小地図の「北」は左下に（柴田の東は左前・林の南は右前）
  hideArmyPeek: true,
  forceBar: true,
  sides: { a: { name: '信長方', mon: 'oda' }, b: { name: '信勝方', mon: 'nobukatsu' } },
  introSides: { a: '信長方 約七百', b: '信勝方 約千七百' },
  // 柴田勢との乱戦で信長方は四百ほどに減る。柴田勢が崩れた後は林勢 七百が相手（減り方は本物の兵の減った割合）
  force(rt) {
    const F = rt?.flags;
    if (!F || !F.l1N) return FORCE;
    if ((F.stage || 0) < 2) {
      const r1 = Math.max(0, Math.min(1, aliveIn(F.l1) / F.l1N));
      FORCE.a = round10(700 - 560 * (1 - r1)); FORCE.b = round10(700 + 1000 * r1); F.aLeft = FORCE.a;
    } else {
      const all = [...(F.l2 || []), ...(F.bows || []), ...(F.bankG || []), ...(F.guardG ? [F.guardG] : [])];
      FORCE.a = F.aLeft || 400; FORCE.b = F.ending ? 0 : round10(700 * (0.2 + 0.8 * Math.min(1, aliveIn(all) / Math.max(1, F.l2All || 1))));
    }
    return FORCE;
  },
  // 11/5 時代考証の見直し：見出しの札は討ち取りと終わりだけ（「敵の隊が崩れた」「一騎打ち 相手の隙を突け」は案内の字。kaito 五-1）。崩れは台詞と動きで分かる
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  // 信長の決まり台詞のうち「忘れぬ。今は生き残れ。」は当時の主君の言い回しに合わない（足軽の死に主が誓う形）。稲生では出さない
  speechAllowed: (rt, who, text) => !(/信長$/.test(who) && text.includes('忘れぬ。今は生き残れ')),
  hideGuideSteps: true,
  missionSingleLine: true,
  missionAlways: true,       // 行き先を示す間も、右上の任務一行を隠さない。
  noPlayerFoot: true,
  hidePlayerSign: true,      // 11/6（標準 五-2・八）：足もとの白い輪は写真に無い作り物の印。肩越しで本人は見えるので出さない
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionHeading(rt) {
    const F = rt.flags;
    if (F.stage === 0) return '前の柴田の物見を倒せ';   // 11/6 fix4：組頭の「前の物見を討て」と同じ呼び名に
    if (F.stage === 1 || F.stage === 2 && !F.regrouped) return '列に並んで耐えろ';
    if (F.stage === 2) return '田の道の前の林の兵を倒せ';
    if (F.stage === 3) return '田の道の林の旗本を倒せ';
    return '田の道の林美作守を倒せ';
  },
  missionSignTarget(rt) {
    const F = rt.flags, P = rt.player.u.pos;
    if (F.guideStage === F.stage && F.guideAt > rt.t && guideEnemyAlive(F.guideEnemy)) return F.guideEnemy;
    F.guideStage = F.stage; F.guideAt = rt.t + .25; F.guideEnemy = null;
    let best = Infinity;
    for (const u of rt.army.units) {
      if (!guideEnemyAlive(u) || u.team === rt.player.u.team) continue;
      const g = u.group;
      const eligible = F.stage === 0 ? g === F.practice : F.stage === 1 ? F.l1?.includes(g) :
        F.stage === 2 ? F.l2?.includes(g) || F.bows?.includes(g) :
        F.stage === 3 ? F.bankG?.includes(g) || g === F.guardG : u === F.bossU;
      if (!eligible) continue;
      const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
      if (d < best) { best = d; F.guideEnemy = u; }
    }
    return F.guideEnemy;
  },
  // 人物の金の▼は使わず、遠い行き先のピンから敵本人の赤い▼へ渡す。
  missionPin(rt) {
    const F = rt.flags;
    if (F.holdPlayer || F.ending) return null;
    const holding = F.stage === 1 || F.stage === 2 && !F.regrouped;
    const u = holding ? F.kumiU : this.missionSignTarget(rt);
    if (!u?.alive) return null;
    const r = holding ? 10 : 18, P = rt.player.u.pos;
    if ((u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2 <= r * r) return null;
    const pin = F.beginnerPin || (F.beginnerPin = { x: 0, z: 0, r: 0 });
    pin.x = u.pos.x; pin.z = u.pos.z; pin.r = r;
    return pin;
  },
  missionPinCaption: '',
  nearAllyWholeOcclusion: true,
  nearAllySolidBody: true,
  nearAllySightWidth: 1.1,
  nearAllyHorseFade: true,
  nearLongWeaponRadius: 10,
  nearSpearBatchRadius: 10,
  nearGroundSpearRadius: 10,
  learningFight: true,
  playerTaken: 0.42,         // 四人まで同時に打たれる乱戦なので、一太刀は前より軽く（前は二人で 0.6）
  openingSafe: 10,   // 11/1：持ち場で乱戦に呑まれる最初の十秒（初陣の構えを覚える間）は手傷を負わない
  cutFloor: 0.35,   // 11/1：構えずに受けた一太刀は命の一割八分（侍は二割）
  meleeGrace: { rate: 1, burst: 1, interval: 4 },   // 11/1：刃を受けた後の4秒は次の刃が通らない（一太刀五割のまま、同じ一瞬に二太刀・三太刀を浴びて倒れない）
  playerRegen: 0.05,   // 11/1：斬り合いの合間（四秒当たらない間）は一秒に命の五分戻る（四人が寄る乱戦の中で、討ち取りの間に削られ切らない）
  pacingWait: () => true,
  botDefendsFort: true,      // bot：矢を避けて物陰へ下がらず、前へ進む
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  closeCombatAssist: true,
  noWinCrane: true,
  compactIntro: true,
  // 11/5 始まりの札は二三行（kaito 五-4）：操作の案内と「助ける相手ではない」の断りを外し、筋だけに
  introText: () => '柴田勝家と林美作守（はやしみまさかのかみ）が、信長の弟・信勝を立てて背いた。柴田勢千が東から先に押し寄せ、林勢七百は南の田から来る。あなたは七百に足らない信長方の足軽。',
  // 11/5 時代考証：共通の人物札「尾張から勢力を広げた、織田家の大将」は 1556 の信長に早い（まだ尾張の内も一つでない）。
  //   この戦の人物は始まりの札の「人物と戦場の説明」に置き、戦の途中に同じ人の札を重ねない（id は battle_welcome.js と同じ）
  introPeople: [
    { id: '信長', name: '織田信長', note: '信勝の兄。父 信秀の跡を継いだ清洲城の主。家中の多くが弟の信勝に付いた。' },
    { id: '信勝', name: '織田信勝と柴田勝家', note: '信勝は信長の弟で末森城の主。この日は城にいる。勝家は信勝の家老で、柴田勢を率いる。' },
    { id: '林', name: '林美作守', note: '信長の家老 林秀貞の弟。林勢を率いて名塚の砦へ寄せる。' },
  ],
  minutes: 8,
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    ...OLD.world,
    height,
    paths: [{ pts: [[FRONT_X, 160], [FRONT_X, -118], [BOSS.x, -134]], w: 4 }, { pts: SIDE, w: 2 }],
    // 屋敷林の帯（10/30）：前の稲生の林は |x|≤56 で外れ、25秒の所（道の z 108 あたり）から八方のどこを向いても林が写らなかった。
    // 道（x 12）を挟んで東西に杉の帯（東 48m・西 76m）、出だしの裏（南）と土手の奥（北）にも帯を回し、田の四方を黒い緑で塞ぐ。
    // 東の小川（x 72）・葦原（x −58 まで）・道は空ける。帯の中心は戦う所から遠く、林の見通し減（groves の r）は道に掛からない。
    groves: [...(OLD.world.groves || []).filter((g) => Math.abs(g.x) > 56 && Math.abs(g.z) < 140),
      { x: 60, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' }, { x: -64, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' },
      { x: -34, z: 154, line: [80, 0], r: 3, n: 31, kind: 'sugi' }, { x: 46, z: 154, line: [56, 0], r: 3, n: 22, kind: 'sugi' },
      { x: 0, z: -152, line: [148, 0], r: 3, n: 57, kind: 'sugi' },
      // 裏の二列目（外へ四・五m）：一列では幹の間に空が抜けた。少なめの株で前の列の隙間を塞ぐ。
      { x: 64.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' }, { x: -68.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' },
      { x: -34, z: 158.5, line: [80, 0], r: 3, n: 19, kind: 'sugi' }, { x: 46, z: 158.5, line: [56, 0], r: 3, n: 14, kind: 'sugi' },
      { x: 0, z: -156.5, line: [148, 0], r: 3, n: 35, kind: 'sugi' }],
    // 田と畦の色（10/30）：前の稲生の田は |z|≤120 までで、出だしの南（z 120〜146）と土手の手前が砂色の野のままだった。
    // 南北の端も同じ 24×20m の区画の色（畦の土色の筋と稲の縞）で塗る。区画の並びは 20m ごとなので、z をずらして前の式を借りる。
    tint(x, z, h, c) { OLD.world.tint(x, z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z, h, c); },
    // 稲の縞（10/30 採点「稲の縞が無く地が土の一色」）：田の色は藁色なので、色から読む草の割合が 0 になり、田の全部が土の絵だった。
    // 田の中は草の絵（藁色に染まって稲の株に見える）を区画ごとに多め・少なめにし、刈った区画は株の列と土の列を交互に（東西の縞）。
    // 頂点の割合だけを変える（形・絵・描く数は増えない）。道と畦の肩は土のまま。
    grassMix(x, z, pd) {
      if (pd < 1.3 || Math.abs(x) > 112) return 0;
      const zz = z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z;
      if (Math.abs(zz) > 120) return 0;
      const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(zz - Math.round(zz / 20) * 20);
      if (Math.min(ex, ez) < 1.3) return 0.15;
      const f = Math.sin(Math.round(x / 24) * 12.9898 + Math.round(zz / 20) * 78.233) * 43758.5453, r = f - Math.floor(f);
      const row = Math.round((z + 320) / (640 / 144)) % 2;
      return r > 0.6 ? 0.7 + 0.2 * r : row ? 0.85 : 0.08;
    },
    // 10/30 採点「地が土の一色」：上の tint は地面の色にならない（tint の色は草の割合を読むためだけで、草の割合は grassMix が上書きする）。
    // 地の色は藁色の草の絵と土の絵の二つだけで、土は明るい砂色寄り・藁と同じ色相だったので一色に見えた。
    // 数で見ると、25秒の画面の地面の画素のうち緑が勝つのは3%だけで、共通の重ね塗り（landOverlay）の草の斑・株のむらは掛からず、土の明暗だけが効いていた。
    // 刈った区画と踏まれた所の土を湿った黒褐へ沈めて藁の株と分け、株の抜けた裸地の斑（patchyGround）を足す（絵・形・描く数・足場は同じ）。
    dirtTint: [0.5, 0.45, 0.38],
    patchyGround: true,
    autumn: true,   // 八月二十四日（今の九月末）の刈り入れ時：田の草の絵を枯れた藁色に（地面の描き方の枝を替えるだけ。絵は増えない）
    // 西の於多井川（x −145）は見えない壁（±74）と杉の二重の帯と霞の向こうで見えないのに、水面と岸を描いていた（10/30）。
    // 外して、稲架の描く一つと三角の分を相殺する。東の小川（x 72）は残す。
    streams: OLD.world.streams.slice(1),
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 150,
    fleeOut: (x, z, team) => team === 1 && z < -150,
    armyFlagKinds: undefined,
  },

  setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const F = rt.flags;
    // 11/5 美作守の止めは信長（『信長公記』）：本人が信長でない時、美作守は命の三割より下へ減らず、討たれない（信長の一突きだけが通る）
    if (!rt.G.lord) {
      const A = rt.army, dmg = A.damage, kill = A.kill, held = (t) => t && t === F.bossU && !F.nobuKill && F.nobuU?.alive;
      A.damage = function (t, a, ...r) { if (held(t)) a = Math.min(a, Math.max(0, t.hp - t.maxHp * 0.3)); return dmg.call(this, t, a, ...r); };
      A.kill = function (t, ...r) { if (held(t)) { t.hp = Math.max(t.hp, t.maxHp * 0.3); return; } return kill.call(this, t, ...r); };
    }
    // 11/1 共通の既定（四人が同時に打つ・一太刀で命の五割）では bot が開戦二十秒で倒れた。共通の読み先は world.def（player_pressure.js）なので、そこへ置く。
    rt.def.playerAtkMax = rt.world.def.playerAtkMax = 2;
    F.sec = {}; F.groups = []; F.holdPlayer = true; F.knots = []; F.allyGs = []; F.dinT = 2;
    reeds(rt);
    hasaField(rt);
    farmHouses(rt);
    paddyRice(rt);
    // 夏の終わりの薄雲と霞（前の稲生の setup と同じ。この戦の setup は前の物を呼ばないので、ここで掛ける）：
    // 霞を緑がかった灰に、日を弱めて影を柔らかく。昼の霞だけ百五十mで閉じ、五十〜八十m先の杉の帯を白く透かさない。
    // 兵を描く遠さと敵を見つける見通し（W.vis）は変えない。
    { const W = rt.world, lookOf = W.lookOf, upd = W.update;
      W.lookOf = function (key) { const L = lookOf.call(this, key); if (key === 'day') { L.fog.setHex(0x8c9a8e); L.sunI *= 0.78; L.hemiI *= 1.18; L.cover = Math.max(L.cover, 0.62); } return L; };
      if (W.timeKey === 'day') W.applyLook(W.lookOf('day'));
      W.update = function (...a) { const r = upd.apply(this, a), fog = this.scene.fog, f = Math.floor(fog.far);
        if (this.timeKey === 'day' && f >= 85 && f < 150) fog.far = 150 + (fog.far - f); return r; }; }
    // 組頭（倒されない）と味方の足軽四人
    F.kumi = allyGroup(rt, { name: '組頭', anchor: { x: START.x + 2, z: START.z }, facing: Math.PI, aggro: 6, speed: 4.2, order: 'hold', noFrontline: true },
      [{ type: 'samurai', n: 1, o: { name: '組頭', invuln: true } }]);
    F.kumiU = F.kumi.units[0];
    F.bossName = '組頭';   // 褒める声も「組頭」の名で（源八と組頭の二つの名で出さない。kaito AT3）
    F.kumiLeader = F.kumiU;   // 共通の「組頭に従う」（kumi_lead.js）の上役
    // 自分の組：組頭と足軽八人。味方の横一列の真ん中（道の上）に立つ
    // 11/2 Q「兵がまばら（稲生が特に）。もっと密集させる」：組を十二〜十三人・横七人に厚くし、組どうしの隙間を詰めて一つの横陣に見せる
    F.allies = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x: FRONT_X, z: ALLY_Z0 }, facing: Math.PI, width: 7, aggro: 0, speed: 2.6, noAI: true, noRout: true,
      order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(ALLY_N));
    // 味方の横の列（左右に三組ずつ）と、柴田勢の横の列（七組）。始めから向かい合って立つ。人数は柴田 千 対 七百 の比（1.4 倍）
    F.line = [F.allies, ...SLOTS.map((x, i) => {
      const g = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x, z: ALLY_Z0 - (i % 2) * 2 }, facing: Math.PI, width: 7, aggro: 0, speed: 2.6, noAI: true, noRout: true,
        order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(ALLY_N - (i % 3 ? 1 : 0)));
      g.slotX = x; return g;
    })];
    F.allies.slotX = FRONT_X;
    F.l1 = L1_X.map((x, i) => this.foeLine(rt, x + L1_DX, L1_Z0 - 6, i, L1_N, '柴田勢', x));
    F.l1N = F.l1.reduce((n, g) => n + g.units.length, 0);
    // 紙（battle_events_1101）：柴田勝家は敵将として必ず出る。馬上で先手の後ろに立ち、先手が崩れると北へ退く（討てない）
    F.shibaG = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勝家', anchor: { x: FRONT_X + 4, z: L1_Z0 - 12 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 3, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 100, dmgMult: 0.3, fixed: true },
    dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, keep: true, horse: true } }, { type: 'samurai', n: 6 }]));
    F.groups.push(F.shibaG);
    // 味方の大将：信長（馬上）と、名塚の砦を守った佐久間大学（盛重）。列の後ろに付いて北へ（信長で遊ぶ時は本人が信長）
    // 大将は一人で動かない（kaito 11/2 O）：足軽でなく旗本の侍の一団ごと動く
    // 『信長公記』：柴田が寄せた時、信長の御前に残ったのは織田勝左衛門・織田造酒丞・森三左衛門（可成）と御鑓持の中間衆四十ばかり。名のある三人と侍の一団
    F.nobuG = allyGroup(rt, { name: '信長の旗本', fullStrength: true, anchor: { x: FRONT_X + 10, z: ALLY_Z0 + 8 }, facing: Math.PI, width: 5, aggro: 0, speed: 3, noAI: true, noRout: true, order: 'hold' },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, keep: true, horse: true, flag: 'oda' } }]),
        // 11/6 fix4：信長が「杉若、続け」と呼ぶ口中杉若と、柴田に踏みとどまった織田造酒丞にも名を（呼ばれる者が場にいない・名のある将に名が無いのは時代考証で ✕）。勝左衛門は侍の一団の中
        { type: 'samurai', n: 1, o: { name: '森可成', invuln: true, keep: true } }, { type: 'samurai', n: 1, o: { name: '織田造酒丞', invuln: true, keep: true } },
        { type: 'samurai', n: 1, o: { name: '口中杉若', invuln: true, keep: true } }, { type: 'samurai', n: 10, o: { invuln: true } }]);
    // 11/5：永楽銭の旗は稲生（1556）の頃の確かな記録が無いので、信長の旗は織田木瓜
    F.nobuU = F.nobuG.units.find((u) => u.name === '織田信長') || null;
    // 『信長公記』：林美作守とは黒田半平が先に長く斬り合い、左手を斬り落とされた。半平は信長の旗本の脇に付いて歩き、美作守に寄ると斬りかかる
    F.kuroG = allyGroup(rt, { name: '黒田半平', fullStrength: true, anchor: { x: FRONT_X + 4, z: ALLY_Z0 + 10 }, facing: Math.PI, width: 1, aggro: 0, speed: 3, noAI: true, noRout: true, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '黒田半平', invuln: true, keep: true } }]);
    F.stage = 0; F.pk = 0; F.kills = 0;
    rt.obj('main', '田の道の林美作守を討つ', 'main');
    // 組頭の三つの台詞（字幕）。終わるまで動けない。その後に短い練習
    const L = [['川を渡ったぞ。昨日の雨で川は増え、田はぬかるむ。東の街道から柴田勢が千、こちらは七百に足らぬ。', 0.6], ['林美作守も敵じゃ。七百を率いて南の田から名塚の砦へ寄せておる。来る前に柴田を受け止めるのじゃ。', 3.6], ['柴田の物見が寄って来たぞ。前の物見を討て！', 7.2]];
    for (const [s, t] of L) rt.after(t, () => rt.say('組頭', s, 2.8));
    rt.after(9.6, () => { F.holdPlayer = false; this.spawnPractice(rt); });
  },

  // 林勢の一組（横の列の一つ）。南（味方）を向いて立つ
  foeLine(rt, x, z, i, n, name, lineX = x, haya = false) {
    const F = rt.flags, knot = foeKnot(i, n);
    const g = enemyGroup(rt, { faction: 'nobukatsu', name, anchor: { x, z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 6,
      noRout: true, noAI: true, formation: 'line', morale: 85, dmgMult: 0.42, order: 'hold', aggro: 0, speed: 1.8 }, haya ? knot.map((s) => ({ ...s, o: { ...s.o, ...HAYA } })) : knot);
    g.secKind = 'line'; g.lineX = lineX; F.groups.push(g);
    return g;
  },

  // 練習：組頭の前に林の遅れ兵が三人。弱く、一人ずつ寄ってくる
  spawnPractice(rt) {
    const F = rt.flags, P = rt.player.u;
    F.practice = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の物見', anchor: { x: P.pos.x + 1, z: P.pos.z - 12 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 3,
      noRout: true, noAI: true, order: 'attack', aggro: 12, seekRange: 22, focus: P, dmgMult: 0.2, morale: 60, speed: 1.6 }, dress([{ type: 'ashigaru', n: 3 }]));
    for (const u of F.practice.units) { u.hp = u.maxHp = Math.max(24, P.dmg * 2); u.cdBase *= 1.8; }
    F.groups.push(F.practice);
    F.practiceT = rt.t;
  },

  // 段一：両軍の列が鬨を上げてぶつかる
  startLines(rt) {
    const F = rt.flags;
    if (F.stage >= 1) return;
    F.stage = 1; F.stageT = rt.t;
    rt.say('組頭', '列に戻れ！　味方と並んで、柴田勢を受け止めよ！', 3.5);
    rt.after(3.6, () => rt.say('組頭', 'かかれぇっ！', 2));   // 11/6 時代考証：号令は足軽でなく組頭が掛ける
    sfx('taiko', 1); rt.after(0.45, () => sfx('taiko', 0.9));
    rt.army.play('toki', { x: FRONT_X, z: ALLY_Z0 - 4 }, 1.5);
    rt.after(1.2, () => rt.army.play('toki', { x: FRONT_X, z: L1_Z0 }, 1.3));
    for (const g of F.line) {
      g.order = 'move'; g.speed = 2.6; g.dest = { x: g.slotX, z: L1_MEET + 3 };
      // 11/6 fixc1429：段一でも着いた後ろの列の侍が、六m先の柴田勢を前に二十秒立ち尽くした（botrun）。林勢と同じく十六m に
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 28; };
    }
    for (const g of F.l1) {
      g.order = 'move'; g.speed = 1.8; g.dest = { x: g.lineX, z: L1_MEET - 3 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 28; };
    }
    // 練習の残りも列の戦いに加わる
    if (live(F.practice)) { F.practice.focus = null; F.practice.seekRange = 30; }
    this.spawnHayashi(rt);
  },

  // 林勢 七百（先手六組・弓二組・土手の二組・美作守と旗本）：本人から百八十m余り北の霞の向こうに出て、名塚の方から駆けつけ、土手の前で構える。
  //   柴田勢との乱戦の間に、遠くの霞の中から旗の列が近づいて来るのが見える（突然湧かない・見せかけでない）
  spawnHayashi(rt) {
    const F = rt.flags;
    if (F.l2) return;
    const go = (g, x, z, sp) => { g.order = 'move'; g.speed = sp; g.dest = { x, z }; g.onArrive = (q) => { q.order = 'hold'; }; };
    F.l2 = L2_X.map((x, i) => { const g = this.foeLine(rt, Math.min(XW - 4, x + L2_DX), L2_Z0 - (i % 2) * 3, i + 2, L2_N, '林勢の先手', x, true); g.dmgMult = 0.36; go(g, x, L2_HOLD, 1.5); return g; });
    F.bows = [-1, 1].map((sd) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の弓', anchor: { x: FRONT_X + sd * 16, z: L2_Z0 - 12 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 4,
        noRout: true, noAI: true, formation: 'line', morale: 70, dmgMult: 0.45, order: 'hold', aggro: 0, fire: false }, dressH([{ type: 'bow', n: Math.round(5 * NK) }]));
      g.secKind = 'bow'; F.groups.push(g); go(g, FRONT_X + sd * 16, BOW_Z, 1.5);
      return g;
    });
    F.l2N = F.l2.reduce((n, g) => n + g.units.length, 0);
    F.bowN = F.bows.reduce((n, g) => n + g.units.length, 0);
    this.spawnBoss(rt); this.spawnBank(rt);
    F.groups.push(F.guardG); F.guardG.secKind = 'guard';
    F.l2All = F.l2N + F.bowN + aliveIn([...F.bankG, F.guardG]);   // 林勢の七百の減り方の割合に使う
  },

  // 列が崩れて退く（本人から遠い者は去る）
  routLine(rt, list) {
    for (const g of list) {
      if (!live(g)) continue;
      g.routing = true; g.noRout = false; g.order = 'retreat'; g.focus = null; g.aggro = 0; g.fire = false; g.speed = 3.2;
      g.dest = { x: g.anchor.x, z: -150 }; g.morale = Math.min(g.morale, 20);
    }
  },

  // 信長の大音声（11/3 kaito の流れ）：乱戦の最中、信長が旗本ごと列のすぐ後ろへ馬を進め「主に刃を向けるのか」と一喝する。
  // 字の札は出さず、馬の一団が前へ出る動き・大音声・台詞で分からせる。三秒ののちに柴田勢が崩れる
  shout(rt) {
    const F = rt.flags;
    if (F.shoutT != null || F.stage !== 1) return;
    F.shoutT = rt.t;
    const P = rt.player.u, f = lineFront(F.line, Math.PI);
    F.nobuGo = { x: Math.max(-40, Math.min(56, P.pos.x + 7)), z: Math.min(ZS - 4, (f ? f.z : P.pos.z) + 6) };
    if (live(F.nobuG)) { F.nobuG.speed = 5; }
    sfx('taiko', 1); rt.after(0.35, () => sfx('taiko', 1));
    rt.say('組頭', '殿じゃ！　殿が前へ出られたぞ！', 2.6);
    rt.after(2.8, () => {
      if (F.ending) return;
      const at = F.nobuG?.center?.() || P.pos;
      rt.army.play('eshout', { x: at.x, z: at.z }, 1.6);
      rt.say(rt.G.lord ? '自分' : '織田信長', '主に刃を向けるのか！', 3);
    });
    rt.after(5.9, () => this.breakLine1(rt));
  },

  // 段二：柴田勢が崩れて敗走する。信長は「隊列を整えよ」と列を止め、間を置かず北から寄せる林勢（先手五組と弓組）へ向かう。両翼でも軽い大軍が組み合う
  breakLine1(rt) {
    const F = rt.flags;
    if (F.stage !== 1) return;
    F.stage = 2; F.stageT = rt.t; F.line1Broken = true; F.forceShowUntil = rt.t + 6;
    this.routLine(rt, F.l1);
    // 『信長公記』：信長の大声に、柴田の兵は主の声を恐れて逃げた。勝家も北へ退く
    this.routLine(rt, [F.shibaG]);
    F.shibaRoutT = rt.t;
    rt.army.play('eshout', rt.player.u.pos, 1.4);
    rt.say('柴田勝家', '兵が上総介殿の御声に怯んだ……わしも手を負うた。退け、退けい！', 3.4);
    rt.after(3.6, () => rt.say('組頭', '柴田勢が崩れたぞ！　勝家も手負うて退く！', 2.6));
    rt.after(6.2, () => rt.say(rt.G.lord ? '自分' : '織田信長', '備えを立て直せ！　次は林美作を討つ！', 3.6));
    rt.after(10, () => { if (!F.ending) { F.forceShowUntil = rt.t + 6; rt.say('組頭', '林勢七百が来るぞ。こちらは四百ほどじゃ。踏みとどまれ！', 3.4); } });
    rt.after(14, () => rt.say('足軽', '矢が来るぞ、頭を下げい！', 3));
    this.spawnHayashi(rt);
    // 後詰の一組が南から駆け付け、減った味方の列を埋める（信長方は柴田との乱戦で四百ほどに減った。林勢 七百の六割に届かない数）
    const pz = Math.min(ZS - 6, rt.player.u.pos.z + 36);
    for (const x of [44]) {
      const g = allyGroup(rt, { name: '味方の後詰', fullStrength: true, anchor: { x, z: pz }, facing: Math.PI, width: 4, aggro: 0, speed: 3.4, noAI: true, noRout: true,
        order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(ALLY_N));
      g.slotX = x; F.line.push(g);
    }
    // 林勢が土手の前から南へ押し出す（走る。kaito AP13「戦では兵は歩かず走る」）
    for (const g of [...F.l2, ...F.bows]) if (live(g)) { g.order = 'move'; g.speed = g.secKind === 'bow' ? 2 : 3; g.dest = { x: g.dest?.x ?? g.anchor.x, z: g.secKind === 'bow' ? BOW_Z + 30 : L2_HOLD + 40 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 26; }; }
    for (const g of F.bows) g.onArrive = (q) => { q.order = 'hold'; };
    // 列を整える：味方の組は今いる所で足を止め、持ち場の横へ並び直す（REGROUP_T 秒の後に林勢へ進む。update）
    const fz = lineFront(F.line, Math.PI)?.z ?? rt.player.u.pos.z;
    for (const g of F.line) if (live(g)) {
      g.focus = null; g.order = 'move'; g.speed = 2.4; g.aggro = 6;
      g.dest = { x: g.slotX, z: Math.min(ZS - 6, fz + 2) };
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    rt.army.play('toki', { x: FRONT_X, z: L2_HOLD }, 1.4);
  },
  // 列が整った：信長の旗本を真ん中の後ろに置いて、味方の列が林勢へ進む
  advanceLine2(rt) {
    const F = rt.flags;
    if (F.regrouped) return;
    F.regrouped = true; F.nobuGo = null;
    if (live(F.nobuG)) F.nobuG.speed = 3;
    sfx('taiko', 1); rt.after(0.45, () => sfx('taiko', 0.9));
    rt.army.play('toki', { x: FRONT_X, z: rt.player.u.pos.z - 4 }, 1.4);
    rt.say('組頭', '列が整うた。林勢へかかれぇっ！', 3);
    for (const g of F.line) if (live(g)) {
      g.focus = null; g.order = 'move'; g.speed = 2.8; g.aggro = 0;
      g.dest = { x: g.slotX, z: L2_MEET + 3 };
      // 11/6 fix4：着いた後ろの列の侍が、十一m先の林勢を前に二十秒立ち尽くした（botrun）。かかる間合いを十六m に
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 28; };
    }
  },

  // 段三：二の備も崩れる。土手の林美作守と取り巻きが最後に踏ん張る
  breakLine2(rt) {
    const F = rt.flags;
    if (F.stage !== 2) return;
    F.stage = 3; F.stageT = rt.t; F.line2Broken = true;
    this.routLine(rt, [...F.l2, ...F.bows]);
    // 土手の二組は持ち場で構えたまま、寄って来た者と戦う（それまでは列の乱戦に吸われないよう noAI で土手に留める）
    for (const g of F.bankG || []) if (live(g)) { g.noAI = false; g.aggro = 14; if (g.order !== 'move') g.order = 'hold'; }
    sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 0.9));
    rt.say('組頭', '林の先手が崩れた！　美作守は田の道に踏みとどまって待ち構えておる。旗本を崩せ！', 4);
    for (const g of F.line) if (live(g)) {
      g.focus = null; g.order = 'move'; g.speed = 3; g.aggro = 0;
      g.dest = { x: Math.max(-30, Math.min(50, g.slotX)), z: BOSS.z + 24 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 12; q.seekRange = 30; };
    }
  },

  // 段四：旗本が崩れると、信長が旗本ごと土手へ駆けつけ、大音声で美作守を呼ぶ（史実は信長が自ら討った。遊びでは本人が討ち、信長が見届ける）
  lordArrives(rt) {
    const F = rt.flags;
    if (F.stage !== 3) return;
    F.stage = 4; F.guardDown = true;
    F.nobuGo = { x: BOSS.x + 9, z: BOSS.z + 13 };
    if (live(F.nobuG)) F.nobuG.speed = 5;
    sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 1));
    rt.say('組頭', '旗本が崩れた！　殿が駆けつけて来られるぞ！', 3);
    rt.after(3.2, () => {
      if (F.ending) return;
      const at = F.nobuG?.center?.() || rt.player.u.pos;
      rt.army.play('eshout', { x: at.x, z: at.z }, 1.6);
      rt.say(rt.G.lord ? '自分' : '織田信長', '美作はあれぞ！　者ども、続け！', 3.2);
    });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (!k?.isPlayer || v.team === rt.player.u.team) return;
    if (F.stage === 0 && v.group === F.practice) {
      F.pk++;
      // 一人目の褒めは共通の「よし、一人討った！」が出る（二度言わない）
      if (F.pk === 2) rt.say('組頭', '見事じゃ。槍は腰で突け。もう一息！', 3);
    } else if (F.stage >= 1) F.kills++;
  },

  // 土手の踏ん張り：美作守の左右に林勢の二組（侍まじり）。本人が近づくと味方の二組が鬨を上げて土手へ駆け上がる
  spawnBank(rt) {
    const F = rt.flags;
    F.bankG = [-1, 1].map((sd, i) => {
      // 林勢と一緒に北の霞の向こうから来て、土手の上の持ち場に着く
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '田の道の林勢', anchor: { x: BOSS.x + sd * 12, z: L2_Z0 - 18 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5,
        noRout: true, noAI: true, formation: 'line', morale: 95, dmgMult: 0.42, order: 'move', dest: { x: BOSS.x + sd * 12, z: BOSS.z + 6 }, aggro: 0, speed: 1.5 },
      dressH([{ type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'ashigaru', n: 2 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 1 }]));
      g.anchor = { x: BOSS.x + sd * 12, z: BOSS.z + 6 }; g.onArrive = (q) => { q.order = 'hold'; };
      g.secKind = 'bank'; F.groups.push(g);
      return g;
    });
  },
  // 土手へ駆け上がる：味方の列（今いる本物の兵）が鬨を上げて土手の組と旗本へかかる（新しい兵は湧かせない）
  bankCharge(rt) {
    const F = rt.flags;
    F.bankAllies = true;
    for (const g of F.line) if (live(g)) {
      const sd = Math.sign(g.slotX - FRONT_X);
      g.focus = null; g.order = 'move'; g.speed = 3.4; g.aggro = 12;
      g.dest = { x: BOSS.x + sd * 12, z: BOSS.z + 9 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 26; };
    }
    rt.army.play('toki', { x: BOSS.x, z: BOSS.z + 18 }, 1.5); rt.after(0.5, () => sfx('taiko', 0.9));
  },

  spawnBoss(rt) {
    const F = rt.flags;
    // 大将は一人の備（列の後ろへ下がらない）。取り巻きの旗本（侍六人と槍三人。kaito 11/2 O・P）は前に別の備で
    F.bossG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守', anchor: { x: BOSS.x, z: BOSS.z }, facing: 0, width: 1, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 100, dmgMult: 0.6, fixed: true },
    dressH([{ type: 'busho', n: 1, o: { name: '林美作守', hat: 'kabuto_m' } }]));
    F.guardG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: BOSS.x, z: BOSS.z + 4 }, facing: 0, width: 5, noRout: true, noAI: true,
      formation: 'line', order: 'hold', aggro: 0, morale: 90, dmgMult: 0.55, fixed: true },
    dressH([{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 3 }]));
    const b = F.bossU = F.bossG.units[0];
    // 開戦の時は林勢の列の後ろ（北の霞の向こう、Z0）に出て、土手の上へ進む。着いたら止まる
    const Z0 = L2_Z0 - 26, dz = Z0 - BOSS.z;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z + dz; u.pos.y = rt.world.heightAt(x, z + dz); };
    put(b, BOSS.x, BOSS.z);
    // 侍は大将を囲み、槍は前の一列
    F.guardG.units.forEach((u, i) => (u.type === 'samurai' ? put(u, BOSS.x + Math.sin(i * Math.PI / 3 + Math.PI / 6) * 2.4, BOSS.z + Math.cos(i * Math.PI / 3 + Math.PI / 6) * 2.4)
      : put(u, BOSS.x + (i - 7) * 2.4, BOSS.z + 4.2)));
    for (const g of [F.bossG, F.guardG]) { const a = { ...g.anchor }; g.anchor = { x: a.x, z: a.z + dz }; g.order = 'move'; g.speed = 1.5; g.dest = a; g.onArrive = (q) => { q.order = 'hold'; q.anchor = a; }; }
    // 四十秒〜一分で倒せる強さ（仮）
    b.maxHp = b.hp = BOSS_HP;
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    const P = rt.player.u;
    // 見えない壁（時間切れで逃げる者は外へ出す）
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 組頭は自分の組（味方の列の真ん中）の前に立って北へ進み、主人公はそれについて行く（kaito 11/2 Q「組頭が動き、自分はそれについていく」）。
    //   離れた時の組頭の印と「組頭に従え」は共通の kumi_lead.js
    if ((F.kumiT = (F.kumiT || 0) - dt) <= 0) {
      F.kumiT = 0.5;
      const g = F.kumi, c = F.stage >= 1 && live(F.allies) ? F.allies.center() : null;
      const at = c ? { x: c.x + 1.5, z: c.z - 2.5 } : { x: START.x + 2, z: START.z };
      if (Math.hypot(F.kumiU.pos.x - at.x, F.kumiU.pos.z - at.z) > 2.5) { g.order = 'move'; g.dest = at; }
      else g.order = 'hold';
      // 信長の旗本は味方の列の十四m後ろに付いて北へ（大音声と美作守の場面では F.nobuGo へ馬を進める）
      const f = F.stage >= 1 && lineFront(F.line, Math.PI), N = F.nobuG;
      if ((f || F.nobuGo) && live(N)) { const c = N.center(), to = F.nobuGo || { x: FRONT_X + 10, z: Math.min(ZS - 4, f.z + 14) }; if (Math.hypot(c.x - to.x, c.z - to.z) > 5) { N.order = 'move'; N.dest = to; } else if (N.order === 'move') N.order = 'hold'; }
      // 黒田半平は信長の旗本の左前に付く（美作守と斬り合うまで）
      const K = F.kuroG;
      if (!F.bossOn && live(K) && live(N)) { const c = N.center(), to = { x: c.x - 5, z: c.z - 3 }, k = K.units[0].pos; if (Math.hypot(k.x - to.x, k.z - to.z) > 3) { K.order = 'move'; K.dest = to; } else if (K.order === 'move') K.order = 'hold'; }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 段の進み（kaito 11/1 B 節）：練習 → 林の先手 → 二の備 → 土手の林美作守
    if (F.stage === 0 && F.practice && (!live(F.practice) || rt.t - F.practiceT > PRACTICE_T)) this.startLines(rt);
    if (F.stage === 1) {
      // 列どうしが組み合った時、自分が味方の列のそばにいれば「味方の列と並んで進む」
      if (!F.lineMet) {
        const a = lineFront(F.line, Math.PI), b = lineFront(F.l1, 0);
        if (a && b && Math.abs(a.z - b.z) < 14) {
          let near = Infinity;
          for (const g of F.line) if (live(g)) { const c = g.center(); near = Math.min(near, Math.hypot(c.x - P.pos.x, c.z - P.pos.z)); }
          if (near < 16) F.lineMet = true;
        }
      }
      // 列どうしがぶつかった時（本人がどこにいても）。柴田は林勢の来ないのを焦り、数で押す
      if (!F.meetT) { const a = lineFront(F.line, Math.PI), b = lineFront(F.l1, 0); if (a && b && Math.abs(a.z - b.z) < 14) F.meetT = rt.t; }
      if (F.meetT && !F.waitSaid && rt.t - F.meetT > 8) {
        F.waitSaid = true;
        rt.say('柴田勝家', '美作守の勢はまだか！　名塚など捨て置いて、こちらへ回せ！', 3.4);
        rt.after(5, () => { if (F.stage === 1) rt.say('足軽', '柴田勢は数が多い……押される！', 3); });
        rt.after(10, () => { if (F.stage === 1) rt.say('組頭', '退くな！　列を崩さず踏みとどまれ！', 3); });
        // 『信長公記』：柴田の勢いに佐々孫介らが討たれ、信長の御前は四十ほどに減った
        rt.after(16, () => { if (F.stage === 1) rt.say('足軽', '佐々孫介殿、討死！　殿の御前はもう四十ほどじゃ！', 3); });
        // 『信長公記』：織田造酒丞は首を取ろうとする者を止め、踏みとどまって突き続けた
        rt.after(22, () => { if (F.stage === 1) rt.say('織田造酒丞', '首は捨て置け！　今は突き崩す時じゃ！', 3); });
      }
      // AB（kaito 11/3）：大音声は柴田勢を三割まで斬り減らしてから。時間だけでは進めない（五分の保険だけ）
      // 11/3 p100_inou：柴田勢を本物の兵で千の比（九十人余り）にしたので、半分まで斬り減らした所で大音声（信長公記：大混戦の最中の一喝）
      if (F.meetT && rt.t - F.meetT > SHOUT_T && aliveIn(F.l1) <= F.l1N * 0.5 || rt.t - F.stageT > 300) this.shout(rt);
    } else if (F.stage === 2) {
      if (!F.regrouped && rt.t - F.stageT > REGROUP_T + 6) this.advanceLine2(rt);
      if (!F.bowsDown && (aliveIn(F.bows) <= 1 || rt.t - F.stageT > 300)) { F.bowsDown = true; this.routLine(rt, F.bows); }
      if (aliveIn(F.l2) <= F.l2N * 0.35 || rt.t - F.stageT > 330) { F.bowsDown = true; this.breakLine2(rt); }
    } else if (F.stage === 3) {
      if (!F.bankDown && F.bankG && aliveIn(F.bankG) <= 6) F.bankDown = true;
      if (F.guardG && aliveIn([F.guardG]) <= 1) this.lordArrives(rt);
      // 11/5（kaito 二-5「自分が何もしなくても物語は進む」）：本人が田の道へ寄らなくても、九十秒で味方の列が旗本へかかり、旗本も構えを解いて斬り合う
      //   （前は本人が三十四m内に来るまで味方が動かず、立ち止まると段三のまま五分止まった。11/5 の流し）
      else if (rt.t - F.stageT > 90) {
        if (!F.bankAllies) this.bankCharge(rt);
        for (const g of [F.guardG, F.bossG]) if (g && g.noAI) { g.noAI = false; g.order = 'hold'; g.aggro = 14; }
      }
    }
    if (F.stage >= 3 && !F.bankAllies && P.pos.z < BOSS.z + 34) this.bankCharge(rt);
    // 崩れて退く林勢：本人から離れた者は去る（本物の兵の枠を空ける）
    for (const g of F.groups) {
      if (!g.routing) continue;
      for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 60) rt.army.despawn(u);
    }
    strayArrows(rt, 0.25);
    // 槍兵：8m で振り向いて戦う。退き切った者は（本人から遠い所でだけ）去らせる。弓兵：30m で射る。葦の伏兵：7m で飛び出す
    for (const g of F.groups) {
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && u.pos.z < -128 && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z));
      }
      if (g.secKind === 'bow') { const on = near < BOW_RANGE; g.fire = on; g.aggro = on ? BOW_RANGE : 0; }
      else if (g.secKind === 'lurk' && g.order === 'hold' && near < 7) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3.4; rt.army.play('eshout', P.pos, 1); }
      else if (g.order === 'retreat' && !g.routing && near < TURN) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3; }
    }
    // 乱戦の音：近い塊ごとに、足音の地響き・鬨・槍の打ち合いを順に重ねる（人数で厚く）
    if ((F.dinT -= 0.25) <= 0) {
      F.dinT = 1.4 + Math.random() * 1.2;
      let best = null, bd = 80;
      for (const g of F.groups) {
        if (!g.count || g.order === 'retreat' || g.secKind === 'bow' || g.secKind === 'lurk') continue;
        const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (d < bd && d > 6 && g.units.some((u) => u.alive && u.target)) { bd = d; best = c; }
      }
      if (best) {
        const k = (F.dinK = ((F.dinK || 0) + 1) % 4), v = Math.min(1.4, 0.7 + 30 / (bd + 20));
        rt.army.play(k === 0 ? 'tramp' : k === 1 ? 'shaftContact' : k === 2 ? 'eshout' : 'clash', { x: best.x, z: best.z }, v);
      }
    }
    // 美作守と取り巻き：20m で戦い始める
    const B = F.bossU;
    if (B && !F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < BOSS_RANGE) {
      F.bossOn = true;
      for (const g of [F.bossG, F.guardG]) { g.noAI = false; g.order = 'hold'; g.aggro = 14; }   // 土手を離れず、近づいた者と戦う
      // 黒田半平が先に美作守へ斬りかかる（『信長公記』）
      if (live(F.kuroG)) { const K = F.kuroG; K.noAI = false; K.order = 'attack'; K.focus = B; K.aggro = 14; K.seekRange = 24; K.speed = 3.6; rt.say('黒田半平', '美作守殿、黒田半平じゃ。勝負！', 3); }
    }
    // 殿は土手から離れない（追っても 14m で戻る）
    if (B?.alive && F.bossOn && !rt.timeLimit?.up) {
      const g = F.bossG, d = Math.hypot(B.pos.x - BOSS.x, B.pos.z - BOSS.z);
      if (d > 14 && g.order !== 'move') { g.order = 'move'; g.dest = { x: BOSS.x, z: BOSS.z }; g.speed = 3; B.target = null; B.atk = null; }
      else if (d < 3 && g.order === 'move') g.order = 'hold';
      // 11/6 fixc1455（1600×900 で遊んだ写真）：馬上の美作守が追い合いのうちに東の杉の帯（x 60）まで六十m 駆け、最期が暗い林の中で信長の見えない所になった。
      //   田の道から二十m より先へは出さない（『信長公記』の最期は野の上。信長が馬を寄せて突き伏せる所が見える）
      if (d > 20) { const k = 20 / d; B.pos.x = BOSS.x + (B.pos.x - BOSS.x) * k; B.pos.z = BOSS.z + (B.pos.z - BOSS.z) * k; B.fleeing = false; }
    }
    // 美作守との一騎打ちの間（8m 内）は、取り巻きと林勢は周りで味方と斬り合い、本人へ同時に打つのは美作守ともう一人まで
    if (B?.alive) rt.def.playerAtkMax = rt.world.def.playerAtkMax = 2;
    // 11/5 時代考証（『信長公記』）：美作守は黒田半平と長く斬り合い、駆けつけた信長が自ら突き伏せた。
    //   本人と半平が命の三割五分まで追い詰めると、信長が口中杉若を連れて馬を寄せ、自ら討つ（本人が信長の時は本人の手で。本人が五m内にいない間は減らない）
    if (B?.alive && B.hp < B.maxHp * 0.35) {
      const N = F.nobuU;
      if (rt.G.lord || !N?.alive) { if (Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) > 5) B.hp = B.maxHp * 0.35; }
      else {
        if (!F.finaleT) {
          F.finaleT = rt.t; if (F.stage === 3) this.lordArrives(rt);
          if (live(F.nobuG)) F.nobuG.speed = 6;
          rt.say('組頭', '半平殿が手を斬られた！　美作守も弱ったぞ。殿が来られる！', 3);
          rt.after(2.6, () => { if (!F.ending) rt.say('織田信長', '杉若、続け！　美作、覚悟！', 2.6); });
        }
        F.nobuGo = { x: B.pos.x + 2, z: B.pos.z + 2 };
        if (Math.hypot(N.pos.x - B.pos.x, N.pos.z - B.pos.z) < 4.5 || rt.t - F.finaleT > 14) {
          F.nobuKill = true; B.invuln = false; rt.army.play('eshout', B.pos, 1.6); rt.army.kill(B, N);
        }
      }
    }
    if (B && !B.alive) this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    if (F.nobuKill) {
      rt.say('織田信長', '林美作守、この信長が突き伏せたり！', 3);
      rt.after(1.4, () => rt.say('組頭', '殿が美作守を討たれたぞ！　勝鬨じゃ！', 3));   // 11/6 fix4：「お主らの槍じゃ」は今の励まし言葉
    } else {
      rt.say('組頭', '林美作守、討ち取ったり！', 3);
      if (!rt.G.lord) rt.after(1.2, () => rt.say('織田信長', '見事じゃ。美作の最期、この信長が見届けた！', 3));
    }
    // 信勝方が崩れて退く。柴田らは後に赦されて信長方へ戻る（伏線）
    for (const g of F.groups) if (g !== F.bossG && live(g)) { g.routing = true; g.order = 'retreat'; g.dest = { x: g.center().x, z: -150 }; g.aggro = 0; g.focus = null; }
    rt.after(1.6, () => rt.banner('信勝方、総崩れ', '討ち取った首は四百五十余り'));
    victoryMoment(rt, '勝');
    rt.finish({ scriptedEnd: true }, 5);
  },

  // bot：近い敵を突き、いなければ赤い旗へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const prev = p.botStrikeFoe;
    // 始めの一分は北（前）の敵を先に突く：画面の奥へ乱戦が続き、赤い旗印も向きの先に入る
    const front = (o) => ok(o) && o.pos.z < u.pos.z + 0.5;
    const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && Math.hypot(prev.pos.x - u.pos.x, prev.pos.z - u.pos.z) < 2.8 ? prev : (F.bossU?.alive && ok(F.bossU) && Math.hypot(F.bossU.pos.x - u.pos.x, F.bossU.pos.z - u.pos.z) < 9 ? F.bossU : (b.t < 60 && b.army.nearestEnemy(u, 8, front)) || b.army.nearestEnemy(u, F.bossU?.alive || b.t > 200 ? 4 : 8, ok));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    // 近くに敵がいなければ組頭（味方の列の真ん中）について行く。段三は遊ぶ人と同じく行き先のピン（旗本）へ、旗本が崩れてからは美作守へ
    const K = F.kumiU;
    if ((F.stage || 0) < 3 && K?.alive) { goTo(p, inp, K.pos.x, K.pos.z + 2, 2); return; }
    const T = F.stage === 3 && this.missionSignTarget(b);
    if (T) { goTo(p, inp, T.pos.x, T.pos.z, 2); return; }
    const B = F.bossU?.alive ? F.bossU.pos : BOSS;
    goTo(p, inp, B.x, B.z + 2, 2);
  },
};
inou_spec.history = OLD.history;
// def.sides のある戦は開戦の札に日付を出す。11/5：当日の天気は史料に無く、空は薄雲（前日の大雨）なので「晴」をやめ「曇」に
inou_spec.date = () => OLD.date().replace('晴', '曇');
// 11/6 fix4 時代考証：前日の大雨で川が増え、田はぬかるむ（組頭の第一声）のに、身の回りは乾いた土と土埃（dust 0.85）だった。湿った土にし、土埃を抑える
inou_spec.timeslip = { ...OLD.timeslip, wet: 0.4, dust: 0.15 };

export { inou_spec };
