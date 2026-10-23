import { armyGeometryCopy, clothGeo, soldierGeo } from './world_army_geometry.js';
import * as THREE from 'three';
import { S as SETTINGS, MEM_TIGHT } from './settings.js';


export class WorldVisibility {

  // 遠い軽い兵の塊（いちばん近い端が 38m より先。人の背丈が画面の一割に満たない）は角の少ない形で描く。並び・色・動きの入れ物（兵ごとの属性）は同じ物を使い回し、形だけ替える
  //   mid：中ほどの形を持つか（持たなければ 50m までは元の形）。xg：とても遠い形（無ければ兵の形。馬は馬の軽い形を渡す）
  lodFlag(mesh, banner = false, yose = false) {
    const g = banner ? clothGeo(yose ? 0.66 : 0.72, yose ? 3.7 : 2.6, 1, 2, 0.3, 5.2, 0.14, 12) : clothGeo(0.34, 0.62, 1, 1, 0, 2.62, -0.17, 11);
    this.lodTwin(mesh, null, true, g);
    if (!banner) mesh.userData.lod.sashi = true;
    g.dispose();
  }

  lodTwin(mesh, armor, mid = true, xg = null, minLv = 0, xg3 = null) {
    // 指定した戦の中遠景は、近景と同じ形を重ねず、腕と袖の細部を省いた形へ。
    // 兵数・塊ごとの打ち合い・骨の動きは変えない。馬と旗には専用の形を使う。
    const gx = armyGeometryCopy(xg || soldierGeo(armor, this.def.middleInfantryArms ? 'xlo' : true || this.def.lowArmyMiddleDetail ? 'xxlo' : 'xlo')), g = !mid ? mesh.geometry : xg ? gx : armyGeometryCopy(soldierGeo(armor, false && (this.def.denseFront || this.def.lowArmyDetail) ? 'xlo' : 'lo'));
    const gxx = xg ? (xg3 ? armyGeometryCopy(xg3) : gx) : armyGeometryCopy(soldierGeo(armor, !mesh.geometry.attributes.aClash ? 'x4lo' : 'x3lo')), g4 = xg ? null : armyGeometryCopy(soldierGeo(armor, 'x4lo'));
    for (const k in mesh.geometry.attributes) { const at = mesh.geometry.attributes[k]; if (at.isInstancedBufferAttribute) { if (g !== mesh.geometry) g.setAttribute(k, at); gx.setAttribute(k, at); gxx.setAttribute(k, at); if (g4) g4.setAttribute(k, at); } }
    mesh.userData.lod = { hi: mesh.geometry, lo: g, xlo: gx, xxlo: gxx, x4: g4, minLv, n: -1, far: false, lv: -1 };   // 遠い側は近距離判定でも重い形に戻さない。
    (this.lodList || (this.lodList = [])).push(mesh);
  }

