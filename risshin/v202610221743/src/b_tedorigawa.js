import { bodyGeometry } from './units_model.js';
import { lodSwap, muddyFlag, umaGeometry } from './units_flags.js';
import { rockShape } from './rock_shape.js';
import { woodTex, barkTex } from './nature.js';
import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　手取川の戦い（天正五年九月二十三日）
// 能登の七尾城を助けに、柴田勝家を大将とする織田勢が加賀へ入り、手取川を越えた。
// 七尾城は七つの尾根に広がる巨大な山城。上杉謙信が重臣を寝返らせて落とし、勝家の救援は間に合わなかった。
// その知らせから退き口を始める。七尾は能登にあり、加賀の川岸に天守・白壁・高い石垣の城を置かない。
// 足軽は柴田勝家の手。①退き始めと川の詰まり ②柴田の殿→逆襲→本隊を渡す→三本の線で退く
// ③最後に自分の組も増えた川を渡る ④南の岸で遅れた殿の列を待ち、退く
// 秀吉の離陣は開戦前の知らせで振り返る。勝利は討取りではなく、味方を生きて渡すこと。
// 大軍は初めから備えごとに置く。上杉の射手は北岸から渡り口を狙う
// 戦の大きさには諸説あり、ここでは退き口として描く
// 向き：南（+z）の岸が味方の退く先。川は南東から北西へ流れる。北（-z）から上杉勢が来る
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { distToPolyline } from './world.js';
import { nobori, tawara, campfire, solidCircle, solidRect, solidSeg, hut, dou,
  bobosaku, hiraTateGeo, yagura, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { tabaGeo, tabaMat } from './taketaba.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm, unitPos } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, hold, depthBot } from './b_depth.js';
import { uS, uA, uC, round, gunLine, camp } from './b_mid.js';
import { sightUnit } from './battle_sight.js';
import { TEDORIGAWA_KACCHU } from './kacchu_data.js';
import { NAMED_GEAR } from './named_gear.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const ABSENCE_LINES = ['列を離れるな！　かがり火へ戻れ', '追手を追うな！　退く者を守れ', '殿が薄いぞ！　組と持ち場へ戻れ'];
const DEEP_LIMIT = 0.65; // 膝の浅瀬まで。足の届かない所へ進ませない。
const FLOOD_RISE = 0.15; // 渡り道は増水しても膝ほどに保つ。
const BREACH_LIMIT = 12; // 列を立て直す猶予の後は、包囲される前に渡り口へ退く。
const ISOLATION_LIMIT = 8; // 警告を読み、構えた歩みで隣の列へ戻る猶予。居残れば持ち場を捨てて渡る。
const RETREAT_HP = 0.6; // 半分の命で居残る下知を続けず、浅瀬まで歩く余力を残す。
// 本人の出血は二十秒で半減する。かすり傷だけで殿を失敗にしない。
// 出血中は七割五分、止血済みなら六割で、渡る余力を残して退く。
function needsWoundedRetreat(u) {
  return u.hp < u.maxHp * (u.wounds?.bleed > 0.0001 ? 0.75 : RETREAT_HP);
}

function needsNorthRetreat(rt) {
  const F = rt.flags, u = rt.player.u;
  // 本隊を渡し終えた後は、出血した手負いを次の火へ居残らせない。
  // 初めの防戦・逆襲の条件は保ち、退く線で命が八割五分になったら先に渡す。
  return needsWoundedRetreat(u) || F.mainCross >= 100 && !!F.dp?.cur?.s?.tedoLine &&
    u.wounds?.bleed > 0.0001 && u.hp <= u.maxHp * .85;
}

// 本隊を渡した後、または味方と持ち場を支えている時の負傷は、傷だけで失敗にしない。
// 列が残っていれば手負いを先に渡し、南岸で本隊と遅れた者を迎える。崩壊・包囲は保つ。
function heldBeforeWound(rt) {
  const F = rt.flags, C = F.dp?.cur;
  // 立て直す猶予の途中で傷を受けても、猶予を飛ばして失敗にしない。
  if (F.failedHold || F.lineBroken || !C || C.broken || C.timeout ||
      C.breachT >= BREACH_LIMIT || C.isolatedT >= ISOLATION_LIMIT) return false;
  if (F.mainCross >= 100 && C.s?.tedoLine) return true;
  // 段が替わると接敵時間は零に戻る。前の持ち場で守った働きは引き継ぐ。
  // 追手を退けて接触が途切れた時も、味方と列に残っていれば手負いを渡す。
  return C.allies >= 3 && (F.heldNorthLine || C.inT >= 8 && tedoHeld(C, F)) &&
    Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < C.botRadius;
}

const RIVER = [[-240, -22], [-120, -10], [0, 2], [120, 14], [240, 26]];
const FLOW = RIVER.slice(1).map((b, i) => {
  const a = RIVER[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return { ax: a[0], az: a[1], dx, dz, len2: len * len, x: -dx / len, z: -dz / len };
});
const FORD = { x: 0, z: -26 };              // 北の岸の渡り口
const SOUTH = { x: 4, z: 34 };              // 南の岸（退く先）
const RIVER_TINT = { r: 0.42, g: 0.42, b: 0.36 };
const ODA = { flag: 'oda' };
const UESUGI = { flag: 'uesugi' };
let niwaUmaMat;

// 北の松任城と川岸を同じ場所に縮めない。城下の住民を渡り口へ自動配置しない。
// 白山市「松任城と手取川の戦い」を土地の背景に参照。
// https://www.city.hakusan.lg.jp/bunka/bunkashinko/1002820.html
// 以下の在所・小堂・人数・細道は、扇状地の暮らしを補う仮置き。実在の村・寺の復元ではない。
// 両岸の人は同じ岸の横道へ逃げ、増水した川と中央の軍道を横切らない。
const PEOPLE_PATHS = [
  [[-96, -44], [-132, -44], [-172, -48]],
  [[-118, -59], [-132, -52], [-151, -48], [-172, -48]],
  [[-142, -83], [-158, -76], [-172, -72]],
  [[96, 48], [136, 48], [172, 64]],
  [[118, 68], [136, 62], [172, 64]],
];
const PEOPLE_SITES = [[-118, -64], [-142, -88], [118, 76]];
const PEOPLE_BANDS = [
  { x: -96, z: -44, kinds: ['farmer', 'woman', 'child', 'elder'] },
  { x: -118, z: -59, mode: 'inside', kinds: ['farmer', 'woman', 'child'] },
  { x: -142, z: -83, mode: 'inside', kinds: ['farmer', 'woman', 'elder'] },
  { x: 96, z: 48, kinds: ['townsman', 'merchant', 'farmer', 'woman', 'child'] },
  { x: 118, z: 68, mode: 'inside', kinds: ['monk', 'monk', 'farmer'] },
].map((b, i) => ({ ...b, route: PEOPLE_PATHS[i].slice(1).map(([x, z]) => ({ x, z })) }));

function peopleClearing(x, z) {
  for (const [sx, sz] of PEOPLE_SITES) if (Math.hypot(x - sx, z - sz) < 12) return true;
  for (const path of PEOPLE_PATHS) if (distToPolyline(x, z, path) < 5) return true;
  return false;
}

function riverVillage(rt) {
  const W = rt.world;
  // 同じ民家は形と材質を共有し、当たりだけを別の位置へ置く。
  const home = hut(W, -118, -64, 6, 5), other = home.clone();
  // 複製先も民家共通の四隅の高さに合わせる。元の家の土台の差を持ち込まない。
  let base = W.heightAt(-142, -88);
  for (const sx of [-3, 3]) for (const sz of [-2.5, 2.5])
    base = Math.max(base, W.heightAt(-142 + sx, -88 + sz));
  other.position.set(-142, base, -88);
  solidRect(-142, -88, 6.18, 5.18).civilianSite = 'home';
  rt.scene.add(home, other, dou(W, 118, 76, 8, 6, Math.PI, { h: 2.8 }));
}

// 写真の野戦道具を参考にした仮設の備え。手取川での設置位置は復元ではなく補完。
// 城や攻城用の台車は置かず、払いかけの北岸と両本陣の脇だけに据える。
function riverFieldworks(rt) {
  const W = rt.world, batch = makeSimpleBatch(), pose = new THREE.Object3D();
  const detailed = true;
  // 幟は紋と風を保ち、布の裾と雨筋だけ染める。共有元には書き込まない。
  const flagGeos = new Map(), flagMats = new Map();
  const wetStandard = root => {
    if (!detailed) return root;
    const flag = root.userData.flag;
    if (!flag) return root;
    const source = flag.geometry, base = flag.material;
    if (!flagGeos.has(source)) {
      const geo = source.clone(), uv = geo.attributes.uv;
      const colors = new Float32Array(uv.count * 3), color = new THREE.Color();
      const linen = new THREE.Color(0xd6cebb), stain = new THREE.Color(0x89755a);
      for (let i = 0; i < uv.count; i++) {
        const rain = .5 + .5 * Math.sin(uv.getX(i) * 37 + uv.getY(i) * 3);
        const hem = Math.max(0, 1 - uv.getY(i) / .2);
        color.copy(linen).lerp(stain, hem * (.25 + rain * .3)).multiplyScalar(.96 + rain * .04);
        colors.set([color.r, color.g, color.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); flagGeos.set(source, geo);
    }
    if (!flagMats.has(base)) {
      const mat = base.clone(); mat.vertexColors = true;
      mat.onBeforeCompile = base.onBeforeCompile; mat.customProgramCacheKey = base.customProgramCacheKey;
      flagMats.set(base, mat);
    }
    flag.geometry = flagGeos.get(source); flag.material = flagMats.get(base);
    return root;
  };
  // 共通の七本束を芯に、細竹を外周へ詰める。写真の密な束の木口を近景だけで見せる。
  // 追加分も一つの形へ結合し、十六枚の竹束で使い回す。
  let bambooGeo = tabaGeo();
  if (detailed) {
    const parts = [bambooGeo.clone()], color = new THREE.Color();
    const tint = (geo, hex) => {
      color.setHex(hex);
      const colors = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(geo);
    };
    for (let b = 0; b < 4; b++) for (let i = 0; i < 12; i++) {
      const a = (i + .5) * Math.PI / 6, x = (b - 1.5) * .46 + Math.cos(a) * .173;
      const z = Math.sin(a) * .173, h = 1.69 + ((b + i) % 4) * .035;
      const pole = new THREE.CylinderGeometry(.023, .026, h, 5, 2).toNonIndexed();
      // 外周の細竹も接地する二十二センチだけ泥を吸う。中間の輪を根元へ寄せる。
      const points = pole.attributes.position;
      for (let v = 0; v < points.count; v++)
        if (Math.abs(points.getY(v)) < .001) points.setY(v, -h / 2 + .22);
      pole.translate(x, h / 2, z); tint(pole, i % 3 ? 0x85834a : 0x9b975e);
      const colors = pole.attributes.color, mud = new THREE.Color(0x625838);
      for (let v = 0; v < points.count; v++) if (points.getY(v) < .01)
        colors.setXYZ(v, mud.r, mud.g, mud.b);
      // 外へ詰めた細竹にも節を通す。縄の三段とは高さを分け、滑らかな棒に見せない。
      // 節は側面八面だけを共通形へ結合し、個別の描画や更新を増やさない。
      for (const y of [.61, 1.21]) {
        const node = new THREE.CylinderGeometry(.029, .03, .018, 4, 1, true).toNonIndexed();
        node.translate(x, y + ((b + i) % 3 - 1) * .018, z); tint(node, 0xa09b60);
      }
      const mouth = new THREE.CircleGeometry(.016, 5).toNonIndexed();
      mouth.rotateX(-Math.PI / 2); mouth.translate(x, h + .001, z); tint(mouth, 0x443e25);
      // 芯の太竹と同じく、暗い空洞の周りに淡い竹肉を残す。
      const rim = new THREE.RingGeometry(.016, .023, 5).toNonIndexed();
      rim.rotateX(-Math.PI / 2); rim.translate(x, h + .002, z); tint(rim, 0xc4b78a);
    }
    bambooGeo = mergeGeometries(parts); parts.forEach(geo => geo.dispose());
  }
  const shieldMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailed ? woodTex() : null });
  const coarseMat = new THREE.MeshLambertMaterial({ color: 0x6d7048 });
  const coarseBamboo = new THREE.BoxGeometry(1.85, 1.75, .42);
  coarseBamboo.translate(0, .875, 0);
  // 盾は紋を借りず、二枚板と黒い帯、裏の控え棒を見せる。
  // 高画質の板だけ根元に頂点の段を持つ形を使う。泥色を背丈いっぱいに補間しない。
  const shieldGeo = detailed ? hiraTateGeo('field', true).clone() : hiraTateGeo('stripe', true);
  if (detailed) {
    // 写真の置楯は人の肩幅より広い。共通の細い手楯は変えず、雨の泥は下端だけに入れる。
    shieldGeo.scale(1.4, 1, 1);
    const colors = shieldGeo.attributes.color, points = shieldGeo.attributes.position;
    const dirt = new THREE.Color(0x40392b), faded = new THREE.Color(0xb9aa84), color = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      color.fromBufferAttribute(colors, i);
      if (color.r + color.g + color.b > .18) color.lerp(faded, .22);
      const mud = points.getY(i) < .01 ? 1 : 0;
      color.lerp(dirt, mud * .62);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
  }
  const sites = [
    { x: -54, z: -64, front: -1 }, { x: 54, z: -66, front: -1 },
    { x: 34, z: 104, front: -1 }, { x: 64, z: -206, front: 1 },
  ];
  for (const site of sites) {
    const { x, z, front } = site, angle = front < 0 ? Math.PI : 0;
    // 四間ほどの柵を左右へ分け、中央十八メートルは幕の口と旗本の道に残す。
    for (const side of [-1, 1]) {
      const ax = x + side * 10, bx = x + side * 16, fz = z + front * 9;
      const seg = front < 0 ? [Math.min(ax, bx), fz, Math.max(ax, bx), fz] :
        [Math.max(ax, bx), fz, Math.min(ax, bx), fz];
      // 写真の仮設柵のように短い丸太を杭で継ぎ、段ごとに継ぎ目をずらす。
      bobosaku(W, seg, { batch, noMound: true, noTrench: true, fieldSplices: detailed });
      Object.assign(solidSeg(...seg, .18), { missileH: 2.1, missileType: 'wood' });
    }
    // 竹四束を縄で三段に締めた防壁。近くは節・木口、遠くは一枚の外形。
    // 地形に沿った行列を組み立て時に一度だけ作り、形・材質は全陣で共有する。
    const lod = new THREE.LOD(), y = W.heightAt(x, z);
    const near = new THREE.InstancedMesh(bambooGeo, tabaMat(), 4);
    const far = new THREE.InstancedMesh(coarseBamboo, coarseMat, 4);
    const shields = new THREE.InstancedMesh(shieldGeo, shieldMat, 8);
    let bi = 0, si = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const px = x + side * (10.4 + i * 2.05), pz = z + front * 6.8;
        pose.position.set(px - x, W.heightAt(px, pz) - y, pz - z);
        // 竹束の控えは局所の +z。盾と逆向きにして内側へ置く。
        pose.rotation.set(0, angle + Math.PI, 0); pose.updateMatrix();
        near.setMatrixAt(bi, pose.matrix); far.setMatrixAt(bi++, pose.matrix);
        Object.assign(solidRect(px, pz, 1.9, .6, angle), { missileH: 1.7, missileType: 'wood' });
      }
      for (let i = 0; i < 4; i++) {
        // 写真のように二枚ずつ組にする。組の間を広げ、楯の端をわずかに重ねる。
        // 全体の幅と枚数を保ち、通路側へ張り出さない。
        const pair = Math.floor(i / 2);
        const px = x + side * (9.7 + (detailed ? pair * 2 + (i % 2) * .7 : i * .56));
        const pz = z + front * (4.4 + (detailed ? pair * .22 + (i % 2) * .08 : 0));
        pose.position.set(px - x, W.heightAt(px, pz) - y, pz - z);
        pose.rotation.set(0, angle + (i % 2 ? .025 : -.025), 0); pose.updateMatrix();
        shields.setMatrixAt(si++, pose.matrix);
        if (detailed) Object.assign(solidRect(px, pz, .77, .28, pose.rotation.y),
          { missileH: 1.6, missileType: 'wood' });
      }
      if (!detailed) Object.assign(solidRect(x + side * 10.54, z + front * 4.4, 2.24, .28),
        { missileH: 1.6, missileType: 'wood' });
    }
    near.castShadow = true; near.receiveShadow = far.receiveShadow = true;
    shields.castShadow = shields.receiveShadow = true;
    lod.addLevel(near, 0); lod.addLevel(far, detailed ? 55 : 75); lod.position.set(x, y, z);
    shields.position.set(x, y, z); rt.scene.add(lod, shields);
  }
  finalizeSimpleBatch(rt, batch);
  // 本の井楼の四本柱・突き出た横木・縄結び・狭間楯。雨除けの城櫓にはしない。
  // 幕の外の脇へ置き、退く軍道、民家の逃げ道、後ろの控えの列から離す。
  // 謙信の本陣脇は竹に雀の家紋旗から、伝来する軍旗「毘」へ替える。
  // 米沢市上杉博物館「戦う上杉氏」：
  // https://www.denkoku-no-mori.yonezawa.yamagata.jp/012tatakau.htm
  // 手取川での掲揚位置・筆形は復元案。既存の幟を替え、形・材質を共有する。
  const towers = [
    yagura(W, 56, 108, { height: 6.4, boarded: false, fieldFrame: true, fieldGallery: detailed, fieldDetail: detailed, fieldLashings: detailed, mon: 'takigawa', team: 0 }),
    yagura(W, 42, -212, { height: 6.4, boarded: false, fieldFrame: true, fieldGallery: detailed, fieldDetail: detailed, fieldLashings: detailed, mon: 'uesugi_bi', team: 1 }),
  ];
  if (detailed) {
    // 伐り出した皮付きの四本柱。横木と楯は木地のまま、柱だけに樹皮を被せる。
    // 二基で形・材質を共有し、遠景では既存の粗い井楼だけを描く。
    const bark = barkTex(), mat = new THREE.MeshLambertMaterial({ map: bark, vertexColors: true });
    const geo = new THREE.CylinderGeometry(.146, .15, 1, 6, 4, true);
    const uv = geo.attributes.uv, p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3), color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      uv.setY(i, uv.getY(i) * 3.4);
      color.setHex(0xbbb2a0).multiplyScalar(.52 + .48 * Math.min(1, (p.getY(i) + .5) * 6));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // 張り出し床は隙間のある短い板組み。楯の巻き縄も指定付きの共通形へまとめる。
    // 手取川では結び目と伐った横木の木口だけを補い、縄を二重に重ねない。
    const fittings = [];
    const addFitting = (g, hex) => {
      const shape = g.index ? g.toNonIndexed() : g;
      if (shape !== g) g.dispose();
      color.setHex(hex);
      const colors = new Float32Array(shape.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3)); fittings.push(shape);
    };
    // 写真の張り出し床は柱から斜めの支え木で受ける。中央の梯子口へは通さない。
    // 縦格子は既存の指定付き井楼を使い、支え八本も二基で一つの結合形へまとめる。
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
    const lower = new THREE.Vector3(), upper = new THREE.Vector3(), rotation = new THREE.Quaternion();
    const galleryY = 6.4 * .68;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const axis of ['x', 'z']) {
      lower.set(sx * 1.3, galleryY - 1.25, sz * 1.3);
      upper.set(sx * (axis === 'x' ? 1.75 : 1.3), galleryY - .16,
        sz * (axis === 'z' ? 1.75 : 1.3));
      direction.subVectors(upper, lower);
      const brace = new THREE.CylinderGeometry(.055, .065, direction.length(), 5);
      rotation.setFromUnitVectors(up, direction.normalize()); brace.applyQuaternion(rotation);
      brace.translate((lower.x + upper.x) / 2, (lower.y + upper.y) / 2, (lower.z + upper.z) / 2);
      addFitting(brace, axis === 'x' ? 0x756348 : 0x69583f);
    }
    for (let face = 0; face < 4; face++) for (let i = 0; i < 5; i++) {
      if (face === 0 && i === 2) continue; // 梯子の口
      const offset = face === 0 ? Math.sign(i - 2) * (.75 + (Math.abs(i - 2) - 1) * .56) : (i - 2) * .56;
      for (const h of [.35, 1.35]) for (const side of [-1, 1]) {
        const knot = new THREE.BoxGeometry(.06, .04, .025);
        knot.translate(offset + side * .18, 6.4 + h, 1.478);
        knot.rotateY(face * Math.PI / 2); addFitting(knot, 0x8e7c58);
      }
    }
    for (let y = .45; y < 6.4; y += .8) for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const capX = new THREE.CircleGeometry(.092, 6);
      capX.rotateY(end * Math.PI / 2); capX.translate(end * 1.661, y, side * 1.3);
      addFitting(capX, 0xa49270);
      const capZ = new THREE.CircleGeometry(.092, 6);
      if (end < 0) capZ.rotateY(Math.PI);
      capZ.translate(side * 1.3, y + .22, end * 1.661); addFitting(capZ, 0x998769);
    }
    const fittingGeo = mergeGeometries(fittings); fittings.forEach(g => g.dispose());
    const fittingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const weathered = new Map(), faded = new THREE.Color(0x9c957d);
    for (const tower of towers) {
      tower.traverse(child => { if (child.userData.flag) wetStandard(child); });
      // 写真の木地の楯囲いを、雨夜の濡れと板ごとの褪せに合わせる。
      // 共通の井楼の形は書き換えず、二基で同じ頂点色の複製を使う。遠景にも同じ色を残す。
      const lod = tower.children.find(child => child.isLOD);
      for (const level of lod.levels) {
        const mesh = level.object, source = mesh.geometry;
        if (!weathered.has(source)) {
          const worn = source.clone(), points = worn.attributes.position, tint = worn.attributes.color;
          for (let i = 0; i < points.count; i++) {
            const y = points.getY(i);
            if (y < 6.42) continue;
            const along = Math.abs(points.getZ(i)) > 1.35 ? points.getX(i) : points.getZ(i);
            const board = Math.floor((along + 1.7) / .56);
            color.fromBufferAttribute(tint, i).lerp(faded, .24);
            color.multiplyScalar(.8 + ((board + 9) % 3) * .07);
            tint.setXYZ(i, color.r, color.g, color.b);
          }
          weathered.set(source, worn);
        }
        mesh.geometry = weathered.get(source);
      }
      const trunks = new THREE.InstancedMesh(geo, mat, 4);
      let i = 0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        // 本体は垂直な通し柱。樹皮も同じ軸・上下端にそろえ、二股の柱にしない。
        pose.position.set(sx * 1.3, 3.925, sz * 1.3);
        pose.rotation.set(0, 0, 0);
        pose.scale.set(1, 8.65, 1); pose.updateMatrix();
        trunks.setMatrixAt(i++, pose.matrix);
      }
      trunks.castShadow = trunks.receiveShadow = true;
      lod.levels[0].object.add(trunks);
      const detail = new THREE.LOD(), mesh = new THREE.Mesh(fittingGeo, fittingMat);
      mesh.receiveShadow = true;
      detail.addLevel(mesh, 0); detail.addLevel(new THREE.Group(), 40);
      lod.levels[0].object.add(detail);
    }
  }
  rt.scene.add(...towers);
  for (const [x, z, mon, front] of [[34, 104, 'takigawa', -1], [64, -206, 'uesugi', 1]])
    for (const side of [-1, 1]) {
      if (!detailed) rt.scene.add(nobori(W, x + side * 6, z - 9, mon, 5.2));
      else for (let i = 0; i < 3; i++)
        // 写真の旗列のように同じ家の幟を等間隔に。幕の口と槍隊の正面には置かない。
        // 謙信の本陣には毘・龍も掲げる。手取川での本数と配置は復元案。
        rt.scene.add(wetStandard(nobori(W, x + side * 17.8, z - front * (3 + i * 3.2),
          mon === 'uesugi' && i === 0 ? (side < 0 ? 'uesugi_bi' : 'uesugi_ryu') : mon, 5.2)));
    }
}

