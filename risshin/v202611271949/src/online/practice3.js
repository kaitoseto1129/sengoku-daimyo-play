// 練習の戦3戦（docs/online_final_1120.md 102〜103・cloud-18 の割り・11/27 クラウド17）
//   初めてオンラインの［合戦］を押した人は、対人の前に模擬合戦を3戦する。AI は 低→中→実戦（general_ai の NPC_LEVEL の 初級→中級→上級）。
//   1戦目：動きと1隊への命令　2戦目：複数の隊と側面　3戦目：本陣と士気と霧。済むと合戦（対人）が開く。
//   済んだ印は持ち物の箱（house.js の loadOnline/saveOnline）の practice3 = { step: 0〜3, done }。match.js の中は触らない（startMatch へは npc で渡す）
//   字は少なく絵で（CLAUDE.md 2章）：三つの丸（済んだ丸は金・今の丸は光る）と、その戦で覚える事の絵だけ。日本語と英語
import { isEn } from '../i18n.js';

export const STEPS = [
  { level: 'shokyu', map: 'heigen', ja: '一戦目', en: 'Battle 1' },
  { level: 'chukyu', map: 'heigen', ja: '二戦目', en: 'Battle 2' },
  { level: 'jokyu', map: 'heigen', ja: '三戦目', en: 'Battle 3' },
];
const L = (ja, en) => (isEn() ? en : ja);

export const practiceStep = (save) => Math.max(0, Math.min(3, save?.practice3?.step | 0));
// 既に合戦を三つ以上戦った人（戦績の勝ち負けの数）は、初めての人ではないので練習へ回さない
const played = (save) => { let n = 0; for (const r of [save?.record, save?.bank?.record, save?.toyo?.record]) if (r) n += (r.win || 0) + (r.loss || 0) + (r.draw || 0); return n; };
export const needPractice = (save) => !!save && !save.practice3?.done && practiceStep(save) < 3 && played(save) < 3;

// 相手の家：自分の家と違う家（同じ戦場・同じ条件で覚えられるよう、毎回同じ相手）
const FOE_HOUSE = { oda: 'takeda', takeda: 'uesugi', uesugi: 'takeda', tokugawa: 'takeda', mori: 'oda', shimazu: 'oda' };

// 済んだ一戦を記す（勝ち負けは問わない＝最後まで戦えば次へ）。三つ済めば done
export function markPractice(Ho) {
  const s = Ho.loadOnline(); if (!s) return null;
  const step = Math.min(3, practiceStep(s) + 1);
  s.practice3 = { step, done: step >= 3 };
  Ho.saveOnline(s);
  return s.practice3;
}

// 絵：その戦で覚える事（1＝矢印と一つの旗、2＝三つの旗と横からの矢印、3＝本陣の陣幕と霧）
function drawLesson(c, i) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h); g.lineWidth = 4; g.strokeStyle = '#ece4d2'; g.fillStyle = '#d9b45a';
  const flag = (x, y, s = 1) => { g.fillStyle = '#d9b45a'; g.fillRect(x, y - 30 * s, 3 * s, 34 * s); g.beginPath(); g.moveTo(x + 3 * s, y - 30 * s); g.lineTo(x + 22 * s, y - 24 * s); g.lineTo(x + 3 * s, y - 18 * s); g.fill(); };
  const arrow = (x0, y0, x1, y1) => { g.strokeStyle = '#ece4d2'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 12 * Math.cos(a - 0.5), y1 - 12 * Math.sin(a - 0.5)); g.moveTo(x1, y1); g.lineTo(x1 - 12 * Math.cos(a + 0.5), y1 - 12 * Math.sin(a + 0.5)); g.stroke(); };
  if (i === 0) { flag(w * 0.25, h * 0.75); arrow(w * 0.38, h * 0.6, w * 0.78, h * 0.6); }
  else if (i === 1) { flag(w * 0.2, h * 0.8, 0.8); flag(w * 0.35, h * 0.8, 0.8); flag(w * 0.5, h * 0.8, 0.8); g.fillStyle = '#b72f21'; g.fillRect(w * 0.7, h * 0.35, 30, 14); arrow(w * 0.45, h * 0.25, w * 0.68, h * 0.4); }
  else { g.fillStyle = '#ece4d2'; g.fillRect(w * 0.3, h * 0.45, w * 0.4, 6); for (let k = 0; k < 4; k++) g.fillRect(w * 0.3 + k * w * 0.13, h * 0.45, 4, h * 0.3); flag(w * 0.5, h * 0.42); g.fillStyle = 'rgba(220,220,214,.45)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(w * (0.25 + k * 0.25), h * 0.82, w * 0.16, h * 0.08, 0, 0, Math.PI * 2); g.fill(); } }
}

// ［合戦］を押した時：練習がまだなら、三つの丸と今の戦の絵を見せ、［練習の戦へ］で模擬合戦を始める。終われば一つ進めてホームへ。
//   go(o, back)：index.js の toFujin を呼ぶ口。戻り値 true＝練習へ回した
export function gate(Ho, go, back) {
  const save = Ho.loadOnline();
  if (!needPractice(save)) return false;
  const i = practiceStep(save), S = STEPS[i];
  document.querySelector('.ol-p3')?.remove();
  const el = document.createElement('div');
  el.className = 'ol-p3'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', L('練習の戦', 'Practice battles'));
  el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px';
  const dots = STEPS.map((_, k) => `<span aria-label="${k < i ? L('済み', 'done') : k === i ? L('今', 'now') : ''}" style="display:inline-block;width:22px;height:22px;margin:0 8px;border-radius:50%;border:2px solid #d9b45a;background:${k < i ? '#d9b45a' : k === i ? 'rgba(217,180,90,.35)' : 'transparent'};${k === i ? 'box-shadow:0 0 10px #d9b45a' : ''}"></span>`).join('');
  el.innerHTML = `<div style="max-width:420px;width:100%;background:#17130e;border:1px solid #d9b45a;border-radius:6px;padding:16px;color:#ece4d2;text-align:center">
    <div style="font-size:16px;margin-bottom:10px">${L('練習の戦', 'Practice battles')}　${L(S.ja, S.en)}</div>
    <div style="margin-bottom:10px">${dots}</div>
    <canvas width="240" height="120" style="width:240px;height:120px;display:block;margin:0 auto 12px"></canvas>
    <div style="display:flex;gap:8px;justify-content:center">
      <button data-go style="min-height:48px;min-width:160px;padding:8px 16px;font-size:16px;background:#d9b45a;color:#17130e;border:0;border-radius:4px">${L('練習の戦へ', 'Start practice')}</button>
      <button data-back style="min-height:48px;min-width:96px;padding:8px 12px;font-size:15px;background:transparent;color:#ece4d2;border:1px solid #8a7a5a;border-radius:4px">${L('ホームへ戻る', 'Back to home')}</button>
    </div></div>`;
  document.body.appendChild(el);
  drawLesson(el.querySelector('canvas'), i);
  el.querySelector('[data-back]').onclick = () => { el.remove(); back(); };
  el.querySelector('[data-go]').onclick = () => {
    el.remove();
    const house = FOE_HOUSE[save.house] || 'takeda';
    go({ practice: true, map: S.map, npc: { house, level: S.level, practice3: i + 1 } }, () => { markPractice(Ho); back(); });
  };
  return true;
}
