// 諏訪原城攻めの陣立て（docs/fujin/suwahara.md・docs/army_depth_howto.md）
// 徳川の囲み（大手・東西・搦手）と城兵の奥詰めは戦のファイルの遠景（farHost）が見せる。ここでは本物の隊に名と兵数を結ぶ。
// 家康の本陣は camp が見せるので、表は描かない（show: false）。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '徳川', facing: Math.PI, honjin: { x: 0, z: 128 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'tokugawa', armor: 0x24221f, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'okubo', layer: 'sakite', wing: 'center', men: 1000, taisho: '大久保忠世', flag: 'okubo', bind: F('okG') },
      { id: 'left', layer: 'ichi', wing: 'left', men: 800, taisho: '', bind: F('left') },
      { id: 'right', layer: 'ichi', wing: 'right', men: 800, taisho: '', bind: F('right') },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 3000, taisho: '徳川家康', at: { x: 0, z: 128 }, hold: true, show: false },
    ] },
  B: { name: '武田', facing: 0, honjin: { x: 2, z: -70 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'takeda', armor: 0x3a2622, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'uma', layer: 'sakite', wing: 'center', men: 100, taisho: '', bind: F('umaG') },
      { id: 'ote', layer: 'ichi', wing: 'center', men: 200, taisho: '', bind: F('wallG') },
      { id: 'hon', layer: 'honjin', wing: 'center', men: 400, taisho: '今福浄閑', bind: F('hon') },
    ] },
  honjinView: { A: false, B: false },
};
