// Player の手のうち「視界（壁・旗・味方の透け・一人称の隠し・見る向き）」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import * as THREE from 'three';
import { RIDE, angleDiff } from './units.js';
import { POST, edgeDark, speedStreaks } from './post.js';
import { sfx, setScene } from './audio.js';
import { S, saveSettings, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { setFpCut, setFpArm } from './humans.js';
import { NAKA, nakaCamClamp } from './naka.js';
import { cameraWallBlocked as sightWallBlocked, inouSignHeight } from './battle_sight.js';
import { flagBlocksView as flagMeshBlocksView } from './units_flags.js';
import { _fpS, hideCameraEnemy, hideFirstPersonWeapon, _cT, _cW, _cLk, _WORLD_UP, _downRotation, _downGoalRotation, _PF_OFFSETS, _cUP, camBlockSphere, camBlockWorld, camBlockVisible, CAM_NEAR_PROJECTION, CAM_NEAR_FOOT, CAM_NEAR_BODY, CAM_NEAR_SCREEN_CUT, CAM_NEAR_CLEAR_DEPTH, CAM_NEAR_FADE, camNearMesh, camGrid, camBlockRaycast, cameraGroundAt, terrainSideClear, terrainCameraClamp } from './player.js';

// 幕も視点だけは遮る。敵の発見や攻撃の見通しは従来のまま。
const cameraWallBlocked = (rt, a, b) => sightWallBlocked(rt, a, b, a.y, b.y, true, true);

export class PlayerView {

  // 画面を十五分割し、近い壁が三分の一を超えたら肩位置を選び直す。
  wallViewBlocked(pos, look) {
    const rt = this.rt, camera = rt.camera;
    const f = this.wallViewForward || (this.wallViewForward = new THREE.Vector3());
    const r = this.wallViewRight || (this.wallViewRight = new THREE.Vector3());
    const up = this.wallViewUp || (this.wallViewUp = new THREE.Vector3());
    const end = this.wallViewEnd || (this.wallViewEnd = new THREE.Vector3());
    const near = this.wallViewNear || (this.wallViewNear = new THREE.Vector3());
    f.copy(look).sub(pos).normalize();
    r.set(f.z, 0, -f.x).normalize(); up.crossVectors(r, f).normalize();
    const top = Math.tan(camera.fov * Math.PI / 360) / camera.zoom, side = top * camera.aspect;
    let blocked = 0;
    for (let row = -1; row <= 1; row++) for (let col = -2; col <= 2; col++) {
      end.copy(f).addScaledVector(r, col * .4 * side).addScaledVector(up, row * (2 / 3) * top);
      // 軒や壁が少し離れていても、画面を覆う手前の家として拾う。
      end.normalize().multiplyScalar(8).add(pos);
      // 束ねた門・開いた扉も、壁と同じく視界の遮りに数える。
      // 既存の箱を使い、画面の中央を外れた柱や戸板も肩位置の選び直しへ渡す。
      near.copy(pos).lerp(end, .375);
      const cliff = rt.world.heightAt(near.x, near.z) > near.y - .2 ||
        rt.world.heightAt(end.x, end.z) > end.y - .2;
      if (cliff || cameraWallBlocked(rt, pos, end) ||
          (rt.world.cameraBlockFraction?.(pos, end) ?? null) !== null) {
        // 細い柱一本でも、目の前の中央を塞ぐ時は肩位置を選び直す。
        // 遠い壁は従来どおり画面全体の占有率で判断する。
        near.copy(pos).lerp(end, .375);
        const central = row === 0 && col === 0 && (cliff || cameraWallBlocked(rt, pos, near) ||
          (rt.world.cameraBlockFraction?.(pos, near) ?? null) !== null);
        blocked += central ? 6 : 1;
      }
    }
    // 中央から外れた敵の手前の柱も、肩位置の選び直しに数える。
    const enemy = rt.army.missionMarkedEnemy;
    if (enemy?.alive) {
      end.copy(enemy.pos); end.y += enemy.mounted ? 2.2 : 1.4;
      near.copy(end).sub(pos);
      const length = near.length();
      if (length > .1 && near.dot(f) / length > .4) {
        near.multiplyScalar(Math.min(1, 3 / length)).add(pos);
        if (cameraWallBlocked(rt, pos, near) ||
            (rt.world.cameraBlockFraction?.(pos, near) ?? null) !== null) blocked += 6;
      }
    }
    return blocked;
  }

  clearWallView(pos, look) {
    const rt = this.rt, u = this.u;
    if (!u.alive || rt.over || rt.choice || rt.game?.photo ||
        this.aiming || this.cine || this.camShot || this.overHold || this.fpWanted() ||
        this.mounted || NAKA.cur) { this.wallViewAt = -1; return; }
    const eye = this.wallViewEye || (this.wallViewEye = new THREE.Vector3());
    const candidate = this.wallViewCandidate || (this.wallViewCandidate = new THREE.Vector3());
    const offset = this.wallViewOffset || (this.wallViewOffset = new THREE.Vector3());
    const view = this.wallViewLook || (this.wallViewLook = new THREE.Vector3());
    const direction = this.wallViewDirection || (this.wallViewDirection = new THREE.Vector3());
    const candidateLook = this.wallViewCandidateLook || (this.wallViewCandidateLook = new THREE.Vector3());
    const manual = !S.autoCam || (this.lookIdle || 0) < .7;
    direction.copy(look).sub(pos);
    eye.set(u.pos.x, u.pos.y + 1.6, u.pos.z);
    // 見回している間も壁の中へ入れない。手動の向きはそのまま保つ。
    if (cameraWallBlocked(rt, eye, pos)) {
      candidate.copy(pos);
      for (let i = 1; i <= 12; i++) {
        pos.copy(candidate).lerp(eye, Math.min(1, (i + .5) / 12));
        if (!cameraWallBlocked(rt, eye, pos)) break;
      }
      if (manual) look.copy(pos).add(direction);
      this.wallViewAt = -1;
    }
    // 再検査は四回／秒。点・形・材質を毎コマ作らない。
    if (!(this.wallViewAt > rt.t && this.wallViewAt <= rt.t + .25) ||
        Math.hypot(u.pos.x - this.wallViewX, u.pos.z - this.wallViewZ) > .4) {
      this.wallViewAt = rt.t + .25; this.wallViewX = u.pos.x; this.wallViewZ = u.pos.z;
      this.wallViewActive = false;
      let best = this.wallViewBlocked(pos, look);
      if (best > 5) {
        // 進む道へ目を向ける。壁の向こうの目的地へは向けない。
        const enemy = rt.army.missionMarkedEnemy;
        const guide = rt.dodgeGuide?.valid ? rt.dodgeGuide.pos : enemy?.alive ? enemy.pos : rt.missionGuide?.pos;
        const way = guide && (rt.world.def.guideWay?.(u, guide) || guide);
        let moveX = u.vel?.x || 0, moveZ = u.vel?.z || 0;
        if (Math.hypot(moveX, moveZ) < .2 && way) { moveX = way.x - eye.x; moveZ = way.z - eye.z; }
        const d = Math.hypot(moveX, moveZ);
        if (d > .2 && S.autoCam && (this.lookIdle || 0) >= .7) {
          candidate.set(eye.x + moveX / d * Math.min(6, d), eye.y, eye.z + moveZ / d * Math.min(6, d));
          if (!cameraWallBlocked(rt, eye, candidate)) look.copy(candidate);
        }
        const length = Math.hypot(look.x - eye.x, look.z - eye.z) || 1;
        const dx = (look.x - eye.x) / length, dz = (look.z - eye.z) / length;
        // 引ける場所から試し、左右の肩、最後に本人の目元を使う。壁は越えない。
        for (let i = 0; i < 21; i++) {
          const distance = i < 3 ? 4.2 : i < 6 ? 3 : i < 9 ? 1.5 : i < 12 ? .6 : 0;
          const side = i === 12 || i % 3 === 0 ? 0 : i % 3 === 1 ? .7 : -.7;
          candidate.set(eye.x - dx * distance + dz * side, eye.y + .1, eye.z - dz * distance - dx * side);
          // 両肩が壁に近い時は、本人の周りの通れる側も探す。
          if (i >= 13) {
            const angle = Math.atan2(dx, dz) + (i - 13) * Math.PI / 4;
            candidate.set(eye.x - Math.sin(angle) * 2.4, eye.y + .25, eye.z - Math.cos(angle) * 2.4);
          }
          rt.def.clampCamera?.(rt, candidate);
          if (!terrainSideClear(rt.world, candidate.x, candidate.y, candidate.z) ||
              candidate.y < cameraGroundAt(rt.world, candidate.x, candidate.z) + .65 ||
              cameraWallBlocked(rt, eye, candidate) || (rt.world.cameraBlockFraction?.(eye, candidate) ?? null) !== null) continue;
          // 戦ごとの肩位置の条件を、最後の壁よけでも守る。
          if (rt.def.cameraBodyClear?.(rt, candidate) === false) continue;
          candidateLook.copy(manual ? candidate : look);
          if (manual) candidateLook.add(direction);
          const blocked = this.wallViewBlocked(candidate, candidateLook);
          if (blocked >= best) continue;
          best = blocked; offset.copy(candidate).sub(eye); view.copy(candidateLook).sub(eye); this.wallViewActive = true;
          if (blocked <= 5) break;
        }
      }
    }
    if (this.wallViewActive) {
      candidate.copy(eye).add(offset);
      rt.def.clampCamera?.(rt, candidate);
      if (candidate.y >= cameraGroundAt(rt.world, candidate.x, candidate.z) + .65 &&
          rt.def.cameraBodyClear?.(rt, candidate) !== false &&
          !cameraWallBlocked(rt, eye, candidate) && (rt.world.cameraBlockFraction?.(eye, candidate) ?? null) === null) {
        pos.copy(candidate);
        if (manual) look.copy(pos).add(direction);
        else look.copy(eye).add(view);
      }
    }
  }

  // カメラの目の前（視線と画面の四隅の向き、1.1m 以内）に壁・崖・斜面があるか。あれば真ん中の線から外れた物でも体の方へ寄せ、少し上げる。
  // 数値だけで計算し（入れ物を作らない）、物の当たりは camBlockHit で拾った近くの物だけを使う。
  camFrontClear(target, P, look, inRoom) {
    if (inRoom) return;
    const W = this.rt.world, D = 1.1;
    const f = this._cfF || (this._cfF = new THREE.Vector3()), r = this._cfR || (this._cfR = new THREE.Vector3()), q = this._cfQ || (this._cfQ = new THREE.Vector3());
    const blocked = () => {
      f.copy(look).sub(P);
      if (f.lengthSq() < 1e-6) return false;
      f.normalize();
      r.set(f.z, 0, -f.x);
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0); else r.normalize();
      const gy = W.heightAt(P.x, P.z);
      // 左右だけでなく画面上端の軒と下端の梁も避ける。入れ物は共用する。
      const top = Math.tan(this.rt.camera.fov * Math.PI / 360) / this.rt.camera.zoom;
      const side = top * this.rt.camera.aspect;
      for (let k = 0; k < 9; k++) {
        const a = k === 0 || k > 6 ? 0 : (k & 1 ? side : -side);
        const b = k === 0 || k < 3 ? 0 : k < 5 || k === 7 ? top : -top;
        q.copy(f).addScaledVector(r, a).addScaledVector(_cUP, b).normalize();
        for (let s = 1; s <= 4; s++) {
          const d = D * s / 4, x = P.x + q.x * d, z = P.z + q.z * d, h = W.heightAt(x, z);
          if (P.y + q.y * d < h + 0.12 && h > gy + 0.5) return true;   // 平らな床ではなく、せり上がる斜面・崖
        }
        if (this.blockers?.length) {
          const end = this._cfEnd || (this._cfEnd = new THREE.Vector3());
          end.copy(P).addScaledVector(q, D);
          const hit = this.camBlockHit(P, end, false, 64 + k);
          if (hit !== null && P.y + q.y * D * hit > target.y - 1.0) return true;
        }
      }
      return false;
    };
    for (let i = 0; i < 6 && blocked(); i++) {
      P.lerp(target, 0.16);
      P.y = Math.max(P.y + 0.12, W.heightAt(P.x, P.z) + 0.65);
    }
  }

  // 自分からカメラへの線が、建物などに当たるか（当たれば 0〜1 の割合）
  // 支度中に大きな形の升と世界の球を用意する。地形は高さの検査だけで扱う。
  prepareCameraBlocks() {
    this.rt.scene.traverse((o) => {
      if (!o.geometry || !o.userData.camBlock || o === this.rt.world.terrain) return;
      camBlockWorld(o); camBlockSphere(o);
      if (o.isMesh) camGrid(o);
    });
    // 描く地面の高さの索引も、最初の視点移動より先に作る。
    cameraGroundAt(this.rt.world, this.u.pos.x, this.u.pos.z);
    this.camRayQueue = Array.from({ length: 80 }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), pending: false }));
    this.camRayCursor = 0;
    this.camContact = Array.from({ length: 32 }, () => ({ p: new THREE.Vector3(), o: null, v: 0, g: null, pos: 0, instance: 0 }));
    this.camContactI = 0;
    const from = this.u.pos.clone(); from.y += 1.58;
    this.camRayCount = 0;
    this.camBlockHitNow(from, from.clone().add(_cUP));
    this.camRayCount = 0;
  }

  // 初回は支度中に用意し、以後の全場面巡回は一コマ五百十二手・約一ミリ秒へ分ける。
  // 完成まで前の一覧を保つ。深さ分の入れ物と二つの一覧を交互に使い回す。
  refreshCameraBlocks(nowS) {
    const rt = this.rt, first = !this.blockAll;
    let scan = this.camAllScan;
    if (!scan) scan = this.camAllScan = { nodes: [], indices: [], all: [], active: false };
    if (!scan.active) {
      if (!first && nowS - this.camAllT < 10 &&
          (this.camSceneCount === rt.scene.children.length || nowS - this.camAllT < 1)) return;
      scan.active = true; scan.phase = 0; scan.at = 0; scan.all.length = 0;
      scan.nodes.push(rt.scene); scan.indices.push(-1);
      this.camAllT = nowS; this.camSceneCount = rt.scene.children.length;
    }
    const nodes = scan.nodes, indices = scan.indices, start = performance.now();
    let steps = 0;
    while (scan.active) {
      if (nodes.length) {
        const top = nodes.length - 1, o = nodes[top];
        if (indices[top] === -1) {
          if (scan.phase === 0 && o.geometry) {
            if ((o.userData.camBlock || o.userData.camNear) && o !== rt.world.terrain) scan.all.push(o);
            if (o.userData.camBlock || o.userData.camNear || o.userData.ext) camNearMesh(o);
          } else if (scan.phase === 1 && o.isMesh) camNearMesh(o);
          indices[top] = 0;
        }
        if (indices[top] < o.children.length) {
          nodes.push(o.children[indices[top]++]); indices.push(-1);
        } else { nodes.pop(); indices.pop(); }
      } else if (scan.phase === 0) { scan.phase = 1; scan.at = 0; }
      else if (scan.phase === 1) {
        // 室内の梁・柱も、木も、終わりにまとめて調べない。
        if (scan.at < NAKA.list.length) {
          const root = NAKA.list[scan.at++].mesh;
          if (root) { nodes.push(root); indices.push(-1); }
        } else { scan.phase = 2; scan.at = 0; }
      } else if (scan.phase === 2) {
        const trees = rt.world.treeMeshes;
        if (trees && scan.at < trees.length) camNearMesh(trees[scan.at++]);
        else scan.phase = 3;
      } else {
        if (rt.world.terrain) camNearMesh(rt.world.terrain);
        const old = this.blockAll;
        this.blockAll = scan.all; scan.all = old || [];
        this.camNearT = -Infinity; this.camScanI = null;
        scan.active = false;
      }
      if (!first && (++steps >= 512 || steps % 16 === 0 && performance.now() - start >= 1)) break;
    }
  }

  // 中央の線に一本を残し、前のコマで頼まれた隅・正面の線を順番に一本ずつ調べる。
  cameraRayFrame() {
    if (!this.camRayQueue) this.prepareCameraBlocks();
    this.refreshCameraBlocks(performance.now() / 1000);
    this.camRayCount = 0; this.camRaySlot = 0;
    const queue = this.camRayQueue;
    for (let n = 0; n < queue.length; n++) {
      const i = this.camRayCursor++ % queue.length, q = queue[i];
      if (!q.pending) continue;
      q.pending = false;
      this.camBlockHitNow(q.from, q.to);
      break;
    }
  }

  camBlockHit(from, to, central = false, slot = null) {
    if (!this.camRayQueue) this.prepareCameraBlocks();
    if (central && (this.camRayCount || 0) < 2) return this.camBlockHitNow(from, to);
    const i = slot ?? ((this.camRaySlot || 0) % 64);
    if (slot === null) this.camRaySlot = (this.camRaySlot || 0) + 1;
    const q = this.camRayQueue[i];
    q.from.copy(from); q.to.copy(to); q.pending = true;
    // 待っている線は、前のコマまでに拾った面の球と建物の体積で補う。
    let nearest = this.rt.world.cameraBlockFraction?.(from, to) ?? null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-8) return nearest;
    const lowY = this.camLowY;
    for (const c of this.camContact) {
      if (lowY != null && c.p.y < lowY) continue;
      if (!c.o || c.o.geometry !== c.g || c.g.attributes.position?.version !== c.pos || c.o.instanceMatrix?.version !== c.instance) continue;
      const ax = from.x - c.p.x, ay = from.y - c.p.y, az = from.z - c.p.z;
      const b = ax * dx + ay * dy + az * dz, d = ax * ax + ay * ay + az * az - 0.16;
      const disc = b * b - len2 * d;
      if (disc < 0) continue;
      const t = d <= 0 ? 0 : (-b - Math.sqrt(disc)) / len2;
      if (t >= 0 && t <= 1 && (nearest === null || t < nearest) && camBlockVisible(c.o, this.rt.scene) && camBlockWorld(c.o) === c.v) nearest = t;
    }
    return nearest;
  }

  camBlockHitNow(from, to) {
    if ((this.camRayCount || 0) >= 2) return this.rt.world.cameraBlockFraction?.(from, to) ?? null;
    this.camRayCount = (this.camRayCount || 0) + 1;
    const rt = this.rt;
    const volumeHit = rt.world.cameraBlockFraction?.(from, to) ?? null;
    const dir = this._cbDir || (this._cbDir = new THREE.Vector3());
    dir.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.0001) return null;
    const nowS = performance.now() / 1000;
    // 初回以外は cameraRayFrame で一コマに一度だけ巡回する。
    if (!this.blockAll) this.refreshCameraBlocks(nowS);
    const nearFrom = this.camNearFrom || (this.camNearFrom = new THREE.Vector3());
    // 近くの物の拾い直しは数コマに分ける（一コマに全部を回すと、0.5 秒ごとに一コマだけ重くなる）。
    // 拾い直しの間も前の一覧で当たりを見る。初めて・大きく跳んだ・線が届かない時だけ、その場で全部を回す。
    // 世界の球は覚えておき、親を含む移動・形の変更があった時だけ作り直す。
    const sph = this.camSph || (this.camSph = new WeakMap());
    const pick = (o, out) => {
      if (!camBlockVisible(o, rt.scene)) return;
      const version = camBlockWorld(o);
      let e = sph.get(o);
      const posVersion = o.geometry.attributes.position?.version;
      const instanceVersion = o.instanceMatrix?.version;
      if (!e || e.v !== version || e.g !== o.geometry || e.pos !== posVersion || e.instance !== instanceVersion || ((o.isBatchedMesh || o.isInstancedMesh) && e.t !== this.camNearT)) {
        if (e && e.pos !== posVersion && !o.isBatchedMesh && !o.isInstancedMesh) o.geometry.computeBoundingSphere();
        const sphere = camBlockSphere(o);
        e = e || { c: new THREE.Vector3(), r: 0 };
        e.c.copy(sphere.center).applyMatrix4(o.matrixWorld); e.r = sphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        e.v = version; e.g = o.geometry; e.pos = posVersion; e.instance = instanceVersion; e.t = this.camNearT;
        sph.set(o, e);
      }
      const reach = e.r + this.camScanReach;
      if (e.c.distanceToSquared(this.camScanFrom) < reach * reach) out.push(o);
    };
    const all = this.blockAll;
    // 前の候補の範囲から線が出る時は即座に補う。移動と線の長さを合わせて余白を測る。
    const urgent = !this.blockers || nearFrom.distanceToSquared(from) > 64 || nearFrom.distanceTo(from) + len + 1 > this.camNearReach;
    if (urgent || (this.camScanI == null && (nowS - (this.camNearT || 0) >= 0.5 || nearFrom.distanceToSquared(from) > 4 || len + 2 > this.camNearReach))) {
      this.camNearT = nowS;
      this.camScanFrom = (this.camScanFrom || new THREE.Vector3()).copy(from); this.camScanReach = Math.max(14, len + 4);
      this.camScanList = this.camScanList === this.blockers ? [] : (this.camScanList || []); this.camScanList.length = 0;
      this.camScanI = 0;
    }
    if (this.camScanI != null && (urgent || this.camScanFrame !== this.camCameraFrame)) {
      // 同じコマに隅・左右など何本の線を調べても、通常の見直しは一回だけ。
      this.camScanFrame = this.camCameraFrame;
      const end = urgent ? all.length : Math.min(all.length, this.camScanI + Math.max(1, Math.ceil(all.length / 8)));
      for (let i = this.camScanI; i < end; i++) pick(all[i], this.camScanList);
      this.camScanI = end;
      if (end >= all.length) {
        const old = this.blockers;
        this.blockers = this.camScanList; this.camScanList = old || [];
        nearFrom.copy(this.camScanFrom); this.camNearReach = this.camScanReach;
        this.camScanI = null;
      }
    }
    if (!this.blockers.length) return volumeHit;
    if (!this.ray) this.ray = new THREE.Raycaster();
    this.ray.camera = rt.camera;
    this.ray.set(from, dir.normalize());
    this.ray.far = len;
    const h = this.camHits || (this.camHits = []); h.length = 0;
    for (const o of this.blockers) {
      if (!camBlockVisible(o, rt.scene)) continue;
      camBlockWorld(o);
      camBlockRaycast(o, this.ray, h);
    }
    let nearest = volumeHit === null ? Infinity : volumeHit * len;
    const lowY = this.camLowY;
    for (const hit of h) if (lowY == null || hit.point.y >= lowY) nearest = Math.min(nearest, hit.distance);
    // 一番手前の面だけを記憶する。入れ物は固定数を使い回す。
    let contact = null;
    for (const hit of h) if ((lowY == null || hit.point.y >= lowY) && (!contact || hit.distance < contact.distance)) contact = hit;
    if (contact && this.camContact) {
      const c = this.camContact[this.camContactI++ % this.camContact.length];
      c.p.copy(contact.point); c.o = contact.object; c.v = camBlockWorld(contact.object);
      c.g = contact.object.geometry; c.pos = c.g.attributes.position?.version; c.instance = contact.object.instanceMatrix?.version;
    }
    return nearest < Infinity ? nearest / len : null;
  }

  // ---------------- 視点（三人称・一人称） ----------------
  // V（触る端末は左上の「視点」）で切り替える。選んだ方は次の戦でも使う
  // 回る順：三人称・普通 → 三人称・遠い → 一人称 → 三人称・近い → 三人称・普通
  // 見せ場の一枚を撮る（戦の定義から呼ぶ）：from の低い所（h m）から at を dur 秒見上げる。from・at は {x, z} か、それを返す関数
  // 例）桶狭間の「かかれ」：player.showShot({ x: 前へ 8m, z }, () => 自分の位置, 2)。森部・姉川の開戦：敵の横陣の正面 20m の低い所から敵陣を 3 秒
  // 戦っている時・一人称の時は撮らない（操作を奪わない）
  showShot(from, at, dur = 2.5, o = {}) {
    return false;
  }

  toggleView() {
    const r = S.camRange || 'mid';
    // 押すたびに一人称と三人称を行き来する（三人称は近い・普通・遠いの三段を回してから一人称へ行くと、押しても変わらないように見えた）。
    if (S.view === 'first') S.view = 'third';
    else S.view = 'first';
    void r;
    saveSettings();
    sfx('ui');
    const nm = { near: '近い', mid: '普通', far: '遠い' }[S.camRange || 'mid'];
    if (this.rt.def.missionStyle !== 'lesson' && this.rt.def.missionStyle !== 'raid') this.rt.hud.flash(S.view === 'first' ? '一人称（自分の目で見る）' : `三人称・${nm}（背中から見る）`, 'dim');
  }
  // 一人称で見てよい時か。開戦の引き・大事な場面・倒れた時・戦の終わり・写真モードは三人称に戻す（終われば一人称へ戻る）
  fpWanted() {
    const rt = this.rt;
    return S.view === 'first' && this.u.alive && !(this.introT > 0) && !this.cine && !rt.over && !(rt.game && rt.game.photo);
  }
  // 目の位置：骨の入った人なら頭の骨の少し上・前。無ければ体の高さから
  eyeRaw(out) {
    const u = this.u, h = u.human;
    const hb = h && h.root.visible && h.root.parent && h.bones && h.bones.Head;
    if (hb) {
      hb.getWorldPosition(out);
      out.y += 0.075;
    } else {
      // 骨の人が描かれていない時：体の縮尺（背丈 1.63m なら 0.935）に合わせた目の高さ（約 1.46m、馬上は馬の縮尺も）
      const sc = (u.mesh && u.mesh.scale.y) || 1;
      out.set(u.pos.x, u.pos.y + (1.56 + (this.mounted ? RIDE.y : 0)) * sc, u.pos.z);
    }
    return out;
  }
  // 手ほどき中も視線だけは動かせる。歩き・攻撃・回復の時間は進めない。
  updateLook(dt, input) {
    // ---- 視点 ----
    if (this.rt.def.autoTargetCamera && Math.abs(input.dx) + Math.abs(input.dy) > .5) {
      this.yaw += this.camYawOff || 0; this.camYawOff = 0;
      // 狙いは倒すまで保つ。自分で大きく見回して相手が視野の外へ出た時だけ外す。
      const t = this.cameraTarget;
      if (!t || Math.abs(angleDiff(this.yaw, Math.atan2(t.pos.x - this.u.pos.x, t.pos.z - this.u.pos.z))) > 1.1) {
        this.cameraTarget = null; this.cameraTargetReleased = true;
      }
    }
    const inv = S.invertY ? -1 : 1;
    // マウスの平滑化
    let tdx = input.touchDx || 0, tdy = input.touchDy || 0;
    let mdx = input.dx - tdx, mdy = input.dy - tdy;
    const lookDt = Math.max(0.001, dt);
    if (S.smooth) {
      const rate = 41.589, k = 1 - Math.exp(-rate * lookDt), tx = mdx / lookDt, ty = mdy / lookDt;
      mdx = tx * lookDt + (this.sdx - tx) * k / rate; mdy = ty * lookDt + (this.sdy - ty) * k / rate;
      this.sdx += (tx - this.sdx) * k; this.sdy += (ty - this.sdy) * k;
    }
    if (this.radial || this.radialKeyboard || input.key('Tab')) {
      mdx = mdy = tdx = tdy = 0; this.sdx = this.sdy = this.tdx = this.tdy = 0;
    }
    // 指の操作：小さな動きは細かく、大きく払うと速く回る（狙いやすく、振り向きやすく）。縦は横より控えめに
    if (isTouch) {
      const rate = 54.978, k = 1 - Math.exp(-rate * lookDt), tx = tdx / lookDt, ty = tdy / lookDt;
      const dx = tx * lookDt + ((this.tdx || 0) - tx) * k / rate, dy = ty * lookDt + ((this.tdy || 0) - ty) * k / rate;
      this.tdx = (this.tdx || 0) + (tx - (this.tdx || 0)) * k; this.tdy = (this.tdy || 0) + (ty - (this.tdy || 0)) * k;
      const aiming = this.aiming || this.draw > 0 || ((this.weapon === 'gun' || this.weapon === 'bow') && input.right);
      tdx = dx * (aiming ? 0.85 : 0.85 + Math.min(1, Math.abs(this.tdx) / 1800) * 0.55); tdy = dy * 0.8;
    }
    // 指・マウスとも従来の一・七五倍。保存済みの感度もそのまま効く。
    this.yaw -= (mdx * S.sens + tdx) * 0.0042;
    this.pitch = Math.max(-1.1, Math.min(1.05, this.pitch - (mdy * S.sens + tdy) * 0.00385 * inv));
    if (Math.abs(input.dx) + Math.abs(input.dy) > 0.5) this.manualLookAt = performance.now() / 1000;
    this.lookIdle = Math.abs(input.dx) + Math.abs(input.dy) > 0.5 ? 0 : this.lookIdle + dt;
  }

  // 壁よけで本人まで寄った三人称は左右の肩へ逃がす。頭上へ切り替えない。
  clearCameraBody(camera) {
    const u = this.u, rt = this.rt, pos = camera.position;
    if (!u.alive || this.mounted || this.fpK > .01 || u.naka || NAKA.cur || rt.game?.photo) return;
    const dx = pos.x - u.pos.x, dz = pos.z - u.pos.z, height = pos.y - u.pos.y;
    if (dx * dx + dz * dz >= 1.05 * 1.05 || height >= 2.55 || height < .25) return;
    const from = this._bodyFrom || (this._bodyFrom = new THREE.Vector3());
    const candidate = this._bodyCandidate || (this._bodyCandidate = new THREE.Vector3());
    const dir = this._bodyDir || (this._bodyDir = new THREE.Vector3());
    const ray = this._bodyRay || (this._bodyRay = new THREE.Raycaster());
    const hits = this._bodyHits || (this._bodyHits = []);
    from.copy(u.pos); from.y += 1.4;
    const yaw = this.yaw + (this.camYawOff || 0), sx = Math.cos(yaw), sz = -Math.sin(yaw);
    // 左右の肩、次に肩のすぐ後ろを試す（最大三本）。
    for (let i = 0; i < 3; i++) {
      const side = i === 0 ? 1.2 : i === 1 ? -1.2 : 0;
      const back = i === 2 ? 1.2 : 0;
      candidate.set(u.pos.x + sx * side - Math.sin(yaw) * back, u.pos.y + 2.05, u.pos.z + sz * side - Math.cos(yaw) * back);
      rt.def.clampCamera?.(rt, candidate);
      const x = candidate.x - u.pos.x, z = candidate.z - u.pos.z;
      if (x * x + z * z < 1.05 * 1.05 && candidate.y < u.pos.y + 2.55 ||
          candidate.y < cameraGroundAt(rt.world, candidate.x, candidate.z) + .65 ||
          rt.def.cameraBodyClear?.(rt, candidate) === false || cameraWallBlocked(rt, from, candidate) ||
          (rt.world.cameraBlockFraction?.(from, candidate) ?? null) !== null) continue;
      dir.copy(candidate).sub(from);
      const length = dir.length();
      ray.camera = camera; ray.set(from, dir.multiplyScalar(1 / length)); ray.far = length + .2;
      hits.length = 0;
      if (this.blockers) for (const o of this.blockers) {
        if (!camBlockVisible(o, rt.scene)) continue;
        camBlockWorld(o); camBlockRaycast(o, ray, hits);
        if (hits.length) break;
      }
      if (hits.length) continue;
      pos.copy(candidate);
      this.camPos.copy(pos);
      return;
    }
  }

  // 戦ごとの補正と地面の持ち上げの後に、実際の屋根・壁を両面で調べる。
  clearDrawBuildings(camera) {
    if (this.fpK > .5 || this.u.naka || !this.u.alive || !this.blockers?.length) return;
    const from = this._drawFrom || (this._drawFrom = new THREE.Vector3());
    const dir = this._drawDir || (this._drawDir = new THREE.Vector3());
    from.copy(this.u.pos); from.y += this.mounted ? 2.8 : 1.4;
    dir.copy(camera.position).sub(from);
    const length = dir.length();
    if (length < .45) { this.clearCameraBody(camera); camera.updateMatrixWorld(); return; }
    const ray = this._drawRay || (this._drawRay = new THREE.Raycaster());
    const end = this._drawEnd || (this._drawEnd = new THREE.Vector3());
    const right = this._drawRight || (this._drawRight = new THREE.Vector3());
    const up = this._drawUp || (this._drawUp = new THREE.Vector3());
    const sweep = this._drawSweep || (this._drawSweep = new THREE.Vector3());
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    // 中心が壁を抜けても、横長の画面の下隅が戸板へ残ることがある。
    // 目元から四隅までの幅も確保し、描く直前の視点を壁の手前へ寄せる。
    const halfH = Math.max(.22, Math.tan(camera.fov * Math.PI / 360) / camera.zoom * .6);
    const halfW = halfH * camera.aspect;
    const hits = this._drawHits || (this._drawHits = []);
    let distance = length;
    for (let i = 0; i < 5; i++) {
      end.copy(camera.position);
      if (i) end.addScaledVector(right, (i % 2 ? -1 : 1) * halfW)
        .addScaledVector(up, (i < 3 ? -1 : 1) * halfH);
      sweep.copy(end).sub(from);
      const span = sweep.length();
      ray.camera = camera; ray.set(from, sweep.multiplyScalar(1 / span)); ray.far = span + .35;
      hits.length = 0;
      for (const o of this.blockers) {
        if (!camBlockVisible(o, this.rt.scene)) continue;
        camBlockWorld(o); camBlockRaycast(o, ray, hits);
      }
      for (const hit of hits) distance = Math.min(distance, Math.max(.1, (hit.distance - .4) / span * length));
    }
    if (distance < length) {
      camera.position.copy(from).addScaledVector(dir, distance / length);
      this.camPos.copy(camera.position);
      camera.updateMatrixWorld();
    }
    this.clearCameraBody(camera);
    camera.updateMatrixWorld();
  }

  // 描く直前（on）と後：一人称の時だけ、自分の頭（兜・陣笠・顔）と背の指物・馬印を隠す。腕・手・武器・胴・脚は見せる
  fpHide(on, cam) {
    // 近い物を透かす仕組みは止める（透けて見えるのに当たりは残り、見えない壁になっていた。kaito 10/23 稲生 22）。
    //   カメラが物に埋まる時は clearDrawBuildings・camBlock の線で手前へ寄せる。戦の定義が nearFade: true の時だけ元のまま。
    CAM_NEAR_FADE.value = on && this.rt.def.nearFade === true && cam === this.rt.camera && !(this.rt.game && this.rt.game.photo) ? 1 : 0;
    CAM_NEAR_SCREEN_CUT.value = this.rt.def.nearSceneryScreenCut === false ? 0 : 1;
    CAM_NEAR_CLEAR_DEPTH.value = this.rt.def.nearSceneryClearDepth ?? 9.5;
    CAM_NEAR_FOOT.value = this.u.pos.y;
    CAM_NEAR_BODY.value.set(0, 0, 0);
    if (on && cam === this.rt.camera && this.fpK < .5 && this.u.alive && !this.u.naka && !NAKA.cur && !this.rt.game?.photo) {
      CAM_NEAR_BODY.value.copy(this.u.pos);
      CAM_NEAR_BODY.value.y += this.mounted ? 1.65 : .95;
      CAM_NEAR_BODY.value.applyMatrix4(cam.matrixWorldInverse);
    }
    if (CAM_NEAR_FADE.value) CAM_NEAR_PROJECTION.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]);
    if (!on) {
      if (this.hid) { for (const o of this.hid) o.visible = true; this.hid = null; }
      if (this.hidHead) { this.hidHead.scale.setScalar(1); this.hidHead.updateMatrix(); this.hidHead.updateMatrixWorld(true); this.hidHead = null; }
      if (this.mirOn) { const m = this.mirOn; this.mirOn = null; m.scale.x = -m.scale.x; m.updateMatrixWorld(true); }
      setFpCut(null); setFpArm(false);
      this.allyFade(null);
      this.propFade(null);
      return;
    }
    const rt = this.rt, u = this.u;
    if (cam === rt.camera && !(rt.game && rt.game.photo)) {
      this.allyFade(cam); this.propFade(cam);
      // この尾根でカメラが寄った時だけ自分の笠を透かす。描いた後は既存の処理で材質を戻す。
      if ((rt.def.nearSelfHatFadeRadius || rt.world.def.battleKey === 'shigisan') && this.fpK < 0.72 && u.alive) {
        const hat = u.human?.root.visible && u.human.root.parent ? u.human.parts?.hat || u.head : u.head;
        if (hat && hat.visible) {
          hat.getWorldPosition(_fpS);
          if (_fpS.distanceTo(cam.position) < (rt.def.nearSelfHatFadeRadius ?? 3.4)) hat.traverse(this.nearAllyFadePart);
        }
      }
    }
    if (cam !== rt.camera || this.fpK < 0.72 || (rt.game && rt.game.photo) || !u.alive) return;
    const hid = [];
    for (const o of [u.flag, u.uma]) if (o && o.visible) { o.visible = false; hid.push(o); }
    const h = u.human;
    // 火縄銃で狙う時は、自分の体と筒を隠して照門（画面の札）でのぞく（頬付けした腕と台木が目の前をふさがないように）
    if (this.weapon === 'gun' && this.aimK > 0.5) {
      for (const o of [u.mesh, h && h.root]) if (o && o.visible) { o.visible = false; hid.push(o); }
      this.hid = hid;
      return;
    }
    // 自分の体を左右に映して描く：兵の体は右手（武器）が体の左に来る作りなので、一人称では映して、
    // 武器を右手で画面の右に、手綱を左手で画面の左に見せる（動きの計算は映す前のまま。描く間だけ）
    if (u.mesh) { u.mesh.scale.x = -u.mesh.scale.x; u.mesh.updateMatrixWorld(true); this.mirOn = u.mesh; }
    // 目のすぐ前に来た自分の袖・肩の板（胴丸）は描かない。作った袖は隠す
    // 初陣の胴丸は肩と袖が目を囲む。手と槍を残し、目の周りの具足だけ広めに除く。
    setFpCut(cam.position, rt.def.missionStyle === 'lesson' ? 0.65 : 0.24); setFpArm(true);
    if (h && h.parts) {
      // 初陣の一人称では、目の前へ張り出す胴・袖・籠手を外す。武器は残す。
      // 描画後は hid から戻すので、視点を戻した時の姿も変えない。
      if (rt.def.missionStyle === 'lesson') for (const k of ['domaru', 'armor', 'torso', 'upperP', 'upperN', 'foreP', 'foreN', 'sleeveP', 'sleeveN', 'haori']) {
        const o = h.parts[k];
        if (o && o.visible) { o.visible = false; hid.push(o); }
      }
      for (const k of ['sodeP', 'sodeN', 'yoke', 'back', 'pole']) { const o = h.parts[k]; if (o && o.visible) { o.visible = false; hid.push(o); } }
      // 馬上：鞍に座った腿の筒（袴・佩楯の部品）は目の真下 0.5m に来て、見下ろすと中の空いた青い板が浮いて見える。一人称では描かない（見本の体の腿がそのまま見える）
      if (this.mounted) for (const k of ['thighP', 'thighN']) { const o = h.parts[k]; if (o && o.visible) { o.visible = false; hid.push(o); } }
      // 前腕の籠手の筒：込めの最中など、手が目の前（0.45m 以内）へ来て肘より近い時は、筒を手首の側からのぞくことになり、
      //   口の空いた黒い塊が手にくっついて見える（馬上の一人称の込め直し）。その時だけ描かない
      if (h.bones) for (const [k, side] of [['foreP', 'Right'], ['foreN', 'Left']]) {
        const o = h.parts[k], bh = h.bones[side + 'Hand'], be = h.bones[side + 'ForeArm'];
        if (!o || !o.visible || !bh || !be) continue;
        const dh = bh.getWorldPosition(_fpS).distanceTo(cam.position), de = be.getWorldPosition(_fpS).distanceTo(cam.position);
        if (dh < 0.45 && dh < de - 0.04) { o.visible = false; hid.push(o); }
      }
      // 腕の籠手・肩の部品が目のすぐ前（0.12m 以内）に来たら隠す（振りかぶった二の腕で画面が塞がらない）
      for (const k of ['upperP', 'upperN', 'sleeveP', 'sleeveN', 'haori']) {
        const o = h.parts[k];
        if (!o || !o.visible || !o.geometry) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        _fpS.copy(bs.center).applyMatrix4(o.matrixWorld);
        // 二の腕は目のそばに来やすい（刀を振る時など）ので、少し遠くから隠す
        const near = /^upper|^sleeve/.test(k) ? 0.22 : 0.12;
        if (_fpS.distanceTo(cam.position) - bs.radius * o.matrixWorld.getMaxScaleOnAxis() < near) { o.visible = false; hid.push(o); }
      }
    }
    if (h && h.root.visible && h.root.parent && h.bones && h.bones.Head) {
      // 頭の骨を小さく縮めると、頭に付いた物（兜・顔・胴丸の兜）がまとめて消える
      const hb = h.bones.Head;
      hb.scale.setScalar(0.001);
      // 骨は行列の自動更新を止めてある。縮尺だけ変えても笠と顔が残り、視界を覆ってしまう。
      hb.updateMatrix();
      hb.updateMatrixWorld(true);
      this.hidHead = hb;
    } else {
      // 骨の無い形（画質「低」）：胴に兜が付いているので胴ごと隠し、手と武器・脚だけ見せる
      for (const o of [u.body, u.head]) if (o && o.visible) { o.visible = false; hid.push(o); }
    }
    this.hid = hid;
  }

  // 戦の気配を音へ渡す（0.2秒おき。すぐそばを通る馬を聞き逃さない）：
  //   approach：こちらへ寄せてくる敵の大勢（近いほど・多いほど大きい）と、その向き（左右の振り）・遠さ
  //   tense：押されている度合い（近くの敵が味方より多い・味方の士気が落ちている）。crumble：近くの味方の隊が崩れかけた瞬間
  senseWar(dt) {
    this.warT = (this.warT || 0) - dt;
    if (this.warT > 0 || !this.rt.army || !this.u.alive) return;
    this.warT = 0.2;
    const u = this.u, army = this.rt.army;
    let ap = 0, ax = 0, az = 0, apN = 0, foes = 0, friends = 0, low = 0, cav = 0, cavNear = 0;
    for (const o of army.units) {
      if (!o.alive || o.isStruct || o === u) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > 160) continue;
      // 近くを駆ける騎馬（敵味方とも）：地鳴りと足もとの震えに
      if (o.mounted && d < 45 && o.mv && Math.abs(o.pos.y - u.pos.y) < 6) {
        const sp = Math.hypot(o.mv.x, o.mv.z);
        if (sp > 4.5) {
          const pace = Math.min(1.4, sp / 7);
          cav += (1 - d / 45) * (1 + 2 * Math.max(0, 1 - d / 12)) * pace;
          // 音は遠くから届くが、画面を揺らすのは同じ地面の十二歩以内を通る馬だけ。
          if (d < 12 && Math.abs(o.pos.y - u.pos.y) < 2 && !army.wallBetween(u.pos, -1, o.pos)) cavNear += (1 - d / 12) * pace;
        }
      }
      if (o.team !== u.team) {
        if (d < 30) foes++;
        const v = o.vel, sp = v ? Math.hypot(v.x, v.z) : 0;
        // 寄せてくる：こちらへ向かう速さがある者
        if (d > 6 && sp > 0.8 && -(v.x * dx + v.z * dz) / (d * sp) > 0.5) { const w = (1 - d / 160) * (o.mounted ? 2 : 1); ap += w; ax += dx * w; az += dz * w; apN++; }
      } else if (d < 30) { friends++; if (o.fleeing || (o.group && o.group.morale < 35)) low++; }
    }
    const approach = Math.min(1, ap / 25);
    // 向き：自分の見ている向きに対して左右どちらから来るか
    const al = Math.hypot(ax, az) || 1, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const pan = apN ? Math.max(-1, Math.min(1, -((ax / al) * fz - (az / al) * fx))) : 0;
    const dist = apN ? al / ap : 0;
    const tense = Math.min(1, Math.max(0, (foes - friends) / 10) + (friends ? low / friends : 0) * 0.8);
    const crumble = friends >= 4 && low / friends > 0.4 && !((this.crumbleT ?? -99) + 25 > this.rt.t);
    if (crumble) this.crumbleT = this.rt.t;
    // 自分が駆けていれば自分の馬も数える（群れで駆けるほど地が鳴る）
    if (this.mounted && Math.abs(this.hspd || 0) > 7) cav += 1.5;
    this.cavRumble = Math.min(1, cav / 7);
    this.cavShake = Math.min(1, cavNear / 3);
    const scene = this._warScene || (this._warScene = {});
    scene.approach = approach; scene.approachPan = pan; scene.approachDist = dist;
    scene.tense = tense; scene.crumble = crumble ? 1 : 0; scene.hoofRumble = this.cavRumble;
    setScene(scene);
  }

  // 描く直前（cam）と後（null）：カメラと自分の間に入った小さな建て物（足場・櫓・小屋など、差し渡し 16m まで）を隠す
  // 寄せ（camBlockHit）で間に合わない細い格子（足場の骨組み）が画面を塞がないように。大きな塀や柵は寄せに任せる
  propFade(cam) {
    if (!cam) { if (this.propHid) { for (const o of this.propHid) o.visible = true; this.propHid = null; } return; }
    // 陣幕や小物を透かさない（kaito 10/23 稲生 22「透けさせない」）。カメラは寄せ（camBlockHit）で前へ出す。
    if (!this.rt.def.propFade) return;
    if (!this.blockers || !this.blockers.length || this.fpK > 0.5) return;
    const u = this.u, head = this._pfHead || (this._pfHead = new THREE.Vector3());
    head.set(u.pos.x, u.pos.y + 1.5 * ((u.mesh && u.mesh.scale.y) || 1) + (this.mounted ? RIDE.y : 0), u.pos.z);
    const L = cam.position.distanceTo(head);
    if (L < 0.5) return;
    if (!this.pray) this.pray = new THREE.Raycaster();
    this.pray.camera = cam;
    const hid = this.propHidden || (this.propHidden = []); hid.length = 0;
    // カメラが櫓・足場の骨組みの中に入り込んだ時（柱の隙間を抜けて寄せが効かない）：その物ごと隠す
    const cc = this._pc || (this._pc = new THREE.Vector3());
    const sight = this._pfSight || (this._pfSight = new THREE.Vector3());
    sight.copy(head).sub(cam.position).normalize();
    for (const o of this.blockers) {
      // 束全体は隠さない。個々の面でカメラを寄せる判定に任せる。
      if (!camBlockVisible(o, this.rt.scene) || !o.geometry || o.isBatchedMesh || o.isInstancedMesh || o.userData.camSurfaceFade) continue;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z);
      if (r > 8) continue;
      cc.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      // カメラが中に入った物でも、自分との間を塞ぐ時だけ隠す。横や後ろの陣幕・幟まで消すと「近づいたら透ける」に見えた（kaito 10/22 稲生 9）。
      if (cc.distanceTo(cam.position) < r * 0.85) {
        const t = (cc.x - cam.position.x) * sight.x + (cc.y - cam.position.y) * sight.y + (cc.z - cam.position.z) * sight.z;
        const px = cc.x - cam.position.x - sight.x * t, py = cc.y - cam.position.y - sight.y * t, pz = cc.z - cam.position.z - sight.z * t;
        if (t > -r * 0.2 && t < L + r * 0.2 && px * px + py * py + pz * pz < r * r * 0.36) { o.visible = false; hid.push(o); }
      }
    }
    const dir = this._pfDir || (this._pfDir = new THREE.Vector3());
    dir.copy(head).sub(cam.position).normalize();
    // 真ん中と左右上下の五本の線：どれかに当たった小さな物を隠す
    const right = this._pfRight || (this._pfRight = new THREE.Vector3());
    right.crossVectors(dir, _WORLD_UP).normalize();
    const from = this._pfFrom || (this._pfFrom = new THREE.Vector3());
    const toH = this._pfToH || (this._pfToH = new THREE.Vector3());
    for (const [a, b] of _PF_OFFSETS) {
      from.copy(cam.position).addScaledVector(right, a); from.y += b;
      toH.copy(head).sub(from).normalize();
      this.pray.set(from, toH);
      this.pray.far = Math.max(0.1, from.distanceTo(head) - 0.6);
      const hits = this.propHits || (this.propHits = []); hits.length = 0;
      for (const o of this.blockers) {
        if (o.isBatchedMesh || o.isInstancedMesh || !camBlockVisible(o, this.rt.scene)) continue;
        camBlockRaycast(o, this.pray, hits);
      }
      for (const h of hits) {
        const o = h.object;
        if (!o.visible || hid.includes(o) || o.userData.camSurfaceFade) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) > 8) continue;
        o.visible = false; hid.push(o);
      }
    }
    this.propHid = hid.length ? hid : null;
  }

  // 前の描画で透かした物があれば戻す。乱戦でも味方の姿を残す。
  allyFade(cam) {
    const F = this.fadeOn;
    if (cam && (F || this.nearAllyHid.length || this.nearAllyMats.length || this.nearSpearScales.length)) this.allyFade(null);
    if (!cam) {
      for (const entry of this.nearSpearScales) {
        entry.part.scale.set(entry.x, entry.y, entry.z);
        entry.part.updateMatrixWorld(true);
      }
      this.nearSpearScales.length = 0;
      for (const entry of this.nearAllyMats) entry.part.material = entry.source;
      this.nearAllyMats.length = 0;
      if (F) {
        for (const [o, m] of F.mats) o.material = m;
        for (const o of F.vis) o.visible = true;
        for (const [b, m] of F.bones) { b.matrix.copy(m); b.updateMatrixWorld(true); }
        this.fadeOn = null;
      }
      for (const o of this.nearAllyHid) o.visible = true;
      this.nearAllyHid.length = 0;
      this.nearAllyCam = null;
      this.nearFlagEnemy = null;
      return;
    }
    // 体は残し、視線を塞ぐ旗・馬印・竿だけを描く間避ける。入れ物は使い回す。
    const flagRadius = this.rt.def.nearFlagFadeRadius ?? 4.5;
    // カメラと自分の間を塞げない遠い兵は調べない（旗・竿の行列を全兵ぶん辿らない）。竿と旗の長さの分（10m）は余して見る
    const cpF = cam.position, D = this.rt.def;
    // 今届く相手が任務の追跡先と違っても、その本人への視線を空ける。
    const focus = ((D.missionStyle === 'lesson' || D.missionStyle === 'ford' || D.missionStyle === 'raid') && this.inRange ? this.rangeCueTarget : null) ||
      (!!D.missionStyle ? D.missionSignTarget?.(this.rt) : null) ||
      this.rt.hud?.outlinedEnemy || this.rt.guideEnemy || this.lock;
    this.nearFlagEnemy = focus;
    const focusX = focus?.alive ? focus.pos.x - cpF.x : 0;
    const focusZ = focus?.alive ? focus.pos.z - cpF.z : 0;
    const focusLength2 = focusX * focusX + focusZ * focusZ;
    const cullR = Math.max(Math.hypot(this.u.pos.x - cpF.x, this.u.pos.z - cpF.z) + 10, flagRadius, D.nearLongWeaponRadius || 0, D.nearHoroRadius || 0, D.nearHatFadeRadius || 0, 8) + 2, cull2 = cullR * cullR;
    for (const o of this.rt.army.units) {
      if (!o.mesh || o.isStruct) continue;
      const dx = o.pos.x - cpF.x, dz = o.pos.z - cpF.z;
      if (dx * dx + dz * dz > cull2) {
        // 遠い兵は敵への視線の周りだけ。長い竿の余白は保ち、槍・笠・母衣は調べない。
        if (!focusLength2) continue;
        const t = Math.max(0, Math.min(1, (dx * focusX + dz * focusZ) / focusLength2));
        if ((dx - focusX * t) ** 2 + (dz - focusZ * t) ** 2 > 100) continue;
        if (this.flagObstructs(o.flag, cam, flagRadius)) {
          this.fadeNearFlag(o.flag);
          if (o.flag && o.human?.root.visible) this.fadeNearFlag(o.human.parts?.pole);
        }
        if (o.look?.standard && this.flagObstructs(o.standardFlag, cam, flagRadius)) this.fadeNearFlag(o.wpn);
        continue;
      }
      // 肩越しを横切る長柄を描く間だけ避ける。稲生・森部の敵の得物は残し、構えを読めるようにする。
      const longRadius = this.rt.def.nearLongWeaponRadius || 0;
      const closeLong = longRadius && o !== this.u && o.pos.distanceToSquared(cam.position) < longRadius * longRadius
        && (D.missionStyle !== 'lesson' && D.missionStyle !== 'ford' && !D.nearEnemyWeaponSolid || o.team === this.u.team || !o.alive || o.dying || o.downed || o.woundOut || o.rearWound);
      if (closeLong) {
        if ((o.wpnKind || o.lookWeapon) === 'spear' || o.look?.standard) this.hideNearFlag(o.wpn);
        if ((o.wpnKind || o.lookWeapon) === 'spear') this.hideNearFlag(o.dropped);
        this.hideNearFlag(o.flag); this.hideNearFlag(o.standardFlag);
        this.hideNearFlag(o.human?.parts?.pole);
      }
      const horoRadius = this.rt.def.nearHoroRadius || 0;
      if (horoRadius && o !== this.u && o.look?.horo && o.pos.distanceToSquared(cam.position) < horoRadius * horoRadius) {
        const back = o.human?.root.visible ? o.human.parts?.back : o.mesh;
        // 近い母衣が半透明でも顔を覆う戦では、背の装具だけ描く間避ける。
        // 骨のない人の全身は隠さず、従来の透かし方を保つ。
        if (this.rt.def.nearHoroWhole) {
          // 布と竹を別々に消さない。分かれた背の装具だけまとめて避ける。
          // 一体の具足は布も残し、籠だけが浮く姿や全身の透けを作らない。
          this.hideNearFlag(o.human?.parts?.back);
          // 一体の姿は近い時だけ避ける。全身を避ける戦以外は従来の上半身の透かしを保つ。
          const mergedRadius = this.rt.def.nearHoroMergedFadeRadius || 0;
          if (mergedRadius && (!o.human?.root.visible || !o.human.parts?.back) &&
              o.pos.distanceToSquared(cam.position) < mergedRadius * mergedRadius) {
            if (D.nearHoroMergedWhole) {
              // 一体の母衣で上半分だけ抜くと、空の籠や具足の切れ端が残る。
              // 視線に重なる人だけ、既存の一覧で描いた後に全身を戻す。
              if (flagMeshBlocksView(o.body, cam.position, this.u.pos, 1)) {
                this.hideNearFlag(o.mesh);
                this.hideNearFlag(o.flag); this.hideNearFlag(o.standardFlag);
              }
            } else {
              this.nearAllyFadePart(o.body, true);
              if (o.human?.root.visible) this.nearAllyFadePart(o.human.parts?.armor, true);
            }
          }
        } else if (this.rt.def.nearHoroClothHide) {
          // 遠目の一枚の具足にも母衣が入る。背の別部品の有無にかかわらず
          // 両方を支度し、描く直前の形の切り替えでも布を残さない。
          this.nearAllyFadePart(o.body, 'horo');
          this.nearAllyFadePart(o.human?.parts?.armor, 'horo');
          if (back === o.human?.parts?.back && this.rt.def.nearHoroHide) this.hideNearFlag(back);
        } else if (back?.visible) {
          if (this.rt.def.nearHoroHide && back === o.human?.parts?.back) this.hideNearFlag(back);
          else back.traverse(this.nearAllyFadePart);
        } else if (this.rt.def.nearHoroCrowdFade && o.human?.root.visible) {
          // 母衣が具足と一つの形になった兵にも届かせる。足と当たりは残す。
          this.nearAllyFadePart(o.human.parts?.armor, true);
        }
      }
      const near = this.flagBlocksView(o.pos, 5, cam);
      // 桶狭間では自分の黄旗を描く間だけ避け、集合ピンや敵を隠さない。
      const ownRaidFlag = D.missionStyle === 'raid' && o === this.u;
      // 稲生の自分の旗も、目当ての敵と▼を覆う間だけは透かす（初めての人の bot 10/28）。
      const ownFlag = o === this.u && D.key === 'inou' && !(this.fpK > .3) && !this.flagObstructsEnemy(o.flag, cam);
      if (ownRaidFlag) {
        this.hideNearFlag(o.flag);
        this.hideNearFlag(o.human?.parts?.pole);
      } else if (!ownFlag && (near || this.flagObstructs(o.flag, cam, flagRadius))) {
        this.fadeNearFlag(o.flag);
        if (o.flag && o.human?.root.visible) this.fadeNearFlag(o.human.parts?.pole);
      }
      if (near) this.fadeNearFlag(o.uma);
      // 寺の近い味方の笠を透かす。顔と体は既存の距離判定に任せる。
      const hatRadius = this.rt.def.nearHatFadeRadius || 0;
      if (hatRadius && o !== this.u && o.alive && o.team === this.u.team) {
        const hat = o.human?.root.visible && o.human.root.parent ? o.human.parts?.hat || o.head : o.head;
        if (hat?.visible) {
          if (D.nearHatAtHead) hat.getWorldPosition(_fpS);
          else _fpS.copy(o.pos);
          if (_fpS.distanceToSquared(cam.position) < hatRadius * hatRadius) hat.traverse(this.nearAllyFadePart);
        }
      }
      if (o.look?.standard && (near || this.flagObstructs(o.standardFlag, cam, flagRadius))) this.fadeNearFlag(o.wpn);
      // 槍は構えた後の形と、描く直前のカメラで判定する。柄が横から入る時も拾う。
      const closeSpear = (D.nearSpearFade ?? true) && o !== this.u && o.alive && !o.dying && o.team === this.u.team
        && (o.wpnKind || o.lookWeapon) === 'spear' && o.wpn?.visible
        && o.pos.distanceToSquared(cam.position) < 64;
      if (closeSpear) {
        // 手前の長柄だけ、描く間は細く短く透かす。当たりと次の描画には元の寸法を戻す。
        const part = o.wpn;
        let entry = this.nearSpearCache.get(part);
        if (!entry) { entry = { part, x: 1, y: 1, z: 1 }; this.nearSpearCache.set(part, entry); }
        entry.x = part.scale.x; entry.y = part.scale.y; entry.z = part.scale.z;
        this.nearSpearScales.push(entry);
        part.scale.set(entry.x * 0.55, entry.y * 0.55, entry.z * 0.72);
        part.updateMatrixWorld(true);
        part.traverse(this.nearAllyFadePart);
      }
      const goal = D.missionStyle === 'lesson' || D.missionStyle === 'raid' ? focus?.pos : this.rt.missionGuide?.pos;
      // 行き先の前を横切る手前の味方の長柄も避ける。敵の攻撃の見え方は保つ。
      let blocksGoal = false;
      if ((closeSpear || (D.missionStyle === 'lesson' || D.missionStyle === 'raid') && o !== this.u && o.team === this.u.team && o.wpn?.visible && (o.wpnKind || o.lookWeapon) === 'spear') && goal) {
        _fpS.set(goal.x, goal.y ?? this.rt.world.heightAt(goal.x, goal.z), goal.z);
        blocksGoal = flagMeshBlocksView(o.wpn, cam.position, _fpS, .35);
      }
      if (!((D.missionStyle === 'raid' || D.missionStyle === 'ford' || D.nearEnemyWeaponSolid) && o.team !== this.u.team && o.alive && !o.dying) && (!closeSpear || (D.hideBlockingCloseSpears ?? true)) && !(o === this.u && this.rt.def.keepPlayerWeapon) && (o.wpnKind || o.lookWeapon) === 'spear' && o.wpn?.visible
        && (flagMeshBlocksView(o.wpn, cam.position, this.u.pos)
          || (o.wpn.userData.flex?.on && (flagMeshBlocksView(o.wpn.userData.flex.a, cam.position, this.u.pos)
            || flagMeshBlocksView(o.wpn.userData.flex.b, cam.position, this.u.pos))) || blocksGoal)) this.hideNearFlag(o.wpn);
    }
    // 別に描く使番は軍勢の一覧にいない。指定した戦だけ、同じ材質の処理へ通す。
    if (D.nearCourierHoroHide && this.rt.couriers) for (const c of this.rt.couriers) {
      if (!c.m.visible || c.m.position.distanceToSquared(cam.position) >= D.nearHoroRadius ** 2) continue;
      // 母衣と胴が一体の使番は、指定した戦だけ人馬をまとめて避ける。
      // 布だけ抜いて竹籠や馬具を宙に残さず、描画後は既存の一覧から戻す。
      if (D.nearCourierHoroWhole) {
        if (flagMeshBlocksView(c.u.body, cam.position, this.u.pos, 1)) this.hideNearFlag(c.m);
        continue;
      }
      this.nearAllyFadePart(c.u.body, 'horo');
    }
    for (const g of this.rt.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const d = s.userData.std, carrier = s.userData.carrier;
        const pos = d.down || !carrier ? s.position : carrier.pos;
        const longRadius = this.rt.def.nearLongWeaponRadius || 0;
        const closePole = longRadius && (pos.x - cam.position.x) ** 2 + (pos.z - cam.position.z) ** 2 < longRadius * longRadius;
        if (closePole || this.flagBlocksView(pos, d.H + 1.5, cam) || this.flagObstructs(d.cloth, cam, flagRadius)) this.fadeNearFlag(s);
      }
    }
    // 指定した戦だけ、兵から離れた落ち槍も描く間避ける。片付け待ちの一覧を使い回す。
    const groundSpearRadius = D.nearGroundSpearRadius || 0;
    if (groundSpearRadius && this.rt.army.litter) for (const o of this.rt.army.litter) {
      if (o.visible && o.userData.groundSpear && o.position.distanceToSquared(cam.position) < groundSpearRadius * groundSpearRadius
        && flagMeshBlocksView(o, cam.position, this.u.pos, D.nearGroundSpearClearance ?? .15)) this.hideNearFlag(o);
    }
    // 置き幟も同じ遮蔽処理へ。開戦時に集めた一覧を使い、竿ごと描く間だけ避ける。
    if (this.rt.noboriFlags) for (const f of this.rt.noboriFlags) {
      if (this.flagObstructs(f, cam, flagRadius)) this.fadeNearFlag(f.parent);
    }
    // カメラが近い兵（敵味方）の体の中に入る時は、その兵を描く間だけ隠す（大写しの甲冑・笠・母衣が画面を塞がない）
    const cp = cam.position;
    if (this.rt.army.forNear) {
      this.nearAllyCam = cam;
      // 赤い▼と同じ本人への視線を空ける。相手選びは描く前に一度だけ。
      this.nearAllyGoal = this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid'
        ? focus?.pos : null;
      const viewRadius = this.fpK < .5 ? Math.hypot(this.u.pos.x - cp.x, this.u.pos.z - cp.z) + 1 : 0;
      // 桶狭間はカメラから本人までの視線を空ける。遠い目標でも探索は三十二歩まで。
      const goalRadius = this.nearAllyGoal ? D.missionStyle === 'raid'
        ? Math.max(18, Math.min(32, Math.sqrt(focusLength2) + 2)) : 10 : 4;
      this.nearAllyGoalRadius2 = goalRadius * goalRadius;
      this.rt.army.forNear(cp.x, cp.z, Math.max(goalRadius, this.rt.def.nearAllyFadeRadius || 2.2, viewRadius), this.nearAllyVisit);
    }
    if (this.rt.army.forNear) this.rt.army.forNear(cp.x, cp.z, Math.max(1.6, D.nearEnemyFadeRadius || 0), hideCameraEnemy, this);
    // 一人称：近い味方の槍・長物は視界を塞ぐので描く間だけ隠す。軒下などでカメラが自分の体に寄った時は自分の体も隠す
    if (this.fpK > 0.5 && this.rt.army.forNear) this.rt.army.forNear(cp.x, cp.z, 2.6, hideFirstPersonWeapon, this);
    {
      const su = this.u, sdx = su.pos.x - cp.x, sdz = su.pos.z - cp.z;
      if (su.mesh && su.mesh.visible && this.fpK < 0.5 && sdx * sdx + sdz * sdz < 2.25 && cp.y < su.pos.y + (su.mounted ? 3.4 : 2.3)) this.hideNearFlag(su.mesh);
      // 骨の入った自分の体も同じ（屋内の狭い所で壁に押されたカメラが肩に入り、黒い塊と刀だけが大写しになっていた。10/10 kaito）
      const sh = su.human && su.human.root;
      if (sh && sh.visible && this.fpK < 0.5 && sdx * sdx + sdz * sdz < 2.25 && cp.y < su.pos.y + (su.mounted ? 3.4 : 2.3)) { this.hideNearFlag(sh); if (su.wpn && su.wpn.visible) this.hideNearFlag(su.wpn); }
    }
  }

  hideNearFlag(o) {
    if (!o || !o.visible) return;
    o.visible = false;
    this.nearAllyHid.push(o);
  }

  // 自分だけでなく、今の行き先にかぶる手前の旗も透かす。
  flagObstructs(flag, cam, radius) {
    if (flagMeshBlocksView(flag, cam.position, this.u.pos, radius)) return true;
    if (this.flagObstructsEnemy(flag, cam)) return true;
    const goal = this.rt.missionGuide?.pos;
    if (!goal) return false;
    _fpS.set(goal.x, goal.y ?? this.rt.world.heightAt(goal.x, goal.z), goal.z);
    return flagMeshBlocksView(flag, cam.position, _fpS, radius);
  }

  flagObstructsEnemy(flag, cam) {
    // 任務の地点だけでなく、矢印の先の敵の胸までの視線も空ける。
    const enemy = this.nearFlagEnemy || this.rt.hud?.outlinedEnemy || this.rt.guideEnemy || this.lock;
    if (enemy?.alive) {
      // 判定側が一・四だけ上げる分を引き、笠の上でなく胸を隠す旗を拾う。
      const chest = (this.rt.def.missionStyle === 'raid' || this.rt.def.missionStyle === 'ford') ? (enemy.mounted ? 2.2 : 1.2) - 1.4 : enemy.mounted ? 1.2 : 0;
      _fpS.set(enemy.pos.x, enemy.pos.y + chest, enemy.pos.z);
      if (flagMeshBlocksView(flag, cam.position, _fpS, .35)) return true;
      // 胸への線が空いていても、旗が笠と▼を覆うことがある。
      // 同じ本人の胸と頭上まで空け、赤い▼と体を結び付けられるようにする。
      if (this.rt.def.missionStyle === 'raid' || this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'ford') {
        // 旗の判定は受け取った点から一・四だけ上を狙うため、その分を引く。
        _fpS.y = enemy.pos.y + inouSignHeight(enemy) - 1.4;
        if (flagMeshBlocksView(flag, cam.position, _fpS, .35)) return true;
      }
    }
    return false;
  }

  // 遮蔽物と分かった旗だけ測る。射影用の点は使い回す。
  flagCoversScreen(part, cam) {
    if (!part.geometry || part.isInstancedMesh) return false;
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (!box || box.isEmpty()) return false;
    part.updateWorldMatrix(true, false);
    const point = this.flagCoverPoint || (this.flagCoverPoint = new THREE.Vector3());
    let left = 1, right = -1, top = -1, bottom = 1;
    for (let i = 0; i < 8; i++) {
      point.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z).applyMatrix4(part.matrixWorld).project(cam);
      // カメラが布へ入った時は、射影が反転する前に避ける。
      if (point.z < -1 || point.z > 1) return true;
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
    }
    const width = Math.max(0, Math.min(1, right) - Math.max(-1, left));
    const height = Math.max(0, Math.min(1, top) - Math.max(-1, bottom));
    return width * height > .24;
  }

  fadeNearFlag(flag) {
    // 指定した戦も布と竿を一緒に避け、透けた布だけが宙に残る姿を作らない。
    if (this.rt.def.nearFlagWholeOcclusion || this.rt.def.missionStyle === 'lesson' || this.rt.def.missionStyle === 'raid') { this.hideNearFlag(flag); return; }
    if (flag?.visible) flag.traverse(this.nearFlagFadePart);
  }

  flagBlocksView(pos, height, cam) {
    const c = cam.position, p = this.u.pos;
    // 高い場所の旗はそのまま。近い竿も、布と一緒に判定する。
    if (pos.y > Math.max(c.y, p.y + 2) + 1 || pos.y + height < Math.min(c.y, p.y)) return false;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    if (dx * dx + dz * dz < 9) return true;
    const vx = p.x - c.x, vz = p.z - c.z, len2 = vx * vx + vz * vz;
    const t = len2 > 0.01 ? Math.max(0, Math.min(1, (dx * vx + dz * vz) / len2)) : 0;
    const x = dx - vx * t, z = dz - vz * t;
    // 自分の真横まで含む幅約三メートルの視線の通り道。
    return x * x + z * z < 2.25;
  }

  // 終幕の視点は一度だけ決める。操作中の俯角・一人称・見せ場を持ち越さない。
  updateDownCamera(dt, camera) {
    const u = this.u, W = this.rt.world;
    // 終幕で止まった硝煙は、戦の指定がある時だけ薄くする。形や材質は増やさない。
    if (this.rt.def.downFogFar) {
      const vis = Math.max(W.scene.fog.far, this.rt.def.downFogFar);
      W.scene.fog.far = vis; W.vis = vis; W.mountU.vis.value = vis;
    }
    const elapsed = this.rt.game?.paused ? 0 : dt;
    if (!this.downCamReady) {
      // 最後の傷だけを使う。落下や火傷で古い敵を見せない。
      const hit = this.lastHit;
      this.downHit = hit && this.rt.t - hit.t < 6 && Number.isFinite(hit.x) && hit.kind !== 'fall' && hit.kind !== 'fire' ? hit : null;
      const yaw = this.downHit ? Math.atan2(this.downHit.x - u.pos.x, this.downHit.z - u.pos.z) : this.yaw;
      this.downCamGoal = this.downCamGoal || new THREE.Vector3();
      const target = _cT.set(u.pos.x, u.pos.y + 1.8, u.pos.z);
      const margin = W.half - 1.5, north = W.def.fieldNorth ?? -W.half;
      const pull = this.rt.def.defeatCamPull || 0, lift = this.rt.def.defeatCamLift || 0;
      let best = -Infinity;
      this.downCamGoal.copy(target);
      // 敵と自分を見渡せる側を優先し、柵・幹・篝火を避ける。
      for (let i = 0; i < 9; i++) {
        const offset = i === 0 ? 0 : Math.ceil(i / 2) * Math.PI / 8 * (i % 2 ? 1 : -1);
        const a = yaw + offset;
        const want = _cW.set(u.pos.x - Math.sin(a) * (4 + pull), u.pos.y + 2.1 + lift, u.pos.z - Math.cos(a) * (4 + pull));
        want.x = Math.max(-margin, Math.min(margin, want.x));
        want.z = Math.max(north + 1.5, Math.min(margin, want.z));
        if (NAKA.cur) nakaCamClamp(want, this.fpK < 0.5);
        else terrainCameraClamp(W, target, want); // 切岸でも上空へ持ち上げない。
        const hit = this.camBlockHit(target, want);
        if (hit !== null) want.lerpVectors(target, want, Math.max(0, hit - 0.08));
        this.rt.def.clampCamera?.(this.rt, want);
        if (!NAKA.cur) want.y = Math.max(want.y, W.heightAt(want.x, want.z) + W.waterDepthAt(want.x, want.z) + 0.65);
        const dist = Math.hypot(want.x - u.pos.x, want.z - u.pos.z);
        if (want.y > u.pos.y + 3.6 + lift || dist > 6 + pull || Math.abs(want.x) > margin || want.z < north + 1.5 || want.z > margin) continue;
        let score = Math.min(4 + pull, dist) - Math.abs(offset) * 0.6;
        if (!NAKA.cur && !terrainSideClear(W, want.x, want.y, want.z)) score -= 6;
        for (const q of W.treePoints || []) {
          const bx = target.x - want.x, bz = target.z - want.z, len2 = bx * bx + bz * bz;
          const t = len2 > 0.01 ? Math.max(0, Math.min(1, ((q[0] - want.x) * bx + (q[1] - want.z) * bz) / len2)) : 0;
          if (Math.hypot(q[0] - want.x - bx * t, q[1] - want.z - bz * t) < 1.2) score -= 6;
        }
        for (const f of W.fires || []) if (f.lit && Math.hypot(f.x - want.x, f.z - want.z) < 2) score -= 6;
        if (score > best) { best = score; this.downCamGoal.copy(want); }
      }
      this.downCamReady = true;
      this.downK = 0;
      this.fpK = 0; u.fpk = 0;
      this.shake = 0; this.camPush = null; this.camLean = null; this.camShot = null; this.cine = null; this.neckV = null;
      POST.speed = 0; POST.drops = 0; speedStreaks();
      camera.near = 0.1;
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
    this.camPos.lerp(this.downCamGoal, reduceMotion() ? 1 : 1 - Math.exp(-elapsed * 2));
    const target = _cT.set(u.pos.x, u.pos.y + 1.8, u.pos.z);
    if (NAKA.cur) nakaCamClamp(this.camPos, this.fpK < 0.5);
    else terrainCameraClamp(W, target, this.camPos);
    const block = this.camBlockHit(target, this.camPos);
    if (block !== null) this.camPos.lerpVectors(target, this.camPos, Math.max(0, block - 0.03));
    this.rt.def.clampCamera?.(this.rt, this.camPos);
    camera.position.copy(this.camPos);
    const dx = u.pos.x - this.camPos.x, dz = u.pos.z - this.camPos.z, len = Math.hypot(dx, dz);
    const fx = len > 0.1 ? dx / len : Math.sin(this.yaw), fz = len > 0.1 ? dz / len : Math.cos(this.yaw);
    // 水平に近い目線で自分の先を見る。足元への注視や傾きを足さない。
    camera.up.copy(_WORLD_UP);
    const look = _cLk.set(this.camPos.x + fx * 12, this.camPos.y, this.camPos.z + fz * 12);
    const margin = W.half - 1.5, north = W.def.fieldNorth ?? -W.half;
    look.x = Math.max(-margin, Math.min(margin, look.x));
    look.z = Math.max(north + 1.5, Math.min(margin, look.z));
    if (Math.hypot(look.x - this.camPos.x, look.z - this.camPos.z) < 1) {
      look.x = this.camPos.x * 0.9; look.z = this.camPos.z * 0.9;
    }
    look.y -= Math.hypot(look.x - this.camPos.x, look.z - this.camPos.z) * 0.03;
    if (this.downHit) {
      const hit = this.downHit, foe = hit.source;
      // 敵が遠くへ去った後は、一撃を受けた場所を残す。
      const live = foe?.pos && !foe.gone && Math.hypot(foe.pos.x - hit.x, foe.pos.z - hit.z) < 12;
      look.set(live ? foe.pos.x : hit.x, (live ? foe.pos.y : hit.y) + (foe?.mounted ? 2.1 : 1.1), live ? foe.pos.z : hit.z);
      const horizontal = Math.hypot(look.x - camera.position.x, look.z - camera.position.z);
      look.y = Math.max(camera.position.y - horizontal * 0.35, Math.min(camera.position.y + horizontal * 0.35, look.y));
    }
    _downRotation.copy(camera.quaternion);
    camera.lookAt(look);
    _downGoalRotation.copy(camera.quaternion);
    if (!reduceMotion()) camera.quaternion.copy(_downRotation).slerp(_downGoalRotation, 1 - Math.exp(-elapsed * 2));
    this.downK = Math.min(1, this.downK + elapsed / 2);
    edgeDark(elapsed, this.downK);
  }

  cameraTargetValid(o) {
    return !!o && o.alive && !o.dying && !o.downed && !o.woundOut && !o.rearWound &&
      !o.gone && !o.noTarget && !o.civ && !o.isStruct && !o.fleeing && !o.playerOpeningBlocked &&
      o.team !== this.u.team && o.type !== 'dummy' && Math.abs(o.pos.y - this.u.pos.y) < 3;
  }

  // 攻撃を押した時の狙い：今の相手が近く前にいれば保ち、いなければ画面の前の一番近い敵。
  pickStrikeTarget() {
    const u = this.u, cy = this.yaw + (this.camYawOff || 0), cur = this.cameraTarget;
    const off = (o) => Math.abs(angleDiff(cy, Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z)));
    if (this.cameraTargetValid(cur) && Math.hypot(cur.pos.x - u.pos.x, cur.pos.z - u.pos.z) < 8 && off(cur) < 1.4) return cur;
    let best = null, bs = Infinity;
    for (const o of this.rt.army.units) {
      if (!this.cameraTargetValid(o)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d > 7) continue;
      const a = off(o);
      if (a > 1.3) continue;
      // 任務の▼の相手と、今届く相手を先に選ぶ。
      const score = d + a * 2.5 - (o === this.rt.army.missionMarkedEnemy || o === this.rangeCueTarget ? 2 : 0);
      if (score < bs && this.lockVisible(o) && !this.allyBetween(o)) { bs = score; best = o; }
    }
    if (best) { this.cameraTarget = best; this.cameraTargetReleased = false; this.cameraTargetT = .5; }
    return best || (this.cameraTargetValid(cur) ? cur : null);
  }

  updateCameraTarget(dt) {
    if (this.rt.def.steadyMeleeCamera) { this.cameraTarget = null; return; }
    if (!this.rt.def.autoTargetCamera) return;
    if (!this.u.alive || this.rt.over) { this.cameraTarget = null; return; }
    this.cameraTargetT = (this.cameraTargetT || 0) - dt;
    if (this.cameraTargetT > 0 && this.cameraTargetValid(this.cameraTarget)) return;
    this.cameraTargetT = .2;
    const u = this.u, previous = this.cameraTarget;
    // 狙った相手は倒れるか遠く離れるまで保つ。味方の陰に一瞬入っても乗り換えない。
    if (this.cameraTargetValid(previous) && Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < 20) return;
    this.cameraTarget = null;
    if (this.cameraTargetReleased) return;
    // 最初は大きい▼の本人。倒れた後は、実際に最も近い敵へ渡す。
    const marked = this.rt.army.missionMarkedEnemy;
    if (!previous && this.cameraTargetValid(marked) && Math.hypot(marked.pos.x - u.pos.x, marked.pos.z - u.pos.z) < 18 && this.lockVisible(marked)) {
      this.cameraTarget = marked; return;
    }
    let distance = 18;
    for (const o of this.rt.army.units) {
      if (!this.cameraTargetValid(o)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < distance && this.lockVisible(o)) { this.cameraTarget = o; distance = d; }
    }
  }
}
