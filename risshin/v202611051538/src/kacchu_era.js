// 名のある武将の具足を戦の年で替える（出所は docs/bushou_look_1102.md）。
// 伝来品が作られた年より前の戦では、その品の立物・胴を着せない。形は今ある立物と胴の作りを使い回す（新しい形・材質は作らない）。
import { KACCHU } from './kacchu_data.js';

// [名, この年より前なら, 重ねる値]
const ERA = [
  // 歯朶の前立・南蛮胴具足（久能山東照宮）は関ヶ原（1600）の頃の物。それより前は伝来の水牛の脇立の兜と仏胴（kacchu_data の元の行）
  ['徳川家康', 1600, { crest: 'bull', plateDo: null, doStyle: 'hotoke' }],
];
const cache = new Map();
export function eraKacchu(name, year) {
  if (!name || !year) return null;
  for (const [n, y, v] of ERA) {
    if (n !== name || year >= y || !KACCHU[n]) continue;
    const key = n + '|' + y;
    if (!cache.has(key)) cache.set(key, { ...KACCHU[n], ...v });
    return cache.get(key);
  }
  return null;
}
