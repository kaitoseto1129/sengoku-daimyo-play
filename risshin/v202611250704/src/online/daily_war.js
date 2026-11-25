// オンラインの毎日の理由（K637「オンラインの毎日の理由」・kaito 11/22 の10億円の道筋。Sanae 11/24）。
//   今ある諸大名戦（taisen_ui・npc_clans・npc_reward）の上に、遊ぶ理由を三つ足す。作り直さず、決まりを一つの置き場にまとめる：
//   ①日替わりの敵軍：曜日ごとに決まった敵（月 長篠の織田・火 川中島の上杉・水 関ヶ原の東軍…七日）。その日初めて勝つと 武将印。
//   ②歴史軍団への挑戦：史実の大名の軍を十（強さは一段〜十段）。一つずつ初めて勝つと 武将印と銭。段が高いほど多い。
//   ③週の題：登用の暦（toyo_calendar.js・K636）と同じ週で替わる小さな歴史の題（川中島週…）。題の敵に今週初めて勝つと 小判。
//   ④勝った時の報い：今ある通貨（武将印・銭・小判）の中で。荷は save.npcHonors.daily（state.js には触らない）。
//   描かない純粋な決まり。試し：?online=1&toyonow=2026-12-08 ／ node prototype/tools/daily_war_test.mjs
import { toyoNow, weekIndex, WEEKS, CAL_START } from './toyo_calendar.js';

// 戦場は taisen_ui の MAPS の id（heigen 平原・kawa 川と橋・sekigahara 関ヶ原・shitara 設楽原・kawanaka 川中島）。variant は npc_clans.js の編成の id
// level は難易度（shokyu 初級〜shura 修羅）。day は getDay()（0 日〜6 土）
export const DAILY = {
  1: { house: 'oda', variant: 'oda_1575', map: 'shitara', side: 'def', level: 'chukyu', name: '長篠の織田', en: 'Oda at Nagashino', hist: '1575 馬防柵と三千の鉄砲', histEn: '1575: palisades and volley fire' },
  2: { house: 'uesugi', variant: 'uesugi_a', map: 'kawanaka', side: null, level: 'chukyu', name: '川中島の上杉', en: 'Uesugi at Kawanakajima', hist: '1561 霧の中の八幡原', histEn: '1561: Hachimanbara in the fog' },
  3: { house: 'tokugawa', variant: 'tokugawa_b', map: 'sekigahara', side: null, level: 'chukyu', name: '関ヶ原の東軍', en: 'The Eastern army at Sekigahara', hist: '1600 徳川四天王', histEn: '1600: the Four Guardians' },
  4: { house: 'takeda', variant: 'takeda_a', map: 'heigen', side: null, level: 'chukyu', name: '三方ヶ原の武田', en: 'Takeda at Mikatagahara', hist: '1572 信玄の西上', histEn: '1572: Shingen marches west' },
  5: { house: 'mori', variant: 'mori_a', map: 'kawa', side: null, level: 'chukyu', name: '厳島の毛利', en: 'Mori at Itsukushima', hist: '1555 元就の奇襲', histEn: '1555: Motonari strikes by surprise' },
  6: { house: 'shimazu', variant: 'shimazu_a', map: 'heigen', side: null, level: 'chukyu', name: '耳川の島津', en: 'Shimazu at Mimikawa', hist: '1578 釣り野伏', histEn: '1578: the lure-and-ambush' },
  0: { house: 'date', variant: 'date_a', map: 'heigen', side: null, level: 'chukyu', name: '摺上原の伊達', en: 'Date at Suriagehara', hist: '1589 独眼竜の初陣', histEn: '1589: the one-eyed dragon' },
};
export const DAY_REWARD = { seals: 10 };