// 両本陣の仮設の設え。史料で確定した建物ではなく、雨夜の指揮所を遊ぶための補い。
// 陣幕の口と中央の通路は空け、床几の上だけに布の雨除け、足元に筵を置く。
function riverCampShelters(rt, camps, campRoots) {
  const W = rt.world, pose = new THREE.Object3D();
  if (true) {
    // 両本陣の布だけを生成時に染める。家紋の絵と風の仕組みはそのまま使う。
    // 裾の泥跳ねと折り目に沿う雨筋を頂点色で入れ、追加の面や毎コマの処理を増やさない。
    const color = new THREE.Color(), dry = new THREE.Color(0xc6bda6), mud = new THREE.Color(0x66543b);
    for (const root of campRoots) root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry.attributes.jpin) return;
      const geo = mesh.geometry, uv = geo.attributes.uv, p = geo.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const stripe = .5 + .5 * Math.sin(uv.getX(i) * 43 + p.getZ(i) * .7);
        const hem = Math.max(0, 1 - uv.getY(i) / .38);
        color.copy(dry).lerp(mud, hem * (.38 + stripe * .28));
        color.multiplyScalar(.94 + .06 * stripe);
        colors.set([color.r, color.g, color.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mesh.material.vertexColors = true; mesh.material.needsUpdate = true;
    });
  }
  const weave = document.createElement('canvas'); weave.width = weave.height = 128;
  const ink = weave.getContext('2d');
  ink.fillStyle = '#756044'; ink.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    ink.fillStyle = i % 8 ? '#635039' : '#93805b'; ink.fillRect(0, i, 128, 2);
    ink.fillStyle = '#50432f'; ink.fillRect(i, 0, 1, 128);
  }
  // 筵の端を縄でかがる。畳や御殿の床にはしない。
  ink.strokeStyle = '#3e3425'; ink.lineWidth = 3; ink.strokeRect(2, 2, 124, 124);
  const texture = new THREE.CanvasTexture(weave); texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x938775, side: THREE.DoubleSide });
  const wood = new THREE.MeshLambertMaterial({ color: 0x453728 });
  const roof = new THREE.InstancedMesh(new THREE.PlaneGeometry(7.6, Math.hypot(2.2, .65)), cloth, camps.length * 2);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, camps.length * 11);
  const floor = new THREE.PlaneGeometry(1.7, 2.1, 4, 4); floor.rotateX(-Math.PI / 2);
  let ri = 0, fi = 0;
  const beam = (x, y, z, w, h, d) => {
    pose.position.set(x, y, z); pose.rotation.set(0, 0, 0); pose.scale.set(w, h, d);
    pose.updateMatrix(); frame.setMatrixAt(fi++, pose.matrix);
  };
  for (const c of camps) {
    const x = c.pos.x, z = c.pos.z - 3;
    let top = W.heightAt(x, z) + 3.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      top = Math.max(top, W.heightAt(x + sx * 3.4, z + sz * 2.2) + 3.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * 3.4, pz = z + sz * 2.2, ground = W.heightAt(px, pz);
      beam(px, (ground + top) / 2, pz, .1, top - ground, .1);
      solidCircle(px, pz, .08);
    }
    for (const sz of [-1, 1]) beam(x, top, z + sz * 2.2, 7, .12, .12);
    beam(x, top + .65, z, 7.6, .1, .1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pose.position.set(x + sx * 3.4, top + .325, z + sz * 1.1);
      pose.rotation.set(sz * Math.atan2(.65, 2.2), 0, 0);
      pose.scale.set(.12, .12, Math.hypot(2.2, .65));
      pose.updateMatrix(); frame.setMatrixAt(fi++, pose.matrix);
    }
    for (const sz of [-1, 1]) {
      pose.position.set(x, top + .325, z + sz * 1.1);
      pose.rotation.set(-Math.PI / 2 + sz * Math.atan2(.65, 2.2), 0, 0);
      pose.scale.set(1, 1, 1); pose.updateMatrix(); roof.setMatrixAt(ri++, pose.matrix);
    }
    for (const sx of [-1, 0, 1]) {
      const geo = floor.clone(), p = geo.attributes.position, mx = x + sx * 2.4;
      for (let i = 0; i < p.count; i++)
        p.setY(i, W.heightAt(mx + p.getX(i), z + p.getZ(i)) + .025);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(mx, 0, z);
      mesh.receiveShadow = true; rt.scene.add(mesh);
    }
  }
  floor.dispose(); roof.castShadow = frame.castShadow = true;
  roof.userData.camBlock = true; rt.scene.add(roof, frame);
}

// 南岸へ斜めに進むと深みへ出る。北岸を通って、幟の間へ入る。
// 印と自動の遊び手は同じ行き先を使い、入れ物は一つだけ。
function crossingTarget(rt) {
  const p = rt.player.u.pos, F = rt.flags;
  const q = F.crossGuideAt || (F.crossGuideAt = { x: 2, z: -30 });
  // 川へ入った後は北岸へ戻さない。斜めの川筋に沿って岸を判定する。
  // 浅瀬の端から斜めに入らず、まず中央へそろえる。
  F.crossViaBank = p.z < -24 + p.x * 0.1 && Math.abs(p.x - 2) > 2;
  F.crossEntering = !F.crossViaBank && p.z < -24 + p.x * 0.1;
  F.crossInFord = !F.crossViaBank && !F.crossEntering && p.z < 28;
  q.x = F.crossViaBank && p.z > -30 + p.x * 0.1 + 2.5 ? p.x :
    F.crossViaBank || F.crossEntering || F.crossInFord ? 2 : SOUTH.x;
  // 入り口に着くまでは近い浅瀬を示す。対岸だけを示して敵の列へ迷い込ませない。
  // 二歩手前で止まっても次の区間へ入れるよう、印を境目より先へ置く。
  // 川の入口そのものを示すと、入口の二歩手前で同じ印を指し続ける。
  q.z = F.crossViaBank ? -30 + q.x * 0.1 : F.crossEntering ? -18 : SOUTH.z;
  return q;
}

function riverCrossingText(rt) {
  crossingTarget(rt);
  const F = rt.flags;
  return F.crossViaBank ? '戦わず、岸に沿って浅瀬へ' :
    F.crossEntering ? '戦わず、川辺の二本の旗の間へ' :
      F.crossInFord ? '向こう岸の二本の旗へ渡れ' : '川を出て、南岸の火へ';
}

function riverRecoveryText(rt) {
  const F = rt.flags;
  if (F.step === 0) return '立ったら、柴田勝家の旗へ';
  if (F.step === 1) return '立ったら、北岸の火へ退け';
  if (F.step >= 4) return '立ったら、南岸の味方へ';
  if (F.step !== 3) return '立ったら、味方と列を守れ';
  // 起き上がる間も、渡る時と同じ道順を示す。深みへの直進を促さない。
  crossingTarget(rt);
  return F.crossViaBank ? '立ったら、岸に沿って浅瀬へ' :
    F.crossEntering ? '立ったら、川辺の二本の旗の間へ' :
      F.crossInFord ? '立ったら、浅瀬をまっすぐ渡れ' : '立ったら、南岸の火へ';
}

// 手取川だけの見た目。兵の数・戦力・任務の数え方は変えない。
function riverSoldiers(rt) {
  const A = rt.army, W = rt.world;
  const skins = [0xb58c68, 0xa87f5c, 0xc49a76], faces = [1, 5, 9];
  const hats = [0x24221e, 0x393027, 0x171919], lengths = [0.8, 1.2, 1.6];
  // 低画質でも小袖と漆の胴を一色にそろえない。既存の三組で形を共有する。
  const cloths = [0x26354b, 0x59402e, 0x555348], armors = [0x191b1b, 0x30251f, 0x232629];
  const addUnit = A.addUnit, addGroup = A.addGroup;
  // 遠い槍組までほぼ全員が指物を背負うと、竿と布が一枚の壁になる。
  // この川原の控えだけ旗持ちを間引く。人数・槍・本物へ替える控えは保つ。
  const addDistantArmy = W.addDistantArmy;
  W.addDistantArmy = function (o) {
    return addDistantArmy.call(this, o.kind === 'spear' && !o.people ?
      { ...o, flagRate: o.flagRate ?? 0.28, banners: o.banners ?? Math.max(1, Math.min(3, Math.round((o.w || 20) / 12))) } : o);
  };
  A.addUnit = function (g, o) {
    const v = g.initial % 3;
    if (!o.name && o.type !== 'player' && o.type !== 'dummy') {
      const flag = o.standard || o.flag;
      // 大きな白い馬印は布の指物へ。普通の兵も背丈の内に収める。
      o = { ...o, standard: null, flag: flag === 'oda' ?
        (g.name.includes('丹羽') ? 'sujikai' : g.name.includes('柴田') ? 'kari' : flag) : flag,
        flagScale: o.standard || o.flagScale >= 1.8 ? 1.8 : 1,
        skin: skins[v], face: faces[v], hatColor: hats[v] };
      if (o.type === 'ashigaru' || o.type === 'bow' || o.type === 'gun') {
        o.cloth ??= cloths[v]; o.armor ??= armors[v];
      }
      if (o.type === 'ashigaru' && !o.weapon) {
        o.spear = null; o.weaponExtra = lengths[v];
      }
    }
    return addUnit.call(this, g, o);
  };
  A.addGroup = function (o) {
    const g = addGroup.call(this, o), layout = g.layout;
    g.layout = function (n) {
      const q = layout.call(this, n);
      if (!this.cav && !this.isGun && q.f !== 'column' && q.f !== 'march') {
        q.sp *= 1.18; q.sd *= 1.45;
      }
      return q;
    };
    const slotJit = g.slotJit;
    g.slotJit = function (i, salt) {
      // 槍衾を半歩ずらす。渡河の縦列は既存の道幅を保つ。
      const stagger = this.formation === 'yari' && !this.marching && salt === 2 ?
        (i % 2 ? 0.35 : -0.35) / 0.025 : 0;
      return slotJit.call(this, i, salt) + stagger;
    };
    return g;
  };
  // 槍の向きは共通の構えに任せる。肩避けと石突の接地を計算した後に
  // 手だけを回すと、立てた長柄が後ろへ倒れ、石突の接地もずれてしまう。
  const animDeath = A.animDeath, moveAid = A.moveAid;
  const pose = new THREE.Object3D(), inverse = new THREE.Matrix4();
  A.moveAid = function (u, dt) { moveAid.call(this, u, dt); u.death.crawl = 0; };
  A.animDeath = function (u, dt, near) {
    const D = u.death;
    // 傷の向き・膝の崩れ・斬られた肩のひねりは、共通の倒れ方をそのまま使う。
    const impact = D.impactPending;
    animDeath.call(this, u, dt, near);
    // 接地した時だけ低い泥粒を跳ねる。既存の粒を使い、雨夜に乾いた煙を足さない。
    if (impact && !D.impactPending && !u.gone && near && u.camD < 35 && !D.floor &&
        this.time >= (this.tedoLandAt || 0)) {
      this.tedoLandAt = this.time + 0.12;
      W.puff(u.mesh.position.x, u.mesh.position.z, 2);
    }
    if (u.gone || D.t < 0.9 || !u.flag || D.carry > 0) return;
    if (!u.iwaFlagRig) {
      // 共通の骨の処理にも「落ちた旗」を知らせ、背中へ戻さない。
      const rig = new THREE.Group(); rig.matrixAutoUpdate = false;
      rig.add(u.flag); u.mesh.add(rig); u.iwaFlagRig = rig;
      u.flag.position.set(0, 0, 0); u.flag.rotation.set(0, 0, 0);
      u.flag.material = muddyFlag(u.flagMat || u.flag.material);
      const look = { ...u.look, pole: false }, key = u.body.userData.lookKey + '|tedoFallen';
      lodSwap(u.body, bodyGeometry(key, look, true, 'nohead'), bodyGeometry(key, look, false, 'nohead'));
    }
    const x = u.mesh.position.x + Math.cos(u.heading) * 0.85;
    const z = u.mesh.position.z - Math.sin(u.heading) * 0.85;
    pose.position.set(x, (D.floor ? u.pos.y : W.heightAt(x, z)) + 0.06, z);
    pose.rotation.set(-Math.PI / 2, u.heading, 0, 'YXZ');
    pose.updateMatrix(); u.mesh.updateMatrix();
    u.iwaFlagRig.matrix.copy(inverse.copy(u.mesh.matrix).invert()).multiply(pose.matrix);
    u.iwaFlagRig.matrixWorldNeedsUpdate = true;
  };
}

// 雨夜の背後の敵は足音と声で知らせる。光源と無関係な四角い影は描かない。
function riverRear(rt) {
  const F = rt.flags, army = rt.army, rear = army.hooks.onRearApproach,
    rearStrike = army.hooks.onRearStrike, dispose = rt.dispose;
  const warn = (u, target) => {
    if (u.rearWarned && u.rearGraceUntil > army.time) {
      if (!u.tedoRearHeard) { u.tedoRearHeard = true; army.play('stepWet', u.pos, 1.2); }
      if (target === rt.player.u && rt.t >= (F.rearCallAt || 0)) {
        F.rearCallAt = rt.t + 8;
        const crossing = F.step === 3;
        rt.hud.notices.push(crossing ? '後ろに追手！　槍を向けたまま浅瀬へ退け' : '後ろに追手！　振り向き、味方と並べ', 110, 3, 'warn',
          () => target.alive && u.alive && !rt.over && !u.fleeing &&
            (F.step === 3) === crossing &&
            army.behindOf(target, u) && Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) < 8);
      }
    }
  };
  army.hooks.onRearApproach = (u, target) => { warn(u, target); rear?.(u, target); };
  army.hooks.onRearStrike = (u, target) => { warn(u, target); rearStrike?.(u, target); };
  rt.dispose = function () {
    army.hooks.onRearApproach = rear;
    army.hooks.onRearStrike = rearStrike;
    this.dispose = dispose; return dispose.call(this);
  };
}

// この戦の深みだけで働く。岸と渡り口の歩み、他の戦の人の処理は変えない。
function swimming(rt, u) {
  return u.alive && !u.isStruct && rt.world.waterDepthAt(u.pos.x, u.pos.z) > 1.8;
}
function waterPose(rt, u) {
  if (!u.mesh || !u.alive) return;
  const wet = swimming(rt, u);
  if (wet) {
    const depth = rt.world.waterDepthAt(u.pos.x, u.pos.z);
    u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z) + depth - (u.mounted ? 0.9 : 0.75);
    u.mesh.position.copy(u.pos);
    u.mesh.rotation.order = 'YXZ';
    u.mesh.rotation.x = u.mounted ? -0.12 : -0.6;
    u.tedoWaterPose = true;
  } else if (u.tedoWaterPose) {
    u.mesh.rotation.x = 0; u.tedoWaterPose = false;
  }
}
function waterActions(rt) {
  const A = rt.army, P = rt.player, W = rt.world;
  const act = A.act, animate = A.animate, update = P.update, updateCamera = P.updateCamera;
  const waterLook = new THREE.Vector3();
  const updateTake = P.updateTake;
  P.updateTake = function (dt) {
    // 渡河の下知中は空馬より退路を先に見せる。南岸へ着けば案内を戻す。
    if (rt.flags.step === 3) {
      if (this.takeO) {
        rt.uninteract('horse-take'); rt.unmark('horse-loose'); this.takeO = null;
      }
      return;
    }
    return updateTake.call(this, dt);
  };
  // 渡る兵の処理は保つ。遊び手には本当の水深で深みの壁を付ける。
  const footDepth = W.waterFootDepthAt, canStep = P.canStep, collide = A.collide, steer = A.steer;
  W.waterFootDepthAt = function (x, z, y) {
    const d = footDepth.call(this, x, z, y);
    return this.tedoMoving ? Math.min(0.85, d) : d;
  };
  P.canStep = function (x0, z0, x, z, y) {
    if (W.waterDepthAt(x, z) > DEEP_LIMIT) {
      if (rt.t >= (rt.flags.deepWallAt || 0)) {
        rt.flags.deepWallAt = rt.t + 8;
        rt.say('組頭', 'そこは深い！　幟の間の浅瀬を通れ', 4);
      }
      return false;
    }
    return canStep.call(this, x0, z0, x, z, y);
  };
  A.collide = function (u, dt) {
    const before = W.tedoMoving; W.tedoMoving = true;
    try { return collide.call(this, u, dt); } finally { W.tedoMoving = before; }
  };
  A.steer = function (u, dt, want, speed, face) {
    const before = W.tedoMoving; W.tedoMoving = true;
    try { return steer.call(this, u, dt, want, speed, face); } finally { W.tedoMoving = before; }
  };
  A.act = function (u, dt, near) {
    if (!swimming(rt, u)) return act.call(this, u, dt, near);
    u.target = u.atk = u.swing = u.bind = null; u.charging = false;
    u.reload = null; u.guarding = 0;
    // 隊の進む向きは保つ。岸へ出るまで戦わず、足の届かぬ具足は速く泳げない。
    const at = u.tedoSwimTo || (u.tedoSwimTo = { x: u.pos.x, z: u.pos.z });
    if (u.fleeing || u.group?.routed) { at.x = 2; at.z = u.team ? -30 : SOUTH.z; }
    else { const q = u.moveTo || u.group.anchor; at.x = q.x; at.z = q.z; }
    this.steer(u, dt, at, u.mounted ? 0.65 : 0.45, null);
    u.moving = 0;
  };
  A.animate = function (u, dt, near) {
    const moving = u.moving;
    if (swimming(rt, u)) u.moving = 0;
    // 肩越しのカメラに近い騎馬も、脚と手綱の構えを省かない。
    animate.call(this, u, dt, near || (u.mounted && u.camD < 30)); u.moving = moving;
    waterPose(rt, u);
  };
  P.update = function (dt, input) {
    const x = this.u.pos.x, z = this.u.pos.z, wasDeep = swimming(rt, this.u);
    if (W.waterDepthAt(x, z) <= DEEP_LIMIT) {
      this.u.tedoSafeX = x; this.u.tedoSafeZ = z;
    }
    if (swimming(rt, this.u)) {
      this.cancelAttack(); this.shot = null; this.draw = 0;
      this.guardOn = this.guard = this.aiming = this.u.guard = false;
    }
    update.call(this, dt, input);
    if (swimming(rt, this.u)) {
      this.cancelAttack(); this.shot = null; this.draw = 0;
      this.guardOn = this.guard = this.aiming = this.u.guard = false;
    }
    if (this.u.alive && (wasDeep || swimming(rt, this.u))) {
      const dx = this.u.pos.x - x, dz = this.u.pos.z - z, d = Math.hypot(dx, dz);
      const cap = (this.mounted ? 0.65 : 0.45) * dt;
      if (d > cap) { this.u.pos.x = x + dx * cap / d; this.u.pos.z = z + dz * cap / d; }
      this.u.moving = 0;
    }
    // 斬撃の押し出しなど、一歩の判定を通らない移動も深みへ出さない。
    if (W.waterDepthAt(this.u.pos.x, this.u.pos.z) > DEEP_LIMIT && this.u.tedoSafeX != null) {
      this.u.pos.x = this.u.tedoSafeX; this.u.pos.z = this.u.tedoSafeZ;
      this.u.pos.y = W.heightAt(this.u.pos.x, this.u.pos.z);
      this.u.mesh.position.copy(this.u.pos);
    }
    waterPose(rt, this.u);
  };
  // 川床でなく水面の上から肩越しに見る。視点用の入れ物は毎回作らない。
  P.updateCamera = function (dt, camera) {
    updateCamera.call(this, dt, camera);
    const u = this.u, depth = W.waterDepthAt(u.pos.x, u.pos.z);
    if (!u.alive || depth < 0.8 || this.fpK >= 0.5) return;
    const surface = W.heightAt(u.pos.x, u.pos.z) + depth;
    const camDepth = W.waterDepthAt(camera.position.x, camera.position.z);
    const camSurface = W.heightAt(camera.position.x, camera.position.z) + camDepth;
    camera.position.y = Math.max(camera.position.y, surface + 2, camDepth > 0 ? camSurface + 1.5 : -Infinity);
    if (this.camPos) this.camPos.copy(camera.position);
    waterLook.set(u.pos.x + Math.sin(this.yaw) * 4, Math.max(surface + 0.25, u.pos.y + 1.1),
      u.pos.z + Math.cos(this.yaw) * 4);
    camera.lookAt(waterLook);
  };
  // 当たりを付ける直前にも水深を読む。入水した一コマだけ斬撃が通ることを防ぐ。
  for (const key of ['strike', 'fireShot', 'looseArrow']) {
    const action = P[key];
    P[key] = function (a, b, c, d) {
      if (swimming(rt, this.u)) return;
      const result = action.call(this, a, b, c, d);
      const target = this.u.swing?.target;
      if (key === 'strike' && target?.team === 1 && this.u.swing.done) rt.flags.playerHelp = true;
      return result;
    };
  }
}

// 持ち場の大きさは変えず、手取川だけ細い点線で示す。
function riverZones(rt) {
  const vertices = [];
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, b = a + Math.PI / 40;
    const ax = Math.cos(a), az = Math.sin(a), bx = Math.cos(b), bz = Math.sin(b);
    vertices.push(ax, 0, az, bx, 0, bz, ax * 0.994, 0, az * 0.994,
      bx, 0, bz, bx * 0.994, 0, bz * 0.994, ax * 0.994, 0, az * 0.994);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0xc2a25a, transparent: true, opacity: 0.24,
    depthWrite: false, side: THREE.DoubleSide });
  rt.zone = function (id, x, z, r) {
    this.unzone(id);
    const m = new THREE.Mesh(geo.clone(), mat);
    m.scale.set(r, 1, r); m.renderOrder = 2; m.userData.id = id;
    // 土手でも途切れないよう、点線の高さを地面に合わせる。
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.world.heightAt(x + pos.getX(i) * r, z + pos.getZ(i) * r) + 0.08);
    m.position.set(x, 0, z);
    this.scene.add(m); this.rings.push(m);
  };
  const unzone = rt.unzone;
  rt.unzone = function (id) {
    for (const m of this.rings) if (m.userData.id === id) m.geometry.dispose();
    unzone.call(this, id);
  };
}

// 矢を放つ構えの時点で知らせる。姿が見えなくても射手の方角が分かる。
function arrowWarning(rt) {
  const F = rt.flags, p = rt.player.u;
  if (!p.alive || rt.t < (F.arrowWarnAt || 0)) return;
  for (const u of rt.army.units) {
    const a = u.atk;
    if (!u.alive || u.team !== 1 || !a || !(a.bow || a.ranged) || a.target !== p) continue;
    const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
    const side = Math.abs(dx) > Math.abs(dz) ? dx < 0 ? '西' : '東' : dz < 0 ? '北' : '南';
    F.arrowWarnAt = rt.t + 8;
    rt.bark(`${side}の岸に射手！　矢が来るぞ、味方の列へ寄れ`, true);
    break;
  }
}

