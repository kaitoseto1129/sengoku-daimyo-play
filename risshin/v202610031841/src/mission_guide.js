// 任務の手引き。印・形・材質は使い回し、行き先と進みは半秒ごとに読む。
import * as THREE from 'three';
import { S, K } from './settings.js';
import { isTouch } from './touch.js';

function init(rt) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.5); shape.lineTo(0.9, 0.2); shape.lineTo(0.32, 0.2);
  shape.lineTo(0.32, -1); shape.lineTo(-0.32, -1); shape.lineTo(-0.32, 0.2);
  shape.lineTo(-0.9, 0.2); shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({ color: 0xf3d98a, side: THREE.DoubleSide,
    transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const arrow = new THREE.Mesh(geometry, material);
  arrow.frustumCulled = false; arrow.visible = false; rt.scene.add(arrow);
  return rt.missionGuide = { arrow, base: geometry.attributes.position.array.slice(), marker: null,
    pos: { x: 0, z: 0 }, scan: 0, draw: 0, key: '', best: Infinity, progress: '',
    stalled: 0, lastSay: -99, spoken: new Set() };
}

function select(rt, g) {
  let objective = null;
  for (const o of rt.objectives) {
    if (o.state || o.kind === 'side') continue;
    if (!objective || o.kind === 'order' || (objective.kind !== 'order' && (o.t || 0) >= (objective.t || 0))) objective = o;
  }
  let best = null, score = -Infinity;
  for (const m of rt.markers) {
    if (m.noGuide || m.id === 'horse-loose' || m.id === 'focus' || /^taisho_/.test(m.id) || (m.group && !m.group.count)) continue;
    const own = rt.objectives.find((o) => o.id === m.id);
    if (own?.state) continue;
    const p = typeof m.pos === 'function' ? m.pos() : m.pos;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const label = String(typeof m.label === 'function' ? m.label() : m.label || '');
    const name = label.split(/[（(・　 ]/)[0];
    let s = m.red ? 0 : 10;
    if (objective && (m.id === objective.id || (name.length >= 2 && objective.text.includes(name)))) s += 100;
    if (m.id === '_gate') s += 120;
    if (s > score) { score = s; best = m; g.pos.x = p.x; g.pos.z = p.z; }
  }
  g.marker = best;
  const key = best ? `${rt.phase}|${objective?.id || ''}|${(objective?.text || '').replace(/[0-9０-９]+/g, '数')}|${best.id}` : '';
  if (key !== g.key) { g.key = key; g.best = Infinity; g.stalled = 0; }
  const distance = best ? Math.hypot(g.pos.x - rt.player.u.pos.x, g.pos.z - rt.player.u.pos.z) : 0;
  const progress = objective?.progress || '';
  const fighting = rt.player.inCombatT > 0 && rt.army.nearestEnemy(rt.player.u, 4,
    (enemy) => !rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, enemy.pos));
  if (!best || distance < g.best - 2 || progress !== g.progress || fighting) {
    g.best = distance; g.stalled = 0;
  } else g.stalled += 0.5;
  g.progress = progress;
  // 台詞が出ている時や順番待ちには割り込まない。任務ごとに一度、八秒以上あける。
  if (g.stalled < 20 || g.spoken.has(key) || rt.t - g.lastSay < 8 ||
    (rt._sayGate || 0) > rt.t || rt.hud.subT > 0 || rt.hud.subQ.length) return;
  let text;
  if (distance > 5) text = '地面の矢印の方へ進もう。行き先は端の印でも分かるぞ。';
  else {
    const it = rt.nearestInteract();
    if (it) text = isTouch ? `${it.label}。光る操作の丸を${it.hold ? '長押ししよう' : '押そう'}。` : `${K('use')} を${it.hold ? '長押しして' : '押して'}、${it.label}。`;
    else if (best.red) text = '印の敵へ近づこう。構えて身を守り、間合いに入ったら打とう。';
    else text = '行き先に着いたぞ。任務の札を見て、次の一手を確かめよう。';
  }
  g.spoken.add(key); g.lastSay = rt.t;
  rt.say(rt.G.lord ? '近習' : '味方の兵', text, 4);
}

export function missionGuideTick(rt, dt) {
  let g = rt.missionGuide;
  const on = !S.reduceGuidance && !rt.over && rt.player.u.alive && !rt.choice &&
    !rt.player.camShot && rt.phase !== 'wait' && !(rt.prelude && rt.prelude !== 'done');
  if (!on) { if (g) { g.arrow.visible = false; g.marker = null; g.stalled = 0; g.scan = 0; } return; }
  if (!g) g = init(rt);
  if ((g.scan -= dt) <= 0) { g.scan = 0.5; select(rt, g); }
  const u = rt.player.u.pos, dx = g.pos.x - u.x, dz = g.pos.z - u.z, d = Math.hypot(dx, dz);
  g.arrow.visible = !!g.marker && d > 4;
  if (!g.arrow.visible || (g.draw -= dt) > 0) return;
  g.draw = 0.1;
  const fx = dx / d, fz = dz / d, at = Math.min(3.5, d - 1.5);
  const a = g.arrow.geometry.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const side = g.base[i * 3], forward = g.base[i * 3 + 1] + at;
    const x = u.x + fx * forward + fz * side, z = u.z + fz * forward - fx * side;
    a.setXYZ(i, x, rt.world.heightAt(x, z) + 0.09, z);
  }
  a.needsUpdate = true;
}

export function missionGuideDispose(rt) {
  const g = rt.missionGuide;
  if (!g) return;
  rt.scene.remove(g.arrow); g.arrow.geometry.dispose(); g.arrow.material.dispose();
  rt.missionGuide = null;
}
