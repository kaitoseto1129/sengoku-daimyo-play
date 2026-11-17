// 長篠城の陣立て（docs/fujin/nagashinojo.md・docs/army_depth_howto.md）
// 城の奥平勢およそ五百は本物の兵（籠城）。武田およそ一万五千が城を三方から囲む：北の大通寺山・北西の医王寺山（勝頼の本陣）・
// 西の寒狭川の向こうの有海原・南の宇連川の向こうの鳶ヶ巣山の砦。囲みの備は自分からは出ない（hold）。寄せは戦のファイルの本物の兵と遠景。
export const depth = {
  A: { name: '奥平', facing: Math.PI, honjin: { x: -14, z: 27 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'okudaira', armor: 0x24221f, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'okudaira', layer: 'honjin', wing: 'center', men: 500, taisho: '奥平信昌', at: { x: -14, z: 27 }, hold: true, show: false },   // 本物の籠城の兵が見せる
    ] },
  B: { name: '武田', facing: 0, honjin: { x: -30, z: -176 }, mpu: 4, formation: '鶴翼', terrain: 'mountain', flag: 'takeda', armor: 0x3a2622, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 3000, taisho: '武田勝頼', at: { x: -30, z: -184 }, hold: true },   // 医王寺山
      { id: 'nobutoyo', layer: 'ichi', wing: 'center', men: 2000, taisho: '武田信豊', at: { x: 34, z: -140 }, hold: true },   // 大通寺山
      { id: 'baba', layer: 'ichi', wing: 'left', men: 1500, taisho: '馬場信春', at: { x: 84, z: -122 }, hold: true },         // 大通寺山の東
      { id: 'ichijo', layer: 'ni', wing: 'right', men: 1500, taisho: '一条信龍', at: { x: -92, z: -138 }, hold: true },      // 北西
      { id: 'sanada', layer: 'ni', wing: 'right', men: 1500, taisho: '真田信綱', at: { x: -120, z: -96 }, hold: true },
      { id: 'yamagata', layer: 'sakite', wing: 'right', men: 2000, taisho: '山県昌景', at: { x: -150, z: -40 }, hold: true },   // 有海原（寒狭川の西）
      { id: 'naito', layer: 'ichi', wing: 'right', men: 1500, taisho: '内藤昌豊', at: { x: -172, z: 8 }, hold: true },
      { id: 'tobinosu', layer: 'yobi', wing: 'left', men: 1000, taisho: '武田信実', at: { x: 46, z: 132 }, hold: true },     // 鳶ヶ巣山の砦（宇連川の南）
    ] },
  honjinView: { A: false, B: false },   // 勝頼の陣幕は戦のファイル（camp）が作る
};
