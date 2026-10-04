// 戦の跡：歩いた地面と、倒れた兵・旗・得物。形と材質は全て使い回す。
import * as THREE from 'three';
import { S } from './settings.js';
import { MAT, paint, at, merge } from './units_model.js';

const flagGeos = [];
function flagGeometry(team) {
  if (!flagGeos[team]) flagGeos[team] = merge([
    paint(at(new THREE.BoxGeometry(0.045, 0.045, 2.6), 0, 0.035, 0), 0x493a27),
    paint(at(new THREE.BoxGeometry(0.48, 0.015, 0.95), 0.24, 0.055, 0.65), team ? 0x706b59 : 0x9a927b),
    paint(at(new THREE.BoxGeometry(0.2, 0.018, 0.12), 0.24, 0.057, 0.7), 0x343027),
  ]);
  return flagGeos[team];
}

// 元の材質を変えず、薄さ四段の材質を敵味方で共用する。
const fadeMats = new WeakMap();
function fadedMaterial(mat, step) {
  let levels = fadeMats.get(mat);
  if (!levels) { levels = []; fadeMats.set(mat, levels); }
  if (!levels[step]) {
    const m = mat.clone();
    // 背の旗を遠い形へ戻す処理が、薄れた材質を上書きしないようにする。
    m.userData.faded = true;
    m.onBeforeCompile = mat.onBeforeCompile;
    m.customProgramCacheKey = mat.customProgramCacheKey;
    m.transparent = true; m.depthWrite = false; m.alphaTest = 0;
    m.forceSinglePass = true;
    m.opacity = mat.opacity * (1 - step / 5);
    levels[step] = m;
  }
  return levels[step];
}
function fadeObject(o, step) {
  if (!step || o.userData.groundFade === step) return;
  o.userData.groundFade = step;
  if (o.isMesh) {
    const src = o.userData.groundMaterial || (o.userData.groundMaterial = o.material);
    if (Array.isArray(src)) {
      // 複数材質の配列も一度作って使い回す。
      const levels = o.userData.groundLevels || (o.userData.groundLevels = []);
      if (!levels[step]) levels[step] = src.map(m => fadedMaterial(m, step));
      o.material = levels[step];
    } else o.material = fadedMaterial(src, step);
    o.castShadow = false;
  }
  for (const c of o.children) fadeObject(c, step);
}
// 束ねる前の部品数で見積もるので、束ねられない顔・薄れた物も上限に入る。
function drawCost(o) {
  let n = o.isMesh ? (Array.isArray(o.material) ? o.geometry.groups.length : 1) : 0;
  for (const c of o.children) if (c.visible) n += drawCost(c);
  return n;
}

