// 人の処理：共有する体・骨・設定。外部向けの入口は humans.js。
import { S, MEM_TIGHT } from './settings.js';
import { namedKacchu } from './named_kacchu.js';
import { TIER } from './device_tier.js';
import * as THREE from 'three';
import { UNIT_MAT, soheiLook } from './units.js';

// 本物の骨の入った兵に替える範囲（本人とカメラの近く）。高 44m・中 36m・低 40m（以前は 60m 固定）。ARMY_REAL_NEAR は読み込みの名のまま残す。その先は、まとめて描く軽い兵（形は遠さで替わる）
// 記憶の少ない機械：iPhone（WebContent が 2048MB で切られる）。パソコンは保存済みの軽量設定で落とさない。
const memTight = () => MEM_TIGHT;
// 携帯だけ、骨入りの貸出枠と中景の細かな形の枠を分ける。
// 弱い端末は密集しても骨入りを十二人まで。他の兵は共有する全身の形で残す。
const SKIN_MAX = TIER.weak ? 12 : 40;
const MIDDLE_MAX = TIER.weak ? 24 : 80;
const SKIN_IN = 15;
const SKIN_OUT = 17;
const humanPool = new Set();
const humanBuilding = new Set();
const humanPoolKeys = new WeakMap();
// 本人と武将は一般兵の貸出枠・簡略化から外す。
const qualityKeeper = u => !!(u && (u.isPlayer || u.type === 'busho' || u.look && (u.look.hero || u.look.officer || isNamed(u.look))));
// 主人公の狙い・振り・鍔迫り合いの相手は、焼いた動きへ渡さない。
const skinOpponent = (player, u) => !!(player && u && u.alive &&
  (player.target === u || player.swing?.target === u || player.atk?.target === u || player.bind?.o === u));
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
    // 動きの差分器は同じ値を再度書かない。討死の上乗せを貸し出し先へ持ち越さない。
    if (h.poseReady) for (let i = 0; i < h.animB.length; i++) {
      h.animB[i].quaternion.copy(h.pose[i]); h.animB[i].updateMatrix();
    }
    // 遠近と顔の印は、今着ている形・胴丸・中の体の表示と一組。
    // 印だけ初期化すると、近くへ借り直した時に胴丸を戻す処理が飛び、頭と脚だけが残る。
    for (const k in h) if (k !== 'showAt' && k !== 'lodFar' && k !== 'scanOn' && (typeof h[k] === 'number' || typeof h[k] === 'boolean')) {
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
const realNear = () => (S.lowMem || TIER.weak ? 30 : 44);

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
const HUM_BUDGET_EARLY_SEC = 6;
const HUM = { fx: true, ready: false, primed: false, failed: false, on: true, near: 42, max: 64, far: 70, ik: 18, lite: 28, fine: 12, face: 15, lod: 15, shadow: 15, budget: 14, dead: 20, hiN: 24, faceN: 14 };
// 画質ごとの数は遠景用。本人・カメラの60m以内は画質によらず本物にする。
// must：この近さ（m）より内の兵は、上限を越えても必ず骨の入った人にする（カメラの前に軽い形の兵を出さない）。その分は遠い者から軽い形へ
// mustMax は姉川のように合戦が複数同時に組み合う戦で、間近の本物の人が一気に増えないよう控えめに（普段の一本道の合戦では max 止まりで届かない数）
const HUM_T = { high: { lod: 17, hiN: 40, faceN: 24, hiCap: 40, shadow: 11 }, mid: { lod: 8, hiN: 10, faceN: 4, hiCap: 5, shadow: 8 }, low: { lod: 15, hiN: 24, faceN: 14, hiCap: 10, shadow: 15 } };
const HUM_Q = { high: { near: 42, max: 70, must: 34, mustMax: 90 }, mid: { near: 32, max: 40, must: 29, mustMax: 80 }, low: { near: 9, max: 4, far: 12, face: 14 } };
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion();
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const m0 = new THREE.Matrix4();
const m1 = new THREE.Matrix4();

let SRC = null;      // 元の体（骨・形・動き・骨ごとの位置）
let HEAD = null;

// 表示中は次のコマまで譲り、画面が裏へ回っても支度を待ち続けない。
function preparationFrame() {
  return new Promise(resolve => {
    let timer, frame;
    const done = () => { clearTimeout(timer); if (frame !== undefined) cancelAnimationFrame(frame); resolve(); };
    timer = setTimeout(done, 50);
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(done);
  });
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

// MakeHuman の頭：作り分け（MH_VARS の順）の形を並べて持つ。座標は実写スキャンの頭と同じ（目 y 1.72・顎 -0.9・頭頂 4）
// 肌の絵は年ごとに三枚（若い・壮年・老い）。凹凸の絵は無い（形そのものが細かい）
// まばたきの形の差：目玉の中心 c・半径 R（頭の座標）。上まぶたの縁（中心から R の 0.12 上）を下まぶたの縁（0.28 下）の手前まで下ろす。
//   眉へ行くほど、目尻と目頭へ行くほど動きは小さく。下まぶたと目の下は動かさない
function blinkDelta(g, E) {
  const p = g.attributes.position, D = new Float32Array(p.count * 3), R = E.rad;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let n = 0;
  for (const c of [E.l, E.r]) for (let i = 0; i < p.count; i++) {
    const rx = (p.getX(i) - c[0]) / R, ry = (p.getY(i) - c[1]) / R, rz = (p.getZ(i) - c[2]) / R;
    if (ry < -0.12 || ry > 1.1 || Math.abs(rx) > 1.4 || rz < 0.2) continue;
    const w = (1 - sm(0.2, 1.0, ry)) * (1 - sm(0.75, 1.4, Math.abs(rx))) * sm(-0.12, 0.05, ry);
    if (w <= 0) continue;
    D[i * 3 + 1] = -0.35 * R * w;
    // 閉じたまぶたは目玉の丸みに沿って少し前へ
    D[i * 3 + 2] = 0.04 * R * w;
    n++;
  }
  return n ? new THREE.BufferAttribute(D, 3) : null;
}
const MH_VARS = ['若い・細面', '若い・丸顔', '壮年・角顔', '壮年・面長', '壮年・太り', '老い・痩せ'];
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
  const ex = gl.parser.json.extras || {};
  vars.forEach((g, vi) => {
    if (!g.attributes.uv) g.setAttribute('uv', uv); g.computeVertexNormals();
    if (exOK) {
      g.morphAttributes.position = EXN.map((n) => exG[n]); g.morphTargetsRelative = true;
      // まばたき（四つ目の形の差）：上まぶたを下まぶたの縁まで下ろす。読み込み時に一度だけ作る（素材は増やさない）
      const bl = ex.eyes && ex.eyes[vi] && blinkDelta(g, ex.eyes[vi]);
      if (bl) g.morphAttributes.position.push(bl);
    }
  });
  if (exOK && teeth.length && EXN.every((n) => teethEx[n])) for (const g of teeth) if (g) { g.morphAttributes.position = EXN.map((n) => teethEx[n]); g.morphTargetsRelative = true; g.computeVertexNormals(); }
  for (const t of sk) { t.flipY = false; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; }
  HEAD = { geo: vars[2], vars, col: sk[1], skins: sk, nrm: null, spec: null, k: 0.058, mh: true, eyes: ex.eyes, exMorph: exOK, teeth: exOK && teeth.length === vars.length ? teeth : null };
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
const isSohei = (L) => !!L && (!!L.sohei || L.hat === 'kato' || (L.hat === 'hachimaki' && L.cloth === 0xd8d2c2));
const isNamed = (L) => typeof L.face === 'string' && L.face.startsWith('g:');

// 人の作り方の段
// ・本人：部品を骨ごとに付ける（草摺・袖が揺れる、実写の顔）
// ・名のある武将：本物の胴丸（3Dスキャン）と実写の顔
// ・兵：甲冑の部品を一つの骨入りの形にまとめる（一人を描く回数が体と甲冑の二回で済む）。近くでは実写の顔に替える
// 人に着せる前の姿の整え（makeHuman と、前もって形を作る prefetchLook で同じにする）
function humanLook(look0) {
  let look = look0;
  const sohei = isSohei(look0);
  // 近景では全員に籠手。足軽は簡素な御貸具足と陣笠、武者は兜と面頬。
  if (!sohei && !look.kosode) {
    const warrior = (look.tier ?? 0) >= 1 || isNamed(look);
    look = { ...look, kote: 3, nanban: false,
      hat: warrior ? (String(look.hat || '').startsWith('kabuto') ? look.hat : 'kabuto') : 'jingasa',
      ...(warrior ? { menpo: look.menpo || 0x242522, menpoScan: look.menpo || 0x242522, menpoStyle: 'tare' }
        // 足軽の御貸具足の作り分け（gusoku_vars.js の loanWear）を済ませた人は、その漆と威糸のまま（全員を同じ色に塗り直さない）
        : look.loanWorn ? { menpo: null, menpoScan: null } : { armor: 0x292b27, lace: 0x373a32, menpo: null, menpoScan: null }) };
  }
  // 目の下頬は、実写の顔に沿わせて作る（兜の形の面は喉の垂だけにする。兵は近くで実写の顔に替えた時に付ける）
  // 面頬（半頬・目の下頬）は、実写の顔の形から打ち出す（units.js の遠目の面頬は平らな黒い板で、近くでは貼った板に見える）
  if (look.menpo && (look.menpoStyle === 'hanbo' || look.menpoStyle === 'full' || !look.menpoStyle) && !sohei) look = { ...look, menpoStyle: 'tare', menpoScan: look.menpo };
  // 僧兵：墨染めの直綴に五条袈裟、頭は裹頭（数人に一人は鉢巻か兜）。衣と袈裟の形は units.js の soheiLook・soheiBody
  if (sohei) look = soheiLook({ ...look, sohei: 1 });
  return look;
}
// 形を前もって作る一段（部品の形 → 遠い部品の形 → 束ねた形）。済んでいれば false
function shapesReady(u) { return u._hpreLook === u.look && u._hpre >= 3; }

// ---- 兵：部品を一つの骨入りの形にまとめる ----
// 骨の並び（まとめた形の骨）。sw… は揺れる部品の骨（草摺・袖・陣羽織・母衣）。顔はまとめず別に付ける（近くで実写の顔に替える）
const CB = ['Hips', 'Spine1', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
// swHat：笠（倒れた時に頭から落ちるので、頭の骨とは別の骨にしておく）
// swK0..11：草摺の板一枚ずつの骨（腿に押されて板ごとに跳ね、遅れて揺れる）
const XB = { swHips: 'Hips', swSodeP: 'Spine2', swSodeN: 'Spine2', swHaori: 'Spine2', swBack: 'Spine2', swHat: 'Head', swPole: 'Spine2', swK0: 'Hips', swK1: 'Hips', swK2: 'Hips', swK3: 'Hips', swK4: 'Hips', swK5: 'Hips', swK6: 'Hips', swK7: 'Hips', swK8: 'Hips', swK9: 'Hips', swK10: 'Hips', swK11: 'Hips' };
// 草摺の板の並び（units.js の bodyGeometry と同じ）：足軽は五枚、侍から七枚。板の真ん中の向き（前 +z が 0）
const kusaPlates = (L) => { const st = namedKacchu(L), np = (st?.kusazuriCount ?? L.kusazuriCount) === 12 ? 12 : (st?.domaru ?? L.domaru) ? 8 : (L.tier || 0) === 0 ? 5 : 7, off = np === 5 ? Math.PI / 5 : 0; return { np, off, c: (k) => (k / np) * Math.PI * 2 + off + Math.PI }; };
function plateOf(x, y, z, KP) {
  if (y > 0.885) return -1;   // 揺糸の帯は腰の骨のまま
  let a = Math.atan2(x, z) - KP.off - Math.PI;
  const st = (Math.PI * 2) / KP.np;
  let k = Math.round(a / st) % KP.np; if (k < 0) k += KP.np;
  return k;
}
const ALLB = [...CB, ...Object.keys(XB)];
const crowdGeos = new Map();
// 同じ骨でも、胴丸と体は着せる時の逆行列が違う。違う逆行列だけ別の参照枠を
// 一つの骨格に残す。重み付きの頂点を焼き直さず、元と同じ変形・法線・影を保つ。
const humanInv = [];
function humanBoneMap(names, inverses) {
  return names.map((nm, i) => {
    let at = ALLB.findIndex((n, j) => n === nm && humanInv[j].equals(inverses[i]));
    if (at < 0) { at = ALLB.length; ALLB.push(nm); humanInv.push(inverses[i]); }
    return at;
  });
}
// 束ねた人の形は「形」と「色」に分けて持つ：
//   形（position・normal・uv・skinIndex・skinWeight・index）は同じ甲冑の並びなら姿（色）が違っても一つを共有し、GPU にも一度しか送らない。
//   色（color・col2・mtl）だけ姿ごとに持つ（一頂点 10 byte）。前は姿ごとに全部（一頂点 84 byte）を作り、開戦後に 30 秒で 100MB 増えていた（iPhone の 2GB の壁）。
const crowdShapes = new Map();
if (typeof window !== 'undefined') window.__crowdDbg = () => ({ shapes: crowdShapes, geos: crowdGeos, stat: HSTAT });
const HSTAT = { made: 0, driven: 0, ms: 0, want: 0, makeMs: 0, makeN: 0, makeMax: 0, selectionFrames: 0, selectionScans: 0, borrowN: 0, crowdHit: 0, crowdMade: 0, shapeMade: 0 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export { memTight, SKIN_MAX, MIDDLE_MAX, SKIN_IN, SKIN_OUT, humanPool, humanBuilding, qualityKeeper, skinOpponent, humanPoolKey, pinHumanGeometries, borrowHuman, realNear, HUM_BUDGET_EARLY_SEC, HUM, HUM_T, HUM_Q, q0, v0, v1, v2, v3, m0, m1, SRC, HEAD, preparationFrame, gc, PART, prepBody, _fq, curlFingers, prepHead, prepHeadMH, restMatrix, attachBody, limbFit, fits, isSohei, isNamed, humanLook, shapesReady, XB, kusaPlates, plateOf, ALLB, crowdGeos, humanInv, humanBoneMap, crowdShapes, HSTAT, smooth };
