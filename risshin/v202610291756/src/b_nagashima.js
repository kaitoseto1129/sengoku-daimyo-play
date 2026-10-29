import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { timeslipField } from './timeslip_field.js';
// 長島一向一揆：包囲の柵 → 長島の降伏と退城 → 射撃後の反撃 → 中江・屋長島の包囲と火。
// 信長公記巻七・九月二十九日条を芯にする。舟と三川の寸法・局地の持ち場は遊び用の復元。
// 北（-z）は輪中、南（+z）は織田の岸、東（+x）は川口。史実の二か月余を終日の持ち場に縮める。
import * as THREE from 'three';
import { nobori, hut, campfire, tawara, lumber, dou, romon, village, kobune, kabukimon, yaguramon, solidRect, solidSeg, ishigaki, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch, SOLIDS } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCastlePlan, inPoly } from './castle_plan.js';
import { goten, monomi } from './castle_parts.js';
import { addInterior, facePanels } from './naka.js';
import { benchRoads } from './yamalift.js';
import { whenCgt, cgtScene, cgtSpend, KitBatch, kitStoneSeg } from './cgt.js';
import { kitReplace, castleStyle, kitGateObj4 } from './cgt_castle.js';
import { interiorBase } from './yagura_inside.js';
import { woodTex, dirtTex, mudTex } from './nature.js';
import { Garan } from './temple1571.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { poseArms, buildModel, GENERALS } from './units.js';
import { NAMED_GEAR } from './named_gear.js';
import { extScatter } from './props_ext.js';
import { NAGASHIMA_KACCHU } from './kacchu_data.js';
import { umaGeometry, lodSwap } from './units_flags.js';
import { makeWeapon, arrowGeometry, MAT, P, MK, merge as mergeUnitParts } from './units_model.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine, brokenWall } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { attachFireSpread } from './siege_fire.js';
import { YANAGASHIMA, NAGASHIMA, TSUTSUMI, NAKASU, NAGASHIMA_ALL_PLAN, FORT_BUILDINGS, FORT_ROADS } from './castles/nagashima.js';
import { makeKakoi, advanceDay, campWear } from './kakoi.js';
import { battleEvent, EVENT_MESSENGER, EVENT_VOLLEY, EVENT_FIRE_START } from './battle_events.js';
import { sightUnit, sightPoint } from './battle_sight.js';
import { drawGroundAt } from './render_camera.js';
import { sendOrder } from './denrei.js';
import { reduceMotion, S as SETTINGS } from './settings.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：柴田の手の、岸の持ち場の一手を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -14;                        // こちらの岸（柵を結う所）
const FORT = { x: 0, z: -74 };             // 中江の砦
const GANSHO = { x: -44, z: -82 };         // 願証寺・寺内町（中江の砦とは別の、宗教の中心。軍事拠点と分ける）
// 三川の輪中と願証寺の門徒の暮らしを踏まえる。個々の在所・人数・道筋は推定復元。
// 三重県の県史あれこれ：https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail8.html
// 西の村と寺は分流の別岸。渡河・封鎖突破で助かった描写にせず、同じ岸の村裏・堂裏へ退く。
const PEOPLE_PATHS = [
  [[-94, -59], [-112, -59], [-112, -97], [-106, -112]],
  [[-47, -107], [-48, -116], [-47, -119]],
  [[-50, -66], [-53, -70], [-53, -89], [-49, -104], [-48, -116]],
  [[-48, -99], [-49, -107], [-48, -116]],
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: i === 2 ? 'inside' : 'watch',
  kinds: i === 0 ? ['farmer', 'farmer', 'woman', 'child', 'elder']
    : i === 1 ? ['monk', 'monk', 'townsman', 'woman', 'child']
      : ['townsman', 'merchant', 'woman', 'child', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })), routeEnd: 'wait',
}));
// 門前の市は中江の曲輪・包囲柵より西。門と本堂へ通じる中央を空ける。
const MARKET_HUTS = [[-51, -60, .05], [-39, -60, -.1], [-40, -65, .1]];
const SPOTS = [{ x: 0, z: BANK_Z - 1 }, { x: -26, z: BANK_Z }, { x: 26, z: BANK_Z }];   // 中央から順に、味方と横木を結う
const BUILD_HOLD = 8;                      // 人足と並行して補修する
const WATCH_HOLD = 8;                      // 近い岸で水路を見張る
const HELP_HOLD = 4;                       // 人足と手分けし、本人は横木の縄を締める
const SALLY_HOLD = 160;                    // 約四〜七分：後続舟まで受け、同じ兵のまま守備時間を確保する
const SHORE_DELAY = 25;                    // 最初の十人に続き、同じ舟の残る門徒も上陸する
const SALLY_LIMIT = 180;                   // 残る敵は東の柵で受ける
const PUSH_HOLD = 20;                      // 四人以上が背後へ押し込み続けた時間
const FINAL_LIMIT = 80;                   // 三か所の確認と見張りに使える時間
const FINAL_MOVE_LIMIT = 25;               // 深手で歩く移動にも猶予を取り、立ち止まり続けても期限は始める
const FINAL_HOLD = 24;                     // 敵が散った後は、味方と包囲の口を見張る
const CHECK_HOLD = 4;                      // 縄と横木の確認。戦いの合間に一か所ずつ確かめる
const CHECK_SPOTS = [20, 26, 32].map(x => ({ x, z: BANK_Z + 2 }));
const CHECK_NAMES = ['東の柵の縄（一つ目）', '東の柵の縄（二つ目）', '東の柵の縄（三つ目）'];
// 本の足軽：弁柄の陣笠と黒漆の胴、紺の小袖。既存の具足の色だけを替える。
const ODA = { flag: 'oda', armor: 0x28231f, hatColor: 0x713d30, lace: 0x645545, cloth: 0x293b45, haori: 0 };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', hatColor: 0x713d30, flag: 'namu', haori: 0 };

// 陣所と船の馬印で、結合済みの形と頂点色の材質を共有する。
let campMarkMaterial;
function campMark(name) {
  const mark = new THREE.Mesh(umaGeometry(NAMED_GEAR[name].campUma),
    campMarkMaterial || (campMarkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })));
  return mark;
}

// 立ち寄り将の幟は形と材質ごと、二十四歩四方ごとに束ねる。
// 行列は設置時だけ写す。持ち場へ戻る時は束全体を隠す。
function visitorBanners(rt, banners) {
  const root = new THREE.Group(), bags = new Map(), materials = new Map();
  root.userData.noFreeze = true;
  for (const banner of banners) {
    banner.updateMatrixWorld(true);
    const tile = Math.floor(banner.position.x / 24) + ':' + Math.floor(banner.position.z / 24);
    banner.traverse(c => {
      if (!c.isMesh) return;
      const key = tile + ':' + c.geometry.uuid + ':' + c.material.uuid;
      let bag = bags.get(key);
      if (!bag) { bag = { geometry: c.geometry, material: c.material, matrices: [] }; bags.set(key, bag); }
      bag.matrices.push(c.matrixWorld.clone());
    });
    banner.removeFromParent();
  }
  for (const bag of bags.values()) {
    let material = materials.get(bag.material);
    if (!material) {
      material = bag.material.clone();
      const compile = bag.material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        // はためきの位相と手前の透かしは、一枚ずつの幟の位置を読む。
        shader.vertexShader = shader.vertexShader.replaceAll('modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)',
          '(modelMatrix * instanceMatrix) * vec4(0.0, 0.0, 0.0, 1.0)');
      };
      const programKey = bag.material.customProgramCacheKey();
      material.customProgramCacheKey = () => programKey + '_nagashima_instances';
      materials.set(bag.material, material);
    }
    const mesh = new THREE.InstancedMesh(bag.geometry, material, bag.matrices.length);
    for (let i = 0; i < bag.matrices.length; i++) mesh.setMatrixAt(i, bag.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  rt.scene.add(root);
  return root;
}

// 上陸した同じ門徒だけを追う。舟・対岸の守兵へ持ち場を離れさせない。
function bankFoeReady(u) {
  return !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed &&
    !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget &&
    !u.group?.routed && !u.boatSeat?.aboard && u.pos.z >= BANK_Z - 3;
}
// 船首から降りた直後はまだ川側。攻撃の印は岸へ上がり、柵を隔てない相手に限る。
// 上陸・反撃そのものの判定は変えず、持ち場から川へ誘い出す案内だけを除く。
function bankGuideFoe(rt, u) {
  const p = rt.player.u.pos;
  return bankFoeReady(u) && u.pos.z >= BANK_Z && Math.abs(u.pos.y - p.y) < 2 &&
    !rt.army.wallBetween(p, -1, u.pos);
}
function bankNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.step !== 3 && F.step !== 3.5 || F.ending) return null;
  if (F.bankFoeStep === F.step && rt.t < F.bankFoeAt && bankGuideFoe(rt, F.bankFoe)) return F.bankFoe;
  F.bankFoeStep = F.step;
  F.bankFoeAt = rt.t + .25;
  let foe = null, best = Infinity;
  for (const g of F.last || []) for (const u of g.units) {
    if (!bankGuideFoe(rt, u)) continue;
    if (F.step === 3.5 && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) >= 14) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < best) { best = d; foe = u; }
  }
  F.bankFoe = foe;
  return foe;
}
function bankCheckThreat(rt) {
  const p = rt.player.u;
  for (const g of rt.flags.last || []) for (const u of g.units) {
    if (!bankFoeReady(u)) continue;
    const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
    if ((d < 2.8 || d < 6 && (u.target === p || u.atk?.target === p ||
        u.swing && !u.swing.done && u.swing.target === p)) && !rt.army.wallBetween(p.pos, -1, u.pos)) return true;
  }
  return false;
}
function bankWorkSpot(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  let spot = null, best = Infinity;
  for (let i = 0; i < SPOTS.length; i++) {
    if (F.raised?.[i]) continue;
    const q = SPOTS[i], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) { best = d; spot = q; }
  }
  return spot;
}

// 見張りは体ではなく視線で判定する。肩越しを回した時も、下知と達成をそろえる。
function watchingRiver(rt) {
  return Math.cos(rt.player.yaw + (rt.player.camYawOff || 0)) < -.5;
}

function riverTurnText(rt) {
  const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
  return Math.sin(yaw) > 0 ? '左へ見回し、川を向け' : '右へ見回し、川を向け';
}

function nearestBankSpot(p) {
  let at = 0;
  for (let i = 1; i < SPOTS.length; i++) if (Math.abs(p.x - SPOTS[i].x) < Math.abs(p.x - SPOTS[at].x)) at = i;
  return at;
}

function baseHeight(x, z) {
  return .25 * Math.sin(x * .03 + .4) * Math.cos(z * .025) + .15 * Math.sin(z * .07 + x * .02)
    + .75 * Math.exp(-((z - (BANK_Z + 5)) ** 2) / 30) + 30 * gauss(x, z, -360, -360, 5000);
}
// 円い盛り土ではなく、柵と同じ多角形の縁を土塁にする。虎口では堤を低くして歩ける坂にする。
function rimDistance(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
function fortHeight(x, z) {
  let h = baseHeight(x, z);
  for (const k of NAGASHIMA_ALL_PLAN.kuruwa) {
    const inside = inPoly(k.poly, x, z), d = rimDistance(k.poly, x, z);
    if (!inside && d >= 3) continue;
    // 中洲は南北に木戸がある。二つの座標を一つの数として引くと、地形の高さが壊れる。
    let mouthDistance = Infinity;
    if (Array.isArray(k.gapAt[0])) {
      for (const [gx, gz] of k.gapAt) mouthDistance = Math.min(mouthDistance, Math.hypot(x - gx, z - gz));
    } else mouthDistance = Math.hypot(x - k.gapAt[0], z - k.gapAt[1]);
    const mouth = Math.max(0, Math.min(1, (mouthDistance - 3) / 3));
    const bank = k.dorui * mouth * Math.max(0, 1 - d / (inside ? 2.6 : 3));
    h = inside ? k.level + bank : h + (k.level + bank - h) * (1 - d / 3);
  }
  return h;
}
const height = benchRoads(fortHeight, FORT_ROADS, 1.2, .8);

// 川筋だけの戦には共通の葦が生えないため、岸と浅い水路にまとめて置く。
function bankReeds(rt) {
  // 槍の穂先に見えた三角を細い穂へ替え、葉も付ける。乾いた持ち場を葦で埋めない。
  const stem = new THREE.CylinderGeometry(.01, .015, .65, 3), head = new THREE.SphereGeometry(.035, 4, 3);
  stem.translate(0, .325, 0); head.scale(1, 2.6, .7); head.translate(0, .7, 0);
  const leaves = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.BoxGeometry(.025, .32, .008);
    leaf.rotateZ(side * .55); leaf.translate(-side * .07, .38, 0); leaves.push(leaf);
  }
  const geo = mergeGeometries([stem, head, ...leaves], false);
  stem.dispose(); head.dispose(); for (const leaf of leaves) leaf.dispose();
  // 手前の岸の水際にも葦を連ねる（資料との差：岸が橙の一枚）。中央の着岸口と左右の作業場は空ける。
  const reeds = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 160);
  const at = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < 160; i++) {
    const side = i % 2 ? 1 : -1, band = Math.floor((i % 48) / 2);
    let z = -1 + (band % 12) * 1.9 + Math.sin(i * 2.3) * .3;
    const bank = z < 8 ? 12 + (8 - z) * .2 : 12 + (z - 8) * .125;
    let x = side * (bank + .85 + Math.sin(i * 7.1) * .3);
    // 半数を本流の岸へ移す。中央の着岸口と柵の作業場は空け、本数と描画の束は保つ。
    if (i >= 48) {
      x = side * (50 + band * 1.45 + Math.sin(i * 2.3) * .45);
      const middle = CH_Z + (x > 0 ? -x * .02 : 0);
      z = middle + RIVER_STREAMS[0].w + .8 + Math.sin(i * 3.7) * .3;
    }
    if (i >= 96) {
      const k = i - 96, n = Math.floor(k / 2) * 1.05 + Math.sin(k * 1.7) * .35;
      x = side * (n < 15 ? 6 + n : 16 + n);
      z = BANK_Z + 1.2 + Math.abs(Math.sin(k * 2.9)) * 2.2;
    }
    at.position.set(x, drawGroundAt(rt.world, x, z) - .04, z);
    at.rotation.set(.06 * Math.sin(i), i * 2.4, .12 * Math.cos(i));
    at.scale.set(1, .75 + .2 * (1 + Math.sin(i * 3.1)), 1);
    if (i >= 96) at.scale.set(1.5, 1.7 + .5 * Math.sin(i * 1.3), 1.5);   // 柵の内の堤の草むらは膝から腰の高さ
    at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
    // 秋の枯れ穂と灰緑を株ごとに混ぜる。新しい材質は作らない。
    color.setHex(i % 3 ? 0x847c58 : 0x6d7955); reeds.setColorAt(i, color);
  }
  rt.scene.add(reeds);
}

// 所持している弓だけを縦に背負う。弦付きの共通の和弓を使い、矢羽も一つにまとめる。
function bankBow(rt) {
  if (!rt.player.hasBow) return;
  const bow = makeWeapon('bow');
  // 毎回の構えで縮尺が戻る弦は、形の方を少し太くして携帯でも見せる。
  for (const w of [bow, rt.player.bowMesh]) if (w?.userData.bow) {
    for (const s of [w.userData.bow.s1, w.userData.bow.s2]) { s.geometry = s.geometry.clone(); s.geometry.scale(1.5, 1, 1.5); }
  }
  bow.position.set(-.25, .85, -.25); bow.rotation.z = .08;
  const quiver = new THREE.Group(), box = new THREE.Mesh(ROOM_BOX, DARK), parts = [];
  box.scale.set(.13, .38, .11); box.position.y = .18; quiver.add(box);
  for (let i = 0; i < 6; i++) {
    const g = arrowGeometry().clone();
    g.rotateX(Math.PI / 2); g.translate((i % 3 - 1) * .035, .06 + (i % 2) * .025, Math.floor(i / 3) * .03);
    parts.push(g);
  }
  quiver.add(new THREE.Mesh(mergeGeometries(parts, false), MAT));
  for (const g of parts) g.dispose();
  quiver.position.set(.25, .7, -.22); quiver.rotation.x = -.2;
  // 近い人では軽い胴が隠れる。背負う物は独立した入れ物で胴の動きに合わせる。
  const gear = new THREE.Group(); gear.add(bow, quiver);
  rt.player.u.mesh.add(gear); rt.flags.backGear = gear; rt.flags.backBow = bow;
}

// 小屋の外観は材質ごとに全砦でまとめる。室内は共通処理が近づいた時だけ作る。
const ROOM_WOOD = new THREE.MeshLambertMaterial({ color: 0x75634d });
const ROOM_ROOF = new THREE.MeshLambertMaterial({ color: 0x4f4234 });
const ROOM_FRAME = new THREE.MeshLambertMaterial({ color: 0x514a3d });
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
// 四巡目：板の幅・継ぎ目・雨筋は小さな自作の絵で描く。面や描画の束は増やさない。
const FORT_BOARD_TEXTURES = [];
function fortBoardTexture(roof) {
  const key = roof ? 1 : 0;
  if (FORT_BOARD_TEXTURES[key]) return FORT_BOARD_TEXTURES[key];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  for (let board = 0; board < 4; board++) {
    const v = 202 + Math.round(15 * Math.sin(board * 7.3 + key));
    ctx.fillStyle = `rgb(${v + 8},${v + 4},${v - 3})`; ctx.fillRect(board * 64, 0, 64, 256);
    // 屋根は軒へ、壁は地面へ流れる細い木目。板ごとに乾き方を変える。
    for (let n = 0; n < 22; n++) {
      const x = board * 64 + 4 + n * 2.6;
      ctx.strokeStyle = n % 3 ? 'rgba(67,59,45,.12)' : 'rgba(255,250,231,.2)';
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 2, 80, x - 2, 176, x, 256); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(49,43,34,.45)'; ctx.fillRect(board * 64, 0, 2, 256);
    // 八巡目：写真の古板の節・割れ・釘跡。既存の小さな絵に焼き、面を足さない。
    const knotX = board * 64 + 22 + 12 * Math.sin(board * 3.7 + key);
    const knotY = 42 + (board * 67 + key * 39) % 170;
    ctx.strokeStyle = 'rgba(69,57,41,.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(knotX, knotY, 3, 9, .08, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(58,47,34,.32)';
    ctx.beginPath(); ctx.ellipse(knotX, knotY, 1.3, 4, .08, 0, Math.PI * 2); ctx.fill();
    for (const end of [0, 256]) {
      const crackX = board * 64 + 42 - board * 3, inward = end ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(crackX, end);
      ctx.lineTo(crackX + 1, end + inward * 12); ctx.lineTo(crackX - 1, end + inward * (22 + board * 3)); ctx.stroke();
    }
    if (roof) {
      // 板の端をずらす。瓦のような一様な横段にはしない。
      const joint = 48 + (board * 53) % 160;
      ctx.fillStyle = 'rgba(55,49,39,.36)'; ctx.fillRect(board * 64 + 2, joint, 61, 2);
      ctx.fillStyle = 'rgba(49,43,34,.55)';
      for (const dx of [9, 54]) ctx.fillRect(board * 64 + dx, joint + 5, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  FORT_BOARD_TEXTURES[key] = texture;
  return texture;
}
function fortRooms(rt) {
  const detailed = true, bag = [[], [], []], buildings = {};
  const materials = [ROOM_WOOD, ROOM_ROOF, ROOM_FRAME];
  ROOM_ROOF.color.setHex(detailed ? 0x77705f : 0x4f4234);
  for (const m of materials) { m.map = woodTex(); m.needsUpdate = true; }
  if (detailed) { ROOM_WOOD.map = fortBoardTexture(false); ROOM_ROOF.map = fortBoardTexture(true); }
  const box = (b, material, lx, ly, lz, w, h, d, rx = 0) => {
    const g = ROOM_BOX.clone();
    const uv = g.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let n = 0; n < 4; n++) { const i = f * 4 + n; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]); }
    g.scale(w, h, d); if (rx) g.rotateX(rx);
    g.translate(b.x + lx, rt.world.heightAt(b.x, b.z) + ly, b.z + lz); bag[material].push(g);
  };
  for (const b of FORT_BUILDINGS) {
    if (b.kind === 'goten') {
      buildings[b.id] = goten(rt, b.x, b.z, { w: b.w, d: b.d, name: b.name, tile: false, naka: true, profile: 'nagashima', doorX: 0, team: 1, noTarget: true });
      continue;
    }
    if (!b.enter) {
      // 火がかかる蔵は個別の見た目を保ち、円の当たりを重ねず、板壁の四角の当たりを使う。
      const firstSolid = SOLIDS.length;
      // 五巡目：写真の番小屋のような薄い板葺きへ。共通の石置き屋根はここだけ省く。
      const mesh = hut(rt.world, b.x, b.z, b.w, b.d, 0, { ita: true, minka: false,
        ...(detailed ? { boardRoof: true, weatheredBoards: true, wall: 0x756650,
          boardRoofColors: [0x82735e, 0x756754, 0x8b7960, 0x6c6253] } : {}),
      }); rt.scene.add(mesh);
      const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2, w: b.w, d: b.d, mesh, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name, flammable: true, moraleOnBurn: 'big' });
      for (let n = firstSolid; n < SOLIDS.length; n++) SOLIDS[n].struct = struct;
      struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { mesh, struct };
      continue;
    }
    const w = b.w, d = b.d, y = rt.world.heightAt(b.x, b.z), H = 2.6, door = 1.4;
    // 五巡目：戸の左右に小さな格子窓。外壁・室内・当たりを同じ開口にする。
    const windows = detailed ? [-1, 1].map(side => ({ face: 'z', s: 1, t: side * (w + door) / 4,
      w: Math.min(1.1, (w - door) / 2 - .5), y0: 1.25 - .18, y1: 2.05 - .18 })) : [];
    const naka = addInterior(rt.world, { name: b.name, kind: b.kind || 'nagaya', profile: 'nagashima', x: b.x, z: b.z, team: 1,
      levels: [{ y: y + .18, w, d, h: H - .18 }], door: { side: 1, lx: 0, w: door, h: 2.05 }, approach: { pad: .2, len: .9 }, wins: () => windows });
    // 共通の室内と同じ寸法の壁。入口を飾りの戸や大きな当たりで塞がない。
    box(b, 0, 0, .1, 0, w, .16, d);
    box(b, 0, 0, H / 2, -d / 2, w, H, .12);
    for (const side of [-1, 1]) {
      box(b, 0, side * w / 2, H / 2, 0, .12, H, d);
    }
    const openings = windows.map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .18, y1: v.y1 + .18 }));
    openings.push({ t0: -door / 2, t1: door / 2, y0: 0, y1: 2.23 });
    for (const [x0, x1, y0, y1] of facePanels(w, H, openings))
      box(b, 0, (x0 + x1) / 2, (y0 + y1) / 2, d / 2, x1 - x0, y1 - y0, .12);
    for (const v of windows) {
      const bottom = v.y0 + .18, top = v.y1 + .18, mid = (bottom + top) / 2;
      for (const side of [-1, 1]) {
        box(b, 2, v.t + side * (v.w / 2 + .035), mid, d / 2 + .025, .07, top - bottom + .14, .16);
        box(b, 2, v.t, side < 0 ? bottom : top, d / 2 + .025, v.w + .14, .07, .16);
      }
      for (let q = -1; q <= 1; q++) box(b, 2, v.t + q * v.w * .3, mid, d / 2, .045, top - bottom, .08);
      // 七巡目：格子窓の上に板の跳ね上げ戸。窓穴は開けたまま、軒下で雨をよける。
      // 二枚の板と裏桟・突き上げ棒を既存の束へ入れ、別の描画や当たりを増やさない。
      const flap = .64, tilt = .4, fy = top + .04 - flap * Math.sin(tilt) / 2;
      const fz = d / 2 + .08 + flap * Math.cos(tilt) / 2;
      for (const side of [-1, 1]) {
        box(b, 0, v.t + side * (v.w + .12) / 4, fy, fz, (v.w + .12) / 2 - .008, .045, flap, tilt);
        box(b, 2, v.t + side * v.w * .35, fy - .035, fz, .045, .045, flap - .06, tilt);
        const reach = flap * Math.cos(tilt) - .05, lift = top - .28 - (bottom + .2);
        box(b, 2, v.t + side * v.w * .4, (top - .28 + bottom + .2) / 2,
          d / 2 + .08 + reach / 2, .035, .035, Math.hypot(reach, lift), -Math.atan2(lift, reach));
      }
    }
    const half = d / 2 + .6, rise = half * .4, slope = Math.hypot(half, rise), angle = Math.atan2(rise, half);
    if (detailed) {
      // 妻を三角の板壁で閉じる。軒より外へ張り出さず、裏面にも厚みを持たせる。
      for (const side of [-1, 1]) {
        const g = new THREE.BufferGeometry(), x0 = side * w / 2 - .06, x1 = x0 + .12;
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          x0,H+.18,-d/2, x0,H+.18,d/2, x0,H+rise-.06,0,
          x1,H+.18,-d/2, x1,H+.18,d/2, x1,H+rise-.06,0,
        ], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, d,0, d/2,d*.2, 0,0, d,0, d/2,d*.2], 2));
        g.setIndex([0,2,1, 3,4,5, 0,1,4, 0,4,3, 1,2,5, 1,5,4, 2,0,3, 2,3,5]);
        g.computeVertexNormals(); g.translate(b.x, y, b.z); bag[0].push(g);
        box(b, 0, side * w / 2, H + .09, 0, .12, .18, d);
        // 隅柱と桁。正面の横桟は左右へ分け、入口の高さと幅を守る。
        for (const end of [-1, 1]) box(b, 2, side * w / 2, H / 2, end * d / 2, .16, H, .17);
        box(b, 2, 0, H - .08, side * d / 2, w + .2, .16, .18);
        box(b, 2, side * w / 2, H - .08, 0, .18, .16, d);
        box(b, 2, side * (w + door) / 4, .55, d / 2 + .07, (w - door) / 2, .1, .08);
        box(b, 2, side * (door / 2 + .06), 1.12, d / 2 + .07, .12, 2.23, .1);
      }
      // 押縁は粗めの間隔で束にまとめる。板壁の一枚ごとに面を増やさない。
      const count = Math.ceil(w / 1.5);
      for (let i = 1; i < count; i++) {
        const lx = -w / 2 + w * i / count;
        box(b, 2, lx, H / 2, -d / 2 - .07, .045, H, .04);
        if (Math.abs(lx) > door / 2 + .15) {
          const win = windows.find(v => Math.abs(lx - v.t) < v.w / 2 + .08);
          if (win) {
            const bottom = win.y0 + .18, top = win.y1 + .18;
            box(b, 2, lx, bottom / 2, d / 2 + .07, .045, bottom, .04);
            box(b, 2, lx, (top + H) / 2, d / 2 + .07, .045, H - top, .04);
          } else box(b, 2, lx, H / 2, d / 2 + .07, .045, H, .04);
        }
      }
      // 湿った輪中の地際だけ暗くする。戸口と踏段は泥色の板で塞がない。
      box(b, 2, 0, .16, -d / 2 - .065, w, .28, .025);
      for (const side of [-1, 1]) {
        box(b, 2, side * (w / 2 + .065), .16, 0, .025, .28, d);
        box(b, 2, side * (w + door) / 4, .16, d / 2 + .065, (w - door) / 2, .28, .025);
      }
    }
    for (const side of [-1, 1]) {
      box(b, 1, 0, H + rise / 2, side * half / 2, w + 1.2, .12, slope, side * angle);
      if (detailed) {
        // 六巡目：写真の薄い板屋根を支える垂木と破風板。軒下を一枚板のままにしない。
        // 壁より外の軒だけに短い垂木を出し、既存の材質の束に入れる。
        const rafters = Math.ceil(w / 1.4), tail = .58, tailRise = tail * rise / half;
        for (let n = 0; n <= rafters; n++)
          box(b, 2, -w / 2 + w * n / rafters, H + tailRise / 2 - .11,
            side * (half - tail / 2), .075, .1, Math.hypot(tail, tailRise), side * angle);
        for (const end of [-1, 1])
          box(b, 2, end * (w / 2 + .55), H + rise / 2 - .035,
            side * half / 2, .09, .18, slope + .08, side * angle);
      }
      // 板葺きの押さえ木と段の筋。
      for (let n = 1; n <= 3; n++) box(b, 1, 0, H + rise * (1 - n / 4) + .1, side * half * n / 4, w + 1.3, .08, .1);
    }
    box(b, 1, 0, H + rise + .08, 0, w + 1.4, .15, .24);
    for (let n = 0; n < 3; n++) box(b, 0, 0, .03 + n * .03, d / 2 + .2 + (2 - n) * .3, 1.7, .06 + n * .06, .3);
    const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(w, d) / 2, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name });
    // 入れるようにした蔵・小屋も、元の着火と焼失時の士気を保つ。
    if (b.kind === 'kura' || b.id === 'naka_hut') { struct.flammable = true; struct.moraleOnBurn = 'big'; }
    struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { naka, struct };
  }
  for (let n = 0; n < bag.length; n++) {
    if (!bag[n].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(bag[n], false), materials[n]);
    mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    for (const g of bag[n]) g.dispose();
  }
  return buildings;
}

