// 骨の入った人（本物の人の動きを録った Idle・Walk・Run）と、実写の顔
// ・本人と、カメラの近く（25m ほど）の兵・名のある武将だけを、骨の入った体で描く。遠くの兵は units.js の形のまま
// ・体は assets/Soldier.glb（three.js の見本。Mixamo の骨）。現代の服は着物・袴の色に塗り替え、頭は隠す
// ・その上に units.js と同じ甲冑の部品（胴・草摺・袖・籠手・佩楯・脛当・兜）を骨ごとに付けて着せる
// ・本人と名のある武将の顔は assets/head/LeePerrySmith.glb（実在の男性の顔の3Dスキャン、CC BY 3.0、作者 Lee Perry-Smith）
// ・名のある武将と、侍大将より上の本人は、博物館の本物の胴丸の3Dスキャン（下の「本物の胴丸」）を骨に付けて着る
// ・読み込む前・読めない時・画質「低」では、今の形のまま
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UNIT_MAT, lookParts, GENERALS, RIDE, HORSE_HOOK, DEATH_END, haoriFold, soheiLook, katoGeometry, headEnvelope } from './units.js';
import { S } from './settings.js';
import { drawMon } from './textures.js';

// near：骨の入った人にする距離（m）・max：その数の上限・far：名のある武将の距離
// fine：草摺の揺れ・実写の顔まで細かくする距離・ik：腕を毎コマ武器へ合わせる距離（その先は間引く）
// budget：一コマに人を作ってよい時間（ms）。戦の始まりに止まらないよう、少しずつ作る
// lite：その先は見回し・左手を省く・dead：倒れた兵を人にする距離
export const HUM = { ready: false, failed: false, on: true, near: 42, max: 64, far: 70, ik: 18, lite: 28, fine: 12, face: 12, lod: 15, budget: 4, dead: 20 };
// 画質ごとの数（「低」は今の形のまま）
// 画質「低」でも自分（と名のある武将のごく近く）だけは本物の体にする
const HUM_Q = { high: { near: 42, max: 64 }, mid: { near: 30, max: 34 }, low: { near: 0, max: 4, far: 12 } };
const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), m0 = new THREE.Matrix4(), m1 = new THREE.Matrix4();

let SRC = null;      // 元の体（骨・形・動き・骨ごとの位置）
let HEAD = null;     // 実写の顔の形と絵
let loading = null;

// ---------------- 読み込み ----------------
export function loadHumans() {
  if (loading) return loading;
  if (typeof location !== 'undefined' && /[?&]norender/.test(location.search)) { HUM.on = false; return (loading = Promise.resolve()); }
  loading = (async () => {
    const L = new GLTFLoader();
    // .glb は公開の場所に置けないので、base64 の文字にした .js（tools/glb2js.mjs で作る）を読んで、ここで元に戻す
    const glb = async (mod) => {
      const b64 = (await mod).default;
      const bin = atob(b64), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return L.parseAsync(buf.buffer, '');
    };
    const [sol, head, tl] = await Promise.all([
      glb(import('./asset_soldier.js')),
      glb(import('./asset_head.js')),
      Promise.resolve(new THREE.TextureLoader()),
    ]);
    const [col, nrm, spec] = await Promise.all(['Map-COL.jpg', 'Infinite-Level_02_Tangent_SmoothUV.jpg', 'Map-SPEC.jpg'].map((f) => tl.loadAsync(new URL('../assets/head/' + f, import.meta.url).href)));
    for (const t of [col, nrm, spec]) { t.flipY = false; t.anisotropy = 4; }
    col.colorSpace = THREE.SRGBColorSpace;
    prepBody(sol);
    prepHead(head, col, nrm, spec);
    HUM.ready = true;
  })().catch((e) => { HUM.failed = true; HUM.err = String(e && e.stack || e).slice(0, 400); console.warn('骨の入った人を読めませんでした（今の形で描きます）', e); });
  return loading;
}

// 体の下ごしらえ：骨の名前・頂点ごとの部位（頭・手・脚…）・骨ごとの立ち姿の位置
const gc = (a, i, k) => (k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i));
const PART = { torso: 0, arm: 1, hand: 2, leg: 3, foot: 4, head: 5, neck: 6 };
function prepBody(gl) {
  const scene = gl.scene;
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && /Mesh/.test(o.name)) body = o; if (o.isSkinnedMesh && /visor/i.test(o.name)) o.visible = false; });
  const geo = body.geometry;
  const bones = body.skeleton.bones;
  const bname = bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
  // 頂点ごとに、いちばん重い骨から部位を決める
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = si.count;
  const part = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1, headW = 0;
    for (let k = 0; k < 4; k++) {
      const w = gc(sw, i, k), b = bname[gc(si, i, k)];
      if (w > bw) { bw = w; best = gc(si, i, k); }
      if (/^Head/.test(b)) headW += w;
    }
    const b = bname[best];
    part[i] = headW > 0.35 ? PART.head : /Hand/.test(b) ? PART.hand : /Neck/.test(b) ? PART.neck : /Foot|Toe/.test(b) ? PART.foot : /Leg/.test(b) ? PART.leg : /Arm|Shoulder/.test(b) ? PART.arm : PART.torso;
  }
  geo.setAttribute('part', new THREE.BufferAttribute(part, 1));
  // 余分な UV を捨てる
  for (const k of Object.keys(geo.attributes)) if (/^uv[1-9]/.test(k)) geo.deleteAttribute(k);
  const tex = body.material.map, ntex = body.material.normalMap;
  // 立ち姿（T の字）の骨の位置（人の根元の座標で。根元は向きを +z にそろえ、背丈を合わせる）
  const holder = new THREE.Group();
  holder.add(scene);
  // 見本は -z を向き、右手が +x。前後を返して +z を向かせる（右手は +x のまま＝本編の槍の手）
  scene.scale.set(1, 1, -1);
  holder.updateMatrixWorld(true);
  const nodes = {};
  scene.traverse((o) => { nodes[o.name.replace(/^mixamorig:?/, '')] = o; });
  const wp = (nm) => new THREE.Vector3().setFromMatrixPosition(nodes[nm].matrixWorld);
  // 背丈を本編の体（頭の上まで約 1.74）に合わせる
  const kH = 1.74 / wp('HeadTop_End').y;
  const rest = {};
  for (const nm of bname) rest[nm] = wp(nm).multiplyScalar(kH);
  // 現代の服の高い襟（首のまわり）は描かない（胴と首の付け根より上の、胴の頂点）
  {
    const mW = body.matrixWorld, w = new THREE.Vector3();
    const neckY = rest.Neck.y / kH - 0.03 / kH;
    for (let i = 0; i < n; i++) {
      if (part[i] !== PART.torso && part[i] !== PART.arm) continue;
      w.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(mW);
      if (w.y > neckY && Math.abs(w.x) < 0.2 / kH) part[i] = 7;
    }
    geo.attributes.part.needsUpdate = true;
  }
  // 現代の服の膨らみを細くする：頂点をいちばん重い骨の軸へ寄せる（袖は小袖の細さ、脛は脚絆の細さに）
  const pos = geo.attributes.position;
  {
    const SHR = { LeftShoulder: 0.72, RightShoulder: 0.72, LeftArm: 0.7, RightArm: 0.7, LeftForeArm: 0.78, RightForeArm: 0.78, LeftUpLeg: 0.9, RightUpLeg: 0.9, LeftLeg: 0.78, RightLeg: 0.78 };
    const CH = { LeftShoulder: 'LeftArm', RightShoulder: 'RightArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' };
    const mW = body.matrixWorld, mI = mW.clone().invert();
    const w = new THREE.Vector3(), A = new THREE.Vector3(), Bv = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let best = 0, bwt = -1;
      for (let k = 0; k < 4; k++) { const wt = gc(sw, i, k); if (wt > bwt) { bwt = wt; best = gc(si, i, k); } }
      const nm = bname[best], f = SHR[nm];
      if (!f) continue;
      A.copy(rest[nm]).multiplyScalar(1 / kH); Bv.copy(rest[CH[nm]]).multiplyScalar(1 / kH);
      w.fromBufferAttribute(pos, i).applyMatrix4(mW);
      D.copy(Bv).sub(A); const L2 = D.lengthSq();
      const t = Math.max(-0.2, Math.min(1.2, w.clone().sub(A).dot(D) / L2));
      Q.copy(A).addScaledVector(D, t);
      // 関節の近く（t が 0 や 1 の近く）は寄せを弱め、つなぎ目を割らない
      const edge = Math.min(1, Math.min(Math.abs(t), Math.abs(1 - t)) / 0.15);
      const k = 1 - (1 - f) * edge * Math.min(1, bwt * 1.4);
      w.sub(Q).multiplyScalar(k).add(Q).applyMatrix4(mI);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  // 骨の周りの太さ（その骨にいちばん重い頂点の、骨の軸からの距離の平均）
  const bw = new THREE.Vector3();
  const radius = {};
  const wantR = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'Spine1', 'Spine2'];
  const child = { LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', Spine1: 'Spine2', Spine2: 'Neck' };
  const acc = {};
  const meshW = body.matrixWorld;
  for (let i = 0; i < n; i++) {
    let best = 0, bwt = -1;
    for (let k = 0; k < 4; k++) { const w = gc(sw, i, k); if (w > bwt) { bwt = w; best = gc(si, i, k); } }
    const nm = bname[best];
    if (!wantR.includes(nm) || bwt < 0.6) continue;
    bw.fromBufferAttribute(pos, i).applyMatrix4(meshW).multiplyScalar(kH);
    const a = rest[nm], b = rest[child[nm]];
    const d = v0.copy(b).sub(a); const L = d.length(); d.multiplyScalar(1 / L);
    const t = v1.copy(bw).sub(a).dot(d);
    if (t < 0 || t > L) continue;
    const r = v1.copy(bw).sub(a).sub(v2.copy(d).multiplyScalar(t)).length();
    const e = acc[nm] || (acc[nm] = { s: 0, n: 0, mx: 0, mz: 0, cz: 0 });
    e.s += r; e.n++;
    const off = v1.copy(bw).sub(a);
    e.mx = Math.max(e.mx, Math.abs(off.x)); e.mz = Math.max(e.mz, Math.abs(off.z)); e.cz += off.z;
  }
  for (const k in acc) radius[k] = { r: acc[k].s / acc[k].n, mx: acc[k].mx, mz: acc[k].mz, cz: acc[k].cz / acc[k].n };
  const clip = (nm) => gl.animations.find((a) => a.name === nm);
  SRC = { scene, holder, body, bname, rest, kH, radius, tex, ntex, anims: { idle: clip('Idle'), walk: clip('Walk'), run: clip('Run') } };
  scene.scale.set(1, 1, 1);
  holder.remove(scene);
}

// 体の材質：部位ごとに色（着物・袴・肌・足袋）。元の絵は明るさ（しわ）だけ使う。頭は描かない
const bodyMats = new Map();
// dm：本物の胴丸の下に着る体（手も描かない。甲冑の脇の、スキャンに写っていない所から下の着物が見える）
function bodyMaterial(look, dm = false) {
  const cloth = look.cloth || 0x2b2622, skin = look.skin || 0xb58c68;
  const hakama = look.tier === 0 ? cloth : new THREE.Color(cloth).multiplyScalar(0.8).getHex();
  // 僧兵は体の胴を描かない（体の肩の形が衣の肩から突き出るので。胴は衣が覆う）
  const nt = !!look.sohei;
  const k = cloth + '|' + skin + '|' + look.tier + (dm ? '|dm' : '') + (nt ? '|nt' : '');
  if (bodyMats.has(k)) return bodyMats.get(k);
  const m = new THREE.MeshStandardMaterial({ map: SRC.tex, normalMap: SRC.ntex, roughness: 0.92, metalness: 0 });
  const U = {
    cTorso: { value: new THREE.Color(cloth) }, cArm: { value: new THREE.Color(cloth) }, cHand: { value: new THREE.Color(skin).multiplyScalar(0.72) },
    cLeg: { value: new THREE.Color(hakama) }, cFoot: { value: new THREE.Color(look.tier === 0 ? 0x5a5246 : 0x3a3630) }, cNeck: { value: new THREE.Color(skin) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float part;\nvarying float vPart;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPart = part;');
    sh.fragmentShader = 'uniform vec3 cTorso, cArm, cHand, cLeg, cFoot, cNeck;\nvarying float vPart;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        if (vPart > 3.5${dm ? ' || (vPart > 1.5 && vPart < 2.5)' : ''}${nt ? ' || vPart < 0.5' : ''}) discard;
        vec4 tA = texture2D(map, vMapUv);
        float lumA = dot(tA.rgb, vec3(0.3, 0.59, 0.11));
        int pA = int(vPart + 0.5);
        vec3 cA = pA == 0 ? cTorso : pA == 1 ? cArm : pA == 2 ? cHand : pA == 3 ? cLeg : pA == 4 ? cFoot : cNeck;
        diffuseColor.rgb = cA * clamp(0.55 + lumA * 1.6, 0.4, 1.35);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = (vPart > 1.5 && vPart < 2.5) || vPart > 5.5 ? 0.6 : 0.92;');
  };
  m.customProgramCacheKey = () => 'humbody' + (dm ? '-dm' : '') + (nt ? '-nt' : '');
  bodyMats.set(k, m);
  return m;
}

// ---------------- 本物の胴丸（甲冑一揃いの3Dスキャン） ----------------
// 博物館に飾られた本物の胴丸（胴・袖・草摺・佩楯・籠手・脛当・兜・面頬）を、着ている人形の顔と手ごと、骨の入った人に着せる
// ・形：assets/domaru_lite/domaru.glb（tools/domaru.mjs で台と槍を取り、約4万面と約8千面に減らし、骨の重みを付けた物）。src/asset_domaru.js に base64 で入れてある
// ・作者表記（CC BY 4.0）：This work is based on "Armadura Samurai Do-maru, BMVB" by Giravolt（docs/CREDITS.md）
// ・人形は腕を下ろして立っているので、骨をその姿に合わせた「着せる時の立ち姿」を作り、そこからの動きで甲冑を動かす
// crowd：侍・騎馬武者・武将（兵）にも着せる（人形の兜と顔は描かず、兵ごとの兜と顔を付ける）
export const DOMARU = { on: true, ready: false, failed: false, near: 14, crowd: true };
let DM = null, dmLoading = null;
export function loadDomaru() {
  if (dmLoading) return dmLoading;
  dmLoading = (async () => {
    const b64 = (await import('./asset_domaru.js')).default;
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const tl = new THREE.TextureLoader();
    const [gl, col, nrm] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...['domaru_col.jpg', 'domaru_nrm.jpg'].map((f) => tl.loadAsync(new URL('../assets/domaru_lite/' + f, import.meta.url).href)),
    ]);
    col.flipY = false; nrm.flipY = false; col.colorSpace = THREE.SRGBColorSpace; col.anisotropy = 8; nrm.anisotropy = 4;
    const geo = {};
    gl.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
    for (const k of ['hi', 'lo']) {
      const g = geo[k];
      g.setAttribute('skinIndex', g.getAttribute('_joints')); g.setAttribute('skinWeight', g.getAttribute('_weights'));
      g.deleteAttribute('_joints'); g.deleteAttribute('_weights');
    }
    const ex = gl.parser.json.extras || {};
    // 前腕・手と胴（腰・脚）にまたがる三角は外す：人形は腕を下ろして前腕が胴に触れているので、腕を上げると細く伸びて線に見える
    for (const k of ['hi', 'lo']) {
      const g = geo[k], J = g.getAttribute('skinIndex'), W = g.getAttribute('skinWeight'), I = g.index;
      const grp = (i) => { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = W.getComponent(i, c); if (w > bw) { bw = w; bi = J.getComponent(i, c); } } const n = ex.bones[bi] || ''; return /ForeArm|Hand/.test(n) ? n[0] : /Arm|Shoulder/.test(n) ? 'a' : 'b'; };
      const keep = [];
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
        const s = new Set([grp(a), grp(b), grp(c)]);
        if ((s.has('R') || s.has('L')) && (s.has('b') || (s.has('R') && s.has('L')))) continue;
        // 二の腕と胴にまたがる長い三角（袖の紐など）も、腕を上げると伸びるので外す
        if (s.has('a') && s.has('b')) { const P_ = g.attributes.position, e = Math.max(v0.fromBufferAttribute(P_, a).distanceTo(v1.fromBufferAttribute(P_, b)), v0.distanceTo(v2.fromBufferAttribute(P_, c)), v1.distanceTo(v2)); if (e > 0.05) continue; }
        keep.push(a, b, c);
      }
      g.setIndex(keep);
    }
    DM = { hi: geo.hi, lo: geo.lo, stand: geo.stand, bones: ex.bones, joints: ex.joints, col, nrm, inv: null };
    DOMARU.ready = true;
  })().catch((e) => { DOMARU.failed = true; DOMARU.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の胴丸を読めませんでした（今の形で描きます）', e); });
  return dmLoading;
}
// 本物の胴丸を着る人：名のある武将と、look.real の人（侍大将より上の本人）
export function wantsDomaru(look) { return DOMARU.on && !!look && (!!look.real || (typeof look.face === 'string' && look.face.startsWith('g:'))); }
// 兵の侍（侍・騎馬武者・武将）：胴丸を着る
const crowdDomaru = (look) => DOMARU.on && DOMARU.crowd && !!look && (look.tier ?? 0) >= 1 && !look.hero && !isSohei(look) && !wantsDomaru(look);
// 着せる時の骨の立ち姿（人の根元の座標）の逆行列。腕と脚の骨は人形の腕・脚の向きへ回し、どの骨も人形の関節の位置へ
function domaruInverses() {
  if (DM.inv) return DM.inv;
  const J = DM.joints, R = SRC.rest;
  // 骨 → [骨の立ち姿での子の関節, 人形の子の関節]
  const AIM = {
    RightArm: ['RightForeArm', 'RightForeArm'], RightForeArm: ['RightHand', 'RightHand'], RightHand: ['RightHandMiddle1', 'RightFinger'],
    LeftArm: ['LeftForeArm', 'LeftForeArm'], LeftForeArm: ['LeftHand', 'LeftHand'], LeftHand: ['LeftHandMiddle1', 'LeftFinger'],
    RightUpLeg: ['RightLeg', 'RightLeg'], RightLeg: ['RightFoot', 'RightFoot'], LeftUpLeg: ['LeftLeg', 'LeftLeg'], LeftLeg: ['LeftFoot', 'LeftFoot'],
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion();
  DM.inv = DM.bones.map((nm) => {
    const j = new THREE.Vector3(...J[nm]), r = R[nm];
    const M = new THREE.Matrix4().makeTranslation(j.x, j.y, j.z);
    if (AIM[nm]) {
      a.copy(R[AIM[nm][0]]).sub(r).normalize(); b.set(...J[AIM[nm][1]]).sub(j).normalize();
      M.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q.setFromUnitVectors(a, b)));
    }
    M.multiply(new THREE.Matrix4().makeTranslation(-r.x, -r.y, -r.z)).multiply(restMatrix(nm));
    return M.invert();
  });
  return DM.inv;
}
// 材質：スキャンの絵そのまま。威糸（紺）だけ、武将の威しの色へ塗り替える（紺の武将はそのまま）
// 赤備えなど、小札の色が黒でない家は、黒い漆の所をその色へ塗る（隊の色をそろえる）
// noHead：兵の侍に着せる時は、人形の兜と顔を描かない（兵ごとの兜・顔を上に付ける）
const dmMats = new Map();
const armorTint = (hex) => { const c = new THREE.Color(hex ?? 0x1c1a1a); const hsl = c.getHSL({}); return hsl.s > 0.35 && hsl.l > 0.12 ? c : null; };
function domaruMaterial(look, noHead = false) {
  const lace = new THREE.Color(look.lace ?? 0x2e3a52);
  const blueLace = lace.b > lace.r * 1.15 && lace.b > lace.g;
  const tint = armorTint(look.armor);
  const k = (blueLace ? 'blue' : lace.getHex()) + '|' + (tint ? tint.getHex() : 0) + (noHead ? '|nh' : '');
  if (dmMats.has(k)) return dmMats.get(k);
  // 両面で描き、裏（甲冑の内側）は暗く塗る：腕を上げた時の脇など、スキャンに写っていない所が、抜けずに暗い隙間に見える
  const m = new THREE.MeshStandardMaterial({ map: DM.col, normalMap: DM.nrm, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.55, metalness: 0.15, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const U = { uLace: { value: lace }, uLaceAmt: { value: blueLace ? 0 : 1 }, uArm: { value: tint || new THREE.Color(0) }, uArmAmt: { value: tint ? 1 : 0 } };
  const hi = DM.bones.indexOf('Head'), ni = DM.bones.indexOf('Neck');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (noHead) {
      sh.vertexShader = 'varying float vHd;\n' + sh.vertexShader.replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
        vHd = 0.0;
        for (int i = 0; i < 4; i++) { float bi = skinIndex[i]; if (abs(bi - ${hi}.0) < 0.5) vHd += skinWeight[i]; }`);
      sh.fragmentShader = 'varying float vHd;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (vHd > 0.5) discard;');
    }
    sh.fragmentShader = 'uniform vec3 uLace, uArm;\nuniform float uLaceAmt, uArmAmt;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // スキャンの絵は博物館の暗い照明で撮られているので、少し明るく戻す
        diffuseColor.rgb = min(diffuseColor.rgb * 1.55, vec3(1.0));
        vec3 c = diffuseColor.rgb;
        float blue = smoothstep(1.08, 1.45, c.b / (max(c.r, c.g) + 0.002)) * smoothstep(0.003, 0.012, c.b) * uLaceAmt;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), ll = dot(uLace, vec3(0.2126, 0.7152, 0.0722));
        // 黒い漆（暗く、色の薄い所）
        float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / (max(c.r, max(c.g, c.b)) + 0.01);
        float lac = smoothstep(0.2, 0.06, l) * smoothstep(0.55, 0.2, sat) * uArmAmt * (1.0 - blue);
        vec3 armC = uArm * (0.55 + l * 5.0);
        diffuseColor.rgb = mix(c, uLace * min(3.0, l / max(ll, 0.002)) * 1.2, blue);
        diffuseColor.rgb = mix(diffuseColor.rgb, armC, lac);
        if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.012, 0.01, 0.009);
      }`);
  };
  m.customProgramCacheKey = () => 'domaru' + (noHead ? '-nh' : '');
  dmMats.set(k, m);
  return m;
}
// 骨の入った人に本物の胴丸を着せる（顔も手も人形の物を使う）。noHead の時は兜と顔を描かない
function dressDomaru(h, noHead = false) {
  // 元の体は隠す（現代の服の膨らみが甲冑の外へ出るので）。脇の、スキャンに写っていない所は、甲冑の裏（暗い）が見える
  h.body.visible = false;
  const sk = new THREE.Skeleton(DM.bones.map((nm) => h.bones[nm]), domaruInverses());
  const m = new THREE.SkinnedMesh(DM.hi, domaruMaterial(h.look, noHead));
  m.bind(sk, new THREE.Matrix4());
  m.castShadow = true; m.receiveShadow = true;
  m.frustumCulled = true; m.boundingSphere = BSPH;
  // 遠くは軽い形（影を描く時も軽い形）
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const want = !cam.isOrthographicCamera && d2 < DOMARU.near * DOMARU.near ? DM.hi : DM.lo;
    if (m.geometry !== want) m.geometry = want;
  };
  h.root.add(m);
  h.parts.domaru = m;
}
// 本陣の飾り甲冑：飾り台に据えた胴丸（台・人形・槍ごと。約1万2千面）。読み込みを待ってから返す
// 使い方：const g = await displayArmor(); g.position.set(x, 地面の高さ, z); g.rotation.y = 向き; scene.add(g)
export async function displayArmor({ scale = 1 } = {}) {
  await loadDomaru();
  if (!DM) return null;
  const g = new THREE.Group();
  const m = new THREE.Mesh(DM.stand, domaruMaterial({}));
  // 形は人形の足の裏が 0。台の底（約 -0.4m）を地面に
  DM.stand.computeBoundingBox();
  m.position.y = -DM.stand.boundingBox.min.y;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.scale.setScalar(scale);
  return g;
}

