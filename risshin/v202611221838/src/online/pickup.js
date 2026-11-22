// 注目登用の表と背景（K600・docs/kaito_toyo_1121.md 42〜46・73〜74・92・100〜105・11/21 iMac k598-home）。
//   常設の登用とは別に、期間の注目（甲斐の虎・越後の龍・奥州の独眼竜）・週末の家の注目・催し（正月・周年・合戦の日）を表で持つ。
//   率と天井は toyo_rules.js（ここは率を変えない）。天井の数（st.pity・st.pickupPity）は登用の数の箱に一つだけなので、注目の期間が終わっても同じ種類の登用へそのまま引き継ぐ（92）。
//   目当て（46）：focus の中から st.target を選べる（toyo_screen.js の［目当ての武将］）。期間が替わっても目当てが次の注目の focus に居れば残る。
//   背景（104〜105）：注目の種類で替える。操作の位置は替えない（登用の画面の地の色だけを替える）。
//   使い方（online/index.js の toToyo）：const bn = currentBanner(); openToyo(host, { banner: bannerOpts(bn), ... }); applyBg(host, bn)
//   試す：?pickup=<id>（期間を問わずその注目を開く）

import { addEn } from '../i18n.js';
import { weekBanner, nextNotice, isOpen, WEEKS } from './toyo_calendar.js';   // K636：週ごとの暦と、解禁した武将だけの池

