// 小谷城の刻限は進軍の知らせに使う。到着・交戦・占領の判定は飛ばさない。
import { allyGroup } from '../bhelp.js';
import { dress } from '../b_inabayama.js';
import { sfx } from '../audio.js';

const CUT_T = 170, KOMA_T = 150, HON_T = 180;
const RF_MAX = 4, RF_GAP = 55, RF_LOW = 18, CAP = 250, RF_SIZE = 12, RF_NOTICE = 30;

// 兵が空にならない（kaito 11/8 天王寺の声・全戦共通）：羽柴の先手が京極丸の下で削られて二三人になると、主人公が独りで囲まれて倒れた（11/9 bot）。
//   先手の生き残りが十八人を切ったら、谷から蜂須賀・前野らの後続の組が旗を立てて駆け上がる（法螺で予告。四組まで・本物の兵の上限を守る）
function reinforce(rt, ctx) {
  const F = rt.flags;
  if (!(F.step === 2 || F.step === 3) || (F.rfN || 0) >= RF_MAX || rt.t - (F.rfT ?? -99) < RF_GAP) return;
  let mine = 0, all = 0;
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) { all++; if (u.team === 0 && !u.isPlayer && !u.woundOut && !u.fleeing && (F.oda || []).includes(u.group)) mine++; }
  // 信長の供九人・新手二十一人と、お市一行六人は後から来る。その席も先に残す。
  // 一行が退場した後は席を戻す。登場の済んだ印は退場後も残る。
  const reserved = (F.nobuG ? 0 : 9) + (F.umaG ? 0 : 21) + (F.ichiOut ? 0 : 6);
  if (mine >= RF_LOW) { F.rfNoticeAt = undefined; return; }
  if (all + RF_SIZE + reserved > CAP) return;
  const name = ['蜂須賀の手', '前野の手', '羽柴の新手', '羽柴の新手'][F.rfN || 0];
  // 到着と同時に知らせず、法螺の後に谷から登ってくる間を置く。
  if (F.rfNoticeAt === undefined) {
    F.rfNoticeAt = rt.t;
    sfx('horagai', 0.5);
    rt.say('先手組頭', `${name}が谷から向かうぞ！　踏みとどまれ！`, 3);
    return;
  }
  if (rt.t - F.rfNoticeAt < RF_NOTICE) return;
  F.rfNoticeAt = undefined;
  F.rfN = (F.rfN || 0) + 1; F.rfT = rt.t;
  const at = ctx.from;
  const g = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name, anchor: { x: at.x, z: at.z }, facing: Math.atan2(ctx.to.x - at.x, ctx.to.z - at.z), order: 'path', width: 4, aggro: 14, seekRange: 30, noRout: true },
    dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 1 }], ctx.look));
  ctx.march(rt, g);
  g.speed = 4; g.defMult = 2.6; g.formation = 'column';
  g.onArrive = (q) => { q.order = 'attack'; };
  F.oda.push(g);
  rt.say('先手組頭', `${name}が谷から上がってきたぞ！`, 3);
}


export function tick(rt, ctx) {
  const F = rt.flags;
  if (F.ending || rt.over || rt.t < (F.nagareAt || 0)) return;
  F.nagareAt = rt.t + 1;
  if (ctx) reinforce(rt, ctx);
  if (F.step === 3 && !F.komaAttack && !F.nagareCutSaid && rt.t - (F.stepT || 0) > CUT_T) {
    F.nagareCutSaid = true;
    rt.say('先手組頭', '京極丸の内で反撃を退け、北木戸から小丸へ進むぞ！', 3.5);
  }
  if (F.komaAttack && !F.komaDown) {
    if (F.nagareKomaT === undefined) F.nagareKomaT = rt.t;
    if (!F.nagareKomaSaid && rt.t - F.nagareKomaT > KOMA_T) {
      F.nagareKomaSaid = true;
      rt.say('羽柴秀吉', '北木戸から小丸へ入れ！　内の守りを共に退けよ！', 3.5);
    }
  }
  if (F.honAttack && F.nagareHonT === undefined) F.nagareHonT = rt.t;
  if (F.honAttack && !F.fallen && !F.nagareHonSaid && rt.t - F.nagareHonT > HON_T) {
    F.nagareHonSaid = true;
    rt.say('羽柴秀吉', '尾根を南へ、本丸の北木戸から旗本を破れ！', 3.5);
  }
}
