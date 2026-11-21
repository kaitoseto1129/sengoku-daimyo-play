// 諸大名戦（NPC）の家ごとの初勝利と挑戦（K603・docs/kaito_online_battle_1121.md 58〜67。iMac k598-tonya）。
//   NPC の褒美はオンラインより少なめ（銭・経験は match_reward.js の npcK＝六割・段位は動かない）。ここはその上に一度だけ付く物：
//   ・家ごとの初勝利：小判30＋称号（例 武田家 初勝利「甲斐を破る」）。どの難易度でも一度だけ。大量に配らない。
//   ・家ごとの挑戦：条件を満たして勝った時に一度だけ 銭＋称号＋旗（外観）。
//       武田＝本陣陥落で勝つ／島津＝釣り野伏を受けずに勝つ／織田＝鉄砲隊を5割以上残して勝つ／ほかの家＝本陣陥落で勝つ。
//   置き場はオンラインの箱（house.js の loadOnline/saveOnline）の npcHonors：{ paid:[試合の印], first:{家:日}, chal:{家:日}, titles:[称号の id], flags:[旗の id] }。
//   呼ぶ側（match_link.js の matchSettle。つないだ）：settleMatch の後、勝った諸大名戦だけ npcWinBonus(save, M, team, extra) を呼び、
//     返り値を r.npcBonus に入れて保存する。勝ち負けの札は npcBonusLines(r.npcBonus) の行を出す。extra.tacUsed＝rt.tactics.used（戦法の回数）。
export const FIRST_KOBAN = 30;
export const NPC_HOUSES = {
  oda: { name: '織田', title: '尾張を破る', titleEn: 'Breaker of Owari' },
  takeda: { name: '武田', title: '甲斐を破る', titleEn: 'Breaker of Kai' },
  uesugi: { name: '上杉', title: '越後を破る', titleEn: 'Breaker of Echigo' },
  tokugawa: { name: '徳川', title: '三河を破る', titleEn: 'Breaker of Mikawa' },
  mori: { name: '毛利', title: '安芸を破る', titleEn: 'Breaker of Aki' },
  shimazu: { name: '島津', title: '薩摩を破る', titleEn: 'Breaker of Satsuma' },
  date: { name: '伊達', title: '奥州を破る', titleEn: 'Breaker of Oshu' },
  hojo: { name: '北条', title: '相模を破る', titleEn: 'Breaker of Sagami' },
  toyotomi: { name: '豊臣', title: '天下人を破る', titleEn: 'Breaker of the Taiko' },
};
// 挑戦：test(M, team, extra) が true なら満たした。zeni は銭（matchBook.zeni）。flag は旗の外観の id（布陣・戦場の旗の係が読む）
const honjinWin = (M, team) => M?.result?.winner === team && M.result.why === 'honjin';
export function gunKeep(M, team) {   // 自分の側の鉄砲の兵がどれだけ残ったか（0〜1）。鉄砲の無い軍は null
  let all = 0, alive = 0;
  for (const s of M?.sonae || []) {
    if ((s.team ? 1 : 0) !== team) continue;
    const b = s.b || s, mix = b.mix || {}, tot = Object.values(mix).reduce((a, v) => a + (+v || 0), 0);
    const share = tot ? (+mix.gun || 0) / tot : 0;
    if (!share || !b.nominal) continue;
    const left = typeof b.aliveNominal === 'function' ? b.aliveNominal() : b.nominal - (b.lost || 0);
    all += b.nominal * share; alive += Math.max(0, left) * share;
  }
  return all ? alive / all : null;
}
const usedBy = (extra, team, id) => {
  const u = extra?.tacUsed; if (!u) return null;   // 分からない時は満たしたことにしない
  return +(u[`${team}:${id}`] || 0);
};
export const CHALLENGES = {
  takeda: { id: 'takeda_honjin', name: '武田を本陣陥落で倒す', zeni: 300, title: '赤備えを越えし者', flag: 'flag_takeda_honjin', test: (M, t) => honjinWin(M, t) },
  shimazu: { id: 'shimazu_notsuri', name: '島津を釣り野伏を受けずに倒す', zeni: 300, title: '釣り野伏を見破る', flag: 'flag_shimazu_notsuri', test: (M, t, x) => usedBy(x, 1 - t, 'tsurinobuse') === 0 },
  oda: { id: 'oda_gunkeep', name: '織田を鉄砲隊5割以上残して倒す', zeni: 300, title: '鉄砲の備え固し', flag: 'flag_oda_gunkeep', test: (M, t) => (gunKeep(M, t) ?? 0) >= 0.5 },
};
const chalOf = (house) => CHALLENGES[house] || (NPC_HOUSES[house] ? { id: `${house}_honjin`, name: `${NPC_HOUSES[house].name}を本陣陥落で倒す`, zeni: 300, title: `${NPC_HOUSES[house].name}の本陣を落とす`, flag: `flag_${house}_honjin`, test: (M, t) => honjinWin(M, t) } : null);
export const challengeOf = chalOf;

