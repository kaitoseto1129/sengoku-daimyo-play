// ======================================================================
// 出陣の場面（K308 要件49〜50）：城下で出陣の札を選ぶと、すぐ戦へ飛ばず、門の内に兵・旗・荷駄が集まり、
//   主人公も門へ向かう。列が門から出ていくのを町の人が見送り、暗転して戦場へ。五秒ほど。
//   兵の数は身分で増える（足軽＝組の数人／足軽大将から旗と荷駄／侍大将から騎馬の供）。多くても二十人（重くしない）。
//   描かずの確かめ（bot）と「動きを減らす」の設定の時は場面を飛ばす。
// ======================================================================
import { allyGroup } from './bhelp.js';
import { S as SETTINGS } from './settings.js';

export function departScene(rt, done) {
  const gate = rt.flags.doors && rt.flags.doors.gate;
  if (!gate || SETTINGS.reduceMotion || rt.flags.departing) { done(); return; }
  const rank = rt.G.rank || 0;
  const n = Math.min(14, 4 + rank * 2);
  const list = [{ type: 'ashigaru', n, o: { invuln: true, flag: 'oda' } }];
  if (rank >= 1) list.push({ type: 'porter', n: 2, o: { invuln: true, weapon: 'none', name: '荷駄' } });
  if (rank >= 3) list.push({ type: 'cavalry', n: 2, o: { invuln: true, name: '騎馬の供' } });
  const p = rt.player;
  // 主人公は門の内、列の後ろに。門の方を向く
  const px = gate.x - 2.5, pz = gate.z + 16;
  p.u.pos.set(px, rt.world.heightAt(px, pz), pz);
  p.u.heading = Math.PI; p.yaw = Math.PI; p.camYawOff = 0;
  if (p.u.mesh) p.u.mesh.position.copy(p.u.pos);
  // 見える所に湧かせない見張り（spawnGuard）は戦の新手のため。出陣の列は主人公の目の前に集まる場面なので、この時だけ外す
  const guard = rt.army.spawnGuard; rt.army.spawnGuard = null;
  let g;
  try {
  g = allyGroup(rt, { name: '出陣の兵', anchor: { x: gate.x + 1, z: gate.z + 10 }, facing: Math.PI, order: 'move', dest: { x: gate.x, z: gate.z - 30 },
    noRout: true, width: 3, speed: 1.2, march: true, aggro: 0, seekRange: 0, fixed: true }, list);
  } finally { rt.army.spawnGuard = guard; }
  const D = rt.flags.departing = { g, t: 0, done, ended: false };
  rt.say('町の人', rank >= 4 ? 'お殿様の御出陣じゃ。道を開けい' : '御出陣じゃ！　ご武運を', 3);
  rt.after(2.4, () => rt.say('組の者', '門を出るぞ。遅れるな', 2.5));
  rt.after(5.2, () => fadeOut(D));
  return D;
}

// 毎コマ：主人公も列の後ろについて門へ歩く（鍵盤の入力は使わない）
export function departTick(rt, dt) {
  const D = rt.flags.departing;
  if (!D || D.ended) return;
  D.t += dt;
  const p = rt.player, gate = rt.flags.doors.gate;
  const dx = gate.x - p.u.pos.x, dz = gate.z - 2 - p.u.pos.z, d = Math.hypot(dx, dz);
  if (D.t > 1.2 && d > 1) {
    const s = Math.min(d, 2.2 * dt);
    p.u.pos.x += dx / d * s; p.u.pos.z += dz / d * s;
    p.u.pos.y = rt.world.heightAt(p.u.pos.x, p.u.pos.z);
    p.u.heading = Math.atan2(dx, dz);
  }
}

function fadeOut(D) {
  if (D.ended) return;
  D.ended = true;
  const f = document.createElement('div');
  f.id = 'depart-fade';
  f.style.cssText = 'position:fixed;inset:0;z-index:8999;background:#000;opacity:0;transition:opacity .7s;pointer-events:none';
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.opacity = '1'; });
  setTimeout(() => { try { D.done(); } finally { setTimeout(() => f.remove(), 400); } }, 800);
}