function messengerNews(rt, target, text) {
  const F = rt.flags, g = F.runner;
  if (!g?.count || !target.alive) return;
  const news = { target, text, at: rt.t };
  if (F.runnerNews || rt.t < (F.runnerVoiceAt || 0) || F.runnerQueue?.length) {
    const queue = F.runnerQueue || (F.runnerQueue = []);
    if (queue.length < 4) queue.push(news);
    return;
  }
  F.runnerNews = news;
  // 行き先は組を作った直後には無い。知らせを届ける間は同じ入れ物を使う。
  g.dest ??= { x: 0, z: 0 };
  g.order = 'move'; g.dest.x = target.pos.x; g.dest.z = target.pos.z;
}
function messengerTick(rt) {
  const F = rt.flags, g = F.runner;
  if (!F.runnerNews && rt.t >= (F.runnerVoiceAt || 0) && F.runnerQueue?.length) {
    F.runnerNews = F.runnerQueue.shift(); F.runnerNews.at = rt.t;
    g.order = 'move';
  }
  const n = F.runnerNews;
  if (!n) return;
  const man = g.units[0];
  if (!g.count || !man.alive || man.fleeing || man.woundOut || !n.target.alive || rt.t - n.at > 30) { F.runnerNews = null; return; }
  const c = man.pos, p = n.target.pos;
  if (Math.hypot(c.x - p.x, c.z - p.z) <= 4) {
    rt.say('使いの者', n.text, 3.5); F.runnerNews = null; F.runnerVoiceAt = rt.t + 8;
    if (!F.nanaoHeard && n.text.includes('七尾城')) { F.nanaoHeard = true; rt.banner('手取川の北の岸', '雨の夜、七尾落城の報せ'); }
    g.anchor ??= { x: 0, z: 0 };
    g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = c.z;
  } else {
    g.dest ??= { x: 0, z: 0 };
    g.dest.x = p.x; g.dest.z = p.z;
  }
}

function shelterGeneral(g, general) {
  if (!general) return;
  const i = g.units.indexOf(general), mid = Math.floor(g.units.length / 2);
  if (i < 0) return;
  [g.units[i], g.units[mid]] = [g.units[mid], g.units[i]];
  g.leader = general;
  for (let k = 0; k < g.units.length; k++) {
    const u = g.units[k], p = g.slotPos(k, g.initial);
    u.slot = k; u.pos.x = p.x; u.pos.z = p.z;
  }
}

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 川原は低く、岸は砂礫州。整備された左右対称の連続堤防にしない。
  // 国土交通省「手取川『霞堤』が土木遺産に認定」：古くは洪水ごとに幾筋も流路が変わった。
  // https://www.hrr.mlit.go.jp/kanazawa/mb2_jigyo/river/dobokuisan/dobokuisan.html
  const bank = z - (2 + x * 0.1);
  // 浅瀬だけ水面が落ちると、川床が三角の板として露出する。
  // 川の芯は水面と同じ緩い勾配へそろえ、岸の起伏へ滑らかにつなぐ。
  // 深さを決める共通の掘り下げと浅瀬の持ち上げは、この後で適用する。
  const shore = Math.max(0, Math.min(1, (Math.abs(bank) - 18) / 8));
  h = (0.05 + x * 0.0006) * (1 - shore * shore * (3 - 2 * shore)) +
    h * shore * shore * (3 - 2 * shore);
  // 渡り口の高さと幅は保ち、その外側で州の位置・高さ・幅をずらす。
  const edge = Math.min(1, Math.max(0, (Math.abs(x - 2) - 14) / 36));
  const north = 27 + edge * (3 * Math.sin(x * 0.041) + 2 * Math.sin(x * 0.093));
  const south = 29 + edge * (4 * Math.sin(x * 0.033 + 1) + Math.sin(x * 0.081));
  h += (1.4 - edge * (0.4 + 0.3 * Math.sin(x * 0.057))) * Math.exp(-((bank + north) ** 2) / (32 + edge * 20));
  h += (1.4 - edge * (0.45 + 0.3 * Math.cos(x * 0.043))) * Math.exp(-((bank - south) ** 2) / (32 + edge * 30));
  // 川沿いの平野。白山を数百歩先の丘として置かない。
  return h;
}