// 歴史軍団十（一段〜十段）。強さは兵を増やさず難易度（考える速さと読み）で上げる＝段に合わせて level を替える
export const LEGIONS = [
  { id: 'lg_mori1555', dan: 1, house: 'mori', variant: 'mori_a', map: 'kawa', year: 1555, name: '毛利元就の軍', en: 'Mori Motonari’s army' },
  { id: 'lg_oda1560', dan: 2, house: 'oda', variant: 'oda_1560', map: 'heigen', year: 1560, name: '織田信長の軍（桶狭間）', en: 'Oda Nobunaga’s army (Okehazama)' },
  { id: 'lg_uesugi1561', dan: 3, house: 'uesugi', variant: 'uesugi_a', map: 'kawanaka', year: 1561, name: '上杉謙信の軍', en: 'Uesugi Kenshin’s army' },
  { id: 'lg_takeda1572', dan: 4, house: 'takeda', variant: 'takeda_a', map: 'heigen', year: 1572, name: '武田信玄の軍', en: 'Takeda Shingen’s army' },
  { id: 'lg_tokugawa1575', dan: 5, house: 'tokugawa', variant: 'tokugawa_a', map: 'shitara', year: 1575, name: '徳川家康の三河勢', en: 'Tokugawa Ieyasu’s Mikawa army' },
  { id: 'lg_takeda1575', dan: 6, house: 'takeda', variant: 'takeda_b', map: 'shitara', year: 1575, name: '武田勝頼の軍', en: 'Takeda Katsuyori’s army' },
  { id: 'lg_oda1575', dan: 7, house: 'oda', variant: 'oda_1575', map: 'shitara', year: 1575, name: '織田の長篠の軍', en: 'Oda’s Nagashino army' },
  { id: 'lg_shimazu1584', dan: 8, house: 'shimazu', variant: 'shimazu_a', map: 'heigen', year: 1584, name: '島津四兄弟の軍', en: 'The four Shimazu brothers’ army' },
  { id: 'lg_oda1582', dan: 9, house: 'oda', variant: 'oda_1582', map: 'heigen', year: 1582, name: '織田信長の軍（本能寺の頃）', en: 'Oda Nobunaga’s army (Honnoji era)' },
  { id: 'lg_tokugawa1600', dan: 10, house: 'tokugawa', variant: 'tokugawa_b', map: 'sekigahara', year: 1600, name: '徳川四天王の軍', en: 'Tokugawa’s Four Guardians' },
];
export const levelOfDan = (dan) => (dan <= 2 ? 'shokyu' : dan <= 5 ? 'chukyu' : dan <= 8 ? 'jokyu' : 'shura');
export const legionReward = (dan) => ({ seals: 10 + dan * 5, zeni: dan * 100 });   // 一段 15・100 … 十段 60・1000
for (const L of LEGIONS) L.level = levelOfDan(L.dan);

