// 戦の跡：歩いた地面と、倒れた兵・旗・得物。形と材質は全て使い回す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S } from './settings.js';
import { cloneWaterMaterial } from './water_body.js';
import { muddyFlag } from './units_flags.js';

// 元の材質を変えず、薄さ四段の材質を敵味方で共用する。
const fadeMats = new WeakMap();
const groundObjects = new WeakMap();
const groundFlagMats = new WeakMap();
function groundFlagMaterial(src) {
  let mat = groundFlagMats.get(src);
  if (!mat) {
    // 地に伏せた布ははためかせない。汚れた色だけを共有し、低画質でも束ねられる。
    mat = cloneWaterMaterial(muddyFlag(src));
    mat.transparent = false; mat.opacity = 1; mat.forceSinglePass = true;
    groundFlagMats.set(src, mat);
  }
  return mat;
}
// 落ちた指物も竿と横木を残す。形と材質は一つだけ作り、布と同じ向きに寝かせる。
let groundFlagPoleGeo = null, groundFlagPoleMat = null;
function groundFlagPole() {
  if (!groundFlagPoleGeo) {
    const pole = new THREE.CylinderGeometry(0.012, 0.015, 1.4, 4);
    pole.translate(0, -0.34, 0.012);
    const bar = new THREE.CylinderGeometry(0.009, 0.009, 0.38, 4);
    bar.rotateZ(Math.PI / 2); bar.translate(0.18, 0.375, 0.012);
    groundFlagPoleGeo = mergeGeometries([pole, bar]);
    pole.dispose(); bar.dispose();
    groundFlagPoleMat = new THREE.MeshStandardMaterial({ color: 0x493723, roughness: 1 });
  }
  return new THREE.Mesh(groundFlagPoleGeo, groundFlagPoleMat);
}
const groundFlagGeos = new WeakMap();
function groundFlagGeometry(src) {
  if (groundFlagGeos.has(src)) return groundFlagGeos.get(src);
  const g = src.clone(), pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    pa.setZ(i, -Math.abs(Math.sin(x * 27 + y * 19)) * 0.018);
  }
  g.computeVertexNormals(); groundFlagGeos.set(src, g);
  return g;
}
function fadedMaterial(mat, step) {
  // 材質でない部品は複製しない。
  if (!mat?.isMaterial || typeof mat.clone !== 'function') return mat;
  let levels = fadeMats.get(mat);
  if (!levels) { levels = []; fadeMats.set(mat, levels); }
  if (!levels[step]) {
    // 濡れた材質の元への参照を保つ。通常の複製では参照が失われ、
    // 乾く時に薄れた材質を元と取り違えて、複製を重ねてしまう。
    const m = cloneWaterMaterial(mat);
    // 背の旗を遠い形へ戻す処理が、薄れた材質を上書きしないようにする。
    m.userData.faded = true;
    m.onBeforeCompile = mat.onBeforeCompile;
    m.customProgramCacheKey = mat.customProgramCacheKey;
    m.transparent = true; m.depthWrite = false;
    // 薄れる時も、布の外の透明な余白を板に戻さない。
    m.alphaTest = mat.alphaTest * (1 - step / 5);
    m.forceSinglePass = true;
    m.opacity = mat.opacity * (1 - step / 5);
    levels[step] = m;
  }
  return levels[step];
}
function fadeObject(o, step) {
  if (!step) return;
  let state = groundObjects.get(o);
  if (state?.step === step) return;
  if (!state) {
    state = { step: 0, material: o.material, levels: [] };
    groundObjects.set(o, state);
  }
  state.step = step;
  if (o.isMesh) {
    const src = state.material;
    if (Array.isArray(src)) {
      // 複数材質の配列も一度作って使い回す。
      const levels = state.levels;
      if (!levels[step]) levels[step] = src.map(m => fadedMaterial(m, step));
      o.material = levels[step];
    } else o.material = fadedMaterial(src, step);
    o.castShadow = false;
  }
  for (const c of o.children) fadeObject(c, step);
}
// 束ねる前の部品数で見積もるので、束ねられない顔・薄れた物も上限に入る。
function drawCost(o) {
  let n = o.isMesh ? (Array.isArray(o.material) ? (o.geometry?.groups.length || o.material.length) : 1) * (o.castShadow && S.quality !== 'low' ? 2 : 1) : 0;
  for (const c of o.children) if (c.visible) n += drawCost(c);
  return n;
}

