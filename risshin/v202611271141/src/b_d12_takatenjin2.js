// 武田編 十二戦目「高天神城の戦い（二）」（天正九年〔1581〕三月二十二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：家康は高天神城を一年余り囲み、堀と柵と砦で兵糧の道を断った。勝頼は後詰を送れず、兵糧の尽きた城将 岡部元信は
//   三月二十二日の夜、城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した（『信長公記』『三河物語』・掛川市の高天神城跡の案内）。
//   主人公は城兵の一人。夜の打って出で囲みを破り、生きて抜ける。
// 11/21 cloud-10（司令塔）：本人の討ち取りが1だったので、新手と見張りに討てる名のある組頭を一人ずつ混ぜた（討てない将 busho は使わない）
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { withCastle } from './light_castle.js';
import { TAKATENJIN_D12 } from './castles/takatenjin.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import { kagaribi } from './props.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -40 };
const KIDO = { x: 4, z: 10 };        // 城の大手の木戸（打って出の口）
const SAKU = { x: -24, z: 64 };      // 徳川の囲みの柵
const TORIDE = { x: 30, z: 104 };    // 囲みの砦（大坂の砦）
const NUKE = { x: 0, z: 150 };       // 囲みの外（林の中の抜け道）

// K722②（11/27 クラウドし）：要件書①「城壁から包囲砦を見る」が台詞だけで、戦場に徳川の砦も囲みの柵も一つも無かった。
//   ①城を一回り取り巻く徳川の柵（半径八十九m の輪・柱と二段の貫）と、柵に沿って三十m ごとの篝火（夜の闇に火の輪が浮かぶ）。
//   ②柵の外の丘に徳川の砦を七つ（大坂・火ヶ峰・能ヶ坂・小笠山・中村・三井山・獅子ヶ鼻。土塁の四角・上の柵・井楼・篝火二つ・白い幟三本）。
//   ③「囲みの柵」の段（段4）を破ると、その所の柵が一間ほど外へ倒れて口が開く。字は足さない。当たりは付けない（遊びは前と同じ）。
//   形は束ねて描く回数は六つ（土・木二・幟・遠い火の明かりの点・倒れる柵）＋本人の道の近くの篝火六つまで（籠は共通の束）。出所：『三河物語』『家忠日記』・掛川市の高天神城跡の案内（高天神六砦）・docs/battle_refs/takatenjin.md
const RING_C = { x: -25, z: -25 }, RING_R = 89;   // 柵の輪（SAKU がちょうど輪の上）
const FORTS = [   // [x, z, 名]
  [40, 122, '大坂砦'], [118, 58, '火ヶ峰砦'], [100, -120, '能ヶ坂砦'], [-25, -178, '小笠山砦'], [-160, -110, '中村砦'], [-120, 40, '三井山砦'], [-98, 108, '獅子ヶ鼻砦']];
