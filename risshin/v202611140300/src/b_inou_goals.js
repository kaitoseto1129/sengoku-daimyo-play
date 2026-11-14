// 稲生の五つの目標の字（右上の一行・目標の札・stages.js・goals5.js で同じ字を使う）
// 携帯で読める短さにし、場所と行動を残す。
//   美作守の止めは『信長公記』どおり信長なので、⑤は「追い詰めろ」（主人公の手柄にしない）
export const GOALS = [
  '於多井川の岸で柴田の物見を3人討て',
  '信長のそばで柴田の敵を止めろ',
  '稲生村の田で林の槍の列を破れ',   // 「先手」は共通の字の直しで「敵」に替わる
  '名塚への道で林の守りを破れ',
  '名塚への道で林美作守を追い詰めろ',
];
// 主人公が自分の槍で働いた事（その段で討った数）。何もしないうちに済みの印を付けない（kaito crit 11/6・九2・十二3）
export const inouDid = (rt, stage, n) => ((rt.flags.ks || [])[stage] || 0) >= n;
// 案内は、今も刃を合わせられる敵本人にだけ付ける。
export const inouEnemyAlive = (u) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing && !u.group?.routing && !u.group?.routed && u.group?.order !== 'retreat' && !u.group?.inouRetiring && !u.invuln && !u.noTarget;
// 討たれる本人以外に、今も手柄の相手にできる兵がいるか。
// 退却中・手負いの生存者で最後の戦える一人の保護を外さない。
export const inouLastFighter = (groups, target) => !(groups || []).some((g) =>
  g.units.some((u) => u !== target && inouEnemyAlive(u)));
// 11/8 十五分の構成（docs/oda15_plan_1108.md の 1・prototype/src/inou/）：行軍・林の前衛・横槍の三つ
export const GOALS15 = {
  march: '稲生村の街道で組頭について進め',
  van: '葦原の脇道で林の物頭を討て',
  flank: '小川沿いの畦から柴田勢の横を突け',
  raid: '信長の後ろで林の敵を止めろ',
};
// 11/10 稲生の作り直し（docs/ino_spec_1109.md・b_inou_1109.js）：右上の一行は段ごとに一つ。名を呼ばれない足軽の任務
export const INO_GOALS = {
  march: '稲生村の街道で隊長についていけ',
  scout: '街道の敵の見張りをたおせ',
  van: '稲生原の前衛に合流せよ',
  hayashi: '稲生原で林の敵を押し返せ',
  join: '稲生原の佐久間隊へ合流せよ',
  shibata: '稲生原で柴田勢の前進を止めろ',
  retreat: '名塚砦まで退け',
  rally: '名塚砦の前で信長と向き直れ',
  push: '名塚砦の前で柴田勢を押し返せ',
  after: '稲生原の戦の跡を歩け',
};
// 隊長の討死後、佐久間隊に合流してから林勢との戦いへ戻る。
// 同じ任務の字でも、合流前と後を別の段として記録する。
export const INO_STEPS = ['march', 'scout', 'van', 'hayashi', 'join', 'hayashi', 'shibata', 'retreat', 'rally', 'push', 'after'];
export function inouStep(rt) {
  const F = rt.flags || {};
  return F.ph === 'hayashi' && F.joined ? 5 : Math.max(0, INO_STEPS.indexOf(F.ph));
}
