import { restoreWounds, bindWound } from './wounds.js';
import { spearReach, rangedSupply, renewGunPowder } from './weapon_reality.js';
import { projectileCover } from './projectile_cover.js';
import { horseThreatTick, horseExhausted, horseLooseMove, horseLooseDanger } from './horse_reality.js';
import { weatherSees } from './weather_gameplay.js';
import { terrainFx, uphillAt } from './terrain_tags.js';
import * as THREE from 'three';
import { ITEMS, equipDef, ladderStep, canRide, myHorse, scenario } from './state.js';
import { angleDiff, weaponMesh, buildHorse, animateHorse, RIDE, coatOf, bloodLv } from './units.js';
import { distToPolyline, WIND_STATE } from './world.js';
import { POST, edgeDark } from './post.js';
import { sfx, deafen, setScene } from './audio.js';
import { S, DIFFICULTY, K, saveSettings, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { setFpCut, setFpArm } from './humans.js';
import { kamae, volley, kamaeOff, volleyRoll, ceaseFire } from './kumi.js';
import { groundAt, ladderNear, FL } from './floors.js';
import { NAKA, nakaCamClamp, nakaWindowAt } from './naka.js';
import { interiorFloorAt } from './interior_layouts.js';
import { ladderAlive, startClimb } from './siege_ladder.js';
import { decisiveCameraReset, decisiveCameraApply } from './decisive_camera.js';
import { cloneWaterMaterial } from './water_body.js';
// 刃の軌跡（Player.trailTick）の材質と使い回しのベクトル
const TRAIL_N = 12;
const _meleeResult = { res: null };   // 二人目以降の当たり方を調べる入れ物を使い回す
const TRAIL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const _tA = new THREE.Vector3(), _tB = new THREE.Vector3();
const _horseBox = new THREE.Box3();
const TOFF = typeof location !== 'undefined' && /[?&]toff\b/.test(location.search);   // 試し：緊迫の仕組みを切る
const _fpS = new THREE.Vector3();
// カメラの計算に毎コマ使う入れ物（毎コマ new しない。どれもそのコマの中だけで使い、外へ持ち出さない）
const _cT = new THREE.Vector3(), _cD = new THREE.Vector3(), _cR = new THREE.Vector3(), _cW = new THREE.Vector3(), _cQ = new THREE.Vector3(), _cLk = new THREE.Vector3(), _cTmp = new THREE.Vector3();
const _cE = new THREE.Vector3(), _cFr = new THREE.Vector3(), _cAh = new THREE.Vector3(), _cFar = new THREE.Vector3();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _PF_OFFSETS = [[0, 0], [0.6, 0.3], [-0.6, 0.3], [0.6, -0.5], [-0.6, -0.5]];
const _cUP = new THREE.Vector3(0, 1, 0), CORNERS = [[0.35, 0.2], [-0.35, 0.2], [0.35, -0.1], [-0.35, -0.1]];   // 下の隅は浅く（柵の横木を拾って寄りすぎない）

// 束ねた形の範囲は geometry ではなく本体にある（部品ごとの移動も含む）。
function camBlockSphere(o) {
  if (o.isBatchedMesh || o.isInstancedMesh) {
    o.computeBoundingSphere();
    return o.boundingSphere;
  }
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  return o.geometry.boundingSphere;
}
function camBlockVisible(o, scene) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}
// 壁の裏から出る線も拾う。共有の描画材質には触らず、判定の間だけ専用の両面材質を使う。
const CAM_BLOCK_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function camBlockRaycast(o, ray, hits) {
  const mat = o.material;
  o.material = CAM_BLOCK_MAT;
  try { o.raycast(ray, hits); }
  finally { o.material = mat; }
}

// 地形は建物の当たり判定に入らない。自分から順に高さを調べ、最初の斜面より手前へ寄せる。
// 数と間隔に上限を設け、数値だけで計算する（毎コマ入れ物を作らない）。
function terrainCameraClamp(W, from, to, lift = false) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dz), n = Math.max(2, Math.min(32, Math.ceil(len / 0.5)));
  let safe = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (from.y + dy * t >= W.heightAt(from.x + dx * t, from.z + dz * t) + 0.65) { safe = t; continue; }
    let lo = safe, hi = t;
    for (let j = 0; j < 4; j++) {
      const m = (lo + hi) * 0.5;
      if (from.y + dy * m >= W.heightAt(from.x + dx * m, from.z + dz * m) + 0.65) lo = m;
      else hi = m;
    }
    const k = Math.max(0, lo - 0.25 / Math.max(len, 0.25));
    // すぐ後ろが切岸なら、肩越しの距離を残して上から見る。建物の判定より先だけ行う。
    if (lift && len > 1.4 && len * k < 1.4) {
      const q = 1.4 / len;
      to.set(from.x + dx * q, from.y + dy * q, from.z + dz * q);
      for (let j = 1; j <= 6; j++) {
        const m = j / 6;
        const h = W.heightAt(from.x + dx * q * m, from.z + dz * q * m) + 0.8;
        to.y = Math.max(to.y, from.y + (h - from.y) / m);
      }
    } else to.set(from.x + dx * k, from.y + dy * k, from.z + dz * k);
    to.y = Math.max(to.y, W.heightAt(to.x, to.z) + 0.65);
    return true;
  }
  return false;
}

// 味方を透かす材質：元の材質ごとに三段（ディザで抜く。並べ替え不要で、重なっても乱れない）
const DITHER_A = [0.3, 0.5, 0.72];
const ditherCache = new WeakMap();
function ditherMat(m, lv) {
  if (m.userData.dither != null) return m;
  let a = ditherCache.get(m);
  if (!a) { a = []; ditherCache.set(m, a); }
  if (!a[lv]) {
    const f = cloneWaterMaterial(m);
    // 点描（alphaHash）は低い解像度でテレビの砂嵐のように見えるので、なめらかな半透明で透かす
    f.alphaHash = false; f.transparent = true; f.depthWrite = false; f.opacity = m.opacity * DITHER_A[lv];
    f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey;
    Object.assign(f.userData, m.userData, { dither: lv });
    a[lv] = f;
  }
  return a[lv];
}

const BODY_LOOK = [
  { armor: 0x4a4032, lace: 0x6b5a3a, sode: false },
  { armor: 0x1d1d1f, lace: 0x34507a, sode: true },
  { armor: 0x1d1d1f, lace: 0xa8321f, sode: true },
];

// 装備から見た目を決める（戦場・武具屋のプレビューで共通）
// 兜の格（段が上がるほど立派に。装備の兜より下にはしない）
const HAT_ORDER = ['jingasa', 'jingasa_n', 'kabuto', 'kabuto_m', 'kabuto_f', 'kabuto_b', 'kabuto_w', 'kabuto_s', 'kabuto_g', 'kabuto_t'];
const STEP_HAT = ['jingasa', 'kabuto', 'kabuto_m', 'kabuto_f', 'kabuto_b', 'kabuto_w', 'kabuto_s', 'kabuto_s', 'kabuto_g', 'kabuto_t'];
// 段ごとの甲冑（null は装備のまま）
const STEP_ARMOR = [
  null, null, null,
  { armor: 0x1a1515, lace: 0xb8342a },            // 侍大将：朱威
  { armor: 0x1a1515, lace: 0xb8342a },            // 部将
  { armor: 0x1a1515, lace: 0xa8321f, trim: 0xc9a24a },  // 家老：金縁
  { armor: 0x2a1c14, lace: 0xe2d6b8, trim: 0xc9a24a },  // 城主：専用の甲冑（白糸威）
  { armor: 0x2a1c14, lace: 0xe2d6b8, trim: 0xc9a24a },  // 国持大名
  { armor: 0x141414, lace: 0xc9a24a, trim: 0xe0bc5a },  // 戦国大名：金糸
  { armor: 0x0e0e10, lace: 0xc9a24a, trim: 0xf0cc62 },  // 天下人：黒と金
];
const STEP_HAORI = [0, 0, 0x5a1e18, 0xa0281c, 0xa0281c, 0x4a2a6a, 0x7a5a1a, 0x7a5a1a, 0x1e3a6a, 0xb8231a];
const STEP_UMA = [null, null, null, null, null, null, 'fan', 'fan', 'gourd', 'sun'];

// 装備と段から見た目を決める（戦場・武具屋・出世の道のプレビューで共通）
export function playerLook(G, stepOverride) {
  const step = stepOverride ?? ladderStep(G);
  const bl = BODY_LOOK[ITEMS[G.equip.body].look];
  const wItem = ITEMS[G.equip.weapon];
  const eqHat = ITEMS[G.equip.hat].look;
  const hat = HAT_ORDER.indexOf(STEP_HAT[step]) > HAT_ORDER.indexOf(eqHat) ? STEP_HAT[step] : eqHat;
  const ar = STEP_ARMOR[step] || {};
  const uma = STEP_UMA[step];
  return {
    armor: ar.armor ?? bl.armor, lace: ar.lace ?? bl.lace, trim: ar.trim || 0, sode: bl.sode || step >= 2, hat,
    flag: uma ? null : (G.rank >= 1 || step >= 1) && G.aijirushi ? G.aijirushi : scenario().mon, pole: !uma,
    flagScale: [1, 1.15, 1.3, 1.45, 1.6, 1.7][Math.min(5, step)] + (step === 0 ? 0.12 * G.rank : 0),
    uma,
    weapon: 'spear', weaponExtra: wItem.reach || 0,
    haori: STEP_HAORI[step] || (G.equip.coat ? 0x8e2f1f : 0),
    saya: G.owned.includes('katana') || step >= 1, menpo: step >= 8 ? 0x7a1c14 : step >= 3 || G.equip.hat === 'hat3' ? 0x1c1a18 : 0,
    horo: step === 4 ? 0xb8412c : step === 5 ? 0xe6dfcf : 0,
    left: step >= 3 ? 'gunbai' : step === 2 ? 'saihai' : null,
    // 身分の格（足軽・組頭・侍大将・武将）。本人の顔、胴と陣笠の家紋、汚れ（出世するほど身綺麗に）
    tier: step >= 4 ? 3 : step >= 2 ? 2 : step, face: 'player', mon: scenario().mon, dirt: [0.7, 0.55, 0.4, 0.3, 0.25][Math.min(4, step)],
    menpoStyle: step >= 3 ? 'hanbo' : 'full',
    // 侍大将から上は、本物の胴丸（humans.js の3Dスキャン）を着る
    real: step >= 3 ? 1 : 0,
  };
}

// 段ごとの馬の拵え。kind は毛色の名（栗毛・鹿毛・黒鹿毛。鹿毛の類は脚先と鬣が黒い）
export function horseStyle(step, coat, kind) {
  const C = kind ? coatOf(kind) : null;
  const bay = C ? C.points > 0 : coat === 0x6e4220 || coat === 0x2a1d14;
  return {
    coat: step >= 7 ? 0xd9d4c6 : coat ?? (step >= 5 ? 0x2a1d14 : 0x5a3a24),
    mane: step >= 7 ? 0xbdb6a6 : bay ? 0x100c0a : 0x3a2214,
    points: step >= 7 ? 0 : bay ? 1 : 0,
    tack: step >= 6 ? 0xc9a24a : step >= 3 ? 0xb8342a : 0x6a2a1c,
    saddle: step >= 6 ? 0x2a1a10 : 0x1a1512,
    rim: step >= 6 ? 0xc9a24a : 0,
    cushion: step >= 4 ? 0x7a1a14 : 0x2a2c3a,
    aori: step >= 3 ? 0x3a2a1c : 0x4a3a26,
    // 房：足軽大将は紺、侍大将から朱、上は金
    tassels: step >= 6 ? 0xc9a24a : step >= 4 ? 0xb8342a : 0x1f2a4a,
    big: step >= 5 ? 1 : 0,
    armor: step >= 9 ? 0xc9a24a : step >= 8 ? 0x8a6a1e : 0,
  };
}

export const ORDER_NAME = {
  follow: 'ついて来い', hold: '待て', attack: '突撃', retreat: '退け', focus: '敵を狙え', move: '前進', yari: '槍衾', flee: '潰走',
  face: '向き直れ', gather: '集まれ', gate: '門を破れ', path: '前進', assault: '門を破れ',
};
export const FORM_NAME = { line: '横隊', column: '縦陣', loose: '散開', yari: '槍衾', ring: '方円', gyorin: '突撃' };
// 組の隊の種類（号令先の切り替えの順）と名前
export const GROUP_KINDS = ['spear', 'gun', 'bow', 'cavalry'];
export const GROUP_NAME = { all: '全隊', spear: '槍隊', gun: '鉄砲隊', bow: '弓隊', cavalry: '騎馬隊' };
// 号令の輪（上から時計回り）
export const RADIAL = [
  { id: 'attack', label: '突撃' }, { id: 'focus', label: '敵を狙え' }, { id: 'hold', label: '待て' }, { id: 'yari', label: '槍衾', min: 2 },
  { id: 'retreat', label: '退け' }, { id: 'move', label: '前進', min: 2 }, { id: 'follow', label: 'ついて来い' }, { id: 'rally', label: '鼓舞' },
];

// 号令の輪の四つ目（右下）は、選んだ隊が弓・鉄砲だけなら「槍衾」の代わりに「放て／やめ」にする（syncRadial）
const YARI_ITEM = RADIAL[3];
const FIRE_ITEM = { id: 'fire', label: '放て／やめ', min: 1 };
// 指の端末（携帯）は、号令の輪の字を丸の中の二字までに（字で景色を隠さない）
if (isTouch) {
  const SHORT = { attack: '突撃', focus: '狙え', hold: '待て', yari: '槍衾', retreat: '退け', move: '前進', follow: '続け', rally: '鼓舞' };
  for (const it of RADIAL) if (SHORT[it.id]) it.label = SHORT[it.id];
  FIRE_ITEM.label = '放て';
}

export const SQUAD_FORMS = [
    { id: 'form_line', label: '横隊に組め', desc: '槍衾で前を守り、鉄砲を横に並べる' },
    { id: 'form_ring', label: '方円に組め', desc: '四方を守る。囲まれても打たれにくい' },
    { id: 'form_gyorin', label: '突撃に組め', desc: '前を狭くして押し切る。斬り込む力が増す' },
];

export function commandList(rank) {
  const base = [
    { k: '1', q: K('follow'), id: 'follow', label: 'ついて来い', desc: '自分の後ろに付いて動く' },
    { k: '2', q: K('hold'), id: 'hold', label: '待て', desc: 'その場で踏みとどまる' },
    { k: '3', q: K('attack'), id: 'attack', label: '突撃', desc: '近くの敵へ斬り込む' },
    { k: '4', q: K('retreat'), id: 'retreat', label: '退け', desc: '後ろへ下がって立て直す' },
    { k: '5', id: 'focus', label: '敵を狙え', desc: '照準の先の敵を集中して討つ' },
    { k: '0', id: 'gather', label: '集まれ', desc: '散った兵を自分のもとへ集め直す' },
    { id: 'gate', label: '門を破れ', desc: '近くの門・柵・逆茂木へ数人がかりで打ちかかる' },
  ];
  if (rank >= 1) base.push(...SQUAD_FORMS);
  // 鉄砲は一度目で前に並べて構え、二度目で一斉に放つ（弓は射撃の切り替え）
  if (rank >= 1) base.push({ k: '8', id: 'fire', label: '構え／放て', desc: '鉄砲は前に並んで構え、もう一度で一斉に放つ' });
  if (rank >= 1) base.push({ id: 'roll', label: '三段で撃て', desc: '鉄砲・弓が込め終えた者から代わる代わる撃ち、途切れさせない' });
  if (rank >= 1) base.push({ id: 'ceasefire', label: '撃ち方やめ', desc: '鉄砲・弓の組を構えから解き、撃つのをやめる' });
  if (rank >= 2) {
    base.push({ k: '6', id: 'move', label: '前進', desc: '照準の先の地点へ進む' });
    base.push({ k: '7', id: 'yari', label: '槍衾', desc: '横一列で槍を揃え正面を固める' });
    base.push({ k: '9', id: 'form', label: '陣形', desc: '横隊→方円→突撃' });
    base.push({ k: '-', id: 'face', label: '向き直れ', desc: '照準の方へ隊の正面を向ける（横を突かれた時）' });
  }
  return base;
}

const QUICK = { KeyZ: 'follow', KeyX: 'hold', KeyC: 'attack', KeyN: 'retreat' };
const QUICK_ENTRIES = Object.entries(QUICK);
// 火縄銃の込め直しにかかる秒（止まっている時）
const GUN_RELOAD = 25;
// 手当ての布は自分一人分。形と材質は戦ごとに作り直さない。
const BANDAGE_GEO = new THREE.CylinderGeometry(0.095, 0.095, 0.16, 8);
const BANDAGE_MAT = new THREE.MeshLambertMaterial({ color: 0xc8b99c });

export class Player {
  constructor(rt, spawn) {
    this.rt = rt;
    const G = rt.G;
    this.G = G;
    const army = rt.army;
    this.group = army.addGroup({ team: 0, faction: scenario().faction, noRout: true, order: 'hold', name: 'player' });
    const look = playerLook(G);
    this.sightHat = look.hat;
    this.u = army.addUnit(this.group, { type: 'player', x: spawn.x, z: spawn.z, heading: spawn.heading || 0, ...look });
    this.u.isPlayer = true;
    this.u.name = G.name;
    this.u.noHead = true;
    this.u.wpnKind = 'spear';
    this.hasKatana = G.owned.includes('katana');
    // 槍の拵えは持ち槍で変わる：数打・上質は素槍（一間半）、大身槍は長い穂、長柄は二間半
    {
      const sk = { spear2: 'omi', spear3: 'naga', spear4: 'jumonji' }[G.equip.weapon] || 'su';
      const sm = weaponMesh('spear', 0, sk);
      if (this.u.wpn && this.u.wpn.parent) this.u.wpn.parent.remove(this.u.wpn);
      this.u.hand.add(sm); this.u.wpn = sm;
    }
    this.spearMesh = this.u.wpn;
    this.slashN = 0;
    if (this.hasKatana) this.swordMesh = weaponMesh('sword');
    // 飛び道具（問屋で買った物）：火縄銃（3）と弓（4）。持ち替えて撃つ・射る
    this.hasGun = G.owned.includes('teppo');
    this.hasBow = G.owned.includes('yumi');
    if (this.hasGun) this.gunMesh = weaponMesh('gun');
    this.u.gunRainCover = !!this.gunMesh?.userData.rainCover;
    if (this.hasBow) this.bowMesh = weaponMesh('bow');
    this.gunLoaded = true;     // 戦の始めは込めてある
    this.u.onGunResult = (result) => this.gunResult(result);
    this.gunAmmo = 19;         // 込めた一発と、携えた十九発。戦の間は有限。
    this.bowAmmo = 24;
    this.gunReload = 0;        // 込め直しの進み（0〜1）
    this.aiming = false;
    this.aimK = 0;             // 構えて狙う寄り具合（視野を狭める）
    this.aimHoldT = 0;
    this.reloadPose = { t: 0, dur: GUN_RELOAD };
    this.meleePose = { kind: 'thrust', t: 0, dur: 0 };
    this.rangedPose = { ranged: true, bow: false, t: 0, dur: 0, target: null };
    this.rangedGround = { pos: { x: 0, y: 0, z: 0 }, mounted: false };
    this.rangedDir = new THREE.Vector3();
    this.shot = null;          // 火蓋を切ってから放つまで
    this.draw = 0;             // 弓を引き絞った長さ（秒）
    const vit = G.stats.vit - 1;
    this.u.maxHp = this.u.hp = 100 + vit * 10;
    restoreWounds(G, this.u, this.rt.def);
    this.maxSta = 100 + vit * 12;
    this.sta = this.maxSta;
    this.treatmentLeft = 1;
    this.treating = false;
    this.treatmentCloth = new THREE.Mesh(BANDAGE_GEO, BANDAGE_MAT);
    this.treatmentCloth.position.y = -0.34;
    this.treatmentCloth.visible = false;
    this.u.armL.add(this.treatmentCloth);
    this.treatmentCheckT = 0;
    this.treatmentReady = false;
    this.treatmentPoint = { x: 0, z: 0 };
    this.recentHits = [];
    this.def = equipDef(G);
    this.yaw = spawn.heading || 0;
    this.pitch = -0.12;
    this.weapon = 'spear';
    this.startGun = !!G.lord;   // 信長で遊ぶ時は鉄砲を持って始める
    this.guard = false;
    this.guardT = 0;           // 構えてからの時間（受け流しの判定）
    this.guardBroken = 0;
    this.counterT = 0;         // 受け流し後の反撃猶予
    this.dodgeT = 0;
    this.iframe = 0;
    this.combo = 0;
    this.comboT = 0;
    this.cd = 0;
    this.buffer = 0;           // 先行入力
    this.pending = null;
    this.rallyCd = 0;
    this.staDelay = 0;
    this.running = false;
    this.vel = { x: 0, z: 0 };
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    // 一人称：fpK は 0（三人称）〜1（一人称）の寄り具合。eyeOff は足もとから目までのずれ（ならした物）
    this.fpK = 0;
    // 肩越しの近くの味方：入れ物と探索の関数は一度だけ作り、描いた後に戻す。
    this.nearAllyHid = [];
    this.nearAllyCam = null;
    this.nearAllyVisit = (o) => {
      const u = this.u, cam = this.nearAllyCam;
      if (o === u || !o.alive || o.team !== u.team || o.isStruct || o.imp || !o.mesh || !o.mesh.visible) return;
      const dx = o.pos.x - cam.position.x, dz = o.pos.z - cam.position.z;
      // 前後とも約3m。別の階の兵は隠さない。戦っている味方も長柄ごと隠す。
      if (dx * dx + dz * dz > 9 || Math.abs(o.pos.y + 1.5 + (o.mounted ? RIDE.y : 0) - cam.position.y) > 3) return;
      this.nearAllyHid.push(o.mesh);
      o.mesh.visible = false;
    };
    this.eyeOff = null;
    this.bobT = 0;
    // 一人称の時は、描く直前に自分の頭・兜・指物を隠し、描いた後に戻す（影や写真モードには残す）
    rt.scene.onBeforeRender = (r, sc, cam) => this.fpHide(true, cam);
    rt.scene.onAfterRender = () => this.fpHide(false);
    this.inCombatT = 0;
    this.cmdOpen = false;
    this.cmdOpenT = 0;
    this.selGroup = 'all';
    this.lock = null;
    this.zoom = 0;
    this.shoulder = 1;
    this.shake = 0;
    this.stepT = 0;
    this.aimed = null;
    this.inRange = false;
    this.chargeT = 0;          // 溜め突きの溜め
    this.guardOn = false;      // 構えの切替式
    this.sdx = 0; this.sdy = 0;
    this.lookIdle = 0;
    this.D = DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
    // 重い胴は走ると気力の減りが早く、軽い胴は遅い
    this.heavy = G.equip.body === 'body2' ? 1.3 : G.equip.body === 'body0' ? 0.85 : 1;
    this.spearCd = ITEMS[G.equip.weapon].cd || 1;
    this.jumonji = !!ITEMS[G.equip.weapon].jumonji;   // 十文字槍：鎌で引き倒す・二人を薙ぐ
    this.movedAcc = 0;
    // 馬（足軽大将から）。始めは乗っている
    this.step = ladderStep(G);
    // 谷道や屋内など、馬を使わない戦では本人も徒歩で出陣する。
    this.canRide = canRide(G) && !rt.def.noHorse;
    this.mounted = false;
    this.hspd = 0;
    if (this.canRide) {
      const H = myHorse(G);
      this.horseName = H.name;
      this.horseSpeed = H.speed;
      this.horseMax = Math.round((150 + 20 * (this.step - 2)) * H.hpMul);
      const condition = G.horse?.condition;
      this.horseHp = this.horseMax * Math.max(0, Math.min(1, condition?.health ?? 1));
      this.hfat = Math.max(0, Math.min(1, condition?.fatigue || 0));
      this.maxBreath = Math.round(100 * H.breathMul); this.breath = this.maxBreath;
      this.yariResist = H.id === 'iwane' ? 0.6 : 1;
      if (this.horseHp > 0) {
        this.horse = buildHorse(horseStyle(this.step, H.coat, H.kind));
        this.ownedHorse = this.horse;
        army.setMounted(this.u, true, this.horse);
        this.mounted = true;
      }
      this.loose = null;       // 降りたときの馬（その場で待つ・口笛で来る・逃げる）
    }
  }

  // ---------------- 馬の乗り降り ----------------
  horseReachable(p) {
    const u = this.u, army = this.rt.army;
    return Math.abs(p.y - u.pos.y) <= 0.9 && this.canStep(u.pos.x, u.pos.z, p.x, p.z, u.pos.y) &&
      !army.wallBetween(u.pos, -1, p) &&
      projectileCover(army, u.pos.x, u.pos.y + 0.8, u.pos.z, p.x, p.y + 0.8, p.z, u).q > 1;
  }

