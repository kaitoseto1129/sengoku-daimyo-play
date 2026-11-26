// 毎日の楽しみ：日替わりのお題三つ（果たすと銭）と、開いた日の合計の褒美（武具・K318 休んでも減らない）
// 記録は state.js とは別の鍵（localStorage）。読めない・書けない時はその場だけで動く
import { addKan } from './state.js';
import { giftLook } from './cosmetics.js';
import { reduceMotion } from './settings.js';
const KEY = 'risshin.daily';
const day = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dayDiff = (a, b) => Math.round((Date.UTC(Math.floor(b / 10000), Math.floor(b / 100) % 100 - 1, b % 100) - Date.UTC(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100)) / 864e5);
// お題の型。test(c) の c＝{kills, time(秒), id(戦の id), win, weapon(槍/鉄砲…), grade}
export const POOL = [
  { id: 'k10', name: '十人討つ', test: (c) => c.kills >= 10, kan: 3 },
  { id: 'k25', name: '二十五人討つ', test: (c) => c.kills >= 25, kan: 5 },
  { id: 'win', name: '戦に勝つ', test: (c) => c.win, kan: 3 },
  { id: 'fast6', name: '六分以内に勝つ', test: (c) => c.win && c.time <= 360, kan: 6 },
  { id: 'gun10', name: '鉄砲で十人', test: (c) => c.weapon === 'gun' && c.kills >= 10, kan: 6 },
  { id: 'spear15', name: '槍で十五人', test: (c) => c.weapon === 'spear' && c.kills >= 15, kan: 5 },
  { id: 'kou', name: '評定で甲を取る', test: (c) => c.win && /甲/.test(c.grade || ''), kan: 8 },
  { id: 'inou', name: '稲生で勝つ', test: (c) => c.win && c.id === 'inou', kan: 4 },
  { id: 'okehazama', name: '桶狭間で勝つ', test: (c) => c.win && c.id === 'okehazama', kan: 5 },
  { id: 'two', name: '二つの戦に勝つ', count: true, test: (c) => c.win, need: 2, kan: 6 },
];
// 開いた日の合計の褒美（K318 の決め2：見た目の飾りだけ。強さは渡さない）。look＝cosmetics.js の品・col＝画面の札の色
export const STREAK = [
  { d: 3, look: 'hata_shiro', col: '#e8e4da', kan: 3 },
  { d: 7, look: 'mika', col: '#d9b44a', kan: 8 },
  { d: 14, look: 'kon', col: '#2e3c6e', kan: 15 },
  { d: 21, look: 'aoge', col: '#3a3330', kan: 20 },
  { d: 30, look: 'hata_shu', col: '#b8342a', kan: 30 },
];
const pick3 = (seed) => {
  const a = POOL.map((_, i) => i); let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 3).map((i) => POOL[i].id);
};
function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 書けなくても遊べる */ } }
// 今日の状態（日が変われば作り直す）
export function dailyState() {
  const s = read(), t = day();
  if (s.day !== t) {
    s.streak = s.last && dayDiff(s.last, t) === 1 ? (s.streak || 0) : (s.last === t ? s.streak : 0);
    s.day = t; s.ids = pick3(t); s.done = {}; s.prog = {}; s.paid = false;
  }
  return s;
}
// ホームを開いた時に呼ぶ。続けた日数を数え、褒美が出れば返す
export function dailyOpen(G) {
  const s = dailyState(), t = day();
  let gift = null;
  if (s.last !== t) {
    s.streak = (s.last && dayDiff(s.last, t) === 1) ? (s.streak || 0) + 1 : 1;
    s.last = t; s.best = Math.max(s.best || 0, s.streak);
    // K318（docs/specs/daily_login_1115.md の決め1）：褒美は「開いた日の合計」で出す。休んでも減らない（連続を罰しない）
    s.total = (s.total || Math.max(0, (s.streak || 1) - 1)) + 1;
    const r = STREAK.find((x) => x.d === s.total);
    if (r && G) {
      gift = { ...r };
      if (r.look) giftLook(r.look);
      if (r.kan) addKan(G, r.kan);
    }
  }
  write(s);
  return { streak: s.streak || 1, total: s.total || 1, gift };
}
// 戦の終わりに呼ぶ。果たしたお題の銭を G に足し、果たした札を返す
export function dailyNote(c, G) {
  const s = dailyState(), got = [];
  for (const id of s.ids) {
    const q = POOL.find((p) => p.id === id);
    if (!q || s.done[id] || !q.test(c)) continue;
    if (q.need) { s.prog[id] = (s.prog[id] || 0) + 1; if (s.prog[id] < q.need) continue; }
    s.done[id] = true; got.push(q);
    if (G) addKan(G, q.kan);
  }
  write(s);
  return got;
}
export function dailyView() {
  const s = dailyState();
  const total = s.total || 0;
  return { streak: s.streak || 0, total, items: s.ids.map((id) => { const q = POOL.find((p) => p.id === id); return { name: q.name, kan: q.kan, done: !!s.done[id], prog: q.need ? `${s.prog[id] || 0}/${q.need}` : '' }; }), next: STREAK.find((x) => x.d > total) || null };
}
// K318 の決め3：褒美をもらった時、その飾りの色の旗が一枚、画面の上に浮かんで消える（字は出さない）
export function giftFloat(col) {
  try {
    const el = document.createElement('div');
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', '褒美の飾り');
    el.style.cssText = `position:fixed;left:50%;top:18%;width:34px;height:46px;margin-left:-17px;z-index:60;pointer-events:none;background:${col};border:2px solid #e6c77a;box-shadow:0 2px 10px rgba(0,0,0,.5);opacity:0;transition:opacity .5s,transform 2.2s ease-out`;
    document.body.appendChild(el);
    const still = reduceMotion();
    requestAnimationFrame(() => { el.style.opacity = '1'; if (!still) el.style.transform = 'translateY(-24px)'; });
    setTimeout(() => { el.style.opacity = '0'; }, 2200);
    setTimeout(() => el.remove(), 2800);
  } catch (e) { /* 出せなくても褒美は入っている */ }
}
// K318 紹介の紋（docs/specs/daily_login_1115.md）：端末ごとの六桁の紋の番号（英字は出さない）。友の番号を入れた側に飾り（前立：日輪）を一度だけ。
// 紹介した側へ渡すには置き場の外の受け口が要るので、今は入れた側だけ（連絡帳 11/17 16:05）。番号の終いの一桁は確かめの数（打ち違いを弾く）
const REF_KEY = 'risshin_ref';
const refRead = () => { try { return JSON.parse(localStorage.getItem(REF_KEY) || 'null') || {}; } catch (e) { return {}; } };
const refWrite = (o) => { try { localStorage.setItem(REF_KEY, JSON.stringify(o)); } catch (e) {} };
const sum = (s) => [...s].reduce((a, c, i) => a + (+c) * (i % 2 ? 3 : 7), 0) % 10;
export const refValid = (s) => /^\d{6}$/.test(s) && sum(s.slice(0, 5)) === +s[5];
export function myRefCode() {
  const o = refRead();
  if (!refValid(o.me || '')) { const b = String(Math.floor(10000 + Math.random() * 90000)); o.me = b + sum(b); refWrite(o); }
  return o.me;
}
export const refUsed = () => !!refRead().used;
// 返す：'ok'（飾りを渡した）・'bad'（番号が違う）・'self'（自分の番号）・'used'（この端末では入れ済み）
export function useRefCode(code) {
  const s = String(code || '').replace(/[^\d０-９]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const o = refRead();
  if (o.used) return 'used';
  if (!refValid(s)) return 'bad';
  if (s === myRefCode()) return 'self';
  o.used = s; refWrite(o);
  giftLook('nichi');
  return 'ok';
}
