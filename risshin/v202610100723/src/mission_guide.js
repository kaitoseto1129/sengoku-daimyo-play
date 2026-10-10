// 任務の手引き。印・形・材質は使い回し、行き先と進みは半秒ごとに読む。
import * as THREE from 'three';
import { S } from './settings.js';
import { intelText } from './battle_intel.js';
import { groundAt, deckAt } from './floors.js';

function init(rt) {
  // 塗った大矢印をやめ、坂にも沿う短い線にする。頂点は一度だけ作る。
  const geometry = new THREE.BufferGeometry();
  const points = [];
  const segment = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) {
      points.push(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0,
        x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (i + 1) / n, 0);
    }
  };
  segment(0, -1, 0, 1, 8);
  segment(-0.35, 0.5, 0, 1, 3); segment(0.35, 0.5, 0, 1, 3);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xc7bda7,
    transparent: true, opacity: 0.38, depthWrite: false });
  const arrow = new THREE.LineSegments(geometry, material);
  arrow.frustumCulled = false; arrow.visible = false; rt.scene.add(arrow);
  return rt.missionGuide = { arrow, base: geometry.attributes.position.array.slice(), marker: null,
    pos: { x: 0, y: 0, z: 0 }, objective: null, waitObjective: { id: '_wait', kind: 'guide', text: '組のそばで構え、次の下知を待て', state: '', t: -99 }, notifiedKey: '', distance: 0, label: '', floorHint: '', scan: 0, draw: 0, key: '', best: Infinity, progress: '',
    stalled: 0, lastSay: -99, spoken: new Set() };
}

// 札・印・声で共有する、今の一件。時間だけで下知を入れ替えない。
export function currentObjective(rt) {
  let main = null, order = null, other = null;
  for (const o of rt.objectives) {
    if (o.state) continue;
    if (o.kind === 'main') { if (!main || (o.t ?? 0) >= (main.t ?? 0)) main = o; }
    else if (o.kind === 'order') { if (!order || (o.t ?? 0) >= (order.t ?? 0)) order = o; }
    else if (!other || o.progress && !other.progress) other = o;
  }
  if (rt.def.sideTaskAfter && main) return main;
  return order && (!main || order.progress || (order.t ?? 0) >= (main.t ?? 0)) ? order : main || order || other;
}

// 案内の札と声では英字の操作説明を畳む。任務の原文は変えない。
export function goalText(rt, text) {
  return intelText(rt, text).replace(/（[^）]*[A-Za-z][^）]*）/g, '').replace(/[A-Za-z]+/g, '操作');
}

export function markerName(m) {
  const name = typeof m.label === 'function' ? m.label() : m.label;
  return typeof name === 'string' && name.trim() && !/^(null|undefined)$/.test(name.trim()) ? name.trim().replace(/（[^）]*[A-Za-z][^）]*）/g, '').replace(/[A-Za-z]+/g, '操作') : '';
}

