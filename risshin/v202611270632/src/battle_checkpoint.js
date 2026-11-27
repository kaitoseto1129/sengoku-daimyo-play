// 戦の途中の保存（kaito 11/8「少し前からやり直すが最初からになる。20〜30分の戦で途中が全部消えるのは最悪」）
// - 段（任務の①②③…）が進むたびに、その段の始まりを localStorage の別の鍵へ軽く書く（state.js の保存には触れない）。
//   書くのは段の番号・主人公の体力・両軍の残りの数・名のある将の生き死に・時刻だけ。兵や形は写さない。
// - 一時停止の「ここで保存」と、アプリを閉じた・裏へ回した時も、今の段の番号と体力・生き死にを書く。
// - 同じ戦をまた始めると、定義の resumeSteps（段の始まりを作り直す関数の並び）で、その段の始まりから続ける。
//   resumeSteps：[[段, (rt) => { その段へ入る }], …] を順に。目当ての段より前の段は声・見出し・知らせ・時の約束を出さずに流す。
//   resumeAt(rt, step)：続ける時に主人公を置く所（無ければ前の段の行き先の印の所）。
// - 戦が終わって結果へ進んだ時・一時停止の「やり直す」で最初から始める時に消す。
import { scenarioKey, BATTLES } from './state.js';
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
// 11/19 K365（cloud-14 の照らし）：最初の段（段0）は resumeSteps に無いので記録が書かれず、本能寺（〜400秒）・岩村（〜200秒）などは
//   段0で倒れると最初からになった。段0の間は START の印で二十秒ごとに書き、続ける時は setup の時の約束を消さずに、保存の時刻まで音もなく早送りする
export const CP_START = '@start';
const atStart = (rt, step) => step === CP_START || (!rt._cpReached && stepIndex(rt, step) < 0);
const known = (rt, step) => step === CP_START || stepIndex(rt, step) >= 0;

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
  let step = cpStep(rt);
  if (stepIndex(rt, step) >= 0) rt._cpReached = true;
  else if (atStart(rt, step)) step = CP_START;
  else return false;
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
    t0: step === CP_START ? 0 : stageStart || !same ? Math.round(rt.flags?.tS ?? rt.t) : prev.t0,
    t: Math.round(rt.t), hp: Math.round(u.hp / (u.maxHp || 100) * 100) / 100,
    dead: [...new Set(dead)].slice(0, 60), alive, at: Date.now(),
    flags: flagsOf(rt), groups: groupsOf(rt), gx: groupLooks(rt),
    bid: BATTLES[rt.index]?.id || null, goal: goalOf(rt),
    // K363：戦を始める時に「途中から続ける」を選ばせる札に、どこから続くかを字で見せる（今の右上の任務の一行）
    label: String((rt.objectives || []).find((o) => o.id === 'main')?.text || '').slice(0, 40),
  };
  mem = cp;
  try { localStorage.setItem(KEY, JSON.stringify(cp)); } catch (e) { memOnly = true; }   // 書けなければ覚えの方だけ
  rt._cpStep = step;
  return true;
}

// 選ぶ札に出す今の任務の一行（K363：何の途中かが分かるように）
function goalOf(rt) {
  try { const o = (rt.objectives || []).find((q) => q.kind === 'main' && q.state !== 'done' && q.text); return o ? String(o.text).slice(0, 40) : ''; } catch (e) { return ''; }
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
      g.cpRefill = true;
      rt.army.spawn(g, list);
      g.leader = g.units.find((u) => u.type === 'samurai') || g.units[0] || null;
    } catch (err) { console.error('備の作り直し', k, err); }
  }
}