// 日付は 'YYYY-MM-DD'（その日を含む）か、毎年の 'MM-DD'。to が無ければ from の一日だけ。
//   kind：pickup＝期間の注目／house＝週末の家の注目（土日）／event＝催し（正月・周年・合戦の日）
//   rate：'event' なら催しの率（toyo_rules の freeEvent）。free：その日の無料登用の上乗せ（催しの時だけ・登用の係が読む）
export const BANNERS = [
  { id: 'kai_tora', kind: 'pickup', name: '甲斐の虎', en: 'Tiger of Kai', house: 'takeda', bg: 'kai', pickup: 'shingen', focus: ['shingen', 'masakage', 'nobuharu'], from: '2026-11-21', to: '2026-12-14' },
  { id: 'echigo_ryu', kind: 'pickup', name: '越後の龍', en: 'Dragon of Echigo', house: 'uesugi', bg: 'yuki', pickup: 'kenshin', focus: ['kenshin', 'kageie', 'kanetsugu'], from: '2026-12-15', to: '2026-12-28' },
  { id: 'oshu_ganryu', kind: 'pickup', name: '奥州の独眼竜', en: 'One-Eyed Dragon of Oshu', house: 'other', bg: 'oshu', pickup: 'masamune', focus: ['masamune'], from: '2027-01-08', to: '2027-01-21' },
  // 催し（100〜103）。誕生日でなく合戦の日
  { id: 'shogatsu', kind: 'event', name: '正月登用', en: 'New Year Recruiting', bg: 'shogatsu', pickup: 'nobunaga', focus: ['nobunaga', 'shingen', 'kenshin'], from: '01-01', to: '01-07', rate: 'event', free: 2 },
  { id: 'shunen', kind: 'event', name: '周年登用', en: 'Anniversary Recruiting', bg: 'shogatsu', pickup: null, focus: [], from: '2027-12-01', to: '2027-12-07', rate: 'event', free: 5, ssSelect: 1 },
  { id: 'okehazama_day', kind: 'event', name: '桶狭間登用', en: 'Okehazama Recruiting', house: 'oda', bg: 'base', pickup: 'nobunaga', focus: ['nobunaga', 'katsuie', 'toshiie'], from: '05-19', to: '05-25', rate: 'event' },
  { id: 'kawanakajima_day', kind: 'event', name: '川中島登用', en: 'Kawanakajima Recruiting', bg: 'kai', pickup: 'shingen', focus: ['shingen', 'kenshin'], from: '09-10', to: '09-14', rate: 'event' },
  { id: 'sekigahara_day', kind: 'event', name: '関ヶ原登用', en: 'Sekigahara Recruiting', bg: 'kiri', pickup: 'ieyasu', focus: ['ieyasu', 'yoshihiro', 'naomasa', 'sakon'], from: '09-15', to: '09-21', rate: 'event' },
];
// 週末の家の注目（73〜74）：土日に、週ごとに家を回す（限定ではなく常設の武将を前に出すだけ）
const HOUSE_WEEK = [
  { house: 'oda', name: '今週の登用 織田家', en: "This week: Oda", bg: 'base', pickup: 'nobunaga', focus: ['nobunaga', 'katsuie', 'mitsuhide'] },
  { house: 'takeda', name: '今週の登用 武田家', en: 'This week: Takeda', bg: 'kai', pickup: 'shingen', focus: ['shingen', 'masakage', 'masayuki'] },
  { house: 'uesugi', name: '今週の登用 上杉家', en: 'This week: Uesugi', bg: 'yuki', pickup: 'kenshin', focus: ['kenshin', 'kagekatsu', 'kanetsugu'] },
  { house: 'tokugawa', name: '今週の登用 徳川家', en: 'This week: Tokugawa', bg: 'base', pickup: 'ieyasu', focus: ['ieyasu', 'tadakatsu', 'naomasa'] },
  { house: 'mori', name: '今週の登用 毛利家', en: 'This week: Mori', bg: 'setouchi', pickup: 'motonari', focus: ['motonari', 'motoharu', 'takakage'] },
  { house: 'shimazu', name: '今週の登用 島津家', en: 'This week: Shimazu', bg: 'kyushu', pickup: 'yoshihisa', focus: ['yoshihisa', 'iehisa', 'yoshihiro'] },
];
// 英語の名（登用の画面が banner.name を出す時に訳す）
addEn([...BANNERS.map((b) => [b.name, b.en]), ...HOUSE_WEEK.map((h) => [h.name, h.en]), ...WEEKS.map((w) => [w.name, w.en]), [/^(\d+)月(\d+)日まで$/, (m) => `Until ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m[1] - 1]} ${m[2]}`]]);
export const JOSETSU = { id: 'josetsu', kind: 'josetsu', name: '武将登用', en: 'Recruiting', bg: 'base', pickup: null, focus: [] };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function inRange(b, d) {
  const day = ymd(d), md = day.slice(5);
  const f = b.from, t = b.to || b.from;
  if (f.length === 5) return f <= t ? md >= f && md <= t : md >= f || md <= t;   // 毎年（年をまたぐ枠も）
  return day >= f && day <= t;
}
// 今開いている枠（催し → 期間の注目 → 週末の家）。?pickup= で試す
export function activeBanners(now = new Date()) {
  const L = [];
  let q = null; try { q = new URLSearchParams(location.search).get('pickup'); } catch (e) { /* 試しの口が無くても */ }
  const forced = q && BANNERS.find((b) => b.id === q);
  if (forced) L.push(forced);
  for (const b of BANNERS) if (b !== forced && inRange(b, now)) L.push(b);
  // K636：12/1 からは週ごとの暦（toyo_calendar.js）の今週の登用を毎日出す。暦が尽きたら前の週末の家の回しへ戻る
  const wb = weekBanner(now);
  if (wb) { L.push(wb); return L; }
  const dow = now.getDay();
  if (dow === 0 || dow === 6) { const wk = Math.floor((Math.floor((now.getTime() - now.getTimezoneOffset() * 60e3) / 86400e3) + 3) / 7); /* 月曜始まりの週（土日は同じ家） */ const h = HOUSE_WEEK[wk % HOUSE_WEEK.length]; L.push({ id: 'house_' + h.house, kind: 'house', ...h }); }
  return L;
}
// 開く枠：選んだ id があればそれ、無ければ一番前の注目、どれも無ければ常設
export function currentBanner(id = null, now = new Date()) {
  const L = activeBanners(now);
  return (id && (L.find((b) => b.id === id) || (id === 'josetsu' ? JOSETSU : null))) || L[0] || JOSETSU;
}
// 登用の画面（toyo_screen.js の openToyo）へ渡す banner。st.target が focus に居れば目当てを残す
export function bannerOpts(b, st = null, extra = {}) {
  // K636：まだ解禁していない武将は目当てにも並べない。来週の予告（next）を一行で渡す。兵種の週は arm（候補をその兵種だけに）
  const focus = (b.focus || []).filter((id) => isOpen(id));
  const pickup = st?.target && focus.includes(st.target) ? st.target : b.pickup && isOpen(b.pickup) ? b.pickup : focus[0] || null;
  const nx = nextNotice();
  return { id: b.id, kind: b.kind, name: b.name, en: b.en, bg: b.bg, pickup, focus, event: b.rate === 'event', until: endOf(b), arm: b.arm || null, next: nx ? nx.text : null, nextEn: nx ? nx.en : null, ...extra };
}
// 終わりの日（'M月D日まで' に使う）。常設・週末は null
export function endOf(b, now = new Date()) {
  if (!b.to && !b.from) return null;
  const t = b.to || b.from;
  if (b.kind === 'house' && !b.week) return null;   // 週末の家は終わりを書かない（暦の週は火曜の前の日まで）
  const [m, d] = (t.length === 5 ? t : t.slice(5)).split('-').map(Number);
  return { m, d, label: `${m}月${d}日まで` };
}