// ---------------- 実写の顔 ----------------
function prepHead(gl, col, nrm, spec) {
  let mesh = null;
  gl.scene.traverse((o) => { if (o.isMesh) mesh = o; });
  // 首の下（胸と肩）を切り落とし、頭と首だけにする
  const g0 = mesh.geometry;
  const pos = g0.attributes.position, idx = g0.index;
  const keep = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    if (pos.getY(a) > -1.9 && pos.getY(b) > -1.9 && pos.getY(c) > -1.9) keep.push(a, b, c);
  }
  const g = g0.clone(); g.setIndex(keep);
  g.computeTangents?.();
  // 大きさ：頭の高さ（顎〜頭頂 約 4.3）を本編の頭（約 0.25m）に
  HEAD = { geo: g, col, nrm, spec, k: 0.058 };
}
// 顔の絵：日焼けの色を掛け、月代・髭（無精髭・口髭・顎髭）を描き、閉じたまぶたに目の線
const headMats = new Map();
function headMaterial(key, look, F) {
  if (headMats.has(key)) return headMats.get(key);
  // 名のある武将（g:）と本人は細かく描き、髭と眉は一本ずつの毛で描く
  const named = key === 'player' || String(key).startsWith('g:');
  const img = HEAD.col.image, N = named ? 1024 : 512;
  const c = document.createElement('canvas'); c.width = c.height = N;
  let g = c.getContext('2d');
  g.drawImage(img, 0, 0, N, N);
  // 日焼け：肌の色を掛ける
  const sk = new THREE.Color(look.skin || 0xb58c68).getHSL({});
  // 写真の肌（明るめの白人の肌）を、日焼けした色へ寄せる：少し暗く、黄みと赤みを足す
  const tn = new THREE.Color().setHSL(0.075, 0.45, 0.5 + (sk.l - 0.4) * 0.6);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${Math.min(255, 140 + tn.r * 110) | 0},${Math.min(255, 150 + tn.g * 115) | 0},${Math.min(255, 145 + tn.b * 110) | 0})`;
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'source-over';
  // 三角形ごとに、その場所（頭の座標）で髪・髭・目の濃さを決めて、絵の上に塗る
  const geo = HEAD.geo, pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  const hair = new THREE.Color(F.hair || 0x15110d);
  const hs = `${(hair.r * 255) | 0},${(hair.g * 255) | 0},${(hair.b * 255) | 0}`;
  const t = F.t ?? 1;
  let stub = [0.12, 0.35, 0.45, 0.35, 0.35, 0.3, 0.4, 0.3][t] * (named ? 0.6 : 1), mus = [3, 4, 5, 6, 7].includes(t), goat = [4, 6].includes(t), full = [5, 7].includes(t);
  // 名のある武将：髭の形と量は人ごと（F.beard。無ければ模様の番号から）。黒く塗った塊にせず、薄い影と細い毛の房で描く
  const BD = named ? { mus: mus ? 0.7 : 0, musW: 1, musH: 1, droop: 0.4, goat: goat || full ? 0.7 : 0, goatW: 1, side: full ? 0.7 : 0, stub: 1, ...(F.beard || {}) } : null;
  if (BD) { stub *= BD.stub; mus = BD.mus > 0.02; goat = BD.goat > 0.02; full = BD.side > 0.02; }
  const age = F.age ?? (t >= 6 ? 58 : t >= 3 ? 42 : 28), old = Math.max(0, Math.min(1, (age - 28) / 32));
  const rnd = (() => { let a = 99 + (named ? String(key).length * 7 + (F.w || 1) * 1000 : 0); return () => ((a = (Math.floor(a) * 16807) % 2147483647) / 2147483647); })();
  // 名のある武将の肌：色むら・日焼け・しわ（tone）と、汗の照り（rough）の絵
  const tone = named ? document.createElement('canvas') : null, rough = named ? document.createElement('canvas') : null;
  let tg = null, rg = null;
  if (named) {
    tone.width = tone.height = N; tg = tone.getContext('2d');
    rough.width = rough.height = 256; rg = rough.getContext('2d'); rg.fillStyle = 'rgb(140,140,140)'; rg.fillRect(0, 0, 256, 256);
  }
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  // 髭や髪は別の絵に塗ってから、ぼかして重ねる（三角の角が見えないように）
  const face = g;
  const strands = [];
  const ov = document.createElement('canvas'); ov.width = ov.height = N;
  g = ov.getContext('2d');
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), cc = idx.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(cc)) / 3, y = (pos.getY(a) + pos.getY(b) + pos.getY(cc)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(cc)) / 3;
    let al = 0, colr = hs;
    const th = Math.atan2(x, z);
    // 月代（額の上から頭頂は剃ってある：青く）
    if (y > 2.75 && Math.abs(th) < 1.9) { al = 0.22; }
    // 横と後ろの髪（耳の上から後ろ）
    if ((Math.abs(th) > 1.75 && y > 0.6) || (Math.abs(th) > 1.35 && y > 1.5 && y < 3.2)) al = 0.92;
    // 僧は頭を剃る（剃り跡の青さだけ）
    if (look.monk && y > 0.6 && (Math.abs(th) > 1.35 || y > 2.75)) al = 0.2;
    // 髭の生える所：頬の下・顎・口の周り
    const face = z > 0.6 && y < 1.05 && y > -1.3 && Math.abs(x) < 2.6;
    if (face && !(y > 0.25 && y < 0.72 && Math.abs(x) < 0.55 && z > 1.8)) al = Math.max(al, stub * (0.6 + rnd() * 0.4));
    let inMus = mus && y > 0.72 && y < 1.02 && Math.abs(x) < 0.85 && z > 1.7;
    let inGoat = goat && y < 0.1 && Math.abs(x) < 0.7 && z > 1.2;
    let inSide = full && face && (y < 0.3 || Math.abs(x) > 0.8);
    if (BD) {
      // 口髭：幅（musW）・厚み（musH）・端の垂れ（droop）。鼻の下の真ん中は薄く
      const x0 = Math.abs(x + 0.09), dx = x0 / (0.8 * BD.musW);
      const yc = 0.8 - BD.droop * 0.26 * dx * dx, hh = 0.12 * BD.musH * (1 - 0.45 * dx * dx);
      inMus = mus && dx < 1 && Math.abs(y - yc) < hh && z > 1.6;
      inGoat = goat && y < 0.12 && x0 < 0.62 * BD.goatW * (0.6 + 0.4 * Math.min(1, (0.12 - y) / 0.6)) && z > 1.1;
      inSide = full && face && (x0 > 0.8 || y < 0.3) && !(y > 0.25 && y < 0.72 && x0 < 0.6 && z > 1.8);
      const dens = inMus ? BD.mus : inGoat ? BD.goat : inSide ? BD.side : 0;
      if (dens > 0) al = Math.max(al, 0.1 + 0.22 * dens);   // 毛の下の肌の薄い影
    } else {
      if (inMus) al = Math.max(al, 0.85);
      if (inGoat) al = Math.max(al, 0.85);
      if (inSide) al = Math.max(al, 0.82);
    }
    if (named) {
      // 肌の色むら：鼻・頬の赤み、額・鼻筋・頬骨の日焼け、目の下の影。年ごとのしわ（額の横じわ・目尻・ほうれい線）
      const x0 = Math.abs(x + 0.09), fr = z > 0.8 ? Math.min(1, (z - 0.8) / 0.9) : 0;
      if (fr > 0) {
        const red = 0.1 * Gs(x0, y - 1.15, 0.28, 0.35) + 0.08 * Gs(x0 - 1.1, y - 1.05, 0.35, 0.35) + 0.03 * rnd();
        const sun = 0.12 * Gs(x0, y - 2.35, 0.9, 0.45) + 0.1 * Gs(x0, y - 1.5, 0.22, 0.5) + 0.07 * Gs(x0 - 1.2, y - 1.35, 0.3, 0.25);
        const bag = (0.05 + 0.1 * old) * Gs(x0 - 0.62, y - 1.46, 0.28, 0.08);
        let wr = 0;
        if (y > 2.15 && y < 2.85 && x0 < 1.25) wr += (0.04 + 0.16 * old) * Math.pow(Math.abs(Math.cos((y - 2.15) * Math.PI * 2.4)), 14) * (1 - x0 / 1.3);
        { const a = Math.atan2(y - 1.72, x0 - 0.98), d = Math.hypot(y - 1.72, x0 - 0.98); if (x0 > 1.0 && d < 0.42) wr += 0.22 * old * Math.pow(Math.abs(Math.cos(a * 5)), 10) * (1 - d / 0.42); }
        { const ax = 0.42, ay = 1.12, bx = 0.82, by = 0.32; const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy; const q = Math.max(0, Math.min(1, ((x0 - ax) * vx + (y - ay) * vy) / L2)); const d = Math.hypot(x0 - ax - vx * q, y - ay - vy * q); wr += (0.1 + 0.2 * old) * Math.exp(-(d * d) / (2 * 0.045 * 0.045)); }
        const pc = (r, g_, b, a) => { if (a < 0.005) return; tg.fillStyle = `rgba(${r},${g_},${b},${Math.min(0.6, a * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a_) * N, uv.getY(a_) * N); tg.lineTo(uv.getX(b_) * N, uv.getY(b_) * N); tg.lineTo(uv.getX(c_) * N, uv.getY(c_) * N); tg.closePath(); tg.fill(); };
        const a_ = a, b_ = b, c_ = cc;
        // 唇：写真の赤い唇を、日焼けした肌に近い色へ寄せる
        const lip = Gs(x0 / 0.65, (y - 0.22) / 0.36, 1, 1) * (z > 1.6 ? 1 : 0);
        pc(150, 60, 45, red); pc(95, 55, 30, sun); pc(70, 40, 35, bag); pc(55, 32, 24, wr); pc(128, 88, 66, 0.85 * lip);
        // 汗の照り：額・鼻筋・頬骨は滑らか、髭の所は荒い
        const sh = Gs(x0, y - 2.3, 0.8, 0.35) + Gs(x0, y - 1.35, 0.2, 0.4) + 0.6 * Gs(x0 - 1.15, y - 1.35, 0.25, 0.2);
        const rv = Math.round(Math.max(60, Math.min(220, 140 - 80 * Math.min(1, sh) + (inMus || inGoat || inSide ? 60 : 0))));
        rg.fillStyle = `rgb(${rv},${rv},${rv})`; rg.beginPath(); rg.moveTo(uv.getX(a) * 256, uv.getY(a) * 256); rg.lineTo(uv.getX(b) * 256, uv.getY(b) * 256); rg.lineTo(uv.getX(cc) * 256, uv.getY(cc) * 256); rg.closePath(); rg.fill();
      }
    }
    // 眉を濃く
    let brow = false;
    for (const sd of [-1, 1]) { const dx = (x - sd * 0.7) / 0.6, dy = (y - 2.02 + Math.abs(x) * 0.05) / 0.11; if (z > 1.5 && dx * dx + dy * dy < 1) { al = Math.max(al, 0.7); brow = true; } }
    if (al <= 0.01) continue;
    // 毛の向き（頭の座標）：口髭は下と外へ、顎髭は下へ、頬の髭は下と前へ、眉は外へ
    if (named) {
      const isMus = inMus;
      const isBeard = inGoat || inSide;
      if (isMus || isBeard || brow) {
        const sx = Math.sign(x + 0.09) || 1;
        const D = brow ? [sx, 0.12, 0] : isMus ? [sx * 0.8, -0.55 - 0.4 * BD.droop, 0.1] : [sx * (inSide && !inGoat ? 0.3 : 0.12), -1, 0.25];
        // 毛の房：長さと濃さは髭の量で（薄い髭は短く疎ら）
        const dens = brow ? 1 : isMus ? BD.mus : inGoat ? BD.goat : BD.side;
        strands.push([a, b, cc, D, brow ? 0.28 : (isMus ? 0.3 : 0.42) * (0.6 + 0.5 * dens), brow ? 0.9 : 0.35 + 0.4 * dens, brow ? 1 : dens]);
        al *= brow ? 0.35 : 1;
      }
    }
    g.fillStyle = `rgba(${colr},${al})`;
    g.beginPath();
    g.moveTo(uv.getX(a) * N, uv.getY(a) * N); g.lineTo(uv.getX(b) * N, uv.getY(b) * N); g.lineTo(uv.getX(cc) * N, uv.getY(cc) * N);
    g.closePath(); g.fill();
  }
  face.filter = `blur(${N / 400}px)`;
  face.drawImage(ov, 0, 0);
  // 肌の色むら・日焼け・しわ（ぼかして重ねる）
  if (tg) { face.filter = `blur(${N / 300}px)`; face.drawImage(tone, 0, 0); }
  face.filter = 'none';
  // 無精髭の粒
  face.globalAlpha = named ? 0.15 : 0.25; face.drawImage(ov, 0, 0); face.globalAlpha = 1;
  // 一本ずつの毛：三角の中の点から、毛の向き（頭の座標）を絵の上の向きに直して短い線を引く
  if (strands.length) {
    face.lineCap = 'round';
    const P3 = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)], T2 = (i) => [uv.getX(i) * N, uv.getY(i) * N];
    for (const [a, b, cc, D, len, am, dens = 1] of strands) {
      const pa = P3(a), pb = P3(b), pc = P3(cc), ta = T2(a), tb = T2(b), tc = T2(cc);
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
      const L = Math.hypot(D[0], D[1], D[2]), Dn = D.map((v) => (v / L) * len);
      const r1 = Dn[0] * e1[0] + Dn[1] * e1[1] + Dn[2] * e1[2], r2 = Dn[0] * e2[0] + Dn[1] * e2[1] + Dn[2] * e2[2];
      const det = d11 * d22 - d12 * d12;
      if (Math.abs(det) < 1e-9) continue;
      const al_ = (r1 * d22 - r2 * d12) / det, be = (r2 * d11 - r1 * d12) / det;
      let du = al_ * (tb[0] - ta[0]) + be * (tc[0] - ta[0]), dv = al_ * (tb[1] - ta[1]) + be * (tc[1] - ta[1]);
      const dl = Math.hypot(du, dv);
      if (dl > N * 0.03) { du *= N * 0.03 / dl; dv *= N * 0.03 / dl; }
      const area = Math.abs((tb[0] - ta[0]) * (tc[1] - ta[1]) - (tc[0] - ta[0]) * (tb[1] - ta[1])) / 2;
      const n = Math.min(60, Math.ceil((area / 5) * (0.35 + 0.9 * dens)));
      for (let k = 0; k < n; k++) {
        let p = rnd(), q = rnd(); if (p + q > 1) { p = 1 - p; q = 1 - q; }
        const px = ta[0] + p * (tb[0] - ta[0]) + q * (tc[0] - ta[0]), py = ta[1] + p * (tb[1] - ta[1]) + q * (tc[1] - ta[1]);
        const j = 0.6 + rnd() * 0.7, bend = (rnd() - 0.5) * 0.5;
        // 毛の色は一本ずつ少し違う（年寄りは白い毛が混じる）
        const grey = rnd() < old * 0.45 ? '150,142,130' : hs;
        face.strokeStyle = `rgba(${grey},${am * (0.35 + rnd() * 0.65)})`;
        face.lineWidth = 0.45 + rnd() * 0.55;
        face.beginPath(); face.moveTo(px, py);
        face.quadraticCurveTo(px + du * j * 0.5 - dv * bend * 0.3, py + dv * j * 0.5 + du * bend * 0.3, px + du * j, py + dv * j);
        face.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let rTex = null;
  if (rough) { rg.filter = 'blur(3px)'; rg.drawImage(rough, 0, 0); rTex = new THREE.CanvasTexture(rough); rTex.flipY = false; }
  const m = new THREE.MeshPhysicalMaterial({
    map: tex, normalMap: HEAD.nrm, normalScale: new THREE.Vector2(0.8, 0.8), roughness: rTex ? 0.95 : 0.52, roughnessMap: rTex, metalness: 0,
    specularIntensityMap: HEAD.spec, specularIntensity: 0.6, sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x6a4a3c),
  });
  // 表面下散乱の近似：光の当たらない側にも、赤みのある光が少し回り込む
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.07, 0.035, 0.025) * (1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0));`);
  };
  headMats.set(key, m);
  return m;
}
// 実写の頭の形（顔の形の値で少し変える：幅・えら・大きさ）
const headGeos = new Map();
function headGeo(key, F) {
  if (headGeos.has(key)) return headGeos.get(key);
  const g = HEAD.geo.clone();
  const p = g.attributes.position;
  const w = F.w || 1, jaw = F.jaw || 1;
  // 顔の彫り（名のある武将ほど強く）：頬骨・頬のこけ・鼻の高さと幅・眉の張り・目の間隔・年の頬の下がり
  const kk = String(key).startsWith('g:') || key === 'player' ? 1 : 0.6;
  const cheek = (F.cheek ?? 1) - 1, gaunt = (F.gaunt ?? 0.5) - 0.5, nose = (F.nose ?? 1) - 1, nw = (F.nw ?? 1) - 1, brow = (F.brow ?? 1) - 1, esp = (F.esp ?? 1) - 1;
  const old = Math.max(0, Math.min(1, ((F.age ?? (F.t >= 6 ? 58 : 35)) - 30) / 30));
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const low = Math.min(1, Math.max(0, (1.2 - y) / 2.2));
    const xc = x + 0.09, x0 = Math.abs(xc), sx = Math.sign(xc) || 1;
    const fr = z > 0.8 ? Math.min(1, (z - 0.8) / 1.0) : 0;
    x *= w * (1 + (jaw - 1) * 0.35 * low);
    z *= 1 + (F.chin - 1 || 0) * 0.05 * low;
    if (fr > 0) {
      const cb = Gs(x0 - 1.25, y - 1.25, 0.35, 0.33) * fr;
      x += sx * cheek * 0.4 * cb * kk; z += cheek * 0.18 * cb * kk;
      const gh = Gs(x0 - 1.05, y - 0.4, 0.32, 0.35) * fr;
      x -= sx * gaunt * 0.16 * gh * kk; z -= gaunt * 0.08 * gh * kk;
      const nz = Gs(xc, y - 1.25, 0.32, 0.5) * (z > 1.8 ? Math.min(1, (z - 1.8) / 0.4) : 0);
      z += nose * 0.9 * nz * kk; x += xc * nw * 0.6 * nz * kk;
      const bz = Gs(x0 - 0.65, y - 2.05, 0.5, 0.18) * fr;
      z += brow * 0.25 * bz * kk;
      const ez = Gs(x0 - 0.6, y - 1.72, 0.38, 0.32) * fr;
      x += sx * esp * 0.6 * ez;
      const jw = Gs(x0 - 0.95, y + 0.15, 0.45, 0.5) * fr;
      y -= old * 0.12 * jw; x += sx * old * 0.05 * jw;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  headGeos.set(key, g);
  return g;
}

// 開いた目：スキャンの顔は目を閉じているので、まぶたの上に白目・黒目・上まぶた・まつげの影を置く（スキャンの頭の座標で）
const EYE = { geo: null, mats: null };
function addEyes(hm, F) {
  if (!EYE.geo) {
    const white = new THREE.SphereGeometry(1, 16, 10); white.scale(0.25, 0.085, 0.06);
    const iris = new THREE.SphereGeometry(1, 12, 8); iris.scale(0.1, 0.095, 0.03);
    const pupil = new THREE.SphereGeometry(1, 8, 6); pupil.scale(0.042, 0.042, 0.012);
    const lid = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); lid.scale(0.29, 0.07, 0.085);
    const lash = new THREE.TorusGeometry(1, 0.06, 4, 16, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
    const lower = new THREE.TorusGeometry(1, 0.1, 4, 14, Math.PI * 0.8); lower.rotateZ(Math.PI * 1.1); lower.scale(0.24, 0.07, 0.06);
    EYE.geo = { white, iris, pupil, lid, lash, lower };
    EYE.mats = {
      white: new THREE.MeshStandardMaterial({ color: 0xb4a898, roughness: 0.18 }),
      iris: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.15 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.1 }),
      lash: new THREE.MeshStandardMaterial({ color: 0x0e0906, roughness: 0.9 }),
    };
  }
  const skinM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9a6c50), roughness: 0.55 });
  const w = F.w || 1, open = 1 / (F.eye || 1), esp = (F.esp ?? 1) - 1;
  for (const cx of [-0.69, 0.51]) {
    const g = new THREE.Group();
    g.position.set(cx * w + Math.sign(cx + 0.09) * esp * 0.6, 1.72, 1.965);
    g.rotation.y = (cx < -0.09 ? -1 : 1) * 0.22;
    const add = (geo, mat, x, y, z, sy = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m; };
    add(EYE.geo.white, EYE.mats.white, 0, 0, 0, open);
    add(EYE.geo.iris, EYE.mats.iris, 0.01, 0.006, 0.045, open);
    add(EYE.geo.pupil, EYE.mats.pupil, 0.01, 0.006, 0.068, open);
    add(EYE.geo.lid, skinM, 0, 0.04 + 0.02 * (1 - open), -0.004);
    add(EYE.geo.lash, EYE.mats.lash, 0, 0.018, 0.012, open);
    add(EYE.geo.lower, skinM, 0, -0.012, 0.004, open);
    hm.add(g);
  }
}

// ---------------- 人を作る ----------------
// 部品を骨に付ける。体の座標（立ち姿）で作った部品を、その骨の立ち姿の位置に合わせて置く
function boneOf(h, nm) { return h.bones[nm]; }
function restMatrix(nm) {
  // 骨の立ち姿の行列（人の根元の座標）。人を作るたびに同じなので覚えておく
  if (!SRC.restM) SRC.restM = {};
  if (SRC.restM[nm]) return SRC.restM[nm];
  const t = SRC.template;
  const b = t.bones[nm];
  const M = new THREE.Matrix4().copy(t.root.matrixWorld).invert().multiply(b.matrixWorld);
  SRC.restM[nm] = M;
  return M;
}
// fit：体の座標 → 人の根元の座標（胴や頭の大きさの差を埋める）
function attachBody(h, nm, geo, fit, mat = UNIT_MAT) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const M = new THREE.Matrix4().copy(restMatrix(nm)).invert().multiply(fit);
  m.matrixAutoUpdate = false;
  m.matrix.copy(M);
  m.frustumCulled = false;
  h.bones[nm].add(m);
  return m;
}
// 腕・脚の部品：関節を原点に下（-y）へ伸びる形を、骨の向きと長さに合わせる行列（体の座標 → 人の根元の座標）
function limbFit(nm, childNm, canonLen, radial = 1, lift = 0) {
  const R = SRC.rest, a = R[nm], b = R[childNm];
  const d = v0.copy(b).sub(a); const L = d.length(); d.normalize();
  const f = v1.set(0, 0, 1); f.sub(v2.copy(d).multiplyScalar(f.dot(d))).normalize();
  // 形の座標の軸（右 x・下 -y・前 z）を、骨の向き（-y → d）と前（z → f）へ
  const up = d.clone().negate(), fwd = f.clone(), right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
  const S = new THREE.Matrix4().makeScale(radial, canonLen ? L / canonLen : 1, radial);
  return new THREE.Matrix4().makeTranslation(a.x, a.y, a.z).multiply(basis).multiply(S).multiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
}
// 胴まわり（本編の胸 1.15・首 1.46 を、この体の胸と首へ）と頭の行列。どの人も同じなので一度だけ作る
function fits() {
  if (SRC.fitT) return SRC;
  const R = SRC.rest, RD = SRC.radius;
  const chest = RD.Spine2 || { mx: 0.2, mz: 0.15 };
  const sx = Math.max(1, (chest.mx * 1.08) / 0.25), sz = Math.max(1, (chest.mz * 1.1) / 0.2);
  const neck = R.Neck, hipC = R.Hips;
  const sy = (neck.y - hipC.y) / (1.46 - 0.84);
  // 胴の上端（肩上）が首の付け根より少し下に来るように（首が短い体でも、胴の縁が顎にかからない）
  SRC.fitT = new THREE.Matrix4().makeTranslation(neck.x, neck.y - 0.035, (RD.Spine2 ? RD.Spine2.cz * 0.5 : 0) + R.Spine2.z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz)).multiply(new THREE.Matrix4().makeTranslation(0, -1.46, 0));
  SRC.fitTi = SRC.fitT.clone().invert();
  const hd = R.Head;
  SRC.fitH = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeTranslation(0, -1.52, 0.0));
  return SRC;
}

// 兵の見分け：僧兵（裹頭・墨染めの衣・袈裟・薙刀）。look.sohei か、比叡山の僧兵の装い（白い衣に鉢巻）
export const isSohei = (L) => !!L && (!!L.sohei || L.hat === 'kato' || (L.hat === 'hachimaki' && L.cloth === 0xd8d2c2));
const isNamed = (L) => typeof L.face === 'string' && L.face.startsWith('g:');

// 人の作り方の段
// ・本人：部品を骨ごとに付ける（草摺・袖が揺れる、実写の顔）
// ・名のある武将：本物の胴丸（3Dスキャン）と実写の顔
// ・兵：甲冑の部品を一つの骨入りの形にまとめる（一人を描く回数が体と甲冑の二回で済む）。近くでは実写の顔に替える
export function makeHuman(u, look0) {
  let look = look0;
  const sohei = isSohei(look0);
  // 足軽は籠手なし（手甲だけ）
  if (!look.hero && (look.tier ?? 0) === 0 && look.kote == null && !isNamed(look)) look = { ...look, kote: 0 };
  // 目の下頬は、実写の顔に沿わせて作る（兜の形の面は喉の垂だけにする。兵は近くで実写の顔に替えた時に付ける）
  if (look.menpo && look.menpoStyle === 'hanbo' && !sohei) look = { ...look, menpoStyle: 'tare', menpoScan: look.menpo };
  // 僧兵：墨染めの直綴に五条袈裟、頭は裹頭（数人に一人は鉢巻か兜）。衣と袈裟の形は units.js の soheiLook・soheiBody
  if (sohei) look = soheiLook({ ...look, sohei: 1 });
  const P = lookParts(look);
  const L = P.look;
  L.sohei = sohei;
  const root = new THREE.Group();
  const model = skClone(SRC.scene);
  model.scale.set(SRC.kH, SRC.kH, -SRC.kH);
  root.add(model);
  const bones = {};
  let body = null;
  model.traverse((o) => { if (o.isBone || /^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, '')] = o; if (o.isSkinnedMesh && /Mesh/.test(o.name)) body = o; if (o.isSkinnedMesh && /visor/i.test(o.name)) o.visible = false; });
  body.material = bodyMaterial(L);
  body.castShadow = true;
  body.frustumCulled = true;
  const h = { u, root, model, bones, body, look: L, parts: {}, seed: (u.id || 1) * 0.6180339 % 1, mode: 'crowd' };
  // 型（立ち姿の骨の行列を測るため）を一度だけ作る
  if (!SRC.template) {
    const tr = new THREE.Group(); const tm = skClone(SRC.scene); tm.scale.set(SRC.kH, SRC.kH, -SRC.kH); tr.add(tm);
    const tb = {}; tm.traverse((o) => { if (o.isBone) tb[o.name.replace(/^mixamorig:?/, '')] = o; });
    tr.updateMatrixWorld(true);
    SRC.template = { root: tr, bones: tb };
  }
  fits();
  h.domaru = DOMARU.ready && wantsDomaru(L);
  // 名のある武将：胴丸の人形の兜と顔は描かず、その人の兜・顔・陣羽織・母衣・腰の刀を付ける
  if (h.domaru) { h.mode = 'full'; const nd = isNamed(L); dressDomaru(h, nd); if (nd) dressNamed(h, P, L); }
  else if (L.hero || u.isPlayer) { h.mode = 'full'; dressParts(h, P, L); }
  else if (DOMARU.ready && crowdDomaru(L)) { h.domaru = true; dressDomaru(h, true); dressCrowd(h, P, L, DM_KEEP, look); }
  else dressCrowd(h, P, L, null, look);
  if (sohei) naginata(u);
  // 動き
  const mixer = new THREE.AnimationMixer(model);
  const act = {};
  for (const k of ['idle', 'walk', 'run']) { act[k] = mixer.clipAction(SRC.anims[k]); act[k].play(); act[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  act.idle.time = Math.random() * 3; act.walk.time = Math.random(); act.run.time = Math.random();
  // 待つ間の息づかいの速さは人ごとに少し違う
  act.idle.timeScale = 0.8 + h.seed * 0.4;
  h.mixer = mixer; h.act = act; h.w = { idle: 1, walk: 0, run: 0 };
  h.last = new THREE.Vector3().copy(u.pos || new THREE.Vector3()); h.spd = 0;
  h.acc = 0;
  return h;
}

// 部品の置き方（本人の組み方と兵のまとめ方で同じ）：put(名, 骨, 形, 行列)
function layParts(P, L, put) {
  const R = SRC.rest, RD = SRC.radius;
  const { fitT, fitH } = SRC;
  put('torso', 'Spine1', P.torso, fitT);
  // 草摺は腰に。陣羽織・母衣・袖は胸に（袖は肩から紐で吊るすので、胴について行き、腕を上げても顔の横へ立たない）
  put('hips', 'Hips', P.hips, fitT);
  put('haori', 'Spine2', P.haori, fitT);
  put('back', 'Spine2', P.back, fitT);
  // 腰の刀は胴の下の骨に（録った動きの腰の骨は大きくひねっているので、腰の骨に付けると刀が横へ突き出る）
  put('koshi', 'Spine1', P.koshi, fitT);
  put('sodeP', 'Spine2', P.sodeP, fitT);
  put('sodeN', 'Spine2', P.sodeN, fitT);
  // 裹頭は実写の顔に合わせて下で作る（units.js の遠目の裹頭は使わない）
  put('hat', 'Head', L.sohei && L.hat === 'kato' ? null : P.head, fitH);
  put('face', 'Head', P.face, fitH);
  // 腕：籠手（二の腕・前腕・手甲）。+x が本編の「右手」（槍を持つ手）
  const rA = (nm, ours) => Math.max(1, ((RD[nm] || { r: ours }).r * 1.12) / ours);
  for (const [sd, side] of [[1, 'Right'], [-1, 'Left']]) {
    const S_ = sd > 0 ? 'P' : 'N';
    put('upper' + S_, side + 'Arm', P['upper' + S_], limbFit(side + 'Arm', side + 'ForeArm', 0.27, rA(side + 'Arm', 0.058)));
    put('fore' + S_, side + 'ForeArm', P['fore' + S_], limbFit(side + 'ForeArm', side + 'Hand', 0.23, rA(side + 'ForeArm', 0.05), 0.27));
    put('hand' + S_, side + 'Hand', P['hand' + S_], limbFit(side + 'Hand', side + 'HandMiddle1', 0, 1, 0.5));
    put('thigh' + S_, side + 'UpLeg', P.thigh, limbFit(side + 'UpLeg', side + 'Leg', 0.4, rA(side + 'UpLeg', 0.11)));
    put('leg' + S_, side + 'Leg', P.leg, limbFit(side + 'Leg', side + 'Foot', 0.3, rA(side + 'Leg', 0.078)));
  }
  // 足：足首を原点に（本編の脛の座標で足首は y=-0.3）
  for (const side of ['Left', 'Right']) {
    const a = R[side + 'Foot'];
    put('foot' + side, side + 'Foot', P.foot, new THREE.Matrix4().makeTranslation(a.x, a.y + 0.3 - 0.02, a.z));
  }
  // 僧兵：裹頭（袈裟と衣は胴まわりの部品に入っている）
  if (L.sohei && L.hat === 'kato') put('kato', 'Head', soheiKato(L), fitH);
}

// 本人：units.js と同じ甲冑の部品を骨ごとに付ける
function dressParts(h, P, L) {
  const named = L.hero || isNamed(L);
  layParts(P, L, (k, nm, geo, fit) => {
    // 顔：本人と名のある武将は実写の顔
    if (k === 'face' && named && HEAD) { h.parts.face = scanFace(h, L.hero ? 'player' : L.face, L, P.F, true); return; }
    h.parts[k] = attachBody(h, nm, geo, fit);
  });
}

// ---- 名のある武将：本物の胴丸の上に、その人の兜・実写の顔・陣羽織（背に家紋）・母衣・太刀と脇差 ----
const NAMED_KEEP = new Set(['hat', 'haori', 'back', 'koshi']);
function dressNamed(h, P, L) {
  layParts(P, L, (k, nm, geo, fit) => {
    if (k === 'face') { if (HEAD) { h.parts.face = scanFace(h, L.face, L, P.F, true); if (L.menpoScan) scanMenpo(h.parts.face, L.face, L.menpoScan); } return; }
    // 兜は少し深くかぶる（眉庇が眉の上に来るように）
    if (k === 'hat') fit = fit.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.028, 0.004));
    if (NAMED_KEEP.has(k)) h.parts[k] = attachBody(h, nm, geo, fit);
  });
  h.F = P.F;
  // 陣羽織の背の家紋（絵の一枚にない家の紋も描けるよう、武将ごとに小さな絵を作る）
  const hp = h.parts.haori;
  const gd = GENERALS[L.face.slice(2)] || {};
  const mon = gd.mon || L.mon;
  if (hp && mon && mon !== 'none') {
    const dm = monDecal(mon, L.haoriMonCol || 0xe6dfcf);
    if (dm) { dm.castShadow = false; hp.add(dm); h.parts.mon = dm; }
  }
}
// 家紋の絵：旗の絵（textures.js）から紋の形だけを抜き、紋の色で塗る
const monMats = new Map();
let MON_GEO = null;
function monDecal(kind, col) {
  const key = kind + '|' + col;
  if (!monMats.has(key)) {
    const W = 256, H = 400, cy = Math.round(H * 0.32);
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sg = src.getContext('2d');
    drawMon(sg, kind, W, H);
    const d = sg.getImageData(0, cy - 128, W, 256).data;
    // 地の色（四隅）から離れた所が紋
    const bg = [d[(10 * W + 128) * 4], d[(10 * W + 128) * 4 + 1], d[(10 * W + 128) * 4 + 2]];
    const out = document.createElement('canvas'); out.width = out.height = 256;
    const og = out.getContext('2d'), img = og.createImageData(256, 256);
    const c = new THREE.Color(col);
    let n = 0;
    for (let i = 0; i < 256 * 256; i++) {
      const x = i % 256;
      const dd = Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]);
      const a = x < 20 ? 0 : Math.min(255, Math.max(0, (dd - 60) * 3));
      if (a > 128) n++;
      img.data[i * 4] = c.r * 255; img.data[i * 4 + 1] = c.g * 255; img.data[i * 4 + 2] = c.b * 255; img.data[i * 4 + 3] = a;
    }
    og.putImageData(img, 0, 0);
    if (n < 200) { monMats.set(key, null); return null; }
    const tex = new THREE.CanvasTexture(out); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const gold = c.r > 0.6 && c.b < 0.45;
    monMats.set(key, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: gold ? 0.35 : 0.85, metalness: gold ? 0.7 : 0, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  }
  const mat = monMats.get(key);
  if (!mat) return null;
  if (!MON_GEO) {
    // 陣羽織（units.js の形）の背の外側に、少し浮かせて貼る（体の座標。武将の体つき 1.08）
    const r0 = 1.08, rAt = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - 0.8) / 0.64);
    const y0 = 1.02, y1 = 1.38;
    MON_GEO = new THREE.CylinderGeometry(rAt(y1) + 0.007, rAt(y0) + 0.007, y1 - y0, 12, 1, true, Math.PI - 0.62, 1.24);
    MON_GEO.translate(0, (y0 + y1) / 2, 0);
    const p = MON_GEO.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const r = Math.hypot(x, z) || 1; const d = haoriFold(Math.atan2(x, z), y); p.setXYZ(i, x * (1 + d / r), y, z * (1 + d / r) - 0.004); }
    MON_GEO.computeVertexNormals();
  }
  const m = new THREE.Mesh(MON_GEO, mat);
  m.frustumCulled = false;
  return m;
}

// ---- 兵：部品を一つの骨入りの形にまとめる ----
// 骨の並び（まとめた形の骨）。sw… は揺れる部品の骨（草摺・袖・陣羽織・母衣）。顔はまとめず別に付ける（近くで実写の顔に替える）
const CB = ['Hips', 'Spine1', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
// swHat：笠（倒れた時に頭から落ちるので、頭の骨とは別の骨にしておく）
const XB = { swHips: 'Hips', swSodeP: 'Spine2', swSodeN: 'Spine2', swHaori: 'Spine2', swBack: 'Spine2', swHat: 'Head' };
const ALLB = [...CB, ...Object.keys(XB)];
const PART_BONE = { hips: 'swHips', sodeP: 'swSodeP', sodeN: 'swSodeN', haori: 'swHaori', back: 'swBack', hat: 'swHat' };
const crowdGeos = new Map();
let crowdInv = null;
// 胴丸の侍に重ねる部品（兜・顔・母衣・陣羽織）
const DM_KEEP = new Set(['hat', 'back', 'haori', 'koshi']);
function crowdGeometry(P, L, only = null) {
  const list = [];
  layParts(P, L, (k, nm, geo, fit) => { if (k !== 'face' && geo && geo.attributes.position.count && (!only || only.has(k))) list.push({ bn: PART_BONE[k] || nm, geo, fit }); });
  const key = list.map((p) => p.geo.uuid).join('|');
  if (crowdGeos.has(key)) return crowdGeos.get(key);
  const gs = [];
  for (const p of list) {
    const g = p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'col2', 'mtl'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const n = g.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
    g.applyMatrix4(p.fit);
    const n = g.attributes.position.count, bi = ALLB.indexOf(p.bn);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    gs.push(g);
  }
  const m = mergeGeometries(gs);
  for (const g of gs) g.dispose();
  crowdGeos.set(key, m);
  return m;
}
const BSPH = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.9);
// 近くは細かい形、遠く（HUM.lod より先）と影は軽い形（描く直前に距離で入れ替える）
function lodGeo(m, hi, lo) {
  if (!lo || hi === lo) return;
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const want = !cam.isOrthographicCamera && d2 < HUM.lod * HUM.lod ? hi : lo;
    if (m.geometry !== want) m.geometry = want;
  };
}
function dressCrowd(h, P, L, only = null, look = L) {
  const geo = crowdGeometry(P, L, only);
  // 遠く（と影）は units.js の軽い形をまとめた物
  const Plo = lookParts(look, false);
  const geoLo = crowdGeometry(Plo, L, only);
  // 揺れる部品・顔の骨を足す（立ち姿では親の骨と同じ所）
  h.xb = {};
  for (const [nm, par] of Object.entries(XB)) {
    const b = new THREE.Bone(); b.name = nm; b.matrixAutoUpdate = false;
    h.bones[par].add(b); h.xb[nm] = b; h.bones[nm] = b;
  }
  if (!crowdInv) crowdInv = ALLB.map((nm) => restMatrix(XB[nm] || nm).clone().invert());
  const sk = new THREE.Skeleton(ALLB.map((nm) => h.bones[nm]), crowdInv);
  const m = new THREE.SkinnedMesh(geo, UNIT_MAT);
  m.bind(sk, new THREE.Matrix4());
  m.castShadow = true; m.receiveShadow = false;
  m.boundingSphere = BSPH;
  lodGeo(m, geo, geoLo);
  h.root.add(m);
  h.parts.armor = m;
  h.F = P.F;
  // 今の顔（遠くの顔）
  h.parts.pface = attachBody(h, 'Head', P.face, SRC.fitH);
  if (h.parts.pface) { h.parts.pface.frustumCulled = true; h.parts.pface.castShadow = false; lodGeo(h.parts.pface, P.face, Plo.face); }
}
// 近くの兵の顔を実写の顔に替える・戻す
function crowdFace(h, on) {
  if (!h.xb || !!h.scanOn === on) return;
  if (on && !h.parts.face) {
    if (!HEAD || madeFaces >= 1) return;   // 顔の絵は一コマに一つまで作る
    // 僧兵は剃った頭（裹頭の窓からは目元だけが見える）
    const key = 'c' + ((h.look.face | 0) % 12) + '|' + (h.look.skin || 0) + (h.look.monk ? '|m' : '');
    if (!headMats.has(key)) madeFaces++;
    h.parts.face = scanFace(h, key, h.look, h.F, false);
    if (h.look.menpoScan) scanMenpo(h.parts.face, 'c' + ((h.look.face | 0) % 12), h.look.menpoScan);
  }
  h.scanOn = on;
  if (h.parts.face) h.parts.face.visible = on;
  if (h.parts.pface) h.parts.pface.visible = !on;
}
let madeFaces = 0;
// 実写の顔を頭の骨に付ける（full：本人と武将。兵は軽い目）
function scanFace(h, key, L, F, full) {
  const hd = SRC.rest.Head;
  const gk = full ? key : 'c' + ((L.face | 0) % 12);
  const hm = new THREE.Mesh(headGeo(gk, F), headMaterial(key, L, F));
  const k = HEAD.k;
  const fitF = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeTranslation(0, 0.048, 0.006)).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -1.2, -0.1));
  hm.castShadow = true;
  if (full) addEyes(hm, F); else addEyesFast(hm, F);
  const M = new THREE.Matrix4().copy(restMatrix('Head')).invert().multiply(fitF);
  hm.matrixAutoUpdate = false; hm.matrix.copy(M); hm.frustumCulled = !full;
  h.bones.Head.add(hm);
  return hm;
}
// 目の下頬（面頬）：実写の顔の形から、目の下・頬・鼻・顎の所を少し浮かせて鉄の打ち出しの面にする。口もとは開け、口の上に打ち出しの髭。裏は赤漆
const menpoGeos = new Map();
let MENPO_TEX = null;
const menpoMats = new Map();
function scanMenpo(hm, key, col) {
  if (!menpoGeos.has(key)) {
    const g = hm.geometry, pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index;
    const keep = [];
    const mTop = (x0) => 1.4 + 0.24 * Math.exp(-(x0 * x0) / (2 * 0.2 * 0.2));   // 上の縁：目の下。鼻筋は目の間まで
    for (let i = 0; i < idx.count; i += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { const v = idx.getX(i + k); x += pos.getX(v) / 3; y += pos.getY(v) / 3; z += pos.getZ(v) / 3; }
      const x0 = Math.abs(x + 0.09);
      const top = mTop(x0);
      const mouth = x0 < 0.62 - (y - 0.42) * (y - 0.42) * 0.9 && y > 0.1 && y < 0.72;
      if (z > 0.7 - (1.45 - y) * 0.25 && y < top && y > -1.5 && x0 < 2.15 && !mouth) keep.push(i);
    }
    const build = (off, inner) => {
      const P = [], Nn = [];
      for (const i of keep) {
        const tri = [0, 1, 2].map((k) => idx.getX(i + k));
        const order = inner ? [tri[0], tri[2], tri[1]] : tri;
        for (const v of order) {
          // 上の縁ははみ出た頂点を縁の線にそろえる（三角のぎざぎざを消す）
          const x = pos.getX(v), x0 = Math.abs(x + 0.09), y = Math.min(pos.getY(v), mTop(x0));
          // 口の上の打ち出しの髭：少し高く盛る
          const mus = x0 < 0.85 && y > 0.7 && y < 0.92 ? 0.1 * Math.cos((y - 0.81) * 14) * (1 - x0 / 0.85) : 0;
          // 鼻の所は浮かせすぎない（打ち出しの鼻が団子にならないよう）
          const d = off * (1 - 0.55 * Math.exp(-(x0 * x0) / (2 * 0.3 * 0.3) - ((y - 1.1) ** 2) / (2 * 0.35 * 0.35))) + (inner ? 0 : mus);
          P.push(x + nrm.getX(v) * d, y + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d);
          Nn.push(nrm.getX(v) * (inner ? -1 : 1), nrm.getY(v) * (inner ? -1 : 1), nrm.getZ(v) * (inner ? -1 : 1));
        }
      }
      const o = new THREE.BufferGeometry();
      o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      o.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
      return o;
    };
    menpoGeos.set(key, { out: build(0.2, false), inn: build(0.15, true) });
  }
  const G = menpoGeos.get(key);
  // 鉄の地：錆と擦れのむら（小さな絵を一度だけ作る）
  if (!MENPO_TEX) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#c8c0b8'; g.fillRect(0, 0, 128, 128);
    let a = 7; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? `rgba(120,70,40,${0.05 + r() * 0.1})` : `rgba(30,28,26,${0.05 + r() * 0.12})`; g.beginPath(); g.arc(r() * 128, r() * 128, 0.4 + r() * 1.6, 0, 7); g.fill(); }
    // 擦れ（細い傷）
    g.lineWidth = 0.5; for (let i = 0; i < 120; i++) { const x = r() * 128, y = r() * 128; g.strokeStyle = `rgba(235,228,220,${0.1 + r() * 0.15})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 5); g.stroke(); }
    MENPO_TEX = new THREE.CanvasTexture(c); MENPO_TEX.colorSpace = THREE.SRGBColorSpace; MENPO_TEX.wrapS = MENPO_TEX.wrapT = THREE.RepeatWrapping;
  }
  if (!G.out.attributes.uv) for (const gg of [G.out, G.inn]) { const p = gg.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.3; } gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  if (!menpoMats.has(col)) menpoMats.set(col, [new THREE.MeshStandardMaterial({ color: col, map: MENPO_TEX, roughness: 0.62, metalness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.3, metalness: 0 })]);
  const [iron, red] = menpoMats.get(col);
  const a = new THREE.Mesh(G.out, iron), b = new THREE.Mesh(G.inn, red);
  for (const m of [a, b]) { m.castShadow = true; m.frustumCulled = false; hm.add(m); }
}
// 兵の目：白目・黒目・まぶた・まつげを一つの形にまとめる（描く回数を一回に）
const eyeFast = new Map();
let EYE_FAST_MAT = null;
function addEyesFast(hm, F) {
  const w = F.w || 1, open = 1 / (F.eye || 1);
  const key = w.toFixed(2) + '|' + open.toFixed(2);
  if (!eyeFast.has(key)) {
    const gs = [];
    const col = (g, hex) => {
      g = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    for (const cx of [-0.69, 0.51]) {
      const M = new THREE.Matrix4().makeTranslation(cx * w, 1.72, 1.965).multiply(new THREE.Matrix4().makeRotationY((cx < -0.09 ? -1 : 1) * 0.22));
      const put = (g, hex, x, y, z, sy) => { g.scale(1, sy, 1); g.translate(x, y, z); g.applyMatrix4(M); gs.push(col(g, hex)); };
      const s = (rx, ry, rz, ws, hs, a, b) => { const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, b ?? Math.PI); g.scale(rx, ry, rz); return g; };
      put(s(0.25, 0.085, 0.06, 12, 8), 0xb4a898, 0, 0, 0, open);
      put(s(0.085, 0.078, 0.03, 10, 6), 0x2a1a10, 0.01, 0.006, 0.045, open);
      put(s(0.036, 0.036, 0.012, 6, 4), 0x050303, 0.01, 0.006, 0.068, open);
      put(s(0.29, 0.07, 0.085, 12, 6, 0, Math.PI * 0.55), 0x9a6c50, 0, 0.052 + 0.02 * (1 - open), -0.004, 1);
      const lash = new THREE.TorusGeometry(1, 0.06, 4, 12, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
      put(lash, 0x0e0906, 0, 0.018, 0.012, open);
    }
    const g = new THREE.BufferGeometry();
    let n = 0; for (const x of gs) n += x.attributes.position.count;
    const Pp = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
    let o = 0;
    for (const x of gs) { Pp.set(x.attributes.position.array, o * 3); Nn.set(x.attributes.normal.array, o * 3); Cc.set(x.attributes.color.array, o * 3); o += x.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.computeBoundingSphere();
    eyeFast.set(key, g);
  }
  if (!EYE_FAST_MAT) EYE_FAST_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 });
  const m = new THREE.Mesh(eyeFast.get(key), EYE_FAST_MAT);
  m.frustumCulled = false;
  hm.add(m);
}