// 手取川の参照表・北国出陣の将名。特定の陣名と上杉の各備の将は伝わらない。
// 南向きに退く織田、北から南へ追う上杉。秀吉は離陣の振り返りだけで本戦の人数に含めない。
const JIN = [
  rosterPlan('川を背にした備え', 0, { x: 0, z: -66 }, 0, [
    ['shibata', '本陣', '柴田勝家', 8000, 0, -66, 'kari', 'kari', 0, { bind: 'shiba' }],
    ['niwa', '西の備え', '丹羽長秀', 5000, -30, -60, 'sujikai', 'sujikai', 0, { bind: 'others.0' }],
    ['maeda', '東の備え', '前田利家', 4000, 32, -62, 'maeda', 'maeda', 0, { bind: 'others.1' }],
    ['inaba', '西の渡河列', '稲葉良通・氏家直昌・安藤守就', 7000, -8, -80, 'oda', 'oda', 120, { w: 4, d: 64, facing: 0, host: false }],
    ['sassa', '東の渡河列', '佐々成政・不破光治・金森長近', 3000, 8, -110, 'oda', 'oda', 100, { w: 4, d: 56, facing: 0, host: false }],
    ['takigawa', '南岸の受け取り', '滝川一益', 3000, 34, 104, 'takigawa', 'takigawa', 0, { bind: 'honjin' }],
  ], '野戦の参照表・手取川。総勢三万を仮置き（四万とも）、各備の兵数と並びは補完'),
  rosterPlan('追撃の備え', 1, { x: 64, z: -206 }, 0, [
    ['kenshin', '本陣', '上杉謙信', 2000, 64, -206, 'uesugi_bi', 'uesugi', 0, { bind: 'ehon' }],
    ['front', '先手', '上杉謙信の配下（名は不明）', 6000, -6, -150, 'uesugi', 'uesugi', 180, { w: 40, d: 24, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['right', '東の脇備え', '上杉謙信の配下（名は不明）', 4000, 96, -160, 'uesugi', 'uesugi', 120, { w: 28, d: 22, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['second', '後備え', '上杉謙信の配下（名は不明）', 5000, 0, -190, 'uesugi', 'uesugi', 140, { w: 30, d: 28, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['left', '西の脇備え', '上杉謙信の配下（名は不明）', 3000, -70, -180, 'uesugi', 'uesugi', 100, { w: 26, d: 22, kind: 'spear', host: false, armor: 0x2a2a2a }],
  ], '野戦の参照表・手取川。謙信直率八千・全軍二万とも。合戦の規模には異説'),
];
// この戦の松明には木の柄と巻いた燃料を付ける。形と材質は全ての火で共有する。
function riverTorches(W) {
  const addFire = W.addFire;
  const stemGeo = new THREE.CylinderGeometry(0.045, 0.065, 1, 5);
  // 火元を一塊の黒い角柱にしない。細い割木と結び縄を一つの形にまとめる。
  const parts = [], color = new THREE.Color();
  const tint = (geo, hex) => {
    color.setHex(hex);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geo);
  };
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI / 3, radius = i === 6 ? 0 : .065;
    const geo = new THREE.CylinderGeometry(.021, .03, .3 + (i % 3) * .025, 5, 2).toNonIndexed();
    geo.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tint(geo, i % 2 ? 0x69503a : 0x846346);
    const points = geo.attributes.position, colors = geo.attributes.color;
    color.setHex(0x30251d);
    for (let v = 0; v < points.count; v++) if (points.getY(v) > .1) colors.setXYZ(v, color.r, color.g, color.b);
  }
  for (const y of [-.1, -.035]) {
    const geo = new THREE.TorusGeometry(.087, .009, 3, 10).toNonIndexed();
    geo.rotateX(Math.PI / 2); geo.translate(0, y, 0); tint(geo, 0x9a8056);
  }
  const headGeo = mergeGeometries(parts); parts.forEach(geo => geo.dispose());
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x493326 });
  const headMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  W.addFire = function (x, z, o = {}) {
    // 松明は小さな火口に収める。人の頭ほどの炎で笠や追手を隠さない。
    // 雨の川原一面を橙色にせず、松明と篝火の近くへ照りを収める。
    // 光の升と点光源は同じ半径を使う。持ち場の広さ・炎の目印は保つ。
    const f = addFire.call(this, x, z, {
      ...o, ...(o.torch ? { size: o.size || 0.42 } : {}),
      lightRadius: o.lightRadius ?? (o.torch ? 5 : 8),
    });
    // 脇の炎を火元へ重ねる。離れた三枚の札に見せず、大小の舌を一塊にする。
    // この戦で置く火だけ、組み立て時に既存の形の位置と幅を整える。
    for (const tongue of f.flame.children) {
      tongue.position.x *= 0.4; tongue.position.z *= 0.4;
      tongue.scale.x *= 0.8;
    }
    if (!o.torch) return f;
    const rig = new THREE.Group(), stem = new THREE.Mesh(stemGeo, stemMat);
    const h = o.h || 0.15;
    stem.scale.y = h; stem.position.y = h / 2;
    const head = new THREE.Mesh(headGeo, headMat); head.position.y = h;
    rig.add(stem, head); rig.position.set(x, this.heightAt(x, z), z);
    this.scene.add(rig); f.tedoTorch = rig;
    return f;
  };
}

// 持ち場では、近くに見えている追手へ向き直る。遠い追手を探して回らせない。
function riverFacingHint(rt, C) {
  if (!rt.flags.dp?.on || !C?.at || C.at.z >= 0 || C.isolatedT > 0 || C.breachT > 0) return false;
  if (C.faceYaw == null || !(C.nearFoes > 0 || C.frontThreat)) return false;
  // 押す列が足りない間は、向き直りより味方と並ぶ下知を先にする。
  if (C.s.tedoPush && C.allies < 3) return false;
  const radius = C.s.tedoPush ? 9 : C.s.tedoLine ? 6 : 12;
  const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
  return Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < radius &&
    Math.cos(yaw - (C.faceYaw ?? Math.PI)) < .35;
}

function riverTurnText(rt, C) {
  // 視点は横へ払った向きと逆へ回る。追手までの短い回り方を示す。
  const side = Math.sin((C.faceYaw ?? Math.PI) - rt.player.yaw - (rt.player.camYawOff || 0)) >= 0 ? '左' : '右';
  return document.documentElement.classList.contains('touch') ?
    `画面を${side}へなぞり、追手を見よ` : `マウスを${side}へ動かし、追手を見よ`;
}

function riverGuardText(push = false) {
  const control = document.documentElement.classList.contains('touch') ? '「構え」' : '右ボタン';
  return control + (push ? 'を押し続け、八秒守れ' : 'を押し続け、列を守れ');
}

function riverDangerText(rt) {
  // 渡った後に、共通の人数警告で北岸の旗へ呼び戻さない。
  return rt.flags.step === 3 ? '味方が減った。戦わず浅瀬を渡れ' :
    rt.flags.step === 4 ? '味方が減った。南岸の火で追手を止めよ' :
    '味方が減った。持ち場の火で列を守れ';
}

const tedorigawa = {
  introTaskFirst: true,
  introPeopleFolded: true, // 退き方を先に読み、人物の説明は開いて最後まで読めるようにする。
  compactIntro: true,
  contextualCoach: true, // 追手が遠い間は突きの稽古を休め、集合・持ち場・渡河の下知を読ませる。
  pauseTurnPractice: false, // 携帯の見回し待ちで使番・追手・退く下知の時計を止めない。
  dodgeTurnDuration: 3, // 大きな指の案内は短くし、持ち場と退き道を再び見せる。
  introText: () => '七尾城は落ちた。柴田勝家の旗へ集まろう。川を背に、火のそばで追手を止めよう。' +
    (document.documentElement.classList.contains('touch') ? '「構え」を押し続け、味方と槍を構えよう。' : 'マウスの右ボタンを押し続け、味方と列を守ろう。') +
    '「渡れ」の合図で、二本の旗の間から川を渡ろう。',
  keepTaskLabel: true, // 近い敵一人への案内で、持ち場を守る・川を渡る下知を消さない。
  keepFlagTravelTask: true, // 歩数で「追手へ構えよ」「列を保て」を置き換えない。
  keepFlagArrivalTask: true,
  hideArrivedDestination: true, // 持ち場に入ったら中心へ戻す矢印を畳み、追手を見る。
  keepWoundTaskLabel: true, // 軽傷でも今の火と渡河の下知を残す。深手の退く下知はこの戦で切り替える。
  recoveryTaskLabel: riverRecoveryText,
  missionDangerText: riverDangerText,
  missionDangerSpeech: riverDangerText,
  woundRetreatNeeded(rt) {
    // 渡河中は浅瀬の下知を優先する。止血後に残る足・腕の傷だけで
    // 共通の退避先へ戻さず、深手の目安はこの戦の渡河判定とそろえる。
    const u = rt.player.u;
    return rt.flags.step !== 3 && (rt.flags.step === 2 ? needsNorthRetreat(rt) : needsWoundedRetreat(u));
  },
  keepGuardTaskLabel: true, // 接敵しても、一人へ近づく案内で殿の下知を置き換えない。
  keepCombatTask: true, // 構えている間も、守る進み具合を読めるようにする。
  keepCombatTaskDetail: true, // 接敵しても、右ボタンの押し方と守る残り時間を消さない。
  hideEdgeGoalDistance: true, // 火の中心への直線歩数を、持ち場へ着いた後の下知に重ねない。
  guidanceDistanceFirst: true,
  distanceText(rt, distance) {
    const marker = rt.missionGuide?.marker;
    if (!marker) return '';
    // 働きを数える持ち場の端までを示す。中心まで歩き直させない。
    const remaining = distance - (marker.guideRadius || 8);
    const F = rt.flags;
    const place = F.step === 0 ? '集合の旗まで' : F.step === 1 ? '北岸の火まで' :
      F.step === 3 ? F.crossViaBank || F.crossEntering ? '浅瀬の入口まで' : '南岸の火まで' :
        F.step === 4 ? '南岸の持ち場まで' : '持ち場まで';
    return remaining < 0 ? '' : `${place} あと${Math.max(1, Math.ceil(remaining / .75))}歩`;
  },
  routeGuidePriority(rt) {
    const F = rt.flags;
    // 南岸では軽い出血のうちから手当てへ案内する。深手になるまで任務で隠さない。
    if (!F.ending && F.step === 4 && tedorigawa.treatmentGuideNeeded(rt)) return false;
    // 開幕の集合から火へ着いた後まで下知を優先する。共通の退避先を探すと、
    // 槍列の脇を往復させ、振り向く案内で任務と持ち場の印まで隠してしまう。
    // 包囲・深手ならこの戦の判定が浅瀬へ退かせる。矢の落下範囲の警告は共通側で残る。
    return F.ending || F.step === 0 || F.step === 1 || F.step === 3 || !!F.dp?.on;
  },
  guideMarker(rt) {
    const F = rt.flags;
    if (!rt.player.u.alive || F.ending) return null;
    if (F.shallowMarked) return 'shallow';
    if (F.dp?.on) {
      // 到着後は火へ進ませず、追手を見る場所を空ける。離れたら同じ印へ戻す。
      const C = F.dp.cur, m = rt.markers.find((mark) => mark.id === 'dp');
      if (C?.at && m?.hideNear && Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < m.hideNear) return null;
      return 'dp';
    }
    return F.step === 1 ? 'ford' : F.step === 3 ? 'crossing' : F.step === 4 ? 'south' : 'shiba';
  },
  taskText(rt, text) {
    if (rt.flags.step === 3 && text === rt.objectives.find((o) => o.id === 'main' && !o.state)?.text)
      return riverCrossingText(rt);
    const C = rt.flags.dp?.cur;
    if (text === rt.objectives.find((o) => o.id === 'dp' && !o.state)?.text) {
      // 包囲の警告を、通常の「火を守れ」より先に読ませる。
      if (rt.flags.dp?.on && C?.isolatedT > 0) return '囲まれるぞ。味方の列へ下がれ';
      if (rt.flags.dp?.on && C?.breachT > 0) return '列が切れる。味方と押し返せ';
      if (rt.flags.dp?.on && C?.s.tedoPush && C.allies < 3 &&
          !(C.isolatedT > 0) && !(C.breachT > 0) &&
          Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < 9)
        return '火のそばで味方と並べ';
      if (riverFacingHint(rt, C)) return '追手へ向き直り、槍を構えよ';
      // 本隊の渡河を終えても最後の追手は残る。渡す下知を続けず、守る理由を替える。
      if (rt.flags.dp?.on && C?.s.tedoMain && rt.flags.mainCross >= 100)
        return '本隊は渡った。殿の退き道を守れ';
      if (rt.flags.dp?.on && C?.at?.z > 0 && rt.flags.mainCross >= 100 && !rt.flags.crossRemaining)
        return '味方は渡った。南岸で追手を止めよ';
      // 追手が遠ければ、押し返す段でも待つ理由を先に伝える。
      if (rt.flags.dp?.on && C?.at && C.at.z < 0 && !C.nearFoes && !C.meleeContact && !C.melee &&
          !(C.isolatedT > 0) && !(C.breachT > 0) &&
          Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < (C.s.tedoPush ? 9 : C.s.tedoLine ? 6 : 12))
        return rt.flags.mainCross >= 100 ? '退く下知まで列を守れ' : '火で待ち、味方を渡せ';
      // 目前に追手が来たら、構えて守る働きを知らせる。
      if (rt.flags.dp?.on && C?.s.tedoPush && !rt.flags.playerHelp &&
          !(C.isolatedT > 0) && !(C.breachT > 0) &&
          Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < 9)
        return '味方と槍を構えよ';
      // 着いた後は「下がれ」を続けず、その火で守る下知へ替える。
      if (rt.flags.dp?.on && C?.s.tedoLine &&
          Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < 6)
        return '火のそばで、追手へ槍を向けよ';
    }
    if (rt.flags.dp?.on && C?.s?.tedoPush && text === '組と火へ進み、追手へ槍を構えよ' &&
        Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < 9)
      return '火のそばで、追手へ槍を構えよ';
    return text;
  },
  taskDetail(rt, _title, progress) {
    const F = rt.flags, C = F.dp?.cur;
    if (F.step === 0) return 'ほら貝が鳴った。旗のそばへ';
    if (F.step === 3 && F.failedHold) return '殿は支えきれぬ。生きて退け';
    if (F.step === 3 && rt.player.u.wounds?.bleed > 0.0001)
      return '血が出ている。戦わず南岸へ急げ';
    if (F.step === 3 && F.crossInFord) return '左右は深い。浅瀬を外れるな';
    if (!F.dp?.on || !C) return progress;
    if (C.isolatedT > 0) return `味方の列へ戻れ。あと${Math.max(1, Math.ceil(ISOLATION_LIMIT - C.isolatedT))}秒で渡る下知`;
    if (C.breachT > 0) return '火のそばで列を立て直せ';
    // 上段は行うこと、下段は渡る本隊の様子。同じ下知を二度重ねない。
    if (progress === '本隊が渡り始めた。組と火を守れ') return '本隊が渡り始めた';
    if (progress === '本隊は川の中。組と火を守れ') return '本隊は川の中';
    if (progress === '本隊の後続が渡る。組と火を守れ') return '本隊の後続が渡る';
    if (progress === '本隊は渡った。下知まで列を保て') return '本隊は渡った。殿の退き道を守れ';
    return progress;
  },
  wakeOK: (rt) => rt.flags.step >= 1 && rt.t >= 30, // 落城の知らせと退く下知より先に、近くの備えを戦わせない。
  botOrders: true, // 殿の持ち場・退避・渡河を、遊び手の突進で上書きしない
  frontlineDensity: {
    // 寄せる順と行き先はこの戦の下知で決める。接敵を増やす共通処理が、
    // 待機中の後続や押し返された列まで本人へ呼び、退き道を埋めないようにする。
    gap: false,
    canSend: (_rt, g) => !g.tedoFrom || g.tedoActive && !g.tedoRelieved,
  },
  jinkei: JIN,
  noAllyReports: true, // 遠い武将の独り言を使番に読み直させない。下知はこの戦の使いが届ける。
  noTaisho: true, // 本人と護衛はこの戦で置く。謙信の討取りで決着させない。
  teamSignsOnly: true, // 丸と三角で両軍を示す。屈む兵や騎馬を立った足軽の線で覆わない。
  noUnitContrast: true, // 自分も足元の印で見分ける。体とずれる白い人型を重ねない。
  nearbyEnemySignRange: 24, // 遠い追手の刀印を味方の槍列へ重ねず、近づいた敵だけ示す。
  compactPlayerSign: true, // 本人は小さな足元の輪とひし形で見分ける。
  playerSignScale: 0.3, // 雨夜の足元を白い輪で覆わず、本人を見分ける印だけ残す。
  playerSignMinScale: 0.3, // 小さい下限も指定し、共通の下限で元の大きさへ戻されないようにする。
  playerSignBodyScale: 0, // 足元の小輪を残し、具足に白い人型の絵を重ねない。
  compactDestinationArea: true, // 持ち場の円が画面を覆う時は省く。到着の判定と旗は残す。
  compactHoldGuide: true, // 待機中も持ち場全体を大輪で囲まず、地面の小旗で待つ場所を示す。
  compactDestinationSign: true, // 火へ退く印を小さくし、追手の姿を空ける。
  compactRetreatSign: true,
  compactDodgeGuide: true, // 矢を避ける輪も小さくし、殿の持ち場の大きさと混同させない。
  singleRetreatArrow: true, // 渡り口や回避先までの点線を、一本の短い矢印にまとめる。
  keepTaskWithDodge: true,
  keepTaskWithGuard: true, // 回避札と構えの札が同時に出ても、殿の下知を選ぶ。
  keepTaskWithRain: true, // 矢をよけた後の持ち場・渡河の下知も一行残す。
  dodgeActionHalfWidth: 116, // 短い操作文に合わせ、携帯の左下を覆う札を狭める。
  dodgeActionText: '長押しで よける',
  // 回避先へ動く下知と、その後に持ち場へ戻る下知を一文で混ぜない。
  escapePlaceLabel: (rt, rain, side) => rt.flags.step === 3 ? `${side}へよけ、南岸へ` :
    rain ? `${side}へ動き、矢をよけよ` : `${side}の味方へよけよ`,
  keepDodgeGuideLabel: true, // 画面外でも「旗まで何歩」だけにせず、矢をよける理由を残す。
  dodgeMoveCaption: (rt, side, rain) => rt.flags.step === 3 ? `${side}へなぞり、浅瀬へ` :
    rain ? `${side}へなぞり、矢をよけよ` : `${side}へなぞり、味方の列へ`,
  rainDodgeGuideLabel: (rt, arrived) => rt.flags.step === 3 ? '矢をよけ、浅瀬を進め' :
    arrived ? rt.flags.step === 0 ? '矢をよけたら、柴田の旗へ' : '矢をよけたら、持ち場の火へ' : '矢が来る。印の方へ動け',
  dodgeGuideLabel: (rt, arrived) => rt.flags.step === 3 ? riverCrossingText(rt) :
    arrived ? '追手へ構え、列を守れ' : '味方の列へ下がれ',
  dodgePointAllowed: (rt, point) => rt.world.waterDepthAt(point.x, point.z) <= DEEP_LIMIT,
  keepRetreatReason: true,
  keepRetreatGestureReason: true, // なぞる向きは補足に残し、上段の渡河・退避の下知を消さない。
  keepWoundRetreatReason: true, // 出血時にも理由と火への下知を残し、「この旗」だけに替えない。
  retreatGuideLabel: (rt) => rt.flags.step === 3 ? riverCrossingText(rt) : '味方と火のそばへ下がれ',
  retreatDestinationLabel(rt) {
    if (rt.flags.step !== 3) return '持ち場の火へ';
    crossingTarget(rt);
    return rt.flags.crossViaBank || rt.flags.crossEntering ? '二本の旗の間へ' : '浅瀬を通って南岸へ';
  },
  treatmentGuideNeeded(rt) {
    // 渡河中に手当ての場所を探すと、浅瀬から外れる。岸に着いてから案内する。
    const p = rt.player;
    return rt.flags.step !== 3 && p.treatmentLeft > 0 &&
      (p.u.wounds?.bleed > 0.0001 || p.u.hp < p.u.maxHp * .6);
  },
  treatmentMoveCaption: '丸から印へ なぞって下がる',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treating) return '手当てを押し続けよ';
    if (p.treatmentReady) return '「手当て」を三秒長押し';
    if (!cue?.valid) return '味方の後ろへ下がれ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '手当ての印へ下がれ';
    if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return '足を止め、手当てを待て';
  },
  singleDestinationArrow: true, // 同じ火へ向かう道筋と矢印を重ねない。
  subtleTargetFrames: true,
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    return rt.flags.step === 0 ? '柴田勝家の旗へ' : rt.flags.step === 1 ? '北岸の火へ' :
      rt.flags.step === 3 ? '幟の間から南岸へ' : '持ち場の火へ';
  },
  rearThreatFrame: true,
  enemyCornerGuide: true, // 敵の胴を太い箱で覆わず、細い四隅で攻防を見せる。
  groundCombatMarkers: true, // 足元の大きな金の輪を、小さな地面の印へ替える。
  compactCombatGuides: true, // 相手への向きも小さな矢印にし、槍先を隠さない。
  groundLockRing: true, // 川原の起伏へ狙いの輪を沿わせる。
  pauseRetry: true, // 重傷後にやり直しを選ぶ間、残る殿の戦況を進めない。
  edgeBehindWaymarks: true, // 背後の渡り口の札は端へ寄せ、本人と追手の姿を空ける。
  reserveCombatCues: true, // 行き先の札は、気力や間合いの字も避ける。
  avoidWaymarkThreats: true, // 追手の予告札も、行き先の旗と振り向く案内を避ける。
  standardClothScale: 0.72, // 持ち場へ寄っても、隊旗の布で追手の顔と槍先を隠さない。
  groundStandards: true, // 走る旗持ちの体に竿を傾けず、川原へ根元を合わせる。
  nearSpearFade: false, // 八歩以内の槍をまとめて縮めず、視線を塞ぐ柄だけ既存の判定で避ける。
  nearLongWeaponRadius: 10, // 後列から視点へ差し込む長柄と旗竿も、描く間だけ避ける。
  nearGroundSpearRadius: 12, // 落ち槍の持ち手が離れていても、目前へ届く長柄を拾う。
  nearGroundSpearClearance: 3, // 視線より下で退き道を横切る落ち槍も、描く間だけ避ける。
  nearHoroRadius: 5.5,
  nearCourierHoroHide: false, // 使番の一体の母衣から布だけを消さず、竹籠と布をそろえて残す。
  nearHoroWhole: true, // 目の前の母衣は布と籠をまとめて避け、体と当たりは保つ。
  nearHoroMergedFadeRadius: 3.8, // 遠目用の具足と一体の母衣も、視点のすぐ前だけ避ける。
  nearAllyWholeOcclusion: true, // 本人を隠す味方は描く間だけ全身を避け、鎧の内側を大写しにしない。
  nearAllySolidBody: true, // 視線の外の兵は透かさず、目が体へ入る距離だけ避ける。
  nearAllyFadeRadius: 2, // 馬の胴と母衣は徒歩の肩幅より広い。視点のすぐ横から覆う姿も避ける。
  nearAllySightWidth: 1.4, // 近景の騎馬が本人の脇へ重なる時も、描く間だけ視線を空ける。
  nearAllyHorseFade: true, // 騎手より低い視点も馬の胴で拾う。
  nearHatFadeRadius: 1.8, // 目のすぐ前の笠だけ透かす。数歩先の兵まで顔が笠を突き抜けた姿にしない。
  nearFlagFadeRadius: 6,
  fadeCloseStandards: true,
  fadeCloseStandardFrame: true, // 手前の味方の大旗は竿と横木も薄め、追手を見る窓を空ける。
  noDespair: true, // 開幕は肩越しに川と味方の旗を見る。遠い敵への共通の見せ場で退き道を隠さない。
  noticeLimit: 2, // 任務と台詞を先に出し、操作の札で退き道を塞がない。
  taskDetails: true, // 一撃・受け止め・持ち場へ戻るなど、いまの働きも携帯に残す。
  immediateTaskChanges: true, // 同じ任務の札でも、退く下知に替わったらすぐ見せる。
  noDistantBattle: true, // 備えにない軍勢を自動で追加しない。
  civilianCrowd: { bands: PEOPLE_BANDS }, // 民は兵の名簿・戦功・渡河人数に入れない。
  noWake: false, // 近くの軽い兵は同じ場所で本物へ替え、遠くへ戻せる兵の枠を回す。
  wakeRoom: 240, // 本人・供の余地を残し、共通の二百五十人の上限内で替える。
  // 初めの集合先は北の柴田の旗。旗を正面にして、背後を探させない。
  spawn: { x: 6, z: -48, heading: Math.PI },
  world: {
    namedKacchu: TEDORIGAWA_KACCHU,
    seed: 15777,
    moveLim: 230,   // 置いた兵が 176 の端に貼り付いていた（見回り 10/2）
    time: 'night',
    nightLift: 2.3, // 雨雲の夜に刈田全体を昼のように持ち上げず、火と近くの列を目じるしにする。
    nightFill: 0.45,
    drawTimeUnitParts: true, // 移動後の骨と具足を描く時にそろえ、手を離れた槍の束や浮く笠を残さない。
    lifeSizePinnedArrows: true, // 胴や骨の倍率を刺さった矢へ重ねず、飛来時の長さを保つ。
    pinnedArrowAxisScale: true,
    fullTipMatrices: true, // 遠い騎手も手首と指を同時に動かし、古い指先へ皮膚を引き伸ばさない。
    movingHiddenBones: true, // 画面外へ動く騎手も骨を根元へ合わせ、近景へ戻る時の体の帯を防ぐ。
    shadowBoneOrder: true, // 胴丸の影にも、体と同じ骨番号を使う。
    kasaDrape: false, // 資料本の戦国期の足軽に合わせ、映画風の長い陣笠の縁布を外す。
    unitNightScale: 0.4, // 雨雲の下で全身の縁を白く光らせず、漆と小袖の色を残す。
    // 加賀の川原の遠山。東〜南東の山地へ寄せ、西の日本海側を開く。
    mountainScale: 0.22,
    mountainHaze: 0.8,
    roundedFire: true,
    smoothGroundFire: true, // 火の届く距離を地面の画素で測り、橙色の三角の板をなくす。
    fieldStage: 'stubble', // 秋の刈田は推定。春の苗を置かない。
    tuftTint: 0x8a8067, // 雨夜の刈り株を白い花畑にしない。
    muddy: 1,
    softPathSoil: true, // 土と泥の境をぼかす。地形の格子や描画の数は増やさない。
    stableSlopeGrain: true, // 川岸の細かな起伏で泥の模様の向きを切り替えない。
    subtleMudRelief: true, // 並んだ窪みの濃淡を抑え、踏まれた泥だけに残す。
    livingSpearHedge: true, // 穂先の高さを保ち、人ごとの呼吸と押し返しをずらす。
    contactFalls: true, // 倒れ始めではなく、胴が地へ着いた瞬間に重みを鳴らす。
    groundedFalls: true,
    slopeLitter: true, // 川岸に落ちた武具は、握りの前後の高さへ合わせる。
    longitudinalSpearFalls: true, // 長柄の石突と穂先で傾きを測り、中央の法線で宙へ持ち上げない。
    settleSideFalls: true, // 横斬りのひねりを途中に残し、最後は肩から地へ寝かせる。
    fallPaceSpread: 0.32, // 同時に倒れても、膝が抜ける間までそろえない。
    rainSplashScale: 0.4, // 雨夜の小さな跳ね。白い草のような冠にしない。
    naturalArrowRain: true, // 雨夜の矢を、空に太い黒線を描く見せ方にしない。
    arrowRainPerBow: 1, // 六人の弓衆から数十本の飾り矢を重ねない。本物の矢と当たりは残す。
    arrowRainGroundCue: false, // 追手を白黒の大輪で囲まない。矢音・影・警告と回避先は残す。
    noGroundArrows: true, // 雨の川原を白い矢羽の林にしない。飛ぶ矢・被害・体や楯の矢は残す。
    waterSlow: true,
    clothFolds: true,
    ordinaryFlagStride: 3, // 無名の長柄足軽の指物を間引き、追手の槍先と列の隙間を見せる。
    longHoro: 'round', // 前田の赤母衣は、背の竹籠に布を張った丸い形を使う。
    // 渡り口は遊び用の復元。深みは止め、浅瀬には水深に応じた減速を使う。
    riverCross: false,
    // 共通の川床の浅瀬は約三十五センチ。広い川床を残し、列の幅だけを狭める。
    streams: [{ pts: RIVER, w: 24, depth: 1.6, fords: [{ x: 2, w: 12 }],
      levelAt: (x) => 0.05 + x * 0.0006 }],
    closeCombatAssist: true,
    paths: [[[0, -200], [2, -60], [FORD.x, FORD.z], [SOUTH.x, SOUTH.z], [6, 160]], ...PEOPLE_PATHS],
    height,
    // 川原の色も北西へ続く川筋に沿わせる。東西の帯を残さない。
    tint(x, z, h, c) { if (distToPolyline(x, z, RIVER) < 17) c.lerp(RIVER_TINT, 0.4); },
    // 両本陣の幕と井楼の足元に樹木を重ねない。乱戦の兵と隊列の密度はそのまま。
    clear: (x, z) => (Math.abs(x) < 110 && z > -120 && z < 80) ||
      Math.hypot(x - 34, z - 104) < 27 || Math.hypot(x - 64, z + 206) < 27 || peopleClearing(x, z),
    trees: 320,
    get tufts() { return 5200; },
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -60, z: -60, r: 12, n: 16 }, { x: 70, z: -40, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -150,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 止血の行き先と実際の長押しを同じ条件にする。川中で布を巻かせず、
    // 渡った者を北岸の護衛へ呼び戻さない。この戦の本人だけに適用する。
    const treatmentShelter = rt.player.treatmentShelter;
    rt.player.treatmentShelter = function (pos) {
      if (W.inWaterAt(pos.x, pos.z) || F.step >= 4 && pos.z < 28) return false;
      return treatmentShelter.call(this, pos);
    };
    // 出陣の札を読む間は世界の更新が止まる。初期値の白い霞を雨夜の霧へ合わせる。
    W.mountU.hazeCol.value.copy(rt.scene.fog.color);
    // 雨夜の葉を雪色に浮かせない。この戦で作った葉の材質だけを一度染める。
    // 幹・影用の材質・他の戦は変えず、近景と遠景で共有する材質も一度だけ扱う。
    const wetLeaves = new Set();
    for (const tree of [...(W.treeMeshes || []), ...(W.farTreeMeshes || [])]) {
      const mat = tree.material;
      if (!tree.userData.treeFoliage && !mat?.alphaTest) continue;
      if (!mat?.color || wetLeaves.has(mat)) continue;
      wetLeaves.add(mat);
      mat.color.multiplyScalar(0.48);
      if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 0.05;
    }
    // 下流の扇状地を山の輪で囲まない。既存の三層と頂点を初期化時だけ整える。
    // 白山側（東〜南東）を残す。局地の方角の補完で、当時の山容の実測ではない。
    for (const mountain of W.mountains.children) {
      const pos = mountain.geometry.attributes.position, uv = mountain.geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), radius = Math.hypot(x, z);
        const t = Math.max(0, Math.min(1, ((x + z * 0.6) / radius - 0.05) / 0.75));
        const y = -12 + (pos.getY(i) + 12) * t * t * (3 - 2 * t);
        pos.setY(i, y); uv.setY(i, y);
      }
      pos.needsUpdate = uv.needsUpdate = true;
      mountain.geometry.computeVertexNormals();
      mountain.geometry.computeBoundingSphere();
    }
    // 手取川だけ、任務の本文と補足を縦に積む。補足の幅で本文を一文字幅へ押し込まない。
    const style = document.createElement('style');
    style.textContent = `
      /* 回避・構えの間も下知を一行残す。操作の札と同じ補足は畳む。 */
      html body #hud.tedo-notices:is(.dodge-active,.rain-danger,.wait-guard-active) #battle-notices #objectives:not(.expand):not([hidden]):not(.notice-muted),
      html body #hud.tedo-notices:is(.dodge-active,.rain-danger,.wait-guard-active) #battle-notices #objectives:not(.expand) :is(#obj-list,li.cur .obj-text,li.cur .obj-now) {
        display:block !important;
      }
      html body #hud.tedo-notices:is(.dodge-active,.rain-danger,.wait-guard-active) #battle-notices #objectives:not(.expand) li.cur small {
        display:none !important;
      }
      html body #hud.tedo-notices #battle-notices #objectives:not(.expand) li.cur {
        display:block !important; min-width:0; width:auto; height:auto; max-height:none;
      }
      html body #hud.tedo-notices #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
        display:block; min-width:0; width:auto; max-width:100%;
        white-space:normal !important; overflow-wrap:anywhere; line-height:1.5 !important;
      }
      html body #hud.tedo-notices #battle-notices #objectives:not(.expand) li.cur::before { display:none; }
      @media (min-height:501px) {
        html body #hud.tedo-notices.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
        html body #hud.tedo-notices #battle-notices:not(.choosing) {
          left:16px !important; right:auto !important; top:104px !important;
          width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
        }
        html body #hud.tedo-notices #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; min-width:0; max-width:100%; box-sizing:border-box; flex:0 0 auto;
        }
        html body #hud.tedo-notices #intro[data-battle="tedorigawa"] > .card.card {
          width:min(560px, calc(100vw - 32px)); height:min(680px, 80dvh);
          max-height:80dvh !important;
        }
      }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .intro-reading {
        flex:1 1 auto; min-height:0; overflow-y:auto; touch-action:pan-y; pointer-events:auto;
        overscroll-behavior:contain; padding-bottom:16px; scroll-padding-bottom:16px; scrollbar-gutter:stable;
      }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .intro-reading p { margin:12px 0; }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .card .date { letter-spacing:.08em; }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .intro-people summary {
        box-sizing:border-box; min-height:44px; padding:10px 8px; margin-top:8px;
        color:#f2cd72; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6;
        text-decoration:underline; cursor:pointer;
      }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .intro-people summary:focus-visible {
        outline:3px solid var(--kin); outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
      }
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] #intro-go { flex-shrink:0; }
      @media (max-height:500px) {
      html body #hud.tedo-notices #intro[data-battle="tedorigawa"] .intro-reading p { margin:6px 0; }
      html body #hud.tedo-notices #battle-notices #objectives#objectives:not(.expand) #obj-list li.cur .obj-now {
        font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
      }
      /* 任務表示中の共通の高さ制限にも勝たせ、本文・補足・距離を途中で切らない。 */
      html body #hud.tedo-notices.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
      html body #hud.tedo-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        left:max(12px, env(safe-area-inset-left, 0px)) !important; right:auto !important;
        top:max(12px, env(safe-area-inset-top, 0px)) !important;
        width:min(304px, 36vw) !important; transform:none !important;
        max-height:min(40vh, calc(100% - 12px - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px)))) !important;
      }
      html body #hud.tedo-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) > :is(#objectives,#battle-message) {
        position:relative !important; inset:auto !important; transform:none !important;
        width:100% !important; min-width:0; max-width:100%; box-sizing:border-box; flex:0 0 auto;
      }
      /* 地面の印用・片手案内用の共通指定より優先し、殿の下知を左上の幅で読む。 */
      html:root body #hud.tedo-notices #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
        position:relative !important; inset:auto !important; transform:none !important;
        width:100% !important; max-width:100% !important; height:auto !important;
        max-height:none !important; box-sizing:border-box;
      }
      html:root body #hud.tedo-notices #battle-notices #objectives#objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
        width:100% !important; max-width:100% !important; box-sizing:border-box;
        word-break:normal !important; line-break:strict;
      }
    }`;
    document.head.appendChild(style); rt.hud.root.classList.add('tedo-notices');
    const dispose = rt.dispose;
    rt.dispose = function () {
      style.remove(); this.hud.root.classList.remove('tedo-notices');
      this.dispose = dispose; return dispose.call(this);
    };
    riverSoldiers(rt);
    // 描く直前にも体の形が替わるため、最後の骨の倍率で矢の長さをそろえる。
    const beforeDraw = rt.scene.onBeforeRender;
    rt.scene.onBeforeRender = function (renderer, scene, camera, target) {
      beforeDraw.call(this, renderer, scene, camera, target);
      rt.army.syncPinnedArrowScales();
    };
    riverRear(rt);
    riverTorches(W);
    riverVillage(rt);
    // 近くの草も川筋から外す。増水後や格子の境目に白い草の先を残さない。
    const grassAt = W.grassAt;
    W.grassAt = function (x, z) {
      return distToPolyline(x, z, RIVER) < 26 ? 0 : grassAt.call(this, x, z);
    };
    W.nearCell = null;
    if (W.nearGrass) W.nearGrass.material.color.setHex(W.def.tuftTint);
    riverZones(rt);
    F.rescued = true; // 倒れてから担ぎ起こして戦へ戻さない。
    W.setRainTarget(0.9);   // 夜の明るさと雨を分ける。昼の雷雨の空にはしない。
    W.rainLevel = 0.9; // 増水した川の退き口は、出陣時から雨夜。
    // 雨量と増水は保ち、月明かりのない夜の雨筋を白い傷にしない。
    W.rain.material.color.setHex(0x667680);
    W.rainNear.material.uniforms.color.value.setHex(0x74828b);
    W.splashPts.material.color.setHex(0x7d898d);
    W.splashPts.material.opacity = 0.18;
    // 厚い雨雲の夜に、雲の手前の星と月を描かない。この戦の材質だけに適用。
    if (W.stars) W.stars.material.opacity = 0;
    if (W.moon) W.moon.material.opacity = 0;
    // この川だけ、濁りと波筋を流木・兵の流れる北西向きにそろえる。
    const riverMesh = W.def.streams[0].mesh;
    if (riverMesh) {
      // 世界の座標で塗る。粗い水面の頂点色では浅瀬の幅が深みへにじむ。
      const mat = riverMesh.material, ripple = mat.onBeforeCompile;
      mat.color.setHex(0x89918a);
      mat.roughness = 0.9;
      mat.envMapIntensity = 0.06;
      mat.onBeforeCompile = function (sh, renderer) {
        ripple.call(this, sh, renderer);
        // 軽い材質の空の反射も雨夜へ。世界の半球光の色は共有して変えない。
        sh.uniforms.uWaterSky.value = new THREE.Color(0x29343b);
        // 砂色は足の届く中央の川床に合わせる。
        sh.uniforms.uTedoFord = { value: 8 };
        sh.fragmentShader = 'uniform float uTedoFord;\n' + sh.fragmentShader;
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          // 砂の色の境だけを崩す。通れる浅瀬の幅と深さは変えない。
          float fordEdge = sin(vWPw.z * 0.7) * 0.35 + sin(vWPw.z * 1.9) * 0.18;
          float ford = 1.0 - smoothstep(uTedoFord - 3.0, uTedoFord, abs(vWPw.x - 2.0) + fordEdge);
          // 川筋に沿って流れる濁りと短い波頭。川床・水位・当たりは動かさない。
          vec2 flow = normalize(vWaterFlow + vec2(0.00001));
          float along = dot(vWPw.xz, flow) - uTime * 1.4;
          float across = dot(vWPw.xz, vec2(-flow.y, flow.x));
          float silt = texture2D(tMacro, vec2(along * 0.055, across * 0.24)).r;
          float crest = sin(along * 3.6 + sin(across * 1.7) * 1.1);
          float broken = smoothstep(0.52, 0.72, silt);
          // 浅瀬は細かい波、深みは崩れる波頭。色だけに頼らず渡る筋を見分ける。
          float foam = smoothstep(0.86, 1.0, crest) * broken * (1.0 - ford * 0.7);
          float nearWater = 1.0 - smoothstep(35.0, 95.0, length(vWPw - cameraPosition));
          // 線形の明るさで控える。雨夜の川を白い氷の板にしない。
          vec3 riverColor = mix(vec3(0.025, 0.038, 0.033), vec3(0.13, 0.105, 0.065), ford);
          riverColor *= 0.7 + silt * 0.6;
          riverColor = mix(riverColor, vec3(0.22, 0.24, 0.20), foam * nearWater * 0.15);
          diffuseColor.rgb = riverColor;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += riverColor * 0.04;`);
      };
      mat.customProgramCacheKey = () => '手取川の雨夜の浅瀬と濁流';
      mat.needsUpdate = true;
      const flow = riverMesh.geometry.attributes.waterFlow;
      if (flow) { for (let i = 0; i < flow.array.length; i++) flow.array[i] *= -1; flow.needsUpdate = true; }
    }
    F.step = 0; F.ek = 0; F.ak = 0; F.crossRemaining = 30;
    F.pushTime = 0; F.reliefUntil = 0; F.mainCross = 0; F.heldNorthLine = false;
    // この戦の声だけを整理する。運ぶ下知と隊の移動は止めない。
    const say = rt.say, spoken = new Map();
    const fleeingLines = new Set(['敵が逃げた！　勝手に持ち場を離れるな！', '追い散らすな！　槍の列を保て！', '敵は逃げ腰じゃ！　まず備えを固めろ！']);
    rt.say = function (who, text, dur) {
      if (who === '使番' && /殿より。[「『]/.test(text)) return;
      // 局地の敵が逃げても、退き太鼓の後に共通の居残りの下知を重ねない。
      if (F.step === 3 && who === '柴田勝家' && fleeingLines.has(text))
        text = '深追いするな！　幟の間を渡り、南岸の火へ退け！';
      const key = String(text).replace(/[\s、。！!？?「」]/g, '');
      if (rt.t - (spoken.get(key) ?? -Infinity) < 8) return;
      spoken.set(key, rt.t);
      return say.call(this, who, text, dur);
    };
    const hudSay = rt.hud.say;
    rt.hud.say = function (who, text, dur, urgent, detail) {
      const regret = /無念/.test(text);
      if (regret && F.regretHeard) return false;
      const accepted = hudSay.call(this, who, text, dur, urgent, detail);
      if (regret && accepted) F.regretHeard = true;
      return accepted;
    };
    // 離れた組頭の傷だけで、目の前が危ないとは知らせない。
    const noticePush = rt.hud.notices.push;
    rt.hud.notices.push = function (text, priority, seconds, kind, valid) {
      // 退き口の殿へ、共通の大将討取りの案内を重ねない。
      if (text.includes('敵の大将が前へ出た')) text = F.step === 3 ?
        '追手の大将が出た。列を離れず、浅瀬を渡れ' : '追手の大将が出た。味方と火のそばを守れ';
      // 矢の危険は下知と同じ二枠へ。別の中央札で任務を覆わない。
      if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢が降る|岸に射手/.test(text) &&
          rt.t < (F.rainNoticeUntil || 0) && text !== '矢が降る！　横へよけよ') return;
      if (text.startsWith('血が止まらない') || text === '味方の後ろで休もう' ||
          text === '味方の列の後ろへ退け。布を巻く間は動けない') {
        // 川の中で止血を促さない。岸で出た古い助言も、渡る下知で畳む。
        text = F.step === 3 ? '血が出ている。川では止まらず、南岸の味方へ退け' :
          rt.player.treatmentLeft <= 0 ? '布は使い切った。味方の後ろへ退け' :
          rt.player.treatmentNext > rt.t ? '味方の後ろへ退け。次の手当てまで休め' :
          '味方の後ろへ退け。「手当て」を三秒長押し';
        const before = valid, step = F.step;
        valid = () => F.step === step && (!before || before());
      }
      if (kind === 'warn' && text.startsWith('危ない！')) {
        if (!F.nearThreat) return;
        text = F.step === 3 ? '追手が迫る！　浅瀬を渡り、南岸の火へ' :
          F.step === 2 ? '味方の列へ寄れ！　追手へ槍を向けよ' : '追手が迫る！　組頭のそばへ';
        const before = valid;
        const step = F.step;
        valid = () => F.step === step && F.nearThreat && (!before || before());
      }
      return noticePush.call(this, text, priority, seconds, kind, valid);
    };
    // 歩けない深みを回避先にしない。途中の道も共通の探索が同じ判定で調べる。
    rt.army.hooks.rainEscapePointAllowed = (point) => tedorigawa.dodgePointAllowed(rt, point);
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || rt.t < 5 || rt.over || F.ending || !rt.player.u.alive ||
          rt.t < (F.rainNoticeAt || 0)) return;
      F.rainNoticeAt = rt.t + 8; F.rainNoticeUntil = rt.t + volley.T + 0.4;
      rt.hud.notices.push('矢が降る！　横へよけよ', 110, volley.T + 0.4, 'warn',
        () => !F.ending && !rt.over && rt.player.u.alive);
    };
    // 古い札は記録へ残し、いま読む未読の札は新しい三件まで。
    const updateLogEntry = rt.hud.updateLogEntry;
    rt.hud.updateLogEntry = function () {
      let unread = 0;
      for (let i = this.orderLog.length - 1; i >= 0; i--) {
        const line = this.orderLog[i];
        if (!line.read && rt.t - line.t < 60 && ++unread > 3) line.read = true;
      }
      return updateLogEntry.call(this);
    };
    F.ford = { width: 8, capacity: 24, inside: 0, queue: 0, pressure: 0, jam: 0, cargoUntil: 0 };
    // 渡る口は毎秒の数えで入れる人数を決める。兵の行き先は使い回す。
    W.def.moveWay = (army, u, want) => {
      if (u.team !== 0 || F.ending || u.pos.z < -42 || u.pos.z >= -24 || want.z <= -24 ||
          u.tedoAdmitUntil > rt.t || Math.abs(u.pos.x - 2) > 12) return want;
      const q = u.tedoWait;
      if (!q) return want;
      q.x = Math.max(2 - F.ford.width / 2, Math.min(2 + F.ford.width / 2, u.pos.x));
      q.z = Math.min(u.pos.z, -25);
      return q;
    };
    // 岸の石と接地の影は、それぞれ一つの描画で置く。
    const shape = new THREE.Object3D();
    const stones = new THREE.InstancedMesh(rockShape(),
      new THREE.MeshLambertMaterial({ vertexColors: true }), 72);
    // 接地の影は一枚の絵を使い回す。影用の光や描画の回数を兵ごとに増やさない。
    const shadowCloth = document.createElement('canvas'); shadowCloth.width = shadowCloth.height = 64;
    const shadowInk = shadowCloth.getContext('2d'), shade = shadowInk.createRadialGradient(32, 32, 4, 32, 32, 32);
    shade.addColorStop(0, 'rgba(15,18,20,0.5)'); shade.addColorStop(1, 'rgba(15,18,20,0)');
    shadowInk.fillStyle = shade; shadowInk.fillRect(0, 0, 64, 64);
    const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCloth), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 72);
    for (let i = 0; i < 72; i++) {
      // 石積みの護岸に見える等間隔の列を避け、両岸の砂礫州へ散らす。個数は保つ。
      const x = -210 + Math.floor(i / 2) * 12 + Math.sin(i * 2.17) * 4;
      const z = 2 + x * 0.1 + (i % 2 ? 29 : -27) + Math.sin(i * 1.73) * 5;
      shape.position.set(x, W.heightAt(x, z) - 0.06, z);
      shape.rotation.set(Math.sin(i) * 0.12, i * 1.3, 0.1);
      shape.scale.set(0.6 + i % 3 * 0.25, 0.6 + i % 4 * 0.12, 0.7);
      shape.updateMatrix(); stones.setMatrixAt(i, shape.matrix);
      shape.position.set(x, W.heightAt(x, z) + 0.035, z);
      shape.rotation.set(-Math.PI / 2, 0, i * 1.3);
      shape.scale.set(0.85 + i % 3 * 0.25, 0.95, 1);
      shape.updateMatrix(); shadows.setMatrixAt(i, shape.matrix);
    }
    rt.scene.add(stones, shadows);
    // 川の中の白く光る杭は残さず、両岸を布と紋のある幟で示す。
    for (const z of [-26, 30]) for (const x of [-6, 10]) rt.scene.add(nobori(W, x, z, 'oda', 4.2));
    F.postFlag = nobori(W, RG.x - 3, RG.z + 1, 'kari', 3.4);
    F.postFlag.visible = false; rt.scene.add(F.postFlag);
    // 雨夜を保ち、甲冑と馬の輪郭に月明かりを足す。影の計算は増やさない。
    rt.scene.add(new THREE.HemisphereLight(0xb6c9ec, 0x645943, 0.85));
    // 敗走中に共通の救済兵を足元へ出さない。
    rt._rfN = 3;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { river: 'HIST_A', flood: 'HIST_B', honjinOda: 'HIST_B', mizushima: 'HIST_B', honjinUesugi: 'GAME_C', fordMain: 'GAME_C' };
    // 北岸の退き口。水島の陣所を川岸の数十歩先と確定しない。
    // ---- 北の岸の陣（払いかけ） ----
    // この地点で確かめられない小屋を置かず、払いかけの陣は旗と荷駄で示す。
    rt.scene.add(tawara(W, -14, -64, 0.3, 5), tawara(W, 20, -60, -0.2, 4));
    F.cargo = tawara(W, 8, FORD.z - 2, 0.2, 4); rt.scene.add(F.cargo);
    // 柴田の雁金、丹羽の筋違、前田の梅鉢を各備えの両脇へ並べ、中央の渡河列を空ける。
    for (const [x, z, mon] of [[0, -64, 'kari'], [-30, -60, 'sujikai'], [32, -62, 'maeda']])
      for (const side of [-1, 1]) rt.scene.add(nobori(W, x + side * 8, z, mon, 5.4));
    // 丹羽の備えの脇に、伝承の「竹に金の短冊」の馬印を補う。
    // 当日の使用と配置は未確認。払いかけの陣の据物として置き、渡河列・斬り合う兵は保つ。
    // 結合済みの形と材質を使い回し、更新処理や当たりは足さない。
    const niwaUma = new THREE.Mesh(umaGeometry(NAMED_GEAR['丹羽長秀'].campUma),
      niwaUmaMat || (niwaUmaMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })));
    niwaUma.position.set(-37, W.heightAt(-37, -63) - .9, -63);
    niwaUma.castShadow = true; rt.scene.add(niwaUma);
    // ---- 総大将の護衛、丹羽・前田の渡河列 ----
    // 信長公記巻十の北国出陣名簿にある四将を、既存の侍四人と置き換える。
    // 氏家左京亮・原彦二郎も同書の出陣衆。足軽二人を侍二人へ替え、戦う総数は保つ。
    // 柴田・丹羽の列と殿への配置は退き口を描く補い。個人の旗・馬印は未確認なので足さない。
    F.shiba = allyGroup(rt, { fixed: true, name: '柴田勝家の手', anchor: { x: 0, z: -66 }, facing: 0, width: 14, aggro: 3, noRout: false, formation: 'column', colW: 2 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, flag: 'kari' } },
        { type: 'samurai', n: 1, o: { name: '不破光治', flag: null } }, { type: 'samurai', n: 1, o: { name: '佐々成政', flag: 'shuro' } },
        { type: 'samurai', n: 1, o: { name: '金森長近' } }, { type: 'samurai', n: 1, o: { name: '原彦二郎', flag: null } }, { type: 'ashigaru', n: 17 }, { type: 'ashigaru', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    shelterGeneral(F.shiba, F.shibaU);
    F.others = [
      allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: -30, z: -60 }, facing: 0, width: 12, aggro: 3, noRout: false, formation: 'column', colW: 2 }, dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, flag: 'sujikai' } }, { type: 'samurai', n: 1, o: { name: '氏家直昌', flag: null } }, { type: 'ashigaru', n: 13 }], ODA)),
      allyGroup(rt, { fixed: true, name: '前田利家の手', anchor: { x: 32, z: -62 }, facing: 0, width: 12, aggro: 3, noRout: false, formation: 'column', colW: 2 }, dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], { flag: 'maeda' })),
    ];
    for (const g of F.others) shelterGeneral(g, g.units[0]);
    for (const g of [F.shiba, ...F.others]) { g.defMult = 1; g.dmgMult = 1; }
    // 殿だけは二十人を保つ。敗走の連鎖を防ぎ、白兵の傷を軽くする。討死は残る。
    F.rear = allyGroup(rt, { fixed: true, fullStrength: true, noRout: true, defMult: 1.8, name: '柴田の殿', anchor: { x: 0, z: -52 }, facing: Math.PI, width: 14, aggro: 6, seekRange: 16, formation: 'yari', yariRanks: 3 },
      // 公記巻十の稲葉伊予・伊賀伊賀守を、既存の侍と同数で置き換える。
      // 殿・弓組への配置は創作。個人の旗・馬印は補わず、斬り合う人数と兵種を保つ。
      dress([{ type: 'samurai', n: 1, o: { name: '斎藤利治', flag: null } }, { type: 'samurai', n: 1, o: { name: '稲葉良通', flag: null } }, { type: 'ashigaru', n: 18 }], ODA));
    F.rgun = allyGroup(rt, { fixed: true, name: '柴田の弓組', anchor: { x: RG.x, z: RG.z + 7 }, facing: Math.PI, width: 6, aggro: 4, formation: 'line' },
      dress([{ type: 'samurai', n: 1, o: { name: '安藤守就', flag: null } }, { type: 'bow', n: 6 }], ODA));
    F.crossGroups = [F.shiba, ...F.others];
    // 将と左右の旗本は、浅瀬の幅の中を歩く。流れも傷も歩兵と同じまま。
    for (const g of F.crossGroups) {
      const lord = g.units.find((u) => u.name && u.invuln);
      if (!lord) continue;
      lord.fordEscort = { active: false, at: { x: 2, z: SOUTH.z }, lord: null, side: 0 };
      let side = -1;
      const mid = g.units.indexOf(lord);
      for (const i of [mid - 1, mid + 1]) {
        const u = g.units[i];
        if (!u || u.name) continue;
        u.fordEscort = { active: false, at: { x: 2, z: SOUTH.z }, lord, side };
        side += 2;
      }
    }
    F.crossInitial = F.crossGroups.reduce((n, g) => n + g.count, 0) + F.rear.count + F.rgun.count;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: -58 }, 0, [{ kind: 'spear', n }]);
    F.rearFriends = [F.rear, ...(rt.squadGroups || [])];
    for (const g of rt.squadGroups || []) F.crossInitial += g.count;
    // ---- 大軍（軽い作り）：南の岸へ渡っていく織田の本隊、北から来る上杉の大軍 ----
    const hosts = rosterBuild(rt, JIN);
    F.main = [hosts[0].inaba, hosts[0].sassa];
    F.host = [hosts[1].second, hosts[1].left];
    F.host2 = [hosts[1].front, hosts[1].right];
    for (const m of [...F.main, ...F.host, ...F.host2]) m.army.noWake = false;
    // 先手の背後を左右の槍の大軍で埋める。本物への置き換えは既存の備えだけで行う。
    F.pursuitBackdrop = [-1, 1].map((side) => W.addDistantArmy({
      x: side * 44, z: -112, facing: 0, team: 1, flag: 'uesugi', armor: 0x2a2a2a,
      count: 240, w: 38, d: 30, kind: 'spear', host: false, seed: 15777 + side,
    }));
    for (const m of F.pursuitBackdrop) m.army.noWake = true;
    for (const at of RETREAT_LINES) W.addFire(at.x + 8, at.z, { torch: true, h: 1.6 });
    for (const [x, z] of [[-20, -80], [24, -84]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 闇の中の目じるし：北の岸の松明の列（B051）と、渡り口の旗と篝火（B053）
    for (const [x, z] of [[-48, -52], [-30, -58], [30, -60], [48, -54], [-12, -40], [14, -42]]) W.addFire(x, z, { torch: true, h: 1.6 });
    // 幟の間を浅瀬の中央にそろえる。三十歩の広い門で深みまで渡り道に見せない。
    for (const sd of [-1, 1]) {
      const x = 2 + sd * 6;
      rt.scene.add(nobori(W, x, FORD.z - 4, 'oda', 6), campfire(W, x + sd * 2, FORD.z - 6));
      W.addFire(x + sd * 2, FORD.z - 6);
    }
    // 対岸にも入口と同じ幅の二本を置く。水の中でも出口の向きを見失わせない。
    for (const sd of [-1, 1]) rt.scene.add(nobori(W, 2 + sd * 6, SOUTH.z + 6, 'oda', 6));
    W.addFire(8, SOUTH.z + 6, { torch: true, h: 1.6 });
    // 北の上杉謙信の本陣（遠く。見に行けば謙信と旗本がいる）
    // 南の岸の織田の本陣（滝川一益が退く列を受け取る）
    // この戦での両将の馬印は未確認。共通の金扇を借りず、陣幕と隊旗で本陣を示す。
    // 本人の兜・陣羽織は名のある武将の装備表に揃える。
    const campStart = rt.scene.children.length;
    F.honjin = camp(rt, { x: 34, z: 104, facing: Math.PI, team: 0, faction: 'oda', mon: 'takigawa', noUma: true, tate: false, general: { name: '滝川一益' }, guard: 15, reserve: 0, runTo: { x: SOUTH.x, z: SOUTH.z + 10 } });
    F.ehon = camp(rt, { x: 64, z: -206, facing: 0, team: 1, faction: 'uesugi', mon: 'uesugi', noUma: true, tate: false, armor: 0x2a2a2a, general: { name: '上杉謙信' }, guard: 25, reserve: 0, runTo: { x: 0, z: -150 } });
    riverCampShelters(rt, [F.honjin, F.ehon], rt.scene.children.slice(campStart));
    riverFieldworks(rt);

    // 幕の口でなく敵の側を守る。雨中の旗本は槍と侍を主にする。
    for (const c of [F.honjin, F.ehon]) {
      const g = c.guard;
      g.formation = 'yari'; g.yariRanks = 3; g.aggro = 6; g.seekRange = 18;
      g.order = 'move'; g.dest = { x: c.pos.x, z: c.pos.z + (g.team ? 12 : -12) };
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    F.reserves = [
      W.addDistantArmy({ x: 34, z: 134, facing: Math.PI, team: 0, flag: 'takigawa', count: 120, w: 34, d: 24, kind: 'spear', host: false }),
      W.addDistantArmy({ x: 100, z: -206, facing: 0, team: 1, flag: 'uesugi', count: 180, w: 36, d: 28, kind: 'spear', host: false }),
    ];
    for (const m of F.reserves) m.army.noWake = false;
    // 替えた兵と台本の追手を合わせて近さを数える。遠景の軍勢はそのまま残す。
    F.tedoWakeArmies = [...F.main, ...F.host, ...F.host2, ...F.reserves];
    F.northSteps = tedoA(); F.southSteps = tedoB();
    preparePursuit(rt, F.northSteps, 0); preparePursuit(rt, F.southSteps, 1);
    // 先手の足軽・二の手・騎馬に一本ずつ。兵を増やさず、動く列を旗で見せる。
    // 手に結び付かない追手の松明は置かず、川岸の据えた火を道じるしにする。
    const cloth = document.createElement('canvas'); cloth.width = 128; cloth.height = 256;
    const ink = cloth.getContext('2d');
    ink.fillStyle = '#eee5cc'; ink.fillRect(0, 0, 128, 256);
    ink.fillStyle = '#161820'; ink.font = 'bold 100px serif'; ink.textAlign = 'center';
    ink.fillText('毘', 64, 145);
    const bi = new THREE.CanvasTexture(cloth); bi.colorSpace = THREE.SRGBColorSpace;
    F.pursuitSigns = [];
    for (const role of ['front', 'second', 'horse']) {
      const g = F.pursuit.find((q) => q.tedoBank === 0 && q.tedoRole === role);
      if (!g) continue;
      const u = g.units[Math.floor(g.units.length / 2)];
      const flag = nobori(W, u.pos.x, u.pos.z, 'uesugi', 5.6);
      const old = flag.userData.flag.material, mat = old.clone();
      mat.map = bi; mat.emissive.setHex(0x383021);
      mat.onBeforeCompile = old.onBeforeCompile; mat.customProgramCacheKey = old.customProgramCacheKey;
      flag.userData.flag.material = mat;
      rt.scene.add(flag);
      flag.visible = false;
      F.pursuitSigns.push({ g, role, flag });
    }
    F.runner = allyGroup(rt, { fixed: true, fullStrength: true, name: '退き口の使番',
      anchor: { x: -8, z: -82 }, facing: 0, formation: 'column', aggro: 0, seekRange: 0, noAI: true },
    dress([{ type: 'samurai', n: 1, o: { weapon: 'none' } }], ODA));
    F.runner.isRunner = true; F.runner.speed = 4;
    // 移動の目当てと水の状態は準備時に作って使い回す。
    for (const u of rt.army.units) {
      u.tedoSwimTo = { x: u.pos.x, z: u.pos.z };
      u.tedoWait = { x: u.pos.x, z: u.pos.z };
    }
    waterActions(rt);
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.army.playFar('sig_atsumare', F.shibaU.pos, 0.8);
    rt.obj('main', HI(rt) ? '組をまとめ、柴田勝家の旗へ' : '柴田勝家の旗へ集まれ', 'main');
    rt.banner('背は手取川、北には上杉', '退く味方を守り、最後に川を渡る');
    rt.say('組頭', '七尾城は落ちた。柴田様の旗へ集まれ！', 4);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(6, () => {
      if (F.ending || rt.over || F.step !== 0) return;
      messengerNews(rt, F.shibaU, '七尾城は落ち、上杉謙信が加賀へ出た由にござる！');
    });
    rt.after(14, () => {
      if (F.ending || rt.over || F.step !== 0) return;
      rt.say('組頭', '羽柴秀吉様の手はもう帰った。残る者で退き道を守るぞ', 4);
    });
    rt.after(22, () => this.retreat(rt));
    F.retreatTimer = rt.timers[rt.timers.length - 1];
  },

  // ① 渡り口まで退く
  retreat(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('retreat'); rt.objProgress('main', '');
    rt.unmark('shiba');
    // 任務の「退け」が、共通の法螺貝と退き太鼓を一度だけ鳴らす。
    if (!F.nanaoHeard) {
      F.nanaoHeard = true;
      rt.say('柴田勝家', '退き太鼓じゃ！　七尾は落ちた。殿は渡り口を守れ！', 4);
    } else rt.say('柴田勝家', '退き太鼓じゃ！　諸手は川を渡れ。殿は北岸で追手を止めよ！', 4);
    rt.obj('main', '組頭に続き、北岸の火へ退け', 'main');
    rt.marker('ford', { x: FORD.x, z: FORD.z - 10 }, '北岸の殿の持ち場', { h: 2 });
    rt.zone('ford', FORD.x, FORD.z - 10, 7);
    F.shiba.formation = 'column'; F.shiba.colW = 2;
    // 初めの陣の場所だけを固定する。退く列は小屋を避けて持ち場を詰める。
    F.shiba.fixed = false; F.shiba.retreatOnly = false;
    F.shiba.order = 'move'; F.shiba.dest = { x: -8, z: -38 }; F.shiba.speed = 2; F.shiba.aggro = 5;
    F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; g.formation = 'yari'; g.width = 10; };
    F.rear.order = 'move'; F.rear.dest = RG; F.rear.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    // 雨と川の音で下知が届かず、一手は止まり、一手は横へ走る。
    messengerNews(rt, rt.player.u, '川音に下知が消され、諸手が乱れてござる！');
    F.others[0].order = 'hold'; F.others[0].morale = 55;
    F.others[1].order = 'move'; F.others[1].dest = { x: 60, z: -44 }; F.others[1].speed = 3.2; F.others[1].morale = 45;
    F.others[1].onArrive = (g) => { g.order = 'hold'; };
    F.others.forEach((g, i) => rt.after(20 + i * 18, () => {
      if (F.ending || rt.over) return;
      // 川の中では中央の渡り口を通る。左右へ列を分けるのは南の岸へ上がってから。
      g.fixed = false; g.retreatOnly = true;
      g.order = 'path'; g.path = [[i ? 4 : 0, -44], [i ? 4 : 0, FORD.z], [i ? 4 : 0, SOUTH.z], [SOUTH.x + (i ? 16 : -16), SOUTH.z + 20], [SOUTH.x + (i ? 20 : -20), 90]];
      g.pathIdx = 0; g.speed = 1.8; g.colW = 2; g.formation = 'column'; g.aggro = 0;
      g.onArrive = (q) => { q.order = 'hold'; };
      const lord = g.leader || g.units[0];
      if (sightUnit(rt, lord)) rt.say(i ? '前田利家' : '丹羽長秀', i ? '列を離れるな！　手負いも連れて渡るぞ！' : '渡り口へ続け！　荷より人を先に通せ！', 4);
      else messengerNews(rt, lord, i ? '前田の手は渡り口へ！　南岸へ退けとの下知じゃ！' : '丹羽の手に下知！　渡り口へ退け！');
    }));
    // 大軍も中央の渡り口へ寄せてから縦列で渡す。
    F.main.forEach((m, i) => rt.after(12 + i * 22, () => {
      if (F.ending || rt.over) return;
      m.moveTo(i ? 4 : 0, i ? -76 : -54, 24);
    }));
    for (const h of F.host) h.advance(60, 60);
    for (const h of F.host2 || []) h.advance(45, 50);
    for (const h of F.pursuitBackdrop) h.advance(32, 45);
    // 持ち場へ着くのを待たず追撃する。下知を聞き逃しても、敵が来ないまま止まらない。
    rt.after(4, () => {
      if (F.ending || rt.over || F.step < 1 || F.step > 2) return;
      rt.say('組頭', '北から追手じゃ！　北岸の火まで退け！', 3.5);
      for (const g of F.northSteps[0].tedoWaves[0].groups) advancePursuit(g, RG, true);
    });
    // 騎馬は二度目の持ち場の下知で出す。先手への接敵前に重ねない。
    messengerNews(rt, rt.player.u, '水かさが増し、渡り口に諸手が詰まってござる！');
    for (const g of rt.squadGroups || []) { g.order = 'move'; g.dest = RG; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
  },

  // ② 殿：追手を食い止める
  rearguard(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('rear'); rt.objProgress('main', '');
    rt.unmark('ford'); rt.unzone('ford');
    rt.army.playFar('horagai', F.shibaU.pos, 0.8);
    rt.banner('北の岸の殿', '雨の闇に向け、槍をそろえる');
    rt.objRemove('main');
    F.waves = [];
    // 近くの兵は準備時の備えから来る。接触の時に別の大軍を湧かせない。
    // 殿の持ち場は狭い。槍と弓で、渡る時を稼ぐ
    depthStart(rt, tedoCtx(rt), F.northSteps, () => this.cross(rt));
  },

  // ③ 川を渡る
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    // 深手で段を中断した時も、古い持ち場の旗・輪・行き先を残さない。
    if (F.dp) F.dp.on = false;
    F.postFlag.visible = false;
    rt.unmark('dp'); rt.unzone('dp');
    // 南岸の追手も北岸の備えから歩いて来る。渡った後で遠い控えを出発させない。
    for (const w of F.southSteps[0].tedoWaves) rt.after(5 + w.t, () => {
      if (F.ending || rt.over) return;
      // 渡河の下知で弓衆まで一斉に動かさず、先手と射手の間を保つ。
      for (const g of w.groups) advancePursuit(g, SOUTH, true);
    });
    rt.unmark('shiba');
    for (let i = 0; i < RETREAT_LINES.length; i++) rt.unmark('line' + i);
    releaseShibata(rt, true);
    for (const g of F.rearFriends) if (!F.crossGroups.includes(g)) F.crossGroups.push(g);
    if (!F.crossGroups.includes(F.rgun)) F.crossGroups.push(F.rgun);
    rt.setPhase('cross'); rt.objRemove('dp'); rt.objProgress('main', '');
    for (let i = 0; i < 3; i++) rt.unmark('w' + i);
    if (!F.failedHold && !F.lineBroken) rt.award((t) => t.side.push('殿を務め、追手を食い止めた'), '殿を務めた');
    rt.banner(F.woundedRetreat ? '手負いは浅瀬へ退け' : F.lineBroken ? '殿の列が切れた' : F.crossRemaining ? '殿も退け' : '残る味方は渡った', F.woundedRetreat ? '持ち場へ戻らず、組と南岸へ渡れ' : F.lineBroken ? '持ち場を捨て、南岸へ渡って生きて退け' : F.crossRemaining ? '南岸へ渡り、遅れた味方を迎えよ' : '殿も渡れ。浅瀬にも濁流が走る');
    rt.obj('main', F.woundedRetreat ? '手負いは浅瀬を渡り、南岸へ退け' : F.lineBroken ? '列が破られた。浅瀬を渡り、南岸へ退け' : '浅瀬を渡り、南岸の火へ退け', 'main');
    // すでに渡る下知が出ている。共通の太鼓の補足で、北岸へ「もどれ」と読ませない。
    rt.objectives.find((o) => o.id === 'main').cue = '';
    rt.say('組頭', F.woundedRetreat ? '退き太鼓じゃ！　持ち場へ戻るな。組と浅瀬を渡れ！' : F.lineBroken ? '列が切れた！　押し返すな。組と幟の間へ退け！' : F.failedHold ? '支えきれぬ！　持ち場へ戻らず、組と浅瀬を渡れ！' : F.crossRemaining ? '退き太鼓じゃ！　殿も渡れ。南岸で遅れた者を迎えよ！' : '退き太鼓じゃ！　よう支えた。殿も渡れ、互いに腕を取れ！', 4);
    // 負傷や包囲の案内もこの退き道へそろえ、近くの味方を探して北岸へ戻さない。
    rt.marker('crossing', () => crossingTarget(rt), () => F.crossViaBank ? '戦わず、岸沿いに浅瀬へ' : F.crossEntering ? '幟の間から川へ' : F.crossInFord ? '浅瀬をまっすぐ渡れ' : '南岸の火へ', { h: 2, guideArea: 'retreat', guideRadius: 0.75 });
    rt.zone('south', SOUTH.x, SOUTH.z, 8);
    F.rear.fixed = false; F.rear.retreatOnly = true;
    if (F.rgun) { F.rgun.fixed = false; F.rgun.retreatOnly = true; }
    F.rear.order = 'path'; F.rear.path = [[FORD.x, FORD.z], [SOUTH.x, SOUTH.z + 6]]; F.rear.pathIdx = 0; F.rear.speed = 2; F.rear.formation = 'column'; F.rear.colW = 2; F.rear.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    for (const g of rt.squadGroups || []) {
      g.fixed = false; g.retreatOnly = true; g.order = 'path';
      g.path = [[2, FORD.z], [2, SOUTH.z], [SOUTH.x, SOUTH.z + 8]]; g.pathIdx = 0;
      g.speed = 2; g.formation = 'column'; g.colW = 2;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.formation = 'yari'; q.yariRanks = 2; q.anchor.x = SOUTH.x + 12 + (q.id % 3) * 10; q.anchor.z = SOUTH.z + 12; };
    }
    for (const h of F.host) h.advance(40, 30);
    for (const h of F.host2 || []) h.advance(20, 30);
    if (F.rgun && F.rgun.count) { const g = F.rgun; g.order = 'path'; g.path = [[FORD.x + 4, FORD.z], [4, SOUTH.z], [SOUTH.x + 8, SOUTH.z + 4]]; g.pathIdx = 0; g.speed = 2; g.formation = 'column'; g.colW = 2; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
  },

  // 南の岸に着いたら：遅れた列と殿が渡るまで岸を支える
  south(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('south');
    // 北岸を支えられなくても、実際に退いてから失敗の結果へ進む。
    if (F.failedHold) { this.lose(rt); return; }
    if (!F.crossGroups.includes(F.rear)) F.crossGroups.push(F.rear);
    if (F.rgun && !F.crossGroups.includes(F.rgun)) F.crossGroups.push(F.rgun);
    for (const g of rt.squadGroups || []) if (!F.crossGroups.includes(g)) F.crossGroups.push(g);
    F.crossCheckT = 0;
    rt.unzone('south');
    rt.unmark('crossing');
    rt.objRemove('main');
    depthStart(rt, tedoCtx(rt), F.southSteps, () => this.win(rt));
  },

  lose(rt) {
    const F = rt.flags;
    // 移動の刻限と持ち場の失敗はこの戦の下知。敵を見ずに遠くへ逸れても終わらせる。
    const missedOrder = F.failedHold || (F.step === 1 && rt.t - F.stepT > 90) || (F.step === 3 && rt.t - F.stepT > 110);
    if (!missedOrder && !rt.canFailMission()) return;
    if (F.ending) return;
    F.ending = true; if (F.dp) F.dp.on = false; rt.tracker.main = false;
    rt.setPhase('end'); rt.objRemove('dp');
    rt.obj('main', '殿の持ち場を支えられなかった', 'main'); rt.objFail('main');
    rt.unmark('crossing');
    rt.unmark('south'); rt.unzone('south'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('ford'); rt.unzone('ford'); rt.unmark('shiba');
    for (let i = 0; i < RETREAT_LINES.length; i++) rt.unmark('line' + i);
    const reason = F.failedHold ? F.holdReason || '殿の持ち場を保てなかった。残る列と退け' : F.step === 1 ? '北岸の持ち場へ間に合わなかった' : F.step === 3 ? '南岸へ渡る刻限に間に合わなかった' : F.crossed < Math.ceil(F.crossInitial * 0.6) ? '渡った味方が少なく、列を支えられなかった' : F.crossRemaining > 0 ? '渡れない味方が残った。退き口を守れなかった' : '南岸の持ち場を保てなかった';
    rt.banner('渡り口を支えられなかった', reason);
    rt.say('組頭', '支えきれぬ！　残る味方と退け！　敵に背を見せるな！', 4);
    // 渡河までがこの戦の退き口。決着後に共通の追撃で列を組み替えない。
    rt.finish({ scriptedEnd: true, failureReason: reason }, 8);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (F.failedHold || !rt.player.u.alive || rt.player.u.pos.z < SOUTH.z - 4 || rt.world.inWaterAt(rt.player.u.pos.x, rt.player.u.pos.z)) { this.lose(rt); return; }
    F.ending = true;
    rt.setPhase('end'); rt.objRemove('dp');
    rt.obj('main', '味方を守り、手取川を渡った', 'main');
    rt.unmark('south'); rt.unzone('south');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '手取川の殿を務め、生きて渡った', pts: 20 }; }, '殿の働き・手取川を渡った');
    sfx('sig_nobiki', 0.5);
    rt.banner('手取川を渡った', F.crossed < Math.ceil(F.crossInitial * 0.6) || F.crossRemaining > 0 ? '討たれた味方は多い。それでも生きて退いた。北の岸には上杉の旗が残る' : '殿の列は南へ退く。北の岸には上杉の旗が残る');
    rt.say('組頭', '退き太鼓じゃ！　残る者も渡った。手負いを連れ、南へ退け！', 4);
    // 戦功と織田軍の勝敗を分ける。史実の札は台詞と時間をずらす。
    rt.after(4, () => { if (rt.player.u.alive && !rt.result?.down) rt.banner('上杉の追撃を伝える書状', '謙信の書状写は、夜の追撃と増水を伝える'); });
    rt.after(8, () => { if (rt.player.u.alive && !rt.result?.down) rt.banner('生きて、次の戦へ', '次は大和の信貴山城。退き口で覚えた働きを、次へ'); });
    // 殿の成功で上杉軍を敗走させず、南岸へ退いた結末を保つ。
    rt.finish({ scriptedEnd: true }, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 重傷の決着とやり直しは共通の処理へ渡す。倒れた本人へ次の下知を出さない。
    if (!rt.player.u.alive || rt.player.u.hp <= 0) {
      if (!F.downOrdersCleared) {
        F.downOrdersCleared = true; F.ending = true;
        if (F.dp) F.dp.on = false;
        rt.tracker.main = false;
        rt.objRemove('main'); rt.objRemove('dp');
        for (const id of ['shiba', 'ford', 'dp', 'south', 'shallow', 'crossing']) { rt.unmark(id); rt.unzone(id); }
        for (let i = 0; i < RETREAT_LINES.length; i++) rt.unmark('line' + i);
        F.postFlag.visible = false;
        // 倒れた処理は一度だけ。共通側が先に知らせた重傷を呼び直さない。
        // 再試行の札が閉じた後も、決着までの時計を進める。
        if (!rt.over && !rt.retryOpen) rt.playerDown();
      }
      return;
    }
    if (rt.t >= (F.threatScanAt || 0)) {
      F.threatScanAt = rt.t + 0.5; F.nearThreat = false;
      // 十歩手前では槍の届かない所で列が止まる。先頭が五歩まで
      // 歩いてから攻撃へ替える。後続全員の到着は待たない。
      for (const g of F.pursuit) {
        if (!g.tedoActive || g.routed || g.tedoBow || g.order !== 'move' || !g.dest || g.dest.z > 0) continue;
        if (!g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut &&
            Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 5)) continue;
        g.anchor.x = g.dest.x; g.anchor.z = g.dest.z;
        g.order = 'attack'; g.formation = 'yari'; g.yariRanks = 2; g.onArrive = null;
      }
      let openingThreat = false;
      let allies = 0, foes = 0;
      const p = rt.player.u.pos;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.routed) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < 60) { if (u.team === 0) allies++; else if (u.team === 1) foes++; }
        if (u.team === 1 && d < 25) F.nearThreat = true;
        if (u.team === 1 && d < 12) openingThreat = true;
      }
      // 待つ二十二秒より早く追手に出会ったら、集合の下知を退き口の下知へ替える。
      if (!F.ending && F.step === 0 && openingThreat) this.retreat(rt);
      let allyArmy = null, foeArmy = null, allyDist = Infinity, foeDist = Infinity;
      for (const m of F.tedoWakeArmies) {
        const a = m.army;
        a.noWake = true;
        if (a.rout || !a.mesh.visible || !a.mesh.parent || !a.mesh.left(p.x, p.z, 60)) continue;
        // 渡る本隊は軽い列のまま。狭い浅瀬で足元へ新しい兵を重ねない。
        if (F.step >= 3 && p.z < SOUTH.z &&
            (a === F.main[0].army || a === F.main[1].army)) continue;
        const d = a.wakeDistance ?? Math.hypot(a.mesh.position.x + a.cx + a.off.x - p.x,
          a.mesh.position.z + a.cz + a.off.z - p.z);
        if (a.team === 0 && d < allyDist) { allyArmy = a; allyDist = d; }
        else if (a.team === 1 && d < foeDist) { foeArmy = a; foeDist = d; }
      }
      // 一度に一つずつ替え、四つの敵の備えが同時に近くの枠を埋めないようにする。
      if (allyArmy && allies < 48) allyArmy.noWake = false;
      // 持ち場には初めから置いた追手が順に寄せる。遠景の兵まで重ねて
      // 狭い退き道を埋めない。渡河中も替えず、既にいる追手は残す。
      if (foeArmy && foes < 40 && !F.dp?.on && F.step !== 3) foeArmy.noWake = false;
      // 三本の旗を、次に寄せる生きた列へ渡す。描く物は増やさない。
      for (const sign of F.pursuitSigns) {
        let nearest = Infinity;
        for (const g of F.pursuit) {
          if (!g.tedoActive || g.routed || g.tedoBank !== 0 || g.tedoRole !== sign.role) continue;
          for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut) {
            const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
            if (d < nearest) { nearest = d; sign.g = g; }
          }
        }
      }
    }
    // 旗は生きている列に付く。使い回す入れ物の位置だけを動かす。
    for (const sign of F.pursuitSigns) {
      const g = sign.g;
      let bearer = null;
      for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut) { bearer = u; break; }
      const visible = !!bearer && g.tedoActive && !g.routed && !rt.world.inWaterAt(bearer.pos.x, bearer.pos.z);
      sign.flag.visible = visible;
      if (!visible) continue;
      const p = bearer.pos;
      // 幟の竿は川原に合わせる。
      sign.flag.position.set(p.x - 0.5, rt.world.heightAt(p.x - 0.5, p.z), p.z);
    }
    messengerTick(rt);
    if (!F.ending) arrowWarning(rt);
    KIT.backTick(rt);
    // 替えた兵も元の備えの役目を保つ。渡る味方を戦いへ引き戻さない。
    for (const g of rt.army.groups) if (g.woke && !g.tedoDressed) {
      g.tedoDressed = true; g.formation = g.team ? 'yari' : 'column';
      g.yariRanks = 3; g.colW = 2;
      if (!g.team && (g.woke === F.main[0].army || g.woke === F.main[1].army)) {
        const lane = g.woke === F.main[1].army ? 4 : 0;
        g.retreatOnly = true; g.aggro = 0; g.seekRange = 0; g.focus = null;
        g.tedoCrossing = true; g.order = 'path'; g.pathIdx = 0; g.speed = 1.8;
        // すでに川に入った列は北岸へ戻さない。渡り終えた列は南へ抜ける。
        g.path = g.anchor.z < FORD.z ? [[lane, FORD.z], [lane, SOUTH.z], [lane, 90]] :
          g.anchor.z < SOUTH.z ? [[lane, SOUTH.z], [lane, 90]] : [[lane, 90]];
        g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
        for (const u of g.units) {
          u.target = u.atk = u.swing = null; u.charging = false;
          u.tedoWait = { x: u.pos.x, z: u.pos.z };
        }
      } else { g.aggro = 6; g.seekRange = 18; }
    }
    const hit = rt.player.lastHit;
    if (hit?.blocked && rt.t - hit.t < 1 && !hit.ranged) F.playerHelp = true;
    if (!F.ending && rt.player.u.alive && hit && rt.t - hit.t < 2 &&
        needsWoundedRetreat(rt.player.u) && rt.t >= (F.woundHintAt || 0)) {
      F.woundHintAt = rt.t + 12;
      rt.say('組頭', F.step >= 4 ? '手負いじゃ！　南岸の味方の列へ下がれ！' : F.step === 3 ? '手負いじゃ！　持ち場へ戻るな。浅瀬を渡れ！' : hit.ranged ? '矢が来る！　味方の列へ下がれ' :
        hit.back || hit.side ? '脇から斬られるぞ！　槍先を敵へ向けよ！' : '手負いじゃ！　槍を向けたまま味方の列へ退け！', 4);
    }
    // 渡り終えた数は、生きた兵の位置から数える。毎秒一度だけ。
    if (F.step >= 1 && rt.t >= (F.crossCheckT || 0)) {
      F.crossCheckT = rt.t + 1; F.crossRemaining = 0; F.crossed = 0; F.crossStranded = 0;
      fordTick(rt);
      for (const g of F.crossGroups) for (const u of g.units) if (u.alive && !u.gone) {
        if (u.pos.z >= SOUTH.z - 4 && !rt.world.inWaterAt(u.pos.x, u.pos.z)) F.crossed++;
        else if (u.woundOut || u.fleeing) F.crossStranded++;
        else F.crossRemaining++;
      }
    }
    if (F.step >= 4) {
      const g = F.rear;
      if (g.order === 'hold' && g.anchor.z >= SOUTH.z) { g.anchor.x = SOUTH.x; g.anchor.z = SOUTH.z + 4; g.formation = 'yari'; g.yariRanks = 2; }
    }
    // 手負いの本人へ居残る下知を重ねない。列を下げる段と同じ傷で浅瀬へ退く。
    // 味方と列を保つ者は負傷だけで失敗にしない。南岸で本隊を迎える任務は残す。
    if (!F.ending && F.step === 2 && needsNorthRetreat(rt)) {
      const held = heldBeforeWound(rt);
      F.woundedRetreat = true;
      if (!held) {
        F.failedHold = true;
        F.holdReason ||= rt.player.u.wounds?.bleed > 0.0001 ? '出血が続き、殿の持ち場を支えきれなかった' : '深手で殿の持ち場を支えきれなかった';
      }
      if (F.dp) F.dp.on = false;
      this.cross(rt);
    }
    if (!F.ending && !F.failedHold) depthTick(rt, dt);
    if (!F.ending && F.failedHold) {
      if (F.step === 2) {
        rt.objRemove('dp');
        this.cross(rt);
      } else if (F.step !== 3) { this.lose(rt); return; }
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i];
      if (m.group && gone(m.group)) rt.unmark(m.id);
    }
    if (!F.ending) this.flood(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    if (F.step === 0) {
      const d = Math.hypot(p.x - F.shibaU.pos.x, p.z - F.shibaU.pos.z);
      rt.objProgress('main', d < 8 ? '集合した。旗のそばで退きの下知を待て' : '柴田勝家の旗へ寄れ。まだ川は渡るな');
    }
    if (F.step === 1) {
      const d = Math.hypot(p.x - FORD.x, p.z - (FORD.z - 10));
      rt.objProgress('main', d < 7 ? '槍をそろえ、追手に備えよ' : '北岸の火へ退け。追手が迫るぞ');
      if (d < 7) this.rearguard(rt);
      else if (rt.t - F.stepT > 90) this.lose(rt);
      else if (rt.t - F.stepT > 60 && !F.lateCall1) { F.lateCall1 = true; rt.say('組頭', `${nm(rt)}、遅れるな！　北岸の火へ急げ。置いていかれるぞ`, 3.5); }
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - SOUTH.x, p.z - SOUTH.z);
      crossingTarget(rt);
      // 北岸では本人を待つ。浅瀬でも先へ離れすぎた殿は歩みを緩める。
      // 川の中では止めず、南岸へ着いたら元の歩調へ戻す。
      if (F.rear.order === 'path') {
        const ahead = F.rear.anchor.z > p.z + 4;
        F.rear.speed = ahead && p.z < -24 && F.rear.anchor.z < -24 ? 0 :
          ahead && F.crossInFord && p.z < SOUTH.z - 4 ? 1 : 2;
      }
      rt.objProgress('main', riverCrossingText(rt));
      // 渡り出さない時は、柴田が呼ぶ（上杉が迫るので長くは待たない）
      if (d >= 8 && rt.t - F.stepT > 20 && !F.crossCall) { F.crossCall = true; rt.say('組頭', `${nm(rt)}、南のかがり火へ！　浅い渡り口を通れ。上杉が迫るぞ`, 3.5); }
      if (d >= 8 && rt.t - F.stepT > 40 && !F.crossCall2) { F.crossCall2 = true; rt.say('足軽', '幟の間を、南岸へまっすぐ渡れ！', 3); }
      // 南岸の輪の手前はまだ水の中。岸へ上がるまでは渡河の下知を保つ。
      if (d < 8 && !rt.world.inWaterAt(p.x, p.z)) this.south(rt);
      else if (rt.t - F.stepT > 110) this.lose(rt);
      else if (rt.t - F.stepT > 80 && !F.lateCall3) { F.lateCall3 = true; rt.say('組頭', `${nm(rt)}、まだか！　南の火へ渡れ。刻がないぞ`, 3.5); }
    }
  },

  // 増水の川の怖さ：濁流が川の中の者を北西へ流す（馬は強く流され、重い具足の者ほど足を取られる）。流れてくる材木が川面を下る
  flood(rt, dt) {
    const F = rt.flags;
    // 水位は少しずつ上がる。渡り道は足首から膝の浅瀬を保つ。
    { const st = rt.world.def.streams && rt.world.def.streams[0]; if (st && st.mesh) st.mesh.position.y = Math.max(0, Math.min(1, (rt.t - 40) / 140)) * FLOOD_RISE; }
    if (!F.logs) {
      F.logs = [];
      // 白い板の波筋と四角いしぶきは置かず、共通の粒のしぶきを使う。
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
      const geo = new THREE.CylinderGeometry(0.22, 0.26, 4.2, 6);
      geo.rotateZ(Math.PI / 2);
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, mat);
        const lg = { m, x: -200 + i * 62, dz: (i % 2 ? -1 : 1) * 10, sp: 2.2 + (i % 3) * 0.5, r: i * 0.7, dx: 0, dzStep: 0, alongX: 1, alongZ: 0, wrapped: false };
        rt.scene.add(m);
        F.logs.push(lg);
      }
    }
    for (const lg of F.logs) {
      const px = lg.m.position.x, pz = lg.m.position.z;
      lg.x -= lg.sp * dt;
      lg.wrapped = lg.x < -230;
      if (lg.wrapped) lg.x = 230;
      let z = 0, yaw = 0;
      for (const q of FLOW) if (lg.x >= q.ax && lg.x <= q.ax + q.dx) {
        z = q.az + q.dz * (lg.x - q.ax) / q.dx;
        yaw = -Math.atan2(q.dz, q.dx);
        break;
      }
      lg.m.position.set(lg.x, rt.world.heightAt(lg.x, z + lg.dz) + rt.world.waterDepthAt(lg.x, z + lg.dz) - 0.1 + Math.sin(rt.t * 1.3 + lg.r) * 0.06, z + lg.dz);
      lg.m.rotation.y = yaw + Math.sin(rt.t * 0.5 + lg.r) * 0.3;
      lg.dx = lg.wrapped ? 0 : lg.m.position.x - px;
      lg.dzStep = lg.wrapped ? 0 : lg.m.position.z - pz;
      lg.alongX = Math.cos(lg.m.rotation.y); lg.alongZ = -Math.sin(lg.m.rotation.y);
    }
    if (F.step < 1) return;
    F.floodT = (F.floodT || 0) - dt;
    for (const u of rt.army.units) {
      if (!u.alive || !u.pos) continue;
      if (u.flag && rt.world.inWaterAt(u.pos.x, u.pos.z)) u.flag.visible = false;
      const oldX = u.pos.x, oldZ = u.pos.z;
      if (u.isPlayer && rt.world.waterDepthAt(oldX, oldZ) <= DEEP_LIMIT) {
        u.tedoSafeX = oldX; u.tedoSafeZ = oldZ;
      }
      if (u.fordEscort) {
        const e = u.fordEscort;
        e.active = F.step >= 1 && u.group.order === 'path' && u.pos.z < SOUTH.z - 4 && u.pos.z > FORD.z - 8;
      }
      if (distToPolyline(u.pos.x, u.pos.z, RIVER) > 24 || !rt.world.inWaterAt(u.pos.x, u.pos.z)) {
        u.tedoLog = null;
        u.tedoBreath = Math.max(0, (u.tedoBreath || 0) - dt * 2);
        waterPose(rt, u);
        if (u.isPlayer) {
          F.playerDeep = false; F.shallowSince ??= rt.t;
          if (rt.t - F.shallowSince >= 8) F.deepWarned = false;
          if (F.shallowMarked) { rt.unmark('shallow'); F.shallowMarked = false; }
        }
        continue;
      }
      const k = (u.mounted ? 1.2 : 1) * (u.type === 'samurai' || u.type === 'busho' ? 1.3 : 1);
      // 渡り口の流れまで深みと同じ力にすると、減速した兵が流れに勝てず退路を外れる。
      const current = Math.min(1, rt.world.waterDepthAt(u.pos.x, u.pos.z) / 1.5);
      let flow = FLOW[0], best = Infinity;
      for (const q of FLOW) {
        const t = Math.max(0, Math.min(1, ((u.pos.x - q.ax) * q.dx + (u.pos.z - q.az) * q.dz) / q.len2));
        const dx = u.pos.x - q.ax - q.dx * t, dz = u.pos.z - q.az - q.dz * t, d = dx * dx + dz * dz;
        if (d < best) { best = d; flow = q; }
      }
      const shallow = rt.world.waterDepthAt(u.pos.x, u.pos.z) <= DEEP_LIMIT;
      const force = shallow ? (u.mounted ? 0.32 : 0.18) : 0.905;
      u.pos.x += flow.x * force * k * current * dt; u.pos.z += flow.z * force * k * current * dt;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      // 深みに押し出された者は、すぐには死なず息を失う。岸へ戻れば回復する。
      const deep = !shallow;
      // 四歩の材木を線分として当てる。形を増やさず、同じ七本を調べる。
      let log = u.tedoLog;
      if (log && (log.wrapped || rt.t >= u.tedoGripUntil)) { u.tedoLog = log = null; u.tedoLogAt = rt.t + 8; }
      if (!log && rt.t >= (u.tedoLogAt || 0)) for (const lg of F.logs) {
        const dx = u.pos.x - lg.m.position.x, dz = u.pos.z - lg.m.position.z;
        const along = Math.max(-2.1, Math.min(2.1, dx * lg.alongX + dz * lg.alongZ));
        if (Math.hypot(dx - along * lg.alongX, dz - along * lg.alongZ) > (u.mounted ? 0.85 : 0.55)) continue;
        u.tedoLogAt = rt.t + 8;
        if (deep && !u.mounted && !u.woundOut && u.hp > u.maxHp * 0.3) {
          u.tedoLog = log = lg; u.tedoGripUntil = rt.t + 3;
          if (u.isPlayer) rt.bark('流木につかまった！　流される前に岸へ寄れ');
        } else {
          u.stagger = Math.max(u.stagger || 0, 0.6);
          if (u.push) { u.push.x += flow.x * 1.2; u.push.z += flow.z * 1.2; }
          if (!u.invuln) u.hp = Math.max(0, u.hp - u.maxHp * 0.03);
          if (u.isPlayer) {
            rt.player.knockT = Math.max(rt.player.knockT || 0, 0.6);
            if (rt.t >= (F.logWarnAt || 0)) { F.logWarnAt = rt.t + 8; rt.bark('流木にぶつかった！　流れる木から離れよ', true); }
          }
        }
        break;
      }
      if (log) { u.pos.x += log.dx; u.pos.z += log.dzStep; }
      // 流れと流木も深みの壁を越えさせない。岸へ戻る移動は妨げない。
      if (u.isPlayer && rt.world.waterDepthAt(u.pos.x, u.pos.z) > DEEP_LIMIT && u.tedoSafeX != null) {
        u.pos.x = u.tedoSafeX; u.pos.z = u.tedoSafeZ;
        u.tedoLog = null;
      }
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      if (u.hp <= 0 && !u.invuln) {
        if (u.isPlayer) { rt.playerDown(); return; }
        rt.army.kill(u, null); continue;
      }
      // 馬は岸では速いが、流れで足並みが乱れる。転びは八秒以上あける。
      if (!u.invuln && !u.isPlayer && rt.t >= (u.tedoSlipAt || 0) &&
          (deep || u.mounted) && Math.random() < dt * (u.mounted ? 0.08 : 0.025)) {
        u.tedoSlipAt = rt.t + 8; u.stagger = Math.max(u.stagger || 0, u.mounted ? 1.2 : 0.8);
        u.confused = Math.max(u.confused || 0, 2);
      }
      u.tedoBreath = deep ? (u.tedoBreath || 0) + dt * k * (log ? 0.35 : 1) : Math.max(0, (u.tedoBreath || 0) - dt * 2);
      if (u.tedoBreath > 10 && !u.invuln) {
        u.hp = Math.max(0, u.hp - u.maxHp * 0.08 * dt);
        if (u.hp <= 0) {
          if (u.isPlayer) { rt.bark('深みで息を失い、溺れた', true); rt.playerDown(); return; } else rt.army.kill(u, null);
        }
      }
      if (u.isPlayer) {
        if (deep) {
          F.shallowSince = null;
          if (!F.deepWarned) {
            F.deepWarned = true;
            rt.bark('深みじゃ！　砂色の浅瀬へ戻れ。幟の間を通れ', true);
            rt.marker('shallow', { x: 2, z: Math.max(-20, Math.min(24, u.pos.z)) }, '幟の間の浅瀬', { h: 2 });
            F.shallowMarked = true;
          }
        } else {
          F.shallowSince ??= rt.t;
          if (rt.t - F.shallowSince >= 8) F.deepWarned = false;
          if (F.shallowMarked) { rt.unmark('shallow'); F.shallowMarked = false; }
        }
        F.playerDeep = deep;
      }
      waterPose(rt, u);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1 && k === rt.player.u) F.playerHelp = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || Math.hypot(g.center().x - rt.player.u.pos.x, g.center().z - rt.player.u.pos.z) > 35 || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が退いたで！`, 2.5);
  },
};

