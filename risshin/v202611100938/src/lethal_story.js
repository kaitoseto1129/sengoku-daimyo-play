// 命懸けの戦場・物語の側（係B。docs/lethal_field_spec_1108.md の 8〜10・15〜18・23・26〜29）。
//   弾・負傷・恐怖・制圧（係A：lethal.js）と、隊列維持度・旗の厚み（army_depth.js）は別の係。ここは「戦況が人と旗と声に出る」所だけ。
//   battle.js から三か所：lethalStoryTick(rt, dt)（毎コマ）・lethalStoryKill(rt, v, k)（onKill）。戦の後は main.js が lethalStoryAfter。
//   既にある仕組みを使う：名簿 G.roster（源太・新六…と補充 fillRoster）・将の討死の混乱と下知の遅れ（sonae.js・army_morale.js の moraleDeath）・
//   使番の知らせ（denrei→senkyo）・個人の逃げと得物捨て（army_morale.js）。ここで足すのは、
//     一、戦場全体の圧力 rt.pressure = { v: 0〜100, band: 0 安定 / 1 苦戦 / 2 危険 / 3 崩壊寸前 }（27）。台詞・恐怖・崩れ・曲・本陣が読む
//     二、味方の声を圧力の段で変える（15）。同じ文は 25 秒に一度まで、ほかの声と 8 秒あける
//     三、将の討死：その隊の大旗が倒れて地に残る・名を呼ぶ一声（9・17）。苦戦の隊の旗は揺れる。崩れた隊は旗を捨てる
//     四、遠くの隊が崩れる時は、使番より先に一人→数人が走って来る（16）
//     五、台本に見えない重要人物の死（10）：戦に一度まで・くじで三割。「敵が崩れた」の直後、遠くの一発で味方の将（または名のある配下）が倒れる
//     六、損耗を残す（18）：落ちた槍（一つの描画・上限 90）、後半の煙と小さな火。当たり判定は付けない（19）
//     七、戦功と生存の衝突（23）：退き口の中で逃げる敵将を追えば、敵の新手が寄る。討てば特別戦功。選ぶ画面は出さない
//     八、戦ごとの恐怖の種類（26）：FEAR_KINDS。戦の係は def.fearKind で替えられる
//   死の三段（29）：史実の死（def.famous の fall・invuln・mustLive・名のある武将）はここで殺さない。一般の将・配下だけを戦況＋くじで。一般兵はシミュレーションのまま。
import * as THREE from 'three';
import { BATTLES } from './state.js';
import { musicTension } from './audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BAND_AT = [30, 60, 80];
const SCAN = 0.5;

