import { useTerrain } from './asset_manifest.js';
import * as THREE from 'three';
import { HISTORICAL_GENERALS } from './b_historical_generals.js';
import { lostCauseNote } from './battle_lost_cause.js';
import { retreatThroughGap, retreatDodge } from './bot_retreat.js';
import { contactLitter } from './army_ground.js';
// ======================================================================
// 織田家編　三方ヶ原の戦い（元亀三年十二月二十二日）
// 西へ攻め上る武田信玄の三万が、遠江の三方ヶ原を通り過ぎようとした。徳川家康は浜松城から打って出て、
// 信長が送った援軍（佐久間信盛・平手汎秀・水野信元。兵数には諸説）とともに挑んだが、夕刻の会戦で大敗した。
// 織田の援軍の平手汎秀は討ち死にし、家康は浜松城へ逃げ帰った。
// 足軽は平手汎秀の手（織田の援軍）。①夕暮れの台地で武田の先手を受け止める ②赤備えの騎馬に崩される
// ③平手の討ち死に。浜松城へ退く（追ってくる武田勢を振り切る）
// 向き：北（-z）から武田勢が来る。南（+z）の台地の下に浜松城
// ======================================================================
import { nobori, hut, dou, tawara, campfire, solidSeg, palisade, kabukimon,
  castleBoardFence, dorui, yagura, bobosaku, takataba, hiraTateGeo, castleMat } from './props.js';
import { S as SETTINGS } from './settings.js';
import { goten } from './castle_parts.js';
import { tabaGeo } from './taketaba.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { jinchiTick } from "./yasen_jinchi.js";
import { gauss, enemyGroup, allyGroup, nm, centerOf } from './bhelp.js';
import { dress, gone, more, applyLook, NIGHT } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
// 新しい波を出す時だけ数える。武将と供の余地を残し、遠景は本物へ替えない。
function depthLook(rt, list, style) {
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) room--;
  return dress(list.map((q) => {
    const n = Math.min(q.n, Math.max(0, room)); room -= n;
    return { ...q, n };
  }).filter((q) => q.n > 0), style);
}

import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot, rest, hold, move } from './b_depth.js';
import { camp } from './b_mid.js';
import { demSample } from './dem.js';
import { butaiTick } from './butai.js';
import { fieldButai, fieldTick } from './b_yasen.js';
import { jinkeiBuild } from './jinkei.js';
import { jinkeiDistantLayout } from './b_jinkei_layout.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const AR = KIT.ARMOR;
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 布陣資料の本陣を原点にする。既存の縮尺と浜松までの距離を保つ。
const LINE_Z = -260 / 16;                        // 織田の援軍の陣
const HIRATE_POST = { x: 260 / 16 + 3, z: LINE_Z + 4 }; // 槍列の後ろの持ち場。騎馬の大将へ重ねない。
const TAKEDA_HQ_Z = -1700 / 16;                  // 信玄は魚鱗の最奥、中央
const OYAMADA_FRONT = (1700 - 1085) / 16;
const TAKEDA_SECOND = (1700 - 1300) / 16;
const TAKEDA_THIRD = (1700 - 1500) / 16;
const TAKIGAWA_X = 380 / 16;
const HAMA = { x: 0, z: 2800 / 16 };            // 浜松城の方（退く先）
const SOUTH_SLOPE = { x: 14, z: 56 };
const REARGUARD_POST = { x: 14, z: 62 };
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };
const AKA = { flag: 'akazonae' };
const TOKU = { flag: 'tokugawa' };
// 遠景の背旗は三人に一人ほど。全員の背を幟で埋めず、列と兵の間を見せる。
// 史料上の携行率ではなく見通しの調整。隊の大旗・本物の兵・人数は保つ。
const MIKATA_FLAG_RATE = 0.32;
// 落ちた槍の握りは中央ではない。実際の石突と穂先から坂の傾きを取る。
function fallenSpear(army, u) {
  const w = u.dropped;
  // 幟の土台にも槍の部品がある。縦の竿は共通の落下処理で寝かせた姿勢を保つ。
  if (!w?.userData.flex || w.userData.standard || w.parent !== army.scene || w.userData.mikataGround) return;
  w.userData.mikataGround = true;
  const butt = w.userData.butt, tip = w.userData.tip;
  const a = w.rotation.y, sx = Math.sin(a), cz = Math.cos(a), x = w.position.x, z = w.position.z;
  const y0 = army.world.heightAt(x + sx * butt, z + cz * butt);
  const y1 = army.world.heightAt(x + sx * tip, z + cz * tip);
  const slope = Math.atan2(y1 - y0, tip - butt), sn = Math.sin(slope), cs = Math.cos(slope);
  let support = -Infinity;
  for (let i = 0; i <= 6; i++) {
    const t = butt + (tip - butt) * i / 6;
    support = Math.max(support, army.world.heightAt(x + sx * t * cs, z + cz * t * cs) - t * sn);
  }
  w.rotation.set(-slope, a, 0, 'YXZ');
  w.position.y = support + 0.018;
  // 中心線だけでなく、穂先と柄の太さも地面で支える。落とした時だけ調べる。
  contactLitter(w, army.world, u.pos.y, 0.018);
  w.position.y = Math.max(w.position.y, support + 0.018);
}
// 本人へ寄せる先頭は四人。退き口では三人に絞り、後続が同時に刃を重ねない。
function mikataCombatSpace(army, u) {
  const p = army.playerUnit, front = army.mikataFront;
  if (!front || !p?.alive || u.team === p.team || u.isStruct || u.noTarget) return null;
  // 城へ退く味方の後を、追手が門の中まで追わない。射手も城外で狙いを解く。
  const line = army.mikataGateLine;
  if (line != null && (u.pos.z > line || u.pos.z >= line - 4 &&
      (army.mikataReturned || u.target?.pos.z > line || u.atk?.target?.pos.z > line || u.swing?.target?.pos.z > line))) {
    const q = u._mkGateWait || (u._mkGateWait = { x: 0, z: 0 });
    q.x = u.pos.x; q.z = line - 5;
    u.charging = false;
    if (u.bind?.o?.bind?.o === u) u.bind.o.bind = null;
    return q;
  }
  if (u.type === 'bow' || u.type === 'gun' && !u.sidearm) return null;
  if (army.mikataFrontAt !== army.time) {
    army.mikataFrontAt = army.time;
    // 深手の本人へは先頭を二人に絞る。後続は待ちの輪に残し、乱戦の数は減らさない。
    const cap = p.hp < p.maxHp * 0.35 ? Math.min(army.mikataCap || 4, 2) : army.mikataCap || 4;
    // 近さが入れ替わるたびに攻撃を取り消さず、今受けている相手を保つ。
    for (let i = front.length - 1; i >= 0; i--) {
      const o = front[i];
      if (!o.alive || o.gone || o.fleeing || o.woundOut || o.downed || o.group?.routed ||
          o.target?.alive && o.target !== p || Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 8)
        front.splice(i, 1);
    }
    if (front.length > cap) front.length = cap;
    const kept = front.length;
    for (const o of army.units) {
      if (!o.alive || o.gone || o.fleeing || o.woundOut || o.downed || o.noTarget || o.isStruct || o.team === p.team || o.group?.routed ||
          o.type === 'bow' || o.type === 'gun' && !o.sidearm) continue;
      o._mkPlayerD = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (o._mkPlayerD > 32 || o.target?.alive && o.target !== p || front.includes(o)) continue;
      let i = kept;
      while (i < front.length && front[i]._mkPlayerD <= o._mkPlayerD) i++;
      if (i >= cap) continue;
      for (let j = Math.min(cap - 1, front.length); j > i; j--) front[j] = front[j - 1];
      front[i] = o;
    }
  }
  const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  if (d > 32 || front.includes(u)) { u._mkWaiting = false; return null; }
  if (d >= 12 && !u._mkWaiting && u.target !== p && u.atk?.target !== p && u.swing?.target !== p) return null;
  // 味方と戦っている後続はその列を保つ。本人の刃の届く所へは押し込まない。
  if (u.target?.alive && u.target !== p) { u._mkWaiting = false; return null; }
  u._mkWaiting = true;
  // 刃を待つ馬も突進を解く。狙いだけ消すと、後続が突撃中のまま退き口へ入る。
  u.charging = false;
  if (u.bind?.o === p && p.bind?.o === u) p.bind = null;
  const q = u._mkWait || (u._mkWait = { x: 0, z: 0 });
  let a = d > 0.1 ? Math.atan2(dx, dz) : u.heading;
  // 退けの後は下知の道を空ける。北に残る味方へ向かう輪には戻さない。
  const goal = army.mikataRetreatGoal;
  const safeA = goal && Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) > 2
    ? Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z) : army.playerSafeA;
  if (safeA != null) {
    const da = Math.atan2(Math.sin(a - safeA), Math.cos(a - safeA));
    if (Math.abs(da) < Math.PI / 4) a = safeA + (da < 0 ? -1 : 1) * Math.PI / 4;
  }
  // 後続を同じ半径へ押し込めず、二、三歩の奥行きを残す。
  const radius = 14 + (u.id % 3) * 1.4;
  q.x = p.pos.x + Math.sin(a) * radius; q.z = p.pos.z + Math.cos(a) * radius;
  return q;
}
// 薄暮（夕刻と夜のあいだ）：赤備えの突撃のころ。灯りが少なく、松明・旗・音が頼りになってくる
// 北は -z。西暦一月下旬の夕日は西南西へ沈む。照明と残照の方角をそろえる。
const WINTER_DUSK = { sky: 0x626b80, fog: 0x687080, sun: 0xe8ad8d, sunI: 1.1, hs: 0xd3cec0, hg: 0x81765b, hI: 1.8, top: 0x35455f, glow: 0.3, dir: [-1, 0.12, 0.45], mount: 0x293243 };
const TWILIGHT = { sky: 0x4c4a5c, fog: 0x55586b, sun: 0xe6a082, sunI: 1, hs: 0xc8c4bd, hg: 0x776c56, hI: 1.8, top: 0x232a40, glow: 0.25, dir: [-1, 0.06, 0.45], mount: 0x1a1e28 };
// 夜の空と霧は共通色のまま。具足と松を一様な白灰色へ持ち上げる光だけ控える。
const MIKATA_NIGHT = { ...NIGHT, time: 'night', sunI: 0.55, hI: 0.65 };

// 下知で空と地面を跳ねさせない。色の入れ物は段が替わる時だけ作る。
// 共通の補間を使い、映り込みは移ろいが終わった時に一度だけ更新する。
function fadeMikataLook(rt, look) {
  const W = rt.world, from = W.currentLook();
  const fromNight = W.nightAmount(), fromDusk = W.duskAmount();
  applyLook(rt, look, false);
  const to = W.currentLook();
  W.fade = { from, to, fromNight, fromDusk, t: 0, dur: 24, env: 0 };
  W.applyLook(from);
}

// 写真は構法の参考。元亀三年の浜松を土の城として推定し、後世の天守・総石垣は足さない。
// 野戦の正面を常設の柵で閉じず、陣具の控えは城寄りの道の両脇へ収める。
function mikataFieldProps(rt) {
  const W = rt.world, shieldSlots = [], matrix = new THREE.Matrix4();
  const shields = (ax, az, bx, bz, facing) => {
    const len = Math.hypot(bx - ax, bz - az), pairs = Math.max(1, Math.floor(len / 1.45));
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const rot = Math.atan2(-(bz - az), bx - ax) + facing;
    // 写真の置楯は二枚一組。組の間に隙間を残し、連続した板壁にしない。
    for (let i = 0; i < pairs; i++) {
      const t = (i + .5) / pairs, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      for (const side of [-1, 1]) {
        const stagger = side > 0 ? .045 : 0;
        shieldSlots.push([cx + tx * side * .28 - tz * stagger,
          cz + tz * side * .28 + tx * stagger, rot + side * .018]);
      }
      Object.assign(solidSeg(cx - tx * .55, cz - tz * .55, cx + tx * .55, cz + tz * .55, .25),
        { missileH: 1.6, missileType: 'wood' });
    }
  };
  // 幕の口は六メートルのまま。楯は写真の二枚矧ぎ・黒い横帯・裏の控え棒。
  // 紋の分からない楯へ別家の紋を描かず、家は幕と幟で見分ける。
  for (const z of [0, TAKEDA_JIN.honjin.z]) {
    // 黒帯の表を敵へ向け、控え棒は味方側へ置く。徳川は北、武田は南。
    const facing = z === 0 ? Math.PI : 0;
    shields(-9, z + 8.2, -4.2, z + 8.2, facing);
    shields(4.2, z + 8.2, 9, z + 8.2, facing);
    const mon = z === 0 ? 'tokugawa' : 'takeda';
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
      rt.scene.add(nobori(W, side * 9.8, z - 4 + i * 3.2, mon, 5.5));
    // 野戦の物見は屋根を掛けず、皮付き丸太と狭間のある楯囲いで組む。
    // 写真の張り出す見張り床も共通形を使う。配置は推定で、幕口と槍列を空ける。
    rt.scene.add(yagura(W, z === 0 ? -14 : 14, z - 5, {
      height: 6.4, boarded: false, fieldFrame: true, fieldGallery: true, barkPosts: true,
      // 横桟だけの手すりを縦格子へ。楯囲いは黄褐色の木地と裏桟へ回す結び縄を出す。
      fieldDetail: true, fieldLashings: true,
      mon, team: z === 0 ? 0 : 1, rot: z === 0 ? Math.PI : 0,
    }));
  }
  // 浜松城前の陣具置き場。中央の退路と城門への曲がり角は空ける。
  for (const side of [-1, 1]) {
    const x = side * 19, z = HAMA.z - 25;
    // 控えの陣具は据え置いた姿にする。射撃陣地用の掘割・残土は付けない。
    rt.scene.add(bobosaku(W, [x - 3, z - 4, x + 3, z - 4], { noTrench: true, noMound: true }));
    Object.assign(solidSeg(x - 3, z - 4, x + 3, z - 4, .2), { missileH: 2.2, missileType: 'wood' });
    shields(x - 2.2, z, x + 2.2, z, Math.PI);
    for (let i = 0; i < 3; i++) {
      const bundle = takataba(W, x - 2.4 + i * 2.4, z + 4, Math.PI, { fieldBundle: i !== 1 });
      // 城前の控えは中央の一基だけを車仕掛けにする。四束・三段縄は前巡の形を保つ。
      // 写真の細竹を各束へ詰める。近くは十九本、四十五メートル先は七本の共有形。
      // 車輪は遠景でも残し、距離で据え竹束へ姿が変わらないようにする。
      if (i === 1) {
        const lod = new THREE.LOD();
        lod.position.copy(bundle.position); lod.rotation.copy(bundle.rotation);
        const distant = new THREE.Mesh(tabaGeo(false, false, true), bundle.material);
        distant.receiveShadow = true;
        bundle.geometry = tabaGeo(false, false, true, true);
        bundle.position.set(0, 0, 0); bundle.rotation.set(0, 0, 0);
        lod.addLevel(bundle, 0); lod.addLevel(distant, 45);
        rt.scene.add(lod);
      } else rt.scene.add(bundle);
    }
  }
  // 楯は全て同じ形と材質で一度に描く。舞台を組む時だけ行列を作る。
  const mesh = new THREE.InstancedMesh(hiraTateGeo('plain', true), castleMat('wood'), shieldSlots.length);
  for (let i = 0; i < shieldSlots.length; i++) {
    const [x, z, rot] = shieldSlots[i];
    matrix.makeRotationY(rot); matrix.setPosition(x, W.heightAt(x, z), z); mesh.setMatrixAt(i, matrix);
  }
  mesh.castShadow = mesh.receiveShadow = true;
  rt.scene.add(mesh);
}

