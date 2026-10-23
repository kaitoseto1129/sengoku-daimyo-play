// 保存本体を変えず、題と持ち込みの入口で記録の形を確かめる。
import { RANKS, SCENARIOS, ITEMS, migrate, clearSave } from './state.js';
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
export function readProgress(slot) {
  let bad = false;
  try {
    for (const suffix of ['', '-bak']) {
      const text = localStorage.getItem(saveKey(slot) + suffix);
      if (!text) continue;
      bad = true;
      try { const raw = JSON.parse(text); if (validProgress(raw)) return { game: migrate(raw), recovered: !!suffix, bad: false }; } catch (e) { /* 控えも確かめる */ }
    }
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

export function deleteProgress(slot) { clearSave(slot); return progressDeleted(slot); }
