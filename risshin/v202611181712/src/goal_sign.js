// 今の目標の場所と敵を、物陰でも見える画面上の矢印で示す。
// 画面外では方角を指し、印と投影用の点は使い回す。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';
import { goalTarget, goalNoun } from './goals5.js';
import { missionFollowTarget } from './mission_guide.js';
import { missionTarget, markedEnemy } from './mission_pin.js';
import { cameraWallBlocked } from './battle_sight.js';
import { weatherSees, weatherSight } from './weather_gameplay.js';
import { GUIDE_ENEMY } from './field_guide_symbol.js';

const NS = 'http://www.w3.org/2000/svg';
const CSS = `
/* 命・地図・今する事の三枚。案内と同じ知らせを重ねない。 */
#hud.action-guide:not(.enemy-action-guide) :is(#battle-notices,#jk-chap), #hud.action-guide:not(.enemy-action-guide):not(.mission-one-line) #h-prog:not(.goal-mode) { display:none !important; }
#goal-sign { position:absolute; inset:0; pointer-events:none; z-index:3; }
#goal-sign[hidden], #hud.photo #goal-sign, #hud.ending #goal-sign, #hud:has(#bigmap:not([hidden])) #goal-sign, body:has(#pause:not([hidden])) #goal-sign { display:none !important; }
#goal-sign svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
#goal-sign .gs-tag { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:2px; will-change:transform; }
#goal-sign .gs-tag span { padding:2px 6px; background:#14120f; border:0; border-radius:3px; color:#fff3ba; font:700 17px/1.3 "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; letter-spacing:.06em; max-width:min(260px, 40vw); box-sizing:border-box; white-space:normal; text-align:center; text-shadow:0 1px 2px #000; }
#goal-sign .gs-frame { position:absolute; box-sizing:border-box; border:4px solid #fff3ba; border-radius:8px; box-shadow:0 0 0 3px #14120f; }
/* 命・任務・目印の三枚に収める。右上の地図（#jk-map）は K324（kaito 11/15）で残す。 */
#hud.gs-seen :is(#minimap,#maphint), #hud:has(#goal-sign:not([hidden])) :is(#jk-chap,#battle-notices,#minimap,#maphint), #hud:not(.keep-battle-signs):has(#goal-sign:not([hidden])) :is(#tugbar,.field-names) { display:none !important; }
/* 命・今の手順と兵数・目標の矢印の三枚。名前の札は矢印へまとめる。 */
#hud.action-guide:not(.photo):not(.ending) #h-prog.goal-mode:not([hidden]) { display:block !important; }
#hud.field-clean:not(.keep-battle-signs) .field-names { display:none !important; }
#hud:not(.keep-battle-signs):has(#goal-sign:not([hidden])) #armybar:not(#h-prog #armybar) { display:none !important; }
#goal-sign .gs-tag span:empty { display:none; }
#goal-sign .gs-tag i { width:30px; height:36px; background:#fff3ba; clip-path:polygon(32% 0,68% 0,68% 52%,100% 52%,50% 100%,0 52%,32% 52%); transform-origin:center; filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f) drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
#goal-sign .gs-flag { position:static; width:36px; height:40px; flex:none; border:3px solid #fff3ba; border-radius:5px; background:#14120f; box-shadow:0 0 0 2px #14120f; }
#goal-sign .gs-sword { position:static; width:30px; height:38px; flex:none; }
#goal-sign .gs-tag.follow i { background:#fff3ba; }
#goal-sign .gs-tag.bob i { animation:none; }
@keyframes gs-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(5px); } }
body.rm #goal-sign .gs-tag i { animation:none !important; }
@media (prefers-reduced-motion:reduce) { #goal-sign .gs-tag i { animation:none !important; } }
/* K358（11/17 iMac n-look-face）：画面の真ん中の上の一時の知らせ（#center-call .cc）と行き先の▼の札が、木津・今福・鴫野・真田丸の全てで重なって読めなかった（act bot：.gs-tag と .cc）。
   知らせが出ている数秒だけ▼の札を消す（根白坂・桶狭間と同じ形を全戦へ）。知らせが消えれば戻る */
body:has(#center-call .cc) #goal-sign .gs-tag { opacity:0 !important; }
@media (max-height:500px) { #goal-sign .gs-tag span { font-size:max(20px, calc(20px * var(--text-scale, 1))); padding:2px 8px; } #goal-sign .gs-tag i { border-left-width:13px; border-right-width:13px; border-top-width:20px; } }
`;

