// ======================================================================
// 本能寺の変　布陣図どおりの明智の厚み（docs/fujin/honnoji.md・docs/fujin_all_1109.md・kaito 11/9）
// 寺の中は本物の兵。寺を囲む明智一万三千は、築地の外の通りに軽い備（army_depth）で置く。どの備も自分からは寄せない（hold）。
// 寺は TERA（x −151〜−31・z −16〜104）。東が表門。ゲームの 1 はおよそ実の 1m。
// ======================================================================
export const HONNOJI_DEPTH = {
  A: { name: '明智', team: 1, facing: -Math.PI / 2, honjin: { x: -91, z: 117 }, mpu: 1, formation: '方円', terrain: 'road',
    flag: 'akechi', armor: 0x24221f, openAt: 99999, attrition: 0,
    sonae: [
      { id: 'hidemitsu', layer: 'sakite', wing: 'center', men: 3000, taisho: '明智秀満', at: { x: -6, z: 50 }, hold: true },
      { id: 'toshimitsu', layer: 'ichi', wing: 'left', men: 3000, taisho: '斎藤利三', at: { x: -90, z: -44 }, hold: true },
      // 11/19 クラウドさ（kaito_now 2）：布陣図『本隊 明智光秀 3,000 本能寺の南（四条）』。前は寺の西南の外 (-195,140) で本人から遠く、上限で本物が立たず南の通りが0人だった。
      //   南の通り（z117）に置き、備の並びの三つ目に（本物を立てる順は表の順。上限の前に四方へ一つずつ）
      // 11/20 クラウドわ（act bot 2350 ★★ 50秒『明智光秀の備 18人・重なり10組 (-97,118)』）：備の持ち場が本陣の陣幕（army_depth_view の jinmaku 14×10・当たりあり・D.honjin と同じ (-91,117)）の内で、
      //   兵が幕の内に押し込められ西の幕ぎわに重なっていた。本陣の幕は通りの真ん中に残し、本隊の兵は同じ南の通りの東隣（幕の外・表門の方）に立てる
      // 11/20 クラウドわ（描かずの足取り・前後の写真）：(-70,117) は表門の真ん前で、本人の組（四人）が門から十七m 出て、持ち場で待つだけの備を二十五秒で三十人とも斬り、五十秒には南の通りが0人になっていた。
      //   同じ南の通りの、陣幕の西隣（門から四十五m・組の寄る輪の外）に立てる
      { id: 'honjin', layer: 'honjin', wing: 'center', men: 3000, taisho: '明智光秀', at: { x: -116, z: 117 }, hold: true },
      { id: 'fujita', layer: 'ni', wing: 'left', men: 1000, taisho: '藤田伝五', at: { x: -178, z: 30 }, hold: true },
      { id: 'mitsutada', layer: 'ichi', wing: 'right', men: 2000, taisho: '明智光忠', at: { x: -8, z: -40 }, hold: true },
      { id: 'mizoo', layer: 'ni', wing: 'right', men: 1000, taisho: '溝尾茂朝', at: { x: -178, z: 96 }, hold: true },
    ] },
};
