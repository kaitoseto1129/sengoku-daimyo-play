// K675 Sanae：nearestEnemy の篩（filter）で、よく使う形を作り置きにする。
//   前は呼ぶたびに (o) => !this.wallBetween(u.pos, -1, o.pos) の閉包を作り、兵ごと・毎コマ JSC（iPhone の WebKit）の山に閉包が生まれていた。
//   nearestEnemy は filter(o, u, army) で呼ぶので、ここの札は呼び手の u と army を引数で受ける（答えは前の閉包と同じ）
export const NE_OPEN = (o, u, army) => !army.wallBetween(u.pos, -1, o.pos);
export const NE_OPEN_TEAM = (o, u, army) => !army.wallBetween(u.pos, u.team, o.pos);
export const NE_STAND_OPEN = (o, u, army) => !o.fleeing && !army.wallBetween(u.pos, -1, o.pos);
export const NE_STAND_OPEN_TEAM = (o, u, army) => !o.fleeing && !army.wallBetween(u.pos, u.team, o.pos);
// 川に浅瀬（fords）があるか：前は walkable・steer などで呼ぶたびに (st) => st.fords?.length の閉包を作っていた（毎歩・兵ごと）
export const HAS_FORDS = (st) => st.fords?.length;
