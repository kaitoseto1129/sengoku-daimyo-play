// ======================================================================
// 小谷城の戦い　時が来れば物語が進む保険（kaito 二5・十五分の構成）
// 分断の後・小丸・本丸の段は、主人公が曲輪の中に立って押さえると進む。迷って立てない時も、羽柴の手が先に取り付き、
// 刻限で次の段へ進める（主人公の手柄にはしない）。一つの戦が十五分ほどで締まるように。
// ======================================================================
const CUT_T = 170, KOMA_T = 150, HON_T = 180;

// def：小谷の定義（attackKoma・komaFall・castleFall を呼ぶ）
export function tick(rt, def) {
  const F = rt.flags;
  if (F.ending || rt.over || rt.t < (F.nagareAt || 0)) return;
  F.nagareAt = rt.t + 1;
  if (F.step === 3 && !F.komaAttack && rt.t - (F.stepT || 0) > CUT_T) {
    rt.say('先手組頭', '羽柴の先手が小丸の北木戸へ取り付いたぞ！　続け！', 3.5);
    def.attackKoma(rt);
  }
  if (F.komaAttack && !F.komaDown) {
    if (F.nagareKomaT === undefined) F.nagareKomaT = rt.t;
    if (rt.t - F.nagareKomaT > KOMA_T) {
      F.komaForce = true;
      rt.say('羽柴秀吉', '小丸は先手が押さえた！　尾根を南へ、本丸へ！', 3.5);
      def.komaFall(rt);
    }
  }
  if (F.honAttack && F.nagareHonT === undefined) F.nagareHonT = rt.t;   // F.honT は本丸に入るまで先へ送られるので、自分の時刻で測る
  if (F.honAttack && !F.fallen && rt.t - F.nagareHonT > HON_T) {
    F.honEntered = true;
    def.castleFall(rt);
  }
}
