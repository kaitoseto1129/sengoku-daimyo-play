// 小谷城の刻限は進軍の知らせに使う。到着・交戦・占領の判定は飛ばさない。
const CUT_T = 170, KOMA_T = 150, HON_T = 180;

export function tick(rt) {
  const F = rt.flags;
  if (F.ending || rt.over || rt.t < (F.nagareAt || 0)) return;
  F.nagareAt = rt.t + 1;
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