// 週の題：登用の暦（K636）の第 n 週と同じ週に替わる。house の週は暦の家に寄せ、兵種・特別編の週は題だけ。敵は weekFoe
//   暦の WEEKS の順（織田・武田・上杉・鉄砲・桶狭間・伊達・徳川・姉川・騎馬・毛利・北条・島津と九州・賤ヶ岳・長宗我部・弓・真田…）に揃える
export const THEMES = [
  { name: '尾張の週', en: 'Owari week', house: 'oda', variant: 'oda_1560', map: 'heigen', hist: '織田信長が尾張を固めた頃', histEn: 'Nobunaga consolidates Owari' },
  { name: '川中島週', en: 'Kawanakajima week', house: 'takeda', variant: 'takeda_a', map: 'kawanaka', hist: '武田信玄と上杉謙信、霧の八幡原', histEn: 'Shingen and Kenshin in the fog' },
  { name: '川中島週・越後', en: 'Kawanakajima week: Echigo', house: 'uesugi', variant: 'uesugi_a', map: 'kawanaka', hist: '上杉謙信、妻女山から八幡原へ', histEn: 'Kenshin comes down to Hachimanbara' },
  { name: '鉄砲の週', en: 'Matchlock week', house: 'oda', variant: 'oda_1575', map: 'shitara', hist: '長篠、鉄砲が戦を変えた', histEn: 'Nagashino: guns change war' },
  { name: '桶狭間週', en: 'Okehazama week', house: 'oda', variant: 'oda_1560', map: 'heigen', hist: '1560 少数が大軍を破る', histEn: '1560: the few beat the many' },
  { name: '奥州の週', en: 'Oshu week', house: 'date', variant: 'date_a', map: 'heigen', hist: '独眼竜 伊達政宗の台頭', histEn: 'The rise of Date Masamune' },
  { name: '三河の週', en: 'Mikawa week', house: 'tokugawa', variant: 'tokugawa_a', map: 'shitara', hist: '徳川家康、堅い守りの三河武士', histEn: 'Ieyasu and his steadfast Mikawa men' },
  { name: '姉川週', en: 'Anegawa week', house: 'oda', variant: 'oda_1570', map: 'kawa', hist: '1570 浅井・朝倉と織田・徳川', histEn: '1570: Asai and Asakura vs Oda and Tokugawa' },
  { name: '騎馬の週', en: 'Cavalry week', house: 'takeda', variant: 'takeda_b', map: 'shitara', hist: '赤備えの騎馬、武田の軍', histEn: 'The red-armoured Takeda riders' },
  { name: '安芸の週', en: 'Aki week', house: 'mori', variant: 'mori_a', map: 'kawa', hist: '毛利元就、知略の中国', histEn: 'Motonari, master of stratagem' },
  { name: '関東の週', en: 'Kanto week', house: 'hojo', variant: 'hojo_a', map: 'heigen', hist: '北条氏康、小田原の守り', histEn: 'Hojo Ujiyasu and the Odawara defence' },
  { name: '九州の週', en: 'Kyushu week', house: 'shimazu', variant: 'shimazu_a', map: 'heigen', hist: '島津四兄弟と九州の統一', histEn: 'The Shimazu brothers unite Kyushu' },
  { name: '賤ヶ岳週', en: 'Shizugatake week', house: 'toyotomi', variant: 'toyotomi_a', map: 'heigen', hist: '1583 秀吉、天下へ', histEn: '1583: Hideyoshi reaches for the realm' },
  { name: '四国の週', en: 'Shikoku week', house: 'mori', variant: 'mori_b', map: 'kawa', hist: '長宗我部元親の四国と、中国の毛利', histEn: 'Chosokabe’s Shikoku and Mori’s Chugoku' },
  { name: '弓の週', en: 'Archer week', house: 'mori', variant: 'mori_b', map: 'kawa', hist: '弓の名手が並ぶ備え', histEn: 'Ranks of fine archers' },
  { name: '大坂の週', en: 'Osaka week', house: 'toyotomi', variant: 'toyotomi_b', map: 'heigen', hist: '真田信繁、最後の戦', histEn: 'Sanada Nobushige’s last battle' },
  { name: '東北の週', en: 'Tohoku week', house: 'date', variant: 'date_b', map: 'heigen', hist: '東北と関東の諸将', histEn: 'Warlords of Tohoku and Kanto' },
  { name: '九州と四国の週', en: 'Kyushu and Shikoku week', house: 'shimazu', variant: 'shimazu_b', map: 'heigen', hist: '九州と四国の諸将', histEn: 'Warlords of Kyushu and Shikoku' },
  { name: '畿内の週', en: 'Kinai week', house: 'oda', variant: 'oda_1570', map: 'kawa', hist: '畿内と中国の諸将', histEn: 'Warlords of Kinai and Chugoku' },
  { name: '大坂の陣の週', en: 'Osaka campaigns week', house: 'toyotomi', variant: 'toyotomi_b', map: 'heigen', hist: '大坂の陣と名将たち', histEn: 'The Osaka campaigns and their commanders' },
];
export const WEEK_REWARD = { kin: 20 };

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 暦の通しの週の番号（12/1 の週＝0）。12/1 より前は 0。20 週を過ぎても数え続け、題は回す
export function weekNo(now) {
  const t = toyoNow(now), [y, m, d] = CAL_START.split('-').map(Number), s = new Date(y, m - 1, d).getTime();
  return t.getTime() < s ? 0 : Math.floor(Math.round((t.getTime() - s) / 3600e3) / 168);
}
// 今日の敵軍：{ kind:'day', id:'d2026-12-08', day, ...DAILY[曜日] }
export function todayFoe(now) {
  const t = toyoNow(now), D = DAILY[t.getDay()];
  return { kind: 'day', id: 'd' + dayKey(t), day: t.getDay(), ...D, reward: DAY_REWARD };
}
// 七日ぶん（今日から。確かめ用）
export function sevenDays(now) {
  const t = toyoNow(now), out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(t); d.setDate(d.getDate() + i); out.push(todayFoe(d)); }
  return out;
}
// 今週の題：{ kind:'week', id:'w3', n, name, en, hist, ...敵, toyo:登用の暦の週の名（同じ週）, house }
// 第21週より先（暦が生んだ週）の題：暦の週の家に寄せた敵軍。NPC の軍が無い家は近い家の軍で
const FOE_OF = { oda: ['oda', 'oda_1582', 'heigen'], takeda: ['takeda', 'takeda_a', 'kawanaka'], uesugi: ['uesugi', 'uesugi_a', 'kawanaka'], tokugawa: ['tokugawa', 'tokugawa_a', 'shitara'], mori: ['mori', 'mori_a', 'kawa'], shimazu: ['shimazu', 'shimazu_a', 'heigen'], date: ['date', 'date_a', 'heigen'], hojo: ['hojo', 'hojo_a', 'heigen'], toyotomi: ['toyotomi', 'toyotomi_a', 'heigen'], asai: ['oda', 'oda_1570', 'kawa'], asakura: ['oda', 'oda_1570', 'kawa'], saito: ['oda', 'oda_1560', 'heigen'], imagawa: ['oda', 'oda_1560', 'heigen'], sanada: ['toyotomi', 'toyotomi_b', 'heigen'], chosokabe: ['mori', 'mori_b', 'kawa'], other: ['toyotomi', 'toyotomi_a', 'heigen'] };
function themeOf(k) {
  if (k < THEMES.length) return THEMES[k];
  const w = WEEKS[k]; if (!w) return THEMES[k % THEMES.length];
  const f = FOE_OF[w.house] || FOE_OF[w.arm === 'kiba' ? 'takeda' : w.arm === 'yumi' ? 'mori' : 'oda'] || FOE_OF.oda;
  const nm = String(w.name).replace(/^今週の登用 /, '').replace(/（復刻）$/, ''), en = String(w.en).replace(/^This week: /, '').replace(/ \(Rerun\)$/, '');
  return { name: nm + 'の週', en: en + ' week', house: f[0], variant: f[1], map: f[2], hist: nm + 'の武将たち', histEn: 'Commanders of ' + en };
}
// 今週の題：{ kind:'week', id:'w3', n, name, en, hist, ...敵, toyo:登用の暦の週の名（同じ週）, house }
//   第1〜21週は上の THEMES の通し、それより先は暦の週（toyo_calendar.js の WEEKS）の家に合わせる。暦の外へ出たら題を回す
export function weekTheme(now) {
  const n = weekNo(now), k = Math.min(n, WEEKS.length - 1), T = themeOf(n < WEEKS.length ? n : n % WEEKS.length), W = WEEKS[weekIndex(now)] || WEEKS[k] || null;
  return { kind: 'week', id: 'w' + n, n, ...T, level: 'chukyu', side: null, toyo: W ? W.name : '', toyoEn: W ? W.en : '', reward: WEEK_REWARD };
}
// 歴史軍団（一覧）。won は save から
export function legionList(save) {
  const w = save?.npcHonors?.daily?.legion || {};
  return LEGIONS.map((L) => ({ kind: 'legion', ...L, won: !!w[L.id], reward: legionReward(L.dan) }));
}

