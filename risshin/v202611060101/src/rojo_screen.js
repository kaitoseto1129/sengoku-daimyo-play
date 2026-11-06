// ======================================================================
// rojo_screen.js … 籠城の日を送る画面（docs/battle-system-plan.md 2 章 第4段・束16）。
// rojo.js の R を受けて、城の一枚絵・兵糧と水と士気の帯・援軍までの日数・その日の出来事・選びのボタンを出す。
// 3D の出来事（夜襲・出撃・攻める）は openRojo が呼ばない。onEvent(kind) を呼んで戦の側に任せ、
// 戻ってきたら resumeAfterEvent(result) を呼んでもらう（中で R.applyBattle → 次の日へ進める）。
// ======================================================================
import { illustHtml, mountIllust } from './illust.js';
import { esc } from './gunbai.js';
import { sfx } from './audio.js';

const EVENT_WORD = {
  '包囲': '敵が城を囲んだ。',
  '夜襲': 'こちらから夜襲をかける刻が来た。',
  '門攻撃': '敵が門へ仕寄せてきた。',
  '援軍接近': '援軍が近づいているとの知らせ。',
  '援軍到着': '援軍が着いた。内と外から敵を挟む好機。',
  '落城': '城は、ついに落ちた。',
  '囲みを解く': '敵は囲みを解いて退いた。',
};
function eventWord(kind) {
  if (EVENT_WORD[kind]) return EVENT_WORD[kind];
  if (kind.startsWith('内応:')) return '城の中で、内応の動きがあった。';
  if (kind.startsWith('開城:')) return `城は開かれた（${kind.slice(3)}）。`;
  return `${kind}。`;
}
const CHOICE_LABEL = {
  耐える: '門を固めて待つ', 夜襲: '夜襲をかける', 出撃: '打って出る', 修理: '門と柵を繕う', 降る: '城を開いて降る',
  攻める: '攻め寄せる', 包囲を続ける: '包囲を続ける', 援軍を迎え撃つ: '援軍を迎え撃つ', 攻めずに待つ: '攻めずに兵糧を断つ',
  援軍の道を断つ: '援軍の道を断つ',
};