// ---- 僧兵の装い：裹頭（白い頭巾で頭と顔を包み、目だけ出す）と袈裟 ----
// 形は units.js の部品と同じ作り（UNIT_MAT の色・素材の値）で、体の座標で作る
const PLAIN_UV = [(1024 + 128) / 2048, 1 - (768 + 128) / 1024];
function paintG(g, hex, mk = 0, dirt = 0.35) {
  if (!g.index) { const n = g.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('col2', new THREE.BufferAttribute(a.slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(n).fill(mk + mk * 8 + dirt * 0.9), 1));
  return g;
}
const soheiCache = new Map();
// 裹頭：袈裟の布で頭を包み、目のまわりだけを細く出す。布は実写の顔と遠目の顔の両方の一回り外に沿う
// （頭の点の群れから包みの下地を作る。鼻と口は布の下、窓からは目元だけ）。色と包み方（窓の高さ・垂れの長さ）は人ごとに少し変える
function soheiKato(L) {
  const vi = (L.vi || 0) % 6;
  const k = (L.kato || 0) + '|' + vi + (HEAD ? '|s' : '');
  if (soheiCache.has(k)) return soheiCache.get(k);
  const C = { x: 0, y: 1.6, z: 0.012 };
  const pts = [];
  // 遠目の顔（units.js の頭）：頭の楕円と鼻、首
  for (let j = 0; j <= 20; j++) for (let i = 0; i < 32; i++) {
    const th = (i / 32) * Math.PI * 2, ph = (j / 20 - 0.5) * Math.PI, c = Math.cos(ph);
    const rz = Math.cos(th) < 0 ? 0.117 * 1.08 : 0.117;
    pts.push(Math.sin(th) * c * 0.104, 1.6 + Math.sin(ph) * 0.135, 0.012 + Math.cos(th) * c * rz);
  }
  for (const dx of [-0.012, 0, 0.012]) pts.push(dx, 1.585, 0.148);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; for (const y of [1.4, 1.46, 1.52]) pts.push(Math.sin(a) * 0.062, y, 0.006 + Math.cos(a) * 0.062); }
  // 実写の顔（顔の幅の作り分けの分だけ横を広げる）
  if (HEAD) {
    const p = HEAD.geo.attributes.position, kk = HEAD.k;
    for (let i = 0; i < p.count; i += 2) if (p.getY(i) > -0.6) pts.push(p.getX(i) * kk * 1.04, 1.568 + kk * (p.getY(i) - 1.2), 0.006 + kk * (p.getZ(i) - 0.1));
  }
  const R = headEnvelope(pts, C, 48, 28);
  const g = katoGeometry(R, C, { col: L.kato || 0xe2dccf, vi, hi: true, win: { x: -0.005, y: 1.609, hw: 0.056, hh: 0.015 + 0.002 * (vi % 3) }, drop: [1, 1.15, 0.9, 1.25, 1.05, 0.95][vi] });
  soheiCache.set(k, g);
  return g;
}
// 薙刀：柄は長さ 2.1m ほど、反りのある刃。槍と同じ握り（右手の所が原点、+z が前）
let NAGINATA = null;
function naginata(u) {
  // 長柄（槍）を持つ僧兵だけ。弓・鉄砲の僧兵はそのまま
  if (!u.wpn || u.lookWeapon !== 'spear' || (u.wpnKind && u.wpnKind !== 'spear') || u.wpn.userData.bow || u.wpn.userData.ram) return;
  if (!NAGINATA) {
    const pr = [];
    const shaft = new THREE.CylinderGeometry(0.019, 0.022, 2.05, 6); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, 0.12);
    pr.push(paintG(shaft, 0x2a1c12, 1));
    const tsuba = new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10); tsuba.rotateX(Math.PI / 2); tsuba.translate(0, 0, 1.16);
    pr.push(paintG(tsuba, 0x2a2622, 3));
    const hab = new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6); hab.rotateX(Math.PI / 2); hab.translate(0, 0, 1.05);
    pr.push(paintG(hab, 0x1b1a18, 0));
    // 刃：反りのある片刃（刃は下、峰は上）
    const s = new THREE.Shape();
    s.moveTo(0, 0.012); s.quadraticCurveTo(0.34, 0.02, 0.6, 0.11); s.quadraticCurveTo(0.42, 0.03, 0.0, -0.028); s.closePath();
    const bl = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 8 });
    bl.translate(0, 0, -0.003); bl.rotateY(-Math.PI / 2); bl.translate(0, 0, 1.17);
    pr.push(paintG(bl, 0xb5b9bb, 3, 0.1));
    const sb = new THREE.CylinderGeometry(0.015, 0.02, 0.06, 6); sb.rotateX(Math.PI / 2); sb.translate(0, 0, -0.93);
    pr.push(paintG(sb, 0x3a3e42, 3));
    NAGINATA = mergeGeometries(pr);
    NAGINATA.computeBoundingSphere();
  }
  // 槍のしなり（units.js）は、長柄の槍の形に入れ替えるので止める
  const F = u.wpn.userData.flex;
  if (F) { if (F.a) F.a.visible = false; u.wpn.userData.flex = null; }
  u.wpn.geometry = NAGINATA;
  u.wpn.userData.tip = 1.8; u.wpn.userData.butt = -0.95;
}

