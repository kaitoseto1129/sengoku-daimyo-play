// 稲生の五つの目標の字（右上の一行・目標の札・stages.js・goals5.js で同じ字を使う）
// 携帯で読める短さにし、場所と行動を残す。
//   美作守の止めは『信長公記』どおり信長なので、⑤は「追い詰めろ」（主人公の手柄にしない）
export const GOALS = [
  '川のそばで柴田兵を3人たおせ',
  '信長のそばで柴田の敵を止めろ',
  '稲生村の田で林の槍の列を破れ',   // 「先手」は共通の字の直しで「敵」に替わる
  '名塚への道で林の守りを破れ',
  '名塚への道で林美作守を追いつめろ',
];
// 主人公が自分の槍で働いた事（その段で討った数）。何もしないうちに済みの印を付けない（kaito crit 11/6・九2・十二3）
export const inouDid = (rt, stage, n) => ((rt.flags.ks || [])[stage] || 0) >= n;
// 案内は、今も刃を合わせられる敵本人にだけ付ける。
export const inouEnemyAlive = (u) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing && !u.invuln && !u.noTarget;
// 11/8 十五分の構成（docs/oda15_plan_1108.md の 1・prototype/src/inou/）：行軍・林の前衛・横槍の三つ
export const GOALS15 = {
  march: '街道で隊長について進め',
  van: '草むらの道で林の隊長をたおせ',
  flank: '小川の道から柴田の横をつけ',
  raid: '信長の後ろで林の敵を止めろ',
};
