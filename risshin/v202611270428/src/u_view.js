// K723 上杉編 u01〜u08 の見せ場：遠くに見える大軍と幟（軽い作り。本物の兵は増やさない）
//   使い方：uView(rt, [[x, z, 'uesugi'|'takeda'|'hojo', facing, count, w, d], …], [[x, z, 'takeda'], …幟])
import { nobori } from './props.js';
import { flagTexture } from './textures.js';
const ARMOR = { uesugi: 0x24221f, takeda: 0x502b24, hojo: 0x2a2f3a, kanto: 0x3a3a44 };
export function uView(rt, armies = [], banners = []) {
  const W = rt.world;
  armies.forEach(([x, z, flag, facing, count, w, d], i) => {
    if (!W.addDistantArmy) return;
    W.addDistantArmy({ x, z, w: w || 26, d: d || 12, count: count || 160, facing: facing || 0, armor: ARMOR[flag] ?? 0x333333,
      flagTex: flagTexture(flag === 'kanto' ? 'uesugi' : flag), flag: flag === 'kanto' ? 'uesugi' : flag, team: flag === 'takeda' || flag === 'hojo' ? 1 : 0, seed: 7230 + i });
  });
  for (const [x, z, flag] of banners) rt.scene.add(nobori(W, x, z, flag, 7));
}
