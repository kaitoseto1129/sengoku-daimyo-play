// 読み込みや舞台の作り直しをせず、同じ兵・隊・任務・時限の参照を保って戻す。
// 形・材質・素材・音・画面は写さない。開戦時と、十二秒おきの二点だけを持つ。
import { cpStep, clearCheckpoint } from './battle_checkpoint.js';
import { setAssist } from './battle_assist.js';
import { fiveGoals } from './goals5.js';
// 負けと再開（docs/rank_interlude_retry_spec_1108.md 3・kaito 11/8「14分目に死んで最初から、は絶対に避ける」）
// - 区切り（チェックポイント）：段（任務の①②③…）が変わった所・目標を果たした所で写す。加えて、導入の後（2〜4分）・戦況の変わり目（6〜9分）・
//   最終局面の前（10〜13分）の三つの窓のうちに区切りが無ければ、窓の終わりに一つ写す。写しは戦の全部（体力・持ち物・味方と武将の生死・
//   敵の隊・任務・壊れ・火・時刻・空模様・隊列）を持つ。
// - 倒れたら 3〜5 秒は戦場が続き（音は遠のく）、それから「直前から再開」（既定）／「戦の最初から」。
// - 再開では長い会話・済んだ場面を流さず、2 秒だけ「前回まで／現在」を出す。体力が極端に低ければ四割五分まで戻す。
// - 二度目の負けで手がかり一行、三度目で「援護を強くする」「このまま戦う」、四度目から「この局面を易しくする」も（battle_assist.js。その戦だけ）
const CP_WIN = [[120, 240], [360, 540], [600, 780]];   // 区切りの三つの窓（秒）
const LOSSES = new WeakMap();   // その戦で負けた数（写しに入らない）
const memories = new WeakMap();
export const RETRY_STAT = { n: 0, records: 0, fresh: 0 };   // 確かめ用：最後の写しの記録の数と、新しく作った記録の数
const HUMAN_KEYS = new Set(['human', '_humanBuild', '_humanBuildLook', '_hq', 'humanPending']);
const ROOT_KEEP = new Set(['game', 'hud', 'camera', 'def', 'environmentSound', 'warVoices', 'warSpeech', 'freezer', 'frustum', 'projView']);