// 三巡目：既存の塀・櫓を重ねず、土塁の裾と町の境、作事の道具を補う。
// 全部開戦時に三種類の形へ束ねる。兵・旗・登り口・室内は増減しない。
function fortYardDetails(rt) {
  const W = rt.world, bags = [[], [], []], at = new THREE.Object3D();
  const put = (kind, x, y, z, w, h, d, color, rx = 0, rz = 0) => {
    at.position.set(x, y, z); at.rotation.set(rx, 0, rz); at.scale.set(w, h, d); at.updateMatrix();
    bags[kind].push({ matrix: at.matrix.clone(), color });
  };
  // 斧で削いだ低い杭を板塀の外、土塁の裾へ。木戸正面と川岸の射手の持ち場は空ける。
  const stakeRows = [[-32, -65, -32, -99], [32, -64, 32, -98], [38, -96, 64, -96], [126, -74, 126, -113]];
  for (const [ax, az, bx, bz] of stakeRows) {
    const len = Math.hypot(bx - ax, bz - az), count = Math.floor(len / .85);
    for (let i = 0; i <= count; i++) {
      // 六巡目：写真の乱杭は等間隔の細い棒ではない。同じ本数で間隔・太さ・傾きを崩す。
      // 両端は元の位置に残し、木戸や通路へ列を広げない。
      const t = (i + (i > 0 && i < count ? .24 * Math.sin(i * 4.7 + ax) : 0)) / count;
      const offset = .1 * Math.sin(i * 5.1), nx = -(bz - az) / len, nz = (bx - ax) / len;
      const x = ax + (bx - ax) * t + nx * offset, z = az + (bz - az) * t + nz * offset;
      const h = 1.05 + .25 * Math.sin(i * 2.3 + ax), y = W.heightAt(x, z);
      const girth = .85 + .55 * (.5 + .5 * Math.sin(i * 3.7 + az));
      put(2, x, y - .2, z, girth, h, girth, i % 3 ? 0x82755e : 0x655e50, .13 * Math.sin(i), .14 * Math.cos(i));
    }
    // 見た目だけの杭を通り抜けない。既存の塀の外側だけ、低い木の当たりを付ける。
    Object.assign(solidSeg(ax, az, bx, bz, .18), { missileH: 1.1, missileType: 'wood' });
  }
  // 僧坊・門徒屋敷の裏境。南北の路地と住民の道（x=-48前後）には口を残す。
  const fences = [[-54, -105, -50.5, -105], [-45, -105, -36, -105], [-42, -98, -36, -98]];
  for (const [ax, az, bx, bz] of fences) {
    const len = bx - ax, n = Math.ceil(len / .32);
    for (let i = 0; i < n; i++) {
      const x = ax + (i + .5) * len / n, y = W.heightAt(x, az), h = 1.25 + .07 * Math.sin(i * 3.4);
      put(0, x, y + h / 2, az, len / n - .015, h, .065, i % 4 ? 0x7d735e : 0x696253);
      // 地際だけを泥色にし、板の上端は乾いた灰茶に残す。
      put(0, x, y + .12, az + .005, len / n - .015, .24, .075, 0x514c3f);
    }
    for (let x = ax; x <= bx + .01; x += len / Math.ceil(len / 1.8)) {
      const y = W.heightAt(x, az);
      put(0, x, y + .7, az + .08, .13, 1.5, .13, 0x5e5545);
    }
    for (const h of [.35, .95]) {
      const y = (W.heightAt(ax, az) + W.heightAt(bx, bz)) / 2;
      put(0, (ax + bx) / 2, y + h, az + .09, len, .09, .09, 0x635946);
    }
    Object.assign(solidSeg(ax, az, bx, bz, .12), { missileH: 1.4, missileType: 'wood' });
  }
  // 本の作事小屋のように、低い片流れの掛屋と、その脇の丸太・板束を組む。
  // 俵ばかりの広場にせず、二砦の奥と織田本陣の脇へ分ける（位置・個数は推定）。
  for (const [x, z] of [[-24, -96], [60, -90], [-15, 60]]) {
    const y = Math.max(W.heightAt(x - 1.4, z), W.heightAt(x + 1.4, z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * 1.4, pz = z + sz * .9, bottom = W.heightAt(px, pz) - .15, top = y + 1.65 + sz * .18;
      put(1, px, (bottom + top) / 2, pz, .11, top - bottom, .11, 0x716452);
    }
    for (const sz of [-1, 1]) put(0, x, y + 1.65 + sz * .18, z + sz * .9, 3.1, .12, .14, 0x5d5141);
    // 八巡目：片流れ屋根の下に垂木、柱と桁の間に方杖。板束の出し口は塞がない。
    // 既存の箱の束を使い、屋根板を垂木の上へ載せる。
    for (const dx of [-1.4, 0, 1.4])
      put(0, x + dx, y + 1.72, z, .09, .12, 2.25, 0x655942, -Math.atan(.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      put(0, x + sx * 1.15, y + 1.35 + sz * .18, z + sz * .9,
        .09, Math.hypot(.5, .5), .09, 0x71634e, 0, sx * Math.PI / 4);
    for (let i = 0; i < 9; i++) {
      put(0, x - 1.6 + (i + .5) * 3.2 / 9, y + 1.82, z, .35, .07, 2.3, i % 3 ? 0x8a7c62 : 0x716852, -Math.atan(.2));
    }
    for (const dz of [-.7, .7]) put(0, x, y + 1.9 + dz * .2, z + dz, 3.3, .08, .09, 0x615744);
    // 枕木の上に製材した板を置き、切り出した丸太は横へ積む。
    for (const dx of [-.9, .9]) put(0, x + dx, y + .1, z, .18, .2, 1.5, 0x514b3e);
    for (let layer = 0; layer < 4; layer++) for (let k = 0; k < 3; k++)
      put(0, x, y + .25 + layer * .13, z + (k - 1) * .36, 2.4 - layer * .05, .1, .32, layer % 2 ? 0x8d7d60 : 0x75684f);
    const lx = x + 2.4, ly = W.heightAt(lx, z);
    // 七巡目：丸太を地面に直置きせず、写真の作事場のような二脚の木馬へ載せる。
    // 板束の天端には木槌と手斧。すべて既存の三種類の形・材質を使う。
    for (const dz of [-.85, .85]) {
      for (const side of [-1, 1]) put(1, lx + side * .25, ly + .23, z + dz,
        .055, .55, .055, 0x71634e, 0, side * .4);
      put(0, lx, ly + .45, z + dz, .85, .12, .14, 0x8d7d60);
    }
    for (let k = 0; k < 5; k++) put(1, lx + (k % 3 - 1) * .25, ly + .63 + Math.floor(k / 3) * .23, z,
      .12, 2.6 + .12 * Math.sin(k), .12, k % 2 ? 0x645b49 : 0x827056, Math.PI / 2);
    put(0, x - .45, y + .71, z + .1, .055, .055, .65, 0x695b44);
    put(0, x - .45, y + .76, z - .18, .32, .16, .14, 0x928062);
    put(0, x + .5, y + .71, z + .05, .055, .055, .72, 0x8c7857);
    put(0, x + .56, y + .75, z - .24, .18, .11, .2, 0x4e4b43);
  }
  // 本の野戦兵器の竹の盾を、輪中の岸では車輪なしの据え竹束にする。
  // 柵の作業点・着岸口・東の乱戦（x=24前後）から外し、左右の端にだけ置く。
  // 寸法と配置は復元。近い束だけ節と縄を作り、遠い付城は太い竹の輪郭に留める。
  for (const [x, z, close] of [[-55, -10, true], [57, -10, true], [-72, 14, false], [88, 20, false]]) {
    const y = drawGroundAt(W, x, z), count = close ? 17 : 9, pitch = close ? .13 : .245;
    for (let i = 0; i < count; i++) {
      const px = x + (i - (count - 1) / 2) * pitch;
      const h = 1.75 + .12 * Math.sin(i * 2.7 + x), r = close ? .073 : .13;
      const bottom = drawGroundAt(W, px, z) - .08;
      put(1, px, bottom + h / 2, z, r, h, r, i % 3 ? 0x8b8957 : 0x686e48);
      if (close) {
        // 節は細い輪。裏にも竹をずらして重ね、平たい板の盾にしない。
        for (const dy of [.32, .79, 1.26])
          put(1, px, bottom + dy, z, r * 1.12, .035, r * 1.12, 0xaaa071);
        if (i % 2 === 0) put(1, px, bottom + h * .48, z + .13, r, h * .96, r, 0x797b51);
      }
    }
    for (const dy of [.48, 1.25]) {
      // 束の表裏を回る締め縄と、横木。箱の束をそのまま共用する。
      for (const dz of [-.09, .23]) put(0, x, y + dy, z + dz, 2.3, .045, .045, 0xb2a17a);
      for (const dx of [-1.12, 1.12]) put(0, x + dx, y + dy, z + .07, .045, .045, .36, 0xa18d64);
    }
    for (const dx of [-.8, .8]) {
      put(1, x + dx, y + .65, z + .38, .07, 1.5, .07, 0x665b44, -.38);
      put(1, x + dx, y + .24, z + .78, .075, .7, .075, 0x5c513c);
    }
    Object.assign(solidRect(x, z + .08, 2.3, .5), { missileH: 1.8, missileType: 'wood' });
  }
  // 本の作事場と同じ、使う場所の横に置かれた資材。街道と援兵の道は空ける。
  for (const [x, z] of [[-18, 26], [19, 37]]) {
    const y = drawGroundAt(W, x, z);
    for (const dz of [-.7, .7]) put(0, x, y + .08, z + dz, 1.5, .16, .17, 0x675942);
    for (let i = 0; i < 9; i++) {
      const px = x + (i % 5 - 2) * .16, py = y + .24 + Math.floor(i / 5) * .15;
      put(1, px, py, z, .065, 2.6 - .1 * (i % 3), .065, i % 2 ? 0x98905e : 0x77784c, Math.PI / 2);
    }
    for (const dz of [-.65, .65]) put(0, x - .08, y + .48, z + dz, .8, .035, .045, 0xb2a17a);
  }
  // 秋の刈田の端に残された小さな稲積み。兵糧攻めの島内には新たな食糧を置かない。
  // 遠景なので四本の束と締め縄だけにし、一本ずつの稲は作らない。
  for (const [x, z] of [[-48, 80], [-62, 107], [48, 82], [62, 108]]) {
    const y = drawGroundAt(W, x, z);
    for (const dx of [-1, 1]) for (const dz of [-1, 1])
      put(1, x + dx * .2, y + .5, z + dz * .15, .16, 1.1, .16, 0x9c8858, -dz * .27, dx * .32);
    put(0, x, y + .76, z, .45, .055, .39, 0x6c5e40);
  }
  const shaft = new THREE.CylinderGeometry(.045, .07, 1, 5); shaft.translate(0, .5, 0);
  const tip = new THREE.ConeGeometry(.045, .22, 5); tip.translate(.015, 1.11, 0);
  const stake = mergeGeometries([shaft, tip], false); shaft.dispose(); tip.dispose();
  const log = new THREE.CylinderGeometry(1, 1, 1, 5);
  const material = new THREE.MeshLambertMaterial({ map: woodTex() });
  const shapes = [ROOM_BOX, log, stake], color = new THREE.Color();
  for (let k = 0; k < bags.length; k++) {
    const mesh = new THREE.InstancedMesh(shapes[k], material, bags[k].length);
    bags[k].forEach((item, i) => { mesh.setMatrixAt(i, item.matrix); mesh.setColorAt(i, color.setHex(item.color)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true; mesh.castShadow = true; rt.scene.add(mesh);
  }
}

// 船の形・材質は共用。開戦時だけ作り、毎コマは位置だけ動かす。
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95, side: THREE.DoubleSide });
WOOD.side = THREE.DoubleSide;
// 小舟は一つの形と材質を複製して使う。
// 動く舟の棹は船体に焼き込まず、同じ寸法の形を組み合わせる。
const BOAT_SHADOW_GEO = new THREE.CircleGeometry(1, 12);
BOAT_SHADOW_GEO.rotateX(-Math.PI / 2);
const BOAT_SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x172720, transparent: true, opacity: .22, depthWrite: false });
const POLE_GEO = new THREE.CylinderGeometry(.03, .03, 4.5, 5);
const ROPE = new THREE.MeshLambertMaterial({ color: 0xa4946b });
const IRON = new THREE.MeshLambertMaterial({ color: 0x4c4940 });
const MUSHIRO = new THREE.MeshLambertMaterial({ color: 0x9b8a61 });
const FOAM = new THREE.MeshBasicMaterial({ color: 0xb4c5bb, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide });
// 板は閉じた厚板。丸い船底から舷へ幅を広げ、継ぎ目を残す。
function hullPlank(bag, points, dx, dy) {
  const pos = points.concat(points.map((v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : 0)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 0,1, 1,0, 1,1, 0,0, 0,1, 1,0, 1,1], 2));
  g.setIndex([0,1,2, 2,1,3, 6,5,4, 7,5,6, 0,4,1, 1,4,5, 2,3,6, 6,3,7, 0,2,4, 4,2,6, 1,5,3, 3,5,7]);
  g.computeVertexNormals(); bag.push(g);
}
function boatBox(bag, x, y, z, w, h, d, rz = 0) {
  const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateZ(rz); g.translate(x,y,z); bag.push(g);
}
function buildBoatHull(bags, length, width, deck, rise) {
  const half = length / 2, widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / half) ** 2);
  for (let i = 0; i < 16; i++) {
    const a = length * (i / 16 - .5), b = length * ((i + 1) / 16 - .5) - .015;
    const wa = widthAt(a), wb = widthAt(b), ya = rise * (Math.abs(a) / half) ** 3, yb = rise * (Math.abs(b) / half) ** 3;
    hullPlank(bags[0], [-wa*.32,ya-.3,a, -wb*.32,yb-.3,b, wa*.32,ya-.3,a, wb*.32,yb-.3,b], 0, .1);
    for (const side of [-1,1]) {
      const xs = [.32,.67,.92,1], ys = [-.3,-.18,.12,deck+.5];
      for (let r = 0; r < 3; r++) hullPlank(bags[r % 2],
        [side*wa*xs[r],ya+ys[r],a, side*wb*xs[r],yb+ys[r],b,
         side*wa*xs[r+1],ya+ys[r+1]-.012,a, side*wb*xs[r+1],yb+ys[r+1]-.012,b], -side*.085, 0);
      hullPlank(bags[1], [side*wa,ya+deck+.5,a, side*wb,yb+deck+.5,b,
        side*(wa-.13),ya+deck+.5,a, side*(wb-.13),yb+deck+.5,b], 0, .12);
      if (i % 2 === 0) {
        const z = (a+b)/2, w = (wa+wb)/2, y = (ya+yb)/2;
        boatBox(bags[1], side*(w-.12), y+deck+.2, z, .09, .6, .12, side*.14);
        const nail = new THREE.CylinderGeometry(.024, .024, .035, 5); nail.rotateZ(Math.PI/2);
        nail.translate(side*(w+.025), y+deck+.28, z); bags[4].push(nail);
      }
    }
    // 舷の内側に収めた床板。黒い突出板を作らない。
    boatBox(bags[0], 0, deck, (a+b)/2, (wa+wb)*.85, .1, b-a-.025);
  }
  // 点々の白い板ではなく、舷から船首・船尾まで閉じた波の輪。
  // 大舟は水面から .45 下げて置くので、その分だけ輪の高さを合わせる。
  const foamPos = [], foamIdx = [], foamY = deck > .5 ? .49 : .04, count = 48;
  for (let i = 0; i <= count; i++) {
    const a = i / count * Math.PI * 2, z = Math.cos(a) * half;
    const x = Math.sign(Math.sin(a)) * widthAt(z) * Math.min(1, Math.abs(Math.sin(a)) * 4);
    for (const rim of [0, .05]) foamPos.push(x + Math.sin(a) * (.07 + rim), foamY, z + Math.cos(a) * (.07 + rim));
    if (i < count) { const k = i * 2; foamIdx.push(k, k+1, k+2, k+1, k+3, k+2); }
  }
  const foamGeo = new THREE.BufferGeometry();
  foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(foamPos, 3));
  foamGeo.setIndex(foamIdx); bags[5].push(foamGeo);
  const wrap = new THREE.TorusGeometry(.16, .025, 4, 10); wrap.rotateX(Math.PI/2);
  for (const side of [-1,1]) for (const z of [-length*.25,length*.25]) {
    const g = wrap.clone(); g.translate(side*widthAt(z), deck+.55+rise*.125, z); bags[3].push(g);
  }
  wrap.dispose();
  boatBox(bags[2], 0, deck+.065, -.7, width*.52, .04, length*.25);
  // 筵の織り目と縄を掛けた荷。
  for (let i=0;i<12;i++) boatBox(bags[3], 0, deck+.09, -length*.12+i*length*.02, width*.52,.012,.015);
  boatBox(bags[0], 0, deck+.22, length*.29, width*.3,.35,length*.12);
  for (const z of [length*.26,length*.32]) boatBox(bags[3],0,deck+.405,z,width*.31,.025,.04);
}
// 舟の部品は色だけ違う材質なので、頂点の色で二つ（木と黒木／筵・縄・鉄）にまとめる（一艘五回 → 二回。泡は別）
const BOAT_WOOD_V = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const BOAT_LAM_V = new THREE.MeshLambertMaterial({ vertexColors: true });
function finishBoat(model, bags) {
  const mats = [WOOD,DARK,MUSHIRO,ROPE,IRON,FOAM];
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
  for (const [ids, mat] of [[[0, 1], BOAT_WOOD_V], [[2, 3, 4], BOAT_LAM_V]]) {
    const geos = [];
    for (const i of ids) for (const g of bags[i]) geos.push(tint(g, mats[i].color));
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = true; m.receiveShadow = true; model.add(m);
  }
  if (bags[5].length) {
    const m = new THREE.Mesh(mergeGeometries(bags[5],false), FOAM);
    m.castShadow = false; m.receiveShadow = false; model.add(m);
  }
  for (const b of bags) for (const g of b) g.dispose();
}
const BOAT_MODEL = new THREE.Group(), boatParts = Array.from({length:6},()=>[]);
buildBoatHull(boatParts,6.5,1.8,.05,.22);
finishBoat(BOAT_MODEL,boatParts);
// 岸の飾り舟は元の棹付きの形を保つ。
const MOORED_BOAT = BOAT_MODEL.clone();
// 岸に繋いだ舟は進まないので、舳先の泡を付けない（描く回数も一つ減る）
for (const m of [...MOORED_BOAT.children]) if (m.material === FOAM) MOORED_BOAT.remove(m);
const mooredPole = new THREE.Mesh(POLE_GEO, WOOD);
mooredPole.position.set(.55, 1.3, -2); mooredPole.rotation.x = .6; MOORED_BOAT.add(mooredPole);
function riverBoat(x, y, z, rot, moving = false) {
  const m = (moving ? BOAT_MODEL : MOORED_BOAT).clone(); m.position.set(x, y, z); m.rotation.y = rot; return m;
}
// 舟と船の形は、同じ形・同じ材質ごとに一つの束（InstancedMesh）で描く（一艘ずつ二、三回描いていた。長島で四十回ほど）。
//   舟の Group と部品はそのまま動かし（沈む・傾く・櫂も今までどおり）、描く直前に部品の場所を束へ写す。元の部品は描かない
function boatInstancer(rt) {
  const geos = new Set();
  for (const model of [BOAT_MODEL, MOORED_BOAT, ...SHIP_MODELS]) for (const c of model.children) if (c.isMesh) geos.add(c.geometry);
  geos.add(POLE_GEO);
  const B = { map: new Map(), roots: [], n: 0 };
  const scan = () => {
    for (const root of rt.scene.children) {
      if (root.userData.boatSeen || !root.isGroup) continue;
      let hit = false;
      for (const c of root.children) if (c.isMesh && !c.isInstancedMesh && geos.has(c.geometry) && !Array.isArray(c.material)) hit = true;
      if (!hit) continue;
      root.userData.boatSeen = true;
      // 舟の部品の行列は乗員の足場と同じコマの値を読む。景物の固定・結合には渡さない。
      root.userData.noFreeze = true; root.userData.noMerge = true;
      B.roots.push(root);
      for (const c of root.children) {
        if (!c.isMesh || c.isInstancedMesh || !geos.has(c.geometry) || Array.isArray(c.material)) continue;
        const key = c.geometry.uuid + c.material.uuid + (c.castShadow ? 1 : 0);
        let e = B.map.get(key);
        if (!e) { e = { geo: c.geometry, mat: c.material, cast: c.castShadow, recv: c.receiveShadow, list: [], im: null }; B.map.set(key, e); }
        e.list.push(c); c.layers.mask = 0; c.userData.boatInst = true;
      }
    }
    // 影を落とすのはカメラの近くの舟だけ（遠い舟は影の束に入れない）。近い束と遠い束の二つ
    for (const e of B.map.values()) {
      if (e.im && e.im.instanceMatrix.count >= e.list.length) continue;
      for (const im of [e.im, e.imF]) if (im) { rt.scene.remove(im); im.dispose(); }
      const mk = (cast) => { const im = new THREE.InstancedMesh(e.geo, e.mat, Math.max(4, e.list.length + 4)); im.castShadow = cast; im.receiveShadow = e.recv; im.frustumCulled = false; im.userData.noFreeze = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; rt.scene.add(im); return im; };
      e.im = mk(e.cast); e.imF = mk(false);
    }
  };
  const visibleIn = (c) => { if (!c.visible) return false; for (let p = c.parent; p; p = p.parent) { if (!p.visible) return false; if (p === rt.scene) return true; } return false; };
  const before = rt.scene.onBeforeRender;
  rt.scene.onBeforeRender = function (r, sc, cam, t) {
    before.call(this, r, sc, cam, t);
    if ((B.n++ % 60) === 0) scan();
    for (const root of B.roots) if (root.parent === rt.scene) root.updateMatrixWorld(true);
    const cx = cam.position.x, cz = cam.position.z;
    for (const e of B.map.values()) {
      let kn = 0, kf = 0;
      for (const c of e.list) {
        if (!visibleIn(c)) continue;
        const m = c.matrixWorld.elements;
        if (e.cast && (m[12] - cx) ** 2 + (m[14] - cz) ** 2 < 1600) e.im.setMatrixAt(kn++, c.matrixWorld); else e.imF.setMatrixAt(kf++, c.matrixWorld);
      }
      e.im.count = kn; e.imF.count = kf; e.im.visible = kn > 0; e.imF.visible = kf > 0;
      e.im.instanceMatrix.needsUpdate = true; e.imF.instanceMatrix.needsUpdate = true;
    }
  };
}
// 西の川筋を塞ぐ織田方の小舟の列。川霧の中に並べ、舟ごとに波紋の輪が広がる。
// 舟は共通の小舟（boatInstancer が束にまとめる）、輪と霧は InstancedMesh 一つずつ。毎コマは行列と色だけ書き換える。
const FLEET_N = 9, RIP_K = 2, MIST_N = 8;
let MIST_TEX = null;
function fleetMist(rt) {
  const W = rt.world, F = rt.flags, boats = [];
  const midZ = (x) => CH_Z + (x < -100 ? (-100 - x) * 4 / 140 : 0);
  for (let i = 0; i < FLEET_N; i++) {
    const x = -74 - i * 12.5, z = midZ(x) + Math.sin(i * 2.1) * 1.6;
    const y = waterHeight(W, x, z);
    const m = riverBoat(x, y, z, Math.PI / 2 + Math.sin(i * 1.3) * .12);
    rt.scene.add(m);
    boats.push({ m, x, y, z, ph: i * 1.7 });
  }
  const ringGeo = new THREE.RingGeometry(.9, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), FLEET_N * RIP_K);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rings.frustumCulled = false;
  { const c0 = new THREE.Color(0); for (let i = 0; i < FLEET_N * RIP_K; i++) rings.setColorAt(i, c0); }
  if (!MIST_TEX) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 40, 4, 64, 40, 62);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    MIST_TEX = new THREE.CanvasTexture(c);
  }
  const mistGeo = new THREE.PlaneGeometry(1, 1); mistGeo.translate(0, .5, 0);
  const mist = new THREE.InstancedMesh(mistGeo, new THREE.MeshBasicMaterial({ map: MIST_TEX, color: 0xdfe3df, transparent: true, opacity: .42, depthWrite: false }), MIST_N);
  mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mist.frustumCulled = false; mist.renderOrder = 3;
  const puffs = [];
  for (let i = 0; i < MIST_N; i++) {
    const x = -70 - i * 15 + Math.sin(i * 3.3) * 4, z = midZ(x) + Math.sin(i * 1.9) * 3;
    puffs.push({ x, z, y: waterHeight(W, x, z) - .3, w: 30 + 8 * Math.abs(Math.sin(i * 2.7)), h: 5 + 2 * Math.abs(Math.sin(i * 4.1)), ph: i * .9 });
  }
  rt.scene.add(rings, mist);
  F.fleet = { boats, rings, mist, puffs, o: new THREE.Object3D(), c: new THREE.Color() };
}
function fleetTick(rt, dt) {
  const L = rt.flags.fleet; if (!L) return;
  const t = rt.t, o = L.o, c = L.c, cam = rt.camera;
  let k = 0;
  for (const b of L.boats) {
    // 繋いだ舟がわずかに揺れ、舷から輪が広がって消える
    b.m.position.y = b.y + Math.sin(t * 1.3 + b.ph) * .05;
    b.m.rotation.z = Math.sin(t * .9 + b.ph) * .025;
    for (let j = 0; j < RIP_K; j++, k++) {
      const a = ((t * .32 + b.ph * .37 + j / RIP_K) % 1);
      const r = 2.2 + a * 6.5;
      o.position.set(b.x, b.y + .04, b.z); o.rotation.set(0, 0, 0); o.scale.set(r, 1, r * .55); o.updateMatrix();
      L.rings.setMatrixAt(k, o.matrix);
      c.setScalar(.22 * (1 - a) * Math.min(1, a * 6)); L.rings.setColorAt(k, c);
    }
  }
  L.rings.instanceMatrix.needsUpdate = true; if (L.rings.instanceColor) L.rings.instanceColor.needsUpdate = true;
  // 霧は川面を這うように流れ、いつもカメラの方を向く
  for (let i = 0; i < L.puffs.length; i++) {
    const p = L.puffs[i], x = p.x + Math.sin(t * .05 + p.ph) * 4;
    o.position.set(x, p.y, p.z);
    o.rotation.set(0, cam ? Math.atan2(cam.position.x - x, cam.position.z - p.z) : 0, 0);
    o.scale.set(p.w, p.h, 1); o.updateMatrix(); L.mist.setMatrixAt(i, o.matrix);
  }
  L.mist.instanceMatrix.needsUpdate = true;
}
// 描画済みの川面と同じ水深に舟を浮かべる。毎コマの計算で物を作らない。
function waterHeight(W, x, z) {
  return W.heightAt(x, z) + W.waterDepthAt(x, z);
}

// 歩いた距離で左右の足を交互に出す。止まった時・橋や舟の上では出さない。
// 粒と波紋は共通の固定枠を使い、毎コマ形や材質を増やさない。
function shoreFootTick(rt) {
  const F = rt.flags, u = rt.player.u, W = rt.world;
  const moved = Math.hypot(u.pos.x - F.wadeX, u.pos.z - F.wadeZ);
  F.wadeX = u.pos.x; F.wadeZ = u.pos.z;
  if (!u.alive || u.mounted || u.perch || u.climb || moved < .001 || moved > 2 || W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) <= .02) {
    F.wadeDist = 0; return;
  }
  F.wadeDist += moved;
  if (F.wadeDist < .65) return;
  F.wadeDist %= .65; F.wadeSide = -F.wadeSide;
  const x = u.pos.x + Math.cos(u.heading) * F.wadeSide * .22;
  const z = u.pos.z - Math.sin(u.heading) * F.wadeSide * .22;
  if (W.waterFootDepthAt(x, z, u.pos.y) > .02) W.spray(x, z, 7);
}

// 岸の足運び。八秒ごとの一斉再生ではなく、押し合い・走り・敗走の実際の歩幅を拾う。
// 近い兵だけを八分の一秒ごとに調べ、粒は一回二人まで、共通の固定枠へ戻す。
function bankFootTick(rt) {
  const F = rt.flags, W = rt.world, units = rt.army.units;
  if (F.step < 3 || F.step > 3.5 || F.ending || rt.t < (F.bankFootAt || 0)) return;
  F.bankFootAt = rt.t + .125;
  let emitted = 0;
  const start = F.bankFootCursor || 0;
  F.bankFootCursor = (start + 1) % Math.max(1, units.length);
  for (let i = 0; i < units.length; i++) {
    const u = units[(start + i) % units.length];
    if (u.isPlayer || !u.alive || u.noTarget || u.mounted || u.perch || u.climb || u.shoreWaiting ||
        u.boatSeat?.aboard || u.woundOut || u.rearWound || u.downed || u.camD > 38) {
      u.bankFootX = undefined; continue;
    }
    if (u.bankFootX === undefined) {
      u.bankFootX = u.pos.x; u.bankFootZ = u.pos.z;
      u.bankFootDist = (u.id * .618 % 1) * .4; u.bankFootSide = 1;
      continue;
    }
    const dx = u.pos.x - u.bankFootX, dz = u.pos.z - u.bankFootZ, moved = Math.hypot(dx, dz);
    u.bankFootX = u.pos.x; u.bankFootZ = u.pos.z;
    if (moved > 2 || u.moving < .12) { u.bankFootDist = 0; continue; }
    if (moved < .001) continue;
    const stride = .48 + (u.id % 5) * .045 + (u.fleeing ? .12 : 0);
    u.bankFootDist += moved;
    if (u.bankFootDist < stride) continue;
    u.bankFootDist %= stride; u.bankFootSide = -u.bankFootSide;
    if (emitted >= 2) continue;
    emitted++;
    const x = u.pos.x + Math.cos(u.heading) * u.bankFootSide * .18;
    const z = u.pos.z - Math.sin(u.heading) * u.bankFootSide * .18;
    const wet = W.waterFootDepthAt(x, z, u.pos.y) > .02;
    if (!reduceMotion()) {
      if (wet) W.spray(x, z, 2);
      else if (W.def.muddy || W.wetness > .5 || W.rainLevel > .4) W.kick(x, z, dx / moved, dz / moved, 2, 3);
      else {
        const p = W.dustCloud(x, z, false, true);
        if (p) { p.s0 *= .5; p.s1 *= .45; p.a *= .65; p.life *= .5; p.rise *= .35; }
      }
    }
    if (rt.t >= (F.bankStepAt || 0)) {
      F.bankStepAt = rt.t + .24;
      rt.army.play(wet ? 'stepWet' : 'step', u.pos, u.fleeing ? .45 : .3);
    }
    const g = u.group;
    if (g?.sallyReleased && rt.t >= (F.bankVoiceAt || 0)) {
      if (u.fleeing && !g.nagaFlee) {
        g.nagaFlee = true; F.bankVoiceAt = rt.t + 4;
        rt.army.play('soldier_flee', u.pos, .55);
      } else if (!u.fleeing && !g.routed && !g.nagaToki) {
        g.nagaToki = true; F.bankVoiceAt = rt.t + 4;
        rt.army.play('toki', u.pos, .65);
      }
    }
  }
}