// 備の数を保存の時まで減らす（増やしはしない）。要の将（invuln）と名のある将は残し、後ろの兵から片付ける
function trimGroups(rt, saved, only = null) {
  const byKey = new Map();
  // 保存の時に無かった備（その後に出る隊・もう消えた隊）は 0 人として片付ける。本人の組は触らない
  //   only（続けた後の見張り）：その備の名の物だけを見る。保存に無い名の備（後で出る新手）は触らない
  for (const g of rt.army.groups || []) { if (g.isPlayerSquad) continue; const k = groupKey(g); if (only && !only.has(k)) continue; if (!(k in saved)) saved = { ...saved, [k]: 0 }; (byKey.get(k) || byKey.set(k, []).get(k)).push(...liveIn(g)); }
  const out = [];
  for (const [k, list] of byKey) {
    let extra = list.length - saved[k];
    if (extra <= 0) continue;
    // 作り直した備（cpRefill）の兵から先に片付ける（本物の備の方が段の筋書きと持ち場を持つ）
    const order = [...list].sort((a, b) => (b.group?.cpRefill ? 1 : 0) - (a.group?.cpRefill ? 1 : 0) || (a.name ? 1 : 0) - (b.name ? 1 : 0) || (a === a.group?.leader ? 1 : 0) - (b === b.group?.leader ? 1 : 0));
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
// 戻さない flags（K363 kaito 11/17 天王寺「直前から再開の時、自分を操作できない・攻撃ができない」）：
//   台詞の間の操作の止め（holdPlayer）などを保存の時のまま戻すと、動こうとした時だけ解け、立ち止まって攻撃が効かなかった。
//   操作・見せ場・終わりの印は、流し直した段の値のままにする
const NO_RESTORE = /^(holdPlayer|playerHold|freeze|cine|lockCam|lockPlayer)|^(ending|over|ended|talking|busy)$/;
// 同じ名の将が二人いれば一人にする（K363「毛利勝永が2体出る」）：段を順に流すと、前の段と今の段の両方で同じ将を出す戦がある。
//   flags が指している方を残し、無ければ一番新しく出た方を残す
function dedupeNamed(rt) {
  const ref = new Set();
  for (const v of Object.values(rt.flags || {})) {
    if (v && typeof v === 'object') { if (v.pos && v.name) ref.add(v); else if (v.leader?.name) ref.add(v.leader); }
  }
  const by = new Map();
  for (const u of rt.army.units) {
    if (!u.name || u.type !== 'busho' || !u.alive || u.gone || u.isPlayer || u.civ || u.isStruct || u.isCourier) continue;
    const k = u.team + '|' + u.name; (by.get(k) || by.set(k, []).get(k)).push(u);
  }
  const out = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    // 一番新しく出た方（後の段の持ち場）を残す。flags が指していれば、その中の一番新しい方。不死身の要の将も二人目は下げる
    const keep = list.filter((u) => ref.has(u)).pop() || list[list.length - 1];
    for (const u of list) if (u !== keep && !u.group?.allowDupName) out.push(u);
  }
  return out;
}
// 段の始まりへ作り直す。戦の始め（setup の後・最初のコマ）に一度だけ呼ぶ
export function applyCheckpoint(rt, cp) {
  if (cp.step === CP_START) return applyStart(rt, cp);
  const steps = stepsOf(rt.def), k = stepIndex(rt, cp.step);
  if (k < 0) return false;
  const hud = rt.hud, keep = { say: rt.say, banner: rt.banner, bark: hud.bark, hbanner: hud.banner };
  const quiet = () => { rt.say = () => {}; rt.banner = () => {}; hud.bark = () => {}; hud.banner = () => {}; };
  const loud = () => { rt.say = keep.say; rt.banner = keep.banner; hud.bark = keep.bark; hud.banner = keep.hbanner; };
  // 戦の前の話・開戦の約束（setup の after）は流さない
  rt.timers.length = 0;
  // 開戦の溜め（prelude.js の陣中の間・太鼓）は戦の始めだけ。続ける時は次のコマで解く（解かないと途中の段で兵と筋書きの時計が最大35秒止まる。K211 11/14）
  if (rt.prelude && rt.prelude !== 'done') rt.prelude.danger = true;
  rt.t = Math.max(rt.t, cp.t ?? cp.t0 ?? 0);   // 保存した時の時刻（flags の時刻と合わせる）
  rt.setPhase?.('battle');
  const pinOf = () => { try { const g = rt.def.goalSignTarget?.(rt) || rt.def.missionPin?.(rt); return g && Number.isFinite(g.x) ? { x: g.x, z: g.z } : null; } catch (e) { return null; } };
  let from = null;   // 段の始まりの所＝前の段の行き先（行き先の手前に置くと、着けば済む段がすぐ済んでしまう）
  // K365 クラウド：段を流し直している間の印（戦の側が「前の小さな段を待つ」所を飛ばせるように。信貴山の麓の段）
  rt.resumingCp = true;
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
  rt.resumingCp = false;
  // 前の段で逃げた敵は、もう戦場にいない
  vanish(rt, rt.army.units.filter((u) => u.team !== 0 && (u.fleeing || u.group?.routed || u.group?.order === 'flee')));
  // 保存の時に討たれていた名のある将（不死身の要の将は除く）
  const dead = new Set(cp.dead || []);
  if (dead.size) vanish(rt, rt.army.units.filter((u) => u.name && u.alive && dead.has(u.name) && !u.invuln));
  // 倒した数・旗・馬印などの flags の素の値と、減らした備の数を保存の時に戻す（段の番号は流した段のまま）
  if (cp.flags) for (const [k, v] of Object.entries(cp.flags)) { const cur = rt.flags[k]; if (k !== 'step' && !NO_RESTORE.test(k) && (cur === undefined || cur === null || typeof cur !== 'object' && typeof cur !== 'function')) rt.flags[k] = v; }
  if (cp.groups) vanish(rt, trimGroups(rt, cp.groups));
  if (cp.groups && cp.gx) refillGroups(rt, cp.groups, cp.gx);
  vanish(rt, dedupeNamed(rt));
  // 備の置き場（fujin_place・depth_reserve）は次のコマで本物の備を出すので、作り直した備と二重になり兵が倍になった
  //   （K363 天王寺：秋田・浅野などの備が45→90、全部で 2400→3900 人で重い）。続けた後しばらくは、出た備を保存の時の数まで詰める
  if (cp.groups) rt._cpWatch = { saved: cp.groups, known: new Set(rt.army.groups), n: rt.army.groups.length, until: rt.t + 120 };
  rt.flags.holdPlayer = false;
  // 主人公：体力は保存の時（少なくとも四割）。置き場は定義の resumeAt、無ければ前の段の行き先
  const u = rt.player.u;
  u.hp = Math.max((u.maxHp || 100) * 0.4, (u.maxHp || 100) * (cp.hp || 1));
  const at = rt.def.resumeAt ? rt.def.resumeAt(rt, cp.step, from) : from;   // 三つ目に既定の置き場（前の段の行き先）を渡す
  if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) {
    const dx = at.x - u.pos.x, dz = at.z - u.pos.z;
    for (const q of rt.army.units) if (q.alive && !q.isPlayer && (q.group?.isPlayerSquad || (rt.tomoUnits || []).includes(q))) {
      q.pos.x += dx; q.pos.z += dz; q.pos.y = rt.world.heightAt(q.pos.x, q.pos.z); q.mesh?.position.copy(q.pos); q.moveTo = null; q.target = null;
    }
    u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null;
    if (at.heading !== undefined) { u.heading = at.heading; rt.player.yaw = at.heading; }
    // 11/18 K363 cloud-14：向きの決まりが無ければ、今の段の行き先へ向ける（設楽原：柵の方を向いて立ち、続けた直後の3秒で2.5m しか進めなかった）
    else { const p = pinOf(); if (p && Math.hypot(p.x - at.x, p.z - at.z) > 2) { const h = Math.atan2(p.x - at.x, p.z - at.z); u.heading = h; rt.player.yaw = h; } }
  }
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
  rt._cpStep = cp.step; rt.resumedFrom = cp.step;
  return true;
}

