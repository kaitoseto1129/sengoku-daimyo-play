// 今の目標の相手が「どれで、どこか」を絵で示す（kaito 11/2 Q「本陣に迫る・後ろの弓組を討つ・林の二の備を退ける など、それがどれでどこにあるか分からない。
//   地図の印・矢印（前の地面の矢印の方が分かりやすかった）・頭上の名前で、どれのことか必ず分かるように」）。全戦に効く。
//   ・地面の矢印：自分の前の地面に、相手の方へ向く三つの矢印（地面に寝かせて描く。近づくと消える）
//   ・頭上の印：相手の真上に金の▼。名のある武将は頭上の名前（field_signs.js）があるので▼だけ、隊や場所は呼び名（「後ろの弓組」）を添える
//   ・画面の外：画面の縁に呼び名と、その方へ向く▼
//   相手と場所は goals5.js の goalTarget（右上の地図のひし形も同じ物）。毎コマ new しない。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { groundAt } from './floors.js';
import { goalTarget } from './goals5.js';
import { S } from './settings.js';

const NS = 'http://www.w3.org/2000/svg';
const ARROW = [[0, 0.8], [0.62, 0.08], [0.26, 0.08], [0.26, -0.72], [-0.26, -0.72], [-0.26, 0.08], [-0.62, 0.08]];
const CSS = `
#goal-sign { position:absolute; inset:0; pointer-events:none; z-index:3; }
#goal-sign[hidden], #hud.photo #goal-sign, #hud.ending #goal-sign, #hud:has(#bigmap:not([hidden])) #goal-sign, body:has(#pause:not([hidden])) #goal-sign { display:none !important; }
#goal-sign svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
#goal-sign .gs-tag { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:2px; will-change:transform; }
#goal-sign .gs-tag span { padding:2px 9px 3px; background:rgba(14,11,8,.82); border:1.5px solid #e8c25a; border-radius:3px; color:#fff3ba; font:700 15px/1.25 "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; letter-spacing:.06em; white-space:nowrap; text-shadow:0 1px 2px #000; }
#goal-sign .gs-tag span:empty { display:none; }
#goal-sign .gs-tag i { width:0; height:0; border-left:11px solid transparent; border-right:11px solid transparent; border-top:16px solid #f0cf6a; filter:drop-shadow(0 0 1.5px #14120f) drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
#goal-sign .gs-tag.bob i { animation:gs-bob 1.1s ease-in-out infinite; }
@keyframes gs-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(5px); } }
body.rm #goal-sign .gs-tag i { animation:none !important; }
@media (prefers-reduced-motion:reduce) { #goal-sign .gs-tag i { animation:none !important; } }
@media (max-height:500px) { #goal-sign .gs-tag span { font-size:13px; padding:1px 7px 2px; } #goal-sign .gs-tag i { border-left-width:9px; border-right-width:9px; border-top-width:13px; } }
`;