let HOOD_UNIT = null;
const HOOD_MAT = new THREE.MeshLambertMaterial({ color: 0xd8d2bc, side: THREE.DoubleSide });
const BAMBOO_MAT = new THREE.MeshLambertMaterial({ color: 0x787249 });
const BLADE_MAT = new THREE.MeshLambertMaterial({ color: 0x858b89, side: THREE.DoubleSide });
// 顔は開け、頭から肩へ落ちる一枚の布にする。形は全員で共有する。
const hoodCap = new THREE.SphereGeometry(.17, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2);
hoodCap.scale(1, .55, .95); hoodCap.translate(0, 1.65, -.025);
const hoodDrape = new THREE.CylinderGeometry(.17, .21, .34, 10, 3, true, Math.PI / 2, Math.PI);
const hoodVerts = hoodDrape.attributes.position;
for (let i = 0; i < hoodVerts.count; i++) {
  const x = hoodVerts.getX(i), z = hoodVerts.getZ(i), down = (.17 - hoodVerts.getY(i)) / .34;
  const fold = 1 + .06 * down * Math.cos(Math.atan2(x, z) * 6);
  hoodVerts.setXYZ(i, x * fold, hoodVerts.getY(i) + 1.48, z * fold - .025);
}
hoodDrape.computeVertexNormals();
const HOOD_PARTS = [hoodCap, hoodDrape];
const HOOD_GEO = mergeGeometries(HOOD_PARTS, false);
for (const g of HOOD_PARTS) g.dispose();
// 門徒の得物と裹頭は兵の材質（頂点の色）の形にして、兵の束（Army.batchDraw）で描く（一人一、二回ずつ描いていた）
function monToWeapon(kind) {
  const root = new THREE.Group(), length = kind === 2 ? .65 : 2.4;
  const shaft = new THREE.CylinderGeometry(.018, .026, length, 6);
  shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, length / 2 - .2);
  const parts = [];
  if (kind === 0) {
    const joint = new THREE.TorusGeometry(.027, .006, 3, 6); joint.rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(.025, .25, 4); tip.rotateX(Math.PI / 2); tip.translate(0, 0, length - .1);
    parts.push(P(shaft.toNonIndexed(), 0x787249, { mk: MK.wood }));
    for (let i = 0; i < 6; i++) parts.push(P(joint.clone().translate(0, 0, i * .36).toNonIndexed(), 0x787249, { mk: MK.wood }));
    parts.push(P(tip.toNonIndexed(), 0x787249, { mk: MK.wood }));
  } else {
    const shape = new THREE.Shape();
    if (kind === 2) { shape.moveTo(0, 0); shape.lineTo(.36, -.04); shape.quadraticCurveTo(.27, .08, 0, .08); }
    else { shape.moveTo(0, 0); shape.lineTo(.045, .35); shape.quadraticCurveTo(.16, .62, .11, .68); shape.quadraticCurveTo(.025, .49, -.035, .1); }
    const blade = new THREE.ShapeGeometry(shape, 5); blade.rotateX(Math.PI / 2); blade.translate(0, 0, length - .2);
    // 刃は薄い板なので、裏の面も足す（兵の材質は片面）
    const back = blade.clone(); back.scale(1, -1, 1); const bi = back.index.array; for (let i = 0; i < bi.length; i += 3) { const t = bi[i]; bi[i] = bi[i + 1]; bi[i + 1] = t; }
    back.computeVertexNormals();
    parts.push(P(shaft.toNonIndexed(), 0x5a4632, { mk: MK.wood }), P(blade.toNonIndexed(), 0x858b89, { mk: MK.iron }), P(back.toNonIndexed(), 0x858b89, { mk: MK.iron }));
  }
  root.add(new THREE.Mesh(mergeGeometries(parts, false), MAT));
  return root;
}
const MONTO_WEAPONS = [monToWeapon(0), monToWeapon(1), monToWeapon(2)];
function dressMonTo(g) {
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i], kind = i % 5;
    if (kind === 0 || kind === 1) u.head.add(new THREE.Mesh(HOOD_UNIT || (HOOD_UNIT = P(HOOD_GEO.clone().toNonIndexed(), 0xd8d2bc, { mk: MK.cloth })), MAT));
    if (u.wpn && kind < 3) {
      // 共通の構えと当たりは槍・刀のまま、描く武器だけをこの戦で替える。
      u.wpn.geometry = EMPTY_WEAPON; u.wpn.material = WOOD; u.wpn.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; u.wpn.userData.lod = null; u.wpn.userData.flex = null;
      for (const child of u.wpn.children) child.visible = false;
      u.wpn.material = NO_DRAW;   // 空の形を一人一回ずつ描かない（子の竹槍・薙刀は描く）
      u.wpn.add(MONTO_WEAPONS[kind].clone());
    }
  }
}
const EMPTY_WEAPON = new THREE.BufferGeometry();
const NO_DRAW = new THREE.MeshBasicMaterial({ visible: false });
EMPTY_WEAPON.setAttribute('position', new THREE.Float32BufferAttribute([], 3));

// 九艘・各五人を開戦時から置く。乗船中だけ舟に固定し、岸へ着いた同じ兵が反撃する。
function retreatBoats(rt) {
  const F = rt.flags;
  F.boats = []; F.last = [];
  for (let k = 0; k < 3; k++) {
    // 九艘と四十五人は保ち、着岸口を柵前へ寄せる。西の先陣も味方の槍が届く所で受ける。
    const frontX = (k - 1) * 12;
    const g = enemyGroup(rt, { fixed: true, faction: 'ikko', name: '退城した門徒',
      anchor: { x: frontX, z: -44 }, facing: 0, formation: 'column', colW: 3,
      order: 'hold', aggro: 0, seekRange: 0, morale: 60, noRout: true, fire: false, historicalOrders: true,
      fleeDir: { x: k === 0 ? -1 : 1, z: 0.4 } },
      // 刀で斬り込む強さは保つが、鎧のない門徒の体力は足軽と同じにする。
      dress(Array.from({ length: 15 }, (_, i) => ({ type: 'samurai', n: 1, o: { hp: 30, maxHp: 30, ...(k === 2 && i === 0 ? { name: '門徒の指揮役', flagScale: 1.8 } : {}), kosode: i % 5 < 3 ? 1 : 0, kosodeCol: [0x34332e, 0x484339, 0x292c2b][i % 3], cloth: 0x34332e, hat: i % 5 === 3 ? 'jingasa' : 'hachimaki', flag: k === 2 && i === 0 || i % 5 === 4 ? 'namu' : null, weapon: i % 5 === 2 ? 'sword' : 'spear', spear: 'su', horse: false, sode: false, kote: 0, menpo: 0 } })), IKKO));
    F.last.push(g);
    if (k === 2) { F.sallyBoss = g.units[0]; g.leader = F.sallyBoss; }
    dressMonTo(g);
    for (let j = 0; j < 3; j++) {
      const x = frontX + (j - 1) * 4, z = -42;
      const m = riverBoat(x, waterHeight(rt.world, x, z), z, 0, true);
      const pole = new THREE.Mesh(POLE_GEO, WOOD); pole.position.set(.55, 1.3, -2); m.add(pole);
      const shadow = new THREE.Mesh(BOAT_SHADOW_GEO, BOAT_SHADOW_MAT); shadow.scale.set(1.1, 1, 3.4); rt.scene.add(shadow);
      const bt = { m, pole, shadow, x, z, group: g, second: k === 2, landed: false, passengers: [], hull: [], holes: 0, flood: 0, breath: 0 };
      // 舷の線だけ矢玉を止める。船内を箱でふさいで乗員を守らない。
      for (const side of [-1, 1]) {
        const h = solidSeg(x + side * .72, z - 2.8, x + side * .72, z + 2.8, .05);
        h.naka = -1; h.missileType = 'wood'; h.boat = bt; bt.hull.push(h);
      }
      for (let i = 0; i < 5; i++) {
        const u = g.units[j * 5 + i];
        const at = { x: x + (i % 2 ? 0.3 : -0.3), y: m.position.y + .1, z: z - 2 + i * 0.9 };
        u.perch = at; u.pinT = Infinity; u.noTarget = true; u._crouch = true;
        const q = { u, at, dx: at.x - x, dz: at.z - z, seatZ: at.z - z, aboard: true, escape: false, shore: { x, z: BANK_Z - 3 }, returnDir: { x: 0, z: 1 } };
        u.retreatBoat = bt; u.boatSeat = q; bt.passengers.push(q);
      }
      rt.scene.add(m); F.boats.push(bt);
    }
  }
}
function nearTroops(rt, g) {
  const p = rt.player.u.pos;
  for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 35 && sightUnit(rt, u)) return true;
  return false;
}
function boatTick(rt, dt) {
  const F = rt.flags;
  for (const bt of F.boats) {
    const prevX = bt.x, prevZ = bt.z;
    let pilot = null, aboard = 0, escaping = false;
    for (const q of bt.passengers) {
      const u = q.u;
      // 敗走の共通処理は近い敵から離れるため、川へ走り出すことがある。
      // 岸で舟の前へ回ってから乗り直す。舟を失った者は岸沿いに退く。
      // 向きの入れ物は乗船時に用意し、位置や足運びは共通処理に任せる。
      if (!q.aboard && u.alive && u.fleeing && !u.woundOut && !u.rearWound) {
        const dir = q.returnDir;
        if (bt.landed && bt.z >= -21 && bt.flood < .2) {
          dir.x = bt.x - u.pos.x;
          dir.z = (Math.abs(dir.x) > 2 ? Math.max(BANK_Z + 2, u.pos.z) : BANK_Z - 3) - u.pos.z;
        } else {
          dir.x = bt.x < 0 ? -1 : 1;
          dir.z = Math.max(.6, BANK_Z + 3 - u.pos.z);
        }
        const length = Math.hypot(dir.x, dir.z) || 1;
        dir.x /= length; dir.z /= length;
        u.moraleFleeDir = dir;
      }
      // 岸で退いた同じ兵が、空いた元の舟へ戻る。泳いで分流を越えさせない。
      if (!q.aboard && u.alive && u.fleeing && !u.woundOut && !u.rearWound && bt.landed && bt.z >= -21 && bt.flood < .2 &&
          Math.hypot(u.pos.x - bt.x, u.pos.z - (BANK_Z - 3)) < 3) {
        q.aboard = q.escape = true; q.dz = 2.7; u.perch = q.at; u.pinT = Infinity; u.fleeing = false;
        if (u.moraleFleeDir === q.returnDir) u.moraleFleeDir = null;
      }
      if (!q.aboard) continue;
      // 舟上で隊が崩れた者も退く。下の乗船姿勢で fleeing を戻しても、退城へ戻った覚えは残す。
      if (u.alive && (u.fleeing || bt.group.routed)) q.escape = true;
      if (u.alive && !u.woundOut && !u.rearWound) { aboard++; if (!pilot) pilot = q; }
      if (q.escape && u.alive) escaping = true;
    }
    // 同じ舟に残る者も一緒に退く。退く舟の同乗者を、岸へ寄せる敵に数え続けない。
    if (escaping) for (const q of bt.passengers) if (q.aboard) q.escape = true;
    if (F.step >= 2 && (!bt.second || F.rearBoatAt != null) && !bt.landed && pilot && !escaping && bt.flood < .4) bt.z = Math.min(-21, bt.z + dt * 1.5);
    // 漕ぎ手を失った舟・退く舟は川筋へ戻り、流れに沿う。流向と速さは復元の目安。
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z > CH_Z) bt.z = Math.max(CH_Z, bt.z - dt * .65);
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z <= CH_Z) bt.x += dt * .45;
    bt.flood = Math.min(1.6, bt.flood + bt.holes * .0015 * dt);
    const water = waterHeight(rt.world, bt.x, bt.z), bed = rt.world.heightAt(bt.x, bt.z);
    bt.m.position.set(bt.x, Math.max(bed, water - bt.flood), bt.z);
    if (F.step < 2) bt.m.position.x += Math.sin(rt.t * .22 + bt.x) * .7;
    bt.shadow.position.set(bt.m.position.x, water + .025, bt.z); bt.shadow.visible = !bt.landed && bt.flood < .8;
    bt.m.rotation.z = Math.min(.3, bt.flood * .2) + Math.sin(rt.t * 1.7 + bt.x) * .025;
    bt.pole.visible = !!pilot && bt.flood < .4 && !bt.landed;
    bt.pole.rotation.x = .35 + Math.sin(rt.t * 2.4) * .4;
    // 実際に棹で進む舟からだけ鳴らす。全舟で間隔を共有し、音を重ねすぎない。
    if (!F.ending && bt.pole.visible && (bt.x !== prevX || bt.z !== prevZ) && rt.t >= (F.poleSoundAt ?? 0)) {
      F.poleSoundAt = rt.t + 3;
      rt.army.play('boatPole', bt.m.position, .65);
    }
    for (let i = 0; i < bt.hull.length; i++) {
      const h = bt.hull[i], x = bt.m.position.x + (i ? .72 : -.72);
      h.ax = h.bx = x; h.az = bt.z - 2.8; h.bz = bt.z + 2.8;
      h.x0 = x - .05; h.x1 = x + .05; h.z0 = h.az - .05; h.z1 = h.bz + .05;
      h.yBot = bt.m.position.y; h.yTop = h.yBot + .5;
    }
    for (const q of bt.passengers) {
      const u = q.u;
      if (!q.aboard || u.gone) continue;
      const previousZ = q.dz;
      // 退く者は船首から元の席へ進む。五人を同じ船首の一点に留めない。
      if (q.escape && u.alive && !u.woundOut && !u.rearWound) q.dz = Math.max(q.seatZ, q.dz - dt * 1.2);
      if (u.alive && !u.woundOut && !q.escape && bt.z >= -21 && bt.group.sallyReleased && !u.shoreWaiting) q.dz = Math.min(4, q.dz + dt * 1.2);
      // 細くなる船首では中央へ寄る。舟の傾きに足を合わせ、岸へは高さを続けて移す。
      const landing = !q.escape && bt.landed ? Math.max(0, Math.min(1, (q.dz - 2.5) / 1.5)) : 0;
      // 船首では中央へ寄り、岸へ降りる時は元の左右へ足場を開く。一点で兵の胴を重ねない。
      const dx = q.dx * Math.max(landing, 1 - (Math.max(0, q.dz) / 3.25) ** 2, 0), roll = bt.m.rotation.z;
      q.at.x = bt.m.position.x + dx * Math.cos(roll) - .1 * Math.sin(roll); q.at.z = bt.z + q.dz;
      const deckY = bt.m.position.y + dx * Math.sin(roll) + .1 * Math.cos(roll);
      const groundY = landing > 0 ? rt.world.heightAt(q.at.x, q.at.z) : deckY;
      q.at.y = Math.max(groundY, deckY + (groundY - deckY) * landing);
      if (u.alive) {
        // 射撃後の反撃では、着岸した舟の上でも刀・槍を使える。
        const fighting = bt.group.sallyReleased && bt.landed && !q.escape && !u.shoreWaiting;
        u.perch = q.at; u.pinT = fighting ? 0 : Infinity; u.fleeing = false; u._crouch = !fighting && q !== pilot;
        if (fighting && u.wpn) u.wpn.visible = true;
      }
      u.pos.set(q.at.x, q.at.y, q.at.z);
      if (u.alive) {
        u.moving = dt > 0 ? Math.abs(q.dz - previousZ) / dt : 0; u.vel.x = u.vel.z = 0;
        // 舟に固定した位置は保ち、上陸中だけ足を交互に運ぶ。操船中は足踏みしない。
        if (u.moving > 0 && !u.hit && !u.downed && u.legL && u.legR) {
          const step = Math.sin(rt.t * 7 + u.id) * .38;
          u.legL.rotation.x = step; u.legR.rotation.x = -step;
          if (u.shinL && u.shinR) { u.shinL.rotation.x = Math.max(0, -step); u.shinR.rotation.x = Math.max(0, step); }
        }
      }
      // 遺体も甲板と一緒に運ぶ。共通の倒れる姿勢は保つ。
      u.mesh.position.x = u.pos.x; u.mesh.position.z = u.pos.z; u.mesh.position.y = u.pos.y - (u.alive ? 0 : .1);
      if (u.alive && q.at.z >= BANK_Z - 3 && !q.escape) {
        q.aboard = false; u.perch = null; u.pinT = 0; u._crouch = false;
        if (u.wpn) u.wpn.visible = true;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        u.mesh.position.y = u.pos.y;
      }
      // 舷が沈み、足も届かない場合だけ息が続かなくなる。浅い水では溺死させない。
      if (u.alive && bt.flood > .8 && water - bed > 1.6) {
        q.breath = (q.breath || 0) + dt;
        if (q.breath > 20) rt.army.kill(u, null);
      } else q.breath = 0;
      if (q.escape && Math.abs(bt.x) > 170 && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 100 && !sightPoint(rt, u.pos)) {
        rt.army.despawn(u); q.aboard = false;
      }
    }
    if (bt.z >= -21) bt.landed = true;
    // 操船中だけ両手を棹へ向ける。上陸後の刀の構えを上書きしない。
    if (pilot && bt.pole.visible) {
      const u = pilot.u;
      bt.pole.position.set(pilot.dx + .4, 1.3, pilot.dz + .35);
      if (u.hand) { u.hand.position.set(.4, 1.1, .35); u.hand.rotation.set(-bt.pole.rotation.x, 0, 0); poseArms(u, rt.t); }
      if (u.wpn) u.wpn.visible = false;
    }
  }
}

// 杭・横木・縄は準備時に作る。三つの短い区間を順に結い、完成形を一度に出さない。
const WORK_POST = new THREE.CylinderGeometry(.12, .14, 1.8, 9);
const WORK_RAIL = new THREE.CylinderGeometry(.09, .1, 1, 7);
WORK_RAIL.rotateZ(Math.PI / 2);
// 木肌の絵へ暗い茶色を二重に掛けず、乾いた横木と削り口の明るさを残す。
WORK_RAIL.setAttribute('color', new THREE.BufferAttribute(new Float32Array(WORK_RAIL.attributes.position.count * 3).fill(.65), 3));
const postVerts = WORK_POST.attributes.position;
for (let i=0;i<postVerts.count;i++) if (postVerts.getY(i) > .7) postVerts.setY(i, postVerts.getY(i) + postVerts.getX(i)*1.3);
WORK_POST.computeVertexNormals();
const BARK = new THREE.MeshLambertMaterial({ color: 0x9b907b });
const WORK_WOOD_V = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const BARK_LINE = new THREE.CylinderGeometry(.009,.015,1,4);
const BARK_KNOT = new THREE.TorusGeometry(.04,.012,4,7);
const WORK_ROPE = new THREE.CylinderGeometry(.16, .16, .1, 6, 1, true);
function workFence(W, seg) {
  const m = new THREE.Group(), rails = [], posts = [], bark = [], len = seg[2] - seg[0];
  // 地面の横木を後で持ち上げる。静止物へ結合すると、古い位置の材が残ることがある。
  m.userData.noFreeze = true; m.userData.noMerge = true;
  // 岸の仮柵は目より低くし、杭の間から舟を見張れるようにする。守りの当たりと強さは保つ。
  const spacing = .9, count = Math.floor((len + .01) / spacing) + 1;
  const knots = new THREE.InstancedMesh(WORK_ROPE, ROPE, count * 6), at = new THREE.Object3D();
  let n = 0;
  for (let x = seg[0]; x <= seg[2] + .01; x += spacing) {
    const y = W.heightAt(x, seg[1]), tilt = Math.sin(x * 3.7) * .07;
    const post = WORK_POST.clone(); const thick = .8 + .25 * (1 + Math.sin(x * 4.3));
    const postHeight = .92 + .08 * Math.sin(x * 2.1), postY = y + .9 * postHeight - .18;
    // 背の低い杭も根元を土へ打ち込む。縮めた後に同じ高さへ置くと宙に浮く。
    post.scale(thick, postHeight, thick);
    post.rotateY(x*2.3);
    for (let j=0;j<5;j++) {
      const angle = j*Math.PI*2/5+x, g = BARK_LINE.clone();
      g.scale(1,.9+.35*Math.sin(x+j),1); g.translate(Math.cos(angle)*.13*thick,.15*Math.sin(x+j),Math.sin(angle)*.13*thick);
      g.rotateZ(tilt); g.translate(x,postY,seg[1]); bark.push(g);
    }
    const knot = BARK_KNOT.clone(); knot.scale(1,1.5,1); knot.translate(0,.3*Math.sin(x),.14*thick);
    knot.rotateZ(tilt); knot.translate(x,postY,seg[1]); bark.push(knot);
    const split = ROOM_BOX.clone(); split.scale(.012,.24,.12); split.rotateZ(.25*Math.sin(x));
    split.translate(0,.73,0); split.rotateZ(tilt); split.translate(x,postY,seg[1]); bark.push(split);
    post.rotateZ(tilt); post.translate(x, postY, seg[1]); posts.push(post);
    for (const h of [.6, 1.25]) for (let turn = 0; turn < 3; turn++) {
      at.position.set(x - Math.sin(tilt) * h, y + h + turn * .06, seg[1]);
      at.rotation.set(0, 0, tilt + .1 * Math.sin(x)); at.scale.set(thick, .5, thick);
      at.updateMatrix(); knots.setMatrixAt(n++, at.matrix);
    }
  }
  BARK.map = woodTex();
  m.add(new THREE.Mesh(mergeGeometries(bark,false),BARK));
  for (const g of bark) g.dispose();
  const mudParts = [];
  for (let x = seg[0]; x <= seg[2]; x += .8) {
    const g = WORK_POST.clone(); g.scale(1.06, .1 + .06 * Math.abs(Math.sin(x * 4)), 1.06);
    g.rotateZ(Math.sin(x * 3.7) * .07); g.translate(x, W.heightAt(x, seg[1]) + .12, seg[1]); mudParts.push(g);
  }
  // 杭と根元の泥は同じ木の絵の材質なので、頂点の色で塗り分けて一つの形にする（描く回数を一つ減らす）
  const tintAll = (list, hex, cutHex = hex) => {
    const c = new THREE.Color(hex), cut = new THREE.Color(cutHex);
    for (const g of list) {
      const n = g.attributes.position.count, a = new Float32Array(n * 3), normal = g.attributes.normal;
      for (let i = 0; i < n; i++) (normal.getY(i) > .7 ? cut : c).toArray(a, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
  };
  tintAll(posts, 0xc3b69d, 0xe3d3ad); tintAll(mudParts, 0x82705a);
  { const mp = WOOD.map || woodTex(); if (WORK_WOOD_V.map !== mp) { WORK_WOOD_V.map = mp; WORK_WOOD_V.needsUpdate = true; } }
  m.add(new THREE.Mesh(mergeGeometries([...posts, ...mudParts], false), WORK_WOOD_V));
  for (const g of mudParts) g.dispose();
  for (const g of posts) g.dispose();
  knots.count = 0; knots.instanceMatrix.needsUpdate = true; m.add(knots);
  // 二本の横木は一つの束で描く（動かすのは今までどおり rail の位置・向き・長さ。fenceProgress が束へ写す）
  const railIM = new THREE.InstancedMesh(WORK_RAIL, WORK_WOOD_V, 2); m.add(railIM);
  for (const h of [.6, 1.25]) {
    const rail = new THREE.Object3D();
    const x = (seg[0] + seg[2]) / 2, looseZ = seg[1] + (h < 1 ? 1.3 : 1.8);
    // 横木の両端も地面に合わせる。長い材が盛り土へ埋もれないようにする。
    const leftY = W.heightAt(seg[0], looseZ), rightY = W.heightAt(seg[2], looseZ);
    const looseAngle = Math.atan2(rightY - leftY, len);
    const tiedDy = W.heightAt(seg[2], seg[1]) - W.heightAt(seg[0], seg[1]);
    rail.scale.x = Math.hypot(len, rightY - leftY); rail.rotation.z = looseAngle;
    rail.position.set(x, Math.max(W.heightAt(x, looseZ), (leftY + rightY) / 2) + .16, looseZ);
    rails.push({ mesh: rail, base: (W.heightAt(seg[0], seg[1]) + W.heightAt(seg[2], seg[1])) / 2,
      looseY: rail.position.y, looseZ, looseAngle, looseLen: rail.scale.x,
      tiedAngle: Math.atan2(tiedDy, len), tiedLen: Math.hypot(len, tiedDy), z: seg[1] + .2, h }); m.add(rail);
  }
  rails.forEach((r, i) => { r.mesh.updateMatrix(); railIM.setMatrixAt(i, r.mesh.matrix); });
  railIM.instanceMatrix.needsUpdate = true; railIM.computeBoundingSphere();
  m.userData.work = { rails, knots, count: n, railIM }; return m;
}
function canWorkBank(u) {
  // 対岸の射手を見ているだけで、横木の補修を止め続けない。打ち合う時と近い敵は優先する。
  if (!u?.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget || u.atk || u.stagger) return false;
  const target = u.target;
  return !target?.alive || Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) > 8;
}
function workHands(u, t) {
  if (!u?.hand || !canWorkBank(u)) return;
  if (u.workRope) u.workRope.visible = true;
  u.hand.position.set(.2, .85, .65); u.hand.rotation.set(-.25 + Math.sin(t * 3) * .12, 0, 0);
  poseArms(u, t); if (u.wpn) u.wpn.visible = false;
}
function fenceProgress(segs, t, duration) {
  const span = duration / segs.length;
  for (let i = 0; i < segs.length; i++) {
    const q = segs[i], k = Math.max(0, Math.min(1, (t - i * span) / span)), work = q.mesh.userData.work;
    // 結び終えた横木は動かない。完成後も毎コマ束と外周を計算し直さない。
    if (work.progress === k) continue;
    work.progress = k;
    for (const r of work.rails) {
      const lift = Math.min(1, k * 2);
      r.mesh.position.y = r.looseY + (r.base + r.h - r.looseY) * lift;
      r.mesh.position.z = r.looseZ + (r.z - r.looseZ) * lift;
      r.mesh.rotation.z = r.looseAngle + (r.tiedAngle - r.looseAngle) * lift;
      r.mesh.scale.x = r.looseLen + (r.tiedLen - r.looseLen) * lift;
    }
    if (work.railIM) { work.rails.forEach((r, j) => { r.mesh.updateMatrix(); work.railIM.setMatrixAt(j, r.mesh.matrix); }); work.railIM.instanceMatrix.needsUpdate = true; work.railIM.computeBoundingSphere(); }
    work.knots.count = Math.floor(work.count * Math.max(0, (k - .5) * 2));
    if (k >= 1) { q.wall = true; q.segR = .7; }
  }
}
// 報せは本陣から既存の使番の仕組みで運ぶ。届かなくても戦の段は止めない。
function bankNews(rt, text, detail) {
  if (!rt.player.u.alive || rt.flags.ending) return;
  sendOrder(rt, rt.flags.odaCamp.pos, rt.player.u, { id: '長島の報せ', apply: () => {
    if (rt.flags.ending) return;
    const delivered = rt._deliveredNotice; rt._deliveredNotice = true;
    try { rt.say('伝令', text, 4); } finally { rt._deliveredNotice = delivered; }
    battleEvent(rt, EVENT_MESSENGER, rt.player.u.pos, null, 0, true, detail);
  } }, { team: 0, faction: 'oda', name: '岸への伝令' });
}

// 関船と小早。開いた舷・反った船首・櫓・帆柱・筵屋根を共用する。
const SHIP_MODELS = [new THREE.Group(), new THREE.Group()];
for (let kind = 0; kind < 2; kind++) {
  const model = SHIP_MODELS[kind], bags = Array.from({length:6},()=>[]), length = kind ? 10 : 17, width = kind ? 2.8 : 4.8;
  const part = (bag, x, y, z, w, h, d, rx = 0, rz = 0) => {
    const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); bags[bag].push(g);
  };
  const widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / (length / 2)) ** 2);
  buildBoatHull(bags, length, width, .65, .85);
  for (const side of [-1, 1]) for (let n = 0; n < (kind ? 4 : 7); n++) {
    const z = -length * .32 + n * 1.4;
    part(1, side * (widthAt(z) + .65), 1.1, z, 2.6, .075, .09, 0, side * -.18);
    part(1, side * (widthAt(z) + 1.8), .8, z, .7, .08, .26, 0, side * -.35);
  }
  part(1, 0, 3, .8, .13, 5.1, .13);
  for (const side of [-1, 1]) for (const z of [-2, .3]) part(1, side * width * .33, 2.2, z, .1, 2.5, .1);
  for (const side of [-1, 1]) {
    part(2, side * width * .18, 3.5, -.85, width * .43, .16, 3.2, 0, side * -.22);
    for (let n = 0; n < 9; n++) part(1, side * width * .18, 3.57, -2.25 + n * .35, width * .44, .035, .035, 0, side * -.22);
  }
  finishBoat(model, bags);
}
function ataka(small = false) { return SHIP_MODELS[small ? 1 : 0].clone(); }

// 数百艘の水軍の一部を遠景で示す。形と材質は既存の小型船を共用し、行列は開戦時だけ作る。
// 三重県史「信長の伊勢攻略と長島一向一揆」。艘数と間隔は局地の復元で、総艘数ではない。
function blockadeFleet(rt) {
  const at = new THREE.Object3D();
  for (const part of SHIP_MODELS[1].children) {
    if (!part.isMesh || part.material === FOAM) continue;
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, 20);
    mesh.receiveShadow = true;
    for (let i = 0; i < 20; i++) {
      const east = i < 10, n = i % 10;
      const x = east ? 184 + (n % 5) * 12 : -184 - (n % 5) * 12;
      const centerZ = east ? CH_Z - 2 + (x - 100) * 8 / 140 : CH_Z + (-x - 100) * 4 / 140;
      const z = centerZ + (Math.floor(n / 5) - .5) * 8;
      at.position.set(x, waterHeight(rt.world, x, z) - .45, z);
      at.rotation.set(0, east ? -Math.PI / 2 : Math.PI / 2, 0);
      at.updateMatrix(); mesh.setMatrixAt(i, at.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    rt.scene.add(mesh);
  }
}

// 濃尾平野の河口を山の輪で囲まず、西の養老・鈴鹿側に遠い稜線を残す。
// 国土交通省の木曽川水系の地形を参考にした方角の復元。頂点数・材質・画質は変えない。
function deltaSkyline(W) {
  for (const mountain of W.mountains.children) {
    const p = mountain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const west = -p.getX(i) / Math.hypot(p.getX(i), p.getZ(i));
      const ridge = Math.max(0, Math.min(1, (west - .15) / .55));
      p.setY(i, -12 + (p.getY(i) + 12) * ridge);
    }
    p.needsUpdate = true;
    mountain.geometry.computeVertexNormals();
    mountain.geometry.computeBoundingSphere();
  }
}

function dangerWarning(rt) {
  const F = rt.flags;
  if (F.dangerAt != null || F.ending || !rt.player.u.alive) return;
  F.dangerAt = rt.t;
  rt.obj('main', '危ない！　槍組の後ろへ下がれ', 'main');
  rt.say('柴田勝家', '岸の守りが薄い！　槍組を回す。敵に向き直り、味方の後ろへ下がれ', 4);
  rt.marker('retreat', { x: 24, z: BANK_Z + 16 }, '槍組の後ろへ下がる', { guideArea: 'retreat', guideRadius: 3 });
  const g = F.relief;
  if (g) {
    g.noAI = false; g.order = 'path'; g.pathIdx = 0; g.aggro = 10;
    g.path = [[24, BANK_Z + 16], [24, BANK_Z + 6]];
    g.onArrive = q => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; };
    for (const u of g.units) u.noTarget = false;
  }
}
function dangerProgress(rt) {
  const F = rt.flags;
  return F.dangerAt != null && rt.t - F.dangerAt < 15;
}

