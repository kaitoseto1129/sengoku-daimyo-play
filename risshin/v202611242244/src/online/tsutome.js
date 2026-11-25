// 毎日の務め（K580 の 12/1 の線・docs/online_final_1120.md 105・docs/online_req_1120.md 102）。33・11/21 クラウド k365-cloud-33（工程表で持ち主の無かった行）。
//   決まり：オンラインの戦で進む・討ち取りの務めに偏らない・負けても少しもらえる・登用札（無料の登用）は一日に二回まで（toyo_rules の grantTaskFree）。
//   毎日三つ：「1戦」「3戦」は必ず、残りの一つは日ごとに「1勝・本陣を守り切る・固有戦術を使う」を回す。
//   報酬（K598：登用札は廃止・無料の登用は毎日5回だけ。3戦＝小判30・ほか＝武将印）。旧：登用札＝無料の登用1回（1戦・3戦）。銭の作りはまだ無いので、ほかの務めは武将印（交換所で使える）を少し。
//   持ち物は 48 の箱（save）の tsutome に置く（state.js には触らない）。描かない純粋な決まり。試し：node prototype/tools/tsutome_test.mjs
import { dayNo, newToyoState } from './toyo_rules.js';
// 登用の間（index.js の toToyo）と同じ日の字。先に日の戻しを済ませないと、後で開いた登用の間が足した無料を消してしまう
const dayKey = (now) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const TASKS = {
  play1: { name: 'オンラインの戦を1戦する', need: 1, reward: { seals: 5 } },
  play3: { name: 'オンラインの戦を3戦する', need: 3, reward: { kin: 30 } },
  win1: { name: '1勝する', need: 1, reward: { seals: 10 } },
  honjin: { name: '本陣を守り切る', need: 1, reward: { seals: 10 } },
  tactic: { name: '固有戦術を1回使う', need: 1, reward: { seals: 10 } },
};
const ROTATE = ['win1', 'honjin', 'tactic'];

// 今日の務め（日が替われば作り直す）
export function today(save, now = Date.now()) {
  const d = dayNo(now);
  if (!save.tsutome || save.tsutome.day !== d) save.tsutome = { day: d, ids: ['play1', 'play3', ROTATE[((d % 3) + 3) % 3]], prog: {}, got: {} };
  const t = save.tsutome;
  return t.ids.map((id) => ({ id, ...TASKS[id], prog: Math.min(t.prog[id] || 0, TASKS[id].need), done: (t.prog[id] || 0) >= TASKS[id].need, got: !!t.got[id] }));
}

// 一戦の終わりを数える。r：{ win, honjinHeld, tactics }（tactics＝自分が使った固有戦術の回数）。同じ試合を二度数えない（matchId）
export function recordMatch(save, r, now = Date.now()) {
  today(save, now);
  const t = save.tsutome;
  if (r.matchId) { t.seen = t.seen || []; if (t.seen.includes(r.matchId)) return []; t.seen.push(r.matchId); if (t.seen.length > 20) t.seen.shift(); }
  const add = (id, n = 1) => { if (t.ids.includes(id)) t.prog[id] = (t.prog[id] || 0) + n; };
  add('play1'); add('play3');                    // 負けても進む
  if (r.win) add('win1');
  if (r.honjinHeld) add('honjin');
  if (r.tactics > 0) add('tactic');
  return today(save, now).filter((x) => x.done && !x.got).map((x) => x.id);   // 受け取れるようになった務め
}

// 報酬を受け取る（一度だけ）。登用札は toyo の無料に足す（一日二回まで）。武将印は手持ちの帳（bank）へ、登用の写しも合わせる
export function claim(save, id, now = Date.now()) {
  const list = today(save, now), x = list.find((q) => q.id === id);
  if (!x || !x.done || x.got) return null;
  const rw = TASKS[id].reward, out = {};
  if (rw.kin) {
    save.toyo = newToyoState(save.toyo || {});
    save.toyo.kin = (save.toyo.kin || 0) + rw.kin;
    out.kin = rw.kin;
  }
  if (rw.seals) {
    if (save.bank) save.bank.seals = (save.bank.seals || 0) + rw.seals;
    if (save.toyo) save.toyo.seals = save.bank ? save.bank.seals : (save.toyo.seals || 0) + rw.seals;
    out.seals = rw.seals;
  }
  save.tsutome.got[id] = 1;
  return out;
}
