// 八尾・若江の陣立ての表（docs/army_depth_howto.md の型）。東（＋x）が徳川、西（−x）が大坂。北（−z）が若江、南（＋z）が八尾。
//   徳川：若江＝井伊の先手（川手）→ 庵原 → 安藤 → 井伊の二陣 → 直孝の旗本。八尾＝藤堂高刑・桑名 → 藤堂氏勝の鉄砲 → 二陣 → 高虎の旗本。
//     後ろの幕府軍（前田利常・松平忠直）は遠くに控えて出ない。
//   大坂：若江＝山口・内藤 → 木村の本隊 → 後備え。八尾＝長宗我部の先手・横の備（増田盛次）・堤の伏せ槍 → 二陣 → 盛親の旗本。
const F = (k) => (rt) => { const g = rt.flags[k]; return g && g.count ? g : null; };
export const DEPTH14 = {
  A: { name: '徳川', facing: -Math.PI / 2, honjin: { x: 122, z: -104 }, mpu: 12, formation: '雁行', terrain: 'marsh', flag: 'ii', armor: 0xa52b1c, openAt: 9999, attrition: 0.0025,
    sonae: [
      { id: 'saki', layer: 'sakite', wing: 'right', men: 600, taisho: '川手良列', flag: 'ii', bind: F('sakiG') },
      { id: 'ihara', layer: 'ichi', wing: 'right', men: 800, taisho: '庵原朝昌', flag: 'ii', bind: F('iharaG') },
      { id: 'ando', layer: 'ni', wing: 'right', men: 200, taisho: '安藤重勝', flag: 'ii', bind: F('andoG') },
      { id: 'ii2', layer: 'ni', wing: 'right', men: 1200, taisho: '', flag: 'ii', at: { x: 104, z: -78 } },
      { id: 'iihata', layer: 'hatamoto', wing: 'right', men: 600, taisho: '井伊直孝', flag: 'ii', bind: F('iiG') },
      { id: 'takanori', layer: 'sakite', wing: 'left', men: 1000, taisho: '藤堂高刑', flag: 'todo', armor: 0x24221f, bind: F('takanoriG') },
      { id: 'kuwana', layer: 'ichi', wing: 'left', men: 800, taisho: '桑名吉成', flag: 'todo', armor: 0x24221f, bind: F('kuwanaG') },
      { id: 'todogun', layer: 'ni', wing: 'left', men: 600, taisho: '藤堂氏勝', flag: 'todo', armor: 0x24221f, bind: F('todoGun') },
      { id: 'todo2', layer: 'ni', wing: 'left', men: 1500, taisho: '', flag: 'todo', armor: 0x24221f, at: { x: 104, z: 96 } },
      { id: 'todohata', layer: 'hatamoto', wing: 'left', men: 1000, taisho: '藤堂高虎', flag: 'todo', armor: 0x24221f, bind: F('todoG') },
      { id: 'maeda', layer: 'gozume', wing: 'left', men: 3000, taisho: '前田利常', flag: 'maeda', armor: 0x24221f, hold: true, at: { x: 214, z: 40 } },
      { id: 'tadanao', layer: 'gozume', wing: 'right', men: 3000, taisho: '松平忠直', flag: 'tokugawa', armor: 0x24221f, hold: true, at: { x: 214, z: -40 } },
    ] },
  B: { name: '大坂', facing: Math.PI / 2, honjin: { x: -84, z: 108 }, mpu: 12, formation: '鶴翼', terrain: 'marsh', flag: 'chosokabe', armor: 0x2a2622, openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'yama', layer: 'sakite', wing: 'left', men: 1000, taisho: '山口弘定', flag: 'toyotomi', bind: F('yamaG') },
      { id: 'naito', layer: 'sakite', wing: 'left', men: 1000, taisho: '内藤長秋', flag: 'toyotomi', bind: F('naitoG') },
      { id: 'kimura', layer: 'ichi', wing: 'left', men: 1500, taisho: '木村重成', flag: 'toyotomi', bind: F('kimuraG') },
      { id: 'kimura2', layer: 'ni', wing: 'left', men: 1200, taisho: '', flag: 'toyotomi', armor: 0x2c2a2a, at: { x: -44, z: -96 } },
      { id: 'masuda', layer: 'sakite', wing: 'center', men: 800, taisho: '増田盛次', bind: F('choSide') },
      { id: 'choA', layer: 'sakite', wing: 'right', men: 1500, taisho: '', bind: F('choA') },
      { id: 'fuse', layer: 'ichi', wing: 'right', men: 800, taisho: '', bind: F('fuseG') },
      { id: 'choso2', layer: 'ni', wing: 'right', men: 1500, taisho: '', at: { x: -112, z: 128 } },
      { id: 'chohata', layer: 'hatamoto', wing: 'right', men: 800, taisho: '長宗我部盛親', bind: F('choG') },
    ] },
  honjinView: { A: false, B: false },
};