function select(rt, g) {
  const objective = g.objective = currentObjective(rt) || (!rt.over && !rt.def.town && !rt.def.dojo ? g.waitObjective : null);
  let best = null, score = -Infinity;
  const preferred = rt.def.guideMarker?.(rt);
  const explicit = typeof rt.def.guideMarker === 'function';
  for (const m of rt.markers) {
    // 敵の現在地へ向く矢印は出さない。旗と指物を自分で探す。
    if (!objective || objective === g.waitObjective || m.intelHidden || (explicit && !preferred) || m.red || (m.group && m.group.team !== 0) || m.noGuide || m.id === 'horse-loose' || m.id === 'focus' || /^taisho_/.test(m.id) || (m.group && !m.group.count)) continue;
    const own = rt.objectives.find((o) => o.id === m.id);
    if (own?.state) continue;
    const p = typeof m.pos === 'function' ? m.pos() : m.pos;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const label = markerName(m);
    if (!label) continue;
    const name = label.split(/[（(・　 ]/)[0];
    const matches = m.id === objective.id || (m.id === '_col' && /列|離れるな|先手につ/.test(objective.text)) || (name.length >= 2 && objective.text.includes(name));
    const priority = typeof m.guidePriority === 'function' ? m.guidePriority() : (m.guidePriority || 0);
    // 段の道案内と戦ごとの指定は、その任務へ向かう途中の目印。無関係な印へは向けない。
    if (!matches && m.id !== preferred && !priority && !['dp', 'next', 'turn'].includes(m.id)) continue;
    if (own && own !== objective) continue;
    let s = (matches ? 100 : 0) + priority;
    if (m.guideNearest) s -= Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) * 0.1;
    if (m.id === preferred) s += 300;
    if (s > score) { score = s; best = m; g.pos.x = p.x; g.pos.z = p.z; g.pos.y = p.y ?? rt.world.heightAt(p.x, p.z); }
  }
  g.marker = best;
  g.label = best ? markerName(best) : '';
  const u = rt.player.u.pos;
  const dy = g.pos.y - u.y;
  const upper = best && deckAt(g.pos.x, g.pos.z, g.pos.y) !== null;
  const lower = best && deckAt(u.x, u.z, u.y) !== null;
  g.floorHint = best && Math.abs(dy) > 2 && (upper || lower) ? dy > 0 ? '上の階へ登る' : '下の階へ降りる' : '';
  const key = objective ? `${objective.id}|${goalText(rt, objective.text).replace(/[0-9０-９]+/g, '数')}|${best?.id || ''}|${g.floorHint}` : '';
  if (key !== g.key) {
    g.key = key; g.best = Infinity; g.stalled = 0;
  }
  const distance = best ? typeof best.routeDistance === 'function' ? best.routeDistance() : Math.hypot(g.pos.x - rt.player.u.pos.x, g.pos.z - rt.player.u.pos.z) : 0;
  g.distance = distance;
  const progress = objective?.progress || '';
  const fighting = rt.player.inCombatT > 0 && rt.army.nearestEnemy(rt.player.u, 4,
    (enemy) => !rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, enemy.pos));
  if (!best || distance < g.best - 2 || progress !== g.progress || fighting) {
    g.best = distance; g.stalled = 0;
  } else g.stalled += 0.5;
  g.progress = progress;
  // 台詞が出ている時や順番待ちには割り込まない。任務ごとに一度、八秒以上あける。
  if (S.reduceGuidance || rt.over || rt.choice || !rt.player.u.alive || g.stalled < 20 || g.spoken.has(key) || rt.t - g.lastSay < 8 ||
    (rt._sayGate || 0) > rt.t || rt.hud.subT > 0 || rt.hud.subQ.length) return;
  const text = g.floorHint ? `${g.label}は${g.floorHint}。${goalText(rt, objective.text)}` :
    distance > 5 ? `${g.label}の印へ進め。${goalText(rt, objective.text)}` : goalText(rt, objective.text);
  g.spoken.add(key); g.lastSay = rt.t;
  rt.hud.say(rt.G.lord ? '近習' : '組頭', text, 4, false, { task: true, goalKey: key });
}

export function missionGuideTick(rt, dt) {
  let g = rt.missionGuide;
  if (!g) g = init(rt);
  if ((g.scan -= dt) <= 0) { g.scan = 0.5; select(rt, g); }
  const active = !rt.over && rt.player.u.alive && !rt.choice && !rt.player.camShot &&
    rt.phase !== 'wait' && !(rt.prelude && rt.prelude !== 'done');
  if (g.key !== g.notifiedKey && active && rt.ready) {
    g.notifiedKey = g.key;
    if (g.key) rt.hud.goalChanged(rt, g);
  }
  const on = !S.reduceGuidance && !rt.over && rt.player.u.alive && !rt.choice &&
    !rt.player.camShot && rt.phase !== 'wait' && !(rt.prelude && rt.prelude !== 'done');
  if (!on) { if (g) { g.arrow.visible = false; g.stalled = 0; } return; }
  const u = rt.player.u.pos;
  const goal = rt.world.def.guideWay && g.marker ? rt.world.def.guideWay(rt.player.u, g.pos) : g.pos;
  const dx = goal.x - u.x, dz = goal.z - u.z, d = Math.hypot(dx, dz);
  // 地面の矢印は足が止まった時に出す。消火のように急ぐ任務は、その場で出す。
  g.arrow.visible = !!g.marker && d > 8 && g.distance > 8 && !g.floorHint && (g.marker.guideAlways || g.stalled >= 15);
  if (!g.arrow.visible || (g.draw -= dt) > 0) return;
  g.draw = 0.1;
  const fx = dx / d, fz = dz / d, at = Math.min(3.5, d - 1.5);
  const a = g.arrow.geometry.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const side = g.base[i * 3] * 0.6, forward = g.base[i * 3 + 1] * 0.6 + at;
    const x = u.x + fx * forward + fz * side, z = u.z + fz * forward - fx * side;
    a.setXYZ(i, x, groundAt(rt.world, x, z, u.y) + 0.025, z);
  }
  a.needsUpdate = true;
}

export function missionGuideDispose(rt) {
  const g = rt.missionGuide;
  if (!g) return;
  rt.scene.remove(g.arrow); g.arrow.geometry.dispose(); g.arrow.material.dispose();
  rt.missionGuide = null;
}
