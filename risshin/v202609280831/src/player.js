import * as THREE from 'three';
import { ITEMS, equipDef, ladderStep, canRide, myHorse, scenario } from './state.js';
import { angleDiff, weaponMesh, buildHorse, animateHorse, RIDE, coatOf, bloodLv } from './units.js';
import { distToPolyline } from './world.js';
import { POST, edgeDark } from './post.js';
import { sfx, deafen, setScene } from './audio.js';
import { S, DIFFICULTY, K, saveSettings } from './settings.js';
import { isTouch } from './touch.js';
import { setFpCut, setFpArm } from './humans.js';
const _fpS = new THREE.Vector3();

// 味方を透かす材質：元の材質ごとに三段（ディザで抜く。並べ替え不要で、重なっても乱れない）
const DITHER_A = [0.3, 0.5, 0.72];
const ditherCache = new WeakMap();
function ditherMat(m, lv) {
  if (m.userData.dither != null) return m;
  let a = ditherCache.get(m);
  if (!a) { a = []; ditherCache.set(m, a); }
  if (!a[lv]) {
    const f = m.clone();
    // 点描（alphaHash）は低い解像度でテレビの砂嵐のように見えるので、なめらかな半透明で透かす
    f.alphaHash = false; f.transparent = true; f.depthWrite = false; f.opacity = m.opacity * DITHER_A[lv];
    f.onBeforeCompile = m.onBeforeCompile; f.customProgramCacheKey = m.customProgramCacheKey;
    f.userData = { ...m.userData, dither: lv };
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
  face: '向き直れ', gather: '集まれ',
};
export const FORM_NAME = { line: '横陣', column: '縦陣', loose: '散開', yari: '槍衾' };
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
const FIRE_ITEM = { id: 'fire', label: '放て／やめ', min: 2 };
// 指の端末（携帯）は、号令の輪の字を丸の中の二字までに（字で景色を隠さない）
if (isTouch) {
  const SHORT = { attack: '突撃', focus: '狙え', hold: '待て', yari: '槍衾', retreat: '退け', move: '前進', follow: '続け', rally: '鼓舞' };
  for (const it of RADIAL) if (SHORT[it.id]) it.label = SHORT[it.id];
  FIRE_ITEM.label = '放て';
}

export function commandList(rank) {
  const base = [
    { k: '1', q: K('follow'), id: 'follow', label: 'ついて来い', desc: '自分の後ろに付いて動く' },
    { k: '2', q: K('hold'), id: 'hold', label: '待て', desc: 'その場で踏みとどまる' },
    { k: '3', q: K('attack'), id: 'attack', label: '突撃', desc: '近くの敵へ斬り込む' },
    { k: '4', q: K('retreat'), id: 'retreat', label: '退け', desc: '後ろへ下がって立て直す' },
    { k: '5', id: 'focus', label: '敵を狙え', desc: '照準の先の敵を集中して討つ' },
    { k: '0', id: 'gather', label: '集まれ', desc: '散った兵を自分のもとへ集め直す' },
  ];
  if (rank >= 2) {
    base.push({ k: '6', id: 'move', label: '前進', desc: '照準の先の地点へ進む' });
    base.push({ k: '7', id: 'yari', label: '槍衾', desc: '横一列で槍を揃え正面を固める' });
    base.push({ k: '8', id: 'fire', label: '射撃／停止', desc: '弓・鉄砲の射撃を切り替える' });
    base.push({ k: '9', id: 'form', label: '陣形', desc: '横陣→縦陣→散開' });
    base.push({ k: '-', id: 'face', label: '向き直れ', desc: '照準の方へ隊の正面を向ける（横を突かれた時）' });
  }
  return base;
}

const QUICK = { KeyZ: 'follow', KeyX: 'hold', KeyC: 'attack', KeyN: 'retreat' };
// 火縄銃の込め直しにかかる秒（止まっている時）
const GUN_RELOAD = 10;

export class Player {
  constructor(rt, spawn) {
    this.rt = rt;
    const G = rt.G;
    this.G = G;
    const army = rt.army;
    this.group = army.addGroup({ team: 0, faction: scenario().faction, noRout: true, order: 'hold', name: 'player' });
    const look = playerLook(G);
    this.u = army.addUnit(this.group, { type: 'player', x: spawn.x, z: spawn.z, heading: spawn.heading || 0, ...look });
    this.u.isPlayer = true;
    this.u.name = G.name;
    this.u.noHead = true;
    this.u.wpnKind = 'spear';
    this.hasKatana = G.owned.includes('katana');
    // 槍の拵えは持ち槍で変わる：数打・上質は素槍（一間半）、大身槍は長い穂、長柄は二間半
    {
      const sk = { spear2: 'omi', spear3: 'naga' }[G.equip.weapon] || 'su';
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
    if (this.hasBow) this.bowMesh = weaponMesh('bow');
    this.gunLoaded = true;     // 戦の始めは込めてある
    this.gunReload = 0;        // 込め直しの進み（0〜1）
    this.aiming = false;
    this.aimK = 0;             // 構えて狙う寄り具合（視野を狭める）
    this.shot = null;          // 火蓋を切ってから放つまで
    this.draw = 0;             // 弓を引き絞った長さ（秒）
    const vit = G.stats.vit - 1;
    this.u.maxHp = this.u.hp = 100 + vit * 10;
    this.maxSta = 100 + vit * 12;
    this.sta = this.maxSta;
    this.def = equipDef(G);
    this.yaw = spawn.heading || 0;
    this.pitch = -0.12;
    this.weapon = 'spear';
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
    this.movedAcc = 0;
    // 馬（足軽大将から）。始めは乗っている
    this.step = ladderStep(G);
    this.canRide = canRide(G);
    this.mounted = false;
    this.hspd = 0;
    if (this.canRide) {
      const H = myHorse(G);
      this.horseName = H.name;
      this.horseSpeed = H.speed;
      this.horseMax = Math.round((150 + 20 * (this.step - 2)) * H.hpMul);
      this.horseHp = this.horseMax;
      this.maxBreath = Math.round(100 * H.breathMul); this.breath = this.maxBreath;
      this.yariResist = H.id === 'iwane' ? 0.6 : 1;
      this.horse = buildHorse(horseStyle(this.step, H.coat, H.kind));
      army.setMounted(this.u, true, this.horse);
      this.mounted = true;
      this.loose = null;       // 降りたときの馬（その場で待つ・口笛で来る・逃げる）
    }
  }

  // ---------------- 馬の乗り降り ----------------
  toggleMount() {
    const rt = this.rt, u = this.u, army = rt.army;
    if (!this.canRide || this.mountT > 0) return;
    if (this.mounted) {
      // 降りる：馬はその場で待つ
      army.setMounted(u, false);
      const side = { x: -Math.cos(u.heading) * 1.3, z: Math.sin(u.heading) * 1.3 };
      this.loose = { x: u.pos.x + side.x, z: u.pos.z + side.z, heading: u.heading, spd: 0, mode: 'wait' };
      this.horse.position.set(this.loose.x, rt.world.heightAt(this.loose.x, this.loose.z), this.loose.z);
      this.horse.rotation.set(0, u.heading, 0);
      rt.scene.add(this.horse);
      this.mounted = false; this.hspd = 0; this.mountT = 0.35;
      u.pos.x -= side.x * 0.4; u.pos.z -= side.z * 0.4;
      sfx('step', 1.2);
      rt.hint('dismount');
      return;
    }
    const L = this.loose;
    // すぐそばの空馬・置いた馬：R でも手綱を取って乗れる（今の馬より近ければ）
    const o = this.takeO;
    if (o && (!L || L.mode === 'fled' || Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < Math.hypot(L.x - u.pos.x, L.z - u.pos.z))) {
      if (o.kept) this.takeHorse(o); else if (!this.catching) { this.catching = { o, t: 0 }; rt.hud.flash('手綱を取っている…（離れると止める）', 'dim'); }
      return;
    }
    if (L && L.mode === 'fled' && this.spoil) { rt.hud.flash(`${this.horseName}は逃げ去った`, 'dim'); return; }
    if (!L || L.mode === 'fled') { rt.hud.flash(L && L.backAt ? `${this.horseName}は戻る途中（あと${Math.max(1, Math.ceil(L.backAt - rt.t))}秒）` : `${this.horseName}がいない`, 'dim'); return; }
    const d = Math.hypot(L.x - u.pos.x, L.z - u.pos.z);
    if (d < 3.2) {
      // 乗る
      rt.scene.remove(this.horse);
      u.heading = L.heading;
      u.pos.x = L.x; u.pos.z = L.z;
      army.setMounted(u, true, this.horse);
      this.mounted = true; this.loose = null; this.mountT = 0.5; this.hspd = 0;
      sfx('neigh', 0.7);
    } else if (this.spoil) {
      // 戦利の馬は口笛を知らない
      rt.hud.flash(`${this.horseName}は口笛では来ない（そばへ寄って乗る）`, 'dim');
    } else {
      // 口笛で呼ぶ
      L.mode = 'come';
      sfx('flute', 0.4);
      rt.hud.flash(`口笛で${this.horseName}を呼んだ`, 'dim');
    }
  }

  horseHurt(n) {
    if (!this.mounted) return;
    this.horseHp -= n;
    if (this.horseHp <= this.horseMax * 0.3 && !this.horseWarned) { this.horseWarned = true; this.rt.bark(`${this.horseName}が弱っている！`, true); }
    if (this.horseHp <= 0) { this.horseHp = 0; this.fall(); }
  }

  // 馬上の動き：並足・駆け足（Shift）・手綱を引く（Space）。向きは馬が少しずつ変える
  rideMove(dt, input, iz, mx, mz, ml) {
    const u = this.u, rt = this.rt, army = rt.army;
    const locked = this.mountT > 0;
    const gallop = this.running && this.breath > 5 && iz > 0 && !this.guard;
    let target = locked ? 0 : iz > 0 ? (gallop ? 11.5 * (this.horseSpeed || 1) : 5.4) : iz < 0 ? -1.8 : ml > 0 ? 2.2 : 0;
    if (this.guard && target > 3) target = 3;
    if (!locked && ml > 0 && iz >= 0) {
      const maxTurn = (this.hspd > 8 ? 1.5 : 2.7) * dt;
      const d = angleDiff(u.heading, Math.atan2(mx, mz));
      u.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
    const acc = target > this.hspd ? (target > 6 ? 1.8 : 3) : 4.5;
    this.hspd += (target - this.hspd) * Math.min(1, dt * acc);
    // 手綱を引く：竿立ちで急に止まる（一瞬だけ攻撃が当たらない）
    this.dodgeT -= dt; this.iframe -= dt;
    if (input.pressed('Space') && !locked) {
      if (this.breath >= 15) {
        this.breath -= 15; this.hspd *= 0.2; this.iframe = 0.35; this.dodgeT = 0.35;
        this.horse.userData.horse.rear = 0.7;
        sfx('neigh', 0.8);
        rt.tutMark('dodge');
      } else rt.hud.flash('馬の息が上がっている（並足で少し休ませる）', 'dim');
    }
    if (this.hspd > 7) { this.breath -= 10 * dt; rt.tutMark('run'); }
    else this.breath = Math.min(this.maxBreath, this.breath + 14 * dt);
    this.breath = Math.max(0, this.breath);
    // 馬の息が上がると、荒い鼻息が聞こえる（息が戻るほど間遠に）
    if (this.breath < this.maxBreath * 0.3) {
      this.snortT = (this.snortT || 0) - dt;
      if (this.snortT <= 0) { this.snortT = 1.4 + this.breath / this.maxBreath * 6 + Math.random() * 0.8; sfx('snort', 0.9 - this.breath / this.maxBreath); }
    }
    // 気力は馬上では並足の分だけ戻る
    this.staDelay -= dt;
    if (this.staDelay <= 0) this.sta = Math.min(this.maxSta, this.sta + (this.guard ? 5 : 18) * dt);
    const vx = Math.sin(u.heading) * this.hspd, vz = Math.cos(u.heading) * this.hspd;
    u.pos.x += vx * dt; u.pos.z += vz * dt;
    if (army.bodies) army.bodies(u);   // 馬上でも兵の体に重ならない
    army.collide(u);
    const W = rt.world.def.water;
    if (W && u.pos.x > W.x - 1) u.pos.x = W.x - 1;
    u.pos.x = Math.max(-176, Math.min(176, u.pos.x));
    u.pos.z = Math.max(-176, Math.min(176, u.pos.z));
    u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    u.vel.x = vx; u.vel.z = vz;
    const sp = Math.abs(this.hspd);
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
    // 駆けていれば、前の敵を蹴散らす（槍衾には止められる）
    if (sp > 6) {
      for (const h of army.enemiesInArc(u.pos, u.heading, 1.9, 0.75, u.team)) {
        const t = h.u;
        if (t.isStruct || (t.__trampleT || 0) > army.time) continue;
        const g = t.group;
        const facing = (Math.sin(t.heading) * (u.pos.x - t.pos.x) + Math.cos(t.heading) * (u.pos.z - t.pos.z)) / (h.d || 1);
        if (g && g.formation === 'yari' && facing > 0.3) {
          this.horseHurt(30 * (this.yariResist || 1));
          this.hspd = 0;
          if (this.horse) this.horse.userData.horse.rear = 0.7;
          if ((this.yariWarnT || -99) + 6 < rt.t) { this.yariWarnT = rt.t; rt.bark('槍衾に阻まれた！　横か後ろへ回れ', true); }
          break;
        }
        t.__trampleT = army.time + 1.2;
        // 蹴散らした手応え：馬が一瞬沈み、時がわずかに止まる
        rt.game.hitstop = Math.max(rt.game.hitstop || 0, 0.05);
        if (!S.reduceMotion) this.pitch -= 0.02;
        army.damage(t, 6 + sp * 0.8, u, { pierce: true });
        t.stagger = Math.max(t.stagger || 0, 0.8);
        this.hspd *= 0.82;
        this.addShake(0.08);
      }
    }
    // しばらく視点を動かさなければ、カメラが馬の後ろへ回り込む
    if (S.autoCam && !this.lock && this.lookIdle > 1 && sp > 1) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 1.5);
  }

  // 落馬：馬が倒れる・逃げる
  fall() {
    const rt = this.rt, u = this.u;
    this.toggleMount();
    this.mountT = 0;
    const L = this.loose;
    // 戦利の馬は逃げたら戻らない
    L.mode = 'flee'; L.backAt = this.spoil ? Infinity : rt.t + 40;
    this.iframe = 0.6; this.guardBroken = 1.0;
    u.hp = Math.max(1, u.hp - 8);
    this.addShake(0.35);
    sfx('neigh', 1);
    rt.bark(this.spoil ? `落馬！　${this.horseName}は逃げ去った` : `落馬！　${this.horseName}が逃げた（しばらくすると戻る）`, true);
  }

  updateLoose(dt) {
    const L = this.loose;
    if (!L) return;
    const rt = this.rt, u = this.u;
    let want = null, speed = 0;
    if (L.mode === 'come') {
      const d = Math.hypot(u.pos.x - L.x, u.pos.z - L.z);
      if (d > 2.4) { want = Math.atan2(u.pos.x - L.x, u.pos.z - L.z); speed = d > 8 ? 9 : 4; } else L.mode = 'wait';
    } else if (L.mode === 'flee') {
      want = L.heading; speed = 9;
      L.fleeT = (L.fleeT || 0) + dt;
      if (L.fleeT > 3) { L.mode = 'fled'; this.horse.visible = false; }
    } else if (L.mode === 'fled' && rt.t > L.backAt) {
      // 戻ってくる（体力は半分）
      this.horseHp = Math.round(this.horseMax * 0.5);
      L.mode = 'come'; L.fleeT = 0;
      const a = Math.random() * Math.PI * 2;
      L.x = u.pos.x + Math.sin(a) * 25; L.z = u.pos.z + Math.cos(a) * 25;
      this.horse.visible = true;
      rt.bark(`${this.horseName}が戻ってきた（R で乗る）`);
    }
    if (want !== null) L.heading += angleDiff(L.heading, want) * Math.min(1, dt * 4);
    L.spd += (speed - L.spd) * Math.min(1, dt * 2.5);
    L.x += Math.sin(L.heading) * L.spd * dt; L.z += Math.cos(L.heading) * L.spd * dt;
    L.x = Math.max(-176, Math.min(176, L.x)); L.z = Math.max(-176, Math.min(176, L.z));
    this.horse.position.set(L.x, rt.world.heightAt(L.x, L.z), L.z);
    this.horse.rotation.y = L.heading;
    animateHorse(this.horse, dt, L.spd);
  }

  // ---------------- 戦利の馬（討たれた騎馬武者の空馬を捕らえて乗る） ----------------
  // 今の馬の中身をまとめる・戻す（自分の馬と戦利の馬を乗り換えるため）
  packHorse() {
    return { horse: this.horse, name: this.horseName, speed: this.horseSpeed, max: this.horseMax, hp: this.horseHp, maxBreath: this.maxBreath, breath: this.breath, yariResist: this.yariResist, warned: this.horseWarned, spoil: this.spoil || null };
  }
  unpackHorse(s) {
    this.horse = s.horse; this.horseName = s.name; this.horseSpeed = s.speed; this.horseMax = s.max; this.horseHp = s.hp;
    this.maxBreath = s.maxBreath; this.breath = s.breath; this.yariResist = s.yariResist; this.horseWarned = s.warned; this.spoil = s.spoil;
  }

  // 徒歩の時、近くの空馬に「取る」の札を出す。E 長押し（R でも）で手綱を取って乗る
  updateTake(dt) {
    const rt = this.rt, u = this.u, L = rt.army.looseHorses;
    let best = null, bd = 3.4;
    if (!this.mounted && u.alive && L) {
      for (const o of L) {
        if (!o.from || !o.h.parent) continue;
        const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
    }
    // 主を失った空馬が近く（15m）にいる事を、一戦に一度だけ知らせる（捕らえて乗れる事が分かるように）
    if (!this.looseNoted && !this.mounted && u.alive && L && L.some((o) => o.from && !o.kept && o.h.parent && Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < 15)) {
      this.looseNoted = true;
      rt.bark('主を失った馬がいる。そばへ寄れば手綱を取って乗れる');
    }
    if (best !== this.takeO) {
      rt.uninteract('horse-take');
      this.takeO = best;
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
      const behind = (Math.sin(o.heading) * dx + Math.cos(o.heading) * dz) / d < -0.45;
      const easy = o.calm || (behind && Math.hypot(u.vel.x, u.vel.z) < 4.2);
      const it = rt.interacts.find((i) => i.id === 'horse-take');
      if (it && rt.holdId !== 'horse-take') it.hold = easy ? 1.0 : 1.5;
      // 手綱を取っている間は、馬がこちらを向いて首を振り、逃げない
      if (rt.holdId === 'horse-take') { o.held = 0.25; u.heading += angleDiff(u.heading, Math.atan2(-dx, -dz)) * Math.min(1, dt * 6); }
    }
    // R で始めた手綱取り（タッチの「乗る」も同じ）
    const c = this.catching;
    if (c) {
      const q = c.o.h.position;
      if (this.mounted || !u.alive || !c.o.h.parent || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 3.4) this.catching = null;
      else {
        c.t += dt; c.o.held = 0.25;
        u.heading += angleDiff(u.heading, Math.atan2(q.x - u.pos.x, q.z - u.pos.z)) * Math.min(1, dt * 6);
        if (c.t >= (c.o.calm ? 1.0 : 1.5)) { this.catching = null; this.takeHorse(c.o); }
      }
    }
  }

  // 空馬に乗る。元の馬具・速さ・体力のまま。自分の馬（や前の戦利の馬）はその場に置いておく
  takeHorse(o) {
    const rt = this.rt, u = this.u, army = rt.army;
    if (this.mounted || !o.h.parent || !u.alive) return;
    rt.uninteract('horse-take'); this.takeO = null; this.catching = null;
    const LH = army.looseHorses;
    const i = LH.indexOf(o);
    if (i >= 0) LH.splice(i, 1);
    // 今の馬を置く：待っている馬は空馬の列に入れて、また乗れるようにする。逃げ去った戦利の馬は消す
    if (this.horse && this.loose) {
      const L = this.loose;
      if (L.mode !== 'fled') {
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
      this.unpackHorse({ horse: o.h, name: f.team !== u.team ? '分捕り馬' : '借り馬', speed: f.speed, max: f.hp, hp: f.hp, maxBreath: 100, breath: 70, yariResist: 1, warned: false, spoil: { who, team: f.team } });
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

  addShake(v) { if (S.shake) this.shake = Math.min(0.5, this.shake + v); }

  // 敵の攻撃を受けたとき（受け流し・防御・回避・具足）
  takeDamage(amount, src) {
    if (this.iframe > 0) return 0;
    const u = this.u;
    // 鉄砲の弾：構えでは受けられず、一発で体力の大半を持っていかれる。しばらくよろめき、足が重くなる（出血）
    const gunHit = u.hitKind === 'gun'; u.hitKind = null;
    if (gunHit) return this.takeBullet(amount, src);
    const hud = this.rt.hud;
    if (src && !src.isStruct) {
      const dx = src.pos.x - u.pos.x, dz = src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      hud.damageFrom(Math.atan2(dx, dz) - this.yaw, amount);
      // 何にやられたかを覚えておく（倒れた時に一行で伝える）
      this.lastHit = { type: src.type, name: src.name || null, mounted: !!src.mounted, back: dot < -0.35, side: Math.abs(dot) <= 0.35, ranged: !!(src.type === 'gun' || src.type === 'bow') && d > 6, t: this.rt.t };
      // 打たれた向きへカメラが一瞬押される（打った相手から離れる向き）
      if (!S.reduceMotion && S.shake) { const k = Math.min(0.14, 0.04 + amount * 0.006); this.camPush = { x: -dx / d * k, z: -dz / d * k, t: 0.18 }; }
      if (dot < -0.35 && Math.random() < 0.35 && (this.backWarnT ?? -99) + 10 < this.rt.t) { this.backWarnT = this.rt.t; this.rt.bark('後ろだ！', true); }
      if (this.guard && this.sta > 0 && dot > 0.25) {
        // 構えた直後なら受け流し（相手の体勢を崩し、反撃の好機）。打刀は猶予が長い
        // 囲まれている時（u.mobbed）は、受け流しの間が半分・構えの減りが倍（四方からの槍に受けが追いつかない）
        if (this.guardT < (this.weapon === 'sword' ? 0.3 : 0.22) * (u.mobbed ? 0.5 : 1)) {
          this.rt.stats.parries++;
          this.rt.tutMark('parry');
          sfx('parry', 1); sfx('kin', 1.2);   // 高く澄んだ鋼の音を重ねる
          // 受け流しの手応え：刃が弾き合う一瞬の止めと小さな揺れ、視野がわずかに開く
          this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, 0.07);
          this.addShake(0.09);
          if (!S.reduceMotion) this.fovKick = 1.8;
          src.stagger = 1.1; src.atk = null; src.cd = 1.3;
          this.counterT = 1.3;
          this.rt.game.slowmo = 0.35;
          this.sta = Math.min(this.maxSta, this.sta + 10);
          hud.flash('受け流し', 'gold');
          this.rt.hint('counter');
          return 0;
        }
        this.sta -= amount * 1.3 * (u.mobbed ? 2 : 1);
        this.staDelay = 0.8;
        this.rt.stats.blocks++;
        sfx('block', 1);
        hud.hurt(0.1);
        this.addShake(0.05);
        if (this.sta <= 0) {
          this.sta = 0; this.guardBroken = 1.1;
          hud.flash('構えが崩れた', 'red');
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
    if (back) mult *= this.u.mobbed ? 1.6 : 1.25;
    mult = Math.min(this.u.mobbed ? 2.0 : 1.6, mult);
    let taken = amount * mult * (1 - this.def) * this.D.taken;
    // 乱戦で一息に（1秒に）三本より多く浴びた時だけ、四本目から少し浅手に（難しさ「難」では緩めない）
    {
      const now = rt.t;
      this.recentHits = (this.recentHits || []).filter((x) => now - x < 1);
      if (this.recentHits.length >= 3 && rt.D !== DIFFICULTY.hard && !this.u.mobbed) taken *= 0.8;
      this.recentHits.push(now);
    }
    this.feelHit(taken, src, { back, cav });
    // 馬上では、傷の一部を馬が受ける
    if (this.mounted) { this.horseHurt(taken * 0.5); taken *= 0.65; }
    return taken;
  }

  // 弾を食らった：体力の六割ほど（具足で少し減る）。よろめき・構えは崩れ、八秒ほど足が重い（gunHurtT）
  takeBullet(amount, src) {
    const u = this.u, rt = this.rt;
    this.inCombatT = 4;
    // 戦ごとに弱めた鉄砲（u.dmg を下げた物）も、重さは大きくは変えない（0.85〜1.15 倍）
    const k = Math.max(0.85, Math.min(1.15, (src && src.dmg ? src.dmg : 34) / 34));
    let taken = u.maxHp * 0.6 * k * (0.9 + Math.random() * 0.2) * (1 - this.def * 0.5) * this.D.taken;
    if (this.lastHit) this.lastHit.ranged = true;
    this.gunHurtT = 8;
    this.staggerT = Math.max(this.staggerT || 0, 1.1); this.knockT = Math.max(this.knockT || 0, 0.5);
    this.guardBroken = Math.max(this.guardBroken || 0, 1.0);
    // 鉄砲に当たった時は特に重く：耳が強く遠のいて耳鳴りが残り、視界の端が暗くすぼまる（動きを減らす設定では暗みだけ弱く）
    deafen(0.95);
    POST.dark = Math.max(POST.dark || 0, S.reduceMotion ? 0.5 : 1);
    this.addShake(0.2);
    this.feelHit(Math.max(taken, 30), src, { back: false, cav: false });
    rt.hud.flash('撃たれた', 'red');
    if (this.mounted) { this.horseHurt(taken * 0.4); taken *= 0.75; }
    return taken;
  }

  // 打たれた時の手応え：一瞬の止め・よろめき・画面・音・振動。重い一撃（侍・武将・騎馬・背後）ほど強い
  feelHit(taken, src, o = {}) {
    const rt = this.rt, hud = rt.hud, u = this.u;
    const w = Math.max(0.25, Math.min(1, taken / 22 + (o.cav ? 0.35 : 0) + (o.back ? 0.15 : 0)));
    const heavy = w > 0.6;
    const calm = S.reduceMotion;
    // ① 一瞬の止め（0.06〜0.1 秒）
    rt.game.hitstop = Math.max(rt.game.hitstop || 0, 0.05 + 0.05 * w);
    // ② よろめき：打たれた向きへ体が押される。槍の突きは半歩下がり、刀の斬りは体がねじれ、騎馬の突きは倒される
    let dx = 0, dz = 0;
    if (src && !src.isStruct && src.pos) { dx = u.pos.x - src.pos.x; dz = u.pos.z - src.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
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
    this.fovKick = -(2.5 + 5 * w);
    // 白く飛ぶのは一瞬だけ：続けて打たれても重ねない（乱戦で画面が白いままにならないように）
    if (!calm && heavy && (POST.exp || 1) < 1.15 && !(this.flashT > rt.t)) { this.flashT = rt.t + 1.5; POST.exp = (POST.exp || 1) + 0.15 + 0.2 * w; }
    // ④ 音：鈍い打撃・具足の鳴り・自分のうめき・重い時は耳鳴り
    sfx('hit', 0.8 + 0.7 * w); sfx(heavy ? 'yoroi' : 'kozane', 0.5 + 0.5 * w);
    if (heavy || Math.random() < 0.5) sfx('umeki', 0.4 + 0.5 * w);
    if (heavy) deafen(0.25 + 0.45 * w);
    // ⑤ 振動（ゲームパッド・スマホ）
    rt.game.vibrate(0.35 + 0.65 * w, Math.round(80 + 170 * w));
    rt.hint('guard');
  }

  update(dt, input) {
    const u = this.u;
    if (!u.alive) return;
    // よろめき・ねじれの戻り
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.knockT > 0) this.knockT -= dt;
    if (this.gunHurtT > 0) this.gunHurtT -= dt;
    if (this.twist) { const k = Math.min(1, dt * 9); this.yaw += this.twist * k * 0.5; this.twist *= (1 - k); if (Math.abs(this.twist) < 0.002) this.twist = 0; }
    const rt = this.rt;
    const army = rt.army;
    this.time = (this.time || 0) + dt;
    this.comboHitT = (this.comboHitT || 0) - dt;
    if (this.comboHitT <= 0) this.hitChain = 0;
    // ---- 視点 ----
    const inv = S.invertY ? -1 : 1;
    // マウスの平滑化
    let mdx = input.dx, mdy = input.dy;
    if (S.smooth) { this.sdx += (mdx - this.sdx) * 0.5; this.sdy += (mdy - this.sdy) * 0.5; mdx = this.sdx; mdy = this.sdy; }
    if (this.radial) { mdx = 0; mdy = 0; }
    this.yaw -= mdx * 0.0024 * S.sens;
    this.pitch = Math.max(-0.95, Math.min(0.55, this.pitch - mdy * 0.0022 * S.sens * inv));
    this.lookIdle = Math.abs(input.dx) + Math.abs(input.dy) > 0.5 ? 0 : this.lookIdle + dt;
    // ホイール：狙い定め中は相手を左右に切り替え、ふだんは視点の距離
    if (input.wheel && this.lock) {
      this.wheelAcc = (this.wheelAcc || 0) + input.wheel;
      if (Math.abs(this.wheelAcc) > 60) { this.switchLock(Math.sign(this.wheelAcc)); this.wheelAcc = 0; }
    } else if (input.wheel && !this.radial) this.zoom = Math.max(-1.6, Math.min(3.5, this.zoom + input.wheel * 0.0025));
    // [ ] で視点の感度をその場で変える
    if (input.pressed('BracketLeft')) { S.sens = Math.max(0.3, +(S.sens - 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    if (input.pressed('BracketRight')) { S.sens = Math.min(2.5, +(S.sens + 0.1).toFixed(2)); rt.hud.flash(`視点の感度 ${S.sens.toFixed(1)}`, 'dim'); }
    // ---- 狙い定め（ロックオン） ----
    if (input.pressed('KeyQ') || input.lockPressed) {
      if (this.lock) { this.lock = null; sfx('ui'); }
      else { this.lock = this.aimEnemy(26); if (this.lock) sfx('ui'); else rt.hud.flash('狙える敵がいない', 'dim'); }
    }
    if (this.lock && (!this.lock.alive || this.lock.fleeing || Math.hypot(this.lock.pos.x - u.pos.x, this.lock.pos.z - u.pos.z) > 32)) {
      const prev = this.lock;
      this.lock = null;
      // 倒した相手のすぐ近くに別の敵がいれば乗り換える
      if (!prev.alive) this.lock = army.nearestEnemy(u, 7, (o) => !o.fleeing && o.type !== 'dummy');
    }
    if (this.lock) {
      const want = Math.atan2(this.lock.pos.x - u.pos.x, this.lock.pos.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 7);
      this.pitch += (-0.2 - this.pitch) * Math.min(1, dt * 3);
    }
    if (input.pressed('KeyT')) { this.shoulder *= -1; sfx('ui'); }
    // V：短く押すと視点を回す（三人称の近い・普通・遠い、一人称）。長く押している間は「大将の目」で高くから見渡す（身分が上がるほど高く）
    if (input.pressed('KeyV')) this.vHeld = 0;
    if (this.vHeld != null) {
      if (input.key('KeyV')) { this.vHeld += dt; this.overHold = this.vHeld > 0.35; }
      else { if (this.vHeld <= 0.35) this.toggleView(); this.vHeld = null; this.overHold = false; }
    }
    this.showSquad = input.key('AltLeft') || input.key('AltRight');
    // ---- 号令・操作 ----
    const hasSquad = rt.squad.length > 0;
    // Tab：短く押すと指揮パネル、長押しで号令の輪（マウスで方向を選び、放して決める）
    if (hasSquad) {
      if (input.pressed('Tab')) { this.tabT = 0; this.radialVec = { x: 0, y: 0 }; this.radialSel = -1; }
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
            this.radialSel = it.min && this.G.rank < it.min ? -1 : i;
          } else this.radialSel = -1;
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
      if (this.cmdOpenT > 6) this.cmdOpen = false;
      for (const c of commandList(this.G.rank)) if (input.pressed(c.k === '-' ? 'Minus' : 'Digit' + c.k)) { this.command(c.id); this.cmdOpen = false; }
      if (input.pressed('KeyG')) { this.cycleGroup(); this.cmdOpenT = 0; }
    } else {
      if (input.pressed('Digit1') && this.weapon !== 'spear') this.switchWeapon('spear');
      if (input.pressed('Digit2') && this.hasKatana && this.weapon !== 'sword') this.switchWeapon('sword');
      if (input.pressed('Digit3') && this.weapon !== 'gun') { if (this.hasGun) this.switchWeapon('gun'); else rt.hud.flash('火縄銃を持っていない（城下の問屋で買える）', 'dim'); }
      if (input.pressed('Digit4') && this.weapon !== 'bow') { if (this.hasBow) this.switchWeapon('bow'); else rt.hud.flash('弓を持っていない（城下の問屋で買える）', 'dim'); }
      // 次の武器へ（触る端末の持ち替え釦から送る）
      if (input.pressed('WeaponNext')) { const L = this.weaponList(); this.switchWeapon(L[(L.indexOf(this.weapon) + 1) % L.length]); }
    }
    if (hasSquad) for (const [k, id] of Object.entries(QUICK)) if (input.pressed(k)) this.command(id);
    if (input.quickCmd && hasSquad) this.command(input.quickCmd);
    if (input.pressed('KeyF')) this.rally();
    if (input.pressed('KeyE')) rt.interact();
    if (input.pressed('KeyR')) this.toggleMount();
    this.mountT = (this.mountT || 0) - dt;
    this.updateLoose(dt);
    this.updateTake(dt);

    // ---- 移動 ----
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let ix = 0, iz = 0;
    if (input.key('KeyW')) iz += 1;
    if (input.key('KeyS')) iz -= 1;
    if (input.key('KeyD')) ix += 1;
    if (input.key('KeyA')) ix -= 1;
    if (input.axis && Math.hypot(input.axis.x, input.axis.y) > 0.18) { ix = input.axis.x; iz = -input.axis.y; }
    let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const mlen = Math.hypot(mx, mz);
    const ml = Math.min(1, mlen);
    if (mlen > 0) { mx /= mlen; mz /= mlen; }
    this.guardBroken -= dt;
    if (S.guardToggle && input.rightPressed) this.guardOn = !this.guardOn;
    const rightHeld = S.guardToggle ? this.guardOn : input.right;
    const ranged = this.weapon === 'gun' || this.weapon === 'bow';
    this.aiming = ranged && rightHeld && !this.mounted;
    const wantGuard = !ranged && rightHeld && this.sta > 0 && this.guardBroken <= 0;
    if (wantGuard && !this.guard) { this.guardT = 0; sfx('kozane', 0.45); }   // 構える時の具足の擦れる音
    this.guard = wantGuard;
    if (this.guard) this.guardT += dt;
    u.guard = this.guard;
    // W を素早く二度押しでも走る
    if (input.pressed('KeyW')) { if (this.lastW && this.time - this.lastW < 0.3) this.dblRun = true; this.lastW = this.time; }
    if (!input.key('KeyW')) this.dblRun = false;
    const shift = input.key('ShiftLeft') || input.key('ShiftRight') || input.runHeld || this.dblRun;
    if (S.runToggle) {
      if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) this.running = !this.running;
      if (ml === 0) this.running = false;
    } else this.running = shift;
    if (this.mounted) this.rideMove(dt, input, iz, mx, mz, ml);
    else {
      const canRun = this.running && this.sta > 5 && ml > 0 && !this.guard && !this.aiming && !(this.draw > 0);
      // よろめいている間は足が思うように出ない（騎馬に倒された時はほとんど動けない）
      // 撃たれた後しばらくは足が重い（走れても遅い。gunHurtT が減るにつれ戻る）
      const shot = this.gunHurtT > 0 ? 0.55 + 0.45 * (1 - this.gunHurtT / 8) : 1;
      const speed = (this.guard || this.aiming || this.draw > 0 ? 2.0 : canRun ? 6.4 : 3.7) * ml * shot * (this.knockT > 0 ? 0.1 : this.staggerT > 0 ? 0.45 : 1);
      this.staDelay -= dt;
      if (canRun) { this.sta -= 11 * this.heavy * dt; this.staDelay = 0.4; rt.tutMark('run'); }
      else if (this.staDelay <= 0) this.sta += (this.guard ? 5 : 22) * dt;
      this.sta = Math.max(0, Math.min(this.maxSta, this.sta));
      // 回避
      this.dodgeT -= dt; this.iframe -= dt;
      if (input.pressed('Space') && this.sta >= 20 && this.dodgeT <= -0.3) {
        this.sta -= 20; this.staDelay = 0.6;
        this.dodgeT = 0.32; this.iframe = 0.3;
        rt.tutMark('dodge');
        this.dodgeDir = ml > 0 ? { x: mx, z: mz } : { x: -fx, z: -fz };
        sfx('step', 1.4);
      } else if (input.pressed('Space') && this.sta < 20) rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      let tvx = mx * speed, tvz = mz * speed;
      if (this.pending) { tvx *= 0.25; tvz *= 0.25; }
      // 加減速をなめらかに。具足が重いほど出足と止まりが遅い（走りへの出足はさらに遅い）
      const heavy = Math.max(0, Math.min(0.5, this.def || 0));
      const tsp = Math.hypot(tvx, tvz), csp = Math.hypot(this.vel.x, this.vel.z);
      const acc = Math.min(1, dt * (ml > 0 ? (tsp > csp + 1 && tsp > 5 ? 6.5 : 10) - heavy * 6 : 12 - heavy * 6));
      this.vel.x += (tvx - this.vel.x) * acc;
      this.vel.z += (tvz - this.vel.z) * acc;
      let vx = this.vel.x, vz = this.vel.z;
      if (this.dodgeT > 0) { vx = this.dodgeDir.x * 8.5; vz = this.dodgeDir.z * 8.5; }
      u.pos.x += vx * dt; u.pos.z += vz * dt;
      if (army.bodies) army.bodies(u);   // 兵の体に重ならない（すり抜けない）
      army.collide(u);
      const W = rt.world.def.water;
      if (W && u.pos.x > W.x - 1) u.pos.x = W.x - 1;
      u.pos.x = Math.max(-176, Math.min(176, u.pos.x));
      u.pos.z = Math.max(-176, Math.min(176, u.pos.z));
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.vel.x = vx; u.vel.z = vz;
      const sp = Math.hypot(vx, vz);
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
          sfx(wade ? 'wade' : W.rainLevel > 0.3 ? 'stepWet' : sandy ? 'stepSand' : onPath ? 'stepPath' : 'step', wade ? 0.8 : 0.6); if (this.def > 0.1) sfx('clank', 0.8); if (sp > 5) rt.world.puff(u.pos.x, u.pos.z, 3);
        }
        rt.stats.dist += sp * dt;
      }
      // 移動中にしばらく視点を動かさなければ、カメラが背後へ回り込む
      if (S.autoCam && !this.lock && !(this.inCombatT > 0) && ml > 0 && this.lookIdle > 1 && iz >= 0) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 1.2);
      // 向き：構え・攻撃・狙い定め中はカメラ方向、それ以外は進行方向
      let want = null;
      // 一人称では、体はいつも見ている方を向く（振り向くと自分の背が見える、を防ぐ）
      if (this.guard || this.aiming || this.shot || this.pending || input.left || this.inCombatT > 0 || this.lock || this.fpK > 0.5) want = this.yaw;
      else if (ml > 0) want = Math.atan2(mx, mz);
      if (want !== null) u.heading += angleDiff(u.heading, want) * Math.min(1, dt * 12);

    }
    // ---- 攻撃 ----
    this.cd -= dt;
    this.comboT -= dt;
    this.inCombatT -= dt;
    this.counterT -= dt;
    this.buffer -= dt;
    if (input.leftPressed) { this.buffer = 0.22; this.chargeT = 0; }
    // 竹束などを担いでいる間（戦の定義の flags.carry）は、両手がふさがって突けない
    if (this.rt.flags && this.rt.flags.carry) {
      if (input.leftPressed && !(this.carryWarnT > this.rt.t)) { this.carryWarnT = this.rt.t + 3; this.rt.hud.flash('担いでいる間は突けない（据えてから）', 'dim'); }
      this.buffer = 0; this.chargeT = 0;
    }
    // 火縄銃・弓：左で撃つ・射る（槍・刀の攻めは出さない）
    if (this.weapon === 'gun' || this.weapon === 'bow') { this.rangedUpdate(dt, input); this.buffer = 0; }
    else this.rangedIdle();
    // 押し続けると溜め突き（離したときに出る）
    if (input.left && this.weapon === 'spear' && !this.guard && !this.pending) this.chargeT += dt;
    this.charging = this.chargeT > 0.25 && input.left;
    if (!input.left && this.chargeT > 0.7 && this.sta >= 22 && !this.pending) {
      this.sta -= 22; this.staDelay = 0.8;
      this.pending = { t: 0.08, kind: 'charged' };
      this.cd = 0.9; this.buffer = 0;
      sfx('thrust', 1.3);
    }
    if (!input.left) this.chargeT = 0;
    if (this.buffer > 0 && this.cd <= 0 && !this.pending && this.dodgeT <= 0) {
      this.buffer = 0;
      if (this.weapon === 'spear') {
        if (this.guard && this.sta >= 18) {
          this.sta -= 18; this.staDelay = 0.7;
          this.pending = { t: 0.22, kind: 'sweep' };
          u.sweepT = 0.35;
          this.cd = 1.0;
          sfx('swing');
        } else if (this.sta >= 6) {
          this.combo = this.comboT > 0 ? this.combo + 1 : 1;
          const third = this.combo >= 3;
          this.sta -= 6 + (third ? 6 : 0); this.staDelay = 0.5;
          this.pending = { t: 0.12, kind: 'thrust', third };
          this.cd = (third ? 0.85 : this.combo === 2 ? 0.32 : 0.42) * this.spearCd;
          if (third) this.combo = 0;
          this.comboT = 0.75;
          sfx('thrust');
        } else rt.hud.flash('気力が足りない（少し構えを解くと戻る）', 'dim');
      } else if (this.sta >= 5) {
        this.sta -= 5; this.staDelay = 0.4;
        // 打刀：構えながらなら突き、そうでなければ斬り
        this.pending = { t: 0.1, kind: this.guard ? 'kthrust' : 'slash' };
        this.cd = this.guard ? 0.55 : 0.4;
        sfx(this.guard ? 'thrust' : 'slash');
      }
      this.inCombatT = 3;
    }
    if (this.pending) {
      this.pending.t -= dt;
      // 構えから溜める動き（刀は振りかぶり、槍は引いて溜める）を見せる
      const p0 = this.pending;
      if (!p0.dur) p0.dur = Math.max(0.05, p0.t + dt);
      const pk = p0.kind === 'slash' ? this.nextSlash() : p0.kind === 'kthrust' ? 'tsuki' : p0.kind === 'sweep' ? 'sweep' : 'thrust';
      u.pAtk = { kind: pk, t: p0.t, dur: p0.dur };
      if (this.pending.t <= 0) {
        const p = this.pending;
        this.pending = null;
        u.pAtk = null;
        this.strike(p.kind, p.third);
      }
    }
    // 穂先を相手に合わせる（近すぎれば柄を繰り込む）ための相手
    u.fitT = this.lock && this.lock.alive ? this.lock : this.aimed;

    // ---- 照準の状態（HUD用） ----
    const reach = this.weapon === 'spear' ? 2.9 + (ITEMS[this.G.equip.weapon].reach || 0) : 2.0;
    this.inRange = army.enemiesInArc(u.pos, this.yaw, reach, 0.62, u.team).length > 0;
    this.aimT = (this.aimT || 0) - dt;
    if (this.aimT <= 0) { this.aimT = 0.15; this.aimed = this.lock || this.aimEnemy(14); }

    // ---- 倒れた敵の鉄砲を拾う（近づくと「鉄砲を拾う」。E／指の端末は丸の釦） ----
    // 囲まれた知らせ（12 秒に一度）
    if (u.mobbed && !(this.mobWarnT > rt.t)) { this.mobWarnT = rt.t + 12; rt.bark('囲まれた！　味方のいる所まで下がれ', true); }
    this.pickT = (this.pickT || 0) - dt;
    if (this.pickT <= 0 && !this.mounted) { this.pickT = 0.3; this.findGunPickup(); }

    // ---- 自然回復 ----
    if (u.lastHitT > 6) u.hp = Math.min(u.maxHp, u.hp + this.D.regen * dt);
    this.rallyCd -= dt;
    // 揺れは直線でなく、ばねのように速く減って尾を引く
    this.shake = Math.max(0, this.shake * Math.exp(-dt * 3.2) - dt * 0.12);
    this.updateSquad(dt);
    // 討たれない武将に手傷を負わせた（units.js の generalWounded が woundQ に積む）
    if (army.woundQ && army.woundQ.length) for (const w of army.woundQ.splice(0)) this.generalWounded(w.u);
    if (this.lock && this.lock.woundOut) this.lock = null;
  }

  // 手傷を負わせた武将：知らせと戦功（+20「〇〇に手傷」）。戦の定義に onGeneralWounded があれば呼ぶ
  generalWounded(g) {
    const rt = this.rt, name = g.name || '敵の将';
    if (this.lock === g) this.lock = null;
    if (this.aimed === g) this.aimed = null;
    rt.bark(`${name}、手傷を負って退いた！`);
    const tr = rt.tracker;
    if (tr) {
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

  // 狙い定めの相手を左右の隣の敵へ
  switchLock(dir) {
    const u = this.u;
    const cur = this.lock;
    const baseA = Math.atan2(cur.pos.x - u.pos.x, cur.pos.z - u.pos.z);
    let best = null, bd = Infinity;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === 0 || o === cur || o.woundOut || o.fleeing || o.type === 'dummy') continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d > 24) continue;
      const a = angleDiff(baseA, Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z));
      if (Math.sign(-a) !== dir) continue;
      const score = Math.abs(a) * 10 + d * 0.1;
      if (score < bd) { bd = score; best = o; }
    }
    if (best) { this.lock = best; sfx('ui'); }
  }

  switchWeapon(w) {
    const u = this.u;
    if ((w === 'gun' || w === 'bow') && this.mounted) { this.rt.hud.flash('馬上では使えない（R で降りる）', 'dim'); return; }
    this.cd = Math.max(this.cd, w === 'gun' || w === 'bow' ? 0.6 : 0.35);  // 持ち替えの隙
    // 引いていた弓・切りかけた火蓋はやめる
    this.rangedIdle();
    u.hand.remove(u.wpn);
    u.wpn = { sword: this.swordMesh, gun: this.gunMesh, bow: this.bowMesh }[w] || this.spearMesh;
    u.hand.add(u.wpn);
    u.wpnKind = w;
    this.weapon = w;
    this.reachT = 2;   // 足もとに間合いの輪を 2 秒（battle.js updateSquadAids）
    // 持ち替えの音：刀は鞘走り（しゃっ）、ほかは柄と具足の擦れる音。画面の音（ui）は鳴らさない
    sfx(w === 'sword' ? 'saya' : 'kozane', w === 'sword' ? 0.8 : 0.7);
    if (w === 'gun') this.rt.hud.flash(`火縄銃（${this.gunLoaded ? '込めてある' : '込め直しが要る'}）　右で構えて狙い、左で放つ`, 'dim');
    if (w === 'bow') this.rt.hud.flash('弓　左を押して引き絞り、離して射る。右で狙う', 'dim');
  }
  // 持っている武器の並び（持ち替えの順）
  weaponList() { return ['spear', ...(this.hasKatana ? ['sword'] : []), ...(this.hasGun ? ['gun'] : []), ...(this.hasBow ? ['bow'] : [])]; }

  // ---------------- 敵の鉄砲を拾う ----------------
  // 討たれた鉄砲足軽（または脇差を抜いて鉄砲を置いた者）の鉄砲が、2.4m 内にあれば拾える
  findGunPickup() {
    const rt = this.rt, army = rt.army, p = this.u.pos;
    let best = null, bd = 2.4;
    const look = (o) => {
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
    if (!o || o.gunTaken) return;
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
      this.gunLoaded = true; this.gunReload = 0; this.gunAmmo = 2;
      this.switchWeapon('gun');
      rt.hud.flash(`敵の鉄砲を拾った（込めてある一発と、弾 2）　${isTouch ? '持ち替えの丸で槍に戻せる' : '1 で槍に戻せる'}`, 'gold');
    } else {
      if (this.gunAmmo != null) this.gunAmmo += 3;
      rt.hud.flash(this.gunAmmo != null ? `弾と火薬を拾った（弾 ${this.gunAmmo}）` : '弾と火薬を拾った', 'dim');
    }
  }

  // ---------------- 火縄銃・弓 ----------------
  // 飛び道具を手にしていない時：引きかけ・切りかけをやめ、札を隠す（弾込めは火縄銃を手にしている間だけ進む）
  rangedIdle() {
    const u = this.u;
    this.aimK = 0;
    if (this.shot || this.draw > 0) { this.shot = null; this.draw = 0; }
    if (u.atk && (u.atk.ranged || u.atk.bow)) u.atk = null;
    if (u.reload) u.reload = null;
    const el = this.hasGun || this.hasBow ? document.getElementById('rangedui') : null;
    if (el && !el.hidden) el.hidden = true;
  }
  // 照準の先の敵（狙うほど細い円錐で探す）
  aimRanged(cone, maxD) {
    const cam = this.rt.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const v = new THREE.Vector3();
    let best = null, bs = Infinity;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === 0 || o.woundOut || o.type === 'dummy') continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + (o.mounted ? 2.0 : 1.2) - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      if (ang < cone + 0.5 / d && ang + d * 0.002 < bs) { bs = ang + d * 0.002; best = o; }
    }
    return best;
  }
  // 当てる的が無い時の見せかけの的（照準の先の地面）
  groundTarget() {
    const p = this.aimPoint(70);
    return { pos: { x: p.x, y: this.rt.world.heightAt(p.x, p.z), z: p.z }, vel: null, mounted: false, isPlayer: false, alive: false };
  }
  rangedUpdate(dt, input) {
    const u = this.u, rt = this.rt, army = rt.army;
    if (this.mounted) { this.switchWeapon('spear'); return; }
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 8);
    if (this.weapon === 'gun') {
      // 込め直し：止まって（歩く程度まで）いる間に進む。走れば止まる
      // 拾った鉄砲は弾に限りがある（gunAmmo。買った鉄砲は null で限り無し）
      if (!this.gunLoaded && !this.shot && this.gunAmmo === 0) {
        u.reload = null;
        if (!(this.noAmmoT > rt.t)) { this.noAmmoT = rt.t + 6; rt.hud.flash(`弾が尽きた。倒れた鉄砲足軽から拾うか、${isTouch ? '持ち替えの丸' : '1'}で槍に戻せ`, 'dim'); }
      } else if (!this.gunLoaded && !this.shot) {
        const sp = Math.hypot(u.vel.x, u.vel.z);
        const r0 = this.gunReload;
        if (sp < 4) this.gunReload += dt / (GUN_RELOAD * (sp > 1 ? 1.8 : 1));
        u.reload = { t: this.gunReload * GUN_RELOAD, dur: GUN_RELOAD };
        // 込めの手順の音：火薬を注ぐ・弾を落とす・込め矢で突き固める（とん、とん）・口薬を盛って火蓋を閉じる
        const cross = (x) => r0 < x && this.gunReload >= x;
        if (cross(0.12)) sfx('hizara', 0.5);
        if (cross(0.35)) sfx('tick', 0.8);
        for (const x of [0.5, 0.58, 0.66]) if (cross(x)) sfx('knock', 0.18);
        if (cross(0.85)) sfx('hizara', 0.4);
        if (this.gunReload >= 1) { this.gunLoaded = true; this.gunReload = 0; u.reload = null; if (this.gunAmmo != null) this.gunAmmo--; sfx('click', 0.8); rt.hud.flash(this.gunAmmo != null ? `込め終えた（残りの弾 ${this.gunAmmo}）` : '込め終えた', 'dim'); }
      }
      // 構えている間は頬付けの姿（poseGun の「aim」）
      if (this.shot) {
        this.shot.t -= dt;
        const e = this.shot.dur - this.shot.t;
        u.atk = { ranged: true, t: this.shot.t, dur: this.shot.dur, target: this.shot.target || this.groundTarget() };
        void e;
        // 引き金を落とすと、火挟みの火縄が火皿の口薬に落ちて先に光り（しゅっ）、一呼吸おいて筒の薬に移って放たれる
        if (this.shot.t <= 0.09 && !this.shot.pan) { this.shot.pan = true; rt.army.panFlash(u, true); }
        if (this.shot.t <= 0) { const aimed = this.shot.aimed, pan = this.shot.pan; this.shot = null; u.atk = null; this.fireShot(aimed || this.aiming, pan); }
      } else if (this.aiming && this.gunLoaded) u.atk = { ranged: true, t: 1, dur: 2, target: this.groundTarget() };
      else if (u.atk && u.atk.ranged) u.atk = null;
      if (input.leftPressed && this.cd <= 0 && !this.shot) {
        if (!this.gunLoaded) rt.hud.flash(`込め直している（${Math.round(this.gunReload * 100)}%）。止まっていれば早い`, 'dim');
        else {
          // 火蓋を切って放つ。構えていなければ、構えるぶん少し遅い
          const dur = this.aiming ? 0.3 : 0.75;
          this.shot = { t: dur, dur: dur + (this.aiming ? 1.0 : 0), aimed: this.aiming, target: null };
          this.inCombatT = 3;
          // 火蓋を切る音（かちり）。火皿の口薬が光るのは放つ直前
          sfx('click', 0.55);
        }
      }
    } else {
      // 弓：左を押している間に引き絞り、離して射る
      u.relT = Math.max(0, (u.relT || 0) - dt);
      if (input.left && this.cd <= 0) {
        this.draw += dt;
        // poseBow の段（番える 0.8・打ち起こし 0.5・引き分け 0.7 → 会）を 0.9 秒ほどに縮めて見せる
        const e = Math.min(2.2, this.draw * 2.3);
        u.atk = { bow: true, t: 10 - e, dur: 10, target: this.groundTarget() };
        this.inCombatT = 3;
      } else if (this.draw > 0) {
        const full = this.draw * 2.3 >= 2.0;
        this.draw = 0; u.atk = null;
        if (full) this.looseArrow();
        else rt.hud.flash('引きが足りない（長く押して引き絞る）', 'dim');
        this.cd = 0.5;
      }
    }
    this.updateRangedUi();
  }
  // 火縄銃を放つ：狙う相手は照準の先（構えて狙えば細く正確に、腰だめでは外れやすい）
  fireShot(aimed, panDone = false) {
    const u = this.u, rt = this.rt, army = rt.army;
    u.heading = this.yaw;
    const t = this.aimRanged(aimed ? 0.035 : 0.1, 70);
    const tgt = t && (aimed || Math.random() < 0.55) ? t : this.groundTarget();
    const d0 = u.dmg;
    u.dmg = 40;
    if (!panDone) army.panFlash(u, true);
    const ok = army.fireGun(u, tgt);
    u.dmg = d0;
    if (!ok) { rt.hud.flash('火縄が湿って火が付かぬ', 'red'); this.cd = 1.5; return; }
    this.gunLoaded = false; this.gunReload = 0;
    this.cd = 0.8;
    this.addShake(0.22);
    deafen(0.3);   // 頬のそばの火薬の破裂で、耳が少し遠くなる
    this.pitch = Math.min(0.55, this.pitch + (S.reduceMotion ? 0 : 0.035));   // 反動で筒先が跳ねる
    rt.game.vibrate(0.7, 140);
  }
  // 矢を射る
  looseArrow() {
    const u = this.u, rt = this.rt, army = rt.army;
    u.heading = this.yaw;
    const t = this.aimRanged(this.aiming ? 0.05 : 0.1, 45) || this.groundTarget();
    const d0 = u.dmg;
    u.dmg = 15;
    army.shoot(u, t);
    u.dmg = d0;
    u.relT = 0.55;
    this.addShake(0.04);
  }
  // 照門（一人称で構えた時）と、弾込め・引きの様子の小さな札。戦の後は battle.js の dispose が消す
  updateRangedUi() {
    let el = document.getElementById('rangedui');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rangedui';
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = `<style>
        #rangedui { position: fixed; inset: 0; pointer-events: none; z-index: 12; }
        #rangedui .st { position: absolute; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 6px 14px; min-height: 32px; box-sizing: border-box;
          background: rgba(20,18,15,.82); color: #ece4d2; border: 1px solid rgba(236,228,210,.2); border-radius: 4px; font-size: 14px; letter-spacing: .06em; white-space: nowrap; display: flex; gap: 10px; align-items: center; }
        #rangedui .st i { display: inline-block; width: 90px; height: 6px; background: #2c2821; position: relative; }
        #rangedui .st i b { position: absolute; inset: 0; right: auto; background: #c2a25a; }
        @media (max-height: 500px) { #rangedui .st { bottom: calc(84px + env(safe-area-inset-bottom)); font-size: 13px; } }
        #rangedui .sight { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 260px; height: 160px; }
      </style><div class="sight" hidden><svg viewBox="0 0 260 160" width="260" height="160" aria-hidden="true">
        <path d="M0 96 H108 V78 Q130 92 152 78 V96 H260 V160 H0 Z" fill="rgba(18,14,10,.92)"/>
        <path d="M108 78 Q130 92 152 78" stroke="#6a5436" stroke-width="2" fill="none"/>
        <rect x="127" y="58" width="6" height="26" fill="#1a1510"/><circle cx="130" cy="58" r="3.4" fill="#3a2c1c"/>
      </svg></div><div class="st"></div>`;
      document.body.appendChild(el);
    }
    const on = this.weapon === 'gun' || this.weapon === 'bow';
    el.hidden = !on || !this.u.alive || this.rt.over;
    if (el.hidden) return;
    const sight = el.querySelector('.sight');
    sight.hidden = !(this.weapon === 'gun' && this.aiming && this.fpK > 0.6);
    const st = el.querySelector('.st');
    const txt = this.weapon === 'gun'
      ? (this.gunLoaded ? (this.shot ? '火蓋を切る…' : this.aiming ? '火縄銃　狙っている（左で放つ）' : '火縄銃　込めてある（右で構える）') : `${['筒に火薬を注ぐ', '弾を落とす', '込め矢で突き固める', '火皿に口薬を盛る'][Math.min(3, Math.floor(this.gunReload * 4))]} <i><b style="width:${Math.round(this.gunReload * 100)}%"></b></i> ${Math.round(this.gunReload * 100)}%`)
      : (this.draw > 0 ? `引き絞る <i><b style="width:${Math.round(Math.min(1, this.draw * 2.3 / 2) * 100)}%"></b></i>` : '弓　左を押して引き絞り、離して射る');
    if (st._t !== txt) { st.innerHTML = txt; st._t = txt; }
  }

  // 刀の斬りは、袈裟・逆袈裟・横薙ぎを順に
  nextSlash() { return ['kesa', 'gyaku', 'yoko'][this.slashN % 3]; }

  strike(kind, third) {
    const u = this.u;
    const army = this.rt.army;
    const swKind = kind === 'thrust' || kind === 'charged' ? 'thrust' : kind === 'sweep' ? 'sweep' : kind === 'kthrust' ? 'tsuki' : this.nextSlash();
    if (kind === 'slash') this.slashN++;
    const reachExtra = ITEMS[this.G.equip.weapon].reach || 0;
    u.strikeT = 0.2;
    // 馬上では体をひねって、見ている方を突く。駆けているほど重い
    const heading = this.mounted ? this.yaw : u.heading;
    const ride = this.mounted ? 0.7 : 0;
    const rush = this.mounted ? 1 + Math.min(0.9, Math.abs(this.hspd) / 11 * 0.9) : 1;
    const arc = (reach, half, n) => {
      let h = army.enemiesInArc(u.pos, heading, reach, half, u.team);
      // 照準補助：正面に敵がいなければ少し広めに探して向きを合わせる
      // 指の端末は細かく向きを合わせにくいので、前 60° の内まで広げ、半歩先の敵へは踏み込んで突く
      if (!h.length && (S.aimAssist || isTouch)) {
        const wide = isTouch ? Math.max(half + this.D.aim, 1.05) : half + this.D.aim;
        const lunge = isTouch ? 0.9 : S.aimAssist ? 0.35 : 0;
        h = army.enemiesInArc(u.pos, heading, reach + lunge, wide, u.team);
        if (h.length) {
          const t0 = h[0].u, dx = t0.pos.x - u.pos.x, dz = t0.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
          u.heading = Math.atan2(dx, dz);
          // 届かない分だけ踏み込む（一歩まで）
          const step = Math.min(lunge, d - (reach - 0.2));
          if (step > 0 && !this.mounted) { u.pos.x += dx / d * step; u.pos.z += dz / d * step; h[0].d = d - step; }
        }
      }
      if (this.lock && this.lock.alive) {
        const i = h.findIndex((x) => x.u === this.lock);
        if (i > 0) h.unshift(h.splice(i, 1)[0]);
      }
      return h.slice(0, n);
    };
    let hits, dmg;
    if (kind === 'thrust') { hits = arc(2.9 + reachExtra + ride, 0.62, this.mounted && this.hspd > 8 ? 2 : 1); dmg = this.spearDmg() * (third ? 1.3 : 1) * rush; }
    else if (kind === 'charged') { hits = arc(3.2 + reachExtra + ride, 0.5, 1); dmg = this.spearDmg() * 2 * rush; }
    else if (kind === 'kthrust') { hits = arc(2.3, 0.5, 1); dmg = 17 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    else if (kind === 'sweep') { hits = arc(2.6 + ride, 1.1, this.mounted ? 5 : 4); dmg = this.spearDmg() * 0.7 * rush; }
    else { hits = arc(2.0, 0.8, 2); dmg = 19 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 振りの記録（穂先・刃がどこで止まったかを見せる）
    // 薙ぎ（長柄の叩き）は重い柄を振り回すので、突きより長く（0.42 秒）
    u.swing = { kind: swKind, t: 0, dur: kind === 'sweep' ? 0.42 : 0.22, at: 0, done: true, res: null, target: hits[0] ? hits[0].u : null, d: hits[0] ? hits[0].d : 0, side: 1 };
    const counter = this.counterT > 0 && hits.length > 0;
    if (counter) { this.counterT = 0; this.rt.hud.flash('反撃', 'gold'); }
    // 槍の癖：味方と肩を並べる密集では強く、懐に入られると弱い
    const spearKind = kind === 'thrust' || kind === 'charged' || kind === 'sweep';
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
      // 薙ぎ・溜め突き・反撃・背後からの一撃は、敵の構えでは防げない
      const wk = { thrust: 'thrust', charged: 'thrust', sweep: 'sweep', kthrust: 'tsuki' }[kind] || swKind;
      army.damage(t, dmg * m, u, { kind: wk, out: h === hits[0] ? u.swing : null, pierce: kind === 'sweep' || kind === 'charged' || counter || facing < -0.2 });
      if (h === hits[0] && u.swing.res && u.swing.res !== 'miss' && this.weapon === 'spear') { const F = u.wpn && u.wpn.userData.flex; if (F) F.vel += (u.swing.res === 'hit' ? 1.6 : 3) * F.G.sp.bend; }
      if (t.alive && t.atk && kind !== 'sweep' && t.lastStagT === army.time && Math.random() < 0.35) { t.atk = null; t.cd = 0.8; }
    }
    // 兵に当たらなかった時は、目の前の敵の柵・逆茂木・竹束・陣幕・盾を打つ（味方の柵は打たない）。
    //   門や城の塀のような太い物は、槍・刀では少ししか減らない（掛矢の門破りの方が効く）
    if (!hits.length) {
      const reach = (kind === 'kthrust' || kind === 'slash' ? 2.1 : 2.9 + reachExtra) + ride;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      let best = null, bd = 1e9;
      for (const st of army.structs) {
        if (!st.alive || st.team === u.team || st.maxHp > 1e8) continue;
        let d, px, pz;
        if (st.seg) {
          const [ax, az, bx, bz] = st.seg, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const tt = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2));
          px = ax + dx * tt; pz = az + dz * tt; d = Math.hypot(px - u.pos.x, pz - u.pos.z);
        } else { px = st.x; pz = st.z; d = Math.hypot(px - u.pos.x, pz - u.pos.z) - (st.r || 1); }
        if (d > reach) continue;
        const dl = Math.hypot(px - u.pos.x, pz - u.pos.z) || 1;
        if (((px - u.pos.x) * fx + (pz - u.pos.z) * fz) / dl < 0.35 && d > 0.6) continue;
        if (d < bd) { bd = d; best = { st, px, pz }; }
      }
      if (best) {
        const st = best.st, thick = /門|塀|城|櫓|石垣/.test(st.name || '') || (st.maxHp || 0) >= 1200;
        const amt = dmg * (kind === 'charged' ? 1.4 : 1) * (thick ? 0.15 : 1.1);
        army.damage(st, amt, u, { kind: swKind, out: u.swing });
        const y = this.rt.world.heightAt(best.px, best.pz) + 1.0;
        army.burst(best.px, y, best.pz, thick ? 3 : 7, 'wood', -fx * 0.6, -fz * 0.6);
        sfx(thick ? 'thud' : 'crack', thick ? 0.9 : 1.1); sfx('wood', 0.7);
        this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, thick ? 0.06 : 0.05);
        this.addShake(thick ? 0.08 : 0.05);
        if (thick && !this.thickHint) { this.thickHint = true; this.rt.hud.flash('太い門や塀は、槍では少ししか傷まない', 'dim'); }
      }
    }
    if (hits.length) {
      // 手応え：重い一撃ほど長く止まる。甲冑に当たれば金の音
      const heavy = kind === 'charged' || (kind === 'thrust' && third) || counter;
      this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, heavy ? 0.1 : kind === 'sweep' ? 0.08 : 0.045);
      // 薙ぎが当たると、重い柄が体に食い込む手応え：少し長い止めと、下へ沈む揺れ
      if (kind === 'sweep') { this.addShake(0.08); if (!S.reduceMotion) this.pitch -= 0.015; }
      if (hits.some((h) => h.u.type === 'samurai' || h.u.type === 'busho' || h.u.type === 'cavalry')) sfx('clank', heavy ? 1.3 : 0.9);
      for (const h of hits) { h.u.flinchT = heavy ? 0.32 : 0.18; if (heavy && h.u.alive) h.u.stagger = Math.max(h.u.stagger || 0, 0.9); }
      this.addShake(heavy ? 0.1 : 0.04);
      this.hitChain = (this.hitChain || 0) + 1;
      this.comboHitT = 1.6;
      if (this.hitChain >= 2) this.rt.hud.combo(this.hitChain);
    }
  }

  rally() {
    const rt = this.rt;
    if (this.rallyCd > 0) { rt.hud.flash(`号令はあと${Math.ceil(this.rallyCd)}秒`, 'dim'); return; }
    this.rallyCd = 25;
    if (rt.squad.length) {
      for (const g of rt.squadGroups) { g.morale = Math.min(100, g.morale + 18); for (const s of g.units) s.confused = 0; }
      rt.say(this.G.name, ['者ども、続けぇっ！', '怯むな！踏みとどまれ！', '我らの槍を見せてやれ！'][Math.floor(Math.random() * 3)], 2.5);
      rt.hud.flash('組の士気 +18', 'gold');
    } else {
      rt.army.forNear(this.u.pos.x, this.u.pos.z, 12, (o) => { if (o.team === 0 && o.group) o.group.morale = Math.min(100, o.group.morale + 3); });
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
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const p = cam.position.clone();
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
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    let best = null, bs = Infinity;
    const v = new THREE.Vector3();
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === 0 || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + 1.2 - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d > maxD + 5) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      const score = ang * 30 + d * 0.05;
      if (ang < 0.22 && score < bs) { bs = score; best = o; }
    }
    if (best || maxD < 30) return best;
    const p = this.aimPoint();
    let bd = 12;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === 0 || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
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
  syncRadial() {
    const gs = this.selectedGroups().filter((g) => g.count > 0);
    const sh = gs.some((g) => g.kind === 'bow' || g.kind === 'gun');
    const other = gs.some((g) => g.kind !== 'bow' && g.kind !== 'gun');
    RADIAL[3] = sh && !other ? FIRE_ITEM : YARI_ITEM;
  }
  selectedGroups() {
    const gs = this.rt.squadGroups;
    if (this.selGroup !== 'all') { const s = gs.filter((g) => g.kind === this.selGroup); if (s.length) return s; }
    return gs;
  }

  command(id) {
    const rt = this.rt;
    const u = this.u;
    const gs = this.selectedGroups();
    if (!gs.length || !rt.squad.some((s) => s.alive)) { if (rt.squad.length) rt.hud.flash('声の届く組がいない（組は討たれたか、散った）', 'dim'); return; }
    // 同じ号令を 4 秒のうちにもう一度押すと、取り消して前の号令に戻す（押し間違いの手直し）
    const undoable = !['fire', 'form', 'focus'].includes(id);
    if (undoable && this.lastCmd && this.lastCmd.id === id && rt.t - this.lastCmd.t < 4 && rt.restoreSquad) {
      rt.restoreSquad(this.lastCmd.before);
      this.lastCmd = null;
      rt.hud.flash(`「${ORDER_NAME[id] || id}」を取り消した（前の号令に戻す）`, 'dim');
      sfx('taiko', 0.25);
      return;
    }
    const before = undoable && rt.squadSnaps ? rt.squadSnaps() : null;
    // 号令は耳でも分かるように：かかれ・進め＝法螺と陣太鼓、退け＝鉦の連打、ついて来い＝法螺二声、ほか＝太鼓一打（同じ合図は 6 秒に一度）
    const sig = { attack: 'sig_susume', move: 'sig_susume', retreat: 'sig_hike', follow: 'sig_atsumare' }[id];
    if (sig && !(this.sigT && this.sigT[sig] > rt.t)) { (this.sigT = this.sigT || {})[sig] = rt.t + 6; sfx(sig, 0.55); }
    else sfx('taiko', 0.35);
    const lines = {
      follow: '者ども、ついて来い！', hold: 'その場で待て！', attack: 'かかれっ！突っ込め！', retreat: '退けっ、退けい！',
      focus: 'あの者を狙え！', move: 'あの地点まで進め！', yari: '槍衾を組め！',
      face: 'こちらへ向き直れ！', gather: '散るな、わしの元へ集まれ！',
    };
    if (id === 'fire') {
      // 弓・鉄砲の射撃を切り替える（号令先が弓か鉄砲なら、その隊だけ）
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない（射撃の号令は弓・鉄砲の組に）', 'dim'); return; }
      const on = !shooters[0].fire;
      // 号令を待つ鉄砲組（holdFire）も「放て」で撃ち始める
      for (const g of shooters) { g.fire = on; if (on) g.holdFire = false; }
      const who = shooters.every((g) => g.kind === 'gun') ? '鉄砲隊' : shooters.every((g) => g.kind === 'bow') ? '弓隊' : '弓・鉄砲';
      rt.say(this.G.name, on ? `${who}、放てっ！` : `${who}、撃ち方やめ！`, 2);
      rt.ack();
      rt.tutMark('cmd_fire');
      return;
    }
    if (id === 'form') {
      const seq = ['line', 'column', 'loose'];
      for (const g of gs) {
        const cur = g.formation === 'yari' ? 'line' : g.formation;
        g.formation = seq[(seq.indexOf(cur) + 1) % seq.length];
      }
      rt.say(this.G.name, `${FORM_NAME[gs[0].formation]}に組め！`, 2);
      rt.ack();
      return;
    }
    let target = null;
    if (id === 'focus') {
      target = this.lock && this.lock.alive && !this.lock.invuln ? this.lock : this.aimEnemy(70, true);
      if (!target) { rt.hud.flash('狙う敵が見当たらない', 'dim'); return; }
    }
    let point = null;
    if (id === 'move') point = this.aimPoint();
    for (const g of gs) {
      g.focus = null;
      if (g.formation === 'yari' && id !== 'yari') g.formation = 'line';
      if (id === 'follow') { g.order = 'follow'; }
      else if (id === 'hold') { g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.facing = this.yaw; g.aggro = g.kind === 'bow' || g.kind === 'gun' ? 8 : 7; }
      else if (id === 'attack') { g.order = 'attack'; g.seekRange = 38; const c = g.center(); g.anchor = { x: c.x, z: c.z }; }
      else if (id === 'retreat') {
        g.order = 'retreat';
        g.anchor = { x: u.pos.x - Math.sin(this.yaw) * 18, z: u.pos.z - Math.cos(this.yaw) * 18 };
        g.facing = this.yaw;
        for (const s of g.units) { s.target = null; s.atk = null; }
      } else if (id === 'focus') { g.order = 'attack'; g.focus = target; g.seekRange = 20; }
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
      // 号令 → 返事 → 組頭格が動き、兵がそれに続く（一斉にくるりと回らない）
      g.units.forEach((s, k) => { s.aiT = s === g.leader ? 0.15 : 0.35 + Math.min(0.5, k * 0.04) + Math.random() * 0.3; });
    }
    if (lines[id]) rt.say(this.G.name, lines[id], 2);
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
        const want = { x: u.pos.x - Math.sin(h) * back, z: u.pos.z - Math.cos(h) * back };
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
    this.updateTomo(dt);
  }

  // 供：すぐ後ろ（二間ほど）について歩き、主に斬りかかる敵を先に迎え撃つ。中間は戦の合間に主の傷を手当てする
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
    // 中間の手当て：近くに中間がいて、しばらく斬り合っていなければ、少しずつ傷が癒える
    const ch = this.rt.tomoUnits.find((t) => t.alive && t.tomo && t.tomo.kind === 'chugen');
    if (ch && u.lastHitT > 4 && u.hp < u.maxHp && Math.hypot(ch.pos.x - u.pos.x, ch.pos.z - u.pos.z) < 6) {
      u.hp = Math.min(u.maxHp, u.hp + 1.2 * 0.4 * 2);
      if (!this.chugenSaid) { this.chugenSaid = true; this.rt.say(ch.name, '傷を縛りまする。しばしお待ちを', 2.5); }
    }
  }

  // 自分からカメラへの線が、建物などに当たるか（当たれば 0〜1 の割合）
  camBlockHit(from, to) {
    const rt = this.rt;
    this.camT = (this.camT || 0) + 1;
    // 建物・柵の一覧は 10 秒ほどおきに場面全体から作り直し、近くの物は 30 コマおきにその一覧から拾う（毎回場面を回らない）
    if (!this.blockAll || this.camT % 600 === 0) {
      const all = [];
      rt.scene.traverse((o) => { if (o.userData.camBlock && o.geometry) all.push(o); });
      this.blockAll = all;
    }
    if (!this.blockers || this.camT % 30 === 0) {
      const list = [];
      const c = this._bc || (this._bc = new THREE.Vector3());
      for (const o of this.blockAll) {
        if (o.visible === false || !o.parent) continue;
        o.updateWorldMatrix(true, false);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        c.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
        if (c.distanceTo(from) < o.geometry.boundingSphere.radius + 14) list.push(o);
      }
      this.blockers = list;
    }
    if (!this.blockers.length) return null;
    if (!this.ray) this.ray = new THREE.Raycaster();
    const dir = to.clone().sub(from);
    const len = dir.length();
    this.ray.set(from, dir.normalize());
    this.ray.far = len;
    const h = this.ray.intersectObjects(this.blockers, false);
    return h.length ? h[0].distance / len : null;
  }

  // ---------------- 視点（三人称・一人称） ----------------
  // V（触る端末は左上の「視点」）で切り替える。選んだ方は次の戦でも使う
  // 回る順：三人称・普通 → 三人称・遠い → 一人称 → 三人称・近い → 三人称・普通
  // 見せ場の一枚を撮る（戦の定義から呼ぶ）：from の低い所（h m）から at を dur 秒見上げる。from・at は {x, z} か、それを返す関数
  // 例）桶狭間の「かかれ」：player.showShot({ x: 前へ 8m, z }, () => 自分の位置, 2)。森部・姉川の開戦：敵の横陣の正面 20m の低い所から敵陣を 3 秒
  // 戦っている時・一人称の時は撮らない（操作を奪わない）
  showShot(from, at, dur = 2.5, o = {}) {
    if (this.inCombatT > 0 || this.lock || S.reduceMotion) return false;
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
    return S.view === 'first' && this.u.alive && !(this.introT > 0) && !this.cine && !rt.over && !(rt.game && rt.game.photo);
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

  // 戦の気配を音へ渡す（1 秒おき）：
  //   approach：こちらへ寄せてくる敵の大勢（近いほど・多いほど大きい）と、その向き（左右の振り）・遠さ
  //   tense：押されている度合い（近くの敵が味方より多い・味方の士気が落ちている）。crumble：近くの味方の隊が崩れかけた瞬間
  senseWar(dt) {
    this.warT = (this.warT || 0) - dt;
    if (this.warT > 0 || !this.rt.army || !this.u.alive) return;
    this.warT = 1;
    const u = this.u, army = this.rt.army;
    let ap = 0, ax = 0, az = 0, apN = 0, foes = 0, friends = 0, low = 0;
    for (const o of army.units) {
      if (!o.alive || o.isStruct || o === u) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > 160) continue;
      if (o.team !== u.team) {
        if (d < 30) foes++;
        const v = o.vel || { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z);
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
    setScene({ approach, approachPan: pan, approachDist: dist, tense, crumble: crumble ? 1 : 0 });
  }

  // 描く直前（cam）と後（null）：カメラと自分の間に入った小さな建て物（足場・櫓・小屋など、差し渡し 16m まで）を隠す
  // 寄せ（camBlockHit）で間に合わない細い格子（足場の骨組み）が画面を塞がないように。大きな塀や柵は寄せに任せる
  propFade(cam) {
    if (!cam) { if (this.propHid) { for (const o of this.propHid) o.visible = true; this.propHid = null; } return; }
    if (!this.blockers || !this.blockers.length || this.fpK > 0.5) return;
    const u = this.u, head = new THREE.Vector3(u.pos.x, u.pos.y + 1.5 * ((u.mesh && u.mesh.scale.y) || 1) + (this.mounted ? RIDE.y : 0), u.pos.z);
    const L = cam.position.distanceTo(head);
    if (L < 0.5) return;
    if (!this.pray) this.pray = new THREE.Raycaster();
    const hid = [];
    // カメラが櫓・足場の骨組みの中に入り込んだ時（柱の隙間を抜けて寄せが効かない）：その物ごと隠す
    const cc = this._pc || (this._pc = new THREE.Vector3());
    for (const o of this.blockers) {
      if (!o.visible || !o.geometry) continue;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z);
      if (r > 8) continue;
      cc.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      if (cc.distanceTo(cam.position) < r * 0.85) { o.visible = false; hid.push(o); }
    }
    const dir = head.clone().sub(cam.position).normalize();
    // 真ん中と左右上下の五本の線：どれかに当たった小さな物を隠す
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    for (const [a, b] of [[0, 0], [0.6, 0.3], [-0.6, 0.3], [0.6, -0.5], [-0.6, -0.5]]) {
      const from = cam.position.clone().addScaledVector(right, a).add(new THREE.Vector3(0, b, 0));
      this.pray.set(from, head.clone().sub(from).normalize());
      this.pray.far = Math.max(0.1, from.distanceTo(head) - 0.6);
      for (const h of this.pray.intersectObjects(this.blockers, false)) {
        const o = h.object;
        if (!o.visible || hid.includes(o)) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) > 8) continue;
        o.visible = false; hid.push(o);
      }
    }
    this.propHid = hid.length ? hid : null;
  }

  // 描く直前（cam）と後（null）：カメラと自分の間に入った味方を透かす・隠す（視界を空ける）
  // 三人称：カメラに近い者ほど薄く（ディザ）、すぐ前の者は隠す。一人称：目の前 1m の味方の陣笠・指物を隠す
  allyFade(cam) {
    const F = this.fadeOn;
    if (cam && F) this.allyFade(null);
    if (!cam) {
      if (F) {
        for (const [o, m] of F.mats) o.material = m;
        for (const o of F.vis) o.visible = true;
        for (const [b, m] of F.bones) { b.matrix.copy(m); b.updateMatrixWorld(true); }
        this.fadeOn = null;
      }
      return;
    }
    const rt = this.rt, u = this.u, army = rt.army;
    if (!army || !army.forNear) return;
    const fp = this.fpK >= 0.72;
    const cx = cam.position.x, cz = cam.position.z;
    const S2 = { mats: [], vis: [], bones: [] };
    const hide = (o) => { if (o && o.visible) { o.visible = false; S2.vis.push(o); } };
    // 透かすのは味方だけ。今斬り合っている相手・狙っている敵・自分に打ちかかっている敵は、決して透かさない
    //   味方も、自分のすぐ横（1.4m 以内）で戦っている者は透かさない（カメラの前を横切る者だけ）
    const keep = new Set([this.lock, this.aimTarget, ...(army.threats || [])].filter(Boolean));
    const busyBeside = (o) => o.target && o.target.alive && !o.target.isStruct && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 1.4;
    const ally = (o) => o !== u && o.alive && o.team === u.team && !o.isStruct && !o.imp && o.mesh && o.mesh.visible && !keep.has(o) && !busyBeside(o);
    if (fp) {
      // 一人称：目の前 1m 以内の味方の陣笠・指物だけを隠す（体と得物は見せる）
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      army.forNear(cx, cz, 1.6, (o) => {
        if (!ally(o)) return;
        const vx = o.pos.x - cx, vz = o.pos.z - cz, d = Math.hypot(vx, vz);
        if (d > 1.0 || vx * fx + vz * fz < -0.2) return;
        hide(o.flag); hide(o.uma);
        const h = o.human;
        if (h && h.xb && h.xb.swHat && !h.hatOff) { const b = h.xb.swHat; S2.bones.push([b, b.matrix.clone()]); b.matrix.makeScale(0, 0, 0); b.updateMatrixWorld(true); }
        else if (h && h.parts && h.parts.hat) hide(h.parts.hat);
        else if (!h || !h.root.visible) hide(o.head);
      });
    } else {
      // 三人称：カメラから自分の頭までの筋の近くにいる味方
      const ax = u.pos.x - cx, az = u.pos.z - cz, L = Math.hypot(ax, az);
      if (L > 0.3) {
        const nx = ax / L, nz = az / L;
        const camY = cam.position.y, tY = u.pos.y + 1.7 + (this.mounted ? RIDE.y : 0);
        army.forNear((cx + u.pos.x) / 2, (cz + u.pos.z) / 2, L / 2 + 2, (o) => {
          if (!ally(o)) return;
          const vx = o.pos.x - cx, vz = o.pos.z - cz;
          const along = vx * nx + vz * nz;
          if (along <= 0 || along > L + 0.2) return;
          const side = Math.abs(vx * nz - vz * nx);
          const near = along < 3;
          if (side > (o.mounted ? 1.1 : 0.75) + (near ? 0.55 : 0.15)) return;
          // 遠めの者は、頭（指物なら竿の先）が視線より十分低ければ邪魔にならない
          const top = o.pos.y + (o.flag && o.flag.visible ? 3.2 : 1.95) + (o.mounted ? 1 : 0);
          const k = along / L;
          if (!near && top < camY + (tY - camY) * k - 0.5) return;
          if (along < 1.6 || k < 0.3) { hide(o.mesh); return; }
          // 薄さは三段：カメラに近いほど薄い
          const lv = k < 0.55 ? 0 : k < 0.8 ? 1 : 2;
          o.mesh.traverse((m) => {
            if (!m.isMesh || !m.visible || !m.material || Array.isArray(m.material)) return;
            S2.mats.push([m, m.material]);
            m.material = ditherMat(m.material, lv);
          });
        });
      }
    }
    this.fadeOn = S2;
  }

  updateCamera(dt, camera) {
    const u = this.u;
    // 乱戦の土煙：近くで大勢が斬り合っているほど、足もとから土煙が立つ（乾いた日だけ。半秒おきに数える）
    this.meleeDustT = (this.meleeDustT || 0) - dt;
    if (this.meleeDustT <= 0 && this.rt.world && this.rt.army && this.rt.army.forNear) {
      this.meleeDustT = 0.5;
      const W = this.rt.world;
      if (!(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5)) {
        const busy = [];
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
      const ranged = this.aiming && (this.weapon === 'gun' || this.weapon === 'bow') && !S.reduceMotion;
      this.aimHoldT = ranged ? (this.aimHoldT || 0) + dt : 0;
      const amp = ranged ? 0.014 * Math.exp(-this.aimHoldT * 2.4) + 0.0022 : 0;
      const tt = (this.swayClock = (this.swayClock || 0) + dt);
      const sy = Math.sin(tt * 1.3) * amp + Math.sin(tt * 2.9 + 1) * amp * 0.4, sp = Math.sin(tt * 1.7 + 2) * amp * 0.8;
      this.yaw += sy - (this.swayY || 0); this.pitch += sp - (this.swayP || 0);
      this.swayY = sy; this.swayP = sp;
    }
    // 馬上は目の高さが上がり、少し遠くから見る
    const bodySc = (u.mesh && u.mesh.scale.y) || 1;
    const target = new THREE.Vector3(u.pos.x, u.pos.y + (1.7 + (this.mounted ? RIDE.y : 0)) * bodySc, u.pos.z);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const running = Math.hypot(u.vel.x, u.vel.z) > 5;
    // 戦っている時は肩越しに近く（敵と自分が画面の左右に並ぶ）。走ると引いて速さを見せる
    const fight = this.inCombatT > 0 || this.lock;
    const base = this.cmdOpen || this.radial ? 7.5 : this.aiming ? 2.5 : this.guard ? 3.0 : running ? 5.2 : fight ? 3.0 : 4.0;
    // 一人称への寄り（0.3秒ほど。動きを減らす設定ならすぐ）
    const fpGoal = this.fpWanted() && !this.overHold ? 1 : 0;
    if (S.reduceMotion || dt >= 0.5) this.fpK = fpGoal;
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
    const fovWant = S.fov + phoneWide + (running && !S.reduceMotion ? 6 : 0) + e * 8 - (this.aimK || 0) * (e > 0.5 ? 24 : 12) + (S.reduceMotion ? 0 : this.fovKick);
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * (Math.abs(this.fovKick) > 0.3 ? 18 : 4)); camera.updateProjectionMatrix(); }
    // 目の前の手と武器が切れないよう、一人称では手前の切り口を近づける
    const nearWant = e > 0.5 ? 0.05 : 0.1;
    if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
    // 開戦の引き
    if (this.introT > 0) this.introT -= dt;
    const pr = this.introT > 0 && !S.reduceMotion ? Math.min(1, this.introT / 3.4) : 0;
    const pull = pr * pr * (3 - 2 * pr);
    // 大事な場面では、その方へ視点を向ける
    if (this.cine) {
      this.cine.t -= dt;
      const want = Math.atan2(this.cine.x - u.pos.x, this.cine.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 3);
      if (this.cine.t <= 0) this.cine = null;
    }
    // 行軍の間は少し引いて、斜め後ろから隊列の長さを見せる。勝った後は 3 秒かけてゆっくり上へ引き、旗の林と戦の跡を見せる
    const rt0 = this.rt;
    this.marchK = (this.marchK || 0) + ((rt0.phase === 'march' && !(this.inCombatT > 0) ? 1 : 0) - (this.marchK || 0)) * Math.min(1, dt * 0.8);
    if (rt0.over && rt0.result && !rt0.result.down && rt0.tracker && rt0.tracker.main === true && !S.reduceMotion) this.winK = Math.min(1, (this.winK || 0) + dt / 3); else this.winK = 0;
    const wk = this.winK * this.winK * (3 - 2 * this.winK);
    // 倒れた時：カメラがゆっくり上へ離れ、倒れた自分を見下ろす（意識が遠のく）
    this.downK = !u.alive && !S.reduceMotion ? Math.min(1, (this.downK || 0) + dt / 4) : 0;
    const dk = this.downK * this.downK * (3 - 2 * this.downK);
    // 大将の目：足軽 3m・組頭 6m・足軽大将 12m の高さへ上がり、少し引いて前の戦場を見下ろす
    const overH = this.G.rank >= 4 ? 12 : this.G.rank >= 2 ? 6 : 3;
    this.overK = (this.overK || 0) + ((this.overHold ? 1 : 0) - (this.overK || 0)) * Math.min(1, dt * (S.reduceMotion ? 30 : 4));
    const ok = this.overK * this.overK * (3 - 2 * this.overK);
    // 視点の遠さの三段（V の短押し・「視点」の釦で回す）
    const range = S.camRange === 'near' ? -0.9 : S.camRange === 'far' ? 2.2 : 0;
    // 硝煙・土煙の中では少し寄る（先が見えない怖さ。煙が晴れれば戻る）
    const W0 = rt0.world, smoke = W0 ? Math.min(1, ((W0.haze && W0.haze.k) || 0) + ((W0.dustVeil && W0.dustVeil.k) || 0) * 0.5) : 0;
    this.smokeK = (this.smokeK || 0) + (smoke - (this.smokeK || 0)) * Math.min(1, dt * 0.8);
    const dist = Math.max(2.2, (base + this.zoom + range + (this.mounted ? 1.6 : 0)) * (1 - this.smokeK * 0.18)) + pull * 7 + this.marchK * 2.5 + wk * 9 + ok * overH * 0.7 + ((rt0.holdPct || 0) > 0 ? 1.5 : 0) + dk * 2.5;   // 長押し（首取りなど）の間は少し引いて周りを見せる
    this.camDist = this.camDist ? this.camDist + (dist - this.camDist) * Math.min(1, dt * 3) : dist;
    this.sideK = (this.sideK ?? 0.65) + ((fight || this.guard ? 0.85 : 0.65) - (this.sideK ?? 0.65)) * Math.min(1, dt * 3);
    // 狭い所（門・塀の内）：肩の側が壁に近ければ、空いている逆の肩へカメラだけ回す（決めた肩の設定は変えない）
    this.wallT = (this.wallT || 0) - dt;
    if (this.wallT <= 0) {
      this.wallT = 0.3;
      const probe = (sg) => { const q = target.clone().addScaledVector(right, 1.3 * sg); return this.camBlockHit(target, q) !== null; };
      this.wallFlip = probe(this.shoulder) && !probe(-this.shoulder) ? -1 : 1;
    }
    this.shK = (this.shK ?? 1) + ((this.wallFlip || 1) - (this.shK ?? 1)) * Math.min(1, dt * 4);
    const side = (this.sideK * this.shoulder + pull * 4 * this.shoulder) * this.shK;
    const want = target.clone().addScaledVector(dir, -this.camDist).addScaledVector(right, side);
    // 組を率いているときは少し高い位置から見下ろす（部下で視界が塞がらないように）
    // 味方に囲まれて密集しているときは、少し高くから見る
    this.crowdT = (this.crowdT || 0) - dt;
    if (this.crowdT <= 0) { this.crowdT = 0.3; let n = 0; this.rt.army.forNear(u.pos.x, u.pos.z, 4, (o) => { if (o !== u && o.alive && o.team === u.team) n++; }); this.crowd = n; }
    // 持ち上げは小さく（見下ろしの絵にしない。前の味方は allyFade で透かす）。馬上は馬の首を越えて前が見える高さに
    this.crowdLift = (this.crowdLift || 0) + ((this.crowd > 5 ? 0.3 : 0) - (this.crowdLift || 0)) * Math.min(1, dt * 2);
    want.y += (this.rt.squad.length ? 0.35 : 0.15) - pull * 0.7 + this.crowdLift + (this.mounted ? 0.5 : 0) + this.marchK * 1.0 + wk * 6 + ok * overH + dk * 4;
    const gy = this.rt.world.heightAt(want.x, want.z) + 0.5;
    if (want.y < gy) want.y = gy;
    // 建物・柵・櫓がカメラと自分の間にあれば、その手前まで寄せる
    // 足場・櫓のような格子の物は、真ん中の一本の線だけだと隙間を抜けてしまうので、カメラの四隅寄りにも線を引いて一番手前で止める（隅は 3 コマに一度）
    let hit = this.camBlockHit(target, want);
    this.camCornT = ((this.camCornT || 0) + 1) % 3;
    if (this.camCornT === 0) {
      let hc = null;
      const up = new THREE.Vector3(0, 1, 0);
      for (const [a, b] of [[0.45, 0.3], [-0.45, 0.3], [0.45, -0.25], [-0.45, -0.25]]) {
        const q = want.clone().addScaledVector(right, a).addScaledVector(up, b);
        const h2 = this.camBlockHit(target, q);
        if (h2 !== null && (hc === null || h2 < hc)) hc = h2;
      }
      this.camCornHit = hc;
    }
    if (this.camCornHit != null && (hit === null || this.camCornHit < hit)) hit = this.camCornHit;
    if (hit !== null) want.lerpVectors(target, want, Math.max(0.12, hit - 0.06));
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    // 走る・駆ける時はカメラが少し遅れてついて来る（重さと速さが画面に出る）
    const lagK = this.mounted && Math.abs(this.hspd || 0) > 6 ? 7 : running ? 9 : 14;
    this.camPos.lerp(want, Math.min(1, dt * lagK));
    let look = target.clone().addScaledVector(dir, 12 + ok * overH * 1.5).addScaledVector(right, side);
    // 開戦の引き：膝ほどの低い所から、向こうに構える敵の群れの方を見る（両軍が向き合う絵）。終われば自分の向きへ戻る
    if (pull > 0.01) {
      if (!this.introFoe) {
        let sx = 0, sz = 0, n = 0;
        for (const o of this.rt.army.units) if (o.alive && o.team !== u.team && !o.isStruct) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < 260) { sx += o.pos.x; sz += o.pos.z; n++; } }
        this.introFoe = n ? { x: sx / n, z: sz / n } : { x: u.pos.x + dir.x * 60, z: u.pos.z + dir.z * 60 };
      }
      const F = this.introFoe, W = this.rt.world;
      look.lerp(new THREE.Vector3(F.x, W.heightAt(F.x, F.z) + 2.5, F.z), pull * 0.5);
    } else this.introFoe = null;
    if (dk > 0) look.lerp(new THREE.Vector3(u.pos.x, u.pos.y + 0.3, u.pos.z), dk * 0.85);
    // 狙い定めた時は、自分と相手の間を見る（二人が画面の左右に収まる対峙の構図）
    this.lockK = (this.lockK || 0) + ((this.lock && this.lock.alive ? 1 : 0) - (this.lockK || 0)) * Math.min(1, dt * 3);
    if (this.lockK > 0.01 && this.lock) {
      const L = this.lock.pos, mid = new THREE.Vector3((u.pos.x + L.x) / 2, (u.pos.y + L.y) / 2 + 1.3 * bodySc, (u.pos.z + L.z) / 2);
      look.lerp(mid, 0.4 * this.lockK);
    }
    // 坂：上り坂では目線を少し上げ、下り坂では下げる（地面で画面の半分が塞がらないように）
    {
      const W = this.rt.world, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const sl = (W.heightAt(u.pos.x + fx * 8, u.pos.z + fz * 8) - W.heightAt(u.pos.x, u.pos.z)) / 8;
      this.slopeK = (this.slopeK || 0) + (Math.max(-0.5, Math.min(0.5, sl)) - (this.slopeK || 0)) * Math.min(1, dt * 2);
      look.y += this.slopeK * 12 * 0.6;
    }
    camera.position.copy(this.camPos);
    if (this.camPush && this.camPush.t > 0) {
      this.camPush.t -= dt;
      const f = Math.max(0, this.camPush.t / 0.18);
      camera.position.x += this.camPush.x * f; camera.position.z += this.camPush.z * f;
    }
    if (e > 0) {
      const eye = this.eyePos(dt, dir);
      camera.position.lerp(eye, e);
      // 構えた時は目線を少し落とし、手元の構えが見えるように
      this.guardDip = (this.guardDip || 0) + ((this.guard ? 0.2 : 0) - (this.guardDip || 0)) * Math.min(1, dt * 8);
      look.lerp(eye.clone().addScaledVector(dir, 12).add(new THREE.Vector3(0, -12 * this.guardDip, 0)), e);
    }
    // 三人称の歩み：走ると肩越しのカメラも足の運びに合わせて小さく上下・左右に揺れる（手持ちの撮影のように）
    // 馬上は鞍の弾み（駆けるほど大きく、蹄の拍子で）。画面の揺れを切った時・動きを減らす時は揺らさない
    // 歩きの揺れは S.shakeWalk で別に切れる（無ければ S.shake に従う）
    const calm = !(S.shakeWalk ?? S.shake) || S.reduceMotion;
    const sp = Math.hypot(u.vel.x, u.vel.z);
    if (!calm && e < 0.5) {
      const k3 = 1 - e * 2;
      if (this.mounted) {
        const hs = Math.abs(this.hspd || sp);
        this.gaitT = (this.gaitT || 0) + dt * (hs > 9 ? 12 : hs > 4 ? 9 : 5);
        const a = Math.min(1, hs / 12) * 0.07 * k3;
        camera.position.y += Math.abs(Math.sin(this.gaitT)) * a - a * 0.5;
        look.y += Math.abs(Math.sin(this.gaitT + 0.6)) * a * 0.6;
      } else if (sp > 0.6) {
        this.gaitT = (this.gaitT || 0) + dt * (sp > 5 ? 10.5 : 7.5);
        const a = Math.min(1, sp / 6) * (sp > 5 ? 0.045 : 0.018) * k3;
        camera.position.y += Math.sin(this.gaitT * 2) * a;
        camera.position.addScaledVector(right, Math.sin(this.gaitT) * a * 0.8);
      }
    }
    // 揺れ：毎フレームのでたらめな跳びではなく、なめらかな揺れ（重なった波）で、強いほど速く・大きく。少し傾きも入る
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
    // 騎馬に倒された：視点が地面近くまで沈み、起き上がるにつれて戻る（動きを減らす設定では沈みを浅く）
    if (this.knockT > 0 && !this.mounted) {
      const k = Math.min(1, this.knockT / 0.5) * (S.reduceMotion ? 0.35 : 1);
      camera.position.y -= 0.9 * k; look.y -= 0.7 * k; roll += 0.12 * k;
    }
    // 見せ場の一枚（camShot。火縄の this.shot とは別）：低い所から見上げる数秒の絵。終われば元の視点へなめらかに戻る
    if (this.camShot) {
      const sh = this.camShot;
      sh.t += dt;
      const W = this.rt.world, k = S.reduceMotion ? 0 : Math.min(1, sh.t / 0.4, (sh.dur - sh.t) / 0.6);
      if (sh.t >= sh.dur) this.camShot = null;
      else if (k > 0) {
        const kk = k * k * (3 - 2 * k);
        const fx = typeof sh.from === 'function' ? sh.from() : sh.from, at = typeof sh.at === 'function' ? sh.at() : sh.at;
        // 撮る所はゆっくり横へ動く（手持ちで回り込むように）
        const drift = sh.t * (sh.drift || 0.6);
        const px = fx.x + Math.cos(sh.ang || 0) * drift, pz = fx.z + Math.sin(sh.ang || 0) * drift;
        camera.position.lerp(new THREE.Vector3(px, W.heightAt(px, pz) + (sh.h ?? 0.8), pz), kk);
        look.lerp(new THREE.Vector3(at.x, W.heightAt(at.x, at.z) + (sh.lookH ?? 2.2), at.z), kk);
      }
    }
    camera.lookAt(look);
    // 馬で曲がると体が内へ傾くように、カメラも少し傾ける
    if (this.mounted && !calm) {
      const turn = angleDiff(this.prevYawCam ?? u.heading, u.heading) / Math.max(dt, 1e-3);
      this.leanCam = (this.leanCam || 0) + (Math.max(-1, Math.min(1, turn * 0.5)) * 0.035 * Math.min(1, Math.abs(this.hspd || 0) / 8) - (this.leanCam || 0)) * Math.min(1, dt * 4);
      roll += this.leanCam * (1 - e);
    }
    this.prevYawCam = u.heading;
    if (e > 0 && this.fpRoll) roll += this.fpRoll * e;
    if (roll) camera.rotateZ(roll);
  }

  // 川・浅瀬の中にいるか（足音と蹄の音を水の音に替える）
  inWater() {
    const u = this.u, W = this.rt.world, Wd = W.def.water;
    if (Wd && u.pos.x > Wd.x && u.pos.x < (Wd.x2 ?? 1e9) && u.pos.y < (Wd.level ?? -99) + 0.4) return true;
    return (W.def.streams || []).some((st) => st.pts && distToPolyline(u.pos.x, u.pos.z, st.pts) < (st.w || 2) * 0.9);
  }

  // 一人称の目の位置（ならし・歩みの揺れ・柵や塀へのめり込み止め）
  eyePos(dt, dir) {
    const u = this.u;
    const raw = this.eyeRaw(new THREE.Vector3());
    // 足もとからのずれでならす（歩く速さで横に遅れない）。揺れを切った時は上下を強くならす
    const off = raw.sub(u.pos);
    const calm = !(S.shakeWalk ?? S.shake) || S.reduceMotion;
    if (!this.eyeOff || dt >= 0.5) this.eyeOff = off.clone();
    else {
      const kh = Math.min(1, dt * 14), kv = Math.min(1, dt * (calm ? 2.5 : 10));
      this.eyeOff.x += (off.x - this.eyeOff.x) * kh;
      this.eyeOff.z += (off.z - this.eyeOff.z) * kh;
      this.eyeOff.y += (off.y - this.eyeOff.y) * kv;
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const eye = new THREE.Vector3(u.pos.x + this.eyeOff.x + fx * 0.1, u.pos.y + this.eyeOff.y, u.pos.z + this.eyeOff.z + fz * 0.1);
    // 歩みの小さな上下（画面の揺れの設定を守る）。馬上は鞍の弾みがそのまま出るので足さない
    const sp = Math.hypot(u.vel.x, u.vel.z);
    if (!calm && !this.mounted && sp > 0.5) {
      this.bobT += dt * (sp > 5 ? 11 : 8);
      const ba = Math.min(1, sp / 3.7) * (sp > 5 ? 0.035 : 0.022);
      eye.y += Math.sin(this.bobT) * ba;
      // 左右の足に体重が移る揺れと、踏み出しの小さな傾き
      eye.x += -fz * Math.sin(this.bobT * 0.5) * ba * 0.7; eye.z += fx * Math.sin(this.bobT * 0.5) * ba * 0.7;
      this.fpRoll = Math.sin(this.bobT * 0.5) * ba * 0.12;
    } else this.fpRoll = (this.fpRoll || 0) * 0.9;
    // 柵・塀・建物へ目が入り込まないよう、体の芯から目の少し先までを調べて手前で止める
    const from = new THREE.Vector3(u.pos.x, eye.y, u.pos.z);
    const ahead = eye.clone().addScaledVector(dir, 0.3);
    const hit = this.camBlockHit(from, ahead);
    if (hit !== null) {
      const len = from.distanceTo(ahead);
      const d = Math.max(-0.2, len * hit - 0.3);
      eye.copy(from).addScaledVector(ahead.clone().sub(from).normalize(), d);
    }
    // 柵のすぐ内：馬防柵の上の横木（1.45m）がちょうど目の高さを塞ぐので、少し背を伸ばして横木の上の隙間から前を見る
    this.fenceT = (this.fenceT || 0) - dt;
    if (this.fenceT <= 0) {
      this.fenceT = 0.25;
      const far = eye.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 1.4);
      this.nearFence = !this.mounted && this.camBlockHit(from, far) !== null;
    }
    this.fenceLift = (this.fenceLift || 0) + ((this.nearFence ? 0.2 : 0) - (this.fenceLift || 0)) * Math.min(1, dt * 4);
    eye.y += this.fenceLift;
    const g = this.rt.world.heightAt(eye.x, eye.z) + 0.3;
    if (eye.y < g) eye.y = g;
    return eye;
  }
}