// 草の割合を残し、霜と轍は既存の地面に描く。面・素材・兵の数を増やさない。
function winterGround(W) {
  const mat = W.terrain.material, compile = mat.onBeforeCompile;
  const groundKey = mat.customProgramCacheKey();
  // 白い下地へ寒色の空が乗ると雪原に見える。土と枯草の地色を先に置く。
  mat.color.setRGB(0.64, 0.53, 0.39);
  // 下り坂を近い壁として抜くと、地面の下の空が青い穴になる。
  // 三方ヶ原の土は残し、視点の潜り込みは既存の地形判定で防ぐ。
  mat.userData.camNearSolid = true;
  mat.customProgramCacheKey = () => groundKey + '|三方ヶ原の冬の地面';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
      float roadX = wuv.y < 60.0 ? mix(6.0, 10.0, clamp((wuv.y + 16.25) / 76.25, 0.0, 1.0))
        : wuv.y < 104.0 ? mix(10.0, 14.0, clamp((wuv.y - 60.0) / 44.0, 0.0, 1.0))
        : mix(14.0, 0.0, clamp((wuv.y - 136.0) / 35.0, 0.0, 1.0));
      float roadSpan = step(-16.25, wuv.y) * (1.0 - step(175.0, wuv.y));
      float rutSide = wuv.x < roadX ? -1.0 : 1.0;
      float rutBend = sin(wuv.y * 0.19) * 0.14 + sin(wuv.y * 0.47 + rutSide) * 0.06;
      float rutWidth = 0.95 + sin(wuv.y * 0.12) * 0.1;
      float rutD = abs(abs(wuv.x - roadX - rutBend) - rutWidth);
      float rutBreak = smoothstep(-0.2, 0.55, sin(wuv.y * 0.83 + rutSide * 1.7)
        + sin(wuv.y * 1.37 + wuv.x * 0.6) * 0.45);
      float rut = (1.0 - smoothstep(0.06, 0.24, rutD)) * rutBreak * smoothstep(0.22, 0.48, macro2) * roadSpan;
      float roadside = (1.0 - smoothstep(2.0, 4.2, abs(wuv.x - roadX))) * roadSpan;
      // 蹄跡は土の窪みにまばらに残す。同じ輪を道いっぱいに整列させない。
      vec2 hoofGrid = vec2((wuv.x - roadX) * 1.7, wuv.y * 0.8);
      vec2 hoofTile = floor(hoofGrid);
      vec2 hoofHash = fract(hoofTile * vec2(0.1031, 0.11369));
      hoofHash += dot(hoofHash, hoofHash.yx + 19.19);
      float hoofSeed = fract(hoofHash.x * hoofHash.y);
      vec2 hoofCell = fract(hoofGrid) - 0.5;
      hoofCell -= (fract(vec2(hoofSeed * 31.0, hoofSeed * 23.0)) - 0.5) * 0.36;
      hoofCell.x += hoofCell.y * (hoofSeed - 0.5) * 0.9;
      float hoofD = length(hoofCell * vec2(1.0, 0.75));
      float hoof = (1.0 - smoothstep(0.025, 0.07, abs(hoofD - 0.16)))
        * smoothstep(-0.12, -0.03, hoofCell.y) * roadside * smoothstep(0.36, 0.55, macro2)
        * step(0.64, hoofSeed);
      float dryGrass = w.x * smoothstep(0.35, 0.65, macro2);
      col = mix(col, col * vec3(1.5, 0.78, 0.78), w.x * (0.75 + dryGrass * 0.2));
      // 槍列が踏み合う面に土塊と乾湿の斑を残す。既存の土の絵だけを使う。
      float clashSoil = (1.0 - smoothstep(8.0, 25.0, abs(wuv.x - 23.75)))
        * (1.0 - smoothstep(12.0, 32.0, abs(wuv.y + 26.0))) * (1.0 - wat);
      // 共通の地面にも clod・churn がある。同じ範囲で再宣言しない。
      float mikataClod = smoothstep(0.18, 0.48, dot(dirt, vec3(0.333)));
      float mikataChurn = clashSoil * (0.35 + 0.65 * smoothstep(0.32, 0.66, macro2));
      col = mix(col, col * vec3(0.63, 0.57, 0.48), mikataChurn * (0.65 - mikataClod * 0.35));
      col *= 1.0 - rut * 0.38 - hoof * 0.26;
      // 雨は降らせず、道の窪みに残った浅い水だけ示す。共通の照り返しも使う。
      float winterPool = roadside * (1.0 - smoothstep(0.24, 0.38, macro2))
        * smoothstep(0.6, 0.72, macro) * (1.0 - steep) * (1.0 - wat);
      pool = max(pool, winterPool);
      col = mix(col, vec3(0.12, 0.14, 0.16), winterPool * 0.65);
      float frost = smoothstep(0.57, 0.74, macro2) * smoothstep(0.42, 0.67, macro)
        * w.x * (1.0 - roadside) * (1.0 - clashSoil) * (1.0 - rut);
      col = mix(col, vec3(0.54, 0.51, 0.41), frost * 0.06);
      diffuseColor.rgb *= col;`);
  };
  mat.needsUpdate = true;
  // 足元の草も冬の色へ。既存の頂点色だけ変え、形と材質は増やさない。
  if (W.nearGrass?.instanceColor) {
    // 草は描く時に world.js が元の色の控え（nearC）から詰めて写すので、控えの色を変える
    const C = W.nearC || W.nearGrass.instanceColor.array, n = W.nearC ? W.nearN : W.nearGrass.count;
    for (let i = 0; i < n; i++) { C[i * 3] *= 1.8; C[i * 3 + 1] *= 0.82; C[i * 3 + 2] *= 1.05; }
    W.nearGrass.instanceColor.needsUpdate = true; W.nearDirty = true;
  }
  // 夜へ移る間も西南西の地平に残照を残す。月の向きとは別にする。
  const sky = W.skyMat;
  sky.uniforms.mikataSunset = { value: 1 };
  sky.fragmentShader = 'uniform float mikataSunset;\n' + sky.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', `
    float west = pow(max(0.0, dot(d.xz, normalize(vec2(-1.0, 0.45)))), 3.0) * exp(-abs(d.y - 0.035) * 11.0);
    c += vec3(0.55, 0.1, 0.055) * west * mikataSunset;
    gl_FragColor = vec4(c, 1.0);`);
  sky.needsUpdate = true;
}

// 共通の褒め言葉・叱責も、この戦では生きている上役へ引き継ぐ。
function livingVoice(rt, speaker) {
  const F = rt.flags;
  let dead = speaker === '平手汎秀' && F.hiraU && !F.hiraU.alive;
  if (!dead && (speaker === '佐脇藤八' || speaker === '長谷川橋介')) {
    for (const u of rt.army.units) if (u.name === speaker && !u.alive) { dead = true; break; }
  }
  if (!dead) return speaker;
  return F.sakuU?.alive ? '佐久間信盛' : '組頭';
}
// 共通の危機の声も、今の下知と同じ持ち場へ案内する。
function mikataOrderText(rt, speaker, text) {
  const F = rt.flags, withdrawing = F.step === 3 || F.dpOn && F.dpB;
  // 帰着後に共通の鼓舞が来ても、野戦の列へ戻らせない。
  if (F.returnedT !== undefined && /列を保て|槍列|構えよ|持ち場へ戻れ/.test(text))
    return '城に戻った者を数えよ。傷ついた者を助けよ！';
  if (speaker === '水野信元' && text === '浜松へ退く道を守れ！' && !withdrawing)
    return '平手の槍列に続け！　隙間を空けるな！';
  if (speaker === '組頭' && /味方が討ち減らされておる|味方がもう持たぬ/.test(text)) {
    if (F.step === 3) return '味方が崩れた！　東の道の印を追い、浜松へ退け！';
    if (F.dpOn && F.dpB) return F.dp?.i >= 2
      ? '味方が崩れた！　坂の上で追手を支え、味方を先に通せ！'
      : '味方が崩れた！　南の坂の印へ退け！';
    return '味方が減っておる！　平手の槍列で構え、深追いするな！';
  }
  return text;
}
// 持ち場が替わったら、前の向き・構えの声を待ち列から外す。記録と討死の報せは残す。
function renewOrders(rt) {
  const hud = rt.hud;
  const oldOrder = (line) => line && (/味方が討ち減らされておる|味方がもう持たぬ|味方が崩れた！/.test(line.text)
    || !/討ち|討たれ|死|負傷|傷を/.test(line.text)
    && /槍|列を保て|右|左|先手|鉄砲|赤備え|騎馬|旗|下知|坂|守|退|構え|銃口|筒先/.test(line.text));
  for (let i = hud.subQ.length - 1; i >= 0; i--) if (oldOrder(hud.subQ[i])) hud.subQ.splice(i, 1);
  if (oldOrder(hud.shownLine)) {
    hud.nextSub();
    // 隠れた字幕の残り時間は進まない。わずかな時間も残さず、古い下知を終える。
    hud.subT = 0; hud.shownLine = null; hud.shownGoalKey = null;
    hud.root.querySelector('#subtitle').textContent = '';
  }
}
function retreatDistant(rt) {
  const F = rt.flags;
  if (F.pursuit) return;
  F.pursuitSound = { x: -6, y: rt.world.heightAt(-6, 20), z: 20 };
  F.pursuit = rt.world.addDistantArmy({ x: -6, z: 20, w: 9, d: 8, count: 12, kind: 'cavalry',
    team: 1, armor: AR.takeda, flag: 'takeda', facing: 0, seed: 15729, host: false });
  F.pursuit.army.noWake = true;
  F.pursuit.moveTo(-6, 48, 24, { charge: true });
  rt.army.play('gallop', F.pursuitSound, 1.1);
  F.pursuitSoundT = rt.t + 5.5;
}

// 国土地理院の標高（三方原の台地。束0 の asset_dem_mikatagahara.js）。ゲームの 1 を実の 4m に縮め、
// 台地の上のゆるい起伏（北が少し高い）だけを手書きの base に足す
// 地面を作る前に読み終える。当たりの高さだけ後から変えない。
let mkDem = null;
useTerrain('dem_mikatagahara', (data) => { mkDem = data; });
const DEM_XY = 4;
function demRelief(x, z) {
  if (!mkDem) return 0;
  const sx = x * DEM_XY, sz = z * DEM_XY;
  if (Math.abs(sx) > 1580 || Math.abs(sz) > 1580) return 0;
  return (demSample(mkDem, sx, sz) - 30) * 0.7;
}
const sig = (v) => 1 / (1 + Math.exp(-v));
// 犀ヶ崖（台地の南の端に刻まれた深い谷）。東の端は浅く、道はその東を下る（崖は登れず、道を通る）
const RETREAT_ROAD = [[10, 60], [14, 104], [14, 136], [0, 171]];
// 城が見える坂の下でも、通り過ぎた崖へ呼び戻す札にしない。
const RETREAT_LABELS = ['南の坂の道印へ', '崖の東の道印へ', '坂を下る道印へ', '浜松城の口へ'];
// 先に下った隊を、坂の上へ呼び戻さない。下知の時だけ道を作る。
function retreatGroup(g, speed = 3) {
  if (!g || !g.count || g.routed) return;
  if (g.order !== 'path' || g.path?.[g.path.length - 1]?.[1] !== RETREAT_ROAD[RETREAT_ROAD.length - 1][1]) {
    const c = g.center();
    g.path = RETREAT_ROAD.map((q) => q.slice()); g.pathIdx = 0;
    while (g.pathIdx < g.path.length - 1 && c.z > g.path[g.pathIdx][1]) g.pathIdx++;
  }
  g.order = 'path'; g.speed = speed; g.noRout = true;
  g.retreatOnly = g.team === 0; // 味方は遠い追手へ引き返さず、手の届く敵だけ受ける。
  g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
}
const SAI = { x0: -130, x1: -24, z: 122, hw: 4 };
function saiDepth(x, z) {
  if (x < SAI.x0 - 6 || x > SAI.x1 + 8) return 0;
  const along = Math.min(1, Math.max(0, (SAI.x1 + 8 - x) / 14)) * Math.min(1, Math.max(0, (x - SAI.x0 + 6) / 10));
  const across = Math.max(0, 1 - Math.abs(z - SAI.z) / (SAI.hw + 2));
  return 7 * along * Math.min(1, across * 1.6);
}
const NEARAI = { x: 44, z: -40 };          // 根洗の松の小高い所（右の森の側。取ると赤備えの寄せが見える）
// 台地は水に乏しい採草地。本格的な開拓以前の原に、村と耕地を置かない。
// 根拠：浜松市「三方原協働センター地域カルテ」
// https://www.city.hamamatsu.shizuoka.jp/c-mikatahara/mikatahara-chiikikarute.html
const MURA = { x: 60, z: 140 };            // 台地を下った東南の在所。家の位置は縮めた復元。
const TOWN = { x: 50, z: 174 };           // 浜松城の東側、引間の町へ続く家並み。
const FUSAI = { x: -80, z: 152 };         // 城の西北、犀ヶ崖の南側の普済寺方面。
// 普済寺は十五世紀からこの地にある。堂の形・距離・民の人数は遊びの復元。
// 根拠：浜松市の歴史文化の特徴（寺院と神社）
// https://www.city.hamamatsu.shizuoka.jp/documents/133742/03dai1shou_1.pdf
const peopleRoute = (points) => points.map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  // 採草に来た百姓は原の西縁から見物。崖の西端の外を回って下る。
  { x: -80, z: 44, kinds: ['farmer', 'farmer', 'woman', 'elder'], mode: 'watch',
    route: peopleRoute([[-112, 62], [-148, 104], [-152, 140], [-160, 168]]) },
  // 在所の者と町の者は、兵が退く城口の道を横切らず東へ逃げる。
  { x: MURA.x - 11, z: MURA.z - 8, kinds: ['farmer', 'woman', 'child', 'elder'], mode: 'watch',
    route: peopleRoute([[49, 152], [85, 158], [152, 168]]) },
  { x: TOWN.x - 10, z: TOWN.z - 17, kinds: ['townsman', 'merchant', 'woman', 'child', 'townsman'], mode: 'watch',
    route: peopleRoute([[44, 158], [85, 158], [152, 168]]) },
  // 僧と寺の近くの民は崖より南を通る。焼き討ちの伝承は台本にしない。
  { x: FUSAI.x, z: FUSAI.z - 11, kinds: ['monk', 'monk', 'farmer', 'woman', 'child'], mode: 'watch',
    route: peopleRoute([[-92, 140], [-112, 156], [-152, 168]]) },
];
// 一度だけ作り、地面の道と草木を除く範囲にも同じ逃げ道を使う。
const PEOPLE_PATHS = PEOPLE_BANDS.map((b) => [[b.x, b.z], ...b.route.map((p) => [p.x, p.z])]);
function peopleLane(x, z) {
  for (const path of PEOPLE_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 4) return true;
  }
  return false;
}
const OIWAKE = { x: -56, z: -44 };         // 追分（三方原台地と祝田坂方向へ道が分かれる所）
// 浜松市文化財情報 第九十五号の進軍経路を参考にした縮図。道の細かな線は復元。
// https://www.city.hamamatsu.shizuoka.jp/bunkazai/info/bunkazaijyoho95.html
const FIELD_PATHS = [[[-10, -200], [0, -60], [6, LINE_Z], ...RETREAT_ROAD, [HAMA.x, HAMA.z]],
  [[6, LINE_Z], [OIWAKE.x, OIWAKE.z], [-100, -110], [-125, -150]]];
// 地面を作る時だけ、草木を除く道と同じ折れ線を土色にする。
function fieldLane(x, z) {
  for (const path of FIELD_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 2) return true;
  }
  return false;
}
function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.02 + 0.3) * Math.cos(z * 0.018) + 0.35 * Math.sin(z * 0.05 + x * 0.03);
  // 殿の持ち場（z=62）のすぐ南から下る。坂を遠くへ置くと持ち場が平野に見える。
  h += 8 / (1 + Math.exp((z - 86) / 9));
  // 台地の備えに急な山を重ねない。遠い北だけ緩く高くする。
  h += Math.max(0, -z - 240) * 0.15;
  // 祝田の坂：台地の北西の端が都田の谷へ下る（武田勢が下りようとしていた坂）
  h -= 7 * sig((-x - 100) / 10) * sig((-z - 130) / 10);
  // 根洗の小高い所
  h += 4 * gauss(x, z, NEARAI.x, NEARAI.z, 180);
  h += demRelief(x, z);
  h -= saiDepth(x, z);
  // 浜松城は台地の東縁。西の曲輪が城口より高い段丘を、縮めた地形で示す。
  // 比高三は遊びの復元値。後世の天守台・石垣の高さには合わせない。
  h += 3 * gauss(x, z, -14, HAMA.z + 16, 700);
  return h;
}


// 部隊の軽い大軍を、向きのまま前へ（負なら後ろへ）
function adv(b, d, secs, charge) { if (b && !b.routedL && b.light) b.light.advance(d, secs, { charge: !!charge }); }
// 武田の頭（F7）：始めに決めた手（F.tPlan）で、どの備から前へ出すかを変える
function takedaMove(rt, stage) {
  const F = rt.flags, T = F.bT, P = F.tPlan;
  const distance = stage === 'first' ? 34 : 26, seconds = stage === 'first' ? 50 : 30;
  // 前六備は同じ歩みで、先鋒・二陣・三陣の間を保つ。旗本と脇備えは本陣に残る。
  for (const id of ['yamagata', 'oyamada', 'baba', 'obata', 'katsuyori', 'naito']) adv(T[id], distance, seconds, stage === 'crash');
  if (stage !== 'first') return;
  if (P === 'hidari') {
    for (const id of ['baba', 'katsuyori']) {
      const b = T[id]; if (!b || b.routedL) continue;
      b.light.moveTo(b.pos.x - 14, b.pos.z + distance, seconds);
    }
    rt.after(9, () => rt.say('物見', '馬場と勝頼の旗が動いた！　横から寄せるぞ！', 4));
  } else if (P === 'migi') {
    const b = T.yamagata;
    if (!b.routedL) b.light.moveTo(b.pos.x + 14, b.pos.z + distance, seconds);
    rt.after(9, () => rt.say('物見', '武田の右に赤い旗！　列をそろえて来るぞ！', 3.5));
  } else rt.after(9, () => rt.say('物見', '正面に武田の大軍！　槍列を保て！', 3.5));
}
// 崩れた備は崖の手前で東の道へ寄り、浜松へ退く。
function allyFall(rt, b) {
  if (!b || b.routedL || b.fallen) return;
  b.fallen = true;
  if (!b.light) return;
  const secs = Math.max(8, Math.hypot(14 - b.pos.x, 104 - b.pos.z) / 2.4);
  b.light.moveTo(14, 104, secs);
  rt.after(secs, () => { if (!rt.over && !b.routedL) b.light.moveTo(HAMA.x, HAMA.z - 4, 30); });
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const returned = sq.filter((x) => x.alive).length;
  const ready = sq.filter((x) => x.alive && !x.woundOut && !x.rearWound && !x.gone && !x.fleeing).length;
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? returned / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（生還 ${returned}／${sq.length}人）`), label);
  rt.bark(`戻った組の者 ${returned}人、うち働ける者 ${ready}人`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, `${label}・特別戦功 ${Math.max(rt.tracker.special?.pts || 0, pts)}点`);
}

// 三河物語・甲陽軍鑑に伝わる陣名。各備の人数と細かな位置は遊びの復元。
// 右・前は本陣から敵へ向いた時の向き。旗は既存の家の旗を使う。
const TAKEDA_JIN = {
  name: '魚鱗', team: 1, honjin: { x: 0, z: TAKEDA_HQ_Z }, facing: 0,
  head: (rt) => rt.flags.campB?.general,
  sonae: [
    ['yamagata', '第二陣右翼', '山県昌景', 4000, 300 / 16, TAKEDA_SECOND, 'akazonae'],
    ['oyamada', '先鋒', '小山田信茂', 2000, 0, OYAMADA_FRONT, 'takeda'],
    ['baba', '第三陣左翼', '馬場信春', 4000, -350 / 16, TAKEDA_THIRD, 'furin', 'naito'],
    ['obata', '第二陣左翼', '小幡信貞', 3000, -450 / 16, TAKEDA_SECOND, 'takeda', 'oyamada'],
    ['katsuyori', '第三陣右翼', '武田勝頼', 3000, 300 / 16, TAKEDA_THIRD, 'furin', 'yamagata'],
    ['naito', '第二陣中翼', '内藤昌豊', 3000, -250 / 16, TAKEDA_SECOND, 'takeda', 'oyamada'],
    ['nobutoyo', '旗本衆', '武田信豊（典厩）', 2500, -10, 5, 'takeda'],
    ['anayama', '旗本衆', '穴山信君', 2500, 10, 5, 'takeda'],
    ['nobukado', '本陣左脇備え', '武田信廉（逍遥軒）', 2000, -36, 5, 'takeda'],
    ['hatamoto', '本陣右脇備え', '武田の旗本', 2000, 36, 5, 'takeda'],
    ['shingen', '本陣', '武田信玄', 2000, 0, 0, 'takeda'],
  ].map(([id, role, general, soldiers, right, front, flag, relief]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: 'takeda', relief,
    bind: (rt) => rt.flags.bT?.[id],
  })),
};
const TOKUGAWA_JIN = {
  name: '鶴翼', team: 0, honjin: { x: 0, z: 0 }, facing: Math.PI,
  sonae: [
    ['ishikawa', '左翼', '石川数正', 2000, 550 / 16, -LINE_Z, 'tokugawa'],
    ['honda', '左翼', '本多忠勝', 1000, 400 / 16, -LINE_Z, 'tokugawa'],
    ['matsudaira', '左翼', '松平家忠', 1000, 280 / 16, -LINE_Z, 'tokugawa'],
    ['ogasawara', '左翼', '小笠原長忠', 1000, 125 / 16, -LINE_Z, 'tokugawa'],
    ['sakai', '右翼', '酒井忠次', 1500, -500 / 16, -LINE_Z, 'tokugawa'],
    ['sakuma', '織田の加勢', '佐久間信盛', 1000, -150 / 16, -LINE_Z, 'oda'],
    ['hirate', '織田の加勢', '平手汎秀', 1000, -260 / 16, -LINE_Z, 'oda'],
    ['takigawa', '織田の加勢', '水野信元', 1000, -TAKIGAWA_X, -LINE_Z, 'oda'],
    ['ieyasu', '本陣', '徳川家康', 1500, 0, 0, 'tokugawa'],
  ].map(([id, role, general, soldiers, right, front, flag]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: flag,
    bindOnly: ['ogasawara', 'sakuma', 'hirate', 'takigawa'].includes(id),
    bind: (rt) => rt.flags.bA?.[id],
  })),
};

