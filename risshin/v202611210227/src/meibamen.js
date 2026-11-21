// 名場面の合図（11/17 全戦の名場面・docs/evidence_cloud_1118/meibamen.md）
// 史実の一番の見せ場（寝返り・雨が上がる・一斉射・炎・赤備えの突撃など）が起きた瞬間を、音と曲と一言で分からせる共通の作り。
//   カメラは動かさない・黒い帯も出さない（kaito「カメラは勝手に回らない」）。字の札も足さない（Simple is the best）。
//   鳴らす物：法螺と太鼓（味方の側）か鐘（敵の側）・遠くの鬨・戦の曲を山場（climax）へ十二秒・一言の台詞（say の決まりで8秒に一度まで）。
// 使い方（戦の定義から）：meibamen(rt, 'kobayakawa', { who: '使番', say: '小早川が寝返った！', side: 'ally' })
//   同じ key は一つの戦で一度だけ。side は 'ally'（味方の追い風＝法螺と太鼓と鬨）か 'enemy'（味方の危機＝鐘と敵の鬨）。
import { sfx, musicAccent } from './audio.js';

export function meibamen(rt, key, o = {}) {
  if (!rt || rt.over) return false;
  const done = rt.meibaDone || (rt.meibaDone = new Set());
  if (done.has(key)) return false;
  done.add(key);
  const t = rt.t || 0;
  rt.meibaUntil = Math.max(rt.meibaUntil || 0, t + (o.hold ?? 12));   // battle.js の山場（climax）の判定に足す
  musicAccent();
  if (o.side === 'enemy') { sfx('kane', 0.9); rt.after?.(0.9, () => sfx('eshout', 0.7)); }
  else { sfx('horagai', 0.9); rt.after?.(0.6, () => sfx('taiko', 0.9)); rt.after?.(1.4, () => sfx('toki', 0.8)); }
  if (o.say) rt.after?.(o.sayDelay ?? 0.4, () => { if (!rt.over) rt.say(o.who || '使番', o.say, o.dur ?? 4); });
  return true;
}
