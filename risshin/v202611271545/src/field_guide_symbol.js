// 行き先の旗・ついて行く人のひし形・攻める人の剣。表示だけに使う。
export const GUIDE_FLAG = 'M32 65V5H65L56 18L65 31H32';
export const GUIDE_PERSON = 'M40 8L60 32L40 56L20 32Z';
export const GUIDE_ENEMY = 'M8 6L23 12L55 48L63 41L69 47L61 55L73 68L66 74L54 62L46 69L40 63L47 55L9 19ZM72 6L65 19L33 55L40 63L34 69L26 62L14 74L7 68L19 55L11 47L17 41L25 48L57 12Z';
export function guideSymbol(rt, destination) {
  const unit = rt.hud?.actionGuideUnit || destination?.unit;
  if (rt.hud?.actionGuideUnit && unit.team !== rt.player.u.team) return GUIDE_ENEMY;
  return unit && !destination?.route ? unit.team === rt.player.u.team ? GUIDE_PERSON : GUIDE_ENEMY : GUIDE_FLAG;
}
