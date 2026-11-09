// ======================================================================
// 天王寺・岡山の戦い　③の段「馬印が倒れる」（b_k15_tennoji_okayama.js の stage3 から入れる）
// 史実：真田の突撃で家康の本陣が崩れ、金扇の馬印が倒れ、旗本には三里も逃げた者がいた（三方ヶ原の後で初めて馬印が倒れた）。
// 遊び：馬印が倒れた瞬間に、大御所の旗本の一部が南へ逃げ散る（家康の囲みが薄くなる）。
//   主人公が倒れた馬印に寄って起こすと（起こす判定は本の update）、逃げた旗本が馬印のもとへ駆け戻り、本陣が持ち直す。主人公の手柄。
// 字は出さない：起こした時に金の輪が地に広がり、法螺貝が鳴り、旗本が戻る動きで分からせる。
// ======================================================================
import * as THREE from 'three';
import { sfx } from '../audio.js';

const RING_GEO = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);

export function install(rt, ctx = {}) {
  const F = rt.flags;
  const hon = ctx.hon || F.hon, hata2 = ctx.hata2 || F.hata2;
  const south = ctx.south || { x: 0.15, z: 1 };
  const fled = [];
  const now = () => rt.army.time;
  // 馬印が倒れた瞬間、旗本の侍の三人に一人ほどが南へ逃げ散る（家康・正純・名のある者は残る）。二の備も少し崩れる
  const scatter = (g, share) => {
    if (!g || !g.units) return;
    let k = 0;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.isPlayer || u.name || u.invuln) continue;
      if ((k++ % Math.round(1 / share)) !== 0) continue;
      u.moraleFleeDir = { x: south.x + (Math.random() - 0.5) * 0.6, z: south.z };
      u.fleeing = true; u.fleeT = now(); u.target = null; u.atk = null; u.swing = null;
      u._umaFled = true; fled.push(u);
    }
  };
  scatter(hon, 0.34); scatter(hata2, 0.25);
  sfx('taiko', 0.4);

  let rallied = false, ring = null, ringT = 0, keepT = 0;
  const st = {
    fled,
    get rallied() { return rallied; },
    update(dt) {
      if (F.step !== 3 && !rallied) return;
      // 馬印を起こすまでは、逃げた旗本はそのまま南へ走る（字でなく、薄くなった本陣で分からせる）
      // 主人公が起こした時だけ（④へ移る時に本が馬印を起こしても、手柄にしない）
      if (!rallied && F.umaUp && F.step === 3) {
        rallied = true;
        rally();
      }
      if (ring) {
        ringT += dt;
        const s = 1 + ringT * 9;
        ring.scale.set(s, 1, s);
        ring.material.opacity = Math.max(0, 0.75 * (1 - ringT / 1.4));
        if (ringT > 1.4) { rt.scene.remove(ring); ring.material.dispose(); ring = null; }
      }
      // 戻る者を、しばらくのあいだ本陣へ寄せ直す（逃げの向きが残って、また外へ流れないように）
      if (rallied && keepT > 0) {
        keepT -= dt;
        for (const u of fled) if (u.alive && u.fleeing) { u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; }
      }
    },
  };

  function rally() {
    const at = F.uma ? F.uma.position : (hon && hon.center ? hon.center() : null);
    let back = 0;
    for (const u of fled) {
      if (!u.alive) continue;
      u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; u.confused = 0;
      u.target = null; u.atk = null; u.aiT = 0.2 + Math.random() * 0.8;
      back++;
    }
    keepT = 4;
    for (const g of [hon, hata2]) if (g && g.units) { g.routed = false; g.morale = 100; }
    if (hon) hon.defMult = Math.max(hon.defMult || 1, 1.9);
    if (hata2) hata2.defMult = Math.max(hata2.defMult || 1, 1.5);
    sfx('horagai', 0.8);
    if (at) {
      ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0xe8c04a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(at.x, rt.world.heightAt(at.x, at.z) + 0.15, at.z);
      ring.renderOrder = 3;
      rt.scene.add(ring); ringT = 0;
      const r0 = ring; rt.after(1.6, () => { if (ring === r0) { rt.scene.remove(r0); r0.material.dispose(); ring = null; } });   // ④へ移って update が呼ばれなくても残さない
    }
    rt.army.play?.('toki', at ? { x: at.x, z: at.z } : null, 1.2);
    rt.after(1.4, () => rt.say('旗本', '馬印が立った！　戻れ、戻れ！　馬印のもとへ集まれ！', 3.2));
    if (back > 0) rt.after(5, () => rt.say('本多正純', '逃げた旗本が馬印のもとへ戻って来る。よう起こした！', 3.2));
    rt.award((t) => t.side.push('倒れた馬印を起こし、逃げる旗本を立て直した'), '倒れた馬印を起こし、旗本を立て直した');
  }

  return st;
}