// 26：戦ごとの恐怖の種類。w は圧力の項の重み（既定 1）、base は足し前、line は危険の段に入った時の一声（一つの戦で一度）
export const FEAR_KINDS = {
  // 手本の四戦（織田の最初・kaito 11/8）
  inou: { kind: 'outnumbered_lord', note: '数で劣り、殿の前まで押される', w: { ratio: 1.3, honjin: 1.5 }, line: '殿の前まで押されておる！' },
  okehazama: { kind: 'few_vs_many', note: '大軍へ少数で突撃', w: { ratio: 0.6 }, line: '数が違いすぎる……' },
  moribe: { kind: 'mud_river', note: '川と泥田で足が止まる', w: { losses: 1.3, cohesion: 1.2 }, line: '足が取られる……！' },
  sunomata: { kind: 'build_under_attack', note: '砦を築く最中に寄せられる', w: { flank: 1.6, honjin: 1.2 }, line: '普請の者が狙われておる！' },
  kanegasaki: { kind: 'rear_enemy', note: '背後まで敵', w: { flank: 2 }, line: '後ろにも敵じゃ！' },
  anegawa: { kind: 'line_break', note: '戦線を突破される', w: { routed: 2, cohesion: 1.4 }, line: '列が崩れる！' },
  hieizan: { kind: 'fire_chaos', note: '火と混乱', base: 8, line: '火が回るぞ！' },
  mikatagahara: { kind: 'unstoppable', note: '武田が止まらない', w: { losses: 1.6 }, line: '止まらぬ……！' },
  shitaragahara: { kind: 'fence_reach', note: '柵まで迫る', w: { honjin: 0.5, flank: 0.5 }, line: '柵に取り付かれるぞ！' },
  tedorigawa: { kind: 'flooded_river', note: '逃げ道が増水した川', w: { routed: 1.5 }, line: '川が渡れぬ……！' },
  honnoji: { kind: 'doomed', note: '最初から助からない', base: 25, line: 'もう持たぬ……！' },
  t06_hetsugi: { kind: 'pursuer_turns', note: '追っていた敵が反転', w: { flank: 1.5 }, line: '敵が返して来たぞ！' },
  sekigahara: { kind: 'uncertain', note: 'どちらが勝つか分からない', swing: 12, line: 'どちらが勝つか分からぬ……' },
  k06_sekigahara: { kind: 'uncertain', note: 'どちらが勝つか分からない', swing: 12, line: 'どちらが勝つか分からぬ……' },
  k11_sanadamaru: { kind: 'cannot_advance', note: '攻めても進めない', w: { losses: 1.4 }, line: '進めぬ……！' },
  k15_tennoji_okayama: { kind: 'honjin_threat', note: '家康本人まで迫る', w: { honjin: 2.2 }, line: '本陣が危ない！' },
};
const BAND_LINES = [
  null,
  ['{side}が危ない！', '下がれ！', '隊長はどこだ！'],
  ['押されておるぞ！', '列が崩れる！', '下がれ、下がれ！'],
  ['逃げろ！', 'もう無理だ！', 'ここはもう持たぬぞ！'],
];
const ISO_LINE = '味方はどこだ！';

const battleKey = (rt) => rt.def?.key || BATTLES[rt.index]?.id || '';
export function fearKindOf(rt) {
  const f = rt.def?.fearKind;
  if (f && typeof f === 'object') return f;
  return FEAR_KINDS[typeof f === 'string' ? f : battleKey(rt)] || null;
}
export function lethalPressure(rt) { return rt.pressure ? rt.pressure.v : 0; }

function off(rt) { return !rt || rt.over || rt.def?.dojo || rt.def?.town || rt.def?.duel || !rt.army || !rt.player?.u; }
const fighter = (o) => o.alive && !o.isStruct && !o.civ && !o.fleeing && !o.gone && o.type !== 'dummy' && o.type !== 'porter';
const historical = (rt, u) => !!(u.invuln || u.mustLive || u.historyFall || u.isTaisho || u.isPlayer || u.kerai || u.isTomo ||
  (u.name && (rt.def?.famous || []).some((e) => e.name === u.name)) || (u.name && u.type === 'busho' && u.team === 0 && u.name === rt.def?.taisho?.a?.name));

function stateOf(rt) {
  if (rt._ls) return rt._ls;
  const S = rt._ls = {
    scan: 0, fx: 0, raw: 0, deaths: [], cmdDeaths: [], allyPrev: -1, reinfUntil: -1, highFor: 0,
    sayAt: -99, lineAt: {}, band: 0, kindSaid: false, isoAt: -99,
    wobble: [], fallen: [], routSeen: new Set(), leadSeen: new Set(), waver: new Map(),
    rare: { armed: Math.random() < 0.3, done: false, at: -1, routT: -99 },
    chase: null, chaseGroupsAt: -99,
    spears: null, spearN: 0, smoke: 0, fire: 0, honjinMoved: false, kind: fearKindOf(rt),
  };
  rt.pressure = { v: 0, band: 0, iso: 0 };
  return S;
}

