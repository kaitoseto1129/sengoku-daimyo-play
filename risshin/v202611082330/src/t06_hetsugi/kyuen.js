// ======================================================================
// 戸次川　③の段（6〜12分）：釣り野伏せ → 自分の周りを防ぐ → 信親の隊を救いに行く（救えない）
//   a（伏せの始め・約一分半）：信親は西の新納勢へ斬り込んで離れ、本人の所へは豊久・家久の手が寄せる。行き先の▼は出さない
//   b：十河存保の討死の知らせ → 「信親様の隊が囲まれた」→ ▼は信親。着いて少しすると鈴木大膳が斬り込み（本体の lastStand）
//   c：信親の討死（本体の closeRing）→ ④へ
// 呼び方：install(rt, K)（本体の ambush の始め）・update(rt, K, el)・pin(rt)・sogoFall(rt, K)。
// ======================================================================
const live = (g) => g && g.count > 0;
const NOBU_SPOT = { x: -24, z: -104 };   // 信親が斬り込んで囲まれる所（西の林の縁）

export function install(rt, K) {
  const F = rt.flags, B = F.blk;
  F.s3 = { st: 0, near: 0 };
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
  if (!S || S.st < 1) return null;
  return F.nobuU?.alive ? F.nobuU.pos : NOBU_SPOT;
}

export function update(rt, K, el) {
  const F = rt.flags, S = F.s3, P = rt.player.u.pos;
  if (!S) return;
  if (S.st === 0 && el > 145) toB(rt, K);
  if (S.st < 1) return;
  const bEl = rt.t - S.tB;
  if (F.nobuU?.alive && Math.hypot(F.nobuU.pos.x - P.x, F.nobuU.pos.z - P.z) < 14) S.near += 0.25;
  // 着いて二十秒（来なくても九十秒）で鈴木大膳が斬り込む
  if (!S.ls && ((S.near > 20 && bEl > 90) || bEl > 130)) { S.ls = rt.t; K.lastStand(rt); }
  // 斬り結んで四十秒（来なくても百六十秒）で信親が討たれる
  if (S.ls && ((S.near > 50 && rt.t - S.ls > 55) || bEl > 185)) K.closeRing(rt);
}
