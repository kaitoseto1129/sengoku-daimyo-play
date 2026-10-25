import { rng, distToPolyline } from './world_common.js';
import * as THREE from 'three';
import { macroTex, leafTex, thatchTex } from './nature.js';
import { scaleTreePart, treeCards, treeLeafMap, keepAlpha, sway, liteMat, leafLit, farTreeLit } from './world_vegetation_materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MEM_TIGHT } from './settings.js';
import { rockShape } from './rock_shape.js';


export class WorldScenery {

  // ---------------- 地図の外の遠景 ----------------
  // 戦場の外にも野と丘が続き、杉林・田・村の家並みが霞の中に見える（兵は入らない。軽い作り）
  buildFarLand() {
    // 外周の地面だけ粗く残し、森・村・城の飾りは作らない。
    const def = this.def, R = rng((def.seed || 1) * 7 + 3);
    const EXT = this.half + 150, N = this.nearView ? 24 : 66, STEP = EXT * 2 / N;
    const extraNorth = def.fieldNorth == null ? 0 : Math.max(0, Math.ceil((-EXT - def.fieldNorth) / STEP));
    const NZ = N + extraNorth, north = -EXT - extraNorth * STEP;
    const W = def.water;
    const inWater = (x) => W && x > W.x - 3 && x < (W.x2 ?? 1e9) + 3;
    // 小川は地図の端から先へまっすぐ延ばす
    const streams = (def.streams || []).map((st) => {
      const p = st.pts, a = p[0], b = p[1], y = p[p.length - 1], z = p[p.length - 2];
      const ext = (u, v) => { const dx = u[0] - v[0], dz = u[1] - v[1], l = Math.hypot(dx, dz) || 1; return [u[0] + dx / l * 250, u[1] + dz / l * 250]; };
      return { pts: [ext(a, b), ...p, ext(y, z)], w: st.w };
    });
    const clamp = (v) => Math.max(-this.half, Math.min(this.half, v));
    const out = (x, z) => Math.max(Math.abs(x) - this.half, Math.abs(z) - this.half);
    const hills = (x, z) => 6 + Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.4) * 9 + Math.sin(x * 0.031 - z * 0.027) * 3.5 + Math.sin(z * 0.05 + x * 0.004) * 1.5;
    const riverAt = (x, z) => { let d = Infinity; for (const st of streams) d = Math.min(d, distToPolyline(x, z, st.pts) - st.w * 1.5); return d; };
    this.farH = (x, z) => {
      if (def.fieldNorth != null && z < -this.half && Math.abs(x) <= this.half) return this.heightAt(x, z);
      const o = out(x, z);
      const edge = this.heightAt(clamp(x), clamp(z));
      if (o <= 0.01) return edge - 0.35;
      const t = Math.min(1, o / 110), s = t * t * (3 - 2 * t);
      let h = edge + (hills(x, z) - 2) * s - 0.35 * (1 - s);
      if (inWater(x)) h = Math.min(h, W.level - 1.2);
      const rd = riverAt(x, z);
      if (rd < 8) h = Math.min(h, edge - 1.2 + Math.max(0, rd) * 0.4);
      return h;
    };
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= N; i++) {
      const x = -EXT + i * STEP, z = north + j * STEP;
      const h = this.farH(x, z);
      pos.push(x, h, z);
      // 低い所は田と畑（明るい緑と土色の区画）、丘は雑木と杉の森（暗い緑）
      const forest = Math.sin(x * 0.021 + 2.1) * Math.cos(z * 0.017 - 1.2) * 0.5 + 0.5 + (R() - 0.5) * 0.3 + (h - 6) * 0.03;
      if (forest > 0.55) c.setRGB(0.1 + R() * 0.03, 0.15 + R() * 0.04, 0.09);
      else {
        const f = ((Math.floor(x / 23) + Math.floor(z / 17)) & 3);
        c.setRGB(...[[0.3, 0.38, 0.18], [0.36, 0.4, 0.2], [0.34, 0.3, 0.2], [0.26, 0.34, 0.16]][f]);
      }
      if (riverAt(x, z) < 6 || inWater(x)) c.setRGB(0.24, 0.25, 0.2);
      col.push(c.r, c.g, c.b);
      if (i < N && j < NZ) {
        const x1 = x + STEP, z1 = z + STEP;
        // 地図の中に隠れる区画は作らない
        if (!(x >= -this.half && x1 <= this.half && z >= -this.half && z1 <= this.half)) {
          const k = j * (N + 1) + i;
          idx.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 遠くの野にも大小の斑（畑の区切り・草の濃淡）を入れる。頂点の色だけだと、のっぺりした一色の面に見える
    const landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    landMat.onBeforeCompile = (sh) => {
      sh.uniforms.tMacro = { value: macroTex() };
      sh.vertexShader = 'varying vec2 vLW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D tMacro; varying vec2 vLW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float lm = texture2D(tMacro, vLW * 0.0045).r * 0.6 + texture2D(tMacro, vLW * 0.021 + 0.3).r * 0.4;
        diffuseColor.rgb *= mix(0.78, 1.18, lm);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.05, 0.82), smoothstep(0.6, 0.8, texture2D(tMacro, vLW * 0.011 + 0.7).r) * 0.6);`);
    };
    const land = new THREE.Mesh(g, landMat);
    this.scene.add(land);
    this.farLand = land;
    if (this.nearView) return;
    const okFar = (x, z) => out(x, z) > 6 && !inWater(x) && riverAt(x, z) > 10;
    // 遠くの森：枝先の張りと垂れを持つ樹冠。形・材質は森全体で共用する。
    {
      const parts = [];
      const put = (geo, hex, foliage = false) => { scaleTreePart(geo, this.def.treeScale, foliage); const cc = new THREE.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3); for (let q = 0; q < n; q++) { const shade = foliage ? 0.62 + Math.max(0, geo.attributes.normal.getY(q)) * 0.3 + 0.08 * Math.sin(geo.attributes.position.getX(q) * 3 + geo.attributes.position.getZ(q) * 2) : 1; a[q * 3] = cc.r * shade; a[q * 3 + 1] = cc.g * shade; a[q * 3 + 2] = cc.b * shade; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(geo.index ? geo.toNonIndexed() : geo); };
      // 遠山の杉も近くと同じ一枝の絵で抜く。尖った多面体の影絵を残さない。
      // 四段・三方向の折れた房を全株で共用（葉は四十八面、従来は八十四〜百四十四面）。
      [[2.4, 4.8, 4.9], [2.05, 4.5, 7.0], [1.55, 4.2, 9.2], [0.9, 3.8, 11.1]].forEach(([r, h, y], tier) => {
        for (let j = 0; j < 3; j++) {
          const a = j * Math.PI * 2 / 3 + tier * 2.4;
          const cg = new THREE.PlaneGeometry(r * 2.2, h, 2, 1);
          const p = cg.attributes.position;
          for (let q = 0; q < p.count; q++) p.setZ(q, (1 - Math.abs(p.getX(q)) / (r * 1.1)) * r * 0.5);
          cg.rotateX(0.35); cg.rotateY(a);
          cg.translate(Math.cos(a) * r * 0.28, y + Math.sin(a * 2 + tier) * 0.35, Math.sin(a) * r * 0.28);
          const n = cg.attributes.normal;
          for (let q = 0; q < p.count; q++) n.setXYZ(q, p.getX(q) / r, (p.getY(q) - y) / h + 0.6, p.getZ(q) / r);
          cg.normalizeNormals();
          put(cg, [0x85977c, 0x91a185, 0xa0ae90, 0xacb99c][tier], true);
        }
      });
      const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, this.def.roundNeedles ? 8 : 4);
      // 負の座標は共通の葉材質で絵を読まない芯。幹も同じ一回の描画に含める。
      for (let q = 0; q < trunk.attributes.uv.count; q++) trunk.attributes.uv.setXY(q, -1, -1);
      trunk.translate(0, 1.5, 0); put(trunk, 0x9b7654);
      let sugiG = mergeGeometries(parts);
      if (true) {
        sugiG.dispose();
        const wood = parts[parts.length - 1];
        wood.setAttribute('treePlane', new THREE.Float32BufferAttribute(new Float32Array(wood.attributes.position.count), 1));
        sugiG = mergeGeometries([scaleTreePart(treeCards(5.8, 11.3, 7.0, 1), this.def.treeScale, true), wood]);
      }
      parts.length = 0;
      // 遠景の雑木も近景と同じ葉の絵で抜く。閉じた球を四つの枝房へ替える。
      // 三方向に浅く折り、横からも厚みを残す。葉は六十面から四十八面へ。
      // 専用の乱数は使わず、木の位置・本数・後続の景物の配置を保つ。
      const bareFar = this.def.treeScale && (this.def.winter || this.def.snow);
      (bareFar ? [] : [[-1.7, 5.2, 0.4, 3.8, 3.5], [1.6, 5.8, -0.5, 4.0, 3.7],
        [0.0, 6.2, 1.4, 3.7, 3.6], [-0.4, 7.6, -0.5, 3.5, 3.1]]).forEach(([x, y, z, w, h], tier) => {
        for (let j = 0; j < 3; j++) {
          const a = j * Math.PI * 2 / 3 + tier * 2.4;
          const cg = new THREE.PlaneGeometry(w, h, 2, 1);
          const p = cg.attributes.position;
          for (let q = 0; q < p.count; q++) p.setZ(q, (1 - Math.abs(p.getX(q)) / (w * 0.5)) * w * 0.22);
          cg.rotateX(0.25 + tier * 0.1); cg.rotateY(a);
          cg.translate(x, y + Math.sin(a + tier) * 0.25, z);
          const n = cg.attributes.normal;
          for (let q = 0; q < p.count; q++) n.setXYZ(q, p.getX(q) / 4.1, (p.getY(q) - 6) / 2.9 + 0.6, p.getZ(q) / 3.5);
          cg.normalizeNormals();
          put(cg, [0x819373, 0x8b9d7c, 0x95a585, 0xa6b494][tier], true);
        }
      });
      // 冬の雑木は葉を置かず、遠くでは三本の粗い裸枝を幹と同じ一回で描く。
      if (bareFar) for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        const br = new THREE.CylinderGeometry(0.025, 0.09, 3.4, 4, 1, true);
        for (let q = 0; q < br.attributes.uv.count; q++) br.attributes.uv.setXY(q, -1, -1);
        br.rotateZ(0.65); br.rotateY(a);
        br.translate(-Math.cos(a), 6.3, Math.sin(a)); put(br, 0x9b7654);
      }
      const trunk2 = new THREE.CylinderGeometry(0.25, 0.35, bareFar ? 7 : 4, 4);
      for (let q = 0; q < trunk2.attributes.uv.count; q++) trunk2.attributes.uv.setXY(q, -1, -1);
      trunk2.translate(0, bareFar ? 3.5 : 2, 0); put(trunk2, 0x9b7654);
      const broadG = mergeGeometries(parts);
      const NT = 1000;
      // 遠くは軽い陰影のまま。葉の絵と形を全株で共用し、描画回数を増やさない。
      const mats = new THREE.MeshLambertMaterial({ map: leafTex('broad'), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
      mats.onBeforeCompile = (sh) => { treeLeafMap(sh); keepAlpha(sh); };
      const needles = sway(liteMat({ map: leafTex('cedar'), color: 0xffffff, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.25 }), 0.02, 2.5, { after: leafLit });
      const sm = new THREE.InstancedMesh(sugiG, needles, NT), bm = new THREE.InstancedMesh(broadG, mats, NT);
      const d = new THREE.Object3D(); let ns = 0, nb = 0;
      const tc = new THREE.Color();
      for (let tries = 0; tries < NT * 6 && (ns < NT || nb < NT); tries++) {
        // 三つに一つは地図の端のすぐ外の帯から選ぶ
        let x = (R() * 2 - 1) * (EXT - 10), z = (R() * 2 - 1) * (EXT - 10);
        if (tries % 3 === 0) { const sd = Math.floor(R() * 4), t = (R() * 2 - 1) * (this.half + 50), o = this.half + 8 + R() * 50; x = sd === 0 ? o : sd === 1 ? -o : t; z = sd === 2 ? o : sd === 3 ? -o : t; }
        if (!okFar(x, z)) continue;
        const h = this.farH(x, z);
        const forest = Math.sin(x * 0.021 + 2.1) * Math.cos(z * 0.017 - 1.2) * 0.5 + 0.5 + (h - 6) * 0.03;
        // 地図の端のすぐ外（中くらいの遠さ）は木を濃く：近くの森と遠くの森が途切れて見えないように
        const near = out(x, z) < 60;
        if (forest < (near ? 0.28 : 0.5) + R() * 0.15) continue;
        // 戦場ごとの低地・砂州の疎林を遠景にもつなぐ。指定がない戦は従来どおり。
        // 位置から間引きを決め、追加の乱数や毎コマの処理は使わない。
        let keepTree = true;
        if (def.farTreeDensity) {
          const density = Math.max(0, Math.min(1, def.farTreeDensity(x, z)));
          const sample = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
          keepTree = sample - Math.floor(sample) < density;
        }
        const sc = 0.8 + R() * 0.6;
        d.position.set(x, h - 0.5, z); d.rotation.set(0, R() * 6, 0); d.scale.set(sc, sc * (0.85 + R() * 0.4), sc); d.updateMatrix();
        tc.setScalar(0.8 + R() * 0.4);
        if (R() < 0.6) { if (keepTree && ns < NT) { sm.setMatrixAt(ns, d.matrix); sm.setColorAt(ns, tc); ns++; } }
        else if (keepTree && nb < NT) { bm.setMatrixAt(nb, d.matrix); bm.setColorAt(nb, tc); nb++; }
      }
      sm.count = ns; bm.count = nb;
      // 画質「低」（携帯）：遠くの森は五本に一本だけ描く（霞の中の影絵なので数を減らしても森に見える。置き方の乱数は変えない）
      // 遠くの森が一本も無い戦（高遠）は色の入れ物が無いので飛ばす（前は低で開戦できなかった）
      //   高は二本に一本（霞の奥の影絵の森。画面の外も描かない）
      const farKeep = 2;
      for (const m of [sm, bm]) {
        if (!m.count || !m.instanceColor) continue;
        const A = m.instanceMatrix.array, C = m.instanceColor.array, n = Math.ceil(m.count / farKeep), K = farKeep;
        for (let j = 1; j < n; j++) { A.copyWithin(j * 16, j * 16 * K, j * 16 * K + 16); C.copyWithin(j * 3, j * 3 * K, j * 3 * K + 3); }
        m.count = n;
      }
      this.treeCardSavings += sm.count * 46 + bm.count * 58;
      this.viewCull([sm], 0); this.viewCull([bm], 0);
      this.scene.add(sm, bm);
      this.farTreeMeshes = [sm, bm];
    }
    // 村：茅葺きの家並み（寄棟の屋根）と納屋。炊事の煙が昇る
    this.buildSmokeColumns();
    const houses = [];
    for (let v = 0, tries = 0; v < 3 && tries < 200; tries++) {
      const a = R() * Math.PI * 2, dist = this.half + 40 + R() * 70;
      const vx = Math.sin(a) * dist, vz = Math.cos(a) * dist;
      if (Math.max(Math.abs(vx), Math.abs(vz)) > EXT - 30 || !okFar(vx, vz) || out(vx, vz) < 30) continue;
      // 村同士は離す
      if (houses.some((hh) => Math.hypot(hh[0] - vx, hh[1] - vz) < 90)) continue;
      const n = 6 + Math.floor(R() * 6);
      for (let k = 0; k < n; k++) {
        const hx = vx + (R() - 0.5) * 50, hz = vz + (R() - 0.5) * 34;
        if (!okFar(hx, hz)) continue;
        houses.push([hx, hz, R() * Math.PI, 0.8 + R() * 0.5, v]);
        if (R() < 0.45) this.addSmokeColumn(hx + (R() - 0.5) * 2, this.farH(hx, hz) + 6, hz + (R() - 0.5) * 2, { size: 1.6 });
      }
      v++;
    }
    if (houses.length) {
      const wall = new THREE.BoxGeometry(7, 2.6, 5); wall.translate(0, 1.3, 0);
      // 寄棟の茅葺き：急な四つの面と、低く張り出した軒
      const roof = new THREE.ConeGeometry(5.6, 4.2, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.18, 1, 0.86); roof.translate(0, 2.6 + 2.0, 0);
      const wm = new THREE.InstancedMesh(wall, new THREE.MeshLambertMaterial({ color: 0x6e5a44 }), houses.length);
      const rm = new THREE.InstancedMesh(roof, new THREE.MeshLambertMaterial({ map: thatchTex(), color: 0xa89878 }), houses.length);
      const d = new THREE.Object3D();
      houses.forEach(([x, z, r, s], i) => {
        d.position.set(x, this.farH(x, z) - 0.2, z); d.rotation.set(0, r, 0); d.scale.setScalar(s); d.updateMatrix();
        wm.setMatrixAt(i, d.matrix); rm.setMatrixAt(i, d.matrix);
      });
      this.scene.add(wm, rm);
    }
    // 遠くの城（def.farCastle：{ x, z } か { a: 向き, d: 遠さ }、tiers 天守の重ね）：丘の上の石垣・白い天守・隅櫓・塀を、
    // 霞の中の影絵として一つの形にまとめて置く（近寄れない遠景なので粗い形で軽く）
    if (def.farCastle) this.buildFarCastle(def.farCastle);
    this.buildMountainDetails();
  }

  // 山の面から設営時に位置を拾い、森の帯と露岩を二つの束で描く。
  buildMountainDetails() {
    // 減らした葉の三角の範囲に収める。木の少ない戦でも地形全体の三角を増やさない。
    const budget = Math.min(1024, Math.max(0, (this.treeCardSavings || 0) - 1));
    const treeCap = Math.min(192, Math.floor(budget * 0.375 / 2));
    const rockCap = Math.min(32, Math.floor((budget - treeCap * 2) / 20));
    if (!treeCap && !rockCap) return;
    const R = rng((this.def.seed || 5) * 41 + 85), d = new THREE.Object3D();
    // 携帯の遠景樹木も近景と同じ抜きにする。葉の縮小補正と霞の色は保ち、深さを書く。
    // パソコンは従来の透けを保つ。両面の一回描画は生成時に指定し、場の巡回を待たない。
    const foliage = new THREE.MeshLambertMaterial({ map: leafTex('treeCedar'), color: 0x758766,
      vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, transparent: !MEM_TIGHT,
      depthWrite: MEM_TIGHT, forceSinglePass: true, fog: false });
    const stone = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false });
    const haze = (sh) => {
      sh.uniforms.uMountainHaze = this.mountU.hazeCol;
      sh.uniforms.uMountainSky = this.skyMat.uniforms.top;
      sh.uniforms.uMountainVis = this.mountU.vis;
      sh.fragmentShader = 'uniform vec3 uMountainHaze, uMountainSky; uniform float uMountainVis;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float mountainAir = clamp(1.0 - exp(-length(vViewPosition) / max(20.0, uMountainVis) * 1.9), 0.0, 0.97);
        vec3 mountainAirColor = mix(uMountainHaze, uMountainSky, 0.18);
        outgoingLight = mix(outgoingLight, mountainAirColor, mountainAir);
        #include <opaque_fragment>`);
    };
    foliage.onBeforeCompile = sh => { farTreeLit(sh); haze(sh); };
    stone.onBeforeCompile = haze;
    const trees = new THREE.InstancedMesh(treeCards(4.5, 9, 4.5, 1), foliage, treeCap);
    const rocks = new THREE.InstancedMesh(rockShape(1, false, 0), stone, rockCap);
    let nt = 0, nr = 0;
    for (let i = 0; i < 384 && (nt < treeCap || nr < rockCap); i++) {
      const layer = i % 2, surface = this.mountains.children[layer];
      const p = surface.geometry.attributes.position, rows = 5, columns = p.count / (rows + 1) - 1;
      const angle = R() * columns, row = 1 + R() * 3.5;
      const a = Math.floor(angle), b = Math.floor(row), u = angle - a, v = row - b;
      const k = a * (rows + 1) + b, k2 = k + rows + 1;
      // 山の三角形と同じ対角線で補間し、木や岩を空中に浮かせない。
      const ids = u + v <= 1 ? [k, k2, k + 1] : [k2 + 1, k + 1, k2];
      const weights = u + v <= 1 ? [1 - u - v, u, v] : [u + v - 1, 1 - u, 1 - v];
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < 3; j++) { x += p.getX(ids[j]) * weights[j]; y += p.getY(ids[j]) * weights[j]; z += p.getZ(ids[j]) * weights[j]; }
      const band = Math.sin(angle * 0.13 + layer * 2) + Math.cos(angle * 0.047 - row * 0.7);
      if (y < 0 || band < -0.25) continue;
      d.position.set(x, y - 0.6, z); d.rotation.set(0, R() * Math.PI * 2, 0);
      if (band > 0.35 && nt < treeCap) {
        const sc = 0.65 + R() * 0.65; d.scale.set(sc, sc * (0.8 + R() * 0.4), sc); d.updateMatrix(); trees.setMatrixAt(nt++, d.matrix);
      } else if (nr < rockCap) {
        const sc = 1.2 + R() * 2; d.scale.set(sc * 1.5, sc, sc); d.updateMatrix(); rocks.setMatrixAt(nr++, d.matrix);
      }
    }
    trees.count = nt; rocks.count = nr;
    // 山と同じ親へ置き、既存の追従だけで動かす。影・風・毎コマの更新は足さない。
    trees.renderOrder = rocks.renderOrder = -0.8;
    this.mountains.children[0].add(trees, rocks);
  }

  // 出だしのカメラの周りの木を消す（近い枝葉の板が画面の上と右を塞ぐのを、全ての戦で防ぐ）。r メートル以内の株を畳む。
  clearTreesAround(x, z, r) {
    const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of [...(this.treeMeshes || []), ...(this.farTreeMeshes || [])]) {
      if (!m.isInstancedMesh) continue;
      let hit = false;
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, m4);
        const e = m4.elements;
        if (Math.hypot(e[12] - x, e[14] - z) < r) { m.setMatrixAt(i, zero); hit = true; }
      }
      if (hit) m.instanceMatrix.needsUpdate = true;
    }
  }

  buildFarCastle(o) {
    const cx = o.x ?? Math.sin(o.a || 0) * (o.d || this.half + 120), cz = o.z ?? Math.cos(o.a || 0) * (o.d || this.half + 120);
    const y0 = this.farH(cx, cz), sc = o.s || 1, rot = o.rot || 0;
    const parts = [];
    const add = (g, hex, x, y, z) => {
      g.rotateY(rot); g.translate(cx + (x * Math.cos(rot) + z * Math.sin(rot)) * sc, y0 + y * sc, cz + (-x * Math.sin(rot) + z * Math.cos(rot)) * sc);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(hex);
      // 下ほど暗く（石垣の裾・軒下の陰）
      for (let i = 0; i < n; i++) { const k = 0.78 + 0.22 * Math.min(1, Math.max(0, (g.attributes.position.getY(i) - y0) / (40 * sc))); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
    const roof = (w, d, h) => { const g = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h, 4); g.rotateY(Math.PI / 4); g.scale(w / Math.max(w, d), 1, d / Math.max(w, d)); g.translate(0, h / 2, 0); return g; };
    // 石垣：裾の広い台形（上に行くほど細い）
    const base = new THREE.CylinderGeometry(22 / Math.SQRT2, 30 / Math.SQRT2, 9, 4); base.rotateY(Math.PI / 4); base.translate(0, 4.5, 0);
    add(base, 0x8a867a, 0, 0, 0);
    // 塀と隅櫓
    for (const [x, z, w, d] of [[0, -13, 26, 0.8], [0, 13, 26, 0.8], [-13, 0, 0.8, 26], [13, 0, 0.8, 26]]) add(box(w, 2.2, d), 0xd6d0c2, x, 9, z);
    for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { add(box(4.5, 4, 4.5), 0xdcd6c8, x, 9, z); add(roof(6, 6, 2.2), 0x2e3134, x, 13, z); }
    // 天守：重ねるごとに細く、各重に黒い屋根
    let y = 9, w = 14, d = 12;
    const tiers = o.tiers || 4;
    for (let k = 0; k < tiers; k++) {
      const h = k === tiers - 1 ? 4.2 : 4.6;
      add(box(w, h, d), k % 2 ? 0xe2ddd0 : 0xd8d2c4, 0, y, 0);
      add(roof(w + 3, d + 3, k === tiers - 1 ? 4 : 1.8), 0x2a2d31, 0, y + h - 0.2, 0);
      y += h + 0.6; w *= 0.78; d *= 0.78;
    }
    const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = false; m.receiveShadow = false;
    this.scene.add(m);
    return m;
  }
}