// ---------- 一、圧力 ----------
function pressureScan(rt, S) {
  const P = rt.player.u, team = P.team;
  let A = 0, E = 0, ax = 0, az = 0, ex = 0, ez = 0, near = 0, rear = 0, honjinFoes = 0;
  const lord = findLord(rt, team);
  const fx = Math.sin(P.heading || 0), fz = Math.cos(P.heading || 0);
  for (const o of rt.army.units) {
    if (!fighter(o) || o.isPlayer) continue;
    const dx = o.pos.x - P.pos.x, dz = o.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
    if (o.team === team) { A++; ax += o.pos.x; az += o.pos.z; if (d2 < 144) near++; }
    else {
      E++; ex += o.pos.x; ez += o.pos.z;
      if (d2 < 400 && dx * fx + dz * fz < -2) rear++;
      if (lord && Math.hypot(o.pos.x - lord.pos.x, o.pos.z - lord.pos.z) < 30) honjinFoes++;
    }
  }
  const t = rt.t, W = S.kind?.w || {};
  const w = (k) => W[k] ?? 1;
  S.deaths = S.deaths.filter((x) => t - x < 30);
  S.cmdDeaths = S.cmdDeaths.filter((x) => t - x < 90);
  if (S.allyPrev >= 0 && A > S.allyPrev + 3) S.reinfUntil = t + 20;
  S.allyPrev = A;
  let morale = 0, groups = 0, routed = 0;
  for (const g of rt.army.groups) {
    if (g.team !== team || !g.count || g.civ || g.people || g.isRunner) continue;
    groups++; morale += g.morale ?? 70;
    if (g.routed) routed++;
    // 隊列維持度（army_depth.js が g.keep を持てば使う）
    if (g.keep != null) morale += (g.keep * (g.keep <= 1 ? 100 : 1) - (g.morale ?? 70)) * 0.5;
  }
  const avgM = groups ? morale / groups : 70;
  const ratio = E / Math.max(1, A + E);
  let v = clamp((ratio - 0.35) / 0.4, 0, 1) * 35 * w('ratio') +
    Math.min(20, S.deaths.length * 1.5 / Math.max(1, Math.sqrt(A) / 4)) * w('losses') +
    Math.min(15, S.cmdDeaths.length * 8) * w('cmd') +
    clamp((70 - avgM) / 50, 0, 1) * 15 * w('cohesion') +
    Math.min(10, rear * 2) * w('flank') +
    Math.min(12, honjinFoes * 1.5) * w('honjin') +
    Math.min(12, routed * 6) * w('routed') +
    (near <= 2 && E ? 8 : near <= 4 && E ? 3 : 0) * w('iso') +
    (S.kind?.base || 0) + (S.kind?.swing ? Math.sin(t / 40) * S.kind.swing : 0) -
    (t < S.reinfUntil ? 8 : 0);
  if (rt.lethal?.pressureAdd) v += rt.lethal.pressureAdd(rt) || 0;   // 係A の制圧・恐怖が足せる口
  if (!E) v *= 0.4;
  S.raw = clamp(v, 0, 100);
  const R = rt.pressure;
  R.v = clamp(R.v + (S.raw - R.v) * (S.raw > R.v ? 0.3 : 0.12), 0, 100);
  // 段は上がる時すぐ、下がる時は 5 下まで待つ（境目で揺れない）
  let b = 0; for (let i = 0; i < 3; i++) if (R.v >= BAND_AT[i] - (i < R.band ? 5 : 0)) b = i + 1;
  R.band = b; R.iso = near <= 2 ? 2 : near <= 4 ? 1 : 0;
  S.ally = { x: A ? ax / A : P.pos.x, z: A ? az / A : P.pos.z, n: A };
  S.foe = { x: E ? ex / E : P.pos.x, z: E ? ez / E : P.pos.z, n: E };
  S.lord = lord;
}

function findLord(rt, team) {
  const L = rt._lsLord;
  if (L && L.alive) return L;
  const nm = team === 0 ? rt.def?.taisho?.a?.name : null;
  rt._lsLord = rt.army.units.find((u) => u.alive && u.team === team && !u.isPlayer && (u.isTaisho || (nm && u.name === nm))) || null;
  return rt._lsLord;
}