// ---------------- 殿の段（北の岸）と、南の岸の段 ----------------
// 到着を判定する火（-36）のそばで槍をそろえる。川際だけに本人を残さない。
const RG = { x: 0, z: -38 };                 // 殿の持ち場（渡り口の前）
const RR = round(RG, Math.PI, 56);           // 北から来る上杉の寄せ口（左右とも北の岸）
const PUSH = { x: 0, z: -48 };
const RETREAT_LINES = [{ x: 0, z: -46 }, { x: 0, z: -36 }, { x: 0, z: -27 }];
const RETREAT_NAMES = ['一つ目の火', '二つ目の火', '渡り口の火'];

function releaseShibata(rt, crossing = false) {
  const F = rt.flags, g = F.shiba;
  if (F.shibaReleased) return;
  F.shibaReleased = true;
  // ここは柴田の旗本だけを渡す。南岸への追手は本人の渡河の下知後に出す。
  // 最初の火へ下がる段で出すと、残る二つの持ち場の間に追手が重なってしまう。
  g.fixed = false; g.retreatOnly = true; g.formation = 'column'; g.colW = 2;
  g.order = 'path'; g.path = [[0, FORD.z], [2, SOUTH.z], [20, 94]]; g.pathIdx = 0; g.speed = 2;
  g.aggro = 0; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
  // 渡河の下知は組頭の一声にまとめ、次の持ち場へ戻さない。
  if (!crossing) rt.say('柴田勝家', '本隊は渡ったぞ。殿は陣寄りの火へ退け！', 4);
}