// ---- 勝った時の報い ----
const rec = (save) => { const h = (save.npcHonors = save.npcHonors || {}); h.daily = h.daily || {}; const d = h.daily; d.days ||= {}; d.weeks ||= {}; d.legion ||= {}; return d; };
function give(save, rw) {
  const out = {};
  if (rw.seals) {
    if (save.bank) save.bank.seals = (save.bank.seals || 0) + rw.seals;
    if (save.toyo) save.toyo.seals = save.bank ? save.bank.seals : (save.toyo.seals || 0) + rw.seals;
    out.seals = rw.seals;
  }
  if (rw.zeni) { save.matchBook = save.matchBook || { zeni: 0 }; save.matchBook.zeni = (save.matchBook.zeni || 0) + rw.zeni; out.zeni = rw.zeni; }
  if (rw.kin) { save.toyo = { ...(save.toyo || {}), kin: Math.max(0, Math.floor(save.toyo?.kin || 0)) + rw.kin }; out.kin = rw.kin; }
  return out;
}
// tag：戦を始める時に付けた { kind, id }。勝った時だけ呼ぶ。同じ日・週・軍団は一度だけ。返す：{ kind, id, name, got:{seals,zeni,kin} } か null
export function dailyWin(save, tag, now) {
  if (!save || !tag?.kind || !tag.id) return null;
  const d = rec(save);
  if (tag.kind === 'day') {
    const cur = todayFoe(now); if (tag.id !== cur.id || d.days[cur.id]) return null;
    d.days[cur.id] = 1; const ks = Object.keys(d.days); if (ks.length > 40) delete d.days[ks.sort()[0]];
    return { kind: 'day', id: cur.id, name: cur.name, en: cur.en, got: give(save, DAY_REWARD) };
  }
  if (tag.kind === 'week') {
    const cur = weekTheme(now); if (tag.id !== cur.id || d.weeks[cur.id]) return null;
    d.weeks[cur.id] = 1; const ks = Object.keys(d.weeks); if (ks.length > 40) delete d.weeks[ks[0]];
    return { kind: 'week', id: cur.id, name: cur.name, en: cur.en, got: give(save, WEEK_REWARD) };
  }
  if (tag.kind === 'legion') {
    const L = LEGIONS.find((x) => x.id === tag.id); if (!L || d.legion[L.id]) return null;
    d.legion[L.id] = dayKey(toyoNow(now));
    return { kind: 'legion', id: L.id, name: L.name, en: L.en, dan: L.dan, got: give(save, legionReward(L.dan)) };
  }
  return null;
}
// 勝ち札の行（字は短く）
export function dailyLines(r, en = false) {
  if (!r) return [];
  const g = r.got || {}, parts = [];
  if (g.seals) parts.push(en ? `Seals +${g.seals}` : `武将印 +${g.seals}`);
  if (g.zeni) parts.push(en ? `Coin +${g.zeni}` : `銭 +${g.zeni}`);
  if (g.kin) parts.push(en ? `Koban +${g.kin}` : `小判 +${g.kin}`);
  const head = r.kind === 'legion' ? (en ? `Legion rank ${r.dan}: ` : `歴史軍団 ${r.dan}段　`) : r.kind === 'week' ? (en ? 'This week’s theme: ' : '今週の題　') : (en ? 'Today’s foe: ' : '今日の敵軍　');
  return [head + parts.join(en ? ' · ' : '・')];
}