  // 長い鉄砲の列は兵ごとの遠さで形を選ぶ。人数・射撃・移動の元の束は保つ。
  soldierDetail(source, group, armor, middle = 32) {
    const capacity = source.instanceMatrix.count, matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const meshes = [source.userData.lod.hi, soldierGeo(armor, 'xlo'), soldierGeo(armor, 'x3lo')].map((base) => {
      const geo = armyGeometryCopy(base);
      for (const [name, attribute] of Object.entries(source.geometry.attributes)) if (attribute.isInstancedBufferAttribute) {
        geo.setAttribute(name, new THREE.InstancedBufferAttribute(new attribute.array.constructor(attribute.array.length), attribute.itemSize, attribute.normalized).setUsage(THREE.DynamicDrawUsage));
      }
      const mesh = new THREE.InstancedMesh(geo, source.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (source.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false; mesh.userData.noFreeze = true;
      group.add(mesh); return mesh;
    });
    const attributes = Object.entries(source.geometry.attributes).filter(([, a]) => a.isInstancedBufferAttribute);
    source.layers.mask = 0;
    (this.soldierDetails || (this.soldierDetails = [])).push((renderer, scene, camera) => {
      if (!group.visible) { for (const mesh of meshes) mesh.count = 0; return; }
      source.onBeforeRender(renderer, scene, camera);
      for (const mesh of meshes) {
        mesh.count = 0; mesh.visible = source.visible; mesh.material = source.material;
        mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
      }
      for (let i = 0; i < source.count; i++) {
        source.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(source.matrixWorld);
        const d2 = point.distanceToSquared(camera.position);
        const mesh = meshes[d2 <= 16 * 16 ? 0 : d2 <= middle * middle ? 1 : 2], n = mesh.count++;
        mesh.setMatrixAt(n, matrix);
        if (source.instanceColor) for (let k = 0; k < 3; k++) mesh.instanceColor.array[n * 3 + k] = source.instanceColor.array[i * 3 + k];
        for (const [name, attribute] of attributes) {
          const target = mesh.geometry.attributes[name], size = attribute.itemSize;
          for (let k = 0; k < size; k++) target.array[n * size + k] = attribute.array[i * size + k];
        }
      }
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        for (const [name] of attributes) mesh.geometry.attributes[name].needsUpdate = true;
      }
    });
  }

  // 地図じゅうに並べた木や草は、全画質で画面に入る物だけ同じ束へ残す。近くの影も保つ。
  //   画面に入る木（高さ・幅・風の余裕つき）と、近く（near m の内）の木だけを前へ詰めて描く。カメラの移動・上下左右の向き・画角が変わった時だけ詰め直す
  viewCull(meshes, near, far = Infinity, thin = true) {
    far = Math.min(far, 140);
    const m0 = meshes[0], N = m0.count;
    if (!N) return;
    const pts = new Float32Array(N * 3), radii = new Float32Array(N), A = m0.instanceMatrix.array;
    const centers = this.def?.tightSceneryCull && SETTINGS.quality === 'high' ? new Float32Array(N * 3) : null;
    let radius = 0;
    for (const m of meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (centers && !m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingSphere;
      radius = Math.max(radius, b.radius + b.center.length());
    }
    for (let i = 0; i < N; i++) {
      const k = i * 16;
      pts[i * 3] = A[k + 12]; pts[i * 3 + 1] = A[k + 13]; pts[i * 3 + 2] = A[k + 14];
      radii[i] = radius * Math.max(Math.hypot(A[k], A[k + 1], A[k + 2]), Math.hypot(A[k + 4], A[k + 5], A[k + 6]), Math.hypot(A[k + 8], A[k + 9], A[k + 10])) + 2;
      if (centers) {
        // 足元中心の球を最大の拡大率で伸ばすと、細長い草や板塀まで巨大な囲みになる。
        // 設営時だけ各部品の箱を回転・拡大し、実際の中心と広がりを保存する。
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (const m of meshes) {
          const b = m.geometry.boundingBox, a = m.instanceMatrix.array;
          const x = (b.min.x + b.max.x) * .5, y = (b.min.y + b.max.y) * .5, z = (b.min.z + b.max.z) * .5;
          const hx = (b.max.x - b.min.x) * .5, hy = (b.max.y - b.min.y) * .5, hz = (b.max.z - b.min.z) * .5;
          const cx = a[k] * x + a[k + 4] * y + a[k + 8] * z + a[k + 12];
          const cy = a[k + 1] * x + a[k + 5] * y + a[k + 9] * z + a[k + 13];
          const cz = a[k + 2] * x + a[k + 6] * y + a[k + 10] * z + a[k + 14];
          const rx = Math.abs(a[k]) * hx + Math.abs(a[k + 4]) * hy + Math.abs(a[k + 8]) * hz;
          const ry = Math.abs(a[k + 1]) * hx + Math.abs(a[k + 5]) * hy + Math.abs(a[k + 9]) * hz;
          const rz = Math.abs(a[k + 2]) * hx + Math.abs(a[k + 6]) * hy + Math.abs(a[k + 10]) * hz;
          x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx);
          y0 = Math.min(y0, cy - ry); y1 = Math.max(y1, cy + ry);
          z0 = Math.min(z0, cz - rz); z1 = Math.max(z1, cz + rz);
        }
        // 風の余裕は従来どおり残す。距離段階と影の距離は元の足元で選ぶ。
        const tightRadius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * .5 + 2;
        const tight = tightRadius < radii[i];
        centers[i * 3] = tight ? (x0 + x1) * .5 : pts[i * 3];
        centers[i * 3 + 1] = tight ? (y0 + y1) * .5 : pts[i * 3 + 1];
        centers[i * 3 + 2] = tight ? (z0 + z1) * .5 : pts[i * 3 + 2];
        if (tight) radii[i] = tightRadius;
      }
    }
    const orig = meshes.map((m) => ({ m, mat: m.instanceMatrix.array.slice(0, N * 16), col: m.instanceColor ? m.instanceColor.array.slice(0, N * 3) : null }));
    const L = this.cullList || (this.cullList = []);
    const packed = new Uint32Array(N);
    for (let i = 0; i < N; i++) packed[i] = i;
    // 設営時に32mの升へ分ける。背中側の升は株ごとの六面判定を省く。
    const cells = [], cellOf = new Uint32Array(N), lookup = new Map();
    for (let i = 0; i < N; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2], r = radii[i];
      const key = Math.floor(x / 32) + ',' + Math.floor(z / 32);
      let cell = lookup.get(key);
      if (!cell) {
        cell = { id: cells.length, box: new THREE.Box3(), x0: x, x1: x, z0: z, z1: z, on: true };
        lookup.set(key, cell); cells.push(cell);
      }
      cellOf[i] = cell.id;
      cell.x0 = Math.min(cell.x0, x); cell.x1 = Math.max(cell.x1, x);
      cell.z0 = Math.min(cell.z0, z); cell.z1 = Math.max(cell.z1, z);
      const cx = centers ? centers[i * 3] : x, cy = centers ? centers[i * 3 + 1] : y, cz = centers ? centers[i * 3 + 2] : z;
      cell.box.min.x = Math.min(cell.box.min.x, cx - r); cell.box.max.x = Math.max(cell.box.max.x, cx + r);
      cell.box.min.y = Math.min(cell.box.min.y, cy - r); cell.box.max.y = Math.max(cell.box.max.y, cy + r);
      cell.box.min.z = Math.min(cell.box.min.z, cz - r); cell.box.max.z = Math.max(cell.box.max.z, cz + r);
    }
    L.push({ orig, pts, centers, radii, packed, bands: new Uint8Array(N), cells, cellOf, N, near, far2: far * far, thin: false, keepDensity: !thin, x: 1e9, y: 0, z: 0, fx: 0, fy: 0, fz: 0, projection: 0 });
    // カメラは描く時に拾う（毎コマの詰め直しは world.update で）
    const world = this;
    for (const m of meshes) {
      // 株の詰め替えと風は行列・頂点の配列で扱い、束自体の位置は動かさない。
      m.updateMatrix(); m.matrixAutoUpdate = false;
      // 並べ替えても株の位置は元の全株の部分集合。囲みは設営時の物を保つ。
      // 詰め直すたびに全株の行列を二巡し、箱と球を作り直さない。
      m.computeBoundingBox(); m.computeBoundingSphere();
      const distant = m.userData.farFoliage;
      if (distant) {
        // 遠景は葉の形が違うので、同じ全株の配置で専用の囲みを先に作る。
        const count = distant.count;
        distant.instanceMatrix.array.set(m.instanceMatrix.array);
        // 遠景へ初めて切り替わるコマに、全株ぶんの色の領域を作らない。
        if (m.instanceColor && !distant.instanceColor) distant.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
        distant.count = N;
        distant.computeBoundingBox(); distant.computeBoundingSphere();
        distant.count = count;
      }
      m.frustumCulled = false;
      const f = m.onBeforeRender, beforeShadow = m.onBeforeShadow, afterShadow = m.onAfterShadow;
      // 設営中に用意した影の行列も、保存と復帰を対にして重ねる。影が終わるたび元の数へ戻す。
      m.onBeforeShadow = function (r, sc, cam, shadowCam, geo, mat, group) {
        beforeShadow.call(this, r, sc, cam, shadowCam, geo, mat, group);
        if (this.userData.cullS != null && this.userData.preS == null) { this.userData.preS = this.count; this.count = Math.min(this.count, this.userData.cullS); }
      };
      m.onAfterShadow = function (r, sc, cam, shadowCam, geo, mat, group) {
        if (this.userData.preS != null) { this.count = this.userData.preS; this.userData.preS = null; }
        afterShadow.call(this, r, sc, cam, shadowCam, geo, mat, group);
      };
      m.onBeforeRender = function (r, sc, cam, geo, mat, group) {
        if (this.userData.preS != null) { this.count = this.userData.preS; this.userData.preS = null; }
        // 初めて見るカメラ（開戦の最初のコマ・写真の視点）は、その場で詰め直す（一コマ目に地図じゅうの木と石を描かない）
        if (cam && cam.isPerspectiveCamera && world.cullCam !== cam) { world.cullCam = cam; world.cullTick(true); }
        return f.call(this, r, sc, cam, geo, mat, group);
      };
    }
  }