// 圧力が効く所：恐怖・崩れ・曲・本陣
function pressureEffects(rt, S, dt) {
  const R = rt.pressure, P = rt.player.u;
  if (R.band >= 2) {
    const add = R.band === 3 ? 3 : 1.5;
    rt.army.forNear(P.pos.x, P.pos.z, 20, (u) => {
      if (u.team === P.team && !u.isPlayer && u.alive && !u.fleeing && !u.name) u.fright = Math.min(45, (u.fright || 0) + add * SCAN);
    });
  }
  if (R.band === 3) {
    for (const g of rt.army.groups) {
      if (g.team !== P.team || g.routed || g.noRout || g.fixed || g.isPlayerSquad || !g.count || (g.morale ?? 100) > 50) continue;
      g.morale = Math.max(0, g.morale - 0.6 * SCAN);
    }
  }
  if (R.band >= 2 && (S.musicAt ?? -99) + 60 < rt.t) { S.musicAt = rt.t; musicTension(R.band === 3 ? 14 : 8); }
  // 本陣の動き：崩れ寸前が 15 秒続けば、筋書きで据えていない本陣は一度だけ下がる（馬印が後ろへ）
  S.highFor = R.band === 3 ? S.highFor + SCAN : 0;
  const lg = S.lord?.group;
  if (!S.honjinMoved && S.highFor > 15 && lg && !lg.fixed && !lg.routed && lg.order === 'hold' && lg.anchor && S.foe.n) {
    const dx = lg.anchor.x - S.foe.x, dz = lg.anchor.z - S.foe.z, d = Math.hypot(dx, dz) || 1;
    lg.anchor = { x: lg.anchor.x + dx / d * 10, z: lg.anchor.z + dz / d * 10 };
    S.honjinMoved = true;
  }
}

// ---------- 二、味方の声 ----------
function sideWord(rt, S) {
  const P = rt.player.u;
  const dx = S.foe.x - P.pos.x, dz = S.foe.z - P.pos.z, fx = Math.sin(P.heading || 0), fz = Math.cos(P.heading || 0);
  const cross = fx * dz - fz * dx, dot = fx * dx + fz * dz;
  return dot < -Math.abs(cross) ? '後ろ' : cross > 0 ? '左' : '右';
}
function allyShout(rt, S, text, kind = 'help') {
  if (rt.over || !text || rt.t < 8 || (rt.soldierCallT ?? -99) + 8 > rt.t || S.sayAt + 8 > rt.t) return false;
  if ((S.lineAt[text] ?? -99) + 25 > rt.t) return false;
  S.lineAt[text] = S.sayAt = rt.t;
  rt.soldierCallT = rt.t;
  const P = rt.player.u;
  let who = null;
  rt.army.forNear(P.pos.x, P.pos.z, 16, (u) => { if (!who && u.team === P.team && !u.isPlayer && u.alive) who = u; });
  if (rt.warVoices && who) rt.warVoices.call(kind, who.pos);
  rt.bark(`味方の兵「${text}」`, kind !== 'follow');
  return true;
}
function voiceTick(rt, S) {
  const R = rt.pressure;
  const rose = R.band > S.band;
  S.band = R.band;
  if (R.band >= 1 && (rose || (S.bandSayAt ?? -99) + 40 < rt.t)) {
    if (R.band >= 2 && S.kind?.line && !S.kindSaid && allyShout(rt, S, S.kind.line, 'help')) { S.kindSaid = true; S.bandSayAt = rt.t; return; }
    const L = BAND_LINES[R.band];
    let text = L[Math.floor(Math.random() * L.length)];
    if (text === '隊長はどこだ！' && !rt.squad?.length) text = L[1];
    if (R.band === 3 && S.lord && !S.lord.alive) text = '殿が討たれた！';
    if (allyShout(rt, S, text.replace('{side}', sideWord(rt, S)), R.band === 3 ? 'withdraw' : 'help')) S.bandSayAt = rt.t;
  } else if (R.iso === 2 && S.foe.n && rt.t > S.isoAt + 45 && rt.distTo(S.ally) > 18) {
    if (allyShout(rt, S, ISO_LINE, 'help')) S.isoAt = rt.t;
  }
}

