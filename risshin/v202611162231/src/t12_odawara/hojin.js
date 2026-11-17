// ======================================================================
// 小田原征伐　全国の大名の陣（docs/fujin/t12_odawara.md の「囲みの諸将」）
// kaito 11/9「布陣図通りの兵数・布陣を敷いて。全戦」。小田原は全国の大名の陣を地図どおりに。
// 徳川の受け持ち（東）は本物の隊と def.depth。ほかの諸将は軽い遠景の軍勢（addDistantArmy・farFill）で、
//   兵数の比どおりの大きさに見せる（百人を一人の目安、一隊は二百六十人まで）。陣幕と幟を添える。
// 地図は縮めてある（総構えは二里余りを三百歩ほど）。北の口は戦場の外に当たるので、総構えの北西の外の陣で見せる。
// 入れ方：b_t12_odawara.js の支度で place(rt, H) を一度呼ぶ。
// ======================================================================
import { flagTexture } from '../textures.js';
import { jinmaku, nobori } from '../props.js';

// [大将, 兵数（推定）, x, z, 向き先（城の方）, 旗]
export const HOJIN = [
  ['豊臣秀吉', 26000, -54, 104, 'toyotomi'],    // 石垣山（一夜城）。六月までは箱根湯本の早雲寺
  ['堀秀政', 8000, -46, 72, 'hori'],             // 石垣山の東の麓・海蔵寺のあたり（陣中で病死）
  ['小早川隆景', 8000, -96, 70, 'kobayakawa'],    // 堀の陣の西（池田輝政・吉川広家らと並ぶ）
  ['宇喜多秀家', 8000, -72, -22, 'ukita'],        // 西・早川口の外
  ['織田信雄', 15000, -76, -110, 'nobukatsu'],    // 北西の口の外
  ['羽柴秀次', 17000, -72, -166, 'toyotomi'],     // 北の口（蒲生氏郷・細川忠興らと）。戦場の北の外を代えて見せる
];

export function place(rt, H) {
  const W = rt.world;
  for (const [name, men, x, z, flag] of HOJIN) {
    const facing = Math.atan2(H.CASTLE.x - x, H.CASTLE.z - z);
    const count = Math.max(40, Math.min(260, Math.round(men / 100)));
    const w = Math.min(46, 14 + count * 0.12), d = Math.min(18, 8 + count * 0.04);
    W.addDistantArmy({ x, z, w, d, count, facing, team: 0, armor: 0x23211e, flagTex: flagTexture(flag), mon: flag, flag, kind: 'mixed', farFill: true, host: false, seed: 1590 + Math.round(x * 7 + z) });
    // 大将の陣（陣幕と幟）を軍勢の後ろに
    const bx = x - Math.sin(facing) * (d / 2 + 7), bz = z - Math.cos(facing) * (d / 2 + 7);
    rt.scene.add(jinmaku(W, bx, bz, 10, 8, 4, { mon: flag }));
    rt.scene.add(nobori(W, bx + 5, bz + 5, flag, 6)); rt.scene.add(nobori(W, bx - 5, bz + 5, flag, 6));
  }
}

// 開戦前の地図に出す名（陣の場所に大将の名）
export function places() {
  return HOJIN.map(([name, , x, z]) => ({ name, x, z }));
}
