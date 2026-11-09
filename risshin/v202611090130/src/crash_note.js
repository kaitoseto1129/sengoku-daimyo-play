// 戦の途中で落ちたかを、次に開いた時に分かるようにする印（11/8 問い合わせ「戦の途中でキレてしまう」）。
//   戦を始めた時に localStorage へ印を置き、30秒ごとに何分目か・形と絵の数・JS の記憶を書き足す。戦を出たら印を消す。
//   次に開いた時に印が残っていれば、その戦の途中でアプリが落ちた（または裏に回した間に iOS に閉じられた）と分かる。
//   問い合わせのメール（screens.js contactMail）が、この記録をそのまま本文に足す。
const OPEN = 'risshin-battle-open', LAST = 'risshin-battle-last', DIED = 'risshin-battle-died';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなければ記さない */ } };
let timer = 0, cur = null;

// 開いた時：前の印が残っていれば「落ちた」として移す
try {
  const left = read(OPEN);
  if (left) { left.diedAt = Date.now(); write(DIED, left); write(LAST, left); localStorage.removeItem(OPEN); }
} catch (e) { /* 保存が無ければ見ない */ }

function sample() {
  if (!cur) return;
  const g = window.__game, b = g?.battle, r = g?.renderer;
  cur.min = Math.round((Date.now() - cur.at) / 6000) / 10;
  if (b && Number.isFinite(b.t)) cur.bt = Math.round(b.t);
  if (r?.info) { cur.geo = r.info.memory.geometries; cur.tex = r.info.memory.textures; cur.prog = r.info.programs?.length ?? 0; }
  if (performance.memory) cur.heap = Math.round(performance.memory.usedJSHeapSize / 1048576);
  cur.hidden = document.visibilityState === 'hidden' || undefined;
  write(OPEN, cur);
}

export function noteBattleStart(id, name) {
  clearInterval(timer);
  cur = { id, name, at: Date.now(), min: 0 };
  write(OPEN, cur);
  timer = setInterval(sample, 30000);
}
export function noteBattleEnd() {
  if (!cur) return;
  sample(); clearInterval(timer); timer = 0;
  cur.ended = true; write(LAST, cur);
  try { localStorage.removeItem(OPEN); } catch (e) { /* 保存が無ければそのまま */ }
  cur = null;
}
// 裏に回した時も今の分を書く（裏の間に iOS に閉じられても、どこまで遊んだかが残る）
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (cur) sample(); });

const fmt = (o) => `${o.name || o.id || '？'}・${o.min ?? 0}分目${o.bt != null ? `（戦の時計${o.bt}秒）` : ''}${o.geo != null ? `・形${o.geo}・絵${o.tex}・仕組み${o.prog}` : ''}${o.heap != null ? `・JS${o.heap}MB` : ''}`;
// 今の戦（無ければ最後の戦）：名・何分目
export function lastBattleInfo() {
  if (cur) return { ...cur, min: Math.round((Date.now() - cur.at) / 6000) / 10 };
  return read(LAST);
}
// 前回、戦の途中で落ちたのに、まだ「知らせる／知らせない」を聞いていなければ、その記録を返す（一度だけ）
export function takeUnaskedCrash() {
  const died = read(DIED);
  if (!died || died.asked) return null;
  died.asked = true; write(DIED, died);
  return died;
}
// 問い合わせの本文に足す数行
export function crashNoteText() {
  const last = cur || read(LAST), died = read(DIED);
  const lines = [];
  if (last) lines.push(`最後の戦：${fmt(last)}${cur ? '（今この戦の中）' : last.ended ? '（終えた）' : '（途中で止まった）'}`);
  lines.push(`前回アプリが戦の途中で落ちたか：${died && !cur && last && !last.ended && last.at === died.at ? 'はい' : 'いいえ'}`);
  if (died) lines.push(`最後に落ちた戦：${fmt(died)}・${new Date(died.diedAt || died.at).toLocaleString('ja-JP')}${died.hidden ? '・裏に回した後' : ''}`);
  return lines.join('\n');
}
