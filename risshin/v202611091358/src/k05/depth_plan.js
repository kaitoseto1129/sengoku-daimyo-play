// ======================================================================
// 第二次上田の陣立て表（共通の軍勢の厚み army_depth.js に渡す。書き方は docs/army_depth_howto.md）
//   docs/generals_toyo_toku_1108.md の 5：徳川 必須＝秀忠・榊原・大久保・真田信幸（父弟と敵）・仙石秀久・森忠政、
//   出したい＝本多忠政・酒井家次・奥平家昌・菅沼忠政・本多康重・牧野康成・戸田一西。真田 必須＝昌幸・信繁。
//   本物の兵の隊（本多の先手・大久保・牧野・榊原・秀忠の本陣、真田の旗本・信繁の手）は bind で結ぶ（描かない）。
//   ほかは神川の東の染屋台（本陣から百歩より奥）に hold で並ぶ（三万八千が城の小ささに足止めされる。城へは寄せない）。
//   信幸は戸石城を受け取りに出ている（北東の奥に六文銭の備。父と弟の城を遠くから見ている）。
//   向き：北が -z、東が +x。徳川は西（城）を向く。ゲームの 1 は実の 4m。
// ======================================================================
const F = (k) => (rt) => rt.flags[k];
export const DEPTH = {
  A: { name: '徳川', facing: -Math.PI / 2, honjin: { x: 168, z: 6 }, mpu: 4, formation: '魚鱗', flag: 'tokugawa', armor: 0x1c1a18, uma: 'ogi', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'honda', layer: 'sakite', wing: 'center', men: 1500, taisho: '本多忠政', flag: 'honda', bind: F('honda') },
      { id: 'okubo', layer: 'ichi', wing: 'left', men: 2500, taisho: '大久保忠隣', flag: 'okubo', bind: F('okubo') },
      { id: 'makino', layer: 'ichi', wing: 'right', men: 1500, taisho: '牧野康成', flag: 'kashiwa', bind: F('makino') },
      { id: 'saka', layer: 'ni', wing: 'center', men: 3000, taisho: '榊原康政', flag: 'sakakibara', bind: F('saka') },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '徳川秀忠', bind: F('hide') },
      { id: 'sengoku', layer: 'yobi', wing: 'left', men: 2000, taisho: '仙石秀久', flag: 'sashi:eiraku:#1d1b18:#ece6d6', hold: true, at: { x: 214, z: -112 } },
      { id: 'mori', layer: 'yobi', wing: 'right', men: 2500, taisho: '森忠政', flag: 'tsuru', hold: true, at: { x: 216, z: 112 } },
      { id: 'okudaira', layer: 'gozume', wing: 'left', men: 1500, taisho: '奥平家昌', flag: 'okudaira', hold: true, at: { x: 238, z: -142 } },
      { id: 'yasushige', layer: 'gozume', wing: 'right', men: 1500, taisho: '本多康重', flag: 'honda', hold: true, at: { x: 236, z: 146 } },
      { id: 'toda', layer: 'gozume', wing: 'center', men: 1200, taisho: '戸田一西', flag: 'maru', hold: true, at: { x: 232, z: 104 } },
      { id: 'nobuyuki', layer: 'gozume', wing: 'left', men: 800, taisho: '真田信幸', flag: 'sanada', hold: true, at: { x: 196, z: -214 } },
      { id: 'konida', layer: 'konida', wing: 'center', men: 1000, hold: true, at: { x: 238, z: 8 } },
    ] },
  B: { name: '真田', facing: Math.PI / 2, honjin: { x: -10, z: -30 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'sanada', armor: 0x1c1816, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'nobushige', layer: 'ichi', wing: 'left', men: 800, taisho: '真田信繁', flag: 'sanada', hold: true, bind: F('nobushige') },
      { id: 'masa', layer: 'hatamoto', wing: 'center', men: 1700, taisho: '真田昌幸', flag: 'sanada', hold: true, bind: F('masa') },
    ] },
  honjinView: { A: false, B: false },   // 本陣と城は戦のファイルが作る
};
