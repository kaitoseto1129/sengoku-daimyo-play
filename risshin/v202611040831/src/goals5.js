// 全戦の「目標5つ」（kaito 11/2 Q「目標がどんどん変わりすぎ。5つ全部を最初から出し、済んだ物にチェック。達成した数で星1〜5。
//   大将を自分で討たずに終わったら星が下がる」・O「倒す数を出す」）。
//   目標は戦の始めに一度だけ決め、戦の間は並びを変えない。済んだ物は戻さない。果たせなくなった物（大将を味方が討った・時が過ぎた）は fail。
//   並べ方（どの戦も同じ）：戦の段（stages.js）の一行 → 敵の大将を自分で討つ → 時のうちに勝つ → 敵を何人討つ → 深手を負わずに勝つ、で5つまで埋める。
//   段が多い戦は後ろの段（勝ちにつながる段）を残す。稲生だけは段の中の目標から5つを選ぶ（B 節の作り）。
//   目当て（target）：今の目標の相手と場所。右上の地図のひし形・地面の矢印・頭上の名前（goal_sign.js）が同じ物を指す。
import { STAGES, stageNow } from './stages.js';
import { missionTarget } from './mission_pin_target.js';

const KILL_N = 8;          // 「敵を何人討つ」の数
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
const won = (rt) => rt.tracker?.main === true;
const aliveIn = (gs) => (gs || []).reduce((n, g) => n + (g?.units || []).reduce((m, u) => m + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0), 0);
const allIn = (gs) => (gs || []).reduce((n, g) => n + (g?.units?.length || 0), 0);

// 目標の字から、相手の呼び名を取る（「後ろの弓組を討つ」→「後ろの弓組」・「雨に紛れ、今川の本陣へ迫る」→「今川の本陣」）
export function goalNoun(text) {
  const last = String(text || '').split('、').pop();
  const m = /^(.+?)(?:を|へ|まで|に)/.exec(last);
  const n = m ? m[1] : '';
  return n.length >= 2 && n.length <= 9 && !/^(敵|雨|時|組)$/.test(n) ? n : '';
}

function stageGoal(k, text) {
  return { kind: 'stage', k, text, check: (rt) => won(rt) || (stageNow(rt)?.i ?? 0) > k };
}
function bossGoal(name) {
  return {
    kind: 'boss', name, text: `${name}を自分で討つ`,
    check: (rt) => !!rt._g5?.own.has(name),
    fail: (rt) => { const u = bossUnit(rt, name); return !rt._g5?.own.has(name) && (rt._g5?.dead.has(name) || (rt.over && !!u)); },
  };
}
function killGoal(n) {
  return { kind: 'kills', n, text: `敵を${NUM[n] || n}人討つ`, count: (rt) => [Math.min(n, rt.stats?.kills || 0), n], check: (rt) => (rt.stats?.kills || 0) >= n };
}
function hurtGoal() {
  return { kind: 'hurt', text: '深手を負わずに勝つ', check: (rt) => won(rt) && !rt._g5?.deep, fail: (rt) => !!rt._g5?.deep };
}
// 時の制限は目標一つ一つにかける（kaito 11/3 AP8）。今の目標になった時から数え、過ぎたら ✕（星は戻らない）。目当てと進みは続く
const SEC = { stage: 200, main: 420, boss: 300 };
const withSec = (g) => (SEC[g.kind] && !g.sec ? { ...g, sec: SEC[g.kind] } : g);
const flag = (k) => (rt) => !!rt.flags?.[k];

// 稲生（B 節）：先手 → 弓組 → 二の備 → 美作守 → 時のうち。崩す備は倒した数を出す
const OWN = {
  inou: () => [
    { kind: 'stage', k: 1, text: '柴田の先手を崩す', check: flag('line1Broken'), groups: (rt) => rt.flags.l1, total: (rt) => rt.flags.l1N },
    { kind: 'stage', k: 2, text: '後ろの弓組を討つ', check: flag('bowsDown'), groups: (rt) => rt.flags.bows },
    { kind: 'stage', k: 2, text: '林の二の備を退ける', check: flag('line2Broken'), groups: (rt) => rt.flags.l2, total: (rt) => rt.flags.l2N },
    { ...bossGoal('林美作守'), k: 3 },
    hurtGoal(),
  ],
};