  dismountSpot(force = false) {
    const u = this.u, army = this.rt.army, W = this.rt.world;
    const spot = this._dismountSpot || (this._dismountSpot = { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? -1 : 1, d = i < 2 ? 1.3 : 1.8;
      const x = u.pos.x + Math.cos(u.heading) * side * d, z = u.pos.z - Math.sin(u.heading) * side * d;
      const y = groundAt(W, x, z, u.pos.y);
      if (Math.abs(y - u.pos.y) > 0.6 || !this.canStep(u.pos.x, u.pos.z, x, z, u.pos.y) || W.waterFootDepthAt(x, z, y) > 0.8) continue;
      spot.x = x; spot.y = y; spot.z = z;
      if (!this.horseReachable(spot)) continue;
      // 本人と同じ当たりを借りて、柵・建物・兵と重ならないか調べる。
      const ox = u.pos.x, oy = u.pos.y, oz = u.pos.z, mounted = u.mounted, riverX = u._riverX, riverZ = u._riverZ;
      u.pos.set(x, y, z); u.mounted = false; army.collide(u, 0);
      const fits = Math.hypot(u.pos.x - x, u.pos.z - z) < 0.08;
      u.pos.set(ox, oy, oz); u.mounted = mounted; u._riverX = riverX; u._riverZ = riverZ;
      let empty = fits;
      if (empty) for (const o of army.units) { if (o !== u && o.alive && !o.isStruct && Math.abs(o.pos.y - y) < 1.8 && Math.hypot(o.pos.x - x, o.pos.z - z) < (o.mounted ? 1.1 : 0.8)) { empty = false; break; } }
      const limit = W.def.moveLim || 176;
      if (empty && Math.abs(x) <= limit && Math.abs(z) <= limit) return spot;
    }
    // 不意の落馬は馬の足元へ倒れる。安全な場所への移動にはしない。
    if (force) { spot.x = u.pos.x; spot.y = u.pos.y; spot.z = u.pos.z; return spot; }
    return null;
  }

  toggleMount(force = false) {
    const rt = this.rt, u = this.u, army = rt.army;
    if (this.mountT > 0 || u.climb || !u.alive || rt.over) return;
    if (this.catching) { this.catching = null; rt.hud.flash('手綱を放した', 'dim'); return; }
    if (this.shot?.pan) { rt.hud.flash('火皿に火が移った。放ってから乗り降りする', 'dim'); return; }
    if (this.mounted) {
      if (!this.canRide) return;
      const spot = this.dismountSpot(force);
      if (!spot) { rt.hud.flash('降りる場所がない。広い所へ馬を進める', 'dim'); return; }
      this.cancelAttack();
      // 降りる：馬はその場で待つ
      army.setMounted(u, false);
      this.loose = { x: u.pos.x, z: u.pos.z, heading: u.heading, spd: 0, mode: 'wait' };
      this.horse.position.set(this.loose.x, groundAt(rt.world, this.loose.x, this.loose.z, u.pos.y), this.loose.z);
      this.horse.rotation.set(0, u.heading, 0);
      rt.scene.add(this.horse);
      this.mounted = false; this.hspd = 0; this.mountT = 0.35;
      this.dodgeT = this.iframe = 0; this.vel.x = this.vel.z = 0;
      u.pos.set(spot.x, spot.y, spot.z);
      sfx('step', 1.2);
      rt.hint('dismount');
      return;
    }
    const L = this.loose;
    // すぐそばの空馬・置いた馬：R でも手綱を取って乗れる（今の馬より近ければ）。乗る身分（canRide）でなくても、捕らえた馬には乗れる
    const o = this.takeO;
    if (o && (!this.canRide || !L || L.mode === 'fled' || Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < Math.hypot(L.x - u.pos.x, L.z - u.pos.z))) {
      if (o.kept) this.takeHorse(o); else if (!this.catching) { this.catching = { o, t: 0, dur: this.horseCatchDuration(o) }; rt.hud.flash('手綱を取っている。もう一度押すと放す', 'dim'); }
      return;
    }
    if (!this.canRide) { rt.hud.flash('まだ馬に乗れる身分ではない（足軽大将候補から）', 'dim'); return; }
    if (L && (L.mode === 'flee' || L.mode === 'fled')) { rt.hud.flash(L.mode === 'flee' ? `${this.horseName}は怯えて逃げている。逃げる先を見る` : `${this.horseName}は逃げ去った。近くの空馬を探す`, 'dim'); return; }
    if (!L) { rt.hud.flash(`${this.horseName}がいない`, 'dim'); return; }
    const d = Math.hypot(L.x - u.pos.x, L.z - u.pos.z);
    if (d < 3.2) {
      const q = this.horse.position;
      if (!this.horseReachable(q)) { rt.hud.flash('馬の横へ回る。同じ高さで手綱を取る', 'dim'); return; }
      // 乗る
      this.cancelAttack();
      rt.scene.remove(this.horse);
      u.heading = L.heading;
      u.pos.x = L.x; u.pos.z = L.z;
      army.setMounted(u, true, this.horse);
      this.mounted = true; this.loose = null; this.mountT = 0.5; this.hspd = 0;
      sfx('neigh', 0.7);
    } else if (d > 15 || !this.horseReachable(this.horse.position)) {
      L.mode = 'wait';
      rt.hud.flash('馬の見える近くへ寄る。壁の向こうや遠くからは呼べない', 'dim');
    } else if (L.mode === 'come') {
      rt.hud.flash(`${this.horseName}はこちらへ来ている。広い所で待つ`, 'dim');
    } else if (this.spoil) {
      // 戦利の馬は口笛を知らない
      rt.hud.flash(`${this.horseName}は口笛では来ない（そばへ寄って乗る）`, 'dim');
    } else if (this.horse?.userData.horse?.fear > 0.5) {
      rt.hud.flash('馬が怯えている。逃げる先を見て寄る', 'dim');
    } else {
      // 口笛で呼ぶ
      L.mode = 'come';
      sfx('flute', 0.4);
      rt.hud.flash(`口笛で${this.horseName}を呼んだ`, 'dim');
    }
  }

  horseHurt(n) {
    if (!this.mounted || !Number.isFinite(n) || n <= 0) return;
    this.horseHp -= n;
    if (this.horseHp <= this.horseMax * 0.3 && !this.horseWarned) { this.horseWarned = true; this.rt.bark(`${this.horseName}が弱って足が鈍る！`, true); }
    if (this.horseHp <= 0) {
      this.horseHp = 0;
      if (this.horse === this.ownedHorse) this.ownedLast = this.packHorse();
      this.fall();
    }
  }

  // 道の横の急さだけで足を止めず、進む向きの段差を調べる。堀・登れない土塁は守る。
  canStep(x0, z0, x, z, y) {
    const W = this.rt.world;
    const h = groundAt(W, x, z, y);
    if ((W.def.riverCross || W.def.streams?.some(st => st.fords?.length)) && W.waterFootDepthAt(x, z, h) > 0.85) return false;
    if (W.noClimb) for (const f of W.noClimb) if (f(x, z)) return false;
    if (W.walkable(x, z, y)) return true;
    const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    // 一歩ごとの小さな差で切岸を登り続けないよう、少し先の高さも見る。
    const ahead = groundAt(W, x + dx / d * 1.2, z + dz / d * 1.2, h);
    return h <= y + 0.91 && ahead <= h + Math.max(0.9, (W.def.climbTan ?? 0.7) * 1.2);
  }

  // 短い歩幅で当たりを解き、押し戻された向きの速度だけを落とす。壁に沿う分は残す。
  movePlayer(dt, vx, vz) {
    const u = this.u, W = this.rt.world, army = this.rt.army;
    const wanted = Math.hypot(vx, vz) * dt;
    if (dt <= 0 || u.climb) { u.vel.x = 0; u.vel.z = 0; return; }
    if (army.bodies) army.bodies(u, dt);
    const x0 = u.pos.x, z0 = u.pos.z;
    let slopeBlocked = false, solidBlocked = false;
    const count = Math.min(8, Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / 0.2))), step = dt / count;
    for (let i = 0; i < count; i++) {
      const px = u.pos.x, pz = u.pos.z, py = u.pos.y;
      let x = px + vx * step, z = pz + vz * step;
      if (!this.canStep(px, pz, x, z, py)) {
        slopeBlocked = true;
        // 斜面の縁でも、通れる軸の分だけ進む。
        if (Math.abs(vx) >= Math.abs(vz) && this.canStep(px, pz, x, pz, py)) { z = pz; vz = 0; }
        else if (this.canStep(px, pz, px, z, py)) { x = px; vx = 0; }
        else if (this.canStep(px, pz, x, pz, py)) { z = pz; vz = 0; }
        else { x = px; z = pz; vx = 0; vz = 0; }
      }
      u.pos.x = x; u.pos.z = z;
      u.pos.y = groundAt(W, x, z, py);
      // 重なった当たりは順番に押し返すだけでは挟まる。動いた時だけ、最大四回まで解く。
      for (let j = 0; j < 4; j++) {
        const bx = u.pos.x, bz = u.pos.z;
        army.collide(u, step);
        const nx = u.pos.x - bx, nz = u.pos.z - bz, n2 = nx * nx + nz * nz;
        if (n2 < 1e-8) break;
        solidBlocked = true;
        const inward = vx * nx + vz * nz;
        if (inward < 0) { vx -= nx * inward / n2; vz -= nz * inward / n2; }
        if (j === 3) { u.pos.x = px; u.pos.z = pz; u.pos.y = py; vx = 0; vz = 0; }
      }
      if (!this.canStep(px, pz, u.pos.x, u.pos.z, py)) { u.pos.x = px; u.pos.z = pz; u.pos.y = py; vx = 0; vz = 0; }
      u.pos.y = groundAt(W, u.pos.x, u.pos.z, py);
    }
    const water = W.def.water, lim = W.def.moveLim || 176;
    if (water && u.pos.x > water.x - 1) u.pos.x = water.x - 1;
    u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x)); u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
    u.pos.y = groundAt(W, u.pos.x, u.pos.z, u.pos.y);
    // 道を塞ぐ物は残す。歩こうとして足が止まった時だけ、その戦の通り道を知らせる。
    if (W.def.blockedHint && wanted > 0.01 && Math.hypot(u.pos.x - x0, u.pos.z - z0) < wanted * 0.2) {
      this.blockedWalkT = (this.blockedWalkT || 0) + dt;
      if (this.blockedWalkT >= 0.7 && !(this.blockedHintT > this.rt.t)) {
        this.blockedHintT = this.rt.t + 8;
        const record = this.rt.blockedMove || (this.rt.blockedMove = {});
        record.x = u.pos.x; record.z = u.pos.z; record.t = this.rt.t;
        record.cause = solidBlocked ? '建物や柵' : slopeBlocked ? '急な斜面' : '兵の列';
        this.rt.hud.flash(W.def.blockedHint(this.rt), 'dim');
      }
    } else this.blockedWalkT = 0;
    // 動き・足音・歩いた距離は入力ではなく実際の移動に合わせる。
    u.vel.x = (u.pos.x - x0) / dt; u.vel.z = (u.pos.z - z0) / dt;
    if (Math.hypot(u.vel.x, u.vel.z) < 0.05) { u.vel.x = 0; u.vel.z = 0; }
  }

  // 馬上の動き：並足・駆け足（Shift）・手綱を引く（Space）。向きは馬が少しずつ変える
  rideMove(dt, input, iz, mx, mz, ml) {
    const u = this.u, rt = this.rt, army = rt.army;
    const refused = horseThreatTick(army, u, dt, this);
    if (!this.mounted) return;
    const locked = this.mountT > 0 || this.horseStopUntil > rt.t;
    // 馬の持久：駆け足と速足で疲れ、並足や停止で少しずつ戻る。息とは別に長い疲れを残す。
    // 疲れ切るまで駆け続けて約5分。止めれば約1分半、並足でも約2分半で駆けられる所まで戻る（10/4 kaito：のしのしで遊べない）
    this.hfat = Math.max(0, Math.min(1, (this.hfat || 0) + dt * (this.hspd > 6 ? 1 / 360 : this.hspd > 2.5 ? 0 : this.hspd > 0.5 ? -1 / 150 : -1 / 90)));
    const tired = Math.max(0, (this.hfat || 0) - 0.15) / 0.85;
    if (tired > 0.55 && this.hspd > 7 && !(this.hfatWarnT > rt.t)) { this.hfatWarnT = rt.t + 25; rt.hud.flash(`${this.horseName}が疲れてきた（並足で休ませよ）`, 'dim'); }
    const exhausted = horseExhausted(this.horse?.userData.horse, this.hfat);
    if (this.running && iz > 0 && (exhausted || this.guard) && !(this.gallopTipT > rt.t)) {
      this.gallopTipT = rt.t + 8;
      rt.hud.flash(exhausted ? `馬が疲れ切った。止めて休ませると、あと${Math.max(5, Math.ceil(((this.hfat || 0) - 0.55) * 90))}秒ほどでまた駆ける` : '構えを解くと馬を駆けさせられる', 'dim');
    }
    // 息が切れた後は三割まで休む。一コマごとに駆け足へ戻って速度が揺れない。
    if (this.breath <= 5) this.breathRest = true;
    else if (this.breath >= this.maxBreath * 0.3) this.breathRest = false;
    if (this.running && iz > 0 && this.breathRest && !(this.breathTipT > rt.t)) {
      this.breathTipT = rt.t + 8;
      rt.hud.flash('馬の息が切れた。並足で休むと、また駆けられる', 'dim');
      sfx('snort', 0.9);
    }
    const gallop = !exhausted && !this.breathRest && this.running && this.breath > 5 && iz > 0 && !this.guard;
    // 馬が傷つくほど足が鈍る（体力が半分を切ってから利いてくる）
    const hurtMul = this.horseMax ? Math.max(0.5, Math.min(1, this.horseHp / (this.horseMax * 0.5))) : 1;
    let target = locked ? 0 : iz > 0 ? (gallop && iz >= 0.8 ? 11.5 * (this.horseSpeed || 1) * (1 - 0.4 * tired) : isTouch && iz < 0.5 ? 2.2 : 5.4) * hurtMul : iz < 0 ? -1.8 : ml > 0 ? 2.2 * hurtMul : 0;
    if (refused && target > 0) target = 0;
    if (exhausted && target > 5.4) target = 5.4;   // 疲れ切っても速足までは出る
    const travelSign = target < 0 ? -1 : 1;
    const tf = terrainFx(rt.world, u, u.pos.x, u.pos.z, uphillAt(rt.world, u.pos.x, u.pos.z, Math.sin(u.heading) * travelSign, Math.cos(u.heading) * travelSign));
    u.terrain = tf.tag; u._tdef = tf.def; u._tdefHigh = tf.defHigh;
    // 山・川・田の補正が重なっても、通れる地面では並足を残す。深みと切岸は canStep で止める。
    const groundSpeed = Math.max(0.35, tf.spd);
    this.rideGround = (this.rideGround ?? groundSpeed) + (groundSpeed - (this.rideGround ?? groundSpeed)) * Math.min(1, dt * 3);
    target *= this.rideGround;
    if (Math.abs(this.hspd) > 0.5) this.hfat = Math.min(1, this.hfat + tf.tire * Math.abs(this.hspd) * dt / 1500);
    if (this.guard && target > 3) target = 3;
    // 怯えて止まっていても、横へ向けて危険から離れられる。乗り降りの間だけ向きを固定する。
    if (!(this.mountT > 0) && ml > 0) {
      const maxTurn = (Math.abs(this.hspd) > 8 ? 1.5 : 2.7) * Math.max(0.7, tf.turn) * dt;
      const d = angleDiff(u.heading, Math.atan2(iz < 0 ? -mx : mx, iz < 0 ? -mz : mz));
      u.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
    // 滑る前の勢いを別に覚える。実際の速さは息・蹄・攻撃へ渡し、壁の投影で次の一歩まで縮めない。
    if (!locked && !refused && Math.abs(this.hspd) > 0.05 && Math.sign(target) === Math.sign(this.rideDrive)) this.hspd = this.rideDrive;
    const acc = target > this.hspd ? (target > 6 ? 1.8 : 3) : 4.5;
    const hspd0 = this.hspd;
    this.hspd += (target - this.hspd) * Math.min(1, dt * acc);
    // 走り出しの溜め・止まる時の前のめり（カメラが使う。加速の度合いをならす。正＝蹴り出し、負＝手綱を引いた）
    if (dt > 0) this.surge = (this.surge || 0) + (Math.max(-12, Math.min(8, (this.hspd - hspd0) / dt)) - (this.surge || 0)) * Math.min(1, dt * 6);
    // 駆け出しに嘶く（しばらくは繰り返さない）
    if (hspd0 < 6 && this.hspd >= 6 && target > 9 && !((this.neighT ?? -99) + 14 > rt.t)) { this.neighT = rt.t; sfx('neigh', 0.55); }
    // 手綱を引く：馬の勢いを落とす。弾や矢をすり抜ける効果はない
    this.dodgeT -= dt; this.iframe -= dt;
    if ((input.pressed('Space') || input.pressed('HorseRein')) && !locked && this.dodgeT <= 0) {
      const hard = Math.abs(this.hspd) > 7;
      // 手綱は息切れ中も使える。移動の棒からは送らない。
      this.hspd *= hard ? 0.6 : 0.8; this.iframe = 0; this.dodgeT = 0.35;
      if (hard) { this.horse.userData.horse.rear = 0.35; sfx('snort', 0.5); }
      else if (Math.abs(this.hspd) > 0.8) sfx('hooves', 0.25);
      rt.tutMark('dodge');
    }
    // 気力は馬上では並足の分だけ戻る
    this.staDelay -= dt;
    if (this.staDelay <= 0) this.sta = Math.min(this.maxSta, this.sta + (this.guard ? 5 : 18) * dt);
    if (this.hspd > 4 && army.checkYari(u, this) && !this.mounted) return;
    if (!locked && !refused && ml > 0) army.makeHorseWay(u, target, dt);
    this.movePlayer(dt, Math.sin(u.heading) * this.hspd, Math.cos(u.heading) * this.hspd);
    const sp = Math.hypot(u.vel.x, u.vel.z);
    // 壁沿いに滑る速さを残す。向きへの投影を毎コマ掛けると、斜めの柵で減速し続ける。
    this.rideDrive = sp >= 0.05 ? this.hspd : 0;
    this.hspd = Math.sign(this.hspd) * Math.min(Math.abs(this.hspd), sp);
    if (sp < 0.05) { this.hspd = 0; this.strideHz = 0; }
    if (this.hspd > 7) { this.breath -= 7 * dt; rt.tutMark('run'); }
    else this.breath = Math.min(this.maxBreath, this.breath + 14 * (1 - 0.5 * tired) * dt);   // 疲れた馬は息の戻りも遅い
    this.breath = Math.max(0, this.breath);
    // 馬の息が上がると、荒い鼻息が聞こえる（息が戻るほど間遠に）
    if (this.breath < this.maxBreath * 0.3) {
      this.snortT = (this.snortT || 0) - dt;
      if (this.snortT <= 0) { this.snortT = 1.4 + this.breath / this.maxBreath * 6 + Math.random() * 0.8; sfx('snort', 0.9 - this.breath / this.maxBreath); }
    }
    if (this.breath <= 5) this.breathRest = true;
    if (this.breath < this.maxBreath * 0.25 && sp > 7 && !(this.breathLowT > rt.t)) {
      this.breathLowT = rt.t + 8;
      rt.hud.flash('馬の息が残り少ない。並足で休ませる', 'dim');
      sfx('snort', 0.75);
    }
    u.moving = Math.min(0.5, sp / 12);
    u.dodging = false;
    u.u_dodging = this.iframe > 0;
    this.movedAcc += sp * dt;
    if (this.movedAcc > 6) rt.tutMark('move');
    rt.stats.dist += sp * dt;
    // 蹄の音と土ぼこり
    if (sp > 0.8) {
      this.stepT -= dt * sp;
      if (this.stepT <= 0) { this.stepT = sp > 7 ? 3.4 : 2.4; sfx(this.inWater() || rt.world.rainLevel > 0.3 || (rt.world.def.muddy || 0) > 0.5 ? 'hoovesWet' : 'hooves', sp > 7 ? 0.6 : 0.35); if (sp > 7 && rt.world.rainLevel < 0.3) rt.world.puff(u.pos.x, u.pos.z, 4); }
    }
    // 歩き方（並足・速歩・駆歩・襲歩）の一完歩の拍子。カメラの揺れと、駆ける時の重い蹄・鼻息・蹴り上げる土を同じ拍子で
    const hz = sp < 0.2 ? 0 : sp < 2.5 ? 0.95 : sp < 6.5 ? 2.6 : sp < 9.8 ? 1.75 : 2.3;
    this.strideHz = (this.strideHz || 0) + (hz - (this.strideHz || 0)) * Math.min(1, dt * 3);
    const ph0 = this.gaitPh || 0;
    this.gaitPh = ph0 + dt * this.strideHz;
    if (sp > 6 && Math.floor(this.gaitPh) !== Math.floor(ph0)) {
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      sfx('hoofBeat', Math.min(1, (sp - 5) / 6));
      // 駆けている間の息：一完歩ごとに強く吐く（息が上がるほど荒い）
      if (Math.floor(this.gaitPh) % 2 === 0) sfx('snort', 0.18 + 0.5 * (1 - this.breath / this.maxBreath));
      const wd = rt.world;
      if (wd.kick && !(wd.rainLevel > 0.6)) wd.kick(u.pos.x - fx * 0.9, u.pos.z - fz * 0.9, fx, fz, sp > 9 ? 3 : 2, sp);
    }
    // 駆けていれば、前の敵を蹴散らす（槍衾には止められる）
    if (sp > 6) {
      if (this.hspd > 4 && army.checkYari(u, this)) return;
      const loss = army.trample(u, this.hspd);
      if (loss < 1) {
        this.hspd *= loss; this.rideDrive *= loss; u.vel.x *= loss; u.vel.z *= loss;
        rt.game.hitstop = Math.max(rt.game.hitstop || 0, 0.05);
        if (!reduceMotion()) this.pitch -= 0.02;
        this.addShake(0.1);
      }
      // 道が開く：馬の前（4m ほど）の兵は、ぶつかる前に左右へ身をかわして崩れる（味方も避ける。槍衾を組んだ敵は動かない）
      this.parT = (this.parT || 0) - dt;
      if (this.parT <= 0 && army.forNear) {
        this.parT = 0.15;
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        army.forNear(u.pos.x + fx * 2.5, u.pos.z + fz * 2.5, 3, (o) => {
          if (!o.alive || o.isStruct || o.isPlayer || o.mounted || !o.push || o === u) return;
          if (o.team !== u.team && o.group && o.group.formation === 'yari') return;
          const rx = o.pos.x - u.pos.x, rz = o.pos.z - u.pos.z, ahead = rx * fx + rz * fz, lat = fz * rx - fx * rz;
          if (ahead < 0.3 || ahead > 4.5 || Math.abs(lat) > 1.6) return;
          const s = lat >= 0 ? 1 : -1, k = (1.6 - Math.abs(lat)) * (sp / 11) * 2.2;
          o.push.x += fz * s * k; o.push.z += -fx * s * k;
          if (o.team !== u.team && Math.random() < 0.25) o.stagger = Math.max(o.stagger || 0, 0.5);
        });
      }
    }
    // しばらく視点を動かさなければ、カメラが馬の後ろへ回り込む
    if (S.autoCam && !reduceMotion() && !this.lock && !this.aiming && !(this.draw > 0) && !this.radial && this.lookIdle > 1 && sp > 1) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 1.5);
  }

  // 落馬：馬が倒れる・逃げる
  fall() {
    const rt = this.rt, u = this.u;
    if (!this.mounted) return;
    this.cancelAttack();
    this.guardOn = this.guard = this.aiming = u.guard = false;
    if (this.horseHp <= 0 && this.mounted) {
      const h = this.horse, H = h && h.userData.horse;
      rt.army.setMounted(u, false);
      if (h) {
        if (h.parent) h.parent.remove(h);
        h.position.copy(u.pos); h.rotation.set(0, u.heading, 0); rt.scene.add(h);
        if (H) { H.dead = true; H.deadT = 0; }
        (rt.army.fallenHorses || (rt.army.fallenHorses = [])).push({ h, t: 0 });
      }
      this.mounted = false; this.horse = null; this.loose = null; this.hspd = 0; this.mountT = 0;
      this.knockT = 2; this.guardBroken = 1;
      u.hp = Math.max(0, u.hp - u.maxHp * 0.2);
      rt.bark(`落馬！　${this.horseName}が倒れた`, true);
      return;
    }
    this.mountT = 0;   // 乗った直後でも確実に降ろす（toggleMount の mountT>0 ガードに阻まれない）
    this.toggleMount(true);
    if (!this.loose) return;   // 乗り役でない等で降りられなかった時は何もしない
    const L = this.loose;
    // 怯えて逃げた馬は、決まった時刻に主の所へ戻らない。落馬の傷でも命を落とす。
    L.mode = 'flee';
    this.iframe = 0; this.guardBroken = 1.0; this.knockT = 2;
    u.hp = Math.max(0, u.hp - u.maxHp * 0.15);
    this.addShake(0.35);
    sfx('neigh', 1);
    rt.bark(`落馬！　${this.horseName}が逃げた`, true);
    // 近く（30m）に主を失った空馬がいれば、乗り換えられる事を知らせる
    const LH = rt.army.looseHorses;
    if (LH && LH.some((o) => o.from && !o.kept && this.horseAlive(o) && Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < 30)) {
      rt.after(2.2, () => { if (!this.mounted && u.alive) rt.bark(`近くに空馬がいる。寄って${isTouch ? '「取る」の丸' : K('use')}を長押しすれば乗り換えられる`); });
    }
  }

  updateLoose(dt) {
    const L = this.loose;
    if (!L) return;
    const rt = this.rt, u = this.u;
    if (horseLooseDanger(rt.army, this.horse, rt.t) && L.mode !== 'fled') {
      L.mode = 'flee';
    }
    this.hfat = Math.max(0, Math.min(1, (this.hfat || 0) + dt * (L.spd > 6 ? 1 / 170 : L.spd > 2.5 ? 1 / 600 : -1 / 480)));
    let want = null, speed = 0;
    if (L.mode === 'come') {
      const d = Math.hypot(u.pos.x - L.x, u.pos.z - L.z);
      if (this.horse?.userData.horse?.fear > 0.5 || d > 15 || !this.horseReachable(this.horse.position)) L.mode = 'wait';
      if (d > 2.4) { want = Math.atan2(u.pos.x - L.x, u.pos.z - L.z); speed = L.mode === 'come' ? 2.2 : 0; } else L.mode = 'wait';
    } else if (L.mode === 'flee') {
      want = L.heading; speed = 9;
      L.fleeT = (L.fleeT || 0) + dt;
      if (L.fleeT > 12 && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) > 50) { L.mode = 'fled'; this.horse.visible = false; }
    }
    if (horseExhausted(this.horse?.userData.horse, this.hfat)) speed = Math.min(speed, 2.2);
    speed *= this.horseMax ? Math.max(0.3, Math.min(1, this.horseHp / (this.horseMax * 0.6))) : 1;
    if (want !== null) L.heading += angleDiff(L.heading, want) * Math.min(1, dt * 4);
    L.spd += (speed - L.spd) * Math.min(1, dt * 2.5);
    L.h = this.horse;
    horseLooseMove(rt.army, L, dt);
    L.x = this.horse.position.x; L.z = this.horse.position.z;
    { const lim = rt.world.def.moveLim || 176; L.x = Math.max(-lim, Math.min(lim, L.x)); L.z = Math.max(-lim, Math.min(lim, L.z)); }
    this.horse.position.set(L.x, groundAt(rt.world, L.x, L.z, this.horse.position.y), L.z);
    this.horse.rotation.y = L.heading;
    animateHorse(this.horse, dt, L.spd);
  }

  // ---------------- 戦利の馬（討たれた騎馬武者の空馬を捕らえて乗る） ----------------
  // 今の馬の中身をまとめる・戻す（自分の馬と戦利の馬を乗り換えるため）
  packHorse() {
    return { horse: this.horse, name: this.horseName, speed: this.horseSpeed, max: this.horseMax, hp: this.horseHp, maxBreath: this.maxBreath, breath: this.breath, hfat: this.hfat || 0, yariResist: this.yariResist, warned: this.horseWarned, spoil: this.spoil || null };
  }
  rememberHorseCondition() {
    if (!this.ownedHorse || this.G.practice || this.rt.def.dojo) return;
    let s = this.horse === this.ownedHorse ? this.packHorse() : this.ownedLast;
    for (const o of this.rt.army.looseHorses || []) if (o.h === this.ownedHorse && o.stats) { s = o.stats; break; }
    if (!s) return;
    this.G.horse = this.G.horse || { id: 'tsukikage', bond: 0 };
    this.G.horse.condition = { health: Math.max(0, Math.min(1, s.hp / s.max)), fatigue: Math.max(0, Math.min(1, s.hfat || 0)) };
  }
  unpackHorse(s) {
    this.horse = s.horse; this.horseName = s.name; this.horseSpeed = s.speed; this.horseMax = s.max; this.horseHp = s.hp;
    this.hfat = s.hfat || 0; this.breathRest = false; this.rideGround = undefined; this.rideDrive = 0;
    this.maxBreath = s.maxBreath; this.breath = s.breath; this.yariResist = s.yariResist; this.horseWarned = s.warned; this.spoil = s.spoil;
  }

  // 徒歩の時、近くの空馬に「取る」の札を出す。E 長押し（R でも）で手綱を取って乗る
  horseAlive(o) {
    return !!o?.h?.parent && !o.h.userData.horse?.dead && (o.stats?.hp ?? o.from?.hp ?? 0) > 0;
  }

  horseCatchDuration(o) {
    const dx = this.u.pos.x - o.h.position.x, dz = this.u.pos.z - o.h.position.z;
    const behind = (Math.sin(o.heading) * dx + Math.cos(o.heading) * dz) / (Math.hypot(dx, dz) || 1) < -0.45;
    return o.calm || (behind && Math.hypot(this.u.vel.x, this.u.vel.z) < 4.2) ? 1 : 1.5;
  }

  updateTake(dt) {
    const rt = this.rt, u = this.u, L = rt.army.looseHorses;
    let best = null, bd = 3.4;
    if (!this.mounted && u.alive && L) {
      for (const o of L) {
        if (!o.from || !this.horseAlive(o) || Math.abs(o.h.position.y - u.pos.y) > 0.9) continue;
        const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
        if (d < bd && this.horseReachable(o.h.position)) { bd = d; best = o; }
      }
    }
    // 主を失った空馬が近く（15m）にいる事を、一戦に一度だけ知らせる（捕らえて乗れる事が分かるように）
    if (!this.looseNoted && !this.mounted && u.alive && L && L.some((o) => o.from && !o.kept && this.horseAlive(o) && Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < 15)) {
      this.looseNoted = true;
      rt.bark('主を失った馬がいる。そばへ寄れば手綱を取って乗れる');
    }
    if (best !== this.takeO) {
      rt.uninteract('horse-take');
      rt.unmark('horse-loose');
      this.takeO = best;
      // 空馬の頭上に印（谷の影・煙で見えない馬を見つけられる。B109）
      if (best && !best.kept && !this.mounted) { const hp0 = best.h.position; rt.marker('horse-loose', () => ({ x: hp0.x, z: hp0.z }), '空馬', { h: 2.4 }); }
      if (best) {
        const o = best, f = o.from;
        const label = o.kept ? `馬に乗る（${o.stats.name}）` : `馬を捕らえて乗る（${f.name ? f.name + 'の馬' : f.house ? f.house + 'の馬' : '空馬'}）`;
        rt.addInteract('horse-take', () => (o.h.parent ? o.h.position : null), label, () => this.takeHorse(o), { r: 3.2, hold: o.kept ? 0 : 1.5 });
      }
    }
    const o = best;
    if (o && !o.kept) {
      // 落ち着いて止まった馬や、後ろから静かに寄った時は早く捕らえられる（1秒）。そうでなければ1.5秒
      const dx = u.pos.x - o.h.position.x, dz = u.pos.z - o.h.position.z, d = Math.hypot(dx, dz) || 1;
      const easy = this.horseCatchDuration(o) === 1;
      const it = rt.interacts.find((i) => i.id === 'horse-take');
      if (it && rt.holdId !== 'horse-take') it.hold = easy ? 1.0 : 1.5;
      // 手綱を取っている間は、馬がこちらを向いて首を振り、逃げない
      if (rt.holdId === 'horse-take') { o.held = 0.25; u.heading += angleDiff(u.heading, Math.atan2(-dx, -dz)) * Math.min(1, dt * 6); }
    }
    // R で始めた手綱取り（タッチの「乗る」も同じ）
    const c = this.catching;
    if (c) {
      const q = c.o.h.position;
      if (this.mounted || !u.alive || u.climb || this.knockT > 0 || this.staggerT > 0 || !this.horseAlive(c.o) || !this.horseReachable(q) || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 3.4) {
        this.catching = null;
        if (u.alive && !this.mounted && !rt.over) {
          const why = !this.horseAlive(c.o) ? '馬がいなくなった。別の空馬を探す'
            : u.climb ? '登っている間は乗れない。地面へ降りて馬の横へ寄る'
            : this.knockT > 0 || this.staggerT > 0 ? '打たれて手綱を放した。敵から離れて、馬の横で取り直す'
            : !this.horseReachable(q) ? '馬の横へ回り、同じ高さで手綱を取る'
            : '馬から離れて手綱を放した。そばで足を止めて取り直す';
          rt.hud.flash(why, 'dim');
        }
      }
      else {
        c.t += dt; c.o.held = 0.25;
        u.heading += angleDiff(u.heading, Math.atan2(q.x - u.pos.x, q.z - u.pos.z)) * Math.min(1, dt * 6);
        if (c.t >= c.dur) { this.catching = null; this.takeHorse(c.o); }
      }
    }
  }

  // 床の層（floors.js）：すぐそばの梯子に「登る」の札を出す。E 長押しで登り始める（docs/castle-design.md 4-2）
  updateLadderUse(dt) {
    const rt = this.rt, u = this.u;
    const l = (!this.mounted && u.alive && !u.climb) ? ladderNear(u.pos.x, u.pos.z, 1.6, u.pos.y) : null;
    const ok = l && ladderAlive(l) && (l.team == null || l.team === u.team);
    if (ok !== this.ladderO) {
      rt.uninteract('ladder-climb');
      this.ladderO = ok ? l : null;
      if (ok) rt.addInteract('ladder-climb', () => (ladderAlive(l) ? { x: l.x, z: l.z } : null), `${l.name || '梯子'}を登る`, () => startClimb(u, l), { r: 1.8, hold: 0.4 });
    }
  }

  // 空馬に乗る。元の馬具・速さ・体力のまま。自分の馬（や前の戦利の馬）はその場に置いておく
  takeHorse(o) {
    const rt = this.rt, u = this.u, army = rt.army;
    if (!o || this.mounted || !this.horseAlive(o) || !u.alive || rt.over || u.climb ||
        Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) > 3.4 ||
        !this.horseReachable(o.h.position)) {
      if (o && !this.mounted) rt.hud.flash('馬の横へ回る。同じ高さで手綱を取る', 'dim');
      return;
    }
    this.cancelAttack();
    rt.uninteract('horse-take'); this.takeO = null; this.catching = null;
    if (this.horse === this.ownedHorse) this.ownedLast = this.packHorse();
    const LH = army.looseHorses;
    const i = LH.indexOf(o);
    if (i >= 0) LH.splice(i, 1);
    // 今の馬を置く：待っている馬は空馬の列に入れて、また乗れるようにする。逃げ去った戦利の馬は消す
    if (this.horse && this.loose) {
      const L = this.loose;
      if (L.mode !== 'fled' && L.mode !== 'flee') {
        LH.push({ h: this.horse, heading: L.heading, spd: 0, t: 99, kept: true, calm: true, stats: this.packHorse(), from: { team: u.team, house: '', name: '' } });
        this.horse.visible = true;
      } else if (this.spoil) rt.scene.remove(this.horse);
    }
    this.loose = null;
    let first = false;
    if (o.stats) this.unpackHorse(o.stats);
    else {
      const f = o.from;
      const who = f.name || (f.house ? `${f.house}の騎馬武者` : '騎馬武者');
      this.unpackHorse({ horse: o.h, name: f.team !== u.team ? '分捕り馬' : '借り馬', speed: f.speed, max: f.maxHp || f.hp, hp: f.hp, hfat: f.hfat || 0, maxBreath: 100, breath: 70, yariResist: 1, warned: false, spoil: { who, team: f.team } });
      first = true;
    }
    this.canRide = true;
    // 乗る（手綱を取った馬の横から鞍へ）
    rt.scene.remove(this.horse);
    this.horse.visible = true;
    u.heading = o.heading;
    u.pos.x = o.h.position.x; u.pos.z = o.h.position.z;
    army.setMounted(u, true, this.horse);
    this.mounted = true; this.mountT = 0.5; this.hspd = 0;
    sfx('snort', 0.7);   // 乗ると馬が鼻を鳴らす
    sfx('neigh', 0.8);
    if (first) {
      const S = this.spoil;
      if (S.team !== u.team && !this.spoilAwarded) {
        // 敵の馬を分捕った（戦功は一戦に一度。戦の終わりの戦功の表に載る）
        this.spoilAwarded = true;
        rt.award((t) => t.side.push(`${S.who}の馬を分捕った`), `${S.who}の馬を分捕った`, u.pos);
      } else rt.hud.flash(S.team !== u.team ? `${S.who}の馬に乗った` : '味方の空馬に乗った', 'dim');
      rt.hint('ride');
    }
  }


  get pos() { return this.u.pos; }

  spearDmg() {
    const it = ITEMS[this.G.equip.weapon];
    return 14 * it.mult * (1 + 0.1 * (this.G.stats.spear - 1));
  }

  addShake(v) { if (S.shake && !reduceMotion()) this.shake = Math.min(0.5, this.shake + v); }
  // 受け流しの間（秒）：打刀は長い。指の端末は押す遅れの分だけ少し広く
  parryWin() { return (this.weapon === 'sword' ? 0.3 : 0.22) * (isTouch ? 1.25 : 1); }

  // 打ち込みの前の知らせ：自分を狙う敵の一撃が、受け流しの間に入る少し前に、刃が光り「きん」と鳴る
  //   光ってから構えれば、ちょうど受け流しの間に入る（人の手の遅れ 0.2 秒を見込む）。一つの打ち込みに一度だけ
  updateTells(dt) {
    const u = this.u, rt = this.rt;
    const lead = this.parryWin() + 0.2;
    let best = null;
    rt.army.forNear(u.pos.x, u.pos.z, 4.5, (o) => {
      const a = o.atk;
      if (!a || a.cued || a.target !== u || !o.alive || o.team === u.team || a.t > lead) return;
      a.cued = true;
      if (!best || a.t < best.atk.t) best = o;
    });
    const s = this.tellSprite();
    if (best) {
      const dx = u.pos.x - best.pos.x, dz = u.pos.z - best.pos.z, d = Math.hypot(dx, dz) || 1;
      s.position.set(best.pos.x + (dx / d) * 0.55, (best.pos.y || 0) + 1.5, best.pos.z + (dz / d) * 0.55);
      this.tellT = 0.3; s.visible = true;
      sfx('kin', 0.45);
      if ((best.atk.heavy || best.type === 'busho' || best.type === 'samurai') && !(this.tellAdviceT > rt.t)) {
        this.tellAdviceT = rt.t + 12;
        rt.bark(best.atk.heavy ? '大きく振りかぶったぞ。敵を向いて構え、味方の列へ下がれ' : '刃が光った。敵を向いて構え、槍の列を離れるな', true);
      }
    }
    if (this.tellT > 0) {
      this.tellT -= dt;
      const k = Math.max(0, this.tellT / 0.3);
      // 動きを減らす時は大きさを変えず、薄れるだけ
      const sc = reduceMotion() ? 0.55 : 0.25 + Math.sin(k * Math.PI) * 0.55;
      s.scale.set(sc, sc, 1); s.material.opacity = reduceMotion() ? k : Math.min(1, k * 2);
      if (this.tellT <= 0) s.visible = false;
    }
  }
  // 刃の光（十字の光芒）。一枚を使い回す
  tellSprite() {
    if (this.tellS) return this.tellS;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,248,1)'); gr.addColorStop(0.22, 'rgba(255,238,196,0.75)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,250,236,0.85)'; g.fillRect(2, 31, 60, 2); g.fillRect(31, 2, 2, 60);
    const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.visible = false; s.renderOrder = 999;
    this.rt.scene.add(s);
    this.tellS = s; this.tellT = 0;
    return s;
  }

  // 率いる組は、自分を打った敵へ助けに来る（遠すぎる組・退かせた組・ほかの敵に掛かっている組は除く）
  // 鉄砲・弓で撃たれた時も：撃った者が組から 60m の内なら、組がその射手へ駆ける（遠い射手は届かないので、伏せろと言うだけ）
  callHelp(src) {
    const u = this.u;
    if (!src || src.isStruct || !src.alive || src.team === u.team || !this.rt.squadGroups) return;
    const shotKind = this.lastHit?.t === this.rt.t ? this.lastHit.kind : null;
    const arrow = shotKind === 'arrow' || !shotKind && src.type === 'bow';
    const ranged = shotKind === 'gun' || arrow || src.type === 'gun';
    let came = false, tooFar = false;
    for (const g of this.rt.squadGroups) {
      if (!g.count || g.order === 'retreat' || g.pending || (g.focus && g.focus.alive)) continue;
      const c = g.center(); if (Math.hypot(c.x - u.pos.x, c.z - u.pos.z) > 35) continue;
      const ds = Math.hypot(src.pos.x - c.x, src.pos.z - c.z);
      if (ranged && ds > 60) { tooFar = true; continue; }
      g.order = 'attack'; g.focus = src; g.seekRange = ranged ? Math.min(70, ds + 10) : 20; came = true;
    }
    if ((this.helpBarkT ?? -99) + 8 >= this.rt.t) return;
    // 組が半分より減ると、助けに来る声も弱く、怯えている
    if (came) { this.helpBarkT = this.rt.t; const few = this.rt.squadFear && this.rt.squadFear() > 0.5; this.rt.bark(few ? `組の者「お、お助けを……いや、お助けいたす……！」` : ranged ? `組の者「お助けいたす！　あの${arrow ? '射手' : '鉄砲'}を潰せ！」` : '組の者「お助けいたす！」'); }
    else if (tooFar) { this.helpBarkT = this.rt.t; this.rt.bark(arrow ? '組の者「矢は遠くから来る！　陰へ退かれよ！」' : '組の者「鉄砲は遠い！　身を低くなされ！」'); }
  }
  // 敵の攻撃を受けたとき（受け流し・防御・回避・具足）
  takeDamage(amount, src) {
    if (!Number.isFinite(amount) || amount <= 0) { this.u.hitKind = null; this.u.hitHorse = false; return 0; }
    const missile = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
    if (this.u.hitHorse && this.mounted) {
      const gun = this.u.hitKind === 'gun'; this.u.hitHorse = false; this.u.hitKind = null;
      this.horseHurt(this.horseMax * Math.min(1.2, Math.max(0, amount) / 34 * (gun ? 0.8 : 0.4)));
      return 0;
    }
    if (this.rt.def.softOpen && this.rt.t < this.rt.def.softOpen) amount *= 0.5;
    const u = this.u;
    // 矢玉も早戻りの前に記録する。倒れた原因と受けた向きを近接攻撃で上書きしない。
    if (src && !src.isStruct && src.pos) {
      const dx = u.hitIncoming ? -u.hitIncoming.x : src.pos.x - u.pos.x, dz = u.hitIncoming ? -u.hitIncoming.z : src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      this.rt.hud.damageFrom(Math.atan2(dx, dz) - this.yaw, amount);
      const hit = this.lastHit || (this.lastHit = {});
      hit.kind = u.hitKind; hit.type = src.type; hit.name = src.name || null; hit.mounted = !!src.mounted;
      hit.weapon = src.wpnKind || src.lookWeapon || src.weapon; hit.mobbed = !!u.mobbed;
      hit.blocked = false; hit.amount = 0;
      hit.guard = this.guard; hit.guardBroken = this.guardBroken > 0; hit.exhausted = this.sta <= 0;
      hit.back = dot < -0.35; hit.side = Math.abs(dot) <= 0.35; hit.ranged = missile; hit.t = this.rt.t;
      // 被弾時だけ記録する。走る馬と、実際に近くにいる味方の槍の位置を残す。
      hit.charging = !!(src.charging || src.swing?.charging);
      hit.speed = Math.hypot(src.mv?.x || 0, src.mv?.z || 0);
      hit.chargeSeconds = hit.charging ? Math.max(0, this.rt.army.time - (src.chargeT ?? this.rt.army.time)) : 0;
      hit.spearDistance = -1; hit.spearBehind = false;
      if (hit.mounted || src.type === 'cavalry') for (const g of this.rt.army.groups) {
        if (g.team !== u.team || g.routed || g.formation !== 'yari') continue;
        for (const o of g.units) {
          if (!o.alive || o.fleeing || o.woundOut || o.noTarget || (o.wpnKind || o.lookWeapon) !== 'spear') continue;
          const sx = o.pos.x - u.pos.x, sz = o.pos.z - u.pos.z, sd = Math.hypot(sx, sz);
          if (sd > 12 || (hit.spearDistance >= 0 && sd >= hit.spearDistance)) continue;
          hit.spearDistance = sd; hit.spearBehind = sx * dx + sz * dz < 0;
        }
      }
    }
    // 甲冑で止めた矢弾は浅い打撲だけ。知らせと傷の記録は通常と同じ経路を通す。
    if (u.hitArmor) { u.hitKind = null; this.inCombatT = 4; this.feelHit(amount, src); return amount; }
    // 鉄砲の弾：構えでは受けられず、一発で体力の大半を持っていかれる。しばらくよろめき、足が重くなる（出血）
    const arrowHit = u.hitKind === 'arrow';
    const gunHit = u.hitKind === 'gun'; u.hitKind = null;
    if (gunHit) { this.callHelp(src); return this.takeBullet(amount, src); }
    if (arrowHit) {
      this.callHelp(src);
      const taken = amount * (1 - this.def * 0.2);
      if (taken > 0 && this.rt.world.def.waterSlow && this.rt.world.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) > 0.15) this.staggerT = Math.max(this.staggerT || 0, 1);
      this.inCombatT = 4; this.feelHit(taken, src);
      return taken;
    }
    const hud = this.rt.hud;
    if (src && !src.isStruct) {
      const dx = src.pos.x - u.pos.x, dz = src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      this.callHelp(src);
      // 打たれた向きへカメラが一瞬押される（打った相手から離れる向き）
      if (!reduceMotion() && S.shake) { const k = Math.min(0.14, 0.04 + amount * 0.006); this.camPush = { x: -dx / d * k, z: -dz / d * k, t: 0.18 }; }
      if (dot < -0.35 && Math.random() < 0.35 && (this.backWarnT ?? -99) + 10 < this.rt.t) { this.backWarnT = this.rt.t; this.rt.bark('後ろだ！', true); }
      if (this.guard && this.sta > 0 && dot > 0.25) {
        // 構えた直後なら受け流し（相手の体勢を崩し、反撃の好機）。打刀は猶予が長い
        // 囲まれている時（u.mobbed）は、受け流しの間が半分・構えの減りが倍（四方からの槍に受けが追いつかない）
        const win = this.parryWin() * (u.mobbed ? 0.7 : 1);
        if (this.guardT < win) {
          this.rt.stats.parries++;
          this.rt.tutMark('parry');
          // 見切り：打ち込みの寸前に構える。槍は短い止めで弾き、すぐ反撃へ戻す
          const perfect = this.guardT < win * 0.45;
          sfx('parry', 1); sfx('kin', perfect ? 1.6 : 1.2);   // 高く澄んだ鋼の音を重ねる
          // 受け流しの手応え：刃が弾き合う一瞬の止めと小さな揺れ、視野がわずかに開く
          this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, this.weapon === 'spear' ? (perfect ? 0.05 : 0.035) : perfect ? 0.16 : 0.07);
          this.addShake(perfect ? 0.13 : 0.09);
          if (!reduceMotion()) this.fovKick = perfect ? 2.6 : 1.8;
          src.stagger = perfect ? 1.6 : 1.1; src.atk = null; src.swing = null; src.cd = perfect ? 1.8 : 1.3;
          src.hit = { kind: 'side', t: 0, dur: perfect ? 0.85 : 0.6, side: this.weapon === 'spear' ? 1 : -1, amp: perfect ? 1.4 : 1, heavy: perfect, res: 'block' };
          src.slipT = 0.3;
          if (!src.mounted && src.push) { src.push.x -= dz / d * 1.4; src.push.z += dx / d * 1.4; }
          this.counterT = perfect ? 1.8 : 1.3;
          this.counterPerfect = perfect;
          this.rt.game.slowmo = this.weapon === 'spear' ? (perfect ? 0.18 : 0.1) : perfect ? 0.6 : 0.35;
          this.sta = Math.min(this.maxSta, this.sta + (perfect ? 18 : 10));
          hud.flash(perfect ? '見切り' : '受け流し', 'gold');
          this.rt.hint('counter');
          return 0;
        }
        this.sta -= amount * 1.3 * (u.mobbed ? 1.5 : 1);
        this.staDelay = 0.8;
        this.rt.stats.blocks++;
        if (this.lastHit?.t === this.rt.t) this.lastHit.blocked = true;
        sfx('block', 1);
        if (this.weapon === 'spear') {
          sfx('wood', 0.35);
          this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, 0.025);
        }
        if (this.rt.game.haptic) this.rt.game.haptic('block', Math.min(1, amount / 30));
        hud.hurt(0.1);
        this.addShake(0.05);
        if (this.sta <= 0) {
          this.sta = 0; this.guardBroken = 1.1;
          hud.flash('気力が尽き、構えが崩れた', 'red');
          if (this.lastHit?.t === this.rt.t) this.lastHit.guardBroken = true;
        } else if (!(this.blockNoticeT > this.rt.t)) {
          this.blockNoticeT = this.rt.t + 8;
          hud.flash('正面を受けた。浅い傷と気力の減り', 'dim');
        }
        return amount * 0.12;
      }
    }
    this.inCombatT = 4;
    // ---- 一撃の重さ：侍・武将・騎馬・背後からの一撃ほど重い（傷も手応えも） ----
    const rt = this.rt;
    const back = !!(this.lastHit && this.lastHit.back && this.lastHit.t === rt.t);
    const cav = !!(src && !src.isStruct && (src.mounted || src.type === 'cavalry'));
    let mult = !src || src.isStruct ? 1 : cav ? 1.4 : src.type === 'busho' ? 1.35 : src.type === 'samurai' ? 1.2 : 1;
    // 背からの一撃は重い。囲まれている時はなお重い（逃げ場のない背を突かれる）
    if (back) mult *= this.u.mobbed ? 1.3 : 1.15;
    mult = Math.min(this.u.mobbed ? 1.5 : 1.35, mult);
    // def.foeHit：戦ごとの敵の打ち込みの重さ（楽すぎる戦を締める。無ければ 1）
    // 初陣から森部の槍組へは段階を踏む。三人の槍を浴び続ければ深手になる。
    const stage = rt.army.combatStage || 0;
    const novice = rt.firstBattle && rt.D === DIFFICULTY.normal && !rt.G.lord && (rt.G.rank || 0) === 0;
    const learning = rt.def.learningFight && rt.D === DIFFICULTY.normal && !rt.G.lord && (rt.G.rank || 0) <= 1;
    const weight = rt.def.dojo || novice ? 0.72 : rt.firstBattle ? 0.95 : learning ? 1 : 1.65 + stage * 0.55;
    let taken = amount * mult * (1 - this.def) * this.D.taken * (rt.def.foeHit || 1) * weight;
    // 一秒内の四本目以降だけ少し緩める。記録の入れ物を毎回作り直さない。
    const hits = this.recentHits, now = rt.t;
    while (hits.length && now - hits[0] >= 1) hits.shift();
    if (!rt.def.strictHits && hits.length >= 3 && rt.D !== DIFFICULTY.hard) taken *= u.mobbed ? 0.9 : 0.8;
    hits.push(now);
    // 受け損ねた深い一撃には、体力で決めた傷の上限を設けない。
    this.feelHit(taken, src, { back, cav });
    // 馬上では、傷の一部を馬が受ける
    if (this.mounted) { this.horseHurt(taken * 0.5); taken *= 0.65; }
    return taken;
  }

  // 弾を食らった：部位と威力で深手を決める。よろめき・構えが崩れ、深手で足が重くなる
  takeBullet(amount, src) {
    const u = this.u, rt = this.rt;
    this.inCombatT = 4;
    // 弾の重さと部位で深手を決める。頭・首への貫通に即死を防ぐ上限は設けない。
    const k = Math.max(0.2, Math.min(1.8, amount / 34));
    const part = u.hitPart;
    const severity = part === 'head' || part === 'neck' ? 1.2 : part === 'torso' ? 0.8 : 0.4;
    const taken = u.maxHp * severity * k * (1 - this.def * 0.2);
    if (this.lastHit) this.lastHit.ranged = true;
    if (rt.world.def.waterSlow && rt.world.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) > 0.15) this.knockT = Math.max(this.knockT || 0, 1);
    this.gunHurtT = 8;
    this.staggerT = Math.max(this.staggerT || 0, 1.1); this.knockT = Math.max(this.knockT || 0, 0.5);
    this.guardBroken = Math.max(this.guardBroken || 0, 1.0);
    // 鉄砲に当たった時は特に重く：耳が強く遠のいて耳鳴りが残り、視界の端が暗くすぼまる（動きを減らす設定では暗みだけ弱く）
    deafen(0.95);
    POST.dark = Math.max(POST.dark || 0, reduceMotion() ? 0.5 : 1);
    this.addShake(0.2);
    this.feelHit(Math.max(taken, 30), src, { back: false, cav: false });
    rt.hud.flash('撃たれた', 'red');
    return taken;
  }

  // 打たれた時の手応え：一瞬の止め・よろめき・画面・音・振動。重い一撃（侍・武将・騎馬・背後）ほど強い
  feelHit(taken, src, o = {}) {
    const rt = this.rt, hud = rt.hud, u = this.u;
    const w = Math.max(0.25, Math.min(1, taken / 22 + (o.cav ? 0.35 : 0) + (o.back ? 0.15 : 0)));
    const heavy = w > 0.6;
    const calm = reduceMotion();
    // ① 一瞬の止め（0.06〜0.1 秒）
    rt.game.hitstop = Math.max(rt.game.hitstop || 0, 0.05 + 0.05 * w);
    // ② よろめき：打たれた向きへ体が押される。槍の突きは半歩下がり、刀の斬りは体がねじれ、騎馬の突きは倒される
    let dx = 0, dz = 0;
    if (src && !src.isStruct && src.pos) { dx = u.hitIncoming ? u.hitIncoming.x : u.pos.x - src.pos.x; dz = u.hitIncoming ? u.hitIncoming.z : u.pos.z - src.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
    const kind = src && !src.isStruct ? ((src.swing && src.swing.kind) || (src.atk && src.atk.kind) || 'thrust') : 'thrust';
    if (!this.mounted) {
      if (o.cav) {
        this.vel.x += dx * 7; this.vel.z += dz * 7;
        this.staggerT = Math.max(this.staggerT || 0, 1.2); this.knockT = 1.2;
        this.guardBroken = Math.max(this.guardBroken, 1.2);
      } else if (/kesa|gyaku|yoko|sweep|slash/.test(kind)) {
        this.vel.x += dx * 2; this.vel.z += dz * 2;
        if (!calm) this.twist = (Math.random() < 0.5 ? -1 : 1) * (0.1 + 0.12 * w);
        this.staggerT = Math.max(this.staggerT || 0, 0.35 + 0.3 * w);
      } else {
        this.vel.x += dx * (2.6 + 2.4 * w); this.vel.z += dz * (2.6 + 2.4 * w);
        this.staggerT = Math.max(this.staggerT || 0, 0.3 + 0.3 * w);
      }
    }
    if (this.knockT > 0 || this.staggerT > 0.5) this.cancelAttack();
    // ③ 画面：縁が赤く脈打ち、一瞬白く飛び、視野がすぼまり、カメラが強く揺れて戻る
    hud.hurt(0.3 + 0.6 * w);
    this.addShake(0.1 + 0.32 * w);
    // 血の霧：打たれた所（胸の高さ）にふっと赤い霧が立つ。設定の blood（on／low／off）に従う
    // （体の陰に隠れないよう、カメラの側へ 0.6m、横へ少しずらして置く）
    { const lv = bloodLv(); if (lv && rt.world.bloodMist) {
      const c = rt.camera ? rt.camera.position : u.pos, cx = c.x - u.pos.x, cz = c.z - u.pos.z, cl = Math.hypot(cx, cz) || 1, sd = (Math.random() - 0.5) * 0.6;
      rt.world.bloodMist(u.pos.x + cx / cl * 0.6 - cz / cl * sd, u.pos.y + 1.3, u.pos.z + cz / cl * 0.6 + cx / cl * sd, (lv === 2 ? 1 : 0.5) * (0.6 + 0.4 * w));
    } }
    if (heavy) POST.dark = Math.max(POST.dark || 0, 0.45 * w);
    this.fovKick = calm ? 0 : -(2.5 + 5 * w);
    // 白く飛ぶのは一瞬だけ：続けて打たれても重ねない（乱戦で画面が白いままにならないように）
    if (!calm && heavy && (POST.exp || 1) < 1.15 && !(this.flashT > rt.t)) { this.flashT = rt.t + 1.5; POST.exp = (POST.exp || 1) + 0.15 + 0.2 * w; }
    // ④ 音：鈍い打撃・具足の鳴り・自分のうめき・重い時は耳鳴り
    sfx('hit', 0.8 + 0.7 * w); sfx(heavy ? 'yoroi' : 'kozane', 0.5 + 0.5 * w);
    if (heavy || Math.random() < 0.5) sfx('umeki', 0.4 + 0.5 * w);
    if (heavy) deafen(0.25 + 0.45 * w);
    // ⑤ 振動（ゲームパッド・スマホ）
    rt.game.vibrate(0.35 + 0.65 * w, Math.round(80 + 170 * w));
    // 話す場面（brief）の最中は手ほどきを出さない。実戦で打たれた時へ寄せる
    if (rt.phase !== 'brief') {
      if (this.lastHit && this.lastHit.ranged && this.lastHit.t === rt.t) {
        if (!(this.missileHintT > rt.t)) {
          this.missileHintT = rt.t + 8;
          rt.bark(this.lastHit.type === 'bow' ? '矢が当たった！　構えでは防げない。塀や屋敷の陰へ退け' : '鉄砲で撃たれた！　構えでは防げない。塀や屋敷の陰へ退け', true);
        }
      } else if (this.lastHit && this.lastHit.t === rt.t && !(this.meleeHintT > rt.t)) {
        this.meleeHintT = rt.t + 8;
        const hit = this.lastHit;
        const who = hit.name || (hit.mounted ? '騎馬の敵' : hit.type === 'busho' ? '敵の武将' : hit.type === 'samurai' ? '敵の侍' : '敵の兵');
        const why = hit.back ? 'に後ろから打たれた。敵に向き直って構えよ' : hit.side ? 'に横から打たれた。敵に向き直って構えよ' :
          hit.exhausted || hit.guardBroken ? 'に打たれた。気力を戻すため、味方の後ろへ退け' : 'に打たれた。「構え」で前からの打ち込みを受けよ';
        rt.bark(who + why, true);
      } else rt.hint('guard');
    }
  }

  // 倒れた札へ渡す最後の傷。向きは本人の体を基準にする。
  downCause(maxAge = 6) {
    const h = this.lastHit;
    if (!h || this.rt.t - h.t >= maxAge) return '';
    if (h.kind === 'fire') return '広間の火で傷を負った。控えの間へ退け。';
    const from = h.back ? '後ろ' : h.side ? '横' : '正面';
    const weapon = h.kind === 'gun' ? '鉄砲' : h.kind === 'arrow' ? '矢' : h.weapon === 'sword' ? '刀' : h.weapon === 'spear' ? '槍' : '打ち込み';
    const cav = h.mounted || h.type === 'cavalry';
    const horse = cav && !h.ranged ? `${h.charging ? '駆け込む騎馬' : '馬上の敵'}の一撃。${h.charging ? `助走は約${h.chargeSeconds.toFixed(1)}秒。` : ''}${h.spearDistance < 0 ? '十二歩以内に味方の槍の列はいなかった。' : `味方の槍の列まで約${Math.ceil(h.spearDistance)}歩。${h.spearBehind ? '列より敵側へ出ていた。' : '列のそばでも、敵へ向いて受ける必要がある。'}`}` : '';
    return `${from}から${weapon}を受けた。${horse}${h.blocked ? '構えで受けたが、傷が重なった。' : !h.ranged && (h.guardBroken || h.exhausted) ? '気力が足りず、構えで受けられなかった。' : ''}${h.mobbed ? '敵に囲まれていた。' : ''}`;
  }

  update(dt, input) {
    if (this.startGun) { this.startGun = false; if (this.hasGun) this.switchWeapon('gun'); }
    const u = this.u;
    if (!u.alive) {
      this.cancelAttack(); this.guardOn = this.guard = this.aiming = u.guard = false; this.lock = this.aimed = null;
      if (this.mounted) this.fall();
      this.updateLoose(dt);
      return;
    }
    // よろめき・ねじれの戻り
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.knockT > 0) this.knockT -= dt;
    if (this.gunHurtT > 0) this.gunHurtT -= dt;
    if (this.twist) { const k = Math.min(1, dt * 9); this.yaw += this.twist * k * 0.5; this.twist *= (1 - k); if (Math.abs(this.twist) < 0.002) this.twist = 0; }
    const rt = this.rt;
    const army = rt.army;
    const treating = this.treating;
    // 火皿へ移った火は、よろめきや担ぎで取り消せない。
    if (this.shot?.pan && (u.climb || this.knockT > 0 || this.staggerT > 0.5 || u.stagger > 0.5 || rt.flags?.carry || treating)) {
      this.shot.t -= dt;
      if (this.shot.t <= 0) { const sh = this.shot; this.shot = null; this.fireShot(sh.aimed, true, sh.held); }
    }
    this.treatmentCloth.visible = treating || !!this.bandaged;
    this.treatmentCloth.scale.y = this.bandaged ? 1 : 0.25 + 0.75 * (rt.holdPct || 0);
    this.time = (this.time || 0) + dt;
    this.comboHitT = (this.comboHitT || 0) - dt;
    if (this.comboHitT <= 0) this.hitChain = 0;
    // ---- 視点 ----
    const inv = S.invertY ? -1 : 1;
    // マウスの平滑化
    let tdx = input.touchDx || 0, tdy = input.touchDy || 0;
    let mdx = input.dx - tdx, mdy = input.dy - tdy;
    const lookDt = Math.max(0.001, dt);
    if (S.smooth) {
      const rate = 41.589, k = 1 - Math.exp(-rate * lookDt), tx = mdx / lookDt, ty = mdy / lookDt;
      mdx = tx * lookDt + (this.sdx - tx) * k / rate; mdy = ty * lookDt + (this.sdy - ty) * k / rate;
      this.sdx += (tx - this.sdx) * k; this.sdy += (ty - this.sdy) * k;
    }
    if (this.radial || this.radialKeyboard || input.key('Tab')) {
      mdx = mdy = tdx = tdy = 0; this.sdx = this.sdy = this.tdx = this.tdy = 0;
    }
    // 指の操作：小さな動きは細かく、大きく払うと速く回る（狙いやすく、振り向きやすく）。縦は横より控えめに
    if (isTouch) {
      const rate = 54.978, k = 1 - Math.exp(-rate * lookDt), tx = tdx / lookDt, ty = tdy / lookDt;
      const dx = tx * lookDt + ((this.tdx || 0) - tx) * k / rate, dy = ty * lookDt + ((this.tdy || 0) - ty) * k / rate;
      this.tdx = (this.tdx || 0) + (tx - (this.tdx || 0)) * k; this.tdy = (this.tdy || 0) + (ty - (this.tdy || 0)) * k;
      const aiming = this.aiming || this.draw > 0 || ((this.weapon === 'gun' || this.weapon === 'bow') && input.right);
      tdx = dx * (aiming ? 0.85 : 0.85 + Math.min(1, Math.abs(this.tdx) / 1800) * 0.55); tdy = dy * 0.8;
    }
    this.yaw -= (mdx * S.sens + tdx) * 0.0024;
    this.pitch = Math.max(-0.95, Math.min(0.55, this.pitch - (mdy * S.sens + tdy) * 0.0022 * inv));
    if (Math.abs(input.dx) + Math.abs(input.dy) > 0.5) this.manualLookAt = performance.now() / 1000;
    this.lookIdle = Math.abs(input.dx) + Math.abs(input.dy) > 0.5 ? 0 : this.lookIdle + dt;
    // ホイール：狙い定め中は相手を左右に切り替え、ふだんは視点の距離
    if (input.wheel && this.lock && !this.radial) {
      this.wheelAcc = (this.wheelAcc || 0) + input.wheel;
      if (Math.abs(this.wheelAcc) > 60) { this.switchLock(Math.sign(this.wheelAcc)); this.wheelAcc = 0; }
    } else if (input.wheel && !this.radial) {
      const before = this.zoom;
      this.zoom = Math.max(-1.6, Math.min(3.5, this.zoom + input.wheel * 0.0025));
      if (before !== this.zoom && (this.zoom === -1.6 || this.zoom === 3.5) && !(this.zoomTipT > rt.t)) {
        this.zoomTipT = rt.t + 8; rt.hud.flash(this.zoom < 0 ? 'いちばん近い視点' : 'いちばん遠い視点', 'dim');
      }
    }
    if (!this.lock) this.wheelAcc = 0;
    // [ ] で視点の感度をその場で変える
    if (input.pressed('BracketLeft')) { S.sens = Math.max(0.3, +(S.sens - 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    if (input.pressed('BracketRight')) { S.sens = Math.min(2.5, +(S.sens + 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    // ---- 狙い定め（ロックオン） ----
    if (input.pressed('KeyQ') || input.lockPressed) {
      if (this.lock) { this.lock = null; this.wheelAcc = 0; sfx('ui'); }
      else { this.lock = this.aimEnemy(26); if (this.lock) sfx('ui'); else rt.hud.flash('狙える敵がいない', 'dim'); }
    }
    if (this.lock && (!this.lock.alive || this.lock.fleeing || this.lock.woundOut || !weatherSees(rt.world, u.pos, this.lock.pos) || Math.hypot(this.lock.pos.x - u.pos.x, this.lock.pos.z - u.pos.z) > 32)) {
      const prev = this.lock;
      if (Math.hypot(prev.pos.x - u.pos.x, prev.pos.z - u.pos.z) > 32 && !(this.lockFarTipT > rt.t)) {
        this.lockFarTipT = rt.t + 8; rt.hud.flash('敵が遠ざかり、狙いが外れた', 'dim');
      }
      this.lock = null; this.wheelAcc = 0;
      // 討ち取った後は、見えている正面の敵だけを狙う。
      if (!prev.alive) this.lock = army.nearestEnemy(u, 7, (o) => !o.fleeing && !o.woundOut && !o.noTarget && !o.civ && o.type !== 'dummy' && Math.abs(angleDiff(this.yaw, Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z))) < 0.7 && this.lockVisible(o));
    }
    if (this.lock) {
      const want = Math.atan2(this.lock.pos.x - u.pos.x, this.lock.pos.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 7);
      this.pitch += (-0.2 - this.pitch) * Math.min(1, dt * 3);
    }
    if (input.pressed('KeyT')) { this.shoulder *= -1; sfx('ui'); rt.hud.flash(this.shoulder > 0 ? '右肩から見る' : '左肩から見る', 'dim'); }
    // V：短く押すと視点を回す（三人称の近い・普通・遠い、一人称）。長く押している間は「大将の目」で高くから見渡す（身分が上がるほど高く）
    if (input.pressed('KeyV')) { this.vHeld = 0; this.vStartedAt = performance.now(); }
    if (this.vHeld != null) {
      if (input.key('KeyV')) { this.vHeld = Math.max(0, (performance.now() - this.vStartedAt) / 1000); this.overHold = this.vHeld > 0.35; }
      else { if (this.vHeld <= 0.35) this.toggleView(); this.vHeld = null; this.overHold = false; }
    }
    this.showSquad = input.key('AltLeft') || input.key('AltRight');
    // ---- 号令・操作 ----
    const hasSquad = rt.squad.length > 0;
    // Tab：短く押すと指揮パネル、長押しで号令の輪（マウスで方向を選び、放して決める）
    if (this.radialKeyboard && S.radialTime !== 'run') rt.game.slowmo = Math.max(rt.game.slowmo || 0, 0.08);
    if (hasSquad && !this.radialKeyboard) {
      if (input.pressed('Tab')) { this.tabT = 0; this.radialVec = { x: 0, y: 0 }; this.radialSel = -1; this.radialPreview = -1; }
      if (input.key('Tab')) {
        // 戦の始まりから押しっぱなしだった場合にも備える
        if (this.tabT == null || !this.radialVec) { this.tabT = this.tabT || 0; this.radialVec = { x: 0, y: 0 }; this.radialSel = -1; }
        this.tabT = (this.tabT || 0) + dt;
        if (this.tabT > 0.22 && !this.radial) { this.radial = true; this.cmdOpen = false; sfx('ui'); }
        // 号令の輪を開いている間は、時がゆっくり流れる（設定の radialTime が 'run' なら流れたまま）
        if (this.radial && S.radialTime !== 'run') rt.game.slowmo = Math.max(rt.game.slowmo || 0, 0.08);
        if (this.radial) {
          // 輪を開いたまま G で号令先（全隊・槍・鉄砲・弓・騎馬）を切り替えられる
          if (input.pressed('KeyG')) this.cycleGroup();
          this.syncRadial();
          this.radialVec.x += input.dx; this.radialVec.y += input.dy;
          const L = Math.hypot(this.radialVec.x, this.radialVec.y);
          if (L > 140) { this.radialVec.x *= 140 / L; this.radialVec.y *= 140 / L; }
          if (L > 25) {
            const a = (Math.atan2(this.radialVec.x, -this.radialVec.y) + Math.PI * 2) % (Math.PI * 2);
            const i = Math.round(a / (Math.PI / 4)) % 8;
            const it = RADIAL[i];
            this.radialPreview = i;
            this.radialSel = it.min && this.G.rank < it.min ? -1 : i;
          } else { this.radialSel = -1; this.radialPreview = -1; }
        }
      } else if (this.tabT !== undefined && this.tabT !== null) {
        if (this.radial) {
          this.radial = false;
          if (this.radialSel >= 0) { const id = RADIAL[this.radialSel].id; if (id === 'rally') this.rally(); else this.command(id); rt.tutMark('radial'); }
        } else if (this.tabT <= 0.22) { this.cmdOpen = !this.cmdOpen; this.cmdOpenT = 0; sfx('ui'); }
        this.tabT = null;
      }
    }
    if (this.cmdOpen) {
      this.cmdOpenT += dt;
      if (this.cmdOpenT > 6 && !document.getElementById('cmdpanel')?.contains(document.activeElement)) this.cmdOpen = false;
      for (const c of commandList(this.G.rank)) if (c.k && input.pressed(c.k === '-' ? 'Minus' : 'Digit' + c.k)) { this.command(c.id); this.cmdOpen = false; }
      if (input.pressed('KeyG')) { this.cycleGroup(); this.cmdOpenT = 0; }
    } else if (!treating) {
      if (input.pressed('Digit1') && this.weapon !== 'spear') this.switchWeapon('spear');
      if (input.pressed('Digit2') && this.weapon !== 'sword') { if (this.hasKatana) this.switchWeapon('sword'); else rt.hud.flash('刀を持っていない（城下の問屋で買える）', 'dim'); }
      if (input.pressed('Digit3') && this.weapon !== 'gun') { if (this.hasGun) this.switchWeapon('gun'); else rt.hud.flash('火縄銃を持っていない（城下の問屋で買える）', 'dim'); }
      if (input.pressed('Digit4') && this.weapon !== 'bow') { if (this.hasBow) this.switchWeapon('bow'); else rt.hud.flash('弓を持っていない（城下の問屋で買える）', 'dim'); }
      // 次の武器へ（触る端末の持ち替え釦から送る）
      if (input.pressed('WeaponNext')) { const L = this.weaponList(); this.switchWeapon(L[(L.indexOf(this.weapon) + 1) % L.length]); }
    }
    if (hasSquad) for (const [k, id] of QUICK_ENTRIES) if (input.pressed(k)) this.command(id);
    if (input.quickCmd && hasSquad) this.command(input.quickCmd);
    if (input.pressed('KeyF')) this.rally();
    if (!treating && input.pressed('KeyE')) rt.interact();
    if (!treating && input.pressed('KeyR')) this.toggleMount();
    this.mountT = (this.mountT || 0) - dt;
    this.updateLoose(dt);
    this.updateTake(dt);
    if (!treating) this.updateLadderUse(dt);

    // ---- 移動 ----
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = (this.mounted ? 1 : -1) * Math.cos(this.yaw), rz = (this.mounted ? -1 : 1) * Math.sin(this.yaw);
    let ix = 0, iz = 0;
    if (input.key('KeyW')) iz += 1;
    if (input.key('KeyS')) iz -= 1;
    if (input.key('KeyD')) ix += 1;
    if (input.key('KeyA')) ix -= 1;
    if (input.axis && Math.hypot(input.axis.x, input.axis.y) > (input.touchMoving ? 0 : 0.18)) { ix = input.axis.x; iz = -input.axis.y; }
    if (this.u && this.u.climb) { ix = 0; iz = 0; }   // 梯子を登る間は歩かない（siege_ladder.js）
    if (treating) { ix = 0; iz = 0; }   // 布を巻く間は足を止める。放せば中断して退ける。
    this.inX = ix; this.inZ = iz;   // 押している向き（技の出し分けに使う）
    let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const mlen = Math.hypot(mx, mz);
    const ml = Math.min(1, mlen);
    if (mlen > 0) { mx /= mlen; mz /= mlen; }
    this.guardBroken -= dt;
    // 指の構えは押すたびに保つ・解く。一つの親指で狙い、放つ、回避へ移れる。
    const guardToggle = S.guardToggle || !!input.touchGuardToggle;
    if (guardToggle && input.rightPressed) this.guardOn = !this.guardOn;
    const rightHeld = !treating && !u.climb && !(this.knockT > 0) && (guardToggle ? this.guardOn : input.right);
    const ranged = this.weapon === 'gun' || this.weapon === 'bow';
    // パソコンの鉄砲：左を押し続けると構え、離して放つ
    const padGun = this.weapon === 'gun' && !isTouch;
    this.lHoldT = padGun && input.left ? (this.lHoldT || 0) + dt : 0;
    this.aiming = !treating && ranged && (rightHeld || (padGun && this.lHoldT > 0.2));   // 馬上でも鉄砲・弓（騎射）を構えられる
    const wantGuard = !ranged && rightHeld && this.sta > 0 && this.guardBroken <= 0;
    if (wantGuard && !this.guard) { this.guardT = 0; sfx('kozane', 0.45); }   // 構える時の具足の擦れる音
    if (this.guard && !wantGuard) this.guardOffT = this.time;   // 構えを解いた時（直後の一押しも「構えから」の技に数える）
    this.guard = wantGuard;
    if (this.guard) this.guardT += dt;
    u.guard = this.guard;
    // W を素早く二度押しでも走る
    if (input.pressed('KeyW')) { if (this.lastW != null && this.time - this.lastW < 0.3) this.dblRun = true; this.lastW = this.time; }
    if (!input.key('KeyW')) this.dblRun = false;
    const shift = input.key('ShiftLeft') || input.key('ShiftRight') || input.runHeld || this.dblRun;
    if (S.runToggle) {
      if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) this.running = !this.running;
      if (input.axis) this.running = !!input.runHeld;
      if (ml === 0) this.running = false;
    } else this.running = shift;
    if (this.mounted) this.rideMove(dt, input, iz, mx, mz, ml);
    else {
      // 斬り合っている間（直近3秒に突いた）は、走って気力を削らない：でないと突き続けるうちに気力が切れ、
      // 突いても出なくなる（「突いても当たらない」の大半は、実は出が止まっていただけだった。bot の数で確かめ済み）
      const canRun = u.hp > u.maxHp * 0.4 && !(Math.max(u.rangedWound || 0, u.woundSlow || 0) > 0.25) && this.running && this.sta > 5 && ml > 0 && !this.guard && !this.aiming && !(this.draw > 0) && !(this.inCombatT > 0);
      // よろめいている間は足が思うように出ない（騎馬に倒された時はほとんど動けない）
      // 撃たれた後しばらくは足が重い（走れても遅い。gunHurtT が減るにつれ戻る）
      const shot = this.gunHurtT > 0 ? 0.55 + 0.45 * (1 - this.gunHurtT / 8) : 1;
      // 深手（体力が三割を切る）は足が重い：歩みも走りも鈍る（傷の深さに応じて）
      const wound = !TOFF ? Math.max(0, 1 - u.hp / (u.maxHp * 0.5)) : 0;
      const lowHp = TOFF ? 1 : Math.min(1, Math.max(0.35, u.hp / (u.maxHp * 0.5))) * (1 - Math.min(0.65, Math.max(u.rangedWound || 0, u.woundSlow || 0)));
      const tf = terrainFx(rt.world, u, u.pos.x, u.pos.z, uphillAt(rt.world, u.pos.x, u.pos.z, mx, mz));
      u.terrain = tf.tag; u._tdef = tf.def; u._tdefHigh = tf.defHigh;
      const mud = tf.spd * (0.55 + 0.45 * this.sta / this.maxSta);
      const speed = mud * (this.guard || this.aiming || this.draw > 0 || this.charging ? 2.0 : canRun ? 6.4 : 3.7) * ml * shot * lowHp * (this.knockT > 0 ? 0.1 : this.staggerT > 0 ? 0.45 : 1);
      this.staDelay -= dt;

      // 回避
      this.dodgeT -= dt; this.iframe -= dt;
      if (!treating && input.pressed('Space') && !u.climb && !(this.knockT > 0) && this.sta >= 20 && this.dodgeT <= -0.3) {
        this.sta -= 20; this.staDelay = 0.6;
        this.dodgeT = 0.32; this.iframe = 0.3;
        rt.tutMark('dodge');
        this.dodgeDir = ml > 0 ? { x: mx, z: mz } : { x: -fx, z: -fz };
        sfx('step', 1.4);
      } else if (input.pressed('Space') && this.sta < 20) rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      let tvx = mx * speed, tvz = mz * speed;
      // 溜め・技の間は足が鈍る。ただし一コマで落とさず、なめらかに緩めて戻す（走りながら突く時に足が止まってはまた走る、のカクつきを無くす）
      const slowTo = this.pending ? 0.3 : u.swing && u.swing.t < u.swing.dur ? 0.55 : 1;
      this.atkSlow = (this.atkSlow ?? 1) + (slowTo - (this.atkSlow ?? 1)) * Math.min(1, dt * 9);
      tvx *= this.atkSlow; tvz *= this.atkSlow;
      // 加減速をなめらかに。具足が重いほど出足と止まりが遅い（走りへの出足はさらに遅い）
      const heavy = Math.max(0, Math.min(0.5, this.def || 0));
      const tsp = Math.hypot(tvx, tvz), csp = Math.hypot(this.vel.x, this.vel.z);
      const acc = Math.min(1, dt * (ml > 0 ? (tsp > csp + 1 && tsp > 5 ? 6.5 : 10) - heavy * 6 : 12 - heavy * 6));
      this.vel.x += (tvx - this.vel.x) * acc;
      this.vel.z += (tvz - this.vel.z) * acc;
      let vx = this.vel.x, vz = this.vel.z;
      if (this.dodgeT > 0) { vx = this.dodgeDir.x * 8.5 * mud; vz = this.dodgeDir.z * 8.5 * mud; }
      if (treating) { vx = 0; vz = 0; }
      this.movePlayer(dt, vx, vz);
      vx = u.vel.x; vz = u.vel.z;
      this.vel.x = vx; this.vel.z = vz;
      const sp = Math.hypot(vx, vz);
      if (canRun && sp > 0.1) { this.sta -= 11 * this.heavy * (1 + wound * 0.65) * dt; this.staDelay = 0.4; rt.tutMark('run'); }
      else if (this.staDelay <= 0 && !(sp > 0.2 && tf.tire > 0)) this.sta += (this.guard ? 5 : 22) * (1 - wound * 0.5) * dt;
      if (sp > 0.2) this.sta -= tf.tire * sp * 1.5 * dt;
      this.sta = Math.max(0, Math.min(this.maxSta, this.sta));
      this.movedAcc += sp * dt;
      if (this.movedAcc > 6) rt.tutMark('move');
      if (this.guard && this.guardT > 0.4) rt.tutMark('guard');
      u.moving = Math.min(1.4, sp / 3.5);
      u.dodging = this.dodgeT > 0;
      u.u_dodging = this.iframe > 0;
      // 足音と具足の音
      if (sp > 0.8) {
        this.stepT -= dt * sp;
        if (this.stepT <= 0) {
          this.stepT = 1.6;
          // 足音は地面で変わる（雨・砂・道・草）
          const W = rt.world;
          const onPath = (W.def.paths || []).some((pth) => distToPolyline(u.pos.x, u.pos.z, pth) < 3);
          const sandy = W.def.water ? u.pos.x > W.def.water.x - 16 || (Math.abs(u.pos.x) < 18 && Math.abs(u.pos.z) < 18) : false;
          // 川・浅瀬を渡る時は、水を蹴る音
          const wade = this.inWater();
          if (wade) W.spray(u.pos.x, u.pos.z, 3);
          const room = NAKA.cur;
          let stepSound;
          if (room) {
            const dx = u.pos.x - room.I.x, dz = u.pos.z - room.I.z;
            const floor = interiorFloorAt(room.lv.layout, dx * room.I.c - dz * room.I.s, dx * room.I.s + dz * room.I.c);
            stepSound = floor === 'tatami' ? 'stepTatami' : floor === 'earth' ? 'step' : 'stepWood';
          } else stepSound = wade ? 'wade' : W.rainLevel > 0.3 ? 'stepWet' : sandy ? 'stepSand' : onPath ? 'stepPath' : 'step';
          sfx(stepSound, wade ? 0.8 : 0.6); if (this.def > 0.1) sfx('clank', 0.8); if (sp > 5 && !room) rt.world.puff(u.pos.x, u.pos.z, 3);
        }
        rt.stats.dist += sp * dt;
      }
      // 移動中にしばらく視点を動かさなければ、カメラが背後へ回り込む
      if (S.autoCam && !reduceMotion() && !this.lock && !(this.inCombatT > 0) && ml > 0 && this.lookIdle > 1 && iz >= 0) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 1.2);
      // 向き：構え・攻撃・狙い定め中はカメラ方向、それ以外は進行方向
      let want = null;
      // 一人称では、体はいつも見ている方を向く（振り向くと自分の背が見える、を防ぐ）
      if (this.guard || this.aiming || this.shot || this.pending || input.left || this.inCombatT > 0 || this.lock || this.fpK > 0.5) want = this.yaw;
      else if (ml > 0) want = Math.atan2(mx, mz);
      // 照準補助で相手へ向き直る時は、一コマで体を回さず、速く滑らかに向き直る（カメラも少し付いて来る）
      if (this.assist && this.assist.t > 0) {
        this.assist.t -= dt;
        want = this.assist.h;
        this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * (this.fpK > 0.5 ? 9 : 2.5));
        u.heading += angleDiff(u.heading, want) * Math.min(1, dt * 22);
      } else if (want !== null) u.heading += angleDiff(u.heading, want) * Math.min(1, dt * 12 * tf.turn);
      // 踏み込み（照準補助で半歩先の敵へ）：一コマで跳ばず、0.12 秒かけて滑るように寄る
      if (this.lunge && this.lunge.t > 0) {
        const k = Math.min(dt, this.lunge.t) / 0.12;
        const lx = u.pos.x, lz = u.pos.z, ly = u.pos.y;
        const nx = lx + this.lunge.x * k, nz = lz + this.lunge.z * k;
        if (this.canStep(lx, lz, nx, nz, ly)) {
          u.pos.x = nx; u.pos.z = nz;
          army.collide(u, dt);
          if (!this.canStep(lx, lz, u.pos.x, u.pos.z, ly)) { u.pos.x = lx; u.pos.z = lz; }
          u.pos.y = groundAt(rt.world, u.pos.x, u.pos.z, ly);
        }
        this.lunge.t -= dt;
      }

    }
    if (this.mounted && this.horseStopUntil > rt.t) {
      this.pending = null; this.buffer = 0; this.chargeT = 0; u.pAtk = null;
      this.cd = Math.max(this.cd, 0.2);
    }
    // ---- 攻撃 ----
    if (u.climb || this.knockT > 0 || this.staggerT > 0.5 || u.stagger > 0.5) this.cancelAttack();
    if (this.assistImpact) {
      const a = this.assistImpact; a.t -= dt;
      if (a.t <= 0 && (!this.lunge || this.lunge.t <= 0) && Math.abs(angleDiff(u.heading, a.h)) < 0.15) { this.assistImpact = null; this.strike(a.kind, a.third, false, true); }
      else if (a.t < -0.5) this.assistImpact = null;
    }
    const impact = this.swingImpact;
    if (impact && u.swing !== impact.swing) this.swingImpact = null;
    else if (impact && impact.swing.t + dt >= impact.swing.dur * impact.swing.at) { this.swingImpact = null; this.strike(impact.kind, impact.third, true); }
    if (!treating && !u.climb && !(this.knockT > 0) && !(this.staggerT > 0.5) && !(u.stagger > 0.5) && !(this.mounted && this.horseStopUntil > rt.t)) {
    this.cd -= dt;
    this.comboT -= dt;
    this.inCombatT -= dt;
    this.counterT -= dt;
    this.buffer -= dt;
    if (u.alive) this.updateTells(dt);
    // 押した時に、構えから（構えている・解いた直後 0.4 秒）かを覚える
    if (input.leftPressed) { this.buffer = Math.max(isTouch ? 0.32 : 0.22, Math.min(0.55, (this.cd > 0 ? this.cd : 0) + (this.pending ? this.pending.t : 0) + 0.12)); this.chargeT = 0; this.pressGrd = this.guard || this.time - (this.guardOffT ?? -9) < 0.4; }
    // 竹束などを担いでいる間（戦の定義の flags.carry）は、両手がふさがって突けない
    if (this.rt.flags && this.rt.flags.carry) {
      if (input.leftPressed && !(this.carryWarnT > this.rt.t)) { this.carryWarnT = this.rt.t + 8; this.rt.hud.flash('担いでいる間は突けない（据えてから）', 'dim'); }
      this.cancelAttack();
    }
    // 火縄銃・弓：左で撃つ・射る（槍・刀の攻めは出さない）
    if ((this.weapon === 'gun' || this.weapon === 'bow') && !rt.flags?.carry) { this.rangedUpdate(dt, input); this.buffer = 0; }
    else this.rangedIdle();
    // 押し続けると溜め突き（離したときに出る）
    const blade = this.weapon === 'spear' || this.weapon === 'sword';
    if (input.left && blade && !rt.flags?.carry && this.cd <= 0 && this.dodgeT <= 0 && !this.guard && !this.pending) this.chargeT += dt;
    this.charging = this.chargeT > 0.25 && input.left && blade;
    // 刀の長押し：溜める間、刀を頭上（上段）へ振りかぶって見せる。槍は引いて突きに備える
    if (this.charging && !this.pending) {
      const kd = this.weapon === 'sword' ? 'kara' : 'thrust';
      const pose = this.meleePose; pose.kind = kd;
      pose.t = Math.max(0, 0.7 - this.chargeT);
      pose.dur = 0.45; u.pAtk = pose;
      if (!this.chargeCue && this.chargeT > (this.weapon === 'sword' ? 0.7 : 1.4)) { this.chargeCue = true; sfx('kozane', 0.6); }
    } else if (!this.pending && u.pAtk && this.chargeT > 0 && !input.left) u.pAtk = null;
    if (!input.left) this.chargeCue = false;
    // 長柄を頭上で回さず、長押しも前へ突く。
    if (!input.left && blade && !rt.flags?.carry && this.cd <= 0 && this.dodgeT <= 0 && this.chargeT > 0.7 && this.sta >= 20 && !this.pending && this.weapon === 'sword') {
      // 刀の長押し：上段から真っ向に斬り下ろす（重く、兜の上からも効く）
      this.sta -= 20; this.staDelay = 0.8;
      this.pending = { t: 0.1, kind: 'kara' };
      this.cd = 0.8; this.buffer = 0;
      sfx('slash', 1.3); this.techNote('kara');
    } else if (!input.left && blade && !rt.flags?.carry && this.cd <= 0 && this.dodgeT <= 0 && this.chargeT > 0.7 && this.sta >= 22 && !this.pending) {
      this.sta -= 22; this.staDelay = 0.8;
      this.pending = { t: 0.08, kind: 'charged' };
      this.cd = 0.9; this.buffer = 0;
      sfx('thrust', 1.3); this.techNote('charged');
    }
    if (!input.left) this.chargeT = 0;
    // 槍・刀は、押している間は一撃を待たせ、離した時に出す（短く押せばすぐ、長く押せば溜めの技だけが出る。二度出ない）
    const held = input.left && blade && !this.guard;
    if (held && this.buffer > 0) this.buffer = Math.max(this.buffer, 0.1);
    if (blade && !rt.flags?.carry && !held && this.buffer > 0 && this.cd <= 0 && !this.pending && this.dodgeT <= 0) {
      this.buffer = 0;
      // 槍の技：構えて前へ押しながら＝叩き下ろし、構えながら・横へ押しながら＝払う、後ろへ押しながら＝石突き、そのほか＝突き（続けて突く）
      // 構えを解いた直後（0.4 秒）の一押しも「構えから」に数える（指の端末は「構え」と「突く」を一つの親指で続けて押す）
      const side = Math.abs(this.inX || 0) > 0.5 && Math.abs(this.inZ || 0) < 0.5, backK = (this.inZ || 0) < -0.5;
      const grd = this.guard || !!this.pressGrd;
      if (this.weapon === 'spear') {
        if (grd && (this.inZ || 0) > 0.5 && this.sta >= 18) {
          // 構えて前へ押しながら：叩き下ろし
          this.sta -= 18; this.staDelay = 0.7;
          this.pending = { t: 0.26, kind: 'slam' };
          this.cd = 1.0;
          sfx('swing'); this.techNote('slam');
        } else if (this.jumonji && backK && this.sta >= 12 && army.enemiesInArc(u.pos, u.heading, 3.3, 0.6, u.team).length) {
          // 十文字槍：後ろへ押しながら（前に敵がいる時）＝鎌刃で引っかけて引き倒す
          this.sta -= 12; this.staDelay = 0.6;
          this.pending = { t: 0.14, kind: 'hook' };
          this.cd = 0.85 * this.spearCd;
          sfx('thrust', 0.9); this.techNote('hook');
        } else if ((grd || side) && this.sta >= (grd ? 18 : 14)) {
          // 構えながら（今までどおりの薙ぎ払い）か、横へ押しながら：払う
          this.sta -= grd ? 18 : 14; this.staDelay = 0.7;
          this.pending = { t: 0.22, kind: 'sweep', dir: side && (this.inX || 0) < 0 ? -1 : 1 };
          this.cd = grd ? 1.0 : 0.9;
          sfx('swing'); if (side) this.techNote(this.jumonji ? 'kama' : 'sweep');
        } else if (backK && this.sta >= 6) {
          this.sta -= 6; this.staDelay = 0.4;
          this.pending = { t: 0.08, kind: 'butt' };
          this.cd = 0.5;
          sfx('swing', 0.7); this.techNote('butt');
        } else if (this.sta >= 6) {
          this.combo = this.comboT > 0 ? this.combo + 1 : 1;
          const third = this.combo >= 3 && this.sta >= 12;
          this.sta -= 6 + (third ? 6 : 0); this.staDelay = 0.5;
          this.pending = { t: 0.12, kind: 'thrust', third };
          this.cd = (third ? 0.85 : this.combo === 2 ? 0.32 : 0.42) * this.spearCd;
          if (third) this.combo = 0;
          this.comboT = 0.75;
          sfx('thrust');
        } else rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      } else if (this.sta >= 5) {
        this.sta -= 5; this.staDelay = 0.4;
        // 打刀：構えから（解いた直後も）なら突き、横へ押しながらなら横薙ぎ、そうでなければ斬り。
        // 続けて押せば切り返し（素早く逆から）、三つ目は踏み込んだ重い袈裟
        if (grd) { this.pending = { t: 0.1, kind: 'kthrust' }; this.cd = 0.55; sfx('thrust'); this.techNote('ktsuki'); }
        else if (side && this.sta >= 5) {
          this.sta -= 5; this.kCombo = 0;
          this.pending = { t: 0.16, kind: 'nagi', dir: (this.inX || 0) < 0 ? -1 : 1 };
          this.cd = 0.6; sfx('slash', 1.1); this.techNote('nagi');
        } else {
          this.kCombo = this.comboT > 0 ? (this.kCombo || 0) + 1 : 1;
          const third = this.kCombo >= 3 && this.sta >= 4;
          this.slashK = third ? 'kesa' : this.kCombo === 2 ? 'gyaku' : 'kesa';
          if (third) { this.kCombo = 0; this.sta -= 4; this.techNote('kesa'); } else if (this.kCombo === 2) this.techNote('kaeshi');
          this.pending = { t: third ? 0.16 : 0.1, kind: 'slash', third };
          this.cd = third ? 0.62 : this.kCombo === 2 ? 0.26 : 0.4;
          this.comboT = 0.7;
          sfx('slash', third ? 1.2 : 1);
        }
      } else rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      // 息が上がると腕が重い：気力が三割を切ると、振りの出も戻りも遅くなる（いちばん切れた時で 1.35 倍）
      const tiredK = 1 + Math.max(0, 0.3 - this.sta / this.maxSta) / 0.3 * 0.35;
      if (tiredK > 1.01) { this.cd *= tiredK; if (this.pending) this.pending.t *= tiredK; }
      this.inCombatT = 3;
    }
    if (this.pending) {
      this.pending.t -= dt;
      // 構えから溜める動き（刀は振りかぶり、槍は引いて溜める）を見せる
      const p0 = this.pending;
      if (!p0.dur) p0.dur = Math.max(0.05, p0.t + dt);
      const pk = p0.kind === 'slash' ? this.nextSlash() : p0.kind === 'kthrust' ? 'tsuki' : p0.kind === 'nagi' ? 'yoko' : p0.kind === 'kara' ? 'kara' : p0.kind === 'spin' ? 'spinW' : p0.kind === 'sweep' ? 'sweep' : p0.kind === 'slam' ? 'slam' : p0.kind === 'butt' ? 'butt' : p0.kind === 'hook' ? 'hook' : 'thrust';
      const pose = this.meleePose; pose.kind = pk; pose.t = p0.t; pose.dur = p0.dur; u.pAtk = pose;
      if (this.pending.t <= 0) {
        const p = this.pending;
        this.pending = null;
        u.pAtk = null;
        this.pendDir = p.dir || 1;
        this.strike(p.kind, p.third);
      }
    }
    }
    this.trailTick(dt);
    // 穂先を相手に合わせる（近すぎれば柄を繰り込む）ための相手
    u.fitT = this.lock && this.lock.alive ? this.lock : this.aimed;

    // ---- 照準の状態（HUD用） ----
    // 間合いの予告は十分の一秒ごと。命中の保証ではなく、刃・射線・向き直りを分ける。
    const kind = this.previewMeleeKind();
    if (!(this.rangeAt > rt.t) || Math.abs(angleDiff(this.rangeHeading ?? u.heading, u.heading)) > 0.15 || this.rangeWeapon !== this.weapon || this.rangeKind !== kind) {
      this.rangeAt = rt.t + 0.1; this.rangeHeading = u.heading; this.rangeWeapon = this.weapon; this.rangeKind = kind;
      this.updateRangeCue(kind);
    }
    this.aimT = (this.aimT || 0) - dt;
    if (this.aimT <= 0 || (this.aimed && (!this.aimed.alive || this.aimed.woundOut || this.aimed.fleeing))) { this.aimT = 0.15; this.aimed = this.lock || this.aimEnemy(14); }

    // ---- 倒れた敵の鉄砲を拾う（近づくと「鉄砲を拾う」。E／指の端末は丸の釦） ----
    // 囲まれた知らせ（12 秒に一度）
    if (u.mobbed && !(this.mobWarnT > rt.t)) { this.mobWarnT = rt.t + 12; rt.bark('囲まれた！　味方のいる所まで下がれ', true); }
    // 深手の知らせ（12 秒に一度）：危ない時こそ構えで凌ぐ事を教える（kaito「原因を測ってから」）
    if (u.hp < u.maxHp * 0.3 && !(this.lowHpWarnT > rt.t)) { this.lowHpWarnT = rt.t + 12; rt.bark(this.lastHit && this.lastHit.ranged && rt.t - this.lastHit.t < 8 ? '深手だ！　矢玉を避け、塀や屋敷の陰へ退け' : '深手だ！　構えで受け流し、組の者のいる所まで退け', true); }
    this.pickT = (this.pickT || 0) - dt;
    if (this.pickT <= 0 && !this.mounted) { this.pickT = 0.3; this.findGunPickup(); }

    // 傷は自然には治らない。敵から退き、味方のそばで応急処置を選ぶ。
    this.updateTreatment(dt);
    this.rallyCd -= dt;
    // 揺れは直線でなく、ばねのように速く減って尾を引く
    this.shake = Math.max(0, this.shake * Math.exp(-dt * 3.2) - dt * 0.12);
    this.updateSquad(dt);
    // 討たれない武将に手傷を負わせた（units.js の generalWounded が woundQ に積む）
    if (army.woundQ && army.woundQ.length) for (const w of army.woundQ.splice(0)) this.generalWounded(w.u, w.src);
    if (this.lock && this.lock.woundOut) { this.lock = null; this.wheelAcc = 0; }
  }

  // 手傷を負わせた武将：知らせと戦功（+20「〇〇に手傷」）。戦の定義に onGeneralWounded があれば呼ぶ
  generalWounded(g, src) {
    const rt = this.rt, name = g.name || '敵の将';
    if (this.lock === g) { this.lock = null; this.wheelAcc = 0; }
    if (this.aimed === g) this.aimed = null;
    // 個々の手傷は短い知らせにする。任務の大見出しを待たせない。
    rt.bark(`${name}、手傷を負って退いた！`, g.team === this.u.team);
    const tr = rt.tracker;
    // 味方の負傷や、ほかの隊の一撃を本人の戦功に数えない。
    if (tr && g.team !== this.u.team && src?.team === this.u.team && (src.isPlayer || src.isSub)) {
      // 戦功の行に「敵武将に手傷」を足す（state.js の MeritTracker に行が無いので、この戦の tracker にだけ足す）
      if (!tr.wounds) {
        tr.wounds = [];
        const base = tr.lines.bind(tr);
        tr.lines = () => { const L = base(); for (const w of tr.wounds) L.push({ label: '敵武将に手傷', detail: w, pts: 20, cat: '武', big: true }); return L; };
      }
      rt.award((t) => t.wounds.push(name), `${name}に手傷`, g.pos);
    }
    if (rt.def && rt.def.onGeneralWounded) rt.def.onGeneralWounded(rt, g);
  }

  lockVisible(o) {
    const army = this.rt.army;
    return weatherSees(this.rt.world, this.u.pos, o.pos) && !army.hiddenBehind(this.u, o) &&
      !army.wallBetween(this.u.pos, this.u.team, o.pos) && !army.terrainBlocks(this.u.pos, o.pos);
  }

  // 狙い定めの相手を左右の隣の敵へ
  switchLock(dir) {
    const u = this.u;
    const cur = this.lock;
    this.wheelAcc = 0;
    if (!cur || !cur.alive) return;
    const baseA = Math.atan2(cur.pos.x - u.pos.x, cur.pos.z - u.pos.z);
    let best = null, bd = Infinity;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === u.team || o === cur || o.woundOut || o.fleeing || o.noTarget || o.civ || o.type === 'dummy') continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < 0.001 || d > 26 || !this.lockVisible(o)) continue;
      const a = angleDiff(baseA, Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z));
      if (Math.sign(-a) !== dir) continue;
      const score = Math.abs(a) * 10 + d * 0.1;
      if (score < bd) { bd = score; best = o; }
    }
    if (best) { this.lock = best; this.aimT = 0; sfx('ui'); }
    else if (!(this.lockSwitchTipT > this.rt.t)) {
      this.lockSwitchTipT = this.rt.t + 8;
      this.rt.hud.flash(`${dir > 0 ? '右' : '左'}に替えられる敵がいない。二十六歩以内の見える敵を狙う`, 'dim');
    }
  }

  // 中断した押し込みは、指を放した攻撃として出さない。
  cancelAttack() {
    if (this.swingImpact) this.u.swing = null;
    this.swingImpact = null; this.assistImpact = null; this.bowHold = 0;
    this.pending = null; this.buffer = 0; this.chargeT = 0; this.charging = false; this.chargeCue = false;
    this.lunge = null; this.assist = null; this.u.pAtk = null; this.pressGrd = false;
    this.stickTo = null; this.stickT = 0;
    this.rangedIdle();
  }

  switchWeapon(w) {
    if (w === this.weapon || !this.weaponList().includes(w)) return;
    if (this.shot?.pan) { this.rt.hud.flash('火皿に火が移った。放ってから持ち替える', 'dim'); return; }
    const oldWeapon = this.weapon;
    const u = this.u;
    this.cancelAttack();
    this.combo = this.kCombo = this.comboT = 0;
    this.guardOn = this.guard = this.aiming = u.guard = false; this.guardOffT = -9;
    this.cd = Math.max(this.cd, w === 'gun' || w === 'bow' ? 0.6 : 0.35);  // 持ち替えの隙
    u.hand.remove(u.wpn);
    u.wpn = { sword: this.swordMesh, gun: this.gunMesh, bow: this.bowMesh }[w] || this.spearMesh;
    u.hand.add(u.wpn);
    u.wpnKind = w;
    this.weapon = w;
    this.aimT = 0; this.aimed = this.lock || this.aimEnemy(14);
    if (this.gunReload > 0 && !this.gunLoaded && (w === 'gun' || oldWeapon === 'gun')) this.rt.hud.flash('鉄砲は弾込めの途中。戻して足を止めれば続ける', 'dim');
    this.reachT = 2;   // 足もとに間合いの輪を 2 秒（battle.js updateSquadAids）
    // 持ち替えの音：刀は鞘走り（しゃっ）、ほかは柄と具足の擦れる音。画面の音（ui）は鳴らさない
    sfx(w === 'sword' ? 'saya' : 'kozane', w === 'sword' ? 0.8 : 0.7);
    if (w === 'gun') this.rt.hud.flash(isTouch ? '鉄砲　狙うの丸で構え、放つの丸で撃つ' : '鉄砲　右で構え、左で放つ。左を長く押して離しても撃てる', 'dim');
    if (w === 'bow') this.rt.hud.flash(isTouch ? '弓　狙うの丸で構え、射るの丸を押して引き、離して射る' : '弓　右で構え、左を押して引き、離して射る', 'dim');
  }
  // 持っている武器の並び（持ち替えの順）
  weaponList() {
    const mask = (this.hasKatana ? 1 : 0) | (this.hasGun ? 2 : 0) | (this.hasBow ? 4 : 0);
    if (!this.weapons || this.weaponMask !== mask) {
      this.weaponMask = mask; this.weapons = ['spear'];
      if (this.hasKatana) this.weapons.push('sword');
      if (this.hasGun) this.weapons.push('gun');
      if (this.hasBow) this.weapons.push('bow');
    }
    return this.weapons;
  }

  // ---------------- 敵の鉄砲を拾う ----------------
  // 討たれた鉄砲足軽（または脇差を抜いて鉄砲を置いた者）の鉄砲が、2.4m 内にあれば拾える
  findGunPickup() {
    const rt = this.rt, army = rt.army, p = this.u.pos;
    let best = null, bd = 2.4;
    const look = (o) => {
      if (Math.abs(o.pos.y - p.y) > 2) return;
      if (o.type !== 'gun' || o.team === this.u.team || o.gunTaken || (this.hasGun && this.gunAmmo == null)) return;
      const w = o.alive ? (o.sidearm ? o.dropped : null) : (o.dropped || (o.wpnKind !== 'sword' ? o.wpn : null));
      if (!w || !w.parent) return;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < bd) { bd = d; best = o; }
    };
    for (const o of army.dead || []) look(o);
    for (const o of army.units) if (o.alive && o.sidearm) look(o);
    if (best === this.pickSrc) return;
    rt.uninteract('pickgun');
    this.pickSrc = best;
    if (best) rt.addInteract('pickgun', { x: best.pos.x, z: best.pos.z }, this.hasGun ? '鉄砲の弾と火薬を拾う' : '鉄砲を拾う', () => this.pickGun(best), { r: 2.6 });
  }
  pickGun(o) {
    const rt = this.rt;
    if (!o || o.gunTaken || this.mounted || this.u.climb || !this.u.alive || rt.over ||
        Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > 2.6 ||
        Math.abs(o.pos.y - this.u.pos.y) > 2) return;
    o.gunTaken = true;
    const w = o.dropped && o.dropped.parent ? o.dropped : o.wpn;
    if (w && w.parent) w.parent.remove(w);
    if (o.dropped === w) o.dropped = null;
    rt.uninteract('pickgun'); this.pickSrc = null;
    sfx('kozane', 0.8);
    if (!this.hasGun) {
      // 拾った鉄砲は、この戦の間だけ使える。弾は込めてある一発と、胴乱の残り二発
      this.hasGun = true; this.gunPicked = true;
      this.gunMesh = weaponMesh('gun');
      this.u.gunRainCover = !!this.gunMesh.userData.rainCover;
      this.u.gunCordWet = o.gunCordWet || 0; this.u.gunPanWet = o.gunPanWet || 0; this.u.gunPowderWet = o.gunPowderWet || 0;
      this.gunLoaded = true; this.gunReload = 0; this.gunAmmo = 2;
      this.switchWeapon('gun');
      rt.hud.flash(`敵の鉄砲を拾った（込めてある一発と、弾 2）　${isTouch ? '持ち替えの丸で槍に戻せる' : '槍の持ち替え操作で戻せる'}`, 'gold');
    } else {
      if (this.gunAmmo != null) this.gunAmmo += 3;
      rt.hud.flash(this.gunAmmo != null ? `弾と火薬を拾った（弾 ${this.gunAmmo}）` : '弾と火薬を拾った', 'dim');
    }
  }

  // ---------------- 火縄銃・弓 ----------------
  // 飛び道具を手にしていない時：引きかけ・切りかけをやめ、札を隠す（弾込めは火縄銃を手にしている間だけ進む）
  rangedIdle() {
    const u = this.u;
    this.bowHold = 0;
    this.aimK = 0; this.aimHoldT = 0; this.padPrevT = 0; this.lHoldT = 0; this.padAimed = false;
    if (!this.shot?.pan) this.shot = null;
    this.draw = 0;
    if (u.atk && (u.atk.ranged || u.atk.bow)) u.atk = null;
    if (u.reload) u.reload = null;
    const el = this.hasGun || this.hasBow ? document.getElementById('rangedui') : null;
    if (el && !el.hidden) el.hidden = true;
  }
  // 照準の先の敵（狙うほど細い円錐で探す）
  aimRanged(cone, maxD) {
    const cam = this.rt.camera;
    const dir = this._arDir || (this._arDir = new THREE.Vector3()); cam.getWorldDirection(dir);
    const v = this._arV || (this._arV = new THREE.Vector3());
    let best = null, bs = Infinity;
    for (const o of this.rt.army.units) {
      // 味方（team 0）は狙えないが、乗っている馬だけは別（自分の馬・味方の馬も撃つ・射ると討てるように。kaito 10/1）
      if (!o.alive || (o.team === 0 && !(o.mounted && o.horse && !o.isPlayer && !o.invuln)) || o.woundOut || o.type === 'dummy') continue;
      if (!weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + (o.mounted ? 2.0 : 1.2) - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      // 近い敵ほど的の幅を広く取り、同じくらいの角なら近い方を選ぶ（近い敵に合わせやすく）。指の端末は少し広く
      if (ang < (cone + 0.9 / d) * (isTouch ? 1.35 : 1) && ang + d * 0.0035 < bs) { bs = ang + d * 0.0035; best = o; }
    }
    return best;
  }
  // 当てる的が無い時の見せかけの的（照準の先の地面）
  groundTarget() {
    const cam = this.rt.camera, v = this.rangedDir, t = this.rangedGround;
    cam.getWorldDirection(v);
    t.pos.x = cam.position.x + v.x * 70; t.pos.z = cam.position.z + v.z * 70;
    t.pos.y = this.rt.world.heightAt(t.pos.x, t.pos.z);
    return t;
  }
  rangedUpdate(dt, input) {
    const u = this.u, rt = this.rt, army = rt.army;
    u.gunAmmo = this.gunAmmo; u.arrowAmmo = this.bowAmmo;
    if (rangedSupply(army, u, army.time)) {
      this.gunAmmo = u.gunAmmo; this.bowAmmo = u.arrowAmmo;
      rt.hud.flash(this.weapon === 'gun' ? '中間から弾と火薬を受け取った' : '中間から矢を受け取った', 'dim');
    }
    this.aimHoldT = this.aiming && (this.weapon !== 'gun' || this.gunLoaded) ? this.aimHoldT + dt : 0;
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 8);
    // 照準の吸い付き：鉄砲・弓を構えている間、照準の近くの敵へ向きをゆっくり寄せる（強くは引かない。自分で外せば離れる）
    if (Math.abs(input.dx) + Math.abs(input.dy) > 1) { this.stickOffUntil = rt.t + 1.5; this.stickTo = null; }
    if (S.aimAssist !== false && !(this.stickOffUntil > rt.t) && this.aiming && (this.weapon === 'gun' || this.weapon === 'bow') && u.alive) {
      this.stickT = (this.stickT || 0) - dt;
      if (this.stickT <= 0) { this.stickT = 0.15; this.stickTo = this.aimRanged(0.07, this.weapon === 'gun' ? 70 : 45); }
      const o = this.stickTo;
      if (o && o.alive && !o.woundOut && weatherSees(rt.world, u.pos, o.pos)) {
        const want = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z), df = angleDiff(this.yaw, want);
        if (Math.abs(df) < 0.25) this.yaw += df * Math.min(1, dt * (isTouch ? 3.2 : 2));
      }
    } else this.stickTo = null;
    if (this.weapon === 'gun') {
      // 込め直し：降りて足を止めている間だけ進む
      // 買った鉄砲も拾った鉄砲も、携えた弾と火薬だけ使える
      if (!this.gunLoaded && !this.shot && this.gunAmmo === 0) {
        u.reload = null;
        if (!(this.noAmmoT > rt.t)) { this.noAmmoT = rt.t + 8; rt.hud.flash(`弾が尽きた。倒れた鉄砲足軽から拾うか、${isTouch ? '持ち替えの丸' : '1'}で槍に戻せ`, 'dim'); }
      } else if (!this.gunLoaded && !this.shot) {
        const sp = Math.hypot(u.vel.x, u.vel.z);
        const r0 = this.gunReload;
        if (sp < 0.3 && !this.mounted && !(this.knockT > 0) && !(this.staggerT > 0)) this.gunReload += dt / GUN_RELOAD;
        this.reloadPose.t = this.gunReload * GUN_RELOAD; u.reload = this.gunReload > r0 ? this.reloadPose : null;
        // 込めの手順の音：火薬を注ぐ・弾を落とす・込め矢で突き固める（とん、とん）・口薬を盛って火蓋を閉じる
        if (r0 < 0.12 && this.gunReload >= 0.12) sfx('hizara', 0.5);
        if (r0 < 0.25 && this.gunReload >= 0.25) sfx('tick', 0.8);
        if (r0 < 0.4 && this.gunReload >= 0.4) sfx('knock', 0.18);
        if (r0 < 0.5 && this.gunReload >= 0.5) sfx('knock', 0.18);
        if (r0 < 0.6 && this.gunReload >= 0.6) sfx('knock', 0.18);
        if (r0 < 0.72 && this.gunReload >= 0.72) sfx('hizara', 0.4);
        if (this.gunReload >= 1) { renewGunPowder(u); this.gunLoaded = true; this.gunReload = 0; u.reload = null; if (this.gunAmmo != null) this.gunAmmo--; sfx('click', 0.8); rt.hud.flash(this.gunAmmo != null ? `込め終えた（残りの弾 ${this.gunAmmo}）` : '込め終えた', 'dim'); }
      }
      // 構えている間は頬付けの姿（poseGun の「aim」）
      if (this.shot) {
        this.shot.t -= dt;
        const a = this.rangedPose; a.ranged = true; a.bow = false; a.t = this.shot.t; a.dur = this.shot.dur; a.target = this.groundTarget(); u.atk = a;
        // 引き金を落とすと、火挟みの火縄が火皿の口薬に落ちて先に光り（しゅっ）、一呼吸おいて筒の薬に移って放たれる
        if (this.shot.t <= 0.09 && !this.shot.pan) { this.shot.pan = true; rt.army.panFlash(u, true); }
        if (this.shot.t <= 0) { const aimed = this.shot.aimed, pan = this.shot.pan, held = this.shot.held; this.shot = null; u.atk = null; this.fireShot(aimed || this.aiming, pan, held); }
      } else if (this.aiming && this.gunLoaded) {
        const a = this.rangedPose; a.ranged = true; a.bow = false; a.dur = 2; a.t = 2 - Math.min(1, this.aimHoldT); a.target = this.groundTarget(); u.atk = a;
      }
      else if (u.atk && u.atk.ranged) u.atk = null;
      // 構えだけでは放たない。右で狙って左を押すか、左を長く押して離す。
      let pull = input.leftPressed, aimed = this.aiming, held = this.aimHoldT;
      if (!isTouch) {
        if (input.leftPressed) this.padAimed = this.aiming && this.lHoldT <= dt;
        pull = input.leftPressed && this.padAimed;
        if (!input.left && this.padPrevT > 0 && !this.padAimed) {
          pull = true; aimed = this.padPrevT > 0.2; held = this.padPrevT;
        }
        this.padPrevT = this.lHoldT;
      }
      if (pull && this.cd <= 0 && !this.shot) {
        if (!this.gunLoaded) { if (!(this.reloadTipT > rt.t)) { this.reloadTipT = rt.t + 8; rt.hud.flash(this.gunAmmo === 0 ? '弾がない。倒れた鉄砲足軽から拾う' : 'まだ込め直している。足を止めて込める', 'dim'); } }
        else if (this.mounted) {
          if (!(this.reloadTipT > rt.t)) { this.reloadTipT = rt.t + 8; rt.hud.flash('鉄砲は馬を降りて扱う', 'dim'); }
        } else {
          // 火蓋を切って放つ。構えていなければ、構えるぶん少し遅い
          const dur = aimed ? 0.3 : 0.75;
          this.shot = { t: dur, dur: dur + (aimed ? 1.0 : 0), aimed, held, target: null };
          this.inCombatT = 3;
          // 火蓋を切る音（かちり）。火皿の口薬が光るのは放つ直前
          sfx('click', 0.55);
        }
      }
    } else {
      // 弓：左を押している間に引き絞り、離して射る
      u.relT = Math.max(0, (u.relT || 0) - dt);
      if (input.left && this.bowAmmo <= 0) {
        this.draw = 0; this.bowHold = 0; u.atk = null;
        if (!(this.noArrowT > rt.t)) { this.noArrowT = rt.t + 8; rt.hud.flash('矢が尽きた。槍に持ち替える', 'dim'); }
      } else if (input.left && this.cd <= 0) {
        this.draw = Math.min(2.2, this.draw + dt);
        this.bowHold = this.draw >= 2 ? (this.bowHold || 0) + dt : 0;
        if (this.draw >= 2) {
          this.sta = Math.max(0, this.sta - (4 + Math.min(8, this.bowHold)) * dt); this.staDelay = 0.4;
          if (this.sta <= 0) {
            this.draw = 0; this.bowHold = 0; u.atk = null; this.cd = 0.5;
            if (!(this.bowTiredUntil > rt.t)) { this.bowTiredUntil = rt.t + 8; rt.hud.flash('腕が疲れた。弓を緩めて休む', 'dim'); }
          }
        }
        // 番える・打ち起こす・引き分けるまで二秒ほどかける
        const e = Math.min(2.2, this.draw);
        if (this.draw > 0) { const a = this.rangedPose; a.bow = true; a.ranged = false; a.t = 10 - e; a.dur = 10; a.target = this.groundTarget(); u.atk = a; }
        this.inCombatT = 3;
      } else if (!input.left && this.draw > 0) {
        const full = this.draw >= 2.0;
        this.draw = 0; u.atk = null;
        if (full) this.looseArrow();
        this.bowHold = 0;
        if (!full && !(this.shortDrawTipT > rt.t)) { this.shortDrawTipT = rt.t + 8; rt.hud.flash('引きが足りない（長く押して引き絞る）', 'dim'); }
        this.cd = 0.5;
      }
    }
    this.updateRangedUi();
  }
  // 技の名を初めて出した時だけ、小さく知らせる（押し方の覚え書き）
  techNote(k) {
    const T = this.techSeen || (this.techSeen = new Set());
    if (T.has(k)) return;
    T.add(k);
    const guardK = isTouch ? '「構え」' : '右クリック';
    const msg = { slam: `叩き下ろし（${guardK}で構え、前へ押しながら突く）`, butt: '石突き（後ろへ押しながら突く。後ろの敵も打つ）', sweep: '払い（横へ押しながら突く）', charged: '溜め突き（長く押して離す）', kaeshi: '切り返し（続けて斬る）', kesa: '踏み込み袈裟（三つ目の斬り）', nagi: '横薙ぎ（横へ押しながら斬る）', kara: '真っ向斬り（長く押して離す）', hook: '鎌で引き倒す（後ろへ押しながら突く）', kama: '鎌で薙ぐ（横へ押しながら突く）', ktsuki: `突き（${guardK}で構えてから斬る）` }[k];
    if (msg) this.rt.hud.flash(msg, 'dim');
  }
  // 狙いの先（照準の向き）に、壊せる敵の門・柵・逆茂木・竹束があれば返す（生きた敵がいない時だけ調べる）
  aimStruct(maxD) {
    const cam = this.rt.camera, u = this.u;
    const dir = this._asDir || (this._asDir = new THREE.Vector3()); cam.getWorldDirection(dir);
    const v = this._asV || (this._asV = new THREE.Vector3());
    let best = null, bs = Infinity;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || (st.maxHp || 0) > 1e8) continue;
      const p = st.seg ? { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 } : { x: st.x, z: st.z };
      const y = this.rt.world.heightAt(p.x, p.z) + 1.2;
      v.set(p.x - cam.position.x, y - cam.position.y, p.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      if (ang < 0.05 + 1.6 / d && ang < bs) { bs = ang; best = st; }
    }
    return best;
  }
  // 肩越しの照準と筒先・矢の出所のずれを合わせる。落ちと風はここでは補わない。
  rangedVelocity(t, speed) {
    const u = this.u, cam = this.rt.camera, v = this.rangedDir;
    const gun = this.weapon === 'gun', f = gun ? 1.3 : 0.6, r = gun ? 0.1 : -0.12;
    const sx = u.pos.x + Math.sin(this.yaw) * f + Math.cos(this.yaw) * r;
    const sz = u.pos.z + Math.cos(this.yaw) * f - Math.sin(this.yaw) * r;
    const sy = u.pos.y + (u.mounted ? RIDE.y : 0) + (gun ? 1.46 : 1.5);
    const d = Math.max(3, Math.hypot(t.pos.x - cam.position.x, t.pos.y + 1.2 - cam.position.y, t.pos.z - cam.position.z));
    cam.getWorldDirection(v).multiplyScalar(d).add(cam.position);
    v.x -= sx; v.y -= sy; v.z -= sz;
    return v.normalize().multiplyScalar(speed);
  }
  // 火縄銃を放つ：狙う相手は照準の先（構えて狙えば細く正確に、腰だめでは外れやすい）
  fireShot(aimed, panDone = false, held = 0) {
    const u = this.u, rt = this.rt, army = rt.army;
    if (!u.alive || rt.over || !this.gunLoaded || (!panDone && (this.mounted || u.climb || this.knockT > 0 || rt.flags?.carry))) return;
    u.heading = this.yaw;
    const t = this.aimRanged(aimed ? 0.055 : 0.13, 70);
    const tgt = t && (aimed || Math.random() < 0.7) ? t : this.groundTarget();
    const d0 = u.dmg;
    u.dmg = 42; // 的の身分で弾の威力を変えない。
    if (!panDone) army.panFlash(u, true);
    this.rangedVelocity(tgt, 160);
    const steady = aimed ? Math.min(1, Math.max(this.aimHoldT, held) / 1.2) : 0;
    const wound = 1 - u.hp / u.maxHp;
    const scatter = (0.004 + (1 - steady) * 0.012) * (1 + wound * 0.8 + (rt.world.rainLevel || 0) * 0.4 + (this.gunHurtT > 0 ? 0.8 : 0));
    this.rangedDir.x += (Math.random() - 0.5) * 160 * scatter; this.rangedDir.y += (Math.random() - 0.5) * 160 * scatter; this.rangedDir.normalize().multiplyScalar(160);
    const ok = army.fireGun(u, tgt, this.rangedDir);
    u.dmg = d0;
    if (!ok) {
      if (!(this.misfireTipT > rt.t)) { this.misfireTipT = rt.t + 8; rt.hud.flash(army.lastGun?.reason === 'muzzle' ? '筒先が塞がっている。壁から離れる' : army.lastGun?.reason === 'wet' ? '火縄や火薬が湿った。雨を避けて込め直す' : '放てなかった。構えと射線を確かめる', 'red'); }
      if (army.lastGun?.reason !== 'muzzle') { this.gunLoaded = false; this.gunReload = 0; } this.cd = 0.8; return;
    }
    this.gunLoaded = false; this.gunReload = 0;
    this.cd = 0.8;
    // 当たり外れをはっきり知らせる：当たれば照準に印と手応えの音、倒せば「討ち取った」
    this.addShake(0.22);
    deafen(0.3);   // 頬のそばの火薬の破裂で、耳が少し遠くなる
    this.pitch = Math.min(0.55, this.pitch + (reduceMotion() ? 0 : 0.035));   // 反動で筒先が跳ねる
    rt.game.vibrate(0.7, 140);
  }
  gunResult(L) {
    const rt = this.rt;
    if (rt.over || !this.u.alive) return;
    const victim = L.victim;
    if (victim && (L.res === 'hit' || L.res === 'armor')) {
      rt.hud.hitMarker(); sfx('hit', 0.9);
      rt.hud.flash(L.armor ? '鎧で弾かれた' : victim.alive ? (victim.name ? `${victim.name}に命中` : '命中') : (victim.name ? `${victim.name}を撃ち倒した` : '撃ち倒した'), victim.alive ? 'dim' : 'gold');
    } else rt.hud.flash(L.blocked ? '弾は遮られた' : '外れた', 'dim');
  }
  // 矢を射る
  looseArrow() {
    const u = this.u, rt = this.rt, army = rt.army;
    if (!u.alive || rt.over || u.climb || this.knockT > 0 || rt.flags?.carry) return;
    u.heading = this.yaw;
    const t = this.aimRanged(this.aiming ? 0.05 : 0.1, 45) || this.groundTarget();
    const d0 = u.dmg;
    if (this.bowAmmo <= 0) { if (!(this.noArrowT > rt.t)) { this.noArrowT = rt.t + 8; rt.hud.flash('矢が尽きた。槍に持ち替える', 'dim'); } return; }
    this.bowAmmo--;
    u.dmg = 24; // 的の身分で矢の威力を変えない。
    this.rangedVelocity(t, 36);
    const fatigue = Math.max(0, (this.bowHold || 0) - 3), spread = Math.min(0.05, fatigue * 0.003 + Math.max(0, 0.3 - this.sta / this.maxSta) * 0.04);
    if (spread > 0) { this.rangedDir.x += (Math.random() - 0.5) * 36 * spread; this.rangedDir.y += (Math.random() - 0.5) * 36 * spread; this.rangedDir.normalize().multiplyScalar(36); }
    if (!army.hooks.onPlayerArrow) army.hooks.onPlayerArrow = (victim, result) => {
      if (!this.u.alive || this.rt.over) return;
      if (result === 'hit' || result === 'armor') {
        this.rt.hud.hitMarker();
        this.rt.hud.flash(result === 'armor' ? '矢は鎧で弾かれた' : victim?.alive ? '矢が命中した' : '矢で倒れたようだ', victim?.alive || result === 'armor' ? 'dim' : 'gold');
      } else if (result === 'cover') this.rt.hud.flash('矢は遮られた', 'dim');
    };
    if (!army.shoot(u, t, this.rangedDir)) rt.hud.flash('矢の出所が塞がっている。壁から離れる', 'dim');
    u.dmg = d0;
    u.relT = 0.55;
    this.addShake(0.04);
    // 弓の手応え：弦が返る音と、弓手が押し返されてわずかに左へ振れる（鉄砲の重い反動とは違う軽い離れ）
    if (!reduceMotion()) { this.yaw += 0.01; this.pitch = Math.min(0.55, this.pitch + 0.008); }
  }
  // 照門（一人称で構えた時）と、弾込め・引きの様子の小さな札。戦の後は battle.js の dispose が消す
  updateRangedUi() {
    let el = document.getElementById('rangedui');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rangedui';
      el.setAttribute('aria-live', 'off');
      el.innerHTML = `<style>
        #rangedui { position: fixed; inset: 0; pointer-events: none; z-index: 12; }
        #rangedui .st { position: absolute; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 6px 14px; min-height: 32px; box-sizing: border-box;
          background: rgba(20,18,15,.82); color: #ece4d2; border: 1px solid rgba(236,228,210,.2); border-radius: 4px; font-size: 14px; letter-spacing: .06em; white-space: normal; width: max-content; max-width: calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 32px); line-height: 1.6; display: flex; gap: 10px; align-items: center; }
        #rangedui .st i { display: inline-block; width: 90px; flex-shrink: 0; height: 6px; background: #2c2821; position: relative; }
        #rangedui .st i[hidden] { display: none; }
        #rangedui .st i b { position: absolute; inset: 0; right: auto; background: #c2a25a; }
        @media (max-height: 500px) { #rangedui .st { bottom: calc(84px + env(safe-area-inset-bottom)); font-size: 13px; } }
        #rangedui .flight { position: absolute; left: 50%; bottom: calc(128px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 2px 8px; font-size: 12px; color: #ece4d2; background: rgba(20,18,15,.82); max-width: 44vw; text-align: center; line-height: 1.4; }
        @media (max-height: 500px) { #rangedui .flight { bottom: calc(62px + env(safe-area-inset-bottom)); } }
        #rangedui .sight { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 260px; height: 160px; }
      </style><div class="sight" hidden><svg viewBox="0 0 260 160" width="260" height="160" aria-hidden="true">
        <path d="M0 96 H108 V78 Q130 92 152 78 V96 H260 V160 H0 Z" fill="rgba(18,14,10,.92)"/>
        <path d="M108 78 Q130 92 152 78" stroke="#6a5436" stroke-width="2" fill="none"/>
        <rect x="127" y="58" width="6" height="26" fill="#1a1510"/><circle cx="130" cy="58" r="3.4" fill="#3a2c1c"/>
      </svg></div><div class="st" aria-live="off"><span class="label"></span><i aria-hidden="true"><b></b></i></div><div class="flight" hidden></div><span class="spoken" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"></span>`;
      document.body.appendChild(el);
      el._sight = el.querySelector('.sight');
      el._st = el.querySelector('.st');
      el._label = el.querySelector('.label'); el._bar = el.querySelector('.st i'); el._fill = el.querySelector('.st i b'); el._spoken = el.querySelector('.spoken');
      el._flight = el.querySelector('.flight');
    }
    const on = this.weapon === 'gun' || this.weapon === 'bow';
    // 一時停止・上空視点（rts.js）の上には残さない（rts.js の import は循環するので b._rts.on を直に見る。touch.js の touchFrame と同じやり方）
    el.hidden = !on || !this.u.alive || this.rt.over || (this.rt.game && (this.rt.game.paused || this.rt.game.photo || this.rt.game.helpOpen || this.rt.game.deployment || this.rt.game.hud?.introWaiting)) || !!(this.rt._rts && this.rt._rts.on);
    if (el.hidden) return;
    const sight = el._sight;
    sight.hidden = !(this.weapon === 'gun' && this.aiming && this.fpK > 0.6);
    const st = el._st;
    const fire = isTouch ? '放つの丸' : '左';
    const bowFire = isTouch ? '射るの丸' : '左';
    const progress = Math.round((this.weapon === 'gun' ? this.gunReload : Math.min(1, this.draw / 2)) * 100);
    el._bar.hidden = this.weapon === 'gun' ? this.gunLoaded || this.mounted || this.gunAmmo === 0 : this.draw <= 0 || this.bowAmmo <= 0;
    if (el._progress !== progress) { el._fill.style.width = progress + '%'; el._progress = progress; }
    let txt;
    if (this.weapon === 'gun') {
      if (this.mounted) txt = '鉄砲は馬を降りて放つ';
      else if (this.gunLoaded && (this.u.gunCordWet > 0.3 || this.u.gunPowderWet > 0.3)) txt = '火縄や火薬が湿っている。雨を避けて扱う';
      else if (this.gunLoaded) txt = this.shot ? '火蓋を切る…' : this.aiming
        ? (this.aimHoldT < 0.8 ? '鉄砲　構えている…' : `鉄砲　狙う → ${fire}で放つ`)
        : (isTouch ? '鉄砲　狙うの丸で構える' : '鉄砲　右で構える。左を長く押し、離しても放てる');
      else if (this.gunAmmo === 0) txt = '弾がない。倒れた鉄砲足軽から拾う';
      else {
        const f = this.gunReload, sp = Math.hypot(this.u.vel.x, this.u.vel.z);
        const step = f < 0.06 ? '筒を立てる' : f < 0.22 ? '火薬を注ぐ' : f < 0.32 ? '弾を入れる' : f < 0.66 ? '込め矢で固める' : f < 0.88 ? '口薬を盛る' : '火縄を合わせる';
        const wait = this.mounted ? '馬を降りて込める' : this.knockT > 0 || this.staggerT > 0 ? '体勢を戻して込める' : sp >= 0.3 ? '足を止めて込める' : `あと${Math.ceil((1 - f) * GUN_RELOAD)}秒`;
        txt = `${step}　${wait}`;
      }
      if (this.gunLoaded && !this.mounted && this.gunAmmo != null) txt += `（弾 ${this.gunAmmo + 1}）`;
    } else txt = this.bowAmmo <= 0 ? '矢が尽きた。槍に持ち替える' : this.draw > 0
      ? (this.draw < 0.6 ? '弓　矢を番える' : progress < 100 ? '弓　引き絞る' : this.bowHold > 3 ? `弓　腕が疲れる。${bowFire}を離して射る` : `弓　引き切った。${bowFire}を離して射る`)
      : (isTouch ? '弓　狙うで構え、射るを押して引く' : '弓　右で構え、左を押して引く');
    if (this.weapon === 'bow' && this.bowAmmo > 0) txt += `（矢 ${this.bowAmmo}）`;
    if (st._t !== txt) {
      el._label.textContent = txt; st._t = txt;
      const spoken = txt.replace(/あと\d+秒/g, '').replace(/（(?:弾|矢) \d+）/g, '').trim();
      if (el._spoken.textContent !== spoken) el._spoken.textContent = spoken;
    }
    const hint = el._flight;
    hint.hidden = !(this.aiming || this.draw > 0) || (this.weapon === 'gun' && !this.gunLoaded);
    if (!hint.hidden) {
      const side = WIND_STATE.dirX * Math.cos(this.yaw) - WIND_STATE.dirZ * Math.sin(this.yaw);
      const strength = Math.abs(side) * WIND_STATE.gust;
      const wind = strength < 0.2 ? '横風は弱い' : `${strength < 0.7 ? '弱い' : strength < 1.3 ? 'やや強い' : '強い'}横風 ${side > 0 ? '右へ →' : '← 左へ'}`;
      if (!(this.flightAt > this.rt.t)) { this.flightAt = this.rt.t + 0.2; this.flightTarget = this.aimRanged(0.06, this.weapon === 'gun' ? 100 : 60); }
      const target = this.stickTo || (this.flightTarget?.alive ? this.flightTarget : null);
      const distance = target ? Math.hypot(target.pos.x - this.u.pos.x, target.pos.z - this.u.pos.z) : 0;
      const flight = this.weapon === 'bow' ? distance > 25 ? '遠い的は上を狙う。矢は落ちる' : '矢は風下へ流れる' : distance > 50 ? '遠い的は少し上を狙う。弾も散る' : '弾は近い的をよく狙う';
      const assist = S.aimAssist === false ? '手で狙う' : '照準の補助あり';
      const msg = `${wind}　${flight}　${assist}`;
      if (hint.textContent !== msg) hint.textContent = msg;
    }
  }

  // 刃の軌跡：振っている間だけ、刃先の通った跡を薄い帯で 0.16 秒ほど残す（一本の帯を使い回す。毎コマ new しない）
  //   刃先と、そこから手元へ寄った点の二つを一組にして、古い組ほど暗く（足し合わせの光なので暗い＝透ける）
  trailTick(dt) {
    const u = this.u, w = u.wpn;
    let T = this.trail;
    if (!T) {
      const N = TRAIL_N, g = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 6), col = new Float32Array(N * 6), idx = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, TRAIL_MAT);
      mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
      this.rt.scene.add(mesh);
      T = this.trail = { mesh, pos, col, age: new Float32Array(N).fill(9), n: 0 };
    }
    const sw = u.swing, blade = this.weapon === 'spear' || this.weapon === 'sword';
    const on = blade && w && w.parent && u.alive && sw && sw.t < sw.dur * 0.85 && sw.kind !== 'butt';
    for (let i = 0; i < TRAIL_N; i++) T.age[i] += dt;
    if (on) {
      // 組をひとつ後ろへずらし、先頭に今の刃先を入れる
      T.pos.copyWithin(6, 0, (TRAIL_N - 1) * 6); T.age.copyWithin(1, 0, TRAIL_N - 1);
      const spear = this.weapon === 'spear', tip = spear ? (w.userData.tip || 2.2) : 0.8;
      _tA.set(0, spear ? 0 : 0.07, tip); _tB.set(0, spear ? 0 : 0.03, tip - (spear ? 0.75 : 0.5));
      w.updateWorldMatrix(true, false); w.localToWorld(_tA); w.localToWorld(_tB);
      T.pos[0] = _tA.x; T.pos[1] = _tA.y; T.pos[2] = _tA.z; T.pos[3] = _tB.x; T.pos[4] = _tB.y; T.pos[5] = _tB.z;
      if (!T.n) for (let i = 1; i < TRAIL_N; i++) { T.pos.copyWithin(i * 6, 0, 6); T.age[i] = 9; }
      T.age[0] = 0; T.n = TRAIL_N;
    } else if (!T.n) return;
    // 突きは一筋の光に見えるので薄く、薙ぎ・斬りははっきり
    const k0 = (sw && (sw.kind === 'thrust' || sw.kind === 'tsuki') ? 0.32 : 0.6) * (this.fpK > 0.5 ? 0.6 : 1);
    let live = false;
    for (let i = 0; i < TRAIL_N; i++) {
      const f = Math.max(0, 1 - T.age[i] / 0.16) * (1 - i / TRAIL_N) * k0;
      if (f > 0) live = true;
      const o = i * 6;
      T.col[o] = 0.78 * f; T.col[o + 1] = 0.82 * f; T.col[o + 2] = 0.86 * f;
      T.col[o + 3] = 0.08 * f; T.col[o + 4] = 0.09 * f; T.col[o + 5] = 0.1 * f;
    }
    if (!live) { T.n = 0; T.mesh.visible = false; return; }
    T.mesh.visible = true;
    const G = T.mesh.geometry;
    G.attributes.position.needsUpdate = true; G.attributes.color.needsUpdate = true;
  }

  // 刀の斬り：一太刀目は袈裟、続けて押せば逆袈裟で切り返し、三つ目は踏み込んだ重い袈裟（押した時に決める。技の名と振りを合わせる）
  nextSlash() { return this.slashK || 'kesa'; }

  // 離した時の分岐順と必要な気力を、操作丸と間合いの印で共有する。
  previewMeleeKind() {
    if (this.weapon !== 'spear' && this.weapon !== 'sword') return '';
    if (this.pending) return this.mounted && this.weapon === 'spear' ? 'thrust' : this.pending.kind;
    if (this.swingImpact) return this.swingImpact.kind;
    const charge = this.charging ? this.chargeT : 0;
    if (this.weapon === 'spear' && charge > 1.4 && this.sta >= 30) return this.mounted ? 'thrust' : 'charged';
    if (this.weapon === 'sword' && charge > 0.7 && this.sta >= 20) return 'kara';
    if (this.weapon === 'spear' && charge > 0.7 && this.sta >= 22) return this.mounted ? 'thrust' : 'charged';
    const side = Math.abs(this.inX || 0) > 0.5 && Math.abs(this.inZ || 0) < 0.5, back = (this.inZ || 0) < -0.5;
    const grd = this.guard || !!this.pressGrd && (this.buffer > 0 || charge > 0) || this.time - (this.guardOffT ?? -9) < 0.4;
    if (this.weapon === 'sword') return this.sta < 5 ? '' : grd ? 'kthrust' : side && this.sta >= 10 ? 'nagi' : 'slash';
    if (this.sta < 6) return '';
    if (this.mounted) return 'thrust';
    if (grd && this.inZ > 0.5 && this.sta >= 18) return 'slam';
    if (this.jumonji && back && this.sta >= 12) {
      if (!(this.previewHookAt > this.rt.t)) { this.previewHookAt = this.rt.t + 0.1; this.previewHook = this.rt.army.enemiesInArc(this.u.pos, this.u.heading, 3.3, 0.6, this.u.team).length > 0; }
      if (this.previewHook) return 'hook';
    }
    if ((grd || side) && this.sta >= (grd ? 18 : 14)) return 'sweep';
    return back ? 'butt' : 'thrust';
  }
  updateRangeCue(kind) {
    const u = this.u, army = this.rt.army;
    this.inRange = false; this.rangeCue = '';
    if (this.weapon === 'gun' || this.weapon === 'bow') {
      const gun = this.weapon === 'gun', target = this.aimRanged(this.aiming ? gun ? 0.055 : 0.05 : gun ? 0.13 : 0.1, gun ? 70 : 45);
      if (target && !army.hiddenBehind(u, target) && !army.shotBlocked(u, target.pos) && !army.terrainBlocks(u.pos, target.pos)) this.rangeCue = '◇ 射線あり';
      return;
    }
    if (!kind || this.rt.flags?.carry) return;
    const reach = this.meleeReach(kind);
    const half = this.meleeHalf(kind);
    const heading = this.mounted ? u.heading + Math.max(-1.2, Math.min(1.2, angleDiff(u.heading, this.yaw))) : u.heading;
    const over = this.weapon === 'spear', fenceClear = this.meleeFenceClear(reach), assist = S.aimAssist || isTouch;
    const lunge = assist ? isTouch ? 0.9 : 0.35 : 0;
    let turnCandidate = null;
    let hits = army.enemiesInArc(u.pos, heading, reach, half, u.team, over, true, fenceClear, this.lock);
    if (!hits.length && assist) turnCandidate = army.enemiesInArc(u.pos, heading, reach + lunge, isTouch ? Math.max(half + this.D.aim, 1.05) : half + this.D.aim, u.team, over, true, fenceClear, this.lock)[0]?.u;
    let turn = turnCandidate;
    if (!hits.length && !turn && assist && (isTouch || this.rt.firstFights)) turn = army.enemiesInArc(u.pos, heading, reach + lunge * 0.5, Math.PI, u.team, over, true, fenceClear, this.lock)[0]?.u;
    if (!hits.length && kind === 'butt') hits = army.enemiesInArc(u.pos, heading + Math.PI, 2.3, 0.8, u.team, false);
    if (hits.length) { this.inRange = true; this.rangeCue = '● 兵に届く'; }
    else if (this.meleeStructTarget(kind, heading)) this.rangeCue = '■ 柵や門に届く';
    else if (turn && Math.abs(angleDiff(heading, Math.atan2(turn.pos.x - u.pos.x, turn.pos.z - u.pos.z))) < 0.15) this.rangeCue = '一歩寄ると届く';
    else if (turn) this.rangeCue = angleDiff(heading, Math.atan2(turn.pos.x - u.pos.x, turn.pos.z - u.pos.z)) > 0 ? '右へ向く →' : '← 左へ向く';
  }
  meleeHalf(kind) {
    if (this.weapon === 'spear' && (kind === 'thrust' || kind === 'charged' || kind === 'hook' || kind === 'slam')) return Math.atan2(0.35, this.meleeReach(kind));
    return kind === 'kthrust' || kind === 'charged' ? 0.5 : kind === 'slam' ? 0.4 : kind === 'hook' ? 0.55 : kind === 'kara' ? 0.45 : kind === 'nagi' ? 1.15 : kind === 'sweep' ? this.jumonji ? 1 : 1.1 : kind === 'spin' ? Math.PI : kind === 'slash' ? 0.8 : kind === 'butt' ? 0.7 : 0.62;
  }
  meleeReach(kind) {
    if (this.weapon === 'spear') return spearReach(this.u, kind);
    const extra = ITEMS[this.G.equip.weapon].reach || 0, ride = this.mounted ? 0.7 : 0;
    return kind === 'kthrust' ? 2.3 : kind === 'nagi' || kind === 'kara' ? 2.2 : kind === 'slash' ? 2 : kind === 'butt' ? 1.7 : kind === 'sweep' ? (this.jumonji ? 2.8 + extra : 2.6) + ride : kind === 'spin' ? 2.9 + ride : (kind === 'charged' ? 3.2 : kind === 'slam' || kind === 'hook' ? 3 : 2.9) + extra + ride;
  }
  // 当たりの本体と予告で同じ柵越しの長さを使う。箱は既存の物を使い回す。
  meleeFenceClear(reach) {
    const u = this.u, tip = u.wpn?.userData.tip || 2.2;
    let clear = Math.min(reach, tip);
    const neck = this.mounted && this.horse?.userData.horse?.neck;
    if (neck) {
      neck.updateWorldMatrix(true, true); _horseBox.setFromObject(neck);
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      const nx = fx >= 0 ? _horseBox.max.x : _horseBox.min.x, nz = fz >= 0 ? _horseBox.max.z : _horseBox.min.z;
      clear = Math.min(reach, Math.max(0, (nx - u.pos.x) * fx + (nz - u.pos.z) * fz) + tip);
    }
    return clear;
  }
  // 兵がいない時に打つ柵・門。座標の入れ物は一つだけ使い回す。
  meleeStructTarget(kind, heading) {
    const u = this.u;
    const reach = this.meleeReach(kind);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const result = this._structTarget || (this._structTarget = { st: null, px: 0, pz: 0 });
    result.st = null; let bd = Infinity;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || st.maxHp > 1e8) continue;
      let d, px, pz;
      if (st.seg) {
        const ax = st.seg[0], az = st.seg[1], dx = st.seg[2] - ax, dz = st.seg[3] - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2));
        px = ax + dx * t; pz = az + dz * t; d = Math.hypot(px - u.pos.x, pz - u.pos.z);
      } else { px = st.x; pz = st.z; d = Math.hypot(px - u.pos.x, pz - u.pos.z) - (st.r || 1); }
      if (d > reach) continue;
      const dl = Math.hypot(px - u.pos.x, pz - u.pos.z) || 1;
      if (((px - u.pos.x) * fx + (pz - u.pos.z) * fz) / dl < 0.35 && d > 0.6) continue;
      if (d < bd) { bd = d; result.st = st; result.px = px; result.pz = pz; }
    }
    return result.st ? result : null;
  }
  strike(kind, third, impact = false, assisted = false) {
    if (kind === 'spin') kind = 'charged';
    if (this.mounted && this.weapon === 'spear') kind = 'thrust';
    const u = this.u;
    const army = this.rt.army;
    if (this.assistImpact && !assisted) return;
    if (!impact && !assisted && kind !== 'butt' && !this.mounted && (S.aimAssist || isTouch)) {
      const reach = this.meleeReach(kind), half = this.meleeHalf(kind), clear = this.meleeFenceClear(reach), over = this.weapon === 'spear';
      if (!army.enemiesInArc(u.pos, u.heading, reach, half, u.team, over, true, clear, this.lock).length) {
        const stepMax = isTouch ? 0.9 : 0.35;
        const wide = isTouch || this.rt.firstFights ? Math.PI : half + this.D.aim;
        const target = army.enemiesInArc(u.pos, u.heading, reach + stepMax, wide, u.team, over, true, clear, this.lock)[0]?.u;
        if (target) {
          const dx = target.pos.x - u.pos.x, dz = target.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1, h = Math.atan2(dx, dz);
          this.assist = { h, t: 0.65 };
          const step = Math.max(0, Math.min(stepMax, d - (reach - 0.2)));
          if (step > 0) this.lunge = { x: dx / d * step, z: dz / d * step, t: 0.12 };
          this.assistImpact = { kind, third, h, t: 0.12 }; this.cd = Math.max(this.cd, 0.2);
          return;
        }
      }
    }
    const swKind = kind === 'thrust' || kind === 'charged' ? 'thrust' : kind === 'sweep' ? 'sweep' : kind === 'spin' ? 'spin' : kind === 'slam' ? 'slam' : kind === 'butt' ? 'butt' : kind === 'hook' ? 'hook' : kind === 'kthrust' ? 'tsuki' : kind === 'nagi' ? 'yoko' : kind === 'kara' ? 'kara' : this.nextSlash();
    if (!impact && (kind === 'sweep' || kind === 'slam')) {
      const swing = this.u.swing = { kind: swKind, t: 0, dur: 0.42, at: kind === 'slam' ? 0.67 : 0.5, dir: this.pendDir || 1, done: false, res: null, target: this.lock || this.aimed, d: 0, side: 1 };
      this.swingImpact = { kind, third, swing };
      return;
    }
    if (kind === 'slash') this.slashN++;
    const reachExtra = ITEMS[this.G.equip.weapon].reach || 0;
    u.strikeT = 0.2;
    // 馬上では体をひねって、見ている方を突く。駆けているほど重い
    let heading = this.mounted ? u.heading + Math.max(-1.2, Math.min(1.2, angleDiff(u.heading, this.yaw))) : u.heading;
    const ride = this.mounted ? 0.7 : 0;
    const rush = this.mounted ? 1 + Math.min(0.9, Math.abs(this.hspd) / 11 * 0.9) : 1;
    let lastArc = null;   // 城下で人へ斬りかかれるように：当たりが無かった時、同じ間合いで町の人を探す（arc.civScan）
    const arc = (reach, half, n) => {
      reach = this.meleeReach(kind); half = this.meleeHalf(kind);
      lastArc = { reach, half };
      const over = this.weapon === 'spear';   // 槍は柵越しに突ける
      // 柵越しに届く間合い：馬上は馬の図体（馬の胴の長さ分、柵の手前で止まる）だけ柵に近寄れないので、その分だけ広げる
      // 馬の首の実寸と穂先までの長さで測る。技の届く長さを超えて柵を抜けない。
      const fenceClear = this.meleeFenceClear(reach);
      // 味方の騎馬も、的を絞って（this.lock）選んだ時だけ混ぜる（自分の馬・味方の馬も討てるように。kaito 10/1）
      let h = army.enemiesInArc(u.pos, heading, reach, half, u.team, over, true, fenceClear, this.lock);
      return h.slice(0, 1); // 刃や穂は最初の体・鎧で止まり、一撃で列を抜かない。
    };
    let hits, dmg;
    if (kind === 'thrust') { hits = arc(2.9 + reachExtra + ride, 0.62, this.mounted && this.hspd > 8 ? 2 : 1); dmg = this.spearDmg() * (third ? 1.3 : 1) * rush; }
    else if (kind === 'charged') { hits = arc(3.2 + reachExtra + ride, 0.5, 1); dmg = this.spearDmg() * 2 * rush; }
    else if (kind === 'kthrust') { hits = arc(2.3, 0.5, 1); dmg = 17 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 十文字槍の薙ぎ：鎌刃が横へ張り出す分、深く斬る。最初の一人で止まる
    else if (kind === 'sweep' && this.jumonji) { hits = arc(2.8 + reachExtra + ride, 1.0, 2); dmg = this.spearDmg() * 1.0 * rush; }
    else if (kind === 'sweep') { hits = arc(2.6 + ride, 1.1, this.mounted ? 5 : 4); dmg = this.spearDmg() * 0.7 * rush; }
    // 十文字槍の引き倒し：突き出して鎌刃を相手の首・膝裏へ掛け、手前へ引く。傷は浅いが、相手は倒れてしばらく起きられない
    else if (kind === 'hook') { hits = arc(3.0 + reachExtra + ride, 0.55, 1); dmg = this.spearDmg() * 0.55; }
    // 叩き下ろし：柄のしなりで上から打つ。狭く重く、兜の上から効く
    else if (kind === 'slam') { hits = arc(3.0 + reachExtra + ride, 0.4, 1); dmg = this.spearDmg() * 1.6 * rush; }
    // 石突き：懐に入った敵を柄の尻で突き放す（軽いが、相手を押し退けてよろめかせる）
    // 後ろへ柄を突き出すので、背後に寄った敵も打つ
    else if (kind === 'butt') {
      hits = arc(1.7, 0.7, 1);
      if (!hits.length) hits = army.enemiesInArc(u.pos, heading + Math.PI, 2.3, 0.8, u.team, false).slice(0, 1);
      dmg = this.spearDmg() * 0.45;
    }
    // 刀の横薙ぎ：体をひねって横一文字に。最初の一人で止まる
    else if (kind === 'nagi') { hits = arc(2.2, 1.15, 3); dmg = 15 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 刀の真っ向斬り：上段から頭へまっすぐ。狭く重い
    else if (kind === 'kara') { hits = arc(2.2, 0.45, 1); dmg = 34 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 振り回し：頭上で槍を回し、ぐるりと四方の敵を払う
    else if (kind === 'spin') { hits = arc(2.9 + ride, Math.PI, 6); dmg = this.spearDmg() * 0.8 * rush; }
    else { hits = arc(2.0, 0.8, 2); dmg = 19 * (1 + 0.06 * (this.G.stats.spear - 1)) * (third ? 1.45 : 1); }
    // 振りの記録（穂先・刃がどこで止まったかを見せる）
    // 薙ぎ（長柄の叩き）は重い柄を振り回すので、突きより長く（0.42 秒）
    const dir = (this.pendDir || 1);
    if (!impact) u.swing = { kind: swKind, t: 0, dur: kind === 'spin' ? 0.9 : kind === 'hook' ? 0.46 : kind === 'sweep' || kind === 'slam' ? 0.42 : kind === 'kara' ? 0.3 : kind === 'nagi' ? 0.28 : 0.22, at: kind === 'slam' ? 0.67 : 0, dir, rear: kind === 'butt' && hits[0] && ((hits[0].u.pos.x - u.pos.x) * Math.sin(heading) + (hits[0].u.pos.z - u.pos.z) * Math.cos(heading)) < 0,  done: true, res: null, target: hits[0] ? hits[0].u : null, d: hits[0] ? hits[0].d : 0, side: 1 };
    // 討死の知らせで戦が終わると u.swing は消える。当たった振りの記録は手応えまで保つ。
    const swing = u.swing;
    if (impact) { if (!swing) return; swing.done = true; swing.target = hits[0]?.u || null; swing.d = hits[0]?.d || 0; }
    const counter = this.counterT > 0 && hits.length > 0;
    if (counter) { this.counterT = 0; this.rt.hud.flash(this.counterPerfect ? '見切りの反撃' : '反撃', 'gold'); }
    // 槍の癖：味方と肩を並べる密集では強く、懐に入られると弱い
    const spearKind = kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slam' || kind === 'butt' || kind === 'spin' || kind === 'hook';
    let crowd = 0;
    if (spearKind) army.forNear(u.pos.x, u.pos.z, 3.5, (o) => { if (o !== u && o.alive && o.team === u.team && !o.isStruct) crowd++; });
    for (const h of hits) {
      // 構えている敵には通りにくい、背後からは通りやすい
      let m = 0.9 + Math.random() * 0.2;
      const t = h.u;
      const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const facing = (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d;
      if (facing < -0.2) m *= 1.3;
      if (t.atk) m *= 1.15;
      if (t.stagger > 0.5) m *= 1.25;
      if (counter) m *= 1.6;
      if (spearKind && crowd >= 3) m *= 1.1;
      if (spearKind && d < 1.15 && !this.mounted) {
        m *= ITEMS[this.G.equip.weapon].close ?? 0.6;
        this.rt.hint('tooClose');
      }
      this.rt.onPlayerHit(t);
      if (third && kind === 'thrust') { this.rt.stats.thirds++; this.rt.tutMark('combo'); }
      if (kind === 'thrust') this.rt.tutMark('thrust');
      if (kind === 'charged') this.rt.tutMark('charged');
      if (kind === 'sweep') this.rt.tutMark('sweep');
      // 技と敵の構えのかみ合い：
      //   槍衾（穂先を揃えた隊）の正面へ突いても穂先に弾かれて通りにくい。払い・叩き下ろし・振り回しは槍の列を崩して深く入り、相手をよろめかせる
      const yariFront = t.group && t.group.formation === 'yari' && facing > 0.3;
      if (yariFront) {
        if (kind === 'thrust' || kind === 'charged' || kind === 'kthrust') { m *= 0.6; if (!this.yariHint) { this.yariHint = true; this.rt.hud.flash('槍衾の正面は突きが通りにくい。払い・叩き下ろしで崩せ', 'dim'); } }
        else if (kind === 'sweep' || kind === 'slam' || kind === 'spin') { m *= 1.3; t.stagger = Math.max(t.stagger || 0, 0.7); }
      }
      // 薙ぎ・溜め突き・反撃・背後からの一撃は、敵の構えでは防げない。石突きは構えごと押し退ける。
      // 叩き下ろし・上段の斬り下ろしは受けられても構えを崩す（次の一撃が通る）
      const wk = { thrust: 'thrust', charged: 'thrust', sweep: 'sweep', spin: 'sweep', slam: 'slam', butt: 'butt', hook: 'thrust', kthrust: 'tsuki', kara: 'slam', nagi: 'yoko' }[kind] || swKind;
      const result = h === hits[0] ? swing : _meleeResult;
      result.res = null;
      army.damage(t, dmg * m, u, { kind: wk, out: result, pierce: kind === 'sweep' || kind === 'hook' || kind === 'charged' || kind === 'kara' || kind === 'butt' || kind === 'spin' || counter || facing < -0.2, guardBreak: kind === 'slam' || kind === 'kara' || kind === 'hook' });
      h.res = result.res;
      // 突きは後ろへ小さく、払いは横へ、叩きは足を止める。大きなよろけの連続は避ける
      if (spearKind && !this.mounted && t.alive && !t.isStruct && !t.isPlayer && !t.mounted && t.team !== u.team && (h.res === 'hit' || h.res === 'armor' || (kind === 'slam' && h.res === 'block'))) {
        const fresh = !(t.spearStagT > army.time - 1.2);
        const solid = h.res === 'hit' || kind === 'slam';
        const stagger = !solid ? 0.12 : kind === 'slam' ? 0.75 : kind === 'sweep' ? 0.4 : kind === 'charged' || third || counter ? 0.55 : 0.18;
        if (fresh) {
          t.spearStagT = army.time;
          t.stagger = Math.max(t.stagger || 0, stagger);
          if (kind === 'slam') { t.atk = null; t.guarding = 0; t.cd = Math.max(t.cd || 0, 0.8); }
          if (t.push && (kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slam')) {
            const force = !solid ? 0.15 : kind === 'sweep' ? 1.1 : kind === 'slam' ? 0.65 : kind === 'charged' ? 1 : 0.35;
            t.push.x += (kind === 'sweep' ? Math.cos(heading) * dir : -dx / d) * force;
            t.push.z += (kind === 'sweep' ? -Math.sin(heading) * dir : -dz / d) * force;
          }
        }
      }
      if (kind === 'hook' && t.alive) this.hookDown(t);
      if (h === hits[0] && swing.res && swing.res !== 'miss' && this.weapon === 'spear') { const F = u.wpn && u.wpn.userData.flex; if (F) F.vel += (swing.res === 'hit' ? 1.6 : 3) * F.G.sp.bend; }
      if (kind === 'sweep' && this.jumonji && t.alive) t.stagger = Math.max(t.stagger || 0, 0.7);
      if (t.alive && t.atk && kind !== 'sweep' && t.lastStagT === army.time && Math.random() < 0.35) { t.atk = null; t.cd = 0.8; }
    }
    // 城下で町の人へ斬りかかった時（rt.civScan が有る場所＝城下でだけ）：敵は居なくても人はいる
    let civHit = null;
    if (!hits.length && this.rt.civScan && lastArc) {
      const cv = this.rt.civScan(u.pos, heading, lastArc.reach, lastArc.half);
      if (cv && cv.length) civHit = cv[0];
    }
    if (civHit) { this.rt.civStrike(civHit.u, dmg); }
    // 兵に当たらなかった時は、目の前の敵の柵・逆茂木・竹束・陣幕・盾を打つ（味方の柵は打たない）。
    //   門や城の塀のような太い物は、槍・刀では少ししか減らない（掛矢の門破りの方が効く）
    if (!hits.length && !civHit) {
      const end = this._bladeEnd || (this._bladeEnd = { x: 0, y: 0, z: 0 });
      end.x = u.pos.x + Math.sin(heading) * this.meleeReach(kind); end.z = u.pos.z + Math.cos(heading) * this.meleeReach(kind); end.y = u.pos.y;
      if (army.wallBetween(u.pos, u.team, end, this.weapon === 'spear', this.meleeFenceClear(this.meleeReach(kind))) && !(this.bladeWallTipT > this.rt.t)) {
        this.bladeWallTipT = this.rt.t + 8; sfx('thud', 0.5); this.rt.hud.flash('壁に遮られ、刃が通らない', 'dim');
      }
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const best = this.meleeStructTarget(kind, heading);
      if (best) {
        const st = best.st, thick = /門|塀|城|櫓|石垣/.test(st.name || '') || (st.maxHp || 0) >= 1200;
        const amt = dmg * (kind === 'charged' ? 1.4 : 1) * (thick ? 0.15 : 1.1);
        army.damage(st, amt, u, { kind: swKind, out: swing });
        const y = this.rt.world.heightAt(best.px, best.pz) + 1.0;
        army.burst(best.px, y, best.pz, thick ? 3 : 7, 'wood', -fx * 0.6, -fz * 0.6);
        sfx(thick ? 'thud' : 'crack', thick ? 0.9 : 1.1); sfx('wood', 0.7);
        this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, thick ? 0.06 : 0.05);
        this.addShake(thick ? 0.08 : 0.05);
        if (thick && !this.thickHint) { this.thickHint = true; this.rt.hud.flash(`太い門や塀は、${this.weapon === 'sword' ? '刀' : '槍'}では少ししか傷まない`, 'dim'); }
      } else if (kind !== 'spin' && kind !== 'butt') {
        // 空を切った：重い得物に体が持っていかれ、戻りが遅れる（当たった時との差をはっきり）。溜めた大技ほど大きく泳ぐ
        const big = kind === 'charged' || kind === 'slam' || kind === 'kara' || kind === 'sweep';
        this.cd += big ? 0.22 : 0.1;
        if (!this.mounted && !(this.lunge && this.lunge.t > 0)) { const st = big ? 0.3 : 0.15; this.lunge = { x: Math.sin(heading) * st, z: Math.cos(heading) * st, t: 0.12 }; }
        if (!reduceMotion() && S.shake) this.pitch -= big ? 0.012 : 0.005;
      }
    }
    if (hits.length) {
      // 槍は技ごとの短い止めと音。受けられた突きを命中のよろけに混ぜない
      const heavy = kind === 'charged' || kind === 'slam' || kind === 'hook' || (kind === 'thrust' && third) || (kind === 'slash' && third) || counter;
      const spearFeel = spearKind && !this.mounted;
      const blocked = swing.res === 'block' && kind !== 'slam' && kind !== 'kara' && kind !== 'hook';
      // 石突き：当たった者を突き放す。振り回し：当たった者はみなよろめく
      if (kind === 'butt' || kind === 'spin') for (const h of hits) if (h.u.alive) { h.u.stagger = Math.max(h.u.stagger || 0, kind === 'butt' ? 0.8 : 0.5); if (h.u.push) { const dx = h.u.pos.x - u.pos.x, dz = h.u.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1; h.u.push.x += dx / dl * (kind === 'butt' ? 2.4 : 1.4); h.u.push.z += dz / dl * (kind === 'butt' ? 2.4 : 1.4); } }
      // 得物ごとの手応え：槍の突きは短く鋭く止まり、刀の斬りは刃が肉を通る分だけ少し長く止まって、斬った向きへ目線が流れる
      // 軽い一撃は短く軽く、重い一撃は長く止まり、鈍い音と時のゆるみ（見切りの反撃がいちばん重い）
      const blade = kind === 'slash' || kind === 'kthrust';
      const stop = spearFeel ? (blocked ? 0.035 : counter && this.counterPerfect ? 0.07 : kind === 'slam' ? 0.06 : heavy ? 0.05 : kind === 'sweep' ? 0.042 : 0.028) : counter && this.counterPerfect ? 0.16 : heavy ? 0.11 : kind === 'sweep' ? 0.08 : blade ? 0.065 : 0.035;
      this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, stop);
      if (this.rt.game.haptic) this.rt.game.haptic(heavy ? 'heavy' : 'hit', Math.min(1, 0.45 + stop * 5));
      if (spearFeel) sfx(blocked ? 'kin' : kind === 'sweep' || kind === 'butt' || kind === 'spin' ? 'wood' : heavy ? 'thud' : swing.res === 'armor' ? 'kin' : 'hit', blocked ? 0.65 : kind === 'slam' ? 0.9 : 0.45);
      else if (heavy) { sfx('thud', 0.7); if (counter || kind === 'charged') this.rt.game.slowmo = Math.max(this.rt.game.slowmo || 0, counter && this.counterPerfect ? 0.4 : 0.18); }
      if (counter) this.counterPerfect = false;
      if (kind === 'slash') { sfx('slash', 0.6); if (!reduceMotion()) this.yaw += (this.slashN % 2 ? 1 : -1) * 0.012; }
      else if ((kind === 'thrust' || kind === 'charged') && !reduceMotion()) this.pitch -= 0.006;   // 穂先が入る時、前へわずかに引かれる
      // 薙ぎが当たると、重い柄が体に食い込む手応え：少し長い止めと、下へ沈む揺れ
      if (kind === 'sweep') { this.addShake(0.08); if (!reduceMotion()) this.pitch -= 0.015; }
      if (hits.some((h) => h.u.type === 'samurai' || h.u.type === 'busho' || h.u.type === 'cavalry')) sfx('clank', heavy ? 1.3 : 0.9);
      for (const h of hits) {
        if (spearFeel && h.res !== 'hit' && h.res !== 'armor') continue;
        h.u.flinchT = Math.max(h.u.flinchT || 0, spearFeel ? (kind === 'slam' ? 0.3 : kind === 'sweep' ? 0.22 : 0.12) : heavy ? 0.32 : 0.18);
        if (!spearFeel && heavy && h.u.alive) h.u.stagger = Math.max(h.u.stagger || 0, 0.9);
      }
      this.addShake(heavy ? 0.12 : 0.03);
      // 馬上の一撃は馬の勢いが乗って重い：長めに止まり、低い音、突かれた者は馬の進む向きへ大きく突き飛ばされ、腕に返る衝撃で馬が少し落ちる
      const mh = this.mounted ? Math.min(1, Math.abs(this.hspd) / 10) : 0;
      if (mh > 0.3 && (kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slash')) {
        this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, 0.07 + 0.06 * mh);
        sfx('thud', 0.5 + 0.5 * mh);
        this.addShake(0.06 + 0.08 * mh);
        if (!reduceMotion()) { this.fovKick = Math.min(this.fovKick || 0, -1.5 * mh); this.pitch -= 0.012 * mh; }
        const fx = Math.sin(this.u.heading), fz = Math.cos(this.u.heading);
        for (const h of hits) if (h.u.alive && h.u.push && !h.u.isStruct) { h.u.push.x += fx * 4 * mh; h.u.push.z += fz * 4 * mh; h.u.stagger = Math.max(h.u.stagger || 0, 1.0); }
        this.hspd *= 1 - 0.08 * mh;
      }
      // 構えの上から受けられた：得物が弾かれて腕が浮き、半歩押し戻されて次の一手が遅れる（崩す技は別）
      if (blocked) {
        this.cd += 0.18;
        this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, spearFeel ? 0.035 : 0.07);
        if (!this.mounted) this.lunge = { x: -Math.sin(heading) * 0.22, z: -Math.cos(heading) * 0.22, t: 0.12 };
        this.addShake(0.05);
      }
      // 当たった刹那、目線が相手へわずかに吸い寄せられて戻る（重いほど深く。首の振られ＝camPush とは別）
      else if (!reduceMotion() && S.shake) this.camLean = { x: Math.sin(heading), z: Math.cos(heading), k: heavy ? 0.32 : blade ? 0.16 : 0.12, t: 0, dur: heavy ? 0.34 : 0.22 };
      if (hits.some((h) => h.res === 'hit' || h.res === 'armor')) {
        this.hitChain = (this.hitChain || 0) + 1; this.comboHitT = 1.6;
        if (this.hitChain >= 2) this.rt.hud.combo(this.hitChain);
      }
    }
  }

  // 鎌で引き倒す：相手を手前へ引き寄せ、足を払って倒す（2 秒ほど起きられない）。騎馬武者は馬から引き落とす（空馬が残る）
  hookDown(t) {
    const u = this.u, army = this.rt.army;
    const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
    t.atk = null; t.swing = null; t.cd = Math.max(t.cd || 0, 1.2);
    if (t.isPlayer || t.type === 'dummy') return;
    if (t.mounted) {
      // 騎馬武者：鎌を乗り手に掛けて鞍から引き落とす。乗り手は地に倒れ、馬は空馬になって残る
      if (t.horse && army.pullOff) { army.pullOff(t, u); this.rt.hud.flash('鎌を掛けて馬から引き落とした', 'gold'); return; }
      t.stagger = Math.max(t.stagger || 0, 1.3); t.charging = false;
      this.rt.hud.flash('鎌を鞍に掛けて引き崩した', 'gold');
      return;
    }
    // 引き寄せ：半歩ほど手前へ（押し合いの力で滑らかに）
    if (t.push && d > 1.4) { t.push.x += dx / d * 1.8; t.push.z += dz / d * 1.8; }
    t.hit = { kind: 'kneel', t: 0, dur: 2.2, from: 'front', side: Math.random() < 0.5 ? 1 : -1, part: 'leg', res: 'hit', heavy: true, wkind: 'hook', tumble: true };
    t.lastHit = t.hit; t.lastKneelT = army.time;
    t.stagger = Math.max(t.stagger || 0, 1.9);
    army.burst(t.pos.x, t.pos.y + 0.1, t.pos.z, 5, 'dust', -dx / d, -dz / d);
    sfx('thud', 0.8);
    if (!this.hookSaid) { this.hookSaid = true; this.rt.hud.flash('引き倒した。倒れた者は受けられない', 'gold'); }
  }

  rally() {
    const rt = this.rt;
    if (this.rallyCd > 0) { rt.hud.flash(`号令はあと${Math.ceil(this.rallyCd)}秒`, 'dim'); return; }
    this.rallyCd = 25;
    if (rt.squad.some((o) => o.alive && !o.woundOut)) {
      for (const g of rt.squadGroups) { if (!g.units.some((o) => o.alive && !o.woundOut)) continue; g.morale = Math.min(100, g.morale + 18); for (const s of g.units) s.confused = 0; }
      rt.say(this.G.name, ['者ども、続けぇっ！', '怯むな！踏みとどまれ！', '我らの槍を見せてやれ！'][Math.floor(Math.random() * 3)], 2.5);
      rt.hud.flash('組を励ました', 'gold');
    } else {
      rt.army.forNear(this.u.pos.x, this.u.pos.z, 12, (o) => { if (o.alive && !o.woundOut && o.team === this.u.team && o.group) o.group.morale = Math.min(100, o.group.morale + 3); });
      rt.say(this.G.name, 'えい、えい、おうっ！', 2);
    }
    sfx('taiko', 0.7);
    sfx('shout', 0.6);
    // 周りの味方が次々に槍を掲げて応え、鬨の声がうねって広がる（近い者から順に）
    const near = [];
    rt.army.forNear(this.u.pos.x, this.u.pos.z, 16, (o) => { if (o.alive && o.team === 0 && !o.isPlayer && !o.target && !o.atk) near.push(o); });
    near.sort((a, b) => Math.hypot(a.pos.x - this.u.pos.x, a.pos.z - this.u.pos.z) - Math.hypot(b.pos.x - this.u.pos.x, b.pos.z - this.u.pos.z));
    near.slice(0, 40).forEach((o, i) => rt.after(0.25 + i * 0.035 + Math.random() * 0.15, () => { if (o.alive && !o.atk) o.cheer = 0.9; }));
    if (near.length > 3) { rt.after(0.5, () => sfx('toki', 0.5 + Math.min(0.4, near.length / 60))); rt.after(1.6, () => sfx('shout', 0.35)); }
  }

  // 照準の先の地面
  aimPoint(maxD = 60) {
    const cam = this.rt.camera;
    const dir = this._apDir || (this._apDir = new THREE.Vector3());
    cam.getWorldDirection(dir);
    const p = cam.position;
    for (let s = 2; s < maxD; s += 1.2) {
      const x = p.x + dir.x * s, y = p.y + dir.y * s, z = p.z + dir.z * s;
      if (y <= this.rt.world.heightAt(x, z)) return { x, z };
    }
    const d = Math.min(maxD, 30);
    return { x: this.u.pos.x + Math.sin(this.yaw) * d, z: this.u.pos.z + Math.cos(this.yaw) * d };
  }

  // noInvuln：組に狙わせる時は、討たれない武将を外す（味方の兵は史実を崩さない）
  aimEnemy(maxD = 70, noInvuln = false) {
    const cam = this.rt.camera;
    const dir = this._aeDir || (this._aeDir = new THREE.Vector3());
    cam.getWorldDirection(dir);
    let best = null, bs = Infinity;
    const v = this._aeV || (this._aeV = new THREE.Vector3());
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === this.u.team || o.noTarget || o.civ || o.type === 'dummy' || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + (o.mounted ? RIDE.y : 0) + 1.2 - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > maxD || !weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      const score = ang * 30 + d * 0.05;
      if (ang < 0.22 && score < bs && this.lockVisible(o)) { bs = score; best = o; }
    }
    if (best || maxD < 30) return best;
    const p = this.aimPoint();
    let bd = 12;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === this.u.team || o.type === 'dummy' || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
      if (Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > maxD || !weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // 号令先に選べる隊の種類（組にいる隊だけ。全隊が先頭）
  groupChoices() {
    const kinds = new Set(this.rt.squadGroups.filter((g) => g.count > 0).map((g) => g.kind));
    return ['all', ...GROUP_KINDS.filter((k) => kinds.has(k))];
  }
  cycleGroup() {
    const order = this.groupChoices();
    if (order.length <= 2) { this.selGroup = 'all'; return; }
    this.selGroup = order[(order.indexOf(this.selGroup) + 1) % order.length];
    this.rt.tutMark('group');
    sfx('ui');
  }
  // 号令の輪の四つ目を、選んだ隊に合わせて「槍衾」か「放て／やめ」にする
  // 指を放した時の向きで決める。最後のなぞりが次の更新を待っていても取り落とさない。
  flickRadial(vx, vy) {
    if (Math.hypot(vx, vy) < 25) return false;
    this.syncRadial();
    const a = (Math.atan2(vx, -vy) + Math.PI * 2) % (Math.PI * 2);
    const it = RADIAL[Math.round(a / (Math.PI / 4)) % 8];
    this.radial = false;
    this.tabT = null;
    const trace = this.touchRadialTrace;
    if (trace) { trace.command = it.id; trace.decided = Math.round(a / (Math.PI / 4)) % 8; trace.rankBlocked = !!(it.min && this.G.rank < it.min); trace.t = this.rt.t; }
    if (it.min && this.G.rank < it.min) return false;
    if (it.id === 'rally') this.rally(); else this.command(it.id);
    if (this.rt.tutMark) this.rt.tutMark('radial');
    return true;
  }

  syncRadial() {
    const gs = this.selectedGroups().filter((g) => g.count > 0);
    const sh = gs.some((g) => g.kind === 'bow' || g.kind === 'gun');
    const other = gs.some((g) => g.kind !== 'bow' && g.kind !== 'gun');
    // 鉄砲の組がいれば「構え／放て」を出す（鉄砲を使いやすく）
    const gun = gs.some((g) => g.kind === 'gun');
    RADIAL[3] = (sh && !other) || gun ? FIRE_ITEM : YARI_ITEM;
    if (gun) FIRE_ITEM.label = this.rt.kamae ? '放て' : '構え';
  }
  selectedGroups() {
    const gs = this.rt.squadGroups;
    if (this.selGroup !== 'all') { const s = gs.filter((g) => g.kind === this.selGroup); if (s.length) return s; }
    return gs;
  }

  // 号令「かかれ」で seekRange の中に敵がいない時、進む先を探す：一番近い敵の隊（無ければ任務の赤い印）
  farAttackTarget(from) {
    const rt = this.rt;
    const e = rt.army.nearestEnemy({ pos: from, team: this.u.team }, 400, (o) => !o.fleeing) || rt.army.nearestEnemy({ pos: from, team: this.u.team }, 400);
    if (e) return { x: e.pos.x, z: e.pos.z };
    // 雨で組の見通しが短い時も、組頭が見ている敵へ行軍できる。
    // 四百歩を指定しても nearestEnemy は天気の見通しで切られる。
    const ahead = rt.army.nearestEnemy(this.u, 38, (o) => !o.fleeing && !rt.army.wallBetween(this.u.pos, -1, o.pos));
    if (ahead) return { x: ahead.pos.x, z: ahead.pos.z };
    let best = null, bd = Infinity;
    for (const m of rt.markers || []) {
      if (!m.red) continue;
      const p = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!p) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // 近くの、打ち壊せる敵の門・柵・逆茂木・竹束（石垣・土塁・築地塀など maxHp が 1e8 を超える物は対象にしない）
  nearestGate(range) {
    const u = this.u;
    let best = null, bd = range;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || (st.maxHp || 0) > 1e8) continue;
      const p = st.seg ? { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 } : { x: st.x, z: st.z };
      const d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  command(id) {
    const rt = this.rt;
    const u = this.u;
    const gs = this.selectedGroups();
    if (!gs.length || !rt.squad.some((s) => s.alive)) { if (rt.squad.length) rt.hud.flash('声の届く組がいない（組は討たれたか、散った）', 'dim'); return; }
    // 同じ号令を 4 秒のうちにもう一度押すと、取り消して前の号令に戻す（押し間違いの手直し）
    const formOrder = id === 'form' || id === 'form_line' || id === 'form_ring' || id === 'form_gyorin';
    const undoable = !formOrder && !['fire', 'roll', 'ceasefire', 'focus'].includes(id);
    if (undoable && this.lastCmd && this.lastCmd.id === id && rt.t - this.lastCmd.t < 4 && rt.restoreSquad) {
      rt.restoreSquad(this.lastCmd.before);
      this.lastCmd = null;
      rt.hud.flash(`「${ORDER_NAME[id] || id}」を取り消した（前の号令に戻す）`, 'dim');
      sfx('taiko', 0.25);
      return;
    }
    const before = undoable && rt.squadSnaps ? rt.squadSnaps() : null;
    if (rt.game.haptic) rt.game.haptic('order');   // 号令の手応え（携帯：太鼓の二打の震え）
    if (!['fire', 'roll', 'ceasefire', 'form'].includes(id)) kamaeOff(rt);
    // 号令は耳でも分かるように：かかれ・進め＝法螺と陣太鼓、退け＝鉦の連打、ついて来い＝法螺二声、ほか＝太鼓一打（同じ合図は 6 秒に一度）
    const sig = { attack: 'sig_susume', move: 'sig_susume', retreat: 'sig_hike', follow: 'sig_atsumare' }[id];
    if (sig && !(this.sigT && this.sigT[sig] > rt.t)) { (this.sigT = this.sigT || {})[sig] = rt.t + 6; sfx(sig, 0.55); }
    else sfx('taiko', 0.35);
    const lines = {
      follow: '者ども、ついて来い！', hold: 'その場で待て！', attack: 'かかれっ！突っ込め！', retreat: '退けっ、退けい！',
      focus: 'あの者を狙え！', move: 'あの地点まで進め！', yari: '槍衾を組め！',
      face: 'こちらへ向き直れ！', gather: '散るな、わしの元へ集まれ！', gate: '門を打ち破れ！',
    };
    if (id === 'fire') {
      // 弓・鉄砲の射撃を切り替える（号令先が弓か鉄砲なら、その隊だけ）
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない（射撃の号令は弓・鉄砲の組に）', 'dim'); return; }
      // 鉄砲の組：一度目は前に並べて「構え」、二度目からは「放て」の一斉射（kumi.js）
      if (shooters.some((g) => g.kind === 'gun')) {
        for (const g of shooters) if (g.kind === 'bow') g.fire = true;
        if (rt.kamae) volley(rt); else kamae(rt, this);
        rt.ack(id, shooters);
        rt.tutMark('cmd_fire');
        this.syncRadial();
        return;
      }
      const on = !shooters[0].fire;
      // 号令を待つ鉄砲組（holdFire）も「放て」で撃ち始める
      for (const g of shooters) { g.fire = on; if (on) g.holdFire = false; }
      const who = shooters.every((g) => g.kind === 'gun') ? '鉄砲隊' : shooters.every((g) => g.kind === 'bow') ? '弓隊' : '弓・鉄砲';
      rt.say(this.G.name, on ? `${who}、放てっ！` : `${who}、撃ち方やめ！`, 2);
      rt.ack(id, shooters);
      rt.tutMark('cmd_fire');
      return;
    }
    if (id === 'roll') {
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない（三段撃ちは弓・鉄砲の組に）', 'dim'); return; }
      if (volleyRoll(rt, this)) { rt.ack(id, shooters); rt.tutMark('cmd_fire'); this.syncRadial(); }
      return;
    }
    if (id === 'ceasefire') {
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない', 'dim'); return; }
      if (ceaseFire(rt)) { rt.ack(id, shooters); this.syncRadial(); }
      else rt.hud.flash('撃っている弓・鉄砲の組がいない', 'dim');
      return;
    }
    if (formOrder) {
      const seq = ['line', 'ring', 'gyorin'];
      const cur = gs[0].formation === 'yari' ? 'line' : gs[0].formation;
      const f = id === 'form' ? seq[(seq.indexOf(cur) + 1) % seq.length] : id.slice(5);
      kamaeOff(rt);
      this.lastCmd = null;
      for (const g of gs) {
        g.formation = f === 'line' && (g.kind === 'spear' || !g.kind) ? 'yari' : f;
        g.focus = null; g.dest = null; g.onArrive = null; g._gather = false;
        const back = g.kind === 'gun' || g.kind === 'bow' ? 5 : g.kind === 'cavalry' ? 8 : 0;
        g.anchor = { x: u.pos.x + Math.sin(this.yaw) * (2 - back), z: u.pos.z + Math.cos(this.yaw) * (2 - back) };
        if (f === 'ring') { const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z; }
        g.facing = this.yaw;
        g.order = g.formation === 'yari' ? 'yari' : 'hold';
        g.aggro = f === 'ring' ? 3 : g.kind === 'gun' || g.kind === 'bow' ? 8 : 4;
        for (const s of g.units) { s.target = null; s.atk = null; s.charging = false; s.aiT = 0.15 + Math.min(0.5, s.slot * 0.04); }
      }
      if (f === 'gyorin') this.command('attack');
      const said = this.cmdSaidT || (this.cmdSaidT = {});
      if (!(said[f] > rt.t)) { said[f] = rt.t + 8; rt.say(this.G.name, `${FORM_NAME[f]}に組め！`, 2); }
      if (f !== 'gyorin') rt.ack(id, gs);
      return;
    }
    let target = null;
    if (id === 'focus') {
      target = this.lock && this.lock.alive && !this.lock.invuln ? this.lock : this.aimEnemy(70, true);
      if (!target) { rt.hud.flash('狙う敵が見当たらない', 'dim'); return; }
    }
    // 敵の門の前で「突撃」：まわりに敵がいなければ、組は門を打ちにかかる（号令の輪に「門を破れ」が無くても門を破れる）
    if (id === 'attack') {
      const gt = this.nearestGate(16);
      // 門の内（塀の向こう）の敵は数えない：門の外向き（nx・nz）の側にいる敵だけ
      const gm = gt && gt.seg ? { x: (gt.seg[0] + gt.seg[2]) / 2, z: (gt.seg[1] + gt.seg[3]) / 2 } : null;
      // 「外」は自分のいる側（門の向きの決まりが戦ごとに違っても迷わない）
      const sg = gm && gt.nx != null ? Math.sign((u.pos.x - gm.x) * gt.nx + (u.pos.z - gm.z) * gt.nz) || 1 : 1;
      const outside = (o) => !gm || gt.nx == null || ((o.pos.x - gm.x) * gt.nx + (o.pos.z - gm.z) * gt.nz) * sg > 0.5;
      if (gt && /門|木戸/.test(gt.name || '') && !rt.army.nearestEnemy(u, 12, (o) => !o.fleeing && outside(o))) id = 'gate';
    }
    let gateTarget = null;
    if (id === 'gate') {
      gateTarget = this.nearestGate(70);
      if (!gateTarget) { rt.hud.flash('近くに打ち破れる門・柵が見当たらない', 'dim'); return; }
    }
    let point = null;
    if (id === 'move') point = this.aimPoint();
    let attackFar = false;
    for (const g of gs) {
      g.focus = null;
      if (g.formation === 'yari' && id !== 'yari') g.formation = 'line';
      if (id === 'follow') {
        g.order = 'follow'; g.dest = null; g.onArrive = null; g._gather = false;
        // 打ち合い中でも、古い要から組頭の後ろへ寄せ直す。
        g._catchUp = true;
      }
      else if (id === 'hold') { g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.facing = this.yaw; g.aggro = g.kind === 'bow' || g.kind === 'gun' ? 8 : 7; }
      else if (id === 'attack') {
        const c = g.center();
        c.y = rt.world.heightAt(c.x, c.z);
        // 徒歩の突撃は後列も進む。横隊のままだと後列は三〜六歩の敵しか追わない。
        if (g.kind !== 'bow' && g.kind !== 'gun' && g.kind !== 'cavalry') g.formation = 'gyorin';
        g.dest = null; g.onArrive = null; g.facing = this.yaw;
        g.seekRange = 38;
        for (const s of g.units) {
          s.watch = null; s.moveTo = null; s.pressBack = null;
          if (!s.target?.alive || rt.army.distTo(s, s.target) > 2.5) { s.target = null; s.atk = null; }
        }
        // 塀の向こうの敵が近いだけで、行軍を省いて待ち続けない。
        const near = rt.army.nearestEnemy({ pos: c, team: u.team }, g.seekRange,
          (o) => !o.fleeing && Math.abs(o.pos.y - c.y) < 3 && !rt.army.wallBetween(c, -1, o.pos));
        // 間合いに敵がいなければ、突っ立たずに一番近い敵の隊（無ければ任務の赤い印）へ進み、近づいたら今の「かかれ」に移る
        const tp = near ? null : this.farAttackTarget(c);
        if (tp) {
          attackFar = true;
          g.order = 'move'; g.dest = { x: tp.x, z: tp.z }; g.speed = 3.6; g.facing = this.yaw;
          g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 38; const cc = gg.center(); gg.anchor = { x: cc.x, z: cc.z }; };
        } else { g.order = 'attack'; g.seekRange = 38; g.anchor = { x: c.x, z: c.z }; }
      }
      else if (id === 'retreat') {
        g.order = 'retreat';
        g.anchor = { x: u.pos.x - Math.sin(this.yaw) * 18, z: u.pos.z - Math.cos(this.yaw) * 18 };
        g.facing = this.yaw;
        for (const s of g.units) { s.target = null; s.atk = null; }
      } else if (id === 'focus') { g.order = 'attack'; g.focus = target; g.seekRange = 20; }
      else if (id === 'gate') {
        // 敵が来れば普通に迎え討ちつつ、手が空いた者から狙った門・柵を数人がかりで打つ
        g.order = 'assault'; g.formation = 'line'; g.aggro = 3; g.seekRange = 30;
        g.assault = () => (gateTarget && gateTarget.alive ? gateTarget : null);
        const c = g.center(); g.anchor = { x: c.x, z: c.z };
      }
      else if (id === 'face') {
        // その場で踏みとどまり、照準の方へ隊の正面を向ける（横を突かれた時）
        g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.facing = this.yaw;
      } else if (id === 'gather') {
        // 散った兵を呼び戻す：いったん自分のすぐ後ろへ下がらせ、集まったら「ついて来い」に戻す（battle.js updateArmyAids）
        g.order = 'retreat'; g._gather = true;
        g.anchor = { x: u.pos.x - Math.sin(this.yaw) * 4, z: u.pos.z - Math.cos(this.yaw) * 4 };
        g.facing = this.yaw;
        for (const s of g.units) { s.target = null; s.atk = null; }
      }
      else if (id === 'move') {
        g.order = 'move';
        const bk = g.kind === 'bow' || g.kind === 'gun' ? 6 : 0;   // 飛び道具は槍の後ろに
        g.dest = { x: point.x - Math.sin(this.yaw) * bk, z: point.z - Math.cos(this.yaw) * bk };
        g.speed = 4.0;
        g.facing = this.yaw;
        g.onArrive = (gg) => { gg.order = 'hold'; gg.aggro = 7; };
      } else if (id === 'yari') {
        g.order = 'yari';
        // 槍衾は槍の隊だけ。弓・鉄砲は後ろに横陣、騎馬は脇に控える
        g.formation = g.kind === 'spear' || !g.kind ? 'yari' : 'line';
        const back = g.kind === 'bow' || g.kind === 'gun' ? 5 : g.kind === 'cavalry' ? 9 : 0;
        g.anchor = { x: u.pos.x + Math.sin(this.yaw) * (2 - back), z: u.pos.z + Math.cos(this.yaw) * (2 - back) };
        g.facing = this.yaw;
        g.aggro = g.kind === 'bow' || g.kind === 'gun' ? 8 : 4;
      }
      // 号令を確かに効かせる：ついて来い・待て・進めでは、目の前で打ち合っている者（2.5m 内）のほかは今の相手を離して号令に従う
      //   （遠くの敵を追いかけたまま、号令が効かないように見えないように）
      if (id === 'follow' || id === 'hold' || id === 'move' || id === 'yari') {
        for (const s of g.units) {
          if (!s.alive) continue;
          if (id === 'follow') { s.watch = null; s.moveTo = null; s.pressBack = null; }
          if (!s.target) continue;
          const tp = s.target.pos;
          if (!tp || Math.hypot(tp.x - s.pos.x, tp.z - s.pos.z) > 2.5) { s.target = null; s.atk = null; s.charging = false; }
        }
      }
      // 号令 → 返事 → 組頭格が動き、兵がそれに続く（一斉にくるりと回らない）
      g.units.forEach((s, k) => { s.aiT = s === g.leader ? 0.15 : 0.35 + Math.min(0.5, k * 0.04) + Math.random() * 0.3; });
    }
    // 同じ号令の台詞は 8 秒に一度まで（続けて押しても字幕を埋めない。合図の音と返事は毎回）
    const said = this.cmdSaidT || (this.cmdSaidT = {});
    if (id === 'attack' && attackFar) { if (!(said.attackFar > rt.t)) { said.attackFar = rt.t + 8; rt.say(this.G.name, '敵は遠い。前へ出るぞ', 2); } }
    else if (lines[id] && !(said[id] > rt.t)) { said[id] = rt.t + 8; rt.say(this.G.name, lines[id], 2); }
    if (id === 'attack') sfx('shout', 0.5);
    rt.ack(id);
    rt.tutMark('cmd_' + id);
    rt.onSquadCommand(id, target);
    this.lastCmd = before ? { id, t: rt.t, before } : null;
  }

  updateSquad(dt) {
    const u = this.u;
    // 歩いてきた向き（歩いている間だけ、ならして更新する）
    const vs = Math.hypot(u.vel.x, u.vel.z);
    if (vs > 1.2) { const vh = Math.atan2(u.vel.x, u.vel.z); this.travelH = this.travelH == null ? vh : this.travelH + angleDiff(this.travelH, vh) * Math.min(1, dt * 3); }
    for (const g of this.rt.squadGroups) {
      if (g.order === 'follow') {
        const back = g.kind === 'bow' || g.kind === 'gun' ? 9.5 : g.kind === 'cavalry' ? 8 : 5.2;
        // 組の行き先は「歩いてきた向き」の後ろ（敵へ振り向くたびに組が反対側へ走り回らないように）。止まっている間は動かさない
        const h = this.travelH ?? u.heading;
        const want = g._followPoint || (g._followPoint = { x: 0, z: 0 });
        want.x = u.pos.x - Math.sin(h) * back; want.z = u.pos.z - Math.cos(h) * back;
        // 戦っている間（突いた後も含む）は組を揺らさないが、7m より離れたら 3m まで寄せきる（その間で止まって置き去りにならないように）
        //   目の前に敵がいないのに突いているだけなら、戦っていないとみなす
        const fight = this.inCombatT > 0 && !!this.rt.army.nearestEnemy(u, 8);
        const far = Math.hypot(want.x - g.anchor.x, want.z - g.anchor.z);
        if (far > 7) g._catchUp = true; else if (far < 3) g._catchUp = false;
        if (!fight || g._catchUp) {
          g.anchor.x += (want.x - g.anchor.x) * Math.min(1, dt * 2.5);
          g.anchor.z += (want.z - g.anchor.z) * Math.min(1, dt * 2.5);
        }
        // 隊の正面は進む向きに。戦っている間は向きを保つ（横陣が振り向くたびに回らない）
        if (!fight) g.facing += angleDiff(g.facing, h) * Math.min(1, dt * 2);
        // 自分が斬り合っている時は、組もその相手まで手を伸ばす
        g.aggro = fight ? 12 : 8;
      }
      if (g.order === 'retreat') {
        const c = g.center();
        if (Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z) < 4) { g.order = 'hold'; g.aggro = 6; }
      }
    }
    // 手勢も後ろに付く。組の号令から独立させ、崩れた時は追従を止める。
    const tegei = this.rt.realm && this.rt.realm.tegei;
    if (tegei && tegei.order === 'follow' && !tegei.routed && u.alive) {
      const h = this.travelH ?? u.heading;
      const rate = Math.min(1, dt * 2.5);
      tegei.anchor.x += (u.pos.x - Math.sin(h) * 5 - tegei.anchor.x) * rate;
      tegei.anchor.z += (u.pos.z - Math.cos(h) * 5 - tegei.anchor.z) * rate;
      tegei.facing += angleDiff(tegei.facing, h) * Math.min(1, dt * 2);
    }
    this.updateTomo(dt);
  }

  treatmentSafe() {
    const u = this.u, rt = this.rt;
    if (!u.alive || rt.over || this.mounted || u.climb || rt.flags?.carry || u.lastHitT <= 6 || this.inCombatT > 0 ||
      this.pending || u.pAtk || u.swing || this.shot || this.aiming || this.draw > 0 || this.chargeT > 0 ||
      this.dodgeT > 0 || u.stagger > 0 || this.staggerT > 0 || this.knockT > 0 || Math.hypot(u.vel.x, u.vel.z) >= 0.3) return false;
    // 霧や夜で見えない敵も、すぐそばなら手当てを妨げる。配列を読むだけで近傍用の入れ物を作らない。
    let foe = null, nearest = 45 * 45;
    for (const o of rt.army.units) {
      if (!o.alive || o.team === u.team || o.fleeing || o.civ || o.noTarget || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = dx * dx + dz * dz;
      if (d < 12 * 12) return false;
      if (d < nearest) { nearest = d; foe = o; }
    }
    // 後方で、戦える味方が敵との間に立っていること。人足・敗走・深手の者は護衛に数えない。
    for (const o of rt.army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.civ || o.noTarget || o.farSim || o.woundOut ||
        o.type === 'dummy' || o.type === 'porter' || o.group?.routed || o.stagger > 0 || o.hp < o.maxHp * 0.35) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      if (dx * dx + dz * dz >= 36 || Math.abs(o.pos.y - u.pos.y) > 2.5) continue;
      if (!foe || dx * (foe.pos.x - u.pos.x) + dz * (foe.pos.z - u.pos.z) > 0) return true;
    }
    return false;
  }

  treatWounds(fraction = 0.05, ceiling = 1) {
    const u = this.u;
    if (!Number.isFinite(fraction) || fraction <= 0 || !Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 1) return false;
    if (this.treatmentLeft <= 0 || this.bandaged || u.hp >= u.maxHp * ceiling || !this.treatmentSafe()) return false;
    this.treatmentLeft--;
    this.bandaged = true;
    bindWound(u);
    // 応急処置で持ち直す分は五％まで。深手そのものは残す。
    u.hp = Math.min(u.maxHp * ceiling, u.hp + u.maxHp * Math.min(0.05, fraction));
    return true;
  }

  updateTreatment(dt) {
    const rt = this.rt, u = this.u;
    this.treatmentCheckT -= dt;
    if (this.treatmentCheckT > 0) return;
    this.treatmentCheckT = 0.2;
    if (u.hp < u.maxHp * 0.5 && !this.treatmentHint && this.treatmentLeft > 0 && !this.bandaged) {
      this.treatmentHint = true;
      rt.bark('味方の列の後ろへ退け。布を巻く間は動けない', true);
    }
    const ready = this.treatmentLeft > 0 && !this.bandaged && u.hp < u.maxHp && this.treatmentSafe();
    if (!ready && this.treatmentReady) { rt.uninteract('bandage'); this.treatmentReady = false; }
    if (!ready || this.treatmentReady) return;
    this.treatmentPoint.x = u.pos.x; this.treatmentPoint.z = u.pos.z;
    this.treatmentReady = true;
    rt.addInteract('bandage', this.treatmentPoint, `血を止める（三秒止まる・あと${this.treatmentLeft}回）`, () => {
      if (!this.treatWounds(0.05)) return;
      rt.uninteract('bandage'); this.treatmentReady = false;
      rt.hud.flash(`血を止めた。矢と骨の傷は宿で手当て（あと${this.treatmentLeft}回）`, 'dim');
    }, { r: 1.5, hold: 3 });
  }

  // 供：すぐ後ろ（二間ほど）について歩き、主に斬りかかる敵を先に迎え撃つ。
  updateTomo(dt) {
    const g = this.rt.tomoGroup, u = this.u;
    if (!g || !g.count) return;
    const back = 2.4;
    const want = { x: u.pos.x - Math.sin(u.heading) * back, z: u.pos.z - Math.cos(u.heading) * back };
    g.anchor.x += (want.x - g.anchor.x) * Math.min(1, dt * 3);
    g.anchor.z += (want.z - g.anchor.z) * Math.min(1, dt * 3);
    g.facing += angleDiff(g.facing, u.heading) * Math.min(1, dt * 2);
    this.tomoT = (this.tomoT || 0) - dt;
    if (this.tomoT > 0) return;
    this.tomoT = 0.4;
    // 主に斬りかかっている敵がいれば、その者を狙う
    if (!g.focus || !g.focus.alive) {
      const foe = this.rt.army.nearestEnemy(u, 6, (o) => o.target === u);
      g.focus = foe || null;
    }
    // 中間がいても、手当ては自分で選ぶ。そばで待つだけでは傷は戻らない。

  }

  // 自分からカメラへの線が、建物などに当たるか（当たれば 0〜1 の割合）
  camBlockHit(from, to) {
    const rt = this.rt;
    const dir = this._cbDir || (this._cbDir = new THREE.Vector3());
    dir.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.0001) return null;
    // 建物・柵の一覧は 10 秒おきに場面全体から作り直し、近くの物は 0.5 秒おきにその一覧から拾う（毎回場面を回らない。コマ数でなく時間で数える）
    const nowS = performance.now() / 1000;
    if (!this.blockAll || nowS - (this.camAllT || 0) >= 10) {
      this.camAllT = nowS;
      const all = this.blockAll || []; all.length = 0;
      rt.scene.traverse((o) => { if (o.userData.camBlock && o.geometry) all.push(o); });
      this.blockAll = all;
      this.camNearT = -Infinity;
    }
    const nearFrom = this.camNearFrom || (this.camNearFrom = new THREE.Vector3());
    if (!this.blockers || nowS - (this.camNearT || 0) >= 0.5 || nearFrom.distanceToSquared(from) > 4 || len + 2 > this.camNearReach) {
      this.camNearT = nowS;
      nearFrom.copy(from); this.camNearReach = Math.max(14, len + 4);
      const list = this.blockers || []; list.length = 0;
      const c = this._bc || (this._bc = new THREE.Vector3());
      for (const o of this.blockAll) {
        if (!camBlockVisible(o, rt.scene)) continue;
        o.updateWorldMatrix(true, false);
        const sphere = camBlockSphere(o);
        c.copy(sphere.center).applyMatrix4(o.matrixWorld);
        if (c.distanceTo(from) < sphere.radius * o.matrixWorld.getMaxScaleOnAxis() + this.camNearReach) list.push(o);
      }
      this.blockers = list;
    }
    if (!this.blockers.length) return null;
    if (!this.ray) this.ray = new THREE.Raycaster();
    this.ray.set(from, dir.normalize());
    this.ray.far = len;
    const h = this.camHits || (this.camHits = []); h.length = 0;
    for (const o of this.blockers) {
      if (!camBlockVisible(o, rt.scene)) continue;
      o.updateWorldMatrix(true, false);
      camBlockRaycast(o, this.ray, h);
    }
    let nearest = Infinity;
    for (const hit of h) nearest = Math.min(nearest, hit.distance);
    return nearest < Infinity ? nearest / len : null;
  }

  // ---------------- 視点（三人称・一人称） ----------------
  // V（触る端末は左上の「視点」）で切り替える。選んだ方は次の戦でも使う
  // 回る順：三人称・普通 → 三人称・遠い → 一人称 → 三人称・近い → 三人称・普通
  // 見せ場の一枚を撮る（戦の定義から呼ぶ）：from の低い所（h m）から at を dur 秒見上げる。from・at は {x, z} か、それを返す関数
  // 例）桶狭間の「かかれ」：player.showShot({ x: 前へ 8m, z }, () => 自分の位置, 2)。森部・姉川の開戦：敵の横陣の正面 20m の低い所から敵陣を 3 秒
  // 戦っている時・一人称の時は撮らない（操作を奪わない）
  showShot(from, at, dur = 2.5, o = {}) {
    if (this.inCombatT > 0 || this.lock || this.aiming || this.draw > 0 || this.fpWanted() || this.lookIdle < 0.7 || reduceMotion()) return false;
    this.camShot = { from, at, dur, t: 0, ...o };
    return true;
  }

  toggleView() {
    const r = S.camRange || 'mid';
    if (S.view === 'first') { S.view = 'third'; S.camRange = 'near'; }
    else if (r === 'mid') S.camRange = 'far';
    else if (r === 'far') S.view = 'first';
    else S.camRange = 'mid';
    saveSettings();
    sfx('ui');
    const nm = { near: '近い', mid: '普通', far: '遠い' }[S.camRange || 'mid'];
    this.rt.hud.flash(S.view === 'first' ? '一人称（自分の目で見る）' : `三人称・${nm}（背中から見る）`, 'dim');
  }
  // 一人称で見てよい時か。開戦の引き・大事な場面・倒れた時・戦の終わり・写真モードは三人称に戻す（終われば一人称へ戻る）
  fpWanted() {
    const rt = this.rt;
    const window = (this.weapon === 'gun' || this.weapon === 'bow') && nakaWindowAt(this.u, this.yaw);
    return (S.view === 'first' || window) && this.u.alive && !(this.introT > 0) && !this.cine && !rt.over && !(rt.game && rt.game.photo);
  }
  // 目の位置：骨の入った人なら頭の骨の少し上・前。無ければ体の高さから
  eyeRaw(out) {
    const u = this.u, h = u.human;
    const hb = h && h.root.visible && h.root.parent && h.bones && h.bones.Head;
    if (hb) {
      hb.getWorldPosition(out);
      out.y += 0.075;
    } else {
      // 骨の人が描かれていない時：体の縮尺（背丈 1.63m なら 0.935）に合わせた目の高さ（約 1.46m、馬上は馬の縮尺も）
      const sc = (u.mesh && u.mesh.scale.y) || 1;
      out.set(u.pos.x, u.pos.y + (1.56 + (this.mounted ? RIDE.y : 0)) * sc, u.pos.z);
    }
    return out;
  }
  // 描く直前（on）と後：一人称の時だけ、自分の頭（兜・陣笠・顔）と背の指物・馬印を隠す。腕・手・武器・胴・脚は見せる
  fpHide(on, cam) {
    if (!on) {
      if (this.hid) { for (const o of this.hid) o.visible = true; this.hid = null; }
      if (this.hidHead) { this.hidHead.scale.setScalar(1); this.hidHead = null; }
      if (this.mirOn) { const m = this.mirOn; this.mirOn = null; m.scale.x = -m.scale.x; m.updateMatrixWorld(true); }
      setFpCut(null); setFpArm(false);
      this.allyFade(null);
      this.propFade(null);
      return;
    }
    const rt = this.rt, u = this.u;
    if (cam === rt.camera && !(rt.game && rt.game.photo)) { this.allyFade(cam); this.propFade(cam); }
    if (cam !== rt.camera || this.fpK < 0.72 || (rt.game && rt.game.photo) || !u.alive) return;
    const hid = [];
    for (const o of [u.flag, u.uma]) if (o && o.visible) { o.visible = false; hid.push(o); }
    const h = u.human;
    // 火縄銃で狙う時は、自分の体と筒を隠して照門（画面の札）でのぞく（頬付けした腕と台木が目の前をふさがないように）
    if (this.weapon === 'gun' && this.aimK > 0.5) {
      for (const o of [u.mesh, h && h.root]) if (o && o.visible) { o.visible = false; hid.push(o); }
      this.hid = hid;
      return;
    }
    // 自分の体を左右に映して描く：兵の体は右手（武器）が体の左に来る作りなので、一人称では映して、
    // 武器を右手で画面の右に、手綱を左手で画面の左に見せる（動きの計算は映す前のまま。描く間だけ）
    if (u.mesh) { u.mesh.scale.x = -u.mesh.scale.x; u.mesh.updateMatrixWorld(true); this.mirOn = u.mesh; }
    // 目のすぐ前に来た自分の袖・肩の板（胴丸）は描かない。作った袖は隠す
    setFpCut(cam.position, 0.24); setFpArm(true);
    if (h && h.parts) {
      for (const k of ['sodeP', 'sodeN', 'yoke', 'back', 'pole']) { const o = h.parts[k]; if (o && o.visible) { o.visible = false; hid.push(o); } }
      // 馬上：鞍に座った腿の筒（袴・佩楯の部品）は目の真下 0.5m に来て、見下ろすと中の空いた青い板が浮いて見える。一人称では描かない（見本の体の腿がそのまま見える）
      if (this.mounted) for (const k of ['thighP', 'thighN']) { const o = h.parts[k]; if (o && o.visible) { o.visible = false; hid.push(o); } }
      // 前腕の籠手の筒：込めの最中など、手が目の前（0.45m 以内）へ来て肘より近い時は、筒を手首の側からのぞくことになり、
      //   口の空いた黒い塊が手にくっついて見える（馬上の一人称の込め直し）。その時だけ描かない
      if (h.bones) for (const [k, side] of [['foreP', 'Right'], ['foreN', 'Left']]) {
        const o = h.parts[k], bh = h.bones[side + 'Hand'], be = h.bones[side + 'ForeArm'];
        if (!o || !o.visible || !bh || !be) continue;
        const dh = bh.getWorldPosition(_fpS).distanceTo(cam.position), de = be.getWorldPosition(_fpS).distanceTo(cam.position);
        if (dh < 0.45 && dh < de - 0.04) { o.visible = false; hid.push(o); }
      }
      // 腕の籠手・肩の部品が目のすぐ前（0.12m 以内）に来たら隠す（振りかぶった二の腕で画面が塞がらない）
      for (const k of ['upperP', 'upperN', 'sleeveP', 'sleeveN', 'haori']) {
        const o = h.parts[k];
        if (!o || !o.visible || !o.geometry) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        _fpS.copy(bs.center).applyMatrix4(o.matrixWorld);
        // 二の腕は目のそばに来やすい（刀を振る時など）ので、少し遠くから隠す
        const near = /^upper|^sleeve/.test(k) ? 0.22 : 0.12;
        if (_fpS.distanceTo(cam.position) - bs.radius * o.matrixWorld.getMaxScaleOnAxis() < near) { o.visible = false; hid.push(o); }
      }
    }
    if (h && h.root.visible && h.root.parent && h.bones && h.bones.Head) {
      // 頭の骨を小さく縮めると、頭に付いた物（兜・顔・胴丸の兜）がまとめて消える
      const hb = h.bones.Head;
      hb.scale.setScalar(0.001);
      hb.updateMatrixWorld(true);
      this.hidHead = hb;
    } else {
      // 骨の無い形（画質「低」）：胴に兜が付いているので胴ごと隠し、手と武器・脚だけ見せる
      for (const o of [u.body, u.head]) if (o && o.visible) { o.visible = false; hid.push(o); }
    }
    this.hid = hid;
  }

  // 戦の気配を音へ渡す（0.2秒おき。すぐそばを通る馬を聞き逃さない）：
  //   approach：こちらへ寄せてくる敵の大勢（近いほど・多いほど大きい）と、その向き（左右の振り）・遠さ
  //   tense：押されている度合い（近くの敵が味方より多い・味方の士気が落ちている）。crumble：近くの味方の隊が崩れかけた瞬間
  senseWar(dt) {
    this.warT = (this.warT || 0) - dt;
    if (this.warT > 0 || !this.rt.army || !this.u.alive) return;
    this.warT = 0.2;
    const u = this.u, army = this.rt.army;
    let ap = 0, ax = 0, az = 0, apN = 0, foes = 0, friends = 0, low = 0, cav = 0, cavNear = 0;
    for (const o of army.units) {
      if (!o.alive || o.isStruct || o === u) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > 160) continue;
      // 近くを駆ける騎馬（敵味方とも）：地鳴りと足もとの震えに
      if (o.mounted && d < 45 && o.mv && Math.abs(o.pos.y - u.pos.y) < 6) {
        const sp = Math.hypot(o.mv.x, o.mv.z);
        if (sp > 4.5) {
          const pace = Math.min(1.4, sp / 7);
          cav += (1 - d / 45) * (1 + 2 * Math.max(0, 1 - d / 12)) * pace;
          // 音は遠くから届くが、画面を揺らすのは同じ地面の十二歩以内を通る馬だけ。
          if (d < 12 && Math.abs(o.pos.y - u.pos.y) < 2 && !army.wallBetween(u.pos, -1, o.pos)) cavNear += (1 - d / 12) * pace;
        }
      }
      if (o.team !== u.team) {
        if (d < 30) foes++;
        const v = o.vel, sp = v ? Math.hypot(v.x, v.z) : 0;
        // 寄せてくる：こちらへ向かう速さがある者
        if (d > 6 && sp > 0.8 && -(v.x * dx + v.z * dz) / (d * sp) > 0.5) { const w = (1 - d / 160) * (o.mounted ? 2 : 1); ap += w; ax += dx * w; az += dz * w; apN++; }
      } else if (d < 30) { friends++; if (o.fleeing || (o.group && o.group.morale < 35)) low++; }
    }
    const approach = Math.min(1, ap / 25);
    // 向き：自分の見ている向きに対して左右どちらから来るか
    const al = Math.hypot(ax, az) || 1, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const pan = apN ? Math.max(-1, Math.min(1, -((ax / al) * fz - (az / al) * fx))) : 0;
    const dist = apN ? al / ap : 0;
    const tense = Math.min(1, Math.max(0, (foes - friends) / 10) + (friends ? low / friends : 0) * 0.8);
    const crumble = friends >= 4 && low / friends > 0.4 && !((this.crumbleT ?? -99) + 25 > this.rt.t);
    if (crumble) this.crumbleT = this.rt.t;
    // 自分が駆けていれば自分の馬も数える（群れで駆けるほど地が鳴る）
    if (this.mounted && Math.abs(this.hspd || 0) > 7) cav += 1.5;
    this.cavRumble = Math.min(1, cav / 7);
    this.cavShake = Math.min(1, cavNear / 3);
    const scene = this._warScene || (this._warScene = {});
    scene.approach = approach; scene.approachPan = pan; scene.approachDist = dist;
    scene.tense = tense; scene.crumble = crumble ? 1 : 0; scene.hoofRumble = this.cavRumble;
    setScene(scene);
  }

  // 描く直前（cam）と後（null）：カメラと自分の間に入った小さな建て物（足場・櫓・小屋など、差し渡し 16m まで）を隠す
  // 寄せ（camBlockHit）で間に合わない細い格子（足場の骨組み）が画面を塞がないように。大きな塀や柵は寄せに任せる
  propFade(cam) {
    if (!cam) { if (this.propHid) { for (const o of this.propHid) o.visible = true; this.propHid = null; } return; }
    if (!this.blockers || !this.blockers.length || this.fpK > 0.5) return;
    const u = this.u, head = this._pfHead || (this._pfHead = new THREE.Vector3());
    head.set(u.pos.x, u.pos.y + 1.5 * ((u.mesh && u.mesh.scale.y) || 1) + (this.mounted ? RIDE.y : 0), u.pos.z);
    const L = cam.position.distanceTo(head);
    if (L < 0.5) return;
    if (!this.pray) this.pray = new THREE.Raycaster();
    const hid = this.propHidden || (this.propHidden = []); hid.length = 0;
    // カメラが櫓・足場の骨組みの中に入り込んだ時（柱の隙間を抜けて寄せが効かない）：その物ごと隠す
    const cc = this._pc || (this._pc = new THREE.Vector3());
    for (const o of this.blockers) {
      // 束全体は隠さない。個々の面でカメラを寄せる判定に任せる。
      if (!camBlockVisible(o, this.rt.scene) || !o.geometry || o.isBatchedMesh || o.isInstancedMesh) continue;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z);
      if (r > 8) continue;
      cc.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      if (cc.distanceTo(cam.position) < r * 0.85) { o.visible = false; hid.push(o); }
    }
    const dir = this._pfDir || (this._pfDir = new THREE.Vector3());
    dir.copy(head).sub(cam.position).normalize();
    // 真ん中と左右上下の五本の線：どれかに当たった小さな物を隠す
    const right = this._pfRight || (this._pfRight = new THREE.Vector3());
    right.crossVectors(dir, _WORLD_UP).normalize();
    const from = this._pfFrom || (this._pfFrom = new THREE.Vector3());
    const toH = this._pfToH || (this._pfToH = new THREE.Vector3());
    for (const [a, b] of _PF_OFFSETS) {
      from.copy(cam.position).addScaledVector(right, a); from.y += b;
      toH.copy(head).sub(from).normalize();
      this.pray.set(from, toH);
      this.pray.far = Math.max(0.1, from.distanceTo(head) - 0.6);
      const hits = this.propHits || (this.propHits = []); hits.length = 0;
      for (const o of this.blockers) {
        if (o.isBatchedMesh || o.isInstancedMesh || !camBlockVisible(o, this.rt.scene)) continue;
        camBlockRaycast(o, this.pray, hits);
      }
      for (const h of hits) {
        const o = h.object;
        if (!o.visible || hid.includes(o)) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) > 8) continue;
        o.visible = false; hid.push(o);
      }
    }
    this.propHid = hid.length ? hid : null;
  }

  // 前の描画で透かした物があれば戻す。乱戦でも味方の姿を残す。
  allyFade(cam) {
    const F = this.fadeOn;
    if (cam && (F || this.nearAllyHid.length)) this.allyFade(null);
    if (!cam) {
      if (F) {
        for (const [o, m] of F.mats) o.material = m;
        for (const o of F.vis) o.visible = true;
        for (const [b, m] of F.bones) { b.matrix.copy(m); b.updateMatrixWorld(true); }
        this.fadeOn = null;
      }
      for (const o of this.nearAllyHid) o.visible = true;
      this.nearAllyHid.length = 0;
      this.nearAllyCam = null;
      return;
    }
    // 体は残し、視線を塞ぐ旗・馬印・竿だけを描く間避ける。入れ物は使い回す。
    for (const o of this.rt.army.units) {
      if (o.team !== this.u.team || !o.mesh || o.isStruct) continue;
      if (!this.flagBlocksView(o.pos, 5, cam)) continue;
      this.hideNearFlag(o.flag);
      this.hideNearFlag(o.uma);
      if (o.look?.standard) this.hideNearFlag(o.wpn);
      if (o.flag && o.human?.root.visible) this.hideNearFlag(o.human.parts?.pole);
    }
    for (const g of this.rt.army.groups) {
      if (g.team !== this.u.team || !g.stds) continue;
      for (const s of g.stds) {
        const d = s.userData.std, carrier = s.userData.carrier;
        const pos = d.down || !carrier ? s.position : carrier.pos;
        if (this.flagBlocksView(pos, d.H + 1.5, cam)) this.hideNearFlag(s);
      }
    }
  }

  hideNearFlag(o) {
    if (!o || !o.visible) return;
    o.visible = false;
    this.nearAllyHid.push(o);
  }

  flagBlocksView(pos, height, cam) {
    const c = cam.position, p = this.u.pos;
    // 高い場所の旗はそのまま。近い竿も、布と一緒に判定する。
    if (pos.y > Math.max(c.y, p.y + 2) + 1 || pos.y + height < Math.min(c.y, p.y)) return false;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    if (dx * dx + dz * dz < 9) return true;
    const vx = p.x - c.x, vz = p.z - c.z, len2 = vx * vx + vz * vz;
    const t = len2 > 0.01 ? Math.max(0, Math.min(1, (dx * vx + dz * vz) / len2)) : 0;
    const x = dx - vx * t, z = dz - vz * t;
    // 自分の真横まで含む幅約三メートルの視線の通り道。
    return x * x + z * z < 2.25;
  }

  updateCamera(dt, camera) {
    decisiveCameraReset(this.rt, camera);
    const u = this.u;
    // 乱戦の土煙：近くで大勢が斬り合っているほど、足もとから土煙が立つ（乾いた日だけ。半秒おきに数える）
    this.meleeDustT = (this.meleeDustT || 0) - dt;
    if (this.meleeDustT <= 0 && this.rt.world && this.rt.army && this.rt.army.forNear) {
      this.meleeDustT = 0.5;
      const W = this.rt.world;
      if (!(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5)) {
        const busy = this.dustBusy || (this.dustBusy = []); busy.length = 0;
        this.rt.army.forNear(u.pos.x, u.pos.z, 26, (o) => { if (o.alive && !o.isStruct && (o.atk || o.swing || o.stagger > 0)) busy.push(o); });
        const n = Math.min(3, Math.floor(busy.length / 5));
        for (let i = 0; i < n; i++) { const o = busy[Math.floor(Math.random() * busy.length)]; W.dustCloud(o.pos.x, o.pos.z, o.mounted); }
      }
      // 倒れた兵のまわりは、もみ合った足で踏み荒らされ、草が倒れて土（雨なら泥）が出る（一人一度だけ）
      if (W.stampWear) for (const o of this.rt.army.units) {
        if (o.alive || o._trod || o.isStruct || !o.pos) continue;
        o._trod = true;
        W.stampWear(o.pos.x, o.pos.z, 1.9, 55);
        W.stampWear(o.pos.x + (Math.random() - 0.5) * 2, o.pos.z + (Math.random() - 0.5) * 2, 1.2, 40);
      }
    }
    edgeDark(this.rt.game && this.rt.game.paused ? 0 : dt);
    this.senseWar(dt);
    // 世界の側（手前の雨筋など）が視点の場所を知れるように
    if (this.rt.world) {
      this.rt.world.camRef = camera;
      // 夏の戦か（battle.js が日付から決める）を世界へ渡す（夏の昼の光・陽炎）
      if (this.rt.isSummer != null && this.rt.world.setSummer) this.rt.world.setSummer(this.rt.isSummer);
      // 敵方（敵の鬨の声の言葉づかいを変える）
      if (!this.foeSet) { this.foeSet = true; const sd = this.rt.def && this.rt.def.sides; setScene({ foe: (sd && sd.b && sd.b.mon) || '' }); }
      // 一人称で雨の中にいる時だけ、画面の端に雨粒（post.js。設定の rainScreen で切れる）
      POST.drops = (this.fpK || 0) > 0.7 ? Math.min(1, (this.rt.world.rainLevel || 0) * 1.3) : 0;
    }
    // 火縄銃・弓を構えた直後は、筒先・弓手の重さで狙いがゆっくり揺れ、1 秒ほどで落ち着く（息の小さな揺れは残る）
    {
      const ranged = this.aiming && (this.weapon === 'gun' || this.weapon === 'bow') && !reduceMotion();
      const amp = ranged ? 0.014 * Math.exp(-this.aimHoldT * 2.4) + 0.0022 : 0;
      const tt = (this.swayClock = (this.swayClock || 0) + dt);
      const sy = Math.sin(tt * 1.3) * amp + Math.sin(tt * 2.9 + 1) * amp * 0.4, sp = Math.sin(tt * 1.7 + 2) * amp * 0.8;
      this.yaw += sy - (this.swayY || 0); this.pitch += sp - (this.swayP || 0);
      this.swayY = sy; this.swayP = sp;
    }
    // 馬上は目の高さが上がり、少し遠くから見る
    const bodySc = (u.mesh && u.mesh.scale.y) || 1;
    // 徒歩は肩の少し下を狙い、低めの肩越しに（地に足が着いた目線。馬上は高く）
    const target = _cT.set(u.pos.x, u.pos.y + (this.mounted ? 1.7 + RIDE.y : 1.58) * bodySc, u.pos.z);
    const running = Math.hypot(u.vel.x, u.vel.z) > 5;
    const fight = this.inCombatT > 0 || this.lock;
    const hsp = Math.abs(this.hspd || 0), gallop = this.mounted && hsp > 9;
    // 乱戦：近くの敵を数え、見やすい角度へカメラだけ少し回す（体の向き・狙いの向きは変えない。自分で視点を動かした直後は回さない）
    this.frameT = (this.frameT || 0) - dt;
    if (this.frameT <= 0) {
      this.frameT = 0.25;
      let sx = 0, sz = 0, n = 0, near = 99;
      if (u.alive && this.rt.army.forNear) this.rt.army.forNear(u.pos.x, u.pos.z, 7, (o) => {
        if (!o.alive || o.team === u.team || o.isStruct || o.fleeing || o.woundOut || o.type === 'dummy') return;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z), w = 1 / (0.6 + d);
        sx += (o.pos.x - u.pos.x) * w; sz += (o.pos.z - u.pos.z) * w; n += w; near = Math.min(near, d);
      });
      this.foeN = n; this.foeNear = near;
      this.foeYaw = n ? Math.atan2(sx / n, sz / n) : null;
    }
    let offWant = 0;
    if (S.autoCam && this.foeYaw != null && !this.lock && !this.aiming && !this.mounted && !this.cine && !reduceMotion() && (this.lookIdle || 0) > 0.7 && this.fpK < 0.5) {
      const a = angleDiff(this.yaw, this.foeYaw);
      // 正面から 0.35 ほどまでは回さない（いつも動く画面にしない）。回すのは最大 0.4 ほど
      if (Math.abs(a) > 0.35) offWant = Math.max(-0.4, Math.min(0.4, (Math.abs(a) - 0.35) * Math.sign(a) * 0.6));
    }
    // 狙う・狙い定め・一人称では狙いと画面がずれないよう、すぐ戻す
    this.camYawOff = (this.camYawOff || 0) + (offWant - (this.camYawOff || 0)) * Math.min(1, dt * (this.aiming || this.lock || this.fpK > 0.3 ? 8 : 1.6));
    const cyaw = this.yaw + this.camYawOff;
    this.frameK = (this.frameK || 0) + (((this.foeNear || 99) < 4.5 && !this.mounted && !reduceMotion() ? 1 : 0) - (this.frameK || 0)) * Math.min(1, dt * 2);
    const cp = Math.cos(this.pitch - this.frameK * 0.06);
    const dir = _cD.set(Math.sin(cyaw) * cp, Math.sin(this.pitch - this.frameK * 0.06), Math.cos(cyaw) * cp);
    const right = _cR.set(-Math.cos(cyaw), 0, Math.sin(cyaw));
    // 止まって 1.5 秒ほどすると、ゆっくり寄る（周りを眺める間合い）。動けば元へ
    const still = Math.hypot(u.vel.x, u.vel.z) < 0.3 && !fight && !this.mounted;
    this.stillT = still ? (this.stillT || 0) + dt : 0;
    this.stillK = (this.stillK || 0) + ((this.stillT > 1.5 && !reduceMotion() ? 1 : 0) - (this.stillK || 0)) * Math.min(1, dt * 0.7);
    // 戦っている時は肩越しに近く（敵と自分が画面の左右に並ぶ）。走ると引いて速さを見せる。止まると寄る。敵がすぐ近いとさらに少し寄る
    const base = (this.cmdOpen || this.radial ? 7.5 : this.aiming ? 2.5 : this.guard ? 3.0 : running ? 5.2 : fight ? 3.0 : 4.0) - this.stillK * 0.6 - this.frameK * 0.35 + (gallop ? 0.9 : 0);
    // 一人称への寄り（0.3秒ほど。動きを減らす設定ならすぐ）
    const fpGoal = this.fpWanted() && !this.overHold ? 1 : 0;
    if (reduceMotion() || dt >= 0.5) this.fpK = fpGoal;
    else this.fpK += Math.sign(fpGoal - this.fpK) * Math.min(Math.abs(fpGoal - this.fpK), dt / 0.3);
    const e = this.fpK * this.fpK * (3 - 2 * this.fpK);
    // 体の側（humans.js）へ一人称の寄り具合を渡す（手と武器を目の下へ寄せ、柄を握らせる）
    u.fpk = u.alive ? e : 0;
    // 一人称では足もとの間合いの輪を出さない（目の真下に大きな白い輪が映るので）
    if (e > 0.5) this.reachT = 0;
    // 走ると視野が少し広がる。一人称は設定の視野より少し広く
    // 火縄銃・弓で構えて狙う時は視野を狭める（一人称は照門をのぞく）
    // 打たれた瞬間は視野が一瞬すぼまる（fovKick。0.3秒ほどで戻る）
    this.fovKick = (this.fovKick || 0) * Math.exp(-dt * 7);
    // 携帯の小さな画面では、周りが見えるよう視野を少し広く
    const phoneWide = isTouch && Math.min(innerWidth, innerHeight) < 500 ? 6 : 0;
    // 馬上は速さにつれて視野がなめらかに広がる（速歩で少し、襲歩で大きく）。蹴り出した瞬間はもう一息広がる。動きを減らす設定では三割だけ
    const rideGoal = this.mounted ? Math.pow(Math.max(0, Math.min(1, (hsp - 2.5) / 9)), 1.4) * 11 + Math.max(0, Math.min(2.5, (this.surge || 0) * 0.6)) : 0;
    this.gallopK = (this.gallopK || 0) + (rideGoal * (reduceMotion() ? 0.3 : 1) - (this.gallopK || 0)) * Math.min(1, dt * 2.2);
    const fovWant = S.fov + phoneWide + (running && !this.mounted && !reduceMotion() ? 6 : 0) + this.gallopK + e * 8 - (this.aimK || 0) * (e > 0.5 ? 24 : 12) + (reduceMotion() ? 0 : this.fovKick) - (this.shotZoom || 0);
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * (Math.abs(this.fovKick) > 0.3 ? 18 : 4)); camera.updateProjectionMatrix(); }
    decisiveCameraApply(this.rt, camera);
    // 目の前の手と武器が切れないよう、一人称では手前の切り口を近づける
    const nearWant = e > 0.5 ? 0.05 : 0.1;
    if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
    // 開戦の引き
    if (this.introT > 0) this.introT -= dt;
    const pr = this.introT > 0 && !reduceMotion() ? Math.min(1, this.introT / 3.4) : 0;
    const pull = pr * pr * (3 - 2 * pr);
    // 大事な場面では、その方へ視点を向ける
    if (reduceMotion()) { this.cine = null; this.camShot = null; this.shotZoom = 0; this.camPush = null; this.camLean = null; }
    if (this.cine && (this.lookIdle < 0.2 || this.aiming || this.lock || this.inCombatT > 0)) this.cine = null;
    if (this.cine) {
      this.cine.t -= dt;
      const want = Math.atan2(this.cine.x - u.pos.x, this.cine.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 3);
      if (this.cine.t <= 0) this.cine = null;
    }
    // 行軍の間は少し引いて、斜め後ろから隊列の長さを見せる。勝った後は 3 秒かけてゆっくり上へ引き、旗の林と戦の跡を見せる
    const rt0 = this.rt;
    this.marchK = reduceMotion() ? 0 : (this.marchK || 0) + ((rt0.phase === 'march' && !(this.inCombatT > 0) ? 1 : 0) - (this.marchK || 0)) * Math.min(1, dt * 0.8);
    if (rt0.over && rt0.result && !rt0.result.down && rt0.tracker && rt0.tracker.main === true && !reduceMotion()) this.winK = Math.min(1, (this.winK || 0) + dt / 3); else this.winK = 0;
    const wk = this.winK * this.winK * (3 - 2 * this.winK);
    // 倒れた時：カメラがゆっくり上へ離れ、倒れた自分を見下ろす（意識が遠のく）
    this.downK = !u.alive && !reduceMotion() ? Math.min(1, (this.downK || 0) + dt / 4) : 0;
    const dk = this.downK * this.downK * (3 - 2 * this.downK);
    // 大将の目：足軽 3m・組頭 6m・足軽大将 12m の高さへ上がり、少し引いて前の戦場を見下ろす
    const overH = this.G.rank >= 4 ? 12 : this.G.rank >= 2 ? 6 : 3;
    this.overK = (this.overK || 0) + ((this.overHold ? 1 : 0) - (this.overK || 0)) * Math.min(1, dt * (reduceMotion() ? 30 : 4));
    const ok = this.overK * this.overK * (3 - 2 * this.overK);
    // 視点の遠さの三段（V の短押し・「視点」の釦で回す）
    const range = S.camRange === 'near' ? -0.9 : S.camRange === 'far' ? 2.2 : 0;
    // 硝煙・土煙の中では少し寄る（先が見えない怖さ。煙が晴れれば戻る）
    const W0 = rt0.world, smoke = W0 ? Math.min(1, ((W0.haze && W0.haze.k) || 0) + ((W0.dustVeil && W0.dustVeil.k) || 0) * 0.5) : 0;
    this.smokeK = (this.smokeK || 0) + (smoke - (this.smokeK || 0)) * Math.min(1, dt * 0.8);
    // 騎乗して味方に囲まれている時（鹿垣の段など）は、馬の首・鞍で前が塞がらないよう、もう少し引く
    const mountCrowd = this.mounted ? Math.min(1.1, (this.crowd || 0) / 6) : 0;
    const dist = Math.max(2.2, (base + this.zoom + range + (this.mounted ? 1.6 + mountCrowd * 1.4 : 0)) * (1 - this.smokeK * 0.18)) + pull * 7 + this.marchK * 2.5 + wk * 9 + ok * overH * 0.7 + ((rt0.holdPct || 0) > 0 ? 1.5 : 0) + dk * 2.5 + ((rt0.def && rt0.def.camPull) || 0);   // 戦ごとの引き（塀・暗い林で前が塞がる戦。B099・B112）   // 長押し（首取りなど）の間は少し引いて周りを見せる
    // 天守・櫓・御殿の中（naka.js）：狭い部屋なので肩越しに寄る
    const inRoom = !!NAKA.cur;
    const distR = inRoom ? Math.min(dist, 2.3) : dist;
    this.camDist = this.camDist ? this.camDist + (distR - this.camDist) * Math.min(1, dt * (inRoom ? 5 : 3)) : distR;
    this.sideK = (this.sideK ?? 0.65) + ((fight || this.guard ? 0.85 : 0.65) - (this.sideK ?? 0.65)) * Math.min(1, dt * 3);
    // 狭い所（門・塀の内）：肩の側が壁に近ければ、空いている逆の肩へカメラだけ回す（決めた肩の設定は変えない）
    this.wallT = (this.wallT || 0) - dt;
    if (this.wallT <= 0) {
      this.wallT = 0.3;
      const probe = (sg) => { const q = _cQ.copy(target).addScaledVector(right, 1.3 * sg); return this.camBlockHit(target, q) !== null; };
      this.wallFlip = probe(this.shoulder) && !probe(-this.shoulder) ? -1 : 1;
    }
    this.shK = (this.shK ?? 1) + ((this.wallFlip || 1) - (this.shK ?? 1)) * Math.min(1, dt * 4);
    const side = (this.sideK * this.shoulder + pull * 4 * this.shoulder) * this.shK;
    const want = _cW.copy(target).addScaledVector(dir, -this.camDist).addScaledVector(right, side);
    // 組を率いているときは少し高い位置から見下ろす（部下で視界が塞がらないように）
    // 味方に囲まれて密集しているときは、少し高くから見る
    this.crowdT = (this.crowdT || 0) - dt;
    if (this.crowdT <= 0) { this.crowdT = 0.3; let n = 0; this.rt.army.forNear(u.pos.x, u.pos.z, 4, (o) => { if (o !== u && o.alive && o.team === u.team) n++; }); this.crowd = n; }
    // 持ち上げは小さく（見下ろしの絵にしない。前の味方は allyFade で透かす）。馬上は馬の首を越えて前が見える高さに
    // 騎乗中は囲まれるほど、さらに高く引く（自分の馬のたてがみ・鞍で前が塞がらないように）
    this.crowdLift = (this.crowdLift || 0) + ((this.crowd > 5 ? (this.mounted ? 0.55 : 0.3) : 0) - (this.crowdLift || 0)) * Math.min(1, dt * 2);
    want.y += (this.rt.squad.length ? 0.35 : 0.15) - pull * 0.7 + this.crowdLift + (this.mounted ? 0.5 : 0) + this.marchK * 1.0 + wk * 6 + ok * overH + dk * 4;
    let terrainBlocked = !inRoom && terrainCameraClamp(this.rt.world, target, want, true);
    if (inRoom) want.y = Math.max(want.y, u.pos.y + 0.5);
    // 建物・柵・櫓がカメラと自分の間にあれば、その手前まで寄せる
    // 足場・櫓のような格子の物は、真ん中の一本の線だけだと隙間を抜けてしまうので、カメラの四隅寄りにも線を引いて一番手前で止める（隅は 3 コマに一度）
    let hit = this.camBlockHit(target, want);
    const movedView = Math.abs(angleDiff(this.camCornYaw ?? this.yaw, this.yaw)) > 0.12 || Math.abs((this.camCornPitch ?? this.pitch) - this.pitch) > 0.12;
    this.camCornT = movedView ? 0 : ((this.camCornT || 0) + 1) % 3;
    if (this.camCornT === 0) {
      let hc = null;
      for (const [a, b] of CORNERS) {
        const q = _cQ.copy(want).addScaledVector(right, a).addScaledVector(_cUP, b);
        const h2 = this.camBlockHit(target, q);
        if (h2 !== null && (hc === null || h2 < hc)) hc = h2;
      }
      this.camCornHit = hc; this.camCornYaw = this.yaw; this.camCornPitch = this.pitch;
    }
    if (this.camCornHit != null && (hit === null || this.camCornHit < hit)) hit = this.camCornHit;
    // 柵の内でも前が見えるよう、寄せすぎず（自分の頭と重ならない）、寄せた分だけ高さも肩の辺りへ下げる
    // 壁がとても近い時（陣幕の内など）は 0.3 の床に負けて壁の向こうへ突き抜けないよう、hit 自体を超えない範囲に留める
    if (hit !== null) { const k = Math.max(0, Math.min(hit, hit - 0.02, Math.max(0.3, hit - 0.06))), y0 = want.y; want.lerpVectors(target, want, k); want.y = Math.min(want.y, y0 - (1 - k) * 0.5); }
    // 木の幹：カメラと自分の間に幹があれば、その手前まで寄せる（近くの幹は 0.5 秒おきに拾い直す）
    {
      const W = this.rt.world;
      this.trunkT = (this.trunkT || 0) - dt;
      if (this.trunkT <= 0) {
        this.trunkT = 0.5;
        const pts = W && W.treePoints, list = this.trunks || (this.trunks = []); list.length = 0;
        if (pts) for (const q of pts) if (Math.abs(q[0] - u.pos.x) < 16 && Math.abs(q[1] - u.pos.z) < 16) list.push(q);
        this.trunks = list;
      }
      if (this.trunks && this.trunks.length) {
        const ax = target.x, az = target.z, bx = want.x - ax, bz = want.z - az, L2 = bx * bx + bz * bz;
        if (L2 > 0.01) {
          const L = Math.sqrt(L2);
          let tMin = 1;
          for (const q of this.trunks) {
            const t = ((q[0] - ax) * bx + (q[1] - az) * bz) / L2;
            if (t <= 0.02 || t > 1.08) continue;
            const cx = ax + bx * Math.min(1, t) - q[0], cz = az + bz * Math.min(1, t) - q[1];
            if (cx * cx + cz * cz < 0.7 * 0.7) tMin = Math.min(tMin, t - 0.75 / L);
          }
          if (tMin < 1) want.lerpVectors(target, want, Math.max(0.15, tMin));
        }
      }
    }
    if (inRoom) nakaCamClamp(want);   // 部屋の壁・天井に埋もれない
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    // 走る・駆ける時はカメラが少し遅れてついて来る（重さと速さが画面に出る）
    const lagK = this.mounted && Math.abs(this.hspd || 0) > 6 ? 7 : running ? 9 : 14;
    this.camPos.lerp(want, Math.min(1, dt * lagK));
    if (inRoom) nakaCamClamp(this.camPos);
    { const h = this.camBlockHit(target, this.camPos); if (h !== null) this.camPos.lerpVectors(target, this.camPos, Math.max(0, h - 0.03)); }
    // 追従の遅れで、曲がり角の斜面や高い地面へ戻らないよう、そのコマの位置も直す。
    if (!inRoom && terrainCameraClamp(this.rt.world, target, this.camPos)) terrainBlocked = true;
    let look = _cLk.copy(target).addScaledVector(dir, 12 + ok * overH * 1.5).addScaledVector(right, side);
    // 開戦の引き：膝ほどの低い所から、向こうに構える敵の群れの方を見る（両軍が向き合う絵）。終われば自分の向きへ戻る
    if (pull > 0.01) {
      if (!this.introFoe) {
        let sx = 0, sz = 0, n = 0;
        for (const o of this.rt.army.units) if (o.alive && o.team !== u.team && !o.isStruct) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < 260) { sx += o.pos.x; sz += o.pos.z; n++; } }
        this.introFoe = n ? { x: sx / n, z: sz / n } : { x: u.pos.x + dir.x * 60, z: u.pos.z + dir.z * 60 };
      }
      const F = this.introFoe, W = this.rt.world;
      look.lerp(_cTmp.set(F.x, W.heightAt(F.x, F.z) + 2.5, F.z), pull * 0.5);
    } else this.introFoe = null;
    if (dk > 0) look.lerp(_cTmp.set(u.pos.x, u.pos.y + 0.3, u.pos.z), dk * 0.85);
    // 狙い定めた時は、自分と相手の間を見る（二人が画面の左右に収まる対峙の構図）
    this.lockK = (this.lockK || 0) + ((this.lock && this.lock.alive ? 1 : 0) - (this.lockK || 0)) * Math.min(1, dt * 3);
    if (this.lockK > 0.01 && this.lock) {
      const L = this.lock.pos, mid = _cTmp.set((u.pos.x + L.x) / 2, (u.pos.y + L.y) / 2 + 1.3 * bodySc, (u.pos.z + L.z) / 2);
      look.lerp(mid, 0.4 * this.lockK);
    }
    // 坂：上り坂では目線を少し上げ、下り坂では下げる（地面で画面の半分が塞がらないように）
    {
      const W = this.rt.world, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const sl = inRoom ? 0 : (groundAt(W, u.pos.x + fx * 8, u.pos.z + fz * 8, u.pos.y) - u.pos.y) / 8;
      this.slopeK = inRoom ? 0 : (this.slopeK || 0) + (Math.max(-0.5, Math.min(0.5, sl)) - (this.slopeK || 0)) * Math.min(1, dt * 2);
      look.y += this.slopeK * 12 * 0.6;
    }
    camera.position.copy(this.camPos);
    if (inRoom) nakaCamClamp(camera.position);
    if (this.camPush && this.camPush.t > 0) {
      this.camPush.t -= dt;
      const f = Math.max(0, this.camPush.t / 0.18);
      camera.position.x += this.camPush.x * f; camera.position.z += this.camPush.z * f;
    }
    if (this.camLean) {
      const L = this.camLean; L.t += dt;
      const q = L.t / L.dur;
      if (q >= 1) this.camLean = null;
      else { const f = q < 0.2 ? q / 0.2 : 1 - (q - 0.2) / 0.8, m = L.k * f * f * (1 - this.fpK * 0.7); camera.position.x += L.x * m; camera.position.z += L.z * m; }
    }
    if (e > 0) {
      const eye = this.eyePos(dt, dir);
      camera.position.lerp(eye, e);
      // 構えた時は目線を少し落とし、手元の構えが見えるように
      this.guardDip = (this.guardDip || 0) + ((this.guard ? 0.2 : 0) - (this.guardDip || 0)) * Math.min(1, dt * 8);
      _cTmp.copy(eye).addScaledVector(dir, 12); _cTmp.y -= 12 * this.guardDip;
      look.lerp(_cTmp, e);
    }
    // 三人称の歩み：走ると肩越しのカメラも足の運びに合わせて小さく上下・左右に揺れる（手持ちの撮影のように）
    // 馬上は鞍の弾み（駆けるほど大きく、蹄の拍子で）。画面の揺れを切った時・動きを減らす時は揺らさない
    // 歩きの揺れは S.shakeWalk で別に切れる（無ければ S.shake に従う）
    const calm = !(S.shakeWalk ?? S.shake) || reduceMotion();
    const sp = Math.hypot(u.vel.x, u.vel.z);
    // 動きを減らす時は、鞍の揺れも止める。
    const rideK = !(S.shakeWalk ?? S.shake) || reduceMotion() ? 0 : 1;
    let gaitRoll = 0;
    if (this.mounted && rideK > 0 && e < 0.5) {
      // 歩き方ごとの鞍の動き（拍子は rideMove の gaitPh＝一完歩で 1）：
      // 並足＝四拍でゆったり左右に揺れる・速歩＝二拍で上下に弾む・駆歩＝三拍の揺り木馬（前後に大きく揺れる）・襲歩＝速く低く、細かく突き上げる
      const k3 = (1 - e * 2) * rideK, hs = Math.abs(this.hspd || 0), ph = (this.gaitPh || 0) * Math.PI * 2;
      const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const wWalk = sm(0.2, 0.9, hs) * (1 - sm(2, 3.2, hs)), wTrot = sm(2, 3.2, hs) * (1 - sm(5.8, 7.2, hs));
      const wCant = sm(5.8, 7.2, hs) * (1 - sm(9.2, 10.4, hs)), wGal = sm(9.2, 10.4, hs);
      const sn = Math.sin(ph), ab = Math.abs(sn) - 0.64;
      const yy = (wWalk * Math.sin(ph * 2) * 0.014 + wTrot * Math.abs(Math.sin(ph * 2)) * 0.1 - wTrot * 0.064 + wCant * sn * 0.075 + wGal * (ab * 0.07 + Math.sin(ph * 4) * 0.01)) * k3;
      const pitchY = (wWalk * Math.sin(ph * 2 + 1) * 0.03 + wTrot * Math.sin(ph * 4) * 0.035 + wCant * Math.sin(ph + 1.3) * 0.22 + wGal * Math.sin(ph * 2 + 0.8) * 0.09) * k3;
      const sway = (wWalk * sn * 0.04 + wTrot * sn * 0.012 + wCant * sn * 0.022 + wGal * sn * 0.014) * k3;
      camera.position.y += yy; look.y += yy * 0.4 + pitchY;
      camera.position.addScaledVector(right, sway); look.addScaledVector(right, sway * 0.3);
      gaitRoll = (wWalk * sn * 0.01 + wTrot * Math.sin(ph * 2) * 0.004 + wCant * Math.sin(ph + 0.5) * 0.014 + wGal * sn * 0.007) * k3;
      // 襲歩では乗り手が鐙に立って身を低くする：カメラも少し低く、前へ詰める
      const fxz = Math.hypot(look.x - camera.position.x, look.z - camera.position.z) || 1;
      const fx = (look.x - camera.position.x) / fxz, fz = (look.z - camera.position.z) / fxz;
      camera.position.y -= wGal * 0.18 * (1 - e * 2);
      // 溜めと前のめり：蹴り出すと体が後ろに残り（カメラが遅れて引かれ、目線は前へ伏せる）、手綱を引くと体が前へ投げ出される（カメラが前へ突っ込み、下を向いて戻る）
      const sg = Math.max(-1.6, Math.min(1, (this.surge || 0) / 5)) * k3;
      if (sg > 0) { camera.position.x -= fx * sg * 0.45; camera.position.z -= fz * sg * 0.45; look.y -= sg * 0.35; }
      else if (sg < 0) { camera.position.x -= fx * sg * 0.5; camera.position.z -= fz * sg * 0.5; camera.position.y += sg * 0.12; look.y += sg * 0.6; }
    }
    if (!calm && e < 0.5) {
      const k3 = 1 - e * 2;
      if (this.mounted) {
        // 馬上は上（rideK）で揺らす
      } else if (sp > 0.6) {
        this.gaitT = (this.gaitT || 0) + dt * (sp > 5 ? 10.5 : 7.5);
        const a = Math.min(1, sp / 6) * (sp > 5 ? 0.045 : 0.018) * k3;
        camera.position.y += Math.sin(this.gaitT * 2) * a;
        camera.position.addScaledVector(right, Math.sin(this.gaitT) * a * 0.8);
      }
    }
    // 揺れ：毎フレームのでたらめな跳びではなく、なめらかな揺れ（重なった波）で、強いほど速く・大きく。少し傾きも入る
    // 倒れた後は揺らさない（揺れ・首の振られ・押しを止め、静かに上へ離れるだけ）
    if (!u.alive || reduceMotion() || !S.shake) { this.shake = 0; this.camPush = null; this.neckV = null; }
    this.shakeT = (this.shakeT || 0) + dt * (14 + this.shake * 30);
    let roll = 0;
    if (this.shake > 0.001) {
      const s = this.shake * (0.22 + this.shake * 0.3) * (1 - 0.5 * e);
      const t = this.shakeT;
      const n = (a, b) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.13 + b * 1.7) * 0.4;
      camera.position.addScaledVector(right, n(1.0, 0.3) * s);
      camera.position.y += n(1.27, 2.1) * s;
      look.addScaledVector(right, n(0.83, 4.2) * s * 0.6);
      look.y += n(1.53, 0.9) * s * 0.5;
      roll = n(0.71, 5.3) * s * 0.45;
    }
    // 打たれた時の首の振られ：打たれた方から外へ、顔が弾かれて戻る（一人称で強く。動きを減らす設定・揺れを切った時は出ない）
    if (this.camPush && this.camPush !== this.neckSeen) {
      this.neckSeen = this.camPush;
      if (!reduceMotion() && S.shake) {
        const pl = Math.hypot(this.camPush.x, this.camPush.z) || 1;
        const sd = (this.camPush.x * right.x + this.camPush.z * right.z) / pl;
        this.neckV = { y: sd * 0.9, p: 0.5, r: -sd * 0.7 };
      }
    }
    if (this.neckV) {
      const nv = this.neckV, k = Math.exp(-dt * 10);
      this.neck = this.neck || { y: 0, p: 0, r: 0 };
      // ばねで弾んで戻る
      for (const a of ['y', 'p', 'r']) { this.neck[a] += nv[a] * dt; nv[a] = nv[a] * k - this.neck[a] * dt * 90; this.neck[a] *= Math.exp(-dt * 6); }
      const sc = 0.5 + 0.5 * e, NK = this.neck;
      look.addScaledVector(right, NK.y * 12 * sc); look.y += NK.p * 6 * sc; roll += NK.r * sc;
      if (Math.abs(NK.y) + Math.abs(NK.p) + Math.abs(nv.y) + Math.abs(nv.p) < 1e-4) this.neckV = null;
    }
    // 騎馬に倒された：視点が地面近くまで沈み、起き上がるにつれて戻る（動きを減らす設定では沈みを浅く）
    if (this.knockT > 0 && !this.mounted) {
      const k = Math.min(1, this.knockT / 0.5) * (reduceMotion() ? 0.35 : 1);
      camera.position.y -= 0.9 * k; look.y -= 0.7 * k; roll += 0.12 * k;
    }
    // 見せ場の一枚（camShot。火縄の this.shot とは別）：低い所から見上げる数秒の絵。終われば元の視点へなめらかに戻る
    if (this.camShot && (this.aiming || this.lock || this.inCombatT > 0 || this.lookIdle < 0.2)) { this.camShot = null; this.shotZoom = 0; }
    if (this.camShot) {
      const sh = this.camShot;
      sh.t += dt;
      const W = this.rt.world, k = reduceMotion() ? 0 : Math.min(1, sh.t / 0.4, (sh.dur - sh.t) / 0.6);
      this.shotZoom = (sh.zoom || 0) * (k > 0 ? k : 0);
      if (sh.t >= sh.dur) { this.camShot = null; this.shotZoom = 0; }
      else if (k > 0) {
        const kk = k * k * (3 - 2 * k);
        const fx = typeof sh.from === 'function' ? sh.from() : sh.from, at = typeof sh.at === 'function' ? sh.at() : sh.at;
        // 撮る所はゆっくり横へ動く（手持ちで回り込むように）
        const drift = sh.t * (sh.drift || 0.6);
        const px = fx.x + Math.cos(sh.ang || 0) * drift, pz = fx.z + Math.sin(sh.ang || 0) * drift;
        camera.position.lerp(_cTmp.set(px, W.heightAt(px, pz) + (sh.h ?? 0.8), pz), kk);
        look.lerp(_cTmp.set(at.x, W.heightAt(at.x, at.z) + (sh.lookH ?? 2.2), at.z), kk);
      }
    }
    // 近くを騎馬の群れが駆けると、地の震えで視点が細かく震える（揺れを切った時・動きを減らす設定では出さない）
    const rumbleOn = u.alive && S.shake && !reduceMotion();
    const cr = rumbleOn ? (this.cavShake || 0) : 0;
    this.rumbleK = rumbleOn ? (this.rumbleK || 0) + (cr - (this.rumbleK || 0)) * Math.min(1, dt * 5) : 0;
    if (this.rumbleK > 0.02) {
      const t = this.shakeT * 1.7, a = this.rumbleK * 0.022;
      camera.position.y += (Math.sin(t * 2.3) * Math.sin(t * 1.37 + 1)) * a;
      look.y += Math.sin(t * 1.9 + 2) * a * 0.5;
    }
    // 開戦の引き・揺れ・見せ場を足した後にも地形を調べる。一人称と室内は従来の目線を使う。
    if (!inRoom && e < 0.5 && terrainCameraClamp(this.rt.world, target, camera.position)) terrainBlocked = true;
    // 地形補正・演出の後も壁の手前へ収める。開戦の引きや室内でも黒い壁を映さない。
    if (e < 0.5) {
      if (inRoom) nakaCamClamp(camera.position);
      const h = this.camBlockHit(target, camera.position);
      if (h !== null) camera.position.lerpVectors(target, camera.position, Math.max(0, h - 0.25 / Math.max(0.25, target.distanceTo(camera.position))));
    }
    this.terrainLookK = terrainBlocked ? 1 : (this.terrainLookK || 0) * Math.max(0, 1 - dt * 5);
    if (!inRoom && e < 0.5 && this.terrainLookK > 0.001) look.lerp(target, this.terrainLookK * (1 - e * 2) * 0.85);
    camera.lookAt(look);
    // 馬で曲がると体が内へ傾くように、カメラも傾ける（速いほど深く）
    if (this.mounted && rideK > 0) {
      const turn = angleDiff(this.prevYawCam ?? u.heading, u.heading) / Math.max(dt, 1e-3);
      this.leanCam = (this.leanCam || 0) + (Math.max(-1, Math.min(1, turn * 0.6)) * 0.065 * rideK * Math.min(1, Math.abs(this.hspd || 0) / 8) - (this.leanCam || 0)) * Math.min(1, dt * 4);
      roll += (this.leanCam + gaitRoll) * (1 - e);
    }
    if (!this.mounted || rideK === 0) this.leanCam = 0;
    this.prevYawCam = u.heading;
    if (e > 0 && this.fpRoll) roll += this.fpRoll * e;
    if (roll) camera.rotateZ(roll);
  }

  // 川・浅瀬の中にいるか（足音と蹄の音を水の音に替える）
  inWater() {
    const u = this.u, W = this.rt.world;
    return !NAKA.cur && W.inWaterAt(u.pos.x, u.pos.z, u.pos.y);
  }

  // 一人称の目の位置（ならし・歩みの揺れ・柵や塀へのめり込み止め）
  eyePos(dt, dir) {
    const u = this.u;
    const raw = this.eyeRaw(_cQ);
    // 足もとからのずれでならす（歩く速さで横に遅れない）。揺れを切った時は上下を強くならす
    const off = raw.sub(u.pos);
    const calm = !(S.shakeWalk ?? S.shake) || reduceMotion();
    if (!this.eyeOff) this.eyeOff = off.clone();
    else if (dt >= 0.5) this.eyeOff.copy(off);
    else {
      const kh = Math.min(1, dt * 14), kv = Math.min(1, dt * (calm ? 2.5 : 10));
      this.eyeOff.x += (off.x - this.eyeOff.x) * kh;
      this.eyeOff.z += (off.z - this.eyeOff.z) * kh;
      this.eyeOff.y += (off.y - this.eyeOff.y) * kv;
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // 馬上は目を少し高く・前へ（馬の頭が画面の下へ下がり、狙う相手が真ん中に見える）
    const fe = this.mounted ? 0.12 : 0.1;
    const eye = _cE.set(u.pos.x + this.eyeOff.x + fx * fe, u.pos.y + this.eyeOff.y + (this.mounted ? 0.16 : 0), u.pos.z + this.eyeOff.z + fz * fe);
    // 歩みの小さな上下（画面の揺れの設定を守る）。馬上は鞍の弾みがそのまま出るので足さない
    const sp = Math.hypot(u.vel.x, u.vel.z);
    if (!calm && !this.mounted && sp > 0.5) {
      this.bobT += dt * (sp > 5 ? 11 : 8);
      const ba = Math.min(1, sp / 3.7) * (sp > 5 ? 0.035 : 0.022);
      eye.y += Math.sin(this.bobT) * ba;
      // 左右の足に体重が移る揺れと、踏み出しの小さな傾き
      eye.x += -fz * Math.sin(this.bobT * 0.5) * ba * 0.7; eye.z += fx * Math.sin(this.bobT * 0.5) * ba * 0.7;
      this.fpRoll = Math.sin(this.bobT * 0.5) * ba * 0.12;
    } else this.fpRoll = calm ? 0 : (this.fpRoll || 0) * Math.exp(-dt * 6);
    // 柵・塀・建物へ目が入り込まないよう、体の芯から目の少し先までを調べて手前で止める
    const from = _cFr.set(u.pos.x, eye.y, u.pos.z);
    const ahead = _cAh.copy(eye).addScaledVector(dir, 0.3);
    const hit = this.camBlockHit(from, ahead);
    if (hit !== null) {
      const len = from.distanceTo(ahead);
      const d = Math.max(-0.2, len * hit - 0.3);
      eye.copy(from).addScaledVector(_cTmp.copy(ahead).sub(from).normalize(), d);
    }
    // 柵のすぐ内：馬防柵の上の横木（1.45m）がちょうど目の高さを塞ぐので、少し背を伸ばして横木の上の隙間から前を見る
    this.fenceT = (this.fenceT || 0) - dt;
    if (this.fenceT <= 0) {
      this.fenceT = 0.25;
      this.nearFence = false;
      if (!this.mounted) for (const st of this.rt.army.structs) {
        if (!st.alive || st.opened || !st.seg || !/柵/.test(st.name || '')) continue;
        const [ax, az, bx, bz] = st.seg, dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((eye.x - ax) * dx + (eye.z - az) * dz) / (dx * dx + dz * dz || 1)));
        const x = ax + dx * t, z = az + dz * t;
        if (Math.hypot(x - eye.x, z - eye.z) < 1.4 && (x - eye.x) * dir.x + (z - eye.z) * dir.z > 0 && Math.abs(eye.y - (this.rt.world.heightAt(x, z) + 1.45)) < 0.35) { this.nearFence = true; break; }
      }
    }
    this.fenceLift = (this.fenceLift || 0) + ((this.nearFence ? 0.2 : 0) - (this.fenceLift || 0)) * Math.min(1, dt * 4);
    eye.y += this.fenceLift;
    const g = (NAKA.cur ? u.pos.y : groundAt(this.rt.world, eye.x, eye.z, u.pos.y)) + 0.3;
    if (eye.y < g) eye.y = g;
    return eye;
  }
}
