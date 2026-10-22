import { fireGlow } from './fire_glow.js';
// 三木城・平田と大村の合戦（天正七年九月十日）。城外の兵糧搬入阻止。
// 城は南東、平田・大村は北西、平井山の本陣は本丸の東北東。局地の兵数は復元。
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
import { nobori, hut, yagura, tawara, takataba, jinmaku, dorui, umatsunagi, hyoro, village, kabukimon, makeSimpleBatch, pushSimpleBatch, finalizeSimpleBatch, palisade, castleBoardFence, hatazao, jindaiko, solidCircle, solidRect, solidSeg, SOLIDS } from './props.js';
import * as THREE from 'three';
import { bodyGeometry } from './units_model.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import { dirtTex, mudTex, leafTex } from './nature.js';
import { lookKey } from './units_look.js';
import { lodSwap, flagMaterial } from './units_flags.js';
import { WIND_STATE } from './world.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { MIKI_JO, MIKI_KURUWA, MIKI_HONJIN_OFFSET, MIKI_ROAD, TSUKESHIRO_CHAIN, MIKI_BRANCHES, MIKI_HORI, MIKI_FORTS as BASE_FORTS } from './castles/miki.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { weatherSees } from './weather_gameplay.js';
import { S as SETTINGS } from './settings.js';
import { gauss, enemyGroup, allyGroup, nm, ringWall, wallLine } from './bhelp.js';
import { dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { camp } from './b_mid.js';
import { makeKakoi, advanceDay, campWear, kakoiEvent } from './kakoi.js';

const MIKI = { x: 70, z: 30 };
// 三木だけの見た目の補修。川床・浅瀬・兵の道は変えない。
function mikiScenery(W) {
  // 出陣札で時間が止まっている間も、山の霞を夜の空へ合わせる。
  W.mountU.hazeCol.value.copy(W.scene.fog.color);
  W.mountU.vis.value = W.look.vis;
  W.prepareNight();
  // 遠い杉は一枚の全木の形。枝一本の絵を縦に伸ばさず、幹はそのまま残す。
  // 葉だけを頂点処理で視点へ向け、横から見た細い三角板も避ける。
  const farCedar = W.farTreeMeshes?.[0];
  if (farCedar) {
    const mat = farCedar.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.map = leafTex('treeCedar');
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          if (uv.x >= 0.0) {
            mat4 cedarWorld = modelMatrix * instanceMatrix;
            vec3 cedarEye = cameraPosition - cedarWorld[3].xyz;
            vec2 cedarFacing = vec2(dot(cedarEye, normalize(cedarWorld[0].xyz)), dot(cedarEye, normalize(cedarWorld[2].xyz)));
            cedarFacing /= max(length(cedarFacing), 0.001);
            transformed.xz = vec2(cedarFacing.y, -cedarFacing.x) * position.x;
          }
        #endif`);
    };
    mat.customProgramCacheKey = () => key + '|miki-whole-cedar';
    mat.needsUpdate = true;
  }
  // 葉の透過光を月夜の量へ落とす。幹・葉・遠い写しで同じ夜の値を使い、
  // 未明の杉だけが白い氷柱のように光らないようにする。朝は元の受光へ戻る。
  const treeMaterials = new Set();
  for (const mesh of [...(W.treeMeshes || []), ...(W.farTreeMeshes || [])]) {
    const mat = mesh.material;
    if (!mat || treeMaterials.has(mat)) continue;
    treeMaterials.add(mat);
    const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      sh.uniforms.mikiTreeNight = W.nightU;
      sh.fragmentShader = 'uniform float mikiTreeNight;\n' + sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        'outgoingLight *= mix(1.0, 0.32, mikiTreeNight);\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => key + '|miki-tree-night';
    mat.needsUpdate = true;
  }
  // 月明かりのある未明。既存の星を間引き、空一面の粒を雪のように見せない。
  if (W.stars) {
    W.stars.geometry.setDrawRange(0, 240);
    W.stars.material.size = 1; W.stars.material.opacity = .24;
  }
  for (const st of W.def.streams || []) {
    const geo = st.mesh.geometry, p = geo.attributes.position, flow = geo.attributes.waterFlow;
    const bank = new Float32Array(p.count);
    const surface = st.surface, rows = surface.length / 3;
    for (let row = 0; row < rows; row++) {
      const before = Math.max(0, row - 1) * 3, after = Math.min(rows - 1, row + 1) * 3;
      const dx = surface[after] - surface[before], dz = surface[after + 1] - surface[before + 1];
      const len = Math.hypot(dx, dz) || 1, x = surface[row * 3], z = surface[row * 3 + 1];
      // 折れ目の前後の向きをつなぎ、岸の幅もゆるく揺らす。判定の川幅の内側に収める。
      const width = st.w - .18 - .12 * Math.sin(x * .31 + z * .13);
      // 坂の川床は中央より岸寄りが低い。描いた三角形の低い所も調べ、腰まで水に埋めない。
      // 頂点の間も半歩ずつ調べる。準備時だけ行い、描く高さと深さの判定を同時に下げる。
      let level = surface[row * 3 + 2];
      for (let along = -4; along <= 4; along++) for (let across = -6; across <= 6; across++) {
        const sx = x + dx / len * along * .5 - dz / len * st.w * across / 6;
        const sz = z + dz / len * along * .5 + dx / len * st.w * across / 6;
        const shallow = st.fords?.some(f => Math.abs(sx - f.x) <= f.w - 4);
        level = Math.min(level, W.heightAt(sx, sz) + (shallow ? .35 : .95));
      }
      surface[row * 3 + 2] = level;
      for (let side = 0; side < 2; side++) {
        const i = row * 2 + side, sign = side ? -1 : 1;
        p.setXYZ(i, x - dz / len * width * sign, level, z + dx / len * width * sign);
        flow.setXY(i, dx / len, dz / len);
        bank[i] = sign;
      }
    }
    // 行の間の谷底も調べる。端だけを下げても、斜めの水面が低い川床を覆ってしまう。
    // 両端を同じ量だけ下げれば、描く三角形と深さの判定を一致させたまま補える。
    for (let row = 1; row < rows; row++) {
      const a = (row - 1) * 3, b = row * 3;
      const dx = surface[b] - surface[a], dz = surface[b + 1] - surface[a + 1];
      const len = Math.hypot(dx, dz) || 1;
      let drop = 0;
      for (let along = 0; along <= 8; along++) for (let across = -12; across <= 12; across++) {
        const t = along / 8, off = st.w * across / 12;
        const x = surface[a] + dx * t - dz / len * off;
        const z = surface[a + 1] + dz * t + dx / len * off;
        const shallow = st.fords?.some(f => Math.abs(x - f.x) <= f.w - 4);
        const level = surface[a + 2] * (1 - t) + surface[b + 2] * t;
        drop = Math.max(drop, level - W.heightAt(x, z) - (shallow ? .35 : .95));
      }
      if (drop > 0) {
        surface[a + 2] -= drop; surface[b + 2] -= drop;
        for (const r of [row - 1, row]) for (let side = 0; side < 2; side++) p.setY(r * 2 + side, surface[r * 3 + 2]);
      }
    }
    geo.setAttribute('mikiBank', new THREE.BufferAttribute(bank, 1));
    p.needsUpdate = flow.needsUpdate = true;
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    // 既存のさざ波・流れ・岸の泡へ、細かな波頭を同じ描画の中で足す。
    const mat = st.mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => key + '|miki';
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      // 川の両端だけを湿った土色へ寄せ、細かな入り組みで直線の切り口を崩す。
      // 川床・水深・浅瀬の判定は保ち、形や描画の回数は増やさない。
      sh.vertexShader = 'attribute float mikiBank; varying float vMikiBank;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\n vMikiBank = mikiBank;');
      sh.fragmentShader = 'varying float vMikiBank;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float mikiBankDistance = (1.0 - abs(vMikiBank)) * ${st.w.toFixed(2)};
        float mikiBankNoise = texture2D(tMacro, vWPw.xz * 0.7).r;
        if (mikiBankDistance < 0.06 + mikiBankNoise * 0.3) discard;
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.65, 0.64, 0.53), diffuseColor.rgb,
          smoothstep(0.15, 0.9, mikiBankDistance));
        float mikiAlong = dot(vWPw.xz, normalize(vWaterFlow + vec2(0.00001)));
        float mikiAcross = dot(vWPw.xz, vec2(-vWaterFlow.y, vWaterFlow.x));
        float mikiWave = sin(mikiAlong * 6.3 - uTime * 2.4 + sin(mikiAcross * 3.7));
        float mikiNear = 1.0 - smoothstep(25.0, 100.0, length(vWPw - cameraPosition));
        diffuseColor.rgb *= 1.0 + mikiWave * mikiNear * 0.09;
      `);
    };
    // 厚みのある川石の中心を水面へ合わせ、上半分だけを出す。形は作り直さない。
    if (st.rockMesh) {
      const rocks = st.rockMesh.geometry, rp = rocks.attributes.position;
      const sample = new THREE.SphereGeometry(1, 8, 5);
      const count = sample.index.count; sample.dispose();
      for (let start = 0; start < rp.count; start += count) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const end = Math.min(start + count, rp.count);
        for (let i = start; i < end; i++) {
          minX = Math.min(minX, rp.getX(i)); maxX = Math.max(maxX, rp.getX(i));
          minY = Math.min(minY, rp.getY(i)); maxY = Math.max(maxY, rp.getY(i));
          minZ = Math.min(minZ, rp.getZ(i)); maxZ = Math.max(maxZ, rp.getZ(i));
        }
        const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2, depth = W.waterDepthAt(x, z);
        if (depth <= .02) continue;
        const drop = W.heightAt(x, z) + depth - (minY + maxY) / 2;
        for (let i = start; i < end; i++) rp.setY(i, rp.getY(i) + drop);
      }
      rp.needsUpdate = true; rocks.computeBoundingSphere();
    }
  }
  // 三層の山肌の色だけ変える。霞を弱めると、夜の谷の上へ黒い板が浮いて見える。
  const colors = [0x293c30, 0x40554d, 0x5b6d68];
  for (let layer = 0; layer < W.mountains.children.length; layer++) {
    const mountain = W.mountains.children[layer], mat = mountain.material;
    mat.color.setHex(colors[layer]);
    // 頂点の奥行きを変えると、視点の後ろの山まで手前の切断面を越えて伸びる。
    // 切断は通常の投影に任せ、描いた画素だけ背景の深さに置く。
    // 実際の地面と木立は手前に保ち、空へ垂れる三角形を作らない。
    mat.extensions.fragDepth = true;
    mat.fragmentShader = mat.fragmentShader.replace('gl_FragColor =', 'gl_FragDepthEXT = 0.99999; gl_FragColor =');
    const p = mountain.geometry.attributes.position, crest = mountain.geometry.attributes.crest;
    const uv = mountain.geometry.attributes.uv;
    // 夜空に細い鋸歯を足さず、既存の尾根を隣の三列ずつとつなぐ。準備時だけ行う。
    let rows = 1;
    while (rows < p.count && crest.getX(rows) > 0) rows++;
    const columns = p.count / rows - 1, tops = new Float32Array(columns);
    for (let col = 0; col < columns; col++) tops[col] = p.getY(col * rows + rows - 1);
    for (let col = 0; col <= columns; col++) {
      let top = 0;
      for (let off = -3; off <= 3; off++) top += tops[(col + off + columns) % columns] * (4 - Math.abs(off)) / 16;
      const base = p.getY(col * rows);
      for (let row = 0; row < rows; row++) {
        const i = col * rows + row, y = base + (top - base) * Math.pow(crest.getX(i), .85);
        p.setY(i, y); uv.setY(i, y);
      }
    }
    p.needsUpdate = uv.needsUpdate = true;
    mountain.geometry.computeVertexNormals(); mountain.geometry.computeBoundingSphere();
    mat.needsUpdate = true;
  }
}
// この二戦だけの固定物。竹束・土俵の形を使い回し、兵も毎コマの処理も増やさない。
export function siegeApproach(rt, pts, batch, soften = false) {
  const W = rt.world, last = pts[pts.length - 1];
  const bale = tawara(W, pts[0][0] + 4, pts[0][1], 0, 6);
  rt.scene.add(bale);
  Object.assign(SOLIDS[SOLIDS.length - 1], { missileH: 1.3, missileType: 'earth' });
  let shieldMaterial;
  for (let i = 1; i < pts.length; i++) {
    const [x, z] = pts[i], [ax, az] = pts[i - 1];
    const len = Math.hypot(x - ax, z - az), nx = -(z - az) / len, nz = (x - ax) / len;
    // 道の両肩へ掘った土を積む。中央の四歩は歩けるまま。
    for (const side of [-1, 1]) dorui(W, [ax + nx * 2 * side, az + nz * 2 * side, x + nx * 2 * side, z + nz * 2 * side], nx * side, nz * side, { h: .65, w: 1.4, capEnds: soften, closeBack: soften, batch });
    const shield = takataba(W, x + 4, z - 2);
    if (soften) shield.material = shieldMaterial || (shieldMaterial = mikiCoverMaterial(shield.material, 'bamboo'));
    rt.scene.add(shield);
    const m = bale.clone(); m.position.set(x + 4, W.heightAt(x + 4, z + 1), z + 1); rt.scene.add(m);
    Object.assign(solidRect(x + 4, z + 1, 1.1, 1.8), { missileH: 1.3, missileType: 'earth' });
  }
  // 後ろの竹の虎落。入口を空け、夜討ちが道の横から回り込むのを防ぐ。
  const [x, z] = pts[0], bamboo = new THREE.CylinderGeometry(1, 1, 1, 5);
  const fence = new THREE.InstancedMesh(bamboo, new THREE.MeshLambertMaterial({ color: 0x7c7847 }), 34);
  const pose = new THREE.Object3D(); let n = 0;
  for (const side of [-1, 1]) {
    for (let j = 0; j < 15; j++) {
      const px = x + side * (4 + j * .5), pz = z + 5;
      pose.position.set(px, W.heightAt(px, pz) + .8, pz); pose.rotation.set(.2, 0, 0); pose.scale.set(.065, 1.8, .065); pose.updateMatrix(); fence.setMatrixAt(n++, pose.matrix);
    }
    for (const y of [.5, 1.2]) {
      const px = x + side * 7.5, pz = z + 5;
      pose.position.set(px, W.heightAt(px, pz) + y, pz); pose.rotation.set(0, 0, Math.PI / 2); pose.scale.set(.05, 7, .05); pose.updateMatrix(); fence.setMatrixAt(n++, pose.matrix);
    }
    rt.army.addStruct({ seg: [x + side * 4, z + 5, x + side * 11, z + 5], nx: 0, nz: 1, h: 1.8, hp: 1e9, team: 0, noTarget: true, wall: true, name: '夜討ちを防ぐ竹の柵' });
  }
  fence.castShadow = true; rt.scene.add(fence);
  // 築山は高さの関数で盛る。矢倉は城道の外側へ置く。
  rt.scene.add(yagura(W, last[0] + 11, last[1] - 5,
    soften ? { logFrame: true, height: 6.6, boarded: false } : {}));
}
// 竹束だけは近くで透かす。土の法面は深度を残し、下の空洞を見せない。
function mikiCoverMaterial(base, kind) {
  const mat = base.clone(), compile = base.onBeforeCompile;
  mat.transparent = kind === 'bamboo'; mat.depthWrite = kind !== 'bamboo';
  if (kind !== 'bamboo') mat.userData.camNearSolid = true;
  if (mat.emissive) { mat.emissive.setHex(0x514735); mat.emissiveIntensity = .12; }
  mat.onBeforeCompile = function (sh, renderer) {
    compile.call(this, sh, renderer);
    // 前の戦の切り抜きを、法面にも小屋の土台にも残さない。
    if (kind !== 'bamboo' && sh.uniforms.camNearFade) sh.uniforms.camNearFade = { value: 0 };
    sh.vertexShader = 'varying vec3 vMikiCover;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vMikiCover = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vMikiCover;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain = fract(sin(dot(floor(vMikiCover * 24.0), vec3(12.9, 78.2, 37.7))) * 43758.5);
      diffuseColor.rgb *= mix(0.88, 1.12, grain);
      ${kind === 'bamboo' ? `float joint = smoothstep(0.88, 0.98, fract(vMikiCover.y * 2.8));
      diffuseColor.rgb *= 1.0 - joint * 0.22;` : ''}
      ${kind === 'bamboo' ? 'diffuseColor.a *= mix(0.15, 1.0, smoothstep(1.5, 4.5, length(vMikiCover - cameraPosition)));' : ''}
    `);
    if (kind !== 'bamboo') {
      // 土の絵を掛けた後で道と同じ黄褐色へ寄せる。黒い別材の板に見せない。
      // 元の土粒・雨筋は残し、月や松明の明暗はこの後の照明で受ける。
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `
        float mikiSoilLight = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mikiDrySoil = vec3(0.46, 0.40, 0.30) * clamp(mikiSoilLight / 0.32, 0.65, 1.25);
        diffuseColor.rgb = mix(diffuseColor.rgb, mikiDrySoil, 0.55);
        #include <alphamap_fragment>
      `);
    }
  };
  mat.customProgramCacheKey = () => base.customProgramCacheKey() + '_miki_' + kind;
  return mat;
}
function mikiFinishBatch(rt, batch) {
  // 両面の草土の法面だけにかける。土の絵を貼る既存の処理も残す。
  for (const [mat, list] of Array.from(batch.byMat)) {
    if (!mat.vertexColors || mat.side !== THREE.DoubleSide) continue;
    batch.byMat.delete(mat); batch.byMat.set(mikiCoverMaterial(mat, 'earth'), list);
  }
  finalizeSimpleBatch(rt, batch);
}
// 三木の板葺きは風雨で灰色になった古板に茶褐色の差し替え板を混ぜる。
// 既存の頂点色だけで描き、瓦指定と低い画質の形は共通部品に任せる。
function mikiHut(W, x, z, w, d, rot, o) {
  // 束だけで支えた舞台にせず、低い側の土台下を地面へ閉じる。
  // 土を突き固めた裾の外形は復元。城道と建物の当たり・床高は変えない。
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const ground = (px, pz) => W.heightAt(x + px * cs + pz * sn, z - px * sn + pz * cs);
  let floor = W.heightAt(x, z);
  for (const px of [-w / 2, w / 2]) for (const pz of [-d / 2, d / 2]) floor = Math.max(floor, ground(px, pz));
  const pos = [], uv = [];
  const vertex = (px, py, pz) => {
    const wx = x + px * cs + pz * sn, wz = z - px * sn + pz * cs;
    pos.push(wx, py, wz); uv.push((Math.abs(px) >= w / 2 ? pz : px) * 2, py * 2);
  };
  for (const [ax, az, bx, bz] of [[-w/2,-d/2,w/2,-d/2], [w/2,-d/2,w/2,d/2],
    [w/2,d/2,-w/2,d/2], [-w/2,d/2,-w/2,-d/2]]) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let i = 0; i < n; i++) {
      const px = ax + (bx - ax) * i / n, pz = az + (bz - az) * i / n;
      const qx = ax + (bx - ax) * (i + 1) / n, qz = az + (bz - az) * (i + 1) / n;
      const a = ground(px, pz) - .12, b = ground(qx, qz) - .12, top = floor + .15;
      for (const v of [[px,top,pz], [qx,b,qz], [px,a,pz], [px,top,pz], [qx,top,qz], [qx,b,qz]]) vertex(...v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  const mat = W.mikiHutBaseMaterial || (W.mikiHutBaseMaterial = mikiCoverMaterial(new THREE.MeshLambertMaterial({
    color: 0x81735b, map: dirtTex(), side: THREE.DoubleSide,
  }), 'foundation'));
  mat.userData.camNearSolid = true;
  if (o.batch) pushSimpleBatch(o.batch, geo, mat);
  else W.scene.add(new THREE.Mesh(geo, mat));
  // 小屋の壁・妻・屋根を同じ扱いにする。近接透かしで梁だけを残さない。
  // 元の束へ戻すので描画の区画数は増やさず、材質の写しも木戸と共用する。
  const houseBatch = o.batch ? makeSimpleBatch() : null;
  const house = hut(W, x, z, w, d, rot,
    { ...o, ...(houseBatch ? { batch: houseBatch } : {}), boardRoof: true, weatheredBoards: true });
  if (houseBatch) for (const [source, list] of houseBatch.byMat) {
    const material = mikiWoodMaterial(W, source);
    for (const entry of list) pushSimpleBatch(o.batch, entry.geo, material, entry.part);
  }
  else if (house) mikiSolidWood(W, house);
  return house;
}
// 付城の番所・蔵も写真の低い横長の姿にする。敷地の長辺へ棟を通し、
// 元の南の庭へ長手の板戸を向ける。外周寸法・当たり・低い画質は保つ。
function mikiFortHut(W, x, z, w, d, rot, o) {
  if (w <= d) return mikiHut(W, x, z, w, d, rot, o);
  return mikiHut(W, x, z, d, w, rot - Math.PI / 2, { ...o, nagayaDoors: true });
}
function mikiWoodMaterial(W, source, nearFrame = false) {
  const k = mikiKido(W);
  const materials = nearFrame ? k.frameMaterials : k.gateMaterials;
  let mat = materials.get(source);
  if (!mat) {
    mat = source.clone();
    const compile = source.onBeforeCompile, key = source.customProgramCacheKey();
    mat.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      // 木戸だけは前の戦の透かしも止める。井楼は共有の視界確保へ従う。
      if (!nearFrame && shader.uniforms.camNearFade) shader.uniforms.camNearFade = { value: 0 };
      // 軒下を真っ黒な面にせず、土と空の弱い照り返しを板の色へ戻す。
      // 木目・頂点色を通した色を使い、朝には補いを半分にする。灯りは増やさない。
      shader.uniforms.mikiWoodNight = W.nightU;
      shader.fragmentShader = 'uniform float mikiWoodNight;\n' + shader.fragmentShader.replace(
        '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * mix(0.08, 0.16, mikiWoodNight);');
    };
    mat.customProgramCacheKey = () => key + (nearFrame ? '|miki-frame-near-fill' : '|miki-gate-solid-fill');
    mat.userData.camNearSolid = !nearFrame;
    materials.set(source, mat);
  }
  return mat;
}
function mikiSolidWood(W, root, frameOnly = false, allowNear = frameOnly) {
  // 建物の板は残す。門と井楼は近い木組みが視線を塞ぐ時だけ共通の透かしを許す。
  // 門と井楼の写しを分け、旗の布や他の戦の共有材質へ持ち越さない。
  root.traverse(mesh => {
    if (!mesh.isMesh || frameOnly && !mesh.userData.camBlock) return;
    mesh.material = mikiWoodMaterial(W, mesh.material, allowNear);
  });
}
function mikiLookout(rt, x, z, o) {
  const lookout = monomi(rt, x, z, o);
  mikiSolidWood(rt.world, lookout.mesh, true);
  return lookout;
}
function mikiGate(W, x, z, w) {
  // 板扉を内へ直角に開き、既存の門口と南北の通路を空ける。
  const k = mikiKido(W);
  const gate = kabukimon(W, x, z, w, 0, { doors: true, openFlat: true,
    groundedGate: true, slopeDoorBottom: true, roofBackingMaterial: k.backing });
  mikiSolidWood(W, gate, false, true);
  k.gates.push(new THREE.Vector3(x, W.heightAt(x, z) + 2.4, z + .9));
  for (const side of [-1, 1]) {
    // 兵の通り道は変えず、見通しだけ描いた本柱・控柱の寸法へ合わせる。
    const px = x + side * (w / 2 + .17), base = W.heightAt(x, z);
    k.sightPosts.push({ x: px, z, half: .2, bottom: W.heightAt(px, z) - .3, top: base + 3.5 });
    k.sightPosts.push({ x: px, z: z - 1.6, half: .12, bottom: W.heightAt(px, z - 1.6) - .2, top: base + 2.5 });
    const depth = w / 2 - .05;
    Object.assign(solidRect(x + side * (w / 2 - .02), z - .1 - depth / 2, .26, depth + .12),
      { missileH: 3, missileType: 'wood' });
    mikiFenceFire(W, x + side * (w / 2 + 1.3), z + 1.4, false);
  }
  return gate;
}
// 野地板の下面に垂木と木目を一枚だけ描き、全ての木戸で共有する。
function mikiKido(W) {
  if (W.mikiKido) return W.mikiKido;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#a78b62'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 32; i++) {
    g.fillStyle = i % 3 ? '#96805e' : '#baa17b';
    g.fillRect((i * 37) % 128, 0, 1, 128);
  }
  g.fillStyle = '#59422b'; g.fillRect(0, 0, 5, 128);
  g.fillStyle = '#705236'; g.fillRect(5, 0, 18, 128);
  g.fillStyle = '#c0a274'; g.fillRect(5, 0, 3, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  const backing = new THREE.MeshLambertMaterial({ map, emissive: 0x6c4c2a, emissiveIntensity: .12 });
  // 木戸の数だけ点光を増やさず、近い門の中央へ一つを付け替える。影の描き直しも増やさない。
  const light = fireGlow(0xffa252, 0, 10, 1);
  W.scene.add(light);
  return W.mikiKido = { backing, light, gateMaterials: new Map(), frameMaterials: new Map(), gates: [], sightPosts: [], fires: [], stands: [], timer: 0 };
}
function mikiFenceFire(W, x, z, torch = true) {
  // 開始時に本人の足元へ炎を重ねない。柵や通り道は動かさない。
  if ((x - miki.spawn.x) ** 2 + (z - miki.spawn.z) ** 2 < 9) return;
  const k = mikiKido(W), h = torch ? 1.8 : 1.25;
  const f = W.addFire(x, z, { torch, nightOnly: true, h, size: torch ? .28 : .45, smoke: false });
  // 高画質でも既存の炎の束へ入れ、何百本の松明を二回で描く。
  W.batchFireFlames(f.flame, f.inner);
  k.fires.push(f); k.stands.push([x, W.heightAt(x, z), z, h, torch]);
}
// 柵の実際に残った区間だけに十メートル間隔で置く。門口・道・川へは出さない。
function mikiFenceTorches(W, segments) {
  let next = 5;
  for (const [ax, az, bx, bz] of segments) {
    const len = Math.hypot(bx - ax, bz - az);
    for (; next < len; next += 10) {
      const x = ax + (bx - ax) * next / len, z = az + (bz - az) * next / len;
      if (!W.inWaterAt(x, z) && !crossesRoad([x - .15, z, x + .15, z])) mikiFenceFire(W, x, z);
    }
    next -= len;
  }
}
function mikiFireStands(rt) {
  const W = rt.world;
  const k = mikiKido(W), pose = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045, .055, 1, 6),
    new THREE.MeshLambertMaterial({ color: 0x94714a }), k.stands.length);
  for (let i = 0; i < k.stands.length; i++) {
    const [x, y, z, h] = k.stands[i];
    pose.position.set(x, y + h / 2 - .1, z); pose.scale.set(1, h + .2, 1);
    pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
  }
  W.scene.add(mesh); W.viewCull([mesh], 0, 100, false);
  // 棒の先から火だけを浮かせず、松明の燃える束と門前の篝籠を付ける。
  // 金物は一つの束へまとめ、昼も支えを残す。準備時だけ形を作る。
  const heads = makeSimpleBatch(), iron = new THREE.MeshLambertMaterial({ color: 0x302b24 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x493020 });
  for (const [x, y, z, h, torch] of k.stands) {
    if (torch) {
      const bundle = new THREE.CylinderGeometry(.085, .055, .3, 6);
      bundle.translate(x, y + h - .08, z); pushSimpleBatch(heads, bundle, wood);
    } else {
      // 底の受け皿と六本の籠目。炎の根元を囲み、上は開けておく。
      const base = new THREE.CylinderGeometry(.15, .12, .06, 6);
      base.translate(x, y + h - .22, z); pushSimpleBatch(heads, base, iron);
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3, bar = new THREE.CylinderGeometry(.012, .012, .27, 4);
        bar.rotateZ(-.4); bar.rotateY(-a);
        bar.translate(x + Math.cos(a) * .19, y + h - .08, z + Math.sin(a) * .19);
        pushSimpleBatch(heads, bar, iron);
      }
      const rim = new THREE.TorusGeometry(.24, .015, 3, 12);
      rim.rotateX(Math.PI / 2); rim.translate(x, y + h + .04, z); pushSimpleBatch(heads, rim, iron);
    }
  }
  finalizeSimpleBatch(rt, heads);
  // 夜間の共通更新が可視状態を戻した後、炎の束を詰める直前に距離で省く。
  const before = W.scene.onBeforeRender;
  W.scene.onBeforeRender = function (renderer, scene, camera, target) {
    const p = rt.player.u.pos;
    for (const f of k.fires) {
      const visible = f.lit && (f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 10000;
      f.flame.visible = f.inner.visible = visible;
    }
    before.call(this, renderer, scene, camera, target);
  };
}
function mikiKidoLight(rt, dt) {
  const W = rt.world, k = W.mikiKido;
  if (!k || (k.timer -= dt) > 0) return;
  k.timer = .5;
  const p = rt.player.u.pos;
  let nearest = null, distance = 10000;
  for (const gate of k.gates) {
    const d = (gate.x - p.x) ** 2 + (gate.z - p.z) ** 2;
    if (d < distance) { nearest = gate; distance = d; }
  }
  if (nearest) k.light.position.copy(nearest);
  k.light.intensity = nearest ? 5 * Math.max(W.nightAmount(), W.duskAmount()) : 0;
}
// 曲輪の両脇に屋敷と蔵をまとめる。平山城の既存の段を使い、空堀と城道には建てない。
// 配置・屋敷の外形は推定。板葺きの低い長屋を結合し、兵の数や毎コマの処理は増やさない。
function mikiResidences(rt, q, batch) {
  const W = rt.world;
  for (const side of [-1, 1]) {
    const x = MIKI.x + q.dx + side * q.cw * .26, z = MIKI.z + q.dz - q.cd * .2;
    const corners = [[x-13,z-5],[x+13,z-5],[x+13,z+19],[x-13,z+19]];
    const y = W.heightAt(x, z);
    if (corners.some(([px,pz], i) => Math.abs(W.heightAt(px,pz)-y) > .7 ||
      crossesRoad([px,pz,...corners[(i+1)%4]]))) continue;
    // 高画質の長屋は短辺を屋根の勾配に使う。外周の十八×七は保ち、棟を長手へ通す。
    // 妻の戸口は東の庭へ向く。旧形の棟高約七から約四・六へ下がる。
    const high = true;
    mikiHut(W, x, z, high ? 7 : 18, high ? 18 : 7, high ? Math.PI / 2 : 0,
      { ita: true, h: 2.8, wall: 0x786956, batch });
    mikiHut(W, x - 8, z + 11, 7, 5, 0, { ita: true, h: 2.3, wall: 0x665844, batch });
    // 屋敷前の板塀は中央を開け、戸口から曲輪の広場へ出られる。
    for (const [a,b] of [[-13,-3],[3,13]]) {
      for (const wall of wallLine(rt, [[x+a,z+18],[x+b,z+18]], {
        team: 1, hp: 1e9, name: '屋敷の板塀', h: 2.2, mesh: castleBoardFence,
        meshOpt: { h: 2.2, boardCap: high, plainBoards: high, batch }, segLen: 10,
      })) { wall.noTarget = true; wall.wall = true; }
    }
    if (high) {
      // 写真の屋敷は主屋と小さな蔵が庭を囲む。東の蔵は戸を北へ向け、
      // 主屋の東妻から南の六歩の門口へ抜ける庭の中央を空ける。
      // 十棟までの低い板蔵を既存の束へ結合する。位置と外形は推定。
      mikiHut(W, x + 8, z + 11, 4, 5, Math.PI,
        { ita: true, h: 2.2, wall: 0x71614e, batch });
      // 写真の屋敷構えのように、庭の脇と背にも低い柵を回す。
      // 正面の六歩の口と東妻の戸口は空ける。塀と当たりは同じ線でまとめる。
      for (const edge of [[[x-13,z+18],[x-13,z-5]], [[x-13,z-5],[x+13,z-5]],
        [[x+13,z-5],[x+13,z+18]]]) {
        for (const wall of wallLine(rt, edge, {
          team: 1, hp: 1e9, name: '屋敷囲いの柵', h: 1.5, mesh: palisade,
          meshOpt: { h: 1.5, batch }, segLen: 12,
        })) { wall.noTarget = true; wall.wall = true; }
      }
    }
    // 別所の紋は未確認なので、従来の丸の代用旗を曲輪ごとにそろえる。
    // 蔵の軒を貫かず、門脇の塀の内へ寄せる。
    rt.scene.add(nobori(W, x + 10, z + (high ? 15 : 10), 'maru', 5));
  }
}
// 城外の既存の持ち場を保ち、東・南・西にも囲みを巡らす。個々の位置は遊びの復元。
const OUTER_CHAIN = [TSUKESHIRO_CHAIN[4], [650, 420], [620, 700], [280, 715], [-100, 600], [-150, 340], TSUKESHIRO_CHAIN[0]];
const MIKI_FORTS = [...BASE_FORTS, ...OUTER_CHAIN.slice(1, -1).map(([x, z]) => ({ x, z, r: 13 }))];
// 遠い遮断線は二つの形・一つの材質でまとめる。兵・壊せる建物・毎コマの判定を増やさない。
function outerFence(rt) {
  const W = rt.world, spans = [];
  let postCount = 0;
  for (let i = 1; i < OUTER_CHAIN.length; i++) {
    const [ax, az] = OUTER_CHAIN[i - 1], [bx, bz] = OUTER_CHAIN[i];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 12);
    for (let j = 0; j < n; j++) {
      const seg = [ax + (bx - ax) * j / n, az + (bz - az) * j / n,
        ax + (bx - ax) * (j + 1) / n, az + (bz - az) * (j + 1) / n];
      if (crossesRoad(seg) || W.inWaterAt((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2)) continue;
      const count = Math.ceil(Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) / 1.5);
      spans.push({ seg, count }); postCount += count + 1;
    }
  }
  const material = new THREE.MeshLambertMaterial({ color: 0x75634c });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .12, 2.3, 5), material, postCount);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .14, .14), material, spans.length * 2);
  const dummy = new THREE.Object3D();
  let pi = 0, ri = 0;
  for (const { seg: [ax, az, bx, bz], count } of spans) {
    const ay = W.heightAt(ax, az), by = W.heightAt(bx, bz), dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    for (let j = 0; j <= count; j++) {
      const x = ax + dx * j / count, z = az + dz * j / count;
      dummy.position.set(x, W.heightAt(x, z) + 1.05, z); dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix);
    }
    dummy.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(by - ay, len));
    dummy.scale.set(Math.hypot(len, by - ay), 1, 1);
    for (const h of [.7, 1.6]) {
      dummy.position.set((ax + bx) / 2, (ay + by) / 2 + h, (az + bz) / 2);
      dummy.updateMatrix(); rails.setMatrixAt(ri++, dummy.matrix);
    }
    Object.assign(solidSeg(ax, az, bx, bz, .15), { missileH: 2.3, missileType: 'wood' });
  }
  posts.castShadow = rails.castShadow = true;
  posts.computeBoundingSphere(); rails.computeBoundingSphere();
  rt.scene.add(posts, rails);
  W.viewCull([posts], 0); W.viewCull([rails], 0);
  mikiFenceTorches(W, spans.map(s => s.seg));
}
// 三木の使番だけを着せ替える。共通の姿・共有された形は書き換えない。
function mikiHoro(rt) {
  const vertices = [], indices = [], bones = [];
  const segments = 24, rows = 6;
  const radius = t => 0.035 + 0.095 * Math.sin(t * Math.PI * 0.8);
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      // 六つのひだ。下の口は閉じず、後ろへ流れる布の裾にする。
      const r = radius(t) * (1 + 0.08 * Math.cos(a * 6));
      vertices.push(Math.sin(a) * r, -0.30 * t + 0.008 * t * t * Math.sin(a * 3),
        Math.cos(a) * r * 0.65 - 0.035 * t);
      if (j < rows && i < segments) {
        const n = j * (segments + 1) + i;
        indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1);
      }
    }
  }
  // 布の表に沿う竹の縦骨と二つの輪。裾から骨が見える。
  const point = (a, t) => [Math.sin(a) * (radius(t) * 1.08 + 0.003), -0.30 * t,
    Math.cos(a) * (radius(t) * 1.08 + 0.003) * 0.65 - 0.035 * t];
  for (const t of [0.35, 0.9]) for (let i = 0; i < segments; i++)
    bones.push(...point(i / segments * Math.PI * 2, t), ...point((i + 1) / segments * Math.PI * 2, t));
  for (let i = 0; i < 6; i++) for (let j = 0; j < rows; j++)
    bones.push(...point(i / 6 * Math.PI * 2, j / rows), ...point(i / 6 * Math.PI * 2, (j + 1) / rows));
  // 肩から留める緒。白い布を背に直接突き刺さない。
  for (const side of [-1, 1]) bones.push(side * 0.14, 0.015, 0.14, side * 0.03, 0, 0);
  const clothGeometry = new THREE.BufferGeometry();
  clothGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  clothGeometry.setIndex(indices); clothGeometry.computeVertexNormals();
  const frameGeometry = new THREE.BufferGeometry();
  frameGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bones, 3));
  const frameMaterial = new THREE.LineBasicMaterial({ color: 0x8a7047 });
  rt.flags.horoCloths = [];
  for (const c of rt.couriers) {
    const look = { ...c.u.look, horo: 0 }, key = lookKey(look);
    // 近く用と遠く用の両方から旧い袋を除く。頭・手足・馬・旗はそのまま。
    lodSwap(c.u.body, bodyGeometry(key, look, true, 'nohead'), bodyGeometry(key, look, false, 'nohead'));
    c.u.body.userData.lookKey = key;
    const group = new THREE.Group(); group.position.set(0, 1.46, -0.36);
    const cloth = new THREE.Mesh(clothGeometry, new THREE.MeshLambertMaterial({ color: c.u.look.horo, side: THREE.DoubleSide }));
    cloth.castShadow = true;
    group.add(cloth, new THREE.LineSegments(frameGeometry, frameMaterial));
    c.u.body.add(group); rt.flags.horoCloths.push(cloth);
  }
}
const HIRATA = { x: -80, z: -64, r: 14 };
const OMURA = { x: -64, z: -118, r: 22 };
const BATTLE_LIMIT = 390;
// 搬入を止める間の持ち場。遠景の城域まで一人で走り抜けさせない。
const CONVOY_BOUNDS = { minX: -155, maxX: 35, minZ: -160, maxZ: 10, pushBack: 2 };
const HONJIN = { x: MIKI.x + MIKI_JO.honmaru.dx + MIKI_HONJIN_OFFSET.dx,
  z: MIKI.z + MIKI_JO.honmaru.dz + MIKI_HONJIN_OFFSET.dz };
