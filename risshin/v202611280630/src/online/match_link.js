// 試合（match.js・cloud-18）の降伏の札と回線の切断の口（K587・クラウド k365-cloud-40）。決まりの数は ../pvp_rules.js
//   match.js は rt.flags.match（M）を持つ。ここは M に link（切断の帳面）を足し、降伏と切断・戻りを M の上で行う。
//   画面と通信（降伏の札・net_session の leave/join）からは、この三つを呼ぶだけ：
//     matchSurrender(rt, team)           … 降伏の札を押した（出来なければ { ok:false, why, wait } を返す。札は出したまま）
//     matchDrop(rt, team, intentional)   … その席の回線が切れた（intentional＝本人が「戦を抜ける」を押した）
//     matchBack(rt, team)                … その席が戻った（同じ武将へ戻す）
import { canSurrender, surrenderResult, createLink, onDrop, onBack, dropResult, verdictLine as VL } from '../pvp_rules.js';

const START = 1000;   // 一武将の始めの兵の既定（K624⑤ で格ごとに変わる。備の b.nominal を先に見る）

function sideOf(M, team) { return (M?.sonae || []).filter((s) => s.team === team); }
const strengthOf = (L) => L.reduce((n, s) => n + Math.max(0, s.strength ?? s.b?.aliveNominal?.() ?? s.nominal ?? 0), 0);

// 降伏：始めの三分は出来ない・残り五分か兵力が相手の四割五分未満なら出来る（pvp_rules.canSurrender）
export function matchSurrender(rt, team = 0) {
  const M = rt.flags?.match;
  if (!M || M.over) return { ok: false, why: 'over' };
  const mine = sideOf(M, team), foe = sideOf(M, 1 - team);
  const st = { t: rt.t - M.t0, length: 900, myStrength: strengthOf(mine), foeStrength: strengthOf(foe), myStart: mine.reduce((n, s) => n + (s.b?.nominal || START), 0) };
  const c = canSurrender(st);
  if (!c.ok) return c;
  M.over = true;
  M.result = { over: true, winner: 1 - team, why: 'surrender', overtime: false, ...surrenderResult(st) };
  if (team === 0) rt.finish({ failureReason: '降伏した', scriptedEnd: true }, 3);   // 48（11/27）：決着の札を読む 3 秒（match.js closeMatch の見せの無い締めと揃える）
  else { if (rt.tracker) rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 3); }
  return { ok: true, result: M.result };
}

// 切断：その席の備（武将と隊）を、すぐ AI が継ぐ。隊も武将も消さない（s.byAI を立てるだけ。動かすのは general_ai）
export function matchDrop(rt, team, intentional = false) {
  const M = rt.flags?.match;
  if (!M) return null;
  M.link ||= createLink();
  const r = onDrop(M.link, team, rt.t, intentional);
  for (const s of sideOf(M, team)) s.byAI = true;
  if (team === 1) M.foeCut = true;   // 小さな地図の相手の名の横に、切れた印（字は無し・match_hud）
  return r;
}