const mikatagahara = {
  compactIntro: true,
  footFrameMinDistance: 2.5, // 篝火や陣幕で肩へ寄った時、足を映す補正で真下を向かない。
  introTaskFirst: true, // 人物紹介より先に、旗へ進む下知と生還の条件を読めるようにする。
  // war_people の共有形と近景の使い回しを使う。兵の名簿・人数へは足さない。
  civilianCrowd: { bands: PEOPLE_BANDS },
  introText: `目の前の印が平手の槍の持ち場。印へ進み、敵へ槍を向けて${isTouch ? '「ふせぐ」を押し続けよう' : '右押しを押し続けよう'}。退けの声がしたら、構えを解こう。道の印を追って浜松城へ戻ろう。`,
  nobiki: true, // 負け戦の退き口：法螺貝と退き太鼓で退けを知らせる（battle.js の signalCue）
  noticeOnce: true,
  noticeLimit: 2,
  persistentTaskNotice: true, // 持ち場の下知は一時の操作助言と同じ文でも間引かない。
  keepTaskWithWork: true, // 近くの作業の釦が出ても、槍列と退き口の下知を残す。
  keepTaskWithRain: true, // 矢をよける間も、戻る槍列と次の下知を任務欄に残す。
  keepTaskWithDodge: true, // 回避の印が出ても、城へ退く下知を消さない。
  keepTaskWithGuard: true, // 構える釦だけで持ち場と下知を隠さない。
  keepCombatTask: true, // 構えの操作中も、待つ理由と次の下知までの時間を残す。
  keepCombatTaskHeading: true, // 携帯の接敵操作で、持ち場の見出しを置き換えない。
  keepCombatTaskDetail: true, // 刃を受ける間も、下知までの秒数を消さない。
  keepTaskLabel: true,
  keepWoundTaskLabel: true, // 負傷しても槍列・坂・城への下知を残す。傷と手当ての案内は保つ。
  keepWoundRetreatReason: true, // 足の傷で一時退避の印を「戻る旗」と呼ばない。
  keepRetreatReason: true,
  keepRetreatGestureReason: true, // なぞる向きだけで、守る列と退く理由を上書きしない。
  keepDestinationTask: true,
  keepGuardTaskLabel: true,
  keepWaitOrderLabel: true,
  taskDetails: true,
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (this.distanceText(rt, rt.missionGuide?.distance || 0) === '持ち場で構えよ') return 'この持ち場で構えよ';
    return F.step === 3 ? RETREAT_LABELS[F.retreatIdx] :
      F.dpOn ? rt.missionGuide?.label || '南の坂の持ち場へ' :
      F.step === 2 ? F.mkFlank ? '味方と森の陰へ' : '右の槍の持ち場へ' : '平手の槍の持ち場へ';
  },
  // 持ち場の外では共通の指の練習文に戻さず、坂や槍列へ向かう理由を残す。
  waitTravelLabel(rt) { return this.travelGuideLabel(rt); },
  guardTravelLabel(rt) { return this.travelGuideLabel(rt); },
  hideGuideSteps: true, // 一時退避の歩数を重ねず、下知の行き先と距離を読む。
  // 携帯の移動案内にも、坂の持ち場と城への道の区別を残す。
  waitTravelLabel(rt) { return this.travelGuideLabel(rt); },
  guardTravelLabel(rt) { return this.travelGuideLabel(rt); },
  guidanceDistanceFirst: true, // 共通の待機用の歩数より、この戦の到着範囲を優先する。
  // 守る範囲に入った後は、中心まで歩き続ける案内にしない。
  distanceText(rt, distance) {
    const F = rt.flags, C = F.dpOn ? F.dp?.cur : null;
    // 退く道の名と距離は主の任務の補足で読む。道印の欄へ重ねない。
    if (F.step === 3) return '';
    const id = rt.missionGuide?.marker?.id;
    const holding = C ? C.s.kind === 'hold' && (id === 'dp' || id === 'retreat-way')
      : F.step <= 1 && id === 'hira' || F.step === 2 && !F.mkFlank && id === 'pike';
    const radius = C?.botRadius || rt.missionGuide?.marker?.guideRadius || (F.step <= 1 ? 8 : 5);
    return holding && distance < radius ? '持ち場で構えよ' : `あと${Math.ceil(distance)}歩`;
  },
  // 足元の構えの印でも、守る相手と次の下知を任務名から消さない。
  waitOrderLabel(rt) {
    if (rt.flags.ending) return '城に着いた。仲間を待て';
    for (const o of rt.objectives) if (o.id === 'main' && !o.state) return this.taskLabel(rt, o.text);
    return '味方の列で次の下知を待て';
  },
  waitActionText(rt) { return this.waitOrderLabel(rt); },
  taskDetail(rt, title, progress) {
    // 帰着後は完了した主の任務が選ばれない。共通の「味方の旗へ」へ戻さない。
    if (rt.flags.ending) return '城内で仲間を待て。まもなく評定へ';
    // 回避や向き直りの操作中も、道の名と距離を一か所に残す。
    if (rt.flags.step === 3) return progress;
    // 退く下知直後と坂で列をそろえる間は、まだ移動段の補足がない。
    // 空欄を共通の「味方の旗へ」に替えず、この段の行き先を明示する。
    const F = rt.flags, C = F.dpOn ? F.dp?.cur : null;
    if (F.dpB && C?.s.kind === 'rest') {
      const at = F.dp.i < 2 ? SOUTH_SLOPE : REARGUARD_POST, p = rt.player.u.pos;
      const distance = Math.ceil(Math.hypot(p.x - at.x, p.z - at.z));
      return distance > 10 ? `構えを解き、南の坂の道印へ。あと${distance}歩`
        : '坂に着いた。北の追手へ構え、味方を先に通せ';
    }
    // 段の札が選ばれた時も、主の札に記録した通過人数と次の下知を読む。
    if (rt.flags.dpOn && rt.flags.dp?.cur?.s.kind === 'hold') {
      for (const o of rt.objectives) if (o.id === 'main' && !o.state) { progress = o.progress || progress; break; }
    }
    // 一時の回避先が見出しになっても、本来の持ち場と残り時間を残す。
    if (rt.dodgeGuide || rt.hud.retreatGuide?.active) {
      for (const o of rt.objectives) if (o.id === 'main' && !o.state) {
        // 見出しに既に持ち場の下知がある時は、同じ文で札を一段増やさない。
        if (title === o.text || title === this.taskLabel(rt, o.text)) return progress;
        return o.text + (progress ? '。' + progress : '');
      }
    }
    // 列をそろえる間と退き始めにも行動を残す。空欄を共通の旗への案内へ渡さない。
    if (!progress && rt.flags.dpOn && rt.flags.dp?.cur?.s.kind === 'rest') {
      if (!rt.flags.dpB) return '敵へ槍を向け、この列で次の下知を待て';
      return rt.flags.dp.i < 2 ? '南の坂の印へ退け。味方と道を進め'
        : '北の追手へ構え、坂を下りる味方を守れ';
    }
    return progress;
  },
  // 槍列を守る戦。近くの負傷した上役への救援で、持ち場と退路の下知を替えない。
  guardGuideAllowed: () => false,
  taskLabel(rt, text) {
    if (rt.flags.ending) return '城に着いた。仲間を待て';
    if (text === '右から来る赤備えを支えよ') return '右の赤備えを防げ';
    if (text === '味方と右へ槍を向け、馬を受けよ') return '右へ槍を向け、馬を防げ';
    if (!rt.flags.dpOn && rt.flags.step <= 1 &&
        Math.hypot(rt.player.u.pos.x - HIRATE_POST.x, rt.player.u.pos.z - HIRATE_POST.z) < 8)
      return '敵へ槍を向け、列を守れ';
    return text;
  },
  // 退く下知の後は、近くの空き地へ逃げる案内より決めた道を優先する。
  routeGuidePriority: (rt) => rt.flags.ending || rt.flags.step === 3 ||
    !!(rt.flags.dpOn && rt.flags.dpB && rt.flags.dp?.cur?.s.kind !== 'hold'),
  // 退く途中は接敵の案内も道に従う。坂で受ける段では槍の構えを教える。
  meleeGuide: (rt) => !mikatagahara.routeGuidePriority(rt),
  // 危険をよける一時の退避を、下知による城への退却と区別する。
  retreatGuideLabel: (rt, reached) => mikatagahara.routeGuidePriority(rt)
    ? reached ? '道の印を追い、浜松へ退け' : '刃をよけ、道の印へ退け'
    : reached ? '敵へ槍を向け、列を守れ' : '刃をよけ、味方の列へ戻れ',
  // この旗は一時退避の足場。浜松へ続く道印と取り違えさせない。
  retreatDestinationLabel: () => '刃をよける印',
  retreatTaskLabel(rt, guide) {
    // 刃をよける間も槍列を守る下知を残す。手当て中は手当ての操作を示す。
    if (rt.over || guide?.active && guide.treatment ||
        !mikatagahara.routeGuidePriority(rt) && !(guide?.active && guide.valid)) return '';
    return mikatagahara.waitOrderLabel(rt);
  },
  compactDestinationSign: true, // 一時退避の旗を小さくし、退く道と兵の姿を空ける。
  dodgeLabel: (_rt, direction, rain) => rain ? '矢をよけよ' :
    direction ? direction.replace(/にげる/g, 'よける') : '敵から離れよ',
  // 携帯では指の札が通常の案内に代わるため、よける理由もここへ残す。
  dodgeMoveLabel(rt, side, rain) {
    const direction = side === '上' ? '前' : side === '下' ? '後ろ' : side;
    return `${direction}へなぞり、${rain ? '矢' : '刃'}をよける`;
  },
  // 回避の旗は味方の陣ではなく、一時的に刃や矢をよける足場。
  // 専用の札を使うと、共通の配置処理で任務札を避けて上端へ収まる。
  dodgeGuideLabel(rt, reached, rain) {
    if (rt.flags.ending) return '城に着いた。仲間を待て';
    if (mikatagahara.routeGuidePriority(rt)) return reached
      ? '道の印を追い、浜松へ退け'
      : rain ? '矢をよけ、道の印へ進め' : '刃をよけ、道の印へ進め';
    return rain ? reached ? '敵へ向き直り、槍列を守れ' : '矢をよけ、足元の印へ'
      : reached ? '敵へ向き直り、構えよ' : '印へよけ、槍列を保て';
  },
  // 矢の回避と画面外の印には専用の呼び口がある。同じ下知を渡し、
  // 一時の回避先を浜松への旗と呼んだり、退却中に待たせたりしない。
  rainDodgeGuideLabel: (rt, reached) => mikatagahara.dodgeGuideLabel(rt, reached, true),
  escapePlaceLabel: (rt, rain) => mikatagahara.dodgeGuideLabel(rt, false, rain),
  // 乱戦で指の練習を待つと、兵も下知も止まったままになる。案内だけ短く出す。
  pauseTurnPractice: false,
  dodgeTurnLabel: (_rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞって振り向く`
    : `手元の操作器を${right ? '右' : '左'}へ動かして振り向く`,
  dodgeTurnDuration: 3,
  compactCombatGuides: true, // 接敵の印と回避釦を小さくし、迫る兵を見る場所を空ける。
  dodgeActionHalfWidth: 112,
  compactDodgeGuide: true, // 一時の回避先は小さなひし形。大旗で下知や敵の姿を覆わない。
  dodgeDiamondSign: true, // 足元の輪だけでなく回避先の旗面もひし形にし、城への道印と分ける。
  shortDodgeArrow: true, // 矢をよける案内も足元の八十ピクセルに収め、兵を横切らない。
  dodgeAvoidNotices: true, // 画面外の回避印は矢印まで含めて任務札を避ける。
  dodgeGestureBelowNotices: true, // 横画面でも、振り向く指と説明を任務札の下へ収める。
  dodgeActionText: '長押しで よける', // 下知による退却と、一時的に刃や矢をよける操作を分ける。
  waitGuardActionText: '長押しで ふせぐ',
  waitGuardButtonText: '長押しで ふせぐ', // 携帯横画面の独立した釦も導入と同じ呼び名にする。
  guardStartText: '長押しで ふせぐ',
  waitGuardHint: () => 'はなすと 構えを解く',
  guardWaitText: '刃が来たら ふせぐ', // 追手を見ただけで構え続け、退く足を止めない。
  // 移動中は道の印を優先する。坂で追手を受ける間は構える釦を残す。
  waitGuardAllowed: (rt) => !rt.flags.ending && !mikatagahara.routeGuidePriority(rt),
  readableLogEntry: true, // 数だけの札にせず、未読の報せと分かるようにする。
  immediateTaskChanges: true, // 持ち場が変わったら、古い下知を十秒残さない。
  noTaishoRaid: true, // 本陣救援の別任務は出さず、定義済みの包囲と追手で退き口を守る。
  // 敵の目前では槍を構え、退く下知の後は道を進む。討ち取りと証人は残す。
  headBlocked(rt) {
    if (rt.flags.ending || rt.flags.dpB || rt.flags.step === 3) return true;
    const p = rt.player.u;
    for (const u of rt.army.units) {
      if (u.alive && !u.gone && u.team !== p.team && !u.civ && !u.isStruct && !u.fleeing &&
          Math.abs(u.pos.y - p.pos.y) < 2 && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6) return true;
    }
    return false;
  },
  nearSpearFade: true,
  hideBlockingCloseSpears: true, // 細くした味方の槍も、本人を見る線を横切る間だけ避ける。
  nearGroundSpearRadius: 4.5, // 落ちた長柄も目の前を塞ぐ時だけ避け、退く道を見せる。
  nearHatFadeRadius: 0, // 笠だけを透かして顔や首布を露出させない。食い込みは全身の回避で扱う。
  nearAllyFadeRadius: 2.6, // 肩越しの外側から大写しになる騎手も、描く間だけ全身で避ける。
  nearAllySightWidth: 1.2, // 胴の中心だけでなく、騎手の袖と母衣が本人を覆う時も拾う。
  nearEnemyFadeRadius: 2.6, // 敵馬の胴へ視点が入る時も同じ範囲で避け、当たりは保つ。
  nearAllySolidBody: true, // 既存の視点の押し戻しで胴への潜り込みを避け、隣の具足は濃く残す。
  nearAllyWholeOcclusion: true, // 視点と本人の間の味方は全身で避け、透けた顔・具足・背旗を重ねない。
  nearAllyHorseFade: true, // 騎手より低い視点でも、すぐ横の馬が退路を隠さない。
  nearHoroRadius: 5.5,
  nearHoroHide: true,
  nearHoroWhole: true, // 別部品の母衣は布と竹籠を一緒に避け、一体の具足では両方を残す。
  nearHoroMergedFadeRadius: 4.5, // 一体の母衣も目の前だけ上半身ごと透かし、布と籠を分離しない。
  nearCourierHoroHide: true,
  nearCourierHoroWhole: true, // 軍勢と別扱いの使番も、視線を塞ぐ間だけ布・籠・人馬をまとめて避ける。
  nearFlagFadeRadius: 6,
  nearLongWeaponRadius: 4.5, // 視点のすぐ横から差し込む長柄と隊旗だけを描く間避ける。
  // 近い隊旗を半透明の白い板にせず、紋と布色を残す。
  // 視線を塞ぐ時は、既存の描画前の処理が竿・横木ごと避ける。
  fadeCloseStandards: false,
  standardClothScale: 0.72, // 槍列の旗布だけ控えめにし、敵の肩と穂先を見せる。
  standardKinds: { cavalry: 'spear' }, // 筒状の吹流しを控えめな幟へ。騎馬の人数・動きは保つ。
  largeWaymarks: true,
  smallTaskAreas: true,
  smallRetreatAreas: true, // 守備・退避の広い白輪を足元の印へ。旗と矢印、到着判定は保つ。
  compactHoldGuide: true, // 待機の描画にも小さな印を使い、持ち場全体の白輪を重ねない。
  compactFloorGuides: true, // 近い床の印が携帯の画面いっぱいに広がるのを防ぐ。
  singleRetreatArrow: true, // 一時退避も城への道も短い矢印一本。乱戦を横切る点線を省く。
  retreatArrowLength: 80, // 一本でも長さの指定がないと画面を横断する。向きだけを足元に残す。
  compactRetreatArea: true,
  taskAreaFootRing: true,
  softGuideRings: true,
  edgeBehindWaymarks: true, // 背後の持ち場は画面の端へ寄せ、乱戦を見る場所を空ける。
  rearThreatFrame: true, // 振り向いて追手を見る時も、画面に対する前後で知らせる。
  rearAdviceView: true, // 背を打たれる時の声も、見ている向きに合わせる。
  reserveCombatCues: true, // 退く先の札は、中央の気力・間合いの字を避ける。
  positionPersonGuide: false, // 突き・のけぞりの姿勢も拾い、立ち位置の空間だけを囲まない。
  noUnitContrast: true, // 歩く体とずれる白い人型線を消す。敵味方の頭上の印は残す。
  hidePlayerSign: true, // 肩越しの本人から離れる白輪を、進む先の印と取り違えさせない。
  playerFootSignOnly: true, // 常時の本人案内にも渡し、別経路から白い棒人間を描かない。
  openingFootSignOnly: true, // 出だしは足元の印だけ。本人を頭から足まで白枠で囲まない。
  enemyCornerSign: true, // 描画側が読む指定で四隅へ畳み、太い長方形を残さない。
  enemyFootRingRadius: 0.4, // 相手の足元だけを示し、隣の兵まで白い輪へ入れない。
  softOpen: 70, // 先手を受ける序盤だけ本人の傷を半分にし、構えと退き方を覚える間を残す。
  // 今の持ち場を一つだけ、画面の端の矢印にも渡す。
  guideMarker: (rt) => rt.flags.ending ? null : rt.flags.dpOn ? (rt.flags.dpB ? 'retreat-way' : 'dp') :
    rt.flags.step === 3 ? 'hama' : rt.flags.step === 2 ? 'pike' : 'hira',
  noAllyReports: true, // 近くの武将の声だけ聞く。遠い名乗りを使番に運ばせない。
  // 負け戦では、局地の働きを全軍の勝ちや追撃の下知にしない。
  battleVoices: { lines: { ally: {
    rout: ['深追いするな！　列を保て！', '今のうちに退き口を空けよ！'],
    regroup: ['敵が列を組み直すぞ！　備えよ！'],
    leader: ['敵の頭を討った！　列を離れるな！'],
    reload: ['弾込めの間に、味方へ戻れ！'],
    praise: ['よう支えた！', '列を保て！'],
    praiseLord: ['殿、退き口は某が支えまする！'],
  } } },
  jinkei: [TOKUGAWA_JIN, TAKEDA_JIN],
  jinkeiActive: (rt) => rt.flags.step > 0 && !rt.flags.ending && rt.flags.step < 3,
  // 退く下知の後は、既存の寄せ手と定義済みの追手で戦う。本陣の遠景から増員しない。
  wakeOK: (rt) => rt.flags.step > 0 && rt.flags.step < 3 && !rt.flags.dpB,
  // 槍列の右の端から前を見る。何列もの味方の背で寄せ手を隠さない。
  attackWarningDelay: 1, // 打たれる前に迫る向きを知らせ、構える間を残す。
  compactThreats: true, // 方角だけでなく、初めての人にも防ぎ方を伝える。
  compactGunAction: '横へ退け', // 柵のない野戦で、存在しない陰へ誘導しない。
  // 移る間は退けの下知を優先する。殿の持ち場で守る間は深手・包囲から退ける。
  botEvacuating: (rt) => rt.flags.step === 3 ||
    !!(rt.flags.dpOn && rt.flags.dpB && rt.flags.dp?.on && rt.flags.dp.cur?.s.kind !== 'hold'),
  // 持ち場の南から北へ入る。着くために南へ振り向き、敵へ背を向ける導線を避ける。
  spawn: { x: HIRATE_POST.x, z: HIRATE_POST.z + 6, heading: Math.PI },
  world: {
    combatSpace: mikataCombatSpace,
    contactShadows: true, // 高画質の人馬にも、影地図と重なりすぎない坂沿いの接地影を残す。
    meleeBodySpace: 1.2, // 乱戦で徒歩の兵の胴が重ならないよう、既存の押し合いを使う。
    allyPersonalSpace: 1.3, // 本人の肩と笠を、味方の後列へ埋めない。
    lowHumanDetail: 12, // 骨と斬り合いは残し、離れた兵の体・具足を一つの軽い形へ。
    denseFront: true, // 前線の列を画質によって間引かない。
    lowArmyDetail: true,
    lowArmyMiddleDetail: true,
    lowUnitNear: 10,
    highUnitNear: 10, // 十メートル先は同じ兵・同じ動きの軽い甲冑へ。前線の人数と間隔は保つ。
    highUnitGrid: 0.08, // 十六メートル先の細かな部品だけを共通の粗い形へ。
    unitPartCull: true, // 長い槍だけが見える兵の、画面外の体を描かない。
    lowUnitFar: 40,
    lowMaterialBatch: true,
    mergeStaticBatches: true,
    noLowBlobShadows: true,
    distantDetailGrid: 0.5,
    distantDetailNear: 35,
    renderDetailBeforeDraw: true, // 描画なしの早送り後も、最初の一枚から遠景を軽くする。
    noticeRepeatGap: Infinity, // 同じ台詞や知らせは、この戦で一度だけ。
    seed: 15722,
    // 味方は白地の葵・金地の木瓜、武田は朱地の花菱。所属の判定は変えない。
    armyFlagKinds: { takeda: 'yose_takeda_mikata', akazonae: 'yose_takeda_mikata' },
    straightSashimono: true,
    clothFolds: true,
    longHoro: 'round', // 使番の背は既存の竹籠と布の丸い断面へ。細い尾にしない。
    naturalArrowRain: true, // 遠い矢を黒い太棒へ拡大せず、木の色と霧の奥行きを保つ。
    lifeSizePinnedArrows: true, // 刺さった矢へ胴や馬の倍率を重ねず、腰から長槍ほどの柄を伸ばさない。
    pinnedArrowAxisScale: true, // 斜めの矢も矢自身の軸で実寸へ戻し、胴の動きで柄を引き伸ばさない。
    pinnedArrowRenderScale: true, // 描く直前に体格が替わっても、刺さった矢へ胴の倍率を重ねない。
    arrowRainGroundCue: false, // 槍列を白黒の帯で囲まない。矢の影・声・回避先の印は残す。
    arrowRainPerBow: 1, // 少人数の射手から数十本の飾り矢を増やさない。本物の射矢は残す。
    groundedFalls: true, // 落とした槍は倒れた体の向きに沿わせる。
    longitudinalSpearFalls: true, // 長柄を中央の斜面へ回さず、石突と穂先で支える。
    terrainContactFalls: true, // 坂で足元の高さが遅れても、板床と誤認して亡骸を浮かせない。
    slopeContactFalls: true, // 携帯でも寝た腰と胸の下で坂を支える。
    settledFalls: true, // 軽い姿へ替わった亡骸も、胴・腰・頭を地へ下ろす。
    slopeLitter: true, // 刀や弓、落ちた笠も坂へ沿わせる。形と材質は使い回す。
    settleSideFalls: true, // 横へ崩れた体は、ひねった途中の姿勢で宙に止めない。
    settleFallenLimbs: true, // 倒れ切った手足を地へ下ろし、曲げた膝を宙に残さない。
    spreadFalls: true, // 同じ足元へ亡骸と得物を積み重ねない。
    crumpledFlags: true, // 落ちた背旗は皺のある共有形へ。拡大された硬い板を残さない。
    horseCoat: (style, seed) => ({ ...style, ...(seed % 2
      ? { coat: 0x5a321c, mane: 0x321b10, points: 0 }
      : { coat: 0x2a1c14, mane: 0x0e0b09, points: 1 }) }),
    time: 'dusk',
    unitNightScale: 0, // 夜の具足だけを白く縁取らず、地面と同じ月光・篝火・既存の補光で照らす。
    // 台地を高い峰で囲まず、遠い丘陵の低い稜線を残す。
    mountainScale: 0.3,
    winter: true,      // 浜松市の解説には降雪の記述もある。天候は断定せず、積雪なしの冬景色で復元。
    fogFar: 300,
    smokeFogFloor: 100,
    nightFogFar: 200,
    nightFill: 0.3,
    nightMoonMin: 0.55, // 退き道が読める月の向きは保ち、日没後の白い照りを抑える。
    allyShoulderMark: 0xc3b58d, // 肩の合印はくすんだ布色にし、具足から金札のように浮かせない。
    allyFlagBoost: 0.08,
    pineOnly: true,
    solidFoliage: false, // 既存の折った葉房を使い、黄緑の塊が水平な棚に並ぶ形を避ける。
    branchFoliage: false, // 厚い多角形の葉板をやめ、既存の透ける松葉の共有房を使う。
    unevenCrowns: true, // 枝張りを一本ずつ変え、同じ形の松が並ぶ見え方を抑える。
    raggedPineCrowns: true, // 近景も遠景も葉房を折って高さを散らし、明るい横板の並びを崩す。
    nearTreeFadeRadius: 5.5, // 退く途中の視点へ入る幹と枝を早めに透かし、追手と道を見せる。
    closedFarCrowns: true, // 地図の外の雑木は、面の継ぎ目を閉じて影絵の裂けを防ぐ。
    noBamboo: true,
    winterGrass: true,
    susukiSize: 1, // 道の脇の株を低くし、肩越しの視点と坂の追手を穂で覆わない。
    tuftTint: 0xb5a58c, // 穂と葉の白い照りを抑え、冬の土になじませる。
    susukiTint: 0x9b8969, // 大きな薄の株にも枯れ色を付け、白い切り絵のような照りを抑える。
    nearGrassTint: 0xc9bba3,
    lowBamboo: true,
    wind: [0.8, 0.6],
    muddy: 0.2,
    // 台地と坂に描いた三角形へ岩の腹まで据え、浮く石と離れた根草を残さない。
    // 設営時だけ既存の接地処理を使い、歩く床・退く道・兵の数は変えない。
    groundedSlopeRocks: true,
    rockDrawGround: true,
    rockSlopeContact: true,
    rockLowerRimContact: true,
    curvedRockTufts: true,
    litRockTufts: true,
    patchyGround: true, // 共用の土の絵の湿乾差を出し、冬の原を一色の板にしない。
    softEarthCrust: true, // 土塊の升の境で陰を切らず、退き道に四角い敷石模様を残さない。
    plainGrassGround: true, // 草の絵の円い窪みを省き、冬の原を輪模様で埋めない。
    subtleMudRelief: true, // 丸い窪みを原一面に並べず、踏まれた泥の所へ薄く残す。
    softPathSoil: true, // 道の泥を距離でなだらかに薄め、格子ごとの濃淡の段を抑える。
    pathWidth: 4,
    terrainTriangles: true, // 足場を描く三角形にそろえ、坂の折れで足を浮かせない。
    groundedSlopeRocks: true,
    rockDrawGround: true,
    rockSlopeContact: true,
    rockLowerRimContact: true, // 回転した岩の腹も設営時だけ土へ据える。
    paths: [...FIELD_PATHS, ...PEOPLE_PATHS],
    height,
    tint(x, z, h, c) {
      // 枯れ草の斑でも草の割合を残す。一色にすると草むらまで消えてしまう。
      const patch = 0.5 + 0.5 * Math.sin(x * 0.075 + Math.cos(z * 0.09)) * Math.cos(z * 0.065);
      // 草の割合は緑と赤・青の差から読む。枯れ色は下の描画で足す。
      c.r = 0.32 + patch * 0.06; c.g = 0.38 + patch * 0.06; c.b = 0.20 + patch * 0.04;
      const d = saiDepth(x, z); if (d > 0.5) c.multiplyScalar(1 - Math.min(0.35, d * 0.05));
      // 台地を下った在所の小さな畑。原の上は採草地のまま残す。
      const vd = Math.hypot(x - MURA.x, z - MURA.z);
      if (vd < 30) c.lerp({ r: 0.5, g: 0.4, b: 0.22 }, 0.3 * Math.max(0, 1 - vd / 30));
      // 追分から北西の祝田坂へ続く道も、草色で塗り戻さない。
      if (fieldLane(x, z) || peopleLane(x, z)) c.setRGB(0.46, 0.36, 0.23);
    },
    // 坂から城口まで道を空ける。最後の曲がり角に木を生やさない。
    clear: (x, z) => peopleLane(x, z) || Math.hypot(x - MURA.x, z - MURA.z) < 16 ||
      Math.hypot(x - TOWN.x - 8, z - TOWN.z) < 20 || Math.hypot(x - FUSAI.x, z - FUSAI.z) < 13 ||
      (x > -32 && x < 38 && z > -120 && z < 18) ||
      (Math.abs(x) < 26 && z >= 150 && z < HAMA.z + 12) || Math.hypot(x, z - TAKEDA_JIN.honjin.z) < 22,
    trees: 300,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 130 && z > -220 && z < 160 ? 0.08 : 0.7),
    groves: [{ x: -54, z: -18, r: 9, n: 6 }, { x: -64, z: 76, r: 11, n: 7 }, { x: -80, z: 40, r: 14, n: 18 }, { x: 80, z: -40, r: 14, n: 18 }, { x: 60, z: 100, r: 12, n: 14 }],
    terrainTags: true,   // F1：坂・森・道で速さと疲れが変わる（terrain_tags.js）
    fleeOut: (x, z, team) => team === 1 && z < -160,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 薄暮の残照がある空に、大粒の白点を敷き詰めない。この戦の星だけを控える。
    if (W.stars) {
      W.stars.geometry.setDrawRange(0, 240);
      W.stars.material.size = 0.65;
      W.stars.material.opacity = 0.25;
    }
    // 下知が替わったら古い合図を消す。退く音は、戻る場所も一緒に伝える。
    const signalCue = rt.signalCue;
    rt.signalCue = function (o) {
      if (o.kind === 'main') { o.cue = ''; o.cueT = 0; }
      signalCue.call(this, o);
      if (o.kind === 'main' && o.cue && this.cueAt?.nobiki === this.t)
        o.cue = '合図：退き太鼓。道の印へ退け';
    };
    lostCauseNote(rt, '浜松城へ生きて戻るのが務め');
    // 旧暦二十二日の宵に満月を出さない。道を読むための補光と星は保つ。
    W.moon.layers.disableAll();
    // 東の淡い補光は影を作らず、黒い具足・馬の脚に光の面を残す。
    const rim = new THREE.DirectionalLight(0xe7ddc4, 1.1);
    F.rim = rim;
    rim.position.set(70, 38, 35); rim.target.position.set(0, 0, LINE_Z);
    rt.scene.add(rim, rim.target);
    // 本陣を動かさず、高い幟の塊で北の奥行きを見せる。
    for (const x of [-10, -5, 0, 5, 10])
      rt.scene.add(nobori(W, x, TAKEDA_HQ_Z, x === 0 ? 'furin' : 'yose_takeda_mikata', x === 0 ? 10 : 8));
    // この戦だけ携帯の小さな印を拡大する。札を毎コマ増やさず、戦が終われば外す。
    const guideStyle = document.createElement('style');
    guideStyle.textContent = `
/* 下知と人物紹介は本文だけを送り、出陣の釦を押し出さない。 */
html body #hud.mikata-guide #intro:has(#intro-go) > .card.card {
  display:flex; flex-direction:column; align-items:stretch;
  width:min(560px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  height:min(640px, calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
}
html body #hud.mikata-guide #intro:has(#intro-go) .intro-reading {
  flex:1 1 0; min-height:0; box-sizing:border-box;
  width:100%; overflow-y:auto; touch-action:pan-y; pointer-events:auto;
  overscroll-behavior:contain; padding-bottom:16px; scroll-padding-bottom:16px;
}
#hud.mikata-guide #intro-go { flex-shrink:0; }
#hud.mikata-guide #intro .mikata-people-toggle { min-height:44px; width:100%; margin-top:8px; padding:8px; border:1px solid #c2a25a; background:#242019; color:#ece4d2; font:inherit; font-size:max(15px, calc(15px * var(--text-scale, 1))); cursor:pointer; }
#hud.mikata-guide #intro .mikata-people-toggle:focus-visible { outline:3px solid #f3d98a; outline-offset:2px; }
/* 最初の案内を一行に収め、語尾だけを次の行へ送らない。 */
#hud.mikata-guide #battle-opening span { max-width:min(360px, 60vw); }
#hud.mikata-guide .mk.main:not(.red):not(.edge)::before { width:22px; height:22px; border-width:3px; background:#f3d98a; box-shadow:0 0 0 2px #14120f; animation:none; }
#hud.mikata-guide .mk.main.large-way.edge { padding-top:40px; }
#hud.mikata-guide .mk.main.large-way.edge::after { content:''; top:0; width:0; height:0; border:12px solid transparent; border-bottom:24px solid #f3d98a; border-top:0; font-size:0; }
#hud.mikata-guide .bl #h-hp i { height:8px; }
/* 草や具足へ操作の字を直に重ねず、左右クリックも一行で読める幅を取る。 */
html:not(.touch) #hud.mikata-guide:not(.ending):not(:has(#intro:not([hidden]))) #h-bottom { opacity:1; }
html:not(.touch) #hud.mikata-guide #h-bottom .slot {
  width:auto; min-width:72px; padding:4px 8px;
  background:#14120f; color:#ece4d2; opacity:1;
  font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
}
html:not(.touch) #hud.mikata-guide #h-bottom .slot em {
  width:auto; white-space:nowrap; color:#ece4d2; opacity:1;
}
/* 背の高い画面では知らせを左へ置き、右上の地図と退路を隠さない。 */
@media (min-height:501px) {
  /* 畳んだ任務の共通指定にも優先し、右上への寄せと幅・高さを持ち越さない。 */
  html body #hud.mikata-guide #battle-notices:not(.choosing),
  html body #hud.mikata-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    position:absolute !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important; top:calc(104px + env(safe-area-inset-top, 0px)) !important;
    bottom:auto !important; transform:none !important;
    width:min(320px, 30vw) !important; max-height:calc(100% - 304px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
    box-sizing:border-box; overflow-y:auto; overflow-x:hidden;
  }
  /* 共通の本文の flex-basis:0 と高さ自動を組み合わせると、本文が潰れる。
     読む高さを確保し、長い紹介だけを本文の中で送る。 */
  html body #hud.mikata-guide #intro:has(#intro-go) > .card.card { height:auto; max-height:min(600px, 72dvh) !important; }
  html body #hud.mikata-guide #intro:has(#intro-go) .intro-reading { flex:0 1 auto; }
}
/* 構える向き・気力・連撃を別の場所へ置き、本人の顔と穂先を空ける。 */
#hud.mikata-guide #crosshair .range-cue { top:auto; bottom:calc(100% + 24px); }
#hud.mikata-guide #staring { left:calc(50% - 90px); top:calc(50% - 70px); }
#hud.mikata-guide #staring + .combat-cue-label { left:calc(50% - 90px) !important; top:calc(50% - 46px) !important; transform:translateX(-50%); white-space:nowrap; font-size:max(12px, calc(12px * var(--text-scale, 1))) !important; }
#hud.mikata-guide #combo { left:calc(50% + 64px); top:calc(50% + 48px); }
/* 字の途中で札を切らず、長い時は共通の知らせ欄全体で送る。 */
#hud.mikata-guide #battle-notices:not(.choosing) :is(#subtitle,.battle-notice,#tutorial,#situation,#skiphint) { max-height:none !important; overflow:visible !important; }
#hud.mikata-guide #battle-notices #subtitle .sp { display:inline; margin-right:4px; }
/* 非表示の台詞を共通の display:block で広げず、警告の上の空札を畳む。 */
html body #hud.mikata-guide #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted,:empty),
html body #hud.mikata-guide #battle-notices > #battle-message[hidden] { display:none !important; }
#hud.mikata-guide #battle-notices #banner :is(.brush,small) { display:block; white-space:normal; overflow:visible; }
#hud.mikata-guide #battle-notices:not(.choosing) #objectives li.cur { max-height:none; overflow:visible; }
/* 種別札を隠した後も二列組みや内容幅の縮小を持ち越さない。判断中の任務も同じ一列で読む。 */
html body #hud.mikata-guide :is(#battle-notices,#choice-tasks) #objectives:not(.expand) {
  width:100% !important; min-width:0 !important; max-width:100% !important;
  box-sizing:border-box; flex:0 0 auto;
}
html body #hud.mikata-guide :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur {
  display:block !important; width:100% !important; min-width:0 !important;
  box-sizing:border-box; height:auto !important; max-height:none !important;
}
html body #hud.mikata-guide :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur > :is(.obj-text,small,.opb) {
  width:100% !important; min-width:0 !important;
  max-width:100% !important; box-sizing:border-box; grid-column:1 / -1;
}
html body #hud.mikata-guide :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  display:block !important; width:100% !important; min-width:0 !important;
  writing-mode:horizontal-tb; white-space:normal !important; overflow-wrap:anywhere;
  font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
