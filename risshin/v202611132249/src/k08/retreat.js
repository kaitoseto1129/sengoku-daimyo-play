// 砦の塀を越えず、兵のいる側から開いた切れ目と北門を通す。
// 退路の形は共有し、毎コマ作り直さない。
const inside = [[0, -54], [0, -66], [0, -164]];
const east = [[28, -30], [20, -30], ...inside];
const west = [[-28, -30], [-20, -30], ...inside];
const outside = [[0, -164]];
export function retreatNorth(g) {
  g.fleePath = inside;
  for (const u of g.units) {
    u.perch = null;
    u.fleePath = u.pos.z < -58 ? outside : u.pos.x > 24 ? east : u.pos.x < -24 ? west : inside;
    u.fleePathIdx = 0;
  }
}
