import { ARMY_P, _lodV, ARMY_REAL_R, ARMY_REAL_P, armyPartMask, armyTrimGeo, instTwin, ARMY_SPLIT_R, CLASH_ROW } from './world_army_shader.js';
import * as THREE from 'three';


export class WorldLod {
  lodTick(dt, fresh = false) {
    const list = this.lodList, total = list ? list.length : 0;
    if (!total) return;
    const cx = ARMY_P.value.x, cz = ARMY_P.value.y;
    if (cx > 9e4) return;
    // 四分の一秒ごとの全隊の更新を、同じ周期のまま各コマへ配る。
    // 端数を持ち越して少ない隊も更新する。視点交換と最初の一枚は全隊をそろえる。
    this.lodBudget = fresh ? total : Math.min(total, (this.lodBudget || 0) + Math.max(0, dt) * total / 0.25);
    const work = Math.floor(this.lodBudget + 1e-9);
    this.lodBudget = Math.max(0, this.lodBudget - work);
    if (!work) return;
    if (this.armyView) this.armyView.active = !!this.detailCam?.isPerspectiveCamera;
    if ((this.def.armyViewCull ?? true) && this.detailCam?.isPerspectiveCamera) {
      const cam = this.detailCam;
      const V = this.armyView || (this.armyView = { frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), sphere: new THREE.Sphere(), direction: new THREE.Vector3(), position: new THREE.Vector3(), projection: 0 });
      V.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      V.frustum.setFromProjectionMatrix(V.matrix);
      V.active = true;
      // 向きを大きく変えた時は全隊を詰め直す。少しずつ回した時も累積した角度で判定する。
      if (fresh) { cam.getWorldDirection(V.direction); cam.getWorldPosition(V.position); V.projection = cam.projectionMatrix.elements[0]; }
    }
    // 高い山城で指定した時だけ、高低差も遠い兵の細部の判定に含める。
    // 足元の道の高さは一度だけ読み、前線の人数と隊の動きは変えない。
    const cy = this.def.armyHeightLOD ? this.heightAt(cx, cz) + 1.6 : 0;
    for (let i = 0; i < work; i++) {
      const at = (this.lodCursor || 0) % total, m = list[at];
      this.lodCursor = (at + 1) % total;
      const L = m.userData.lod;
      if (!m.parent || (!m.count && !L.allHidden)) continue;
      if (m.count && (L.n !== m.count || !m.boundingSphere)) { m.computeBoundingSphere(); L.n = m.count; }
      if (!m.boundingSphere) continue;
      m.updateWorldMatrix(true, false);
      _lodV.copy(m.boundingSphere.center).applyMatrix4(m.matrixWorld);
      // 隊が丸ごと本物の兵に替わる輪（本人から 44m）の内にある時は、シェーダーで全員が消えるので描かない（描く回数と三角を数えない）
      const AU = m.material && m.material.userData && m.material.userData.armyU;
      const RR = AU ? (AU.uRealNear || ARMY_REAL_R).value : 0;
      const farArmy = this.detailCam?.isPerspectiveCamera && !this.def.town && !this.def.dojo &&
        Math.hypot(_lodV.x - cx, _lodV.z - cz) - m.boundingSphere.radius - 16 > 80;
      // 遠い大軍は描かない。隊の動きと近い兵への置き換えはそのまま進める。
      L.allHidden = farArmy || RR > 0 && Math.hypot(_lodV.x - ARMY_REAL_P.value.x, _lodV.z - ARMY_REAL_P.value.y) + m.boundingSphere.radius + 10 < RR;
      //   毎コマ数を決め直す描き方（onBeforeRender のある物）だけ。数を置き場の番号に使う物（倒れた兵の束）には触らない
      //   輪の内の兵を写しから外した時（lodCompact）も、元の束は描かない。数は描いた後に戻す（数を置き場の番号に使う物もあるので）
      if (m.onBeforeRender !== L.obr) {
        const f = m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender ? null : m.onBeforeRender;
        L.keepN = -1;
        // 毎コマ、隊ごとの引数配列を作らずに元の描画処理へ渡す。
        L.obr = function (renderer, scene, camera, geometry, material, group) { if (f) f.call(this, renderer, scene, camera, geometry, material, group); if (L.allHidden || L.cmpOn || L.splitPacked) { L.keepN = this.count; this.count = 0; } };
        m.onBeforeRender = L.obr;
        m.onAfterRender = function () { if (L.keepN >= 0) { this.count = L.keepN; L.keepN = -1; } };
      }
      // 隊のいちばん近い端で測る。低でも近い兵は立体の形を保つ。
      const q = 1;
      const mid = false;   // 中は高より近くから軽い形へ（画質の差を本当に付ける）
      // 隊の長さの全部を「いちばん近い端」で測ると、長い隊が丸ごと細かい形になる（姉川）。中心から半径の半分手前で測る
      const dx = _lodV.x - cx, dz = _lodV.z - cz, dy = this.def.armyHeightLOD ? _lodV.y - cy : 0;
      const dc = Math.sqrt(dx * dx + dz * dz + dy * dy), d = Math.max(0, dc - m.boundingSphere.radius * (q > 1 || mid ? 0.35 : 0.5)), h2 = L.lv >= 2 ? 5 : 0;
      //   3：塊のいちばん近い端が 100m より先は、さらに遠い形
      // 携帯では十八メートルより先の隊を、顔・袖・兜・得物を残した軽い立体へ。
      // 姉川の三つの前線を、三十八メートルまで一斉に細かな形で描いていた。
      // 本物の兵に替わる 36〜44m の内は、軽い兵を描かない（シェーダーで外す）ので、細かい形はほぼ要らない
      const near = q > 1 ? (L.lv >= 1 ? 16 : 18) : mid ? (L.lv >= 1 ? 9 : 11) : (L.lv >= 1 ? 12 : 15);
      // 三方ヶ原の低画質は十八メートルから腕・袖のある形、五十六メートルから輪郭用の形。人数は保つ。
      const lowFront = q > 1 && (this.def.denseFront || this.def.lowArmyDetail);
      // 画質「高」：本人とカメラから 44m の内の軽い兵は本物の兵に替わって描かれない（ARMY_REAL_R）。見える軽い兵は 44m より先だけ（背丈十五画素より小さい）なので、
      //   いつも輪郭の形にする。本物に替わる輪を狭めた隊（設楽原の鉄砲の列など。近くに見える軽い兵）は今までどおり遠さで形を選ぶ
      let lv = !mid && q === 1 && RR >= 30 ? 3 : Math.max(q > 1 ? L.minLv : 0, d >(L.lv === 3 ? (lowFront ? 50 : mid ? 58 : 72) : (lowFront ? 56 : mid ? 64 : 78)) ? 3 : d > (lowFront ? 30 : q > 1 ? 60 : mid ? 40 : 46) - h2 ? 2 : d > near ? 1 : 0);
      // 高：本物に替わる輪が 8m より広い隊（斬り合いの塊など）は、見える軽い兵がどれも 8m より先なので、細かい形（十角）でなく五角の形（本物の兵の 8〜16m と同じ考え）
      if (!mid && q === 1 && RR >= 8 && lv === 0) lv = 1;
      // 設楽原の乱戦：隊の最も近い端が十六メートル先なら細部を省く。
      // 揺れ・押し合いの余裕も残し、近い前線の形と人数は変えない。
      if (!mid && q === 1 && this.def.highClashDetail && L.hi.attributes.aClash) {
        const edge = Math.max(0, dc - m.boundingSphere.radius - 6);
        // 隊全体が十六メートルより先なら、袖・顔の細部を省いた輪郭の形へ。
        // 塊の端から揺れの六メートルも引いて測るため、目の前の斬り合いは元の形を保つ。
        if (edge > (L.lv >= 3 ? 14 : 16)) lv = Math.max(lv, 3);
      }
      // 画質「低」：18m より先の隊の背の小旗は描かない。高は隊の近い端が 50m より先の時（背の小旗は二画素ほど）。家の色は幟と旗持ちの大旗で残る
      if (L.sashi) { L.sashiCut = q > 1 ? !lowFront && lv >= 1 : !mid && lv >= 3; if (L.sashiCut) m.layers.mask = 0; else if (!m.userData.maskByBody) m.layers.mask = 1; }
      // 本物に替わる輪を狭めた隊（近くに軽い兵が見える）は、隊ごとでなく兵ごとに遠さで形を選ぶ（lodSplit）。16m の内は細かい形のまま
      const clashSplit = L.hi.attributes.aClash && AU?.uBlk;
      const splitOn = !mid && q === 1 && RR > 0 && RR < 30 && m.isInstancedMesh && L.hi !== L.xlo &&
        (!L.hi.attributes.aClash || clashSplit) && !(AU.uRout && AU.uRout.value > 0);
      if (splitOn || L.split) this.lodSplit(m, L, splitOn, dc - m.boundingSphere.radius, cx, cz);
      if (L.splitOn) lv = 3;
      // 高：隊の真ん中から半径の半分手前が 100m ほどより先の時は、さらに軽い形（L.x4。背丈八画素ほど）
      if (lv === 3 && !L.splitOn && L.x4 && !mid && q === 1 && d > (L.lv === 4 ? 94 : 100)) lv = 4;
      const big = q > 1 && !lowFront && L.deep && m.count > 250 && L.xxlo !== L.xlo;
      const lowLite = q > 1 && !lowFront;
      if (lv !== L.lv || big !== !!L.big) { L.lv = lv; L.big = big; L.far = lv > 0; m.geometry = L.base = lv === 4 ? L.x4 : lv === 3 || big || (lowLite && lv >= 1) ? L.xxlo : lv === 2 || lowLite ? L.xlo : lv ? L.lo : L.hi; L.trimMask = -2; }
      // 高：兵の形（L.x4 のある隊）は、隊の誰も使わない部品を外した形で描く（兵ごとに遠さで選ぶ隊は外さない）
      if (L.x4 && L.base) {
        const mask = !mid && q === 1 && !L.split ? armyPartMask(m) : -1;
        if (mask !== L.trimMask) { L.trimMask = mask; m.geometry = mask < 0 ? L.base : armyTrimGeo(L.base, mask); }
      }
      // 形を選んだ後に写す（写しは今の形を使う）
      if (!mid && q === 1 && RR >= 30 && !(AU.uRout && AU.uRout.value > 0)) this.lodCompact(m, L, RR); else if (L.cmpOn || L.cmp) this.lodCompact(m, L, 0);
    }
  }

  // 画面外の遠景兵だけ送らない。足踏み・槍・旗・次の更新までの移動と首振りに余裕を持つ。
  // 影を落とす束は五十五メートルまで残す。影の無い束は、十六メートル先から画面外だけを省く。
  armyInstanceVisible(m, k, wx, wz, distance) {
    const V = this.armyView;
    if (!(this.def.armyViewCull ?? true) || !V?.active || distance < (m.castShadow ? 55 : 16)) return true;
    const A = m.instanceMatrix.array;
    const scale = m.matrixWorld.getMaxScaleOnAxis() * Math.max(
      Math.hypot(A[k], A[k + 1], A[k + 2]), Math.hypot(A[k + 4], A[k + 5], A[k + 6]), Math.hypot(A[k + 8], A[k + 9], A[k + 10]));
    V.sphere.center.set(wx, this.heightAt(wx, wz) + 2 * scale, wz);
    V.sphere.radius = 15 * Math.max(1, scale) + distance * 0.04;
    if (!V.frustum.intersectsSphere(V.sphere)) return false;
    // 小谷の山腹の向こうだけ省く。影を落とす兵と近景は残し、槍・動きの余裕も球に含める。
    const cameraMatrix = this.detailCam.matrixWorld.elements;
    return !this.def.armyTerrainCull || m.castShadow || !this.terrainHidden(cameraMatrix[12], cameraMatrix[13], cameraMatrix[14], V.sphere);
  }

  // 輪（本物の兵に替わる 44m）の内に多くの兵が入った隊：見える兵（輪の外の兵）だけを写した束で描き、元の束は描かない。
  //   輪の内の兵はシェーダーが消すのに、三角と頂点の計算は全員の分かかっていた。消える・見えるの判定はシェーダーのまま（写しは余裕を持って多めに）
  lodCompact(m, L, RR) {
    const on = RR >= 30 && m.isInstancedMesh && !L.allHidden && m.count >= 48 && !L.splitOn && !L.sashi && !m.userData.maskByBody;
    if (!on) {
      if (L.cmp) { L.cmp.count = 0; L.cmp.visible = false; }
      if (L.cmpFar) { L.cmpFar.count = 0; L.cmpFar.visible = false; }
      L.cmpOn = false; return;
    }
    const A = m.instanceMatrix.array, e = m.matrixWorld.elements, cx = ARMY_P.value.x, cz = ARMY_P.value.y, rx = ARMY_REAL_P.value.x, rz = ARMY_REAL_P.value.y;
    const clash = !!m.geometry.attributes.aClash, r = RR - (clash ? 16 : 6);
    // 描く式が視点の近くで消す兵と、四十八メートル内の後詰めも送らない。
    // 本人の置換範囲とは分け、足踏みと更新待ちの余裕は残す。
    const cameraR = Math.max(0, r, (m.material.userData?.armyU?.uNear?.value ?? 0) - 7);
    const hosts = m.geometry.attributes.aHost?.array;
    const hostR2 = Math.max(cameraR, 41) ** 2;
    // 長い隊も兵ごとに遠さを測る。乱戦の押し引きは専用の距離切替に任せる。
    const farNear = !clash && L.x4 && L.lv !== 4 ? this.def.armyFarDetail ?? Infinity : Infinity;
    const heightLOD = !!this.def.armyHeightLOD;
    const cy = heightLOD ? (this.detailCam?.matrixWorld.elements[13] ?? this.heightAt(cx, cz) + 1.6) : 0;
    const r2 = r * r, cameraR2 = cameraR * cameraR, far2 = (farNear + 7) * (farNear + 7);
    let keep = 0, distant = 0;
    const W = L.cmpIdx || (L.cmpIdx = new Int32Array(m.instanceMatrix.count));
    for (let i = 0, k = 0; i < m.count; i++, k += 16) {
      const x = A[k + 12], y = A[k + 13], z = A[k + 14];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const dx = wx - cx, dz = wz - cz, rdx = wx - rx, rdz = wz - rz;
      const d2 = dx * dx + dz * dz, realD2 = rdx * rdx + rdz * rdz;
      if (d2 < (hosts?.[i] > 0 ? hostR2 : cameraR2) || realD2 < r2) continue;
      if (!clash && !this.armyInstanceVisible(m, k, wx, wz, Math.sqrt(d2))) continue;
      // 足踏みと更新間隔に七メートルの余裕。近景と遠景へ重ねて送らない。
      // 本物への置換は水平距離のまま。上の曲輪の細部だけ、視点との高低差も含める。
      const dy = heightLOD ? e[1] * x + e[5] * y + e[9] * z + e[13] - cy : 0;
      if (d2 + dy * dy > far2 && realD2 > far2) W[W.length - 1 - distant++] = i;
      else W[keep++] = i;
    }
    // 消える兵も遠い形へ移す兵も少ない時は、元の束をそのまま描く。
    if (!distant && keep > m.count * 0.88) {
      if (L.cmp) { L.cmp.count = 0; L.cmp.visible = false; }
      if (L.cmpFar) { L.cmpFar.count = 0; L.cmpFar.visible = false; }
      L.cmpOn = false; return;
    }
    if (!L.cmp) L.cmp = instTwin(m, m.geometry, null);
    if (L.cmpGeo !== m.geometry) {
      // 遠近の境で束と兵の配列を捨てず、共有する形の頂点だけ替える。
      const g = L.cmp.geometry;
      for (const key in m.geometry.attributes) {
        if (key !== 'aSplit' && !L.cmp.userData.keys.includes(key)) g.setAttribute(key, m.geometry.attributes[key]);
      }
      g.setIndex(m.geometry.index); g.boundingSphere = m.geometry.boundingSphere;
      g.groups = m.geometry.groups;
      L.cmpGeo = m.geometry;
    }
    if (distant && !L.cmpFar) L.cmpFar = instTwin(m, L.x4, null);
    const src = m.geometry.attributes, C = m.instanceColor ? m.instanceColor.array : null;
    L.cmpOn = true;
    for (let pass = 0; pass < 2; pass++) {
      const t = pass ? L.cmpFar : L.cmp, count = pass ? distant : keep;
      if (!t) continue;
      t.material = m.material; t.layers.mask = m.layers.mask;
      t.count = count; t.visible = count > 0;
      for (let j = 0; j < count; j++) {
        const i = W[pass ? W.length - 1 - j : j], target = t.instanceMatrix.array;
        for (let k = 0; k < 16; k++) target[j * 16 + k] = A[i * 16 + k];
        if (C) for (let k = 0; k < 3; k++) t.instanceColor.array[j * 3 + k] = C[i * 3 + k];
        for (const k of t.userData.keys) {
          const s = src[k], d = t.geometry.attributes[k]; if (!s) continue;
          const size = s.itemSize;
          for (let a = 0; a < size; a++) d.array[j * size + a] = s.array[i * size + a];
        }
      }
      if (count) {
        // 写した兵の誰も使わない兜・得物だけ外し、人数と姿を保つ。
        t.geometry.setIndex(armyTrimGeo(pass ? L.x4 : m.geometry, armyPartMask(t)).index);
        t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true;
        for (const k of t.userData.keys) t.geometry.attributes[k].needsUpdate = true;
        t.computeBoundingSphere();
      }
    }
  }

  // 兵ごとに形を選ぶ：近い兵（16m の内）は細かい形の写し、16〜44m は中ほどの形の写し、その先は元の束を遠い形で描く。
  //   どの兵をどれで描くかはシェーダーが一人ずつの距離で決める（aSplit）。写しには近くに居そうな兵の入れ物だけを写す
  lodSplit(m, L, on, edge, cx, cz) {
    const single = !!this.def.singleSoldierLOD;
    if (!L.split) {
      const n = m.instanceMatrix.count;
      L.splitA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      for (const g of new Set([L.hi, L.lo, L.xlo, L.xxlo])) g.setAttribute('aSplit', L.splitA);
      // 一人を一つの距離段階へ送る戦は、頂点側で遠近の写しを消し分けない。
      const twin = (geo, sign) => instTwin(m, geo, single ? 0 : sign);
      // 中ほどと遠いが同じ形（馬・旗）は、16m より先を元の束で描く
      L.clashSplit = !!L.hi.attributes.aClash;
      // 乱戦の近い形は従来と同じ五角。指定した戦だけ、中ほどに腕のある形を挟む。
      L.split = L.clashSplit && !(this.def.clashMiddleDetail > 16) ? [twin(L.lo, -1)] : L.xlo === L.xxlo ? [twin(L.hi, -1)] : [twin(L.hi, -1), twin(L.xlo, -2)];
      // 設楽原は遠い束も写す。近い形へ写した兵・討たれて消えた兵を遠い束で重ねて処理しない。
      L.splitFar = twin(L.xxlo, L.split.length > 1 ? 1 : 2);
      // 長い前線は、一人が近いだけで後列全員を細かな形へ戻さない。
      // 指定した距離より先は別の写しへ送り、同じ形の他隊とは軍勢の束で合わせる。
      if (this.def.highClashDetail && L.x4) L.splitDistant = twin(L.x4, L.split.length > 1 ? 1 : 2);
    }
    if (on !== !!L.splitOn) { L.splitOn = on; L.splitA.array.fill(on ? (L.split.length > 1 ? 1 : 2) : 0); L.splitA.needsUpdate = true; }
    const R = (m.material.userData.armyU?.uSplitR || ARMY_SPLIT_R).value;
    // 一人一束の戦だけ、長い鉄砲列の遠い細部を早めに軽い形へ。
    // 押し引きの位置を反映する戦だけ、足踏み用の余裕を指定できる。
    // 少人数の付き添いだけ近景を長く保てる。指定のない軍勢は戦ごとの上限を守る。
    const near = single ? Math.min(R.x, m.userData.soldierDetailNear ?? this.def.soldierDetailNear ?? R.x) : R.x;
    const middle = single ? Math.max(near, Math.min(R.y, this.def.soldierDetailMiddle ?? R.y)) : R.y;
    const margin = single ? Math.max(3, this.def.soldierDetailMargin ?? 7) : 7;
    const M0 = near + margin, M1 = middle + margin + 2;
    const [t0, t1] = L.split, two = !!t1;
    // 本物の兵へ替わって描かれない内側は、近い形の写しにも送らない。
    // 押し合いの位置は下で反映し、残る足踏みと更新間隔には七メートルの余裕を取る。
    const hiddenR = Math.max(0, (m.material.userData.armyU?.uRealNear || ARMY_REAL_R).value - 7);
    const cameraHiddenR = Math.max(hiddenR, (m.material.userData.armyU?.uNear?.value ?? 0) - 7);
    const hosts = L.hi.attributes.aHost?.array;
    const hostHidden2 = Math.max(cameraHiddenR, 41) ** 2;
    for (const t of L.split) { t.material = m.material; t.layers.mask = m.layers.mask; }
    const far = L.splitFar;
    const distant = L.splitDistant;
    L.splitPacked = !!(far && on);
    if (far) { far.material = m.material; far.layers.mask = m.layers.mask; far.count = 0; far.visible = false; }
    if (distant) { distant.material = m.material; distant.layers.mask = m.layers.mask; distant.count = 0; distant.visible = false; }
    if (!on || (!far && !L.clashSplit && edge > (two ? M1 : M0)) || !m.count || L.allHidden) { for (const t of L.split) { t.count = 0; t.visible = false; } return; }
    const distantNear = Math.max(M0, this.def.highClashFarDetail ?? 51);
    // 一人一束の戦だけ立体距離で形を選ぶ。置換と画面外の判定は元の水平距離を保つ。
    const heightLOD = single && !!this.def.armyHeightLOD;
    const cy = heightLOD ? (this.detailCam?.matrixWorld.elements[13] ?? this.heightAt(cx, cz) + 1.6) : 0;
    const A = m.instanceMatrix.array, e = m.matrixWorld.elements;
    const rx = ARMY_REAL_P.value.x, rz = ARMY_REAL_P.value.y;
    // 比較は二乗のまま行い、兵ごとの立体距離の計算を一度にまとめる。
    const hidden2 = hiddenR * hiddenR, cameraHidden2 = cameraHiddenR * cameraHiddenR, M02 = M0 * M0, M12 = M1 * M1;
    const nearStart = Math.max(0, R.x - 7), farStart = Math.max(0, two ? R.y - 9 : R.x - 7);
    const far2 = single ? (two ? M12 : M02) : farStart * farStart;
    const distant2 = distantNear * distantNear;
    let n0 = 0, n1 = 0, nf = 0, nd = 0, farDistance2 = Infinity, routing = false;
    for (let i = 0, k = 0; i < m.count; i++, k += 16) {
      let x = A[k + 12], y = A[k + 13], z = A[k + 14];
      let routeError = 0, routed = false;
      if (L.clashSplit) {
        // 斬り合いの押し引きと、倒れた列の前詰めは描く式と同じ位置で判定する。
        // 槍の振りと足踏みの七メートルの余裕は従来どおり残す。
        const C = L.hi.attributes.aClash.array, info = L.hi.attributes.aInfo.array, U = m.material.userData.armyU;
        if (C[i * 4 + 3] < 0.5) {
          const block = U.uBlk.value[Math.round(C[i * 4])], more = U.uBlk2.value[Math.round(C[i * 4])];
          // cInit と同じ消滅条件。倒れた姿は専用の束が描く。
          if (more.w > 0.5 || C[i * 4 + 1] + 0.5 <= block.z) continue;
          // 敗走する兵は描く式で遠くまで走るため、元の位置では省かない。
          // 近景と遠景の両方へ渡し、実際の位置で描く式が片方だけを選ぶ。
          // 一部の塊の敗走で、戦い続ける全隊の細部選びまで止めない。
          if (block.w > 0 && !(single && this.def.routedSoldierLOD)) {
            routing = true;
            this.lodPut(m, t0, n0++, i);
            if (!single && two) this.lodPut(m, t1, n1++, i);
            if (!single && far) { this.lodPut(m, far, nf++, i); farDistance2 = 0; }
            continue;
          }
          const row = C[i * 4 + 2], kc = block.z / Math.max(1, more.z), fr = Math.floor(kc), sd = info[i * 4];
          const mix = block.y * (1 - THREE.MathUtils.smoothstep(row, fr + 1.5, fr + 2.6));
          const disorder = more.x * (1 - THREE.MathUtils.smoothstep(row, fr + 2, fr + 5));
          let ox = mix * 1.1 * ((sd * 3.77 % 1) - 0.5) * 2 + disorder * ((sd * 19.73 % 1) - 0.5) * 0.62;
          let oz = U.uSide.value * block.x + (row <= fr + 0.5 ? fr : kc) * CLASH_ROW + U.uApp.value + mix * (0.8 + 2.2 * (sd * 7.31 % 1))
            + disorder * (Math.min(0.55, Math.max(0, row - fr) * 0.22) + ((sd * 31.17 % 1) - 0.5) * 0.74);
          if (block.w > 0) {
            // 敗走先の距離で細部だけ選ぶ。足踏み・見回しを含む誤差の輪を
            // 手前へ引き、輪の一部でも近景に入る兵は細かな形を残す。
            routed = routing = true;
            const s2 = L.hi.attributes.aInfo2.array[i * 2 + 1];
            const rt = Math.max(0, block.w - sd * 1.6);
            if (rt < 0.001) { this.lodPut(m, t0, n0++, i); continue; }
            const travel = (s2 <= 0.1 ? Math.min(rt, 1.2 + s2 * 50) : rt) * (3 + sd * 2.2) * (info[i * 4 + 1] === 5 ? 2 : 1);
            const yaw = (U.uTurn?.value ?? 0) * 3.14159 + 3.14159 + (s2 - 0.5) * 1.7;
            ox += Math.sin(yaw) * travel; oz += Math.cos(yaw) * travel;
            // 走行中の見回し角は最大約0.22。回転・拡大後も誤差を覆う。
            const scale = Math.hypot(
              e[0] * A[k] + e[4] * A[k + 1] + e[8] * A[k + 2],
              e[2] * A[k] + e[6] * A[k + 1] + e[10] * A[k + 2],
              e[0] * A[k + 8] + e[4] * A[k + 9] + e[8] * A[k + 10],
              e[2] * A[k + 8] + e[6] * A[k + 9] + e[10] * A[k + 10]);
            routeError = (travel * 0.3 + 3) * scale;
          }
          x += A[k] * ox + A[k + 8] * oz;
          y += A[k + 1] * ox + A[k + 9] * oz;
          z += A[k + 2] * ox + A[k + 10] * oz;
        }
      }
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const dx = wx - cx, dz = wz - cz, rdx = wx - rx, rdz = wz - rz;
      const horizontal2 = dx * dx + dz * dz;
      if (!routed && (horizontal2 < (hosts?.[i] > 0 ? hostHidden2 : cameraHidden2) || rdx * rdx + rdz * rdz < hidden2)) continue;
      if (!routed && !this.armyInstanceVisible(m, k, wx, wz, Math.sqrt(horizontal2))) continue;
      const dy = heightLOD ? e[1] * x + e[5] * y + e[9] * z + e[13] - cy : 0;
      // 敗走先の足場の高さは頂点側が読むため、遠近の選択には安全な水平距離だけ使う。
      const d2 = routed ? Math.max(0, Math.sqrt(horizontal2) - routeError) ** 2 : horizontal2 + dy * dy;
      // 重なる帯でも一人一束。境は従来の細かい側の外端に置き、
      // 足踏み・押し合い・更新間隔の余裕を保ったまま、消える写しだけを省く。
      if (d2 < M02) this.lodPut(m, t0, n0++, i);
      if (two && (single ? d2 >= M02 : d2 > nearStart * nearStart) && d2 < M12) this.lodPut(m, t1, n1++, i);
      if (far && d2 >= far2) {
        if (distant && d2 > distant2) this.lodPut(m, distant, nd++, i);
        else { this.lodPut(m, far, nf++, i); farDistance2 = Math.min(farDistance2, d2); }
      }
    }
    // 遠い写しの全員が四十四メートルの外なら、輪郭を残す軽い立体へ。
    // 足踏みと更新間隔の七メートルを残す。形だけを共有し、人数と描く回数を保つ。
    L.splitFarLight = !!(nf && L.x4 && farDistance2 > (L.splitFarLight ? 2025 : 2601));
    for (let j = 0; j < L.split.length + (far ? 1 : 0) + (distant ? 1 : 0); j++) {
      const t = j < L.split.length ? L.split[j] : j === L.split.length ? far : distant;
      const c = t === t0 ? n0 : t === t1 ? n1 : t === distant ? nd : nf;
      t.count = c; t.visible = c > 0;
      // 敗走の移動は頂点側で加わるため、元の位置の囲みで写しを消さない。
      t.frustumCulled = routing ? false : m.frustumCulled;
      if (!c) continue;
      if (far) {
        const base = t === distant ? L.x4 : t === far ? (L.splitFarLight ? L.x4 : L.xxlo) : t === t0 ? (L.clashSplit ? L.lo : L.hi) : L.xlo;
        if (t === far) {
          for (const key in base.attributes) if (!base.attributes[key].isInstancedBufferAttribute) t.geometry.setAttribute(key, base.attributes[key]);
          t.geometry.boundingSphere = base.boundingSphere;
        }
        // 近景・遠景それぞれに実際に写した兵だけで、不要な笠・兜・得物を選ぶ。
        t.geometry.setIndex(armyTrimGeo(base, armyPartMask(t)).index);
      }
      t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true;
      for (const k of t.userData.keys) t.geometry.attributes[k].needsUpdate = true;
      t.matrix.identity(); t.matrixWorldNeedsUpdate = true;
      // 隊列の所属・位置・形が同じなら、全員の囲みを作り直さない。
      if (t.userData.lodMatrixChanged || t.userData.lodBoundCount !== c || t.userData.lodBoundIndex !== t.geometry.index || t.userData.lodBoundSphere !== t.geometry.boundingSphere) {
        t.computeBoundingSphere();
        t.userData.lodBoundCount = c; t.userData.lodBoundIndex = t.geometry.index;
        t.userData.lodBoundSphere = t.geometry.boundingSphere;
      }
      t.userData.lodMatrixChanged = false;
    }
  }

  // 写す処理を共有し、隊の見回りごとに関数を作らない。
  lodPut(m, t, j, i) {
    const A = m.instanceMatrix.array, target = t.instanceMatrix.array;
    for (let k = 0; k < 16; k++) {
      const v = A[i * 16 + k], at = j * 16 + k;
      if (target[at] !== v) { target[at] = v; t.userData.lodMatrixChanged = true; }
    }
    const C = m.instanceColor?.array;
    if (C) for (let k = 0; k < 3; k++) t.instanceColor.array[j * 3 + k] = C[i * 3 + k];
    const src = m.geometry.attributes;
    for (const k of t.userData.keys) {
      const s = src[k], d = t.geometry.attributes[k]; if (!s) continue;
      const size = s.itemSize;
      for (let a = 0; a < size; a++) d.array[j * size + a] = s.array[i * size + a];
    }
  }
}
