// ======================================================================
// 戸次川　③の段（6〜12分）：釣り野伏せ → 自分の周りを防ぐ → 信親の隊を救いに行く（救えない）
//   a（伏せの始め）：信親は西の新納勢へ斬り込んで離れ、本人の所へは豊久・家久の手が寄せる。行き先の▼は防戦する河原
//   b：十河存保の討死の知らせ → 「信親様の隊が囲まれた」→ ▼は信親。着いて少しすると鈴木大膳が斬り込み（本体の lastStand）
//   c：信親の討死（本体の closeRing）→ ④へ
// 呼び方：install(rt, K)（本体の ambush の始め）・update(rt, K, el)・pin(rt)・sogoFall(rt, K)。
// ======================================================================
const live = (g) => g && g.count > 0;
const fighting = (u) => u?.alive && !u.gone && !u.dying && !u.woundOut && !u.rearWound && !u.noTarget;
const landed = (a, b) => a?.swing?.target === b && (a.swing.res === 'hit' || a.swing.res === 'armor' || a.swing.res === 'block');
const NOBU_SPOT = { x: -24, z: -104 };   // 信親が斬り込んで囲まれる所（西の林の縁）
const DEFEND_SPOT = { x: 22, z: -94 };   // 追撃の先と同じ河原で防ぐ。救援の知らせまでは信親を追わせない。

// 刃の結果は次の見回りまで残るとは限らないため、毎コマ記録する。
export function contact(rt) {
  const F = rt.flags, S = F.s3;
  if (!S || F.ringClosed) return;
  const p = rt.player.u, target = p.swing?.target;
  if (target && target.team !== p.team && landed(p, target)) S.fought = true;
  if (crossed(rt) && Math.hypot(F.nobuU.pos.x - p.pos.x, F.nobuU.pos.z - p.pos.z) < 14 &&
    (landed(F.nobuU, F.suzukiU) || landed(F.suzukiU, F.nobuU))) S.bladesMet = true;
  // 最期の乱戦は二人の一騎打ちだけに頼らない。本人のそばで信親の隊が戦った記録を残す。
  const n = F.nobuU;
  if (!S.ls || !fighting(n) || Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) >= 14) return;
  if (target && target.team !== p.team && landed(p, target) && Math.hypot(target.pos.x - n.pos.x, target.pos.z - n.pos.z) < 18) S.standFought = true;
  if (n.swing?.target?.team === 1 && landed(n, n.swing.target)) S.standFought = true;
  if (!S.standFought) for (const g of F.foes) for (const u of g.units) {
    if (landed(u, n)) { S.standFought = true; return; }
  }
}

function crossed(rt) {
  const F = rt.flags, n = F.nobuU, s = F.suzukiU;
  return F.s3?.ls && fighting(n) && fighting(s) &&
    Math.hypot(n.pos.x - s.pos.x, n.pos.z - s.pos.z) < 6 && Math.abs(n.pos.y - s.pos.y) < 3 &&
    !rt.army.wallBetween(n.pos, n.team, s.pos) && !rt.army.terrainBlocks(n.pos, s.pos);
}

export function install(rt, K) {
  const F = rt.flags, B = F.blk;
  F.s3 = { st: 0, near: 0, held: 0, tickT: rt.t, kills0: rt.stats.kills, taken0: rt.stats.taken };
  // 信親は西の新納勢へ馬を入れ、本人から離れる
  rt.after(6, () => {
    if (F.step !== 3) return;
    K.go(B.nobu, NOBU_SPOT, 2.2, { charge: true });
    rt.say('長宗我部信親', '新納の備へ斬り込む。続け！', 2.8);
  });
  rt.after(20, () => { if (F.step === 3 && !F.s3.st) rt.say('手勢の侍', `東の林からも来るぞ！　ここで防げ！`, 2.8); });
  rt.after(58, () => { if (F.step === 3 && !F.s3.st) rt.say('使番', '後ろの浅瀬にも島津の手が回りました！', 2.8); });
  rt.after(76, () => { if (F.step === 3 && !F.s3.st) rt.say('物見', '十河様の備、崩れかかっております！', 2.8); });
}

// 十河存保の討死（史実：戸次川で討死）。b の始めに
export function sogoFall(rt, K) {
  const F = rt.flags, B = F.blk;
  if (F.sogoDead) return;
  F.sogoDead = true;
  if (F.sogoU?.alive) { F.sogoU.invuln = false; rt.army.kill(F.sogoU, null); }
  rt.banner('十河存保、討死', '');
  rt.say('物見', '十河様、お討死！　右の備が崩れまする', 2.6);
  K.routButai(B.sogo, 30);
  // 塊だけでなく本物の旗本も崩れる。備への追従を切り、浅瀬を通って退く。
  F.follow = F.follow.filter(([g]) => g !== F.sogo);
  if (live(F.sogo)) {
    const g = F.sogo;
    g.order = 'move'; g.focus = null; g.speed = 3.6; g.aggro = 6; g.seekRange = 6;
    g.dest = { x: K.FORD.x, z: -24 };
    g.onArrive = (q) => { q.order = 'move'; q.dest = { x: K.FORD.x, z: 40 }; q.onArrive = null; };
  }
}

