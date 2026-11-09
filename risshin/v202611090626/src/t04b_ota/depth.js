// 太田城の陣立て（docs/generals_toyo_toku_1108.md の 7）：城を輪に囲む羽柴の備。主役は築堤の軍団。
// 必須（秀長・中村一氏・仙石秀久）と出したい（小西行長・蜂須賀正勝・浅野長政）を堤の輪の外の四方に散らす。囲みは寄せない（hold）。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '羽柴', facing: Math.PI / 2, honjin: { x: -18, z: -104 }, mpu: 6, formation: '方円', terrain: 'plain', flag: 'toyotomi', armor: 0x282420, uma: 'fukube', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'hidenaga', layer: 'sakite', wing: 'center', men: 6000, taisho: '羽柴秀長', bind: F('friends') },
      { id: 'nakamura', layer: 'ichi', wing: 'right', men: 5000, taisho: '中村一氏', at: { x: 128, z: -44 }, hold: true },
      { id: 'konishi', layer: 'ichi', wing: 'right', men: 4000, taisho: '小西行長', flag: 'konishi', at: { x: 118, z: 92 }, hold: true },
      { id: 'asano', layer: 'ichi', wing: 'center', men: 4000, taisho: '浅野長政', flag: 'asano', at: { x: -8, z: 138 }, hold: true },
      { id: 'sengoku', layer: 'ichi', wing: 'left', men: 4000, taisho: '仙石秀久', at: { x: -130, z: 62 }, hold: true },
      { id: 'hachisuka', layer: 'ichi', wing: 'left', men: 5000, taisho: '蜂須賀正勝', flag: 'hachisuka', at: { x: -126, z: -72 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 10000, taisho: '羽柴秀吉', at: { x: -18, z: -126 }, hold: true },
      { id: 'konida', layer: 'konida', wing: 'center', men: 1500, at: { x: -60, z: -132 }, hold: true },
    ] },
  honjinView: { A: false },
};
