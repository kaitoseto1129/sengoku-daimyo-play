// 武将の手持ち・重複の守り・武将印と交換所・武将の試用（K587・オンライン PvP の P0）
// 11/21 クラウド k365-cloud-33。数は docs/gacha_price_1120.md（K588）、決まりは docs/online_extra_1120.md 31〜36・76 と docs/online_req_1120.md 52。
// 画面とガチャの本体（登用の抽選・天井・通貨）は別の係の物。ここは「手持ちの帳」と三つの決まりだけを持つ純粋な計算の部品で、描かず・保存の口（state.js）にも触らない。
//   手持ちの帳は呼ぶ側が保存する（JSON にそのまま入る形）。乱数は呼ぶ側が渡せる（試しで同じ結果を出すため）。
//
// 決まり（要件書の言葉のまま）：
//   ・重複は武将印へ：R 5・SR 25・SSR 100（11/24 格を四つに。前は A 15・S 40）。重複で PvP の強さの差は作らない（レベルを上げない）。
//   ・交換所：SR＝90・SSR＝400（前は A 50・S 150。SSR は交換所へ入る日まで出さない）。決めは docs/status/rarity_1124.md。
//   ・候補3人が全部持っている武将、が続くのを避ける：無料の登用は持っていない武将の出る率を少し上げる。
//     有料は一定回数で持っていない武将を保証する。
//   ・武将の試用：持っていない武将でも模擬合戦で試せる（手持ちには入れない・印も減らない）。

import { BUSHOU_ONLINE, normRank } from './bushou_online.js';
// 表は 27 の bushou_online.js 一つ（格は rank）。手持ちの帳は 27 の toyo_rules の登用の数（owned・seals）をそのまま使える（同じ形）
export const RARITIES = ['N', 'R', 'SR', 'SSR'];
export const DUP_SEALS = { N: 1, R: 5, SR: 25, SSR: 100 };    // 重複一人ぶんの武将印（持ち主はここ。toyo_rules の DUP_SEAL はこれを読む）
const rk = (b) => normRank(b.rank || b.rarity || b.rare);   // 前の名（A・S・SS）の札も新しい格で読む
export const EXCHANGE_COST = { SR: 90, SSR: 400 };          // 交換所で一人と替える印
export const FREE_UNOWNED_BOOST = 1.5;   // 無料の登用：持っていない武将の重みを一・五倍に（「少し上げる」）
export const PAID_UNOWNED_PITY = 3;
export const SS_DUP_PASS = 4;            // SSR の重複4回で好きな SSR 一人（gacha_price 20）：交換所に SSR が並ぶ札が一枚届く（値段は印400＝重複4回ぶん）      // 有料の登用：三組続けて候補が全部手持ちなら、次の組は一人を必ず手持ちに無い武将に

// 新しい手持ちの帳
export function newBank() {
  return { owned: {}, seals: 0, allDupRun: 0, ssOpen: false, log: [] };
}

// 武将一人の帳の中の数（0＝持っていない）
export function ownedCount(bank, id) { return bank.owned[id] || 0; }

// 登用で一人を得る。初めてなら手持ちへ、重複なら武将印へ替える（強さは上げない）
export function grant(bank, busho) {
  const id = busho.id;
  if (!bank.owned[id]) { bank.owned[id] = 1; (bank.log = bank.log || []).push({ k: 'new', id }); return { kind: 'new', seals: 0 }; }
  bank.owned[id]++;
  const s = DUP_SEALS[rk(busho)] ?? 0;
  bank.seals += s;
  if (rk(busho) === 'SSR') { bank.ssDup = (bank.ssDup || 0) + 1; if (bank.ssDup % SS_DUP_PASS === 0) bank.ssPass = (bank.ssPass || 0) + 1; }
  (bank.log = bank.log || []).push({ k: 'dup', id, seals: s });
  return { kind: 'dup', seals: s };
}

// 交換所に並ぶ武将（持っていない SR、SSR は ssOpen の時だけ）。値段つき
export function exchangeList(bank, roster = BUSHOU_ONLINE) {
  return roster
    .filter((b) => EXCHANGE_COST[rk(b)] != null && (rk(b) !== 'SSR' || bank.ssOpen || bank.ssPass > 0) && !bank.owned[b.id] && !b.noExchange)
    .map((b) => ({ id: b.id, name: b.name, house: b.house, rarity: rk(b), cost: EXCHANGE_COST[rk(b)], affordable: bank.seals >= EXCHANGE_COST[rk(b)] }));
}

