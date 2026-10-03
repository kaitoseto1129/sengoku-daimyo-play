// 戦の跡：歩いた地面と、倒れた旗・盾・得物。形と材質は全て使い回す。
import * as THREE from 'three';
import { S } from './settings.js';
import { MAT, paint, at, merge } from './units_model.js';

let shieldGeo;
const flagGeos = [];
function kitGeometry(flag, team) {
  if (flag) {
    if (!flagGeos[team]) flagGeos[team] = merge([
      paint(at(new THREE.BoxGeometry(0.045, 0.045, 2.6), 0, 0.035, 0), 0x493a27),
      paint(at(new THREE.BoxGeometry(0.48, 0.015, 0.95), 0.24, 0.055, 0.65), team ? 0x706b59 : 0x9a927b),
      paint(at(new THREE.BoxGeometry(0.2, 0.018, 0.12), 0.24, 0.057, 0.7), 0x343027),
    ]);
    return flagGeos[team];
  }
  if (!shieldGeo) {
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(paint(at(new THREE.BoxGeometry(0.2, 0.055, 1.45 - i * 0.05), (i - 1.5) * 0.21, 0.04, i % 2 * 0.04), i % 2 ? 0x58452f : 0x675139));
    for (const z of [-0.45, 0.45]) parts.push(paint(at(new THREE.BoxGeometry(0.86, 0.065, 0.075), 0, 0.085, z), 0x35291d));
    shieldGeo = merge(parts);
  }
  return shieldGeo;
}

export const ArmyGround = {
  keepLitter(o) {
    if (!o || o.parent !== this.scene || o.userData.groundKept) return;
    o.userData.groundKept = true;
    const list = this.litter || (this.litter = []);
    list.push(o);
    const cap = S.quality === 'low' ? 80 : 160;
    while (list.length > cap) {
      const p = this.playerUnit?.pos;
      let index = 0, far = -1;
      for (let i = 0; p && i < list.length; i++) {
        const d = (list[i].position.x - p.x) ** 2 + (list[i].position.z - p.z) ** 2;
        if (d > far) { far = d; index = i; }
      }
      this.scene.remove(list.splice(index, 1)[0]);
    }
  },

  fallenKit(u) {
    if (u.groundKit || u.isPlayer || u.type === 'dummy') return;
    u.groundKit = true;
    const flag = !!u.flag && (u.tag === 'flag' || u.id % 8 === 0);
    // 乱戦の中に取り残された板盾。槍と旗ほど多くは置かない。
    const shield = !u.mounted && u.type === 'ashigaru' && u.id % 17 === 0;
    for (let k = 0; k < 2; k++) {
      if (k === 0 ? !flag : !shield) continue;
      const a = u.heading + u.id * 0.73, x = u.pos.x + Math.sin(a) * 0.8, z = u.pos.z + Math.cos(a) * 0.8;
      if (this.world.inWaterAt(x, z)) continue;
      const m = new THREE.Mesh(kitGeometry(k === 0, u.team ? 1 : 0), MAT);
      m.position.set(x, this.world.heightAt(x, z) + 0.025, z);
      const gx = (this.world.heightAt(x + 0.5, z) - this.world.heightAt(x - 0.5, z));
      const gz = (this.world.heightAt(x, z + 0.5) - this.world.heightAt(x, z - 0.5));
      m.rotation.set(Math.atan(gz), 0, -Math.atan(gx)); m.rotateY(a);
      this.scene.add(m); this.keepLitter(m);
      if (k === 0) u.flag.visible = false;
    }
  },

  clearCorpse(index) {
    const u = this.dead.splice(index, 1)[0];
    if (u.death?.aid) this.endAid(u);
    this.fallenKit(u);
    this.corpseAt(u, -1);
    u.gone = true;
    this.scene.remove(u.mesh);
    // 上限に達して倒れる途中で片付けた時も、手の槍は地面に残す。
    this.dropWeapon(u);
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
    for (const a of this.arrows) if (a.host === u) a.life = 0;
  },

  trimCorpses() {
    const cap = S.quality === 'low' ? 64 : S.quality === 'mid' ? 100 : 140;
    const p = this.playerUnit?.pos;
    while (this.dead.length > cap) {
      let index = 0, far = -1;
      for (let i = 0; i < this.dead.length; i++) {
        const u = this.dead[i];
        if (u.isPlayer) continue;
        const d = p ? (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 : this.time - u.killedAt;
        if (d > far) { far = d; index = i; }
      }
      this.clearCorpse(index);
    }
  },

  groundTick(dt, focus, cam) {
    this.groundT = (this.groundT || 0) - dt;
    if (this.groundT > 0) return;
    this.groundT = 0.5;
    const w = this.world, wet = w.rainLevel > 0.4 || w.wetness > 0.5;
    for (const u of this.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy' || u.gone) continue;
      const x = u.pos.x, z = u.pos.z;
      const moved = u.groundX === undefined ? 0 : Math.hypot(x - u.groundX, z - u.groundZ);
      u.groundX = x; u.groundZ = z;
      if (w.inWaterAt(x, z) || Math.abs(u.pos.y - w.heightAt(x, z)) > 0.7 || (moved < 0.25 && !u.atk && !u.target) || moved > 10) continue;
      // 土煙の描画距離によらず足跡を貯める。立ち合い中の足踏みも少しずつ草を倒す。
      w.stampWear(x, z, u.mounted ? 1.5 : 0.9, (wet ? 8 : 5) * (u.mounted ? 1.6 : 1));
    }
    const far = S.quality === 'low' ? 65 : 95;
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const u = this.dead[i];
      if (this.time - u.killedAt < 4 || u.isPlayer || u.death?.aid) continue;
      this.fallenKit(u);
      if (this.time - u.killedAt < 20 || !focus) continue;
      const d = (u.pos.x - focus.x) ** 2 + (u.pos.z - focus.z) ** 2;
      const cd = cam ? (u.pos.x - cam.x) ** 2 + (u.pos.z - cam.z) ** 2 : d;
      if (d > far * far && cd > far * far) this.clearCorpse(i);
    }
    this.trimCorpses();
  },
};
