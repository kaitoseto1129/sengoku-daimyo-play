import * as THREE from 'three';
import { sway, liteMat } from './world_vegetation_materials.js';
import { rng, tuftClumpAt, distToPolyline } from './world_common.js';


export class WorldGrass {

  // 川辺の葦
  buildReeds() {
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
    if (!this.nearLeft) return;
    const work = fresh ? this.nearN : Math.min(this.nearLeft, Math.ceil(this.nearN / 4));
    const start = this.nearCursor || 0;
    this.nearCursor = (start + work) % this.nearN;
    this.nearLeft -= work;
    const G = this.nearG, d = this.nearDummy || (this.nearDummy = new THREE.Object3D());
    const paths = this.def.paths;
    const NP = this.nearPos || (this.nearPos = new Float32Array(this.nearN * 2).fill(1e9));
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
      if (Math.abs(NP[i * 2] - x) < 0.01 && Math.abs(NP[i * 2 + 1] - z) < 0.01) continue;
      NP[i * 2] = x; NP[i * 2 + 1] = z;
      const gw = this.grassAt(x, z);
      const clump = tuftClumpAt(x, z);
      // 足もとの小片を均等に散らさず、遠い株と同じ群落の芯を濃く、縁を低くする。
      // 土の混じる草地にも低い下葉を残す。草の混合率を閾値で切り捨てない。
      let show = gw > 0.12 && ((i * 7919) % 100) / 100 < gw * (clumpBase + clump * clumpGain);
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
      if (show && this.def.wetFieldRuts === 'wear' && this.wearData) {
        const trod = this.wearAt(x, z);
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