// 二砦の外を一周囲む。南岸の持ち場と川筋の動線は空ける。
function surroundForts(rt, close = true) {
  const F = rt.flags, batch = makeKitBatch();
  const add = pts => {
    const segs = wallLine(rt, pts, { team: 0, hp: 1e9, name: '包囲の柵', segLen: 10, meshOpt: { batch, mound: false } });
    for (const s of segs) { s.noTarget = true; s.wall = true; s.fireProof = true; }
    F.enclosure.push(...segs);
  };
  if (!F.enclosure) {
    F.enclosure = [];
    // 水路を横切らず陸上に囲む。木戸への通り口は、最後の包囲の下知までは残す。
    add([[-3, -49], [-34, -49], [-34, -108], [31, -108], [31, -49], [3, -49]]);
    add([[45, -52], [35, -52], [35, -103], [70, -103], [70, -52], [51, -52]]);
  }
  if (close) F.closeOrdered = true;
  finalizeKitBatch(rt, batch);
}

// 川筋は使い回し、画質を切り替えても前の戦の水路を持ち越さない。
const RIVER_STREAMS = [
  { pts: [[-240, CH_Z + 4], [-100, CH_Z], [0, CH_Z], [100, CH_Z - 2], [240, CH_Z + 6]], w: 16, depth: 1.1 },
  // 中央の泥道と柵の持ち場は空け、脇だけ浅い水路と水たまりにする。
  { pts: [[-14, 24], [-12, 8], [-14, -2]], w: 1.4, depth: .3 },
  { pts: [[14, 24], [12, 8], [14, -2]], w: 1.4, depth: .3 },
  { pts: [[-20, 3], [-24, 4]], w: 2, depth: .3 },
  { pts: [[19, 12], [24, 14]], w: 2, depth: .3 },
  { pts: [[-240, -136], [-60, -132], [60, -134], [240, -130]], w: 10, depth: 1.8 },
  { pts: [[-58, CH_Z], [-66, -74], [-60, -132]], w: 9, depth: 1.8 },
  { pts: [[82, CH_Z - 2], [84, -74], [82, -134]], w: 9, depth: 1.8 },
  { pts: [[33, -40], [33, -76], [34, -114]], w: 2.5, depth: 0.9 },
  // 長島城は川を堀にする。東の分流と北の川筋をつなぎ、輪中の上に置く。
  { pts: [[84, -58], [110, -57], [136, -58], [138, -96], [136, -132]], w: 5, depth: 1.4 },
];
// 寺の北裏の町堀。住民は地形の高さを歩くため、路地には七メートル幅の土橋を残す。
// 掘り下げは水面幅の二倍まで届く。左右の掘り際からも退路を離す。
const TOWN_STREAMS = [...RIVER_STREAMS,
  { pts: [[-62, -112], [-52, -112]], w: 1.2, depth: .8 },
  { pts: [[-45, -112], [-37, -112]], w: 1.2, depth: .8 },
];

