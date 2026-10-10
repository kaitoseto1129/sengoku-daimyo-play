import { spearReach } from './weapon_reality.js';
// 見た目の組み立て（lookParts・buildModel）：兵種と家から、頭・胴・手足・得物を選んで一人の形にする
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { faceOf, lodSwap, flagMaterial, umaGeometry } from './units_flags.js';
import { HAIR, FACES, headGeometry, geoCache, bodyGeometry, merge, soheiLook, thighGeometry, shinGeometry, armGeometry, MAT, makeWeapon, flagGeo, poseArms, P, at, MK, nanbanMaterial } from './units_model.js';
import * as THREE from 'three';

// 見た目の値から形の鍵を作る（同じ見た目の兵は形を共有する）
function lookKey(look) {
  return [look.nanban || 0, look.armor, look.lace, look.hat, look.hatColor ?? '', look.helm ?? '', look.doStyle || '', look.kote ?? '', look.sode ? 1 : 0, look.haori || 0, look.pole ? 1 : 0, look.saya ? 1 : 0, look.menpo || 0, look.menpoStyle || '', look.horo || 0, look.trim || 0, look.left || '', look.cloth || 0, look.tier, (look.vi || 0) % 6, look.mon || '', look.haoriMon || '', look.haoriMonCol || 0xe6dfcf, look.tenugui ? 1 : 0, look.dirt ?? '', look.weapon === 'bow' ? 'b' : '', look.sohei ? 's' + look.soheiV + '/' + (look.kato || 0) + '/' + (look.kesa || 0) + (look.haramaki ? 'h' : '') : ''].join('|');
}
function tierOf(look) { return look.tier ?? (look.haori ? 2 : look.hat && look.hat.startsWith('kabuto') ? 1 : 0); }
function headOf(look, hi) {
  const T = look.tier;
  const F = faceOf(look);
  const skin = look.skin || 0xb58c68;
  const hair = F.hair || look.hair || HAIR.black;
  const fkey = typeof look.face === 'string' ? look.face : 'f' + ((look.face | 0) % FACES.length);
  const F2 = { ...F, neck: [0.95, 1.1, 1.2, 1.25][T] };
  const hdirt = look.dirt ?? [0.7, 0.45, 0.3, 0.15][T];
  // 僧兵（humans.js が monk を付ける）：剃った頭で髷がなく、耳は裹頭の中（布から突き出ないよう形にしない）
  if (look.monk) { F2.monk = 1; F2.t = (F.t || 0) % 3; }   // 髭も剃る（顔の模様は剃り跡・無精髭だけ）
  return headGeometry(fkey + '|' + T + (look.monk ? '|m' : ''), F2, skin, hair, hi, hdirt);
}
// 軽い形の頭：顔と、頭に付く物（陣笠・鉢巻・兜・面頬）を一つの形に（首を振っても、倒れても、笠が頭から離れないよう）
function headWithHat(key, look, hi) {
  const ck = 'hh|' + key + '|' + (typeof look.face === 'string' ? look.face : look.face | 0) + '|' + (look.skin || 0) + '|' + (look.hair || 0) + (hi ? '|H' : '|L');
  if (geoCache.has(ck)) return geoCache.get(ck);
  const face = headOf(look, hi), hat = bodyGeometry(key, look, hi, 'head');
  const g = hat ? merge([face.clone(), hat.clone()]) : face;
  geoCache.set(ck, g);
  return g;
}
const koteOf = (look) => look.kote ?? (look.tier >= 1 ? 3 : [3, 3, 1, 3, 0, 3][(look.vi || 0) % 6]);
// 骨の入った人（humans.js）に着せる部品。どれも本編の兵と同じ形・同じ材質で、部位ごとに分けてある
// 胴まわり・草摺・袖・兜は立ち姿の体の座標、腕と脚の部品は関節を原点に下（-y）へ伸びる座標
// hi：false なら遠く用の軽い形（humans.js が遠くの兵に使う）
export function lookParts(look0, hi = true) {
  look0 = soheiLook(look0);
  const look = { ...look0, tier: tierOf(look0) };
  const key = lookKey(look);
  const kote = koteOf(look);
  const F = faceOf(look);
  return {
    look, key, F, skin: look.skin || 0xb58c68, hair: F.hair || look.hair || HAIR.black,
    torso: bodyGeometry(key, look, hi, 'torso'), hips: bodyGeometry(key, look, hi, 'hips'), haori: bodyGeometry(key, look, hi, 'haori'), back: bodyGeometry(key, look, hi, 'back'), koshi: bodyGeometry(key, look, hi, 'koshi'), pole: look.sohei ? null : bodyGeometry(key, look, hi, 'pole'),
    sodeP: bodyGeometry(key, look, hi, 'sodeP'), sodeN: bodyGeometry(key, look, hi, 'sodeN'), head: bodyGeometry(key, look, hi, 'head'),
    face: headOf(look, hi),
    thigh: thighGeometry(look, hi, 'armor'), leg: shinGeometry(look, hi, 'leg'), foot: shinGeometry(look, hi, 'foot'),
    upperP: armGeometry(look, 1, kote & 2, hi, 'upper'), foreP: armGeometry(look, 1, kote & 2, hi, 'fore'), handP: armGeometry(look, 1, kote & 2, hi, 'hand'),
    upperN: armGeometry(look, -1, kote & 1, hi, 'upper'), foreN: armGeometry(look, -1, kote & 1, hi, 'fore'), handN: armGeometry(look, -1, kote & 1, hi, 'hand'),
  };
}

