// ======================================================================
// 小牧・長久手 二　⑦の段「羽柴勢を退かせる」（12〜15分）
//   仏ヶ根で崩れた池田勢の落ち武者が、赤備えに追われて西の細ヶ根へ逃げる。主人公はその後ろについて追手を払いながら退く。
//   落ち武者が細ヶ根の堀の旗まで着く（か、時が経つ）と退き切った事になる。主人公一人が先に駆け抜けても締めない。
// ======================================================================
import { allyGroup } from '../bhelp.js';

// 終戦後は、遅れて予約の撤退命令や助けを求める声を出さない。
function laterSay(rt, delay, who, line, sec) {
  rt.after(delay, () => { if (!rt.flags.ending && !rt.over && rt.player?.u?.alive !== false && rt.flags.stage === 6) rt.say(who, line, sec); });
}

export function start(rt, K) {
  const F = rt.flags, P = rt.player.u.pos;
  // 池田の落ち武者（傷を負い、指物を捨てて逃げる）。主人公の少し西から細ヶ根へ
  F.ochi = allyGroup(rt, { name: '池田勢の落ち武者', fullStrength: true, anchor: { x: P.x - 8, z: P.z - 4 }, facing: -Math.PI / 2, width: 4, formation: 'column', aggro: 2, seekRange: 4, speed: 2.6, order: 'move', march: true, noAI: true, noRout: true, dmgMult: 0.5 },
    K.fl([{ type: 'samurai', n: 2, o: { flag: null } }, { type: 'ashigaru', n: 8, o: { flag: null } }], 'ageha'));
  F.ochi.dest = { x: K.EXIT.x + 6, z: K.EXIT.z };
  F.ochi.onArrive = (q) => { q.march = false; q.order = 'hold'; };
  for (const u of F.ochi.units) { u.hp = Math.min(u.hp, u.maxHp * 0.6); u.invuln = false; }
  F.ochiN0 = F.ochi.units.length;
  laterSay(rt, 4, '池田の足軽', 'お助けを……！　足が、もう……', 2.8);
  laterSay(rt, 18, '堀秀政', '細ヶ根で鉄砲を揃えて待つ！　生きておる者を連れて参れ！', 3.2);
  laterSay(rt, 40, '使番', '家康の本隊は追わず、小幡城へ引く様子にござる', 3.2);
}
// 退き切ったか（主人公が細ヶ根に着き、落ち武者も着くか散るか、時が経った）
function canChase(u, includeGone = false) {
  return (u.alive || (includeGone && u.gone && u.hp > 0)) && (includeGone || !u.gone) && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget;
}
function chasing(g) {
  return g && !g.routed && g.order !== 'retreat' && g.order !== 'flee' &&
    g.units.some((u) => canChase(u, true));
}
export function done(rt, K, atGoal, el) {
  const F = rt.flags;
  // 追手が迫った後は百五十秒で追撃を終える。まだ遠方の追手だけなら接近を待つ。
  // 時間だけで達成にせず、追手が実際に退く下知と、主人公の到着をそろえる。
  // 倒れたまま生きている追手や退いた組は、もう追えない。生存だけで接近を待つと退路で刻限まで止まる。
  // 遠方の片付けで消した健在の兵を、殿が討ち取った追手と取り違えない。
  const pursuitEnded = F.pursuit?.length && !F.pursuit.some(chasing);
  if (el >= 150 && (F.pursuitMet || pursuitEnded) && !F.pursuitClosed) {
    F.pursuitClosed = true;
    for (const g of F.waves) if (K.live(g)) {
      g.noAI = true; g.focus = null; g.order = 'retreat';
      g.dest = { x: 170, z: 60 }; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.watch = null; }
    }
    rt.say('使番', '赤備えが追撃をやめ、御旗山の方へ退いておりまする！', 3);
  }
  // 出しただけの追手が遠方に残っていても「追われて退いた」事にはしない。
  // 途中で迫った事は覚え、振り切った後に敵へ戻る必要は無くす。
  if (!F.pursuitMet) for (const g of F.pursuit || []) {
    if (chasing(g) && g.units.some((u) => canChase(u) && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 18)) {
      F.pursuitMet = true;
      break;
    }
  }
  // 兵の枠が埋まり追手を出せなかった回は、次の出現を待つ。追われずに達成させない。
  if (!atGoal || el < 110) return false;
  if (F.pursuitClosed) return true;
  if (!F.pursuit?.length) return false;
  // 堀の殿などが追手を全て討ち取った場合も退き切れる。
  if (!F.pursuitMet && !pursuitEnded) return false;
  const c = K.live(F.ochi) ? F.ochi.center() : null;
  return !c || Math.hypot(c.x - K.EXIT.x, c.z - K.EXIT.z) < 24 || el > 150;
}
// 生きているだけで遠くに残った兵を「細ヶ根まで連れて退いた」人数に入れない。
export function saved(rt, K) {
  let n = 0;
  for (const g of [rt.flags.men, rt.flags.ochi]) if (g) for (const u of g.units) {
    if (u.alive && !u.gone && Math.hypot(u.pos.x - K.EXIT.x, u.pos.z - K.EXIT.z) < 24) n++;
  }
  return n;
}
