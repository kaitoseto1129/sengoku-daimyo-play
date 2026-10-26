import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// 雑賀攻め・小雑賀川。史料の芯は信長公記巻十「雑賀御陣之事」。
// 渡河 → 高岸と鉄砲に阻まれる → 東岸へ引く → 川を限って対陣。
// 桶・杭、局地の回り込み、秒数と人数は遊びの補完。川岸の寸法は旧配置を回転。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hut, yagura, village, solidRect, castleBoardFence, dorui,
  makeSimpleBatch, finalizeSimpleBatch, paintGeo } from './props.js';
import { S as SETTINGS } from './settings.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightUnit } from './battle_sight.js';
import { addTaba } from './taketaba.js';
import { drawGroundAt } from './render_camera.js';
import { enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress, customFlag } from './b_inabayama.js';
import { camp } from './b_mid.js';
import { sendOrder } from './denrei.js';
import { battleEvent, EVENT_RETREAT, EVENT_MESSENGER } from './battle_events.js';
const WEST = -Math.PI / 2, EAST = Math.PI / 2;
// 北（川上・負の奥行き）から南（川下・正の奥行き）へ並べる。
// 水の波は点列の順に流れる。岸・浅瀬の位置は保ち、下知の川上・川下とそろえる。
// 和歌浦へ至る川筋を手掛かりにした復元で、当日の潮による逆流までは再現しない。
// https://www.mlit.go.jp/river/toukei_chousa/kasen/jiten/nihon_kawa/0604_kinokawa/0604_kinokawa_01.html
// 高では遠景の地面（奥行き±330）より先まで水面をつなぐ。
// ±240で止めると、その先は共通の遠景が掘る川床だけになってしまう。
// 元の両端の傾きを延ばし、戦列・渡り口の川筋と幅・深さは保つ。
// 市公開のガイド二頁が示す南下して和歌浦へ注ぐ川の、景観としての補完。
// https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
const RIVER_REACH = SETTINGS.quality === 'high' ? 340 : 240;
const RIVER = [[-24 + (RIVER_REACH - 100) * 6 / 140, -RIVER_REACH],
  [-24, -100], [-20, 0], [-18, 100], [-18 - (RIVER_REACH - 100) * 4 / 140, RIVER_REACH]];
// 岸の植生と湿った土にも同じ川筋を使う。川下を直線で延ばして陸へずらさない。
function riverCenter(z) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    if (z >= a[1] && z <= b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
  }
  return z < RIVER[0][1] ? RIVER[0][0] : RIVER[RIVER.length - 1][0];
}
const BANK = -44;
const STAKES = [{ x: -19, z: 18 }, { x: -20, z: 0 }, { x: -21, z: -18 }];
const ODA = { flag: 'oda' };
// 本の足軽の赤茶の陣笠と黒漆の胴。色だけを替え、形と材質は共有する。
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', hatColor: 0x713a30, flag: 'yatagarasu' };
// 急坂は x=-36 付近。待つ印を法面に掛けず、川を渡った先の低い足場へ置く。
const SHORE = { x: -31, z: 0 }, BACK = { x: 12, z: 0 };
const EAST_MOUTH = { x: -16, z: 0 }, WEST_MOUTH = { x: -30, z: 0 };
const REAR = { x: 58, z: 0 };
const COVER = { x: 9, z: 3 };
const REPORT_FROM = { x: 120, z: 32 };
const SIGNAL_FROM = { x: 72, z: 0 };
const NO_HOSTS = [];
function installSaikaCloth(rt) {
  const shapes = new Map(), flags = [], seen = new Set(), army = rt.army;
  const addUnit = army.addUnit, dispose = rt.dispose;
  const dressFlag = (flag) => {
    if (!flag || seen.has(flag)) return;
    seen.add(flag);
    const original = flag.geometry;
    if (!shapes.has(original)) {
      const g = original.clone(), p = g.attributes.position, uv = g.attributes.uv;
      g.computeBoundingBox();
      // 背の小旗と据え幟では布の丈が違う。長い幟にも見える折りを付ける。
      const fold = Math.min(.18, (g.boundingBox.max.y - g.boundingBox.min.y) * .06);
      for (let i = 0; i < p.count; i++) {
        const free = uv.getX(i), down = 1 - uv.getY(i), k = free * down;
        // 自由端を内側へ巻く。上辺と竿側は動かさず、長い幟の直線の輪郭を崩す。
        const curl = fold * free * free * down;
        p.setX(i, p.getX(i) - curl);
        p.setZ(i, p.getZ(i) + Math.sin(free * Math.PI) * down * fold
          + Math.sin(free * 9 + down * 5) * fold * k + curl);
        p.setY(i, p.getY(i) - fold * free * free * down);
      }
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); shapes.set(original, g);
    }
    flags.push({ flag, original }); flag.geometry = shapes.get(original);
  };
  const dressUnit = (u) => { dressFlag(u.flag); dressFlag(u.standardFlag); };
  for (const u of army.units) dressUnit(u);
  // 川べりの大幟や作業の小旗にも同じ布形を使う。設営時の一回だけ拾う。
  rt.scene.traverse((obj) => dressFlag(obj.userData.flag));
  army.addUnit = function (...args) {
    const u = addUnit.apply(this, args); dressUnit(u); return u;
  };
  rt.dispose = function () {
    army.addUnit = addUnit;
    for (const { flag, original } of flags) flag.geometry = original;
    for (const g of shapes.values()) g.dispose();
    this.dispose = dispose; return dispose.call(this);
  };
}
// 小雑賀川沿いの集落の復元。中野城や後世の天守を、この局地へ持ち込まない。
// 家並みの三方を水路で区切る。川上・川下の渡り道（z=±140）は従来のまま空ける。
const TOWN_DITCHES = [1, -1].map(side => ({
  pts: [[-39, side * 124], [-126, side * 124], [-126, side * 186], [-39, side * 186]],
  w: 3, depth: 1.5,
}));
// 川沿いの陸道（奥行き±140）から、門と屋敷内の道（±156）へ折れる。
// 農漁村の集落景観の補完で、史料に記された街道ではない。
// 水路の内側・囲いの外側で曲がり、川床や高岸への新しい道は作らない。
const TOWN_PATHS = [1, -1].map(side => [
  [-45, side * 140], [-45, side * 156], [-55, side * 156], [-118, side * 156],
]);
const townClearing = (x, z) => SETTINGS.quality === 'high'
  && x > -134 && x < -34 && Math.abs(z) > 118 && Math.abs(z) < 194;
// 和歌山市の雑賀衆ガイドの地理図では、川の東は中郷・社家郷・南郷の農耕地。
// https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
// 区画と寸法は復元。戦列・作業場を避けた後方だけに、春の休閑田を置く。
const fieldSoil = { r: .40, g: .34, b: .24 };
// 根来方面へ抜ける後方道。田の外で北東へ折る。道筋と幅は景観の復元。
const EAST_ROAD_Z = -126, EAST_ROAD_HALF = 5;
const FIELD_DRAINS = [101, 147];
// 休閑田の区画間に浅い排水溝。東岸の農耕地を手掛かりにした景観の補完で、
// 当日の水路跡を確認したものではない。北への道・根来方面の道・畦を避ける。
// 地面の高さと色だけで表し、水面・石・材質や毎コマの処理を増やさない。
function fieldDrain(x, z) {
  if (SETTINGS.quality !== 'high' || x <= 108 || x >= 184) return 0;
  const d = Math.min(Math.abs(Math.abs(z) - FIELD_DRAINS[0]), Math.abs(Math.abs(z) - FIELD_DRAINS[1]));
  const t = Math.max(0, Math.min(1, (1.5 - d), (x - 108) / 2, (184 - x) / 2));
  return t * t * (3 - 2 * t);
}
// 公記にある焼き払いの跡。敷地は復元で、休閑田と畦の上へ家を重ねない。
// 北への道の西側へ寄せ、焼け跡と倒れた材も道幅の外へ収める。
const RUINS = SETTINGS.quality === 'high'
  ? [[78, -112], [78, -156], [78, -196]]
  : [[78, -112], [118, -110], [140, -112]];
function ruinClearing(x, z) {
  if (SETTINGS.quality !== 'high') return false;
  for (const [rx, rz] of RUINS) if (Math.abs(x - rx) < 10 && Math.abs(z - rz) < 8) return true;
  return false;
}
// 田の内側だけでなく、畦と農道の縁も農耕地として空ける。
// 共通の田判定は土色の区画だけなので、その隙間には木や竹が生えてしまう。
// 和歌山市のガイドにある東岸の農耕地を手掛かりにした復元。戦列の木立は範囲外。
const fieldClearing = (x, z) => SETTINGS.quality === 'high'
  && x > 104 && x < 188 && Math.abs(z) > 52 && Math.abs(z) < 194;
// 同ガイドの雑賀荘は砂地が多い。高岸の後方を東岸の田畑と描き分ける。
// 砂地の広がりは景観の復元。川床・高岸・集落の寸法と当たりは変えない。
const westSandSoil = { r: .57, g: .50, b: .36 };
function westSand(x, z) {
  const edge = Math.max(0, Math.min(1, (-64 - x) / 40));
  return edge * edge * (3 - 2 * edge) * (.72 + .08 * Math.sin(x * .08 + z * .035));
}
// 砂丘は集落の奥にも続く。奥行きだけで切ると、西の砂丘が泥と林床へ戻ってしまう。
// 囲いの内側と三方の水路には六メートルの湿った余白を残し、その外で砂へつなぐ。
// 区画と乾湿は景観の復元。下の風紋も同じ範囲を使い、集落の庭には描かない。
function westDrySand(x, z) {
  const edge = Math.max(0, Math.min(1, (-68 - x) / 37));
  const outside = Math.max(-132 - x, x + 33, 118 - Math.abs(z), Math.abs(z) - 192);
  const dry = Math.max(0, Math.min(1, outside / 8));
  return edge * edge * (3 - 2 * edge) * dry * dry * (3 - 2 * dry);
}
function eastFields(x, z) {
  if (SETTINGS.quality !== 'high' || x < 108 || x > 184 || Math.abs(z) < 56 || Math.abs(z) > 190) return 0;
  const dx = (x - 108) % 38, dz = (Math.abs(z) - 56) % 46;
  return Math.max(0, Math.min(1, dx - 3, 35 - dx, dz - 3, 41 - dz, (190 - Math.abs(z)) / 2,
    Math.abs(z - EAST_ROAD_Z) - EAST_ROAD_HALF));
}

// 東岸の農耕地を、土色だけの平面でなく低い畦で区切る。区画・寸法は景観の復元。
// 戦列と北への陸道の外だけ。一つの形と材質へまとめ、移動・射撃の当たりは足さない。
function saikaFieldBanks(rt) {
  const W = rt.world, vertices = [];
  const ridge = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 4);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const widths = [-.65, -.22, .22, .65], lifts = [-.025, .18, .18, -.025];
    const point = (t, k) => {
      const x = ax + (bx - ax) * t + nx * widths[k];
      const z = az + (bz - az) * t + nz * widths[k];
      return [x, W.heightAt(x, z) + lifts[k], z];
    };
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const a = point(i / n, k), b = point((i + 1) / n, k);
      const c = point((i + 1) / n, k + 1), d = point(i / n, k + 1);
      vertices.push(...a, ...d, ...b, ...b, ...d, ...c);
    }
  };
  for (const side of [-1, 1]) {
    // 排水溝を畦の盛土でせき止めない。溝幅三メートルに法面の裾の余白を足す。
    // 水口の位置・寸法は農耕地の景観の補完。既存の畦の形から切れ目だけを外す。
    const gaps = FIELD_DRAINS.map(z => [z - 2.2, z + 2.2]);
    if (side < 0) gaps.push([-EAST_ROAD_Z - EAST_ROAD_HALF - .65,
      -EAST_ROAD_Z + EAST_ROAD_HALF + .65]);
    gaps.sort((a, b) => a[0] - b[0]);
    for (const x of [109.5, 147.5, 182.5]) {
      let from = 57.5;
      for (const [a, b] of gaps) {
        ridge(x, side * from, x, side * a);
        from = b;
      }
      ridge(x, side * from, x, side * 188.5);
    }
    for (const z of [57.5, 103.5, 149.5, 188.5]) ridge(109.5, side * z, 182.5, side * z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const banks = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x786c4d }));
  banks.castShadow = true; banks.receiveShadow = true;
  rt.scene.add(banks);
}