let el = null;
const v = new THREE.Vector3(), dir = new THREE.Vector3();
function build(root) {
  if (!document.getElementById('goal-sign-css')) { const st = document.createElement('style'); st.id = 'goal-sign-css'; st.textContent = CSS; document.head.appendChild(st); }
  el = document.createElement('div'); el.id = 'goal-sign'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg><path fill="#fff3ba" stroke="#14120f" stroke-width="2.5" stroke-linejoin="round" fill-opacity=".88"/></svg><div class="gs-tag"><span></span><i></i></div>`;
  el._path = el.querySelector('path'); el._tag = el.querySelector('.gs-tag'); el._name = el.querySelector('.gs-tag span'); el._tri = el.querySelector('.gs-tag i');
  el._d = ''; el._label = null; el._edge = null;
  root.appendChild(el);
}
function proj(rt, x, y, z) {
  v.set(x, y, z).project(rt.camera);
  if (v.z < -1 || v.z > 1) return false;
  v.x = (v.x + 1) * VIEW.w / 2; v.y = (1 - v.y) * VIEW.h / 2;
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}
function hide() { if (el && !el.hidden) { el.hidden = true; el._tw = 0; } }

export function goalSignTick(rt, root) {
  if (!root || !rt?.player?.u || !rt.camera || rt.def?.town || rt.def?.dojo) return hide();
  const hud = rt.hud;
  const off = rt.over || !rt.player.u.alive || rt.choice || hud?.introWaiting || rt.player.camShot || rt.player.cine || hud?.bigmap || root.querySelector('#cine.on');
  const t = off ? null : goalTarget(rt);
  if (!t) return hide();
  if (!el) build(root);
  if (el.parentNode !== root) root.appendChild(el);
  el.hidden = false;
  const p = rt.player.u.pos;
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
  // 地面の矢印（相手まで7歩より遠い時。相手の手前2歩で止める）
  let path = '';
  if (d > 7) {
    const fx = dx / d, fz = dz / d, rx = fz, rz = -fx;
    for (let k = 0; k < 3; k++) {
      const s = 3.2 + k * 2.4;
      if (s > d - 2) break;
      const cx = p.x + fx * s, cz = p.z + fz * s, sc = 0.72 + k * 0.1;
      let seg = '', ok = true;
      for (let j = 0; j < ARROW.length && ok; j++) {
        const [a, b] = ARROW[j];
        const wx = cx + (rx * a + fx * b) * sc, wz = cz + (rz * a + fz * b) * sc;
        // 画面の縁や下の釦にかかる矢印（カメラのすぐ前で大きく写る物）は描かない
        ok = proj(rt, wx, groundAt(rt.world, wx, wz, p.y) + 0.08, wz) && v.x > 8 && v.x < VIEW.w - 8 && v.y > 60 && v.y < VIEW.h * 0.8;
        seg += `${j ? 'L' : 'M'}${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
      }
      if (ok) path += seg + 'Z';
    }
  }
  if (path !== el._d) { el._d = path; el._path.setAttribute('d', path); }
  // 頭上の▼と呼び名
  const u = t.unit;
  const gy = u ? u.pos.y : groundAt(rt.world, t.x, t.z, p.y);
  const top = gy + (u ? (u.mounted ? 3.9 : 3.1) : 4.1);   // 隊・場所の呼び名は、名のある武将の頭上の名前より上に
  let x, y, edge = false, ang = 0;
  const W = VIEW.w, H = VIEW.h, m = 70;
  const seen = proj(rt, t.x, top, t.z);
  if (seen && v.x > m && v.x < W - m && v.y > 60 && v.y < H - 80) { x = v.x; y = v.y; }
  else {
    // 画面の外：自分から見た相手の向きを、画面の縁へ写す
    const camDir = rt.camera.getWorldDirection(dir);
    const yaw = Math.atan2(camDir.x, camDir.z);
    const right = -Math.cos(yaw) * dx + Math.sin(yaw) * dz, fwd = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    ang = Math.atan2(right, fwd);   // 0 が前（画面の上）
    const ex = Math.sin(ang), ey = -Math.cos(ang);
    const kx = ex ? ((ex > 0 ? W - m : m) - W / 2) / ex : Infinity, ky = ey ? ((ey > 0 ? H - 90 : 70) - H / 2) / ey : Infinity;
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    x = W / 2 + ex * k; y = H / 2 + ey * k; edge = true;
  }
  if (el._edge !== edge) { el._edge = edge; el._tag.classList.toggle('bob', !edge && !S.reduceMotion); }
  // 呼び名：隊と場所はいつも。名のある武将は頭上の名前があるので、画面の外の時だけ名を添える
  const label = t.label || (edge && u?.name) || '';
  if (label !== el._label) { el._label = label; el._name.textContent = label; el._tw = 0; }
  el._tri.style.transform = edge ? `rotate(${(ang * 180 / Math.PI + 180).toFixed(0)}deg)` : '';
  if (!el._tw || el._twH !== VIEW.h) { el._tw = el._tag.offsetWidth || 24; el._th = el._tag.offsetHeight || 20; el._twH = VIEW.h; }
  const tw = el._tw, th = el._th;
  el._tag.style.transform = `translate(${(x - tw / 2).toFixed(1)}px,${(y - (edge ? th / 2 : th)).toFixed(1)}px)`;
}
