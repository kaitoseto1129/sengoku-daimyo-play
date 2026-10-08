import { woundTick } from './wounds.js';
import { gunWeather, rangedSupply } from './weapon_reality.js';
import { nanbanLook } from './nanban.js';
import { recoverGround, mountainWay } from './army_local_way.js';
import { officerSetup, officerEscort } from './officer.js';
import { cavalryRole } from './cavalry_tactics.js';
import { weatherSight, weatherSees } from './weather_gameplay.js';
import { INTERIOR_WALLS, interiorBlocked } from './shironaka.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, drawMon } from './textures.js';
import { sfx, withPan } from './audio.js';
import { S } from './settings.js';
import { WIND_STATE } from './world.js';
import { updateWaterBody, waterMaterial, waterBatchKey, refreshWaterMaterials } from './water_body.js';
// 役目ごとに分けたファイル
import { Group, Unit } from './units_group.js';
import { FACTION, TYPES, GENERALS, SKIN_TONES } from './units_data.js';
import { buildModel } from './units_look.js';
import { groundAt } from './floors.js';
import { palOf } from './unit_pal.js';
import { horseStyleFor, buildHorse, paint, at, MAT, MAT_I, MAT_P, P, merge, RIDE, seatLegs, rng, flagGeo, EMBER_GEO } from './units_model.js';
import { numberedFlag, FLAG_T, FLAG_W, fadedFlag, fadedWeapon, IMP, BATCH, LOD } from './units_flags.js';
import { ArmyCombat } from './army_combat.js';
import { ArmyFx } from './army_fx.js';
import { ArmyRanged } from './army_ranged.js';
import { ArmyGroups } from './army_groups.js';
import { ArmyThink } from './army_think.js';
import { ArmyDuel } from './army_duel.js';
import { ArmyMove } from './army_move.js';
import { ArmyAnim } from './army_anim.js';
import { ArmyGround } from './army_ground.js';
import { signalWait } from './army_signals.js';
export { MK, UNIT_MAT, UNIT_WET, haoriFold, HORSE_HOOK, poseArms, SPEARS, spearSpec, arrowGeometry, makeWeapon, setBowDraw, kickSpear, ENEMY_HORSE, COATS, coatOf, animateHorse, soheiLook, headEnvelope, katoGeometry } from './units_model.js';
export { weaponMesh, LOD, IDLE } from './units_flags.js';
export { lookParts } from './units_look.js';
export { FORM_JA } from './units_group.js';
export { TYPES, GENERALS, SKIN_TONES, FACTION, RIDE, seatLegs, horseStyleFor, buildHorse, FLAG_T, IMP, buildModel, Group, Unit };
export { HOUSE_NAME, SWING, STAIN_PLANE, STAIN_TEX, roundDot, PCOL, erf, segHit, TOFF, clamp01, SW_POSE, SW_HASSO, SW_JODAN, lerpPose, RELOAD, GUN_POSE, BOW_POSE, _nk, _dUp, _dN, _dQ, _dI };

