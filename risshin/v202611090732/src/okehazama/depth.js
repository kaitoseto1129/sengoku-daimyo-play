// 桶狭間の陣立ての表（docs/army_depth_howto.md の型・docs/generals_oda_1108.md の 2）。場所は戦の地図の向き（fieldPoint）で置く。
//   織田 二千足らず：組の列（本物）→ 信長と馬廻（本物・毛利新介・服部小平太）→ 谷の奥の本隊。善照寺に佐久間信盛、中島に後詰。
//   今川 本陣周辺六千：松井宗信の先手（本物）→ 前の備え（本物）→ 井伊直盛の備え（本物）→ 義元の旗本（本物）。
//   鷲津の朝比奈泰朝・鳴海城の岡部元信・大高城の松平元康は遠い持ち場に（出ない・本陣へ集めない）。
const G = (k, i) => (rt) => { let g = rt.flags[k]; if (Array.isArray(g)) g = g[i ?? 0]; return g && g.count ? g : null; };
export function depthOkehazama(rt) {
  const C = rt.flags.o15?.C;
  if (!C) return null;
  const P = C.fieldPoint, T = C.FIELD_TURN, far = C.FAR || {};
  return {
    A: { name: '織田', facing: Math.PI + T, honjin: P(-20, 60), mpu: 3, formation: '長蛇', terrain: 'valley', flag: 'oda', armor: 0x24221f, openAt: 9999, attrition: 0.002,
      sonae: [
        { id: 'kumi', layer: 'sakite', wing: 'center', men: 100, taisho: '', flag: 'oda', bind: G('cols', 2) },
        { id: 'kumi0', layer: 'ichi', wing: 'left', men: 100, taisho: '', flag: 'oda', bind: G('cols', 0) },
        { id: 'kumi1', layer: 'ichi', wing: 'right', men: 100, taisho: '', flag: 'oda', bind: G('cols', 1) },
        { id: 'nobu', layer: 'hatamoto', wing: 'center', men: 300, taisho: '織田信長', flag: 'eiraku', bind: G('nob') },
        ...(far.ZENSHOJI ? [{ id: 'zenshoji', layer: 'gozume', wing: 'left', men: 450, taisho: '佐久間信盛', flag: 'oda', hold: true, at: far.ZENSHOJI }] : []),
      ] },
    B: { name: '今川', facing: T, honjin: P(18, -116), mpu: 3, formation: '方円', terrain: 'mountain', flag: 'imagawa', armor: 0x3f2a24, openAt: 9999, attrition: 0.002,
      sonae: [
        { id: 'matsui', layer: 'sakite', wing: 'center', men: 600, taisho: '松井宗信', flag: 'imagawa', bind: G('road', 2) },
        { id: 'mae0', layer: 'ichi', wing: 'center', men: 500, taisho: '', flag: 'imagawa', bind: G('enemies', 0) },
        { id: 'mae1', layer: 'ichi', wing: 'right', men: 500, taisho: '', flag: 'imagawa', bind: G('enemies', 1) },
        { id: 'ii', layer: 'ni', wing: 'left', men: 500, taisho: '井伊直盛', flag: 'imagawa', bind: G('enemies', 2) },
        { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 300, taisho: '今川義元', flag: 'imagawa', bind: G('hatamoto') },
        ...(far.WASHIZU ? [{ id: 'asahina', layer: 'gozume', wing: 'left', men: 2000, taisho: '朝比奈泰朝', flag: 'imagawa', hold: true, at: far.WASHIZU }] : []),
        ...(far.NARUMI_JO ? [{ id: 'okabe', layer: 'gozume', wing: 'right', men: 700, taisho: '岡部元信', flag: 'imagawa', hold: true, at: far.NARUMI_JO }] : []),
        ...(far.ODAKA ? [{ id: 'motoyasu', layer: 'gozume', wing: 'left', men: 2500, taisho: '松平元康', flag: 'tokugawa', hold: true, at: far.ODAKA }] : []),
      ] },
    honjinView: { A: false, B: false },
  };
}