const nagashima = {
  // 稲生と同じ共通表示へ。段の丸・補足・空振り音・自分の足元の輪を省く。
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|降伏|火/.test(text),
  missions: ['横木を直せ', '舟を見張れ', '柵の手前を守れ', 'この敵をたおせ', '東の柵を確かめよ', '対岸を見よ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending) return 5;
    if (F.step <= 1) return !rt.G.lord && !F.participated && !F.helped && bankWorkSpot(rt) ? 0 : 1;
    if (F.step < 3) return F.step === 2 ? 2 : 1;
    const foe = bankNearestFoe(rt);
    if (dangerProgress(rt) || F.broken && F.step === 3) return 2;
    if (F.step === 3.5) {
      // 遠い敵は味方が受ける。本人を攻める敵がなければ次の縄を先に案内する。
      if ((F.finalChecked || 0) < 3 && !bankCheckThreat(rt)) return 4;
      return foe ? 3 : 1;
    }
    return foe ? 3 : 2;
  },
  missionHeading(rt) {
    const F = rt.flags, stage = this.missionOf(rt), p = rt.player.u.pos;
    if (F.ending) return F.failureReason ? '持ち場を守れなかった' : '対岸を見よ';
    if (dangerProgress(rt)) return '味方の後ろへ下がれ';
    if (stage === 0) {
      const q = bankWorkSpot(rt);
      return q && Math.hypot(p.x - q.x, p.z - q.z) >= 3 ? '横木の印へ' : '「縄を締める」を長押し';
    }
    if (stage === 4) {
      const q = CHECK_SPOTS[F.finalChecks.indexOf(false)];
      return q && Math.hypot(p.x - q.x, p.z - q.z) >= 3 ? '東の柵の印へ' : '縄を確かめよ';
    }
    if (stage === 1) return watchingRiver(rt) ? '舟を見張れ' : '川を向いて見張れ';
    if (stage === 3 && this.commanderTarget(rt)) return '門徒の指揮役をたおせ';
    return this.missions[stage];
  },
  missionSignTarget(rt) { return this.missionOf(rt) === 3 ? bankNearestFoe(rt) : null; },
  // 指揮官の実名は不明。後続の既存の一人を指揮役とする遊び上の復元。
  commanderSignTarget(rt) {
    const u = rt.flags.sallyBoss;
    return !rt.flags.ending && bankGuideFoe(rt, u) ? u : null;
  },
  commanderTarget(rt) {
    const u = this.commanderSignTarget(rt);
    return u && this.missionOf(rt) === 3 && bankNearestFoe(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.bankPin || (F.bankPin = { x: 0, z: 0, r: 5, hide: 5 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false;
    q.always = true; q.silent = true; q.defend = false;
    const stage = this.missionOf(rt);
    let spot = null;
    if (dangerProgress(rt)) { q.x = 24; q.z = BANK_Z + 16; q.r = q.hide = 3; return q; }
    if (stage === 3) {
      const u = bankNearestFoe(rt);
      if (!u || rt.player.inRange && rt.player.rangeCueTarget === u) return null;
      q.x = u.pos.x; q.z = u.pos.z; q.unit = u; q.enemy = true; q.r = q.hide = 2;
      return q;
    }
    if (stage === 0) spot = bankWorkSpot(rt);
    else if (stage === 4) spot = CHECK_SPOTS[F.finalChecks.indexOf(false)];
    if (spot) { q.x = spot.x; q.z = spot.z; q.r = q.hide = 3; return q; }
    q.x = F.step === 3.5 || F.broken ? 24 : F.step === 1.25 ? SPOTS[nearestBankSpot(p)].x : 0;
    q.z = BANK_Z + (F.step === 3.5 ? 6 : 5); q.r = q.hide = 5;
    q.waiting = true; q.arrived = Math.hypot(p.x - q.x, p.z - q.z) < q.r;
    return q;
  },
  introTaskFirst: true, // 低い横画面でも、人物紹介より先に最初の仕事を見せる。
  introKeepControls: true, // 四秒長押しの説明を、開戦前の言い換えで落とさない。
  introPeopleFolded: true, // 人物紹介で下知を押し出さず、読みたい時に開く。
  introText: (rt) => rt.G.lord
    ? '岸の印で川を向き、舟を見張ろう。柵は味方が結う。川は渡らない。'
    : '横木の印で「縄を締める」を四秒長押し。その後は岸で舟を見張ろう。川は渡らない。',
  // 描画専用の民。兵の名簿・当たり・戦功には入れない。退避後も輪中内に残る。
  civilianCrowd: { bounds: { minX: -124, maxX: -34, minZ: -124, maxZ: -48 }, bands: PEOPLE_BANDS },
  noticeOnce: true, // 同じ下知を使番が言い直さない。
  noAllyReports: true, // 遠い勝家の声は運ばず、必要な報せは bankNews で届ける。
  noCouriers: true, // 下知は実際の使番が運ぶ。持ち場を往復する飾りの騎馬は重ねない。
  botOrders: true, // 柵作りと岸の守りを、砦への突進で上書きしない。
  // 退城舟の射撃を受けてから反撃する。待つ間に共通の小勢を岸へ足さない。
  frontlineDensity: false,
  // 敵が集まっても共通の退避で持ち場を離れず、岸の後ろへの退避と東への下知は専用の頭に任せる。
  botDefendsFort: true,
  // 横木の作業・見張り・目前の戦いを優先し、敵が離れてから証を納める。
  headBlocked(rt) {
    if (rt.flags.step !== 3 || rt.flags.ending) return true;
    const p = rt.player.u;
    for (const u of rt.army.units) {
      if (u.alive && u.team !== p.team && !u.civ && !u.isStruct && !u.fleeing &&
          Math.abs(u.pos.y - p.pos.y) < 2 && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6) return true;
    }
    return false;
  },
  taskDetails: false, // 任務の補足は畳み、右上を一行に保つ。
  keepCombatTask: true, // 構えの案内中も、持ち場と残り時間を隠さない。
  keepCombatTaskHeading: true,
  keepCombatTaskDetail: false,
  // 構える足元の輪を、守る柵の範囲と取り違えさせない。操作は釦で伝える。
  combatTaskLabel(rt) {
    const F = rt.flags;
    if (F.ending || F.broken || dangerProgress(rt) ||
        !rt.hud.defendEnemy?.alive || (F.step !== 3 && F.step !== 3.5)) return '';
    return F.step === 3.5 ? '東の柵で味方と守れ' : '柵の手前で味方と守れ';
  },
  guardLabel: (rt) => rt.flags.step === 3.5 ? '東の柵で味方と守れ' : '柵の手前で味方と守れ',
  guardStartText: '敵を向き、押して防ぐ',
  guardWaitText: '敵を向いて構えを保て',
  waitGuardButtonText: '押し続けて防ぐ',
  // 川側の敵へ進ませず、岸に上がって届く相手だけに戦い方を示す。
  meleeGuide(rt, enemy) {
    return !!enemy && !enemy.boatSeat?.aboard && enemy.pos.z >= BANK_Z &&
      !rt.army.wallBetween(rt.player.u.pos, -1, enemy.pos);
  },
  // 縄の務めや目前の戦いを、共通の柵の補修札で隠さない。
  // 反撃の合間と、東の縄を三つ確かめた後は、倒れた柵を直せる。
  fenceUseOK(rt) {
    const F = rt.flags, p = rt.player.u;
    if (F.ending || dangerProgress(rt) ||
        (F.step !== 3 && !(F.step === 3.5 && F.finalChecked >= 3 && F.finalFoes === 0))) return false;
    for (const u of rt.army.units) {
      if (u.team === p.team || !u.alive || u.isStruct || u.civ || u.fleeing || u.woundOut ||
          u.rearWound || u.gone || u.noTarget || u.boatSeat?.aboard || u.pos.z < BANK_Z) continue;
      if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6 &&
          !rt.army.wallBetween(p.pos, -1, u.pos)) return false;
    }
    return true;
  },
  keepTaskWithGuard: true, // 守る釦を押す間も、舟の見張りと柵の進みを残す。
  keepRescueTaskLabel: true, // 近い味方の盾で、岸の務めを「この人を守れ」に置き換えない。
  compactWaitGuard: true, // 携帯横の防御は端の決まった位置で押し、兵を覆わない。
  contextualCoach: true, // 敵のいない見張り中は突きの手ほどきを休め、舟を見る下知を残す。
  keepTaskLabel: true,
  persistentTaskNotice: true, // 操作の語や同文の再表示制限で、常設の任務を隠さない。
  keepTaskPanel: true, // 目前の敵の枠へ任務を移さず、岸を守る下知を残す。
  keepApproachTaskPanel: true,
  keepOpeningTaskLabel: true, // 指の動かし方だけで、最初の横木の行き先を消さない。
  keepDestinationTask: true,
  keepFlagTravelTask: true, // 行き先の距離で「岸を守れ」「横木を直せ」を上書きしない。
  hideGuideSteps: true, // 短い岸の持ち場は印で示し、任務の下へ別の「旗まで」を重ねない。
  avoidAllDestinationNotices: true, // 守る場所と旗の矢印も、任務札や知らせを避ける。
  avoidMarkerNotices: true,
  treatmentTaskGuidance: true,
  woundEffectMin: .05, // ごく浅い傷は部位だけを示し、退避の下知と混ぜず、止血・深手の知らせを残す。
  woundEffectText: (rt, slow) => slow ? '歩みが遅い' : '腕のけが',
  treatmentApproachLabel: '手当ての印へ下がれ',
  keepTaskWithDodge: true, // 回避の印が出ても、岸を守る下知と残り時間を残す。
  keepRetreatReason: true, // 退く行き先を「ここへ」に縮めず、味方の後ろへ下がる目的を残す。
  keepWoundRetreatReason: true, // 出血中も共通の「旗まで」に戻さず、手当てと退避先の案内を使う。
  distanceUnit: 'steps',
  namedGuideMarkers: true, // 横木・見張り場・東の柵を、行き先の印でも区別する。
  // 作業場と見張り場を、同じ「ここへ」の札にしない。
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.step <= 1) return '横木の所へ';
    if (F.step === 1.25 || F.step === 2) return '見張り場へ';
    if (F.step === 3.5) return F.finalChecked < 3 ? `${CHECK_NAMES[F.finalChecks.indexOf(false)]}へ` : '岸で舟を見張れ';
    return '岸の柵へ';
  },
  taskText(rt, text) {
    // 舟待ちと結末は、岸から動かず見る仕事。内陸を向いた時は向き直る下知を先に出す。
    const p = rt.player.u.pos;
    // 下知を更新する一秒の間も、目前の門徒から目を離す案内を出さない。
    if (!rt.flags.ending && (rt.flags.step === 3 || rt.flags.step === 3.5) && text.includes('見張れ')) {
      for (const u of rt.army.units) {
        if (u.team === rt.player.u.team || !u.alive || u.noTarget || u.gone || u.isStruct || u.civ ||
            u.fleeing || u.woundOut || u.rearWound || u.group?.routed) continue;
        if (Math.abs(u.pos.y - p.y) < 2 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 6 &&
            this.meleeGuide(rt, u)) return '近くの敵を味方と止めよ';
      }
    }
    // 守備後は体の向きより、実際に見ている方へ案内する。肩越しを回したまま煙を見落とさせない。
    if (text === '岸に残り、川の方を向け' || text === '岸に残り、川の向こうの煙を見よ') {
      if (!watchingRiver(rt)) return riverTurnText(rt);
      return text === '岸に残り、川の方を向け' ? '岸で対岸の下知を待て' : '岸から対岸の煙を見よ';
    }
    if ((text === '岸で川を向き、舟を見張れ' ||
        text === '岸で川を向き、味方と見張れ' || text === '東の柵で川を向き、舟を見張れ' ||
        text === '次の舟に備え、岸で川を見張れ') &&
        Math.abs(p.x) < 48 && p.z >= BANK_Z && p.z < BANK_Z + 28 &&
        !watchingRiver(rt)) return riverTurnText(rt);
    if (text === '横木の印へ進み、味方と直せ') return '横木の印へ進め';
    if (text === '足元の横木で「縄を締める」を長押し') return '印で「縄を締める」を長押し';
    if (text === '岸で川を向き、舟を見張れ' || text === '岸で川を向き、味方と見張れ') return '川を向いて見張れ';
    if (text === '東の柵で川を向き、舟を見張れ') return '東の柵で舟を見張れ';
    if (text === '退き太鼓の二つ打ち。東の柵へ移り、印で縄を確かめよ') return '東の柵で縄を確かめよ';
    if (text === '次の舟に備え、岸で川を見張れ') return '川を向き、次の舟を待て';
    if (text === '柵の手前で、味方と門徒を止めよ') return '柵の手前で敵を止めよ';
    return text;
  },
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    // 安全な所で手当てを始められるなら、別の印へ歩かせない。
    if (p.treatmentReady) return p.treating ? '手当てを押し続けよ' : '「手当て」を三秒長押し';
    if (cue?.valid && Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '手当ての印へ下がれ';
    if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return cue?.valid ? '止まり、手当ての支度を待て' : '味方の後ろへ下がれ';
  },
  retreatGuideLabel(rt, reached) {
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) return this.treatmentGuideLabel(rt, cue);
    return reached ? rt.player.sta < 20 ? 'ここで休め' : 'ここで構えよ' : '味方の後ろへ';
  },
  taskDetail(rt, title, detail) {
    const cue = rt.hud.retreatGuide;
    if (!rt.flags.ending && cue?.active && cue.valid && cue.treatment) {
      const reason = rt.player.u.wounds?.bleed > .0001 ? '血が出ている。味方の後ろで傷を縛れ' : '傷が重い。味方の後ろで手当てせよ';
      return detail ? `${reason}\n${detail}` : reason;
    }
    // 退く理由と岸の務めを一緒に残す。軽い被弾だけで深手とは呼ばない。
    if (title !== '味方の後ろへ' && title !== 'ここで休め' && title !== 'ここで構えよ') return detail;
    const reason = rt.player.sta < 20 ? '息切れ。列の後ろで休め'
      : rt.player.u.hp < rt.player.u.maxHp * .3 ? '深手。敵を向いて下がれ'
        : rt.player.u.mobbed ? '囲まれる。列へ下がれ'
          : title === 'ここで構えよ' ? '敵を向き、味方と受けよ' : '敵を向き、構えて下がれ';
    // 退く理由と残り時間を別の行に置く。短い横画面で秒数だけを折り返さない。
    return detail ? `${reason}\n${detail}` : reason;
  },
  spacedCombatCues: true, // 間合いと気力を兵の顔・行き先の印から離す。
  nearSpearBatchRadius: 18, // 肩越しで隠した近い槍を、遠景用の別の束へ残さない。
  hidePlayerSign: true, // 肩越しで本人から離れて見える白輪を、行き先と取り違えさせない。
  noUnitContrast: true, // 柵越しの兵から浮いて見える白い人型を消す。敵味方の頭上の印は残す。
  compactDestinationSign: true, // 東の柵への矢印を小さくし、近い兵の顔と胴を隠さない。
  groundFlagGuides: true, // 守備中も大きな交差した刀を縮め、持ち場の印は地面の小旗へそろえる。
  compactHoldGuide: true, // 遠い待機場所の輪を広げず、小旗で岸の位置を示す。
  compactRetreatSign: true, // 退避の旗は別の指定。携帯で大きな旗と二本の矢印を兵に重ねない。
  singleRetreatArrow: true, // 足元の短い矢印一本で退く向きを示し、兵を横切る列を描かない。
  retreatLinkLength: 148, // 一本にする指定だけでは長さは変わらない。退き先が画面端でも足元へ収める。
  retreatArrowLength: 72,
  compactRetreatArea: true, // 近い退き先も小さい足元の輪で示す。
  // 強調される守備の輪は compactFloorGuides を通らない。既存の足元の印へそろえる。
  smallTaskAreas: true,
  smallRetreatAreas: true,
  taskAreaFootRing: true,
  compactGuardGuide: true, // 守る味方の盾も小さくし、岸の兵と舟を見せる。
  singleDestinationArrow: true, // 行き先を指す一本にまとめ、逆向きの道案内を重ねない。
  enemyCornerSign: true, // 敵の囲みを描く処理が読む指定。四隅だけで顔と打ち込みを空ける。
  enemyFootRingRadius: .4, // 岸の敵の足元だけを示し、横木や隣の兵まで白輪で囲まない。
  positionPersonGuide: true, // 描画前の古い頭の骨と現在の足元を混ぜず、動く敵の今いる所へ印を付ける。
  personFrameAtPosition: true, // 囲みの測定にも現在地を使い、頭上の名札と別の兵を指さない。
  bodyHeightGuides: true, // 門徒と甲冑の兵それぞれの背丈で測り、頭の上に空の枠を伸ばさない。
  compactCombatGuides: true, // 狙っていない周囲の兵まで枠で囲まない。
  releaseGuardForAttack: true, // 敵の打ち終わりには、防ぐ長押しから反撃へ渡す。
  compactFloorGuides: true, // 近い退き先の輪は細い点線とし、画面を埋める大きさでは描かない。
  goalFlagScale: .6, // 岸の案内旗を兵より大きく描かず、舟と槍の見通しを残す。
  // 視点へ入り込む味方は全身を描く間だけ避け、笠・顔・胴の透けが重なるのを防ぐ。
  nearAllyFadeRadius: 2.2, // 肩越しに入る味方の胴・母衣も、近い一人の全身と一緒に避ける。
  nearAllySolidBody: true,
  nearAllyWholeOcclusion: true, // 本人との間に入った味方にも全身の扱いを通し、胴の中を見せない。
  nearHatFadeRadius: 0, // 笠だけ透かして首布や隣の顔を浮かせず、体と一緒に扱う。
  nearSpearFade: false, // 周囲の槍をまとめて縮めず、共通の遮蔽判定で視線を空ける。
  nearSpearBatchRadius: 18, // 持ち主と一緒に避けた近い槍を、更新中の別の束へ残さない。
  // 肩越しへ差し込む長柄と隊旗の竿は、描く間だけ既存の処理で避ける。
  nearLongWeaponRadius: 10, // 持ち主が離れていても、岸へ横たわる長柄が肩越しへ届く範囲を拾う。
  nearGroundSpearRadius: 12,
  nearGroundSpearClearance: 3, // 低い横画面で肩越しの視線より下を横切る落ち槍も、描く間だけ避ける。
  nearFlagFadeRadius: 6, // 横から画面へ入る隊旗も、既存の描画時の判定で避ける。
  standardClothScale: .75, // 狭い岸の隊旗は布を控えめにし、隣の兵と舟を見渡せるようにする。
  nearThreatWarning: true,
  nearThreatRange: 6, // 味方が離れて受ける敵には、手元の作業をやめる警告を出さない。
  actionableThreats: true,
  compactThreats: true, // 携帯では方向と防ぎ方を短い一枚で示す。
  avoidWaymarkThreats: true,
  edgeBehindWaymarks: true, // 背後の退避先は画面端へ寄せ、目の前の兵を隠さない。
  // 舟の上の味方を退き先に選ばず、そこへ向かう途中も岸の柵の内側に保つ。
  retreatPointAllowed: (rt, p) => p.z >= BANK_Z + 1,
  dodgePointAllowed: (rt, p) => p.z >= BANK_Z + 1,
  compactDodgeGuide: true, // よける先の輪を足元に収め、近い兵の体を囲まない。
  dodgeMoveGesture: false, // 進む向きは既存の矢印で示し、札にはよける理由を残す。
  escapePlaceLabel: (_rt, rain, side) => rain ? `${side}へ下がり、矢をよけよ` : `${side}へよけ、敵から離れよ`,
  immediateTaskChanges: true, // 敵を受ける間に、押せない確認の下知を残さない。
  noticeLimit: 2, // 任務と声のほかに、敵の向きの一枠を空ける。
  attackWarningDelay: 1.8, // 印と背後の敵を見る間を、最初の打ち込みより先に残す。
  rearThreatFrame: true,
  rearAdviceView: true, // 打ち込みの声も、敵の向きの札と同じカメラの向きで伝える。
  // 横木・岸・東の柵は任務の文と名札の文が違う。言葉の一致に頼らず、現在の持ち場を示す。
  guideMarker(rt) {
    if (rt.flags.ending) return null;
    const F = rt.flags, p = rt.player.u.pos;
    // 持ち場に着いた後は、足元へ歩く印より川を向く下知を優先する。
    if (F.step === 1.25) {
      const s = SPOTS[nearestBankSpot(p)];
      if (Math.hypot(p.x - s.x, p.z - (BANK_Z + 5)) < 5) return null;
    }
    if (!dangerProgress(rt)) {
      // 岸の守りは一点への到着ではなく、この範囲で果たせる。敵から目を離させない。
      if (F.step === 3 && !F.broken && Math.abs(p.x) < 48 && p.z >= BANK_Z && p.z < BANK_Z + 28) return null;
      // 東の縄を確かめる前も、手元の敵を受ける下知が先。
      if (F.step === 3.5 && (F.finalTask === 'fight' || F.finalTask === 'watch') && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18) return null;
    }
    // 退避を終えたら、傷が残っていても東の見回りの印へ戻す。
    if (rt.flags.step === 3.5 && !dangerProgress(rt)) {
      const next = rt.flags.finalChecks.indexOf(false);
      const id = next < 0 ? 'east' : 'check' + next;
      if (rt.markers.some(m => m.id === id)) return id;
    }
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const id = rt.markers[i].id;
      if (/^(?:s[0-2]|workWatch|watch|bank|retreat|check[0-2]|east)$/.test(id)) return id;
    }
    return null;
  },
  spawn: { x: 3, z: BANK_Z + 7, heading: Math.PI },
  // 身の回りの当時の場（timeslip_field.js）。天正二年九月の長島は今の十月。輪中の岸はぬかるみ、葦が茂る。
  // 岸の柵の前に一揆の矢と捨てた笠、竹槍。水の上と堤の法には置かない。
  timeslip: {
    wet: 0.85, dust: 0.05, trample: 0.2, debris: 1.6, arrows: 1, reeds: 1,
    grass: 0x98a05e, grassTints: [0xffffff, 0xe6e6bc, 0xccd0a0], grassH: 1.2, tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x713d30],
    maxSlope: 0.22,
    fights: [[0, BANK_Z, 16], [24, BANK_Z, 12], [-24, BANK_Z, 12]],   // 踏み荒らしは柵の作業場だけ。堤の草を残す
  },
  world: {
    seed: 1574,
    noHaori: true, // 本の足軽姿を保ち、武将も陣羽織・マントを着せない。
    time: 'day',
    drawTimeUnitParts: true, // 骨と具足の逆行列を描く時にそろえ、移動後の手・笠・槍を取り残さない。
    keepPinnedArrowSize: true, // 胴や骨の倍率で刺さった矢を長槍ほどに伸ばさず、飛来時の実寸を保つ。
    pinnedArrowAxisScale: true, // 斜めに刺さった矢も、親の変換を含めた各軸の長さを保つ。
    pinnedArrowRenderScale: true, // 通常の親子の行列更新に合わせ、描く時の体格で一度だけ矢を補正する。
    naturalArrowRain: true, // 遠い矢を黒い染みの太さに広げず、細い矢と薄い影にする。
    arrowRainPerBow: 1, // 少数の射手から最低三十六本の補助矢を増やさない。本来の射矢は残す。
    bankCloth: true, // 門徒の小袖は戦うため袖と裾を絞る。僧の直綴の広い袂と分ける。
    settleSideFalls: true, // 横へ斬られた兵も、倒れ切った後は地面へ寝かせる。
    groundedFalls: true,
    drawTimeUnitParts: true, // 日送り・旋回後の骨と具足を描く時にそろえ、手から離れた槍や浮く部品を抑える。
    contactDust: true, // 近い兵が踏ん張る時も、共通の固定枠で岸の泥と低い飛沫を出す。
    wetEarthBursts: true,
    variedMarch: true, // 泥の岸では列を保っても、一人ずつ足を踏み替える間をずらす。
    meleeGroundedFeet: true, // 近い兵の足合わせの枠を使い、岸の乱戦でも踏ん張る足を地へ据える。
    livingSpearHedge: true, // 後列も前の味方の押し合いへ反応する。隊と兵の人数は増やさない。
    fallPaceSpread: .35, // 傷による崩れ方を残し、倒れる速さだけ人ごとにばらす。
    longHoro: 'round', // 使番の母衣は既存の丸い竹籠を使う。細い板のような尾にしない。
    fogFar: 320,
    mountainScale: .28, // 河口の輪中から見える遠い山並み。四方を高山で囲まない。
    noticeRepeatGap: Infinity, // 共通の声や知らせも、同じ文はこの戦で一度だけ。
    muddy: 0.7,
    autumn: true,
    softPathSoil: true, // 作業道と湿った岸をなじませ、格子ごとに泥の境が切り替わらないようにする。
    wetFieldRuts: 'wear', // 既存の沖積土の色と照りの抑制を使う。踏み跡だけを残し、雨の轍は足さない。
    patchyGround: true, // 岸の土にも湿乾のむらと草の切れ目を残す。
    plainGrassGround: true, // 草地の絵にも円い窪みがある。土と泥だけ替えても岸の縁に輪が残る。
    stableSlopeGrain: true, // 柵際の低い堤でも、法線の向きで地肌を回して縞へ引き伸ばさない。
    softEarthCrust: true, // 土塊の升の境を陰で囲まず、敷石状の継ぎ目を弱める。
    sparseEarthCrust: true, // 乾いた岸にも同じ土塊を敷き詰めず、既存の斑で間引く。
    subtleMudRelief: true, // 泥の窪みは踏まれた所へ限り、岸一面の同じ刻みを避ける。
    // 七巡目：写真の井桁組みのように柱を垂直にし、横木の重ね順を交互にする。
    // 共通の近景・遠景の形を利用する。長島の指定した物見だけに適用。
    lookoutLogFrame: true,
    gateRoofBacking: true, // 木戸の葺き板の下を既存の野地板で閉じ、屋根の隙間から空を見せない。
    curvedRockTufts: true, // 岩の根草は黒い三角一枚でなく、既存の細く曲がる葉を使う。
    litRockTufts: true, // 葉の裏にも空の光を残し、岸の根草を黒い刃にしない。
    groundedSlopeRocks: true,
    rockSlopeContact: true, // 岸の傾きに向く腹と縁まで接地し、回転した石の下へ隙間を残さない。
    rockBuriedRim: true, // 石の下端だけでなく縁も泥へ埋め、薄い台座が浮く見え方を抑える。
    rockDrawGround: true, // 岩と根草は、描く地面の面へ据える。
    rocks: 0, // 輪中の持ち場に散布岩とその根草を並べない。川石・泥・岸にまとめた葦は残す。
    riverCross: true,
    waterSlow: true,   // 川・水路が本当に足を遅くする（terrain_tags.js の 'water' タグ。「敵の強さは水」）
    paths: [[[0, 150], [0, 40], [0, BANK_Z + 2]], ...FORT_ROADS, ...PEOPLE_PATHS, [[-44, -71], [-44, -76]], [[-44, -88], [-38, -88]], [[-44, -71], [-38, -71]]],
    height,
    tint(x, z, h, c) {
      // 葦の生えた川べりと、島の泥
      if (z < 35 && z > -48 && Math.abs(x) < 145) {
        c.lerp({ r: 0.43, g: 0.38, b: 0.27 }, 0.7);
        // 手前の輪中の堤（岸から二十歩ほど）は枯れかけの草の斑。人の通る中央の泥道は土のまま。
        if (z > BANK_Z - 2 && z < BANK_Z + 22) {
          const patch = .5 + .5 * Math.sin(x * .41 + Math.sin(z * .23) * 2.2) * Math.cos(z * .37 - x * .11);
          const road = Math.max(0, Math.min(1, (Math.abs(x) - 3) / 4));
          const fade = Math.min(1, (z - BANK_Z + 2) / 3, (BANK_Z + 22 - z) / 6);
          c.lerp({ r: 0.36, g: 0.38, b: 0.24 }, (.25 + .45 * patch) * road * fade);
        }
      }
    },
    clear: (x, z) => (Math.abs(x) < 145 && z > -140 && z < 50),
    get streams() { return TOWN_STREAMS; },
    // 輪中の外の田
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 34) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
    },
    trees: 200,
    // 輪中の川辺は雑木を主にし、岸一面を細長い杉の列にしない。木の総数は保つ。
    treeMix: { sugi: .08, matsu: .3 },
    branchFoliage: true, // 杉・松・雑木を、透ける葉房と枝の重なりで描く。
    foldedNeedleCards: true,
    layeredNeedles: true, // 既存の枝先の起伏を使い、杉を積んだ円錐の形にしない。
    raggedNeedles: true,
    unevenCrowns: true, // 松と雑木の丸い房も崩す。既存の頂点を動かし、木や描画の数は増やさない。
    softFarNeedles: true, // 遠い杉も既存の枝先の形を使う。木の本数は増やさない。
    tufts: 6000,
    treeDensity: (x, z) => (z > -110 && z < 60 ? 0.08 : 0.5),
    groves: [{ x: -90, z: 30, r: 12, n: 14 }, { x: 96, z: 40, r: 12, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z > 150 || Math.abs(x) > 180),
    fleeWay(army, u, goal) {
      const bt = u.retreatBoat, q = u.boatSeat;
      if (!bt || !q || q.aboard || !bt.landed || bt.z < -24 || bt.flood >= .2) return goal;
      q.shore.x = bt.x; return q.shore;
    },
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの岸のぬかるみ・葦・矢（def.timeslip）
    // 岸一面の同じ足形・窪みは、凹凸の処理だけでなく土と泥の絵にも焼かれている。
    // 高画質でも写真への切替を通さず、足形を省いた地肌を共用する。実際の踏み跡・湿りのむらは残す。
    W.groundU.tDirt.value = dirtTex(true, true);
    W.groundU.tMud.value = mudTex(true);
    // 秋の河口の岸を白い雪原にしない。土の濃淡を残し、空の反射を抑える。
    W.terrain.material.color.setHex(0xaaa286);   // 橙の一枚に見えないよう、赤みを抜いた湿った土
    W.terrain.material.envMapIntensity = .15;
    deltaSkyline(W);
    F.wadeX = rt.player.u.pos.x; F.wadeZ = rt.player.u.pos.z; F.wadeDist = 0; F.wadeSide = 1;
    fleetMist(rt);
    boatInstancer(rt);
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { wajuu: 'HIST_A', kuki: 'HIST_A', surrender: 'HIST_A', counterattack: 'HIST_A', fire: 'HIST_A', forts: 'HIST_B', fortPositions: 'GAME_C', temple: 'HIST_B', localHold: 'GAME_C' };
    F.step = 0; F.built = 0; F.earlyReleased = 0;
    F.hurtEdge = document.createElement('div'); F.hurtEdge.setAttribute('aria-hidden', 'true');
    F.hurtEdge.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;box-shadow:inset 0 0 36px 10px rgba(120,42,28,.25);display:none';
    document.body.appendChild(F.hurtEdge);
    F.localStyle = document.createElement('style');
    F.localStyle.textContent = '#vignette.hurt,#vignette.dying,body.rm #vignette.dying{animation:none!important;box-shadow:inset 0 0 48px rgba(110,34,24,.25)!important;background-color:transparent!important}#brinkfx{opacity:.25!important}';
    rt.hud.root.classList.add('nagashima-bank');
    document.head.appendChild(F.localStyle);
    // この戦の槍の説明は、短い一文だけにする。
    const flash = rt.hud.flash;
    rt.hud.flash = function (text, ...args) {
      if (text.startsWith('槍衾の正面は突きが通りにくい')) text = '槍の列は、払いで崩せ';
      else if (text === '防がれた') text = '防がれた。横へ回れ';
      return flash.call(this, text, ...args);
    };
    const notices = rt.hud.notices, pushNotice = notices.push;
    notices.push = function (text, ...args) {
      if (text.includes('刃が光った')) text = '刃が光った。敵を向いて構えよ';
      else if (text.includes('大きく振りかぶった')) text = '振りかぶったぞ。構えて下がれ';
      if (text === '血が止まらない。味方の後ろで座って布で止めよ。「血を止める」を三秒長押し') text = '血が止まらない。味方の後ろで座り「血を止める」を三秒長押し';
      else if (text === '血が止まらない。布は使い切った。味方の後ろへ退き、戦の後は宿へ') text = '血が止まらない。布がない。味方の後ろへ退け';
      return pushNotice.call(this, text, ...args);
    };
    const say = rt.say;
    rt.say = function (name, text, ...args) {
      if (/^(?:柴田)?勝家$/.test(name) && text.includes('無念') && F.shibaU?.alive && !F.shibaU.woundOut && !F.shibaU.rearWound) text = '仲間が倒れた。残る者はわしの後ろへ来い！';
      return say.call(this, name, text, ...args);
    };
    // 合戦中の行き先は一枚。任務と台詞に名札を重ねない。
    const marker = rt.marker;
    rt.marker = function (id, at, text, ...args) {
      if (F.step >= 2) for (let i = this.markers.length - 1; i >= 0; i--) this.unmark(this.markers[i].id);
      return marker.call(this, id, at, text, ...args);
    };
    // 深手になる前に退く先を知らせる。被害は共通の難しさを保つ。
    const playerDamage = rt.army.hooks.playerDamage;
    rt.army.hooks.playerDamage = function (amount, src) {
      const u = rt.player.u;
      if ((F.step === 3 || F.step === 3.5) && src?.team !== u.team && (u.hp <= u.maxHp * .55 || amount >= u.hp * .5)) dangerWarning(rt);
      return playerDamage.call(this, amount, src);
    };
    const dispose = rt.dispose;
    rt.dispose = function (...args) { rt.hud.flash = flash; notices.push = pushNotice; rt.hud.root.classList.remove('nagashima-bank'); F.hurtEdge.remove(); F.localStyle.remove(); return dispose.apply(this, args); };
    // 骨の体格切り替えを矢へ伝えない。命中時だけ調べ、兵の移動と向きには追従させる。
    const pinArrow = rt.army.pinArrow;
    rt.army.pinArrow = function (a, life, parent, support) {
      const ground = !parent && !support;
      if (parent && !support) for (const u of this.units) {
        if (u.armorWear?.root === parent) { parent = u.mesh; break; }
      }
      const result = pinArrow.call(this, a, ground ? Math.min(life, 7) : life, parent, support);
      if (ground && a.stuck) {
        a.pos.y -= .04 + Math.random() * .14;
        a.mesh.rotateX((Math.random() - .5) * .45); a.mesh.rotateZ((Math.random() - .5) * .4);
      }
      return result;
    };
    // 流れと空の映りは残し、濁った河口を鏡のような白い板にしない。
    for (const st of W.def.streams || []) if (st.mesh) {
      st.mesh.material.color.setHex(0x344d43); st.mesh.material.roughness = .55;
      st.mesh.material.envMapIntensity = .45;
      // 足は川床に置いたまま、濁り水の下の脚を隠す。膝の深さも実際の水面に合わせる。
      st.mesh.material.transparent = false; st.mesh.material.opacity = 1; st.mesh.material.depthWrite = true;
    }
    if (W.footWaves) W.footWaves.mesh.material.opacity = .65;
    bankReeds(rt);
    bankBow(rt);
    // 戦功は戦後に数える。戦の最中に正確な点数や上限を知る札は出さない。
    rt.award = function (fn) { const before = this.tracker.raw(); fn(this.tracker); return this.tracker.raw() - before; };
    F.sallyHeld = 0; F.finalHeld = 0; F.broken = false;
    retreatBoats(rt);
    boatTick(rt, 0);
    // 実際に舷へ当たった矢玉だけ穴を開ける。乗員の傷を船の被害へ二重に数えない。
    const impact = rt.army.projectileImpact;
    rt.army.projectileImpact = function (x, y, z, type, nx, nz) {
      const hull = this._missileHit?.object;
      if (F.step >= 2 && hull?.boat && type === 'wood') hull.boat.holes++;
      return impact.call(this, x, y, z, type, nx, nz);
    };
    surroundForts(rt, false);
    F.closures = [];
    for (const [x, z] of [[0, -49], [48, -52]]) {
      const segs = wallLine(rt, [[x - 3, z], [x + 3, z]], { team: 0, hp: 700, name: '包囲の口の横木', segLen: 3, mesh: workFence });
      for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = .02; q.fireProof = true; q.noClimb = true; }
      const g = allyGroup(rt, { fixed: true, name: '囲みの人足', noAI: true, anchor: { x, z: z + 2 }, formation: 'line', width: 2, facing: Math.PI, aggro: 0, seekRange: 0 }, [{ type: 'ashigaru', n: 2 }]);
      F.closures.push({ segs, g, x, z: z + 2, t: 0 });
    }
    // 二か月余の兵糧攻め。舟の退城と補給を取り違えない。
    F.kakoi = makeKakoi({ day: 60, foodDays: 5, morale: 60 });
    for (const g of F.last) campWear(g, 30, F.kakoi.morale);
    flagTexture('namu');
    // 五拠点の縄張りと地形を同じデータから作る。新しい守兵は置かない。
    F.C = buildCastlePlan(rt, NAGASHIMA_ALL_PLAN, { baseHeight, perch: false, life: false });
    for (const s of F.C.walls) { s.noTarget = true; s.wall = true; s.fireProof = true; s.hp = s.maxHp = 1e9; }
    F.fwall = F.C.walls.filter(s => s.name === '中江の砦');
    F.ywall = F.C.walls.filter(s => s.name === '屋長島の砦');
    for (const gate of NAGASHIMA_ALL_PLAN.koguchi) {
      if (gate.id === 'nagashima_gate') {
        // 長島の表口だけ板壁・板葺きの渡櫓。入口四メートルと開いた戸を保つ。
        // 共通部品自身が渡櫓の床・窓・上がり口と、脇の台の当たりを作る。
        const gm = yaguramon(W, gate.at[0], gate.at[1], gate.w, Math.PI, { earth: true });
        rt.scene.add(gm);
        // 見た目だけ買った城の部品の櫓門（板壁の仕上げ）に替える。当たり・入口・床は手作りのまま
        kitReplace(gm, castleStyle(W), (p) => kitGateObj4(p, { x: gate.at[0], z: gate.at[1], rot: Math.PI, y: interiorBase(W, gate.at[0], gate.at[1], gate.w + 5.6, 4.2, Math.PI) - 0.05, Lw: gate.w + 5.6, D: 4.4, Ht: 7.7 }), { gate: true });
        continue;
      }
      // 土塁の坂に扉の下端を合わせる。中央の高さだけで戸を置き、端を浮かせない。
      rt.scene.add(kabukimon(W, gate.at[0], gate.at[1], gate.w, 0, { groundedGate: true, slopeDoorBottom: true }));
      // 開いた木戸の柱と控柱だけに当たり。扉の通り道は空ける。
      for (const side of [-1, 1]) for (const dz of [0, -1.6]) solidRect(gate.at[0] + side * (gate.w / 2 + .17), gate.at[1] + dz, .4, .4);
    }
    F.fortTowers = NAGASHIMA_ALL_PLAN.yagura.map(t => {
      const tower = monomi(rt, t.at[0], t.at[1], {
        name: t.name, team: 1, mon: 'namu',
        ...({ ...t.lookout, crossLashings: true }),
      });
      // 井楼の床・梯子口は外の形にある。室内側の戸枠を空中へ重ねない。
      tower.naka.hasExterior = true;
      return tower;
    });
    // 長島城の木戸脇だけ低い留め石。総石垣にはしない（北伊勢の一般形からの推定）。購入した城部品を利用。
    const stoneBatch = makeKitBatch(), entryStones = [];
    for (const x of [100.5, 107.5]) {
      const top = W.heightAt(x, -66.5) + .2;
      const stone = ishigaki(W, [[x, -68], [x, -65]], { minH: 1, maxH: 1.2, topY: top, out: x < 104 ? -1 : 1, batch: stoneBatch, noKit: true });
      if (!stone.isBatchedPart) rt.scene.add(stone);
      solidRect(x, -66.5, .8, 3, 0, top);
      entryStones.push({ stone, ax: x, az: -68, bx: x, bz: -65, topAt: () => top, botAt: () => top - 1.2, side: x < 104 ? -1 : 1, extA: 0, extB: 0, seed: Math.round(x), zs: .3 });
    }
    finalizeKitBatch(rt, stoneBatch);
    whenCgt(() => {
      if (cgtScene() !== rt.scene || !cgtSpend(9000)) return;
      const kb = new KitBatch(); for (const seg of entryStones) kitStoneSeg(kb, seg);
      if (!kb.n) return;
      rt.scene.add(kb.build({ shadow: false }));
      for (const seg of entryStones) seg.stone.visible = false;
    });
    const buildings = F.fortBuildings = fortRooms(rt);
    F.kuraStruct = buildings.naka_kura.struct; F.kuraStruct2 = buildings.naka_hut.struct;
    F.yanaStruct = buildings.yana_kura.struct;
    F.karatoStruct = buildings.castle_hall.struct; F.tsutsumiStruct = buildings.bank_watch.struct; F.nakasuStruct = buildings.island_watch.struct;
    // 五巡目：写真の塀沿いの旗列。十本のまま、木戸・井楼の梯子・番所の戸口から離す。
    // 門徒の拠点なので念仏旗を保ち、本の清洲・岡崎の家紋は移さない。
    const fortFlags = true
      ? [[-24, -56.5], [-16, -54.5], [16, -54.5], [24, -56.5], [40, -55.8], [56, -55.8], [92, -68], [112, -68], [-53, -55], [56, -45]]
      : [[-26, -60], [-4, -58], [14, -58], [28, -62], [44, -60], [62, -66], [100, -72], [120, -76], [-53, -55], [56, -45]];
    for (const [x, z] of fortFlags) rt.scene.add(nobori(W, x, z, 'namu', 6));
    // 井戸と俵。川の水をそのまま飲む描写にせず、長島と二砦に井戸を推定する。
    const wellBag = [], wellRoofs = [], detailedWells = true;
    // 館の北軒と上屋を重ねず、井戸囲いは奥の土塁の内へ収める。
    for (const [x, z] of [[-20, -91], [61, -76], [98, detailedWells ? -109.2 : -108]]) {
      for (const [dx, dz, w, d] of [[-1, 0, .2, 2.2], [1, 0, .2, 2.2], [0, -1, 2.2, .2], [0, 1, 2.2, .2]]) {
        const g = ROOM_BOX.clone(); g.scale(w, .75, d); g.translate(x + dx, W.heightAt(x, z) + .38, z + dz); wellBag.push(g);
      }
      if (detailedWells) {
        const y = W.heightAt(x, z);
        const part = (dx, dy, dz, w, h, d, roof = false, rx = 0) => {
          const g = ROOM_BOX.clone(), uv = g.attributes.uv;
          const sizes = [[d,h], [d,h], [w,d], [w,d], [w,h], [w,h]];
          for (let f = 0; f < 6; f++) for (let n = 0; n < 4; n++) {
            const i = f * 4 + n; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]);
          }
          g.scale(w, h, d); g.rotateX(rx); g.translate(x + dx, y + dy, z + dz);
          (roof ? wellRoofs : wellBag).push(g);
        };
        // 本の屋敷内の小さな井戸を参考に、柱・横木・板葺きの雨覆いを自作する。
        // 支柱は既存の井戸囲いの内側。当たりと通行幅は増やさない。
        for (const side of [-1, 1]) part(side * .87, 1.35, 0, .14, 2.7, .14);
        part(0, 2.68, 0, 2.7, .16, .18);
        part(0, 1.72, 0, 2, .12, .12);
        // 釣瓶の縄と中空の桶。黒い円を貼るだけの井戸にしない。
        part(.15, 1.15, 0, .025, 1.1, .025);
        for (const side of [-1, 1]) {
          part(.15 + side * .17, .66, 0, .035, .3, .37);
          part(.15, .66, side * .17, .37, .3, .035);
          part(0, 2.47, side * .68, 2.9, .09, 1.48, true, side * .3);
          part(0, 2.52, side * .7, 3, .07, .09);
        }
        part(.15, .5, 0, .37, .04, .37);
        part(0, 2.72, 0, 3, .12, .18, true);
      }
      solidRect(x, z, 2.2, 2.2); rt.scene.add(tawara(W, x + 2, z + 2, 0, 3));
    }
    const wells = new THREE.Mesh(mergeGeometries(wellBag, false), ROOM_WOOD); wells.userData.camBlock = true; rt.scene.add(wells);
    for (const g of wellBag) g.dispose();
    if (wellRoofs.length) {
      const mesh = new THREE.Mesh(mergeGeometries(wellRoofs, false), ROOM_ROOF);
      mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
      for (const g of wellRoofs) g.dispose();
    }
    // ---- 願証寺の寺内町（中江の砦とは別の、宗教の中心。本堂・門・門徒屋敷・倉・船着場。大天守は無い） ----
    // 願証寺の室内図は不明。輪中の寺として、外陣と内陣・僧坊の座敷を推定する。
    F.teranaka = new Garan(rt);
    F.teranaka.build({ id: 'gansho_hondo', name: '願証寺の本堂', kind: 'hondo', x: GANSHO.x, z: GANSHO.z, w: 11, d: 8, h: 4.6, enterable: true });   // 柱を高くし、対岸から大屋根が柵の上に見えるように
    rt.scene.add(romon(W, GANSHO.x, GANSHO.z + 11, 5.2, 0));
    rt.scene.add(village(W, GANSHO.x - 48, GANSHO.z + 2, { n: 6, r: 10, rot: 0.2, seed: 15748 }));
    // 輪中の門徒の家並み（資料との差 10/28）：寺の西の輪中に在所を二つ。人の歩く道（PEOPLE_PATHS）からは外す。
    rt.scene.add(village(W, -134, -92, { n: 7, r: 16, rot: 0.05, seed: 15749, smoke: 0 }));
    rt.scene.add(village(W, -90, -112, { n: 4, r: 10, rot: -0.15, seed: 15750, smoke: 0 }));
    // 寺は中江の西の包囲柵（x=-34）より外。棟も石段も柵や本堂と重ねない。
    F.teranaka.build({ id: 'gansho_sobo', name: '願証寺の僧坊', kind: 'sobo', x: GANSHO.x + 6, z: GANSHO.z - 10, w: 5, d: 4, rot: .15, enterable: true });
    F.teranaka.build({ id: 'gansho_kuri', name: '願証寺の庫裏', kind: 'kuri', x: GANSHO.x + 6, z: GANSHO.z + 7, w: 5, d: 4, rot: -.1, enterable: true });
    F.teranaka.finish();
    for (const [dx, dz] of [[-4, 13], [4, 13]]) rt.scene.add(nobori(W, GANSHO.x + dx, GANSHO.z + dz, 'namu', 6));
    // 門前の市（床の低い小屋と俵の店。寺内町は門徒の暮らしの町で、長島城や屋長島の砦の軍事の曲輪とは分ける）
    {
      // 六巡目：市だけ残っていた厚い草屋根を、写真の町小屋の灰茶の板葺きへ。
      // 念仏旗・門前の道幅・小屋の数はそのまま、城の瓦や他家の紋は持ち込まない。
      const mb = makeSimpleBatch();
      for (const [x, z, r] of MARKET_HUTS) hut(W, x, z, 3.4, 2.6, r, {
        wall: 0x8a7a58, h: 2.0, batch: mb,
        ...({ ita: true, minka: false, boardRoof: true,
          weatheredBoards: true, boardRoofColors: [0x827560, 0x756b59, 0x91816a, 0x6d6556] }),
      });
      finalizeSimpleBatch(rt, mb);
    }
    for (const [x, z] of [[-49, -63], [-39, -68]]) rt.scene.add(tawara(W, x, z, 0.4, 3));
    fortYardDetails(rt);
    // 船着場（島の北の水路ぎわ）と舟
    const dockZ = -132;
    rt.scene.add(tawara(W, GANSHO.x + 6, GANSHO.z - 18, 0.2, 4));
    for (const [dx, rot] of [[-6, 0.1], [4, -0.15]]) { const kb = riverBoat(GANSHO.x + dx, waterHeight(W, GANSHO.x + dx, dockZ), dockZ, rot); rt.scene.add(kb); }
    // 退城舟が渡る水路には飾り舟を置かない。横向きの無人舟が着岸する舟と交差していた。
    // 繋いだ舟は寺の船着場に残し、川口の封鎖は東の水軍と遠景の船団で示す。
    F.ganshoStruct = rt.army.addStruct({ x: GANSHO.x, z: GANSHO.z, r: 5, solidR: 0, hp: 220, maxHp: 220, armor: 0, team: 1, name: '願証寺の本堂', moraleOnBurn: 'big', flammable: true });
    // 既存の遠景の人数だけを保つ。砦の家や物見と重ならない広場へ寄せる。
    for (const [x, z, w, d, count, seed] of [[53, -63, 8, 5, 40, 15747], [107, -76, 8, 5, 20, 15749], [-50, -55, 6, 2, 24, 15750], [48, -44, 5, 1, 24, 15751]])
      W.addDistantArmy({ x, z, w, d, count, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed, flagRate: .12 });
    // 史実の放火は最後の下知でのみ行う。町・降伏する城を任務外の的にしない。
    for (const q of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.ganshoStruct, F.karatoStruct, F.tsutsumiStruct, F.nakasuStruct]) { q.noTarget = true; q.fireProof = true; }
    F.fireTargets = [];
    const fireBounds = new THREE.Box3();
    for (const b of FORT_BUILDINGS) if (b.id.startsWith('naka_') || b.id.startsWith('yana_')) {
      const q = buildings[b.id].struct; q.flammable = true;
      // 長屋は上で束ねた屋根の寸法、小屋は実際の屋根の上端を設営時に一度だけ調べる。
      q.bankFireRoof = b.enter ? 2.6 + (b.d / 2 + .6) * .4
        : fireBounds.setFromObject(buildings[b.id].mesh).max.y - W.heightAt(b.x, b.z);
      F.fireTargets.push(q);
    }
    // 結末の建物火を屋根から見せる。地面からの小火では板屋根と対岸の柵に隠れる。
    // 既存の炎・煙を同じ四枠で使い、炊ぎ火や降伏した長島城には適用しない。
    const addBankFire = W.addFire;
    W.addFire = function (x, z, o = {}) {
      const target = F.ending && F.fireTargets.find(s => s.x === x && s.z === z);
      if (target && !o.torch) {
        // 小さな焚き火の煙では対岸の火災が伝わらない。同じ四枠の炎と煙を広げる。
        const size = Math.max(o.size || 1.3, 3.6);
        o = { ...o, size, h: target.bankFireRoof - size * .35, blackSmoke: true };
      }
      return addBankFire.call(this, x, z, o);
    };
    F.FS = attachFireSpread(rt, { C: F.C });
    // 中江の守り。下間頼旦がこの砦で指揮したとは確定できない。
    // 守将も個人の馬印も未確認。共通の金扇を置かず、念仏の旗で所属を示す。
    F.ikkoCamp = camp(rt, { x: 0, z: -80, facing: 0, team: 1, faction: 'ikko', mon: 'namu', noUma: true, armor: IKKO.armor, guard: 15, reserve: 0, runTo: { x: 0, z: -58 } });
    F.ikkoCamp.guard.name = '中江の守り';
    F.ikkoCamp.guard.formation = 'yari';
    F.ikkoCamp.guard.noAI = true; // 籠城の守兵は、退城する舟を追って砦から出ない。
    F.ikkoCamp.guard.historicalOrders = true; // 共通の寄せ直しでも砦を離れない。
    // 包囲中の岸の応酬は復元。六人だけを対岸に置き、川を渡る架空の寄せにはしない。
    F.bankBows = [];
    for (const s of SPOTS) {
      const g = enemyGroup(rt, { fixed: true, faction: 'ikko', name: '対岸の弓と鉄砲衆',
        anchor: { x: s.x, z: CH_Z - 19 }, facing: 0, formation: 'line', width: 2,
        order: 'hold', aggro: 0, fire: false, noAI: true, noPursue: true, historicalOrders: true,
        fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'bow', n: 1, o: { range: 40, dmg: 5 } }, { type: 'gun', n: 1, o: { range: 48, dmg: 5 } }], IKKO));
      for (const u of g.units) { u.perch = { x: u.pos.x, y: u.pos.y, z: u.pos.z }; u.noTarget = true; }
      F.bankBows.push(g);
    }
    W.addDistantArmy({ x: 18, z: -82, w: 10, d: 10, count: 30, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15745, flagRate: .12 });
    W.addDistantArmy({ x: -14, z: -78, w: 8, d: 8, count: 20, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15746, flagRate: .12 });
    // ---- こちらの岸：織田の陣（信長と旗本。後ろの大軍が控え） ----
    // 動かない控えは岸から後ろへ離す。目の前の反撃には、本当に戦う組だけを並べる。
    // 動かない控えは本陣の左右へ。岸の戦う兵のすぐ後ろに、棒状の近景を並べない。
    // 人数と短い槍は保ち、列の間隔も広げる。二月の籠城の炊ぎの煙は川向こうへ置く。
    for (const [x, z, sd, k] of [[-44, BANK_Z + 68, 15752, 'oda'], [44, BANK_Z + 68, 15753, 'eiraku']]) W.addDistantArmy({ x, z, w: 14, d: 10, count: 30, spearScale: .65, facing: Math.PI, armor: 0x2a2622, team: 0, flagTex: flagTexture(k), seed: sd, flagRate: .12 }).army.noWake = true;
    for (const [x, z, sz] of [[FORT.x + 6, FORT.z - 6, 1.8], [GANSHO.x, GANSHO.z, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: sz });
    F.odaCamp = camp(rt, { x: 0, z: 60, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 0, runTo: { x: 0, z: BANK_Z + 8 } });
    // 北向きの本陣では、護衛も前（北）へ。共通の南向き配置をそのまま使わない。
    F.odaCamp.guard.anchor.z = 46;
    F.odaCamp.guard.formation = 'yari';
    // 旗本は本陣を守る。指定がないと共通の頭が岸へ攻め出し、結った柵に取り付いてしまう。
    F.odaCamp.guard.guard = true;
    if (F.odaCamp.general) F.odaCamp.general.group.noAI = true;
    for (const u of F.odaCamp.guard.units) {
      const at = F.odaCamp.guard.slotPos(u.slot, F.odaCamp.guard.initial);
      u.pos.set(at.x, W.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos);
    }
    rt.scene.add(tawara(W, -14, 52, 0.3, 6));
    for (const [x, z, k] of [[-8, 34, 'oda'], [8, 34, 'eiraku'], [-40, BANK_Z + 10, 'kari'], [40, BANK_Z + 10, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const s of SPOTS) rt.scene.add(tawara(W, s.x + 4, s.z + 8, 0.2, 2));
    // 包囲の普請場（資料との差 10/28：岸が泥の一枚だった）：結う前の丸太の山と縄・桶を作業点の間に。作業点と着岸口は空ける。
    for (const [x, z, r] of [[-9.6, BANK_Z + 3.2, 1.4], [10.2, BANK_Z + 3.6, 1.75], [-40, BANK_Z + 6, .1]]) rt.scene.add(lumber(W, x, z, r));
    extScatter(rt.scene, 'bucket', [{ x: -11.8, z: BANK_Z + 5.4 }, { x: 12.6, z: BANK_Z + 5.9, rot: 1 }], W);
    extScatter(rt.scene, 'sack', [{ x: -12.4, z: BANK_Z + 6.6, rot: .7 }, { x: 8.4, z: BANK_Z + 6.2, rot: 2.1 }], W);
    WOOD.map = DARK.map = woodTex(); WOOD.needsUpdate = DARK.needsUpdate = true;
    F.fenceWork = SPOTS.map((s) => wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '結いかけの柵', segLen: 5, mesh: workFence }));
    for (const segs of F.fenceWork) for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = 0.02; q.noClimb = true; }
    // 柴田の雁の幟は横木の両端より外へ。作業場と川への見通しを空け、持ち場の所属を示す。
    for (const x of [-10, 10]) {
      const banner = nobori(W, x, BANK_Z + 1, NAMED_GEAR['柴田勝家'].flag, 5);
      banner.traverse(c => { c.castShadow = false; });
      rt.scene.add(banner);
    }
    if (SETTINGS.quality === 'high') {
      // 長島での使用と据え場所は復元。馬印持ちへ兵を替えず、柵の後ろに据える。
      const mark = campMark('柴田勝家');
      mark.position.set(-3, W.heightAt(-3, BANK_Z + 15) - .9, BANK_Z + 15);
      rt.scene.add(mark);
    }
    rt.marker('s0', { x: SPOTS[0].x, z: SPOTS[0].z + 2 }, '柵の横木に縄を締める', { h: .6 });
    // 九鬼の船団（東の川筋・海の封鎖）：川口をふさぎ、ゆっくり動きながら遠くの射撃を見せる
    F.ship = ataka();
    F.ship.position.set(84, waterHeight(W, 84, CH_Z - 2) - 0.45, CH_Z - 2);
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    // 九鬼嘉隆の参戦は三重県の県史あれこれ・鳥羽市観光協会の紹介による。
    // 船上の立ち位置と具足は復元。二将は飾りの指揮像で、戦う兵は増減させない。
    // https://toba.gr.jp/kuki-project/about/
    const commandFigure = (name) => {
      const u = { type: 'busho', name };
      buildModel(u, { ...GENERALS[name], face: 'g:' + name, tier: 3,
        kacchu: NAGASHIMA_KACCHU[name],
        weapon: 'none', flag: null, pole: false, sode: true, kote: 3,
        saya: true, cloth: 0x263244, left: 'saihai' });
      // 指揮する姿の復元。刀は腰の拵えに納め、左拳を采配の柄へ合わせる。
      // 共通の初期姿勢では両手が抜き身へ寄る。既存の両腕の向け先を一度だけ整える。
      u.hand.position.set(.3, .86, .12);
      u.lh = [-.3, .98, .26];
      poseArms(u);
      // 戦わない指揮像は関節を毎コマ辿らず、采配姿を一度だけ焼き込む。
      // 共有の細かい形・遠くの形から作り、装備と顔は保つ。追加の影は落とさない。
      u.mesh.updateMatrixWorld(true);
      const bags = new Map(), figure = new THREE.Group();
      figure.userData.noFreeze = figure.userData.noMerge = true;
      u.mesh.traverseVisible(c => {
        if (!c.isMesh) return;
        let bag = bags.get(c.material);
        if (!bag) { bag = [[], []]; bags.set(c.material, bag); }
        const lod = c.userData.lod;
        for (let i = 0; i < 2; i++) bag[i].push((lod ? lod[i] : c.geometry).clone().applyMatrix4(c.matrixWorld));
      });
      for (const [material, parts] of bags) {
        const hi = mergeUnitParts(parts[0]), lo = mergeUnitParts(parts[1]);
        for (const list of parts) for (const geometry of list) geometry.dispose();
        const mesh = new THREE.Mesh(hi, material);
        lodSwap(mesh, hi, lo);
        mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
        figure.add(mesh);
      }
      return figure;
    };
    const shipGeneral = (ship, name) => {
      const figure = commandFigure(name);
      figure.position.set(-.7, .7, 3.2); figure.rotation.y = -.35;
      ship.add(figure);
    };
    if (SETTINGS.quality === 'high') {
      // 信広は一門の討死の報せだけで姿がなかったため、包囲中の控えを補う。
      // 参戦・討死は既存の年表による。本陣脇の居場所と采配姿は復元で、討死の場所ではない。
      // https://www.hi.u-tokyo.ac.jp/publication/syoho/38/pub_shiryo-10-24/
      // 船上の将と同じ形・材質を使う指揮像。戦う兵を置き換えず、毎コマの処理も足さない。
      F.nobuhiroFigure = commandFigure('織田信広');
      F.nobuhiroFigure.position.set(-18, W.heightAt(-18, 48), 48);
      F.nobuhiroFigure.rotation.y = Math.PI;
      // 個人の旗印は未詳。ほかの立ち寄り将と同じく、傍らの木瓜で織田方の所属を示す。
      // 旗の形・材質を共用し、移動して姿を消す時には旗も一緒に隠す。
      F.nobuhiroBanner = nobori(W, -16, 49, NAMED_GEAR['織田信広'].flag, 5);
      rt.scene.add(F.nobuhiroFigure, F.nobuhiroBanner);
      rt.addInteract('nobuhiro', () => F.step < 2 ? F.nobuhiroFigure.position : null,
        '織田信広に声をかける', () => rt.say('織田信広', '包囲は長い。岸の備えを怠るな', 3), { r: 3 });
      // 公記巻七の一江口・篠橋攻め衆に津田孫十郎（織田信次）。
      // https://kininaruart.com/artist/shincho/n7.html
      // 東の控えへの立ち寄りと采配姿は復元。信広と形・材質を共用する飾りの将。
      F.nobutsuguFigure = commandFigure('織田信次');
      F.nobutsuguFigure.position.set(18, W.heightAt(18, 48), 48);
      F.nobutsuguFigure.rotation.y = Math.PI;
      F.nobutsuguBanner = nobori(W, 20, 49, NAMED_GEAR['織田信次'].flag, 5);
      rt.scene.add(F.nobutsuguFigure, F.nobutsuguBanner);
      rt.addInteract('nobutsugu', () => F.step < 2 ? F.nobutsuguFigure.position : null,
        '織田信次に声をかける', () => rt.say('織田信次', '東の手も囲みを守る。岸の備えを頼むぞ', 3), { r: 3 });
      // 公記巻七：信忠は東の一江口、信盛は西の賀鳥口と坂手の郷の押さえ。
      // 信包（上野守）は一江口の御伴衆、のち加路戸島口攻め衆に見える。
      // https://kininaruart.com/artist/shincho/n7.html （巻七・河内長島）
      // 本陣への立ち寄りは復元。既存の筋兜・立物なしの具足と采配姿を共用する。
      // 当日の陣羽織の色・刀の銘は未詳。固有の立物・名刀・馬印は作らない。
      // 戦闘兵を指揮像へ替えず、東西の担当は本人の言葉で示す。
      F.visitingGenerals = [
        // 公記巻七の北畠茶筅（信雄）。船での参陣・南大島口の担当に基づく。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿は復元。既存の指揮像・形・材質を共用し、戦闘兵は替えない。
        { id: 'nobukatsu', name: '織田信雄', x: 42, z: 60, flag: NAMED_GEAR['織田信雄'].flag,
          words: '北畠茶筅じゃ。船で参り、神戸三七らと南大島口を囲んでおる。岸の備えも頼むぞ' },
        // 公記巻七の船勢から抜けていた捶水。史料の呼称を使い、諱や読みは補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像で形と材質を共用する。
        // 戦闘兵・毎コマの処理は増減させず、固有の立物・馬印・豪傑の型は作らない。
        { id: 'suizui', name: '捶水', x: 84, z: 72, flag: NAMED_GEAR['捶水'].flag,
          words: '茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七の鳥屋野尾は北畠茶筅に従い大船で参陣。史料の呼称を使い、諱は断定しない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質だけで既存の形と材質を共用する。
        // 戦う兵と毎コマの処理は増減させず、固有の立物・馬印・豪傑の型は補わない。
        { id: 'toriyanoo', name: '鳥屋野尾', x: 54, z: 72, flag: NAMED_GEAR['鳥屋野尾'].flag,
          words: '鳥屋野尾じゃ。茶筅様に従い、大船で参った。岸の備えも頼むぞ' },
        // 公記巻七の田丸も北畠茶筅に従い大船で参陣。諱は補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像を使い、戦闘兵は替えない。
        { id: 'tamaru', name: '田丸', x: 60, z: 72, flag: NAMED_GEAR['田丸'].flag,
          words: '田丸じゃ。茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七で北畠茶筅に従う大東・小作・坂奈井。諱は補わず記録の呼称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・装いは復元。高画質だけで指揮像と所属旗の形・材質を共用する。
        // 戦闘兵や毎コマの処理は増減させず、個人の立物・名刀・馬印・豪傑の型は作らない。
        { id: 'daito', name: '大東', x: 66, z: 72, flag: NAMED_GEAR['大東'].flag,
          words: '大東じゃ。茶筅様に従い、大船で参った。岸の囲みも頼むぞ' },
        { id: 'kosaku', name: '小作', x: 72, z: 72, flag: NAMED_GEAR['小作'].flag,
          words: '小作じゃ。わしらも茶筅様の船勢に加わった。岸の備えを緩めるな' },
        { id: 'sakanai', name: '坂奈井', x: 78, z: 72, flag: NAMED_GEAR['坂奈井'].flag,
          words: '坂奈井じゃ。茶筅様に従い、大船で囲みに加わった。岸の備えも頼むぞ' },
        // 公記巻七の南大島口攻め衆・神部三七（信孝）。本陣への立ち寄りと采配姿は復元。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質の指揮像だけを補い、具足・旗の形と材質を共用する。戦闘兵と毎コマの処理は増減させない。
        { id: 'nobutaka', name: '織田信孝', x: 48, z: 66, flag: NAMED_GEAR['織田信孝'].flag,
          words: '神戸三七じゃ。茶筅殿や桑名の衆と南大島口を囲んでおる。岸の備えも頼むぞ' },
        { id: 'nobutada', name: '織田信忠', x: 24, z: 54, flag: 'oda',
          words: 'わしは東の一江口を受け持つ。そなたらは岸の備えを守れ' },
        { id: 'sakuma', name: '佐久間信盛', x: -24, z: 54, flag: NAMED_GEAR['佐久間信盛'].flag,
          words: '西の手にはわしの組もおる。岸の柵を解くでないぞ' },
        // 公記巻七「河内長島」：佐久間父子は近江衆を加え、坂手の郷の押さえ。
        // https://ja.wikisource.org/wiki/信長公記
        // 信栄の通称は河内長野市所蔵「佐久間甚九郎信栄禁制」にも見える。
        // https://adeac.jp/kawachinagano-city/catalog/c00001179
        // 本陣への立ち寄りと采配姿は復元。父と具足・旗の形と材質を共用し、戦闘兵は替えない。
        { id: 'sakuma_nobuhide', name: '佐久間信栄', x: -30, z: 54, flag: NAMED_GEAR['佐久間信栄'].flag,
          words: '父と近江の衆を率い、坂手の郷を押さえる。岸の囲みも緩めるな' },
        { id: 'nobukane', name: '織田信包', x: 30, z: 60, flag: NAMED_GEAR['織田信包'].flag,
          words: '加路戸島口はわしらの持ち場じゃ。ここは岸の備えを頼むぞ' },
        // 公記巻七「河内長島」：丹羽五郎左衛門は長島東の押付郷に陣取る。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄りは復元。既存の指揮像・筋兜・刀の拵えを共用し、戦闘兵は替えない。
        { id: 'niwa', name: '丹羽長秀', x: 36, z: 54, flag: NAMED_GEAR['丹羽長秀'].flag,
          words: '長島の東、押付郷はわしらが囲む。岸の柵も隙を作るでないぞ' },
        // 公記巻七：稲葉伊予守は西の賀鳥口、のち大鳥居攻め衆として今島に陣取る。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿は復元。既存の指揮像と具足を共用し、戦闘兵は替えない。
        { id: 'inaba', name: '稲葉一鉄', x: -30, z: 60, flag: NAMED_GEAR['稲葉一鉄'].flag,
          words: '西の賀鳥口から攻め入った。今は岸の囲みを緩めるでないぞ' },
        // 公記巻七の賀鳥口の稲葉右京助。諱は断定せず、史料の通称で補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に共通の形と材質を使う。
        // 戦う兵と毎コマの処理は増減させず、所属だけを織田の旗で示す。
        { id: 'inaba_ukyonosuke', name: '稲葉右京助', x: -36, z: 66, flag: NAMED_GEAR['稲葉右京助'].flag,
          words: '稲葉右京助じゃ。伊予守らと西の賀鳥口から攻め入った。岸の囲みも緩めるな' },
        // 公記巻七の大鳥居攻め衆・稲葉喜六。諱は補わず記録の通称で示す。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。既存の形・材質を共用する高画質の指揮像。
        // 大鳥居は既に落ちた砦として語り、戦闘兵・毎コマの処理・個人の馬印は増やさない。
        { id: 'inaba_kiroku', name: '稲葉喜六', x: -42, z: 72, flag: NAMED_GEAR['稲葉喜六'].flag,
          words: '稲葉喜六じゃ。伊予守らと今島に陣を置き、大鳥居を攻めた。残る囲みも緩めるな' },
        // 公記巻七：蜂屋兵庫頭は西の賀鳥口、のち大鳥居攻め衆として今島に陣取る。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りは復元。既存の指揮像・具足・刀の拵えを共用し、戦闘兵は替えない。
        { id: 'hachiya', name: '蜂屋頼隆', x: -36, z: 54, flag: NAMED_GEAR['蜂屋頼隆'].flag,
          words: '西の囲みはわしらも受け持つ。そなたらは岸の柵を固めよ' },
        // 公記巻七：氏家左京亮（直昌）は早尾口の先陣、のち篠橋攻め衆。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄りは復元。既に落ちた篠橋に今も籠城兵がいるとはしない。
        // 既存の指揮像・具足・刀を共用し、戦闘兵や毎コマの処理は増減させない。
        { id: 'ujiie', name: '氏家直昌', x: -30, z: 42, flag: NAMED_GEAR['氏家直昌'].flag,
          words: '篠橋の攻めは済んだ。残る囲みも緩めるでないぞ' },
        // 公記巻七の伊賀伊賀守（安藤守就）は早尾口の先陣、のち篠橋攻め衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。既存の形と材質を共用する。
        // 篠橋は既に開城済み。戦闘兵は替えず、個人の馬印や毎コマの処理は足さない。
        { id: 'ando', name: '安藤守就', x: -42, z: 42, flag: NAMED_GEAR['安藤守就'].flag,
          words: '早尾口の先陣と篠橋の攻めを務めた。残る囲みも緩めるでないぞ' },
        // 公記巻七「河内長島」：不破河内守は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。共通の具足を使い、戦闘兵や毎コマの処理は増減させない。
        { id: 'fuwa', name: '不破光治', x: -24, z: 36, flag: NAMED_GEAR['不破光治'].flag,
          words: '早尾口の先陣はわしらも務めた。岸の囲みを緩めるでないぞ' },
        // 公記巻七：不破彦三は早尾口の先陣、のち丹羽らと長島東の押付郷に陣取る。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りと采配姿は復元。既存の形・材質を共用し、戦闘兵は替えない。
        { id: 'fuwa_hikozo', name: '不破彦三', x: 36, z: 66, flag: NAMED_GEAR['不破彦三'].flag,
          words: '早尾口の先陣を務めた。今は丹羽殿らと東の押付郷を囲んでおる' },
        // 公記巻七「河内長島」：佐々蔵介は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。既存の指揮像と所属旗を共用する。
        // 戦闘兵は替えず、固有の名刀・馬印・豪傑の型は補わない。
        { id: 'sassa', name: '佐々成政', x: -36, z: 36, flag: NAMED_GEAR['佐々成政'].flag,
          words: 'わしらも早尾口の先陣を務めた。岸の備えを怠るでないぞ' },
        // 公記巻七「河内長島」：池田勝三郎は信忠の一江口御伴衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。具足と旗は既存の共用部品を使う。
        // 個人の馬印・名刀・豪傑の型は補わず、戦闘兵や毎コマの処理は増減させない。
        { id: 'ikeda', name: '池田恒興', x: 30, z: 42, flag: NAMED_GEAR['池田恒興'].flag,
          words: 'わしは信忠様と東の一江口を受け持つ。岸の備えも緩めるでないぞ' },
        // 公記巻七「河内長島」：木下小一郎は早尾口の先陣。篠橋から出た一揆へ浅井新八と向かう。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と既存の指揮像を共用する。
        // 戦う兵は替えず、当日の固有の立物・名刀・馬印や毎コマの処理は足さない。
        { id: 'hidenaga', name: '羽柴秀長', x: -42, z: 54, flag: NAMED_GEAR['羽柴秀長'].flag,
          words: '早尾口の先陣を務め、篠橋から出た敵に向かった。残る囲みも緩めるな' },
        // 公記巻七：浅井新八は早尾口の先陣。木下小一郎と篠橋から出た一揆へ向かう。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄りと装いは復元。諱・固有の立物・名刀・馬印は断定しない。
        // 高画質の指揮像だけを補い、戦闘兵と毎コマの処理は増減させない。
        { id: 'asai_shinpachi', name: '浅井新八', x: -48, z: 48, flag: NAMED_GEAR['浅井新八'].flag,
          words: '小一郎殿と篠橋から出た敵に向かった。囲みの備えを緩めるな' },
        // 公記巻七「河内長島」：河尻與兵衛は早尾口の先陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。木瓜は織田方の所属旗で、個人の旗印ではない。
        // 長島専用の具足と既存の指揮像を共用し、戦闘兵・毎コマの処理は増減させない。
        { id: 'kawajiri', name: '河尻秀隆', x: -48, z: 60, flag: 'oda',
          words: 'わしらも早尾口の先陣を務めた。岸の柵を固め、囲みを緩めるな' },
        // 公記巻七「河内長島」：水野下野守は篠橋攻め衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 結城市「水野家物語」でも信元の長島参陣を確認できる。
        // https://www.city.yuki.lg.jp/kosodate-kyouiku/shougaigakushuu/column/page008595.html
        // 本陣への立ち寄り・采配・腰の刀は復元。既に降った篠橋の守将にはしない。
        // 長島専用の具足と既存の形・材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'mizuno_nobumoto', name: '水野信元', x: -42, z: 66, flag: NAMED_GEAR['水野信元'].flag,
          words: 'わしらも篠橋の攻めを務めた。残る囲みの備えを怠るな' },
        // 公記巻七「河内長島」：飯沼勘平は早尾口の先陣、のち篠橋攻め衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 諱は断定せず史料の通称を使う。本陣への立ち寄り・采配・腰の刀は復元。
        // 浅井新八と具足の形・材質を共用する指揮像。戦闘兵と毎コマの処理は増減させない。
        { id: 'iinuma_kanpei', name: '飯沼勘平', x: -54, z: 54, flag: NAMED_GEAR['飯沼勘平'].flag,
          words: '早尾口の先陣と篠橋の攻めを務めた。残る囲みも隙を作るな' },
        // 公記巻七の早尾口先陣「丸毛兵庫、同三郎兵衛」。諱・両者の続柄は断定しない。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像だけを補う。
        // 共通の形・材質を使い、戦闘兵や毎コマの処理は増減させない。
        { id: 'marumo_hyogo', name: '丸毛兵庫', x: -54, z: 42, flag: NAMED_GEAR['丸毛兵庫'].flag,
          words: '丸毛兵庫じゃ。早尾口の先陣を務めた。岸の囲みも緩めるな' },
        { id: 'marumo_saburobei', name: '丸毛三郎兵衛', x: -60, z: 48, flag: NAMED_GEAR['丸毛三郎兵衛'].flag,
          words: '丸毛三郎兵衛じゃ。わしも早尾口の先陣に加わった。岸の備えを頼むぞ' },
        // 公記巻七「河内長島」：森勝蔵は信忠の一江口御伴衆。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と既存の指揮像を共用する。
        // 当日の名槍・立物・個人の馬印を断定せず、木瓜は織田方の所属旗とする。
        // 戦闘兵は替えず、後年の鬼武蔵の武勇を語る台詞や毎コマの処理は足さない。
        { id: 'mori_nagayoshi', name: '森長可', x: 42, z: 48, flag: 'oda',
          words: '信忠様と東の一江口を受け持つ。そなたらは岸の備えを守れ' },
        // 公記巻七「河内長島」：斎藤新五は信忠の一江口御伴衆。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。長島専用の具足と共通の形・材質を使う。
        // 高画質の指揮像のみ補い、戦闘兵と毎コマの処理は増減させない。
        { id: 'saito_toshiharu', name: '斎藤利治', x: 48, z: 54, flag: NAMED_GEAR['斎藤利治'].flag,
          words: '斎藤新五じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七「河内長島」の一江口御伴衆・簗田左衛門太郎。諱は断定しない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に既存の形と材質を共用する。
        // 戦闘兵や毎コマの処理は増減させず、旗は織田方の所属だけを示す。
        { id: 'yanada_saemontaro', name: '簗田左衛門太郎', x: 54, z: 66, flag: NAMED_GEAR['簗田左衛門太郎'].flag,
          words: '簗田左衛門太郎じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        // 公記巻七の一江口御伴衆・長谷川與次。諱は補わず史料の通称を使う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質だけの指揮像に共通の形・材質を使う。
        // 戦闘兵と毎コマの処理は増減させず、個人の馬印や豪傑の型は補わない。
        { id: 'hasegawa_yoji', name: '長谷川與次', x: 60, z: 48, flag: NAMED_GEAR['長谷川與次'].flag,
          words: '長谷川與次じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七「河内長島」の一江口御伴衆・梶原平次。諱は補わない。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像だけを補う。
        // 既存の形と材質を共用し、戦う兵と毎コマの処理は増減させない。
        { id: 'kajiwara_heiji', name: '梶原平次', x: 66, z: 60, flag: NAMED_GEAR['梶原平次'].flag,
          words: '梶原平次じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七の一江口御伴衆・坂井越中守。諱は補わず、史料の通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像に共通の形と材質を使う。
        // 戦う兵と毎コマの処理は増減させず、本人固有の馬印・豪傑の型は作らない。
        { id: 'sakai_etchunokami', name: '坂井越中守', x: 66, z: 66, flag: NAMED_GEAR['坂井越中守'].flag,
          words: '坂井越中守じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        // 公記巻七の一江口御伴衆・山田三左衛門と和田新介。記録の通称で補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像で既存の形・材質を共用する。
        // 戦闘兵は替えず、個人の馬印・豪傑の型・毎コマの処理は足さない。
        { id: 'yamada_sanzaemon', name: '山田三左衛門', x: 60, z: 54, flag: NAMED_GEAR['山田三左衛門'].flag,
          words: '山田三左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        { id: 'wada_shinsuke', name: '和田新介', x: 66, z: 48, flag: NAMED_GEAR['和田新介'].flag,
          words: '和田新介じゃ。わしも信忠様と一江口に加わっておる。岸の囲みを緩めるな' },
        // 公記巻七「河内長島」の一江口御伴衆・中島豊後守。諱は補わない。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質の指揮像のみ。本陣への立ち寄り・采配・腰の刀は共通部品による復元。
        // 戦闘兵と毎コマの処理は増減させず、個人の馬印・豪傑の型は作らない。
        { id: 'nakajima_bungonokami', name: '中島豊後守', x: 72, z: 54, flag: NAMED_GEAR['中島豊後守'].flag,
          words: '中島豊後守じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七の一江口御伴衆・関小十郎衛門。諱は断定せず通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿・腰の刀は復元。高画質の指揮像と所属旗の形・材質を共用する。
        // 戦う兵や毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'seki_kojuroemon', name: '関小十郎衛門', x: 72, z: 60, flag: NAMED_GEAR['関小十郎衛門'].flag,
          words: '関小十郎衛門じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        // 公記巻七：市橋九郎左衛門は早尾口先陣、のち丹羽・不破彦三と押付郷の陣。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の指揮像だけを補う。
        // 共通の形・材質を使い、戦闘兵と毎コマの処理は増減させない。
        { id: 'ichihashi_kurozaemon', name: '市橋九郎左衛門', x: 54, z: 60, flag: NAMED_GEAR['市橋九郎左衛門'].flag,
          words: '市橋九郎左衛門じゃ。早尾口の先陣を務め、今は丹羽殿や不破彦三殿と長島の東を囲んでおる' },
        // 公記巻七「河内長島」の早尾口先陣・中条将監、飯尾隠岐守。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配・腰の刀は復元。諱・固有の立物・馬印は断定しない。
        // 高画質の指揮像に共通の形・材質を使い、戦う兵と毎コマの処理は増減させない。
        { id: 'chujo_shogen', name: '中条将監', x: -60, z: 60, flag: NAMED_GEAR['中条将監'].flag,
          words: '中条将監じゃ。早尾口の先陣に加わった。岸の囲みも緩めるな' },
        { id: 'iio_okinokami', name: '飯尾隠岐守', x: -66, z: 54, flag: NAMED_GEAR['飯尾隠岐守'].flag,
          words: '飯尾隠岐守じゃ。わしらも早尾口の先陣を務めた。岸の備えを頼むぞ' },
        // 公記巻七の篠橋攻め衆。既に降った篠橋の守将にはせず、包囲側の将として補う。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質だけの指揮像で共通の形・材質を使う。
        // 戦闘兵は替えず、毎コマの処理・個人の馬印・豪傑の型は増やさない。
        { id: 'tsuda_osumi', name: '津田大隅守', x: -60, z: 66, flag: NAMED_GEAR['津田大隅守'].flag,
          words: '津田大隅守じゃ。早尾口の先陣と篠橋の攻めを務めた。残る囲みも緩めるな' },
        { id: 'yokoi_utanosuke', name: '横井雅楽助', x: -66, z: 42, flag: NAMED_GEAR['横井雅楽助'].flag,
          words: '横井雅楽助じゃ。わしらも篠橋の攻めを務めた。岸の備えを怠るな' },
        // 公記巻七の一江口御伴衆。諱は補わず、装備と本陣への立ち寄りは復元。
        // https://ja.wikisource.org/wiki/信長公記
        // 共通の指揮像・具足・腰の刀を使い、戦闘兵と毎コマの処理は増減させない。
        { id: 'sato_rokuzaemon', name: '佐藤六左衛門', x: 78, z: 66, flag: NAMED_GEAR['佐藤六左衛門'].flag,
          words: '佐藤六左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも頼むぞ' },
        // 公記巻七の一江口御伴衆。通称で補い、本陣への立ち寄り・采配姿は復元とする。
        // https://kininaruart.com/artist/shincho/n7.html
        // 高画質だけの指揮像。既存の具足・刀・材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'ichihashi_denzaemon', name: '市橋伝左衛門', x: 78, z: 54, flag: NAMED_GEAR['市橋伝左衛門'].flag,
          words: '市橋伝左衛門じゃ。信忠様と東の一江口を受け持つ。岸の囲みも緩めるな' },
        { id: 'tsukamoto_kodaizen', name: '塚本小大膳', x: 84, z: 60, flag: NAMED_GEAR['塚本小大膳'].flag,
          words: '塚本小大膳じゃ。わしらも一江口の御供を務めた。岸の備えを頼むぞ' },
        // 公記巻七の一江口御伴衆。諱は断定せず、記録の通称を使う。
        // https://ja.wikisource.org/wiki/信長公記
        // 本陣への立ち寄り・采配姿は復元。高画質の指揮像と所属旗に既存部品を共用する。
        // 戦闘兵・毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'tsuda_hanzaemon', name: '津田半左衛門', x: 84, z: 54, flag: NAMED_GEAR['津田半左衛門'].flag,
          words: '津田半左衛門じゃ。信忠様と東の一江口を受け持つ。岸の備えも緩めるな' },
        { id: 'tsuda_matajuro', name: '津田又十郎', x: 90, z: 60, flag: NAMED_GEAR['津田又十郎'].flag,
          words: '津田又十郎じゃ。わしも一江口の御供を務めた。岸の囲みを頼むぞ' },
        { id: 'tsuda_ichinosuke', name: '津田市介', x: 84, z: 66, flag: NAMED_GEAR['津田市介'].flag,
          words: '津田市介じゃ。一江口の御供と篠橋の攻めを務めた。残る囲みも緩めるな' },
        // 公記巻七の一江口御伴衆、のち篠橋攻め衆から抜けていた津田孫十郎。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄り・采配・腰の刀は復元。高画質の共通指揮像と所属旗だけを補う。
        // 形と材質を共用し、戦闘兵と毎コマの処理は増減させない。
        { id: 'tsuda_magojuro', name: '津田孫十郎', x: 96, z: 60, flag: NAMED_GEAR['津田孫十郎'].flag,
          words: '津田孫十郎じゃ。一江口の御供と篠橋の攻めを務めた。岸の囲みも緩めるな' },
        // 公記巻七では伊藤三丞も安宅船で参陣。諱は補わず史料の通称で示す。
        // https://kininaruart.com/artist/shincho/n7.html
        // 本陣への立ち寄り・采配姿は復元。既存の指揮像と具足を共用し、戦う兵は替えない。
        { id: 'ito_sanjo', name: '伊藤三丞', x: 90, z: 54, flag: NAMED_GEAR['伊藤三丞'].flag,
          words: '伊藤三丞じゃ。安宅船で参った。川の囲みは船の衆が守る。岸の備えも頼むぞ' },
        // 公記巻七の安宅船の将・水野監物。篠橋攻め衆の水野下野守とは分ける。
        // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
        // 本陣への立ち寄り・采配姿は復元。高画質だけで共通の形・材質を使う。
        // 戦闘兵・毎コマの処理は増減させず、個人の立物・馬印・豪傑の型は補わない。
        { id: 'mizuno_kenmotsu', name: '水野監物', x: 90, z: 66, flag: NAMED_GEAR['水野監物'].flag,
          words: '水野監物じゃ。わしらも安宅船で囲みに加わった。岸の備えも怠るな' },
      ];
      for (const visitor of F.visitingGenerals) {
        visitor.figure = commandFigure(visitor.name);
        visitor.figure.position.set(visitor.x, W.heightAt(visitor.x, visitor.z), visitor.z);
        visitor.figure.rotation.y = Math.PI;
        // 木瓜・三引両・違い筋・折敷に三文字・棕櫚・揚羽蝶は所属を示す。個人の馬印ではない。
        visitor.banner = nobori(W, visitor.x + 2, visitor.z + 1, visitor.flag, 5);
        rt.scene.add(visitor.figure, visitor.banner);
        rt.addInteract(visitor.id, () => F.step < 2 ? visitor : null,
          visitor.name + 'に声をかける', () => rt.say(visitor.name, visitor.words, 3), { r: 3 });
      }
      F.visitorBanners = visitorBanners(rt,
        [F.nobuhiroBanner, F.nobutsuguBanner, ...F.visitingGenerals.map(visitor => visitor.banner)]);
    }
    const kukiGear = NAMED_GEAR['九鬼嘉隆'];
    shipGeneral(F.ship, '九鬼嘉隆');
    rt.scene.add(F.ship);
    const sn = nobori(W, 84, CH_Z - 2, kukiGear.flag, 5); sn.position.y = F.ship.position.y + .8; rt.scene.add(sn);
    F.ships = [{ m: F.ship, flag: sn, x0: 60, x1: 110, z: CH_Z - 2, x: 84, dir: 1, speed: 0.6, soundPos: { x: 84, z: CH_Z - 2 }, t: 4 }];
    // 中央は退城舟の通り道。高画質の林・島田の囲船は西の離れた航路へ置く復元。
    // 二将の姿と所属旗を保ち、既存の小型船・形・材質を共用する。
    const shipRoutes = [[118, 170, CH_Z + 4, .5, '滝川一益']];
    if (SETTINGS.quality === 'high') shipRoutes.push(
      [-116, -88, CH_Z - 5, .45, '林秀貞'], [-154, -128, CH_Z - 5, .45, '島田所之助']);
    for (const [x0, x1, z, sp, name] of shipRoutes) {
      const m2 = ataka(x0 !== 118);
      if (x0 !== 118) m2.traverse(c => { c.castShadow = false; });
      const x = (x0 + x1) / 2;
      m2.position.set(x, waterHeight(W, x, z) - 0.45, z);
      m2.rotation.y = Math.PI / 2 + 0.1;
      rt.scene.add(m2);
      const shipFlag = NAMED_GEAR[name].flag;
      const sn2 = nobori(W, x, z, shipFlag, 5); sn2.position.y = m2.position.y + .8; rt.scene.add(sn2);
      if (x0 !== 118) sn2.traverse(c => { c.castShadow = false; });
      F.ships.push({ m: m2, flag: sn2, x0, x1, z, x, dir: 1, speed: sp, soundPos: { x, z }, t: 3 + Math.random() * 3 });
    }
    blockadeFleet(rt);
    // 信長公記巻七では滝川一益も安宅船で河口を塞ぐ。岸の組頭と兼ねさせない。
    // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
    F.takigawaShip = F.ships[1].m;
    shipGeneral(F.takigawaShip, '滝川一益');
    if (SETTINGS.quality === 'high') {
      // 公記巻七「河内長島」：島田所助・林佐渡守は囲船を拵えて参陣。
      // https://ja.wikisource.org/wiki/信長公記
      // 西の小型船を用い、林の居船の位置・形と采配姿は復元。名刀・個人の馬印は補わない。
      // 指揮像は船の子として一度だけ作る。形と材質は既存品を共用し、戦闘兵は替えない。
      F.hayashiShip = F.ships[2].m;
      shipGeneral(F.hayashiShip, '林秀貞');
      // 島田所之助も囲船の将として補う。諱の同定を避け、公記の通称で示す。
      // https://kininaruart.com/artist/shincho/n7.html
      // 西寄りの位置・航路・采配姿は復元。小型船・具足・材質を共用し、戦闘兵は増減させない。
      F.shimadaShip = F.ships[3].m;
      shipGeneral(F.shimadaShip, '島田所之助');
      // 三つ団子の馬印を船尾へ。長島当日の使用は復元。船の子にして旋回にも追従させる。
      const mark = campMark('滝川一益');
      mark.position.set(0, -.1, -3.5); F.takigawaShip.add(mark);
    }
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', fixed: true, anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 8, aggro: 10, formation: 'yari', yariRanks: 3 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: false } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], { ...ODA, flag: NAMED_GEAR['柴田勝家'].flag }));
    F.shibaU = F.shiba.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', fixed: true, anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 6, formation: 'line', ranks: 2, aggro: 36, fire: false },
      dress([{ type: 'busho', n: 1, o: { name: '鉄砲組頭', invuln: true, horse: false } }, { type: 'gun', n: 12 }], ODA));
    rt.after(12, () => { if (F.step === 1) rt.say('鉄砲組頭', 'こちらの鉄砲で対岸を抑える。横木の内で縄を締めよ', 3); });
    // 公記巻七の早尾口先陣に前田又左衛門。岸への加勢・徒歩の立ち位置は遊び上の復元。
    // https://kininaruart.com/artist/shincho/n7.html
    // 高画質だけに一人補い、既存の槍兵は減らさない。朱柄槍と豪傑の型は共通の得物表を使う。
    // 三間半の朱柄は伝承による姿で、長島当日の得物の確証とはしない。個人の馬印は補わない。
    const reliefTroops = [{ type: 'ashigaru', n: 8 }];
    if (SETTINGS.quality === 'high') reliefTroops.unshift({ type: 'busho', n: 1,
      o: { name: '前田利家', horse: false, invuln: true, flag: NAMED_GEAR['前田利家'].flag } });
    F.relief = allyGroup(rt, { name: '岸の助けの槍組', fixed: true, noAI: true, anchor: { x: 24, z: BANK_Z + 30 }, facing: Math.PI, formation: 'yari', yariRanks: 2, aggro: 0, fire: false }, dress(reliefTroops, ODA));
    for (const u of F.relief.units) {
      u.noTarget = true;
      // 岸の密集では三間半の長槍を頭上で回さず、腰の溜めと踏み込みで槍の又左を表す。
      // 長島の高画質の利家だけに既存の突きの型を使う。得物・兵数・攻撃力は保つ。
      if (u.name === '前田利家') u.look.style = 'gouketsu_thrust';
    }
    F.oda = [F.shiba, F.teppo]; F.defenders = [F.shiba, F.teppo, F.relief];
    // 地形に固定した出現場所を守った上で、大将は槍の列の後ろへ置く。
    for (const g of F.oda) {
      const u = g.units[0];
      g.historicalOrders = true; g.noPursue = true;
      // 初めだけ後ろへ置いても、共通の並び直しで先頭へ戻る。持ち場も後列にする。
      const oldSlot = g.slotPos, rear = { x: 0, z: 0 };
      g.slotPos = function (i, n) {
        if (i !== u.slot || this.order === 'path') return oldSlot.call(this, i, n);
        rear.x = this.anchor.x; rear.z = this.anchor.z + 7;
        return rear;
      };
      u.pos.x = g.anchor.x; u.pos.z = g.anchor.z + 7;
      u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -10, z: BANK_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：輪中を囲む織田勢 ----
    // 背後へ自動で足す控えは長い槍の形が固定。岸から見える四隊は本体だけにし、
    // 控えと同じ短めの槍を使う。戦う兵・備えの位置・陣形への結び付けは保つ。
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed, flagRate: .12, spearScale: .65, host: false });
    DA(-90, 0, 36, 24, 180, Math.PI * 0.65, 0x2a2622, 'oda', 15741);
    DA(110, 4, 36, 24, 180, -Math.PI * 0.65, 0x2a2622, 'eiraku', 15742);
    DA(0, 96, 52, 24, 240, Math.PI, 0x2a2622, 'oda', 15743);
    DA(-150, -150, 36, 24, 160, Math.PI * 0.25, 0x2a2622, 'oda', 15744);
    for (const [x, z] of [[-24, 50], [24, 52]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '岸の柵を結わせ、舟に備えよ' : hi(rt) ? '柴田の一手を率い、岸の柵を守れ' : '横木の印へ進み、味方と直せ', 'main');
    rt.banner('川が砦を守る長島', '対岸は門徒の島。あなたの持ち場は、手前の柵');
    rt.say('柴田勝家', rt.G.lord ? '殿、対岸は門徒の島。岸の柵を結わせ、舟に備えまする' : `${nm(rt)}、川を渡るな。目の前の横木を直し、舟に備えよ`, 4);
    rt.after(18, () => { if (F.step < 2) rt.say('物見', '七月からの囲みじゃ。島では食う物も尽きかけておる', 3); });
    rt.after(5, () => { this.build(rt); sfx('eshout', .6); rt.bark('対岸から矢！　柵の手前で横木を直せ', true); });
  },

  // ① 柵を結う
  build(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    // 終日の持ち場へ移る間に日を進める。包囲の長さを待ち時間へは換えない。
    advanceDay(F.kakoi, 3);
    for (const g of F.last) campWear(g, 40, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 40, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 40, F.kakoi.morale);
    rt.setPhase('build');
    rt.unmark('shiba');
    rt.obj('main', rt.G.lord ? `岸の柵を結わせ、門徒に備えよ（${SPOTS.length}か所）` : '足元の横木で「縄を締める」を長押し', 'main');
    rt.say('柴田勝家', '杭に横木を渡せ！　縄を締め、川岸を固めよ', 3);
    F.teppo.fire = true;
    for (const g of F.bankBows) { g.fire = true; for (const u of g.units) u.noTarget = false; }
    // 信長で遊ぶ時：柵は足軽が結う（手柄にはしない）。当主は岸で門徒に備える
    F.builders = []; F.personalWork = [0, 0, 0];
    const workers = F.shiba.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.stdHeld && !u.banner && u.type === 'ashigaru');
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i], u = workers[i], mate = workers[i + 3];
      if (u) { for (const worker of [u, mate]) if (worker?.hand) {
        const rope = new THREE.Mesh(WORK_ROPE, DARK); rope.rotation.x = Math.PI / 2; rope.scale.set(1.5, 1, 1.5);
        rope.position.set(0, 0, .1); worker.hand.add(rope); worker.workRope = rope;
      } }
      if (u) F.builders.push({ u, mate, mateAt: { x: s.x - 1, z: s.z + 1 }, i, x: s.x + 1, z: s.z + 1, t: 0 });
    }
    const oldSlot = F.shiba.slotPos;
    F.shiba.slotPos = function (i, n) {
      for (const job of F.builders) if (F.step >= 1 && F.step < 3 && !F.raised?.[job.i]) {
        if (job.u.slot === i) return job;
        if (job.mate?.slot === i) return job.mateAt;
      }
      return oldSlot.call(this, i, n);
    };
    F.helped = true; // 人足は初めから並行して補修する。本人は近い一か所を手伝える。
    if (!rt.G.lord) {
      for (let i = 0; i < SPOTS.length; i++) {
        const s = SPOTS[i];
        if (i === 0) rt.marker('s' + i, { x: s.x, z: s.z + 2 }, '柵の横木に縄を締める', { h: .6 });
        // 盛り土の上で輪の端が空へ浮くため、作業場所は案内札だけで示す。
        rt.addInteract('s' + i, { x: s.x, z: s.z + 2 }, '縄を締める', () => {
          const job = F.builders.find((j) => j.i === i), u = job?.u;
          if (F.step !== 1 || F.raised?.[i] || !canWorkBank(u) || Math.hypot(u.pos.x - job.x, u.pos.z - job.z) >= 2.5) return;
          F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1; F.personalWork[i] = BUILD_HOLD; this.raise(rt, i);
        }, { r: 3, hold: HELP_HOLD });
      }
    }
    // 対岸と矢・鉄砲を交わす。退城の兵は降伏の報せまで舟を寄せない。
  },

  raise(rt, i) {
    const F = rt.flags;
    const s = SPOTS[i];
    if (F.raised?.[i]) return;
    (F.raised || (F.raised = []))[i] = true;
    rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i);
    const segs = F.fenceWork[i];
    fenceProgress(segs, BUILD_HOLD, BUILD_HOLD);
    for (const q of segs) {
      q.noTarget = false; q.wall = true; q.segR = 0.7; q.name = '柵';
      // 本人が手を貸した横木は補強され、実際の反撃にも長く持つ。
      if (F.personalWork[i] > 0) q.hp = q.maxHp = 900;
    }
    F.fence = [...(F.fence || []), ...segs];
    sfx('wood', 0.8);
    F.built++;
    const job = F.builders?.find(j => j.i === i);
    for (const u of [job?.u, job?.mate]) if (u?.alive) {
      if (u.cover === job.workAt || u.cover === job.mateAt) u.cover = null;
      if (u.wpn) u.wpn.visible = true;
      if (u.workRope) u.workRope.visible = false;
    }
    // 見張りへ移った後の補修完了では、現在の下知と印を差し替えない。
    if (F.step !== 1) return;
    // 案内中の横木を人足が先に結った時は、残る作業の印へ送り直す。
    if (!rt.G.lord && !F.participated && F.built < SPOTS.length) {
      const next = SPOTS.findIndex((_, n) => !F.raised[n]);
      if (next >= 0) rt.marker('s' + next, { x: SPOTS[next].x, z: SPOTS[next].z + 2 }, '次の横木に縄を締める', { h: .6 });
    }
    if (F.helped && !F.personalBuilt) {
      if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
      return;
    }   // 足軽が代わりに結った分は手柄にしない
    if (F.personalBuilt && !F.workAwarded) {
      F.workAwarded = true;
      rt.award((t) => { t.special = { label: '味方と岸に柵を結った', pts: 12 }; }, '味方と横木を結った');
      rt.say('足軽', '縄が締まった！　残りは任せて、川を見てくれ', 3);
    }
    // 一か所を手伝えば見張りへ移る。残る人足の補修はそのまま続ける。
    if (F.participated) { this.watch(rt); return; }
    if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
    else rt.objProgress('main', `残りは味方に任せよ　柵 ${F.built}／${SPOTS.length}か所`);
  },

  watch(rt) {
    const F = rt.flags;
    F.step = 1.25; F.stepT = rt.t; F.watchAt = 0; F.watchTime = 0;
    F.watchSpot = nearestBankSpot(rt.player.u.pos);
    // 未完成の横木の古い印と操作を、舟の見張りへ持ち越さない。
    for (let i = 0; i < SPOTS.length; i++) { rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i); }
    for (const job of F.builders || []) if (F.raised?.[job.i]) for (const u of [job.u, job.mate]) if (u?.alive && u.wpn) { u.wpn.visible = true; if (u.workRope) u.workRope.visible = false; }
    rt.unmark('workWatch');
    rt.obj('main', '岸で川を向き、舟を見張れ', 'main');
    rt.say('柴田勝家', 'その岸で川を見よ。ほかの岸は味方に任せよ', 3);
    rt.marker('watch', { x: SPOTS[F.watchSpot].x, z: BANK_Z + 5 }, '水路を見張る持ち場', { hideNear: 5, hideOnArrival: true });
  },

  // ② 降伏して退城する舟。射撃の下知後は実際の弾と傷が通る。舟を討つ任務にはしない。
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    // 退城と反撃の前に持ち場へ移った扱い。近くで架空の討死を演じず、後の史実の報せへつなぐ。
    if (F.nobuhiroFigure) F.nobuhiroFigure.visible = false;
    if (F.nobuhiroBanner) F.nobuhiroBanner.visible = false;
    rt.uninteract('nobuhiro');
    if (F.nobutsuguFigure) F.nobutsuguFigure.visible = false;
    if (F.nobutsuguBanner) F.nobutsuguBanner.visible = false;
    rt.uninteract('nobutsugu');
    // 立ち寄った将は担当の囲みへ戻る。信広らの討死と混同させない。
    if (F.visitorBanners) F.visitorBanners.visible = false;
    if (F.visitingGenerals) for (const visitor of F.visitingGenerals) {
      visitor.figure.visible = visitor.banner.visible = false;
      rt.uninteract(visitor.id);
    }
    advanceDay(F.kakoi, 6);
    for (const g of F.last) campWear(g, 55, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 55, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 55, F.kakoi.morale);
    // 降伏の報せで岸の応酬を止める。退城舟への射撃と、その後の反撃を混ぜない。
    for (const g of F.bankBows) {
      g.fire = false;
      for (const u of g.units) { u.target = null; u.atk = null; u.noTarget = true; u.pinT = Infinity; }
    }
    rt.setPhase('boats'); rt.unmark('workWatch'); rt.unmark('watch');
    F.shiba.fire = false; F.teppo.fire = false;
    rt.say('伝令', F.watchDone ? '長島が降った。退く舟には手を出すな' : '見張りは足りぬ。長島が降った。岸へ戻れ、舟は討つな', 4);
    rt.obj('main', '岸の柵へ戻り、退く舟を見張れ', 'main');
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    bankNews(rt, '長島城、降伏にござる。城の者は舟で退くとのこと。岸の備えを解かれぬよう', '長島城が降った。舟で退城する');
    for (const g of F.last) { g.anchor.z = BANK_Z + 2; g.aggro = 0; }
    rt.after(6, () => {
      if (F.ending || F.step !== 2) return;
      rt.say('伝令', '退く舟を撃てとの下知。退城の約束を破る命じゃ', 4);
    });
    rt.after(8, () => {
      if (F.ending || F.step !== 2 || !rt.player.u.alive) return;
      F.teppo.fire = true;
      for (const u of F.last[0].units) if (u.alive && !u.woundOut && !u.rearWound) u.noTarget = false;
      battleEvent(rt, EVENT_VOLLEY, { x: 0, z: CH_Z }, F.teppo, 0, true, '退く舟へ、織田方の鉄砲が放たれた');
      rt.obj('main', '柵の手前へ戻り、味方と反撃に備えよ', 'main');
      rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '柵の手前で反撃に備える');
      rt.say('鉄砲組頭', '舟から反撃が来るぞ！　柵の手前で構えよ', 4);
    });
    // 射撃を続けて反撃の前に舟の者を全滅させない。矢玉と傷はそのまま残す。
    rt.after(14, () => { if (F.step === 2 && !F.ending) F.teppo.fire = false; });
    // 降伏の舟を見届けてから射撃。約十四秒かけて岸へ寄り、同じ門徒が反撃する。
    rt.after(12, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('舟が岸へ寄る！　味方の後ろに退く道を空けよ', true);
      // 一つだけの行き先の印は、反撃に備える柵に残す。
      sfx('eshout', .6);
    });
    rt.after(15, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('岸に足音！　刀を抜いて来るぞ', true); sfx('stepWet', .9);
    });
    rt.after(16, () => this.lastSally(rt));
  },

  // ④ 反撃ののち、中江・屋長島の外へ柵をつなぎ直す。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t; F.finalHeld = 0; F.finalSafe = 0; F.finalStarted = null;
    rt.setPhase('enclose'); rt.unmark('bank'); rt.unmark('retreat');
    F.hurtShown = false;
    surroundForts(rt);
    rt.army.play('sig_nobiki', F.shiba.anchor, .85);
    rt.obj('main', '退き太鼓の二つ打ち。東の柵へ移り、印で縄を確かめよ', 'main');
    F.finalChecks = [false, false, false]; F.finalChecked = 0; F.finalCheckDone = []; F.finalCheckT = 0;
    for (let i = 0; i < 3; i++) {
      const spot = CHECK_SPOTS[i], id = 'check' + i;
      if (i === 0) rt.marker(id, spot, CHECK_NAMES[i]);
      // 戦っている間や、まだ順番でない場所には押せる札を出さない。
      rt.addInteract(id, () => F.step === 3.5 && F.finalReady && !dangerProgress(rt) && F.finalChecks.indexOf(false) === i ? spot : null, `縄を確かめる（${i + 1}／3）`, F.finalCheckDone[i] = () => {
        if (F.step !== 3.5 || !F.finalReady || F.finalChecks[i]) return;
        F.finalChecks[i] = true; F.finalChecked++;
        if (F.finalChecked === 3) { F.finalHeld = 0; F.finalSafe = 0; }
        rt.uninteract(id); rt.unmark(id);
        const next = F.finalChecks.indexOf(false);
        if (next >= 0) rt.marker('check' + next, CHECK_SPOTS[next], CHECK_NAMES[next]);
        else rt.marker('east', { x: 24, z: BANK_Z + 6 }, '柵を見張る持ち場');
      }, { r: 3, hold: CHECK_HOLD, prio: 5 });
    }
    rt.say('柴田勝家', F.sallyFailed ? '法螺貝と退き太鼓じゃ！　敵を向き、味方と東の柵へ下がれ' : '退き太鼓の二つ打ちじゃ。追わずに東の柵へ移れ。中江と屋長島の囲みを固めよ', 4);
    rt.after(8, () => {
      if (F.ending || F.step !== 3.5) return;
      bankNews(rt, '織田信広様をはじめ、御一門に討死多しとの報せにござる', '一門の討死の報せが届いた');
    });
    for (const g of F.oda) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = [[g.anchor.x, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 6]];
      g.pathIdx = 0; g.aggro = 4;
      g.onArrive = (q) => { q.order = 'hold'; q.formation = q === F.shiba ? 'yari' : 'line'; q.facing = Math.PI; q.aggro = 14; };
    }
  },

  // ③ 舟への射撃を受けた門徒の反撃。鎧のない歩兵が、岸を南へ突き抜ける。
  lastSally(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    // 反撃が始まったら未完成の人足も槍を持ち、岸の守りへ戻る。
    for (const job of F.builders || []) for (const u of [job.u, job.mate]) if (u?.alive) {
      if (u.cover === job.workAt || u.cover === job.mateAt) u.cover = null;
      if (u.wpn) u.wpn.visible = true;
      if (u.workRope) u.workRope.visible = false;
    }
    F.shiba.fire = true; F.teppo.fire = true;
    rt.setPhase('sally');
    rt.unmark('bank');
    F.sallyHeld = 0; F.bankAway = 0; F.pushTime = 0; F.sallyStart = rt.t;

    rt.army.play('sig_atsumare', F.shiba.anchor, .85);
    rt.obj('main', '法螺貝の二声。味方の列に集まり、柵の手前で門徒を止めよ', 'main');
    rt.say('柴田勝家', '法螺貝の二声、集まれの合図じゃ！　門徒が来る。柵の手前で構えよ', 4);
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    // 最初の舟は二隊に分けて寄せ、残りの舟は後から着岸する。同じ四十五人を使う。
    this.sallyWave(rt, 0);
    rt.after(SHORE_DELAY, () => this.sallyWave(rt, 1));
    // 第一陣を早く退ければ、同じ後続舟が早く動く。新しい兵は作らない。
    F.rearBoatAt = null; F.shoreQuiet = 0;

    // 槍組は西の先陣、鉄砲衆は東を受け、中央でも互いの列が途切れないようにする。
    for (const [g, x] of [[F.shiba, -8], [F.teppo, 12]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  sallyWave(rt, i) {
    const F = rt.flags, g = F.last[i];
    if (F.step !== 3 || F.ending || g.sallyReleased) return;
    g.sallyReleased = true; g.noRout = false;
    // 射撃への怒りで気力は戻るが、空腹の疲れや受けた傷は戻さない。
    g.morale = Math.max(g.morale, 82);
    for (const u of g.units) if (u.alive && !u.woundOut && !u.rearWound) {
      // 反撃の先頭は十人。柵作りの早さに関わらず、次の一団とともに待機を解く。
      const firstLanding = rt.t - F.sallyStart < SHORE_DELAY;
      u.shoreWaiting = firstLanding && F.earlyReleased >= 10;
      if (firstLanding && !u.shoreWaiting) F.earlyReleased++;
      u.noTarget = u.shoreWaiting; u.fat = Math.max(u.fat || 0, 0.55);
    }
    // 横木を攻める下知を渡す。通常の突撃だけでは柵越しの敵を選べず、岸で立ち尽くす。
    g.assault = (u) => {
      const wall = rt.army.wallAt(u.pos, u.team, g.anchor);
      return wall && F.fence?.includes(wall) && wall.alive && !wall.opened && !wall.noTarget ? wall : null;
    };
    g.order = 'assault'; g.aggro = 22; g.seekRange = 90;
    g.formation = 'column'; g.colW = 3; g.anchor.z = BANK_Z + 18;
    if (i === 0 && nearTroops(rt, g)) rt.say('門徒', '退けると言うたではないか！　岸へ、道を開け！', 3);
    if (i > 0) rt.bark(i === 2 ? '後の舟が着いた！　東の岸も守れ' : '次の一団が来る！　柵の手前で受け止めよ', true);
  },

  win(rt) {
    const F = rt.flags;
    const held = F.held && F.watchDone && !F.sallyFailed && !F.broken && F.sallyDefended && rt.player.u.alive;
    // 放火の下知まで進んだら、斬り合いが残っていても任務の成否を確定する。
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['shiba', 'workWatch', 'watch', 'bank', 'east', 'retreat']) rt.unmark(id);
    for (let i = 0; i < 3; i++) { rt.unmark('check' + i); rt.uninteract('check' + i); }
    for (let i = 0; i < SPOTS.length; i++) { rt.unmark('s' + i); rt.unzone('s' + i); rt.uninteract('s' + i); }
    rt.obj('main', held ? '岸と包囲の柵を守り切った' : '持ち場を守り切れなかった', 'main');
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '岸と包囲の柵を守った', pts: 20 }; }, '岸と包囲の柵を守った');
    } else {
      rt.objFail('main');
      const why = F.broken ? '岸の背後へ四人以上の敵が二十秒押し込み、持ち場を失った' : F.sallyFailed ? '岸の反撃を受け止めきれなかった' : !F.watchDone ? '岸で舟を見張る務めを果たせなかった' : !F.sallyDefended ? '岸に踏みとどまれなかった' : F.finalChecked < 3 ? '東の柵を三か所確かめ切れなかった' : '東の柵の見張りを果たせなかった';
      F.failureReason = why;
      rt.objProgress('main', why); rt.say('伝令', why, 4);
    }
    // 成否を確定した任務は畳まれる。結末の十八秒間にも、岸に残る下知を一件残す。
    rt.obj('aftermath', '岸に残り、川の方を向け', 'order');
    rt.objProgress('aftermath', held ? '岸と包囲の柵を守り切った' : F.failureReason);
    rt.tracker.main = !!held;
    // 最後に火がかかるのは残る中江・屋長島。願証寺や既に降った長島を混ぜない。
    rt.after(3, () => {
      // 各砦の二か所から着火。ほかの建物へも燃え移るが、火は同時に四つまで。
      for (const s of F.fireTargets) s.fireProof = false;
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.fireTargets.find(q => q !== F.yanaStruct && q.x > 35)]) if (s && s.alive) {
        s.fireProof = false; s.burn = 3; rt.army.igniteStruct(s, s);
      }
      battleEvent(rt, EVENT_FIRE_START, FORT, null, 1, true, '中江・屋長島に火がかけられた');
      rt.obj('aftermath', '岸に残り、川の向こうの煙を見よ', 'order');
      rt.objProgress('aftermath', '岸で煙を見よ。川は渡るな');
      rt.banner('中江・屋長島に火', '柵で囲まれた二つの砦から、煙が上がる');
      rt.say('伝令', '中江、屋長島に火の手！　女も子も籠もっておる。柵に阻まれ、逃げ場がござらぬ', 4);
    });
    rt.after(8, () => rt.say('語り', '二つの砦に籠もる男女およそ二万人が焼かれたと、『信長公記』は伝える', 4));
    rt.after(13, () => rt.say('語り', '翌年、戦場は三河の設楽原へ。次も柵の内で、仲間と踏みとどまる', 4));
    rt.after(18, () => rt.finish({ scriptedEnd: true, failureReason: F.failureReason }, 0.2));
  },

  repairBank(rt, dt) {
    const F = rt.flags;
    if (F.step < 1 || F.step >= 3 || F.built >= SPOTS.length) return;
    for (const job of F.builders) if (!F.raised?.[job.i]) {
      // 槍列の組み直しや遠い射手の見張りより、横木へ歩く仕事を先にする。
      // 既存の持ち場へ向かう処理を使い、近い敵への応戦・負傷・敗走はそのまま通す。
      // 位置の入れ物は一度だけ作り、任務を離れれば短い期限で元の槍列へ戻す。
      const workAt = job.workAt || (job.workAt = { x: job.x, z: job.z, t: 0 });
      workAt.t = job.mateAt.t = rt.army.time + .5;
      for (let n = 0; n < 2; n++) {
        const u = n === 0 ? job.u : job.mate;
        if (!u?.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.stdHeld || u.banner || u.escort) continue;
        if (!u.cover || u.cover === workAt || u.cover === job.mateAt || u.cover.t <= rt.army.time) u.cover = u === job.u ? workAt : job.mateAt;
      }
      if (!job.u.alive || job.u.fleeing || job.u.woundOut || job.u.gone || job.u.noTarget) { job.t = 0; continue; }
      const at = canWorkBank(job.u) && Math.hypot(job.u.pos.x - job.x, job.u.pos.z - job.z) < 2.5 &&
        (!rt.G.lord && !F.helped || canWorkBank(job.mate) && Math.hypot(job.mate.pos.x - (job.x - 2), job.mate.pos.z - job.z) < 2.5);
      if (at) { workHands(job.u, rt.t); if (job.mate) workHands(job.mate, rt.t); }
      // 本人の長押しも人足と一緒に行う。離したら済んだ結び目までを残す。
      if (!rt.G.lord && !F.helped) {
        if (at && rt.holdId === 's' + job.i) F.personalWork[job.i] = Math.max(F.personalWork[job.i], rt.holdT || 0);
        fenceProgress(F.fenceWork[job.i], F.personalWork[job.i], BUILD_HOLD);
      } else {
        const helping = at && !rt.G.lord && rt.holdId === 's' + job.i;
        if (helping) F.personalWork[job.i] = Math.max(F.personalWork[job.i], (rt.holdT || 0) * BUILD_HOLD / HELP_HOLD);
        job.t = at ? Math.min(BUILD_HOLD, Math.max(job.t + dt, F.personalWork[job.i])) : job.t;
        fenceProgress(F.fenceWork[job.i], job.t, BUILD_HOLD);
        if (job.t >= BUILD_HOLD) {
          if (!rt.G.lord && rt.holdId === 's' + job.i && (rt.holdT || 0) >= 2) {
            F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1;
          }
          this.raise(rt, job.i);
        }
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.backBow) F.backBow.visible = rt.player.weapon !== 'bow';
    if (F.backGear) {
      const u = rt.player.u, holder = u.human?.root.visible && u.human.flagHolder;
      const parent = holder || u.mesh;
      if (F.backGear.parent !== parent) parent.add(F.backGear);
      if (holder) { F.backGear.position.set(0, 0, 0); F.backGear.rotation.set(0, 0, 0); }
      else { F.backGear.position.copy(u.body.position); F.backGear.quaternion.copy(u.body.quaternion); }
    }
    bankFootTick(rt);
    // 着岸した兵を開戦から二分まで止めず、反撃開始からの間隔で上陸させる。
    if (F.step >= 3 && rt.t - F.sallyStart >= SHORE_DELAY && !F.shoreOpened) {
      F.shoreOpened = true;
      for (const g of F.last) for (const u of g.units) if (u.shoreWaiting) {
        u.shoreWaiting = false;
        if (u.alive && !u.woundOut && !u.rearWound) u.noTarget = false;
      }
    }
    boatTick(rt, dt);
    fleetTick(rt, dt);
    shoreFootTick(rt);
    this.repairBank(rt, dt);
    if (F.FS) F.FS.tick(dt);
    if (F.closeOrdered) {
      let closed = true;
      for (const job of F.closures) {
        let workers = 0;
        for (const u of job.g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.atk && !u.target?.alive && Math.hypot(u.pos.x - job.x, u.pos.z - job.z) < 3) workers++;
        if (workers >= 2 && job.t < BUILD_HOLD) { job.t = Math.min(BUILD_HOLD, job.t + dt); for (const u of job.g.units) workHands(u, rt.t); }
        fenceProgress(job.segs, job.t, BUILD_HOLD);
        if (job.t >= BUILD_HOLD) for (const u of job.g.units) if (u.alive && u.wpn) u.wpn.visible = true;
        if (job.t < BUILD_HOLD) closed = false;
      }
      F.enclosureClosed = closed;
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 九鬼の船団：川口を行き来し（海の封鎖）、ときどき遠くの射撃を見せる（F.ending の間も動かす）
    for (const sh of F.ships || []) {
      const r = (sh.x1 - sh.x0) / 2, mid = (sh.x0 + sh.x1) / 2;
      if (sh.phase == null) { sh.phase = Math.asin((sh.x - mid) / r); sh.baseZ = sh.z; }
      sh.phase += sh.speed * dt / r;
      sh.x = mid + r * Math.sin(sh.phase); sh.z = sh.baseZ + 1.5 * (1 - Math.cos(sh.phase));
      const yaw = Math.atan2(r * Math.cos(sh.phase), 1.5 * Math.sin(sh.phase));
      const turn = Math.atan2(Math.sin(yaw - sh.m.rotation.y), Math.cos(yaw - sh.m.rotation.y));
      sh.m.rotation.y += Math.max(-0.45 * dt, Math.min(0.45 * dt, turn));
      sh.m.position.set(sh.x, waterHeight(rt.world, sh.x, sh.z) - 0.45, sh.z);
      // 幟には五メートルの竿が含まれる。竿の根元を甲板へ据える。
      sh.flag.position.set(sh.x, sh.m.position.y + .8, sh.z);
      sh.flag.rotation.y = sh.m.rotation.y;
      if ((F.step < 2 || F.step >= 3) && !F.ending && (sh.t -= dt) <= 0) {
        sh.t = 12 + Math.random() * 6;
        sh.soundPos.x = sh.x; sh.soundPos.z = sh.z;
        rt.army.play('gun', sh.soundPos, 0.6);
        rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.2);
      }
    }
    if (F.ending || !rt.player.u.alive) { F.hurtEdge.style.display = 'none'; return; }
    if (!F.breathWarned && rt.player.sta <= rt.player.maxSta * .4) {
      F.breathWarned = true;
      rt.bark('息が上がっている。味方の後ろで休め', true);
    }
    if (F.dangerAt != null && !dangerProgress(rt) && !F.dangerDone) {
      F.dangerDone = true;
      F.sallyTask = null; F.finalTask = null;
      rt.obj('main', F.step === 3.5 ? '東の柵を確かめ、味方と見張れ' : '柵の手前で、味方と門徒を止めよ', 'main');
      rt.say('柴田勝家', '味方のそばへ戻れ。残る敵は一緒に止めよ', 3);
      if (F.step === 3.5) {
        const next = F.finalChecks.indexOf(false);
        rt.marker(next < 0 ? 'east' : 'check' + next, next < 0 ? { x: 24, z: BANK_Z + 6 } : CHECK_SPOTS[next], next < 0 ? '柵を見張る持ち場' : CHECK_NAMES[next]);
      } else rt.marker('bank', { x: 24, z: BANK_Z + 6 }, '槍組と岸を守る');
    }
    const hurt = rt.player.u.hp < rt.player.u.maxHp * .5;
    if (hurt !== F.hurtVisible) { F.hurtVisible = hurt; F.hurtEdge.style.display = hurt ? 'block' : 'none'; }
    if (hurt && !F.hurtShown && (F.step === 3 || F.step === 3.5)) {
      F.hurtShown = true;
      if (!dangerProgress(rt) && !F.dangerDone) rt.marker('retreat', { x: F.step === 3.5 ? 24 : 4, z: BANK_Z + 16 }, '傷が深い！　味方の後ろへ', { guideArea: 'retreat', guideRadius: 3 });
      if (!dangerProgress(rt) && !F.dangerDone) rt.say('足軽', '傷が深い！　敵に向き直り、印へ下がれ', 3);
    } else if (!hurt && F.hurtShown) { F.hurtShown = false; rt.unmark('retreat'); }
    if (F.step === 1) {
      // 結いに来ない時は、柴田が場所とやり方を言い、それでも来なければ足軽が残りを結う（待たせきりにしない）
      const w = rt.t - F.stepT;
      if (w > 8 && !F.boatNews) { F.boatNews = true; rt.say('物見', '島の船着きに人が集まっておる。舟を出すつもりにござろう', 3); }
      rt.objProgress('main', F.built < SPOTS.length ? (rt.G.lord ? `岸で舟に備えよ　柵 ${F.built}／${SPOTS.length}か所` : F.participated ? `残りは味方に任せよ　柵 ${F.built}／${SPOTS.length}か所` : `四秒長押し　柵 ${F.built}／${SPOTS.length}か所`) : '岸の印で舟を見張れ');
      if (!rt.G.lord && !F.participated && F.built < SPOTS.length && w > 12 && !F.nudge) { F.nudge = true; rt.say('柴田勝家', `${nm(rt)}、近い横木を直せ！　ほかの所は味方に任せよ`, 4); }
      if (w > 10 && rt.t >= (F.rescueWorkT || 0)) {
        F.rescueWorkT = rt.t + 4;
        for (let i = 0; i < SPOTS.length; i++) {
          if (F.raised?.[i]) continue;
          const old = F.builders.find((j) => j.i === i);
          if (old && (!old.mate?.alive || old.mate.fleeing || old.mate.woundOut || old.mate.gone || old.mate.noTarget)) {
            old.mate = F.shiba.units.find((q) => q.alive && !q.fleeing && !q.woundOut && !q.gone && !q.noTarget && !q.stdHeld && !q.banner && q.type === 'ashigaru' && !F.builders.some((j) => (j.u === q || j.mate === q) && !F.raised?.[j.i]));
            old.t = 0;
          }
          if (old && old.u.alive && !old.u.fleeing && !old.u.woundOut && !old.u.gone) {
            if (!rt.G.lord && !F.helped && !rt.holdId && w > 35) {
              F.helped = true;
              for (const job of F.builders) job.t = F.personalWork[job.i];
              for (let j = 0; j < SPOTS.length; j++) { rt.uninteract('s' + j); rt.unmark('s' + j); rt.unzone('s' + j); }
              rt.say('足軽', '舟が出るぞ。残りはわしらで結うでよ', 3);
            }
            continue;
          }
          const u = F.shiba.units.find((q) => q.alive && !q.fleeing && !q.woundOut && !q.gone && !q.noTarget && !q.stdHeld && !q.banner && q.type === 'ashigaru' && !F.builders.some((j) => (j.u === q || j.mate === q) && !F.raised?.[j.i]));
          if (!u) continue;
          if (old) { old.u = u; old.t = 0; }
          else F.builders.push({ u, i, x: SPOTS[i].x + 1, z: SPOTS[i].z + 1, mateAt: { x: SPOTS[i].x - 1, z: SPOTS[i].z + 1 }, t: 0 });
          // 倒れた人足だけを替え、本人が結う印は残す。
        }
      }
      if (F.built < SPOTS.length && w > 16 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、手が足りん。わしらも手を貸すでよ', 3); }
      // 補修は人足と並行する。人足を失った時は残る杭で守る。
      // 脇の人足は中央から二十六歩移動してから結う。二十秒で打ち切ると横木が地面に残る。
      if (F.built >= SPOTS.length || w >= 45) {
        if (F.built < SPOTS.length) { F.helped = true; rt.say('柴田勝家', '人足が倒れ、横木が足りぬ。残る杭の内で舟に備えよ', 3); }
        this.watch(rt);
      }
    }
    if (F.step === 1.25) {
      const p = rt.player.u.pos;
      const spot = nearestBankSpot(p), s = SPOTS[spot];
      if (spot !== F.watchSpot) {
        F.watchSpot = spot;
        rt.marker('watch', { x: s.x, z: BANK_Z + 5 }, '水路を見張る持ち場', { hideNear: 5, hideOnArrival: true });
      }
      const near = Math.hypot(p.x - s.x, p.z - (BANK_Z + 5)) < 5;
      const facing = watchingRiver(rt);
      if (near && facing) F.watchTime += dt;
      if (F.watchTime >= WATCH_HOLD) {
        F.watchAt++; F.watchTime = 0;
        if (F.watchAt >= 1) { F.watchDone = true; this.boats(rt); }
      }
      if (F.step === 1.25) {
        if (Math.floor(rt.t) !== F.watchClock) {
          F.watchClock = Math.floor(rt.t);
          rt.objProgress('main', !near ? '見張りの印へ進め。柵の手前で待て' : !facing ? riverTurnText(rt) : `舟を見張れ　${Math.floor(F.watchTime)}／${WATCH_HOLD}秒`);
        }
        // 正しく見張っている最中に、持ち場を離れるよう急がせない。
        if (rt.t - F.stepT >= 6 && !near && !F.watchWarned) { F.watchWarned = true; rt.bark('見張りの印へ進め。川の方を見よ', true); }
        if (rt.t - F.stepT >= 30) this.boats(rt);
      }
    }
    if (F.step === 3) {
      const w = rt.t - F.stepT;
      if (F.rearBoatAt == null && (w >= 85 || w >= 60 && gone(F.last[0]) && gone(F.last[1]))) {
        F.rearBoatAt = rt.t;
        rt.say('物見', '後の舟が動いた！　東の岸で構えよ', 3);
      }
      if (F.rearBoatAt != null && rt.t - F.rearBoatAt >= 15) this.sallyWave(rt, 2);
      const p = rt.player.u.pos;
      const atBank = Math.abs(p.x) < 48 && p.z >= BANK_Z && p.z < BANK_Z + 28;
      if (atBank && !F.broken) { F.sallyHeld += dt; F.bankAway = 0; }
      else if (!F.broken) F.bankAway += dt;
      if (F.bankAway >= 5 && !F.awayWarned) { F.awayWarned = true; rt.bark('岸へ戻れ！　持ち場を空ければ敵が抜けるぞ', true); }
      if (atBank) F.awayWarned = false;
      if (F.bankAway >= 15) dangerWarning(rt);
      let through = 0, pressing = false, shoreFoes = false, landingFoes = false;
      for (const g of F.last) for (const u of g.units) {
        if (g.routed || !u.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget) continue;
        if (u.boatSeat?.aboard) {
          if (g.sallyReleased && !u.boatSeat.escape) {
            pressing = true;
            // 着岸済みの舟で戦う門徒を「次の舟」に数えない。
            if (u.retreatBoat?.landed) landingFoes = true;
          }
          continue;
        }
        if (Math.abs(u.pos.x) < 48 && u.pos.z > BANK_Z + 24 && u.pos.z < BANK_Z + 60) through++;
        if (u.pos.z >= BANK_Z - 12 && u.pos.z < BANK_Z + 36 && Math.abs(u.pos.x) < 60) pressing = shoreFoes = true;
      }
      F.shoreQuiet = !pressing && F.last[2].sallyReleased ? F.shoreQuiet + dt : 0;
      F.breakThrough = through;
      // 味方の人数では落とさない。背後の敵を減らせば押し込みの時間も戻る。
      F.pushTime = through >= 4 ? Math.min(PUSH_HOLD, F.pushTime + dt) : Math.max(0, F.pushTime - dt * 2);
      if (through > 0 && !F.breakWarned) { F.breakWarned = true; rt.bark('背後へ敵が抜けた！　振り向き、味方と止めよ', true); }
      if (through === 0) F.breakWarned = false;
      if (through >= 4) dangerWarning(rt);
      if (w >= SALLY_HOLD && F.pushTime >= PUSH_HOLD && !dangerProgress(rt)) {
        F.broken = true;
        rt.say('柴田勝家', '背後への押し込みを止められぬ。東の柵へ下がれ', 4);
      }
      if (Math.floor(w) !== F.lastClock) {
        F.lastClock = Math.floor(w);
        // 退避の秒数だけで、持ち場を失う押し込みの知らせを隠さない。
        const breach = through >= 4 && !F.broken;
        const waiting = !shoreFoes && !landingFoes && (!F.last[2].sallyReleased || pressing);
        const task = F.broken ? 'lost' : dangerProgress(rt) ? 'retreat' : breach ? 'breach' : !atBank ? 'bank' : shoreFoes || landingFoes ? 'hold' : waiting ? 'boats' : 'watch';
        if (task !== F.sallyTask) {
          F.sallyTask = task;
          rt.obj('main', task === 'lost' ? '岸を破られた。東の柵へ下がれ' : task === 'retreat' ? '危ない！　槍組の後ろへ下がれ' : task === 'breach' ? '振り向き、背後の敵を味方と止めよ' : task === 'bank' ? '岸の柵へ戻り、味方と守れ' : task === 'boats' ? '次の舟に備え、岸で川を見張れ' : task === 'watch' ? '岸で川を向き、味方と見張れ' : '柵の手前で、味方と門徒を止めよ', 'main');
        }
        const boatNews = !F.last[1].sallyReleased
          ? '後の舟が続く。柵の手前で川を見張れ'
          : F.rearBoatAt == null ? '川上にまだ舟がいる。岸で味方と待て'
          : !F.last[2].sallyReleased ? '東の岸へ舟が寄る。柵の手前で構えよ'
          : '川の舟が近づく。柵の手前で構えよ';
        const quietNews = w < SALLY_HOLD
          ? `次の下知まで川を見張れ　あと${Math.ceil(SALLY_HOLD - w)}秒`
          : `東へ移る下知を待て　あと${Math.max(0, Math.ceil(12 - F.shoreQuiet))}秒`;
        rt.objProgress('main', F.broken ? '岸の守りを破られた。東の柵へ下がれ' : breach ? `${dangerProgress(rt) ? '槍組の後ろへ　' : ''}背後の押し込み ${Math.floor(F.pushTime)}／二十秒　続くと岸を失う` : dangerProgress(rt) ? `危ない！　槍組の後ろへ。残り${Math.ceil(15 - (rt.t - F.dangerAt))}秒` : !atBank ? '岸の印へ戻り、味方と川を見張れ' : landingFoes && !shoreFoes ? '着いた舟に敵がいる。柵の手前で味方と止めよ' : waiting ? boatNews : !pressing && F.last[2].sallyReleased ? quietNews : w >= SALLY_HOLD ? '岸に敵が残る。柵の手前で味方と止めよ' : `次の下知まで守れ　あと${Math.ceil(SALLY_HOLD - w)}秒`);
      }
      // 第一陣が散っても終わらせず、後の舟を受ける。小さな押し合いは東の守りへ続ける。
      if (!dangerProgress(rt) && w >= SALLY_HOLD && (F.shoreQuiet >= 12 || w >= SALLY_LIMIT || F.broken)) {
        F.sallyDefended = !F.broken && (F.sallyHeld >= 8 || atBank);
        F.sallyFailed = !!F.broken;
        if (F.sallyDefended) {
          rt.award((t) => t.side.push('二度の上陸を岸で受け止めた'), '二度の上陸を岸で受け止めた');
          rt.say('柴田勝家', `${nm(rt)}、岸をよく支えた。味方を東の守りへ移すぞ`, 3);
        }
        this.midB(rt);
      }
    }

    if (F.step === 3.5) {
      const p = rt.player.u.pos;
      let foes = 0, closeFoes = 0;
      for (const g of F.last) for (const u of g.units) {
        if (g.routed || !u.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget || u.boatSeat?.aboard || u.pos.z < BANK_Z - 3) continue;
        if (Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) < 14) foes++;
        // 味方と戦う門徒が六歩内にいるだけでは縄を確かめる札を消さない。
        // 密着する敵と、本人へ向かう突撃・打ち込みは先に受ける。
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        const attacksPlayer = u.target === rt.player.u || u.atk?.target === rt.player.u ||
          u.swing && !u.swing.done && u.swing.target === rt.player.u;
        if ((d < 2.8 || d < 6 && attacksPlayer) && !rt.army.wallBetween(p, -1, u.pos)) closeFoes++;
      }
      F.finalFoes = foes;
      const atPost = Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18;
      const facing = watchingRiver(rt);
      // 最初の見張りと同じ視線で数える。内陸を見たまま舟の見張りを果たさせない。
      const safe = rt.player.u.alive && atPost && foes === 0 && facing && !dangerProgress(rt);
      // 味方が別の場所で受けている敵は、手元の確認を妨げない。見張りの達成は岸全体が静まってから。
      F.finalReady = rt.player.u.alive && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18 && closeFoes === 0 && !dangerProgress(rt);
      const fighting = F.finalChecked < 3 ? closeFoes > 0 : foes > 0;
      const nextSpot = CHECK_SPOTS[F.finalChecks.indexOf(false)];
      const moving = nextSpot && Math.hypot(p.x - nextSpot.x, p.z - nextSpot.z) >= 3;
      const task = dangerProgress(rt) ? 'retreat' : fighting ? 'fight' : F.finalChecked >= 3 ? 'watch' : moving ? 'move' : 'check';
      if (task !== F.finalTask) {
        F.finalTask = task;
        rt.obj('main', task === 'retreat' ? '危ない！　槍組の後ろへ下がれ' : task === 'fight' ? F.finalChecked < 3 ? 'まず近くの敵を味方と止めよ' : '東の柵で、味方と残る門徒を止めよ' : task === 'watch' ? '東の柵で川を向き、舟を見張れ' : task === 'move' ? '東の柵の印へ進め' : '印で縄を確かめよ', 'main');
      }
      // 退避の印が確認の印を消しても、戻れる状態になったら次の行き先を出し直す。
      if (task !== 'retreat') {
        const next = F.finalChecks.indexOf(false), id = next < 0 ? 'east' : 'check' + next;
        if (!rt.markers.some(m => m.id === id)) rt.marker(id, next < 0 ? { x: 24, z: BANK_Z + 6 } : CHECK_SPOTS[next], next < 0 ? '柵を見張る持ち場' : CHECK_NAMES[next]);
      }
      if (safe && !dangerProgress(rt)) rt.unmark('retreat');
      // 最初の縄へ手が届いてから確認の期限を数える。十八歩先では、まだ作業を始められない。
      if (F.finalStarted == null && (Math.hypot(p.x - CHECK_SPOTS[0].x, p.z - CHECK_SPOTS[0].z) < 3 || rt.t - F.stepT >= FINAL_MOVE_LIMIT)) F.finalStarted = rt.t;
      const finalElapsed = F.finalStarted == null ? 0 : rt.t - F.finalStarted;
      if (safe) { F.finalHeld += dt; F.finalSafe += dt; } else F.finalSafe = 0;
      // 釦を探して長押しさせない（Simple is the best）。印の上で手元が静かなら、四秒立つだけで縄を確かめる。
      { const i = F.finalChecks.indexOf(false), spot = CHECK_SPOTS[i];
        if (spot && F.finalReady && !dangerProgress(rt) && Math.hypot(p.x - spot.x, p.z - spot.z) < 3) {
          F.finalCheckT += dt;
          if (F.finalCheckT >= CHECK_HOLD) { F.finalCheckT = 0; F.finalCheckDone[i]?.(); }
        } else F.finalCheckT = 0; }
      if (foes >= 4) dangerWarning(rt);
      if (Math.floor(rt.t - F.stepT) !== F.finalClock) {
        F.finalClock = Math.floor(rt.t - F.stepT);
        const left = Math.max(0, Math.ceil(FINAL_LIMIT - finalElapsed));
        const detail = dangerProgress(rt) ? `槍組の後ろへ。退く間はあと${Math.ceil(15 - (rt.t - F.dangerAt))}秒` : !atPost ? '東の印へ戻れ' : fighting ? `敵を味方と止めよ　縄 ${F.finalChecked}／3` : F.finalChecked < 3 ? `四秒長押し　縄 ${F.finalChecked}／3` : !facing ? riverTurnText(rt) : `舟の見張り　あと${Math.max(0, Math.ceil(FINAL_HOLD - F.finalSafe))}秒`;
        rt.objProgress('main', F.finalStarted == null ? `縄 ${F.finalChecked}／3　印で四秒長押し` : `${detail}\n火の下知まで${left}秒`);
      }
      if (finalElapsed >= FINAL_LIMIT - 30 && !F.deadlineWarn) { F.deadlineWarn = true; rt.bark('東の印へ戻れ。火の下知まで三十秒', true); rt.say('柴田勝家', '火の下知が迫る。東の柵を早う確かめよ', 4); }
      // 三か所を見回って見張る。岸で失敗していても、見回りの務めは最後まで残す。
      if (!dangerProgress(rt) && (F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD || finalElapsed >= FINAL_LIMIT)) { F.held = F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD; rt.unmark('east'); this.win(rt); }
    }
  },

  onFinish(rt) { rt.flags.hurtEdge.remove(); rt.unmark('retreat'); },

  onKill(rt) {
    // 共通の鉄砲組の報告も、煙越しの正確な討ち取り人数にはしない。
    rt.volleyKillN = 0;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.flags.routSaid || !nearTroops(rt, g)) return;
    rt.flags.routSaid = true; // 三隊が順に散っても、同じ声は戦を通して一度だけ。
    rt.say('足軽', '門徒が散るぞ。追いかけるでねえ！', 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) { brokenWall(rt, s);
      const x = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.pos?.x || 0;
      const bit = x < -10 ? 1 : x > 10 ? 2 : 4;
      if ((rt.flags.fenceWarned || 0) & bit) return;
      rt.flags.fenceWarned = (rt.flags.fenceWarned || 0) | bit;
      rt.bark(x < -10 ? '西の柵が破られた！' : x > 10 ? '東の柵が破られた！' : '中央の柵が破られた！', true); }
  },
};

