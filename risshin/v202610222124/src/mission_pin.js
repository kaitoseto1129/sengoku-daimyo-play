// 行き先は足元の小旗と輪。画面外では同じ印に矢印を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   着いたら消す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { S } from './settings.js';
import { currentObjective } from './mission_guide.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<b>ここへ</b><svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true"><g stroke="#14120f" stroke-width="5" stroke-linejoin="round"><ellipse cx="20" cy="24" rx="16" ry="3" fill="none"/><path d="M18 24V2H33L29 8L33 13H18" fill="#fff3ba"/></g><g stroke="#fff3ba" stroke-width="2" stroke-linejoin="round"><ellipse cx="20" cy="24" rx="16" ry="3" fill="none"/><path d="M18 24V2H33L29 8L33 13H18" fill="#fff3ba"/></g></svg><i hidden>➜</i>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:56px;height:52px;text-align:center;pointer-events:none;z-index:3;color:#fff3ba;font-size:13px;line-height:18px';
  el.firstChild.style.cssText = 'display:none'; // 字は出さない（kaito 10/23）。小旗と矢印だけ
  el.lastChild.style.cssText = 'position:absolute;left:18px;top:22px;font-size:26px;font-style:normal;text-shadow:0 2px 2px #14120f,2px 0 2px #14120f';
  const style = document.createElement('style');
  style.textContent = '#hud.photo #mission-goal,#hud.ending #mission-goal,#hud:has(#bigmap:not([hidden])) #mission-goal,#hud:has(#cine.on) #mission-goal{display:none}';
  el.appendChild(style);
  return el;
}

// 町・道場・古い案内を残す戦を除き、共通の小旗一つで案内する。
export const pinGuideOn = (rt) => !!rt && !rt.def.town && !rt.def.dojo && !rt.def.oldGuide;

const tmp = { x: 0, z: 0, r: 6 };
function target(rt) {
  if (rt.def.missionPin) return rt.def.missionPin(rt);
  // 定義の無い戦は、任務の手引きが選んだ行き先（今の任務と同じ印・同じ半径）へ立てる。
  const g = rt.missionGuide, m = g?.marker;
  if (!m || !g.objective || g.objective.id === '_wait' || g.objective !== currentObjective(rt)) return null;
  tmp.x = g.pos.x; tmp.z = g.pos.z; tmp.r = m.guideRadius || 6;
  return tmp;
}