// ---- 背景（104〜105）：甲斐の山・越後の雪・瀬戸内・九州の山・奥州の月・関ヶ原の霧・正月。キャンバスや画像を読まず、SVG の山並みと色だけ ----
const hills = (cols, ys, extra = '') => {
  const W = 1600, H = 900;
  const layers = ys.map((y, i) => {
    const amp = 120 - i * 30, n = 6 + i * 2;
    let p = `M0 ${H} L0 ${y}`;
    for (let k = 0; k <= n; k++) { const x = (W / n) * k; const yy = y - (k % 2 ? amp : amp * 0.35) * (1 - i * 0.15); p += ` L${x.toFixed(0)} ${yy.toFixed(0)}`; }
    return `<path d="${p} L${W} ${H}Z" fill="${cols[i]}"/>`;
  }).join('');
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMax slice'>${extra}${layers}</svg>`)}")`;
};
const BG = {
  base: null,
  kai: { sky: 'linear-gradient(180deg,#3a2414 0%,#6a3a1c 38%,#2a1a10 100%)', art: hills(['#3b2a1ccc', '#2a1d12ee', '#170f09'], [430, 560, 700], "<circle cx='1180' cy='260' r='70' fill='#d98a3a' opacity='.55'/>") },
  yuki: { sky: 'linear-gradient(180deg,#26313d 0%,#56677a 45%,#1c232b 100%)', art: hills(['#8c99a888', '#5d6a7acc', '#1c232b'], [420, 560, 710], "<g fill='#fff' opacity='.5'><circle cx='200' cy='120' r='3'/><circle cx='520' cy='220' r='2'/><circle cx='900' cy='90' r='3'/><circle cx='1300' cy='200' r='2'/><circle cx='1450' cy='80' r='3'/></g>") },
  setouchi: { sky: 'linear-gradient(180deg,#203040 0%,#406878 45%,#1a2a33 100%)', art: hills(['#2c4a52bb', '#1d3640dd', '#10202a'], [520, 640, 760], "<rect y='600' width='1600' height='300' fill='#2a5868' opacity='.5'/>") },
  kyushu: { sky: 'linear-gradient(180deg,#2a1a18 0%,#5a2e22 45%,#1a100d 100%)', art: hills(['#4a2a20cc', '#2e1a14ee', '#140b08'], [380, 560, 700], "<path d='M780 380 Q800 300 830 260' stroke='#8a7a70' stroke-width='18' fill='none' opacity='.35'/>") },
  oshu: { sky: 'linear-gradient(180deg,#0e1424 0%,#24304a 50%,#0c101a 100%)', art: hills(['#1e2a40cc', '#141c2cee', '#080b12'], [470, 600, 730], "<path d='M1200 140 a70 70 0 1 0 50 120 a56 56 0 1 1 -50 -120z' fill='#e8dcb0' opacity='.85'/>") },
  kiri: { sky: 'linear-gradient(180deg,#3a3a36 0%,#6e6c62 45%,#2a2a26 100%)', art: hills(['#8a887ccc', '#55534bdd', '#22221e'], [520, 620, 740]) },
  shogatsu: { sky: 'linear-gradient(180deg,#3a0f0c 0%,#7a2418 45%,#2a0c08 100%)', art: hills(['#5a1a12bb', '#3a100cdd', '#1a0805'], [560, 660, 760], "<circle cx='800' cy='300' r='150' fill='#e8c25a' opacity='.35'/>") },
};
export function bgCss(key) { const b = BG[key]; return b ? `${b.art} center bottom/cover no-repeat, ${b.sky}` : null; }
// 登用の画面（.toyo）の地だけを替える。操作の位置・大きさには触らない
export function applyBg(host, banner) {
  const css = bgCss(banner?.bg); if (!css) return;
  const el = host.querySelector('.toyo') || host;
  el.style.background = css;
}
