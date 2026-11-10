// ======================================================================
// 越前一向一揆・木ノ芽峠　戦況の変わり目（6〜9分）「尾根道で前田・佐々・不破と合流」（docs/oda15_plan_1108.md 18）
//   観音丸が落ちると、峠口の先手（明智の配下）は郭の斬り合いで崩れて退く。そのままでは本人一人で次の木戸へ向かう事になり、
//   二つ目の木戸の前で進みが止まっていた（docs/allbattle_1108.md・11/9 の流しで観音丸の後に先手が〇人）。
//   本道の後ろから前田利家・佐々成政・不破光治（後の府中三人衆・docs/generals_oda_1108.md 18）の手が上がって来て、
//   尾根道で本人と並び、木ノ芽峠城の木戸を打ち破りに掛かる。木戸が開けば本体の段（郭の守兵・奥の曲輪・本陣）へ。
// 兵は三つの手で三十人ほど。字は台詞と名札だけ。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { ROAD, KZ, GATE_KINOME } from '../castles/kinome.js';

const HANDS = [
  ['前田利家', 'maeda', 'spear', -3],
  ['佐々成政', 'sassa', null, 3],
  ['不破光治', 'oda', null, 0],
];

// 郭の口は本道の芯にある。斜めの直進や古い持ち場へ戻さず、口を順に通る。
export function toCourt(rt, g, z) {
  if (!g.count || g.routed) return;
  if (g.echCourt === z.id && g.order === 'path' && g.path?.[g.pathIdx]) return;
  const c = g.center();
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.echCourt = z.id; g.assault = null; g.focus = null; g.dest = null;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
  g.pathIdx = 0; g.speed = 4.5; g._fitAt = 0;
  const mouths = [-30, -6, -4, 18, 20].map(KZ);
  // 手前の郭に残敵が戻った時も、北から南へ口を逆順に通る。
  // 登り専用の絞り込みでは、援軍が副郭・木戸内の塀へ直進していた。
  const forward = z.pos.z >= c.z;
  const between = mouths.filter(v => forward ? v > c.z && v < z.pos.z : v < c.z && v > z.pos.z);
  if (!forward) between.reverse();
  g.path = [[c.x, c.z], [0, c.z], ...between.map(v => [0, v]), [z.pos.x, z.pos.z]];
  g.onArrive = q => { q.order = 'attack'; q.seekRange = 40; q.aggro = 30; };
}

// ctx：{ gate: () => 木ノ芽峠城の木戸の struct, kannonIn: 観音丸の郭の中の点, kannonGate: 観音丸の木戸の前の点 }
// 観音丸の寄せが長引いた時（先手が郭の中で減った時）に呼ぶ。三つの手は本道を上がって観音丸の郭へ入り、郭を押さえる助けをする。
// 観音丸が落ちたら onKannonFell で尾根道を木ノ芽峠城の木戸へ向かう。
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.echGoryu) return F.echGoryu;
  // 道の点の並びで、観音丸の木戸（KZ(-120)）から木ノ芽峠城の木戸の手前までを辿る（九十九折りの点を飛ばさない）
  // ROAD は南→北の並び（castles/kinome.js）。観音丸の北口（KZ(-96)）から木ノ芽峠城の木戸（KZ(-30)）の手前まで
  const i0 = ROAD.findIndex((p) => p[1] === KZ(-96)), i1 = ROAD.findIndex((p) => p[1] === KZ(-30));
  const route = i0 >= 0 && i1 > i0 ? ROAD.slice(i0, i1) : [];
  route.push([GATE_KINOME.x, GATE_KINOME.z - 8]);
  const G = F.echGoryu = { at: rt.t, ctx, groups: [], route };
  const from = [ctx.kannonGate.x, ctx.kannonGate.z], inK = ctx.kannonIn;
  HANDS.forEach(([name, flag, weapon, dx], i) => {
    const g = allyGroup(rt, { faction: 'oda', name: name + 'の手', fixed: true, fullStrength: true, noGuard: true,
      anchor: { x: from[0] + dx, z: from[1] - 22 - i * 6 }, facing: 0, width: 5, aggro: 8, formation: 'column' },
      [{ type: 'busho', n: 1, o: { name, invuln: true, horse: true, flag, ...(weapon ? { weapon } : {}) } }, { type: 'samurai', n: 3, o: { flag } }, { type: 'ashigaru', n: 6, o: { flag } }]);
    g.noRout = true;
    // 観音丸の木戸を通って郭の中へ入り、守兵と斬り合う
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0; g.dest = null; g.speed = 4.5;
    g.path = [[from[0] + dx * 0.4, from[1] + 2], [inK.x + dx, inK.z]];
    g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 20; };
    G.groups.push(g);
  });
  try { sfx('horagai', 0.6); } catch (e) { /* 音が無くても進む */ }
  rt.say('使番', '先手が郭の中で減っております！　後ろから前田殿・佐々殿・不破殿の手が上がって参ります！', 4);
  rt.after(5, () => { if (!F.ending) rt.say('前田利家', '先手に代わる！　観音丸を押さえ、尾根道を峠の城へ上るぞ。遅れるな！', 3.8); });
  return G;
}

// 観音丸が落ちたら、三つの手は尾根道を木ノ芽峠城の木戸へ（着いたら木戸を打ち破りに掛かる）
export function onKannonFell(rt, ctx) {
  const F = rt.flags;
  const G = F.echGoryu || start(rt, ctx);
  if (G.up) return;
  G.up = true;
  G.groups.forEach((g) => {
    if (!g.count || g.routed) return;
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 1; g.dest = null; g.speed = 4.5; g.roadColumn = true; g.followColumnRoad = true;
    const c = g.center();
    g.anchor.x = c.x; g.anchor.z = c.z; g._fitAt = 0;
    // 郭の北口を通り、後列も九十九折りの道の芯をたどる。
    g.path = [[c.x, c.z], [0, G.ctx.kannonIn.z], ...G.route.map(([x, z]) => [x, z])];
    g.onArrive = (q) => { q.order = 'assault'; q.assault = () => { const s = G.ctx.gate(); return s && s.alive ? s : null; }; q.seekRange = 40; q.aggro = 20; };
  });
  rt.say('佐々成政', '観音丸は押さえた。この尾根の先が木ノ芽峠の城じゃ。並んで上れ！', 3.6);
  // 二十二秒後の座標の書き替えは行わず、本人と組の者も尾根道を歩く。
}

// 毎コマ。木戸が開いたら手を郭の中の斬り合いへ回す
export function tick(rt, dt) {
  const F = rt.flags, G = F.echGoryu;
  if (!G || G.done || !G.up) return;
  const s = G.ctx.gate();
  // 道の途中を高さ（南北の座標）だけで選び直すと、折れ角を飛ばして
  // 山肌へ直進する。歩いている列の道順と通った角を保つ。
  if (s && s.alive) return;
  G.done = true;
  for (const g of G.groups) toCourt(rt, g, F.SZ.byId.kinome_sou);
  rt.say('不破光治', '木戸が開いた！　郭の中へ押し入れ！', 3);
}

// 後で上がる柴田らの手（b_echizen.js の echizenAdvance）と重ねない
export const NAMES = HANDS.map((h) => h[0]);