// 番所・長屋と渡り道を避けた畑。畦を挟む小区画を地面と草で共有する。
const SAIKA_FIELDS = [[-122, -88, -112, 112], [-84, -58, 64, 112], [-84, -58, -112, -64]];
const SAIKA_DRY = new THREE.Color(0xc5b99b), SAIKA_YOUNG = new THREE.Color(0x7a8a4a);
const SAIKA_FLOWER = new THREE.Color(0xe0ba38);
function saikaFieldAt(x, z) {
  for (const [x0, x1, z0, z1] of SAIKA_FIELDS) {
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    if (edge <= 0) continue;
    return Math.min(1, edge, Math.abs(((z - z0) % 28) - 14) - .55);
  }
  return 0;
}
// 高では西岸を広い畝畑にせず、砂州の風紋へ置き換える。面や絵は足さない。
// 和歌山市公開の雑賀衆ガイド二〜三頁。砂地が多く農耕に適さない地域との記述。
// https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
function saikaFieldSurface(W) {
  const mat = W.terrain.material, compile = mat.onBeforeCompile;
  const cacheKey = mat.customProgramCacheKey();
  const sandy = SETTINGS.quality === 'high';
  if (sandy) {
    // 土色だけを砂色にしても、共通の配分では内陸の砂地に泥と林床が重なる。
    // 市公開のガイドにある砂州・砂丘の景観として、後方の乾いた部分を土へ戻す。
    // 集落の水路・川際・高岸は範囲外。準備時に既存の頂点だけ直し、足場は保つ。
    const geo = W.terrain.geometry, pos = geo.attributes.position;
    const splat = geo.attributes.splat, cover = geo.attributes.groundCover;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const sand = westDrySand(x, z);
      // 東岸も土色を重ねるだけでは、休閑田に共通の林床と泥が残る。
      // 田の内側と排水溝だけで配分を変え、畦・農道・川岸の湿りは保つ。
      // 市の農耕地の記述を手掛かりにした復元で、当日の乾湿を断定しない。
      const drain = fieldDrain(x, z), field = Math.max(eastFields(x, z), drain);
      if (field > 0) {
        const grass = splat.getX(i), mud = splat.getZ(i);
        const cleared = grass * field * .85;
        const dried = mud * field * .65 * (1 - drain);
        splat.setXYZ(i, grass - cleared, splat.getY(i) + cleared + dried, mud - dried);
        cover.setY(i, cover.getY(i) * (1 - field));
      }
      if (!sand) continue;
      const grass = splat.getX(i), mud = splat.getZ(i);
      const dry = (grass + mud) * sand * .9;
      splat.setXYZ(i, grass * (1 - sand * .9), splat.getY(i) + dry, mud * (1 - sand * .9));
      cover.setY(i, cover.getY(i) * (1 - sand));
    }
    splat.needsUpdate = true; cover.needsUpdate = true;
  }
  const masks = SAIKA_FIELDS.map(([x0, x1, z0, z1]) => `
    { float edge = min(min(vWP.x - ${x0.toFixed(1)}, ${x1.toFixed(1)} - vWP.x),
        min(vWP.z - ${z0.toFixed(1)}, ${z1.toFixed(1)} - vWP.z));
      float crossBank = abs(mod(vWP.z - ${z0.toFixed(1)}, 28.0) - 14.0);
      field = max(field, smoothstep(0.0, 0.9, edge) * smoothstep(0.55, 1.05, crossBank));
      bank = max(bank, smoothstep(-0.3, 0.1, edge) * (1.0 - smoothstep(0.1, 0.7, abs(edge))));
      bank = max(bank, smoothstep(0.0, 0.9, edge) * (1.0 - smoothstep(0.55, 1.05, crossBank))); }
  `).join('');
  mat.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= col;', sandy ? `
      float outsideTown = max(max(-132.0 - vWP.x, vWP.x + 33.0),
        max(118.0 - abs(vWP.z), abs(vWP.z) - 192.0));
      float sand = (1.0 - smoothstep(-105.0, -68.0, vWP.x))
        * smoothstep(0.0, 8.0, outsideTown);
      float ripplePhase = vWP.x * 9.0 + vWP.z * 2.4 + sin(vWP.z * 0.45) * 1.8;
      float rippleNear = 1.0 - smoothstep(20.0, 65.0, length(vWP - cameraPosition));
      rippleNear *= 1.0 - smoothstep(0.35, 1.1, fwidth(ripplePhase));
      col *= 1.0 + cos(ripplePhase) * 0.09 * sand * rippleNear;
      diffuseColor.rgb *= col;` : `
      float field = 0.0, bank = 0.0;
      ${masks}
      float furrow = cos((vWP.x + 122.0) * 5.236);
      float furrowNear = 1.0 - smoothstep(28.0, 85.0, length(vWP - cameraPosition));
      furrowNear *= 1.0 - smoothstep(0.35, 1.1, fwidth(vWP.x) * 5.236);
      col *= mix(1.0, 0.82 + furrow * 0.22 * furrowNear, field);
      col = mix(col, col * vec3(1.22, 1.05, 0.77), bank * 0.65);
      diffuseColor.rgb *= col;`);
  };
  mat.customProgramCacheKey = () => cacheKey + (sandy ? '|saikaSand' : '|saikaFields');
  mat.needsUpdate = true;
}

// 板屋根の番所・長屋と、町の入口。新しい兵や城攻めの目標は作らない。
function saikaSettlement(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  // 本の古い板葺きは橙一色ではなく、灰褐色の古板に茶色の差し替え板が混じる。
  // 雑賀の家並みだけへ渡し、門・井楼や他の戦の屋根色は共通部品に任せる。
  const boardRoofColors = [0x786b57, 0x6d6252, 0x897354, 0x736b5d, 0x625b4e];
  const gateParts = [], cube = new THREE.BoxGeometry(1, 1, 1);
  const box = (x, y, z, w, h, d, rot = 0, rz = 0, color = 0x67513c) => {
    const g = cube.clone(); g.scale(w, h, d); g.rotateZ(rz); g.rotateY(rot); g.translate(x, y, z);
    gateParts.push(paintGeo(g, color)); g.dispose();
  };
  // 屋敷境は低い板塀。門から奥への道と、各戸の出入り口は塞がない。
  const yardFence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .48);
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const h = 1.05 + (i % 3) * .045;
      box(x, W.heightAt(x, z) + h / 2, z, len / n - .035, h, .055,
        rot, 0, [0x72634e, 0x685b49, 0x7c6b54][i % 3]);
    }
    for (const h of [.25, .85]) {
      const y = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz));
      box((ax + bx) / 2, y + h, (az + bz) / 2, len, .09, .11, rot);
    }
  };
  const stakePlaces = [];
  const gate = (x, z) => {
    const rot = EAST, y = Math.max(W.heightAt(x, z - 3), W.heightAt(x, z + 3));
    const P = (lx, lz) => [x + lz, z - lx];
    const part = (lx, ly, lz, w, h, d, rz = 0, col) => {
      const [px, pz] = P(lx, lz); box(px, y + ly, pz, w, h, d, rot, rz, col);
    };
    // 四脚の門の上に板張りの渡櫓。下の口と上階の窓を実際に空ける。
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      part(sx * 2.7, 1.65, sz * 1.2, .3, 3.5, .3);
      const [px, pz] = P(sx * 2.7, sz * 1.2); solidRect(px, pz, .38, .38);
    }
    part(0, 3.1, 0, 6.2, .28, 2.9);
    part(3.25, 3.95, 0, .12, 1.5, 2.8);
    // 町側へ開いた両扉。通り抜ける口を保ち、板と裏の横桟を見せる。
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 6; i++) part(sx * 2.5, 1.45, -1.2 + i * .4,
        .1, 2.7, .39, 0, i % 2 ? 0x695940 : 0x75634b);
      for (const h of [.4, 1.4, 2.5]) part(sx * 2.41, h, -.2, .13, .14, 2.4);
    }
    // 上階へ上がる口と梯子は通路の脇。入口に壁を残したまま梯子を掛けない。
    for (const sz of [-1, 1]) part(-3.25, 3.95, sz * .94, .12, 1.5, .92);
    const foot = W.heightAt(x, z + 5.6) - y;
    const rise = 3.24 - foot, run = 2.45, angle = Math.atan2(rise, run);
    for (const lz of [-.4, .4]) part(-4.375, (foot + 3.24) / 2, lz,
      Math.hypot(run, rise), .11, .11, angle, 0x70604a);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      part(-5.6 + run * t, foot + rise * t, 0, .13, .09, .93, 0, 0x8b785b);
    }
    for (const sz of [-1, 1]) {
      // 吹き放しの格子から縦板壁へ。左右二つの狭間だけ実際に抜く。
      for (let i = -8; i <= 8; i++) {
        const col = [0x75614a, 0x685640, 0x806b50][(i + 8) % 3];
        const px = i * 6.6 / 17, bw = 6.6 / 17 - .008;
        part(px, 3.45, sz * 1.4, bw, .5, .12, 0, 0x514635);
        part(px, 4.55, sz * 1.4, bw, .3, .12, 0, col);
        if (Math.abs(i) === 4) {
          part(px, 3.75, sz * 1.4, bw, .1, .12, 0, col);
          part(px, 4.325, sz * 1.4, bw, .15, .12, 0, col);
        } else part(px, 4.05, sz * 1.4, bw, .7, .12, 0, col);
      }
      for (const h of [3.22, 4.65]) part(0, h, sz * 1.48, 6.7, .12, .13);
      // 切妻の三角も縦板で閉じる。屋根の下に大きな吹き抜けを残さない。
      for (let i = -7; i <= 7; i++) {
        const lx = i * .39, bw = .382, base = 4.65;
        const g = cube.clone(), p = g.attributes.position;
        for (let j = 0; j < p.count; j++) {
          const px = lx + p.getX(j) * bw;
          p.setXYZ(j, px, p.getY(j) > 0 ? 5.57 - Math.abs(px) * Math.tan(.3) : base,
            sz * 1.4 + p.getZ(j) * .12);
        }
        g.computeVertexNormals(); g.rotateY(rot); g.translate(x, y, z);
        gateParts.push(paintGeo(g, [0x75614a, 0x685640, 0x806b50][(i + 7) % 3]));
        g.dispose();
      }
    }
    for (const sx of [-1, 1]) {
      // 一枚の平板をやめ、板の継ぎ目と雨で暗くなった軒を付ける。
      for (let q = 0; q < 3; q++) for (let i = 0; i < 8; i++) {
        const t = (q - 1) * 4 / 3;
        part(sx * (1.85 + t * Math.cos(.3)), 5.05 - t * Math.sin(.3),
          -1.75 + i * .5, 4 / 3 + .025, .1, .492, -sx * .3,
          [0x80694e, 0x6b563e, 0x514735][q]);
      }
      // 棟から軒へ流す押さえ木。瓦・石垣は足さない。
      for (const lz of [-1.6, 0, 1.6]) part(sx * 1.85, 5.16, lz, 4, .09, .09, -sx * .3);
    }
    part(0, 5.67, 0, .18, .15, 4.1);
  };
  // 清洲の屋敷の写真を手掛かりに、庭の隅へ小さな木組みの井戸。
  // 地下を掘る地形や兵を増やさず、井桁の中の水面と釣瓶縄を基本形で作る。
  const well = (x, z) => {
    let y = W.heightAt(x, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      y = Math.max(y, W.heightAt(x + sx * .65, z + sz * .5));
    box(x, y + .06, z, 1.05, .06, .85, 0, 0, 0x28362f);
    for (const h of [.18, .38, .58]) {
      for (const sz of [-1, 1]) box(x, y + h, z + sz * .5, 1.35, .18, .13, 0, 0, 0x64533f);
      for (const sx of [-1, 1]) box(x + sx * .6, y + h + .05, z, .13, .18, 1.15);
    }
    for (const sx of [-1, 1]) {
      const py = W.heightAt(x + sx * .65, z);
      box(x + sx * .65, (py + y + 2.35) / 2, z, .13, y + 2.35 - py, .13);
      box(x + sx * .43, y + 2.48, z, .95, .08, 1.6, 0, -sx * .35, 0x766046);
    }
    box(x, y + 2.25, z, 1.55, .13, .13);
    box(x, y + 2.65, z, .14, .12, 1.7, 0, 0, 0x514331);
    box(x, y + 1.2, z, .025, 1.9, .025, 0, 0, 0xa18b62);
    solidRect(x, z, 1.35, 1.15);
  };
  // 岡崎の普請場のような吹き放しの材木覆い。柱・横木・板屋根を既存の束へ結合。
  const timberCover = (x, z, w, d) => {
    let y = W.heightAt(x, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      y = Math.max(y, W.heightAt(x + sx * w / 2, z + sz * d / 2));
    for (const sx of [-1, 1]) {
      const h = sx < 0 ? 1.6 : 1.95;
      for (const sz of [-1, 1]) {
        const px = x + sx * w / 2, pz = z + sz * d / 2, gy = W.heightAt(px, pz);
        box(px, (gy + y + h) / 2, pz, .12, y + h - gy, .12);
      }
      box(x + sx * w / 2, y + h, z, .15, .13, d + .35);
    }
    const slope = Math.atan2(.35, w), n = Math.ceil((d + .6) / .45);
    for (let i = 0; i < n; i++) box(x, y + 1.84, z - (d + .6) / 2 + (i + .5) * (d + .6) / n,
      Math.hypot(w, .35) + .6, .07, (d + .6) / n - .008, 0, slope,
      [0x71634e, 0x81715b, 0x625845][i % 3]);
    // 桟木で地面から浮かせ、雨に当たる木口と板の隙間を残す。
    for (const sz of [-1, 1]) box(x, y + .12, z + sz * d * .32, w, .18, .16);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
      box(x + (col - 1) * w * .25, y + .3 + row * .17, z + (row % 2) * .06,
        w * .21, .13, d * .86, 0, 0, row === 2 ? 0x927956 : 0x67543d);
  };
  // 岡崎の作事場のように、材木覆いの脇で馬脚に長い挽き板を載せる。
  // 建物や井戸の口を避けた庭だけに置き、既存の結合形へまとめる。
  const workBench = (x, z) => {
    let y = W.heightAt(x, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      y = Math.max(y, W.heightAt(x + sx * .5, z + sz * 1.05));
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) box(x + sx * .28, y + .47, z + sz * .9,
        .12, 1.04, .14, 0, sx * .48, 0x655642);
      box(x, y + .79, z + sz * .9, 1.15, .14, .18, 0, 0, 0x8c785b);
      box(x, y + .28, z + sz * .9, .95, .09, .1);
    }
    box(x, y + .95, z, .65, .17, 3.1, 0, 0, 0x968264);
    box(x, y + .32, z, .1, .12, 2.05, 0, 0, 0x5b503e);
    // 切り落とした端材は一山に揃えず、足元へ二枚だけずらす。
    for (let i = 0; i < 2; i++) {
      const px = x + .85 + i * .21, pz = z + .4 - i * .35;
      box(px, W.heightAt(px, pz) + .08, pz, .19, .1, 1.1 + i * .35,
        .12 + i * .13, 0, i ? 0x7e6b50 : 0x9a8360);
    }
  };
  // 写真の屋敷は土壁と腰板、格子戸が混じる。主屋だけ道側へ浅い下屋を出す。
  // 戸口と屋敷境の間を空け、既存の閉じた家の当たりは変えない。
  const houseFront = (x, z, w, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    let y = W.heightAt(x, z);
    for (const dx of [-w / 2, w / 2]) for (const dz of [-2.5, 2.5])
      y = Math.max(y, W.heightAt(x + dx * c + dz * s, z - dx * s + dz * c));
    const part = (px, py, pz, bw, bh, bd, rz = 0, col = 0x67513c) =>
      box(x + px * c + pz * s, y + py, z - px * s + pz * c,
        bw, bh, bd, rot, rz, col);
    for (const side of [-1, 1]) {
      // 土壁の足もとは雨跳ねを受ける横板。中央の戸を覆わない。
      for (let j = 0; j < 3; j++) part(side * (w / 4 + .4), .3 + j * .18, 2.56,
        w / 2 - .85, .17, .065, 0, [0x655747, 0x756450, 0x80705a][j]);
      const wx = side * w * .29;
      // 入れない家の閉じた格子戸。暗い戸板を奥に、枠と細い格子を手前に置く。
      part(wx, 1.5, 2.58, 1.1, .65, .06, 0, 0x3f3b30);
      for (let j = -3; j <= 3; j++) part(wx + j * .15, 1.5, 2.63,
        .035, .66, .045, 0, 0x928064);
      for (const yy of [1.15, 1.85]) part(wx, yy, 2.63, 1.22, .07, .09);
      const px = side * (w / 2 - .25), pz = 3.35;
      const gy = W.heightAt(x + px * c + pz * s, z - px * s + pz * c) - y;
      part(px, (gy + 2.05) / 2, pz, .12, 2.05 - gy, .12);
      part(side * (w / 4 - .1), 2.05, pz, w / 2 - .6, .13, .14);
    }
    // 柱を戸の両脇へ寄せず、下屋の端で受ける。軒先は灰褐色へ落とす。
    const roof = cube.clone(); roof.scale(w + .4, .07, 1.2); roof.rotateX(.15);
    roof.translate(0, 2.16, 2.95); roof.rotateY(rot); roof.translate(x, y, z);
    gateParts.push(paintGeo(roof, 0x6b6252)); roof.dispose();
  };
  // 射手の後ろを空け、低い切妻の番所と長屋を岸に平行に置く。
  for (const z of [-20, 20]) hut(W, -65, z, 7, 5, EAST,
    { ita: true, boardRoof: true, boardRoofColors, weatheredBoards: true, h: 2.3, minka: false, batch });
  // 短辺に屋根勾配を掛け、長辺に棟を通す。敷地は同じまま棟高を約二メートル下げる。
  for (const z of [-48, 48]) hut(W, -76, z, 4.5, 16, 0,
    { ita: true, boardRoof: true, boardRoofColors, weatheredBoards: true, nagayaDoors: true,
      h: 2.2, minka: false, batch });
  // 佐久間の陣幕の脇に兵糧の覆いと普請材。中央の帰路・旗本の持ち場を空ける。
  hut(W, 88, 25, 4, 10, EAST,
    { ita: true, boardRoof: true, boardRoofColors, weatheredBoards: true, nagayaDoors: true,
      h: 2.1, minka: false, batch });
  timberCover(82.65, 32, 2, 5.5);
  workBench(79.5, 32);
  for (let i = 0; i < 3; i++) {
    const x = 89 + i * 1.3, z = 30, y = W.heightAt(x, z);
    box(x, y + .45, z, 1.1, .9, .85, 0, 0, 0x79664d);
    for (const dz of [-.3, .3]) box(x, y + .93, z + dz, 1.15, .07, .09);
  }
  for (const side of [1, -1]) {
    const z0 = side * 156, x0 = -55, x1 = -118, za = z0 - 12, zb = z0 + 12;
    const edge = [[x0, za], [x1, za], [x1, zb], [x0, zb]];
    // 土塁の低い法面と板塀を重ね、川側の入口は門へつなぐ。
    const segs = [...edge.slice(0, -1).map((p, i) => [...p, ...edge[i + 1]]),
      [x0, z0 - 3.5, x0, za], [x0, zb, x0, z0 + 3.5]];
    for (const seg of segs) {
      const len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
      const nx = -(seg[3] - seg[1]) / len, nz = (seg[2] - seg[0]) / len;
      dorui(W, seg, nx, nz,
        { w: 2.5, h: .65, bareSoil: true, capEnds: true, closeBack: true, batch });
      // 岡崎の写真のように板塀の外へ乱杭を一列。門前と既存の渡り道を空ける。
      const n = Math.floor(len / .85);
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, off = 1.9 + (i % 3) * .12;
        stakePlaces.push({ x: seg[0] + (seg[2] - seg[0]) * t + nx * off,
          z: seg[1] + (seg[3] - seg[1]) * t + nz * off, nx, nz });
      }
      // 写真の乱杭は横木二段で結ばれる。四本分ずつ継ぎ、門の口へ渡さない。
      for (let i = 0; i < n - 1; i += 4) {
        const a = stakePlaces[stakePlaces.length - n + i];
        const b = stakePlaces[stakePlaces.length - n + Math.min(i + 4, n - 1)];
        const dx = b.x - a.x, dz = b.z - a.z, span = Math.hypot(dx, dz);
        const ay = W.heightAt(a.x, a.z), by = W.heightAt(b.x, b.z);
        for (const h of [.28, .65]) box((a.x + b.x) / 2, (ay + by) / 2 + h,
          (a.z + b.z) / 2, Math.hypot(span, by - ay) + .16, .1, .24,
          Math.atan2(-dz, dx), Math.atan2(by - ay, span), 0x665b48);
      }
      // 岡崎の乱杭に掛けた戸板。連続壁にせず、所々だけ横木へ立て掛ける。
      // 上端を杭へ寄せ、裏の桟を町側に向ける。門の両脇の短い列は空ける。
      if (len > 20) for (let i = 7; i < n - 3; i += 13) {
        const a = stakePlaces[stakePlaces.length - n + i];
        const rot = Math.atan2(-nz, nx), lean = .24, h = 1.35;
        const px = a.x + nx * .22, pz = a.z + nz * .22;
        const y = W.heightAt(px, pz) + h / 2;
        for (let j = 0; j < 4; j++) {
          const u = (j - 1.5) * .25;
          box(px - nz * u, y, pz + nx * u, .075, h, .242, rot, lean,
            [0x8b795c, 0x796950, 0x948064, 0x73634c][j]);
        }
        for (const dy of [-.4, .4]) {
          const off = -.075 - Math.sin(lean) * dy;
          box(px + nx * off, y + Math.cos(lean) * dy, pz + nz * off,
            .09, .09, 1.05, rot, lean, 0x5d503e);
        }
      }
      // 写真の板塀は浅い笠板を掛け、尖った外の乱杭とは作りを分ける。
      castleBoardFence(W, seg, { h: 2.1, boardCap: true, boardSeams: true, batch });
      const rot = Math.atan2(-(seg[3] - seg[1]), seg[2] - seg[0]);
      // 屋敷側の横桟と控え柱。横桟は狭間より下と上に置く。
      for (const h of [.35, 1.98]) {
        const nRail = Math.ceil(len / 3.5);
        for (let i = 0; i < nRail; i++) {
          const t = (i + .5) / nRail;
          const px = seg[0] + (seg[2] - seg[0]) * t - nx * .16;
          const pz = seg[1] + (seg[3] - seg[1]) * t - nz * .16;
          box(px, W.heightAt(px, pz) + h, pz, len / nRail + .05, .11, .12, rot, 0, 0x594e3e);
        }
      }
      for (let u = 1.7; u < len - .8; u += 3.5) {
        const t = u / len, px = seg[0] + (seg[2] - seg[0]) * t;
        const pz = seg[1] + (seg[3] - seg[1]) * t;
        const ax = px - nx * 1.15, az = pz - nz * 1.15;
        const bx = px - nx * .16, bz = pz - nz * .16;
        const ay = W.heightAt(ax, az) + .08, by = W.heightAt(px, pz) + 1.94;
        const run = Math.hypot(bx - ax, bz - az), rise = by - ay;
        box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2,
          Math.hypot(run, rise), .13, .13, Math.atan2(-(bz - az), bx - ax),
          Math.atan2(rise, run), 0x6c604b);
      }
      solidRect((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2, len, .25,
        Math.atan2(-(seg[3] - seg[1]), seg[2] - seg[0]));
    }
    gate(x0, z0);
    // 同じ十一軒を、道と中庭を挟む屋敷の並びへ。入口から奥まで道幅を残す。
    for (let i = 0; i < (side === 1 ? 6 : 5); i++) {
      const x = -69 - Math.floor(i / 2) * 17, z = z0 + (i % 2 ? 6.5 : -6.5);
      const w = i % 3 ? 7 : 10, rot = i % 2 ? Math.PI : 0, mainHouse = i % 3 === 0;
      hut(W, x, z, w, 5, rot,
        { ita: true, boardRoof: true, boardRoofColors, weatheredBoards: true,
          wall: mainHouse ? 0xb0a58d : 0x7e7464, h: 2.3, batch });
      if (mainHouse) houseFront(x, z, w, rot);
      const s = i % 2 ? 1 : -1;
      yardFence(x - 7.5, z0 + s * 3, x - 7.5, z0 + s * 10.5);
      yardFence(x - 7.5, z0 + s * 3, x - 2, z0 + s * 3);
      yardFence(x + 2, z0 + s * 3, x + 7.5, z0 + s * 3);
      if (i === 1 || i === 3) well(x + 6.5, z0 + s * 9.4);
      // 一軒おきに材木覆いを置く。井戸と中央の道から離し、庭の隅に収める。
      if (i % 2 === 0) {
        timberCover(x + 6, z0 + s * 8.7, 1.6, 2.4);
        if (i === 0) workBench(x + 3, z0 + s * 9.1);
      }
      else for (let j = 0; j < 4; j++) {
        const px = x + 6.4, pz = z + (j - 1.5) * .25;
        box(px, W.heightAt(px, pz) + .18, pz, 1.2, .24, .19, 0, 0, 0x786044);
      }
    }
    if (SETTINGS.quality === 'high') {
      // 市公開の雑賀衆ガイド二頁では、西の砂地では漁業・海運が盛んだった。
      // 武家屋敷だけに見せず、集落の庭の空きへ網干しを補う。位置・形は復元。
      // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
      // 囲い・家・井戸・中央の道から離す。既存の箱と静物の束を使い、当たりは足さない。
      const x = -114, z = z0 - 6.5;
      const y = Math.max(W.heightAt(x - 1.6, z), W.heightAt(x + 1.6, z));
      for (const dx of [-1.6, 1.6]) {
        const ground = W.heightAt(x + dx, z);
        box(x + dx, (ground + y + 1.8) / 2, z, .09, y + 1.8 - ground, .09);
      }
      box(x, y + 1.7, z, 3.5, .08, .08, 0, 0, 0x7b6b50);
      // 縄は面で塞がず、小さな網目を残す。中央が少したるむよう横糸を分ける。
      for (let i = 0; i <= 8; i++) {
        const dx = (i - 4) * .36, sag = .14 * (1 - (dx / 1.44) ** 2);
        box(x + dx, y + 1.08 - sag, z, .018, 1.18, .018, 0, 0, 0x8b8065);
      }
      for (let row = 0; row < 6; row++) for (let i = 0; i < 8; i++) {
        const ax = (i - 4) * .36, bx = ax + .36;
        const ay = y + .49 + row * .236 - .14 * (1 - (ax / 1.44) ** 2);
        const by = y + .49 + row * .236 - .14 * (1 - (bx / 1.44) ** 2);
        box(x + (ax + bx) / 2, (ay + by) / 2, z,
          Math.hypot(.36, by - ay), .018, .018, 0, Math.atan2(by - ay, .36), 0x8b8065);
      }
    }
    rt.scene.add(nobori(W, x0 - 2, z0 + 5, 'yatagarasu', 5));
  }
  // 尖らせた木杭の形と材質を全周で共有。一回の描画で済ませる。
  const shaft = new THREE.CylinderGeometry(.055, .085, 1.05, 5);
  shaft.translate(0, .425, 0);
  const tip = new THREE.ConeGeometry(.055, .25, 5); tip.translate(0, 1.075, 0);
  const stakeGeo = mergeGeometries([shaft, tip]); shaft.dispose(); tip.dispose();
  const stakes = new THREE.InstancedMesh(stakeGeo,
    new THREE.MeshLambertMaterial({ color: 0x75644d }), stakePlaces.length);
  const pose = new THREE.Object3D();
  for (let i = 0; i < stakePlaces.length; i++) {
    const p = stakePlaces[i];
    pose.position.set(p.x, W.heightAt(p.x, p.z), p.z);
    pose.rotation.set(p.nz * .14, i * 2.4, -p.nx * .14);
    pose.scale.set(1, .85 + (i % 5) * .07, 1); pose.updateMatrix();
    stakes.setMatrixAt(i, pose.matrix);
  }
  stakes.instanceMatrix.needsUpdate = true; stakes.castShadow = stakes.receiveShadow = true;
  rt.scene.add(stakes);
  const mesh = new THREE.Mesh(mergeGeometries(gateParts),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const g of gateParts) g.dispose(); cube.dispose();
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
  finalizeSimpleBatch(rt, batch);
}
// 資料本の弾除け用竹束に合わせ、縦に束ねた竹を横木と縄で支える。
// この川岸の四枚だけ同じ形を使い、ほかの戦の竹束は変えない。
function bankTabaGeo() {
  const parts = [], color = new THREE.Color();
  const add = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    color.setHex(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.36;
    // 太い七本の筒から、外周十二本・内周六本・芯の細竹へ。同じ束幅と高さを保つ。
    for (let i = 0; i < 19; i++) {
      const angle = i < 12 ? i * Math.PI / 6 : (i - 12) * Math.PI / 3;
      const radius = i < 12 ? .14 : i < 18 ? .07 : 0;
      const sx = x + Math.cos(angle) * radius;
      const sz = -0.04 + Math.sin(angle) * radius;
      const h = 1.52 - ((k * 3 + i) % 5) * 0.02;
      const stalk = new THREE.CylinderGeometry(0.033, 0.035, h, 5, 1, true);
      stalk.translate(sx, h / 2, sz); add(stalk, [0x86844a, 0x78783f, 0x908a50][i % 3]);
      const rim = new THREE.RingGeometry(0.024, 0.033, 5);
      rim.rotateX(-Math.PI / 2); rim.translate(sx, h, sz); add(rim, 0xb8a676);
      const mouth = new THREE.CircleGeometry(.024, 5);
      mouth.rotateX(-Math.PI / 2); mouth.translate(sx, h - .045, sz); add(mouth, 0x443e25);
      // 表へ出る竹だけ二段の節を付け、結合した一つの形を四つの竹束で共有する。
      if (i < 12) for (const y of [.5, 1.02]) {
        const node = new THREE.CylinderGeometry(.037, .037, .02, 5);
        node.translate(sx, y + (i % 3) * .025, sz); add(node, 0x96905a);
      }
    }
    for (const y of [0.27, 0.76, 1.24]) {
      const rope = new THREE.TorusGeometry(0.175, 0.018, 4, 10);
      rope.rotateX(Math.PI / 2); rope.translate(x, y, -0.04); add(rope, 0xc2ac79);
    }
  }
  for (const y of [0.35, 1.08]) {
    const rail = new THREE.CylinderGeometry(0.04, 0.045, 1.82, 6);
    rail.rotateZ(Math.PI / 2); rail.translate(0, y, -0.24); add(rail, 0x8a8650);
  }
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  for (const x of [-0.6, 0.6]) {
    direction.set(0, 1.22, -1.1);
    const brace = new THREE.CylinderGeometry(0.04, 0.05, direction.length(), 6);
    brace.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    brace.translate(x, 0.61, 0.69); add(brace, 0x8a8650);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}
// 倒れた者や後送された者は、守りの列に数えない。
const bankReady = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.group?.routed;
// 画面外の知らせは後陣で受け、そこから実際に走る使番が本人へ届ける。
// 使番が討たれても任務の段は待たせない。
function report(rt, text) {
  sendOrder(rt, REPORT_FROM, rt.player.u, { id: 'saikaReport', apply() {
    if (rt.flags.ending || rt.over || !rt.player.u.alive) return;
    rt.say('伝令', text, 5);
    battleEvent(rt, EVENT_MESSENGER, rt.player.u.pos, rt.flags.hori, 0, false, text);
  } }, { team: 0, faction: 'oda', name: '山手の使番' });
}
// 竹束の見える幅と高さだけで矢玉を遮る。束の隙間や上を通る弾は止めない。
function syncTabaCover(rt) {
  for (const tb of rt.flags.bankTabas) {
    const s = tb.saikaSolid, rot = tb.rot + Math.PI;
    s.x = tb.x; s.z = tb.z; s.c = Math.cos(rot); s.s = Math.sin(rot);
    const dx = Math.abs(s.c) * s.hw + Math.abs(s.s) * s.hd;
    const dz = Math.abs(s.s) * s.hw + Math.abs(s.c) * s.hd;
    s.x0 = s.x - dx; s.x1 = s.x + dx; s.z0 = s.z - dz; s.z1 = s.z + dz;
    s.yTop = rt.world.heightAt(s.x, s.z) + s.missileH;
  }
}
// 杭抜きは手が空いた間だけ進む。一人なら倍の時間を掛け、応戦しても引いた分は残す。
function canWork(u, a) {
  // 遠い敵を覚えているだけでは手を止めない。実際に応戦する間は縄を引けない。
  return bankReady(u) && !u.saikaBucket && !u.atk && !u.swing && !u.stagger &&
    Math.hypot(u.pos.x - a.workAt.x, u.pos.z - a.workAt.z) < 3 &&
    !(u.target && bankReady(u.target) && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 6);
}
function workHands(rt, a) {
  let hands = 0;
  a.rope.visible = false;
  for (const g of rt.flags.workParties) for (const u of g.units) {
    if (g !== rt.flags.workers && u.type !== 'ashigaru') continue;
    if (!canWork(u, a)) continue;
    hands++;
    if (!a.rope.visible) {
      const v = a.rope.geometry.attributes.position;
      const tug = Math.sin(rt.t * 3) * 0.08;
      v.setXYZ(0, a.x, rt.world.heightAt(a.x, a.z) + 0.7, a.z);
      v.setXYZ(1, u.pos.x + tug, u.pos.y + 0.8, u.pos.z);
      v.needsUpdate = true; a.rope.visible = true;
    }
  }
  return hands;
}
// 縄を引いた分は本人と作業兵で共有する。応戦や離れた後も続きから引ける。
// 竹束の見回りも途中から再開する。共通の長押しや他の戦には持ち込まない。
function installSaikaWork(rt) {
  const updateHold = rt.updateHold, dispose = rt.dispose;
  rt.updateHold = function (dt, input) {
    // 手当ての専用札は、近くの杭や竹束より先に共通処理へ渡す。
    if (input.key('TreatWound') || this.hud.workHoldId === 'bandage')
      return updateHold.call(this, dt, input);
    const F = this.flags, it = this.nearestInteract();
    const a = F.step === 1 && F.stakes[F.workIndex];
    const cover = F.step === 4 && !F.cover && it?.id === 'cover';
    if (!cover && (!a || a.pulled || it?.id !== 's' + a.i)) return updateHold.call(this, dt, input);
    const u = this.player.u, hurt = this.headHoldTaken !== this.stats.taken;
    this.headHoldTaken = this.stats.taken;
    const held = input.key('KeyE') || this.hud.workHoldId === it.id;
    if (!held || !u.alive || this.over || F.ending || this.player.mounted ||
        u.moving || u.pAtk || u.swing || u.stagger || this.player.guard || input.left || hurt) {
      this.holdT = 0; this.holdId = null; this.holdPct = 0;
      return;
    }
    this.holdT = (cover ? F.coverWorkT : a.workT) || 0; this.holdId = it.id;
    updateHold.call(this, dt, input);
    if (cover) { if (!F.cover) F.coverWorkT = this.holdT; }
    else if (!a.pulled) a.workT = this.holdT;
  };
  rt.dispose = function () {
    this.updateHold = updateHold; this.dispose = dispose;
    return dispose.call(this);
  };
}
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();          // 胴
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();                       // 頭
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();   // 嘴
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }   // 翼
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();   // 尾
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }   // 三本の足
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();   // 目
  });
}

// 外した桶の底を、歩行用の補間でなく実際に描く地面へ着ける。
// 配置時だけ全頂点を測る。桶の形・材質は三つの作業場で共用する。
function placeSaikaBucket(world, bucket, x, z, tilt = 0) {
  const p = bucket.geometry.attributes.position, c = Math.cos(tilt), s = Math.sin(tilt);
  let y = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) * c - p.getY(i) * s;
    const py = p.getX(i) * s + p.getY(i) * c;
    y = Math.max(y, drawGroundAt(world, x + px, z + p.getZ(i)) - py);
  }
  bucket.rotation.z = tilt;
  bucket.position.set(x, y - .015, z);
}
function height(x, z) {
  // 和歌川沿いの低地として復元。南東の仮の丘を川床へ重ねると、
  // 川下の水面まで約四メートルせり上がるため、局地は小起伏と公記の高岸だけにする。
  // 地形の手掛かり（寸法は推定）：国土交通省「和歌山平野の古地理変遷」
  // https://www.kkr.mlit.go.jp/wakayama/history/kinokawa/1.html
  let h = 0.35 * Math.sin(-z * 0.03 + 0.2) * Math.cos(x * 0.028) + 0.25 * Math.sin(x * 0.07 - z * 0.02);
  h += 3.2 / (1 + Math.exp((x - (BANK + 8)) / 0.7)) * Math.max(0, Math.min(1, (140 - Math.abs(z)) / 30));
  if (SETTINGS.quality === 'high') {
    // 作業場・戦列から離れた田の隙間だけ掘る。渡河の川床と高岸には触れない。
    h -= .24 * fieldDrain(x, z);
    // 雑賀荘の砂州・砂丘を手掛かりに、西の遠い後方だけへ低い砂の稜線を置く。
    // 寸法と形は復元。高岸・控え・集落・渡り道のある x >= -140 は従来の高さ。
    // 既存の地面へ織り込み、形や材質、当たりの壁は増やさない。
    // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
    const edge = Math.max(0, Math.min(1, (-140 - x) / 60));
    const ridge = .5 + .5 * Math.sin(x * .055 + .6 * Math.sin(z * .016));
    h += 1.1 * edge * edge * (3 - 2 * edge) * ridge * ridge;
  }
  return h;
}
// 寄せ・一人称・揺れの後の実位置を守る。この戦の川底の杭は独自の形なので、
// 共通の建物判定だけでは視点が中へ入る。杭を抜いた口には補正を残さない。
function installSaikaCamera(rt, fences) {
  const player = rt.player, updateCamera = player.updateCamera, dispose = rt.dispose;
  const W = rt.world, direction = new THREE.Vector3(), corner = new THREE.Vector3();
  const game = rt.game, drawNow = game?.drawNow;
  // 描画なしでも、視点が面の内側だったかを数値で調べられる。
  const measure = rt.flags.saikaView = { groundGap: 0, waterGap: 0, inStake: false, lift: 0 };
  // 面の対角線を決め打ちせず、共通の描く地面と同じ頂点・面を測る。
  const groundY = (x, z) => drawGroundAt(W, x, z);
  const guardCamera = (camera) => {
    if (rt.game?.photo) return;
    camera.updateMatrixWorld();
    const p = camera.position;
    const ground = groundY(p.x, p.z), water = W.heightAt(p.x, p.z) + W.waterDepthAt(p.x, p.z);
    measure.groundGap = p.y - ground; measure.waterGap = p.y - water;
    measure.inStake = false;
    let y = Math.max(ground + 0.8, water + 0.8);
    // 視点の中心だけでなく、手前の描く面の四隅も地面・水面の外に保つ。
    // 視野角や縦横比を切り替えた直後の片側だけのめり込みを防ぐ。
    const hh = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
    for (let i = 0; i < 4; i++) {
      corner.set((i & 1 ? 1 : -1) * hh * camera.aspect, (i & 2 ? 1 : -1) * hh, -camera.near)
        .applyQuaternion(camera.quaternion);
      const x = p.x + corner.x, z = p.z + corner.z;
      y = Math.max(y, Math.max(groundY(x, z), W.heightAt(x, z) + W.waterDepthAt(x, z)) + 0.08 - corner.y);
    }
    for (const s of fences) {
      if (!s.alive || !s.mesh?.parent) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
      const x = ax + dx * t, z = az + dz * t;
      // 杭列ごとの材質を準備時に作り、視点に近い列だけ薄くする。
      const distance = Math.hypot(p.x - x, p.z - z);
      const opacity = 0.16 + 0.84 * Math.max(0, Math.min(1, (distance - 1) / 4));
      const posts = s.mesh.children[0], rope = s.mesh.children[3];
      posts.material.opacity = opacity; posts.material.depthWrite = opacity >= 1;
      posts.castShadow = opacity >= 1;
      rope.material.opacity = opacity; rope.material.depthWrite = opacity >= 1;
      // 傾いた杭と手前の切り口の余白も含め、重なる時だけ杭の上へ出す。
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.1 ** 2) {
        measure.inStake = true;
        y = Math.max(y, W.heightAt(x, z) + 2.6);
      }
    }
    for (const a of rt.flags.stakes) {
      const bucket = a.bucket;
      if (!bucket) continue;
      const opacity = 0.18 + 0.82 * Math.max(0, Math.min(1, (p.distanceTo(bucket.position) - 1) / 3));
      bucket.material.opacity = opacity; bucket.material.depthWrite = opacity >= 1;
    }
    // 視点と本人の間を塞ぐ束だけ描かない。縄や竹の裏面が重なる半透明の壁を避ける。
    // 視線が外れた束は不透明に戻す。弾除けと兵の当たりは変えない。
    for (const tb of rt.flags.bankTabas) {
      const s = tb.saikaSolid, target = player.u.pos;
      const cx = (p.x - tb.x) * s.c - (p.z - tb.z) * s.s;
      const cz = (p.x - tb.x) * s.s + (p.z - tb.z) * s.c;
      const tx = (target.x - tb.x) * s.c - (target.z - tb.z) * s.s;
      const tz = (target.x - tb.x) * s.s + (target.z - tb.z) * s.c;
      const t = Math.abs(tz - cz) > 0.001 ? -cz / (tz - cz) : -1;
      const h = p.y + (target.y + 1.1 - p.y) * t - tb.m.position.y;
      const blocks = t >= 0 && t <= 1 && Math.abs(cx + (tx - cx) * t) < s.hw + 0.2
        && h > -0.1 && h < 1.75;
      // 視点の中心が外でも、すぐ脇の竹の切り口が大写しになる範囲は空ける。
      const inside = Math.abs(cx) < s.hw + 0.5 && Math.abs(cz) < s.hd + 1.2
        && p.y < tb.m.position.y + 2.15;
      tb.m.visible = !blocks && !inside;
      tb.m.material.opacity = 1; tb.m.material.depthWrite = true;
      tb.m.castShadow = tb.m.visible;
    }
    measure.lift = Math.max(0, y - p.y);
    if (!measure.lift) return;
    camera.getWorldDirection(direction);
    p.y = y; player.camPos.copy(p);
    direction.add(p); camera.lookAt(direction);
    camera.updateMatrixWorld();
  };
  player.updateCamera = function (dt, camera) {
    updateCamera.call(this, dt, camera); guardCamera(camera);
  };
  // 速回し後の直接描画は視点更新を通らない。描く直前にも同じ補正を通す。
  const guardedDraw = function (fresh, scene) {
    const current = this.battle === rt && (!scene || scene === rt.scene);
    if (current) guardCamera(this.camera);
    const result = drawNow.call(this, fresh, scene);
    // 寄った視点や地面を避けた後の行列で、足元の輪も投影し直す。
    // 直接描画の時だけ通し、普段の毎コマには重ねない。
    if (current && rt.ready && rt.hud.rt === rt && !this.photo) rt.hud.drawOverlay(rt);
    return result;
  };
  if (drawNow) game.drawNow = guardedDraw;
  rt.dispose = function () {
    if (game?.drawNow === guardedDraw) game.drawNow = drawNow;
    for (const s of fences) {
      s.mesh.children[0].material.dispose(); s.mesh.children[3].material.dispose();
    }
    for (const a of rt.flags.stakes) {
      a.bucket.material.dispose();
    }
    player.updateCamera = updateCamera; this.dispose = dispose;
    return dispose.call(this);
  };
}
// この川岸だけ、背後の初撃の待ち時間を延ばす。共通の受け流し判定を使う。
function installSaikaRear(rt) {
  const army = rt.army, rear = army.hooks.onRearApproach, dispose = rt.dispose;
  // 背後の敵は足音と方角で知らせる。水面へ黒い板状の補助影を重ねない。
  army.hooks.onRearApproach = (u, target) => {
    u.rearGraceUntil = army.time + 1.6;
    if (u.atk && !u.atk.ranged && !u.atk.bow) {
      u.atk.t = Math.max(u.atk.t, 1.6); u.atk.dur = Math.max(u.atk.dur, u.atk.t);
    }
    u.rearParryUntil = army.time + Math.max(u.atk?.t || 0, 1.6) + 1.4;
    army.play('step', u.pos, 0.9);
    if (rear) rear(u, target);
  };
  rt.dispose = function () {
    army.hooks.onRearApproach = rear; this.dispose = dispose;
    return dispose.call(this);
  };
}
function tickSaikaRear(rt) {
  const F = rt.flags;
  if (rt.over || F.ending || !rt.player.u.alive) return;
  if (rt.t < (F.saikaRearScanAt || 0)) return;
  F.saikaRearScanAt = rt.t + 0.15;
  const player = rt.player.u, p = player.pos;
  let nearest = null, distance = 9, approaching = false;
  for (const u of rt.army.units) {
    if (!bankReady(u) || u.team === player.team || u.noTarget || u.type === 'gun' || u.type === 'bow' ||
        !rt.army.behindOf(player, u) || Math.abs(u.pos.y - p.y) > 2) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d >= 9 || rt.army.wallBetween(p, -1, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
    // 後ろにいるだけの控えや、味方と戦う敵を「迫る足音」にしない。
    // 本人の移動で距離が縮んだ時も鳴らさず、敵自身の歩く向きを見る。
    const closing = u.moving > 0.25 && ((p.x - u.pos.x) * u.vel.x + (p.z - u.pos.z) * u.vel.z) > d * 0.25;
    const striking = u.atk?.target === player || u.swing?.target === player && !u.swing.done;
    if (!closing && !striking) continue;
    if (d < distance) { nearest = u; distance = d; approaching = closing; }
  }
  if (!nearest) return;
  if (approaching && rt.t >= (F.saikaRearStepAt || 0)) {
    F.saikaRearStepAt = rt.t + 0.55;
    rt.army.play('step', nearest.pos, 0.35 + (9 - distance) * 0.07);
  }
  if ((F.saikaRearNoticeAt ?? -99) + 8 <= rt.t) {
    F.saikaRearNoticeAt = rt.t; rt.rearWindupT = rt.t;
    rt.hud.damageFrom(Math.atan2(nearest.pos.x - p.x, nearest.pos.z - p.z) - rt.player.yaw);
    rt.bark(approaching ? '後ろから足音！　振り向いて構えよ' : '背後に敵！　振り向いて構えよ', true);
  }
}
function moveGroup(g, to, facing) {
  if (g.routed || !g.count) return;
  // fixed は初めの配置を守る指定。歩き始めた列は道幅に合わせて持ち場を詰める。
  g.fixed = false;
  g.order = 'move'; g.dest = to; g.aggro = 6; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'hold'; q.facing = facing; q.aggro = 10; q.formation = q.units.every((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari'; };
}
// 東岸を見回り、杭抜きと川上・川下の寄せを援護する。道と到着処理は一度だけ作る。
function patrolBank(g, x, z) {
  g.saikaPatrol = [{ x, z }, { x, z: -z }];
  g.saikaPatrolIndex = 0;
  g.fixed = false; g.order = 'move'; g.dest = g.saikaPatrol[0];
  g.formation = 'column'; g.colW = 3; g.aggro = 18; g.guardSight = 30; g.guardLeash = 10;
  const turn = (q) => {
    q.saikaPatrolIndex = 1 - q.saikaPatrolIndex;
    q.dest = q.saikaPatrol[q.saikaPatrolIndex]; q.onArrive = turn;
  };
  g.onArrive = turn;
}
// 杭抜きの間は見回りに出ず、今の作業場の東側で組を守る。
// 行き先は設営時に用意し、次の杭へ移る時だけ下知を替える。
function guardWork(g, a) {
  moveGroup(g, g.saikaWorkSupport ? a.workAt : a.guardAt, WEST);
  g.guard = true; g.guardSight = 18; g.guardLeash = 6;
  // 引き継ぐ組も二列で縄へ寄る。敵が近ければ従来どおり応戦する。
  if (g.saikaWorkSupport) g.onArrive = (q) => {
    q.order = 'hold'; q.facing = WEST; q.formation = 'column'; q.colW = 2; q.aggro = 6;
  };
}
// 初めからいる小組へ下知し、敵が途切れたら次の組が歩いて寄る。
// 行き先は準備時に作って使い回す。杭列の東側を通り、西岸の柵へは出さない。
function sendRaider(g, z, x = -11, focus = null) {
  if (g.routed || !g.count) return;
  g.bankCommitted = true;
  g.bankDest.x = x; g.bankDest.z = z;
  g.fixed = false; g.order = 'move'; g.dest = g.bankDest;
  g.focus = focus; g.aggro = 12; g.seekRange = 24;
  g.formation = 'column'; g.colW = 2; g.speed = 3;
  g.onArrive = g.bankArrive;
}
function tickRaiders(rt, dt) {
  const F = rt.flags;
  if (F.step < 1 || F.step > 5) return;
  F.raidCheckT = (F.raidCheckT || 0) - dt;
  if (F.raidCheckT > 0) return;
  F.raidCheckT = 0.5;
  let near = false, available = false, next = null, nextDist = Infinity;
  const p = rt.player.u.pos;
  const work = F.step === 1 && F.stakes.find((a) => !a.pulled);
  const at = work ? work.guardAt : p;
  // 杭抜きの寄せは作業場を狙う。離れた本人を追って護衛の列まで連れ出さない。
  const focus = p.x >= -19 && p.x <= BACK.x + 28 && Math.abs(p.z) <= 72 &&
    (!work || Math.hypot(p.x - work.workAt.x, p.z - work.workAt.z) < 8) ? rt.player.u : null;
  // 杭抜きと渡河の間は東岸から迎える。西岸の柵へ敵味方を追い込まない。
  // 三つ目の杭の作業場所も杭列の東側にある。そこまで寄せを届かせる。
  const x = Math.max(-19, Math.min(BACK.x + 28, at.x));
  const z = Math.max(-72, Math.min(72, at.z));
  for (const g of F.raiders) {
    let ready = false, distance = Infinity;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed &&
        !g.routed) {
      if (u.type !== 'gun' && u.type !== 'bow') ready = true;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      distance = Math.min(distance, d);
      // 射手や柵越しの敵は、斬り合いの切れ目を埋めたことにしない。
      if (u.type !== 'gun' && u.type !== 'bow' && d < 4.5 && Math.abs(u.pos.y - p.y) < 3 &&
          !rt.army.wallBetween(u.pos, -1, p)) near = true;
    }
    if (!ready) continue;
    available = true;
    // 追加の寄せも初めからいる兵。切れ目が来るまで川べりの持ち場を守る。
    if (g.bankRelief && !g.bankCommitted) continue;
    // 後ろの二組は東岸の守りの山場に残す。現れる時も配置済みの兵が歩く。
    if (g.bankReserve) {
      if (F.step !== 5 || rt.t < g.bankReleaseAt) continue;
      g.bankReserve = false; g.bankStep = F.step;
      sendRaider(g, g.anchor.z > 0 ? 18 : -18, -2);
      g.bankWorkUntil = rt.t + 8;
    }
    if (!g.bankCommitted) {
      if (distance < nextDist) { next = g; nextDist = distance; }
      continue;
    }
    // 最初の小組は作業場へ先回りする。本人がまだ後方でも行き先を変えない。
    if (rt.t < g.bankWorkUntil) continue;
    if (g.bankStep !== F.step || Math.hypot(g.bankDest.x - x, g.bankDest.z - z) > 3 || g.focus !== focus) {
      g.bankStep = F.step;
      sendRaider(g, z, x, focus);
    }
  }
  F.raidsSpent = !available;
  F.raidGapT = near ? 0 : (F.raidGapT || 0) + 0.5;
  // 六秒の切れ目で、残る組のうち実際に近い組へ下知する。
  // 寄せた組は本人を狙い続け、到着しただけで寄せを済ませない。
  // 十二秒の切れ目には、川上・川下に用意した四組から近い組を回す。
  // 兵や形を戦闘中に作らず、倒れた組を作り直さない。
  if (F.raidGapT >= 12 && !next && (F.step === 1 || F.step === 4)) {
    let relief = null, distance = Infinity;
    for (const g of F.bankRelief) {
      if (g.bankCommitted || g.routed) continue;
      for (const u of g.units) if (bankReady(u)) {
        const d = Math.hypot(u.pos.x - x, u.pos.z - z);
        if (d < distance) { relief = g; distance = d; }
      }
    }
    if (relief) {
      relief.bankStep = F.step;
      sendRaider(relief, z, x, focus);
      F.raidGapT = 0;
    }
  }
  if (F.raidGapT >= 6 && next) {
    next.bankStep = F.step;
    sendRaider(next, z, x, focus);
    F.raidGapT = 0;
  }
}
// すでにいる後陣・近い控えを先手へ回す。新兵は作らず、五秒ごとに見る。
function reinforceBank(rt, dt) {
  const F = rt.flags;
  if (F.step < 1 || F.step > 5) return;
  F.reinforceT -= dt;
  if (F.reinforceT > 0) return;
  F.reinforceT = 5;
  // 作業兵だけが倒れて、そばの護衛が手を貸さないまま終わるのを防ぐ。
  // 既存の組が歩いて引き継ぐ。将や射手は縄引きに数えず、新兵も足さない。
  const work = F.step === 1 && F.stakes[F.workIndex];
  if (work && !work.pulled) {
    let workers = 0;
    for (const g of F.workParties) for (const u of g.units)
      if (bankReady(u) && u.type === 'ashigaru') workers++;
    if (workers < 2) for (const g of F.escorts) {
      if (g.routed || F.workParties.includes(g)) continue;
      let hands = 0;
      for (const u of g.units) if (bankReady(u) && u.type === 'ashigaru') hands++;
      if (hands < 2) continue;
      g.saikaWorkSupport = true; F.workParties.push(g); guardWork(g, work);
      rt.say('組頭', '手の空いた者は縄へ！　残る者は槍で守れ', 4);
      break;
    }
  }
  let ready = 0;
  for (const g of F.escorts) for (const u of g.units) if (bankReady(u)) ready++;
  if (ready >= 10) return;
  for (const g of F.defenders) {
    if (g === F.workers || g === F.teppo || F.escorts.includes(g) || g.routed) continue;
    let hands = 0;
    for (const u of g.units) if (bankReady(u) && u.type !== 'gun' && u.type !== 'bow') hands++;
    if (hands < 2) continue;
    F.escorts.push(g);
    // 杭の東側を守る。渡河中に減った場合もまず東岸へ集める。
    const work = F.step === 1 && F.stakes[F.workIndex];
    if (work) guardWork(g, work);
    else patrolBank(g, -5, 22);
    return;
  }
}
function warnBank(rt, key, title, text, at = BACK) {
  const F = rt.flags;
  if (F[key]) return;
  F[key] = true;
  rt.banner(title, text);
  rt.marker('bankDanger', at, title, { h: 3 });
}
function phase(rt, step, name, text, at, label) {
  const F = rt.flags;
  F.step = step; F.stepT = rt.t; F.inT = 0;
  // 川岸の合図で既に伝わった下知。古い使番の到着で渡河の札へ戻させない。
  rt.setPhase(name);
  const objective = rt.obj('main', text, 'main', true);
  objective.cue = ''; objective.cueT = 0;
  rt.objProgress('main', '');
  rt.unmark('goal'); rt.unmark('bankDanger');
  if (at) rt.marker('goal', at, label, { h: 3 });
}
// 渡河・引き退き・停止は文の拾い読みではなく、下知の段に合わせる。
// 共通の合成音を後陣から鳴らし、同じ意味を任務札にも残す。
function bankSignal(rt, kind, cue) {
  const o = rt.objectives.find((o) => o.id === 'main');
  if (o) { o.cue = cue; o.cueT = rt.t; }
  rt.army.playFar('sig_' + kind, SIGNAL_FROM, 1);
}
// 東側の兵を杭の向こうへ戻さない。西側では抜けた口を使い、未開通なら杭列の端を回る。
// 下知が出た時だけ道を作る。毎コマの道探しには使わない。
function withdrawRoad(rt, c, to = { x: 58, z: 0 }) {
  if (c.x >= -8) return [[to.x, to.z]];
  const east = { x: -8, z: c.z }, west = { x: -28, z: c.z };
  // 杭ぎわでは出発点が当たりの幅に入る。両側とも塞がった判定なら、
  // 東へ抜ける。東側の兵を西へ戻す道にすると、残った杭に突っ込む。
  if (!rt.army.wallBetween(c, -1, east) || rt.army.wallBetween(c, -1, west)) return [[-8, c.z], [to.x, to.z]];
  let opening = null, distance = Infinity;
  for (const a of rt.flags.stakes) if (a.pulled && Math.abs(a.z - c.z) < distance) {
    opening = a; distance = Math.abs(a.z - c.z);
  }
  const z = opening ? opening.z : c.z > 0 ? 76 : -66;
  return [[-28, z], [-8, z], [to.x, to.z]];
}
function withdrawGroup(rt, g, to) {
  if (g.routed || !g.count) return;
  const c = g.center();
  g.fixed = false; g.retreatOnly = true; g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = withdrawRoad(rt, c, to); g.pathIdx = 0;
  g.aggro = 6; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.facing = WEST; q.formation = q.units.every((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari'; q.aggro = 10; };
}
// 表すのは目の前の持ち場だけ。人数と各将の座標は復元で、紀州全軍の総数ではない。
// 稲葉父子・氏家・飯沼の紀ノ川の守り、和泉の信長、浜手の信忠・孫一は画面外。
const JIN = [
  rosterPlan('川岸の対陣', 0, { x: 72, z: 0 }, WEST, [
    ['sakuma', '後陣（佐久間勢・復元）', '佐久間勢の組頭（名は不明）', 16, 72, 0, 'sakuma', 'sakuma', 0, { bind: 'honjin' }],
    ['hori', '渡河の援護', '堀秀政', 19, 26, 0, 'oda', 'oda', 0, { bind: 'hori' }],
    ['workers', '杭を外す組', '堀秀政の配下（名は不明）', 6, 20, 0, 'oda', 'oda', 0, { bind: 'workers' }],
    ['guns', '東岸の鉄砲', '堀秀政の配下（名は不明）', 12, 10, 0, 'oda', 'oda', 0, { bind: 'teppo' }],
    // 公記にある山手の諸勢を、既存の控えで表す。各大将本人を川岸へ追加しない。
    // 川上・川下・後方への割り当てと人数は復元で、史料の陣所や総兵数ではない。
    ['north', '川上の控え（羽柴勢・復元）', '羽柴勢の組頭（名は不明）', 120, 50, -70, 'oda', 'oda', 120, { w: 36, d: 24, host: 56 }],
    ['south', '川下の控え（荒木勢・復元）', '荒木勢の組頭（名は不明）', 120, 50, 70, 'oda', 'oda', 120, { w: 36, d: 24, host: 56 }],
    ['rear', '後方の控え（別所勢・復元）', '別所勢の組頭（名は不明）', 60, 110, 0, 'oda', 'oda', 60, { w: 24, d: 18 }],
  ], '信長公記巻十。佐久間・羽柴・荒木・別所・堀は山手勢。川岸に描く各勢の持ち場・人数・佐久間の陣所は復元。各勢の総兵数ではない'),
  rosterPlan('高岸の守り', 1, { x: -110, z: 0 }, EAST, [
    ...[-24, -12, 0, 12, 24].map((z, i) => ['gun' + i, '柵の鉄砲の小組', '雑賀の将（名は不明）', 5, -47, z, 'yatagarasu', 'yatagarasu', 0, { bind: 'gunPosts.' + i }]),
    ['spear', '柵の控え', '雑賀の将（名は不明）', 20, -57, 0, 'yatagarasu', 'yatagarasu', 0, { bind: 'reserve' }],
    ['upstream', '川上の柵と林', '雑賀の将（名は不明）', 72, -57, -64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18, host: 18 }],
    ['downstream', '川下の柵と家', '雑賀の将（名は不明）', 72, -57, 64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18, host: 18 }],
    ['rear', '西岸の後備え', '雑賀の将（名は不明）', 100, -110, 0, 'yatagarasu', 'yatagarasu', 100, { w: 30, d: 24 }],
    ['scout', '川下を回った小組', '雑賀の将（名は不明）', 8, -9, 32, 'yatagarasu', 'yatagarasu', 0, { bind: 'skirmish' }],
    ['northRaid', '川上を回った小組', '雑賀の将（名は不明）', 7, -9, -48, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.1' }],
    ['southRaid', '川下を回った小組', '雑賀の将（名は不明）', 7, -9, 48, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.0' }],
    ['northFollow', '川上の後ろの小組', '雑賀の将（名は不明）', 7, -9, -64, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.3' }],
    ['southFollow', '川下の後ろの小組', '雑賀の将（名は不明）', 7, -9, 64, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.2' }],
    ...[80, -80, 96, -96].map((z, i) => ['relief' + i, z > 0 ? '川下の寄せの控え' : '川上の寄せの控え',
      '雑賀の将（名は不明）', 5, -9, z, 'yatagarasu', 'yatagarasu', 0, { bind: 'bankRelief.' + i }]),
  ], '信長公記巻十。川岸の将名は不明。川上・川下の渡りと小組の動きは復元'),
];
// 備え表でも、紀州へ出た総勢と、この局地へ割り当てた人数を区別する。
for (const plan of JIN) plan.numbers = 'この川岸の持ち場ごとの目安。史料の総兵数ではない';
// 東岸に寄せている残敵だけを案内する。西岸の射手や待機中の控えは追わせない。
const saikaFoe = (u) => !!u?.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut &&
  !u.noTarget && !u.isStruct && !u.civ && !u.downed && !u.rearWound && !u.group?.routed;
function saikaNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.ending || F.step !== 5) return null;
  if (F.foePickT === rt.t && (F.nearestFoe === null || saikaFoe(F.nearestFoe))) return F.nearestFoe;
  F.foePickT = rt.t;
  let best = null, distance = Infinity;
  for (const g of F.raiders || NO_HOSTS) {
    if (g.noAI || g.routed) continue;
    for (const u of g.units) {
      if (!saikaFoe(u) || Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) >= 24) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < distance) { distance = d; best = u; }
    }
  }
  F.nearestFoe = best;
  return best;
}
const saika = {
  jinkei: JIN,
  // 稲生の型。右上の任務一行・ピン・敵の▼・大将の印だけを使う。
  missionSingleLine: true, hideMissionDots: true, hideGuideSteps: true,
  enemyTriangleSigns: true, nearbyAllySignLimit: 0, noDodgeCard: true,
  quietMiss: true, noPlayerFoot: true,
  missionPinCaption: '', missionDetail: () => '', missionStatus: () => '',
  bannerAllowed: (rt) => rt.over || !!rt.flags.ending,
  missions: ['杭抜き組を守れ', '川を渡れ', '退く合図を待て', '東岸へ戻れ', '列を整えよ', 'ここを守れ', 'この敵を倒せ', '後陣へ戻れ'],
  missionOf(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending) return 7;
    if (F.step <= 1) return F.pulled === 3 ? 1 : 0;
    if (F.step === 2) return F.reached || p.x < -28 && p.x > BANK && Math.hypot(p.x - SHORE.x, p.z - SHORE.z) < 7 ? 2 : 1;
    if (F.step === 3) return 3;
    if (F.step === 4) return F.cover ? 5 : 4;
    return saikaNearestFoe(rt) ? 6 : 5;
  },
  missionHeading(rt) {
    const F = rt.flags;
    if (F.ending) return rt.tracker.main ? '東岸を守った' : this.missions[7];
    if (F.step === 3 && Math.hypot(rt.player.u.pos.x - BACK.x, rt.player.u.pos.z - BACK.z) < 16) return '仲間を待て';
    return this.missions[this.missionOf(rt)];
  },
  // 名の不明なこの局地の組頭を使う。討取りを勝利条件にはしない。
  commanderSignTarget(rt) {
    return !rt.flags.ending && saikaFoe(rt.flags.saikaBoss) ? rt.flags.saikaBoss : null;
  },
  commanderTarget(rt) {
    const u = this.commanderSignTarget(rt);
    return u && saikaNearestFoe(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionSignTarget(rt) { return saikaNearestFoe(rt); },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.over || !rt.player.u.alive || F.ending && rt.tracker.main) return null;
    const q = F.saikaPin || (F.saikaPin = { x: 0, z: 0, r: 5, hide: 5 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.progress = 0; q.route = false;
    let at = BACK, r = 16;
    const foe = saikaNearestFoe(rt);
    if (foe) {
      if (rt.player.inRange && rt.player.rangeCueTarget === foe) return null;
      at = foe.pos; r = 2; q.unit = foe; q.enemy = true;
    } else if (F.ending) {
      const m = rt.markers.find((m) => m.id === 'goal');
      at = m ? typeof m.pos === 'function' ? m.pos() : m.pos : REAR;
      r = 5;
    } else if (F.step <= 1) {
      const a = F.stakes.find((a) => !a.pulled);
      at = a ? a.workAt : SHORE; r = a ? 8 : 7;
      q.waiting = !!a; q.progress = a ? (a.workT || 0) / 12 : 0;
    } else if (F.step === 2 || F.step === 3) {
      const turn = rt.markers.find((m) => m.id === 'riverTurn');
      at = turn ? typeof turn.pos === 'function' ? turn.pos() : turn.pos : F.step === 2 ? SHORE : BACK;
      r = turn ? 2 : F.step === 2 ? 7 : 16;
      q.route = !!turn;
      q.waiting = !turn && (F.step === 3 || !!F.reached);
      q.progress = F.step === 3 ? Math.min(1, F.inT / 5) : 0;
    } else if (F.step === 4 && !F.cover) {
      at = COVER; r = 3.2; q.waiting = true; q.progress = (F.coverWorkT || 0) / 6;
    } else {
      q.waiting = true; r = 35; q.progress = Math.min(1, F.inT / 20);
    }
    q.x = at.x; q.z = at.z; q.r = q.hide = r;
    q.arrived = q.waiting && Math.hypot(p.x - at.x, p.z - at.z) < r;
    return q;
  },
  // 東岸の農耕地と西岸の雑賀荘は市の地理図を手掛かりにする。渡河地点の実測ではない。
  // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
  introPlace: '小雑賀川の東岸（渡河地点は復元）',
  // 史実と操作を同じ案内へまとめる。重複した指定で史実の説明を上書きしない。
  // 公記巻十の山手・浜手の区別。詳しい諸将・分進の日付は戦後の史実に残す。
  // https://ja.wikisource.org/wiki/信長公記
  introText: 'まず川べりの黄旗へ。杭抜き組を守り、手が空いたら「杭を外す」を長押し。三か所が済んだら中央の口から渡り、退けの合図で東の元の岸へ戻ろう。戻ったら「列を整える」を長押しし、味方の旗を守ろう。\n\nここは山手勢の堀秀政の先手が渡る小雑賀川。浜手の中野城攻めとは別の戦場です。山手勢の案内は根来寺の杉之坊と、雑賀の内の三緘衆。雑賀の全てが敵ではありません。敵は西の高岸と柵を鉄砲で守ります。信長公記では、馬も上がれない岸に阻まれ、堀勢は引きます。\n\n川底の仕掛けと杭抜き、東岸の竹束は遊びの補完です。信長公記の渡河記事には両軍の兵数がなく、表示はこの川岸に描く兵の目安です。渡河の日・時刻・天気も不明で、昼の明るさと湿った岸、地形の寸法や東西の向きは復元です。',
  noTaisho: true, // 信長・孫一をこの局地へ自動配置し、討取り・本陣襲撃で決着させない。
  // 公記は高岸・柵・鉄砲による渡河阻止を記し、この局地の兵力比は記さない。
  // 共通の開戦演出は正面百五十歩先を仮の大軍として映すため、
  // 雑賀では通常の開戦視点を使い、実際の川岸と守りを見せる。描く兵は減らさない。
  noDespair: true,
  compactIntro: true,
  introTaskFirst: true, // 最初の行き先と操作を、人物・川岸の補足より先に読む。
  distanceUnit: 'steps',
  flagDirectionOnly: true, // 歩数は任務にある。添える行は向きだけにして二重表示を避ける。
  compactTravelArrow: true, // 道案内は行き先の短い矢印。手前の兵を太い帯で隠さない。
  singleRouteGuide: true, // 道筋が描けた時は足元からの案内線を重ねず、行き先の印を残す。
  compactDestinationSign: true, // 携帯の中央で旗の印が兵の上半身を隠さない。
  groundFlagGuides: true, // 杭抜きの実旗を縦長の白枠で覆わず、根元の小印へ案内する。
  footFlagGuides: true, // 実旗を指定した時も根元の印一つ。本人や任務札から長い線を渡さない。
  compactFlagGuide: true, // 戻る隊旗も足元へそろえ、川面と兵の姿を空ける。
  compactRetreatSign: true, // 手傷で退く時も小さい旗と矢印を使う。
  retreatArrowLength: 64, // 退避先まで白線を渡さず、足元の短い矢印と旗で示す。
  keepRetreatReason: true, // 「ここへ」だけにせず、手傷・囲まれ・息切れの理由を残す。
  keepWoundRetreatReason: true, // 負傷しても杭抜きの小旗へ戻る下知に置き換えない。
  keepRetreatGestureReason: true, // なぞる向きは補足へ。手傷の理由と戻る仕事を見出しに残す。
  woundEffectMin: .05,
  // 浅い手足の傷だけで、渡河中も退避先へ往復させない。
  // 出血・深手・包囲・息切れと、被弾直後の退避は共通の判定に任せる。
  woundRetreatNeeded(rt) {
    const u = rt.player.u;
    return u.wounds?.bleed > .0001 || u.hp < u.maxHp * .3 || u.woundSlow > .15 || u.armWound > .15;
  },
  treatmentCrossSign: true, // 杭抜きの旗と、手当てする場所の十字を見分ける。
  treatmentApproachLabel: '味方へ下がって手当て',
  treatmentMoveCaption(rt) {
    // 手当てへ移動中も、操作の説明だけで出血と退避の目的を隠さない。
    return rt.def.treatmentGuideLabel(rt, rt.hud.retreatGuide);
  },
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentReady) return p.treating ? '「手当て」を押し続けよ' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '構えて、味方の後ろへ下がれ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '味方へ下がって手当て';
    if (p.treatmentNext > rt.t) return 'ここで待て。手当ての支度中';
    if (p.aiming || p.draw > 0 || p.chargeT > 0) return '狙いを外し、ここで止まれ';
    return 'ここで止まれ。敵が離れたら手当て';
  },
  compactDestinationArea: true, // 待つ範囲が画面を横切る時は輪を省き、旗と下知を残す。到着判定は変えない。
  // 近い持ち場を四角へ縮めても、肩越しでは兵を覆う。上限付きの足元の輪を使う。
  smallTaskAreas: true, smallRetreatAreas: true, taskAreaFootRing: true,
  compactGroundGoalRing: true, subtleGroundGuides: true,
  hidePlayerSign: true, // 自分は背中と足元で見分けられる。近い視点で切れる白い輪を重ねない。
  playerFootSignOnly: true, // 別経路で描く本人の白い人型も抑える。見やすさ優先の設定は残す。
  teamSignsOnly: true, // 味方の白い人型を省き、頭上の丸で見分ける。
  noUnitContrast: true, // 敵側には上の指定が効かない。体からずれる白い人型を省き、頭上の敵味方の印を残す。
  compactCombatGuides: true, // 接敵の向きは既存の短い矢印で示し、構えと槍先を空ける。
  enemyCornerSign: true, // 敵案内が読む四隅の指定。胴を太い白枠で囲まない。
  enemyFrameAtPosition: true, // 骨の更新前でも、今いる場所へ印を合わせる。
  enemyFootRingRadius: .4, // 足元の小印にし、隣の兵や川岸を白輪で覆わない。
  compactApproachGuide: true, // 間合いへ寄る時も、短い足元の矢印で示す。
  subtleFlagFrames: true, // 実物の小旗には細い輪だけを添える。
  subtleTargetFrames: true, // 戻る隊旗の囲みを細め、布と旗持ちの姿を見せる。
  subtleEnemyFrames: true, // 狙う敵は細い四隅で示し、構えと装具を太い箱で覆わない。
  namedGuideMarkers: true,
  coverGuidePlace: true, // 鉄砲を避ける物陰を、川を渡る途中の「旗へ戻れ」と取り違えさせない。
  coverGuideLabel: '鉄砲を避け、物陰へ',
  // 危険への退避と、渡河後の引き退きの下知を区別する。
  retreatGuideLabel(rt, reached) {
    if (reached) return rt.flags.step === 1 ? '構えよ。敵が離れたら小旗へ' : '味方のそばで構えよ';
    const p = rt.player;
    // 被弾直後の退避は軽い傷でも出る。深手かどうかは残る体力で分ける。
    if (p.u.hp < p.u.maxHp * .3) return '深手だ。味方へ下がれ';
    if (p.u.mobbed) return '囲まれた。味方へ下がれ';
    if (p.u.wounds?.bleed > .0001) return '血が出ている。味方へ下がれ';
    if (p.u.woundSlow > (this.woundEffectMin ?? 0)) return '足にけが。味方へ下がれ';
    if (p.u.armWound > (this.woundEffectMin ?? 0)) return '腕にけが。味方へ下がれ';
    if (p.sta < 20) return '息を整えよ。味方へ下がれ';
    if (rt.t < (rt.retreatUntil || 0)) return '手傷だ。味方へ下がれ';
    return '敵から離れ、味方へ';
  },
  // 退避を先に教えつつ、元の仕事と進みを同じ一枚に残す。
  // 手傷の歩数表示だけで、杭抜きや最後の守りを忘れさせない。
  taskDetail(rt, title, progress) {
    const cue = rt.hud.retreatGuide, F = rt.flags;
    if (!cue?.active || !cue.valid || F.ending) return progress;
    const reached = Math.hypot(cue.x - rt.player.u.pos.x, cue.z - rt.player.u.pos.z) < cue.radius;
    const reason = cue.treatment ? this.treatmentGuideLabel(rt, cue) : this.retreatGuideLabel(rt, reached);
    // 見出しに退避の理由が出ていれば繰り返さず、仕事の進みを残す。
    const detail = title.startsWith(reason) ? '' : `${reason}\n`;
    // 退避中も作業兵の状態と長押しの説明を残し、零％のまま待たせない。
    return `${detail}${progress}`;
  },
  // 元気に渡る・引き返す間は中央の口を案内する。応戦・深手・息切れでは身を守る案内を残す。
  routeGuidePriority: (rt) => !rt.flags.ending && (rt.flags.step === 2 || rt.flags.step === 3) &&
    rt.player.inCombatT <= 0 && rt.player.u.hp >= rt.player.u.maxHp * .6 &&
    !rt.player.u.mobbed && rt.player.sta >= 20 && rt.t >= (rt.retreatUntil || 0),
  // 行き先と危険を避ける印を、同じ「ここへ」で呼ばない。
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.ending) return rt.player.u.pos.x <= -8 ? '中央の口へ' : '後ろの陣へ';
    if (F.step <= 1) return '川べりの小旗へ';
    // 中央へ揃える印と、その先の岸を同じ「渡り口」で呼ばない。
    if ((F.step === 2 || F.step === 3) && rt.markers.some((m) => m.id === 'riverTurn')) return '中央の口へ';
    if (F.step === 2) return F.reached ? '坂を登らず、ここで待て' : '西岸の足場へ';
    return F.step === 3 ? '東岸の旗へ' : F.step === 4 ? '竹束へ' : '東岸の旗へ';
  },
  keepWaitOrderLabel: true, // 待つ場所の共通表示でも、見張り・応戦・守り終えた待機を区別する。
  waitOrderLabel(rt, reached) {
    if (rt.flags.step === 2) return reached ? '坂を登らず合図を待て' : '坂の下の印へ戻れ';
    if (rt.flags.step === 5 && !rt.flags.ending) {
      if (!reached) return '東岸の旗へ戻れ';
      return rt.flags.holdTask || '旗のそばで川沿いを見張れ';
    }
    return reached ? '旗のそばで下知を待て' : '東岸の旗へ戻れ';
  },
  dodgeLabel(_rt, direction, rain) {
    return direction ? `${direction.startsWith('右') ? '右' : '左'}へよける` : rain ? '矢をよける' : '敵から離れよ';
  },
  // 退避の仮の旗を、杭抜きの小旗や東岸へ戻る隊旗と呼び分ける。
  dodgeGuideLabel(_rt, arrived, rain) {
    return arrived ? 'ここで構えよ' : rain ? '矢を避ける印へ' : '敵を避ける印へ';
  },
  staminaLabel: '気力',
  // 足元で待つ下知と取り違えない。防いだ後の反撃も同じ操作札で教える。
  guardStartText: '敵の一撃を防げ',
  guardWaitText: '構えて一撃を防げ',
  meleeApproachText: '印の敵へなぞって進む', // 反撃の案内は、任務の小旗と呼び分ける。
  releaseGuardForAttack: true,
  // 二十秒を数える間も、遠い敵を追う案内で持ち場から誘い出さない。
  // 案内する相手そのものを調べる。別の敵が近いだけで遠い反撃先を許さない。
  meleeGuide(rt, enemy) {
    if (rt.flags.step !== 5) return true;
    const p = rt.player.u;
    return !!enemy && enemy.team !== p.team && bankReady(enemy) && !enemy.noTarget &&
      !enemy.isStruct && enemy.type !== 'gun' && enemy.type !== 'bow' &&
      Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) <= 4.5 &&
      Math.abs(enemy.pos.y - p.pos.y) < 3 && !rt.army.wallBetween(p.pos, -1, enemy.pos);
  },
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (!enemy || !bankReady(enemy) || enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        rt.army.wallBetween(u.pos, -1, enemy.pos)) return false;
    // 別の槍が本人へ振り下ろされる間は、防ぐ案内を続ける。
    for (const e of rt.army.threats || NO_HOSTS) {
      if (e.team === u.team || !bankReady(e)) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5) return false;
    }
    return true;
  },
  nearAllyFadeRadius: 1.1, // 視点へ入り込む一人だけ避け、隣の具足は濃く残す。
  nearAllySolidBody: true, // 顔・胴を別々に透かし、首だけ浮く姿を作らない。
  nearAllyWholeOcclusion: true, // 自分との間を塞ぐ味方も、描く間だけ全身で避ける。
  nearAllyHorseFade: true, // 目の高さを越える騎手だけでなく、手前の馬の胴も透かす。
  nearHatFadeRadius: 0, // 笠と首布を透かさず、視点への食い込みは全身で避ける。
  nearSpearFade: false, // 一律に槍を縮めず、視線を塞ぐ柄だけ既存の判定で避ける。
  nearLongWeaponRadius: 10, // 後列の長柄も肩越しへ届く。描く間だけ近い柄と隊旗を避ける。
  nearGroundSpearRadius: 12, // 川岸に落ちた長柄も、持ち手から離れた穂先まで拾う。
  nearGroundSpearClearance: 3, // 視点の下や脇へ差し込む落ち槍も避け、画面を横切る柄を残さない。
  nearFlagFadeRadius: 6, // 横から入る長い幟も、本人との間を塞ぐ時だけ避ける。
  camPull: 1.1, camLift: 0.45, // 味方の笠が手前へ重なっても、構えと足元を見る余白を保つ。
  // 任務の文と印の名前が違っても、今の作業場へ案内する。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending) return 'goal';
    if (F.step === 1) return F.workIndex >= 0 && F.workIndex < 3 ? 's' + F.workIndex : '';
    if ((F.step === 2 || F.step === 3) && rt.markers.some((m) => m.id === 'riverTurn')) return 'riverTurn';
    return 'goal';
  },
  fullDrawArea: true, // 直接描画でも、前の影・仕上げの描く範囲を画面へ持ち越さない。
  noDistantBattle: true, // 備え表にない軍勢と川を越える自動の押し合いを足さない。
  botOrders: true, // 杭抜き・渡河・引き退きの道順を、遊び手の突進で上書きしない。
  taskDetails: true, // 携帯でも、杭の本数・縄を引いた割合・長押しの案内を残す。
  keepCombatTask: true, // 操作の札が出ても、杭抜きの本数と進み具合を隠さない。
  keepCombatTaskDetail: true, // 退避・応戦の見出しでも、作業の進みと復帰先を残す。
  keepTaskWithWork: true, // 作業釦だけを選び、任務を知らせの候補から外さない。
  keepTaskWithGuard: true, // 構える釦が出ても、杭抜き組を守る目的を残す。
  keepTaskWithDodge: true, // よけた後も、作業の小旗へ戻る指図を残す。
  keepTaskWithRain: true, // 鉄砲を避ける間も、杭抜きの本数と戻る小旗を残す。
  keepTaskWithCoach: true, // なぞる手ほどきだけで、元の任務を知らせの候補から外さない。
  keepTaskLabel: true, // 応戦中も「杭のそばで敵を払え」など、守る目的を残す。
  keepCombatTaskHeading: true, // 携帯の接敵案内で見出しまで操作文へ替えない。操作は下の一行だけ。
  keepTaskPanel: true, // 敵の胸元へ札を動かさず、任務と進みを同じ欄に保つ。
  keepApproachTaskPanel: true, // 敵へ寄る時も同じ欄を使い、旗へ戻る目的を読み続けられるようにする。
  // 近くの味方一人を自動で護衛対象にせず、杭抜き・渡河・引き退きの下知を保つ。
  keepRescueTaskLabel: true,
  guardGuideAllowed: () => false,
  keepDestinationTask: true, // 小旗へ着いても、護衛や長押しを「旗へすすめ」で消さない。
  keepFlagTravelTask: true, // 「あの旗へ」に替えず、何か所目の小旗かを残す。
  // 歩数は下の方向案内に一本化する。到着半径を引いた別の歩数を見出しへ重ねない。
  flagTravelLabel: (_rt, title) => title,
  keepFlagArrivalTask: true,
  immediateTaskChanges: true, // 到着・応戦・長押しの切り替えを十秒待たせない。
  immediatePhaseTasks: true, // 渡河から引き退きへ替わった下知をすぐに見せる。
  noReserve: true, // 近い控えの置換とは別に、後詰の新兵を足さない。
  footRunners: true, // 杭と竹束が並ぶ浅瀬では使番も徒歩。馬で作業兵の間へ割り込まない。
  // 共通の二騎は別枠で作られ、徒歩の指定も母衣の指定も通らない。
  // この狭い作業場では置かず、下知は既存の徒歩の使番に任せる。
  noCouriers: true,
  sideTaskAfter: Infinity, // 高岸の櫓を取る用事を足さず、渡河と引き退きの下知を守る。
  // 杭抜きも護衛の戦う段。任務の文が変わっても小勢の寄せを止めない。
  frontlineDensity: { phases: ['stakes', 'cross', 'regroup', 'hold'] },
  wakeRoom: 235, // 使番の余地を残し、近い控えを同じ場所の本物へ替える。
  spawn: { x: 8, z: -6, heading: WEST },
  world: {
    blockedHint: () => '陣幕は東にある。西へ進み、杭の印へ寄れ。渡る時は中央の口を通れ',
    // 公記のこの渡河記事には天候・時刻の記載がない。昼と湿った岸は見た目の復元。
    seed: 15772, time: 'day', fieldStage: 'fallow', muddy: 0.6, waterSlow: true,
    // 東は＋横、南は＋奥行き。共通の正回転では南の日が東へ戻るため、西へ進める。
    // 当日の時刻は不明。移動の速さと光・影の品質は保ち、方角だけを合わせる。
    // https://eco.mtk.nao.ac.jp/koyomi/faq/glossary.html
    sunDriftSign: -1,
    // 川を往復して画面外へ出た兵も、手首と指・具足を同じ位置へそろえる。
    // 槍は持ち主と同じ束で描き、透かした兵の柄だけを宙へ残さない。
    drawTimeUnitParts: true, fullTipMatrices: true, movingHiddenBones: true,
    // 胴や騎手の骨へ刺さった矢を、親の縮尺で長槍ほどに引き伸ばさない。
    keepPinnedArrowSize: true, pinnedArrowAxisScale: true, pinnedArrowRenderScale: true,
    // 川岸の足の踏み替えと、槍衾の呼吸・押し返しを一人ずつずらす。当たりの間は変えない。
    variedMarch: true, livingSpearHedge: true,
    // 川沿いの二つの軽い斬り合いは、十六歩先から黒い輪郭へ落とさない。
    // 既存の袖・顔のある中距離の形を使う。控えも腕を省いた黒い胴にしない。
    // 兵数と実兵への置換は増やさない。
    clashMiddleDetail: 40, lowArmyDetail: true, middleInfantryArms: true,
    noHaori: true, // 本の足軽の具足姿へそろえ、組頭にも陣羽織・母衣を着せない。
    // 各鉄砲小組の弓は一人。実際に放つ矢だけを飛ばし、数十本の追加矢を降らせない。
    noArrowRain: true,
    // 岸の石と根元の葉を立体にし、近い三角の黒い塊を作らない。
    groundedSlopeRocks: true, curvedRockTufts: true, rockDrawGround: true,
    rockSlopeContact: true, // 回転した岩の腹と縁を、描く川岸の斜面へ埋める。設営時だけ。
    litRockTufts: true, // 葉の裏にも空の光を当て、岩際の根草を黒い刃にしない。
    // 落ちた笠に首の垂れ布を残さず、川岸に縁を着ける。
    bareFallenHats: true, slopeLitter: true,
    longitudinalSpearFalls: true, // 握りではなく穂先と石突で岸の高さを測り、落ち槍を宙へ持ち上げない。
    // 横倒しのひねりを地面へ収め、亡骸と落ちた槍を重ねすぎない。
    groundedFalls: true, settleSideFalls: true, spreadFalls: true, crumpledFlags: true,
    // 同時に撃たれても膝が折れる間をずらし、体が地に着いた時にだけ重い音を出す。
    fallPaceSpread: 0.35, groundedFallImpact: true,
    // 湿った岸では白い土煙を立てず、既存の粒の枠で低く暗い泥を散らす。
    wetEarthBursts: true,
    // 土塊の升の境を陰と凹凸から除き、川岸を敷石の格子に見せない。
    softEarthCrust: true,
    nearAllyFadeRadius: 1.1, // 更新側も描く直前の全身よけに合わせる。
    // 共通の八十歩の上限では、昼でも対岸と後陣が白く消える。
    // この川岸だけ見通しを延ばす。兵・草木の数や細かい形の距離は増やさない。
    battleViewDistance: 160, smokeFogFloor: 300,
    // 火口の煙は残し、数十秒溜まる名残だけ小さく短くする。
    gunHazeScale: .65,
    streams: [{ pts: RIVER, w: 12, depth: 0.65, sedimentWater: true }, ...(TOWN_DITCHES)],
    // 陸道は水際で切る。川床まで道扱いにして急な岸を登れる抜け道にしない。
    // 川上・川下の小組は従来どおり浅い川床を渡る。橋は史料にないので描かない。
    paths: [[[150, 0], [30, 0], [-6, 0]],
      // 紀ノ川方面の北へ通じる後方の陸道。正確な道筋は復元で、渡り口そのものは画面外。
      ...(SETTINGS.quality === 'high' ? [[[96, -240], [96, -140], [96, 0]]] : []),
      // 川を限って対陣する東岸も、川上・川下の控えを後方道へ結ぶ。
      // 山手勢の配置を補う復元の陣内道。公記に道筋の記載はない。
      // 田（x >= 108）と焼失家屋（x=78、z <= -112）の外で既存の道へ接続する。
      // 川べりの戦列・渡り口から離し、地面の道判定だけで表す。
      ...(SETTINGS.quality === 'high' ? [
        [[96, -70], [50, -70]],
        [[96, 0], [96, 70], [50, 70]],
      ] : []),
      // 根来寺は小雑賀の北東。田と畦の既存の口を保ち、田の外で北東へ折る。
      // 市公開の地理図を手掛かりにした方角の復元で、当日の行軍路の断定ではない。
      // 渡河・斬り合いの持ち場から離し、兵や地面の形は増やさない。
      ...(SETTINGS.quality === 'high' ? [[[240, -170], [196, EAST_ROAD_Z], [184, EAST_ROAD_Z], [96, EAST_ROAD_Z]]] : []),
      ...(SETTINGS.quality === 'high' ? TOWN_PATHS : []),
      // 公記の高岸の守りを、後備えから孤立した三つの備えに見せない。
      // 柵の西の平坦部だけに連絡路を補う。道筋は復元で、史料の街道ではない。
      // 番所・長屋・集落の水路を避け、高岸や川床には登れる道を通さない。
      ...(SETTINGS.quality === 'high' ? [
        [[-86, -64], [-86, 0], [-86, 64]],
        [[-110, 0], [-86, 0], [-57, 0]],
        [[-86, -64], [-57, -64]], [[-86, 64], [-57, 64]],
        // 備えから川沿いの集落へ。水路の手前で東へ折れ、既存の町道へつなぐ。
        // 高岸の西に収め、柵を越える道・橋・新しい渡り口は作らない。
        // 陣と集落をつなぐ景観の補完で、当日の連絡路が判明したものではない。
        [[-86, -64], [-86, -110], [-45, -110], [-45, -140]],
        [[-86, 64], [-86, 110], [-45, 110], [-45, 140]],
      ] : []),
      [[4, 140], [-5, 140]], [[-35, 140], [-120, 140]],
      [[4, -140], [-8, -140]], [[-37, -140], [-120, -140]]], height,
    paddy: eastFields,
    tint(x, z, h, c) {
      if (x < -38 && x > -140 && Math.abs(z) < 200 && !townClearing(x, z)) {
        const spring = .5 + .5 * Math.sin(x * .19 + Math.sin(z * .13)) * Math.cos(z * .23);
        // 若草と越冬した枯れ草の斑。色だけで草原を明るい緑一色にしない。
        c.copy(SAIKA_DRY).lerp(SAIKA_YOUNG, spring).multiplyScalar(.48);
        if (SETTINGS.quality !== 'high') {
          const field = Math.max(0, saikaFieldAt(x, z));
          c.lerp({ r: .235, g: .205, b: .115 }, field * .9);
        }
      }
      // 高岸の雨筋と崩れた砂土。足場と登れる傾斜は変えず、法面だけへ不規則に重ねる。
      const slope = Math.max(0, 1 - Math.abs(x - (BANK + 8)) / 7)
        * Math.max(0, Math.min(1, (115 - Math.abs(z)) / 15));
      const wash = Math.pow(.5 + .5 * Math.sin(z * 1.71 + Math.sin(z * .31) * 2 + x * .22), 6);
      const patch = .5 + .5 * Math.sin(z * .47 + x * .8) * Math.sin(z * .19 - x * .57);
      c.lerp({ r: .37, g: .28, b: .18 }, slope * Math.min(.8, wash * .65 + patch * .35));
      if (SETTINGS.quality === 'high') {
        // 公記の「岸高く」を土の急岸として見せる景観の補完。地層の実測ではない。
        // 雨筋だけの一様な斜面にせず、高さに沿う薄い土色の帯を重ねる。
        // 地面の頂点色だけを使い、岸の高さ・傾斜と歩ける範囲は保つ。
        const layer = .5 + .5 * Math.sin(h * 10 + Math.sin(z * .12) * .7);
        c.lerp({ r: .49, g: .37, b: .24 }, slope * layer * .24);
      }
      if (SETTINGS.quality === 'high') {
        // 西の砂地を地面の色へ織り込み、既存の草・木・兵・陰影の細かさを保つ。
        // 後で屋敷の踏み跡と水際の湿った土を重ね、砂で塗り潰さない。
        c.lerp(westSandSoil, westSand(x, z));
        // 田を水田の青や夏草にせず、既存の地面に土色の区画と畦の余白を描く。
        c.lerp(fieldSoil, eastFields(x, z) * .9);
        // 田を一面の水田にせず、乾いた溝底と湿った土の筋を描く。
        c.lerp({ r: .28, g: .25, b: .18 }, fieldDrain(x, z) * .8);
        // 本の屋敷地のような踏み固めた砂土。水路と外の岸は土色で塗り潰さない。
        const dz = Math.abs(Math.abs(z) - 156);
        const yard = Math.max(0, Math.min(1, (x + 120) / 2, (-53 - x) / 2, (13 - dz) / 2));
        const road = Math.max(0, Math.min(1, (x + 119) / 2, (-42 - x) / 3, (3 - dz) / 1.5));
        const wear = .85 + .1 * Math.sin(x * .83 + z * .57) * Math.sin(z * 1.13);
        c.lerp({ r: .48, g: .405, b: .30 }, Math.max(yard * .78, road * .92) * wear);
      }
      if (z >= RIVER[0][1] && z <= RIVER[RIVER.length - 1][1]) {
        const cx = riverCenter(z);
        const edge = Math.abs(Math.abs(x - cx) - 12);
        if (edge < 4) {
          // 西の砂地と東の農耕地の色を残し、水際だけ湿った土へつなぐ。
          // 当日の河床の粒度は不明なので、両岸を一律の明るい礫浜にはしない。
          const grain = .92 + .08 * Math.sin(x * 3.7 + z * 5.3) * Math.sin(z * 2.9 - x * 4.1);
          c.lerp({ r: .27 * grain, g: .22 * grain, b: .14 * grain }, (1 - edge / 4) * .75);
        }
      }
    },
    clear: (x, z) => (Math.abs(z) < 90 && x > -90 && x < 80)
      || townClearing(x, z) || fieldClearing(x, z) || ruinClearing(x, z),
    // 早春の踏み荒らされた川岸。背の高い株を減らし、泥と兵の足元を見せる。
    trees: 304, noBamboo: true, tufts: 1700, tuftTint: 0xc5b99b, thickTrees: true, roundNeedles: true, layeredNeedles: true, detailedBoardShields: true,
    tuftColor(x, z, c) {
      const spring = .5 + .5 * Math.sin(x * .19 + Math.sin(z * .13)) * Math.cos(z * .23);
      // 材質の枯れ草色を掛けた後も若草色になるよう、株の色を補正する。
      c.copy(SAIKA_DRY).lerp(SAIKA_YOUNG, spring);
      // 砂丘まで湿った川岸と同じ若草色にしない。地面と同じ乾湿の境を使う。
      // 市公開の砂州・砂丘の地理を手掛かりにした色の復元で、当日の植生は不明。
      // 既存の株の色だけを変え、草・兵の数や形、材質は増減しない。
      if (SETTINGS.quality === 'high') c.lerp(SAIKA_DRY, westDrySand(x, z) * .8);
      const field = saikaFieldAt(x, z), ridge = Math.cos((x + 122) * 5.236);
      if (SETTINGS.quality !== 'high' && field > .15 && ridge > .65 && Math.sin(z * .91 + x * .37) > .72) {
        c.copy(SAIKA_FLOWER);
      }
      c.setRGB(c.r / SAIKA_DRY.r, c.g / SAIKA_DRY.g, c.b / SAIKA_DRY.b);
    },
    // 草の総数を増やさず、法尻と東岸の道肩へ群落の起点を寄せる。
    undergrowthBands: [
      { x: -40, z: 0, w: 3, d: 105 },
      { x: -36.5, z: 0, w: 1.1, d: 100 },
      { x: -3, z: 0, w: 2.5, d: 85 },
      { x: 20, z: 0, w: 5, d: 90 },
      { x: -105, z: 0, w: 15, d: 110 },
      { x: -71, z: 86, w: 11, d: 23 },
      { x: -71, z: -86, w: 11, d: 23 },
    ],
    // 写真の井楼の通し柱と、交互に重ねた横木。雑賀の二基だけが指定する。
    lookoutLogFrame: true,
    // 既存の枝先の凹凸と閉じた樹冠を使い、積んだ円錐と裂けた葉の面を避ける。
    raggedNeedles: true, softFarNeedles: true, closedFarCrowns: true, unevenCrowns: true,
    // 市の地理図が示す低地・砂州に合わせ、共通の杉主体の林を松の多い木立へ。
    // 樹種の比率は景観の補完。総数・配置・乱数の消費と既存の共有形は保つ。
    // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
    treeMix: SETTINGS.quality === 'high' ? { sugi: .12, matsu: .78 } : undefined,
    // 市のガイドが示す東の農耕地・西の砂州を、戦場外の森で塞がない。
    // 共通の遠景は近景の treeDensity を通らないため、同じ疎林の景観を別途指定する。
    // 本数の割合は復元。兵の密度・木の形や材質の細かさは変えない。
    farTreeDensity: SETTINGS.quality === 'high' ? (x, z) => {
      if (x > 0) return .08;
      return 1 - westDrySand(x, z) * .82;
    } : undefined,
    // 東岸の低地を、田の区画の外だけ密林で囲まない。
    // 農耕地の地理を手掛かりに疎林へつなぐ。個々の木の位置は復元で、
    // 川岸の松と屋敷脇の竹は下の帯へまとめ、兵の配置は保つ。
    treeDensity: (x, z) => townClearing(x, z) || fieldClearing(x, z)
      || ruinClearing(x, z) || saikaFieldAt(x, z) > 0 ? 0 :
      SETTINGS.quality === 'high' && x > 0 ? .08 :
      // 西の砂地も一様な密林にしない。川岸の木立・集落の囲いは保つ。
      // 杉や松の細かさと総数の設定を保ち、既存の配置判定だけで疎林へつなぐ。
      SETTINGS.quality === 'high' && x < -100 ? .8 - .62 * Math.min(1, (-100 - x) / 60) :
      Math.abs(z) < 100 && x > -100 && x < 90 ? 0.1 : 0.8,
    // 背景の木と無作為な竹林を振り替える。既存の竹一株は七本なので、各帯四株で二十八本。
    groves: [
      { x: -133, z: 156, r: .6, line: [0, 22], n: 4, kind: 'take' },
      { x: -133, z: -156, r: .6, line: [0, 22], n: 4, kind: 'take' },
      { x: -59, z: 94, r: .6, line: [0, 18], n: 4, kind: 'take' },
      { x: -59, z: -94, r: .6, line: [0, 18], n: 4, kind: 'take' },
      // 高では集落へ折れる道（奥行き±110）の手前に並木を収める。
      // 指定の林は共通の道避けを通らないため、端の松も道から八メートル以上離す。
      // 道も植生も景観の復元。本数と共有の形・材質、川岸の戦列は保つ。
      { x: -49, z: SETTINGS.quality === 'high' ? 78 : 84, r: .5,
        line: [0, SETTINGS.quality === 'high' ? 48 : 52], n: 16, kind: 'matsu' },
      { x: -49, z: SETTINGS.quality === 'high' ? -78 : -84, r: .5,
        line: [0, SETTINGS.quality === 'high' ? 48 : 52], n: 16, kind: 'matsu' },
    ],
    climbTan: 0.70,
    fleeOut: (x, z, team) => team === 1 ? x < -110 : x > 120,
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags, W = rt.world;
    if (SETTINGS.quality === 'high') saikaFieldBanks(rt);
    if (SETTINGS.quality === 'high' && W.farLand) {
      // 市公開の雑賀衆ガイドが示す西の砂州を、戦場外の地面の色にもつなぐ。
      // 東の低地も春の休閑田へつなぎ、共通の夏草色や林床へ急に戻さない。
      // 既存の頂点色と濃淡だけを使う。東の丘陵は範囲外とする。
      // 砂地の範囲は景観の復元。川筋・高岸・兵の足場や木の数には触れない。
      // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
      const geo = W.farLand.geometry, pos = geo.attributes.position, colors = geo.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const sand = westDrySand(x, z);
        const grain = .92 + .08 * Math.sin(x * .08 + z * .035);
        // 市の地理図が示す東岸の農耕地を手掛かりにした景観の補完。
        // 区画・耕作の状態は当日の記録ではない。川筋と遠山の色は保つ。
        const east = Math.max(0, Math.min(1, (x - 108) / 40));
        const low = Math.max(0, Math.min(1, (14 - pos.getY(i)) / 8));
        const fallow = east * east * (3 - 2 * east) * low * low * (3 - 2 * low);
        const plot = .9 + .1 * Math.sin(Math.floor(x / 38) * 7 + Math.floor(z / 46) * 3);
        colors.setXYZ(i,
          (colors.getX(i) * (1 - sand) + westSandSoil.r * grain * sand) * (1 - fallow) + fieldSoil.r * plot * fallow,
          (colors.getY(i) * (1 - sand) + westSandSoil.g * grain * sand) * (1 - fallow) + fieldSoil.g * plot * fallow,
          (colors.getZ(i) * (1 - sand) + westSandSoil.b * grain * sand) * (1 - fallow) + fieldSoil.b * plot * fallow);
      }
      colors.needsUpdate = true;
    }
    // 北は負の奥行き。共通の昼光は北東からなので、この川岸では春の南中前後を想定する。
    // 当日の時刻は不明。明るさ・雲・影の品質を保ち、光源と空の太陽を同じ南へ向ける。
    const daylight = W.currentLook();
    daylight.sunDir.set(0, 1.2, 1).normalize();
    W.applyLook(daylight);
    // 共通の遠山は全周を高峰で囲む。和歌川下流を山間の盆地に見せない。
    // 和歌浦へ開ける南は低く、南西の秋葉山方面は低い丘、北・東は遠い山並みとする。
    // 国土交通省「紀の川の歴史」の旧河道・和歌浦を手掛かりにした方角の復元。
    // https://www.mlit.go.jp/river/toukei_chousa/kasen/jiten/nihon_kawa/0604_kinokawa/0604_kinokawa_01.html
    // 和歌山市の雑賀衆ガイドは小雑賀の対岸に秋葉山を示す。南西まで一様に潰さない。
    // https://www.city.wakayama.wakayama.jp/_res/projects/default_project/_page_/001/034/752/saikapdf.pdf
    // 峰の形や見かけの高さは実測でない。既存の三層の頂点だけを準備時に直す。
    for (const mountain of W.mountains.children) {
      const geo = mountain.geometry, pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
        const south = Math.max(0, Math.min(1, ((z - x * 0.35) / (r * Math.hypot(1, 0.35)) - 0.72) / 0.22));
        const open = south * south * (3 - 2 * south);
        const west = Math.max(0, -x / r);
        // 市の地理図では西は雑賀荘の砂州と海側。全周の山を縮めるだけでは
        // 真西にも高い稜線が残るため、高では西向きの範囲を低地へなだらかに開く。
        // 南西の秋葉山方面と北・東の山並みは範囲外。海岸線の位置は断定しない。
        const coast = SETTINGS.quality === 'high' ? Math.max(0, Math.min(1, (west - .82) / .18)) : 0;
        const coastOpen = coast * coast * (3 - 2 * coast);
        // 南西の狭い範囲だけ稜線を残す。南の開け・近い高岸・兵の足場には触れない。
        const southwest = Math.max(0, Math.min(1, ((-x + z) / (r * Math.SQRT2) - 0.9) / 0.1));
        const ridge = southwest * southwest * (3 - 2 * southwest);
        const scale = Math.max((1 - 0.6 * west * west) * (1 - 0.94 * open)
          * (1 - 0.94 * coastOpen), 0.3 * ridge);
        const y = -12 + (pos.getY(i) + 12) * scale;
        pos.setY(i, y); uv.setY(i, y);
      }
      pos.needsUpdate = true; uv.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingSphere();
    }
    // 近景だけを描く時は遠山が空なので、植え直す物もない。
    const nearMountain = W.mountains.children[0];
    if (SETTINGS.quality === 'high' && nearMountain) {
      // 共通の山の木・露岩は、上の稜線修正より先に元の山肌へ置かれる。
      // 南の開けや西の低丘の上空に残さず、修正済みの三角面から配置し直す。
      // 古い二つの束は解放し、同じ種・描画予算・共有形の仕組みで準備時だけ作る。
      // 後ろから外し、子の配列を複製せずに済ませる。
      for (let i = nearMountain.children.length - 1; i >= 0; i--) {
        const detail = nearMountain.children[i];
        if (!detail.isInstancedMesh) continue;
        nearMountain.remove(detail);
        detail.geometry.dispose(); detail.material.dispose();
        detail.dispose();
      }
      W.buildMountainDetails();
    }
    // 川岸は網目に抜かない。既存の視点補正で描く地面の上へ保つ。
    W.terrain.material.userData.camNearSolid = true;
    saikaFieldSurface(W);
    F.step = 0; F.pulled = 0; F.ak = 0; F.ek = 0; F.pressure = 0;
    // この戦だけ、届く時と表示する時の両方で古い渡河の声を止める。
    F.oldCrossWord = (text) => F.step >= 3 && /渡れ|西岸へ進め|向こう岸へ取り付け|退く下知を待て|退く合図(?:に備えよ|を待て)/.test(text);
    const say = rt.say;
    rt.say = function (sp, text, dur) {
      if (F.oldCrossWord(text)) return;
      return say.call(this, sp, text, dur);
    };
    const hud = rt.hud;
    // 指図の字幕・掛け声の札は出さず、任務一行と合図の音にそろえる。
    // 共用の画面係は触らず、この戦の参照だけを包み、退出時に戻す。
    const quietSay = () => false, quietBark = () => {};
    rt.hud = new Proxy(hud, { get(target, key, receiver) {
      return key === 'say' ? quietSay : key === 'bark' ? quietBark : Reflect.get(target, key, receiver);
    } });
    const disposeNotices = rt.dispose;
    rt.dispose = function () {
      this.hud = hud; this.say = say; this.dispose = disposeNotices;
      return disposeNotices.call(this);
    };
    // 不透明な水面の裏は描かない。川底から見た暗い面で地面や兵を覆わせない。
    // 上向きの面と水深の判定は残し、杭抜き・渡河の足場を変えない。
    for (const st of W.def.streams) {
      st.mesh.material.side = THREE.FrontSide;
      // 小雑賀川だけ、既存の深さと岸からの距離で水の縁を透かす。
      // 細長い水面の切り口を残さず、川床・渡河判定と描画数は変えない。
      if (st.sedimentWater) {
        const mat = st.mesh.material, compile = mat.onBeforeCompile;
        const cacheKey = mat.customProgramCacheKey();
        // 五列の川面を共通の二列用補修へ渡すと、岸の透けと川幅方向が失われる。
        // 雑賀で仕上げた面として保ち、兵の初回更新でも不透明へ戻さない。
        st.mesh.userData.waterSurfaceReady = true;
        mat.transparent = true; mat.opacity = .72; mat.depthWrite = false; mat.alphaTest = .01;
        mat.onBeforeCompile = function (shader, renderer) {
          compile.call(this, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
            diffuseColor.a *= smoothstep(0.0, 0.65 + bedNoise * 0.8, ${st.w.toFixed(2)} - abs(vWaterBed.y))
              * smoothstep(0.0, 0.12, vWaterBed.x);
            #include <alphatest_fragment>`);
        };
        mat.customProgramCacheKey = () => cacheKey + '|saikaShore';
      }
      st.mesh.material.needsUpdate = true;
    }
    // 川の色・影・流れは共通の水処理に任せ、白くする上書きや水面の重ね描きをしない。
    const surfaceY = (x, z) => W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.035;
    // 春の川辺は前年の枯れ茎を主体にし、短い新芽を交ぜる。季節からの景観の補完。
    // ヨシの地上部は冬に枯れ、春に芽を出す。当地・当日の植生の確定ではない。
    // https://www.cgr.mlit.go.jp/ootagawa/Bio/plants/index082.htm
    const springReeds = SETTINGS.quality === 'high';
    // 葦は細い茎と垂れる葉を一つの形にまとめる。裸の棒の等間隔な列にしない。
    const reedParts = [new THREE.CylinderGeometry(0.008, 0.018, 1, 4)];
    for (let j = 0; j < 2; j++) {
      const leaf = new THREE.PlaneGeometry(.085, .52, 1, 3), p = leaf.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const t = (p.getY(k) + .26) / .52;
        p.setXYZ(k, p.getX(k) * (1 - t * .95) + .34 * t,
          -.12 + j * .24 + .24 * Math.sin(t * Math.PI) - .22 * t, .055 * Math.sin(t * Math.PI));
        // 枯れ葉は細く巻いて下へ垂らす。夏の幅広い葉を株全体へ残さない。
        if (springReeds) p.setXYZ(k, p.getX(k) * .55,
          p.getY(k) - .3 * t * t, p.getZ(k) * .45);
      }
      leaf.rotateY(j * 2.7); leaf.computeVertexNormals(); reedParts.push(leaf);
    }
    const reedGeo = mergeGeometries(reedParts);
    for (const part of reedParts) part.dispose();
    const reeds = new THREE.InstancedMesh(reedGeo,
      new THREE.MeshLambertMaterial({ color: springReeds ? 0xffffff : 0x77764a, side: THREE.DoubleSide }), 240);
    const reedPose = new THREE.Object3D();
    const reedColor = new THREE.Color();
    let reedN = 0;   // 渡り口の葦は y の拡大を 0 にせず、並べない（潰れた行列は法線が NaN になり、にじみが画面の半分を黒く塗った）
    for (let i = 0; i < 240; i++) {
      const clump = Math.floor((i % 120) / 4), side = i < 120 ? -1 : 1;
      const z = (clump - 15) * 6.4 + Math.sin(clump * 5.7 + side) * 1.4 + Math.sin(i * 11) * .5;
      if (Math.abs(z) < 7) continue;
      // 市公開の地理図を手掛かりにした川岸の景観補完。植生の位置・背丈は実測ではない。
      // 川下まで同じ川筋を使い、高画質では低い群落にずらして等間隔な列を避ける。
      const cx = riverCenter(z);
      const high = SETTINGS.quality === 'high';
      const offset = high ? Math.sin(clump * 7) * .7 + Math.cos(i * 2.4) * .4 : Math.sin(i * 7) * .7;
      const x = cx + side * (13.2 + offset);
      const shoot = springReeds && i % 8 === 0;
      const h = (high ? .65 + (Math.sin(i * 11) + 1) * .4 : .8 + (Math.sin(i * 11) + 1) * .45)
        * (shoot ? .32 : 1);
      // 描く川岸へ根元を差し込む。春の新芽も地面の上へ浮かせない。
      reedPose.position.set(x, drawGroundAt(W, x, z) + h * .48, z);
      reedPose.scale.set(1, h, 1);
      reedPose.rotation.set(Math.sin(i) * 0.18, i * 2.4, side * 0.15);
      reedPose.updateMatrix(); reeds.setMatrixAt(reedN, reedPose.matrix);
      if (springReeds) {
        reedColor.setHex(shoot ? 0x747b46 : 0x9a835d).multiplyScalar(.86 + (Math.sin(i * 3.7) + 1) * .1);
        reeds.setColorAt(reedN, reedColor);
      }
      reedN++;
    }
    reeds.count = reedN; reeds.instanceMatrix.needsUpdate = true; rt.scene.add(reeds);
    if (springReeds) reeds.instanceColor.needsUpdate = true;
    // 狙われている印は毎回保つ。遠い射手の同じ警告文だけは三十秒あける。
    const gunNotice = rt.army.hooks.onGunAtPlayer, arrowNotice = rt.army.hooks.onArrowAtPlayer;
    rt.army.hooks.onGunAtPlayer = () => {
      rt.aimedT = Math.max(rt.aimedT || 0, 2.5);
      if (rt.t < (F.gunNoticeAt || 0)) return;
      F.gunNoticeAt = rt.t + 30; gunNotice();
    };
    rt.army.hooks.onArrowAtPlayer = () => {
      if (rt.t < 10 || rt.t < (F.arrowNoticeAt || 0)) return;
      F.arrowNoticeAt = rt.t + 30; arrowNotice();
    };
    F.rescued = true; // 倒れた直後の担ぎ起こし・全快で戦列へ戻さない。
    F.hist = { bank: '史料', withdrawal: '史料', stakes: '補完', flank: '補完', numbers: '仮置き' };
    crowTex();
    // 川底は柵の並びと分ける。曲がった丸太と逆茂木に、結び縄を添える。
    // 丸い胴と短い削り先を分ける。胴の頂点を潰して刃のような長い面を作らない。
    const stakeBody = new THREE.CylinderGeometry(0.085, 0.11, .82, 8);
    stakeBody.translate(0, -.09, 0);
    const stakeTip = new THREE.ConeGeometry(.085, .18, 8);
    stakeTip.translate(0, .41, 0);
    const stakeGeo = mergeGeometries([stakeBody, stakeTip]);
    stakeBody.dispose(); stakeTip.dispose();
    // 水に浸かった根元は濃く、乾いた木口は明るく。丸い側面にも陰影を残す。
    const stakeColors = [], stakePos = stakeGeo.attributes.position;
    const wetWood = new THREE.Color(0x49392a), dryWood = new THREE.Color(0x927453), woodColor = new THREE.Color();
    for (let i = 0; i < stakePos.count; i++) {
      woodColor.copy(wetWood).lerp(dryWood, Math.max(0, stakePos.getY(i) + 0.5));
      stakeColors.push(woodColor.r, woodColor.g, woodColor.b);
    }
    stakeGeo.setAttribute('color', new THREE.Float32BufferAttribute(stakeColors, 3));
    stakeGeo.computeVertexNormals();
    const stakeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x79694e });
    const stakePose = new THREE.Object3D(), tie = new THREE.Vector3(), axis = new THREE.Vector3();
    // 輪を閉じず、隣の杭の波ともつなげない。白い鎖の帯に見せない。
    const waveGeo = new THREE.RingGeometry(0.18, 0.195, 12, 1, 0.3, Math.PI * 0.7);
    waveGeo.rotateX(-Math.PI / 2);
    const waveMat = new THREE.MeshBasicMaterial({ color: 0xb4c3b8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const foamGeo = new THREE.PlaneGeometry(0.24, 0.8);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xc0cbbb, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    foamMat.onBeforeCompile = sh => {
      sh.uniforms.uFlowTime = { get value() { return SETTINGS.reduceMotion ? 0 : W.time || 0; } };
      sh.vertexShader = 'varying vec2 vWakeUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWakeUv = uv;');
      sh.fragmentShader = 'uniform float uFlowTime; varying vec2 vWakeUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float along = 1.0 - vWakeUv.y;
        float width = 0.08 + along * 0.28;
        float trail = 1.0 - smoothstep(width, width + 0.14, abs(vWakeUv.x - 0.5) * 2.0);
        float pulses = 0.65 + 0.35 * sin(along * 28.0 - uFlowTime * 6.0);
        diffuseColor.a *= trail * (1.0 - along) * pulses;
        if (diffuseColor.a < 0.004) discard;`);
    };
    const riverFence = (world, seg) => {
      const m = new THREE.Group(), [ax, az, bx, bz] = seg;
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.75));
      const ties = [], lastTie = new THREE.Vector3();
      const postsMat = stakeMat.clone(); postsMat.transparent = true;
      const posts = new THREE.InstancedMesh(stakeGeo, postsMat, n + 1 + Math.floor((n + 2) / 3));
      const waves = new THREE.InstancedMesh(waveGeo, waveMat, Math.floor(n / 3) + 1);
      const foam = new THREE.InstancedMesh(foamGeo, foamMat, Math.floor(n / 3) + 1);
      let count = 0;
      for (let i = 0; i <= n; i++) {
        const k = Math.sin(ax * 13 + az * 7 + i * 11);
        const x = ax + (bx - ax) * i / n + k * 0.15;
        const z = az + (bz - az) * i / n + k * 0.13;
        const y = world.heightAt(x, z), h = 1.15 + (k + 1) * 0.175;
        stakePose.scale.set(0.85 + (k + 1) * 0.2, h, 1);
        // 同じ側へ傾く櫛にせず、川底へ根元を打ち込む。傾きで底が浮く分も戻す。
        stakePose.rotation.set(k * 0.35, i * 0.7, Math.sin(x * 17 + z * 9) * 0.48);
        axis.set(0, 1, 0).applyQuaternion(stakePose.quaternion);
        const cy = y + axis.y * h * 0.5 - 0.12;
        stakePose.position.set(x, cy, z);
        stakePose.updateMatrix(); posts.setMatrixAt(count++, stakePose.matrix);
        // 結び目も水面との交点も、傾けた杭の実際の軸から求める。
        tie.set(0, 0.19 + (k + 1) * 0.065, 0).applyMatrix4(stakePose.matrix);
        // 四本ほどの小束で結ぶ。白い一本の手すりを川の端まで渡さない。
        if (i && i % 5 !== 0) {
          const mx = (lastTie.x + tie.x) * 0.5, mz = (lastTie.z + tie.z) * 0.5;
          const my = (lastTie.y + tie.y) * 0.5 - 0.1 - (k + 1) * 0.045;
          ties.push(lastTie.x, lastTie.y, lastTie.z, mx, my, mz,
            mx, my, mz, tie.x, tie.y, tie.z);
        }
        lastTie.copy(tie);
        let wx = x, wz = z;
        // 水面は川筋に沿って傾くので、交点を二回寄せる。
        for (let j = 0; j < 2; j++) {
          const d = (surfaceY(wx, wz) - cy) / axis.y;
          wx = x + axis.x * d; wz = z + axis.z * d;
        }
        const wy = surfaceY(wx, wz);
        // 全ての杭へ輪を並べると白い鎖に見える。短い波を三本に一本だけ添える。
        if (i % 3 === 0) {
          stakePose.position.set(wx, wy, wz);
          stakePose.rotation.set(0, k, 0); stakePose.scale.set(1, 1, 1.1 + k * 0.15);
          stakePose.updateMatrix(); waves.setMatrixAt(i / 3, stakePose.matrix);
        }
        // 泡は杭の軸と水面の交点を囲む。杭抜きでは杭と一緒に消える。
        // 川の点の順へ伸ばす。杭との交点を筋の上流端に置く。
        let fx = 0, fz = 1;
        for (let j = 0; j < RIVER.length - 1; j++) {
          const a = RIVER[j], b = RIVER[j + 1];
          if (wz < a[1] || wz > b[1]) continue;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          fx = (b[0] - a[0]) / length; fz = (b[1] - a[1]) / length; break;
        }
        // 泡を全ての杭へ同じ長さで並べず、短い流れを間引く。
        if (i % 3 === 0) {
          // 平面の上流端を杭へそろえ、泡が杭を越えて上流へはみ出さないようにする。
          const scale = .7 + (k + 1) * .25, tail = .4 * scale;
          stakePose.position.set(wx + fx * tail, surfaceY(wx + fx * tail, wz + fz * tail), wz + fz * tail);
          stakePose.rotation.set(0, Math.atan2(fx, fz), 0); stakePose.scale.set(1, 1, scale);
          stakePose.updateMatrix(); foam.setMatrixAt(i / 3, stakePose.matrix);
        }
        if (i % 3 === 1) {
          stakePose.scale.set(0.7, 1.5, 0.7); stakePose.rotation.set(0, 0, -1.1);
          stakePose.position.set(x + 0.4, y + 0.3, z);
          stakePose.updateMatrix(); posts.setMatrixAt(count++, stakePose.matrix);
        }
      }
      posts.castShadow = true; posts.receiveShadow = true;
      posts.instanceMatrix.needsUpdate = true; m.add(posts);
      waves.instanceMatrix.needsUpdate = true; m.add(waves);
      foam.instanceMatrix.needsUpdate = true; m.add(foam);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ties, 3));
      const tiesMat = ropeMat.clone(); tiesMat.transparent = true;
      m.add(new THREE.LineSegments(g, tiesMat));
      return m;
    };
    // 西岸の遠景は尖った竹矢来。横竹と結び縄を一つの形へまとめ、裸の竿にしない。
    const bambooMat = new THREE.MeshLambertMaterial({ color: 0x82734a });
    const bambooPost = new THREE.CylinderGeometry(0.065, 0.085, 1, 8);
    const bambooTip = new THREE.ConeGeometry(0.065, 0.25, 8);
    const bambooTie = new THREE.TorusGeometry(0.095, 0.018, 3, 8);
    const bankFence = (world, seg, { h }) => {
      const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
      // 射手の正面は狭間のある板塀、その間は竹矢来。同じ壁の耐久と当たりを保つ。
      const midZ = Math.abs((az + bz) / 2);
      // 中央の五つの射手と川上・川下の備えを覆う。間は既存の竹矢来へ戻す。
      // 長い城壁の帯を作らず、壁の高さ・当たり・射手の足場は変えない。
      if ((midZ < 30 || Math.abs(midZ - 64) < 7)) {
        // 板塀は笠板と目地を見せ、外へ突き出す乱杭は裾の列にまとめる。
        return castleBoardFence(world, seg, { h, boardCap: true, boardSeams: true, unevenBoards: true });
      }
      const n = Math.max(2, Math.ceil(len / 0.48)), parts = [];
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        const y = world.heightAt(x, z), hh = h - 0.18 + Math.sin(z * 2.7) * 0.12;
        const post = bambooPost.clone(); post.scale(1, hh + 0.2, 1); post.translate(x, y + hh / 2 - 0.1, z); parts.push(post);
        const tip = bambooTip.clone(); tip.translate(x, y + hh + 0.025, z); parts.push(tip);
        for (const hy of [0.55, h * 0.72]) {
          const tie = bambooTie.clone(); tie.rotateX(Math.PI / 2); tie.translate(x, y + hy, z); parts.push(tie);
        }
      }
      for (const hy of [0.55, h * 0.72]) {
        const a = new THREE.Vector3(ax, world.heightAt(ax, az) + hy, az + 0.1);
        const b = new THREE.Vector3(bx, world.heightAt(bx, bz) + hy, bz + 0.1), d = b.clone().sub(a);
        const rail = new THREE.CylinderGeometry(0.045, 0.045, d.length(), 6);
        rail.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        rail.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(rail);
      }
      if (SETTINGS.quality === 'high') {
        // 公記の「川岸に柵」を手掛かりに、竹矢来の横木を支える控えを陣内へ置く。
        // 形・間隔は復元。高岸の外や射手の正面へ突き出さず、壁の当たりは保つ。
        // 既存の竹の形と材質を使い、準備時に同じ一枚の形へまとめる。
        const rearX = -(bz - az) / len, rearZ = (bx - ax) / len;
        const supports = Math.max(1, Math.ceil(len / 3));
        for (let i = 0; i < supports; i++) {
          const t = (i + .5) / supports;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const foot = new THREE.Vector3(x + rearX * .9,
            world.heightAt(x + rearX * .9, z + rearZ * .9) - .08, z + rearZ * .9);
          const top = new THREE.Vector3(x, world.heightAt(x, z) + h * .72, z);
          const direction = top.clone().sub(foot);
          const brace = bambooPost.clone(); brace.scale(1, direction.length(), 1);
          brace.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
          brace.translate((foot.x + top.x) / 2, (foot.y + top.y) / 2, (foot.z + top.z) / 2);
          parts.push(brace);
        }
      }
      const mesh = new THREE.Mesh(mergeGeometries(parts), bambooMat);
      for (const part of parts) part.dispose();
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    };
    const cameraFences = [];
    const wall = (pts, name, h = 2.5) => {
      const river = name === '川底の杭';
      const segs = wallLine(rt, pts, { team: 1, hp: 1e9, name, segLen: 6,
        mesh: river ? riverFence : bankFence, meshOpt: { h } });
      for (const s of segs) { s.noTarget = true; s.wall = true; }
      if (river) cameraFences.push(...segs);
      return segs;
    };
    F.stakes = STAKES.map((a, i) => ({ ...a, i, pulled: false, segs: wall([[a.x, a.z - 4], [a.x, a.z + 4]], '川底の杭', 1.2) }));
    wall([[-19, 70], [-18, 22]], '川底の杭', 1.2);
    wall([[-19, 14], [-21, 4]], '川底の杭', 1.2);
    wall([[-21, -4], [-22, -14]], '川底の杭', 1.2);
    wall([[-22, -22], [-23, -60]], '川底の杭', 1.2);
    // 高い西岸は柵で連続して塞ぐ。口を抜いて城攻めへ転じる戦にはしない。
    wall([[BANK, -110], [BANK, 110]], '西岸の柵');
    if (true) {
      // 高岸の色は地面の tint で付ける。別の刻みの薄い土面を重ねると、
      // 地面の三角形と交差し、法肩が裂けたり茶色の板が突き出したりする。
      // 歩く高さ・柵・射手の持ち場は変えず、下の小石で凹凸を残す。
      // 小石と土塊は斜面へ埋め、土の一枚面を崩す。全て同じ形・材質、一回の描画。
      const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshLambertMaterial({ color: SETTINGS.quality === 'high' ? 0x79634a : 0x746f59 }), 88);
      for (let i = 0; i < 88; i++) {
        const z = -106 + i * 2.43 + Math.sin(i * 7) * .65;
        // 高では三つに一つを法尻の土塊へ回す。小石が急斜面に均等に貼り付く列を避ける。
        // 中央の待つ足場は空け、既存の八十八個の枠と当たりなしの作りを保つ。
        const toe = SETTINGS.quality === 'high' && i % 3 === 0 && Math.abs(z) > 9;
        const x = toe ? BANK + 12 + Math.sin(i * 2.4) * .9 : BANK + 7 + Math.sin(i * 2.4) * 3.8;
        const s = .14 + (i % 5) * .045;
        reedPose.position.set(x, W.heightAt(x, z) - s * .3, z);
        reedPose.rotation.set(i * .7, i * 2.3, i * .4);
        reedPose.scale.set(s * 1.6, s * .65, s); reedPose.updateMatrix(); stones.setMatrixAt(i, reedPose.matrix);
      }
      stones.instanceMatrix.needsUpdate = true; stones.receiveShadow = true; rt.scene.add(stones);
      // 裾の乱杭は一つの形・一回の描画。高岸の登れなさと兵の密度はそのまま。
      const posts = new THREE.InstancedMesh(bambooPost, bambooMat, 276);
      for (let i = 0; i < 276; i++) {
        const z = -109 + i * .79, x = BANK + 1.2 + Math.sin(i * 2.3) * .3;
        const h = .75 + (i % 4) * .09;
        reedPose.position.set(x, W.heightAt(x, z) + h * .42, z);
        reedPose.rotation.set(Math.sin(i * 3) * .14, 0, -.28 - (i % 3) * .08);
        reedPose.scale.set(1.3, h, 1.3); reedPose.updateMatrix(); posts.setMatrixAt(i, reedPose.matrix);
      }
      posts.instanceMatrix.needsUpdate = true; posts.castShadow = posts.receiveShadow = true; rt.scene.add(posts);
    }
    installSaikaCamera(rt, cameraFences);
    installSaikaRear(rt);
    installSaikaWork(rt);
    // 口を開けた桶と二本の箍。同じ形を三か所で共用する。
    const bucketBody = new THREE.LatheGeometry([
      [0, -0.4], [0.48, -0.4], [0.56, 0.4], [0.515, 0.4], [0.435, -0.35], [0, -0.35],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    // 側板ごとに色を変え、黒い金属の容器に見える単色を避ける。
    const bucketPos = bucketBody.attributes.position, bucketColors = [], bucketColor = new THREE.Color();
    for (let i = 0; i < bucketPos.count; i++) {
      const angle = Math.atan2(bucketPos.getX(i), bucketPos.getZ(i));
      const board = Math.round(angle / (Math.PI * 2) * 20);
      bucketColor.setHex(board % 3 === 0 ? 0x786247 : board % 3 === 1 ? 0x8b7251 : 0x69543d);
      bucketColors.push(bucketColor.r, bucketColor.g, bucketColor.b);
    }
    bucketBody.setAttribute('color', new THREE.Float32BufferAttribute(bucketColors, 3));
    const bucketParts = [bucketBody];
    for (const y of [-0.26, 0.26]) {
      const hoop = new THREE.TorusGeometry(0.52 + y * 0.1, 0.018, 4, 20);
      hoop.rotateX(Math.PI / 2); hoop.translate(0, y, 0);
      const colors = [];
      bucketColor.setHex(0xaca079);
      for (let i = 0; i < hoop.attributes.position.count; i++) colors.push(bucketColor.r, bucketColor.g, bucketColor.b);
      hoop.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); bucketParts.push(hoop);
    }
    const geo = mergeGeometries(bucketParts);
    for (const part of bucketParts) part.dispose();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // 川底の壺と槍先は伝承に沿う見た目の補完。形と材質を三つの持ち場で使い回す。
    const jarGeo = new THREE.LatheGeometry([
      [0, 0], [0.22, 0], [0.38, 0.12], [0.44, 0.3], [0.34, 0.46],
      [0.18, 0.52], [0.18, 0.62], [0.13, 0.62], [0.13, 0.5],
      [0.28, 0.42], [0.34, 0.3], [0.28, 0.15], [0, 0.08],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 8);
    const jarMat = new THREE.MeshLambertMaterial({ color: 0x574235 });
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 5);
    const tipGeo = new THREE.OctahedronGeometry(1);
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x53514b });
    for (const a of F.stakes) {
      const ropeGeo = new THREE.BufferGeometry();
      ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      a.rope = new THREE.Line(ropeGeo, ropeMat); a.rope.visible = false; a.rope.frustumCulled = false;
      rt.scene.add(a.rope);
      // 小旗の根元へ着けば長押しが届く。元の位置は作業半径の外にあった。
      // 竿だけを低くすると共通の二・八歩の布が川底へ埋まる。
      // 五歩の幟を丸ごと縮め、小旗の布・横竿・乳を水面より上へ収める。
      a.workFlag = nobori(W, a.x + 2.2, a.z + 0.9, 'oda', 5);
      a.workFlag.scale.multiplyScalar(2.4 / 5);
      a.workFlag.visible = a.i === 0; rt.scene.add(a.workFlag);
      // 行き先は実物の小旗と既存の案内印で示し、宙に浮く光の棒を重ねない。
      const bucketMat = mat.clone(); bucketMat.transparent = true;
      a.bucket = new THREE.Mesh(geo, bucketMat);
      a.bucket.position.set(a.x + 0.8, W.heightAt(a.x, a.z) - 0.15, a.z + 1);
      a.bucket.rotation.z = 0.5; rt.scene.add(a.bucket);
      a.bucket.castShadow = a.bucket.receiveShadow = true;
      a.riverTraps = new THREE.Group();
      const jar = new THREE.Mesh(jarGeo, jarMat);
      jar.position.set(a.x - 0.8, W.heightAt(a.x - 0.8, a.z - 1) - 0.04, a.z - 1);
      a.riverTraps.add(jar);
      for (const dz of [-2.5, 2.5]) {
        const x = a.x - 0.3, z = a.z + dz, y = W.heightAt(x, z);
        const shaft = new THREE.Mesh(shaftGeo, jarMat), tip = new THREE.Mesh(tipGeo, ironMat);
        shaft.position.set(x, y + 0.12, z);
        tip.scale.set(0.08, 0.22, 0.035); tip.position.set(x, y + 0.35, z);
        a.riverTraps.add(shaft, tip);
      }
      rt.scene.add(a.riverTraps);
    }
    if (true) {
      saikaSettlement(rt);
      // 本の野戦井楼に合わせ、足元まで横木の井桁を見せ、板囲いは上の射撃床に限る。
      for (const z of [-30, 30]) {
        const tower = yagura(W, -50, z,
          { rot: EAST, height: 8.8, boarded: false, logFrame: true, mon: 'yatagarasu' });
        // 二基の外観は元の描き方を保つ。静物の束は描画より先に表示を写すため、
        // 描画時に遠近の形が替わる井楼は束から外し、守兵と外観の表示をそろえる。
        // 形・材質・床・守兵は既存のまま。ほかの戦の束ね方は変えない。
        tower.traverse((obj) => { if (obj.isMesh) obj.userData.noBatch = true; });
        rt.scene.add(tower);
      }
    } else {
      rt.scene.add(hut(W, -60, 20, 7, 5, WEST), hut(W, -64, -14, 7, 5, WEST));
      // 携帯でも本にある横木組みと板囲いを残す。既存の軽い形を二基で使う。
      for (const z of [-30, 30]) rt.scene.add(yagura(W, -48, z,
        { rot: EAST, height: 8.8, boarded: false, logFrame: true, mon: 'yatagarasu' }));
      rt.scene.add(village(W, -56, 150, { n: 6, r: 18, rot: WEST, seed: 15741, smoke: 0 }));
      rt.scene.add(village(W, -70, -150, { n: 5, r: 16, rot: WEST, seed: 15742, smoke: 0 }));
    }
    for (const z of [-44, -26, 2, 40]) rt.scene.add(nobori(W, -47, z, 'yatagarasu', 6));
    // 公記巻十の山手勢が周辺を焼いた記述に沿う。焼かれた家の場所・形は復元。
    // https://ja.wikisource.org/wiki/信長公記
    // 渡河の前に起きた焼き払いの跡だけを置き、戦列や帰路に火・壁を増やさない。
    const ruinTimbers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 8),
      new THREE.MeshLambertMaterial({ color: 0x302820 }), 24);
    const ruinPose = new THREE.Object3D();
    let ruinN = 0;
    // 北への陸道（x=96）と根来方面の枝道（z=-126）から外す。
    // 焼失家屋の位置は復元。焼け跡の幅と倒れた材まで含め、道の口を塞がない。
    // 準備前の植生判定と同じ敷地を使い、焼けた柱の中へ木や竹を生やさない。
    for (const [x, z] of RUINS) {
      W.addScorch(x, z, 9, 7);
      for (let i = 0; i < 8; i++) {
        const standing = i < 4;
        const px = x + (standing ? (i & 1 ? 3 : -3) : Math.sin(i * 7) * 3);
        const pz = z + (standing ? (i & 2 ? 2 : -2) : Math.cos(i * 5) * 2);
        const h = standing ? 1.1 + i * 0.3 : 3 + (i & 1);
        ruinPose.position.set(px, W.heightAt(px, pz) + (standing ? h / 2 : 0.16), pz);
        ruinPose.rotation.set(standing ? 0 : Math.PI / 2, i * 0.7, standing ? 0.06 : 0);
        ruinPose.scale.set(1, h, 1); ruinPose.updateMatrix();
        ruinTimbers.setMatrixAt(ruinN++, ruinPose.matrix);
      }
    }
    ruinTimbers.instanceMatrix.needsUpdate = true;
    ruinTimbers.castShadow = true; ruinTimbers.receiveShadow = true; rt.scene.add(ruinTimbers);
    F.hori = allyGroup(rt, { name: '堀秀政の先手', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 20, guardLeash: 6, anchor: { x: 26, z: 0 }, facing: WEST, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_m', haori: 0 } }], ODA));
    F.workers = allyGroup(rt, { noAI: true, noGuard: true, noFrontline: true, name: '杭を外す先手の組', fixed: true, fullStrength: true, anchor: { x: 20, z: 0 }, facing: WEST, width: 4, formation: 'column', colW: 2, aggro: 2, fleeDir: { x: 1, z: 0 } }, dress([{ type: 'ashigaru', n: 6 }], ODA));
    F.workParties = [F.workers];
    for (const a of F.stakes) {
      a.workAt = { x: a.x + 2.2, z: a.z };
      a.guardAt = { x: a.x + 7, z: a.z };
    }
    F.teppo = allyGroup(rt, { name: '東岸の織田鉄砲衆', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 65, guardLeash: 3, anchor: { x: 10, z: 0 }, facing: WEST, width: 6, ranks: 1, aggro: 65 }, dress([{ type: 'gun', n: 12 }], ODA));
    // 五つの小組が各々撃って込める。六人以上の共通一斉射と二段交代を使わない。
    F.gunPosts = [-24, -12, 0, 12, 24].map((z, i) => {
      const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '西岸の鉄砲の小組', anchor: { x: -47, z }, facing: EAST, width: 5, ranks: 1,
        order: 'hold', guard: true, guardSight: 68, guardLeash: 3, aggro: 68, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'gun', n: 4 }, { type: 'bow', n: 1 }], SAIKA));
      for (const u of g.units) u.cd = 2 + i * 4 + u.slot;
      return g;
    });
    F.reserve = enemyGroup(rt, { faction: 'saika', fixed: true, name: '柵を守る雑賀衆', anchor: { x: -57, z: 0 }, facing: EAST, formation: 'yari', width: 10,
      order: 'hold', guard: true, guardSight: 20, guardLeash: 5, aggro: 10, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 1, o: { name: '雑賀の組頭', flagScale: 2.2, haori: 0 } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 18 }], SAIKA));
    F.saikaBoss = F.reserve.units[0];
    // 地元の小組は、川上・川下を渡った東岸の道に初めからいる。開始後に兵を足さない。
    F.skirmish = enemyGroup(rt, { faction: 'saika', fixed: true, name: '川べりの雑賀衆', anchor: { x: -9, z: 32 }, facing: Math.PI,
      formation: 'yari', order: 'hold', aggro: 10, fleeDir: { x: 0, z: 1 } }, dress([{ type: 'ashigaru', n: 8 }], SAIKA));
    F.flanks = [48, -48, 64, -64].map((z) => enemyGroup(rt, { faction: 'saika', fixed: true, name: z > 0 ? '川下の雑賀衆' : '川上の雑賀衆',
      anchor: { x: -9, z }, facing: z > 0 ? Math.PI : 0, formation: 'yari', order: 'hold', aggro: 10,
      fleeDir: { x: 0, z: z > 0 ? 1 : -1 } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 1 }], SAIKA)));
    // かつて戦闘中に足していた二十人も準備時に置き、人数と道筋を保つ。
    F.bankRelief = [80, -80, 96, -96].map((z) => {
      const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: z > 0 ? '川下の寄せの控え' : '川上の寄せの控え',
        anchor: { x: -9, z }, facing: z > 0 ? Math.PI : 0, formation: 'yari', order: 'hold', aggro: 10,
        fleeDir: { x: 0, z: z > 0 ? 1 : -1 } }, dress([{ type: 'ashigaru', n: 5 }], SAIKA));
      g.bankRelief = true;
      return g;
    });
    F.raiders = [F.skirmish, ...F.flanks, ...F.bankRelief];
    for (const g of F.flanks.slice(2)) { g.bankReserve = true; g.bankReleaseAt = Infinity; }
    for (const g of F.flanks) g.bankSide = g.anchor.z > 0 ? '川下' : '川上';
    for (const g of F.raiders) {
      g.bankDest = { x: -11, z: 18 }; g.noGuard = true; g.noAI = true;
      g.bankArrive = (q) => { q.order = q.focus ? 'attack' : 'hold'; q.formation = 'yari'; q.aggro = 12; };
      const z = g.anchor.z > 0 ? 140 : -140;
      g.fleePath = [[4, z], [-20, z], [-64, z], [-120, z]];
    }
    F.defenders = [F.hori, F.workers, F.teppo];
    // 援護の鉄砲の前に用意済みの竹束。後で四束を無から作らない。
    // 鉄砲の列の幅に合わせ、四束とも射手の前へ据える。
    F.bankTabas = [-3, -1, 1, 3].map((z) => addTaba(rt, 7, z, 0, { rot: WEST, fixed: true, detailed: true }));
    const bankCoverGeo = bankTabaGeo();
    for (const tb of F.bankTabas) {
      tb.m.geometry = bankCoverGeo;
      tb.m.material = tb.m.material.clone(); tb.m.material.transparent = true;
      tb.saikaSolid = solidRect(tb.x, tb.z, 1.82, 0.6, tb.rot + Math.PI);
      // 縦に束ねた竹の上端は約1.47m。後ろの支え棒まで見えない壁にしない。
      tb.saikaSolid.missileH = 1.47; tb.saikaSolid.missileType = 'wood';
    }
    const disposeBank = rt.dispose;
    rt.dispose = function () {
      for (const tb of F.bankTabas) tb.m.material.dispose();
      bankCoverGeo.dispose(); this.dispose = disposeBank;
      return disposeBank.call(this);
    };
    syncTabaCover(rt);
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 24, z: -10 }, WEST, [{ kind: 'spear', n }]);
    // 佐久間勢の一部を表す後陣。公記に位置の記載がない本人や馬印は置かない。
    // 幕・幟と旗本の人数は保ち、名の分からない組頭が先手を援護する。
    F.honjin = camp(rt, { x: 72, z: 0, facing: WEST, team: 0, faction: 'oda', mon: 'sakuma', noUma: true, general: { name: '佐久間勢の組頭' }, guard: 15, reserve: 0, runTo: BACK });
    moveGroup(F.honjin.guard, { x: 58, z: 0 }, WEST);
    F.defenders.push(F.honjin.guard);
    F.escorts = [F.hori]; F.reinforceT = 0;
    F.honjin.guard.guard = true; F.honjin.guard.guardSight = 24; F.honjin.guard.guardLeash = 6;
    for (const z of [-30, 30]) rt.scene.add(nobori(W, 30, z, 'oda', 6));
    rosterBuild(rt, JIN);
    F.lightHosts = [];
    for (const plan of JIN) for (const s of plan.sonae) {
      const m = F.jinRoster[plan.team][s.id];
      if (!m) continue;
      m.army.noWake = false;
      F.lightHosts.push(m.army);
    }
    // 遠い四つの控えの後詰（当たりのない見せ兵）から各四十人分の描画枠を川沿いへ回す。
    // 本物の寄せ・攻撃・任務は従来のまま。中央の作業口と川底には列を置かない。
    F.shoreClashes = [-1, 1].map(side => W.addClash({
      x: 1, z: side * 38, facing: side > 0 ? 0 : Math.PI, w: 9, bw: 4.5,
      gap: 2.8, seed: 15790 + side, rt, noWake: true, noRout: true,
      host: false, corpses: 16, realNear: 12, nearHide: 14,
      groundedMelee: true, measuredMelee: true, calm: true, maxDrift: 1.2, killRate: .008,
      A: { flag: 'oda', armor: 0x2b3140, count: 40, flagRate: .3 },
      B: { flag: 'yatagarasu', armor: SAIKA.armor, count: 40, flagRate: .25 },
    }));
    installSaikaCloth(rt);
    // 中野城と紀ノ川はこの狭い川岸の外。陸上の舟や小屋を城と呼ぶ復元はしない。
    phase(rt, 0, 'brief', '川べりの小旗へ。杭抜き組を守れ', F.stakes[0].workAt, '杭抜きの小旗');
    rt.banner('川向こうの柵から鉄砲だ', '川べりの小旗へ。杭抜き組を守れ');
    rt.say('堀秀政', '向こう岸から撃ってくるぞ。杭を外す組を守れ！', 5);
    // 川岸の敵将の名は公記にない。孫一をここへ置かず、声も組頭とする。
    rt.after(18, () => {
      if (F.step === 1 && !F.ending && F.gunPosts.some((g) => g.units.some((u) => bankReady(u) && sightUnit(rt, u))))
        rt.say('雑賀の組頭', '川を渡らせるな！　柵から狙え！', 4);
    });
    rt.after(5, () => { if (F.step === 0 && !F.ending) this.stakes(rt); });
  },
  stakes(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 0) return;
    phase(rt, 1, 'stakes', '杭抜き組を守れ');
    F.workIndex = -1;
    rt.say('組頭', '杭抜きは縄を掛けよ。槍と鉄砲は敵を抑えよ', 4);
    rt.after(5, () => { if (F.step === 1 && !F.ending) rt.say('堀秀政', '敵を払えば、組が杭を抜く。手が空けば、おぬしも抜け', 5); });
    sendRaider(F.skirmish, F.stakes[0].z);
    // 十四歩先の作業場へ直ちに寄せ、最初の十四秒は後方の本人を追わせない。
    F.skirmish.bankStep = F.step;
    F.skirmish.bankWorkUntil = rt.t + 14;
  },
  pull(rt, a, byPlayer = false) {
    if (rt.flags.ending || rt.over || !rt.player.u.alive || rt.flags.step !== 1 || a.pulled) return;
    const helper = rt.flags.workParties.some((g) => g.units.some((u) =>
      (g === rt.flags.workers || u.type === 'ashigaru') && canWork(u, a)));
    // 長押しを終えた本人は、一人でも杭を抜ける。組だけの自動作業には手が要る。
    if (!helper && !byPlayer) return;
    a.pulled = true; rt.flags.pulled++;
    // 本数が増えた瞬間に前の作業の割合を消す。次の杭の案内は次の更新で出す。
    rt.flags.progressAt = 0; rt.objProgress('main', '');
    a.rope.visible = false; rt.scene.remove(a.workFlag);
    rt.uninteract('s' + a.i); rt.unmark('s' + a.i);
    // 外した桶は東岸の作業場の脇へ置く。槍を持つ兵に宙で追従させない。
    placeSaikaBucket(rt.world, a.bucket, -6, a.z + 1);
    rt.scene.remove(a.riverTraps); // 杭と一緒に取り除き、通した渡り口に障害の形を残さない。
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); }
    sfx('wood', 0.8);
    rt.award((t) => { if (!t.side.includes('川底の杭を外した')) t.side.push('川底の杭を外した'); }, `川底の杭を外した（${rt.flags.pulled}／3）`);
    if (rt.flags.pulled === 1) rt.say('組頭', byPlayer ? 'おぬしが口を開けたぞ！　次の杭へ縄を回せ' : '敵を抑えたおかげで杭が抜けた！　次へ移るぞ', 4);
  },
  cross(rt) {
    const F = rt.flags;
    phase(rt, 2, 'cross', '中央の渡り口から西岸へ進め', SHORE, '西岸の足場');
    bankSignal(rt, 'susume', '合図：法螺貝と進み太鼓＝渡河');
    rt.banner('小雑賀川を渡れ', '向こう岸は高い。銃声の切れ目に中央の口へ');
    rt.say('堀秀政', '法螺と進み太鼓じゃ！　渡れ！　敵が玉を込めるうちに取り付け', 5);
    rt.after(3, () => {
      if (F.step !== 2 || F.ending || rt.over || !rt.player.u.alive || !F.hori.units.some(bankReady)) return;
      rt.army.playFar('toki', F.hori.center(), 0.65);
    });
    rt.marker('riverTurn', EAST_MOUTH, '岸沿いに中央の口へ');
    moveGroup(F.hori, SHORE, WEST);
    for (const g of F.workParties) if (g !== F.hori) moveGroup(g, SHORE, WEST);
  },
  retreat(rt) {
    const F = rt.flags;
    phase(rt, 3, 'retreat', '中央の口を戻れ。東岸の旗へ', BACK, '東岸の旗');
    bankSignal(rt, 'nobiki', '合図：法螺貝と退き太鼓＝東岸へ引け');
    // 使番がすでに届いて字幕の順番を待っている場合も取り消す。
    for (let i = rt.hud.subQ.length - 1; i >= 0; i--) if (F.oldCrossWord(rt.hud.subQ[i].text)) rt.hud.subQ.splice(i, 1);
    if (rt.hud.shownLine && F.oldCrossWord(rt.hud.shownLine.text)) rt.hud.nextSub();
    rt.banner('先手退け', F.reached ? '高い岸と鉄砲に阻まれた。東岸へ引き返せ' : '西岸に届かなかった。東岸へ戻り、列を守れ');
    if (!F.reached) rt.say('伝令', '先手は渡り切れずにござる！　東岸へ引くとの下知！', 5);
    rt.say('堀秀政', '法螺と退き太鼓じゃ！　渡った口を戻れ。東岸の鉄砲衆、敵を抑えよ', 5);
    rt.unmark('riverTurn');
    if (rt.player.u.pos.x <= -8) rt.marker('riverTurn', () =>
      rt.player.u.pos.x < -22 && Math.abs(rt.player.u.pos.z) > 2 ? WEST_MOUTH : EAST_MOUTH,
    '中央の口を戻る');
    withdrawGroup(rt, F.hori, BACK);
    for (const g of F.workParties) if (g !== F.hori) withdrawGroup(rt, g, BACK);
    battleEvent(rt, EVENT_RETREAT, SHORE, F.hori, 0, true, '先手が引く。川の道を戻れ');
    F.teppo.holdFire = false;
    // 東岸の寄せは敵の切れ目に合わせて動く。遠い待機点へ戻す下知を重ねない。
  },
  regroup(rt) {
    const F = rt.flags;
    rt.unmark('riverTurn');
    F.coverWorkT = 0;
    phase(rt, 4, 'regroup', '竹束の陰へ。止まって列を整えよ', COVER, '竹束の陰で列を整える所');
    bankSignal(rt, 'tomare', '合図：間を空けた鉦二つ＝止まれ');
    rt.objProgress('main', '竹束の陰で止まり、出た札を六秒押し続けよ');
    const marker = rt.markers.find((m) => m.id === 'goal');
    if (marker) marker.guideAlways = true;
    moveGroup(F.teppo, { x: 10, z: 0 }, WEST);
    rt.say('堀秀政', '鉦が二つ、止まれの合図じゃ。竹束の陰で列を整え、鉄砲衆を守れ', 5);
    rt.after(5, () => { if (F.step === 4 && !F.ending) rt.say('組頭', '竹束の陰で止まれ。「列を整える」を長押しじゃ。敵が来たら先に払え', 5); });
    rt.addInteract('cover', COVER, '列を整える', () => {
      if (F.ending || rt.over || !rt.player.u.alive || F.step !== 4 || F.cover) return;
      // 据えた束は動かさない。見回る槍の組に追わせると、人の手なしに滑ってしまう。
      moveGroup(F.teppo, { x: 10, z: 0 }, WEST); F.teppo.holdFire = false; F.teppo.facing = WEST;
      F.cover = true; rt.uninteract('cover');
      rt.award((t) => t.side.push('東岸の守りを固めた'), '東岸の守りを固めた');
      // 守りを確かめた手柄で、既存の後陣の槍を鉄砲衆の後ろへ回す。
      if (!F.escorts.includes(F.honjin.guard)) {
        F.escorts.push(F.honjin.guard); patrolBank(F.honjin.guard, 20, 22);
      }
      rt.say('堀秀政', 'よし、守りが整った。後陣の槍も前へ！　鉄砲衆を支えよ', 5);
    }, { r: 3.2, hold: 6, prio: 20 });
  },
  hold(rt) {
    const F = rt.flags;
    rt.uninteract('cover');
    phase(rt, 5, 'hold', '東岸を守り、川上・川下の敵を払え', BACK, '東岸の守り');
    // 守りの判定と同じ広さを案内する。範囲内で「あと何歩」と進ませない。
    rt.marker('goal', BACK, '東岸の守り', {
      h: .3, guideArea: 'wait', guideRadius: 35,
      waitArrived: () => Math.hypot(rt.player.u.pos.x - BACK.x, rt.player.u.pos.z - BACK.z) < 35,
      waitGuide: () => this.waitOrderLabel(rt,
        Math.hypot(rt.player.u.pos.x - BACK.x, rt.player.u.pos.z - BACK.z) < 35),
    });
    rt.banner('川を限って対陣', '旗へ来る敵を払え。西岸へ追うな');
    for (let i = 0; i < F.escorts.length; i++) {
      const g = F.escorts[i];
      moveGroup(g, { x: BACK.x + 4, z: i % 2 ? -10 : 10 }, WEST);
    }
    F.flanks[2].bankReleaseAt = rt.t + 8;
    // 早く渡河を済ませても終わり際に山場が来る。待機兵を二手に分けて寄せる。
    F.flanks[3].bankReleaseAt = Math.max(rt.t + 38, 190);
    F.lastRaidAt = F.flanks[3].bankReleaseAt;
    rt.after(60, () => {
      if (F.step === 5 && !F.ending) rt.say('佐久間勢の組頭', '川の向こうは追うな。堀の先手を支え、東岸の列を保て', 5);
    });

    rt.after(76, () => {
      if (F.step !== 5) return;
      report(rt, '稲葉父子、氏家左京亮、飯沼勘平が紀の川の渡り口を守る由にござる');
    });
  },
  update(rt, dt) {
    const F = rt.flags;
    tickSaikaRear(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    tickRaiders(rt, dt);
    // 歩く兵の足踏みを既存の飛沫・波紋へ渡す。近くを順に拾い、配列を増やさない。
    F.waterStepT = (F.waterStepT || 0) - dt;
    if (F.waterStepT <= 0 && !SETTINGS.reduceMotion) {
      F.waterStepT = .16;
      const units = rt.army.units, p = rt.player.u.pos;
      let emitted = 0;
      for (let j = 0; j < units.length; j++) {
        const i = ((F.waterStepI || 0) + j) % units.length, u = units[i];
        if (!u.alive || u.gone || u.isStruct || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 38 || Math.hypot(u.vel.x, u.vel.z) < .3) continue;
        if (rt.world.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) <= .02) continue;
        rt.world.spray(u.pos.x, u.pos.z, 3);
        if (++emitted >= 3) { F.waterStepI = i + 1; break; }
      }
    }
    // 小組が順に撃つ。二分後に全組の銃声を重ね、近接の寄せを埋めない。
    const volley = Math.floor(rt.t / 12) % F.gunPosts.length;
    for (let i = 0; i < F.gunPosts.length; i++) F.gunPosts[i].fire = i === volley;
    // 替わった味方の控えは東岸を見回る。敵は西岸の持ち場を守る。
    for (const g of rt.army.groups) if (g.woke && g.woke.jinkeiGuard && !g.saikaGuard) {
      g.saikaGuard = true; g.noGuard = false; g.guard = true; g.guardLeash = 6;
      const guns = g.woke.kind === 'gun';
      g.guardSight = guns ? 68 : 14; g.aggro = guns ? 68 : 8; g.seekRange = g.guardSight;
      g.formation = guns ? 'line' : 'yari';
      // 川上・川下の控えも、近づいた途端に共通の二段交代へ変えない。
      // 公記に交代射撃の記述はない。一列の持ち場は復元で、兵数と射撃の時間帯は保つ。
      if (guns && SETTINGS.quality === 'high') {
        g.ranks = 1; g.width = Math.max(1, g.initial);
      }
      for (const u of g.units) if (u.mesh) u.mesh.scale.set(1, 1, 1);
      if (g.team === 0) {
        patrolBank(g, 12 + (g.id % 3) * 4, g.anchor.z < 0 ? -26 : 26);
        F.defenders.push(g);
      }
    }
    for (const g of rt.army.groups) if (g.team === 1 && g.saikaGuard && g.woke.kind === 'gun') g.fire = g.id % F.gunPosts.length === volley;
    reinforceBank(rt, dt);
    const el = rt.t - F.stepT, p = rt.player.u.pos;
    // 生きて任務を続けられる時間を確保する。七分以内に後陣へ引いて閉じる。
    if (rt.t >= 400) {
      F.holdFailure = F.step === 1 ? '杭を外しきれず、渡る道を通せなかった' : F.step === 2 ? '西岸の足場へ届かなかった' : F.step === 3 ? '東岸の旗へ戻れなかった' : F.step === 4 ? '東岸の竹束の陰で列を整えられなかった' : '東岸の敵を払い、旗のそばで守りを保てなかった';
      return this.win(rt, false);
    }
    // 守りは旗の周囲を保った時間で判定する。味方が敵を払っても達成できる。
    const notice = rt.t >= (F.progressAt || 0);
    if (notice) F.progressAt = rt.t + 0.5;
    if (F.step === 1) {
      const a = F.stakes.find((s) => !s.pulled);
      if (a && F.workIndex !== a.i) {
        F.workIndex = a.i; moveGroup(F.workers, a.workAt, WEST);
        for (const g of F.escorts) guardWork(g, a);
        // 作業する杭を一か所ずつ知らせる。作業兵が減っても本人が外せる。
        a.workFlag.visible = true;
        // 作業場の小旗そのものを案内し、護衛兵の隊旗や敵を示す剣と取り違えさせない。
        rt.marker('s' + a.i, a.workAt, `杭抜きの小旗 ${a.i + 1}か所目`, {
          h: 2.4, guideAlways: true, guideFlag: true, guideRadius: 2.6,
          guideFlagMesh: () => a.workFlag.userData.flag,
        });
        rt.addInteract('s' + a.i, a.workAt, '杭を外す', () => this.pull(rt, a, true), { r: 2.6, hold: 12, prio: 20 });
        // 作業兵は遠い敵を追わず、手元の敵だけに応戦する。
        F.workers.aggro = 2;
        // 六人を横へ広げると端の者が縄に届かない。到着後も二列で手元を囲む。
        F.workers.onArrive = (g) => { g.order = 'hold'; g.facing = WEST; g.formation = 'column'; g.colW = 2; g.aggro = 2; };
      }
      if (a) {
        // 初めて向かう旗と、護衛から離れた後に戻る旗を区別する。
        if (Math.hypot(p.x - a.workAt.x, p.z - a.workAt.z) < 8) a.playerVisited = true;
        const hands = workHands(rt, a);
        a.workHands = hands;
        if (hands > 0) a.workT = Math.min(12, (a.workT || 0) + dt * Math.min(1, hands / 2));
        // 味方が引いた分も、本人の長押し札と同じ割合にする。
        if (rt.holdId === 's' + a.i) {
          rt.holdT = a.workT || 0; rt.holdPct = rt.holdT / 12;
        }
        // 抜く杭と結び縄だけを持ち上げる。泡と波は水面に残す。
        for (const seg of a.segs) if (seg.mesh) {
          const lift = (a.workT || 0) / 12 * 0.35;
          seg.mesh.children[0].position.y = lift;
          seg.mesh.children[3].position.y = lift;
        }
        if (a.workT >= 12) {
          this.pull(rt, a);
          // 抜いた杭の割合を、増えた本数や次の行き先と一緒に表示しない。
          if (a.pulled) return;
        }
      } else if (F.workIndex !== 3) { F.workIndex = 3; moveGroup(F.workers, { x: 20, z: 0 }, WEST); }
      const percent = Math.round((a?.workT || 0) / 12 * 100);
      // 半秒前の割合を残さず、札と同じ一％刻みで更新する。
      if (notice || F.workPercent !== percent || F.workNoticeIndex !== F.workIndex) {
        F.workPercent = percent; F.workNoticeIndex = F.workIndex;
        const distance = a ? Math.hypot(p.x - a.workAt.x, p.z - a.workAt.z) : Infinity;
        const working = a && a.workHands > 0;
        // 作業の割合だけでは、護衛を続けるか自分で引くか分からない。
        // 作業できる組の残りと、応戦で手が止まった状態を区別する。
        let workersLeft = 0, workersMoving = false;
        for (const g of F.workParties) for (const u of g.units)
          if (bankReady(u) && u.type === 'ashigaru') {
            workersLeft++;
            if (a && g.order === 'move' && Math.hypot(u.pos.x - a.workAt.x, u.pos.z - a.workAt.z) >= 3)
              workersMoving = true;
          }
        // 今することは見出し一つにまとめ、補足には進み具合だけを残す。
        // 手元で応戦中に長押しを勧めず、組が引ける間は護衛を案内する。
        const fighting = rt.army.nearestEnemy(rt.player.u, 4.5, (u) =>
          bankReady(u) && !u.noTarget && !u.isStruct && u.type !== 'gun' && u.type !== 'bow' &&
          Math.abs(u.pos.y - p.y) < 3 && !rt.army.wallBetween(p, -1, u.pos));
        const action = !a ? '中央の道を渡れ' : distance >= 8 ?
          (a.playerVisited ? `${a.i + 1}つ目の小旗へ戻れ` : `${a.i + 1}つ目の小旗へ`) :
          fighting ? '杭のそばで敵を払え' : working ? '杭抜き組を守れ' :
          workersMoving ? '小旗で杭抜き組を迎え、守れ' :
          distance < 2.6 ? '「杭を外す」を長押し' : '小旗の根元へ。着いたら長押し';
        if (F.workTask !== action) { F.workTask = action; rt.obj('main', action, 'main', true); }
        // 離れた本人の応戦と、作業場の護衛を同じ指図にしない。
        // 組が引いている間は、遠くの本人へ長押しを勧めない。
        const workState = distance >= 8 ?
          (fighting ? 'そばの敵を払い、小旗へ' : working ? '味方が作業中。小旗のそばへ' :
            workersMoving ? '小旗へ寄り、味方の作業を守れ' : '小旗へ寄り、「杭を外す」を長押し') :
          fighting ? '敵を払い、杭抜き組を守れ' : working ? '味方が作業中。そばで守れ' :
          workersMoving ? '味方が来る。小旗のそばで守れ' :
          distance >= 2.6 ? '小旗の根元へ近づこう' : '「杭を外す」を長押し';
        const handsState = !a ? '' : working ? a.workHands === 1 ? '味方一人で作業中。ゆっくり進む' : '味方が縄を引いている' :
          fighting ? '敵が近い。まず構えて身を守れ' :
          workersLeft === 0 ? '縄を引く味方がいない' : workersMoving ? '味方が小旗へ移動中' : '味方は縄を引けない。自分でも杭を外せる';
        rt.objProgress('main', `杭抜き ${F.pulled}／3か所・この杭 ${percent}％\n${handsState}\n${workState}`);
        const marker = a && rt.markers.find((m) => m.id === 's' + a.i);
        if (marker) marker.label = `杭抜きの小旗 ${a.i + 1}か所目`;
      }
      if (el > 55 && !F.help && F.pulled !== 3) { F.help = true; rt.say('堀秀政', '杭のそばで長押しじゃ。組が減っても、おぬしの手で道を通せ', 5); }
      if (el >= 180 && F.pulled < 3) warnBank(rt, 'stakesWarn', '川の杭抜きを急げ', '杭の印へ寄れ。「杭を外す」を長押しじゃ', a?.workAt);
      if (F.pulled === 3) this.cross(rt);
      else if (el >= 240) return this.win(rt, false);
    } else if (F.step === 2) {
      // 中央の口へ揃ったら西岸を案内する。渡り始めても東岸へ引き戻す札を残さない。
      if (p.x <= EAST_MOUTH.x + 2 && Math.abs(p.z) < 2) rt.unmark('riverTurn');
      if (p.x < -28 && p.x > BANK && Math.hypot(p.x - SHORE.x, p.z - SHORE.z) < 7) F.reached = true;
      // 時間だけで「上がれぬ」と言わせず、本人が対岸へ届いた時に伝える。
      if (F.reached && !F.bankWarned) {
        F.bankWarned = true;
        rt.unmark('riverTurn');
        const objective = rt.obj('main', '坂を登らず、退く合図を待て', 'main', true);
        // 渡り終えた後に「進め」の合図を残し、坂へ誘わない。
        objective.cue = ''; objective.cueT = 0;
        // 到着後は進む印を待つ印へ替える。高岸を登る任務と取り違えさせない。
        // 待つ輪は到着判定と同じ範囲。引く下知で通常の行き先へ戻る。
        rt.marker('goal', SHORE, '西岸の坂の下で待つ所', {
          h: .3, guideArea: 'wait', guideRadius: 7,
          waitArrived: () => Math.hypot(rt.player.u.pos.x - SHORE.x, rt.player.u.pos.z - SHORE.z) < 7,
          waitGuide: () => '坂を登らず、退く合図を待て',
        });
        // 公記の「岸高く候て馬もあからす」。騎馬の突入は追加せず、退く理由を伝える。
        rt.say('堀秀政', '馬も上がれぬ高岸じゃ！　登るな。川へ向き直り、退く合図を待て', 4);
      }
      if (notice) rt.objProgress('main', F.reached ?
        Math.hypot(p.x - SHORE.x, p.z - SHORE.z) < 7 ?
          '川へ向き直って構えよ。退き太鼓で元の岸へ戻れ' : '坂の下の印へ戻り、退く合図を待て' :
        '中央の渡り口を通り、西岸の印へ');
      if (F.reached && el >= 16 || el >= 60) this.retreat(rt);
    } else if (F.step === 3) {
      // 川筋から横へ外れても、東岸へ着けば旗を案内する。
      if (p.x > -8) rt.unmark('riverTurn');
      if (Math.hypot(p.x - BACK.x, p.z - BACK.z) < 16) F.inT += dt;
      else F.inT = 0;
      const distance = Math.hypot(p.x - BACK.x, p.z - BACK.z);
      if (notice) {
        const action = distance >= 16 ? '中央の口を戻れ。東岸の旗へ' : '東岸の旗で列を整えよ';
        if (F.returnTask !== action) { F.returnTask = action; rt.obj('main', action, 'main', true); }
        rt.objProgress('main', distance >= 16 ? '中央の口から東岸へ' : `旗のそばで あと${Math.max(0, Math.ceil(5 - F.inT))}秒`);
      }
      if (F.inT >= 5) this.regroup(rt);
      else {
        if (el >= 50) warnBank(rt, 'returnWarn', '東岸の旗へ戻れ', '中央の口を戻り、東岸の旗へ集まれ');
        if (el >= 90 && rt.t >= 240) this.win(rt, false);
      }
    } else if (F.step === 4) {
      if (notice) {
        const close = Math.hypot(p.x - COVER.x, p.z - COVER.z) < 3.2;
        const fighting = rt.army.nearestEnemy(rt.player.u, 4.5, (u) =>
          bankReady(u) && !u.noTarget && !u.isStruct && u.type !== 'gun' && u.type !== 'bow' &&
          Math.abs(u.pos.y - p.y) < 3 && !rt.army.wallBetween(p, -1, u.pos));
        const action = fighting ? 'そばの敵を払え。竹束を守れ' :
          close ? '「列を整える」を長押し' : '竹束の陰へ。止まって列を整えよ';
        if (F.coverTask !== action) { F.coverTask = action; rt.obj('main', action, 'main', true); }
        rt.objProgress('main', fighting ? '整えた分は残る。敵を払って続けよ' :
          close ? `列を整える ${Math.min(6, Math.floor(F.coverWorkT || 0))}／6秒\n止まって、作業の札を押し続けよう。敵が来たら先に払え` : '竹束の陰へ。出た「列を整える」の札を六秒長押し');
      }
      if (F.cover) this.hold(rt);
      else {
        if (el >= 70) warnBank(rt, 'coverWarn', '東岸の守りを固めよ', '竹束の陰で止まれ。「列を整える」を長押しじゃ', COVER);
        if (el >= 90 && rt.t >= 240) this.win(rt, false);
      }
    } else if (F.step === 5) {
      let threat = 0, deep = 0;
      for (const g of F.raiders) for (const u of g.units) {
        if (bankReady(u) && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24) { threat++; if (u.pos.x > BACK.x + 6 && Math.abs(u.pos.z) < 10) deep++; }
      }
      F.pressure = deep > 0 ? F.pressure + dt : 0;
      const holding = Math.hypot(p.x - BACK.x, p.z - BACK.z) < 35;
      if (F.inT > 0 && threat > 0 && rt.t >= (F.resetNoticeAt || 0) && F.raiders.some((g) => g.units.some((u) => bankReady(u) && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24 && sightUnit(rt, u)))) {
        F.resetNoticeAt = rt.t + 30; rt.bark('敵が東岸へ入った。払って旗のそばで二十秒守れ');
      }
      for (const g of F.flanks) if (g.bankCommitted && !g.bankSeen && g.units.some((u) => u.alive && !u.fleeing && sightUnit(rt, u)) && rt.t >= (F.watchAt || 0)) {
        g.bankSeen = true; F.watchAt = rt.t + 8; rt.say('見張り', `${g.bankSide}から敵だがね！　槍を向けろ`, 4);
      }
      // 守る任務を遠い敵の全滅待ちにしない。最後の寄せを迎え、旗の周囲を保つ。
      // 最後の組には川上から歩く時間を与える。射手を西岸まで追う必要はない。
      const raidsDone = rt.t >= F.lastRaidAt + 17;
      F.inT = raidsDone && holding && threat === 0 ? F.inT + dt : 0;
      if (F.inT >= 10 && !F.bankPraise) {
        F.bankPraise = true; rt.say('堀秀政', F.reached ?
          '寄せを押し返したぞ。おぬしの働きで東岸の列が戻った！' :
          '先手は渡れなかったが、東岸の列は戻った。この岸は守れ！', 5);
      }
      if (notice) {
        const secured = F.inT >= 20;
        const action = F.pressure > 0 ? '旗の後ろの敵を払え' : !holding ? '東岸の旗へ戻れ' :
          threat > 0 ? '旗の近くの敵を払え' : !raidsDone ? '旗のそばで川沿いを見張れ' :
          secured ? '旗のそばで下知を待て' : '旗のそばで二十秒守れ';
        if (F.holdTask !== action) { F.holdTask = action; rt.obj('main', action, 'main', true); }
        const left = Math.max(0, Math.ceil(Math.max(20 - F.inT, 240 - rt.t, 90 - el)));
        const crossing = F.reached ? '' : '西岸へ届かず。';
        rt.objProgress('main', F.pressure > 0 ? '旗の後ろへ通すな' : !holding ? '西岸へ追わず、味方の列へ' :
          threat > 0 ? `${crossing}敵を払い、旗で二十秒守れ\n川向こうへ追うな` : !raidsDone ? `${crossing}川上・川下から敵が来る\n旗のそばで待て` :
          secured ? `${crossing}東岸の列を保った。下知まであと${left}秒` :
          `${crossing}旗で守る ${Math.min(20, Math.floor(F.inT))}／20秒`);
      }
      if (el >= 110 && F.inT < 20 && !F.holdWarn) { F.holdWarn = true; rt.say('堀秀政', '敵を押し返せ！　支え切れねば後陣へ引くぞ', 5); }
      if (F.pressure >= 15) warnBank(rt, 'bankWarn', '旗の後ろに敵がいる', '東岸の旗へ戻れ。旗の後ろの敵を払え');
      else rt.unmark('bankDanger');
      if (F.pressure >= 45 && rt.t >= 240) {
        F.holdFailure = '旗の後ろへ入った敵を払いきれず、東岸の陣を押された';
        this.win(rt, false);
      }
      else if (F.inT >= 20 && el >= 90 && rt.t >= 240) this.win(rt, true);
    }
  },
  win(rt, held) {
    const F = rt.flags;
    if (F.ending) return;
    const bankHeld = held && !!F.cover && rt.player.u.alive;
    held = held && !!F.reached && !!F.cover && rt.player.u.alive;
    rt.tracker.main = !!held;
    F.ending = true; rt.setPhase('end'); rt.objProgress('main', ''); rt.unmark('goal'); rt.uninteract('cover');
    for (const a of F.stakes) {
      rt.uninteract('s' + a.i); rt.unmark('s' + a.i);
      a.rope.visible = false; rt.scene.remove(a.workFlag);
    }
    rt.unmark('riverTurn'); rt.unmark('bankDanger');
    if (!held) {
      for (const g of F.defenders) withdrawGroup(rt, g, REAR);
      // 結果を待つ間も本人が引けるよう、帰路の印を残す。
      rt.marker('goal', () => {
        const p = rt.player.u.pos;
        return p.x < -22 && Math.abs(p.z) > 2 ? WEST_MOUTH : p.x <= -8 ? EAST_MOUTH : REAR;
      }, '川の口を戻り、後ろの陣へ');
    }
    // 寄せた小組だけ西岸へ戻す。川岸の鉄砲衆が総崩れになったり、味方が柵へ追撃したりしない。
    for (const g of F.raiders) if (!g.routed && g.count) {
      const c = g.center();
      g.fixed = false; g.retreatOnly = true; g.anchor.x = c.x; g.anchor.z = c.z;
      g.order = 'path'; g.path = g.fleePath; g.pathIdx = 0; g.formation = 'column'; g.colW = 2;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = EAST; };
    }
    // 引き上げ中も両岸の射手は持ち場を守る。射撃の可否は射線と弾込めで決める。
    // 西岸の鉄砲衆は崩さない。局地の守りの成否と、後日の和議を分ける。
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '小雑賀川の東岸を保った', pts: 20 }; }, '任務達成・東岸を保った');
    } else rt.objFail('main');
    const reason = F.holdFailure || (F.step === 1 ? '川底の杭を外しきれず、渡る道を通せなかった' : !F.reached ?
      bankHeld ? '東岸は守ったが、西岸の足場へ届かなかった' : '西岸の足場へ届かなかった' :
      F.step === 3 ? '東岸の旗へ戻れなかった' : !F.cover ? '東岸の竹束の陰で列を整えられなかった' : '東岸の敵を払い、旗のそばで守りを保てなかった');
    rt.banner(held ? '東岸の列を保った' : '先手は後ろの陣へ引く', held ? '西岸の柵は落ちず、川を挟む対陣が続く' : reason);
    rt.say('堀秀政', held ? '岸は越えられぬ。川を限って押さえよ。追うでないぞ' : 'これまでじゃ。後陣へ引け！　散らずに退け', 5);
    // 任務の成否で雑賀全軍を敗走させない。対陣のまま閉じ、飛んでいる矢玉と傷は残す。
    rt.after(5, () => rt.say('語り', F.reached ?
      '高い岸と鉄砲に阻まれ、堀秀政は引いた。川を挟む対陣は続く' :
      F.pulled < 3 ? '渡る道を通せず、先手は引いた。川を挟む対陣は続く' :
      '西岸へ届かず、先手は引いた。川を挟む対陣は続く', 4));
    rt.after(10, () => rt.say('語り', 'やがて雑賀とは和議を結ぶ。次は北国、手取川の戦へ', 4));
    rt.finish({ scriptedEnd: true, failureReason: held ? '' : reason }, 16);
  },
  onKill(rt, v) { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; },
};
// 局地の描く人数に合わせた目安。一人の討死を架空の六人の損害へ増やさない。
saika.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  g.fixed = false; g.retreatOnly = true;
  // 動いていた要ではなく、実際の列から退く。先頭だけ遠くへ進めて後列を待たせない。
  g.anchor.x = c.x; g.anchor.z = c.z;
  return withdrawRoad(rt, c);
};
saika.botWithdraw = (b, inp, { goTo }) => {
  const F = b.flags, p = b.player;
  if (!F.botWithdrawPath) { F.botWithdrawPath = withdrawRoad(b, p.u.pos); F.botWithdrawIdx = 0; }
  const road = F.botWithdrawPath;
  while (F.botWithdrawIdx < road.length - 1 && Math.hypot(p.u.pos.x - road[F.botWithdrawIdx][0], p.u.pos.z - road[F.botWithdrawIdx][1]) < 2) F.botWithdrawIdx++;
  const at = road[F.botWithdrawIdx];
  goTo(p, inp, at[0], at[1], 2);
};
saika.force = (rt) => {
  const F = rt.flags;
  let a = 0, b = 0;
  for (const A of F.lightHosts || NO_HOSTS) {
    const n = Math.max(0, A.n - (A.took || 0));
    if (A.team === 0) a += n; else if (A.team === 1) b += n;
  }
  // 川岸の乱戦も局地の兵に含める。控えの後詰から描画枠を移した兵は、
  // 控え本隊の人数とは別。設定上の四十人でなく、生きている人数を拾う。
  // 史料にない全軍の兵力比で開戦の見せ場を決めない。
  for (const C of F.shoreClashes || NO_HOSTS) {
    a += Math.max(0, C.A.alive);
    b += Math.max(0, C.B.alive);
  }
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) {
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  F.a0 ??= a; F.b0 ??= b;
  return { a, a0: F.a0, b, b0: F.b0 };
};
// 兵の気配は紀州の全軍でなく、目の前の持ち場を表す。史料の総兵数としない。
saika.sides = { a: { name: '織田の川岸勢', mon: 'oda' }, b: { name: '雑賀の川岸勢', mon: 'yatagarasu' } };
// 公記は二十二日の分進後、二十八日の中野城開城前に渡河を記す。日付の断定は避ける。
saika.date = () => '天正五年二月下旬　春';
saika.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
saika.skip = (rt) => { if (rt.flags.step === 0 && !rt.flags.ending) saika.stakes(rt); };
saika.history = '信長公記巻十「雑賀御陣之事」では、山手の堀秀政の勢が小雑賀川を渡り、対岸は馬も上がれない高岸で、そこを鉄砲で防がれ、武者数人を失って引いた。その後は川を境に対陣し、稲葉父子・氏家左京亮・飯沼勘平が紀の川の渡り口を守った。浜手の中野城は二月二十八日に開城し、信忠が入った。孫一の居城へ竹束で攻め寄せたのは浜手の別の場面である。長い在陣の末、鈴木孫一・土橋平次ら七人が誓紙を出して赦され、三月二十一日に信長は帰途についた。川底の桶・壺・逆茂木は伝承を手掛かりにした補完で、公記のこの渡河記事には記されない。損害も公記の武者数人という記述にとどめ、高岸・鉄砲・引き退きを芯にした。東西の向きは地理からの復元。川の全幅約二十四歩、渡り場の水深約六十五百分の一歩、岸の高さ約三歩は遊びのための寸法で、史料の実測値ではない。人数、杭抜き、東岸の竹束、川上と川下の小隊は局地戦の補完である。公記のこの渡河記事には両軍の総兵数は記されない。画面上部は目の前の兵の気配を示し、備え表の人数は描く局地の兵の目安で、紀州へ出た全軍の総勢や史料の兵数ではない。開戦も川岸の通常の視点から見せ、仮の大軍へ寄る共通の演出は使わない。紀の川の守将と両軍の総大将は画面外。山手勢が周辺を焼き払ったことは公記にある。東岸の外れの焼けた家の位置と形、佐久間の陣所、小組が東岸を回る道は復元。道は水際で途切れ、川床は陸道や橋として扱わない。この渡河記事には天候と時刻の記載がなく、南中前後を想定した南からの日差し・雲・湿った岸は見た目の復元で、当日の時刻や天気を断定するものではない。集落の囲い・水路・櫓門・井楼と烏の旗も復元で、この渡河地点にあったと史料で確認できるものではない。後日の中野城の開城や和議を、この川岸の数分の中で起きた出来事にしない。';
saika.history += '遠景は和歌浦へ開ける南を低くし、南西の秋葉山方面には低い稜線を残した。高画質では雑賀荘の砂州から海側へ向く西の遠景も低く開き、北・東の山並みと描き分けた。国土交通省の河道変遷資料と和歌山市公開の雑賀衆案内を手掛かりにした方角の復元で、当時の海岸線や峰の高さを測って再現したものではない。秋葉山の城や孫一の本陣を、この渡河地点に置いたものではない。';
saika.history += '山手勢には佐久間信盛・羽柴秀吉・荒木村重・別所長治・別所重棟・堀秀政が記される。川岸の控えは羽柴・荒木・別所の各勢の一部として表したが、川上・川下・後方への割り当ては復元である。各大将本人がその持ち場にいたとは断定せず、名の分からない組頭の備えとした。高画質では東岸の川上・川下の控えも後方の陸道へ結び、田と焼け跡を横切らず後陣と行き来できる陣内の景観とした。道の位置・幅は補完で、公記に記された街道ではない。';
saika.history += '川岸の後陣も佐久間勢の一部として組頭を置き、佐久間本人の所在や馬印は断定しない。信長は和泉の志立で山手と浜手に軍を分け、後に両陣の間の鳥取郷若宮八幡へ陣を移した。川岸の後陣は信長の本陣ではない。';
saika.history += '和歌山市公開の雑賀衆案内にある東岸の農耕地を手掛かりに、後方へ春の休閑田と低い土の畦を描いた。田の区画・畦の幅と高さ、北の紀の川方面へ続く陸道の道筋は復元である。紀の川の渡り口をこの川岸へ移したものではない。';
saika.history += '東岸の後方道には根来方面への枝道をつなぎ、田と畦にも道幅の切れ目を設けた。田を抜けた先では北東へ折れ、小雑賀の北東にある根来寺の方角へ向かう。市公開の地理図を手掛かりにした景観の補完で、杉之坊や三緘衆が当日この道を通ったと史料で確認したものではない。道筋と幅も復元である。';
saika.history += '東岸の農耕地の周囲も疎らな木立とし、田の外側を密林で囲まない。木立の位置と密度は低地の景観を表す復元で、当時の植生を実測したものではない。';
saika.history += '二月下旬という表示は、公記が二十二日の志立での分進に続けて渡河を記し、次に二十八日の中野城開城を記す順序による。小雑賀川を渡った日そのものは記されず、二十二日当日の戦とは断定しない。';
saika.history += '西岸の集落は、川沿いの陸道から折れて門と屋敷内へ続く枝道で結んだ。水路と囲いを避けた道筋は集落景観の補完で、当時の街道の位置を確定したものではない。川を越える橋や高岸を登る道は加えていない。';
saika.history += '西岸の後備えと川上・川下の備えの間には、柵より西の平坦部を通る連絡路を補った。信長公記が記す高岸と柵の守りを手掛かりにした陣内の景観の復元で、道の存在・位置・幅を史料で確認したものではない。番所や長屋、集落の水路を避け、高岸を登る道や新しい渡り場にはしていない。';
saika.history += '川上・川下の備えから集落へも陸道をつなぎ、水路の手前で折れて既存の町道へ通した。高画質では川岸の松並木を同じ本数のまま道の手前へ収め、陣と集落の往来を幹で塞がない配置とした。川沿いに暮らす集落と高岸の守りを結ぶ景観の補完で、当日の連絡路や松の位置を史料で確認したものではない。高岸を越える坂や川を渡る橋は設けていない。';
saika.history += '案内役の杉之坊は根来寺、三緘衆は雑賀の内の味方についた勢力で、公記は両者を分けて記す。雑賀の全てが織田方に敵対したとは扱わない。和歌山市公開の雑賀衆案内が示す雑賀荘の砂地を手掛かりに、西岸の後方は東岸の農耕地より砂色に描き分けた。砂地の範囲・色・細かな起伏は景観の復元で、この渡河地点の土質を実測したものではない。';
saika.history += '東岸の休閑田では畦や農道の縁にも木や竹を生やさず、林床の落ち葉と細かな地面のうねりも外した。農耕地と周囲の疎林を描き分けるための補完で、当時の田の範囲や植生を確定したものではない。';
saika.history += '山手勢の焼き払いを示す東岸の焼失家屋は、北と東へ続く後方道の脇へ置いた。公記に焼失家屋の位置や街道の封鎖は記されないため、焼け跡と倒木で復元の道を塞がない配置とした。';
saika.history += '焼失家屋の敷地は北への道の西側にまとめ、東側の休閑田や畦と重ねず、柱や倒れた材の周りに木や竹を生やさない。家屋の位置と敷地の広さは景観の補完で、公記が焼けた集落の場所を特定したものではない。';
saika.history += '西の遠い後方には、和歌山市公開の雑賀衆案内が示す雑賀荘の砂州・砂丘を手掛かりに低い砂の稜線を加え、砂地を囲む木立も疎らにした。砂丘の位置・高さと植生は景観の復元で、当時の渡河地点の実測ではない。川岸の高岸と戦列、集落や渡り道の高さは変えていない。';
saika.history += '東岸の休閑田の区画間には、農耕地の景観を補う浅い排水溝を置いた。水を張った田や橋は加えず、後方の陸道と畦を避けた。田の内側は土を主体とし、排水溝には湿りを残して、共通の草地や林床と描き分けた。溝の位置・幅・深さと土の湿りは復元で、この渡河記事に水路や当日の降雨が記されているという意味ではない。';
saika.history += '西岸の砂地には広い畝畑や列状の黄色い花を置かず、春の草の斑と細かな風紋を描いた。雑賀荘には農耕に適さない砂地が多いという市公開の案内を手掛かりにした景観の補完で、渡河地点の風紋や作物の有無を史料で確認したものではない。';
saika.history += '西岸後方の砂州・砂丘を表す範囲では、共通の地面処理による泥と林床の重なりを弱め、砂色の土と疎らな草へつないだ。高画質では立体の草も同じ乾湿の境に合わせて枯れ色を多めにし、砂丘だけが若草一色に見えないようにした。川際や集落の水路の湿りは保った。乾湿の境と範囲、草の色は景観の復元で、当日の天候や渡河地点の土質・植生を確定したものではない。';
saika.history += '川沿いの低地と西岸の砂州を表す木立は、杉主体の共通設定から松を多めにした構成へ替えた。木の総数と配置、屋敷脇の竹は保った。市公開の地理図を手掛かりにした景観の補完で、当時の樹種やその比率を史料で確認したものではない。';
saika.lordAt = { x: 102, z: 0, r: 12, why: '総大将で遊ぶ場合の後方の陣。川岸に信長がいたという史料上の保証ではない' };
saika.lordSpawn = { x: 102, z: 0, heading: WEST };
saika.history += '西岸の砂丘は集落のさらに西や川上・川下にも地面の砂の質感をつなぎ、奥行きだけで泥や林床へ切り替えない。集落の囲いと三方の水路の周りは湿りを保ち、庭に風紋を描かない。砂と湿った土の境界は景観の補完で、当時の乾湿を確定したものではない。';
saika.history += '東岸の休閑田の畦には、浅い排水溝が通る位置に水口を設け、溝を盛土でせき止めない形にした。市公開の案内が示す農耕地を手掛かりにした景観の補完で、水口の位置や寸法を史料で確認したものではない。';
saika.history += '高画質では、川上・川下の鉄砲の控えが近くの兵へ替わった後も、一列の持ち場で描く。公記の渡河記事には鉄砲で防いだことが記されるが、段を交代して撃つ記述はない。一列の配置は遊びの復元で、史実の射撃陣形と断定するものではない。射撃を許す時間帯と兵数は変えていない。';
saika.history += '川岸の葦は川下まで曲がる水際に沿わせ、高画質では背丈と株の間隔をずらして低い群落とした。渡り口は空けたまま、既存の形と材質を使い回す。植生の位置・背丈は景観の補完で、当日の植生を史料で確認したものではない。';
saika.history += '高画質の葦は春の季節感に合わせ、前年の褐色の枯れ茎と巻いて垂れた葉を主体に、短い新芽を少数交ぜた。国土交通省のよしの生態解説を手掛かりにした景観の補完で、小雑賀川の当日の植生や芽吹きの時期・割合を確定したものではない。株の配置と総数、渡り口の空きは保った。';
saika.history += '川底の杭に添える短い泡の筋も、川面と同じく北から和歌浦へ向かう川筋に沿わせた。国土交通省の河道変遷資料を手掛かりにした景観の復元で、当日の流速や潮による逆流を確定したものではない。';
saika.history += '高画質の遠山の木と露岩も、和歌浦へ開ける南と西の低丘に合わせた山肌へ置き直した。市公開の地理図を手掛かりにした景観の補完で、当時の植生や露岩の位置を確定したものではない。';
saika.history += '高画質では、西岸後方の砂州の色を戦場外の遠景にもつなぎ、境界で共通の緑の畑色へ戻らないようにした。市公開の雑賀衆案内が示す砂地を手掛かりにした景観の復元で、当時の砂州の範囲や海岸線を確定したものではない。遠景の地形と木立、兵の配置は保った。';
saika.history += '西岸の集落には、砂地の雑賀荘で漁業・海運が盛んだったという市公開の雑賀衆案内を手掛かりに、高画質で庭の網干しを補った。網干しの位置・形は生活景観の復元で、当日の渡河地点にあったと史料で確認したものではない。道と戦列には置いていない。';
saika.history += '高画質では、戦場の外へ続く木立も東の農耕地と西の砂州に合わせて疎らにし、近景の低地を境界のすぐ外の密林で囲まないようにした。和歌山市公開の雑賀衆案内を手掛かりにした景観の補完で、当時の木の位置や本数を確定したものではない。遠景の木の形と材質、川岸の兵と斬り合いの密度は保った。';
saika.history += '高画質では、東岸の農耕地に続く遠景の低地も土色の休閑田へつなぎ、共通の夏草色や林床へ急に戻らないようにした。和歌山市公開の雑賀衆案内が示す東岸の農耕地を手掛かりにした景観の補完で、当日の作付けや田の区画を確定したものではない。遠景の丘陵・川筋と兵の配置は保ち、既存の地面の頂点色だけを使った。';
saika.history += '高画質では、川面を遠景の外までつなぎ、川床だけを残して途中で水が途切れないようにした。市公開の雑賀衆案内が示す和歌浦へ南下する川を手掛かりにした景観の補完で、当時の川筋や水位の実測ではない。渡河地点の川筋・幅・深さと高岸、兵の配置は保った。';
saika.history += '高画質では、公記の馬も上がれない高岸を土の急岸として見せるため、斜面に薄い土色の帯を補い、既存の小石の一部を法尻の土塊へ振り替えた。土の帯や崩れ方は景観の補完で、当日の地層や土質を確認したものではない。岸の高さ・傾斜、渡り口と兵の持ち場は保った。';
saika.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  // 避け足の横歩き・後退・駆け足を、次の作業や渡河へ持ち越さない。
  // 入力を保持する道具でも、今の下知の方向だけに歩く。
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  inp.runHeld = false;
  if (!u.alive || F.ending && b.tracker.main === true) return;
  // 杭抜き中も目の前の打ち手を受け、隙には反撃する。
  // 味方への振りを受け続けたり、移動先へ向き直って構えを背けたりしない。
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  let attacker = null, attackDist = 4.5;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const attacking = o.atk?.target === u ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (attacking && d < attackDist) { attacker = o; attackDist = d; }
  }
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 引く下知が出たら、届く一撃だけを受ける。敵へ詰めて川の口を離れない。
  // 結果待ちの終幕でも操作を止めず、味方と後ろの陣へ引く。
  if (F.step === 3 || F.ending) {
    if (attacker && attackDist < reach) {
      if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
      p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      patientStrike(p, inp, attacker, attackDist);
      return;
    }
    if (p.lock) inp.e.add('KeyQ');
    const to = u.pos.x < -22 && Math.abs(u.pos.z) > 2 ? WEST_MOUTH : F.ending ? REAR : BACK;
    goTo(p, inp, to.x, to.z, 1.5);
    return;
  }
  // 渡河の下知では西岸へ着くことを先にする。近い敵への反撃で六十秒を使い切らない。
  // 届く打ち手には歩きながら構え、足場へ着いてから応戦する。
  if (F.step === 2 && !F.reached) {
    if (p.lock) inp.e.add('KeyQ');
    const to = u.pos.x > -22 && Math.abs(u.pos.z) > 2 ? EAST_MOUTH : SHORE;
    goTo(p, inp, to.x, to.z, 1.5);
    inp.guardHold = !!attacker && attackDist < reach;
    return;
  }
  // 杭抜きの護衛は、作業する組のそばへ来た敵を迎える。
  // 自分の槍の間合いだけを探すと、数歩先で味方を襲う敵を見過ごす。
  const work = F.step === 1 ? F.stakes.find((a) => !a.pulled) : null;
  const guardEnemy = work ? b.army.nearestEnemy(u, 12, (o) =>
    !o.fleeing && !o.noTarget && !o.isStruct && o.type !== 'gun' && o.type !== 'bow' &&
    o.pos.x > -19 && Math.hypot(o.pos.x - work.workAt.x, o.pos.z - work.workAt.z) < 8 &&
    Math.hypot(u.pos.x - work.workAt.x, u.pos.z - work.workAt.z) < 12 &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) : null;
  // 杭や竹束の作業中も、寄せた小組が味方と斬り合っていれば近くへ踏み込む。
  const bankEnemy = F.step === 1 || F.step === 4 || F.step === 5 ? b.army.nearestEnemy(u, 12, (o) =>
    o.group?.bankCommitted && !o.fleeing && !o.woundOut && !o.rearWound && !o.downed &&
    !o.noTarget && o.type !== 'gun' && o.type !== 'bow' && o.pos.x > -18 &&
    (F.step !== 4 || Math.hypot(o.pos.x - COVER.x, o.pos.z - COVER.z) < 6 &&
      Math.hypot(u.pos.x - COVER.x, u.pos.z - COVER.z) < 6) &&
    (F.step !== 1 || work && Math.hypot(o.pos.x - work.workAt.x, o.pos.z - work.workAt.z) < 8 &&
      Math.hypot(u.pos.x - work.workAt.x, u.pos.z - work.workAt.z) < 12) &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) : null;
  const e = attacker || guardEnemy || bankEnemy || strikeTarget(b, F.step === 5 ? 20 : reach);
  const d = e ? Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) : Infinity;
  // 渡河・引き退き・杭抜きでは近い敵だけ払う。西岸の射手を追わない。
  // 杭抜きでは間合いの外の敵を追わず、近い一撃を受けたら作業へ戻る。
  const pursue = e && F.step !== 1 && (e === guardEnemy || e === bankEnemy || F.step === 5 && e.pos.x > -14);
  const awayFromWork = work && Math.hypot(u.pos.x - work.workAt.x, u.pos.z - work.workAt.z) >= 8;
  // 作業場を離れたら追撃を止める。届く初撃だけ受け、旗への道へ戻る。
  if (e && (attacker && (!awayFromWork || d < reach) || !awayFromWork && (d < reach || pursue))) {
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵の槍だけが届く所で受け続けず、反撃の間合いへ詰める。
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    patientStrike(p, inp, e, d);
    return;
  }
  // 鉄砲・弓の避け足は共通の頭に任せ、打ち手を払ったら作業と下知へ戻る。
  if (F.step === 1 || F.step === 4 && !F.cover) {
    let nearest = null, distance = Infinity;
    // 今の作業場所を選ぶ。作業兵がいなくても長押しで杭を外す。
    for (const it of b.interacts) if (F.step === 4 ? it.id === 'cover' : work && it.id === 's' + work.i) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < distance) { nearest = it; distance = d; }
    }
    // 杭の印へ近づきすぎず、長押しが届いたら作業する。回避で少し離れても戻りすぎない。
    if (nearest) { if (distance >= nearest.r) goTo(p, inp, nearest.pos.x, nearest.pos.z, nearest.r - 0.3); else inp.k.add('KeyE'); }
    return;
  }
  // 脇の杭から西岸を直線で狙うと、残る杭列に当たる。東側で中央の口へ合わせてから渡る。
  if (F.step === 2) {
    // 到着後も印へ詰め続けると、坂へ踏み込み、退く下知と逆を向く。
    // 低い足場を離れた時だけ戻り、それ以外は川へ向き直って待つ。
    if (F.reached && Math.hypot(u.pos.x - SHORE.x, u.pos.z - SHORE.z) < 3) {
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = EAST;
      return;
    }
    const to = u.pos.x > -22 && Math.abs(u.pos.z) > 2 ? EAST_MOUTH : SHORE;
    goTo(p, inp, to.x, to.z, 1.5);
    return;
  }
  goTo(p, inp, BACK.x, BACK.z, 3);
};
export { saika };
