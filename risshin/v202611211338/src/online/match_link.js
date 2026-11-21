// 試合（match.js・cloud-18）の降伏の札と回線の切断の口（K587・クラウド k365-cloud-40）。決まりの数は ../pvp_rules.js
//   match.js は rt.flags.match（M）を持つ。ここは M に link（切断の帳面）を足し、降伏と切断・戻りを M の上で行う。
//   画面と通信（降伏の札・net_session の leave/join）からは、この三つを呼ぶだけ：
//     matchSurrender(rt, team)           … 降伏の札を押した（出来なければ { ok:false, why, wait } を返す。札は出したまま）
//     matchDrop(rt, team, intentional)   … その席の回線が切れた（intentional＝本人が「戦を抜ける」を押した）
//     matchBack(rt, team)                … その席が戻った（同じ武将へ戻す）
import { canSurrender, surrenderResult, createLink, onDrop, onBack, dropResult } from '../pvp_rules.js';

const START = 1000;   // 一武将の始めの兵（army4k の UNIT_STRENGTH と同じ）

function sideOf(M, team) { return (M?.sonae || []).filter((s) => s.team === team); }
const strengthOf = (L) => L.reduce((n, s) => n + Math.max(0, s.strength ?? s.b?.aliveNominal?.() ?? s.nominal ?? 0), 0);

// 降伏：始めの三分は出来ない・残り五分か兵力が相手の四割五分未満なら出来る（pvp_rules.canSurrender）
export function matchSurrender(rt, team = 0) {
  const M = rt.flags?.match;
  if (!M || M.over) return { ok: false, why: 'over' };
  const mine = sideOf(M, team), foe = sideOf(M, 1 - team);
  const st = { t: rt.t - M.t0, length: 900, myStrength: strengthOf(mine), foeStrength: strengthOf(foe), myStart: mine.length * START };
  const c = canSurrender(st);
  if (!c.ok) return c;
  M.over = true;
  M.result = { over: true, winner: 1 - team, why: 'surrender', overtime: false, ...surrenderResult(st) };
  if (team === 0) rt.finish({ failureReason: '降伏した', scriptedEnd: true }, 4);
  else { if (rt.tracker) rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 4); }
  return { ok: true, result: M.result };
}

// 切断：その席の備（武将と隊）を、すぐ AI が継ぐ。隊も武将も消さない（s.byAI を立てるだけ。動かすのは general_ai）
export function matchDrop(rt, team, intentional = false) {
  const M = rt.flags?.match;
  if (!M) return null;
  M.link ||= createLink();
  const r = onDrop(M.link, team, rt.t, intentional);
  for (const s of sideOf(M, team)) s.byAI = true;
  return r;
}

// 戻り：同じ武将へ戻す
export function matchBack(rt, team) {
  const M = rt.flags?.match;
  if (!M?.link) return null;
  const r = onBack(M.link, team, rt.t);
  if (r.hand === 'human') for (const s of sideOf(M, team)) s.byAI = false;
  return r;
}

// 戦の後：わざと抜けた負けかどうか（段位の点の失いを重くする）
export function matchLeaveResult(rt, team) {
  const M = rt.flags?.match;
  return M?.link ? dropResult(M.link, team) : { leftOnPurpose: false, rankLoss: 1 };
}

