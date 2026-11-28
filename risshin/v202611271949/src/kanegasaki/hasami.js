// ======================================================================
// 金ヶ崎の退き口 「背後まで敵」（docs/kanegasaki_spec_1109.md・kaito 11/9 夜）
// ・浅井接近：狭路の砦へ退く途中、前から逃げて来た味方が「戻れ！浅井がいる！」→南の尾根に三つ盛亀甲の旗→後ろは朝倉。
//   向きは字の札でなく、味方の叫び・法螺・旗で分からせる。浅井の大軍は尾根に立つだけ（退き口は塞がない＝理不尽にしない）。
// ・残る十人：最後の「撤退せよ」で、名もない槍の組が殿の殿として残る。少しして後ろの旗が倒れ、音が止む。
// 呼び方：b_kanegasaki.js の fallBack(rt, 2) で azaiNews、collapse で lastStand、update で tick。
// ======================================================================
import { sfx } from '../audio.js';
import { encircleWarn } from '../encircle_signal.js';   // P3 包囲の合図（K406）

const live = (rt) => !rt.over && !rt.flags.ending;

export function azaiNews(rt, ctx) {
  const F = rt.flags;
  if (F.azaiNews || rt.G.lord) return;
  F.azaiNews = rt.t;
  const { L, allyGroup, dress, ODA, roadX } = ctx;
  // 前（南）から逃げて来る味方の三人。殿の方（北）へ駆け戻ってくる
  rt.after(4, () => {
    if (!live(rt) || F.fleeing) return;
    const z = L.z + 22;
    const g = allyGroup(rt, { fixed: true, faction: 'oda', name: '逃げ戻る足軽', anchor: { x: roadX(z), z }, facing: Math.PI, width: 3, aggro: 6, seekRange: 8, formation: 'column' },
      dress([{ type: 'ashigaru', n: 3 }], ODA));
    g.path = [[L.x + 2, L.z - 4]]; g.pathIdx = 0; g.order = 'path'; g.dest = { x: L.x + 2, z: L.z - 4 };
    g.fixed = false; g.speed = 4; g._fitAt = 0;
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...gg.dest }; gg.path = null; gg.onArrive = null; gg.facing = Math.PI; };
    F.azaiRunners = g;
  });
  // 11/20 P3（K406）：浅井の叫びの前に、南の尾根の遠い太鼓が鳴り出して間を詰め、尾根の稜線に三つ盛亀甲の幟がせり上がる。
  //   幟は浅井の大軍（軽い作り）が見えている間だけ（近づいて大軍を隠したら幟も下げる・K391）
  rt.after(3, () => { if (live(rt) && !F.fleeing) encircleWarn(rt, { from: [{ x: 44, z: 128 }, { x: 30, z: 122 }], flag: 'azai', lead: 4, with: () => !!F.azaiFar?.m?.visible }); });
  rt.after(7, () => {
    if (!live(rt) || F.fleeing) return;
    rt.say('足軽', '戻れ！　浅井がいる！', 3);
    try { sfx('horagai', 0.45); } catch (e) { /* 音の無い時も続ける */ }
    F.azaiShown = rt.t;
  });
  rt.after(10.5, () => { if (live(rt) && !F.fleeing) rt.say('使番', '後方より浅井勢！　南の尾根に亀甲の旗！', 3.4); });
  rt.after(14.5, () => { if (live(rt) && !F.fleeing) rt.say('足軽', '後ろは朝倉、前は浅井……挟まれた！', 3); });
  rt.after(18.5, () => { if (live(rt) && !F.fleeing) rt.say('木下藤吉郎', '慌てるな！　狭路の砦は浅井の道より手前じゃ。砦へ入れ、まだ本隊が抜けてない！', 4); });
}