// 表示の兵力は遊びの目安。戦う者と、二砦に残る非戦闘の人々の数を分ける。
nagashima.force = () => ({ a: 70000, a0: 70000, b: 10000, b0: 10000 });
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.rts = true;
nagashima.namedKacchu = NAGASHIMA_KACCHU;
// 開戦時の局地兵と囲みの人足四人。舟の四十五人を含め約百人＋自分の組と供。追加の波は作らない。
nagashima.noWake = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nagashima.famous = [];
nagashima.noTaisho = true;
nagashima.noDistantBattle = true;
nagashima.date = () => '天正二年九月二十九日　秋';
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '柵の下知まで待つ' : '');
nagashima.skip = (rt) => { if (rt.phase === 'brief') nagashima.build(rt); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。篠橋・大鳥居の砦が落ち、九月二十九日、長島の砦は降った。ところが、城を出る門徒に織田方が鉄砲を撃ちかけたため、怒った門徒が斬り込み、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説あり、総勢七万・一揆の戦う者一万は遊びの目安。信長公記巻七と大日本史料の九月二十九日条をもとにした。岸の柵作り、退城舟の着岸場所と人数、砦の距離、昼の景色は復元。五拠点の多角形の平場、長島の奥の段、土塁、木戸、井楼、番所、長屋、蔵、館、井戸、板葺きと檜皮葺き、低い留め石、道と分流の配置は、戦国末期の北伊勢の土の城からの推定で、実測縄張りを写したものではない。堤と中洲の小拠点は遊びの補いで、既に落ちた篠橋・大鳥居とはしない。守将の個別の居場所は不明で、織田信広らの討死は自分の手柄で変わらない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nagashima.lordAt = { x: 0, z: 60, r: 12, why: '岸の後ろの織田の陣（信長は陸と海から長島を囲んだ）' };
nagashima.lordSpawn = { x: 0, z: 56, heading: Math.PI };

// 素直な遊び手：柵を結い、舟を見張り、反撃を岸で受け止め、東の包囲の柵へ移る
// 退く時も敵を向く。行き先を向いて歩くと、背に受けて構えが効かない。
function bankMove(p, inp, foe, x, z, goTo) {
  inp.runHeld = false;
  // 近くの打ち込みだけ受ける。敵がいるだけで構え続けると、退き足も気力の回復も遅れる。
  inp.guardHold = !!foe && Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) < 6 &&
    !!((foe.charging && foe.target === p.u) || (foe.atk && foe.atk.target === p.u) ||
      (foe.swing && !foe.swing.done && foe.swing.target === p.u));
  if (!foe) { goTo(p, inp, x, z, 2); return; }
  if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
  p.yaw = Math.atan2(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z);
  const dx = x - p.u.pos.x, dz = z - p.u.pos.z;
  if (Math.hypot(dx, dz) <= 2) return;
  const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
  const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
  if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
}

