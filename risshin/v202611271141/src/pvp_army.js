// K590②（オンライン PvP・docs/online_final_1120.md 14〜20）4武将×1,000（4,000 vs 4,000）の遠景の大軍・クラウド k365-cloud-37（11/21）
//   近く（本人の武将の隊と斬り合う前線）は cloud-32 の受け持ち。ここは「ほかの武将の隊を遠目に大軍に見せる」所：
//   一武将の 1,000 を布陣の表（fujin_place.js）の行に直し、武将の前・左右・後ろに家の太い塊（本物の兵・幟の林）を並べる。
//   本物の兵だけ（K285）。携帯は塊が少人数でも、幟・塊の厚み・陣形の形で遠目に読める。急に現れない・旗だけ立たない（K470 の spawn_sight.js・blockFlagsTick）。
//   名目の数（1,000）は group.nominal に持つ（両軍の人数の札は名目で数える）。見える本物の数は端末の上限（realCapOf）の内で、近くの分を引いた残りを割り振る。
import { isTouch } from './touch.js';
import { FUJIN } from './fujin_layout.js';

// 兵の型（online_final_1120.md 70〜72）：遠景の塊の並びに効く分だけ。騎馬は cav（depth_reserve の騎馬武者）
export const PVP_TYPES = {
  標準: { cav: 0.1, blocks: ['前', '左', '右', '後'] },
  槍重視: { cav: 0.05, blocks: ['前', '前二', '左', '右'] },
  鉄砲重視: { cav: 0.05, blocks: ['前', '左', '右', '後'] },
  騎馬重視: { cav: 0.45, blocks: ['前', '左', '右'] },
  守備重視: { cav: 0.05, blocks: ['前', '左', '右', '後', '後二'] },
};
const NUM = { 前: '先手', 前二: '二の先手', 左: '左備', 右: '右備', 後: '後備', 後二: '二の後備' };
// 武将の陣の中心から、向き f で前 fw・横 lt の所
const at = (g, f, fw, lt) => ({ x: g.x + Math.sin(f) * fw + Math.cos(f) * lt, z: g.z + Math.cos(f) * fw - Math.sin(f) * lt });
const SLOT = { 前: [22, 0], 前二: [40, 0], 左: [4, -26], 右: [4, 26], 後: [-22, 0], 後二: [-40, 0] };

// roster：[{ name: '柴田勝家', side: 0|1, flag: 'kari', x, z, facing, type: '標準', nominal: 1000, mine: true }]（mine＝本人が動かす武将＝近くは cloud-32 の隊なので遠景を出さない）
// 返す物：fujin_place の表（{ deep, lazy, noboriAll, nbTouch, keep, rows }）。戦の定義の key に FUJIN として渡す（registerPvpFujin）
export function pvpFujinTable(roster, o = {}) {
  const rows = [];
  for (const g of roster) {
    if (g.mine && !o.withMine) continue;
    const T = PVP_TYPES[g.type] || PVP_TYPES.標準, f = g.facing || 0, nom = g.nominal || 1000;
    // 携帯は一武将の行を二つ（先手と一つ目の脇）に絞る：本物の上限 250 から近くの隊を引いた残りを 28 行に割ると一塊 3〜4 人で薄く、幟が兵の倍になった（三方ヶ原の野で 90秒：兵 68・幟 158）
    const BL = isTouch ? T.blocks.slice(0, 2) : T.blocks;
    const per = Math.round(nom / BL.length);
    for (const b of BL) {
      const [fw, lt] = SLOT[b], p = at(g, f, fw, lt);
      rows.push({
        key: `pvp_${g.side}_${g.name}_${b}`, name: `${g.name}の${NUM[b]}`, side: g.side, x: p.x, z: p.z, w: 26, d: 12, count: per, facing: f,
        flag: g.flag, armor: g.side ? 0x2a2622 : 0x2e2a26, row: `${g.name}（${nom}）`, leaders: [], cav: T.cav,
        blocks: [{ name: `${g.name}の${NUM[b]} 一` }, { name: `${g.name}の${NUM[b]} 二` }], ranks: 4, block: true,
        nominal: per, general: g.name, pvp: true,
      });
    }
  }
  return { deep: true, lazy: true, keep: true, noboriAll: true, idleFar: true, nbTouch: [3, 1], reachK: o.reachK || 1, rows };
}

// 名目の数（両軍の人数）：遠景の塊の nominal と、近くの隊（cloud-32）の名目を足す。戦の側が HUD の人数に使う
export function pvpNominal(roster) {
  const n = [0, 0];
  for (const g of roster) n[g.side ? 1 : 0] += g.nominal || 1000;
  return n;
}