const TOFF = typeof location !== 'undefined' && /[?&]toff\b/.test(location.search);   // 試し：緊迫の仕組みを切る
let TATAKE_GEO = null;
const NO_OBR = THREE.Object3D.prototype.onBeforeRender;   // 部品ごとの描く前の仕掛けが無い印   // 竹束の形（giveTatake で一度だけ作る）
// 重なる音をまとめる：[そのまま鳴らす数, まとめた音の名]
const SOUND_BUNCH = { gun: [2, 'volley'], string: [3, 'volleyBow'], arrow: [3, null], hooves: [2, 'gallop'], neigh: [2, null], kin: [3, null], yoroi: [3, null], thunk: [3, null], hizara: [2, null], hit: [4, null] };
// 史実で生き延びる武将（invuln）の体力の下限（最大の何割）。ここまで削ると手傷を負って退く
export const WOUND_FLOOR = 0.35;
// 倒れる動き（animDeath）の長さ。これより後の倒れた体は、最後の姿勢のまま止める
export const DEATH_END = 2.2;
// 本物の兵（CPU で動かす者）の上限。姉川のように大軍がぶつかる戦でも、重さが兵の数に引きずられないように
const REALCAP = { low: 120, mid: 180, high: 250 };
const byCameraDistance = (a, b) => (a.camD || 0) - (b.camD || 0);
// 遠い行軍・待機だけを間引く。接敵の確認は既存の升目と同じ関数を使い回す。
function senseDetailEnemy(o, u) {
  if (!o.alive || o.team === u.team || o.noTarget || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
  if (dx * dx + dz * dz < 196) u.detailEnemy = true;
}
function detailInterval(army, u, dist) {
  if (dist <= 60 || u.name || u.isSub || u.target || u.atk || u.swing || u.bind || u.charging ||
      u.climb || u.perch || u.naka || u.hit || u.stagger > 0 || u.downed || u.pinT > army.time ||
      u.woundOut || u.rearWound || u.fleeing || u.group.routed || u.contactStopT > 0 ||
      Math.abs(u.push.x) + Math.abs(u.push.z) > 0.1) return 0;
  if (!(u.detailSenseAt > army.time)) {
    u.detailEnemy = false;
    army.forNear(u.pos.x, u.pos.z, 14, senseDetailEnemy, u);
    u.detailSenseAt = army.time + 0.2 + (u.id % 5) * 0.02;
  }
  return u.detailEnemy ? 0 : dist > 100 ? 0.1 : 0.05;
}
const unitMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
// 遠景の束へ替えた兵・見えない兵の部品は辿らない。再表示時に全て求め直す。
// 当たりや得物が直接求める updateWorldMatrix は従来のまま使える。
function visibleUnitMatrixWorld(force) {
  if (S.quality !== 'low' || this.visible) unitMatrixWorld.call(this, force);
}
const _dUp = new THREE.Vector3(), _dN = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dI = new THREE.Quaternion();
const _camTip = new THREE.Vector3(), _camButt = new THREE.Vector3();

// 着物の色のずれ：k=0 そのまま、1 少し暗く柿渋（赤茶）寄り、2 少し明るく褪せる（灰に寄る）
const _cv = new THREE.Color(), _cw = new THREE.Color();
function clothVar(hex, k) {
  if (!k) return hex;
  _cv.setHex(hex);
  // 1：柿渋・土に染まって赤茶へ　2：日に褪せて灰がかる　3：洗いざらしで白ちゃける　4：泥で暗く濁る
  if (k === 1) { _cv.multiplyScalar(0.95); _cv.lerp(_cw.setHex(0x5a3522), 0.16); }
  else if (k === 2) { _cv.multiplyScalar(1.1); _cv.lerp(_cw.setHex(0x5c5a52), 0.2); }
  else if (k === 3) { _cv.lerp(_cw.setHex(0x6a6454), 0.3); }
  else { _cv.multiplyScalar(0.82); _cv.lerp(_cw.setHex(0x3a2e20), 0.2); }
  return _cv.getHex();
}

// ---------------- 軍勢の管理 ----------------
// まとめて描く兵の種類の番号（軽い兵の形：0 槍 1 鉄砲 2 弓 3 侍）
const IMP_KIND = { ashigaru: 0, gun: 1, bow: 2, samurai: 3 };
export class Army {
  constructor(scene, world, hooks = {}) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.units = [];
    this.yieldPoints = [];
    this.lodCandidates = [];
    this.moraleSense = { u: null, horse: null, horseD: 100, runner: null, runners: 0 };
    this.groups = [];
    this.structs = [];
    this.arrows = [];
    this.dead = [];
    this.grid = new Map();
    this.cell = 6;
    this.lodT = 0;
    this.time = 0;
    this.buildParticles();
    this.tmpSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
  }

  addGroup(o) {
    const g = new Group(o);
    this.groups.push(g);
    return g;
  }

  addUnit(g, o) {
    // 古い戦の定義で別の家を借りている隊も、指定した旗に具足と衣を合わせる
    const fac = FACTION[o.flag] || (o.flag === 'namu' ? FACTION.ikko : o.flag === 'sagarifuji' ? FACTION.honganji : null)
      || FACTION[g.faction] || FACTION.oda;
    const u = new Unit({ team: g.team, ...o });
    u.group = g;
    u.slot = g.initial;
    g.units.push(u);
    g.initial++;
    const t = TYPES[u.type];
    // 名のある実在の武将は、その人の兜・甲冑・陣羽織で
    const gen = (o.name && GENERALS[o.name.replace(/^.* /, '')]) || {};
    // 大名・名将（gen.lord）：自分から斬り合いに出ず、指図は後ろから（army_think.js の持ち場判定で使う）
    u.isLord = !!gen.lord;
    officerSetup(u);
    // 母衣衆（使番）は大将のいる隊の騎馬の二騎だけ（大将のそばに付く）。残りの騎馬は指物を立て、旗の林にする
    const horoCav = u.type === 'cavalry' && o.flag === undefined && (g._horoN || 0) < 2 && g.units.some((x) => x.type === 'busho');
    if (horoCav) g._horoN = (g._horoN || 0) + 1;
    cavalryRole(u, g, o, horoCav);
    if (horoCav) o = { ...o, flag: null };
    // 見た目の組み合わせ（一人ずつ変えるが、形の数が増えすぎないよう六通りに束ねる）
    const vi = u.id % 6;
    // 装備とは別の個体差。作る時だけ求め、形・材質・描く束は増やさない。
    const physique = (salt) => (Math.imul(u.id ^ salt, 1597334677) >>> 0) / 4294967296;
    // 画質「低」（携帯）：顔と着物のずれを減らし、同じ形の兵を増やす（形ごとに一つずつ描く回数が、兵の数に比べて多すぎるので）
    const lowQ = S.quality === 'low';
    const tier = u.type === 'player' ? (o.tier ?? 0) : gen.armor ? 3 : u.type === 'busho' ? 3 : (u.type === 'samurai' || u.type === 'cavalry') ? 1 : 0;
    const privateArmor = tier === 1 && !gen.armor;
    const loanArmor = tier === 0 && ['ashigaru', 'bow', 'gun'].includes(u.type);
    const armor = o.armor ?? gen.armor ?? (u.type === 'busho' ? (fac.busho ?? 0x1c1a1a) : privateArmor && fac.flag !== 'akazonae' ? [fac.armor, 0x1c1a1a, 0x33291f, 0x24221f, 0x2a1c18, 0x151312][vi] : fac.armor);
    const look = {
      armor, helm: o.helm ?? gen.helm ?? armor,
      hatColor: o.hatColor ?? (loanArmor ? armor : undefined),
      doStyle: o.doStyle ?? (loanArmor ? 'okegawa' : privateArmor && vi % 3 === 1 ? 'okegawa' : undefined),
      // 貸し具足の威は家で揃え、私物の具足だけ色を変える
      lace: o.lace ?? gen.lace ?? (loanArmor ? fac.lace : [fac.lace, fac.lace2 || fac.lace, fac.lace3 || fac.lace][vi % 3]),
      // 足軽は揃いの陣笠。侍の兜は六通りの組み合わせ（指定した姿は優先）
      hat: (gen.hatFix && gen.hat) || (o.hat ?? gen.hat ?? (u.type === 'busho' ? 'kabuto_b' : privateArmor ? ['kabuto', 'kabuto_m', 'kabuto', 'kabuto_f', 'kabuto_w', 'kabuto_m'][vi] : t.hat)),
      tenugui: tier === 0 && vi === 2,
      hachi: o.hachi,   // 鉢巻の色（手ごとに変えて、味方の手を見分ける）
      sode: o.sode ?? (u.type === 'samurai' || u.type === 'cavalry' || u.type === 'busho'),
      kote: o.kote ?? (tier >= 1 ? 3 : undefined),
      haori: o.haori ?? gen.haori ?? (u.type === 'busho' ? (fac.haori ?? (g.team === 0 ? 0x6b1f18 : 0x5a4a22)) : 0),
      pole: o.flag !== null && u.type !== 'porter',
      flag: o.flag === null || u.type === 'porter' ? null : (o.flag || gen.flag || fac.flag),
      // 旗の大きさで隊が分かる：鉄砲は小旗、騎馬は大きな指物
      flagScale: o.flagScale ?? (u.type === 'busho' ? 1.3 : u.type === 'gun' ? 0.55 : privateArmor ? [0.85, 1, 1.1, 0.95, 1.2, 1.05][vi] : 1),
      flagShape: o.flagShape ?? (privateArmor ? vi % 3 : 0),
      standard: o.standard || null,
      weapon: o.weapon || t.weapon,
      // 足軽の槍は長柄（5m ほど）
      weaponExtra: o.weaponExtra ?? 0,
      // 槍の拵え：足軽は長柄（三間。織田は三間半）、騎馬と侍は素槍、武将は大身槍
      spear: o.spear ?? (o.weaponExtra != null ? null : u.type === 'ashigaru' && !o.weapon ? (g.faction === 'oda' ? 'nagae35' : 'nagae') : u.type === 'busho' ? 'omi' : 'su'),
      skin: o.skin ?? gen.skin ?? SKIN_TONES[vi],
      // 顔：名のある武将はその人の顔、本人は本人の顔、兵は十二の顔から
      face: o.face ?? (gen.face ? 'g:' + o.name.replace(/^.* /, '') : ((lowQ ? vi : u.id) * 7) % 12),
      // 鎧下・袴の色：藍・茶・鼠・黒
      //   同じ色でも人ごとに明るさと色あいを ±6% ずらす（褪せた藍・柿渋寄り・生成り寄り。形の数が増えすぎないよう三通り）
      cloth: o.cloth ?? clothVar((fac.cloth || [0x2b2622, 0x262c3a, 0x3a2e24, 0x34342e, 0x262c3a, 0x2b2622])[vi], lowQ ? 0 : Math.floor(u.id / 6) % 5),
      saya: u.type === 'samurai' || u.type === 'busho' || u.type === 'cavalry' || o.saya,
      menpo: o.menpo ?? (gen.armor ? gen.menpo || 0 : (u.type === 'busho' && vi % 2 === 0 ? 0x6a1c14 : u.type === 'samurai' && u.id % 2 === 0 ? 0x1c1a18 : 0)),
      menpoStyle: o.menpoStyle ?? gen.menpoStyle ?? (u.type === 'busho' ? 'hanbo' : 'full'),
      // 母衣は母衣衆（騎馬の使番）と、史実で母衣を着けた武将（前田利家の赤母衣など）だけ
      //   織田の使番は黄母衣と赤母衣、ほかの家は威糸の色
      horo: o.horo ?? gen.horo ?? (horoCav ? (g.faction === 'oda' ? (g._horoN === 1 ? 0xb8902a : 0x9a2418) : fac.lace) : 0),
      tier, vi, mon: o.mon ?? gen.mon ?? fac.flag, haoriMonCol: gen.haoriMonCol,
      trim: o.trim || 0, left: o.left || null, uma: o.uma || null, dirt: o.dirt, hero: u.type === 'player',
      // 本物の胴丸（humans.js の3Dスキャン）を着る（侍大将より上の本人など）
      real: o.real || 0,
      // 僧兵（humans.js で白い裹頭・袈裟・薙刀を着せる）
      sohei: o.sohei || (o.kosode ? 1 : 0),
      // 小袖姿（甲冑を着ない。寝所から出た信長・小姓・寺の僧。soheiLook の kosode の枝で衣だけにする）。bozu は剃った頭
      kosode: o.kosode || 0, kosodeCol: o.kosodeCol || 0, bozu: o.bozu || 0, obi: o.obi || 0,
    };
    if ((o.name === '織田信長' || (u.type === 'player' && this.hooks.nobunaga)) && this.hooks.nanban && !o.kosode) Object.assign(look, nanbanLook(look));
    buildModel(u, look);
    if (!u.isPlayer) u.mesh.updateMatrixWorld = visibleUnitMatrixWorld;
    if (!look.hero && !gen.face && u.type !== 'dummy') {
      // 首の付け根は保ち、同じ顔の部品の幅・奥行き・長さだけを変える。
      const fy = 0.97 + physique(173) * 0.06;
      u.head.scale.set(0.94 + physique(719) * 0.12, fy, 0.96 + physique(1093) * 0.08);
      u.head.position.y = 1.43 * (1 - fy);
    }
    if (u.type === 'cavalry' && o.horse === undefined) o = { ...o, horse: true };
    if (u.type === 'cavalry' && (g.interiorHold || (this._rideChk && this.walledIn(u.pos)))) o = { ...o, horse: false };
    // 名のある武将（武将・GENERALS の人）は馬に乗る（kaito 2026-09-29）。o.horse: false で徒。塀に囲まれた曲輪の中（籠城）は徒（rideCheck）
    if (o.horse === undefined && (u.type === 'busho' || gen.face) && !g.isPlayerSquad && !(this._rideChk && this.walledIn(u.pos))) { o = { ...o, horse: true }; u.autoHorse = true; }
    // 名のある武将の馬は、家の色の馬具（鞍の縁は金、厚総は大きく）
    const hst = () => { const s = horseStyleFor(u.id, gen.face ? 2 : u.type === 'busho' ? 1 : 0, g.faction); if (gen.tack) { s.tack = gen.tack; s.tassels = gen.tack === 0x2a2420 || gen.tack === 0x1a1816 ? (gen.lace ?? s.tassels) : new THREE.Color(gen.tack).multiplyScalar(1.3).getHex(); s.cushion = gen.haori ?? s.cushion; } return s; };
    if (o.horse) this.setMounted(u, true, buildHorse(o.horseStyle || hst()));
    if (u.type === 'porter') {
      const box = new THREE.Mesh(paint(at(new THREE.BoxGeometry(0.6, 0.45, 0.4), 0, 1.45, -0.3), 0x6b5236), MAT);
      u.mesh.add(box);
    }
    // 影を描かない画質では、足元に丸い影を置いて接地感を出す
    if (this.blobShadows) {
      if (!this.blobGeo) { this.blobGeo = new THREE.CircleGeometry(0.45, 12); this.blobGeo.rotateX(-Math.PI / 2); this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }); }
      const bl = new THREE.Mesh(this.blobGeo, this.blobMat); bl.position.y = 0.03; u.mesh.add(bl); u.blob = bl;
    }
    // 体格のばらつき：当時の背丈（足軽 1.55〜1.66m、侍・武将 1.58〜1.70m。元の体は 1.74m）、痩せ・がっしり。肩幅も人ごとに
    if (u.type !== 'player' && u.type !== 'dummy' && !o.horse) {
      const hi = u.type === 'samurai' || u.type === 'busho';
      const h = (hi ? 0.908 : 0.891) + physique(31) * (hi ? 0.069 : 0.063), w = 0.90 + physique(487) * 0.20;
      u.mesh.scale.set(h * w, h, h * (0.92 + physique(997) * 0.14));
    }
    // 本人も当時の背丈に（1.63m ほどで一定。兵の 1.55〜1.70m の中ほど）
    if (u.type === 'player') u.mesh.scale.setScalar(0.935);
    u.bodyRadius = 0.3 * Math.max(Math.abs(u.mesh.scale.x), Math.abs(u.mesh.scale.z));
    u.bodyHeight = 1.72 * u.mesh.scale.y;
    u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
    u.mesh.position.copy(u.pos);
    u.heading = o.heading ?? g.facing;
    u.mesh.rotation.y = u.heading;
    if (o.tatake) this.giveTatake(u);
    this.scene.add(u.mesh);
    this.units.push(u);
    return u;
  }
  // 竹束（弾よけ）を持たせる：体の前に竹の束を立てて寄せる。持つ者のすぐ後ろの味方には弾が通りにくい（coverBetween）
  //   戦の定義から o: { tatake: true } で。討たれれば束は倒れる（体と一緒に）
  giveTatake(u) {
    if (!TATAKE_GEO) {
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const c = new THREE.CylinderGeometry(0.045, 0.05, 1.75 + (i % 3) * 0.05, 6);
        parts.push(P(at(c, -0.36 + i * 0.09, 0.9, (i % 2) * 0.03), i % 4 ? 0x8a7a4a : 0x6f6238, { reg: 'wood' }));
      }
      // 束ねる縄（二か所）
      for (const y of [0.55, 1.35]) parts.push(P(at(new THREE.BoxGeometry(0.84, 0.05, 0.14), 0, y, 0.015), 0x4a3a24, { reg: 'wood' }));
      TATAKE_GEO = merge(parts);
    }
    const m = new THREE.Mesh(TATAKE_GEO, MAT);
    m.position.set(0.05, 0, 0.62); m.rotation.x = -0.08;
    m.castShadow = true;
    u.mesh.add(m);
    u.tatake = m;
  }

  // 部隊を陣形どおりに一括配置
  spawn(g, list) {
    // 戦が始まった後の敵は、見える所に湧かせない（battle.js の guardSpawn が出る所をずらす）
    if (this.spawnGuard) list = this.spawnGuard(g, list) || list;
    const n = list.reduce((a, s) => a + s.n, 0);
    const total = g.initial + n;
    // 隊の種類：六割より多くが鉄砲なら鉄砲の隊（段を組んで入れ替わる）、騎馬なら騎馬の隊（間を広くとる）
    const cnt = (ty) => g.units.filter((x) => x.slot >= 0 && x.type === ty).length + list.reduce((a, s) => a + (s.type === ty ? s.n : 0), 0);
    // 持ち場を決めるための、並びの番ごとの兵の種類（騎馬の混じる隊で騎馬を塊にする。馬に乗る武将も騎馬に数える）
    g._slotTypes = new Array(g.initial);
    for (const x of g.units) if (x.slot >= 0) g._slotTypes[x.slot] = x.type === 'cavalry' || x.mounted ? 'cavalry' : x.type;
    for (const s of list) for (let k = 0; k < s.n; k++) g._slotTypes.push(s.type === 'cavalry' || (s.o && s.o.horse) ? 'cavalry' : s.type);
    g._mix = null;
    g.isGun = total >= 4 && cnt('gun') >= total * 0.6;
    g._spawnN = total;   // 並べる途中でも、全員そろった時の段の数で並べる（gunRanks）
    g.cav = total >= 3 && cnt('cavalry') >= total * 0.6;
    g.cavShare = cnt('cavalry') / Math.max(1, total);
    if (g.isGun && !g.front) g.front = [];
    let i = g.units.length;
    const out = [];
    let banner = total >= 8 && !g.isPlayerSquad && !g.units.some((x) => x.banner);
    // 組の番号：同じ側・同じ家の徒歩の隊に、出た順に一番〜三番（騎馬の隊・小さな隊には付けない）
    if (!g.kumiNo && !g.cav && total >= 6) {
      const K = this.kumiCount || (this.kumiCount = {}), k = g.team + '|' + g.faction;
      K[k] = (K[k] || 0) + 1;
      if (K[k] <= 3) g.kumiNo = K[k];   // 一・二・三は裏から見ても同じ形（布の裏から透けて見えても字が崩れない）
    }
    const chiefSpec = list.find((e) => e.n > 0 && e.o && e.o.name && (e.type === 'busho' || e.type === 'samurai') && !e.o.kosode && !e.o.sohei && e.o.flag !== null && (e.o.hat ?? GENERALS[e.o.name.replace(/^.* /, '')]?.hat) !== 'none');
    let standard = !g.isPlayerSquad && !g.units.some((u) => u.isStandard) && chiefSpec;
    let standardBearer = null;
    for (const spec of list) {
      for (let k = 0; k < spec.n; k++) {
        const p = g.slotPos(i, total);
        // 大きめの部隊には隊旗を持つ旗持ちを一人（鉄砲の隊は、小旗の中に大きな隊旗が一本）
        const bo = banner && (spec.type === 'ashigaru' || (g.isGun && spec.type === 'gun')) && !(spec.o && spec.o.flag === null) ? { flagScale: 1.9 } : {};
        const so = standard && spec.type === 'ashigaru' && !spec.o?.name && !spec.o?.sohei && !spec.o?.kosode && !spec.o?.keep && !spec.o?.horse && spec.o?.flag !== null
          ? { standard: chiefSpec.o.flag || GENERALS[chiefSpec.o.name.replace(/^.* /, '')]?.flag || FACTION[g.faction]?.flag || 'oda', flag: null, weapon: 'none', dmg: 0 } : {};
        const u = this.addUnit(g, { type: spec.type, x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, ...(spec.o || {}), ...bo, ...so });
        if (so.standard) { u.isStandard = true; standardBearer = u; standard = false; }
        if (bo.flagScale && !so.standard) { u.banner = true; banner = false; }
        else if (g.kumiNo && u.flag && !u.name && u.look && u.look.flag && u.type !== 'cavalry') u.flag.material = numberedFlag(u.look.flag, g.kumiNo);
        out.push(u);
        i++;
      }
    }
    officerEscort(g);
    if (standardBearer) {
      const chief = g.units.find((u) => u.name === chiefSpec.o.name);
      if (chief) { standardBearer.officerGuard = chief; standardBearer.officerGuardSlot = 1; }
    }
    for (const u of out) if (u.isOfficer && g.initial >= 4 && !g.fixed && !g.isPlayerSquad && !u.keep) {
      const f = g.forward(), c = g.center();
      u.pos.x = c.x - f.x * 7; u.pos.z = c.z - f.z * 7;
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    for (const u of out) if (u.officerGuard && !g.isPlayerSquad) {
      const chief = u.officerGuard, f = g.forward(), side = u.officerGuardSlot - 1;
      const ahead = u.isStandard ? -2.5 : 2.5;
      u.pos.x = chief.pos.x + f.x * ahead + f.z * side * 1.8;
      u.pos.z = chief.pos.z + f.z * ahead - f.x * side * 1.8;
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    // 峠の増援は、後ろの列や武将の供も含めて場の内へ収めてから出す。
    // 出す時だけ調べ、並びを崩さず隊全体の持ち場をずらす。
    if (this.world.def.keepSpawnInside && out.length) {
      const lim = (this.world.def.moveLim || 176) - 0.3;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const u of out) {
        minX = Math.min(minX, u.pos.x); maxX = Math.max(maxX, u.pos.x);
        minZ = Math.min(minZ, u.pos.z); maxZ = Math.max(maxZ, u.pos.z);
      }
      const dx = Math.max(-lim - minX, Math.min(0, lim - maxX));
      const dz = Math.max(-lim - minZ, Math.min(0, lim - maxZ));
      if (dx || dz) {
        g.anchor.x += dx; g.anchor.z += dz;
        for (const u of out) {
          u.pos.x += dx; u.pos.z += dz;
          u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
          u.mesh.position.copy(u.pos);
        }
      }
    }
    for (const u of out) if (recoverGround(this, u)) {
      u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y); u.mesh.position.copy(u.pos);
    }
    return out;
  }

  addStruct(s) {
    const st = Object.assign({ isStruct: true, alive: true, hp: 100, maxHp: 100, team: 0 }, s);
    this.structs.push(st);
    return st;
  }

  // ---------------- 空間検索 ----------------
  // 近くの兵を探す升目：鍵は数（文字列を毎コマ作らない）、升の入れ物は使い回す
  rebuildGrid() {
    for (const a of this.grid.values()) a.length = 0;
    if (this.grid.size > 4000) this.grid.clear();
    const c = this.cell;
    for (const u of this.units) {
      if (!u.alive) continue;
      const k = (Math.floor(u.pos.x / c) + 20000) * 40000 + Math.floor(u.pos.z / c) + 20000;
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(u);
    }
  }

  forNear(x, z, r, fn, context) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.grid.get((i + 20000) * 40000 + j + 20000);
      if (a) for (let q = 0; q < a.length; q++) fn(a[q], context);
    }
  }

  nearestEnemy(u, r, filter) {
    r = Math.min(r, weatherSight(this.world));
    let best = null, bd = Infinity;
    const r2 = r * r;
    // 攻めかかる隊は、10m より遠くの逃げる敵を後回しにする（深追いしない）
    const late = u.group && u.group.order === 'attack';
    this.forNear(u.pos.x, u.pos.z, r, (o) => {
      if (o.team === u.team || !o.alive || (o.invuln && !o.allyOk) || o.noTarget) return;
      // 一対一の相手（soloFor）は、決められた者（ふつうは本人）のほかは狙わない
      if (o.soloFor && o.soloFor !== u && o.soloFor.alive) return;
      if (filter && !filter(o)) return;
      // 城内は別の階や壁の向こうを狙わない。槍は近い襖の裏まで届く。
      if ((u.naka || o.naka) && Math.abs(o.pos.y - u.pos.y) > 1.8) return;
      if (interiorBlocked(INTERIOR_WALLS, u.pos, o.pos, (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) return;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      const d = dx * dx + dz * dz;
      if (d >= r2) return;
      const k = late && o.fleeing && d > 100 ? d + 1e6 : d;
      if (k < bd && weatherSees(this.world, u.pos, o.pos)) { bd = k; best = o; }
    });
    return best;
  }

  // pos から的 tp までの間に塀・柵（seg）があるか。塀のすぐ内側（2.5m 以内）の城方が外を突くのはよいが、外から内へは届かない
  // pos から tp までの間にある、よその側の塀・柵（無ければ null）
  wallAt(pos, team, tp) {
    let nearest = null, distance = Infinity;
    for (const s of this.structs) {
      if (!s.alive || s.opened || !s.seg || s.team === team) continue;
      const q = segHit(pos.x, pos.z, tp.x, tp.z, s.seg);
      if (q >= 0 && q < distance) { nearest = s; distance = q; }
    }
    return nearest;
  }
  // over：槍で柵越しに突く（すぐ前の柵は、敵味方どちらの柵でも越えて届く。塀は越えない）
  // clear：柵越しに届く間合い（既定 2.2m）。馬上は馬の図体の分だけ柵に近寄れないので、呼ぶ側が広げて渡す
  // 柵や塀（seg のある物）を16m の区画に置いた表。structs の数が変わった時だけ作り直す（seg は動かない）
  segGrid() {
    if (this._segGridN === this.structs.length && this._segGrid) return this._segGrid;
    const grid = new Map();
    for (const s of this.structs) {
      const g = s.seg; if (!g) continue;
      for (let cx = Math.floor(Math.min(g[0], g[2]) / 16); cx <= Math.floor(Math.max(g[0], g[2]) / 16); cx++)
        for (let cz = Math.floor(Math.min(g[1], g[3]) / 16); cz <= Math.floor(Math.max(g[1], g[3]) / 16); cz++) {
          const k = cx * 4096 + cz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(s);
        }
    }
    this._segGrid = grid; this._segGridN = this.structs.length;
    return grid;
  }

  wallBetween(pos, team, tp, over = false, clear = 2.2) {
    if (interiorBlocked(INTERIOR_WALLS, pos, tp, over)) return true;
    // 柵や塀を16m の区画に分けて、線の通る区画の物だけを調べる（岩村は一コマに六千回呼ばれ、毎回百の柵を全部見て一コマ三百ミリ秒かかっていた。10/7）
    const x0 = Math.min(pos.x, tp.x), x1 = Math.max(pos.x, tp.x), z0 = Math.min(pos.z, tp.z), z1 = Math.max(pos.z, tp.z);
    const grid = this.segGrid();
    const cx0 = Math.floor(x0 / 16), cx1 = Math.floor(x1 / 16), cz0 = Math.floor(z0 / 16), cz1 = Math.floor(z1 / 16);
    const list = cx0 === cx1 && cz0 === cz1 ? grid.get(cx0 * 4096 + cz0) || NO_SEGS
      : (cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 16 ? this.structs : segsIn(grid, cx0, cx1, cz0, cz1);
    for (const s of list) {
      const g = s.seg;
      if (!g || !s.alive || s.opened) continue;
      if ((g[0] < x0 && g[2] < x0) || (g[0] > x1 && g[2] > x1) || (g[1] < z0 && g[3] < z0) || (g[1] > z1 && g[3] > z1)) continue;
      if (segHit(pos.x, pos.z, tp.x, tp.z, g) < 0) continue;
      if (s.team === team && distToSeg(pos.x, pos.z, s.seg) < 2.5) continue;
      if (over && /柵/.test(s.name || '') && distToSeg(pos.x, pos.z, s.seg) < clear) continue;
      return true;
    }
    return false;
  }

  // allyMounted：的を絞った（lockRef と同じ）味方の騎馬（乗り手でなく馬だけ）だけ的に含める（自分の馬・味方の馬も討てるように。kaito 10/1。狙ってもいない味方へ毎振りで当たっていたのを直す）
  // fenceClear：柵越しに届く間合い（馬上の突きは馬の図体の分だけ呼ぶ側が広げる。既定 2.2m）
  enemiesInArc(pos, heading, reach, halfAngle, team, over = false, allyMounted = false, fenceClear = 2.2, lockRef = null) {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.forNear(pos.x, pos.z, reach + 1, (o) => {
      // 討たれない武将も、手傷を負って退くまでは突ける（damage で下限に止める）
      const sameSide = o.team === team;
      // 討たれない武将（殿など invuln）は、味方の馬の的からは外す（うっかり主君を落馬させない）。狙ってもいない味方へは当たらない（lockRef と同じ時だけ）
      if ((sameSide && !(allyMounted && o === lockRef && o.mounted && o.horse && !o.isPlayer && !o.invuln)) || !o.alive || o.gone || o.noTarget || (o.invuln && o.woundOut)) return;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      if (o.naka && Math.abs(o.pos.y - pos.y) > 1.8) return;
      const d = Math.hypot(dx, dz);
      // 的には体の太さ（半径 0.3m ほど、馬上は 0.6m）がある：穂先が体の端にかかれば当たる
      const rad = o.mounted ? 0.6 : 0.3;
      if (d > reach + 0.35 + rad) return;
      if (this.wallBetween(pos, team, o.pos, over, fenceClear)) return;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (halfAngle < Math.PI && cos < Math.cos(Math.min(1.4, halfAngle + Math.atan2(rad, Math.max(0.5, d))))) return;   // halfAngle が π なら、まわり全部
      out.push({ u: o, d, cos });
    });
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // 位置に応じた音量と左右の定位で鳴らす
  // 遠くの音は、見えてから遅れて届く（音の速さ 340m/秒。25m より遠い時だけ）。待つ音は毎コマの smokes の所で鳴らす
  playFar(name, pos, vol = 1) {
    const P = this.playerUnit, d = P && pos ? Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) : 0;
    if (d < 25) { this.play(name, pos, vol); return; }
    (this.sndQ || (this.sndQ = [])).push({ at: this.time + d / 340, name, pos: { x: pos.x, y: pos.y, z: pos.z }, vol });
  }
  play(name, pos, vol = 1) {
    // 騎馬が何頭も駆け直しても、蹄の要求を三秒以上あける。
    // 軍の時刻で間引くので、音を鳴らさない計測でも連続要求を増やさない。
    if (name === 'hooves' || name === 'hoovesWet' || name === 'gallop') {
      if (this.hoofSoundAt > this.time) return;
      this.hoofSoundAt = this.time + (name === 'gallop' ? 4 : 3.2);
    }
    // 同じ音が一度にたくさん重なるときは、まとめて一つの大きな音にする（一斉射撃・弓の斉射・騎馬の群れ）
    const lim = SOUND_BUNCH[name];
    if (lim) {
      const s = this.sndBunch || (this.sndBunch = {});
      const clusters = s[name] || (s[name] = []);
      let r = null, oldest = null;
      for (const b of clusters) {
        if (!oldest || b.t < oldest.t) oldest = b;
        if (this.time - b.t <= 0.4 && b.hasPos === !!pos && (!pos || Math.hypot(pos.x - b.x, pos.z - b.z) <= 12 && Math.abs((pos.y || 0) - b.y) <= 3)) { r = b; break; }
      }
      if (!r) {
        // 十六か所まで使い回す。遠い組の一発目をほかの組の斉射へ混ぜない。
        r = oldest && (this.time - oldest.t > 0.4 || clusters.length >= 16) ? oldest : { t: -9, n: 0 };
        if (!clusters.includes(r)) clusters.push(r);
        r.t = this.time; r.n = 0; r.hasPos = !!pos;
        r.x = pos?.x || 0; r.y = pos?.y || 0; r.z = pos?.z || 0;
      }
      if (this.time - r.t > 0.4) { r.t = this.time; r.n = 0; }
      r.n++;
      if (r.n > lim[0]) {
        // 短く揃った鉄砲は一斉射、間の空いた鉄砲はばらばらの音にまとめる
        const bunch = name === 'gun' && this.time - r.t > 0.16 ? 'gunScatter' : lim[1];
        // 撃った数が多いほど厚く：九発目・十七発目で一斉の音をもう一つ重ねる
        if (lim[1] && (r.n === 9 || r.n === 17)) { name = bunch; vol *= 0.75; }
        else if (r.n !== lim[0] + 1 || !lim[1]) return;
        else { name = bunch; vol *= 1.1; }
      }
    }
    const v = this.hooks.volumeAt ? this.hooks.volumeAt(pos) : 1;
    const pan = this.hooks.panAt ? this.hooks.panAt(pos) : 0;
    withPan(pan, () => sfx(name, v * vol));
  }

  // 馬に乗せる・降ろす（乗り手の手・旗・馬印を鞍の高さへ）
  setMounted(u, on, horse) {
    if (!!u.mounted === on || on && !(horse || u.horse)) return;
    const dy = on ? RIDE.y : -RIDE.y;
    for (const part of [u.hand, u.flag, u.uma]) if (part) part.position.y += dy;
    // 乗り手（体・脚・手・旗・馬印）は「鞍」の入れ物に入れ、馬の背の上下・前後の揺れをそのまま受ける
    const riderParts = [u.body, u.legL, u.legR, u.hand, u.flag, u.uma];
    if (on) {
      u.horse = horse || u.horse;
      if (u.horse !== u._horseHpFor) { u.horseHp = undefined; u.horseMax = undefined; u._horseHpFor = u.horse; }   // 乗り換えたら馬の体力を新しく
      if (u.horse.parent !== u.mesh) u.mesh.add(u.horse);
      u.horse.position.set(0, 0, 0); u.horse.rotation.set(0, 0, 0);
      if (!u.seat) { u.seat = new THREE.Group(); u.seat.matrixAutoUpdate = false; }
      u.seat.matrix.identity(); u.mesh.add(u.seat);
      for (const part of riderParts) if (part) u.seat.add(part);
      u.rideFix = true;
      seatLegs(u);
    } else {
      if (u.horse && u.horse.parent === u.mesh) u.mesh.remove(u.horse);
      for (const part of riderParts) if (part) u.mesh.add(part);
      if (u.human && u.human.root.parent === u.seat) u.mesh.add(u.human.root);
      if (u.seat) u.mesh.remove(u.seat);
      u.rideFix = false;
      u.legL.position.set(0.11, 0.74, 0); u.legR.position.set(-0.11, 0.74, 0);
      u.legL.rotation.set(0, 0, 0); u.legR.rotation.set(0, 0, 0);
      if (u.shinL) { u.shinL.rotation.x = 0; u.shinR.rotation.x = 0; }
    }
    u.mounted = on;
    if (!on) { u.charging = false; u.cv = null; u.cvT = 0; u._chargeWait = null; }
  }

  // 塀・柵（seg の構え）に四方を囲まれた所か：八方へ 70m の線を引き、六方より多くが構えに当たれば曲輪の中
  walledIn(p) {
    const segs = this.structs.filter((s) => s.seg && s.alive !== false && !s.opened);
    if (segs.length < 4) return false;
    let hit = 0;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.sin(a) * 70, dz = Math.cos(a) * 70;
      for (const s of segs) {
        const [ax, az, bx, bz] = s.seg, ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((ax - p.x) * ez - (az - p.z) * ex) / den, v = ((ax - p.x) * dz - (az - p.z) * dx) / den;
        if (t > 0 && t < 1 && v >= 0 && v <= 1) { hit++; break; }
      }
    }
    return hit >= 6;
  }
  // 戦の始めの一度：曲輪の中では武将も騎馬の侍も降ろす（兵を置いてから塀を立てる戦があるため）
  rideCheck() {
    this._rideChk = true;
    for (const u of this.units) if ((u.autoHorse || u.type === 'cavalry' || u.horseBattle === 'foot') && u.mounted && this.walledIn(u.pos)) { const h = u.horse; this.setMounted(u, false); if (h && h.parent) h.parent.remove(h); u.horse = null; }
  }

  update(dt, focus, cam, frustum) {
    // 画質「低」では、装備の土埃・錆・布のしわの凹凸（描く手間の掛かる所）を省く
    const hq = S.quality !== 'low';
    if (!!MAT.defines.UNIT_HQ !== hq) { if (hq) MAT.defines.UNIT_HQ = 1; else delete MAT.defines.UNIT_HQ; MAT.needsUpdate = true; MAT_I.needsUpdate = true; MAT_P.needsUpdate = true; refreshWaterMaterials(MAT); refreshWaterMaterials(MAT_I); refreshWaterMaterials(MAT_P); }
    FLAG_T.value += dt;
    FLAG_W.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
    this.wind = Math.atan2(WIND_STATE.dirX, WIND_STATE.dirZ);
    this.time += dt;
    this._viewFrustum = frustum;
    for (const u of this.units) {
      updateWaterBody(u, this.world, dt);
      if (!this.aftermath && u.alive) {
        gunWeather(this, u, dt);
        if (!u.isPlayer && !u.sidearm) rangedSupply(this, u, this.time);
      }
    }
    if (this.aftermath) {
      // 判断・攻撃・増援は進めず、既にある兵と煙だけを動かす。
      for (const u of this.units) {
        const near = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z) < 45;
        this.animate(u, dt, near);
      }
      this.updateSmoke(dt);
      this.updateParticles(dt);
      this.updateStains(dt);
      this.updateFalling(dt);
      this.updateLooseHorses(dt);
      return;
    }
    this.rebuildGrid();
    // プレイヤーを狙って構えている敵（予備動作の表示と同時攻撃数の制限に使う）
    if (!this.threats) this.threats = [];
    this.threats.length = 0;
    this.playerAttackers = 0;
    // 支度から振り切るまでを数える。射撃は近接の二人枠を塞がない。全員をたどるのは一度だけ。
    for (const u of this.units) {
      if (!u.alive) continue;
      if ((u.atk && u.atk.target.isPlayer && !u.atk.bow) || (u.swing && !u.swing.done && u.swing.target && u.swing.target.isPlayer) || (u.charging && u.cv === 'in' && u.target && u.target.isPlayer && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 10)) this.threats.push(u);
      if (!u.fleeing && !u.group?.routed && (u.playerMeleeUntil > this.time || u.atk && u.atk.target.isPlayer && !u.atk.ranged && !u.atk.bow || u.swing && u.swing.target?.isPlayer)) this.playerAttackers++;
    }
    if (!this._rideChk) this.rideCheck();
    // 囲まれ具合を四分の一秒ごとに調べる。敵は槍の届く辺り、支えはすぐそばだけ。
    if ((this.crowdT = (this.crowdT || 0) - dt) <= 0) {
      this.crowdT = 0.25;
      const P = this.playerUnit;
      let foe = 0, ally = 0, sectors = 0;
      if (P && P.alive) this.forNear(P.pos.x, P.pos.z, 10, (o) => {
        if (!o.alive || o === P || o.noTarget || o.type === 'dummy' || o.type === 'porter' || o.fleeing ||
            Math.abs(o.pos.y - P.pos.y) > 1.8 || this.wallBetween(P.pos, -1, o.pos)) return;
        const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
        if (o.team !== P.team) {
          if (d < 6 && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) {
            foe++;
            const a = Math.atan2(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
            sectors |= 1 << (Math.floor((a + Math.PI) / (Math.PI / 2)) & 3);
          }
        } else if (d < 4.5 && !o.rearWound && !o.woundOut && !o.dropped && !o.downed && !(o.pinT > this.time) && !(o.stagger > 0.7)) ally++;
      });
      this.playerCrowd = foe;
      // 二方向以上から三人に寄られれば危険。遠い味方は目前の槍を止められない。
      const spread = sectors && (sectors & (sectors - 1));
      this.playerMobbed = !!(foe >= 3 && spread && ally < foe);
      this.playerSupport = ally;
      // 囲まれ具合や戦ごとの人数指定によらず、同時の斬り合いは二人まで。
      this.attackCap = 2;
      if (P) P.mobbed = this.playerMobbed;
    }
    this.updateGroups(dt);
    this.duelTick(dt);
    // 遠景の大軍（world.js）が、本物の兵のいる所に重ならないよう道を譲らせる（0.7 秒ごと）
    if (this.world.yieldArmies && (this.yieldT = (this.yieldT || 0) - dt) <= 0) {
      const pts = this.yieldPoints;
      pts.length = 0;
      for (const u of this.units) if (u.alive && !u.gone && u.type !== 'dummy') pts.push(u.pos);
      this.world.yieldArmies(pts, 0.7 - this.yieldT);
      this.yieldT = 0.7;
    }
    this.lodT -= dt;
    const doLod = this.lodT <= 0;
    if (doLod) this.lodT = 0.4;
    this.groundTick(dt, focus, cam);
    // 本物の兵（AI・当たり・動きを毎コマ計算する者）の上限：画質「低」は約120・「中」は約180（戦の数に関わらず）。
    // 本人から60m以内は必ず動かし、その外で近い者（camD が小さい）から選ぶ。あふれた分は u.farSim を立てて、遠い軽い軍勢と同じ GPU 任せの扱いへ回す
    // （名のある者・プレイヤーを狙っている者・打ち合っている最中の者は、絞りの対象から外して戦いを止めない）
    if (doLod) {
      const cap = REALCAP[S.quality] || 250;
      let protectedCount = 0;
      if (cap) {
        const cand = this.lodCandidates;
        cand.length = 0;
        for (const u of this.units) {
          u.camD = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
          if (!u.alive || u.type === 'dummy') { u.farSim = false; continue; }
          if (u.isPlayer || u.isSub || u.name) { u.farSim = false; protectedCount++; continue; }
          // 近くの兵は画質によらず戦わせる。遠い兵だけを従来の枠で間引く。
          if (Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z) <= 60) { u.farSim = false; protectedCount++; continue; }
          // 殿へ向かう一隊は、遠景扱いで判断ごと止めると出た場所で立ち尽くす。
          if (u.atk || u.swing || (u.target && u.target.isPlayer) || (u.group && u.group.focus && u.group.focus.alive && !u.group.isPlayerSquad)) { u.farSim = false; protectedCount++; continue; }
          cand.push(u);
        }
        cand.sort(byCameraDistance);
        for (let i = 0; i < cand.length; i++) cand[i].farSim = i >= Math.max(0, cap - protectedCount);
      } else {
        for (const u of this.units) u.farSim = false;
      }
    }
    for (const u of this.units) {
      // 倒れ切って固まった体・逃げ去った者は、もう何も計算しない（数が増えても重くならない）
      if (!u.alive && (u.gone || (u.death && !u.mounted && u.death.t >= DEATH_END && !u.death.aid) || (u.mounted && u.deadT >= 4))) continue;
      // 深手で倒れた者と搬送済みの者は、出血・攻撃・隊への復帰を進めない。
      if (u.gone && u.evacuatedWound) continue;
      if (u.dying) { u.detailDt = 0; u.detailNextAt = 0; this.animate(u, dt, true); continue; }
      woundTick(u, dt);
      if (u.alive && !u.isPlayer && u.hp <= 0) {
        if (u.invuln || u.mustLive || u.onWound) {
          u.hp = u.maxHp * WOUND_FLOOR; u.wounds.bleed = 0;
          if (!u.woundOut && !u.onWound) this.generalWounded(u, u.woundSource);
        } else this.kill(u, u.woundSource);
      }
      if (u.dying) { u.detailDt = 0; u.detailNextAt = 0; this.animate(u, dt, true); continue; }
      if (u.hitFlash > 0) u.hitFlash -= dt;
      u.lastHitT += dt;
      const focusD = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
      if (focusD <= 60) u.farSim = false;
      u.camD = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : focusD;
      // 手足の省き・旗・判断の間引きは、本人とカメラの近い方で決める（開戦の引きや写真モードで、カメラの前の兵が棒立ちにならないように）
      const dist = Math.min(focusD, u.camD);
      const near = dist < 70;
      // 当たった人だけ、判断・足・得物の時計を同じ短い間止める。
      u.contactFrozen = u.alive && !u.isPlayer && !u.dragging && u.contactStopT > 0;
      if (u.contactFrozen) {
        u.detailDt = 0; u.detailNextAt = 0;
        u.contactStopT = Math.max(0, u.contactStopT - dt);
        // 足と得物は止めたまま、下知と敗走の判断だけ受け取る。
        u.aiT -= dt;
        if (u.aiT <= 0 || u.receivedSignal !== u.group.signalSerial || u.group.routed || u.fleeing) {
          this.think(u); u.aiT = 0.18;
          if (!signalWait(this, u.group, u)) u.receivedSignal = u.group.signalSerial;
        }
        continue;
      }
      if (u.slipT > 0) u.slipT = Math.max(0, u.slipT - dt);
      if (doLod && u.alive) {
        u.legL.visible = u.legR.visible = near;
        if (u.flag) u.flag.visible = dist < 110 && !(u.group && u.group.hideFlags);
        // 影は体だけでなく、頭・腿・脛・腕・馬印も同じ遠さで切る（遠くの兵の影の描き込みを省く）
        const sh = dist < (this.shadowDist ?? 34) && this.shadows !== false;
        if (u.shOn !== sh) {
          u.shOn = sh;
          if (u.body) u.body.castShadow = sh;
          if (u.head) u.head.castShadow = sh;
          if (u.legL) u.legL.castShadow = sh;
          if (u.legR) u.legR.castShadow = sh;
          if (u.shinL) u.shinL.castShadow = sh;
          if (u.shinR) u.shinR.castShadow = sh;
          if (u.armR) u.armR.castShadow = sh;
          if (u.armL) u.armL.castShadow = sh;
          if (u.uma) u.uma.castShadow = sh;
        }
      }
      // 画面の外にいる兵は手足の動きを省く
      if (frustum && u.alive) { this.tmpSphere.center.set(u.pos.x, u.pos.y + 1, u.pos.z); u.offscreen = !frustum.intersectsSphere(this.tmpSphere); }
      // カメラのすぐ前にいる兵は消して視界を確保する
      if (cam && u.alive && !u.isPlayer) {
        u.spearNearCamera = false;
        const cd = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        // 消すのは味方だけ（自分のすぐ横で斬り合っている者は除く）。敵は、カメラが体の中に入るほど近い時（0.6m）だけ消す
        //   （斬り合う相手・打ちかかってくる敵が、カメラの近くで透けて見えなくならないように）
        const P = this.playerUnit;
        const lim = u.team !== (P ? P.team : 0) ? 0.6 : (u.target && u.target.alive && !u.target.isStruct && P && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 1.6 ? 0.6 : 2.2);
        let hide = cd < lim && Math.abs(u.pos.y + 1.2 - cam.y) < 2;
        // 味方がカメラと自分の間の細い道（幅 1.1m）に立って前の敵を隠す時も消す（B012。6m まで）
        if (!hide && cd < 6 && P && u.team === P.team && Math.abs(u.pos.y + 1.2 - cam.y) < 2.4) {
          const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1, vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
          const along = (vx * ax + vz * az) / L, side = Math.abs(vx * az - vz * ax) / L;
          hide = along > 0 && along < L - 0.4 && side < 1.1;
        }
        // 横や斜め後ろの味方の槍も、カメラの三メートル以内なら得物だけ隠す。
        // 端点は使い回し、近い槍だけ実際の構えを世界の位置へ直す。
        if (!hide && P && u.team === P.team && u.wpn && (u.wpnKind || u.lookWeapon) === 'spear' && cd < (u.wpn.userData.spec?.L || 6.3) + 4) {
          const w = u.wpn;
          w.updateWorldMatrix(true, false);
          _camTip.set(0, 0, w.userData.tip ?? 2).applyMatrix4(w.matrixWorld);
          const flex = w.userData.flex;
          if (flex?.on) {
            flex.b.updateWorldMatrix(true, false);
            _camTip.set(0, 0, flex.G.tip - flex.G.j2).applyMatrix4(flex.b.matrixWorld);
          }
          _camButt.set(0, 0, w.userData.butt ?? -1.6).applyMatrix4(w.matrixWorld);
          const dx = _camTip.x - _camButt.x, dy = _camTip.y - _camButt.y, dz = _camTip.z - _camButt.z;
          const len2 = dx * dx + dy * dy + dz * dz;
          const t = Math.max(0, Math.min(1, ((cam.x - _camButt.x) * dx + (cam.y - _camButt.y) * dy + (cam.z - _camButt.z) * dz) / (len2 || 1)));
          u.spearNearCamera = Math.hypot(_camButt.x + dx * t - cam.x, _camButt.y + dy * t - cam.y, _camButt.z + dz * t - cam.z) <= 3;
        }
        // 霧の外の敵は体・旗・軽い遠景への置き換えも隠す。近づけば戻す。
        if (P && u.team !== P.team && !weatherSees(this.world, P.pos, u.pos)) hide = true;
        u.camHidden = hide;
        u.mesh.visible = !hide;
        // 得物はカメラのすぐ前（体ごと消す 2.2m）まで見せる。隠すと手だけが宙を握って見える（鉄砲・弓・刀は近くても隠さない）
        if (u.wpn && !(u.human && u.human.cmdHid)) u.wpn.visible = dist < 95 && ((cd > lim && !u.spearNearCamera) || (u.wpnKind || u.lookWeapon) !== 'spear');
        // 指物がカメラと自分の間にある・カメラのすぐ前にあるときは透かす（自分の組の旗は透かさない）
        if (u.flag) {
          let fade = false;
          if (cd < 9 && !u.isSub) {
            const P = this.playerUnit;
            if (cd < 3.2) fade = true;
            else if (P) {
              // カメラの前方、画面の中ほどにかかる旗（自分より手前か、自分のすぐ先まで）
              const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1;
              const vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
              const along = (vx * ax + vz * az) / L;
              const side = Math.abs(vx * az - vz * ax) / L;
              fade = along > 0 && along < L + 5 && side < 1.2 + along * 0.45;
            }
          }
          if (!u.flagMat) u.flagMat = u.flag.material;
          if (fade !== !!u.flagFaded) { u.flagFaded = fade; u.flag.material = fade ? fadedFlag(u.flagMat) : u.flagMat; }
        }
        // 乱戦の槍も指物と同じく、カメラと自分の間にある近い味方の分だけ薄くする（画面の真ん中を塞がないように）
        if (u.wpn && u.wpn.visible && !u.isSub && (u.wpnKind || u.lookWeapon) === 'spear') {
          let wfade = false;
          if (cd < 9) {
            const P = this.playerUnit;
            if (cd < 3.2 && u.team === P?.team) wfade = true;
            else if (P && u.team === P.team) {
              const ax = P.pos.x - cam.x, az = P.pos.z - cam.z, L = Math.hypot(ax, az) || 1;
              const vx = u.pos.x - cam.x, vz = u.pos.z - cam.z;
              const along = (vx * ax + vz * az) / L;
              const side = Math.abs(vx * az - vz * ax) / L;
              wfade = along > 0 && along < L + 5 && side < 1.0 + along * 0.4;
            }
          }
          if (!u.wpnMat) u.wpnMat = u.wpn.material;
          if (wfade !== !!u.wpnFaded) { u.wpnFaded = wfade; u.wpn.material = wfade ? fadedWeapon(u.wpnMat) : u.wpnMat; }
        }
      }
      // 救助中は既にいる仲間を使い、判断・攻撃を止める。移動は負傷兵の側で一度だけ進める。
      if (u.alive && u.dragging) {
        const d = u.dragging;
        if (d.gone || !d.death?.aid || d.death.helper !== u || u.fleeing || u.stagger > 0 || u.lastHitT < 0.6) {
          if (d.death?.helper === u) {
            this.endAid(d); d.death.aid = true;
          }
          if (u.wpn) u.wpn.visible = true;
          u.dragging = null; u.vel.x = u.vel.z = 0; u.moving = 0; u.aiT = 0;
        } else { u.detailDt = 0; u.detailNextAt = 0; this.animate(u, dt, near); continue; }
      }
      if (u.alive && u.target && u.target.alive === false && !u.target.isStruct) { u.target = null; u.aiT = 0; }
      if (!u.alive || u.isPlayer || u.type === 'dummy') { u.detailDt = 0; u.detailNextAt = 0; this.animate(u, dt, near); continue; }
      if (u.guarding > 0) u.guarding = Math.max(0, u.guarding - dt);
      if (u.farSim) {
        u.detailDt = 0; u.detailNextAt = 0;
        if (u.confused > 0) u.confused = Math.max(0, u.confused - dt);
        u.cd -= dt; u.aiT -= dt;
        if (u.reload) { if (u.moving > 0.05 || u.fleeing) u.cd += dt; else u.reload.t += dt; if (u.cd <= 0) u.reload = null; }
        if (u.stagger > 0) u.stagger = Math.max(0, u.stagger - dt);
        if (doLod && !u.downed && !(u.pinT > this.time) && !u.climb && !u.perch && !u.woundOut && !u.rearWound) {
          const g = u.group, previous = u._farAt ?? this.time - 0.4; u._farAt = this.time;
          const slot = g.slotPos(u.slot, g.initial);
          u.moving = 0; u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
          let q = g.order === 'flee' || u.fleeing ? u.moralePoint : slot;
          if (q === u.moralePoint) { q.x = u.pos.x + g.fleeDir.x * 10; q.z = u.pos.z + g.fleeDir.z * 10; }
          // 遠い兵も同じ曲がり角と退き道を使う。直線だけでは曲輪の柵で止まる。
          q = mountainWay(this, u, q);
          if (u.fleeing && this.world.def.fleeWay) q = this.world.def.fleeWay(this, u, q);
          else if (q !== u._mountainWant && this.world.def.moveWay) q = this.world.def.moveWay(this, u, q);
          // 軽い移動も、行き先を先に場の内へ収める。
          const lim = this.world.def.moveLim || 176;
          q.x = Math.max(-lim, Math.min(lim, q.x)); q.z = Math.max(-lim, Math.min(lim, q.z));
          const dx = q.x - u.pos.x, dz = q.z - u.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, (g.speed || u.speed) * Math.min(0.8, this.time - previous));
          if (d > 0.05 && !signalWait(this, g, u)) {
            const x = u.pos.x + dx / d * step, z = u.pos.z + dz / d * step;
            if (this.world.walkable(x, z) && !this.wallBetween(u.pos, -1, q)) { u.pos.x = x; u.pos.z = z; u.pos.y = groundAt(this.world, x, z, u.pos.y); u.heading = Math.atan2(dx, dz); u.moving = step / Math.max(0.01, this.time - previous); u.mv.x = dx / d * u.moving; u.mv.z = dz / d * u.moving; u.vel.x = u.mv.x; u.vel.z = u.mv.z; }
          }
        }
        if (this.leaveField(u)) continue;
        // 遠い兵も近い兵と同じ端を守る。間引きの待ち時間にも押された位置を残さない。
        const fieldLim = this.world.def.moveLim || 176;
        if (Math.abs(u.pos.x) > fieldLim || Math.abs(u.pos.z) > fieldLim) {
          u.pos.x = Math.max(-fieldLim, Math.min(fieldLim, u.pos.x));
          u.pos.z = Math.max(-fieldLim, Math.min(fieldLim, u.pos.z));
          u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
        }
        this.animate(u, dt, near); continue;
      }
      u._farAt = this.time;
      // 陣中の待機は既に並んだ位置を保つ。下知の変更・接敵・手傷は待機より先。
      if (u.jinchu) {
        const p = u.jinchu, g = u.group;
        // 周囲の確認は一人ずつ時をずらし、四分の一秒に一度まで。
        if ((u.jinchuCheckT || 0) <= this.time) {
          u.jinchuCheckT = this.time + 0.25 + (u.id % 5) * 0.03;
          if (this.nearestEnemy(u, 12)) p.danger = true;
        }
        if (u.hit || u.target) p.danger = true;
        if (!p.danger && !g.routed && g.order === 'hold' && g.aggro === 0 && !u.fleeing) {
          u.detailDt = 0; u.detailNextAt = 0;
          u.vel.x = u.vel.z = 0; u.mv.x = u.mv.z = 0; u.moving = 0;
          this.animate(u, dt, near); continue;
        }
        u.jinchu = null; u.aiT = 0;
      }
      // 遠い非交戦兵は毎秒20回・さらに遠ければ10回。時計をため、歩く速さと込め直しの長さを保つ。
      // 号令の変更は待たずに受け取り、絵・負傷・弾の当たりは毎コマのまま。
      const interval = detailInterval(this, u, dist);
      const simDt = dt + (u.detailDt || 0);
      const orderChanged = u.detailOrder !== u.group.order || u.detailSignal !== u.group.signalSerial;
      if (interval && !orderChanged && u.detailNextAt > this.time + 1e-6) {
        u.detailDt = simDt;
        this.animate(u, dt, near); continue;
      }
      u.detailDt = 0; u.detailOrder = u.group.order; u.detailSignal = u.group.signalSerial;
      // 兵ごとに時をずらし、全員の重い更新が同じコマへ固まらないようにする。
      const phase = (u.id % 17) * interval / 17;
      u.detailNextAt = interval ? (Math.floor((this.time + phase + 1e-6) / interval) + 1) * interval - phase : 0;
      if (u.confused > 0) u.confused -= simDt;
      u.cd -= simDt;
      // 込め直しは足を止めてでないとできない（歩いている間は進まない）
      if (u.reload) { if (Math.hypot(u.mv.x, u.mv.z) > 0.05 || Math.hypot(u.vel.x, u.vel.z) > 0.05 || u.fleeing) u.cd += simDt; else u.reload.t += simDt; if (u.cd <= 0) u.reload = null; }
      // AI の間引き（遠い兵ほど判断間隔を長くする）
      u.aiT -= simDt;
      if (u.aiT <= 0) {
        this.think(u);
        // 前線（0・1段目）にいない兵（横陣・槍衾の奥の段）は、斬り合いに出るまで判断を数コマに一度に間引く
        const rowMul = u.aiRow >= 2 ? 2.2 : u.aiRow === 1 ? 1.4 : 1;
        u.aiT = (dist < 30 ? 0.18 : dist < 80 ? 0.4 : 0.8) * (0.8 + Math.random() * 0.4) * rowMul;
      }
      if (u.target && (!u.target.alive || (u.target.team === u.team && !u.target.isStruct))) { u.target = null; u.aiT = 0; }
      this.act(u, simDt, near);
      if (!u.mounted && Math.hypot(u.push.x, u.push.z) > 0.35 && Math.hypot(u.mv.x, u.mv.z) < 0.3) u.slipT = Math.max(u.slipT || 0, 0.12);
      // 乾いた日に隊が動けば土ぼこりが立つ（近くの兵だけ）
      if (dist < 55 && (u.mounted ? 1 : 0.18) * Math.hypot(u.vel.x, u.vel.z) * simDt > Math.random() * 1.2) this.world.puff(u.pos.x, u.pos.z, u.mounted ? 2 : 1);
      {
        const px0 = u.pos.x, pz0 = u.pos.z;
        u.pos.x += u.vel.x * simDt;
        u.pos.z += u.vel.z * simDt;
        // 急な坂（切岸など）は登れない：道でなければ足が止まる（stk の詰まり判定で道へ回り直す）
        if (!this.world.walkable(u.pos.x, u.pos.z) && this.world.walkable(px0, pz0)) {
          u.pos.x = px0; u.pos.z = pz0; u.vel.x = 0; u.vel.z = 0; if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
        }
      }
      this.bodies(u, simDt);
      this.collide(u, simDt);
      const lim = this.world.def.moveLim || 176;
      if (this.leaveField(u)) continue;
      // 櫓の上の守り（perch.js）：床の上の持ち場から動かない（逃げ出したら解く）
      if (u.perch) { if (u.fleeing) u.perch = null; else { u.pos.x = u.perch.x; u.pos.z = u.perch.z; u.vel.x = 0; u.vel.z = 0; if (u.mv) { u.mv.x = 0; u.mv.z = 0; } } }
      u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x));
      u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
      // 舟に固定した兵は甲板の高さを保つ。普通の兵・櫓の持ち場は従来の地面判定を使う。
      if (u.perch && u.perch.y != null) u.pos.y = u.perch.y;
      else {
        const water = this.world.def.water;
        if (water && u.pos.x > water.x - 1 && u.pos.x < (water.x2 ?? Infinity) + 1) {
          u.pos.x = water.x2 != null && u.pos.x > (water.x + water.x2) / 2 ? water.x2 + 1 : water.x - 1;
        }
        u.pos.y = groundAt(this.world, u.pos.x, u.pos.z, u.pos.y);
      }
      this.animate(u, dt, near);
    }
    this.updateImpostors(cam);
    this.updateBullets(dt);
    this.updateArrows(dt);
    this.updateSmoke(dt);
    this.updateParticles(dt);
    this.updateStains(dt);
    this.updateFalling(dt);
    this.updateLooseHorses(dt);
  }

  // 遠近どちらの移動でも、逃げ切った兵だけを戦場から外す。
  leaveField(u) {
    if (u.fleeing && !u.isPlayer && u.offscreen && u.camD > 45) {
      if (!(u.escapeCheckAt > this.time)) {
        u.escapeCheckAt = this.time + 1;
        u.escapeThreat = !!this.nearestEnemy(u, 25);
      }
      const lim = this.world.def.moveLim || 176;
      const outside = Math.abs(u.pos.x) >= lim - 0.5 || Math.abs(u.pos.z) >= lim - 0.5 ||
        (this.world.def.fleeOut && this.world.def.fleeOut(u.pos.x, u.pos.z, u.team));
      const far = this.world.def.fleeFar !== false && !u.invuln && !u.name && u.camD > 90 && this.time - (u.fleeT ?? this.time) > 10;
      // 見える兵や追手の届く兵は残し、確認は一秒に一度まで。
      if (!u.escapeThreat && (outside || far)) { this.despawn(u); return true; }
    }
    return false;
  }

  // 遠い兵をまとめて描く（IMP）。兵の種類の番号は IMP_KIND（毎コマ作らない）。甲冑の色と旗ごとに、軽い兵の形の束を一つ持つ
  updateImpostors(cam) {
    if (!this.world.makeImpostor) return;
    const I = this.imp || (this.imp = new Map());
    if (cam) { const c = this.impCam || (this.impCam = { x: 0, z: 0 }); c.x = cam.x; c.z = cam.z; }
    for (const st of I.values()) st.n = 0;
    // 本人とカメラの60m以内は、画質に関わらず一人ずつの形（やがて骨の入った人）で描く。
    //   10/5 に低だけ 26m へ縮めたら、雨の森部・本能寺の御殿で目の前の兵が束の軽い形（棒人間）になった（10/7 kaito）。
    //   束へ写すのは 64m より先だけ。境目には4mの余裕。
    const low = S.quality === 'low', realNear = 60;
    const impFar = low ? 64 : Math.max(68, IMP.far);
    for (const u of this.units) {
      const k = IMP_KIND[u.type];
      const far = IMP.on && u.alive && !u.camHidden && !u.isPlayer && !u.isSub && !u.isStandard && !u.mounted && k !== undefined && !u.name && !(u.fall > 0) && u.look && !(u.human && u.human.root && u.human.root.visible)
        && Math.hypot(u.pos.x - (this.playerUnit?.pos.x ?? 0), u.pos.z - (this.playerUnit?.pos.z ?? 0)) > realNear
        && (!low || Math.abs(u.pos.y - this.world.heightAt(u.pos.x, u.pos.z)) < 0.6)
        && (low ? u.camD > (u.imp ? realNear : impFar) : (u.farSim || u.camD > (u.imp ? impFar - Math.min(6, impFar * 0.25) : impFar)));
      if (!far) { if (u.imp) { u.imp = false; if (u.mesh && !u.gone) u.mesh.visible = !u.camHidden; } continue; }
      u.imp = true;
      u.mesh.visible = false;
      // 一つの束（160 人）があふれたら、同じ甲冑と旗の二つ目・三つ目の束へ（あふれた兵を一人ずつ描かない）
      // 束の名（甲冑と旗）は兵ごとに一度だけ作る（毎コマ字をつながない）
      if (u.impLook !== u.look) { u.impLook = u.look; u.impKey = u.look.armor + '|' + (u.look.flag || ''); }
      //   低（携帯）は 110m より先の兵を、さらに軽い形の別の束へ（手前の束は腕・袖のある形）
      const xf = S.quality === 'low' && u.camD > (u.impXf ? 104 : 110);
      u.impXf = xf;
      const key0 = xf ? u.impKey + '|x' : u.impKey;
      let key = key0, st = I.get(key), kk = 1;
      while (st && st.n >= st.im.cap && kk < 4) { key = key0 + '#' + kk++; st = I.get(key); }
      if (!st) {
        st = { im: this.world.makeImpostor(u.look.armor, u.look.flag || 'tokugawa', 160, xf), n: 0 }; I.set(key, st);
        // 兵の更新なしにカメラだけ大きく動いた（写真モード）：そのカメラからの遠さでまとめ直す
        st.im.onCam = (p) => {
          const c = this.impCam;
          if (c && Math.hypot(p.x - c.x, p.z - c.z) < 8) return;
          for (const q of this.units) q.camD = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
          this.updateImpostors(p);
        };
      }
      if (st.n >= st.im.cap) { u.imp = false; u.mesh.visible = true; continue; }
      const helm = u.look.hat && u.look.hat.startsWith('kabuto') ? 1 : 0;
      st.im.put(st.n++, u.pos.x, u.pos.z, u.heading, k, helm, k === 0 ? 1.25 : 0, u.look.flag ? 1 : 0, (u.id * 0.618) % 1);
    }
    for (const st of I.values()) st.im.commit(st.n);
  }

  // 軽い兵（本物の人になっていない兵）をまとめて描く：兵の材質の部品を、形ごとに一つの InstancedMesh へ入れる
  //   （一人 8〜10 回描いていたのを、全員で形の数だけに）。描く直前（行列が新しくなった後）に Battle が呼ぶ
  //   形（近い形・遠い形）と影を落とすかどうかで束を分ける。
  //   まとめた部品は layers を空にして、本来の描画と影から外す（行列の更新と動きは今までどおり）
  batchDraw(cam) {
    this.restoreBatchRoots();
    const B = this.batch || (this.batch = { map: new Map(), mapC: new Map(), mapF: new Map(), maps: null, d2: 0, on: true, prev: [], cur: [], tag: 0, fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sph: new THREE.Sphere(new THREE.Vector3(), 3.4) });
    if (!B.mapF) B.mapF = new Map();
    if (!B.maps) B.maps = [B.map, B.mapC, B.mapF];
    // 細かい形にする近さ：画質に関わらず 16m（units_flags.js の lodSwap も同じ値を見る）
    //   骨の入った人を作り終えるまでの間に目の前へ出る形なので、低でも 9m で粗い形に落とさない（10/7 本能寺の御殿）
    const low = S.quality === 'low';
    LOD.near = 16;
    B.sh = !low; B.low = low;   // 低は影を描かないので、画面の外の兵の影の部品を束ねない
    B.cameraMask = cam ? cam.layers.mask : 1;
    if (!B.hiddenRoots) B.hiddenRoots = [];
    const tag = ++B.tag;
    for (const bm of B.maps) for (const e of bm.values()) e.n = 0;
    if (BATCH.on && cam) {
      B.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); B.fr.setFromProjectionMatrix(B.pm);
      const ce = cam.matrixWorld.elements, cx = ce[12], cy = ce[13], cz = ce[14];
      const W1 = B.w1 || (B.w1 = { children: [null] });
      for (const u of this.units) {
        const m = u.mesh;
        // 落ちた陣笠（地面に一つずつ置いた形）も同じ束へ（一つずつ描かない）
        const hat = u.hatOff;
        if (hat && hat.parent && hat.visible && !hat.userData.groundKept) {
          const he = hat.matrixWorld.elements, hx = he[12] - cx, hy = he[13] - cy, hz = he[14] - cz;
          B.d2 = hx * hx + hy * hy + hz * hz;
          B.sph.center.set(he[12], he[13] + 1.6, he[14]);
          B.sph.radius = 3.4;
          B.on = B.fr.intersectsSphere(B.sph);
          B.hide = low && B.d2 > 2025;
          W1.children[0] = hat; this.batchWalk(W1, null, tag, B);
        }
        if (!m || !m.visible || !m.parent || u.imp || u.isPlayer) continue;
        const e = m.matrixWorld.elements, dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
        B.d2 = dx * dx + dy * dy + dz * dz;
        B.sph.center.set(e[12], e[13] + 1, e[14]);
        // 長い槍の先と馬印が画面に残る間は、体の中心が外でも省かない。
        B.sph.radius = Math.max(u.mounted ? 6 : 3.4, (u.wpn?.userData.spec?.L || 0) + 1);
        // 画面の外の兵は、影を落とす部品だけ束ねる（影の描き込みで一つずつ描かない。見えない部品は元どおり外される）
        B.on = B.fr.intersectsSphere(B.sph);
        // 画質「低」（携帯）：150m より先の兵（背丈が二、三画素）と、45m より先の倒れた兵は、部品を描かない（一人ずつ描く旗・得物も）
        B.hide = low && (!B.on || B.d2 > 22500 || (!u.alive && B.d2 > 2025));
        const retained = this.batchWalk(m, u.human && u.human.root, tag, B);
        // 軽い形にした人の指物（竿の骨に付け替えてあるので上の辿りでは届かない）も束へ。近くの細かな布の旗は元のまま
        const fl = u.flag, h = u.human;
        if (fl && h && h.lodFar && fl.parent && fl.parent === h.flagHolder && fl.visible && !fl.material?.userData?.nearFlag) { W1.children[0] = fl; this.batchWalk(W1, null, tag, B); }
        // 全部品が束へ移った兵は、描く間だけ親から走査を止める。骨・独自の材質は残す。
        if (low && !retained && !m.isMesh) { m.visible = false; B.hiddenRoots.push(m); }
      }
      // 地に落ちた得物と、地面に刺さった矢（どちらも場に一つずつ置いた形）も同じ束へ。画質「低」は 35m より先を描かない
      //   城攻めのように討たれる者が多い戦では、落ちた槍と矢だけで描く回数が二百を越えていた
      const loose = (o) => {
        const oe = o.matrixWorld.elements, ox = oe[12] - cx, oy = oe[13] - cy, oz = oe[14] - cz;
        B.d2 = ox * ox + oy * oy + oz * oz;
        B.sph.center.set(oe[12], oe[13], oe[14]);
        B.sph.radius = Math.max(3.4, (o.userData.spec?.L || 0) + 1);
        B.on = B.fr.intersectsSphere(B.sph);
        B.hide = low && B.d2 > 1225;
        W1.children[0] = o; this.batchWalk(W1, null, tag, B);
      };
      for (const u of this.units) { const w = u.dropped; if (w && w.parent === this.scene && w.visible && !w.userData.groundKept) loose(w); }
      if (this.litter) for (const o of this.litter) if (o.parent === this.scene && o.visible) loose(o);
      if (this.arrows) for (const a of this.arrows) if (a.stuck && a.mesh.parent === this.scene && a.mesh.visible) loose(a.mesh);
    }
    // 前のコマでまとめていて今は外れた部品を、元の描き方へ戻す
    for (const c of B.prev) if (c.userData.bT !== tag) c.layers.mask = 1;
    const t = B.prev; B.prev = B.cur; B.cur = t; t.length = 0;
    for (const bm of B.maps) for (const e of bm.values()) {
      e.im.count = e.n; e.im.visible = e.n > 0;
      if (e.n) { e.im.instanceMatrix.needsUpdate = true; if (e.col) e.im.instanceColor.needsUpdate = true; }
    }
  }
  restoreBatchRoots() {
    const roots = this.batch && this.batch.hiddenRoots;
    if (!roots) return;
    for (const root of roots) root.visible = true;
    roots.length = 0;
  }
  batchWalk(o, skip, tag, B) {
    const ch = o.children;
    let retained = false;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!c.visible) continue;
      if (c === skip) { retained = true; continue; }
      if (B.hide) { if (c.isMesh && !c.isSkinnedMesh) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); } }
      else if (c.isMesh && (c.material === MAT || c.material?.userData?.waterSource === MAT) && (B.on || (c.castShadow && B.sh)) && !c.isSkinnedMesh && !c.isInstancedMesh) {
        const L = c.userData.lod;
        if (L || c.onBeforeRender === NO_OBR) {
          let geo = c.geometry;
          if (L) { const nr = L[2] ?? LOD.near; geo = !LOD.on || B.d2 < nr * nr ? L[0] : L[1]; }
          const cs = c.castShadow && !B.low;   // 低は影を描かないので、影を落とす部品も同じ束へ
          const bm = cs ? B.mapC : B.map;
          const pi = palOf(geo);   // 全画質で、色だけ違う形は一つの束へ（色と濡れ具合は保つ）
          if (pi) geo = pi.geo;
          const wet = c.material.userData?.waterLevel || 0;
          const mat = wet ? waterMaterial(pi ? MAT_P : MAT_I, wet) : null;
          const key = mat ? waterBatchKey(geo, mat) : geo;
          let e = bm.get(key);
          if (!e || e.n >= e.cap) e = this.batchGrow(geo, e, bm, cs, mat, key);
          c.matrixWorld.toArray(e.arr, e.n * 16);
          if (pi) e.col[e.n * 3] = pi.row;
          e.n++;
          c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
        }
      }
      // 指物（家の旗の絵の布）も、旗の材質ごとに一つの束へ（遠くの兵の旗を一枚ずつ描かない。薄れた旗・影を落とす旗は元のまま）
      // 足もとの丸い影も、同じ材質なので一つの束へ
      else if (c.isMesh && c.material?.isMaterial && B.on && !c.isInstancedMesh && !(c.castShadow && B.sh) && ((c.geometry === flagGeo && !c.material.transparent) || (c.geometry === this.blobGeo && c.material === this.blobMat))) {
        let e = B.mapF.get(c.material);
        if (!e || e.n >= e.cap) e = this.batchGrow(c.geometry, e, B.mapF, false, c.material);
        c.matrixWorld.toArray(e.arr, e.n * 16); e.n++;
        c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
      }
      // 鉄砲の火縄の火（一つずつ描く小さな玉）は 20m より先では一画素にも満たないので描かない
      else if (c.geometry === EMBER_GEO && B.d2 > 400) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); }
      // 前の束から外れた部品は、この後 layers が戻るので親を隠さない。
      if ((c.isMesh || c.isSprite || c.isPoints || c.isLine || c.isLight) && ((c.layers.mask & B.cameraMask) || (c.userData.bT !== undefined && c.userData.bT !== tag && (B.cameraMask & 1)))) retained = true;
      if (c.children.length && this.batchWalk(c, skip, tag, B)) retained = true;
    }
    return retained;
  }
  batchGrow(geo, e, bm, cast, mat = null, key = null) {
    const cap = e ? e.cap * 2 : 16;
    const isP = !!geo.userData.pal;
    const im = new THREE.InstancedMesh(geo, mat || (isP ? MAT_P : MAT_I), cap);
    if (isP) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    im.matrixAutoUpdate = false; im.frustumCulled = false; im.name = 'unitBatch'; im.castShadow = !!cast;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const ne = { im, cap, n: e ? e.n : 0, arr: im.instanceMatrix.array, col: isP ? im.instanceColor.array : null };
    if (e) { ne.arr.set(e.arr.subarray(0, e.n * 16)); if (isP) ne.col.set(e.col.subarray(0, e.n * 3)); this.scene.remove(e.im); e.im.dispose(); }
    this.scene.add(im); bm.set(key || (isP ? geo : (mat || geo)), ne);
    return ne;
  }

  despawn(u) {
    if (u.gone) return;
    if (u.loopP) this.freeSama(u);
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    // 退いて地図の外・遠景の手前へ消えた者は「討たれた」のではない（討ち取りは army_combat.js の kill だけが決める）
    //   名のある武将（busho・名あり）が退いて消える時は、討たれた扱いにせず「落ち延びた」の知らせだけ出す
    const fled = u.alive && u.fleeing && u.name && u.type === 'busho';
    // 無傷の遠景への置き換えは死傷に含めず、陣形の人数と持ち場も一緒に詰める。
    if (u.alive && u.hp > 0 && !u.fleeing && !u.woundOut && !u.rearWound && u.group) {
      const g = u.group; for (const o of g.units) if (o !== u && o.slot > u.slot) o.slot--;
      if (g._slotTypes) g._slotTypes.splice(u.slot, 1);
      u.slot = -1; g._mix = null;
      g.initial = Math.max(0, g.initial - 1);
    }
    u.alive = false;
    u.gone = true;
    for (const a of this.arrows) if (a.host === u) a.life = 0;
    this.scene.remove(u.mesh);
    if (fled && this.hooks.onFlee) this.hooks.onFlee(u);
    // 逃げた者が捨てた槍・陣笠は、潰走の跡として地面に残す（残すのは 160 個まで。あふれたら本人から一番遠い物から片付ける）
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
  }
}

