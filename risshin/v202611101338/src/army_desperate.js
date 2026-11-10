// 必死さ（全戦共通）：合戦は殺し合い。戦場の兵は棒立ちで遊ばず、目の前の敵へ向かい、味方を助けに入る。
// 速さは army_move.js の上限（人 約5m/秒・馬 約11.5m/秒）が正。ここは足さずに「止まって遊ぶ」を無くす。
const FOE_NEAR = 26;      // この内に敵がいれば「戦場の中」
const HELP_R = 9;         // 味方の斬り合いに加勢に入る距離
const FINISH_R = 6;       // 倒れた・よろけた相手へとどめに行く距離

export function desperateThink(army, u) {
  u._desp = false;
  if (u.isPlayer || u.civ || u.type === 'porter' || u.type === 'dummy' || u.fleeing || u.downed || u.woundOut || u.rearWound ||
      u.climb || u.perch || u.cover || u.bind || u.escort || u.pinT > army.time || u.noTarget || u.group.civ || u.group.peaceful ||
      u.group.people || u.group.hidden || u.group.ambush || u.group.guardOn || u.tower || u.mounted && u.group.cavShare > 0.1) return;
  const foe = army.nearestEnemy(u, FOE_NEAR);
  if (!foe) return;
  u._desp = true;                       // 近くに敵：手入れ・見回しの遊びを止め、腰を落として相手を見続ける（army_move の idleFx）
  u._despFoe = foe;
  u._despT = army.time;
  // 叫び：斬り合いに入る近くの兵が、ときどき声を上げる（荒い息と喚きは audio の shout・umeki）
  if (u.camD < 22 && army.time > (army._despShoutAt || 0) && army.time > (u._despShoutT || 0) && army.distTo(u, foe) < 5) {
    army._despShoutAt = army.time + 1.5;   // 全体で 1.5 秒に一声まで
    u._despShoutT = army.time + 8 + (u.id % 7);
    army.play(u.hp < u.maxHp * 0.4 ? 'umeki' : 'shout', u.pos, 0.35);
  }
  if (u.atk || u.swing || u.stagger > 0 || u.confused > 0) return;
  if (u.type === 'bow' || u.type === 'gun') return;
  // とどめ：倒れた・よろけた・深手の敵が近ければ、今の相手より先にそちらへ（逃がさず仕留める）
  const fin = army.nearestEnemy(u, FINISH_R, (o) => !o.isPlayer && !o.isStruct && (o.downed || o.stagger > 0.4 || o.hp < o.maxHp * 0.25) && army.crowdOk(u, o) && !army.wallBetween(u.pos, -1, o.pos));
  if (fin && fin !== u.target) { u.target = fin; u.aiT = Math.min(u.aiT || 0, 0.1); return; }
  if (u.target?.alive) return;
  if (u.group.order === 'hold' || u.group.signalFrom === 'hold') return;   // 号令で守る組は動かさない
  // 加勢：近くの味方が斬り合っていれば、その相手へ（倒れた味方を助けに入る）
  const close = army.nearestEnemy(u, HELP_R, (o) => !army.wallBetween(u.pos, -1, o.pos));
  if (close) { u.target = close; u.aiT = Math.min(u.aiT || 0, 0.1); return; }
  // 棒立ちにならない：遠くても敵へ詰める（歩きの速さのまま。走らせはしない）
  if (!u.moveTo && foe.pos) { u.moveTo = { x: foe.pos.x, z: foe.pos.z }; u.aiT = Math.min(u.aiT || 0, 0.4); }
}
