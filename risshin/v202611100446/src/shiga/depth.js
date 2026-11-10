// shiga/depth.js … 志賀の陣・宇佐山の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_oda_1108.md の 11）
// 遠くの浅井・朝倉の大軍・本陣・尾根を回る一手は戦のファイル（addDistantArmy・camp・butai）がもう描くので、ここは本物の隊に結ぶだけ（描き足さない）。
// 結ぶと、備の状態・隊列維持度・順番投入・連鎖崩壊・使番が本物の隊にも効く。
// 織田（南）：森可成の手（先鋒）→ 信治の手・青地の手（第一線の左右）→ 信治の鉄砲組（第二線）→ 宇佐山城の守り・肥田の本丸守り（旗本）。
// 浅井・朝倉（北）：朝倉の先手 → 浅井の先手 → 正面の朝倉勢・山側の浅井勢（二の手）。
const F = (k) => (rt) => rt.flags[k];
const H = (i) => (rt) => rt.flags.twoHands?.[i];
export default {
  A: { name: '織田', facing: Math.PI, honjin: { x: -25, z: 110 }, mpu: 4, formation: '魚鱗', terrain: 'castle', flag: 'oda', armor: 0x302a25, openAt: 40, attrition: 0.002,
    sonae: [
      { id: 'mori', layer: 'sakite', wing: 'center', men: 400, taisho: '森可成', flag: 'tsuru', bind: F('mori') },
      { id: 'nobuharu', layer: 'ichi', wing: 'right', men: 250, taisho: '織田信治', flag: 'oda', bind: F('nobuharu') },
      { id: 'aochi', layer: 'ichi', wing: 'left', men: 200, taisho: '青地茂綱', bind: F('sakai') },
      { id: 'guns', layer: 'ni', wing: 'right', men: 100, taisho: '', flag: 'oda', hold: true, bind: F('guns') },
      { id: 'keep', layer: 'yobi', wing: 'center', men: 300, taisho: '', hold: true, bind: F('keep') },
      { id: 'hida', layer: 'hatamoto', wing: 'center', men: 200, taisho: '', hold: true, bind: F('hida') },
    ] },
  B: { name: '浅井・朝倉', facing: 0, honjin: { x: 70, z: -152 }, mpu: 4, formation: '鶴翼', terrain: 'plain', flag: 'asakura', armor: 0x302a25, openAt: 40, attrition: 0.003,
    sonae: [
      { id: 'asa1', layer: 'sakite', wing: 'right', men: 1500, taisho: '', flag: 'asakura', bind: F('w1') },
      { id: 'aza1', layer: 'sakite', wing: 'left', men: 1500, taisho: '', flag: 'azai', bind: F('w1b') },
      { id: 'asa2', layer: 'ichi', wing: 'right', men: 3000, taisho: '', flag: 'asakura', bind: H(0) },
      { id: 'aza2', layer: 'ichi', wing: 'left', men: 3000, taisho: '', flag: 'azai', bind: H(1) },
    ] },
  honjinView: { A: false, B: false },
};
