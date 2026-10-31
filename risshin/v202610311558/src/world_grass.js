import * as THREE from 'three';
import { sway, liteMat } from './world_vegetation_materials.js';
import { rng, tuftClumpAt, distToPolyline } from './world_common.js';

// 細い葉の株の上に、垂れる穂を載せた共通の形（芒・葦・稲）。高さ1ほど・葉の広がり半径0.5ほど。絵を使わず頂点の色だけ。
// 葉は根元が暗く先ほど枯れ色、穂は茎の先から外へ開いて垂れる細い房（芒は銀茶、葦は紫がかった焦げ茶、稲は黄金で深く垂れる）。
// 形と材質は全戦で一つずつ共有する（戦の後始末で消さない）。lo＝携帯の作り（葉と穂を減らす）。
const PLUME = {};
const PLUME_KIND = {
  susuki: { leaves: 11, plumes: 6, lh: .62, ph: 1, lean: .32, leafC: [.3, .32, .19], tipC: [.6, .55, .38], plC: [.52, .46, .38], plT: [.74, .68, .56], strands: 4, droop: .32, plLen: .3, spread: .7 },
  ashi: { leaves: 8, plumes: 5, lh: .5, ph: 1, lean: .12, leafC: [.27, .31, .16], tipC: [.56, .52, .33], plC: [.33, .26, .22], plT: [.5, .43, .36], strands: 3, droop: .5, plLen: .24, spread: .45, stemLeaves: true },
  ine: { leaves: 9, plumes: 5, lh: .74, ph: .9, lean: .2, leafC: [.32, .37, .17], tipC: [.64, .57, .28], plC: [.64, .53, .26], plT: [.78, .66, .34], strands: 2, droop: 1.1, plLen: .2, spread: .35 },
};
export function plumeTuftGeo(kind = 'susuki', lo = false) {
  const key = kind + (lo ? '_lo' : '');
  if (PLUME[key]) return PLUME[key];
  const K = PLUME_KIND[kind] || PLUME_KIND.susuki;
  const pos = [], col = [], nor = [];
  let seed = 7919 + kind.length * 131;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // 細い帯：at(t) が [x, y, z]、横の向き (sx, sz)、幅 w(t)。根元から先へ二つか三つの節。
  const strip = (at, sx, sz, w, c0, c1, segs, ox, oz) => {
    let L0 = null, R0 = null, t0 = 0;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, p = at(t), ww = w * (1 - t * .9);
      const L = [p[0] - sx * ww, p[1], p[2] - sz * ww], Rr = [p[0] + sx * ww, p[1], p[2] + sz * ww];
      if (L0) for (const [v, tt] of [[L0, t0], [R0, t0], [Rr, t], [L0, t0], [Rr, t], [L, t]]) {
        pos.push(...v);
        const c = mix(c0, c1, Math.pow(tt, .8)), k = .55 + .45 * tt;
        col.push(c[0] * k * 1.25, c[1] * k * 1.25, c[2] * k * 1.25);
        const up = .4 + .6 * tt, nx = ox * (1 - up), nz = oz * (1 - up), l = Math.hypot(nx, up, nz);
        nor.push(nx / l, up / l, nz / l);
      }
      L0 = L; R0 = Rr; t0 = t;
    }
  };
  const nLeaves = lo ? Math.ceil(K.leaves * .5) : K.leaves, nPlumes = lo ? Math.ceil(K.plumes * .5) : K.plumes;
  const stems = [];
  for (let i = 0; i < nPlumes; i++) {
    const a = i * 2.39996 + R() * .5, r0 = .02 + R() * .05;
    const h = K.ph * (.82 + R() * .26), lx = Math.cos(a) * K.lean * (.4 + R() * .6), lz = Math.sin(a) * K.lean * (.4 + R() * .6);
    stems.push({ a, bx: Math.cos(a) * r0, bz: Math.sin(a) * r0, h, lx, lz });
  }
  // 葉：弓なりに開いて先が垂れる（葦は茎の途中から出る）。
  for (let i = 0; i < nLeaves; i++) {
    const a = i * 2.39996 + Math.sin(i * 7.1) * .4, ca = Math.cos(a), sa = Math.sin(a);
    const st = K.stemLeaves ? stems[i % stems.length] : null;
    const y0 = st ? st.h * (.18 + R() * .42) : 0, bx = st ? st.bx + st.lx * (y0 / st.h) : Math.cos(a + 1.3) * .03, bz = st ? st.bz + st.lz * (y0 / st.h) : Math.sin(a + 1.3) * .03;
    const len = K.lh * (.75 + R() * .45), out = len * (.45 + R() * .35), w = .014 + R() * .008;
    const c1 = R() < .35 ? K.tipC : mix(K.leafC, K.tipC, .55);
    strip((t) => [bx + ca * out * t, y0 + len * (t * 1.15 - t * t * t * .55), bz + sa * out * t], -sa, ca, w, K.leafC, c1, lo ? 2 : 3, ca, sa);
  }
  // 茎と穂
  for (const st of stems) {
    const top = [st.bx + st.lx, st.h, st.bz + st.lz];
    const sxs = -Math.sin(st.a), szs = Math.cos(st.a);
    strip((t) => [st.bx + st.lx * t, st.h * t, st.bz + st.lz * t], sxs, szs, .007, K.leafC, mix(K.leafC, K.plC, .6), 1, Math.cos(st.a), Math.sin(st.a));
    const ns = lo ? Math.min(2, K.strands) : K.strands;
    for (let j = 0; j < ns; j++) {
      const b = st.a + (j - (ns - 1) / 2) * K.spread / Math.max(1, ns - 1) * 2 + (R() - .5) * .3;
      const db = Math.cos(b), eb = Math.sin(b), L = K.plLen * (.8 + R() * .4), start = .1 + j * .05;
      const y0 = top[1] - L * start;
      strip((t) => [top[0] + db * L * .45 * t, y0 + L * (.55 * t - K.droop * t * t), top[2] + eb * L * .45 * t], -eb, db, .016 + R() * .006, K.plC, K.plT, 2, db, eb);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.dispose = () => {};
  return (PLUME[key] = g);
}
// 穂の株の材質：頂点の色・風のそよぎ・カメラのすぐ前の株は縮める。裏の面も上向きの法線で照らす（黒い塊にしない）。
let PLUME_MAT = null;
export function plumeTuftMat() {
  if (PLUME_MAT) return PLUME_MAT;
  PLUME_MAT = sway(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), .08, 0, { after: (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      transformed *= smoothstep(2.0, 4.5, distance(cameraPosition.xz, (modelMatrix * instanceMatrix[3]).xz));
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      #ifdef DOUBLE_SIDED
      normal *= faceDirection;
      #endif`);
  } });
  PLUME_MAT.dispose = () => {};
  return PLUME_MAT;
}