// 川の口と追手の役目を一秒ごとに数える。川の中の兵は止めない。
function fordTick(rt) {
  const F = rt.flags, f = F.ford, relief = rt.t < F.reliefUntil;
  const rise = Math.max(0, Math.min(1, (rt.t - 40) / 140));
  f.width = 8 - rise * 2; f.capacity = Math.floor(f.width * 4);
  // 川床は初めに描いた幅のまま。列の詰まりで浅瀬そのものを深くしない。
  f.inside = 0; f.queue = 0; f.pressure = 0;
  let weak = null, weakScore = Infinity, fordTarget = null, targetScore = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.woundOut || u.isStruct) continue;
    if (u.team === 1) {
      if (!u.fleeing && u.pos.z > -58 && u.pos.z < -24 && Math.abs(u.pos.x) < 24) f.pressure++;
      continue;
    }
    if (!u.tedoWait) u.tedoWait = { x: 0, z: 0 };
    if (u.pos.z > -24 && u.pos.z < 28 && Math.abs(u.pos.x - 2) < 12) f.inside++;
    if (u.group?.order === 'path' && u.pos.z >= -42 && u.pos.z <= -24 && Math.abs(u.pos.x - 2) < 12) f.queue++;
    if (u.isPlayer || u.fleeing || u.invuln || u.pos.z >= 28 || u.pos.z < -75) continue;
    const score = u.hp / u.maxHp + (u.group?.morale || 0) / 100;
    if (score < weakScore) { weakScore = score; weak = u; }
    const d = Math.abs(u.pos.z + 10) + Math.abs(u.pos.x - 2);
    if (d < targetScore) { targetScore = d; fordTarget = u; }
  }
  // 荷駄が押されると口が八秒塞がる。押し返せば詰まりがほどける。
  if (!F.cargoCleared && f.queue >= 6 && f.cargoUntil === 0) f.cargoUntil = rt.t + 8;
  if (!F.cargoCleared && (relief || (f.cargoUntil > 0 && rt.t >= f.cargoUntil))) {
    F.cargoCleared = true;
    messengerNews(rt, rt.player.u, '荷をどけ、渡る列が動き出した由にござる！');
  }
  const cargo = !F.cargoCleared && f.cargoUntil > rt.t;
  f.jam = Math.max(0, f.queue - 8) + (cargo ? 8 : 0) + (relief ? 0 : f.pressure);
  // 川中の先頭は後列を待つ。川中の人数で後列の入場まで止めると、
  // 両方が待ち続ける。入口の流量だけを絞り、浅瀬へ順に歩かせる。
  let room = relief ? 5 : cargo ? 1 : 3;
  for (const g of rt.army.groups) {
    if (!g.tedoCrossing && !F.crossGroups.includes(g)) continue;
    for (const u of g.units) {
      if (!u.alive || u.gone || u.woundOut || g.order !== 'path' || u.pos.z < -42 || u.pos.z >= -24) continue;
      if (u.tedoAdmitUntil > rt.t) { room--; continue; }
      if (room > 0) { u.tedoAdmitUntil = rt.t + 6; room--; }
    }
  }
  // 殿が先に退く場合も、本隊の後続を川の途中で止めない。
  // 大軍は軽い列のまま。押した時が、渡る列の歩みに変わる。
  if (F.step >= 2 && F.step <= 4 && F.mainCross < 100) {
    F.mainCross = Math.min(100, F.mainCross + (relief ? 1.5 : f.jam > 10 ? 0.5 : 0.7));
    for (let i = 0; i < F.main.length; i++) F.main[i].moveTo(i ? 4 : 0, -54 + F.mainCross * 1.46, 1.2);
  }
  if (F.step === 2 && !F.shibaReleased) {
    const g = F.shiba, lord = F.shibaU;
    const danger = rt.army.nearestEnemy(lord, 6, (o) => !o.fleeing && !o.woundOut);
    if (danger || lord.hp < lord.maxHp * 0.5) {
      g.order = 'move'; g.dest.x = -8; g.dest.z = -28; g.speed = 2.5;
    }
  }
  if (F.step === 2 && !relief && f.queue > 10 && f.pressure > 3 && weak &&
      rt.t >= (F.panicAt || 0) && (F.panicN || 0) < 4) {
    F.panicAt = rt.t + 12; F.panicN = (F.panicN || 0) + 1;
    weak.fleeing = true;
    weak.moraleFleeDir = { x: weak.pos.x < 2 ? -0.15 : 0.15, z: 1 };
    rt.say('足軽', '後ろから来よる！　押すな、川へ落ちるで！', 3);
  }
  for (const g of F.pursuit || []) {
    if (!g.tedoActive || g.routed) continue;
    if (g.tedoRole === 'ranged') { g.focus = fordTarget; continue; }
    if (g.tedoRole === 'second') { g.focus = weak; continue; }
    if (g.tedoRole === 'horse') g.focus = weakScore < 1.5 ? weak : null;
    if (g.tedoRole === 'front' || g.tedoRole === 'horse') {
      if (relief && F.step === 2 && !g.tedoRelieved) {
        g.tedoRelieved = true; g.order = 'hold'; g.aggro = 3;
        g.anchor.x = g.units[0].pos.x; g.anchor.z = Math.min(-64, g.units[0].pos.z); g.focus = null;
      } else if (!relief && g.tedoRelieved) {
        g.tedoRelieved = false; g.order = 'attack'; g.aggro = 8;
        const at = F.dp?.cur?.at || RG; g.anchor.x = at.x; g.anchor.z = at.z;
      }
    }
  }
}
// この戦だけ、刻限で殿を下げる。共通の段が敵を自動で敗走させる処理は使わない。
function preparePursuit(rt, steps, bank) {
  const all = rt.flags.pursuit || (rt.flags.pursuit = []);
  for (const s of steps) for (const w of s.tedoWaves || []) {
    w.groups = [];
    const front = w.foes(rt, { tdPush: true }), back = w.foes(rt, { tdPush: false });
    for (let i = 0; i < front.length; i++) {
      const sp = front[i], other = back[i] || sp;
      const g = enemyGroup(rt, { fixed: true, faction: 'uesugi', name: sp.name,
        // 柴田の旗本から北へ離し、集合中に待機中の追手を討たせない。
        // 先手は東、騎馬は西へ分け、下知で寄せる時も中央の縦列と重ねない。
        // 最初の二隊だけ十二メートル近づけ、殿が接敵前に刻限を迎える待ちを減らす。
        anchor: { x: bank ? 2 : s.tedoOpening ? (all.length === 0 ? 18 : -18) : /回り込む/.test(sp.name) ? 22 : sp.from.x * 0.3,
          z: bank ? -140 : s.tedoOpening ? -92 - all.length * 14 : -100 - all.length * 3 }, facing: 0,
        order: 'hold', noAI: true, fire: false, aggro: 0, seekRange: 0, width: sp.width || 12, formation: sp.formation || 'yari', morale: 90 }, dress(sp.list, UESUGI));
      g.tedoOpening = s.tedoOpening;
      g.dmgMult = 1; g.tedoBank = bank; g.tedoFlank = /回り込む/.test(sp.name); all.push(g); g.tedoBow = sp.kind === 'bow';
      g.tedoRole = g.tedoBow ? 'ranged' : sp.list.some((q) => q.type === 'cavalry') ? 'horse' : /二の手|回り込む/.test(sp.name) ? 'second' : 'front';
      g.tedoFrom = [sp.from, other.from];
      w.groups.push(g);
    }
  }
}
// 初めから置いた隊を動かす。段が替わっても出発済みの隊を引き戻さない。
function advancePursuit(g, at, push) {
  if (g.tedoActive || g.routed || !g.count) return;
  g.tedoActive = true; g.fixed = false; g.fire = true; g.aggro = 8; g.seekRange = 28;
  // 控えは待機を保ち、出発した追手だけは前線の隙へ寄せる。
  g.frontlineMobilize = true;
  if (g.tedoFlank) {
    g.order = 'path'; g.formation = 'column'; g.colW = 2;
    g.path = [[push ? -26 : 26, -58], [push ? -18 : 18, -40]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = at.x; q.anchor.z = at.z; };
  } else if (g.tedoBow) {
    g.order = 'move'; g.dest = { x: 16, z: -46 };
    g.onArrive = (q) => { q.order = 'hold'; q.anchor.x = 16; q.anchor.z = -46; };
  } else if (at.z > 0) {
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 2; g.speed = 3;
    g.path = [[2, FORD.z], [4, SOUTH.z]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = SOUTH.x; q.anchor.z = SOUTH.z; };
  } else {
    // 遠い寄せ口で攻撃の間合いを待たせず、まず殿の列へ歩かせる。
    g.order = 'move'; g.speed = 3; g.formation = 'yari'; g.yariRanks = 2;
    g.dest = { x: at.x, z: at.z };
    g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = at.x; q.anchor.z = at.z; };
  }
}
function tedoHold(o) {
  const s = hold({ ...o, waves: [] }), start = s.start;
  s.tedoLine = o.line !== undefined; s.tedoPush = !!o.push;
  s.tedoOpening = !!o.opening;
  s.tedoMain = !!o.readyMain && !o.waitCross;
  if (o.skip) s.skip = o.skip;
  s.tedoWaves = o.waves || []; s.max = o.dur + 60;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    // 敵を迎える範囲も札の持ち場に合わせる。働きを数える広い範囲まで
    // 追うと、本人だけが列を離れ「旗へ戻れ」との往復になる。
    C.botRadius = o.push ? 9 : o.line !== undefined ? 6 : (o.r || 14);
    // 殿は火の周りを守る。共通の十六歩の追撃で、敵と一緒に持ち場を離れない。
    for (const g of ctx.friends(rt)) if (g.count && !g.routed && g.order === 'hold') {
      g.aggro = 6; g.seekRange = 10; g.facing = Math.PI;
    }
    const flag = rt.flags.postFlag;
    // 旗は持ち場の脇に立てる。中心へ寄る本人の頭と進路に竿を重ねない。
    flag.position.set(C.at.x - 3, rt.world.heightAt(C.at.x - 3, C.at.z + 1), C.at.z + 1);
    flag.visible = true;
    // 持ち場へ着いたら追手を向く。火の中心へ振り向く案内を出し続けない。
    rt.marker('dp', C.at, o.label || '持ち場', { h: 3, guideRadius: C.botRadius, hideNear: C.botRadius, hideOnArrival: true });
    rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
    C.waves = s.tedoWaves; C.waveIdx = 0; C.foughtT = 0; C.emptyT = 0; C.clashAt = null;
    if (o.push) {
      rt.flags.playerHelp = false; // 前の持ち場の一撃だけで逆襲の手柄にしない。
      rt.say('柴田勝家', '早打ちじゃ！　組と火へ進め。追手へ槍をそろえ、深追いするな！', 4);
      // 太鼓に続く鬨の声は逆襲の時だけ。段が替わった後や倒れた後には鳴らさない。
      rt.after(2.4, () => {
        if (!rt.over && !rt.flags.ending && rt.player.u.alive && rt.flags.dp?.cur === C)
          rt.army.playFar('toki', C.at, 0.75);
      });
    }
    if (o.line !== undefined) {
      if (o.line === 0) releaseShibata(rt);
      // 行き先は今の持ち場の印だけ。先の火へ飛ばして退かせない。
      rt.unmark('line' + o.line);
    }
    for (const g of rt.flags.pursuit || []) if (g.tedoActive && !g.routed && !g.tedoBow &&
      (g.order === 'attack' || g.order === 'move')) {
      if (C.at.z <= 0) {
        g.anchor.x = C.at.x; g.anchor.z = C.at.z;
        if (g.order === 'move') {
          g.dest.x = C.at.x; g.dest.z = C.at.z;
          g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = C.at.x; q.anchor.z = C.at.z; };
        }
      }
      else if (g.tedoBank === 0) { const c = g.center(); g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = Math.min(-30, c.z); }
    }
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    while (C.waveIdx < C.waves.length && (el >= C.waves[C.waveIdx].t || C.emptyT >= 8)) {
      const w = C.waves[C.waveIdx++];
      w.sent = true; w.seen = false; C.emptyT = 0;
      for (const g of w.groups) {
        advancePursuit(g, C.at, m.tdPush !== false);
        C.groups.push(g);
      }
    }
    for (const w of C.waves) if (w.sent && !w.seen && w.say && rt.t >= (C.waveSayAt || 0) && w.groups.some((g) => g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u)))) {
      w.seen = true; C.waveSayAt = rt.t + 8; rt.say(w.say[0], w.say[1], 3.5);
    }
    // 持ち場に立つだけでは成功にしない。追手が列を割って居座れば失敗。
    if (rt.t >= (C.scanAt || 0)) {
      C.scanAt = rt.t + 0.5; C.inside = 0; C.allies = 0; C.contact = 0; C.meleeContact = 0; C.melee = false; C.nearPlayer = false; C.nearFoes = 0; C.frontThreat = false;
      C.closeFoes = 0; C.closeAllies = 0; C.closeFoeSectors = 0;
      C.faceYaw = null; C.faceDistance = 25;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.group?.routed &&
        (u.pos.z > 24) === (C.at.z > 0)) {
        const d = Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z);
        // 火の周りの人数だけでは、少し手前で取り残された本人の包囲を見落とす。
        if (!u.noTarget && !u.isStruct && !u.isPlayer && u.type !== 'bow' && u.type !== 'gun' &&
            Math.abs(u.pos.y - rt.player.u.pos.y) < 1.8 &&
            Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 7) {
          if (u.team === 1) {
            C.closeFoes++;
            // 周囲を四方向に分け、正面の一列を「包囲」と取り違えない。
            const angle = Math.atan2(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
            const sector = Math.floor((angle + Math.PI + Math.PI / 4) / (Math.PI / 2)) & 3;
            C.closeFoeSectors |= 1 << sector;
          }
          else if (u.team === 0) C.closeAllies++;
        }
        if (u.team === 1) {
          if (d < 7) C.inside++; if (d < 22) C.contact++;
          if (d < 22 && !u.noTarget && !u.isStruct && u.type !== 'bow' && u.type !== 'gun') C.meleeContact++;
          if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 25) {
            C.nearPlayer = true;
            // 二十五歩先の槍列だけでは、目の前の追手が足りているとは数えない。
            if (!u.noTarget && !u.isStruct && u.type !== 'bow' && u.type !== 'gun' &&
                Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 12) C.nearFoes++;
          }
          const p = rt.player.u, dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
          const reach = Math.hypot(dx, dz);
          // 既存の半秒ごとの見回りで、見えている近い追手の向きも覚える。
          // 背後や横へ回った敵がいても、北へ向けという古い下知を出さない。
          const attackingPlayer = reach < 8 && (u.target === p || u.atk?.target === p || u.swing?.target === p);
          if (!u.noTarget && !u.isStruct && reach < C.faceDistance &&
              Math.abs(u.pos.y - p.pos.y) < 1.8 &&
              (sightUnit(rt, u) || attackingPlayer && !rt.army.wallBetween(u.pos, u.team, p.pos))) {
            C.faceDistance = reach; C.faceYaw = Math.atan2(dx, dz);
          }
          if (!u.noTarget && !u.isStruct && u.type !== 'bow' && u.type !== 'gun' &&
              Math.abs(u.pos.y - p.pos.y) < 1.8 && reach < Math.max(p.reach, u.reach) + 1.5 &&
              !rt.army.wallBetween(u.pos, u.team, p.pos) &&
              dx * Math.sin(p.heading) + dz * Math.cos(p.heading) > reach * 0.5) C.frontThreat = true;
        }
        else if (d < 12) C.allies++;
        const a = u.atk && !u.atk.ranged && !u.atk.bow ? u.atk : u.swing && !u.swing.done ? u.swing : null;
        const target = a?.target || u.bind?.o;
        if (d < 22 && target?.alive && target.team !== u.team &&
            Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) <= u.reach + 0.8) C.melee = true;
      }
    }
    // 二十二歩先に槍が見えるだけでは接敵にしない。打ち合いも接近もなければ寄せ直す。
    // 一人の騎馬や味方の打ち合いは待ち、遠射する弓衆だけでは寄せ直しを止めない。
    C.emptyT = C.frontThreat || C.melee ? 0 : C.emptyT + dt;
    // 斬り合いが途切れたら、既に出発した近い備えを寄せ直す。
    if (C.emptyT >= 8 && rt.t >= (C.pursuitAt || 0)) {
      C.pursuitAt = rt.t + 8;
      let next = null, nearest = Infinity;
      for (const g of rt.flags.pursuit || []) {
        if (g.routed || !g.count || g.tedoBow || g.tedoRelieved || g.tedoBank !== (C.at.z > 0 ? 1 : 0)) continue;
        // どの持ち場でも出発済みの追手だけ寄せ直す。未出発の隊は各段の
        // 下知で出す。待ち時間だけで後の全ての備えを呼ぶと、退き口を塞いでしまう。
        if (!g.tedoActive) continue;
        // 近くで止まった先手を寄せ直す。攻撃待ちというだけで遠い控えを
        // 優先すると、目前は静かなまま後続だけが重なってしまう。
        const c = g.center(), d = Math.hypot(c.x - C.at.x, c.z - C.at.z);
        if (d < nearest && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) { next = g; nearest = d; }
      }
      if (next && C.at.z <= 0) {
        advancePursuit(next, C.at, m.tdPush !== false);
        next.tedoRelieved = false; next.focus = null; next.order = 'move'; next.speed = 3;
        next.dest ??= { x: 0, z: 0 }; next.dest.x = C.at.x; next.dest.z = C.at.z;
        next.onArrive = (g) => { g.order = 'attack'; g.aggro = 8; };
      }
    }
    // 突き合いだけでなく、味方と並び目前の追手へ構えた時間も殿の働き。
    // 敵のいない場所や、背を向けた待機は数えない。
    const guardingLine = C.frontThreat && rt.player.guard && C.allies >= 3;
    if ((C.melee || guardingLine) && Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < (o.r || 14) + 8) {
      C.clashAt ??= rt.t; C.foughtT += dt;
    }
    // 味方が三人残っていても、火の内側を倍以上の敵に埋められたら列は保てない。
    // 一時の寄せは立て直せるが、厚い敵の中へ居残る任務を続けない。
    const brokenLine = C.inside >= 4 && C.allies < 3 || C.inside >= 8 && C.inside >= C.allies * 2;
    C.breachT = brokenLine ? (C.breachT || 0) + dt : 0;
    // 北岸で本人の支えが失われたら、深手になる前に渡河の下知へ切り替える。
    // 一瞬の接近や、遠くの敵の人数だけでは退かせない。南岸の迎えの任務は既存の判定を保つ。
    // 押し出されて持ち場の外へ出た本人も数える。輪の外だからと戻らせると、
    // 追手の中を往復させる。既に川へ入った者には北岸へ退く下知を出さない。
    // 三方向、または向かい合う二方向を塞がれたら包囲。正面の一列では退かせない。
    // 人数比を保ち、警告後に下がる猶予を置く。挟まれた本人を持ち場へ戻さない。
    const sectors = C.closeFoeSectors, otherSectors = sectors & (sectors - 1);
    const surrounded = (otherSectors & (otherSectors - 1)) !== 0 ||
      (sectors & 5) === 5 || (sectors & 10) === 10;
    const isolated = surrounded && C.at.z < 0 && rt.player.u.pos.z < -24 + rt.player.u.pos.x * 0.1 &&
      C.closeFoes >= 4 && C.closeFoes >= Math.max(1, C.closeAllies) * 2;
    // 半秒ごとの人数の揺れで警告を毎回取り消さない。列へ戻れば速やかに解く。
    C.isolatedT = isolated ? (C.isolatedT || 0) + dt : Math.max(0, (C.isolatedT || 0) - dt * 2);
    if (C.isolatedT >= 0.5 && rt.t >= (C.isolationWarnAt || 0)) {
      C.isolationWarnAt = rt.t + 8;
      rt.bark('囲まれるぞ！　構えたまま味方の列へ下がれ', true);
    }
    if (C.isolatedT >= ISOLATION_LIMIT) {
      C.broken = true; rt.flags.lineBroken = true;
      rt.flags.holdReason = '北岸で追手に囲まれ、殿の持ち場を守れなかった';
      return true;
    }
    if (C.breachT >= 2 && !isolated && rt.t >= (C.breachWarnAt || 0)) {
      C.breachWarnAt = rt.t + 8;
      rt.bark('列が切られる！　組と戻り、追手を押し返せ', true);
    }
    // 列が切れても負けにはしない。持ち場を捨て、南岸へ渡って生きて退く（史実の退き口）。
    if (C.breachT >= BREACH_LIMIT) { C.broken = true; rt.flags.lineBroken = true; rt.flags.holdReason = '追手に持ち場を破られ、味方の列が切れた'; return true; }
    // 遅れて追手が来ても、構えて八秒守る前に刻限を迎えないようにする。
    // 最初の防戦も含め、延長は三十秒まで。追手が来ないままなら元の刻限で退く。
    if (C.clashAt !== null && C.clashAt - C.t0 > s.max - 24)
      s.max = Math.min(o.dur + 90, Math.max(s.max, C.clashAt - C.t0 + 24));
    if (el > s.max) {
      C.timeout = true; return true;
    }
    const p = rt.player.u.pos;
    // 殿は討取りだけが働きではない。目の前の追手へ槍を構え、味方三人と八秒列を保つ。
    // 遠くの斬り合いや、敵のいない持ち場で構えるだけでは数えない。
    if (o.push && !rt.flags.playerHelp) {
      const inLine = C.allies >= 3 && C.breachT === 0 && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 9;
      // 構え直しや敵の半歩の後退では、既に守った働きを消さない。列を離れたらやり直す。
      if (!inLine) C.supportT = 0;
      else if (C.frontThreat && rt.player.guard) C.supportT = Math.min(8, (C.supportT || 0) + dt);
      if (C.supportT >= 8) {
        rt.flags.playerHelp = true;
        // 構えて守った八秒を、渡り口を支えた八秒にも数える。
        // この後さらに八秒待たせると、案内どおり守っても刻限で失敗する。
        rt.flags.pushTime = Math.max(rt.flags.pushTime, C.supportT);
      }
    }
    // 組が先に追手を退けた時も、列をそろえて渡り口を空けられる。
    if (o.push && tedoCleared(C) && C.allies >= 3 && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 9) rt.flags.playerHelp = true;
    if (o.push && el >= 8 && rt.flags.playerHelp && C.breachT === 0 && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 9 && C.allies >= 3 &&
        (C.contact > 0 || rt.t < rt.flags.reliefUntil || tedoCleared(C)) && rt.flags.pushTime < 30) {
      rt.flags.pushTime = Math.min(30, rt.flags.pushTime + dt);
      if (rt.flags.pushTime >= 8) {
        rt.flags.reliefUntil = rt.t + 8;
        if (!C.reliefSaid) {
          C.reliefSaid = true;
          rt.say('組頭', 'よう押した！　渡る列が動いたぞ。深追いせず、ここを守れ！', 4);
        }
      }
    }
    const postDistance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
    const atPost = postDistance < (o.r || 14) + 8;
    C.awayT = atPost ? 0 : (C.awayT || 0) + dt;
    if (atPost) { C.inT += dt; C.absenceSaid = false; }
    const F = rt.flags;
    if (el > 20 && C.awayT > 8 && !C.absenceSaid && rt.t >= (F.absenceAt || 0) && (F.absenceN || 0) < 3) {
      C.absenceSaid = true; F.absenceAt = rt.t + 30;
      rt.say('組頭', ABSENCE_LINES[F.absenceN || 0], 4); F.absenceN = (F.absenceN || 0) + 1;
    }
    // 追手が遠い時にも、何のために持ち場を守るかを残す。
    const crossingProgress = F.mainCross < 35 ? '本隊が渡り始めた。組と火を守れ' :
      F.mainCross < 75 ? '本隊は川の中。組と火を守れ' :
      F.mainCross < 100 ? '本隊の後続が渡る。組と火を守れ' : '本隊は渡った。下知まで列を保て';
    const pushProgress = Math.hypot(p.x - C.at.x, p.z - C.at.z) >= 9 ? '火のそばへ寄れ。遠くの追手を追うな' :
      C.allies < 3 ? '火のそばで味方と並び、本隊を渡せ' :
      !C.meleeContact && !C.nearFoes && !C.melee ?
        crossingProgress :
      !F.playerHelp ? C.supportT > 0 ? `追手へ槍を構え、列を保て。あと${Math.ceil(8 - C.supportT)}秒` : riverGuardText(true) :
      F.pushTime < 8 ? `味方と火を守れ。あと${Math.ceil(8 - F.pushTime)}秒` : '渡る列が動いた。下知まで火のそばを守れ';
    const progress = C.isolatedT > 0 ? '囲まれるぞ！　槍を向けたまま味方へ下がれ' : C.breachT > 0 ? '追手が列を割る！　組と押し返せ' : !atPost ? 'かがり火の持ち場へ戻れ' :
      o.push && C.allies < 3 ? pushProgress :
      riverFacingHint(rt, C) ? riverTurnText(rt, C) :
      C.frontThreat && !rt.player.guard ? riverGuardText(!!o.push && !F.playerHelp) :
      o.push ? pushProgress : guardingLine && C.foughtT < 8 ? `追手へ構え、列を保て。あと${Math.ceil(8 - C.foughtT)}秒` : !C.meleeContact && !C.nearFoes && !C.melee ? (postDistance >= (o.r || 14) ? '火のそばへ寄れ。組の列を離れるな' :
        C.at.z > 0 ? (F.mainCross < 100 ? '本隊の後続が渡る。岸で迎えよ' : F.crossRemaining ? `渡る味方 あと${F.crossRemaining}人。岸で迎えよ` : '味方は渡った。追手を岸で止めよ') : crossingProgress) : o.waitCross ?
      (F.mainCross < 100 ? '本隊の後続が渡る。岸で迎えよ' : F.crossRemaining ? `渡る味方 あと${F.crossRemaining}人。岸で迎えよ` : '味方は渡った。追手を岸で止めよ') :
      F.mainCross < 35 ? '本隊が渡り始めた。追手を止めよ' : F.mainCross < 75 ? '本隊は川の中じゃ。列を守れ' :
      F.mainCross < 100 ? '本隊の後続を渡せ。持ちこたえよ' : '本隊は渡った。殿の列を保て';
    rt.objProgress('dp', progress);
    // 本隊が渡った後の退く線では、敵の来ない火へ居残らせない。
    // 追手を出し終え、味方と持ち場を保って八秒静かなら、次の火へ列を下げる。
    // 初めの防戦・逆襲・南岸の迎えは、元の接敵と渡河の条件を保つ。
    C.orderlyWithdrawal = s.tedoLine && F.mainCross >= 100 &&
      C.waveIdx === C.waves.length && C.emptyT >= 8 && C.inT >= 8 &&
      postDistance < C.botRadius && C.allies >= 3 && !C.contact &&
      !C.breachT && !C.isolatedT;
    if (C.orderlyWithdrawal) return true;
    return el >= o.dur && tedoHeld(C, rt.flags) && C.inT >= o.dur * 0.5 && (!o.push || rt.flags.playerHelp && rt.flags.pushTime >= 8) && (!o.waitCross || rt.flags.crossRemaining === 0) && (!o.readyMain || rt.flags.mainCross >= 100);
  };
  s.end = (rt, C) => {
    rt.flags.postFlag.visible = false;
    rt.unmark('dp'); rt.unzone('dp');
    const won = !C.timeout && !C.broken && !rt.flags.failedHold && (C.orderlyWithdrawal || tedoHeld(C, rt.flags) && C.inT >= o.dur * 0.5) && (!o.waitCross || rt.flags.crossRemaining === 0) &&
      (!o.push || rt.flags.playerHelp && rt.flags.pushTime >= 8) && (!o.readyMain || rt.flags.mainCross >= 100);
    if (won) {
      if (C.at.z < 0) rt.flags.heldNorthLine = true;
      rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward);
    }
    else { rt.flags.holdReason ||= o.push && !rt.flags.playerHelp ? '追手を押し返す前に、退く刻限が来た' : !tedoHeld(C, rt.flags) ? '追手を抑えきれず、列が乱れた' : o.push && rt.flags.pushTime < 8 ? '押せず、渡り口が詰まった' : o.readyMain && rt.flags.mainCross < 100 ? '本隊が川に取り残された' : C.timeout && o.waitCross && rt.flags.crossRemaining > 0 ? '遅れた味方が川に取り残された' : '持ち場が空き、殿の列が乱れた'; rt.flags.failedHold = true; rt.objFail('dp'); rt.say('組頭', rt.flags.holdReason + '。残る列と退け！', 4); }
    if (!won) { const D = rt.flags.dp; D.steps.length = D.i + 1; D.done = null; }
    // 段が替わっても追手を消さず、損害による敗走も回復させない。
  };
  return s;
}
// 寄せを早く退けても、斬り合う秒数の不足で失敗にはしない。
function tedoCleared(C) {
  if (C.waveIdx !== C.waves.length || !C.groups.length) return false;
  let pursuers = false;
  for (const g of C.groups) {
    // 岸の弓衆を討ち尽くすのは殿の役目ではない。槍の追手を退けた働きを認める。
    // 弓衆だけの段を、何もせず守り切ったとは扱わない。
    if (g.tedoBow) continue;
    pursuers = true;
    if (!g.routed) for (const u of g.units)
      if (u.alive && !u.gone && !u.fleeing && !u.woundOut) return false;
  }
  return pursuers;
}
function tedoHeld(C, F) {
  return C.foughtT >= 8 || tedoCleared(C);
}
function tedoCtx(rt) {
  const F = rt.flags;
  return { calmRest: false, botTreatAt: 0.75, friends: () => F.rear.order === 'path' ? NO_FRIENDS : F.rearFriends };
}
function tedoA() {
  return [
    tedoHold({ at: RG, dur: 24, r: 12, opening: true, title: '最初の追手を止める', sub: '前は上杉、背は濁流', label: '殿の持ち場', obj: '旗のそばで追手を防げ',
      say: [['組頭', '北を向け！　追手へ槍を出せ。敵の槍は受け止めよ！']],
      waves: [
        { t: 2, say: ['組頭', '上杉の先手じゃ！　川へ通すな！'], foes: () => [{ name: '上杉の先手', from: RR.front, list: [uS(1), uA(18)] }] },
      ], reward: '柴田の殿に列を集めた' }),
    tedoHold({ at: RG, dur: 28, r: 12, opening: true, title: '次の追手に備える', sub: '味方の列で槍をそろえる', label: '殿の持ち場', obj: '火のそばで追手を防げ',
      say: [['組頭', '追うな！　火のそばで次の追手を止めよ！']],
      waves: [
        { t: 2, say: ['足軽', '馬がこっちへ来よる！　槍を出せ！'], foes: () => [{ name: '上杉の騎馬', from: RR.fl, list: [uS(1, { horse: true }), uC(6)] }] },
      ], reward: '北岸で二度目の追手を止めた' }),
    tedoHold({ at: PUSH, dur: 50, r: 6, push: true, title: '前へ出て押し止める', sub: '追手を押し返し、渡り口を空ける', label: '押し返す持ち場', obj: '組と火へ進み、追手へ槍を構えよ',
      waves: [
        { t: 4, say: ['足軽', 'また来たで！　後ろにも槍が見える！'], foes: () => [{ name: '上杉の先手の後続', from: RR.front, list: [uS(1), uA(14)] }] },
        { t: 24, say: ['組頭', '射手じゃ！　渡り口へ矢を射ておる！'], foes: () => [gunLine('上杉の弓衆', RR.fr, FORD, 6, { list: [uS(1), { type: 'bow', n: 6 }], kind: 'bow' })] },
      ], reward: '追手を押し返し、味方を渡した' }),
    // 最後の横手が寄せた後、渡河と持ち場の働きがそろえば列を下げる。
    tedoHold({ at: (rt, m) => m.tdPush === false ? RETREAT_LINES[0] : PUSH, dur: 45, readyMain: true, r: 10, title: '本隊が渡るまで', sub: '上杉の後ろの備えは、まだ崩れない', label: '本隊を渡す持ち場', obj: '追手を止め、本隊を渡せ',
      waves: [
        { t: 5, say: ['足軽', '向こうにも槍が見えるで！'], foes: () => [{ name: '上杉の本隊の先', from: RR.front, list: [uS(1), uA(6)] }] },
        { t: 25, say: ['足軽', '逃げる味方へ寄せてきよる！'], foes: () => [{ name: '上杉の二の手', from: RR.fr, list: [uS(1), uA(6)] }] },
        { t: 42, say: ['組頭', '横から来る！　列を切らせるな！'], foes: (rt, m) => [{ name: '回り込む上杉勢', from: m.tdPush === false ? RR.right : RR.left, list: [uS(1), uA(7)] }] },
      ], reward: '崩れぬ上杉を背に本隊を渡した' }),
    ...RETREAT_LINES.map((at, i) => tedoHold({ at, line: i, dur: i === 2 ? 16 : 18, r: 6,
      // 手負いは列を下げる持ち場を飛ばし、そのまま渡り口へ退く。
      skip: (rt) => needsWoundedRetreat(rt.player.u),
      title: ['殿の列を下げる', '川原で踏みとどまる', '渡る味方を守る'][i], sub: '北へ槍を向けよ', label: RETREAT_NAMES[i],
      obj: `${RETREAT_NAMES[i]}へ下がり、列を保て`,
      say: [['組頭', ['北へ槍を向けよ！', '隣の者と列を保て！', '下知まで追手を通すな！'][i]]],
      // 退く線で敵に会わない間が三十秒を超えた（10/6 測り）。下がる列へ追いすがる小勢を一つずつ寄せる。
      waves: [{ t: 6, say: ['足軽', ['追手がすぐそこだで！　槍を向けろ！', 'まだ追ってきよる！', '川へ落ちるで！　踏ん張れ！'][i]], foes: () => [{ name: '追いすがる上杉勢', from: RR.front, list: [uA(4)] }] }],
      reward: `${RETREAT_NAMES[i]}で殿をまとめて退いた` })),
  ];
}
function tedoB() {
  const S = { x: SOUTH.x, z: SOUTH.z - 2 };
  return [
    tedoHold({ at: S, dur: 65, waitCross: true, readyMain: true, r: 14, title: '南の岸の殿', sub: '遅れた味方を迎え、退き道を守る', label: '南の岸', obj: '南岸で追手を止め、味方を迎えよ',
      say: [['組頭', '岸へ上がった者は南へ！　殿は追手を抑えよ！']],
      waves: [
        { t: 5, say: ['足軽', '追手も渡ってきよる！'], foes: () => [{ name: '渡ってくる上杉勢', from: { x: -10, z: -24 }, list: [uS(1), uA(8)], mass: 220 }] },
        { t: 38, say: ['足軽', '向こう岸から矢が来るで！　伏せろ！'], foes: () => [gunLine('北の岸の弓衆', { x: 10, z: -34 }, S, 5, { list: [uS(1), { type: 'bow', n: 5 }], kind: 'bow' })] },
      ], reward: '南の岸で退く列を支えた' }),
  ];
}

