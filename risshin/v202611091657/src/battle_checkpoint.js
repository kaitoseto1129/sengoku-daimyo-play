// 戦の途中の保存（kaito 11/8「少し前からやり直すが最初からになる。20〜30分の戦で途中が全部消えるのは最悪」）
// - 段（任務の①②③…）が進むたびに、その段の始まりを localStorage の別の鍵へ軽く書く（state.js の保存には触れない）。
//   書くのは段の番号・主人公の体力・両軍の残りの数・名のある将の生き死に・時刻だけ。兵や形は写さない。
// - 一時停止の「ここで保存」と、アプリを閉じた・裏へ回した時も、今の段の番号と体力・生き死にを書く。
// - 同じ戦をまた始めると、定義の resumeSteps（段の始まりを作り直す関数の並び）で、その段の始まりから続ける。
//   resumeSteps：[[段, (rt) => { その段へ入る }], …] を順に。目当ての段より前の段は声・見出し・知らせ・時の約束を出さずに流す。
//   resumeAt(rt, step)：続ける時に主人公を置く所（無ければ前の段の行き先の印の所）。
// - 戦が終わって結果へ進んだ時・一時停止の「やり直す」で最初から始める時に消す。
import { scenarioKey } from './state.js';
import { stageNow } from './stages.js';

const KEY = 'risshin-battle-cp';
let mem = null, memOnly = false;   // 書けない所（プライベート・確かめの道具）でも、同じ頁の間は覚えておく

const idOf = (rt) => rt.def?.key || rt.def?.id || String(rt.index);
const who = (G) => [scenarioKey(), G?.name || '', G?.rank ?? '', (G?.history || []).length].join('|');
// resumeSteps が数（N）なら、toStep(rt, n)（無ければ stage1〜stageN）を持つ戦の ①〜N を順に流す並びを作る
const GEN = new WeakMap();
function stepsOf(def) {
  if (!def) return null;
  if (Array.isArray(def.resumeSteps)) {
    // [段, '関数の名'] は this[名](rt) を呼ぶ
    if (!def.resumeSteps.some((e) => typeof e[1] === 'string')) return def.resumeSteps;
    let list = GEN.get(def);
    if (!list) { list = def.resumeSteps.map(([k, f]) => [k, typeof f === 'string' ? function (rt) { this[f](rt); } : f]); GEN.set(def, list); }
    return list;
  }
  if (!Number.isInteger(def.resumeSteps) || (typeof def.toStep !== 'function' && typeof def.stage1 !== 'function')) return null;
  let list = GEN.get(def);
  if (!list) {
    list = [];
    for (let n = 1; n <= def.resumeSteps; n++) list.push([n, function (rt) { if (rt.flags) rt.flags.holdPlayer = false; if (this.toStep) this.toStep(rt, n); else this['stage' + n]?.(rt); }]);
    GEN.set(def, list);
  }
  return list;
}
export const resumable = (rt) => !!(rt && stepsOf(rt.def) && !rt.def.town && !rt.def.dojo && !rt.def.mapCastle);

// 今の段（定義の checkpointStep → F.step → stages.js の段）
export function cpStep(rt) {
  const d = rt.def?.checkpointStep?.(rt);
  if (d !== undefined && d !== null) return d;
  const s = rt.flags?.step;
  if (typeof s === 'number' || typeof s === 'string') return s;
  try { const st = stageNow(rt); return st ? st.i : null; } catch (e) { return null; }
}
const stepIndex = (rt, step) => stepsOf(rt.def).findIndex((e) => e[0] === step);

export function readCheckpoint() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { return mem; }   // 読めない所は覚えの方
  // 書き込みを止めた確かめの道具（bot・sim）では、同じ頁で戦を始め直しても途中から続けない（window.__cpMem で試す時だけ覚えを使う）
  return memOnly || (typeof window !== 'undefined' && window.__cpMem) ? mem : null;
}
export function clearCheckpoint(rt) {
  const cp = readCheckpoint();
  if (rt && cp && cp.id !== idOf(rt)) return;
  mem = null;
  try { localStorage.removeItem(KEY); } catch (e) { /* 消せなくても次の書き込みで上書き */ }
}
// 同じ人・同じ戦の保存だけを返す
export function checkpointFor(G, id) {
  const cp = readCheckpoint();
  return cp && cp.v === 1 && cp.id === id && cp.who === who(G) ? cp : null;
}

