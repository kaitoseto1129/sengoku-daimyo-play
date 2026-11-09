// 一宮城の陣立て（docs/generals_toyo_toku_1108.md の 8）。総大将は秀長（秀吉と混同しない）。
// 本物の隊（蜂須賀正勝・黒田官兵衛・蜂須賀家政）に結び、秀次（岩倉・脇へ回る別働）・讃岐の宇喜多秀家と仙石秀久・
// 伊予の小早川隆景と吉川元長は遠くの別方面の軽い備にする（同時に四国を圧迫している）。どの備も自分から寄せない。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '羽柴', facing: 0, honjin: { x: 52, z: -176 }, mpu: 5, formation: '鶴翼', terrain: 'mountain', flag: 'toyotomi', armor: 0x2b2723, uma: 'fukube', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'masakatsu', layer: 'sakite', wing: 'left', men: 2000, taisho: '蜂須賀正勝', flag: 'hachisuka', bind: F('masakatsu') },
      { id: 'kanbei', layer: 'ichi', wing: 'left', men: 3000, taisho: '黒田官兵衛', flag: 'kuroda', bind: F('kanbei') },
      { id: 'iemasa', layer: 'ichi', wing: 'left', men: 3000, taisho: '蜂須賀家政', flag: 'hachisuka', bind: F('iemasa') },
      { id: 'ote', layer: 'ichi', wing: 'right', men: 15000, taisho: '', at: { x: 150, z: -10 }, hold: true },
      { id: 'hidetsugu', layer: 'ni', wing: 'right', men: 10000, taisho: '羽柴秀次', at: { x: 230, z: -120 }, hold: true },
      { id: 'ukita', layer: 'yobi', wing: 'left', men: 10000, taisho: '宇喜多秀家', flag: 'ukita', at: { x: -210, z: -220 }, hold: true },
      { id: 'sengoku', layer: 'yobi', wing: 'left', men: 3000, taisho: '仙石秀久', at: { x: -150, z: -250 }, hold: true },
      { id: 'kobayakawa', layer: 'gozume', wing: 'right', men: 15000, taisho: '小早川隆景', flag: 'kobayakawa', at: { x: 240, z: 160 }, hold: true },
      { id: 'kikkawa', layer: 'gozume', wing: 'right', men: 8000, taisho: '吉川元長', flag: 'mori', at: { x: 260, z: 90 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '羽柴秀長', at: { x: 52, z: -186 }, hold: true },
    ] },
  honjinView: { A: false },   // 秀長の本陣は戦のファイルが作る
};