// 戻り：同じ武将へ戻す
export function matchBack(rt, team) {
  const M = rt.flags?.match;
  if (!M?.link) return null;
  const r = onBack(M.link, team, rt.t);
  // 11/27 cloud-40（18 の割り・final 82〜95）：戻りの間（LINK.backWindow）を過ぎて戻った時は、隊を返さず AI のまま最後まで戦う（pvp_rules.onBack が hand:'ai'）
  if (r.hand === 'human') { for (const s of sideOf(M, team)) s.byAI = false; if (team === 1) M.foeCut = false; }
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
    practice: !!M.o?.practice, npc: M.o?.npc && !M.o?.practice ? M.o.npc : null, day });   // K603：諸大名戦は褒美を少なめに（match_reward npcK）
  try { window.risshinMetrics?.matchEnd?.({ mode: M.o?.practice ? 'practice' : M.o?.npc ? 'npc' : 'pvp', outcome: String(r.outcome || 'x').slice(0, 8), gens: (M.o?.generals || []).slice(0, 4).join(',').slice(0, 60) }); } catch (e) {}
  // 毎日の務め（33 tsutome.js が正）：40 と決めて一つの形に（11/21）＝ここで、褒美と同じ一度だけの守り（applied）の内に、保存の前に直に数える
  //   （知らせの event と受け口は使わない：受け口が無い時の数え0・二つの口での二度数えを無くす）。練習とわざと抜けた試合は数えない。
  //   無料の登用は tsutome の claim が toyo_rules.grantTaskFree で一か所だけ付ける（ここでは付けない）
  if (r.applied && !r.practice && r.outcome !== 'leave') {
    const H = (M.sonae || []).find((s) => (s.team ? 1 : 0) === team && s.line === 'honjin');
    const honjinHeld = H ? !H.taishoDead && H.state !== '敗走' : !(M.result?.winner === 1 - team && M.result?.why === 'honjin');
    try { const T = await import('./tsutome.js'); T.recordMatch(save, { matchId: M.id, win: r.outcome === 'win', honjinHeld, tactics: M.tactics?.[team] ?? M.myTactics ?? 0 }); } catch (e) { /* 務めが数えられなくても褒美は付ける */ }
  }
  // K603（k598-tonya）：勝った諸大名戦は、家ごとの初勝利（小判30・称号）と挑戦（銭・称号・旗）を一度だけ（npc_reward.js）
  if (r.applied && !r.practice && r.outcome === 'win' && M.o?.npc) {
    try { const X = await import('./npc_reward.js'); r.npcBonus = X.npcWinBonus(save, M, team, { tacUsed: M.tacUsed }); r.npcLines = X.npcBonusLines(r.npcBonus); r.npcLinesEn = X.npcBonusLines(r.npcBonus, true); } catch (e) { /* 付かなくても銭と経験は付ける */ }
  }
  const hadPending = !!save.pendingMatch;
  if (!r.practice && !M.o?.npc) delete save.pendingMatch;   // 48：対戦の締めを付けた（開き直しの lateSettle で二度付けない）
  if (r.applied || (hadPending && !save.pendingMatch)) Ho.saveOnline(save);
  if (!r.applied && M.reward?.applied) return M.reward;   // 二度目の呼び（dup）は一度目の褒美を残す（札の銭と諸大名戦の行を消さない）
  M.reward = r;
  if (M.result && typeof M.result === 'object') M.result.reward = r;   // 勝ち負けの札（showMatchEnd）が銭の数を出す（33）
  return r;
}

// ---- 試合の終わりの札（main.js の endBattle が def.onlineMatch の時に呼ぶ）----
//   稽古場の結果（討ち取り・第何陣・稽古場の最高記録）を出さず、勝ち・負け・引き分けと、何で決まったかを出して、オンラインのホームへ戻る。
//   時間切れは pvp_rules の点の表（兵の残り・士気・本陣・戦線・討ち取り）のうち、一番差の付いた項を理由に出す（11/21 cloud-26 の札と一本化・英語も）
const LEAD = { strength: '残りの兵', morale: '全軍の士気', honjin: '本陣の守り', front: '戦線の支配', kills: '敵の武将の討ち取り', generals: '武将の生存' };
const EN = { 勝ち: 'Victory', 負け: 'Defeat', 引き分け: 'Draw', ホームへ戻る: 'Back to home', 対戦へ戻る: 'Back to battles', 模擬合戦: 'Practice battle', 腕試し: 'Trial battle', 合戦: 'Battle',
  相手の本陣を崩した: 'You broke the enemy HQ', 味方の本陣が崩れた: 'Your HQ fell', 相手の全軍が崩れた: 'The enemy army broke', 味方の全軍が崩れた: 'Your whole army broke',
  自分の武将が皆討たれた: 'All your generals have fallen', 相手の武将を皆討ち取った: 'You took every enemy general',
  相手が降伏した: 'The enemy surrendered', 降伏した: 'You surrendered', '時間切れの判定で、両軍の点が並んだ': 'Time up: both armies scored the same',
  武将の生存: 'generals alive', 残存兵力: 'Troops left', 総大将: 'Commander', 討取武将: 'Generals taken', 本陣: 'HQ', 最大戦線: 'Furthest push', 段位: 'Rank', 勝因: 'Why you won', 敗因: 'Why you lost', 決め手: 'What decided it', 敵陣: 'into enemy ground', なし: 'none',
  生存: 'alive', 討死: 'fallen', 退却: 'withdrew', 健在: 'held', 陥落: 'fell', 崩れかけ: 'nearly broke', 攻められた: 'was attacked',
  敵本陣陥落: 'Enemy HQ fell', 敵全軍の士気崩壊: 'Enemy army broke', 敵総大将討取: 'Enemy commander taken', 敵の降伏: 'Enemy surrendered', 敵右翼を突破: 'Broke the enemy right', 敵左翼を突破: 'Broke the enemy left',
  予備隊の投入: 'Reserve committed', 士気で優勢: 'Higher morale', 両翼を守り切った: 'Both wings held', 判定で上回った: 'Ahead on points', 粘り勝ち: 'Outlasted them',
  本陣突破: 'HQ broken', 全軍の士気崩壊: 'Army broke', 武将が皆討たれた: 'All generals fell', 降伏: 'Surrendered', 総大将の討死: 'Commander fell', 左翼崩壊: 'Left wing collapsed', 右翼崩壊: 'Right wing collapsed',
  予備隊を使わなかった: 'Reserve never used', 予備隊消耗: 'Reserve spent', 士気で劣勢: 'Lower morale', 判定で下回った: 'Behind on points', 力負け: 'Outfought', 両軍拮抗: 'Evenly matched',
  残りの兵: 'remaining troops', 全軍の士気: 'army morale', 本陣の守り: 'HQ defense', 戦線の支配: 'control of the front', 敵の武将の討ち取り: 'enemy generals taken' };
