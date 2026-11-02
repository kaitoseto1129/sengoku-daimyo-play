// 武将の上半身の絵：ゲームの 3D（preview.js の setGeneral：その人の兜・甲冑・実写の顔）で撮る。図鑑の札と会話の場面から使う。
// 一人一枚を覚えておく。撮る間だけ小さな描画を一つ持ち、しばらく使わなければ手放す（携帯の記憶を増やさない）。
// 撮れない時（描けない端末・素材が読めない）は null を返し、呼ぶ側は今までの顔の絵を使う。
import * as THREE from 'three';
import { GENERALS } from './units_data.js';
import { ROSTER_ALIAS } from './bushou_roster.js';

const shots = new Map();
const MAX_SHOTS = 48;
let pv = null, cv = null, ready = null, idleT = 0, busy = false;
const queue = [];
const box = new THREE.Box3();
// 戦や会話の呼び名 → 具足の名
const ALIAS = { 木下藤吉郎: '羽柴秀吉', 木下秀吉: '羽柴秀吉', 藤吉郎: '羽柴秀吉', 蜂須賀小六: '蜂須賀正勝', 稲葉良通: '稲葉一鉄', 伊賀伊賀守: '安藤守就', 毛利河内: '毛利長秀' };

export function portraitName(raw) {
  const n = String(raw || '').replace(/^.* /, '').replace(/(殿|様)$/, '');
  const k = ALIAS[n] || ROSTER_ALIAS[n] || n;
  return GENERALS[k] && GENERALS[k].face ? k : null;
}
export function portraitCached(raw) { const k = portraitName(raw); return (k && shots.get(k)) || null; }

function open() {
  if (ready) return ready;
  ready = (async () => {
    const { Preview } = await import('./preview.js');
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:-10000px;top:0;width:160px;height:200px;pointer-events:none';
    document.body.appendChild(cv);
    pv = new Preview(cv);
    if (!pv.renderer) throw new Error('描けない');
    pv.renderer.setPixelRatio(1);
    pv.renderer.setSize(160, 200, false);
    pv.spin = 0;
    for (const m of pv.floor || []) m.visible = false;
    await pv.loadGeneral();
  })();
  return ready;
}
// 描画の輪は、絵の板が外れると自分で手放す（preview.js）
function close() { if (cv) cv.remove(); cv = null; pv = null; ready = null; }

function shoot(nm) {
  pv.setGeneral(nm, 0.35);
  if (!pv.hu) pv.holder.rotation.y = -0.3;
  pv.holder.updateMatrixWorld(true);
  box.setFromObject(pv.holder);
  // 兜の立物の先から胸までが入るように、頭の高さに合わせて寄る
  const top = Number.isFinite(box.max.y) ? box.max.y : 1.8;
  const y = Math.max(1.1, Math.min(top - 0.45, 1.6));
  pv.camera.position.set(0.25, y + 0.05, 2.0);
  pv.camera.lookAt(0, y - 0.02, 0);
  pv.renderer.render(pv.scene, pv.camera);
  return cv.toDataURL('image/png');
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const [nm, res] = queue.shift();
      if (shots.has(nm)) { res(shots.get(nm)); continue; }
      let url = null;
      try { await open(); url = shoot(nm); } catch (e) { url = null; }
      if (url) {
        shots.set(nm, url);
        if (shots.size > MAX_SHOTS) shots.delete(shots.keys().next().value);
      }
      res(url);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  } finally { busy = false; }
  clearTimeout(idleT);
  idleT = setTimeout(close, 8000);
}

export function portrait(raw) {
  const nm = portraitName(raw);
  if (!nm) return Promise.resolve(null);
  if (shots.has(nm)) return Promise.resolve(shots.get(nm));
  return new Promise((res) => { queue.push([nm, res]); clearTimeout(idleT); pump(); });
}
export function portraitStop() {
  for (const [, r] of queue.splice(0)) r(null);
  clearTimeout(idleT);
  close();
}