// 両軍の総勢（柴田勝家の軍 三万ほど、上杉勢 二万ほど。数と戦の大きさには諸説ある）
tedorigawa.force = (rt) => {
  let a = 0, b = 0;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) { if (u.team === 0) a++; else if (u.team === 1) b++; }
  const F = rt.flags; F.forceA0 ??= a; F.forceB0 ??= b;
  return { a, a0: F.forceA0, b, b0: F.forceB0 };
};
tedorigawa.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '上杉軍', mon: 'uesugi' } };
// 上杉の追撃隊の将名は補わない。出陣名簿の味方三将は、初期の侍を置き換えている。
tedorigawa.famous = [];
tedorigawa.date = () => '天正五年九月　秋・夜';
tedorigawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 24 ? '退きの下知まで待つ' : '');
tedorigawa.skip = (rt) => { if (rt.phase === 'brief') {
  // 七尾落城の知らせは既に届いた。後続の下知や列の動きは早めない。
  const tm = rt.flags.retreatTimer; if (tm) tm.t = Math.min(tm.t, 0.2);
} };
// 出典：信長公記 巻十『柴田北国相働之事』。https://ja.wikisource.org/wiki/信長公記
tedorigawa.history = '天正五年（1577）、信長は柴田勝家を大将として、丹羽長秀・前田利家・羽柴秀吉らを加賀へ出した。信長公記には、織田勢が手取川を越えて各地を焼き払い、秀吉が信長に届けず帰陣して怒りを買ったとある。秀吉は勝家と言い争って陣を離れたともいうが、言い争いの細かな経緯や台詞は同書にない。秀吉は本戦に置かず、離陣は組頭の知らせで振り返る。七尾城が落ちた後、織田勢が雨で増えた手取川で上杉勢に追われたとも伝わるが、信長公記には、この合戦や敗北の記述はない。下知が届かぬ混乱と殿の持ち場は、退き口を遊ぶための補い。斎藤朝信は謙信の書状写では末森の守りに置かれており、追撃の先手としては出さない。水島・松任の陣所と川岸の正確な距離は復元していない。謙信・滝川の局地の陣、各将の渡る順、殿の組頭、雨中の弓、渡り口や進行の間隔は創作。川の幅と傾きは局地の仮置きで、当時の実測ではない。目の前で戦う兵と、遠くに続く軽い作りの大軍で退き口を描く。兵数は織田三万・上杉二万を仮置きし、織田四万などの異説もある。戦の大きさ、日付、兵の数には諸説ある。';

