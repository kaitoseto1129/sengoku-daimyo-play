// 行き先の旗・ついて行く人のひし形・攻める人の三角。表示だけに使う。
export const GUIDE_FLAG = 'M32 65V5H65L56 18L65 31H32';
export const GUIDE_PERSON = 'M40 8L60 32L40 56L20 32Z';
export const GUIDE_ENEMY = 'M18 15H62L40 58Z';
export function guideSymbol(rt, destination) {
  const unit = rt.hud?.actionGuideUnit || destination?.unit;
  return unit && !destination?.route ? unit.team === rt.player.u.team ? GUIDE_PERSON : GUIDE_ENEMY : GUIDE_FLAG;
}