nagashima.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive) return;
  if (F.ending) {
    // 結末は岸に留まり、下知どおり対岸を見る。終了時刻と本人の操作は変えない。
    inp.guardHold = false; inp.runHeld = false;
    p.yaw = Math.atan2(FORT.x - u.pos.x, FORT.z - u.pos.z);
    return;
  }
  // 近いだけの相手より、いま打ち込む相手を先に受ける。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.invuln ||
        o.type === 'gun' || o.type === 'bow' || o.boatSeat?.aboard || o.pos.z < BANK_Z - 3 || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // いま自分へ打ち込む相手だけを優先する。味方が受けている敵は見回りを妨げない。
    if (!(o.charging && o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u)) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  const candidate = attacker || strikeTarget(b, F.step === 1 ? 8 : 13);
  // 岸を守る者は、退く舟や川の中の門徒を追わない。上陸した相手を受ける。
  // 東へ移る時は、十三歩先で味方が受けている敵を向いて寄り道しない。
  const e = candidate && !candidate.boatSeat?.aboard && candidate.pos.z >= BANK_Z - 3 &&
    (F.step !== 3.5 || attacker || Math.hypot(candidate.pos.x - u.pos.x, candidate.pos.z - u.pos.z) < 6) ? candidate : null;
  // 東への移動中も、深手や気力切れなら同じ持ち場の後ろへ退く。
  // 傷の自然回復は待たず、敵が離れて気力が戻ったら守りに加わる。
  const defending = F.step === 3 || F.step === 3.5;
  if (defending && dangerProgress(b)) {
    bankMove(p, inp, e, 24, BANK_Z + 16, goTo); return;
  }
  if (defending && u.pos.z < BANK_Z - 2) {
    bankMove(p, inp, e, F.step === 3.5 ? 24 : u.pos.x, BANK_Z + 6, goTo);
    return;
  }
  const backX = F.step === 3.5 ? 24 : 4;
  const closeFoe = e && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 6;
  // 傷は自然には戻らない。味方の列へ戻っても、半分以下というだけで退き続けない。
  // 実際に並べる味方と近い敵を数え、一人を受けられる時は反撃へ戻る。
  let friends = 0, foes = 0;
  if (defending && e) for (const o of b.army.units) {
    if (o === u || !o.alive || o.fleeing || o.noTarget || o.isStruct || o.woundOut || o.rearWound ||
        o.type === 'porter' || o.type === 'dummy' || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) >= 6 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    if (o.team === u.team) friends++; else foes++;
  }
  const supported = friends >= 2 && foes <= 1 && !u.mobbed;
  if (defending && closeFoe && ((u.hp < u.maxHp * 0.5 && !supported && u.pos.z < BANK_Z + 12) || p.sta < p.maxSta * 0.25)) b.botRest = true;
  if (b.botRest && (!closeFoe || supported || Math.hypot(u.pos.x - backX, u.pos.z - (BANK_Z + 16)) <= 2) &&
      p.sta >= p.maxSta * 0.45) b.botRest = false;
  if (b.botRest) { bankMove(p, inp, e, backX, BANK_Z + 16, goTo); return; }
  // 東の見回りでは、離れた敵は味方に任せ、手元が静かな間に縄を確かめる。
  // 十三歩以内に敵がいるだけで作業を捨てると、三か所とも未確認のまま時間切れになる。
  if (F.step === 3.5 && F.finalChecked < 3 && !attacker) {
    const spot = CHECK_SPOTS[F.finalChecks.indexOf(false)];
    if (spot) {
      // 退き歩きは二歩で止まる。作業半径三歩の内側なら、その場で縄へ手を伸ばす。
      if (Math.hypot(spot.x - u.pos.x, spot.z - u.pos.z) > 2.5) { bankMove(p, inp, e, spot.x, spot.z, goTo); return; }
      if (F.finalReady) { inp.guardHold = false; inp.k.add('KeyE'); return; }
    }
  }
  // 守りは印から十八歩以内。印の二歩以内へ入り続けて、目の前の反撃を捨てない。
  if (F.step === 3.5 && e && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) > 10) {
    bankMove(p, inp, e, 24, BANK_Z + 6, goTo); return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    // 刀と槍の間合いに入り、受ける間と構えを解いて突く間を分ける。
    // 毎コマ構えを選び直すと、突きが払いに変わり、気力だけを失う。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    const atPost = F.step !== 3.5 || Math.hypot(e.pos.x - 24, e.pos.z - (BANK_Z + 6)) < 14;
    if (atPost && (u.hp >= u.maxHp * 0.5 || supported) && !attacker && e.pos.z >= BANK_Z && d > reach * 0.9) inp.k.add('KeyW');
    // 刀の敵に密着すると槍の穂先が使えず、突きの傷が小さくなる。
    // 岸の内で半歩退き、穂先が届く間を取り直す。
    if (p.weapon === 'spear' && d < 1.4 && u.pos.z < BANK_Z + 20 && atPost) inp.k.add('KeyS');
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1.25) {
    const s = SPOTS[F.watchSpot];
    if (Math.hypot(u.pos.x - s.x, u.pos.z - (BANK_Z + 5)) > 2) goTo(p, inp, s.x, BANK_Z + 5, 1.5);
    else p.yaw = Math.PI;
    return;
  }
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('s')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.6) goTo(p, inp, it.pos.x, it.pos.z, 1.2); else inp.k.add('KeyE'); return; }
  }
  if (F.step === 3.5) {
    const next = F.finalChecks.indexOf(false), spot = CHECK_SPOTS[next];
    if (spot) {
      if (Math.hypot(spot.x - u.pos.x, spot.z - u.pos.z) > 1.6) goTo(p, inp, spot.x, spot.z, 1.2);
      else if (F.finalReady) inp.k.add('KeyE');
    } else if (Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) > 2) goTo(p, inp, 24, BANK_Z + 6, 2);
    else p.yaw = Math.PI;
    return;
  }
  if (F.step === 2) { goTo(p, inp, 0, BANK_Z + 4, 2); return; }
  if (F.step === 3 && u.hp < u.maxHp * 0.5) { goTo(p, inp, 4, BANK_Z + 16, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, BANK_Z + 3, 2); return; } goTo(p, inp, 4, BANK_Z + 3, 2); return; }
  goTo(p, inp, 6, BANK_Z + 8, 3);
};


