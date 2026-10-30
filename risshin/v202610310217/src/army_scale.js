// 戦ごとの兵力の表（kaito 10/30 夜中「各戦の兵力が本当にいると感じる軍勢の多さ」）。
//   史料に出る両軍の数（概数・諸説の中ほど。遊びの補いで、厳密な復元ではない）から、遠くの軽い大軍の厚み（後詰めの層）を決める。
//   使い道は見せ物だけ：world_army.js の後詰め（armyHost）の人数と奥行き。戦の兵力の数・本物の兵・置き換え・bot には入れない。
//   各戦の b_*.js は何もしなくても、def.key（battleKey）からここの倍率が効く。新しい戦はこの表に一行足す。
import { MEM_TIGHT } from './settings.js';

// [味方の数, 敵の数]（その戦場に居た両軍。城の内外・後詰めを含む）
export const ARMY_STRENGTH = {
  inou: [700, 1700],              // 稲生は触らない（mini の作り直し）。倍率 1
  okehazama: [3000, 25000],
  moribe: [1500, 6000],
  sunomata: [3000, 6000],
  inabayama: [20000, 5000],
  mitsukuri: [50000, 3000],
  okawachi: [70000, 8000],
  kanegasaki: [30000, 20000],
  anegawa: [28000, 18000],
  nodafukushima: [40000, 13000],
  shiga: [3000, 30000],           // 宇佐山の森可成は千ほどで浅井・朝倉三万に囲まれる
  hieizan: [30000, 4000],
  mikatagahara: [11000, 27000],
  tonezaka: [30000, 20000],
  odani: [30000, 5000],
  nagashima: [80000, 60000],
  shitaragahara: [38000, 15000],  // 長篠・設楽原。武田の騎馬が次々と寄せる
  echizen: [40000, 20000],
  echizen_ikko: [30000, 10000],
  iwamura: [30000, 3000],
  tennoji: [3000, 15000],         // 天王寺砦は本願寺の一万五千に囲まれる（信長の後詰め三千）
  saika: [60000, 10000],
  tedorigawa: [30000, 25000],
  shigisan: [40000, 8000],
  kizugawa: [8000, 12000],
  miki: [7500, 8000],
  arioka: [50000, 10000],
  iga: [40000, 10000],
  tottori: [20000, 4000],
  takato: [50000, 3000],
  tano: [5000, 500],
  honnoji: [13000, 100],
};

const REF = 10000;   // この数（両軍の合計）で倍率 1。十倍で一番厚く
// 記憶が足りず実機で落ちた戦（mini 10/30 朝：小谷・設楽原・大河内）は増やさない
const KEEP = new Set(['inou', 'odani', 'shitaragahara', 'okawachi']);
// 両軍の合計から後詰めの厚みの倍率（1〜1.8）。携帯（MEM_TIGHT）は増やさない（mini 10/30：記憶と fps を前より増やさない）
export function armyScale(key) {
  const s = ARMY_STRENGTH[key];
  if (!s || KEEP.has(key) || MEM_TIGHT) return 1;
  const total = s[0] + s[1];
  const f = Math.max(1, Math.min(1.8, 1 + 0.8 * Math.log10(total / REF)));
  return f;
}
if (typeof window !== 'undefined') window.__armyScale = armyScale;
