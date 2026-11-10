// ======================================================================
// 本能寺の変　布陣図どおりの明智の厚み（docs/fujin/honnoji.md・docs/fujin_all_1109.md・kaito 11/9）
// 寺の中は本物の兵。寺を囲む明智一万三千は、築地の外の通りに軽い備（army_depth）で置く。どの備も自分からは寄せない（hold）。
// 寺は TERA（x −151〜−31・z −16〜104）。東が表門。ゲームの 1 はおよそ実の 1m。
// ======================================================================
export const HONNOJI_DEPTH = {
  A: { name: '明智', team: 1, facing: -Math.PI / 2, honjin: { x: -70, z: 150 }, mpu: 1, formation: '方円', terrain: 'road',
    flag: 'akechi', armor: 0x24221f, openAt: 99999, attrition: 0,
    sonae: [
      { id: 'hidemitsu', layer: 'sakite', wing: 'center', men: 3000, taisho: '明智秀満', at: { x: -6, z: 50 }, hold: true },
      { id: 'toshimitsu', layer: 'ichi', wing: 'left', men: 3000, taisho: '斎藤利三', at: { x: -90, z: -44 }, hold: true },
      { id: 'mitsutada', layer: 'ichi', wing: 'right', men: 2000, taisho: '明智光忠', at: { x: -8, z: -40 }, hold: true },
      { id: 'fujita', layer: 'ni', wing: 'left', men: 1000, taisho: '藤田伝五', at: { x: -178, z: 30 }, hold: true },
      { id: 'mizoo', layer: 'ni', wing: 'right', men: 1000, taisho: '溝尾茂朝', at: { x: -178, z: 96 }, hold: true },
      { id: 'honjin', layer: 'honjin', wing: 'center', men: 3000, taisho: '明智光秀', at: { x: -70, z: 150 }, hold: true },
    ] },
};