// ---- 七日の輪（N3・オンラインに入った日の褒美）----
//   登用の暦と同じ週（火曜 0 時で替わる）に、オンラインのホームを開いた日を数える。一日目〜六日目は 武将印（5・5・10・5・5・10）、
//   七日目（その週に七日とも入った時）は 小判 と「SR 以上の選択券」を一枚（登用の画面の券。券の使い方は toyo_rules の sSelect）。
//   休んだ日があっても今週の輪が止まるだけ（来週は一から・罰は無い）。登城帳（tojo.js・月の登城）とは別で、重ねて渡す。荷は save.npcHonors.daily.ring。
export const RING_DAYS = 7;
export const RING = [{ seals: 5 }, { seals: 5 }, { seals: 10 }, { seals: 5 }, { seals: 5 }, { seals: 10 }, { kin: 30, ticket: 'sSelect', seals: 20 }];
const dayOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// 今日入る：今日が今週で初めてなら一日ぶん進めて褒美を渡す。返す：{ n:今週の日数(1〜7), got:{seals,kin,ticket}, full } か null（今日はもう数えた）
export function ringCheckIn(save, now) {
  if (!save) return null;
  const d = rec(save), wk = weekNo(now), t = toyoNow(now), today = dayOf(t);
  let r = d.ring; if (!r || r.week !== wk) r = d.ring = { week: wk, days: [], got: 0 };
  if (r.days.includes(today)) return null;
  r.days.push(today);
  const n = r.days.length; if (n > RING_DAYS || r.got >= n) return null;
  r.got = n;
  const rw = RING[n - 1], got = give(save, { seals: rw.seals, kin: rw.kin });
  if (rw.ticket) { save.toyo = { ...(save.toyo || {}) }; save.toyo.tickets = { sSelect: 0, ssRandom: 0, ssSelect: 0, pickup: 0, ...(save.toyo.tickets || {}) }; save.toyo.tickets[rw.ticket]++; got.ticket = rw.ticket; }
  return { n, got, full: n === RING_DAYS };
}
export function ringView(save, now) {
  const r = save?.npcHonors?.daily?.ring, ok = r && r.week === weekNo(now);
  return { week: weekNo(now), n: ok ? r.days.length : 0, today: ok ? r.days.includes(dayOf(toyoNow(now))) : false };
}
