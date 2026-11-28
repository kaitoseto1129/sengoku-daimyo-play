// K587 ⑪ 新しく始めた人の守り（docs/online_extra_1120.md 37〜39・11/27 クラウド25）
//   最初の20戦は初心者の列：相手を探す時、戦数が20未満の人には Bot か同じ初心者を当てる。
//   クライアントの側だけ：①相手探しに自分の戦数を乗せる（受け渡し所＝iMac②／27 の worker.js が組み分けに使える）
//   ②見つかった相手が古参（戦数20以上・戦数を持たない古い手を含む）なら、その相手とは戦わず Bot の相手で戦う
//   （ホームの印は要件書に無いので出さない・司令塔 11/27）
//   戦数は持ち物の箱（house.js の loadOnline/saveOnline）の pvpGames。対人の合戦を始めた時に一つ数える（Bot に回した時も同じ一戦）。
import { loadOnline, saveOnline } from './house.js';

export const NOVICE_GAMES = 20;
export const gamesOf = (o = loadOnline()) => Math.max(0, Math.floor(+(o?.pvpGames) || 0));
export const isNovice = (o = loadOnline()) => gamesOf(o) < NOVICE_GAMES;
export const leftOf = (o = loadOnline()) => Math.max(0, NOVICE_GAMES - gamesOf(o));

// 相手探しに渡す deck に、戦数と初心者の印を足す（古い受け渡し所は知らない欄を読まないだけ）
export function noviceDeck(deck, o = loadOnline()) {
  return { ...(deck || {}), games: gamesOf(o), novice: isNovice(o) };
}

// 見つかった相手と戦ってよいか。古参どうし・初心者どうしは良い。初心者に古参（戦数の無い古い手も古参と見る）は当てない
export function acceptFoe(found, o = loadOnline()) {
  if (!isNovice(o)) return true;
  const d = found?.foe?.deck || {};
  if (d.novice === true) return true;
  const g = +d.games;
  return Number.isFinite(g) && g < NOVICE_GAMES;
}

// 対人の合戦を一つ数える（始めた時。Bot に回した時も）
export function countGame() {
  const o = loadOnline();
  if (!o) return 0;
  o.pvpGames = gamesOf(o) + 1;
  saveOnline(o);
  return o.pvpGames;
}