// ---------------- 動かす ----------------
// 骨を世界の軸のまわりに回す（動きの後から足す）
const _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _ax = new THREE.Vector3();
function rotWorld(bone, axis, ang) {
  if (!ang) return;
  _wq.setFromAxisAngle(axis, ang);
  applyWorldRot(bone, _wq);
}
// 世界での回転を骨に掛ける。親に鏡（前後を返した）が入っていても正しく回るよう、行列で挟む
// 親の行列だけを新しくしてから回し、その骨の行列だけを直す（子の骨は、使う時に親から辿って直す）
function applyWorldRot(bone, q) {
  bone.parent.updateWorldMatrix(true, false);
  const P = bone.parent.matrixWorld;
  m0.copy(P).invert().multiply(m1.makeRotationFromQuaternion(q)).multiply(P);
  q0.setFromRotationMatrix(m0);
  bone.quaternion.premultiply(q0);
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(P, bone.matrix);
}
// 骨の向きを変えて、その子の関節を狙いの点へ向ける（世界の座標）
function aimBone(bone, childPos, target) {
  bone.getWorldPosition(v0);
  v1.copy(childPos).sub(v0).normalize();
  v2.copy(target).sub(v0).normalize();
  if (v1.lengthSq() < 1e-8 || v2.lengthSq() < 1e-8) return;
  _wq.setFromUnitVectors(v1, v2);
  applyWorldRot(bone, _wq);
}
// 二つの骨の腕（肩・肘・手首）で手首を狙いの点へ。pole は肘を向ける向き
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3(), _E2 = new THREE.Vector3();
function ik2(upper, lower, hand, target, pole) {
  upper.getWorldPosition(_S); lower.getWorldPosition(_E); hand.getWorldPosition(_W);
  const a = _S.distanceTo(_E), b = _E.distanceTo(_W);
  _T.copy(target);
  let d = _T.distanceTo(_S);
  const maxD = (a + b) * 0.999;
  if (d > maxD) { _T.sub(_S).setLength(maxD).add(_S); d = maxD; }
  d = Math.max(d, Math.abs(a - b) + 0.01);
  // 肘の位置：肩から狙いへの線の上で、肘の出る向き（pole）へ
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const dir = v3.copy(_T).sub(_S).normalize();
  _P.copy(pole).sub(v0.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
  _E2.copy(_S).add(v1.copy(dir).multiplyScalar(Math.cos(ang) * a)).add(v2.copy(_P).multiplyScalar(Math.sin(ang) * a));
  aimBone(upper, _E, _E2);
  lower.getWorldPosition(_E); hand.getWorldPosition(_W);
  aimBone(lower, _W, _T);
}

const _up = new THREE.Vector3(0, 1, 0), _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _tgt = new THREE.Vector3(), _tgt2 = new THREE.Vector3(), _pole = new THREE.Vector3(), _dir = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// 一人ぶんの動き：速さで立つ・歩く・走るを混ぜ、その上に構え・突き・受け・よろめき・倒れる・鉄砲・弓・待つ間のしぐさを骨に重ねる
// fine：近い人（草摺の揺れ）。arms：腕を武器に合わせる
function driveHuman(h, dt, fine = true, arms = true) {
  const u = h.u;
  const B = h.bones;
  const time = (h.clock = (h.clock || 0) + dt);
  // 速さ（位置の動きから）
  const dx = u.pos.x - h.last.x, dz = u.pos.z - h.last.z;
  h.last.copy(u.pos);
  const inst = u.forceSpd ?? (dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0);
  const prev = h.spd;
  h.spd += (inst - h.spd) * Math.min(1, dt * 6);
  // 曲がる速さと、止まりかけ（馬上の体の傾きに使う）
  const hd0 = h.lastH ?? u.heading; h.lastH = u.heading;
  let dh = u.heading - hd0; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  h.turn = (h.turn || 0) + ((dt > 0 ? dh / dt : 0) - (h.turn || 0)) * Math.min(1, dt * 4);
  h.decel = (h.decel || 0) + (Math.max(0, dt > 0 ? (prev - h.spd) / dt : 0) * 0.3 - (h.decel || 0)) * Math.min(1, dt * 3);
  const sp = u.mounted || !u.alive ? 0 : h.spd;
  const wWalk = Math.max(0, Math.min(1, sp / 1.1)) * (1 - Math.max(0, Math.min(1, (sp - 2.6) / 1.6)));
  const wRun = Math.max(0, Math.min(1, (sp - 2.6) / 1.6));
  const wIdle = Math.max(0, 1 - wWalk - wRun);
  const A = h.act;
  A.idle.setEffectiveWeight(wIdle); A.walk.setEffectiveWeight(wWalk); A.run.setEffectiveWeight(wRun);
  A.walk.timeScale = Math.max(0.5, sp / 1.45); A.run.timeScale = Math.max(0.7, sp / 5.2);
  // 動きの見本（idle など）を骨に当てる。三つの動きの時が進まない時（倒れた後）は、three.js が同じ値を書き直さないので、
  // 下で重ねて回した分が毎コマ積み重なって体がねじれ、のたうつ。倒れた人は、息のあった最後のコマの形を覚えておいて、毎コマそこへ戻す
  if (u.alive || !h.pose) {
    h.mixer.update(u.alive ? dt : 0);
    const bs = h.animB || (h.animB = Object.values(h.bones).filter((b) => b.isBone && !(h.xb && Object.values(h.xb).includes(b))));
    const P = h.pose || (h.pose = bs.map(() => new THREE.Quaternion()));
    for (let i = 0; i < bs.length; i++) P[i].copy(bs[i].quaternion);
  } else for (let i = 0; i < h.animB.length; i++) h.animB[i].quaternion.copy(h.pose[i]);
  // 根元の向き（人は兵の根元の子）。倒れる途中は根元がコマごとに大きく回るので、先に今のコマの行列にしておく（前のコマの向きで骨を回すと、体がねじれて跳ねる）
  if (!u.mounted) u.mesh.updateWorldMatrix(false, false);
  h.root.updateMatrixWorld(true);
  const m = u.mesh.matrixWorld.elements;
  _right.set(m[0], m[1], m[2]).normalize(); _fwd.set(m[8], m[9], m[10]).normalize();
  const w = u.wpnKind || u.lookWeapon;
  const engaged = !!(u.target || u.atk) && u.alive && !u.fleeing;
  const ranged = w === 'gun' || w === 'bow';
  // 構え（腰を落とし、左足を前へ）：敵と向き合って立ち止まっている時
  const wantSt = engaged && sp < 1.6 && !u.mounted && !ranged ? 1 : u.guarding > 0 || u.guard ? 1 : 0;
  h.stance = (h.stance || 0) + (wantSt - (h.stance || 0)) * Math.min(1, dt * 4);
  const st = h.stance * (1 - wRun);
  // 胴の傾き（本編の胴と同じ：のけぞり・踏み込み・走りの前傾・ひねり）
  const br = u.body ? u.body.rotation : { x: 0, y: 0, z: 0 };
  const lk = u.mounted ? 0.3 : 1;
  rotWorld(B.Spine, _right, br.x * 0.6 * lk + st * 0.1); rotWorld(B.Spine1, _right, br.x * 0.4 * lk);
  rotWorld(B.Spine1, _up, br.y * 0.6);
  rotWorld(B.Spine, _fwd, -br.z);
  // 半身：長柄・刀を構える時は、左の肩を前へ出して胸を右へ開く（顔は前のまま）。人ごとに少し違う
  if (!u.mounted && u.alive && (w === 'spear' || w === 'sword')) {
    const tw = (1 - (h.upK || 0)) * (1 - wRun) * (w === 'spear' ? 0.42 + (h.seed - 0.5) * 0.2 : 0.15 + h.seed * 0.1) * Math.max(st, w === 'spear' ? 0.6 : 0);
    if (tw > 0.01) { rotWorld(B.Spine, _up, tw * 0.4); rotWorld(B.Spine1, _up, tw * 0.35); rotWorld(B.Spine2, _up, tw * 0.25); rotWorld(B.Neck, _up, -tw * 0.8); }
  }
  // 腰の上下（膝つき・かわし・息づかい）
  const by = u.body ? u.body.position.y - (u.mounted ? RIDE.y : 0) : 0;
  h.model.position.y = Math.min(0.05, by) * 0.8;
  h.model.position.z = 0;
  if (!u.mounted && u.alive) lowerBody(h, B, dt, time, st, wIdle, sp, w);
  // 崩れて膝をつく
  if (u.stagger > 0.7 && !u.mounted && !u.isPlayer && u.alive) {
    rotWorld(B.RightUpLeg, _right, -1.0); rotWorld(B.RightLeg, _right, 1.6);
    rotWorld(B.LeftUpLeg, _right, 0.15); rotWorld(B.LeftLeg, _right, 1.4);
    h.model.position.y = -0.3;
  }
  // 倒れる途中の膝の折れ（units.js の animDeath が u.deathKneel に 0〜1 で出す）。途中で跳ばないよう、量のまま折る
  if (!u.alive && u.death && !u.mounted) {
    const kn = u.deathKneel || 0;
    if (kn > 0.001) {
      rotWorld(B.RightUpLeg, _right, -1.0 * kn); rotWorld(B.RightLeg, _right, 1.6 * kn);
      rotWorld(B.LeftUpLeg, _right, 0.15 * kn); rotWorld(B.LeftLeg, _right, 1.4 * kn);
      h.model.position.y = Math.min(h.model.position.y, -0.3 * kn);
    }
  }
  // 討たれて倒れる：膝から崩れ、背を丸め、腕が落ちる（倒れる向きは units.js が根元を回す）
  // （units.js が倒れ方 u.death を動かす時は、膝は上の deathKneel で折り、ここでは力の抜けた腕と首だけ）
  if (!u.alive && !u.mounted) {
    const dT = u.death ? u.death.t : u.deadT || 0;
    const k = u.death ? 0 : ease(0, 0.5, dT), k2 = ease(0.15, 0.9, dT);
    // 倒れ切った後も、脚はまっすぐにせず少し曲げたまま（棒のように寝ない）
    if (u.death && u.death.kind !== 'unhorse' && dT > 0.5) {
      const r = ease(0.5, 1.1, dT) * (0.6 + h.seed * 0.5);
      rotWorld(B.LeftUpLeg, _right, -0.5 * r); rotWorld(B.LeftLeg, _right, 0.9 * r);
      rotWorld(B.RightUpLeg, _right, -0.15 * r * h.seed); rotWorld(B.RightLeg, _right, 0.5 * r);
    }
    const f = u.fall || 1;
    rotWorld(B.LeftUpLeg, _right, -0.75 * k); rotWorld(B.LeftLeg, _right, 1.25 * k);
    rotWorld(B.RightUpLeg, _right, -0.35 * k); rotWorld(B.RightLeg, _right, 0.9 * k);
    rotWorld(B.Spine1, _right, 0.35 * k * f); rotWorld(B.Spine2, _fwd, (h.seed - 0.5) * 0.6 * k);
    // 腕：仰向け・うつ伏せは脇へ投げ出す。横向きに寝る時は、上の腕が宙に立たないよう体の前へ落とす（units.js の軽い形と同じ形に）
    const sideLie = u.death && (u.death.kind === 'side' || u.death.kind === 'unhorse' || (u.death.kind === 'crumple' && !u.death.fwd));
    if (sideLie) { rotWorld(B.LeftArm, _right, -0.8 * k2); rotWorld(B.RightArm, _right, -0.6 * k2); }
    else { rotWorld(B.LeftArm, _fwd, -0.9 * k2); rotWorld(B.RightArm, _fwd, 0.7 * k2); }
    rotWorld(B.LeftForeArm, _right, -0.6 * k2); rotWorld(B.RightForeArm, _right, -0.4 * k2);
    rotWorld(B.Neck, _right, 0.4 * k2 * f);
    if (!u.death) h.model.position.y = -0.22 * k;
  }
  // 当たった時の体の反応（units.js の u.hit）：のけぞる・首が跳ねる・横へ折れる・よろめく
  if (u.hit && u.alive) hitReact(h, B, u.hit);
  // 振りの体の入り（u.swing）：振りかぶりで胸をひねり、振り抜きで戻す
  if (u.swing && u.alive && !u.mounted) {
    const q = clamp01(u.swing.t / Math.max(0.05, u.swing.dur));
    const tw = (u.swing.side || 1) * (q < 0.35 ? q / 0.35 : 1 - (q - 0.35) / 0.65) * 0.3;
    rotWorld(B.Spine1, _up, -tw); rotWorld(B.Spine, _right, 0.12 * Math.sin(q * Math.PI));
  }
  // 馬上：鞍にまたがる。腰は馬の背の弾みを受け、上体は駆ける波に合わせて揺れる
  if (u.mounted) rideHuman(h, dt);
  // 頭：体が傾いても顔は前を見る（首で七割ほど戻す）
  if (B.HeadTop_End && u.alive) {
    B.Head.getWorldPosition(v0); B.HeadTop_End.getWorldPosition(_tgt);
    const up = _tgt2.copy(_tgt).sub(v0); const L = up.length(); up.multiplyScalar(1 / L);
    up.lerp(_up, 0.7).normalize();
    aimBone(B.Head, _tgt, _pole.copy(v0).addScaledVector(up, L));
  }
  // 見回す：待つ間は時々よそを見、戦う時は敵へ目を向ける
  if (u.alive && !h.far) lookAround(h, B, dt, engaged, wIdle);
  // 腕：武器の握りへ（本編の手の位置＝ u.hand）
  if (arms && u.hand && u.alive && u.wpn && u.wpn.parent) { if (!cmdPose(h, B, dt, time, w, engaged)) armsPose(h, B, dt, time, w); }
  else if (h.cmdHid || h.saihai) cmdOff(h);
  // 甲冑の遅れた揺れ（草摺・袖）：体の上下と前後の速さの変わりから、ばねで
  // 倒れた人の手足が地面にめり込まないよう持ち上げる
  if (!u.alive && !u.mounted) groundLimbs(h);
  // 倒れて陣笠が落ちた（units.js が地面に笠を置いた）：頭の笠は隠す
  if (u.hatOff && !h.hatOff) { h.hatOff = true; if (h.xb && h.xb.swHat) h.xb.swHat.matrix.makeScale(0, 0, 0); if (h.parts.hat) h.parts.hat.visible = false; }
  // 倒れた人は草摺・袖を揺らさない（寝た体の甲冑がばねで震えないよう、元の形へ戻して止める）
  if (!u.alive) { if (h.sw) { h.sw.a = h.sw.va = h.sw.b = h.sw.vb = 0; } if (fine || h.sw) sway(h, 0); }
  else if (fine) sway(h, dt);
}

// ---- 名のある武将の立ち姿：戦っていない時は刀を納め、右手に采配。胸を張り、采配を上げる・前を指す・振る ----
// 戦い始めたら（敵を狙う・打ち合う・受ける）、采配を下げて刀を抜く（今の armsPose へ）
let SAIHAI = null;
function saihaiMesh() {
  if (!SAIHAI) {
    const lac = new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.8 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xece4d0, roughness: 0.9, side: THREE.DoubleSide });
    const hd = new THREE.CylinderGeometry(0.011, 0.013, 0.42, 6); hd.translate(0, 0.13, 0);
    const cap = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8); cap.translate(0, 0.34, 0);
    // 房：細い紙の短冊を二十余り、少しずつ開いて一つの形にまとめる
    const strips = [];
    for (let i = 0; i < 22; i++) {
      const st = new THREE.PlaneGeometry(0.009, 0.2 * (0.8 + (i % 4) * 0.1), 1, 3); st.translate(0, 0.1 * (0.8 + (i % 4) * 0.1), 0);
      const a = (i / 22) * Math.PI * 2 + i * 0.7;
      st.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.cos(a) * (0.12 + (i % 3) * 0.08), a, Math.sin(a) * (0.12 + (i % 3) * 0.08))));
      strips.push(st);
    }
    const tuftG = mergeGeometries(strips);
    SAIHAI = { lac, gold, paper, hd, cap, tuftG };
  }
  const S_ = SAIHAI;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(S_.hd, S_.lac), new THREE.Mesh(S_.cap, S_.gold));
  const tuft = new THREE.Mesh(S_.tuftG, S_.paper); tuft.position.y = 0.34;
  g.add(tuft); g.userData.tuft = tuft;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}
