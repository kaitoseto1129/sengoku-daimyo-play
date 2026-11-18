// t04b_ota/scene.js … 太田城の舞台（平地の城・周りの堤・出水の堰・水）。段の中身は s1〜s5
// 城は真ん中、堤は城から六十五歩の輪（土を盛った高まり）。北に城と堤をつなぐ土橋。
import * as THREE from 'three';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg, solidRect, tawara } from '../props.js';
import { allyGroup } from '../bhelp.js';
import { addSite } from '../map_sites.js';
import { rippleWater } from '../world_water.js';
import { liteMat } from '../world_vegetation_materials.js';
import { troops } from '../toyo15/kit.js';
import { sentries } from '../t04a_sengokubori/scene.js';

export const HASHIBA = { armor: 0x282420, flag: 'toyotomi' };
export const SAIKA = { armor: 0x302a24, flag: 'maru' };
export const P = {
  spawn: { x: -34, z: -112 }, camp: { x: -18, z: -104 },
  work: { x: -26, z: -62 },        // 築堤の所（堤の北西）
  pile: { x: -34, z: -80 },        // 土俵の山
  weir: { x: -46, z: -46 },        // 出水の堰
  breach: { x: 60, z: -18 },       // のちに崩れる東の堤
  bridge: { x: 0, z: -58 },        // 北の土橋（使者を迎える所）
  gate: { x: 0, z: -26 },          // 城の北の門
};
const clamp = (v) => Math.max(0, Math.min(1, v));
export function otaHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = -0.8 + 1.6 * clamp((34 - d) / 10);
  h += 3.2 * clamp(1 - Math.abs(d - 65) / 8);
  if (Math.abs(x) < 4 && z < -22 && z > -70) h = Math.max(h, 1.2);
  return h;
}
function fence(rt, seg, h = 2.4) {
  rt.scene.add(castleBoardFence(rt.world, seg, { h }));
  const s = solidSeg(...seg, 0.18); s.missileH = h; s.missileType = 'wood';
}
export const porters = (rt, name, at, n = 8) => {
  const g = allyGroup(rt, { faction: 'oda', name, anchor: at, width: 6, fixed: true, fullStrength: true, aggro: 0, seekRange: 0 },
    [{ type: 'porter', n, o: { armor: 0x4a4034, flag: null } }]);
  g.noAI = true; return g;
};
export function build(rt) {
  const F = rt.flags, W = rt.world;
  rt.scene.add(jinmaku(W, P.camp.x, P.camp.z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, P.camp.x, P.camp.z + 1));
  const camp = troops(rt, true, '秀吉の本陣', { x: P.camp.x, z: P.camp.z + 1 }, [{ type: 'ashigaru', n: 10 }, { type: 'busho', n: 1, o: { name: '羽柴秀吉' } }], HASHIBA, { width: 13 });   // 11/18 クラウド：幅8では陣幕の中で重なった（千石堀と同じ）
  camp.stay = true; camp.aggro = 0; camp.seekRange = 0;
  for (const u of camp.units) if (u.name === '羽柴秀吉') { u.invuln = true; u.noTarget = true; u.jinchu = { standing: false, t: 0, soldiers: [] }; }
  // 城（板塀の四角・北に門）と城の中の小屋・幟
  for (const seg of [[-23, -25, -4, -25], [4, -25, 23, -25], [-23, -25, -23, 25], [23, -25, 23, 25], [-23, 25, 23, 25]]) fence(rt, seg);
  rt.scene.add(kabukimon(W, 0, -25, 8));
  F.castleHut = hut(W, 0, 9, 12, 8); rt.scene.add(F.castleHut);
  rt.scene.add(hut(W, -12, -6, 7, 5));
  F.flags = [[10, 12], [-14, 14], [14, -18], [-14, -18]].map(([x, z]) => { const n = nobori(W, x, z, 'maru'); rt.scene.add(n); return n; });
  // 土俵は小物として描くだけにし、築堤へ向かう護衛や人夫の道を塞がない。
  for (let x = -40; x <= -28; x += 3) rt.scene.add(tawara(W, x, P.pile.z, 0, 6, { solid: false }));
  // 堰（板の水門）と水（城の周りに溜まる）
  // 11/10 関所1：堤の斜面の上で板の水門の下が浮き、遠くから宙の箱に見えた。下を地へ一歩沈める
  // 11/18 クラウド K358（874×402 の写真）：堰板を上げると、柱の無い黒い厚板が人の頭の上に浮き、画面の半分を塞ぐ黒い壁に見えた。
  //   板を薄く木の色にし、両脇に堰柱と上の貫を立てて「上げた堰板」に見せる
  F.weir = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.3, 6), new THREE.MeshLambertMaterial({ color: 0x6a5038 }));
  F.weir.position.set(P.weir.x, W.heightAt(P.weir.x, P.weir.z) + 0.75, P.weir.z); F.weir.rotation.y = Math.PI / 4; rt.scene.add(F.weir);
  // 11/18 クラウド k365-cloud-41（874×402 の200秒の写真）：上げた堰板（6m の板）がカメラのすぐ前に来て、画面の三分の一〜四分の三を塞いだ。
  //   カメラの当たりにすると本人の真上まで寄って馬具が画面を塞ぐので、近い時だけ板を薄く透かす（waterTick）
  // 11/17 クラウド kaito2（iMac 検品 245秒「空に大きな黒い四角」）：堰を開くと板の水門だけが 2.4m 持ち上がり、支えの無い暗い板が宙に浮いて
  //   下から見上げると空に黒い四角が出た。左右の柱と上の貫（はり）で門の枠を作り、板は枠の溝を上がる形にする（板の動き・当たりは同じ）。
  {
    const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x5a4632 }), base = W.heightAt(P.weir.x, P.weir.z) - 0.9;
    for (const s of [-3.25, 3.25]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 6.4, 0.42), wood); post.position.set(0, 3.2, s); g.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 7.4), wood); beam.position.set(0, 6.25, 0); g.add(beam);
    g.position.set(P.weir.x, base, P.weir.z); g.rotation.y = Math.PI / 4; rt.scene.add(g);
  }
  // 板は濡れた古い板の色（真っ黒な塊に見せない）
  F.weir.material.color.setHex(0x6a5640);
  F.weirSolid = solidRect(P.weir.x, P.weir.z, 1, 6, Math.PI / 4);
  // 11/17 クラウド kaito2：水攻めの水は紀ノ川を堰き入れた濁り水。澄んだ湖の青灰の板に見えたので、黄土の濁りの色にする（形・描く回数は同じ。川の筋の作り sediment は川床の値が要るので使わない）
  const mat = rippleWater(liteMat({ color: 0x4c4634, roughness: 0.2 }), 0.4, 0.8, 2, W.hemi?.color, false, null, null, false, true);
  F.water = new THREE.Mesh(new THREE.CircleGeometry(60, 64), mat);
  F.water.rotation.x = -Math.PI / 2; F.water.position.y = -1; rt.scene.add(F.water);
  F.waterY = -1; F.waterTo = -1;
  // 築く堤（盛り土）：段が進むと高くなる。11/10 関所1：平たい箱が尾根の上に浮き、人と馬が箱に埋まった。
  //   地面に沿う盛り土の形（中ほどが高く、縁と両端はなだらかに地へ落ちる）に替え、上に立てるようにした。
  F.mound = moundMesh(rt); rt.scene.add(F.mound); setMound(F, 0);
  F.posts = sentries(rt, '城の塀の鉄砲衆', [{ x: -13, z: -24 }, { x: -7, z: -24 }, { x: 7, z: -24 }, { x: 13, z: -24 }], 0.04);
  F.friends = troops(rt, true, '築堤の護衛', { x: -30, z: -96 }, [{ type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }, { type: 'busho', n: 1, o: { name: '羽柴秀長', horse: true } }], HASHIBA);
  F.friends.stay = true;
  addSite(rt, 'castle', 0, 0, '太田城');
  addSite(rt, 'fort', P.work.x, P.work.z, '出水の堤');
  addSite(rt, 'fort', P.weir.x, P.weir.z, '出水の堰');
  addSite(rt, 'fort', P.breach.x, P.breach.z, '東の堤');
}
// 盛り土の形：P.work を背に、堤の輪に沿って長さ十六・幅十。高さは setMound で（最大 1.2）。
//   11/10 関所1：盛り土に人と馬が埋まった。地面の高さ（W.heightAt）にも同じ盛りを足し、上に立てるようにする（有岡・比叡山と同じ差し替え）。
// 11/18 クラウド（見回りの写真 150秒「角の立った平たい茶色の板・陰も草も無い」）：升目を細かくして縁のぎざぎざを消し、
//   絵を盛りの形に合わせて描く（裾は周りの草の色へ溶かし、上だけ掘り返した明るい土）。形・高さ・当たりは同じ。
const MOUND = { len: 16, half: 5, nx: 33, nz: 21, max: 1.2 };
const MD = (() => { const d = Math.hypot(P.work.x, P.work.z), rx = P.work.x / d, rz = P.work.z / d; return { rx, rz, tx: -rz, tz: rx, cx: P.work.x, cz: P.work.z }; })();
// 盛りの形（0〜1）：横切る向きは cos² で縁へ、両端の三歩はなだらかに
function moundShape(along, across) {
  const ka = Math.cos(Math.PI / 2 * Math.min(1, Math.abs(across) / MOUND.half)) ** 2;
  const kb = Math.max(0, Math.min(1, (MOUND.len / 2 - Math.abs(along)) / 3));
  return ka * kb * kb * (3 - 2 * kb);
}
function moundMesh(rt) {
  const W = rt.world, F = rt.flags;
  const geo = new THREE.PlaneGeometry(1, 1, MOUND.nx - 1, MOUND.nz - 1);
  const pos = geo.attributes.position, base = new Float32Array(pos.count), bump = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getX(i) * MOUND.len, across = pos.getY(i) * MOUND.half * 2;
    const x = MD.cx + MD.tx * along + MD.rx * across, z = MD.cz + MD.tz * along + MD.rz * across;
    pos.setXYZ(i, x, 0, z);
    bump[i] = moundShape(along, across);
    base[i] = W.heightAt(x, z) - 0.22 * (1 - Math.min(1, bump[i] * 5));   // 縁は地の下へ沈め、地面との境のぎざぎざを見せない
  }
  const idx = geo.index.array, A = (i, j) => pos.getComponent(idx[i], j);
  const e1x = A(1, 0) - A(0, 0), e1z = A(1, 2) - A(0, 2), e2x = A(2, 0) - A(0, 0), e2z = A(2, 2) - A(0, 2);
  if (e1z * e2x - e1x * e2z < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: moundTex() }));
  m.userData.base = base; m.userData.bump = bump; m.frustumCulled = false; m.receiveShadow = true;
  // 立つ高さにも盛りを足す
  const ground = W.heightAt.bind(W);
  W.heightAt = (x, z) => {
    const h = ground(x, z), dx = x - MD.cx, dz = z - MD.cz;
    if (dx * dx + dz * dz > 100 || !(F.moundH > 0)) return h;
    const along = dx * MD.tx + dz * MD.tz, across = dx * MD.rx + dz * MD.rz;
    if (Math.abs(along) >= MOUND.len / 2 || Math.abs(across) >= MOUND.half) return h;
    return h + moundShape(along, across) * F.moundH;
  };
  return m;
}
// 盛り土の絵：裾は周りの草の色、上は掘り返した土。土のむらと草の残りの点を散らす（描き方は前と同じ「色＋絵」なので新しい描き方を組まない）
let MTEX = null;
function moundTex() {
  if (MTEX) return MTEX;
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const grass = [124, 131, 80], dirt = [176, 152, 116], top = [158, 132, 98];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const along = (x / (N - 1) - 0.5) * MOUND.len, across = (y / (N - 1) - 0.5) * MOUND.half * 2;
    const b = moundShape(along, across), t = Math.max(0, Math.min(1, (b - 0.1) / 0.5)), k = t * t * (3 - 2 * t);
    const r = rnd(), w = 0.82 + 0.3 * r + 0.08 * Math.sin(x * 0.7 + y * 0.31), sp = r > 0.93 ? 1 - k * 0.6 : 0;   // 土のむら・草の残り
    const c = k > 0.8 ? top : dirt, o = (y * N + x) * 4;
    for (let j = 0; j < 3; j++) { let v = (grass[j] * (1 - k) + c[j] * k) * w; v = v * (1 - sp) + grass[j] * 0.85 * sp; d[o + j] = Math.max(0, Math.min(255, v)); }
    d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  MTEX = new THREE.CanvasTexture(cv); MTEX.colorSpace = THREE.SRGBColorSpace; MTEX.anisotropy = 4;
  return MTEX;
}
// k：0〜1（築いた割合）。形が変わる時だけ頂点を書き直す
export function setMound(F, k) {
  const m = F.mound; if (!m) return;
  const h = 0.3 + (MOUND.max - 0.3) * Math.max(0, Math.min(1, k));
  if (Math.abs((F.moundH ?? -1) - h) < 0.02) return;
  F.moundH = h;
  const pos = m.geometry.attributes.position, { base, bump } = m.userData;
  for (let i = 0; i < pos.count; i++) pos.setY(i, base[i] + bump[i] * h);
  pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
}
// 水の高さを目当て（F.waterTo）へゆっくり寄せる。毎コマ
export function waterTick(rt, dt) {
  const F = rt.flags;
  const k = F.waterTo > F.waterY ? 0.03 : 0.12;
  F.waterY += Math.sign(F.waterTo - F.waterY) * Math.min(Math.abs(F.waterTo - F.waterY), dt * k);
  F.water.position.y = F.waterY;
  // 堰板：カメラから九 m 以内に来たら薄く透かす（四 m で二割）。材質は堰板だけの物
  const cam = rt.camera, wm = F.weir?.material;
  if (cam && wm) {
    const d = cam.position.distanceTo(F.weir.position);
    const op = d < 4 ? 0.2 : d < 9 ? 0.2 + 0.8 * (d - 4) / 5 : 1;
    if (Math.abs(op - wm.opacity) > 0.02) { if (!wm.transparent) { wm.transparent = true; wm.needsUpdate = true; } wm.opacity = op; wm.depthWrite = op > 0.95; }
  }
}

// 護衛は細かな隊列の整いを待ち続けず、六割が持ち場へ着いたら迎撃する。
// 築堤・堰・東の堤で共用し、遅れた兵は同じ持ち場へ向かわせる。
export function holdGuard(g) {
  g.order = 'hold'; g.dest = null;
}
export function guardTick(rt) {
  const F = rt.flags, g = F.friends;
  if (F.step > 4 || !g || g.order !== 'move' || !g.dest) return;
  if (!g.onArrive) g.onArrive = holdGuard;
  if (g.onArrive !== holdGuard) return;
  // 到着人数の見回りは半秒に一度。毎コマ全員を数えない。
  if (F.guardCheckAt > rt.t && F.guardStep === F.step) return;
  F.guardCheckAt = rt.t + 0.5; F.guardStep = F.step;
  let ready = 0, arrived = 0;
  for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut) continue;
    ready++;
    if (!u.downed && Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) <= 12 &&
        !rt.army.wallBetween(u.pos, -1, g.dest)) arrived++;
  }
  if (ready && arrived >= Math.ceil(ready * 0.6)) { g.onArrive = null; holdGuard(g); }
}