// 狭路の砦の守りの途中、南東の脇道から浅井の小隊（さっきまで味方だった旗）
export function azaiFlank(rt, ctx) {
  const F = rt.flags;
  const { spawnEnemy, dress, LOOK, L } = ctx;
  const g = spawnEnemy(rt, { faction: 'azai', name: '浅井の小隊', anchor: { x: L.x + 17, z: L.z + 40 }, facing: Math.PI * 1.15, order: 'attack',
    seekRange: 70, aggro: 12, width: 8, morale: 70, fleeDir: { x: 0.4, z: 1 }, dmgMult: 0.42, speed: 2.8 },
  dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }], LOOK));
  // 11/14 K104：南から来る徳川の列へ向かって場の南の縁（z150）を越え、縁で構えて止まり、砦の横を一度も衝かなかった。
  //   脇道を砦の横（南東）まで寄せてから掛かる。徳川の手はこの浅井を後ろから受ける（b_kanegasaki.js kgReinforce）。
  //   前の出所 (L+30, L+30) は尾根の歩けない所で、兵は南の谷 (z155〜172) へ押し出されていた。南の谷 (15,164) から出すと
  //   z150 の辺りで止まって砦まで来なかったので、歩ける脇道の中ほど (-5,142)（本人の背の側・砦から四十歩）から砦の南の退き道へ下らせる（11/14 の歩ける所の測り）。
  const to = { x: L.x + 4, z: L.z + 10 };
  g.kgFlank = true;
  g.path = [[L.x + 12, L.z + 34], [L.x + 5, L.z + 24], [to.x, to.z]]; g.pathIdx = 0; g.order = 'path'; g.dest = to;
  // 11/15 K104 クラウド台帳前半：本人が近いと guardSpawn（battle.js）が出る所を奥の南の谷 (5,171) へずらし、
  //   谷と脇道の間の低い崖（z156〜160・x-16〜-4）に当たって七十秒以上行き来し、砦まで一度も下りなかった（k104_azai_count.mjs）。
  //   谷に出た時は、崖の西の切れ目 (L-2,L+66)→(L-4,L+56)→(L,L+46) を回って脇道へ上がる。持ち場も兵の真ん中へ置き直す
  let cx = 0, cz = 0, k = 0;
  for (const u of g.units) if (u.alive) { cx += u.pos.x; cz += u.pos.z; k++; }
  if (k && cz / k > L.z + 48) {
    g.anchor = { x: cx / k, z: cz / k };
    g.path = [[L.x - 2, L.z + 66], [L.x - 4, L.z + 56], [L.x, L.z + 46], ...g.path];
  }
  // 谷の脇道は狭い。槍列（幅八）のまま歩くと端の兵が斜面に掛かって進まなかった（百秒で十八歩）。縦隊で来て、着いたら槍列に開く
  g.fixed = false; g.speed = Math.max(g.speed || 0, 3); g._fitAt = 0; g.formation = 'column'; g.roadColumn = true;
  g.seekRange = 14;   // 道の途中では遠くの徳川の列へ駆け出さず、砦の後ろまで下ってくる
  g.onArrive = (gg) => { gg.order = 'attack'; gg.path = null; gg.onArrive = null; gg.anchor = { ...to }; gg.seekRange = 40; gg.formation = 'yari'; gg.roadColumn = false; gg._slotFit = null; gg._routeCols = 0; };
  // 退き道で待つ徳川の手は、脇道を下る浅井の列を横から受ける（kanegasaki_spec「徳川が助けに来る」）
  F.azaiFlankG = g;
  if (F.ieyasu?.count) { F.ieyasu.aggro = 14; F.ieyasu.seekRange = 30; }
  rt.say('足軽', '浅井だ！　後ろの脇道から亀甲の旗が来る！', 2.8);
  rt.after(3, () => { if (live(rt) && !F.fleeing) rt.say('池田勝正', '横道を塞げ！　退き道を浅井に取らせるな！', 3); });
  return g;
}

// 最後の撤退：残る十人
export function lastStand(rt, ctx) {
  const F = rt.flags;
  if (F.lastStand || rt.G.lord) return;
  const { L, allyGroup, dress, ODA, nobori } = ctx;
  const g = allyGroup(rt, { fixed: true, faction: 'oda', name: '残る槍の組', anchor: { x: L.x, z: L.z + 2 }, facing: Math.PI, width: 8, aggro: 12, seekRange: 14, formation: 'yari' },
    dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ODA));
  g.defMult = 1.5;
  const flag = nobori(L.x + 3, L.z + 6);
  F.lastStand = { g, flag, at: rt.t, fall: 0 };
  rt.after(2.5, () => { if (live(rt)) rt.say('足軽', '先に行け！　ここは持たせる！', 3); });
  rt.after(7, () => { if (live(rt)) rt.say('足軽', '殿を守れ！　槍をそろえい！', 2.6); });
}

export function tick(rt, dt) {
  const F = rt.flags, p = rt.player.u.pos;
  const A = F.azaiFar;
  // 他の遠景部隊と同じく、九十m 以内では板の兵を見せない。
  if (A?.m) A.m.visible = !!F.azaiShown && Math.hypot(A.x - p.x, A.z - p.z) > 90;
  const S = F.lastStand;
  if (!S) return;
  // 時間や主人公との距離だけで、健在の槍組を全滅したように見せない。
  let fighting = false;
  if (!S.g.routed) for (const u of S.g.units) {
    if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget) {
      fighting = true; break;
    }
  }
  if (!S.fallAt && !fighting) {
    S.fallAt = rt.t;
    if (!F.ending) rt.say('足軽', '……後ろの槍の音が、止んだ', 3);
  }
  if (S.fallAt && S.fall < 1.45) { S.fall = Math.min(1.45, S.fall + dt * 0.9); S.flag.rotation.z = S.fall; }
}

// 結果の一言：殿の組の出た数と戻った数（撃破数でなく生還を見せる）
export function headcount(rt, exit) {
  const F = rt.flags;
  let n0 = 0, n1 = 0;
  // 最後に残る槍組も殿の人数に含める。生きているだけでは生還にせず、
  // 三将との合流と同じ退き口の範囲へ着いた者（手負いも含む）を数える。
  const groups = new Set(F.tono || []);
  // 合流の判定に含めた主人公の組も、生還の報告から漏らさない。
  // 殿の一覧と同じ組が入っていても、一組として数える。
  for (const g of rt.squadGroups || []) groups.add(g);
  if (F.lastStand?.g) groups.add(F.lastStand.g);
  for (const g of groups) {
    n0 += g.initial || 0;
    for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - exit.x, u.pos.z - exit.z) < 30) n1++;
  }
  return { n0, n1 };
}