// 交換所で一人と替える。足りない・並んでいない・既に持っている時は替えない（理由を返す）
export function exchange(bank, roster = BUSHOU_ONLINE, id) {
  const b = roster.find((q) => q.id === id);
  if (!b) return { ok: false, why: 'none' };
  const cost = EXCHANGE_COST[rk(b)];
  if (cost == null || b.noExchange || (rk(b) === 'SSR' && !bank.ssOpen && !(bank.ssPass > 0))) return { ok: false, why: 'notListed' };
  if (bank.owned[id]) return { ok: false, why: 'owned' };
  if (bank.seals < cost) return { ok: false, why: 'short', need: cost - bank.seals };
  bank.seals -= cost; bank.owned[id] = 1;
  if (rk(b) === 'SSR' && !bank.ssOpen) bank.ssPass--;   // 重複4回の札を使った
  (bank.log = bank.log || []).push({ k: 'exchange', id, cost });
  return { ok: true, cost };
}

// ---- K600 51〜53・93：交換所の品（外観・旗）と、運営で直す値の表 ----
//   値を直す所はこの KOUKAN だけ（武将＝格ごとの印・品＝一つずつの印）。品は一人用の『見た目の品』（cosmetics.js の id）と同じ物で、
//   交換すると城下と戦でそのまま着られる（画面の側が cosmetics.giftLook(look) を呼ぶ）。強さは変わらない。
//   絵は data-goods-art="<id>"（online/goods_art.js が描く。k600-ensyutsu が本物の絵に替える時はその関数を替える）
export const KOUKAN = {
  busho: EXCHANGE_COST,
  goods: [
    { id: 'g_hata_shu', look: 'hata_shu', kind: 'flag', name: '旗指物：朱の旗', cost: 60 },
    { id: 'g_hata_shiro', look: 'hata_shiro', kind: 'flag', name: '旗指物：白の旗', cost: 60 },
    { id: 'g_ashige', look: 'ashige', kind: 'horse', name: '馬の毛色：芦毛', cost: 90 },
    { id: 'g_aoge', look: 'aoge', kind: 'horse', name: '馬の毛色：青毛', cost: 90 },
    { id: 'g_mika', look: 'mika', kind: 'crest', name: '前立：三日月', cost: 120 },
    { id: 'g_tentsuki', look: 'tentsuki', kind: 'crest', name: '前立：天衝', cost: 120 },
    { id: 'g_nichi', look: 'nichi', kind: 'crest', name: '前立：日輪', cost: 120 },
    { id: 'g_kon', look: 'kon', kind: 'armor', name: '黒漆に紺糸威の具足', cost: 150 },
    { id: 'g_aka', look: 'aka', kind: 'armor', name: '朱漆の具足（赤備え）', cost: 200 },
    { id: 'g_kin', look: 'kin', kind: 'armor', name: '金箔押の具足', cost: 200 },
    { id: 'g_jin_hi', look: 'jin_hi', kind: 'coat', name: '陣羽織：猩々緋', cost: 160 },   // K586④ 陣羽織は交換所だけ
    { id: 'g_jin_kon', look: 'jin_kon', kind: 'coat', name: '陣羽織：紺羅紗', cost: 160 },
  ],
};
export const GOODS_KIND = { flag: '旗', horse: '外観（馬）', crest: '外観（前立）', armor: '外観（具足）', coat: '外観（陣羽織）' };
// 交換所に並ぶ品（持っている物は「持っている」）。owns(look)＝もう持っているか（cosmetics.owns を渡す。無ければ帳の goods だけで見る）
export function goodsList(bank, owns = null) {
  const got = new Set(bank.goods || []);
  return KOUKAN.goods.map((g) => ({ ...g, owned: got.has(g.id) || !!(owns && owns(g.look)), affordable: bank.seals >= g.cost }));
}
// 品と替える。足りない・持っている・無い品は替えない（理由を返す）
export function exchangeGoods(bank, id, owns = null) {
  const g = KOUKAN.goods.find((q) => q.id === id);
  if (!g) return { ok: false, why: 'none' };
  if ((bank.goods || []).includes(id) || (owns && owns(g.look))) return { ok: false, why: 'owned' };
  if (bank.seals < g.cost) return { ok: false, why: 'short', need: g.cost - bank.seals };
  bank.seals -= g.cost; (bank.goods = bank.goods || []).push(id);
  (bank.log = bank.log || []).push({ k: 'goods', id, cost: g.cost });
  return { ok: true, cost: g.cost, look: g.look };
}

