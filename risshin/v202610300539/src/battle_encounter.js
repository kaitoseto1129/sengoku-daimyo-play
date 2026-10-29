// 接敵した名将を一度だけ見せる。兵・音源・毎コマの入れ物は増やさない。
import { playMusic } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { reduceMotion } from './settings.js';

export function encounterTick(rt, dt) {
  if (rt.def.town || rt.def.dojo) return;
  let e = rt.encounter;
  if (!e) e = rt.encounter = { seen: new Set(), scan: 0, left: 0, gap: 0, label: null };
  e.left = Math.max(0, e.left - dt); e.gap -= dt;
  if (e.label) e.label.hidden = e.left <= 0 || rt.over || !rt.player.u.alive;
  if (rt.over || !rt.player.u.alive || rt.flags.quiet || rt.choice ||
      rt.prelude && rt.prelude !== 'done' || rt.player.introT > 0) return;
  if ((e.scan -= dt) > 0 || e.gap > 0) return;
  e.scan = 0.25;
  const p = rt.player, pos = p.u.pos;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.group?.routed || u.team === p.u.team ||
        u.type !== 'busho' || !u.name || e.seen.has(u.name) ||
        Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z) > 24 ||
        rt.army.wallBetween(pos, p.u.team, u.pos) || !sightPoint(rt, u.pos, 30)) continue;
    e.seen.add(u.name); e.left = 1.8; e.gap = 8;
    if (!e.label) {
      e.label = document.createElement('div');
      e.label.style.cssText = 'position:absolute;left:20%;right:20%;top:26%;text-align:center;font-size:clamp(28px,5vw,46px);font-weight:bold;color:#fff0e0;text-shadow:0 2px 5px #000,0 0 12px #000;pointer-events:none;z-index:12';
      rt.hud.root.appendChild(e.label);
    }
    e.label.textContent = u.name; e.label.hidden = false;
    playMusic('climax');
    rt.army.play('jindaiko', u.pos, 0.8);
    if (!reduceMotion() && !p.aiming && !p.camShot && !p.cine && p.lookIdle >= 0.2)
      p.cine = { x: u.pos.x, z: u.pos.z, t: 0.85, encounter: true };
    break;
  }
}

export function encounterDispose(rt) {
  rt.encounter?.label?.remove();
  rt.encounter = null;
}