function build(rt) {
  const key = rt.def.key;
  if (OWN[key]) return OWN[key](rt).map(withSec);
  const list = STAGES[key];
  const T = rt.taisho?.b;
  // 敵の大将：総大将の表（taisho.js）。無い戦は、討つ段の一行の頭の名（「長井甲斐守・日比野下野守を討つ」→ 長井甲斐守）
  let boss = T && T.name && !T.survives ? T.name : null;
  if (!boss && !(T && T.survives) && list) {
    const last = [...list].reverse().find((s) => /^[^、]{2,}を討/.test(s[0]) && !/^(敵|兵)/.test(s[0]));
    const nm = last && last[0].split('を討')[0].split('・')[0];
    if (nm && nm.length >= 3 && nm.length <= 6 && !/[のと]/.test(nm)) boss = nm;
  }
  let stages = list ? list.map((s, k) => ({ k, text: s[0] })).filter((s) => s.text !== '練習') : [];
  let bossIn = false;
  stages = stages.map((s) => (boss && s.text.includes(boss.slice(0, 2)) && /討/.test(s.text) ? (bossIn = true, { ...s, boss: true }) : s));
  const extras = (boss && !bossIn ? 1 : 0) + 1;
  const nS = Math.max(1, Math.min(stages.length, 5 - extras));
  stages = stages.slice(stages.length - nS);
  const goals = [];
  for (const s of stages) goals.push(s.boss ? { ...bossGoal(boss), k: s.k } : stageGoal(s.k, s.text));
  if (!list) goals.push({ kind: 'main', text: '', check: won, textOf: (rt) => mainText(rt) });
  if (boss && !bossIn) goals.push(bossGoal(boss));
  if (goals.length < 5) goals.push(killGoal(KILL_N));
  if (goals.length < 5) goals.push(hurtGoal());
  if (goals.length < 5) goals.push(killGoal(KILL_N * 2));
  return goals.slice(0, 5).map(withSec);
}