function toB(rt, K) {
  const F = rt.flags, S = F.s3;
  S.st = 1; S.tB = rt.t;
  sogoFall(rt, K);
  rt.after(3.4, () => {
    rt.say('使番', '信親様の隊、新納勢に囲まれた！　お救いせよ！', 3);
    rt.marker('nobu', () => (F.nobuU?.alive ? { x: F.nobuU.pos.x, z: F.nobuU.pos.z } : NOBU_SPOT), '長宗我部信親');
  });
  // 夜へ移ろう（信親を救いに走る間に暮れる）
  if (!F.nightGo) { F.nightGo = true; rt.world.setTime?.('night'); if (rt.world.fade) rt.world.fade.dur = 60; }
  if (F.blk.nobu) F.blk.nobu.morale = Math.min(F.blk.nobu.morale ?? 50, 40);
}

export function pin(rt) {
  const S = rt.flags.s3, F = rt.flags;
  if (!S || S.st < 1) return DEFEND_SPOT;
  return F.nobuU?.alive ? F.nobuU.pos : NOBU_SPOT;
}

export function update(rt, K, el) {
  const F = rt.flags, S = F.s3, P = rt.player.u.pos;
  if (!S) return;
  // 見回りの間隔はコマの刻みで変わる。滞在時間は実際の戦の秒で数える。
  const dt = Math.max(0, rt.t - (S.tickT ?? rt.t));
  S.tickT = rt.t;
  if (S.st === 0) {
    // 河原を離れて待つだけでは防戦を果たさない。包みの内で二分持ちこたえ、本人も敵と当たってから救援へ進む。
    if (Math.hypot(P.x - K.RING.x, P.z - K.RING.z) < 60) S.held = (S.held || 0) + dt;
    const fought = S.fought || rt.stats.kills > S.kills0 || rt.stats.taken > S.taken0;
    if (el > 145 && S.held >= 120 && fought) toB(rt, K);
  }
  if (S.st < 1) return;
  const bEl = rt.t - S.tB;
  // 乱戦で包囲に呑まれる経路も、一騎打ちと同じく戦える信親を本人が見届けた時だけ進める。
  const near = fighting(F.nobuU) && Math.hypot(F.nobuU.pos.x - P.x, F.nobuU.pos.z - P.z) < 14;
  if (near) S.near += dt;
  // 本人が信親の側へ救援に来てから斬り込む。離れたまま最期を済ませない。
  if (!S.ls && near && S.near > 20 && bEl > 90) { S.ls = rt.t; K.lastStand(rt); }
  // 鈴木大膳が旗本に阻まれている間は、遠くから信親を討った事にしない。
  // 深手で戦列を離れている信親のそばに敵が来ても、斬り結んだ事にはしない。
  const meeting = crossed(rt);
  if (meeting && near) S.clash = (S.clash || 0) + dt;
  // 六 m 内にいるだけでは、刀も長刀も届かないまま最期が進んでしまう。
  // 本人の見ている所で、二人のどちらかの刃が相手へ届いた事を確かめる（受け・甲冑で止まる時も含む）。
  contact(rt);
  // 鈴木一人が旗本や地形に阻まれても、救援している本人の前で包囲が崩れれば最期へ進む。
  // 遠くでの待機や、交戦の無い時間だけでは討死にしない。
  const pressed = S.ls && near && F.foes.some((g) => g.units.some((u) =>
    u.alive && !u.gone && !u.dying && !u.noTarget && !u.woundOut && !u.rearWound &&
    Math.hypot(u.pos.x - F.nobuU.pos.x, u.pos.z - F.nobuU.pos.z) < 18 &&
    !rt.army.wallBetween(F.nobuU.pos, F.nobuU.team, u.pos) && !rt.army.terrainBlocks(F.nobuU.pos, u.pos)));
  if (pressed) S.overrun = (S.overrun || 0) + dt;
  const duel = meeting && S.bladesMet && S.clash >= 4 && rt.t - S.ls > 55;
  const overrun = S.standFought && S.overrun >= 45 && pressed && rt.t - S.ls > 90;
  if (near && S.near > 50 && (duel || overrun)) K.closeRing(rt);
}
