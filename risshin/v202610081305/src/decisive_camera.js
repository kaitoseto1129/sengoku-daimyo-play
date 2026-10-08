// 決め手に一息だけ寄る。向きと位置を奪わず、操作は保つ。
import { reduceMotion } from './settings.js';

export function decisiveCameraEvent(rt, type, pos, team, big, text = '') {
  const p = rt.player, game = rt.game;
  if (!p || !p.u.alive || rt.over || rt.def.dojo || rt.def.town ||
      rt.flags?.quiet || (rt.prelude && rt.prelude !== 'done') ||
      (p.introT > 0) ||
      (game && (game.paused || game.photo || game.cmdMap || game.helpOpen || game.deployment || game.hud?.introWaiting)) || rt._rts?.on) return;
  const commander = type === 'EVENT_COMMANDER_KILLED';
  const gate = type === 'EVENT_GATE_BREAK';
  if (!commander && !gate) return;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
  const c = rt.camera;
  if (!c) return;
  const dx = pos.x - c.position.x, dz = pos.z - c.position.z;
  const d = Math.hypot(dx, dz), m = c.matrixWorld.elements;
  if (d > 65) return;
  const now = performance.now() / 1000;
  let s = rt.decisiveCamera;
  if (s && now < s.next) return;
  if (!s) s = rt.decisiveCamera = { applied: 0 };
  s.start = now; s.until = now + 1.8; s.next = now + 8;
  // 背後では字幕だけ。動きを減らす設定でも、出来事の一言は残す。
  s.motion = !(p.inCombatT > 0 || p.dodgeT > 0 || p.pending || p.swingImpact || p.u.atk || p.charging || now - (p.manualLookAt ?? -10) < 1.5) && !reduceMotion() && !p.camShot && !p.cine && !p.aiming && !(p.draw > 0) && !p.radial && !p.cmdOpen && !p.lock && !p.overHold &&
    d >= 1 && -(dx * m[8] + dz * m[10]) / d >= 0.65;
  s.zoom = commander ? 6 : 5;
  rt.hud.say('', text || (gate ? '門が破れた' : team === 0 ? '味方の大将が討たれた' : '敵の大将が討たれた'), 1.8, true);
}

// 遅回しも実時間で一・八秒まで。途中で構えたり別の演出が始まれば戻す。
export function decisiveCameraSpeed(rt) {
  const s = rt.decisiveCamera, p = rt.player, game = rt.game;
  if (!s || !s.motion || performance.now() / 1000 >= s.until) return 1;
  if (p.inCombatT > 0 || p.dodgeT > 0 || p.pending || p.swingImpact || p.u.atk || p.charging || performance.now() / 1000 - (p.manualLookAt ?? -10) < 1.5 || reduceMotion() || !p.u.alive || p.camShot || p.cine || p.aiming || p.draw > 0 || p.radial || p.cmdOpen || p.lock || p.overHold ||
      (game && (game.paused || game.photo || game.cmdMap || game.helpOpen || game.deployment || game.hud?.introWaiting)) || rt._rts?.on || rt.over) {
    s.motion = false;
    return 1;
  }
  return 0.75;
}

// 前のコマの寄りを外してから、通常の視野を計算する。毎コマ入れ物を作らない。
export function decisiveCameraReset(rt, camera) {
  const s = rt.decisiveCamera;
  if (!s || !s.applied) return;
  camera.fov += s.applied;
  s.applied = 0;
  camera.updateProjectionMatrix();
}

export function decisiveCameraApply(rt, camera) {
  const s = rt.decisiveCamera;
  if (!s) return;
  if (decisiveCameraSpeed(rt) === 1) return;
  const now = performance.now() / 1000;
  if (now >= s.until) return;
  // なめらかに寄って戻る。毎コマ入れ物を作らない。
  const k = Math.max(0, Math.min(1, (now - s.start) / 0.35, (s.until - now) / 0.55));
  s.applied = Math.min(s.zoom * k * k * (3 - 2 * k), Math.max(0, camera.fov - 35));
  if (s.applied) { camera.fov -= s.applied; camera.updateProjectionMatrix(); }
}
