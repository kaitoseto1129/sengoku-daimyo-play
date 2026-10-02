// ======================================================================
// rojo.js … 籠城戦の日々（docs/battle-system-plan.md 2 章 第4段・3-5、docs/battle-system-spec.md 39〜52 章）
// three・DOM・他の src は読まない（node でそのまま動く）。既にある kakoi.js（包囲のメーター・兵糧・士気の六段階）に乗せ、
// その上に兵数・水・矢弾・内応・降伏の判断・決着の形を足す。長島・三木・鳥取・岩村・有岡で使う想定（鳥取は束18）。
// 使い方：R = makeRojo({ castle, siege, ring, relief, plot, seed })
//   R.day() … 一日進める（兵糧・水・士気・脱走・修理・内応・予定の出来事）
//   R.choices(side, role) … 身分で絞った選びの一覧（'def'=守り・'atk'=攻め）
//   R.choose(side, id) … 選ぶ。夜襲・出撃・攻めるは 3D を待つ印 { pending: id } を返す
//   R.applyBattle(result) … 3D の出来事の結果を R へ返す（{ outcome:'win'|'lose'|'draw', loss, enemyLoss, note }）
//   R.surrenderOdds() … 降る見込み 0〜1（50 章）
//   R.terms() … 決着の形（51 章）
//   R.events() … 日ごとに出た出来事の記録 [{ day, kind }]
//   R.stat() … 画面用の一覧
// ======================================================================
import { makeKakoi, advanceDay, kakoiEvent, kakoiStage, kakoiStageWord, kakoiGaugeText, reliefWord } from './kakoi.js';

export const ROJO_DEF_CHOICES = ['耐える', '夜襲', '出撃', '修理', '降る'];
export const ROJO_ATK_CHOICES = ['攻める', '包囲を続ける', '援軍を迎え撃つ', '攻めずに待つ', '援軍の道を断つ'];
// 54・55 章：身分で出す選びを絞る（足軽・組頭は選ばず、出来事に出るだけ）
const ROLE_DEF = {
  足軽: [], 組頭: [], 足軽大将: ['耐える', '修理'], 侍大将: ['耐える', '修理', '夜襲'],
  部将: ['耐える', '修理', '夜襲', '出撃'], 城主: ROJO_DEF_CHOICES,
};
const ROLE_ATK = {
  足軽: [], 組頭: [], 足軽大将: ['攻めずに待つ', '援軍の道を断つ'], 侍大将: ['攻める', '包囲を続ける', '援軍の道を断つ'],
  部将: ['攻める', '包囲を続ける', '攻めずに待つ', '援軍の道を断つ'], 総大将: ROJO_ATK_CHOICES,
};
const NEED_3D = new Set(['夜襲', '出撃', '攻める']);

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 包囲の薄い方角（0〜1、低いほど薄い）。無ければ全方角厚い扱い
function thinnest(ring) {
  const ks = Object.keys(ring || {});
  if (!ks.length) return { dir: null, v: 1 };
  let dir = ks[0], v = ring[ks[0]];
  for (const k of ks) if (ring[k] < v) { v = ring[k]; dir = k; }
  return { dir, v };
}
function surrounded(ring) { return thinnest(ring).v >= 0.8; }

// schedule の既定（70 章の MVP）：[日, 出来事の名, 3D を待つ印（任意）]。戦ごとに違う筋（鳥取の舟の夜・城兵の打って出など）を渡せる
const DEFAULT_SCHEDULE = [[5, '夜襲', { side: 'def', id: '夜襲' }], [10, '門攻撃', { side: 'atk', id: '攻める' }], [15, '援軍接近', null]];