function bx(sx, sy, sz, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(ry); g.translate(x, y, z); return g.toNonIndexed(); }
function dorui(L, x, y, z, ry) {   // 土塁：上を細らせた台形の土手（幅二・六m・上一m）
  const g = new THREE.BoxGeometry(2.6, 1.8, L, 1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.38);
  g.computeVertexNormals(); g.rotateY(ry); g.translate(x, y, z); return g.toNonIndexed();
}
function kui(x, y, z, hh, k) {   // 柵の柱（丸太）
  const g = new THREE.CylinderGeometry(0.065, 0.08, hh, 5); g.rotateY(k); g.translate(x, y + hh / 2 - 0.25, z); return g.toNonIndexed();
}
let GLOW_TEX = null;
function glowTex() {   // 遠い篝火の明かり：芯は黄白・回りは橙の丸
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,180,1)'); g.addColorStop(0.18, 'rgba(255,170,70,0.9)'); g.addColorStop(0.45, 'rgba(230,90,20,0.35)'); g.addColorStop(1, 'rgba(160,40,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); GLOW_TEX = new THREE.CanvasTexture(c); GLOW_TEX.colorSpace = THREE.SRGBColorSpace; return GLOW_TEX;
}
function kakoiDress(rt) {
  const Wo = rt.world, sc = rt.scene, h = (x, z) => (Wo.heightAt(x, z) || 0);
  const earth = new THREE.MeshStandardMaterial({ color: 0x6b5641, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe6dfcc, roughness: 0.9, side: THREE.DoubleSide });
  const E = [], W = [], Wd = [], C = [], Br = [], far = [], near2 = [];
  // 篝火：本人の通る所（木戸から柵の口・大坂砦）の近くだけ本物の火（籠と炎・揺れる照り）。遠い火は一つの点の束の明かり（描く回数一つ）
  const PASS = [[-10, 44], [-24, 64], [30, 104]];
  const fire = (x, z) => { if (near2.length < 6 && PASS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 42)) near2.push([x, z]); else far.push(x, h(x, z) + 1.75, z); };
  // ①柵の輪（柱は三・五m ごと・二段の貫）。SAKU の前後十二m は倒れる柵として別に組む
  const n = Math.round(2 * Math.PI * RING_R / 3.5), at = (i) => { const a = i / n * 2 * Math.PI; return [RING_C.x + Math.sin(a) * RING_R, RING_C.z + Math.cos(a) * RING_R]; };
  const SAKU_P = [-24, 64], near = (x, z) => Math.hypot(x - SAKU_P[0], z - SAKU_P[1]) < 12;
  const brk = []; let fires = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = at(i), [x2, z2] = at(i + 1), y = h(x, z), y2 = h(x2, z2);
    if (near(x, z) || near(x2, z2)) { brk.push([x, z, y, x2, z2, y2]); continue; }
    for (let t = 0; t < 1; t += 0.2) W.push(kui(x + (x2 - x) * t, y + (y2 - y) * t, z + (z2 - z) * t, 2.1 + ((i * 5 + t * 5) % 3) * 0.12, i + t));   // 丸太を七十cm ごとに隙間なく
    const L = Math.hypot(x2 - x, z2 - z), ry = Math.atan2(x2 - x, z2 - z), mx = (x + x2) / 2, mz = (z + z2) / 2, my = (y + y2) / 2;
    for (const hh of [0.55, 1.45]) Wd.push(bx(0.07, 0.09, L + 0.2, mx, my + hh, mz, ry));   // 二段の貫（内から結ぶ）
    if (i % 9 === 0) { const a = i / n * 2 * Math.PI, fx = x - Math.sin(a) * 2.5, fz = z - Math.cos(a) * 2.5; fire(fx, fz); fires++; }
  }
  // 倒れる柵：柵の線の上の点を元に、外（輪の外向き）へ倒す
  const bTan = (() => { const a = Math.atan2(SAKU_P[0] - RING_C.x, SAKU_P[1] - RING_C.z); return a; })();
  const bY = h(SAKU_P[0], SAKU_P[1]);
  for (const [x, z, y, x2, z2, y2] of brk) {
    const lx = x - SAKU_P[0], lz = z - SAKU_P[1], lx2 = x2 - SAKU_P[0], lz2 = z2 - SAKU_P[1];
    for (let t = 0; t < 1; t += 0.2) Br.push(kui(lx + (lx2 - lx) * t, y + (y2 - y) * t - bY, lz + (lz2 - lz) * t, 2.2, t));
    const L = Math.hypot(lx2 - lx, lz2 - lz), ry = Math.atan2(lx2 - lx, lz2 - lz);
    for (const hh of [0.55, 1.45]) Br.push(bx(0.08, 0.1, L + 0.2, (lx + lx2) / 2, (y + y2) / 2 - bY + hh, (lz + lz2) / 2, ry));
  }
  // ②砦：土塁の四角（一辺十八m・口は城の側）・上の柵・井楼・篝火・幟
  for (const [fx, fz] of FORTS) {
    const fy = h(fx, fz), toC = Math.atan2(RING_C.x - fx, RING_C.z - fz), S = 9;
    const cs = Math.cos(toC), sn = Math.sin(toC), P = (u, v) => [fx + u * cs + v * sn, fz - u * sn + v * cs];   // v が城の向き
    for (const [u, v, L, rot] of [[0, -S, 2 * S, 0], [-S, 0, 2 * S, 1], [S, 0, 2 * S, 1], [-5.5, S, 7, 0], [5.5, S, 7, 0]]) {
      const [x, z] = P(u, v), ry = toC + (rot ? 0 : Math.PI / 2);
      E.push(dorui(L + 2.2, x, h(x, z) + 0.45, z, ry));
      for (let t = -L / 2; t <= L / 2 + 0.01; t += 0.8) { const [px, pz] = rot ? P(u, v + t) : P(u + t, v); W.push(kui(px, h(px, pz) + 1.35, pz, 1.9, t)); }
      Wd.push(bx(0.07, 0.09, L, x, h(x, z) + 2.0, z, ry), bx(0.07, 0.09, L, x, h(x, z) + 2.7, z, ry));
    }
    // 井楼（奥の隅・七m）
    const [tx, tz] = P(-4, -4), ty = h(tx, tz);
    for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) W.push(bx(0.2, 7.4, 0.2, tx + a, ty + 3.7, tz + b));
    for (const yy of [2.6, 5.0]) { Wd.push(bx(2.6, 0.12, 0.12, tx, ty + yy, tz - 1.2), bx(2.6, 0.12, 0.12, tx, ty + yy, tz + 1.2), bx(0.12, 0.12, 2.6, tx - 1.2, ty + yy, tz), bx(0.12, 0.12, 2.6, tx + 1.2, ty + yy, tz)); }
    W.push(bx(3.0, 0.16, 3.0, tx, ty + 7.0, tz), bx(3.0, 0.8, 0.08, tx, ty + 7.5, tz - 1.5), bx(3.0, 0.8, 0.08, tx, ty + 7.5, tz + 1.5));
    const roof = new THREE.ConeGeometry(2.4, 1.2, 4); roof.rotateY(Math.PI / 4); roof.translate(tx, ty + 8.9, tz); Wd.push(roof.toNonIndexed());
    for (let k = 0; k < 4; k++) W.push(bx(0.1, 1.4, 0.1, tx + (k & 1 ? 1.3 : -1.3), ty + 7.9, tz + (k & 2 ? 1.3 : -1.3)));
    // 篝火（口の両脇）と幟（白・三本）
    for (const u of [-3.2, 3.2]) { const [x, z] = P(u, S + 2.4); fire(x, z); fires++; }
    for (const u of [-6, 0, 6]) {
      const [x, z] = P(u, S - 1.5), y = h(x, z) + 1.4;
      W.push(bx(0.08, 5.6, 0.08, x, y + 2.8, z)); Wd.push(bx(0.9, 0.05, 0.05, x, y + 5.5, z, toC + Math.PI / 2));
      const c = new THREE.PlaneGeometry(0.8, 3.2); c.rotateY(toC + Math.PI / 2); const o = 0.42; c.translate(x + o * Math.cos(toC), y + 3.8, z - o * Math.sin(toC)); C.push(c.toNonIndexed());
    }
  }
  const mk = (geos, m, sh) => { if (!geos.length) return null; const me = new THREE.Mesh(mergeGeometries(geos), m); me.receiveShadow = !!sh; me.castShadow = !!sh; me.matrixAutoUpdate = false; me.updateMatrix(); me.name = 'd12kakoi'; sc.add(me); return me; };
  mk(E, earth, true); mk(W, wood, true); mk(Wd, wood, false); mk(C, cloth, false);
  for (const [x, z] of near2) { sc.add(kagaribi(Wo, x, z)); try { Wo.addFire(x, z, { h: 1.3, size: 0.6 }); } catch (e) { /* 火が出なくても進む */ } }
  let glow = null;
  if (far.length) {
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(far, 3));
    glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex(), size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.name = 'd12kakoi'; glow.renderOrder = 3; glow.matrixAutoUpdate = false; sc.add(glow);
  }
  let breach = null;
  if (Br.length) {
    breach = new THREE.Group(); const m = new THREE.Mesh(mergeGeometries(Br), wood); m.castShadow = true; breach.add(m);
    breach.position.set(SAKU_P[0], bY, SAKU_P[1]); breach.rotation.order = 'YXZ'; breach.rotation.y = bTan; breach.userData.noFreeze = true; breach.name = 'd12kakoi'; sc.add(breach);
    m.rotation.y = -bTan;   // 中身は世界の向きのまま。組だけ輪の向きに回し、X で外へ倒す
  }
  rt.flags.d12 = { breach, fall: 0, glow, t: 0, fires, real: near2.length };
}
function kakoiTick(rt, dt) {
  const D = rt.flags.d12; if (!D) return;
  D.t += dt;
  if (D.glow) D.glow.material.opacity = 0.85 + 0.1 * Math.sin(D.t * 7.3) + 0.05 * Math.sin(D.t * 19.1);   // 遠い火のちらつき
  if (D.breach && (rt.flags.step || 0) >= 4 && D.fall < 1) {   // 囲みの柵の段を破った：柵が外へ倒れる
    D.fall = Math.min(1, D.fall + dt / 1.1); const e = D.fall * D.fall;
    D.breach.rotation.x = e * 1.45; D.breach.position.y = rt.world.heightAt(-24, 64) - e * 0.25;
  }
}

