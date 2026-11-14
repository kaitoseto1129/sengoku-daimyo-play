// 毎日の楽しみ：日替わりのお題三つ（果たすと銭）と、続けて開いた日数の褒美（武具）
// 記録は state.js とは別の鍵（localStorage）。読めない・書けない時はその場だけで動く
import { addKan } from './state.js';
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
// 続けた日の褒美（日数 → 武具の id と銭）
export const STREAK = [{ d: 3, item: 'hat1', kan: 3 }, { d: 7, item: 'spear1', kan: 8 }, { d: 14, item: 'hat2', kan: 15 }, { d: 30, item: 'spear4', kan: 30 }];
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
    const r = STREAK.find((x) => x.d === s.streak);
    if (r && G) {
      gift = { ...r };
      if (r.item && !G.owned.includes(r.item)) G.owned.push(r.item);
      if (r.kan) addKan(G, r.kan);
    }
  }
  write(s);
  return { streak: s.streak || 1, gift };
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
  return { streak: s.streak || 0, items: s.ids.map((id) => { const q = POOL.find((p) => p.id === id); return { name: q.name, kan: q.kan, done: !!s.done[id], prog: q.need ? `${s.prog[id] || 0}/${q.need}` : '' }; }), next: STREAK.find((x) => x.d > (s.streak || 0)) || null };
}