// 兵の根元の行列の更新：隠れた兵（遠くの軽い兵の形で描く者など）は、子の部品の行列を辿らない。
//   見えた時は、隠れていた印（matrixWorldNeedsUpdate）から子まで直る。行列を強いて直す呼び出し（true）は今までどおり全部辿る
const _umw = THREE.Object3D.prototype.updateMatrixWorld;
function unitMW(force) {
  if (force === true) { _umw.call(this, true); return; }
  if (!this.visible) { this.matrixWorldNeedsUpdate = true; return; }
  _umw.call(this, force);
}
export function buildModel(u, look) {
  const root = new THREE.Group();
  root.updateMatrixWorld = unitMW;
  look = soheiLook(look);
  const T = tierOf(look);
  look = { ...look, tier: T };
  const key = lookKey(look);
  const mat = look.nanban && !look.kosode ? nanbanMaterial() : MAT;
  const body = new THREE.Mesh(bodyGeometry(key, look, true, 'nohead'), mat);
  body.userData.lookKey = key;
  lodSwap(body, body.geometry, bodyGeometry(key, look, false, 'nohead'));
  body.castShadow = true;
  root.add(body);
  // 顔と首（肌と髪の色、顔の形で作り分ける）。笠・兜は頭の形に入れる（首の動きについて行く）
  const head = new THREE.Mesh(headWithHat(key, look, true), mat);
  lodSwap(head, head.geometry, headWithHat(key, look, false));
  head.castShadow = true;
  body.add(head);
  const legL = new THREE.Mesh(thighGeometry(look, true), mat);
  const legR = new THREE.Mesh(thighGeometry(look, true), mat);
  lodSwap(legL, legL.geometry, thighGeometry(look, false), 12); lodSwap(legR, legR.geometry, thighGeometry(look, false), 12);
  legL.position.set(0.11, 0.74, 0);
  legR.position.set(-0.11, 0.74, 0);
  const shinL = new THREE.Mesh(shinGeometry(look, true), mat), shinR = new THREE.Mesh(shinGeometry(look, true), mat);
  lodSwap(shinL, shinL.geometry, shinGeometry(look, false), 12); lodSwap(shinR, shinR.geometry, shinGeometry(look, false), 12);
  shinL.position.set(0, -0.4, 0.01); shinR.position.set(0, -0.4, 0.01);
  legL.add(shinL); legR.add(shinR);
  legL.castShadow = legR.castShadow = shinL.castShadow = shinR.castShadow = true;
  root.add(legL, legR);
  const wpn = makeWeapon(look.weapon, look.weaponExtra || 0, look.spear);
  if (look.weapon === 'gun') {
    u.gunRainCover ??= !!wpn.userData.rainCover;
    if (wpn.userData.rainCover) wpn.userData.rainCover.visible = u.gunRainCover;
  }
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';   // 左右に向けてから上下（刀の振り・槍の払いが素直になる）
  hand.position.set(look.weapon === 'bow' ? -0.3 : 0.3, 1.08, 0.18);
  hand.add(wpn);
  // 馬印は大将本人に背負わせず、同じ隊の馬印持ちの右手に持たせる。竿と旗の形・材質は共有。
  u.standardFlag = null; u.standardFlagMat = null; u.standardFlagFaded = false;
  if (look.standard) {
    const yose = look.standard.startsWith('yose_') || look.standard === 'furin' || look.standard === 'takeda';
    const wide = look.standard === 'furin';
    const narrow = look.standard === 'hachisuka' || look.standard === 'yose_hachisuka';
    const pole = new THREE.Mesh(standardPole(yose, wide, narrow), mat);
    const cloth = new THREE.Mesh(flagGeo, flagMaterial(look.standard));
    cloth.position.set(0, yose ? 2.25 : 1.85, 0); cloth.scale.set(yose ? (wide ? 3 : 1.83) : 1.5, yose ? 5.14 : 1.8, 1);
    if (narrow) cloth.scale.x *= 0.65;
    // 手持ちの大きな幟も、近い指物と同じ視界の確保に使う。
    u.standardFlag = cloth;
    wpn.add(pole, cloth);
  }
  root.add(hand);
  let flag = null;
  if (look.flag) {
    flag = new THREE.Mesh(flagGeo, flagMaterial(look.flag));
    flag.position.set(0, 2.36, -0.24);
    flag.scale.setScalar(look.flagScale || 1);
    // 旗の形で兵種が読めるように：槍組の隊旗は細長い長旗、鉄砲の小旗は横に広い四角、騎馬は細く長い（吹流しに寄せる）。下の端の高さは変えない
    if (!look.hero) {
      const s = look.flagScale || 1, ty = u && u.type;
      const sh = ty === 'cavalry' ? [0.6, 1.25] : ty === 'gun' ? [1.2, 0.78] : ty === 'ashigaru' && s >= 1.8 ? [0.78, 1.12] : null;
      if (sh) { flag.scale.set(s * sh[0], s * sh[1], s); flag.position.y += 0.36 * s * (sh[1] - 1); }
    }
    if (look.flagShape) {
      const sh = look.flagShape === 1 ? [0.75, 1.15] : [1.15, 0.85];
      const oldY = flag.scale.y;
      flag.scale.x *= sh[0]; flag.scale.y *= sh[1];
      flag.position.y += 0.36 * (flag.scale.y - oldY);
    }
    if (look.flag === 'hachisuka' || look.flag === 'yose_hachisuka') flag.scale.x *= 0.65;
    // 本人の指物：旗の上に横手（横の竿）と竿の先の飾り
    if (look.hero) {
      const bar = new THREE.Mesh(heroFlagBar(), mat);
      flag.add(bar);
    }
    root.add(flag);
  }
  // 馬印（城主から）：背に高く掲げる
  let uma = null;
  if (look.uma) { uma = new THREE.Mesh(umaGeometry(look.uma), mat); uma.position.set(0, 0, -0.26); uma.castShadow = true; root.add(uma); }
  // 腕（胴の子にして、胴の上下や傾きについて行かせる）。籠手は両腕・左だけ・なし
  const kote = koteOf(look);
  const armR = new THREE.Mesh(armGeometry(look, 1, kote & 2, true), mat), armL = new THREE.Mesh(armGeometry(look, -1, kote & 1, true), mat);
  lodSwap(armR, armR.geometry, armGeometry(look, 1, kote & 2, false)); lodSwap(armL, armL.geometry, armGeometry(look, -1, kote & 1, false));
  armR.position.set(0.27, 1.37, 0); armL.position.set(-0.27, 1.37, 0);
  armR.castShadow = armL.castShadow = true;
  body.add(armR, armL);
  u.mesh = root; u.body = body; u.head = head; u.legL = legL; u.legR = legR; u.shinL = shinL; u.shinR = shinR; u.hand = hand; u.wpn = wpn; u.flag = flag; u.uma = uma;
  u.armR = armR; u.armL = armL; u.lookWeapon = look.weapon; u.look = look;
  if (look.weapon === 'spear' && !u.isPlayer) u.reach = spearReach(u);
  poseArms(u);
  return root;
}
function standardPole(tall = false, wide = false, narrow = false) {
  const width = (tall ? wide ? 1.1 : 0.68 : 0.55) * (narrow ? 0.65 : 1);
  const key = 'standardPole' + (tall ? wide ? '字旗' : '幟' : '') + (narrow ? '細' : '');
  if (!geoCache.has(key)) geoCache.set(key, merge([
    P(at(new THREE.CylinderGeometry(0.018, 0.021, tall ? 5.2 : 3.2, 6), 0, tall ? 1.55 : 0.65, 0), 0x3a2c1c, { mk: MK.wood }),
    P(at(new THREE.CylinderGeometry(0.009, 0.009, width, 5), width / 2, tall ? 4.1 : 2.5, 0, 0, 0, Math.PI / 2), 0x3a2c1c, { mk: MK.wood }),
  ]));
  return geoCache.get(key);
}
function heroFlagBar() {
  const k = 'herobar';
  if (geoCache.has(k)) return geoCache.get(k);
  const g = merge([
    P(at(new THREE.CylinderGeometry(0.009, 0.009, 0.38, 5), 0.18, 0.365, 0, 0, 0, Math.PI / 2), 0x2a1c12, { mk: MK.lac }),
    P(at(new THREE.ConeGeometry(0.018, 0.06, 6), 0, 0.41, 0), 0xa8893f, { mk: MK.gold }),
  ]);
  geoCache.set(k, g);
  return g;
}

export { lookKey, headOf };