export function updateMissionPin(rt) {
  // 通常の戦は描画面の行き先一つへまとめる。稲生の到着印だけを残す。
  const want = pinGuideOn(rt) && rt.def.key === 'inou' && !rt.over && !rt.choice && rt.player?.u?.alive ? target(rt) : null;
  if (!want) { if (pin) pin.hidden = true; return; }
  if (!pin) pin = make();
  const caption = rt.def.missionPinCaption ?? 'ここへ';
  if (pin.firstChild.textContent !== caption) pin.firstChild.textContent = caption;
  const captionDisplay = caption ? 'block' : 'none';
  if (pin.firstChild.style.display !== captionDisplay) pin.firstChild.style.display = captionDisplay;
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
  // 行き先が群れの真ん中だと毎コマ少しずつ動き、印が震える（kaito 10/23「グラグラ揺れる」）。
  //   遠くへ跳んだ時だけすぐ移し、ふだんは一メートル足らずの揺れを無視して、ゆっくり追わせる。地面の高さも同じ点で取る。
  const now = performance.now(), U = pinAt;
  const dt = Math.min(0.1, Math.max(0, (now - (U.at || now)) / 1000)); U.at = now;
  if (U.rt !== rt || Math.hypot(want.x - U.x, want.z - U.z) > 15) { U.x = want.x; U.z = want.z; U.rt = rt; U.y = rt.world.heightAt(U.x, U.z); U.ox = 0; U.oy = 0; }
  else if (Math.hypot(want.x - U.x, want.z - U.z) > 0.8) {
    const k = 1 - Math.exp(-dt * 1.5);
    U.x += (want.x - U.x) * k; U.z += (want.z - U.z) * k;
    U.y += (rt.world.heightAt(U.x, U.z) - U.y) * k;
  }
  const me = rt.player.u.pos;
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.hide ?? (want.r || 6);
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  pin.hidden = d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  goalPoint.set(U.x, U.y + .08, U.z).project(rt.camera);
  if (!Number.isFinite(goalPoint.x) || !Number.isFinite(goalPoint.y)) { pin.hidden = true; return; }
  const behind = goalPoint.z < -1 || goalPoint.z > 1;
  let dx = goalPoint.x * (behind ? -1 : 1), dy = -goalPoint.y * (behind ? -1 : 1);
  const rects = hud.hudRects();
  let x = (dx + 1) * W / 2, y = (dy + 1) * H / 2;
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  //   画面の端・札の縁でも、前のコマと同じ形を少しの間は保つ（地面の旗と端の矢印が入れ替わり続けない）。
  let outside = behind || !goalFree(x, y, W, H, rects);
  if (!behind && outside !== U.out && now - (U.outAt || 0) < 400) outside = U.out;
  else if (outside !== U.out) { U.out = outside; U.outAt = now; }
  if (outside) {
    // 足元の投影は画面の下に出る。進む方向は地面上の向きから求め、前の目標へ下向きの矢印を出さない。
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const gx = want.x - me.x, gz = want.z - me.z;
    dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    dy = -(gx * Math.sin(yaw) + gz * Math.cos(yaw));
    const scale = Math.min((W / 2 - 48) / Math.max(Math.abs(dx), .001), (H / 2 - 80) / Math.max(Math.abs(dy), .001));
    x = W / 2 + dx * scale; y = H / 2 + dy * scale;
  }
  // 右上の札や操作面を避ける。空きが無ければ重ねず畳む。
  //   前のコマのずらしがまだ空いていれば、それを使い続ける（毎コマ選び直すと跳ねる）。
  if (!goalFree(x, y, W, H, rects) && (U.ox || U.oy) && goalFree(x + U.ox, y + U.oy, W, H, rects)) { x += U.ox; y += U.oy; }
  else if (goalFree(x, y, W, H, rects)) { U.ox = 0; U.oy = 0; }
  else {
    let found = false;
    for (let k = 1; k <= 30; k++) {
      const offset = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (goalFree(x, y + offset, W, H, rects)) { y += offset; U.ox = 0; U.oy = offset; found = true; break; }
      if (goalFree(x + offset, y, W, H, rects)) { x += offset; U.ox = offset; U.oy = 0; found = true; break; }
    }
    if (!found) { pin.hidden = true; return; }
  }
  const arrow = pin.children[2];
  arrow.hidden = !outside;
  pin.children[1].style.visibility = '';
  pin.children[1].style.transform = outside ? 'translateX(-12px) scale(.7)' : '';
  arrow.style.left = '34px';
  if (outside) arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  // 丸めずに少数一桁で置く（一画素ずつ跳ねない）。上下はゆっくり穏やかに。
  pin.style.transform = `translate(${(x - 28).toFixed(1)}px,${(y - 46 + (S.reduceMotion ? 0 : 2 * Math.sin(now / 700))).toFixed(1)}px)`;
}
const goalPoint = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  if (x < 36 || x > W - 36 || y < 60 || y > H - 14) return false;
  for (const r of rects) if (x + 36 >= r.left && x - 36 <= r.right && y + 6 >= r.top && y - 52 <= r.bottom) return false;
  return true;
}

// 槍の狙う先の小さな点（kaito 10/23 稲生 23）。狙っている敵がいれば胴に、いなければ穂先の先の地面に。
//   点は一つを使い回し、位置だけ毎コマ動かす。
let dot = null;
const v = new THREE.Vector3();
export function updateAimDot(rt, root) {
  const p = rt.player, u = p?.u;
  const on = pinGuideOn(rt) && u?.alive && !rt.over && !rt.choice && !p.camShot && !p.mounted && (p.weapon === 'spear' || p.weapon === 'sword');
  if (!dot) {
    dot = document.createElement('i');
    dot.id = 'aim-dot'; dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:absolute;left:0;top:0;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#f3e2b8;box-shadow:0 0 0 1.5px #14120f;pointer-events:none;z-index:2;display:none';
  }
  if (dot.parentNode !== root) root.appendChild(dot);
  // 敵の胴の赤い点は出さない（kaito 10/23「点の印は使わない」）。狙いの点は使わない。
  if (!on || true) { dot.style.display = 'none'; return; }
  const t = p.aimed?.alive && !p.aimed.fleeing ? p.aimed : p.lock?.alive ? p.lock : null;
  if (t && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 6) v.set(t.pos.x, t.pos.y + (t.mounted ? 2.2 : 1.15), t.pos.z);
  else {
    const reach = p.weapon === 'spear' ? 2.9 : 2;
    const x = u.pos.x + Math.sin(p.yaw) * reach, z = u.pos.z + Math.cos(p.yaw) * reach;
    v.set(x, rt.world.heightAt(x, z) + 0.05, z);
  }
  v.project(rt.camera);
  if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { dot.style.display = 'none'; return; }
  dot.style.display = 'block';
  dot.style.background = t ? '#e8573e' : '#f3e2b8';
  dot.style.transform = `translate(${Math.round((v.x + 1) / 2 * innerWidth)}px,${Math.round((1 - v.y) / 2 * innerHeight)}px)`;
}