const _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cm = new THREE.Matrix4(), _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _ch = new THREE.Vector3(), _cy = new THREE.Vector3(0, 1, 0);
// 采配を仕舞い、刀を戻す（人をやめる時も）
function cmdOff(h) { if (h.saihai) h.saihai.visible = false; if (h.cmdHid) { h.cmdHid = false; if (h.u.wpn) h.u.wpn.visible = true; } }
function cmdPose(h, B, dt, time, w, engaged) {
  const u = h.u;
  if (u.isPlayer || w !== 'sword' || !isNamed(h.look) || h.far) { cmdOff(h); return false; }
  // 敵が近い（7m）か、打ち合っている時だけ刀を抜く（遠くの敵を狙っているだけなら采配のまま）
  const tg = u.target && u.target.pos, near = !!tg && Math.hypot(tg.x - u.pos.x, tg.z - u.pos.z) < 7;
  const calm = !near && !u.atk && !u.pAtk && !u.swing && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.stagger > 0.3);
  h.cmdK = (h.cmdK ?? (calm ? 1 : 0)) + ((calm ? 1 : 0) - (h.cmdK ?? 0)) * Math.min(1, dt * 4);
  const on = h.cmdK > 0.5;
  if (!on) { cmdOff(h); return false; }
  u.wpn.visible = false; h.cmdHid = true;
  if (!h.saihai) { h.saihai = saihaiMesh(); h.root.add(h.saihai); }
  h.saihai.visible = true;
  // しぐさ：構え（腰の前）・掲げる（胸の前）・指す（腕を伸ばして前か斜め前）・振る（指して上下に）
  const C = h.cmd || (h.cmd = { t: 1 + h.seed * 3, mode: 0, yaw: 0, cur: new THREE.Vector3(0.05, -0.4, 0.2) });
  C.t -= dt;
  if (C.t <= 0) {
    const r = Math.random();
    C.mode = r < 0.4 ? 0 : r < 0.62 ? 1 : r < 0.88 ? 2 : 3;
    C.yaw = (Math.random() - 0.5) * 0.9;
    C.t = C.mode === 0 ? 3 + Math.random() * 4 : C.mode === 3 ? 1.6 : 2 + Math.random() * 2;
  }
  // 胸を張る（馬上は小さく）
  const mk = u.mounted ? 0.4 : 1;
  rotWorld(B.Spine1, _right, -0.05 * mk); rotWorld(B.Spine2, _right, -0.06 * mk);
  // 右手の置き所（肩からの、体の右・上・前の量）
  let tx = 0.06, ty = -0.4, tz = 0.2;
  if (C.mode === 1) { tx = 0.0; ty = -0.14; tz = 0.34; }
  else if (C.mode >= 2) {
    tx = Math.sin(C.yaw) * 0.5 + 0.02; tz = Math.cos(C.yaw) * 0.5; ty = 0.06 + (C.mode === 3 ? Math.sin(time * 7) * 0.12 : 0);
  }
  const k = Math.min(1, dt * 3);
  C.cur.x += (tx - C.cur.x) * k; C.cur.y += (ty - C.cur.y) * k; C.cur.z += (tz - C.cur.z) * k;
  B.RightArm.getWorldPosition(_ch);
  _tgt.copy(_ch).addScaledVector(_right, C.cur.x).addScaledVector(_up, C.cur.y).addScaledVector(_fwd, C.cur.z);
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, _pole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -1).addScaledVector(_fwd, -0.2));
  // 指す時は、顔もそちらへ
  if (C.mode >= 2) { const a = C.yaw * clamp01(C.cur.y + 0.4); rotWorld(B.Neck, _up, a * 0.35); rotWorld(B.Head, _up, a * 0.3); }
  // 左手：馬上は手綱、徒は太刀の柄に置く
  if (u.mounted) {
    const Hh = u.horse && u.horse.userData.horse;
    if (Hh && Hh.hand) _tgt2.copy(Hh.hand).applyMatrix4(u.mesh.matrixWorld);
    else _tgt2.set(-0.08, 1.02 + RIDE.y, 0.42).applyMatrix4(u.mesh.matrixWorld);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-0.7).addScaledVector(_up, -1));
  } else if (h.parts.koshi) {
    h.parts.koshi.updateWorldMatrix(true, false);
    _tgt2.set(-0.215, 0.975, 0.3).applyMatrix4(h.parts.koshi.matrixWorld);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-1).addScaledVector(_up, -0.4).addScaledVector(_fwd, -0.3));
  }
  // 采配を右手に：柄は前腕の向きから少し上へ。房は下へ垂れ、振ると遅れてなびく
  B.RightForeArm.getWorldPosition(_cv); B.RightHand.getWorldPosition(_cv2);
  // 構え・掲げる時は柄を前の斜め上へ、指す・振る時は腕の向きの先へ
  const pk = clamp01((C.cur.y + 0.2) / 0.25);
  const dir = _ch.copy(_cv2).sub(_cv).normalize().multiplyScalar(pk).addScaledVector(_fwd, 0.4 * (1 - pk)).addScaledVector(_up, 0.25 + 0.75 * (1 - pk)).addScaledVector(_right, 0.1 * (1 - pk)).normalize();
  const sh = h.saihai;
  _cq.setFromUnitVectors(_cy, dir);
  h.root.updateWorldMatrix(true, false);
  _cm.compose(_cv2.addScaledVector(dir, 0.04), _cq, v3.set(1, 1, 1));
  sh.matrixAutoUpdate = false;
  sh.matrix.copy(m0.copy(h.root.matrixWorld).invert()).multiply(_cm);
  // 房：世界の下へ寄せる（柄の座標で）
  const td = v1.copy(dir).multiplyScalar(0.25).addScaledVector(_up, -1).addScaledVector(_fwd, C.mode === 3 ? Math.cos(time * 7) * 0.3 : 0).normalize();
  _cq2.copy(_cq).invert();
  td.applyQuaternion(_cq2);
  sh.userData.tuft.quaternion.setFromUnitVectors(_cy, td);
  return true;
}

// 倒れた体の手足：肘・膝と手首・足首が地面より下なら、付け根の骨を回して地面の上へ持ち上げる（寝た体の腕や膝が土に埋まらないよう）
const LIMBS = [['LeftArm', 'LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']];
let WORLD = null;
function groundLimbs(h) {
  if (!WORLD) return;
  const B = h.bones;
  for (const [a, b, c] of LIMBS) {
    for (const [root, end, lift] of [[a, b, 0.08], [b, c, 0.06]]) {
      for (let k = 0; k < 2; k++) {
        B[end].getWorldPosition(_T);
        const gy = WORLD.heightAt(_T.x, _T.z) + lift;
        if (_T.y >= gy - 0.005) break;
        _P.copy(_T); _P.y = gy;
        aimBone(B[root], _T, _P);
      }
    }
  }
}
// 当たった時の反応：envelope は当たってすぐ強く、ゆっくり戻る
function hitReact(h, B, H) {
  const q = clamp01(H.t / Math.max(0.05, H.dur || 0.4));
  const e = Math.sin(Math.min(1, q * 2.2) * Math.PI / 2) * (1 - ease(0.3, 1, q));
  const sd = H.side || (h.seed > 0.5 ? 1 : -1);
  const k = H.kind;
  if (k === 'flinch') { rotWorld(B.Spine1, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.25 * e); rotWorld(B.Head, _fwd, 0.15 * sd * e); }
  else if (k === 'recoil') { rotWorld(B.Spine, _right, -0.22 * e); rotWorld(B.Spine2, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.3 * e); }
  else if (k === 'side') { rotWorld(B.Spine, _fwd, 0.3 * sd * e); rotWorld(B.Spine2, _up, 0.25 * sd * e); rotWorld(B.Head, _fwd, 0.2 * sd * e); }
  else if (k === 'stumble') {
    rotWorld(B.Spine, _right, 0.2 * e); rotWorld(B.RightUpLeg, _right, 0.35 * e); rotWorld(B.LeftUpLeg, _right, -0.3 * e); rotWorld(B.LeftLeg, _right, 0.5 * e);
    rotWorld(B.LeftArm, _fwd, -0.4 * e);
    h.model.position.y -= 0.06 * e;
  }
}

// 脚：構え（左足を前・腰を落とす）・突きの踏み込み・待つ間の重心の移し替え・鉄砲と弓の構え
function lowerBody(h, B, dt, time, st, wIdle, sp, w) {
  const u = h.u;
  let lf = 0, rf = 0, lk = 0, rk = 0, drop = 0, spread = 0;
  // 構え
  // 前の足は腿を出して膝を曲げ、後ろの足は膝を折って踵を返す（足の裏が地面から浮かないよう腰を落とす）
  // 人ごとに足の出し方・膝の曲げ・腰の落とし・足の開きを変える（皆が同じ形にならないよう）
  const V = h.var || (h.var = { f: 0.75 + ((h.seed * 7.31) % 1) * 0.5, kn: 0.7 + ((h.seed * 3.17) % 1) * 0.6, sp: 0.6 + ((h.seed * 5.73) % 1) * 0.9, lean: ((h.seed * 9.1) % 1) - 0.5, out: ((h.seed * 11.3) % 1) - 0.5 });
  lf += -0.45 * st * V.f; lk += 0.55 * st * V.kn; rf += -0.15 * st * (2 - V.f); rk += 0.45 * st * V.kn; drop += 0.035 * st * (V.kn + V.f) * 0.5; spread += 0.06 * st * V.sp;
  // 足先の向き（外へ開く人・まっすぐの人）
  if (st > 0.05) { rotWorld(B.LeftUpLeg, _up, 0.12 * V.out * st); rotWorld(B.RightUpLeg, _up, -0.25 * (0.6 + V.out) * st); }
  // 突きの踏み込み・叩きの沈み
  if (u.strikeT > 0) { const s = Math.sin((1 - u.strikeT / 0.2) * Math.PI); lf -= 0.3 * s; rf += 0.22 * s; drop += 0.05 * s; }
  if (u.slamT > 0) { const s = Math.sin((1 - u.slamT / 0.26) * Math.PI); lk += 0.3 * s; rk += 0.3 * s; drop += 0.08 * s; }
  // 鉄砲を撃つ・弓を引く：左足を前に開いて立つ
  const aim = (u.atk && (u.atk.ranged || u.atk.bow)) || u.gunPh === 'aim' || u.gunPh === 'kiri' || u.bowPh === 'draw' || u.bowPh === 'kai' ? 1 : 0;
  h.aimK = (h.aimK || 0) + (aim - (h.aimK || 0)) * Math.min(1, dt * 5);
  if ((w === 'gun' || w === 'bow') && sp < 1.2) { lf -= 0.22 * h.aimK; rf += 0.12 * h.aimK; lk += 0.12 * h.aimK; spread += 0.06 * h.aimK; drop += 0.02 * h.aimK; }
  // 待つ間：ゆっくり重心を左右へ移し、力を抜いた脚の膝がゆるむ（棒立ちにしない）
  if (wIdle > 0.2) {
    const V = h.var;
    const sh = Math.sin(time * (0.35 + h.seed * 0.2) + h.seed * 9) * wIdle * (1 - st) + V.lean * 0.6 * wIdle * (1 - st);
    rotWorld(B.Hips, _fwd, 0.045 * sh);
    // 立ち方の癖：足を広めに開く人・閉じる人
    spread += (V.sp - 1) * 0.05 * wIdle * (1 - st);
    rotWorld(B.Spine, _fwd, -0.05 * sh);
    if (sh > 0) { lk += 0.16 * sh; lf -= 0.05 * sh; } else { rk -= 0.16 * sh; rf += 0.05 * sh; }
    drop += Math.abs(sh) * 0.012;
  }
  // 待つ間の身構えと膝つき（units.js の idleFx が決める u.idl.low・u.idl.sit）
  // 敵が近ければ膝を曲げて腰を落とす。陣の中では右の膝を立て、左の膝を地につける
  const I = u.idl;
  if (I && wIdle > 0.2) {
    if (I.low > 0.01 && st < 0.5) { lf -= 0.3 * I.low; lk += 0.4 * I.low; rf += 0.05 * I.low; rk += 0.35 * I.low; drop += 0.05 * I.low; }
    if (I.sit > 0.01) { rf -= 1.0 * I.sit; rk += 1.6 * I.sit; lf += 0.15 * I.sit; lk += 1.4 * I.sit; drop += 0.3 * I.sit; }
  }
  if (lf) rotWorld(B.LeftUpLeg, _right, lf);
  if (rf) rotWorld(B.RightUpLeg, _right, rf);
  if (spread) { rotWorld(B.LeftUpLeg, _fwd, -spread); rotWorld(B.RightUpLeg, _fwd, spread); }
  if (lk) rotWorld(B.LeftLeg, _right, lk);
  if (rk) rotWorld(B.RightLeg, _right, rk);
  h.model.position.y -= drop;
}