export function makeRojo({ castle, siege, ring = { 北: 1, 南: 1, 東: 1, 西: 1 }, relief = null, plot = null, seed = 1, schedule = null } = {}) {
  const K = makeKakoi({ day: 0, foodDays: castle.food, morale: castle.morale, relief: relief ? 0.6 : 0.25 });
  const rng = makeRng(seed);
  const S = {
    day: 0,
    castle: { men: castle.men, menMax: castle.men, food: castle.food, water: castle.water ?? castle.food, arrows: castle.arrows ?? 100, shot: castle.shot ?? 100, morale: castle.morale, wounded: 0, lordTrait: castle.lordTrait || '並' },
    siege: { men: siege.men, menMax: siege.men, food: siege.food, morale: siege.morale ?? 70, supply: siege.supply ?? 1 },
    ring: { ...ring },
    relief, plot, K,
    ended: false, result: null, pending: null,
    events: [],
    _sched: schedule || DEFAULT_SCHEDULE,
  };
  const pushEvent = (kind) => S.events.push({ day: S.day, kind });
  pushEvent('包囲');   // 0 日目

  function applyPlot() {
    const k = S.plot.kind;
    if (k === '門') { S.castle.men = Math.max(0, Math.round(S.castle.men * 0.85)); kakoiEvent.desertion(K, 15); }
    else if (k === '火') { S.castle.food = Math.max(0, S.castle.food - 3); kakoiEvent.nightRaidLost(K, 8); }
    else if (k === '減る') { S.castle.men = Math.max(0, Math.round(S.castle.men * 0.9)); kakoiEvent.desertion(K, 6); }
    S.castle.food = K.foodDays; S.castle.morale = K.morale;
    pushEvent('内応:' + k);
  }

  function checkEnd() {
    if (S.ended) return;
    if (S.castle.men <= 0) { S.ended = true; S.result = { kind: 'fall' }; pushEvent('落城'); }
    else if (S.siege.men <= 0 || (S.siege.food <= 0 && S.siege.morale <= 0)) { S.ended = true; S.result = { kind: 'lift' }; pushEvent('囲みを解く'); }
  }

  function day() {
    if (S.ended) return stat();
    S.day++;
    const thin = thinnest(S.ring);
    const leak = thin.v < 0.5;   // 包囲の薄い方角があれば少し入る
    advanceDay(K, 1);
    S.castle.food = K.foodDays;
    if (leak) { S.castle.food = Math.min(K.foodMax, S.castle.food + 0.3); K.foodDays = S.castle.food; }
    S.castle.water = Math.max(0, S.castle.water - 1 + (leak ? 0.3 : 0));
    if (S.castle.food <= 0 || S.castle.water <= 0) {
      kakoiEvent.desertion(K, 3);
      S.castle.men = Math.max(0, Math.round(S.castle.men - S.castle.menMax * 0.01));
    }
    S.castle.morale = K.morale;
    if (S.castle.wounded > 0) { const d = Math.min(S.castle.wounded, Math.ceil(S.castle.wounded * 0.1)); S.castle.wounded -= d; S.castle.men = Math.max(0, S.castle.men - Math.ceil(d * 0.2)); }
    // 攻め手も兵糧を減らす（尽きれば包囲を続けられない）
    S.siege.food = Math.max(0, S.siege.food - 1);
    if (S.siege.food <= 0) S.siege.morale = Math.max(0, S.siege.morale - 5);
    if (S.relief && S.day === S.relief.day) { pushEvent('援軍到着'); if (!S.ended) S.pending = { side: 'def', id: '出撃', auto: '援軍の挟撃' }; }
    if (S.plot && S.day === S.plot.day) applyPlot();
    for (const row of S._sched) {
      const [d, k, p] = row;
      if (d !== S.day) continue;
      pushEvent(k);
      if (!S.ended && p) S.pending = { side: p.side, id: p.id, auto: k };
    }
    checkEnd();
    return stat();
  }

  function choices(side, role) {
    const table = side === 'def' ? ROLE_DEF : ROLE_ATK;
    if (table[role]) return table[role].slice();
    return side === 'def' ? ROJO_DEF_CHOICES.slice() : ROJO_ATK_CHOICES.slice();
  }

  function surrenderOdds() {
    const menPct = S.castle.menMax ? S.castle.men / S.castle.menMax : 1;
    let o = 0;
    if (menPct <= 0.2) o += 0.35; else if (menPct < 0.4) o += 0.15;
    if (S.castle.food <= 3) o += 0.3; else if (S.castle.food <= 7) o += 0.1;
    if (surrounded(S.ring)) o += 0.15;
    if (!S.relief || S.relief.day == null) o += 0.2;
    if (S.castle.lordTrait === '剛') o -= 0.15; else if (S.castle.lordTrait === '弱') o += 0.15;
    return Math.max(0, Math.min(1, o));
  }

  function terms() {
    const o = surrenderOdds();
    if (S.castle.men <= 0) return '落城';
    if (o >= 0.85) return '城主切腹・城兵助命';
    if (o >= 0.6) return '退去';
    return '城兵降伏';
  }

  function surrender() {
    S.ended = true;
    S.result = { kind: 'surrender', terms: terms() };
    pushEvent('開城:' + S.result.terms);
    return { ok: true, ended: true, result: S.result };
  }

  function choose(side, id) {
    if (S.ended) return { ok: false, reason: 'ended' };
    if (NEED_3D.has(id)) { S.pending = { side, id }; return { pending: id }; }
    if (side === 'def') {
      if (id === '修理') { S.castle.wounded = Math.max(0, S.castle.wounded - 5); kakoiEvent.parley(K, 2); S.castle.morale = K.morale; }
      else if (id === '降る') return surrender();
      // 耐える：何もしない（自然な減りだけ）
    } else {
      if (id === '攻めずに待つ') S.siege.food = Math.max(0, S.siege.food - 1);
      // 48 章：援軍阻止（街道・湊を塞ぐ）。包囲の薄い方角を厚くし、援軍の見込みを下げる
      else if (id === '援軍の道を断つ') {
        for (const k of Object.keys(S.ring)) S.ring[k] = Math.min(1, S.ring[k] + 0.3);
        if (S.relief) S.relief = { ...S.relief, day: S.relief.day + 2 };
        K.relief = Math.max(0, K.relief - 0.15);
      }
      // 包囲を続ける・援軍を迎え撃つ：待機（自然な減りだけ）
    }
    return { ok: true };
  }

  // 3D の出来事（夜襲・出撃・攻める）の結果を受けて反映する
  function applyBattle(result = {}) {
    const p = S.pending; S.pending = null;
    if (!p) return stat();
    const { outcome = 'draw', loss = 0, enemyLoss = 0, note, foodDelta = 0, moraleDelta = 0 } = result;
    if (foodDelta) K.foodDays = Math.max(0, Math.min(K.foodMax, K.foodDays + foodDelta));
    if (moraleDelta) K.morale = Math.max(0, Math.min(K.moraleMax, K.morale + moraleDelta));
    if (p.id === '夜襲') {
      S.castle.men = Math.max(0, S.castle.men - loss);
      S.siege.men = Math.max(0, S.siege.men - enemyLoss);
      if (outcome === 'win') { kakoiEvent.nightRaidWon(K); S.siege.food = Math.max(0, S.siege.food - 3); S.siege.morale = Math.max(0, S.siege.morale - 8); }
      else kakoiEvent.nightRaidLost(K);
    } else if (p.id === '出撃') {
      S.castle.men = Math.max(0, S.castle.men - loss);
      S.siege.men = Math.max(0, S.siege.men - enemyLoss);
      if (outcome === 'win') S.siege.morale = Math.max(0, S.siege.morale - 6);
      else kakoiEvent.desertion(K, 4);
    } else if (p.id === '攻める') {
      S.siege.men = Math.max(0, S.siege.men - loss);
      S.castle.men = Math.max(0, S.castle.men - enemyLoss);
      if (outcome === 'win') kakoiEvent.nightRaidLost(K, 15);
    }
    S.castle.food = K.foodDays; S.castle.morale = K.morale;
    pushEvent((note || p.id) + ':' + outcome);
    checkEnd();
    return stat();
  }

  function events() { return S.events.slice(); }

  function stat() {
    return {
      day: S.day, castle: { ...S.castle }, siege: { ...S.siege }, ring: { ...S.ring },
      stage: kakoiStageWord(K), gauge: kakoiGaugeText(K, '兵糧'), relief: reliefWord(K),
      ended: S.ended, result: S.result, pending: S.pending,
    };
  }

  return { day, choices, choose, applyBattle, surrenderOdds, terms, events, stat, rng, get ended() { return S.ended; }, get result() { return S.result; } };
}