// stageStart：段に入った時の書き込み（段の始まりの時刻を持つ）。でなければ今の体力と生き死にだけを足す
export function writeCheckpoint(rt, stageStart = false) {
  if (!resumable(rt) || rt.over || !rt.player?.u?.alive) return false;
  const step = cpStep(rt);
  if (stepIndex(rt, step) < 0) return false;
  const prev = readCheckpoint();
  const same = prev && prev.id === idOf(rt) && prev.step === step && prev.who === who(rt.G);
  const u = rt.player.u, dead = [], alive = { a: 0, b: 0 };
  for (const q of rt.army.units) {
    if (q.isPlayer) continue;
    if (q.alive && !q.gone && !q.fleeing) alive[q.team === 0 ? 'a' : 'b']++;
    if (q.name && !q.alive && !q.civ && !q.isCourier) dead.push(q.name);
  }
  const cp = {
    v: 1, id: idOf(rt), who: who(rt.G), step,
    t0: stageStart || !same ? Math.round(rt.flags?.tS ?? rt.t) : prev.t0,
    t: Math.round(rt.t), hp: Math.round(u.hp / (u.maxHp || 100) * 100) / 100,
    dead: [...new Set(dead)].slice(0, 60), alive, at: Date.now(),
    flags: flagsOf(rt), groups: groupsOf(rt), gx: groupLooks(rt),
  };
  mem = cp;
  try { localStorage.setItem(KEY, JSON.stringify(cp)); } catch (e) { memOnly = true; }   // 書けなければ覚えの方だけ
  rt._cpStep = step;
  return true;
}

// 11/9 kaito 天王寺「途中から始めると兵力の数が戻り、倒した備・馬印が元に戻る」（全戦）：
//   段を流し直すだけでは、その段の中で倒した数（flags の ek・ak など）と、減らした備が戻ってしまう。
//   保存の時の flags の素の値（数・真偽・字）と、備ごとの生きている数を書いておき、流し直した後に戻す
function flagsOf(rt) {
  const o = {}, F = rt.flags || {};
  for (const k of Object.keys(F)) {
    const v = F[k];
    if (typeof v === 'boolean' || typeof v === 'string' && v.length < 40 || typeof v === 'number' && Number.isFinite(v)) o[k] = v;
  }
  return o;
}
const groupKey = (g) => `${g.team}|${g.name || g.label || ''}`;
const liveIn = (g) => (g.units || []).filter((u) => u.alive && !u.gone && !u.isPlayer && !u.civ && !u.isStruct);
function groupsOf(rt) {
  const o = {};
  for (const g of rt.army.groups || []) { const k = groupKey(g); o[k] = (o[k] || 0) + liveIn(g).length; }
  return o;
}
// 備の姿（真ん中・家・下知・兵の種類ごとの数）。段の中の出来事で出た備は、段を流し直しても出てこないので、これで作り直す
function groupLooks(rt) {
  const o = {};
  for (const g of rt.army.groups || []) {
    if (g.isPlayerSquad) continue;
    const live = liveIn(g);
    if (!live.length) continue;
    const k = groupKey(g), e = o[k] || (o[k] = { x: 0, z: 0, n: 0, f: g.faction || '', o: g.order || 'hold', ty: {} });
    for (const u of live) { e.x += u.pos.x; e.z += u.pos.z; e.n++; const t = u.type === 'busho' ? 'samurai' : u.type; if (['samurai', 'ashigaru', 'gun', 'bow', 'cavalry'].includes(t)) e.ty[t] = (e.ty[t] || 0) + 1; }
  }
  for (const e of Object.values(o)) { e.x = Math.round(e.x / e.n); e.z = Math.round(e.z / e.n); delete e.n; }
  return o;
}
// 足りない備を作り直す（名のある将は作らない。種類ごとの数だけ。保存の時の数を超えない）
function refillGroups(rt, saved, looks) {
  const have = {};
  for (const g of rt.army.groups || []) { const k = groupKey(g); have[k] = (have[k] || 0) + liveIn(g).length; }
  for (const [k, e] of Object.entries(looks)) {
    let need = (saved[k] || 0) - (have[k] || 0);
    if (need <= 0) continue;
    const team = Number(k.split('|')[0]), name = k.slice(k.indexOf('|') + 1);
    const list = [];
    for (const [type, n] of Object.entries(e.ty)) { const m = Math.min(n, need); if (m > 0) { list.push({ type, n: m }); need -= m; } }
    if (!list.length) continue;
    try {
      const g = rt.army.addGroup({ team, faction: e.f || undefined, name: name || undefined, order: e.o === 'flee' ? 'hold' : e.o, aggro: 16, anchor: { x: e.x, z: e.z }, fixed: true });
      rt.army.spawn(g, list);
      g.leader = g.units.find((u) => u.type === 'samurai') || g.units[0] || null;
    } catch (err) { console.error('備の作り直し', k, err); }
  }
}