#hud.mikata-guide #battle-notices:not(.choosing) #objectives li.cur small { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.3; }
/* 構えの時も下知を同じ墨の札に収める。敵の脇へ裸の文字を持ち出さない。 */
html body #hud.mikata-guide.guard-button-help #battle-notices #objectives:not(.expand):has(.guard-action-button) {
  position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
  padding:6px 8px !important; background:#14120f !important;
}
/* 構えと回避は一時の操作。持ち場の下知も同じ札に残す。 */
/* 矢の危険では共通指定が任務全体を隠す。選ばれた札だけ見せ、隠した札は戻さない。 */
html body #hud.mikata-guide.rain-danger #battle-notices #objectives.keep-dodge-task:not([hidden]):not(.notice-muted) {
  visibility:visible !important;
}
html body #hud.mikata-guide.wait-guard-active #battle-notices #objectives.keep-guard-task:not(.expand) { display:block !important; }
html body #hud.mikata-guide #battle-notices #objectives:not(.expand) #obj-list { display:block !important; }
html body #hud.mikata-guide.guard-button-help #battle-notices #objectives:not(.expand) > #obj-list { display:block !important; }
/* 共通の「接敵中は操作だけ」の指定より優先し、持ち場と下知までの補足を残す。 */
html body #hud.mikata-guide.combat-brief #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list,
html body #hud.mikata-guide #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) > #obj-list,
html body #hud.mikata-guide #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now),
html body #hud.mikata-guide #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.obj-cue):not(.goal-place) {
  display:block !important; max-height:none !important; overflow:visible !important;
  white-space:normal !important; -webkit-line-clamp:unset; line-clamp:unset;
}
html body #hud.mikata-guide #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.obj-cue):not(.goal-place) {
  font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.5;
  background:#14120f; color:#ece4d2; padding:4px 6px; margin-top:4px;
}
#hud.mikata-guide .battle-action .guard-action-button { width:100%; min-height:48px; font-size:max(16px, calc(16px * var(--text-scale, 1))); white-space:normal; }
#hud.mikata-guide .battle-action .guard-action-button small { font-size:max(13px, calc(13px * var(--text-scale, 1))); }
html body #hud.mikata-guide:is(.dodge-active,.rain-danger) #battle-notices #objectives:not(.expand) li.cur :is(small.obj-cue,small.goal-place),
html body #hud.mikata-guide #battle-notices #objectives.has-action:not(.expand) li.cur small.obj-cue { display:none !important; }
@media (max-height:500px) {
  html body #hud.mikata-guide #intro:has(#intro-go) > .card.card { padding:12px 16px; gap:8px; }
  #hud.mikata-guide #intro .intro-reading { padding:4px 8px 12px; }
  /* 正面の槍列を空け、任務は右上へ寄せる。判断中の札は共通の配置を使う。 */
  html body #hud.mikata-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
    top:calc(60px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
    transform:none !important; width:min(304px, 38vw) !important;
  }
  /* 今の任務は、味方の通過・待つ向き・下知までの秒数も残す。心得だけ畳む。 */
  html.touch #hud.mikata-guide #battle-notices:not(.choosing) #objectives:not(.expand) li.note { display:none !important; }
  html.touch #hud.mikata-guide > #battle-log-entry { width:80px !important; min-height:44px; box-sizing:border-box; }
  /* 細い朱の線だけでは傷の深さが分からない。歩く操作を塞がず二段で残す。 */
  html.touch body #hud.mikata-guide .bl { gap:4px; }
  html.touch body #hud.mikata-guide:not(.ending):not(:has(#intro:not([hidden]))) .bl { opacity:1 !important; }
  html.touch body #hud.mikata-guide .bl #h-sta { display:grid !important; grid-template-columns:32px minmax(24px,1fr); gap:4px; line-height:1.4; }
  /* 命の見出しに三十二画素の列を使わない。数字と傷も同じ札に収める。 */
  html.touch body #hud.mikata-guide .bl #h-hp {
    display:grid !important; grid-template-columns:max-content minmax(0,1fr) !important;
    width:100%; min-width:0; max-width:100%; gap:4px 8px; line-height:1.4;
  }
  html.touch body #hud.mikata-guide .bl #h-hp em {
    min-width:0; width:100%; box-sizing:border-box; overflow-wrap:anywhere;
    font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
  }
  html.touch body #hud.mikata-guide .bl #h-sta span,
  html.touch body #hud.mikata-guide .bl :is(#h-hp,#h-sta) em:not([hidden]) { display:block !important; font-size:max(12px,calc(12px * var(--text-scale,1))); color:#ece4d2; }
  /* 命と残量は共通の一行だけを使い、同じ升に見出しを重ねない。 */
  html.touch body #hud.mikata-guide .bl #h-hp > span,
  html.touch body #hud.mikata-guide .bl :is(#h-hp,#h-sta) em[hidden] { display:none !important; }
  html.touch body #hud.mikata-guide .bl :is(#h-hp,#h-sta) em { grid-column:1 / -1; text-align:left; white-space:normal; max-width:none; }
  html.touch body #hud.mikata-guide .bl #h-hp.deep :is(span,em) { color:#e38a74; }
  html.touch body #hud.mikata-guide .bl #h-sta i { height:5px; }
  /* 回避の丸に幅を取りすぎず、「押し続ける」の語尾まで同じ行へ収める。 */
  html.touch body #hud.mikata-guide .dodge-button .dodge-gesture { width:44px; height:44px; }
  html.touch body #hud.mikata-guide .dodge-button span { flex:1; }
  html.touch body #hud.mikata-guide .dodge-button b {
    font-size:max(18px,calc(18px * var(--text-scale,1)));
    word-break:keep-all; overflow-wrap:normal;
  }
  /* 共通の二十五％の制限より優先し、構える釦と持ち場を丸ごと収める。 */
  html body #hud.mikata-guide.compact-battle #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    max-height:min(40vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px)))))) !important;
  }
  /* 長押しは攻撃釦の上へ。任務欄もその上で止め、秒数を釦で覆わない。 */
  html.touch body #hud.mikata-guide #wait-guard {
    top:auto; bottom:calc(112px + env(safe-area-inset-bottom, 0px));
    width:208px; height:80px; min-height:80px; padding:6px; overflow-y:auto;
    grid-template-columns:28px minmax(0, 1fr) 24px; column-gap:6px; row-gap:2px;
    border-width:2px; border-radius:10px;
  }
  html.touch body #hud.mikata-guide #wait-guard svg:first-child { width:28px; height:40px; }
  html.touch body #hud.mikata-guide #wait-guard svg + svg { width:24px; height:32px; }
  html.touch body #hud.mikata-guide #wait-guard span { font-size:max(18px, calc(18px * var(--text-scale, 1))); }
  html.touch body #hud.mikata-guide #wait-guard small { font-size:max(13px, calc(13px * var(--text-scale, 1))); }
  html.touch body #hud.mikata-guide.wait-guard-active #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    max-height: min(40vh, calc(100% - 60px - env(safe-area-inset-top, 0px) - 112px - env(safe-area-inset-bottom, 0px) - 80px - 16px)) !important;
    overflow-y:auto; overflow-x:hidden;
  }
  html.touch body #hud.mikata-guide.wait-guard-active #objectives:not(.expand) .battle-action { display:none !important; }
}
`;
    // 下知は上端の片側へ。操作や待ち時間は残し、中央の敵と槍を空ける。
    guideStyle.textContent += `
