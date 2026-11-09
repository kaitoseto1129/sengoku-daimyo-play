// 樫井の陣立ての表（docs/army_depth_howto.md の型。army_depth.js が厚み・順番投入・連鎖崩壊・本陣の危機を回す）
//   北（−z）が貝塚・大坂、南（＋z）が紀州。浅野の本陣は川の南（6, 120）。本物の隊は bind で結ぶ。
//   浅野：殿（亀田）→ 村の備え（上田・浅野知近）→ 二陣 → 本陣の旗本 → 後備え・荷駄。
//   豊臣：塙・岡部の先手だけが突き出て、淡輪が続き、大野治房の後続は貝塚の側で動かない（台本が遅れて寄せる）。
const F = (...ks) => (rt) => { for (const k of ks) { const g = rt.flags[k]; if (g && g.count) return g; } return null; };
export const DEPTH12 = {
  A: { name: '浅野', facing: Math.PI, honjin: { x: 6, z: 120 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'asano', armor: 0x1c1e26, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'kame', layer: 'sakite', wing: 'center', men: 300, taisho: '亀田高綱', bind: F('kame') },
      { id: 'ueda', layer: 'ichi', wing: 'right', men: 700, taisho: '上田宗箇', bind: F('ueda') },
      { id: 'tomo', layer: 'ichi', wing: 'left', men: 700, taisho: '浅野知近', bind: F('tomo') },
      { id: 'ni', layer: 'ni', wing: 'center', men: 1200, taisho: '', at: { x: 4, z: -2 } },
      { id: 'ni2', layer: 'ni', wing: 'left', men: 600, taisho: '', at: { x: -34, z: 18 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 1000, taisho: '浅野長晟', bind: F('honjin') },
      { id: 'ato', layer: 'gozume', wing: 'center', men: 800, taisho: '', at: { x: -26, z: 150 } },
      { id: 'konida', layer: 'konida', wing: 'center', men: 300, at: { x: 30, z: 160 } },
    ] },
  B: { name: '豊臣', facing: 0, honjin: { x: 26, z: -220 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'toyotomi', armor: 0x2a2622, uma: 'fukube', openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'hana', layer: 'sakite', wing: 'center', men: 300, taisho: '塙団右衛門', bind: F('hana', 'hana1') },
      { id: 'oka', layer: 'sakite', wing: 'right', men: 300, taisho: '岡部則綱', bind: F('oka', 'oka1') },
      { id: 'awa', layer: 'ichi', wing: 'center', men: 200, taisho: '淡輪重政', bind: F('awa') },
      { id: 'harufusa', layer: 'hatamoto', wing: 'center', men: 3000, taisho: '大野治房', hold: true, at: { x: 26, z: -212 } },
      { id: 'harufusa2', layer: 'gozume', wing: 'left', men: 1500, taisho: '', hold: true, at: { x: -30, z: -218 } },
    ] },
  honjinView: { A: false, B: false },
};