// 携帯とパソコンで、遠景に回す本物の数の目安（近くの隊の分 near を引いた残り）。fujin_place は塊ごとに tN（携帯）・blockMax（パソコン）で立てる
export function pvpRealBudget(cap, near, rowsN) {
  const left = Math.max(0, cap - near);
  const per = rowsN ? Math.floor(left / (rowsN * 2)) : 0;   // 一行に塊二つ
  return { left, perBlock: Math.max(isTouch ? 3 : 8, Math.min(isTouch ? 12 : 44, per)) };
}

// 戦の定義の key に表を渡す（fujin_place.js の fujinFor が読む）
export function registerPvpFujin(key, roster, o = {}) {
  const T = pvpFujinTable(roster, o);
  if (o.cap != null) { const B = pvpRealBudget(o.cap, o.near || 0, T.rows.length); for (const r of T.rows) { r.tN = B.perBlock; r.blockMax = B.perBlock; } }
  FUJIN[key] = T;
  return T;
}

// 11/21 司令塔の決め：オンラインの遠い隊は cloud-32 の online/army4k.js の軽い大軍（world.addDistantArmy）で描き、80m で本物へ替える。
//   その軽い大軍の並び（people）をここで作る：型ごとの備の形（先手・左右・後ろ）と兵種の場所、家の幟の林が遠目に読めるように。
//   butai.js の _spawnLight で addDistantArmy({ ..., people: army4kPeople({...}) }) と渡す（people の時は携帯でも半分にされない＝ここで数を決める）
//   o：{ x, z, facing, type, mix（MIX4K の割合）, n（描く人数・携帯は 1,000 の三割ほど）, seed }
const PK = { ashigaru: 'spear', samurai: 'samurai', gun: 'gun', bow: 'bow', cavalry: 'rider' };
export function army4kPeople(o) {
  const T = PVP_TYPES[o.type] || PVP_TYPES.標準, f = o.facing || 0, n = Math.max(20, Math.round(o.n || (isTouch ? 300 : 600)));
  const mix = o.mix || { ashigaru: 0.45, samurai: 0.1, gun: 0.2, bow: 0.1, cavalry: 0.15 };
  let s = (o.seed || 7) * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const sx = Math.sin(f), cz = Math.cos(f), cx = Math.cos(f), sz = -Math.sin(f);
  const W = (fw, lt) => ({ x: o.x + sx * fw + cx * lt, z: o.z + cz * fw + sz * lt });
  // 兵種ごとの人数（旗持ちは塊ごとに十二人に一人を別に足す）
  const kinds = Object.entries(mix).map(([k, r]) => [k, Math.round(n * r)]).filter(([, c]) => c > 0);
  // 兵種の場所：鉄砲・弓は先手の前の列、騎馬は左右の脇、侍は武将の周り（中）、槍は先手と左右と後ろ
  const where = { gun: ['前'], bow: ['前'], cavalry: ['左', '右'], samurai: ['中'], ashigaru: T.blocks };
  const SL = { ...SLOT, 中: [0, 0] };
  const out = [], perBlock = {};
  for (const [k, c] of kinds) {
    const bl = (where[k] || T.blocks).filter((b) => b === '中' || T.blocks.includes(b) || k === 'cavalry');
    for (let i = 0; i < c; i++) { const b = bl[i % bl.length]; (perBlock[b] || (perBlock[b] = [])).push(k); }
  }
  for (const [b, list] of Object.entries(perBlock)) {
    const [fw0, lt0] = SL[b] || [0, 0];
    // 前の列に鉄砲・弓、次に槍、後ろに侍（塊の中の並び）。横は 1.3m・縦は 1.5m の間で、段は人数の平方根ほど
    list.sort((a, c) => ({ gun: 0, bow: 1, cavalry: 2, ashigaru: 3, samurai: 4 }[a] - { gun: 0, bow: 1, cavalry: 2, ashigaru: 3, samurai: 4 }[c]));
    const cols = Math.max(6, Math.round(Math.sqrt(list.length * 3))), gapX = list[0] === 'cavalry' ? 2.2 : 1.3, gapZ = list[0] === 'cavalry' ? 3 : 1.5;
    list.forEach((k, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const p = W(fw0 - r * gapZ + (rnd() - 0.5) * 0.5, lt0 + (c - (cols - 1) / 2) * gapX + (rnd() - 0.5) * 0.4);
      out.push({ x: p.x, z: p.z, facing: f, k: PK[k] || 'spear' });
    });
    // 幟の林：塊の後ろに家の幟持ち（十二人に一人・塊に二本から）
    const nb = Math.max(2, Math.round(list.length / 12)), rows = Math.ceil(list.length / cols);
    for (let j = 0; j < nb; j++) {
      const p = W(fw0 - rows * gapZ - 1.5 - (j % 2) * 1.2, lt0 + ((j + 0.5) / nb - 0.5) * cols * gapX * 0.9);
      out.push({ x: p.x, z: p.z, facing: f, k: 'banner' });
    }
  }
  return out;
}
