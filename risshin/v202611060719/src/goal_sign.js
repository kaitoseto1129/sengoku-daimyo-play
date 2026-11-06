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
import { missionFollowTarget } from './mission_guide.js';
import { missionTarget, markedEnemy } from './mission_pin.js';
import { cameraWallBlocked } from './battle_sight.js';
import { weatherSees, weatherSight } from './weather_gameplay.js';
import { GUIDE_ENEMY } from './field_guide_symbol.js';

const NS = 'http://www.w3.org/2000/svg';
const CSS = `
/* 命・地図・今する事の三枚。案内と同じ知らせを重ねない。 */
#hud.action-guide:not(.enemy-action-guide) :is(#battle-notices,#jk-chap), #hud.action-guide:not(.enemy-action-guide):not(.mission-one-line) #h-prog { display:none !important; }
#goal-sign { position:absolute; inset:0; pointer-events:none; z-index:3; }
#goal-sign[hidden], #hud.photo #goal-sign, #hud.ending #goal-sign, #hud:has(#bigmap:not([hidden])) #goal-sign, body:has(#pause:not([hidden])) #goal-sign { display:none !important; }
#goal-sign svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
#goal-sign .gs-tag { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:2px; will-change:transform; }
#goal-sign .gs-tag span { padding:2px 9px 3px; background:#14120f; border:1.5px solid #e8c25a; border-radius:3px; color:#fff3ba; opacity:.9; font:700 17px/1.3 "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; letter-spacing:.06em; max-width:min(260px, 40vw); box-sizing:border-box; white-space:normal; text-align:center; text-shadow:0 1px 2px #000; }
#goal-sign .gs-frame { position:absolute; box-sizing:border-box; border:4px solid #fff3ba; border-radius:8px; box-shadow:0 0 0 3px #14120f; }
/* 命・任務・目印の三枚に収める。 */
#hud:has(#goal-sign:not([hidden])) :is(#jk-map,#jk-chap,#battle-notices,#armybar,#tugbar) { display:none !important; }
#goal-sign .gs-tag span:empty { display:none; }
#goal-sign .gs-tag i { width:0; height:0; border-left:17px solid transparent; border-right:17px solid transparent; border-top:26px solid #f0cf6a; filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f) drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
#goal-sign .gs-sword { position:static; width:30px; height:38px; flex:none; }
#goal-sign .gs-tag.bob i { animation:gs-bob 1.1s ease-in-out infinite; }
@keyframes gs-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(5px); } }
body.rm #goal-sign .gs-tag i { animation:none !important; }
@media (prefers-reduced-motion:reduce) { #goal-sign .gs-tag i { animation:none !important; } }
@media (max-height:500px) { #goal-sign .gs-tag span { font-size:max(20px, calc(20px * var(--text-scale, 1))); padding:2px 8px; } #goal-sign .gs-tag i { border-left-width:13px; border-right-width:13px; border-top-width:20px; } }
`;

