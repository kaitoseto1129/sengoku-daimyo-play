// 鳥居強右衛門の脱出の陣立て（docs/fujin/sune.md・docs/army_depth_howto.md）。長篠城を囲む武田およそ一万五千（docs/fujin/nagashinojo.md と同じ大将）。
// 川べりの陣（焚き火と眠る兵）は戦のファイルの遠景。ここではその外の輪に、大将ごとの備を置く（夜なので動かない・hold）。
export const depth = {
  A: { name: '奥平', facing: Math.PI, honjin: { x: -70, z: -140 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'okudaira', armor: 0x24221f, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'okudaira', layer: 'honjin', wing: 'center', men: 500, taisho: '奥平信昌', at: { x: -70, z: -140 }, hold: true, show: false },   // 城の兵は遠景の旗が見せる
    ] },
  B: { name: '武田', facing: Math.PI, honjin: { x: 40, z: -196 }, mpu: 4, formation: '方円', terrain: 'river', flag: 'takeda', armor: 0x3a2622, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 3000, taisho: '武田勝頼', at: { x: 40, z: -196 }, hold: true },   // 医王寺山（本陣の陣幕の後ろ）
      { id: 'nobutoyo', layer: 'ichi', wing: 'left', men: 2000, taisho: '武田信豊', at: { x: 110, z: -100 }, hold: true },
      { id: 'baba', layer: 'ichi', wing: 'left', men: 1500, taisho: '馬場信春', at: { x: 120, z: -30 }, hold: true },
      { id: 'naito', layer: 'ni', wing: 'left', men: 1500, taisho: '内藤昌豊', at: { x: 112, z: 40 }, hold: true },
      { id: 'yamagata', layer: 'sakite', wing: 'right', men: 2000, taisho: '山県昌景', at: { x: -150, z: -116 }, hold: true },   // 城の西（有海原）
      { id: 'ichijo', layer: 'ichi', wing: 'right', men: 1500, taisho: '一条信龍', at: { x: -124, z: -60 }, hold: true },
      { id: 'sanada', layer: 'ni', wing: 'right', men: 1500, taisho: '真田信綱', at: { x: -120, z: 0 }, hold: true },
      { id: 'tobinosu', layer: 'yobi', wing: 'left', men: 1000, taisho: '武田信実', at: { x: 124, z: 122 }, hold: true },   // 鳶ヶ巣山の砦（南東の尾根）
    ] },
  honjinView: { A: false, B: false },   // 勝頼の陣幕は戦のファイル（camp）が作る
};