  // 球の上端と幅を覆う九点が同じ山腹より下の時だけ隠す。近景と見下ろす地図は対象外。
  terrainHidden(px, py, pz, sphere, box = null) {
    if ((!this.def.distantMaterialBatch && true) || !this.def.lowMountainCull) return false;
    const p = sphere.center, radius = sphere.radius + 2;
    const dx = p.x - px, dz = p.z - pz;
    if (dx * dx + dz * dz < (radius + 35) ** 2) return false;
    // 城壁の区画には実際の囲みを使う。横に長い塀の球の上端は、
    // 屋根より何十メートルも高くなり、山腹に隠れた面まで残していた。
    // 横幅と奥行き・上端に二メートルの余裕を残す。影の判定は変えない。
    const topY = box ? box.max.y + 2 : p.y + radius;
    const widthX = box ? (box.max.x - box.min.x) / 2 + 2 : radius;
    const widthZ = box ? (box.max.z - box.min.z) / 2 + 2 : radius;
    for (let step = 1; step <= 3; step++) {
      const t = step / 4, x = px + dx * t, z = pz + dz * t;
      const top = py + (topY - py) * t + 3;
      let blocked = true;
      for (let ix = -1; ix <= 1 && blocked; ix++) for (let iz = -1; iz <= 1; iz++) {
        if (this.heightAt(x + ix * widthX * t, z + iz * widthZ * t) <= top) { blocked = false; break; }
      }
      if (blocked) return true;
    }
    return false;
  }

