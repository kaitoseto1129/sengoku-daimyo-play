import * as THREE from 'three';
import { isNoRender } from './world_common.js';
import { armyPart } from './world_army_geometry.js';
import { jinmakuTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { _caM4, _caQ, _caP, _caD, _caS, _caZ } from './world_army_shader.js';


export class WorldArmyScene {

  // 遠景の軍勢（軽い作りの兵を一度に描く。兵力の数には入れない）
  // o：{ x, z, w, d, count, facing, armor, flagTex か flag（家紋の鍵）, seed, kind, mon, tack, people }
  //   kind は並び（'mixed'・'spear'・'gun'・'bow'・'cavalry'・'honjin'）。people を渡すと、その場所に一人ずつ置く
  //   people：[{ x, z, facing, k: 'spear'|'gun'|'bow'|'samurai'|'banner'|'rider'|'seated', flag, helm }]（世界の座標）
  // 返す物（THREE.Group）で、戦の側から隊を動かせる：
  //   army.advance(dist, secs, { charge })  前へ dist m を secs 秒で（charge で槍を下ろす）
  //   army.retreat(dist, secs)              背を向けて退き、着いたら向き直る
  //   army.rout({ hideAfter })              崩れて散る（ばらばらに逃げ、何人かは倒れる。hideAfter 秒で消す。既定 40）
  //   army.halt()・army.reform()            止まる・元の並びに戻す
  //   army.follow(fn, { gap, speed })       fn() が返す { x, z, facing } の後ろへ付く（速さの既定は2.6、nullで止まる）
  // 遠景専用の飾りは設営時に省く。実兵へ戻す一人ごとの控えは省かない。
  outsideNearView(x, z, radius = 0) {
    const p = this.lastFocus || this.def.spawn || { x: 0, z: 0 };
    return Math.hypot(x - p.x, z - p.z) > 140 + radius;
  }


  emptyDistantArmy(o) {
    // 台本の前進・敗走の呼び口だけ残し、形・材質・更新の登録を作らない。
    const g = new THREE.Group();
    const A = g.army = { mesh: g, cx: o.x || 0, cz: o.z || 0, x0: o.x || 0,
      off: new THREE.Vector3(), facing: o.facing || 0, face0: o.facing || 0,
      mon: o.mon || o.flag, team: o.team, list: [], n: 0, noWake: true };
    const stay = () => g;
    g.advance = g.retreat = g.moveTo = g.halt = g.follow = stay;
    g.rout = () => { A.rout = 1; return g; };
    g.reform = () => { A.rout = 0; return g; };
    g.take = () => [];
    g.left = () => 0;
    g.give = () => false;
    return g;
  }


  // 近い隊は本物へ替える。替えられない時も残った列・旗・槍を保つ。
  shyTick(dt, p) {
    this._shyT = (this._shyT || 0) - dt;
    if (this._shyT > 0 || !p) return;
    this._shyT = 0.25;
    const D = this.def || {}, T = this.time || 0;
    if (D.town || D.dojo) return;
    const wakeOn = !D.noWake && T - (this.wakeLive ?? -99) < 1.5;
    for (const A of this.armies || []) {
      A.shyV = null;
      A.unavailable = !wakeOn || !!A.noWake;
      A.nearR = 0;
    }
  }


  // 遠景の大軍が本物の兵の戦う所に重ならないように：本物の兵（pts：{x,z} の並び）の 3.4m 内にいる軽い兵を隠す（大きさ 0）。
  // 次の更新までの歩みと槍を振る余白を取り、足もとだけ抜いて周りの影の兵に埋もれるのを防ぐ。
  //   本物の兵が離れて 1.5 秒たてば元に戻す。置き換え（take）で隠した兵には触らない。units.js が 0.7 秒ごとに始め、数コマで調べる
  yieldArmies(pts, dt) {
    // 重なりを隠す行列は見た目専用。兵の置き換え・戦闘の人数は変えない。
    if (isNoRender()) return true;
    const AR = this.armies;
    if (!AR || !AR.length) return true;
    const W = this.yieldWork || (this.yieldWork = { cell: new Map(), spare: [], points: [], count: 0, m4: new THREE.Matrix4(), tp: new THREE.Vector3(), pending: false });
    if (W.pending) return false;
    const C = 3.4, cell = W.cell, spare = W.spare;
    // 数コマに分けている間も、升目と位置は同じ時点のものを使う。
    for (const list of cell.values()) { list.length = 0; spare.push(list); }
    cell.clear();
    W.count = pts.length;
    for (let i = 0; i < pts.length; i++) {
      const p = W.points[i] || (W.points[i] = { x: 0, z: 0 });
      p.x = pts[i].x; p.z = pts[i].z;
      const k = Math.floor(p.x / C) * 100003 + Math.floor(p.z / C);
      let list = cell.get(k);
      if (!list) { list = spare.pop() || []; cell.set(k, list); }
      list.push(p);
    }
    W.army = 0; W.index = -1; W.end = AR.length; W.dt = dt; W.pending = true;
    return true;
  }


  // 0.7秒ごとの全軍の調べを、一コマ256人・約1msずつ進める。
  yieldArmyStep() {
    const W = this.yieldWork;
    if (!W?.pending || isNoRender()) return;
    const start = performance.now(), tp = W.tp;
    let steps = 0;
    while (W.army < W.end) {
      if (++steps > 256 || steps % 16 === 0 && performance.now() - start >= 1) return;
      const A = this.armies[W.army], P = A?.parts;
      // 崩れた大軍も、本物の兵のそばは隠す。
      if (!P || !P.grp.visible) { W.army++; W.index = -1; continue; }
      P.grp.updateWorldMatrix(true, true);
      if (W.index < 0) {
        // 開戦時に測った列全体で、遠い軍勢の個別の調べを省く。
        const bounds = P.body.boundingSphere;
        tp.copy(bounds.center).applyMatrix4(P.body.matrixWorld);
        const extent = bounds.radius * P.body.matrixWorld.getMaxScaleOnAxis() + 3.4;
        let any = false;
        for (let j = 0; j < W.count; j++) {
          const p = W.points[j];
          if (Math.abs(p.x - tp.x) < extent && Math.abs(p.z - tp.z) < extent) { any = true; break; }
        }
        if (!any && !A.hidN) { W.army++; continue; }
        if (!A.base) A.base = P.body.instanceMatrix.array.slice();
        W.index = 0;
      }
      for (; W.index < A.n; ) {
        // 隠した兵や置き換え済みの兵も、調べる手間に数える。
        if (++steps > 256 || steps % 16 === 0 && performance.now() - start >= 1) return;
        const i = W.index++;
        if (A.taken[i]) continue;
        const k = i * 16;
        tp.set(A.base[k + 12] + A.off.x, A.base[k + 13] + A.off.y, A.base[k + 14] + A.off.z).applyMatrix4(P.grp.matrixWorld);
        const hit = this.yieldNear(tp.x, tp.z);
        const h = A.hid[i];
        if (hit) {
          if (h <= 0) {
            A.hid[i] = 1; A.hidN = (A.hidN || 0) + 1;
            this.yieldMesh(A, P.body, i, i, false); this.yieldMesh(A, P.flags, i, i, false);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, false); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, false); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, false); }
          } else A.hid[i] = 1;
        } else if (h > 0) {
          // 離れてから 1.5 秒で元へ
          A.hid[i] = h + W.dt;
          if (A.hid[i] > 2.5) {
            A.hid[i] = 0; A.hidN--;
            this.yieldMesh(A, P.body, i, i, true); this.yieldMesh(A, P.flags, i, i, true);
            if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) this.yieldMesh(A, P.banners, j, i, true); }
            if (P.horses) { const j = P.riders.indexOf(i); if (j >= 0) this.yieldMesh(A, P.horses, j, i, true); }
            if (P.plumes) { const j = P.chiefs.indexOf(i); if (j >= 0) this.yieldMesh(A, P.plumes, j, i, true); }
          }
        }
      }
      W.army++; W.index = -1;
    }
    W.pending = false;
  }


  yieldNear(x, z) {
    const cell = this.yieldWork.cell, cx = Math.floor(x / 3.4), cz = Math.floor(z / 3.4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = cell.get((cx + i) * 100003 + cz + j);
      if (list) for (const p of list) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < 3.4 * 3.4) return true;
      }
    }
    return false;
  }

  yieldMesh(A, mesh, j, i, show) {
    if (!mesh) return;
    const { m4, tp } = this.yieldWork;
    if (show) m4.fromArray(A.base, i * 16);   // 旗・影・幟・馬も、体と同じ置き場の行列
    else { mesh.getMatrixAt(j, m4); tp.setFromMatrixPosition(m4); m4.makeScale(0, 0, 0).setPosition(tp); }
    mesh.setMatrixAt(j, m4); mesh.instanceMatrix.needsUpdate = true;
  }


  // 本陣の飾り：陣幕（家紋入り）と、大将の後ろに立つ馬印（金の扇）
  honjinDressing(grp, o, facing) {
    const M = o._maku, cf = Math.cos(facing), sf = Math.sin(facing);
    const W = (lx, lz) => [o.x + lx * cf + lz * sf, o.z - lx * sf + lz * cf];
    const cloths = [], coarseCloths = [], wood = [];
    // 幕と縄は初めに焼き込む。遠くの幕は粗い形へ替え、毎コマ布を計算しない。
    const rope = (a, b) => {
      const delta = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(0.018, 0.018, delta.length(), 3);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      armyPart(wood, g, 0x8c7958, 0);
    };
    const hw = M.w / 2, hd = M.d / 2, gap = 3;
    const sides = [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, -gap, hd], [gap, hd, hw, hd]];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const [x0, z0] = W(ax + (bx - ax) * t0, az + M.z + (bz - az) * t0), [x1, z1] = W(ax + (bx - ax) * t1, az + M.z + (bz - az) * t1);
        const y0 = this.heightAt(x0, z0), y1 = this.heightAt(x1, z1);
        const span = len / n, nx = -(z1 - z0) / span, nz = (x1 - x0) / span;
        // 上端は柱へ張り、中央と裾に重い布のふくらみを残す。折り目の法線が日の光を拾う。
        for (const fine of [true, false]) {
          const g = new THREE.PlaneGeometry(1, 1.5, fine ? 8 : 4, fine ? 3 : 1);
          const P = g.attributes.position, UV = g.attributes.uv, colors = new Float32Array(P.count * 3);
          for (let k = 0; k < P.count; k++) {
            const u = P.getX(k) + 0.5, v = UV.getY(k), sag = Math.sin(u * Math.PI);
            // 近くでは吊り元から流れる斜めのひだ。遠くは従来の大きなたるみだけを使う。
            const fold = Math.cos(u * Math.PI * 4 + (1 - v) * 1.8) * sag;
            const belly = sag * (0.07 + (1 - v) * 0.17)
              + (fine ? fold * 0.14 * Math.sin(v * Math.PI) : 0);
            P.setXYZ(k, x0 + (x1 - x0) * u + nx * belly,
              y0 + (y1 - y0) * u + 0.3 + v * 1.72 - sag * (0.08 + v * 0.1),
              z0 + (z1 - z0) * u + nz * belly);
            UV.setX(k, (i + u) * span / 4);
            // 裾の泥と縫い際の陰は頂点色で残し、専用の絵や材質を増やさない。
            const shade = (0.72 + Math.min(1, v * 3) * 0.28) * (0.88 + sag * 0.12)
              * (fine ? 0.94 + fold * 0.08 : 1);
            colors[k * 3] = shade; colors[k * 3 + 1] = shade * 0.98; colors[k * 3 + 2] = shade * 0.94;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          g.computeVertexNormals(); (fine ? cloths : coarseCloths).push(g);
        }
        // 柱間の吊り縄も幕と同じたるみにする。既存の木部の一描画へまとめる。
        for (let j = 0; j < 4; j++) {
          const point = (u) => new THREE.Vector3(x0 + (x1 - x0) * u,
            y0 + (y1 - y0) * u + 2.05 - Math.sin(u * Math.PI) * 0.18, z0 + (z1 - z0) * u);
          rope(point(j / 4), point((j + 1) / 4));
        }
        const p = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4); p.translate(x0, y0 + 1.1, z0); armyPart(wood, p, 0x3a2c1c, 0);
        if (i === n - 1) {
          const end = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4);
          end.translate(x1, y1 + 1.1, z1); armyPart(wood, end, 0x3a2c1c, 0);
        }
      }
    }
    const tex = jinmakuTexture(o.mon).clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
    const clothMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide });
    const maku = new THREE.LOD();
    // 形は世界座標で焼いてあるため、切替の基準だけ本陣の中心へ置く。
    const [mx, mz] = W(0, M.z), my = this.heightAt(mx, mz);
    maku.position.set(mx, my, mz);
    for (const [parts, distance] of [[cloths, 0], [coarseCloths, 65]]) {
      const geo = mergeGeometries(parts); geo.translate(-mx, -my, -mz);
      for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(geo, clothMat); mesh.receiveShadow = true;
      maku.addLevel(mesh, distance);
    }
    // 馬印：大将の後ろに高く立てる金の扇
    const [ux, uz] = W(0, M.z - hd - 0.8), uy = this.heightAt(ux, uz);
    const pole = new THREE.CylinderGeometry(0.05, 0.06, 7, 5); pole.translate(ux, uy + 3.5, uz); armyPart(wood, pole, 0x2a2018, 0);
    const fan = new THREE.CircleGeometry(0.9, 10, 0, Math.PI); fan.rotateY(facing); fan.translate(ux, uy + 6.6, uz); armyPart(wood, fan, 0xc9a040, 0);
    armyPart(wood, new THREE.CircleGeometry(0.9, 10, 0, Math.PI).rotateY(facing + Math.PI).translate(ux, uy + 6.6, uz), 0xb89030, 0);
    const wm = new THREE.Mesh(mergeGeometries(wood), new THREE.MeshLambertMaterial({ vertexColors: true }));
    grp.add(maku, wm);
  }

  // 合戦の矢（細い棒を弧に沿って飛ばす。落ちたら少しの間地面に刺さったまま）
  buildClashArrows() {
    const CAP = 280;
    const g = new THREE.BoxGeometry(0.025, 0.025, 0.9);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x2e241a }), CAP);
    mesh.count = 0; mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.clashArrows = { mesh, list: [], CAP };
    return this.clashArrows;
  }

  updateClashArrows(dt) {
    const A = this.clashArrows;
    if (!A) return;
    const m4 = _caM4, q = _caQ, p = _caP, d = _caD, s = _caS, zf = _caZ;
    let n = 0;
    for (let i = A.list.length - 1; i >= 0; i--) {
      const a = A.list[i];
      a.t += dt;
      // 外れ矢を残さない戦では、軽い乱戦の矢も着地で返す。
      if (a.t > a.dur + (this.def.noGroundArrows ? 0 : 6)) { A.list.splice(i, 1); continue; }
    }
    for (const a of A.list) {
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      const x = a.x0 + (a.x1 - a.x0) * k, z = a.z0 + (a.z1 - a.z0) * k;
      const y0 = this.heightAt(a.x0, a.z0) + 2, y1 = this.heightAt(a.x1, a.z1) + 0.25;
      const y = y0 + (y1 - y0) * k + a.h * 4 * k * (1 - k);
      d.set(a.x1 - a.x0, (y1 - y0) + a.h * 4 * (1 - 2 * Math.min(k, 0.98)), a.z1 - a.z0).normalize();
      // 飛んだ距離を傾きにすると、長射程ほど矢が地面に寝て黒い横線になる。
      if (k >= 1) d.y = -Math.max(0.8, Math.abs(d.y));
      d.normalize();
      q.setFromUnitVectors(zf, d);
      p.set(x, y, z);
      m4.compose(p, q, s);
      A.mesh.setMatrixAt(n++, m4);
      if (n >= A.CAP) break;
    }
    A.mesh.count = n;
    if (n) A.mesh.instanceMatrix.needsUpdate = true;
  }
}