// 段0から続ける：setup の約束（あと何秒の数え下げ）を消さず、保存の時刻まで早い順に音もなく起こす（起こした約束が足した約束も、
//   その時の今から数える）。段の時計（rt.t・flags の時刻）を保存の時に合わせ、数と生き死にを戻す。主人公は戦の始めの所のまま（倒れた所の敵の中へ置かない）
function applyStart(rt, cp) {
  const span = Math.max(0, cp.t || 0);
  const hud = rt.hud, keep = { say: rt.say, banner: rt.banner, bark: hud.bark, hbanner: hud.banner };
  if (rt.prelude && rt.prelude !== 'done') rt.prelude.danger = true;
  rt.setPhase?.('battle');
  rt.resumingCp = true;
  rt.say = () => {}; rt.banner = () => {}; hud.bark = () => {}; hud.banner = () => {};
  try {
    let now = 0;
    for (let n = 0; n < 2000 && rt.timers.length; n++) {
      let mi = 0;
      for (let i = 1; i < rt.timers.length; i++) if (rt.timers[i].t < rt.timers[mi].t) mi = i;
      const tm = rt.timers[mi], d = Math.max(0, tm.t);
      if (now + d > span) break;
      for (const q of rt.timers) q.t -= d;
      now += d;
      rt.timers.splice(mi, 1);
      rt.t = now;
      try { tm.fn(rt); } catch (e) { console.error('段0の約束の作り直し', e); }
      if (rt.over || rt.ended) break;
    }
    for (const q of rt.timers) q.t -= span - now;
  } finally { rt.say = keep.say; rt.banner = keep.banner; hud.bark = keep.bark; hud.banner = keep.hbanner; rt.resumingCp = false; }
  rt.t = Math.max(rt.t, span);
  vanish(rt, rt.army.units.filter((u) => u.team !== 0 && (u.fleeing || u.group?.routed || u.group?.order === 'flee')));
  const dead = new Set(cp.dead || []);
  if (dead.size) vanish(rt, rt.army.units.filter((u) => u.name && u.alive && dead.has(u.name) && !u.invuln));
  if (cp.flags) for (const [k, v] of Object.entries(cp.flags)) { const cur = rt.flags[k]; if (k !== 'step' && !NO_RESTORE.test(k) && (cur === undefined || cur === null || typeof cur !== 'object' && typeof cur !== 'function')) rt.flags[k] = v; }
  if (cp.groups) vanish(rt, trimGroups(rt, cp.groups));
  if (cp.groups && cp.gx) refillGroups(rt, cp.groups, cp.gx);
  vanish(rt, dedupeNamed(rt));
  if (cp.groups) rt._cpWatch = { saved: cp.groups, known: new Set(rt.army.groups), n: rt.army.groups.length, until: rt.t + 120 };
  rt.flags.holdPlayer = false;
  const u = rt.player.u;
  u.hp = Math.max((u.maxHp || 100) * 0.4, (u.maxHp || 100) * (cp.hp || 1));
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
  rt._cpStep = cpStep(rt); rt.resumedFrom = CP_START; rt._cpStartNext = rt.t + 20;
  return true;
}