// 11/21 クラウド35（K563 ③の質）：高天神城の縄張りを置く（castles/takatenjin.js の TAKATENJIN_D12・出所 docs/battle_refs/takatenjin.md）。門・櫓・館は遠景の軽い形（本物の門は閉じて寄せ手と城兵の行き来を塞いだので使わない）
export const d12_takatenjin2 = withCastle(lightBattle({
  id: 'd12_takatenjin2',
  date: '天正九年（1581）三月二十二日　夜　遠江国 高天神城',
  intro: '兵糧は尽きた。岡部元信と共に、夜の闇に紛れて打って出る。徳川の囲みの柵を破り、外へ抜けよ。',
  history: '天正九年（1581）、家康は高天神城を一年余り囲み、兵糧の道を断った。勝頼は後詰を送れず、城将の岡部元信は三月二十二日の夜に城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した。後詰を出さなかった勝頼の名は落ち、武田から離れる者が増えた。',
  sides: { a: { name: '岡部元信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '徳川の囲み', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 1000, b: 5000 },
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 6,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  setup: (rt) => { kakoiDress(rt); },     // K722② 囲みの柵・篝火・砦
  update: (rt, dt) => { kakoiTick(rt, dt); },
  world: {
    seed: 1581, time: 'night', fogFar: 300,
    hills: [[0, -60, 50, 26], [-120, 40, 70, 14], [120, 60, 60, 14], [0, 170, 60, 6]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：城の大手の木戸・徳川の囲みの柵・囲みの砦・囲みの外 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -40], [4, 10], [-24, 64], [30, 104], [0, 150]], w: 3 }],
    groves: [{ x: -120, z: 40, r: 30, n: 30, kind: 'sugi' }, { x: 120, z: 60, r: 30, n: 30, kind: 'sugi' }],
    trees: 580, tufts: 1500,
  },
  // 11/21 cloud-41（章の通し）：通しの足軽が囲まれて十数秒で倒れる回が残った（受けの段・数十の槍）。敵は変えず、味方の刃を 0.15→0.35 に上げて味方が囲みを削る（本人の討ち取りは減ってもよい）
  allies: [
    { name: '岡部元信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.35, list: [busho('岡部元信'), uS(4), uA(14)] },
    { name: '城兵', at: { x: SPAWN.x + 12, z: SPAWN.z + 4 }, dmg: 0.35, list: [uS(3), uA(12)] },
    // 11/21 cloud-41（章の通し）：通しの本人（組の無い足軽）が木戸の前で三十余の槍に囲まれ80秒前後で倒れた。敵は変えず、本人の脇に城兵の槍衆を一組足す
    { name: '城兵の槍衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 10 }, dmg: 0.35, list: [uS(3), uA(16)] },
  ],
  steps: [
    { kind: 'rest', dur: 18, heal: 0, say: [
      ['城兵', '城壁から見よ。徳川の砦が、城をぐるりと取り巻いておる', 3],
      ['岡部元信', '九年前、われらが攻め上った道じゃ。今度は徳川が登って来る', 3.2],
      ['城兵', '兵糧は、もう数日分しか残っておりませぬ', 3],
      ['使者', '岡部様、戻りました。御屋形様より後詰はござらぬ', 3.2],
      ['岡部元信', '後詰は来ぬ。城に残っても飢えて死ぬだけじゃ', 3.2],
      ['岡部元信', '今宵、打って出る。一人でも多く囲みを抜けよ', 3.2]] },
    { kind: 'fight', at: KIDO, obj: '木戸から打って出て、木戸の前の徳川の見張りを討つ', title: '打って出', sub: '闇の中で鬨の声',
      say: [['城兵', '木戸を開けよ！', 2.4], ['徳川の侍', '城から出て来たぞ！', 2.6]],
      foes: [{ name: '木戸の前の見張り', from: { x: KIDO.x, z: KIDO.z + 16 }, list: [{ type: 'samurai', n: 1, o: { name: '見張りの組頭' } }, uS(5), uA(32)] }],
      later: [{ t: 25, say: ['徳川の侍', '城兵が出た！　囲め！'], foes: [{ name: '囲みの見回り', from: { x: KIDO.x + 16, z: KIDO.z + 20 }, list: [{ type: 'samurai', n: 1, o: { name: '大須賀康高の組頭' } }, uS(3), uA(16)] }] }],
      reward: '木戸の前の見張りを破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + 10, z: KIDO.z + 16 }, obj: '木戸の前の堀端で、松明を振る徳川の足軽を討つ', limit: 90,
      say: [['岡部元信', '松明を消せ。闇に紛れて抜ける', 3.2]],
      foes: [{ name: '松明の徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: KIDO.x + 10, z: KIDO.z + 16 }), list: [uS(2), uA(10)] }],
      reward: '松明の足軽を討った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x - 14, z: KIDO.z + 34 }, obj: '囲みの内の野で、駆け付けた徳川の侍を討つ', limit: 90,
      say: [['組頭', '侍が駆け付けた。囲まれる前に討て', 3.2]],
      foes: [{ name: '駆け付けた徳川の侍', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: KIDO.x - 14, z: KIDO.z + 34 }), list: [uS(3), uA(8)] }],
      reward: '駆け付けた侍を討った' },
    // 11/21 cloud-41（章の通し）：通しの本人が前の段で深手を負い、次の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.6, say: [['岡部元信', '見張りは破った。傷を縛れ、柵へかかる', 2.8]] },
    { kind: 'fight', at: SAKU, obj: '徳川の囲みの柵へ斬り込み、柵の守りを破る', title: '囲みの柵', sub: '柵の内から鉄砲が鳴る',
      say: [['岡部元信', '柵を倒せ！　押し破れ！', 2.8]],
      foes: [
        { name: '柵の守り', from: { x: SAKU.x + 6, z: SAKU.z + 10 }, list: [uS(5), uA(35)] },
        { name: '柵の鉄砲', from: { x: SAKU.x - 10, z: SAKU.z + 16 }, list: [uG(8)] }],
      later: [{ t: 25, say: ['物見', '柵の向こうから新手！'], foes: [{ name: '柵の新手', from: { x: SAKU.x + 16, z: SAKU.z + 18 }, list: [uS(3), uA(16)] }] }, { t: 55, say: ['組頭', '横からも来る！'], foes: [{ name: '横の新手', from: { x: SAKU.x - 20, z: SAKU.z + 8 }, list: [uS(3), uA(12)] }] }],
      reward: '囲みの柵を破った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['岡部元信', '柵は破った。傷を縛れ、鉄砲が残っておる', 2.8]] },   // K674：柵の後で倒れた回（act bot 382秒）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x + 12, z: SAKU.z + 16 }, obj: '柵の内の鉄砲組を斬り払う', limit: 90,
      say: [['組頭', '柵の内の鉄砲じゃ。撃たせるな', 3.2]],
      foes: [{ name: '柵の内の徳川の鉄砲組', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: SAKU.x + 12, z: SAKU.z + 16 }), list: [uS(1), uA(4), uG(6)] }],
      reward: '柵の内の鉄砲組を斬り払った' },
    { kind: 'rest', dur: 6, heal: 0.4, say: [['組頭', '鉄砲は黙った。息を継げ', 2.6]] },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x + 24, z: SAKU.z + 34 }, obj: '柵の裏の陣屋の前で、寝所から出た徳川の兵を討つ', limit: 90,
      say: [['組頭', '陣屋から兵が出て来た。数を増やすな', 3.2]],
      foes: [{ name: '陣屋の徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: SAKU.x + 24, z: SAKU.z + 34 }), list: [uS(2), uA(12)] }],
      reward: '陣屋の兵を討った' },
    { kind: 'hold', at: TORIDE, label: '砦の前', obj: '砦から出る徳川の新手を受け、後ろの城兵を通す', r: 16, dur: 45,
      title: '砦', sub: '岡部様が討たれた——',
      say: [['城兵', '岡部様、お討死！', 2.6], ['組頭', '止まるな！　後ろの者を通せ！', 2.8]],
      waves: [
        { t: 6, say: ['徳川の侍', '一人も逃がすな！'], foes: [{ name: '砦の新手', from: { x: TORIDE.x, z: TORIDE.z + 20 }, list: [uS(5), uA(35)] }] },
        { t: 26, say: ['物見', '横から槍衆！'], foes: [{ name: '横の槍衆', from: { x: TORIDE.x - 26, z: TORIDE.z + 6 }, list: [uS(2), uA(14)] }] },
        { t: 40, say: ['組頭', '砦の裏からも出て来る！　止まるな！'], foes: [{ name: '砦の裏の手', from: { x: TORIDE.x + 22, z: TORIDE.z + 16 }, list: [uS(2), uA(14)] }] }],
      reward: '砦の前で城兵を通した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TORIDE.x - 14, z: TORIDE.z + 10 }, obj: '砦の脇の空堀で、追って来る徳川の足軽を斬り払う', limit: 90,
      say: [['組頭', '空堀へ引き込め。追う足軽を斬れ', 3.2]],
      foes: [{ name: '追う徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: TORIDE.x - 14, z: TORIDE.z + 10 }), list: [uS(2), uA(12)] }],
      reward: '追う足軽を斬り払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: NUKE.x + 10, z: NUKE.z - 24 }, obj: '林の入り口で、先回りした徳川の弓を討つ', limit: 90,
      say: [['物見', '林の口に弓が先回りしておる！', 3.2]],
      foes: [{ name: '先回りの徳川の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: NUKE.x + 10, z: NUKE.z - 24 }), list: [uS(1), uA(4), uB(6)] }],
      reward: '先回りの弓を討った' },
    { kind: 'move', at: NUKE, label: '囲みの外の林', obj: '囲みの外の林へ抜ける', r: 12,
      say: [['組頭', 'あの林じゃ！　走れ！', 2.6]] },
  ],
  win: {
    banner: '高天神城 囲みを抜ける', sub: '城兵のほとんどは討死した', award: '高天神の囲みを抜けた',
    say: [['城兵', '……抜けた。抜けたのは、何人じゃ', 3],
      ['組頭', '後詰の来ぬ城か。甲斐の者は、もう御屋形様を信じぬかもしれぬ', 3.6]],
  },
}), { plan: TAKATENJIN_D12, at: { x: 0, z: 0 }, lift: 0, team: 0 });
// K657②（11/25）：尾根の城と分かるように。乾いた赤土・崖の砂ぼこり・松の濃い緑（timeslip_field.js・数は増やさず色だけ・K643）
d12_takatenjin2.timeslip = {
  wet: 0.05, dust: 0.45, trample: 0.3, debris: 0.4, arrows: 0.5, mudColor: 0x8a6244, hazeColor: 0xb8a888, grassLift: 0.05,
  grass: 0x6e7a46, grassTints: [0xffffff, 0xcfc08e, 0x9aa468], grassH: 0.9, grassCap: 380,
  flagColors: [0x1c1a1a, 0xc23a2a, 0xe6dfcc],
};
export default d12_takatenjin2;