export function honorsOf(save) {
  const h = (save.npcHonors = save.npcHonors || {});
  h.paid ||= []; h.first ||= {}; h.chal ||= {}; h.titles ||= []; h.flags ||= [];
  return h;
}
// 家ごとの印（家選びの札に出す）：{ first: 初勝利済み, chal: 挑戦済み, chalName }
export function houseHonors(save, house) {
  const h = save?.npcHonors || {};
  return { first: !!h.first?.[house], chal: !!h.chal?.[house], chalName: chalOf(house)?.name || '' };
}
// 勝った諸大名戦に一度だけ。返す：{ house, first:{ koban, title }|null, chal:{ name, zeni, title, flag }|null } か null
export function npcWinBonus(save, M, team = 0, extra = {}) {
  const npc = M?.o?.npc, house = npc?.house;
  if (!save || !M?.id || !house || M.o?.practice || M.result?.winner !== team || !NPC_HOUSES[house]) return null;
  const h = honorsOf(save);
  if (h.paid.includes(M.id)) return null;
  h.paid.push(M.id); if (h.paid.length > 100) h.paid.splice(0, h.paid.length - 100);
  const day = new Date().toISOString().slice(0, 10), out = { house, first: null, chal: null };
  if (!h.first[house]) {
    h.first[house] = day;
    save.toyo = { ...(save.toyo || {}), kin: Math.max(0, Math.floor(save.toyo?.kin || 0)) + FIRST_KOBAN };
    const t = `first_${house}`; if (!h.titles.includes(t)) h.titles.push(t);
    out.first = { koban: FIRST_KOBAN, title: NPC_HOUSES[house].title };
  }
  const c = chalOf(house);
  if (c && !h.chal[house] && c.test(M, team, extra)) {
    h.chal[house] = day;
    save.matchBook = save.matchBook || { zeni: 0 }; save.matchBook.zeni = (save.matchBook.zeni || 0) + c.zeni;
    if (!h.titles.includes(c.id)) h.titles.push(c.id);
    if (!h.flags.includes(c.flag)) h.flags.push(c.flag);
    out.chal = { name: c.name, zeni: c.zeni, title: c.title, flag: c.flag };
  }
  return out.first || out.chal ? out : null;
}
// 称号の名（id から）
export function titleName(id, en = false) {
  if (id.startsWith('first_')) { const H = NPC_HOUSES[id.slice(6)]; return H ? (en ? H.titleEn : H.title) : id; }
  for (const k of Object.keys(NPC_HOUSES)) { const c = chalOf(k); if (c?.id === id) return c.title; }
  return id;
}
export const titlesOf = (save) => (save?.npcHonors?.titles || []).map((id) => ({ id, name: titleName(id) }));
// 勝ち負けの札に出す行（字は短く）
export function npcBonusLines(b, en = false) {
  if (!b) return [];
  const H = NPC_HOUSES[b.house] || { name: b.house };
  const L = [];
  if (b.first) L.push(en ? `First victory over ${b.house}: Koban +${b.first.koban} · Title "${H.titleEn}"` : `${H.name}家 初勝利　小判 +${b.first.koban}・称号「${b.first.title}」`);
  if (b.chal) L.push(en ? `Challenge cleared: coin +${b.chal.zeni} · new banner` : `挑戦達成　銭 +${b.chal.zeni}・称号「${b.chal.title}」・旗`);
  return L;
}
