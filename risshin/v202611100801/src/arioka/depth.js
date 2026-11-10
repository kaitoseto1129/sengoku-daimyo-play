// ======================================================================
// 有岡城の陣立ての表（docs/army_depth_howto.md の型。army_depth.js が厚み・順番投入・連鎖崩壊・本陣の危機を回す）
//   東（+x）が城の内、西（-x）が織田の囲み。本物の隊は bind で結ぶ（滝川の手・先手・後詰）。
//   織田：滝川の手（上臈塚の木戸）→ 丹羽長秀・蜂屋頼隆の手（木戸の南北の囲み）→ 二陣 → 滝川一益の本陣（西の陣）→ 後詰。
//     天正七年十月十五日、上臈塚から入ったのは滝川・丹羽・蜂屋の手（信長公記）。信忠は九月に尼崎へ向かい、信長は安土、秀吉は播磨、光秀は丹波にあり、置かない。
//   荒木：侍町の辻の備え（本物の隊）→ 本丸の荒木久左衛門（動かない）。
// ======================================================================
import { GATE, TOWN_X, HON_X, HON_CENTER_Z, CAMP } from '../castles/arioka.js';

const F = (...ks) => (rt) => { for (const k of ks) { const g = rt.flags[k]; if (g && g.count) return g; } return null; };
const D = (name) => (rt) => { const g = rt.flags.defenders?.get(name); return g && g.count ? g : null; };

export const DEPTH_ARIOKA = {
  A: { name: '織田', facing: Math.PI / 2, honjin: { x: CAMP.x - 150, z: GATE.z }, mpu: 4, formation: '長蛇', terrain: 'castle', flag: 'oda', armor: 0x1c1d22, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'taki', layer: 'sakite', wing: 'center', men: 600, taisho: '滝川一益', flag: 'takigawa', bind: F('taki') },
      { id: 'kuri', layer: 'ichi', wing: 'center', men: 300, taisho: '', flag: 'takigawa', bind: F('kuri') },
      { id: 'niwa', layer: 'ichi', wing: 'left', men: 1500, taisho: '丹羽長秀', flag: 'sujikai', at: { x: GATE.x - 46, z: GATE.z - 70 } },
      { id: 'hachiya', layer: 'ichi', wing: 'right', men: 1200, taisho: '蜂屋頼隆', flag: 'oda', at: { x: GATE.x - 46, z: GATE.z + 70 } },
      { id: 'aid', layer: 'ni', wing: 'center', men: 400, taisho: '', flag: 'takigawa', bind: F('aid') },
      { id: 'ni', layer: 'yobi', wing: 'center', men: 2000, taisho: '', at: { x: CAMP.x - 80, z: GATE.z + 20 } },
      { id: 'hon', layer: 'honjin', wing: 'center', men: 3000, taisho: '滝川一益', flag: 'takigawa', hold: true, at: { x: CAMP.x - 150, z: GATE.z } },
      { id: 'ato', layer: 'gozume', wing: 'center', men: 2000, taisho: '', hold: true, at: { x: CAMP.x - 230, z: GATE.z - 30 } },
    ] },
  B: { name: '荒木', facing: -Math.PI / 2, honjin: { x: HON_X, z: HON_CENTER_Z }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'maru', armor: 0x2a2622, openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'g1', layer: 'sakite', wing: 'center', men: 150, taisho: '', bind: F('g1') },
      { id: 'tsuji', layer: 'ichi', wing: 'center', men: 300, taisho: '', bind: D('辻を固める荒木勢') },
      { id: 'sei', layer: 'ni', wing: 'left', men: 200, taisho: '', bind: D('侍町から寄せ返す荒木勢') },
      { id: 'kyu', layer: 'yobi', wing: 'center', men: 400, taisho: '', bind: D('荒木久左衛門の手') },
      { id: 'hon', layer: 'honjin', wing: 'center', men: 1500, taisho: '荒木久左衛門', hold: true, at: { x: HON_X, z: HON_CENTER_Z } },
    ] },
  honjinView: { A: true, B: false },
};