export const ArmyGround = {
  keepLitter(o) {
    if (!o || o.parent !== this.scene || o.userData.groundKept) return;
    o.userData.groundKept = true;
    const list = this.litter || (this.litter = []);
    list.push(o);
    o.userData.groundAt = this.time;
    const cap = S.quality === 'low' ? 80 : 120;
    while (list.length > cap) this.scene.remove(list.shift());
  },

  fallenKit(u) {
    if (u.groundKit || u.isPlayer || u.type === 'dummy') return;
    u.groundKit = true;
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
    // 折れるのは一部の槍だけ。既存の柄と穂の形を二つに分ける。
    const w = u.dropped, F = w?.userData.flex;
    if (F && w.parent === this.scene && u.id % 7 === 0) {
      w.geometry = F.G.s0;
      const a = F.a;
      w.remove(a); a.visible = F.b.visible = true;
      a.position.set(0, 0, F.G.j1).applyQuaternion(w.quaternion).add(w.position);
      a.quaternion.copy(w.quaternion); a.rotateY(0.28);
      a.position.x += Math.cos(u.heading) * 0.18;
      a.position.z -= Math.sin(u.heading) * 0.18;
      a.position.y = this.world.heightAt(a.position.x, a.position.z) + 0.035;
      this.scene.add(a); this.keepLitter(a);
    }
    // 身に付けていた旗だけを残す。持っていない盾は増やさない。
    if (!u.flag || !(u.tag === 'flag' || u.id % 8 === 0)) return;
    const a = u.heading + u.id * 0.73, x = u.pos.x + Math.sin(a) * 0.8, z = u.pos.z + Math.cos(a) * 0.8;
    if (this.world.inWaterAt(x, z)) return;
    const m = new THREE.Mesh(flagGeometry(u.team ? 1 : 0), MAT);
    m.position.set(x, this.world.heightAt(x, z) + 0.025, z);
    const gx = this.world.heightAt(x + 0.5, z) - this.world.heightAt(x - 0.5, z);
    const gz = this.world.heightAt(x, z + 0.5) - this.world.heightAt(x, z - 0.5);
    m.rotation.set(Math.atan(gz), 0, -Math.atan(gx)); m.rotateY(a);
    this.scene.add(m); this.keepLitter(m);
    u.flag.visible = false;
  },

  clearCorpse(index) {
    const u = this.dead.splice(index, 1)[0];
    if (u.death?.aid) this.endAid(u);
    this.dropWeapon(u);
    this.fallenKit(u);
    this.corpseAt(u, -1);
    u.gone = true;
    this.scene.remove(u.mesh);
    // 上限に達して倒れる途中で片付けた時も、手の槍は地面に残す。
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
    for (const a of this.arrows) if (a.host === u) a.life = 0;
  },

  trimCorpses() {
    const cap = S.quality === 'low' ? 32 : S.quality === 'mid' ? 48 : 64;
    while (this.dead.length > cap) {
      // 距離ではなく倒れた順。手当て中の兵と自分は最後まで守る。
      let index = this.dead.findIndex(u => !u.isPlayer && !u.death?.aid);
      if (index < 0) index = this.dead.findIndex(u => !u.isPlayer);
      if (index < 0) break;
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
      const dx = x - u.groundX, dz = z - u.groundZ;
      const moved2 = u.groundX === undefined ? 0 : dx * dx + dz * dz;
      u.groundX = x; u.groundZ = z;
      if ((moved2 < 0.0625 && !u.atk && !u.target) || moved2 > 100 || w.inWaterAt(x, z) || Math.abs(u.pos.y - w.heightAt(x, z)) > 0.7) continue;
      // 土煙の描画距離によらず足跡を貯める。立ち合い中の足踏みも少しずつ草を倒す。
      w.stampWear(x, z, u.mounted ? 1.5 : 0.9, (wet ? 8 : 5) * (u.mounted ? 1.6 : 1));
    }
    this.trimCorpses();
    const low = S.quality === 'low', far = low ? 45 : 70;
    // 半秒ごとに描く部品を数える。影も含め、この跡に使う回数を抑える。
    let budget = low ? 140 : S.quality === 'mid' ? 220 : 300;
    const view = cam || focus;
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const u = this.dead[i], age = this.time - u.killedAt;
      if (u.isPlayer) continue;
      if (age >= 4) this.fallenKit(u);
      if (!u.death?.aid && age >= 90) { this.clearCorpse(i); continue; }
      if (!u.death?.aid && age > 65) fadeObject(u.mesh, Math.min(4, Math.ceil((age - 65) / 5)));
      const d = view ? (u.pos.x - view.x) ** 2 + (u.pos.z - view.z) ** 2 : 0;
      const cost = drawCost(u.mesh) * 2;
      u.mesh.visible = d <= far * far && cost <= budget;
      if (u.mesh.visible) budget -= cost;
    }
    const list = this.litter;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], age = this.time - o.userData.groundAt;
      if (age >= 120) { this.scene.remove(o); list.splice(i, 1); continue; }
      if (age > 95) fadeObject(o, Math.min(4, Math.ceil((age - 95) / 5)));
      const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : 0;
      const cost = drawCost(o) * 2;
      o.visible = d <= (low ? 35 : 65) ** 2 && cost <= budget;
      if (o.visible) budget -= cost;
    }
  },
};