// 段の無い戦（豊臣編・徳川編など）の一つ目：その戦の主の任務の一行
function mainText(rt) {
  const o = (rt.objectives || []).find((x) => x && x.kind === 'main' && x.text);
  let t = String(o?.text || rt.def.goal || '').split(/[。（(]/)[0].trim();
  if (t.length > 18) t = t.split('、').pop();
  return t && t.length <= 18 ? t : '戦に勝つ';
}

function bossUnit(rt, name) {
  const G = rt._g5;
  if (G && G.bossU && G.bossU.name === name && G.bossU.alive && !G.bossU.gone) return G.bossU;
  const me = rt.player?.u?.team ?? 0;
  const u = (rt.army?.units || []).find((o) => o.alive && !o.gone && o.team !== me && o.name === name) || null;
  if (G) G.bossU = u;
  return u;
}

function ensure(rt) {
  if (!rt || rt.def?.town || rt.def?.dojo || !rt.player?.u) return null;
  if (rt._g5) return rt._g5;
  rt._g5 = { goals: [], done: [], fail: [], late: [], pass: [], nowI: -1, nowT0: 0, own: new Set(), dead: new Set(), deep: false, t0: rt.t || 0, endT: null, bossU: null, tgAt: -1, tg: null };
  rt._g5.goals = build(rt);
  return rt._g5;
}

// 毎コマ（hud から）。済んだ・果たせなくなったを確かめ、5つの今の様子を返す
export function fiveGoals(rt) {
  const G = ensure(rt);
  if (!G) return null;
  const u = rt.player.u;
  if (!rt.over && u.alive && u.maxHp && u.hp / u.maxHp < 0.3) G.deep = true;
  if ((rt.over || won(rt)) && G.endT == null) G.endT = rt.t;
  const nowOf = () => G.goals.findIndex((g, i) => (g.kind === 'stage' || g.kind === 'main' || g.kind === 'boss') && !G.pass[i] && !G.done[i] && !(G.fail[i] && !G.late[i]));
  const rows = G.goals.map((g, i) => {
    if (!G.done[i] && !G.fail[i]) {
      let ok = false;
      try { ok = !!g.check(rt); } catch (e) { ok = false; }
      if (ok) G.done[i] = true;
      else { let ng = false; try { ng = !!g.fail?.(rt); } catch (e) { ng = false; } if (ng) G.fail[i] = true; }
    } else if (G.late[i] && !G.pass[i]) {
      try { if (g.check(rt)) G.pass[i] = true; } catch (e) { /* 続ける */ }
    }
    let count = null;
    try {
      if (g.count) count = g.count(rt);
      else if (g.groups && !G.done[i]) { const gs = g.groups(rt); const all = g.total?.(rt) || allIn(gs); if (all > 0) count = [all - aliveIn(gs), all]; }
    } catch (e) { count = null; }
    return { text: g.textOf ? g.textOf(rt) : g.text, kind: g.kind, done: !!G.done[i], fail: !!G.fail[i], count, left: null };
  });
  // 今の目標：済んでいない最初の段の目標（無ければ大将）。残りの時は、今の目標になった時から数える
  const now = nowOf();
  if (now !== G.nowI) { G.nowI = now; G.nowT0 = G.endT ?? rt.t; }
  if (now >= 0 && G.goals[now].sec && !G.done[now] && !G.fail[now]) {
    const left = G.goals[now].sec - ((G.endT ?? rt.t) - G.nowT0);
    if (left <= 0 && !rt.over) { G.fail[now] = true; G.late[now] = true; rows[now].fail = true; }
    else rows[now].left = Math.max(0, left);
  }
  return { rows, now, stars: starsOf(rt, rows) };
}

const starsOf = (rt, rows) => Math.max(won(rt) ? 1 : 0, rows.filter((r) => r.done).length);

// 今の目標の相手と場所 { x, z, unit, label }（四分の一秒ごとに選び直す）
export function goalTarget(rt) {
  const G = rt?._g5;
  if (!G || rt.over) return null;
  if (rt.t < G.tgAt && rt.t > G.tgAt - 0.3) return G.tg;
  G.tgAt = rt.t + 0.25; G.tg = null;
  const f = fiveGoals(rt);
  if (!f || f.now < 0) return null;
  const g = G.goals[f.now], text = f.rows[f.now].text;
  const me = rt.player.u.team;
  let unit = null, x = NaN, z = NaN;
  if (g.kind === 'boss') unit = bossUnit(rt, g.name);
  if (!unit && /討/.test(text)) unit = (rt.army?.units || []).find((o) => o.alive && !o.gone && o.team !== me && o.name && o.name.length >= 2 && text.includes(o.name)) || null;
  if (unit) { x = unit.pos.x; z = unit.pos.z; }
  if (!unit && g.groups) {
    let sx = 0, sz = 0, n = 0;
    for (const gr of g.groups(rt) || []) for (const o of gr?.units || []) if (o.alive && !o.gone) { sx += o.pos.x; sz += o.pos.z; n++; }
    if (n) { x = sx / n; z = sz / n; }
  }
  if (!Number.isFinite(x)) {
    let p = null;
    try { p = missionTarget(rt); } catch (e) { p = null; }
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) { x = p.x; z = p.z; if (p.unit?.alive && p.unit.team !== me) unit = p.unit; }
  }
  let around = false;
  if (!Number.isFinite(x) && /本陣|旗本|馬廻|大将/.test(text)) {
    // 行き先の定めの無い時：本陣・旗本は敵の大将の周り
    const bg = G.goals.find((q) => q.kind === 'boss');
    const bu = bg ? bossUnit(rt, bg.name) : (rt.taisho?.b?.u?.alive ? rt.taisho.b.u : null);
    if (bu) { x = bu.pos.x; z = bu.pos.z; around = true; }
  }
  if (!Number.isFinite(x) && /先手|備|勢|組|兵|敵|勝/.test(text)) {
    // 敵の隊：自分にいちばん近い敵の固まり（近い八人の真ん中）
    const P = rt.player.u.pos, near = [];
    for (const o of rt.army?.units || []) {
      if (!o.alive || o.gone || o.team === me || o.civ || o.isStruct || o.noTarget || o.fleeing || o.team > 1) continue;
      const d = (o.pos.x - P.x) ** 2 + (o.pos.z - P.z) ** 2;
      if (near.length < 8) { near.push([d, o]); near.sort((a, c) => a[0] - c[0]); } else if (d < near[7][0]) { near[7] = [d, o]; near.sort((a, c) => a[0] - c[0]); }
    }
    if (near.length >= 3) { x = near.reduce((n, q) => n + q[1].pos.x, 0) / near.length; z = near.reduce((n, q) => n + q[1].pos.z, 0) / near.length; }
  }
  if (!Number.isFinite(x)) return null;
  G.tg = { x, z, unit: around ? null : unit, label: unit?.name && !around ? '' : goalNoun(text), boss: g.kind === 'boss' };
  return G.tg;
}

// battle.js の onKill から：自分で討った名のある者・討たれた大将を覚える
export function goalsKill(rt, v, k) {
  const G = rt?._g5;
  if (!G || !v?.name) return;
  if (k?.isPlayer) G.own.add(v.name);
  G.dead.add(v.name);
}

// 戦の後の結果の札（screens.js）へ：5つの目標と星の数
export function goalsResult(rt) {
  const f = fiveGoals(rt);
  if (!f) return null;
  return { rows: f.rows.map((r) => ({ t: r.text, on: r.done })), stars: f.stars };
}
