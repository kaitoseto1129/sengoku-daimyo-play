// H3 島津家編（11/24 Sanae）：内城（鹿児島）の城下から遠くに見える桜島と、山頂から東へ流れる煙。
//   戦場の外の遠い山なので、カメラと一緒に動く遠景（近づいても大きさが変わらない＝とても遠い）として置く。霧は掛けない。
//   形は回し体（北岳と南岳の二つの頂）と、煙の玉七つだけ。毎コマ new しない。shimazu_line.js の eve.sakurajima の時だけ作る
import * as THREE from 'three';

const DIR = new THREE.Vector3(0.16, 0, 1).normalize();   // 町の奥（城の向こう）のわずか右＝錦江湾の先。門から通りを見通すと城の背に立つ
const DIST = 128, K = 0.55;   // K：近くに小さく置いて同じ見かけの大きさに（町の遠景の霞の輪より手前に描く）

function peak(r0, h, col0, col1) {
  // 裾が広く、頂へ反り上がる火山の形（裾の影は明るい霞の色・頂は暗い）
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r0 * (1 - t) ** 1.5 + 1.5, h * t)); }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, 28);
  const c = [], a = new THREE.Color(col0), b = new THREE.Color(col1), k = new THREE.Color();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { k.copy(a).lerp(b, Math.min(1, p.getY(i) / h)); c.push(k.r, k.g, k.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

// sea：錦江湾（11/24 Sanae・house_towns.js HOUSE_LOOK）。桜島の手前、目の高さに水平線の帯を置く。
//   描く遠さ（百五十m）のすぐ内の百四十五mに、深さを書かない透ける帯として描く（町の家・城・人が前に来る。遠景だけを塞ぐ）
const SEA_D = 145;
function seaBand(dusk) {
  const g = new THREE.PlaneGeometry(640, 9.6, 1, 3);
  const top = new THREE.Color(dusk ? 0x8d8696 : 0x9fb0bc), mid = new THREE.Color(dusk ? 0x4c5068 : 0x4d6a80), low = new THREE.Color(dusk ? 0x2c3346 : 0x2f4a5e);
  const p = g.attributes.position, c = [], k = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 4.8) / 9.6;   // 0 下（手前）〜 1 上（水平線）
    if (t > 0.9) k.copy(top); else if (t > 0.5) k.copy(mid).lerp(top, (t - 0.5) / 0.4 * 0.5); else k.copy(low).lerp(mid, t / 0.5);
    c.push(k.r, k.g, k.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: false }));
  m.renderOrder = -0.5; m.frustumCulled = false; m.userData.noMerge = true;
  return m;
}

export function sakurajimaSetup(rt, dusk, sea = false) {
  const F = rt.flags;
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const foot = dusk ? 0x8a7c86 : 0x9aa6b0, top = dusk ? 0x3c3440 : 0x56606c;
  const north = new THREE.Mesh(peak(96, 34, foot, top), mat);
  const south = new THREE.Mesh(peak(76, 30, foot, top), mat);
  south.position.set(-24, 0, 0);   // 南岳は北岳の右手に少し低く（一つの山に二つの頂）
  // 奥行きは薄く（遠景の切り絵）。裾がカメラの足元まで伸びて地面を覆わない
  north.scale.z = south.scale.z = 0.12;
  grp.rotation.y = Math.atan2(DIR.x, DIR.z) + Math.PI;
  grp.scale.setScalar(K);
  grp.add(north, south);
  // 煙：南岳の頂から上がって東へ流れる淡い玉（夕刻は茜を帯びる）
  const smat = new THREE.MeshBasicMaterial({ color: dusk ? 0x7a6e6c : 0xa8a49e, transparent: true, opacity: 0.6, fog: false, depthWrite: false });
  const sg = new THREE.SphereGeometry(1, 10, 8);
  const puffs = [];
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(sg, smat); grp.add(m); puffs.push(m); }
  grp.renderOrder = -1;
  grp.userData.noMerge = true;   // 町の静かな物を一つに束ねる mergeStatic（town3d.js）から外す（カメラと一緒に動かす）
  rt.scene.add(grp);
  const band = sea ? seaBand(dusk) : null;
  if (band) { band.rotation.y = grp.rotation.y; rt.scene.add(band); }
  const S = F.sakura = { grp, puffs, band, top: south.position.clone().setY(30), frame: -1 };
  // 描く直前にカメラの位置へ合わせる（町の毎コマの動きが止まっている間＝札・軍議の間も、山がカメラから離れない）
  const place = (renderer, scene, camera) => {
    const fr = renderer.info.render.frame;
    if (S.frame === fr) return;
    S.frame = fr;
    // 海のある時は、山の裾を水平線（目の高さ）のすぐ下に（島が湾に浮かんで見える）
    grp.position.set(camera.position.x + DIR.x * DIST * K, camera.position.y - (band ? 0.75 : 8 * K), camera.position.z + DIR.z * DIST * K);
    if (band) { band.position.set(camera.position.x + DIR.x * SEA_D, camera.position.y - 5, camera.position.z + DIR.z * SEA_D); band.updateMatrixWorld(true); }
    const t = performance.now() / 1000;
    for (let i = 0; i < puffs.length; i++) {
      const f = ((t * 0.035 + i / puffs.length) % 1);
      const m = puffs[i], sc = 1.6 + f * 4.5;
      m.position.set(S.top.x - f * 26 + Math.sin(i * 2.3) * 1.2, S.top.y + 1 + 10 * Math.sqrt(f), S.top.z);
      m.scale.set(sc * 1.3, sc * 0.8, sc * 0.3);
    }
    grp.updateMatrixWorld(true);
  };
  for (const m of grp.children) { m.frustumCulled = false; m.onBeforeRender = place; }
  if (band) band.onBeforeRender = place;
}