// 毎コマ：初めのコマで保存から続け、段が変わったら書く（軽い：段の番号を一つ見るだけ）
export function checkpointTick(rt) {
  if (!resumable(rt)) return;
  if (rt.resumeCp) { const cp = rt.resumeCp; rt.resumeCp = null; try { applyCheckpoint(rt, cp); } catch (e) { console.error('途中から続けられない', e); } return; }
  if (rt.over) return;
  const w = rt._cpWatch;
  if (w) {
    if (rt.t > w.until) rt._cpWatch = null;
    // 一つずつ兵を足す備（queueSpawn）は、備ができた後にも兵が増えて保存の倍になった（K363 全戦の通し：上田の後詰 32→64）。
    //   続けた後の二分は、一秒ごとに保存の時の名の備を保存の数まで詰める（増やしはしない）
    else if (rt.t >= (w.next || 0)) {
      w.next = rt.t + 1;
      for (const g of rt.army.groups) w.known.add(g);
      w.n = rt.army.groups.length;
      try { vanish(rt, trimGroups(rt, w.saved, new Set(Object.keys(w.saved)))); } catch (e) { console.error('続けた後の備の詰め', e); }
    } else if (rt.army.groups.length !== w.n) {
      const fresh = rt.army.groups.filter((g) => !w.known.has(g) && !g.isPlayerSquad && groupKey(g) in w.saved);
      for (const g of rt.army.groups) w.known.add(g);
      w.n = rt.army.groups.length;
      if (fresh.length) { try { vanish(rt, trimGroups(rt, w.saved, new Set(fresh.map(groupKey)))); vanish(rt, dedupeNamed(rt)); } catch (e) { console.error('続けた後の備の詰め', e); } }
    }
  }
  const step = cpStep(rt);
  // 段0の間は二十秒ごとに書く（開戦の溜めの後・三十秒より先だけ。続けても始めと同じなら書かない）
  if (!rt._cpReached && stepIndex(rt, step) < 0 && rt.t >= 30 && rt.t >= (rt._cpStartNext || 0) && (!rt.prelude || rt.prelude === 'done' || rt.prelude.danger)) {
    rt._cpStartNext = rt.t + 20;
    writeCheckpoint(rt, false);
  }
  // 11/20 App Store ★3：記憶切れで落ちると pagehide が来ない。段の途中も二十秒ごとに体力・生き死にを書き足す（段の始まりの時刻は変えない）
  if (step === rt._cpStep) { if (rt.t >= (rt._cpNext || 0)) { rt._cpNext = rt.t + 20; if (stepIndex(rt, step) >= 0) writeCheckpoint(rt); } return; }
  rt._cpStep = step; rt._cpNext = rt.t + 20;
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
  if (cp && known(rt, cp.step)) rt.resumeCp = cp;
  return rt.resumeCp || null;
}