const actionPoint = { x: 0, z: 0, unit: null };
const arrivedPlaces = new WeakMap();
// 戦を出た時に兵の控えを外す（11/8 docs/crash_1108.md）
export function goalSignRelease() { actionPoint.unit = null; }
let el = null;
const v = new THREE.Vector3(), dir = new THREE.Vector3();
function build(root) {
  if (!document.getElementById('goal-sign-css')) { const st = document.createElement('style'); st.id = 'goal-sign-css'; st.textContent = CSS; document.head.appendChild(st); }
  el = document.createElement('div'); el.id = 'goal-sign'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg><path fill="#fff3ba" stroke="#14120f" stroke-width="2.5" stroke-linejoin="round" fill-opacity=".88"/></svg><div class="gs-tag"><span></span><svg class="gs-sword" viewBox="0 0 80 80" style="display:none"><path d="${GUIDE_ENEMY}" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/></svg><svg class="gs-flag" viewBox="0 0 36 40"><path d="M8 36V4H30L25 12L30 20H8" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg><i></i></div>`;
  el._path = el.querySelector('path'); el._tag = el.querySelector('.gs-tag'); el._name = el.querySelector('.gs-tag span'); el._tri = el.querySelector('.gs-tag i');
  el._sword = el.querySelector('.gs-sword'); el._flag = el.querySelector('.gs-flag');
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

function placeName(rt, t) {
  return t.label || t.unit?.name || goalNoun(rt.missionGuide?.objective?.text);
}

export function goalSignTick(rt, root) {
  const hud = rt?.hud;
  if (hud) hud.goalSignVisible = false;
  if (!root || !rt?.player?.u || !rt.camera || rt.def?.town || rt.def?.dojo) {
    if (hud) hud.actionGuideUnit = null;
    root?.classList.remove('action-guide', 'enemy-action-guide');
    return hide();
  }
  hud.actionGuideUnit = null;
  hud.goalSignPoint = null;   // 金の▼が指す一点（右上の地図も同じ点を指す。11/18 クラウド K315 全戦の地図とピン）
  // 目標の▼が一度出た戦は、▼が消える間も右上の小さな地図を出さない（critic60 山中 33「途中から急に地図が出て目標に重なる」）
  if (root._gsRt !== rt) { root._gsRt = rt; root.classList.remove('gs-seen'); }
  // 人数と武将名を常に出す戦では、行き先の印による省略から外す。次の戦では戻す。
  root.classList.toggle('keep-battle-signs', !!rt.def.keepBattleSigns);
  // 地面のピンを使う戦は描画面に任せる。人物の金の▼や距離を重ねず、任務も隠さない。
  if (rt.def.goalSignGroundPin) {
    root.classList.remove('action-guide', 'enemy-action-guide');
    return hide();
  }
  const off = rt.over || !rt.player.u.alive || rt.choice || hud?.introWaiting || rt.player.camShot || rt.player.cine || hud?.bigmap || root.querySelector('#cine.on');
  // def.goalSignOff(rt)：その戦が自分の印（守る旗など）を出している間は金の▼を重ねない（印は一つだけ。kaito 11/3 AL）
  const destination = off ? null : missionTarget(rt);
  const guard = !off && (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
  const ownGuide = !off && (rt.def?.goalSignOff?.(rt) || guard?.alive);
  const normal = off || ownGuide ? null :
    destination?.route ? destination : rt.def.goalSignTarget ? rt.def.goalSignTarget(rt) : (rt.def.goalSignOnly && destination && !destination.enemy ? destination : null) || goalTarget(rt) ||
    // 目標の表（goals5）を持たない戦は、任務の行き先（旗と矢印のピンが指していた所）へ▼を立てる（11/6 共通の係：ピンを全戦でやめた代わり）
    (destination && !destination.enemy && Number.isFinite(destination.x) ? destination : null);
  // 指定の敵・ついて行く本人を先にする。作業や守備の場所には割り込まない。
  const explicit = rt.def.actionGuideTarget;
  // 地面のピンを使う戦は、任務が選んだ一点だけ。見える敵の▼へ渡した後に別の人物印を復活させない。
  // 回り道が要る時は通れる口を示し、近づいてから相手の頭上へ切り替える。
  const assigned = !off && !ownGuide && (!destination || destination.enemy) ? markedEnemy(rt) : null;
  let unit = rt.def.goalSignGroundPin || off || ownGuide && !explicit ? null : explicit ? explicit.call(rt.def, rt) :
    assigned || destination?.followUnit || (destination?.follow ? destination.unit : null) ||
    (!destination || destination.enemy || destination.unit && destination.unit.team !== rt.player.u.team ? markedEnemy(rt) : null) ||
    (!destination || destination.follow ? missionFollowTarget(rt) : null) ||
    (!destination && !normal ? rt.leaderFollow?.unit : null);
  const me = rt.player.u;
  if (unit && (!unit.alive || unit.gone || unit.dying || unit.downed || unit.woundOut || unit.fleeing)) unit = null;
  // 11/8 critic60（五3・五2：一宮・杭瀬川）：行き先の場所があるのに、味方の将（目付・大将）の頭上へ金の▼と「名 50m」を出して、
  //   行き先の印と同じ形で二つ並んだ（どちらが行き先か分からない）。行き先の場所がある間は味方の将へ▼を向けない
  if (unit && unit.team === rt.player.u.team && !explicit && destination && !destination.enemy && !destination.unit && Number.isFinite(destination.x)) unit = null;
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
  if (!t) return hide();
  if (Number.isFinite(t.x) && Number.isFinite(t.z)) hud.goalSignPoint = t;
  if (!el) build(root);
  if (el.parentNode !== root) root.appendChild(el);
  el.hidden = false;
  root.classList.add('gs-seen');
  const p = rt.player.u.pos;
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
  // 一度着いた場所の案内は、斬り合いで離れても出し直さない。次の任務は別に覚える。
  if (!t.unit && t.hideAfterArrival) {
    let arrived = arrivedPlaces.get(rt);
    if (!arrived) { arrived = new Set(); arrivedPlaces.set(rt, arrived); }
    // 段の番号（arrivalId）がある時はそれだけで覚える。動く相手（毛利の先鋒）を指す行き先は毎コマ座標がずれ、着いた後も出直した（K035 11/13 係三）
    const key = t.arrivalId != null ? `id:${t.arrivalId}` : `:${t.label || ''}:${t.x}:${t.z}`;
    if (d < 6) arrived.add(key);
    if (arrived.has(key)) return hide();
  }
  // 11/8 critic60 関ヶ原（五2）：行き先に立っている間は、自分の頭の真上に金の▼（輪に見えた）を出さない
  if (!t.unit && !rt.def.goalSignGroundPin && d < (t.hideDistance ?? 6)) return hide();
  // 矢印は画面へ重ね、地形や兵に隠れないようにする。
  let path = '';
  // 頭上の▼と呼び名
  const u = t.unit;
  const enemy = !!u && u.team !== me.team || !!t.enemy;
  const follow = !!u && !enemy;
  if (el._follow !== follow) { el._follow = follow; el._tag.classList.toggle('follow', follow); el._tw = 0; }
  if (el._enemy !== enemy) {
    el._enemy = enemy;
    el._sword.style.display = enemy ? 'block' : 'none'; el._tw = 0;
  }
  // def.goalEnemyNoFlag（根白坂 11/18）：相手を指す間は行き先の旗の箱を出さない（名・✕✕・▼で一人。kaito AN「一人の相手には札一つ」）
  const noFlag = enemy && !!rt.def.goalEnemyNoFlag;
  if (el._noFlag !== noFlag) { el._noFlag = noFlag; el._flag.style.display = noFlag ? 'none' : ''; el._tw = 0; }
  const gy = u ? u.pos.y : t.y ?? groundAt(rt.world, t.x, t.z, p.y);
  const groundPin = rt.def.goalSignGroundPin && !unit;
  const top = groundPin ? gy + .12 : gy + (u ? (u.mounted ? 3.9 : 3.1) : 4.1);   // ピンの先端は行き先の土に固定する。
  let x, y, edge = false, ang = 0;
  const W = VIEW.w, H = VIEW.h, m = 70;
  const seen = proj(rt, t.x, top, t.z);
  if (seen && v.x > m && v.x < W - m && v.y > 60 && v.y < H - 80) { x = v.x; y = v.y; }
  // 前にあって画面の上へはみ出す行き先（高い本丸など）は、上向きの矢印にせず、上の縁の▼のまま示す（五3「矢印は使わない」。11/5 伏見）
  else if (!rt.def.goalSignNoEdge && seen && v.x > m && v.x < W - m && v.y <= 60) { x = v.x; y = 60; edge = true; ang = 0; }
  else {
    if (rt.def.goalSignNoEdge) return hide();
    // 画面の外：自分から見た相手の向きを、画面の縁へ写す
    const camDir = rt.camera.getWorldDirection(dir);
    const yaw = Math.atan2(camDir.x, camDir.z);
    const right = -Math.cos(yaw) * dx + Math.sin(yaw) * dz, fwd = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    ang = Math.atan2(right, fwd);   // 0 が前（画面の上）
    // 真後ろの行き先を下の中央へ出すと、主人公の背中が目的地に見える。
    // 後ろは左右の縁へ寄せる（河田の確認表・五3）。
    const ex = Math.sin(ang), ey = -Math.cos(ang);
    const kx = ex ? ((ex > 0 ? W - m : m) - W / 2) / ex : Infinity, ky = ey ? ((ey > 0 ? H - 90 : 70) - H / 2) / ey : Infinity;
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    x = W / 2 + ex * k; y = H / 2 + ey * k; edge = true;
    if (fwd < 0) x = right >= 0 ? W - m : m;
  }
  // 上端へ出す経路も札を避ける。札を残す戦では、画面内の場所の印も同じように避ける。
  // 八尾・若江では上端と画面内の印だけこの処理を通らず、目標や釦に重なっていた。
  if (edge || rt.def.keepBattleSigns && !unit) {
    for (const r of hud?.hudRects?.() || []) if (x + 60 > r.left && x - 60 < r.right && y + 22 > r.top && y - 22 < r.bottom) y = r.bottom + 26 <= H - 90 ? r.bottom + 26 : Math.max(30, r.top - 26);
  }
  // def.goalSignNameOnly（稲生）：名のある相手が画面に見えている間は、頭上の名札と赤い▼だけにして金の▼を重ねない（kaito AN「一人の相手には札一つ」）
  if (!unit && !edge && u?.name && rt.def.goalSignNameOnly) return hide();
  if (el._edge !== edge) { el._edge = edge; el._tw = 0; el._tag.classList.remove('bob'); }
  // 人名の別札を出さず、目標の印に呼び名を添える。
  // 11/8 critic60（十三1・九1）：名の無い相手に「狙う敵」と書かない。字は名と「80m」だけ
  // 11/14 クラウドB：「ねらい」の字も出さない（kaito 10/23 字は名前と人数だけ。岩村60秒の写真で無名の相手に「ねらい」）。名の無い相手は印だけ、名のある相手は名だけ
  const label = enemy ? rt.def.goalSignUnitNoLabel ? '' : (edge ? normal?.label || u?.name || '' : u?.name || '') : rt.def.goalPinNoLabel ? '' : placeName(rt, t) || '';   // def.goalPinNoLabel：場所の▼に字を出さない（K104 金ヶ崎 11/14 司令塔）
  // 名前・距離を一つにまとめ、画面の内外で同じ相手を案内する。
  // 11/13 K288（kaito 11/7「距離45m を書かない」）：天王寺の「毛利の先鋒 10m」をここで出していた。距離の字は付けず名前だけ（MB係四）
  // 11/17 K358（稲生の写真）：行き先の札に「ここへ・」が付き四つ重なっていた→場所の名だけ。K358（n-map・刀根坂）：画面の外の場所の行き先は縁の矢印だけで字を出さない
  const shown = enemy ? label : edge ? '' : label;
  const frame = !rt.def.goalEnemyFlag && enemy && u && !edge && u.mesh?.visible !== false && !u.camHidden ? hud.measurePersonFrame(u, rt) : null;
  // 今の相手一人だけを囲む。周囲の敵の三角・味方の丸とは形で区別する。
  el._frame.hidden = !frame;
  if (frame) {
    el._frame.style.left = ((frame.left + frame.right - Math.max(44, frame.right - frame.left)) / 2) + 'px';
    el._frame.style.top = frame.top + 'px';
    el._frame.style.width = Math.max(44, frame.right - frame.left) + 'px';
    el._frame.style.height = Math.max(56, frame.bottom - frame.top) + 'px';
    x = (frame.left + frame.right) / 2; y = frame.top - 8;
  }
  if (shown !== el._label) { el._label = shown; el._name.textContent = shown; el._name.hidden = !shown; el._tw = 0; }
  el._tri.style.display = enemy && !edge || groundPin && (!edge || t.arrived) ? 'none' : '';
  // ▼指定の戦では、画面外でも形を回さず縁の位置で行き先を示す。
  el._tri.style.transform = edge && !rt.def.goalSignTriangle ? `rotate(${ang + Math.PI}rad)` : '';
  el._tri.style.clipPath = rt.def.goalSignTriangle ? 'polygon(0 0,100% 0,50% 100%)' : '';
  el._tri.style.width = edge ? '30px' : ''; el._tri.style.height = edge ? '26px' : '';
  el._tri.style.border = edge ? '0' : ''; el._tri.style.background = edge ? '#fff3ba' : '';
  if (!el._tw || el._twH !== VIEW.h || el._twW !== VIEW.w || el._twEdge !== edge) {
    el._tw = el._tag.offsetWidth || 24; el._th = el._tag.offsetHeight || 20; el._twGuess = !el._tag.offsetWidth;
    el._twH = VIEW.h; el._twW = VIEW.w; el._twEdge = edge;
  }
  const tw = el._tw, th = el._th;
  // 11/17 クラウド K358 河田 874×402：札が隠れている間（幅 0）に測った仮の幅 24 を覚えたままにすると、長い名（「百々綱家の隊」）の札が
  //   右上の任務の札を避けきれずに重なった。測れなかった時は覚えず、次のコマで測り直す
  if (el._twGuess) el._tw = 0;
  // 縁の札は中心を基準に描く。下半分も含めて釦・顔・画面端を避ける。
  // 11/17 クラウド K358 岐阜 874×402：縁の札は向きへ回した矢じりが箱の外へはみ出し、左下の「やり」の釦にかかった。上下に回した分の余白を足す
  const above = edge ? th / 2 + 6 : th, below = edge ? th / 2 + 14 : 5;
  if (rt.def.goalSignNoEdge) {
    // 山中城：札全体が収まらない時は縁へ押し戻さず隠す。▼は行き先の真上を保つ。
    const sa = safeInsets(), left = x - tw / 2, right = x + tw / 2, top = y - th, bottom = y + 5;
    if (left < sa.left + 8 || right > W - sa.right - 8 || top < sa.top + 8 || bottom > H - sa.bottom - 8 ||
      (hud?.hudRects?.() || []).some((r) => right > r.left && left < r.right && bottom > r.top && top < r.bottom)) {
      el._sx = el._sy = null;
      return hide();
    }
    // 避けた位置や前の行き先から補間すると、釦を横切ったり別の場所を指したりする。
    el._sx = x; el._sy = y; el._sEdge = edge;
  } else {
    // 携帯の切り欠きにも札の名を隠さない。補間後も同じ余白を保つ。
    const sa = safeInsets(), minX = sa.left + tw / 2 + 8, maxX = W - sa.right - tw / 2 - 8;
    x = Math.max(minX, Math.min(maxX, x));
    const minY = sa.top + above + 8, maxY = Math.min(H - sa.bottom - 80, H - sa.bottom - below - 8);
    y = Math.max(minY, Math.min(maxY, y));
    // 画面の中の▼も、右上の進み具合の札などの四角に重なる時は、札の下へずらす（全戦・fix_inaba_1105 の bot「#h-prog と ▼ が重なる」）
    // 11/8 critic60 関ヶ原（五3）：画面の縁の▼も、縁へ寄せた後に左上の音・止める・設定の釦に重ねない（前の避けは縁へ寄せる前だけだった）
    // 11/16 クラウドせ 三方ヶ原 874×402：一度の見回りでは、右上の目標（#mk-goals）の下へずらした先で次の札に当たり、
    //   その札の上へ戻されて目標に重なったままだった。重ならなくなるまで見回し、三度目からは札の左へ逃がす
    const hrs = hud?.hudRects?.() || [];
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const hr of hrs) {
        const top = y - above, bot = y + below;
        if (x + tw / 2 > hr.left && x - tw / 2 < hr.right && bot > hr.top && top < hr.bottom) {
          moved = true;
          const ny = hr.bottom + 6 + above;
          // 11/11 クラウドか 姉川 874×402：左下の命の札（#jk-vit）は下へも左へも逃げ場が無く、縁の▼が札に乗ったままだった。下が無理なら札の上へ
          const uy = hr.top - 6 - below, lx = hr.left - tw / 2 - 8;
          if (pass < 2 && ny <= maxY) y = ny;
          else if (lx >= minX) x = lx;
          else if (uy >= minY) y = uy;
          // 11/18 クラウド sune 874×402：背の高い札（名・旗・↓で116画素）が左の縁で、左上の保存・止める・設定と左下のやり・刀の釦の間に入らず、
          //   上へも下へも左へも逃げられずに釦へ乗ったままだった（強右衛門の脱出 40秒）。その時は札の右へ逃がす
          else if (hr.right + tw / 2 + 8 <= maxX) x = hr.right + tw / 2 + 8;
          else x = Math.max(minX, lx);
        }
      }
      if (!moved) break;
    }
    // 11/8 critic60 木津川（kaito「目標の名札が上下にめっちゃ動く」）：船の揺れ・札よけの段差で、札が一コマごとに上下へ跳ねた。
    //   小さな動きはなめらかに追わせ、大きく跳んだ時（画面の内外の切り替え・相手の替わり）だけすぐ移す
    const clearX = x, clearY = y;
    if (el._sx == null || el._sEdge !== edge || Math.abs(x - el._sx) > 80 || Math.abs(y - el._sy) > 80) { el._sx = x; el._sy = y; el._sEdge = edge; }
    else { el._sx += (x - el._sx) * .3; el._sy += (y - el._sy) * .15; }
    // 名が長くなった時や画面幅が変わった時は、補間前の位置が札の実寸をはみ出す。
    // なめらかに動かした後も札全体を画面内へ収め、次のコマの起点も揃える。
    x = el._sx = Math.max(minX, Math.min(maxX, el._sx));
    y = el._sy = Math.max(minY, Math.min(maxY, el._sy));
    // 高遠の通し確認：札を避けた後の補間で、前の位置から任務の札へ戻っていた。
    // 重なる間だけ、既に避けてある位置を使い、次のコマもそこから動かす。
    if ((hud?.hudRects?.() || []).some(r => x + tw / 2 > r.left && x - tw / 2 < r.right &&
        y + below > r.top && y - above < r.bottom)) {
      x = el._sx = clearX; y = el._sy = clearY;
    }
  }
  // 本人の足元から向かう先へ、短い矢印一本。画面外は縁の矢印に任せる。
  // def.goalSignNoFootArrow：足元の矢印も描かない。行き先は頭上の▼一つ（K172・11/18 賤ヶ岳 持ち主の写真 450秒）
  if (!rt.def.goalSignNoFootArrow && !groundPin && !edge && d > 3 && proj(rt, p.x, p.y + .12, p.z)) {
    const sx = v.x, sy = v.y;
    if (proj(rt, t.x, gy + .12, t.z)) {
      const ax = v.x - sx, ay = v.y - sy, len = Math.hypot(ax, ay);
      if (len > 76) {
        const ux = ax / len, uy = ay / len, start = 24, end = Math.min(88, len - 24);
        const bx = sx + ux * start, by = sy + uy * start, tx = sx + ux * end, ty = sy + uy * end;
        const nx = tx - ux * 16, ny = ty - uy * 16;
        const left = Math.min(bx, tx) - 13, right = Math.max(bx, tx) + 13;
        const top = Math.min(by, ty) - 13, bottom = Math.max(by, ty) + 13;
        if (left > 8 && right < W - 8 && top > 8 && bottom < H - 8 &&
            !(hud?.hudRects?.() || []).some(r => right > r.left && left < r.right && bottom > r.top && top < r.bottom))
          path = `M${bx-uy*5},${by+ux*5}L${nx-uy*5},${ny+ux*5}L${nx-uy*12},${ny+ux*12}L${tx},${ty}L${nx+uy*12},${ny-ux*12}L${nx+uy*5},${ny-ux*5}L${bx+uy*5},${by-ux*5}Z`;
      }
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
  hud.goalSignVisible = true;
  r.left = x - tw / 2; r.right = x + tw / 2; r.top = y - (edge ? th / 2 : th); r.bottom = y + (edge ? th / 2 : 5);
}