  cullTick(fresh = false) {
    const cam = this.cullCam;
    if (!this.cullList || !cam) return;
    const e = cam.matrixWorld.elements, px = e[12], py = e[13], pz = e[14];
    const shadowFocus = this.lastFocus || this.sun.target.position, sx = shadowFocus.x, sz = shadowFocus.z;
    const shadowRange2 = 1600;
    const fx = -e[8], fy = -e[9], fz = -e[10], projection = cam.projectionMatrix.elements[0];
    const V = this.vegView || (this.vegView = { fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sphere: new THREE.Sphere(), box: new THREE.Box3() });
    V.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); V.fr.setFromProjectionMatrix(V.pm);
    // 首振りで木・石・草の全束を同時に詰め直さず、一コマ一束ずつ巡る。
    // 初めての視点だけは全束をそろえ、開戦時に地図じゅうの株を描かない。
    // 待つ束は直前の描画を保ち、兵の数・斬り合い・影の範囲は変えない。
    const total = this.cullList.length;
    for (let checked = 0; checked < total; checked++) {
      const at = (this.cullCursor || 0) % total, C = this.cullList[at];
      this.cullCursor = (at + 1) % total;
      if (C.shadowRange2 === shadowRange2 && Math.hypot(px - C.x, py - C.y, pz - C.z) < 1 && Math.hypot(sx - C.sx, sz - C.sz) < 1 && fx * C.fx + fy * C.fy + fz * C.fz > 0.9998 && projection === C.projection) continue;
      C.shadowRange2 = shadowRange2;
      C.x = px; C.y = py; C.z = pz; C.fx = fx; C.fy = fy; C.fz = fz; C.projection = projection;
      C.sx = sx; C.sz = sz;
      // 景物の動く影を使わない戦では、影のためだけに背後の木や塀を残さない。
      // 遠近の形を替える距離・画面端の揺れの余裕・本数はそのまま。
      const P = C.pts, nr2 = this.def.sceneryViewOnly ? 0 : C.near * C.near;
      for (const cell of C.cells) {
        const dx = Math.max(cell.x0 - px, 0, px - cell.x1), dz = Math.max(cell.z0 - pz, 0, pz - cell.z1);
        const margin = (Math.max(Math.abs(cell.x0 - px), Math.abs(cell.x1 - px)) + Math.max(Math.abs(cell.z0 - pz), Math.abs(cell.z1 - pz))) * .02;
        V.box.copy(cell.box).expandByScalar(margin);
        const dd = dx * dx + dz * dz;
        cell.on = dd <= C.far2 && (dd <= nr2 || V.fr.intersectsBox(V.box));
      }
      let n = 0, changed = false, nS = 0, nNear = 0;
      // 高画質の距離・見切れ判定は一度だけ。結果の入れ物は設営時から使い回す。
      const bands = C.bands;
      // 高の影は本人から40m内。葉の形を替える距離55mは保ち、影・近景・遠景の順に詰める。
      for (let pass = 0; pass < 3; pass++) {
      if (pass === 1) nS = n;
      if (pass === 2) nNear = n;
      for (let i = 0; i < C.N; i++) {
        if (bands && pass > 0) {
          if (bands[i] !== pass) continue;
        } else {
          if (bands) bands[i] = 3;
          if (!C.cells[C.cellOf[i]].on) continue;
          const dx = P[i * 3] - px, dz = P[i * 3 + 2] - pz, d2 = dx * dx + dz * dz;
          const sdx = P[i * 3] - sx, sdz = P[i * 3 + 2] - sz;
          const band = d2 > 3025 ? 2 : sdx * sdx + sdz * sdz <= shadowRange2 ? 0 : 1;
          if (d2 > C.far2 || (!bands && pass !== band)) continue;
          const centers = C.centers || P;
          V.sphere.center.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]);
          // 次の詰め直しまでの小さな首振りは、遠い草ほど大きな余裕にする。
          V.sphere.radius = C.radii[i] + (Math.abs(dx) + Math.abs(dz)) * .02;
          // 木の高さと幅・風で揺れる余裕まで含めて、画面の外だけを省く。近くの木は残す。
          if (d2 > nr2 && !V.fr.intersectsSphere(V.sphere)) continue;
          if (cam.isPerspectiveCamera && this.terrainHidden(px, py, pz, V.sphere)) continue;
          // 近くの木（near のある物）は、90m より先を二本に一本・160m より先を四本に一本（霞の中で森の塊に見えれば足りる）
          //   高は 120m・200m・280m から（霞の奥の木と草を間引く）
          if (MEM_TIGHT && !C.keepDensity && (C.thin ? nr2 && ((d2 > 8100 && (i & 1)) || (d2 > 25600 && (i & 2)) || (d2 > 57600 && (i & 4))) : (d2 > 14400 && (i & 1)) || (d2 > 40000 && (i & 2)) || (d2 > 78400 && (i & 4)))) continue;
          if (bands) {
            bands[i] = band;
            if (band !== pass) continue;
          }
        }
        // 首を振っても束の並びが同じなら、行列と色の写し直し・転送を省く。
        if (C.packed[n] === i) { n++; continue; }
        C.packed[n] = i; changed = true;
        for (const o of C.orig) {
          // subarray の一時の入れ物を、木や草の数だけ作らない。
          const dst = o.m.instanceMatrix.array, src = i * 16, at = n * 16;
          for (let k = 0; k < 16; k++) dst[at + k] = o.mat[src + k];
          if (o.col) { const col = o.m.instanceColor.array; for (let k = 0; k < 3; k++) col[n * 3 + k] = o.col[i * 3 + k]; }
        }
        n++;
      }
      }
      for (const o of C.orig) {
        const far = o.m.userData.farFoliage;
        if (far) {
          // 近景を先頭へ詰める既存の並びを使う。幹と木の本数は距離で減らさない。
          const refresh = changed || far.count !== n - nNear || o.m.count !== nNear;
          o.m.count = nNear; far.count = n - nNear;
          if (refresh) {
            const src = o.m.instanceMatrix.array, dst = far.instanceMatrix.array;
            for (let k = 0; k < far.count * 16; k++) dst[k] = src[nNear * 16 + k];
            if (o.col) {
              if (!far.instanceColor) far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(C.N * 3), 3);
              for (let k = 0; k < far.count * 3; k++) far.instanceColor.array[k] = o.m.instanceColor.array[nNear * 3 + k];
              far.instanceColor.needsUpdate = true;
            }
            far.instanceMatrix.needsUpdate = true;
          }
        } else o.m.count = n;
        o.m.userData.cullS = nS; o.m.userData.preS = null;
        if (changed) { o.m.instanceMatrix.needsUpdate = true; if (o.col) o.m.instanceColor.needsUpdate = true; }
      }
      if (!fresh) break;
    }
  }
}