export class WorldGrass {

  // 川辺の葦
  buildReeds() {
    return;   // 10/24：草むら（葦）は作らない（全戦）
    const w = this.def.water;
    const geo = new THREE.ConeGeometry(0.05, 1.6, 3); geo.translate(0, 0.8, 0);
    const N = 700;
    const mesh = new THREE.InstancedMesh(geo, sway(liteMat({ color: 0x8a8a52, roughness: 0.9 }), 0.08, 0.3), N);
    const d = new THREE.Object3D();
    const R = rng(55);
    for (let i = 0; i < N; i++) {
      // こちら岸と向こう岸の両方
      const far = w.x2 && i % 3 === 0;
      const x = far ? w.x2 + 1 + R() * 6 : w.x - 1 - R() * 7, z = (R() * 2 - 1) * 175;
      d.position.set(x, this.heightAt(x, z) - 0.1, z);
      d.rotation.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3);
      d.scale.setScalar(0.7 + R() * 0.8);
      d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
    }
    this.scene.add(mesh);
  }


  // 足もとの草を、自分を中心に敷き直す（格子ごとに一つの位置を持ち、端を越えたら反対側へ回す）
  updateNearGrass(focus, fresh = false) {
    if (!this.nearGrass) return;
    const cx = Math.round(focus.x / 1.5), cz = Math.round(focus.z / 1.5);
    // 最初と視点交換は全株を用意する。歩行中の4200株の走査は四コマへ配り、
    // 足もとの株を残したまま外周だけ巻き戻す。動き続けても続きから進める。
    if (!this.nearCell) { this.nearCell = [cx, cz]; fresh = true; }
    if (fresh || this.nearCell[0] !== cx || this.nearCell[1] !== cz) {
      this.nearCell[0] = cx; this.nearCell[1] = cz; this.nearLeft = this.nearN;
    }
    // 視点が止まった乱戦でも踏まれた株を伏せる。地面の転送と同じ半秒刻みで、四コマへ配る。
    const trackWear = this.def.wetFieldRuts === 'wear' && this.wearData;
    if (trackWear && this.nearWearRevision !== this.wearRevision) {
      this.nearWearRevision = this.wearRevision; this.nearLeft = this.nearN;
    }
    if (!this.nearLeft) return;
    const work = fresh ? this.nearN : Math.min(this.nearLeft, Math.ceil(this.nearN / 4));
    const start = this.nearCursor || 0;
    this.nearCursor = (start + work) % this.nearN;
    this.nearLeft -= work;
    const G = this.nearG, d = this.nearDummy || (this.nearDummy = new THREE.Object3D());
    const paths = this.def.paths;
    const NP = this.nearPos || (this.nearPos = new Float32Array(this.nearN * 2).fill(1e9));
    const NW = trackWear ? this.nearWear || (this.nearWear = new Float32Array(this.nearN).fill(-1)) : null;
    const span = G * 2, x0 = focus.x - G, z0 = focus.z - G;
    const clumpBase = this.def.nearGrassClumpBase ?? 0.1;
    const clumpGain = this.def.nearGrassClumpGain ?? 1.5;
    let changed = false;
    for (let q = 0; q < work; q++) {
      const i = (start + q) % this.nearN;
      const [ox, oz, sc, rot] = this.nearOff[i];
      // 自分の周りの正方形に、ずれないよう巻き戻して置く
      const x = x0 + (((ox - x0) % span + span) % span), z = z0 + (((oz - z0) % span + span) % span);
      // 置き場の変わらない株は置き直さない（端を越えて反対側へ回った株だけ）
      const trod = trackWear ? this.wearAt(x, z) : 0;
      if (Math.abs(NP[i * 2] - x) < 0.01 && Math.abs(NP[i * 2 + 1] - z) < 0.01 &&
          (!NW || Math.abs(NW[i] - trod) < .03)) continue;
      if (NW) NW[i] = trod;
      NP[i * 2] = x; NP[i * 2 + 1] = z;
      const gw = this.grassAt(x, z);
      const clump = tuftClumpAt(x, z);
      // 足もとの小片を均等に散らさず、遠い株と同じ群落の芯を濃く、縁を低くする。
      // 土の混じる草地にも低い下葉を残す。草の混合率を閾値で切り捨てない。
      let show = gw > (this.def.nearGrassMinCover ?? 0.12) && ((i * 7919) % 100) / 100 < gw * (clumpBase + clump * clumpGain);
      let verge = 1;
      if (show && paths) for (const p of paths) {
        const clearance = distToPolyline(x, z, p) - (p.w ?? this.def.pathWidth ?? 2) * 0.5;
        verge = Math.min(verge, Math.max(0, Math.min(1, (clearance - 0.15) / 1.25)));
        if (verge === 0) { show = false; break; }
      }
      // 道幅に沿って下葉から低くなり、裸地へ溶け込む。道の中央には生やさない。
      if (show && ((i * 3571) % 100) / 100 > 0.25 + verge * 0.75) show = false;
      if (show && this.def.water && x > this.def.water.x - 2 && x < (this.def.water.x2 ?? 1e9) + 2) show = false;
      d.position.set(x, show ? this.heightAt(x, z) - 0.04 : -999, z);
      d.rotation.set(((i * 7) % 11 - 5) * 0.025, rot, ((i * 3) % 7 - 3) * 0.03);
      const size = sc * (0.65 + clump * 0.7);
      d.scale.set(size * (0.75 + (i % 7) * 0.07), size * (0.65 + (i % 5) * 0.16) * (0.35 + verge * 0.65) * (0.55 + gw * 0.45), size * (0.85 + (i % 3) * 0.1));
      if (show && this.def.tuftHeight) d.scale.y *= this.def.tuftHeight(x, z);
      // 通った帯の草は株を消すだけにせず、泥へ伏せて幅を残す。同じ踏み跡の絵を使う。
      if (show && trackWear) {
        d.scale.y *= 1 - trod * .78;
        d.scale.x *= 1 + trod * .55;
        d.rotation.x += trod * .65;
      }
      if (show && this.nearBaseC) {
        const color = this.nearSoilColor || (this.nearSoilColor = new THREE.Color());
        color.fromArray(this.nearBaseC, i * 3);
        this.def.tuftColor(x, z, color); color.toArray(this.nearC, i * 3);
      }
      d.updateMatrix();
      d.matrix.toArray(this.nearM, i * 16); this.nearShow[i] = show ? 1 : 0; changed = true;
    }
    if (changed) this.nearDirty = true;
  }

  // 足もとの草は、出ている株と画面の向きに入る株だけを前へ詰めて描く（隠した株・背中側の株も数えていた）。
  //   置き直した時と、カメラの向きが変わった時だけ詰め直す（株の場所・色・数は変えない）
  packNearGrass(cam) {
    const g = this.nearGrass;
    if (!g || !this.nearM || !cam) return;
    const e = cam.matrixWorld.elements, px = e[12], pz = e[14];
    let fx = -e[8], fz = -e[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const P = this.nearPack || (this.nearPack = { x: 1e9, z: 0, fx: 0, fz: 0 });
    if (!this.nearDirty && Math.hypot(px - P.x, pz - P.z) < 1 && fx * P.fx + fz * P.fz > 0.985) return;
    this.nearDirty = false; P.x = px; P.z = pz; P.fx = fx; P.fz = fz;
    // 横の画角の半分＋余裕（20 度ほど）より外の株は詰めない。カメラのすぐ回り（3m）は向きによらず残す
    const half = Math.atan(Math.tan((cam.fov || 60) * Math.PI / 360) * (cam.aspect || 2)) + 0.35, cosH = Math.cos(Math.min(Math.PI, half));
    const M = this.nearM, S = this.nearShow, C = this.nearC, dm = g.instanceMatrix.array, dc = g.instanceColor ? g.instanceColor.array : null;
    let k = 0;
    for (let i = 0; i < this.nearN; i++) {
      if (!S[i]) continue;
      const dx = M[i * 16 + 12] - px, dz = M[i * 16 + 14] - pz, d = Math.hypot(dx, dz);
      if (d > 3 && (dx * fx + dz * fz) / d < cosH) continue;
      // 株ごとに一時の配列を作らず、行列の16個の値を写す。
      for (let j = 0; j < 16; j++) dm[k * 16 + j] = M[i * 16 + j];
      if (dc) { dc[k * 3] = C[i * 3]; dc[k * 3 + 1] = C[i * 3 + 1]; dc[k * 3 + 2] = C[i * 3 + 2]; }
      k++;
    }
    g.count = k; g.instanceMatrix.needsUpdate = true; if (dc) g.instanceColor.needsUpdate = true;
  }
}