// 素直な遊び手：渡り口まで退き、岸で追手と戦い、川を渡る
// 退く下知の間は共通の退避や性格の突進で、居残る味方・敵の方へ引き戻さない。
const NO_FRIENDS = [];
tedorigawa.botEvacuating = (b) => {
  const C = b.flags.dp?.cur;
  return b.flags.step === 1 || b.flags.step === 3 || (b.flags.step === 2 && C?.at &&
    // 包囲の警告中は近い敵を追わず、持ち場の味方へ構えたまま下がる。
    (C.isolatedT >= 0.5 ||
    // 追手を探す範囲より狭い、実際の火の持ち場まで移る。札と同じ距離を使う。
    (C.s.tedoLine || C.s.tedoPush) &&
    Math.hypot(b.player.u.pos.x - C.at.x, b.player.u.pos.z - C.at.z) > (C.s.tedoPush ? 9 : 6)));
};
tedorigawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  // 前の構えで押した後ろ・横の足が残ると、前進と打ち消し合って動かなくなる。
  inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (!u.alive || F.ending) return;
  if (tedorigawa.botEvacuating(b)) {
    b.botRest = false; F.dpBack = false;
    const q = F.step === 1 ? FORD : F.step === 3 ? crossingTarget(b) : F.dp.cur.at;
    const z = F.step === 1 ? FORD.z - 10 : q.z;
    const stopRadius = F.step === 3 ? 0.75 : 2;
    goTo(p, inp, q.x, z, stopRadius);
    inp.leftPressed = false; inp.chargeHold = false;
    const e = b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.woundOut && !o.noTarget &&
      o.type !== 'gun' && o.type !== 'bow' && !b.army.wallBetween(u.pos, -1, o.pos));
    // 他の味方と戦う敵のそばでも構え続けると、退く歩みと気力が失われる。
    // 自分への打ち込みを受ける間だけ振り向き、間が空けば浅瀬へ急ぐ。
    let face = null, nearest = Infinity;
    for (const o of b.army.threats || []) {
      if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.team === u.team ||
          o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const attacking = o.atk?.target === u || (o.swing && !o.swing.done && o.swing.target === u) ||
        (o.charging && o.target === u);
      if (!attacking || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < 4 && d < nearest) { face = o; nearest = d; }
    }
    if (!face && e?.target === u && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 2.6) face = e;
    inp.guardHold = !!face; inp.runHeld = !face;
    if (face) {
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      if (Math.hypot(q.x - u.pos.x, z - u.pos.z) > stopRadius) {
        const dx = q.x - u.pos.x, dz = z - u.pos.z;
        const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
        const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
        if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
      }
    }
    return;
  }
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  const c = F.shiba.center();
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const t = q.center(); if (t.z > -60) { goTo(p, inp, t.x, t.z, 2); return; } } goTo(p, inp, FORD.x + 2, FORD.z - 16, 2); return; }
  goTo(p, inp, c.x + 2, c.z - 4, 3);
};

tedorigawa.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  return c.z < SOUTH.z - 4 ? [[2, Math.max(c.z, FORD.z)], [2, SOUTH.z], [20, 104]] : [[20, 104]];
};
tedorigawa.withdrawTick = (rt, dt) => tedorigawa.flood(rt, dt);
export { tedorigawa };
