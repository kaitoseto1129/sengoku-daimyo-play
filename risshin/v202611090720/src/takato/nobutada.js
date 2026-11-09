// ======================================================================
// 高遠城　曲輪突破の段（6〜11分・docs/oda15_plan_1108.md 30「曲輪突破・激しい近接戦」）
// 三の丸を取った後：①西の搦手で中将様が塀際から下知する知らせ
// ②二の丸に残る守りの知らせ（元の守備隊と土橋の前で斬り合う）。
// 二の丸を取った後：本丸の門の前の近習の知らせ。元の本丸・はな・盛信の最期へつなぐ。
// 入れ方：b_takato.js で wrap(takato, K) を一度。def.onZoneFall を包む。K は GATE_NI・GATE_HON。
// ======================================================================
import { k15Off, k15Scenes } from '../oda15_kit.js';
import { start as honStart } from './honmaru.js';   // 本丸の段
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const fall = def.onZoneFall;
  def.onZoneFall = function (r, id, ...rest) {   // rest：先へ進める印（force）をそのまま渡す
    const F = r.flags, was = { san: F.sanFell, ni: F.niFell };
    const out = fall.call(this, r, id, ...rest);
    if (k15Off(r) || F.ending) return out;
    if (id === 'san' && !was.san && F.sanFell && !F.k15san) { F.k15san = true; sanStage(r, K); }
    if (id === 'ni' && !was.ni && F.niFell && !F.k15ni) { F.k15ni = true; niStage(r, K); }
    return out;
  };
}

function sanStage(rt, K) {
  const F = rt.flags;
  // 小山田昌成（昌行）は既存の二の丸の備えの将。同じ将と供を九人足さない。
  k15Scenes(rt, [
    [6, () => { rt.banner('中将様、自ら塀際へ', '西の搦手で「一度に乗り入れよ」と下知された'); sfx('horagai', 0.6); }],
    [4, () => rt.say('使番', '中将様が西の塀際へ出られた！　大手も遅れを取るな！', 4.5)],
    [5, () => rt.say('森長可', '総大将に先を越されては、森の名折れじゃ。二の丸へ押せ！', 4.5)],
    [8, () => {
      // 既存の二の丸の守りと戦う。時間だけで九人を足したり、門が開いたと知らせたりしない。
      rt.banner('二の丸の守り', '土橋の先には、なお城兵が残る');
      rt.say('足軽', '二の丸にも仁科の衆じゃ！　味方と土橋へ進め！', 3.5);
    }],
  ], null, () => F.niFell);
}

function niStage(rt, K) {
  const F = rt.flags, HON = K.GATE_HON;
  k15Scenes(rt, [
    [5, () => rt.say('使番', '本丸の仁科五郎、近習を集めて門を固めた。女子供まで刀を取ったと', 4.5)],
    [6, () => rt.banner('本丸の逆寄せ', '仁科の近習が、本丸の門の前で最後の槍をそろえる')],
  ], () => honStart(rt, K), () => F.ending);
}