export const ArmyGround = {
  fadeGround(o, step) { fadeObject(o, step); },
  keepLitter(o) {
    if (!o || o.parent !== this.scene || o.userData.groundKept) return;
    o.userData.groundKept = true;
    const list = this.litter || (this.litter = []);
    list.push(o);
    o.userData.groundAt = this.time;
    // 同じ足元へ槍・矢・落ちた具足を積み上げない。落ちた時だけ近い跡を数える。
    let nearby = 0, oldest = null;
    for (const a of list) {
      if (a === o || a.userData.groundFadeAt != null || Math.abs(a.position.y - o.position.y) > 0.6) continue;
      if ((a.position.x - o.position.x) ** 2 + (a.position.z - o.position.z) ** 2 > 4) continue;
      nearby++;
      if (!oldest || a.userData.groundAt < oldest.userData.groundAt) oldest = a;
    }
    if (nearby >= 4 && oldest) { oldest.userData.groundFadeAt = this.time; fadeObject(oldest, 1); }
    const cap = S.quality === 'low' ? 80 : 120;
    this.trimLitter(cap);
  },

  trimLitter(cap = S.quality === 'low' ? 80 : 120) {
    const list = this.litter;
    if (!list) return;
    const view = this._groundView || this.playerUnit?.pos;
    let active = 0;
    for (const o of list) if (o.userData.groundFadeAt == null) active++;
    while (active > cap) {
      let best = null, far = -1;
      for (const o of list) {
        if (o.userData.groundFadeAt != null) continue;
        const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : this.time - o.userData.groundAt;
        if (d > far) { far = d; best = o; }
      }
      if (!best) break;
      best.userData.groundFadeAt = this.time; fadeObject(best, 1); active--;
    }
    // 薄れ待ちは四つまで。急に大量に落ちた時も描く数を膨らませない。
    while (list.length > cap + 4) {
      let index = -1, far = -1;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.userData.groundFadeAt == null) continue;
        const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : this.time - o.userData.groundAt;
        if (d > far) { far = d; index = i; }
      }
      if (index < 0) break;
      this.scene.remove(list[index]); list.splice(index, 1);
    }
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
    // 弾よけを持っていた兵だけ、その竹束を残す。体が消えても盾まで消さない。
    const shield = u.tatake;
    if (shield?.parent === u.mesh) {
      const a = u.heading, sx = Math.sin(a), sz = Math.cos(a);
      const x = u.pos.x + sx * 0.65, z = u.pos.z + sz * 0.65;
      if (!this.world.inWaterAt(x, z)) {
        const y0 = this.world.heightAt(x, z), y1 = this.world.heightAt(x + sx * 1.8, z + sz * 1.8);
        shield.position.set(x, y0 + 0.09, z);
        shield.rotation.set(Math.PI / 2 + Math.atan2(y0 - y1, 1.8), a, 0, 'YXZ');
        shield.castShadow = false;
        this.scene.add(shield); this.keepLitter(shield);
      }
    }
    // 身に付けていた旗だけを残す。持っていない盾は増やさない。
    if (!u.flag || !(u.tag === 'flag' || u.id % 8 === 0)) return;
    const a = u.heading + u.id * 0.73, x = u.pos.x + Math.sin(a) * 0.8, z = u.pos.z + Math.cos(a) * 0.8;
    if (this.world.inWaterAt(x, z)) return;
    const m = new THREE.Mesh(groundFlagGeometry(u.flag.geometry), groundFlagMaterial(u.flagMat || u.flag.material));
    m.scale.copy(u.flag.scale);
    m.add(groundFlagPole());
    m.position.set(x, this.world.heightAt(x, z) + 0.025, z);
    const gx = this.world.heightAt(x + 0.5, z) - this.world.heightAt(x - 0.5, z);
    const gz = this.world.heightAt(x, z + 0.5) - this.world.heightAt(x, z - 0.5);
    m.rotation.set(Math.PI / 2 - Math.atan(gx * Math.sin(a) + gz * Math.cos(a)), a, Math.atan(gx * Math.cos(a) - gz * Math.sin(a)), 'YXZ');
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
      // 手当て中の兵と自分を守り、見る所から遠い亡骸を先に片付ける。
      const view = this._groundView || this.playerUnit?.pos;
      let index = -1, far = -1;
      for (let i = 0; i < this.dead.length; i++) {
        const u = this.dead[i];
        if (u.isPlayer || u.death?.aid) continue;
        const d = view ? (u.pos.x - view.x) ** 2 + (u.pos.z - view.z) ** 2 : this.time - u.killedAt;
        if (d > far) { far = d; index = i; }
      }
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
      const dx = x - (u.groundX ?? x), dz = z - (u.groundZ ?? z);
      const moved2 = dx * dx + dz * dz;
      u.groundX = x; u.groundZ = z;
      if ((moved2 < 0.0625 && !u.atk && !u.target) || moved2 > 100) continue;
      if (w.inWaterAt(x, z, u.pos.y)) {
        // 半秒ごとの足運びから確実に水を跳ねる。橋の上と遠い兵には出さない。
        const view = focus || this.playerUnit?.pos;
        if (moved2 >= 0.0625 && view && (x - view.x) ** 2 + (z - view.z) ** 2 < 30 ** 2) w.spray(x, z, u.mounted ? 5 : 3);
        continue;
      }
      if (w.inWaterAt(x, z) || Math.abs(u.pos.y - w.heightAt(x, z)) > 0.7) continue;
      // 土煙の描画距離によらず足跡を貯める。立ち合い中の足踏みも少しずつ草を倒す。
      const radius = u.mounted ? 1.5 : 0.9;
      const steps = Math.min(S.quality === 'low' ? 3 : 4, Math.max(1, Math.ceil(Math.sqrt(moved2) / (radius * 1.5))));
      const amount = (wet ? 8 : 5) * (u.mounted ? 1.6 : 1);
      // 走った区間にも跡を補う。半秒に最大四点、形や配列は作らない。
      for (let i = 1; i <= steps; i++) {
        const px = x - dx * (1 - i / steps), pz = z - dz * (1 - i / steps);
        if (!w.inWaterAt(px, pz)) w.stampWear(px, pz, radius, amount);
      }
    }
    this._groundView = cam || focus || this.playerUnit?.pos;
    this.trimCorpses();
    const low = S.quality === 'low', far = low ? 45 : 70;
    // 半秒ごとに描く部品を数える。影も含め、この跡に使う回数を抑える。
    let budget = low ? 140 : S.quality === 'mid' ? 220 : 300;
    const view = this._groundView;
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const u = this.dead[i], age = this.time - u.killedAt;
      if (u.isPlayer) continue;
      const d = view ? (u.pos.x - view.x) ** 2 + (u.pos.z - view.z) ** 2 : 0;
      const near = focus || this.playerUnit?.pos || view;
      const playerD = near ? (u.pos.x - near.x) ** 2 + (u.pos.z - near.z) ** 2 : 0;
      if (age >= 4) this.fallenKit(u);
      // 倒れる動きが終わり、本人とカメラの両方から十分遠ければ先に片付ける。
      if (!u.death?.aid && (age >= 90 || age >= 12 && d > (far + 15) ** 2 && playerD > (far + 15) ** 2)) { this.clearCorpse(i); continue; }
      if (!u.death?.aid && age > 65) fadeObject(u.mesh, Math.min(4, Math.ceil((age - 65) / 5)));
      const cost = drawCost(u.mesh);
      u.mesh.visible = d <= far * far && cost <= budget;
      if (u.mesh.visible) budget -= cost;
    }
    // 戦の途中で画質を下げた時も、次の落下を待たず低画質の上限へ戻す。
    this.trimLitter();
    const list = this.litter;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], age = this.time - o.userData.groundAt;
      const retiring = o.userData.groundFadeAt == null ? 0 : this.time - o.userData.groundFadeAt + 0.5;
      if (retiring >= 2.5 || age >= 120) { this.scene.remove(o); list.splice(i, 1); continue; }
      if (retiring > 0 || age > 95) fadeObject(o, Math.min(4, Math.max(Math.ceil(retiring * 2), Math.ceil((age - 95) / 5))));
      const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : 0;
      const cost = drawCost(o);
      o.visible = d <= (low ? 35 : 65) ** 2 && cost <= budget;
      if (o.visible) budget -= cost;
    }
  },
};
