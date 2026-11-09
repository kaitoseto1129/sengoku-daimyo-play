// 行き先の大きな矢印の印（kaito 11/3 AJ）：本当に行く場所の真上に、ついていく相手の青い▼と同じ形で金色を立てる。
//   上下にゆっくり揺れ、遠くても読める大きさ。画面の上に描くので、建物や塀に隠れても輪郭が見える。
//   字は小さな任務の名だけ。画面外・背後は地面の道しるべ（mission_ground.js）の端の矢印に任せる。全戦で同じ部品。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';

const point = new THREE.Vector3();
const routeStart = new THREE.Vector3();
const namespace = 'http://www.w3.org/2000/svg';
const SHAPE = 'M-22-34H22L0 0Z';   // 青い▼（leader_follow.js の h22l-11 16Z）と同じ逆三角を大きく
let calm = null;

function make(rt) {
  const el = document.createElementNS(namespace, 'svg');
  el.setAttribute('aria-hidden', 'true');
  el.id = 'mission-dest-arrow';   // 画面全体の透明な入れ物。検査（audit.js）は描いた▼だけを測る
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible';
  el.innerHTML = `<g><path d="${SHAPE}" fill="none" stroke="#14120f" stroke-width="9" stroke-linejoin="round" stroke-opacity=".8"/><path d="${SHAPE}" fill="#f0b43a" stroke="#fff3ba" stroke-width="3" stroke-linejoin="round"/>` +
    '<text y="-44" text-anchor="middle" style="font:bold 13px sans-serif;fill:#fff3ba;stroke:#14120f;stroke-width:4px;paint-order:stroke;stroke-linejoin:round"></text></g>';
  rt.hud.root.appendChild(el);
  return el;
}

export function hideDestArrow(rt) {
  const el = rt.hud?.destArrow;
  if (el) el.style.display = 'none';
}

// 描けた時だけ true。行き先の真上の点（x, z）に先端を置く。
export function drawDestArrow(rt, want, rects) {
  let el = rt.hud.destArrow;
  if (el && !el.isConnected) el = rt.hud.destArrow = null;
  const me = rt.player.u.pos, W = VIEW.w, H = VIEW.h, sa = safeInsets();
  const dist = Math.hypot(want.x - me.x, want.z - me.z);
  if (dist < (want.r ?? 3) + .5) { if (el) el.style.display = 'none'; return false; }
  const route = !!want.route;
  // 曲がり角へ続く道の上に一本だけ置く。遠い門へ崖を横切らせない。
  const along = route ? Math.min(4, dist) / dist : 1;
  const gx = me.x + (want.x - me.x) * along, gz = me.z + (want.z - me.z) * along;
  const gy = route ? groundAt(rt.world, gx, gz, me.y) : want.y ?? groundAt(rt.world, gx, gz, me.y);
  let rotation = 0;
  if (route) {
    if (!rt.world.walkable(gx, gz, gy)) { if (el) el.style.display = 'none'; return false; }
    const back = Math.max(0, along - 1 / dist);
    const bx = me.x + (want.x - me.x) * back, bz = me.z + (want.z - me.z) * back;
    routeStart.set(bx, groundAt(rt.world, bx, bz, me.y) + .16, bz).project(rt.camera);
    if (routeStart.z < -1 || routeStart.z > 1) { if (el) el.style.display = 'none'; return false; }
  }
  point.set(gx, gy + (route ? .16 : 3.5 + Math.min(10, dist * .06)), gz).project(rt.camera);
  if (route) rotation = Math.atan2((routeStart.y - point.y) * H, (point.x - routeStart.x) * W) * 180 / Math.PI + 90;
  const x = (point.x + 1) * W / 2, y = (1 - point.y) * H / 2;
  // 重なりは揺れと大きさ（最大 1.5 倍）と名の字まで含めた実寸で見る（critic60 山中 15・田野 30「▼が顔や音のボタンの上・左の端」）
  const sc0 = route ? 1 : Math.max(.8, Math.min(1.5, 1.5 - dist / 120)), hw = 24 * sc0 + 10, top = (route ? 24 : 52 * sc0) + 14;
  const ok = point.z >= -1 && point.z <= 1 && Number.isFinite(x) && Number.isFinite(y) &&
    x > sa.left + hw + 56 && x < W - sa.right - hw - 56 && y > sa.top + 90 && y < H - sa.bottom - 40 &&
    !rects.some(r => x + hw > r.left && x - hw < r.right && y + 14 > r.top && y - top < r.bottom);
  if (!ok) { if (el) el.style.display = 'none'; return false; }
  if (!el) el = rt.hud.destArrow = make(rt);
  if (calm === null) calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bob = route || calm ? 0 : Math.sin(performance.now() / 380) * 7;
  const scale = route ? 1 : Math.max(.8, Math.min(1.5, 1.5 - dist / 120));
  const g = el.firstChild;
  g.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + bob).toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${scale.toFixed(2)})`);
  const shape = route ? 'M-12 14L0-14L12 14L0 6Z' : SHAPE;
  if (g.firstChild.getAttribute('d') !== shape) {
    g.firstChild.setAttribute('d', shape); g.children[1].setAttribute('d', shape);
  }
  const label = route ? '' : rt.missionGuide?.label || '';
  const text = g.lastChild, words = label.length <= 8 ? label : '';
  if (text.textContent !== words) text.textContent = words;
  el.style.display = '';
  return true;
}
