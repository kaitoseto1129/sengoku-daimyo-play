// 問屋の品の絵（K608 ⑤・kaito 11/21「イラストでなく、実際に手に入る物の画像に」）：ゲームの3D の本物の品を撮影の部屋（preview.js）で撮る。
//   itemShot(key) → Promise<画像の URL | null>。key：'spear:su|omi|naga|jumonji|short'・'sword'・'bow'・'gun:nami|tan|shi'・'horse:<HORSES の id>'・'armor:<ITEMS の id>'
//   一枚ずつ順に撮って覚える（同じ品は二度撮らない）。撮る間だけ小さな描画を一つ持ち、しばらく使わなければ手放す（携帯の記憶を増やさない）。
//   撮れない時（描けない端末・素材が読めない）は null。呼ぶ側は今の小さな絵のまま。
import * as THREE from 'three';
import { HORSES, ITEMS } from './state.js';

const shots = new Map();
const W = 240, H = 160;
let pv = null, cv = null, idleT = 0, chain = Promise.resolve(), U = null, E = null, humansTried = false;
// 一コマ待つ（画面が隠れていて requestAnimationFrame が来ない時も止まらないよう、少し待てば進む）
const tick = () => new Promise((r) => { let d = false; const go = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 60); });
const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();

async function open() {
  if (pv) return pv;
  [U, E] = await Promise.all([import('./units.js'), import('./preview.js')]);
  cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  cv.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  pv = new E.Preview(cv);
  if (!pv.renderer) { close(); return null; }
  pv.spin = 0;
  for (const f of pv.floor || []) f.visible = false;   // 品だけを写す（床の影の円は出さない）
  return pv;
}
function close() {
  try { pv?.dispose(); } catch (e) { /* 片付け済み */ }
  cv?.remove(); pv = null; cv = null;
}
// 写す物に寄る：長い物は斜めに寝かせ、絵の幅いっぱいに
function frame(obj, { lay = false, side = 0.25, pad = 1.12, tilt = 0, part = 1 } = {}) {
  pv.holder.clear(); pv.holder.rotation.set(0, 0, 0);
  const inner = new THREE.Group(); inner.add(obj);
  const g = new THREE.Group(); g.add(inner); pv.holder.add(g);
  if (lay) {   // 一番長い向きを横へ（内の組）、それから少し右上がりに（外の組。回す順を分けないと傾きが消える）
    box.setFromObject(inner); box.getSize(size);
    if (size.z >= size.x && size.z >= size.y) inner.rotation.y = Math.PI / 2;
    else if (size.y >= size.x) inner.rotation.z = -Math.PI / 2;
    g.rotation.z = tilt;
  }
  g.updateMatrixWorld(true);
  box.setFromObject(g); box.getCenter(mid); box.getSize(size);
  g.position.sub(mid); g.updateMatrixWorld(true);
  // 長い物は穂先・切先の側（右上）だけを大きく写す（part＝写す長さの割合）。細い柄が一本の線にならないように
  if (part < 1) { const L = size.x; g.position.x -= L * (1 - part) / 2; g.position.y -= size.y * (1 - part) / 2; size.x = L * part; size.y *= part; }
  const cam = pv.camera; cam.aspect = W / H; cam.updateProjectionMatrix();
  const fovV = THREE.MathUtils.degToRad(cam.fov), fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
  const d = Math.max(size.y / 2 / Math.tan(fovV / 2), size.x / 2 / Math.tan(fovH / 2)) * pad + size.z / 2;
  cam.position.set(d * side, d * 0.18, d); cam.lookAt(0, 0, 0);
}
function snap() {
  pv.renderer.setSize(W, H, false);
  pv.renderer.render(pv.scene, pv.camera);
  try { return cv.toDataURL('image/webp', 0.88); } catch (e) { return null; }
}
async function shoot(key) {
  const [kind, id] = key.split(':');
  if (kind === 'spear') {
    const m = id === 'short' ? U.weaponMesh('spear', -1.0) : U.weaponMesh('spear', 0, id);
    frame(m, { lay: true, tilt: 0.5, side: 0.05, part: id === 'naga' ? 0.2 : 0.28 });
  } else if (kind === 'sword') frame(U.weaponMesh('sword'), { lay: true, tilt: 0.45, side: 0.05, part: 0.8 });
  else if (kind === 'bow') { const m = U.weaponMesh('bow'); m.rotation.y = Math.PI / 2; frame(m, { lay: false, side: 0.12, tilt: 0 }); }   // 弓は弦と反りが見える横から
  else if (kind === 'gun') {
    const m = U.weaponMesh('gun');
    const k = { nami: [1, 1], tan: [0.68, 1.05], shi: [1.3, 1.15] }[id] || [1, 1];   // 短筒は筒が短く・士筒は長く太い（撮る絵の上だけの寸法の違い）
    const gg = new THREE.Group(); gg.add(m); box.setFromObject(m); box.getSize(size);
    if (size.z >= size.x) gg.scale.set(k[1], k[1], k[0]); else gg.scale.set(k[0], k[1], k[1]);
    frame(gg, { lay: true, tilt: 0.12, side: 0.05 });
  } else if (kind === 'horse') {
    const h = HORSES[id]; if (!h) return null;
    const m = U.buildHorse({ coat: h.coat, mane: 0x16120e, tack: 0x6a2a1c, saddle: 0x1a1512, aori: 0x3a2e22, tassels: 0x1f2a4a, armor: 0 });
    m.rotation.y = -Math.PI / 2 + 0.35;
    frame(m, { side: 0.1, pad: 1.05 });
  } else if (kind === 'armor') {
    const it = ITEMS[id]; if (!it) return null;
    if (!humansTried) { humansTried = true; await pv.loadGeneral().catch(() => {}); }   // 本物の胴丸・兜（読み終わっていなければ読む）
    // 11/21 K608 ⑤：本人の具足は kaito の決まりで、どの段でも 9 月の胴丸（player.js playerLook の hero9）。本人に着せると胴・兜の三つが同じに写った。
    //   品の絵は、本人でなくその品を着た名の無い兵（同じ骨の入った人）に着せて撮る。胴は三つの作りを見分けられる姿に：
    //   簡素な胴具足＝茶の革の御貸具足・袖なし／胴丸＝黒漆に茶の毛引威の胴丸・袖／桶側胴＝黒漆の板の桶側胴に朱の威の草摺・袖
    const look = itemLook(it);
    pv.holder.clear();
    { const u = {}, m = U.buildModel(u, look); u.hand.rotation.x = -0.5; U.poseArms(u); pv.holder.add(m); pv.humanize(u, m); pv.lookModel = m; }
    pv.spin = 0;
    const hu = pv.hu, m = pv.lookModel;
    if (hu) { hu.heading = 0.45; m.rotation.y = 0.45; }
    for (let i = 0; i < 3; i++) await tick();   // 骨の人の姿を落ち着かせる（撮影の部屋が一コマずつ動かす）
    pv.holder.traverse((q) => { if (q.userData?.kind) q.visible = false; });   // 持たせた槍・刀・鉄砲は写さない（具足だけ）
    pv.holder.updateMatrixWorld(true);
    // 兜は頭、胴・陣羽織は胸、籠手は腕、佩楯・脛当は脚へ寄る（骨の頭の高さから。骨が無い時は背丈1.7m の人として）
    let hy = 1.6; const head = pv.hu?.human?.bones?.Head;
    if (head) { const v = new THREE.Vector3(); head.getWorldPosition(v); hy = v.y; }
    const win = { hat: [hy + 0.14, 0.62], body: [hy - 0.36, 0.75], coat: [hy - 0.45, 0.95], arm: [hy - 0.42, 0.8], thigh: [hy - 0.95, 0.55], shin: [hy - 1.3, 0.55] }[it.slot] || [hy - 0.5, 0.9];
    const yc = win[0];
    const cam = pv.camera; cam.aspect = W / H; cam.updateProjectionMatrix();
    const d = Math.max(0.55, win[1] / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 1.05);
    cam.position.set(0.18 * d, yc + 0.03, d); cam.lookAt(0, yc, 0);
  } else return null;
  await tick();
  return snap();
}
// 品を着た名の無い兵の姿（撮影の部屋だけ）。胴の品は胴の作りを、兜の品は茶の革の胴に兜を
function itemLook(it) {
  const L = { face: 3, vi: 1, tier: 0, cloth: 0x43392f, hat: 'jingasa', hatColor: 0x1c1916, armor: 0x6b4a2c, lacquer: 0x6b4a2c, lace: 0x4a3a2a,
    sode: false, kote: 3, dirt: 0.45, flag: null, pole: false, weapon: 'spear', mon: 'oda', menpo: 0 };
  const body = it.slot === 'body' ? it.look : 0;
  if (body === 1) Object.assign(L, { armor: 0x1d1d1f, lacquer: undefined, lace: 0x5a4630, doStyle: 'sugake', sode: true });
  else if (body === 2) Object.assign(L, { armor: 0x1d1d1f, lacquer: undefined, lace: 0xa8321f, doStyle: 'okegawa', sode: true });
  // 兜の品：陣笠は御貸具足の兵（陣笠＝竹と紙の茶・塗り陣笠＝黒漆の照り）。兜は侍の当世具足の兵に着せる（足軽の形では兜が陣笠にそろえられた）
  if (it.slot === 'hat') {
    L.hat = it.look;
    if (String(it.look).startsWith('kabuto')) Object.assign(L, { tier: 1, armor: 0x1d1d1f, lacquer: undefined, lace: 0x2a2724, doStyle: 'okegawa', sode: true, real: 1 });
    else { const c = it.look === 'jingasa_n' ? 0x16130f : 0x6a5838; Object.assign(L, { hatColor: c, lacquer: c, armor: c, oldGood: 1 }); }   // oldGood：家の揃いの漆（humans_dress.js soldierVar）に塗り替えさせない   // 御貸具足は陣笠と胴が同じ漆（hatColor だけでは変わらない）
  }
  return L;
}
export function itemShotCached(key) { return shots.get(key) || null; }
export function itemShot(key) {
  if (shots.has(key)) return Promise.resolve(shots.get(key));
  const job = chain.then(async () => {
    if (shots.has(key)) return shots.get(key);
    clearTimeout(idleT);
    let url = null;
    try { if (await open()) url = await shoot(key); } catch (e) { url = null; }
    shots.set(key, url);
    idleT = setTimeout(close, 4000);
    return url;
  });
  chain = job.catch(() => null);
  return job;
}
