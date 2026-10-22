// ?norender・window.__norender：bot・sim が裏で流す時、骨の入った人・馬の読み込みも重いので止める（軽い形のまま。tools/README 参照）
// 骨の入った人（本物の人の動きを録った Idle・Walk・Run）と、実写の顔
// ・本人と、カメラの近く（25m ほど）の兵・名のある武将だけを、骨の入った体で描く。遠くの兵は units.js の形のまま
// ・体は assets/Soldier.glb（three.js の見本。Mixamo の骨）。現代の服は着物・袴の色に塗り替え、頭は隠す
// ・その上に units.js と同じ甲冑の部品（胴・草摺・袖・籠手・佩楯・脛当・兜）を骨ごとに付けて着せる
// ・本人と名のある武将の顔は assets/head/LeePerrySmith.glb（実在の男性の顔の3Dスキャン、CC BY 3.0、作者 Lee Perry-Smith）
// ・名のある武将と、侍大将より上の本人は、博物館の本物の胴丸の3Dスキャン（下の「本物の胴丸」）を骨に付けて着る
// ・読み込む前・読めない時・画質「低」では、今の形のまま
import * as THREE from 'three';
import { battleResources } from './battle_resources.js';
import { assetBytes, texOr, textureAtMost } from './bin_assets.js';
import { namedKacchu, namedCrestGeometry } from './named_kacchu.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lookPartSteps } from './units_look.js';
import { thighGeometry, shinGeometry } from './units_model.js';
import { UNIT_MAT, lookParts, GENERALS, RIDE, HORSE_HOOK, DEATH_END, haoriFold, soheiLook, katoGeometry, headEnvelope, thrustOut, angleDiff } from './units.js';
import { S, reduceMotion, MEM_TIGHT } from './settings.js';
import { combatThinking, thinkingPhase } from './army_budget.js';
import { astcRetry } from './astc_rt.js';
import { drawMon } from './textures.js';
import { lodSwap } from './units_flags.js';
import { WIND_STATE, WET, ARMY_P, ARMY_REAL_P, ARMY_REAL_R, ARMY_REAL_NEAR } from './world.js';
// 本物の骨の入った兵に替える範囲（本人とカメラの近く）。高 44m・中 36m・低 40m（以前は 60m 固定）。ARMY_REAL_NEAR は読み込みの名のまま残す。その先は、まとめて描く軽い兵（形は遠さで替わる）
// 記憶の少ない機械：iPhone（WebContent が 2048MB で切られる）。パソコンは保存済みの軽量設定で落とさない。
const memTight = () => MEM_TIGHT;
// 携帯だけ、骨入りの貸出枠と中景の細かな形の枠を分ける。
const SKIN_MAX = 40, MIDDLE_MAX = 80;
const SKIN_IN = 15, SKIN_OUT = 17;
const humanPool = new Set(), humanBuilding = new Set();
const humanPoolKeys = new WeakMap();
// 本人と武将は一般兵の貸出枠・簡略化から外す。
const qualityKeeper = u => !!(u && (u.isPlayer || u.type === 'busho' || u.look && (u.look.hero || isNamed(u.look))));
function humanPoolKey(u) {
  const L = u.look || {};
  let key = humanPoolKeys.get(L);
  if (!key) { key = JSON.stringify(L); humanPoolKeys.set(L, key); }
  // 武将・本人・騎馬は本人専用。一般兵は同じ装備・顔の枠を借りる。
  return u.isPlayer || u.name || u.mounted || isNamed(L) ? u.id + '|' + key : u.type + '|' + key;
}
function pinHumanGeometries(h) {
  h.root.traverse(o => { if (o.geometry) o.geometry.userData.humanPooled = true; });
  if (h.cg) for (const g of h.cg) g.userData.humanPooled = true;
}
function borrowHuman(u) {
  const key = humanPoolKey(u);
  for (const h of humanPool) if (!h.leased && h.poolKey === key) {
    HSTAT.borrowN++;
    for (const k in h) if (k !== 'showAt' && (typeof h[k] === 'number' || typeof h[k] === 'boolean')) {
      if (k in h.poolDefaults) h[k] = h.poolDefaults[k]; else delete h[k];
    }
    h.leased = true; h.u = u; h.lookSrc = u.look; u.human = h;
    h.last.copy(u.pos); h.acc = 1; h.spd = 0;
    h.deadAge = 0; h.deathSeenAt = undefined; h.still = false;
    h.drove = false; h.poseReady = false; h.mw0 = null; h.skelDirty = true;
    h.grip0 = null; h.bow0 = null; h.gset[0] = NaN;
    h.expr?.set(0, 0, 0, 0);
    h.w.idle = 1; h.w.walk = h.w.run = 0;
    for (const k of ['idle', 'walk', 'run']) h.act[k].setEffectiveWeight(k === 'idle' ? 1 : 0);
    h.mixer.setTime(0);
    u.mesh.add(h.root);
    return true;
  }
  return false;
}
const realNear = () => (S.lowMem ? 30 : 44);   // 落ちた後の携帯は 30m（10/19）

import { saddleBow, stirrupParts } from './horse_tack.js';
import { P as armorPaint, at as armorAt, MK, UNIT_GRIME, unitContour, nanbanMaterial, HORO_HEIGHT, HORO_TOP, HORO_BACK , dequantize, LruMap } from './units_model.js';
import { syncArmorWear } from './armor_wear.js';
import { EFUDA, efudaWants, efudaKeyState, efudaBake, efudaSet, efudaUpdate, efudaDispose, efudaFrameStart, efudaKeyOf, efudaBakeLight } from './efuda.js';
import { groundAt } from './floors.js';
import { cutReaction } from './army_anim.js';
import { cloneWaterMaterial } from './water_body.js';
import { PEOPLE_DET, PEOPLE_GLSL, peopleDetail } from './people_tex.js';

// near：骨の入った人にする距離（m）・max：その数の上限・far：名のある武将の距離
// fine：草摺の揺れ・実写の顔まで細かくする距離・ik：腕を毎コマ武器へ合わせる距離（その先は間引く）
// budget：一コマに人を作ってよい時間（ms）。戦の始まりに止まらないよう、少しずつ作る
// lite：その先は見回し・左手を省く・dead：倒れた兵を人にする距離
// lod：その先は体ごと一つの軽い形（骨組み一つ・描く回数一回）・shadow：その先の人は影を描かない
// fx：指の握り・息と疲れ・坂の足・振り向きの遅れ（重さを比べる時に切れるように）
// primed：読み込みの札を見せている間に「この戦で出る見た目」を先に作り終えた（絵の下ごしらえ済み）。
//   ready だけでは足りない。パソコンでは素材と primeHumans の完了まで支度の札で待つ。
//   操作の輪から primeHumans を呼ぶと、描画とシェーダ作りが重なって止まるので呼ばない。
// budget：本物の甲冑・顔・武器が重くなった分（af93647・d67c04a・8b58f89）、4ms のままだと
//   「出陣する」の直後に居る大勢（Q.must）がなかなか本物の人に追いつかず、戦の入口で長く固まって見えていた。
//   近い人は支度で作り、開戦後は一コマ一人まで、時間の目安は 4ms。
export const HUM_BUDGET_EARLY_SEC = 6;
export const HUM = { fx: true, ready: false, primed: false, failed: false, on: true, near: 42, max: 64, far: 70, ik: 18, lite: 28, fine: 12, face: 15, lod: 15, shadow: 15, budget: 14, dead: 20, hiN: 24, faceN: 14 };
// 画質ごとの数は遠景用。本人・カメラの60m以内は画質によらず本物にする。
// must：この近さ（m）より内の兵は、上限を越えても必ず骨の入った人にする（カメラの前に軽い形の兵を出さない）。その分は遠い者から軽い形へ
// mustMax は姉川のように合戦が複数同時に組み合う戦で、間近の本物の人が一気に増えないよう控えめに（普段の一本道の合戦では max 止まりで届かない数）
const HUM_T = { high: { lod: 17, hiN: 40, faceN: 24, hiCap: 40, shadow: 11 }, mid: { lod: 8, hiN: 10, faceN: 4, hiCap: 5, shadow: 8 }, low: { lod: 15, hiN: 24, faceN: 14, hiCap: 10, shadow: 15 } };
export const HUM_Q = { high: { near: 42, max: 70, must: 34, mustMax: 90 }, mid: { near: 32, max: 40, must: 29, mustMax: 80 }, low: { near: 9, max: 4, far: 12, face: 14 } };
const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), m0 = new THREE.Matrix4(), m1 = new THREE.Matrix4();

let SRC = null;      // 元の体（骨・形・動き・骨ごとの位置）
let HEAD = null;     // 実写の顔の形と絵
let loading = null;

// 表示中は次のコマまで譲り、画面が裏へ回っても支度を待ち続けない。
export function preparationFrame() {
  return new Promise(resolve => {
    let timer, frame;
    const done = () => { clearTimeout(timer); if (frame !== undefined) cancelAnimationFrame(frame); resolve(); };
    timer = setTimeout(done, 50);
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(done);
  });
}

// ---------------- 読み込み ----------------
export function loadHumans() {
  if (loading) return loading;
  if (typeof location !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search))) { HUM.on = false; return (loading = Promise.resolve()); }
  loading = (async () => {
    const L = new GLTFLoader();
    // .glb は公開の場所に置けないので、base64 の文字にした .js（tools/glb2js.mjs で作る）を読んで、ここで元に戻す
    // 生の bytes（src/bin/<名>.bin。無ければ base64 の asset_<名>.js）を読んで GLB に
    const glb = async (name) => {
      const buf = await assetBytes(name);
      await preparationFrame();
      return L.parseAsync(buf.buffer, '');
    };
    // 頭：MakeHuman の写実の頭（CC0。アジアの顔と肌・年と顔の形の作り分け。tools/mhhead.mjs）。?leehead で前の実写スキャンの頭
    const lee = window.__leehead === true || /[?&]leehead/.test(location.search);
    // 体：MakeHuman の写実の体（CC0。アジアの男の形と手。骨と動きは見本の体のまま。tools/mhbody.mjs）。?soldierbody か読めなければ見本の体
    const oldBody = window.__soldierbody === true || /[?&]soldierbody/.test(location.search);
    const sol = await (oldBody ? Promise.reject(new Error('old')) : glb('mhbody')).catch(() => glb('soldier'));
    prepBody(sol);
    await preparationFrame();
    const head = await glb(lee ? 'head' : 'mhhead');
    const tl = new THREE.TextureLoader();
    // 本人の写実の手。体と頭の展開を終えてから読む。
    const hand = await glb('mhhand').catch(() => null);
    if (hand) await tl.loadAsync(new URL('../assets/mh/hand_skin.jpg', import.meta.url).href).then((t) => prepHand(hand, t)).catch(() => {});
    if (lee) {
      const [col, nrm, spec] = await Promise.all(['Map-COL.jpg', 'Infinite-Level_02_Tangent_SmoothUV.jpg', 'Map-SPEC.jpg'].map((f) => tl.loadAsync(new URL('../assets/head/' + f, import.meta.url).href)));
      for (const t of [col, nrm, spec]) { t.flipY = false; t.anisotropy = 4; }
      col.colorSpace = THREE.SRGBColorSpace;
      prepHead(head, col, nrm, spec);
    } else {
      const sk = await Promise.all(['young', 'mid', 'old'].map((f) => tl.loadAsync(new URL('../assets/mh/skin_' + f + '.jpg', import.meta.url).href)));
      prepHeadMH(head, sk);
    }
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
  // MakeHuman の体（tools/mhbody.mjs）：裸の体なので、見本の体の現代の服の直し（肩当て・背の装備・膨らみを細く）はせず、逆に小袖・袴の厚みへ膨らませる
  const mh = !!scene.userData.mhbody;
  const tex = body.material.map, ntex = mh ? null : body.material.normalMap;
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
  // 肩当て（見本の体の肩の板）は胴と腕の骨に半々に付いていて、腕を下ろすと板が引き伸ばされて肩から角のように立つ
  // → 肩の関節より外の頂点は二の腕の骨だけに付け、腕と一緒に回す（袖の肩山になる）
  if (!mh) {
    const mW = body.matrixWorld, w = new THREE.Vector3();
    for (const sd of ['Left', 'Right']) {
      const J = rest[sd + 'Arm'], bi = bname.indexOf(sd + 'Arm');
      if (!J || bi < 0) continue;
      for (let i = 0; i < n; i++) {
        if (part[i] !== PART.torso && part[i] !== PART.arm) continue;
        w.fromBufferAttribute(pos, i).applyMatrix4(mW).multiplyScalar(kH);
        if (Math.sign(w.x) !== Math.sign(J.x) || Math.abs(w.x) < Math.abs(J.x) - 0.035 || w.y < J.y - 0.09 || Math.abs(w.z - J.z) > 0.08) continue;
        si.setXYZW(i, bi, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0);
        part[i] = PART.arm;
      }
    }
    si.needsUpdate = sw.needsUpdate = true; geo.attributes.part.needsUpdate = true;
  }
  // 胴：見本の体の背の張り出し（背負った装備の形）が、桶側胴・腹巻の外へ突き抜けないよう、胴の内に収める
  {
    const mW = body.matrixWorld, mI = mW.clone().invert(), w = new THREE.Vector3();
    const DP = [[0.2, 0.88], [0.205, 0.95], [0.212, 1.05], [0.232, 1.18], [0.248, 1.3], [0.238, 1.38], [0.19, 1.43]];
    const rDo = (y) => { for (let k = 1; k < DP.length; k++) if (y <= DP[k][1]) return DP[k - 1][0] + (DP[k][0] - DP[k - 1][0]) * (y - DP[k - 1][1]) / (DP[k][1] - DP[k - 1][1]); return DP[DP.length - 1][0]; };
    const cx = rest.Spine1.x, cz = rest.Spine1.z;
    for (let i = 0; i < n && !mh; i++) {
      if (part[i] !== PART.torso) continue;
      w.fromBufferAttribute(pos, i).applyMatrix4(mW).multiplyScalar(kH);
      if (w.y < 0.86) continue;
      // 首の付け根より外の肩の上（背負った装備の襟）は低く押さえる
      if (w.y > 1.4 && Math.hypot(w.x - cx, w.z - cz) > 0.075) w.y = 1.4 + (w.y - 1.4) * 0.35;
      const dx = w.x - cx, dz = (w.z - cz) / 0.8, rr = Math.hypot(dx, dz), R = rDo(Math.min(1.42, w.y)) * 0.94 - 0.014;
      const f = rr <= R ? 1 : (R + (rr - R) * 0.1) / rr;
      w.x = cx + dx * f; w.z = cz + dz * 0.8 * f;
      w.multiplyScalar(1 / kH).applyMatrix4(mI);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
  }
  {
    // 戦国の足軽の形に：小袖の筒袖（二の腕はゆったり、手首へ細く）、裁着袴（腿はふくらみ、膝の下で絞る）、脛は脚絆の細さ、腰は袴の襞でやや張る
    // 数は骨の軸からの距離の倍率。関数は骨の根元 0 → 先 1 の場所ごと
    const hakama = (t) => 1.12 + 0.3 * Math.sin(Math.PI * Math.min(1, Math.max(0, t / 0.92))) - 0.25 * Math.max(0, (t - 0.8) / 0.2);
    const SHR0 = { LeftShoulder: 0.8, RightShoulder: 0.8, LeftArm: (t) => 0.9 + 0.08 * t, RightArm: (t) => 0.9 + 0.08 * t, LeftForeArm: (t) => 0.92 - 0.16 * t, RightForeArm: (t) => 0.92 - 0.16 * t, LeftUpLeg: hakama, RightUpLeg: hakama, LeftLeg: 0.78, RightLeg: 0.78, Hips: 1.08 };
    // 骨の軸からの距離の上限（m、本編の背丈で）
    const CAP0 = { LeftShoulder: 0.1, RightShoulder: 0.1, LeftArm: 0.058, RightArm: 0.058, LeftForeArm: 0.058, RightForeArm: 0.058, LeftUpLeg: (t) => 0.1 + 0.035 * Math.sin(Math.PI * Math.min(1, t / 0.92)), RightUpLeg: (t) => 0.1 + 0.035 * Math.sin(Math.PI * Math.min(1, t / 0.92)), LeftLeg: 0.062, RightLeg: 0.062 };
    const CH = { LeftShoulder: 'LeftArm', RightShoulder: 'RightArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', Hips: 'Spine1', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck' };
    // MakeHuman の裸の体には、布の厚みを足す：小袖の筒袖は二の腕でゆったり手首で細く、裁着袴は腿で大きく膨らみ膝下で絞る、脛は脚絆を巻いた太さ、胴は小袖の打ち合わせの厚み
    const sleeve = (t) => 1.72 - 0.1 * t, fore = (t) => 1.55 - 0.32 * t;
    const hakamaM = (t) => 1.3 + 0.22 * Math.sin(Math.PI * Math.min(1, Math.max(0, t / 0.9))) - 0.28 * Math.max(0, (t - 0.8) / 0.2);
    const SHR = mh ? { LeftShoulder: 1.42, RightShoulder: 1.42, LeftArm: sleeve, RightArm: sleeve, LeftForeArm: fore, RightForeArm: fore, LeftUpLeg: hakamaM, RightUpLeg: hakamaM, LeftLeg: (t) => 1.16 - 0.08 * t, RightLeg: (t) => 1.16 - 0.08 * t, Hips: 1.16, Spine: 1.14, Spine1: 1.18, Spine2: 1.2 } : SHR0;
    const CAP = mh ? { LeftArm: 0.1, RightArm: 0.1, LeftForeArm: 0.078, RightForeArm: 0.078, LeftUpLeg: (t) => 0.112 + 0.024 * Math.sin(Math.PI * Math.min(1, t / 0.9)), RightUpLeg: (t) => 0.112 + 0.024 * Math.sin(Math.PI * Math.min(1, t / 0.9)), LeftLeg: 0.07, RightLeg: 0.07 } : CAP0;
    const mW = body.matrixWorld, mI = mW.clone().invert();
    const w = new THREE.Vector3(), A = new THREE.Vector3(), Bv = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let best = 0, bwt = -1;
      for (let k = 0; k < 4; k++) { const wt = gc(sw, i, k); if (wt > bwt) { bwt = wt; best = gc(si, i, k); } }
      const nm = bname[best].replace("Twist", ""), f0 = SHR[nm];
      if (!f0) continue;
      A.copy(rest[nm]).multiplyScalar(1 / kH); Bv.copy(rest[CH[nm]]).multiplyScalar(1 / kH);
      w.fromBufferAttribute(pos, i).applyMatrix4(mW);
      D.copy(Bv).sub(A); const L2 = D.lengthSq();
      const t = Math.max(-0.2, Math.min(1.2, w.clone().sub(A).dot(D) / L2));
      Q.copy(A).addScaledVector(D, t);
      // 関節の近く（t が 0 や 1 の近く）は寄せを弱め、つなぎ目を割らない
      const edge = mh ? 0.7 + 0.3 * Math.min(1, Math.min(Math.abs(t), Math.abs(1 - t)) / 0.15) : Math.min(1, Math.min(Math.abs(t), Math.abs(1 - t)) / 0.15);
      const f = typeof f0 === 'function' ? f0(Math.max(0, Math.min(1, t))) : f0;
      const k = 1 - (1 - f) * edge * Math.min(1, bwt * 1.4);
      w.sub(Q).multiplyScalar(k);
      // 見本の体の肩当て・膝当て（現代の鎧の張り出した板）は、筒の太さで抑える（袖・袴の外へ紙のように突き出さないよう）
      const cap = CAP[nm];
      if (cap) { const r = w.length(), c = (typeof cap === 'function' ? cap(Math.max(0, Math.min(1, t))) : cap) / kH; if (r > c) w.multiplyScalar((c + (r - c) * 0.15) / r); }
      w.add(Q).applyMatrix4(mI);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    // 肩当て（見本の体の肩に重なった板）：胴や肩の骨に付いた頂点も、肩から肘の線より上・外へ張り出す分を抑える（肩から紙のような板が立たないよう）
    for (let i = 0; i < n && !mh; i++) {
      if (part[i] !== PART.torso && part[i] !== PART.arm) continue;
      w.fromBufferAttribute(pos, i).applyMatrix4(mW).multiplyScalar(kH);
      const sd = (w.x >= 0) === (rest.LeftShoulder.x >= 0) ? 'Left' : 'Right';
      const S0 = rest[sd + 'Shoulder'], E0 = rest[sd + 'ForeArm'];
      if (Math.abs(w.x) < Math.abs(S0.x) * 0.9 || Math.abs(w.x) > Math.abs(E0.x)) continue;
      D.copy(E0).sub(S0); const tt = Math.max(0, Math.min(1, v0.copy(w).sub(S0).dot(D) / D.lengthSq()));
      Q.copy(S0).addScaledVector(D, tt);
      v1.copy(w).sub(Q);
      if (v1.y < 0) continue;   // 脇と胸・背の横は触らない
      const r = v1.length(), c = 0.08;
      if (r <= c) continue;
      v1.multiplyScalar((c + (r - c) * 0.15) / r);
      w.copy(Q).add(v1).multiplyScalar(1 / kH).applyMatrix4(mI);
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
    const nm = bname[best].replace("Twist", "");
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
  // MakeHuman の体の胸と腹に厚みを足す（胴の大きさは上の太さで決めた後なので、胴は大きくならない）
  //   測ると胴の内で体が細く、腹の高さで横 9cm・前 7cm・背 10cm も隙があり、胴だけが空の筒のように浮いて見えた（10/9）
  //   鎧下の小袖と肌着を重ねた厚み：横と前後を高さごとの真ん中から広げ、胴の内側から 3cm ほどに収める。胴の上の縁（肩）へは元へ戻す
  if (mh) {
    const mW = body.matrixWorld, mI = mW.clone().invert(), w = new THREE.Vector3();
    const yLo = rest.Hips.y + 0.04, yHi = Math.min(rest.LeftArm.y, rest.RightArm.y) - 0.02;
    const bandOf = (y) => Math.round(y / 0.02);
    const zr = new Map();
    for (let i = 0; i < n; i++) {
      if (part[i] !== PART.torso) continue;
      w.fromBufferAttribute(pos, i).applyMatrix4(mW).multiplyScalar(kH);
      if (w.y < yLo || w.y > yHi) continue;
      const b = bandOf(w.y), e = zr.get(b) || [9, -9]; e[0] = Math.min(e[0], w.z); e[1] = Math.max(e[1], w.z); zr.set(b, e);
    }
    const ramp = (y) => Math.min(1, Math.max(0, (y - yLo) / 0.1)) * Math.min(1, Math.max(0, (yHi - y) / 0.12));
    const cx = rest.Spine1.x;
    for (let i = 0; i < n; i++) {
      if (part[i] !== PART.torso) continue;
      w.fromBufferAttribute(pos, i).applyMatrix4(mW).multiplyScalar(kH);
      const k = ramp(w.y), e = zr.get(bandOf(w.y));
      if (k <= 0 || !e) continue;
      const zc = (e[0] + e[1]) / 2;
      const dx = w.x - cx, dz = w.z - zc;
      const nx = Math.min(Math.abs(dx) * 1.28, Math.max(Math.abs(dx), 0.215)), nz = Math.min(Math.abs(dz) * 1.3, Math.max(Math.abs(dz), 0.205));
      w.x = cx + Math.sign(dx) * (Math.abs(dx) + (nx - Math.abs(dx)) * k);
      w.z = zc + Math.sign(dz) * (Math.abs(dz) + (nz - Math.abs(dz)) * k);
      w.multiplyScalar(1 / kH).applyMatrix4(mI);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  const clip = (nm) => gl.animations.find((a) => a.name === nm);
  const fingers = fingerAxes(scene, holder, nodes, clip('Idle'));
  // 歩み・駆け足の録った動きの「足が地面を後ろへ送る速さ」（m/s、本編の背丈で）。これで動きの速さを合わせると、足が地面を滑らない
  const vWalk = clipSpeed(scene, holder, nodes, clip('Walk'), kH) || 1.45, vRun = clipSpeed(scene, holder, nodes, clip('Run'), kH) || 5.2;
  HUM.vWalk = +vWalk.toFixed(2); HUM.vRun = +vRun.toFixed(2); HUM.rad = radius;
  // 立ち姿の骨の回り（駆け足の歩幅を広げる時の基準）
  const restQ = {};
  for (const nm of ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']) restQ[nm] = nodes[nm].quaternion.clone();
  // 録った動きから指の動きを外す（指は curlFingers で握りの形にする。毎コマ三つの動きが指の骨三十本を書き直すのを省いて軽くする）
  const noFingers = (c) => { if (!c) return c; const d = c.clone(); d.tracks = d.tracks.filter((t) => !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(t.name)); return d; };
  SRC = { scene, holder, body, bname, rest, kH, radius, tex, ntex, fingers, vWalk, vRun, restQ, anims: { idle: noFingers(clip('Idle')), walk: noFingers(clip('Walk')), run: noFingers(clip('Run')) } };
  SRC.bodyToRest = new THREE.Matrix4().makeScale(kH, kH, kH).multiply(body.matrixWorld);
  scene.scale.set(1, 1, 1);
  holder.remove(scene);
}

// ---- 指の曲げ ----
// 見本の体の指は、録った動きのままだと開いて伸び、槍の柄も鉄砲も握っていない（人形の手に見える）
// 立ち姿で、指の節ごとに「手のひらの方へ曲げる」回しの軸を、その骨の座標で求めておく
// 手のひらの向き：T の字の立ち姿は手のひらが下。念のため、録った待つ動きで指先が動く向き（手のひらの方）で確かめる
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
function fingerAxes(scene, holder, nodes, idle) {
  const out = {};
  const save = new Map();
  scene.traverse((o) => { if (o.isBone) save.set(o, o.quaternion.clone()); });
  holder.updateMatrixWorld(true);
  const W = (nm) => new THREE.Vector3().setFromMatrixPosition(nodes[nm].matrixWorld);
  const tipRest = {};
  for (const sd of ['Left', 'Right']) tipRest[sd] = W(sd + 'HandMiddle4');
  // 待つ動きの一コマを当てて、中指の先の動く向きを見る
  let sgn = { Left: 1, Right: 1 };
  if (idle) {
    const mx = new THREE.AnimationMixer(scene);
    mx.clipAction(idle).play(); mx.update(0.8);
    holder.updateMatrixWorld(true);
    for (const sd of ['Left', 'Right']) {
      // 手首の回りを除くため、手の骨の座標で比べる
      const hw = nodes[sd + 'Hand'].matrixWorld, hi = hw.clone().invert();
      const a = W(sd + 'HandMiddle4').applyMatrix4(hi);
      mx.stopAllAction();
      for (const [o, q] of save) o.quaternion.copy(q);
      holder.updateMatrixWorld(true);
      const hw0i = nodes[sd + 'Hand'].matrixWorld.clone().invert();
      const b = tipRest[sd].clone().applyMatrix4(hw0i);
      const nL = new THREE.Vector3(0, -1, 0).transformDirection(hw0i);
      const d = a.sub(b);
      if (d.length() > 1e-4 && d.dot(nL) < 0) sgn[sd] = -1;
      mx.clipAction(idle).play(); mx.update(0.8); holder.updateMatrixWorld(true);
    }
    mx.stopAllAction(); mx.uncacheRoot(scene);
  }
  for (const [o, q] of save) o.quaternion.copy(q);
  holder.updateMatrixWorld(true);
  for (const sd of ['Left', 'Right']) {
    const n = new THREE.Vector3(0, -sgn[sd], 0);
    for (const f of [...FINGERS, 'Thumb']) {
      for (let j = 1; j <= 3; j++) {
        const nm = sd + 'Hand' + f + j, ch = sd + 'Hand' + f + (j + 1);
        if (!nodes[nm] || !nodes[ch]) continue;
        const pj = W(nm), pc = W(ch);
        const fd = pc.clone().sub(pj).normalize();
        const ax = new THREE.Vector3().crossVectors(fd, n).normalize();
        const Mi = nodes[nm].matrixWorld.clone().invert();
        const aL = ax.clone().transformDirection(Mi);
        // 向きの確かめ：少し回して、子の関節が手のひらの方へ動くか
        const cl = nodes[ch].position.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(aL, 0.3));
        const np = cl.applyMatrix4(nodes[nm].matrixWorld);
        if (np.sub(pc).dot(n) < 0) aL.negate();
        out[nm] = { axis: aL, q0: nodes[nm].quaternion.clone() };
      }
    }
  }
  return out;
}
// 録った動き（その場で足踏みする歩み）で、低い方の足（地に着いた足）が後ろへ動く速さの平均
function clipSpeed(scene, holder, nodes, clip, kH) {
  if (!clip) return 0;
  const save = new Map();
  scene.traverse((o) => { if (o.isBone) save.set(o, o.quaternion.clone()); });
  const hipsP = nodes.Hips.position.clone();
  const mx = new THREE.AnimationMixer(scene);
  mx.clipAction(clip).play();
  const N = 120, dt = clip.duration / N;
  const hp = new THREE.Vector3(), F = { L: [], R: [] };
  for (let i = 0; i <= N; i++) {
    mx.setTime(i * dt);
    holder.updateMatrixWorld(true);
    hp.setFromMatrixPosition(nodes.Hips.matrixWorld);
    for (const sd of ['L', 'R']) F[sd].push(new THREE.Vector3().setFromMatrixPosition(nodes[(sd === 'L' ? 'Left' : 'Right') + 'Foot'].matrixWorld).sub(hp));
  }
  mx.stopAllAction(); mx.uncacheRoot(scene);
  for (const [o, q] of save) o.quaternion.copy(q);
  nodes.Hips.position.copy(hipsP);
  holder.updateMatrixWorld(true);
  // 地に着いている間（その足のいちばん低い所から 3cm ほど）だけ、後ろへ送る速さを測る
  let dist = 0, time = 0;
  for (const sd of ['L', 'R']) {
    const P = F[sd]; let lo = 1e9; for (const p of P) lo = Math.min(lo, p.y);
    const th = lo + 0.03 / kH;
    for (let i = 1; i < P.length; i++) if (P[i].y < th && P[i - 1].y < th) { dist += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); time += dt; }
  }
  const v = time > 0 ? (dist / time) * kH : 0;
  return v > 0.3 && v < 12 ? v : 0;
}
const _fq = new THREE.Quaternion();
// 指を曲げる：grip 0（力を抜いた手）〜1（柄を握る）。親指は少しだけ
const CURL = [[0.55, 0.6, 0.35], [1.25, 1.35, 0.85]];
function curlFingers(h, sd, grip) {
  const F = SRC.fingers; if (!F) return;
  const B = h.bones;
  const s = h.seed;
  for (let fi = 0; fi < 5; fi++) {
    const f = fi < 4 ? FINGERS[fi] : 'Thumb';
    // 小指ほど深く握る。人ごとに少し違う
    // 本人は親指も柄・手綱に回して押さえる（一人称で親指が柄に沿って突き出て、指さしに見えないよう）
    // 空いた手（握りが浅い）：人差し指は浅く、小指ほど深く曲がる自然な手（指をそろえて開いた人形の手にしない）。親指は人差し指の脇へ寄せる
    const relax = Math.max(0, Math.min(1, (0.75 - grip) / 0.4));
    const k = f === 'Thumb' ? (h.u && h.u.isPlayer ? 0.5 + 0.75 * grip : h.u && h.u.mounted ? 0.35 + 0.55 * grip : 0.35 + 0.25 * relax) : 0.92 + fi * (0.05 + 0.13 * relax) - 0.12 * relax + (s - 0.5) * (0.08 + 0.12 * relax);
    for (let j = 1; j <= 3; j++) {
      const nm = sd + 'Hand' + f + j, e = F[nm], b = B[nm];
      if (!e || !b) continue;
      const a = (CURL[0][j - 1] + (CURL[1][j - 1] - CURL[0][j - 1]) * grip) * k;
      b.quaternion.copy(e.q0).multiply(_fq.setFromAxisAngle(e.axis, a));
      b.updateMatrix();
    }
  }
}

// 体の材質：部位ごとに色（着物・袴・肌・足袋）。元の絵は明るさ（しわ）だけ使う。頭は描かない
const bodyMats = new Map();
// 風（x, z：向き、z の所は強さ、w：時）。毎コマ updateHumans で WIND_STATE から写す
const CLOTH_W = { value: new THREE.Vector4(0.565, 0.825, 1, 0) };
// 戦が進むほどの汚れ（0..1。戦の時間から）
const GRIME = UNIT_GRIME;
// 本人の腕の材質：兵の材質と同じ描き方で、一人称（FP_ARM が 1）の時は籠手の絵（鎖）の所だけ 1.5 倍細かく繰り返す
const FP_ARM = { value: 0 };
let fpArmM = null;
function fpArmMat() {
  if (fpArmM) return fpArmM;
  const m = UNIT_MAT.clone();
  const img = UNIT_MAT.map && UNIT_MAT.map.image, AW = (img && img.width) || 2048, AH = (img && img.height) || 1024;
  // 籠手の絵の場所（units.js の REG.kote＝[256, 512, 256, 256] の画素）を UV へ（絵は上下を返して貼られる）
  const u0 = 256 / AW, du = 256 / AW, v0 = 1 - 768 / AH, dv = 256 / AH;
  m.onBeforeCompile = (sh, r) => {
    UNIT_MAT.onBeforeCompile(sh, r);
    sh.uniforms.uFpArm = FP_ARM;
    const fn = `uniform float uFpArm;
      vec2 kUv(vec2 uv) {
        vec2 q = (uv - vec2(${u0.toFixed(5)}, ${v0.toFixed(5)})) / vec2(${du.toFixed(5)}, ${dv.toFixed(5)});
        if (uFpArm < 0.5 || q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return uv;
        return vec2(${u0.toFixed(5)}, ${v0.toFixed(5)}) + fract(q * 1.5) * vec2(${du.toFixed(5)}, ${dv.toFixed(5)}) * 0.98 + vec2(${(du * 0.01).toFixed(5)}, ${(dv * 0.01).toFixed(5)});
      }
      vec4 kTex(sampler2D t, vec2 uv) { return textureGrad(t, kUv(uv), dFdx(uv) * (uFpArm > 0.5 ? 1.5 : 1.0), dFdy(uv) * (uFpArm > 0.5 ? 1.5 : 1.0)); }
      `;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', fn + 'void main() {')
      .replace('texture2D(map, vMapUv)', 'kTex(map, vMapUv)')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'kTex(normalMap, vNormalMapUv)'));
  };
  m.customProgramCacheKey = () => 'fparm' + (UNIT_MAT.customProgramCacheKey ? UNIT_MAT.customProgramCacheKey() : '');
  fpArmM = m;
  return m;
}
export function setFpArm(on) { FP_ARM.value = on ? 1 : 0; }
// 一人称の目の前で描かない球（xyz：目、w：半径。0 なら切らない）。player.js が描く直前に置き、描いた後に 0 へ戻す
const FP_CUT = { value: new THREE.Vector4(0, 0, 0, 0) };
export function setFpCut(p, r) { if (p) FP_CUT.value.set(p.x, p.y, p.z, r); else FP_CUT.value.w = 0; }
// dm：本物の胴丸の下に着る体（手も描かない。甲冑の脇の、スキャンに写っていない所から下の着物が見える）
// nh：本人の体（手は写実の手 attachHands が描くので、体の手は描かない）。1・2 の位は、籠手を着けた右・左の前腕も描かない
//   （見本の体の前腕は今の服の太い袖で、それを覆うと籠手が太い筒になる。本人の籠手は実の太さで作り、中の体の前腕は消す）
function bodyMaterial(look, dm = false, nh = 0) {
  const cloth = look.cloth || 0x2b2622, skin = look.skin || 0xb58c68;
  const hakama = look.tier === 0 ? cloth : new THREE.Color(cloth).multiplyScalar(0.8).getHex();
  // 僧兵は体の胴と腕を描かない（体の肩の形が衣から突き出るので。胴は衣、腕は広い袖が覆う）。部位の境の三角（首と胴のつなぎ目など）も描かない
  const nt = !!look.sohei;
  // 汚れの量（units.js と同じ：身分が低いほど汚い）。材質は 0.1 刻みで分ける
  const dirt = Math.round(Math.min(1, look.dirt ?? [0.85, 0.6, 0.45, 0.3][look.tier ?? 0] ?? 0.5) * 10) / 10;
  // 褪せ方：同じ家の同じ色の着物でも、洗いざらし・日焼けの度合いが人ごとに違う（三通り。材質は三つまで）
  const fade = ((look.face | 0) + (look.vi | 0)) % 3;
  const k = cloth + '|' + skin + '|' + look.tier + '|' + dirt + '|f' + fade + (dm ? '|dm' : '') + (nt ? '|nt' : '') + (nh ? '|nh' + nh : '');
  if (bodyMats.has(k)) return bodyMats.get(k);
  const m = new THREE.MeshStandardMaterial({ map: SRC.tex, normalMap: SRC.ntex, roughness: 0.92, metalness: 0 });
  // 褪せた布の色：彩度を落とし、灰茶へ寄せ、少し明るく（染めたての濃い一色にしない）
  const fc = new THREE.Color(cloth), fhsl = fc.getHSL({});
  fc.setHSL(fhsl.h, fhsl.s * [0.8, 0.62, 0.48][fade], Math.min(0.5, fhsl.l * [1.0, 1.1, 1.22][fade] + 0.01 * fade)).lerp(new THREE.Color(0x5a5044), [0.04, 0.1, 0.16][fade]);
  const clothF = fc.getHex(), hakamaF = look.tier === 0 ? clothF : fc.clone().multiplyScalar(0.8).getHex();
  const U = {
    cTorso: { value: new THREE.Color(clothF) }, cArm: { value: new THREE.Color(clothF) }, cHand: { value: new THREE.Color(skin).multiplyScalar(0.55).multiply(new THREE.Color(0.94, 0.84, 0.78)) },
    cLeg: { value: new THREE.Color(hakamaF) }, cFoot: { value: new THREE.Color(look.tier === 0 ? 0x5a5246 : 0x3a3630) }, cNeck: { value: new THREE.Color(skin) },
  };
  // 元の絵は現代の鎧（明るい板と黒い布、塗りの剥げ）なので、明るさをそのまま使うと着物に板の縁や剥げの斑が出て、人形の服に見える
  // → 絵はぼかした明るさを少しだけ使い、布の色むら・縦のしわ・擦り切れ・汗じみ・裾の泥は、体の立ち姿の座標（vBind）で描く（動いても布に貼り付いたまま）
  m.normalScale = new THREE.Vector2(0.35, 0.35);
  m.onBeforeCompile = (sh) => {
    unitContour(sh);
    peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
    Object.assign(sh.uniforms, U, { uClothW: CLOTH_W, uLoose: { value: look.tier === 0 ? 0.55 : 1.0 }, uWet: WET, uDirt: { value: dirt }, uGrime: GRIME });
    if (nh) { const F = foreAxes(); Object.assign(sh.uniforms, { uFaE: { value: F.e }, uFaD: { value: F.d }, uFaOn: { value: new THREE.Vector2(nh & 1 ? 1 : 0, nh & 2 ? 1 : 0) } }); }
    // 脚の布（袴の腿・小袖の裾）：風に押されてはためく。腰から膝へ行くほど大きく、裾の端ほど細かく波打つ。風の向きは世界の座標から体の座標へ直す
    sh.vertexShader = 'attribute float part;\nvarying float vPart;\nvarying vec3 vBind, vBN;\nuniform vec4 uClothW;\nuniform float uLoose;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPart = part; vBind = position * 0.01; vBN = objectNormal;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        {
          float hz = vBind.z;
          float loose = part > 2.5 && part < 3.5 ? smoothstep(0.95, 0.75, hz) * smoothstep(0.3, 0.55, hz) * uLoose
                      : part < 0.5 ? smoothstep(1.0, 0.8, hz) : 0.0;
          if (loose > 0.001 && uClothW.z > 0.0) {
            vec4 wo = modelMatrix * vec4(transformed, 1.0);
            float ph = uClothW.w * 7.0 + wo.x * 3.1 + wo.z * 2.3 + hz * 9.0;
            float fl = 0.55 + 0.3 * sin(ph) + 0.15 * sin(ph * 2.3 + 1.7);
            vec3 wd = vec3(uClothW.x, 0.0, uClothW.y);
            float s2 = dot(modelMatrix[0].xyz, modelMatrix[0].xyz);
            vec3 wl = (vec4(wd, 0.0) * modelMatrix).xyz / s2;
            transformed += wl * (0.018 * uClothW.z * loose * fl);
          }
        }`);
    sh.fragmentShader = (nh ? 'uniform vec3 uFaE[2], uFaD[2];\nuniform vec2 uFaOn;\n' : '') + 'uniform vec3 cTorso, cArm, cHand, cLeg, cFoot, cNeck;\nuniform float uWet, uDirt, uGrime;\nuniform sampler2D uPD;\nvarying float vPart;\nvarying vec3 vBind, vBN;\nfloat pdC;\n' + PEOPLE_GLSL + `
float hb3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hb3(i), hb3(i + vec3(1,0,0)), f.x), mix(hb3(i + vec3(0,1,0)), hb3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hb3(i + vec3(0,0,1)), hb3(i + vec3(1,0,1)), f.x), mix(hb3(i + vec3(0,1,1)), hb3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float clothFold, clothSoil;
// 布のしわの凹凸（高さ h の画面上の変わりから法線を傾ける。three.js の bump と同じ式）
vec3 clothBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)), vSigmaY = normalize(dFdy(surf_pos.xyz));
  vSigmaX = dFdx(surf_pos.xyz); vSigmaY = dFdy(surf_pos.xyz);
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * fd;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        ${nh ? 'if (vPart > 0.5 && vPart < 1.5 && ((uFaOn.x > 0.5 && dot(vBind - uFaE[0], uFaD[0]) > 0.02) || (uFaOn.y > 0.5 && dot(vBind - uFaE[1], uFaD[1]) > 0.02))) discard;' : ''}
        if (vPart > 3.5${dm || nh ? ' || (vPart > 1.5 && vPart < 2.5)' : ''}${nt ? ' || vPart < 1.5 || abs(vPart - floor(vPart + 0.5)) > 0.04' : ''}) discard;
        // ぼかした明るさ（板の縁・剥げを消す）
        vec4 tA = texture2D(map, vMapUv, 3.5);
        float lumA = dot(tA.rgb, vec3(0.3, 0.59, 0.11));
        int pA = int(vPart + 0.5);
        vec3 cA = pA == 0 ? cTorso : pA == 1 ? cArm : pA == 2 ? cHand : pA == 3 ? cLeg : pA == 4 ? cFoot : cNeck;
        bool skinA = pA == 2 || pA > 5;
        vec3 bp = vBind;
        // 布：大きな色むら（色あせ・日焼け）、縦に流れるしわ（重さで垂れる）、細かな織りの粒
        float fade = vn3(bp * vec3(3.0, 3.0, 1.6)) * 0.6 + vn3(bp * 9.0) * 0.4;
        float fold = vn3(vec3(bp.x * 26.0, bp.y * 26.0, bp.z * 3.2));
        fold = smoothstep(0.15, 0.85, fold);
        // 膝裏と足首のたるみ：横に寄る皺（布が曲がる所に溜まる）
        float bunch = smoothstep(0.1, 0.0, abs(bp.z - 0.47)) + 0.8 * smoothstep(0.09, 0.0, abs(bp.z - 0.12));
        fold = mix(fold, 0.5 + 0.5 * sin(bp.z * 260.0 + vn3(bp * 30.0) * 5.0), clamp(bunch, 0.0, 1.0) * 0.7);
        clothFold = skinA ? 0.0 : fold;
        clothSoil = 0.0;
        float grain = vn3(bp * 180.0);
        vec3 col = cA * clamp(0.82 + (lumA - 0.3) * 0.35, 0.7, 1.08);
        // 麻の織り目と糸のむら（写真の模様）。肌は肌の模様
        pdC = skinA ? (pdTri(uPD, bp * 9.0, vBN).r - 0.5) * 0.5 : pdTri(uPD, bp * 14.0, vBN).g - 0.5;
        col *= 1.0 + pdC * 0.5;
        if (!skinA) {
          col *= 0.86 + fade * 0.26;
          col *= 0.8 + fold * 0.28;
          col *= 0.94 + grain * 0.1;
          // 色あせ：肩と背の上（日の当たる所）は白っぽく
          col = mix(col, vec3(dot(col, vec3(0.33))) * 1.25 + vec3(0.02, 0.018, 0.012), smoothstep(1.25, 1.5, bp.z) * 0.18 * fade);
          // 汗じみ：脇・背の中ほど
          float sweat = smoothstep(0.55, 0.9, vn3(bp * 5.0 + 3.0)) * smoothstep(0.95, 1.2, bp.z) * smoothstep(1.5, 1.3, bp.z);
          col *= 1.0 - sweat * (0.2 + 0.18 * uDirt + 0.15 * uGrime);
          // 汗じみの縁：乾いた塩が白く輪になる
          col += vec3(0.05, 0.048, 0.042) * smoothstep(0.03, 0.0, abs(sweat - 0.35)) * (0.5 + uGrime);
          // 裾と脛の泥（下ほど濃く、斑に）。膝の土
          float mud = smoothstep(0.55, 0.05, bp.z) * (0.45 + 0.55 * vn3(bp * vec3(14.0, 14.0, 6.0)));
          // 裾の泥はねの点々（歩くたびに跳ねた泥が乾いた跡）と、上へ滲みた筋
          float spl = smoothstep(0.78, 0.9, vn3(bp * 70.0)) * smoothstep(0.75, 0.2, bp.z);
          float drip = smoothstep(0.6, 0.85, vn3(vec3(bp.x * 40.0, bp.y * 40.0, bp.z * 2.5))) * smoothstep(0.7, 0.3, bp.z);
          // 膝の土：膝をついた跡の大きな斑（膝の高さの前後に、縁の乱れた塊）
          float knee = smoothstep(0.1, 0.02, abs(bp.z - 0.5)) * smoothstep(0.35, 0.6, vn3(bp * 11.0 + 5.0));
          mud += spl * 0.9 + drip * 0.35 + knee * 0.8;
          // 汚れの量と、戦が進むほど（uGrime）泥が上へ濃く
          mud *= 0.5 + 0.4 * uDirt + 0.35 * uGrime;
          clothSoil = clamp(mud, 0.0, 1.0);
          col = mix(col, vec3(0.085, 0.066, 0.045), clamp(mud, 0.0, 1.0) * 0.75);
          // 雨に濡れた布は暗く沈む（肩と背から先に濡れる）
          col *= 1.0 - uWet * (0.22 + 0.12 * smoothstep(0.9, 1.4, bp.z));
        } else {
          // 手と首：日焼けと汚れ、指の節の赤み
          col *= 0.9 + fade * 0.18;
          col = mix(col, col * vec3(1.12, 0.9, 0.82), vn3(bp * 40.0) * 0.35);
          col = mix(col, vec3(0.09, 0.07, 0.05), smoothstep(0.55, 0.85, vn3(bp * 30.0 + 7.0)) * 0.35);
        }
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = ((vPart > 1.5 && vPart < 2.5) || vPart > 5.5 ? 0.55 : ${'1.0'}) * (1.0 - 0.3 * uWet);
        roughnessFactor = mix(roughnessFactor, mix(0.98, 0.64, uWet), clothSoil);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 画面上の布の大きさで織り目を均す。絵の幅を掛けて近景まで消してしまわない。
        float kC = 1.0 - smoothstep(0.8, 2.2, max(fwidth(vBind.x * 14.0), max(fwidth(vBind.y * 14.0), fwidth(vBind.z * 14.0))) * 8.0);
        if (clothFold > 0.0 || pdC != 0.0) { float hB = clothFold * 0.006 + pdC * 0.0025 * kC; normal = clothBump(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)), faceDirection); }`)
      // 布は光が当たらない縁にも柔らかい光が回り（綿の毛羽立ち）、しわの谷は暗い。肌は赤い光が少し回り込む（表面下散乱の近似）
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          if ((vPart > 1.5 && vPart < 2.5) || vPart > 5.5) reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.09, 0.04, 0.03) * (1.0 - nv);
          else {
            reflectedLight.indirectDiffuse += diffuseColor.rgb * pow(1.0 - nv, 3.0) * 0.12;
            reflectedLight.directDiffuse *= 0.8 + clothFold * 0.3;
          }
        }`);
  };
  m.customProgramCacheKey = () => 'humbody' + (nh ? '-nh' : dm ? '-dm' : '') + (nt ? '-nt' : '');
  bodyMats.set(k, m);
  return m;
}

// ---------------- 本物の胴丸（甲冑一揃いの3Dスキャン） ----------------
// 博物館に飾られた本物の胴丸（胴・袖・草摺・佩楯・籠手・脛当・兜・面頬）を、着ている人形の顔と手ごと、骨の入った人に着せる
// ・形：assets/domaru_lite/domaru.glb（tools/domaru.mjs で台と槍を取り、約2万8千・1万6千・8千面に減らし、量子化と骨の重みを付けた物）。同梱の形を読む
// ・作者表記（CC BY 4.0）：This work is based on "Armadura Samurai Do-maru, BMVB" by Giravolt（docs/CREDITS.md）
// ・人形は腕を下ろして立っているので、骨をその姿に合わせた「着せる時の立ち姿」を作り、そこからの動きで甲冑を動かす
// crowd：侍・騎馬武者・武将（兵）にも着せる（人形の兜と顔は描かず、兵ごとの兜と顔を付ける）
// hiCap：細かい形（胴丸hi 約2.8万面・兜hi 約1.6万面）を同時に出す人数の上限（カメラに近い順。名のある武将と本人は数えず必ず細かい形）
export const DOMARU = { on: true, ready: false, failed: false, near: 17, crowd: true, hiCap: 40, ashigaruMidCap: 8 };
let DM = null, dmLoading = null;
export function loadDomaru() {
  if (dmLoading) return dmLoading;
  dmLoading = (async () => {
    const buf = await assetBytes('domaru');
    const tl = new THREE.TextureLoader();
    const [gl, col, nrm] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...['domaru_col', 'domaru_nrm'].map((n) => texOr(n, new URL('../assets/domaru_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: /col$/.test(n) ? 8 : 4 })),
    ]);
    const geo = {};
    gl.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, p = g.attributes.position;
      // 量子化の節の倍率を形へ戻す。骨の逆行列は従来のメートルのまま共有する。
      if (p.array instanceof Int16Array) {
        const a = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { a[i * 3] = p.getX(i) * o.scale.x; a[i * 3 + 1] = p.getY(i) * o.scale.y; a[i * 3 + 2] = p.getZ(i) * o.scale.z; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        g.computeBoundingBox(); g.computeBoundingSphere();
      }
      geo[o.name] = g;
    });
    const levels = ['hi', 'mid', 'lo'].filter(k => geo[k]);
    for (const k of levels) {
      const g = geo[k];
      g.setAttribute('skinIndex', g.getAttribute('_joints')); g.setAttribute('skinWeight', g.getAttribute('_weights'));
      g.deleteAttribute('_joints'); g.deleteAttribute('_weights');
    }
    const ex = gl.parser.json.extras || {};
    // 前腕・手と胴（腰・脚）にまたがる三角は外す：人形は腕を下ろして前腕が胴に触れているので、腕を上げると細く伸びて線に見える
    for (const k of levels) {
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
    // 一般兵は共通の1024角。本人・名将の2048角と形・法線はそのまま保つ。
    // 中遠景は既存の縮小段を描画器が選ぶ。毎コマの距離判定・材質の交換を足さない。
    const crowdCol = await textureAtMost(col, 1024);
    // 御貸具足は兜・顔を別に描く。隠す頭は絵の処理で捨てず、共有の形から一度だけ外す。
    const head = ex.bones.indexOf('Head');
    const withoutHead = (g) => {
      const J = g.attributes.skinIndex, W = g.attributes.skinWeight, I = g.index, keep = [];
      const hidden = (v) => {
        let weight = 0;
        for (let c = 0; c < 4; c++) if (J.getComponent(v, c) === head) weight += W.getComponent(v, c);
        return weight > 0.5;
      };
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
        if (!hidden(a) || !hidden(b) || !hidden(c)) keep.push(a, b, c);
      }
      const out = new THREE.BufferGeometry();
      out.attributes = { ...g.attributes }; out.setIndex(keep);
      out.boundingBox = g.boundingBox; out.boundingSphere = g.boundingSphere;
      return out;
    };
    DM = { hi: geo.hi, mid: geo.mid || geo.lo, lo: geo.lo, stand: geo.stand, bones: ex.bones, joints: ex.joints, col, crowdCol, nrm, inv: null,
      loanMid: withoutHead(geo.mid || geo.lo), loanLo: withoutHead(geo.lo), far: bodyLoGeo(geo.lo, 1 / 48) || geo.lo };
    DOMARU.ready = true;
  })().catch((e) => { DOMARU.failed = true; DOMARU.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の胴丸を読めませんでした（今の形で描きます）', e); });
  return dmLoading;
}

// 本物の兜の3Dスキャン（名のある武将の兜。胴丸の人形の兜と入れ替える）
// ・形：assets/kabuto_lite/kabuto.glb（tools/kabuto.mjs で台と中の支えと面頬を取り、約1万6千面と約3千面に減らした物）。src/asset_kabuto.js に base64 で入れてある
// ・作者表記（CC BY 4.0）：This work is based on "Samurai Helmet - 3D Scan" by chrr273u（コペンハーゲン国立博物館の兜。docs/CREDITS.md）
// ・形の座標：錣の裾が y=0、鉢の軸が x=z=0、前が +z、1 = 1m。頭の骨（Head）の立ち姿の位置から KB_FIT だけずらしてかぶせる
export const KABUTO = { on: true, ready: false, failed: false };
const KB_FIT = { y: -0.03, z: 0.012, s: 1.04 };
let KB = null, kbLoading = null;
export function loadKabuto() {
  if (kbLoading) return kbLoading;
  kbLoading = (async () => {
    const buf = await assetBytes('kabuto');
    const [gl, col] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      texOr('kabuto_col', new URL('../assets/kabuto_lite/kabuto_col.jpg', import.meta.url).href, { srgb: true, anisotropy: 8 }),
    ]);
    const geo = {};
    // スキャンの兜は前が +x へ約27°回っていた（錣の開きと吹返しの真ん中で測った）。形ごと戻して、正面を +z にそろえる
    gl.scene.traverse((o) => { if (o.isMesh) { o.geometry.rotateY(-0.47); o.geometry.computeVertexNormals(); geo[o.name] = o.geometry; } });
    const hiN = kbFlatten(geo.hi), loN = kbFlatten(geo.lo);
    for (const g of [geo.hi, geo.lo]) g.setAttribute('kbFlat', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    KB = { hi: geo.hi, lo: geo.lo, hiN, loN, col, mats: new Map(), fuki: kbFuki(geo.hi), menpo: null };
    // 名のある武将の兜の材質を先に作っておく（戦の中で new しない）
    for (const nm of new Set([...Object.keys(GENERALS), ...Object.keys(KB_BY)])) { const st = kabutoStyle({ face: 'g:' + nm }); kabutoMat(st, !!st.mon && !!KB.fuki[0] && !!KB.fuki[1]); }
    KABUTO.ready = true;
    // 面頬（denis_cliofas「Menpō - Samurai Mask」CC BY 4.0）：名のある武将で面頬を付ける人に。読めなければ今の打ち出しの面頬のまま
    try {
      const mbuf = await assetBytes('menpo');
      const tl = new THREE.TextureLoader();
      const [mg, mc, mn] = await Promise.all([new GLTFLoader().parseAsync(mbuf.buffer, ''), ...['menpo_col', 'menpo_nrm'].map((n) => texOr(n, new URL('../assets/menpo_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: 4 }))]);
      let g = null; mg.scene.traverse((o) => { if (o.isMesh) g = o.geometry; });
      g.computeVertexNormals();
      KB.menpo = { geo: g, mc, mn, mats: new Map() };
    } catch (e) { console.warn('面頬の形を読めませんでした（今の面頬で描きます）', e); }
  })().catch((e) => { KABUTO.failed = true; KABUTO.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の兜を読めませんでした（胴丸の兜で描きます）', e); });
  return kbLoading;
}
// 名のある武将の顔に、面頬の形を付ける（頭の骨の立ち姿の位置から MP_FIT だけずらす。形は上の縁が y=0・奥が z=0・前が +z）
const MP_FIT = { y: 0.08, z: 0.04, s: 1.2 };
// 色：絵は朱漆。武将の面頬の色（look.menpo）が赤でなければ、絵の明るさだけを残してその色の漆に塗り替える
function menpoMat(col) {
  const c = new THREE.Color(col || 0x6a1c14), hsl = c.getHSL({});
  const red = hsl.s > 0.4 && (hsl.h < 0.05 || hsl.h > 0.95);
  const key = red ? 'red' : c.getHex();
  const M = KB.menpo.mats;
  if (!M.has(key)) {
    const m = new THREE.MeshStandardMaterial({ map: KB.menpo.mc, normalMap: KB.menpo.mn, roughness: 0.42, metalness: 0.15, side: THREE.DoubleSide });
    const tint = c.clone().multiplyScalar(2.2);
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          ${red ? 'diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.8) * 0.85;' : `diffuseColor.rgb = min(vec3(1.0), vec3(${tint.r.toFixed(3)}, ${tint.g.toFixed(3)}, ${tint.b.toFixed(3)}) * (0.35 + lum));`} }
        diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.3;`);
    };
    m.customProgramCacheKey = () => 'menpo|' + key;
    M.set(key, m);
  }
  return M.get(key);
}
function dressMenpo(h) {
  const hd = SRC.rest.Head, k = MP_FIT.s;
  const fit = new THREE.Matrix4().makeTranslation(hd.x, hd.y + MP_FIT.y, hd.z + MP_FIT.z).multiply(new THREE.Matrix4().makeScale(k, k, k));
  const m = attachBody(h, 'Head', KB.menpo.geo, fit, menpoMat(h.look && (h.look.menpoScan || h.look.menpo)));
  h.parts.menpo = m;
}
// 名のある武将の頭に、本物の兜をかぶせる（遠くは軽い形）
// 武将ごとの兜の作り（GENERALS の兜・具足の色・家紋から決める）：
// ・漆：kuro 黒漆・shu 朱漆・sabi 錆地・natural スキャンのまま。鉢・眉庇・吹返しを塗り替え、金の筋と覆輪は残す
// ・前立：kuwa 鍬形・kuwaL 大鍬形・mika 三日月・nichi 日輪の板・nichiR 朱の日輪・tentsuki 天衝・tsuno 鹿角・none 無し
// ・スキャンの鉢の前の龍は、下の数人だけに残す（ほかの人は龍を鉢へ寄せて潰し、地の漆で塗る）
// ・吹返しの金の丸は、家紋がある人はその家の紋（金）に替える
// 龍はスキャンの兜の元の前立。華やかな兜で知られる今川義元だけに残す
const KB_DRAGON = new Set(['今川義元']);
const KB_SABI = new Set(['saito', 'asakura', 'azai', 'rokkaku', 'maru']);
// 名のある大将は史実の具足に寄せて決める。lac 鉢の漆・crest 前立・fuki 吹返し（lac 鉢と同じ・kin 金・shu 朱・kuro 黒・kawa 革）・odo 威の色
// ・家康：歯朶の前立に黒漆（歯朶具足）　・秀吉：馬藺の後立に黒漆と金の吹返し　・利家：金箔押の兜　・勝家：錆地に大鍬形
// ・信玄・勝頼：諏訪法性の兜に寄せて黒漆に大鍬形（白い毛は付けない）　・謙信：日輪と瑞雲　・忠勝：黒漆に鹿角　・直政・信繁：朱漆（赤備え）
const KB_BY = {
  織田信長: { lac: 'kuro', crest: 'kuwa', fuki: 'kin', odo: 0x2e4468 },
  今川義元: { lac: 'natural', crest: 'none', fuki: 'lac', odo: 0x7a2418 },
  徳川家康: { lac: 'kuro', crest: 'shida', fuki: 'kuro', odo: 0x24211e },
  羽柴秀吉: { lac: 'kuro', crest: 'bari', fuki: 'kin', odo: 0x8a6a2e },
  木下藤吉郎: { lac: 'sabi', crest: 'none', fuki: 'kawa', odo: 0x6a4a26 },
  前田利家: { lac: 'kin', crest: 'none', fuki: 'kin', odo: 0x7a5a2a },
  柴田勝家: { lac: 'sabi', crest: 'kuwaL', fuki: 'kawa', odo: 0x4a2418 },
  明智光秀: { lac: 'kuro', crest: 'kuwa', fuki: 'kawa', odo: 0x2a3650 },
  浅井長政: { lac: 'kuro', crest: 'kuwa', fuki: 'shu', odo: 0x34503e },
  武田信玄: { lac: 'kuro', crest: 'kuwaL', fuki: 'kin', odo: 0x8a2418 },
  武田勝頼: { lac: 'kuro', crest: 'kuwaL', fuki: 'shu', odo: 0x8a2a1c },
  上杉謙信: { lac: 'kuro', crest: 'mika', fuki: 'kin', odo: 0x4a3a62 },
  本多忠勝: { lac: 'kuro', crest: 'tsuno', fuki: 'kuro', odo: 0x24211e },
  井伊直政: { lac: 'shu', crest: 'tentsuki', fuki: 'shu', odo: 0xa8301f },
  真田信繁: { lac: 'shu', crest: 'tsuno', fuki: 'shu', odo: 0xa8301f },
  山県昌景: { lac: 'shu', crest: 'kuwa', fuki: 'shu', odo: 0xa8301f },
  森可成: { lac: 'sabi', crest: 'nichiR', fuki: 'kawa' },
  丹羽長秀: { lac: 'sabi', crest: 'mika', fuki: 'kawa' },
  滝川一益: { lac: 'kuro', crest: 'mika', fuki: 'kawa' },
  佐々成政: { lac: 'kuro', crest: 'kuwaL', fuki: 'shu' },
  黒田官兵衛: { lac: 'kuro', crest: 'none', fuki: 'kuro' },
};
const KB_CREST = { kabuto_m: 'kuwa', kabuto_b: 'kuwaL', kabuto_g: 'kuwaL', kabuto_r: 'kuwa', kabuto_f: 'mika', kabuto_w: 'nichi', kabuto_s: 'nichiR', kabuto_suwa: 'kuwaL', kabuto_shida: 'shida', kabuto_t: 'kuwa', kabuto_tentsuki: 'tentsuki', kabuto_shika: 'tsuno', kabuto_sanada: 'tsuno', kabuto_bari: 'bari' };
export function kabutoStyle(L) {
  const nm = typeof L.face === 'string' ? L.face.slice(2) : '', gd = GENERALS[nm] || {}, hat = gd.hat || L.hat || '', by = namedKacchu(L) || KB_BY[nm] || {};
  let hs = 0; for (const ch of nm) hs = (hs * 31 + ch.charCodeAt(0)) >>> 0;
  const hsl = new THREE.Color(gd.armor ?? L.armor ?? 0).getHSL({});
  const red = /^kabuto_(r|tentsuki|sanada)$/.test(hat) || (hsl.s > 0.5 && hsl.l > 0.2 && (hsl.h < 0.05 || hsl.h > 0.95));
  const mon = gd.mon || L.mon;
  // 決まりの無い人は家ごと（具足の色・家紋）と名前の散らしで
  const lac = by.lac || (red ? 'shu' : KB_SABI.has(mon) ? (hs % 3 ? 'sabi' : 'kuro') : ['kuro', 'sabi', 'kuro', 'kuro', 'sabi', 'natural'][hs % 6]);
  const fuki = by.fuki || (red ? 'shu' : ['lac', 'kawa', 'lac', 'kin', 'kawa'][(hs >>> 3) % 5]);
  const odo = by.odo ?? gd.lace ?? L.lace ?? 0x3a2a20;
  const dragon = KB_DRAGON.has(nm);
  const crest = L.takedaRed ? 'hishi' : by.crest || KB_CREST[hat] || 'none';
  return { lac, crest, dragon, fuki, odo, mon: mon && mon !== 'none' ? mon : null };
}
// 兜の形の座標での、鉢の前の面（楕円の鉢で近く見る）
const kbFront = (x, y) => { const R = 0.135 * Math.sqrt(Math.max(0, 1 - ((y - 0.13) / 0.155) ** 2)); return Math.sqrt(Math.max(0, R * R - x * x)); };
// 鉢の前の龍を鉢へ寄せて潰した形（kbFlat=1 の所は漆で塗る）。読み込みの時に一度だけ
function kbFlatten(g) {
  const n = g.clone(), p = n.attributes.position, f = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(x) > 0.08 || y < 0.158 || y > 0.265 || z < 0.05) continue;
    const zb = kbFront(x, y);
    if (z < zb + 0.004) continue;
    p.setZ(i, zb + 0.002 + (z - zb) * 0.06); f[i] = 1;
  }
  n.setAttribute('kbFlat', new THREE.BufferAttribute(f, 1));
  n.computeVertexNormals();
  return n;
}
// 吹返しの金の丸の場所と向き（左右）。形から測る（外を向く面の点を集める）
function kbFuki(g) {
  const p = g.attributes.position, nr = g.attributes.normal, out = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(s * 0.15, 0.172, 0.1), P = new THREE.Vector3(), N = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 > 0.025 ** 2) continue;
      if (nr.getX(i) * s * 0.6 + nr.getZ(i) * 0.8 < 0.2) continue;
      P.x += x; P.y += y; P.z += z; N.x += nr.getX(i); N.y += nr.getY(i); N.z += nr.getZ(i); k++;
    }
    out.push(k > 8 ? { p: P.multiplyScalar(1 / k), n: N.normalize() } : null);
  }
  return out;
}
// 漆の色（kin は金箔押）。吹返しは lac（鉢と同じ）か下の色。威（錣の糸）は武将ごとの色に染め直す
const KB_LAC = { natural: null, kuro: 0x16120f, shu: 0x8e2416, sabi: 0x4a2a1a, kin: 0xa8823a };
const KB_FUKI = { kin: 0xa8823a, shu: 0x8e2416, kuro: 0x16120f, kawa: 0x5c3a20 };
// 材質は（漆・吹返し・威・紋）の組ごとに一つ。読み込みの時に名のある武将の分を先に作り、あとは使い回す（形の作りは一つ＝描き分けは uniform だけ）
function kabutoMat(st, kill = false, fine = false) {
  const lk = st.lac, fk = st.fuki === 'lac' || !st.fuki ? lk : st.fuki, odo = st.odo ?? null;
  const key = lk + '|' + fk + '|' + (odo ?? '-') + (kill ? '|mon' : '') + (fine ? '|fine' : '');
  if (KB.mats.has(key)) return KB.mats.get(key);
  const c = KB_LAC[lk], fc = KB_FUKI[fk] ?? KB_LAC[fk];
  const lac = new THREE.Color(c ?? 0x3a2418), disc = c == null ? new THREE.Color(0xa08a68) : lk === 'kin' ? new THREE.Color(0x2a1c12) : lac;
  const fuki = new THREE.Color(fc ?? 0x3a2418), odoC = new THREE.Color(odo ?? 0x3a2418);
  const F = KB.fuki || [], far = new THREE.Vector3(9, 9, 9);
  // スキャンの絵は光が焼き込まれているので、照らしは控えめ（粗さ高め）。塗った漆は少し艶。金箔は金物らしく。裏（鉢の内・錣の裏）は暗く
  const mat = new THREE.MeshStandardMaterial({ map: KB.col, roughness: c == null ? 0.62 : lk === 'kin' ? 0.38 : 0.5, metalness: lk === 'kin' ? 0.6 : 0.18, envMapIntensity: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    unitContour(sh);
    Object.assign(sh.uniforms, { uLac: { value: lac }, uDisc: { value: disc }, uLacK: { value: c == null ? 0 : 1 }, uKill: { value: kill ? 1 : 0 },
      uFuki: { value: fuki }, uFukiK: { value: fc == null ? 0 : 1 }, uOdo: { value: odoC }, uOdoK: { value: odo == null ? 0 : 1 },
      uF0: { value: F[0] ? F[0].p : far }, uF1: { value: F[1] ? F[1].p : far } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float kbFlat; varying vec3 vKb; varying float vKbF;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKb = position; vKbF = kbFlat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLac, uDisc, uF0, uF1, uFuki, uOdo; uniform float uLacK, uKill, uFukiK, uOdoK; varying vec3 vKb; varying float vKbF;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float lum = dot(c, vec3(0.3, 0.59, 0.11));
        float gold = smoothstep(0.6, 0.75, (mx - mn) / (mx + 1e-4)) * smoothstep(0.4, 0.5, c.g / (c.r + 1e-4)) * smoothstep(0.1, 0.16, mx);
        float disc = uKill * (1.0 - smoothstep(0.024, 0.032, min(distance(vKb, uF0), distance(vKb, uF1))));
        float up = smoothstep(0.118, 0.13, vKb.y);
        // 吹返し：鉢の外の前の左右の返り
        float fk = smoothstep(0.145, 0.155, length(vKb.xz)) * smoothstep(0.02, 0.05, vKb.z) * smoothstep(0.08, 0.1, abs(vKb.x)) * smoothstep(0.112, 0.125, vKb.y) * (1.0 - smoothstep(0.23, 0.25, vKb.y));
        c = mix(c, uLac * (0.45 + 1.4 * lum), uLacK * up * (1.0 - fk) * (1.0 - gold) * (1.0 - disc));
        c = mix(c, uFuki * (0.45 + 1.4 * lum), uFukiK * fk * (1.0 - gold) * (1.0 - disc));
        // 威：錣（鉢より下）の糸を武将の色に。明るさの起伏は絵のまま
        c = mix(c, min(vec3(1.0), uOdo * (0.5 + 2.6 * lum)), uOdoK * (1.0 - up) * (1.0 - fk) * (1.0 - gold) * 0.9);
        c = mix(c, uDisc * (0.6 + 0.8 * lum), disc);
        c = mix(c, uLac * (0.55 + 0.8 * lum), vKbF);
        diffuseColor.rgb = c * (gl_FrontFacing ? 0.82 : 0.25); }`);
    if (fine) {
      // 吹返しの革・漆・金箔と錣の糸を、同じ一枚の形の中で描き分ける。
      // 模様の明るさを磨きと擦れにも使い、新しい絵や形は足さない。
      sh.fragmentShader = 'float kbFinishGold, kbFinishLeather, kbFinishCord, kbFinishWear;\n' + sh.fragmentShader
        .replace('c = mix(c, uLac * (0.45 + 1.4 * lum)', `
          kbFinishGold = max(gold, max(up * (1.0 - fk) * ${lk === 'kin' ? '1.0' : '0.0'}, fk * ${fk === 'kin' ? '1.0' : '0.0'}));
          kbFinishLeather = fk * ${fk === 'kawa' ? '1.0' : '0.0'} * (1.0 - gold);
          kbFinishCord = (1.0 - up) * (1.0 - fk) * (1.0 - gold);
          kbFinishWear = 1.0 - smoothstep(0.12, 0.48, lum);
          c = mix(c, uLac * (0.45 + 1.4 * lum)`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.34, 0.7, kbFinishWear);
          roughnessFactor = mix(roughnessFactor, 0.24 + kbFinishWear * 0.24, kbFinishGold);
          roughnessFactor = mix(roughnessFactor, 0.74 + kbFinishWear * 0.14, kbFinishLeather);
          roughnessFactor = mix(roughnessFactor, 0.86, kbFinishCord);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = kbFinishGold * (0.82 - kbFinishWear * 0.25) * (1.0 - kbFinishLeather) * (1.0 - kbFinishCord);`);
    }
  };
  mat.customProgramCacheKey = () => fine ? 'kabuto-finish3|' + lk + '|' + fk : 'kabuto2';
  KB.mats.set(key, mat);
  return mat;
}
// 前立の形（兜の形の座標。台は眉庇の上の真ん中）。形も材質も一つずつ作って使い回す
const CREST_GEO = new Map();
let CREST_MAT = null;
function crestMats() {
  if (!CREST_MAT) {
    const S = THREE.DoubleSide;
    CREST_MAT = {
      gold: new THREE.MeshStandardMaterial({ color: 0xc29a48, metalness: 0.85, roughness: 0.3, side: S }),
      black: new THREE.MeshStandardMaterial({ color: 0x14110f, metalness: 0.1, roughness: 0.3, side: S }),
      red: new THREE.MeshStandardMaterial({ color: 0x8e2416, metalness: 0.05, roughness: 0.35, side: S }),
    };
  }
  return CREST_MAT;
}
const CREST_NAMED = new THREE.Matrix4();
const CREST_M = new THREE.Matrix4().makeTranslation(0, 0.162, 0.142).multiply(new THREE.Matrix4().makeRotationX(-0.14));
const CREST_BACK = new THREE.Matrix4().makeTranslation(0, 0.25, -0.07).multiply(new THREE.Matrix4().makeRotationX(0.25));
function crestGeo(kind) {
  const named = namedCrestGeometry(kind);
  if (named) return [named];
  if (CREST_GEO.has(kind)) return CREST_GEO.get(kind);
  const flat = (pts, d = 0.004) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: d, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -d / 2); return g; };
  // 刃：二次の曲線を芯に、幅 w0→w1 で細る板（sd で左右）
  const blade = (sd, p1, p2, w0, w1) => {
    const L = [], R = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = (1 - t) ** 2, b = 2 * (1 - t) * t, e = t * t;
      const x = b * p1[0] + e * p2[0] + a * 0.012, y = b * p1[1] + e * p2[1];
      const dx = 2 * (1 - t) * (p1[0] - 0.012) + 2 * t * (p2[0] - p1[0]), dy = 2 * (1 - t) * p1[1] + 2 * t * (p2[1] - p1[1]);
      const l = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2;
      L.push([sd * (x - dy / l * w), y + dx / l * w]); R.push([sd * (x + dy / l * w), y - dx / l * w]);
    }
    return flat(sd > 0 ? [...R, ...L.reverse()] : [...L, ...R.reverse()]);
  };
  const dai = () => { const g = new THREE.BoxGeometry(0.05, 0.026, 0.007); g.translate(0, 0.008, 0); return g.toNonIndexed(); };
  const parts = [];   // [形, 材質の鍵]
  const kuwa = (sp, h, w0, w1) => { for (const sd of [1, -1]) parts.push([blade(sd, [0.07, 0.03], [sp, h], w0, w1), 'gold']); parts.push([dai(), 'gold']); };
  if (kind === 'hishi') parts.push([flat([[0, 0.025], [0.065, 0.075], [0, 0.125], [-0.065, 0.075]]), 'gold']);
  if (kind === 'kuwa') kuwa(0.085, 0.16, 0.016, 0.007);
  if (kind === 'kuwaL') kuwa(0.12, 0.22, 0.018, 0.008);
  if (kind === 'tentsuki') { for (const sd of [1, -1]) parts.push([blade(sd, [0.03, 0.12], [0.1, 0.3], 0.022, 0.05), 'gold']); parts.push([dai(), 'gold']); }
  if (kind === 'mika') {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = Math.PI * 1.12 + (i / 20) * Math.PI * 0.76; pts.push([Math.cos(a) * 0.15, 0.155 + Math.sin(a) * 0.15]); }
    for (let i = 20; i >= 0; i--) { const a = Math.PI * 1.12 + (i / 20) * Math.PI * 0.76; pts.push([Math.cos(a) * 0.143, 0.179 + Math.sin(a) * 0.143]); }
    parts.push([flat(pts), 'gold'], [dai(), 'gold']);
  }
  if (kind === 'nichi' || kind === 'nichiR') {
    const d = new THREE.CylinderGeometry(0.048, 0.048, 0.004, 28); d.rotateX(Math.PI / 2); d.translate(0, 0.07, 0);
    const st = new THREE.BoxGeometry(0.01, 0.03, 0.005); st.translate(0, 0.012, 0);
    parts.push([d.toNonIndexed(), kind === 'nichiR' ? 'red' : 'gold'], [st.toNonIndexed(), 'gold'], [dai(), 'gold']);
    if (kind === 'nichiR') { const r = new THREE.TorusGeometry(0.049, 0.0035, 5, 28); r.translate(0, 0.07, 0); parts.push([r.toNonIndexed(), 'gold']); }
  }
  // 歯朶（家康の歯朶具足の前立）：台から扇に開く金の葉を左右に三枚ずつと真ん中に一枚
  if (kind === 'shida') {
    for (const sd of [1, -1]) {
      parts.push([blade(sd, [0.02, 0.07], [0.04, 0.135], 0.026, 0.005), 'gold']);
      parts.push([blade(sd, [0.045, 0.055], [0.08, 0.1], 0.024, 0.005), 'gold']);
      parts.push([blade(sd, [0.06, 0.03], [0.105, 0.055], 0.02, 0.004), 'gold']);
    }
    parts.push([blade(1, [0.0, 0.08], [-0.012, 0.15], 0.022, 0.005), 'gold'], [dai(), 'gold']);
  }
  // 馬藺（秀吉の馬藺の後立）：鉢の後ろから光のように開く細い金の葉。形の座標は後ろの台が原点
  if (kind === 'bari') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2.3, Ln = 0.27;
      const sx = Math.abs(Math.sin(a)), sd = a < 0 ? -1 : 1;
      parts.push([blade(sd, [sx * Ln * 0.5 + 0.006, Math.cos(a) * Ln * 0.5], [sx * Ln, Math.cos(a) * Ln], 0.012, 0.003), 'gold']);
    }
  }
  if (kind === 'tsuno') {
    for (const sd of [1, -1]) {
      const main = new THREE.CatmullRomCurve3([[0.015, 0, 0], [0.05, 0.05, -0.01], [0.075, 0.12, -0.03], [0.06, 0.2, -0.06]].map(([x, y, z]) => new THREE.Vector3(sd * x, y, z)));
      const tine = new THREE.CatmullRomCurve3([[0.062, 0.085, -0.02], [0.095, 0.12, -0.02], [0.11, 0.16, -0.03]].map(([x, y, z]) => new THREE.Vector3(sd * x, y, z)));
      parts.push([new THREE.TubeGeometry(main, 12, 0.007, 5).toNonIndexed(), 'black'], [new THREE.TubeGeometry(tine, 6, 0.005, 5).toNonIndexed(), 'black']);
    }
  }
  // 材質ごとに一つの形にまとめる
  const by = {};
  for (const [g, k] of parts) { for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); (by[k] = by[k] || []).push(g); }
  const out = Object.entries(by).map(([k, gs]) => { const g = mergeGeometries(gs); g.computeVertexNormals(); g.computeBoundingSphere(); return [g, k]; });
  CREST_GEO.set(kind, out);
  return out;
}
const MON_PLANE = new THREE.PlaneGeometry(0.058, 0.058);
function dressKabuto(h) {
  const hd = SRC.rest.Head, k = KB_FIT.s, L = h.look || {};
  const st = kabutoStyle(L);
  const fit = new THREE.Matrix4().makeTranslation(hd.x, hd.y + KB_FIT.y, hd.z + KB_FIT.z).multiply(new THREE.Matrix4().makeScale(k, k, k));
  // 吹返しの紋（家紋の絵は陣羽織と同じ作り。金で）
  const monMat = st.mon && KB.fuki[0] && KB.fuki[1] ? (monDecal(st.mon, 0xc9a24a) || {}).material : null;
  const G = st.dragon ? [KB.hi, KB.lo] : [KB.hiN, KB.loN];
  const m = attachBody(h, 'Head', G[0], fit, kabutoMat(st, !!monMat));
  m.userData.surfaceBase = m.material;
  m.userData.surfaceFine = kabutoMat(st, !!monMat, true);
  m.frustumCulled = true;
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = false && !h.u.isPlayer ? 9 : DOMARU.near;
    const want = !cam.isOrthographicCamera && (qualityKeeper(h.u) || d2 < near * near && m.userData.hiOK !== false) ? G[0] : G[1];
    if (m.geometry !== want) m.geometry = want;
  };
  const add = (geo, mat, mx) => { const c = new THREE.Mesh(geo, mat); c.matrixAutoUpdate = false; c.matrix.copy(mx); c.castShadow = true; m.add(c); return c; };
  if (st.crest !== 'none') {
    const CM = crestMats();
    // 龍の人の鍬形は、龍の頭の後ろ（鉢の前）から立てる
    const mx = namedKacchu(L) ? CREST_NAMED : st.crest === 'bari' ? CREST_BACK : st.dragon ? new THREE.Matrix4().makeTranslation(0, 0.2, 0.118).multiply(new THREE.Matrix4().makeRotationX(-0.2)) : CREST_M;
    for (const [g, key] of crestGeo(st.crest)) add(g, CM[key], mx);
  }
  if (monMat) {
    for (const f of KB.fuki) {
      const z = f.n, x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
      add(MON_PLANE, monMat, new THREE.Matrix4().makeBasis(x, y, z).setPosition(f.p.clone().addScaledVector(z, 0.003)));
    }
  }
  h.parts.kabuto = m;
}
// 人と具足の素材は、出陣や姿の見本で必要になった時だけ読む。
// 本物の胴丸を着る人：名のある武将と、look.real の人（侍大将より上の本人）
export function wantsDomaru(look) { return DOMARU.on && !!look && !look.kosode && !look.nanban && !namedKacchu(look) && (!!look.real || (typeof look.face === 'string' && look.face.startsWith('g:'))); }
// 兵の侍と、足軽の三人に一人は御貸具足の胴丸を着る。本人・名将の着せ分けは専用の処理に任せる。
const crowdDomaru = (look) => DOMARU.on && DOMARU.crowd && !!look && !look.takedaRed && ((look.tier ?? 0) >= 1 || ((look.vi || 0) % 3 === 0)) && !look.kosode && !look.hero && !look.nanban && !namedKacchu(look) && !isSohei(look) && !wantsDomaru(look);
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
// 人形の顔と面頬の所（胴丸の形の座標：前が +z）。この中の頭の頂点を抜く
const DM_FACE = { z: 0.02, x: 0.105, y: 1.695 };
// 武将の兜の合わせ：鉢の広げ（前後左右）と下げ（m）。実写の顔は人形の顔より小さく低いので、眉庇が眉の少し上に来るまで深くかぶせる
const HELM_FIT = { w: 1.08, dy: 0.055 };
// 胴丸の材質の道具（値の揺らぎと、高さの変わりから法線を傾ける）
const DM_GLSL = `
float dmHb(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dmVn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmHb(i), dmHb(i + vec3(1,0,0)), f.x), mix(dmHb(i + vec3(0,1,0)), dmHb(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dmHb(i + vec3(0,0,1)), dmHb(i + vec3(1,0,1)), f.x), mix(dmHb(i + vec3(0,1,1)), dmHb(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 dmBump(vec3 sp, vec3 sn, vec2 dH, float fd) {
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, sn), R2 = cross(sn, sx);
  float det = dot(sx, R1) * fd;
  vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * sn - g);
}
`;
// 使い込みの四通り（x 刀傷・擦り傷の多さ、y 汚れの濃さ、z 日焼けの褪せ、w 傷の場所のずらし）。人ごとに選ぶ（材質は四つまで増える）
const DM_WEAR = [[0.25, 0.7, 0.1, 0.0], [0.7, 1.0, 0.3, 3.1], [1.0, 1.35, 0.5, 5.7], [0.45, 0.85, 0.75, 8.3]];
function domaruMaterial(look, noHead = false, wv = 0, detailed = true) {
  const lace = new THREE.Color(look.lace ?? 0x2e3a52);
  const blueLace = lace.b > lace.r * 1.15 && lace.b > lace.g;
  const tint = armorTint(look.armor);
  // noHead：true は兜と顔を描かない。'helm' は兜（鉢・錣・吹返し・眉庇）を残し、人形の顔と面頬だけを抜く（名のある武将：スキャンの兜に、その人の顔と前立）
  const helm = noHead === 'helm';
  const k = (blueLace ? 'blue' : lace.getHex()) + '|' + (tint ? tint.getHex() : 0) + (helm ? '|hm' : noHead ? '|nh' : '') + '|w' + wv + (detailed ? '|detail' : '|crowd');
  if (dmMats.has(k)) return dmMats.get(k);
  // 両面で描き、裏（甲冑の内側）は暗く塗る：腕を上げた時の脇など、スキャンに写っていない所が、抜けずに暗い隙間に見える
  const m = new THREE.MeshStandardMaterial({ map: detailed ? DM.col : DM.crowdCol, normalMap: DM.nrm, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.55, metalness: 0.15, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const U = { uLace: { value: lace }, uLaceAmt: { value: blueLace ? 0 : 1 }, uArm: { value: tint || new THREE.Color(0) }, uArmAmt: { value: tint ? 1 : 0 }, uWV: { value: new THREE.Vector4(...(DM_WEAR[wv] || DM_WEAR[0])) } };
  const hi = noHead ? humanBoneMap(DM.bones, domaruInverses())[DM.bones.indexOf('Head')] : -1;
  m.onBeforeCompile = (sh) => {
    unitContour(sh);
    Object.assign(sh.uniforms, U);
    if (noHead) {
      sh.vertexShader = 'varying float vHd;\nvarying vec3 vHP0;\n' + sh.vertexShader.replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
        vHd = 0.0; vHP0 = position;
        for (int i = 0; i < 4; i++) { float bi = skinIndex[i]; if (abs(bi - ${hi}.0) < 0.5) vHd += skinWeight[i]; }`);
      // 兜は少し深く（下げて）、鉢を少し広げてかぶる（武将の頭は人形の頭より大きい）
      if (helm) sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', `{
          float hw = 0.0; for (int i = 0; i < 4; i++) { if (abs(skinIndex[i] - ${hi}.0) < 0.5) hw += skinWeight[i]; }
          if (hw > 0.5) { vec3 c = vec3(0.0, 1.66, -0.02); transformed = c + (transformed - c) * vec3(${HELM_FIT.w.toFixed(3)}, 1.0, ${HELM_FIT.w.toFixed(3)}); transformed.y -= ${HELM_FIT.dy.toFixed(3)}; }
        }
        #include <skinning_vertex>`);
      sh.fragmentShader = 'varying float vHd;\nvarying vec3 vHP0;\n' + sh.fragmentShader.replace('void main() {', helm
        ? 'void main() {\n if (vHd > 0.5 && vHP0.z > ' + DM_FACE.z.toFixed(3) + ' && abs(vHP0.x) < ' + DM_FACE.x.toFixed(3) + ' && vHP0.y < ' + DM_FACE.y.toFixed(3) + ') discard;'
        : 'void main() {\n if (vHd > 0.5) discard;');
    }
    sh.uniforms.uWet = WET;
    sh.uniforms.uGrime = GRIME;
    // 着せる前の立ち姿の位置（m。足の裏が 0、前が +z）：縅の目・汚れの場所を、動いても甲冑に貼り付いたまま描く
    sh.vertexShader = 'varying vec3 vDmP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDmP = position;');
    sh.fragmentShader = 'uniform vec3 uLace, uArm;\nuniform float uLaceAmt, uArmAmt, uWet, uGrime;\nuniform vec4 uWV;\nvarying vec3 vDmP;\nfloat dmCloth, dmGold, dmLacq, dmLeather, dmH, dmWv, dmEdge, dmDust;\n' + DM_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // スキャンの絵は博物館の暗い照明で撮られているので、少し明るく戻す
        diffuseColor.rgb = min(diffuseColor.rgb * 1.55, vec3(1.0));
        vec3 c = diffuseColor.rgb;
        float laceMask = smoothstep(1.08, 1.45, c.b / (max(c.r, c.g) + 0.002)) * smoothstep(0.003, 0.012, c.b);
        float blue = laceMask * uLaceAmt;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), ll = dot(uLace, vec3(0.2126, 0.7152, 0.0722));
        // 黒い漆（暗く、色の薄い所）
        float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / (max(c.r, max(c.g, c.b)) + 0.01);
        // 黒漆も漆として判定する。染め直しの有無を材質判定へ混ぜない。
        float lac = smoothstep(0.2, 0.06, l) * smoothstep(0.55, 0.2, sat) * (1.0 - laceMask);
        // 色の漆は深く沈んだ色に（明るい斑をそのまま持ち上げると、塗りたての玩具の赤に見える）
        vec3 armC = uArm * (0.5 + l * 3.2);
        diffuseColor.rgb = mix(c, uLace * min(3.0, l / max(ll, 0.002)) * 1.2, blue);
        diffuseColor.rgb = mix(diffuseColor.rgb, armC, lac * uArmAmt);
        // 藍の威糸は、洗いざらしの褪せた藍に（スキャンの鮮やかな青のままだと染めたての作り物に見える）
        float blue0 = laceMask * (1.0 - uLaceAmt);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.45, 0.25))) * vec3(0.92, 0.97, 1.12), blue0 * 0.3);
        if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.012, 0.01, 0.009);
        // 材の見分け：糸（威し・色の濃い明るい所）は布の艶消し、金具（黄みの強い明るい所）は金属の照り、黒い漆は滑らかだが擦れて斑
        float yel = smoothstep(0.15, 0.35, (c.r + c.g) * 0.5 - c.b) * smoothstep(0.08, 0.2, l);
        dmGold = yel * (1.0 - laceMask);
        dmCloth = max(laceMask, (1.0 - smoothstep(0.1, 0.4, lac + dmGold)) * smoothstep(0.35, 0.6, sat));
        dmLacq = lac;
        // 茶の革帯を鉄の鏡面へ混ぜない。元の絵の色から読み、威糸と金具は除く。
        dmLeather = smoothstep(1.12, 1.6, c.r / max(c.g, 0.003))
          * smoothstep(1.06, 1.5, c.g / max(c.b, 0.003))
          * (1.0 - max(dmGold, max(dmCloth, dmLacq)));
        diffuseColor.rgb *= 1.0 - uWet * 0.25 * dmCloth;
        // 絵の細かな起伏：ぼかした明るさとの差。小札の段の影・縅の目・金具の縁が、後で凹凸になる（絵の段にそろう）
        float lb = min(dot(texture2D(map, vMapUv, 2.5).rgb * 1.55, vec3(0.2126, 0.7152, 0.0722)), 1.0);
        dmH = clamp(l - lb, -0.25, 0.25);
        dmWv = 0.5; dmEdge = 0.0; dmDust = 0.0;
        if (gl_FrontFacing) {
          vec3 p = vDmP;
          float n1 = dmVn(p * 16.0), n2 = dmVn(p * 75.0 + 3.1), n3 = dmVn(p * 260.0 + 7.7);
          // 縅糸の編み目：糸は縦に通る（胴・袖・草摺・錣）。一筋 1cm ほどの平組に、杉綾の目。遠くでは消す
          {
            float au = atan(p.x, p.z + 0.03) * 0.21 * 100.0, av = p.y * 330.0;
            float fu = fract(au), gap = smoothstep(0.0, 0.14, min(fu, 1.0 - fu));
            float chev = fract(av + abs(fu - 0.5) * 1.6), rib = smoothstep(0.0, 0.3, chev) * smoothstep(1.0, 0.7, chev);
            float fw = fwidth(av) + fwidth(au) * 4.0;
            dmWv = mix(0.5, gap * (0.35 + rib * 0.65), (1.0 - smoothstep(0.3, 0.9, fw)) * dmCloth);
            diffuseColor.rgb *= mix(1.0, 0.72 + dmWv * 0.5, dmCloth);
            // 糸の毛羽と色むら（染めの濃い薄い、日に焼けた所）
            diffuseColor.rgb *= mix(1.0, 0.86 + n1 * 0.2 + (n3 - 0.5) * 0.12, dmCloth);
          }
          // 擦れ：板の角・縁（丸みの強い所）で漆が薄くなり、下地の茶が出る。金具の角は明るく光る
          {
            vec3 vp = -vViewPosition, dpx = dFdx(vp), dpy = dFdy(vp);
            float curv = dot(dFdx(vNormal), dpx) / max(dot(dpx, dpx), 1e-10) + dot(dFdy(vNormal), dpy) / max(dot(dpy, dpy), 1e-10);
            dmEdge = smoothstep(14.0, 55.0, curv) * smoothstep(0.3, 0.7, n2 * 0.7 + n1 * 0.3);
            // 絵の中の明るい斑（元から擦れた所）も擦れに数える
            dmEdge = max(dmEdge, smoothstep(0.05, 0.14, dmH) * smoothstep(0.55, 0.75, n2));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.085, 0.045), dmEdge * dmLacq * 0.7);
            // 漆の細かな剥げ：小さな斑に下地の茶が覗く（新品の一色の黒にしない）
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.065, 0.035), smoothstep(0.72, 0.9, n3 * 0.55 + n2 * 0.45) * dmLacq * 0.5);
          }
          // 金具：金の照り（黄みを少し深く）。角は擦れて明るい
          diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * vec3(1.12, 1.0, 0.7) + vec3(0.03, 0.02, 0.0) + dmEdge * 0.08, vec3(1.0)), dmGold);
          // 使い込んだ汚れ：溝（小札の重なり・糸の目）に埃が溜まり、上を向いた面に土埃。腰から下（草摺の裾・佩楯・脛当）は泥
          float up = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          float cav = smoothstep(0.0, -0.12, dmH);
          float dust = (cav * 0.6 + smoothstep(0.35, 0.9, up) * 0.45) * (0.3 + 0.7 * n1) * (0.45 + 0.7 * uGrime) * (1.0 - uWet * 0.7);
          float mudA = smoothstep(0.66, 0.12, p.y) * (0.3 + 0.7 * smoothstep(0.35, 0.7, n1 * 0.6 + n2 * 0.4)) * (0.3 + 0.7 * uGrime);
          mudA += smoothstep(0.8, 0.92, n3 * 0.5 + n2 * 0.5) * smoothstep(0.95, 0.4, p.y) * 0.6 * (0.3 + 0.7 * uGrime);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.15), clamp(dust, 0.0, 0.7) * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.078, 0.055), clamp(mudA, 0.0, 1.0) * 0.6 * (1.0 - uWet * 0.3));
          dmDust = clamp(dust * 0.5 + mudA * 0.7, 0.0, 1.0);
          // 人ごとの汚れの濃さ
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.14, 0.11), clamp(dmDust * (uWV.y - 0.8), 0.0, 0.4));
          // 日焼けの褪せ：色の漆は茶へ、威糸は白っぽく褪せる（肩と兜の上ほど）
          float sunU = smoothstep(1.0, 1.6, p.y) * uWV.z;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.72, 0.6) + vec3(0.03, 0.02, 0.01), dmLacq * sunU * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.2 + 0.03, dmCloth * sunU * 0.4);
          // 刀傷と擦り傷：胴と袖の前に、斜めの細い切れ目。漆が削れて下地が白く、縁は暗い
          {
            vec3 q = p + vec3(uWV.w, uWV.w * 0.7, 0.0);
            float cut = 0.0;
            // 消える距離・背面・布・金具では、最後にゼロを掛ける傷の計算を省く。
            // 微分は分岐の外で求め、近くの傷と遠くで消える境目を保つ。
            float fw = fwidth(p.y) * 60.0;
            if (fw < 1.2 && p.z >= 0.0 && dmCloth < 1.0 && dmGold < 1.0) {
              for (int i = 0; i < 3; i++) {
                float fi = float(i);
                vec2 d = normalize(vec2(cos(fi * 2.1 + uWV.w), sin(fi * 2.1 + uWV.w)));
                float ln = dot(q.xy, d) * 7.0 + dmVn(q * 3.0 + fi) * 0.8;
                float line = 1.0 - smoothstep(0.0, 0.035, abs(fract(ln) - 0.5));
                // 傷は短く途切れ途切れに（胴に長く走ると、紐を巻いたように見える）
                // 線の外は傷がないので、途切れを作る二つの雑音も読まない。
                if (line > 0.0) {
                  float seg = smoothstep(0.78, 0.9, dmVn(q * 5.5 + fi * 4.0)) * smoothstep(0.35, 0.7, dmVn(q * 23.0 + fi));
                  cut = max(cut, line * seg);
                }
              }
            }
            cut *= uWV.x * (0.3 + 0.7 * uGrime) * (1.0 - dmCloth) * (1.0 - dmGold);
            cut *= 1.0 - smoothstep(0.4, 1.2, fw);
            // 削れた所は下地の錆び色（明るい白にしない）。縁の暗さも少し
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(0.3, 0.22, 0.15), 0.8), cut * 0.6);
            dmEdge = max(dmEdge, cut);
          }
        }
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        // 漆は擦れ・埃で照りに斑（新品の一律の照りにしない）。滑らかな所は深い照り、擦れた所は曇る
        float wear = dmVn(vDmP * 40.0) * 0.7 + dmVn(vDmP * 140.0) * 0.3;
        // 露出した鉄は酸化と擦れのある鈍い面。革・布・漆の照りを別々にする。
        roughnessFactor = 0.43 + wear * 0.2;
        roughnessFactor = mix(roughnessFactor, ${'0.18 + wear * 0.24 + dmEdge * 0.25'}, dmLacq);
        roughnessFactor = mix(roughnessFactor, 0.72 + wear * 0.14, dmLeather);
        roughnessFactor = mix(roughnessFactor, ${'1.0'}, dmCloth);
        // 金具：磨かれた照りに、細かな引っ掻き傷
        float scr = smoothstep(0.55, 0.8, dmVn(vec3(vDmP.x * 600.0, vDmP.y * 40.0, vDmP.z * 600.0)));
        roughnessFactor = mix(roughnessFactor, 0.24 + scr * 0.22, dmGold);
        roughnessFactor = mix(roughnessFactor, 0.95, dmDust);
        // 雨：漆と金具は濡れて照りが増し、糸は水を吸って暗く重くなる（照りは少しだけ）
        roughnessFactor *= 1.0 - uWet * mix(0.28, 0.1, max(dmCloth, dmLeather));
      }`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      ${'metalnessFactor = 0.82 * (1.0 - dmDust);'}
      metalnessFactor = mix(metalnessFactor, 0.0, max(dmLeather, max(dmCloth, dmLacq)));
      metalnessFactor = mix(metalnessFactor, 0.85, dmGold * (1.0 - dmDust));`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        // 小札の段・縅の目の凹凸（絵の細かな起伏と、編み目の高さ）
        // 小札と威の凹凸を分ける。画素より細かい所は消し、遠景のちらつきを防ぐ。
        float dmDetail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
        float hB = (dmH * mix(0.009, 0.005, dmCloth) + (dmWv - 0.5) * 0.0022 * dmCloth)
          * dmDetail * (1.0 - dmDust * 0.45);
        normal = dmBump(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)), faceDirection);
      }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 漆の艶：日の光が細く鋭く映る（塗りの上の透けた層の照り）。金具は少し広く、金色に光る
        // directLight は日差しの最後の値（影が掛かった色）
        vec3 Hd = normalize(directLight.direction + normalize(vViewPosition));
        float nh = clamp(dot(normal, Hd), 0.0, 1.0), nl = clamp(dot(normal, directLight.direction), 0.0, 1.0);
        float cc = dmLacq * (1.0 - dmDust) * (1.0 - dmEdge * 0.7) * (gl_FrontFacing ? 1.0 : 0.0);
        reflectedLight.directSpecular += directLight.color * nl * (pow(nh, 180.0) * 0.7 * cc + pow(nh, 70.0) * 0.45 * dmGold * (1.0 - dmDust) * vec3(1.0, 0.84, 0.52));
      }
      #endif
      {
        // 光源によらない白い縁光は足さず、実際の空と篝火の照りで素材を読む。
        // 黒漆の空の映り込みを抑え、金具の反射と威糸の艶消しを分ける。
        reflectedLight.indirectSpecular *= mix(1.0, 0.32 + uWet * 0.28, dmLacq);
        reflectedLight.indirectSpecular *= mix(1.0, 0.25, dmCloth);
      }`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      {
        // 既存の絵の谷を遮光に使う。段が画素より細かい距離では消してちらつきを避ける。
        float detail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
        float cavity = (1.0 - smoothstep(-0.1, 0.0, dmH)) * detail;
        // 糸の谷も遮光する。遠くでは細部を消し、直接光と金具の反射は保つ。
        float weaveShade = mix(1.0, 0.72 + 0.28 * dmWv, dmCloth * detail);
        // 板の谷と革帯の重なりを曇天の回り込みにも残す。直接光は既存の影を使う。
        float occlusion = (1.0 - cavity * (0.55 + dmLeather * 0.16)) * weaveShade;
        reflectedLight.indirectDiffuse *= occlusion;
        reflectedLight.indirectSpecular *= occlusion;
      }`);
    // 一人称：目のすぐ前（FP_CUT の球の中）に来た自分の袖・肩の板は描かない（目の前を塞がない。他の人は目から遠いので消えない）
    sh.uniforms.uFpCut = FP_CUT;
    sh.vertexShader = 'varying vec3 vFpW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vFpW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec4 uFpCut;\nvarying vec3 vFpW;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (uFpCut.w > 0.0 && distance(vFpW, uFpCut.xyz) < uFpCut.w) discard;');
  };
  m.customProgramCacheKey = () => 'domaru' + (helm ? '-hm' : noHead ? '-nh' : '') + (detailed ? '-detail' : '-crowd');
  dmMats.set(k, m);
  return m;
}
// 骨の入った人に本物の胴丸を着せる（顔も手も人形の物を使う）。noHead の時は兜と顔を描かない
function dressDomaru(h, noHead = false) {
  // 元の体は隠す（現代の服の膨らみが甲冑の外へ出るので）。脇の、スキャンに写っていない所は、甲冑の裏（暗い）が見える
  h.body.visible = false;
  const sk = new THREE.Skeleton(DM.bones.map((nm) => h.bones[nm]), domaruInverses());
  const detailed = !!(h.u.isPlayer || h.u.name || isNamed(h.look) || h.look.hero);
  h.loanedDomaru = noHead === true && !detailed && (h.look.tier ?? 0) < 1;
  const variant = Math.floor(((h.seed || 0) * 5.37) % 1 * 4);
  const m = new THREE.SkinnedMesh(h.loanedDomaru ? DM.loanMid : DM.hi, domaruMaterial(h.look, noHead, variant, detailed));
  m.userData.surfaceBase = m.material;
  m.userData.surfaceFine = domaruMaterial(h.look, noHead, variant, true);
  m.bind(sk, new THREE.Matrix4());
  // 足軽の影は、元からある具足の一体形で描く。胴丸を加えても影を描く物を増やさない。
  m.castShadow = !h.loanedDomaru; m.receiveShadow = true;
  m.frustumCulled = true; m.boundingSphere = BSPH;
  // 遠くは軽い形（影を描く時も軽い形）
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = DOMARU.near;
    // 御貸具足は近景に中の段。本人・名将の細かい形と、侍の三十五メートル以内の中の段は保つ。
    // 遠景の形も読み込み時に共用で作り、描くたびに形の置き場を検索しない。
    const close = !cam.isOrthographicCamera && d2 < near * near;
    const want = h.loanedDomaru
      ? close && m.userData.midOK !== false ? DM.loanMid : DM.loanLo
      : !cam.isOrthographicCamera && (qualityKeeper(h.u) || close && m.userData.hiOK !== false) ? DM.hi
        : !cam.isOrthographicCamera && d2 < 35 * 35 ? DM.mid
          : !cam.isOrthographicCamera && d2 > 35 * 35 && !HUM.lodOff ? DM.far : DM.lo;
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

// 本陣の飾りの具足一式（櫃に腰掛けた姿の3Dスキャン。約2万面・遠くは4千面）。読み込みを待ってから返す
// ・yoroi：國學院大學栃木学園参考館「yoroi」（CC BY 4.0）。既定はこれ
// ・tokyo：TokyoDigitalHeritage「Samurai Armor, Tokyo National Museum (Ueno)」（CC BY 4.0）。館の中での撮影の決まり（写真の商用利用）を kaito が確かめるまでは出さない（YOROI.tokyo を true にすると出る）
// 形は台（櫃）の底が y=0、前が +z。使い方：const g = await displayYoroi(); g.position.set(x, 地面, z); g.rotation.y = 向き; scene.add(g)
export const YOROI = { on: true, tokyo: false };
let YR = null, yrLoading = null;
function loadYoroi() {
  if (yrLoading) return yrLoading;
  yrLoading = (async () => {
    const buf = await assetBytes('yoroi');
    const gl = await new GLTFLoader().parseAsync(buf.buffer, '');
    YR = { geo: {}, mat: {} };
    gl.scene.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); YR.geo[o.name] = o.geometry; } });
  })().catch((e) => { YR = null; console.warn('飾りの具足を読めませんでした', e); });
  return yrLoading;
}
export async function displayYoroi({ kind = 'yoroi', scale = 1 } = {}) {
  if (!YOROI.on || (kind === 'tokyo' && !YOROI.tokyo)) return null;
  await loadYoroi();
  if (!YR || !YR.geo[kind]) return null;
  if (!YR.mat[kind]) {
    const col = await texOr(kind + '_col', new URL('../assets/yoroi_lite/' + kind + '_col.jpg', import.meta.url).href, { srgb: true, anisotropy: 8 });
    // スキャンの絵は館の明かりが焼き込まれているので、照らしは控えめに（粗く、少し暗く）
    const m = new THREE.MeshStandardMaterial({ map: col, color: 0xd8d8d8, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.3;'); };
    m.customProgramCacheKey = () => 'yoroi';
    YR.mat[kind] = m;
  }
  const hi = YR.geo[kind], lo = YR.geo[kind + '_lo'] || hi;
  const m = new THREE.Mesh(hi, YR.mat[kind]);
  m.castShadow = true; m.receiveShadow = true;
  // 近く（25m の内）だけ細かい形
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const want = !cam.isOrthographicCamera && (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2 < 625 ? hi : lo;
    if (m.geometry !== want) m.geometry = want;
  };
  const g = new THREE.Group();
  g.add(m); g.scale.setScalar(scale);
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
// 兵の顔の絵は、顔の形（12通り）ごとに一枚だけ作り、肌の色は材質の色で掛ける（肌の色ごとに重い絵を作り直さない＝戦の始めに止まらない）
const headTexs = new Map();
let faceRenderer = null, faceWarmUnits = null;
const faceTextures = new Set(), faceCopies = new Set();
// 転送済みの絵を保持し、描画用のキャンバスの記憶だけ返す。
// 復帰時もこの写しから再転送できるので、空にしたキャンバスには戻らない。
function releaseFaceCanvas(tex) {
  if (typeof createImageBitmap !== 'function') return;
  const c = tex.image;
  let uploaded = false, bitmap = null, disposed = false;
  const release = () => {
    if (!uploaded || !bitmap || disposed) return;
    // iPhone：送った後の写し（ImageBitmap）も GPU process に乗る（1024² 24 枚で +93MB。10/20 iPad）。顔 21 枚で 33MB なので手放し、
    //   image は 1×1 の canvas に（描画器が落ちて戻った時だけ、顔が一色になる）
    if (MEM_TIGHT) { bitmap.close(); bitmap = null; c.width = c.height = 1; tex.image = c; tex.onUpdate = null; return; }
    tex.image = bitmap;
    c.width = c.height = 0;
    tex.onUpdate = null;
  };
  tex.onUpdate = () => { uploaded = true; release(); };
  faceTextures.add(tex);
  tex.addEventListener('dispose', () => {
    disposed = true; faceTextures.delete(tex);
    faceCopies.delete(work);
    bitmap?.close(); c.width = c.height = 0;
  });
  const work = createImageBitmap(c, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    .then(copy => { if (disposed) copy.close(); else { bitmap = copy; release(); } })
    .catch(() => { /* 写せない端末では、再転送できる元の絵を残す */ })
    .finally(() => faceCopies.delete(work));
  faceCopies.add(work);
  if (faceRenderer && !faceRenderer.getContext().isContextLost()) faceRenderer.initTexture(tex);
}
async function finishFaceCopies(current) {
  // 端末で画像の複製が終わらなくても、支度の制限時間と取り消しを守る。
  // 絵は元のキャンバスで描ける。複製が後で終われば通常どおり手放す。
  while (faceCopies.size && current()) await preparationFrame();
}
// ---------------- 本人の写実の手（MakeHuman の左右の手。tools/mhhand.mjs） ----------------
// 見本の体（Soldier.glb）の手は角ばった低い形で、一人称で目の前に来ると肌色の塊に見える。本人だけ MakeHuman の手（指の節・爪・甲の筋）に替える
// 形は MakeHuman の座標で持ち、骨の区間（前腕・手・指の三節）ごとに、その区間の節から見本の体の骨の立ち姿へ移して、体の骨に付けて描く（指の曲げは体の骨のまま）
let MHHAND = null;
function prepHand(gl, tex) {
  const ex = gl.parser.json.extras || {};
  if (!ex.bones || !ex.joints) return;
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const src = {};
  gl.scene.traverse((o) => { if (o.isMesh) src[o.name] = o.geometry; });
  if (!src.Right || !src.Left) return;
  MHHAND = { src, bones: ex.bones, joints: ex.joints, tex, geo: undefined, mats: new Map() };
}
// 区間の向き（x：節から先の節へ、y：手のひらの向き、z：その二つに直角）の行列。戻りは区間の長さ
function mhFrame(a, c, n, ref, out) {
  const X = new THREE.Vector3().subVectors(c, a), len = X.length();
  X.multiplyScalar(1 / len);
  const Y = (Math.abs(n.dot(X)) > 0.95 ? ref : n).clone();
  Y.addScaledVector(X, -Y.dot(X)).normalize();
  out.makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)).setPosition(a);
  return len;
}
// 左右の手を一つの形に（見本の体の立ち姿の座標）。一度だけ作って使い回す
function handGeo() {
  if (MHHAND.geo !== undefined) return MHHAND.geo;
  MHHAND.geo = null;
  const sk = SRC.body.skeleton, BN = SRC.bname, NB = MHHAND.bones.length;
  // 骨の立ち姿の行列（体の形の座標）。指先の骨や重みの無い骨は体の骨の並びに無いので、親の骨の行列に自分の行列を掛けて求める
  const nodes = {};
  SRC.scene.traverse((o) => { nodes[o.name.replace(/^mixamorig:?/, '')] = o; });
  const bindOf = (n) => {
    const i = BN.indexOf(n);
    if (i >= 0) return new THREE.Matrix4().copy(sk.boneInverses[i]).invert();
    const o = nodes[n]; if (!o || !o.parent) return null;
    const pm = bindOf(o.parent.name.replace(/^mixamorig:?/, ''));
    o.updateMatrix();
    return pm ? pm.multiply(o.matrix) : null;
  };
  const inv = (n) => { const i = BN.indexOf(n); if (i >= 0) return sk.boneInverses[i]; const m = bindOf(n); return m ? m.invert() : null; };
  const posOf = (n) => { const m = bindOf(n); return m ? new THREE.Vector3().setFromMatrixPosition(m) : null; };
  const end = (b) => (b === 'ForeArm' ? 'Hand' : b === 'Hand' ? 'HandMiddle1' : b.replace(/\d$/, (d) => String(+d + 1)));
  const iI = MHHAND.bones.indexOf('HandIndex1'), iP = MHHAND.bones.indexOf('HandPinky1');
  const palm = (S) => { const r = new THREE.Vector3().subVectors(S[iI][0], S[iP][0]); const n = new THREE.Vector3().subVectors(S[iI][0], S[1][0]).cross(new THREE.Vector3().subVectors(S[iP][0], S[1][0])).normalize(); return [n, r.clone().normalize(), r.length()]; };
  const out = { P: [], N: [], U: [], J: [], W: [], I: [], K: [] }, names = [], invs = [];
  const v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3(), nn = new THREE.Vector3(), an = new THREE.Vector3();
  for (const [si, side] of [[0, 'Right'], [1, 'Left']]) {
    const g = MHHAND.src[side];
    const segM = MHHAND.joints[side].map((j) => [new THREE.Vector3(j[0], j[1], j[2]), new THREE.Vector3(j[3], j[4], j[5])]);
    const segS = MHHAND.bones.map((b) => [posOf(side + b), posOf(side + end(b))]);
    if (segS.some(([a, c]) => !a || !c)) { HUM.handErr = "骨が無い " + MHHAND.bones.filter((b, i) => !segS[i][0] || !segS[i][1]).join(","); return null; }
    const [nM, rM, wM] = palm(segM), [nS, rS, wS] = palm(segS);
    // 太さ：手のひらは見本の体の手の幅に合わせ、指と前腕は手の長さの比で（見本の体の手は幅が広く、幅で太らせると指が芋虫のように太る）
    const sw = wS / wM, Ms = [], Rs = [];
    let kL = 0, kN = 0; for (let b = 2; b < NB; b++) { kL += segS[b][0].distanceTo(segS[b][1]); kN += segM[b][0].distanceTo(segM[b][1]); }
    const kG = kL / kN;
    MHHAND.unit = kG;
    // 手甲の所（手の甲の真ん中：手首の少し先から指の付け根の手前まで、人差し指から小指の幅の内）。指の曲がる向きの逆が甲
    let curl = 0; for (let b = 5; b < NB; b++) curl += new THREE.Vector3().subVectors(segM[b][1], segM[b][0]).dot(nM);
    const dors = nM.clone().multiplyScalar(curl > 0 ? -1 : 1), hA = segM[1][0], hD = new THREE.Vector3().subVectors(segM[1][1], hA), hL2 = hD.lengthSq();
    const mid = new THREE.Vector3().addVectors(segM[iI][0], segM[iP][0]).multiplyScalar(0.5);
    for (let b = 0; b < NB; b++) {
      const FM = new THREE.Matrix4(), FS = new THREE.Matrix4();
      const lM = mhFrame(segM[b][0], segM[b][1], nM, rM, FM), lS = mhFrame(segS[b][0], segS[b][1], nS, rS, FS);
      Ms.push(FS.clone().multiply(new THREE.Matrix4().makeScale(lS / lM, kG, b === 1 ? sw : kG)).multiply(FM.clone().invert()));
      Rs.push(new THREE.Matrix3().setFromMatrix4(FS).multiply(new THREE.Matrix3().setFromMatrix4(FM).transpose()));
      names.push(side + MHHAND.bones[b]); invs.push(inv(side + MHHAND.bones[b]));
    }
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, JJ = g.attributes._joints, WW = g.attributes._weights;
    const base = out.P.length / 3;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i);
      acc.set(0, 0, 0); an.set(0, 0, 0);
      let ws = 0; const jb = [0, 0], wb = [0, 0];
      for (let k = 0; k < 2; k++) {
        const w = gc(WW, i, k); if (w <= 0) continue;
        const b = gc(JJ, i, k);
        acc.addScaledVector(t.copy(v).applyMatrix4(Ms[b]), w);
        an.addScaledVector(t.copy(nn).applyMatrix3(Rs[b]), w);
        jb[k] = si * NB + b; wb[k] = w; ws += w;
      }
      acc.multiplyScalar(1 / ws); an.normalize();
      out.P.push(acc.x, acc.y, acc.z); out.N.push(an.x, an.y, an.z); out.U.push(U.getX(i), U.getY(i));
      out.J.push(jb[0], jb[1], 0, 0); out.W.push(wb[0] / ws, wb[1] / ws, 0, 0);
      {
        const tt = t.copy(v).sub(hA).dot(hD) / hL2, lat = Math.abs(t.copy(v).sub(mid).dot(rM)) / (wM * 0.5), up = nn.dot(dors);
        const sm = (a, b, x) => { const q = Math.max(0, Math.min(1, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
        out.K.push(sm(0.0, 0.12, tt) * (1 - sm(0.78, 0.9, tt)) * (1 - sm(0.95, 1.2, lat)) * sm(0.05, 0.35, up), si);
      }
    }
    const ix = g.index;
    for (let i = 0; i < ix.count; i++) out.I.push(base + ix.getX(i));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.U, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.J, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.W, 4));
  geo.setAttribute('tk', new THREE.Float32BufferAttribute(out.K, 2));
  geo.setIndex(out.I);
  MHHAND.names = names; MHHAND.inv = invs;
  return (MHHAND.geo = geo);
}
// 手の材質：MakeHuman の肌の写真（明るい肌）を、顔と同じ日焼けの色へ。肌の中へ回る赤い光、戦が進むほどの汚れ、濡れ
// 籠手を着けた手は、手の甲に手甲（漆か鉄の板）を塗り、板の厚みだけ盛り上げる（kote：右 1・左 2）
function handMat(L, kote = 0) {
  const T = L.tier || 0, tkc = T >= 2 || T === 0 ? (L.armor || 0x1c1a1a) : 0x2e3236;
  const key = (L.skin || 0xb58c68) + '|' + kote + '|' + tkc;
  if (MHHAND.mats.has(key)) return MHHAND.mats.get(key);
  const tkOn = new THREE.Vector2(kote & 1 ? 1 : 0, kote & 2 ? 1 : 0), tkCol = new THREE.Color(tkc).multiplyScalar(0.85);
  const sk = new THREE.Color(L.skin || 0xb58c68).getHSL({});
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  const tint = new THREE.Color().setRGB((122 + tn.r * 108) / 255 * 0.8, (122 + tn.g * 112) / 255 * 0.74, (112 + tn.b * 104) / 255 * 0.68, THREE.SRGBColorSpace);
  // 両面：籠手を隠した時に手首の切り口から中が抜けて見えないよう
  const m = new THREE.MeshStandardMaterial({ map: MHHAND.tex, color: tint, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET; sh.uniforms.uTkOn = { value: tkOn }; sh.uniforms.uTkCol = { value: tkCol }; sh.uniforms.uTkH = { value: 0.0035 * (MHHAND.unit || 100) };
    sh.vertexShader = 'attribute vec2 tk;\nuniform vec2 uTkOn;\nuniform float uTkH;\nvarying float vTk;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTk = tk.x * (tk.y < 0.5 ? uTkOn.x : uTkOn.y);\n transformed += objectNormal * uTkH * smoothstep(0.3, 0.6, vTk);');
    sh.fragmentShader = 'uniform float uGrime, uWet;\nuniform vec3 uTkCol;\nvarying float vTk;\nfloat tkK;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.1)) * 1.08 * (1.0 - uGrime * 0.16 - uWet * 0.08);\n tkK = smoothstep(0.3, 0.6, vTk);\n diffuseColor.rgb = mix(diffuseColor.rgb, uTkCol * (0.85 + 0.3 * diffuseColor.g), tkK);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.7 + (1.0 - diffuseColor.g) * 0.12, 0.38, tkK) * (1.0 - 0.4 * uWet);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.10, 0.04, 0.025) * (1.0 - nv) * (1.0 - tkK);
          reflectedLight.directDiffuse *= mix(vec3(1.0, 0.94, 0.9) + vec3(0.12, 0.03, 0.0) * (1.0 - nv), vec3(1.0), tkK); }`);
  };
  m.customProgramCacheKey = () => 'mhhand';
  MHHAND.mats.set(key, m);
  return m;
}
// 見本の体の肘（右・左）と、肘から手首への向き（体の形の座標 ×0.01 ＝ 体の材質の vBind の座標）
let FORE_AX = null;
function foreAxes() {
  if (FORE_AX) return FORE_AX;
  const sk = SRC.body.skeleton, BN = SRC.bname, bi = SRC.body.bindMatrixInverse;
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[BN.indexOf(n)]).invert()).applyMatrix4(bi).multiplyScalar(0.01);
  const e = [], d = [];
  for (const sd of ['Right', 'Left']) { const a = at(sd + 'ForeArm'), b = at(sd + 'Hand'); e.push(a); d.push(b.sub(a).normalize()); }
  return (FORE_AX = { e, d });
}
// 本人の体に写実の手を付ける（体の手は描かない材質にする）
function attachHands(h, L) {
  if (!MHHAND || !h.body || !h.body.parent) { HUM.handErr = MHHAND ? "体が無い" : "手を読めていない"; return false; }
  const geo = handGeo(); if (!geo) return false;
  const bones = MHHAND.names.map((n) => h.bones[n]);
  if (bones.some((b) => !b)) return false;
  // 籠手の有る側（前腕の籠手の部品が有る側）の手の甲に手甲
  const m = new THREE.SkinnedMesh(geo, handMat(L, (h.parts.foreP ? 1 : 0) | (h.parts.foreN ? 2 : 0)));
  m.bind(new THREE.Skeleton(bones, MHHAND.inv), h.body.bindMatrix);
  m.position.copy(h.body.position); m.quaternion.copy(h.body.quaternion); m.scale.copy(h.body.scale);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  h.body.parent.add(m);
  h.hands = m;
  return true;
}

// MakeHuman の頭：作り分け（MH_VARS の順）の形を並べて持つ。座標は実写スキャンの頭と同じ（目 y 1.72・顎 -0.9・頭頂 4）
// 肌の絵は年ごとに三枚（若い・壮年・老い）。凹凸の絵は無い（形そのものが細かい）
const MH_VARS = ['若い・細面', '若い・丸顔', '壮年・角顔', '壮年・面長', '壮年・太り', '老い・痩せ'];
// 見分けるための造形。肖像や実際の容貌を再現した史実の値ではない。
// 年・髭・肌は今ある顔の値を使い、眉と目の傾き、鼻と顎の特徴を補う。
const FACE_STYLE = {
  '織田信長': { browT: 0.8, browSlope: 0.13, eyeTilt: 0.1, nose: 1.22, nw: 0.82, chin: 1.25 },
  '羽柴秀吉': { browT: 0.75, browSlope: -0.09, eyeTilt: 0.04, eye: 1.35, nose: 0.88, nw: 1.2 },
  '徳川家康': { browT: 1.15, browSlope: -0.05, eyeTilt: -0.06, eye: 1.22, gaunt: -0.35 },
  '柴田勝家': { browT: 1.5, browSlope: 0.08, eyeTilt: 0.06, jaw: 1.45, nw: 1.3 },
  '明智光秀': { browT: 0.7, browSlope: 0.02, eyeTilt: -0.04, eye: 1.18, nose: 1.2, nw: 0.85 },
  '浅井長政': { browT: 1, browSlope: -0.02, eyeTilt: 0, eye: 0.9, jaw: 1.08, gaunt: 0.25 },
  '武田信玄': { browT: 1.4, browSlope: -0.08, eyeTilt: -0.08, eye: 1.3, nw: 1.3, gaunt: 0.05 },
  '武田勝頼': { browT: 0.85, browSlope: 0.09, eyeTilt: 0.08, eye: 0.95, nose: 1.18, chin: 1.15 },
};
const faceStyles = new Map();
const SOLDIER_AGES = [23, 40, 25, 47, 36, 59, 29, 43, 22, 54, 38, 45];
function faceStyle(key, F) {
  const name = String(key), m = /^c(\d+)/.exec(name), k = m ? 'c' + (+m[1] % 12) : name;
  if (faceStyles.has(k)) return faceStyles.get(k);
  const i = m ? +m[1] % 12 : 0;
  const f = { ...F, browT: F.browT ?? F.brow ?? 1, ...(m ? { age: SOLDIER_AGES[i], browT: 0.8 + (i % 4) * 0.15, browSlope: (i % 3 - 1) * 0.07, eyeTilt: (i % 5 - 2) * 0.035 } : FACE_STYLE[name.slice(2)] || {}) };
  faceStyles.set(k, f);
  return f;
}
function prepHeadMH(gl, sk) {
  const vars = [];
  // 表情の形（ex_open・ex_pain・ex_anger：MakeHuman の顔の骨の重みと口・眉の形の変えから tools/mhhead.mjs で作った頂点の差）と歯（teeth_作り分け）
  const exG = {}, teeth = [], teethEx = {};
  gl.scene.traverse((o) => {
    if (!o.isMesh) return;
    const i = MH_VARS.indexOf(o.name);
    if (i >= 0) vars[i] = o.geometry;
    else if (/^ex_/.test(o.name)) exG[o.name.slice(3)] = o.geometry.attributes.position;
    else if (/^teeth_ex_/.test(o.name)) teethEx[o.name.slice(9)] = o.geometry.attributes.position;
    else if (/^teeth_\d/.test(o.name)) teeth[+o.name.slice(6)] = o.geometry;
  });
  const uv = vars[0].attributes.uv;
  const EXN = ['open', 'pain', 'anger'];
  const exOK = EXN.every((n) => exG[n] && exG[n].count === vars[0].attributes.position.count);
  for (const g of vars) {
    if (!g.attributes.uv) g.setAttribute('uv', uv); g.computeVertexNormals();
    if (exOK) { g.morphAttributes.position = EXN.map((n) => exG[n]); g.morphTargetsRelative = true; }
  }
  if (exOK && teeth.length && EXN.every((n) => teethEx[n])) for (const g of teeth) if (g) { g.morphAttributes.position = EXN.map((n) => teethEx[n]); g.morphTargetsRelative = true; g.computeVertexNormals(); }
  for (const t of sk) { t.flipY = false; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; }
  const ex = gl.parser.json.extras || {};
  HEAD = { geo: vars[2], vars, col: sk[1], skins: sk, nrm: null, spec: null, k: 0.058, mh: true, eyes: ex.eyes, exMorph: exOK, teeth: exOK && teeth.length === vars.length ? teeth : null };
}
// 顔の値（年・幅・こけ・顎）から MakeHuman の作り分けを選ぶ。兵は顔の型（12通り）で散らす
function mhPick(key, F) {
  const age = F.age ?? (F.t >= 6 ? 58 : F.t >= 3 ? 42 : 28);
  const m = /^c?(\d+)/.exec(String(key));
  if (typeof key === 'number' || m) return [0, 2, 1, 3, 2, 5, 1, 3, 0, 4, 2, 3][(+(m ? m[1] : key)) % 12];
  if (age >= 55) return (F.w || 1) > 1.04 ? 4 : 5;
  if ((F.w || 1) > 1.06) return 4;
  if (age < 32) return (F.gaunt ?? 0.5) > 0.55 || (F.w || 1) < 0.97 ? 0 : 1;
  // 壮年：えらの張った人は角顔、こけた人は面長。どちらでもない人は名前で散らす（同じ顔が並ばないよう）
  if ((F.jaw || 1) >= 1.15) return 2;
  if ((F.gaunt ?? 0.5) > 0.55) return 3;
  let hk = 0; for (const ch of String(key)) hk = (hk * 31 + ch.charCodeAt(0)) % 997;
  return hk % 2 ? 2 : 3;
}
// MakeHuman の顔は鼻の下が短い：髭・唇の絵を描く高さを、実写スキャンの頭の高さへ読み替える（顎・唇・鼻の下・鼻先・目）
const MH_Y = [[-3, -3], [-0.9, -0.9], [0.1, 0.22], [0.5, 0.82], [0.85, 1.1], [1.72, 1.72], [9, 9]];
function mhPaintY(y) {
  for (let i = 1; i < MH_Y.length; i++) if (y <= MH_Y[i][0]) { const [a0, b0] = MH_Y[i - 1], [a1, b1] = MH_Y[i]; return b0 + (b1 - b0) * (y - a0) / (a1 - a0); }
  return y;
}
function mhSkin(key, F) {
  const i = mhPick(key, F), age = F.age ?? (F.t >= 6 ? 58 : F.t >= 3 ? 42 : 28);
  return HEAD.skins[i === 5 || age >= 55 ? 2 : i <= 1 && age < 34 ? 0 : 1];
}
function headMaterial(key, look, F) {
  if (headMats.has(key)) return headMats.get(key);
  // 名のある武将（g:）と本人は細かく描き、髭と眉は一本ずつの毛で描く
  const named = key === 'player' || String(key).startsWith('g:');
  // 日焼け：肌の色を掛ける
  const sk = new THREE.Color(look.skin || 0xb58c68).getHSL({});
  // 写真の肌（明るめの白人の肌）を、日焼けした色へ寄せる：少し暗く、黄みと赤みを足す
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  // MakeHuman の肌の写真は明るい：やや暗く、褐色へ（陣中で日と風に焼けた肌）
  let hk = 0; for (const ch of String(key)) hk = (hk * 31 + ch.charCodeAt(0)) % 997;
  const pk = named ? 0.93 + (hk % 13) / 12 * 0.12 : Math.max(0.82, Math.min(1.12, 0.9 + sk.l * 0.55));   // 兵は今ある肌の色の幅を、写真にも反映する
  // 名将は写真に強い褐色を重ねない。元の肌色に軽い個人差だけを掛ける。
  const tint = named ? [Math.min(255, 244 * pk) | 0, Math.min(255, 239 * pk) | 0, Math.min(255, 232 * pk) | 0] : HEAD.mh ? [Math.min(255, (122 + tn.r * 108) * pk) | 0, Math.min(255, (122 + tn.g * 112) * pk) | 0, Math.min(255, (112 + tn.b * 104) * pk * (0.97 + (hk % 7) / 6 * 0.06)) | 0]
    : [Math.min(255, 140 + tn.r * 110) | 0, Math.min(255, 150 + tn.g * 115) | 0, Math.min(255, 145 + tn.b * 110) | 0];
  const texKey = named ? null : 'c' + ((look.face | 0) % 12) + (look.monk ? '|m' : '');
  if (texKey && headTexs.has(texKey)) { const m = mkHeadMat(headTexs.get(texKey), null, tint); headMats.set(key, m); return m; }
  const _tf0 = performance.now();
  const img = (HEAD.mh ? mhSkin(texKey ? (look.face | 0) % 12 : key, F) : HEAD.col).image, N = named ? 1024 : 512;
  const c = document.createElement('canvas'); c.width = c.height = N;
  // 顔の絵は CPU の絵で描く（GPU の絵は混んだ機械で一枚に何十秒も止まることがあった）
  const CPU = { willReadFrequently: true };
  let g = c.getContext('2d', CPU);
  g.drawImage(img, 0, 0, N, N);
  if (named) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
    g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'source-over';
  }
  // 三角形ごとに、その場所（頭の座標）で髪・髭・目の濃さを決めて、絵の上に塗る
  const geo = HEAD.mh ? HEAD.vars[mhPick(texKey ? (look.face | 0) % 12 : key, F)] : HEAD.geo, pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  const hair = new THREE.Color(F.hair || 0x15110d);
  const hs = `${(hair.r * 255) | 0},${(hair.g * 255) | 0},${(hair.b * 255) | 0}`;
  const t = F.t ?? 1;
  let stub = [0.12, 0.35, 0.45, 0.35, 0.35, 0.3, 0.4, 0.3][t] * (named ? 0.6 : 0.55), mus = [3, 4, 5, 6, 7].includes(t), goat = [4, 6].includes(t), full = [5, 7].includes(t);
  // 僧は髭も剃る（剃り跡だけ）
  if (look.monk) { stub = Math.min(stub, 0.18); mus = goat = full = false; }
  // 名のある武将：髭の形と量は人ごと（F.beard。無ければ模様の番号から）。黒く塗った塊にせず、薄い影と細い毛の房で描く
  // 兵も同じ作り（薄い影と細い毛の房）。塗った塊の髭は近くで描いた顔に見えるので、量は武将より少なく
  const BD = named ? { mus: mus ? 0.7 : 0, musW: 1, musH: 1, droop: 0.4, goat: goat || full ? 0.7 : 0, goatW: 1, side: full ? 0.7 : 0, stub: 1, ...(F.beard || {}) }
    : { mus: mus ? 0.45 : 0, musW: 0.85, musH: 0.75, droop: 0.35, goat: goat || full ? 0.4 : 0, goatW: 0.85, side: full ? 0.35 : 0, stub: 1 };
  if (BD) { stub *= BD.stub; mus = BD.mus > 0.02; goat = BD.goat > 0.02; full = BD.side > 0.02; }
  const age = F.age ?? (t >= 6 ? 58 : t >= 3 ? 42 : 28), old = Math.max(0, Math.min(1, (age - 28) / 32));
  const rnd = (() => { let a = 99 + (named ? String(key).length * 7 + (F.w || 1) * 1000 : 0); return () => ((a = (Math.floor(a) * 16807) % 2147483647) / 2147483647); })();
  // 名のある武将の肌：色むら・日焼け・しわ（tone）と、汗の照り（rough）の絵
  // 兵の顔も tone を使う（写真の赤い唇を、日焼けした肌の色へ寄せる。紅を差したような唇は人形に見える）
  const tone = document.createElement('canvas'), rough = named ? document.createElement('canvas') : null;
  let tg = null, rg = null;
  tone.width = tone.height = N; tg = tone.getContext('2d', CPU);
  if (named) {
    rough.width = rough.height = 256; rg = rough.getContext('2d', CPU); rg.fillStyle = 'rgb(140,140,140)'; rg.fillRect(0, 0, 256, 256);
  }
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  // 髭や髪は別の絵に塗ってから、ぼかして重ねる（三角の角が見えないように）
  const face = g;
  const strands = [];
  const ov = document.createElement('canvas'); ov.width = ov.height = N;
  g = ov.getContext('2d', CPU);
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), cc = idx.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(cc)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(cc)) / 3;
    let y = (pos.getY(a) + pos.getY(b) + pos.getY(cc)) / 3;
    if (HEAD.mh) y = mhPaintY(y);
    let al = 0, colr = hs;
    const th = Math.atan2(x, z);
    // 月代（額の上から頭頂は剃ってある：青く）
    // 剃り跡は青みがかった灰（陣中で伸びかけた毛の点々。肌色のままの坊主頭に見せない）
    if (y > 2.75 && Math.abs(th) < 1.9) { al = named ? 0.4 : 0.55; colr = '44,48,56'; }
    // 横と後ろの髪（耳の上から後ろ）
    if ((Math.abs(th) > 1.75 && y > 0.6) || (Math.abs(th) > 1.35 && y > 1.5 && y < 3.2)) al = 0.92;
    // 僧は頭を剃る（剃り跡の青さだけ）
    if (look.monk && y > 0.6 && (Math.abs(th) > 1.35 || y > 2.75)) al = 0.2;
    // 髭の生える所：頬の下・顎・口の周り
    const face = z > 0.6 && y < 1.05 && y > -1.3 && Math.abs(x) < 2.6;
    // 無精髭：兵は三角ごとの濃さのむらを付けない（斑が泥の塗りに見える）。色は青みがかった灰（剃り跡の青さ）
    if (face && !(y > 0.25 && y < 0.72 && Math.abs(x) < 0.55 && z > 1.8)) { const sa = stub * (named ? 0.6 + rnd() * 0.4 : 0.5) * (HEAD.mh ? 0.6 * Math.min(1, Math.max(0, (1.05 - y) / 0.45)) : 1); if (sa > al) { al = sa; if (!named) colr = '48,46,52'; } }
    let inMus = mus && y > 0.72 && y < 1.02 && Math.abs(x) < 0.85 && z > 1.7;
    let inGoat = goat && y < 0.1 && Math.abs(x) < 0.7 && z > 1.2;
    let inSide = full && face && (y < 0.3 || Math.abs(x) > 0.8);
    if (BD) {
      // 口髭：幅（musW）・厚み（musH）・端の垂れ（droop）。鼻の下の真ん中は薄く
      const x0 = Math.abs(x + 0.09), dx = x0 / (0.8 * BD.musW);
      const yc = 0.8 - BD.droop * 0.26 * dx * dx, hh = 0.12 * BD.musH * (1 - 0.45 * dx * dx);
      inMus = mus && dx < 1 && Math.abs(y - yc) < hh && z > 1.6;
      inGoat = goat && y < 0.12 && x0 < 0.62 * BD.goatW * (0.6 + 0.4 * Math.min(1, (0.12 - y) / 0.6)) && z > 1.1;
      // 頬の髭の上の縁：耳の下から口の端へ下がる線（頬の高い所まで塗った箱の髭にしない）。縁は三角ごとに少し揺らす
      const sideTop = 0.42 + 0.38 * Math.min(1, Math.max(0, (x0 - 0.8) / 0.9)) + (rnd() - 0.5) * 0.16;
      inSide = full && face && ((x0 > 0.8 && y < sideTop) || y < 0.3) && !(y > 0.25 && y < 0.72 && x0 < 0.6 && z > 1.8);
      const dens = inMus ? BD.mus : inGoat ? BD.goat : inSide ? BD.side : 0;
      if (dens > 0) al = Math.max(al, 0.1 + 0.22 * dens);   // 毛の下の肌の薄い影
    } else {
      if (inMus || inGoat || inSide) colr = hs;
      // 兵の髭は塗りつぶさない（黒い塊は描いた髭に見える）：地の肌が少し透ける濃さに
      if (inMus) al = Math.max(al, 0.52);
      if (inGoat) al = Math.max(al, 0.52);
      if (inSide) al = Math.max(al, 0.42);
    }
    if (!named && z > 0.8) {
      // 兵の顔：唇を肌の色へ寄せ、鼻と頬に日焼けの赤み、額に日焼け（名のある武将より簡単に）
      const x0 = Math.abs(x + 0.09), fr = Math.min(1, (z - 0.8) / 0.9);
      const lip = Gs(x0 / 0.65, (y - 0.22) / 0.36, 1, 1) * (z > 1.6 ? 1 : 0);
      const red = 0.06 * Gs(x0, y - 1.15, 0.28, 0.35) + 0.045 * Gs(x0 - 1.1, y - 1.05, 0.35, 0.35);
      const sun = 0.14 * Gs(x0, y - 2.35, 0.9, 0.45) + 0.08 * Gs(x0 - 1.2, y - 1.35, 0.3, 0.25);
      const tri = (r, g_, b_, al_) => { if (al_ < 0.005) return; tg.fillStyle = `rgba(${r},${g_},${b_},${Math.min(0.85, al_ * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a) * N, uv.getY(a) * N); tg.lineTo(uv.getX(b) * N, uv.getY(b) * N); tg.lineTo(uv.getX(cc) * N, uv.getY(cc) * N); tg.closePath(); tg.fill(); };
      tri(150, 60, 45, red * 0.6); tri(95, 55, 30, sun * 0.6); tri(122, 86, 66, Math.min(1, 1.1 * lip));
      // 戦場の汚れ：頬・額・顎の土と汗の筋（型ごとに場所が違う）。目の下と小鼻の脇の陰（彫りを深く見せる）
      const sd = ((look.face | 0) % 12) * 1.7 + 0.3;
      const mud = 0.16 * Gs(x0 - 0.9 - 0.3 * Math.sin(sd), y - 0.9 - 0.8 * Math.cos(sd * 1.3), 0.35, 0.28) + 0.1 * Gs(x + 0.6 * Math.sin(sd * 2.1), y - 2.3, 0.4, 0.18) + 0.08 * Gs(x0, y + 0.55, 0.5, 0.25);
      const hol = 0.12 * Gs(x0 - 0.62, y - 1.5, 0.3, 0.1) + 0.1 * Gs(x0 - 0.33, y - 0.95, 0.1, 0.18);
      tri(72, 56, 40, mud); tri(60, 36, 28, hol);
      // 年のしわ（型ごとに年が違う）：額の横じわ・目尻・ほうれい線
      const ft = (look.face | 0) % 12, oldC = old;
      if (oldC > 0.05) {
        let wr = 0;
        if (y > 2.15 && y < 2.85 && x0 < 1.25) wr += 0.14 * oldC * Math.pow(Math.abs(Math.cos((y - 2.15) * Math.PI * 2.4)), 14) * (1 - x0 / 1.3);
        { const aa = Math.atan2(y - 1.72, x0 - 0.98), d = Math.hypot(y - 1.72, x0 - 0.98); if (x0 > 1.0 && d < 0.42) wr += 0.2 * oldC * Math.pow(Math.abs(Math.cos(aa * 5)), 10) * (1 - d / 0.42); }
        { const vx = 0.4, vy = -0.8, q = Math.max(0, Math.min(1, ((x0 - 0.42) * vx + (y - 1.12) * vy) / 0.8)); const d = Math.hypot(x0 - 0.42 - vx * q, y - 1.12 - vy * q); wr += 0.22 * oldC * Math.exp(-(d * d) / 0.004); }
        tri(55, 32, 24, wr);
      }
      // 古傷：型ごとに、頬・眉・鼻筋を斜めに走る刀傷（白っぽく盛り上がり、縁は赤黒い）
      const SC = [null, null, [0.5, 1.9, 1.3, 0.8], null, null, [-0.2, 2.4, 0.5, 1.6], null, [1.2, 1.5, 0.7, 0.3], null, null, [-1.1, 1.3, -0.4, 0.6], null][ft];
      if (SC) {
        const [ax, ay, bx, by] = SC, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        const q = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)), d = Math.hypot(x - ax - vx * q, y - ay - vy * q);
        const taper = Math.sin(q * Math.PI);
        tri(110, 50, 45, 0.45 * Math.exp(-(d * d) / 0.012) * taper);
        tri(205, 170, 150, 0.6 * Math.exp(-(d * d) / 0.0025) * taper);
      }
    }
    if (named) {
      // 肌の色むら：鼻・頬の赤み、額・鼻筋・頬骨の日焼け、目の下の影。年ごとのしわ（額の横じわ・目尻・ほうれい線）
      const x0 = Math.abs(x + 0.09), fr = z > 0.8 ? Math.min(1, (z - 0.8) / 0.9) : 0;
      if (fr > 0) {
        const red = 0.06 * Gs(x0, y - 1.15, 0.28, 0.35) + 0.045 * Gs(x0 - 1.1, y - 1.05, 0.35, 0.35) + 0.03 * rnd();
        const sun = 0.12 * Gs(x0, y - 2.35, 0.9, 0.45) + 0.1 * Gs(x0, y - 1.5, 0.22, 0.5) + 0.07 * Gs(x0 - 1.2, y - 1.35, 0.3, 0.25);
        const bag = (0.08 + 0.14 * old) * Gs(x0 - 0.62, y - 1.46, 0.28, 0.09);
        let wr = 0;
        if (y > 2.15 && y < 2.85 && x0 < 1.25) wr += (0.05 + 0.26 * old) * Math.pow(Math.abs(Math.cos((y - 2.15) * Math.PI * 2.4)), 14) * (1 - x0 / 1.3);
        { const a = Math.atan2(y - 1.72, x0 - 0.98), d = Math.hypot(y - 1.72, x0 - 0.98); if (x0 > 1.0 && d < 0.46) wr += (0.06 + 0.36 * old) * Math.pow(Math.abs(Math.cos(a * 5)), 10) * (1 - d / 0.42); }
        { const ax = 0.42, ay = 1.12, bx = 0.82, by = 0.32; const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy; const q = Math.max(0, Math.min(1, ((x0 - ax) * vx + (y - ay) * vy) / L2)); const d = Math.hypot(x0 - ax - vx * q, y - ay - vy * q); wr += (0.12 + 0.3 * old) * Math.exp(-(d * d) / (2 * 0.045 * 0.045)); }
        // 目の下の皺（年）と、眉間の縦皺（しかめ癖）
        wr += 0.2 * old * Math.pow(Math.abs(Math.cos((y - 1.42) * 26)), 8) * Gs(x0 - 0.62, y - 1.42, 0.3, 0.08);
        wr += (0.05 + 0.15 * old) * Gs(x0 - 0.14, y - 1.98, 0.035, 0.12);
        const pc = (r, g_, b, a) => { if (a < 0.005) return; tg.fillStyle = `rgba(${r},${g_},${b},${Math.min(0.6, a * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a_) * N, uv.getY(a_) * N); tg.lineTo(uv.getX(b_) * N, uv.getY(b_) * N); tg.lineTo(uv.getX(c_) * N, uv.getY(c_) * N); tg.closePath(); tg.fill(); };
        const a_ = a, b_ = b, c_ = cc;
        // 唇：写真の赤い唇を、日焼けした肌に近い色へ寄せる
        const lip = Gs(x0 / 0.65, (y - 0.22) / 0.36, 1, 1) * (z > 1.6 ? 1 : 0);
        pc(140, 78, 62, red); pc(100, 70, 48, sun); pc(70, 40, 35, bag); pc(55, 32, 24, wr);
        // 唇はほぼ肌の色に（紅を差した線に見せない。口の形は顔の形の陰で見える）
        if (lip > 0.01) { tg.fillStyle = `rgba(124,86,66,${Math.min(0.92, lip * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a_) * N, uv.getY(a_) * N); tg.lineTo(uv.getX(b_) * N, uv.getY(b_) * N); tg.lineTo(uv.getX(c_) * N, uv.getY(c_) * N); tg.closePath(); tg.fill(); }
        // 汗の照り：額・鼻筋・頬骨は滑らか、髭の所は荒い
        const sh = Gs(x0, y - 2.3, 0.8, 0.35) + Gs(x0, y - 1.35, 0.2, 0.4) + 0.6 * Gs(x0 - 1.15, y - 1.35, 0.25, 0.2);
        const rv = Math.round(Math.max(60, Math.min(220, 140 - 80 * Math.min(1, sh) + (inMus || inGoat || inSide ? 60 : 0))));
        rg.fillStyle = `rgb(${rv},${rv},${rv})`; rg.beginPath(); rg.moveTo(uv.getX(a) * 256, uv.getY(a) * 256); rg.lineTo(uv.getX(b) * 256, uv.getY(b) * 256); rg.lineTo(uv.getX(cc) * 256, uv.getY(cc) * 256); rg.closePath(); rg.fill();
      }
    }
    // 眉を濃く
    let brow = false;
    // 眉：兵は細く薄く（太い墨の眉は描いた顔に見える）
    for (const sd of [-1, 1]) { const dx = (x - sd * 0.7) / 0.6, dy = (y - 2.02 + Math.abs(x) * 0.05 - (Math.abs(x) - 0.7) * (F.browSlope || 0)) / ((named ? 0.085 : 0.075) * (F.browT ?? 1)); if (z > 1.5 && dx * dx + dy * dy < 1) { al = Math.max(al, named ? 0.7 : 0.55); brow = true; } }
    if (al <= 0.01) continue;
    // 毛の向き（頭の座標）：口髭は下と外へ、顎髭は下へ、頬の髭は下と前へ、眉は外へ
    if (BD) {
      const isMus = inMus;
      const isBeard = inGoat || inSide;
      if (isMus || isBeard || brow) {
        const sx = Math.sign(x + 0.09) || 1;
        const D = brow ? [sx, 0.12, 0] : isMus ? [sx * 0.8, -0.55 - 0.4 * BD.droop, 0.1] : [sx * (inSide && !inGoat ? 0.3 : 0.12), -1, 0.25];
        // 毛の房：長さと濃さは髭の量で（薄い髭は短く疎ら）
        const dens = brow ? 1 : isMus ? BD.mus : inGoat ? BD.goat : BD.side;
        // 兵の眉は細く疎らに（太く濃い眉は墨で描いた顔に見える）
        strands.push([a, b, cc, D, brow ? (named ? 0.28 : 0.22) : (isMus ? 0.3 : 0.42) * (0.6 + 0.5 * dens), brow ? (named ? 0.62 : 0.5) : 0.35 + 0.4 * dens, brow ? (named ? 1 : 0.45) : dens]);
        al *= brow ? 0.35 : 1;
      }
    }
    g.fillStyle = `rgba(${colr},${al})`;
    g.beginPath();
    g.moveTo(uv.getX(a) * N, uv.getY(a) * N); g.lineTo(uv.getX(b) * N, uv.getY(b) * N); g.lineTo(uv.getX(cc) * N, uv.getY(cc) * N);
    g.closePath(); g.fill();
  }
  face.filter = `blur(${named ? N / 400 : N / 220}px)`;   // 兵の髭・髪の縁は柔らかく（塗った縁に見せない）
  face.drawImage(ov, 0, 0);
  // 肌の色むら・日焼け・しわ（ぼかして重ねる）
  if (tg) { face.filter = `blur(${N / 300}px)`; face.drawImage(tone, 0, 0); }
  face.filter = 'none';
  // 無精髭の粒
  // 兵は塗りを粒に抜いて重ねる（剃り跡・生えかけの毛の点々。一様な灰の塗りに見せない）
  if (named) { face.globalAlpha = 0.15; face.drawImage(ov, 0, 0); face.globalAlpha = 1; }
  else { const gc_ = grainOf(ov, N); face.globalAlpha = 0.4; face.drawImage(gc_, 0, 0); face.globalAlpha = 1; gc_.width = gc_.height = 0; }
  tone.width = tone.height = ov.width = ov.height = 0;
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
        face.lineWidth = (0.45 + rnd() * 0.55) * (named ? 1 : 0.75);
        face.beginPath(); face.moveTo(px, py);
        face.quadraticCurveTo(px + du * j * 0.5 - dv * bend * 0.3, py + dv * j * 0.5 + du * bend * 0.3, px + du * j, py + dv * j);
        face.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  astcRetry(tex, false);   // iPhone：顔の材質は alpha を使わないので、透ける画素があっても ASTC で（astc_rt）
  let rTex = null;
  if (rough) { rg.filter = 'blur(3px)'; rg.drawImage(rough, 0, 0); rTex = new THREE.CanvasTexture(rough); rTex.flipY = false; }
  releaseFaceCanvas(tex);
  if (rTex) releaseFaceCanvas(rTex);
  if (texKey) headTexs.set(texKey, tex);
  HSTAT.tFace = (HSTAT.tFace || 0) + (performance.now() - _tf0); HSTAT.nFace = (HSTAT.nFace || 0) + 1; HSTAT.maxFace = Math.max(HSTAT.maxFace || 0, performance.now() - _tf0);
  const m = mkHeadMat(tex, rTex, named ? null : tint);
  headMats.set(key, m);
  return m;
}
// 塗りを細かな粒に抜いた写し（兵の無精髭）。粒の型は大きさごとに一枚
const grainMasks = new Map();
function grainOf(src, N) {
  if (!grainMasks.has(N)) {
    const m = document.createElement('canvas'); m.width = m.height = N;
    const mg = m.getContext('2d'), im = mg.createImageData(N, N);
    let a = 12345; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * N; i++) { const v = r(); im.data[i * 4 + 3] = v < 0.42 ? 150 + v * 250 : 0; }
    mg.putImageData(im, 0, 0);
    grainMasks.set(N, m);
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(grainMasks.get(N), 0, 0);
  return c;
}
// MakeHuman の肌には凹凸の絵が無いので、細かな毛穴と肌理の凹凸をキャンバスで作って繰り返し貼る（一枚だけ）
let MH_PORES = null;
function mhPores() {
  if (MH_PORES) return MH_PORES;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), im = g.createImageData(N, N), H = new Float32Array(N * N);
  let a = 777; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 900; k++) { const x = r() * N | 0, y = r() * N | 0, d = 0.5 + r(); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const q = Math.exp(-(i * i + j * j) / (1.2 * d)); H[((y + j + N) % N) * N + ((x + i + N) % N)] -= q * (0.6 + r() * 0.4); } }
  for (let i = 0; i < N * N; i++) H[i] += (r() - 0.5) * 0.25;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], dy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    const l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    im.data[o] = 128 - (dx / l) * 127; im.data[o + 1] = 128 - (dy / l) * 127; im.data[o + 2] = 128 + (1 / l) * 127; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  MH_PORES = new THREE.CanvasTexture(c); MH_PORES.wrapS = MH_PORES.wrapT = THREE.RepeatWrapping; MH_PORES.repeat.set(10, 10); MH_PORES.flipY = false;
  return MH_PORES;
}
function mkHeadMat(tex, rTex, tint) {
  const m = new THREE.MeshPhysicalMaterial({
    map: tex, normalMap: HEAD.mh ? mhPores() : HEAD.nrm, normalScale: HEAD.mh ? new THREE.Vector2(0.5, 0.5) : new THREE.Vector2(0.8, 0.8), roughness: rTex ? 0.95 : 0.78, roughnessMap: rTex, metalness: 0,
    specularIntensityMap: HEAD.spec, specularIntensity: 0.3, sheen: HEAD.mh ? 0.08 : 0.14, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x5a3e30),
  });
  if (tint) m.color.setRGB(tint[0] / 255, tint[1] / 255, tint[2] / 255, THREE.SRGBColorSpace);
  // 表面下散乱の近似：光の当たらない側にも、赤みのある光が少し回り込む
  // 笠・兜の陰（uHatAO）：縁の下になる額と目元は暗く、顔の下ほど明るい（影の絵の細かさでは笠の影が顔に落ち切らないので）
  m.onBeforeCompile = headCompile;
  m.customProgramCacheKey = () => 'scanhead';
  return m;
}
// mhPaintY の GLSL（MakeHuman の頭の高さ → 実写スキャンの頭の高さ）。スキャンの頭の時はそのまま
const MHY_GLSL = () => HEAD && HEAD.mh ? `float mhy(float y) {
  if (y <= -0.9) return y;
  if (y <= 0.1) return -0.9 + (y + 0.9) * 1.12;
  if (y <= 0.5) return 0.22 + (y - 0.1) * 1.5;
  if (y <= 0.85) return 0.82 + (y - 0.5) * 0.8;
  if (y <= 1.72) return 1.1 + (y - 0.85) * 0.7126;
  return y;
}
` : 'float mhy(float y) { return y; }\n';
function headCompile(sh) {
  sh.uniforms.uHatAO = (this.userData && this.userData.ao) || { value: 0 };
  sh.uniforms.uFaceV = (this.userData && this.userData.fv) || { value: new THREE.Vector4(0, 0, 0, 0) };
  // 表情（x 口を開く・y 苦しむ（顔をしかめる）・z 怒る（眉を寄せて下げる））。頭の座標（1 が 4cm ほど）で形を動かす
  sh.uniforms.uExpr = (this.userData && this.userData.ex) || { value: new THREE.Vector4(0, 0, 0, 0) };
  peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
  // MakeHuman の頭は表情を形の差（morph）で動かす：ここでの頂点の押し引きはしない
  const exM = !!(HEAD && HEAD.exMorph);
  sh.vertexShader = 'uniform vec4 uExpr;\nvarying vec3 vHP;\n' + MHY_GLSL() + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 // MakeHuman の頭は鼻の下が短い：陰や汚れ・表情の場所は、実写スキャンの頭の高さへ読み替えて決める（絵の mhPaintY と同じ）
 vec3 hp0 = position; hp0.y = mhy(position.y);
 vHP = hp0;
 if (${exM ? 'false' : 'true'} && uExpr.x + uExpr.y + uExpr.z > 0.001) {
   float ex0 = abs(hp0.x + 0.09), front = smoothstep(0.4, 1.4, hp0.z);
   // 顎が下がる：口より下ほど大きく、顔の横へ行くほど小さく
   float jaw = smoothstep(0.3, 0.05, hp0.y) * smoothstep(-1.6, -0.4, hp0.y + 0.0) * smoothstep(2.4, 0.9, ex0) * front;
   jaw = max(jaw, smoothstep(0.3, -0.6, hp0.y) * smoothstep(2.4, 1.0, ex0) * front);
   transformed.y -= (uExpr.x * 0.34 + uExpr.y * 0.12) * jaw;
   transformed.z -= (uExpr.x * 0.08) * jaw;
   // しかめる：口の端が横へ引かれ、頬が上がり、目が細まる
   float corner = exp(-pow(ex0 - 0.6, 2.0) / 0.05 - pow(hp0.y - 0.25, 2.0) / 0.04) * front;
   transformed.x += sign(hp0.x + 0.09) * (uExpr.y * 0.1 + uExpr.x * 0.05) * corner;
   float cheek = exp(-pow(ex0 - 0.95, 2.0) / 0.12 - pow(hp0.y - 1.25, 2.0) / 0.08) * front;
   transformed.y += (uExpr.y * 0.1 + uExpr.z * 0.04) * cheek;
   // 眉：怒りは眉頭が下がって寄り、苦しみは眉頭が上がって寄る
   float brow = exp(-pow(ex0 - 0.55, 2.0) / 0.12 - pow(hp0.y - 2.02, 2.0) / 0.03) * front;
   float inner = smoothstep(1.0, 0.2, ex0);
   transformed.y += brow * (uExpr.y * 0.08 * inner - uExpr.z * 0.1 * (0.4 + inner));
   transformed.x -= sign(hp0.x + 0.09) * brow * (uExpr.z + uExpr.y) * 0.05;
 }`);
  sh.fragmentShader = `uniform float uHatAO;\nuniform vec4 uFaceV, uExpr;\nuniform sampler2D uPD;\nvarying vec3 vHP;\nfloat skinD;
float fh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fn3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh3(i), fh3(i + vec3(1,0,0)), f.x), mix(fh3(i + vec3(0,1,0)), fh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fh3(i + vec3(0,0,1)), fh3(i + vec3(1,0,1)), f.x), mix(fh3(i + vec3(0,1,1)), fh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float faceWet;
` + PEOPLE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      // 肌の写真の細かなむら（毛穴・しみ・肌理）：色を僅かに揺らし、下で凹凸にも使う
      skinD = texture2D(uPD, vMapUv * 11.0).r - 0.5 + (texture2D(uPD, vMapUv * 3.7 + 0.31).r - 0.5) * 0.6;
      diffuseColor.rgb *= 1.0 + skinD * 0.28;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.94, 0.9), clamp(-skinD * 1.2, 0.0, 0.35));
    }
    {
      // 兵ごとの顔の汚れ（uFaceV）：土と埃の斑・汗の流れた筋・日焼けの赤み。場所は w でずらす
      float x0 = abs(vHP.x + 0.09), fr = smoothstep(0.6, 1.5, vHP.z);
      vec3 q = vHP + vec3(uFaceV.w * 3.1, uFaceV.w * 1.7, 0.0);
      float blot = smoothstep(0.5, 0.85, fn3(q * 0.9) * 0.65 + fn3(q * 2.7) * 0.35);
      float dust = (0.35 + 0.65 * fn3(q * 6.0)) * (smoothstep(-0.6, 0.6, -vHP.y + 1.2) * 0.6 + 0.4);
      float mud = clamp(blot * uFaceV.x * 0.8 + dust * uFaceV.x * 0.22, 0.0, 1.0) * fr;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.44, 0.36), mud);
      // 汗の筋：こめかみと額から頬へ流れた跡（埃が流されて少し明るく、濡れて照る）
      float st = smoothstep(0.72, 0.95, fn3(vec3(vHP.x * 5.0 + uFaceV.w, vHP.y * 0.7, 0.0))) * smoothstep(2.6, 1.2, vHP.y) * smoothstep(-0.5, 0.6, vHP.y);
      faceWet = uFaceV.y * (st * 0.8 + 0.45 * exp(-x0 * x0 / 0.9 - pow(vHP.y - 2.3, 2.0) / 0.25)) * fr;
      diffuseColor.rgb *= 1.0 + st * uFaceV.y * uFaceV.x * 0.18 * fr;
      // 日焼けの赤み：鼻・頬・耳
      float fl = exp(-x0 * x0 / 0.12 - pow(vHP.y - 1.2, 2.0) / 0.25) + 0.8 * exp(-pow(x0 - 1.15, 2.0) / 0.15 - pow(vHP.y - 1.1, 2.0) / 0.2) + 0.6 * smoothstep(3.3, 3.9, abs(vHP.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.86, 0.78), clamp(fl, 0.0, 1.0) * uFaceV.z * 0.7);
      // 兜・笠の縁のすぐ下の額：縁の影に沈む（照らし方だけでは明るい帯が残るので、色そのものを落とす）
      diffuseColor.rgb *= 1.0 - smoothstep(0.35, 0.55, uHatAO) * 0.5 * smoothstep(2.06, 2.24, vHP.y);
      // 肌：塗った橙のように鮮やかにしない（日と風に焼けて、少しくすむ）
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))) * vec3(1.1, 0.96, 0.84), 0.26);
      // 肌の細かなむら（そばかす・しみ・毛細血管の赤み）：一様な塗りの肌は人形に見える
      diffuseColor.rgb *= 0.93 + 0.1 * fn3(vHP * 7.0) - 0.05 * smoothstep(0.62, 0.9, fn3(vHP * 23.0 + 3.1));
      // 剃り跡：顎・頬の下・口のまわりが青黒く沈む（唇は除く）。一様な灰にせず、毛穴の点々で
      {
        float lip = exp(-x0 * x0 / 0.22 - pow(vHP.y - 0.22, 2.0) / 0.03);
        float jawR = smoothstep(1.0, 0.55, vHP.y) * smoothstep(-1.3, -0.6, vHP.y) * smoothstep(1.55, 0.9, x0) * (1.0 - lip);
        float stb = jawR * smoothstep(0.3, 0.7, fn3(vHP * 46.0)) * fr;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.62, 0.68), stb * 0.3);
      }
      // 月代：剃った頭頂は、伸びかけの毛の点々で青黒く沈む（肌色のままの坊主頭にしない）
      float th = abs(atan(vHP.x, vHP.z));
      float sk = smoothstep(2.55, 2.95, vHP.y) * smoothstep(2.05, 1.7, th);
      float dots = smoothstep(0.35, 0.75, fn3(vHP * 38.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.52, 0.58), sk * (0.45 + 0.35 * dots));
      // 開いた口の中：唇の間が暗く、歯が少し覗く
      float mo = uExpr.x + uExpr.y * 0.35;
      if (mo > 0.01) {
        float mouth = exp(-x0 * x0 / (0.16 + uExpr.y * 0.1) - pow(vHP.y - 0.2, 2.0) / (0.004 + 0.012 * mo)) * smoothstep(1.4, 1.8, vHP.z);
        float teeth = exp(-x0 * x0 / 0.08 - pow(vHP.y - 0.26, 2.0) / 0.0015) * smoothstep(1.4, 1.8, vHP.z) * mo;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.03, 0.025), clamp(mouth * mo * ${exM ? '0.7' : '1.6'}, 0.0, 0.92));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.56, 0.46), clamp(teeth * ${exM ? '0.0' : '0.6'}, 0.0, 0.6));
      }
    }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    {
      // 肌理の凹凸（遠くでは均して、ちらつかせない）
      float fwS = fwidth(vMapUv.x * 11.0) * 512.0;
      normal = pdBump(-vViewPosition, normal, skinD * 0.0015 * (1.0 - smoothstep(0.7, 2.0, fwS)), faceDirection);
    }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    {
      // 汗と脂の照り：額の真ん中・鼻筋・頬骨は滑らか（顔の形が光で立つ）
      float x0 = abs(vHP.x + 0.09), fr = smoothstep(0.9, 1.7, vHP.z);
      float tz = exp(-x0 * x0 / 0.5 - pow(vHP.y - 2.35, 2.0) / 0.12) + exp(-x0 * x0 / 0.05 - pow(vHP.y - 1.45, 2.0) / 0.2) + 0.7 * exp(-pow(x0 - 1.1, 2.0) / 0.06 - pow(vHP.y - 1.4, 2.0) / 0.05);
      roughnessFactor *= 1.0 - 0.38 * clamp(tz, 0.0, 1.0) * fr;
      roughnessFactor *= 1.0 - 0.45 * clamp(faceWet, 0.0, 1.0);
      // 毛穴と肌理：照りを細かく斑にし、ろうのような一様な照りにしない
      // 汗のある鼻・額だけは照りを残す。頬の乾いた肌理と同じ粗さに潰さない。
      roughnessFactor = clamp(roughnessFactor + (fn3(vHP * 55.0) - 0.5) * 0.16 + (fn3(vHP * 9.0) - 0.5) * 0.08, mix(0.62, 0.46, clamp(faceWet + tz * fr * 0.35, 0.0, 1.0)), 0.94);
    }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    {
      // 空の見え方：上を向いた面（額・頬骨・鼻筋の上）は空の光を受け、下を向いた面（顎の下・鼻の下・眉の下・頬の下）は沈む
      // 曇りの日や日陰で、顔が正面から一様に照らされた平たいお面に見えないよう（光の向きで陰影が出る）
      vec3 nW = inverseTransformDirection(normal, viewMatrix);
      float sky = 0.32 + 0.68 * smoothstep(-0.75, 0.65, nW.y);
      reflectedLight.indirectDiffuse *= sky;
      // 曇りでも空は日のある側が明るい：日の側の頬骨と鼻筋は明るく、反対の頬と鼻の脇は沈む（正面から一様に照らしたお面にしない）
      #if NUM_DIR_LIGHTS > 0
      reflectedLight.indirectDiffuse *= 0.68 + 0.64 * clamp(dot(normal, directionalLights[0].direction) * 0.5 + 0.5, 0.0, 1.0);
      #endif
      reflectedLight.indirectSpecular *= 0.35 + 0.65 * smoothstep(-0.3, 0.7, nW.y);
    }
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.07, 0.035, 0.025) * (1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0));
    // 肌の縁：光が薄い肌を透けて、輪郭がほのかに赤く明るむ（切り抜いた絵のような縁にしない）
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.5, 0.3, 0.22) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * 0.16;
    {
      // 眉庇・笠の縁のすぐ下（額）は、縁の影がくっきり落ちる（額だけ明るい帯にしない）
      // 縁の陰は上ほど深い：額は沈み、目元は陰の中、鼻から下へ少しずつ明るむ（顔の上半分が縁の陰に入る）
      // 笠の影を二重に黒くせず、頬と口の形へ地面からの光を残す。
      float occ = max(0.22, 1.0 - uHatAO * (0.22 + 0.56 * smoothstep(0.5, 2.0, vHP.y) + 0.35 * smoothstep(2.0, 2.2, vHP.y)));
      // 眼窩の陰（目のまわりは彫りが深く、空の光が回り込みにくい）
      float eo = exp(-(pow(vHP.x + 0.69, 2.0) + pow(vHP.y - 1.74, 2.0) * 2.2) / 0.09) + exp(-(pow(vHP.x - 0.51, 2.0) + pow(vHP.y - 1.74, 2.0) * 2.2) / 0.09);
      reflectedLight.indirectDiffuse *= 1.0 - 0.62 * clamp(eo, 0.0, 1.0);
      reflectedLight.indirectSpecular *= 1.0 - 0.6 * clamp(eo, 0.0, 1.0);
      // 顔の窪みの陰：眉の下の張り出し・鼻の脇から口の端への溝（法令線）・鼻の下・下唇の下・顎の下。顔が箱のように平らに見えないよう
      {
        float x1 = abs(vHP.x + 0.09), frt = smoothstep(0.7, 1.5, vHP.z);
        float bw = exp(-pow(vHP.y - 1.9, 2.0) / 0.012) * smoothstep(1.35, 0.3, x1);
        vec2 na = vec2(0.42, 1.05), nb = vec2(0.72, 0.22), pq = vec2(x1, vHP.y) - na, ab = nb - na;
        float nl = exp(-pow(length(pq - ab * clamp(dot(pq, ab) / dot(ab, ab), 0.0, 1.0)), 2.0) / 0.012);
        float un = exp(-x1 * x1 / 0.12 - pow(vHP.y - 0.78, 2.0) / 0.008);
        float ul = exp(-x1 * x1 / 0.25 - pow(vHP.y + 0.08, 2.0) / 0.01);
        float cav = clamp((bw * 0.8 + nl * 0.7 + un * 0.6 + ul * 0.5) * frt + smoothstep(-0.7, -1.4, vHP.y) * 0.6, 0.0, 1.0);
        reflectedLight.indirectDiffuse *= 1.0 - 0.6 * cav;
        reflectedLight.directDiffuse *= 1.0 - 0.4 * cav;
        reflectedLight.indirectSpecular *= 1.0 - 0.5 * cav;
      }
      reflectedLight.directDiffuse *= occ; reflectedLight.directSpecular *= occ;
      reflectedLight.indirectDiffuse *= mix(1.0, occ, 0.6); reflectedLight.indirectSpecular *= occ;
      // 陣笠・兜の下の底上げ：影に沈んでも顔が潰れて真っ黒にならない程度に、ごく弱く自ら光らせる
      reflectedLight.indirectDiffuse += diffuseColor.rgb * uHatAO * 0.16 * (1.0 - occ * 0.5);
    }`);
}
// 笠・兜をかぶる人の顔の材質（絵は同じ物を使い、陰の強さだけ変える）
const hatMats = new Map();
// 兵の顔の四通り（汚れ x・汗 y・日焼けの赤み z・斑の位置 w）
const FACE_VAR = [[0.2, 0.3, 0.2, 1.3], [0.45, 0.55, 0.35, 4.1], [0.35, 0.85, 0.6, 7.7], [0.6, 0.4, 0.45, 2.9]];   // 泥は口のまわりの黒い塊にしない（0.95 は泥の面に見えた）
function hatFaceMat(base, amt, fv = -1) {
  const k = base.uuid + '|' + amt + '|' + fv;
  if (!hatMats.has(k)) {
    const m = base.clone();
    m.userData = { ao: { value: amt }, fv: { value: new THREE.Vector4(...(FACE_VAR[fv] || [0, 0, 0, 0])) } };
    m.onBeforeCompile = headCompile; m.customProgramCacheKey = () => 'scanhead'; hatMats.set(k, m);
  }
  return hatMats.get(k);
}
// ---- 髪と髷 ----
// 横と後ろの髪：頭の形の髪の所を、毛の厚みぶん浮かせた殻にする（絵に塗った髪だけでは、頭が剃った坊主の形に見える）
// 髷：剃った頭頂に、後ろから前へ折った髪の束と元結。形は頭の形ごとに一度だけ作る
const hairGeos = new Map();
let HAIR_MATS = null;
function hairAt(x, y, z) {
  const th = Math.abs(Math.atan2(x, z));
  const back = smooth(1.55, 1.95, th) * smooth(0.3, 0.9, y);
  const side = smooth(1.2, 1.5, th) * smooth(1.2, 1.7, y) * smooth(3.5, 3.05, y);
  // 耳の上は髪を浮かせない（耳を覆う帽子に見せない）
  const ear = Math.abs(x) > 3.5 && y < 2.4 && y > 0.2 ? smooth(3.5, 3.9, Math.abs(x)) : 0;
  return Math.max(back, side) * (1 - ear);
}
function hairGeo(hg) {
  if (hairGeos.has(hg.uuid)) return hairGeos.get(hg.uuid);
  const pos = hg.attributes.position, nrm = hg.attributes.normal, idx = hg.index;
  const P = [], Nn = [], A = [];
  const hv = new Float32Array(pos.count).fill(-1);
  const H = (v) => (hv[v] >= 0 ? hv[v] : (hv[v] = hairAt(pos.getX(v), pos.getY(v), pos.getZ(v))));
  for (let i = 0; i < idx.count; i += 3) {
    const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const hs = t.map(H);
    if (Math.max(...hs) < 0.02) continue;
    for (let k = 0; k < 3; k++) {
      const v = t[k], d = 0.1 * hs[k];
      P.push(pos.getX(v) + nrm.getX(v) * d, pos.getY(v) + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d);
      Nn.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v)); A.push(hs[k]);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  shell.setAttribute('hairA', new THREE.Float32BufferAttribute(A, 1));
  // 頭頂の線（真ん中の縦の切り口）：前後の位置ごとの一番上
  const top = new Map();
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getX(v) + 0.09) > 0.35) continue;
    const zb = Math.round(pos.getZ(v) * 4);
    top.set(zb, Math.max(top.get(zb) ?? -9, pos.getY(v)));
  }
  const topY = (z) => { let best = 0, bz = 1e9; for (const [zb, y] of top) { const dz = Math.abs(zb / 4 - z); if (dz < bz) { bz = dz; best = y; } } return best; };
  // 髷：後ろの頭頂（元結）から前へ、頭の丸みに沿って少し浮かせる。先は細く
  const zs = [-1.75, -1.35, -0.9, -0.35, 0.2, 0.6];
  const lift = [0.34, 0.4, 0.38, 0.32, 0.27, 0.24];
  const curve = new THREE.CatmullRomCurve3(zs.map((z, i) => new THREE.Vector3(-0.09, topY(z) + lift[i], z)));
  const mage = new THREE.TubeGeometry(curve, 16, 1, 8, false);
  // 太さ：元結の所が太く、先へ細る（筆の穂のように）
  // 茶筅の穂先のように：元結（ネック）で一度くくって細り、その先は少し広がる
  { const p = mage.attributes.position, n = 16 + 1, r = 8 + 1, neckT = 0.14; for (let s = 0; s < n; s++) { const t = s / (n - 1), c = curve.getPointAt(t), rad = 0.4 * (t < neckT ? 1 - 0.55 * (t / neckT) : 0.45 + 0.65 * Math.pow((t - neckT) / (1 - neckT), 0.7)); for (let j = 0; j < r; j++) { const i = s * r + j; p.setXYZ(i, c.x + (p.getX(i) - c.x) * rad, c.y + (p.getY(i) - c.y) * rad * 0.8, c.z + (p.getZ(i) - c.z) * rad); } } mage.computeVertexNormals(); }
  // 髷の根：頭頂の後ろの小さな盛り上がり（束ねた髪）
  const knot = new THREE.SphereGeometry(0.42, 10, 7); knot.scale(1.05, 0.7, 1.1); knot.translate(-0.09, topY(-1.6) + 0.12, -1.6);
  // 元結（白い紙縒り）
  const tie = new THREE.TorusGeometry(0.3, 0.07, 5, 12); tie.rotateY(Math.PI / 2); tie.rotateZ(0.0); tie.rotateX(0.35);
  const t0 = curve.getPointAt(0.12); tie.translate(t0.x, t0.y, t0.z);
  const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); g.setAttribute('hairA', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1)); return g; };
  const bun = mergeGeometries([strip(mage), strip(knot)]);
  const out = { shell, bun, tie: strip(tie), T: new THREE.Vector3(-0.09, topY(-1.6), -1.6) };
  hairGeos.set(hg.uuid, out);
  return out;
}
function hairMats() {
  if (HAIR_MATS) return HAIR_MATS;
  const mk = (bun) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHairT = m.userData.T;
      sh.vertexShader = 'attribute float hairA;\nvarying float vHA;\nvarying vec3 vHP2;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHA = hairA; vHP2 = position;');
      sh.fragmentShader = 'uniform vec3 uHairT;\nvarying float vHA;\nvarying vec3 vHP2;\nfloat hh1(float n) { return fract(sin(n) * 43758.5453); }\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // 毛の筋：どの毛も元結（uHairT）へ向かって梳き上げてある。元結のまわりの角度で細い筋を引く
          vec3 d = vHP2 - uHairT;
          float a = ${bun ? 'atan(d.x, d.y) * 3.0 + d.z * 0.8' : 'atan(d.x, length(d.yz)) * 7.0 + atan(d.y, d.z) * 9.0'};
          float s1 = fract(a * 9.0), s2 = hh1(floor(a * 9.0));
          float strand = 0.6 + 0.5 * smoothstep(0.0, 0.5, abs(s1 - 0.5)) * (0.6 + 0.4 * s2);
          diffuseColor.rgb *= strand;
          // 生え際：毛先の不揃いな縁（殻の縁を一本の線に見せない）。縁は薄く、肌が透ける
          float ragged = hh1(floor(a * 9.0) * 3.7 + floor(vHP2.y * 6.0));
          if (vHA < 0.12 + 0.5 * ragged * (1.0 - smoothstep(0.3, 0.8, vHA))) discard;
          diffuseColor.rgb = mix(diffuseColor.rgb * 1.35, diffuseColor.rgb, smoothstep(0.2, 0.7, vHA));
        }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.42 + 0.2 * hh1(floor(vHP2.x * 40.0) + floor(vHP2.y * 40.0) * 7.0);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // 鬢付け油の照り：毛の筋に沿う細い帯（髪の艶）
        reflectedLight.directSpecular *= 1.4;`);
    };
    m.customProgramCacheKey = () => 'hair' + (bun ? 'b' : 's');
    m.userData.T = { value: new THREE.Vector3() };
    return m;
  };
  HAIR_MATS = { shell: new Map(), bun: new Map(), mk, tie: new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.8 }) };
  return HAIR_MATS;
}
function addHair(hm, hg, F, lite) {
  const G = hairGeo(hg), M = hairMats();
  const hex = F.hair || 0x15110d, key = hex + '|' + G.T.toArray().map((v) => v.toFixed(1)).join(',');
  const pick = (map, bun) => {
    if (!map.has(key)) { const m = M.mk(bun); m.color.setHex(hex).multiplyScalar(1.6).add(new THREE.Color(0.018, 0.015, 0.012)); m.userData.T.value.copy(G.T); map.set(key, m); }
    return map.get(key);
  };
  for (const [geo, mat] of [[G.shell, pick(M.shell, false)], [G.bun, pick(M.bun, true)], [G.tie, M.tie]]) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !lite; m.receiveShadow = true; m.frustumCulled = false;
    hm.add(m);
  }
}
// 骨格の彫り：頭の座標（1 が 4cm ほど。眉 y≈2.0、目 y≈1.72、口 y≈0.2、顔の前 z≈2、真ん中 x≈-0.09）で、横と前へのずらし [dx, dz]
const EYE_SINK = 0.05;   // 目のくぼみの深さの分、目を奥へ
function faceSculpt(x0, y, z, xc) {
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  const fr = z > 0.6 ? Math.min(1, (z - 0.6) / 1.0) : 0;
  const t = Math.min(1, Math.max(0, (x0 - 0.65) / 1.0));
  let dx = 0, dz = 0;
  dz -= 0.4 * t * t * (3 - 2 * t) * fr * (y < 2.6 ? 1 : 0.5);                  // 顔の面を横へ回り込ませる
  // 下の顔を顎へ向けて細める（頬から顎先へ、逆さの卵の形に）。首に近い後ろは動かさない
  const lowF = Math.min(1, Math.max(0, (1.0 - y) / 1.8)) * Math.min(1, Math.max(0, (z - 0.2) / 1.2));
  dx -= x0 * 0.2 * lowF * lowF;
  // 頬の縁：目の横から頬の外は、縦にまっすぐな縁にせず、頬骨の所で膨らみ、こめかみと顎の横で絞る
  dx += 0.08 * Gs(x0 - 1.6, y - 1.15, 0.3, 0.45) - 0.07 * Gs(x0 - 1.6, y - 2.2, 0.3, 0.3);
  // 首：顎の下から肩へ太く（細い首に大きな頭が載った人形にしない）。顎の前は動かさない
  const nb = Math.exp(-Math.pow(y + 0.8, 2) / (2 * 0.3 * 0.3)) * (z < 1.1 ? 1 : Math.max(0, 1 - (z - 1.1) / 0.4));
  dx += x0 * 0.2 * nb; dz += z * 0.12 * nb;
  dx -= 0.13 * Gs(x0 - 1.4, y + 0.35, 0.35, 0.45);                              // えらの角を落とす
  const cb = Gs(x0 - 1.2, y - 1.3, 0.28, 0.24) * fr; dx += 0.06 * cb; dz += 0.07 * cb;   // 頬骨
  dz -= 0.06 * Gs(x0 - 1.0, y - 0.6, 0.3, 0.3) * fr;                            // 頬骨の下のこけ
  dz += 0.1 * Gs(x0 - 0.62, y - 2.03, 0.45, 0.09) * fr;                          // 眉弓
  dz -= 0.075 * Gs(x0 - 0.6, y - 1.74, 0.28, 0.14) * fr;                         // 目のくぼみ
  dz += 0.06 * Gs(xc, y - 1.55, 0.13, 0.3) * (z > 1.8 ? 1 : 0);                  // 鼻筋
  dz += 0.05 * Gs(xc, y + 0.55, 0.35, 0.28) * fr;                                // 顎先
  return [dx, dz];
}
// MakeHuman の頭の彫り（MakeHuman の頭の座標：目 y 1.72・x ±0.64、眉 y≈2.05、鼻先 y≈0.85、鼻の下 y≈0.5、口 y≈0.15、顎 y≈-0.9、顔の前 z≈2.2）
// 元の形は丸く滑らかで、人形の顔に見える：眉弓と鼻筋を立て、頬骨を張り、その下をこけさせ、顎の線を締める（戦国の日本人の骨格：頬骨が張り、鼻筋は低め）
const MH_NARROW = 0.9;
function mhSculpt(x0, y, z, xc) {
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  const fr = Math.min(1, Math.max(0, (z - 0.8) / 1.0));
  let dx = 0, dz = 0;
  dz += 0.1 * Gs(x0 - 0.62, y - 2.06, 0.42, 0.11) * fr;                         // 眉弓
  dz += 0.04 * Gs(xc, y - 1.98, 0.2, 0.12) * fr;                                // 眉間
  dz -= 0.035 * Gs(x0 - 0.66, y - 1.93, 0.25, 0.06) * fr;                       // 眉と瞼の間のくぼみ
  dz += 0.07 * Gs(xc, y - 1.6, 0.11, 0.22) * (z > 1.9 ? 1 : 0);                 // 鼻筋
  dx += 0.05 * Gs(x0 - 1.3, y - 1.3, 0.25, 0.25) * fr;                          // 頬骨（横へ）
  dz += 0.07 * Gs(x0 - 1.15, y - 1.3, 0.28, 0.2) * fr;                          // 頬骨（前へ）
  dz -= 0.1 * Gs(x0 - 1.05, y - 0.55, 0.28, 0.3) * fr;                          // 頬骨の下のこけ
  dx -= 0.04 * Gs(x0 - 1.35, y - 0.5, 0.3, 0.3);
  dz += 0.03 * Gs(x0 - 0.75, y - 0.6, 0.15, 0.25) * fr;                         // ほうれい線の外の頬
  const lowF = Math.min(1, Math.max(0, (0.9 - y) / 1.5)) * fr;
  dx -= x0 * 0.07 * lowF;                                                       // 下の顔を細く
  dx += 0.03 * Gs(x0 - 1.3, y + 0.45, 0.22, 0.2);                               // えらの角
  dz += 0.05 * Gs(xc, y + 0.6, 0.3, 0.22) * fr;                                 // 顎先
  return [dx, dz];
}
// 実写の頭の形（顔の形の値で少し変える：幅・えら・大きさ）
const headGeos = new Map();
function headGeo(key, F) {
  if (headGeos.has(key)) return headGeos.get(key);
  const g = (HEAD.mh ? HEAD.vars[mhPick(key, F)] : HEAD.geo).clone();
  const p = g.attributes.position;
  const w = F.w || 1, jaw = F.jaw || 1;
  const eyes = HEAD.mh && HEAD.eyes && HEAD.eyes[mhPick(key, F)];
  // 顔の彫り（名のある武将ほど強く）：頬骨・頬のこけ・鼻の高さと幅・眉の張り・目の間隔・年の頬の下がり
  // MakeHuman の頭は兜で額から上が隠れるので、名のある武将は顔の違いを強めに出す（皆が同じ顔に見えないよう）
  const kk = String(key).startsWith('g:') || key === 'player' ? (HEAD.mh ? 1.7 : 1) : 0.6;
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
      // 目の穴の周りだけを変える。目玉・兜・頭頂の形は変えない。
      const ec = eyes ? (Math.sign(eyes.l[0] + 0.09) === sx ? eyes.l : eyes.r) : null;
      const eyeX = ec ? ec[0] : sx * 0.6 - 0.09, eyeY = ec ? ec[1] : 1.72;
      const ex = Math.abs(p.getX(i) - eyeX), ey = p.getY(i) - eyeY;
      const ew = Gs(ex, ey, 0.32, 0.2) * fr;
      y += (ey * (1 / (F.eye || 1) - 1) + (x0 - Math.abs(eyeX + 0.09)) * (F.eyeTilt || 0)) * ew;
      // 顎先の長短は首に届かない範囲で付ける。
      const chin = ((F.chin ?? 1) - 1) * Gs(xc, p.getY(i) + 0.8, 0.55, 0.3) * fr;
      y -= chin * 0.4; z += chin * 0.25;
      const jw = Gs(x0 - 0.95, y + 0.15, 0.45, 0.5) * fr;
      y -= old * 0.12 * jw; x += sx * old * 0.05 * jw;
      if (HEAD.mh) {
        // 年：ほうれい線の溝・目の下のたるみ・頬のこけ
        const nlx = 0.38 + (0.62 - y) * 0.45;
        z -= old * 0.05 * Gs(x0 - nlx, y - 0.45, 0.07, 0.4) * fr;
        z += old * 0.03 * Gs(x0 - 0.62, y - 1.42, 0.25, 0.06) * fr;
        z -= old * 0.04 * Gs(x0 - 1.05, y - 0.7, 0.3, 0.3) * fr;
      }
    }
    // 骨格の彫り（誰にでも）：顔の面を丸め、えらの角を落とし、頬骨・眉弓・鼻筋・顎を出し、目と頬の下をくぼませる（四角い箱に絵を貼った顔にしない）
    if (!HEAD.mh) { const d = faceSculpt(x0, y, z, xc); x += sx * d[0]; z += d[1]; } else {
      const d = mhSculpt(x0, y, z, xc); x += sx * d[0]; z += d[1];
      // 頭の幅を細める（MakeHuman の頭は兜の鉢と同じほど幅があり、大きな丸顔に見える）。首の付け根はそのまま
      const nk = MH_NARROW + (1 - MH_NARROW) * Math.min(1, Math.max(0, (-0.7 - y) / 0.5));
      x = -0.09 + (x + 0.09) * nk;
    }
    p.setXYZ(i, x, y, z);
  }
  // 表情の差も顔の幅に合わせる（横は顔の幅と細め、縦と前はそのまま）
  if (g.morphAttributes.position) g.morphAttributes.position = g.morphAttributes.position.map((a) => { const b = a.clone(), kx = w * (HEAD.mh ? MH_NARROW : 1); for (let i = 0; i < b.count; i++) b.setX(i, b.getX(i) * kx); return b; });
  g.computeVertexNormals();
  headGeos.set(key, g);
  return g;
}

const scalpGeos = new Map();
// 兜をかぶる頭：眉より上を低く押し下げ、少し内へ寄せて鉢の内に収める（穴を開けると切り口が見えるので、形を縮める）
function clipScalp(g) {
  if (scalpGeos.has(g.uuid)) return scalpGeos.get(g.uuid);
  const out = g.clone(), p = out.attributes.position = g.attributes.position.clone();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > SCALP.y) {
      const t = y - SCALP.y;
      y = SCALP.y + t * SCALP.ky;
      const k = 1 - SCALP.kin * Math.min(1, t / 1.2);
      x *= k; z = SCALP.zc + (z - SCALP.zc) * k;
    }
    p.setXYZ(i, x, y, z);
  }
  out.computeVertexNormals();
  scalpGeos.set(g.uuid, out);
  return out;
}
// 頭の座標（スキャン：眉は y≈2.0、顔の前は z≈2）。眉の少し上から上を ky 倍に低く、kin だけ内へ
const SCALP = { y: 2.15, ky: 0.35, kin: 0.12, zc: 0.2 };
// 開いた目：スキャンの顔は目を閉じているので、まぶたの上に白目・黒目・上まぶた・まつげの影を置く（スキャンの頭の座標で）
const EYE = { geo: null, mats: null };
function addEyes(hm, F) {
  if (!EYE.geo) {
    const white = new THREE.SphereGeometry(1, 16, 10); white.scale(0.22, 0.075, 0.06);
    const iris = new THREE.SphereGeometry(1, 12, 8); iris.scale(0.1, 0.095, 0.03);
    const pupil = new THREE.SphereGeometry(1, 8, 6); pupil.scale(0.042, 0.042, 0.012);
    const lid = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); lid.scale(0.29, 0.07, 0.085);
    const lash = new THREE.TorusGeometry(1, 0.06, 4, 16, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
    const lower = new THREE.TorusGeometry(1, 0.1, 4, 14, Math.PI * 0.8); lower.rotateZ(Math.PI * 1.1); lower.scale(0.24, 0.07, 0.06);
    EYE.geo = { white, iris, pupil, lid, lash, lower };
    EYE.mats = {
      white: new THREE.MeshStandardMaterial({ color: 0x74695c, roughness: 0.3 }),
      iris: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.15 }),
      pupil: new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.1 }),
      lash: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }),
    };
  }
  // まぶたは目のくぼみの影の中（顔の肌より暗く。明るいと目の上に貼った帯に見える）
  const skinM = EYE.lidM || (EYE.lidM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4e3528), roughness: 0.6 }));
  const w = F.w || 1, open = 1 / (F.eye || 1), esp = (F.esp ?? 1) - 1;
  for (const cx of [-0.69, 0.51]) {
    const g = new THREE.Group();
    g.position.set(cx * w + Math.sign(cx + 0.09) * esp * 0.6, 1.72, 1.965 - EYE_SINK);
    g.rotation.y = (cx < -0.09 ? -1 : 1) * 0.22;
    const add = (geo, mat, x, y, z, sy = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m; };
    add(EYE.geo.white, EYE.mats.white, 0, 0, 0, open);
    add(EYE.geo.iris, EYE.mats.iris, 0.01, 0.006, 0.045, open);
    add(EYE.geo.pupil, EYE.mats.pupil, 0.01, 0.006, 0.068, open);
    // 上まぶたは黒目の上を少し覆う（白目が黒目を囲む見開いた目にしない）
    add(EYE.geo.lid, skinM, 0, 0.042 + 0.02 * (1 - open), 0.004);
    add(EYE.geo.lash, EYE.mats.lash, 0, 0.018, 0.012, open);
    add(EYE.geo.lower, skinM, 0, -0.004, 0.006, open);
    hm.add(g);
  }
}

// ---------------- 人を作る ----------------
// 部品を骨に付ける。体の座標（立ち姿）で作った部品を、その骨の立ち姿の位置に合わせて置く
// MakeHuman の頭の目玉：まぶたの穴の奥に、白目と黒目を描いた球を二つ（一つの形・一つの材質）。形は作り分けと顔の幅ごとに一つ
const EYE_MH = { geos: new Map(), mat: null };
function addEyesMH(hm, key, F) {
  const vi = mhPick(key, F), E = HEAD.eyes && HEAD.eyes[vi];
  if (!E) return;
  const w = F.w || 1, esp = (F.esp ?? 1) - 1;
  const gk = vi + '|' + w.toFixed(2) + '|' + esp.toFixed(2);
  if (!EYE_MH.geos.has(gk)) {
    const gs = [];
    for (const c of [E.l, E.r]) {
      const g = new THREE.SphereGeometry(E.rad * 0.96, 20, 14);
      // 球の前（+z）が黒目：uv の u=0.25 が +z。外へ少し向ける
      const sx = Math.sign(c[0] + 0.09) || 1;
      g.rotateY(sx * 0.08);
      g.translate((-0.09 + (c[0] + 0.09) * MH_NARROW) * w + sx * esp * 0.55, c[1], c[2] - E.rad * 0.06);
      gs.push(g);
    }
    EYE_MH.geos.set(gk, mergeGeometries(gs));
  }
  if (!EYE_MH.mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    // 白目：真っ白にしない（少し黄みの灰）。目頭・目尻へ赤み
    g.fillStyle = '#7f7466'; g.fillRect(0, 0, 256, 128);
    const cx = 64, cy = 64;
    const gr = g.createRadialGradient(cx, cy, 10, cx, cy, 60); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,60,50,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    // 黒目（焦げ茶）と瞳。縁は暗く
    // 黒目は眼球の幅の半分ほど（小さい黒目は白目が広く見え、驚いた人形の目になる）
    const ir = g.createRadialGradient(cx, cy, 3, cx, cy, 20); ir.addColorStop(0, '#1a0f07'); ir.addColorStop(0.6, '#2a190d'); ir.addColorStop(0.88, '#1a0f08'); ir.addColorStop(1, '#0a0604');
    g.fillStyle = ir; g.beginPath(); g.ellipse(cx, cy, 20, 20, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050302'; g.beginPath(); g.ellipse(cx, cy, 7, 7, 0, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    EYE_MH.mat = new THREE.MeshPhysicalMaterial({ map: t, color: 0xc8c0b8, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.7 });
    // 目はまぶたと眼窩の陰の中：上ほど暗く（白目が光って浮かないよう）。目の玉の上半分は上まぶたの影
    EYE_MH.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying float vEyY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEyY = normal.y;');
      sh.fragmentShader = 'varying float vEyY;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n float eyS = mix(1.0, 0.6, smoothstep(-0.1, 0.6, vEyY));\n reflectedLight.directDiffuse *= eyS; reflectedLight.indirectDiffuse *= eyS * 0.85;\n // 空の映り込みは瞳の上の小さな照りだけ（目の玉いっぱいに灰色の空が映ると、青白く光る人形の目になる）。上まぶたと眼窩の陰で上ほど消す\n reflectedLight.indirectSpecular *= 0.35 * eyS * eyS;\n #ifdef USE_CLEARCOAT\n clearcoatSpecularIndirect *= 0.3 * eyS * eyS;\n #endif');
    };
    EYE_MH.mat.customProgramCacheKey = () => 'mheye';
  }
  const m = new THREE.Mesh(EYE_MH.geos.get(gk), EYE_MH.mat);
  m.frustumCulled = false; m.receiveShadow = true;
  hm.add(m);
}
// 口の中：開いた唇の奥は暗い口の洞（頭の裏の面が覗かないよう）、上と下の歯（MakeHuman の歯の形。下の歯は表情の差で顎と回る）
const MOUTH_MH = { geos: new Map(), teethM: null };
function addMouthMH(hm, key, F) {
  const vi = mhPick(key, F), w = F.w || 1;
  const gk = vi + '|' + w.toFixed(2);
  if (!MOUTH_MH.teethM) {
    // 歯：真っ白にしない（黄ばみと、奥ほど暗く）。口の洞（cav が 1 の所）は暗い赤黒
    MOUTH_MH.teethM = new THREE.MeshStandardMaterial({ color: 0x6e6352, roughness: 0.75 });
    MOUTH_MH.teethM.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float cav;\nvarying vec3 vTp;\nvarying float vCav;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTp = position; vCav = cav;');
      // 一本ずつの歯の境（細い暗い筋）と、歯の根の歯茎の赤み。奥の歯と口の奥は陰に沈む（白い塊に見せない）
      sh.fragmentShader = 'varying vec3 vTp;\nvarying float vCav;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float tx = abs(vTp.x + 0.09) * 5.2, gap = smoothstep(0.08, 0.0, abs(fract(tx) - 0.5) - 0.42);
        diffuseColor.rgb *= (1.0 - 0.3 * gap) * (0.75 + 0.25 * smoothstep(0.45, 0.1, abs(vTp.y - 0.17)));
        float gum = smoothstep(0.32, 0.5, abs(vTp.y - 0.17));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.065, 0.055), gum * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.035, 0.03), vCav);`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n float tk = smoothstep(1.35, 1.95, vTp.z) * smoothstep(0.9, 0.3, abs(vTp.x + 0.09)) * (1.0 - vCav); reflectedLight.directDiffuse *= tk * 0.45; reflectedLight.indirectDiffuse *= 0.1 + 0.35 * tk; reflectedLight.directSpecular *= tk; reflectedLight.indirectSpecular *= tk;');
    };
    MOUTH_MH.teethM.customProgramCacheKey = () => 'mhteeth';
  }
  if (!MOUTH_MH.geos.has(gk)) {
    const t = HEAD.teeth && HEAD.teeth[vi];
    let g = null;
    if (t) {
      // 歯と口の洞（歯の少し奥の、横に長い楕円の球）を一つの形に（描く回数を一つに）
      t.computeBoundingBox(); const bb = t.boundingBox, kx = w * MH_NARROW;
      const cg = new THREE.SphereGeometry(1, 12, 8); cg.deleteAttribute('uv'); cg.deleteAttribute('normal');
      cg.scale(0.55 * kx, 0.42, 0.5); cg.translate(-0.09, (bb.min.y + bb.max.y) / 2 - 0.05, bb.min.z - 0.4);
      const tg = t.clone(); tg.deleteAttribute('normal');
      const p = tg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, -0.09 + (p.getX(i) + 0.09) * kx);
      const nT = p.count, nC = cg.attributes.position.count;
      const P = new Float32Array((nT + nC) * 3); P.set(p.array, 0); P.set(cg.attributes.position.array, nT * 3);
      const I = [...tg.index.array, ...Array.from(cg.index.array, (i) => i + nT)];
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      const C = new Float32Array(nT + nC); C.fill(1, nT); g.setAttribute('cav', new THREE.BufferAttribute(C, 1));
      g.setIndex(I);
      if (t.morphAttributes.position) {
        g.morphAttributes.position = t.morphAttributes.position.map((a) => { const D = new Float32Array((nT + nC) * 3); for (let i = 0; i < nT; i++) { D[i * 3] = a.getX(i) * kx; D[i * 3 + 1] = a.getY(i); D[i * 3 + 2] = a.getZ(i); } return new THREE.BufferAttribute(D, 3); });
        g.morphTargetsRelative = true;
      }
      g.computeVertexNormals();
    }
    MOUTH_MH.geos.set(gk, g);
  }
  const G = MOUTH_MH.geos.get(gk);
  // 口を閉じている間は描かない（描く回数を増やさない）
  if (G) { const m = new THREE.Mesh(G, MOUTH_MH.teethM); m.frustumCulled = false; m.visible = false; hm.add(m); hm.userData.teeth = m; }
}
// 表情の値（x 口を開く・y 痛み・z 怒り）を、顔と歯の形の差の重みへ
function setFaceMorph(h) {
  const m = h.faceM, E = h.expr;
  if (!m || !m.morphTargetInfluences || !E) return;
  const I = m.morphTargetInfluences;
  // 痛みと叫びが重なる時は、叫びの顎を少し閉じる（食いしばって歯を剥く）
  I[0] = E.x * (1 - 0.35 * Math.min(1, E.y)); I[1] = E.y; I[2] = E.z * (1 - 0.5 * Math.min(1, E.y));
  const t = m.userData.teeth;
  if (t && t.morphTargetInfluences) { t.morphTargetInfluences[0] = I[0]; t.morphTargetInfluences[1] = I[1]; t.morphTargetInfluences[2] = I[2]; t.visible = I[0] + I[1] > 0.04; }
}
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
  m.castShadow = true; m.receiveShadow = true;
  const M = new THREE.Matrix4().copy(restMatrix(nm)).invert().multiply(fit);
  m.matrixAutoUpdate = false;
  m.matrix.copy(M);
  // 骨に付けた部品（兜・笠・髪・得物など）は画面の外なら描かない（画面の外の人の頭の部品だけで一コマ 2〜4 万の三角）。
  //   球は形の物を 1.5 倍に広げて使う（骨の行列が一コマ古くても消えない）。骨の行列が古い人は描く位置も同じ古い行列なので、判定と描きは食い違わない
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (geo.boundingSphere && !geo.userData.wideSphereH) { geo.boundingSphere.radius = geo.boundingSphere.radius * 1.5 + 0.1; geo.userData.wideSphereH = true; }
  m.frustumCulled = !!geo.boundingSphere && isFinite(geo.boundingSphere.radius);
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
  // 刀は体の厚みに合わせて伸ばさず、左腰の差し口の位置だけを合わせる。
  const waist = new THREE.Vector3(0, 0.93, 0).applyMatrix4(SRC.fitT);
  SRC.fitK = new THREE.Matrix4().makeTranslation(waist.x, waist.y - 0.93, waist.z);
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
// 人に着せる前の姿の整え（makeHuman と、前もって形を作る prefetchLook で同じにする）
function humanLook(look0) {
  let look = look0;
  const sohei = isSohei(look0);
  // 足軽の籠手：御貸具足の籠手は多くの者が着ける（素肌の前腕の者は三人に一人ほど。片籠手の者も）
  if (!look.hero && (look.tier ?? 0) === 0 && look.kote == null && !isNamed(look)) look = { ...look, kote: [3, 0, 3, 1, 3, 0][(look.vi || 0) % 6] };
  // 目の下頬は、実写の顔に沿わせて作る（兜の形の面は喉の垂だけにする。兵は近くで実写の顔に替えた時に付ける）
  // 面頬（半頬・目の下頬）は、実写の顔の形から打ち出す（units.js の遠目の面頬は平らな黒い板で、近くでは貼った板に見える）
  if (look.menpo && (look.menpoStyle === 'hanbo' || look.menpoStyle === 'full' || !look.menpoStyle) && !sohei) look = { ...look, menpoStyle: 'tare', menpoScan: look.menpo };
  // 僧兵：墨染めの直綴に五条袈裟、頭は裹頭（数人に一人は鉢巻か兜）。衣と袈裟の形は units.js の soheiLook・soheiBody
  if (sohei) look = soheiLook({ ...look, sohei: 1 });
  return look;
}
// 前もって作る：これから人にする兵の部品の形と束ねた形を、一段ずつ作っておく（形は姿ごとに共有の置き場へ入る。支度の札の間に prefetchHumanShapes から）。
//   一人を作るコマに、部品の形づくり（一人 5ms 前後・携帯ではその数倍）が重ならない。材質・骨・顔は作らない
function prefetchLook(units, cx, cz, reach) {
  if (!SRC) return;
  // 人の枠の少し外（reach）までで、まだ人でない一番近い者を選ぶ（近づけば次に人になる者）
  // 部品の形（一段目）を先に皆へ。束ねた形（二・三段目）はその後
  let u = null, best = Infinity;
  const r2 = reach * reach;
  for (const o of units) {
    if (o.human || o.isPlayer || !o.look || o.gone || !o.mesh || o.type === 'dummy') continue;
    const st = o._hpreLook === o.look ? o._hpre : 0;
    if (st >= 3) continue;
    const d2 = (o.pos.x - cx) ** 2 + (o.pos.z - cz) ** 2;
    if (d2 >= r2 || (!o.alive && d2 > HUM.dead * HUM.dead)) continue;
    // 人にする順（humansStep の pr）に合わせ、画面の中の者を先に
    _sph.center.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
    const sc = st * 1e6 + Math.sqrt(d2) + (_fr.intersectsSphere(_sph) ? 0 : 30);
    if (sc < best) { best = sc; u = o; }
  }
  if (u) { const t = performance.now(); preStep(u, Math.min(3, creationLeft)); creationLeft -= performance.now() - t; }
}
// 形を前もって作る一段（部品の形 → 遠い部品の形 → 束ねた形）。済んでいれば false
function shapesReady(u) { return u._hpreLook === u.look && u._hpre >= 3; }
// 形の作り方を小さな手順に分けて並べる：近い部品の形を一つずつ → 打ち出しの縅 → 遠い部品の形を一つずつ → 束ねた形を一つずつ
function preQueue(u) {
  const look = humanLook(u.look), sohei = isSohei(u.look);
  const near = () => { const P = nearArmorParts(lookParts(look)); P.look.sohei = sohei; return P; };
  // 束ねた形は兵の装い（dressCrowd の道）の人だけ。胴丸・南蛮・名将・本人は作る時に任せる
  const crowd = (f) => () => {
    const P = near(), L = P.look;
    if (DOMARU.ready && wantsDomaru(L)) return;
    if (L.nanban || L.hero) return;
    f(P, L, lookParts(look, false), DOMARU.ready && crowdDomaru(L) ? DM_KEEP : null);
  };
  return [...lookPartSteps(look, true), near, ...lookPartSteps(look, false),
    // 顔を束ねた形（face=true の geoF・geoLoF）は前もって作らず、要る時に作る（dressCrowd の faceGeo）
    crowd((P, L, Plo, only) => crowdGeometry(P, L, only)), crowd((P, L, Plo, only) => crowdGeometry(Plo, L, only)), crowd((P, L, Plo) => crowdGeometry(Plo, L, null, true, true))];
}
// 形を前もって作る（ms の間だけ。手順の一つは必ず進める）。済んでいれば false
function preStep(u, ms = 0) {
  if (!SRC || !u.look) return false;
  if (u._hpreLook !== u.look) { u._hpreLook = u.look; u._hpre = 0; u._hq = null; }
  if (u._hpre >= 3) return false;
  HSTAT.preSteps = (HSTAT.preSteps || 0) + 1;
  const t0 = performance.now();
  try {
    const q = u._hq || (u._hq = preQueue(u));
    while (q.length) { q.shift()(); if (performance.now() - t0 >= ms) break; }
    if (!q.length) { u._hpre = 3; u._hq = null; }
  } catch (e) { u._hpre = 3; u._hq = null; /* 前もって作れなくても、作る時に作る */ }
  const TX = HSTAT.tx || (HSTAT.tx = {}), dt = performance.now() - t0; TX.pre = +((TX.pre || 0) + dt).toFixed(1); TX.preMax = +Math.max(TX.preMax || 0, dt).toFixed(1);
  return true;
}
// 支度の札を見せている間に、兵の顔の絵（顔の型ごとに一枚。十二通りと僧）を前もって描く（指の端末用）。
//   戦の途中で近くへ来た兵の顔を初めて描くコマが重くならないよう（一枚 512 四方を CPU で描く。混んだ携帯で数十 ms）。近い兵の型から
export async function prefetchFaces(rt, camera, ms = 1500, current = () => true) {
  if (!HUM.on || !HUM.ready || !SRC || !HEAD || !rt?.army) return 0;
  const t0 = performance.now(), cx = camera.position.x, cz = camera.position.z;
  let list = preparationUnits(rt, camera);
  if (COARSE) list = list.slice(0, 24);
  list = list.filter(u => !u.isPlayer);
  const d2 = (u) => (u.pos.x - cx) ** 2 + (u.pos.z - cz) ** 2;
  // 兵の型を先に（皆が使う）、次に名のある武将を近い順に全員（一枚 1024 四方で重い）
  list.sort((a, b) => (isNamed(a.look) - isNamed(b.look)) || (d2(a) - d2(b)));
  const seen = new Set();
  let n = 0;
  for (const u of list) {
    if (performance.now() - t0 >= ms || !current()) break;
    const L0 = u.look, nm = isNamed(L0);
    const sk = nm ? L0.face : 'c' + ((L0.face | 0) % 12) + '|' + (L0.skin || 0) + (isSohei(L0) ? '|m' : '');
    if (seen.has(sk)) continue;
    seen.add(sk);
    try {
      const P = lookParts(humanLook(L0)), L = P.look;
      if (nm) {
        if (headMats.has(L.face)) continue;
        headMaterial(L.face, L, faceStyle(L.face, P.F));
      } else {
        headMaterial('c' + ((L.face | 0) % 12) + '|' + (L.skin || 0) + (L.monk ? '|m' : ''), L, faceStyle('c' + ((L.face | 0) % 12), P.F));
      }
      n++;
    } catch (e) { /* 描けなくても、近くへ来た時に描く */ }
    await finishFaceCopies(() => current() && performance.now() - t0 < ms);
    await preparationFrame();
  }
  faceWarmUnits = null;
  return n;
}
// 支度の札を見せている間に、カメラの近くの兵の形（部品・束ねた形）を前もって作る（指の端末用。材質と絵の下ごしらえはしない＝固まらない）。
//   開戦直後に近くの兵が次々と人になる時、一人ごとの形づくりが重いコマを作らないよう。ms を使い切るか、近い者が済んだら終わる
export async function prefetchHumanShapes(rt, camera, ms = 600, current = () => true) {
  if (!HUM.on || !HUM.ready || !SRC || !rt?.army) return 0;
  const t0 = performance.now();
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pv);
  // 骨の支度と同じ総数まで。用意済みの人も枠に数え、残り全員の
  // 甲冑・束ねた形を先読みして携帯の支度の上限をすり抜けない。
  const units = Number.isFinite(rt.humanPreparationCap)
    ? preparationUnits(rt, camera).slice(0, Math.max(0, rt.humanPreparationCap))
    : rt.army.units;
  let n = 0, slice = performance.now();
  while (performance.now() - t0 < ms && current()) {
    const before = HSTAT.preSteps = (HSTAT.preSteps || 0);
    prefetchLook(units, camera.position.x, camera.position.z, (HUM_Q[S.quality] || HUM_Q.high).near);
    if (HSTAT.preSteps === before) break;   // 近い者は皆済んだ
    n++;
    // 札の動きと取り消しを止めないよう、時々画面へ戻す
    if (performance.now() - slice >= 3) { await preparationFrame(); slice = performance.now(); }
  }
  return n;
}
// 人の根元の球を全部品で共有する。視野判定は部品の座標を要求するので、
// 骨・体格の変換を逆に掛けて渡す。形の共有球や立ち姿の球は書き換えない。
const humanCullOwners = new WeakMap(), humanCullParts = new WeakMap();
const humanCullMatrix = new THREE.Matrix4();
function humanPartSphere() {
  const p = humanCullParts.get(this), h = p.h;
  const radius = (h.u.mounted ? 2.2 : 1.3) + 0.3;
  h.root.boundingSphere.radius = radius;
  if (p.radius !== radius || p.geo !== this.geometry || !p.world.equals(this.matrixWorld) || !p.root.equals(h.root.matrixWorld)) {
    p.radius = radius; p.geo = this.geometry;
    p.world.copy(this.matrixWorld); p.root.copy(h.root.matrixWorld);
    humanCullMatrix.copy(this.matrixWorld).invert().multiply(h.root.matrixWorld);
    p.sphere.copy(h.root.boundingSphere).applyMatrix4(humanCullMatrix);
    // 指物・采配など人の球を越える硬い部品も、先端まで残す。
    if (!this.isSkinnedMesh) {
      if (!this.geometry.boundingSphere) this.geometry.computeBoundingSphere();
      p.sphere.union(this.geometry.boundingSphere);
    }
  }
  return p.sphere;
}
// 動きの原本ごとに名前だけを覚える。兵の骨や場面への参照は持ち越さない。
const motionNodeNames = new WeakMap();
function humanMotionBones(model, actions) {
  const nodes = new Map(), names = new Set(), result = new Set();
  model.traverse(o => {
    // 同名なら従来の探索と同じく、先に見つかる節を使う。
    if (!nodes.has(o.name)) nodes.set(o.name, o);
    nodes.set(o.uuid, o);
  });
  for (const action of Object.values(actions)) {
    const clip = action.getClip();
    let saved = motionNodeNames.get(clip);
    if (!saved) {
      saved = [...new Set(clip.tracks.map(t => THREE.PropertyBinding.parseTrackName(t.name).nodeName))];
      motionNodeNames.set(clip, saved);
    }
    for (const name of saved) names.add(name);
  }
  for (const name of names) {
    const bone = nodes.get(name) || THREE.PropertyBinding.findNode(model, name);
    if (bone && (bone.isBone || /^mixamorig/.test(bone.name))) result.add(bone);
  }
  return [...result];
}
function humanBoundAdd(...objects) {
  THREE.Object3D.prototype.add.apply(this, objects);
  const h = humanCullOwners.get(this);
  for (const o of objects) bindHumanBounds(h, o);
  return this;
}
function bindHumanBounds(h, root = h.root) {
  root.traverse((o) => {
    if (humanCullOwners.get(o) === h) return;
    humanCullOwners.set(o, h);
    // 後から付く顔・目・歯・采配・指物にも、追加した時だけ設定する。
    o.add = humanBoundAdd;
    if (!o.isMesh) return;
    o.frustumCulled = !h.u.isPlayer;
    if (h.u.isPlayer) return;
    humanCullParts.set(o, { h, sphere: new THREE.Sphere(), world: new THREE.Matrix4(), root: new THREE.Matrix4(), radius: -1, geo: null });
    Object.defineProperty(o, 'boundingSphere', { configurable: true, get: humanPartSphere });
  });
}
// 兵の持ち物（指物・傷の入れ物）は人を捨てても兵に残る。人へ付けた時の印（持ち主の表・球の取り出し口・add）を外さないと、
//   弱い表の鍵が兵の持ち物になり、捨てた人（骨・mixer・形）が戦の間ずっと残っていた（iPhone の WebContent が 260 秒で 2GB。10/20）
function unbindHumanBounds(root) {
  if (!root) return;
  root.traverse((o) => {
    if (!humanCullOwners.has(o)) return;
    unbindHumanPart(o);
  });
}
function unbindHumanPart(o) {
  humanCullOwners.delete(o); humanCullParts.delete(o);
  if (Object.prototype.hasOwnProperty.call(o, 'boundingSphere')) delete o.boundingSphere;
  if (Object.prototype.hasOwnProperty.call(o, 'add') && o.add === humanBoundAdd) delete o.add;
}
// 捨てる人に付けた印を全部外す。地に落ちた指物（groundDetached）や兵へ戻した部品が弱い表の鍵のまま残ると、
//   その人（骨・mixer・形・色の配列）が戦の間ずっと残る（森部 240 秒で兵に付かない人 32 人。10/20）
function releaseHumanBounds(h) {
  if (!h) return;
  const u = h.u;
  // 人の根（h.root）の中は触らない（根の球は根の持ち物。捨てた後も描かれる間は使う）。兵へ移った持ち物のうち、人の外にある物だけ外す
  for (const r of [u && u.flag, u && u.armorWear && u.armorWear.root, u && u.wpn, u && u.hatOff, u && u.dropped]) {
    if (!r || !r.traverse) continue;
    let p = r; while (p && p !== h.root) p = p.parent;
    if (p === h.root) continue;
    r.traverse((o) => { if (humanCullOwners.get(o) === h) unbindHumanPart(o); });
  }
}
export function makeHuman(u, look0) {
  const task = buildHuman(u, look0);
  let step;
  do { step = task.next(); } while (!step.done);
  return step.value;
}
function* buildHuman(u, look0) {
  const pooled = MEM_TIGHT && !qualityKeeper(u);
  if (pooled) {
    if (humanPool.size + humanBuilding.size >= SKIN_MAX) return null;
    humanBuilding.add(u);
  }
  try {
  const look = humanLook(look0);
  const sohei = isSohei(look0);
  const _t0 = performance.now();
  let waited = 0, pause;
  const P = nearArmorParts(lookParts(look));
  const L = P.look;
  L.sohei = sohei;
  const _t1 = performance.now();
  pause = performance.now(); yield; waited += performance.now() - pause;
  const root = new THREE.Group();
  // 隠れている人（使い回しを待つ人）は、骨の行列を毎コマ計算しない（描く時に scene が全部を辿って重くなるので）
  root.updateMatrixWorld = skipHiddenMW;
  const model = skClone(SRC.scene);
  const _t2 = performance.now(), waitClone = waited;
  pause = performance.now(); yield; waited += performance.now() - pause;
  model.scale.set(SRC.kH, SRC.kH, -SRC.kH);
  root.add(model);
  const bones = {};
  let body = null;
  model.traverse((o) => {
    if (o.isBone || /^mixamorig/.test(o.name)) {
      bones[o.name.replace(/^mixamorig:?/, '')] = o;
      o.updateMatrix(); o.matrixAutoUpdate = false;
      // 指の骨（一人 30 本）は下に描く物が付かないので、描く側の走査（projectObject）から外す。行列は hidden_skip.js が骨だけは直す
      if (/Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(o.name)) o.visible = false;
    }
    if (o.isSkinnedMesh && /Mesh/.test(o.name)) body = o;
    if (o.isSkinnedMesh && /visor/i.test(o.name)) o.visible = false;
  });
  body.material = bodyMaterial(L);
  body.castShadow = true; body.receiveShadow = true;
  body.frustumCulled = true;
  const h = { u, root, model, bones, body, look: L, parts: {}, seed: (u.id || 1) * 0.6180339 % 1, mode: 'crowd' };
  root.userData.hum = h;
  // 体格は親の u.mesh の個体差を使う。近い形へ替わっても背丈・肩幅を二重に変えない。
  // 遠い人（lodFar）は指・つま先・頭の先の骨の行列を毎コマ辿らない（描くのは体ごとまとめた軽い形で、その骨を使わない。要る時は getWorldPosition が親から求め直す）
  for (const nm of ['LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase', 'Head']) if (bones[nm]) { bones[nm].updateMatrixWorld = tipMW; bones[nm].userData.h = h; }
  h.lookSrc = look0;   // 作った時の元の姿（本人の姿が差し替えられたら作り直すため）
  // 型（立ち姿の骨の行列を測るため）を一度だけ作る
  if (!SRC.template) {
    const tr = new THREE.Group(); const tm = skClone(SRC.scene); tm.scale.set(SRC.kH, SRC.kH, -SRC.kH); tr.add(tm);
    const tb = {}; tm.traverse((o) => { if (o.isBone) tb[o.name.replace(/^mixamorig:?/, '')] = o; });
    tr.updateMatrixWorld(true);
    SRC.template = { root: tr, bones: tb };
  }
  const TX = HSTAT.tx || (HSTAT.tx = {});
  const tm = (k, f) => { const a = performance.now(); f(); TX[k] = +((TX[k] || 0) + performance.now() - a).toFixed(1); };
  tm('fits', () => fits());
  initHumanPalette();
  pause = performance.now(); yield; waited += performance.now() - pause;
  h.domaru = DOMARU.ready && wantsDomaru(L);
  // 名のある武将：胴丸の人形の兜と顔は描かず、その人の兜・顔・陣羽織・母衣・腰の刀を付ける
  if (h.domaru) {
    // 本人も、胴丸を着る時は武将と同じく陣羽織・前立・腰の刀・自分の顔を付ける（胴丸の人形の兜に、本人の兜の前立を載せる）
    h.mode = 'full'; const nd = isNamed(L) || !!u.isPlayer; h.helmScan = nd;
    // 本物の兜が読めていれば、胴丸の人形の兜は描かずに、兜のスキャンをかぶせる
    const kb = nd && KABUTO.on && KABUTO.ready;
    tm('domaru', () => dressDomaru(h, nd ? (kb ? true : 'helm') : false));
    if (kb) tm('kabuto', () => dressKabuto(h));
    if (nd) tm('named', () => dressNamed(h, P, L));
  }
  else if (L.nanban || qualityKeeper(u)) {
    h.mode = 'full'; tm('parts', () => dressParts(h, P, L));
    // 本人の手は写実の手（MakeHuman）に替える（一人称で目の前に来る）
    if (!sohei && attachHands(h, L)) body.material = bodyMaterial(L, false, 4 | (h.parts.foreP ? 1 : 0) | (h.parts.foreN ? 2 : 0));
  }
  // 名将も兵と同じ一つの骨入り具足へ束ねる。鉢と立物を替えても描く回数を増やさない。
  else if (namedKacchu(L)) {
    tm('named', () => dressCrowd(h, P, L, null, look));
    // 手取川の長近らは陣羽織専用の紋を優先し、遠景の具足と同じ指定を使う。
    const mon = L.haoriMon || L.mon;
    if (L.haori && mon && mon !== 'none') {
      const dm = monDecal(mon, L.haoriMonCol || 0xe6dfcf);
      if (dm) h.parts.mon = attachBody(h, 'Spine2', dm.geometry, SRC.fitT, dm.material);
    }
  }
  else if (DOMARU.ready && crowdDomaru(L)) { h.domaru = true; tm('domaru', () => dressDomaru(h, true)); tm('crowd', () => dressCrowd(h, P, L, DM_KEEP, look)); }
  else tm('crowd', () => dressCrowd(h, P, L, null, look));
  pause = performance.now(); yield; waited += performance.now() - pause;
  if (!h.domaru && !u.isPlayer) body.geometry = coveredBodyGeo(body.geometry, P, L);
  bodyLod(body, h);
  if (sohei && !L.kosode) naginata(u);
  // 作る時間の内訳（重さを調べるため）：部品の形・骨の写し・着せる
  const _t3 = performance.now();
  shareHumanSkeleton(h);
  HSTAT.tParts = (HSTAT.tParts || 0) + (_t1 - _t0); HSTAT.tClone = (HSTAT.tClone || 0) + (_t2 - _t1 - waitClone); HSTAT.tDress = (HSTAT.tDress || 0) + (_t3 - _t2 - (waited - waitClone));
  // 動き
  const mixer = new THREE.AnimationMixer(model);
  const act = {};
  for (const k of ['idle', 'walk', 'run']) { act[k] = mixer.clipAction(SRC.anims[k]); act[k].play(); act[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  // 歩きと走りは同じ足の拍子から始め、人ごとの開始位置を一周に散らす。
  h.gaitPhase = h.seed;
  act.idle.time = h.seed * act.idle.getClip().duration;
  act.walk.time = h.gaitPhase * act.walk.getClip().duration;
  act.run.time = h.gaitPhase * act.run.getClip().duration;
  h.animB = Object.values(bones).filter((b) => b.isBone && !(h.xb && Object.values(h.xb).includes(b)));
  // 録った動きが書く骨だけを覚える。指と、直に行列を書く追加の骨は含めない。
  h.motionB = humanMotionBones(model, act);
  h.pose = h.animB.map(() => new THREE.Quaternion());
  // 骨の回りは四元数だけで扱う。three は四元数が変わるたびに Euler（rotation）も求め直すが、骨の rotation は誰も読まない（毎コマ骨の数だけ setFromRotationMatrix が走っていた。10/20）
  for (const b of h.animB) b.quaternion._onChangeCallback = noopChange;
  h.poseReady = false;
  h.gset = new Float64Array(4); h.gset[0] = NaN;
  h.fpOffCache = {};
  // 待つ間の息づかいの速さは人ごとに少し違う
  act.idle.timeScale = 0.8 + h.seed * 0.4;
  h.mixer = mixer; h.act = act; h.w = { idle: 1, walk: 0, run: 0 };
  h.last = new THREE.Vector3().copy(u.pos || new THREE.Vector3()); h.spd = 0;
  h.acc = 0;
  h.wearFit = restInverse('Spine1').clone().multiply(SRC.fitT);
  root.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), (u.mounted ? 2.2 : 1.3) + 0.3);
  bindHumanBounds(h);
  cacheHumanSkeleton(h);
  h.skelDirty = true;
  if (pooled) {
    h.poolKey = humanPoolKey(u); h.leased = true;
    h.poolDefaults = {};
    for (const k in h) if (typeof h[k] === 'number' || typeof h[k] === 'boolean') h.poolDefaults[k] = h[k];
    pinHumanGeometries(h);
    humanPool.add(h);
  }
  return h;
  } finally { if (pooled) humanBuilding.delete(u); }
}

// 近距離専用の打ち出しと縅。元の形は変えず、骨へ付ける前に同じ部品へ結合する。
// 遠距離・影の lookParts(false) は従来どおり。形は姿ごとに共有し、描く回数は増やさない。
const nearArmorGeos = new LruMap(96);   // 人ごとの鍵（src.uuid）。人を手放した後も残るので上限つき（10/19）
let armorBox = null;
function nearArmorParts(parts) {
  const L = parts.look;
  if (L.sohei || L.kosode || L.nanban || namedKacchu(L)) return parts;
  // 本物の胴丸には段・糸・金具が揃っているので、重ねる形を作らない。
  if (DOMARU.ready && (wantsDomaru(L) || crowdDomaru(L))) return parts;
  const out = { ...parts }, T = L.tier || 0, b = [0.94, 1, 1.05, 1.08][T];
  const lac = L.armor ?? 0x24221f, lace = L.lace ?? 0x5a4630;
  if (!armorBox) armorBox = new THREE.BoxGeometry(1, 1, 1);
  const enhance = (name, build) => {
    const src = parts[name];
    if (!src) return;
    const key = [name, src.uuid, lac, lace, T, L.hat, (L.vi || 0) % 6].join('|');
    if (!nearArmorGeos.has(key)) {
      const extra = [];
      const add = (g, col, mk, reg) => extra.push(armorPaint(g, col, { mk, reg, dirt: L.dirt ?? 0.35 }));
      const box = (w, h, d, x, y, z, col, mk, ry = 0, rz = 0) =>
        add(armorAt(armorBox.clone().scale(w, h, d), x, y, z, 0, ry, rz), col, mk, mk === MK.cloth ? 'cord' : 'lacq');
      // 横の縁を、板と板が重なる厚みとして打ち出す。
      const band = (r, y, span, a, squash = 1, x = 0, z = 0) => {
        const g = new THREE.CylinderGeometry(r, r + 0.002, 0.009, Math.max(3, Math.ceil(span * 4)), 1, true, a, span);
        g.scale(1, 1, squash); g.translate(x, y, z);
        add(g, lac, MK.lac, 'lacq');
      };
      build({ add, box, band });
      if (extra.length) {
        // 部品（8 bit の色）は float に戻した写しで束ねる
        const srcF = src.clone(); dequantize(srcF, 'color'); dequantize(srcF, 'col2');
        const g = mergeGeometries([srcF, ...extra]);
        srcF.dispose();
        for (const e of extra) e.dispose();
        nearArmorGeos.set(key, g);
      } else nearArmorGeos.set(key, src);
    }
    out[name] = nearArmorGeos.get(key);
  };
  enhance('torso', ({ box, band }) => {
    // 桶側は縦矧の板を保ち、腹巻・侍は札板の六段を強調する。
    const oke = T === 0 && (L.vi || 0) % 3 !== 2;
    // 足軽の桶側（横矧）は板の段と縁を形に持つので、重ねない
    if (oke && !L.doStyle) return;
    const profile = [[0.2, 0.88], [0.205, 0.95], [0.212, 1.05], [0.232, 1.18], [0.248, 1.3], [0.238, 1.38]];
    for (let row = 0; row < (oke ? 2 : 5); row++) {
      const y = oke ? 0.94 + row * 0.37 : 0.977 + row * 0.097;
      let r = 0.248;
      for (let j = 1; j < profile.length; j++) if (y <= profile[j][1]) {
        const [ra, ya] = profile[j - 1], [rb, yb] = profile[j];
        r = ra + (rb - ra) * (y - ya) / (yb - ya); break;
      }
      band(r * b + 0.006, y, Math.PI * 2, 0, 0.8);
      // 鋲頭は小さく、漆の中で鉄だけが鈍く光る。
      for (const a of [-0.65, 0.65, Math.PI - 0.65, Math.PI + 0.65])
        box(0.007, 0.007, 0.004, Math.sin(a) * (r * b + 0.009), y + 0.015, Math.cos(a) * (r * b + 0.009) * 0.8, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('hips', ({ box, band }) => {
    // 足軽の草摺は、段の縁と素懸の糸を形に持つ（units_model.js）
    if (T === 0) return;
    const np = T === 0 ? 5 : 7, step = Math.PI * 2 / np;
    for (let k = 0; k < np; k++) {
      const a = k * step + (np === 5 ? Math.PI / 5 : 0) + Math.PI;
      for (let row = 0; row < 5; row++) {
        const y = 0.644 + row * 0.048, r = (0.27 - 0.056 * (y - 0.63) / 0.27) * b + 0.01;
        band(r, y, step * 0.94, a - step * 0.47, 0.86);
        // 二列の素懸縅。糸を斜めに交差させ、段をつなぐ。
        for (const sd of [-1, 1]) {
          const th = a + sd * step * 0.19;
          box(0.006, 0.031, 0.005, Math.sin(th) * (r + 0.004), y + 0.021, Math.cos(th) * (r + 0.004) * 0.86, lace, MK.cloth, th, sd * 0.23);
        }
      }
    }
  });
  // 袖の折り返しと縅は共通の板に含める。筒状の帯を二重に足さない。
  if (T >= 1) enhance('thigh', ({ box }) => {
    // 佩楯は布の上の独立した小札。膝の曲げを妨げない長さ。
    for (let row = 0; row < 3; row++) for (let j = 0; j < 4; j++) {
      const a = (j - 1.5) * 0.32, y = -0.075 - row * 0.069;
      box(0.028 * b, 0.048, 0.006, Math.sin(a) * 0.12 * b, y, Math.cos(a) * 0.12 * b + 0.017, lac, MK.lac, a);
    }
  });
  for (const side of ['P', 'N']) enhance('fore' + side, ({ box }) => {
    // 篠籠手の細い鉄の筋。素肌の腕には部品自体が無いので付けない。
    if (T === 0 || L.hero) return;
    const sd = side === 'P' ? 1 : -1;
    for (const da of [-0.3, 0.3]) {
      const a = sd * Math.PI * 0.65 + da;
      box(0.006, 0.175, 0.006, Math.sin(a) * 0.054 * b, -0.385, Math.cos(a) * 0.054 * b, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('leg', ({ box }) => {
    // 臑当の蝶番を留める鋲。足軽の脚絆だけの者には付けない。
    if (T === 0 && (L.vi || 0) % 4 === 3) return;
    for (const y of [-0.065, -0.23]) for (const a of [-0.48, 0.48]) {
      const r = (0.081 - (-y - 0.03) * 0.016 / 0.22) * b;
      box(0.006, 0.007, 0.005, Math.sin(a) * (r + 0.003), y, Math.cos(a) * (r + 0.003) - 0.004, 0x3a3e42, MK.iron, a);
    }
  });
  enhance('head', ({ add }) => {
    if (!(L.hat || '').startsWith('kabuto') || /namazu|suwa|bari/.test(L.hat)) return;
    // 筋兜の鉢は、絵の筋に加えて細い鉄を立てる。頭形は三枚の継ぎ板。
    const zunari = L.hat === 'kabuto' && (L.vi || 0) % 2 === 1, n = zunari ? 3 : 12;
    for (let j = 0; j < n; j++) {
      const g = new THREE.TorusGeometry(0.193, 0.0025, 3, 7, Math.PI / 2 - 0.13);
      g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); g.rotateY(j * Math.PI * 2 / n);
      g.scale(0.84, (zunari ? 0.86 : 0.94) * 0.9, 1.05 * 0.84);
      g.translate(0, 1.654, 0.0016);
      add(g, 0x3a3e42, MK.iron, 'iron');
    }
  });
  return out;
}

// 部品の置き方（本人の組み方と兵のまとめ方で同じ）：put(名, 骨, 形, 行列)
function layParts(P, L, put) {
  const R = SRC.rest, RD = SRC.radius;
  const { fitT, fitH } = SRC;
  put('torso', 'Spine1', P.torso, fitT);
  // 鎧下の肩と背の上（胴の上から小袖の肩がのぞく）。見本の体の襟の装備の名残を覆う
  if (!L.sohei && SRC && !(L.tier >= 1 && DOMARU.ready && !L.nanban)) put('yoke', 'Spine2', yokeGeo(L), fitT);
  // 草摺は腰に。陣羽織・母衣・袖は胸に（袖は肩から紐で吊るすので、胴について行き、腕を上げても顔の横へ立たない）
  put('hips', 'Hips', P.hips, fitT);
  put('haori', 'Spine2', P.haori, fitT);
  put('back', 'Spine2', P.back, fitT);
  // 腰の刀は胴の下の骨に（録った動きの腰の骨は大きくひねっているので、腰の骨に付けると刀が横へ突き出る）
  put('koshi', 'Spine1', P.koshi, namedKacchu(L) ? SRC.fitK : fitT);
  // 指物の竿（受筒を支点にしなる。背の旗は竿に付ける）
  put('pole', 'Spine2', P.pole, fitT);
  put('sodeP', 'Spine2', P.sodeP, fitT);
  put('sodeN', 'Spine2', P.sodeN, fitT);
  // 裹頭は実写の顔に合わせて下で作る（units.js の遠目の裹頭は使わない）
  // 僧兵の鉢巻も実写の頭に沿わせて下で作る
  // 鉢巻は誰のも実写の頭に沿わせて下で作る（遠目の形の鉢巻は頭から浮いた白い輪に見える）
  put('hat', 'Head', (L.sohei && L.hat === 'kato') || L.hat === 'hachimaki' ? null : P.head, fitH);
  put('face', 'Head', P.face, fitH);
  // 腕：籠手（二の腕・前腕・手甲）。+x が本編の「右手」（槍を持つ手）
  const rA = (nm, ours) => Math.max(1, ((RD[nm] || { r: ours }).r * 1.12) / ours);
  for (const [sd, side] of [[1, 'Right'], [-1, 'Left']]) {
    const S_ = sd > 0 ? 'P' : 'N';
    put('upper' + S_, side + 'Arm', P['upper' + S_], limbFit(side + 'Arm', side + 'ForeArm', 0.27, rA(side + 'Arm', 0.058)));
    // 籠手の無い腕：小袖の袖（肩山から肘まで、ゆったりした筒）。見本の体の肩当ての名残を覆う
    if (!P['upper' + S_] && !L.sohei && SRC) put('sleeve' + S_, side + 'Arm', sleeveGeo(L), limbFit(side + 'Arm', side + 'ForeArm', 0.27, 1));
    // 本人の前腕の籠手は実の太さ（中の体の前腕は描かない。bodyMaterial の nh）
    put('fore' + S_, side + 'ForeArm', P['fore' + S_], limbFit(side + 'ForeArm', side + 'Hand', 0.23, L.hero ? 1 : rA(side + 'ForeArm', 0.05), 0.27));
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
  if (L.hat === 'hachimaki') put('kato', 'Head', soheiHachi(L.sohei ? L : { kato: L.hachi || 0x958b77 }), fitH);
}

// 本人：units.js と同じ甲冑の部品を骨ごとに付ける
function dressParts(h, P, L) {
  const named = L.hero || isNamed(L);
  layParts(P, L, (k, nm, geo, fit) => {
    // 顔：本人と名のある武将は実写の顔
    if (k === 'face' && named && HEAD) { h.parts.face = scanFace(h, L.hero ? 'player' : L.face, L, P.F, true); return; }
    // 本人の腕の籠手：一人称で目の前に来ると鎖の目が大きな丸に見えるので、一人称の時だけ細かく編む
    // 前腕と手甲は本人用の細かい形（units_model.js heroKote）で鎖の目を細かく貼ってあるので、二の腕だけ
    h.parts[k] = attachBody(h, nm, geo, fit, L.nanban ? nanbanMaterial() : L.hero && /^upper[PN]$/.test(k) ? fpArmMat() : UNIT_MAT);
  });
  // 草摺を板ごとの形に分け、腰の部品の子にする（板ごとに揺らす）
  if (h.parts.hips && !L.sohei) { const a = performance.now(); splitKusazuri(h, L); const TX = HSTAT.tx || (HSTAT.tx = {}); TX.kz = +((TX.kz || 0) + performance.now() - a).toFixed(1); }
}
// 草摺の形を、揺糸の帯と板一枚ずつに分ける（形は元の形ごとに覚える）
const kzSplit = new Map();
function splitKusazuri(h, L) {
  const hp = h.parts.hips, g = hp.geometry;
  if (!kzSplit.has(g.uuid)) {
    const KP = kusaPlates(L), src = g.index ? g.toNonIndexed() : g, pos = src.attributes.position;
    const groups = Array.from({ length: KP.np + 1 }, () => []);
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      groups[plateOf(x, y, z, KP) + 1].push(t);
    }
    const pick = (list) => {
      const o = new THREE.BufferGeometry();
      for (const [nm, at] of Object.entries(src.attributes)) {
        const n = at.itemSize, arr = new at.array.constructor(list.length * 3 * n);
        list.forEach((t, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(j * 3 + v) * n + c] = at.array[(t + v) * n + c]; });
        o.setAttribute(nm, new THREE.BufferAttribute(arr, n, at.normalized));
      }
      o.computeBoundingSphere();
      return o;
    };
    kzSplit.set(g.uuid, groups.map(pick));
  }
  const G = kzSplit.get(g.uuid);
  hp.geometry = G[0];
  h.kzMesh = [];
  for (let k = 1; k < G.length; k++) {
    const m = new THREE.Mesh(G[k], hp.material);
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false;
    hp.add(m); h.kzMesh.push(m);
  }
}

// ---- 名のある武将：本物の胴丸の上に、その人の兜・実写の顔・陣羽織（背に家紋）・母衣・太刀と脇差 ----
const NAMED_KEEP = new Set(['hat', 'haori', 'back', 'koshi', 'pole']);
function dressNamed(h, P, L) {
  layParts(P, L, (k, nm, geo, fit) => {
    if (k === 'face') { if (HEAD) { h.parts.face = scanFace(h, L.face, L, P.F, true); if (h.parts.face && L.menpoScan) { const a = performance.now(); if (h.parts.kabuto && KB.menpo) dressMenpo(h); else scanMenpo(h.parts.face, L.face, L.menpoScan); const TX = HSTAT.tx || (HSTAT.tx = {}); TX.menpo = +((TX.menpo || 0) + performance.now() - a).toFixed(1); } } return; }
    // 兜は少し深くかぶる（眉庇が眉の上に来るように）
    // 兜はスキャンの胴丸の兜（本人と同じ作り）を使い、この人の形の兜からは前立・脇立・後立・毛だけを取って載せる
    // 本物の兜の人は、前立も兜の側で付ける（dressKabuto）ので、この形からは何も取らない
    if (k === 'hat' && h.parts.kabuto) return;
    if (k === 'hat') { const o = CREST_OFF; geo = crestOnly(geo); fit = fit.clone().multiply(new THREE.Matrix4().makeTranslation(0, o.y, o.z)); }
    if (NAMED_KEEP.has(k)) h.parts[k] = attachBody(h, nm, geo, fit);
  });
  h.F = P.F;
  // 陣羽織の背の家紋（絵の一枚にない家の紋も描けるよう、武将ごとに小さな絵を作る）
  const hp = h.parts.haori;
  const gd = GENERALS[L.face.slice(2)] || {};
  const mon = L.haoriMon || gd.mon || L.mon;
  if (hp && mon && mon !== 'none') {
    const a0 = performance.now();
    const dm = monDecal(mon, L.haoriMonCol || 0xe6dfcf);
    const TX = HSTAT.tx || (HSTAT.tx = {}); TX.mon = +((TX.mon || 0) + performance.now() - a0).toFixed(1);
    if (dm) { dm.castShadow = false; hp.add(dm); h.parts.mon = dm; }
  }
}
// 兜の形から、鉢・錣・吹返し・眉庇を除き、前立などの飾りだけを残す（三角の中心で選ぶ）
// 残す物：白い毛（諏訪法性の白熊）、眉庇より上で金の物、鉢から離れて立つ物（鹿角・鯰尾・天衝）
const CREST_OFF = { y: -0.033, z: -0.03 };   // y は兜の下げ（HELM_FIT.dy）に合わせる
const crestGeos = new Map();
function crestOnly(g) {
  if (!g) return g;
  if (crestGeos.has(g.uuid)) return crestGeos.get(g.uuid);
  const src = g.index ? g.toNonIndexed() : g, pos = src.attributes.position, col = src.attributes.color, mtl = src.attributes.mtl;
  const keep = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    let x = 0, y = 0, z = 0, r = 0, gg = 0, b = 0, mk = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(i + k) / 3; y += pos.getY(i + k) / 3; z += pos.getZ(i + k) / 3; if (col) { r += col.getX(i + k) / 3; gg += col.getY(i + k) / 3; b += col.getZ(i + k) / 3; } }
    if (mtl) mk = Math.floor(mtl.getX(i)) % 8;
    const fur = col && r > 0.7 && gg > 0.7 && b > 0.62;
    const d = Math.hypot(x, y - 1.654, z - 0.01);
    if (fur || (y > 1.715 && (mk === 4 || d > 0.2))) keep.push(i, i + 1, i + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const nm of Object.keys(src.attributes)) {
    const a = src.attributes[nm], arr = new a.array.constructor(keep.length * a.itemSize);
    keep.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]; });
    out.setAttribute(nm, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  out.computeBoundingSphere();
  crestGeos.set(g.uuid, out);
  return out;
}
// 家紋の絵：旗の絵（textures.js）から紋の形だけを抜き、紋の色で塗る
const monMats = new Map();
let MON_GEO = null;
function monDecal(kind, col) {
  const key = kind + '|' + col;
  if (!monMats.has(key)) {
    const W = 256, H = 400, cy = Math.round(H * 0.32);
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    // 読み出す絵は、画面の描画（GPU）でなく手元（CPU）の絵に描く：GPU の絵からの読み出しは、混んだ機械では一枚に何秒もかかり、戦の始めに固まる元だった
    const sg = src.getContext('2d', { willReadFrequently: true });
    drawMon(sg, kind, W, H);
    const d = sg.getImageData(0, cy - 128, W, 256).data;
    // 地の色（四隅）から離れた所が紋
    const bg = [d[(10 * W + 128) * 4], d[(10 * W + 128) * 4 + 1], d[(10 * W + 128) * 4 + 2]];
    const out = document.createElement('canvas'); out.width = out.height = 256;
    const og = out.getContext('2d', { willReadFrequently: true }), img = og.createImageData(256, 256);
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
// swK0..6：草摺の板一枚ずつの骨（腿に押されて板ごとに跳ね、遅れて揺れる）
const XB = { swHips: 'Hips', swSodeP: 'Spine2', swSodeN: 'Spine2', swHaori: 'Spine2', swBack: 'Spine2', swHat: 'Head', swPole: 'Spine2', swK0: 'Hips', swK1: 'Hips', swK2: 'Hips', swK3: 'Hips', swK4: 'Hips', swK5: 'Hips', swK6: 'Hips' };
// 草摺の板の並び（units.js の bodyGeometry と同じ）：足軽は五枚、侍から七枚。板の真ん中の向き（前 +z が 0）
const kusaPlates = (L) => { const np = (L.tier || 0) === 0 ? 5 : 7, off = np === 5 ? Math.PI / 5 : 0; return { np, off, c: (k) => (k / np) * Math.PI * 2 + off + Math.PI }; };
function plateOf(x, y, z, KP) {
  if (y > 0.885) return -1;   // 揺糸の帯は腰の骨のまま
  let a = Math.atan2(x, z) - KP.off - Math.PI;
  const st = (Math.PI * 2) / KP.np;
  let k = Math.round(a / st) % KP.np; if (k < 0) k += KP.np;
  return k;
}
const ALLB = [...CB, ...Object.keys(XB)];
const PART_BONE = { hips: 'swHips', sodeP: 'swSodeP', sodeN: 'swSodeN', haori: 'swHaori', back: 'swBack', hat: 'swHat', pole: 'swPole' };
const crowdGeos = new Map();
let crowdInv = null;
// 同じ骨でも、胴丸と体は着せる時の逆行列が違う。違う逆行列だけ別の参照枠を
// 一つの骨格に残す。重み付きの頂点を焼き直さず、元と同じ変形・法線・影を保つ。
const humanInv = [], humanGeoMaps = new Map(), humanMappedGeos = new WeakSet();
function initHumanPalette() {
  if (crowdInv) return;
  crowdInv = ALLB.map((nm) => restMatrix(XB[nm] || nm).clone().invert());
  humanInv.push(...crowdInv);
}
function humanBoneMap(names, inverses) {
  return names.map((nm, i) => {
    let at = ALLB.findIndex((n, j) => n === nm && humanInv[j].equals(inverses[i]));
    if (at < 0) { at = ALLB.length; ALLB.push(nm); humanInv.push(inverses[i]); }
    return at;
  });
}
function humanGeometryMap(indices) {
  const key = indices.join(',');
  if (humanGeoMaps.has(key)) return humanGeoMaps.get(key);
  const cache = new WeakMap(), unchanged = indices.every((at, i) => at === i);
  const remap = (geo) => {
    if (unchanged) return geo;
    if (humanMappedGeos.has(geo)) return geo;
    if (cache.has(geo)) return cache.get(geo);
    // 位置・法線・絵の座標は元の形と共有し、骨番号だけを作る（一度だけ）。
    const g = new THREE.BufferGeometry();
    g.index = geo.index; g.attributes = { ...geo.attributes };
    g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;
    g.groups = geo.groups; g.drawRange = geo.drawRange;
    g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
    g.userData = { ...geo.userData };
    const src = geo.attributes.skinIndex, a = new Uint16Array(src.count * 4);
    for (let i = 0; i < src.count; i++) for (let k = 0; k < 4; k++) a[i * 4 + k] = indices[gc(src, i, k)];
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a, 4));
    cache.set(geo, g); humanMappedGeos.add(g);
    return g;
  };
  humanGeoMaps.set(key, remap);
  return remap;
}
// 共有し終えた骨格だけを対象にする。体・具足・手が別の骨格でも、同じ印で全て更新する。
function cacheHumanSkeleton(h) {
  // 鳥取の坂では、画面外への出入り・日送りで親の位置も変わる。
  // 古い骨と逆行列を持ち越さず、共有済みの骨格を描く時に通常どおり更新する。
  if (WORLD?.def.drawTimeUnitParts) return;
  const skeletons = new Set(), meshes = [];
  h.root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    skeletons.add(m.skeleton);
    const inverse = m.bindMatrixInverse.clone(), update = m.updateMatrixWorld;
    meshes.push({ mesh: m, inverse });
    m.updateMatrixWorld = function (force) {
      update.call(this, force);
      // 骨の絵は前回の世界座標を含む。逆行列もその時点に揃え、移動・旋回は今の modelMatrix で描く。
      // bindMode と骨の世界行列は変えず、指や武器の位置を求める処理も従来どおり。
      if (!h.skelDirty) this.bindMatrixInverse.copy(inverse);
    };
  });
  const update = function () {
    if (!h.skelDirty) return;
    for (const sk of skeletons) THREE.Skeleton.prototype.update.call(sk);
    for (const part of meshes) part.inverse.copy(part.mesh.bindMatrixInverse);
    h.skelDirty = false;
  };
  for (const sk of skeletons) sk.update = update;
}
function shareHumanSkeleton(h) {
  const meshes = [], old = new Set();
  h.root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const sk = m.skeleton;
    const names = sk.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const indices = humanBoneMap(names, sk.boneInverses);
    meshes.push([m, humanGeometryMap(indices)]); old.add(sk);
  });
  // 全身型では使わない揺れる骨の枠は親の骨を置く（描かれない枠のために骨を増やさない）。
  const sk = new THREE.Skeleton(ALLB.map((nm) => h.bones[nm] || h.bones[XB[nm]]), humanInv.slice());
  h.skeleton = sk;
  for (const [m, remap] of meshes) {
    m.geometry = remap(m.geometry);
    if (WORLD?.def.shadowBoneOrder) m.userData.humanBoneMap = remap;
    // 距離で体や胴丸の形を替える時も同じ並びにする。形と番号は全員で使い回す。
    const before = m.onBeforeRender;
    m.onBeforeRender = function (r, scene, cam, geo, mat, group) { before.call(this, r, scene, cam, geo, mat, group); this.geometry = remap(this.geometry); };
    m.bind(sk, m.bindMatrix);
  }
  for (const sk0 of old) sk0.dispose();
  old.clear(); meshes.length = 0;   // 描く前の閉包が持ち続けるので、元の骨組み（骨と行列）を手放す
}

// 胴丸の侍に重ねる部品（兜・顔・母衣・陣羽織）
const DM_KEEP = new Set(['hat', 'back', 'haori', 'koshi', 'pole']);
// 束ねた人の形は「形」と「色」に分けて持つ：
//   形（position・normal・uv・skinIndex・skinWeight・index）は同じ甲冑の並びなら姿（色）が違っても一つを共有し、GPU にも一度しか送らない。
//   色（color・col2・mtl）だけ姿ごとに持つ（一頂点 10 byte）。前は姿ごとに全部（一頂点 84 byte）を作り、開戦後に 30 秒で 100MB 増えていた（iPhone の 2GB の壁）。
const crowdShapes = new Map();
if (typeof window !== 'undefined') window.__crowdDbg = () => ({ shapes: crowdShapes, geos: crowdGeos, stat: HSTAT });   // 確かめ用（記憶の数え）
function shapeId(geo) {
  if (geo.__shapeId) return geo.__shapeId;
  let h = 2166136261;
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619); };
  const hashF = (arr) => { const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length); for (let i = 0; i < u.length; i++) mix(u[i]); };
  const pos = geo.attributes.position.array, uv = geo.attributes.uv && geo.attributes.uv.array, nr = geo.attributes.normal && geo.attributes.normal.array;
  hashF(pos); if (uv) hashF(uv); if (nr) hashF(nr);
  if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) mix(ix[i]); }
  return (geo.__shapeId = pos.length + ':' + (h >>> 0).toString(36));
}
function colorId(geo) {
  if (geo.__colorId) return geo.__colorId;
  let h = 2166136261;
  const A = geo.attributes;
  for (const nm of ['color', 'col2', 'mtl']) {
    const a = A[nm] && A[nm].array; if (!a) { h = Math.imul(h ^ 7, 16777619); continue; }
    const u = (a.byteOffset & 3) || (a.byteLength & 3) ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619); }
  }
  return (geo.__colorId = (h >>> 0).toString(36));
}
const fitKey = (m) => m.elements.map((e) => Math.round(e * 1e4)).join(',');
const to8 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
function crowdGeometry(P, L, only = null, face = false, whole = false) {
  // 遠目で中の体を隠す時は、甲冑だけでなく袴と脛の布も残す。
  // 近景の体と二重にせず、形は既存の置き場と一体の描画を使う。
  if (whole && WORLD?.def.completeCrowdLegs && !L.sohei && !L.nanban) {
    P = { ...P, thigh: thighGeometry(P.look, false), leg: shinGeometry(P.look, false, 'coveredLeg') };
  }
  const list = [];
  layParts(P, L, (k, nm, geo, fit) => { if (geo && geo.attributes.position.count && (k === 'face' ? face : (!only || only.has(k)))) list.push({ bn: PART_BONE[k] || nm, geo, fit }); });
  // iPhone は鍵を中身（形と色）で：部品の形が表から外れて作り直されると uuid が変わり、同じ姿の束の形を何度も新しく作っていた（森部の乱戦で 8 回/秒。10/21）
  const kp = L.sohei ? 0 : ((L.tier || 0) === 0 ? 5 : 7);
  let shapeKey = null;
  const key = memTight() ? (shapeKey = list.map((p) => p.bn + ':' + shapeId(p.geo) + ':' + fitKey(p.fit)).join('|') + '|' + kp) + '#' + list.map((p) => colorId(p.geo)).join(',') : list.map((p) => p.geo.uuid).join('|');
  if (crowdGeos.has(key)) { HSTAT.crowdHit++; const g0 = crowdGeos.get(key); const sh0 = g0 && crowdShapes.get(g0.userData.shapeKey); if (sh0) sh0.use = performance.now(); return g0; }
  if (!shapeKey) shapeKey = list.map((p) => p.bn + ':' + shapeId(p.geo) + ':' + fitKey(p.fit)).join('|') + '|' + kp;
  let shape = crowdShapes.get(shapeKey);
  if (!shape) {
    const gs = [];
    for (const p of list) {
      const g = p.geo.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.index) { const n = g.attributes.position.count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
      g.applyMatrix4(p.fit);
      const n = g.attributes.position.count, bi = ALLB.indexOf(p.bn);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      // 母衣は肩で留め、裾ほど背の揺れを受ける。既存の胸と背の骨で布を曲げ、袋全体の硬い揺れを避ける。
      if (p.bn === 'swBack') {
        const P0 = p.geo.attributes.position, chest = ALLB.indexOf('Spine2');
        for (let i = 0; i < n; i++) {
          const w = Math.max(0, Math.min(1, (HORO_TOP - P0.getY(i)) / HORO_HEIGHT));
          si[i * 4 + 1] = chest; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
        }
      }
      // 草摺は板ごとの骨へ（体の座標の、まだ骨に合わせる前の位置で板を見分ける）
      if (p.bn === 'swHips' && !L.sohei) {
        const KP = kusaPlates(L), P0 = p.geo.attributes.position;
        // 板は上の端を腰に残し、裾ほど板の骨に従わせる（一枚の硬い板が蝶番で回るのでなく、歩くと裾がしなって揺れる）
        const hipB = ALLB.indexOf('swHips');
        for (let i = 0; i < n; i++) {
          const y = P0.getY(i), k = plateOf(P0.getX(i), y, P0.getZ(i), KP);
          if (k < 0) continue;
          const f = Math.pow(Math.min(1, Math.max(0, (0.885 - y) / 0.27)), 0.75);
          si[i * 4] = ALLB.indexOf('swK' + k); sw[i * 4] = 0.15 + 0.85 * f; si[i * 4 + 1] = hipB; sw[i * 4 + 1] = 0.85 - 0.85 * f;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      gs.push(g);
    }
    // 胴丸の兵は鉢巻などを別に着けるため、重ねる具足が一つも無い場合がある。
    // 空の束は結合へ渡さず、頂点ゼロの形として共有する。遠目の全身への切替は残す。
    const m = gs.length ? mergeGeometries(gs) : new THREE.BufferGeometry();
    if (!gs.length) {
      for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['skinWeight', 4]]) {
        m.setAttribute(name, new THREE.BufferAttribute(new Float32Array(0), size));
      }
      m.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(0), 4));
    }
    for (const g of gs) g.dispose();
    if (!m) { crowdGeos.set(key, null); return null; }
    quantizeAttr(m, 'skinWeight', Uint16Array, 65535);   // 骨の重みは 16 bit で足りる
    shape = { attrs: m.attributes, index: m.index, n: m.attributes.position.count, use: 0 };
    crowdShapes.set(shapeKey, shape);
    HSTAT.shapeMade++;
  }
  shape.use = performance.now();
  // 色だけ姿ごとに（8 bit）。部品の並びと頂点数は形と同じ
  const n = shape.n, color = new Uint8Array(n * 3), col2 = new Uint8Array(n * 3), mtl = new Float32Array(n);
  let o = 0;
  for (const p of list) {
    const A = p.geo.attributes, c = A.color, c2 = A.col2 || A.color, mk = A.mtl, cnt = A.position.count;
    if (o + cnt > n) break;
    for (let i = 0; i < cnt; i++) {
      const j = o + i;
      if (c) { color[j * 3] = to8(c.getX(i)); color[j * 3 + 1] = to8(c.getY(i)); color[j * 3 + 2] = to8(c.getZ(i)); }
      if (c2) { col2[j * 3] = to8(c2.getX(i)); col2[j * 3 + 1] = to8(c2.getY(i)); col2[j * 3 + 2] = to8(c2.getZ(i)); }
      if (mk) mtl[j] = mk.getX(i);
    }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  for (const k in shape.attrs) g.setAttribute(k, shape.attrs[k]);
  g.setIndex(shape.index);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
  g.setAttribute('col2', new THREE.BufferAttribute(col2, 3, true));
  g.setAttribute('mtl', new THREE.BufferAttribute(mtl, 1));
  g.boundingSphere = BSPH.clone();
  g.userData.use = performance.now(); g.userData.shapeKey = shapeKey;
  crowdGeos.set(key, g);
  HSTAT.crowdMade++;
  return g;
}
// 0〜1 の float の属性を、正規化した整数の属性に置き換える（three は normalized の属性を shader へ 0〜1 の float で渡す）
export function quantizeAttr(g, name, Ctor, max) {
  const a = g.attributes[name];
  if (!a || a.normalized || !(a.array instanceof Float32Array)) return;
  const src = a.array, out = new Ctor(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, src[i])) * max);
  g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, true));
}
// 長く使われていない束の形を手放す（開戦後に増える姿の種類ごとの形が、戦の間ずっと積み上がらないように）
let crowdSweepAt = 0;
const crowdSweep = { keys: null, left: 0, at: 0 };
function resetCrowdSweep() {
  crowdSweepAt = 0; crowdSweep.keys = null; crowdSweep.left = 0; crowdSweep.used = null;
}
function sweepCrowdGeos(now) {
  if (MEM_TIGHT) return;   // 貸出待ちの甲冑も共有の形を保持し、出入りで再転送しない。
  const work = crowdSweep;
  if (!work.keys) {
    if (now - crowdSweepAt < 5000) return;
    crowdSweepAt = work.at = now;
    work.keys = crowdGeos.keys(); work.left = crowdGeos.size;
    // 今だれか（見えていない人も）が着ている形は表に残す（外すと二重に作られる。h.cg）。巡回の初めに一度だけ集める
    const used = work.used || (work.used = new Set()); used.clear();
    if (ARMY) for (const u of ARMY.units) { const h = u.human; if (h && h.cg) for (const g of h.cg) used.add(g); }
    for (const h of humans) if (h.cg) for (const g of h.cg) used.add(g);
  }
  // 五秒ごとの全消去を重ねない。調べる数は三十二、返す数は四つ。半ミリ秒を超えたら次のコマへ。
  // 鍵だけを巡回し、候補の写しや [鍵, 形] の配列を毎回作らない。
  const t0 = performance.now(), idle = 20000;   // iPhone も 20 秒（8 秒では返した形をすぐ作り直し、そのごみが WebContent を押した。鍵が中身になったので同じ姿は一つ。10/21）
  let scanned = 0, freed = 0;
  while (work.left > 0 && scanned < 32 && freed < 4) {
    const next = work.keys.next();
    if (next.done) { work.left = 0; break; }
    work.left--; scanned++;
    const key = next.value, g = crowdGeos.get(key);
    // 巡回の途中で使われた形と、巡回開始後に作った形は残す。
    if (g?.userData && work.at - (g.userData.use || 0) >= idle) {
      if (work.used.has(g)) { if (memTight()) { g.dispose(); disposeShGeo(g); } continue; }   // 着ている人がいる形は表に残し、GPU の分だけ返す（描けば three が送り直す）
      g.dispose(); disposeShGeo(g); crowdGeos.delete(key);
      freed++;
    }
    if (performance.now() - t0 >= 0.5) break;
  }
  if (work.left === 0) {
    work.keys = null; work.used.clear();
    // 形（crowdShapes）は姿の組み合わせごとに増え続けていた（森部 2.5 分で 209 個・62MB。GPU へも同じだけ）。
    //   今どの束の形からも使われず、長く（iPhone 20 秒・ほか 60 秒）使っていない形は手放す（また要れば作り直す）
    if (crowdShapes.size > 24) {
      const live = new Set();
      for (const g of crowdGeos.values()) if (g && g.userData) live.add(g.userData.shapeKey);
      const keep = 60000;   // iPhone も 60 秒（作り直しのごみを減らす。10/21）
      for (const [sk, sh] of crowdShapes) if (!live.has(sk) && now - (sh.use || 0) > keep) crowdShapes.delete(sk);
    }
  }
}
const BSPH = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.9);
// 骨の入った体（一万一千の三角）の、遠目用の細かさを落とした形。同じ骨・同じ絵・同じ色で、形の輪郭はそのまま
//   10/8 測ると、森部の 30〜60m の兵 29 人の体だけで三十二万の三角＝一コマの三角の四割。30m 先では 4cm の凹凸は一画素より小さい。
//   頂点を格子（cell）でまとめる（部位をまたがない）。重みと絵の座標は代表の頂点の物、位置と向きは平均
// 部品の甲冑の足軽：見えない頭・足と、装備の中央に隠れた体の面を送らない。
// 首・肩・関節・草摺の隙間は残す。色や顔にかかわらず、同じ装備は形を共有する。
const coveredBodyGeos = new Map();
function coveredBodyGeo(geo, P, L) {
  if ((L.tier || 0) !== 0 || L.sohei || L.kosode || L.nanban || L.hero || namedKacchu(L)) return geo;
  const torso = !!P.torso && !L.backOpening && !L.rightOpening;
  const upperP = !!P.upperP?.attributes.position.count, upperN = !!P.upperN?.attributes.position.count;
  const thigh = !!P.thigh && (L.vi || 0) % 2 === 0;
  const key = [geo.uuid, torso, upperP, upperN, thigh].join('|');
  if (coveredBodyGeos.has(key)) return coveredBodyGeos.get(key);
  const pos = geo.attributes.position, part = geo.attributes.part, ix = geo.index;
  if (!part || !ix) return geo;
  const hidden = new Uint8Array(pos.count), w = new THREE.Vector3(), q = new THREE.Vector3();
  const toTorso = SRC.fitTi;
  const arms = {}, legs = {};
  for (const side of ['Right', 'Left']) {
    const r = SRC.radius[side + 'Arm']?.r || 0.058;
    arms[side] = limbFit(side + 'Arm', side + 'ForeArm', 0.27, Math.max(1, r * 1.12 / 0.058)).invert();
    const t = SRC.radius[side + 'UpLeg']?.r || 0.11;
    legs[side] = limbFit(side + 'UpLeg', side + 'Leg', 0.4, Math.max(1, t * 1.12 / 0.11)).invert();
  }
  for (let i = 0; i < pos.count; i++) {
    const p = part.getX(i);
    // 元から材質が捨てる部位。部位の境の面は三頂点とも隠れる時だけ除く。
    if (p > 3.5) { hidden[i] = 1; continue; }
    w.fromBufferAttribute(pos, i).applyMatrix4(SRC.bodyToRest);
    const side = w.x * SRC.rest.RightArm.x >= 0 ? 'Right' : 'Left';
    if (p === PART.torso && torso) {
      q.copy(w).applyMatrix4(toTorso);
      hidden[i] = q.y > 0.99 && q.y < 1.29 && Math.abs(q.x) < 0.17 && Math.abs(q.z) < 0.14 ? 1 : 0;
    } else if (p === PART.arm && (side === 'Right' ? upperP : upperN)) {
      q.copy(w).applyMatrix4(arms[side]);
      // 籠手の筒の端と、外へはみ出す小袖は残す。
      hidden[i] = q.y < -0.07 && q.y > -0.21 && Math.hypot(q.x, q.z) < 0.044 ? 1 : 0;
    } else if (p === PART.leg && thigh) {
      q.copy(w).applyMatrix4(legs[side]);
      // 足軽の佩楯は前だけ。後ろ・脇・膝の袴は消さない。
      hidden[i] = q.y < -0.12 && q.y > -0.23 && q.z > 0.045 && Math.abs(q.x) < q.z * 0.45 && Math.hypot(q.x, q.z) < 0.095 ? 1 : 0;
    }
  }
  const keep = [];
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    if (!(hidden[a] && hidden[b] && hidden[c])) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  // 頂点の属性は原本と共有し、描く面の番号だけ替える。
  for (const [name, a] of Object.entries(geo.attributes)) g.setAttribute(name, a);
  g.setIndex(keep); g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
  coveredBodyGeos.set(key, g);
  HSTAT.bodyCovered = [ix.count / 3, keep.length / 3];
  return g;
}
const bodyLoGeos = new Map();
function bodyLoGeo(geo, frac) {
  const key = geo.uuid + '|' + frac;
  let g = bodyLoGeos.get(key);
  if (g !== undefined) return g;
  g = null;
  if (geo.index && geo.attributes.position) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox, cell = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * frac;
    const pos = geo.attributes.position, nor = geo.attributes.normal, part = geo.attributes.part, n = pos.count;
    const map = new Map(), rep = new Int32Array(n), cnt = [], sum = [];
    for (let i = 0; i < n; i++) {
      const k = Math.floor((pos.getX(i) - bb.min.x) / cell) + ',' + Math.floor((pos.getY(i) - bb.min.y) / cell) + ',' + Math.floor((pos.getZ(i) - bb.min.z) / cell) + ',' + (part ? part.getX(i) : 0);
      let j = map.get(k);
      if (j === undefined) { j = cnt.length; map.set(k, j); cnt.push(0); sum.push([0, 0, 0, 0, 0, 0, i]); }
      rep[i] = j; cnt[j]++; const s = sum[j];
      s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i);
      if (nor) { s[3] += nor.getX(i); s[4] += nor.getY(i); s[5] += nor.getZ(i); }
    }
    const m = cnt.length, out = new THREE.BufferGeometry();
    // 元の形は詰めた（交互に並べた・整数に縮めた）並びの事があるので、getX〜getW で読んで、浮動小数の並びに書き直す
    const GET = ['getX', 'getY', 'getZ', 'getW'];
    for (const [name, a] of Object.entries(geo.attributes)) {
      const A = name === 'skinIndex' ? new Uint16Array(m * a.itemSize) : new Float32Array(m * a.itemSize);
      for (let j = 0; j < m; j++) { const src = sum[j][6]; for (let c = 0; c < a.itemSize; c++) A[j * a.itemSize + c] = a[GET[c]](src); }
      const B = name === 'skinIndex' ? new THREE.Uint16BufferAttribute(A, a.itemSize) : new THREE.BufferAttribute(A, a.itemSize);
      if (name === 'position') for (let j = 0; j < m; j++) B.setXYZ(j, sum[j][0] / cnt[j], sum[j][1] / cnt[j], sum[j][2] / cnt[j]);
      if (name === 'normal') for (let j = 0; j < m; j++) { v0.set(sum[j][3], sum[j][4], sum[j][5]).normalize(); B.setXYZ(j, v0.x, v0.y, v0.z); }
      out.setAttribute(name, B);
    }
    const ix = geo.index, I = [], seen = new Set();
    for (let t = 0; t < ix.count; t += 3) {
      const a = rep[ix.getX(t)], b = rep[ix.getX(t + 1)], c = rep[ix.getX(t + 2)];
      if (a === b || b === c || a === c) continue;
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), k = lo * m * m + (a + b + c - lo - hi) * m + hi;
      if (seen.has(k)) continue; seen.add(k);
      I.push(a, b, c);
    }
    out.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    out.boundingBox = geo.boundingBox; if (geo.boundingSphere) out.boundingSphere = geo.boundingSphere;
    // 減りが少なければ使わない（元の形のまま）
    if (I.length / 3 < (ix.count / 3) * 0.7) g = out; else out.dispose();
  }
  bodyLoGeos.set(key, g);
  return g;
}
// 画面用の体は従来の距離で選び、本人は細かい形。高画質の影だけ、本人と五メートル以内は中、その先は粗くする。
function bodyLod(m, h) {
  const hi = m.geometry, mid = bodyLoGeo(hi, 1 / 70), lo = bodyLoGeo(hi, 1 / 42);
  HSTAT.bodyLo = [hi.index && hi.index.count / 3, mid && mid.index.count / 3, lo && lo.index.count / 3];
  if (!mid && !lo) return;
  m.onBeforeRender = (r, s, cam) => {
    if (cam.isOrthographicCamera) {
      if (true) {
        // 光のカメラとの距離ではなく、直前の画面描画で測った距離を使う。初回は中の形を残す。
        const far = !h.u.isPlayer && h.bodyD2 > 25;
        m.geometry = HUM.lodOff ? hi : (far && lo) || mid || hi;
      }
      return;
    }
    if (qualityKeeper(h.u)) { m.geometry = hi; return; }
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    h.bodyD2 = d2;
    // 体の形の切り替え：高は 14m で中・32m で粗く（以前は 22m・42m）、中はさらに近く。900p で 14m の人は背丈 80px ほどで、細かい形の差は見えない
    const q2 = 0;
    const fF = q2 === 1 ? 18 : q2 === 0 ? 24 : 42, mF = q2 === 1 ? 6 : q2 === 0 ? 8 : 22;
    const far = h.bodyFar ? fF - 2 : fF, mfar = h.bodyMid ? mF - 1 : mF;   // 境目で行き来しないよう 1〜2m の幅
    h.bodyFar = d2 > far * far || HUM.bodyLoD === 2; h.bodyMid = d2 > mfar * mfar || HUM.bodyLoD === 1;
    const want = HUM.lodOff ? hi : (h.bodyFar && lo) || (h.bodyMid && mid) || hi;   // lodOff：前と比べて測る時だけ
    if (m.geometry !== want) m.geometry = want;
  };
}
// 影の処理は画面用の onBeforeRender を呼ばない。形の転送より前に切り替え、画面用の形は必ず戻す。
// 骨番号の並べ替えも shareHumanSkeleton の包みを通す。顔・歯・目・兜には触らない。
const BODY_SHADOW_CAMERA = { isOrthographicCamera: true };
export function humanShadowLod(scene, shadow) {
  if (WORLD?.scene !== scene || (shadow && false)) return;
  for (const h of humans) {
    const m = h.body;
    if (shadow) {
      if (!h.root.visible) continue;
      if (m.castShadow) { h.bodyScreenGeometry = m.geometry; m.onBeforeRender(null, scene, BODY_SHADOW_CAMERA); }
      // 具足・胴丸も影では升でまとめた軽い形（影の画素 2cm に合わせた 3〜4cm の升。輪郭は同じ）。画面用の形は描き終えたら戻す
      //   （影では onBeforeRender が呼ばれず、画面で選んだ細かい形（具足 1 万・胴丸 4 万の三角）をそのまま影にも描いていた。10/21 熱）
      const ar = h.parts.armor;
      if (window.__apx?.shfull) continue;   // x_shfull：試しで切る（前と比べる）
      if (ar && ar.castShadow && ar.visible && h.cg) {
        const base = h.lodFar || h.loanedDomaru ? h.geoFar : h.cg[1];
        let g = base && shadowGeoOf(base);
        if (g && ar.userData.humanBoneMap) g = ar.userData.humanBoneMap(g);
        if (g && g !== ar.geometry) { h.armorScreenGeometry = ar.geometry; ar.geometry = g; }
      }
      const dm = h.parts.domaru;
      if (dm && dm.castShadow && dm.visible && DM) {
        let g = shadowGeoOf(DM.lo);
        // 影の形も、着せた時と同じ骨番号へ。元の番号では手足の影が原点へ伸びる。
        if (dm.userData.humanBoneMap) g = dm.userData.humanBoneMap(g);
        if (g !== dm.geometry) { h.domaruScreenGeometry = dm.geometry; dm.geometry = g; }
      }
    } else {
      if (h.bodyScreenGeometry) { m.geometry = h.bodyScreenGeometry; h.bodyScreenGeometry = null; }
      if (h.armorScreenGeometry) { h.parts.armor.geometry = h.armorScreenGeometry; h.armorScreenGeometry = null; }
      if (h.domaruScreenGeometry) { h.parts.domaru.geometry = h.domaruScreenGeometry; h.domaruScreenGeometry = null; }
    }
  }
}
// 影に描く形：升（1/48）でまとめた軽い形。元の形に持たせ、元の形を手放す時に一緒に手放す（sweepCrowdGeos）
function shadowGeoOf(base) {
  const ud = base.userData;
  if (ud.shGeo === undefined) ud.shGeo = bodyLoGeo(base, 1 / 48) || null;
  return ud.shGeo || base;
}
const disposeShGeo = (g) => { const sg = g.userData && g.userData.shGeo; if (sg) { sg.dispose(); bodyLoGeos.delete(g.uuid + '|' + (1 / 48)); g.userData.shGeo = undefined; } };
// 近くは細かい形、遠く（HUM.lod より先）と影は軽い形（描く直前に距離で入れ替える）
function lodGeo(m, hi, lo, h = null) {
  if (!lo || hi === lo) return;
  m.onBeforeRender = (r, s, cam) => {
    // 遠い人（h.lodFar）は、体ごと一つにまとめた軽い形
    if (h && h.lodFar) { if (m.geometry !== h.geoFar) m.geometry = h.geoFar; return; }
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = false && !(h && h.u.isPlayer) ? 9 : HUM.lod;
    const want = !cam.isOrthographicCamera && (h && qualityKeeper(h.u) || d2 < near * near) ? hi : lo;
    if (m.geometry !== want) m.geometry = want;
  };
}
// 近くの兵の具足と着物：兵の材質（UNIT_MAT）に、一人ずつの使い込みを足す（四通り。材質は四つまで）
//   着物：日焼けの褪せ（肩ほど白っぽく）・汗じみ・裾の泥はね。漆：角の擦れと掻き傷、剥げ。陣笠：縁の欠けと雨じみ。どれも近くの兵だけ（遠くは元の材質のまま）
const CROWD_V = [[0.15, 0.45, 0.3, 1.7], [0.7, 0.95, 0.6, 4.3], [0.35, 1.35, 0.9, 7.1], [1.0, 0.7, 0.45, 2.9]];
const crowdMats = [];
// 汚れの斑の格子を一度だけ焼く。隣の奥行きを緑へ詰め、四種の材質・全員で約74KBを共用する。
// 奥行き32枚を横に並べ、各面の周囲一画素も巻き戻して線形補間の継ぎ目を防ぐ。
let crowdNoiseTex = null;
function crowdNoiseTexture() {
  if (crowdNoiseTex) return crowdNoiseTex;
  const width = 34 * 32, data = new Uint8Array(width * 34 * 2);
  const fract = (x) => x - Math.floor(x);
  for (let z = 0; z < 32; z++) for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) {
    const a = fract(((x + 31) % 32) * 0.3183099 + 0.1) * 17;
    const b = fract(((y + 31) % 32) * 0.3183099 + 0.1) * 17;
    for (let layer = 0; layer < 2; layer++) {
      const c = fract(((z + layer) % 32) * 0.3183099 + 0.1) * 17;
      data[(y * width + z * 34 + x) * 2 + layer] = Math.round(fract(a * b * c * (a + b + c)) * 255);
    }
  }
  crowdNoiseTex = new THREE.DataTexture(data, width, 34, THREE.RGFormat);
  crowdNoiseTex.minFilter = crowdNoiseTex.magFilter = THREE.LinearFilter;
  crowdNoiseTex.generateMipmaps = false; crowdNoiseTex.needsUpdate = true;
  return crowdNoiseTex;
}
const CROWD_NOISE_GLSL = `
uniform sampler2D uCrowdNoise;
float crowdNoise(vec3 p) {
  vec3 q = mod(p, 32.0), i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + f.xy + 1.5) / vec2(1088.0, 34.0);
  vec2 layers = texture2D(uCrowdNoise, uv + vec2(i.z * 34.0 / 1088.0, 0.0)).rg;
  return mix(layers.r, layers.g, f.z);
}
`;
// 追加の表面処理は近い120人まで。十五メートル以内は端末によらず保つ。
const CROWD_DETAIL_MAX = 120;
const CROWD_DETAIL_NEAR = 17;
function nearCrowdMat(v) {
  if (crowdMats[v]) return crowdMats[v];
  const m = UNIT_MAT.clone();
  if (true) m.defines = { ...m.defines, NEAR_85: 1 };
  const ob = UNIT_MAT.onBeforeCompile, CV = { value: new THREE.Vector4(...CROWD_V[v]) };
  const noise = { value: crowdNoiseTexture() };
  m.onBeforeCompile = (sh, r) => {
    ob.call(UNIT_MAT, sh, r);
    sh.uniforms.uCV = CV; sh.uniforms.uGrimeC = GRIME; sh.uniforms.uCrowdNoise = noise;
    // 兵の漆は使い込んだ鈍い照り（新しい樹脂のように光らせない）。雨でも艶は少しだけ増す
    sh.fragmentShader = sh.fragmentShader.replace('float roughnessFactor = mix(mkRough(mkA), mkRough(mkB), txA.r);', `float roughnessFactor = mix(mkA == 1 ? ${'0.22'} : mkRough(mkA), mkB == 1 ? ${'0.22'} : mkRough(mkB), txA.r);`)
      .replace('roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : 0.4);', 'roughnessFactor *= 1.0 - uWet * (mkA == 0 || mkA == 6 ? 0.25 : mkA == 1 ? 0.22 : 0.4);')
      .replace('roughnessFactor = mix(0.3 * (1.0 - uWet * 0.4), 0.78, clamp(worn, 0.0, 1.0));', `roughnessFactor = mix(${'0.18'} * (1.0 - uWet * 0.22), 0.82, clamp(worn, 0.0, 1.0));`);
    peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
    sh.vertexShader = 'varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vObjN = objectNormal;');
    sh.fragmentShader = 'uniform vec4 uCV;\nuniform float uGrimeC;\nuniform sampler2D uPD;\nvarying vec3 vObjN;\nfloat pdH, pdR, pdMud, pdWear, pdCavity, pdCord;\n' + PEOPLE_GLSL + sh.fragmentShader.replace('diffuseColor.rgb *= baseC;', `diffuseColor.rgb *= baseC;
      {
        // 写真の模様の細かな凹凸と色むら：布は麻の織り目、威糸は組紐の目、漆は細かな擦れで照りを斑に（近くの兵だけ）
        int mkD = txA.r > 0.5 ? mkB : mkA;
        vec3 pdT = pdTri(uPD, vObjP * 14.0, vObjN);
        pdH = 0.0; pdR = 0.0; pdMud = 0.0; pdWear = 0.0; pdCavity = 0.0;
        // 布と縅を区別する。佩楯のように二色の並びが逆の部品も含める。
        pdCord = mkD == 0 && (mkA == 1 || mkB == 1 || mkA == 3 || mkB == 3) ? 1.0 : 0.0;
        // 札の重なり・鋲の根元は空の光が届きにくい。既存の絵の谷を使い、直射光の照りは残す。
        if (mkD == 1 || mkD == 3) pdCavity = 1.0 - smoothstep(0.28, 0.7, txA.g);
        if (mkD == 0 || mkD == 6) {
          float d = mix(pdT.g, pdT.b, pdCord);
          pdH = d - 0.5;
          pdR = pdH * mix(0.12, 0.28, pdCord);
          diffuseColor.rgb *= 1.0 + pdH * mix(0.35, 0.5, pdCord);
        } else if (mkD == 1) {
          // 同じ読み取りを漆の粒子・照り・擦れに共用し、三方向の追加読み取りを省く。
          float d = pdT.g;
          pdR = (d - 0.5) * 0.42;
          pdH = (pdT.r - 0.5) * 0.25;
          diffuseColor.rgb *= 1.0 + (d - 0.5) * 0.24;
        } else if (mkD == 2) {
          // 一体の軽い顔にも肌理を残す。実写の顔を増やさず、既存の読み取りを使う。
          pdH = (pdT.r - 0.5) * 0.22;
          pdR = (pdT.r - 0.5) * 0.12;
        } else if (mkD == 3 || mkD == 4) {
          // 鉄の磨き跡とざらつき。既に読んだ絵を照りと凹凸にも使う。
          pdR = (pdT.r - 0.5) * 0.35;
          pdH = (pdT.g - 0.5) * 0.45;
        }
      }
      {
        vec3 q = vObjP + vec3(uCV.w, uCV.w * 0.6, 0.0);
        float n1 = uVn(q * 7.0), n2 = uVn(q * 31.0 + 3.0), n3 = uVn(q * 120.0 + 9.0);
        int wornKind = txA.r > 0.5 ? mkB : mkA;
        if (wornKind == 1 || wornKind == 3) {
          // 打ち出した鉄板の浅い歪み。汚れに使う二つの斑を再利用し、均一な照りを崩す。
          // 漆の下の形なので色は変えず、法線だけを一ミリほど揺らす。泥の厚い所には出さない。
          pdH += ((n1 - 0.5) * 0.9 + (n2 - 0.5) * 0.3) * (1.0 - dd);
          pdR += (n2 - 0.5) * 0.12;
        }
        if (wornKind == 0 || wornKind == 6) {
          // 着物：肩と背の日焼けの褪せ・脇と背の汗じみ・裾から上への泥はね
          float sun = smoothstep(1.1, 1.55, vObjP.y) * uCV.x;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.2 + 0.025, sun * 0.45);
          float sweat = smoothstep(0.55, 0.85, n1) * smoothstep(0.95, 1.2, vObjP.y) * smoothstep(1.5, 1.3, vObjP.y);
          diffuseColor.rgb *= 1.0 - sweat * (0.15 + 0.2 * uGrimeC);
          float spl = smoothstep(0.76, 0.9, n3) * smoothstep(0.95, 0.1, vObjP.y) + smoothstep(0.62, 0.05, vObjP.y) * (0.35 + 0.55 * n1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.062, 0.043), clamp(spl * uCV.y * (0.6 + 0.6 * uGrimeC), 0.0, 1.0) * 0.82);
        } else if (wornKind == 1) {
          // 漆：擦れて下地の茶が覗く斑と、細い掻き傷
          float chip = smoothstep(0.78, 0.92, n2 * 0.6 + n3 * 0.4) * uCV.z;
          // 同じ斑を照りにも使い、残った漆・擦れた下地・泥の違いを残す。
          pdWear = clamp(chip + smoothstep(0.42, 0.78, n2) * uCV.z * 0.5, 0.0, 1.0);
          pdMud = (1.0 - smoothstep(0.15, 1.1, vObjP.y)) * smoothstep(0.4, 0.76, n1)
            * clamp(0.2 + uGrimeC * 0.8 + uWet * 0.3, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.052, 0.032), pdMud * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.1, 0.06), chip * 0.7);
          float scr = (1.0 - smoothstep(0.0, 0.05, abs(fract(dot(q.xy, vec2(0.6, 0.8)) * 14.0 + n1) - 0.5))) * smoothstep(0.65, 0.8, n1) * uCV.z;
          scr *= 1.0 - smoothstep(0.4, 1.2, fwidth(q.y) * 70.0);
          // 傷を色だけの線にせず、同じ跡で漆の艶と表面の凹凸も崩す。
          pdWear = max(pdWear, scr);
          pdH -= scr * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.3, 0.22), scr * 0.6);
          // 陣笠・兜の上の雨じみ（白く乾いた水の跡）
          diffuseColor.rgb += vec3(0.03, 0.028, 0.025) * smoothstep(0.03, 0.0, abs(n1 - 0.55)) * smoothstep(1.6, 1.8, vObjP.y);
        }
        // 人ごとの色の寄り（同じ家の同じ具足でも、染めと漆の色が少しずつ違う）
        diffuseColor.rgb *= vec3(1.0 + (fract(uCV.w * 3.7) - 0.5) * 0.18, 1.0, 1.0 - (fract(uCV.w * 3.7) - 0.5) * 0.14);
      }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float fwD = max(length(dFdx(vObjP)), length(dFdy(vObjP))) * 112.0;
        // 高画質で織り目が数画素ある距離まで残し、遠くでは滑らかに消す。
        float kD = 1.0 - smoothstep(0.8, 3.0, fwD);
        float surfaceHeight = pdH * 0.0025 * kD;
        vec2 surfaceSlope = vec2(dFdx(surfaceHeight), dFdy(surfaceHeight));
        // 糸・擦れ・小札の段を同じ高さへ束ね、法線の微分と正規化は一度で済ませる。
        if (mkA == 1 || mkB == 1 || mkA == 3 || mkB == 3) {
          float plateHeight = txA.g * 0.009;
          // 重なった小札の谷に薄い陰を残す。曇天でも板と縅を一枚の面にしない。
          diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.2, 0.65, txA.g));
          surfaceSlope += vec2(dFdx(plateHeight), dFdy(plateHeight))
            * (1.0 - smoothstep(0.6, 1.4, fwidth(vObjP.y) * 120.0));
        }
        vec3 surfaceX = dFdx(-vViewPosition), surfaceY = dFdy(-vViewPosition);
        vec3 surfaceR1 = cross(surfaceY, normal), surfaceR2 = cross(normal, surfaceX);
        float surfaceDet = dot(surfaceX, surfaceR1) * faceDirection;
        normal = normalize(abs(surfaceDet) * normal - sign(surfaceDet)
          * (surfaceSlope.x * surfaceR1 + surfaceSlope.y * surfaceR2));
        roughnessFactor = clamp(roughnessFactor + pdR * kD + pdH * 0.15, 0.08, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.82, pdWear * 0.65);
        roughnessFactor = mix(roughnessFactor, mix(0.94, 0.64, uWet), pdMud);
        metalnessFactor *= 1.0 - pdMud;
        int finishKind = txA.r > 0.5 ? mkB : mkA;
        // 布は光を散らし、漆は擦れた所ほど鈍く、鉄には磨きの照りを残す。
        if (finishKind == 0 || finishKind == 6) {
          // 麻は艶消し、組紐は丸い糸の面だけ柔らかく照る。濡れても金属にはしない。
          roughnessFactor = mix(mix(0.94, 0.78, uWet), mix(0.72, 0.56, uWet), pdCord) + pdR * kD;
          metalnessFactor = 0.0;
        } else if (finishKind == 2) {
          // 肌には布のざらつきも鉄の照りも持ち込まない。既存の顔の陰影を保つ。
          roughnessFactor = clamp(0.62 + (txA.g - 0.5) * 0.12 - uWet * 0.08, 0.48, 0.7);
          metalnessFactor = 0.0;
        } else if (finishKind == 1) {
          // 漆の照りは残し、使い込んだ板の曇りを雨の鏡面から分ける。
          roughnessFactor = mix(clamp(0.3 + pdR * kD + (uCV.x - 0.5) * 0.1 - uWet * .06, .24, .52), .78, pdWear);
        } else if (finishKind == 3 || finishKind == 4) {
          // 鉄の磨きと曇りを布・漆から分ける。既存の汚れと四種の材質を共用する。
          roughnessFactor = mix(clamp(${'0.24'} + pdR * kD + uCV.z * 0.14, ${'0.24'}, 0.72), 0.94, pdMud);
          float polished = smoothstep(0.46, 0.82, txA.g) * (1.0 - pdMud);
          roughnessFactor = mix(roughnessFactor, finishKind == 4 ? 0.24 : 0.32, polished);
          metalnessFactor *= 1.0 - pdWear * 0.35;
        }
        roughnessFactor = mix(roughnessFactor, mix(0.94, 0.64, uWet), pdMud);
      }`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      // 谷の間接光だけを抑える。照りと陰が同じ位置に揃い、板・縅・鋲を読み取りやすくする。
      // 画素より細かい溝は弱め、遠くで黒い線がちらつくのを避ける。
      float plateDetail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
      float plateAO = 1.0 - pdCavity * plateDetail * 0.72;
      // 本流の谷と下面の陰を保ち、具足の接触部は材質に合わせて締める。
      int cavityKind = txA.r > 0.5 ? mkB : mkA;
      // 世界の上向き成分だけを求める。回転行列なのでベクトル全体の変換・正規化は不要。
      float skyUp = dot(normal, viewMatrix[1].xyz);
      float underAO = mix(cavityKind == 1 || cavityKind == 3 ? 0.58 : 0.68, 1.0,
        smoothstep(-0.65, 0.3, skyUp));
      // 谷と下面の陰を束ね、間接光には一度だけ掛ける。
      plateAO *= underAO;
      // 一体の顔：顎・鼻・眉の下面に届く空の光を抑え、頬と鼻筋の向きを読む。
      // 直射光は通常の照明に任せ、肌の色へ黒い影を描き込まない。
      if (cavityKind == 2) {
        plateAO *= mix(0.55, 1.0, smoothstep(-0.5, 0.65, skyUp));
      }
      reflectedLight.indirectDiffuse *= plateAO;
      reflectedLight.indirectSpecular *= plateAO;
      `);
    // 八隅の乱数を毎画素で作らず、一回の読み取りで二層を得る。元の関数定義は残す。
    sh.fragmentShader = CROWD_NOISE_GLSL + sh.fragmentShader.replace(/uVn\(/g, 'crowdNoise(')
      .replace('float crowdNoise(vec3 x)', 'float uVn(vec3 x)');
  };
  m.customProgramCacheKey = () => 'nearcrowd-finish6';
  crowdMats[v] = m;
  return m;
}
function dressCrowd(h, P, L, only = null, look = L) {
  const geo = crowdGeometry(P, L, only);
  // 遠く（と影）は units.js の軽い形をまとめた物
  const Plo = lookParts(look, false);
  const geoLo = crowdGeometry(Plo, L, only);
  // 遠く（HUM.lod より先）は、体（骨の入った人形・胴丸）を隠し、units.js の軽い体と顔まで一つの形にまとめる（骨組み一つ・描く回数一回・三角は一割ほど）
  h.geoFar = crowdGeometry(Plo, L, null, true, true);
  // この人が使う束の形（掃除 sweepCrowdGeos が、誰かが使っている間は表から外さないように。外すと同じ姿の次の人が形を作り直し、
  //   古い形はこの人が持ったまま残って二重になっていた：森部 70 秒で束の形 199（表）に対し生きている物 530・+90MB。10/20）
  h.cg = [geo, geoLo, h.geoFar];
  // 揺れる部品・顔の骨を足す（立ち姿では親の骨と同じ所）
  h.xb = {};
  for (const [nm, par] of Object.entries(XB)) {
    const b = new THREE.Bone(); b.name = nm; b.matrixAutoUpdate = false;
    h.bones[par].add(b); h.xb[nm] = b; h.bones[nm] = b;
  }
  // 陣笠・鉢巻の傾き：人ごとに少し（深くかぶる・浅くかぶる、左右にも僅かに）。同じ顔が並んで見えないよう（兜は傾けない：固く締めるので）
  if (h.xb.swHat && /^(jingasa|jingasa_n|hachimaki)$/.test(L.hat || '')) {
    const sd = h.seed || 0;
    h.xb.swHat.matrix.makeRotationFromEuler(new THREE.Euler(((sd * 7.9) % 1 - 0.5) * 0.14, 0, ((sd * 17.3) % 1 - 0.5) * 0.26));
    // 同じ共有形でも笠の仕立てを変える。頭や顔の大きさ、材質の数は増やさない。
    if (L.hat !== 'hachimaki') {
      const brim = 0.94 + ((sd * 11.7) % 1) * 0.12;
      h.xb.swHat.matrix.scale(new THREE.Vector3(brim, 0.88 + ((sd * 5.3) % 1) * 0.24, brim));
    }
  }
  if (!crowdInv) crowdInv = ALLB.map((nm) => restMatrix(XB[nm] || nm).clone().invert());
  const sk = new THREE.Skeleton(ALLB.slice(0, crowdInv.length).map((nm) => h.bones[nm]), crowdInv);
  const m = new THREE.SkinnedMesh(geo, true || namedKacchu(L) ? UNIT_MAT : nearCrowdMat(Math.floor(((h.seed || 0) * 11.3) % 1 * 4)));
  m.bind(sk, new THREE.Matrix4());
  // 影を受ける：笠が顔に、腕が胴に、胴が脚に落とす影で、体の厚みが出る（受けないと、日なたで平らに光る人形になる）
  m.castShadow = true; m.receiveShadow = true;
  m.boundingSphere = BSPH;
  h.root.add(m);
  h.parts.armor = m;
  h.F = P.F;
  // 今の顔（遠くの顔）：僧兵以外は具足と同じ描き物に束ねる（描く回数を一人一回減らす）。近い形・遠い形・実写の顔の有る無しで四通りの形を持ち、描く直前に選ぶ
  //   僧兵は顔の形と材質を比叡山の場面が差し替えるので、これまで通り別の描き物
  //   iPhone も別の描き物に：顔は人ごとに違うので、束ねると一人ずつ体ごとの形（0.5〜1MB）を新しく作り、乱戦の作り直しで記憶を押していた（10/21）
  if (L.sohei || !P.face || memTight()) {
    lodGeo(m, geo, geoLo, h);
    h.parts.pface = attachBody(h, 'Head', P.face, SRC.fitH);
    if (h.parts.pface) { h.parts.pface.frustumCulled = true; h.parts.pface.castShadow = false; lodGeo(h.parts.pface, P.face, Plo.face); }
    return;
  }
  // 顔を束ねた形（geoF・geoLoF）は要る時に作る：実写の顔（scanOn）に替わった人には要らず、姿の種類ごとに二つ分の形と GPU の記憶を節約する
  let geoF = null, geoLoF = null;
  const faceGeo = () => geoF || (h.cg.push(geoF = crowdGeometry(P, L, only, true)), geoF);
  const faceLoGeo = () => geoLoF || (h.cg.push(geoLoF = crowdGeometry(Plo, L, only, true)), geoLoF);
  m.onBeforeRender = (r, s, cam) => {
    let want;
    if (h.lodFar) want = h.geoFar;
    else if (cam.isOrthographicCamera) want = geoLo;   // 影には顔を描かない（これまでと同じ）
    else {
      const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
      const near = false && !h.u.isPlayer ? 9 : HUM.lod;
      want = d2 < near * near ? (h.scanOn ? geo : faceGeo()) : (h.scanOn ? geoLo : faceLoGeo());
    }
    if (want.userData) want.userData.use = frameT0;
    if (m.geometry !== want) m.geometry = want;
  };
}
// 近くの兵の顔を実写の顔に替える・戻す
function crowdFace(h, on) {
  if (!h.xb || !!h.scanOn === on) return;
  if (on && !h.parts.face) {
    if (!HEAD || madeFaces >= 1) return;   // 顔の絵は一コマに一つまで作る
    // 僧兵は剃った頭（裹頭の窓からは目元だけが見える）
    const named = isNamed(h.look);
    const key = named ? h.look.face : 'c' + ((h.look.face | 0) % 12) + '|' + (h.look.skin || 0) + (h.look.monk ? '|m' : '');
    // 新しい顔の絵を描くのは、人を作らなかったコマだけ（作る重さと描く重さを一コマに重ねない。次のコマで描く）
    if (!headMats.has(key) && madeThisFrame > 0) return;
    h.parts.face = scanFace(h, named ? h.look.face : key, h.look, h.F, named);
    if (!h.parts.face) return;
    if (h.look.menpoScan) scanMenpo(h.parts.face, named ? h.look.face : 'c' + ((h.look.face | 0) % 12), h.look.menpoScan);
  }
  h.scanOn = on;
  h.skelDirty = true;
  if (h.parts.face) h.parts.face.visible = on;
  if (h.parts.pface) h.parts.pface.visible = !on && !h.lodFar;
}
// 遠い人の軽い形へ替える・戻す（体・胴丸・顔を隠し、甲冑の形を体ごとまとめた物に）
function setFar(h, far) {
  if (!h.geoFar || !h.parts.armor || !!h.lodFar === far) return;
  if (far) crowdFace(h, false);
  h.lodFar = far;
  h.skelDirty = true;
  carryFlag(h, true);
  // 近くへ戻る時は、遠い間に辿らなかった指と手の骨の行列を次の一コマで必ず辿り直す（止まった人は skipHiddenMW が全部を飛ばし、手の皮だけ古い所へ帯のように伸びた）
  if (!far) h.mw0 = null;
  if (!h.domaru) h.body.visible = !far;
  if (h.parts.domaru) h.parts.domaru.visible = !far;
  if (h.parts.pface) h.parts.pface.visible = !far && !h.scanOn;
}
// 絵札（efuda.js）に焼く時の姿：0 立ち・1 歩き（phase 0〜1）・2 駆け。細かい形に戻し、速さを強いて一度だけ骨を動かす
export function efudaPose(h, mode, phase) {
  const u = h.u, sp = mode === 0 ? 0 : mode === 1 ? 1.3 : 4.5;
  setFar(h, false);
  h.spd = sp; h.gaitPhase = phase; h.last.copy(u.pos); h.closeGait = 0; h.gaitSide = 0; h.far = false; h.near = true;
  u.forceSpd = sp;
  // 構えは解いて焼く（立ち・歩きは槍を立て、駆けは構えて水平に）。敵との間合いの状態は一時に外して戻す
  const sv = { target: u.target, atk: u.atk, poseTarget: u.poseTarget, contactBrace: u.contactBrace, guard: u.guard, guarding: u.guarding, swing: u.swing, charging: u.charging };
  u.target = null; u.atk = null; u.poseTarget = null; u.contactBrace = 0; u.guard = 0; u.guarding = 0; u.swing = null; u.charging = mode === 2 ? sv.charging : null;
  h.upK = mode === 2 ? 0 : 1;
  try { gripPose(h, 1 / 240); driveHuman(h, 1 / 240, true, true); }
  finally { Object.assign(u, sv); }
}
let madeFaces = 0, preTick = 0;
// 実写の顔を頭の骨に付ける（full：本人と武将。兵は軽い目）
function scanFace(h, key, L, F, full) {
  // 携帯の支度では近い二十四人だけ。戦中も新しい顔の絵は一コマ一枚。
  if ((faceWarmUnits && !faceWarmUnits.has(h.u)) || (!headMats.has(key) && madeFaces >= 1)) {
    if (full && !h.facePending) h.facePending = { key, L, F, full };
    return null;
  }
  if (!headMats.has(key)) madeFaces++;
  h.facePending = null;
  const a0 = performance.now();
  const r = scanFace0(h, key, L, F, full);
  if (r) h.skelDirty = true;
  const TX = HSTAT.tx || (HSTAT.tx = {}); TX.scan = +((TX.scan || 0) + performance.now() - a0).toFixed(1);
  return r;
}
function scanFace0(h, key, L, F, full) {
  const hd = SRC.rest.Head;
  F = faceStyle(full ? key : 'c' + ((L.face | 0) % 12), F);
  let gk = full ? key : 'c' + ((L.face | 0) % 12);
  // 兵の顔の形は、顔の型（12）ごとにさらに三通りへ散らす（幅・えら・顎・鼻・頬骨を少しずつ。隣に同じ顔が並ばないよう）。絵は型ごとに同じ
  if (!full) {
    const v = Math.floor(((h.seed || 0) * 13.7) % 1 * 3);
    const J = [[-0.03, 0.08, 0.06, 0, 0.1], [0, -0.07, -0.05, 0.08, -0.05], [0.035, 0, 0, -0.07, 0]][v];
    F = { ...F, w: (F.w || 1) * (1 + J[0]), jaw: (F.jaw || 1) * (1 + J[1]), chin: (F.chin || 1) * (1 + J[2]), nose: (F.nose ?? 1) * (1 + J[3]), cheek: (F.cheek ?? 1) * (1 + J[4]) };
    gk += '|v' + v;
  }
  const hat = L.hat || '';
  // 笠の遮光を残しつつ、目鼻と頬へ空からの回り込みを残す。
  const ao = hat.startsWith('jingasa') ? 0.42 : hat.startsWith('kabuto') ? 0.4 : 0;
  // スキャンの兜をかぶる武将：兜に隠れる頭（眉より上と、耳の後ろ）は描かない（鉢の内から頭の肌が覗かないよう）
  const hg = h.helmScan ? clipScalp(headGeo(gk, F)) : headGeo(gk, F);
  // 兵は一人ずつ汚れ・汗・日焼けを変える（絵は型ごとに同じで、材質の値だけ四通り）
  // 武将と本人も、戦場の埃と汗を薄く（いちばん軽い型）
  const fv = full ? 0 : Math.floor((((h.seed || 0) * 7.31) % 1) * 4);
  const hm = new THREE.Mesh(hg, ao || h.helmScan || fv >= 0 ? hatFaceMat(headMaterial(key, L, F), h.helmScan ? 0.55 : ao, fv) : headMaterial(key, L, F));
  // 表情は人ごと：材質を一人に一つ写す（形の作りと絵は同じ。値だけ別）
  if (MEM_TIGHT) {
    h.expr = new THREE.Vector4(0, 0, 0, 0);   // 表情の形だけ個別。肌の材質・絵は共有する。
  } else {
    const b = hm.material, m2 = b.clone();
    m2.userData = { ...(b.userData || {}), ex: { value: new THREE.Vector4(0, 0, 0, 0) } };
    m2.onBeforeCompile = headCompile; m2.customProgramCacheKey = () => 'scanhead';
    hm.material = m2; h.expr = m2.userData.ex.value;
  }
  // 髪（横と後ろの髪の房）と髷：兜の中と僧は付けない
  if (!h.helmScan && !hat.startsWith('kabuto') && !L.monk && (!L.sohei || L.kosode)) addHair(hm, hg, F, !full);
  const k = HEAD.k;
  const fitF = new THREE.Matrix4().makeTranslation(hd.x, hd.y, hd.z).multiply(new THREE.Matrix4().makeTranslation(0, 0.048, 0.006)).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -1.2, -0.1));
  hm.castShadow = true; hm.receiveShadow = true;
  if (HEAD.mh) addEyesMH(hm, gk, F); else if (full) addEyes(hm, F); else addEyesFast(hm, F, soldierTint(L.skin || 0xb58c68));
  if (HEAD.mh && HEAD.exMorph) { h.faceM = hm; addMouthMH(hm, gk, F); }
  const M = new THREE.Matrix4().copy(restMatrix('Head')).invert().multiply(fitF);
  hm.matrixAutoUpdate = false; hm.matrix.copy(M); hm.frustumCulled = !full;
  h.bones.Head.add(hm);
  // 遅れて作った顔も、最初に描く前に頭の位置と縮尺へそろえる。
  // 静止中の骨の更新を省いたコマに、原寸の顔だけ原点へ残さない。
  hm.matrixWorldNeedsUpdate = true;
  hm.updateWorldMatrix(true, true);
  h.mw0 = null;
  return hm;
}
// 目の下頬（面頬）：実写の顔の形から、目の下・頬・鼻・顎の所を少し浮かせて鉄の打ち出しの面にする。口もとは開け、口の上に打ち出しの髭。裏は赤漆
const menpoGeos = new Map();
let MENPO_TEX = null;
const menpoMats = new Map();
function scanMenpo(hm, key, col) {
  key = key + '|' + hm.geometry.uuid;   // 顔の形（兵は型ごとに三通り）ごとに作る
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
    // 打ち出しの凹凸：顔をなぞるだけだと平らな板に見える。鉄を打ち出した面頬らしく、鼻筋を高く、頬骨を張り、頬に皺（しわ）を刻み、口の縁を外へ反らせ、顎を張る
    const G1 = (a, s) => Math.exp(-(a * a) / (2 * s * s));
    const relief = (x0, y) => {
      const nose = 0.13 * G1(x0, 0.16) * G1(y - 1.12, 0.3);                 // 鼻筋（高く細く）
      const cheek = 0.16 * G1(x0 - 1.3, 0.3) * G1(y - 1.1, 0.26);          // 頬骨
      let wr = 0;                                                            // 頬の皺：口の脇から頬へ斜めに三筋
      if (x0 > 0.75 && x0 < 1.95) for (let k = 0; k < 3; k++) { const yc = 0.95 - (x0 - 0.75) * 0.35 - k * 0.2; wr -= 0.075 * G1(y - yc, 0.06) * (1 - Math.abs(x0 - 1.35) / 0.6); }
      const r = Math.hypot(x0 / 0.62, (y - 0.42) / 0.32);                    // 口の縁：外へ反る唇
      const lip = r > 0.95 && r < 1.45 ? 0.17 * (1 - (r - 0.95) / 0.5) ** 1.5 : 0;
      const chin = 0.07 * G1(x0, 0.45) * G1(y + 0.55, 0.25);                 // 顎
      return nose + cheek + wr + lip + chin;
    };
    const DISP = (x0, y, off, inner) => {
      // 口の上の打ち出しの髭：少し高く盛る
      const mus = x0 < 0.85 && y > 0.7 && y < 0.92 ? 0.1 * Math.cos((y - 0.81) * 14) * (1 - x0 / 0.85) : 0;
      // 鼻の所は顔の鼻のまわりを浮かせすぎない（打ち出しの鼻筋は relief で立てる）
      const base = off * (1 - 0.55 * G1(x0, 0.3) * G1(y - 1.1, 0.35));
      return base + (inner ? relief(x0, y) * 0.8 : mus + relief(x0, y));
    };
    const build = (off, inner) => {
      // 頂点を分け合う形にして、法線をなめらかに（打ち出しの面が角張った多面体に見えないよう）
      const P = [], C = [], I = [], at = new Map();
      for (const i of keep) {
        const tri = [0, 1, 2].map((k) => idx.getX(i + k));
        const order = inner ? [tri[0], tri[2], tri[1]] : tri;
        for (const v of order) {
          if (!at.has(v)) {
            // 上の縁ははみ出た頂点を縁の線にそろえる（三角のぎざぎざを消す）
            const x = pos.getX(v), x0 = Math.abs(x + 0.09), y = Math.min(pos.getY(v), mTop(x0));
            const d = DISP(x0, y, off, inner);
            at.set(v, P.length / 3);
            P.push(x + nrm.getX(v) * d, y + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d);
            // 窪み（皺・口の縁の内・鼻の脇）は暗く、高い所（鼻筋・頬骨・唇）は明るく：凹凸を色でも見せる
            const k = Math.max(0.35, Math.min(1.05, 0.72 + relief(x0, y) * 3.2));
            C.push(k, k, k);
          }
          I.push(at.get(v));
        }
      }
      const o = new THREE.BufferGeometry();
      o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      o.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      o.setIndex(I);
      o.computeVertexNormals();
      return o;
    };
    // 縁の厚み：表の面と裏の面を、形の縁（一つの三角にしか使われない辺）でつなぐ（貼った板でなく、打ち出した鉄の厚みに）
    const P3 = (v, off, inner) => {
      const x = pos.getX(v), x0 = Math.abs(x + 0.09), y = Math.min(pos.getY(v), mTop(x0));
      const d = DISP(x0, y, off, inner);
      return [x + nrm.getX(v) * d, y + nrm.getY(v) * d, pos.getZ(v) + nrm.getZ(v) * d];
    };
    const ecount = new Map();
    const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    for (const i of keep) { const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]; for (let e = 0; e < 3; e++) { const k2 = ek(t[e], t[(e + 1) % 3]); ecount.set(k2, (ecount.get(k2) || 0) + 1); } }
    const RP = [];
    for (const i of keep) {
      const t = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      for (let e = 0; e < 3; e++) {
        const va = t[e], vb = t[(e + 1) % 3];
        if (ecount.get(ek(va, vb)) !== 1) continue;
        const oa = P3(va, 0.2, false), ob = P3(vb, 0.2, false), ia = P3(va, 0.15, true), ib = P3(vb, 0.15, true);
        RP.push(...oa, ...ib, ...ob, ...oa, ...ia, ...ib);
      }
    }
    const rim = new THREE.BufferGeometry();
    rim.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
    rim.computeVertexNormals();
    menpoGeos.set(key, { out: build(0.2, false), inn: build(0.15, true), rim });
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
  // 漆を掛けた鉄：真っ黒の艶消しだと、黒い板を貼ったように形が見えない。少し明るく、照りを強くして、打ち出しの頬・鼻・髭の形を光で見せる
  // 漆の艶：上塗りの透明な層（clearcoat）で、鼻筋・頬骨・唇の縁に細い照りが走るように
  if (!menpoMats.has(col)) menpoMats.set(col, [new THREE.MeshPhysicalMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0x6a5e52), 0.5), map: MENPO_TEX, vertexColors: true, roughness: 0.5, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.3, metalness: 0, vertexColors: true })]);
  const [iron, red] = menpoMats.get(col);
  const a = new THREE.Mesh(G.out, iron), b = new THREE.Mesh(G.inn, red);
  if (!G.rim.attributes.uv) { const p = G.rim.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.3; } G.rim.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  const rimM = menpoMats.get(col + '|rim') || (menpoMats.set(col + '|rim', iron.clone()), menpoMats.get(col + '|rim'));
  rimM.side = THREE.DoubleSide; rimM.vertexColors = false;
  const c = new THREE.Mesh(G.rim, rimM);
  for (const m of [a, b, c]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; hm.add(m); }
}
// 兵の目：白目・黒目・まぶた・まつげを一つの形にまとめる（描く回数を一回に）
const eyeFast = new Map();
const EYE_FAST_MATS = new Map();
// いちばん多い肌の色（0xb58c68）の顔の材質の色。まぶたの色はこの肌に合わせて作ってあるので、他の肌はこの比で掛ける
const EYE_REF_INV = (() => { const c = soldierTint(0xb58c68); return new THREE.Color(1 / c.r, 1 / c.g, 1 / c.b); })();
function soldierTint(skin) {
  const sk = new THREE.Color(skin).getHSL({});
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  return new THREE.Color().setRGB(Math.min(255, 140 + tn.r * 110) / 255, Math.min(255, 150 + tn.g * 115) / 255, Math.min(255, 145 + tn.b * 110) / 255, THREE.SRGBColorSpace);
}
function addEyesFast(hm, F, tint = null) {
  // 目の開きは細めに（白目が広く見えると、貼った目の絵に見える。日焼けした兵の目は細く、影に沈む）
  const w = F.w || 1, open = 0.78 / (F.eye || 1);
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
      const M = new THREE.Matrix4().makeTranslation(cx * w, 1.72, 1.965 - EYE_SINK).multiply(new THREE.Matrix4().makeRotationY((cx < -0.09 ? -1 : 1) * 0.22));
      const put = (g, hex, x, y, z, sy) => { g.scale(1, sy, 1); g.translate(x, y, z); g.applyMatrix4(M); gs.push(col(g, hex)); };
      const s = (rx, ry, rz, ws, hs, a, b) => { const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, b ?? Math.PI); g.scale(rx, ry, rz); return g; };
      // 白目は真っ白にしない（影の中の白目は灰色がかった黄み）。上下のまぶたが黒目の縁に掛かる（白目が黒目を囲むと、見開いた人形の目になる）
      put(s(0.22, 0.066, 0.06, 12, 8), 0x524a40, 0, 0, 0, open);
      // 目頭の赤み（涙丘）：白目の内の端に小さく
      put(s(0.05, 0.04, 0.035, 6, 4), 0x6e3a30, (cx < -0.09 ? 1 : -1) * 0.2, -0.004, 0.012, open);
      put(s(0.095, 0.085, 0.03, 10, 6), 0x24160e, 0.01, 0.006, 0.045, open);
      put(s(0.036, 0.036, 0.012, 6, 4), 0x050303, 0.01, 0.006, 0.068, open);
      put(s(0.29, 0.07, 0.085, 12, 6, 0, Math.PI * 0.55), 0x7e5842, 0, 0.043 + 0.02 * (1 - open), 0.004, 1);
      { const lo = s(0.28, 0.05, 0.08, 12, 5, 0, Math.PI * 0.5); lo.rotateZ(Math.PI); put(lo, 0x7e5842, 0, -0.04, -0.002, 1); }
      const lash = new THREE.TorusGeometry(1, 0.06, 4, 12, Math.PI * 0.9); lash.rotateZ(Math.PI * 0.05); lash.scale(0.25, 0.09, 0.07);
      put(lash, 0x2a2018, 0, 0.012, 0.014, open);
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
  // まぶたの色を顔の肌の色（材質の色 tint）に合わせる：色の違うまぶたは、顔に貼った目の絵に見える。材質は肌の色ごとに一つ
  const tc = tint ? tint.getHexString() : '-';
  if (!EYE_FAST_MATS.has(tc)) { const mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, envMapIntensity: 0.8 }); if (tint) mm.color.copy(tint).multiply(EYE_REF_INV); EYE_FAST_MATS.set(tc, mm); }
  const m = new THREE.Mesh(eyeFast.get(key), EYE_FAST_MATS.get(tc));
  m.frustumCulled = false; m.receiveShadow = true;   // 笠の影の中の目は暗く（白目が光って見開いた目に見えないよう）
  hm.add(m);
  // 目のうるみ：白目と黒目の上の涙の膜。照りだけを足す（黒の色に加算）ので、空と日の小さな映り込みが瞳に乗る
  if (!eyeFast.has('wet|' + key)) {
    const gs = [];
    for (const cx of [-0.69, 0.51]) {
      const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); g.rotateX(Math.PI / 2);
      g.scale(0.235, 0.066 * open, 0.07); g.translate(0, -0.002, 0.012);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(cx * w, 1.72, 1.965).multiply(new THREE.Matrix4().makeRotationY((cx < -0.09 ? -1 : 1) * 0.22)));
      gs.push(g.toNonIndexed());
    }
    for (const g of gs) for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
    eyeFast.set('wet|' + key, mergeGeometries(gs));
  }
  if (!EYE_FAST_MATS.has('wet')) EYE_FAST_MATS.set('wet', new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, envMapIntensity: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const wet = new THREE.Mesh(eyeFast.get('wet|' + key), EYE_FAST_MATS.get('wet'));
  wet.frustumCulled = false; wet.receiveShadow = true;
  hm.add(wet);
}

// ---- 僧兵の装い：裹頭（白い頭巾で頭と顔を包み、目だけ出す）と袈裟 ----
// 形は units.js の部品と同じ作り（UNIT_MAT の色・素材の値）で、体の座標で作る
const PLAIN_UV = [(1024 + 128) / 2048, 1 - (768 + 128) / 1024];
// 鎧下の肩：胴の上の縁から首の付け根まで、肩と背の上を覆う低い丸み（体の座標）
const yokeGeos = new Map();
function yokeGeo(L) {
  const hex = L.cloth || 0x2b2622, k = hex + '|' + (L.tier || 0);
  if (!yokeGeos.has(k)) {
    const b = [0.94, 1.0, 1.05, 1.08][L.tier || 0];
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    g.scale(0.215 * b, 0.075, 0.155 * b); g.translate(0, 1.41, -0.012);
    yokeGeos.set(k, paintG(g.toNonIndexed(), hex, 0, 0.6));
  }
  return yokeGeos.get(k);
}
// 小袖の袖：肩山の丸みと、肘へ少し細る筒（腕の骨の座標：関節を原点に下 -y へ）
const sleeveGeos = new Map();
function sleeveGeo(L) {
  const hex = L.cloth || 0x2b2622, k = hex + '|' + (L.tier || 0);
  if (!sleeveGeos.has(k)) {
    const tube = new THREE.CylinderGeometry(0.074, 0.066, 0.29, 12, 3, true); tube.translate(0, -0.125, 0);
    const cap = new THREE.SphereGeometry(0.074, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.5, 1); cap.translate(0, 0.02, 0);
    // 袖口：少し厚みのある折り返し
    const cuff = new THREE.TorusGeometry(0.066, 0.007, 4, 12); cuff.rotateX(Math.PI / 2); cuff.translate(0, -0.27, 0);
    const g = mergeGeometries([tube, cap, cuff].map((x) => { x = x.toNonIndexed(); for (const a of Object.keys(x.attributes)) if (a !== 'position' && a !== 'normal') x.deleteAttribute(a); return x; }));
    sleeveGeos.set(k, paintG(g, hex, 0, (L.tier || 0) === 0 ? 0.8 : 0.5));
  }
  return sleeveGeos.get(k);
}
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
// 頭の包みの下地（実写の顔と遠目の顔の一回り外）。一度だけ作る
let SOHEI_HEAD = null;
function soheiHead() {
  if (SOHEI_HEAD && SOHEI_HEAD.scan === !!HEAD) return SOHEI_HEAD;
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
  SOHEI_HEAD = { C, R: headEnvelope(pts, C, 48, 28), scan: !!HEAD };
  return SOHEI_HEAD;
}
function soheiKato(L) {
  const vi = (L.vi || 0) % 6;
  const k = (L.kato || 0) + '|' + vi + (HEAD ? '|s' : '');
  if (soheiCache.has(k)) return soheiCache.get(k);
  const { C, R } = soheiHead();
  const g = katoGeometry(R, C, { col: L.kato || 0xe2dccf, vi, hi: true, win: { x: -0.005, y: 1.607, hw: 0.078, hh: 0.038 + 0.002 * (vi % 3) }, drop: [1, 1.15, 0.9, 1.25, 1.05, 0.95][vi] });
  soheiCache.set(k, g);
  return g;
}
// 鉢巻（剃った頭の額に白い布を巻き、後ろで結んで端を垂らす）：頭の形に沿わせる
function soheiHachi(L) {
  const k = 'hachi|' + (L.kato || 0) + (HEAD ? '|s' : '');
  if (soheiCache.has(k)) return soheiCache.get(k);
  const { C, R } = soheiHead();
  const col = L.kato || 0xe2dccf, pr = [];
  const NU = 40, pos = [], idx = [];
  // 額は眉の上、後ろは少し下がる。布の厚みで外と内の二枚
  for (const [lay, off] of [[0, 0.006], [1, 0.001]]) {
    const b0 = pos.length / 3;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= NU; i++) {
      const th = -Math.PI + (i / NU) * Math.PI * 2, bk = (1 - Math.cos(th)) / 2;
      const y = 1.655 - 0.03 * bk + (j ? 0.03 : 0);
      let ph = 0.4; for (let n = 0; n < 4; n++) ph = Math.asin(Math.max(-1, Math.min(1, (y - C.y) / (R(th, ph) + off))));
      const r = R(th, ph) + off + 0.0015 * Math.sin(th * 9);
      pos.push(C.x + Math.sin(th) * Math.cos(ph) * r, C.y + Math.sin(ph) * r, C.z + Math.cos(th) * Math.cos(ph) * r);
    }
    for (let i = 0; i < NU; i++) { const a = b0 + i, b = a + 1, c = a + NU + 1, d = c + 1; if (lay) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  }
  const band = new THREE.BufferGeometry(); band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); band.setIndex(idx); band.computeVertexNormals();
  pr.push(paintG(band, col, 0, 0.45));
  const kr = R(Math.PI, 0.3) + 0.012, kp = [C.x, 1.64, C.z - Math.cos(0.3) * kr];
  const knot = new THREE.SphereGeometry(0.017, 8, 6); knot.scale(1.3, 1, 0.8); knot.translate(...kp);
  pr.push(paintG(knot, col, 0, 0.45));
  for (const sd of [-1, 1]) { const t = new THREE.BoxGeometry(0.026, 0.11, 0.004); t.translate(0, -0.055, 0); t.rotateZ(sd * 0.22); t.rotateX(-0.2); t.translate(kp[0] + sd * 0.01, kp[1] - 0.005, kp[2] - 0.006); pr.push(paintG(t, col, 0, 0.45)); }
  const g = mergeGeometries(pr);
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
// 手首・肘の捻りを分ける（下の spreadTwist）
const _twA = new THREE.Vector3(), _twD = new THREE.Quaternion(), _twT = new THREE.Quaternion(), _twI = new THREE.Quaternion();
// 骨の、立ち姿からのねじれ（その骨の向き＝親から見た位置の軸まわり）を out に。小さい（約 11 度まで）時は false
function twistOf(bone, R0, out) {
  _twA.copy(bone.position).normalize();
  _twD.copy(R0.quaternion).invert().premultiply(bone.quaternion);
  const d = _twD.x * _twA.x + _twD.y * _twA.y + _twD.z * _twA.z;
  out.set(_twA.x * d, _twA.y * d, _twA.z * d, _twD.w);
  const l = Math.hypot(out.x, out.y, out.z, out.w);
  if (l < 1e-6) { out.identity(); return false; }
  out.x /= l; out.y /= l; out.z /= l; out.w /= l;
  if (out.w < 0) { out.x = -out.x; out.y = -out.y; out.z = -out.z; out.w = -out.w; }
  return out.w <= 0.995;
}
// 捻りの骨（tools/mhbody.mjs：二の腕と前腕の中ほど。皮の先の半分が付く）がある体：
//   手の捻り（前腕から見て）の半分を前腕の中ほどへ、前腕の捻り（二の腕から見て。腕を狙いへ向けた時に出る）の半分を二の腕の中ほどへ。
//   骨の向き・手の位置は変えず、皮だけが肘から手首まで少しずつ捻れる（本物の前腕の、橈骨が尺骨の上を回る捻れ）
function spreadTwist(B, sd) {
  const T = SRC.template && SRC.template.bones;
  if (!T) return;
  const H = B[sd + 'Hand'], F = B[sd + 'ForeArm'], FT = B[sd + 'ForeArmTwist'], AT = B[sd + 'ArmTwist'];
  if (!H || !F) return;
  if (FT && AT && T[sd + 'Hand'] && T[sd + 'ForeArm']) {
    twistOf(H, T[sd + 'Hand'], _twT); FT.quaternion.copy(_twI).slerp(_twT, 0.5);
    twistOf(F, T[sd + 'ForeArm'], _twT); AT.quaternion.copy(_twI).slerp(_twT, 0.5);
    FT.updateMatrix(); AT.updateMatrix();
    return;
  }
  // 捻りの骨の無い体（見本の体）：手の捻りの半分を前腕の骨へ移す（前腕の骨は録った動き（mixer）が毎コマ置き直すので、積み重ならない）
  const R0 = T[sd + 'Hand'];
  if (!R0 || !twistOf(H, R0, _twT)) return;
  _twT.slerp(_twI, 0.5);
  F.quaternion.multiply(_twT);
  H.quaternion.premultiply(_twT.invert());
  F.updateMatrix(); H.updateMatrix();
}
// 骨の世界の行列を親から辿って直す時（getWorldPosition・applyWorldRot）、動かしている人の根元（h.root）より上は辿らない。
//   根元より上（兵の根元・鞍・馬・場面）は人を動かす間に変わらないので、動かし始めに一度だけ直す。毎回辿ると骨一本ごとに五〜六段ぶん余計に掛け算していた。
//   動かしている間（CUR が正）だけ効き、ほかの時は three の元のまま（根元まで全部辿る）
let PASS = 0, CUR = -1;
const _chain = [];
{
  const BP = THREE.Bone.prototype, base = THREE.Object3D.prototype.updateWorldMatrix;
  BP.updateWorldMatrix = function (updateParents, updateChildren) {
    if (CUR < 0 || !updateParents || updateChildren) return base.call(this, updateParents, updateChildren);
    let n = this, k = 0;
    while (n && n._fresh !== CUR) { _chain[k++] = n; n = n.parent; }
    if (!n) return base.call(this, updateParents, updateChildren);   // 動かしている人の骨でなければ元のまま
    for (let i = k - 1; i >= 0; i--) {
      const c = _chain[i];
      if (c.matrixAutoUpdate) c.updateMatrix();
      if (c.matrixWorldAutoUpdate === true) { if (c.parent === null) c.matrixWorld.copy(c.matrix); else c.matrixWorld.multiplyMatrices(c.parent.matrixWorld, c.matrix); }
      _chain[i] = null;
    }
  };
}
function driveHuman(h, dt, fine = true, arms = true) {
  if (window.__apx?.noskin && h.poseReady) return;
  h.skelDirty = true;
  h.root.updateWorldMatrix(true, false);
  h.root._fresh = CUR = ++PASS;
  try { driveHuman0(h, dt, fine, arms); } finally { CUR = -1; }
}
function driveHuman0(h, dt, fine = true, arms = true) {
  const u = h.u, fallen = !u.alive || !!u.dying;
  if (h.settledOffset) {
    h.model.position.x -= h.settledX;
    h.model.position.y -= h.settledY;
    h.model.position.z -= h.settledZ;
    h.settledOffset = false;
  }
  if (!fallen && u.contactFrozen) return;
  const B = h.bones;
  const time = (h.clock = (h.clock || 0) + dt);
  // 速さ（位置の動きから）
  const dx = u.pos.x - h.last.x, dz = u.pos.z - h.last.z;
  h.last.copy(u.pos);
  const inst = u.forceSpd ?? (dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0);
  const prev = h.spd;
  if (fallen && h.deathSpeed === undefined) h.deathSpeed = prev;
  h.spd += (inst - h.spd) * Math.min(1, dt * 6);
  // 曲がる速さと、止まりかけ（馬上の体の傾きに使う）
  const hd0 = h.lastH ?? u.heading; h.lastH = u.heading;
  let dh = u.heading - hd0; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  h.turn = (h.turn || 0) + ((dt > 0 ? dh / dt : 0) - (h.turn || 0)) * Math.min(1, dt * 4);
  h.decel = (h.decel || 0) + (Math.max(0, dt > 0 ? (prev - h.spd) / dt : 0) * 0.3 - (h.decel || 0)) * Math.min(1, dt * 3);
  // 押されて滑る間は、地面の移動を歩きの速さに数えない。
  const sp = u.mounted || fallen ? 0 : u.slipT > 0 ? Math.hypot(u.mv.x, u.mv.z) : h.spd;
  // 接敵した徒歩は大股の走りから、構えを保った短い足運びへ移る。
  // 今ある相手だけを見る。兵の位置・速さ・攻撃の時計には触れない。
  const gaitWeapon = u.wpnKind || u.lookWeapon;
  const gaitFoe = u.atk?.target || u.swing?.target || u.target;
  let closeGait = 0;
  if (!h.far && !fallen && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.climb
    && !u.dodging && !u.hit && !(u.stagger > 0) && !(u.pinT > (ARMY?.time ?? 0))
    && (gaitWeapon === 'spear' || gaitWeapon === 'sword') && gaitFoe?.alive && gaitFoe.pos && !gaitFoe.isStruct
    && gaitFoe.team !== u.team && Math.abs(gaitFoe.pos.y - u.pos.y) < 1.2) {
    const reach = gaitWeapon === 'spear' ? 5.2 : 3;
    closeGait = clamp01((reach - Math.hypot(gaitFoe.pos.x - u.pos.x, gaitFoe.pos.z - u.pos.z)) / 1.8)
      * (1 - clamp01((sp - 3.2) / 1.2));
  }
  // 後列は敵を直接狙っていなくても、前列から伝わる押し合いに合わせて足を刻む。
  // 脚だけが大股で走り続ける姿を避け、既存の接触量を使う。
  if (!fallen && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.climb
    && !u.dodging && !u.hit && !(u.stagger > 0) && sp < 3.2) {
    closeGait = Math.max(closeGait, (u.contactBrace || 0) * (1 - clamp01((sp - 1.6) / 1.6)));
  }
  h.closeGait = (h.closeGait || 0) + (closeGait - (h.closeGait || 0)) * Math.min(1, dt * 7);
  const combatGait = !fallen && !u.mounted && !u.isPlayer && !h.far ? h.closeGait : 0;
  // 敵へ胸を向けた横移動は、前へ歩く見本のまま滑らせず、短い送り足へ。
  // 実際の移動を読むだけ。遠い兵・騎馬・回避・被弾には重ねない。
  const travel = Math.hypot(dx, dz);
  const sideWant = combatGait > 0 && closeGait > 0 && sp > 0.25 && travel > 1e-4 && HUM.fx && !reduceMotion()
    ? (dx * Math.cos(u.heading) - dz * Math.sin(u.heading)) / travel * combatGait : 0;
  h.gaitSide = (h.gaitSide || 0) + (sideWant - (h.gaitSide || 0)) * Math.min(1, dt * 8);
  const sideGait = combatGait > 0 && closeGait > 0 && HUM.fx && !reduceMotion() ? Math.abs(h.gaitSide) : 0;
  const shortStride = (1 - 0.18 * combatGait) * (1 - 0.65 * sideGait);
  const wRun = Math.max(0, Math.min(1, (sp - 2.6) / 1.6)) * (1 - combatGait);
  const wWalk = Math.max(0, Math.min(1, sp / 1.1)) * (1 - wRun);
  const wIdle = Math.max(0, 1 - wWalk - wRun);
  const A = h.act;
  A.idle.setEffectiveWeight(wIdle); A.walk.setEffectiveWeight(wWalk); A.run.setEffectiveWeight(wRun);
  // 録った動きが地面を送る速さ（SRC.vWalk・vRun）に合わせる（足が滑らない）
  // 歩幅は人ごとに少し違う（背丈・癖）：歩幅の広い人は拍子がゆっくり、狭い人は速い（同じ速さで歩く隊でも、足の運びがそろい過ぎない）
  const strideK = h.strideK || (h.strideK = 0.9 + ((h.seed * 17.3) % 1) * 0.2);
  // 後ずさり：向きと逆へ動く時は、歩みの録った動きを逆に回す（前へ歩く足で後ろへ滑らない）
  const back = sp > 0.25 && Math.hypot(dx, dz) > 1e-4 ? (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / Math.hypot(dx, dz) : 1;
  h.backK = (h.backK ?? 1) + ((back < -0.35 ? -1 : 1) - (h.backK ?? 1)) * Math.min(1, dt * 8);
  A.walk.timeScale = Math.min(sideGait > 0.05 ? 2.2 : Infinity, Math.max(0.5, sp / (SRC.vWalk * strideK * shortStride))) * (h.backK < 0 ? -0.8 : 1); A.run.timeScale = Math.max(0.7, Math.min(1.35, sp / (SRC.vRun * strideK)));   // 駆け足は録った動きが小走りなので、拍子を速めすぎない（足の回りが漫画のように速くならないよう）
  // 同じ接地の拍子で歩きから走りへつなぐ。足を置く間は少しゆっくり、運ぶ間は速く。
  // 録った骨の動きは保ち、時計だけをずらす。遠い兵の更新回数は増やさない。
  if (!fallen && !u.mounted) {
    const wd = A.walk.getClip().duration, rd = A.run.getClip().duration;
    const moving = wWalk + wRun;
    const rate = moving > 0.01 ? (wWalk * A.walk.timeScale / wd + wRun * A.run.timeScale / rd) / moving : 0;
    h.gaitPhase = ((h.gaitPhase + dt * rate) % 1 + 1) % 1;
    const phase = h.gaitPhase - Math.sin(h.gaitPhase * Math.PI * 4) * (0.012 * wWalk + 0.005 * wRun);
    // mixer がこの後 dt だけ進む分を引き、二つの足が同じ位置に着くようにする。
    A.walk.time = ((phase * wd - dt * A.walk.timeScale) % wd + wd) % wd;
    A.run.time = ((phase * rd - dt * A.run.timeScale) % rd + rd) % rd;
  }
  // 動きの見本（idle など）を骨に当てる。三つの動きの時が進まない時（倒れた後）は、three.js が同じ値を書き直さないので、
  // 下で重ねて回した分が毎コマ積み重なって体がねじれ、のたうつ。倒れた人は、息のあった最後のコマの形を覚えておいて、毎コマそこへ戻す
  if (!fallen || !h.poseReady) {
    h.mixer.update(!fallen ? dt : 0);
    for (const b of h.motionB) b.updateMatrix();
    const bs = h.animB, P = h.pose;
    for (let i = 0; i < bs.length; i++) P[i].copy(bs[i].quaternion);
    h.poseReady = true;
  } else for (let i = 0; i < h.animB.length; i++) { h.animB[i].quaternion.copy(h.pose[i]); h.animB[i].updateMatrix(); }
  // 速く駆ける時は、録った小走りの拍子を速めすぎない代わりに、腿と膝の振りを大きくして歩幅を広げる（足が地面を滑らない）
  // 人ごとの歩幅（strideK）も、腿と膝の振りの大きさで出す
  if (!fallen && !u.mounted && (wRun > 0.05 || wWalk > 0.05) && SRC.restQ) {
    const need = Math.max(0, Math.min(0.45, sp / (SRC.vRun * 1.35 * strideK) - 1)) * wRun;
    // 歩幅を縮めた分は上の時計を進め、足だけが地面を滑らないようにする。
    const amp = (1 + need) * (1 + (strideK - 1) * Math.min(1, wWalk + wRun)) * shortStride;
    if (Math.abs(amp - 1) > 0.01) for (const nm in SRC.restQ) { const b = h.bones[nm]; _fq.copy(SRC.restQ[nm]).slerp(b.quaternion, amp); b.quaternion.copy(_fq); b.updateMatrix(); }
  }
  // 根元の向き（人は兵の根元の子）。倒れる途中は根元がコマごとに大きく回るので、先に今のコマの行列にしておく（前のコマの向きで骨を回すと、体がねじれて跳ねる）
  if (!u.mounted) u.mesh.updateWorldMatrix(false, false);
  h.root.updateMatrixWorld(true);
  const m = u.mesh.matrixWorld.elements;
  _right.set(m[0], m[1], m[2]).normalize(); _fwd.set(m[8], m[9], m[10]).normalize();
  const w = u.wpnKind || u.lookWeapon;
  const engaged = !!(u.target?.alive || u.atk || u.poseTarget?.alive || u.contactBrace > 0.2) && !fallen && !u.fleeing && !u.downed && !(u.pinT > (ARMY?.time ?? 0));
  const ranged = w === 'gun' || w === 'bow';
  // 構え（腰を落とし、左足を前へ）：敵と向き合って立ち止まっている時
  const wantSt = !fallen && !u.fleeing && !u.downed && !(u.pinT > (ARMY?.time ?? 0)) && !u.dropped &&
    (engaged && sp < 1.6 && !u.mounted && !ranged || u.guarding > 0 || u.guard) ? 1 : 0;
  const gaitStance = Math.max(wantSt, combatGait * 0.65);
  h.stance = (h.stance || 0) + (gaitStance - (h.stance || 0)) * Math.min(1, dt * 4);
  const st = h.stance * (1 - wRun);
  // 胴の傾き（本編の胴と同じ：のけぞり・踏み込み・走りの前傾・ひねり）
  // 被弾は後段の骨の反応だけで受ける。簡易な胴の崩れまで重ねると、
  // 同じ当たりで胸が二重に折れ、腰と足の支えから外れてしまう。
  const br = u.body && !(u.hit && !fallen && !u.mounted) ? u.body.rotation : null;
  const lk = u.mounted ? 0.3 : 1;
  rotWorld(B.Spine, _right, (br?.x || 0) * 0.6 * lk + st * 0.1); rotWorld(B.Spine1, _right, (br?.x || 0) * 0.4 * lk);
  rotWorld(B.Spine1, _up, (br?.y || 0) * 0.6);
  rotWorld(B.Spine, _fwd, -(br?.z || 0));
  // 半身：長柄・刀を構える時は、左の肩を前へ出して胸を右へ開く（顔は前のまま）。人ごとに少し違う
  if (!u.mounted && !fallen && (w === 'spear' || w === 'sword')) {
    const tw = (1 - (h.upK || 0)) * (1 - wRun) * (w === 'spear' ? 0.42 + (h.seed - 0.5) * 0.2 : 0.15 + h.seed * 0.1) * Math.max(st, w === 'spear' ? 0.6 : 0);
    if (tw > 0.01) { rotWorld(B.Hips, _up, tw * 0.15 * st); rotWorld(B.Spine, _up, tw * 0.4); rotWorld(B.Spine1, _up, tw * 0.35); rotWorld(B.Spine2, _up, tw * 0.25); rotWorld(B.Neck, _up, -tw * 0.8); }
  }
  // 腰の上下（膝つき・かわし・息づかい）
  const by = u.body ? u.body.position.y - (u.mounted ? RIDE.y : 0) : 0;
  h.model.position.y = Math.min(0.05, by) * 0.8;
  h.model.position.z = 0;
  h.model.position.x = 0;
  // 馬上でも、手負いの胸と肩に息の荒さを出す。
  if (HUM.fx && !fallen) vitals(h, B, dt, time, sp, wIdle, wWalk, wRun, st);
  if (!u.mounted && !fallen) {
    lowerBody(h, B, dt, time, st, wIdle, sp, w);
    if (HUM.fx) gaitWeight(h, B, dt, wWalk, wRun, st);
    // 間合いの内では膝をゆるめて胸を前へ預ける。兵ごとに支える脚を替え、
    // 同じ立ち姿の列にしない。足の接地と得物の握りは後段で合わせる。
    // 膝・腰・胸を別々に合わせるのは、足も接地させる近景の十八人だけ。
    // 中景は既存の contactBrace による構えを使い、骨の親行列を何度も辿らない。
    if (HUM.fx && !h.far && h.groundFeet && WORLD?.def.infantryWeight && !u.isPlayer && !u.hit && !u.downed && !u.fleeing) {
      // 柵は線分、小屋は x・z を持ち、人の pos はない。踏ん張りの間合いは人だけで測る。
      const foe = u.target || u.poseTarget;
      const target = foe?.alive && !foe.isStruct && foe.pos ? foe : null;
      const dx = target ? target.pos.x - u.pos.x : 0, dz = target ? target.pos.z - u.pos.z : 0;
      const front = u._contactFront?.alive || u._lineFront?.alive || u.pressBack?.alive;
      // 直前の味方に付く後列にも踏ん張りを渡す。揺れの拍子だけを人ごとにずらす。
      // 槍先が届く距離から腰を落とす。走り込みの最中は踏ん張りを重ねない。
      const reach = w === 'spear' ? 4.8 : 2.2;
      const want = Math.max(sp < 1.8 ? u.contactBrace || 0 : 0, target?.alive && sp < 1.8 ? 1 - ease(reach * 0.3, reach, Math.hypot(dx, dz)) : 0,
        front && sp < 1.2 ? 0.45 : 0);
      h.pressWeight = (h.pressWeight || 0) + (want - (h.pressWeight || 0)) * Math.min(1, dt * 5);
      const k = h.pressWeight * (reduceMotion() ? 1 : 0.85 + 0.15 * Math.sin(time * 1.7 + h.seed * 23)), left = h.seed > 0.5;
      if (k > 0.01) {
        // 腰を支える脚と胸の向きを人ごとに変え、同じ人形を並べた列にしない。
        const weight = k * (0.8 + h.seed * 0.4), side = left ? 1 : -1;
        rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.3 * weight);
        rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.48 * weight);
        rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.17 * weight);
        rotWorld(B.Hips, _fwd, side * 0.035 * weight);
        rotWorld(B.Spine, _right, 0.16 * weight); rotWorld(B.Spine1, _up, (h.seed - 0.5) * 0.32 * k);
        // 支える脚の側へ肩も沈める。左右同じ胸と肩の反復を既存の骨だけで崩す。
        rotWorld(B.Spine2, _fwd, -side * 0.065 * weight);
        // 槍の届く間合いでも、相手の突きに合わせて胸と膝を引き、重みを後ろ足へ渡す。
        const receive = reduceMotion() ? 0 : (u.contactLoad || 0) * k;
        rotWorld(B.Spine1, _right, -0.28 * receive);
        rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.3 * receive);
        rotWorld(B.Hips, _right, -0.08 * receive);
        h.model.position.y -= 0.055 * weight;
      }
    }
    if (HUM.fx && !h.far && !engaged && wIdle > 0.2 && !u.isPlayer && !(u.idl && (u.idl.a || u.idl.sit > 0.3))) idleLife(h, B, dt, wIdle, st);
    // 向きを変える時は、体が一瞬では回らない：顔と胸が先に向き、腰と脚は遅れて付いて行く（兵の向きは units.js が一度に変える）
    h.turnLag = Math.max(-1.2, Math.min(1.2, ((h.turnLag || 0) - dh) * Math.exp(-dt * (5 + sp))));
    if (HUM.fx && Math.abs(h.turnLag) > 0.01) { rotWorld(B.Hips, _up, h.turnLag); rotWorld(B.Spine1, _up, -h.turnLag * 0.35); rotWorld(B.Neck, _up, -h.turnLag * 0.4); }
    // 坂や凸凹の地面：足の裏を、その足の下の地面に合わせる（低い方の足に合わせて腰を落とし、高い方の足は膝を曲げる）
    // 足の補正は構え・被弾・踏み込みを重ねた後に一度だけ行う。
  }
  // 乱戦の横詰め：前進用の歩みを実際の移動方向へ向け、胸と得物は敵へ残す。
  // 後ずさりは上で逆再生しているので、脚の向きもその逆へ合わせる。
  // 既に測った移動量だけを使い、敵の探索・兵の位置・攻撃の間合いは変えない。
  const sideStep = HUM.fx && !h.far && combatGait > 0.01 && !u.hit && !u.downed
    && !u.dodging && !u.climb && !u.perch && !u.naka && !u.dragging && !u.tech
    && !(u.stagger > 0) && !(u.slipT > 0) && !(u.woundRest > 0.01);
  let stepYaw = 0;
  if (sideStep && sp > 0.25 && dt > 0 && dx * dx + dz * dz > 1e-8) {
    const sn = Math.sin(u.heading), cs = Math.cos(u.heading);
    const forward = dx * sn + dz * cs, side = dx * cs - dz * sn;
    const playback = h.backK < 0 ? -1 : 1;
    stepYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(side * playback, Math.abs(forward))))
      * combatGait * clamp01((sp - 0.25) / 0.65);
  }
  h.meleeStepYaw = (h.meleeStepYaw || 0) + (stepYaw - (h.meleeStepYaw || 0)) * Math.min(1, dt * 9);
  if (sideStep && Math.abs(h.meleeStepYaw) > 0.005) {
    // 腰から両脚を同じ方向へ送り、胸で逆に戻す。足裏は後段の共通の接地補正へ渡す。
    rotWorld(B.Hips, _up, h.meleeStepYaw);
    rotWorld(B.Spine, _up, -h.meleeStepYaw * 0.6);
    rotWorld(B.Spine1, _up, -h.meleeStepYaw * 0.4);
  }
  // かわし：身をかがめ、跳ぶ向きへ体を倒す（位置が滑るだけに見せない）
  h.dodgeK = (h.dodgeK || 0) + ((u.dodging && !fallen && !u.mounted ? 1 : 0) - (h.dodgeK || 0)) * Math.min(1, dt * 14);
  if (h.dodgeK > 0.02) {
    const dk = h.dodgeK, lat = dt > 0 ? (dx * _right.x + dz * _right.z) / dt : 0, lean = Math.max(-1, Math.min(1, lat / 4));
    rotWorld(B.LeftUpLeg, _right, -0.55 * dk); rotWorld(B.RightUpLeg, _right, -0.4 * dk);
    rotWorld(B.LeftLeg, _right, 0.9 * dk); rotWorld(B.RightLeg, _right, 0.75 * dk);
    rotWorld(B.Spine, _right, 0.25 * dk); rotWorld(B.Spine1, _fwd, -0.3 * lean * dk);
  }
  // 崩れて膝をつく
  // 膝をつく・立ち上がるは、一コマで形を切り替えずに滑らかに（崩れる時は速く、起き上がる時は手をつくように遅れて）
  const kwant = u.stagger > 0.7 && u.hit?.kind !== 'kneel' && u.hit?.res !== 'block' && !u.mounted && !u.isPlayer && !fallen ? 1 : 0;
  h.kneelK = (h.kneelK || 0) + (kwant - (h.kneelK || 0)) * Math.min(1, dt * (kwant ? 9 : 3.2));
  if (h.kneelK > 0.01 && !u.mounted && !u.isPlayer && !fallen) {
    // 人ごとに、つく膝の左右と深さを変える（皆が同じ形で膝をつかない）
    const L_ = h.seed > 0.5, dp = (0.8 + ((h.seed * 23.7) % 1) * 0.35) * (h.kneelK * h.kneelK * (3 - 2 * h.kneelK));
    // 起き上がる途中：上体を前へ倒して重心を膝の上へ運ぶ
    if (!kwant) rotWorld(B.Spine, _right, 0.35 * Math.sin(h.kneelK * Math.PI));
    const fU = L_ ? B.LeftUpLeg : B.RightUpLeg, fL = L_ ? B.LeftLeg : B.RightLeg;
    const bU = L_ ? B.RightUpLeg : B.LeftUpLeg, bL = L_ ? B.RightLeg : B.LeftLeg;
    rotWorld(fU, _right, -1.0 * dp); rotWorld(fL, _right, 1.6 * dp);
    rotWorld(bU, _right, 0.15 * dp); rotWorld(bL, _right, 1.4 * dp);
    h.model.position.y = Math.min(h.model.position.y, -0.3 * dp);
  }
  // 槍を受ける足は人ごとに前後を替え、同じ姿勢の列にしない。
  if (!fallen && !u.mounted && !u.isPlayer && u.contactBrace > 0.01 && h.kneelK < 0.01 && !u.hit && !u.downed) {
    const k = u.contactBrace * (0.75 + ((u.id * 0.618) % 1) * 0.5), left = u.id % 2;
    // 具足が同じでも、腰の据え方と肩の開きで一人ずつ違う輪郭を残す。
    // 見た目の骨だけを動かし、兵の体格・当たりの半径は変えない。
    const set = (0.8 + h.seed * 0.4) * k;
    const spread = (0.035 + h.seed * 0.04) * k;
    rotWorld(B.LeftUpLeg, _fwd, -spread);
    rotWorld(B.RightUpLeg, _fwd, spread);
    rotWorld(B.Spine1, _up, (h.seed - 0.5) * 0.16 * k);

    const load = !u.atk && !u.swing && !reduceMotion() ? (u.contactLoad || 0) * k : 0;
    // 押し合う後列は腰を前へ、受ける前列は後ろ足へ。既存の圧力で姿勢だけを分ける。
    const rear = !!(u.spearRear || u._contactFront?.alive && u._contactFront.team === u.team);
    const weightShift = reduceMotion() ? 0 : Math.sin(time * (1.25 + h.seed * 0.6) + h.seed * 13) * 0.018 * k;
    rotWorld(B.Hips, _right, (rear ? 0.055 : -0.025) * k);
    rotWorld(B.Spine1, _right, (rear ? 0.065 : 0.025) * k + weightShift);
    h.model.position.y -= (0.035 + h.seed * 0.035) * set;

    // 胸と腰も相手へ向け、槍を待つ前列と後ろから支える兵の重さを出す。
    rotWorld(B.Spine, _right, 0.12 * k - 0.16 * load);
    rotWorld(B.Spine2, _fwd, (left ? 1 : -1) * (0.04 * k + 0.05 * load));
    rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.24 * k);
    rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.4 * k);
    rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * k);
    rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.22 * k);
    // 相手の振りに合わせ、前膝を戻し、後ろ膝で腰を支える。足の接地は後段の共通処理へ。
    if (!h.far && load > 0.001) {
      // 受ける肩を引き、腰は支える脚へ残す。胴・腰が一枚の板のように動くのを防ぐ。
      const side = left ? 1 : -1;
      rotWorld(B.Hips, _up, -side * 0.045 * load);
      rotWorld(B.Spine1, _up, side * 0.12 * load);
      rotWorld(B.Spine2, _right, -0.065 * load);
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, 0.16 * load);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, -0.18 * load);
      rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.24 * load);
      h.model.position.z -= 0.075 * load;
      h.model.position.y -= 0.025 * load;
      // 柄を寄せる腕だけでなく胸も打ち筋から外し、後ろ膝へ重さを逃がす。
      // 手は後段で同じ武器の握りへ合わせるので、両手と柄が離れない。
      const parry = !reduceMotion() ? (u.contactParry || 0) : 0;
      rotWorld(B.Spine1, _up, (u.contactParrySide || 0) * 0.2 * parry);
      rotWorld(B.Spine, _right, -0.12 * parry);
      rotWorld(B.Neck, _right, 0.08 * parry);
    }
    // 受け止められた突きの反動。相手の受けと同じ衝突時刻で、後ろ脚へ踏み直す。
    const stop = !h.far && !reduceMotion() && !u.dodging ? (u.contactStop || 0) : 0;
    if (stop > 0.001) {
      rotWorld(B.Spine, _right, -0.16 * stop);
      rotWorld(B.Spine1, _up, (left ? 1 : -1) * 0.10 * stop);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, -0.18 * stop);
      rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.28 * stop);
      h.model.position.z -= 0.07 * stop;
      h.model.position.y -= 0.035 * stop;
    }
    // 前列と後列で共用する踏み込み。近い骨のある人にも同じ腰・膝の重さを渡す。
    const push = !u.dodging && !reduceMotion() ? (u.contactPush || 0) * u.contactBrace : 0;
    if (!h.far && push > 0.001) {
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.16 * push);
      rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.2 * push);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * push);
    }
    // 槍を出す拍子に前膝へ重さを移す。骨の接地補正へ渡し、兵の当たりは動かさない。
    const drive = !h.far && !reduceMotion() ? (u.contactDrive || 0) * k : 0;
    if (drive > 0.001) {
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.18 * drive);
      rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.22 * drive);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * drive);
      h.model.position.y -= 0.035 * drive;
    }
  }
  if (!fallen && !u.mounted && !u.isPlayer && u.woundRest > 0.01 && h.kneelK < 0.01 && !u.hit) {
    const k = u.woundRest;
    rotWorld(B.LeftUpLeg, _right, -0.85 * k); rotWorld(B.LeftLeg, _right, 1.35 * k);
    rotWorld(B.RightUpLeg, _right, 0.12 * k); rotWorld(B.RightLeg, _right, 1.45 * k);
    h.model.position.y = Math.min(h.model.position.y, -0.3 * k);
  }
  // 倒れる途中の膝の折れ（units.js の animDeath が u.deathKneel に 0〜1 で出す）。途中で跳ばないよう、量のまま折る
  if (fallen && u.death && !u.mounted) {
    const kn = u.deathKneel || 0;
    if (kn > 0.001) {
      const right = (u.death.side || (h.seed > 0.5 ? 1 : -1)) > 0;
      rotWorld(right ? B.RightUpLeg : B.LeftUpLeg, _right, -1.0 * kn);
      rotWorld(right ? B.RightLeg : B.LeftLeg, _right, 1.6 * kn);
      rotWorld(right ? B.LeftUpLeg : B.RightUpLeg, _right, 0.15 * kn);
      rotWorld(right ? B.LeftLeg : B.RightLeg, _right, 1.4 * kn);
      h.model.position.y = Math.min(h.model.position.y, -0.3 * kn);
    }
  }
  // 討たれて倒れる：膝から崩れ、背を丸め、腕が落ちる（倒れる向きは units.js が根元を回す）
  // （units.js が倒れ方 u.death を動かす時は、膝は上の deathKneel で折り、ここでは力の抜けた腕と首だけ）
  if (fallen && !u.mounted) {
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
    else { rotWorld(B.LeftArm, _fwd, -(u.iwaGrounded || u.tennojiGrounded ? 0.3 : 0.9) * k2); rotWorld(B.RightArm, _fwd, (u.iwaGrounded || u.tennojiGrounded ? 0.25 : 0.7) * k2); }
    rotWorld(B.LeftForeArm, _right, -0.6 * k2); rotWorld(B.RightForeArm, _right, -0.4 * k2);
    rotWorld(B.Neck, _right, 0.4 * k2 * f);
    if (!u.death) h.model.position.y = -0.22 * k;
  }
  // 倒れる途中の体（units.js の u.death.kind。根元の倒れは units.js が回す。ここは骨の形）
  if (fallen && u.death && !u.mounted && HUM.fx && !h.far) deathBody(h, B, u.death);
  // 這う兵と、傷ついた仲間を担いで退く者。新しい骨や材質は作らず、今の骨を動かす。
  if (fallen && u.death?.crawl > 0) {
    const D = u.death, c = D.crawl, a = Math.sin(D.aidT * 4.8 + u.id);
    rotWorld(B.LeftArm, _right, -0.55 * c); rotWorld(B.RightArm, _right, -0.55 * c);
    rotWorld(B.LeftForeArm, _right, -(0.55 + 0.2 * a) * c);
    rotWorld(B.RightForeArm, _right, -(0.55 - 0.2 * a) * c);
    rotWorld(B.RightUpLeg, _right, -0.25 * (1 - a) * c); rotWorld(B.RightLeg, _right, 0.45 * (1 - a) * c);
    rotWorld(B.Neck, _right, -0.25 * c);
  }
  if (fallen && u.death?.carry > 0) {
    const c = u.death.carry;
    rotWorld(B.Spine1, _right, 0.3 * c);
    rotWorld(B.LeftUpLeg, _right, -0.4 * c); rotWorld(B.RightUpLeg, _right, -0.55 * c);
    rotWorld(B.LeftLeg, _right, 0.7 * c); rotWorld(B.RightLeg, _right, 0.9 * c);
    rotWorld(B.LeftArm, _right, -0.4 * c); rotWorld(B.RightArm, _right, -0.5 * c);
  }
  if (!fallen && u.dragging && u.dragging.death?.mercyT == null) {
    const c = u.dragging.death?.carry || 0;
    rotWorld(B.Spine, _right, 0.4 - 0.2 * c); rotWorld(B.LeftArm, _right, -0.65 - 0.6 * c); rotWorld(B.RightArm, _right, -0.65 - 0.6 * c);
    rotWorld(B.LeftForeArm, _right, -0.4); rotWorld(B.RightForeArm, _right, -0.4);
    h.model.position.y -= 0.14;
  }
  // 当たった時の体の反応（units.js の u.hit）：のけぞる・首が跳ねる・横へ折れる・よろめく
  if (u.hit && !fallen) hitReact(h, B, u.hit);
  // 押し負けた足は踏ん張ったまま滑り、腰を低くして踏み直す。
  if (!fallen && !u.mounted && !u.isPlayer && u.slipT > 0 && HUM.fx && !h.far) {
    const slip = Math.min(1, u.slipT / 0.12);
    rotWorld(B.LeftLeg, _right, 0.22 * slip); rotWorld(B.RightLeg, _right, 0.18 * slip);
    rotWorld(B.Spine, _right, 0.08 * slip); h.model.position.y -= 0.035 * slip;
  }
  // 振りの体の入り（u.swing）：振りかぶりで胸をひねり、振り抜きで戻す
  if (u.swing && !fallen && !u.mounted && w !== 'spear') {
    const q = clamp01(u.swing.t / Math.max(0.05, u.swing.dur));
    const tw = (u.swing.side || 1) * (q < 0.35 ? q / 0.35 : 1 - (q - 0.35) / 0.65) * 0.3;
    rotWorld(B.Spine1, _up, -tw); rotWorld(B.Spine, _right, 0.06 * Math.sin(q * Math.PI));
  }
  // 馬上：鞍にまたがる。腰は馬の背の弾みを受け、上体は駆ける波に合わせて揺れる
  if (u.mounted) rideHuman(h, dt);
  // 槍の突き・刀の振りに体を入れる（腰を落とし、後ろ足で押して踏み込む。馬上は鐙に立つ）
  if (!fallen && (w === 'spear' || w === 'sword')) {
    attackBody(h, B, u, w, dt);
    if (!u.mounted && !h.far) guardBody(h, B, u, dt);
  }
  // 技：時を進め、体（胸のひねり・反り・腰の沈み・足の開き）を型に合わせる。技を出すのは武将だけ（足軽・侍は出さない。軽く）
  if (!fallen && !u.mounted && (w === 'spear' || w === 'sword') && !(w === 'spear' && u.look?.spearThrust)) {
    // 豪傑（named_gear.js の gouketsu）：ほぼ毎振り技を出し、槍は頭上で大きく振り回す型を多く
    const gou = u.look?.style === 'gouketsu';
    if (!u.isPlayer && u.swing && u.swing !== h.lastSwing && !u.tech && HUM.fx && !h.far && (u.type === 'busho' || (u.look && isNamed(u.look))) && Math.random() < (gou ? 0.85 : 0.35)) {
      const L = gou ? GOU_TECH[w] : TECH_OF[w]; startTech(u, L[Math.floor(Math.random() * L.length)]);
    }
    h.lastSwing = u.swing;
    if (u.tech) { u.tech.t += dt; if (u.tech.t >= TECH[u.tech.k].dur) u.tech = null; else techBody(h, B, u); }
  } else if (u.tech) u.tech = null;
  // 横へ詰める兵も前歩きの脚で滑らせず、運ぶ方向へ腰と草鞋を向ける。
  // 胸は逆に戻して相手と得物へ残す。既存の移動量だけを使い、位置・当たりは変えない。
  let gaitYaw = 0;
  if (HUM.fx && combatGait > 0.05 && u.camD < 36 && sp > 0.25 && !reduceMotion()
    && !u.atk && !u.swing && !u.tech && !u.hit && !u.dodging && !u.downed && !u.climb
    && !u.perch && !u.naka && !(u.slipT > 0) && !(u.stagger > 0) && !(u.woundRest > 0.01)) {
    const along = dx * _fwd.x + dz * _fwd.z, across = dx * _right.x + dz * _right.z;
    const reverse = h.backK < 0 ? -1 : 1;
    if (Math.hypot(dx, dz) > 0.0001) {
      gaitYaw = Math.max(-1.05, Math.min(1.05, Math.atan2(across * reverse, along * reverse)))
        * combatGait * ease(0.25, 0.7, sp);
    }
  }
  h.gaitYaw = (h.gaitYaw || 0) + (gaitYaw - (h.gaitYaw || 0)) * Math.min(1, dt * 9);
  if (!fallen && !u.mounted && !u.isPlayer && !h.far && HUM.fx && !reduceMotion() && Math.abs(h.gaitYaw) > 0.005) {
    rotWorld(B.Hips, _up, h.gaitYaw);
    rotWorld(B.Spine, _up, -h.gaitYaw);
  } else h.gaitYaw = 0;
  // 構え・突き・斬りの足は地を踏む：止まって戦う者の、浮いた足を地面へ下ろす（前の足を上げたまま宙に浮いて見えないよう）
  const plantCombat = !fallen && !u.mounted && !(u.woundRest > 0.01) && !(u.slipT > 0) && (w === 'spear' || w === 'sword') && HUM.fx && !h.far && WORLD && (h.spd || 0) < 0.8 && (st > 0.2 || (h.atkB && h.atkB.W + h.atkB.L > 0.02)) && !(u.isPlayer && (u.fpk || 0) > 0.5) && !u.dodging && !(u.hit && u.hit.kind === 'kneel') && !u.climb && !u.downed && !u.perch && !u.naka;
  // 共通の戦場指定も、近い十八人の足合わせの枠内で働かせる。
  const plantBattle = (u.tennojiGrounded || WORLD?.def.meleeGroundedFeet && (u.isPlayer || h.groundFeet)) && HUM.fx && !fallen && !u.mounted && !u.climb && !u.downed && !u.perch && !u.dodging && !u.naka && WORLD && !h.far && (u.atk || u.swing || engaged) && (w === 'spear' || w === 'sword');
  // 被弾の接地も既存の近景の人数枠を使う。交戦相手を失った直後も足で受ける。
  const plantHit = u.hit && u.hit.kind !== 'kneel' && !fallen && !u.isPlayer && !u.mounted
    && !u.climb && !u.downed && !u.perch && !u.dodging && !u.naka && WORLD && HUM.fx && !h.far && h.groundFeet;
  // 駆け寄る間は歩行の支持脚を使う。両足を固定して腰だけ進ませない。
  if ((plantCombat && (u.isPlayer || h.groundFeet)) || (plantBattle && (h.spd || 0) < 0.8) || plantHit) plantFeet(h, B, dt);
  else {
    h.combatFeetReady = false;
    if ((h.groundFeet || u.isPlayer) && HUM.fx && WORLD && !h.far && !fallen && !u.mounted && !u.climb && !u.downed &&
        !u.perch && !u.naka && !u.dodging && !(u.slipT > 0) && !(h.kneelK > 0.01)) footPlant(h, B, dt);
  }
  // 頭：体が傾いても顔は前を見る（首で七割ほど戻す）
  if (B.HeadTop_End && !fallen) {
    B.Head.getWorldPosition(v0); B.HeadTop_End.getWorldPosition(_tgt);
    const up = _tgt2.copy(_tgt).sub(v0); const L = up.length(); up.multiplyScalar(1 / L);
    up.lerp(_up, 0.7).normalize();
    aimBone(B.Head, _tgt, _pole.copy(v0).addScaledVector(up, L));
  }
  // 見回す：待つ間は時々よそを見、戦う時は敵へ目を向ける
  if (!fallen && !h.far) lookAround(h, B, dt, engaged, wIdle);
  if (h.expr && !h.far) faceExpr(h, u, dt, engaged);
  // 腕：武器の握りへ（本編の手の位置＝ u.hand）
  if (arms && u.hand && !fallen && (!u.dragging || u.dragging.death?.mercyT != null) && u.wpn && u.wpn.parent) { if (!cmdPose(h, B, dt, time, w, engaged)) armsPose(h, B, dt, time, w); }
  else {
    if (h.cmdHid || h.saihai) cmdOff(h);
    // 馬上で武器を持たない（納めた）：両手で手綱を持つ
    if (arms && u.mounted && !fallen) reinPose(h, B, u, u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, true);
  }
  // 手首のねじれを前腕へ半分分ける（柄を握る手を返すと、手首の皮が飴の包み紙のように細くねじれて帯に見えるので）
  if (!h.far && h.body && h.body.visible !== false) { spreadTwist(B, 'Left'); spreadTwist(B, 'Right'); }
  // 指：武器を持つ手は柄を握り、空いた手は力を抜いて軽く曲げる（開いた人形の手にしない）
  if (HUM.fx && !h.far && SRC.fingers) {
    const has = !!(u.wpn && u.wpn.parent && u.wpn.visible !== false) && w && (w !== 'none' || u.look?.standard);
    const alive = !fallen;
    const shouldered = !u.mounted && !(u.isPlayer && (u.fpk || 0) > 0.5) && (w === 'spear' ? (h.upK || 0) > 0.5 : w === 'gun' && u.hand && u.hand.rotation.x < -0.4 && !u.lh);
    // 一人称の本人は柄・手綱を強く握り込む（指先が柄・拳に沈む。緩い鉤の手に見せない）
    const tight = u.isPlayer && (u.fpk || 0) > 0.5 ? 1 : 0;
    // 受けと突きの拍子だけ柄を握り込み、戻す時は指の力をゆるめる。
    const gripLoad = alive && has && !shouldered && !reduceMotion() && (w === 'spear' || w === 'sword')
      ? Math.min(1, Math.max(u.contactLoad || 0, u.contactDrive || 0)) * 0.07 : 0;
    const gR = !alive ? 0.25 : h.saihai && h.saihai.visible ? 1 : has ? (w === 'bow' ? 0.6 : 1 + 0.1 * tight + gripLoad) : u.mounted && alive ? 1.2 : 0.52;
    const spearRun = w === 'spear' && (h.spd || 0) > 2.6;
    const gL = !alive ? 0.2 : u.look?.standard ? 0.2 : u.mounted ? 1.2 + 0.1 * tight : has && (!shouldered || spearRun) ? 1 + (w === 'bow' ? 0 : 0.1 * tight + gripLoad) : 0.52;
    // 握りが変わった時だけ曲げ直す（録った動きは指を動かさないので、曲げた形がそのまま残る）
    // 一人称の本人は毎コマ握り直す（振る・突く動きが指を開いても、柄を握った拳のまま）
    if (h.gR === undefined || Math.abs(gR - h.gR) > 0.02 || tight) { h.gR = h.gR === undefined ? gR : h.gR + (gR - h.gR) * Math.min(1, dt * 10); curlFingers(h, 'Right', h.gR); }
    if (h.gL === undefined || Math.abs(gL - h.gL) > 0.02 || tight) { h.gL = h.gL === undefined ? gL : h.gL + (gL - h.gL) * Math.min(1, dt * 10); curlFingers(h, 'Left', h.gL); }
  }
  // 甲冑の遅れた揺れ（草摺・袖）：体の上下と前後の速さの変わりから、ばねで
  // 倒れた人の手足が地面にめり込まないよう持ち上げる
  // 倒れた後の寝姿：人ごとに四通り（身を丸める・胸へ手を寄せる・片膝を折る・腰がねじれる）。頭は横へ落ち、ゆっくり形に落ち着く
  if (fallen && !u.mounted && u.death && u.death.kind !== 'unhorse') {
    const r = ease(0.9, 2.2, u.death.t || 0);
    if (r > 0.01) {
      const vk = Math.floor(((h.seed * 7.77) % 1) * 4), sd = h.seed > 0.5 ? 1 : -1;
      if (vk === 0) { rotWorld(B.LeftUpLeg, _right, -0.5 * r); rotWorld(B.RightUpLeg, _right, -0.45 * r); rotWorld(B.LeftLeg, _right, 0.7 * r); rotWorld(B.RightLeg, _right, 0.8 * r); rotWorld(B.Spine1, _right, 0.25 * r); rotWorld(B.LeftArm, _right, -0.4 * r); rotWorld(B.RightArm, _right, -0.5 * r); }
      else if (vk === 1) { rotWorld(B.LeftArm, _right, -0.45 * r); rotWorld(B.RightArm, _right, -0.65 * r); rotWorld(B.LeftForeArm, _right, -0.55 * r); rotWorld(B.RightUpLeg, _right, -0.4 * r); rotWorld(B.RightLeg, _right, 0.7 * r); }
      else if (vk === 2) { rotWorld(sd > 0 ? B.RightArm : B.LeftArm, _right, -1.1 * r); rotWorld(sd > 0 ? B.RightForeArm : B.LeftForeArm, _right, 0.3 * r); rotWorld(sd > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.6 * r); rotWorld(sd > 0 ? B.LeftLeg : B.RightLeg, _right, 0.9 * r); }
      else { rotWorld(B.Hips, _up, 0.35 * sd * r); rotWorld(B.Spine1, _up, -0.25 * sd * r); rotWorld(B.RightUpLeg, _right, -0.3 * r); rotWorld(B.RightLeg, _right, 0.6 * r); }
      // 首は力が抜けて横へ落ちる
      rotWorld(B.Neck, _up, 0.5 * sd * r); rotWorld(B.Head, _fwd, 0.25 * sd * r);
      // 手首と指も垂れる
      rotWorld(B.LeftHand, _right, 0.4 * r); rotWorld(B.RightHand, _right, 0.35 * r);
    }
  }
  if (fallen && u.tennojiGrounded && !u.mounted && !(u.death?.carry > 0)) {
    // 斬りの最後の肩のひねりを亡骸へ残さない。腕の付け根は元の関節の所へ戻す。
    for (const sd of ['Left', 'Right']) {
      const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'], template = SRC.template?.bones;
      if (sh && template?.[sd + 'Shoulder']) {
        sh.position.copy(template[sd + 'Shoulder'].position);
        sh.quaternion.copy(template[sd + 'Shoulder'].quaternion);
        sh.updateMatrix();
      }
      if (ar && template?.[sd + 'Arm']) {
        ar.position.copy(template[sd + 'Arm'].position);
        ar.quaternion.slerp(template[sd + 'Arm'].quaternion, .45);
        ar.updateMatrix();
      }
    }
    h.model.updateMatrixWorld(true);
  }
  if (fallen && WORLD?.def.settledFalls && !u.mounted && u.death &&
      !u.death.floor && !u.death.aid && !(u.death.carry > 0) && u.death.t > 0.9) {
    // 手足の沈みだけを直すと、胴が宙に残る。胴・腰・頭が土へ触れる高さまで下ろす。
    h.model.updateMatrixWorld(true);
    let drop = 0.35;
    for (let i = 0; i < 3; i++) {
      const bone = i === 0 ? B.Hips : i === 1 ? B.Spine2 : B.Head;
      if (!bone) continue;
      bone.getWorldPosition(_T);
      drop = Math.min(drop, _T.y - WORLD.heightAt(_T.x, _T.z) - 0.16);
    }
    if (drop > 0.01) {
      _P.setFromMatrixPosition(h.model.matrixWorld);
      _P.y -= drop * ease(0.9, 1.5, u.death.t);
      h.model.parent.worldToLocal(_P);
      h.settledX = _P.x - h.model.position.x;
      h.settledY = _P.y - h.model.position.y;
      h.settledZ = _P.z - h.model.position.z;
      h.settledOffset = true;
      h.model.position.copy(_P);
      h.model.updateMatrixWorld(true);
    }
  }
  if (fallen && !u.mounted && !(u.death?.carry > 0)) groundLimbs(h);
  if (fallen && (u.igaGrounded || u.tennojiGrounded) && !u.mounted && !h.far) {
    // 伊賀の近景の亡骸：地面へ腕を戻した後、手首を前腕とつなぐ。
    straightWrist(B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1);
    straightWrist(B.RightForeArm, B.RightHand, B.RightHandMiddle1);
    spreadTwist(B, 'Left'); spreadTwist(B, 'Right');
  }
  // 倒れて陣笠が落ちた（units.js が地面に笠を置いた）：頭の笠は隠す
  if (u.hatOff && !h.hatOff) { h.hatOff = true; if (h.xb && h.xb.swHat) h.xb.swHat.matrix.makeScale(0, 0, 0); if (h.parts.hat) h.parts.hat.visible = false; }
  // 倒れた人は草摺・袖を揺らさない（寝た体の甲冑がばねで震えないよう、元の形へ戻して止める）
  if (fallen) { if (h.sw) { h.sw.a = h.sw.va = h.sw.b = h.sw.vb = 0; } if (fine || h.sw || u.iwaFlagRig || u.tennojiFlagRig) sway(h, 0); }
  else sway(h, dt);
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
    // 房：短冊を短く束ねる。正の y 軸を下へ向けるのは cmdPose の共通処理。
    const strips = [];
    for (let i = 0; i < 24; i++) {
      const L = 0.12 * (0.85 + (i % 4) * 0.05);
      const st = new THREE.PlaneGeometry(0.013, L, 1, 3); st.translate(0, L / 2, 0);
      { const p = st.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, 0.08 * y * y / L); } }
      const a = i * 2.39996;
      st.rotateY(a); st.rotateZ(0.06 * Math.cos(a));
      st.translate(0.01 * Math.cos(a), 0, 0.01 * Math.sin(a));
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
  const tg = lookTarget(u, _tgt2) ? _tgt2 : null, near = !!tg && Math.hypot(tg.x - u.pos.x, tg.z - u.pos.z) < 7;
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
    // 武将ごとの采配の癖（GENERALS の cmd）：bold 大きく振り下ろす・lively 指して振る事が多い・calm 構えて掲げる事が多い
    const gd = (typeof h.look.face === 'string' && GENERALS[h.look.face.slice(2)]) || {};
    const P = gd.cmd === 'bold' ? [0.28, 0.42, 0.62, 0.74] : gd.cmd === 'lively' ? [0.2, 0.32, 0.62, 0.86] : gd.cmd === 'calm' ? [0.5, 0.78, 0.92, 0.97] : [0.36, 0.56, 0.8, 0.92];
    const r = Math.random();
    C.mode = r < P[0] ? 0 : r < P[1] ? 1 : r < P[2] ? 2 : r < P[3] ? 3 : 4;
    C.yaw = (Math.random() - 0.5) * 0.9;
    C.t = C.mode === 0 ? 3 + Math.random() * 4 : C.mode === 3 ? 1.6 : C.mode === 4 ? 1.3 : 2 + Math.random() * 2;
    C.t0 = C.t;
  }
  // 胸を張る（馬上は小さく）。馬上の武将は腰を据えて背を立て、顎を引いて前を見下ろす
  const mk = u.mounted ? 0.4 : 1;
  rotWorld(B.Spine1, _right, -0.05 * mk); rotWorld(B.Spine2, _right, -0.06 * mk);
  if (u.mounted) { rotWorld(B.Spine, _right, -0.05); rotWorld(B.Neck, _right, 0.06); }
  // 右手の置き所（肩からの、体の右・上・前の量）
  let tx = 0.06, ty = -0.4, tz = 0.2;
  if (C.mode === 1) { tx = 0.0; ty = -0.14; tz = 0.34; }
  else if (C.mode === 4) {
    // 号令の振り下ろし：頭の上へ高く掲げ、溜めてから、前へ一気に振り下ろして止める
    const q = 1 - clamp01(C.t / (C.t0 || 1.3));
    tx = 0.05 + Math.sin(C.yaw) * 0.2; tz = q < 0.45 ? 0.15 : 0.5 * Math.cos(C.yaw); ty = q < 0.45 ? 0.42 : q < 0.6 ? 0.42 - (q - 0.45) / 0.15 * 0.5 : -0.08;
    if (q > 0.45 && q < 0.62) rotWorld(B.Spine1, _right, 0.08);
  } else if (C.mode >= 2) {
    tx = Math.sin(C.yaw) * 0.5 + 0.02; tz = Math.cos(C.yaw) * 0.5; ty = 0.06 + (C.mode === 3 ? Math.sin(time * 7) * 0.12 : 0);
  }
  const k = Math.min(1, dt * (C.mode === 4 ? 12 : 3));
  C.cur.x += (tx - C.cur.x) * k; C.cur.y += (ty - C.cur.y) * k; C.cur.z += (tz - C.cur.z) * k;
  B.RightArm.getWorldPosition(_ch);
  _tgt.copy(_ch).addScaledVector(_right, C.cur.x).addScaledVector(_up, C.cur.y).addScaledVector(_fwd, C.cur.z);
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, _pole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -1).addScaledVector(_fwd, -0.2));
  // 指す時は、顔もそちらへ
  if (C.mode >= 2) { const a = C.yaw * clamp01(C.cur.y + 0.4); rotWorld(B.Neck, _up, a * 0.35); rotWorld(B.Head, _up, a * 0.3); }
  // 左手：馬上は手綱、徒は太刀の柄に置く
  if (u.mounted) reinPose(h, B, u, u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, false);
  else if (h.parts.koshi) {
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

// 倒れた体の接地。調べる関節の表は使い回し、毎コマ配列を作らない。
const FALL_SUPPORT = [['Hips', 0.16], ['Spine2', 0.2]];
const LIMBS = [['LeftArm', 'LeftForeArm', 0.08], ['LeftForeArm', 'LeftHand', 0.06],
  ['RightArm', 'RightForeArm', 0.08], ['RightForeArm', 'RightHand', 0.06],
  ['LeftUpLeg', 'LeftLeg', 0.08], ['LeftLeg', 'LeftFoot', 0.06],
  ['RightUpLeg', 'RightLeg', 0.08], ['RightLeg', 'RightFoot', 0.06]];
let WORLD = null, ARMY = null;
function groundLimbs(h) {
  if (!WORLD) return;
  const B = h.bones;
  // 回廊・上階では下の庭へ手足を引かない。救助中は体を下ろさない。
  const floor = h.u.corpseFloorY ?? (h.u.death?.floor ? h.u.pos.y : undefined);
  const settle = (!h.far || floor !== undefined || WORLD.def.settleFallenLimbs) && !h.u.death?.aid
    ? ease(0.9, 2.2, h.u.death?.t || 0) : 0;
  // 鳥取は軽い姿も腰と胸で支える。手足だけを下ろして胴が浮くのを防ぐ。
  // 指定のない戦は従来どおり近景だけ。止まった亡骸の姿は既存の処理で使い回す。
  // 根元の倒れと別に骨を下ろすので、兵の位置や当たり、救助の進行には触れない。
  if (settle > 0 && (!h.far || WORLD.def.settleFallenBody)) {
    let shift = -Infinity;
    for (let i = 0; i < FALL_SUPPORT.length; i++) {
      const support = FALL_SUPPORT[i];
      B[support[0]].getWorldPosition(_T);
      shift = Math.max(shift, (floor ?? groundAt(WORLD, _T.x, _T.z, h.u.pos.y)) + support[1] - _T.y);
    }
    if (Math.abs(shift) > 0.005) {
      h.model.getWorldPosition(_T); _T.y += shift * settle;
      h.model.position.copy(h.model.parent.worldToLocal(_T));
      // 手足の座標を読む時に必要な骨の枝だけ更新する。ここで全身を辿り直さない。
      h.model.updateWorldMatrix(true, false);
    }
  }
  for (let i = 0; i < LIMBS.length; i++) {
    const limb = LIMBS[i], root = B[limb[0]], end = B[limb[1]], lift = limb[2];
    for (let k = 0; k < 2; k++) {
      end.getWorldPosition(_T);
      const gy = (floor ?? groundAt(WORLD, _T.x, _T.z, h.u.pos.y)) + lift;
      if (_T.y >= gy - 0.005 && (!settle || _T.y <= gy + 0.005)) break;
      _P.copy(_T); _P.y = _T.y > gy ? _T.y + (gy - _T.y) * settle : gy;
      aimBone(root, _T, _P);
    }
  }
}
// 当たった時の反応：envelope は当たってすぐ強く、ゆっくり戻る
function hitReact(h, B, H) {
  const q = clamp01(H.t / Math.max(0.05, H.dur || 0.4));
  // 当たりごとに崩れの大きさを変える（同じ打たれ方を皆が同じ形でしない）。深手ほど大きい
  if (H.amp === undefined) H.amp = (0.75 + Math.random() * 0.5) * (H.heavy ? 1.3 : 1);
  // 深手でも胸・首・斬られた肩の角度を足し過ぎない。強さは膝の沈みで受ける。
  const e = Math.sin(Math.min(1, q * 2.2) * Math.PI / 2) * (1 - ease(0.3, 1, q)) * Math.min(1.15, H.amp);
  const sd = H.side || (h.seed > 0.5 ? 1 : -1);
  const k = H.kind;
  // 体の崩れ：重い当たりは膝が抜けて腰が落ち、遅れて立て直す（上体だけが揺れる人形にしない）
  if (HUM.fx && !h.far && k !== 'flinch' && k !== 'kneel' && !h.u.mounted) {
    const kn = e * (H.heavy ? 0.55 : 0.25);
    const a = sd > 0 ? B.RightLeg : B.LeftLeg, b = sd > 0 ? B.LeftLeg : B.RightLeg;
    rotWorld(a, _right, 0.5 * kn); rotWorld(b, _right, 0.3 * kn);
    rotWorld(B.LeftUpLeg, _right, -0.2 * kn); rotWorld(B.RightUpLeg, _right, -0.2 * kn);
    h.model.position.y -= 0.05 * kn;
  }
  if (k === 'flinch') { rotWorld(B.Spine1, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.25 * e); rotWorld(B.Head, _fwd, 0.15 * sd * e); }
  else if (k === 'recoil') { rotWorld(B.Spine, _right, -0.22 * e); rotWorld(B.Spine2, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.3 * e); rotWorld(B.Spine1, _up, 0.12 * sd * e); }
  else if (k === 'side') { rotWorld(B.Spine, _fwd, 0.3 * sd * e); rotWorld(B.Spine2, _up, 0.25 * sd * e); rotWorld(B.Head, _fwd, 0.2 * sd * e); }
  else if (k === 'kneel' && !h.u.mounted && !h.u.isPlayer) {
    // 当たりで胸が先に跳ね、遅れて片膝が折れる。立ち直る時は足の上へ胸を戻す。
    const down = ease(0.03, 0.24, q) * (1 - ease(0.58, 1, q));
    const rise = Math.sin(ease(0.58, 1, q) * Math.PI) * 0.25;
    const frontU = sd > 0 ? B.LeftUpLeg : B.RightUpLeg, frontL = sd > 0 ? B.LeftLeg : B.RightLeg;
    const rearU = sd > 0 ? B.RightUpLeg : B.LeftUpLeg, rearL = sd > 0 ? B.RightLeg : B.LeftLeg;
    rotWorld(frontU, _right, -0.85 * down); rotWorld(frontL, _right, 1.35 * down);
    rotWorld(rearU, _right, 0.12 * down); rotWorld(rearL, _right, 1.45 * down);
    rotWorld(B.Spine, _right, -0.18 * e * (1 - down) + 0.22 * down + rise);
    rotWorld(B.Spine1, _fwd, 0.12 * sd * down); rotWorld(B.Neck, _right, -0.15 * e);
    h.model.position.y = Math.min(h.model.position.y, -0.31 * down);
  }
  else if (k === 'stumble') {
    rotWorld(B.Spine, _right, 0.2 * e); rotWorld(B.RightUpLeg, _right, 0.35 * e); rotWorld(B.LeftUpLeg, _right, -0.3 * e); rotWorld(B.LeftLeg, _right, 0.5 * e);
    rotWorld(B.LeftArm, _fwd, -0.4 * e);
    h.model.position.y -= 0.06 * e;
  }
  const cut = !h.u.mounted && !h.u.isPlayer ? cutReaction(H, h.u.id) : 0;
  // 肩を引かれて折れる／胸を押し返される／片脚が抜けて横へ崩れる。
  if (cut === 1) {
    rotWorld(B.Spine, _right, 0.3 * e); rotWorld(B.Spine1, _up, 0.22 * sd * e);
    rotWorld(B.Neck, _right, 0.16 * e);
  } else if (cut === 2) {
    rotWorld(B.Spine, _right, -0.2 * e); rotWorld(B.Hips, _fwd, 0.12 * sd * e);
    rotWorld(sd > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.24 * e);
  } else if (cut === 3) {
    rotWorld(B.Spine, _right, 0.16 * e); rotWorld(B.Hips, _fwd, -0.25 * sd * e);
    rotWorld(sd > 0 ? B.RightLeg : B.LeftLeg, _right, 0.42 * e);
    h.model.position.y -= 0.06 * e;
  }
}

// 倒れる途中の骨の形（倒れ切った後は少し残して、寝姿がねじれないよう弱める）
//   crumple：膝から崩れる。背が丸まり、首が落ち、両膝が折れる
//   forward：前へつんのめる。片足が泳いで前へ出て、上体が前へ折れ、手を前へ突こうとする
//   back：後ろへ吹っ飛ぶ。背が反り、首が後ろへ跳ね、腕が宙へ投げ出され、脚が前へ浮く
//   side：横へ崩れる。倒れる側の腰が落ち、体が横へ折れ、反対の腕が泳ぐ
function deathBody(h, B, D) {
  const paceK = Math.max(0, 1 - (D.t || 0) / DEATH_END);
  const t = (D.t || 0) / (1 + ((D.pace || 1) - 1) * paceK);
  const pv = h.dvar || (h.dvar = 0.8 + h.seed * 0.45);
  const hit = h.u.lastHit;
  const force = Math.min(1, (h.deathSpeed || 0) / 6 + (hit && (hit.heavy || hit.wkind === 'gun') ? 0.45 : 0));
  // 勢いがあるほど、胸に遅れて手足が投げ出される。着地後は力を抜いた寝姿へ戻す。
  const fling = Math.sin(ease(0.04, 0.7, t) * Math.PI) * force;
  const on = ease(0, 0.18, t) * (1 - 0.65 * ease(0.8, 1.6, t)) * pv;
  if (on < 0.01) return;
  const sd = D.side || 1;
  rotWorld(B.Hips, _up, 0.12 * sd * fling); rotWorld(B.Spine2, _up, -0.18 * sd * fling);
  rotWorld(B.LeftForeArm, _right, -0.22 * fling); rotWorld(B.RightForeArm, _right, -0.35 * fling);
  if (D.kind === 'crumple') {
    const c = on * ease(0.05, 0.6, t);
    rotWorld(B.Spine, _right, 0.25 * c); rotWorld(B.Spine1, _right, 0.3 * c); rotWorld(B.Neck, _right, 0.45 * c);
    rotWorld(B.LeftLeg, _right, 0.5 * c); rotWorld(B.RightLeg, _right, 0.35 * c);
    rotWorld(B.Spine2, _fwd, (h.seed - 0.5) * 0.4 * c);
  } else if (D.kind === 'forward') {
    // 泳ぐ足：はじめの 0.35 秒で片足が前へ出て、支えきれずに折れる
    const st_ = Math.sin(clamp01(t / 0.45) * Math.PI) * on;
    const fU = sd > 0 ? B.LeftUpLeg : B.RightUpLeg, fL = sd > 0 ? B.LeftLeg : B.RightLeg;
    rotWorld(fU, _right, -(0.7 + 0.25 * force) * st_); rotWorld(fL, _right, 0.6 * st_);
    rotWorld(B.Spine, _right, 0.35 * on); rotWorld(B.Spine1, _right, 0.25 * on);
    rotWorld(B.Neck, _right, -0.3 * on);   // 顔は地面を見まいと上がる
    // 腕は前へ（地に手を突こうとする）
    rotWorld(B.LeftArm, _right, -0.9 * on); rotWorld(B.RightArm, _right, -0.8 * on);
  } else if (D.kind === 'back') {
    const w = on * (1 - ease(0.1, 0.7, t) * 0.4) * (1 + 0.25 * force);
    rotWorld(B.Spine, _right, -0.35 * w); rotWorld(B.Spine1, _right, -0.2 * w); rotWorld(B.Neck, _right, -0.55 * w);
    // 腕は宙へ投げ出される（左右で高さを変える）
    rotWorld(B.LeftArm, _fwd, -1.1 * w); rotWorld(B.RightArm, _fwd, (0.8 + h.seed * 0.5) * w);
    rotWorld(B.LeftArm, _right, -0.4 * w * h.seed);
    // 脚は前へ浮く
    rotWorld(B.LeftUpLeg, _right, -0.45 * w); rotWorld(B.RightUpLeg, _right, -0.25 * w);
  } else if (D.kind === 'side') {
    rotWorld(B.Spine, _fwd, 0.35 * sd * on); rotWorld(B.Spine1, _fwd, 0.2 * sd * on);
    const dn = sd > 0 ? B.RightLeg : B.LeftLeg, up = sd > 0 ? B.LeftUpLeg : B.RightUpLeg;
    rotWorld(dn, _right, 0.9 * on); rotWorld(up, _fwd, -0.3 * sd * on);
    rotWorld(sd > 0 ? B.LeftArm : B.RightArm, _fwd, -0.9 * sd * on);
    rotWorld(B.Neck, _fwd, -0.3 * sd * on);
  }
}

// 待つ間の暮らし：ときどき重心を片足へ移して長く休め、武器を持ち直し（肩をゆすって握りを確かめる）、首を回す
//   人ごとに間合いと癖が違う（せわしない人・じっとしている人）
function idleLife(h, B, dt, wIdle, st) {
  const I = h.idle || (h.idle = { t: 1 + h.seed * 6, lean: 0, leanT: 0, grip: -1, neck: -1, rate: 0.6 + ((h.seed * 19.3) % 1) * 0.9 });
  const k = wIdle * (1 - st);
  I.t -= dt * I.rate;
  if (I.t <= 0) {
    const r = Math.random();
    if (r < 0.45) { I.leanT = I.leanT > 0 ? -1 : I.leanT < 0 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 1 : -1); I.t = 4 + Math.random() * 6; }
    else if (r < 0.8) { I.grip = 0; I.t = 3 + Math.random() * 5; }
    else { I.neck = 0; I.t = 3 + Math.random() * 4; }
  }
  // 片足へ重心：休める足の膝がゆるみ、腰がそちらへ落ち、肩は逆へ傾く
  I.lean += (I.leanT - I.lean) * Math.min(1, dt * 1.2);
  const l = I.lean * k;
  if (Math.abs(l) > 0.01) {
    rotWorld(B.Hips, _fwd, 0.07 * l); rotWorld(B.Spine1, _fwd, -0.06 * l); rotWorld(B.Neck, _fwd, -0.03 * l);
    rotWorld(l > 0 ? B.LeftLeg : B.RightLeg, _right, 0.22 * Math.abs(l)); rotWorld(l > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.06 * Math.abs(l));
    h.model.position.y -= 0.01 * Math.abs(l);
    h.model.position.x += 0.008 * l;
  }
  // 持ち直し：一度沈んで、肩をすくめ、胸をひねって握りを確かめる（0.9 秒）
  if (I.grip >= 0) {
    I.grip += dt;
    const g = Math.sin(clamp01(I.grip / 0.9) * Math.PI) * k;
    rotWorld(B.Spine2, _up, -0.1 * g); rotWorld(B.Spine2, _right, -0.05 * g);
    h.model.position.y += 0.012 * Math.sin(clamp01(I.grip / 0.9) * Math.PI * 2) * k;
    for (const sd of ['Left', 'Right']) {
      const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'];
      if (sh && ar) { ar.getWorldPosition(_T); _P.copy(_T); _P.y += 0.025 * g; aimBone(sh, _T, _P); }
    }
    if (I.grip > 0.9) I.grip = -1;
  }
  // 首を回す：凝った首を左右へ倒す
  if (I.neck >= 0) {
    I.neck += dt;
    const n = Math.sin(clamp01(I.neck / 1.6) * Math.PI * 2) * Math.sin(clamp01(I.neck / 1.6) * Math.PI) * k;
    rotWorld(B.Neck, _fwd, 0.22 * n); rotWorld(B.Head, _right, 0.1 * Math.abs(n));
    if (I.neck > 1.6) I.neck = -1;
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
  // 接触中は受け・突きの膝も重なる。構えだけを浅くし、片膝まで沈む二重曲げを防ぐ。
  const stance = st * (1 - clamp01(u.contactBrace || 0) * 0.45);
  lf += -0.45 * stance * V.f; lk += 0.55 * stance * V.kn; rf += -0.15 * stance * (2 - V.f); rk += 0.45 * stance * V.kn; drop += 0.035 * st * (V.kn + V.f) * 0.5; spread += 0.06 * st * V.sp;
  // 半身の構えでは後ろ足にも重みを残し、足首で膝の曲がりを戻して足裏を寝かせる。
  h.model.position.z -= 0.018 * st;
  if (st > 0.05) { rotWorld(B.LeftFoot, _right, (0.45 * V.f - 0.55 * V.kn) * stance); rotWorld(B.RightFoot, _right, (0.15 * (2 - V.f) - 0.45 * V.kn) * stance); }
  // 足先の向き（外へ開く人・まっすぐの人）
  if (st > 0.05) { rotWorld(B.LeftUpLeg, _up, 0.12 * V.out * st); rotWorld(B.RightUpLeg, _up, -0.25 * (0.6 + V.out) * st); }
  // 横へ開く足と、後から寄せる足を交互に運ぶ。膝を緩めたまま足を交差させない。
  // 骨と歩みの時計を使い回し、接地は後段の共通補正で坂にも合わせる。
  const side = !h.far && !u.isPlayer && h.closeGait > 0.01 && HUM.fx && !reduceMotion()
    && !u.fleeing && !u.hit && !u.dodging && !u.downed && !u.climb && !(u.stagger > 0)
    && !(u.pinT > (ARMY?.time ?? 0)) && (w === 'spear' || w === 'sword')
    ? (h.gaitSide || 0) * clamp01((sp - 0.2) / 0.6) : 0;
  if (Math.abs(side) > 0.01) {
    const ph = h.gaitPhase * Math.PI * 2, shift = Math.sin(ph) * side;
    const weight = Math.abs(side), liftL = Math.max(0, Math.cos(ph) * Math.sign(side)) * weight;
    const liftR = Math.max(0, -Math.cos(ph) * Math.sign(side)) * weight;
    spread += 0.14 * weight;
    rotWorld(B.LeftUpLeg, _fwd, shift * 0.12);
    rotWorld(B.RightUpLeg, _fwd, -shift * 0.12);
    lf -= 0.07 * liftL; rf -= 0.07 * liftR;
    lk += 0.16 * liftL + 0.08 * weight; rk += 0.16 * liftR + 0.08 * weight;
    rotWorld(B.Spine, _fwd, -side * 0.045);
    h.model.position.x += side * 0.018;
    drop += 0.025 * weight;
  }
  // 突きの踏み込みは attackBody でまとめ、叩きは両膝で受ける
  if (u.strikeT > 0 && w !== 'spear' && w !== 'sword') { const s = Math.sin((1 - u.strikeT / 0.2) * Math.PI); lf -= 0.3 * s; rf += 0.22 * s; drop += 0.05 * s; }
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

const _fp = [new THREE.Vector3(), new THREE.Vector3()], _fk = new THREE.Vector3();
const _pf = new THREE.Vector3(), _pfp = new THREE.Vector3();
function plantFeet(h, B, dt) {
  const R = SRC.rest;
  if (!R || !R.LeftFoot || !R.RightFoot) return;
  // 関節の getWorldPosition と逆運動学が必要な親だけを更新する。
  // 人体・甲冑・指を含む全子孫の強制更新を、足合わせの前後に繰り返さない。
  h.root.getWorldScale(_pfp);
  const scaleY = Math.max(0.01, _pfp.y);
  // 腰の踏み込みを足先へそのまま写すと、両足が地面を滑ってしまう。
  // 止まって戦う近い徒歩だけ接地点を覚え、後ろ足を残して前足を踏み直す。
  // 足の目標だけを変え、兵の位置・当たり・攻撃の時計には触れない。
  const u = h.u;
  const hit = u.hit && u.hit.kind !== 'kneel' && !u.hit.tumble ? u.hit : null;
  const lock = !h.far && !u.isPlayer && (!u.hit || hit) && (hit || !(u.stagger > 0)) && !u.fleeing
    && !u.downed && !(h.kneelK > 0.01) && (hit || (h.spd || 0) < 0.25) && !reduceMotion();
  // 胴の伸びに足を直結すると、命中する瞬間も草鞋が滑り、戻しも地面を擦る。
  // 今ある攻撃の時計で「足を運ぶ→接地して打つ→足を上げて戻す」を分ける。
  // 後ろ足は固定。人ごとの歩幅と残心の長さだけを変え、攻撃の拍子は変えない。
  const swing = lock && !hit ? u.swing : null;
  let step = 0, lift = 0;
  if (swing && !swing.ranged && !swing.bow) {
    const hitAt = Math.max(0.08, swing.dur * (swing.at ?? 0.5));
    const landAt = Math.max(0.05, hitAt - 0.025);
    const returnAt = Math.max(hitAt + 0.08 + h.seed * 0.04, swing.dur * 0.7);
    const advance = ease(0, landAt, swing.t);
    const recover = ease(returnAt, swing.dur + 0.26, swing.t);
    const stride = (u.wpnKind || u.lookWeapon) === 'spear' ? 0.14 : 0.1;
    step = (stride + h.seed * 0.06) * advance * (1 - recover);
    // 前足は当たりより先に下ろし、残心の間は足裏を地につけて腰を受ける。
    // 往復とも端で高さと速さがゼロになる弧。毎コマの入れ物は作らない。
    const arc = advance < 1 ? advance : recover;
    lift = 16 * arc * arc * (1 - arc) * (1 - arc) * (0.035 + h.seed * 0.015);
  }
  if (lock) {
    // 一人につき一度だけ確保し、構えを解いても同じ入れ物を使い回す。
    if (!h.combatFeet) h.combatFeet = new Float64Array(4);
    if (!h.combatFeetReady || h.combatHit !== hit || Math.hypot(u.pos.x - h.combatFeetX, u.pos.z - h.combatFeetZ) > (hit ? 0.7 : 0.32)
      || Math.abs(angleDiff(h.combatFeetHeading, u.heading)) > (hit ? 0.35 : 1.1)
      || Math.abs(u.pos.y - h.combatFeetY) > 0.15) {
      B.LeftFoot.getWorldPosition(_fp[0]); B.RightFoot.getWorldPosition(_fp[1]);
      for (let i = 0; i < 2; i++) {
        h.combatFeet[i * 2] = _fp[i].x - (i ? 0 : _fwd.x * step);
        h.combatFeet[i * 2 + 1] = _fp[i].z - (i ? 0 : _fwd.z * step);
      }
      h.combatFeetX = u.pos.x; h.combatFeetZ = u.pos.z; h.combatFeetY = u.pos.y;
      h.combatFeetHeading = u.heading; h.combatFeetReady = true;
      h.pivotStep = 0;
    }
  } else { h.combatFeetReady = false; h.pivotStep = 0; }
  h.combatHit = hit;
  // 向き直るたびに両足の固定を解くと、草鞋が一緒に跳び、腰だけが回る。
  // 片足を地面に残し、もう片足を運んでから支えを交代する。近景の既存の接地枠だけで行う。
  let pivotFoot = -1, pivotLift = 0;
  if (lock && !hit && !u.atk && !u.swing && !u.tech && !(u.slipT > 0)) {
    if (!h.pivotStep && Math.abs(angleDiff(h.combatFeetHeading, u.heading)) > 0.18) {
      h.pivotStep = 1; h.pivotTime = 0;
      h.pivotFirst = angleDiff(h.combatFeetHeading, u.heading) > 0 ? 1 : 0;
    }
    if (h.pivotStep) {
      pivotFoot = h.pivotStep === 1 ? h.pivotFirst : 1 - h.pivotFirst;
      const at = pivotFoot * 2;
      // 一人一つの小さな入れ物を繰り返し使い、毎コマは数値だけを更新する。
      if (!h.pivotFeet) h.pivotFeet = new Float64Array(4);
      if (!h.pivotTime) {
        (pivotFoot ? B.RightFoot : B.LeftFoot).getWorldPosition(_fk);
        h.pivotFeet[0] = h.combatFeet[at]; h.pivotFeet[1] = h.combatFeet[at + 1];
        h.pivotFeet[2] = _fk.x; h.pivotFeet[3] = _fk.z;
      }
      h.pivotTime += dt;
      const q = clamp01(h.pivotTime / (0.18 + h.seed * 0.05)), k = q * q * (3 - 2 * q);
      h.combatFeet[at] = h.pivotFeet[0] + (h.pivotFeet[2] - h.pivotFeet[0]) * k;
      h.combatFeet[at + 1] = h.pivotFeet[1] + (h.pivotFeet[3] - h.pivotFeet[1]) * k;
      pivotLift = 16 * q * q * (1 - q) * (1 - q) * 0.045;
      if (q >= 1) {
        h.pivotTime = 0;
        if (h.pivotStep === 1) h.pivotStep = 2;
        else { h.pivotStep = 0; h.combatFeetHeading = u.heading; }
      }
    }
  } else h.pivotStep = 0;
  let drop = 0;
  // 足先だけを下げても、腰が高いままでは脚が届かず、逆運動学が途中で止まる。
  // 両脚の実際の長さから届く腰の高さを先に求める。左右の目標は共有の入れ物へ。
  for (let i = 0; i < 2; i++) {
    const sd = i ? 'Right' : 'Left', a = B[sd + 'UpLeg'], b = B[sd + 'Leg'], c = B[sd + 'Foot'];
    a.getWorldPosition(_fk); b.getWorldPosition(_pf); c.getWorldPosition(_fp[i]);
    const reach = (_fk.distanceTo(_pf) + _pf.distanceTo(_fp[i])) * 0.97;
    if (lock) {
      _fp[i].x = h.combatFeet[i * 2] + (i ? 0 : _fwd.x * step);
      _fp[i].z = h.combatFeet[i * 2 + 1] + (i ? 0 : _fwd.z * step);
      if (hit) {
        // 当たり側の足を先に運び、反対の足は残して腰を支える。
        // 押される実際の位置だけを追う。兵の位置や怯む時間は変えない。
        const q = clamp01(hit.t / Math.max(0.05, hit.dur || 0.4));
        const first = i === ((hit.side || 1) > 0 ? 1 : 0);
        const transfer = first ? ease(0.02, 0.48, q) : ease(0.48, 1, q);
        _fp[i].x += (u.pos.x - h.combatFeetX) * transfer;
        _fp[i].z += (u.pos.z - h.combatFeetZ) * transfer;
        lift = 16 * transfer * transfer * (1 - transfer) * (1 - transfer) * (hit.heavy ? 0.055 : 0.035);
      }
    }
    const dx = _fp[i].x - _fk.x, dz = _fp[i].z - _fk.z, span = Math.hypot(dx, dz);
    // 深い構えに歩きの脚が重なっても、足を届かない遠さへ投げ出さない。
    if (span > reach * 0.7) {
      const k = reach * 0.7 / span;
      _fp[i].x = _fk.x + dx * k; _fp[i].z = _fk.z + dz * k;
    }
    _fp[i].y = groundAt(WORLD, _fp[i].x, _fp[i].z, h.u.pos.y) + R[sd + 'Foot'].y * scaleY;
    if (lock && (hit || !i)) _fp[i].y += lift;
    if (i === pivotFoot) _fp[i].y += pivotLift;
    const horizontal = Math.min(span, reach * 0.7);
    drop = Math.max(drop, _fk.y - _fp[i].y - Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal)));
  }
  h.model.position.y -= Math.min(0.28, drop / scaleY);
  for (let i = 0; i < 2; i++) {
    const sd = i ? 'Right' : 'Left', c = B[sd + 'Foot'];
    const yaw = h.gaitYaw || 0;
    ik2(B[sd + 'UpLeg'], B[sd + 'Leg'], c, _fp[i], _pfp.copy(_fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(_right, Math.sin(yaw)).addScaledVector(_up, 0.1));
    // 足首も戻して草鞋を寝かせる。爪先立ちのまま突き・受けを終えない。
    const toe = B[sd + 'ToeBase'];
    if (toe && R[sd + 'ToeBase']) {
      c.getWorldPosition(_pf); toe.getWorldPosition(_fk);
      _pfp.copy(_fk); _pfp.y = _pf.y + (R[sd + 'ToeBase'].y - R[sd + 'Foot'].y) * scaleY;
      aimBone(c, _fk, _pfp);
    }
  }
}
function footPlant(h, B, dt) {
  const u = h.u;
  const R = SRC.rest;
  if (!R?.LeftFoot || !R.RightFoot) return;
  h.root.getWorldScale(_pfp);
  const scaleY = Math.max(0.01, _pfp.y);
  const g0 = groundAt(WORLD, u.pos.x, u.pos.z, u.pos.y);
  B.LeftFoot.getWorldPosition(_fp[0]); B.RightFoot.getWorldPosition(_fp[1]);
  const left = groundAt(WORLD, _fp[0].x, _fp[0].z, u.pos.y) - g0;
  const right = groundAt(WORLD, _fp[1].x, _fp[1].z, u.pos.y) - g0;
  // 腰：低い方の足が届くように落とす（ばねで滑らかに）
  const want = Math.max(0, -Math.min(left, right));
  h.fpDrop = (h.fpDrop || 0) + (Math.min(0.25, want) - (h.fpDrop || 0)) * Math.min(1, dt * 10);
  const planted = (h.spd || 0) < 0.3 && !u.hit;
  // 低い方の草鞋が着く拍子に、腰の弾みで数センチ浮く分を吸収する。
  // 駆け足の高い跳躍相は残し、歩幅・兵の速さ・地面には触れない。
  const ankle = R.LeftFoot.y * scaleY;
  const low = Math.min(_fp[0].y - g0 - left - ankle, _fp[1].y - g0 - right - ankle);
  const settle = !planted && !u.hit && low > 0 && low < 0.22 ? Math.min(0.11, low) * (1 - low / 0.22) : 0;
  h.fpSettle = (h.fpSettle || 0) + (settle - (h.fpSettle || 0)) * Math.min(1, dt * 18);
  h.model.position.y -= h.fpSettle / scaleY;
  if (!planted && Math.abs(left) + Math.abs(right) < 0.012 && h.fpDrop < 0.005) return;
  h.model.position.y -= h.fpDrop;
  h.model.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const a = i ? B.RightUpLeg : B.LeftUpLeg, b = i ? B.RightLeg : B.LeftLeg, c = i ? B.RightFoot : B.LeftFoot;
    c.getWorldPosition(_fp[i]);
    // 足が地面から持ち上がっている分（歩みで上げた足）はそのまま、地面の高さの差だけ動かす
    const ankle = R[i ? 'RightFoot' : 'LeftFoot'].y * scaleY;
    const floor = g0 + (i ? right : left) + ankle;
    _fp[i].y = planted ? floor : Math.max(floor, _fp[i].y + (i ? right : left) + h.fpDrop);
    // 横へ踏み替える時は、膝も草鞋と同じ方向へ。
    const yaw = h.gaitYaw || 0;
    _fk.copy(_fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(_right, Math.sin(yaw)).addScaledVector(_up, 0.1);
    ik2(a, b, c, _fp[i], _fk);
  }
}

// 一歩の重さ：接地で膝が受け、腰が反対へ回り、胸と腕が遅れて戻る。見本の足運びは保つ。
function gaitWeight(h, B, dt, wWalk, wRun, st) {
  const acc = dt > 0 ? (h.spd - (h.pSpd ?? h.spd)) / dt : 0; h.pSpd = h.spd;
  h.accS = (h.accS || 0) + (Math.max(-12, Math.min(12, acc)) - (h.accS || 0)) * (1 - Math.exp(-dt * 8));
  const push = clamp01(h.accS / 7), brake = clamp01(-h.accS / 7);
  const load = Math.max(push, brake) * (1 - (h.u.dodging ? 1 : 0));
  // 駆け出しで膝に力を溜め、止まる時は前足で受けて腰が沈む。
  rotWorld(B.Spine, _right, (0.18 * push - 0.14 * brake) * (1 - st * 0.4));
  rotWorld(B.LeftUpLeg, _right, -0.12 * load); rotWorld(B.RightUpLeg, _right, -0.1 * load);
  rotWorld(B.LeftLeg, _right, 0.23 * load); rotWorld(B.RightLeg, _right, 0.2 * load);
  h.model.position.y -= 0.035 * load;
  if (h.far || wWalk + wRun < 0.03) return;
  const A = h.act;
  const ph = A.walk.time / Math.max(0.01, A.walk.getClip().duration) * Math.PI * 2;
  const rph = A.run.time / Math.max(0.01, A.run.getClip().duration) * Math.PI * 2;
  const sway = Math.sin(ph) * wWalk + Math.sin(rph) * wRun;
  const left = Math.max(0, Math.cos(ph)) * wWalk + Math.max(0, Math.cos(rph)) * wRun;
  const right = Math.max(0, -Math.cos(ph)) * wWalk + Math.max(0, -Math.cos(rph)) * wRun;
  const tired = 1 - clamp01(h.heavy || 0) * 0.3;
  rotWorld(B.Hips, _up, sway * 0.055 * tired); rotWorld(B.Spine1, _up, -sway * 0.07 * tired);
  rotWorld(B.Hips, _fwd, sway * 0.025); rotWorld(B.Spine2, _fwd, -sway * 0.02);
  rotWorld(B.LeftUpLeg, _right, -0.025 * left); rotWorld(B.LeftLeg, _right, 0.065 * left);
  rotWorld(B.RightUpLeg, _right, -0.025 * right); rotWorld(B.RightLeg, _right, 0.065 * right);
  // 足を着く側へ腰を預け、反対の膝を送り出す。棒立ちの脚と胸を別々に動かさない。
  // 既存の接地の拍子を使い、当たり・移動・攻撃の時計は変えない。
  const support = (left + right) * (1 - st * 0.6);
  rotWorld(B.LeftUpLeg, _right, -0.035 * left * tired);
  rotWorld(B.LeftLeg, _right, 0.075 * left * tired);
  rotWorld(B.RightUpLeg, _right, -0.035 * right * tired);
  rotWorld(B.RightLeg, _right, 0.075 * right * tired);
  rotWorld(B.Spine, _right, 0.025 * support);
  h.model.position.y -= 0.012 * support;
  // 二歩に二度の重心移動。走りの弾みは歩きより大きく、疲れると小さくなる。
  h.model.position.x += sway * (0.012 * wWalk + 0.007 * wRun) * tired;
  // 空いた腕は脚と逆に振り、肘は少し遅れる。槍と両手の武器は握り合わせに任せる。
  const w = h.u.wpnKind || h.u.lookWeapon;
  const free = !h.u.wpn || !h.u.wpn.parent || !w || w === 'none';
  const swing = (Math.sin(ph) * 0.045 * wWalk + Math.sin(rph) * 0.07 * wRun) * tired;
  if (free && !h.u.look?.standard) rotWorld(B.RightArm, _right, -swing);
  if (free && !h.u.look?.standard) {
    rotWorld(B.LeftArm, _right, swing);
    rotWorld(B.LeftForeArm, _right, -Math.max(0, Math.sin(ph - 0.4)) * 0.035 * wWalk);
  }
  h.model.position.y += ((Math.abs(Math.sin(ph)) - 0.64) * 0.018 * wWalk + (Math.abs(Math.sin(rph)) - 0.64) * 0.032 * wRun) * tired;
}

// 息・疲れ・傷：胸が息で上下し、駆けた後や疲れた者は肩で息をして背を丸める。深手の者は片足をかばって歩き、背を丸める
// （units.js の u.fat＝疲れ 0..1、u.hp の減り。駆けた後の息の荒さは h.exert に貯める）
function vitals(h, B, dt, time, sp, wIdle, wWalk, wRun, st) {
  const u = h.u;
  h.exert = clamp01((h.exert || 0) + dt * (wRun > 0.3 ? 1 / 10 : sp > 1.2 ? 1 / 60 : -1 / 25));
  const hurt = u.maxHp > 0 ? clamp01((1 - u.hp / u.maxHp) / 0.75) : 0;
  const heavy = Math.max(u.fat || 0, h.exert * 0.9, hurt);
  h.heavy = (h.heavy || 0) + (heavy - (h.heavy || 0)) * Math.min(1, dt * 1.5);
  const hv = h.heavy;
  // 息の拍子：落ち着いていれば四秒に一度ほど、荒いと一秒に一度。拍子を少しずつ進める（速さが変わっても跳ばない）
  h.brPh = (h.brPh ?? h.seed * 6.28) + dt * Math.PI * 2 * (0.24 + h.seed * 0.06 + hv * 0.75);
  const br = reduceMotion() ? 0 : Math.sin(h.brPh), still = 1 - wRun * 0.8;
  // 待つ兵の吸う息で腰もわずかに動く。胸と同じ拍子を使い、隣とは開始時をずらす。
  h.model.position.y += br * 0.0015 * wIdle * (1 - st);
  // 胸を張って吸う（背骨の上を少し起こす）
  rotWorld(B.Spine2, _right, -br * (0.012 + hv * 0.035) * still);
  // 肩で息をする：吸う時に両肩が上がる。疲れた者は肩が落ち、腕がだらりと下がる
  const lift = (0.003 + hv * 0.022) * Math.max(0, br) * still - Math.max(0, hv - 0.3) * 0.055 * (1 - wRun * 0.5);
  if (Math.abs(lift) > 0.0005 && !h.far && (h.u.isPlayer || h.near !== false)) for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 'Left' : 'Right';
    const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'];
    if (!sh || !ar) continue;
    ar.getWorldPosition(_T); _P.copy(_T); _P.y += lift;
    aimBone(sh, _T, _P);
  }
  // ひどく疲れた者は、待つ間に背を丸めて頭を垂れる
  const slump = Math.max(0, hv - 0.45) * wIdle * (1 - st);
  if (slump > 0.01) { rotWorld(B.Spine1, _right, 0.28 * slump); rotWorld(B.Spine, _right, 0.3 * Math.max(0, hv - 0.65) * wIdle * (1 - st)); rotWorld(B.Neck, _right, 0.25 * slump); h.model.position.y -= 0.02 * slump; }
  // 歩き方の癖（皆が同じ録った動きで歩くと、同じ人形が並んで見える）：前かがみの人・胸を張る人、腰を左右に振る人、首を前へ出す人
  const mv = wWalk + wRun;
  if (mv > 0.05 && !h.far) {
    const V = h.var;
    rotWorld(B.Spine, _right, (V?.lean || 0) * 0.14 * mv + wRun * 0.08 * (h.seed - 0.3));
    rotWorld(B.Neck, _right, ((h.seed * 13.7) % 1 - 0.4) * 0.12 * mv);
    const A = h.act, ph = (A.walk.time / Math.max(0.01, A.walk.getClip().duration)) * Math.PI * 2;
    rotWorld(B.Hips, _fwd, Math.sin(ph) * 0.05 * (V?.out || 0) * wWalk);
    // 疲れて歩く者は、頭が前へ落ち、背が丸まる
    if (hv > 0.35) { const tk = (hv - 0.35) * wWalk; rotWorld(B.Spine1, _right, 0.18 * tk); rotWorld(B.Neck, _right, 0.2 * tk); }
    // 走る：人ごとに違う前傾、腕の振りと逆に胸がひねれ、一歩ごとに体が弾んで具足が跳ねる（sway が上下の速さで揺らす）
    if (wRun > 0.05) {
      const R_ = A.run, rph = (R_.time / Math.max(0.01, R_.getClip().duration)) * Math.PI * 2;
      h.runPh = rph;
      rotWorld(B.Spine, _right, wRun * (0.08 + (V?.f || 1) * 0.06 + hv * 0.06));
      rotWorld(B.Spine2, _up, Math.sin(rph) * 0.08 * wRun);
      rotWorld(B.Neck, _right, -wRun * 0.1);
    }
  }
  h.runW = mv > 0.05 && !h.far ? wRun : 0;
  // 深手（残りの力が三割ほどより下）：片足をかばう。歩む拍子のうち痛む足で踏む間、腰が沈み、体が痛む足の側へ傾く
  const hurtW = u.maxHp ? clamp01((0.35 - u.hp / u.maxHp) / 0.2) : 0;
  h.hurt = (h.hurt || 0) + (hurtW - (h.hurt || 0)) * Math.min(1, dt * 2);
  if (h.hurt > 0.02) {
    const hk = h.hurt;
    const sd = h.seed > 0.5 ? 1 : -1;
    const A = h.act, ph = A.walk.getClip().duration > 0 ? (A.walk.time / A.walk.getClip().duration) * Math.PI * 2 : 0;
    const step = Math.max(0, Math.sin(ph) * sd) * wWalk;
    h.model.position.y -= 0.045 * hk * step;
    rotWorld(B.Spine, _fwd, 0.1 * sd * hk * step);
    rotWorld(B.Spine1, _right, 0.12 * hk);
  }
}

// 表情：突く・振る・駆けてかかる時は叫び、打たれると顔をしかめ、敵と向き合う間は眉を寄せる。討たれた者は口が緩む
//   人ごとに表情の大きさが違い、叫びは一息ごとに開け閉めする
function faceExpr(h, u, dt, engaged) {
  const E = h.expr, K = h.exK || (h.exK = 0.7 + ((h.seed * 41.3) % 1) * 0.5);
  let open = 0, pain = 0, anger = 0;
  if (!u.alive) { open = 0.35; pain = 0.15; }
  else {
    const atk = (u.strikeT > 0) || (u.slamT > 0) || !!u.swing || (engaged && (h.spd || 0) > 3);
    h.shoutT = atk ? 0.9 : Math.max(0, (h.shoutT || 0) - dt);
    if (h.shoutT > 0) open = 0.75 + 0.25 * Math.sin((h.clock || 0) * 9 + h.seed * 5);
    if (u.hit) { const q = clamp01(u.hit.t / Math.max(0.05, u.hit.dur || 0.4)); pain = Math.max(pain, (1 - q) * (u.hit.heavy ? 1 : 0.7)); open = Math.max(open, (1 - q) * 0.4); }
    if (h.hurt > 0.05) pain = Math.max(pain, h.hurt * 0.6);
    // 全員を同じ怒り顔に固定せず、受ける拍子の緊張を頬と眉へ渡す。
    if (engaged) anger = Math.min(1, 0.5 + h.seed * 0.25 + (u.contactLoad || 0) * 0.2);
    if (engaged && WORLD?.def.infantryWeight && !u.isPlayer && !u.mounted) {
      // 目前の打撃を受ける兵は、叫ぶ・歯を食いしばる・息を詰める顔へ分ける。
      // 既存の顔の差分だけを使い、個体ごとの絵や材質を増やさない。
      const strain = clamp01((u.contactLoad || 0) + (u.contactBrace || 0) * .4);
      const fear = clamp01((55 - (u.group?.morale ?? 100)) / 55);
      open *= .25 + h.seed * .65;
      open = Math.max(open, strain * (.06 + h.seed * .2) + fear * .18);
      pain = Math.max(pain, strain * (.12 + (1 - h.seed) * .28) + fear * .25);
      anger *= .65 + h.seed * .3;
    }
    if ((h.heavy || 0) > 0.5) { pain = Math.max(pain, (h.heavy - 0.5) * 0.6); open = Math.max(open, (h.heavy - 0.5) * 0.5 * (0.5 + 0.5 * Math.sin(h.brPh || 0))); }
  }
  // 本能寺の小姓は、歯を食いしばる・息を吐く・声を上げる顔に分ける。
  if (u.honnoExpression != null) {
    const v = u.honnoExpression;
    open *= v === 0 ? 0.12 : v === 1 ? 0.3 : v === 2 ? 0.5 : 0.7;
    if (!u.alive) { open = 0.025 + v * 0.035; pain = 0.08 + v * 0.025; }
    else if (engaged) anger *= 0.65 + v * 0.1;
  }
  const k = Math.min(1, dt * 10);
  E.x += (open * K - E.x) * k; E.y += (pain * K - E.y) * k; E.z += (anger * K - E.z) * Math.min(1, dt * 4);
  setFaceMorph(h);
}

// 兵は pos、建物は x・z または線分で場所を持つ。近い線分の点を見て、入れ物は使い回す。
function lookTarget(u, out) {
  // 振り終わるまでは実際に打っている相手を見る。後列も構えた槍と視線をそろえる。
  const t = u.swing?.target || u.atk?.target || u.target || u.poseTarget;
  if (!t || t.alive === false || t.gone || t.opened || t.team === u.team) return false;
  let x, z;
  if (t.isStruct) {
    if (t.seg) {
      const s = t.seg, dx = s[2] - s[0], dz = s[3] - s[1];
      const k = Math.max(0, Math.min(1, ((u.pos.x - s[0]) * dx + (u.pos.z - s[1]) * dz) / (dx * dx + dz * dz || 1)));
      x = s[0] + dx * k; z = s[1] + dz * k;
    } else { x = t.x; z = t.z; }
  } else if (t.pos) { x = t.pos.x; z = t.pos.z; }
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  out.x = x; out.z = z;
  return true;
}

// 見回す：首と頭を、ばねで狙いの向きへ
function lookAround(h, B, dt, engaged, wIdle) {
  const u = h.u;
  const tg = lookTarget(u, _tgt2) ? _tgt2 : null;
  const L = h.lk || (h.lk = { yaw: 0, pitch: 0, ty: 0, tp: 0, t: 1 + h.seed * 4 });
  L.t -= dt;
  if (u.fallenLookLeft > 0 && Number.isFinite(u.fallenLookX) && Number.isFinite(u.fallenLookZ) && !u.fleeing && !u.atk && !u.swing && !(engaged && tg && Math.hypot(tg.x - u.pos.x, tg.z - u.pos.z) < 2.5)) {
    let a = Math.atan2(u.fallenLookX - u.pos.x, u.fallenLookZ - u.pos.z) - u.heading;
    while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    L.ty = Math.max(-0.9, Math.min(0.9, a)); L.tp = 0.12; L.t = 0;
  } else if (engaged && tg) {
    // 敵の方へ（体の向きからのずれ）
    const tx = tg.x - u.pos.x, tz = tg.z - u.pos.z;
    let a = Math.atan2(tx, tz) - u.heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    L.ty = Math.max(-0.9, Math.min(0.9, a));
    const foe = u.swing?.target || u.atk?.target || u.target || u.poseTarget;
    const dy = foe?.pos ? foe.pos.y + (foe.mounted ? RIDE.y : 0) - u.pos.y - (u.mounted ? RIDE.y : 0) : 0;
    L.tp = Math.max(-0.35, Math.min(0.35, -Math.atan2(dy, Math.max(1, Math.hypot(tx, tz)))));
  } else if (!u.isPlayer && !u.mounted && !u.fleeing && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) && wIdle > 0.8 && u.idl && u.idl.a) {
    // 軽い兵と同じしぐさを首の骨へ。別々の見回しが重なって打ち消さないように
    L.ty = u.idl.hy; L.tp = u.idl.hp; L.t = 0.5;
  } else if (L.t <= 0) {
    // 時々、横や後ろの様子を見る。隊の崩れかけは落ち着きなく
    const nerv = (u.group && u.group.morale < 40 ? 2 : 1) * (0.7 + ((h.seed * 29.1) % 1) * 0.7);
    L.t = (1.5 + Math.random() * 4) / nerv;
    L.ty = Math.random() < 0.45 ? 0 : (Math.random() - 0.5) * 1.5 * Math.min(1, wIdle + 0.3);
    L.tp = (Math.random() - 0.6) * 0.25;
  }
  const k = Math.min(1, dt * 3.5);
  L.yaw += (L.ty - L.yaw) * k; L.pitch += (L.tp - L.pitch) * k;
  if (Math.abs(L.yaw) + Math.abs(L.pitch) < 0.01) return;
  rotWorld(B.Spine2, _up, L.yaw * 0.15);
  // 大きく振り返る時は、胸と腰もついて回る（首だけが回る人形にしない）
  if (Math.abs(L.yaw) > 0.45) { const ex = (Math.abs(L.yaw) - 0.45) * Math.sign(L.yaw); rotWorld(B.Spine1, _up, ex * 0.3); rotWorld(B.Spine, _up, ex * 0.15); }
  rotWorld(B.Neck, _up, L.yaw * 0.35);
  rotWorld(B.Head, _up, L.yaw * 0.45);
  rotWorld(B.Head, _right, L.pitch);
}

// 腕：右手は武器の握り、左手は柄の先。鉄砲の込め直し（槊杖で突き固める）、弓を引く、槍を持ち替える
const RIGHT_POLE = new THREE.Vector3(), LEFT_POLE = new THREE.Vector3();
const spearShoulder = new THREE.Vector3(), spearElbow = new THREE.Vector3(), spearWrist = new THREE.Vector3(), spearGrip = new THREE.Vector3();
function armsPose(h, B, dt, time, w) {
  const u = h.u;
  const hd = u.hand;
  const closeSpear = w === 'spear' && !u.mounted && (u.isPlayer || u.focusD <= 15);
  if (u.ramGrip) {
    // 丸太の両手の支えは世界の位置で受け、兵の向きや坂でも木から手が離れない。
    _tgt.copy(u.ramGrip.right); _tgt2.copy(u.ramGrip.left);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, _pole.copy(_right).addScaledVector(_up, -1));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).negate().addScaledVector(_up, -1));
    return;
  }
  // 弓：units.js が弓の手と右手の置き所（u.bowR）を動かす時はそれに従う。なければ、引く間は弓を顔の前へ上げる
  const own = u.bowPh !== undefined || u.gunPh !== undefined;
  if (w === 'bow' && !u.mounted && !own) bowHold(h, dt);
  hd.updateWorldMatrix(true, false);
  // 身の回りの槍は、頭越しの構えでも握りを右腕の届く所へ収める。
  // 手だけを槍へ伸ばし切らず、槍ごと寄せてから両腕を合わせる。得物の当たりは変えない。
  if ((closeSpear || WORLD?.def.reachableSpearGrip && w === 'spear' && !u.isPlayer && !u.mounted) &&
      u.alive && !u.dying && !u.downed && !h.far && (closeSpear || u.camD < 18)) {
    B.RightArm.getWorldPosition(spearShoulder);
    B.RightForeArm.getWorldPosition(spearElbow);
    B.RightHand.getWorldPosition(spearWrist);
    const reach = (spearShoulder.distanceTo(spearElbow) + spearElbow.distanceTo(spearWrist)) * 0.9;
    spearGrip.setFromMatrixPosition(hd.matrixWorld).sub(spearShoulder);
    if (reach > 0 && spearGrip.lengthSq() > reach * reach) {
      spearGrip.setLength(reach).add(spearShoulder);
      hd.parent.worldToLocal(spearGrip); hd.position.copy(spearGrip);
      hd.updateWorldMatrix(false, false);
    }
  }
  const e = hd.matrixWorld.elements;
  _tgt.set(e[12], e[13], e[14]);
  // 一人称の本人（fpg）：手のひらを柄に合わせて握らせる。馬上の握りは gripPose が武器ごと下げてある
  const fpk = u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, fpg = fpk > 0.5;
  if (u.mounted) _tgt.y -= 0.18 * (u.isPlayer && w !== 'bow' && (u.fpk || 0) > 0.01 ? 1 - u.fpk : 1);   // 馬上の人は本編の形より肩が低いので、握りも下げる
  const dir = _dir.set(e[8], e[9], e[10]).normalize();
  RIGHT_POLE.copy(_right).multiplyScalar(0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  LEFT_POLE.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  // 構えの癖（人ごと）：肘を脇に締める人・横へ張る人、肘を下げる人。馬上と一人称の本人は変えない
  if (!u.mounted && !u.isPlayer) {
    const S = h.hold || (h.hold = { eb: ((h.seed * 23.1) % 1 - 0.5) * 0.9, dn: ((h.seed * 17.9) % 1 - 0.5) * 0.5, sp: ((h.seed * 31.7) % 1 - 0.5) * 0.16 });
    RIGHT_POLE.addScaledVector(_right, S.eb).addScaledVector(_up, -S.dn); LEFT_POLE.addScaledVector(_right, -S.eb * 0.8).addScaledVector(_up, -S.dn);
  }
  if (w === 'spear' && !u.mounted && !fpg) {
    // 手は柄に合わせたまま、重みを受ける肘を下へ、突く肘を後ろへ張る。
    const load = h.atkB ? Math.max(0, h.atkB.W) : 0, thrust = h.atkB ? Math.max(0, h.atkB.L) : 0;
    RIGHT_POLE.addScaledVector(_fwd, -0.22 * load).addScaledVector(_up, 0.16 * thrust);
    LEFT_POLE.addScaledVector(_up, -0.18 * (1 - thrust));
  }
  if (w === 'bow' && own) {
    // 騎射：鞍の上で腰から左へひねり、左の肩を的へ向けて引く（馬の首を越えて射る）
    if (u.mounted) {
      const dr = u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise' || u.bowPh === 'nock';
      h.kisha = (h.kisha || 0) + ((dr ? 1 : 0) - (h.kisha || 0)) * Math.min(1, dt * 5);
      if (h.kisha > 0.02) { rotWorld(B.Spine, _up, 0.22 * h.kisha * (fpg ? 0.5 : 1)); rotWorld(B.Spine1, _up, 0.3 * h.kisha * (fpg ? 0.5 : 1)); rotWorld(B.Spine1, _right, 0.08 * h.kisha); }
    }
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1));
    if (u.bowR) {
      _tgt2.copy(u.bowR);
      // 一人称で弓の手を寄せた分（gripPose）だけ、弦を引く右手も寄せる（弓と弦から手が離れない）
      if (h.fpOff && (u.bowPh === 'nock' || u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise')) { _tgt2.x += h.fpOff.dx; _tgt2.y += h.fpOff.dy; _tgt2.z += h.fpOff.dz; }
      _tgt2.applyMatrix4(hd.parent.matrixWorld);
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
  if (u.look?.standard && w === 'none') {
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, RIGHT_POLE);
    gripHand(B, 'Right', _tgt, _up, _fwd, 0, RIGHT_POLE);
    return;
  }
  if (!w || w === 'none') return;
  // 一人称の本人は担がず、左手で柄・台木を支えたまま（手が武器から離れて見えない）
  const shouldered = !u.mounted && !fpg && (w === 'spear' ? (h.upK || 0) > 0.5 && !u.spearSupport && !(u.contactBrace > 0.1) : w === 'gun' && hd.rotation.x < -0.4);
  const reload = w === 'gun' && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6 && !u.mounted;
  const aimGun = w === 'gun' && (u.gunPh !== undefined ? u.gunPh === 'aim' || u.gunPh === 'fire' : u.atk && u.atk.ranged);
  // 一人称の込め直し（馬上も）：gripPose が筒を体の前へ斜めに下げてある。左手は筒を支え、右手は込め矢を握って突く
  if (fpg && w === 'gun' && (h.fpRl || 0) > 0.5 && u.wpn) {
    const gw = u.wpn, R = gw.userData.ram;
    gw.updateWorldMatrix(false, false);
    // 左手：筒の中ほど（肩から届く所）を下から支える
    fpReach(B, 'Left', _tgt2.set(0, -0.02, 0.55), _tgt3.set(0, -0.02, 0.2), gw);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -0.8).addScaledVector(_fwd, -0.3));
    gripHand(B, 'Left', _tgt2, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, _pole);
    // 右手：突き固める間は込め矢の頭、火薬・弾は筒口の上、ほかは握り
    const ph = u.gunPh;
    if (ph === 'ram' && R) fpReach(B, 'Right', _tgt3.set(0, R.position.y, R.position.z + 0.86), _tgt2.set(0, 0.034, 1.0), gw);
    else if (ph === 'powder' || ph === 'ball') { _tgt3.set(0.02, 0.06, 1.08); gw.localToWorld(_tgt3); }
    else _tgt3.copy(_tgt);
    const rp = _pole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -0.8).addScaledVector(_fwd, -0.3);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt3, rp);
    if (ph === 'ram') gripHand(B, 'Right', _tgt3, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.3, rp);
    if (h.rod) h.rod.visible = false;
    return;
  }
  // 込め直し：units.js が左手の置き所（u.lh：筒先・火皿）を出す時はそれに従う
  if (w === 'gun' && u.lh && !u.mounted) {
    if (h.rod) h.rod.visible = false;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, RIGHT_POLE);
    if (fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, RIGHT_POLE);
    _tgt2.set(u.lh[0], u.lh[1], u.lh[2]).applyMatrix4(hd.parent.matrixWorld);
    const cover = u.gunPh === 'cover';
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(cover ? -1 : -0.5).addScaledVector(_up, cover ? 0.2 : -0.4).addScaledVector(_fwd, -0.5));
    // 一人称：構えた鉄砲の台木を、左手で下から手のひらを上にして支える（手と台木の間に隙間を作らない）
    if (fpg) {
      // 左手の置き所を筒の線の上へ寄せる（units.js の置き所は筒の横にずれることがある）
      _tgt3.copy(_tgt2).sub(_tgt); _tgt3.copy(_tgt).addScaledVector(dir, Math.max(0.2, Math.min(0.45, _tgt3.dot(dir))));
      _tgt3.addScaledVector(_gU.set(e[4], e[5], e[6]).normalize(), -0.012);
      gripHand(B, 'Left', _tgt3, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, _pole);
    }
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _right, 0.1);
    return;
  }
  if (reload && u.gunPh === undefined) { gunReload(h, B, dt, time, dir); return; }
  if (h.rod) h.rod.visible = false;
  // 右手：握り。鉄砲を構える時は肘を横へ張る
  if (aimGun) rotWorld(B.Spine1, _up, 0.12);
  const rp = aimGun ? _pole.copy(_right).addScaledVector(_up, 0.15).addScaledVector(_fwd, -0.4) : RIGHT_POLE;
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, rp);
  // 一人称：柄を拳の中に通して握る（指は柄の刃の側・下へ巻く）
  if (fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, rp);
  // 目の前の徒歩の槍も、手首の点ではなく拳の中へ柄を通す。
  // 遠い兵は元の二関節の補正だけに留める。
  const nearSpearGrip = closeSpear && !h.far;
  if (nearSpearGrip && !fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, rp);
  if (aimGun) {
    // 頬を台に付けて狙う：首を傾け、顔を下げる
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _fwd, -0.22);
  }
  // 馬上：左手は手綱（鞍の前）。馬の首の振りに合わせて前後する
  if (u.mounted) { reinPose(h, B, u, fpk, false); return; }
  // 昌恒の片手斬り（伝承）：左手は腰の外で釣り合いを取り、右手だけで刀を振るう。
  // 蔓を実際に掴む姿ではなく、移動できる戦場での復元。既存の作業ベクトルを使う。
  if (w === 'sword' && u.look?.swordHand === 'right' && !u.isPlayer) {
    if (!h.far) {
      B.LeftArm.getWorldPosition(_tgt2);
      _tgt2.addScaledVector(_right, -0.22).addScaledVector(_up, -0.38).addScaledVector(_fwd, -0.12);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
    }
    return;
  }
  // 担いで駆ける時は、左手も柄に添えて抱える（今の世の腕振りにしない）。歩む時は左手を歩みに合わせて振る（録った動きのまま）
  if (shouldered) {
    const runK = clamp01(((h.spd || 0) - 2.6) / 1.5);
    if (w === 'spear' && runK > 0.05 && !h.far) {
      _tgt2.copy(_tgt).addScaledVector(dir, 0.3).addScaledVector(_right, -0.06);
      B.LeftHand.getWorldPosition(_tgt3); _tgt3.lerp(_tgt2, runK);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt3, LEFT_POLE);
    }
    return;
  }
  // 左手：柄の先。待つ間は時々持ち替える（手を柄に沿ってずらし、握り直す）
  let k = w === 'sword' ? -0.13 : w === 'gun' ? (fpg ? 0.2 : 0.36)
    : (fpg || u.mounted ? 0.36 + (h.seed - 0.5) * 0.08 : 0.46 + (h.seed - 0.5) * 0.12), lift = 0;
  if (closeSpear) k = 0.62 + (h.seed - 0.5) * 0.08;
  // 両手の間（人ごと）：槍は手を広く取る人・詰める人。鉄砲は台木を支える所が少しずつ違う。刀は柄頭へ寄せる人・鍔元へ寄せる人
  if (h.hold && !fpg) k += w === 'spear' ? h.hold.sp : w === 'gun' ? h.hold.sp * 0.3 : w === 'sword' ? h.hold.sp * 0.15 : 0;
  // 怯えた者・疲れ切った者は、柄を持つ手が小さく震える
  if (!fpg && !u.isPlayer) { const tr = Math.max(u.group && u.group.morale < 35 ? (35 - u.group.morale) / 35 : 0, clamp01(((h.heavy || 0) - 0.6) / 0.3)); if (tr > 0.05) lift += Math.sin(time * 23 + h.seed * 9) * 0.006 * tr; }
  if (w === 'spear' && !u.atk && !u.pAtk && !u.swing && !(u.strikeT > 0)) {
    const G = h.grip || (h.grip = { k: 0, tk: 0, t: 3 + h.seed * 8, lift: 0 });
    G.t -= dt;
    if (G.t <= 0) { G.t = 5 + Math.random() * 9; G.tk = (Math.random() - 0.4) * 0.28; G.lift = 0.35; }
    G.lift = Math.max(0, G.lift - dt);
    G.k += (G.tk - G.k) * Math.min(1, dt * 3);
    k += G.k; lift += Math.sin(clamp01(G.lift / 0.35) * Math.PI) * 0.06;
  }
  if (h.far) return;   // 遠い人は左手を省く（録った動きのまま）
  // 槍をしごく：突き出す間、前の左手は柄の上を滑ってその場に残り、後ろの右手だけが前へ押し出す（両手が一緒に動く棒突きにしない）
  if (w === 'spear' && h.atkB && h.atkB.L > 0.01 && (!closeSpear || u.swing?.kind === 'thrust' || u.swing?.kind === 'charge')) k = Math.max(closeSpear ? 0.18 : 0.1, k - 0.5 * h.atkB.L);
  _tgt2.copy(_tgt).addScaledVector(dir, k).addScaledVector(_right, -0.05).addScaledVector(_up, lift);
  const calm = !u.atk && !u.target && !(u.strikeT > 0) && (u.moving || 0) < 0.3 && !aimGun && !u.isPlayer;
  // 火縄を袖で庇う：待つ鉄砲足軽は、時々左の袖で火皿と火縄を覆う（風が強いほど、雨の時ほど多く）
  if (w === 'gun') {
    const C = h.cover || (h.cover = { t: 2 + h.seed * 8, on: 0, k: 0 });
    C.t -= dt;
    if (C.t <= 0) { C.on = C.on || !calm ? 0 : 1; const wg = Math.max(0.6, (WIND_STATE.gust ?? 1) + (WORLD && WORLD.rainLevel ? WORLD.rainLevel * 2 : 0)); C.t = C.on ? 2.5 + Math.random() * 3.5 : (7 + Math.random() * 12) / wg; }
    if (!calm) C.on = 0;
    C.k += (C.on - C.k) * Math.min(1, dt * 3);
    if (C.k > 0.02) {
      // 火皿（握りの少し前、右の脇）の上へ左手をかざす。肘を張って袖を垂らし、顔も手元へ
      _tgt3.copy(_tgt).addScaledVector(dir, 0.13).addScaledVector(_right, 0.02).addScaledVector(_up, 0.08).addScaledVector(_fwd, 0.03);
      _tgt2.lerp(_tgt3, C.k);
      _pole.copy(LEFT_POLE).lerp(v3.copy(_right).multiplyScalar(-1).addScaledVector(_up, 0.2).addScaledVector(_fwd, -0.3), C.k);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole);
      rotWorld(B.Neck, _right, 0.2 * C.k); rotWorld(B.Head, _up, -0.15 * C.k);
      return;
    }
  }
  // 息が尽きた者：待つ間は前へかがみ、左手を膝について肩で息をする
  const tired = calm ? clamp01(((h.heavy || 0) - 0.6) / 0.25) : 0;
  h.tiredK = (h.tiredK || 0) + (tired - (h.tiredK || 0)) * Math.min(1, dt * 2);
  if (h.tiredK > 0.02 && w !== 'gun') {
    const tk = h.tiredK;
    // 背の丸め（vitals の slump）は腕より先に掛かっている。ここでは首だけ（胸を回すと右手が武器から離れる）
    rotWorld(B.Neck, _right, -0.15 * tk);
    B.LeftLeg.getWorldPosition(_tgt3); _tgt3.addScaledVector(_fwd, 0.07).addScaledVector(_up, 0.06).addScaledVector(_right, 0.02);
    _tgt2.lerp(_tgt3, tk);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(LEFT_POLE).addScaledVector(_fwd, -0.6 * tk));
    return;
  }
  // 柵を揺する：味方の柵のすぐ前で待つ者は、時々左手で横木をつかみ、押し引きして結わえを確かめる
  if (calm && h.near && ARMY && ARMY.structs.length) {
    const F = h.fence || (h.fence = { t: 3 + h.seed * 10, on: 0, k: 0, p: new THREE.Vector3() });
    F.t -= dt;
    if (F.t <= 0) {
      F.t = F.on ? 6 + Math.random() * 14 : 1.6 + Math.random() * 1.6;
      F.on = F.on ? 0 : fenceNear(u, F.p) ? 1 : 0;
    }
    F.k += (F.on - F.k) * Math.min(1, dt * 4);
    if (F.k > 0.02) {
      const sh = Math.sin(time * 9 + h.seed * 5) * 0.035;
      _tgt3.copy(F.p).addScaledVector(_fwd, sh);
      _tgt2.lerp(_tgt3, F.k);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
      rotWorld(B.Neck, _right, 0.1 * F.k);
      return;
    }
  }
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
  if (nearSpearGrip && !fpg) {
    _tgt3.copy(_tgt).addScaledVector(dir, k);
    gripHand(B, 'Left', _tgt3, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, LEFT_POLE);
  }
  // 一人称：左手も柄を拳の中に通して握る（刀は柄頭の側、槍・鉄砲は前の方）
  if (fpg) {
    // 槍は前の手の中を柄が滑る：左手は胸の前の同じ所に置いたまま、突けば柄だけが前へ出る
    if (w === 'spear') {
      B.LeftArm.getWorldPosition(_tgt3).addScaledVector(_fwd, 0.48).addScaledVector(_up, -0.3).addScaledVector(_right, 0.06);
      k = Math.max(0.18, Math.min(0.9, _tgt3.sub(_tgt).dot(dir)));
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt3.copy(_tgt).addScaledVector(dir, k), LEFT_POLE);
    }
    _tgt3.copy(_tgt).addScaledVector(dir, k).addScaledVector(_up, lift);
    // 鉄砲の左手は台木の下から手のひらを上に向けて支え、指を右の側へ回す
    if (w === 'gun') gripHand(B, 'Left', _tgt3.addScaledVector(_gU.set(e[4], e[5], e[6]).normalize(), -0.012), dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, LEFT_POLE);
    else gripHand(B, 'Left', _tgt3, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, LEFT_POLE);
  }
}
const _gU = new THREE.Vector3(), _gB = new THREE.Vector3();
// 馬上の手綱の拳：拳を立てて（親指が上、指の付け根は馬の首の前へ）、手綱を小指の下から拳の中へ通す。
// two：右手も空いている時（刀を納めた・武器なし）は両手で左右の手綱を一本ずつ持つ
const _rF = new THREE.Vector3(), _rA = new THREE.Vector3(), _rP = new THREE.Vector3(), _rPole = new THREE.Vector3();
function reinPose(h, B, u, fpk, two) {
  // 手綱の置き所は馬が出す（鞍と一緒に揺れ、首の前後に引かれる）。なければ今の形の馬の首の振りから
  const Hh = u.horse && u.horse.userData.horse;
  if (Hh && Hh.hand) _tgt3.copy(Hh.hand);
  else _tgt3.set(-0.08, 1.02 + RIDE.y, 0.42 + (Hh ? Hh.neck.rotation.x * 0.25 : 0));
  // 駆ける時は、拳が馬の首の振りに合わせて小さく上下する
  const run = clamp01((((Hh && Hh.speed) || 0) - 4) / 6);
  if (run > 0) _tgt3.y += Math.sin((h.clock || 0) * 11 + h.seed * 6) * 0.018 * run;
  // 曲がる時は、拳を曲がる側へ寄せて少し引く（内の手綱を引き、外の手綱を首に当てる）
  const tr = Math.max(-1.2, Math.min(1.2, h.turn || 0));
  _tgt3.x += tr * 0.05; _tgt3.z -= Math.abs(tr) * 0.035;
  // 手綱が張ると拳が前へ引かれ、腕が伸びる（馬が首を伸ばす・下げる時）。緩めば戻る
  if (Hh && Hh.reinTaut) { _tgt3.z += 0.045 * Hh.reinTaut; _tgt3.y -= 0.015 * Hh.reinTaut; }
  // 左の拳は体の左寄り（馬の首が振れても、体の真ん中を越えて右へ出さない。-x が乗り手の左）
  _tgt3.x = Math.max(-0.22, Math.min(-0.03, _tgt3.x));
  // 一人称：拳は画面の下の左寄り（前を塞がない）。持ち上げは少しだけ、左へ寄せる
  if (fpk > 0.01) { const L = fpLift(_tgt3.y, _tgt3.z, 1.62 + RIDE.y - 0.18, fpk, 0.13, 0.12); _tgt3.y += L[0]; _tgt3.z += L[1]; _tgt3.x -= 0.1 * fpk; }
  // 両手：左右の拳を拳ひとつ半ほど離す
  if (two) _tgt3.x -= 0.05;
  _rP.copy(_tgt3);
  _tgt2.copy(_tgt3).applyMatrix4(u.mesh.matrixWorld);
  const rpL = _pole.copy(_right).multiplyScalar(-0.7).addScaledVector(_up, -1);
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, rpL);
  h.reinTwo = two;
  if (h.far || !B.LeftHandPinky1) return;
  // 拳の向き：人差し指の側（手綱の抜ける側）は上へ、少し乗り手の側へ倒す。指の付け根は前（馬の首）へ、少し内へ
  _rA.copy(_up).addScaledVector(_fwd, -0.35).normalize();
  _rF.copy(_fwd).addScaledVector(_right, 0.3).addScaledVector(_up, -0.15).normalize();
  gripHand(B, 'Left', _tgt2, _rA, _rF, 0.25, rpL);
  if (two && B.RightHandPinky1) {
    _tgt2.copy(_rP); _tgt2.x += 0.11; _tgt2.applyMatrix4(u.mesh.matrixWorld);
    _rPole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -1);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _rPole);
    _rF.copy(_fwd).addScaledVector(_right, -0.3).addScaledVector(_up, -0.15).normalize();
    gripHand(B, 'Right', _tgt2, _rA, _rF, 0.25, _rPole);
  }
}
// 手綱の通る所：拳の中（手のひらの真ん中から、指の巻く側へ手綱の太さ）。gripHand が柄の点を置く所と同じ
function fistPoint(B, sd, out) {
  if (!B[sd + 'HandPinky1'] || !B[sd + 'HandMiddle3']) { B[sd + 'Hand'].getWorldPosition(out); return out; }
  const L = handFrame(B, sd, _rF, _rA, out);
  return out.multiplyScalar(L * 0.3).add(_ggw).addScaledVector(_rF, L * 0.8);
}
// 前にある味方の柵（0.5〜1.1m）の、胸の高さの横木の点を p に。無ければ false
const _tgt3 = new THREE.Vector3();
function fenceNear(u, p) {
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const s of ARMY.structs) {
    if (!s.seg || !s.alive || (s.team !== undefined && s.team !== u.team)) continue;
    const [ax, az, bx, bz] = s.seg, vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    if (L2 < 1e-4) continue;
    const q = Math.max(0, Math.min(1, ((u.pos.x - ax) * vx + (u.pos.z - az) * vz) / L2));
    const cx = ax + vx * q, cz = az + vz * q, dx = cx - u.pos.x, dz = cz - u.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.45 || d > 1.1 || (dx * fx + dz * fz) / d < 0.6) continue;
    // 手は体の少し左（左手）で横木をつかむ
    const lx = -fz, lz = fx;
    p.set(cx + lx * 0.12, (WORLD ? WORLD.heightAt(cx, cz) : u.pos.y) + 1.12, cz + lz * 0.12);
    return true;
  }
  return false;
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
const GUN_BUTT = 0.37;
const _fpA = new THREE.Vector3(), _fpB = new THREE.Vector3(), _fpC = new THREE.Vector3(), _fpD = new THREE.Vector3(), _fpE = new THREE.Vector3();   // 鉄砲の握りから台尻の端まで（units.js の形）
function gripPose(h, dt) {
  if (window.__apx?.noskin && h.poseReady) return;
  h.skelDirty = true;
  const u = h.u, hd = u.hand, w = u.wpnKind || u.lookWeapon;
  // 一人称の本人（u.fpk：player.js が 0〜1 で渡す）は、馬上でも手を見える所へ寄せる
  const fp = u.isPlayer && (u.fpk || 0) > 0.01;
  if (!hd || !u.alive || !u.wpn || (u.mounted && !fp && !h.fpOff && !(w === 'sword' && (u.swing || h.swd)))) return;
  // units.js がこのコマに構えを置き直していなければ（画面の外など）、前のコマの置き直しのまま（二重にずらさない）
  const G = h.gset;
  if (G && hd.position.x === G[0] && hd.position.y === G[1] && hd.position.z === G[2] && hd.rotation.x === G[3]) return;
  // 前のコマに一人称で寄せた分は、units.js が置き直さなかった成分から引いて戻す（寄せが積み重ならない）
  const F = h.fpOff;
  if (F) { if (hd.position.y === F.ly) hd.position.y -= F.dy; if (hd.position.z === F.lz) hd.position.z -= F.dz; if (hd.position.x === F.lx) hd.position.x -= F.dx; h.fpOff = null; }
  if (!u.mounted && !(w === 'spear' && u.woundRest > 0.01)) gripSet(h, u, hd, w, dt);
  else if (w === 'sword') swordGrip(h, u, hd, dt);
  // 一人称で槍を受けに構える時は、穂先を上げすぎない（前の左手が顔の前へ来て目をふさがない）
  if (fp && w === 'spear' && hd.rotation.x < -0.5) hd.rotation.x += (-0.5 - hd.rotation.x) * u.fpk;
  if (fp) {
    // 一人称：手と武器をいっしょに、目の少し下・少し前へ寄せる（FPS の手のように。三人称の形は変えない）
    // 馬上の人は肩が低い（armsPose で手を 0.18 下げる）。一人称では武器の方を手へ下ろし、手と柄を離さない
    const base = u.mounted ? -0.18 : 0;
    const eyeY = 1.62 + (u.mounted ? RIDE.y - 0.18 : 0);
    // 槍・鉄砲は前の左手が目に近いので、前への寄せは左手の所で測る（寄せすぎて左手が届かなくならない）
    const long = w === 'spear' || w === 'gun';
    const L = long ? fpLift(hd.position.y + base, hd.position.z + 0.22, eyeY - 0.08, u.fpk, 0.28, 0.2) : fpLift(hd.position.y + base, hd.position.z, eyeY, u.fpk);
    let dy = L[0] + base * u.fpk, dz = L[1], dx = 0;
    // 刀を振りかぶる時は、手を頭の上まで上げずに右の肩の前で止める（籠手が画面の下半分をふさがない）
    const top = hd.position.y + base + dy - 1.28;
    if (w === 'sword' && top > 0) { dy -= top * 0.65 * u.fpk; dx += Math.min(0.3, top * 0.9) * u.fpk; dz += Math.min(0.12, top * 0.4) * u.fpk; }
    // 刀を振る間は、手を目の高さより十分下・腕の長さほど前に保つ（振り下ろす腕の籠手が目の前をふさがず、刃の弧が見える）
    if (w === 'sword' && (u.swing || u.pAtk)) {
      const y1 = hd.position.y + base + dy, z1 = hd.position.z + dz, capY = eyeY - 0.3;
      const capY2 = capY + 0.02;
      if (y1 > capY2) dy -= (y1 - capY2) * u.fpk;
      if (z1 < 0.74) dz += (0.74 - z1) * u.fpk;
      dx += 0.1 * u.fpk;
    }
    // 鉄砲は筒を右へ少し寄せる（支える左の前腕が画面の真ん中をふさがない）
    if (w === 'gun') dx -= 0.1 * u.fpk;
    // 槍は狭い視野の下側へ手と袖を残す（前の左腕で中央をふさがない）
    if (w === 'spear') { dy -= 0.06 * u.fpk; dx -= 0.08 * u.fpk; }
    // 弓は弓手を少し下げ、左へ開く（伸ばした左の籠手が画面の左半分をふさがない）
    if (w === 'bow') { dy -= 0.1 * u.fpk; dx -= 0.14 * u.fpk; }
    // 握りが右の肩から腕の長さより遠い時は、肩の方へ引き寄せる（腕が届かず、拳が柄から離れて武器だけ浮いて見えない。馬上で多い）
    const RB = h.bones;
    if (u.mounted && w !== 'bow' && RB && RB.RightArm && RB.RightForeArm && RB.RightHand && hd.parent) {
      hd.parent.updateWorldMatrix(true, false);
      const sp = hd.parent.worldToLocal(RB.RightArm.getWorldPosition(_fpA)), ep = hd.parent.worldToLocal(RB.RightForeArm.getWorldPosition(_fpB)), wp = hd.parent.worldToLocal(RB.RightHand.getWorldPosition(_fpC));
      const reach = (sp.distanceTo(ep) + ep.distanceTo(wp)) * 0.9;
      _fpC.set(hd.position.x + dx - sp.x, hd.position.y + dy - sp.y, hd.position.z + dz - sp.z);
      // 馬上：拳は右の肩から前へ（少し内・少し下）腕を伸ばした所へ（目の真横に来て画面の外へ出ない）
      if (u.mounted && w !== 'bow' && !u.swing && !u.pAtk) {
        // 世界の向きで決める（握りの親の軸は体の前と揃わないことがある）
        const sw = RB.RightArm.getWorldPosition(_fpE), ew = RB.RightForeArm.getWorldPosition(_fpD), rw = sw.distanceTo(ew) + ew.distanceTo(RB.RightHand.getWorldPosition(_fpC));
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        let cx = u.pos.x - sw.x, cz = u.pos.z - sw.z; const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
        _fpD.set(sw.x + fx * rw * 0.85 + cx * 0.12, sw.y - 0.06, sw.z + fz * rw * 0.85 + cz * 0.12);
        hd.parent.worldToLocal(_fpD);
        const tx = _fpD.x, ty = _fpD.y, tz = _fpD.z;
        dx += (tx - (hd.position.x + dx)) * u.fpk; dy += (ty - (hd.position.y + dy)) * u.fpk; dz += (tz - (hd.position.z + dz)) * u.fpk;
        _fpC.set(hd.position.x + dx - sp.x, hd.position.y + dy - sp.y, hd.position.z + dz - sp.z);
      }
      const L = _fpC.length();
      if (L > reach && reach > 0.1) { const k = (1 - reach / L) * u.fpk; dx -= _fpC.x * k; dy -= _fpC.y * k; dz -= _fpC.z * k; }
    }
    // 一人称の込め直し：筒を立てて目の前をふさがないよう、体の前で斜めに下げ、筒口を画面の下の右寄りへ（台尻は腿の上）
    const rl = w === 'gun' && FP_RELOAD.has(u.gunPh);
    h.fpRl = (h.fpRl || 0) + ((rl ? 1 : 0) - (h.fpRl || 0)) * Math.min(1, dt * 6);
    // 一人称で担いだ鉄砲は、筒先を立てずに前へ寝かせる（筒が画面を縦に割って前をふさがない）
    if (w === 'gun' && (u.gunPh === 'carry' || u.gunPh === 'ready') && hd.rotation.x < -0.3) hd.rotation.x += (-0.3 - hd.rotation.x) * u.fpk;
    if (h.fpRl > 0.01 && RB && RB.Head && hd.parent) {
      // 目（頭の骨）から測る：筒口は目の前 0.7m・右へ 0.16m・下へ 0.24m（馬上は目を 0.16m 上げてあるので 0.08m）、筒は 35° ほど立てる
      // 一人称の体は描く間だけ左右に映す（player.js fpHide）ので、画面の右は体の左（-右）の側で置く
      const k = h.fpRl * u.fpk, ang = 0.6, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      hd.parent.updateWorldMatrix(true, false);
      RB.Head.getWorldPosition(_fpA);
      const dn = u.mounted ? 0.08 : 0.24, ca = Math.cos(ang), sa = Math.sin(ang);
      _fpA.x += fx * 0.7 + fz * 0.16 - fx * ca * 1.02; _fpA.z += fz * 0.7 - fx * 0.16 - fz * ca * 1.02; _fpA.y += 0.075 - dn - sa * 1.02;
      hd.parent.worldToLocal(_fpA);
      dx += (_fpA.x - (hd.position.x + dx)) * k; dy += (_fpA.y - (hd.position.y + dy)) * k; dz += (_fpA.z - (hd.position.z + dz)) * k;
      hd.rotation.x += (-ang - hd.rotation.x) * k;
    }
    hd.position.x += dx; hd.position.y += dy; hd.position.z += dz;
    const off = h.fpOffCache;
    off.dx = dx; off.dy = dy; off.dz = dz;
    off.lx = hd.position.x; off.ly = hd.position.y; off.lz = hd.position.z;
    h.fpOff = off;
  }
  // 技（u.tech）：武器の置き所と向きを、技の型に沿って動かす（腕は armsPose がその握りへ付いて行く）
  if (u.tech && !u.mounted) techHand(u, hd);
  const set = h.gset;
  set[0] = hd.position.x; set[1] = hd.position.y; set[2] = hd.position.z; set[3] = hd.rotation.x;
}
// 一人称で手を見える所へ寄せる量 [上へ, 前へ]（体の座標）。目から前へ 0.5m より近ければ前へ、目から約十六度より下なら上へ
const _fl = [0, 0];
// 一人称で筒を斜めに下げて込める手順（units.js の RELOAD の前半）
const FP_RELOAD = new Set(['lower', 'powder', 'ball', 'ram']);
// 武器の上の二点 a→b（武器の座標）を世界へ移し、肩から腕の長さで届く所まで a を b の方へ寄せる（結果は a に入る）
const _frS = new THREE.Vector3(), _frE = new THREE.Vector3(), _frH = new THREE.Vector3();
function fpReach(B, sd, a, b, gw) {
  gw.localToWorld(a); gw.localToWorld(b);
  B[sd + 'Arm'].getWorldPosition(_frS); B[sd + 'ForeArm'].getWorldPosition(_frE); B[sd + 'Hand'].getWorldPosition(_frH);
  const reach = (_frS.distanceTo(_frE) + _frE.distanceTo(_frH)) * 0.97;
  for (let i = 0; i < 8 && a.distanceTo(_frS) > reach; i++) a.lerp(b, 0.25);
  return a;
}
function fpLift(y, z, eyeY, k, capY = 0.34, capZ = 0.4) {
  const dz = Math.min(capZ, Math.max(0, 0.5 - (z - 0.1)));
  const ahead = z + dz - 0.1, drop = eyeY - y;
  const dy = Math.min(capY, Math.max(0, drop - 0.28 * ahead) * 0.9);
  _fl[0] = dy * k; _fl[1] = dz * k;
  return _fl;
}
// 一人称の本人：手のひらの真ん中を柄に当て、指が柄に巻き付く向きに手首を回す（柄が拳の中を通る。指が開いたまま・柄を貫く・隙間を作らない）
// axis：柄の先の向き（人差し指の側）。fing：指の付け根を向けたい向き（柄に直角へならす）。kf：前腕の向きとの混ぜ（0 で fing のまま）
const _gga = new THREE.Vector3(), _ggf = new THREE.Vector3(), _ggn = new THREE.Vector3(), _ggw = new THREE.Vector3(), _ggm = new THREE.Vector3(), _ggp = new THREE.Vector3();
const _ggta = new THREE.Vector3(), _ggtf = new THREE.Vector3(), _ggtn = new THREE.Vector3(), _ggpole = new THREE.Vector3(), _ggm0 = new THREE.Matrix4(), _ggm1 = new THREE.Matrix4(), _ggq = new THREE.Quaternion();
let _ggs = 1;
// 手の今の向き：f 手首→中指の付け根、a 人差し指の付け根→小指の付け根、n 手のひらの側。手首は _ggw、返すのは手のひらの長さ
function handFrame(B, sd, f, a, n) {
  B[sd + 'Hand'].getWorldPosition(_ggw);
  B[sd + 'HandMiddle1'].getWorldPosition(_ggm);
  f.copy(_ggm).sub(_ggw); const L = f.length() || 1e-4; f.multiplyScalar(1 / L);
  B[sd + 'HandPinky1'].getWorldPosition(a); B[sd + 'HandIndex1'].getWorldPosition(_ggp); a.sub(_ggp); a.addScaledVector(f, -a.dot(f)).normalize();
  n.crossVectors(f, a);
  // 手のひらの側＝曲げた中指の先のある側
  B[sd + 'HandMiddle3'].getWorldPosition(_ggp); _ggp.sub(_ggm);
  _ggs = _ggp.dot(n) < 0 ? -1 : 1;
  n.multiplyScalar(_ggs);
  return L;
}
function gripHand(B, sd, P, axis, fing, kf, pole) {
  const H = B[sd + 'Hand'];
  if (!B[sd + 'HandPinky1'] || !B[sd + 'HandIndex1'] || !B[sd + 'HandMiddle3']) return;
  _ggpole.copy(pole);
  for (let it = 0; it < 2; it++) {
    const L = handFrame(B, sd, _ggf, _gga, _ggn);
    _ggta.copy(axis).negate();
    // 指の向き：前腕の向き（今の f）と望む向きを混ぜ、柄に直角へ
    _ggtf.copy(fing).lerp(_ggf, kf);
    _ggtf.addScaledVector(_ggta, -_ggtf.dot(_ggta));
    if (_ggtf.lengthSq() < 1e-6) return;
    _ggtf.normalize();
    _ggtn.crossVectors(_ggtf, _ggta).multiplyScalar(_ggs);
    _ggm0.makeBasis(_ggf, _gga, _ggn).transpose();
    _ggm1.makeBasis(_ggtf, _ggta, _ggtn).multiply(_ggm0);
    _ggq.setFromRotationMatrix(_ggm1);
    applyWorldRot(H, _ggq);
    if (it === 1) break;
    // 手のひらの真ん中（指の付け根の少し手前、手のひらの側へ柄の太さだけ）が柄の点に来るよう、手首を動かす
    _ggp.copy(_ggw).addScaledVector(_ggtf, L * 0.8).addScaledVector(_ggtn, L * 0.3);
    _ggp.subVectors(P, _ggp).add(_ggw);
    ik2(B[sd + 'Arm'], B[sd + 'ForeArm'], H, _ggp, _ggpole);
  }
}
function gripSet(h, u, hd, w, dt) {
  if (w === 'spear') {
    const g0 = h.grip0 || (h.grip0 = { x: hd.position.x, y: hd.position.y });
    const wp = u.wpn;
    // 待つ・歩く（構えていない）時は槍を立てる
    const calm = !(u.spearSupport > 0.01) && !(u.contactBrace > 0.1) && !u.poseTarget?.alive && ((h.spd || 0) < 2.6 || u.spearRear) && (!u.target || u.spearRear) && !u.atk && !u.pAtk && !u.isPlayer && !u.swing && !(u.cheer > 0) && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.sweepT > 0) && hd.rotation.x < -0.4;
    h.upK = (h.upK ?? (calm ? 1 : 0)) + ((calm ? 1 : 0) - (h.upK ?? 0)) * Math.min(1, dt * 5);
    const k = h.upK, s = h.seed;
    // 構え：右手は右の腰（体の少し後ろ）、槍は units.js の向きのまま。叩きで振り上げる時は手も上がる
    const raise = Math.max(0, -hd.rotation.x - 0.25) * 0.28;
    // 突き出す時は、右手を柄の線に沿って前へ（穂先の高さのまま一直線に）押し出し、手元を体の真ん中へ絞る
    const ez0 = hd.position.z - 0.18;
    // 踏み込んで腰が沈む分だけ手元も下げる（手が顔の前へ上がらない）
    const sink = h.atkB ? 0.1 * h.atkB.L + 0.05 * h.atkB.W : 0;
    // 二列目の頭越しの構えも、共通のばねでならした高さを一度だけ渡す。
    const ex = 0.2 + (s - 0.5) * 0.03 - Math.max(0, ez0) * 0.12, ey = 1.08 + (s - 0.5) * 0.06 + raise + (u.spLift || 0) + ez0 * Math.sin(-hd.rotation.x) * 0.9 - sink, ez = hd.position.z - 0.16;
    // 立て槍：右手は胸の右、穂先を少し前へ。歩く・走るほど前へ傾ける
    const mv = Math.min(1, (u.moving || 0) / 1.4);
    // 立てた槍も握り直す：同じ腕の骨と握り合わせを使い、手元を少し上げて戻す
    const regrip = calm && u.idl && u.idl.a === 'regrip' ? Math.sin(clamp01(u.idl.k / u.idl.d) * Math.PI) : 0;
    const ux = 0.23, uy = 1.2 + (s - 0.5) * 0.04 + regrip * 0.055, uz = 0.1, urx = -1.47 + 0.06 * s + 0.25 * mv + regrip * 0.12 + (u.passCarry || 0);
    hd.position.set(ex + (ux - ex) * k, ey + (uy - ey) * k, ez + (uz - ez) * k);
    if (k > 0.001) {
      hd.rotation.x += (urx - hd.rotation.x) * k;
      hd.rotation.y = hd.rotation.y * (1 - k) + (u.passCarry || 0) * .6 * k;
      // 石突が地面の少し上に来るよう、柄の握る所をずらす
      const butt = wp.userData.butt ?? -1.5, sp = Math.sin(-hd.rotation.x);
      const slide = Math.max(-0.3, Math.min(0.9, (0.05 - hd.position.y) / Math.max(0.3, sp) - butt));
      wp.position.z += (slide - wp.position.z) * k;
    }
  } else if (w === 'sword') {
    swordGrip(h, u, hd, dt);
  } else if (w === 'gun' && u.gunPh === undefined && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6) {
    // units.js が込め直しの形を出さない時（下の gunReload）：筒を立てて台尻を地面へ
    hd.rotation.x = -1.45;
    hd.position.y = 0.04 + GUN_BUTT * Math.sin(1.45);
  } else if (w === 'gun' && (u.gunPh === 'ready' || u.gunPh === 'kiri')) {
    // 構え：銃を腰の前に引き寄せる（腕を前へ突き出さない）
    hd.position.z -= 0.09; hd.position.x -= 0.02;
    if (u.lh) { u.lh[0] -= 0.02; u.lh[2] -= 0.09; }
  } else if (w === 'gun' && u.lh && (u.gunPh === 'lower' || u.gunPh === 'powder' || u.gunPh === 'ball' || u.gunPh === 'ram')) {
    // 台尻を地面へ：筒を立てたまま下げる。左手の置き所（u.lh）も同じだけ下げる
    const sp = Math.sin(Math.max(0.3, -hd.rotation.x));
    const dy = Math.min(0, 0.04 + GUN_BUTT * sp - hd.position.y);
    hd.position.y += dy;
    u.lh[1] += dy;
  }
}
// 人をやめる時は、握りを units.js の所へ戻す
function gripReset(h) {
  const u = h.u;
  if (h.grip0 && u.hand) { u.hand.position.x = h.grip0.x; u.hand.position.y = h.grip0.y; h.upK = 0; }
  h.gset[0] = NaN;
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
  rotWorld(B.RightUpLeg, _right, -0.65); rotWorld(B.LeftUpLeg, _right, -0.65);
  rotWorld(B.RightUpLeg, _fwd, 0.65); rotWorld(B.LeftUpLeg, _fwd, -0.65);
  rotWorld(B.RightLeg, _right, 0.85); rotWorld(B.LeftLeg, _right, 0.85);
  rotWorld(B.RightLeg, _fwd, -0.65); rotWorld(B.LeftLeg, _fwd, 0.65);
  // 腰の高さを鞍へ。馬の背の上下・前後の揺れは、乗り手の入れ物（u.seat）が鞍の骨からそのまま受ける
  const spd = H ? H.speed || 0 : h.spd;
  h.model.position.y = RIDE.y + 0.71 - SRC.rest.Hips.y;
  h.model.position.z = 0;
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
  // 駆ける時は鐙に立つ：膝で弾みを吸い、腰を鞍から浮かせて前へ。頭の高さはほとんど動かさない（名のある武将と本人は深く、兵は浅く）
  const named = isNamed(h.look) || u.isPlayer;
  const stand = clamp01((spd - 5) / 4) * (named ? 1 : 0.6);
  h.stand = (h.stand || 0) + (stand - (h.stand || 0)) * Math.min(1, dt * 3);
  if (h.stand > 0.01) {
    const st = h.stand;
    h.model.position.y += 0.1 * st - bob * 0.05 * st;
    rotWorld(B.RightLeg, _right, -0.4 * st); rotWorld(B.LeftLeg, _right, -0.4 * st);
    rotWorld(B.RightUpLeg, _right, 0.25 * st); rotWorld(B.LeftUpLeg, _right, 0.25 * st);
    // 本人は襲歩で鞍の上に低く伏せ、首だけ起こして前を見る（後ろから背が大きく見える）
    const dive = u.isPlayer ? clamp01((spd - 8) / 3) : 0;
    rotWorld(B.Spine, _right, (0.1 + 0.14 * dive) * st);
    rotWorld(B.Neck, _right, -(0.12 + 0.12 * dive) * st);
  }
  // 武将の背筋：並足・止まっている時は腰を据えて背を立て、胸を張る（兵より姿勢が良い）
  if (named && !u.isPlayer) { const k = 1 - h.stand; rotWorld(B.Spine1, _right, -0.05 * k); rotWorld(B.Spine2, _right, -0.04 * k); }
  // 首を立てて顎を引く：馬上で首だけ前へ突き出すと、兜の重さで背を丸めた荷物に見える（測ると首が前へ 27 度）
  if (!u.isPlayer) rotWorld(B.Neck, _right, -0.2 * (1 - 0.5 * h.stand));
}
// 突き・振りの体：W 溜め（引いて腰を落とし、後ろ足に乗る）・L 突き出し／振り下ろし（前へ踏み込み、腰を切る）。
// どちらもならして（一コマで跳ばない）骨に重ねる。馬上は踏み込む代わりに鐙に立ち、上から突き・払う
// ---- 槍捌き・刀捌きの技（名前で呼ぶ：startTech(兵, '名前')） ----
// 型は時刻ごとの鍵：[時(0〜1), 手の置き所のずれ x・y・z（m、体の座標）, 武器の向きのずれ rx（負で穂先・切っ先が上）・ry（横へ振る）・rz（刃の傾き）,
//                    （槍の rx は構え（穂先を少し上げた形）からのずれ）胸のひねり tw（正で左へ）, 反り lean（正で前へ折る）, 腰の沈み drop（m）]。鍵の間は滑らかにつなぐ
const TECH = {
  // 槍を頭上で振り回す：両手で頭の上へ差し上げ、槍を水平にして二回り。体も回りについて行き、足を開いて踏ん張る
  yari_mawashi: { dur: 1.5, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.15, -0.1, 0.62, -0.12, 0.5, 0, 0, 0.1, -0.12, 0.04], [0.5, -0.1, 0.66, -0.12, 0.55, 3.14, 0.2, 0.35, -0.1, 0.05], [0.82, -0.1, 0.62, -0.12, 0.5, 6.28, 0, -0.2, -0.08, 0.05], [1, 0, 0, 0, 0, 6.28, 0, 0, 0, 0]] },
  // 払う：穂先を低く、右から左へ大きく薙ぎ払う（足を払う）。腰を落とし、胸を回し切る
  yari_harai: { dur: 0.8, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.25, 0.15, -0.05, -0.05, 0.75, 0.9, 0.2, -0.5, 0.1, 0.06], [0.6, -0.2, -0.1, 0.1, 0.8, -1.1, -0.2, 0.6, 0.2, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 叩き下ろす：穂先を高く振り上げ（体を反らす）、全身で打ち下ろす（腰を沈め、前へ折る）。打った後は一瞬とどめる
  yari_tataki: { dur: 0.95, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.4, 0, 0.45, -0.15, -0.9, 0, 0, 0.1, -0.2, 0], [0.55, 0, -0.05, 0.2, 0.7, 0, 0, -0.05, 0.3, 0.12], [0.75, 0, -0.05, 0.2, 0.66, 0, 0, 0, 0.28, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 石突きで突く：槍を返して石突きを前へ向け、短く鋭く突き込む（詰め寄った敵へ）
  yari_ishizuki: { dur: 0.9, w: 'spear', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.3, 0, 0.1, -0.2, 0.4, 3.14, 0, 0.2, 0, 0.03], [0.48, 0, 0.1, 0.25, 0.4, 3.14, 0, -0.1, 0.18, 0.08], [0.7, 0, 0.1, -0.1, 0.4, 3.14, 0, 0.1, 0, 0.03], [1, 0, 0, 0, 0, 6.28, 0, 0, 0, 0]] },
  // 刀の連続斬り：袈裟（右上から左下）→ 逆袈裟（左下から右上）→ 横一文字。一太刀ごとに踏み込み、胸を切り返す
  katana_renzan: { dur: 1.3, w: 'sword', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.12, 0.15, 0.4, -0.1, -1.3, 0.3, -0.6, -0.4, -0.1, 0], [0.3, -0.2, -0.1, 0.25, 0.7, -0.4, 0.6, 0.45, 0.25, 0.1], [0.5, 0.2, 0.3, 0.1, -0.9, 0.5, 0.9, -0.35, 0, 0.05], [0.65, 0.25, 0.1, 0.1, -0.2, 0.9, 1.5, -0.5, 0.05, 0.06], [0.85, -0.25, 0.1, 0.25, -0.2, -0.9, 1.5, 0.55, 0.15, 0.1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
  // 切り返し：真っ向から斬り下ろし、刃を返して下から斬り上げる（間を空けずに）
  katana_kaeshi: { dur: 0.9, w: 'sword', keys: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.22, 0, 0.45, -0.1, -1.4, 0, 0, 0, -0.15, 0], [0.42, 0, -0.15, 0.25, 0.8, 0, 0, 0, 0.3, 0.12], [0.5, 0, -0.18, 0.25, 0.85, 0, 3.14, 0, 0.3, 0.12], [0.72, 0.1, 0.35, 0.15, -1.1, 0.2, 3.14, -0.25, -0.1, 0.04], [1, 0, 0, 0, 0, 0, 6.28, 0, 0, 0]] },
};
const TECH_OF = { spear: ['yari_mawashi', 'yari_harai', 'yari_tataki', 'yari_ishizuki'], sword: ['katana_renzan', 'katana_kaeshi'] };
const GOU_TECH = { spear: ['yari_mawashi', 'yari_mawashi', 'yari_harai', 'yari_tataki'], sword: ['katana_renzan', 'katana_renzan', 'katana_kaeshi'] };
export const TECH_NAMES = Object.keys(TECH);
// 技を出す（兵 u、技の名前）。返す物：技の長さ（秒。知らない名前・馬上なら 0）。体の動きの形だけで、当たりは呼ぶ側が決める
export function startTech(u, name) {
  const T = TECH[name];
  if (!T || !u || !u.alive || u.mounted) return 0;
  u.tech = { k: name, t: 0 };
  return T.dur;
}
export function techDur(name) { return TECH[name] ? TECH[name].dur : 0; }
const _tk = new Float32Array(9);
function techAt(u) {
  const T = TECH[u.tech.k], K = T.keys, q = clamp01(u.tech.t / T.dur);
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= q) i++;
  const a = K[i], b = K[i + 1], f = clamp01((q - a[0]) / Math.max(1e-4, b[0] - a[0])), e = f * f * (3 - 2 * f);
  for (let j = 0; j < 9; j++) _tk[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * e;
  return _tk;
}
function techHand(u, hd) {
  const k = techAt(u);
  hd.position.x += k[0]; hd.position.y += k[1]; hd.position.z += k[2];
  hd.rotation.x += k[3]; hd.rotation.y += k[4]; hd.rotation.z += k[5];
}
function techBody(h, B, u) {
  const k = techAt(u);
  if (k[6]) { rotWorld(B.Spine, _up, k[6] * 0.35); rotWorld(B.Spine1, _up, k[6] * 0.4); rotWorld(B.Neck, _up, -k[6] * 0.5); }
  if (k[7]) { rotWorld(B.Spine, _right, k[7] * 0.5); rotWorld(B.Spine1, _right, k[7] * 0.4); }
  if (k[8]) {
    rotWorld(B.LeftUpLeg, _right, -k[8] * 3); rotWorld(B.LeftLeg, _right, k[8] * 4);
    rotWorld(B.RightUpLeg, _right, k[8] * 1.2); rotWorld(B.RightLeg, _right, k[8] * 3);
    rotWorld(B.LeftUpLeg, _fwd, -k[8] * 1.2); rotWorld(B.RightUpLeg, _fwd, k[8] * 1.2);
    h.model.position.y -= k[8];
  }
}
function atkPhase(u, w, out) {
  let W = 0, L = 0, tw = 0;
  const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk;
  // 溜めはゆっくり（出だしと溜め切りを柔らかく）
  if (a && (a.dur || u.windup)) { W = clamp01(1 - Math.max(0, a.t) / (a.dur || u.windup)); W = W * W * (3 - 2 * W); }
  const sw = u.swing;
  if (sw && sw.t < sw.dur + 0.3) {
    const p = sw.t / Math.max(0.05, sw.dur);
    if (w === 'spear' && (sw.kind === 'thrust' || sw.kind === 'charge')) L = thrustOut(p, sw.dur, !u.mounted && (u.isPlayer || u.focusD <= 15) ? 0.14 : 0.26);
    else if (w === 'spear' && sw.kind === 'hook') {
      // 引き倒し：突きで踏み込み、引く時は腰を落として後ろ足へ体を預ける
      const x = clamp01(p / 0.35), y = clamp01((p - 0.4) / 0.45), r = clamp01((sw.t - sw.dur) / 0.3);
      L = (x * x * (3 - 2 * x) * (1 - y) - 0.3 * y * y * (3 - 2 * y)) * (1 - r * r * (3 - 2 * r));
    } else {
      // 振り抜いたら残心（一呼吸とどめる）、それから中くらいの速さで構えへ
      const q = clamp01(p), r = clamp01((sw.t - sw.dur - 0.08) / 0.22);
      L = p <= 1 ? Math.sin(Math.min(1, q * 1.3) * Math.PI / 2) : 1 - r * r * (3 - 2 * r); tw = (sw.side || 1) * (q < 0.3 ? -q / 0.3 : -1 + 2 * Math.min(1, (q - 0.3) / 0.6)) * (1 - r * r * (3 - 2 * r)); }
    W = 0;
  } else if (u.strikeT > 0 && u.isPlayer) L = Math.sin((1 - u.strikeT / 0.2) * Math.PI);
  if (u.sweepT > 0) { L = Math.max(L, Math.sin((1 - u.sweepT / 0.35) * Math.PI) * 0.7); tw = Math.sin((1 - u.sweepT / 0.35) * Math.PI * 2) * 0.8; }
  out.wantW = W; out.wantL = L; out.wantTw = tw;
}
// 刀の扱い：刃筋・残心・鎬の受け・馬上の片手斬り（units.js の手の置き所と向きに、ずれを足す）
//   振る間：刃（刀の下の側）を振る向きへ向ける。袈裟は刀を斜めに寝かせ、真っ向は立てたまま（刃筋が通る）
//   振り抜いた後：切っ先を少し下げて一呼吸とどめる（残心）
//   受け：刀を斜めに立て、刃でなく鎬（刀の側面の稜）を相手の太刀へ当てる
//   馬上：片手で、体の横へ大きく斬り下ろす。振り抜きで手首を返す
function swordGrip(h, u, hd, dt) {
  const S = h.swd || (h.swd = { roll: 0, guard: 0, zan: 0, t: 0 });
  const sw = u.swing;
  let roll = 0, zan = 0, pitch = 0, side = 0;
  if (sw) {
    const p = sw.t / Math.max(0.05, sw.dur), sd = sw.side || 0;
    // 袈裟・逆袈裟（side が左右）は刀を寝かせ、真っ向（0）は立てる。振り出しから振り抜きへ、手首を返して刃筋を合わせる
    roll = sd * (0.55 + 0.25 * Math.min(1, p));
    if (p > 1) zan = Math.min(1, (p - 1) * 3) * (1 - clamp01((sw.t - sw.dur - 0.35) / 0.25));
    if (u.mounted) { side = (sd || 1) * 0.22 * Math.sin(Math.min(1, p) * Math.PI); pitch = 0.3 * Math.sin(clamp01(p) * Math.PI); }
  }
  const g = u.guard || u.guardFlash > 0 || u.guarding > 0 ? 1 : 0;
  const k = Math.min(1, dt * 14);
  S.roll += (roll - S.roll) * k; S.zan += (zan - S.zan) * k; S.guard += (g - S.guard) * Math.min(1, dt * 12);
  hd.rotation.z += S.roll;
  // 残心：切っ先を少し下げ、腕を伸ばしたまま
  hd.rotation.x += 0.28 * S.zan; hd.position.z += 0.05 * S.zan;
  // 鎬で受ける：刀を斜めに立て、刃を外へ、鎬を相手へ（手は胸の前、少し上）
  if (S.guard > 0.01 && !sw) {
    const gk = S.guard, sd = h.seed > 0.5 ? 1 : -1;
    hd.rotation.x += (-1.05 - hd.rotation.x) * gk; hd.rotation.z += (0.75 * sd - hd.rotation.z) * gk;
    hd.position.y += 0.14 * gk; hd.position.x -= 0.06 * gk; hd.position.z += 0.06 * gk;
  }
  // 馬上の片手斬り：体の横へ手を出し、振り抜きで手首を返す
  if (u.mounted && sw) { hd.position.x += side; hd.rotation.x += pitch; hd.rotation.z += side * 1.8; }
  if (!sw && S.guard < 0.01 && Math.abs(S.roll) < 0.01 && S.zan < 0.01 && u.mounted) h.swd = null;
}
// 速さを持ったばね（army_anim.js の spr2 と同じ）：目当てへ行き過ぎずに寄せ、速さが一コマで跳ばない
function spr2(s, k, to, w, dt) {
  const vk = 'v' + k, y = s[k] - to, v = s[vk] || 0, e = Math.exp(-w * dt), c = (v + w * y) * dt;
  s[k] = to + (y + c) * e; s[vk] = (v - w * c) * e;
}
function attackBody(h, B, u, w, dt) {
  const A = h.atkB || (h.atkB = { W: 0, L: 0, t: 0, R: 0 });
  atkPhase(u, w, A);
  let W = A.wantW; const L = A.wantL, tw = A.wantTw;
  // 振り出す間は、溜めの形を打ちの伸びと入れ替えて解く（溜めが一コマで消えて体が跳ねない）
  if (u.swing && u.swing.t < u.swing.dur) W = Math.min(A.W, 1 - L);
  // 速さを持ったばねで寄せる（溜め→踏み込み→戻り→次の踏み込みで、腰と足が一コマで跳ばない）
  spr2(A, 'W', W, 30, dt); spr2(A, 'L', L, 34, dt); spr2(A, 't', tw, w === 'spear' ? 22 : 26, dt);
  // 受け止められた一撃は、その当たりの時計で腰を引き、後ろ足へ重さを戻す。
  // 手の止まりに体が追い越さない。近い徒歩だけ、既存の骨とばねを使う。
  const sw = u.swing;
  let resist = 0;
  if (HUM.fx && !h.far && !u.isPlayer && !u.mounted && !u.hit && !u.downed && !reduceMotion()
    && sw?.done && (sw.res === 'block' || sw.res === 'armor')) {
    const age = Math.max(0, sw.t - sw.dur * (sw.at || 0));
    resist = ease(0, 0.07, age) * (1 - ease(0.1, 0.32, age)) * (sw.res === 'block' ? 1 : 0.55);
  }
  if (A.R === undefined) A.R = 0;
  if (resist > 0 || A.R > 0.001 || Math.abs(A.vR || 0) > 0.001) spr2(A, 'R', resist, 32, dt);
  else A.R = 0;
  const r0 = !h.far && !u.isPlayer && !u.mounted && !u.hit && !u.downed && !reduceMotion() ? Math.max(0, A.R) : 0;
  const w0 = Math.max(0, A.W), l0 = Math.max(-0.35, A.L * (1 - 0.7 * r0)), t0 = A.t;
  if (w0 < 0.01 && Math.abs(l0) < 0.01 && Math.abs(t0) < 0.01 && r0 < 0.01) return;
  if (u.mounted) {
    // 馬上：溜めでは上体を引き、突き・振りでは鐙に立って腰を浮かせ、上から前へ体を預ける
    // 勝家ら豪傑は馬上でも鐙を踏み、胸を大きく返す。技の速さ・間合い・威力は変えず姿だけに差を出す。
    const gou = !u.isPlayer && u.look?.style === 'gouketsu', power = gou ? 1.5 : 1;
    h.model.position.y += (0.1 * l0 - 0.02 * w0) * power;
    rotWorld(B.RightLeg, _right, -0.45 * l0 * power); rotWorld(B.LeftLeg, _right, -0.45 * l0 * power);
    rotWorld(B.Spine, _right, (0.22 * l0 - 0.1 * w0) * power);
    rotWorld(B.Spine1, _up, ((w === 'spear' ? 0.25 * w0 - 0.2 * l0 : 0) - t0 * 0.3) * power);
    return;
  }
  const sp = w === 'spear';
  // 手取川の利家。長い朱槍を回す代わりに、足を据えた突きの溜めと腰の返しを強くする。
  // 骨の姿だけを動かし、当たり判定・踏み込みの移動量・速さには触れない。
  if (sp && !u.isPlayer && u.look?.spearThrust && u.look.style === 'gouketsu') {
    h.model.position.y -= 0.035 * (w0 + Math.abs(l0));
    rotWorld(B.RightLeg, _right, 0.12 * w0);
    rotWorld(B.Hips, _up, 0.08 * w0 - 0.1 * l0);
    rotWorld(B.Spine1, _up, 0.1 * w0 - 0.09 * l0);
  }
  // 溜め：腰を落とし、上体を少し引いて後ろ（右）足に乗る。槍は右の肩を引いて胸を開く
  h.model.position.y -= 0.06 * w0 + 0.075 * Math.abs(l0);
  h.model.position.z -= 0.045 * w0;
  rotWorld(B.RightUpLeg, _right, -0.2 * w0); rotWorld(B.RightLeg, _right, 0.35 * w0);
  rotWorld(B.Spine, _right, -0.08 * w0 + (sp ? 0.12 : 0.07) * l0);   // 背は立てたまま、腰ごと前へ出る（頭から突っ込まない）
  if (sp) {
    // 長い柄を後ろ足と腰で支え、腰から押して胸が遅れてついて来る。
    rotWorld(B.Hips, _up, 0.12 * w0 - 0.2 * l0);
    rotWorld(B.Spine1, _up, 0.22 * w0 - 0.18 * l0);
    rotWorld(B.Spine2, _right, 0.035 * w0 + 0.04 * Math.abs(l0));
    rotWorld(B.Neck, _up, -0.18 * w0 + 0.2 * l0);
  }
  // 突き出し・振り下ろし：後ろ足で地を押して前へ踏み込む（前の左足は膝を曲げ、後ろの右足は伸びる）
  h.model.position.z += (sp ? 0.22 : 0.12) * l0;
  rotWorld(B.LeftUpLeg, _right, -0.4 * l0); rotWorld(B.LeftLeg, _right, 0.5 * l0);
  rotWorld(B.RightUpLeg, _right, 0.3 * l0); rotWorld(B.RightLeg, _right, -0.18 * Math.max(0, l0) * clamp01(h.stance || 0));
  rotWorld(B.RightFoot, _right, 0.12 * Math.max(0, l0));
  if (r0 > 0.01) {
    h.model.position.z -= 0.085 * r0; h.model.position.y -= 0.035 * r0;
    rotWorld(B.RightUpLeg, _right, -0.12 * r0); rotWorld(B.RightLeg, _right, 0.26 * r0);
    rotWorld(B.Spine, _right, -0.1 * r0); rotWorld(B.Spine1, _up, 0.1 * r0);
    rotWorld(B.Neck, _up, -0.08 * r0);
  }
  // 刀：肩から腰を回して振る（腰が先、胸が後から付いて来る）
  if (!sp && Math.abs(t0) > 0.01) { rotWorld(B.Hips, _up, -t0 * 0.16); rotWorld(B.Spine1, _up, -t0 * 0.24); rotWorld(B.Spine2, _up, -t0 * 0.08); rotWorld(B.Neck, _up, t0 * 0.3); }
}
// 受け：腰を落として備え、当たりを後ろ足で受け、胸から遅れて構えに戻る。
function guardBody(h, B, u, dt) {
  // 手元の備えと同じ量で胸と後ろ膝を引く。実際の防御・被弾の反応を優先する。
  const cover = !h.far && !u.hit && !u.atk && !u.swing ? (u.contactCover || 0) : 0;
  const wanted = u.guard || u.guardFlash > 0 || u.guarding > 0 ? 1 : cover * 0.75;
  h.guardK = (h.guardK || 0) + (wanted - (h.guardK || 0)) * (1 - Math.exp(-dt * (wanted ? 12 : 5)));
  const g = h.guardK * (1 - clamp01(h.atkB ? h.atkB.L : 0));
  const hit = u.hit;
  const recoil = hit && hit.res === 'block' ? Math.sin(ease(0, 0.22, hit.t / Math.max(0.05, hit.dur || 0.4)) * Math.PI / 2) * (1 - ease(0.22, 1, hit.t / Math.max(0.05, hit.dur || 0.4))) : 0;
  if (g + recoil < 0.01) return;
  rotWorld(B.RightUpLeg, _right, -0.16 * g - 0.08 * recoil);
  rotWorld(B.RightLeg, _right, 0.28 * g + 0.18 * recoil);
  rotWorld(B.LeftUpLeg, _right, -0.06 * g);
  rotWorld(B.LeftLeg, _right, 0.18 * g);
  rotWorld(B.Spine, _right, -0.06 * g - 0.1 * recoil);
  rotWorld(B.Spine2, _right, 0.025 * g - 0.05 * recoil);
  rotWorld(B.Neck, _right, 0.05 * g);
  h.model.position.y -= 0.035 * g + 0.025 * recoil;
  h.model.position.z -= 0.035 * recoil;
  if (cover > 0.01) {
    rotWorld(B.Spine1, _up, (u.id % 2 ? 0.1 : -0.1) * cover);
    rotWorld(B.Neck, _up, (u.id % 2 ? -0.08 : 0.08) * cover);
  }
}

// 草摺・袖の揺れ（ばね）
// 支点（体の座標）：草摺は腰、袖は肩、陣羽織は肩の下、母衣は背の上
const PIVOT = { hips: [0, 0.9, 0.0], sodeP: [0.2, 1.43, 0], sodeN: [-0.2, 1.43, 0], haori: [0, 1.42, -0.1], back: [0, HORO_TOP, HORO_BACK], pole: [0, 1.1, -0.21] };
const SWAY_K = { hips: 0.5, sodeP: 0.8, sodeN: 0.8, haori: 0.9, back: 1.1, pole: 0.45 };
const _pv3 = new THREE.Matrix4(), _pr = new THREE.Matrix4(), _sm = new THREE.Matrix4();
const _hgM = new THREE.Matrix4(), HANG_K = 0.85;
function sway(h, dt) {
  const u = h.u;
  // 上下の弾み（歩み・駆け足・馬の背）と、前後の速さの変わり、曲がる速さ。高さは世界の座標で（馬上は鞍の揺れも入る）
  const yNow = h.model.matrixWorld.elements[13];
  const s = h.sw || (h.sw = { a: 0, va: 0, b: 0, vb: 0, py: yNow, ps: 0 });
  const vy = dt > 0 ? (yNow - s.py) / dt : 0; s.py = yNow;
  const acc = dt > 0 ? (h.spd - s.ps) / dt : 0; s.ps = h.spd;
  // 目標の角度へばねで寄る（遅れて揺れる）。弾みが大きいほど大きく
  // 風：体の前後・左右に分けて、垂れた布（陣羽織・草摺・袖）を風下へ押し、突風で細かく震わせる
  const wg = Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1)), wr = WIND_STATE.dirX * _right.x + WIND_STATE.dirZ * _right.z, wf = WIND_STATE.dirX * _fwd.x + WIND_STATE.dirZ * _fwd.z;
  const wfl = Math.sin((h.clock || 0) * 3.3 + h.seed * 7) * 0.6 + Math.sin((h.clock || 0) * 5.9 + h.seed * 3) * 0.4;
  // 突き戻しの重心も同じばねへ渡し、止まって戦う兵の草摺・袖が腰から遅れて戻る。
  const contactCloth = reduceMotion() || !u.alive || u.mounted ? 0 : (u.contactDrive || 0) * 0.075 - (u.contactLoad || 0) * 0.045;
  const want = Math.max(-0.4, Math.min(0.4, -vy * 0.07 - acc * 0.02 + Math.min(0.25, h.spd * 0.025) + wf * 0.035 * wg + wfl * 0.012 * wg + contactCloth));
  const k = Math.min(dt, 1 / 30);
  s.va += ((want - s.a) * 90 - s.va * 8) * k; s.a += s.va * k;
  // 横から受けた力も袖と草摺へ遅れて伝える。風だけで同時に揺れる板にしない。
  const receiveSide = !reduceMotion() && u.alive && !u.mounted
    ? (u.contactParrySide || 0) * 0.065 + (u.contactStop || 0) * (u.id % 2 ? 0.035 : -0.035) : 0;
  const wantB = Math.max(-0.3, Math.min(0.3, (h.turn || 0) * 0.12 + wr * 0.07 * wg * (1 + 0.35 * wfl) + Math.sin(h.runPh || 0) * 0.09 * (u.mounted || !u.alive ? 0 : h.runW || 0) + receiveSide));
  s.vb += ((wantB - s.b) * 60 - s.vb * 7) * k; s.b += s.vb * k;
  // 母衣のふくらみ：止まるとしぼんで垂れ、駆けると風をはらんで後ろへなびく（0..1。ふくらむのは速く、しぼむのはゆっくり）
  const infW = Math.max(0, Math.min(1, (h.spd - 1.2) / 5.5));
  s.inf = (s.inf ?? infW) + (infW - (s.inf ?? infW)) * Math.min(1, k * (infW > (s.inf ?? 0) ? 3 : 1.2));
  // 陣羽織は胸の骨に付くので、胸が前へ屈むと裾が板のように後ろへ跳ね上がる。胸の傾き（立ち姿から）の分だけ裾を戻し、下へ垂らす
  let hang = 0;
  if (h.parts.haori || h.parts.back || (h.xb && (h.xb.swHaori || h.xb.swBack))) {
    const sp = h.bones && h.bones.Spine2;
    if (sp) {
      const e = _hgM.copy(h.model.matrixWorld).invert().multiply(sp.matrixWorld).elements, r = restMatrix('Spine2').elements;
      hang = Math.max(-0.7, Math.min(0.7, Math.atan2(e[6], e[5]) - Math.atan2(r[6], r[5]))) * HANG_K;
    }
  }
  for (const key in PIVOT) {
    // 岩村で横へ落とした竿は、背の形と二重に出さない。
    if (key === 'pole' && (u.iwaFlagRig || u.tennojiFlagRig)) {
      if (h.xb?.swPole) h.xb.swPole.matrix.makeScale(0, 0, 0);
      if (h.parts.pole) h.parts.pole.visible = false;
      continue;
    }
    const [x, y, z] = PIVOT[key], K = SWAY_K[key];
    // 前へ出る向きの揺れは袖・草摺は小さく、後ろへなびく物（陣羽織・母衣）は大きく
    let ax = key === 'haori' || key === 'back' ? -Math.abs(s.a) * K - 0.02 - (key === 'back' ? s.inf * 0.35 : 0) : s.a * K;
    // 桶狭間の竹籠は背に沿わせる。駆けても裾を後ろへ大きく跳ね上げない。
    const ovalHoro = key === 'back' && h.look.longHoro;
    if (ovalHoro) ax = Math.max(-0.06, -Math.abs(s.a) * 0.15 - 0.01);
    // 背に結んだ布も胸の傾きを戻し、馬上で前屈しても裾は下へ垂らす。
    if (key === 'back' && !ovalHoro) ax = hang - Math.min(0.16, Math.abs(s.a) * 0.4 + s.inf * 0.08);
    if (key === 'haori') { ax += hang; if (h.look.nanban && reduceMotion()) ax = hang; }
    // 倒れた陣羽織は根元の傾きにも沿わせ、裾が空へ張り出すのを抑える。
    const fallenCloth = !u.alive && !u.mounted && key === 'haori';
    if (fallenCloth) ax = hang - Math.sin(u.mesh.rotation.x) * 0.18;
    // 指物の竿：駆けると風を受けて後ろへしなり、風上を向けば押し返される（馬上は大きく）
    if (key === 'pole') ax += -Math.min(0.3, h.spd * 0.03) * (u.mounted ? 1 : 0.4) + wf * 0.05 * wg + (u.mounted && h.spd > 6 ? Math.sin((h.clock || 0) * 14.5 + h.seed * 5) * Math.min(0.05, (h.spd - 6) * 0.01) : 0);   // 駆ける馬上では、蹄の拍子で竿が細かく震える
    // 指物をそろえる戦では、受筒から上の竿だけは真っ直ぐに保つ。
    const straightPole = key === 'pole' && u.look.straightFlag;
    _pr.makeRotationFromEuler(_eu.set(straightPole ? 0 : ax, 0, fallenCloth ? -Math.sin(u.mesh.rotation.z) * 0.18 : straightPole || key === 'haori' && h.look.nanban && reduceMotion() ? 0 : s.b * (ovalHoro ? 0.2 : key === 'back' ? 1 : 0.5)));
    // 吊った袖は腕が押した分だけ外へ開く。胸と一体の箱のまま腕を貫かせない。
    // 骨の既存の行列を読み、肩の支点・形・材質は共用する。
    if (!h.far && u.alive && (key === 'sodeP' || key === 'sodeN')) {
      const positive = key === 'sodeP', left = (SRC.rest.LeftArm.x > 0) === positive;
      const shoulder = h.bones[left ? 'LeftArm' : 'RightArm']?.matrixWorld.elements;
      const elbow = h.bones[left ? 'LeftForeArm' : 'RightForeArm']?.matrixWorld.elements;
      if (shoulder && elbow) {
        const dx = elbow[12] - shoulder[12], dy = elbow[13] - shoulder[13], dz = elbow[14] - shoulder[14];
        const len = Math.max(.01, Math.hypot(dx, dy, dz));
        const out = Math.max(0, (dx * _right.x + dy * _right.y + dz * _right.z) * (positive ? 1 : -1) / len);
        const forward = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / len;
        _pr.multiply(m0.makeRotationZ((positive ? 1 : -1) * Math.min(.55, out * .65)));
        _pr.multiply(m0.makeRotationX(Math.max(-.3, Math.min(.3, forward * .35))));
      }
    }
    if (u.tennojiGrounded && (!u.alive || u.dying) && (key === 'sodeP' || key === 'sodeN')) _pr.makeRotationFromEuler(_eu.set(-.1, 0, key === 'sodeP' ? -.18 : .18));
    if (key === 'back') {
      // 竹の輪の寸法は保ち、布のたるみだけ小さく揺らす。風船のような膨張を避ける。
      const f = s.inf;
      const flap = reduceMotion() ? 0 : (0.004 + f * 0.006) * wg * wfl;
      _pr.multiply(m0.makeScale(1 + flap * 0.3, 1, 0.98 + 0.02 * f + flap));
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
  if (((h.xb && h.xb.swK0) || h.kzMesh) && !h.look.sohei) kusazuri(h, s, k, vy);
}
// 草摺の板：一枚ずつ、腰の上の縁を支点に外へ開く角度をばねで動かす
// 膝がその板の裾より外へ出れば（歩み・踏み込み・膝つき）板は押し開かれ、体の弾みと向きの変わりで遅れて揺れる
const _kA = new THREE.Vector3(), _kH = new THREE.Vector3(), _kN = new THREE.Vector3(), _kT = new THREE.Vector3();
function kusazuri(h, s, k, vy) {
  const B = h.bones, KP = kusaPlates(h.look);
  const P = h.kz || (h.kz = { a: new Float32Array(7), v: new Float32Array(7) });
  B.Hips.getWorldPosition(_kH);
  const knees = [B.LeftLeg, B.RightLeg];
  const R0 = 0.21, R1 = 0.25, L = 0.27;
  for (let i = 0; i < KP.np; i++) {
    const c = KP.c(i), sc = Math.sin(c), cc = Math.cos(c);
    _kN.copy(_right).multiplyScalar(sc).addScaledVector(_fwd, cc);
    let push = 0;
    if (k > 0) for (const kn of knees) {
      kn.getWorldPosition(_kA).sub(_kH);
      const d = _kA.dot(_kN), drop = Math.max(0.1, -_kA.y);
      // 膝が板の裾より外なら、その分だけ開く（膝の高さまでの板の長さで角度に）
      push = Math.max(push, Math.atan2(Math.max(0, d - R1 * 0.8), Math.min(L, drop)));
    }
    // 体の弾みと前後の揺れ（全体の揺れ s.a の前後の成分）、板ごとに少しずつ違う
    const want = Math.min(0.9, push * 1.1) + s.a * 0.5 * cc - vy * 0.02 * (0.7 + 0.3 * ((i * 0.37 + h.seed) % 1));
    P.v[i] += ((want - P.a[i]) * 140 - P.v[i] * 10) * k; P.a[i] += P.v[i] * k;
    const a = Math.max(-0.25, Math.min(1.0, P.a[i]));
    const px = sc * R0, pz = cc * R0 * 0.86, py = 0.9;
    _kT.set(cc, 0, -sc);
    _pr.makeRotationAxis(_kT, -a);
    // 本人・武将（部品の形）：板の形を腰の部品の中で回す
    if (h.kzMesh) { const pm = h.kzMesh[i]; if (pm) pm.matrix.copy(_pv3.makeTranslation(px, py, pz)).multiply(_pr).multiply(m1.makeTranslation(-px, -py, -pz)); continue; }
    const bn = h.xb['swK' + i];
    const Rm = restMatrix('Hips'), Ri = restInverse('Hips');
    _sm.copy(SRC.fitT).multiply(_pv3.makeTranslation(px, py, pz)).multiply(_pr).multiply(m1.makeTranslation(-px, -py, -pz)).multiply(SRC.fitTi);
    bn.matrix.copy(Ri).multiply(_sm).multiply(Rm);
  }
}
const _eu = new THREE.Euler();
const restInvs = {};
function restInverse(nm) { return restInvs[nm] || (restInvs[nm] = restMatrix(nm).clone().invert()); }

// ---------------- 近い者を選んで入れ替える ----------------
const humans = new Set();
// 選び直す入れ物は、人と馬で分けて使い回す。
const humanCandidates = [], humanWanted = new Map(), humanNear = [];
// 上限付きの入れ物を支度の時に作り、兵ごとの候補を毎コマ作らない。
const humanCandidatePool = Array.from({ length: 512 }, () => ({ u: null, d: 0, dist: 0, vis: false, required: false }));
const humanNearPool = Array.from({ length: 250 }, () => ({ h: null, dist: 0 }));
const humanQuality = {};
const humanQualityValues = {};
let humanQualityBase = null, humanQualityOverride = null;
// 距離・画面判定・並べ替えだけ隔コマにする。倒れた兵と増援は軽い照合で毎コマ拾う。
const humanUnitRefs = [], humanUnitStates = [];
const humanSelection = { army: null, quality: null, count: -1, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
const humanTurn = Math.cos(Math.PI / 180);
let madeThisFrame = 0, frameT0 = 0, frameNo = 0;
const noopChange = () => {};
// 新しく作った人の材質の絵の仕組み（シェーダ）を、見せる前に作り始める（main.js が渡す。作り始めたら true）。
//   描く時に初めて作ると、その場で出来上がりを待って一コマが数十〜百 ms 固まる。作り始めてから三コマ待つ間に、描く側の裏で出来上がる
let COMPILE = null, COMPILE_ASYNC = null;
export function setHumanCompiler(f, fAsync, renderer) {
  COMPILE = f; COMPILE_ASYNC = fAsync || null;
  if (renderer && faceRenderer !== renderer) {
    faceRenderer = renderer;
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      // 描画器の復帰後、保持した写しから同じ顔を再転送する。材質の写しも同じ絵を参照する。
      for (const tex of faceTextures) tex.needsUpdate = true;
    });
  }
}
// 一コマに作る数は時間で決める（一人は必ず。重い時は次のコマへ回す）
// makeCool：重い人を作った後は、その重さの分だけ次を作るのを休む（戦の始めに重いコマが続いて固まらないよう、重さを散らす）
let makeCool = 0, creationLeft = 3;
// 近くへ大勢が来た時（must の者が軽い形のまま待っている時）は、一コマに作る数と時間を増やして早く追いつく
let rush = 0;
// ただし一人を作るのに混んだ機械では 200ms を越える事がある。一コマに作るのは多くても二人・時間の枠の内だけ（一コマが何百 ms にならないよう）。
// 急ぐ時は、作った後の休み（makeCool）を短くして、コマの数で追いつく
// rushNear：画面の中・30m の内に、まだ軽い形の兵がいる時は休みを待たずに毎コマ一人ずつ作る（目の前に軽い形を残さない）
let rushNear = 0;
const canMake = () => (makeCool <= 0 || rushNear > 0 || (rush > 0 && makeCool <= 2)) && madeThisFrame < 1;
function useHuman(u, force = false) {
  // 本物の胴丸を着るはずの人を、胴丸を読む前に作っていたら作り直す
  // 本人は、姿（look）が差し替えられた時（信長で遊ぶ時など）も作り直す。本人と名のある者は、作る数の枠に関わらず作り直す
  const keyMan = qualityKeeper(u);
  if (MEM_TIGHT && !keyMan && !u.human) borrowHuman(u);
  if ((!MEM_TIGHT || keyMan) && u.human && u.isPlayer && u.look && u.human.look !== u.look && u.human.lookSrc !== u.look && (force || keyMan)) { dropHuman(u); u.human.root.parent?.remove(u.human.root); releaseHumanBounds(u.human); u.human = null; }
  if ((!MEM_TIGHT || keyMan) && u.human && !u.human.domaru && DOMARU.ready && (wantsDomaru(u.human.look) || crowdDomaru(u.human.look)) && (force || keyMan || canMake())) {
    dropHuman(u);
    u.human.root.parent?.remove(u.human.root);
    releaseHumanBounds(u.human);
    u.human = null;
  }
  if (!u.human) {
    if (MEM_TIGHT && !keyMan && !u._humanBuild && humanPool.size + humanBuilding.size >= SKIN_MAX) return false;
    if (!force && (!canMake() || creationLeft <= 0)) return false;
    // 形がまだの兵は、このコマでは形を一段だけ作り、人にするのは次のコマ以後（一人の重さを数コマに分ける）。
    //   形が既にある姿なら段はすぐ済むので、同じコマで人にする。本人は待たせない
    if (!force && !u.isPlayer && !shapesReady(u)) {
      const p0 = performance.now();
      preStep(u, Math.max(0, creationLeft));
      creationLeft -= performance.now() - p0;
      if (!shapesReady(u) || creationLeft <= 0) { madeThisFrame++; HSTAT.splitN = (HSTAT.splitN || 0) + 1; return false; }
    }
    madeThisFrame++;
    const t0 = performance.now();
    if (force) { u._humanBuild?.return(); u._humanBuild = null; u._humanBuildLook = null; u.human = makeHuman(u, u.look || {}); }
    else {
      if (!u._humanBuild || u._humanBuildLook !== u.look) {
        u._humanBuild?.return();
        u._humanBuild = buildHuman(u, u.look || {}); u._humanBuildLook = u.look; u._humanBuildMs = 0;
      }
      let step;
      do { step = u._humanBuild.next(); } while (!step.done && performance.now() - t0 < creationLeft);
      const spent = performance.now() - t0;
      creationLeft -= spent; u._humanBuildMs += spent;
      if (!step.done) { HSTAT.splitN = (HSTAT.splitN || 0) + 1; return false; }
      u.human = step.value; u._humanBuild = null; u._humanBuildLook = null;
    }
    const took = force ? performance.now() - t0 : u._humanBuildMs;
    u._humanBuildMs = 0;
    HSTAT.makeMs += took; HSTAT.makeN++; HSTAT.makeMax = Math.max(HSTAT.makeMax, took);
    if (!force) makeCool = Math.min(20, Math.floor(took / (rush > 0 ? 30 : 12)));
    if (!u.human) return false;
    u.mesh.add(u.human.root);
    if (!force && !u.isPlayer && COMPILE) { try { if (COMPILE(u.human.root)) u.human.showAt = frameNo + 3; } catch (e) { /* 作り始められなくても、描く時に作る */ } }
  }
  const h = u.human;
  // 絵の仕組みの出来上がりを待つ間は、軽い形のまま
  if (h.showAt > frameNo && !force) { if (!humans.has(h)) h.root.visible = false; return false; }
  // 馬上の人は鞍の入れ物（u.seat）に入れる
  const par = u.mounted && u.seat ? u.seat : u.mesh;
  if (h.root.parent !== par) par.add(h.root);
  if (!h.root.visible || !humans.has(h)) {
    h.root.visible = true; h.poseHidden = false; h.skelDirty = true;
    humans.add(h); h.last.copy(u.pos); h.acc = 1;
    h.root.updateWorldMatrix(true, false);
    h.root.updateMatrixWorld(true);
  }
  if (u.body) u.body.visible = false;
  if (u.legL) { u.legL.visible = false; u.legR.visible = false; }
  carryFlag(h, true);
  syncArmorWear(u, ARMY?.hideBlood);
  return true;
}
function dropHuman(u) {
  const h = u.human;
  if (!h) return;
  if (h.root.visible || !h.hidAt) h.hidAt = performance.now();   // 隠れた時刻（evictHidden が長く隠れた順に捨てる）
  h.root.visible = false;
  humans.delete(h);
  carryFlag(h, false);
  if (h.bow0 && u.hand) { u.hand.position.set(h.bow0.x, h.bow0.y, h.bow0.z); u.hand.rotation.z = 0; h.bowUp = h.bowK = 0; h.bowMoved = false; }
  if (h.rod) h.rod.visible = false;
  cmdOff(h);
  gripReset(h);
  if (u.body) u.body.visible = true;
  if (u.legL) { u.legL.visible = true; u.legR.visible = true; }
  syncArmorWear(u, ARMY?.hideBlood);
  if (u.armorWear && u.armorWear.root.parent !== h.bones?.Spine1) unbindHumanBounds(u.armorWear.root);
  if (MEM_TIGHT && humanPool.has(h)) {
    pinHumanGeometries(h);
    releaseHumanBounds(h);
    h.root.parent?.remove(h.root);
    h.leased = false; h.u = null; u.human = null;
  }
}
function humanResourceCaches() {
  return [headMats, headTexs, headGeos, scalpGeos, hairGeos,
    bodyMats, dmMats, hatMats, nearArmorGeos, kzSplit, crestGeos, monMats,
    crowdGeos, coveredBodyGeos, bodyLoGeos, menpoGeos, menpoMats, eyeFast, EYE_FAST_MATS,
    yokeGeos, sleeveGeos, soheiCache, nearFlagMats, EYE_MH.geos, MOUTH_MH.geos];
}
// 読み込み済みの原本と、小さな共用品は残す。馬の作り置きは戦ごとに返す。
export function sharedHumanResources() {
  return [SRC, HEAD, DM, KB, YR, HR && { ...HR, pool: [], mats: null, tack: null }, MHHAND,
    CREST_GEO, CREST_MAT, MON_GEO, HAIR_MATS, EYE_MH.mat, MOUTH_MH.teethM,
    MENPO_TEX, SOHEI_HEAD, NAGINATA, SAIHAI, ROD_GEO, ROD_MAT,
    STIRRUP, TASSEL, ROPE, cordMap, redWhiteCord, ropeMats, MH_PORES, fpArmM];
}
// 戦の終わり・支度の取り消しでは、取り外す前に固有の素材も拾う。
// 人の形・材質の表（戦の片付けで空にする。gpu_gc.js はここにある形を手放さない）
export function humanCaches() {
  return [humanPool, headMats, headTexs, headGeos, scalpGeos, hairGeos,
    bodyMats, dmMats, hatMats, nearArmorGeos, kzSplit, crestGeos, monMats,
    crowdGeos, crowdShapes, coveredBodyGeos, bodyLoGeos, menpoGeos, menpoMats, eyeFast, EYE_FAST_MATS,
    yokeGeos, sleeveGeos, soheiCache, nearFlagMats, EYE_MH.geos, MOUTH_MH.geos, CREST_GEO];
}
export function disposeBattleHumans(rt, resources) {
  efudaDispose(rt.army.units);
  for (const h of humanPool) resources.add(h.root);
  for (const u of rt.army.units) {
    const h = u.human;
    if (h) {
      resources.add(h.root);
      dropHuman(u);
      h.mixer?.stopAllAction();
      h.mixer?.uncacheRoot(h.model);
      h.root.parent?.remove(h.root);
      releaseHumanBounds(h);
      u.human = null;
    }
    u._humanBuild?.return(); u._humanBuild = null; u._humanBuildLook = null; u._hq = null;
  }
  for (const h of humanPool) {
    h.mixer?.stopAllAction(); h.mixer?.uncacheRoot(h.model);
    h.root.parent?.remove(h.root);
  }
  humanPool.clear(); humanBuilding.clear();
  if (lastArmy === rt.army || ARMY === rt.army || !lastArmy) {
    for (const h of horsesOn) detachReal(h);
    horsesOn.clear(); humanWanted.clear(); horseWanted.clear();
    humanCandidates.length = humanNear.length = horseCandidates.length = 0;
    // 次の戦の組み立て前に、選び直し用の控えからも前の軍勢を外す。
    humanSelection.army = null; humanSelection.quality = null; humanSelection.count = -1;
    humanUnitRefs.length = humanUnitStates.length = 0;
    for (const c of humanCandidatePool) c.u = null;
    for (const c of humanNearPool) c.h = null;
    lastArmy = null; ARMY = null; WORLD = null; faceWarmUnits = null;
  }
  // 名前のある顔も含めて持ち越さない（保持する顔は零枚、上限十二枚以内）。
  // 形のキャッシュも参照を切り、前の戦の頂点配列を回収できるようにする。
  for (const cache of humanCaches()) {
    resources.add(cache); cache.clear();
  }
  resetCrowdSweep();
  resources.add(crowdMats); crowdMats.length = 0;
  humanGeoMaps.clear(); faceStyles.clear();
  if (HR) {
    resources.add([HR.mats, HR.tack]); HR.mats.clear(); HR.tack.clear();
    for (const horse of HR.pool) {
      resources.add([horse.holder, horse.extra]);
      horse.mixer?.stopAllAction(); horse.mixer?.uncacheRoot(horse.sc);
    }
    HR.pool.length = 0;
  }
  if (farSpScene === rt.scene) {
    for (const w of farSpHid) w.layers.enable(0);
    for (const e of farSp.values()) { e.im.parent?.remove(e.im); e.im.dispose(); }
    farSp.clear(); farSpHid.clear(); farSpNow.clear(); farSpScene = null;
  }
}
// 背の指物を背骨に付ける（走る・屈む・馬の上で揺れる体について行く）。外す時は元の所へ
// 近くで背負う指物の布：元の旗の材質（はためき・家紋）に、布の目・細かなしわの波・裾と縁の擦り切れと破れ・泥と日焼けを足す
//   元の材質ごとに一つ写して使い回す（遠くの旗は元のまま）。破れ方と汚れ方は旗ごとに違う（竿の背丈の種から）
const nearFlagMats = new Map();
function nearFlagMat(m0) {
  if (!m0 || m0.userData.nearFlag || m0.userData.faded || m0.userData.muddy) return m0;
  if (nearFlagMats.has(m0)) return nearFlagMats.get(m0);
  const m = cloneWaterMaterial(m0);
  // userData は材質の複製時に JSON 化される。元の材質への参照は外に持つ。
  Object.assign(m.userData, m0.userData, { nearFlag: true });
  m.nearFlagBase = m0;
  const ob = m0.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (ob) ob.call(m0, sh, r);
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec2 vFq;\nvarying float vFs;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFq = position.xy; vFs = fract(length(modelMatrix[1].xyz) * 97.0);
      // 布の細かなしわ：大きな波の上を、小さな波が裾へ走る
      transformed.z += sin(position.y * 38.0 + position.x * 21.0 + vFs * 40.0) * 0.004 * clamp(position.x / 0.36, 0.2, 1.0);`);
    sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec2 vFq;\nvarying float vFs;\n' + `
float nfH(vec2 p) { return fract(sin(dot(p, vec2(27.17, 61.31))) * 43758.5453); }
float nfN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(nfH(i), nfH(i + vec2(1, 0)), f.x), mix(nfH(i + vec2(0, 1)), nfH(i + vec2(1, 1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // 旗の座標：x 0（竿）〜0.36（外の端）、y -0.36（裾）〜0.36（上）
        vec2 q = vFq; float u = q.x / 0.36, v = q.y / 0.72 + 0.5;
        // 破れと擦り切れ：外の端と裾がぎざぎざに欠け、旗によっては裂け目が入る
        float fray = nfN(vec2(v * 60.0, vFs * 9.0)) * 0.05 + nfN(vec2(v * 9.0, vFs * 3.0)) * 0.05;
        float frayB = nfN(vec2(u * 55.0, vFs * 7.0)) * 0.04 + nfN(vec2(u * 7.0, vFs * 5.0)) * 0.05;
        float torn = step(0.55, vFs) * smoothstep(0.06, 0.0, abs(v - (0.3 + vFs * 0.4) - (u - 1.0) * 0.4)) * smoothstep(0.55, 0.95, u);
        if (u > 1.0 - fray * (0.4 + vFs) || v < frayB * (0.3 + vFs * 0.8) || torn > 0.5) discard;
        // 布の目（縦横の糸）と、糸のほつれた縁
        float fw = fwidth(q.x) * 900.0;
        float weave = (sin(q.x * 2800.0) * sin(q.y * 2800.0)) * (1.0 - smoothstep(0.5, 1.5, fw));
        diffuseColor.rgb *= 1.0 + weave * 0.06;
        diffuseColor.rgb *= 1.0 - smoothstep(1.0 - fray * (0.4 + vFs) - 0.03, 1.0 - fray * (0.4 + vFs), u) * 0.35;
        // 汚れ：裾から上へ泥と雨の染み、竿の側は手垢、全体に日焼けの褪せ
        float dirt = smoothstep(0.35, 0.0, v) * (0.4 + 0.6 * nfN(q * 30.0 + vFs * 10.0)) + smoothstep(0.08, 0.0, u) * 0.3;
        dirt *= 0.45 + 0.4 * vFs + 0.4 * uGrime;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.18, 0.13), clamp(dirt, 0.0, 1.0) * 0.55);
        float stain = smoothstep(0.62, 0.8, nfN(q * 14.0 + vFs * 20.0)) * (0.3 + uGrime * 0.5);
        diffuseColor.rgb *= 1.0 - stain * 0.18;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 0.95 + 0.02, 0.15 + vFs * 0.1);
        diffuseColor.rgb *= 1.0 - uWet * 0.25;
      }`);
  };
  const k0 = 'nearflag' + (m0.customProgramCacheKey ? m0.customProgramCacheKey() : String(ob || ''));
  m.customProgramCacheKey = () => k0;
  nearFlagMats.set(m0, m);
  return m;
}
function carryFlag(h, on) {
  const u = h.u, f = u.flag;
  if (!f) return;
  // 近い形への切り替えでも、落ちた指物を背へ戻さない。
  if (f.userData.groundDetached || u.iwaFlagRig || u.tennojiFlagRig) return;
  // 近くの者の指物は細かな布に、離れたら元の材質へ
  if (f.isMesh && f.material && f.material.userData && !f.material.userData.faded) {
    // 軽い体の旗は共通の材質へ戻す。同じ布と材質を Army の束で描く。
    if (on && u.alive && !h.lodFar) f.material = nearFlagMat(f.material);
    else if ((!on || h.lodFar) && f.material.nearFlagBase) f.material = f.material.nearFlagBase;
  }
  if (f.userData.baseY == null) f.userData.baseY = f.position.y - (u.mounted ? RIDE.y : 0);
  const base = f.userData.baseY;
  // 刀根坂の遠い兵は体と竿を軽い形で描く。更新を間引く骨へ布だけ残さない。
  if (on && h.lodFar && f.userData.followPole) {
    const parent = u.mounted && u.seat ? u.seat : u.mesh;
    if (f.parent !== parent) {
      parent.add(f);
      f.position.y = base + (u.mounted ? RIDE.y : 0);
      unbindHumanBounds(f);
    }
    return;
  }
  if (on) {
    if (!h.flagHolder) {
      // 旗は竿と一緒にしなる：兵は竿の骨（swPole）に、本人・武将は竿の形に付ける
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      if (h.xb && h.xb.swPole) { g.matrix.copy(restInverse('Spine2')); h.xb.swPole.add(g); }
      else if (h.parts.pole) { g.matrix.copy(SRC.fitTi); h.parts.pole.add(g); }
      else { g.matrix.copy(restInverse('Spine2')); h.bones.Spine2.add(g); }
      h.flagHolder = g;
    }
    const followPole = !!f.userData.followPole;
    if (f.parent === h.flagHolder && h.flagMounted === !!u.mounted && h.flagFollowPole === followPole) return;
    h.flagHolder.add(f);
    h.flagMounted = !!u.mounted;
    h.flagFollowPole = followPole;
    // 刀根坂では布と竿を同じ体の座標に置く。鞍の高さは親の骨から既に受ける。
    f.position.y = base + (u.mounted && !followPole ? SRC.rest.Hips.y - 0.79 : 0);
  } else if (h.flagHolder && f.parent === h.flagHolder) {
    (u.mounted && u.seat ? u.seat : u.mesh).add(f);
    f.position.y = base + (u.mounted ? RIDE.y : 0);
    unbindHumanBounds(f);
  }
}
// 隠れた人の根元：見えない間は子（骨）の行列を辿らない。見せた時は次の描画で直る
const _umw = THREE.Object3D.prototype.updateMatrixWorld;
//   このコマに骨を動かさなかった人（遠くで間引いた・画面の外・倒れ切った）で、根元の場所も前のコマと同じなら、骨と部品の行列を辿り直さない
//   （六十二本の骨と部品を一人ずつ毎コマ組み直していた。10/8 測ると、姉川で描く時間の一割五分）。動いた・骨を動かした時はいつも通り辿る
const _mwT = new THREE.Matrix4();
function skipHiddenMW(force) {
  const h = this.userData.hum;
  if (!this.visible || h?.poseHidden && h.noSh) {
    // 親から強制更新されても、描かず影も使わない子へは降りない。
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    // 体の中心が画面外でも、坂を下る兵の部品は画面に残る。
    // 根元だけを移すと、今の逆行列に古い骨が組み合わさり、皮膚が山から伸びる。
    // 指定した戦の、表示を許した移動中の人だけ直す。静止中の骨と姿勢の間引きは保つ。
    if (this.visible && WORLD?.def.movingHiddenBones &&
        (!h.mw0 || !this.matrixWorld.equals(h.mw0))) {
      _umw.call(this, true);
      (h.mw0 || (h.mw0 = new THREE.Matrix4())).copy(this.matrixWorld);
      this._humanMWPaused = false;
      return;
    }
    this.matrixWorldNeedsUpdate = true;
    this._humanMWPaused = true;
    return;
  }
  if (this._humanMWPaused) { this._humanMWPaused = false; _umw.call(this, true); return; }
  // 近い兵と倒れる途中の兵は、指と装備の骨まで同じコマに揃える。
  // 画面外で止めた人は、親からの強制更新でも同じ場所の骨を組み直さない。
  // 移動した時は下の根元の行列比較で検出し、影も今の位置へ動かす。
  if ((!h || !h.poseHidden) && (force === true || h && (!h.far || !h.u.alive && !h.still))) { _umw.call(this, true); return; }
  if (h && h.mwHold && h.mw0 && this.parent && !HUM.lodOff) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    _mwT.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    if (_mwT.equals(h.mw0)) {
      this.matrixWorldNeedsUpdate = false;
      // 止めている間も、握り（gripPose の updateWorldMatrix）で手の骨だけが新しくなる事がある。指を手に合わせ直す（手の皮が帯のように伸びないよう）
      if (!h.poseHidden && (!h.lodFar || WORLD?.def.fullTipMatrices) && h.bones) { h.bones.LeftHand?.updateMatrixWorld(true); h.bones.RightHand?.updateMatrixWorld(true); }
      return;
    }
  }
  _umw.call(this, force);
  if (h) (h.mw0 || (h.mw0 = new THREE.Matrix4())).copy(this.matrixWorld);
}
function tipMW(force) {
  const h = this.userData.h;
  // 近い人は手・頭の先（指・顔）を必ず辿り直す。IK などが getWorldPosition で手の行列だけを先に直すと「直す要あり」の印が消え、指だけ古い所に残って手の皮が帯のように伸びた
  // 切岸で手足を接地させる戦では、遠い形にも指まで皮膚の重みが残る。
  // 手首だけを直すと指が以前の場所へ残るため、既存の更新時に先までそろえる。
  // 止まった人は根元の skipHiddenMW で省き、他の戦の間引きは保つ。
  if (!h || !h.lodFar || WORLD?.def.fullTipMatrices) { _umw.call(this, true); return; }
  if (this.matrixAutoUpdate) this.updateMatrix();
  if (this.matrixWorldNeedsUpdate || force) { this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); this.matrixWorldNeedsUpdate = false; force = true; }
  // 骨でない子（顔・部品）と、頭に付けた揺れる骨（笠）は辿る
  for (const c of this.children) if (!c.isBone || c.name.startsWith('sw')) c.updateMatrixWorld(force);
}
// 毎コマ：本人・カメラの近くの兵・名のある武将を骨の入った人で描く（battle.js から）
let lastArmy = null;
const _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere(new THREE.Vector3(), 2.2);
export const HSTAT = { made: 0, driven: 0, ms: 0, want: 0, makeMs: 0, makeN: 0, makeMax: 0, selectionFrames: 0, selectionScans: 0, borrowN: 0, crowdHit: 0, crowdMade: 0, shapeMade: 0 };
// 遠い兵（lodFar）の槍は、一本ずつでなく同じ形ごとに一つの InstancedMesh でまとめて描く（描く回数を槍の数から形の数へ）。
//   元の槍の描き物は layers で画面から外すだけ（visible・材質は他の所が使うので触らない）。近くの兵・指物・馬は今まで通り
const farSp = new Map(), farSpHid = new Set(), farSpNow = new Set();
let farSpScene = null;function farSpears(rt) {
  const scene = rt.scene || (rt.world && rt.world.scene);
  if (!scene) return;
  if (farSpScene !== scene) { for (const e of farSp.values()) { if (e.im.parent) e.im.parent.remove(e.im); e.im.dispose(); } farSp.clear(); farSpHid.clear(); farSpScene = scene; }
  for (const e of farSp.values()) e.n = 0;
  farSpNow.clear();
  const nearRadius = rt.def.nearSpearBatchRadius || 0, camera = rt.camera?.position;
  // どちらの指定でも、場面の行列が揃った後に兵の束で体と一緒に描く。
  // 近い味方を隠す処理にも従い、描く時の骨と逆行列を揃える。
  // 更新中の別の束へも写すと、手元を離れた槍が二重に残る。
  const drawWithArmy = !!(rt.world?.def.attachedFarSpears || rt.world?.def.drawTimeUnitParts);
  for (const h of humans) {
    if (drawWithArmy) break;
    const u = h.u, w = u && u.wpn;
    if (!h.lodFar || !w || !w.isMesh || w.userData.kind !== 'spear' || u.isPlayer || !w.visible || !w.parent || !h.root.visible || w.userData.flex?.on || w.userData.bow || w.userData.ram || !w.material || w.material.transparent) continue;
    // 指定した戦だけ、近い槍は元の網で描く。描く直前に持ち主や槍を避けた時も、
    // 別の束に写した柄だけが残らない。遠い列のまとめ描きと共有する形・材質は保つ。
    if (nearRadius && camera && (u.pos.x - camera.x) ** 2 + (u.pos.z - camera.z) ** 2 < nearRadius * nearRadius) continue;
    const key = w.geometry.uuid + '|' + w.material.uuid;
    let e = farSp.get(key);
    if (!e) {
      const im = new THREE.InstancedMesh(w.geometry, w.material, 96);
      im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0;
      scene.add(im);
      e = { im, n: 0 }; farSp.set(key, e);
    }
    if (e.n >= e.im.instanceMatrix.count) continue;
    w.updateWorldMatrix(true, false);
    e.im.setMatrixAt(e.n++, w.matrixWorld);
    farSpNow.add(w);
    if (!farSpHid.has(w)) { farSpHid.add(w); w.layers.disable(0); }
  }
  for (const w of farSpHid) if (!farSpNow.has(w)) { w.layers.enable(0); farSpHid.delete(w); }
  for (const e of farSp.values()) { e.im.count = e.n; e.im.instanceMatrix.needsUpdate = true; e.im.visible = e.n > 0; }
}
export function updateHumans(rt, dt) {
  madeThisFrame = 0; madeFaces = 0; frameT0 = performance.now(); frameNo++; if (makeCool > 0) makeCool--;
  sweepCrowdGeos(frameT0);
  // 支度の後も必要な人は、一コマ一人ずつ作る。開戦直後も作成量を増やさない。
  HUM.budget = 4;
  WORLD = rt.world; ARMY = rt.army;
  const player = rt.player && rt.player.u;
  if (player) { ARMY_REAL_P.value.set(player.pos.x, player.pos.z); ARMY_REAL_R.value = realNear(); }
  // 前の描画で作成待ちになった兵は、出来るまで既存の軽い姿へ戻す。
  for (const u of rt.army.units) if (u.humanPending && u.mesh) { u.mesh.visible = !u.gone && !u.camHidden && !u.imp; u.humanPending = false; }
  // 軽い兵を押し出す輪の中心（カメラの場所）
  if (rt.camera) ARMY_P.value.set(rt.camera.position.x, rt.camera.position.z);
  // 布をはためかせる風（突風の強さで、止んだ時も少しは揺れる）
  GRIME.value = Math.min(1, Math.max(0, (rt.t || 0) / 360));
  CLOTH_W.value.set(WIND_STATE.dirX, WIND_STATE.dirZ, Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1)), WIND_STATE.t || 0);
  const army = rt.army, cam = rt.camera;
  // 戦が替わったら、前の戦の人と馬を忘れる
  if (army !== lastArmy) {
    faceWarmUnits = COARSE && cam ? new Set(preparationUnits(rt, cam).slice(0, 24)) : null;
    for (const h of humans) dropHuman(h.u);
    for (const h of horsesOn) detachReal(h);
    horsesOn.clear(); humanWanted.clear(); humanCandidates.length = humanNear.length = 0;
    horseWanted.clear(); horseCandidates.length = 0; lastArmy = army; makeCool = 0;
    humanSelection.army = null; humanUnitRefs.length = humanUnitStates.length = 0;
    for (const c of humanCandidatePool) c.u = null;
    for (const c of humanNearPool) c.h = null;
  }
  if (dt > 0) {
    faceWarmUnits = null;
    rt.humanPreparationCap = Infinity;
  }
  creationLeft = 3;
  if (Number.isFinite(rt.humanPreparationCap)) {
    let prepared = 0;
    for (const u of army.units) if (u.human) prepared++;
    if (prepared >= rt.humanPreparationCap) creationLeft = 0;
  }
  const horses = updateHorses(rt);
  try {
    efudaFrameStart(); humansStep(rt, dt, army, cam); farSpears(rt);
    efudaUpdate(rt.scene, rt.world, army.units, army.time);
    // 戦の途中も、人を作らず新しい顔も描かないコマに、もうすぐ人になる兵（援軍・寄せ手）の形を一段ずつ前もって作る
    //   一人を作るコマに部品の形づくりと束ね（4倍遅くで 10〜20ms）が重ならない。一コマに一段だけ。近い者が済めば何もしない
    if (creationLeft > 0 && madeThisFrame === 0 && madeFaces === 0 && cam && HUM.primed && (preTick = (preTick + 1) & 1) === 0)
      prefetchLook(army.units, cam.position.x, cam.position.z, memTight() ? SKIN_OUT + 10 : HUM_Q.high.near + 14);   // iPhone は絵札の境の少し外まで（その先の兵は人にしない）
  } finally {
    if (player) for (const u of army.units) {
      if (u.gone || !u.mesh || u.type === 'dummy' || (u.human && u.human.root.visible)) continue;
      if (Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z) <= realNear() ||
          (cam && Math.hypot(u.pos.x - cam.position.x, u.pos.z - cam.position.z) <= realNear())) {
        // 骨のある姿がまだ用意できない時は、既存の軽い姿を残す。
        // 近いという理由だけで消すと、姿のない兵が槍を打ち込む。
        u.mesh.visible = !u.camHidden && !u.imp; u.humanPending = false;
      }
    }
    // 鐙・手綱は乗り手の骨が動いた後で置く
    for (const [h, u] of horses) if (h.userData.horse.real && h.userData.horse.real.on) placeHorseExtras(h, u);
  }
  if (player && ++evictTick % 60 === 0) evictHidden(army, player);
  HSTAT.ms = performance.now() - frameT0;
}
// 隠れた本物の人（骨入り）は兵ごとに持ち続けるので、戦が進むほど増える（桶狭間で2分に92→108、見えるのは18）。
// 携帯は中身が重さで落ちるので、見えない人を遠い順に捨てる（骨の絵も返す）。近づけば作り直す（10/19）
let evictTick = 0;
const COARSE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
function evictHidden(army, player) {
  if (MEM_TIGHT) return;   // 携帯は捨てずに貸出待ちへ返す。
  const cap = memTight() ? ((window.__apx && window.__apx.evict) || 8) : COARSE ? 36 : 90;   // x_evictN：実機で隠れた人の枠を試す
  const hid = [];
  for (const u of army.units) if (u.human && !u.human.root.visible && !u.isPlayer && !(u.look && isNamed(u.look))) hid.push(u);
  // iPhone：隠れてすぐの人は捨てない（森部で捨てた人の 6 割が 10 秒の内に作り直され、作り直しのごみが WebContent を押していた。10/21）。
  //   長く隠れた順に捨て、隠れた人は合わせて 16 人まで。ほかは遠い順
  const tight = memTight(), now = performance.now(), keepMs = 12000, hardCap = (window.__apx && window.__apx.hid) || 16;   // x_hidN：実機で隠れた人の枠を試す
  let dropN = 0;
  if (tight) {
    hid.sort((a, b) => (a.human.hidAt || 0) - (b.human.hidAt || 0));   // 長く隠れた順
    while (dropN < hid.length && (hid.length - dropN > hardCap || now - (hid[dropN].human.hidAt || 0) > keepMs)) dropN++;
  } else if (hid.length > cap) {
    const d2 = (u) => (u.pos.x - player.pos.x) ** 2 + (u.pos.z - player.pos.z) ** 2;
    hid.sort((a, b) => d2(b) - d2(a));
    dropN = hid.length - cap;
  }
  if (!dropN) return;
  // 捨てる人だけが持つ形・材質・絵（表情の材質・目と口の形・顔の絵など）は GPU から返す。ほかの人や場面がまだ使う物（共有の頭・胴丸・旗の絵）は残す。
  //   評価：geometries が 2 分で 630→830 と増え続けた（10/19 測る）。捨てた人の固有の形を返さないと、戦の間ずっと GPU に残る
  const drop = new Set();
  for (let i = 0; i < dropN; i++) drop.add(hid[i]);
  // 場面に残したまま走査すると、捨てる本人の素材まで「使用中」になる。
  // 指物を戻し、全員の根を外してから、残す素材を集める。
  for (const u of drop) {
    const h = u.human;
    dropHuman(u);
    h.mixer?.stopAllAction(); h.mixer?.uncacheRoot(h.model);
    h.root.parent?.remove(h.root);
  }
  // 今は誰も着ていない共有の原本・作り置きも、次に使えるよう残す。
  const resources = battleResources([sharedHumanResources(), humanResourceCaches(), crowdMats, WORLD?.scene,
    army.units.filter(u => u.human && !drop.has(u)).map(u => u.human.root)]);
  for (const u of drop) {
    resources.add(u.human.root);
    releaseHumanBounds(u.human);
    u.human = null;
  }
  resources.dispose();
}
function humansStep(rt, dt, army, cam) {
  const on = HUM.on && HUM.ready && HUM.primed;
  if (!on) { humanSelection.army = null; humanUnitRefs.length = humanUnitStates.length = 0; for (const h of humans) dropHuman(h.u); if (HUM.on && !loading) loadHumans(); return; }
  // 画質と戦ごとの人数制限は遠景用。近景の骨・甲冑・顔は保ち、影と動きの更新を間引く。
  const QBase = HUM_Q.high;
  // 画質ごとの細かさ（lod：軽い一体の形へ替わる遠さ・hiN：細かい胴丸と兜の数・faceN：実写の顔の数）。低は元のまま
  { const t = HUM_T.high; HUM.lod = t.lod; HUM.hiN = t.hiN; HUM.faceN = t.faceN; HUM.shadow = t.shadow; DOMARU.hiCap = t.hiCap; }
  //   humQ は下げるだけ（画質「低」の max 4 を姉川の 56 で上書きして、携帯で 60 人近くが骨の入った人になっていた。10/2 測って直す）
  let Q = QBase;
  if (rt.def && rt.def.humQ) {
    const override = rt.def.humQ;
    let changed = humanQualityBase !== QBase || humanQualityOverride !== override;
    for (const k in QBase) if (humanQualityValues[k] !== override[k]) changed = true;
    if (changed) {
      for (const k in humanQuality) delete humanQuality[k];
      Object.assign(humanQuality, QBase);
      for (const k in QBase) { humanQualityValues[k] = override[k]; if (k in override) humanQuality[k] = Math.min(QBase[k], override[k]); }
      humanQualityBase = QBase; humanQualityOverride = override;
    }
    Q = humanQuality;
  }
  const cx = cam.position.x, cz = cam.position.z;
  const detailNear = MEM_TIGHT ? SKIN_OUT : false ? 14 : true ? rt.world.def.highHumanDetail ?? 15 : rt.world.def.lowHumanDetail ?? Infinity;
  // 高の戦別指定は、甲冑を一体にまとめる距離にもそろえる。人数・骨・攻撃は元のまま。
  const player = rt.player && rt.player.u;
  const want = humanWanted, pick = humanSelection, cp = cam.position, cq = cam.quaternion;
  let changed = pick.army !== army || pick.quality !== S.quality || pick.count !== army.units.length;
  // 生死・退場だけを照合する。距離と画面の判定は下の選び直しにまとめる。
  for (let i = 0; i < army.units.length; i++) {
    const u = army.units[i], state = (u.alive ? 1 : 0) | (u.gone ? 2 : 0) | (u.dying ? 4 : 0);
    if (humanUnitRefs[i] !== u || humanUnitStates[i] !== state) changed = true;
    humanUnitRefs[i] = u; humanUnitStates[i] = state;
  }
  humanUnitRefs.length = humanUnitStates.length = army.units.length;
  const moved = (cp.x - pick.x) ** 2 + (cp.y - pick.y) ** 2 + (cp.z - pick.z) ** 2 >= 1 ||
    Math.abs(cq.x * pick.qx + cq.y * pick.qy + cq.z * pick.qz + cq.w * pick.qw) <= humanTurn ||
    pick.fov !== cam.fov || pick.aspect !== cam.aspect || pick.zoom !== cam.zoom || pick.lowMem !== S.lowMem;
  HSTAT.selectionFrames++;
  // 候補の選び直しだけ二コマに一度。選んだ兵の骨は従来どおり動かし、視点・生死の変更は即座に反映する。
  if ((frameNo & 1) === 0 || changed || moved || dt === 0) {
    HSTAT.selectionScans++;
    pick.army = army; pick.quality = S.quality; pick.count = army.units.length; pick.lowMem = S.lowMem;
    pick.x = cp.x; pick.y = cp.y; pick.z = cp.z;
    pick.qx = cq.x; pick.qy = cq.y; pick.qz = cq.z; pick.qw = cq.w;
    pick.fov = cam.fov; pick.aspect = cam.aspect; pick.zoom = cam.zoom;
    cam.updateMatrixWorld();
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pv);
    const cand = humanCandidates; cand.length = 0;
    for (const u of army.units) {
      if (u.gone || !u.mesh || u.type === 'dummy') continue;
      const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
      const pd = player ? Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z) : d;
      const required = u.isPlayer || qualityKeeper(u) && d < Math.max(60, Q.far ?? HUM.far) || (MEM_TIGHT
        ? d <= (u.human && humans.has(u.human) ? SKIN_OUT : SKIN_IN)
        : Math.min(d, pd) <= realNear());
      const named = u.name || u.isSub || u.look && (isNamed(u.look) || u.type === 'busho');   // 武将（名の無い侍大将も）
      // 遠景の一般兵は既存の一括描画へ返す。騎馬と武将の姿は残す。
      if (u.alive && u.qualityTier === 2 && !named && !u.mounted && !u.isStandard && !u.perch && !u.naka && !u.climb) continue;
      // 六十メートルの外だけ、画質に応じた範囲で武将を残す。
      const lim = u.isPlayer ? 1e9 : named ? (Math.max(60, Q.far ?? HUM.far)) : Q.near;
      if (!required && d >= lim) continue;
      if (!dmLoading && (wantsDomaru(u.look) || crowdDomaru(u.look))) loadDomaru(); if (!kbLoading && wantsDomaru(u.look)) loadKabuto();
      // 倒れた者：カメラの近く（HUM.dead より手前）は人にする（寝た体が棒や丸太に見えないよう）。その先は、もう人になっている者だけ（倒れてしばらく）
      if (!required && !u.alive && d >= HUM.dead && !(u.human && humans.has(u.human) && (u.human.deadAge || 0) < 40)) continue;
      _sph.center.set(u.pos.x, u.pos.y + 1.2, u.pos.z);
      const vis = u.isPlayer || _fr.intersectsSphere(_sph);
      // 画面の中を先に。今もう人の者は少し優先（境目で入れ替わりが続かないように）
      // 画面の真ん中に近い者ほど先に（大軍に近づいた時、目の前の最前列から本物に替わる）。横の端の者は後回し
      let cen = 0;
      if (vis && !u.isPlayer) { v0.set(u.pos.x, u.pos.y + 1.2, u.pos.z).applyMatrix4(_pv); cen = Math.min(1.5, Math.abs(v0.x) + Math.abs(v0.y) * 0.5); }
      let pr = u.isPlayer ? -1e9 : d * (1 + 0.7 * cen) + (u.alive ? 0 : 12) + (vis ? 0 : 30);
      if (u.human && humans.has(u.human)) pr *= u.alive ? 0.9 : 0.6;   // 倒れた人は、人と軽い形を行き来させない
      if (!u.alive && u.human && humans.has(u.human) && vis && d < Math.min(HUM.dead, Q.near)) {
        if (u.human.deathSeenAt === undefined) u.human.deathSeenAt = army.time;
        if (army.time - u.human.deathSeenAt < 4) pr = -0.25 + d * 0.001;
      }
      // 作る順は本人と目の前の兵を先に取る。
      if (false && named && !u.isPlayer && u.alive) pr = d * (1 + 0.7 * cen) + (vis ? 0 : 30);
      if (required && !u.isPlayer) pr -= u.alive ? 1e6 : 5e5;
      let entry;
      if (cand.length < humanCandidatePool.length) { entry = humanCandidatePool[cand.length]; cand.push(entry); }
      else {
        let worst = 0; for (let i = 1; i < cand.length; i++) if (cand[i].d > cand[worst].d) worst = i;
        if (pr >= cand[worst].d) continue;
        entry = cand[worst];
      }
      entry.u = u; entry.d = pr; entry.dist = d; entry.vis = vis; entry.required = required;
    }
    cand.sort((a, b) => a.d - b.d);
    want.clear();
    // 遠い人を先に戻して近景へ枠を渡す。亡骸も含め、本物の描画は250人まで。
    //   iPhone（WebContent の上限 2GB）は骨入りの人を 84 人まで（一人 3〜4MB。乱戦で 30m の内の全員が人になり 140 人を越えて落ちていた。10/19）。
    //   兵そのものは束の形で全員描くので、見える兵の数と密度は変わらない。近い者・画面の真ん中の者から人にする
    const capAll = MEM_TIGHT ? SKIN_MAX : memTight() ? 64 : 250;   // 10/19 深夜：84 では墨俣・森部で GPU process が 620MB を越えて落ちた（一人 約 2.8MB）。64 に
    let crowdN = 0;
    for (const c of cand) {
      if (want.size >= 250) break;
      if (qualityKeeper(c.u)) { want.set(c.u, c); continue; }
      if (crowdN >= capAll) continue;
      if (MEM_TIGHT ? c.required : c.required || crowdN < Q.max) { want.set(c.u, c); crowdN++; }
    }
    // 作る順（本人と目の前を優先）は保ち、材質だけは距離順の上限を付ける。
    // 候補の入れ物を再利用するので毎コマ配列や材質を作らない。
    cand.sort((a, b) => a.dist - b.dist);
    let surfaceN = 0;
    for (const c of cand) {
      c.surfaceDetail = !qualityKeeper(c.u) && c.vis && c.dist < CROWD_DETAIL_NEAR && want.has(c.u) && (c.dist <= 15 || surfaceN < CROWD_DETAIL_MAX);
      if (c.surfaceDetail) surfaceN++;
    }
    HSTAT.surfaceDetail = surfaceN;
  }
  rush = 0; rushNear = 0; for (const [u, c] of want) if (!u.human && c.required) { rush++; if (c.vis && c.dist < 30) rushNear++; }
  if (MEM_TIGHT) {
    for (const u of army.units) if (u.human && (!want.has(u) || u.gone)) dropHuman(u);
  } else for (const h of humans) if (!want.has(h.u) || h.u.gone) dropHuman(h.u);
  if (EFUDA.keys.size) for (const u of army.units) if (u.efuda && (u.gone || (!MEM_TIGHT && !want.has(u)))) efudaSet(u, null);   // 選びから外れた絵札の兵は元の部品へ
  if (MEM_TIGHT) for (const u of army.units) {
    const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
    if (!want.has(u) && u.poolFar && efudaWants(u, d)) {
      const K = efudaKeyState(u);
      if (K && !K.baked && !u.human && u.alive && !u.dying && faceRenderer) efudaBakeLight(faceRenderer, rt.scene, rt.world, cam.position, u, K);
      if (K?.ready) efudaSet(u, K);
    } else if (u.efuda) efudaSet(u, null);
  }
  if (MEM_TIGHT) for (const u of army.units) if (u._humanBuild && !want.has(u)) {
    useHuman(u);
    if (u.human) dropHuman(u);
    break;
  }
  // 胴丸・兜の細かい形（hi）を同時に出す数に上限を付ける：カメラに近い順に DOMARU.hiCap 人まで。名のある武将と本人は数えず必ず hi
  {
    const near = humanNear; near.length = 0;
    // 元からある距離順の並べ替えで、足を合わせる近い十八人も決める。
    for (const [u, c] of want) { const h = u.human; if (h) { h.groundFeet = false; const item = humanNearPool[near.length]; if (item) { item.h = h; item.dist = c.dist; near.push(item); } } }
    near.sort((a, b) => a.dist - b.dist);
    let feet = 0, armor = 0, ashigaruArmor = 0;
    for (let i = 0; i < near.length; i++) {
      const h = near[i].h, u = h.u;
      if (u.alive && !u.dying && !u.mounted && !u.isPlayer && near[i].dist < HUM.ik) h.groundFeet = feet++ < 18;
      if (u.isPlayer || u.look && (isNamed(u.look) || u.type === 'busho') || !(h.parts.domaru || h.parts.kabuto)) continue;
      // 足軽は最も近い八人まで中の段。その外は軽い段。侍の細かい形の枠は使わない。
      if (h.loanedDomaru) {
        h.parts.domaru.userData.midOK = near[i].dist < DOMARU.near && ashigaruArmor++ < DOMARU.ashigaruMidCap;
        continue;
      }
      // 十五メートル以内は人数で粗くしない。骨入りの総枠と影の軽い形は保つ。
      const allow = near[i].dist <= 15 || armor++ < DOMARU.hiCap;
      if (h.parts.domaru) h.parts.domaru.userData.hiOK = allow;
      if (h.parts.kabuto) h.parts.kabuto.userData.hiOK = allow;
    }
  }
  // 遠景の細かな形と実写の顔は近い順に数を抑える。六十メートル以内の骨の入った体は外さない。
  {
    const near = humanNear; near.length = 0;
    // 顔と小札の枠を背後の兵で使い切らず、画面にいる近い兵へ回す。人数の上限は同じ。
    for (const [u, c] of want) { const h = u.human; if (h && !u.isPlayer && !(u.look && (isNamed(u.look) || u.type === 'busho'))) { const item = humanNearPool[near.length]; if (item) { item.h = h; item.dist = c.dist * (h.lodFar ? 1.15 : 1) * (c.vis ? 1 : 3); near.push(item); } } }
    near.sort((a, b) => a.dist - b.dist);   // 今もう軽い形の人は少し遠く見る（境目で形が行き来しないよう）
    for (let i = 0; i < near.length; i++) { const h = near[i].h; const close = want.get(h.u).dist <= 15; h.hiOK = close || i < HUM.hiN; h.faceOK = close || i < HUM.faceN; }
  }
  HSTAT.want = want.size; HSTAT.driven = 0;
  for (const h of humans) h.mwHold = !h.u.isPlayer;   // 骨を動かした人だけ、下で外す（skipHiddenMW）。h.hold は構えの癖（armsPose）なので別の名前にする（同じ名前だと、構えの癖が入った人は骨の行列が止まり、手と指だけ古い所に残って皮が帯のように伸びた）
  // iPhone の記憶の予算：骨入りの人は BONE_CAP 人まで（近い・大事な順）。越えた兵は絵札（絵がまだ無ければ軽い姿）で描き、兵の数と密度は変えない（10/21）
  const boneCap = memTight() ? ((window.__apx && window.__apx.bones) || 40) : Infinity;
  let liveN = 0, liveSeen = 0, newN = 0, bakeSpare = 2;
  if (boneCap < Infinity) for (const [u] of want) if (u.human && humans.has(u.human) && !u.isPlayer && !u.name && !u.isSub && !(u.look && (isNamed(u.look) || u.type === 'busho'))) liveN++;
  for (const [u, c] of want) {
    const named = u.name || u.isSub || u.look && (isNamed(u.look) || u.type === 'busho');
    // 今もう人の兵は、大事な順で枠を 6 人越えるまで残す。新しく人にするのは、今の人の数が枠より少ない時だけ
    //   （境で人と絵札を行き来させない。作り直しのごみが記憶を押していた。10/21）
    const isLive = !!(u.human && humans.has(u.human));
    const over = !u.isPlayer && !named && (isLive ? liveSeen++ >= boneCap + 6 : liveN + newN >= boneCap);
    // 絵札（efuda.js）：カメラから EFUDA.far より遠い兵は、骨入りの人でなく前もって焼いた板で描く。絵がまだ無い姿は、その人から一度だけ焼く（一コマに一人）
    let needBake = false;
    if (!u.isPlayer && !named && efudaWants(u, c.dist, over)) {
      const K = efudaKeyState(u);
      if (K) {
        needBake = !K.baked;
        const live = u.human && humans.has(u.human);
        if (K.ready) { if (live) dropHuman(u); efudaSet(u, K); continue; }
        if (live && !K.baked && u.alive && !u.dying && u.human.showAt <= frameNo && faceRenderer) efudaBake(faceRenderer, rt.scene, rt.world, cam.position, u.human, K, efudaPose);
      }
    } else if (u.efuda) efudaSet(u, null);
    // 枠の外：骨入りの人は作らない（隠した人は evictHidden が返す）。まだ絵の無い姿だけ、焼くために一コマ二人まで人にする
    if (over && !(needBake && bakeSpare-- > 0)) { if (u.human && humans.has(u.human)) dropHuman(u); continue; }
    if (!useHuman(u, u.isPlayer)) continue;
    if (!u.isPlayer && !named && !isLive) newN++;   // 名のある武将は先に作る（並びの先頭）が、一コマの枠は守る（何人も一度に作って止まらないよう）
    const h = u.human;
    if (MEM_TIGHT && !qualityKeeper(u) && efudaKeyOf(u) && u.alive && !u.dying && !(h.showAt > frameNo) && faceRenderer) {
      const K = efudaKeyState(u);
      if (K && !K.baked) efudaBake(faceRenderer, rt.scene, rt.world, cam.position, h, K, efudaPose);
    }
    if (h.facePending && !h.xb && HEAD) {
      const p = h.facePending;
      h.parts.face = scanFace(h, p.key, p.L, p.F, p.full);
      if (h.parts.face && p.L.menpoScan) {
        if (h.parts.kabuto && KB.menpo) dressMenpo(h);
        else scanMenpo(h.parts.face, p.key, p.L.menpoScan);
      }
    }
    // 遠い人は軽い形（本人・名のある武将は替えない）。境目で行き来しないよう 1m の幅を持たせる
    if (h.geoFar && !qualityKeeper(u) && !named) setFar(h, c.dist > 15 && (u.qualityTier != null ? u.qualityTier > 0 : c.dist > detailNear - (h.lodFar ? 1 : 0) && c.dist > Math.min(HUM.lod, detailNear)));
    if (!qualityKeeper(u)) {
      const detailed = c.surfaceDetail && !h.lodFar;
      if (h.parts.armor) h.parts.armor.material = detailed ? nearCrowdMat(Math.floor(((h.seed || 0) * 11.3) % 1 * 4)) : UNIT_MAT;
      const helmet = h.parts.kabuto;
      if (helmet && helmet.userData.surfaceBase) helmet.material = detailed ? helmet.userData.surfaceFine : helmet.userData.surfaceBase;
      const armor = h.parts.domaru;
      if (armor && armor.userData.surfaceBase) armor.material = detailed ? armor.userData.surfaceFine : armor.userData.surfaceBase;
    }
    if (!u.alive) h.deadAge = (h.deadAge || 0) + dt; else h.still = false;
    if (u.death?.aid) h.still = false;
    // 影は主枝の共通枠を保ち、遠景へ移った兵は骨の更新待ちでも直ちに外す。
    const noSh = u.qualityTier === 2 || !u.shOn;
    if (h.noSh !== noSh) {
      h.noSh = noSh;
      h.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.cs0 === undefined) o.userData.cs0 = (o.userData.unitCastShadow ?? o.castShadow) && !o.userData.teeth; o.castShadow = !noSh && o.userData.cs0; });
      if (!noSh) h.root.updateMatrixWorld(true);
    }
    h.acc += dt;
    // 画面の外の人は動きを省く（ただし作ってまだ一度も動かしていない人は一度だけ動かす：見回した時・写真モードで T の字の立ち姿が見えないよう）
    const poseWasHidden = h.poseHidden;
    h.poseHidden = !c.vis && h.drove;
    if (poseWasHidden && !h.poseHidden) h.root.updateMatrixWorld(true);
    if (h.poseHidden) { h.animEvery = -1; continue; }
    // 近い人の握りは毎コマ。外は骨を動かす時だけ、経過分を渡す。
    const d = c.dist, nearPose = named || u.isPlayer || d <= 15 || (u.qualityTier != null ? u.qualityTier === 0 : d < HUM.fine);
    if (nearPose) gripPose(h, dt);
    // 倒れ切った人は動かさない（最後の姿勢のまま固める。人に作り直した時は、倒れ切った姿勢で一度だけ動かす）
    if ((!u.alive || u.dying) && h.still) continue;
    // 本流の距離別の時計を保ち、携帯の中景・遠景だけ番号でコマを分散する。パソコンは毎コマ。
    // 近景・武将・斬り合い・倒れる途中は待たせない。経過分は h.acc に残す。
    const protectedPose = nearPose || combatThinking(u, Infinity);
    if (MEM_TIGHT && !protectedPose && u.alive && !u.dying && h.drove &&
        !thinkingPhase(u, d, army.frameNo) && !window.__apx?.nogate) continue;
    const every = !MEM_TIGHT || nearPose || !u.alive || u.dying || u.mounted && u.charging && u.qualityTier !== 2 ||
      protectedPose ? 0 : u.qualityTier === 2 ? 0.6 : 1 / 12;
    if (every > 0) {
      // 同時に動き始めた兵の骨を同じコマでまとめて進めない（どの画質でも。揃うと一コマに何十人分の骨が重なる）。
      // 決めた回数を保ち、兵の番号で更新の時刻だけをずらす。
      // 経過時間は h.acc に残すので、歩みや斬り合いの時計は失わない。
      const phase = (Math.imul(u.id, 2654435761) >>> 0) / 4294967296;
      const slot = Math.floor(army.time / every + phase);
      if (h.drove && h.animEvery === every && h.animSlot === slot) continue;
      h.animEvery = every; h.animSlot = slot;
    } else {
      h.animEvery = 0;
      if (h.acc < every) continue;
    }
    // 骨は一度だけ進める。ばねの刻みは sway 側で抑え、歩みと動作の時計は経過分を全て使う。
    const step = h.acc; h.acc = 0;
    if (!nearPose) gripPose(h, step);
    // 馬上の人：兵の根元と鞍の入れ物の行列を今のコマに合わせてから動かす
    if (u.mounted && u.seat) { u.mesh.updateMatrix(); u.mesh.updateWorldMatrix(false, false); u.seat.updateWorldMatrix(false, false); }
    // 倒れた者も近くは実写の顔のまま（亡骸の顔が人形の顔に戻らないよう）
    //   携帯も十四メートルまで実写の顔（六メートルでは騎馬武者の顔が描いた目の人形の顔に見えた。10/7 kaito）。
    if (h.xb) crowdFace(h, d < (Q.face ?? HUM.face) && !h.lodFar && h.faceOK !== false);
    h.far = !u.isPlayer && !named && d > HUM.lite;
    h.near = nearPose;
    h.mwHold = false;
    driveHuman(h, step, nearPose, nearPose);
    h.drove = true;
    HSTAT.driven++;
    // 倒れる動き（units.js の animDeath）が終わっていれば、ここで固める
    if (!u.alive && (u.death ? u.death.t >= DEATH_END && !u.death.aid : (u.deadT || 0) >= 1)) h.still = true;
  }
  if (MEM_TIGHT) {
    let middleN = 0;
    for (const u of army.units) u.poolFar = !qualityKeeper(u);
    // 貸出を待つ近い兵も中景の枠へ入れる。骨の枠が空くまで全身を残す。
    for (const c of humanCandidates) {
      const u = c.u;
      if (u.human && humans.has(u.human)) u.poolFar = false;
      else if (middleN < MIDDLE_MAX) { u.poolFar = false; middleN++; }
      if (!u.poolFar && u.efuda) efudaSet(u, null);
    }
  }
  HSTAT.made += madeThisFrame;
}
// 見本の画面（tools/inspect.js）から：一人を人にして、一コマ動かす
export function showHuman(u) { madeThisFrame = -99; madeFaces = 0; const ok = useHuman(u, true); if (ok) { u.human.skelDirty = true; if (u.human.xb) crowdFace(u.human, true); } return ok; }
// 支度は開戦時に近い兵だけ。遠い姿は近づく時に従来の小分けの作成でそろえる。
// 実体の人数・近景へ替える距離・画質は変えない。
function preparationUnits(rt, camera) {
  const p = rt.player?.u?.pos || camera.position, c = camera.position;
  const distance = u => Math.min((u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2,
    (u.pos.x - c.x) ** 2 + (u.pos.z - c.z) ** 2);
  return rt.army.units.filter(u => !u.gone && u.mesh && u.look && u.type !== 'dummy' &&
    (u.isPlayer || distance(u) <= (realNear() + 8) ** 2))
    .sort((a, b) => Number(!!b.isPlayer) - Number(!!a.isPlayer) || distance(a) - distance(b));
}
// 読み込みの札を見せている間に、この戦で出る「見た目」を一人ずつ先に作って、絵の下ごしらえ（compileAsync）に含める
//   → 戦が始まって近くで本物の人に替わる時（updateHumans/useHuman）、同じ見た目の材質はもう作ってあるので、シェーダ作りの重いコマが立たない
//   姿（look）の組み合わせごとに一人だけ作る（具足の色・兜・母衣・面頬・本物の胴丸・僧兵・家紋）。次のコマで見えなければ自分で軽い形へ戻る（humansStep）
// この戦に出る見た目（姿の組み合わせ）を、重ならないよう一人ずつ選ぶ（最大 cap 人）
function pickLooks(units, cap) {
  const seen = new Set(), picked = [];
  for (const u of units) {
    if (picked.length >= cap) break;
    if (u.gone || !u.mesh || u.type === 'dummy' || !u.look || u.human) continue;
    const L = u.look;
    const sig = u.type + '|' + JSON.stringify(L);
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(u);
  }
  return picked;
}
function warmOne(u) {
  try {
    if (showHuman(u)) {
      // 見た目（材質）だけ先に作る：今の軽い形の見え方は変えない（作ってすぐ隠す。近ければ humansStep が改めて本物の人にする）
      u.human.root.visible = false;
      if (u.body) u.body.visible = true;
      if (u.legL) { u.legL.visible = true; u.legR.visible = true; }
      return true;
    }
  } catch (e) { /* 一人だけ失敗しても続ける */ }
  return false;
}
// 読み込みの札を見せている間に、この戦で出る見た目を一人ずつ先に作って compileAsync に含める（隊が実体化する時のシェーダ作りが重くならないよう）
//   一度に全部は作らない（重ならない姿だけを選んでも、混んだ機械では一つの compileAsync が長く掛かる事がある。少しずつに分けて、間に描ける所は描かせる）
export function warmLooks(units, cap = 46) {
  if (!HUM.on || !HUM.ready) return 0;
  let made = 0;
  for (const u of pickLooks(units, cap)) if (warmOne(u)) made++;
  return made;
}
// 支度では指定した総数まで用意し、残りは開戦後に一人ずつ作る。
export async function primeHumans(rt, renderer, camera, cap = Infinity, chunk = 1, current = () => true) {
  if (rt.humansPrimed || !HUM.on || !HUM.ready || !current()) return 0;
  if (MEM_TIGHT) cap = Math.min(cap, SKIN_MAX);
  let prepared = 0;
  for (const u of rt.army.units) if (u.human) prepared++;
  const picked = pickLooks(preparationUnits(rt, camera), Math.max(0, cap - prepared));
  let made = 0;
  for (const u of picked) {
    if (!current()) return made;
    while (!shapesReady(u) && current()) {
      preStep(u, 3);
      await preparationFrame();
    }
    if (!current()) return made;
    // 骨の複製・着せ付け・動きの用意も、一コマ3msの区切りで進める。
    if (!u.human) {
      if (MEM_TIGHT && !qualityKeeper(u) && borrowHuman(u)) continue;
      if (MEM_TIGHT && !qualityKeeper(u) && humanPool.size + humanBuilding.size >= SKIN_MAX) continue;
      const task = u._humanBuild || buildHuman(u, u.look || {});
      u._humanBuild = task; u._humanBuildLook = u.look;
      let step;
      do {
        const began = performance.now();
        do { step = task.next(); } while (!step.done && performance.now() - began < 3);
        if (!step.done) await preparationFrame();
        if (!current()) { task.return(); u._humanBuild = null; u._humanBuildLook = null; return made; }
      } while (!step.done);
      u.human = step.value; u._humanBuild = null; u._humanBuildLook = null;
      if (!u.human) continue;
      u.mesh.add(u.human.root);
    }
    if (warmOne(u)) made++;
    await finishFaceCopies(current);
    await preparationFrame();
  }
  if (current()) { rt.humansPrimed = true; HUM.primed = true; }
  return made;
}
// 隠れた材質と、支度で作った馬も本番と同じ属性の形で渡す。
export function humanProgramSamples(rt) {
  const samples = [];
  const body = rt.army.units.find(u => u.human)?.human?.body;
  if (body) {
    const add = (geo, material, skinned = true) => {
      if (!geo || !material) return;
      const m = skinned ? body.clone(false) : new THREE.Mesh();
      m.geometry = geo; m.updateMorphTargets(); m.material = material; m.receiveShadow = true;
      samples.push(m);
    };
    for (let v = 0; v < 4; v++) {
      add(body.geometry, nearCrowdMat(v));
      if (DM && DOMARU.ready) for (const nh of [false, true, 'helm']) add(DM.hi, domaruMaterial({}, nh, v));
    }
    for (const m of headMats.values()) add(HEAD.geo, m, false);
    if (MHHAND) for (const m of MHHAND.mats.values()) add(handGeo(), m);
    // 目・歯（mheye・mhteeth）は戦中に初めて描かれる事が多い。見本に入れて支度で作る（10/20）
    if (EYE_MH.mat && EYE_MH.geos.size) add(EYE_MH.geos.values().next().value, EYE_MH.mat, false);
    if (MOUTH_MH.teethM && MOUTH_MH.geos.size) add(MOUTH_MH.geos.values().next().value, MOUTH_MH.teethM, false);
  }
  if (HR && !rt.def?.noHorse) for (const horse of HR.pool) samples.push(horse.holder, horse.extra);
  // 馬具（漆・革・絹：tack2g・tack2m・tacksilk）は乗り手が付いた馬にだけ出るので、見本にも入れる
  if (HR && !rt.def?.noHorse) for (const m of [TACK_GLOSS, TACK_MATTE, TACK_SILK]) { const o = new THREE.Mesh(ROPE, m); o.receiveShadow = true; samples.push(o); }
  return samples;
}
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
// must：この近さより内の馬は、上限を越えても骨の入った馬にする
const HORSE_Q = { high: { near: 40, far: 44, max: 30, must: 32, mustMax: 60 }, mid: { near: 30, far: 34, max: 14, must: 27, mustMax: 36 }, low: { near: 0, far: 0, max: 1 }, lowN: { near: 16, far: 19, max: 3 } };
let HR = null, hrLoading = null;
const HS = 1.3 / 15.9;      // 元の形の単位 → m（肩の高さを 1.3m に）
const HX = 0.039;           // 元の形は左右が少しずれているので、真ん中へ
const SEAT_B = 'BN_Spine_01_03_03', CHEST_B = 'BN_Spine_03_05_05', HIP_B = 'BN_Pelvis_060_066', HEAD_B = 'BN_Head_01_029_028', POLL_B = 'BN_Head_00_016_015', LIP_B = 'BN_UP_Lip_030_029';
export function loadHorse() {
  if (hrLoading) return hrLoading;
  hrLoading = (async () => {
    const buf = await assetBytes('horse');
    const tl = new THREE.TextureLoader();
    const names = ['horse_col', 'horse_nrm', 'hair_col', 'hair_nrm', 'shoe_col', 'tack_col'];
    const [gl, ...ts] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...names.map((n) => texOr(n, new URL('../assets/horse_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: 4 })),
    ]);
    const tex = {};
    names.forEach((n, i) => { tex[n] = ts[i]; });
    prepHorse(gl, tex);
    // 毛色と家ごとの馬具の色の材質を先に作っておく（戦の中で new しない。形の下ごしらえは一つを使い回す）
    try {
      const { COATS, horseStyleFor, FACTION } = await import('./units.js');
      for (const fac of ['', ...Object.keys(FACTION)]) for (const rk of [0, 1, 2]) for (const c of COATS) horseMaterials({ ...horseStyleFor(0, rk, fac), coat: c.coat, mane: c.mane, points: c.points });
    } catch (e) { /* 先に作れなくても、要る時に作る */ }
    HORSE.ready = true;
    HORSE_HOOK.drive = driveHorse;
  })().catch((e) => { HORSE.failed = true; HORSE.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の馬を読めませんでした（今の形の馬で描きます）', e); });
  return hrLoading;
}
// 支度中の戦場の光を明示して、馬の形・馬具・描き方を先に用意する。
// game.battle への引き渡し前でも動き、二戦目もその戦場の光で準備する。
export async function primeHorses(rt, current = () => true) {
  // 本能寺などの徒歩の戦で、使わない馬の展開と最大八秒の待ちを挟まない。
  if (rt.def?.noHorse || !current()) return;
  let timer;
  try {
    const ready = await Promise.race([loadHorse().then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 8000); })]);
    if (!ready) return;
  } finally { clearTimeout(timer); }
  if (!HORSE.ready || !current()) return;
  const horses = new Set(rt.army.units.map(u => u.horse).filter(Boolean));
  if (rt.player.horse) horses.add(rt.player.horse);
  // 遠い馬の静かな形は残す。骨と動きの作り置きは、開幕で使う距離だけ。
  // 戦中の選び方・上限は updateHorses のまま、近づいた馬は通常どおり作る。
  const near = new Set(), cam = rt.camera.position;
  const range = HORSE_Q[S.quality].near;
  for (const u of rt.army.units) {
    if (u.gone || !u.mounted || !u.horse || u.horse.visible === false || (!u.alive && u.deadT > 30)) continue;
    const named = u.type === 'busho' || typeof u.look?.face === 'string' && u.look.face.startsWith('g:');
    if (u.isPlayer || Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) < (named ? (60) : range)) near.add(u.horse);
  }
  if (rt.player.horse) near.add(rt.player.horse);
  const prepared = [], styles = new Set();
  const cap = Math.min(near.size, HORSE_Q[S.quality].max);
  try {
    for (const h of horses) {
      if (!current()) return;
      applyProxy(h);
      const st = h.userData.style || {};
      // 階級・家を持たない拵えもあるため、実際の馬具の色も鍵に含める。
      const key = [st.coat, st.mane, st.points, st.rank, st.faction, st.tack, st.saddle, st.rim, st.cushion, st.aori, st.tassels, st.big, st.reins].join('|');
      if (near.has(h) && !styles.has(key)) {
        styles.add(key);
        const R = prepared.length < cap ? (HR.pool.pop() || makeRealHorse()) : prepared[0];
        if (prepared.length < cap) prepared.push(R);
        dressHorse(R, st);
      }
      await preparationFrame();
    }
  } finally {
    HR.pool.push(...prepared);
    if (typeof window !== 'undefined' && window.__loadTimes) window.__loadTimes.horsesPrimed = prepared.length;
  }
}
// 録った動きから別の足運びを作る（読み込みの時に一度だけ）。脚ごとに拍子をずらし（shift：一回りの割合。正で早まる）、
// 回りの振りを amp 倍に（fore＝前脚・hind＝後脚・body＝背と首。low は膝から下にさらに掛ける）
const LEG_RE = { LF: /BN_L_(Clavicle|UpperArm|Hand|Toe_042)|BN_l_Forearm/, RF: /BN_R_(Clavicle|UpperArm|Forearm|Hand|Toe_047)/, LH: /BN_L_(Thing|Calf|HorseLink|Foot|Toe_2)/, RH: /BN_R_(Thing|Calf|HorseLink|Foot|Toe_2)/ };
function gaitClip(src, name, shift, amp) {
  const T = src.duration, N = 48, times = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) times[i] = T * i / N;
  const q = new THREE.Quaternion(), m = new THREE.Quaternion(), d = new THREE.Quaternion(), q0 = new THREE.Quaternion(), ax = new THREE.Vector3();
  const tracks = src.tracks.map((tr) => {
    const bn = tr.name.split('.')[0], leg = Object.keys(LEG_RE).find((k) => LEG_RE[k].test(bn));
    const k = leg ? (amp[leg[1] === 'F' ? 'fore' : 'hind'] || 1) * (/Forearm|Calf/.test(bn) ? amp.low || 1 : /Hand|HorseLink|Foot|Toe/.test(bn) ? amp.tip ?? 1 : 1) : (amp.body && /Spine|Neck|Pelvis/.test(bn) ? amp.body : 1);
    const s = leg ? shift[leg] || 0 : 0;
    if ((!s && k === 1) || tr.times.length < 2) return tr;
    const it = tr.createInterpolant(), n = tr.getValueSize(), vals = new Float32Array((N + 1) * n);
    for (let i = 0; i <= N; i++) vals.set(it.evaluate((((times[i] + s * T) % T) + T) % T), i * n);
    if (k !== 1 && n === 4) {
      // 中心の形から回りの角を k 倍に。脚は地面を踏む真ん中の形（amp.cen：元の動きの一回りの割合）を中心にする（踏む脚が浮かない）
      if (leg && amp.cen) m.fromArray(it.evaluate(amp.cen[leg] * T));
      else {
        m.set(0, 0, 0, 0); q0.fromArray(vals, 0);
        for (let i = 0; i < N; i++) { q.fromArray(vals, i * 4); const sg = q.dot(q0) < 0 ? -1 : 1; m.set(m.x + q.x * sg, m.y + q.y * sg, m.z + q.z * sg, m.w + q.w * sg); }
        m.normalize();
      }
      for (let i = 0; i <= N; i++) {
        q.fromArray(vals, i * 4); d.copy(m).invert().multiply(q);
        if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
        const sn = Math.sqrt(Math.max(0, 1 - d.w * d.w));
        if (sn > 1e-5) { d.setFromAxisAngle(ax.set(d.x / sn, d.y / sn, d.z / sn), 2 * Math.acos(Math.min(1, d.w)) * k); q.copy(m).multiply(d).toArray(vals, i * 4); }
      }
    }
    return new tr.constructor(tr.name, times, vals);
  });
  return new THREE.AnimationClip(name, T, tracks);
}
// 鬣と尾：歩く姿に組んだ骨の上で、首の峰（体の形の一番上の線）から首の脇へ垂れる房と、尾の骨から地へ垂れる房を作る。
// 作った点は骨の動きの逆で縛りの形へ戻す（立ち姿と元の縛りの座標がずれていても、毛が地にもぐったり宙に浮いたりしない）。
// 抜き絵の粒は使わない。少ない面を全距離で共用し、骨・材質・描く回数は増やさない。
function horseHairGeometry(mesh, body, walk) {
  let root = mesh; while (root.parent && root.parent.parent) root = root.parent;
  const bones = mesh.skeleton.bones;
  // 骨の今の形を覚え、歩きの初めの形に組む（作り終えたら戻す）
  const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mixer = walk ? new THREE.AnimationMixer(root) : null;
  if (mixer) { mixer.clipAction(walk).play(); mixer.setTime(walk.duration * 0.1); }
  root.updateMatrixWorld(true);
  const bIdx = new Map(bones.map((b, i) => [b, i]));
  const bodyB = body.skeleton.bones;
  const wp = (nm) => { const b = bones.find((x) => x.name === nm); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  // 体の形の点（組んだ姿、根元の座標 m）
  const N = body.geometry.attributes.position.count, BP = new Float32Array(N * 3), v = new THREE.Vector3();
  const bSI = body.geometry.attributes.skinIndex, bSW = body.geometry.attributes.skinWeight, bPos = body.geometry.attributes.position;
  {
    const bmB = bodyB.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, body.skeleton.boneInverses[i]).multiply(body.bindMatrix));
    const u = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.set(0, 0, 0);
      for (let c = 0; c < 4; c++) { const w = bSW.getComponent(i, c); if (w > 0) v.addScaledVector(u.fromBufferAttribute(bPos, i).applyMatrix4(bmB[bSI.getComponent(i, c)]), w); }
      BP[i * 3] = v.x; BP[i * 3 + 1] = v.y; BP[i * 3 + 2] = v.z;
    }
  }
  const skinOf = (i) => { const si = [], sw = []; for (let c = 0; c < 4; c++) { const w = bSW.getComponent(i, c); if (w > 0.001) { si.push(bIdx.get(bodyB[bSI.getComponent(i, c)]) ?? 0); sw.push(w); } } while (si.length < 4) { si.push(0); sw.push(0); } return [si, sw]; };
  const P = [], UV = [], SI = [], SW = [], IX = [];
  const put = (p, uv, sk) => { P.push(p.x, p.y, p.z); UV.push(uv[0], uv[1]); SI.push(...sk[0]); SW.push(...sk[1]); };
  const quad = (a, b, c, d) => IX.push(a, b, c, b, d, c);
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // ---- 鬣 ----
  const withers = wp('BN_Spine_03_05_05'), poll = wp(POLL_B);
  if (withers && poll) {
    const z0 = withers.z - 0.06, z1 = poll.z - 0.05, NB = 30, xc = withers.x;
    const crest = [];
    for (let k = 0; k <= NB; k++) {
      const zc = z0 + (z1 - z0) * k / NB;
      let best = -1, by = -1e9;
      for (let i = 0; i < N; i++) { const x = BP[i * 3], y = BP[i * 3 + 1], z = BP[i * 3 + 2]; if (Math.abs(z - zc) < 0.025 && Math.abs(x - xc) < 0.03 && y > by) { by = y; best = i; } }
      if (best >= 0 && !crest.some((c) => c.i === best)) crest.push({ i: best, p: new THREE.Vector3(BP[best * 3], by, BP[best * 3 + 2]) });
    }
    // 首の脇の面：高さ y・前後 z の所で、首の外側（side の向き）の一番外の x
    const sideX = (y, z, side) => { let m = null; for (let i = 0; i < N; i++) { if (Math.abs(BP[i * 3 + 2] - z) < 0.03 && Math.abs(BP[i * 3 + 1] - y) < 0.03) { const x = BP[i * 3] * side; if (m === null || x > m) m = x; } } return m; };
    const side = 1, ROWS = 6;
    // 三枚重ね：首に沿う内の房・半房ずらした中の房・外へ膨らむ短い房（すだれの隙間と鋸の歯を見せない）
    for (let layer = 0; layer < 3; layer++) {
      for (let k = 0; k < crest.length; k++) {
        const c = crest[k], f = k / (crest.length - 1);
        const nxt = crest[Math.min(crest.length - 1, k + 1)].p, prv = crest[Math.max(0, k - 1)].p;
        const dir = new THREE.Vector3().subVectors(nxt, prv).normalize();
        const sk = skinOf(c.i);
        // 首の中ほどが長く、き甲と耳の際は短い。房ごとに長さを揃えない
        const L = (0.12 + 0.15 * Math.sin(Math.PI * Math.min(1, f * 1.1)) + 0.07 * rnd(k * 3 + layer)) * [1, 0.92, 0.7][layer];
        const w = 0.06 + 0.015 * rnd(k * 7 + layer);
        const base = P.length / 3;
        let xo = 0;
        for (let j = 0; j <= ROWS; j++) {
          const t = j / ROWS;
          const y = c.p.y + (j === 0 ? 0.03 : 0.018) - L * t;
          const z = c.p.z - L * t * 0.18 + (rnd(k * 11 + j) - 0.5) * 0.008 - (rnd(k * 5 + layer) - 0.5) * 0.05 * t + (layer === 1 ? 0.014 : 0);
          const sx = sideX(y, z, side);
          if (sx !== null) xo = Math.max(xo, sx * side - c.p.x * side + 0.008 + 0.028 * t + layer * 0.012);
          // 峰の上は向こう側から少し被せ、隙間を見せない
          const x = c.p.x + side * (j === 0 ? -0.024 + layer * 0.01 : xo);
          // 裾は細る（板の四角い端を見せない）
          const ww = w * (1 - 0.75 * Math.pow(t, 3)) * (1 + 0.2 * Math.sin(t * Math.PI));   // 毛先は細って尖る（裾を四角い板の端にしない）
          for (const s of [-1, 1]) put(new THREE.Vector3(x, y, z).addScaledVector(dir, s * ww * 0.5), [(s + 1) / 2, t], sk);
          if (j) { const a = base + (j - 1) * 2; quad(a, a + 1, a + 2, a + 3); }
        }
      }
    }
    // 前髪：耳の間から額へ垂れる房
    const head = wp(HEAD_B);
    let pi = 0, pd = 1e9;
    for (let i = 0; i < N; i++) { const d = (BP[i * 3] - poll.x) ** 2 + (BP[i * 3 + 1] - poll.y) ** 2 + (BP[i * 3 + 2] - poll.z) ** 2; if (d < pd) { pd = d; pi = i; } }
    const skP = skinOf(pi);
    if (head) for (let q = 0; q < 3; q++) {
      const a = poll.clone(); a.y += 0.03; a.z += 0.02; a.x += (q - 1) * 0.022;
      const d = head.clone().sub(a).normalize();
      const out = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
      const base = P.length / 3;
      for (let j = 0; j <= 4; j++) {
        const t = j / 4, p = a.clone().addScaledVector(d, 0.16 * t * (0.85 + 0.2 * rnd(q))).addScaledVector(out, 0.012 + 0.01 * t);
        const ww = 0.03 * (1 - 0.6 * t);
        for (const s of [-1, 1]) put(p.clone().add(new THREE.Vector3(s * ww * 0.5, 0, 0)), [(s + 1) / 2, t], skP);
        if (j) { const b0 = base + (j - 1) * 2; quad(b0, b0 + 1, b0 + 2, b0 + 3); }
      }
    }
  }
  // ---- 尾：尾の骨に沿って出て、下へ垂れる房。横向きと前後向きの板を混ぜ、どの向きからも厚く見せる ----
  const tb = TAIL_B.map((nm) => { const b = bones.find((x) => x.name === nm); return b ? { i: bIdx.get(b), p: new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) } : null; }).filter(Boolean);
  if (tb.length > 2) {
    const gN = tb[tb.length - 1].p;
    const yEnd = 0.36;   // 飛節の下ほどまで
    for (let s = 0; s < 14; s++) {
      const a = s * 2.399, rr = 0.012 + 0.02 * Math.sqrt(rnd(s * 5 + 1));
      const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr * 0.8;
      const along = s % 2 === 0;
      const yE = yEnd + 0.08 * rnd(s * 13) - 0.02;
      const base = P.length / 3, ROWS = 10;
      for (let j = 0; j <= ROWS; j++) {
        const t = j / ROWS;
        // 上の四割半は骨の鎖に沿い、その先は下へ垂れる
        let p, bi;
        const tt = t / 0.45;
        if (tt <= 1) {
          const fk = tt * (tb.length - 1), k0 = Math.min(tb.length - 2, Math.floor(fk));
          p = tb[k0].p.clone().lerp(tb[k0 + 1].p, fk - k0); bi = tb[Math.round(fk)].i;
        } else {
          const u = (t - 0.45) / 0.55;
          p = gN.clone(); p.y = gN.y + (yE - gN.y) * u; p.z = gN.z - 0.04 * u; bi = tb[tb.length - 1].i;
        }
        const spread = 1 + 1.6 * t;
        p.x += ox * spread; p.z += oz * spread;
        const ww = (0.03 + 0.012 * rnd(s)) * (1 - 0.5 * t * t) * (t < 0.1 ? 0.6 + 4 * t : 1);
        const off = along ? new THREE.Vector3(0, 0, ww * 0.5) : new THREE.Vector3(ww * 0.5, 0, 0);
        const sk = [[bi, 0, 0, 0], [1, 0, 0, 0]];
        put(p.clone().sub(off), [0, t], sk); put(p.clone().add(off), [1, t], sk);
        if (j) { const b0 = base + (j - 1) * 2; quad(b0, b0 + 1, b0 + 2, b0 + 3); }
      }
    }
  }
  // 組んだ姿の点 → 縛りの形の点（頂点ごとに骨の重みの行列の逆を掛ける）
  const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i]));
  const S = new THREE.Matrix4(), bindInv = mesh.bindMatrix.clone().invert();
  for (let n = 0; n < P.length / 3; n++) {
    const o = S.elements; o.fill(0);
    for (let c = 0; c < 4; c++) { const w = SW[n * 4 + c]; if (w <= 0) continue; const e = bm[SI[n * 4 + c]].elements; for (let q = 0; q < 16; q++) o[q] += e[q] * w; }
    S.invert();
    v.set(P[n * 3], P[n * 3 + 1], P[n * 3 + 2]).applyMatrix4(S).applyMatrix4(bindInv);
    P[n * 3] = v.x; P[n * 3 + 1] = v.y; P[n * 3 + 2] = v.z;
  }
  // 骨を元へ
  if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  root.updateMatrixWorld(true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(IX); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
// ---- 遠めの馬の形：本物の馬を立ち姿で固め、部位（胴・首と頭・尾・四本の脚の上と下）に切り分けて、今の形の馬の骨組みに付ける ----
// 骨の重みを毎コマ計算しない（今の形の馬と同じ、部品を回すだけ）。毛色と筋肉の陰は頂点の色に焼き込む
const PX_HORSE_K = 0.86;   // units_model.js の HORSE_K と同じ
const PX_LEG = [['BN_L_UpperArm', 'BN_L_Hand'], ['BN_R_UpperArm', 'BN_R_Hand'], ['BN_L_Thing', 'BN_L_HorseLink'], ['BN_R_Thing', 'BN_R_HorseLink']];
function proxySource(sc, skMesh, parts, clip, tex) {
  const bones = skMesh.skeleton.bones;
  const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mixer = new THREE.AnimationMixer(sc);
  mixer.clipAction(clip).play(); mixer.setTime(0);
  let top = sc; while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const find = (re) => bones.findIndex((b) => b.name.startsWith(re));
  // 骨ごとの部位：祖先をたどって、脚の下・脚の上・首・尾・胴のどれか
  const gOf = bones.map((b) => {
    for (let p = b; p && p.isBone; p = p.parent) {
      const n = p.name;
      for (let i = 0; i < 4; i++) { if (n.startsWith(PX_LEG[i][1])) return 'l' + i; if (n.startsWith(PX_LEG[i][0])) return 'u' + i; }
      if (n.startsWith('BN_Neck_00')) return 'neck';
      if (n.startsWith('BN_Tail_00')) return 'tail';
    }
    return 'body';
  });
  const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skMesh.skeleton.boneInverses[i]).multiply(skMesh.bindMatrix));
  const wpos = (i) => new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld);
  const piv = { neck: wpos(find('BN_Neck_00')), tail: wpos(find('BN_Tail_00')) };
  for (let i = 0; i < 4; i++) { piv['u' + i] = wpos(find(PX_LEG[i][0])); piv['l' + i] = wpos(find(PX_LEG[i][1])); }
  // 体の色の絵を小さく読み、明るさ（毛の基準 0.214）を頂点に焼く
  let img = null;
  try {
    const im = tex.horse_col.image, cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 256, 256); img = cx.getImageData(0, 0, 256, 256).data;
  } catch (e) { img = null; }
  const G = {};
  const v = new THREE.Vector3(), u = new THREE.Vector3();
  for (const [geo, kind] of parts) {
    const pos = geo.attributes.position, uv = geo.attributes.uv, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const n = pos.count, P = new Float32Array(n * 3), grp = new Array(n), sh = new Float32Array(n).fill(1), tv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      v.set(0, 0, 0); let bw = -1, bi = 0;
      for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w <= 0) continue; const b = SI.getComponent(i, c); v.addScaledVector(u.fromBufferAttribute(pos, i).applyMatrix4(bm[b]), w); if (w > bw) { bw = w; bi = b; } }
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; grp[i] = gOf[bi];
      if (uv) tv[i] = uv.getY(i);
      if (img && uv && kind === 0) {
        const x = Math.min(255, Math.max(0, Math.floor(uv.getX(i) * 256))), y = Math.min(255, Math.max(0, Math.floor(uv.getY(i) * 256))), o = (y * 256 + x) * 4;
        sh[i] = Math.min(1.18, Math.max(0.72, (img[o] * 0.3 + img[o + 1] * 0.59 + img[o + 2] * 0.11) / 255 / 0.214));
      }
    }
    const ix = geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i);
    // 三角形は、どれかの頂点がその部位なら入れる（境目を重ねて、回した時に隙間を見せない）
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      for (const g of new Set([grp[a], grp[b], grp[c]])) {
        const o = G[g] || (G[g] = { P: [], C: [], K: [], T: [], IX: [], map: new Map() });
        // 毛の房は表と裏の両面（材質は片面なので、裏向きの三角形を別の頂点で足す）
        for (const [q0, q1, q2, bk] of kind === 2 ? [[a, b, c, 0], [a, c, b, 5e5]] : [[a, b, c, 0]]) for (const q of [q0, q1, q2]) {
          const key = kind * 1e6 + q + bk;
          let k = o.map.get(key);
          if (k === undefined) { k = o.P.length / 3; o.map.set(key, k); o.P.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]); o.C.push(sh[q]); o.K.push(kind); o.T.push(tv[q]); }
          o.IX.push(k);
        }
      }
    }
  }
  for (const g in G) delete G[g].map;
  mixer.stopAllAction(); mixer.uncacheRoot(sc);
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  top.updateMatrixWorld(true);
  // 銜の場所（首の支点からの、今の形の馬の首の座標）
  const lip = wpos(find(LIP_B)), poll = wpos(find(POLL_B));
  const bitN = lip.lerp(poll, 0.16).sub(piv.neck).multiplyScalar(1 / PX_HORSE_K);
  return { G, piv, bitN, styles: new Map(), lo: new Map() };
}
// 毛色・馬具ごとの形（部位ごとの BufferGeometry。今の形の馬の部品の座標＝根元の座標 / HORSE_K から支点を引いた所）
function proxyGeos(st) {
  const PX = HR.proxy, K = PX_HORSE_K;
  const key = [st.coat, st.mane, st.points ?? 0, st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (PX.styles.has(key)) return PX.styles.get(key);
  const coat = new THREE.Color(st.coat ?? 0x5a321c), mane = new THREE.Color(st.mane ?? 0x1a1410), hoof = new THREE.Color(0x1a1511), skin = new THREE.Color(0x231a14);
  const pts = st.points ?? 0, c = new THREE.Color();
  const out = {};
  const mtlSkin = MK.skin + MK.skin * 8 + 0.2 * 0.9, mtlHair = MK.cloth + MK.cloth * 8;
  for (const g in PX.G) {
    const S = PX.G[g], n = S.P.length / 3, pv = PX.piv[g] || new THREE.Vector3();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = S.P[i * 3], y = S.P[i * 3 + 1], z = S.P[i * 3 + 2];
      pos[i * 3] = (x - pv.x) / K; pos[i * 3 + 1] = (y - pv.y) / K; pos[i * 3 + 2] = (z - pv.z) / K;
      const kd = S.K[i];
      if (kd === 1) c.copy(hoof);
      else if (kd === 2) c.copy(mane).multiplyScalar(0.7 + 0.5 * S.T[i]);
      else if (kd === 3) c.setRGB(0.02, 0.016, 0.014);
      else {
        c.copy(coat).multiplyScalar(0.85 * S.C[i]);
        // 鹿毛の脚先は黒い。鼻づらは暗い肌。腹の下は少し淡い（体の色の絵の陰と合わせる）
        const legs = (1 - THREE.MathUtils.smoothstep(y, 0.24, 0.55)) * Math.min(1, pts);
        c.lerp(mane, legs * 0.85);
        c.lerp(skin, THREE.MathUtils.smoothstep(z, 1.62, 1.78) * 0.6 * (1 - THREE.MathUtils.smoothstep(y, 0.6, 0.8)));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mt[i] = kd === 2 ? mtlHair : mtlSkin;
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(S.IX);
    // 尾は今の形の馬が 0.35 だけ持ち上げて置くので、その分を戻しておく
    if (g === 'tail') geo.rotateX(-0.35);
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
    geo.setAttribute('mtl', new THREE.BufferAttribute(mt, 1));
    const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = PLAIN_UV[0]; uv[i * 2 + 1] = PLAIN_UV[1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (g === 'body') {
      // 和鞍・胸繋・尻繋（本物の馬と同じ形）を胴に混ぜる
      const T = tackGeometry(st), add = [geo];
      const stir = [];
      for (const sd of [1, -1]) {
        for (const [g, color] of stirrupParts()) stir.push(colGeo(tf(g.clone(), sd * 0.3, 0.76, 0.1), color));
        stir.push(colGeo(strap([[sd * 0.19, 1.3, 0.03], [sd * 0.3, 0.96, 0.15]], 0.012), st.tack));
      }
      for (const [k, arr] of Object.entries({ ...T, stir: [mergeG(stir)] })) arr.forEach((tg, j) => {
        if (!tg) return;
        const t = tg.clone();
        for (const nm of Object.keys(t.attributes)) if (!['position', 'normal', 'color'].includes(nm)) t.deleteAttribute(nm);
        if (!t.attributes.normal) t.computeVertexNormals();
        t.scale(1 / K, 1 / K, 1 / K);
        const m = t.attributes.position.count;
        if (!t.attributes.color) { const cc = new Float32Array(m * 3).fill(0.3); t.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
        t.setAttribute('col2', new THREE.BufferAttribute(t.attributes.color.array.slice(), 3));
        const kind = j === 0 && k !== 'seat' ? MK.lac : j === 0 ? MK.lac : MK.cloth;
        t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(kind + MK.cloth * 8 + 0.2), 1));
        const tu = new Float32Array(m * 2); for (let i = 0; i < m; i++) { tu[i * 2] = PLAIN_UV[0]; tu[i * 2 + 1] = PLAIN_UV[1]; }
        t.setAttribute('uv', new THREE.BufferAttribute(tu, 2));
        const nx = t.index ? t : (() => { const q = t; const ii = new Uint32Array(m); for (let i = 0; i < m; i++) ii[i] = i; q.setIndex(new THREE.BufferAttribute(ii, 1)); return q; })();
        add.push(nx);
      });
      geo = mergeGeometries(add) || geo;
    }
    if (g === 'neck' && HR.bridle) {
      const t = HR.bridle.clone();
      t.translate(-pv.x, -pv.y, -pv.z); t.scale(1 / K, 1 / K, 1 / K);
      const m = t.attributes.position.count, col = new Float32Array(m * 3), color = _lin(st.tack);
      for (let i = 0; i < m; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
      t.setAttribute('color', new THREE.BufferAttribute(col, 3));
      t.setAttribute('col2', new THREE.BufferAttribute(col.slice(), 3));
      t.setAttribute('mtl', new THREE.BufferAttribute(new Float32Array(m).fill(MK.cloth + MK.cloth * 8), 1));
      const uv = t.attributes.uv;
      for (let i = 0; i < m; i++) uv.setXY(i, PLAIN_UV[0], PLAIN_UV[1]);
      const ix = new Uint32Array(m); for (let i = 0; i < m; i++) ix[i] = i;
      t.setIndex(new THREE.BufferAttribute(ix, 1));
      geo = mergeGeometries([geo, t]) || geo;
    }
    geo.computeBoundingSphere();
    out[g] = geo;
  }
  PX.styles.set(key, out);
  return out;
}
// 今の形の馬の部品の形を、切り分けた本物の馬の形に替える（支点も本物の関節へ）。遠くの形（lo）は元の形を同じ所に残す
const _pxOff = new THREE.Vector3();
function proxyLo(geo, off) {
  const PX = HR.proxy, k = geo.uuid + '|' + off.toArray().map((x) => x.toFixed(3)).join(',');
  if (!PX.lo.has(k)) { const g = geo.clone(); g.translate(off.x, off.y, off.z); PX.lo.set(k, g); }
  return PX.lo.get(k);
}
function applyProxy(h) {
  const H = h.userData.horse; if (!H || h.userData.px) return;
  h.userData.px = true;
  const P = proxyGeos(h.userData.style || {}), PV = HR.proxy.piv, K = PX_HORSE_K;
  const meshOf = (g) => g.isMesh ? g : g.children.find((o) => o.isMesh);
  const swap = (mesh, hi, off) => {
    if (!mesh || !hi) return;
    const L = mesh.userData.lod, lo = L ? L[1] : mesh.geometry;
    lodSwap(mesh, hi, proxyLo(lo, off), 30);
  };
  // 胴（支点は動かさない）
  swap(H.body, P.body, _pxOff.set(0, 0, 0));
  // 首と頭
  {
    const np = PV.neck.clone().multiplyScalar(1 / K), off = H.neck.position.clone().sub(np);
    H.neck.position.copy(np); swap(meshOf(H.neck), P.neck, off);
    for (const e of H.ears || []) e.visible = false;
    // 銜の場所（首の座標）：上唇の少し奥
    H.bitN = new THREE.Vector3(0.05 / K, 0, 0).add(HR.proxy.bitN);
  }
  // 尾
  { const tp = PV.tail.clone().multiplyScalar(1 / K), off = H.tail.position.clone().sub(tp); H.tail.position.copy(tp); swap(meshOf(H.tail), P.tail, off); }
  // 脚
  for (let i = 0; i < 4; i++) {
    const Lg = H.legs[i], Kg = H.lowers[i];
    const up = PV['u' + i].clone().multiplyScalar(1 / K), lw = PV['l' + i].clone().multiplyScalar(1 / K);
    const oldL = Lg.position.clone(), oldKA = oldL.clone().add(Kg.position);
    Lg.position.copy(up); Kg.position.copy(lw.clone().sub(up));
    swap(meshOf(Lg), P['u' + i], oldL.clone().sub(up));
    swap(meshOf(Kg), P['l' + i], oldKA.sub(lw));
  }
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
  // 形の座標 → 馬の根元の座標（m。前が +z、上が +y）：汗・泡・泥の場所を、鞍や胸繋と同じ物差しで描く
  const toRoot = {};
  sc.traverse((o) => { if (o.isMesh) toRoot[o.name.replace(/^horse_|_hi$/g, '')] = o.matrixWorld.clone(); });
  {
    let hairM = null, bodyM = null;
    sc.traverse((o) => { if (o.isSkinnedMesh) { const k = o.name.replace(/^horse_|_hi$/g, ''); if (k === 'hair') hairM = o; if (k === 'body') bodyM = o; } });
    if (hairM && bodyM) { hairM.geometry = horseHairGeometry(hairM, bodyM, gl.animations.find((c) => c.name === 'walk')); lo.hair = hairM.geometry; }
  }
  // 遠めの馬の形の元（立ち姿で固めた本物の馬）
  let proxy = null;
  try {
    let hairM = null, shoeM = null, eyeM = null;
    sc.traverse((o) => { if (o.isSkinnedMesh) { const k = o.name.replace(/^horse_|_hi$/g, ''); if (k === 'hair') hairM = o; if (k === 'shoe') shoeM = o; if (k === 'eye') eyeM = o; } });
    const parts = [[lo.body, 0]]; if (shoeM) parts.push([shoeM.geometry, 1]); if (hairM) parts.push([hairM.geometry, 2]); if (eyeM) parts.push([eyeM.geometry, 3]);
    if (hairM && lo.body) proxy = proxySource(sc, hairM, parts, gl.animations.find((c) => c.name === 'idle1') || gl.animations[0], tex);
  } catch (e) { console.warn('遠めの馬の形を作れませんでした', e); }
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
  // 録った動きは並足（四拍）と駆け足（三拍の駆歩・右手前）だけ。速歩（対角の二拍）と襲歩（四拍の全速）はそこから作る
  // shift と cen は、録った動きの蹄が地面に着く拍子を測って決めた値（速歩は対角の脚がそろい、襲歩は 左後→右後→左前→右前 の順）
  clips.trot = gaitClip(clips.walk, 'trot', { LH: 0.34, RH: 0.25 }, { fore: 1.3, hind: 1.3, low: 1.4, cen: { LF: 0.44, RF: 0.94, LH: 0.28, RH: 0.71 } });
  clips.run = gaitClip(clips.gallop, 'run', { RH: 0.06, LF: -0.04, RF: 0.04 }, { fore: 1.15, hind: 1.15, body: 1.25, cen: { LH: 0.57, RH: 0.72, LF: 0.77, RF: 0 } });
  HR = { scene: sc, lo, tex, rest, restInv, clips, bitL: bit.clone().setX(bit.x + 0.05), bitR: bit.clone().setX(bit.x - 0.05), head0: P(HEAD_B), pool: [], mats: new Map(), tack: new Map(), toRoot, proxy };
  // 幅広い洋式の革の面繋を、同じ描き物のまま丸い組紐へ替える。
  const bridleMesh = sc.getObjectByName('horse_bridle');
  if (bridleMesh) {
    HR.bridle = bridleGeometry(lip, poll);
  }
}

// 面繋：項・鼻の輪と左右の頬の紐。口の銜から手綱につながる。
function bridleGeometry(lip, poll) {
  const axis = poll.clone().sub(lip).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const nose = lip.clone().lerp(poll, 0.28), crown = lip.clone().lerp(poll, 0.94), bit = lip.clone().lerp(poll, 0.16);
  const parts = [];
  for (const [center, radius] of [[nose, 0.075], [crown, 0.1]]) {
    const g = new THREE.TorusGeometry(radius, 0.009, 5, 14);
    g.applyQuaternion(q); g.translate(center.x, center.y, center.z); parts.push(g.toNonIndexed());
  }
  for (const sd of [1, -1]) {
    const pts = [crown.clone().add(new THREE.Vector3(sd * 0.1, 0, 0)), nose.clone().add(new THREE.Vector3(sd * 0.075, 0, 0)), bit.clone().add(new THREE.Vector3(sd * 0.05, 0, 0))];
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.009, 5, false).toNonIndexed());
  }
  return mergeGeometries(parts);
}
// 組紐の交差する筋は小さな一枚の絵で共有し、細い紐の描く回数を増やさない。
let cordMap = null;
function braidedCordMap() {
  if (cordMap) return cordMap;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'); cx.fillStyle = '#bbbbbb'; cx.fillRect(0, 0, 64, 64);
  cx.lineWidth = 7;
  for (let i = -64; i <= 128; i += 16) {
    cx.strokeStyle = '#eeeeee'; cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 64, 64); cx.stroke();
    cx.strokeStyle = '#888888'; cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i - 64, 64); cx.stroke();
  }
  cordMap = new THREE.CanvasTexture(cv); cordMap.colorSpace = THREE.SRGBColorSpace;
  cordMap.wrapS = cordMap.wrapT = THREE.RepeatWrapping; cordMap.repeat.set(1, 16);
  return cordMap;
}

// ---- 材質 ----
const _lin = (hex) => new THREE.Color(hex);
// 馬の材質の道具：値の揺らぎ・丸み（凸は +、凹は -）・毛の向きの照り（Kajiya-Kay）
const HORSE_GLSL = `
float hHb(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hVn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHb(i), hHb(i + vec3(1,0,0)), f.x), mix(hHb(i + vec3(0,1,0)), hHb(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hHb(i + vec3(0,0,1)), hHb(i + vec3(1,0,1)), f.x), mix(hHb(i + vec3(0,1,1)), hHb(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float hCurv(vec3 n, vec3 vp) {
  vec3 dx = dFdx(vp), dy = dFdy(vp);
  return dot(dFdx(n), dx) / max(dot(dx, dx), 1e-10) + dot(dFdy(n), dy) / max(dot(dy, dy), 1e-10);
}
float hStrand(vec3 T, vec3 L, vec3 V, float p) { vec3 H = normalize(L + V); float t = dot(T, H); return pow(sqrt(max(0.0, 1.0 - t * t)), p); }
`;
// 形の座標 → 馬の根元の座標（形ごと）と、その逆
function rootU(k) {
  const M = HR.toRoot[k] || new THREE.Matrix4();
  return { uToRoot: { value: M }, uFromRoot: { value: M.clone().invert() } };
}
// 日の光の毛の照り（lights_fragment_end の後に足す。T は画面の座標の毛の向き）
const sheenGlsl = (T, amt) => `
      #if NUM_DIR_LIGHTS > 0
      {
        vec3 hT = normalize(${T} - normal * dot(normal, ${T}));
        vec3 hV = normalize(vViewPosition);
        float hnl = smoothstep(0.0, 0.3, dot(normal, directLight.direction));
        // 一つ目は毛の表の白い照り、二つ目は毛の中を通った色の付いた照り（少しずらす）
        float s1 = hStrand(hT, directLight.direction, hV, 110.0), s2 = hStrand(normalize(hT + normal * 0.25), directLight.direction, hV, 22.0);
        reflectedLight.directSpecular += directLight.color * hnl * (s1 * 0.045 * vec3(1.0) + s2 * 0.05 * min(diffuseColor.rgb * 2.2 + 0.05, vec3(1.0))) * (${amt});
      }
      #endif`;
function horseMaterials(st) {
  const pts = st.points ?? 0;
  const k = [st.coat, st.mane, pts, st.tack].join('|');
  if (HR.mats.has(k)) return HR.mats.get(k);
  const T = HR.tex;
  // 体：色の絵は明るさだけ（毛の基準が 0.5）。毛色を掛ける。鹿毛は脚先を黒く、どの毛色も鼻づらは暗い肌
  const coat = _lin(st.coat), mane = _lin(st.mane);
  const body = new THREE.MeshStandardMaterial({ map: T.horse_col, normalMap: T.horse_nrm, normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.65, metalness: 0 });
  body.color.copy(coat).multiplyScalar(0.85);
  // 毛色から腹の淡さを決める。葦毛にも粒状の斑は足さない。
  const hsl = new THREE.Color(st.coat).getHSL({}), grey = hsl.s < 0.14 && hsl.l > 0.3;
  const fx = new THREE.Vector4(pts >= 1 ? 0.8 : grey ? 0 : 0.35, grey ? 1 : 0, grey ? 0 : hsl.l > 0.12 ? 0.8 : 0.3, hsl.l < 0.1 ? 1 : 0.4);
  const U = { uPR: { value: new THREE.Vector3(mane.r / Math.max(0.002, coat.r), mane.g / Math.max(0.002, coat.g), mane.b / Math.max(0.002, coat.b)).clampScalar(0, 1.5) }, uPts: { value: pts }, uFx: { value: fx }, uGrime: GRIME, uWet: WET, ...rootU('body') };
  body.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    // vRP：馬の根元の座標（m）。vHT：毛の流れる向き（画面の座標。体は後ろへ、首は下へ、脚は下へ）
    sh.vertexShader = 'uniform mat4 uToRoot, uFromRoot;\nvarying vec3 vHP, vRP, vHT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vHP = position; vRP = (uToRoot * vec4(position, 1.0)).xyz;
      {
        vec3 d = mix(vec3(0.0, -0.3, -1.0), vec3(0.0, -1.0, -0.35), smoothstep(0.45, 0.75, vRP.z));
        d = mix(d, vec3(0.0, -1.0, 0.0), smoothstep(0.82, 0.62, vRP.y));
        vec3 hT = mat3(uFromRoot) * d;
        #ifdef USE_SKINNING
          hT = (skinMatrix * vec4(hT, 0.0)).xyz;
        #endif
        vHT = normalize(normalMatrix * hT);
      }`);
    sh.fragmentShader = 'uniform vec3 uPR;\nuniform vec4 uFx;\nuniform float uPts, uGrime, uWet;\nvarying vec3 vHP, vRP, vHT;\nfloat hWet, hMud, hDust;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
      {
        // 元の絵の強い白黒を抑え、広い濃淡だけで毛色と筋肉の丸みを見せる。
        vec3 r = vRP;
        vec4 texel = texture2D(map, vMapUv);
        float shade = clamp(dot(texel.rgb, vec3(0.3, 0.59, 0.11)) / 0.214, 0.8, 1.15);
        diffuseColor.rgb = diffuse * shade;
        float legs = (1.0 - smoothstep(0.24, 0.55, r.y)) * clamp(uPts, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), uPR, legs);
        diffuseColor.rgb *= 1.0 - smoothstep(1.15, 1.3, r.y) * 0.1;
        diffuseColor.rgb *= 1.0 - smoothstep(1.65, 1.82, r.z) * 0.3;
        float flank = (1.0 - smoothstep(0.95, 1.18, r.y)) * smoothstep(0.65, 0.9, r.y);
        diffuseColor.rgb *= 1.0 + flank * uFx.z * 0.12;
        // 汚れは脚先に薄く広げる。胸の白い泡・塩・細かな泥の点は描かない。
        hMud = (1.0 - smoothstep(0.08, 0.42, r.y)) * (0.25 + uGrime * 0.25);
        hDust = (1.0 - smoothstep(0.35, 0.8, r.y)) * uGrime * 0.12 * (1.0 - uWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.058, 0.04), hMud);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.13), hDust);
        hWet = max(uWet * 0.65, (1.0 - smoothstep(0.24, 0.4, abs(r.z))) * smoothstep(0.9, 1.05, r.y) * uGrime * 0.3);
        diffuseColor.rgb *= 1.0 - hWet * 0.12;
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.46, hWet);
        roughnessFactor = mix(roughnessFactor, 0.88, max(hMud, hDust));`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + sheenGlsl('vHT', '0.6 * (1.0 - hMud)'));
  };
  body.customProgramCacheKey = () => 'horsebody5';
  // 連続した束の面に、縦の柔らかな筋を付ける。透明な粒で穴を開けない。
  const hair = new THREE.MeshStandardMaterial({ color: mane, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  hair.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec2 vHairUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHairUv = uv;');
    sh.fragmentShader = 'uniform float uWet;\nvarying vec2 vHairUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      // 毛の筋：房の幅の中に太さの違う筋を重ね、根元は暗く、毛先は日に焼けて少し明るい。遠くでは筋を均す（ちらつかせない）
      float fade = 1.0 - smoothstep(0.15, 0.5, fwidth(vHairUv.x) * 9.0);
      float hx = vHairUv.x;
      float strand = 0.55 * cos(hx * 37.7 + sin(vHairUv.y * 5.0) * 1.3) + 0.3 * cos(hx * 88.0 + 1.7) + 0.15 * cos(hx * 151.0 + vHairUv.y * 3.0);
      diffuseColor.rgb *= 1.0 + 0.2 * strand * fade;
      diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.3, vHairUv.y)) * (1.0 + 0.14 * smoothstep(0.6, 1.0, vHairUv.y));
      // 房の縁は薄く暗い（板の縁を見せない）
      diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.0, 0.25, min(hx, 1.0 - hx));
      diffuseColor.rgb *= 1.0 - uWet * 0.15;`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 毛の照り（Kajiya-Kay）：毛の向きは絵の縦（uv の v）の向き
        vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
        vec2 dux = dFdx(vHairUv), duy = dFdy(vHairUv);
        vec3 hT = normalize(dpx * duy.x - dpy * dux.x + 1e-6);
        hT = normalize(hT - normal * dot(normal, hT));
        vec3 hV = normalize(vViewPosition);
        float s1 = hStrandH(hT, directLight.direction, hV, 80.0), s2 = hStrandH(normalize(hT + normal * 0.3), directLight.direction, hV, 14.0);
        reflectedLight.directSpecular += directLight.color * (s1 * 0.06 + s2 * 0.05 * min(diffuseColor.rgb * 3.0 + 0.04, vec3(1.0))) * smoothstep(-0.2, 0.3, dot(normal, directLight.direction)) * fade;
      }
      #endif`);
    sh.fragmentShader = 'float hStrandH(vec3 T, vec3 L, vec3 V, float p) { vec3 H = normalize(L + V); float t = dot(T, H); return pow(sqrt(max(0.0, 1.0 - t * t)), p); }\n' + sh.fragmentShader;
  };
  hair.customProgramCacheKey = () => 'horsehair6';
  // 蹄：角質の暗い灰茶に、上から下へ伸びる成長の筋。蹄冠は毛の際で暗く、下は泥が固まる（日本の馬は蹄鉄を打たない）
  const shoe = new THREE.MeshStandardMaterial({ map: T.shoe_col, roughness: 0.62, color: 0x6a625a });
  const SU = { uGrime: GRIME, uWet: WET, ...rootU('shoe') };
  shoe.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = 'uniform mat4 uToRoot;\nvarying vec3 vRP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRP = (uToRoot * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec3 vRP;\nfloat hMud;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 r = vRP;
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float grow = hVn(vec3(r.x * 500.0, r.y * 18.0, r.z * 500.0)) * 0.6 + hVn(vec3(r.x * 1400.0, r.y * 40.0, r.z * 1400.0)) * 0.4;
        vec3 horn = vec3(0.085, 0.074, 0.062) * (0.75 + lum * 0.9) * (0.78 + grow * 0.44);
        // 蹄冠：上の縁は毛の際で暗く
        horn *= 1.0 - smoothstep(0.1, 0.13, r.y) * 0.4;
        diffuseColor.rgb = horn;
        // 下の縁の欠けと、固まった泥
        hMud = smoothstep(0.05, 0.0, r.y) * (0.5 + 0.5 * hVn(r * 120.0)) + smoothstep(0.82, 0.92, hVn(r * 200.0)) * 0.6;
        hMud = clamp(hMud * (0.5 + 0.5 * uGrime) + smoothstep(0.035, 0.0, r.y) * 0.4, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.07, 0.05), hMud * 0.85);
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.5, 0.95, hMud) * (1.0 - uWet * 0.4);`);
  };
  shoe.customProgramCacheKey = () => 'horsehoof';
  const eye = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08, metalness: 0 });
  // 面繋と手綱は同じ組紐の色と織り目。
  const bridle = ropeMat(st.tack);
  const m = { body, hair, shoe, eye, bridle };
  HR.mats.set(k, m);
  return m;
}
const TACK_GLOSS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 });
const TACK_MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
// 房の絹糸：縦に垂れる細い糸の筋と、糸に沿った照り
const TACK_SILK = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
// 馬具の使い込み：革と布の色むら・細かな皺と毛羽、漆の擦れ、上を向いた面の土埃（一色の板に見せない）
// gloss：漆（鞍・鐙）。角は擦れて下地が出て、平らな所は日の光が細く鋭く映る。金の縁・覆輪は金属の照り
function tackWear(m, gloss) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
    sh.vertexShader = 'varying vec3 vTP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTP = position;');
    let fs = 'uniform float uGrime, uWet;\nvarying vec3 vTP;\nfloat tGold, tEdge, tDust;\n' + HORSE_GLSL.replace(/hHb/g, 'tHb').replace(/hVn/g, 'tVn').replace(/hCurv/g, 'tCurv').replace(/hStrand/g, 'tStrand') + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float tn1 = tVn(vTP * 9.0), tn2 = tVn(vTP * 60.0), tn3 = tVn(vTP * 260.0);
      tGold = ${gloss ? 'smoothstep(0.12, 0.25, (vColor.r + vColor.g) * 0.5 - vColor.b) * smoothstep(0.25, 0.4, vColor.g)' : '0.0'};
      diffuseColor.rgb *= 0.8 + tn1 * 0.3 + (tn3 - 0.5) * ${gloss ? '0.04' : '0.14'};
      roughnessFactor = clamp(roughnessFactor + (tn2 - 0.5) * ${gloss ? '0.35' : '0.12'} + ${gloss ? 'smoothstep(0.6, 0.9, tn1) * 0.3' : '0.0'}, 0.05, 1.0);
      tEdge = 0.0;
      ${gloss ? `{
        // 角の擦れ：黒い漆は下地の茶、朱は黒い中塗りが覗く。金は明るく
        float cv = tCurv(normalize(vNormal), -vViewPosition);
        tEdge = smoothstep(25.0, 90.0, cv) * smoothstep(0.35, 0.65, tn2 * 0.7 + tn3 * 0.3);
        float red = smoothstep(0.1, 0.25, vColor.r - vColor.g);
        vec3 under = mix(vec3(0.16, 0.095, 0.05), vec3(0.05, 0.03, 0.025), red);
        diffuseColor.rgb = mix(diffuseColor.rgb, under, tEdge * 0.75 * (1.0 - tGold));
        diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * vec3(1.15, 1.02, 0.75) + tEdge * 0.1, vec3(1.0)), tGold);
        roughnessFactor = mix(roughnessFactor, 0.22 + tn3 * 0.2, tGold);
        roughnessFactor = mix(roughnessFactor, 0.6, tEdge * (1.0 - tGold));
      }` : `{
        // 布と革：細かな織り目の筋（縦横）と毛羽
        float wv = sin(vTP.x * 2400.0 + tn2 * 3.0) * sin((vTP.y + vTP.z) * 2400.0);
        float fw = length(fwidth(vTP)) * 2400.0;
        diffuseColor.rgb *= 1.0 + wv * 0.07 * (1.0 - smoothstep(0.5, 1.5, fw));
      }`}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.85, tGold);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        tDust = smoothstep(0.4, 0.9, up) * smoothstep(0.35, 0.8, tn1) * (0.25 + 0.2 * uGrime) * (1.0 - uWet * 0.7);
        // 下へ垂れる物（障泥・鐙・房の裾）は、蹄が跳ね上げた泥
        float spl = smoothstep(0.8, 0.9, tVn(vTP * 120.0)) * smoothstep(0.95, 0.6, vTP.y) * (0.3 + 0.7 * uGrime);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.155, 0.13), tDust);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.07, 0.05), spl * 0.7);
        tDust = max(tDust, spl);
        roughnessFactor = mix(roughnessFactor, 0.9, tDust);
        roughnessFactor *= 1.0 - uWet * 0.4;
      }`);
    if (gloss) fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 漆の艶：日の光が細く鋭く映る。金の縁は少し広く金色に
        vec3 Hd = normalize(directLight.direction + normalize(vViewPosition));
        float nh = clamp(dot(normal, Hd), 0.0, 1.0), nl = clamp(dot(normal, directLight.direction), 0.0, 1.0);
        float cc = (1.0 - tDust) * (1.0 - tEdge * 0.8);
        reflectedLight.directSpecular += directLight.color * nl * cc * (pow(nh, 260.0) * 1.3 * (1.0 - tGold) + pow(nh, 70.0) * 0.5 * tGold * vec3(1.0, 0.84, 0.52));
      }
      #endif`);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'tack2' + (gloss ? 'g' : 'm');
}
tackWear(TACK_GLOSS, true); tackWear(TACK_MATTE, false);
TACK_SILK.onBeforeCompile = (sh) => {
  sh.uniforms.uGrime = GRIME; sh.uniforms.uWet = WET;
  sh.vertexShader = 'varying vec3 vTP, vTT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTP = position; vTT = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));');
  sh.fragmentShader = 'uniform float uGrime, uWet;\nvarying vec3 vTP, vTT;\nfloat sFib;\n' + HORSE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      // 糸の束：縦に長い揺らぎ（1mm ほどの糸と、数mm の束）。遠くでは消す
      vec3 q = vec3(vTP.x * 900.0, vTP.y * 18.0, vTP.z * 900.0);
      float fw = length(fwidth(vTP)) * 900.0, fade = 1.0 - smoothstep(0.5, 1.4, fw);
      sFib = mix(0.5, hVn(q) * 0.6 + hVn(q * vec3(0.3, 1.0, 0.3) + 4.0) * 0.4, fade);
      diffuseColor.rgb *= 0.72 + sFib * 0.55;
      // 房の裾は埃と泥で汚れ、濡れると暗い
      float dirt = smoothstep(0.95, 0.7, vTP.y) * (0.3 + 0.7 * hVn(vTP * 80.0)) * (0.3 + 0.6 * uGrime);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.09, 0.07), dirt * 0.5);
      diffuseColor.rgb *= 1.0 - uWet * 0.25;
    }`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + sheenGlsl('vTT', '0.9 + sFib * 1.4'));
};
TACK_SILK.customProgramCacheKey = () => 'tacksilk';

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
function tassel(G, S, x, y, z, st, len, big) {
  const r = big ? 0.04 : 0.03;
  const k = r + '|' + len;
  if (!TASSEL.has(k)) {
    // 結びの下から縦へ開く八つの糸束。丸い裾で閉じず、長さを少しずつ変える。
    const parts = [];
    parts.push(colGeo(tf(new THREE.SphereGeometry(r * 0.3, 6, 4), 0, -0.018, 0), 0xffffff));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8, l = len * (0.94 + (i % 3) * 0.035);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * r * 0.16, -0.028, Math.sin(a) * r * 0.16), new THREE.Vector3(Math.cos(a) * r * 0.5, -l * 0.55, Math.sin(a) * r * 0.5), new THREE.Vector3(Math.cos(a) * r * 0.8, -l, Math.sin(a) * r * 0.8));
      parts.push(colGeo(new THREE.TubeGeometry(curve, 4, r * 0.19, 3, false), 0xffffff));
    }
    const g = mergeG(parts);
    TASSEL.set(k, g);
  }
  S.push(colGeo(tf(TASSEL.get(k).clone(), x, y - 0.006, z), st.tassels));
  if (big) G.push(colGeo(tf(new THREE.SphereGeometry(0.016, 8, 6), x, y - 0.008, z), 0xc9a24a));
}
function tackGeometry(st) {
  const key = [st.saddle, st.rim, st.cushion, st.aori, st.tack, st.tassels, st.big].join('|');
  if (HR.tack.has(key)) return HR.tack.get(key);
  const big = !!st.big;
  const out = {};
  // 鞍褥・下鞍の布は日と汗で褪せる：羽織の鮮やかな色のままにせず、くすんだ土色へ寄せて暗める（青く浮かない）
  const cushion = new THREE.Color(st.cushion ?? 0x3a2a20).lerp(new THREE.Color(0x4a4034), 0.5).multiplyScalar(0.82).getHex();
  // 鞍（背の骨）
  {
    const G = [], M = [];
    const ex = { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 };
    const front = saddleBow(0.2, 0.33, 0.1, 0.12);
    const back = saddleBow(0.215, 0.29, 0.1, 0.11);
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
    M.push(colGeo(tf(cu, 0, 1.335, -0.01), cushion));
    // 下鞍（背を覆う布）：胴の丸みに沿う
    const sh = new THREE.CylinderGeometry(0.262, 0.262, 0.5, 22, 3, true, Math.PI - 1.48, 2.96);
    sh.rotateX(Math.PI / 2); sh.scale(1, 1.06, 1);
    // 下鞍は薄い布。裾のしわと背のくびれを作り、白い円筒の塊に見せない。
    const sp = sh.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const edge = Math.min(1, Math.abs(x) / 0.262);
      const fold = 0.008 * Math.sin(z * 42 + edge * 3) * edge * edge;
      sp.setXYZ(i, x * (1 - 0.045 * Math.cos(z * 9)), y + fold, z);
    }
    sh.computeVertexNormals();
    M.push(colGeo(tf(sh, 0, 1.0, -0.01), cushion));
    // 障泥（泥よけ）：鞍の下に左右へ大きく垂れる。縁は紐の色
    for (const sd of [1, -1]) {
      // 革の障泥：胴の丸みに沿って曲がり、裾は外へ少し開く。下の角は丸い。縁は紐で、面は使い込んだ革のむら（平らな四角い板に見せない）
      const P = [], C = [], IX = [], nu = 14, nv = 10;
      const cloth = _lin(st.aori).lerp(_lin(cushion), 0.42), hem = _lin(st.tack).lerp(cloth, 0.5), c = new THREE.Color();
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, e = 2 * u - 1;
        // 下の角を丸める：裾の両端ほど短い
        const vv = v * (1 - 0.32 * Math.pow(Math.abs(e), 5));
        const z = e * 0.3;
        const x = sd * (0.262 - 0.05 * e * e * (1 - vv) + Math.sin(vv * Math.PI * 0.6) * 0.03 + vv * vv * 0.03 + Math.sin(u * Math.PI * 5 + sd) * vv * vv * 0.006);
        const y = 1.15 - vv * 0.47 + vv * vv * 0.02;
        P.push(x, y, z - 0.06);
        const edge = Math.min(u, 1 - u, (1 - v) * 0.6) ;
        const hemK = 1 - THREE.MathUtils.smoothstep(edge, 0.03, 0.07);
        const mott = 0.86 + 0.18 * Math.sin(u * 23.1 + v * 7.3) * Math.sin(v * 17.7 - u * 5.1) + 0.06 * Math.sin(u * 61 + v * 43);
        // 縁の内に一筋の型押しの線
        const line = Math.abs(edge - 0.11) < 0.012 ? 0.75 : 1;
        c.copy(cloth).multiplyScalar(mott * line * (1 - 0.18 * v)).lerp(hem, hemK);
        C.push(c.r, c.g, c.b);
        if (i < nu && j < nv) { const a = j * (nu + 1) + i; IX.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1); }
      }
      const a = new THREE.BufferGeometry();
      a.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); a.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      a.setIndex(IX); a.computeVertexNormals(); M.push(a.toNonIndexed());
    }
    out.seat = [mergeG(G), mergeG(M)];
  }
  // 胸繋（胸の骨）：鞍の前から胸の前を回る。房を下げる
  {
    const G = [], M = [], S = [];
    const pts = [[0.2, 1.17, 0.16], [0.235, 1.07, 0.36], [0.19, 0.98, 0.54], [0.1, 0.945, 0.63], [0, 0.94, 0.655]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    M.push(colGeo(strap(all, 0.013), st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const n = big ? 7 : 5;
    for (let i = 0; i < n; i++) { const p = cv.getPointAt(0.3 + 0.4 * i / (n - 1)); tassel(G, S, p.x, p.y - 0.01, p.z, st, big ? 0.2 : 0.14, big); }
    out.chest = [G.length ? mergeG(G) : null, mergeG(M), mergeG(S)];
  }
  // 尻繋（腰の骨）：鞍の後ろから尻を回り、尾の下を通る。脇に房（厚総）を下げる
  {
    const G = [], M = [], S = [];
    const pts = [[0.2, 1.16, -0.22], [0.25, 1.12, -0.42], [0.262, 1.06, -0.6], [0.17, 1.03, -0.75], [0, 1.03, -0.815]];
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    M.push(colGeo(strap(all, 0.014), st.tack));
    const cv = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    const ts = big ? [0.08, 0.14, 0.2, 0.26, 0.32, 0.68, 0.74, 0.8, 0.86, 0.92] : [0.12, 0.22, 0.32, 0.68, 0.78, 0.88];
    for (const t of ts) { const p = cv.getPointAt(t); tassel(G, S, p.x * 1.03, p.y - 0.01, p.z, st, big ? 0.26 : 0.17, big); }
    out.hip = [G.length ? mergeG(G) : null, mergeG(M), mergeG(S)];
  }
  HR.tack.set(key, out);
  return out;
}
// 鐙（舌長鐙）：足裏の面を原点に、長い舌と鳩胸を共有する
let STIRRUP = null;
function stirrupGeo() {
  if (STIRRUP) return STIRRUP;
  const G = stirrupParts().map(([g, color]) => colGeo(g.clone(), color));
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
const RAIL = ['idle1', 'idle2', 'idle3', 'walk', 'walkL', 'walkR', 'trot', 'gallop', 'gallopL', 'gallopR', 'run', 'stop', 'buck1', 'death'];
function makeRealHorse() {
  const holder = new THREE.Group();
  holder.scale.setScalar(HS); holder.position.x = HX;
  const sc = skClone(HR.scene);
  holder.add(sc);
  const R = { holder, sc, bones: {}, meshes: {}, act: {}, extra: new THREE.Group(), on: false, style: null, tack: [], w: {}, t: {} };
  sc.traverse((o) => {
    if (o.isBone) R.bones[o.name] = o;
    if (o.isSkinnedMesh) {
      R.meshes[o.name.replace(/^horse_|_hi$/g, '')] = o; o.castShadow = true; o.receiveShadow = true;
      // 画面の外の馬は描かない：立ち姿の形の球を 1.6 倍＋0.5m に広げた球で判定（駆け・頭を下げる動きでも収まる。三角 1 万の馬が画面の外で 2〜4 頭描かれていた）
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (bs && isFinite(bs.radius)) { o.boundingSphere = new THREE.Sphere(bs.center.clone(), bs.radius * 1.6 + 0.5); o.frustumCulled = true; }
      else o.frustumCulled = false;
    }
  });
  if (HR.bridle && R.meshes.bridle) {
    // 根元のメートルで作った面繋を、鞍と同じく骨の子にする。
    // 輸入した面繋の結び行列を通すと、縮尺と支点が重なり、輪だけ空へ飛んでいた。
    const old = R.meshes.bridle;
    old.visible = false;
    const bridle = new THREE.Mesh(HR.bridle, old.material);
    bridle.matrixAutoUpdate = false;
    bridle.matrix.copy(HR.restInv[HEAD_B]);
    bridle.castShadow = true; bridle.receiveShadow = true; bridle.frustumCulled = false;
    R.bones[HEAD_B].add(bridle);
    R.meshes.bridle = bridle;
  }
  // 遠めは面を減らした形（影を描く時も）
  for (const k of ['body', 'hair']) {
    const m = R.meshes[k], hi = m.geometry, lo = HR.lo[k];
    m.onBeforeRender = (r, s, cam) => {
      const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
      const L = HORSE.lod;   // 低（携帯）は細かい形を 8m の内だけに（小さい画面では見分けが付かない）
      const want = !cam.isOrthographicCamera && d2 < L * L ? hi : lo;
      if (m.geometry !== want) m.geometry = want;
    };
  }
  R.mixer = new THREE.AnimationMixer(sc);
  // 根の骨（足もとの真ん中）は録った動きが触らない。体の傾きと弾みはここを回して付け、毎コマ立ち姿へ戻す
  const rb = R.bones.BN_Root_01_01; R.root0 = { q: rb.quaternion.clone(), p: rb.position.clone() };
  for (const k of RAIL) { const a = R.mixer.clipAction(HR.clips[k]); a.play(); a.enabled = false; a.timeScale = 0; R.act[k] = a; R.w[k] = 0; R.t[k] = Math.random() * HR.clips[k].duration; }
  // 鐙・力革・手綱（馬の根元の座標で毎コマ置く）
  const sg = stirrupGeo();
  R.stir = [new THREE.Mesh(sg, TACK_GLOSS), new THREE.Mesh(sg, TACK_GLOSS)];
  R.leather = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  R.rein = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  // 手綱は二つに折って、真ん中をたるませる（張った棒に見せない）
  R.rein2 = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  // 拳の中を通る所と、拳から垂れる余り
  R.reinIn = [new THREE.Mesh(ROPE, TACK_MATTE), new THREE.Mesh(ROPE, TACK_MATTE)];
  R.reinTail = [0, 1, 2, 3].map(() => new THREE.Mesh(ROPE, TACK_MATTE));
  for (const m of [...R.stir, ...R.leather, ...R.rein, ...R.rein2, ...R.reinIn, ...R.reinTail]) { m.castShadow = true; m.frustumCulled = false; R.extra.add(m); }
  return R;
}
let redWhiteCord = null;
function redWhiteRopeMat() {
  if (!redWhiteCord) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'); cx.fillStyle = '#f3e7d4'; cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#b52c20'; cx.lineWidth = 16;
    for (let i = -64; i <= 128; i += 32) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 64, 64); cx.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 16);
    redWhiteCord = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }
  return redWhiteCord;
}
const ropeMats = new Map();
function ropeMat(hex) { if (!ropeMats.has(hex)) ropeMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, map: braidedCordMap(), roughness: 0.8 })); return ropeMats.get(hex); }
function dressHorse(R, st) {
  if (R.style === st) return;
  R.style = st;
  const M = horseMaterials(st);
  R.meshes.body.material = M.body; R.meshes.hair.material = M.hair; R.meshes.shoe.material = M.shoe; R.meshes.eye.material = M.eye; R.meshes.bridle.material = M.bridle;
  for (const m of R.tack) m.parent && m.parent.remove(m);
  R.tack = [];
  const T = tackGeometry(st);
  for (const [bn, key] of [[SEAT_B, 'seat'], [CHEST_B, 'chest'], [HIP_B, 'hip']]) {
    const [g, mt, sk] = T[key];
    for (const [geo, mat] of [[g, TACK_GLOSS], [mt, TACK_MATTE], [sk, TACK_SILK]]) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      // 骨の子に：骨の立ち姿の逆（骨は根元の座標で HS 倍されているので、その分も戻す）
      m.matrixAutoUpdate = false;
      m.matrix.copy(HR.restInv[bn]);
      m.castShadow = true; m.frustumCulled = false;
      R.bones[bn].add(m); R.tack.push(m);
    }
  }
  for (const m of R.leather) m.material = ropeMat(st.tack);
  for (const m of [...R.rein, ...R.rein2, ...(R.reinIn || []), ...(R.reinTail || [])]) m.material = st.reins ? redWhiteRopeMat() : ropeMat(st.tack);
}

// ---- 動かす ----
const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hM = new THREE.Matrix4();
const _hin = new THREE.Vector3(), _hout = new THREE.Vector3(), _hv3 = new THREE.Vector3(), _hv4 = new THREE.Vector3(), _hv5 = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 動きを 1 倍で回した時に、地面を踏む蹄が後ろへ送られる速さ（m/s。録った動きの蹄を測った値）。速さ ÷ これで回すと蹄が滑らない
// 並足 〜2m/s、速歩 〜4.6、駆歩 〜7.5、その先が襲歩
const WALK_V = 0.88, TROT_V = 1.0, GALLOP_V = 3.55, RUN_V = 4.3;
const FORE_KNEE = ['BN_l_Forearm_040_041', 'BN_R_Forearm_045_047'], FORE_CANNON = ['BN_L_Hand_041_042', 'BN_R_Hand_046_048'];
const NOSE_B = ['BN_L_Nose_031_030', 'BN_R_Nose_032_031'];
// 世界の上下に骨を動かす（根の骨の弾み）
function liftWorld(bone, dy) { bone.getWorldPosition(_hv); _hv.y += dy; bone.position.copy(bone.parent.worldToLocal(_hv)); }
// 竿立ち：倒れる動き（death）の頭の所（前脚を上げて立ち上がる）を使う
const REAR_PEAK = 1.02;
const _hr = new THREE.Vector3(), _hf = new THREE.Vector3();
const TAIL_B = ['BN_Tail_00_061_067', 'BN_Tail_01_062_068', 'BN_Tail_02_063_069', 'BN_Tail_03_064_070', 'BN_Tail_04_065_071'];
const MANE_B = ['BN_Hair_00_08_08', 'BN_Hair_01_09_09', 'BN_Hair_02_010_010', 'BN_Hair_03_013_013', 'BN_Hair_04_014_00', 'BN_Hair_05_015_014', 'BN_Hair_06_033_032', 'BN_Hair_07_034_033', 'BN_Hair_08_035_034', 'BN_Hair_09_036_035', 'BN_Hair_10_037_036'];
function driveHorse(h, dt, speed) {
  const H = h.userData.horse, R = H.real;
  if (window.__apx?.noskin && R.probePoseReady) return;
  R.probePoseReady = true;
  H.speed = speed;
  const clips = HR.clips, B = R.bones, root = B.BN_Root_01_01;
  root.quaternion.copy(R.root0.q); root.position.copy(R.root0.p);
  // 向きの変わり（曲がる速さ）と、止まりかけ
  const yaw = h.rotation.y + (h.parent ? h.parent.rotation.y : 0);
  let dy = yaw - (R.yaw ?? yaw); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  R.yaw = yaw;
  R.turn = (R.turn || 0) + ((dt > 0 ? dy / dt : 0) - (R.turn || 0)) * Math.min(1, dt * 5);
  const decel = dt > 0 ? ((R.prev ?? speed) - speed) / dt : 0;
  R.prev = speed;
  // 速さの変わり（+ で踏み出し、- で踏ん張り）をならす
  if (dt > 0) R.acc = (R.acc || 0) + (Math.max(-12, Math.min(12, -decel)) - (R.acc || 0)) * Math.min(1, dt * 6);
  R.buckle = 0; R.paw = 0;
  // 一度きりの動き：倒れる・竿立ち・驚いて跳ねる・急に止まる
  let one = null;
  // 倒れ方：止まっている時に撃たれた馬は半ばが棹立ちになってから横へ倒れる。駆けていた馬は前の膝から崩れ、勢いでのめって倒れる
  if (H.dead) { if (R.oneK !== 'death') { R.oneK = 'death'; R.oneT = 0; R.dieV = Math.max(speed, (R.hiSpd || 0) * 0.8); R.dieRear = R.dieV < 1.5 && Math.random() < 0.5; } H.deadT += dt; }
  if (!H.dead) {
    // 泥の槍列では、棹立ちと跳ね馬の録った動きで全身を持ち上げない。
    // 指定のある戦だけ、首を引いて踏ん張る。足運び・討死・当たりはそのまま。
    const steady = WORLD?.def.steadyHorseReactions;
    if (steady && (H.rear > 0 || H.spook)) {
      R.flinch = 0.65; H.rear = 0; H.spook = 0;
    }
    if (steady && (R.oneK === 'rear' || R.oneK === 'buck1')) R.oneK = null;
    // 続けて突かれても立ち上がりを巻き戻さない。着地して体勢を戻してから次に驚く。
    R.rearCooldown = Math.max(0, (R.rearCooldown || 0) - dt);
    if (H.rear > (R.lastRear || 0) + 0.05 && !R.oneK && R.rearCooldown <= 0) { R.oneK = 'rear'; R.oneT = 0; R.rearHold = 0.12 + Math.random() * 0.18; R.rearCooldown = 3.4; }
    else if (H.spook) { H.spook = 0; if (!R.oneK) { R.oneK = 'buck1'; R.oneT = 0; } }
    else if (!R.oneK && (R.hiSpd || 0) > 4.2 && speed < 3 && decel > 3.5) { R.oneK = 'stop'; R.oneT = 0; }   // 駆けていて急に止まる：尻を沈めて滑り止まる
  }
  R.lastRear = H.rear; H.rear = Math.max(0, H.rear - dt);
  R.hiSpd = Math.max(speed, (R.hiSpd || 0) - dt * 6);
  let oneW = 0;
  if (R.oneK) {
    R.oneT += dt;
    const t = R.oneT;
    if (R.oneK === 'death') {
      one = 'death';
      if (R.dieRear) { R.t.death = Math.min(clips.death.duration - 0.02, t); oneW = Math.min(1, t / 0.2); }
      else {
        // 棹立ちの所を飛ばし、崩れ落ちる所から（駆けていたほど速く）。はじめの一瞬は前の膝が折れて、鼻先から沈む
        R.t.death = Math.min(clips.death.duration - 0.02, 1.3 + t * (1 + Math.min(0.35, R.dieV * 0.04)));
        oneW = smooth(0, 0.45, t);
        R.buckle = (t < 0.28 ? t / 0.28 : Math.max(0, 1 - (t - 0.28) / 1.0)) * Math.min(1, 0.45 + R.dieV * 0.08);
      }
    } else if (R.oneK === 'rear') {
      // 立ち上がって（0.7 秒）、宙で前脚を掻きながら少し留まり、下りる（0.65 秒）。上がり下りは初めと終わりをゆるく
      one = 'death';
      const up = 0.7, hold = R.rearHold || 0.3, down = 0.65, e = (x) => x * x * (3 - 2 * x);
      const peak = REAR_PEAK * 0.78;
      R.t.death = t < up ? peak * e(t / up) : t < up + hold ? peak : peak * (1 - e(Math.min(1, (t - up - hold) / down)));
      R.paw = smooth(up * 0.5, up, t) * (1 - smooth(up + hold, up + hold + down * 0.5, t));
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
  // 足運び：立つ → 並足（四拍）→ 速歩（対角の二拍）→ 駆歩（三拍）→ 襲歩（四拍の全速）。並足と駆歩は曲がる時に左右へ傾いた動き
  const mv = smooth(0.12, 0.45, speed);
  const tro = smooth(1.4, 2.1, speed), gal = smooth(4.2, 5.0, speed), full = smooth(7.0, 8.0, speed);
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
  const wk = mv * (1 - tro) * rest, tw = mv * tro * (1 - gal) * rest, gl = mv * gal * (1 - full) * rest, rw = mv * full * rest;
  W.walk = wk * trC; W.walkL = wk * trL; W.walkR = wk * trR;
  W.trot = tw;
  W.gallop = gl * trC; W.gallopL = gl * trL; W.gallopR = gl * trR;
  W.run = rw;
  if (one) W[one] = (W[one] || 0) + oneW;
  // 時間：どの足運びも、蹄の送りが地面の速さと同じになるように回す（左右の動きは同じ時間にそろえる）。
  // 足運びの幅の外では使われないので、止めどころはその幅に合わせて広めに
  const ts = (v, lo, hi) => Math.max(lo, Math.min(hi, speed / v));
  R.t.walk = (R.t.walk + dt * ts(WALK_V, 0.55, 2.4)) % clips.walk.duration;
  R.t.trot = (R.t.trot + dt * ts(TROT_V, 1.2, 5.2)) % clips.trot.duration;
  R.t.gallop = (R.t.gallop + dt * ts(GALLOP_V, 1.1, 2.4)) % clips.gallop.duration;
  R.t.run = (R.t.run + dt * ts(RUN_V, 1.5, 3.4)) % clips.run.duration;
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
  _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
  _hf.setFromMatrixColumn(h.matrixWorld, 2).normalize();
  if (!H.dead && R.flinch > 0) {
    R.flinch = Math.max(0, R.flinch - dt);
    const k = Math.sin(R.flinch / 0.65 * Math.PI);
    rotWorld(B.BN_Neck_00_06_06, _hr, -0.12 * k);
  }
  if (!H.dead && dt > 0) {
    // 速歩の弾み：対角の脚が踏む真ん中で沈み、宙に浮く所で上がる（一回りに二度）。乗り手も鞍ごと弾む
    if (tw > 0.01) liftWorld(root, -0.03 * Math.cos(4 * Math.PI * (R.t.trot / clips.trot.duration - 0.45)) * tw);
    // 曲がる時は、速さと曲がりの強さに応じて内へ傾く（足もとを軸に）。傾いた動きの無い速歩・襲歩は全部ここで、並足・駆歩は録った傾きに足す
    const lean = Math.max(-0.26, Math.min(0.26, Math.atan(speed * R.turn / 9.8)));
    R.lean = (R.lean || 0) + (lean - (R.lean || 0)) * Math.min(1, dt * 4);
    rotWorld(root, _hf, -R.lean * (tw + rw + 0.45 * (wk + gl)));
    // 前後：止まる時は尻を沈めて前を起こし（踏ん張り）、首を上げる。駆け出す時は前へ体を預け、首を伸ばす
    const brake = mv * clamp01(-(R.acc || 0) / 7) * rest, push = mv * clamp01((R.acc || 0) / 5) * rest;
    rotWorld(root, _hr, -0.07 * brake + 0.035 * push);
    rotWorld(B.BN_Neck_00_06_06, _hr, -0.28 * brake + 0.12 * push);
    // 曲がる方へ首を向ける
    rotWorld(B.BN_Neck_01_07_07, _up, Math.max(-0.14, Math.min(0.14, R.turn * 0.12)) * mv * rest);
  }
  // 撃たれて崩れる：前の膝が折れて、鼻先から沈む
  if (R.buckle > 0.001) {
    rotWorld(root, _hr, 0.3 * R.buckle);
    for (let i = 0; i < 2; i++) { rotWorld(B[FORE_KNEE[i]], _hr, -0.3 * R.buckle); rotWorld(B[FORE_CANNON[i]], _hr, (1.3 - i * 0.2) * R.buckle); }
  }
  // 棹立ちの宙で、前脚を交互に掻き、首を振る
  if (R.paw > 0.01) {
    const pt = R.oneT * 10;
    for (let i = 0; i < 2; i++) { rotWorld(B[FORE_KNEE[i]], _hr, Math.sin(pt + i * Math.PI) * 0.35 * R.paw); rotWorld(B[FORE_CANNON[i]], _hr, (0.5 + 0.4 * Math.sin(pt + i * Math.PI + 1)) * R.paw); }
    rotWorld(B[HEAD_B], _hr, Math.sin(R.oneT * 6.5) * 0.14 * R.paw);
  }
  // 息が上がった馬：長く駆けると息が上がり（H.blow 0..1）、止まると首を下げて、速い息で首が上下する。だんだん戻る
  H.blow = clamp01((H.blow || 0) + dt * (speed > 3.2 ? 1 / 22 : speed > 1.2 ? -1 / 60 : -1 / 35));
  if (!H.dead && H.blow > 0.05 && oneW < 0.5 && dt > 0) {
    const b = H.blow * (1 - oneW), still = 1 - gal * 0.7;
    H.brPh = (H.brPh || 0) + dt * Math.PI * 2 * (0.45 + b * 1.1);
    const heave = Math.sin(H.brPh) * 0.035 * b;
    _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
    const down = (0.34 * b * still + heave);
    rotWorld(R.bones.BN_Neck_00_06_06, _hr, down * 0.45);
    rotWorld(R.bones.BN_Neck_01_07_07, _hr, down * 0.35);
    rotWorld(R.bones.BN_Neck_02_011_011, _hr, down * 0.2);
    // 頭は首ほど下げない（鼻先が胸に付かないよう、少し起こす）
    rotWorld(R.bones[HEAD_B], _hr, -0.1 * b * still);
  }
  // 息づかい：腹が膨らんで縮み、鼻の穴が開く。駆ける時は一歩に一息、立てば息の荒さ（H.blow）で速く深く
  if (!H.dead) {
    let br;
    if (gl + rw > 0.5) br = Math.sin(Math.PI * 2 * (rw > gl ? R.t.run / clips.run.duration : R.t.gallop / clips.gallop.duration));
    else { R.brPh2 = ((R.brPh2 || 0) + dt * Math.PI * 2 * (0.22 + (H.blow || 0) * 0.9)) % (Math.PI * 2); br = Math.sin(R.brPh2); }
    if (B.BN_Stomach_050_053) B.BN_Stomach_050_053.scale.setScalar(1 + br * (0.012 + 0.03 * (H.blow || 0) + 0.015 * (gl + rw)));
    const fl = 1 + Math.max(0, br) * (0.08 + 0.45 * (H.blow || 0));
    for (const nm of NOSE_B) if (B[nm]) B[nm].scale.setScalar(fl);
  }
  // 尾と鬣：風下へなびき、突風で震える。駆けると尾は後ろへ持ち上がって流れ、鬣は細かくはためく
  if (!H.dead && dt > 0 && oneW < 0.9) {
    H.clk = (H.clk || 0) + dt;
    const t = H.clk, wg = Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1));
    _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
    _hf.setFromMatrixColumn(h.matrixWorld, 2).normalize();
    const wr = WIND_STATE.dirX * _hr.x + WIND_STATE.dirZ * _hr.z, run = smooth(3, 10, speed);
    for (let k = 0; k < TAIL_B.length; k++) {
      const bn = R.bones[TAIL_B[k]]; if (!bn) continue;
      const fl = Math.sin(t * (2.1 + run * 4) + k * 0.8 + (H.seed || 0)) * (0.04 * wg + 0.05 * run);
      rotWorld(bn, _up, -(wr * 0.1 * wg * (1 - run * 0.6) + fl) * (0.6 + k * 0.2));
      if (k < 3) rotWorld(bn, _hr, run * 0.22);
    }
    for (let k = 0; k < MANE_B.length; k++) {
      const bn = R.bones[MANE_B[k]]; if (!bn) continue;
      // 駆けるほど速く大きくはためき、首の先の毛ほど風を受けて後ろへ寝る
      const fl = (Math.sin(t * (3.3 + run * 8) + k * 1.3) + 0.35 * run * Math.sin(t * 17 + k * 2.1)) * (0.05 * wg + 0.13 * run);
      rotWorld(bn, _hf, wr * 0.12 * wg + fl);
      if (run > 0.05) rotWorld(bn, _hr, run * 0.12 * (0.5 + k / MANE_B.length));
    }
  }
  // 鞍の動き：骨の立ち姿からの変わり（馬の根元の座標）を、乗り手の入れ物の行列に
  R.holder.updateMatrix();
  R.holder.matrixWorld.copy(R.holder.matrix);
  R.sc.updateMatrixWorld(true);
  H.seat.multiplyMatrices(B[SEAT_B].matrixWorld, HR.restInv[SEAT_B]);
  // 手綱を握る手の置き所：鞍の前輪の上、腰より拳ふたつほど上（胸や顔の高さまで上げない）。馬の頭が前後すると、手もそれに引かれる
  _hM.multiplyMatrices(B[HEAD_B].matrixWorld, HR.restInv[HEAD_B]);         // 頭の骨の、立ち姿からの動き
  _hv2.copy(HR.head0).applyMatrix4(_hM);                                   // 頭の今の位置
  const headRest = _hv.copy(HR.head0).applyMatrix4(H.seat);                // 鞍と一緒に動いた時の頭の位置
  H.hand = (H.hand || new THREE.Vector3()).set(-0.05, 1.28, 0.26).applyMatrix4(H.seat).addScaledVector(_hv2.sub(headRest), 0.4);
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
      // 足首から足裏へ。鞍の上方向に下ろし、舌を踵の下まで延ばす。
      _rd.set(0, -0.085, 0).transformDirection(H.seat).multiplyScalar(0.085);
      _fa.add(_rd);
    } else _fa.set(sd * 0.3, u && u.mounted ? RIDE.y + 0.04 : 0.52, 0.1).applyMatrix4(H.seat);
    const st = R.stir[i];
    st.position.copy(_fa);
    st.quaternion.setFromRotationMatrix(H.seat);
    // 力革：鞍の脇から鐙の頭へ
    _fb.set(sd * 0.19, 1.3, 0.03).applyMatrix4(H.seat);
    _hv2.set(0, 0.2, 0.05).applyQuaternion(st.quaternion).add(_fa);
    ropeBetween(R.leather[i], _fb, _hv2, 0.012);
    // 手綱：銜から乗り手の左手へ（乗り手がいなければ首の上に掛ける）
    // 乗り手の手：手首ではなく拳の中（手のひらの真ん中）へ通す
    if (hum) { fistPoint(hum.bones, hum.reinTwo && (i ? H.bitR : H.bitL).x > 0 ? 'Right' : 'Left', _hand); _hand.applyMatrix4(_inv); }
    else if (u && u.mounted) _hand.copy(H.hand);
    else {
      // 乗り手のいない馬：手綱は銜から垂れて、胸の前の地面に届く（駆ける空馬は少し後ろへ流れて引きずる）
      const bt = i ? H.bitR : H.bitL, sp = Math.min(1, (H.speed || 0) / 6);
      _hand.set(bt.x * 0.6, 0.04 + sp * 0.25, bt.z - 0.25 - sp * 0.5);
    }
    {
      const bt = i ? H.bitR : H.bitL;
      let sag = 0.02;
      if (hum || (u && u.mounted)) {
        // 手綱の長さはゆっくりしか変わらない：馬が首を伸ばすと張り、首を戻すと緩んで垂れる
        const d = bt.distanceTo(_hand), rl = R.rl || (R.rl = [0, 0]);
        rl[i] = rl[i] ? rl[i] + (d * 1.007 - rl[i]) * 0.03 : d * 1.007;
        sag = Math.min(0.09, Math.max(0.004, 0.5 * Math.sqrt(Math.max(0, rl[i] * rl[i] - d * d))));
        // 曲がる時は内の手綱が張る（0 は +x の側）
        if (hum) sag *= 1 - 0.8 * Math.max(0, Math.min(1, (i ? -1 : 1) * (hum.turn || 0) / 0.8));
      }
      // 張りの強さ（0..1）：拳が引かれる（reinPose が読む）
      if (hum) H.reinTaut = Math.max(i ? H.reinTaut || 0 : 0, clamp01((0.02 - sag) / 0.016));
      // 乗り手の拳：手綱は小指の側から拳に入り、拳の中を通って人差し指と親指の間から出る。親指で押さえ、余りは拳の前へ垂れる
      let inP = _hand, outP = null;
      if (hum && R.reinIn) {
        const sdn = hum.reinTwo && (i ? H.bitR : H.bitL).x > 0 ? 'Right' : 'Left', HB = hum.bones;
        if (HB[sdn + 'HandPinky1'] && HB[sdn + 'HandIndex1']) {
          const L = handFrame(HB, sdn, _rF, _rA, _hv3);
          // 入る所：小指の付け根の外（手のひらの側）。出る所：人差し指の付け根の上（親指の下）
          _hin.copy(_ggw).addScaledVector(_rF, L * 0.85).addScaledVector(_rA, 0.05).addScaledVector(_hv3, L * 0.25).applyMatrix4(_inv);
          _hout.copy(_ggw).addScaledVector(_rF, L * 0.8).addScaledVector(_rA, -0.045).addScaledVector(_hv3, L * 0.3).applyMatrix4(_inv);
          inP = _hin; outP = _hout;
        }
      }
      _fb.copy(bt).lerp(inP, 0.5); _fb.y -= sag;
      ropeBetween(R.rein[i], bt, _fb, 0.0065);
      ropeBetween(R.rein2[i], _fb, inP, 0.0065);
      if (R.reinIn) {
        const show = !!outP;
        R.reinIn[i].visible = R.reinTail[i * 2].visible = R.reinTail[i * 2 + 1].visible = show;
        if (show) {
          ropeBetween(R.reinIn[i], inP, outP, 0.0065);
          // 余り：拳の前から垂れて輪になる（駆けると揺れる）。張ると余りは短く引き込まれる
          const sw_ = Math.sin((H.clk || 0) * 7 + i * 2) * 0.03 * Math.min(1, (H.speed || 0) / 6);
          _hv4.copy(outP); _hv4.y -= 0.11 + 0.05 * (1 - (H.reinTaut || 0)); _hv4.z += 0.06 + sw_; _hv4.x += (i ? 0.03 : -0.03);
          _hv5.copy(_hv4); _hv5.y -= 0.07; _hv5.z -= 0.08; _hv5.x += sw_ * 0.5;
          ropeBetween(R.reinTail[i * 2], outP, _hv4, 0.006);
          ropeBetween(R.reinTail[i * 2 + 1], _hv4, _hv5, 0.006);
        }
      }
    }
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
  R.yaw = undefined; R.prev = H.speed || 0; R.oneK = H.dead ? 'death' : null; R.oneT = H.dead ? H.deadT : 0; R.flinch = 0;
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
const horseCandidates = [], horseWanted = new Map();
let madeHorses = 0;
function updateHorses(rt) {
  madeHorses = 0;
  const on = HORSE.on && !rt.def?.noHorse && !(typeof location !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search)));
  if (on && !hrLoading && !rt.horseLoadPending) loadHorse();
  const want = horseWanted; want.clear();
  if (on && HORSE.ready) {
    const cam = rt.camera, cx = cam.position.x, cz = cam.position.z;
    // 馬の見た目は画質に関わらず写実。だが何頭を骨の入った馬にするかは、人と同じく画質なり（10/2 測って直す：
    //   姉川の騎馬で、携帯でも 40m の内の十頭あまりが一頭 2〜9万面・20〜37 回の描きのまま並び、一コマの三分の一を食っていた）
    const HQ = HORSE_Q.high;
    const cand = horseCandidates; cand.length = 0;
    let pxMade = 0;
    // 同じコマに毛色別の形をまとめて作らない。本人を先に、残りは一頭ずつ次のコマへ。
    const P = rt.player;
    if (P && P.horse && HR.proxy && !P.horse.userData.px) { applyProxy(P.horse); pxMade++; }
    // 兵でない馬（使番・戦ごとの飾りの馬）も、作られた順に本物の馬の形へ
    while (HR.proxy && HORSE_HOOK.made.length && pxMade < 1) { const h = HORSE_HOOK.made.pop(); if (!h.userData.px) { applyProxy(h); pxMade++; } }
    const add = (h, u, x, z, pri) => {
      if (!h || !h.userData.horse || h.visible === false) return;
      const d = Math.hypot(x - cx, z - cz), H = h.userData.horse;
      const lim = H.real ? HQ.far : HQ.near;
      if (d < lim || pri < 0) {
        let entry = h.userData.horseCandidate;
        if (!entry) entry = h.userData.horseCandidate = { h, u: null, d: 0, dist: 0 };
        entry.u = u; entry.d = pri === -2 ? -1e9 : pri < 0 ? -1 + d * 0.001 : d * pri; entry.dist = d; cand.push(entry);
      }
    };
    for (const u of rt.army.units) {
      if (u.gone || !u.mounted || !u.horse || (!u.alive && u.deadT > 30)) continue;
      if (HR.proxy && !u.horse.userData.px && pxMade < 1) { applyProxy(u.horse); pxMade++; }
      const named = u.look && (typeof u.look.face === 'string' && u.look.face.startsWith('g:') || u.type === 'busho');
      // 名のある武将の馬は本人の馬と同じ：60m までは必ず骨の入った馬に
      const near60 = named && Math.hypot(u.pos.x - cx, u.pos.z - cz) < (60);   // 低（携帯）は 20m まで
      add(u.horse, u, u.pos.x, u.pos.z, u.isPlayer ? -2 : near60 ? -1 : named ? 0.6 : 1);
    }
    if (P && P.horse && !P.mounted && P.horse.parent) add(P.horse, null, P.horse.position.x, P.horse.position.z, -2);
    // 降馬した後も、近くで倒れる途中の馬は同じ枠で描く。
    for (const o of rt.army.fallenHorses || []) if (o.h?.parent && o.t < 4) add(o.h, null, o.h.position.x, o.h.position.z, 1);
    // 乗り手を失って駆け回る馬
    for (const o of rt.army.looseHorses || []) if (o.h && o.h.parent) add(o.h, null, o.h.position.x, o.h.position.z, 1.2);
    cand.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cand.length && want.size < HQ.max; i++) want.set(cand[i].h, cand[i].u);
    if (HQ.must) for (let i = 0; i < cand.length && want.size < HQ.mustMax; i++) { const c = cand[i]; if (!want.has(c.h) && c.dist < HQ.must) want.set(c.h, c.u); }
  }
  for (const h of horsesOn) if (!want.has(h)) { detachReal(h); horsesOn.delete(h); }
  for (const h of want.keys()) {
    if (horsesOn.has(h)) continue;
    if (madeHorses >= 2 && !h.userData.horse.real) continue;   // 一コマに作るのは二頭まで（一コマが重くならないよう）
    if (!HR.pool.length) madeHorses++;
    attachReal(h); horsesOn.add(h);
  }
  return want;
}
export function horseCount() { return horsesOn.size; }
// 見本の画面（開発用）から：今の形の馬に骨の入った馬を付ける・鐙と手綱を置く
export function showHorse(h) { if (!HORSE.ready || !h.userData.horse) return false; attachReal(h); horsesOn.add(h); return true; }
// 見本の画面（開発用）から：今の形の馬を、切り分けた本物の馬の形にする
export function proxyHorse(h) { if (HR && HR.proxy) applyProxy(h); }
export function horseExtras(h, u) { if (h.userData.horse && h.userData.horse.real) placeHorseExtras(h, u); }
