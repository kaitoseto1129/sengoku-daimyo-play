// 鉄砲の筒の違い（K598 問屋・kaito 11/21「命中・重さ・装填・取り回しの違い。10倍の威力は禁止」）。
//   威力は三つとも同じ。違うのは散り（命中）・込めの秒（装填）・狙いが据わるまでの秒（取り回し）と重さ（字で見せるだけ）。
//   持ち主は G.gunKind（無ければ並筒）。player_ranged.js が撃つ時・込める時に読む。買う所は tonya_ui.js。
export const GUN_KINDS = {
  nami: { id: 'nami', item: 'teppo', name: '並筒', kg: 3.5, scatter: 1, reload: 1, handle: 1,
    note: '六匁玉の並の火縄銃。狙い・込め・重さの釣り合いが良い', stars: { aim: 3, weight: 3, load: 3, handle: 3 } },
  tan: { id: 'tan', item: 'gun_tan', name: '短筒', kg: 1.9, scatter: 1.35, reload: 0.85, handle: 0.65, cost: 24, minRank: 2,
    note: '筒の短い軽い鉄砲。すぐ構えられ込めも早いが、遠くでは散る', stars: { aim: 2, weight: 5, load: 4, handle: 5 } },
  shi: { id: 'shi', item: 'gun_shi', name: '士筒', kg: 6, scatter: 0.7, reload: 1.25, handle: 1.3, cost: 45, minRank: 3,
    note: '筒の長い重い鉄砲。遠くまでよく当たるが、込めと構えに手間がかかる', stars: { aim: 5, weight: 1, load: 2, handle: 2 } },
};
export function gunKindOf(G) {
  const k = GUN_KINDS[G?.gunKind];
  return k && (k.id === 'nami' || (G.owned || []).includes(k.item)) ? k : GUN_KINDS.nami;
}
