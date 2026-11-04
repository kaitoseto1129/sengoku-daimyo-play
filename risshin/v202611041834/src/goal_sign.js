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
import { currentObjective, missionFollowTarget } from './mission_guide.js';
import { missionTarget, markedEnemy } from './mission_pin.js';
import { cameraWallBlocked } from './battle_sight.js';
import { weatherSees, weatherSight } from './weather_gameplay.js';

const NS = 'http://www.w3.org/2000/svg';
const CSS = `
/* 命・地図・今する事の三枚。案内と同じ知らせを重ねない。 */
#hud.action-guide :is(#h-prog,#battle-notices,#jk-chap) { display:none !important; }
#goal-sign { position:absolute; inset:0; pointer-events:none; z-index:3; }
#goal-sign[hidden], #hud.photo #goal-sign, #hud.ending #goal-sign, #hud:has(#bigmap:not([hidden])) #goal-sign, body:has(#pause:not([hidden])) #goal-sign { display:none !important; }
#goal-sign svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
#goal-sign .gs-tag { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:2px; will-change:transform; }
#goal-sign .gs-tag span { padding:2px 9px 3px; background:rgba(14,11,8,.82); border:1.5px solid #e8c25a; border-radius:3px; color:#fff3ba; font:700 20px/1.4 "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; letter-spacing:.06em; max-width:min(260px, 40vw); box-sizing:border-box; white-space:normal; text-align:center; text-shadow:0 1px 2px #000; }
#goal-sign .gs-tag span:empty { display:none; }
#goal-sign .gs-tag i { width:0; height:0; border-left:11px solid transparent; border-right:11px solid transparent; border-top:16px solid #f0cf6a; filter:drop-shadow(0 0 1.5px #14120f) drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
#goal-sign .gs-tag.bob i { animation:gs-bob 1.1s ease-in-out infinite; }
@keyframes gs-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(5px); } }
body.rm #goal-sign .gs-tag i { animation:none !important; }
@media (prefers-reduced-motion:reduce) { #goal-sign .gs-tag i { animation:none !important; } }
@media (max-height:500px) { #goal-sign .gs-tag span { font-size:max(20px, calc(20px * var(--text-scale, 1))); padding:3px 8px; } #goal-sign .gs-tag i { border-left-width:9px; border-right-width:9px; border-top-width:13px; } }
`;