// 備の数を保存の時まで減らす（増やしはしない）。要の将（invuln）と名のある将は残し、後ろの兵から片付ける
function trimGroups(rt, saved) {
  const byKey = new Map();
  // 保存の時に無かった備（その後に出る隊・もう消えた隊）は 0 人として片付ける。本人の組は触らない
  for (const g of rt.army.groups || []) { if (g.isPlayerSquad) continue; const k = groupKey(g); if (!(k in saved)) saved = { ...saved, [k]: 0 }; (byKey.get(k) || byKey.set(k, []).get(k)).push(...liveIn(g)); }
  const out = [];
  for (const [k, list] of byKey) {
    let extra = list.length - saved[k];
    if (extra <= 0) continue;
    const order = [...list].sort((a, b) => (a.name ? 1 : 0) - (b.name ? 1 : 0) || (a === a.group?.leader ? 1 : 0) - (b === b.group?.leader ? 1 : 0));
    for (const u of order) { if (extra <= 0) break; if (u.invuln) continue; out.push(u); extra--; }
  }
  return out;
}

// 隊を音もなく片付ける（段を流した時に逃げた敵・保存の時に討たれていた名のある将）
function vanish(rt, units) {
  const A = rt.army;
  const bark = rt.hud.bark, say = rt.say;
  rt.hud.bark = () => {}; rt.say = () => {};   // 「落ち延びた」の知らせを出さない
  try { for (const u of units) if (u && !u.isPlayer && !u.gone) A.despawn ? A.despawn(u) : drop(A, u); }
  finally { rt.hud.bark = bark; rt.say = say; }
  try { A.rebuildGrid?.(); } catch (e) { /* 次のコマで作り直される */ }
}
function drop(A, u) {
  {
    if (u.mesh) A.scene?.remove(u.mesh);
    const i = A.units.indexOf(u); if (i >= 0) A.units.splice(i, 1);
    if (u.group) { const j = u.group.units.indexOf(u); if (j >= 0) u.group.units.splice(j, 1); }
    u.alive = false; u.gone = true;
  }
}