const actionPoint = { x: 0, z: 0, unit: null };
let el = null;
const v = new THREE.Vector3(), dir = new THREE.Vector3();
function build(root) {
  if (!document.getElementById('goal-sign-css')) { const st = document.createElement('style'); st.id = 'goal-sign-css'; st.textContent = CSS; document.head.appendChild(st); }
  el = document.createElement('div'); el.id = 'goal-sign'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg><path fill="#fff3ba" stroke="#14120f" stroke-width="2.5" stroke-linejoin="round" fill-opacity=".88"/></svg><div class="gs-tag"><span></span><svg class="gs-sword" viewBox="0 0 80 80" style="display:none"><path d="${GUIDE_ENEMY}" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/></svg><i></i></div>`;
  el._path = el.querySelector('path'); el._tag = el.querySelector('.gs-tag'); el._name = el.querySelector('.gs-tag span'); el._tri = el.querySelector('.gs-tag i');
  el._sword = el.querySelector('.gs-sword');
  el._frame = document.createElement('div'); el._frame.className = 'gs-frame'; el._frame.hidden = true; el.appendChild(el._frame);
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
    root?.classList.remove('action-guide', 'enemy-action-guide');
    return hide();
  }
  hud.actionGuideUnit = null;
  // 地面のピンを使う戦は描画面に任せる。人物の金の▼や距離を重ねず、任務も隠さない。
  if (rt.def.goalSignGroundPin) {
    root.classList.remove('action-guide', 'enemy-action-guide');
    return hide();
  }
  const off = rt.over || !rt.player.u.alive || rt.choice || hud?.introWaiting || rt.player.camShot || rt.player.cine || hud?.bigmap || root.querySelector('#cine.on');
  // def.goalSignOff(rt)：その戦が自分の印（守る旗など）を出している間は金の▼を重ねない（印は一つだけ。kaito 11/3 AL）
  const destination = off ? null : missionTarget(rt);
  const ownGuide = !off && rt.def?.goalSignOff?.(rt);
  const normal = off || ownGuide ? null :
    rt.def.goalSignTarget ? rt.def.goalSignTarget(rt) : (rt.def.goalSignOnly && destination && !destination.enemy ? destination : null) || goalTarget(rt) ||
    // 目標の表（goals5）を持たない戦は、任務の行き先（旗と矢印のピンが指していた所）へ▼を立てる（11/6 共通の係：ピンを全戦でやめた代わり）
    (destination && !destination.enemy && Number.isFinite(destination.x) ? destination : null);
  // 指定の敵・ついて行く本人を先にする。作業や守備の場所には割り込まない。
  const explicit = rt.def.actionGuideTarget;
  // 地面のピンを使う戦は、任務が選んだ一点だけ。見える敵の▼へ渡した後に別の人物印を復活させない。
  // 任務で指定した敵は、通れる道の印と同時に本人の頭上へ示す。
  const assigned = !off && !ownGuide && (!destination || destination.route || destination.enemy) ? markedEnemy(rt) : null;
  let unit = rt.def.goalSignGroundPin || off || ownGuide && !explicit ? null : explicit ? explicit.call(rt.def, rt) :
    assigned || destination?.followUnit || (destination?.follow ? destination.unit : null) ||
    (!destination || destination.enemy || destination.unit && destination.unit.team !== rt.player.u.team ? markedEnemy(rt) : null) ||
    (!destination || destination.follow ? missionFollowTarget(rt) : null) ||
    (!destination && !normal ? rt.leaderFollow?.unit : null);
  const me = rt.player.u;
  if (unit && (!unit.alive || unit.gone || unit.dying || unit.downed || unit.woundOut || unit.fleeing)) unit = null;
  // 任務が指した敵は柵越しにも追う。霧と見える距離の制限は保つ。
  if (unit && unit.team !== me.team && (Math.hypot(unit.pos.x - me.pos.x, unit.pos.z - me.pos.z) > Math.min(weatherSight(rt.world), rt.world.vis ?? 680) ||
      !weatherSees(rt.world, me.pos, unit.pos) ||
      unit !== assigned && cameraWallBlocked(rt, me.pos, unit.pos, me.pos.y + 1.6, unit.pos.y + 2.1))) unit = null;
  if (unit) {
    actionPoint.x = unit.pos.x; actionPoint.z = unit.pos.z; actionPoint.unit = unit;
    hud.actionGuideUnit = unit;
  }
  // def.missionAlways：敵へ印を向けている間も、右上の目標の一行を隠さない（kaito 標準 三-3「右上に戦の間ずっと出す」）
  root.classList.toggle('action-guide', !!unit && !rt.def.missionAlways);
  root.classList.toggle('enemy-action-guide', !!unit && unit.team !== me.team);
  const t = unit ? actionPoint : normal;
  if (!t || !unit && (hud?.notices?.picks.length || 0) >= 3) return hide();
  if (!el) build(root);
  if (el.parentNode !== root) root.appendChild(el);
  el.hidden = false;
  const p = rt.player.u.pos;
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
  // 地面の矢印は全戦でやめた（kaito 11/3 AP12）。行き先は頭上の▼だけ
  let path = '';
  // 頭上の▼と呼び名
  const u = t.unit;
  const enemy = !!u && u.team !== me.team;
  if (el._enemy !== enemy) {
    el._enemy = enemy;
    el._sword.style.display = 'none'; el._tw = 0;
  }
  const gy = u ? u.pos.y : t.y ?? groundAt(rt.world, t.x, t.z, p.y);
  const groundPin = rt.def.goalSignGroundPin && !unit;
  const top = groundPin ? gy + .12 : gy + (u ? (u.mounted ? 3.9 : 3.1) : 4.1);   // ピンの先端は行き先の土に固定する。
  let x, y, edge = false, ang = 0;
  const W = VIEW.w, H = VIEW.h, m = 70;
  const seen = proj(rt, t.x, top, t.z);
  if (seen && v.x > m && v.x < W - m && v.y > 60 && v.y < H - 80) { x = v.x; y = v.y; }
  // 前にあって画面の上へはみ出す行き先（高い本丸など）は、上向きの矢印にせず、上の縁の▼のまま示す（五3「矢印は使わない」。11/5 伏見）
  else if (seen && v.x > m && v.x < W - m && v.y <= 60) { x = v.x; y = 60; }
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
  if (el._edge !== edge) { el._edge = edge; el._tw = 0; el._tag.classList.toggle('bob', !edge && !S.reduceMotion); }
  // 人の上の▼には「この人について行く」「ここを攻める」の説明を添えない（五1。11/5 一宮・佐和山）。画面の外の時だけ名を添える
  // 呼び名：隊と場所はいつも。名のある武将は頭上の名前があるので、画面の外の時だけ名を添える
  // def.goalSignBare（稲生）：▼だけで字を添えない（kaito 10/23「字は一切使わない」）
  //   全戦で「この人について行く」「ここを攻める」「▼ 〇〇へ」の案内の字は添えない（kaito 五1・五3「▼一つに距離を添える」・11/5 共通の係）。画面の外の名のある人だけ名を添える
  const label = enemy ? 'この敵' : !unit ? 'ここへ' : (edge && u?.name) || '';
  // 距離は五メートルきざみ。行き先と同じ札にまとめる。
  const shown = !unit && d >= 10 ? `${label} あと${Math.round(d / 5) * 5}メートル` : label;
  const frame = enemy && !edge && u.mesh?.visible !== false && !u.camHidden ? hud.measurePersonFrame(u, rt) : null;
  el._frame.hidden = !frame;
  if (frame) {
    el._frame.style.left = frame.left + 'px'; el._frame.style.top = frame.top + 'px';
    el._frame.style.width = Math.max(24, frame.right - frame.left) + 'px';
    el._frame.style.height = Math.max(32, frame.bottom - frame.top) + 'px';
    x = (frame.left + frame.right) / 2; y = frame.top - 8;
  }
  if (shown !== el._label) { el._label = shown; el._name.textContent = shown; el._tw = 0; }
  el._tri.style.display = enemy && !edge || groundPin && (!edge || t.arrived) ? 'none' : '';
  // 画面の端でも▼は下向きのまま（向きを指す矢印にしない。kaito 11/3 AP12・五3。11/5 佐和山で赤い矢印に見えた）。置き場の縁で向きを示す
  el._tri.style.transform = '';
  if (!el._tw || el._twH !== VIEW.h) { el._tw = el._tag.offsetWidth || 24; el._th = el._tag.offsetHeight || 20; el._twH = VIEW.h; }
  const tw = el._tw, th = el._th;
  x = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, x));
  y = Math.max(th + 8, Math.min(H - 80, y));
  // 画面の中の▼も、右上の進み具合の札などの四角に重なる時は、札の下へずらす（全戦・fix_inaba_1105 の bot「#h-prog と ▼ が重なる」）
  if (!edge) for (const hr of hud?.hudRects?.() || []) {
    const top = y - th, bot = y + 5;
    if (x + tw / 2 > hr.left && x - tw / 2 < hr.right && bot > hr.top && top < hr.bottom) {
      const ny = hr.bottom + 6 + th;
      if (ny <= H - 80) y = ny;
      else x = Math.max(tw / 2 + 8, hr.left - tw / 2 - 8);
    }
  }
  // 行き先は土に刺さる一本、到着後は同じ場所の輪。相手の剣と形を分ける。
  if (groundPin && (!edge || t.arrived)) {
    const r = t.arrived ? 14 : Math.max(9, Math.min(14, 220 / Math.max(1, d)));
    const cy = t.arrived ? y : y - r * 2;
    path = t.arrived
      ? `M${x-r},${cy}a${r},${r} 0 1,0 ${r*2},0a${r},${r} 0 1,0 ${-r*2},0 M${x-r+4},${cy}a${r-4},${r-4} 0 1,1 ${(r-4)*2},0a${r-4},${r-4} 0 1,1 ${-(r-4)*2},0`
      : `M${x},${y}L${x-r},${cy}a${r},${r} 0 1,1 ${r*2},0Z M${x-4},${cy-3}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0`;
  }
  if (path !== el._d) { el._d = path; el._path.setAttribute('d', path); }
  el._tag.style.transform = `translate(${(x - tw / 2).toFixed(1)}px,${(y - (edge ? th / 2 : th)).toFixed(1)}px)`;
  // 武将の名札（field_signs.js）がこの札を避けられるように、札の四角を控える（揺れの5点も含める）
  const r = el._rect || (el._rect = { left: 0, right: 0, top: 0, bottom: 0 });
  r.left = x - tw / 2; r.right = x + tw / 2; r.top = y - (edge ? th / 2 : th); r.bottom = y + (edge ? th / 2 : 5);
}
