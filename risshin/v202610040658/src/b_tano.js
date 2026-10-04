// ======================================================================
// 織田家編　田野の戦い・天目山（天正十年三月十一日）
// 高遠城が落ちると、武田の家臣は次々に離れていった。武田勝頼は新府城を焼いて、小山田信茂の岩殿城を頼ったが、
// 小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。滝川一益の手がこれを追いつめ、勝頼は自害した。
// 狭い崖道で土屋昌恒が一人で多くの敵を防いだ（片手千人斬り）という話は、のちの伝えである。
// 自分は滝川の先手。谷道の押し合い → 崖道で鉄砲の合図 → 平屋敷の柵の口 → 最後の寄せ。
// 向き：西南西から東北東への谷筋を +x に合わせて復元。田野は谷の奥。細かな寸法は推定。
// ======================================================================
import { nobori, hut, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { demRelief } from './dem.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { battleEvent, EVENT_VOLLEY } from './battle_events.js';
import { KIT } from './b_nagashinojo.js';
import { depthBot } from './b_depth.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 谷の道（西から東へ上る）
const ROAD = [[-190, 6], [-120, -4], [-60, 4], [-10, -2], [30, 2], [70, -4], [120, 2], [180, -6]];
// 上流から下流へ。崖道では川岸が道へ寄る。
const RIVER = [[230, 22], [72, 22], [60, 11], [24, 11], [16, 22], [-230, 22]];
const DEM_RELIEF = { inner: 55, fade: 40, ax: 0, xy: 4, scale: 0.25 };
const NARROW = { x0: 20, x1: 60 };          // 崖道（道の幅が狭い所）
const TANO = { x: 120, z: 2 };              // 田野（勝頼の最後の陣）
import { jinkeiPoint } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 侍四十一人（父子を含む）を五つの持ち場へ配る。非戦の者は含めない。
// 谷では大きな陣形を開けない。長蛇は道に沿う復元の呼び名で、史料の陣名ではない。
const TANO_ATTACK = sonaePlan('長蛇', 0, { x: -188, z: 0 }, Math.PI / 2, [
  ['front', '先手の槍', '滝川一益の配下', 1700, -152, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['kawa', '第二陣', '河尻秀隆', 1500, -208, 0, Math.PI / 2, 'oda', 'none'],
  ['gun', '先手の鉄砲', '滝川一益の配下', 500, -168, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '指揮所と近習', '滝川一益', 300, -188, 0, Math.PI / 2, 'takigawa', 'takigawa'],
]);
const TANO_DEFEND = sonaePlan('谷道と平屋敷の守り', 1, { x: 138, z: -6 }, -Math.PI / 2, [
  ['valley', '谷道の殿', '名は伝わらない', 6, -40, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['rear', '殿の控え', '名は伝わらない', 8, -20, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['tsuchiya', '崖道', '土屋昌恒', 9, 34, 2, -Math.PI / 2, 'takeda', 'takeda'],
  ['fence', '平屋敷の柵の口', '武田勝頼の配下', 10, 110, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['last', '平屋敷の奥', '武田勝頼・武田信勝', 8, 136, 0, -Math.PI / 2, 'takeda', 'takeda'],
]);

const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

// 実測の山は道から離れた遠景だけ。読込時刻で道や屋敷の床を変えない。
let tanoDem = null;
import('./asset_dem_tano.js').then((m) => { tanoDem = m.default; }).catch(() => {});
function height(x, z) {
  const b = heightBase(x, z);
  return b + (tanoDem ? demRelief(tanoDem, x, z, DEM_RELIEF) : 0);
}
function heightBase(x, z) {
  // 平屋敷は水平な小さな平場。谷道と川床は上流へ単調に上る。
  let h = (x + 200) * 0.05;
  const yardBlend = Math.max(0, Math.min(1, Math.min(x - 100, 148 - x, z + 18, 20 - z) / 4));
  const d = distToPolyline(x, z, ROAD);
  const narrow = x > NARROW.x0 && x < NARROW.x1;
  const half = narrow ? 4.5 : 14;
  if (z < 0) h += Math.min(40, Math.max(0, d - half) * (narrow ? 1.8 : 0.7));
  else {
    // 川側は下へ落ちる。両側に上りの崖を作らない。
    h -= Math.min(10, Math.max(0, d - half) * (narrow ? 1.3 : 0.6));
    h += Math.min(40, Math.max(0, d - 32) * 0.8);
  }
  h += 40 * gauss(x, z, 160, -140, 9000) * Math.min(1, Math.max(0, d - 24) / 30);
  const riverD = distToPolyline(x, z, RIVER);
  if (riverD < 6) {
    const t = 1 - riverD / 6;
    h += ((x + 200) * 0.05 - 7 - h) * t * t * (3 - 2 * t);
  }
  return h + (16 - h) * yardBlend * yardBlend * (3 - 2 * yardBlend);
}

// 隊の要だけでなく、一人ずつの行き先も谷道と柵の口を通す。
// 横へ広がる持ち場をそのまま追うと、崖や川岸で止まってしまう。
const inYard = (x, z) => x >= 104 && x <= 144 && z >= -14 && z <= 16;
function valleyWay(army, u, want) {
  const p = u.pos;
  const q = u._tanoWay || (u._tanoWay = { x: 0, z: 0 });
  q.x = want.x; q.z = want.z;
  const inside = inYard(p.x, p.z), entering = inYard(want.x, want.z);
  if (inside && entering) return want;
  // 四辺の外から屋敷へ入る時も、西の口まで柵の外を回る。
  if (!inside && entering && p.x >= 104) {
    const sideZ = p.z < 1 ? -18 : 20;
    if (p.x > 144 && p.z > -17 && p.z < 19) { q.x = Math.max(148, p.x); q.z = sideZ; }
    else { q.x = 100; q.z = p.z; }
    return q;
  }
  if (inside && !entering && (p.x > 109 || Math.abs(p.z) > 2)) { q.x = 108; q.z = 0; return q; }

  const forward = want.x > p.x;
  // 曲がり角を飛ばさずに通る。近い敵にはその場から打ち込める。
  if (Math.hypot(want.x - p.x, want.z - p.z) > 6) {
    for (let k = 0; k < ROAD.length; k++) {
      const i = forward ? k : ROAD.length - 1 - k;
      const [x, z] = ROAD[i];
      if (forward ? x > p.x + 2 && x < q.x : x < p.x - 2 && x > q.x) { q.x = x; q.z = z; break; }
    }
  }
  let roadZ = ROAD[0][1];
  for (let i = 1; i < ROAD.length; i++) {
    const a = ROAD[i - 1], b = ROAD[i];
    if (q.x <= b[0]) { roadZ = a[1] + (b[1] - a[1]) * Math.max(0, (q.x - a[0]) / (b[0] - a[0])); break; }
    roadZ = b[1];
  }
  const half = q.x >= NARROW.x0 && q.x <= NARROW.x1 ? 2.7 : 10;
  q.z = Math.max(roadZ - half, Math.min(roadZ + half, q.z));
  if ((p.x <= 104 && q.x > 104) || (p.x > 104 && q.x <= 104)) {
    const z = p.z + (q.z - p.z) * (104 - p.x) / (q.x - p.x);
    if (Math.abs(z) > 2) {
      const before = p.x <= 104 ? 100 : 108;
      const approach = Math.abs(p.z) > 2 || (p.x <= 104 ? p.x < 99 : p.x > 109);
      q.x = approach ? before : p.x <= 104 ? 108 : 100;
      q.z = 0;
      return q;
    }
  }
  return q.x === want.x && q.z === want.z ? want : q;
}

// 道筋と前後の間隔を下知の時だけ用意する。隊の要は歩いて移る。
function roadOrder(g, x, z = 0, formation = 'column') {
  if (!g || !g.count || g.routed) return;
  const path = [];
  const forward = x >= g.anchor.x;
  for (let k = 0; k < ROAD.length; k++) {
    const [rx, rz] = ROAD[forward ? k : ROAD.length - 1 - k];
    if (forward ? rx > g.anchor.x + 1 && rx < x : rx < g.anchor.x - 1 && rx > x) path.push([rx, rz]);
  }
  path.push([x, z]);
  g.formation = 'column'; g.colW = 2; g.march = false; g.noAI = true;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.focus = null;
  g.onArrive = () => { g.order = 'hold'; g.path = null; g.formation = formation; g.facing = forward ? Math.PI / 2 : -Math.PI / 2; g.onArrive = null; };
}
function sendColumn(rt, at) {
  const F = rt.flags;
  roadOrder(F.front, at.x - 8, at.z, 'yari');
  roadOrder(F.tgun, at.x - 20, at.z, 'line');
  roadOrder(F.taki, at.x - 36, at.z, 'ring');
  roadOrder(F.kawa, at.x - 56, at.z);
}
const fighting = (g) => g && !g.routed && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget);

// ---- 共通の小道具（組E の戦で使い回す） ----
// 味方の鉄砲の組に一斉射を任せる。込めたまま待たせ（holdFire）、敵の前線が near m まで寄せたら「放て」で撃たせ、敵の気勢を下げる。
// o：{ guns: () => [隊], foes: () => [隊], who: 話し手, near: 38, drop: 25, max: 60（この秒を過ぎたら待たずに撃つ）, line: 見出しの小さな字, say: 合図の台詞, onFire(rt) }
export function volleyAt(rt, o) {
  const gs = () => (o.guns() || []).filter((g) => g && g.count > 0 && !g.routed && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.type === 'gun'));
  for (const g of gs()) { g.holdFire = true; g.fire = true; }
  const t0 = rt.t;
  const fire = (hit) => {
    for (const g of gs()) g.holdFire = false;
    rt.say(o.who || '鉄砲頭', o.say || '寄せきったぞ……放て！', 3);
    rt.banner('一斉射', o.line || '味方の鉄砲がそろって火を吹いた。敵の前が崩れる');
    sfx('volley', 1);
    for (const g of gs()) {
      const c = g.center();
      rt.army.play('gun', c, 1.4);
      for (let i = 0; i < 4; i++) rt.army.smoke(c.x - 4 + i * 2.6, rt.world.heightAt(c.x, c.z) + 1.4, c.z, 0, 0);
    }
    for (const f of hit) { f.morale = Math.max(0, f.morale - (o.drop ?? 25)); }
    if (o.onFire) o.onFire(rt, hit);
  };
  const tick = () => {
    if (rt.over || rt.flags.ending) return;
    const G = gs();
    if (!G.length) return;
    const foes = (o.foes() || []).filter((f) => f && f.count > 0 && !f.routed);
    const near = o.near ?? 38;
    const hit = foes.filter((f) => { const c = f.center(); return G.some((g) => { const d = g.center(); return Math.hypot(c.x - d.x, c.z - d.z) < near; }); });
    if (hit.length) return fire(hit);
    if (rt.t - t0 > (o.max ?? 60)) return fire([]);
    rt.after(0.4, tick);
  };
  rt.after(0.4, tick);
}
// 武田の騎馬の大きな塊を遠くに見せる（軽い作り）。facing は向く先
export function horseHost(rt, x, z, w, d, count, facing, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind: 'cavalry' });
}

// 敵の武士は全段を通じて四十一人。段の間に控えを増やさない。
const tano = {
  jinkei: [TANO_ATTACK, TANO_DEFEND],
  noWake: true, noDistantBattle: true, noTaishoRaid: true, noHorse: true, botOrders: true,
  lordHata: { spear: 12 },
  // 本人・護衛・最期はこの戦で置く。共通の追加兵と討ち取り勝利を使わない。
  taisho: { a: null, b: null },
  spawn: { x: -160, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 15823, moveLim: 230, time: 'day', mood: 'plain', mist: false, wind: [1, 0.15], muddy: 0.1, riverCross: true,
    paths: [ROAD], height, moveWay: valleyWay,
    streams: [{ pts: RIVER, w: 3, depth: 2.8 }],
    tint(x, z, h, c) { if (distToPolyline(x, z, ROAD) > 12) c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.8); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 12 || Math.hypot(x - TANO.x, z - TANO.z) < 24,
    trees: 700, tufts: 2400,
    treeDensity: (x, z) => distToPolyline(x, z, ROAD) < 16 ? 0.1 : 1,
    groves: [{ x: -80, z: -30, r: 12, n: 16 }, { x: 90, z: -30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && x > 175,
  },
  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.ek = 0; F.ak = 0;
    // 谷・平屋敷の柵は信長公記。崖道の寸法と鉄砲の運用は遊びのための復元。
    F.hist = { valley: 'HIST_A', fence: 'HIST_A', cliffRoad: 'HIST_B', volley: 'GAME_C' };
    // 城ではなく民家を囲む急ごしらえの柵。西の口だけは六メートル開ける。
    F.fence = wallLine(rt, [[104, -3], [104, -14], [144, -14], [144, 16], [104, 16], [104, 3]], { team: 1, hp: 180, name: '田野の柵', segLen: 6, meshOpt: { h: 1.8 } });
    rt.scene.add(hut(W, 128, 0, 7, 5, 0.2, { wall: 0x5a4a38 }), tawara(W, 138, 7, 0.2, 3));
    for (const [x, z] of [[-40, -7], [34, -4], [108, -9], [140, 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 5));
    F.front = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の先手の槍', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[0]), facing: Math.PI / 2, width: 4, yariRanks: 3, aggro: 7, noAI: true, formation: 'yari' }, dress([uS(2), uA(14)], { flag: 'takigawa' }));
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益と近習', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[3]), facing: Math.PI / 2, aggro: 4, noAI: true, guardOn: true, formation: 'ring' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', horse: false, invuln: true, hat: 'kabuto_w' } }, uS(4), uA(4)], { flag: 'takigawa' }));
    F.taki.leader = F.taki.units.find((u) => u.type === 'busho');
    F.kawa = allyGroup(rt, { fixed: true, fullStrength: true, name: '河尻秀隆の後ろの手', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[1]), facing: Math.PI / 2, colW: 2, aggro: 6, noAI: true, formation: 'column' },
      dress([{ type: 'busho', n: 1, o: { name: '河尻秀隆', horse: false, invuln: true } }, uS(3), uA(10)], ODA));
    F.kawa.leader = F.kawa.units.find((u) => u.type === 'busho');
    F.taki.leader.allyOk = true; F.kawa.leader.allyOk = true;
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の鉄砲組', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[2]), facing: Math.PI / 2, width: 3, ranks: 2, aggro: 6, noAI: true, order: 'hold' }, dress([{ type: 'gun', n: 6 }], { flag: 'takigawa' }));
    F.oda = [F.front, F.tgun, F.taki, F.kawa];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -172, z: 0 }, Math.PI / 2, [{ kind: 'spear', n }]);
    // 守る兵は初めから地形に置く。共通の増援処理で背後へ出し直さない。
    const guard = (name, slot, list, width = 6) => enemyGroup(rt, { fixed: true, noAI: true, faction: 'takeda', name, anchor: jinkeiPoint(TANO_DEFEND, TANO_DEFEND.sonae[slot]), facing: -Math.PI / 2, order: 'hold', width, aggro: 5, morale: 100, noRout: true, fleeDir: { x: 1, z: 0 }, formation: 'yari', yariRanks: 3 }, dress(list, TAKEDA));
    F.defenders = [
      guard('谷道の武田勢', 0, [uS(6)], 8),
      guard('谷道の後ろの侍', 1, [uS(8)], 8),
      guard('土屋昌恒の衆', 2, [{ type: 'busho', n: 1, o: { name: '土屋昌恒', horse: false, hat: 'kabuto_m' } }, uS(8)], 5),
      guard('田野の柵を守る侍', 3, [uS(10)], 7),
      guard('武田の最後の侍', 4, [uS(6)]),
    ];
    // 父子二人も四十一人に含める。屋敷の奥に近習を置き、討ち取りの的にしない。
    F.principals = enemyGroup(rt, { fixed: true, noAI: true, faction: 'takeda', name: '武田父子の居所', anchor: { x: 138, z: -6 }, facing: -Math.PI / 2, aggro: 0, noRout: true, stay: true, formation: 'column', civ: true },
      dress([{ type: 'busho', n: 1, o: { name: '武田勝頼', horse: false, noTarget: true, invuln: true } }, { type: 'samurai', n: 1, o: { name: '武田信勝', horse: false, noTarget: true, invuln: true } }], TAKEDA));
    for (const g of F.defenders) for (const u of g.units) u.duelDone = true;
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '預かった組で谷道の先手を支えよ' : '谷道の先手につき、列を離れるな', 'main');
    rt.say('滝川の組頭', '田野の民家に武田の一行がおると、物見が知らせた。前の組に続け', 5);
    rt.after(7, () => { if (!F.started && !F.ending && !rt.over) rt.say('滝川の組頭', '川へ下りるな。敵が寄せたら、槍をそろえて止めよ', 4); });
    rt.after(15, () => this.valley(rt));
  },
  valley(rt) {
    const F = rt.flags;
    if (F.started || F.ending || rt.over || !rt.player.u.alive) return;
    F.started = true;
    // 敵を秒数で崩さず、初めからいる守兵と到着だけで段を進める。
    const steps = [
      { phase: 'approach', kind: 'move', at: { x: -62, z: 4 }, label: '谷道の先手', text: '川へ下りず、谷道の印で先手に合流せよ' },
      { phase: 'valley', kind: 'hold', at: { x: -46, z: 0 }, guards: [0, 1], label: '谷道の先手', text: '先手を支え、谷道の敵の寄せを止めよ' },
      { phase: 'narrow', kind: 'hold', at: { x: 22, z: 2 }, guards: [2], label: '崖道の口', text: '崖道の口で槍をそろえ、鉄砲の合図に続け' },
      { phase: 'fence', kind: 'fight', at: { x: 98, z: 0 }, guards: [3], label: '田野の柵の口', text: '柵から打って出る侍を止め、口を押さえよ' },
      { phase: 'tano', kind: 'hold', at: { x: 114, z: 0 }, guards: [4], label: '柵の内側', text: '柵の口の内側へ進み、最後の寄せを止めよ' },
    ];
    F.dp = { on: true, i: -1, steps, ctx: { friends: () => F.oda, routeFight: true, botTreatAt: 0.65, botSeek: 50 }, cur: null };
    this.next(rt);
  },
  next(rt) {
    const F = rt.flags, D = F.dp, s = D.steps[++D.i];
    rt.unmark('dp'); rt.unzone('dp');
    if (!s) { D.on = false; this.win(rt); return; }
    const groups = (s.guards || []).map((i) => F.defenders[i]);
    D.cur = { s, at: s.at, goal: { ...s.at }, groups, botRadius: 50, settled: 0, outT: 0, sampledAt: rt.t };
    rt.setPhase(s.phase); rt.obj('main', s.text, 'main');
    rt.marker('dp', s.at, s.label, { h: 3 });
    rt.zone('dp', s.at.x, s.at.z, s.kind === 'move' ? 8 : 12);
    sendColumn(rt, s.at);
    for (const g of groups) {
      if (!fighting(g)) continue;
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = s.phase === 'tano' ? [[136, -7], [122, -7], [118, 0]] : [[s.at.x + 6, s.at.z]];
      g.pathIdx = 0;
      g.onArrive = () => { g.order = 'hold'; g.path = null; g.formation = 'yari'; g.facing = -Math.PI / 2; };
    }
    // 持ち場へ着くまでは射手が槍の後ろから勝手に撃たない。
    F.tgun.holdFire = true;
    if (s.phase !== 'narrow') F.tgun.onArrive = () => { F.tgun.order = 'hold'; F.tgun.path = null; F.tgun.formation = 'line'; F.tgun.facing = Math.PI / 2; F.tgun.onArrive = null; F.tgun.holdFire = false; };
  },
  flowTick(rt, dt) {
    const F = rt.flags, D = F.dp, C = D && D.cur;
    if (!D || !D.on || !C || rt.over || !rt.player.u.alive) return;
    if (C.s.phase === 'narrow' && !F.volleyQueued && F.tgun.order === 'hold' && F.tgun.count) {
      F.volleyQueued = true;
      volleyAt(rt, { guns: () => F.dp.cur.s.phase === 'narrow' && fighting(F.defenders[2]) ? [F.tgun] : [], foes: () => [F.defenders[2]], near: 45, max: 30, drop: 0, who: '鉄砲頭',
        line: '鉄砲が放たれた。煙が流れる間に槍を進めよ',
        onFire: () => {
          F.volley = true;
          if (F.dp.cur.s.phase === 'narrow' && fighting(F.front)) roadOrder(F.front, F.dp.cur.at.x + 6, F.dp.cur.at.z, 'yari');
          battleEvent(rt, EVENT_VOLLEY, F.tgun.anchor, F.tgun, 0, true, '崖道に鉄砲の音が返る');
        } });
    }
    F.flowScan = (F.flowScan || 0) - dt;
    if (F.flowScan > 0) return;
    F.flowScan = 0.4;
    const elapsed = Math.max(0, rt.t - C.sampledAt); C.sampledAt = rt.t;
    const p = rt.player.u.pos;
    const inside = C.s.phase !== 'tano' || (p.x > 104 && p.x < 144 && p.z > -14 && p.z < 16);
    const distance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
    const near = inside && distance < (C.s.kind === 'move' ? 8 : 12);
    const clear = !C.groups.some(fighting) && (C.s.phase !== 'tano' || !F.defenders.some(fighting));
    const enemy = C.groups.find(fighting) || (C.s.phase === 'tano' ? F.defenders.find(fighting) : null);
    if (enemy) {
      let x = 0, z = 0, n = 0;
      for (const u of enemy.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) { x += u.pos.x; z += u.pos.z; n++; }
      if (n) { C.goal.x = x / n; C.goal.z = z / n; }
      else { C.goal.x = C.at.x; C.goal.z = C.at.z; }
    } else { C.goal.x = C.at.x; C.goal.z = C.at.z; }
    const ready = C.s.phase !== 'narrow' || F.volley || !F.tgun.count || !fighting(F.defenders[2]);
    if (!clear || !ready) { C.settled = 0; C.outT = 0; }
    else if (near) { C.settled += elapsed; C.outT = 0; }
    else {
      C.outT += elapsed;
      // 短い押し出しの間は確認を止める。三秒以上離れたら持ち場を放棄した扱い。
      if (C.outT >= 3 || distance >= 20) C.settled = 0;
    }
    rt.objProgress('main', !inside ? '柵の正面の口から内側へ進め'
      : !near ? `${C.s.label}の印の${C.s.kind === 'move' ? '八' : '十二'}歩以内へ進め。あと ${Math.max(0, Math.ceil(distance - (C.s.kind === 'move' ? 8 : 12)))}歩`
        : !clear ? `敵は印から${C.goal.x < C.at.x ? '谷道の手前' : '谷道の奥'}にいる。${C.s.phase === 'fence' || C.s.phase === 'tano' ? '柵の口から' : '川へ下りず'}組と進み、退けよ`
          : !ready ? 'まだ鉄砲の合図が出ていない。槍をそろえて待て'
            : C.s.kind === 'move' ? '先手に着いた' : `持ち場を固めよ。あと ${Math.max(0, Math.ceil(8 - C.settled))}秒`);
    if (near && clear && ready && C.settled >= (C.s.kind === 'move' ? 0.4 : 8)) {
      if (C.s.kind !== 'move') {
        const label = C.s.phase === 'valley' ? '谷道の先手を支えた' : C.s.phase === 'narrow' ? '崖道の寄せを止めた' : C.s.phase === 'fence' ? '田野の柵の口を押さえた' : '田野の最後の寄せを止めた';
        rt.award((t) => t.side.push(label), label);
      }
      this.next(rt);
    }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (!rt.player.u.alive || F.defenders.some(fighting)) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '谷道から田野の柵へ攻め込んだ', pts: 20 }; }, '任務達成・田野の柵を押さえた');
    // 最期の言葉・救出・個人の決闘は作らない。史実の結末は知らせで示す。
    rt.banner('田野の寄せが止まる', '組をそろえ、下知を待て');
    rt.after(8, () => {
      for (const u of F.principals.units) {
        // 攻め手の討ち取りに数えず、最後の知らせと生死をそろえる。
        u.alive = false; u.hp = 0; u.deadT = 0; u.atk = null; u.swing = null; u.target = null;
      }
      F.principalsDead = true;
      rt.say('使番', '勝頼公と信勝公、北条の奥方も亡くなられた。田野の戦は終わった', 4);
    });
    rt.say('滝川の組頭', '寄せは止まった。組をそろえ、谷道を固めよ', 4);
    // 最期の細かな場面は見せず、使番の知らせで結末を伝える。
    rt.player.u.invuln = true; rt.finish({}, 12);
  },
  update(rt, dt) {
    if (rt.flags.ending) return;
    KIT.backTick(rt);
    if (rt.flags.started) this.flowTick(rt, dt);
    // 三割まで減ってからでは、侍の次の一撃に間に合わない。傷の原因も伝える。
    const u = rt.player.u, hit = rt.player.lastHit;
    if (!rt.over && u.alive && u.hp < u.maxHp * 0.65 && hit && rt.t - hit.t < 2 &&
        !(rt.flags.guardHelpT > rt.t)) {
      rt.flags.guardHelpT = rt.t + 12;
      rt.bark(hit.ranged
        ? '矢玉を受けた。構えだけでは防げぬ。川へ下りず、道の陰へ退け'
        : hit.back || hit.side
        ? '横や後ろから突かれているぞ。敵へ向き直って構え、川へ下りず、味方の列の後ろへ下がれ'
        : hit.type === 'samurai' || hit.type === 'busho'
          ? '侍の一撃は重い。敵へ向いて構え、味方の列へ下がれ'
          : '傷が増えているぞ。敵へ向いて構え、味方の列へ下がれ', true);
    }
  },
  onKill(rt, v) { if (!v.isStruct && !v.group?.civ && v.type !== 'porter') { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; } },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t - (rt.flags.routSaidT ?? -99) < 8) return;
    rt.flags.routSaidT = rt.t;
    rt.say('足軽', '武田の前が退いた。谷道を押せ！', 2.5);
  },
};
const uS = (n) => ({ type: 'samurai', n, o: { weapon: 'spear', reach: 3.4, horse: false } }), uA = (n) => ({ type: 'ashigaru', n });
// 味方は数千という復元値。敵は信長公記の侍四十一人（非戦闘員は含めない）。
tano.force = (rt) => ({ a: Math.max(0, 4000 - (rt.flags.ak || 0)), a0: 4000, b: Math.max(0, 41 - (rt.flags.ek || 0) - (rt.flags.principalsDead ? 2 : 0)), b0: 41 });
tano.sides = { a: { name: '織田軍（滝川一益）', mon: 'oda' }, b: { name: '武田の残る侍', mon: 'takeda' } };
tano.famous = [];
tano.date = () => '天正十年三月十一日　春・午前';
tano.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
tano.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  tano.valley(rt);
};
tano.history = '信長公記巻十五によると、三月十一日、滝川一益は険しい山中を捜し、田野の平屋敷に柵を設けた勝頼の一行を見つけた。武田の者は打って出て戦い、土屋昌恒も奮戦した。勝頼と信勝はこの地で命を絶った。侍四十一人、上臈・侍女五十人という人数は信長公記に基づく。父子はこの侍の人数に含め、戦う守兵は三十九人に分ける。甲陽軍鑑では戦死者を四十四人とも伝え、人数や最期の様子には異同がある。織田方の三千から四千という兵数は復元の目安。崖道の片手千人斬りは後の伝えで、ゲームの道幅・段の順・鉄砲の合図は地形を使った遊びのための復元である。当日の天気と川幅、河尻の細かな持ち場は確定できない。午前の光と弱い風は補完である。景徳院は後に建てられ、当時ここに城や寺の大きな門はない。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';
tano.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  if (b.flags.started) depthBot(b, inp, goTo);
  else goTo(b.player, inp, -158, 4, 3);
};
export { tano };
