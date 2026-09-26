import * as THREE from 'three';
import { ITEMS, equipDef, ladderStep, canRide, myHorse, scenario } from './state.js';
import { angleDiff, weaponMesh, buildHorse, animateHorse, RIDE, coatOf } from './units.js';
import { distToPolyline } from './world.js';
import { sfx } from './audio.js';
import { S, DIFFICULTY, K, saveSettings } from './settings.js';

// 味方を透かす材質：元の材質ごとに三段（ディザで抜く。並べ替え不要で、重なっても乱れない）
const DITHER_A = [0.3, 0.5, 0.72];
const ditherCache = new WeakMap();
function ditherMat(m, lv) {
  if (m.userData.dither != null) return m;
  let a = ditherCache.get(m);
  if (!a) { a = []; ditherCache.set(m, a); }
  if (!a[lv]) {
    const f = m.clone();
    f.alphaHash = true; f.opacity = m.opacity * DITHER_A[lv];
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

export function commandList(rank) {
  const base = [
    { k: '1', q: K('follow'), id: 'follow', label: 'ついて来い', desc: '自分の後ろに付いて動く' },
    { k: '2', q: K('hold'), id: 'hold', label: '待て', desc: 'その場で踏みとどまる' },
    { k: '3', q: K('attack'), id: 'attack', label: '突撃', desc: '近くの敵へ斬り込む' },
    { k: '4', q: K('retreat'), id: 'retreat', label: '退け', desc: '後ろへ下がって立て直す' },
    { k: '5', id: 'focus', label: '敵を狙え', desc: '照準の先の敵を集中して討つ' },
  ];
  if (rank >= 2) {
    base.push({ k: '6', id: 'move', label: '前進', desc: '照準の先の地点へ進む' });
    base.push({ k: '7', id: 'yari', label: '槍衾', desc: '横一列で槍を揃え正面を固める' });
    base.push({ k: '8', id: 'fire', label: '射撃／停止', desc: '弓・鉄砲の射撃を切り替える' });
    base.push({ k: '9', id: 'form', label: '陣形', desc: '横陣→縦陣→散開' });
  }
  return base;
}

const QUICK = { KeyZ: 'follow', KeyX: 'hold', KeyC: 'attack', KeyN: 'retreat' };

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
    // 気力は馬上では並足の分だけ戻る
    this.staDelay -= dt;
    if (this.staDelay <= 0) this.sta = Math.min(this.maxSta, this.sta + (this.guard ? 5 : 18) * dt);
    const vx = Math.sin(u.heading) * this.hspd, vz = Math.cos(u.heading) * this.hspd;
    u.pos.x += vx * dt; u.pos.z += vz * dt;
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
      if (this.stepT <= 0) { this.stepT = sp > 7 ? 3.4 : 2.4; sfx('hooves', sp > 7 ? 0.6 : 0.35); if (sp > 7 && rt.world.rainLevel < 0.3) rt.world.puff(u.pos.x, u.pos.z, 4); }
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
    const hud = this.rt.hud;
    if (src && !src.isStruct) {
      const dx = src.pos.x - u.pos.x, dz = src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      hud.damageFrom(Math.atan2(dx, dz) - this.yaw, amount);
      if (dot < -0.35 && Math.random() < 0.35) this.rt.bark('後ろだ！', true);
      if (this.guard && this.sta > 0 && dot > 0.25) {
        // 構えた直後なら受け流し（相手の体勢を崩し、反撃の好機）。打刀は猶予が長い
        if (this.guardT < (this.weapon === 'sword' ? 0.3 : 0.22)) {
          this.rt.stats.parries++;
          this.rt.tutMark('parry');
          sfx('parry', 1);
          src.stagger = 1.1; src.atk = null; src.cd = 1.3;
          this.counterT = 1.3;
          this.rt.game.slowmo = 0.35;
          this.sta = Math.min(this.maxSta, this.sta + 10);
          hud.flash('受け流し', 'gold');
          this.rt.hint('counter');
          return 0;
        }
        this.sta -= amount * 1.3;
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
    hud.hurt(0.4);
    this.addShake(0.16);
    this.rt.hint('guard');
    this.rt.game.vibrate(0.5, 120);
    let taken = amount * (1 - this.def) * this.D.taken;
    // 馬上では、傷の一部を馬が受ける
    if (this.mounted) { this.horseHurt(taken * 0.5); taken *= 0.65; }
    return taken;
  }

  update(dt, input) {
    const u = this.u;
    if (!u.alive) return;
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
    if (input.pressed('KeyV')) this.toggleView();
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
        if (this.radial) {
          // 輪を開いたまま G で号令先（全隊・槍・鉄砲・弓・騎馬）を切り替えられる
          if (input.pressed('KeyG')) this.cycleGroup();
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
      for (const c of commandList(this.G.rank)) if (input.pressed('Digit' + c.k)) { this.command(c.id); this.cmdOpen = false; }
      if (input.pressed('KeyG')) { this.cycleGroup(); this.cmdOpenT = 0; }
    } else {
      if (input.pressed('Digit1') && this.weapon !== 'spear') this.switchWeapon('spear');
      if (input.pressed('Digit2') && this.hasKatana && this.weapon !== 'sword') this.switchWeapon('sword');
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
    const wantGuard = (S.guardToggle ? this.guardOn : input.right) && this.sta > 0 && this.guardBroken <= 0;
    if (wantGuard && !this.guard) this.guardT = 0;
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
      const canRun = this.running && this.sta > 5 && ml > 0 && !this.guard;
      const speed = (this.guard ? 2.0 : canRun ? 6.4 : 3.7) * ml;
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
      // 加減速をなめらかに
      const acc = Math.min(1, dt * (ml > 0 ? 14 : 18));
      this.vel.x += (tvx - this.vel.x) * acc;
      this.vel.z += (tvz - this.vel.z) * acc;
      let vx = this.vel.x, vz = this.vel.z;
      if (this.dodgeT > 0) { vx = this.dodgeDir.x * 8.5; vz = this.dodgeDir.z * 8.5; }
      u.pos.x += vx * dt; u.pos.z += vz * dt;
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
          sfx(W.rainLevel > 0.3 ? 'stepWet' : sandy ? 'stepSand' : onPath ? 'stepPath' : 'step', 0.6); if (this.def > 0.1) sfx('clank', 0.8); if (sp > 5) rt.world.puff(u.pos.x, u.pos.z, 3);
        }
        rt.stats.dist += sp * dt;
      }
      // 移動中にしばらく視点を動かさなければ、カメラが背後へ回り込む
      if (S.autoCam && !this.lock && ml > 0 && this.lookIdle > 1 && iz >= 0) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * 1.2);
      // 向き：構え・攻撃・狙い定め中はカメラ方向、それ以外は進行方向
      let want = null;
      // 一人称では、体はいつも見ている方を向く（振り向くと自分の背が見える、を防ぐ）
      if (this.guard || this.pending || input.left || this.inCombatT > 0 || this.lock || this.fpK > 0.5) want = this.yaw;
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

    // ---- 自然回復 ----
    if (u.lastHitT > 6) u.hp = Math.min(u.maxHp, u.hp + this.D.regen * dt);
    this.rallyCd -= dt;
    this.shake = Math.max(0, this.shake - dt * 1.2);
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
    this.cd = Math.max(this.cd, 0.35);  // 持ち替えの隙
    u.hand.remove(u.wpn);
    u.wpn = w === 'sword' ? this.swordMesh : this.spearMesh;
    u.hand.add(u.wpn);
    u.wpnKind = w;
    this.weapon = w;
    sfx('ui');
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
      if (!h.length && S.aimAssist) {
        h = army.enemiesInArc(u.pos, heading, reach, half + this.D.aim, u.team);
        if (h.length) u.heading = Math.atan2(h[0].u.pos.x - u.pos.x, h[0].u.pos.z - u.pos.z);
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
    u.swing = { kind: swKind, t: 0, dur: kind === 'sweep' ? 0.34 : 0.22, at: 0, done: true, res: null, target: hits[0] ? hits[0].u : null, d: hits[0] ? hits[0].d : 0, side: 1 };
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
    if (hits.length) {
      // 手応え：重い一撃ほど長く止まる。甲冑に当たれば金の音
      const heavy = kind === 'charged' || (kind === 'thrust' && third) || counter;
      this.rt.game.hitstop = Math.max(this.rt.game.hitstop || 0, heavy ? 0.1 : kind === 'sweep' ? 0.06 : 0.045);
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
  selectedGroups() {
    const gs = this.rt.squadGroups;
    if (this.selGroup !== 'all') { const s = gs.filter((g) => g.kind === this.selGroup); if (s.length) return s; }
    return gs;
  }

  command(id) {
    const rt = this.rt;
    const u = this.u;
    const gs = this.selectedGroups();
    if (!gs.length || !rt.squad.some((s) => s.alive)) return;
    sfx('taiko', 0.35);
    const lines = {
      follow: '者ども、ついて来い！', hold: 'その場で待て！', attack: 'かかれっ！突っ込め！', retreat: '退けっ、退けい！',
      focus: 'あの者を狙え！', move: 'あの地点まで進め！', yari: '槍衾を組め！',
    };
    if (id === 'fire') {
      // 弓・鉄砲の射撃を切り替える（号令先が弓か鉄砲なら、その隊だけ）
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) return;
      const on = !shooters[0].fire;
      for (const g of shooters) g.fire = on;
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
  }

  updateSquad(dt) {
    const u = this.u;
    for (const g of this.rt.squadGroups) {
      if (g.order === 'follow') {
        const back = g.kind === 'bow' || g.kind === 'gun' ? 9.5 : g.kind === 'cavalry' ? 8 : 5.2;
        const want = { x: u.pos.x - Math.sin(u.heading) * back, z: u.pos.z - Math.cos(u.heading) * back };
        g.anchor.x += (want.x - g.anchor.x) * Math.min(1, dt * 2.5);
        g.anchor.z += (want.z - g.anchor.z) * Math.min(1, dt * 2.5);
        g.facing += angleDiff(g.facing, u.heading) * Math.min(1, dt * 2);
        g.aggro = 8;
      }
      if (g.order === 'retreat') {
        const c = g.center();
        if (Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z) < 4) { g.order = 'hold'; g.aggro = 6; }
      }
    }
  }

  // 自分からカメラへの線が、建物などに当たるか（当たれば 0〜1 の割合）
  camBlockHit(from, to) {
    const rt = this.rt;
    this.camT = (this.camT || 0) + 1;
    if (!this.blockers || this.camT % 30 === 0) {
      // 近くの建物だけを数十コマおきに拾い直す
      const list = [];
      rt.scene.traverse((o) => { if (o.userData.camBlock && o.visible !== false) { o.updateWorldMatrix(true, false); if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld); if (c.distanceTo(from) < o.geometry.boundingSphere.radius + 14) list.push(o); } });
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
  toggleView() {
    S.view = S.view === 'first' ? 'third' : 'first';
    saveSettings();
    sfx('ui');
    this.rt.hud.flash(S.view === 'first' ? '一人称（自分の目で見る）' : '三人称（背中から見る）', 'dim');
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
    } else out.set(u.pos.x, u.pos.y + 1.56 + (this.mounted ? RIDE.y : 0), u.pos.z);
    return out;
  }
  // 描く直前（on）と後：一人称の時だけ、自分の頭（兜・陣笠・顔）と背の指物・馬印を隠す。腕・手・武器・胴・脚は見せる
  fpHide(on, cam) {
    if (!on) {
      if (this.hid) { for (const o of this.hid) o.visible = true; this.hid = null; }
      if (this.hidHead) { this.hidHead.scale.setScalar(1); this.hidHead = null; }
      this.allyFade(null);
      return;
    }
    const rt = this.rt, u = this.u;
    if (cam === rt.camera && !(rt.game && rt.game.photo)) this.allyFade(cam);
    if (cam !== rt.camera || this.fpK < 0.72 || (rt.game && rt.game.photo) || !u.alive) return;
    const hid = [];
    for (const o of [u.flag, u.uma]) if (o && o.visible) { o.visible = false; hid.push(o); }
    const h = u.human;
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
    const ally = (o) => o !== u && o.alive && o.team === u.team && !o.isStruct && !o.imp && o.mesh && o.mesh.visible;
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
    // 馬上は目の高さが上がり、少し遠くから見る
    const target = new THREE.Vector3(u.pos.x, u.pos.y + 1.7 + (this.mounted ? RIDE.y : 0), u.pos.z);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const running = Math.hypot(u.vel.x, u.vel.z) > 5;
    const base = this.cmdOpen || this.radial ? 7.5 : this.guard ? 3.3 : running ? 5.2 : this.inCombatT > 0 || this.lock ? 3.7 : 4.4;
    // 一人称への寄り（0.3秒ほど。動きを減らす設定ならすぐ）
    const fpGoal = this.fpWanted() ? 1 : 0;
    if (S.reduceMotion || dt >= 0.5) this.fpK = fpGoal;
    else this.fpK += Math.sign(fpGoal - this.fpK) * Math.min(Math.abs(fpGoal - this.fpK), dt / 0.3);
    const e = this.fpK * this.fpK * (3 - 2 * this.fpK);
    // 走ると視野が少し広がる。一人称は設定の視野より少し広く
    const fovWant = S.fov + (running && !S.reduceMotion ? 6 : 0) + e * 8;
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    // 目の前の手と武器が切れないよう、一人称では手前の切り口を近づける
    const nearWant = e > 0.5 ? 0.05 : 0.1;
    if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
    // 開戦の引き
    if (this.introT > 0) this.introT -= dt;
    const pull = this.introT > 0 && !S.reduceMotion ? Math.min(1, this.introT / 1.2) : 0;
    // 大事な場面では、その方へ視点を向ける
    if (this.cine) {
      this.cine.t -= dt;
      const want = Math.atan2(this.cine.x - u.pos.x, this.cine.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 3);
      if (this.cine.t <= 0) this.cine = null;
    }
    const dist = Math.max(2.2, base + this.zoom + (this.mounted ? 1.6 : 0)) + pull * 7;
    this.camDist = this.camDist ? this.camDist + (dist - this.camDist) * Math.min(1, dt * 3) : dist;
    const side = 0.6 * this.shoulder;
    const want = target.clone().addScaledVector(dir, -this.camDist).addScaledVector(right, side);
    // 組を率いているときは少し高い位置から見下ろす（部下で視界が塞がらないように）
    // 味方に囲まれて密集しているときは、少し高くから見る
    this.crowdT = (this.crowdT || 0) - dt;
    if (this.crowdT <= 0) { this.crowdT = 0.3; let n = 0; this.rt.army.forNear(u.pos.x, u.pos.z, 4, (o) => { if (o !== u && o.alive && o.team === u.team) n++; }); this.crowd = n; }
    this.crowdLift = (this.crowdLift || 0) + ((this.crowd > 5 ? 1.1 : 0) - (this.crowdLift || 0)) * Math.min(1, dt * 2);
    want.y += (this.rt.squad.length ? 0.75 : 0.25) + pull * 3.5 + this.crowdLift;
    const gy = this.rt.world.heightAt(want.x, want.z) + 0.5;
    if (want.y < gy) want.y = gy;
    // 建物・柵・櫓がカメラと自分の間にあれば、その手前まで寄せる
    const hit = this.camBlockHit(target, want);
    if (hit !== null) want.lerpVectors(target, want, Math.max(0.12, hit - 0.06));
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    this.camPos.lerp(want, Math.min(1, dt * 14));
    let look = target.clone().addScaledVector(dir, 12).addScaledVector(right, side);
    camera.position.copy(this.camPos);
    if (e > 0) {
      const eye = this.eyePos(dt, dir);
      camera.position.lerp(eye, e);
      // 構えた時は目線を少し落とし、手元の構えが見えるように
      this.guardDip = (this.guardDip || 0) + ((this.guard ? 0.2 : 0) - (this.guardDip || 0)) * Math.min(1, dt * 8);
      look.lerp(eye.clone().addScaledVector(dir, 12).add(new THREE.Vector3(0, -12 * this.guardDip, 0)), e);
    }
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * (1 - 0.5 * e);
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(look);
  }

  // 一人称の目の位置（ならし・歩みの揺れ・柵や塀へのめり込み止め）
  eyePos(dt, dir) {
    const u = this.u;
    const raw = this.eyeRaw(new THREE.Vector3());
    // 足もとからのずれでならす（歩く速さで横に遅れない）。揺れを切った時は上下を強くならす
    const off = raw.sub(u.pos);
    const calm = !S.shake || S.reduceMotion;
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
      eye.y += Math.sin(this.bobT) * Math.min(1, sp / 3.7) * (sp > 5 ? 0.035 : 0.022);
    }
    // 柵・塀・建物へ目が入り込まないよう、体の芯から目の少し先までを調べて手前で止める
    const from = new THREE.Vector3(u.pos.x, eye.y, u.pos.z);
    const ahead = eye.clone().addScaledVector(dir, 0.3);
    const hit = this.camBlockHit(from, ahead);
    if (hit !== null) {
      const len = from.distanceTo(ahead);
      const d = Math.max(-0.2, len * hit - 0.3);
      eye.copy(from).addScaledVector(ahead.clone().sub(from).normalize(), d);
    }
    const g = this.rt.world.heightAt(eye.x, eye.z) + 0.3;
    if (eye.y < g) eye.y = g;
    return eye;
  }
}