export function matchEndText(r = {}, en = false) {
  const T = (s) => (en && EN[s]) || s;
  const title = T(r.winner === 0 ? '勝ち' : r.winner === 1 ? '負け' : '引き分け');
  let why = '';
  if (VL && r.why) why = VL(r, en);   // K641 ②：決着の訳の一行は pvp_rules.verdictLine に一つに
  else if (r.why === 'surrender') why = T(r.winner === 0 ? '相手が降伏した' : '降伏した');
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
// K603 報告（kaito 11/21 74）：残存兵力・総大将・討取武将・本陣・最大戦線・段位と、勝因／敗因を必ず（引き分けは『決め手』・48 11/27）。表は二列、狭い画面でも一画面に収まる
export function reportHtml(R, en = false, esc = (x) => x) {
  if (!R) return '';
  const T = (s) => (en && EN[s]) || s, tr = (s) => String(s).split(/（|）/)[0] === s ? T(s) : s.replace(/^討死/, T('討死'));
  const rows = [[T('残存兵力'), `${R.left.toLocaleString()}/${R.start.toLocaleString()}`], [T('総大将'), tr(R.chief)], [T('討取武将'), String(R.kills)],
    [T('本陣'), T(R.honjin)], [T('最大戦線'), en ? `${R.front}% ${T('敵陣')}` : `敵陣${R.front}%`], R.ranked ? null : [T('段位'), R.practice || R.rank == null ? T('なし') : (R.rank > 0 ? `+${R.rank}` : String(R.rank))]].filter(Boolean);
  const cell = 'padding:2px 8px;border-bottom:1px solid rgba(201,180,138,.25);font-size:14px';
  const pair = (i) => rows.slice(i, i + 2).map(([k, v]) => `<th scope="row" style="${cell};font-weight:400;color:#cdbf9f">${esc(k)}</th><td style="${cell}">${esc(v)}</td>`).join('');
  return `<table class="mt-report" style="margin:4px auto;border-collapse:collapse;text-align:left">${[0, 2, 4].filter((i) => i < rows.length).map((i) => `<tr>${pair(i)}</tr>`).join('')}</table>
    <p class="mt-why" style="margin:2px 0 6px;font-size:15px"><span style="color:#e8c77a">${esc(T(R.win ? '勝因' : R.draw ? '決め手' : '敗因'))}</span>　${esc((R.reasons || []).slice(0, 3).map(T).join('・') || T('両軍拮抗'))}</p>`;
}
export async function showMatchEnd(r, onHome0, practice = true, toTaisen = false) {   // K618：toTaisen＝諸大名・［敵を決める］・［試す］の戦（戻る先は［対戦］の入口なので［対戦へ戻る］）   // practice：練習（模擬合戦）か。ランク戦・カジュアルの対戦は「合戦」と出す（33 の見つけ）
  let gone = false;
  // 11/27 クラウド kaito2（一戦目 +93MB）：結果の札の Enter・Esc の聞き手（screens.js の screenKeys）が、ホームへ戻った後も残り、前の試合（M・備・World・Scene）を丸ごと握っていた。戻る時に札を閉じて手放す
  const onHome = () => { if (gone) return; gone = true; try { S.hideScreen(); } catch (e) { /* 札が無くても戻る */ } onHome0(); };   // 二度押し・Enter の連打でホームを二度開かない
  const S = await import('../screens.js');
  let en = false; try { en = (await import('../i18n.js')).LANG === 'en'; } catch (e) { /* 日本語のまま */ }
  const { title, why } = matchEndText(r, en);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  S.showScreen(`<div class="story mt-end"><div>
    <div class="year">${esc(practice ? (en ? EN['腕試し'] : '腕試し') : (en ? EN['合戦'] : '合戦'))}</div>
    <h2 data-match-end="${r.winner ?? 'draw'}">${esc(title)}</h2>
    <p>${esc(why)}</p>
    ${reportHtml(r.report, en, esc)}
    ${r.report?.ranked && !practice ? '<div id="mt-rank" style="display:flex;justify-content:center;align-items:center;gap:12px;margin:4px 0;min-height:44px"></div>' : ''}
    ${(r.reward?.applied && r.reward.zeni > 0) ? `<p class="mt-zeni" aria-label="${esc(en ? `Coins +${r.reward.zeni}` : `銭 +${r.reward.zeni}`)}" style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:20px;min-height:44px;margin:4px 0"><span aria-hidden="true" style="width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#e0a070,#9a5a2a);box-shadow:inset 0 0 0 2px #6a3a1a;display:inline-flex;align-items:center;justify-content:center"><span style="width:7px;height:7px;background:#1c1813"></span></span><b>+${r.reward.zeni.toLocaleString()}</b></p>` : ''}
    ${((en ? r.reward?.npcLinesEn : r.reward?.npcLines) || []).map((t) => `<p class="mt-npc" style="text-align:center;font-size:16px;margin:2px 0;color:#f3d68a">${esc(t)}</p>`).join('')}
    <div class="row" style="justify-content:center">${r.report?.replay?.frames?.length ? `<button class="btn" id="mt-replay" style="min-height:48px" aria-label="${esc(en ? 'Watch the replay from above' : '上空から見返す')}">${esc(en ? 'Watch from above' : '上空から見返す')}</button>` : ''}<button class="btn primary" id="mt-home" style="min-height:48px">${esc(toTaisen ? (en ? EN['対戦へ戻る'] : '対戦へ戻る') : en ? EN['ホームへ戻る'] : 'ホームへ戻る')}</button></div>
  </div></div>`, false, (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onHome(); } });
  mountRank(r, en);
  const rb = document.getElementById('mt-replay');
  if (rb) rb.onclick = async () => { const Rs = await import('./replay_sky.js'); Rs.openSky(r.report.replay, { en, win: r.winner === 0 }); };
  const b = document.getElementById('mt-home');
  if (b) { b.onclick = onHome; b.focus({ preventScroll: true }); }
}

// K580：ランク戦の結果の札＝段の札（前）→ 点が届いたら（後）へ。上がった・下がったは枠が光る・揺れる。届かない時は前の札のまま（点の差は出さない）
async function mountRank(r, en) {
  const host = document.getElementById('mt-rank'); if (!host) return;
  const [U, NM] = await Promise.all([import('./rank_ui.js'), import('./net_match.js')]);
  U.rankCss();
  const st = NM.ratingState(), before = st.before ?? 1000;
  host.innerHTML = U.rankCardHtml(before, { en });
  const show = (b, a) => {
    if (!host.isConnected) return;
    const m = U.moveOf(b ?? before, a);
    host.innerHTML = U.rankCardHtml(b ?? before, { en }) + U.moveHtml(b ?? before, a) + U.rankCardHtml(a, { en, cls: m.dir > 0 ? 'up' : m.dir < 0 ? 'down' : '' });
    host.dataset.rank = `${b ?? before}>${a}`;
    if (r.report) r.report.rank = a - (b ?? before);
    const bars = host.querySelectorAll('.rk:last-child .rk-bar i'); bars.forEach((i) => { const w = i.style.width; i.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = w; })); });
  };
  let off = null; off = NM.onRated((b, a) => { show(b, a); });
  setTimeout(() => { try { off?.(); } catch (e) { /* 届かなくても進む */ } }, 20000);
}
