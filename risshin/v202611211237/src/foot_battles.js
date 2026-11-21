// 本人が下馬して徒歩で戦う戦（11/21 cloud-19・司令塔の決め①：身分3〈足軽大将〉から本人が騎乗で出ると、城・寺・砦の中へ攻め入る戦で
//   徒の組より先に一人で敵の中へ駆け込み囲まれて倒れた。根来寺は身分3で18回全部倒れ、馬に乗らないと3回とも達成。docs/status/rank_diff_c19.md）。
//   史実でも城・寺・砦の中の攻め・籠城の守りは下馬して戦う。野戦は騎乗のまま（騎馬の供が脇に付く：battle.js makeHorseTomo）。
//   戦の定義に noHorse・playerOnFoot があればそれが先。ここは城・寺・砦の中で戦うのに馬の印の無かった戦の表
import { BATTLES } from './state.js';

export const FOOT_IDS = new Set([
  // 織田家編：城・寺・砦の中・砦の守り
  'arioka', 'inabayama', 'nagashima', 'sunomata', 'takato', 'takato_siege',
  // 豊臣編：根来寺・太田城（水攻めの堤と城）・一宮城・小田原の総構え
  't04_negoro', 't04b_ota', 't05_ichinomiya', 't12_odawara',
  // 徳川編：伏見城の籠城・岐阜城・佐和山城・真田丸
  'k01_fushimi', 'k03_gifu', 'k07_sawayama', 'k11_sanadamaru',
  // 武田編：高天神城（二度目の打って出）・高遠城
  'd12_takatenjin2', 'd14_takato',
]);

// 今の戦が下馬の戦か（rt.def の印か、表の戦）
export function footBattle(rt) {
  const def = rt?.def || {};
  if (def.noHorse || def.playerOnFoot) return true;
  const id = def.id || BATTLES[rt?.index]?.id;
  return !!id && FOOT_IDS.has(id);
}
