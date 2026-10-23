// 行き先は足元の小旗と輪。画面外では同じ印に矢印を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   着いたら消す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective } from './mission_guide.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<b>ここへ</b><svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true"><g stroke="#14120f" stroke-width="5" stroke-linejoin="round"><ellipse cx="20" cy="24" rx="16" ry="3" fill="none"/><path d="M18 24V2H33L29 8L33 13H18" fill="#fff3ba"/></g><g stroke="#fff3ba" stroke-width="2" stroke-linejoin="round"><ellipse cx="20" cy="24" rx="16" ry="3" fill="none"/><path d="M18 24V2H33L29 8L33 13H18" fill="#fff3ba"/></g></svg><i hidden>➜</i>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:56px;height:52px;text-align:center;pointer-events:none;z-index:3;color:#fff3ba;font-size:13px;line-height:18px';
  el.firstChild.style.cssText = 'display:block;background:#14120f;border-radius:3px';
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
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && rt.player?.u?.alive ? target(rt) : null;
  if (!want) { if (pin) pin.hidden = true; return; }
  if (!pin) pin = make();
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
  const me = rt.player.u.pos;
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.hide ?? (want.r || 6);
  pin.hidden = d <= near;
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  goalPoint.set(want.x, rt.world.heightAt(want.x, want.z) + .08, want.z).project(rt.camera);
  if (!Number.isFinite(goalPoint.x) || !Number.isFinite(goalPoint.y)) { pin.hidden = true; return; }
  const behind = goalPoint.z < -1 || goalPoint.z > 1;
  let dx = goalPoint.x * (behind ? -1 : 1), dy = -goalPoint.y * (behind ? -1 : 1);
  const rects = hud.hudRects();
  let x = (dx + 1) * W / 2, y = (dy + 1) * H / 2;
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  const outside = behind || !goalFree(x, y, W, H, rects);
  if (outside) {
    const scale = Math.max(Math.abs(dx) / .88, Math.abs(dy) / .68, .001);
    dx /= scale; dy /= scale;
    x = (dx + 1) * W / 2; y = (dy + 1) * H / 2;
  }
  // 右上の札や操作面を避ける。空きが無ければ重ねず畳む。
  if (!goalFree(x, y, W, H, rects)) {
    let found = false;
    for (let k = 1; k <= 30; k++) {
      const offset = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (goalFree(x, y + offset, W, H, rects)) { y += offset; found = true; break; }
      if (goalFree(x + offset, y, W, H, rects)) { x += offset; found = true; break; }
    }
    if (!found) { pin.hidden = true; return; }
  }
  const arrow = pin.children[2];
  arrow.hidden = !outside;
  pin.children[1].style.visibility = '';
  pin.children[1].style.transform = outside ? 'translateX(-12px) scale(.7)' : '';
  arrow.style.left = '34px';
  if (outside) arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  pin.style.transform = `translate(${Math.round(x - 28)}px,${Math.round(y - 46)}px)`;
}
const goalPoint = new THREE.Vector3();
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
  if (!on) { dot.style.display = 'none'; return; }
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