const GATE = { x: HIRATA.x, z: HIRATA.z + HIRATA.r + 6 };
const CASTLE_ROAD = MIKI_ROAD.map(([x, z]) => [MIKI.x + x, MIKI.z + z]);
const LANE = [[-190, -82], [-130, -74], [-104, -44], [-30, -40], [10, -26], [50, -8], [70, 10]];
const SALLY_PATH = [[10, -26], [10, -40], [-30, -40], [GATE.x + 8, GATE.z]];
const RESERVE_PATH = [[-80, -100], [-94, -78], [-100, -64], [-94, -50], [GATE.x - 8, GATE.z]];
const OMURA_TURNS = [{ x: -104, z: -48 }, { x: -100, z: -64 }, { x: -94, z: -78 }, { x: -80, z: -84 }, { x: OMURA.x, z: OMURA.z + 8 }];
// 城下は既存の西麓、百姓は北西の刈田側。民の人数・在所・避難路は推定復元。
// 雲龍寺と別所氏の関わり：https://www.city.miki.lg.jp/soshiki/83/2955.html
// 当時の堂の姿は確定しないため、西麓の寺の避難所を小さな仮小屋で表す。
const PEOPLE_VILLAGE = { x: -202, z: -112 };
const PEOPLE_TEMPLE = { x: -62, z: 230 };
const PEOPLE_TOWN = { x: MIKI.x + MIKI_JO.jokamachi.dx, z: MIKI.z + MIKI_JO.jokamachi.dz };
const PEOPLE_ROUTES = {
  village: [{ x: -194, z: -132 }, { x: -218, z: -158 }, { x: -232, z: -192 }],
  fields: [{ x: -130, z: -184 }, { x: -186, z: -202 }, { x: -232, z: -214 }],
  town: [{ x: -110, z: 250 }, { x: -120, z: 286 }, { x: -112, z: 310 }],
  temple: [{ x: -68, z: 235 }, { x: -72, z: 245 }, { x: -110, z: 250 }, { x: -120, z: 286 }, { x: -112, z: 310 }],
};
const PEOPLE_BANDS = [
  { x: -183, z: -120, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: PEOPLE_ROUTES.village },
  { x: -130, z: -153, kinds: ['farmer', 'woman', 'child', 'farmer'], route: PEOPLE_ROUTES.fields },
  { x: PEOPLE_TOWN.x + 2, z: PEOPLE_TOWN.z - 25, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder', 'townsman'], route: PEOPLE_ROUTES.town, routeEnd: 'wait' },
  { x: PEOPLE_TEMPLE.x - 2, z: PEOPLE_TEMPLE.z - 11, kinds: ['monk', 'monk', 'woman', 'child'], route: PEOPLE_ROUTES.temple, routeEnd: 'wait' },
];
// 木の当たりで避難路を塞がない。形と材質は共通の民の仕組みを使い回す。
function peopleClear(x, z) {
  if (Math.hypot(x - PEOPLE_VILLAGE.x, z - PEOPLE_VILLAGE.z) < 28 ||
      Math.hypot(x - PEOPLE_TEMPLE.x, z - PEOPLE_TEMPLE.z) < 18 ||
      Math.hypot(x - PEOPLE_TOWN.x, z - PEOPLE_TOWN.z) < 34) return true;
  for (const g of PEOPLE_BANDS) {
    let ax = g.x, az = g.z;
    for (const p of g.route) {
      if (lineDistance(x, z, ax, az, p.x, p.z) < 4) return true;
      ax = p.x; az = p.z;
    }
  }
  return false;
}
const MERIT_HINT = '俵を押さえれば戦功が増す。槍組と平田を守り、大村で寄せ手を退けよ。';
// 柵の外を北西から南の口へ回る足場。遮断線との間に歩ける幅を残す。
const HIRATA_PATH = [[-80, -84], [-94, -78], [-100, -64], [-94, -50], [-80, -44]];
const HIRATA_TURNS = HIRATA_PATH.map(([x, z]) => ({ x, z }));
// 開始位置から南の合流口へ。荷駄道から外れていた足元も同じ坂でつなぐ。
const ASSEMBLY_PATH = [[-40, -48], [-60, -44], [-82, -44], [-104, -48]];
const ASSEMBLY_TURNS = ASSEMBLY_PATH.map(([x, z]) => ({ x, z }));
const INNER_ROADS = MIKI_BRANCHES.map(pts => pts.map(([x, z]) => [x + MIKI.x, z + MIKI.z]));
const FORT_ROADS = MIKI_FORTS.map(q => [[q.x, q.z + 24], [q.x, q.z + 13], [q.x, q.z + 5], [q.x - 6, q.z + 5], [q.x - 6, q.z + 3]]);
// 南の木戸から城の北側へ出て、川の東端を回り、従来の下知・荷駄道へつなぐ。
// 城の曲輪と堀、川の深い所を横切らず、戦う場所の合流口は動かさない。
const HONJIN_PATH = [[HONJIN.x, HONJIN.z], [HONJIN.x, HONJIN.z + 28], [HONJIN.x, 50],
  [540, 50], [540, -65], [260, -100], [120, -120], [20, -110], [-28, -60]];
const HONJIN_ROOM = [[HONJIN.x, HONJIN.z + 8], [HONJIN.x - 10, HONJIN.z + 8], [HONJIN.x - 10, HONJIN.z - 1]];
// 井楼の梯子と蔵の前まで、主殿を避けて平場の内側を通す。
const SERVICE_ROADS = MIKI_KURUWA.flatMap(q => {
  const x = MIKI.x + q.dx, z = MIKI.z + q.dz, left = x - q.cw / 2 + 20;
  return [[[x + 7, z + q.cd / 2 - 20], [left, z + q.cd / 2 - 20], [left, z - q.cd / 2 + 25], [left - 5, z - q.cd / 2 + 17.9]],
    [[x + 7, z + q.cd / 2 - 20], [x + q.cw / 2 - 20, z + q.cd / 2 - 20], [x + q.cw / 2 - 20, z - q.cd / 2 + 25], [x + q.cw / 2 - 15, z - q.cd / 2 + 18]],
    [[left, z + q.cd / 2 - 20], [x - q.cw / 2 + 16, z + q.cd / 2 - 12]]];
});
const SHIYORI = [[-8, -88], [8, -80], [-2, -68], [16, -60], [8, -50]];
const SHIYORI_CUT = horiboriHeight(SHIYORI, { depth: .65, width: 4 });
const ROADS = [LANE, CASTLE_ROAD, SALLY_PATH, HIRATA_PATH, ASSEMBLY_PATH, ...INNER_ROADS, ...FORT_ROADS, HONJIN_PATH, HONJIN_ROOM, [[-80, -54], [-85, -58], [-85, -65]], SHIYORI, ...SERVICE_ROADS];
const DITCHES = MIKI_HORI.map(pts => horiboriHeight(pts.map(([x, z]) => [x + MIKI.x, z + MIKI.z]), { depth: 2.4, width: 5 }));
const ODA = { flag: 'oda' }, BESSHO = { flag: 'maru', armor: 0x35382c, lace: 0x6b6a4a }, MORI = { flag: 'mori' };
// 原点を移したため、旧原点の標高素材を混ぜない。古図との照合は調査表に残す。
const HARVEST_FIELDS = [[-158, -90, 36, 28], [-48, -110, 32, 28], [-122, -122, 28, 24]];
function fieldEdge(x, z) {
  let edge = -Infinity;
  for (const [cx, cz, w, d] of HARVEST_FIELDS) edge = Math.max(edge, Math.min(w / 2 - Math.abs(x - cx), d / 2 - Math.abs(z - cz)));
  return edge;
}
function fieldBank(x, z) {
  const edge = fieldEdge(x, z);
  return Math.max(0, Math.min(1, edge / .5, (2 - edge) / .5));
}
// 幅三メートルの土手を約十一メートル間隔の地形へ載せると、
// 拾われた頂点だけが持ち上がり、門の外に大きな三角の突起ができる。
// 柵の根元は既存の細かい土塁で盛り、道・曲輪・空堀の高さはそのまま使う。
function height(x, z) { return heightBase(x, z) + SHIYORI_CUT(x, z) + .25 * fieldBank(x, z) * (1 - roadBlend(x, z)); }
function castleBlend(x, z) {
  const q = MIKI_JO.sotogamae;
  const r = Math.hypot((x - MIKI.x - q.dx) / (q.w / 2), (z - MIKI.z - q.dz) / (q.d / 2));
  return Math.max(0, Math.min(1, (1.04 - r) / 0.04));
}
function rawTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 三木城の台地（南東）、平井山（北東の本陣）、大村坂の丘
  h += 16 * gauss(x, z, MIKI.x, MIKI.z, 5000) + 18 * gauss(x, z, HONJIN.x, HONJIN.z, 3000) + 10 * gauss(x, z, OMURA.x + 20, OMURA.z - 20, 1600);
  // 北・東・西は切岸、南へ続く台地は尾根道で登る。石垣や天守は置かない。
  const k = castleBlend(x, z);
  h += (22 - (z - MIKI.z) * 0.009 - h) * k;
  // 平田の推定の盛り土。約十一歩の格子で五歩の肩を拾うと一本だけ尖るため、
  // 低い盛り土と十二歩の丸い肩へ緩める。柵・木戸・道の位置は保つ。
  const hirataShoulder = Math.max(0, Math.min(1, (HIRATA.r + 10 - Math.hypot(x - HIRATA.x, z - HIRATA.z)) / 12));
  h += 1.5 * hirataShoulder * hirataShoulder * (3 - 2 * hirataShoulder);
  h += 2.4 * gauss(x, z, 19, -55, 36); // 仕寄り先の築山。位置と断面は復元。
  // 狭い堀も一頂点だけの深い切れ込みにしない。深さ・中心線・南の土橋は保つ。
  if (!(z > HIRATA.z && Math.abs(x - HIRATA.x) < 7)) h -= 1.2 * Math.max(0, 1 - Math.abs(Math.hypot(x - HIRATA.x, z - HIRATA.z) - HIRATA.r - 4) / 5);
  // 美嚢川の谷。旧河道と浅瀬の位置は未確定なので縮尺の復元。
  const rz = -32 + 9 * Math.exp(-((x - 90) ** 2) / 9000);
  h -= 5 * Math.exp(-((z - rz) ** 2) / 130);
  return h;
}
// 五曲輪の平場と急な土の法面。三木は平山城なので山城の盛り上げを加えない。
const FORT_LEVELS = MIKI_FORTS.map(q => rawTerrain(q.x, q.z) + 1.8);
const HONJIN_LEVEL = rawTerrain(HONJIN.x, HONJIN.z);
function terrainHeight(x, z) {
  let h = rawTerrain(x, z), best = 0, level = h;
  for (const q of MIKI_KURUWA) {
    const d = Math.max(Math.abs(x - MIKI.x - q.dx) - q.cw / 2, Math.abs(z - MIKI.z - q.dz) - q.cd / 2);
    const k = Math.max(0, Math.min(1, 1 - d / 3.5));
    if (k > best) { best = k; level = q.level; }
  }
  h += (level - h) * best;
  for (let i = 0; i < MIKI_FORTS.length; i++) {
    const q = MIKI_FORTS[i], d = Math.hypot(x - q.x, z - q.z);
    const k = Math.max(0, Math.min(1, (q.r + 4 - d) / 4));
    h += (FORT_LEVELS[i] - h) * k;
    // 付城の外の浅い空堀。南の土橋を残す（位置・断面は推定）。
    if (!(z > q.z && Math.abs(x - q.x) < 5)) h -= 1.6 * Math.max(0, 1 - Math.abs(d - q.r - 4) / 2.2);
  }
  // 恒久化した平井山本陣の平場と空堀。断面は推定、南の木戸と下知の道は土橋でつなぐ。
  const hx = x - HONJIN.x, hz = z - HONJIN.z, hr = Math.hypot(hx, hz);
  h += (HONJIN_LEVEL - h) * Math.max(0, Math.min(1, (22 - hr) / 4));
  if (!(hz > 0 && Math.abs(hx) < 7)) h -= 2 * Math.max(0, 1 - Math.abs(hr - 26) / 3);
  for (const dip of DITCHES) h += dip(x, z);
  return h;
}
// 道の端の高さは最初にだけ作る。毎コマ配列や物を作らず、道幅の中を緩い坂にする。
const ROAD_HEIGHTS = ROADS.map((pts) => pts.map(([x, z]) => terrainHeight(x, z)));
// 曲輪の南の踊り場を同じ床高にそろえる。短い門前だけで六メートル登る坂を作らない。
for (let i = 0; i < MIKI_KURUWA.length; i++) for (let j = 1; j < ROAD_HEIGHTS[5 + i].length; j++) ROAD_HEIGHTS[5 + i][j] = MIKI_KURUWA[i].level;
function roadBlend(x, z) { return roadHeight(x, z, 0, true); }
function roadHeight(x, z, base, weightOnly = false) {
  let best = 0, sum = 0, weight = 0;
  for (let j = 0; j < ROADS.length; j++) {
    const pts = ROADS[j];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      const half = j >= ROADS.length - SERVICE_ROADS.length || j >= 5 && j < 5 + INNER_ROADS.length + FORT_ROADS.length ? 3 : 7;
      const k = Math.max(0, Math.min(1, (half - d) / 1.5));
      best = Math.max(best, k);
      if (!weightOnly && d < half) {
        // 曲がり角・合流では近い道の高さを混ぜ、道幅内に段差を作らない。
        const w = (half - d) * (half - d);
        sum += (ROAD_HEIGHTS[j][i - 1] * (1 - t) + ROAD_HEIGHTS[j][i] * t) * w;
        weight += w;
      }
    }
  }
  return weightOnly ? best : weight > 0 ? base + (sum / weight - base) * best : base;
}
function heightBase(x, z) { return roadHeight(x, z, terrainHeight(x, z)); }

function lineDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
// 中点が道の外でも、柵の端は道へ突き出す。準備時に線全体と道幅を比べる。
function crossesRoad(seg) {
  const [ax, az, bx, bz] = seg, dx = bx - ax, dz = bz - az;
  for (const pts of ROADS) for (let i = 1; i < pts.length; i++) {
    const [cx, cz] = pts[i - 1], [ex, ez] = pts[i];
    const rx = ex - cx, rz = ez - cz, det = dx * rz - dz * rx;
    if (Math.abs(det) > 1e-8) {
      const t = ((cx - ax) * rz - (cz - az) * rx) / det;
      const s = ((cx - ax) * dz - (cz - az) * dx) / det;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return true;
    }
    // 道の幅に、土塁の半幅と徒歩・馬の体の幅を加える。
    if (Math.min(lineDistance(ax, az, cx, cz, ex, ez), lineDistance(bx, bz, cx, cz, ex, ez),
      lineDistance(cx, cz, ax, az, bx, bz), lineDistance(ex, ez, ax, az, bx, bz)) < 8.7) return true;
  }
  return false;
}

// 平田の柵は南だけが開く。射手の前の持ち場へも、柵を横切らず口へ回る。
function hirataWay(army, u, want) {
  const x = u.pos.x - HIRATA.x, z = u.pos.z - HIRATA.z;
  const gx = want.x - HIRATA.x, gz = want.z - HIRATA.z;
  const r = Math.hypot(x, z), gr = Math.hypot(gx, gz);
  // 柵の内側の一メートルを外と扱うと、外向きに柵へ押し付け続ける。
  const inside = r < HIRATA.r, goalInside = gr < HIRATA.r;
  if (inside && goalInside) return want;
  const dx = gx - x, dz = gz - z;
  const t = Math.max(0, Math.min(1, -(x * dx + z * dz) / (dx * dx + dz * dz || 1)));
  if (!inside && !goalInside && Math.hypot(x + dx * t, z + dz * t) > HIRATA.r + 2) return want;
  const q = u._hirataWay || (u._hirataWay = { x: 0, z: 0 });
  if (inside) {
    // 内側から斜めに口の外を目指すと柵を横切る。まず口の内側へ寄る。
    q.x = HIRATA.x;
    q.z = HIRATA.z + (Math.abs(x) > 1.2 || z < HIRATA.r - 4.2 ? HIRATA.r - 3 : HIRATA.r + 5);
    return q;
  }
  const a = Math.atan2(x, z);
  if (goalInside && Math.abs(a) < 0.18) return want;
  const goal = goalInside ? 0 : Math.atan2(gx, gz);
  const turn = ((goal - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  // まず柵から離す。短い弧の弦でも柵に触れない余白を取る。
  const next = r < HIRATA.r + 3 ? a : a + Math.max(-0.45, Math.min(0.45, turn));
  q.x = HIRATA.x + Math.sin(next) * (HIRATA.r + 5);
  q.z = HIRATA.z + Math.cos(next) * (HIRATA.r + 5);
  return q;
}

// 一戦の目安は両軍の備え表で統一。城内の者と搬入側の兵を分ける。
// 全体の総数・各備の内訳は史料で確定しない。撃破一人を数十人へ換算しない。
const JIN = [
  rosterPlan('羽柴の囲み', 0, HONJIN, Math.PI, [
    ['honjin', '本陣の備え', '羽柴秀吉の陣（留守役は不明）', 5000, HONJIN.x, HONJIN.z, 'oda', 'oda', 100, { w: 20, d: 14 }],
    ['hide', '大村への手', '羽柴秀吉', 10400, -28, -60, 'oda', 'oda', 0, { bind: 'hide' }],
    ['hirata', '平田の持ち場', '谷大膳（谷衛好）の手', 200, HIRATA.x, HIRATA.z, 'oda', 'oda', 0, { bind: 'hirata' }],
    ['west', '西の付城', '羽柴の配下（名は不明）', 150, -160, -140, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['south', '南西の付城', '羽柴の配下（名は不明）', 150, -100, 90, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['north', '北の付城', '羽柴の配下（名は不明）', 150, 20, -110, 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['east', '東の付城', '羽柴の配下（名は不明）', 150, TSUKESHIRO_CHAIN[4][0], TSUKESHIRO_CHAIN[4][1], 'oda', 'oda', 60, { w: 8, d: 6 }],
    ['reserve', '本陣の後備え', '羽柴の配下（名は不明）', 2000, HONJIN.x + 34, HONJIN.z + 20, 'oda', 'oda', 100],
    ['road', '道を押さえる手', '羽柴の配下（名は不明）', 1800, -126, -26, 'oda', 'oda', 100, { facing: -Math.PI / 2 }],
  ], '総勢二万は復元の目安。秀長の当日の留守役は確定しない'),
  rosterPlan('城の守りと搬入の手', 1, MIKI, Math.PI, [
    ['nagaharu', '本陣', '別所長治', 1000, MIKI.x + MIKI_JO.honmaru.dx, MIKI.z + MIKI_JO.honmaru.dz, 'maru', 'maru', 0, { bind: 'ehon' }],
    ['ni', '二の丸', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.ninomaru.dx, MIKI.z + MIKI_JO.ninomaru.dz, 'maru', 'maru', 40, { w: 6, d: 4 }],
    ['shinjo', '新城', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.shinjo.dx, MIKI.z + MIKI_JO.shinjo.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['takao', '鷹尾山城', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.takao.dx, MIKI.z + MIKI_JO.takao.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['miyanoue', '宮ノ上要害', '別所の配下（名は不明）', 700, MIKI.x + MIKI_JO.miyanoue.dx, MIKI.z + MIKI_JO.miyanoue.dz, 'maru', 'maru', 50, { w: 6, d: 4 }],
    ['sally', '城からの出撃', '別所の配下（名は不明）', 1700, -30, -48, 'maru', 'maru', 0, { bind: 'sally' }],
    ['supply', '兵糧隊の護衛', '搬入側の将（名は不明）', 2000, -154, -82, 'mori', 'mori', 0, { bind: 'escort' }],
  ], '城方五千五百と搬入側二千、合計七千五百は復元の目安。荷を担ぐ者は含めない'),
];
function move(g, x, z, then = 'hold') {
  if (gone(g)) return;
  g.order = 'move'; g.dest = { x, z }; g.march = false;
  g.onArrive = (q) => { q.order = then; q.onArrive = null; };
}
function flee(g, x, z) {
  g.routed = true; g.order = 'flee'; g.fleeDir.x = x; g.fleeDir.z = z;
  for (const u of g.units) { u.fleeing = true; u.target = null; }
}
// 前の兵が敵に触れたら戦う下知へ移す。後列全員の整列を待って棒立ちにしない。
function pressFront(rt, g, at, reach = 8) {
  if (gone(g)) return;
  let front = null;
  for (const u of g.units) {
    if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
    if (Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 14) { front = u; break; }
  }
  if (!front) {
    g.focus = null;
    // 打ち合いで持ち場から離れた隊だけを戻す。浅瀬・柵の回り道の下知は保つ。
    if (g.order === 'attack') {
      for (const u of g.units) { u.target = null; u.watch = null; }
      move(g, at.x, at.z, 'hold');
    }
    return;
  }
  let foe = null, best = Infinity;
  for (const u of rt.army.units) {
    if (u.team === g.team || u.isStruct || !u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
    // 一人を追って城兵も味方も野へ流れ出ない。押し合うのは持ち場の周りだけ。
    if (Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 24) continue;
    // 味方と同じ間合いまで歩いてから槍列へ移る。遠くの敵を見ただけで
    // 浅瀬からの行軍を打ち切ると、木戸の手前で列が止まってしまう。
    const d = Math.hypot(u.pos.x - front.pos.x, u.pos.z - front.pos.z);
    if (d >= reach || rt.army.wallBetween(front.pos, g.team, u.pos) ||
      !weatherSees(rt.world, front.pos, u.pos) || rt.army.terrainBlocks(front.pos, u.pos)) continue;
    // 目の前の敵から受ける。遊ぶ本人だけを遠くから優先して取り囲まない。
    const score = d;
    if (score < best) { foe = u; best = score; }
  }
  if (!foe) {
    g.focus = null;
    if (g.order === 'attack') {
      g.order = 'hold';
      for (const u of g.units) { u.target = null; u.watch = null; }
    }
    return;
  }
  g.order = 'attack'; g.march = false; g.dest = null; g.onArrive = null;
  // 接敵は隊への合図だけ。一人を全員の目標にすると後列まで列を離れ、同じ所へ団子になる。
  // 共通の索敵に任せ、前列は近い敵、後列は手の届く敵を受ける。
  g.formation = 'yari'; g.seekRange = reach; g.focus = null;
}
// 着いた持ち場の大きな札は畳む。離れた時は同じ印へ戻れる。
function placeLabel(rt, at, text, radius = 6) {
  const p = rt.player.u.pos;
  return Math.hypot(p.x - at.x, p.z - at.z) < radius ? '' : text;
}
// 守る兵を川へよけさせない。すでに水中なら、岸へ向けて浅くなる道だけ残す。
function mikiGuidePointAllowed(rt, point) {
  const W = rt.world, p = rt.player.u.pos;
  const depth = W.waterDepthAt(point.x, point.z);
  return depth <= .02 || depth < W.waterDepthAt(p.x, p.z);
}
const miki = {
  jinkei: JIN, noWake: true, noTaishoRaid: true, noDistantBattle: true,
  introTaskFirst: true, compactIntro: true, compactRescueGuide: true, compactGuardGuide: true,
  introPeopleFolded: true, // 人物と砦の説明は、下知を読んでから開ける。
  compactCombatGuides: true, // 敵へ向ける矢印を細く短くし、槍と胴を覆わない。
  // 実旗の頭上へ囲み・矢印・別の旗を重ねず、合流先の足元へ小さく示す。
  groundFlagGuides: true, footFlagGuides: true, compactFlagGuide: true, compactHoldGuide: true,
  // 曲がり角は実物の隊旗ではない。画面外も短い矢印で示す。
  routeGuideArrowOnly: true, directionalDestinationArrow: true,
  goalFlagScale: .55,
  destinationPointerScale: .55, // 見切れた行き先の補助旗にも同じ縮尺を使う。
  // 描画前の骨の古い位置を混ぜず、今の足元と背丈で相手を示す。
  positionPersonGuide: true, bodyHeightGuides: true, enemyCornerSign: true,
  enemySignOnly: true, enemyFootRingRadius: .4,
  // 囲みを測る入口にも指定する。描画待ちの骨と今の足元を混ぜない。
  positionFrameGuides: true,
  // 出陣直後は足元だけを示し、敵へ寄る時も大きな札を重ねない。
  openingFootSignOnly: true, compactApproachGuide: true,
  // 木戸の柱の向こうへ敵の印を出さない。共通の見通しから呼ばれる。
  sightBlocked(rt, a, p, ay, by) {
    const posts = rt.world.mikiKido?.sightPosts;
    if (!posts) return false;
    const dx = p.x - a.x, dz = p.z - a.z, dy = by - ay;
    for (const post of posts) {
      let low = .001, high = .999;
      if (Math.abs(dx) < .00001) { if (Math.abs(a.x - post.x) > post.half) continue; }
      else {
        const t0 = (post.x - post.half - a.x) / dx, t1 = (post.x + post.half - a.x) / dx;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      }
      if (Math.abs(dz) < .00001) { if (Math.abs(a.z - post.z) > post.half) continue; }
      else {
        const t0 = (post.z - post.half - a.z) / dz, t1 = (post.z + post.half - a.z) / dz;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      }
      if (Math.abs(dy) < .00001) { if (ay < post.bottom || ay > post.top) continue; }
      else {
        const t0 = (post.bottom - ay) / dy, t1 = (post.top - ay) / dy;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      }
      if (low <= high) return true;
    }
    return false;
  },
  keepCombatTask: true, keepCombatTaskDetail: true,
  keepCombatTaskHeading: true, // 接敵中も、護衛を退ける目的と味方の人数を残す。
  keepTaskPanel: true, keepApproachTaskPanel: true, // 接敵や移動でも下知は同じ欄に残す。
  taskLabelMinFont: 16, // 横持ちの十六画素を共通処理で二十画素へ戻し、末尾一字を折り返さない。
  keepOpeningTaskLabel: true,
  // 敵一人の手ほどきで、木戸の守りや味方へ戻る下知を消さない。
  keepTaskLabel: true, keepGuardTaskLabel: true, keepDestinationTask: true,
  // 携帯で構える釦を出す間も、持ち場と残る味方を任務欄へ残す。
  keepTaskWithGuard: true,
  // 回避の最中も任務札を知らせの枠に数え、味方の残る人数を残す。
  keepTaskWithRain: true, keepTaskWithDodge: true,
  // 包囲全体の旗でなく、今いる持ち場の生きた列を知らせる。
  missionDangerText(rt) {
    const F = rt.flags;
    return F.step === 2 ? '！ 味方が崩れかけた。道の印へ進み、大村の列を支えよ'
      : gone(F.guard) ? '！ 西の槍組が退いた。平田の味方と城兵を受けよ'
        : gone(F.hirata) ? '！ 平田の守りが退いた。西の槍組と道を守れ'
          : F.dropped ? '！ 味方が崩れかけた。平田の木戸で城兵を受けよ'
            : '！ 味方が崩れかけた。西の槍組で護衛を押し返せ';
  },
  // 離れた敵を追う手ほどきで、木戸や大村へ戻る下知を消さない。
  // 目前の敵には従来どおり構えと攻撃を教える。
  meleeGuide(rt, enemy) {
    if (!enemy) return false;
    const p = rt.player.u.pos, d = Math.hypot(enemy.pos.x - p.x, enemy.pos.z - p.z);
    if (d > 6) return false;
    return d <= 4 || !this.routeGuidePriority(rt);
  },
  meleeApproachLabel: (rt) => rt.objectives.find(o => o.id === 'main' && !o.state)?.text || '味方の列で構えよ',
  // 敵への一歩を「旗へ進む」と呼ばず、任務と同じ持ち場を伝える。
  meleeApproachText: (rt) => rt.objectives.find(o => o.id === 'main' && !o.state)?.text || '味方の列で構えよ',
  // 列を離れた時は敵の囲みより道の印を優先する。接敵中の構えは残す。
  routeGuidePriority: (rt) => !!rt.flags.withdrawGuide || !!rt.flags.joinGroup ||
    !!rt.flags.routeAt && Math.hypot(rt.player.u.pos.x - rt.flags.routeAt.x, rt.player.u.pos.z - rt.flags.routeAt.z) > 10,
  // 槍組へ加わる下知と「にげる」を競わせず、実際に示す足元の印を呼ぶ。
  dodgeLabel: (_rt, direction, rain) => direction ? direction.replace(/にげる/g, 'よける')
    : rain ? '矢の外へよけよ' : '足元の印へよけよ',
  dodgeGuideLabel: (_rt, reached, rain) => reached ? 'ここで敵へ槍を向けよ'
    : rain ? '矢の外の印へよけよ' : '足元の印へよけよ',
  // 退く案内でも「ここへ」だけに置き換えず、誰の列へ戻るかを残す。
  keepRetreatReason: true,
  keepWoundRetreatReason: true,
  retreatStepsNewLine: true,
  // 浅い打撲だけで持ち場の下知を退避札に替えない。出血・深手の案内は残す。
  woundEffectMin: .05,
  // 空中の大旗と長い線で戦列を覆わず、足元の小旗と短い矢印で退く先を示す。
  compactRetreatArea: true, compactGroundGoalRing: true, singleRetreatArrow: true,
  // 木戸の守備範囲を白黒の大輪で囲わず、足元の小旗へまとめる。
  // 到着・守備の判定は既存の半径のまま。退く線も兵一人ほどの長さに収める。
  smallTaskAreas: true, smallRetreatAreas: true, taskAreaFootRing: true,
  compactGuardArea: true, compactRouteGuide: true,
  swipeArrowLength: 64, guideArrowLength: 72, directionArrowLength: 72,
  retreatGuideLabel(rt, reached) {
    const p = rt.player, u = p.u;
    const reason = u.wounds?.bleed > .0001 ? '出血している'
      : u.hp < u.maxHp * .3 ? '傷が深い'
        : u.woundSlow > this.woundEffectMin ? '足にけが'
          : u.armWound > this.woundEffectMin ? '腕にけが'
            : u.mobbed ? '囲まれるぞ'
              : p.sta < 20 ? '息切れ' : '';
    const action = reached ? 'ここで構えて休め'
      : rt.hud.retreatGuide?.ally ? '味方の後ろへ下がれ' : '足元の印へ下がれ';
    return reason ? `${reason}。${action}` : action;
  },
  dodgePointAllowed: mikiGuidePointAllowed,
  retreatPointAllowed: mikiGuidePointAllowed,
  botRetreatStepAllowed: mikiGuidePointAllowed,
  // 傷ついた一人の救援中も、槍組・木戸・大村の下知を任務欄に残す。
  keepRescueTaskLabel: true,
  // 肩越しで本人が見えるため、斜面と兵の上に重なる太い白輪は使わない。
  hidePlayerSign: true,
  // 姿と無関係な白い人形の線を重ねず、肩越しの本人と道の印を見せる。
  noUnitContrast: true,
  // 二つの持ち場を守る下知を、一人の救援札で隠さない。救援の猶予と被害は変えない。
  guardGuideAllowed: () => false,
  guardLabel: (rt, guard) => guard.name ? `${guard.name}を守れ` : '傷ついた味方を守れ',
  introSides: { b: '別所の兵と荷の護衛' },
  introText: 'まず「西の槍組」の印へ進もう。味方と共に、敵の荷の護衛を退けよう。次は平田の木戸を守り、合図が来たら大村へ移ろう。自分が無事でも、味方の持ち場を失うと負けになる。任務の札で味方の残る人数を見よう。',
  // 包囲内の城下・寺の民は城下の退避所に留まり、包囲外の百姓だけが西へ逃げる。
  civilianCrowd: { bounds: { minX: -245, maxX: 100, minZ: -235, maxZ: 335 }, bands: PEOPLE_BANDS, fireSize: 1 },
  // 合図は任務の単語から推測せず、実際に下知が変わった時だけ鳴らす。
  commandSignal(rt, kind, text) {
    const F = rt.flags;
    F.mikiCue = text; F.mikiCueT = rt.t;
    const task = rt.objectives.find(o => o.id === 'main');
    if (task) rt.signalCue(task);
    rt.army.playFar('sig_' + kind, F.hideU.pos, .9);
  },
  // 視点へ食い込む味方は全身で避ける。笠だけ消して顔や首布を大写しにしない。
  // 隣の戦列は濃く残し、既存の描画時だけの処理を使う。
  // 下の遮蔽処理で視界を空ける。兵を避けて視点を本人の胴へ押し込まない。
  nearAllyFadeRadius: 1.1, nearAllySolidBody: true, nearAllyWholeOcclusion: true,
  nearHatFadeRadius: 0, nearAllyHorseFade: true,
  // 携帯の狭い視野へ横から入る旗と長柄は、既存の遮蔽処理で描く間だけ避ける。
  // 三間半の長柄は、持ち手が四歩半より外でも肩越しへ差し込む。
  nearFlagFadeRadius: 6, nearLongWeaponRadius: 10,
  // 持ち主から離れた落ち槍も、肩越しの視線を横切る間だけ描くのを避ける。
  // 生きた兵の槍と同じ既存の処理で戻し、拾える物や当たりは変えない。
  nearGroundSpearRadius: 10, nearGroundSpearClearance: .8,
  // 木戸・大村への下知と目前の危険を、古い任務の十秒待ちで隠さない。
  immediateTaskChanges: true, immediatePhaseTasks: true,
  avoidWaymarkThreats: true, // 前方の危険札は、道の印の名・距離・矢印を避ける。
  noAllyReports: true, // 遠い武将の賞賛を使番で運び直さず、そばの組頭が声をかける。
  botOrders: true, // 下知待ち・柵の回り道・反撃を、性格の突進や持ち替えで上書きしない。
  frontlineDensity: { phases: ['convoy', 'omura'], scoutAdvance: true },
  battleVoices: { lines: {
    ally: { ambient: ['隣と槍をそろえよ', '柵の口を空けるな', '兵糧の道を守れ'] },
    enemy: { ambient: ['荷を城へ通せ', '城からの手と押し合わせよ', '付城の口へ寄せよ'] },
  } },
  taisho: { a: { name: '羽柴秀吉', def: true }, b: { name: '別所長治', def: true } },
  attackWarningDelay: 1, // 打たれる前に迫る向きを知らせ、構える間を残す。
  // 川岸でなく合流道の中央から。槍組の後ろで前進の手ほどきを受ける。
  spawn: { x: -78, z: -48, heading: -Math.PI / 2 },
  // 今の持ち場を優先する。城の馬印や済んだ俵へ案内を戻さない。
  guideMarker(rt) {
    const F = rt.flags;
    // 片方の持ち場が退いたら、空の木戸より残る味方の列へ案内する。
    if (F.step === 1 && F.joinGroup && (gone(F.guard) || F.dropped && gone(F.hirata))) {
      const at = this.spearAt(F.joinGroup);
      if (at && !rt.army.wallBetween(rt.player.u.pos, -1, at)) return 'join';
      if (F.routeAt) return 'route';
    }
    // 敵の赤い印は道案内の対象外。木戸か味方への案内を保ち、残敵は札で知らせる。
    // 木戸へ着いたら、孤立した者には壁を挟まない味方の列を示す。
    if (F.joinGroup && F.routeAt === GATE && Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z) < 10) {
      const at = this.spearAt(F.joinGroup);
      if (at && !rt.army.wallBetween(rt.player.u.pos, -1, at)) return 'join';
    }
    // 大村への回り道では曲がり角を先に示す。南で戦う味方へ印を戻すと、
    // 「北へ進め」の札と逆向きになり、柵の南で足踏みを続けてしまう。
    if (F.step === 2 && F.routeAt && (F.routeIndex || 0) < 4) return 'route';
    // 坂の口まで進んだら、柵を挟まない生きた味方の列へ合流する。
    if (F.step === 2 && F.joinGroup && !F.foes.every(gone)) {
      const at = this.spearAt(F.joinGroup);
      if (at && !rt.army.wallBetween(rt.player.u.pos, -1, at)) return 'join';
    }
    if (F.routeAt) return 'route';
    if (F.roadTurn >= 0) return 'road-turn';
    if (F.step === 2 && F.foes.every(gone)) return 'omura';
    if (F.joinGroup) return 'join';
    return F.step === 2 ? 'omura' : F.dropped ? 'hirata' : 'road';
  },
  // 曲がり角は既存の小旗と矢印で示す。足元から空まで伸びる投影の実線は描かない。
  // 通る角・兵の進路・到着の判定は保つ。
  routeGoalRadius: .8,
  // 片方の組が退いた後も、案内・受ける場所・自動操作で同じ生きた列を目指す。
  regroupAt(rt) {
    const F = rt.flags;
    // 槍組が退いても、残る鉄砲組・大将の手へ合流する。空の槍列へ戻さない。
    if (F.step === 2 && !this.omuraGuard(rt)) {
      const group = this.omuraSupport(rt), at = group && this.spearAt(group);
      return at && !rt.army.wallBetween(rt.player.u.pos, -1, at) ? at : F.routeAt || OMURA;
    }
    if (F.step !== 1) return null;
    const group = gone(F.guard) && !gone(F.hirata) ? F.hirata
      : F.dropped && gone(F.hirata) && !gone(F.guard) ? F.guard : null;
    if (!group) return null;
    const at = this.spearAt(group);
    return at && !rt.army.wallBetween(rt.player.u.pos, -1, at) ? at : F.routeAt || GATE;
  },
  // 西の組が退いた時は、平田から退く同じ兵が大村の先手を務める。
  omuraGuard(rt) {
    return !gone(rt.flags.guard) ? rt.flags.guard : !gone(rt.flags.hirata) ? rt.flags.hirata : null;
  },
  omuraSupport(rt) {
    const F = rt.flags;
    return this.omuraGuard(rt) || (!gone(F.hgun) ? F.hgun : !gone(F.hide) && !F.hideRetired ? F.hide : null);
  },
  // 生き残った列の中央に最も近い兵を指す。空いた整列位置へ印を残さない。
  spearAt(g) {
    let x = 0, z = 0, n = 0;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
      x += u.pos.x; z += u.pos.z; n++;
    }
    if (!n) return null;
    x /= n; z /= n;
    let soldier = null, best = Infinity;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
      const d = (u.pos.x - x) ** 2 + (u.pos.z - z) ** 2;
      if (d < best) { soldier = u; best = d; }
    }
    return soldier.pos;
  },
  world: {
    // この戦の景物だけを結合。壊れる柵の窓口と近い形は保つ。
    compactScenery: true,
    mergeStaticBatches: true,
    // 城域と東の付城を地面の内に収める。共通地形の頂点数は増やさない。
    seed: 15799, groundHalf: 780, moveLim: 750, time: 'night', nightLift: 2.8, nightFill: .48, fogFar: 420,
    // 既存の丸い炎を使い、門前に三角の札のような火を立てない。
    roundedFire: true,
    // 松明の暖色を粗い地形の頂点から広げず、火の届く足元だけへ描く。
    smoothGroundFire: true,
    // 指物で敵の胴と穂先を覆わない。隊旗・名のある兵・自分の組の旗は残す。
    ordinaryFlagStride: 3,
    // 胴や骨の縮尺を刺さった矢へ重ねず、動いた後も実寸を保ち、長い棒にしない。
    lifeSizePinnedArrows: true, pinnedArrowAxisScale: true,
    unitNightScale: .4, // 月光の明るさは保ち、兵の縁だけ青白く光る補光を弱める。
    // 描かれた斜面と足・視点の高さをそろえる。播磨の低い丘陵に留める。
    terrainTriangles: true, mountainScale: .58,
    // 近い視点へ切り替えた直後も、手前の四隅を実際に描く坂の上へ戻す。
    // 地面の裏から空を映さず、歩行の高さ・地形の面数は変えない。
    terrainContactView: true,
    // 携帯も足場と同じ格子で描く。粗い地面に木戸の裾や土塁・兵の足を埋めない。
    keepTerrainGrid: true,
    // 丸太組みを指定した三木の井楼だけ、垂直の四本柱と交互の横木を使う。
    // 高画質の共通部品の入口へ指定を渡し、ほかの戦の櫓は変えない。
    lookoutLogFrame: true,
    // 木戸の葺き板の下を閉じ、下から見た屋根に空の筋を残さない。
    gateRoofBacking: true,
    // 低画質の徒歩の脚を蹴り上げすぎず、列の全員が同じ姿で跳ねるのも避ける。
    strideLimit: .6, variedMarch: true,
    // 既存の六組の貸し具足と、前後列の腰・膝の踏ん張りを使う。戦う人数と強さは保つ。
    variedInfantry: true, variedLoanArmor: true, infantryWeight: true, contactDust: true,
    // 既存の足合わせと後列の構えを使い、坂で足を浮かせず、前列の頭越しに槍を送る。
    meleeGroundedFeet: true, rearSpearSupport: true,
    // 三木の川肩の乱戦だけ、笠と胴が重なる前に既存の押し合いで間を取る。
    meleeBodySpace: 1.15, allyPersonalSpace: 1.25,
    contactShadows: true, darkFootprints: true,
    // 広い地形の頂点間へ火の色を引き延ばさず、炎の近くの地肌だけを照らす。
    smoothGroundFire: true,
    // 携帯でも倒れた胴と落とした道具を川肩の坂へ合わせる。生きた兵の足場は変えない。
    terrainContactFalls: true, slopeContactFalls: true, slopeLitter: true,
    // 既存の杉の枝先を崩す。林の本数と毎コマの処理は増やさない。
    layeredNeedles: true, raggedNeedles: true,
    // 低画質の葉房を斜めに張り、細長い刃が立ち並ぶような輪郭を弱める。
    cedarBoughPitch: .65, cedarBoughWidth: 1.2,
    // 急な川岸に水平の丸い影を浮かせない。背後の警告と足音は既存のまま。
    noLowBlobShadows: true,
    // 四人の弓組から数十本の黒棒を増やさない。細い矢を未明の霧へなじませる。
    naturalArrowRain: true, arrowRainPerBow: 1,
    // 外れ矢を庭へ積み重ねない。飛ぶ矢と兵・木へ当たる矢は残す。
    noGroundArrows: true,
    // 槍も持ち主の可視状態で束ねる。別の写しを残すと、視界を空けた後に柄だけ浮く。
    attachedFarSpears: true,
    // 味方の矢は本人に当たらない。無害な斉射で槍組から退かせず、敵の矢だけ警告する。
    enemyArrowWarnings: true,
    // 肩越しの視線全体を検索する。避けるのは下の細い遮蔽範囲だけ。
    nearAllyFadeRadius: 1.1,
    // 岩の下縁を坂へ埋め、斜面をまたぐ黒い影の板を省く。根草も葉の束にする。
    groundedSlopeRocks: true, curvedRockTufts: true,
    // 根草の裏を黒い刃にせず、岩と葉を実際に描く坂へ据える。
    rockDrawGround: true, litRockTufts: true, rockBuriedRim: true,
    // 西の荷駄道・東北東の本陣から城域と東の付城まで。遠景の広さと遊べる端を分ける。
    playerBounds: { minX: -245, maxX: 720, minZ: -255, maxZ: 720 },
    playerBoundsAt: (rt) => rt.flags.step === 1 && !rt.flags.dropped && !rt.flags.ending && !rt.over ? CONVOY_BOUNDS : null,
    autumn: true, muddy: 0.08, paths: ROADS, patchyGround: true,
    // 茶色の頂点色だけで野まで裸地にしない。道と刈田は土、ほかは枯れ草を混ぜる。
    // 既存の地表の絵の配分だけを変え、房や描画の回数は増やさない。
    grassMix: (x, z) => roadBlend(x, z) > .1 || fieldEdge(x, z) > 0 ? 0
      : .5 + .18 * Math.sin(x * .09) * Math.cos(z * .07),
    // 槍衾の段と密度は保ち、息と押し返しで手元が動く間だけ一人ずつずらす。
    livingSpearHedge: true,
    // 膝の折れる速さをばらし、横斬りの肩は倒れ切る時に坂へ寝かせる。
    // 寝た胴の厚みと、落ちた槍・指物の向きは保つ。
    fallPaceSpread: .35, settleSideFalls: true,
    groundedFalls: true, crumpledFlags: true,
    // 胴が地へ着く一度だけ具足を鳴らし、既存の粒の枠から低い土煙を出す。
    // 雨・水中では土煙を出さず、人数・攻撃の間・威力には触れない。
    contactFalls: true,
    // 秋の刈田。道・付城・川床には田を重ねない（区画は復元）。
    paddy: (x, z) => roadBlend(x, z) < .1 && fieldEdge(x, z) > 0 ? 1 : 0,
    tint: (x, z, h, c) => {
      if (roadBlend(x, z) > .1) c.setRGB(.46, .40, .30);
      else if (fieldBank(x, z) > 0) c.setRGB(.22, .20, .15);
      else if (fieldEdge(x, z) > 0) {
        const row = Math.abs(x / 1.2 - Math.round(x / 1.2)) < .07 ? .62 : 1;
        c.setRGB(.5 * row, .42 * row, .26 * row);
      } else {
        const n = Math.sin(x * .23) * Math.cos(z * .19) * .035;
        c.setRGB(.30 + n, .31 + n, .21);
      }
    },
    // 三木は膝より深い流れへ踏み込ませない。浅瀬の三十五センチは渡れる。
    // 移動・押し合い・浅瀬への迂回で同じ上限を使う。ほかの戦は従来のまま。
    height, moveWay: hirataWay, riverCross: true, wadeDepth: .45,
    blockedHint: (rt) => rt.player.u.pos.z > -35 ? '川は東の浅瀬を渡れ。平田は南の口へ回れ' : rt.flags.step === 2 ? '大村へは柵の外を西へ回れ。北の坂を登れ' : '南の道から西の槍組へ加われ。柵の口は南じゃ',
    streams: [{ pts: [[-230, -35], [-100, -35], [0, -28], [100, -22], [230, -35]], w: 6, depth: 1.2, surfaceDrop: 0.25, fords: [{ x: 10, w: 9 }] }],
    clear: (x, z) => (x < 30 && z > -150 && z < 30) || castleBlend(x, z) > 0 || roadBlend(x, z) > 0 || peopleClear(x, z),
    fieldStage: 'stubble', trees: 360, tufts: 3600,
    treeDensity: (x, z) => castleBlend(x, z) > 0 || roadBlend(x, z) > 0 || peopleClear(x, z) ? 0 : x < 30 && z > -150 && z < 30 ? 0.12 : 1,
    groves: [{ x: -120, z: -110, r: 12, n: 16 }, { x: -38, z: -154, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (x < -215 || x > 215),
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world, F = rt.flags;
    // パソコンも本文を読む高さを先に確保する。自動の高さでは
    // 縮められる本文が一行未満になり、出陣の釦だけの札になる。
    // 横持ちでは下の指定で画面の高さへ合わせ、出陣の釦は残す。
    const root = rt.hud.root, layout = document.createElement('style');
    root.dataset.miki = '';
    layout.textContent = `
      html body #hud[data-miki] #intro:has(#intro-go) > .card.card {
        display:flex; flex-direction:column; align-items:stretch; gap:8px;
        width:min(600px, calc(100vw - 32px)); height:min(620px, 72dvh); max-height:min(620px, 72dvh);
      }
      #hud[data-miki] #intro .intro-reading { display:block; flex:1 1 auto; min-height:0; box-sizing:border-box; width:100%; overflow-y:auto; touch-action:pan-y; overscroll-behavior:contain; padding-bottom:16px; scroll-padding-bottom:16px; }
      #hud[data-miki] #intro-go { flex-shrink:0; }
      #hud[data-miki] #intro .intro-people summary {
        box-sizing:border-box; min-height:44px; margin-top:8px; padding:10px 8px;
        color:var(--washi); font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6;
        text-decoration:underline; cursor:pointer;
      }
      #hud[data-miki] #intro .intro-people summary:focus-visible {
        outline:3px solid var(--kin); outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
      }
      #hud[data-miki] #intro .card .sides { letter-spacing:0; }
      /* 負傷の長い文でも列を押し広げず、残量と目盛りを墨の下地へ収める。 */
      html body #hud[data-miki] .bl #h-hp.hp {
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
        width:min(264px,calc(100vw - 40px)); min-width:0; max-width:100%;
      }
      html body #hud[data-miki] .bl #h-hp.hp > * { min-width:0; max-width:100%; }
      html body #hud[data-miki] .bl #h-hp.hp em {
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
        white-space:normal; word-break:normal; overflow-wrap:anywhere;
      }
      html body #hud[data-miki] .bl #h-hp.hp em small { font-size:inherit; white-space:normal; }
      html body #hud[data-miki] .bl #h-hp.hp em svg { width:18px; height:22px; }
      /* 共通の台詞表示より非表示を優先し、消えた声の黒い空欄を畳む。 */
      html body #hud[data-miki] #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted,:empty) { display:none !important; }
      /* 旗や退避の案内で本文だけ消し、墨の空札を残さない。 */
      html body #hud[data-miki]:is(.flag-guide,.guard-guide,.person-guide,.cover-guidance) #battle-notices #objectives:not(.expand):not([hidden]):not(.notice-muted) { display:block !important; visibility:visible !important; }
      html body #hud[data-miki]:is(.flag-guide,.guard-guide,.person-guide,.cover-guidance) #battle-notices #objectives:not(.expand) #obj-list { display:block !important; }
      /* 防ぐ釦を押す間も、守る持ち場と味方の人数を読めるようにする。 */
      html body #hud[data-miki].wait-guard-active #battle-notices #objectives:not(.expand),
      html body #hud[data-miki].wait-guard-active #battle-notices #objectives:not(.expand) #obj-list { display:block !important; }
      html body #hud[data-miki].wait-guard-active #objectives:not(.expand) .battle-action { display:none !important; }
      /* 共通の旗・人物案内が本文を隠しても、三木の持ち場と人数は残す。 */
      html body #hud[data-miki]:is(.flag-guide,.guard-guide,.person-guide,.cover-guidance,.wait-guard-active) #battle-notices #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
        display:block !important; visibility:visible !important;
      }
      /* 携帯・パソコンとも、道案内や防御中に持ち場と人数を消さない。
         共通の短い道案内より優先し、選ばれた任務一枚だけに限る。 */
      html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not([hidden]):not(.notice-muted),
      html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not([hidden]):not(.notice-muted) :is(#obj-list,li.cur,.obj-text,.obj-now) {
        display:block !important; visibility:visible !important;
      }
      html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not([hidden]):not(.notice-muted) li.cur > small:not(.obj-cue):not(.goal-place) {
        display:block !important; white-space:pre-line !important; max-height:none !important;
      }
      /* 矢をよける間も持ち場の衰えを見失わせない。危険の案内と同じ札の列へ残す。 */
      html body #hud[data-miki]:is(.rain-danger,.dodge-active) #battle-notices #objectives:not(.expand):not([hidden]):not(.notice-muted),
      html body #hud[data-miki]:is(.rain-danger,.dodge-active) #battle-notices #objectives:not(.expand):not([hidden]):not(.notice-muted) #obj-list { display:block !important; }
      /* 共通の「持ち場を残す」指定より強くし、古い合図で任務を押し出さない。 */
      html body #hud[data-miki].compact-battle #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur small.obj-cue { display:none !important; }
      /* 残る味方と退くまでの猶予は、今の下知の下へ残す。 */
      html body #hud[data-miki].compact-battle #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small:not(.obj-cue):not(.goal-place) {
        display:block !important; white-space:pre-line !important; max-height:none !important;
        font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.4;
      }
      /* 操作札と道案内の共通指定が人数ごと任務の行を隠す場合にも残す。
         人数の文は objProgress の同じ値を使い、知らせの枚数は増やさない。 */
      html:root body #hud[data-miki].single-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.notice-muted) #obj-list,
      html:root body #hud[data-miki].single-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) #obj-list li.cur > small:not(.obj-cue):not(.goal-place) {
        display:block !important; visibility:visible !important;
        white-space:pre-line !important; max-height:none !important;
        font-size:max(13px,calc(13px * var(--text-scale,1))) !important; line-height:1.4;
      }
      @media (min-height:501px) {
        html:root body #hud[data-miki].single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; max-width:100% !important;
        }
      }
      html body #hud[data-miki].compact-battle #battle-notices #objectives:not(.expand) li.cur .obj-now { font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important; }
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) li.cur,
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now),
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) .battle-action {
        height:auto !important; max-height:none !important; white-space:normal !important;
        overflow:visible !important; overflow-wrap:anywhere !important; text-overflow:clip;
      }
      /* 本文の横へ補足を詰めない。一字幅の縦列を作らず、札の幅で順に読む。 */
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) li.cur {
        display:block !important; width:100% !important; min-width:0; box-sizing:border-box;
      }
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
        display:block !important; width:100% !important; min-width:0; max-width:100%; box-sizing:border-box;
      }
      html body #hud[data-miki] #battle-notices #objectives:not(.expand) li.cur::before { content:none !important; }
      /* 行ごとの共通の墨を外し、指図・人数・距離を一枚の札で読めるようにする。 */
      html body #hud[data-miki]:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) {
        background:rgba(12,10,8,.88) !important; padding:6px 8px !important;
        border:0 !important; border-inline-start:2px solid var(--kin) !important;
      }
      html body #hud[data-miki]:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small),
      html body #hud[data-miki]:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
        background:none !important; padding:0 !important; box-shadow:none !important;
      }
      html body #hud[data-miki]:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
        display:block !important; line-height:1.4 !important;
      }
      /* 縦に余裕のある画面は左で知らせを積み、右の小地図を空ける。 */
      @media (min-height:501px) {
        /* 地面の札は歩数を含めて読める幅と字にし、末尾一字だけの行を減らす。 */
        html body #hud[data-miki].compact-battle #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
          width:320px !important; max-width:min(360px,40vw) !important;
        }
        html body #hud[data-miki].compact-battle.single-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) #obj-list li.cur .obj-now {
          font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
        }
        html body #hud[data-miki] #battle-notices:not(.choosing),
        html body #hud[data-miki].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:16px !important; right:auto !important; top:88px !important;
          width:min(320px, 30vw) !important; max-height:calc(100% - 320px) !important;
        }
        /* 任務中の共通指定にも勝たせ、台詞を含めて左の札の中で積む。 */
        html body #hud[data-miki] #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; height:auto !important; min-height:0 !important; min-width:0; flex:0 0 auto;
          max-height:none !important; white-space:normal; overflow-wrap:anywhere;
        }
        /* 地面の下知も左の知らせへ収め、方位の帯へ戻る共通指定を上書きする。 */
        html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; max-width:100% !important;
        }
      }
      @media (orientation:landscape) and (max-height:500px) {
        /* 防ぐ釦は右下の操作の上へ収め、目線の高さの敵と旗を空ける。 */
        html.touch body #hud[data-miki] #wait-guard {
          /* 足元を追う共通処理の直書きより優先し、押す間も同じ端へ固定する。 */
          top:auto !important; left:auto !important;
          right:calc(16px + env(safe-area-inset-right, 0px)) !important;
          bottom:calc(112px + env(safe-area-inset-bottom, 0px));
          width:208px; min-height:72px; padding:6px; border-width:2px; border-radius:10px;
          grid-template-columns:28px minmax(0, 1fr); column-gap:6px; row-gap:2px;
        }
        /* 三列目の盾が暗黙の列を作り、本文を一字幅へ押し込むのを防ぐ。 */
        html.touch body #hud[data-miki] #wait-guard svg + svg { display:none; }
        html.touch body #hud[data-miki] #wait-guard svg:first-child { width:28px; height:40px; }
        html.touch body #hud[data-miki] #wait-guard span { font-size:max(18px, calc(18px * var(--text-scale, 1))); }
        html.touch body #hud[data-miki] #wait-guard small { font-size:max(13px, calc(13px * var(--text-scale, 1))); }
        html.tc-sw body #hud[data-miki] #wait-guard {
          left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
        }
        /* 敵と道の印が見える中央を空け、下知は左上の同じ場所で読む。 */
        html body #hud[data-miki] #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
          top:calc(16px + env(safe-area-inset-top, 0px)) !important; transform:none !important;
          width:min(340px, 40vw) !important; max-width:none !important;
          max-height:calc(100dvh - 160px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        }
        /* 接敵時の声も任務も同じ列へ積む。共通の中央配置を残すと札同士が重なる。 */
        html body #hud[data-miki] #battle-notices:not(.choosing):not(:has(#objectives.expand)) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; height:auto !important; min-height:0 !important; min-width:0;
          max-width:100% !important; max-height:none !important; flex:0 0 auto;
          white-space:normal; overflow-wrap:anywhere; box-sizing:border-box;
        }
        html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) {
          position:relative !important; inset:auto !important; transform:none !important;
        }
        /* 撤退の共通指定にも人数を隠させず、下知と同じ左上の札へ残す。 */
        html:root body #hud[data-miki].compact-battle #battle-notices:not(.choosing) #objectives#objectives:not(.expand) li.cur > small:not(.obj-cue):not(.goal-place) {
          display:block !important; white-space:pre-line !important; max-height:none !important;
          font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.4;
        }
        html body #hud[data-miki] #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
          word-break:normal !important; overflow-wrap:anywhere !important; text-wrap:pretty;
        }
        /* 下知と歩数を別の行へ置き、「・あ」だけが前の行に残るのを防ぐ。 */
        html body #hud[data-miki] #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .obj-now {
          white-space:pre-line !important;
        }
        html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand) #obj-list li.cur .obj-now {
          font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
          line-height:1.4 !important; text-wrap:balance;
        }
        /* 退く下知の二行と人数・距離を、共通の短い札の高さで切らない。 */
        html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand),
        html:root body #hud[data-miki] #battle-notices:not(.choosing) #objectives#objectives:not(.expand) #obj-list {
          height:auto !important; max-height:none !important; overflow:visible !important;
          min-height:0 !important; flex:0 0 auto !important; box-sizing:border-box;
          width:100% !important; max-width:100% !important;
        }
        html body #hud[data-miki] #intro:has(#intro-go) > .card.card {
          display:flex; flex-direction:column; align-items:stretch; gap:8px;
          width:min(680px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
          height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
          padding:12px 16px;
        }
        #hud[data-miki] #intro .intro-reading { padding:4px 8px 16px; }
        #hud[data-miki] #intro .intro-reading .date { margin-bottom:4px; }
        #hud[data-miki] #intro .intro-reading .rule { margin:6px auto; }
      }`;
    document.head.appendChild(layout);
    const dispose = W.dispose;
    W.dispose = function (...args) {
      layout.remove(); delete root.dataset.miki;
      return dispose.apply(this, args);
    };
    mikiScenery(W);
    mikiHoro(rt);
    // 視点が馬上の胴へ入る時は、腰を濃く残す透かしでは前が見えない。
    // 三木だけ、体の中と本人までの視線を塞ぐ味方を描く間避ける。
    // 距離だけで脇の列まで消さず、坂の高低も含めて肩越しの細い範囲を調べる。
    // 共通の後処理で元へ戻り、探索の範囲と兵の当たりは変えない。
    const player = rt.player;
    player.nearAllyVisit = (u) => {
      const cam = player.nearAllyCam;
      if (!cam || u === player.u || !u.alive || u.isStruct) return;
      const dx = u.pos.x - cam.position.x, dz = u.pos.z - cam.position.z;
      const inside = dx * dx + dz * dz <= (u.mounted ? 1.8 * 1.8 : 1.35 * 1.35) &&
        cam.position.y >= u.pos.y - .2 && cam.position.y <= u.pos.y + (u.mounted ? 4 : 2.4);
      // 敵は視点が体へ入った時だけ、骨の人・馬・武器も一緒に避ける。
      // 本人と視点の間を通るだけの敵は残し、打ち合う相手を消さない。
      if (u.team !== player.u.team && !inside) return;
      const p = player.u.pos, vx = p.x - cam.position.x, vz = p.z - cam.position.z;
      const vy = p.y + 1.4 - cam.position.y, lengthSq = vx * vx + vy * vy + vz * vz;
      // 馬の胴から騎手の頭までを一本の範囲で拾う。胴の中心だけでは、
      // 坂で見上げた騎手の胸と顔が視線の上へ外れてしまう。
      const horizontalSq = vx * vx + vz * vz;
      const along = horizontalSq > .01 ? Math.max(0, Math.min(1, (dx * vx + dz * vz) / horizontalSq)) : 0;
      const bodyY = Math.max(u.pos.y + (u.mounted ? .6 : .5),
        Math.min(u.pos.y + (u.mounted ? 3.6 : 1.8), cam.position.y + vy * along));
      const dy = bodyY - cam.position.y;
      const t = lengthSq > .01 ? (dx * vx + dy * vy + dz * vz) / lengthSq : -1;
      const acrossSq = (dx - vx * t) ** 2 + (dy - vy * t) ** 2 + (dz - vz * t) ** 2;
      if (!inside && !(t > 0 && t < .9 && acrossSq < (u.mounted ? 1.1 * 1.1 : .85 * .85))) return;
      player.hideNearFlag(u.mesh); player.hideNearFlag(u.human?.root);
      player.hideNearFlag(u.horse); player.hideNearFlag(u.wpn);
    };
    W.terrain.material.userData.camNearSolid = true;
    // この戦は柵の外の木戸を守る。柵の内から突く共通の手ほどきは出さない。
    F.hintFence = true;
    // 「護衛を退けよ」「城兵を退けよ」は敵を押し返す下知。味方の退却音にしない。
    // 道案内が書き替わっても、直前の合図は任務札に三十秒残す。
    rt.signalCue = (o) => {
      if (o.kind !== 'main') return;
      o.cue = F.mikiCue || ''; o.cueT = F.mikiCueT ?? -99;
    };
    // 敵の一隊が崩れた時の共通の声も、最後の寄せ手が退いた後は追撃を命じない。
    const say = rt.say;
    rt.say = function (who, text, ...args) {
      if (who === '羽柴秀吉' && F.step === 2 && !F.ending && F.foes.every(gone) &&
        /ひと押し|続こう|声を合わせて進め/.test(text)) {
        text = '深追いはするな。道の印をたどり、大村で列を固めよ';
      }
      return say.call(this, who, text, ...args);
    };
    // 夜は矢の落ちる影が見えない。今いる坂でできる避け方を、既存の三枠へ入れる。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
      const until = rt.t + volley.T + .4;
      rt.hud.notices.push('▲ 矢が降る！ 川へ出ず、味方の列の後ろへ退け', 110,
        Math.max(3, volley.T + .4), 'warn', () => !rt.over && !rt.ended && rt.player.u.alive && rt.t < until);
    };
    // 今の道しるべだけを遠くにも出す。ほかの名札は二十四歩以内で見せる。
    const marker = rt.marker;
    rt.marker = function (...args) {
      marker.apply(this, args);
      const m = this.markers[this.markers.length - 1], pos = m.pos;
      m.pos = () => {
        const q = pos();
        return q && (m.id === miki.guideMarker(rt) ||
          Math.hypot(q.x - rt.player.u.pos.x, q.z - rt.player.u.pos.z) <= 24) ? q : null;
      };
    };
    // 共通の接地影は月明かりでも残す。坂への傾きと馬の長さは共通部品に任せる。
    if (rt.army.blobMat) {
      // 高画質の共通接地影は既に横半径 0.35m。補助の円板も同じ大きさへ収める。
      rt.army.blobGeo.scale(.35 / .45, 1, .35 / .45);
      const mat = rt.army.blobMat;
      mat.color.setHex(0x302b23); mat.opacity = .3;
      mat.customProgramCacheKey = () => 'miki-contact';
      mat.onBeforeCompile = sh => {
        sh.vertexShader = 'varying vec2 vMikiContact;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMikiContact = uv;');
        sh.fragmentShader = 'varying vec2 vMikiContact;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= 1.0 - smoothstep(0.15, 0.5, length(vMikiContact - 0.5));');
      };
      mat.needsUpdate = true;
    }
    // 三木の夜だけ、既存の半球光の下側にも中立色の照り返しを回す。
    // 青い輪郭光で沈む縅の赤・茶を見せ、朝には既存の明るさへ戻す。
    const prepareNight = W.prepareNight;
    const clothFill = new THREE.Color(0xaaa18c);
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'night') {
        look.sun.lerp(clothFill, .28);
        look.hemiSky.lerp(clothFill, .22);
      }
      return look;
    };
    W.applyLook(W.lookOf(W.timeKey));
    W.prepareNight = function () {
      const night = prepareNight.call(this);
      this.nightFill.intensity += .16 * night;
      this.nightFill.color.lerp(clothFill, .65 * night);
      this.nightFill.groundColor.lerp(clothFill, .35 * night);
      return night;
    };
    // 別所の家名が共通の表にないため、この戦の呼び声だけ名を補う。
    const soldierCall = rt.soldierCall;
    rt.soldierCall = (key, pos, speaker, ...args) => soldierCall.call(rt, key, pos,
      speaker === '敵の兵' ? '別所の兵' : speaker, ...args);
    F.blockades = []; F.step = 0; F.taken = 0; F.massRetired = [false, false];
    F.bossName = '組頭'; F.nextSortie = 64; F.sortie = 0; F.routeAt = null;
    F.frontKills = [0, 0]; F.frontMerit = [false, false]; F.foeSpoken = 0;
    this.dressRoad(rt);
    rt.marker('ford', { x: 10, z: -26 }, '浅瀬', { h: 1.5 });
    // 根拠のある出来事・推定の復元・遊びの補いを内部で分ける。画面には英字を出さない。
    F.hist = { siege: 'HIST_A', supplyBattle: 'HIST_A', taniDeath: 'HIST_A', honjinSite: 'HIST_A', hanbeiDeath: 'HIST_A', surrender: 'HIST_A',
      castleShape: 'HIST_B', honjinDitch: 'HIST_B', forts: 'HIST_B', roads: 'GAME_C',
      foodDays: 'GAME_C', moraleShock: 'GAME_C', blockadeRepair: 'GAME_C' };
    // 長い囲みで蓄えが減った状態を復元。九月十日の戦闘中には日を送らない。
    // 経過日と残る兵糧は復元の目安。長陣の重みを持たせ、今日だけで城を落とさない。
    F.kakoi = makeKakoi({ day: 520, foodDays: 45, morale: 72 });
    advanceDay(F.kakoi, 30);
    const batch = makeSimpleBatch();
    // ---- 平田の付城（柵の囲い。口は南） ----
    const hirataWalls = ringWall(rt, HIRATA.x, HIRATA.z, HIRATA.r, { gapAt: 0, gapW: 0.5, team: 0, hp: 1e9, name: '柵', segLen: 5 });
    mikiFenceTorches(W, hirataWalls.map(wall => wall.seg));
    for (const s of hirataWalls) { s.noTarget = true; s.wall = true; }
    mikiFortHut(W, HIRATA.x - 5, HIRATA.z - 4, 6, 4, 0, { ita: true, batch });
    // 井楼は柵内の奥へ据え、門前の打ち合いと肩越しの視界から横木を離す。
    mikiLookout(rt, HIRATA.x + 8, HIRATA.z - 3, { logFrame: true, height: 8.8, boarded: false, mon: 'oda', team: 0 });
    rt.scene.add(mikiGate(W, HIRATA.x, HIRATA.z + HIRATA.r, 6));
    for (const [x, z] of [[HIRATA.x - 6, HIRATA.z + 8], [HIRATA.x + 6, HIRATA.z + 8]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    for (const wall of hirataWalls) dorui(W, wall.seg, wall.nx, wall.nz, { h: .7, w: 2, capEnds: true, closeBack: true, batch });
    mikiFortHut(W, HIRATA.x - 7, HIRATA.z + 4, 5, 4, 0, { ita: true, batch });
    rt.scene.add(jinmaku(W, HIRATA.x + 2, HIRATA.z - 5, 6, 5, 3, { mon: 'oda' }));
    rt.scene.add(tawara(W, HIRATA.x - 7, HIRATA.z + 7, 0, 4));
    siegeApproach(rt, SHIYORI, batch, true);
    // 東・南・西の付城も柵と土塁・南の木戸・番所と兵糧蔵・井楼を備える。
    for (const q of MIKI_FORTS) {
      const walls = ringWall(rt, q.x, q.z, q.r, { gapAt: 0, gapW: .65, team: 0, hp: 1e9, name: '付城の柵', segLen: 5, meshOpt: { batch } });
      mikiFenceTorches(W, walls.map(wall => wall.seg));
      for (const wall of walls) {
        wall.noTarget = true; wall.wall = true;
        dorui(W, wall.seg, wall.nx, wall.nz, { h: .8, w: 2, capEnds: true, closeBack: true, batch });
      }
      rt.scene.add(mikiGate(W, q.x, q.z + q.r, 7));
      mikiFortHut(W, q.x - 6, q.z, 6, 4, 0, { ita: true, batch });
      mikiFortHut(W, q.x + 6, q.z + 2, 5, 4, 0, { ita: true, batch });
      rt.scene.add(jinmaku(W, q.x, q.z - 3, 5, 5, 3, { mon: 'oda' }));
      monomi(rt, q.x + 6, q.z - 6, { logFrame: true, height: 6.6, boarded: false, mon: 'oda', team: 0 });
      rt.scene.add(tawara(W, q.x - 6, q.z + 3, 0, 4));
      rt.scene.add(nobori(W, q.x - 4, q.z + 7, 'oda', 6));
    }
    // 平場の縁。道と戸口への枝道は全幅を開け、土塁・柵・当たりを同じ線へ置く。
    for (const q of MIKI_KURUWA) {
      const x = MIKI.x + q.dx, z = MIKI.z + q.dz;
      // 本丸・二の丸は瓦葺き礎石建物と瓦の出土に合わせる。建物の姿・位置は復元。
      // https://www.city.miki.lg.jp/site/mikirekishishiryokan/13387.html
      // 主殿も短辺を屋根の勾配に使う。外周寸法と南の城道は保ち、棟を東西へ通す。
      // 長手の板戸と柱立ちの庇を南へ向ける。外形と建具の位置は推定。
      const high = true;
      mikiHut(W, x, z, high ? q.d : q.w, high ? q.w : q.d, high ? -Math.PI / 2 : 0, { ita: true,
        nagayaDoors: high, eaveGallery: high,
        tileRoof: q === MIKI_JO.honmaru || q === MIKI_JO.ninomaru, batch });
      const pts = [[x-q.cw/2,z-q.cd/2],[x+q.cw/2,z-q.cd/2],[x+q.cw/2,z+q.cd/2],[x-q.cw/2,z+q.cd/2]];
      for (let i = 0; i < 4; i++) {
        const a = pts[i], b = pts[(i+1)%4], n = Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12);
        for (let j = 0; j < n; j++) {
          const seg = [a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n];
          if (crossesRoad(seg)) continue;
          const len = Math.hypot(seg[2]-seg[0], seg[3]-seg[1]);
          const nx = -(seg[3]-seg[1])/len, nz = (seg[2]-seg[0])/len;
          dorui(W, seg, nx, nz, { h: .8, w: 2, capEnds: true, closeBack: true, batch });
          // 北・東と南の門の脇は狭間のある板塀。ほかは丸太柵を残して土の城の姿にする。
          const board = i < 2 || (i === 2 && Math.abs((seg[0]+seg[2])/2-x-7) < 26);
          const wallH = board ? 2.6 : 2.1;
          // 板塀は笠板を掛けて杭の尖りを収める。柵の形と当たりは保つ。
          for (const wall of wallLine(rt, [[seg[0],seg[1]],[seg[2],seg[3]]], { team: 1, hp: 1e9, name: board ? '曲輪の板塀' : '曲輪の柵', h: wallH, segLen: 12, mesh: board ? castleBoardFence : palisade, meshOpt: { h: wallH, boardCap: board && true, batch } })) { wall.noTarget = true; wall.wall = true; }
        }
      }
      rt.scene.add(mikiGate(W, x + 7, z + q.cd/2, 7));
      monomi(rt, x - q.cw/2 + 15, z - q.cd/2 + 4, { logFrame: true, height: q === MIKI_JO.honmaru ? 10 : 8.8, boarded: false, mon: 'maru', team: 1 });
      mikiHut(W, x + q.cw/2 - 15, z - q.cd/2 + 15, 6, 4, 0, { ita: true, batch });
      mikiHut(W, x - q.cw/2 + 16, z + q.cd/2 - 15, 7, 4, 0, { ita: true, batch });
      mikiResidences(rt, q, batch);
    }
    // かんかん井戸。径約３．６の井桁を共通形で作る。深さは歩行地形へ穴を開けず暗い水面で表す。
    const wx = MIKI.x + MIKI_JO.honmaru.dx - 11, wz = MIKI.z + MIKI_JO.honmaru.dz, wy = W.heightAt(wx, wz);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, .75, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x746b56, side: THREE.DoubleSide }));
    rim.position.set(wx, wy + .375, wz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.65, 12), new THREE.MeshLambertMaterial({ color: 0x171d17 }));
    water.rotation.x = -Math.PI/2; water.position.set(wx, wy + .04, wz);
    rt.scene.add(rim, water); solidCircle(wx, wz, 1.85);
    for (const [x, z] of [[MIKI.x + MIKI_JO.honmaru.dx - 8, MIKI.z + MIKI_JO.honmaru.dz + 20], [MIKI.x + MIKI_JO.honmaru.dx + 8, MIKI.z + MIKI_JO.honmaru.dz + 20]]) rt.scene.add(nobori(W, x, z, 'maru', 7));
    // 城の守りと寄せ手の囲みを分ける。台地の外を付城と柵で一周する。
    // 城下（町屋）と、付城をつなぐ土塁・木柵の遮断線（兵糧の道を断つ網。付城は城下まで遠巻きに囲む）
    rt.scene.add(village(W, PEOPLE_TOWN.x, PEOPLE_TOWN.z, { n: MIKI_JO.jokamachi.n, r: MIKI_JO.jokamachi.r, rot: 0.1, fields: 5, bamboo: 0, smoke: 0, seed: 1579 }));
    rt.scene.add(village(W, PEOPLE_VILLAGE.x, PEOPLE_VILLAGE.z, { n: 3, r: 12, fields: 0, bamboo: 0, smoke: 0, seed: 157910, groundedHomes: true }));
    const templeStart = SOLIDS.length;
    mikiHut(W, PEOPLE_TEMPLE.x, PEOPLE_TEMPLE.z, 6, 4, 0, { ita: true, batch });
    for (let i = templeStart; i < SOLIDS.length; i++) SOLIDS[i].civilianSite = 'temple';
    const torchSegments = [];
    for (let i = 0; i < TSUKESHIRO_CHAIN.length - 1; i++) {
      let [ax, az] = TSUKESHIRO_CHAIN[i], [bx, bz] = TSUKESHIRO_CHAIN[i + 1];
      // 囲いの中心まで延びていた翼の柵は、周回路の外から始める。
      // 見える柵・土塁・当たりを一緒に置き直し、南だけが開く囲いは保つ。
      const span = Math.hypot(bx - ax, bz - az), apron = HIRATA.r + 11;
      if (ax === HIRATA.x && az === HIRATA.z) { ax += (bx - ax) / span * apron; az += (bz - az) / span * apron; }
      else if (bx === HIRATA.x && bz === HIRATA.z) { bx += (ax - bx) / span * apron; bz += (az - bz) / span * apron; }
      const len = Math.hypot(bx - ax, bz - az), nseg = Math.max(2, Math.round(len / 10));
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let k = 0; k < nseg; k++) {
        const s0 = k / nseg, s1 = (k + 1) / nseg;
        const seg = [ax + (bx - ax) * s0, az + (bz - az) * s0, ax + (bx - ax) * s1, az + (bz - az) * s1];
        // 川を柵で横断しない。荷駄道にも道幅ぶんの口を残す。
        const mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
        if (W.inWaterAt(mx, mz) || crossesRoad(seg)) continue;
        torchSegments.push(seg);
        for (const wall of wallLine(rt, [[seg[0], seg[1]], [seg[2], seg[3]]], { team: 0, hp: 180, name: '付城の柵', meshOpt: { mound: true, batch } })) {
          wall.noTarget = true; wall.wall = true;
          const q = { wall, x: (wall.seg[0] + wall.seg[2]) / 2, z: (wall.seg[1] + wall.seg[3]) / 2, broken: false, damage: 0 }; F.blockades.push(q);
          const id = 'repair' + F.blockades.length;
          rt.addInteract(id, () => q.broken && !F.ending ? q : null, '付城の柵を直す', () => {
            if (!q.broken || F.ending || rt.over || !rt.player.u.alive) return;
            q.broken = false; q.damage = 0; wall.opened = false; wall.wall = true;
            if (wall.mesh) wall.mesh.visible = true;
            rt.bark('柵は直ったぞ。荷を城へ通すな');
          }, { r: 3, hold: 6 });
        }
        dorui(W, seg, nx, nz, { h: 0.5, w: 2, capEnds: true, closeBack: true, batch });
      }
    }
    outerFence(rt);
    mikiFenceTorches(W, torchSegments);
    mikiFinishBatch(rt, batch);
    // 近い破損だけ一枚の札で示す。区画ごとの札を増やさない。
    rt.marker('repair', () => F.step === 1 && !F.ending && F.repairAt?.broken ? F.repairAt : null, '破れた柵', { h: 1.5 });
    for (const [x, z] of TSUKESHIRO_CHAIN) rt.scene.add(nobori(W, x, z, 'oda', 7));
    // 秀吉は槍列の後ろ。護衛と鉄砲を別の列に置き、本人だけ突っ込ませない。
    F.hide = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴秀吉の手', anchor: { x: -28, z: -60 }, facing: -Math.PI / 2, width: 6, aggro: 5, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true } }, { type: 'samurai', n: 5 }], ODA));
    F.hideU = F.hide.units[0]; F.hideU.allyOk = true;
    F.guard = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴の槍組', anchor: { x: -42, z: -62 }, facing: -Math.PI / 2, formation: 'yari', aggro: 12 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 24 }], ODA));
    F.hgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴の鉄砲組', anchor: { x: -24, z: -84 }, facing: -Math.PI / 2, formation: 'line', width: 6, aggro: 5 }, dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.hirata = allyGroup(rt, { fixed: true, fullStrength: true, name: '平田の付城の守り', anchor: { x: HIRATA.x, z: HIRATA.z + 4 }, facing: 0, formation: 'yari', aggro: 9 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -74, z: -48 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // 平井山は美嚢川の北東側。留守役を秀長と断定せず、護衛の備だけ置く。
    F.honjin = camp(rt, { ...HONJIN, compact: true, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 0, runTo: { x: -28, z: -60 } });
    const honjinBatch = makeSimpleBatch();
    for (const wall of ringWall(rt, HONJIN.x, HONJIN.z, 20, { gapAt: 0, gapW: 0.7, team: 0, hp: 1e9, name: '本陣の柵', segLen: 8, meshOpt: { batch: honjinBatch } })) { wall.noTarget = true; wall.wall = true; dorui(W, wall.seg, wall.nx, wall.nz, { h: .8, w: 2, capEnds: true, closeBack: true, batch: honjinBatch }); }
    mikiFinishBatch(rt, honjinBatch);
    // 板葺きの控え小屋を陣幕の西へ収める。
    const honjinHouses = makeSimpleBatch();
    mikiFortHut(W, HONJIN.x - 13.5, HONJIN.z - 5, 8, 5, 0, { ita: true, batch: honjinHouses });
    mikiFortHut(W, HONJIN.x + 9, HONJIN.z - 7, 6, 4, 0, { ita: true, batch: honjinHouses });
    finalizeSimpleBatch(rt, honjinHouses);
    rt.scene.add(mikiGate(W, HONJIN.x, HONJIN.z + 20, 8));
    mikiFireStands(rt);
    mikiKidoLight(rt, 0);
    // 円い柵の弦から、梯子の足と一歩手前まで離す。
    monomi(rt, HONJIN.x - 14, HONJIN.z + 10, { logFrame: true, height: 10, boarded: false, mon: 'oda', team: 0 });
    rt.scene.add(hyoro(W, HONJIN.x - 8, HONJIN.z + 8, 0), umatsunagi(W, HONJIN.x + 10, HONJIN.z + 8, 0, 8));
    rt.scene.add(hatazao(W, HONJIN.x + 11, HONJIN.z - 3, 0, 5, 'oda'),
      jindaiko(W, HONJIN.x + 6, HONJIN.z + 4, Math.PI / 2));
    F.ehon = camp(rt, { x: MIKI.x + MIKI_JO.honmaru.dx + 22, z: MIKI.z + MIKI_JO.honmaru.dz + 18, facing: Math.PI, team: 1, faction: 'bessho', armor: 0x35382c, mon: 'maru', general: { name: '別所長治' }, guard: 20, reserve: 0, runTo: { x: MIKI.x + MIKI_JO.honmaru.dx, z: MIKI.z + MIKI_JO.honmaru.dz + 30 } });
    F.ehon.general.allyOk = true;
    // 開始時に全員を置く。段が変わっても同じ兵が歩き、損失を保つ。
    // 先手は荷より先に坂へ出ている。道の手前で槍列をそろえ、南の合流口へ向ける。
    F.escort = enemyGroup(rt, { fixed: true, faction: 'mori', name: '荷駄の護衛', anchor: { x: -120, z: -60 }, facing: Math.atan2(16, 16), formation: 'yari', width: 6, aggro: 12, morale: 90, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }], MORI));
    F.egun = enemyGroup(rt, { fixed: true, faction: 'mori', name: '荷駄を守る鉄砲組', anchor: { x: -174, z: -98 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 8, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], MORI));
    // 両名は『播磨別所記』の当日記事に見える。担当する組と声は遊びの復元。
    // 既存の侍一人ずつに名を付け、人数・体力・武器は増やさない。
    // 二十七人を九人ずつに分ける。浅瀬で長い列の最後尾を待ち続けない。
    F.sallies = [0, 1, 2].map(i => {
      const g = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '城から出た別所勢',
        anchor: { x: 18 + i * 6, z: -14 }, facing: -Math.PI / 2, formation: 'column', colW: 3,
        spacing: 1.1, roadColumn: true, arriveCount: 2, arriveRadius: 4, aggro: 12, fleeDir: { x: 1, z: 0.4 } },
      dress([{ type: 'samurai', n: 1, o: i === 0 ? { name: '別所甚太夫' } : {} }, { type: 'ashigaru', n: 8 }], BESSHO));
      g.sortiePath = [[g.anchor.x, g.anchor.z], ...SALLY_PATH.map(pt => pt.slice())];
      g.sortieStarted = false;
      g.sortieArrive = q => { q.order = 'attack'; q.formation = 'yari'; q.march = false; q.onArrive = null; };
      return g;
    });
    F.sally = F.sallies[0];
    F.reserve = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '大村の控え', anchor: { x: OMURA.x, z: OMURA.z }, facing: 0, formation: 'yari', aggro: 12, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 1, o: { name: '別所三太夫' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 4 }], BESSHO));
    F.carts = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '兵糧を担ぐ者', anchor: { x: -142, z: -74 }, facing: Math.PI / 2, formation: 'column', colW: 2, speed: 1.2, aggro: 0, civ: true, noRout: true, arriveNoncombat: true, fleeDir: { x: -1, z: 0 } }, [{ type: 'porter', n: 6, o: { flag: null } }]);
    for (const u of F.carts.units) { u.noTarget = true; u.dmg = 0; }
    F.cartArrived = new Uint8Array(F.carts.units.length); F.delivered = 0;
    // 回収役も開始時から置く。戦う列から兵を抜かず、俵一つずつを南の口へ運ぶ。
    F.loadTaken = [false, false]; F.storedLoads = 0;
    const solidStart = SOLIDS.length;
    const sack = tawara(W, 0, 0, 0, 1);
    SOLIDS.splice(solidStart); // 運べる俵に、元の場所へ残り続ける当たりを作らない。
    F.sacks = Array.from({ length: 8 }, (_, i) => {
      const mesh = i ? sack.clone() : sack;
      mesh.visible = false; rt.scene.add(mesh);
      return { mesh, load: Math.floor(i / 4), worker: null, stored: false };
    });
    F.haulers = [0, 1].map(i => {
      const x = HIRATA.x + (i ? 1 : -1), z = HIRATA.z + 10;
      const g = allyGroup(rt, { fixed: true, fullStrength: true, name: '俵の運び手', anchor: { x, z },
        facing: 0, width: 1, speed: 1.2, aggro: 0, civ: true, noAI: true, arriveNoncombat: true, arriveRadius: 1.5 },
      [{ type: 'porter', n: 1, o: { flag: null } }]);
      const u = g.units[0]; u.noTarget = true; u.dmg = 0;
      const h = { g, u, sack: null, carrying: false, paused: false,
        out: [[x, GATE.z + 4], [-104, -44], [0, 0]],
        back: [[-104, -44], [x, GATE.z + 4], [x, z]], store: { x, z } };
      h.arrive = () => this.haulArrive(rt, h);
      return h;
    });
    F.foes = [F.escort, F.egun, ...F.sallies, F.reserve];
    F.oda = [F.hide, F.guard, F.hgun, F.hirata];
    // 川肩の二段横隊は端が水際と柵へはみ出す。人数を変えず三段に収める。
    // 浅瀬を渡る九人組の三列縦隊と、射手の段数はそのまま。
    for (const g of [F.guard, F.hirata, F.escort, F.reserve]) {
      g.yariRanks = 3;
      // 横幅は保ち、接触して詰まる時も後列の胴が前列の背へ入り込まない。
      g.rankSpacing = 1.25;
    }
    placeGroup(rt, F.guard, -90, -48);
    placeGroup(rt, F.hgun, -70, -42);
    placeGroup(rt, F.hide, -66, -52);
    // 下知の道が決まる隊は、別の回り込みを同時に探さない。索敵と実戦は続ける。
    for (const g of [...F.oda, ...F.foes, F.carts]) g.noAI = true;
    for (const g of F.oda) campWear(g, 30, 80);
    for (const g of [...F.sallies, F.reserve]) campWear(g, 50, F.kakoi.morale);
    const hosts = rosterBuild(rt, JIN);
    F.castleHost = hosts[1].shinjo;
    // 既存の兵を軽い控えで厚く見せる。新しい戦う兵は出さない。
    // 旗で兵の顔と槍列を覆わない。兵の数と長柄の寸法は保ち、指物だけ間引く。
    // 実兵の外側に現れる控えは、七十六歩まで既存の中距離の立体を残す。
    // 同じ人数・同じ描画のまま、境目で胴と袖が細い棒へ変わるのを遅らせる。
    F.escortMass = W.addDistantArmy({ x: -134, z: -74, w: 18, d: 12, count: 240, facing: Math.PI / 2, team: 1, flag: 'mori', flagRate: .25, kind: 'spear', detailMiddle: 76, fieldRanks: true, seed: 15791 });
    F.sallyMass = W.addDistantArmy({ x: 32, z: -14, w: 18, d: 12, count: 180, facing: -Math.PI / 2, team: 1, flag: 'maru', flagRate: .25, kind: 'spear', detailMiddle: 76, fieldRanks: true, seed: 15792 });
    // 羽柴の控えにも同じ距離まで胴と袖を残す。敵だけ立体にして
    // 川向こうの味方が黒い棒の列へ戻る境目を作らない。
    F.hideMass = W.addDistantArmy({ x: 4, z: -94, w: 24, d: 14, count: 240, facing: -Math.PI / 2, team: 0, flag: 'oda', flagRate: .25, kind: 'mixed', detailMiddle: 76, seed: 15793 });
    for (const host of [F.escortMass, F.sallyMass, F.hideMass]) host.army.noWake = true;
    // 道中にも見える押し合い。実兵へ置き換えず、既存の城兵が退けば一緒に退く。
    F.roadClash = W.addClash({ x: -38, z: -46, w: 20, facing: Math.PI / 2, gap0: 12, seed: 15794,
      noWake: true, noRout: true, nearHide: 12, killRate: 0,
      A: { team: 0, flag: 'oda', flagRate: .25, count: 64 }, B: { team: 1, flag: 'maru', flagRate: .25, count: 64 },
      play: (id, pos, vol) => rt.army.play(id, pos, vol),
    });
    // 後列も実兵の同じ道をたどる。参照する位置は準備時に一つだけ持つ。
    for (const [host, group] of [[F.escortMass, F.escort], [F.sallyMass, F.sally], [F.hideMass, F.guard]]) {
      const at = { x: group.anchor.x, z: group.anchor.z, facing: group.facing };
      host.follow(() => {
        if (gone(group)) return null;
        let x = 0, z = 0, n = 0;
        for (const u of group.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          x += u.pos.x; z += u.pos.z; n++;
        }
        if (!n) return null;
        at.x = x / n; at.z = z / n; at.facing = group.facing; return at;
      }, { gap: 10 });
    }
    rt.setPhase('brief');
    // 打ち込む直前の向きを知らせる。威力や振りかぶる時間は変えない。
    const windup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (enemy, target) => {
      if (windup) windup(enemy, target);
      if (target !== rt.player.u || F.ending || rt.over || !target.alive || rt.t < (F.dangerSaidT ?? -24) + 24) return;
      const dx = enemy.pos.x - target.pos.x, dz = enemy.pos.z - target.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const front = (dx * Math.sin(target.heading) + dz * Math.cos(target.heading)) / len;
      const side = dx * Math.cos(target.heading) - dz * Math.sin(target.heading);
      const dir = front > 0.7 ? '前' : front < -0.7 ? '後ろ' : side > 0 ? '右' : '左';
      F.dangerSaidT = rt.t;
      F.dangerCount = (F.dangerCount || 0) + 1;
      rt.bark(F.dangerCount <= 2 ? `${dir}から打つぞ！　味方の列で受けよ`
        : `${dir}を向け！　槍をそろえて受けよ`, true);
    };
    rt.obj('main', '西の槍組で護衛を退けよ', 'main');
    rt.banner('一年半続く三木の囲み', '夜明け前、付城を守れ。兵糧の道を断て');
    rt.say('組頭', '西の旗へ進め。味方の槍組に加わり、荷の護衛を退けよ', 5);
    rt.after(6, () => {
      if (!F.ending && !rt.over) rt.say('組頭', '西の槍組で荷の護衛を受けよ。川の浅瀬から来る城兵は、平田の口で迎えよ', 5);
    });
    // 接敵する頃に景物の説明を重ねない。竹束の役目は戦の記録にも残してある。
    rt.marker('road', () => this.spearAt(F.guard), '西の槍組', { guideAlways: true });
    rt.marker('hirata-foe', () => F.hirataFoe?.pos, '敵の城兵を退けよ', { red: true, guideAlways: true });
    // 最初の前進と道しるべをそろえ、槍組の脇から川へ歩き出させない。
    const firstSpear = this.spearAt(F.guard);
    if (firstSpear) rt.player.yaw = rt.player.u.heading = Math.atan2(firstSpear.x - rt.player.u.pos.x, firstSpear.z - rt.player.u.pos.z);
    this.roadTurn(rt);
    rt.objProgress('main', '西の印で槍組に加われ');
    // 番号の墨書きを外し、既存の織田の家紋で味方の指物を揃える。
    // 隊の番号は進行用に残し、旗の材質だけを共有された家紋へ戻す。
    for (const u of rt.army.units) if (u.team === 0 && u.flag && u.look?.flag) u.flag.material = flagMaterial(u.look.flag);
    rt.after(12, () => this.convoy(rt));
  },
  dressRoad(rt) {
    const W = rt.world, dummy = new THREE.Object3D();
    // 並ぶ丸い斑は泥の絵の窪み・足形にも含まれる。三木だけ、粒と土色の絵を共用する。
    // 高画質でも読み込み待ちの単色を使わず、細粒の土を準備時に一度だけ描く。
    W.groundU.tDirt.value = dirtTex(true, true);
    W.groundU.tMud.value = mudTex(true);
    const pos = W.terrain.geometry.attributes.position, road = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) road[i] = roadBlend(pos.getX(i), pos.getZ(i));
    W.terrain.geometry.setAttribute('mikiRoad', new THREE.BufferAttribute(road, 1));
    // 明るすぎる地肌を秋の茶と灰緑へ寄せ、道と足元の濃淡を残す。
    W.terrain.material.color.setRGB(.66, .61, .51);
    // 地形の絵と凹凸は活かし、三木だけ月の青と脱色を弱める。
    const mat = W.terrain.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => key + '|miki-harvest';
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      sh.vertexShader = 'attribute float mikiRoad; varying float vMikiRoad;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vMikiRoad = mikiRoad;');
      sh.fragmentShader = 'varying float vMikiRoad;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('uNight * 0.16', 'uNight * 0.10');
      // 土塊の外の溝を升全体へ広げると、升ごとの乱数の段差が敷石に見える。
      // 溝を土塊の縁だけへ収め、乾いた道の凹凸は浅くする。地形・当たりは保つ。
      sh.fragmentShader = sh.fragmentShader.replace(
        'float crustCrease = (1.0 - smoothstep(0.0, 0.18, clod))',
        'float crustCrease = smoothstep(0.0, 0.08, clod) * (1.0 - smoothstep(0.0, 0.18, clod))'
      ).replace(
        'float crustHeight = (crustTop * mix(0.035, 0.085, clodSeed) - crustCrease * 0.018) * crustK;',
        'float crustHeight = (crustTop * mix(0.010, 0.025, clodSeed) - crustCrease * 0.006) * crustK;'
      );
      // 既存の地表の斑を使って草地を崩し、岸の湿土と斜面の露出土を分ける。
      // 絵の読み出し・地形の高さ・歩行の判定は増やさない。
      sh.fragmentShader = sh.fragmentShader.replace('vec3 w = vSplat;', `vec3 w = vSplat;
        float mikiSlope = smoothstep(0.025, 0.22, 1.0 - abs(gN.y));
        float mikiPatch = smoothstep(0.34, 0.67, macro2);
        float mikiBare = w.x * mikiPatch * (0.22 + mikiSlope * 0.42);
        w.x -= mikiBare; w.y += mikiBare;
        dirt *= mix(vec3(0.78, 0.72, 0.62), vec3(1.12, 1.03, 0.88), mikiPatch);
        grass *= mix(vec3(0.72, 0.81, 0.65), vec3(1.04, 0.98, 0.8), mikiPatch);
      `);
      // 頂点色は共通処理で草・土の割合に変わるため、細い刈り株の縞は世界座標でも描く。
      // 遠い縞は平均色へ溶かす。追加の絵の読み出しや描画は要らない。
      sh.fragmentShader = sh.fragmentShader.replace('vec3 col = grass * w.x + dirt * w.y + mud * w.z;', `
        float mikiRoadK = smoothstep(0.1, 0.75, vMikiRoad);
        float mikiSoilGrain = clamp(dot(dirt, vec3(0.3333)) / 0.36, 0.55, 1.35);
        // 草・湿土・斜面の割合を残す。単色への置換で川岸まで砂地にしない。
        vec3 col = grass * w.x + dirt * w.y + mud * w.z;
        vec3 mikiRoadSoil = mix(dirt, mud, w.z) * vec3(1.0, 0.94, 0.82)
          * mix(0.86, 1.08, mikiPatch);
        col = mix(col, mikiRoadSoil, mikiRoadK);
        float mikiFieldEdge = -10000.0;
        ${HARVEST_FIELDS.map(([cx, cz, w, d]) => `mikiFieldEdge = max(mikiFieldEdge, min(${w / 2}.0 - abs(vWP.x - (${cx}.0)), ${d / 2}.0 - abs(vWP.z - (${cz}.0))));`).join('\n')}
        float mikiFieldK = smoothstep(0.0, 0.3, mikiFieldEdge) * (1.0 - mikiRoadK);
        float mikiBankK = 1.0 - smoothstep(0.5, 2.5, mikiFieldEdge);
        float mikiRowPhase = vWP.x / 1.2;
        float mikiRowAA = max(0.015, fwidth(mikiRowPhase));
        float mikiRow = 1.0 - smoothstep(0.055, 0.055 + mikiRowAA, abs(fract(mikiRowPhase + 0.5) - 0.5));
        mikiRow *= (1.0 - smoothstep(0.12, 0.5, mikiRowAA)) * (1.0 - smoothstep(24.0, 65.0, length(vWP - cameraPosition)));
        vec3 mikiStubble = vec3(0.5, 0.42, 0.26) * (1.0 - mikiRow * 0.38) * mikiSoilGrain;
        col = mix(col, mix(mikiStubble, vec3(0.36, 0.32, 0.24) * mikiSoilGrain, mikiBankK), mikiFieldK);
      `);
    };
    mat.needsUpdate = true;
    // 畦の土色は上の地表へ直接描く。二十五センチ浮く暗い板を重ねない。
    // 草と細い水路だけ既存の形へまとめ、兵の当たりは増やさない。
    const bankGrass = rockTuftShape(true), bankNormals = bankGrass.attributes.normal;
    // 岩の根草と同様、細い葉は空の光を受ける。裏面を黒い三角の刃にしない。
    // 設営時に法線だけそろえ、房数・葉の面数・揺れの処理は増やさない。
    for (let i = 0; i < bankNormals.count; i++) bankNormals.setXYZ(i, 0, 1, 0);
    const bankMaterial = new THREE.MeshLambertMaterial({ color: 0x73755c, side: THREE.DoubleSide });
    bankMaterial.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <lights_lambert_vertex>',
        '#include <lights_lambert_vertex>\n#ifdef DOUBLE_SIDED\nvLightBack = vLightFront;\nvIndirectBack = vIndirectFront;\n#endif');
    };
    bankMaterial.customProgramCacheKey = () => '三木の川肩の草';
    const banks = new THREE.InstancedMesh(bankGrass, bankMaterial, 540);
    const channels = new THREE.InstancedMesh(new THREE.PlaneGeometry(.6, 2), new THREE.MeshLambertMaterial({ color: 0x879e99, side: THREE.DoubleSide }), 80);
    let sn = 0, bn = 0, wn = 0;
    for (const [cx, cz, w, d] of HARVEST_FIELDS) {
      for (let x = cx - w / 2 + 1; x < cx + w / 2; x += 2) for (let z = cz - d / 2 + 1; z < cz + d / 2; z += 2) {
        if (W.def.paddy(x, z) < .5 || W.inWaterAt(x, z)) continue;
        const sz = (W.heightAt(x, z + 1) - W.heightAt(x, z - 1)) / 2;
        sn++;
        dummy.scale.set(1, 1, 1);
        if (Math.abs(x - cx) > w / 2 - 3 || Math.abs(z - cz) > d / 2 - 3) {
          dummy.rotation.set(0, sn * 2.4, 0);
          dummy.position.set(x, W.heightAt(x, z) - .025, z); dummy.updateMatrix(); banks.setMatrixAt(bn++, dummy.matrix);
          if (x < cx - w / 2 + 3) {
            dummy.rotation.set(-Math.PI / 2 + Math.atan(sz), 0, 0);
            dummy.position.y = W.heightAt(x, z) + .035; dummy.updateMatrix(); channels.setMatrixAt(wn++, dummy.matrix);
          }
        }
      }
    }
    // 広い遠景へ散った草を増やさず、歩く野と畦の脇へ同じ房を足す。
    for (let i = 0; i < 1800 && bn < 540; i++) {
      // 同じ房数を川肩と斜面の群落へ寄せる。整数の格子状には並べない。
      const clump = Math.floor(i / 9), a = i * 2.39996, r = .6 + i % 9 * .31;
      const cx = -184 + ((clump * 73.37) % 202), cz = -143 + ((clump * 47.71) % 102);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (W.inWaterAt(x, z) || roadBlend(x, z) > .1 || Math.hypot(x - HIRATA.x, z - HIRATA.z) < HIRATA.r + 2) continue;
      dummy.position.set(x, W.heightAt(x, z) - .025, z);
      dummy.rotation.set(0, a, 0); dummy.scale.set(.8 + i % 5 * .16, .65 + i % 7 * .13, .8 + i % 5 * .16);
      dummy.updateMatrix(); banks.setMatrixAt(bn++, dummy.matrix);
    }
    for (const [mesh, count] of [[banks, bn], [channels, wn]]) {
      mesh.count = count; mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh);
      W.viewCull([mesh], 0);
    }
    // 刈り取った稲を束ねて立てる。六角の束と結び目を一つの形・材質へまとめる。
    // 畦と藁束をそれぞれまとめ、遠い束は送らない。
    const bundleGeo = new THREE.CylinderGeometry(.22, .34, .9, 6, 2);
    bundleGeo.translate(0, .45, 0);
    const bundleColors = new Float32Array(bundleGeo.attributes.position.count * 3);
    for (let i = 0; i < bundleGeo.attributes.position.count; i++) {
      const tie = Math.abs(bundleGeo.attributes.position.getY(i) - .45) < .01;
      if (tie) {
        bundleGeo.attributes.position.setX(i, bundleGeo.attributes.position.getX(i) * .55);
        bundleGeo.attributes.position.setZ(i, bundleGeo.attributes.position.getZ(i) * .55);
      }
      bundleColors.set(tie ? [.30, .25, .16] : [.5, .42, .26], i * 3);
    }
    bundleGeo.setAttribute('color', new THREE.BufferAttribute(bundleColors, 3));
    bundleGeo.computeVertexNormals();
    const bundles = new THREE.InstancedMesh(bundleGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 42);
    let bundleCount = 0;
    for (let field = 0; field < HARVEST_FIELDS.length; field++) {
      const [cx, cz, w, d] = HARVEST_FIELDS[field], target = bundleCount + 14;
      for (let i = 0; i < 96 && bundleCount < target; i++) {
        const x = cx - w / 2 + 3 + ((i * 7.37) % (w - 6));
        const z = cz - d / 2 + 3 + ((i * 11.13) % (d - 6));
        if (roadBlend(x, z) > .05 || W.inWaterAt(x, z)) continue;
        dummy.rotation.set(0, i * 2.39996, (i % 3 - 1) * .07);
        const scale = .85 + i % 4 * .1;
        dummy.scale.set(scale, scale, scale); dummy.position.set(x, W.heightAt(x, z) + .01, z);
        dummy.updateMatrix(); bundles.setMatrixAt(bundleCount++, dummy.matrix);
      }
    }
    bundles.count = bundleCount; bundles.receiveShadow = true; bundles.computeBoundingSphere(); rt.scene.add(bundles);
    W.viewCull([bundles], 0, 80);
    // 円錐の飾りを減らし、割れと苔のある岩を一つの束にする。中心を土面へ埋める。
    // 一個の面数を減らし、合計の三角形数は元の四十八個と同じに保つ。
    // 石の色は頂点にある。さらに茶を掛けて未明の川肩を黒い破片にしない。
    const stones = new THREE.InstancedMesh(rockShape(.45, false, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 108);
    let stoneCount = 0;
    for (let i = 0; i < 2200 && stoneCount < 108; i++) {
      const cluster = Math.floor(i / 7), a = i * 2.39996;
      const cx = -184 + ((cluster * 61.73) % 211);
      const cz = i % 3 === 0 ? -43 - ((cluster * 3.13) % 7) : -140 + ((cluster * 37.39) % 92);
      const x = cx + Math.cos(a) * (i % 7) * .65, z = cz + Math.sin(a) * (i % 7) * .65;
      if (W.inWaterAt(x, z) || roadBlend(x, z) > .1 || Math.hypot(x - HIRATA.x, z - HIRATA.z) < HIRATA.r + 2) continue;
      // 小礫を主体に、川肩だけ土へ半ば埋まる露岩を混ぜる。当たりは作らない。
      const sc = i % 11 === 0 ? 1.1 + i % 4 * .22 : .16 + (i % 7) * .085;
      dummy.position.set(x, W.heightAt(x, z) - .03 * sc, z);
      dummy.rotation.set((i % 3 - 1) * .12, i * 2.4, (i % 5 - 2) * .06);
      dummy.scale.set(sc * (1.1 + (i % 3) * .17), sc * (i % 3 === 0 ? .4 : .55), sc * (.85 + (i % 5) * .09));
      dummy.updateMatrix(); stones.setMatrixAt(stoneCount++, dummy.matrix);
    }
    stones.count = stoneCount; stones.castShadow = true; stones.receiveShadow = true;
    groundRocks(W, stones, .45);
    rt.scene.add(stones);
    W.viewCull([stones], 0);
    // 荷駄道の端を低い杭で示す。縄で道全体を囲わず、兵の出入りを見て分かるようにする。
    // 準備時に一つの束へまとめる。道・当たり・浅瀬の目印は動かさない。
    const stakePoints = [];
    for (const pts of [LANE, HIRATA_PATH]) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      for (let d = 0; d < len; d += 14) for (const side of [-1, 1]) {
        const x = a[0] + dx * d + dz * side * 4, z = a[1] + dz * d - dx * side * 4;
        if (!W.inWaterAt(x, z)) stakePoints.push([x, z]);
      }
    }
    const stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045, .06, .45, 5), new THREE.MeshLambertMaterial({ color: 0x796044 }), stakePoints.length);
    for (let i = 0; i < stakePoints.length; i++) {
      const [x, z] = stakePoints[i];
      dummy.rotation.set(0, 0, (i % 3 - 1) * .045); dummy.scale.set(1, 1, 1);
      dummy.position.set(x, W.heightAt(x, z) + .175, z);
      dummy.updateMatrix(); stakes.setMatrixAt(i, dummy.matrix);
    }
    stakes.castShadow = true; stakes.receiveShadow = true; stakes.computeBoundingSphere(); rt.scene.add(stakes);
    W.viewCull([stakes], 0);
    dummy.scale.set(1, 1, 1);
    // 水中でも高さが分かる杭を、渡れる幅の両端に置く。川を渡る道はこの一か所だけ。
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .16, 2.4, 5), new THREE.MeshLambertMaterial({ color: 0xb5a278 }), 4);
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 14 : 6, z = i < 2 ? -32 : -20;
      dummy.position.set(x, W.heightAt(x, z) + 1.1, z); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
    }
    posts.computeBoundingSphere(); rt.scene.add(posts);
  },
  sendSortie(g) {
    if (gone(g) || g.sortieStarted) return;
    g.sortieStarted = true; g.order = 'path'; g.path = g.sortiePath; g.pathIdx = 0; g.march = false;
    g.onArrive = g.sortieArrive;
  },
  sortieTick(rt) {
    const F = rt.flags;
    // 目前の城兵を退けた後は、次の組を長く待たせない。人数と同時の寄せは保つ。
    if (F.step === 1 && F.dropped && F.sallies.some(g => g.sortieStarted) &&
      F.sallies.every(g => !g.sortieStarted || gone(g)) && F.sortie + 1 < F.sallies.length) {
      F.nextSortie = Math.min(F.nextSortie, rt.t + 8);
    }
    if (rt.t < F.nextSortie) return;
    F.nextSortie = rt.t + 35; F.sortie++;
    if (F.step === 1 && F.sortie < F.sallies.length) {
      this.sendSortie(F.sallies[F.sortie]);
      rt.bark('浅瀬から次の小隊じゃ！　平田の口で受けよ！', true);
    }
    if (!F.sallies.every(gone) && !gone(F.hirata)) {
      // ここは槍同士の押し合い。鉄砲のない列から斉射音と硝煙を出さない。
      F.roadClash.go();
    } else if (!F.clashRetired) { F.clashRetired = true; F.roadClash.rout(F.sallies.every(gone) ? 'B' : 'A', { hideAfter: 10 }); }
    // 城兵が川を渡る間も、既存の大村の控えが西の坂から寄せる。
    if (F.step === 1 && F.sortie === 2 && !gone(F.reserve)) {
      F.reserve.order = 'path'; F.reserve.path = RESERVE_PATH; F.reserve.pathIdx = 0;
      F.reserve.march = true; F.reserve.onArrive = (g) => { g.order = 'attack'; g.march = false; g.onArrive = null; };
      rt.bark('西の坂からも城兵じゃ！　柵の南で受けよ！', true);
    } else {
      const g = F.step === 2 ? F.reserve : F.sallies.find(q => q.sortieStarted && !gone(q));
      if (g && !gone(g)) {
        // 浅瀬の道を歩く間は下知を壊さない。前線へ着いた兵だけ寄せ直す。
        const at = F.step === 2 ? OMURA : GATE;
        if (g.order !== 'path' && !g.focus) move(g, at.x, at.z, 'attack');
        const said = F.step === 2 ? 'omuraSaid' : 'hirataSaid';
        F[said] = (F[said] || 0) + 1;
        // 同じ寄せ直しは二度まで。三度目は短い下知に替え、以後は印で示す。
        if (F[said] <= 3) rt.bark(F[said] === 3 ? '槍列を崩すな。持ち場で押し返せ'
          : F.step === 2 ? '城兵が寄せ直すぞ！　大村の旗へ集まれ'
            : '城兵が浅瀬から寄せるぞ！　平田の口を守れ', true);
      } else if (F.step === 1 && F.dropped && F.sallies.every(gone)) this.omura(rt);
    }
    // 味方の射手も近い実兵だけを狙う。弾込めや射線の判定は既存の仕組みに任せる。
    if (!gone(F.hgun) && F.hgun.order === 'hold') { F.hgun.order = 'attack'; F.hgun.seekRange = 45; }
  },
  routeTick(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    let at = null, text = '';
    if (F.step === 1 && F.dropped) {
      at = GATE;
      // 南の道に着いた者を同じ曲がり角へ戻さない。壁のない道から木戸へ送る。
      const south = OMURA_TURNS[0];
      if (Math.hypot(p.x - south.x, p.z - south.z) < 7 && p.z > -55) F.hirataSouthReached = true;
      const direct = F.hirataSouthReached && p.z > -55 && !rt.army.wallBetween(p, -1, GATE);
      if (!direct && p.x < -98) { at = south; text = '南の道の印へ進め。そこから東の木戸へ'; }
      else if (!direct && p.z < -52) { at = HIRATA_TURNS[p.x < HIRATA.x ? 3 : 4]; text = '柵の外を南へ回れ。木戸へ進め'; }
      else text = Math.hypot(p.x - GATE.x, p.z - GATE.z) < 10
        ? '木戸の前で城兵を退けよ' : '道に沿って平田の木戸へ進め';
    } else if (F.step === 2 && (!F.foes.every(gone) || Math.hypot(p.x - OMURA.x, p.z - OMURA.z) >= OMURA.r)) {
      // 敵が退いても、柵を横切る直線へ案内を戻さない。帰りも同じ道の印を使う。
      let i = F.routeIndex || 0;
      // すでに坂の北へ出ている者を、南の口へ戻さない。
      while (i < 4 && (Math.hypot(p.x - OMURA_TURNS[i].x, p.z - OMURA_TURNS[i].z) < 7 || p.z < OMURA_TURNS[i].z - 8)) i++;
      F.routeIndex = i; at = OMURA_TURNS[i];
      text = i === 0 ? '西の道の印へ。柵の外で集まれ' : i < 3 ? '西の柵沿いを北へ進め' : i === 3 ? '坂の曲がり角へ進め。大村は北じゃ'
        : F.foes.every(gone) ? '大村の印へ集まれ。列を固めよ' : '大村の旗で味方と寄せ手を退けよ';
    }
    if (at === F.routeAt && text === F.routeText) return;
    F.routeAt = at; F.routeText = text;
    F.routeName = F.step === 1 ? at === GATE ? '平田の口' : '南の道'
      : at === OMURA_TURNS[4] ? '大村の持ち場' : at === OMURA_TURNS[3] ? '大村の坂'
        : at === OMURA_TURNS[0] ? '西の曲がり角' : '柵の西側';
    rt.unmark('route');
    if (at) {
      rt.marker('route', () => F.routeAt, () => placeLabel(rt, F.routeAt, F.routeName), { guideAlways: true });
      rt.obj('main', text, 'main');
    }
  },
  convoy(rt) {
    const F = rt.flags;
    if (F.step || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t; F.battleT = rt.t; F.nextSortie = rt.t + 59; rt.setPhase('convoy');
    F.roadGoal = { x: -104, z: -48 };
    rt.marker('road', () => F.roadGoal, () => placeLabel(rt, F.roadGoal, '味方の槍組', 9), { guideAlways: true });
    rt.obj('main', '味方の槍組で荷の護衛を退けよ', 'main');
    this.commandSignal(rt, 'kakari', '合図：法螺貝と陣太鼓の早打ち。西の道をふさげ');
    rt.say('羽柴秀吉', '法螺と早太鼓じゃ。槍組、懸かれ！　城へ荷を通すな！', 5);
    rt.after(2.2, () => {
      if (!F.ending && !rt.over && rt.player.u.alive && F.step === 1 && !gone(F.guard)) {
        rt.army.play('toki', this.spearAt(F.guard), .8);
      }
    });
    F.carts.order = 'path'; F.carts.path = LANE.slice(1); F.carts.pathIdx = 0;
    // 道の手前から約二十三歩。下知の後すぐに槍列が合流口へ届く。
    // 北へ外れた位置で後列の到着を待たず、味方の持ち場まで先手を進める。
    move(F.escort, -104, -44, 'attack');
    F.escort.march = true;
    F.escort.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.march = false; q.dest = null; q.onArrive = null; };
    move(F.egun, -136, -86);
    // 槍組は南西の道、鉄砲組はその後ろへ。北の柵際へ分断しない。
    for (const [g, path, then] of [
      [F.guard, [[-104, -48], [-108, -48]], 'attack'],
      [F.hgun, [[-90, -42]], 'hold'],
    ]) {
      if (gone(g)) continue;
      g.order = 'path'; g.path = path; g.pathIdx = 0; g.march = true;
      g.onArrive = (q) => { q.order = then; q.march = false; q.onArrive = null; };
    }
    rt.after(24, () => {
      if (F.ending || F.step !== 1 || rt.over) return;
      // 城からの出撃は搬入と同時。三木城の手前で新兵を作らない。
      if (!F.sallies.every(gone)) {
        this.sendSortie(F.sally);
      }
      rt.say('組頭', F.dropped ? '城兵が来る！　平田の口で受けよ！'
        : '城兵も浅瀬へ来るぞ！　まず槍組と荷の護衛を退けよ', 4);
      if (F.dropped) rt.marker('hirata', GATE, () => placeLabel(rt, GATE, '平田の口'), {});
    });
  },
  roadTurn(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 合流前、南の道を歩く時だけ折れ目を示す。柵の内側へ横切らせない。
    let turn = -1;
    if (F.step <= 1 && !F.dropped && p.z > -52 && p.z < -36 && p.x > -82 && p.x < -30) {
      turn = p.x > -56 ? 1 : 2;
      if (Math.hypot(p.x - ASSEMBLY_TURNS[turn].x, p.z - ASSEMBLY_TURNS[turn].z) < 5) turn++;
      if (turn >= ASSEMBLY_TURNS.length - 1) turn = -1;
    }
    if (turn === F.roadTurn) return;
    F.roadTurn = turn;
    rt.unmark('road-turn');
    if (turn >= 0) rt.marker('road-turn', ASSEMBLY_TURNS[turn], '南の曲がり道', {});
  },
  dropLoads(rt) {
    const F = rt.flags;
    if (F.dropped || F.supplyThrough) return;
    F.dropped = true; F.supplyBlocked = true;
    F.loadClosed = [false, false];
    this.roadTurn(rt);
    // 西の護衛を退けた同じ槍組を木戸へ戻す。西の旧い持ち場に留めない。
    if (!gone(F.guard)) {
      F.guard.order = 'path'; F.guard.march = true; F.guard.dest = null; F.guard.focus = null;
      F.guard.path = [[-104, -44], [GATE.x, GATE.z]]; F.guard.pathIdx = 0;
      for (const u of F.guard.units) { u.target = null; u.watch = null; }
      F.guard.onArrive = q => { q.order = 'hold'; q.march = false; q.onArrive = null; };
    }
    rt.unmark('road');
    rt.marker('hirata', GATE, () => placeLabel(rt, GATE, '平田の口'), {});
    rt.obj('main', '平田の口を守れ。城兵を押し返せ', 'main');
    rt.award((t) => t.side.push('護衛を退け、兵糧を止めた'), '城への兵糧を止めた');
    // 阻止は追加の補給がない事。城の既存の兵糧を四日分消す処理は呼ばない。
    const c = F.carts.center();
    flee(F.carts, -1, 0);
    rt.say('組頭', '荷は止めた！　柵は越えず、南の木戸で味方と城兵を受けよ！', 4);
    F.loads = [{ x: c.x - 3, z: c.z + 2 }, { x: c.x + 4, z: c.z - 3 }];
    rt.obj('loads', '余裕があれば近くの俵を押さえよ', 'side');
    F.loads.forEach((q, i) => {
      for (let j = 0; j < 4; j++) {
        const mesh = F.sacks[i * 4 + j].mesh;
        const x = q.x + (j % 2) * 1.2, z = q.z + Math.floor(j / 2) * 1.2;
        mesh.position.set(x, rt.world.heightAt(x, z), z); mesh.visible = true;
      }
      rt.marker('ld' + i, q, () => placeLabel(rt, q, i === 0 ? '一束目の俵' : '二束目の俵', 3), { h: 2 });
      rt.addInteract('ld' + i, q, '俵を押さえる', () => this.take(rt, i), { r: 3, hold: 1.4 });
    });
  },
  loadAvailable(rt, i) {
    const F = rt.flags, q = F.loads[i];
    for (let j = 0; j < 4; j++) {
      const s = F.sacks[i * 4 + j];
      if (!s.stored && s.mesh.parent === rt.scene &&
        Math.hypot(s.mesh.position.x - q.x, s.mesh.position.z - q.z) < 4) return true;
    }
    return false;
  },
  take(rt, i) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || !F.dropped || F.step !== 1 || !Number.isInteger(i) || i < 0 || i >= F.loads.length || F.loadTaken?.[i] || F.loadClosed[i] || !this.loadAvailable(rt, i)) return;
    if (!F.loadTaken) F.loadTaken = [false, false];
    F.loadTaken[i] = true; F.taken++;
    rt.uninteract('ld' + i); rt.unmark('ld' + i);
    rt.objProgress('loads', `${F.taken}／2束。城兵が来たら持ち場を守れ`);
    if (F.taken >= 2) rt.objDone('loads');
    const label = i === 0 ? '一束目の兵糧を押さえた' : '二束目の兵糧を押さえた';
    rt.award((t) => t.side.push(label), label);
  },
  haulArrive(rt, h) {
    const F = rt.flags, s = h.sack;
    if (!s || F.ending || rt.over || !h.u.alive || h.u.fleeing || h.u.woundOut) return;
    if (!h.carrying) {
      // 要だけの到着では運ばない。本物の担ぎ手が俵の所へ来た時だけ持ち上げる。
      if (Math.hypot(h.u.pos.x - s.mesh.position.x, h.u.pos.z - s.mesh.position.z) > 2.5) {
        h.g.onArrive = h.arrive; return;
      }
      h.carrying = true; rt.scene.remove(s.mesh); h.u.mesh.add(s.mesh);
      s.mesh.position.set(0, 1.05, 0.15); s.mesh.rotation.y = 0;
      s.mesh.scale.set(1 / h.u.mesh.scale.x, 1 / h.u.mesh.scale.y, 1 / h.u.mesh.scale.z);
      h.g.path = h.back; h.g.pathIdx = 0; h.g.onArrive = h.arrive;
    } else {
      if (Math.hypot(h.u.pos.x - h.store.x, h.u.pos.z - h.store.z) > 2) {
        h.g.onArrive = h.arrive; return;
      }
      h.u.mesh.remove(s.mesh); rt.scene.add(s.mesh);
      s.mesh.scale.set(1, 1, 1);
      const n = F.storedLoads++;
      const x = HIRATA.x - 2 + (n % 4) * 1.1, z = HIRATA.z + 7 + Math.floor(n / 4) * 1.1;
      s.mesh.position.set(x, rt.world.heightAt(x, z), z);
      s.stored = true; s.worker = null; h.sack = null; h.carrying = false;
      h.g.order = 'hold'; h.g.onArrive = null;
    }
  },
  haulLoads(rt) {
    const F = rt.flags;
    if (!F.dropped) return;
    for (const h of F.haulers) {
      if (!h.u.alive || h.u.fleeing || h.u.woundOut) {
        if (h.sack) {
          const s = h.sack;
          if (h.carrying) {
            h.u.mesh.remove(s.mesh); rt.scene.add(s.mesh); s.mesh.position.copy(h.u.pos); s.mesh.scale.set(1, 1, 1);
          }
          s.worker = null; h.sack = null; h.carrying = false;
        }
        continue;
      }
      // 寄せ手が近い間は運搬を止める。回収待ちを勝敗の条件にしない。
      let danger = false;
      for (const g of F.foes) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
          Math.hypot(u.pos.x - h.u.pos.x, u.pos.z - h.u.pos.z) < 14) danger = true;
      }
      if (danger) { if (h.sack) { h.g.order = 'hold'; h.paused = true; } continue; }
      if (h.paused) { h.paused = false; h.g.order = 'path'; }
      if (h.sack) continue;
      // 荷を止めたら回収を始める。本人の手柄の操作を待って立ち尽くさない。
      for (const s of F.sacks) {
        if (s.stored || s.worker) continue;
        h.sack = s; s.worker = h;
        h.out[2][0] = s.mesh.position.x; h.out[2][1] = s.mesh.position.z + 1;
        h.g.order = 'path'; h.g.path = h.out; h.g.pathIdx = 0; h.g.march = true; h.g.onArrive = h.arrive;
        break;
      }
    }
    // 運び去った俵の場所へ戻らせない。回収済みの荷は本人の戦功に数えない。
    if (F.loadsRetired) return;
    for (let i = 0; i < F.loads.length; i++) {
      if (F.loadTaken?.[i] || F.loadClosed[i] || this.loadAvailable(rt, i)) continue;
      F.loadClosed[i] = true;
      rt.unmark('ld' + i); rt.uninteract('ld' + i);
    }
    if (F.taken < 2 && F.loads.every((q, i) => F.loadTaken?.[i] || F.loadClosed[i])) {
      F.loadsRetired = true; rt.objRemove('loads');
    }
  },
  omura(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t; rt.setPhase('omura');
    // 未明の搬入阻止から朝の反撃へ。兵の損失と手傷は持ち越す。
    rt.world.setTime('morning');
    // 西の坂で列を立て直す間に夜が明ける。共通の空の移ろいを使い、光を追加しない。
    if (rt.world.fade) rt.world.fade.dur = 70;
    F.routeIndex = 0;
    rt.unmark('road'); rt.unmark('hirata'); rt.unmark('hirata-foe'); F.hirataFoe = null;
    F.loadsRetired = true; rt.objRemove('loads');
    for (const id of ['ld0', 'ld1']) { rt.unmark(id); rt.uninteract(id); }
    rt.obj('main', '大村の印へ進め。味方と寄せ手を退けよ', 'main');
    this.routeTick(rt);
    this.commandSignal(rt, 'nobiki', '合図：低い法螺貝と間を空けた退き太鼓。大村へ退け');
    rt.marker('omura', OMURA, () => placeLabel(rt, OMURA, '大村の持ち場', OMURA.r), {});
    rt.zone('omura', OMURA.x, OMURA.z, OMURA.r);
    // 坂の地面に沿わせ、判定と同じ輪を一度だけ作る。
    rt.drapeRing(rt.rings[rt.rings.length - 1], OMURA.x, OMURA.z);
    rt.banner('平田から大村へ', '谷大膳の持ち場は敵の手に。西の坂で立て直せ');
    rt.say('伝令', '谷大膳殿が討たれた！　西の道から大村へ退け！', 4);
    // 谷大膳は見せている組と別の持ち場。見える兵を秒数で殺さない。
    // 討死の知らせを受ける近くの組だけが動揺する。損失を戻さず、西の道への後退と再集結へつなぐ。
    for (const g of [F.guard, F.hgun, F.hirata]) {
      if (gone(g)) continue;
      g.morale = Math.max(0, g.morale - 8);
    }
    rt.after(5, () => {
      if (!F.ending && !rt.over && rt.player.u.alive && F.step === 2) rt.say('羽柴秀吉', '荷は止めた。列を立て直せ！　大村で押し返すぞ', 4);
    });
    // 柵を横切る直線の下知を避け、槍・鉄砲・大将の順で西の坂へ回る。
    for (const [g, x, z, then] of [
      [F.guard, OMURA.x + 4, OMURA.z + 12, 'attack'],
      [F.hirata, OMURA.x - 4, OMURA.z + 16, 'attack'],
      [F.hgun, OMURA.x + 30, OMURA.z + 32, 'hold'],
      [F.hide, OMURA.x + 18, OMURA.z + 44, 'hold'],
    ]) {
      if (gone(g) || g === F.hide && F.hideRetired) continue;
      g.order = 'path'; g.march = true; g.dest = null;
      g.path = g === F.hirata ? [[GATE.x, GATE.z], [-104, -48], [-100, -64], [-94, -78], [-80, -84], [x, z]]
        : [[-104, -48], [-100, -64], [-94, -78], [-80, -84], [x, z]];
      g.pathIdx = 0;
      g.onArrive = (q) => { q.order = then; q.march = false; q.facing = Math.PI; q.onArrive = null; };
    }
    // 同じ後列を槍組に続かせる。位置の入れ物は一度だけ作り、毎コマ使い回す。
    const rear = { x: 0, z: 0, facing: 0 };
    F.hideMass.follow(() => {
      const guard = this.omuraGuard(rt);
      if (F.ending || rt.over || !guard) return null;
      let x = 0, z = 0, n = 0;
      for (const u of guard.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        x += u.pos.x; z += u.pos.z; n++;
      }
      if (!n) return null;
      rear.x = x / n; rear.z = z / n; rear.facing = guard._face ?? guard.facing;
      return rear;
    }, { gap: 18 });
    // 控えは大村へ寄った味方を押し返す。城方まで深追いしない。
    if (!gone(F.reserve)) {
      F.reserve.order = 'attack'; F.reserve.formation = 'yari';
      F.reserve.focus = null; F.reserve.dest = null; F.reserve.onArrive = null;
      F.reserve.aggro = 12; F.reserve.seekRange = 24;
      for (const u of F.reserve.units) { u.target = null; u.watch = null; }
      // 平田まで寄せた控えも、味方と同じ柵の外を回る。柵へ直進して取り残さない。
      if (Math.hypot(F.reserve.anchor.x - OMURA.x, F.reserve.anchor.z - OMURA.z) > 24) {
        F.reserve.order = 'path'; F.reserve.march = true;
        F.reserve.path = [[GATE.x - 8, GATE.z], [-104, -48], [-100, -64], [-94, -78], [-80, -84], [OMURA.x, OMURA.z]];
        F.reserve.pathIdx = 0;
        F.reserve.onArrive = q => { q.order = 'attack'; q.march = false; q.onArrive = null; };
      }
    }
  },
  end(rt, won, reason) {
    // 荷の到着・両持ち場の崩れ・退く下知は決着。近くの敵との打ち合いで先延ばしにしない。
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true;
    if (!F.clashRetired) { F.clashRetired = true; F.roadClash.rout(won ? 'B' : 'A', { hideAfter: 8 }); }
    for (const h of F.haulers) { h.g.order = 'hold'; h.g.onArrive = null; }
    rt.setPhase('end'); rt.objProgress('main', '');
    rt.objRemove('loads');
    for (const id of ['road', 'road-turn', 'route', 'ford', 'hirata', 'hirata-foe', 'omura', 'join', 'ld0', 'ld1', 'hide-retreat', 'repair']) rt.unmark(id);
    rt.unzone('omura');
    rt.uninteract('ld0'); rt.uninteract('ld1');
    rt.tracker.main = won;
    if (won) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; }, '兵糧の道を守った');
      rt.banner('兵糧の道を守った', '兵糧を止め、寄せ手を退けた。三木の囲みは続く');
      rt.say('組頭', 'おぬしらが守った道じゃ。組の者と陣へ戻り、次の下知に備えよ', 4);
      rt.after(4.5, () => {
        // 勝敗はすでに決まっている。結果の画面へ移る前に、後日の結末を伝える。
        if (!rt.ended) rt.banner('翌年正月十七日、三木は開城', '二年近い囲みの末、長治は城兵の命と引き換えに切腹した');
      });
    } else {
      rt.obj('main', reason, 'main'); rt.objFail('main');
      rt.banner('持ち場を保てなかった', F.supplyThrough ? `${F.delivered}荷が城へ入った。囲みを立て直す` : reason);
      rt.say('組頭', '次は味方の列を離れるな。敵の打ち込みを受け、隙に突き返せ。俵より持ち場じゃ', 4);
      move(F.hide, -20, -100); move(F.guard, -32, -92); move(F.hgun, -8, -104); move(F.hirata, -44, -92);
    }
    // 決着の理由を、結果待ちの被弾で上書きしない。手傷は戻さない。
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: won ? '' : reason }, won ? 12 : 8);
  },
  // 持ち場で本人が先手を崩すと、そばの味方が踏みとどまる。各山場で一度だけ。
  // 士気だけを変え、死者・傷・弾・兵糧を戻さない。手柄がなくても任務は進む。
  onKill(rt, v, k) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || k !== rt.player.u || v.civ || v.isStruct) return;
    const stage = F.step - 1;
    if (stage < 0 || stage > 1 || F.frontMerit[stage]) return;
    const foe = stage === 0 ? F.escort : F.reserve;
    const at = stage === 0 ? F.guard.anchor : OMURA;
    if (v.group !== foe || Math.hypot(v.pos.x - at.x, v.pos.z - at.z) > 24 ||
      Math.hypot(k.pos.x - at.x, k.pos.z - at.z) > 24) return;
    if (++F.frontKills[stage] < 3) return;
    F.frontMerit[stage] = true;
    if (!gone(foe)) foe.morale = Math.max(0, foe.morale - 8);
    if (!gone(F.guard)) F.guard.morale = Math.min(100, F.guard.morale + 6);
    const label = stage === 0 ? '兵糧の道で槍組の先手を務めた' : '大村で味方の反撃を支えた';
    rt.award((t) => t.side.push(label), label);
    rt.say('組頭', stage === 0 ? 'よう踏み込んだ！　槍組、この者に続け！'
      : '見よ、味方の先手じゃ！　槍をそろえ、坂を押し返せ！', 3);
  },
  update(rt, dt) {
    const F = rt.flags;
    mikiKidoLight(rt, dt);
    // 空の色のしきい値だけで星が一斉に消えないよう、夜明けに合わせて薄くする。
    if (rt.world.stars) {
      const night = rt.world.nightAmount();
      rt.world.stars.material.opacity = .24 * night;
      rt.world.stars.visible = night > .02;
    }
    // 布だけを風で揺らす。骨は固定し、形と材質は準備時のものを使い回す。
    for (let i = 0; i < F.horoCloths.length; i++) {
      const cloth = F.horoCloths[i], wave = Math.sin(WIND_STATE.t * 3 + i * 1.7);
      cloth.rotation.x = 0.04 + wave * 0.025 * Math.min(2, WIND_STATE.gust);
      cloth.rotation.z = wave * 0.025;
    }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.poll = (F.poll || 0) - dt;
    if (F.poll > 0) return;
    F.poll = 0.5;
    this.haulLoads(rt);
    this.roadTurn(rt);
    if (!F.step) return;
    this.sortieTick(rt);
    this.routeTick(rt);
    // 敵将の声は、姿と声が届く距離で各一度だけ。遠くの城主に叫ばせない。
    const speakerBit = F.step === 2 ? 2 : 1;
    const speaker = (F.step === 2 ? F.reserve : F.sally).units[0];
    if (!(F.foeSpoken & speakerBit) && speaker.alive && !speaker.fleeing && !speaker.woundOut &&
      Math.hypot(speaker.pos.x - rt.player.u.pos.x, speaker.pos.z - rt.player.u.pos.z) < 24 &&
      weatherSees(rt.world, rt.player.u.pos, speaker.pos) && !rt.army.terrainBlocks(rt.player.u.pos, speaker.pos) &&
      !rt.army.wallBetween(rt.player.u.pos, -1, speaker.pos)) {
      F.foeSpoken |= speakerBit;
      rt.say(speaker.name, F.step === 2 ? 'この坂は渡さぬ。城の者を飢えさせるな！'
        : '荷を待つ者が城におる。平田の口を押せ！', 4);
    }
    if (F.step === 1) {
      pressFront(rt, F.escort, F.guard.anchor);
      // 味方も先頭が接敵すれば受ける。柵の回り道は目前の敵に届くまで保つ。
      pressFront(rt, F.guard, F.dropped ? GATE : F.guard.anchor, 8);
      pressFront(rt, F.hirata, GATE, 8);
      // 出撃の下知を受けた組だけ動かす。川の浅瀬までの道は保つ。
      for (const g of F.sallies) if (g.sortieStarted) pressFront(rt, g, GATE);
      if (F.reserve.order === 'path' || F.reserve.order === 'attack') pressFront(rt, F.reserve, GATE);
    } else if (F.step === 2) {
      pressFront(rt, F.reserve, OMURA);
      pressFront(rt, F.guard, OMURA, 8);
      pressFront(rt, F.hirata, OMURA, 8);
    }
    const hit = rt.player.lastHit;
    if (hit && rt.t - hit.t < 2 && rt.player.u.alive && rt.t >= (F.dangerSaidT ?? -24) + 24) {
      F.dangerSaidT = rt.t;
      F.dangerCount = (F.dangerCount || 0) + 1;
      rt.bark(hit.ranged
        ? '矢玉が来るで！　柵の陰へ下がれ！'
        : hit.back || hit.side
          ? '脇を取られたぞ！　向き直れ、味方の列へ下がれ！'
          : hit.guardBroken || hit.exhausted
            ? '構えが崩れたぞ！　味方の後ろで息を整えよ！'
            : F.dangerCount <= 2 ? '正面を守れ！　味方の列で受けよ' : '隣と槍をそろえよ！　列を離れるな', true);
    }
    if (gone(F.escort) && gone(F.egun) && !F.massRetired[0]) { F.massRetired[0] = true; F.escortMass.retreat(30, 20); }
    if (F.sallies.every(gone) && !F.massRetired[1]) { F.massRetired[1] = true; F.sallyMass.retreat(30, 20); }
    // 手傷を負った秀吉は護衛の後ろで退く。時間による治癒・復帰はさせない。
    if (F.hideU.woundOut && !F.hideRetired) { F.hideRetired = true; move(F.hide, -12, -112); rt.marker('hide-retreat', F.hideU.pos, '手負いの秀吉の馬印', { group: F.hide }); rt.say('組頭', '殿が手傷じゃ。退く馬印の前を固めよ', 3); }
    // 持ち場が押し破られた所だけ開く。修復すると同じ柵と当たりへ戻す。
    let opening = false, repairDistance = 12;
    F.repairAt = null;
    for (const q of F.blockades) {
      if (q.broken) {
        opening = true;
        const d = Math.hypot(rt.player.u.pos.x - q.x, rt.player.u.pos.z - q.z);
        if (d < repairDistance) { repairDistance = d; F.repairAt = q; }
        continue;
      }
      let enemy = 0, friend = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct) continue;
        if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 12) continue;
        // 近くを通っただけで柵が消えない。柵の区画へ届く寄せ手だけが押し破る。
        if (u.team === 1) {
          const seg = q.wall.seg;
          if (!u.civ && lineDistance(u.pos.x, u.pos.z, seg[0], seg[1], seg[2], seg[3]) < 2.4 &&
            Math.abs(u.pos.y - rt.world.heightAt(q.x, q.z)) < 3) enemy++;
        } else friend++;
      }
      q.damage = enemy > friend ? q.damage + (enemy - friend) * 0.5 : Math.max(0, q.damage - 0.5);
      if (q.damage >= 12) {
        q.broken = true; opening = true; q.wall.opened = true; q.wall.wall = false;
        if (q.wall.mesh) q.wall.mesh.visible = false;
        if (rt.t >= (F.fenceSaidT ?? -8) + 8) {
          F.fenceSaidT = rt.t;
          rt.bark(F.step === 2 ? '平田の柵が破れた！　戻らず大村で列を固めよ'
            : F.dropped ? '柵が破れた！　木戸の味方と城兵を受けよ'
              : '柵が破れた！　まず荷を止めよ。余裕があれば柵を直せ');
        }
      }
    }
    if (!F.dropped && !F.supplyThrough) {
      // 柵の持ち場が残る間は合流口で荷を止める。隙が開けば搬入を再開する。
      if (F.carts.anchor.x > -108 && F.carts.anchor.x < -90 && !opening && !gone(F.hirata)) {
        if (F.carts.order === 'path') { F.carts.order = 'hold'; F.convoyHeld = true; }
      } else if (F.convoyHeld) { F.carts.order = 'path'; F.convoyHeld = false; }
      // 先頭の荷も見落とさず、一度通った荷だけを搬入分に数える。
      for (let i = 0; i < F.carts.units.length; i++) {
        const u = F.carts.units[i];
        if (F.cartArrived[i] || !u.alive || u.fleeing || u.woundOut || u.pos.x <= 60 || u.pos.z <= 0) continue;
        F.cartArrived[i] = 1; F.delivered++;
      }
      if (F.delivered > 0) {
        F.supplyThrough = true; kakoiEvent.supplyThrough(F.kakoi, 5 * F.delivered / F.carts.units.length);
        return this.end(rt, false, '兵糧の荷が城の口を抜けた');
      }
      // 槍の護衛が崩れれば、鉄砲組も荷を捨てて退く。遠い射手の全滅を待たせない。
      if (gone(F.escort)) {
        if (!gone(F.egun)) flee(F.egun, -1, 0);
        this.dropLoads(rt);
      }
    }
    // 自分の体力とは別に、二つの持ち場を守る戦。退く前から残る戦える兵を知らせる。
    let guardLeft = 0, hirataLeft = 0;
    for (const u of F.guard.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) guardLeft++;
    for (const u of F.hirata.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) hirataLeft++;
    const omuraGuard = F.step === 2 ? this.omuraGuard(rt) : null;
    const omuraLeft = omuraGuard === F.hirata ? hirataLeft : guardLeft;
    const omuraSupport = F.step === 2 ? this.omuraSupport(rt) : null;
    let supportLeft = 0;
    if (omuraSupport) for (const u of omuraSupport.units) {
      if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) supportLeft++;
    }
    // 三分の一まで減ってからでは列を支える間がない。六割で最初の警告を出す。
    // 警告だけを早め、敗北の条件・兵の強さ・士気は変えない。
    const guardThin = F.step === 2 ? !omuraGuard || omuraLeft <= omuraGuard.units.length * .6 || omuraGuard.morale <= 25
      : gone(F.guard) || guardLeft <= F.guard.units.length * .6 || F.guard.morale <= 25;
    const hirataThin = gone(F.hirata) || hirataLeft <= F.hirata.units.length * .6 || F.hirata.morale <= 25;
    // 平田を捨てて大村へ移った後は、古い持ち場を敗北の条件にしない。
    if (F.step === 1 && gone(F.guard) && gone(F.hirata)) return this.end(rt, false, '西の槍組も平田の守りも退いた。持ち場を失った');
    if (F.step === 2 && !omuraGuard && gone(F.hgun) && gone(F.hide)) return this.end(rt, false, '大村へ退いた味方の列も崩れた。坂を守れず退く');
    if (F.step === 2 && guardThin && !F.omuraGuardWarned) {
      F.omuraGuardWarned = true;
      rt.say('組頭', !omuraGuard ? '大村の槍組が退いた！　残る味方の列へ下がれ！'
        : '大村の槍組が崩れそうじゃ！　坂の味方へ下がり、列を支えよ！', 5);
    } else if (F.step === 1 && guardThin && !F.guardWarned) {
      F.guardWarned = true;
      rt.say('組頭', gone(F.guard) ? '西の槍組が退いた！　平田の口で味方と受けよ！'
        : '西の槍組が崩れそうじゃ！　味方の旗へ寄れ。列を支えよ！', 5);
    } else if (F.step === 1 && hirataThin && !F.hirataWarned) {
      F.hirataWarned = true;
      rt.say('組頭', gone(F.hirata) ? '平田の守りが退いた！　残る槍組と道を守れ！'
        : '平田の守りが減ったぞ！　南の木戸で城兵を受けよ！', 5);
    }
    const left = Math.max(0, Math.ceil(BATTLE_LIMIT - (rt.t - F.battleT)));
    const deadline = left <= 60 ? `。退く下知まで${left}秒。持ち場へ戻れ` : '';
    if (F.dropped && F.taken < 2) rt.objProgress('loads', `${F.taken}／2束。戦功が増す`);
    let guide = '';
    if (F.step === 1) guide = F.dropped
      ? F.sallies.every(gone) ? '荷は止めた。大村へ移る下知を待て' : '柵の外を南へ回れ。平田で城兵を退けよ'
      : '道の印で槍組に加われ。西の護衛を退けよ';
    if (F.step === 1 && F.dropped && F.sallies.every(gone)) this.omura(rt);
    F.hirataFoe = null;
    if (F.step === 1 && F.dropped) {
      let castleSoldiers = 0, nearest = 32;
      const p = rt.player.u.pos;
      // 浅瀬の小隊だけでなく、西の坂から加わった城兵も見届ける。
      // 同じ敵隊の一覧を使い、寄せる前の控えは門の近くへ来るまで印にしない。
      for (const g of F.foes) for (const u of g.units) {
        if (!g.sortieStarted && g !== F.reserve) continue;
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        castleSoldiers++;
        if (Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) > 24) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d >= nearest || !weatherSees(rt.world, p, u.pos) ||
          rt.army.terrainBlocks(p, u.pos) || rt.army.wallBetween(p, -1, u.pos)) continue;
        nearest = d; F.hirataFoe = u;
      }
      F.castleLeft = castleSoldiers;
    }
    if (F.step === 2) guide = F.foes.every(gone)
      ? '大村の印へ集まれ。列を固めよ'
      : '大村の印で味方と敵を退けよ';
    // 搬入阻止の間は同じ印を保つ。通り過ぎても失敗のような「戻れ」に替えない。
    const p = rt.player.u.pos;
    const onRoad = F.step === 1 && !F.dropped;
    if (onRoad) {
      const guardUp = !gone(F.guard), c = guardUp ? F.guard.center() : GATE;
      let soldier = null, best = Infinity;
      if (guardUp) for (const u of F.guard.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
        if (d < best) { soldier = u; best = d; }
      }
      // 敵と押し合う兵そのものへ歩かせず、味方側の後ろで合流する。
      F.roadGoal.x = (soldier ? soldier.pos.x : c.x) + 3;
      F.roadGoal.z = (soldier ? soldier.pos.z : c.z) + 3;
      if (Math.hypot(p.x - F.roadGoal.x, p.z - F.roadGoal.z) < 10) guide = '槍組と構え、護衛を退けよ';
      let nearest = null, distance = Infinity;
      for (const u of F.escort.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 20) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < distance && !rt.army.wallBetween(p, -1, u.pos)) { nearest = u; distance = d; }
      }
      if (nearest) {
        if (distance < 12 && !F.clashHint) {
          F.clashHint = true;
          rt.hud.hint('敵が来たで！　足を止め、槍組と打ち合え！', '', 5000);
        }
      }
    }
    let nearby = 0, closeFoes = 0, closeAllies = 0;
    for (const u of rt.army.units) {
      if (u.isPlayer || u.isStruct || !u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (u.team === rt.player.u.team) {
        if (nearby < 5 && d < 18 && !rt.army.wallBetween(p, -1, u.pos)) nearby++;
        // 柵の向こうや遠い味方は支えに数えず、敵と同じ範囲で列を調べる。
        if (d < 6 && Math.abs(u.pos.y - p.y) < 3 && weatherSees(rt.world, p, u.pos) &&
          !rt.army.terrainBlocks(p, u.pos) && !rt.army.wallBetween(p, -1, u.pos)) closeAllies++;
      } else if (d < 6 && Math.abs(u.pos.y - p.y) < 3 && weatherSees(rt.world, p, u.pos) &&
        !rt.army.terrainBlocks(p, u.pos) && !rt.army.wallBetween(p, -1, u.pos)) closeFoes++;
    }
    let join = null;
    if (F.step === 1 && gone(F.guard) && !gone(F.hirata)) join = F.hirata;
    else if (F.step === 1 && F.dropped && gone(F.hirata) && !gone(F.guard)) join = F.guard;
    else if (!onRoad && nearby < 5) {
      if (F.step === 1 && F.dropped && !F.sallies.every(gone) && !gone(F.hirata)) join = F.hirata;
      else if (F.step === 2 && omuraSupport) join = omuraSupport;
      else if (!gone(F.guard)) join = F.guard;
      else if (F.step === 2 && !gone(F.hide) && !F.hideRetired) join = F.hide;
      else if (F.step === 2 && !gone(F.hgun)) join = F.hgun;
      else if (F.step === 1 && !gone(F.hirata)) join = F.hirata;
    }
    if (join !== F.joinGroup) {
      rt.unmark('join'); F.joinGroup = join;
      if (join) {
        const joinAt = () => this.spearAt(join);
        rt.marker('join', joinAt, () => {
          const at = joinAt();
          return at ? placeLabel(rt, at, F.step === 2 ? '大村の味方' : '味方の槍組') : '';
        }, { group: join, guideAlways: true });
      }
    }
    if (join) guide = F.step === 2 ? '味方と大村を守れ' : '槍組に加われ。柵は南の口へ回れ';
    if (F.routeAt) guide = F.routeText;
    if (this.guideMarker(rt) === 'join') guide = F.step === 2 ? '味方と大村へ進め' : '味方と城兵を受けよ';
    // 道しるべが味方の列を指す間は、木戸での待機で合流の下知を消さない。
    if (F.step === 1 && F.dropped && F.routeAt === GATE && this.guideMarker(rt) !== 'join' && Math.hypot(p.x - GATE.x, p.z - GATE.z) < 10) {
      guide = F.hirataFoe ? Math.hypot(F.hirataFoe.pos.x - p.x, F.hirataFoe.pos.z - p.z) > 10
        ? '城兵が近づく。味方と木戸を守れ' : '味方と木戸の城兵を退けよ'
        : F.sallies.every(gone) && gone(F.reserve) ? '木戸で構え、下知を待て'
          : '木戸で味方と城兵を受けよ';
    }
    if (F.roadTurn >= 0) guide = '南の曲がり道から西の槍組に加われ';
    if (F.step === 2 && F.foes.every(gone)) guide = F.routeAt ? F.routeText : '大村の印へ集まれ。列を固めよ';
    // 寄せ手が目前にいる時は、移動の下知より今の受け方を伝える。
    const regroupAt = this.regroupAt(rt);
    const front = regroupAt || (F.step === 2 ? OMURA : F.dropped ? GATE : F.guard.anchor);
    const away = Math.hypot(p.x - front.x, p.z - front.z) > 24;
    // 味方と並んだ打ち合いを囲みと呼ばない。孤立や数で押される時は下がらせる。
    const outnumbered = closeFoes >= 3 && closeFoes > closeAllies + 1;
    F.withdrawGuide = closeFoes > 0 && (away || outnumbered);
    if (closeFoes && away) guide = F.step === 2 && (F.routeIndex || 0) < 4
      ? this.guideMarker(rt) === 'join' ? '味方と大村へ退け'
        : `構えて${F.routeName}へ退け`
      : F.routeAt ? `構えて${F.routeName}へ戻れ`
        : '敵を追わず味方の槍組へ戻れ';
    else if (closeFoes) guide = rt.player.sta < rt.player.maxSta * .3
      ? '味方の後ろへ下がり、息を整えよ'
      : outnumbered ? '囲まれるぞ。構えて味方へ下がれ'
        : F.routeAt && Math.hypot(p.x - F.routeAt.x, p.z - F.routeAt.z) > 10
          ? `構えて${F.routeName}へ進め`
          : F.step === 2 ? '味方と大村を守れ'
          : F.dropped ? '味方と木戸を守れ'
            : '槍組と構え、護衛を退けよ';
    const regrouped = regroupAt && Math.hypot(p.x - regroupAt.x, p.z - regroupAt.z) < 10 &&
      !outnumbered && rt.player.sta >= rt.player.maxSta * .3;
    if (F.step === 1 && gone(F.guard) && F.joinGroup) guide = regrouped
      ? '平田の味方と城兵を退けよ' : closeFoes
      ? '川へ出ず、平田の味方へ下がれ'
      : '平田の味方の印へ戻れ。共に城兵を受けよ';
    // 出所のない撤退の知らせで任務を置き換えず、実際に示す合流先を伝える。
    else if (F.step === 1 && F.dropped && gone(F.hirata) && F.joinGroup) guide = regrouped
      ? '味方の槍組と構え、城兵を退けよ' : closeFoes
      ? '構えて味方の槍組へ下がれ'
      : '味方の槍組の印へ戻れ。共に城兵を受けよ';
    // 物見した荷だけ知らせる。見失った位置を現在地として出し続けない。
    let loadGuide = '';
    if (!F.dropped && !F.supplyThrough) {
      const yaw = rt.player.yaw;
      for (const u of F.carts.units) {
        if (!u.alive || u.fleeing) continue;
        const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d > 70 || dx * Math.sin(yaw) + dz * Math.cos(yaw) < d * 0.5 ||
          !weatherSees(rt.world, p, u.pos) || rt.army.terrainBlocks(p, u.pos) || rt.army.wallBetween(p, -1, u.pos)) continue;
        const place = u.pos.x < -104 ? '西の道' : u.pos.x < 10 ? '平田の南の道' : '城へ向かう道';
        // 守るのは荷の道。城までの距離を並べ、城へ進む任務と誤解させない。
        loadGuide = `荷は${place}`;
        if (u.pos.x > -90 && !F.loadWarning) {
          F.loadWarning = true;
          rt.bark('荷が平田を抜けるで！　護衛を退けよ！', true);
        }
        break;
      }
    }
    // 合流・孤立の下知も題へ反映する。人数と荷の状況は補足だけに出す。
    if (guide) rt.obj('main', guide, 'main', true);
    let omuraFoes = 0;
    if (F.step === 2) for (const g of F.foes) for (const u of g.units) {
      if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) omuraFoes++;
    }
    // 味方の減りを常に見せ、本人の「いのち」だけで安全と誤解させない。
    // 敵の「あと何人」は共通の知らせで「残る者」へ変わるため、行動の分かる文にする。
    const omuraAt = omuraSupport ? this.spearAt(omuraSupport) : null;
    const omuraMoving = omuraAt && Math.hypot(omuraAt.x - OMURA.x, omuraAt.z - OMURA.z) > 24;
    const supportName = omuraGuard ? '槍組' : omuraSupport === F.hgun ? '鉄砲組' : '大将の手';
    const defenders = F.step === 2 ? omuraSupport
      ? `${omuraMoving ? '大村へ移る' : '大村の'}${supportName}${supportLeft}人${guardThin ? '。列を支えよ' : ''}`
      : '味方の列は退いた。大村の道を守れ'
      : gone(F.guard) ? `守る味方：平田${hirataLeft}人。列を支えよ`
        : gone(F.hirata) ? `守る味方：槍組${guardLeft}人。列を支えよ`
          : `味方：槍組${guardLeft}人・平田${hirataLeft}人${guardThin || hirataThin ? '。持ち場を支えよ' : ''}`;
    const enemyGuide = F.step === 2 ? omuraFoes ? '寄せ手を押し返せ' : '大村で列を固めよ'
      : F.dropped ? F.hirataFoe ? Math.hypot(F.hirataFoe.pos.x - p.x, F.hirataFoe.pos.z - p.z) <= 10
        ? '木戸の敵を槍で押し返せ' : '城兵が川岸へ。木戸で迎えよ'
        : F.castleLeft ? '城兵の寄せに備えよ' : '次の下知を待て' : loadGuide;
    // 人数と状況を行で分け、横持ちで文末の一字だけを次の行へ残さない。
    rt.objProgress('main', `${defenders}${enemyGuide && !guardThin && !hirataThin ? '\n' + enemyGuide : ''}${deadline ? '\n' + deadline.slice(1) : ''}`);
    if (F.step === 2 && F.supplyBlocked && F.foes.every(gone)) {
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - OMURA.x, p.z - OMURA.z) < OMURA.r) return this.end(rt, true);
      if (!F.omuraReturnSaid) {
        F.omuraReturnSaid = true;
        rt.say('組頭', '敵は退いた。道の印をたどり、大村で列を固めよ', 4);
      }
    }
    if (left <= 30 && !F.deadlineSaid) { F.deadlineSaid = true; rt.bark('退く下知が迫るぞ。味方と敵を押し返せ', true); }
    // 期限だけで勝たせない。長引けば荷駄を防ぐ持ち場を維持できなかった結果。
    if (rt.t - F.battleT >= BATTLE_LIMIT) this.end(rt, false, !F.dropped
      ? '兵糧の護衛を退けられず、道から退く'
      : F.step === 1 ? '平田の城兵が残り、退く下知を受けた'
        : F.foes.every(gone) ? '大村へ集まれず、備えが崩れた'
          : '大村の寄せ手を退けられず、敗れて退く');
  },
};
miki.sides = { a: { name: '羽柴の囲み', mon: 'oda' }, b: { name: '別所勢・兵糧隊', mon: 'mori' } };
miki.canSkip = (rt) => rt.phase === 'brief' && !rt.over && !rt.flags.ending && rt.t > 3 ? '下知を受けて進む' : '';
miki.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) miki.convoy(rt); };
miki.date = (rt) => `天正七年九月十日　${rt?.world?.timeKey === 'morning' ? '朝' : '未明'}`;
// 当日記事と翌年の開城を照合。局地の担当・会話・士気の変化は復元。
// https://ja.wikisource.org/wiki/播磨別所記
// https://www.city.miki.lg.jp/soshiki/33/91671.html
miki.history = '天正六年から八年にかけて、別所長治の三木城は、台地の上の広い平山城だった。羽柴秀吉は多数の付城と土塁・柵で城全体を包囲した。天正七年六月十三日、竹中半兵衛は平井山の陣で病死した。『播磨別所記』は、天正七年九月十日に大村坂を越えた兵糧搬入側と城兵が谷大膳の付城を攻め、谷を討ち取ったと記す。秀吉は反撃し、別所甚太夫・別所三太夫らと芸州・紀伊州の侍を討ち取った。十月には付城をさらに寄せ、翌年正月の最終攻勢と降伏交渉を経て、二年近い囲みの末、正月十七日に長治らが城兵の助命と引き換えに切腹し、開城した。この一戦で城が落ちたわけではない。同書には未明の攻撃が記される。遊びは未明の搬入阻止から朝の反撃へつなぐ。時刻の移ろいは短くまとめた。本丸・二の丸の瓦葺きは発掘で確認された礎石建物と出土瓦に基づく。建物の外形・位置・屋根の細部は復元。天候、浅瀬、付城と柵の細かな位置、備えの位置と人数、別所甚太夫・三太夫の担当する組と台詞、手柄による士気の変化は復元。包囲全体の二万、城方五千五百と搬入側二千は確定した人数ではない。別所の丸の旗は代用。谷大膳の討死は、目の前の組とは別の平田の持ち場からの知らせとして扱う。仕寄り道、竹束・土俵・虎落と築山、付城内の小屋や陣幕の細かな配置は、当時の攻城の備えを表す復元。';
miki.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  if (!u.alive || F.ending) return;
  // 近い振りかぶりへ向き続けず、先に当たる打ち込みを受ける。
  let attacker = null, hitIn = Infinity, attackDist = 6;
  for (const q of b.army.units) {
    if (!q.alive || q.team === u.team || q.fleeing || q.noTarget || Math.abs(q.pos.y - u.pos.y) >= 3) continue;
    const swing = q.swing && !q.swing.done && q.swing.target === u ? q.swing : null;
    const atk = q.atk && !q.atk.bow && !q.atk.ranged && q.atk.target === u ? q.atk : null;
    const charge = q.charging && q.target === u;
    if (!swing && !atk && !charge) continue;
    const d = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z);
    // 柵越しに届くかは、打つ敵の武器・技と柵からの距離で決まる。
    const over = (q.wpnKind || q.lookWeapon) === 'spear' && (swing || atk)?.kind === 'thrust' && d <= q.reach + 0.3;
    if (d >= 6 || b.army.wallBetween(q.pos, q.team, u.pos, over)) continue;
    const soon = charge ? 0 : swing ? Math.max(0, swing.dur * swing.at - swing.t) : Math.max(0, atk.t);
    if (soon < hitIn || soon === hitIn && d < attackDist) { attacker = q; hitIn = soon; attackDist = d; }
  }
  // 合流口から護衛の列までは十歩ほど。味方と合流したら、その前の敵へ詰める。
  // 遠くの敵を追う前には、任務どおり味方の持ち場へ戻る。
  // 整列の基準点と実兵は、前進や押し合いで離れる。案内と同じ生きた列で戦う。
  const regroupAt = miki.regroupAt(b), regroup = !!regroupAt;
  const front = regroupAt || (F.step === 2 ? OMURA : F.dropped ? GATE : miki.spearAt(F.guard) || F.roadGoal || F.guard.anchor);
  const atFront = F.step && Math.hypot(u.pos.x - front.x, u.pos.z - front.z) < 16;
  const candidate = strikeTarget(b, atFront ? 14 : p.weapon === 'sword' ? 1.9 : 2.8);
  // 持ち場の外や深い川の敵へ踏み込まない。届く敵への反撃と受けは残す。
  const e = attacker || (candidate && Math.hypot(candidate.pos.x - front.x, candidate.pos.z - front.z) < 16 &&
    b.world.waterFootDepthAt(candidate.pos.x, candidate.pos.z, candidate.pos.y) <= (b.world.def.wadeDepth ?? .85) ? candidate : null);
  const danger = attacker || b.army.nearestEnemy(u, 6, (q) => !q.fleeing && !q.noTarget && !b.army.wallBetween(u.pos, -1, q.pos));
  // 新たな出血は、巻いた布があっても残る布で止める。手当ての待ち時間も後ろで待つ。
  // 気力は回復するまで休み、性格の突進で休息を上書きさせない。
  const canTreat = p.treatmentLeft > 0 && !p.mounted;
  const bleeding = u.wounds?.bleed > .0001;
  const needsTreat = canTreat && (bleeding || !p.bandaged && u.hp < u.maxHp * .5);
  if (needsTreat || p.sta < p.maxSta * .22 || regroup &&
    Math.hypot(u.pos.x - regroupAt.x, u.pos.z - regroupAt.z) > 10) b.botRest = true;
  if (!needsTreat && p.sta >= p.maxSta * .45 && !(regroup &&
    Math.hypot(u.pos.x - regroupAt.x, u.pos.z - regroupAt.z) > 10)) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = !!danger;
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    // 狙いで向きを引き戻されると、手当てする場所へ歩けない。
    if (!danger && p.lock) inp.e.add('KeyQ');
    if (needsTreat && !danger && p.treatmentReady && canTreat) inp.k.add('KeyE');
    else {
      // 平田では動く大将を追わず、南の合流道で手当てする。大村へ移った後は大将の後ろへ。
      if (regroup) {
        goTo(p, inp, regroupAt.x, regroupAt.z, 3);
      } else if (F.step === 2) goTo(p, inp, F.hide.anchor.x, F.hide.anchor.z + 4, 2);
      else goTo(p, inp, ASSEMBLY_TURNS[0].x, ASSEMBLY_TURNS[0].z, 2);
      if (danger) {
        // 道の折れをたどりつつ、構えは打ち手へ向ける。敵に背を向けて構えない。
        const walking = inp.k.delete('KeyW'), retreatYaw = p.yaw, face = attacker || danger;
        if (p.lock && p.lock !== face) inp.e.add('KeyQ');
        p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
        if (walking) {
          const fw = Math.cos(retreatYaw - p.yaw), side = -Math.sin(retreatYaw - p.yaw);
          if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
          if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
        }
      }
    }
    return;
  }
  // 退く下知は反撃より先。敵に狙いを固定したまま道を歩くと、向きを戻され柵沿いへ逸れる。
  // 任務と同じ道の印へ進み、打ち手へ構えながら後ずさり・横歩きで列へ戻る。
  if (F.withdrawGuide && danger) {
    const joinAt = miki.guideMarker(b) === 'join' && F.joinGroup ? miki.spearAt(F.joinGroup) : null;
    const at = joinAt || F.routeAt || front;
    if (Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 4) {
      if (p.lock) inp.e.add('KeyQ');
      goTo(p, inp, at.x, at.z, 3);
      const walking = inp.k.delete('KeyW'), retreatYaw = p.yaw, face = attacker || danger;
      p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
      inp.guardHold = true;
      if (walking) {
        const fw = Math.cos(retreatYaw - p.yaw), side = -Math.sin(retreatYaw - p.yaw);
        if (Math.abs(fw) > .3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(side) > .3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
      }
      return;
    }
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 敵が近くても、平田の柵を横切らず口へ回る。届く少し手前まで詰める。
    if (d >= reach && !attacker && atFront) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) {
      inp.e.add('KeyC'); b.botCmdT = b.t + 2;
    }
    // 近いだけで構え続けず、打ち込みを受けた後の隙に突き返す。
    patientStrike(p, inp, e, d); return;
  }
  inp.guardHold = false;
  // 接敵が終わったら狙いを解き、退路の向きを敵へ引き戻させない。
  if (p.lock) inp.e.add('KeyQ');
  // 下知待ちは開始地点の道で待つ。北の槍組へ直進すると道を外れる。
  if (!F.step) { goTo(p, inp, b.def.spawn.x, b.def.spawn.z, 1); return; }
  if (F.step === 2) {
    // 画面と同じ曲がり角をたどる。南に残った槍組の後ろで待ち続けない。
    if (F.routeAt && (F.routeIndex || 0) < 4 && miki.guideMarker(b) === 'route') {
      goTo(p, inp, F.routeAt.x, F.routeAt.z, 3); return;
    }
    // 槍組より先に大村へ着くと、寄せ手の控えに一人で囲まれる。列の少し後ろについて坂を上る。
    const guard = miki.omuraSupport(b);
    if (guard && !F.foes.every(gone)) {
      const at = miki.spearAt(guard), dx = at.x - OMURA.x, dz = at.z - OMURA.z, l = Math.hypot(dx, dz) || 1;
      const x = at.x + dx / l * 4, z = at.z + dz / l * 4;
      if (!b.army.wallBetween(u.pos, -1, at)) { goTo(p, inp, x, z, 2.5); return; }
    }
    const at = F.routeAt || OMURA_TURNS[4]; goTo(p, inp, at.x, at.z, 3); return;
  }
  // 任務に書かれた合流口を使う。敵隊の中心を追うと、柵の北へ一人で回り込んでしまう。
  if (!F.dropped) {
    if (F.roadTurn >= 0) {
      const turn = ASSEMBLY_TURNS[F.roadTurn];
      goTo(p, inp, turn.x, turn.z, 2); return;
    }
    const c = F.guard.center();
    if (!gone(F.guard) && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 8) goTo(p, inp, c.x + 3, c.z + 3, 4);
    else goTo(p, inp, F.roadGoal.x, F.roadGoal.z, 3);
  } else if (regroup || !F.sallies.every(gone) || !gone(F.reserve)) {
    const at = regroupAt || F.routeAt || GATE;
    goTo(p, inp, at.x, at.z, 3);
  }
};
export { miki };
