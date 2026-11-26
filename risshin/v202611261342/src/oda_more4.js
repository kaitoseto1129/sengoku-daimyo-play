// K674（11/26 クラウド Sonnet・一戦10任務）：大河内城・姉川に続きの段を足す（oda_more2.js の mkSpec・tokugawa_more.js の moreSteps）。
//   大河内：永禄十二年（1569）八月、信長は伊勢へ出陣し大河内城を囲む。北畠具教・具房は籠城し、城兵の夜討ちや兵糧取りの出撃があったと伝わる
//   （『信長公記』巻二。段の中身は遊び用の補い＝推）。和睦（十月三日）の前、南の鹿垣の段が済んだ所で入る。
//   姉川：浅井・朝倉が退いた後、小谷へ退く浅井の殿が追いを払った（『信長公記』巻三。段の中身は推）。
import { moreSteps } from './tokugawa_more.js';
import { mkSpec } from './oda_more2.js';

const AN = mkSpec('azai', [
  { r: ['織田の侍', '浅井は崩れた。だが小谷への道で、まだ踏み止まる者がおる|The Azai have broken. But some still hold the road to Odani.'] },
  { f: ['小谷への殿|Rearguard on the Odani road', '小谷へ退く浅井の殿が追いを払う|The Azai rearguard falling back to Odani turns on the pursuit', '小谷へ退く道で、追いを払う浅井の殿を討て|Cut down the Azai rearguard on the road back to Odani',
    '浅井の殿|Azai rearguard', ['浅井の侍', '殿を小谷へお入れするまで、ここは通さぬ！|Until our lord is inside Odani, you do not pass!'], ['織田の侍', '横の田からも来るぞ！|More from the paddies on the flank!', '田の浅井勢|Azai in the paddies'], [2, 9, 0, 0]] },
]);
AN.key = 'ending';
// 続きの段の間は、元の戦の update が「もう終わった」状態の持ち物を読んで落ちても、戦を止めない（oda_more2.js の guardUpdate と同じ）
const guard = (def, n) => {
  const u0 = def.update; if (u0) def.update = function (rt, dt) { if (rt.flags.k652m !== 'on') return u0.call(this, rt, dt); try { return u0.call(this, rt, dt); } catch (e) { return undefined; } };
  def.pacingCap = (def.pacingCap || 1080) + 100 * n;
};
export function anMore(def) { guard(def, 1); moreSteps(def, AN); }
