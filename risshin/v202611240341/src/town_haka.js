// ======================================================================
// 討ち死にした配下の墓（K308 要件74）：寺の墓所で、これまでの戦で討たれた組の者・供の名を見られる。行きたい人だけ（印も任務も出さない）。
//   名は戦の記録（G.journal の dead）から。参ると手を合わせるだけで、褒美は無い。
// ======================================================================
export function hakaSetup(rt, { at = { x: 54.3, z: -25 } } = {}) {
  const list = [];
  for (const j of rt.G.journal || []) for (const n of j.dead || []) list.push({ n, t: String(j.t || '').split('　').pop() });
  if (!list.length) return null;
  rt.addInteract('haka', at, '参る　討ち死にした者の墓', () => {
    if (rt.choice) return;
    const shown = list.slice(-6).reverse().map((d) => `${d.n}（${d.t}）`).join('・');
    const more = list.length > 6 ? `　ほか${list.length - 6}人` : '';
    rt.choose(`卒塔婆に名が書いてある。${shown}${more}`, [{ label: '手を合わせる' }], () => rt.say('', '手を合わせた。次の戦も、生きて戻る', 3), 30);
  }, { r: 2.6 });
  return list;
}