// 見回す：首と頭を、ばねで狙いの向きへ
function lookAround(h, B, dt, engaged, wIdle) {
  const u = h.u;
  const L = h.lk || (h.lk = { yaw: 0, pitch: 0, ty: 0, tp: 0, t: 1 + h.seed * 4 });
  L.t -= dt;
  if (engaged && u.target && u.target.pos) {
    // 敵の方へ（体の向きからのずれ）
    const tx = u.target.pos.x - u.pos.x, tz = u.target.pos.z - u.pos.z;
    let a = Math.atan2(tx, tz) - u.heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    L.ty = Math.max(-0.9, Math.min(0.9, a)); L.tp = 0;
  } else if (L.t <= 0) {
    // 時々、横や後ろの様子を見る。隊の崩れかけは落ち着きなく
    const nerv = u.group && u.group.morale < 40 ? 2 : 1;
    L.t = (1.5 + Math.random() * 4) / nerv;
    L.ty = Math.random() < 0.45 ? 0 : (Math.random() - 0.5) * 1.5 * Math.min(1, wIdle + 0.3);
    L.tp = (Math.random() - 0.6) * 0.25;
  }
  const k = Math.min(1, dt * 3.5);
  L.yaw += (L.ty - L.yaw) * k; L.pitch += (L.tp - L.pitch) * k;
  if (Math.abs(L.yaw) + Math.abs(L.pitch) < 0.01) return;
  rotWorld(B.Spine2, _up, L.yaw * 0.15);
  rotWorld(B.Neck, _up, L.yaw * 0.35);
  rotWorld(B.Head, _up, L.yaw * 0.45);
  rotWorld(B.Head, _right, L.pitch);
}

// 腕：右手は武器の握り、左手は柄の先。鉄砲の込め直し（槊杖で突き固める）、弓を引く、槍を持ち替える
const RIGHT_POLE = new THREE.Vector3(), LEFT_POLE = new THREE.Vector3();
function armsPose(h, B, dt, time, w) {
  const u = h.u;
  const hd = u.hand;
  // 弓：units.js が弓の手と右手の置き所（u.bowR）を動かす時はそれに従う。なければ、引く間は弓を顔の前へ上げる
  const own = u.bowPh !== undefined || u.gunPh !== undefined;
  if (w === 'bow' && !u.mounted && !own) bowHold(h, dt);
  hd.updateWorldMatrix(true, false);
  const e = hd.matrixWorld.elements;
  _tgt.set(e[12], e[13], e[14]);
  if (u.mounted) _tgt.y -= 0.18;   // 馬上の人は本編の形より肩が低いので、握りも下げる
  const dir = _dir.set(e[8], e[9], e[10]).normalize();
  RIGHT_POLE.copy(_right).multiplyScalar(0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  LEFT_POLE.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  if (w === 'bow' && own) {
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1));
    if (u.bowR) {
      _tgt2.copy(u.bowR).applyMatrix4(hd.parent.matrixWorld);
      const drawn = u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise';
      // 引く腕は肘を肩の高さで後ろへ張る
      ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, drawn ? _pole.copy(_right).multiplyScalar(0.8).addScaledVector(_up, 0.9).addScaledVector(_fwd, -0.9) : RIGHT_POLE);
      // 弦を引く手は指を矢の向き（弓の手の方）へ（指が上を向いて手を振るように見えない）
      if (drawn) straightWrist(B.RightForeArm, B.RightHand, B.RightHandMiddle1, _tgt);
      if (u.bowPh === 'draw' || u.bowPh === 'kai') { rotWorld(B.Neck, _up, -0.3); rotWorld(B.Head, _up, -0.25); }
    }
    return;
  }
  if (w === 'bow') {
    // 体は横を向く（左の肩を的へ）
    if ((h.bowK || 0) > 0.05) rotWorld(B.Spine1, _up, 0.35 * h.bowK);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1));
    // 右手：弦を引く（引くほど頬の横へ）。引かない時は矢を持って下ろす
    const k = h.bowK || 0;
    if (k > 0.05) {
      _tgt2.copy(_tgt).addScaledVector(_fwd, -0.12 - 0.5 * k).addScaledVector(_right, 0.06 + 0.1 * k).addScaledVector(_up, 0.03);
      ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _pole.copy(_right).addScaledVector(_up, 0.4 * k).addScaledVector(_fwd, -0.6));
      // 顔は的へ
      rotWorld(B.Neck, _up, -0.3 * k); rotWorld(B.Head, _up, -0.25 * k);
    }
    return;
  }
  if (!w || w === 'none') return;
  const shouldered = !u.mounted && (w === 'spear' ? (h.upK || 0) > 0.5 : w === 'gun' && hd.rotation.x < -0.4);
  const reload = w === 'gun' && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6 && !u.mounted;
  const aimGun = w === 'gun' && (u.gunPh !== undefined ? u.gunPh === 'aim' || u.gunPh === 'fire' : u.atk && u.atk.ranged);
  // 込め直し：units.js が左手の置き所（u.lh：筒先・火皿）を出す時はそれに従う
  if (w === 'gun' && u.lh && !u.mounted) {
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, RIGHT_POLE);
    _tgt2.set(u.lh[0], u.lh[1], u.lh[2]).applyMatrix4(hd.parent.matrixWorld);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-0.5).addScaledVector(_up, -0.4).addScaledVector(_fwd, -0.5));
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _right, 0.1);
    return;
  }
  if (reload && u.gunPh === undefined) { gunReload(h, B, dt, time, dir); return; }
  if (h.rod) h.rod.visible = false;
  // 右手：握り。鉄砲を構える時は肘を横へ張る
  if (aimGun) rotWorld(B.Spine1, _up, 0.12);
  const rp = aimGun ? _pole.copy(_right).addScaledVector(_up, 0.15).addScaledVector(_fwd, -0.4) : RIGHT_POLE;
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, rp);
  if (aimGun) {
    // 頬を台に付けて狙う：首を傾け、顔を下げる
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _fwd, -0.22);
  }
  // 馬上：左手は手綱（鞍の前）。馬の首の振りに合わせて前後する
  if (u.mounted) {
    // 手綱の置き所は馬が出す（鞍と一緒に揺れ、首の前後に引かれる）。なければ今の形の馬の首の振りから
    const Hh = u.horse && u.horse.userData.horse;
    if (Hh && Hh.hand) _tgt2.copy(Hh.hand).applyMatrix4(u.mesh.matrixWorld);
    else _tgt2.set(-0.08, 1.02 + RIDE.y, 0.42 + (Hh ? Hh.neck.rotation.x * 0.25 : 0)).applyMatrix4(u.mesh.matrixWorld);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-0.7).addScaledVector(_up, -1));
    return;
  }
  if (shouldered) return;   // 担いで歩く時は、左手は歩みに合わせて振る（録った動きのまま）
  // 左手：柄の先。待つ間は時々持ち替える（手を柄に沿ってずらし、握り直す）
  let k = w === 'sword' ? -0.13 : w === 'gun' ? 0.36 : 0.36 + (h.seed - 0.5) * 0.08, lift = 0;
  if (w === 'spear' && !u.atk && !(u.strikeT > 0)) {
    const G = h.grip || (h.grip = { k: 0, tk: 0, t: 3 + h.seed * 8, lift: 0 });
    G.t -= dt;
    if (G.t <= 0) { G.t = 5 + Math.random() * 9; G.tk = (Math.random() - 0.4) * 0.28; G.lift = 0.35; }
    G.lift = Math.max(0, G.lift - dt);
    G.k += (G.tk - G.k) * Math.min(1, dt * 3);
    k += G.k; lift = Math.sin(clamp01(G.lift / 0.35) * Math.PI) * 0.06;
  }
  if (h.far) return;   // 遠い人は左手を省く（録った動きのまま）
  _tgt2.copy(_tgt).addScaledVector(dir, k).addScaledVector(_right, -0.05).addScaledVector(_up, lift);
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
}

// 鉄砲の込め直し：筒を立て、左手で筒を支え、右手で火薬と玉を入れ、槊杖で突き固め、火皿に口薬を盛る
let ROD_GEO = null, ROD_MAT = null;
function gunReload(h, B, dt, time, dir) {
  const u = h.u;
  const cdB = Math.max(1.2, u.cdBase || 7);
  const p = clamp01((u.cd - 0.6) / (cdB - 0.6));   // 1 → 0
  // 左手：筒の中ほど
  _tgt2.copy(_tgt).addScaledVector(dir, 0.3).addScaledVector(_right, -0.04);
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
  // 槊杖（筒の先から出し入れする細い棒）
  if (!h.rod) {
    if (!ROD_GEO) { ROD_GEO = new THREE.CylinderGeometry(0.0055, 0.0055, 0.95, 4); ROD_GEO.rotateX(Math.PI / 2); ROD_GEO.translate(0, 0, 0.475); ROD_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 }); }
    h.rod = new THREE.Mesh(ROD_GEO, ROD_MAT); h.rod.castShadow = false;
    u.hand.add(h.rod);
  }
  const ph = (h.seed * 3 + time * 2.6) % 1;
  let reach;   // 右手の置き所：筒の軸に沿った長さ（握りから）
  if (p > 0.72) {
    // 火薬と玉を筒口へ（筒口の上で手を傾ける）
    h.rod.visible = false;
    reach = 1.0 + Math.sin(time * 5 + h.seed * 7) * 0.02;
    _tgt2.copy(_tgt).addScaledVector(dir, reach).addScaledVector(_fwd, 0.06).addScaledVector(_right, 0.02);
  } else if (p > 0.28) {
    // 槊杖で突き固める（上下に三度ほど）
    const stroke = Math.abs(Math.sin(ph * Math.PI)) ;
    const depth = 0.25 + stroke * 0.3;
    h.rod.visible = true;
    h.rod.position.set(0, 0.026, 0.98 - depth);
    reach = 1.2 - depth * 0.4;   // 槊杖を筒口の少し上で握って押し込む（手が笠より上へ行かない）
    _tgt2.copy(_tgt).addScaledVector(dir, reach).addScaledVector(_fwd, 0.015);
  } else {
    // 火皿に口薬を盛り、火蓋を閉じる
    h.rod.visible = false;
    reach = 0.05;
    _tgt2.copy(_tgt).addScaledVector(dir, 0.08).addScaledVector(_right, 0.07).addScaledVector(_fwd, 0.05);
  }
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _pole.copy(_right).addScaledVector(_up, -0.3).addScaledVector(_fwd, -0.3));
  // 手元を見る
  rotWorld(B.Neck, _right, 0.25); rotWorld(B.Head, _right, 0.12);
}

// 手首をまっすぐに：手の向きを前腕の向きにそろえる
const _sw0 = new THREE.Vector3(), _sw1 = new THREE.Vector3(), _sw2 = new THREE.Vector3();
// toward：指をその点の方へ向ける
function straightWrist(fore, hand, mid, toward = null) {
  if (!mid) return;
  fore.getWorldPosition(_sw0); hand.getWorldPosition(_sw1); mid.getWorldPosition(_sw2);
  const L = _sw2.distanceTo(_sw1);
  if (toward) v3.copy(toward).sub(_sw1); else v3.copy(_sw1).sub(_sw0);
  aimBone(hand, _sw2, v3.setLength(L).add(_sw1));
}
// 骨の入った人の武器の握り（u.hand）を、人の体に合う所へ置き直す（units.js が毎コマ決めた構えの上から）
// ・長柄（槍・薙刀）：構えは右手を右の腰の後ろ、左手を前に（肘を曲げて腰〜胸の高さ）。待つ・歩く時は槍を立てて石突を地面の近くへ
// ・鉄砲の込め直し：台尻を地面に着けて筒を立てる（筒先が胸の高さ。手が笠より上へ行かない）
// 武器は見た目だけ（当たりの計算は units.js の数で行う）なので、人の時だけ置き直してよい
const GUN_BUTT = 0.37;   // 鉄砲の握りから台尻の端まで（units.js の形）
function gripPose(h, dt) {
  const u = h.u, hd = u.hand, w = u.wpnKind || u.lookWeapon;
  if (!hd || !u.alive || u.mounted || !u.wpn) return;
  // units.js がこのコマに構えを置き直していなければ（画面の外など）、前のコマの置き直しのまま（二重にずらさない）
  const G = h.gset;
  if (G && hd.position.x === G[0] && hd.position.y === G[1] && hd.position.z === G[2] && hd.rotation.x === G[3]) return;
  gripSet(h, u, hd, w, dt);
  h.gset = [hd.position.x, hd.position.y, hd.position.z, hd.rotation.x];
}
function gripSet(h, u, hd, w, dt) {
  if (w === 'spear') {
    const g0 = h.grip0 || (h.grip0 = { x: hd.position.x, y: hd.position.y });
    const wp = u.wpn;
    // 待つ・歩く（構えていない）時は槍を立てる
    const calm = !u.target && !u.atk && !u.pAtk && !u.isPlayer && !u.swing && !(u.cheer > 0) && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.sweepT > 0) && hd.rotation.x < -0.4;
    h.upK = (h.upK ?? (calm ? 1 : 0)) + ((calm ? 1 : 0) - (h.upK ?? 0)) * Math.min(1, dt * 5);
    const k = h.upK, s = h.seed;
    // 構え：右手は右の腰（体の少し後ろ）、槍は units.js の向きのまま。叩きで振り上げる時は手も上がる
    const raise = Math.max(0, -hd.rotation.x - 0.25) * 0.28;
    const ex = 0.2 + (s - 0.5) * 0.03, ey = 1.08 + (s - 0.5) * 0.06 + raise, ez = hd.position.z - 0.16;
    // 立て槍：右手は胸の右、穂先を少し前へ。歩く・走るほど前へ傾ける
    const mv = Math.min(1, (u.moving || 0) / 1.4);
    const ux = 0.23, uy = 1.2 + (s - 0.5) * 0.04, uz = 0.1, urx = -1.47 + 0.06 * s + 0.25 * mv;
    hd.position.set(ex + (ux - ex) * k, ey + (uy - ey) * k, ez + (uz - ez) * k);
    if (k > 0.001) {
      hd.rotation.x += (urx - hd.rotation.x) * k;
      hd.rotation.y *= 1 - k;
      // 石突が地面の少し上に来るよう、柄の握る所をずらす
      const butt = wp.userData.butt ?? -1.5, sp = Math.sin(-hd.rotation.x);
      const slide = Math.max(-0.3, Math.min(0.9, (0.05 - hd.position.y) / Math.max(0.3, sp) - butt));
      wp.position.z += (slide - wp.position.z) * k;
    }
  } else if (w === 'gun' && u.gunPh === undefined && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6) {
    // units.js が込め直しの形を出さない時（下の gunReload）：筒を立てて台尻を地面へ
    hd.rotation.x = -1.45;
    hd.position.y = 0.04 + GUN_BUTT * Math.sin(1.45);
  } else if (w === 'gun' && (u.gunPh === 'ready' || u.gunPh === 'kiri')) {
    // 構え：銃を腰の前に引き寄せる（腕を前へ突き出さない）
    hd.position.z -= 0.09; hd.position.x -= 0.02;
    if (u.lh) u.lh = [u.lh[0] - 0.02, u.lh[1], u.lh[2] - 0.09];
  } else if (w === 'gun' && u.lh && (u.gunPh === 'lower' || u.gunPh === 'powder' || u.gunPh === 'ball' || u.gunPh === 'ram')) {
    // 台尻を地面へ：筒を立てたまま下げる。左手の置き所（u.lh）も同じだけ下げる
    const sp = Math.sin(Math.max(0.3, -hd.rotation.x));
    const dy = Math.min(0, 0.04 + GUN_BUTT * sp - hd.position.y);
    hd.position.y += dy;
    u.lh = [u.lh[0], u.lh[1] + dy, u.lh[2]];
  }
}
// 人をやめる時は、握りを units.js の所へ戻す
function gripReset(h) {
  const u = h.u;
  if (h.grip0 && u.hand) { u.hand.position.x = h.grip0.x; u.hand.position.y = h.grip0.y; h.upK = 0; }
  h.gset = null;
}

// 弓の手（u.hand）：引く間は顔の前、終われば脇へ戻す
function bowHold(h, dt) {
  const u = h.u, hd = u.hand;
  if (!h.bow0) h.bow0 = { x: hd.position.x, y: hd.position.y, z: hd.position.z };
  const drawing = u.atk && u.atk.ranged;
  const want = drawing ? 1 - clamp01(u.atk.t / Math.max(0.2, u.windup || 0.5)) : 0;
  // 構えて打ち起こし（手を上げる）→ 引き分け（弦を引く）
  h.bowUp = (h.bowUp || 0) + ((drawing ? 1 : 0) - (h.bowUp || 0)) * Math.min(1, dt * (drawing ? 6 : 3));
  h.bowK = (h.bowK || 0) + (want * h.bowUp - (h.bowK || 0)) * Math.min(1, dt * 10);
  if (!drawing && h.bowUp < 0.01 && !h.bowMoved) return;
  const k = h.bowUp, o = h.bow0;
  hd.position.set(o.x + (-0.02 - o.x) * k, o.y + (1.45 - o.y) * k, o.z + (0.5 - o.z) * k);
  hd.rotation.z = 0.12 * k;
  h.bowMoved = k > 0.01;
}
function rideHuman(h, dt) {
  const u = h.u, B = h.bones;
  const H = u.horse && u.horse.userData.horse;
  // 脚：腿を前へ上げて開き、膝を曲げて鐙へ
  rotWorld(B.RightUpLeg, _right, -1.35); rotWorld(B.LeftUpLeg, _right, -1.35);
  rotWorld(B.RightUpLeg, _fwd, -0.35); rotWorld(B.LeftUpLeg, _fwd, 0.35);
  rotWorld(B.RightLeg, _right, 1.45); rotWorld(B.LeftLeg, _right, 1.45);
  // 腰の高さを鞍へ。馬の背の上下・前後の揺れは、乗り手の入れ物（u.seat）が鞍の骨からそのまま受ける
  const spd = H ? H.speed || 0 : h.spd;
  h.model.position.y = RIDE.y + 0.79 - SRC.rest.Hips.y;
  h.model.position.z = -0.04;
  // 鞍の傾き（竿立ちで前が上がる）：上体は前へ倒して釣り合いを取る
  const se = u.seat ? u.seat.matrix.elements : null;
  const up = se ? Math.asin(Math.max(-1, Math.min(1, se[9]))) : 0;
  // 鞍の上下の弾みを、上体が遅れて受ける（ばね）：駆けると背が波打ち、頭は静かに保つ
  const sy = se ? se[13] : 0;
  const R = h.rs || (h.rs = { y: sy, v: 0 });
  R.v += ((sy - R.y) * 160 - R.v * 14) * dt; R.y += R.v * dt;
  const bob = Math.max(-0.25, Math.min(0.25, (sy - R.y) * 6));
  // 上体：速いほど前へ、曲がる時は内へ、止まる時は後ろへ体を残す
  const charge = u.charging ? 0.12 : 0;
  const lean = Math.min(0.1, spd * 0.01) + charge - Math.min(0.2, (h.decel || 0) * 0.25) + Math.max(0, up) * 0.55;
  rotWorld(B.Spine, _right, lean + bob * 0.5);
  rotWorld(B.Spine2, _right, -bob * 0.35);
  rotWorld(B.Spine, _fwd, -(h.turn || 0) * 0.25);
}
// 草摺・袖の揺れ（ばね）
// 支点（体の座標）：草摺は腰、袖は肩、陣羽織は肩の下、母衣は背の上
const PIVOT = { hips: [0, 0.9, 0.0], sodeP: [0.2, 1.43, 0], sodeN: [-0.2, 1.43, 0], haori: [0, 1.42, -0.1], back: [0, 1.64, -0.3] };
const SWAY_K = { hips: 0.5, sodeP: 0.8, sodeN: 0.8, haori: 0.9, back: 1.1 };
const _pv3 = new THREE.Matrix4(), _pr = new THREE.Matrix4(), _sm = new THREE.Matrix4();
function sway(h, dt) {
  const u = h.u;
  // 上下の弾み（歩み・駆け足・馬の背）と、前後の速さの変わり、曲がる速さ。高さは世界の座標で（馬上は鞍の揺れも入る）
  const yNow = h.model.matrixWorld.elements[13];
  const s = h.sw || (h.sw = { a: 0, va: 0, b: 0, vb: 0, py: yNow, ps: 0 });
  const vy = dt > 0 ? (yNow - s.py) / dt : 0; s.py = yNow;
  const acc = dt > 0 ? (h.spd - s.ps) / dt : 0; s.ps = h.spd;
  // 目標の角度へばねで寄る（遅れて揺れる）。弾みが大きいほど大きく
  const want = Math.max(-0.4, Math.min(0.4, -vy * 0.07 - acc * 0.02 + Math.min(0.25, h.spd * 0.025)));
  const k = Math.min(dt, 1 / 30);
  s.va += ((want - s.a) * 90 - s.va * 8) * k; s.a += s.va * k;
  const wantB = Math.max(-0.3, Math.min(0.3, (h.turn || 0) * 0.12));
  s.vb += ((wantB - s.b) * 60 - s.vb * 7) * k; s.b += s.vb * k;
  // 母衣のふくらみ：止まるとしぼんで垂れ、駆けると風をはらんで後ろへなびく（0..1。ふくらむのは速く、しぼむのはゆっくり）
  const infW = Math.max(0, Math.min(1, (h.spd - 1.2) / 5.5));
  s.inf = (s.inf ?? infW) + (infW - (s.inf ?? infW)) * Math.min(1, k * (infW > (s.inf ?? 0) ? 3 : 1.2));
  for (const key in PIVOT) {
    const [x, y, z] = PIVOT[key], K = SWAY_K[key];
    // 前へ出る向きの揺れは袖・草摺は小さく、後ろへなびく物（陣羽織・母衣）は大きく
    const ax = key === 'haori' || key === 'back' ? -Math.abs(s.a) * K - 0.02 - (key === 'back' ? s.inf * 0.35 : 0) : s.a * K;
    _pr.makeRotationFromEuler(_eu.set(ax, 0, s.b * (key === 'back' ? 1 : 0.5)));
    if (key === 'back') {
      // 形は半ばふくらんだ所で作ってある：しぼむと薄く、少し長く垂れる。駆けると厚く丸く
      const f = s.inf, t = h.clock || 0;
      const flap = f * 0.04 * Math.sin(t * 9 + h.seed * 6) + f * 0.025 * Math.sin(t * 15.3);
      _pr.multiply(m0.makeScale(0.84 + 0.24 * f + flap * 0.5, 1.08 - 0.1 * f, 0.6 + 0.65 * f + flap));
    }
    if (h.xb) {
      // まとめた形：揺れる部品の骨を回す（体の座標の支点のまわり → 親の骨の座標へ）
      const bn = h.xb[PART_BONE[key]], par = XB[PART_BONE[key]];
      const Rm = restMatrix(par), Ri = restInverse(par);
      _sm.copy(SRC.fitT).multiply(_pv3.makeTranslation(x, y, z)).multiply(_pr).multiply(m1.makeTranslation(-x, -y, -z)).multiply(SRC.fitTi);
      bn.matrix.copy(Ri).multiply(_sm).multiply(Rm);
      continue;
    }
    const p = h.parts[key];
    if (!p) continue;
    const m0_ = p.userData.m0 || (p.userData.m0 = p.matrix.clone());
    p.matrix.copy(m0_).multiply(_pv3.makeTranslation(x, y, z)).multiply(_pr).multiply(m1.makeTranslation(-x, -y, -z));
  }
}
const _eu = new THREE.Euler();
const restInvs = {};
function restInverse(nm) { return restInvs[nm] || (restInvs[nm] = restMatrix(nm).clone().invert()); }

