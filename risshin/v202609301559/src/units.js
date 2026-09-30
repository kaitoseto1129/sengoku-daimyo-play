import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture, drawMon } from './textures.js';
import { sfx, withPan } from './audio.js';
import { S } from './settings.js';
import { WIND_STATE } from './world.js';
// 役目ごとに分けたファイル
import { Group, Unit } from './units_group.js';
import { FACTION, TYPES, GENERALS, SKIN_TONES } from './units_data.js';
import { buildModel } from './units_look.js';
import { horseStyleFor, buildHorse, paint, at, MAT, MAT_I, P, merge, RIDE, seatLegs, rng } from './units_model.js';
import { numberedFlag, FLAG_T, FLAG_W, fadedFlag, IMP, BATCH, LOD } from './units_flags.js';
import { ArmyCombat } from './army_combat.js';
import { ArmyFx } from './army_fx.js';
import { ArmyRanged } from './army_ranged.js';
import { ArmyGroups } from './army_groups.js';
import { ArmyThink } from './army_think.js';
import { ArmyDuel } from './army_duel.js';
import { ArmyMove } from './army_move.js';
import { ArmyAnim } from './army_anim.js';
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
const _dUp = new THREE.Vector3(), _dN = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dI = new THREE.Quaternion();

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
    const fac = FACTION[g.faction] || FACTION.oda;
    const u = new Unit({ team: g.team, ...o });
    u.group = g;
    u.slot = g.units.length;
    g.units.push(u);
    g.initial++;
    const t = TYPES[u.type];
    // 名のある実在の武将は、その人の兜・甲冑・陣羽織で
    const gen = (o.name && GENERALS[o.name.replace(/^.* /, '')]) || {};
    // 母衣衆（使番）は大将のいる隊の騎馬の二騎だけ（大将のそばに付く）。残りの騎馬は指物を立て、旗の林にする
    const horoCav = u.type === 'cavalry' && o.flag === undefined && (g._horoN || 0) < 2 && g.units.some((x) => x.type === 'busho');
    if (horoCav) g._horoN = (g._horoN || 0) + 1;
    if (horoCav) o = { ...o, flag: null };
    // 見た目の組み合わせ（一人ずつ変えるが、形の数が増えすぎないよう六通りに束ねる）
    const vi = u.id % 6;
    const tier = u.type === 'player' ? (o.tier ?? 0) : gen.armor ? 3 : u.type === 'busho' ? 3 : (u.type === 'samurai' || u.type === 'cavalry') ? 1 : 0;
    const look = {
      armor: o.armor ?? gen.armor ?? (u.type === 'busho' ? (fac.busho ?? 0x1c1a1a) : fac.armor),
      // 威糸の色に少しばらつきを持たせる
      lace: o.lace ?? gen.lace ?? [fac.lace, fac.lace2 || fac.lace, fac.lace3 || fac.lace][vi % 3],
      // 足軽の六人に一人は陣笠を脱いで鉢巻、一人は陣笠の下に手拭い
      hat: (gen.hatFix && gen.hat) || (o.hat ?? gen.hat ?? (u.type === 'busho' ? 'kabuto_b' : tier === 0 && vi === 5 && (u.type === 'ashigaru' || u.type === 'bow') ? 'hachimaki' : t.hat)),
      tenugui: tier === 0 && vi === 2,
      sode: u.type === 'samurai' || u.type === 'busho' || o.sode,
      haori: o.haori ?? gen.haori ?? (u.type === 'busho' ? (fac.haori ?? (g.team === 0 ? 0x6b1f18 : 0x5a4a22)) : 0),
      pole: o.flag !== null && u.type !== 'porter',
      flag: o.flag === null || u.type === 'porter' ? null : (o.flag || fac.flag),
      // 旗の大きさで隊が分かる：鉄砲は小旗、騎馬は大きな指物
      flagScale: o.flagScale || (u.type === 'busho' ? 1.3 : u.type === 'gun' ? 0.55 : u.type === 'cavalry' ? 1.35 : 1),
      weapon: o.weapon || t.weapon,
      // 足軽の槍は長柄（5m ほど）
      weaponExtra: o.weaponExtra ?? 0,
      // 槍の拵え：足軽は長柄（三間。織田は三間半）、騎馬と侍は素槍、武将は大身槍
      spear: o.spear ?? (o.weaponExtra != null ? null : u.type === 'ashigaru' && !o.weapon ? (g.faction === 'oda' ? 'nagae35' : 'nagae') : u.type === 'busho' ? 'omi' : 'su'),
      skin: o.skin ?? gen.skin ?? SKIN_TONES[vi],
      // 顔：名のある武将はその人の顔、本人は本人の顔、兵は十二の顔から
      face: o.face ?? (gen.face ? 'g:' + o.name.replace(/^.* /, '') : (u.id * 7) % 12),
      // 鎧下・袴の色：藍・茶・鼠・黒
      //   同じ色でも人ごとに明るさと色あいを ±6% ずらす（褪せた藍・柿渋寄り・生成り寄り。形の数が増えすぎないよう三通り）
      cloth: o.cloth ?? clothVar((fac.cloth || [0x2b2622, 0x262c3a, 0x3a2e24, 0x34342e, 0x262c3a, 0x2b2622])[vi], Math.floor(u.id / 6) % 5),
      saya: u.type === 'samurai' || u.type === 'busho' || u.type === 'cavalry' || o.saya,
      menpo: o.menpo ?? (gen.armor ? gen.menpo || 0 : (u.type === 'busho' && vi % 2 === 0 ? 0x6a1c14 : u.type === 'samurai' && u.id % 2 === 0 ? 0x1c1a18 : 0)),
      menpoStyle: o.menpoStyle ?? gen.menpoStyle ?? (u.type === 'busho' ? 'hanbo' : 'full'),
      // 母衣は母衣衆（騎馬の使番）と、史実で母衣を着けた武将（前田利家の赤母衣など）だけ
      //   織田の使番は黄母衣と赤母衣、ほかの家は威糸の色
      horo: gen.horo ?? (horoCav ? (g.faction === 'oda' ? (g._horoN === 1 ? 0xb8902a : 0x9a2418) : fac.lace) : 0),
      tier, vi, mon: o.mon ?? gen.mon ?? fac.flag, haoriMonCol: gen.haoriMonCol,
      trim: o.trim || 0, left: o.left || null, uma: o.uma || null, dirt: o.dirt, hero: u.type === 'player',
      // 本物の胴丸（humans.js の3Dスキャン）を着る（侍大将より上の本人など）
      real: o.real || 0,
      // 僧兵（humans.js で白い裹頭・袈裟・薙刀を着せる）
      sohei: o.sohei || 0,
    };
    buildModel(u, look);
    if (u.type === 'cavalry') o.horse = true;
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
      const h = (hi ? 0.908 : 0.891) + Math.random() * (hi ? 0.069 : 0.063), w = 0.93 + Math.random() * 0.15;
      u.mesh.scale.set(h * w, h, h * (0.96 + (w - 1) * 0.6));
    }
    // 本人も当時の背丈に（1.63m ほどで一定。兵の 1.55〜1.70m の中ほど）
    if (u.type === 'player') u.mesh.scale.setScalar(0.935);
    u.pos.y = this.world.heightAt(u.pos.x, u.pos.z);
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
    const total = g.units.length + n;
    // 隊の種類：六割より多くが鉄砲なら鉄砲の隊（段を組んで入れ替わる）、騎馬なら騎馬の隊（間を広くとる）
    const cnt = (ty) => g.units.filter((x) => x.type === ty).length + list.reduce((a, s) => a + (s.type === ty ? s.n : 0), 0);
    // 持ち場を決めるための、並びの番ごとの兵の種類（騎馬の混じる隊で騎馬を塊にする。馬に乗る武将も騎馬に数える）
    g._slotTypes = g.units.map((x) => (x.type === 'cavalry' || x.mounted ? 'cavalry' : x.type));
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
    for (const spec of list) {
      for (let k = 0; k < spec.n; k++) {
        const p = g.slotPos(i, total);
        // 大きめの部隊には隊旗を持つ旗持ちを一人（鉄砲の隊は、小旗の中に大きな隊旗が一本）
        const bo = banner && (spec.type === 'ashigaru' || (g.isGun && spec.type === 'gun')) && !(spec.o && spec.o.flag === null) ? { flagScale: 1.9 } : {};
        const u = this.addUnit(g, { type: spec.type, x: p.x + (Math.random() - 0.5) * 0.4, z: p.z + (Math.random() - 0.5) * 0.4, ...(spec.o || {}), ...bo });
        if (bo.flagScale) { u.banner = true; banner = false; }
        else if (g.kumiNo && u.flag && !u.name && u.look && u.look.flag && u.type !== 'cavalry') u.flag.material = numberedFlag(u.look.flag, g.kumiNo);
        out.push(u);
        i++;
      }
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

  forNear(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.grid.get((i + 20000) * 40000 + j + 20000);
      if (a) for (let q = 0; q < a.length; q++) fn(a[q]);
    }
  }

  nearestEnemy(u, r, filter) {
    let best = null, bd = Infinity;
    const r2 = r * r;
    // 攻めかかる隊は、10m より遠くの逃げる敵を後回しにする（深追いしない）
    const late = u.group && u.group.order === 'attack';
    this.forNear(u.pos.x, u.pos.z, r, (o) => {
      if (o.team === u.team || !o.alive || (o.invuln && !o.allyOk) || o.noTarget) return;
      if (filter && !filter(o)) return;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      const d = dx * dx + dz * dz;
      if (d >= r2) return;
      const k = late && o.fleeing && d > 100 ? d + 1e6 : d;
      if (k < bd) { bd = k; best = o; }
    });
    return best;
  }

  // pos から的 tp までの間に塀・柵（seg）があるか。塀のすぐ内側（2.5m 以内）の城方が外を突くのはよいが、外から内へは届かない
  // pos から tp までの間にある、よその側の塀・柵（無ければ null）
  wallAt(pos, team, tp) {
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team === team) continue;
      if (segHit(pos.x, pos.z, tp.x, tp.z, s.seg) >= 0) return s;
    }
    return null;
  }
  // over：槍で柵越しに突く（すぐ前（2.2m）の柵は、敵味方どちらの柵でも越えて届く。塀は越えない）
  wallBetween(pos, team, tp, over = false) {
    for (const s of this.structs) {
      if (!s.alive || !s.seg) continue;
      if (segHit(pos.x, pos.z, tp.x, tp.z, s.seg) < 0) continue;
      if (s.team === team && distToSeg(pos.x, pos.z, s.seg) < 2.5) continue;
      if (over && /柵/.test(s.name || '') && distToSeg(pos.x, pos.z, s.seg) < 2.2) continue;
      return true;
    }
    return false;
  }

  enemiesInArc(pos, heading, reach, halfAngle, team, over = false) {
    const out = [];
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.forNear(pos.x, pos.z, reach + 1, (o) => {
      // 討たれない武将も、手傷を負って退くまでは突ける（damage で下限に止める）
      if (o.team === team || !o.alive || (o.invuln && o.woundOut)) return;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      // 的には体の太さ（半径 0.3m ほど、馬上は 0.6m）がある：穂先が体の端にかかれば当たる
      const rad = o.mounted ? 0.6 : 0.3;
      if (d > reach + 0.35 + rad) return;
      if (this.wallBetween(pos, team, o.pos, over)) return;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (cos < Math.cos(Math.min(1.4, halfAngle + Math.atan2(rad, Math.max(0.5, d))))) return;
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
    // 同じ音が一度にたくさん重なるときは、まとめて一つの大きな音にする（一斉射撃・弓の斉射・騎馬の群れ）
    const lim = SOUND_BUNCH[name];
    if (lim) {
      const s = this.sndBunch || (this.sndBunch = {});
      const r = s[name] || (s[name] = { t: -9, n: 0 });
      if (this.time - r.t > 0.4) { r.t = this.time; r.n = 0; }
      r.n++;
      if (r.n > lim[0]) {
        // 撃った数が多いほど厚く：九発目・十七発目で一斉の音をもう一つ重ねる
        if (lim[1] && (r.n === 9 || r.n === 17)) { name = lim[1]; vol *= 0.75; }
        else if (r.n !== lim[0] + 1 || !lim[1]) return;
        else { name = lim[1]; vol *= 1.1; }
      }
    }
    const v = this.hooks.volumeAt ? this.hooks.volumeAt(pos) : 1;
    const pan = this.hooks.panAt ? this.hooks.panAt(pos) : 0;
    withPan(pan, () => sfx(name, v * vol));
  }

  // 馬に乗せる・降ろす（乗り手の手・旗・馬印を鞍の高さへ）
  setMounted(u, on, horse) {
    if (!!u.mounted === on) return;
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
  }

  // 塀・柵（seg の構え）に四方を囲まれた所か：八方へ 70m の線を引き、六方より多くが構えに当たれば曲輪の中
  walledIn(p) {
    const segs = this.structs.filter((s) => s.seg && s.alive !== false);
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
  // 戦の始めの一度：馬に乗せた武将のうち、曲輪の中にいる者を降ろす（戦の定義は兵を置いてから塀を立てることがあるため）
  rideCheck() {
    this._rideChk = true;
    for (const u of this.units) if (u.autoHorse && u.mounted && this.walledIn(u.pos)) { const h = u.horse; this.setMounted(u, false); if (h && h.parent) h.parent.remove(h); u.horse = null; }
  }

  update(dt, focus, cam, frustum) {
    // 画質「低」では、装備の土埃・錆・布のしわの凹凸（描く手間の掛かる所）を省く
    const hq = S.quality !== 'low';
    if (!!MAT.defines.UNIT_HQ !== hq) { if (hq) MAT.defines.UNIT_HQ = 1; else delete MAT.defines.UNIT_HQ; MAT.needsUpdate = true; MAT_I.needsUpdate = true; }
    FLAG_T.value += dt;
    FLAG_W.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
    this.time += dt;
    this.rebuildGrid();
    this.wind = (this.wind || 0.6) + Math.sin(this.time * 0.05) * 0.002;
    // プレイヤーを狙って構えている敵（予備動作の表示と同時攻撃数の制限に使う）
    this.threats = [];
    for (const u of this.units) if (u.alive && ((u.atk && u.atk.target.isPlayer && !u.atk.bow) || (u.charging && u.cv === 'in' && u.target && u.target.isPlayer && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 10))) this.threats.push(u);
    this.playerAttackers = this.threats.length;
    if (!this._rideChk) this.rideCheck();
    // 囲まれ具合（0.25 秒ごと）：本人の 6m 内の敵と 10m 内の味方を数える。味方が少ないまま敵の塊に入ると、
    // 同時に打ちかかる数の上限（maxAttackers）が敵の数まで上がる（単騎で本隊へ入れば四方から打たれる。kaito 2026-09-27）
    // kaito 9/30：味方の数える輪を8m→10mに（突撃の場面で組が少し離れて続いていても「支えがある」と数えるように）
    if ((this.crowdT = (this.crowdT || 0) - dt) <= 0) {
      this.crowdT = 0.25;
      const P = this.playerUnit;
      let foe = 0, ally = 0;
      if (P && P.alive) this.forNear(P.pos.x, P.pos.z, 10, (o) => {
        if (!o.alive || o === P || o.type === 'dummy' || o.type === 'porter' || o.fleeing) return;
        const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
        if (o.team !== P.team) { if (d < 6 && o.type !== 'gun' && o.type !== 'bow') foe++; } else ally++;
      });
      this.playerCrowd = foe;
      // 味方の支えが薄いまま囲まれている（組がそばにいれば囲まれにくい。一人で五人に寄られて初めて）
      this.playerMobbed = foe >= 5 && ally * 1.5 < foe;
      // 囲まれても同時に打ちかかるのは四人まで（前は五人。乱戦すぎるとの声で、ほんの少しだけ絞った。ほかは間合いの外で構えて待つ）
      this.attackCap = this.playerMobbed ? Math.max(this.maxAttackers || 3, Math.min(this.mobCapMax || 4, foe - 1)) : (this.maxAttackers || 3);
      if (P) P.mobbed = this.playerMobbed;
    }
    this.updateGroups(dt);
    this.duelTick(dt);
    // 遠景の大軍（world.js）が、本物の兵のいる所に重ならないよう道を譲らせる（0.7 秒ごと）
    if (this.world.yieldArmies && (this.yieldT = (this.yieldT || 0) - dt) <= 0) {
      const pts = [];
      for (const u of this.units) if (u.alive && u.type !== 'dummy' && !u.noTarget) pts.push(u.pos);
      this.world.yieldArmies(pts, 0.7 - this.yieldT);
      this.yieldT = 0.7;
    }
    this.lodT -= dt;
    const doLod = this.lodT <= 0;
    if (doLod) this.lodT = 0.4;
    for (const u of this.units) {
      // 倒れ切って固まった体・逃げ去った者は、もう何も計算しない（数が増えても重くならない）
      if (!u.alive && (u.gone || (u.death && !u.mounted && u.death.t >= DEATH_END) || (u.mounted && u.deadT >= 4))) continue;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      u.lastHitT += dt;
      u.camD = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
      // 手足の省き・旗・判断の間引きは、本人とカメラの近い方で決める（開戦の引きや写真モードで、カメラの前の兵が棒立ちにならないように）
      const dist = Math.min(Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z), u.camD);
      const near = dist < 70;
      if (doLod && u.alive) {
        u.legL.visible = u.legR.visible = near;
        if (u.flag) u.flag.visible = dist < 110 && !(u.group && u.group.hideFlags);
        // 影は体だけでなく、頭・腿・脛・腕・馬印も同じ遠さで切る（遠くの兵の影の描き込みを省く）
        const sh = dist < (this.shadowDist ?? 34) && this.shadows !== false;
        if (u.shOn !== sh) {
          u.shOn = sh;
          for (const m of [u.body, u.head, u.legL, u.legR, u.shinL, u.shinR, u.armR, u.armL, u.uma]) if (m) m.castShadow = sh;
        }
      }
      // 画面の外にいる兵は手足の動きを省く
      if (frustum && u.alive) { this.tmpSphere.center.set(u.pos.x, u.pos.y + 1, u.pos.z); u.offscreen = !frustum.intersectsSphere(this.tmpSphere); }
      // カメラのすぐ前にいる兵は消して視界を確保する
      if (cam && u.alive && !u.isPlayer) {
        const cd = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        // 消すのは味方だけ（自分のすぐ横で斬り合っている者は除く）。敵は、カメラが体の中に入るほど近い時（0.6m）だけ消す
        //   （斬り合う相手・打ちかかってくる敵が、カメラの近くで透けて見えなくならないように）
        const P = this.playerUnit;
        const lim = u.team !== (P ? P.team : 0) ? 0.6 : (u.target && u.target.alive && !u.target.isStruct && P && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 1.6 ? 0.6 : 2.2);
        u.mesh.visible = !(cd < lim && Math.abs(u.pos.y + 1.2 - cam.y) < 2);
        // 得物はカメラのすぐ前（体ごと消す 2.2m）まで見せる。隠すと手だけが宙を握って見える（鉄砲・弓・刀は近くても隠さない）
        if (u.wpn && !(u.human && u.human.cmdHid)) u.wpn.visible = dist < 95 && (cd > lim || (u.wpnKind || u.lookWeapon) !== 'spear');
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
      }
      if (!u.alive || u.isPlayer || u.type === 'dummy') { this.animate(u, dt, near); continue; }
      if (u.confused > 0) u.confused -= dt;
      u.cd -= dt;
      // 込め直しは足を止めてでないとできない（歩いている間は進まない）
      if (u.reload) { if (u.moving > 0.5 || u.fleeing) u.cd += dt; else u.reload.t += dt; if (u.cd <= 0) u.reload = null; }
      // AI の間引き（遠い兵ほど判断間隔を長くする）
      u.aiT -= dt;
      if (u.aiT <= 0) {
        this.think(u);
        u.aiT = (dist < 30 ? 0.18 : dist < 80 ? 0.4 : 0.8) * (0.8 + Math.random() * 0.4);
      }
      if (u.target && (!u.target.alive || (u.target.team === u.team && !u.target.isStruct))) { u.target = null; u.aiT = 0; }
      this.act(u, dt, near);
      // 乾いた日に隊が動けば土ぼこりが立つ（近くの兵だけ）
      if (dist < 55 && (u.mounted ? 1 : 0.18) * Math.hypot(u.vel.x, u.vel.z) * dt > Math.random() * 1.2) this.world.puff(u.pos.x, u.pos.z, u.mounted ? 2 : 1);
      u.pos.x += u.vel.x * dt;
      u.pos.z += u.vel.z * dt;
      this.bodies(u);
      this.collide(u);
      const lim = 176;
      // 逃げる兵は地図の端か、戦ごとに決めた「遠景の大軍の手前」（world.fleeOut）で消す（大軍の塊の中を歩かせない）
      // 逃げ去った者は、目の届かない所（画面の外で 90m より遠い）へ出てから消す（目の前でふっと消えないように。数も軽くなる）
      if (u.fleeing && !u.isPlayer && !u.invuln && !u.name && u.offscreen && u.camD > 90 && this.time - (u.fleeT ?? this.time) > 10) { this.despawn(u); continue; }
      if (u.fleeing && (Math.abs(u.pos.x) > lim || Math.abs(u.pos.z) > lim || (this.world.def.fleeOut && this.world.def.fleeOut(u.pos.x, u.pos.z, u.team)))) { this.despawn(u); continue; }
      u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x));
      u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
      if (this.world.def.water && u.pos.x > this.world.def.water.x - 1) u.pos.x = this.world.def.water.x - 1;
      u.pos.y = this.world.heightAt(u.pos.x, u.pos.z);
      this.animate(u, dt, near);
    }
    this.updateImpostors(cam);
    this.updateArrows(dt);
    this.updateSmoke(dt);
    this.updateParticles(dt);
    this.updateStains(dt);
    this.updateFalling(dt);
    this.updateLooseHorses(dt);
  }

  // 遠い兵をまとめて描く（IMP）。兵の種類の番号は IMP_KIND（毎コマ作らない）。甲冑の色と旗ごとに、軽い兵の形の束を一つ持つ
  updateImpostors(cam) {
    if (!this.world.makeImpostor) return;
    const I = this.imp || (this.imp = new Map());
    if (cam) this.impCam = { x: cam.x, z: cam.z };
    for (const st of I.values()) st.n = 0;
    // まとめて描き始める遠さは画質で変える（低 28m・中 38m・高 48m）
    //   低（携帯）は 6m（骨の入った人になっている兵は束に入れない）：その先の兵は一人ずつ描かず（一人 10 回ほど描いていた）、束で描く
    const impFar = IMP.far === 48 ? ({ low: 6, mid: 38 }[S.quality] ?? 48) : IMP.far;
    for (const u of this.units) {
      const k = IMP_KIND[u.type];
      const far = IMP.on && u.alive && !u.isPlayer && !u.isSub && !u.mounted && k !== undefined && !u.name && !(u.fall > 0) && u.look && !(u.human && u.human.root && u.human.root.visible)
        && u.camD > (u.imp ? impFar - Math.min(6, impFar * 0.25) : impFar);
      if (!far) { if (u.imp) { u.imp = false; if (u.mesh && !u.gone) u.mesh.visible = true; } continue; }
      u.imp = true;
      u.mesh.visible = false;
      // 一つの束（160 人）があふれたら、同じ甲冑と旗の二つ目・三つ目の束へ（あふれた兵を一人ずつ描かない）
      // 束の名（甲冑と旗）は兵ごとに一度だけ作る（毎コマ字をつながない）
      if (u.impLook !== u.look) { u.impLook = u.look; u.impKey = u.look.armor + '|' + (u.look.flag || ''); }
      //   低（携帯）は 18m より先の兵を、さらに軽い形の別の束へ
      const xf = S.quality === 'low' && u.camD > 18;
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
    const B = this.batch || (this.batch = { map: new Map(), mapC: new Map(), maps: null, d2: 0, on: true, prev: [], cur: [], tag: 0, fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sph: new THREE.Sphere(new THREE.Vector3(), 3.4) });
    if (!B.maps) B.maps = [B.map, B.mapC];
    // 細かい形にする近さ：画質「低」（携帯）は 9m、ほかは 16m（units_flags.js の lodSwap も同じ値を見る）
    const low = S.quality === 'low';
    LOD.near = low ? 9 : 16;
    B.sh = !low;   // 低は影を描かないので、画面の外の兵の影の部品を束ねない
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
        if (hat && hat.parent && hat.visible) {
          const he = hat.matrixWorld.elements, hx = he[12] - cx, hy = he[13] - cy, hz = he[14] - cz;
          B.d2 = hx * hx + hy * hy + hz * hz;
          B.sph.center.set(he[12], he[13] + 1.6, he[14]);
          B.on = B.fr.intersectsSphere(B.sph);
          B.hide = low && B.d2 > 2025;
          W1.children[0] = hat; this.batchWalk(W1, null, tag, B);
        }
        if (!m || !m.visible || !m.parent || u.imp || u.isPlayer) continue;
        const e = m.matrixWorld.elements, dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
        B.d2 = dx * dx + dy * dy + dz * dz;
        B.sph.center.set(e[12], e[13] + 1, e[14]);
        // 画面の外の兵は、影を落とす部品だけ束ねる（影の描き込みで一つずつ描かない。見えない部品は元どおり外される）
        B.on = B.fr.intersectsSphere(B.sph);
        // 画質「低」（携帯）：150m より先の兵（背丈が二、三画素）と、45m より先の倒れた兵は、部品を描かない（一人ずつ描く旗・得物も）
        B.hide = low && (B.d2 > 22500 || (!u.alive && B.d2 > 2025));
        this.batchWalk(m, u.human && u.human.root, tag, B);
      }
    }
    // 前のコマでまとめていて今は外れた部品を、元の描き方へ戻す
    for (const c of B.prev) if (c.userData.bT !== tag) c.layers.mask = 1;
    const t = B.prev; B.prev = B.cur; B.cur = t; t.length = 0;
    for (const bm of B.maps) for (const e of bm.values()) {
      e.im.count = e.n; e.im.visible = e.n > 0;
      if (e.n) e.im.instanceMatrix.needsUpdate = true;
    }
  }
  batchWalk(o, skip, tag, B) {
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!c.visible || c === skip) continue;
      if (B.hide) { if (c.isMesh && !c.isSkinnedMesh) { c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c); } }
      else if (c.isMesh && c.material === MAT && (B.on || (c.castShadow && B.sh)) && !c.isSkinnedMesh && !c.isInstancedMesh) {
        const L = c.userData.lod;
        if (L || c.onBeforeRender === NO_OBR) {
          let geo = c.geometry;
          if (L) { const nr = L[2] ?? LOD.near; geo = !LOD.on || B.d2 < nr * nr ? L[0] : L[1]; }
          const bm = c.castShadow ? B.mapC : B.map;
          let e = bm.get(geo);
          if (!e || e.n >= e.cap) e = this.batchGrow(geo, e, bm, c.castShadow);
          c.matrixWorld.toArray(e.arr, e.n * 16); e.n++;
          c.layers.mask = 0; c.userData.bT = tag; B.cur.push(c);
        }
      }
      if (c.children.length) this.batchWalk(c, skip, tag, B);
    }
  }
  batchGrow(geo, e, bm, cast) {
    const cap = e ? e.cap * 2 : 16;
    const im = new THREE.InstancedMesh(geo, MAT_I, cap);
    im.matrixAutoUpdate = false; im.frustumCulled = false; im.name = 'unitBatch'; im.castShadow = !!cast;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const ne = { im, cap, n: e ? e.n : 0, arr: im.instanceMatrix.array };
    if (e) { ne.arr.set(e.arr.subarray(0, e.n * 16)); this.scene.remove(e.im); e.im.dispose(); }
    this.scene.add(im); bm.set(geo, ne);
    return ne;
  }

  despawn(u) {
    u.alive = false;
    u.gone = true;
    this.scene.remove(u.mesh);
    // 逃げた者が捨てた槍・陣笠は、潰走の跡として地面に残す（残すのは 160 個まで。あふれたら本人から一番遠い物から片付ける）
    const Lt = this.litter || (this.litter = []);
    if (u.dropped) Lt.push(u.dropped);
    if (u.hatOff) Lt.push(u.hatOff);
    while (Lt.length > 160) {
      const P = this.playerUnit;
      let k = 0;
      if (P) { let bd = -1; for (let i = 0; i < Math.min(40, Lt.length); i++) { const d = Math.hypot(Lt[i].position.x - P.pos.x, Lt[i].position.z - P.pos.z); if (d > bd) { bd = d; k = i; } } }
      this.scene.remove(Lt.splice(k, 1)[0]);
    }
  }
}

// Army の手法は役目ごとのファイルに分けてある。class の手法と同じ形（書き換えられる・数え上げない）で足す
for (const part of [ArmyCombat, ArmyFx, ArmyRanged, ArmyGroups, ArmyThink, ArmyDuel, ArmyMove, ArmyAnim]) for (const k of Object.keys(part)) Object.defineProperty(Army.prototype, k, { value: part[k], writable: true, configurable: true, enumerable: false });


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
const HOUSE_NAME = { tokugawa: '徳川', takeda: '武田', akazonae: '山県の赤備え', okudaira: '奥平', oda: '織田', imagawa: '今川', saito: '斎藤' };
