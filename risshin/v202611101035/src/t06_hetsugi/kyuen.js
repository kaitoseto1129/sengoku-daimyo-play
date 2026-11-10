// ======================================================================
// 戸次川　③の段（6〜12分）：釣り野伏せ → 自分の周りを防ぐ → 信親の隊を救いに行く（救えない）
//   a（伏せの始め）：信親は西の新納勢へ斬り込んで離れ、本人の所へは豊久・家久の手が寄せる。行き先の▼は防戦する河原
//   b：十河存保の討死の知らせ → 「信親様の隊が囲まれた」→ ▼は信親。着いて少しすると鈴木大膳が斬り込み（本体の lastStand）
//   c（11/9 夜 kaito）：元親の使番「信親を退かせろ」→ 横から新手 →「長宗我部元親を退かせろ」。本人は元親の所へ走り、
//     元親を浅瀬へ退かせる間に、振り返ると信親の旗が倒れる（本体の closeRing）→ ④へ。十河は④で殿として残る（別の死）
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
  rt.after(40, () => { if (F.step === 3 && !F.s3.st) rt.say('仙石の侍', '追え！……いや、止まれ！　立て直せ！', 2.6); });
  rt.after(58, () => { if (F.step === 3 && !F.s3.st) rt.say('使番', '後ろの浅瀬にも島津の手が回りました！', 2.8); });
  rt.after(76, () => { if (F.step === 3 && !F.s3.st) rt.say('土佐の足軽', '戻れ！　島津だ！', 2.4); });
}

function toB(rt, K) {
  const F = rt.flags, S = F.s3;
  S.st = 1; S.tB = rt.t;
  F.mText = '信親隊を救援せよ'; rt.obj('main', F.mText, 'main', true);
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
  if (S.st >= 3 || (S.st === 2 && S.motoOrdered)) return motoAt(rt);
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
  // 一度押し返した後、元親の使番と横からの新手 →「元親を退かせろ」。斬り結ぶ所を見届けたか、救援が長引いたら（詰まらない決まり）
  if (S.st === 1 && S.ls && ((meeting && near && S.bladesMet && S.clash >= 4 && S.near > 40 && rt.t - S.ls > 30) || (near && S.standFought && rt.t - S.ls > 100))) toMoto(rt, K);
  if (S.st === 2) {
    const m = motoAt(rt);
    if (S.motoOrdered && Math.hypot(P.x - m.x, P.z - m.z) < 12) { S.st = 3; S.tR = rt.t; retreatMoto(rt, K); }
  }
  // 元親と浅瀬へ退く間に、後ろで信親の旗が倒れる
  if (S.st === 3 && rt.t - S.tR > 12) K.closeRing(rt);
}

// 元親の居所（本物の旗本の将。いなければ塊）
function motoAt(rt) {
  const F = rt.flags, u = F.motoU;
  return u?.alive && !u.gone ? u.pos : { x: 4, z: -30 };
}

function toMoto(rt, K) {
  const F = rt.flags, S = F.s3;
  S.st = 2; S.tM = rt.t;
  rt.say('使番', '元親様より！　信親様を退かせよ！', 2.8);
  rt.after(3, () => rt.say('物見', '横から新手！　島津がまた来るぞ！', 2.6));
  rt.after(6, () => rt.say('長宗我部元親', '弥三郎！　離せ、わしは弥三郎のもとへ行く！', 3));
  rt.after(9.5, () => rt.say('長宗我部の老臣', '殿まで討たれては、長宗我部が絶えまする！', 3));
  rt.after(10, () => {
    if (F.step !== 3) return;
    S.motoOrdered = true;
    F.mText = '長宗我部元親を退かせろ'; rt.obj('main', F.mText, 'main', true);
    rt.unmark('nobu');
    rt.marker('moto', () => motoAt(rt), '長宗我部元親');
  });
  // 元親は信親の方へ馬を向けかけ、家臣に止められる（その場で踏みとどまる）
  if (F.moto?.count) { const g = F.moto; F.follow = F.follow.filter(([q]) => q !== g); g.order = 'hold'; g.aggro = 4; g.seekRange = 6; }
  // 横からの新手（信親の備の東へ）
  if (F.blk?.honjo) K.go(F.blk.honjo, { x: K.RING.x + 26, z: K.RING.z + 4 }, 3.2, { charge: true });
}

// 元親を北の口へ、そして浅瀬を南へ。本人は付き添い、振り返ると信親の旗が倒れる
function retreatMoto(rt, K) {
  const F = rt.flags, g = F.moto;
  rt.say('手勢の侍', '殿、元親様を川へ！', 2.4);
  if (g?.count) {
    g.order = 'move'; g.dest = { x: K.FORD.x - 4, z: -20 }; g.speed = 3.2; g.aggro = 4; g.seekRange = 4;
    g.onArrive = (q) => { q.order = 'move'; q.dest = { x: K.FORD.x - 4, z: 40 }; q.onArrive = (r) => { r.order = 'move'; r.dest = { x: K.CAMP.x + 20, z: K.CAMP.z + 20 }; r.onArrive = null; }; };
  }
}
