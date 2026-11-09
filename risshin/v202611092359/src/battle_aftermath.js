// 戦の後の余韻（kaito 11/1）：勝った後、少しの間、静かになった戦場を歩ける。
// 倒れた兵・倒れた旗はそのまま残し、遠くに煙を立て、太鼓と鬨を止めて烏と風だけにする。
// 兵の判断と攻撃は止め（units.js の aftermath）、遠い兵は描かない（重くしない）。
// 字は出さない。右の丸い印（▶）か Enter で戦の後の画面へ。何もしなくても六秒で進む。
import { setCrowd, setScene, afterBattle } from './audio.js';

const LIMIT = 6, FAR = 70;   // 余韻は六秒（kaito 11/2 P「戦が終わった後の、何もできない待ちの画面が長すぎる。すぐ結果へ」。前は四十五秒）

// 退き口（追い討ち）を閉じる時に呼ぶ。勝った戦だけ余韻へ入り、入ったら true。
export function aftermathStart(rt) {
  if (rt.aftermath || rt.tracker.main !== true || rt.result?.down || rt.def.dojo || rt.def.town || rt.def.noAftermath || !rt.player?.u.alive) return false;
  rt.aftermath = rt.army.aftermath = true;
  rt.withdrawal = null;
  rt.endT = LIMIT;
  rt.aftermathSound = { aftermath: true, heat: 0, calm: true, rain: false, hurt: false, march: 0,
    night: rt.world.timeKey === 'dusk' || rt.world.timeKey === 'night', flap: 0, pant: 0.45 };
  const P = rt.player;
  P.lock = null; P.inCombatT = 0; P.cine = null;
  for (const u of rt.army.units) if (u.alive) {
    u.target = null; u.atk = null; u.swing = null; u.reload = null;
    u.moving = 0; u.charging = false; u.cheer = 0;
    u.hit = null; u.stagger = 0; u.recoil = 0; u.strikeT = 0; u.sweepT = 0;
  }
  // 飛んでいる矢は外す（刺さった矢は残す）。
  for (let i = rt.army.arrows.length - 1; i >= 0; i--) {
    const a = rt.army.arrows[i];
    if (!a.stuck) { (a.parent || rt.scene).remove(a.mesh); rt.army.arrows.splice(i, 1); }
  }
  // 遠い兵は描かない。倒れた者（alive でない）は残す。
  const p = P.u.pos;
  rt._afterHidden = [];
  for (const u of rt.army.units) {
    if (!u.alive || u.isPlayer || !u.mesh || !u.mesh.visible) continue;
    if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > FAR) { u.mesh.visible = false; rt._afterHidden.push(u); }
  }
  // 立ち上る煙：敵の来た方の遠くに二、三本（既存の煙の柱を使い回す）。
  if (rt.world.addSmokeColumn) {
    const foe = rt.army.units.find((u) => !u.alive && u.team !== 0) || null;
    const ax = foe ? foe.pos.x - p.x : 0, az = foe ? foe.pos.z - p.z : 1, l = Math.hypot(ax, az) || 1;
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(ax / l, az / l) + (i - 1) * 0.5, d = 55 + i * 18;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      rt.world.addSmokeColumn(x, rt.world.heightAt(x, z), z, { size: 0.8 + i * 0.25, black: i === 1 });
    }
  }
  afterBattle(true, null);
  setCrowd(0.04);
  setScene({ approach: 0 });
  // 戦の後の画面へ進む丸い印
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'aftermath-next'; b.textContent = '▶';
  b.setAttribute('aria-label', '戦の後の画面へ');
  b.style.cssText = 'position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:22;width:56px;height:56px;border-radius:50%;border:2px solid rgba(240,232,214,.85);background:rgba(12,10,8,.55);color:#f0e8d6;font-size:22px;opacity:0;transition:opacity 1.5s';
  b.onclick = (e) => { e.stopPropagation(); rt.endT = Math.min(rt.endT, 0.01); };
  document.body.appendChild(b);
  rt._afterBtn = b;
  setTimeout(() => { if (rt._afterBtn) rt._afterBtn.style.opacity = '1'; }, 3000);
  return true;
}

// 余韻の間、毎コマ。Enter でも進む。
export function aftermathInput(rt, input) {
  if (input.pressed && input.pressed('Enter')) rt.endT = Math.min(rt.endT, 0.01);
}

export function aftermathDispose(rt) {
  rt._afterBtn?.remove(); rt._afterBtn = null;
  for (const u of rt._afterHidden || []) if (u.mesh) u.mesh.visible = true;
  rt._afterHidden = null;
}
