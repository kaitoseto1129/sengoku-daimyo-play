// ======================================================================
// 設楽原の決戦　戦後の余韻（14〜15分）（docs/oda15_plan_1108.md 17・共通の追加要素5）
//   馬場信春の殿が崩れた後、すぐ結果へ行かない：逃げる武田勢は走り去り、鉄砲の音が減っていき、少し遅れて勝鬨を三度。
//   鬨が止むと、柵の前に倒れた旗と馬、遠くの鳶ヶ巣山の煙。家康と信長の使番の声、最後に低い法螺が一つ。
// 本体の nfEnd が install(rt) を呼び、rt.finish の待ちをこの長さ（約三十五秒）にする。
// ======================================================================
import { sfx } from '../audio.js';

export const LEN = 36;

export function install(rt) {
  const F = rt.flags;
  if (F.shYoin) return;
  F.shYoin = true;
  // 終戦後の通常の掛け声を止めたまま、この段で予定した声だけを通す。
  const say = (who, text, dur) => {
    F.shYoinVoice = true;
    try { rt.say(who, text, dur); } finally { F.shYoinVoice = false; }
  };
  // 逃げる敵は走る（歩いて去るとさびしい散歩に見える・kaito 11/8）
  for (const u of rt.army.units) if (u.team === 1 && u.alive) { u.fleeing = true; if (u.group) { u.group.speed = Math.max(u.group.speed || 3, 5.6); u.group.routed = true; } }
  for (const [t, v] of [[7, 0.9], [10.6, 1], [14.2, 1]]) {
    rt.after(t, () => {
      if (rt.over) return;
      try { rt.army.celebrate(rt.player.u.team); } catch (e) { /* なし */ }
      try { sfx('sig_eiei', v); } catch (e) { /* なし */ }
    });
  }
  rt.after(15, () => { if (!rt.over) say('使番', '徳川殿より、竹広の柵も守り切ったとの知らせ！', 3.4); });
  rt.after(17.5, () => { if (!rt.over) rt.banner('設楽原の決戦', '織田・徳川軍勝利'); });
  rt.after(19.5, () => { if (!rt.over) say('前田利家', '柵の前を見よ。武田の旗が、あれほど倒れておる', 3.6); });
  rt.after(24, () => { if (!rt.over) say('組頭', '……あれが天下の騎馬武者か。もう、あの旗が寄せて来ることはない', 3.8); });
  rt.after(28.5, () => { if (!rt.over) try { sfx('farHorn', 0.5); } catch (e) { /* なし */ } });
}
