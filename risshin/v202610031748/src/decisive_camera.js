// 決め手に三秒だけ寄る。向き・位置・時の速さには触らず、操作を保つ。
import { reduceMotion } from './settings.js';

export function decisiveCameraEvent(rt, type, pos, team, big) {
  const p = rt.player, game = rt.game;
  if (!p || !p.u.alive || rt.over || rt.def.dojo || rt.def.town || reduceMotion() ||
      rt.flags.quiet || (rt.prelude && rt.prelude !== 'done') ||
      p.camShot || p.cine || p.aiming || p.overHold || (p.introT > 0) ||
      (game && (game.paused || game.photo || game.cmdMap))) return;
  const commander = type === 'EVENT_COMMANDER_KILLED' && team === 1;
  const gate = type === 'EVENT_GATE_BREAK';
  const rout = (type === 'EVENT_UNIT_BREAK' || type === 'EVENT_RETREAT') && big && team === 1;
  const volley = type === 'EVENT_VOLLEY';
  if (!commander && !gate && !rout && !volley) return;
  // 軍全体の総崩れには位置が付かない。近い敵の隊を一度だけ探す。
  if (!pos && rout) {
    let nearest = Infinity;
    for (const g of rt.army.groups) {
      if (g.team !== 1 || !g.routed || !g.anchor) continue;
      const d = Math.hypot(g.anchor.x - p.u.pos.x, g.anchor.z - p.u.pos.z);
      if (d < nearest) { nearest = d; pos = g.anchor; }
    }
  }
  if (!pos) return;
  const c = rt.camera;
  if (!c) return;
  const dx = pos.x - c.position.x, dz = pos.z - c.position.z;
  const d = Math.hypot(dx, dz), m = c.matrixWorld.elements;
  // 背後・遠方の出来事では寄らない。視点を勝手に振り向かせない。
  if (d < 1 || d > (volley ? 45 : 65) || -(dx * m[8] + dz * m[10]) / d < 0.65) return;
  const now = performance.now() / 1000;
  let s = rt.decisiveCamera;
  if (s && (now < s.until || rt.t < s.next || rt.t < (s.repeat[type] ?? -99))) return;
  if (!s) s = rt.decisiveCamera = { applied: 0, repeat: {} };
  s.type = type; s.start = now; s.until = now + 3;
  s.next = rt.t + 18; s.repeat[type] = rt.t + 45;
  s.zoom = commander ? 6 : gate ? 5 : rout ? 4 : 3;
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
  const s = rt.decisiveCamera, p = rt.player;
  if (!s) return;
  if (reduceMotion() || !p.u.alive || rt.over || p.camShot || p.cine || p.aiming || p.overHold) {
    s.until = 0;
    return;
  }
  const now = performance.now() / 1000;
  if (now >= s.until) return;
  // ゆっくり寄って、最後の一秒で元に戻る。既存の遅回し中も三秒で終わる。
  const k = Math.max(0, Math.min(1, (now - s.start) / 0.5, (s.until - now)));
  s.applied = Math.min(s.zoom * k * k * (3 - 2 * k), Math.max(0, camera.fov - 35));
  if (s.applied) { camera.fov -= s.applied; camera.updateProjectionMatrix(); }
}
