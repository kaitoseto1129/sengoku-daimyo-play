// t04b_ota/scene.js … 太田城の舞台（平地の城・周りの堤・出水の堰・水）。段の中身は s1〜s5
// 城は真ん中、堤は城から六十五歩の輪（土を盛った高まり）。北に城と堤をつなぐ土橋。
import * as THREE from 'three';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg, solidRect, tawara, kobune } from '../props.js';
import { allyGroup } from '../bhelp.js';
import { addSite } from '../map_sites.js';
import { rippleWater } from '../world_water.js';
import { liteMat } from '../world_vegetation_materials.js';
import { troops } from '../toyo15/kit.js';
import { sentries } from '../t04a_sengokubori/scene.js';
import { S as SETTINGS } from '../settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../units_model.js';

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
  // 11/18 クラウド 紀州の持ち主：城の高みは丸（半径24）で、板塀は四角（±23）。塀の内の四隅が低く、水が上がると城の中の備が胸まで水に浸かった。
  //   城の高みを塀に合わせた角の丸い四角にする（外の堤・土橋は同じ）
  const dc = Math.max(Math.abs(x), Math.abs(z));
  let h = -0.8 + 1.6 * clamp((34 - dc) / 10);
  h += 3.2 * clamp(1 - Math.abs(d - 65) / 8);
  // 11/19 04:35 クラウド 紀州の持ち主（⑥ 終わりの土橋の写真「手前に四角い水の板が浮く」）：土橋の両脇が切り立った崖（幅八 m の段）で、
  //   水が上がると橋の縁に沿った真っ直ぐな角の水の板に見えた。土橋の上は幅六 m のまま、両脇を二 m 半でなだらかに水へ落とす
  if (z < -22 && z > -70) h = Math.max(h, 1.2 - Math.max(0, Math.abs(x) - 3) * 0.8);
  return h;
}
function fence(rt, seg, h = 2.4) {
  rt.scene.add(castleBoardFence(rt.world, seg, { h }));
  const s = solidSeg(...seg, 0.18); s.missileH = h; s.missileType = 'wood';
}
// 11/19 04:10 クラウド 紀州の持ち主（⑥ act bot の写真 一段目「人夫の頭の上に茶色の箱が浮いて見える」）：既定の荷（四角の箱）を、
//   土を詰めた藁の俵を二つ縄で背負う形にする（忍城の人夫と同じ作り。形は全員で共用し、一度だけ作る）
let dohyo = null;
const dohyoLoad = () => {
  if (dohyo) return dohyo;
  const parts = [];
  for (const [y, z] of [[1.3, -0.3], [1.52, -0.36]]) {
    const b = new THREE.CylinderGeometry(0.17, 0.17, 0.58, 9, 2), q = b.attributes.position;
    for (let v = 0; v < q.count; v++) { const k = Math.abs(q.getY(v)) > 0.2 ? 0.72 : 1; q.setX(v, q.getX(v) * k); q.setZ(v, q.getZ(v) * k); }   // 俵の両端をすぼめる
    b.computeVertexNormals(); b.rotateZ(Math.PI / 2); b.translate(0, y, z);
    parts.push(paint(b, 0xa58a55));
    for (const x of [-0.17, 0.17]) { const r = new THREE.TorusGeometry(0.172, 0.014, 4, 10); r.rotateY(Math.PI / 2); r.translate(x, y, z); parts.push(paint(r, 0x5e4a2c)); }
  }
  dohyo = mergeGeometries(parts, false); for (const g of parts) g.dispose();
  return dohyo;
};
export const porters = (rt, name, at, n = 8) => {
  const g = allyGroup(rt, { faction: 'oda', name, anchor: at, width: 6, fixed: true, fullStrength: true, aggro: 0, seekRange: 0 },
    [{ type: 'porter', n, o: { armor: 0x4a4034, flag: null, porterLoad: dohyoLoad() } }]);
  g.noAI = true; return g;
};
export function build(rt) {
  const F = rt.flags, W = rt.world;
  rt.scene.add(jinmaku(W, P.camp.x, P.camp.z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, P.camp.x, P.camp.z + 1));
  // 11/19 04:30 クラウド 紀州の持ち主（⑥ 始まりの写真「十万の陣なのに、本陣から城までの野に旗が一本だけ」）：秀吉の本陣の後ろ、
  //   本陣から築堤の場への野の左右（初めの肩越しの絵に入る所）、北の堤の東寄りの外に羽柴の幟を立てる（千石堀の本陣と同じく幟だけ。兵は足さない・本人の通り道（西）は空ける）
  for (const [x, z] of [[-30, -119], [-10, -120], [-40, -86], [-44, -74], [-14, -76], [-8, -86], [20, -78], [40, -70], [56, -57]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
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
    F.weirWood = wood;   // 11/18 紀州の持ち主（200秒の写真）：板だけ透かしても、柱と貫が画面の右三分の一を塞いだ。枠も板と同じに透かす
    F.weirFrame = g;
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
  boatTick(rt, dt);
  fleetTick(rt, dt);
  breachTick(rt, dt);
  // 堰板：カメラから十 m 内に来たら板と枠を描かない
  const cam = rt.camera, wm = F.weir?.material;
  if (cam && wm) {
    const d = cam.position.distanceTo(F.weir.position);
    // 11/18 02:30 紀州の持ち主（230秒・画質「高」）：6m ほどで半ば透けた堰の板が、暗い幕になって画面の右半分を覆った。
    // 11/19 紀州の持ち主（見回り cloud-11 の200秒の写真）：6〜12m の半ば透けた柱と板が、画面の真ん中と右に幽霊の柱のように立った。
    //   透かさず、カメラが十 m 内に入った時だけ板と枠を描かない（当たり weirSolid はそのまま）。外では濃いまま
    const show = d >= 10;
    if (F.weir.visible !== show) { F.weir.visible = show; if (F.weirFrame) F.weirFrame.visible = show; }
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

// 11/18 クラウド 紀州の持ち主（240秒の写真）：「小舟の雑賀衆」が舟無しで腰まで水に浸かって歩いていた。
//   深い水に入った雑賀衆に小舟（props.js kobune・形は共用）を足元に浮かべ、向きを歩みに合わせる。
//   舟どうしは三 m 半より寄せない（寄る時は舟を置いて降りる）。討たれた者の舟は空のまま水に残る。水が引けば地に下ろす。舟は十四艘まで
function boatTick(rt, dt) {
  const F = rt.flags, W = rt.world, L = F.kobs || (F.kobs = []);
  const free = (x, z, self) => L.every((k) => k === self || Math.abs(k.b.position.x - x) + Math.abs(k.b.position.z - z) > 3.5);
  if ((F.kobT = (F.kobT || 0) - dt) <= 0 && L.length < 14 && F.waterY > -0.5) {
    F.kobT = 0.25;
    for (const u of rt.army.units) {
      if (L.length >= 14) break;
      if (u.team !== 1 || !u.alive || u._kob || u.isStruct) continue;
      if (F.waterY - W.heightAt(u.pos.x, u.pos.z) < 0.5 || !free(u.pos.x, u.pos.z)) continue;
      // 11/22 K564：舟は一艘ずつ描かず、十四艘を一つの束（InstancedMesh）で描く（一艘一回→全部で一回）。b は置き場だけの空の物
      if (!F.kobIM) { const p = kobune(0, 0, 0, 0, 4.6); const im = F.kobIM = new THREE.InstancedMesh(p.geometry, p.material, 14); im.count = 0; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.userData.camBlock = false; im.userData.noFreeze = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rt.scene.add(im); }
      const b = new THREE.Object3D(); b.position.set(u.pos.x, F.waterY - 0.25, u.pos.z); b.rotation.y = u.heading || 0;
      u._kob = b; L.push({ u, b });
    }
  }
  for (const k of L) {
    const { u, b } = k, gy = W.heightAt(b.position.x, b.position.z);
    if (k.u && u.alive && !u.gone) {
      const wet = F.waterY - W.heightAt(u.pos.x, u.pos.z) > 0.25;
      if (wet && free(u.pos.x, u.pos.z, k) && Math.hypot(u.pos.x - b.position.x, u.pos.z - b.position.z) < 2.5) { b.position.x = u.pos.x; b.position.z = u.pos.z; if (u.heading != null) b.rotation.y = u.heading; }
      else if (Math.hypot(u.pos.x - b.position.x, u.pos.z - b.position.z) > 2.5) k.u = null;   // 舟を降りた者はもう乗せない
    }
    b.position.y = Math.max(F.waterY - 0.25, gy - 0.05) + Math.sin(rt.t * 1.3 + b.id) * 0.03;
  }
  const im = F.kobIM;
  if (im) { L.forEach((k, i) => { k.b.updateMatrix(); im.setMatrixAt(i, k.b.matrix); }); im.count = L.length; im.instanceMatrix.needsUpdate = true; }
}

// 11/18 夜50-39（④400秒の写真）：「堤が崩れた・東の堤から水があふれる」のに、崩れ目の堤は緑の草のまま、切れ目も流れ出す水も無かった。
//   崩れ目に濡れた土の切れと崩れた土の塊・堤を越えて外へ流れ出す濁り水・外の野の水溜まりを置く。
//   人夫が塞ぐほど流れを細め、土俵を積み、塞いだら流れを止める（水溜まりは残す）。板は四枚と俵の束六つだけ・材質は段の始めに一度作る
export function breachBuild(rt) {
  const F = rt.flags, W = rt.world;
  if (F.brx) return;
  const d0 = Math.hypot(P.breach.x, P.breach.z), rx = P.breach.x / d0, rz = P.breach.z / d0, tx = -rz, tz = rx;
  const cx = rx * d0, cz = rz * d0, rot = Math.atan2(rx, rz);
  // 崩れ目を軸に、横（across）と外向き（along）の帯。高さは地面に沿わせる
  const strip = (w, a0, a1, lift, mat, nz) => {
    const geo = new THREE.PlaneGeometry(1, 1, 4, nz), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const across = pos.getX(i) * w, along = a0 + (pos.getY(i) + 0.5) * (a1 - a0);
      const x = cx + rx * along + tx * across, z = cz + rz * along + tz * across;
      pos.setXYZ(i, -across, W.heightAt(x, z) + lift, along);
    }
    // 面を上へ向ける（裏から照らされて真っ黒な帯になった）
    const idx = geo.index.array, A = (i, j) => pos.getComponent(idx[i], j);
    const e1x = A(1, 0) - A(0, 0), e1z = A(1, 2) - A(0, 2), e2x = A(2, 0) - A(0, 0), e2z = A(2, 2) - A(0, 2);
    if (e1z * e2x - e1x * e2z < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.position.set(cx, 0, cz); m.rotation.y = rot; m.receiveShadow = true;
    rt.scene.add(m); return m;
  };
  // 縁を草へ溶かす（角の立った板に見えた）。帯の絵は横の縁ほど透ける
  const mud = new THREE.MeshLambertMaterial({ color: 0x8a7254, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mudBand = new THREE.MeshLambertMaterial({ map: bandTex(false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const gash = strip(7, -4, 13, 0.05, mudBand, 20);
  // 切れ目の両脇に崩れた土の塊（堤の切れ口に見せる）
  const lumpGeo = new THREE.SphereGeometry(1, 10, 6); lumpGeo.scale(1.3, 0.7, 2);
  const lumps = [-4.6, 4.6].map((s) => {
    const x = cx + tx * s, z = cz + tz * s, m = new THREE.Mesh(lumpGeo, mud);
    m.position.set(x, W.heightAt(x, z) - 0.3, z);   // 半ば地へ沈める（宙に浮く皿に見えた） m.rotation.y = rot; rt.scene.add(m); return m;
  });
  // 堤を越えて外へ流れ出す濁り水
  // 流れ用に別の水の作りを組むと、携帯の軽い描き方で真っ黒な帯になった。池の水の材質を使い回す（作りも増えない）
  const flowMat = new THREE.MeshLambertMaterial({ map: bandTex(true), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  flowMat.map.wrapT = THREE.RepeatWrapping; flowMat.map.repeat.set(1, 3);
  const flow = strip(3.6, -5, 15, 0.1, flowMat, 28);
  // 外の野に広がる水溜まり（池の水の材質を使い回す）
  const fan = new THREE.Mesh(new THREE.CircleGeometry(8, 28), F.water.material);
  fan.rotation.x = -Math.PI / 2; fan.position.set(cx + rx * 15, -0.72, cz + rz * 15); fan.scale.setScalar(0.2); rt.scene.add(fan);
  // 人夫が積む土俵（塞ぐほど増える）
  const bags = [];
  for (let i = 0; i < 6; i++) {
    const s = -2.4 + (i % 3) * 2.4, a = i < 3 ? -0.6 : 0.8, x = cx + tx * s + rx * a, z = cz + tz * s + rz * a;
    const b = tawara(W, x, z, rot + Math.PI / 2, 3, { solid: false }); b.visible = false; rt.scene.add(b); bags.push(b);
  }
  F.brx = { gash, lumps, flow, fan, bags, age: 0 };
}
function breachTick(rt, dt) {
  const F = rt.flags, B = F.brx;
  if (!B) return;
  B.age += dt;
  const k = F.fixed || F.step > 4 ? 1 : Math.max(0, Math.min(1, (F.fix || 0) / 90));
  B.flow.visible = k < 0.98;
  B.flow.scale.x = 1 - 0.8 * k;   // 塞ぐほど細る
  if (!SETTINGS.reduceMotion) B.flow.material.map.offset.y -= dt * 0.9;   // 外へ流れる白い筋
  B.fan.scale.setScalar(Math.min(1, 0.2 + B.age / 25));
  const n = Math.round(k * B.bags.length);
  for (let i = 0; i < B.bags.length; i++) B.bags[i].visible = i < n;
}

// 帯の絵：横（u）の縁ほど透け、流れ（true）は濁った泡の筋、切れ（false）は濡れた土のむら
function bandTex(flow) {
  const W = 32, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  let seed = flow ? 11 : 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const streak = Array.from({ length: W }, () => rnd());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs(x / (W - 1) - 0.5) * 2, edge = 1 - Math.max(0, Math.min(1, (u - 0.45) / 0.55)), o = (y * W + x) * 4, r = rnd();
    let c, a = edge * edge * (3 - 2 * edge);
    if (flow) {
      const foam = Math.max(0, Math.sin(y / H * Math.PI * 6 + streak[x] * 6.28) - 0.55) * 2.2 * (0.6 + 0.4 * r);
      c = [136 + foam * 90, 116 + foam * 85, 84 + foam * 75]; a *= 0.92;
    } else { const w = 0.8 + 0.35 * r; c = [96 * w, 78 * w, 58 * w]; }
    d[o] = Math.min(255, c[0]); d[o + 1] = Math.min(255, c[1]); d[o + 2] = Math.min(255, c[2]); d[o + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 11/19 k365-cloud-41（K306 本の場面・史実）：水攻めの水の上へ小西行長が大船を入れ、城へ大筒を撃ち込んだ。
//   ③の42秒に城の南西の水へ大船を三艘（小舟の形を大きくし、総矢倉の箱と幟を載せる）。水が満ちている間、七秒ごとに一艘が舳先で煙を上げて撃つ。
//   形と材質は一度だけ作る。兵は乗せない（数の決まり 250 人に入れない）
const FLEET_AT = [[-36, -6, 0.5], [-30, 16, 0.2], [-14, 36, -0.4]];
let fleetMat = null;
export function konishiFleet(rt) {
  const F = rt.flags, W = rt.world;
  if (F.fleet) return;
  // 11/22 K564：屋形の箱五つ（壁・帯・屋根）は色を頂点に焼いて一つの形・一つの材質にまとめる（一艘6回→2回・三艘で12回減る）
  if (!fleetMat) {
    const parts = [], C = new THREE.Color();
    const put = (hex, sx, sy, sz, y, zOff = 0) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(0, y, zOff); C.setHex(hex).convertSRGBToLinear(); const n = b.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([C.r, C.g, C.b], i * 3); b.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(b); };
    put(0x4a3a2a, 3.0, 1.6, 6.5, 1.3); put(0xd8d0bc, 3.05, 0.25, 6.55, 1.9); put(0x2c2622, 3.4, 0.2, 7.0, 2.2);
    put(0x4a3a2a, 2.0, 1.1, 2.6, 2.8, -1.2); put(0x2c2622, 2.4, 0.18, 3.0, 3.4, -1.2);
    fleetMat = { geo: mergeGeometries(parts), mat: liteMat({ vertexColors: true, roughness: 0.85 }) };
    for (const b of parts) b.dispose();
  }
  F.fleet = FLEET_AT.map(([x, z, r]) => {
    const g = new THREE.Group();
    const hull = kobune(0, 0, 0, 0, 13); hull.scale.set(2.3, 1.6, 1); g.add(hull);
    g.add(new THREE.Mesh(fleetMat.geo, fleetMat.mat));
    const n = nobori(W, 0, 0, 'konishi'); n.position.set(0.9, 2.2, -3.6); g.add(n);
    g.position.set(x, Math.max(F.waterY - 0.3, W.heightAt(x, z) - 0.1), z); g.rotation.y = r;
    rt.scene.add(g);
    return g;
  });
  F.fleetT = 2;
}
function fleetTick(rt, dt) {
  const F = rt.flags, W = rt.world;
  if (!F.fleet) return;
  F.fleet.forEach((g, i) => { g.position.y = Math.max(F.waterY - 0.3, W.heightAt(g.position.x, g.position.z) - 0.1) + Math.sin(rt.t * 0.7 + i * 2) * 0.05; });
  if (F.waterY < 0 || rt.flags.ending) return;
  if ((F.fleetT -= dt) > 0) return;
  F.fleetT = 7;
  const g = F.fleet[(F.fleetShot = ((F.fleetShot || 0) + 1) % F.fleet.length)];
  const fx = g.position.x + Math.sin(g.rotation.y) * 6.5, fz = g.position.z + Math.cos(g.rotation.y) * 6.5;
  W.puff?.(fx, fz, 4, true, false);
  W.puff?.(g.position.x * 0.45, g.position.z * 0.45, 3, true, false);   // 城の塀の辺りに着弾の土煙
}