// 写しは数百ミリ秒かかるので、一ミリ秒ずつ何コマかに分けて取る。
// 分けて取る間に動いた分は、物ごとに取った時のまま残る（戻す先は八秒前なので、数コマのずれは見えない）
// prev：前の写し（同じ物の値が変わっていなければ、前の写しの記録をそのまま使う＝新しく作らない。
//   写しは 12 秒ごとに数千の物・数万の鍵を作り直していて、古い写しを捨てる時の GC が重いコマになっていた。10/20 カクつきの係）
export function startRemember(rt, extra, prev = null) {
  // 前の写しは、写す間だけ見る。restore の閉包は startRemember の変数を全部つかむので、終わったら手放す
  //   （前の写し→その前の写し…と戦の始めから全部の写しと seen がつながり、捨てた束や人が残っていた。260 秒で WebContent 2GB。10/20）
  let prevMap = prev && prev.byObject || null; prev = null;
  const prevOf = (o) => prevMap ? prevMap.get(o) : undefined;
  const blocked = new Set([...ROOT_KEEP].map((k) => rt[k]));
  blocked.add(rt.world?.def);
  blocked.add(rt.army?.batch);
  // 力の計算の糸へ渡した ArrayBuffer は手放し済み（detached）。写して戻すと postMessage が落ちて戦が止まる（kaito 10/23 稲生 13・25）
  if (rt.army?._bw) blocked.add(rt.army._bw);
  // 舞台の動かない表（草木の間引きの升・近い草の置き場・矢が刺さる木の箱・木の点）は数千の物。戻す物ではないので写さない
  for (const k of ['cullList', 'nearOff', 'missileWood', 'treePoints']) if (rt.world?.[k]) blocked.add(rt.world[k]);
  const keep = (o, k) => (o === rt && ROOT_KEEP.has(k)) || (o === rt.army && k === 'batch');
  const seen = new Set(), records = [], stack = [extra, rt], time = rt.t;
  let byObject = new Map();
  // 参照の索引も一ミリ秒の枠で作る。最後に全記録を反転・再走査する山を残さない。
  let fresh = 0;
  function record(r) { records.push(r); byObject.set(r.o, r); if (!prevMap || prevMap.get(r.o) !== r) fresh++; }
  function visit(o) { if (o) stack.push(o); }
  function one(o) {
    if (!o || typeof o !== 'object' || seen.has(o) || blocked.has(o) ||
        ArrayBuffer.isView(o) || o instanceof ArrayBuffer || o.isMaterial || o.isTexture ||
        o.isBufferGeometry || o.isBufferAttribute || o.nodeType || o instanceof WeakMap || o instanceof WeakSet) return;
    seen.add(o);
    if (o.isObject3D) {
      if (o.userData?.hum || o.name === 'unitBatch' || o.isInstancedMesh || o.isBatchedMesh) return;
      // 人の骨・部品は h.bones などから直接参照されるので、その経路でも写さない。
      for (let parent = o.parent; parent; parent = parent.parent) if (parent.userData?.hum) return;
      // 模型の内部を歩かない。兵の姿勢は次の更新で描き直す。
      const children = o.children.some((c) => c.name === 'unitBatch')
        ? o.children.filter((c) => c.name !== 'unitBatch') : o.children;
      const r = prevOf(o);
      if (r && r.kind === 'shape' && r.visible === o.visible && r.pos.equals(o.position) && r.rot.equals(o.quaternion) && r.scale.equals(o.scale) && sameList(r.children, children)) { record(r); return; }
      record({ o, kind: 'shape', pos: o.position.clone(), rot: o.quaternion.clone(),
        scale: o.scale.clone(), visible: o.visible, children });
      return;
    }
    if (o instanceof Map || o instanceof Set) {
      const r = prevOf(o);
      let entries;
      if (r && r.kind === (o instanceof Map ? 'map' : 'set') && sameEntries(r.entries, o)) { entries = r.entries; record(r); }
      else { entries = [...o]; record({ o, kind: o instanceof Map ? 'map' : 'set', entries }); }
      for (const e of entries) { if (o instanceof Map) { visit(e[0]); visit(e[1]); } else visit(e); }
      return;
    }
    // 骨入りの人（humans.js の h）は、自分の鍵の値だけ覚えて中へは入らない。
    //   中（動きの mixer・骨の表・指の配列など）は一人 800 個の物・5000 の鍵があり、三つの写しで 30 万個の Map になって
    //   iPhone の WebContent を 2GB まで押し上げていた（10/19）。姿勢と動きは戻した次の更新で u の状態から描き直される
    const keys = Object.keys(o), r = prevOf(o);
    // 兵の骨入りの人（u.human）と作りかけ（_humanBuild）は写さず、戻す時も今の物をそのまま使う。
    //   写すと、捨てた人（evictHidden）が三つの写しに残り続ける（森部 70 秒で生きている人 80 に対し mixer 148・骨 1 万。10/20）。
    //   姿勢と動きは戻した次の更新で u の状態から描き直される
    const isUnit = 'human' in o && 'mesh' in o && 'pos' in o;
    // 退場した兵（遠景へ戻した・片付けた骸）は二度と出ないので写さない。戻す先で生きていた兵は、その時の写しに記録がある。
    //   写すと、起こしては戻す兵が写しのたびに増え、古い兵まで抱えて記憶が伸び続けた（10/31 設楽原・三木）
    if (isUnit && o.gone && !o.alive && !o.name && !o.isCourier && !o.civ && !o.group?.isRunner) return;
    // 消えた兵（沈み終えた亡骸・退いて消えた者）は自分の鍵だけ覚えて中へは入らない。もう動かず、戻す先でも消えたまま
    //   （10/31：援軍のたびに消えた兵の中身まで三つの写しが抱え、iPhone の記憶が毎分 6〜7MB 増えて三木・設楽原が落ちた）
    const shallow = !!(o.root && o.root.userData && o.root.userData.hum === o) || (isUnit && o.gone && !o.alive);
    // 前の写しと同じ鍵・同じ値なら、前の記録をそのまま使う（中の物はこれまでどおりたどる）
    // 鍵と値は一つの平らな配列 [鍵, 値, 鍵, 値…] に持つ（10/31 c_leak2：記録ごとの Map が三つの写しで数万個になり、
    //   記憶の多くを占めていた）。鍵の順は Object.keys の順なので、前の記録とは順に見比べる
    if (r && r.kv && r.length === o.length) {
      let n = 0, same = true;
      const kv = r.kv;
      for (const k of keys) {
        if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d?.writable) continue;
        if (kv[n] !== k || kv[n + 1] !== o[k]) { same = false; break; }
        n += 2;
      }
      if (same && n === kv.length) {
        record(r);
        if (!shallow) for (let i = 1; i < kv.length; i += 2) { const v = kv[i]; if (v && typeof v === 'object') stack.push(v); }
        return;
      }
    }
    const kv = [];
    for (const k of keys) {
      if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (!d?.writable) continue;
      const v = o[k];
      kv.push(k, v); if (!shallow && v && typeof v === 'object') stack.push(v);
    }
    record({ o, kind: Array.isArray(o) ? 'array' : 'object', kv, length: o.length });
  }
  // budgetMs ずつ進める。終われば写し（restore を持つ物）を返し、まだなら null
  return { step(budgetMs) {
    const t0 = performance.now();
    let n = 0;
    while (stack.length) {
      one(stack.pop());
      if (budgetMs > 0 && (++n & 7) === 0 && performance.now() - t0 > budgetMs) return null;
    }
    return finish();
  } };
  function finish() {
  // 写し終わりに前の写し・seen・blocked を手放す（閉包が戦の始めからの写しを鎖でつかまないように）
  prevMap = null; seen.clear(); blocked.clear(); stack.length = 0;
  RETRY_STAT.records = records.length; RETRY_STAT.fresh = fresh; RETRY_STAT.n++;
  // 索引は返す物だけが持つ（restore の閉包に残すと、外しても捨てられない）
  const index = byObject; byObject = null;
  return { time, byObject: index, restore() {
    // 記録の順は変えず、戻す時だけ末尾からたどって従来の復元順を保つ。
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i], o = r.o;
      if (r.kind === 'shape') {
        o.position.copy(r.pos); o.quaternion.copy(r.rot); o.scale.copy(r.scale); o.visible = r.visible;
        if (r.children !== o.children) {
          for (let i = o.children.length - 1; i >= 0; i--) if (o.children[i].name !== 'unitBatch' && !r.children.includes(o.children[i])) o.remove(o.children[i]);
          for (const child of r.children) if (child.parent !== o) o.add(child);
        }
        o.updateMatrix(); o.updateMatrixWorld(true);
      } else if (r.kind === 'map' || r.kind === 'set') {
        o.clear(); for (const e of r.entries) { if (r.kind === 'map') o.set(e[0], e[1]); else o.add(e); }
      } else {
        const isUnit = 'human' in o && 'mesh' in o && 'pos' in o;
        const kv = r.kv;
        let had = null;
        for (const k of Object.keys(o)) {
          if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
          const d = Object.getOwnPropertyDescriptor(o, k);
          if (!(d?.writable && d.configurable)) continue;
          if (!had) { had = new Set(); for (let i = 0; i < kv.length; i += 2) had.add(kv[i]); }
          if (!had.has(k)) delete o[k];
        }
        for (let i = 0; i < kv.length; i += 2) o[kv[i]] = kv[i + 1];
        if (r.kind === 'array') o.length = r.length;
      }
    }
    // 近くの兵を探す升目は、型付き配列（写さない＝今のまま）と普通の配列（写す＝昔に戻る）の組なので、戻すとちぐはぐになり
    //   forNear が undefined の兵を渡して戦が止まる（樫井：討たれて「少し前から」で player.js:48）。戻した兵で升目を作り直す
    try { rt.army?.rebuildGrid?.(); } catch (e) { /* 次のコマの更新で作り直される */ }
  } };
  }
}
export function rememberBattle(rt, extra) { return startRemember(rt, extra).step(0); }
// 不具合の途中の状態を再び動かさず、完成している直前の写しへ戻す。
// 一時停止の「再開する」から使い、読み込みや新しい札は増やさない。
export function recoverBattle(rt) {
  const m = memories.get(rt);
  if (!m || !m.recent) return false;
  const point = rt.t - m.recent.time >= 8 ? m.recent : m.previous;
  m.dialog?.close(); m.dialog?.remove(); m.dialog = null;
  m.pending = null; m.accept = null; m.accepting = false; m.downShown = false; m.job = null;
  m.input.clear?.(); point.restore();
  m.recent = m.previous = point; m.next = rt.t + 12;
  rt.retryOpen = false;
  rt.game.G = rt.G; rt.game.hitstop = rt.game.slowmo = 0;
  settlePlayer(rt);
  rt.hud.reset(); if (rt.choice) rt.hud.renderChoice(rt.choice);
  return true;
}
// 戻した直後の主人公を整える：引きかけ・構え・よろけを消し、持ち物（弓・槍・刀）を手に正しく持たせ、
// 体を戦える所まで戻して、数秒は倒されない（弓が引けないまま戻る不具合の元を断つ）
const RETRY_COUNT = new WeakMap();   // 戦の写しに入らない数え（戻すと消えるため）
function settlePlayer(rt) {
  const p = rt.player, u = p.u;
  if (!p || !u) return;
  u.alive = true; u.dead = false;
  // 体を戻す（11/6 共通：やり直しが命 5 で始まり、すぐ倒れた）。満たして、血も止める
  // 区切りの時の体力のまま。極端に低ければ四割五分まで戻す（kaito 11/8 仕様 3）。血は止める
  u.hp = Math.max(Number.isFinite(u.hp) ? u.hp : 0, u.maxHp * 0.45); if (u.wounds) u.wounds.bleed = 0;
  p.cancelAttack?.();
  p.draw = 0; p.bowHold = 0; p.bowTrigger = p.bowPressed = false;
  p.gunTrigger = p.gunRelease = false; p.shot = null; p.aiming = false;
  p.guardOn = p.guard = u.guard = false; p.charging = false; p.lock = p.aimed = null;
  p.knockT = p.staggerT = 0; u.stagger = 0; u.atk = null; u.reload = null; u.climb = null;
  p.cd = 0; p.sta = Math.max(p.sta, 60); p.staDelay = 0;
  p.noArrowT = p.bowTiredUntil = 0;
  if (p.hasBow && !(p.bowAmmo >= 8)) p.bowAmmo = 8;
  const meshOf = (w) => ({ sword: p.swordMesh, gun: p.gunMesh, bow: p.bowMesh }[w] || p.spearMesh);
  if (!meshOf(p.weapon) || !p.weaponList().includes(p.weapon)) p.weapon = 'spear';
  const want = meshOf(p.weapon);
  for (const w of [p.spearMesh, p.swordMesh, p.gunMesh, p.bowMesh]) if (w && w !== want && w.parent === u.hand) u.hand.remove(w);
  if (want && want.parent !== u.hand) u.hand.add(want);
  u.wpn = want; u.wpnKind = p.weapon;
  // 11/8 critic60 稲葉山：戻った所が撃たれる真ん前でも、すぐ倒れない。続けて戻すほど長く守る（八秒から最大二十秒）
  const now = performance.now(), c = RETRY_COUNT.get(rt) || { n: -1, at: -Infinity };
  c.n = now - c.at < 90000 ? c.n + 1 : 0; c.at = now; RETRY_COUNT.set(rt, c);
  p.retryGraceUntil = rt.t + Math.min(20, 8 + c.n * 4);
}
function sameList(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function sameEntries(entries, o) {
  if (entries.length !== o.size) return false;
  let i = 0;
  if (o instanceof Map) { for (const [k, v] of o) { const e = entries[i++]; if (e[0] !== k || e[1] !== v) return false; } }
  else { for (const v of o) if (entries[i++] !== v) return false; }
  return true;
}

export function retryTick(rt, input, extra, dt) {
  let m = memories.get(rt);
  if (!m) {
    if (rt.def.town) return false;
    // 開戦の写しも一ミリ秒ずつ何コマかに分けて取る（比叡山で一コマ目に一度に取り、170ms 止まっていた。11/1）。取り終えるまで札は出さない
    m = { start: null, startJob: startRemember(rt, extra), recent: null, previous: null, next: rt.t + 12, dialog: null, accepting: false, input };
    memories.set(rt, m);
  }
  if (m.startJob) {
    const start = m.startJob.step(1.0);
    if (!start) return false;
    m.start = m.recent = m.previous = start; m.startJob = null; m.next = rt.t + 12;
  }
  // 倒れた動きを同じ視点で一秒見せてから札を開く。
  if (m.pending) {
    m.pending.left -= dt;
    if (m.pending.left <= 0) {
      const pending = m.pending; m.pending = null;
      offerRetry(rt, pending.info, pending.delay);
    }
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 選ぶ間に戦況を止める戦でも、札自身の期限は進める。
  if (m.dialog) {
    m.left -= dt;
    if (m.left <= 0) m.accept();
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 目標を一つ果たした時の点を残す（「少し前から」はここから始める）
  const doneN = rt.def.retryGoalCount?.(rt) ?? (rt.objectives ? rt.objectives.filter((o) => o.kind === 'main' && o.state === 'done').length : 0);
  if (m.doneN === undefined) m.doneN = doneN;
  // 段（任務の①②③…）が変わった時も、その段の始まりを残す（kaito 11/8：同じ id の任務を書き換えて段を進める戦では
  //   済みの数が増えず、「少し前から」が戦の始めに戻っていた。天王寺・岡山）。段の始まりは体力を問わない（戻す時に満たす）
  const sk = cpStep(rt);
  if (m.sk === undefined) m.sk = sk;
  if (sk !== m.sk && !m.goalJob && !rt.over && rt.player.u.alive) {
    m.sk = sk; m.doneN = Math.max(m.doneN, doneN); m.goalJob = startRemember(rt, extra, m.goal || m.recent);
  } else if (doneN > m.doneN && !m.goalJob && !rt.over && rt.player.u.alive && (rt.def.retryGoalCount || rt.player.u.hp >= rt.player.u.maxHp * 0.5)) {
    m.doneN = doneN; m.goalJob = startRemember(rt, extra, m.goal || m.recent);
  } else if (doneN < m.doneN) m.doneN = doneN;
  // 三つの窓：窓のうちに区切りが無ければ、窓の終わりに写す（段の無い戦・長い段の戦でも、最初からに戻らない）
  if (m.win === undefined) m.win = 0;
  while (m.win < CP_WIN.length && (m.cpAt ?? -1) >= CP_WIN[m.win][0]) m.win++;
  if (m.win < CP_WIN.length && rt.t >= CP_WIN[m.win][1] && !m.goalJob && !rt.over && rt.player.u.alive && rt.player.u.hp >= rt.player.u.maxHp * 0.3) {
    m.win++; m.goalJob = startRemember(rt, extra, m.goal || m.recent); m.goalLabel = cpLabel(rt);
  }
  if (m.goalJob) {
    if (!m.goalLabel) m.goalLabel = cpLabel(rt);
    const g = m.goalJob.step(1.0);
    if (g) { if (m.goal) m.goal.byObject = null; m.goal = g; m.goalJob = null; m.cpAt = g.time; m.cp = m.goalLabel; m.goalLabel = null; }
  }
  // 深手になる前の時点を残す。直前の八秒を必ず空け、戻った瞬間の同じ一撃を避ける。
  if (m.job) {
    const done = m.job.step(1.0);   // 一ミリ秒ずつ。終わるまで前の写しを残す
    if (done) {
      // 索引（byObject）は次の写しの見比べにだけ使う。古い写しからは外し、三つの写しが全部の索引を抱えないように
      if (m.recent) m.recent.byObject = null;
      m.previous = m.recent; m.recent = done; m.next = rt.t + 12; m.job = null;
    }
  } else if (!rt.over && rt.player.u.alive && rt.player.u.hp >= rt.player.u.maxHp * 0.5 && rt.t >= m.next) {
    // 写す間は、十二秒以上前の recent が「少し前」の戻り先。その前の写しは要らないので先に捨てる（写しを三つ重ねて抱えない）
    m.previous = m.recent;
    m.job = startRemember(rt, extra, m.recent);
  }
  return false;
}

// 区切りの札の字：済んだ目標（前回まで）と今の目標（現在）。目標5つ（goals5.js）があればそれ、無ければ勝ちの一行
function cpLabel(rt) {
  let before = '', now = '';
  try {
    const F = fiveGoals(rt);   // 今のコマの済み・まだを見直してから読む（段が変わったコマでも、済んだ段が「前回まで」に入る）
    for (const r of F?.rows || []) {
      if (!r.text || r.kind === 'kills' || r.kind === 'hurt') continue;
      if (r.done) before = r.text; else if (!now && !r.fail) now = r.text;
    }
    if (!now) now = rt.victoryText?.() || '';
  } catch (e) { /* 字が無ければ出さない */ }
  return { before, now };
}
// 再開の時に 2 秒だけ出す札（読めなくても遊べる。押す所は無い）
function showResumeCard(rt, label) {
  if (!label || !(label.before || label.now)) return;
  document.getElementById('resume-card')?.remove();
  const el = document.createElement('div');
  el.id = 'resume-card'; el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:22;pointer-events:none;background:rgba(20,18,15,.88);color:#ece4d2;border:1px solid #c2a25a;border-radius:8px;padding:10px 18px;font-size:16px;line-height:1.6;max-width:calc(100vw - 32px);text-align:center';
  const row = (k, v) => { const p = document.createElement('div'); const b = document.createElement('span'); b.style.color = '#c2a25a'; b.textContent = k + '　'; p.append(b, v); return p; };
  if (label.before) el.append(row('前回まで', label.before));
  if (label.now) el.append(row('現在', label.now));
  document.body.appendChild(el);
  const off = () => el.remove();
  rt.cleanupTasks?.add(off);
  setTimeout(off, 2000);
}
// 二度目の負けから添える手がかりの一行。戦が retryHint を書いていればそれ、無ければ何にやられたかから
function retryHint(rt, info) {
  const own = rt.def.retryHint?.(rt, info);
  if (own) return own;
  const hit = rt.player.lastHit;
  if (hit && rt.t - (hit.t ?? -99) < 20) {
    if (hit.ranged || hit.kind === 'arrow' || hit.kind === 'gun') return '矢と鉄砲の前に立ち止まらず、横から回ろう';
    if (hit.back || hit.side) return '囲まれる前に、味方の列へ戻ろう';
    if (hit.kind === 'fire') return '火の手を避けて、別の道から回ろう';
  }
  return info.down ? '一人で前に出ず、味方と並んで戦おう' : '行き先の印から離れずに戦おう';
}

// 詳しい成績は結果へ回し、戦場では起きた事を一行で伝える。
function retryReason(rt, info) {
  if (info.down) {
    const hit = rt.player.lastHit;
    return hit?.kind === 'fire' ? '火で大きな傷を負った' : hit?.kind === 'fall' ? '高い所から落ちた' :
      hit?.ranged ? '矢や鉄砲で傷を負った' : '傷が重なり、戦えなくなった';
  }
  const reason = info.failureReason || rt.downReason || rt.loseReason();
  const battleReason = rt.def.retryReason?.(rt, info);
  if (battleReason) return battleReason;
  if (/守り.*通|本陣.*(押|破|落|入)/.test(reason)) return '本陣に 敵が入った';
  if (/長引|時間|間に合/.test(reason)) return '敵を止めきれなかった';
  const first = String(reason || '').split(/[。！？]/)[0];
  return first && first.length <= 22 ? first : '味方が押され、守りきれなかった';
}

// 負けた理由の下に、次にする事を一行で添える（やり直す前に読める短さ）。
function retryText(rt, info) {
  const reason = retryReason(rt, info), hit = rt.player.lastHit;
  // 次にする事の案内の字は既定で出さない（五1 説明の字・九7 ひらがな。11/6 共通の係で全戦）。戦が retryAdvice を書いた時だけ添える
  void hit;
  const next = rt.def.retryAdvice?.(rt, info) || '';
  return next ? `${reason}\n${next}` : reason;
}

export function offerRetry(rt, info, delay) {
  const m = memories.get(rt);
  if (!m || m.accepting || !m.start) return false;
  if (m.dialog || m.pending) {
    // 攻め止めの札を読んでいる間に倒れた時も、実際の傷と理由を結果へ渡す。
    if (info.down) {
      if (m.pending) { m.pending.info = info; m.pending.delay = delay; }
      else {
        m.info = info; m.delay = delay;
        m.dialog.querySelector('h2').textContent = info.dead ? '討死' : '負傷';
        m.dialog.querySelector('[data-reason]').textContent = info.down ? '' : retryText(rt, info);
        m.dialog.querySelector('[data-reason]').hidden = !!info.down;
      }
    }
    return true;
  }
  if (!info.down && rt.tracker.main !== false) return false;
  // 勝ちが決まった後（締めの場面・結果待ち）の傷では、やり直しの札を出さない。初めの戦の札は選ぶまで閉じず、勝った戦が終わらなかった（11/8 真田丸・関ヶ原）
  if (rt.tracker.main === true && (rt.over || rt._closing || rt.flags.ending)) return false;
  if (info.down && !m.downShown) {
    m.downShown = true; m.pending = { info, delay, left: rt.army?.lethal ? 4.5 : rt.index === 0 ? 3 : 4 }; rt.retryOpen = true;   // 倒れてから 3〜5 秒は戦場が続く（音は playerDown が遠のかせる）
    return true;
  }
  const first = rt.index === 0 && !rt.G.lord && !rt.def.dojo;
  const d = document.createElement('dialog');
  d.className = 'battle-retry';
  d.style.cssText = 'position:fixed;margin:0;z-index:50;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;border-radius:8px;box-sizing:border-box;width:min(304px,calc(100vw - 24px));padding:12px;max-height:calc(100dvh - 24px)';
  d.setAttribute('aria-labelledby', 'battle-retry-title');
  const lost = (LOSSES.get(rt) || 0) + 1; LOSSES.set(rt, lost);
  d.style.overflowY = 'auto';
  const B = (k, t, main) => `<button class="btn${main ? ' primary' : ''}" ${k} style="min-height:44px">${t}</button>`;
  d.innerHTML = '<h2 id="battle-retry-title" style="font-size:20px;margin:0"></h2><p data-reason style="white-space:pre-line;font-size:max(20px, calc(20px * var(--text-scale, 1)));line-height:1.5;margin:8px 0"></p><p data-hint hidden style="font-size:16px;line-height:1.5;margin:0 0 8px;color:#f3e2b4"></p><div class="retry-actions" style="display:flex;flex-direction:column;gap:8px">' +
    (lost >= 3 ? B('data-support', '援護を強くする') + B('data-near', 'このまま戦う', true) + (lost >= 4 ? B('data-easy', 'この局面を易しくする') : '') : B('data-near', '直前から再開', true)) +
    B('data-start', '戦の最初から') + B('data-result', '結果を見る') + '</div><div class="retry-reading" hidden><p data-cause></p><p></p></div>';
  if (lost >= 2) { const h = d.querySelector('[data-hint]'); h.textContent = retryHint(rt, info); h.hidden = false; }
  d.querySelector('h2').textContent = info.down ? (info.dead ? '討死' : '負傷') : '戦に負けた';
  d.querySelector('[data-reason]').textContent = info.down ? '' : retryText(rt, info);
  d.querySelector('[data-reason]').hidden = !!info.down;
  m.dialog = d; m.info = info; m.delay = delay; m.left = first ? Infinity : 30; rt.retryOpen = true;
  window.speechSynthesis?.cancel();
  // 開戦の札や、自分で開いた一時停止の状態には触れない。
  document.body.appendChild(d); d.setAttribute('open', '');
  // Web の釦にキーの字（kaito 11/3 AV17）。携帯（指）では出さない
  const keys = { r: '[data-near]', t: '[data-start]', q: '[data-result]' };
  const onKey = (e) => {
    const b = !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && keys[e.key.toLowerCase()];
    if (b) { e.preventDefault(); e.stopPropagation(); d.querySelector(b)?.click(); }
  };
  if (!(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)) {
    for (const [k, sel] of Object.entries(keys)) { const b = d.querySelector(sel); if (b) b.textContent += `（${k.toUpperCase()}）`; }
    document.addEventListener('keydown', onKey, true); m.onKey = onKey;
  }
  const close = () => { document.removeEventListener('keydown', onKey, true); d.close(); d.remove(); m.dialog = null; m.accept = null; rt.retryOpen = false; };
  const restore = (point, label = null) => {
    close(); m.downShown = false; m.job = null; m.input.clear?.(); point.restore();
    // 再開で長い会話を流し直さない：字幕の列と読み上げを捨てる
    window.speechSynthesis?.cancel(); if (rt.hud.subQ) { rt.hud.subQ.length = 0; rt.hud.subT = 0; }
    // 未来の点へは戻さない。次の保存も、戻した戦の時刻から数える。
    m.recent = m.previous = point; m.next = rt.t + 12;
    rt.player.u.graceUntil = rt.army.time + 8;
    rt.game.G = rt.G; rt.game.hitstop = rt.game.slowmo = 0;
    settlePlayer(rt);
    rt.hud.reset(); if (rt.choice) rt.hud.renderChoice(rt.choice);
    rt.game.resumeBattleRetry();
    rt.player.updateCamera(1, rt.camera); rt.hud.update(0, rt);
    rt.game.requestLock();
    showResumeCard(rt, label);
  };
  const near = (o) => {
    const p = m.goal || (rt.t - m.recent.time >= 8 ? m.recent : m.previous);
    restore(p, p === m.goal ? m.cp : cpLabel(rt));
    if (o) setAssist(rt.army, o);   // 写しを戻した後に置く（Symbol の鍵なので次の再開でも残る）
  };
  d.querySelector('[data-near]').onclick = () => near(null);
  const sup = d.querySelector('[data-support]'), easy = d.querySelector('[data-easy]');
  if (sup) sup.onclick = () => near({ support: true });
  if (easy) easy.onclick = () => near({ support: true, easy: true });
  // 最初から：途中の保存も消す（保存から続けた戦では、続けた段の始まり）
  d.querySelector('[data-start]').onclick = () => { if (!rt.resumedFrom) clearCheckpoint(rt); m.goal = null; m.cp = null; m.cpAt = -1; m.win = 0; restore(m.start); };
  m.accept = () => {
    close(); m.accepting = true;
    rt.finish(m.info, m.delay);
  };
  d.querySelector('[data-result]').onclick = m.accept;
  if (first) {
    if (document.pointerLockElement) document.exitPointerLock?.();
    m.input.clear?.();
    d.querySelector('[data-near]').focus({ preventScroll: true });
  }
  return true;
}

export function disposeRetry(rt) {
  const m = memories.get(rt);
  if (m?.onKey) document.removeEventListener('keydown', m.onKey, true);
  if (m?.dialog) { m.dialog.close(); m.dialog.remove(); }
  memories.delete(rt); rt.retryOpen = false;
}