// ---------- 三、旗 ----------
const bearer = (u) => u.alive && !u.isPlayer && u.flag && u.flag.visible && (u.banner || u.stdHeld || u.isStandard);
function dropFlag(rt, S, u, fall = true) {
  if (!u.flag || S.fallen.length >= 14) return false;
  const f = u.flag;
  const m = f.clone();   // 形と布は使い回す（new しない）
  m.matrixAutoUpdate = true;
  const h = rt.world.heightAt(u.pos.x, u.pos.z);
  m.position.set(u.pos.x + Math.sin(u.heading || 0) * 0.6, h + 0.12, u.pos.z + Math.cos(u.heading || 0) * 0.6);
  m.rotation.set(0, (u.heading || 0) + Math.PI / 2, 0);
  m.scale.copy(f.scale);
  rt.scene.add(m);
  f.visible = false;
  u._lsNoFlag = true;
  S.fallen.push({ m, u, t: fall ? 0 : 1, yaw: (u.heading || 0) + Math.PI / 2 });
  return true;
}
function flagTick(rt, S, dt) {
  for (const F of S.fallen) {
    if (F.u && F.u.flag && F.u._lsNoFlag && F.u.flag.visible) F.u.flag.visible = false;   // 伏兵の旗の出し入れなどで戻さない
    if (F.t >= 1) continue;
    F.t = Math.min(1, F.t + dt / 0.9);
    const k = F.t * F.t;   // 重さで倒れる
    F.m.rotation.set(-k * Math.PI / 2, F.yaw, 0);
  }
  // 苦戦の隊の旗は乱れる（揺れ）。十二本まで
  const t = rt.t;
  for (const u of S.wobble) if (u.flag) u.flag.rotation.z = u.alive && !u._lsNoFlag ? Math.sin(t * 3.1 + u.id) * (u.group?.routed ? 0.4 : 0.22) : 0;
}
function flagScan(rt, S) {
  S.wobble.length = 0;
  for (const g of rt.army.groups) {
    if (!g.count || g.civ || g.people) continue;
    // 敗走：旗を捨てる（一隊に二本まで）
    if (g.routed && !S.routSeen.has(g)) {
      S.routSeen.add(g);
      let n = 0;
      for (const u of g.units) if (n < 2 && bearer(u) && rt.distTo(u.pos) < 140 && dropFlag(rt, S, u)) n++;
      if (g.team === rt.player.u.team && rt.distTo(g.center()) > 35) runnersFrom(rt, S, g, 0);
    }
    // 苦戦：旗が揺れる
    if (!g.routed && (g.morale ?? 100) < 50 && S.wobble.length < 12) for (const u of g.units) if (S.wobble.length < 12 && bearer(u) && rt.distTo(u.pos) < 90) S.wobble.push(u);
    // 遠くの味方の隊が崩れかける：使番より先に、人が走って来る（一人→数人）
    if (g.team === rt.player.u.team && !g.routed && !g.noRout && !g.isPlayerSquad && (g.morale ?? 100) < 35 && !S.waver.has(g) && rt.distTo(g.center()) > 35) {
      S.waver.set(g, rt.t);
      runnersFrom(rt, S, g, 1);
      rt.after(3, () => { if (!rt.over && !g.routed) runnersFrom(rt, S, g, 3); });
    }
  }
}