// 信長公記巻七：陸三方と九鬼水軍の囲み、長島の退城、中江・屋長島。
// 願証寺は宗教の中心であり、中江の本陣と同じ拠点にしない。
installBattleJinkei(nagashima, [
  battleJin('陸三方と川口の囲み', 0, { x: 0, z: 60 }, Math.PI, [
    ['nagashima_hq', '本陣・旗本の守り', '織田信長', null, { x: 0, z: 60 }, 'eiraku', 'oda', (r) => r.flags.odaCamp?.guard, { named: false }],
    ['nagashima_shibata', '岸の柵と仕寄り', '柴田勝家', null, { x: 0, z: BANK_Z + 3 }, 'kari', 'kari', (r) => r.flags.shiba],
    ['nagashima_teppo', '岸の鉄砲の備え', '鉄砲組頭（名は不明）', null, { x: 34, z: BANK_Z + 6 }, 'oda', 'oda', (r) => r.flags.teppo, { named: false }],
    ['nagashima_west', '西の付城・封鎖の陣', '織田の衆（将の名は不明）', null, { x: -90, z: 0 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_east', '東の付城・封鎖の陣', '織田の衆（将の名は不明）', null, { x: 110, z: 4 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_northwest', '北西の囲み', '織田の衆（将の名は不明）', null, { x: -150, z: -150 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_kuki', '東の川口・舟の封鎖', '九鬼嘉隆', null, { x: 84, z: CH_Z - 2 }, 'kuki', 'kuki', (r) => r.flags.ship],
    ['nagashima_takigawa', '川口の安宅船', '滝川一益', null, { x: 144, z: CH_Z + 4 }, 'takigawa', 'takigawa', (r) => r.flags.takigawaShip],
    ['nagashima_hayashi', '川筋の囲船', '林秀貞', null, { x: -102, z: CH_Z - 5 }, 'oda', 'oda', (r) => r.flags.hayashiShip],
    ['nagashima_shimada', '西寄りの囲船', '島田所之助', null, { x: -141, z: CH_Z - 5 }, 'oda', 'oda', (r) => r.flags.shimadaShip],
  ], '七万は遊びの目安で諸説あり。陸三方向と水軍は史料の筋、陣の寸法と岸の将の担当は復元。各手の人数は不明。'),
  battleJin('輪中の砦ごとの守り', 1, FORT, 0, [
    ['nagashima_nakae', '中江の砦・奥の守り', '門徒衆（将の名は不明）', null, { x: 18, z: -82 }, 'namu', 'honganji', (r) => r.flags.ikkoCamp?.guard, { named: false }],
    ['nagashima_yanagashima', '屋長島の砦', '門徒衆（将の名は不明）', null, { x: YANAGASHIMA.x, z: YANAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_castle', '長島城の守り', '門徒衆（将の名は不明）', null, { x: NAGASHIMA.x, z: NAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_tsutsumi', '堤の砦', '門徒衆（将の名は不明）', null, { x: TSUTSUMI.x, z: TSUTSUMI.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_nakasu', '中洲の砦', '門徒衆（将の名は不明）', null, { x: NAKASU.x, z: NAKASU.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_bank', '退城した門徒の反撃', '門徒衆（将の名は不明）', null, { x: -10, z: BANK_Z - 4 }, 'namu', 'honganji', (r) => r.flags.last?.[0], { named: false }],
  ], '戦う者一万は目安。砦別の将・兵数は不明で、籠もる非戦の人々を備の兵数に数えない。'),
]);

export { nagashima };