const actionPoint = { x: 0, z: 0, unit: null };
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
  const hud = rt?.hud;
  if (!root || !rt?.player?.u || !rt.camera || rt.def?.town || rt.def?.dojo) {
    if (hud) hud.actionGuideUnit = null;
    root?.classList.remove('action-guide');
    return hide();
  }
  hud.actionGuideUnit = null;
  const off = rt.over || !rt.player.u.alive || rt.choice || hud?.introWaiting || rt.player.camShot || rt.player.cine || hud?.bigmap || root.querySelector('#cine.on');
  // def.goalSignOff(rt)：その戦が自分の印（守る旗など）を出している間は金の▼を重ねない（印は一つだけ。kaito 11/3 AL）
  const destination = off ? null : missionTarget(rt);
  const ownGuide = !off && rt.def?.goalSignOff?.(rt);
  const normal = off || ownGuide ? null :
    rt.def.goalSignTarget ? rt.def.goalSignTarget(rt) : goalTarget(rt);
  // 指定の敵・ついて行く本人を先にする。作業や守備の場所には割り込まない。
  const explicit = rt.def.actionGuideTarget;
  let unit = off || ownGuide && !explicit ? null : explicit ? explicit.call(rt.def, rt) :
    destination?.followUnit || (destination?.follow ? destination.unit : null) ||
    (!destination || destination.enemy || destination.unit && destination.unit.team !== rt.player.u.team ? markedEnemy(rt) : null) ||
    (!destination || destination.follow ? missionFollowTarget(rt) : null) ||
    (!destination && !normal ? rt.leaderFollow?.unit : null);
  const me = rt.player.u;
  if (unit && (!unit.alive || unit.gone || unit.dying || unit.downed || unit.woundOut || unit.fleeing)) unit = null;
  // 壁や霧の裏の敵を案内で明かさない。
  if (unit && unit.team !== me.team && (Math.hypot(unit.pos.x - me.pos.x, unit.pos.z - me.pos.z) > Math.min(weatherSight(rt.world), rt.world.vis ?? 680) ||
      !weatherSees(rt.world, me.pos, unit.pos) ||
      cameraWallBlocked(rt, me.pos, unit.pos, me.pos.y + 1.6, unit.pos.y + 2.1))) unit = null;
  if (unit) {
    actionPoint.x = unit.pos.x; actionPoint.z = unit.pos.z; actionPoint.unit = unit;
    hud.actionGuideUnit = unit;
  }
  // def.missionAlways：敵へ印を向けている間も、右上の目標の一行を隠さない（kaito 標準 三-3「右上に戦の間ずっと出す」）
  root.classList.toggle('action-guide', !!unit && !rt.def.missionAlways);
  const t = unit ? actionPoint : normal;
  if (!t || !unit && (hud?.notices?.picks.length || 0) >= 3) return hide();
  if (!el) build(root);
  if (el.parentNode !== root) root.appendChild(el);
  el.hidden = false;
  const p = rt.player.u.pos;
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
  // 地面の矢印は全戦でやめた（kaito 11/3 AP12）。行き先は頭上の▼だけ
  const path = '';
  if (path !== el._d) { el._d = path; el._path.setAttribute('d', path); }
  // 頭上の▼と呼び名
  const u = t.unit;
  const gy = u ? u.pos.y : t.y ?? groundAt(rt.world, t.x, t.z, p.y);
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
    // 縁の印が右上の目標の札・左上の戦の名・小さな地図に重なる時は、札の下（入らなければ上）へずらす（11/3 p100_inou の bot「札と goal-sign が重なる」）
    for (const r of hud?.hudRects?.() || []) if (x + 60 > r.left && x - 60 < r.right && y + 22 > r.top && y - 22 < r.bottom) y = r.bottom + 26 <= H - 90 ? r.bottom + 26 : Math.max(30, r.top - 26);
  }
  // def.goalSignNameOnly（稲生）：名のある相手が画面に見えている間は、頭上の名札と赤い▼だけにして金の▼を重ねない（kaito AN「一人の相手には札一つ」）
  if (!unit && !edge && u?.name && rt.def.goalSignNameOnly) return hide();
  if (el._edge !== edge) { el._edge = edge; el._tag.classList.toggle('bob', !edge && !S.reduceMotion); }
  // 呼び名：隊と場所はいつも。名のある武将は頭上の名前があるので、画面の外の時だけ名を添える
  // 場所の説明だけにせず、印へ向かって今する行動を一つ示す。
  const action = rt.def.goalSignAction?.(rt, currentObjective(rt)?.text || '') || t.action;
  // def.goalSignBare（稲生）：▼だけで字を添えない（kaito 10/23「字は一切使わない」）
  const label = rt.def.goalSignBare ? '' : unit ? rt.def.goalSignUnitNoLabel ? '' : (unit.team === me.team ? 'この人について行く' : 'ここを攻める') : rt.def.goalSignNoLabel ? '' : action ? '▼ ' + action.split(/[。！？]/)[0] : t.label || (edge && u?.name) || '';
  if (label !== el._label) { el._label = label; el._name.textContent = label; el._tw = 0; }
  el._tri.style.transform = edge ? `rotate(${(ang * 180 / Math.PI + 180).toFixed(0)}deg)` : '';
  if (!el._tw || el._twH !== VIEW.h) { el._tw = el._tag.offsetWidth || 24; el._th = el._tag.offsetHeight || 20; el._twH = VIEW.h; }
  const tw = el._tw, th = el._th;
  x = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, x));
  y = Math.max(th + 8, Math.min(H - 80, y));
  el._tag.style.transform = `translate(${(x - tw / 2).toFixed(1)}px,${(y - (edge ? th / 2 : th)).toFixed(1)}px)`;
  // 武将の名札（field_signs.js）がこの札を避けられるように、札の四角を控える（揺れの5点も含める）
  const r = el._rect || (el._rect = { left: 0, right: 0, top: 0, bottom: 0 });
  r.left = x - tw / 2; r.right = x + tw / 2; r.top = y - (edge ? th / 2 : th); r.bottom = y + (edge ? th / 2 : 5);
}