html:root body #hud.mikata-guide.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.ground-order):not(.expand) {
 left:auto !important; right:calc(12px + env(safe-area-inset-right,0px)) !important;
 top:calc(12px + env(safe-area-inset-top,0px)) !important; transform:none !important;
 width:256px !important; max-width:36vw !important; padding:5px 8px !important;
 background:linear-gradient(110deg,rgba(35,29,21,.82),rgba(35,29,21,.58)) !important;
 border:0; border-left:2px solid #c2a25a; box-shadow:none;
}
html:root body #hud.mikata-guide.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.35 !important;
}
html:root body #hud.mikata-guide #battle-notices #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.obj-cue):not(.goal-place) {
 background:transparent; padding:2px 0; margin-top:2px; line-height:1.3;
}
/* 背の高い画面では下知を左の知らせ欄へ戻す。地面に沿う札は共通の配置を保つ。 */
@media (min-height:501px) {
 html:root body #hud.mikata-guide.single-guide #battle-notices:not(.choosing) #objectives#objectives#objectives:not(.ground-order):not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; box-sizing:border-box;
 }
}
`;
    document.head.appendChild(guideStyle);
    rt.hud.root.classList.add('mikata-guide');
    // 人物紹介を途中で切って見せず、読みたい時に開く。出陣の釦は常に残す。
    const intro = rt.hud.intro;
    rt.hud.intro = function (...args) {
      intro.apply(this, args);
      const reading = this.root.querySelector('#intro .intro-reading');
      const people = reading.querySelectorAll('.intro-person');
      if (!people.length) return;
      const toggle = document.createElement('button'), panel = document.createElement('div');
      toggle.type = 'button'; toggle.className = 'mikata-people-toggle';
      toggle.textContent = '味方の武将を見る';
      toggle.setAttribute('aria-expanded', 'false');
      panel.id = 'mikata-intro-people'; panel.hidden = true;
      toggle.setAttribute('aria-controls', panel.id);
      for (const person of people) panel.appendChild(person);
      toggle.onclick = () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
        toggle.textContent = panel.hidden ? '味方の武将を見る' : '武将の紹介を閉じる';
      };
      reading.append(toggle, panel);
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      guideStyle.remove();
      this.hud.intro = intro;
      this.hud.root.classList.remove('mikata-guide');
      return dispose.call(this);
    };
    const dropWeapon = rt.army.dropWeapon;
    rt.army.dropWeapon = function (u) {
      dropWeapon.call(this, u);
      fallenSpear(this, u);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { plateau: 'HIST_A', saigagake: 'HIST_A', gyorin: 'HIST_B', kakuyoku: 'HIST_B', hamamatsuFar: 'GAME_C', ifWin: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.routSaid = new Set();
    F.warnedGuns = new WeakSet();
    // 独立した中央の矢の札は任務に重なる。警告も既存の二枠へ収める。
    F.rainNoticeUntil = 0;
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || F.ending) return;
      F.rainNoticeUntil = Math.max(F.rainNoticeUntil, rt.t + volley.T + 0.4);
      rt.hud.notices.push('▲ 敵の矢が降る。その場を離れよ', 110, Math.max(3, volley.T + 0.4), 'warn',
        () => !rt.over && !rt.ended && !F.ending && rt.player.u.alive && rt.t < F.rainNoticeUntil);
    };
    const bark = rt.bark;
    rt.bark = function (text, ...args) {
      // 同じ斉射を台詞と警告札の二枚にしない。薄い地面の影を探させない。
      if (this.t < F.rainNoticeUntil && /矢が来る|矢じゃ|矢の雨|笠を傾け|矢が降る/.test(text)) return;
      // 一隊の敗走の声を、まだ守っている本人への退却命令にしない。
      if (/^味方の侍「/.test(text) && /退き口を守れ|固まって退け|殿を残して下がれ|無駄死にするな|負傷の者を担げ/.test(text)) {
        if (F.ending) return;
        text = F.step === 3 ? '味方と道の印を追い、浜松へ退け！'
          : F.dpOn && F.dpB ? F.dp?.cur?.s.kind === 'hold'
            ? '退く味方を先に通せ！　坂の上で追手を支えよ！'
            : '味方が退く！　南の坂の印へ続け！'
          : '味方の一隊が退く！　持ち場で槍をそろえ、下知を待て！';
      }
      return bark.call(this, text.replace(/影から出よ/g, '矢が落ちる所を離れよ'), ...args);
    };
    const say = rt.say;
    rt.say = function (speaker, text, dur) { return say.call(this, livingVoice(this, speaker), mikataOrderText(this, speaker, text), dur); };
    const hudSay = rt.hud.say;
    rt.hud.say = function (speaker, text, ...args) { return hudSay.call(this, livingVoice(rt, speaker), mikataOrderText(rt, speaker, text), ...args); };
    // 結果へ移るまで城門の前で帰着を見せる。視点の設定や動きを減らす設定でも静止画で見せる。
    const cameraTick = rt.player.updateCamera, playerTick = rt.player.update;
    rt.player.update = function (dt, input) {
      if (F.returnedT !== undefined) return;
      return playerTick.call(this, dt, input);
    };
    rt.player.updateCamera = function (dt, camera) {
      cameraTick.call(this, dt, camera);
      if (F.returnedT === undefined) return;
      camera.position.set(-12, W.heightAt(-12, HAMA.z - 23) + 3.2, HAMA.z - 23);
      camera.lookAt(HAMA.x, W.heightAt(HAMA.x, HAMA.z - 12) + 2.1, HAMA.z - 8);
    };
    rt.army.mikataFront = []; rt.army.mikataCap = 4;
    rt._rfN = 3; // 敗走中に共通の救済援兵を湧かせない
    rt.banner('兵力の目安', '味方 約一万一千、敵 約三万（諸説あり）');
    // ---- 織田の援軍：平手汎秀の手（自分の持ち場）、佐久間信盛の手 ----
    F.hirate = allyGroup(rt, { fixed: true, name: '平手汎秀の手', anchor: { x: 260 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '平手汎秀', invuln: false, horse: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 3 }], ODA));
    F.hiraU = F.hirate.units[0];
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: 150 / 16, z: LINE_Z }, facing: Math.PI, width: 6, spacing: 1, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.sakuU = F.saku.units[0];
    F.toku = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '徳川の手', anchor: { x: -125 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, formation: 'yari', fleeDir: { x: 0.15, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], TOKU));
    // 平手の鉄砲組（元亀三年、まだ数は少ない）：込めたまま待ち、寄せた所で揃えて放つ
    F.teppo = allyGroup(rt, { fixed: true, name: '平手の鉄砲組', anchor: { x: 260 / 16, z: LINE_Z + 8 }, facing: Math.PI, width: 8, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 8 }], ODA));
    F.oda = [F.hirate, F.saku, F.toku, F.teppo];
    F.guns = [F.teppo];
    F.fieldOpts = { list: null, reach: 18 };
    // 苦しい戦：一万余りで三万に当たる。味方は並の強さ
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.noRout = false; }
    // 配下は身分に応じた人数。足軽に自分の指揮する組を与えない。
    const n = RANKS[rt.G.rank].squad || 0;
    if (n) rt.makeSquad({ x: 260 / 16 + 3, z: LINE_Z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    for (const [x, z, k] of [[260 / 16 - 4, LINE_Z + 6, 'oda'], [260 / 16 + 4, LINE_Z + 6, 'oda'], [-125 / 16, LINE_Z + 4, 'tokugawa'], [150 / 16, LINE_Z + 6, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 図の各段を保つ。後詰めは段の間へ収め、本陣のさらに北へ伸ばさない。
    // 小幡の横位置は図の西側からの推定。徳川の八隊は同じ前線に並べる。
    const fb = (o, layout) => {
      const add = W.addDistantArmy;
      W.addDistantArmy = function (p) { return add.call(this, { ...p, ...layout, flagRate: MIKATA_FLAG_RATE, kind: 'mixed', general: o.general, secondGeneral: o.secondGeneral, mon: o.mon }); };
      let b;
      try { b = fieldButai(rt, { realMax: 8, mix: { ashigaru: 65, gun: 12, bow: 7, samurai: 12, cavalry: 4 }, ...o }); }
      finally { W.addDistantArmy = add; }
      // 共通の六十メートルの切り替えへ渡す。部隊自身は追加で兵を出さない。
      b.noSwitch = true;
      b._autoSwitch = () => {};
      b.light.army.noWake = false;
      b.light.army.team = b.team;
      b.light.army.jinkeiGuard = true;
      return b;
    };
    const build = (plan) => jinkeiBuild(rt, plan, (s, at) => {
      const faction = s.flag === 'akazonae' ? 'akazonae' : plan.team ? 'takeda' : 'tokugawa';
      return fb({ name: s.general + 'の備', general: s.general, team: plan.team, faction,
        kind: 'ashigaru', nominal: Math.round(s.soldiers / 15), armor: AR[faction], flag: s.flag, mon: s.mon,
        at, facing: plan.facing }, plan.team
          ? { ...jinkeiDistantLayout(plan, s), w: s.id === 'oyamada' ? 18 : s.at.front === TAKEDA_SECOND ? 12 : 14, d: 10,
            host: s.at.front > TAKEDA_THIRD ? 40 : false }
          : { w: 7, d: 14, host: 40 });
    });
    F.bA = build(TOKUGAWA_JIN);
    F.bT = build(TAKEDA_JIN);
    F.flank = [F.bA.ishikawa, F.bA.honda, F.bA.matsudaira];
    // 東の援軍は平手の手と組の持ち場から離す。後の押し合いも同じ所で行う。
    F.takiDA = W.addDistantArmy({ x: TAKIGAWA_X, z: LINE_Z, w: 7, d: 10, count: 180, facing: Math.PI, armor: AR.oda, flagTex: flagTexture('oda'), flagRate: MIKATA_FLAG_RATE, seed: 15723 });
    F.takiDA.army.team = 0;
    F.takiDA.army.noWake = true; // 押し合いの遠景へ引き継ぐまで実兵と重ねない
    F.allB = [...Object.values(F.bA), ...Object.values(F.bT)];
    F.fieldOpts.list = F.allB;
    // 武田の頭（F7）：毎回少し違う手を打つ。正面で押す／左（徳川の鶴翼の端）を回る／右（森の側）から赤備えを先に出す
    F.tPlan = ['naka', 'hidari', 'migi'][Math.floor(Math.random() * 3)];
    // 武田の本陣（北の奥）：武田信玄と旗本。控えは軽い兵
    F.campB = camp(rt, { x: 0, z: TAKEDA_JIN.honjin.z, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', armor: AR.takeda, tate: false, noUma: true, general: { name: '武田信玄', hat: 'kabuto_m', haori: 0x8a1a14 }, depth: false, guard: 15, reserve: 0, runTo: { x: 0, z: TAKEDA_HQ_Z - 20 } });
    // 徳川の本陣（鶴翼の後ろ）：徳川家康と旗本。鶴翼が破れると浜松城へ退く
    F.campA = camp(rt, { x: 0, z: 0, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: AR.tokugawa, compact: true, tate: false, general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x6a5a2a }, guard: 15, reserve: 0, runTo: { x: -40, z: LINE_Z - 4 } });
    // 本陣の旗本は、整った陣形のまま静かに待つ（寄ってきた敵にだけ向き直る。前へ出て乱れない）
    for (const H of [F.campA, F.campB]) for (const g of [H.guard, H.general && H.general.group]) if (g && g.count) { g.order = 'hold'; g.formation = 'line'; g.aggro = 6; g.seekRange = 10; }
    // 共通の本陣は護衛を南側に置く。北向きの家康の護衛は敵側へ戻す。
    F.campA.guard.anchor.z = -11;
    for (const u of F.campA.guard.units) { u.pos.z -= 22; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    F.shingariG = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '徳川の退き口の守り', anchor: { x: -18, z: 12 }, facing: Math.PI, order: 'hold', width: 6, aggro: 10 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], TOKU));
    // 犀ヶ崖の両の縁（崖は登れぬ。人も馬も東の道へ回る）
    for (let x = SAI.x0; x < SAI.x1; x += 8) { const x2 = Math.min(SAI.x1, x + 8); solidSeg(x, SAI.z - SAI.hw - 1, x2, SAI.z - SAI.hw - 1); solidSeg(x, SAI.z + SAI.hw + 1, x2, SAI.z + SAI.hw + 1); }
    // 村は水に乏しい原の上から東南の麓へ移す。民の逃げ道は家の北側を通す。
    rt.scene.add(hut(W, MURA.x, MURA.z, 6, 5, 0.2, { h: 2.6 }));
    rt.scene.add(hut(W, MURA.x + 10, MURA.z - 6, 5, 4, 0.5, { h: 2.4 }));
    rt.scene.add(tawara(W, MURA.x - 6, MURA.z + 6, 0.3, 5));
    rt.scene.add(hut(W, TOWN.x, TOWN.z, 6, 5, 0));
    rt.scene.add(hut(W, TOWN.x + 16, TOWN.z, 5, 4, 0));
    rt.scene.add(dou(W, FUSAI.x, FUSAI.z, 10, 7, Math.PI));
    // 追分（台地へ上る道と、祝田坂方向へ下る道が分かれる所。戦の初めだけ示す）
    rt.marker('oiwake', OIWAKE, '追分・武田が向かう坂', { h: 2 });
    rt.after(20, () => rt.unmark('oiwake'));
    // 城口は元の幅を保つ。画質「高」だけ土塁の上の板塀へ替える。
    const high = true;
    const bankTop = Object.create(W);
    bankTop.heightAt = (x, z) => W.heightAt(x, z) + 1.05;
    for (const [seg, nx, nz] of [
      [[-24, HAMA.z - 12, -5, HAMA.z - 12], 0, -1], [[5, HAMA.z - 12, 24, HAMA.z - 12], 0, -1],
      [[-24, HAMA.z - 12, -24, HAMA.z + 24], -1, 0], [[24, HAMA.z - 12, 24, HAMA.z + 24], 1, 0],
      [[-24, HAMA.z + 24, 24, HAMA.z + 24], 0, 1],
    ]) {
      if (high) {
        rt.scene.add(dorui(W, seg, nx, nz, { h: 1.1, w: 3, capEnds: true, closeBack: true }));
        // 写真の土塁上の板塀は笠板で雨を逃がす。尖った乱杭の輪郭を板塀へ重ねない。
        rt.scene.add(castleBoardFence(bankTop, seg, { h: 2.1, boardCap: true }));
        Object.assign(solidSeg(...seg, .15), { missileH: 3.15, missileType: 'wood' });
      } else rt.scene.add(palisade(W, seg, { solid: true, h: 2.4 }));
    }
    rt.scene.add(kabukimon(W, HAMA.x, HAMA.z - 12, 10, Math.PI, { doors: false }));
    if (high) {
      mikataFieldProps(rt);
      // 丸太を交互に組んだ井楼。下の板囲いと中段で二重の姿を出す。
      // 写真の通し柱は垂直。横木は段ごとに組み順を替え、四隅へ木口を突き出す。
      // 高さ・屋根・床・上り口は保ち、共通部品の遠景用の粗い形も使う。
      rt.scene.add(yagura(W, -20, HAMA.z - 6, { height: 7.2, boarded: true, logFrame: true, mon: 'tokugawa', team: 0 }));
      rt.scene.add(yagura(W, 20, HAMA.z + 18, { height: 7.2, boarded: false, logFrame: true, mon: 'tokugawa', team: 0 }));
      // 写真の古い板葺きに寄せ、灰色の雨褪せと差し替え板の茶を既存の頂点色で混ぜる。
      // 屋根の面数を増やさず、屋形の戸口も空けておく。
      rt.scene.add(hut(W, 12, HAMA.z + 10, 6, 4, 0, { ita: true, weatheredBoards: true, minka: false, h: 2.3 }));
      rt.scene.add(hut(W, 12, HAMA.z + 19, 6, 4, 0, { ita: true, weatheredBoards: true, minka: false, h: 2.5 }));
    }
    // 段丘の屋形は推定復元。城口に向く北の縁側から入り、畳の広間と奥の座敷へ通す。
    // 共通の室内で竿縁天井・柱・長押を作り、近づいた時だけ描く。戦の兵や攻撃対象は増やさない。
    goten(rt, HAMA.x - 12, HAMA.z + 14, {
      w: 14, d: 9, rot: 0.1, tile: false, earth: 0xb3a082,
      // 入母屋の形は保ち、厚い一色の屋根を薄い古板葺きへ。継ぎ目と雨染みは共有の絵で描く。
      templeBoardRoof: high,
      name: '浜松城の屋形', naka: true, profile: 'mikatagahara',
      door: -1, doorX: 0, team: 0, noTarget: true,
    });
    for (const [x, z] of [[HAMA.x - 8, HAMA.z], [HAMA.x + 8, HAMA.z]]) { rt.scene.add(nobori(W, x, z, 'tokugawa', 6)); rt.scene.add(campfire(W, x, z + 4)); W.addFire(x, z + 4); }

    // 木部は共通の不透明な見通し処理へ渡す。城門の梁と屋根を二重写しにしない。
    // 目の前の陣幕だけ専用に抜き、布の向こうの退路を見せる。
    const nearMats = new Map();
    const nearMat = (source, cloth) => {
      if (!cloth) return source;
      if (!nearMats.has(source)) {
        const mat = source.clone();
        mat.onBeforeCompile = source.onBeforeCompile;
        mat.customProgramCacheKey = source.customProgramCacheKey;
        mat.transparent = true; mat.depthWrite = false;
        mat.userData.camNearSmooth = true;
        if (cloth) {
          mat.customProgramCacheKey = () => source.customProgramCacheKey() + '|mikata-cloth-near';
          mat.onBeforeCompile = (sh, renderer) => {
            source.onBeforeCompile.call(mat, sh, renderer);
            sh.vertexShader = 'varying vec3 vMikataClothNear;\n' + sh.vertexShader.replace(
              '#include <project_vertex>', '#include <project_vertex>\nvMikataClothNear = mvPosition.xyz;');
            sh.fragmentShader = 'varying vec3 vMikataClothNear;\n' + sh.fragmentShader.replace(
              '#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (length(vMikataClothNear) < 3.4) discard;').replace(
              '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= smoothstep(3.4, 5.4, length(vMikataClothNear));');
          };
        }
        nearMats.set(source, mat);
      }
      return nearMats.get(source);
    };
    rt.scene.traverse((mesh) => {
      if (!mesh.isMesh || !(mesh.userData.camBlock || mesh.userData.camNear)) return;
      const cloth = !!mesh.geometry?.attributes.jpin;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mat) => nearMat(mat, cloth)) : nearMat(mesh.material, cloth);
    });
    winterGround(W);
    applyLook(rt, WINTER_DUSK);
    rt.setPhase('brief');
    rt.obj('main', '目の前の槍の持ち場へ進め', 'main', true);
    rt.banner('夕暮れの三方ヶ原', '浜松を出た味方の前に、武田の大軍');
    rt.say('平手汎秀', '槍の持ち場へ来い。北へ槍を向けよ！　その先から敵が来るぞ！', 3.5);
    // 透ける隊旗を囲まず、実際に立つ地面の持ち場へ案内する。
    rt.marker('hira', HIRATE_POST, '平手の槍の持ち場', { h: 2, guideAlways: true, guideArea: 'wait', guideRadius: 8 });
    rt.after(6, () => { if (rt.phase === 'brief') this.first(rt); });
    // 生還が務めであることは導入にも残す。読んだ心得を乱戦中ずっと重ねない。
    rt.after(24, () => rt.objRemove('lostcause'));
  },

  // ① 武田の先手を受け止める
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    renewOrders(rt);
    F.step = 1; F.stepT = rt.t;
    rt.objRemove('lostcause'); // 生還の心得は導入と待機中で読み、接敵前に畳む。
    rt.setPhase('first');
    rt.marker('hira', HIRATE_POST, '平手の槍の持ち場', { h: 2, guideAlways: true, guideArea: 'wait', guideRadius: 8 });
    rt.banner('武田の備え', '坂の手前で、武田がこちらへ向き直る');
    const task = rt.obj('main', '平手の列で敵へ構えよ', 'main', true);
    task.cue = '合図：正面の早打ち＝敵の寄せ'; task.cueT = rt.t;
    takedaMove(rt, 'first');
    // 先手の待ち時間にも東の備えが寄せ合う。後の押し合いと同じ遠景を使う。
    this.plainClash(rt);
    // 本隊の布陣は動かさず、先に出た物見が平手の列の東へ寄せる。
    F.scout = enemyGroup(rt, { fixed: true, faction: 'takeda', name: '武田の物見の騎馬', anchor: { x: 28, z: LINE_Z - 24 }, facing: 0, order: 'attack', seekRange: 50, aggro: 10, width: 6, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      depthLook(rt, [{ type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 2 }], TAKEDA));
    // 槍列のすぐ前まで寄せる。北で攻撃へ替えると、別の備へ逸れて本人の接敵が遅れる。
    F.scout.order = 'path'; F.scout.retreatOnly = true; F.scout.speed = 3.2;
    F.scout.path = [[HIRATE_POST.x, LINE_Z - 4]]; F.scout.pathIdx = 0;
    F.scout.onArrive = (g) => { g.retreatOnly = false; g.order = 'attack'; };
    // 開始六秒で騎馬の土煙。粒は共通の使い回す枠へ、一度だけ足す。
    for (const u of F.scout.units) if (u.mounted) rt.world.dustCloud(u.pos.x, u.pos.z, true, true);
    rt.after(2, () => {
      if (F.ending || F.step !== 1) return;
      rt.say('組頭', '正面の法螺と早打ちは武田の寄せじゃ！　味方と槍先をそろえろ！', 4);
      for (const g of [F.hirate, F.saku, F.toku]) if (!gone(g)) {
        g.order = 'hold'; g.formation = 'yari'; g.yariKneel = true;
      }
    });
    rt.after(4, () => { if (!F.ending && F.step === 1) F.cl.volley('B'); });
    rt.after(22, () => {
      if (F.ending || F.step !== 1) return;
      rt.say('物見', '正面に武田の弓！　射手の前を外れよ！', 3);
      rt.after(3, () => { if (!F.ending && F.step === 1) F.cl.arrows('B'); });
    });
    // 小山田の先手の位置から寄せる。
    F.w1 = enemyGroup(rt, { fixed: true, faction: 'takeda', name: '武田の先手', anchor: { x: 0, z: TAKEDA_HQ_Z + OYAMADA_FRONT }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 18, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1, formation: 'yari' },
      depthLook(rt, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt, 0.4) }, { type: 'bow', n: 4 }], TAKEDA));
    // 敵の寄せる合図は、正面の先手から届く。味方への突撃命令にしない。
    rt.army.playFar('sig_kakari', F.w1.anchor, 1);
    rt.after(1.5, () => {
      if (F.ending || F.step !== 1 || F.dpOn || gone(F.w1)) return;
      rt.army.playFar('eshout', F.w1.units.find((u) => u.alive && !u.gone)?.pos || F.w1.anchor, 0.8);
    });
    rt.marker('w1', centerOf(F.w1), '武田の先手', { red: true, group: F.w1 });

    // 小山田を先に、東の山県と後続の備を厚く置く。各備の位置は推定。
    rt.after(32, () => { if (F.step === 1 && !F.ending) rt.say('物見', '小山田信茂の先手じゃ！　その後ろにも武田の旗！', 3.5); });
    // 勝ち筋：勝てぬ戦。台地の南の坂を下れば浜松城。生きて退く道をはじめに示す
    rt.after(16, () => { if (F.step === 1 && !F.ending) rt.say('組頭', '退けの下知が出たら、背後の南の坂へ。浜松城へ戻るぞ！', 3.5); });
    // 退く下知の時に、南の道を順に示す。

  },

  // 段を重ねる（b_depth.js）：A 魚鱗の寄せ（先手の後）→ B 台地の退き口（赤備えの後）
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    renewOrders(rt);
    F['dp' + which] = true; F.dpOn = true;
    rt.objRemove('lostcause'); // 初めの心得を読んだ後は、今の持ち場と下知を優先する。
    // 主な下知は同じ札に残す。段の細かな札が済んでも退き先を失わせない。
    rt.obj('main', which === 'A' ? '平手の陣を守り、右に備えよ' : '南の坂へ退き、退き口を守れ', 'main', true);
    for (const k of ['hira', 'w1', 'aka']) rt.unmark(k);
    if (which === 'A') this.plainClash(rt);
    // 赤備えは駆け抜けて、徳川の鶴翼の方へ去る（平手の手を包むのは武田の本隊）
    if (which === 'B' && F.aka && !gone(F.aka)) { F.aka.anchor = { x: -36, z: 12 }; F.aka.order = 'move'; F.aka.dest = F.aka.anchor; F.aka.aggro = 6; rt.bark('赤備え、徳川の備えへ駆け抜ける'); }
    if (which === 'B') {
      rt.army.mikataCap = 3; // 坂へ退き始めた時から、追手の先頭を絞る。
      rt.army.mikataRetreatGoal = SOUTH_SLOPE;
      retreatDistant(rt);
      // 家康と旗本も坂へ寄せる。殿の段に入ってから本陣を出ると、刻限に間に合わない。
      slopeGroup(F.campA.guard);
      slopeGroup(F.campA.general?.group);
      slopeGroup(F.shingariG);
      // 下知の待ち時間や到着後も、段が消す印とは別に退き先を残す。
      // 持ち場は坂の上まで。味方を通す前に城へ走らせない。
      rt.marker('retreat-way', () => F.dp?.cur?.at || (F.dp?.i < 2 ? SOUTH_SLOPE : REARGUARD_POST),
        () => F.dp?.cur?.arr ? '坂に着いた。追手へ構えよ' : F.dp?.i < 2 ? '退く先・南の坂' : '味方を守る坂の上', { h: 3, guideAlways: true });
    }
    const steps = which === 'A' ? mkA() : mkB();
    const orders = which === 'A'
      ? ['味方の槍の列をそろえ直せ', null, '右の森へ槍を向け直せ']
      : ['味方と南の坂へ退け', null, '坂で追手を支え、味方を先に通せ', null];
    depthStart(rt, mkCtx(rt), missionSteps(steps, orders), () => {
      F.dpOn = false; rt.objRemove('dp');
      if (which === 'B') rt.unmark('retreat-way');
      if (which === 'A') this.crash(rt);
      else this.retreat(rt);
    });
  },

  // 「崩れた武田へなお圧せよ」の IF の勝ちはやめた（10/3）。この戦は勝てぬ戦で、生き延びて浜松へ退くのが芯
  // 台地の東：織田の援軍と武田の大軍が、正面いっぱいに組み合う（軽い作り）。赤備えが来ると崩れる
  plainClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    if (F.takiDA) F.takiDA.visible = false;
    F.cl = clash(rt, { x: TAKIGAWA_X, z: LINE_Z - 14, facing: Math.PI, w: 12, gap0: 34, closeSpeed: 3.6, seed: 15727, noRout: true, killRate: 0.15,
      groundedMelee: true, measuredMelee: true, // 立ち姿を消してから同じ位置・向きで膝を折る。寝姿を突然重ねない。
      surge: { k: 'B', every: 38, count: 160, flank: 0.4 },
      A: { flag: 'oda', armor: AR.oda, count: 380, team: 0, faction: 'oda', flagRate: MIKATA_FLAG_RATE },
      B: { flag: 'takeda', armor: AR.takeda, count: 820, team: 1, faction: 'takeda', guns: true, bows: true, flagRate: MIKATA_FLAG_RATE } });
    F.cl.push('B', 0.35);
    rt.after(1, () => F.cl.go());
  },

  // ② 赤備えの騎馬に崩される
  crash(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    renewOrders(rt);
    F.step = 2; F.stepT = rt.t;
    rt.army.mikataCap = 4;
    rt.setPhase('crash');
    rt.unmark('w1'); rt.unmark('hira');
    rt.banner('赤備え', '山県の赤備え、横合いから寄せる');
    rt.obj('main', HI(rt) ? '一手を右へ向け、赤備えを支えよ' : '右から来る赤備えを支えよ', 'main', true);
    takedaMove(rt, 'crash');
    fadeMikataLook(rt, TWILIGHT);   // 夕刻→薄暮→（退き口で）夜
    F.aka = enemyGroup(rt, { fixed: true, faction: 'akazonae', name: '山県の赤備え', anchor: { x: 300 / 16, z: TAKEDA_HQ_Z + TAKEDA_SECOND + 34 }, facing: -Math.PI * 0.8, order: 'hold', seekRange: 140, aggro: 10, width: 14, morale: 100, noRout: true, fleeDir: { x: 1, z: -1 }, dmgMult: 1 },
      depthLook(rt, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 9 + more(rt, 0.2) }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AKA));
    // 備えの主将は遠景からの実体化だけで置き、突撃隊に複製しない。
    F.aka0 = F.aka.count;
    // 判断：赤備えをどう受けるか（時間切れは槍衾。受け方で傷と手柄が変わる）。赤備えは森の際で馬を揃えてから駆け出す
    const go = () => {
      if (F.ending || F.step !== 2 || F.dpOn || gone(F.aka) || F.aka.order !== 'hold') return;
      if (!F.mkFlank) for (const [i, g] of [F.hirate, F.saku].entries()) if (g && g.count && !g.routed) {
        g.order = 'hold'; g.anchor = { x: 14 - i * 8, z: LINE_Z - 2 };
        g.facing = Math.atan2(300 / 16 - g.anchor.x, TAKEDA_HQ_Z + TAKEDA_SECOND + 34 - g.anchor.z);
        g.formation = 'yari'; g.aggro = 14;
      }
      F.aka.order = 'attack'; F.aka.aggro = 18;
      // 待機中は駆ける音を鳴らさず、出足に合わせて今いる騎馬の位置から鳴らす。
      const horse = F.aka.units.find((u) => u.alive && !u.gone && u.mounted);
      const at = horse?.pos || F.aka.anchor;
      rt.army.playFar('sig_kakari', at, 1);
      if (horse) rt.army.play('gallop', at, 1.8);
      const task = rt.obj('main', F.mkFlank ? '味方と森から赤備えの横へ回れ' : '味方と右へ槍を向け、馬を受けよ', 'main', true);
      task.cue = '合図：右の早打ち＝赤備えの寄せ'; task.cueT = rt.t;
      rt.say('足軽', '右の法螺と太鼓が早まった！　馬が駆け出したで！', 3);
      rt.after(1.5, () => {
        if (F.ending || F.step !== 2 || F.dpOn || gone(F.aka)) return;
        rt.army.playFar('eshout', F.aka.units.find((u) => u.alive && !u.gone)?.pos || F.aka.anchor, 0.8);
      });
    };
    rt.after(17, go);
    rt.after(1, () => {
      if (F.step !== 2 || F.ending) return;
      if (!HI(rt)) {
        F.mkFlank = false;
        rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '味方と馬を受ける持ち場', { h: 2, guideAlways: true });
        rt.say('組頭', '右へ向け！　隣の槍と隙間を空けるな！', 3);
        return;
      }
      rt.choose('右の馬をどう受ける？', [
        { label: '味方と槍をそろえる', note: '持ち場で馬を受ける' },
        { label: '森から横へ回る', note: '列を離れると囲まれる' },
      ], (i) => {
        F.mkFlank = i === 1;
        rt.obj('main', F.mkFlank ? '味方と森から赤備えの横へ回れ' : '味方と右へ槍を向け、馬を受けよ', 'main', true);
        rt.after(i === 1 ? 8 : 3, go);
        if (i === 0) {
          rt.say('組頭', '槍をそろえろ！　槍の尻を地につけ、馬へ向けよ！', 3.5);
          rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '味方と槍をそろえる所', { h: 2, guideAlways: true });
          // 受ける段が終わるまで、持ち場の印を保つ。
        } else {
          rt.say('組頭', '味方と森へ！　赤い騎馬の横へ回れ！', 3.5);
          rt.marker('pike', { x: 46, z: -44 }, () => F.mkFlankArrived ? 'ここで赤備えの横を突け' : '味方と森の陰へ', { h: 2, guideAlways: true });
          // 着いた後も持ち場を残し、退く下知で消す。
          rt.after(18, () => { if (F.step === 2 && !F.dpOn && !F.ending) rt.bark('味方と横から当たれ。深追いするな！'); });
        }
      }, 12);
    });
    rt.marker('aka', centerOf(F.aka), '右の赤備え・槍を向けよ', { red: true, group: F.aka });
    rt.say('足軽', '赤い具足の騎馬だがや！　右におるぞ！', 3);
    // 後ろの赤備えの大軍は、山県の備（部隊の軽い作り）が森の際まで寄せて見せる（takedaMove）
    if (F.cl) { F.cl.cavalry('B', { from: 1, count: 160, flag: 'akazonae', armor: AR.akazonae, delay: 2 }); rt.after(8, () => F.cl.cavalry('B', { from: -1, count: 100, flag: 'takeda', armor: AR.takeda })); }
    // 横の列の崩れは、更新時に接触後の損害と士気で確かめる。
  },

  // ③ 平手の討ち死に、浜松城へ退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    renewOrders(rt);
    F.step = 3; F.stepT = rt.t;
    rt.army.mikataCap = 3; // 追手が一度に重なって退く足を止めない。
    F.retreating = true;
    rt.army.mikataGateLine = HAMA.z - 26;
    rt.setPhase('retreat');
    rt.unmark('aka'); rt.unmark('exit'); rt.unmark('pike'); rt.unmark('oiwake');
    // 目の前の汎秀は既存の敵の攻撃で倒れる。史実の討死は戦場全体の後報として伝える。
    sfx('kane', 0.4);
    rt.banner('織田の援軍、退く', F.flankBroken ? '隣の備えが崩れ、浜松城へ退く' : '武田の寄せを受け、浜松城へ退く');
    rt.after(8, () => { if (!F.ending) rt.say('組頭', '散るな！　組の者と連れ立って下れ！', 3); });
    rt.say('組頭', '浜松へ退け！　崖は下るな。東の道の印を追え！', 4);
    // 目の前の組頭の声と同時に札を替える。使番待ちで坂の守りの札を残さない。
    rt.obj('main', HI(rt) ? '一手を率い、浜松城へ退け' : '追手を避け、浜松へ退け', 'main', true);
    F.retreatPoint = { x: 10, z: 60 }; F.retreatIdx = 0;
    while (F.retreatIdx < RETREAT_ROAD.length - 1 && rt.player.u.pos.z > RETREAT_ROAD[F.retreatIdx][1]) F.retreatIdx++;
    F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
    rt.army.mikataRetreatGoal = F.retreatPoint;
    rt.marker('hama', () => F.retreatPoint, () => RETREAT_LABELS[F.retreatIdx], { h: 3, guideAlways: true });
    rt.zone('hama', HAMA.x, HAMA.z, 10);
    fadeMikataLook(rt, MIKATA_NIGHT);
    retreatDistant(rt);
    F.pursuit.moveTo(8, 104, 32, { charge: true });
    rt.after(32, () => { if (!F.ending) F.pursuit.moveTo(14, 136, 22, { charge: true }); });
    for (const g of [F.hirate, F.saku, F.teppo]) retreatGroup(g);
    // 追手
    F.chase = [];
    const mk = (x, z, name, list) => {
      // 実兵の上限で追手が零人なら、空の隊の道順を触らず退却を続ける。
      const recruits = depthLook(rt, list, TAKEDA);
      if (!recruits.length) return null;
      const g = enemyGroup(rt, { fixed: true, faction: 'takeda', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1, speed: 3.2 }, recruits);
      if (gone(g)) return null;
      // 追手も崖の東を下る。遠い味方を追って台地に留まらせない。
      retreatGroup(g, 3.6);
      // 城内へ通すのは味方だけ。追手の道順は門の外で終える。
      g.path[g.path.length - 1] = [14, rt.army.mikataGateLine - 6];
      g.noRout = false; // 道順の指定で追手まで不退転にしない。
      g.onArrive = (q) => { q.order = 'hold'; q.noRout = false; q.seekRange = 0; q.aggro = 5; };
      F.chase.push(g);
      rt.marker('c' + F.chase.length, centerOf(g), name, { red: true, group: g });
      return g;
    };
    // 追手は台地の既定の入口から来る。本人の位置に合わせて湧かせない。
    rt.after(2, () => { if (!F.ending && F.step === 3 && !F.dpOn) mk(4, 38, '追ってくる武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }]); });
    rt.after(18, () => {
      if (F.ending || F.step !== 3 || F.dpOn) return;
      mk(30, 80, '回り込んだ武田勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.3) }]);
      // 後ろに武田の本隊（内藤昌豊の後詰の備）が原を埋めて続く（軽い作り）。追手は数人ずつでなく、大軍の先の手として見せる
      adv(F.bT.naito, 160, 60);
      rt.say('足軽', '後ろは武田の旗ばっかりだわ！　城まで走れ！', 3);
    });

    // 家康と護衛は東の道を下る。身代わりの名乗りは確定した出来事として演じない。
    const ie = F.campA.general ? F.campA.general.group : null;
    retreatGroup(ie, 4);
    retreatGroup(F.campA.guard);
    F.ieyasuG = ie;
    const sg = F.shingariG;
    sg.order = 'path'; sg.path = [[10, 60], [14, 104]]; sg.pathIdx = 0;
    sg.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    if (F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.noRout = false; }
    if (F.w1 && !gone(F.w1)) { F.w1.order = 'hold'; }
    // 東の酒井の備も、崖の東を通って浜松へ退く。
    allyFall(rt, F.bA.sakai);
    // 下知で退く備に、架空の死傷者を加えない。
    for (const b of F.flank) allyFall(rt, b);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    renewOrders(rt); // 城門の場面へ、原で待っていた下知を持ち越さない。
    F.ending = true;
    rt.setPhase('end'); F.returnedT = rt.t;
    rt.army.mikataReturned = true;
    if (F.pursuit) { F.pursuit.halt(); F.pursuit.visible = false; }
    rt.player.lock = null; rt.player.inCombatT = 0; rt.player.camShot = null;
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '浜松城へ生きて退いた');
    survival(rt, '三方ヶ原から生きて浜松城へ退いた');
    sfx('horagai', 0.4);
    rt.banner('浜松城へ帰着', '徳川・織田勢は敗れた。生きて城へ戻った');
    rt.say('組頭', `${nm(rt)}、よう戻った。組の者を数え、深手の者を手当てせよ`, 5);
    rt.after(6, () => rt.say('', '平手汎秀は討ち死にし、家康は浜松城へ退いた', 3.5));
    rt.after(11, () => rt.say('組頭', F.coverPassed > 0 ? 'そなたが支えた坂を、味方が下れた。次の守りも頼むぞ' : '戻れぬ者の名を、殿へ届けよう。次の守りも頼むぞ', 3.5));
    rt.player.u.invuln = true;
    // 城へ戻った後に共通の追撃を始めない。帰着後の重傷を生還の評定へ混ぜない。
    rt.after(18, () => { if (!rt.over) rt.finish({ scriptedEnd: true }, 0.2); });
  },

  // 実際の退路の断絶による終了。門の時間切れでは負けない。
  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('取り残された', '浜松城へたどり着けず、武田の追手に退く道を断たれた');
    rt.say('足軽', '道が塞がっとる……！　追手に先を越されたわ！', 3);
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.dpOn && F.dpB) rt.army.mikataRetreatGoal = F.dp?.cur?.at || (F.dp?.i < 2 ? SOUTH_SLOPE : REARGUARD_POST);
    // 話す前に討たれた待ち列の上役も差し替える。既に話し終えた記録は変えない。
    for (const line of rt.hud.subQ) {
      line.text = mikataOrderText(rt, line.speaker, line.text);
      line.speaker = livingVoice(rt, line.speaker);
    }
    // 具足の補光も薄暮から夜へ弱める。灯りと材質は作り足さない。
    const shade = Math.min(1, Math.max(0, (rt.t - F.stepT) / 30));
    F.rim.intensity = F.step >= 3 ? 0.7 - shade * 0.48 : F.step === 2 ? 1.1 - shade * 0.4 : 1.1;
    rt.world.skyMat.uniforms.mikataSunset.value = F.step >= 3 ? Math.max(0, 0.6 - (rt.t - F.stepT) / 65) : 1;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    if (F.pursuit && rt.t >= (F.pursuitSoundT || 0)) {
      F.pursuitSoundT = rt.t + 5.5;
      const at = F.pursuitSound, a = F.pursuit.army;
      at.x = a.cx + a.off.x; at.z = a.cz + a.off.z; at.y = rt.world.heightAt(at.x, at.z);
      rt.army.play('gallop', at, 1.1);
      // 鉄砲音は既存の射手が発砲した時に鳴る。射手が退いた後まで繰り返さない。
    }
    // 手ほどきは一度きりなので、深手になる前に原因と退き方を字幕でも知らせる。
    const hit = rt.player.lastHit;
    if (F.step > 0 && rt.player.u.hp < rt.player.u.maxHp * 0.65 && hit && rt.t - hit.t < 8 && !(F.woundWarnT > rt.t)) {
      F.woundWarnT = rt.t + 32;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった！' : '鉄砲で撃たれた！') : hit.back ? '背中を突かれた！' : hit.side ? '横から打たれた！' : '正面から打たれた！';
      const withdrawing = F.step === 3 || F.dpOn && F.dpB;
      const how = hit.ranged ? '構えでは防げぬ。射手から横へ退け。' : withdrawing
        ? isTouch ? '敵へ向き「ふせぐ」を長押し。刃を防いだら、はなして道の印へ進め。' : '敵へ向き右押しで防げ。刃を防いだら、はなして道の印へ進め。'
        : isTouch ? '敵へ向き「ふせぐ」を長押しし、味方へ下がれ。' : '敵へ右押しで構え、味方へ下がれ。';
      // 操作の字幕は話者を付けず、待ち列の先頭へ。武将の台詞に埋もれさせない。
      rt.hud.say('', cause + how, 4, true);
    }
    const p = rt.player.u.pos;
    // 半秒ごとに近くの実兵だけを見る。兵・弾・札を毎コマ作らない。
    if (F.step > 0 && rt.t >= (F.lookoutT || 0)) {
      F.lookoutT = rt.t + 0.5;
      for (const q of rt.army.units) {
        if (!q.alive || q.gone || q.fleeing || q.woundOut || q.team !== 1) continue;
        const dx = q.pos.x - p.x, dz = q.pos.z - p.z, d = Math.hypot(dx, dz);
        if (!F.yamagataSaid && q.name === '山県昌景' && d < 28) {
          F.yamagataSaid = true;
          rt.say('山県昌景', '槍列の端へ回れ！　退き口を押さえよ！', 3);
        }
        if (q.type !== 'gun' || q.sidearm || !q.group || d > 60 || F.warnedGuns.has(q.group) || rt.t < (F.gunWarnT || 0) || rt.army.wallBetween(p, -1, q.pos)) continue;
        F.warnedGuns.add(q.group); F.gunWarnT = rt.t + 12;
        const yaw = rt.player.yaw, front = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const dir = front < 0 ? '背後' : side > 8 ? '右前' : side < -8 ? '左前' : '正面';
        rt.bark(`${dir}に武田の鉄砲！　筒先から横へ外れよ`, true);
      }
    }
    // 備えの足元が接した所で押し合う。離れた備えに損害を与えない。
    fieldTick(rt, dt, F.fieldOpts);
    // 接触した備が傷を受けて列を保てなくなった時に退く。秒数では死傷を増やさない。
    if (F.step === 2 && !F.flankBroken) {
      for (const b of F.flank) {
        if (!b.routedL && !(b.engagedT !== undefined && (b.lost >= b.nominal * 0.15 || b.morale < 45))) continue;
        F.flankBroken = true;
        rt.say('足軽', '徳川の列が崩れたがや！　横から来るぞ、道を塞がせるな！', 3.5);
        for (const q of F.flank) allyFall(rt, q);
        const H = F.campA;
        retreatGroup(H.general && H.general.group, 3.2); retreatGroup(H.guard, 3.2);
        break;
      }
    }
    // 東の押し合いも、実際に残った兵と士気で崩れる。武田の強制敗走はしない。
    if (F.step >= 2 && F.cl && !F.cl.A.routed && F.cl.phase === 'fight' &&
        (F.cl.A.alive <= F.cl.A.n0 * 0.6 || F.cl.A.m < 35)) F.cl.rout('A', { hideAfter: 20, from: 1 });
    // 台本の隊が崩れたら、同じ備の部隊も揺らぐ（先手→小山田の備、赤備え→山県の備）
    if (!F.w1Hit && F.w1 && gone(F.w1)) { F.w1Hit = true; F.bT.oyamada.morale = Math.min(F.bT.oyamada.morale, 20); }
    if (!F.akaHit && F.aka && gone(F.aka)) { F.akaHit = true; F.bT.yamagata.morale = Math.min(F.bT.yamagata.morale, 22); }
    depthTick(rt, dt);
    // 家康と供は同じ道を退く。供が遅れた時は大将の歩みを落とす。
    const guard = F.campA.guard, chief = F.campA.general;
    if (chief?.alive && guard?.order === 'path') {
      let rear = 0;
      for (const q of guard.units) if (q.alive && !q.fleeing && !q.woundOut) rear = Math.max(rear, Math.hypot(q.pos.x - chief.pos.x, q.pos.z - chief.pos.z));
      if (chief.group && chief.group !== guard) chief.group.speed = rear > 12 ? 1.8 : 3;
      guard.speed = rear > 18 ? 2.6 : 3;
      for (let i = 0; i < 2; i++) {
        const g = i === 0 ? F.hirate : F.saku;
        if (g.order === 'path') g.speed = Math.hypot(g.anchor.x - guard.anchor.x, g.anchor.z - guard.anchor.z) > 24 ? (g.anchor.z > guard.anchor.z ? 2.4 : 3.2) : 3;
      }
    }
    if (F.dpOn || F.ifOn) return;
    if (F.step === 1) {
      // この後も後詰を受ける。先手の刻限を、城へ退く刻限とは案内しない。
      if (!F.dpOn) rt.objProgress('main', `${isTouch ? '長押しでふせぐ' : '右押しを押し続けてふせぐ'}。次の下知まで最大${Math.max(0, Math.ceil(55 - (rt.t - F.stepT)))}秒`);
      if (F.w1.count < 6 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 25);
      // 武田の奥へ出たことを記録する。別の勝ち筋にはしない。
      if (!F.overchase && p.z < -85) F.overchase = true;
      if ((gone(F.w1) && rt.t - F.stepT > 18) || rt.t - F.stepT > 55) this.deep(rt, 'A');
    }
    if (F.step === 2) {
      if (!F.akaEngaged) for (const q of F.aka.units) {
        const target = q.swing?.target || q.atk?.target;
        if (q.alive && !q.fleeing && target?.alive && target.team === 0 &&
            Math.hypot(q.pos.x - 14, q.pos.z - (LINE_Z - 2)) < 18) { F.akaEngaged = true; break; }
      }
      if (F.mkFlank && Math.hypot(p.x - 46, p.z + 44) < 5) F.mkFlankArrived = true;
      if (F.mkFlankArrived && !F.mkFlankFought) {
        if (rt.player.u.swing?.target?.group === F.aka && rt.player.u.swing.res != null) F.mkFlankFought = true;
        for (const q of rt.squad) if (q.alive && !q.fleeing && !q.woundOut && q.atk && q.target?.group === F.aka && Math.hypot(q.pos.x - 46, q.pos.z + 44) < 18) F.mkFlankFought = true;
      }
      if (!F.dpOn) rt.objProgress('main', F.mkFlank ? (F.mkFlankArrived ? '味方と赤備えの横腹へ当たれ' : '森の陰へ進め。味方から離れるな') : '右へ槍を向け、味方と列を保て');
      if (rt.t - F.stepT > 45 || ((F.flankBroken || F.aka.count < 8) && rt.t - F.stepT > 28)) {
        rt.unmark('pike');
        if (rt.player.u.alive && !F.akaPaid) {
          F.akaPaid = true;
          if (F.mkFlank && F.mkFlankArrived && F.mkFlankFought && F.aka.count <= F.aka0 * 0.6) rt.award((t) => { t.special = { label: '赤備えの横腹を突いた', pts: Math.max(t.special ? t.special.pts : 0, 20) }; }, '赤備えの横腹を突いた');
          else if (!F.mkFlank && F.akaEngaged && Math.hypot(p.x - 14, p.z - (LINE_Z - 2)) < 18 && !gone(F.hirate)) rt.award((t) => t.side.push('槍衾で赤備えを受け止めた'), '槍衾で赤備えを受け止めた');
        }
        rt.say('組頭', F.flankBroken ? '隣の備えが割れたぞ！　南の道を空けよ！' : '後詰まで寄せてきおった！　南へ退くぞ、組を離れるな！', 4);
        this.deep(rt, 'B');
      }
    }
    if (F.step === 3) {
      while (F.retreatIdx < RETREAT_ROAD.length - 1 &&
        (Math.hypot(p.x - RETREAT_ROAD[F.retreatIdx][0], p.z - RETREAT_ROAD[F.retreatIdx][1]) < 6 ||
          (p.x > -16 && p.z > RETREAT_ROAD[F.retreatIdx][1] + 4))) F.retreatIdx++;
      F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
      const d = Math.hypot(p.x - HAMA.x, p.z - HAMA.z);
      for (const q of F.chase || []) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      const left = Math.ceil(Math.hypot(p.x - F.retreatPoint.x, p.z - F.retreatPoint.z));
      rt.objProgress('main', `${RETREAT_LABELS[F.retreatIdx]}、あと${left}歩`);
      // 城へ入ったら退き口は終わる。開いた門で新たな総攻めを受ける筋にはしない。
      if (d < 8 && p.z > HAMA.z - 8) {
        for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.seekRange = 0; q.aggro = 0; }
        this.win(rt);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v === F.hiraU && !F.hirateFallSaid) {
      F.hirateFallSaid = true;
      F.bossName = '佐久間信盛';
      rt.say('足軽', '平手の殿が討たれたがや！　退く道を塞がせるな！', 3);
    }
    if (F.mkFlankArrived && v.group === F.aka && k && (k.isPlayer || rt.squad.includes(k))) F.mkFlankFought = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.flags.routSaid.has(g.name) || rt.t < (rt.flags.routSayT || 0)) return;
    // 遠景から替え直された同じ名の隊も、一度知らせたら繰り返さない。
    g._routSaid = true; rt.flags.routSaid.add(g.name); rt.flags.routSayT = rt.t + 8;
    const n = rt.flags.routVoiceN || 0;
    rt.flags.routVoiceN = n + 1;
    const lines = [
      `${g.name}が引いていくぞ。列を離れるな！`,
      `${g.name}の槍が下がった。次の手に備えよ！`,
      `${g.name}に隙間ができたぞ。味方を通せ！`,
      `${g.name}の足が乱れた。追わずに構えよ！`,
      `${g.name}が後ろへ下がるぞ。退き口を空けよ！`,
      `${g.name}の旗が遠ざかった。組へ戻れ！`,
      `${g.name}は列を立て直す気か。油断するな！`,
      `${g.name}が離れたぞ。槍をそろえ直せ！`,
    ];
    rt.say('足軽', lines[n % lines.length], 2.5);
  },
};

// 両軍の総勢（徳川・織田 一万一千ほど、武田 三万ほど。数には諸説ある）
mikatagahara.force = () => ({ a: 11000, a0: 11000, b: 30000, b0: 30000 });
mikatagahara.sides = { a: { name: '徳川・織田軍', mon: 'oda' }, b: { name: '武田軍', mon: 'takeda' } };
mikatagahara.taisho = { b: { name: '武田信玄', use: true }, a: { name: '徳川家康', use: true } };
mikatagahara.wakeRoom = 210; // 台本の新手・武将の余地を残す
mikatagahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
// 軍議（gungi.js・F5）：援軍の構えを二つから選ぶ。史実の既定は鶴翼（徳川と並んで正面で迎える）
//   ①kakuyoku（既定）：鶴翼に開いて正面で迎える
//   ②migi：佐久間の手を右（根洗の小高い所・森の側）へ寄せて横を固める。位置だけ変える。敵の攻撃力は変えない
// 軍議の入口は main.js の総大将の身分制限に従う。足軽は既定の下知で進む。
mikatagahara.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 10, z: -50 }, dist: 130,
    units: [{ id: 'plan', name: '織田の加勢（平手・佐久間）', group: () => F.hirate, nominal: () => (F.hirate ? F.hirate.count + (F.saku ? F.saku.count : 0) : 0) }],
    routes: [
      { id: 'kakuyoku', name: '鶴翼に開いて、正面で迎える' },
      { id: 'migi', name: '右の森の側を固めて、横を守る' },
    ],
    default: { plan: 'kakuyoku' },
    enemy: [
      { name: '小山田信茂の備（先手）', known: false },
      { name: '山県昌景の赤備え', known: false },
      { name: '馬場信春・武田勝頼の備', known: false },
    ],
    onStart: (assign) => mikatagahara.onGungiStart(rt, assign),
  };
  const auto = window.__mikataStrategy || (/[?&]bot/.test(location.search) ? 'kakuyoku' : null);
  if (auto) { mikatagahara.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
mikatagahara.onGungiStart = (rt, assign) => {
  const F = rt.flags;
  F.strategy = (assign && assign.plan) || 'kakuyoku';
  // 右を固める：佐久間の手を根洗の小高い所へ（移動と向きだけ変える）
  if (F.strategy === 'migi' && F.saku) { F.saku.anchor = { x: NEARAI.x, z: NEARAI.z + 4 }; F.saku.facing = Math.PI * 1.1; }
};
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
mikatagahara.famous = [
  ...HISTORICAL_GENERALS.mikatagahara.map((g) => ({ ...g, line: {
    '水野信元': '浜松へ退く道を守れ！',
    '佐脇藤八': '槍先を下げよ！　隣の者とそろえよ！',
    '長谷川橋介': 'ここで受け止める！　列を空けるな！',
  }[g.name] || g.line })),
];
mikatagahara.date = (rt) => `元亀三年十二月二十二日　冬・${rt.flags.step >= 3 ? '夜' : '夕暮れ'}`;
mikatagahara.canSkip = (rt) => rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5 ? '結果へ進む' : rt.phase === 'brief' && rt.t > 3 ? '先手の下知まで待つ' : '';
mikatagahara.skip = (rt) => { if (rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5) rt.finish({ scriptedEnd: true }, 0.2); else if (rt.phase === 'brief') mikatagahara.first(rt); };
mikatagahara.history = '元亀三年十二月二十二日（西暦1573年1月25日）、遠江の三方ヶ原で徳川・織田勢と武田勢が戦った。『信長公記』巻五は、信長が佐久間信盛・平手汎秀・水野信元を大将として浜松へ遣わしたと記す。同書にこの援軍の総数や滝川一益の名はない。二俣城を落とした信玄は堀江城へ向かって動き、浜松を出た家康の勢と三方ヶ原で戦った。先頭の約三百人に石を投げさせ、太鼓を打って寄せたとも記される。平手汎秀とその家臣、徳川家臣の成瀬藤蔵らが討ち死にし、家康は敵中を抜けて浜松城へ退いた。会戦を夕刻とする解説があり、魚鱗・鶴翼の陣や祝田坂での反転は『三河物語』『甲陽軍鑑』などに伝わる。各備の寄せる順、城門を開けて追手を惑わせた話、犀ヶ崖の夜討ちは、確定した出来事としては扱わない。兵数には諸説あり、武田三万、徳川・織田一万一千は一つの見積もりで、各備の人数・配置は遊びの復元である。降雪を伝える浜松市の解説もあるが、当日の天候は断定しない。地形・時間・浜松の城口は遊びのために縮めている。浜松城は台地の東縁にあり、西の曲輪を高く示したが、比高・木柵の線・屋形の位置は当時の縄張りを測って再現したものではない。武田勢はその後も西へ進んだが、元亀四年、信玄が病を重くすると帰国の途につき、信玄は四月にその途中で没した。';

// 素直な遊び手：先手を受け、赤備えと戦い、浜松城へ走る
// 持ち場と退き口への下知を、遊び手の性格による敵への突進で上書きしない。
mikatagahara.botOrders = true;
// 南の坂への移動も、この戦の頭を通す。共通の段の頭だけでは、
// 退く道と追手を受ける向きが別々になり、下知の途中で囲まれる。
mikatagahara.botBrainDepth = true;
mikatagahara.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 殿の持ち場へ着いた後の斬り合いは、元の段の頭で続ける。
  const toCover = F.dpOn && F.dpB && F.dp?.on && F.dp.cur?.s.kind !== 'hold';
  if (F.dpOn && F.dp && F.dp.on && !toCover) { depthBot(b, inp, goTo); return; }
  if (toCover || F.step === 3) {
    // 殿の下知を優先する。深手や気力切れで、元の本陣へ手当てを探しに戻らない。
    F.dpBack = false;
    // 追手は次々に来る。近くの敵を倒すまで待つと、いつまでも城へ退けない。
    inp.leftPressed = false; inp.guardHold = false; inp.chargeHold = false;
    // 一撃を受ける気力を残す。歩いて半分まで戻してから走り直す。
    if (p.sta < p.maxSta * 0.35) F.mkCatchBreath = true;
    else if (p.sta >= p.maxSta * 0.6) F.mkCatchBreath = false;
    inp.runHeld = !F.mkCatchBreath;
    const next = toCover ? F.dp.cur?.at || (F.dp.i < 2 ? SOUTH_SLOPE : REARGUARD_POST) : F.retreatPoint || HAMA;
    const radius = toCover && F.dp.i >= 2 ? 4 : !toCover && F.retreatIdx === RETREAT_ROAD.length - 1 ? 3 : 1.8;
    // 追手への狙いを残すと、道へ向けた体が更新時に引き戻される。
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, next.x, next.z, radius);
    retreatThroughGap(b, inp);
    const walkYaw = p.yaw, walking = inp.k.has('KeyW');
    const atPost = Math.hypot(next.x - u.pos.x, next.z - u.pos.z) < radius;
    if (atPost) inp.runHeld = false;
    // 並び順の最初の敵へ毎回振り向かず、本人へ迫る打ち込みを選ぶ。
    // 射手へ構えても弾は防げない。刃が来ない間は構えを解いて先へ進む。
    let threat = null, soonest = Infinity;
    let strikeAngle = null, crossed = false;
    for (const e of b.army.units) {
      if (!e.alive || e.fleeing || e.gone || e.downed || e.woundOut || e.rearWound || e.noTarget || e.isStruct || e.team === u.team ||
          !e.sidearm && (e.type === 'gun' || e.type === 'bow') ||
          Math.abs(e.pos.y - u.pos.y) >= 3 || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > (e.reach || 2.8) + 3 ||
          b.army.wallBetween(u.pos, -1, e.pos, (e.wpnKind || e.lookWeapon) === 'spear')) continue;
      const swing = e.swing && !e.swing.done && e.swing.target === u;
      const attack = e.atk && !e.atk.ranged && !e.atk.bow && e.atk.target === u;
      const charge = e.charging && e.target === u &&
        Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < (e.reach || 2.8) + 1.5;
      // 追って歩くだけの兵には足を止めない。実際の打ち込みに合わせて受ける。
      if (!swing && !attack && !charge) continue;
      const soon = charge ? 0 : swing ? Math.max(0, e.swing.dur * e.swing.at - e.swing.t) : attack ? e.atk.t : Infinity;
      // 背後や横からの追手には、指と体が向き直る時間も残す。
      // 正面の長い振りかぶりの間は、歩いて息を戻す。
      const toward = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (soon <= 1 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) <= (e.reach || 2.8) + 1) {
        if (strikeAngle === null) strikeAngle = toward;
        else if (Math.cos(toward - strikeAngle) < 0.5) crossed = true;
      }
      const turn = Math.abs(Math.atan2(Math.sin(toward - u.heading), Math.cos(toward - u.heading)));
      if (soon > (turn > Math.PI / 3 ? 1.3 : 0.7)) continue;
      if (soon < soonest || !threat) { threat = e; soonest = soon; }
    }
    if (threat) {
      const e = threat;
      if (p.lock) inp.e.add('KeyQ');
      const toward = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      // 刃へ正面を向け、共通の道よけが選んだ一歩を前後左右の歩みに移す。
      // 八方向へ丸めると、近い騎馬の穂先から構えがずれる。
      p.yaw = toward;
      // 打ち込みの直前だけ受け、向き直る間も退路への歩みは保つ。
      // 指の構え直しには二分の一拍ほどかかる。連続した突きの前に受けを作る。
      // 指と体が横・背へ向き直る間も、追手の次の突きに備える。
      const guardLead = Math.cos(toward - u.heading) < 0.5 ? 1.3 : 0.9;
      inp.guardHold = soonest <= guardLead;
      if (inp.guardHold) inp.runHeld = false;
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      if (!atPost && walking) {
        const fw = Math.cos(walkYaw - p.yaw);
        const side = -Math.sin(walkYaw - p.yaw);
        // 八方向へ丸めると、追手が斜めにいる時に退路からそれる。
        const axis = b._mkRetreatAxis || (b._mkRetreatAxis = { x: 0, y: 0 });
        axis.x = side; axis.y = -fw; inp.axis = axis;
      }
      // 交互の突きだけでなく、一本でも向き直りが間に合わない刃は退き道へ避ける。
      // 構えが崩れた時も同じ。正面で受けられる間は回避の気力を使わない。
      const uncovered = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) <= (e.reach || 2.8) + 0.6 &&
        (p.guardBroken > 0 || Math.cos(toward - u.heading) <= 0.25);
      // 深手では正面の侍一人の突きでも倒れる。向きだけで安全とせず退路へ避ける。
      const critical = u.hp <= u.maxHp * 0.35;
      if ((crossed || uncovered || critical) && soonest <= 0.35 && !p.mounted && p.dodgeT <= -0.3 &&
          !(p.knockT > 0) && !u.climb &&
          p.sta >= 20 + (critical || p.guardBroken > 0 ? 0 : p.maxSta * 0.4)) {
        // 殿の印で止まっても避ける。終点だけでなく三歩の途中の切岸と兵を調べる。
        retreatDodge(b, inp, !atPost && walking ? walkYaw : toward + Math.PI);
      }
    }
    return;
  }
  inp.leftPressed = false; inp.guardHold = false; inp.chargeHold = false;
  inp.runHeld = false;
  // 先手を受ける持ち場は平手の槍列の後ろ。西の隊との隙間へ戻らない。
  // 開戦前も平手の陣に続く。赤備えの段では、選んだ受け方の印へ移る。
  const flank = F.step === 2 && F.mkFlank;
  const postX = F.step === 2 ? (flank ? 46 : 14) : F.hirate.anchor.x + 3;
  const postZ = F.step === 2 ? (flank ? -44 : LINE_Z - 2) : F.hirate.anchor.z + 4;
  // 最寄りの兵を追わず、実際の打ち手へ構える。槍の列から前へ出ない。
  let attacker = null, ad = 10, impact = Infinity, threatN = 0;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.gone || o.woundOut || o.noTarget || o.isStruct || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d >= 10) continue;
    threatN++;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const attack = o.atk && !o.atk.ranged && !o.atk.bow && o.atk.target === u;
    const charge = o.charging && o.target === u;
    // 味方への振りや遠い接近へ向き直ると、もう一人の突きに横を取られる。
    if (!swing && !attack && !charge) continue;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
    if (soon < impact || (soon === impact && d < ad)) { attacker = o; ad = d; impact = soon; }
  }
  const candidate = attacker || strikeTarget(b, F.step > 0 ? 12 : 6);
  const e = candidate && candidate.alive && !candidate.fleeing && !candidate.gone && !candidate.woundOut && !candidate.noTarget && !candidate.isStruct ? candidate : null;
  if (Math.hypot(u.pos.x - postX, u.pos.z - postZ) > (flank && !F.mkFlankArrived ? 3 : 6) ||
      (F.step === 1 && u.pos.z < F.hirate.anchor.z - 2)) {
    // 寄せる敵が見えても、列へ戻る足を止めない。敵に正面を向けて下がる。
    if (p.lock) inp.e.add('KeyQ');
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.guardHold = !!attacker;
      const dx = postX - u.pos.x, dz = postZ - u.pos.z;
      const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
      const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
      if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
    } else goTo(p, inp, postX, postZ, 2);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 一人だけの長い振りかぶりには、突きが先に届く間だけ割り込む。
    patientStrike(p, inp, e, d, threatN === 1);
    // 届かない相手を見たまま止まらず、持ち場の中だけで間合いを詰める。
    // 届かない振りかぶりには構えたまま詰める。馬の突進と振り出した刃は追わない。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 手負いで届かない敵を追うと、退避の直後にまた横から突かれる。
    // 列へ戻る歩みと、持ち場まで届いた敵への反撃は続ける。
    if (u.hp > u.maxHp * 0.6 && !e.charging && !(e.swing && !e.swing.done) && d >= reach && F.step > 0) {
      const dx = e.pos.x - postX, dz = e.pos.z - postZ;
      const scale = Math.min(1, 5 / (Math.hypot(dx, dz) || 1));
      const next = b._mkBotPoint || (b._mkBotPoint = { x: 0, z: 0 });
      next.x = postX + dx * scale;
      next.z = postZ + dz * scale;
      if (F.step === 1) next.z = Math.max(F.hirate.anchor.z - 1, next.z);
      // 持ち場の五歩以内でも、平手の列が崩れた先へ一人で詰めない。
      // 侍二人の交互の突きへ入る前に、移る先で槍を合わせられる味方を見る。
      let supported = false;
      for (const mate of b.army.units) {
        if (mate === u || !mate.alive || mate.team !== u.team || mate.fleeing || mate.downed ||
            mate.noTarget || mate.isStruct || mate.woundOut || mate.rearWound || mate.group?.routed ||
            mate.group?.hidden || mate.type === 'porter' || !mate.sidearm && (mate.type === 'gun' || mate.type === 'bow')) continue;
        if (Math.abs(mate.pos.y - u.pos.y) < 3 && Math.hypot(mate.pos.x - next.x, mate.pos.z - next.z) < 8 &&
            !b.army.wallBetween(next, -1, mate.pos)) { supported = true; break; }
      }
      if (supported && !b.army.wallBetween(u.pos, -1, next)) {
        const face = p.yaw;
        goTo(p, inp, next.x, next.z, 0.5);
        // 構えは正面だけ。列の端を目指して横を向き、迫る槍を受け損ねない。
        if (inp.guardHold) {
          const walking = inp.k.has('KeyW');
          p.yaw = face; inp.k.delete('KeyW');
          if (walking) {
            const dx = next.x - u.pos.x, dz = next.z - u.pos.z;
            const fw = dx * Math.sin(face) + dz * Math.cos(face);
            const side = -dx * Math.cos(face) + dz * Math.sin(face);
            if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
            if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
          }
        }
      }
    }
    return;
  }
  goTo(p, inp, postX, postZ, 2);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 苦しい戦：前・左右・後ろから武田の大軍が包み込む。勝つことではなく、生き残ることが勝ち
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
const aka = (list) => ({ faction: 'akazonae', flag: 'akazonae', armor: AR.akazonae, list: dress(list, AKA) });
// 鉄砲組：鉄砲だけの組は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
// 持ち場を支えたら次の下知へ。敵の全滅を待たず、敵の士気も一斉には落とさない。
function withstand(o) {
  const s = hold(o), start = s.start, tick = s.tick;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    // 守る判定と案内の到着範囲をそろえる。列の中から中心へ歩かせない。
    // 坂の別の道印にも同じ範囲を渡し、追手へ背を向ける矢印を残さない。
    for (const marker of rt.markers) if (marker.id === 'dp' || marker.id === 'retreat-way') {
      marker.guideArea = 'wait'; marker.guideRadius = C.botRadius;
    }
    if (o.cover) {
      // 本陣の旗本は先に通す。既存の退き口の守りは本人の隣で追手を受ける。
      const guard = rt.flags.shingariG;
      if (guard?.count && !guard.routed) {
        guard.anchor.x = C.at.x + 6; guard.anchor.z = C.at.z;
        guard.order = 'hold'; guard.facing = Math.PI; guard.formation = 'yari';
        guard.aggro = 10; guard.retreatOnly = true;
      }
      C.coverGroups = [rt.flags.teppo, rt.flags.campA.guard, rt.flags.campA.general?.group]
        .filter((g) => g && g.count && !g.routed);
      C.coverPassedUnits = new Set();
      C.coverPassed = 0;
      C.coverSent = C.coverGroups.length > 0;
      // 支える列が着いたら先に通す。交戦から十二秒待つと、後ろの隊が坂を下りきれない。
      for (const g of C.coverGroups) retreatGroup(g);
      if (C.coverSent) rt.say('組頭', 'ここは我らが支える！　後ろの味方は今のうちに下れ！', 3);
    }
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    // 共通の「刻限後に敵の士気を落とす」処理へ入る前に下知を出す。
    const held = C.inT;
    tick(rt, C, m, ctx, Math.min(el, o.dur - 0.001), dt);
    // 広い近似範囲にいるだけでは、持ち場を守った手柄にしない。
    if (!C.metEnemy) for (const g of C.groups) {
      if (g.routed) continue;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut &&
          Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (o.r || 14) + 8) { C.metEnemy = true; break; }
      if (C.metEnemy) break;
    }
    const p = rt.player.u.pos;
    const inPost = Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14);
    C.inT = held + (inPost && C.metEnemy ? dt : 0);
    if (o.cover && el >= (C.coverScanT || 0)) {
      C.coverScanT = el + 0.5;
      C.coverRemaining = 0; C.postThreats = 0;
      for (const g of C.coverGroups) for (const u of g.units) {
        // 実際に通った者だけ数える。逃げ足で下る者も含め、通過後の離脱で数を戻さない。
        if (u.alive && !u.gone && u.pos.z > 104) C.coverPassedUnits.add(u);
        else if (u.alive && !u.gone && !C.coverPassedUnits.has(u)) C.coverRemaining++;
      }
      for (const g of C.groups) if (!g.routed) for (const u of g.units)
        if (u.alive && !u.gone && !u.fleeing && !u.woundOut &&
            Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (o.r || 14) + 8) C.postThreats++;
      C.coverPassed = C.coverPassedUnits.size;
      rt.flags.coverPassed = C.coverPassed;
    }
    const left = Math.max(0, Math.ceil(o.dur - el));
    // 待つ向き・味方の通過と、下知までの残り時間を一緒に示す。刻限は変えない。
    const coverHint = C.postThreats ? '北の追手へ構えよ' : C.waves.length ? '北へ構え、追手を待て' : '北へ構えよ';
    const coverState = !C.coverSent ? '下る味方はいない' : C.coverRemaining ? `味方はあと${C.coverRemaining}人`
      : C.coverPassed ? `味方${C.coverPassed}人が下った` : '下る味方はいない';
    const returnHint = o.cover
      ? `坂の印へ戻れ。${coverState}。${left}秒以内に退けの声`
      : `持ち場の印へ戻り、敵へ構えよ。${left}秒以内に次の下知`;
    rt.objProgress('main', !inPost ? returnHint : o.cover
      ? `${coverState}。${coverHint}。${left}秒以内に退けの声`
      : `敵へ槍を向け、${isTouch ? '長押しでふせぐ' : '右押しを押し続けてふせぐ'}。${left}秒以内に次の下知`);
    return C.waves.length === 0 && (el >= o.dur || o.cover && C.inT >= 20 && C.coverPassed > 0 && el >= 26);
  };
  s.end = (rt, C, m) => {
    rt.unmark('dp'); rt.unzone('dp');
    const won = C.inT >= o.dur * 0.45 && (!o.cover || C.coverSent && C.coverPassed > 0);
    if (won) { rt.objDone('dp'); if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward); }
    else { rt.objFail('dp'); if (o.lost) rt.say(o.lost[0], o.lost[1], 3); }
    if (o.onEnd) o.onEnd(rt, m, won);
  };
  return s;
}
// 生き残った後方の隊を坂の手前へ。下り始めた隊は呼び戻さない。
function slopeGroup(g) {
  if (!g || !g.count || g.routed) return;
  const c = g.center();
  if (c.z >= SOUTH_SLOPE.z || g.order === 'path' && g.path?.[g.path.length - 1]?.[1] > SOUTH_SLOPE.z) return;
  g.path = [[SOUTH_SLOPE.x, SOUTH_SLOPE.z]]; g.pathIdx = 0;
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.retreatOnly = true; g.order = 'path'; g.speed = 3;
  g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
}
// 退く段では、待ち伏せを追わせず、残った敵も時間だけで敗走させない。
function withdraw(o) {
  const s = move(o), start = s.start, tick = s.tick;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    for (const g of ctx.friends(rt)) {
      g.path = [[g.anchor.x, g.anchor.z]]; g.pathIdx = 0;
      const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z;
      g.retreatOnly = true; g.order = 'path'; g.speed = 3;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    }
    // 鉄砲組も先に坂の上まで移す。殿の列が着いたら、ここから坂を下る。
    slopeGroup(rt.flags.teppo);
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    const done = tick(rt, C, m, ctx, el, dt);
    C.goal = C.at;
    if (C.arr && !C.arrOrderShown) {
      C.arrOrderShown = true;
      renewOrders(rt);
      rt.obj('main', '坂に着いた。追手へ構えよ', 'main', true);
      rt.say('組頭', '坂に着いた！　北の追手へ構え、味方を先に通せ！', 3);
    }
    const distance = Math.ceil(Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z));
    rt.objProgress('main', C.arr ? '北の追手へ構え、味方を先に通せ'
      : `追手を深追いせず、南の坂の道印へ。あと${distance}歩`);
    // 坂では次の段で味方を守る。ここで待ち伏せを二十五秒受け続けない。
    return done || C.arr && el - C.arrT >= 4;
  };
  s.end = (rt, C) => {
    rt.unmark('dp'); rt.unzone('dp');
    if (C.arr) rt.objDone('dp'); else rt.objFail('dp');
  };
  return s;
}
// 共通の段が作る細かな札を主の札へ移す。表示する任務は一つにする。
function missionSteps(steps, orders) {
  return steps.map((s, i) => {
    const start = s.start;
    s.start = (rt, C, m, ctx) => {
      renewOrders(rt);
      start(rt, C, m, ctx);
      const task = rt.orderObjectives?.get('dp') || rt.objectives.find((q) => q.id === 'dp');
      const text = orders[i] || task?.text;
      if (text) {
        rt.obj('main', text, 'main', true);
        rt.objProgress('main', '');
      }
      rt.objRemove('dp');
    };
    return s;
  });
}
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: AR.takeda, dmg: 1, calmRest: false, fixedSpawn: true, backing: false, scale: 1, mass: 260, look: (l) => depthLook(rt, l, TAKEDA),
    friends: () => [F.hirate, F.saku, F.toku].filter((g) => g && g.count && !g.routed) };
}
// A 先手の後：魚鱗の寄せ → 赤備えの気配
function mkA() {
  const at = { x: 260 / 16, z: LINE_Z };
  return [
    rest({ dur: 6, heal: 0, say: [['組頭', (rt) => gone(rt.flags.w1) ? '先手は退いた。息を整え、槍の隙間を詰めよ！' : '後詰が来る。味方の槍の隙間を詰めよ！']] }),
    withstand({ at, dur: 62, r: 15, title: '武田の後詰', sub: '先手を支えても、次の備えが来る', label: '平手の陣', obj: '平手の槍列を守れ',
      say: [['組頭', '踏みとどまれ！　ここを破らせれば徳川殿の脇が空くぞ！']],
      waves: [
        { t: 0, foes: () => [{ name: '小山田信茂の先手', from: { x: 20, z: LINE_Z - 32 }, list: [uS(3), uA(14)], formation: 'yari', mass: 400, noRout: 0 }] },
        { t: 20, say: ['組頭', '鉄砲じゃ！　銃口の前を外せ、槍列の陰へ寄れ！'], foes: () => [gunLine('武田の鉄砲衆', { x: 22, z: LINE_Z - 46 }, 8)] },
        { t: 36, say: ['足軽', '馬場の旗だわ！　左へ回っとるぞ！'], foes: () => [{ name: '馬場信春の手（左へ回る）', from: { x: -54, z: LINE_Z - 24 }, off: { x: -8, z: 0 }, list: [uS(2), uA(11)], formation: 'yari', mass: 280 }] },
        { t: 52, say: ['組頭', '山県の手が右から来た！　囲まれるぞ！'], foes: () => [{ name: '山県昌景の手（右へ回る）', from: { x: 56, z: LINE_Z - 10 }, off: { x: 8, z: 4 }, list: [uS(2), uA(10), uB(3)], formation: 'yari', mass: 260 }] },
        { t: 56, say: ['組頭', '勝頼の旗も寄せてきたぞ！　槍先を落とすな！'], foes: () => [{ name: '武田勝頼の二の手', from: { x: 8, z: LINE_Z - 58 }, list: [uS(2), uA(11)], formation: 'yari', mass: 320 }] },
      ],
      reward: '平手の陣で武田の寄せを支えた', lost: ['組頭', '押し込まれた……！　立て直せ！'] }),
    rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '右の森へ槍を向け直せ', 'main'), bark: '右へ槍を向け直す', say: [['組頭', '右の森に山県昌景の赤備え！　槍ごと向き直れ！']] }),
  ];
}
// B 赤備えの後：佐久間の下知で台地の南へ退き、坂の上で味方を通す。
function mkB() {
  return [
    rest({ dur: 6, heal: 0, fn: (rt) => {
      rt.obj('dp', '味方と南の坂へ退け', 'side', true);
      // 下知を聞く六秒の間も退く。次の移動段で隊ごとの持ち場へ引き継ぐ。
      for (const g of [rt.flags.hirate, rt.flags.saku, rt.flags.toku]) if (g.count && !g.routed) {
        g.path = [[SOUTH_SLOPE.x, SOUTH_SLOPE.z]]; g.pathIdx = 0;
        g.retreatOnly = true; g.order = 'path'; g.speed = 3;
        g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
      }
    }, say: [['佐久間信盛', '南の坂へ退く！　下りる味方の道を空けよ！']] }),
    withdraw({ to: SOUTH_SLOPE, r: 10, label: '台地の南', obj: '佐久間の手と南の坂へ退け',
      say: [['組頭', '急げ！　坂の上まで、佐久間の旗を追え！']],
      ambush: { d: 30, t: 12, title: '回り込まれた', sub: '武田の一手が、退く道を塞ぐ', say: ['足軽', '道の先に武田！　鉄砲もおる、筒先を外せ！'], foes: () => [{ name: '道を塞ぐ武田勢', from: { x: 40, z: 76 }, list: [uS(2), uA(10)], mass: 260 }, gunLine('道の脇の武田の鉄砲', { x: -20, z: 70 }, 6)] } }),
    // 台地の端で殿：坂を下りる味方の背を守る（織田の援軍の退き口）
    rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '坂で追手を支え、味方を先に通せ', 'main'), say: [['組頭', 'ここで追手を支えよ！　鉄砲組と旗本を先に下ろす！']] }),
    withstand({ at: REARGUARD_POST, dur: 38, r: 14, cover: true, title: '坂の上で味方を守る', sub: '下りる味方を守り、退く下知を待つ', label: '台地の端',
      obj: (rt) => (HI(rt) ? '一手で殿を務め、味方を坂へ通せ' : '坂の上で下りる味方を守れ'),
      waves: [
        { t: 0, foes: () => [{ name: '追いすがる武田勢', from: { x: 4, z: 28 }, list: [uS(2), uA(11)], formation: 'yari', mass: 300 }] },
        { t: 22, say: ['組頭', '追手の鉄砲じゃ！　射手の前を外せ、味方は下りたか！'], foes: () => [gunLine('台地の上の武田の鉄砲', { x: 34, z: 22 }, 6)] },
      ],
      reward: '坂の追手を支え、味方を先に下ろした', lost: ['組頭', 'もうよい、下りよ！　城へ走れ！'] }),
  ];
}
export { mikatagahara };
