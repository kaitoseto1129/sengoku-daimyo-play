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
  g.path = [[c.x, c.z], [0, c.z], ...mouths.filter(v => v > c.z + 1 && v < z.pos.z).map(v => [0, v]), [z.pos.x, z.pos.z]];
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
  G.groups.forEach((g, i) => {
    if (!g.count) return;
    const dx = HANDS[i][3];
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0; g.dest = null; g.speed = 4.5; g.roadColumn = true;
    g.path = [[G.ctx.kannonIn.x + dx, G.ctx.kannonIn.z], ...G.route.map(([x, z], k) => [x + dx * (k % 2 ? 0.5 : 1), z])];
    g.onArrive = (q) => { q.order = 'assault'; q.assault = () => { const s = G.ctx.gate(); return s && s.alive ? s : null; }; q.seekRange = 40; q.aggro = 20; };
  });
  rt.say('佐々成政', '観音丸は押さえた。この尾根の先が木ノ芽峠の城じゃ。並んで上れ！', 3.6);
  // 九十九折りの尾根道（左右百四十メートルの折り返し）は本人も手も登り切れず、十分以上止まっていた。
  //   合流の台詞の後、場面替えで木ノ芽峠城の木戸の前（二十メートル手前）へ移す（設楽原の柵の内の移動と同じ省き方）
  rt.after(22, () => {
    if (F.ending || rt.over || !rt.player.u.alive || G.cut) return;
    const s = G.ctx.gate();
    if (!s || !s.alive) return;
    G.cut = true;
    const gz = GATE_KINOME.z, gx = GATE_KINOME.x;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); u.target = null; };
    const P = rt.player.u;
    const ox = P.pos.x, oz = P.pos.z;
    put(P, gx, gz - 26);
    // 退いた者はその場に残す。本人と一緒に上っている組の者だけを連れる。
    for (const q of rt.squadGroups || []) q.units.forEach((u, k) => { if (!q.routed && u.alive && !u.fleeing && !u.woundOut && !u.rearWound && Math.hypot(u.pos.x - ox, u.pos.z - oz) < 40) put(u, gx - 3 + (k % 4) * 2, gz - 30 - Math.floor(k / 4) * 2); });
    G.groups.forEach((g, i) => {
      const dx = HANDS[i][3] * 2;
      g.units.forEach((u, k) => { if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound) put(u, gx + dx + (k % 3) * 1.6, gz - 22 - Math.floor(k / 3) * 1.8); });
      const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z; g.dest = null; g.onArrive = null; g._fitAt = 0;
      g.order = 'assault'; g.assault = () => { const t = G.ctx.gate(); return t && t.alive ? t : null; }; g.seekRange = 40; g.aggro = 20; g.path = null;
    });
    try { sfx('sig_kakari', 0.9); } catch (e) { /* なし */ }
    rt.say('前田利家', '峠の城の木戸じゃ！　打ち破れ！', 3);
  });
}

// 毎コマ。木戸が開いたら手を郭の中の斬り合いへ回す
export function tick(rt, dt) {
  const F = rt.flags, G = F.echGoryu;
  if (!G || G.done || !G.up) return;
  const s = G.ctx.gate();
  // 斬り合いの後に道の初めへ戻らないよう、四秒ごとに「今いる所より先の道の点」から辿り直させる
  if (s && s.alive && !G.cut && (G.reT = (G.reT || 0) - dt) <= 0) {
    G.reT = 4;
    G.groups.forEach((g, i) => {
      if (!g.count || g.order === 'assault' || g.order === 'attack' && g.focus) return;
      const c = g.center(), dx = HANDS[i][3];
      let k = G.route.findIndex(([, z]) => z > c.z + 3);
      if (k < 0) k = G.route.length - 1;
      const next = G.route[k];
      if (g.order === 'path' && g.path?.[g.pathIdx] && Math.abs(g.path[g.pathIdx][1] - next[1]) < 4) return;
      g.order = 'path'; g.pathIdx = 0; g.dest = null; g.speed = 4.5;
      g.path = G.route.slice(k).map(([x, z]) => [x + dx * 0.5, z]);
      g.onArrive = (q) => { q.order = 'assault'; q.assault = () => { const t = G.ctx.gate(); return t && t.alive ? t : null; }; q.seekRange = 40; q.aggro = 20; };
    });
  }
  if (s && s.alive) return;
  G.done = true;
  for (const g of G.groups) toCourt(rt, g, F.SZ.byId.kinome_sou);
  rt.say('不破光治', '木戸が開いた！　郭の中へ押し入れ！', 3);
}

// 後で上がる柴田らの手（b_echizen.js の echizenAdvance）と重ねない
export const NAMES = HANDS.map((h) => h[0]);