// Army の手法は役目ごとのファイルに分けてある。class の手法と同じ形（書き換えられる・数え上げない）で足す
for (const part of [ArmyCombat, ArmyFx, ArmyRanged, ArmyGroups, ArmyThink, ArmyDuel, ArmyMove, ArmyAnim, ArmyGround]) for (const k of Object.keys(part)) Object.defineProperty(Army.prototype, k, { value: part[k], writable: true, configurable: true, enumerable: false });


// 技の長さ（秒）と、穂先・刃が届く時（割合）
// 長柄の叩きは、振り上げ（構えの溜め）の後、柄が撓んで 0.2 秒で落ちる（三間柄の重さ）
const SWING = { thrust: [0.22, 0.5], charge: [0.2, 0], slam: [0.3, 0.67], sweep: [0.34, 0.55], kesa: [0.26, 0.55], gyaku: [0.26, 0.55], yoko: [0.26, 0.5], tsuki: [0.22, 0.5], butt: [0.24, 0.55] };
// 刀の構え [x, y, z, 上下, 左右, 刃の向き]（手の置き所。体の外の座標）
const SW_POSE = {
  sage: [0.28, 1.0, 0.25, 0.5, 0, 0], chudan: [0.12, 1.12, 0.32, -0.45, -0.08, 0],
  kesa0: [0.3, 1.62, 0.02, -2.2, 0.35, -0.3], kesa1: [-0.12, 0.95, 0.42, 0.75, -0.55, -0.5],
  gyaku0: [-0.12, 0.92, 0.2, 0.7, -0.7, 2.6], gyaku1: [0.3, 1.58, 0.38, -1.4, 0.55, 2.6],
  yoko0: [0.38, 1.3, 0.0, -0.15, 1.5, -1.57], yoko1: [-0.25, 1.25, 0.35, -0.1, -1.2, -1.57],
  tsuki0: [0.18, 1.15, -0.02, -0.08, 0, 1.57], tsuki1: [0.08, 1.25, 0.72, -0.05, -0.05, 1.57],
  // 馬上の斬り：右の肩の上へ振りかぶり、馬の右の脇の低い所（徒歩の相手の肩・首）へ斬り下ろす
  uma0: [0.32, 1.68, -0.02, -2.3, 0.45, -0.25], uma1: [0.5, 0.92, 0.42, 0.85, 0.35, -0.55],
  // 受け：柄を右のこめかみの前へ上げ、切先を左下へ垂らして刀身を斜めに（鎬で相手の刃を左下へ受け流す）
  uke: [0.2, 1.55, 0.3, 0.75, -0.9, 0], cheer: [0.3, 1.9, 0.1, -1.6, 0, 0],
};
// 八相・上段（中段と袈裟の振りかぶりの間の形から作る）
const SW_HASSO = [0.26, 1.42, 0.12, -1.55, 0.2, -0.15], SW_JODAN = [0.14, 1.66, 0.16, -1.9, 0.05, 0];
// 鉄砲の構え [x, y, z, 上下]
const GUN_POSE = {
  carry: [0.3, 1.08, 0.18, -0.8], ready: [0.22, 1.1, 0.25, -0.35], kiri: [0.2, 1.14, 0.26, -0.12], aim: [0.1, 1.45, 0.25, -0.02], fire: [0.1, 1.45, 0.25, -0.02],
  lower: [0.24, 0.74, 0.34, -1.45], powder: [0.24, 0.74, 0.34, -1.45], ball: [0.24, 0.74, 0.34, -1.45], ram: [0.24, 0.74, 0.34, -1.45], prime: [0.18, 1.02, 0.3, -0.12], match: [0.18, 1.02, 0.3, -0.12],
};
// 込め直しの手順と、それぞれにかかる割合（合わせて 1）
const RELOAD = [['lower', 0.06], ['powder', 0.16], ['ball', 0.1], ['ram', 0.34], ['prime', 0.22], ['match', 0.12]];
// 弓の構え [x, y, z, 上下, 左右]（弓を持つ左手）
const BOW_POSE = { rest: [-0.28, 1.0, 0.18, 0.12, 0], nock: [-0.05, 1.08, 0.36, 0.05, -0.2], raise: [0.02, 1.76, 0.3, 0, -0.25], kai: [-0.02, 1.5, 0.62, 0, -0.3] };
const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// 槍の突きの出（0..1）：溜めから加速して一気に突き出し（出の半ば、当たる時に伸び切る。一コマで跳ばない）、穂先を一瞬とどめ、
// 中くらいの速さ（0.26 秒ほど）で手元へ繰り込んで構え直す。humans.js の体の踏み込みも同じ拍子で
export function thrustOut(p, dur = 0.22) {
  if (p < 0.5) { const x = p / 0.5; return x * x * (3 - 2 * x); }
  if (p < 0.66) return 1;
  const r = clamp01((p - 0.66) * dur / 0.26);
  return 1 - r * r * (3 - 2 * r);
}
const _nk = new THREE.Vector3();
// 血の見せ方（設定）：2 あり・1 控えめ・0 なし
export function bloodLv() { const b = S.blood; return b === 'off' ? 0 : b === 'low' ? 1 : 2; }
// 粒の色
const PCOL = { blood: [0.3, 0.06, 0.045], dust: [0.42, 0.37, 0.29], cloth: [0.36, 0.34, 0.3], wood: [0.45, 0.36, 0.24] };
// 染みの形：縁の不揃いな円を三通り
// 地面の染み：寝かせた板に、にじんだ染みの絵（白地の濃淡とアルファ。色は材質の色で付ける）
const STAIN_PLANE = new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2);
const STAIN_TEX = [0, 1, 2].map((s) => {
  const r = rng(71 + s * 13), S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  // 大きな溜まり一つと、まわりに寄り添う小さな溜まり（縁が不規則に）
  const blob = (x, y, rad, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  blob(S / 2, S / 2, S * 0.28, 0.95);
  for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = S * (0.1 + r() * 0.2); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.06 + r() * 0.12), 0.6 + r() * 0.35); }
  // 飛び散った小さな点
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = S * (0.3 + r() * 0.16); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.5 + r() * 3, 0.7); }
  // 土に吸われたむら（明暗の雑音）
  const img = g.getImageData(0, 0, S, S), D = img.data;
  for (let i = 0; i < D.length; i += 4) { const n = 0.75 + r() * 0.25; D[i] = D[i + 1] = D[i + 2] = 255 * n; D[i + 3] *= 0.8 + r() * 0.2; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
// 粒の丸い絵（血しぶき・土・火花。縁をぼかす）
let _dot = null;
function roundDot() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
// 誤差関数（弾の当たる見込み）
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
// 線分 a→b が柵の線 s と交わる所（a→b の割合 0..1）。交わらなければ -1
const NO_SEGS = [];
const SEG_SET = new Set(), SEG_OUT = [];
function segsIn(grid, cx0, cx1, cz0, cz1) {
  SEG_SET.clear(); SEG_OUT.length = 0;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = grid.get(cx * 4096 + cz); if (!a) continue;
    for (const s of a) if (!SEG_SET.has(s)) { SEG_SET.add(s); SEG_OUT.push(s); }
  }
  return SEG_OUT;
}
function segHit(ax, az, bx, bz, s) {
  const [cx, cz, dx, dz] = s;
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return -1;
  const qx = cx - ax, qz = cz - az;
  const u = (qx * sZ - qz * sX) / den, v = (qx * rZ - qz * rX) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? u : -1;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distToSeg(x, z, s) {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

// 空馬の元の持ち主の家の名（「武田の馬を分捕った」の札に使う）
const HOUSE_NAME = { tokugawa: '徳川', takeda: '武田', akazonae: '山県の赤備え', okudaira: '奥平', oda: '織田', imagawa: '今川', saito: '斎藤', rokkaku: '六角' };