// ---------------- 近い者を選んで入れ替える ----------------
const humans = new Set();
let madeThisFrame = 0, frameT0 = 0;
// 一コマに作る数は時間で決める（一人は必ず。重い時は次のコマへ回す）
const canMake = () => madeThisFrame < 1 || (madeThisFrame < 8 && performance.now() - frameT0 < HUM.budget);
function useHuman(u, force = false) {
  // 本物の胴丸を着るはずの人を、胴丸を読む前に作っていたら作り直す
  if (u.human && !u.human.domaru && DOMARU.ready && (wantsDomaru(u.human.look) || crowdDomaru(u.human.look)) && (force || canMake())) {
    dropHuman(u);
    u.human.root.parent?.remove(u.human.root);
    u.human = null;
  }
  if (!u.human) {
    if (!force && !canMake()) return false;
    madeThisFrame++;
    u.human = makeHuman(u, u.look || {});
    u.mesh.add(u.human.root);
  }
  const h = u.human;
  // 馬上の人は鞍の入れ物（u.seat）に入れる
  const par = u.mounted && u.seat ? u.seat : u.mesh;
  if (h.root.parent !== par) par.add(h.root);
  if (!h.root.visible || !humans.has(h)) { h.root.visible = true; humans.add(h); h.last.copy(u.pos); h.acc = 1; }
  if (u.body) u.body.visible = false;
  if (u.legL) { u.legL.visible = false; u.legR.visible = false; }
  carryFlag(h, true);
  return true;
}
function dropHuman(u) {
  const h = u.human;
  if (!h) return;
  h.root.visible = false;
  humans.delete(h);
  carryFlag(h, false);
  if (h.bow0 && u.hand) { u.hand.position.set(h.bow0.x, h.bow0.y, h.bow0.z); u.hand.rotation.z = 0; h.bowUp = h.bowK = 0; h.bowMoved = false; }
  if (h.rod) h.rod.visible = false;
  cmdOff(h);
  gripReset(h);
  if (u.body) u.body.visible = true;
  if (u.legL) { u.legL.visible = true; u.legR.visible = true; }
}
// 背の指物を背骨に付ける（走る・屈む・馬の上で揺れる体について行く）。外す時は元の所へ
function carryFlag(h, on) {
  const u = h.u, f = u.flag;
  if (!f) return;
  if (f.userData.baseY == null) f.userData.baseY = f.position.y - (u.mounted ? RIDE.y : 0);
  const base = f.userData.baseY;
  if (on) {
    if (!h.flagHolder) {
      const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(restInverse('Spine2'));
      h.bones.Spine2.add(g); h.flagHolder = g;
    }
    if (f.parent === h.flagHolder && h.flagMounted === !!u.mounted) return;
    h.flagHolder.add(f);
    h.flagMounted = !!u.mounted;
    f.position.y = base + (u.mounted ? SRC.rest.Hips.y - 0.79 : 0);
  } else if (h.flagHolder && f.parent === h.flagHolder) {
    (u.mounted && u.seat ? u.seat : u.mesh).add(f);
    f.position.y = base + (u.mounted ? RIDE.y : 0);
  }
}
// 毎コマ：本人・カメラの近くの兵・名のある武将を骨の入った人で描く（battle.js から）
let lastArmy = null;
const _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere(new THREE.Vector3(), 2.2);
export const HSTAT = { made: 0, driven: 0, ms: 0, want: 0 };
export function updateHumans(rt, dt) {
  madeThisFrame = 0; madeFaces = 0; frameT0 = performance.now();
  WORLD = rt.world;
  const army = rt.army, cam = rt.camera;
  // 戦が替わったら、前の戦の人と馬を忘れる
  if (army !== lastArmy) { humans.clear(); horsesOn.clear(); lastArmy = army; }
  const horses = updateHorses(rt);
  try { humansStep(rt, dt, army, cam); } finally {
    // 鐙・手綱は乗り手の骨が動いた後で置く
    for (const [h, u] of horses) if (h.userData.horse.real && h.userData.horse.real.on) placeHorseExtras(h, u);
  }
  HSTAT.ms = performance.now() - frameT0;
}
function humansStep(rt, dt, army, cam) {
  const on = HUM.on && HUM.ready;
  if (!on) { for (const h of [...humans]) dropHuman(h.u); if (HUM.on && !loading) loadHumans(); return; }
  const Q = HUM_Q[S.quality] || HUM_Q.high;
  const cx = cam.position.x, cz = cam.position.z;
  cam.updateMatrixWorld();
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pv);
  const cand = [];
  for (const u of army.units) {
    if (u.gone || !u.mesh || u.type === 'dummy') continue;
    const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
    const named = u.look && isNamed(u.look);
    const lim = u.isPlayer ? 1e9 : named ? (Q.far ?? HUM.far) : Q.near;
    if (d >= lim) continue;
    if (!dmLoading && (wantsDomaru(u.look) || crowdDomaru(u.look))) loadDomaru();
    // 倒れた者：カメラの近く（HUM.dead より手前）は人にする（寝た体が棒や丸太に見えないよう）。その先は、もう人になっている者だけ（倒れてしばらく）
    if (!u.alive && d >= HUM.dead && !(u.human && humans.has(u.human) && (u.human.deadAge || 0) < 40)) continue;
    _sph.center.set(u.pos.x, u.pos.y + 1.2, u.pos.z);
    const vis = u.isPlayer || _fr.intersectsSphere(_sph);
    // 画面の中を先に。今もう人の者は少し優先（境目で入れ替わりが続かないように）
    let pr = u.isPlayer ? -1 : (named ? d * 0.5 : d) + (u.alive ? 0 : 12) + (vis ? 0 : 30);
    if (u.human && humans.has(u.human)) pr *= u.alive ? 0.9 : 0.6;   // 倒れた人は、人と軽い形を行き来させない
    cand.push({ u, d: pr, dist: d, vis });
  }
  cand.sort((a, b) => a.d - b.d);
  const want = new Map();
  for (let i = 0; i < cand.length && want.size < Q.max; i++) want.set(cand[i].u, cand[i]);
  for (const h of [...humans]) if (!want.has(h.u) || h.u.gone) dropHuman(h.u);
  HSTAT.want = want.size; HSTAT.driven = 0;
  for (const [u, c] of want) {
    if (!useHuman(u, u.isPlayer)) continue;
    const h = u.human;
    if (!u.alive) h.deadAge = (h.deadAge || 0) + dt; else h.still = false;
    // 武器の握りは毎コマ（動きを間引く人でも、武器が units.js の所へ跳ねないよう）
    gripPose(h, dt);
    h.acc += dt;
    // 画面の外の人は動きを省く
    if (!c.vis) continue;
    // 倒れ切った人は動かさない（最後の姿勢のまま固める。人に作り直した時は、倒れ切った姿勢で一度だけ動かす）
    if (!u.alive && h.still) continue;
    const d = c.dist;
    // 遠いほど動かす回数を間引く（近い 18m までは毎コマ、その先は一秒に 20 回・10 回）。倒れる途中は毎コマ（根元の回りと骨がずれてガタつかないよう）
    const every = u.isPlayer || !u.alive || d < HUM.ik ? 0 : d < 30 ? 1 / 20 : 1 / 10;
    if (h.acc < every) continue;
    const step = Math.min(0.1, h.acc); h.acc = 0;
    // 馬上の人：兵の根元と鞍の入れ物の行列を今のコマに合わせてから動かす
    if (u.mounted && u.seat) { u.mesh.updateMatrix(); u.mesh.updateWorldMatrix(false, false); u.seat.updateWorldMatrix(false, false); }
    if (h.xb) crowdFace(h, d < HUM.face && u.alive);
    h.far = !u.isPlayer && d > HUM.lite;
    driveHuman(h, step, u.isPlayer || d < HUM.fine, true);
    HSTAT.driven++;
    // 倒れる動き（units.js の animDeath）が終わっていれば、ここで固める
    if (!u.alive && (u.death ? u.death.t >= DEATH_END : (u.deadT || 0) >= 1)) h.still = true;
  }
  HSTAT.made += madeThisFrame;
}
// 見本の画面（tools/inspect.js）から：一人を人にして、一コマ動かす
export function showHuman(u) { madeThisFrame = -99; madeFaces = -99; const ok = useHuman(u, true); if (ok && u.human.xb) crowdFace(u.human, true); return ok; }
export function stepHuman(u, dt) { if (u.human) { gripPose(u.human, dt); driveHuman(u.human, dt); } }
// 人の数（重さを見るため）
export function humanCount() { return humans.size; }
export function restOf(nm) { return SRC && SRC.rest[nm]; }