// 重複の守り：抽選の重みを、持っているかどうかで変える。
//   pool：その枠（同じレア度）から選べる武将。free＝無料の登用。返り値は選ばれた武将。
//   有料で「候補が全部手持ち」の組が PAID_UNOWNED_PITY 回続いた後は、持っていない武将がいる限りそこから選ぶ。
export function pickWithGuard(bank, pool, { free = false, rand = Math.random, forceUnowned = false } = {}) {
  if (!pool.length) return null;
  const unowned = pool.filter((b) => !bank.owned[b.id]);
  if (forceUnowned && unowned.length) return unowned[Math.floor(rand() * unowned.length) % unowned.length];
  const w = pool.map((b) => (b.weight || 1) * (free && !bank.owned[b.id] ? FREE_UNOWNED_BOOST : 1));
  let sum = 0; for (const x of w) sum += x;
  let r = rand() * sum;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

// 3候補の一組を出す（レア度は呼ぶ側の抽選で決めて渡す：rarities＝['R','SR','SSR'] など。前の名も読み替える）。
//   同じ組の中で同じ武将は出さない。有料の組は、続けて全部手持ちだった回数を数えて守りを掛ける。
export function drawTrio(bank, roster, rarities, { free = false, rand = Math.random } = {}) {
  const guard = !free && (bank.allDupRun || 0) >= PAID_UNOWNED_PITY;
  const out = [], used = new Set();
  rarities.forEach((rar, i) => {
    const pool = roster.filter((b) => rk(b) === normRank(rar) && !used.has(b.id) && !b.notInGacha);
    // 守りは一組に一人だけ（一番目の候補）。それで「全部手持ち」が続く事は無くなる
    const b = pickWithGuard(bank, pool, { free, rand, forceUnowned: guard && i === 0 });
    if (b) { out.push(b); used.add(b.id); }
  });
  if (!free) bank.allDupRun = out.length && out.every((b) => bank.owned[b.id]) ? (bank.allDupRun || 0) + 1 : 0;
  return out;
}

// 確率の表示に添える字（重複の守りで一人ごとの率が動く事を隠さない。格の率は変わらない）
export const GUARD_NOTE = `重複の守り：無料の登用では、持っていない武将が持っている武将の${FREE_UNOWNED_BOOST}倍出やすくなります。有料の登用では、三人とも持っている武将の組が${PAID_UNOWNED_PITY}回続くと、次の組の一人は必ず持っていない武将です。どちらも格（R・SR・SSR）の率は変わりません。`;
export const SEAL_NOTE = `重なった武将は武将印になります（N ${DUP_SEALS.N}・R ${DUP_SEALS.R}・SR ${DUP_SEALS.SR}・SSR ${DUP_SEALS.SSR}）。交換所で SR ${EXCHANGE_COST.SR}・SSR ${EXCHANGE_COST.SSR}。SSR が${SS_DUP_PASS}回重なると、好きな SSR 一人と替えられます。`;

// 英語の時の同じ字（i18n_online.js が [日本語, 英語] の組で読む）
export const GUARD_NOTE_EN = `Duplicate guard: in free recruits, generals you do not own appear ${FREE_UNOWNED_BOOST} times as often as ones you own. In paid recruits, if ${PAID_UNOWNED_PITY} sets in a row show only generals you own, the next set always has one you do not own. The rarity odds (R, SR, SSR) do not change.`;
export const SEAL_NOTE_EN = `Duplicate generals become general seals (N ${DUP_SEALS.N}, R ${DUP_SEALS.R}, SR ${DUP_SEALS.SR}, SSR ${DUP_SEALS.SSR}). At the exchange: SR ${EXCHANGE_COST.SR}, SSR ${EXCHANGE_COST.SSR}. After ${SS_DUP_PASS} SSR duplicates, you can trade for any SSR you choose.`;

// 武将の試用：持っていない武将でも模擬合戦の編成に一時だけ入れる。手持ちにも印にも触らない。
//   返すのは模擬合戦の側が読む軽い札（trial＝true の印つき）。手持ちの武将はそのまま。
export function trialLoadout(bank, roster = BUSHOU_ONLINE, id, base = []) {
  const b = roster.find((q) => q.id === id);
  if (!b) return null;
  const owned = !!bank.owned[id];
  return { trial: !owned, busho: { ...b }, team: [{ ...b, trial: !owned }, ...base.filter((q) => q.id !== id)], keep: false };
}