// ---------- 四、敗走兵を先に見せる ----------
function runnersFrom(rt, S, g, n) {
  const P = rt.player.u, army = rt.army;
  const c = g.center();
  // 自分の側（味方の重心）へ向かって走る＝本人から見えやすい
  let dx = S.ally.x - c.x, dz = S.ally.z - c.z;
  if (Math.hypot(dx, dz) < 5) { dx = P.pos.x - c.x; dz = P.pos.z - c.z; }
  const d = Math.hypot(dx, dz) || 1;
  const cand = g.units.filter((u) => u.alive && !u.fleeing && !u.name && !u.invuln && !u.isTaisho && u !== g.leader && !u.banner && !u.stdHeld && !u.mounted && u.type !== 'busho')
    .sort((a, b) => Math.hypot(b.pos.x - c.x, b.pos.z - c.z) - Math.hypot(a.pos.x - c.x, a.pos.z - c.z));
  const k = n || Math.min(4, cand.length);
  for (let i = 0; i < k && i < cand.length; i++) {
    const u = cand[i];
    if (!u.moraleDir) u.moraleDir = { x: 0, z: 0 };
    if (!u.moralePoint) u.moralePoint = { x: 0, z: 0 };
    u.moraleDir.x = dx / d; u.moraleDir.z = dz / d;
    u.moraleFleeDir = u.moraleDir;
    u.fleeing = true; u.fleeT = army.time; u.target = null; u.atk = null; u.swing = null; u.confused = 0;
    u.backUntil = 0; u.lookUntil = 0; u.aiT = 0;
    if (i % 2 === 0 && u.wpn && u.wpn.parent && army.dropWeapon) { army.dropWeapon(u); u.wpn = null; u.wpnKind = 'none'; }
  }
}

// ---------- 六、損耗を残す ----------
let SPEAR_GEO = null, SPEAR_MAT = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function addSpear(rt, S, x, z) {
  if (!S.spears) {
    SPEAR_GEO ||= new THREE.CylinderGeometry(0.018, 0.022, 3.2, 4, 1).rotateZ(Math.PI / 2);
    SPEAR_MAT ||= new THREE.MeshLambertMaterial({ color: 0x3a2e22 });
    S.spears = new THREE.InstancedMesh(SPEAR_GEO, SPEAR_MAT, 90);
    S.spears.count = 0; S.spears.frustumCulled = false; S.spears.matrixAutoUpdate = false;
    rt.scene.add(S.spears);
    rt.cleanupTasks?.add(() => { S.spears?.dispose?.(); });
  }
  const i = S.spearN++ % 90;
  const px = x + (Math.random() - 0.5) * 1.6, pz = z + (Math.random() - 0.5) * 1.6;
  _p.set(px, rt.world.heightAt(px, pz) + 0.04, pz);
  _q.setFromEuler(_e.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.08));
  S.spears.setMatrixAt(i, _m.compose(_p, _q, _s));
  S.spears.count = Math.min(90, S.spearN);
  S.spears.instanceMatrix.needsUpdate = true;
}
function wearTick(rt, S) {
  // 後半（死者が多い所）に煙、終盤に小さな火。雨の時は火を置かない。三本・一つまで
  const dead = S.deadN || 0;
  if (!S.hot || rt.distTo(S.hot) > 140) return;
  if (S.smoke < 3 && dead >= 40 + S.smoke * 45 && rt.world.addSmokeColumn) {
    const y = rt.world.heightAt(S.hot.x, S.hot.z);
    if (rt.world.addSmokeColumn(S.hot.x, y, S.hot.z, { size: 0.7 + S.smoke * 0.2 })) S.smoke++;
  }
  if (!S.fire && dead >= 150 && rt.t > 240 && !(rt.world.rainLevel > 0.2) && rt.world.addFire && !rt.def?.noWear) {
    rt.world.addFire(S.hot.x + 3, S.hot.z + 2, { h: 0.6, size: 0.7 }); S.fire = 1;
  }
}