// ---------------- 本物の馬（骨の入った馬） ----------------
// ・形と動き：assets/horse_lite/horse.glb（tools/horse.mjs で軽くした物。src/asset_horse.js に base64 で入れてある）
// ・作者表記（CC BY 4.0）：This work is based on "Horse" by henrysteve973（docs/CREDITS.md）
// ・本人の馬・名のある武将の馬・カメラの近く（30m ほど）の馬だけを骨の入った馬にする。遠くは units.js の今の形のまま
// ・今の形の馬（buildHorse の root）の子に付け、今の形は隠す。動かすのは units.js の animateHorse から（HORSE_HOOK）
// ・洋鞍は描かず、和鞍（漆の前輪・後輪、鞍褥、障泥）・舌長鐙・手綱・胸繋と尻繋の房を骨に付けて作る
// ・毛色は色の絵（明るさだけにしてある）に色を掛けて、栗毛・鹿毛・青毛などにする
export const HORSE = { on: true, ready: false, failed: false, near: 30, far: 34, max: 14, lod: 14 };
// 画質ごとの数（騎馬の突撃が一面の本物の馬に見えるよう「高」は多め）
const HORSE_Q = { high: { near: 40, far: 44, max: 24 }, mid: { near: 30, far: 34, max: 12 }, low: { near: 0, far: 0, max: 1 } };
let HR = null, hrLoading = null;
const HS = 1.3 / 15.9;      // 元の形の単位 → m（肩の高さを 1.3m に）
const HX = 0.039;           // 元の形は左右が少しずれているので、真ん中へ
const SEAT_B = 'BN_Spine_01_03_03', CHEST_B = 'BN_Spine_03_05_05', HIP_B = 'BN_Pelvis_060_066', HEAD_B = 'BN_Head_01_029_028', POLL_B = 'BN_Head_00_016_015', LIP_B = 'BN_UP_Lip_030_029';
export function loadHorse() {
  if (hrLoading) return hrLoading;
  hrLoading = (async () => {
    const b64 = (await import('./asset_horse.js')).default;
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const tl = new THREE.TextureLoader();
    const names = ['horse_col', 'horse_nrm', 'hair_col', 'hair_nrm', 'shoe_col', 'tack_col'];
    const [gl, ...ts] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...names.map((n) => tl.loadAsync(new URL('../assets/horse_lite/' + n + '.jpg', import.meta.url).href)),
    ]);
    const tex = {};
    names.forEach((n, i) => { const t = ts[i]; t.flipY = false; t.anisotropy = 4; if (/col$/.test(n)) t.colorSpace = THREE.SRGBColorSpace; tex[n] = t; });
    prepHorse(gl, tex);
    HORSE.ready = true;
    HORSE_HOOK.drive = driveHorse;
  })().catch((e) => { HORSE.failed = true; HORSE.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の馬を読めませんでした（今の形の馬で描きます）', e); });
  return hrLoading;
}
function prepHorse(gl, tex) {
  const sc = gl.scene;
  const lo = {}, rm = [];
  sc.traverse((o) => { if (o.isSkinnedMesh && /_lo$/.test(o.name)) { lo[o.name.replace(/^horse_|_lo$/g, '')] = o.geometry; rm.push(o); } });
  for (const o of rm) o.parent.remove(o);
  const holder = new THREE.Group();
  holder.scale.setScalar(HS); holder.position.x = HX;
  holder.add(sc); holder.updateMatrixWorld(true);
  const bones = {};
  sc.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // 骨の立ち姿の行列（馬の根元の座標、m）
  const rest = {}, restInv = {};
  for (const nm of [SEAT_B, CHEST_B, HIP_B, HEAD_B, POLL_B, LIP_B]) { rest[nm] = bones[nm].matrixWorld.clone(); restInv[nm] = rest[nm].clone().invert(); }
  const P = (nm) => new THREE.Vector3().setFromMatrixPosition(rest[nm]);
  // 銜（はみ）の位置：上唇から頭の方へ少し戻った、口の両脇
  const lip = P(LIP_B), poll = P(POLL_B);
  const bit = lip.clone().lerp(poll, 0.16);
  holder.remove(sc);
  const clips = {};
  for (const c of gl.animations) clips[c.name] = c;
  HR = { scene: sc, lo, tex, rest, restInv, clips, bitL: bit.clone().setX(bit.x + 0.05), bitR: bit.clone().setX(bit.x - 0.05), head0: P(HEAD_B), pool: [], mats: new Map(), tack: new Map() };
}

// ---- 材質 ----
const _lin = (hex) => new THREE.Color(hex);
function horseMaterials(st) {
  const pts = st.points ?? 0;
  const k = [st.coat, st.mane, pts, st.tack].join('|');
  if (HR.mats.has(k)) return HR.mats.get(k);
  const T = HR.tex;
  // 体：色の絵は明るさだけ（毛の基準が 0.5）。毛色を掛ける。鹿毛は脚先を黒く、どの毛色も鼻づらは暗い肌
  const coat = _lin(st.coat), mane = _lin(st.mane);
  const body = new THREE.MeshStandardMaterial({ map: T.horse_col, normalMap: T.horse_nrm, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.58, metalness: 0 });
  body.color.copy(coat).multiplyScalar(0.85 / 0.214);
  const U = { uPR: { value: new THREE.Vector3(mane.r / Math.max(0.002, coat.r), mane.g / Math.max(0.002, coat.g), mane.b / Math.max(0.002, coat.b)).clampScalar(0, 1.5) }, uPts: { value: pts } };
  body.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vHP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHP = position;');
    sh.fragmentShader = 'uniform vec3 uPR;\nuniform float uPts;\nvarying vec3 vHP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float legs = smoothstep(64.0, 44.0, vHP.y) * uPts;
        diffuseColor.rgb *= mix(vec3(1.0), uPR, legs);
        float muzzle = smoothstep(212.0, 226.0, vHP.z) * step(110.0, vHP.y);
        diffuseColor.rgb *= 1.0 - muzzle * 0.45;
      }`);
  };
  body.customProgramCacheKey = () => 'horsebody';
  // 鬣と尾：絵の暗い所は抜く
  const hair = new THREE.MeshStandardMaterial({ map: T.hair_col, alphaMap: T.hair_col, alphaTest: 0.32, normalMap: T.hair_nrm, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  hair.color.copy(mane).multiplyScalar(1 / 0.35);
  const shoe = new THREE.MeshStandardMaterial({ map: T.shoe_col, roughness: 0.7, color: 0x6a625a });
  const eye = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08, metalness: 0 });
  // 面繋：革の絵の明るさに、拵えの色を掛ける
  const bridle = new THREE.MeshStandardMaterial({ map: T.tack_col, roughness: 0.6, metalness: 0, color: _lin(st.tack).multiplyScalar(2.6) });
  const m = { body, hair, shoe, eye, bridle };
  HR.mats.set(k, m);
  return m;
}
const TACK_GLOSS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 });
const TACK_MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });

// ---- 和鞍・胸繋・尻繋（馬の根元の座標、m。立ち姿で作って骨に付ける） ----
function colGeo(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = _lin(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const mergeG = (list) => {
  // 位置・法線・色だけの三角形を一つにまとめる
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3));
  m.computeBoundingSphere();
  return m;
};
const tf = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };
// 前輪・後輪の形（下の真ん中を原点に、上へ h、左右へ w。背の上に鞍橋の刳り）
function archShape(w, h, wi, hi) {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.bezierCurveTo(-w * 1.02, h * 0.62, -w * 0.62, h, 0, h);
  s.bezierCurveTo(w * 0.62, h, w * 1.02, h * 0.62, w, 0);
  s.lineTo(wi, 0);
  s.bezierCurveTo(wi * 0.95, hi * 1.3, -wi * 0.95, hi * 1.3, -wi, 0);
  s.closePath();
  return s;
}
function strap(pts, r) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length * 6, r, 5, false); }
// 房：紐の点から垂れる。上に結び玉
const TASSEL = new Map();
function tassel(G, M, x, y, z, st, len, big) {
  const r = big ? 0.04 : 0.03;
  const k = r + '|' + len;
  if (!TASSEL.has(k)) {
    // 房の形：細い首から、ふくらんで垂れる糸の束（縦の筋）
    const pts = [[0.001, 0], [0.012, -0.004], [0.009, -0.02], [r * 0.55, -0.05], [r * 0.95, -len * 0.55], [r, -len * 0.92], [r * 0.7, -len], [0.001, -len]].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(pts, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 + 0.12 * Math.max(0, Math.sin(a * 6)) * Math.min(1, -p.getY(i) / 0.06); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    g.computeVertexNormals();
    TASSEL.set(k, g);
  }
  M.push(colGeo(tf(TASSEL.get(k).clone(), x, y - 0.006, z), st.tassels));
  if (big) G.push(colGeo(tf(new THREE.SphereGeometry(0.016, 8, 6), x, y - 0.008, z), 0xc9a24a));
}
function tackGeometry(st) {
  const key = [st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (HR.tack.has(key)) return HR.tack.get(key);
  const big = !!st.big;
  const out = {};
  // 鞍（背の骨）
  {
    const G = [], M = [];
    const ex = { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 };
    const front = new THREE.ExtrudeGeometry(archShape(0.2, 0.33, 0.1, 0.12), ex); front.translate(0, 0, -0.014);
    const back = new THREE.ExtrudeGeometry(archShape(0.215, 0.29, 0.1, 0.11), ex); back.translate(0, 0, -0.014);
    G.push(colGeo(tf(front.clone(), 0, 1.2, 0.19, -0.1), st.saddle));
    G.push(colGeo(tf(back.clone(), 0, 1.18, -0.2, 0.5), st.saddle));
    // 縁（名のある武将は金、ほかは朱の漆）
    const rim = st.rim || 0x5a1a12;
    const fr = new THREE.ExtrudeGeometry(archShape(0.212, 0.343, 0.09, 0.11), { ...ex, depth: 0.01 }); fr.translate(0, 0, -0.005);
    const br = new THREE.ExtrudeGeometry(archShape(0.227, 0.302, 0.09, 0.1), { ...ex, depth: 0.01 }); br.translate(0, 0, -0.005);
    G.push(colGeo(tf(fr, 0, 1.194, 0.186, -0.1), rim));
    G.push(colGeo(tf(br, 0, 1.175, -0.196, 0.5), rim));
    // 居木（前輪と後輪をつなぐ板）
    for (const sd of [1, -1]) G.push(colGeo(tf(new THREE.BoxGeometry(0.1, 0.026, 0.42), sd * 0.085, 1.3, -0.005, 0, 0, -sd * 0.32), st.saddle));
    // 鞍褥（座る所の敷物）
    const cu = new THREE.SphereGeometry(1, 14, 8); cu.scale(0.15, 0.036, 0.17);
    M.push(colGeo(tf(cu, 0, 1.335, -0.01), st.cushion));
    // 下鞍（背を覆う布）：胴の丸みに沿う
    const sh = new THREE.CylinderGeometry(0.262, 0.262, 0.56, 22, 1, true, Math.PI - 1.48, 2.96);
    sh.rotateX(Math.PI / 2); sh.scale(1, 1.06, 1);
    M.push(colGeo(tf(sh, 0, 1.0, -0.01), st.cushion));
    // 障泥（泥よけ）：鞍の下に左右へ大きく垂れる。縁は紐の色
    for (const sd of [1, -1]) {
      const s = new THREE.Shape();
      const W = 0.17, H = 0.3, r = 0.11;
      s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, -H + r); s.quadraticCurveTo(W, -H, W - r, -H); s.lineTo(-W + r, -H); s.quadraticCurveTo(-W, -H, -W, -H + r); s.closePath();
      const a = new THREE.ShapeGeometry(s, 6); a.rotateY(sd * Math.PI / 2);
      M.push(colGeo(tf(a, sd * 0.262, 1.13, -0.06, 0, 0, sd * 0.06), st.aori));
      const s2 = new THREE.ShapeGeometry(s, 6); s2.scale(1.05, 1.05, 1); s2.rotateY(sd * Math.PI / 2);
      M.push(colGeo(tf(s2, sd * 0.258, 1.14, -0.06, 0, 0, sd * 0.06), st.tack));
    }
    out.seat = [mergeG(G), mergeG(M)];
  }
  // 胸繋（胸の骨）：鞍の前から胸の前を回る。房を下げる
  {
    const G = [], M = [];
    const pts = [[0.2, 1.17, 0.16], [0.235, 1.07, 0.36], [0.19, 0.98, 0.54], [0.1, 0.945, 0.63], [0, 0.94, 0.655]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    M.push(colGeo(strap(all, 0.013), st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const n = big ? 7 : 5;
    for (let i = 0; i < n; i++) { const p = cv.getPointAt(0.3 + 0.4 * i / (n - 1)); tassel(G, M, p.x, p.y - 0.01, p.z, st, big ? 0.2 : 0.14, big); }
    out.chest = [G.length ? mergeG(G) : null, mergeG(M)];
  }
  // 尻繋（腰の骨）：鞍の後ろから尻を回り、尾の下を通る。脇に房（厚総）を下げる
  {
    const G = [], M = [];
    const pts = [[0.2, 1.16, -0.22], [0.25, 1.12, -0.42], [0.262, 1.06, -0.6], [0.17, 1.03, -0.75], [0, 1.03, -0.815]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    M.push(colGeo(strap(all, 0.014), st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const ts = big ? [0.08, 0.14, 0.2, 0.26, 0.32, 0.68, 0.74, 0.8, 0.86, 0.92] : [0.12, 0.22, 0.32, 0.68, 0.78, 0.88];
    for (const t of ts) { const p = cv.getPointAt(t); tassel(G, M, p.x * 1.03, p.y - 0.01, p.z, st, big ? 0.26 : 0.17, big); }
    out.hip = [G.length ? mergeG(G) : null, mergeG(M)];
  }
  HR.tack.set(key, out);
  return out;
}
// 鐙（舌長鐙）：吊る所を原点に、舌（足を載せる長い板）と鳩胸（爪先を覆う）
let STIRRUP = null;
function stirrupGeo() {
  if (STIRRUP) return STIRRUP;
  const G = [];
  const lac = 0x141010;
  G.push(colGeo(tf(new THREE.BoxGeometry(0.1, 0.012, 0.3), 0, -0.2, -0.05), lac));
  const hood = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); hood.scale(0.058, 0.1, 0.075);
  G.push(colGeo(tf(hood, 0, -0.195, 0.045), lac));
  G.push(colGeo(tf(new THREE.BoxGeometry(0.03, 0.12, 0.018), 0, -0.065, 0.035, 0.25), lac));
  G.push(colGeo(tf(new THREE.TorusGeometry(0.018, 0.005, 5, 10), 0, 0, 0, 0, Math.PI / 2), 0x3a3634));
  // 舌の内側（朱）
  G.push(colGeo(tf(new THREE.BoxGeometry(0.086, 0.004, 0.2), 0, -0.192, -0.08), 0x7a1a12));
  STIRRUP = mergeG(G);
  return STIRRUP;
}
// 細い紐（手綱・力革）：長さ 1 の円柱を、二点の間に伸ばして置く
const ROPE = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); g.translate(0, 0.5, 0); return g; })();
const _ry = new THREE.Vector3(0, 1, 0), _rd = new THREE.Vector3();
function ropeBetween(m, a, b, r) {
  _rd.copy(b).sub(a);
  const L = _rd.length() || 1e-4;
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_ry, _rd.multiplyScalar(1 / L));
  m.scale.set(r, L, r);
}

// ---- 一頭を作る・拵える ----
const RAIL = ['idle1', 'idle2', 'idle3', 'walk', 'walkL', 'walkR', 'gallop', 'gallopL', 'gallopR', 'stop', 'buck1', 'death'];
function makeRealHorse() {
  const holder = new THREE.Group();
  holder.scale.setScalar(HS); holder.position.x = HX;
  const sc = skClone(HR.scene);
  holder.add(sc);
  const R = { holder, sc, bones: {}, meshes: {}, act: {}, extra: new THREE.Group(), on: false, style: null, tack: [], w: {}, t: {} };
  sc.traverse((o) => {
    if (o.isBone) R.bones[o.name] = o;
    if (o.isSkinnedMesh) { R.meshes[o.name.replace(/^horse_|_hi$/g, '')] = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  // 遠めは面を減らした形（影を描く時も）
  for (const k of ['body', 'hair']) {
    const m = R.meshes[k], hi = m.geometry, lo = HR.lo[k];
    m.onBeforeRender = (r, s, cam) => {
      const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
      const want = !cam.isOrthographicCamera && d2 < HORSE.lod * HORSE.lod ? hi : lo;
      if (m.geometry !== want) m.geometry = want;
    };
  }
  R.mixer = new THREE.AnimationMixer(sc);
  for (const k of RAIL) { const a = R.mixer.clipAction(HR.clips[k]); a.play(); a.enabled = false; a.timeScale = 0; R.act[k] = a; R.w[k] = 0; R.t[k] = Math.random() * HR.clips[k].duration; }
  // 鐙・力革・手綱（馬の根元の座標で毎コマ置く）
  const sg = stirrupGeo();
  R.stir = [new THREE.Mesh(sg, TACK_GLOSS), new THREE.Mesh(sg, TACK_GLOSS)];
  R.leather = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  R.rein = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  for (const m of [...R.stir, ...R.leather, ...R.rein]) { m.castShadow = true; m.frustumCulled = false; R.extra.add(m); }
  return R;
}
const ropeMats = new Map();
function ropeMat(hex) { if (!ropeMats.has(hex)) ropeMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 })); return ropeMats.get(hex); }
function dressHorse(R, st) {
  if (R.style === st) return;
  R.style = st;
  const M = horseMaterials(st);
  R.meshes.body.material = M.body; R.meshes.hair.material = M.hair; R.meshes.shoe.material = M.shoe; R.meshes.eye.material = M.eye; R.meshes.bridle.material = M.bridle;
  for (const m of R.tack) m.parent && m.parent.remove(m);
  R.tack = [];
  const T = tackGeometry(st);
  for (const [bn, key] of [[SEAT_B, 'seat'], [CHEST_B, 'chest'], [HIP_B, 'hip']]) {
    const [g, mt] = T[key];
    for (const [geo, mat] of [[g, TACK_GLOSS], [mt, TACK_MATTE]]) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      // 骨の子に：骨の立ち姿の逆（骨は根元の座標で HS 倍されているので、その分も戻す）
      m.matrixAutoUpdate = false;
      m.matrix.copy(HR.restInv[bn]);
      m.castShadow = true; m.frustumCulled = false;
      R.bones[bn].add(m); R.tack.push(m);
    }
  }
  for (const m of [...R.leather, ...R.rein]) m.material = ropeMat(st.tack);
}

// ---- 動かす ----
const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hM = new THREE.Matrix4();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 動きの長さ（秒）と、並足・駆け足の一回りで進む長さ（m。足が地面を滑らないよう、速さに合わせて回す）
const WALK_V = 0.88, GALLOP_V = 3.55;
// 竿立ち：倒れる動き（death）の頭の所（前脚を上げて立ち上がる）を使う
const REAR_PEAK = 1.02;
function driveHorse(h, dt, speed) {
  const H = h.userData.horse, R = H.real;
  H.speed = speed;
  const clips = HR.clips;
  // 向きの変わり（曲がる速さ）と、止まりかけ
  const yaw = h.rotation.y + (h.parent ? h.parent.rotation.y : 0);
  let dy = yaw - (R.yaw ?? yaw); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  R.yaw = yaw;
  R.turn = (R.turn || 0) + ((dt > 0 ? dy / dt : 0) - (R.turn || 0)) * Math.min(1, dt * 5);
  const decel = dt > 0 ? ((R.prev ?? speed) - speed) / dt : 0;
  R.prev = speed;
  // 一度きりの動き：倒れる・竿立ち・驚いて跳ねる・急に止まる
  let one = null;
  if (H.dead) { if (R.oneK !== 'death') { R.oneK = 'death'; R.oneT = 0; } H.deadT += dt; }
  if (!H.dead) {
    if (H.rear > (R.lastRear || 0) + 0.05) { R.oneK = 'rear'; R.oneT = 0; }
    else if (H.spook) { H.spook = 0; if (!R.oneK) { R.oneK = 'buck1'; R.oneT = 0; } }
    else if (!R.oneK && (R.hiSpd || 0) > 5 && speed < 2.5 && decel > 6) { R.oneK = 'stop'; R.oneT = 0; }
  }
  R.lastRear = H.rear; H.rear = Math.max(0, H.rear - dt);
  R.hiSpd = Math.max(speed, (R.hiSpd || 0) - dt * 6);
  let oneW = 0;
  if (R.oneK) {
    R.oneT += dt;
    const t = R.oneT;
    if (R.oneK === 'death') {
      one = 'death'; R.t.death = Math.min(clips.death.duration - 0.02, t); oneW = Math.min(1, t / 0.2);
    } else if (R.oneK === 'rear') {
      // 立ち上がって（0.75 秒）、少し留まり、下りる（0.6 秒）
      one = 'death';
      const up = 0.75, hold = 0.2, down = 0.6;
      R.t.death = t < up ? REAR_PEAK * (t / up) : t < up + hold ? REAR_PEAK : REAR_PEAK * Math.max(0, 1 - (t - up - hold) / down);
      oneW = Math.min(1, t / 0.15) * (1 - smooth(up + hold + down * 0.6, up + hold + down, t));
      if (t > up + hold + down) R.oneK = null;
    } else {
      one = R.oneK;
      const ts = one === 'stop' ? 1.35 : 1.3, dur = clips[one].duration / ts;
      R.t[one] = Math.min(clips[one].duration - 0.02, t * ts);
      oneW = Math.min(1, t / 0.18) * (1 - smooth(dur - 0.35, dur, t));
      if (t > dur || (one === 'stop' && speed > 3.5)) R.oneK = null;
    }
  }
  // 足運び：立つ → 並足 → 駆け足。曲がる時は左右へ傾いた動き
  const mv = smooth(0.12, 0.45, speed);
  const gal = smooth(2.3, 3.3, speed);
  const tr = Math.max(-1, Math.min(1, R.turn / 0.9));
  const trL = Math.max(0, tr), trR = Math.max(0, -tr), trC = 1 - Math.abs(tr);
  // 立っている時は、時々前掻き（idle3）や首振り（idle2）
  R.idleT = (R.idleT || 0) + dt;
  if (mv > 0.1) R.idleT = 0;
  if (!R.fidget && R.idleT > 5 && Math.random() < dt * 0.25) { R.fidget = Math.random() < 0.5 ? 'idle2' : 'idle3'; R.t[R.fidget] = 0; }
  let fid = 0;
  if (R.fidget) { const d = clips[R.fidget].duration; R.t[R.fidget] += dt; fid = Math.min(1, R.t[R.fidget] / 0.3) * (1 - smooth(d - 0.4, d, R.t[R.fidget])); if (R.t[R.fidget] >= d || mv > 0.1) { R.fidget = null; fid = 0; R.idleT = 0; } }
  const rest = 1 - oneW;
  const W = R.w;
  for (const k of RAIL) W[k] = 0;
  W.idle1 = (1 - mv) * (1 - fid) * rest;
  if (R.fidget) W[R.fidget] = (1 - mv) * fid * rest;
  const wk = mv * (1 - gal) * rest, gl = mv * gal * rest;
  W.walk = wk * trC; W.walkL = wk * trL; W.walkR = wk * trR;
  W.gallop = gl * trC; W.gallopL = gl * trL; W.gallopR = gl * trR;
  if (one) W[one] = (W[one] || 0) + oneW;
  // 時間：並足と駆け足は、足の進みが地面の速さと同じになるように回す（左右の動きは同じ時間にそろえる）
  const wTs = Math.max(0.55, Math.min(2.6, speed / WALK_V)), gTs = Math.max(0.75, Math.min(3.3, speed / GALLOP_V));
  R.t.walk = (R.t.walk + dt * wTs) % clips.walk.duration;
  R.t.gallop = (R.t.gallop + dt * gTs) % clips.gallop.duration;
  R.t.walkL = R.t.walkR = R.t.walk; R.t.gallopL = R.t.gallopR = R.t.gallop;
  R.t.idle1 = (R.t.idle1 + dt) % clips.idle1.duration;
  let sum = 0; for (const k of RAIL) sum += W[k];
  if (sum < 1e-4) { W.idle1 = 1; sum = 1; }
  for (const k of RAIL) {
    const a = R.act[k], w = W[k] / sum;
    a.enabled = w > 0.002;
    a.setEffectiveWeight(a.enabled ? w : 0);
    a.time = R.t[k];
  }
  R.mixer.update(0);
  // 鞍の動き：骨の立ち姿からの変わり（馬の根元の座標）を、乗り手の入れ物の行列に
  R.holder.updateMatrix();
  R.holder.matrixWorld.copy(R.holder.matrix);
  R.sc.updateMatrixWorld(true);
  const B = R.bones;
  H.seat.multiplyMatrices(B[SEAT_B].matrixWorld, HR.restInv[SEAT_B]);
  // 手綱を握る手の置き所：鞍の前の上。馬の頭が前後すると、手もそれに引かれる
  _hM.multiplyMatrices(B[HEAD_B].matrixWorld, HR.restInv[HEAD_B]);         // 頭の骨の、立ち姿からの動き
  _hv2.copy(HR.head0).applyMatrix4(_hM);                                   // 頭の今の位置
  const headRest = _hv.copy(HR.head0).applyMatrix4(H.seat);                // 鞍と一緒に動いた時の頭の位置
  H.hand = (H.hand || new THREE.Vector3()).set(-0.05, 1.5, 0.2).applyMatrix4(H.seat).addScaledVector(_hv2.sub(headRest), 0.25);
  // 銜の位置（手綱の先）
  H.bitL = (H.bitL || new THREE.Vector3()).copy(HR.bitL).applyMatrix4(_hM);
  H.bitR = (H.bitR || new THREE.Vector3()).copy(HR.bitR).applyMatrix4(_hM);
}
// 鐙・力革・手綱を置く（乗り手の骨が動いた後で。馬の根元の座標）
const _inv = new THREE.Matrix4(), _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _hand = new THREE.Vector3();
function placeHorseExtras(h, u) {
  const H = h.userData.horse, R = H.real;
  if (!H.hand) return;
  h.updateWorldMatrix(true, false);
  _inv.copy(h.matrixWorld).invert();
  const hum = u && u.mounted && u.human && u.human.root.visible && u.human.root.parent === u.seat ? u.human : null;
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1;       // 0 は +x（乗り手の右）
    // 鐙：乗り手の足首の下。乗り手がいなければ鞍から垂らす
    if (hum) {
      hum.bones[sd > 0 ? 'RightFoot' : 'LeftFoot'].getWorldPosition(_fa).applyMatrix4(_inv);
      _fa.y += 0.11; _fa.z += 0.05;
    } else _fa.set(sd * 0.3, u && u.mounted ? RIDE.y + 0.08 : 0.72, 0.1).applyMatrix4(H.seat);
    const st = R.stir[i];
    st.position.copy(_fa);
    st.quaternion.setFromRotationMatrix(H.seat);
    // 力革：鞍の脇から鐙の頭へ
    _fb.set(sd * 0.19, 1.3, 0.03).applyMatrix4(H.seat);
    ropeBetween(R.leather[i], _fb, _fa, 0.012);
    // 手綱：銜から乗り手の左手へ（乗り手がいなければ首の上に掛ける）
    if (hum) hum.bones.LeftHand.getWorldPosition(_hand).applyMatrix4(_inv);
    else if (u && u.mounted) _hand.copy(H.hand);
    else _hand.set(0, 1.42, 0.42).applyMatrix4(H.seat);
    ropeBetween(R.rein[i], i ? H.bitR : H.bitL, _hand, 0.0065);
  }
}
// 今の形の馬に、骨の入った馬を付ける・外す
function attachReal(h) {
  const H = h.userData.horse;
  if (!H.real) H.real = HR.pool.pop() || makeRealHorse();
  const R = H.real;
  dressHorse(R, h.userData.style || {});
  if (R.holder.parent !== h) { h.add(R.holder); h.add(R.extra); }
  R.on = true; R.holder.visible = R.extra.visible = true;
  H.pose.visible = false;
  // 付けたコマのうちに姿勢を合わせる（立ち姿のまま一コマ出ないように）
  R.yaw = undefined; R.prev = H.speed || 0; R.oneK = H.dead ? 'death' : null; R.oneT = H.dead ? H.deadT : 0;
  driveHorse(h, 0, H.speed || 0);
}
function detachReal(h) {
  const H = h.userData.horse, R = H.real;
  if (!R) return;
  h.remove(R.holder); h.remove(R.extra);
  R.on = false;
  H.pose.visible = true;
  H.real = null;
  HR.pool.push(R);
}
// 毎コマ（updateHumans から）：近い馬を選んで、骨の入った馬に入れ替える
const horsesOn = new Set();
let madeHorses = 0;
function updateHorses(rt) {
  madeHorses = 0;
  const on = HORSE.on && !(typeof location !== 'undefined' && /[?&]norender/.test(location.search));
  if (on && !hrLoading) loadHorse();
  const want = new Map();
  if (on && HORSE.ready) {
    const cam = rt.camera, cx = cam.position.x, cz = cam.position.z;
    const HQ = HORSE_Q[S.quality] || HORSE;
    const cand = [];
    const add = (h, u, x, z, pri) => {
      if (!h || !h.userData.horse || h.visible === false) return;
      const d = Math.hypot(x - cx, z - cz), H = h.userData.horse;
      const lim = H.real ? HQ.far : HQ.near;
      if (d < lim || pri < 0) cand.push({ h, u, d: pri < 0 ? -1 : d * pri });
    };
    for (const u of rt.army.units) {
      if (u.gone || !u.mounted || !u.horse || (!u.alive && u.deadT > 30)) continue;
      const named = u.look && typeof u.look.face === 'string' && u.look.face.startsWith('g:');
      add(u.horse, u, u.pos.x, u.pos.z, u.isPlayer ? -1 : named ? 0.6 : 1);
    }
    const P = rt.player;
    if (P && P.horse && !P.mounted && P.horse.parent) add(P.horse, null, P.horse.position.x, P.horse.position.z, -1);
    // 乗り手を失って駆け回る馬
    for (const o of rt.army.looseHorses || []) if (o.h && o.h.parent) add(o.h, null, o.h.position.x, o.h.position.z, 1.2);
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length && want.size < HQ.max; i++) want.set(cand[i].h, cand[i].u);
  }
  for (const h of [...horsesOn]) if (!want.has(h)) { detachReal(h); horsesOn.delete(h); }
  for (const h of want.keys()) {
    if (horsesOn.has(h)) continue;
    if (madeHorses >= 2 && !h.userData.horse.real) continue;   // 一コマに作るのは二頭まで
    if (!HR.pool.length) madeHorses++;
    attachReal(h); horsesOn.add(h);
  }
  return want;
}
export function horseCount() { return horsesOn.size; }
// 見本の画面（開発用）から：今の形の馬に骨の入った馬を付ける・鐙と手綱を置く
export function showHorse(h) { if (!HORSE.ready || !h.userData.horse) return false; attachReal(h); horsesOn.add(h); return true; }
export function horseExtras(h, u) { if (h.userData.horse && h.userData.horse.real) placeHorseExtras(h, u); }