// ---- 試合の後の褒美（一度だけ）：main.js の endBattle から決着の時に呼ぶ ----
//   試合の印（M.id）を決着の時に一つ決め、帳（online の保存の matchBook）に覚える。二度呼ばれても、読み込み直しでも二重にならない
export async function matchSettle(rtOrM, team = 0) {
  // 試合の帳（M）そのものを受けてもよい（戦を片付けた後は rt.flags が空になるので、main.js は片付ける前に M を持っておく）
  const M = rtOrM?.flags ? rtOrM.flags.match : rtOrM;
  if (!M) return null;
  M.id ||= `m${Math.round(M.t0 * 1000)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const [Ho, R] = await Promise.all([import('./house.js'), import('./match_reward.js')]);
  const save = Ho.loadOnline?.();
  if (!save) return null;
  save.matchBook ||= R.newMatchBook();
  const left = M.link ? dropResult(M.link, team).leftOnPurpose : false;
  const d = new Date(), day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;   // index.js の登用の日（dailyReset）と同じ書き方
  const r = R.settleMatch(save.matchBook, { id: M.id, outcome: R.outcomeOf(M.result, left), generals: (M.o?.generals || []).slice(0, 4),
    practice: !!M.o?.practice, day });
  // 毎日の務め（33 tsutome.js が正）：40 と決めて一つの形に（11/21）＝ここで、褒美と同じ一度だけの守り（applied）の内に、保存の前に直に数える
  //   （知らせの event と受け口は使わない：受け口が無い時の数え0・二つの口での二度数えを無くす）。練習とわざと抜けた試合は数えない。
  //   無料の登用は tsutome の claim が toyo_rules.grantTaskFree で一か所だけ付ける（ここでは付けない）
  if (r.applied && !r.practice && r.outcome !== 'leave') {
    const H = (M.sonae || []).find((s) => (s.team ? 1 : 0) === team && s.line === 'honjin');
    const honjinHeld = H ? !H.taishoDead && H.state !== '敗走' : !(M.result?.winner === 1 - team && M.result?.why === 'honjin');
    try { const T = await import('./tsutome.js'); T.recordMatch(save, { matchId: M.id, win: r.outcome === 'win', honjinHeld, tactics: M.tactics?.[team] ?? M.myTactics ?? 0 }); } catch (e) { /* 務めが数えられなくても褒美は付ける */ }
  }
  if (r.applied) Ho.saveOnline(save);
  M.reward = r;
  if (M.result && typeof M.result === 'object') M.result.reward = r;   // 勝ち負けの札（showMatchEnd）が銭の数を出す（33）
  return r;
}

// ---- 試合の終わりの札（main.js の endBattle が def.onlineMatch の時に呼ぶ）----
//   稽古場の結果（討ち取り・第何陣・稽古場の最高記録）を出さず、勝ち・負け・引き分けと、何で決まったかを出して、オンラインのホームへ戻る。
//   時間切れは pvp_rules の点の表（兵の残り・士気・本陣・戦線・討ち取り）のうち、一番差の付いた項を理由に出す（11/21 cloud-26 の札と一本化・英語も）
const LEAD = { strength: '残りの兵', morale: '全軍の士気', honjin: '本陣の守り', front: '戦線の支配', kills: '敵の武将の討ち取り' };
const EN = { 勝ち: 'Victory', 負け: 'Defeat', 引き分け: 'Draw', ホームへ戻る: 'Back to home', 模擬合戦: 'Practice battle', 合戦: 'Battle',
  相手の本陣を崩した: 'You broke the enemy HQ', 味方の本陣が崩れた: 'Your HQ fell', 相手の全軍が崩れた: 'The enemy army broke', 味方の全軍が崩れた: 'Your whole army broke',
  自分の武将が皆討たれた: 'All your generals have fallen', 相手の武将を皆討ち取った: 'You took every enemy general',
  相手が降伏した: 'The enemy surrendered', 降伏した: 'You surrendered', '時間切れの判定で、両軍の点が並んだ': 'Time up: both armies scored the same',
  残りの兵: 'remaining troops', 全軍の士気: 'army morale', 本陣の守り: 'HQ defense', 戦線の支配: 'control of the front', 敵の武将の討ち取り: 'enemy generals taken' };
export function matchEndText(r = {}, en = false) {
  const T = (s) => (en && EN[s]) || s;
  const title = T(r.winner === 0 ? '勝ち' : r.winner === 1 ? '負け' : '引き分け');
  let why = '';
  if (r.why === 'surrender') why = T(r.winner === 0 ? '相手が降伏した' : '降伏した');
  else if (r.why === 'honjin') why = T(r.winner === 0 ? '相手の本陣を崩した' : '味方の本陣が崩れた');
  else if (r.why === 'rout') why = T(r.winner === 0 ? '相手の全軍が崩れた' : '味方の全軍が崩れた');
  else if (r.why === 'draw') why = T('時間切れの判定で、両軍の点が並んだ');
  else if (r.why === 'taisho') why = T(r.winner === 0 ? '相手の武将を皆討ち取った' : '自分の武将が皆討たれた');   // 18 の match.js：本人が倒れ、移る味方の武将もいない時
  else if (r.why === 'time') {
    const k = LEAD[r.lead] || null;
    why = en ? `Time up: ${r.winner === 0 ? 'you led' : 'the enemy led'}${k ? ' in ' + T(k) : ''}`
      : `時間切れの判定：${k ? k + 'で' : ''}${r.winner === 0 ? '上回った' : '下回った'}`;
  }
  return { title, why };
}
export async function showMatchEnd(r, onHome0, practice = true) {   // practice：練習（模擬合戦）か。ランク戦・カジュアルの対戦は「合戦」と出す（33 の見つけ）
  let gone = false;
  const onHome = () => { if (gone) return; gone = true; onHome0(); };   // 二度押し・Enter の連打でホームを二度開かない
  const S = await import('../screens.js');
  let en = false; try { en = (await import('../i18n.js')).LANG === 'en'; } catch (e) { /* 日本語のまま */ }
  const { title, why } = matchEndText(r, en);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  S.showScreen(`<div class="story"><div>
    <div class="year">${esc(practice ? (en ? EN['模擬合戦'] : '模擬合戦') : (en ? EN['合戦'] : '合戦'))}</div>
    <h2 data-match-end="${r.winner ?? 'draw'}">${esc(title)}</h2>
    <p>${esc(why)}</p>
    ${(r.reward?.applied && r.reward.zeni > 0) ? `<p class="mt-zeni" aria-label="${esc(en ? `Coins +${r.reward.zeni}` : `銭 +${r.reward.zeni}`)}" style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:20px;min-height:44px;margin:4px 0"><span aria-hidden="true" style="width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#e0a070,#9a5a2a);box-shadow:inset 0 0 0 2px #6a3a1a;display:inline-flex;align-items:center;justify-content:center"><span style="width:7px;height:7px;background:#1c1813"></span></span><b>+${r.reward.zeni.toLocaleString()}</b></p>` : ''}
    <div class="row" style="justify-content:center"><button class="btn primary" id="mt-home" style="min-height:48px">${esc(en ? EN['ホームへ戻る'] : 'ホームへ戻る')}</button></div>
  </div></div>`, false, (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onHome(); } });
  const b = document.getElementById('mt-home');
  if (b) { b.onclick = onHome; b.focus({ preventScroll: true }); }
}