// ---------- 五、台本に見えない重要人物の死 ----------
function rareTick(rt, S) {
  const R = S.rare;
  if (!R.armed || R.done || rt.t < 60) return;
  if (R.at < 0) return;
  if (rt.t < R.at) return;
  R.done = true;
  const P = rt.player.u;
  let pick = null, bd = 1e9;
  for (const u of rt.army.units) {
    if (u.team !== P.team || !u.alive || u.fleeing || u.gone || historical(rt, u)) continue;
    const lead = u.group && u.group.leader === u && u.name;
    const sub = u.roster && u.isSub && Math.random() < 0.5;
    if (!lead && !sub) continue;
    const d = rt.distTo(u.pos);
    if (d < 6 || d > 45) continue;
    const score = d - (lead ? 10 : 0);
    if (score < bd) { bd = score; pick = u; }
  }
  if (!pick) return;
  // 遠くの一発（音が先、倒れるのが少し後）
  const fx = pick.pos.x + (S.foe.x - pick.pos.x) * 0.8, fz = pick.pos.z + (S.foe.z - pick.pos.z) * 0.8;
  rt.army.play('gun', { x: fx, y: 0, z: fz }, 0.55);
  rt.after(0.25, () => {
    if (rt.over || !pick.alive) return;
    pick._lsRare = true;
    rt.army.kill(pick, null);
    const name = pick.name;
    const lead = pick.group && pick.group.leader === pick;
    rt.soldierCallT = -99; S.sayAt = -99;
    allyShout(rt, S, lead ? `${name}様！` : `${name}！`, 'help');
    // 旗持ちの動揺と敵の反撃
    if (pick.group) pick.group.morale = Math.max(0, (pick.group.morale ?? 70) - 15);
    let best = null, bdd = 80;
    for (const g of rt.army.groups) {
      if (g.team === P.team || g.routed || !g.count || g.civ || g.hidden || g.ambush || g.stay || g.fixed) continue;
      const c = g.center(), d = Math.hypot(c.x - pick.pos.x, c.z - pick.pos.z);
      if (d < bdd) { bdd = d; best = g; }
    }
    if (best) { best.order = 'attack'; best.march = false; best.morale = Math.min(100, (best.morale ?? 70) + 15); best.seekRange = Math.max(best.seekRange || 0, 50); }
  });
}

// ---------- 七、戦功と生存 ----------
function chaseTick(rt, S) {
  const P = rt.player.u;
  const retreat = rt.flags?.retreatMarked || rt.t < (rt.retreatUntil || 0) || rt.pressure.band >= 2 || rt.pressure.iso === 2;
  let C = S.chase;
  if (C && (!C.o.alive || rt.distTo(C.o.pos) > 45)) C = S.chase = null;
  if (!C && retreat) {
    rt.army.forNear(P.pos.x, P.pos.z, 30, (o) => {
      if (C || o.team === P.team || !o.alive || !o.name || o.invuln || o.isTaisho) return;
      if ((o.type === 'busho' || o === o.group?.leader) && (o.fleeing || o.group?.routed)) C = { o, t0: rt.t };
    });
    S.chase = C;
  }
  if (!C || rt.t < S.chaseGroupsAt + 3) return;
  S.chaseGroupsAt = rt.t;
  // 敵の新手が寄る（二隊まで）。追うほど危ない
  let n = 0;
  for (const g of rt.army.groups) {
    if (n >= 2 || g.team === P.team || g.routed || !g.count || g.civ || g.hidden || g.ambush || g.stay || g.guard || g.fixed || g === C.o.group) continue;
    const c = g.center();
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 55) continue;
    g.order = 'attack'; g.focus = P; g.march = false; g.seekRange = Math.max(g.seekRange || 0, 60); n++;
  }
}

// ---------- 毎コマ ----------
export function lethalStoryTick(rt, dt) {
  if (off(rt) || (rt.prelude && rt.prelude !== 'done') || rt.aftermath) return;
  const S = stateOf(rt);
  flagTick(rt, S, dt);
  S.scan -= dt;
  if (S.scan > 0) return;
  S.scan = SCAN;
  if (!rt.player.u.alive) return;
  pressureScan(rt, S);
  pressureEffects(rt, S, dt);
  voiceTick(rt, S);
  if ((S.fx -= SCAN) <= 0) { S.fx = 2; flagScan(rt, S); wearTick(rt, S); }
  rareTick(rt, S);
  chaseTick(rt, S);
}