function bar(pct, cls) {
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="rojo-bar ${cls}" role="img" aria-label="${Math.round(p * 100)}%"><div class="rojo-bar-in" style="width:${Math.round(p * 100)}%"></div></div>`;
}

export function openRojo(game, R, { side = 'def', role = '城主', castleName = '城', onEvent, onEnd, autoSec = 0 } = {}) {
  let closed = false;
  let autoTimer = null;   // autoSec を渡すと、何も選ばれないまま経つと既定の選びで次の日へ（bot・放ったらかし対策）
  // 全画面のこの札の間は、指の操作の帯（#tc：歩く棒・見回す所・釦）を隠す（重なって押せない事がないように）
  const tc = document.getElementById('tc');
  const tcWasHidden = tc ? tc.hidden : true;
  if (tc) tc.hidden = true;
  const root = document.createElement('div');
  root.className = 'rojo-screen';
  root.innerHTML = `<style>
    .rojo-screen{position:fixed;inset:0;z-index:900;background:rgba(10,8,6,.94);color:#eee8d8;overflow:auto;display:flex;justify-content:center}
    .rojo-wrap{max-width:640px;width:100%;padding:16px;box-sizing:border-box}
    .rojo-bar{height:14px;border-radius:7px;background:#2a2420;overflow:hidden;border:1px solid #4a4030}
    .rojo-bar-in{height:100%;background:#9a7a3a}
    .rojo-bar.water .rojo-bar-in{background:#3a7a9a}
    .rojo-bar.morale .rojo-bar-in{background:#8a3a3a}
    .rojo-row{display:flex;align-items:center;gap:8px;margin:6px 0}
    .rojo-row b{width:5em;font-size:14px}
    .rojo-row small{width:3.4em;text-align:right;font-size:12px}
    .rojo-day{font-size:15px;opacity:.9;margin:8px 0}
    .rojo-ev{font-size:16px;margin:10px 0;min-height:1.4em}
    .rojo-choices{display:flex;flex-direction:column;gap:8px;margin-top:14px}
    .rojo-choices button{min-height:44px;padding:8px 14px;font-size:15px;border-radius:8px;border:1px solid #6a5a3a;background:#2a241c;color:#eee8d8;text-align:left}
    .rojo-choices button:focus{outline:2px solid #c9a24a}
    .rojo-confirm{margin-top:10px;padding:10px;border:1px solid #8a3a3a;border-radius:8px;background:#201614}
    .rojo-confirm .row{display:flex;gap:8px;margin-top:8px}
    .rojo-confirm button{min-height:44px;padding:8px 14px;border-radius:8px}
  </style>
  <div class="rojo-wrap">
    ${illustHtml('siege', 'band', castleName)}
    <h2 style="margin:10px 0 0">${esc(castleName)}　籠城</h2>
    <div class="rojo-day" id="rojo-day"></div>
    <div class="rojo-row"><b>兵糧</b>${bar(0, 'food')}<small id="rojo-food-n"></small></div>
    <div class="rojo-row"><b>水</b>${bar(0, 'water')}<small id="rojo-water-n"></small></div>
    <div class="rojo-row"><b>士気</b>${bar(0, 'morale')}<small id="rojo-morale-n"></small></div>
    <div id="rojo-relief"></div>
    <div class="rojo-day" id="rojo-camp"></div>
    <div class="rojo-ev" id="rojo-ev" aria-live="polite"></div>
    <div class="rojo-choices" id="rojo-choices"></div>
    <div id="rojo-confirm"></div>
  </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);

  function paint(st) {
    $('rojo-day').textContent = `${st.day} 日目　${st.stage}`;
    $('rojo-food-n').textContent = `${(v => (v < 10 ? v.toFixed(1) : Math.round(v)))(Math.max(0, st.castle.food))}日分`;
    $('rojo-water-n').textContent = `${(v => (v < 10 ? v.toFixed(1) : Math.round(v)))(Math.max(0, st.castle.water))}日分`;
    $('rojo-morale-n').textContent = `${Math.max(0, Math.round(st.castle.morale))}`;
    const foodBarPct = Math.max(0, Math.min(1, st.castle.food / 20));
    const waterBarPct = Math.max(0, Math.min(1, st.castle.water / 20));
    const moraleBarPct = Math.max(0, Math.min(1, st.castle.morale / 100));
    root.querySelector('.rojo-bar.food .rojo-bar-in').style.width = Math.round(foodBarPct * 100) + '%';
    root.querySelector('.rojo-bar.water .rojo-bar-in').style.width = Math.round(waterBarPct * 100) + '%';
    root.querySelector('.rojo-bar.morale .rojo-bar-in').style.width = Math.round(moraleBarPct * 100) + '%';
    $('rojo-relief').textContent = `援軍：${st.relief}`;
    $('rojo-camp').textContent = `囲む側の食べ物：あと${Math.ceil(Math.max(0, st.siege.food))}日分　疲れ：${st.siege.fatigue >= 45 ? '強い' : st.siege.fatigue >= 20 ? 'たまっている' : '少ない'}`;
  }
  function latestEventText(st) {
    const ev = R.events();
    const today = ev.filter((e) => e.day === st.day);
    if (!today.length) return '';
    return today.map((e) => eventWord(e.kind)).join('　');
  }

  function renderChoices(st) {
    clearTimeout(autoTimer);
    const box = $('rojo-choices');
    $('rojo-confirm').innerHTML = '';
    if (st.ended) {
      box.innerHTML = `<p>${st.result && st.result.kind === 'fall' ? '城は落ちた。' : st.result && st.result.kind === 'lift' ? '敵は囲みを解いた。' : '開城した。'}</p>`;
      sfx && sfx('ui');
      if (onEnd) onEnd(st);
      return;
    }
    const list = R.choices(side, role);
    if (!list.length) {
      box.innerHTML = `<button id="rojo-next">次の日へ</button>`;
      $('rojo-next').onclick = () => { sfx && sfx('ui'); step(); };
      if (autoSec > 0) autoTimer = setTimeout(() => { if (!closed) step(); }, autoSec * 1000);
      return;
    }
    box.innerHTML = list.map((id, i) => `<button data-id="${esc(id)}" id="rojo-c${i}">${esc(CHOICE_LABEL[id] || id)}</button>`).join('');
    list.forEach((id, i) => {
      $('rojo-c' + i).onclick = () => {
        sfx && sfx('ui');
        if (id === '降る') { confirmSurrender(); return; }
        doChoose(id);
      };
    });
    if (autoSec > 0) {
      const pick = list.find((id) => id !== '降る') || list[0];
      autoTimer = setTimeout(() => { if (!closed) doChoose(pick); }, autoSec * 1000);
    }
  }

  function confirmSurrender() {
    $('rojo-confirm').innerHTML = `<div class="rojo-confirm"><b>本当に城を開いて降りますか。</b><div class="note">取り消せません。</div>
      <div class="row"><button id="rojo-sur-no">やめる</button><button id="rojo-sur-yes">城を開いて降る</button></div></div>`;
    $('rojo-sur-no').onclick = () => { $('rojo-confirm').innerHTML = ''; };
    $('rojo-sur-yes').onclick = () => { sfx && sfx('ui'); doChoose('降る'); };
  }

  function doChoose(id) {
    const res = R.choose(side, id);
    if (res && res.pending) { runEvent(res.pending); return; }
    step();
  }

  function step() {
    const st = R.day();
    if (!st.ended && st.pending) { runEvent(st.pending.id, st.pending.auto); return; }
    paint(st);
    $('rojo-ev').textContent = latestEventText(st);
    renderChoices(st);
  }

  function runEvent(kind, auto) {
    if (typeof onEvent === 'function') onEvent(auto || kind);
    else resumeAfterEvent({ outcome: 'draw', loss: 0, enemyLoss: 0 });
  }

  // 3D の出来事から戻った時に呼ぶ（b_mvp_rojo.js など）
  function resumeAfterEvent(result) {
    if (closed) return;
    R.applyBattle(result);
    const st = R.stat();
    if (st.ended) { paint(st); $('rojo-ev').textContent = latestEventText(st); renderChoices(st); return; }
    paint(st);
    $('rojo-ev').textContent = latestEventText(st);
    renderChoices(st);
  }

  function close() { closed = true; clearTimeout(autoTimer); root.remove(); if (tc) tc.hidden = tcWasHidden; }
  root.__close = close;   // 戦をやめる・やり直す時（main.js の stopBattle）に、日送りの札と時計を残さない

  const st0 = R.stat();
  paint(st0);
  $('rojo-ev').textContent = latestEventText(st0) || `籠城、始まる（${role}として参る）`;
  renderChoices(st0);
  mountIllust(root);

  return { close, resumeAfterEvent, root };
}