// 済んだ段の時の約束（援軍が着く・備が出る等）は、捨てずに音もなく今起こす（11/9 kaito 天王寺「再開すると味方の兵だけ消えている」）。
//   約束が新しい約束を作れば、それも三巡まで。五分より先の約束は、その段の間に来なかった物として捨てる
function fireQuiet(rt, n0) {
  for (let round = 0; round < 3 && rt.timers.length > n0; round++) {
    const due = rt.timers.splice(n0).filter((tm) => tm.t <= 300 && !tm.duringPrelude);
    for (const tm of due) { try { tm.fn(rt); } catch (e) { console.error('段の約束の作り直し', e); } }
  }
}
// 段の始まりへ作り直す。戦の始め（setup の後・最初のコマ）に一度だけ呼ぶ
export function applyCheckpoint(rt, cp) {
  const steps = stepsOf(rt.def), k = stepIndex(rt, cp.step);
  if (k < 0) return false;
  const hud = rt.hud, keep = { say: rt.say, banner: rt.banner, bark: hud.bark, hbanner: hud.banner };
  const quiet = () => { rt.say = () => {}; rt.banner = () => {}; hud.bark = () => {}; hud.banner = () => {}; };
  const loud = () => { rt.say = keep.say; rt.banner = keep.banner; hud.bark = keep.bark; hud.banner = keep.hbanner; };
  // 戦の前の話・開戦の約束（setup の after）は流さない
  rt.timers.length = 0;
  rt.t = Math.max(rt.t, cp.t ?? cp.t0 ?? 0);   // 保存した時の時刻（flags の時刻と合わせる）
  rt.setPhase?.('battle');
  const pinOf = () => { try { const g = rt.def.goalSignTarget?.(rt) || rt.def.missionPin?.(rt); return g && Number.isFinite(g.x) ? { x: g.x, z: g.z } : null; } catch (e) { return null; } };
  let from = null;   // 段の始まりの所＝前の段の行き先（行き先の手前に置くと、着けば済む段がすぐ済んでしまう）
  for (let i = 0; i <= k; i++) {
    const last = i === k, n0 = rt.timers.length;
    if (last && i > 0) from = pinOf();
    if (!last) quiet();
    try { steps[i][1].call(rt.def, rt); } catch (e) { console.error('段の作り直し', steps[i][0], e); }
    finally { if (!last) { fireQuiet(rt, n0); loud(); rt.timers.length = n0; } }
    // 保存した段の中で、保存の時までに来ていた約束（段の始まりから cp.t - cp.t0 秒のうち）も音もなく起こす
    if (last && Number.isFinite(cp.t) && Number.isFinite(cp.t0) && cp.t > cp.t0) {
      const span = cp.t - cp.t0, due = [];
      for (let j = rt.timers.length - 1; j >= n0; j--) if (rt.timers[j].t <= span && !rt.timers[j].duringPrelude) due.push(...rt.timers.splice(j, 1));
      if (due.length) { quiet(); try { for (const tm of due.reverse()) { try { tm.fn(rt); } catch (e) { console.error('段の約束の作り直し', e); } } } finally { loud(); } }
    }
  }
  // 前の段で逃げた敵は、もう戦場にいない
  vanish(rt, rt.army.units.filter((u) => u.team !== 0 && (u.fleeing || u.group?.routed || u.group?.order === 'flee')));
  // 保存の時に討たれていた名のある将（不死身の要の将は除く）
  const dead = new Set(cp.dead || []);
  if (dead.size) vanish(rt, rt.army.units.filter((u) => u.name && u.alive && dead.has(u.name) && !u.invuln));
  // 倒した数・旗・馬印などの flags の素の値と、減らした備の数を保存の時に戻す（段の番号は流した段のまま）
  if (cp.flags) for (const [k, v] of Object.entries(cp.flags)) { const cur = rt.flags[k]; if (k !== 'step' && (cur === undefined || cur === null || typeof cur !== 'object' && typeof cur !== 'function')) rt.flags[k] = v; }
  if (cp.groups) vanish(rt, trimGroups(rt, cp.groups));
  if (cp.groups && cp.gx) refillGroups(rt, cp.groups, cp.gx);
  // 主人公：体力は保存の時（少なくとも四割）。置き場は定義の resumeAt、無ければ前の段の行き先
  const u = rt.player.u;
  u.hp = Math.max((u.maxHp || 100) * 0.4, (u.maxHp || 100) * (cp.hp || 1));
  const at = rt.def.resumeAt ? rt.def.resumeAt(rt, cp.step) : from;
  if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) {
    const dx = at.x - u.pos.x, dz = at.z - u.pos.z;
    for (const q of rt.army.units) if (q.alive && !q.isPlayer && (q.group?.isPlayerSquad || (rt.tomoUnits || []).includes(q))) {
      q.pos.x += dx; q.pos.z += dz; q.pos.y = rt.world.heightAt(q.pos.x, q.pos.z); q.mesh?.position.copy(q.pos); q.moveTo = null; q.target = null;
    }
    u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null;
    if (at.heading !== undefined) { u.heading = at.heading; rt.player.yaw = at.heading; }
  }
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
  rt._cpStep = cp.step; rt.resumedFrom = cp.step;
  return true;
}

// 毎コマ：初めのコマで保存から続け、段が変わったら書く（軽い：段の番号を一つ見るだけ）
export function checkpointTick(rt) {
  if (!resumable(rt)) return;
  if (rt.resumeCp) { const cp = rt.resumeCp; rt.resumeCp = null; try { applyCheckpoint(rt, cp); } catch (e) { console.error('途中から続けられない', e); } return; }
  if (rt.over) return;
  const step = cpStep(rt);
  if (step === rt._cpStep) return;
  rt._cpStep = step;
  if (stepIndex(rt, step) >= 0) writeCheckpoint(rt, true);
}

// アプリを閉じた・裏へ回した時も、今の段と体力を書いておく
if (typeof addEventListener === 'function') {
  const flush = () => { const b = window.__game?.battle; if (b && !b.over) { try { writeCheckpoint(b); } catch (e) { /* 書けなくても閉じる */ } } };
  addEventListener('pagehide', flush);
  document.addEventListener?.('visibilitychange', () => { if (document.hidden) flush(); });
}
// 戦を始めた時：同じ人・同じ戦の保存があれば、最初のコマでその段から続ける
export function takeCheckpoint(rt) {
  if (!resumable(rt)) return null;
  const cp = checkpointFor(rt.G, idOf(rt));
  if (cp && stepIndex(rt, cp.step) >= 0) rt.resumeCp = cp;
  return rt.resumeCp || null;
}