// onKill から（battle.js）。v は倒れた者、k は討った者
export function lethalStoryKill(rt, v, k) {
  if (off(rt) || v.isStruct || v.civ || v.type === 'dummy') return;
  const S = stateOf(rt), P = rt.player.u;
  S.deadN = (S.deadN || 0) + 1;
  if (!S.hot || S.deadN % 12 === 0) S.hot = { x: v.pos.x, z: v.pos.z };
  if (v.team === P.team) S.deaths.push(rt.t);
  if (rt.distTo(v.pos) < 110 && Math.random() < 0.3) addSpear(rt, S, v.pos.x, v.pos.z);
  const g = v.group;
  // 将の討死：大旗が倒れる → 名を呼ぶ一声（近い時だけ）。混乱と下知の遅れは sonae.js・army_morale.js が持つ
  if (g && (g.leader === v || v.type === 'busho') && !S.leadSeen.has(v)) {
    S.leadSeen.add(v);
    if (v.team === P.team) S.cmdDeaths.push(rt.t);
    const b = g.units.find((u) => bearer(u) && u !== v);
    if (b && rt.distTo(b.pos) < 120) rt.after(0.8 + Math.random() * 0.6, () => { if (!rt.over && b.alive) dropFlag(rt, S, b); });
    if (v.team === P.team && v.name && !v._lsRare && rt.distTo(v.pos) < 45) {
      const kt = rt.soldierKeyT || (rt.soldierKeyT = {}); kt.lordFall = rt.t;   // 同じ所の「殿が討たれた」と重ねない
      rt.after(1.2, () => { if (!rt.over) allyShout(rt, S, `${v.name}様、討死！`, 'help'); });
    }
  }
  // 名のある配下（源太など）の死は名を呼ぶ一言だけ（戦は止めない・スローなし）
  if (v.roster && v.isSub && !v._lsRare && rt.distTo(v.pos) < 30) allyShout(rt, S, `${v.name}！`, 'help');
  // 敵の将を退き口の中で追い討った：特別戦功（大）
  const C = S.chase;
  if (C && C.o === v && k && k.isPlayer && rt.tracker?.specials) {
    rt.award((t) => { t.specials.push({ label: `退き口で${v.name}を追い討つ`, pts: 40 }); }, '');
    S.chase = null;
  }
  // 敵の隊が崩れた直後を、台本に見えない死のくじの時にする
  if (v.team !== P.team && g && g.routed && !S.rare.done && S.rare.armed && S.rare.at < 0 && rt.t > 60 && rt.distTo(v.pos) < 60) S.rare.at = rt.t + 2.5 + Math.random() * 2;
}

// ---------- 戦の後（main.js）：名簿の者の 生存／軽傷／重傷／討死（8） ----------
//   重傷の者は次の戦を休む（r.sitOut）。討死は名簿から外れ、空きは fillRoster が新兵で埋める（今の仕組み）
export function lethalStoryAfter(G, b, survived) {
  const inBattle = new Set();
  for (const u of b.squad || []) {
    const r = u.roster;
    if (!r) continue;
    inBattle.add(r);
    if (!survived(u)) { r.fate = 'dead'; continue; }
    const hp = u.maxHp ? u.hp / u.maxHp : 1;
    r.fate = u.woundOut || u.rearWound || u.downed || hp < 0.35 ? 'heavy' : hp < 0.75 ? 'light' : 'ok';
    r.sitOut = r.fate === 'heavy' ? 1 : 0;
  }
  for (const r of G.roster || []) if (!inBattle.has(r) && r.sitOut) r.sitOut = 0;   // 一つ休んだら戻る
}
export const FATE_WORD = { ok: '生き残る', light: '浅手で生き残る', heavy: '深手を負い、次は休む', dead: '討死' };
