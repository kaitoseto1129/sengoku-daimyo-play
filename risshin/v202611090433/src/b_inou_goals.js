// 稲生の五つの目標の字（右上の一行・目標の札・stages.js・goals5.js で同じ字を使う）
// 11/6 crit_inou（kaito 三-1・十-1・十三-1）：地図で分かる場所の名（於多井川・稲生村・名塚）と人の名で。「倒せ」「崩す」「ここ」は使わない。
//   美作守の止めは『信長公記』どおり信長なので、⑤は「追い詰めろ」（主人公の手柄にしない）
export const GOALS = [
  '於多井川の岸で柴田の物見三人を討て',
  '信長の馬前で柴田勢を受け止めろ',
  '稲生村の田で林勢の槍の列を破れ',   // 「先手」は共通の字の直しで「敵」に替わる
  '名塚への田の道で美作守の旗本を破れ',
  '名塚への田の道で林美作守を追い詰めろ',
];
// 主人公が自分の槍で働いた事（その段で討った数）。何もしないうちに済みの印を付けない（kaito crit 11/6・九2・十二3）
export const inouDid = (rt, stage, n) => ((rt.flags.ks || [])[stage] || 0) >= n;
// 案内は、今も刃を合わせられる敵本人にだけ付ける。
export const inouEnemyAlive = (u) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing && !u.invuln && !u.noTarget;
// 11/8 十五分の構成（docs/oda15_plan_1108.md の 1・prototype/src/inou/）：行軍・林の前衛・横槍の三つ
export const GOALS15 = {
  march: '稲生の街道を組頭と北へ進め',
  van: '葦原の脇道で林勢の物頭を討て',
  flank: '小川沿いの畦から柴田勢の横を突け',
  raid: '信長の旗本の後ろで林勢の別手を止めろ',
};
