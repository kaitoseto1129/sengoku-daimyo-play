// 保存本体を変えず、題と持ち込みの入口で記録の形を確かめる。
import { RANKS, SCENARIOS, ITEMS, migrate, clearSave, save as stateSave } from './state.js';
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const list = (g, key, check) => g[key] === undefined || Array.isArray(g[key]) && g[key].every(check);
export const saveKey = (slot) => 'sengoku-risshin-save-v1' + (slot ? `-s${slot}` : '');
export function validProgress(g) {
  if (!object(g) || g.practice || typeof g.name !== 'string' || !g.name.trim()) return false;
  const sc = SCENARIOS[g.scenario || 'okehazama'];
  if (!sc || !Number.isInteger(g.rank) || !RANKS[g.rank] || !Number.isInteger(g.battle) || g.battle < 0 || g.battle > sc.battles.length) return false;
  if (!['normal', 'easy', 'hard'].includes(g.difficulty || 'normal')) return false;
  for (const key of ['kan', 'merit', 'actions']) if (!number(g[key])) return false;
  if (!number(g.superior, 0, 100) || !object(g.stats) || !['spear', 'vit', 'lead'].every((k) => number(g.stats[k], 1))) return false;
  if (!Array.isArray(g.owned) || !g.owned.every((id) => Object.hasOwn(ITEMS, id)) || !object(g.equip)) return false;
  for (const key of ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat']) {
    const id = g.equip[key];
    if (id == null && !['weapon', 'hat', 'body'].includes(key)) continue;
    if (!Object.hasOwn(ITEMS, id) || ITEMS[id].slot !== key || !g.owned.includes(id)) return false;
  }
  if (!list(g, 'roster', (r) => object(r) && typeof r.id === 'string' && typeof r.name === 'string' && ['spear', 'bow', 'gun', 'cavalry'].includes(r.kind) && typeof r.alive === 'boolean' && number(r.battles) && number(r.kills))) return false;
  if (!list(g, 'journal', (r) => object(r) && typeof r.s === 'string' && (r.t === undefined || typeof r.t === 'string'))) return false;
  if (!list(g, 'history', (r) => r == null || object(r) && number(r.total) && Number.isInteger(r.rankAfter) && !!RANKS[r.rankAfter])) return false;
  if (!list(g, 'titles', (v) => typeof v === 'string') || !list(g, 'grades', (v) => v == null || typeof v === 'string') || !list(g, 'best', (v) => v == null || number(v))) return false;
  for (const key of ['rel', 'life', 'talked']) if (g[key] !== undefined && !object(g[key])) return false;
  if (g.life && !Object.values(g.life).every((v) => number(v))) return false;
  if (g.rel && !Object.values(g.rel).every((v) => object(v) && number(v.trust, 0, 100) && number(v.like, 0, 100))) return false;
  if (g.japan !== undefined && (!object(g.japan) || typeof g.japan.scn !== 'string' || !number(g.japan.turn) || !object(g.japan.own) || !list(g.japan, 'log', (r) => object(r) && typeof r.s === 'string' && number(r.t)) || !list(g.japan, 'moves', object))) return false;
  return true;
}
// 確かめを通った最後の記録（-ok）。state.js の save は「今」と「一つ前（-bak）」しか持たず、
// 一度でも形の崩れた記録を書くと、次の保存で -bak も崩れた物に替わる（10/24 Lancers：Android の森部で落ちた後「記録を読めません」で最初から）。
// そこで確かめを通った時だけ -ok に写し、今と -bak が読めない時の三つ目の戻り先にする。
const OK = '-ok';
export function keepGood(g) {
  try {
    if (!g || g.practice) return;
    const text = JSON.stringify(g);
    if (validProgress(JSON.parse(text))) localStorage.setItem(saveKey(g.slot ?? 0) + OK, text);
  } catch (e) { /* 容量が足りない時も遊びは続ける */ }
}
// 保存を呼ぶ側はこれを使う（state.js の save の後に、確かめを通った写しを残す）
export function safeSave(g) { stateSave(g); keepGood(g); }
// 形の小さな崩れ（数の範囲・知らない品・名簿の一人）だけなら、記録を捨てずに直して読む。
// 名・筋書き・身分・戦の番号が読めない物は直さない（別の記録と取り違えないため）
const clampNum = (v, min, max, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
export function repairProgress(raw) {
  try {
    const g = JSON.parse(JSON.stringify(raw));
    if (!object(g) || g.practice || typeof g.name !== 'string' || !g.name.trim()) return null;
    const sc = SCENARIOS[g.scenario || 'okehazama'];
    if (!sc || !Number.isInteger(g.rank) || !RANKS[g.rank] || !Number.isInteger(g.battle) || g.battle < 0 || g.battle > sc.battles.length) return null;
    if (!['normal', 'easy', 'hard'].includes(g.difficulty || 'normal')) g.difficulty = 'normal';
    for (const key of ['kan', 'merit', 'actions']) g[key] = clampNum(g[key], 0, Number.MAX_SAFE_INTEGER, 0);
    g.superior = clampNum(g.superior, 0, 100, 50);
    if (!object(g.stats)) g.stats = {};
    for (const k of ['spear', 'vit', 'lead']) g.stats[k] = clampNum(g.stats[k], 1, Number.MAX_SAFE_INTEGER, 1);
    g.owned = (Array.isArray(g.owned) ? g.owned : []).filter((id) => typeof id === 'string' && Object.hasOwn(ITEMS, id));
    if (!object(g.equip)) g.equip = {};
    const base = { weapon: 'spear0', hat: 'hat0', body: 'body0' };
    for (const key of ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat']) {
      const id = g.equip[key];
      if (id == null && !base[key]) { g.equip[key] = null; continue; }
      if (Object.hasOwn(ITEMS, id) && ITEMS[id].slot === key && g.owned.includes(id)) continue;
      g.equip[key] = base[key] || null;
      if (base[key] && !g.owned.includes(base[key])) g.owned.push(base[key]);
    }
    const keep = (key, check, fix) => { if (g[key] === undefined) return; g[key] = Array.isArray(g[key]) ? (fix ? g[key].map((r) => (check(r) ? r : fix)) : g[key].filter(check)) : []; };
    keep('roster', (r) => object(r) && typeof r.id === 'string' && typeof r.name === 'string' && ['spear', 'bow', 'gun', 'cavalry'].includes(r.kind) && typeof r.alive === 'boolean' && number(r.battles) && number(r.kills));
    keep('journal', (r) => object(r) && typeof r.s === 'string' && (r.t === undefined || typeof r.t === 'string'));
    keep('history', (r) => r == null || object(r) && number(r.total) && Number.isInteger(r.rankAfter) && !!RANKS[r.rankAfter], null);
    keep('titles', (v) => typeof v === 'string');
    keep('grades', (v) => v == null || typeof v === 'string', null);
    keep('best', (v) => v == null || number(v), null);
    for (const key of ['rel', 'life', 'talked']) if (g[key] !== undefined && !object(g[key])) g[key] = {};
    if (g.life) for (const k of Object.keys(g.life)) g.life[k] = clampNum(g.life[k], 0, Number.MAX_SAFE_INTEGER, 0);
    if (g.rel) for (const k of Object.keys(g.rel)) { const v = g.rel[k]; g.rel[k] = object(v) ? { ...v, trust: clampNum(v.trust, 0, 100, 45), like: clampNum(v.like, 0, 100, 50) } : { trust: 45, like: 50 }; }
    if (g.japan !== undefined && (!object(g.japan) || typeof g.japan.scn !== 'string' || !number(g.japan.turn) || !object(g.japan.own) || !list(g.japan, 'log', (r) => object(r) && typeof r.s === 'string' && number(r.t)) || !list(g.japan, 'moves', object))) delete g.japan;
    return validProgress(g) ? g : null;
  } catch (e) { return null; }
}
// どの確かめで落ちたか（直しの手掛かり。題の画面で読めなかった時だけ記す）
function badWhy(raw) {
  const fixed = repairProgress(raw);
  if (!fixed) return 'core';
  return Object.keys(fixed).filter((k) => JSON.stringify(fixed[k]) !== JSON.stringify(raw[k])).join(',').slice(0, 120) || '?';
}
export function readProgress(slot) {
  let bad = false;
  const raws = [];
  try {
    for (const suffix of ['', '-bak']) {
      const text = localStorage.getItem(saveKey(slot) + suffix);
      if (!text) continue;
      bad = true;
      try { const raw = JSON.parse(text); if (validProgress(raw)) return { game: migrate(raw), recovered: !!suffix, bad: false }; raws.push(raw); } catch (e) { /* 控えも確かめる */ }
    }
    // 今と一つ前がどちらも読めない時だけ、形の小さな崩れを直して読み、だめなら確かめを通った最後の写しへ戻る（消した記録は -ok からよみがえらせない）
    if (bad) {
      try { localStorage.setItem('risshin-save-bad', JSON.stringify({ at: Date.now(), slot, why: raws.length ? badWhy(raws[0]) : 'json' })); } catch (e) { /* 記せなくてよい */ }
      for (const raw of raws) { const g = repairProgress(raw); if (g) return { game: migrate(g), recovered: true, bad: false }; }
      const okText = localStorage.getItem(saveKey(slot) + OK);
      if (okText) { try { const raw = JSON.parse(okText); if (validProgress(raw)) return { game: migrate(raw), recovered: true, bad: false }; } catch (e) { /* 次へ */ } }
    } else localStorage.removeItem(saveKey(slot) + OK);
  } catch (e) { return { game: null, bad: true }; }
  return { game: null, bad };
}
export function progressStored(g) {
  try { return localStorage.getItem(saveKey(g.slot)) === JSON.stringify(g); } catch (e) { return false; }
}
export function progressDeleted(slot) {
  try { return localStorage.getItem(saveKey(slot)) === null && localStorage.getItem(saveKey(slot) + '-bak') === null; } catch (e) { return false; }
}
export function validExtra(ex) {
  if (ex == null) return true;
  if (!object(ex)) return false;
  if (ex.dojo != null && !number(Number(ex.dojo))) return false;
  if (ex.zk != null) {
    if (!object(ex.zk)) return false;
    for (const key of ['met', 'ach', 'at']) {
      if (ex.zk[key] !== undefined && !object(ex.zk[key])) return false;
      if (ex.zk[key] && !Object.values(ex.zk[key]).every((v) => key === 'at' ? typeof v === 'string' : number(v))) return false;
    }
    if (ex.zk.n !== undefined && (!object(ex.zk.n) || !Object.values(ex.zk.n).every((v) => number(v)))) return false;
  }
  return true;
}

export function deleteProgress(slot) { clearSave(slot); try { localStorage.removeItem(saveKey(slot) + OK); } catch (e) { /* noop */ } return progressDeleted(slot); }
