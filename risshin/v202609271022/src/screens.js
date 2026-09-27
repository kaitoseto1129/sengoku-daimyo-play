import { isTouch } from './touch.js';
import { GRADE_CUT, RANKS, BATTLES, SCENARIOS, SCENARIO_ORDER, SCENARIO_PICK, zeni, scenarioKey, scenarioReady, ITEMS, TITLES, LADDER, HORSES, myHorse, ladderStep, rankLabel, save, equipDef, migrate, loadAll, relOf } from './state.js';
import { drawMon } from './textures.js';
import { sfx } from './audio.js';
import { S, saveSettings, resetHints, resetSettings, BIND_DEFAULTS, BIND_LABELS, keyLabel, DIFFICULTY, K } from './settings.js';
import { Preview } from './preview.js';
import { illustHtml, illustKey, mountIllust } from './illust.js';
import { odaTown, setOdaDiagram, ODA_REL_NAME } from './oda_town.js';
import { toiyaHtml, toiyaBind, TOIYA_ICON, toiyaCheap } from './toiya.js';

// ボタンに触れたときの小さな音
let hoverT = 0;
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest && e.target.closest('.btn, .tabs button, .choices button');
  if (!b || b.disabled) return;
  const now = performance.now();
  if (now - hoverT > 60) { hoverT = now; sfx('hover'); }
});

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 画面ごとのキー操作（画面が変わると差し替わる）
let screenKeys = null;
window.addEventListener('keydown', (e) => {
  if (!screenKeys || $('screen').hidden) return;
  // 焦点のあるボタン・開閉の見出しでの Enter／Space は、そのボタンの働きに任せる（別の操作が走らないように）
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button, summary, a, [role=button], [role=tab]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
    if (e.key !== 'Enter' || e.target.type === 'textarea') return;
  }
  screenKeys(e);
});

// 動きを減らす：ゲームの設定か OS の設定
export const RM = () => !!S.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
// 取り消せない操作の確認札（何が消えるかを書き、安全な「やめる」を先に置いて焦点を当てる）
export function confirmBox(box, msg, yesLabel, onYes, { noLabel = 'やめる', sub = '元に戻せません。' } = {}) {
  box.innerHTML = `<div class="confirm-row" role="alertdialog" aria-live="assertive"><div class="cf-msg"><b>${esc(msg)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="row"><button class="btn small" data-cf="no">${esc(noLabel)}</button><button class="btn small danger" data-cf="yes">${esc(yesLabel)}</button></div></div>`;
  const no = box.querySelector('[data-cf=no]');
  no.onclick = () => { box.innerHTML = ''; };
  box.querySelector('[data-cf=yes]').onclick = onYes;
  no.focus({ preventScroll: true });
  box.scrollIntoView?.({ block: 'nearest' });
}

// 521〜540 で足した見た目（index.html は別の人が触るので、ここに置く）
const UX_CSS = `<style>
  .slotcard .sl-g { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .slotcard .sl-g i { font-style: normal; font-size: 12px; line-height: 1.4; padding: 0 4px; border: 1px solid var(--line); color: var(--washi-dim); }
  .slotcard .sl-g i.g-甲上 { border-color: var(--kin); color: var(--kin); }
  .scn .sc-path { display: block; margin-top: 4px; color: var(--washi-dim); font-size: 12.5px; line-height: 1.6; }
  .scn .sc-path b { color: var(--kin); font-weight: 500; }
  .story .st-who { font-size: 13px; color: var(--washi-dim); letter-spacing: .12em; margin: -10px 0 26px; }
  .story .st-who b { color: var(--kin); font-weight: 500; }
  .story .st-tip { max-width: 32em; margin: 4px auto 28px; text-align: left; border: 1px solid rgba(194,162,90,.5); border-left: 3px solid var(--kin); background: rgba(194,162,90,.07); padding: 12px 16px; opacity: 0; animation: ln .8s ease-out forwards; }
  .story .st-tip small { display: block; font-size: 12px; letter-spacing: .3em; color: var(--kin); margin-bottom: 4px; }
  .story .st-tip span { font-size: 15px; line-height: 1.8; color: var(--washi); }
  .story.fast p, .story.fast .st-tip { animation-delay: 0s !important; animation-duration: .01s !important; }
  .story .st-skip { font-size: 12px; color: var(--washi-faint); margin-top: 6px; }
</style>`;
function show(html, clear = false, keys = null) {
  const s = $('screen');
  // 画面が変わるとき、墨の帯が掃く（「動きを減らす」では出さない）
  if (!RM() && !clear) { const w = $('wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }
  s.hidden = false;
  s.className = clear ? 'clear' : '';
  s.innerHTML = UX_CSS + html;
  s.scrollTop = 0;
  screenKeys = keys;
  return s;
}
export function hideScreen() { $('screen').hidden = true; $('screen').innerHTML = ''; screenKeys = null; }

export function notice(text) {
  const el = document.createElement('div');
  el.className = 'toastbox';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// いまのキー割り当てで操作表を作る
const KEYS = () => [
  [`${K('forward')} ${K('left')} ${K('back')} ${K('right')}`, '移動（前へ二度押しで走る）'], ['マウス', '視点（画面をクリックで開始）'], ['ホイール', '視点の距離／狙い定め中は相手を替える'], ['左クリック', '突き（続けて押すと連続突き、押し続けて離すと溜め突き）'],
  ['右クリック', '構え・防御（直前なら受け流し）'], ['構え＋左', '薙ぎ払い'], [K('run'), '走る'], [K('dodge'), '回避'], [K('lock'), '敵を狙い定める'],
  [K('use'), '話す・取る'], [K('command'), '部隊指揮（長押しで号令の輪）'], [`${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}`, 'ついて来い・待て・突撃・退け'], [K('rally'), '鼓舞・鬨の声'],
  [K('map'), '戦術マップ（クリックで組を向かわせる）'], [K('mapzoom'), 'ミニマップの縮尺'], [K('log'), '会話の記録'], [K('shoulder'), '肩越しの左右切替'], [K('view'), '視点の切替（三人称・一人称）'], [K('skip'), '行軍・待ちを飛ばす'],
  [K('photo'), '写真モード'], [K('hud'), 'HUDを消す・出す'], ['1 / 2', '槍 / 打刀'], ['[ ]', '視点の感度'], ['F1', '操作の早見表'], ['H', '操作説明'], ['Esc', '一時停止・設定'],
];
const PB = (k) => `<span class="pb pb-${k.toLowerCase()}">${k}</span>`;
const PAD = [['左スティック', '移動'], ['右スティック', '視点'], ['RT / RB', '攻撃'], ['LT', '構え'], [PB('A'), '回避・決定'], [PB('X'), '話す・取る'], [PB('Y'), '部隊指揮（長押しで号令の輪）'], [PB('B'), '戻る'], ['LB', '鼓舞'], ['十字キー', '号令（↑ついて来い ←待て →突撃 ↓退け）／画面の選択'], ['R3', '狙い定め'], ['L3', '走る'], ['Back', '戦術マップ'], ['Start', '一時停止']];
export function keysHtml(pad = false) {
  const list = pad ? PAD : KEYS();
  return `<div class="keys">${list.map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div>`;
}

// ---------------- タイトル ----------------
// 新しく始める時に前に選んだ名・筋書き・難易度（このブラウザに覚える。読めなくても動く）
const PICK_KEY = 'sengoku-risshin-newpick-v1';
function newPick(v) {
  if (v) { try { localStorage.setItem(PICK_KEY, JSON.stringify(v)); } catch (e) { /* 覚えられなくても始められる */ } return v; }
  try { return JSON.parse(localStorage.getItem(PICK_KEY)) || {}; } catch (e) { return {}; }
}
export function titleScreen(saved, onNew, onContinue, onSettings, onImport, onSlot, onChapter, onDojo, onRecords, onLadder, onJapan, onSamurai, onLord) {
  const slots = loadAll();
  // 保存ごとに筋書きが違うので、その保存の筋書きの戦の並びで「次は」を出す
  const scOf = (g) => SCENARIOS[g.scenario || 'okehazama'];
  const nextOf = (g) => { const bs = scOf(g).battles; return g.battle >= bs.length ? `${scOf(g).name}を終えた` : `${scOf(g).name}・次は${bs[g.battle].name}`; };
  const saveInfo = saved ? `${esc(saved.name)}・${esc(RANKS[saved.rank].name)}・難易度「${esc((DIFFICULTY[saved.difficulty] || DIFFICULTY.normal).name)}」・${esc(nextOf(saved))}` : '';
  // 織田家編でない古い保存（長篠編・桶狭間編など）があるときは、織田家編を空いた枠で始めるのを先に出す（前の保存は続きからそのまま遊べる）
  const oldScn = saved && (saved.scenario || 'okehazama') !== 'oda';
  const freeSlot = slots.findIndex((g) => !g);
  const scnCard = (k, on) => { const sc = SCENARIOS[k]; return `<label><span><input type="radio" name="scn" value="${k}" ${on ? 'checked' : ''}> ${sc.name}　<small style="display:inline">${sc.year}</small></span><small>${sc.blurb}</small><small class="sc-path">全${sc.battles.length}戦：${sc.battles.map((b) => esc(b.name)).join(' → ')}<br>届く身分：<b>${esc(RANKS[sc.ceil[sc.ceil.length - 1]].name)}</b>まで</small></label>`; };
  // 新しく始める：名 → 筋書き → 難易度 を一枚ずつ選ぶ（前に選んだ物を覚えておく）
  const pre = newPick();
  // 新しく始める時に選べる筋書き（いまは織田家編だけ。一つなら筋書きの歩は飛ばす）
  const scns = SCENARIO_PICK.filter(scenarioReady);
  const scn0 = scns.includes(pre.scn) ? pre.scn : scns[0];
  const diff0 = DIFFICULTY[pre.diff] ? pre.diff : 'normal';
  const NG_HTML = `<style>
    .ng{max-width:760px;margin:0 auto}
    .ng-top{display:flex;align-items:center;gap:14px;margin-bottom:6px}
    .ng-dots{display:flex;gap:6px;list-style:none;margin:0;padding:0}
    .ng-dots li{width:32px;height:4px;background:var(--line)}
    .ng-dots li.on{background:var(--kin)}
    .ng h2{font-family:var(--display);font-size:30px;letter-spacing:.12em;margin:6px 0 6px;font-weight:700}
    .ng .field{max-width:420px}
    .ng .field input{min-height:48px;box-sizing:border-box}
    .ng .diffs label{max-width:none}
    .ng-act{position:sticky;bottom:0;z-index:2;display:flex;gap:12px;align-items:center;margin-top:18px;padding:14px 0 calc(14px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(20,18,15,0),rgba(20,18,15,.94) 26%)}
    .ng-act .hintk{font-size:13px;color:var(--washi-dim);margin-left:auto}
    @media (max-height:500px){.ng h2{font-size:22px;margin:2px 0 4px}.ng .note{margin:2px 0}.ng .sc-path{display:none}.ng-act{padding-top:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom))}}
  </style>
  <div id="ng" class="ng" hidden>
    <div class="ng-top"><span class="eyebrow" id="ng-count" aria-live="polite">1 / 3</span><ol class="ng-dots" aria-hidden="true"><li class="on"></li><li></li><li></li></ol></div>
    <section class="ng-step" aria-labelledby="ng-h0"><h2 id="ng-h0" tabindex="-1">名を決める</h2><p class="note">あなたが演じる足軽の名（8字まで）</p><div class="field"><label for="nm">足軽の名</label><input id="nm" maxlength="8" value="${esc(pre.name || '弥五郎')}" autocomplete="off" enterkeyhint="next"></div></section>
    <section class="ng-step" aria-labelledby="ng-h1" hidden><h2 id="ng-h1" tabindex="-1">筋書きを選ぶ</h2><p class="note">遊ぶ時代を選ぶ</p><div class="diffs scn scn-all" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px" role="radiogroup" aria-labelledby="ng-h1">${scns.map((k) => scnCard(k, k === scn0)).join('')}</div></section>
    <section class="ng-step" aria-labelledby="ng-h2" hidden><h2 id="ng-h2" tabindex="-1">難易度を選ぶ</h2><p class="note">迷ったら「普通」</p><div class="diffs" role="radiogroup" aria-labelledby="ng-h2">${Object.entries(DIFFICULTY).map(([k, d]) => `<label><span><input type="radio" name="diff" value="${k}" ${k === diff0 ? 'checked' : ''}> ${d.name}</span><small>${d.note}</small></label>`).join('')}</div></section>
    <div class="ng-act"><button class="btn" id="ng-back">戻る</button><button class="btn primary" id="ng-next">次へ</button>${matchMedia('(pointer: coarse)').matches ? '' : '<span class="hintk">Enter で次へ・Esc で戻る</span>'}</div>
  </div>`;
  show(`<div class="wrap">
    <div id="tt-home">
    <div class="eyebrow">早期体験版 v0.6　・　織田家編　・　桶狭間から天下へ</div>
    ${window.innerHeight > window.innerWidth ? '<p class="note" style="color:var(--kin)">画面を横向きにするか、PCで遊ぶことをおすすめします。</p>' : ''}
    ${matchMedia('(pointer: coarse)').matches ? '<p class="note" style="color:var(--kin)">指で遊べます。左の親指で歩き、右側をなぞって見回し、右下の丸で突く・構える・回避。</p>' : ''}
    ${illustHtml('title', 'title', '合戦図屏風の一枚絵：土煙の中を駆ける赤備えの騎馬と、馬防柵の内の鉄砲')}
    <h1 class="title">戦国<span>立身</span></h1>
    <style>.tt-lead .ls{display:none}@media (max-height:500px){.tt-lead{margin:2px 0 0;line-height:1.6}.tt-lead .ll{display:none}.tt-lead .ls{display:inline}.tt-gap{height:4px!important}}</style>
    <p class="lead tt-lead"><span class="ll">永禄三年、桶狭間。雨の中を駆ける織田の兵の中に、<br>名もなき足軽がひとりいる。<br>織田家の戦を一つずつ越え、手柄と銭を積み、やがて組を率いる。</span><span class="ls">桶狭間の雨から、織田の足軽が身を立てる。</span></p>
    <div class="tt-gap" style="height:20px"></div>
    ${saved ? `<p class="savebox">保存データ：${saveInfo}${saved.journal && saved.journal.length ? `<br>前回：${esc(saved.journal[saved.journal.length - 1].t)}　${esc(saved.journal[saved.journal.length - 1].s.slice(0, 40))}` : ''}</p><div id="new-confirm"></div>` : ''}
    <div class="title-act">${saved ? (oldScn
      ? `<button class="btn primary" id="b-new">織田家編を始める${freeSlot >= 0 ? `（空いている枠${freeSlot + 1}へ）` : ''}</button><button class="btn" id="b-cont">続きから（${esc(scOf(saved).name)}）</button>`
      : `<button class="btn primary" id="b-cont">続きから（${esc(scOf(saved).name)}）</button><button class="btn" id="b-new">新しく始める</button>`) : '<button class="btn primary" id="b-new">出陣する</button>'}<button class="btn" id="b-set">設定</button>${matchMedia('(pointer: coarse)').matches ? '' : `<span class="hintk">Enter で「${saved && !oldScn ? '続きから' : saved ? '織田家編を始める' : '出陣する'}」</span>`}</div>
    <div class="title-more"><div class="lbl">ほかの遊び方</div><div class="row"><button class="btn small" id="b-ladder">出世の道</button><button class="btn small" id="b-dojo">稽古場</button><button class="btn small" id="b-rec">記録帳</button><button class="btn small" id="b-zukan">武将図鑑</button><button class="btn small" id="b-ach">実績</button>${onJapan ? '<button class="btn small" id="b-japan">日本地図</button>' : ''}${onSamurai ? '<button class="btn small" id="b-samurai">侍大将で出陣</button>' : ''}${onLord ? '<button class="btn small" id="b-nobunaga">織田信長で出陣</button>' : ''}</div></div>
    <div id="samurai-pick"></div>
    <details class="title-data"><summary class="note">保存の枠・保存コード</summary><div style="height:10px"></div>
    <div class="field" style="max-width:none"><label id="lb-slot">保存の枠</label><div class="slots" role="group" aria-labelledby="lb-slot">${slots.map((g, i) => `<button class="slotcard ${i === S.slot ? 'on' : ''}" data-slot="${i}" aria-pressed="${i === S.slot}"><b>枠 ${i + 1}</b><small>${g ? `${esc(g.name)}・${esc(RANKS[g.rank].name)}<br>${esc(nextOf(g))}<br>累計戦功 ${g.merit || 0}` : '空き'}</small>${g && (g.grades || []).some(Boolean) ? `<span class="sl-g" aria-label="戦ごとの評定">${scOf(g).battles.map((b, j) => (g.grades[j] ? `<i class="g-${g.grades[j]}" title="${esc(b.name)}">${g.grades[j]}</i>` : '')).join('')}</span>` : ''}</button>`).join('')}</div></div>
    <div class="title-foot">${saved ? '<button class="btn small" id="b-del">この枠の記録を消す</button>' : ''}<button class="btn small" id="b-export" ${saved ? '' : 'disabled'}>保存コードを書き出す</button><button class="btn small" id="b-import">保存コードから再開</button>${saved && saved.battle >= scOf(saved).battles.length ? '<button class="btn small" id="b-chapter">章を選んで遊ぶ</button>' : ''}</div>
    <div id="chapters"></div>
    <div id="io-box"></div>
    </details>
    <div style="height:36px"></div>
    ${matchMedia('(pointer: coarse)').matches ? '<div class="eyebrow" style="margin-bottom:12px">操作（指）</div><p class="note">左の親指：触れた所に出る棒で歩く（外まで押し込むと走る）<br>右側をなぞる：見回す<br>右下の丸：突く（押し続けて離すと溜め突き）・構え・回避・狙い・鼓舞・号令（押したまま滑らせて選ぶ）<br>左上：止める・地図　／　キーボードやゲームパッドをつなぐと、そのまま使えます</p><div style="height:14px"></div><details><summary class="note" style="cursor:pointer">キーボード・マウスの操作</summary><div style="height:10px"></div>' + keysHtml() + '</details>' : `<details><summary class="note" style="cursor:pointer">キーボード・マウスの操作</summary><div style="height:10px"></div>${keysHtml()}</details>`}
    <div style="height:18px"></div>
    <details><summary class="note" style="cursor:pointer">ゲームパッドの操作</summary><div style="height:10px"></div>${keysHtml(true)}</details>
    <div style="height:22px"></div>
    <p class="note">${matchMedia('(pointer: coarse)').matches ? '横向きで遊んでください。' : 'PC向けの試作です。'}音が出ます。<br>進行は城下に戻るたびにこのブラウザへ自動保存されます。<br>この試作の目的：「足軽から指揮官になっていく過程そのものが面白いか」を確かめること。</p>
    </div>
    ${NG_HTML}
  </div>`, false, (e) => {
    // 三歩の札を開いている時：Enter で次へ、Esc で戻る
    if (!$('ng').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); $('ng-back').click(); }
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); $('ng-next').click(); }
      return;
    }
    // 釦に焦点がある時の Enter は、その釦を押す（信長・侍大将の札の戦を選べるように）
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); (saved && !oldScn ? $('b-cont') : $('b-new')).click(); }
  });
  const start = () => onNew(($('nm').value || '弥五郎').trim().slice(0, 8), (document.querySelector('input[name=diff]:checked') || {}).value || 'normal', (document.querySelector('input[name=scn]:checked') || {}).value || scns[0] || 'oda');
  // 保存コード（別のブラウザや端末へ進行を持ち運ぶ）
  $('b-export').onclick = () => {
    if (!saved) return;
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(saved))));
    $('io-box').innerHTML = `<p class="note">この文字列を控えておけば、「保存コードから再開」で続きから遊べます。</p><textarea id="io-text" readonly>${code}</textarea>`;
    const t = $('io-text'); t.focus(); t.select();
    navigator.clipboard?.writeText(code).then(() => notice('保存コードをコピーしました')).catch(() => {});
  };
  $('b-import').onclick = () => {
    $('io-box').innerHTML = '<p class="note">書き出した保存コードを貼り付けてください。</p><textarea id="io-text"></textarea><div class="row" style="margin-top:8px"><button class="btn small primary" id="io-go">この保存で再開</button></div><div id="io-err" role="alert"></div>';
    $('io-go').onclick = () => {
      try {
        const G = migrate(JSON.parse(decodeURIComponent(escape(atob($('io-text').value.trim())))));
        if (!G || !G.name || G.rank === undefined) throw new Error('bad');
        onImport(G);
      } catch (e) { $('io-err').innerHTML = '<p class="errbox">保存コードを読み取れませんでした。書き出した文字列を、はじめから終わりまで全部貼り付けてください。</p>'; }
    };
  };
  // 三歩の札：step 0 名・1 筋書き・2 難易度。最後の「出陣する」で始める
  let step = 0;
  const begin = () => {
    newPick({ name: ($('nm').value || '').trim().slice(0, 8), scn: (document.querySelector('input[name=scn]:checked') || {}).value, diff: (document.querySelector('input[name=diff]:checked') || {}).value });
    // 空いた枠があれば、いまの保存を消さずにそちらで始める
    if (saved && freeSlot >= 0) { const prev = S.slot; S.slot = freeSlot; saveSettings(); notice(`枠${freeSlot + 1}で新しく始めます（前の保存は枠${prev + 1}に残っています）`); }
    start();
  };
  // 筋書きが一つだけなら、筋書きの歩は飛ばす（その一つが選ばれたまま）
  const ORDER = scns.length > 1 ? [0, 1, 2] : [0, 2];
  const ngShow = (k) => {
    step = k;
    const open = k >= 0;
    $('tt-home').hidden = open; $('ng').hidden = !open;
    if (!open) { $('b-new').focus(); return; }
    const n = ORDER[k], last = k === ORDER.length - 1;
    document.querySelectorAll('#ng .ng-step').forEach((el, i) => { el.hidden = i !== n; });
    document.querySelectorAll('#ng .ng-dots li').forEach((el, i) => { el.hidden = i >= ORDER.length; el.classList.toggle('on', i <= k); });
    $('ng-count').textContent = `${k + 1} / ${ORDER.length}`;
    $('ng-next').textContent = last ? '出陣する' : '次へ';
    $('screen').scrollTop = 0;
    // 焦点：名の欄（触る端末では文字盤で画面が隠れるので当てない）か、選んである札
    const touch = matchMedia('(pointer: coarse)').matches;
    const el = n === 0 ? (touch ? $('ng-h0') : $('nm')) : document.querySelector(`#ng .ng-step:nth-of-type(${n + 1}) input:checked`) || $(`ng-h${n}`);
    if (el) el.focus({ preventScroll: true });
  };
  $('ng-back').onclick = () => { sfx('ui'); ngShow(step - 1); };
  $('ng-next').onclick = () => {
    sfx('ui');
    if (ORDER[step] === 0 && !$('nm').value.trim()) $('nm').value = '弥五郎';
    if (step < ORDER.length - 1) ngShow(step + 1); else begin();
  };
  $('b-new').onclick = () => {
    if (!saved || freeSlot >= 0) return ngShow(0);
    // 保存データがあるときは上書きの確認をはさむ
    confirmBox($('new-confirm'), `枠${S.slot + 1}の保存データ（${saved.name}・${RANKS[saved.rank].name}）を消して、新しく始めます。`, '消して新しく始める', () => ngShow(0));
  };
  if (saved) $('b-cont').onclick = onContinue;
  document.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { sfx('ui'); onSlot(+b.dataset.slot); });
  const del = $('b-del');
  if (del) del.onclick = () => {
    confirmBox($('io-box'), `枠${S.slot + 1}の記録（${saved.name}・${RANKS[saved.rank].name}）を消します。`, '記録を消す', () => { onSlot(S.slot, true); });
  };
  const ch = $('b-chapter');
  if (ch) ch.onclick = () => {
    $('chapters').innerHTML = `<p class="note">記録を残さずに、好きな戦をもう一度遊べます（いまの身分・装備・組のまま）。</p><div class="row">${BATTLES.map((b, i) => `<button class="btn small" data-ch="${i}">${esc(b.name)}${saved.best && saved.best[i] ? `（最高 ${saved.best[i]}）` : ''}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-ch]').forEach((b) => b.onclick = () => onChapter(+b.dataset.ch));
  };
  $('b-set').onclick = onSettings;
  $('b-dojo').onclick = onDojo;
  $('b-rec').onclick = onRecords;
  // 武将図鑑と実績（src/zukan.js が自前の重ねた画面で開く）
  $('b-zukan').onclick = () => import('./zukan.js').then((m) => m.zukanOpen('busho'));
  $('b-ach').onclick = () => import('./zukan.js').then((m) => m.zukanOpen('ach'));
  $('b-ladder').onclick = onLadder;
  // 日本地図（武将になってから開く天下の地図。足軽大将より前は試し）
  if (onJapan) $('b-japan').onclick = () => { sfx('ui'); onJapan(); };
  // 侍大将で出陣：筋書きと戦を選ぶ。記録は残らない
  if (onSamurai) $('b-samurai').onclick = () => {
    sfx('ui');
    const box = $('samurai-pick');
    box.innerHTML = `<div class="confirm-row" style="display:block"><b>侍大将として、どの戦に出るか</b>
      <p class="note">前立の兜・陣羽織・馬で出陣し、槍・弓・鉄砲・騎馬のおよそ六十人を率います（記録は残りません）。Tab で号令、G で号令をかける隊を切り替え。</p>
      ${(() => { const seen = new Set(); return [...SCENARIO_PICK, ...SCENARIO_ORDER].filter(scenarioReady).map((k) => { const bs = SCENARIOS[k].battles.filter((b) => !seen.has(b.id)); bs.forEach((b) => seen.add(b.id)); return bs.length ? `<div style="margin-top:10px"><div class="eyebrow">${esc(SCENARIO_PICK.includes(k) ? SCENARIOS[k].name : `ほかの戦（${SCENARIOS[k].year}）`)}</div><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px">${bs.map((b) => `<button class="btn small" data-sam="${k}|${b.id}">${esc(b.name)}</button>`).join('')}</div></div>` : ''; }).join(''); })()}
      <div class="row" style="margin-top:12px"><button class="btn small" id="sam-no">閉じる</button></div></div>`;
    box.querySelectorAll('[data-sam]').forEach((b) => b.onclick = () => { const [k, id] = b.dataset.sam.split('|'); onSamurai(k, id); });
    $('sam-no').onclick = () => { box.innerHTML = ''; };
    box.scrollIntoView({ block: 'center' });
  };
  // 織田信長で出陣：信長がその場にいた戦と視点を選ぶ。天下の地図で織田家を率いる入口も。記録は残らない
  if (onLord) $('b-nobunaga').onclick = () => {
    sfx('ui');
    const box = $('samurai-pick');
    const fp = S.view === 'first';
    box.innerHTML = `<div class="confirm-row lord-pick" style="display:block" role="region" aria-labelledby="lp-h"><b id="lp-h">織田信長として、どの戦に出るか</b>
      <p class="note">尾張の大名、織田信長として戦う。旗本（馬廻・母衣衆・鉄砲・弓・長柄）の百人を率い、M の軍配の図で味方の全部の隊を動かします。信長が討たれるか、旗本が崩れたら負け（記録は残りません）。</p>
      <div class="field" style="max-width:none;margin-top:10px"><label id="lp-view">視点</label><div class="diffs" role="radiogroup" aria-labelledby="lp-view" style="display:flex;gap:8px;flex-wrap:wrap">
        <label><span><input type="radio" name="lp-view" value="third" ${fp ? '' : 'checked'}> 三人称</span><small>背中から見る</small></label>
        <label><span><input type="radio" name="lp-view" value="first" ${fp ? 'checked' : ''}> 一人称</span><small>信長の目で見る（戦の中で V で切り替え）</small></label></div></div>
      <div class="eyebrow" style="margin-top:12px">信長がいた戦</div>
      <div class="lp-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:6px">${onLord.list.filter((L) => SCENARIOS[L.scn] && SCENARIOS[L.scn].battles.some((b) => b.id === L.id)).map((L) => `<button class="btn small lp-card" data-lord="${L.id}" style="min-height:64px;text-align:left;display:block;padding:8px 12px"><b style="display:block;font-size:15px">${esc(L.name)}</b><small style="display:block;opacity:.8;margin-top:2px">${esc(L.year.split('　')[0])}</small><small style="display:block;margin-top:2px;color:var(--kin)">${esc(L.goal || 'もとの任務のまま、大将として')}</small></button>`).join('')}</div>
      <div class="eyebrow" style="margin-top:14px">天下の地図で織田家を率いる（当主・国持）</div>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px"><button class="btn small" data-lordmap="nagashino" style="min-height:48px">天正三年（長篠の頃）から</button><button class="btn small" data-lordmap="hoi" style="min-height:48px">元亀元年（信長包囲網）から</button></div>
      <div class="row" style="margin-top:12px"><button class="btn small" id="lp-no">閉じる</button></div></div>`;
    const view = () => (box.querySelector('input[name=lp-view]:checked') || {}).value || 'third';
    box.querySelectorAll('[data-lord]').forEach((b) => b.onclick = () => onLord.onBattle(b.dataset.lord, view()));
    box.querySelectorAll('[data-lordmap]').forEach((b) => b.onclick = () => onLord.onMap(b.dataset.lordmap));
    $('lp-no').onclick = () => { box.innerHTML = ''; $('b-nobunaga').focus(); };
    box.scrollIntoView({ block: 'center' });
    const first = box.querySelector('[data-lord]'); if (first) first.focus();
  };
  // 触る端末では名の欄に焦点を当てない（文字盤が開いて画面が隠れる）
  if (!matchMedia('(pointer: coarse)').matches) (saved && !oldScn ? $('b-cont') : $('b-new')).focus({ preventScroll: true });
  $('screen').classList.add('withbg');
  mountIllust($('screen'));
  // 最初の操作で琴の音
  const once = () => { sfx('koto', 0.8); document.removeEventListener('pointerdown', once); };
  document.addEventListener('pointerdown', once);
}

// ---------------- 設定 ----------------
const SET_CAT = {
  操作: ['st-sens', 'st-psens', 'st-inv', 'st-smooth', 'st-autocam', 'st-run', 'st-guard', 'st-aim', 'st-vib'],
  画面: ['st-fov', 'st-shake', 'st-blood', 'st-hudmode', 'st-rm', 'st-ca', 'st-ui', 'st-sub', 'st-subbg', 'st-hc', 'st-fade', 'st-float', 'st-hints', 'st-mark', 'st-toast', 'st-cross', 'st-north', 'st-fps', 'st-font', 'st-hudMinimap', 'st-hudCompass', 'st-hudArmy', 'st-hudSquad', 'st-hudBottom', 'st-hudObjectives'],
  音: ['st-vol', 'st-vsfx', 'st-vamb', 'st-vmus', 'st-town', 'st-voice', 'st-vrate'],
  画質: ['st-q', 'st-cap', 'st-dist'],
};
const SET_DESC = {
  'st-smooth': 'マウスの細かなぶれをならす', 'st-autocam': '歩いている間、視点を動かさなければ背後へ回る', 'st-aim': '突きが少し外れても、近くの敵に向き直って当てる',
  'st-rm': '揺れ・ゆっくり・大きな動きを抑える', 'st-ca': '敵味方を色の明るさと形でも見分ける', 'st-fade': '戦いが無い間は、まわりの札を薄くする',
  'st-mark': '遠くの敵にも頭上に小さな印を出す', 'st-toast': '「大事なものだけ」では5点未満の通知を出さない', 'st-north': 'ミニマップを回さず、北を上にしておく',
  'st-q': '低：影なし・草少なめ。重いときは自動で下がる', 'st-cap': '30 にすると電池の減りが少ない', 'st-dist': '霧の遠さ。短いほど軽い',
  'st-town': '城下で琴の旋律を流す', 'st-fps': '左下にFPSと兵の数を出す',
  'st-voice': 'ブラウザの音声合成で台詞を読む（日本語の声がある環境のみ）', 'st-font': '本文の字の形',
};
export function settingsHtml() {
  const row = (id, label, input, out = '') => {
    const cat = Object.keys(SET_CAT).find((c) => SET_CAT[c].includes(id)) || '操作';
    return `<div class="s-row" data-cat="${cat}"><label for="${id}">${label}${SET_DESC[id] ? `<small>${SET_DESC[id]}</small>` : ''}</label>${input}<output id="${id}-o">${out}</output></div>`;
  };
  const chk = (id, key) => `<input type="checkbox" id="${id}" ${S[key] ? 'checked' : ''}>`;
  return `<div class="settings"><div class="tabs st-tabs" role="tablist" aria-label="設定の分類">${Object.keys(SET_CAT).map((c, i) => `<button type="button" role="tab" data-stcat="${c}" class="${i === 0 ? 'on' : ''}" aria-selected="${i === 0}">${c}</button>`).join('')}</div>
    ${row('st-sens', '視点の感度', `<input type="range" id="st-sens" min="0.3" max="2.5" step="0.05" value="${S.sens}">`, S.sens.toFixed(2))}
    ${row('st-psens', 'スティックの感度', `<input type="range" id="st-psens" min="0.3" max="2.5" step="0.05" value="${S.padSens}">`, S.padSens.toFixed(2))}
    ${row('st-inv', '上下の反転', chk('st-inv', 'invertY'))}
    ${row('st-smooth', 'マウスの平滑化', chk('st-smooth', 'smooth'))}
    ${row('st-autocam', 'カメラが背後へ回る', chk('st-autocam', 'autoCam'))}
    ${row('st-view', '戦の視点（V で切替）', `<select id="st-view"><option value="third" ${S.view !== 'first' ? 'selected' : ''}>三人称（背中から見る）</option><option value="first" ${S.view === 'first' ? 'selected' : ''}>一人称（自分の目で見る）</option></select>`)}
    ${row('st-fov', '視野角', `<input type="range" id="st-fov" min="50" max="85" step="1" value="${S.fov}">`, S.fov + '°')}
    ${row('st-vol', '音量（全体）', `<input type="range" id="st-vol" min="0" max="1" step="0.05" value="${S.volume}">`, Math.round(S.volume * 100) + '%')}
    ${row('st-vsfx', '効果音', `<input type="range" id="st-vsfx" min="0" max="1" step="0.05" value="${S.volSfx}">`, Math.round(S.volSfx * 100) + '%')}
    ${row('st-vamb', '環境音', `<input type="range" id="st-vamb" min="0" max="1" step="0.05" value="${S.volAmb}">`, Math.round(S.volAmb * 100) + '%')}
    ${row('st-vmus', '楽の音', `<input type="range" id="st-vmus" min="0" max="1" step="0.05" value="${S.volMusic}">`, Math.round(S.volMusic * 100) + '%')}
    ${row('st-town', '城下の楽の音', chk('st-town', 'townMusic'))}
    ${row('st-q', '画質', `<select id="st-q"><option value="low" ${S.quality === 'low' ? 'selected' : ''}>低（影なし・草少なめ）</option><option value="mid" ${S.quality === 'mid' ? 'selected' : ''}>中</option><option value="high" ${S.quality === 'high' ? 'selected' : ''}>高</option></select>`)}
    ${row('st-run', '走りを切替式に', chk('st-run', 'runToggle'), '')}
    ${row('st-guard', '構えを切替式に', chk('st-guard', 'guardToggle'), '')}
    ${row('st-aim', '照準補助', chk('st-aim', 'aimAssist'))}
    ${row('st-shake', '画面の揺れ', chk('st-shake', 'shake'))}
    ${row('st-hudmode', '画面の札の量', `<select id="st-hudmode"><option value="min" ${S.hudMode === 'min' ? 'selected' : ''}>最小（戦場を広く）</option><option value="normal" ${(S.hudMode || 'normal') === 'normal' ? 'selected' : ''}>ふつう</option><option value="full" ${S.hudMode === 'full' ? 'selected' : ''}>全部</option></select>`)}
    ${row('st-blood', '血の見せ方', `<select id="st-blood"><option value="on" ${(S.blood || 'on') === 'on' ? 'selected' : ''}>あり</option><option value="low" ${S.blood === 'low' ? 'selected' : ''}>控えめ</option><option value="off" ${S.blood === 'off' ? 'selected' : ''}>なし</option></select>`)}
    ${row('st-rm', '動きを減らす', chk('st-rm', 'reduceMotion'))}
    ${row('st-ca', '色覚に配慮した配色', chk('st-ca', 'colorAssist'))}
    ${row('st-ui', 'UIの大きさ', `<select id="st-ui"><option value="s" ${S.uiScale === 's' ? 'selected' : ''}>小</option><option value="m" ${S.uiScale === 'm' ? 'selected' : ''}>中</option><option value="l" ${S.uiScale === 'l' ? 'selected' : ''}>大</option></select>`)}
    ${row('st-vib', 'ゲームパッドの振動', chk('st-vib', 'vibrate'))}
    ${row('st-sub', '字幕の大きさ', `<select id="st-sub"><option value="s" ${S.subSize === 's' ? 'selected' : ''}>小</option><option value="m" ${S.subSize === 'm' ? 'selected' : ''}>中</option><option value="l" ${S.subSize === 'l' ? 'selected' : ''}>大</option></select>`)}
    ${row('st-hints', 'ヒントを表示', chk('st-hints', 'hints'))}
    ${row('st-subbg', '字幕に下地を敷く', chk('st-subbg', 'subBg'))}
    ${row('st-hc', 'HUDのコントラストを上げる', chk('st-hc', 'hudContrast'))}
    ${row('st-fade', '平時はHUDを薄く', chk('st-fade', 'hudAutoFade'))}
    ${row('st-float', '討った場所に戦功を浮かべる', chk('st-float', 'floatMerit'))}
    ${row('st-cap', '描画の上限', `<select id="st-cap"><option value="0" ${!S.fpsCap ? 'selected' : ''}>上限なし</option><option value="60" ${S.fpsCap === 60 ? 'selected' : ''}>60</option><option value="30" ${S.fpsCap === 30 ? 'selected' : ''}>30（省電力）</option></select>`)}
    ${row('st-dist', '見える遠さ', `<input type="range" id="st-dist" min="0.6" max="1.4" step="0.05" value="${S.drawDist}">`, Math.round(S.drawDist * 100) + '%')}
    ${row('st-fps', 'FPSを表示', chk('st-fps', 'showFps'))}
    ${row('st-mark', '敵の頭上に常に印', chk('st-mark', 'enemyMark'))}
    ${row('st-toast', '戦功の通知', `<select id="st-toast"><option value="all" ${S.toastLevel === 'all' ? 'selected' : ''}>すべて</option><option value="important" ${S.toastLevel === 'important' ? 'selected' : ''}>大事なものだけ</option></select>`)}
    ${row('st-cross', '照準の形', `<select id="st-cross"><option value="dot" ${S.crosshair === 'dot' ? 'selected' : ''}>点</option><option value="cross" ${S.crosshair === 'cross' ? 'selected' : ''}>十字</option><option value="none" ${S.crosshair === 'none' ? 'selected' : ''}>なし</option></select>`)}
    ${row('st-north', 'ミニマップを北が上に', chk('st-north', 'mapNorth'))}
    ${row('st-font', '文字の書体', `<select id="st-font"><option value="gothic" ${S.fontBody === 'gothic' ? 'selected' : ''}>ゴシック（読みやすい）</option><option value="mincho" ${S.fontBody === 'mincho' ? 'selected' : ''}>明朝（雰囲気）</option></select>`)}
    ${['hudMinimap:ミニマップ', 'hudCompass:方角の帯', 'hudArmy:両軍の兵力', 'hudSquad:組の札', 'hudBottom:下の札', 'hudObjectives:任務の札'].map((x) => { const [k, l] = x.split(':'); return row('st-' + k, `表示：${l}`, `<input type="checkbox" id="st-${k}" ${S[k] ? 'checked' : ''}>`); }).join('')}
    ${row('st-voice', '台詞の読み上げ', `<select id="st-voice"><option value="off" ${S.voice === 'off' ? 'selected' : ''}>読み上げない</option><option value="major" ${S.voice === 'major' ? 'selected' : ''}>主な人物だけ</option><option value="all" ${S.voice === 'all' ? 'selected' : ''}>すべて</option></select>`)}
    ${row('st-vrate', '読み上げの速さ', `<input type="range" id="st-vrate" min="0.7" max="1.5" step="0.05" value="${S.voiceRate}">`, S.voiceRate.toFixed(2))}
    <div class="row"><button class="btn small" id="st-rehint">ヒントをもう一度すべて表示する</button><button class="btn small" id="st-reset">設定を初期値に戻す</button></div><div id="st-reset-cf"></div>
    <div class="eyebrow kb-lbl" style="margin-top:10px">キー割り当て（操作を選んでから、割り当てたいキーを押してください）</div>
    <div class="row kb-lbl"><button type="button" class="btn small" id="kb-arrows">矢印キーで移動する</button><button type="button" class="btn small" id="kb-reset">キーを初期に戻す</button></div>
    <div class="keybind">${Object.keys(BIND_DEFAULTS).map((a) => `<button data-bind="${a}"><span>${BIND_LABELS[a]}</span><b>${keyLabel(S.binds[a])}</b></button>`).join('')}</div>
  </div>`;
}

export function bindSettings(onChange) {
  const bind = (id, key, conv, fmt) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      S[key] = conv(el);
      if (fmt && $(id + '-o')) $(id + '-o').textContent = fmt(S[key]);
      saveSettings();
      onChange && onChange(key);
    });
  };
  bind('st-sens', 'sens', (e) => +e.value, (v) => v.toFixed(2));
  bind('st-psens', 'padSens', (e) => +e.value, (v) => v.toFixed(2));
  bind('st-smooth', 'smooth', (e) => e.checked);
  bind('st-autocam', 'autoCam', (e) => e.checked);
  bind('st-view', 'view', (e) => e.value);
  bind('st-guard', 'guardToggle', (e) => e.checked);
  bind('st-rm', 'reduceMotion', (e) => e.checked);
  bind('st-ca', 'colorAssist', (e) => e.checked);
  bind('st-ui', 'uiScale', (e) => e.value);
  bind('st-vib', 'vibrate', (e) => e.checked);
  bind('st-vsfx', 'volSfx', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-vamb', 'volAmb', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-vmus', 'volMusic', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-town', 'townMusic', (e) => e.checked);
  bind('st-subbg', 'subBg', (e) => e.checked);
  bind('st-hc', 'hudContrast', (e) => e.checked);
  bind('st-fade', 'hudAutoFade', (e) => e.checked);
  bind('st-float', 'floatMerit', (e) => e.checked);
  bind('st-cap', 'fpsCap', (e) => +e.value);
  bind('st-dist', 'drawDist', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-mark', 'enemyMark', (e) => e.checked);
  bind('st-toast', 'toastLevel', (e) => e.value);
  bind('st-cross', 'crosshair', (e) => e.value);
  bind('st-blood', 'blood', (e) => e.value);
  bind('st-hudmode', 'hudMode', (e) => e.value);
  bind('st-north', 'mapNorth', (e) => e.checked);
  bind('st-font', 'fontBody', (e) => e.value);
  bind('st-voice', 'voice', (e) => e.value);
  bind('st-vrate', 'voiceRate', (e) => +e.value, (v) => v.toFixed(2));
  for (const k of ['hudMinimap', 'hudCompass', 'hudArmy', 'hudSquad', 'hudBottom', 'hudObjectives']) bind('st-' + k, k, (e) => e.checked);
  // 分類のタブ
  const show = (cat) => {
    document.querySelectorAll('.settings .s-row').forEach((r) => { r.hidden = r.dataset.cat !== cat; });
    document.querySelectorAll('[data-stcat]').forEach((b) => { b.classList.toggle('on', b.dataset.stcat === cat); b.setAttribute('aria-selected', b.dataset.stcat === cat); });
    document.querySelectorAll('.settings .keybind, .settings .kb-lbl').forEach((r) => { r.hidden = cat !== '操作'; });
  };
  document.querySelectorAll('[data-stcat]').forEach((b) => {
    b.onclick = () => show(b.dataset.stcat);
    // ←→ で隣の分類へ（タブの決まり）
    b.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = [...document.querySelectorAll('[data-stcat]')];
      const n = all[(all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      e.preventDefault(); e.stopPropagation(); show(n.dataset.stcat); n.focus();
    };
  });
  show('操作');
  bind('st-inv', 'invertY', (e) => e.checked);
  bind('st-fov', 'fov', (e) => +e.value, (v) => v + '°');
  bind('st-vol', 'volume', (e) => +e.value, (v) => Math.round(v * 100) + '%');
  bind('st-q', 'quality', (e) => e.value);
  bind('st-run', 'runToggle', (e) => e.checked);
  bind('st-aim', 'aimAssist', (e) => e.checked);
  bind('st-shake', 'shake', (e) => e.checked);
  bind('st-sub', 'subSize', (e) => e.value);
  bind('st-hints', 'hints', (e) => e.checked);
  bind('st-fps', 'showFps', (e) => e.checked);
  const rh = $('st-rehint');
  if (rh) rh.onclick = () => { resetHints(); notice('ヒントを、もう一度はじめから出します'); };
  const rs = $('st-reset');
  if (rs) rs.onclick = () => confirmBox($('st-reset-cf'), '音・画面・操作・キー割り当ての設定を、すべて初期値に戻します。', '初期値に戻す', () => {
    resetSettings(); onChange && onChange('all');
    const box = rs.closest('.settings');
    const holder = box.parentElement;
    box.outerHTML = settingsHtml();
    bindSettings(onChange);
    void holder;
    notice('設定を初期値に戻しました');
  });
  const refreshKeys = () => document.querySelectorAll('[data-bind]').forEach((x) => { x.querySelector('b').textContent = keyLabel(S.binds[x.dataset.bind]); });
  const ka = $('kb-arrows');
  if (ka) ka.onclick = () => { Object.assign(S.binds, { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }); saveSettings(); refreshKeys(); notice('矢印キーで動けるようにしました'); };
  const kr = $('kb-reset');
  if (kr) kr.onclick = () => { S.binds = { ...BIND_DEFAULTS }; saveSettings(); refreshKeys(); notice('キーを初期に戻しました'); };
  // キー割り当て
  document.querySelectorAll('[data-bind]').forEach((b) => b.onclick = () => {
    b.classList.add('wait'); b.querySelector('b').textContent = 'キーを押してください（Esc でやめる）';
    const h = (e) => {
      e.preventDefault(); e.stopPropagation();
      window.removeEventListener('keydown', h, true);
      if (e.code !== 'Escape') {
        const act = b.dataset.bind;
        // 同じキーが別の操作に割り当てられていたら入れ替える
        for (const [k, v] of Object.entries(S.binds)) if (v === e.code && k !== act) S.binds[k] = S.binds[act];
        S.binds[act] = e.code;
        saveSettings();
        onChange && onChange('binds');
      }
      document.querySelectorAll('[data-bind]').forEach((x) => { x.classList.remove('wait'); x.querySelector('b').textContent = keyLabel(S.binds[x.dataset.bind]); });
    };
    window.addEventListener('keydown', h, true);
  });
}

export function settingsScreen(onChange, onClose) {
  show(`<div class="wrap"><div class="eyebrow">設定</div><h2 style="font-family:var(--display);font-size:32px;letter-spacing:.1em;margin:8px 0 22px">設定</h2>
    ${settingsHtml()}
    <p class="note" style="margin-top:26px">変えた設定はすぐに効き、このブラウザに保存されます。画質の「草・木の量」は次の戦から変わります。</p>
    <div class="title-act"><button class="btn primary" id="st-close">戻る</button><span class="hintk">Esc でも戻れます</span></div></div>`, false, (e) => { if (e.key === 'Escape') onClose(); });
  bindSettings(onChange);
  $('st-close').onclick = onClose;
}

// ---------------- 物語の幕間 ----------------
export function storyCard({ year, title, text, button = '進む', tips }, onNext) {
  let done = false;
  const go = () => { if (done) return; done = true; sfx('ui'); onNext(); };
  // 523：どこで・どの身分で戦うのかを添える（戦の名から場所を引く。G はゲームから借りる）
  const bt = BATTLES.find((b) => b.name.startsWith(title) || title.startsWith(b.name));
  const G = window.__game && window.__game.G;
  // 戦ごとの合戦図屏風の一枚（城の戦で専用の絵がなければ城攻めの絵）
  const ik = illustKey(bt && bt.id, title);
  const who = G && G.lord ? `${esc(G.name)}　<b>${esc(G.lordTitle || '当主')}</b>・旗本 百人と、味方の全部の隊を率いる` : G && G.name ? `${esc(G.name)}　<b>${esc(RANKS[G.rank].name)}</b>${RANKS[G.rank].squad ? `・組 ${RANKS[G.rank].squad}人を預かる` : '・組はまだ無い'}` : '';
  const st = show(`<div class="story ${RM() ? 'fast' : ''} ${ik ? 'has-ill' : ''}"><div>
    ${illustHtml(ik)}
    <div class="year">${esc(year)}${bt && bt.place && !year.includes(bt.place.slice(0, 2)) ? `　・　${esc(bt.place)}` : ''}</div>
    <h2>${esc(title)}</h2>
    ${who ? `<div class="st-who">${who}</div>` : ''}
    ${text.map((t, i) => `<p style="animation-delay:${0.3 + i * 0.9}s">${esc(t)}</p>`).join('')}
    ${tips ? `<div class="st-tip" style="animation-delay:${0.3 + text.length * 0.9}s"><small>この戦の心得</small><span>${esc(tips)}</span><span style="display:block;margin-top:4px;opacity:.85">${isTouch ? '左上の「視点」で一人称・三人称' : 'V で一人称・三人称'}${G && G.lord ? (isTouch ? '／左上の「地図」で軍配の図（全軍を動かす）' : '／M で軍配の図（全軍を動かす）・J で使番') : ''}</span></div>` : ''}
    <button class="btn primary" id="b-next">${esc(button)}</button>
    <div class="keyhint">Enter / Space で進む</div>
    ${RM() ? '' : '<div class="st-skip">画面を押すと、残りの文をすぐ出します</div>'}
  </div></div>`, false, (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  // 文が出るのを待たずに読めるように（ボタン以外を押すと全部出す）
  const box = st.querySelector('.story');
  box.addEventListener('click', (e) => { if (!e.target.closest('button')) box.classList.add('fast'); });
  mountIllust(st);
  $('b-next').onclick = go;
  $('b-next').focus();
}

// ---------------- 戦の後：分捕った馬を持ち帰るか ----------------
// p は戦のプレイヤー。敵の馬を分捕って、その馬がまだ手元（乗っている・そばで待っている）にあれば聞く。無ければそのまま next
export function spoilHorseScreen(G, p, next) {
  const team = p && p.u ? p.u.team : 0;
  let sp = null;
  if (p && p.spoilAwarded) {
    if (p.mounted && p.spoil && p.spoil.team !== team && p.horseHp > 0) sp = p.spoil;
    else for (const o of (p.rt && p.rt.army && p.rt.army.looseHorses) || []) if (o.kept && o.stats && o.stats.spoil && o.stats.spoil.team !== team) { sp = o.stats.spoil; break; }
  }
  if (!sp || G.practice || G.lord) { next(); return; }
  const who = sp.who || '敵';
  const had = (G.horses || []).includes('bundori');
  const prev = had ? ((G.horse && G.horse.id === 'bundori' ? G.horse : (G.horseBonds || {}).bundori) || {}) : null;
  let fin = false;
  const done = (keep) => {
    if (fin) return;
    fin = true;
    sfx(keep ? 'neigh' : 'ui', 0.6);
    if (keep) {
      const h = { id: 'bundori', bond: 0, from: who };
      G.horses = [...new Set([...(G.horses || ['tsukikage']), 'bundori'])];
      G.horseBonds = { ...(G.horseBonds || {}), bundori: h };
      // いま分捕り馬に乗っているなら、新しい馬に替える
      if (G.horse && G.horse.id === 'bundori') G.horse = h;
    }
    next();
  };
  show(`<div class="wrap" style="max-width:640px">
    <div class="eyebrow">戦の後</div>
    <h2 style="font-family:var(--display);font-size:30px;letter-spacing:.1em;margin:8px 0">${esc(who)}の馬</h2>
    <p class="lead">戦で分捕った馬が、まだ手綱につながれている。持ち帰れば城下の馬屋に並び、乗り換えられる。</p>
    ${ladderStep(G) < 2 ? '<p class="note">馬屋で乗れるのは足軽大将から。それまでは馬屋で預かる。</p>' : ''}
    ${had ? `<p class="note">前に分捕った馬（${esc(prev.name || prev.from || '分捕り馬')}）と入れ替わる。</p>` : ''}
    <div class="row" style="margin-top:18px;gap:12px"><button class="btn primary" id="sp-keep">持ち帰る</button><button class="btn" id="sp-leave">置いていく</button></div>
  </div>`, false, (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } });
  $('sp-keep').onclick = () => done(true);
  $('sp-leave').onclick = () => done(false);
  $('sp-keep').focus();
}

// ---------------- 戦功評価 ----------------
// 四つの区分：武（自ら戦う）・任（任務）・将（組の指揮）・忠（下知を守る）。ref はその区分で「よく働いた」と言える目安
const CAT_INFO = {
  武: { long: '自ら戦う', ref: 50 },
  任: { long: '任務を果たす', ref: 55 },
  将: { long: '組を率いる', ref: 60 },
  忠: { long: '下知を守る', ref: 10 },
};
// 人間関係の鍵から名へ
const REL_NAME = { ...ODA_REL_NAME, okudaira: '奥平信昌', sakai: '酒井忠次', okubo: '大久保忠世', yashichi: '弥七', genpachi: '源八', osawa: '大沢勘兵衛', tokichiro: '木下藤吉郎', ieyasu: '徳川家康' };
const REL_KEYS = [['trust', '信頼'], ['like', '好感'], ['respect', '尊敬'], ['wary', '警戒']];
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
// 区分ごとに「良かったこと」と「足りなかったこと」を一言ずつ
function catNotes(c, r, hadSquad) {
  const L = r.lines.filter((l) => (l.cat || '任') === c);
  const one = (lb) => L.find((l) => l.label === lb);
  const num = (d) => String(d || '').replace(/（.*$/, '');
  const st = r.stats || {};
  const good = [], lack = [];
  if (c === '武') {
    const bs = L.filter((l) => l.label === '敵武将撃破');
    if (bs.length) good.push(`敵将 ${bs.map((b) => b.detail).join('・')} を討ち取る`);
    const sm = one('敵侍撃破'), as = one('敵足軽撃破');
    if (sm) good.push(`侍を${num(sm.detail)}討つ`);
    else if (as) good.push(`足軽を${num(as.detail)}討つ`);
    if ((st.parries || 0) >= 5) good.push(`受け流し ${st.parries}回`);
    if (as && /上限/.test(as.detail)) lack.push('足軽の討ち取りは上限に達した');
    else if (!L.length) lack.push('自ら討った敵がいない');
    if (st.parries === 0) lack.push('受け流しが一度もない');
  } else if (c === '任') {
    if (one('任務達成')) good.push('任務を果たした');
    for (const l of L.filter((x) => x.label === '副任務達成')) good.push(`副任務：${l.detail}`);
    if (one('味方救援')) good.push('囲まれた味方を救った');
    if (one('伝令成功')) good.push('伝令を届けた');
    if (one('拠点制圧')) good.push('拠点を落とした');
    for (const l of L.filter((x) => x.sp)) good.push(l.label);
    if (one('任務失敗')) lack.push('任務を果たせなかった');
    else if (!L.some((x) => x.label === '副任務達成')) lack.push('副任務には手が回らず');
  } else if (c === '将') {
    if (!hadSquad) return { good, lack, locked: '組を預かると、ここに組の働きが記される' };
    const fl = one('側面攻撃成功'), sv = L.find((x) => /部下生存率/.test(x.label)), sk = one('部下の撃破');
    if (fl) good.push(`横槍 ${num(fl.detail)}`);
    if (sv && sv.pts > 0) good.push(`組の${String(sv.detail).replace(/人.*$/, '人')}が生き残る`);
    if (sk) good.push(`組で${num(sk.detail)}を討つ`);
    if (sv && sv.pts <= 0) lack.push(`組の多くを失った（${String(sv.detail).replace(/人.*$/, '人')}）`);
    if (!fl) lack.push('側面攻撃なし');
  } else {
    if (one('下知を守り通した')) good.push('下知を守り通した');
    for (const l of L.filter((x) => x.label === '命令違反')) lack.push(`下知に背く：${l.detail}`);
    const pu = L.filter((x) => x.label === '勝手な追撃').length;
    if (pu) lack.push(`勝手な追撃 ${pu}回`);
    if (!L.length) lack.push('任務を果たせず、忠勤とは言えぬ');
  }
  return { good, lack };
}
function catMark(c, sum) {
  if (sum.minus < 0 && sum.plus + sum.minus <= 0) return ['欠', 'ng'];
  const k = sum.plus / CAT_INFO[c].ref;
  return k >= 0.8 ? ['上', 'top'] : k >= 0.4 ? ['中', 'mid'] : k > 0 ? ['下', 'low'] : ['—', 'none'];
}
const EVAL_CSS = `<style>
  .eval.ev2 { max-width: 760px; padding-bottom: 0; }
  .ev2 .ev-bigs { display: grid; gap: 8px; margin: 4px 0 14px; }
  .ev2 .ev-big { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 12px 18px; border: 1px solid var(--kin); background: linear-gradient(100deg, rgba(194,162,90,.18), rgba(194,162,90,.02) 70%); opacity: 0; animation: evPop .55s cubic-bezier(.2,.9,.3,1.2) forwards; }
  .ev2 .ev-big small { display: block; font-size: 12px; letter-spacing: .3em; color: var(--kin); }
  .ev2 .ev-big b { font-family: var(--display); font-size: 30px; letter-spacing: .1em; }
  .ev2 .ev-big .p { font-family: var(--display); font-size: 34px; color: var(--kin); font-variant-numeric: tabular-nums; }
  .ev2 .ev-big .sb { display: grid; place-items: center; width: 46px; height: 46px; border: 2px solid var(--shu); color: var(--shu); font-family: var(--display); font-weight: 800; font-size: 24px; transform: rotate(-5deg); }
  .ev2 .evcs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  @media (max-width: 620px) { .ev2 .evcs { grid-template-columns: 1fr; } }
  .ev2 .evc { border: 1px solid var(--line); border-left-width: 3px; padding: 10px 14px 12px; background: rgba(0,0,0,.18); opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .evc.top { border-left-color: var(--kin); }
  .ev2 .evc.mid { border-left-color: var(--washi-dim); }
  .ev2 .evc.low, .ev2 .evc.none { border-left-color: var(--washi-faint); }
  .ev2 .evc.ng { border-left-color: var(--shu); background: rgba(192,69,46,.06); }
  .ev2 .evc-h { display: flex; align-items: baseline; gap: 8px; }
  .ev2 .evc-h .k { font-family: var(--display); font-size: 26px; font-weight: 800; line-height: 1; }
  .ev2 .evc.top .evc-h .k { color: var(--kin); }
  .ev2 .evc.ng .evc-h .k { color: var(--shu); }
  .ev2 .evc-h small { font-size: 12px; color: var(--washi-dim); letter-spacing: .1em; }
  .ev2 .evc-h .evmk { margin-left: auto; font-size: 12px; letter-spacing: .1em; color: var(--washi-dim); border: 1px solid var(--line); padding: 1px 7px; }
  .ev2 .evc.top .evmk { color: var(--kin); border-color: var(--kin); }
  .ev2 .evc.ng .evmk { color: var(--shu); border-color: var(--shu); }
  .ev2 .evc-h .p { font-family: var(--display); font-size: 22px; font-variant-numeric: tabular-nums; min-width: 2.6em; text-align: right; }
  .ev2 .evc.ng .evc-h .p { color: var(--shu); }
  .ev2 .evc-bar { display: block; height: 4px; background: var(--sumi-3); margin: 8px 0 8px; position: relative; overflow: hidden; }
  .ev2 .evc-bar b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .ev2 .evc-bar s { position: absolute; top: 0; bottom: 0; right: 0; background: var(--shu); }
  .ev2 .evc p { margin: 3px 0 0; font-size: 13.5px; line-height: 1.55; display: grid; grid-template-columns: 3.4em 1fr; gap: 6px; }
  .ev2 .evc p em { font-style: normal; font-size: 12px; letter-spacing: .1em; text-align: center; padding: 1px 0; align-self: start; margin-top: 2px; }
  .ev2 .evc p.g em { color: var(--kin); border: 1px solid rgba(194,162,90,.55); }
  .ev2 .evc p.l { color: var(--washi-dim); }
  .ev2 .evc p.l em { color: #e38a74; border: 1px solid rgba(192,69,46,.55); }
  .ev2 .evc p.lk { color: var(--washi-faint); grid-template-columns: 1fr; }
  .ev2 .ev-sum { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 10px 20px; border-top: 1px solid var(--line); padding-top: 12px; opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .ev-sum .verdict { margin: 0; }
  .ev2 .ev-sum .t { text-align: right; }
  .ev2 .ev-sum .t small { display: block; font-size: 12px; letter-spacing: .2em; color: var(--washi-dim); }
  .ev2 .ev-sum strong { font-family: var(--display); font-size: 56px; line-height: 1; color: var(--kin); font-variant-numeric: tabular-nums; }
  .ev2 .ev-sum em { font-style: normal; font-size: 12px; color: var(--washi-faint); display: block; }
  .ev2 .ev-rel { font-size: 13px; color: var(--washi-dim); margin: 2px 0 10px; }
  .ev2 .ev-rel b { color: var(--washi); font-weight: 500; margin-right: 6px; }
  .ev2 .ev-rel span { margin-right: 12px; white-space: nowrap; }
  .ev2 .ev-rel .up { color: var(--kin); } .ev2 .ev-rel .dn { color: #e38a74; }
  .ev2 details.ev-detail { margin: 18px 0; border-top: 1px solid var(--line); }
  .ev2 details.ev-detail summary { cursor: pointer; padding: 12px 0; font-size: 13.5px; color: var(--washi-dim); letter-spacing: .1em; }
  .ev2 details.ev-detail summary:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
  .ev2 .ledger .ln { font-size: 14px; padding: 6px 0; animation: none; opacity: 1; }
  .ev2 .ledger .ln .p { font-size: 16px; }
  .ev2 .ledger .ln.big { color: var(--kin); }
  .ev2 .ev-actbar { position: sticky; bottom: 0; margin: 18px -16px 0; padding: 14px 16px 16px; background: linear-gradient(180deg, rgba(20,18,15,0), rgba(20,18,15,.94) 30%); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; opacity: 0; animation: ln .4s ease-out forwards; }
  .ev2 .ev-gnote { clear: both; margin: 4px 0 0; font-size: 13px; color: var(--washi-dim); }
  .ev2 .ev-conds { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .ev2 .ev-conds span { border: 1px solid var(--line); padding: 6px 10px; font-size: 13px; color: var(--washi-dim); display: grid; grid-template-columns: auto 1fr; column-gap: 8px; }
  .ev2 .ev-conds span b { grid-column: 2; font-weight: 500; color: var(--washi); font-variant-numeric: tabular-nums; }
  .ev2 .ev-conds em { font-style: normal; grid-row: span 2; align-self: center; font-size: 18px; }
  .ev2 .ev-conds .ok em { color: var(--kin); } .ev2 .ev-conds .ng { border-color: rgba(192,69,46,.6); } .ev2 .ev-conds .ng em { color: #e38a74; }
  .ev2 .ev-prog i { height: 10px; }
  .ev2 .ev-prog .ev-gain { color: var(--kin); font-weight: 500; }
  .ev2 .ev-actbar .skiphint { margin: 0 0 0 auto; font-size: 12px; }
  .eval.fast .evc, .eval.fast .ev-big, .eval.fast .ev-sum, .eval.fast .ev-more-wrap, .eval.fast .ev-actbar { animation-delay: 0s !important; animation-duration: .01s !important; }
  @keyframes evPop { 0% { opacity: 0; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
</style>`;
export function evalScreen(G, r, actions) {
  const hadSquad = !!((r.stats && r.stats.squad) || r.rankBefore >= 1);
  const t0 = 0.3;
  // 大事な物（敵将撃破・特別戦功）だけを大きく
  const bigs = r.lines.filter((l) => l.big);
  const bigHtml = bigs.map((l, i) => `<div class="ev-big" style="animation-delay:${t0 + i * 0.35}s"><span class="sb">${l.label === '敵武将撃破' ? '討' : '功'}</span><div><small>${l.label === '敵武将撃破' ? '敵 将 撃 破' : '特 別 戦 功'}</small><b>${esc(l.label === '敵武将撃破' ? l.detail : l.label)}</b></div><span class="p">+${l.pts}</span></div>`).join('');
  const t1 = t0 + bigs.length * 0.35 + (bigs.length ? 0.3 : 0);
  // 四つの札
  const cats = r.cats || {};
  const cards = ['武', '任', '将', '忠'].map((c, i) => {
    const sum = cats[c] || { pts: 0, plus: 0, minus: 0 };
    const nt = catNotes(c, r, hadSquad);
    const [mk, cls] = nt.locked ? ['—', 'none'] : catMark(c, sum);
    const ref = CAT_INFO[c].ref;
    const w = Math.min(100, (sum.plus / ref) * 100), wm = Math.min(100, (-sum.minus / ref) * 100);
    const body = nt.locked ? `<p class="lk">${esc(nt.locked)}</p>`
      : (nt.good.slice(0, 2).map((g) => `<p class="g"><em>良し</em><span>${esc(g)}</span></p>`).join('') + nt.lack.slice(0, 2).map((g) => `<p class="l"><em>足りぬ</em><span>${esc(g)}</span></p>`).join('')) || '<p class="lk">記すべき働きなし</p>';
    return `<div class="evc ${cls}" style="animation-delay:${t1 + i * 0.22}s" aria-label="${c}：${CAT_INFO[c].long}">
      <div class="evc-h"><span class="k">${c}</span><small>${CAT_INFO[c].long}</small><span class="evmk">${mk}</span><span class="p">${nt.locked ? '' : sgn(sum.pts)}</span></div>
      <i class="evc-bar"><b style="width:${w}%"></b>${wm ? `<s style="width:${wm}%"></s>` : ''}</i>${body}</div>`;
  }).join('');
  const delay = t1 + 4 * 0.22 + 0.2;
  // 内訳（区分ごと。普段は畳んでおく）
  const ledger = ['武', '任', '将', '忠'].map((c) => {
    const ls = r.lines.filter((l) => (l.cat || '任') === c);
    if (!ls.length) return '';
    return `<div class="ev-cat"><i class="seal">${c}</i>${CAT_INFO[c].long}</div>` + ls.map((l) => `<div class="ln ${l.pts < 0 ? 'neg' : ''} ${l.big ? 'big' : ''} ${l.sp ? 'sp' : ''}"><span>${esc(l.label)}</span><span class="d">${esc(l.detail || '')}</span><span class="p">${l.pts > 0 ? '+' : ''}${l.pts}</span></div>`).join('');
  }).join('');
  const next = RANKS[G.rank + 1];
  const prevMerit = r.meritAfter - r.total;
  const progTarget = next ? next.min : r.meritAfter;
  // 526：昇進の四つの条件を、満たしたか一つずつ見せる
  const nx = RANKS[r.rankBefore + 1];
  const nViol = r.lines.filter((l) => l.label === '命令違反').length;
  const conds = !r.promoted && nx && r.reason ? [
    [r.meritAfter >= nx.min, '累計戦功', `${r.meritAfter} ／ ${nx.min}`],
    [r.superiorAfter >= 50, '上官の評価', `${r.superiorAfter} ／ 50`],
    [!!r.mainDone, '任務', r.mainDone ? '果たした' : '果たせず'],
    [nViol <= 2, '命令違反', `${nViol}回 ／ 2回まで`],
  ] : null;
  const promo = r.promoted
    ? `<div class="promo" style="animation-delay:${delay + 0.6}s">
        <div class="lbl">昇　進</div>
        <div class="rk">${esc(RANKS[r.rankBefore].name)}<span class="arrow">→</span>${esc(RANKS[r.rankAfter].name)}</div>
        <div class="unl">新たに解放：<b>${esc(r.unlock)}</b></div>
        ${r.granted.length ? `<div class="unl" style="margin-top:6px">下賜：${r.granted.map((id) => esc(ITEMS[id].name)).join('・')}（城下の武具屋で着用中）</div>` : ''}
        ${r.recommend ? `<div class="unl" style="margin-top:6px;color:var(--washi-dim)">${esc(r.recommend)}</div>` : ''}
      </div>`
    : `<div class="promo no" style="animation-delay:${delay + 0.6}s">
        <div class="lbl">昇進なし</div>
        <div class="unl" style="margin-top:8px">${esc(r.reason || 'この戦で上がれる身分の上限に達している')}</div>
        ${conds ? `<div class="ev-conds" aria-label="${esc(nx.name)}への条件">${conds.map(([ok, a, b]) => `<span class="${ok ? 'ok' : 'ng'}"><em>${ok ? '○' : '×'}</em>${a}<b>${esc(b)}</b></span>`).join('')}</div>` : ''}
        ${r.recommend ? `<div class="unl" style="margin-top:6px;color:var(--washi-dim)">${esc(r.recommend)}</div>` : ''}
      </div>`;
  const st = r.stats || {};
  const mm = Math.floor((st.time || 0) / 60), ss = Math.floor((st.time || 0) % 60);
  // 組の生き残りは、戦功の「部下生存率」と同じ数（戦の終わりの数）で見せる。
  // 終わりの合図のあと引き上げるまでに討たれた者がいれば、それも書き添える（名簿からはその者が外れるため）
  const svLine = r.lines.find((l) => /部下生存率/.test(l.label));
  const svm = svLine && String(svLine.detail).match(/(\d+)\/(\d+)/);
  const svAlive = svm ? +svm[1] : st.squadAlive, svAll = svm ? +svm[2] : st.squad;
  const svAfter = svm && st.squadAlive != null && st.squadAlive < svAlive ? svAlive - st.squadAlive : 0;
  const svHtml = svAll ? `<span>組の生き残り<b>${svAlive}/${svAll}人</b>${svAfter ? `<small>（引き上げの間に${svAfter}人が討たれた）</small>` : ''}</span>` : '';
  const best = r.best;
  const primary = actions.find((a) => a.primary);
  // 525：評定の目安（何割で何か・一つ上まであと何点か）
  let gNote = '';
  if (r.grade) {
    const cutTxt = GRADE_CUT.map(([g, k]) => `${g} ${Math.ceil(r.cap * k)}`).join('・');
    if (!r.mainDone) gNote = `任務を果たせなかったので「丙」。任務を果たせば、戦功で評定が決まる（${cutTxt}）`;
    else {
      const i = GRADE_CUT.findIndex(([g]) => g === r.grade);
      const up = i < 0 ? GRADE_CUT[GRADE_CUT.length - 1] : GRADE_CUT[i - 1];
      gNote = up ? `「${up[0]}」まで あと ${Math.max(1, Math.ceil(r.cap * up[1]) - r.total)}点（${cutTxt}）` : `最上の評定（${cutTxt}）`;
    }
  }
  const rel = (r.relChange || []).map((x) => `<p class="ev-rel"><b>${esc(REL_NAME[x.k] || x.k)}の覚え</b>${REL_KEYS.filter(([k]) => x.d[k]).map(([k, n]) => `<span class="${(k === 'wary' ? -x.d[k] : x.d[k]) > 0 ? 'up' : 'dn'}">${n} ${sgn(x.d[k])}（${x.after[k]}）</span>`).join('') || '<span>変わらず</span>'}</p>`).join('');
  const screen = show(`${EVAL_CSS}<div class="eval ev2">
    <div class="head"><div class="eyebrow">戦功評価　・　難易度「${esc((DIFFICULTY[G.difficulty] || DIFFICULTY.normal).name)}」</div><h2>${r.grade ? `<span class="grade g-${r.grade}" aria-label="評定 ${r.grade}">${r.grade}</span>` : ''}${esc(r.battle)}</h2>${gNote ? `<p class="ev-gnote">${esc(gNote)}</p>` : ''}</div>
    ${bigs.length ? `<div class="ev-bigs">${bigHtml}</div>` : ''}
    <div class="evcs">${cards}</div>
    <div class="ev-sum" style="animation-delay:${delay}s"><div><div class="verdict">${esc(r.verdict)}</div>${r.bossLine ? `<p class="bossline"><b>${esc(r.bossLine[0])}</b>「${esc(r.bossLine[1])}」</p>` : ''}</div>
      <div class="t"><small>合計戦功</small><strong id="ev-total">0</strong><em>${r.capped ? `上限${r.cap}に到達（計算上 ${r.raw}）` : `この戦の上限 ${r.cap}`}${r.prevTotal !== undefined ? `　前の戦より ${r.total - r.prevTotal >= 0 ? '+' : ''}${r.total - r.prevTotal}` : ''}</em></div></div>
    <div style="opacity:0;animation:ln .4s ease-out ${delay + 0.3}s forwards" class="ev-more-wrap">
      ${rel}
      <dl class="facts">
        <dt>褒美</dt><dd><style>.ev-pay summary{cursor:pointer;font-size:13px;color:var(--washi-dim);min-height:44px;display:flex;align-items:center}.ev-pay ul{list-style:none;margin:0 0 6px;padding:0;font-size:13px}.ev-pay li{display:flex;justify-content:space-between;gap:16px;border-bottom:1px dashed var(--line);padding:3px 0}.ev-pay li small{color:var(--washi-faint)}.ev-pay li b{font-weight:500;font-variant-numeric:tabular-nums}</style><b id="ev-kan">${zeni(0)}</b>（所持 ${zeni(G.kan)}）${(r.pay || []).length ? `<details class="ev-pay"><summary>褒美の内訳</summary><ul>${r.pay.map((l) => `<li><span>${esc(l.label)}${l.detail ? `<small>　${esc(l.detail)}</small>` : ''}</span><b>${l.kan < 0 ? '−' : '+'}${zeni(Math.abs(l.kan))}</b></li>`).join('')}</ul></details>` : ''}${r.tomoLeft ? `<br><small>給金が払えず、${esc(r.tomoLeft)}に暇を出した</small>` : ''}</dd>
        <dt>上官の評価</dt><dd>${r.superiorBefore} → ${r.superiorAfter}${r.superiorAfter < 50 ? '（50未満では昇進できない）' : ''}</dd>
        <dt>累計戦功</dt><dd>${prevMerit} → ${r.meritAfter}</dd>
        ${G.injured ? '<dt>負傷</dt><dd>重傷。城下の宿で休まねばならない</dd>' : ''}
      </dl>
      ${next ? `<div class="ev-prog"><div class="lbl"><span>次の身分「${esc(next.name)}」まで</span><span><b class="ev-gain">今回 +${r.total}</b>　あと ${Math.max(0, next.min - r.meritAfter)}</span></div><i><s style="width:${Math.min(100, prevMerit / progTarget * 100)}%"></s><b id="ev-bar"></b></i></div>` : ''}
    </div>
    ${promo}
    ${r.advice ? `<div class="histnote" style="border-color:var(--ai)"><b>次の戦への心得</b><br>${esc(r.advice)}</div>` : ''}
    ${r.squadReport ? `<div class="histnote" style="border-color:var(--moegi)"><b>組の働き</b><br>${esc(r.squadReport)}</div>` : ''}
    ${r.tomoReport ? `<div class="histnote" style="border-color:var(--moegi)"><b>供の働き</b><br>${esc(r.tomoReport)}</div>` : ''}
    ${r.newTitles && r.newTitles.length ? `<div class="titles">${r.newTitles.map((id) => `<div class="got"><b>称号「${esc(TITLES[id].name)}」</b><small>${esc(TITLES[id].note)}</small></div>`).join('')}</div>` : ''}
    <details class="ev-detail" id="ev-detail"><summary>戦功の内訳と戦いの記録を見る（${r.lines.length}項目）　D</summary>
      <div class="ev-more"><span>戦った時間<b>${mm}分${String(ss).padStart(2, '0')}秒</b></span><span>自ら討った敵<b>${st.kills ?? 0}人</b></span>${svHtml}<span>受けた傷<b>${Math.round(st.taken || 0)}</b></span><span>受け流し<b>${st.parries || 0}回</b></span><span>防いだ攻撃<b>${st.blocks || 0}回</b></span><span>敵に防がれた<b>${st.guarded || 0}回</b></span><span>駆けた距離<b>${Math.round(st.dist || 0)}m</b></span>${st.cavStops ? `<span>止めた騎馬<b>${st.cavStops}騎</b></span>` : ''}${best ? `<span>これまでの最高<b>${best}</b></span>` : ''}</div>
      <div class="ledger">${ledger || '<div class="ln"><span>記すべき働きなし</span><span></span><span class="p">0</span></div>'}</div>
    </details>
    ${r.history ? `<div class="histnote"><b>史実では</b><br>${esc(r.history)}</div>` : ''}
    <div class="ev-actbar" style="animation-delay:${delay + 0.8}s"><div class="row" id="ev-actions" style="margin:0"></div><p class="skiphint">${isTouch ? '画面を押すと演出を飛ばします ・ 下の釦で次へ進みます' : `画面を押すと演出を飛ばします ・ Enter で「${esc(primary ? primary.label : '')}」 ・ D で内訳`}</p></div>
  </div>`, false, (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target.tagName === 'SUMMARY')) { e.preventDefault(); if (primary) { sfx('ui'); primary.fn(); } }
    else if (e.key === 'd' || e.key === 'D') { const d = $('ev-detail'); if (d) d.open = !d.open; }
  });
  const box = $('ev-actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' primary' : '');
    b.textContent = a.label;
    b.onclick = (ev) => { ev.stopPropagation(); sfx('ui'); a.fn(); };
    box.appendChild(b);
  }
  // 合計戦功を数え上げる
  const tot = $('ev-total');
  const countUp = (dur) => {
    const t0c = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0c) / dur); tot.textContent = Math.round(r.total * (1 - (1 - k) ** 3)); if (k < 1 && tot.isConnected) requestAnimationFrame(step); };
    step();
  };
  // 大きな戦功が出る時だけ、太鼓を一つ
  const bigT = bigs.map((l, i) => setTimeout(() => sfx('taiko', 0.7), (t0 + i * 0.35) * 1000));
  const cuT = setTimeout(() => {
    countUp(900);
    const kan = $('ev-kan');
    if (kan) { let n = 0; const iv = setInterval(() => { n++; kan.textContent = zeni(Math.min(n, r.reward)); if (n >= r.reward || !kan.isConnected) clearInterval(iv); else sfx('hover', 0.6); }, 45); }
  }, delay * 1000);
  const ev = screen.querySelector('.eval');
  const skip = () => { clearTimeout(cuT); bigT.forEach(clearTimeout); tot.textContent = r.total; const kan = $('ev-kan'); if (kan) kan.textContent = zeni(r.reward); ev.classList.add('fast'); const bar = $('ev-bar'); if (bar) bar.style.width = Math.min(100, r.meritAfter / progTarget * 100) + '%'; };
  ev.addEventListener('click', (e) => { if (!e.target.closest('summary, details')) skip(); });
  // 動きを減らす時は、数え上げも出てくる動きも飛ばして、すぐ全部を見せる
  if (RM()) skip();
  setTimeout(() => { const bar = $('ev-bar'); if (bar) bar.style.width = Math.min(100, r.meritAfter / progTarget * 100) + '%'; }, (delay + 0.4) * 1000);
  if (r.promoted) { setTimeout(() => sfx('promote', 0.9), (delay + 0.6) * 1000); setTimeout(() => sfx('flute', 0.8), (delay + 1.8) * 1000); }
  // すぐ Tab で主のボタンへ行けるように
  const pb = box.querySelector('.primary'); if (pb) pb.focus({ preventScroll: true });
}

// ---------------- 昇進の場面 ----------------
// 上官の言葉（筋書き・戦・新しい身分で変わる）
const PROMO_WORDS = {
  nagashino: [
    { who: '長篠城主　奥平信昌', mon: 'okudaira', say: { 1: '{n}、五百でこの城を守り抜けたのは、その方らの槍のおかげじゃ。今日より五人を預ける。組頭の見習いとして、背に印を負え' } },
    { who: '長篠城主　奥平信昌', mon: 'okudaira', say: { 1: '{n}、強右衛門をよう川まで送り届けた。あの男の走りに、城の命がかかっておる。今日より五人を預ける', 2: '{n}、強右衛門の道を守り抜いた働き、見事じゃ。組頭に取り立てる' } },
    { who: '徳川の宿老　酒井忠次', mon: 'katabami', say: { 2: '鳶ヶ巣山、その方の組が一番に柵を越えたと聞いた。足軽組頭に取り立てる。十五人を、その方の旗の下に置け', 1: '夜の山でよう黙って待てた。組頭の見習いとして、五人を預ける' } },
    { who: '侍大将　大久保忠世', mon: 'okubo', say: { 3: '{n}！　柵の内でよう踏みとどまった。足軽大将の候補として二十人を預ける。弓も使いこなしてみせよ', 2: '柵をよう守った。足軽組頭じゃ。十五人、死なせるでないぞ' } },
    { who: '侍大将　大久保忠世', mon: 'okubo', say: { 4: '諏訪原の門を破ったのは、その方の組じゃ。殿のお許しが出た。今日より足軽大将。馬に乗り、組を率いよ', 3: '城攻めの働き、殿にも申し上げた。足軽大将の候補として励め' } },
  ],
  okehazama: [
    { who: '組頭　源八', mon: 'oda', say: { 1: '{n}、よう生き残った。殿のお下知じゃ、今日からお主は組頭の見習い。五人預ける。死なせるなよ' } },
    { who: '足軽大将　大沢勘兵衛', mon: 'oda', say: { 2: '森部の横槍、しかと見た。足軽組頭に取り立てる。十五人と弓を預ける' } },
    { who: '普請奉行　木下藤吉郎', mon: 'oda', say: { 4: '殿が墨俣の働きをいたくお喜びじゃ。今日からお主は足軽大将。……わしも負けてはおれんのう', 3: '墨俣の働き、殿のお耳に入れておきましたぞ。足軽大将の候補じゃ' } },
  ],
};
// 織田家編は戦の id で引く（戦を足したら、ここにも一つ足す。無ければ上役の名で決まりの言葉）
PROMO_WORDS.oda = {
  moribe: { who: '組頭　源八', mon: 'oda', say: { 1: '{n}、五人を一人も欠かさず横槍を入れたな。殿のお下知じゃ、今日からお主は組頭の見習い。背に印を負え' } },
  sunomata: { who: '普請奉行　木下藤吉郎', mon: 'oda', say: { 2: '砦が建ったのは、そなたの組が守ってくれたからじゃ。殿に申し上げて、足軽組頭に取り立ててもろうた。十五人を預けるぞ', 1: '墨俣の働き、殿のお耳に入れておいた。組頭の見習いとして励め' } },
  inabayama: { who: '木下藤吉郎', mon: 'oda', say: { 2: '{n}、稲葉山が落ちたのは、町に火を放ち、搦手を登ったそなたの組のおかげじゃ。足軽組頭に取り立てる' } },
  mitsukuri: { who: '木下藤吉郎', mon: 'oda', say: { 2: '箕作の夜攻め、見事じゃった。足軽組頭として、十五人を預ける' } },
  nodafukushima: { who: '前田利家', mon: 'maeda', say: { 3: '{n}、早鐘の夜に堤を守り抜いたのは、その方の組じゃ。足軽大将の候補として二十人を預ける', 2: '堤の守り、ようやった。足軽組頭じゃ' } },
  odani: { who: '羽柴秀吉', mon: 'oda', say: { 4: '{n}、京極丸を取ったのはそなたの組じゃ。殿のお許しが出た。今日より足軽大将。馬に乗れ' } },
  nagashima: { who: '柴田勝家', mon: 'oda', say: { 4: '柵の前でよう踏みとどまった。今日より足軽大将じゃ。組を率いよ' } },
  kanegasaki: { who: '木下藤吉郎', mon: 'oda', say: { 2: '{n}、あの退き口でわしの後ろを守り抜いた。足軽組頭じゃ。十五人、死なせるでないぞ' } },
  anegawa: { who: '森可成', mon: 'oda', say: { 3: '{n}、川を渡っての押し合い、よう組を崩さなんだ。足軽大将の候補として二十人を預ける。弓も使いこなしてみせよ', 2: '姉川の働き、見事。足軽組頭に取り立てる' } },
  hieizan: { who: '明智光秀', mon: 'akechi', say: { 4: '{n}、下知を守り、刃向かう者だけを討った。殿のお許しが出た。今日より足軽大将。馬に乗り、組を率いよ', 3: '山道でよう組をまとめた。足軽大将の候補として励め' } },
  shitaragahara: { who: '鉄砲奉行　前田利家', mon: 'maeda', say: { 4: '{n}、柵の内でよう踏みとどまった。桶狭間の足軽が、いまや足軽大将か。殿もお喜びじゃ' } },
};
const MON_NAME = { ichimonji: '一文字', maru: '丸', igeta: '井桁', tokugawa: '三つ葉葵', oda: '木瓜' };
function promoWords(G, r) {
  const PW = PROMO_WORDS[scenarioKey()];
  const B = BATTLES[r.battleIndex];
  const P = PW && !Array.isArray(PW) ? (B && PW[B.id]) : (PW || [])[r.battleIndex];
  const n = G.name;
  const t = P && (P.say[r.rankAfter] || Object.values(P.say)[0]);
  if (P && t) return { who: P.who, mon: P.mon, text: t.replace('{n}', n) };
  return { who: (B && B.boss) || '上官', mon: SCENARIOS[scenarioKey()].mon, text: `${n}、よう働いた。今日より${RANKS[r.rankAfter].name}に取り立てる` };
}
const PROMO_CSS = `<style>
  .promo-cine .pc-band { display: grid; grid-template-columns: auto minmax(0, 460px); gap: 26px; align-items: end; justify-content: center; text-align: left; margin: 2px 0 6px; }
  @media (max-width: 720px) { .promo-cine .pc-band { grid-template-columns: 1fr; justify-items: center; } }
  .promo-cine .pc-flags { display: flex; align-items: flex-end; gap: 14px; }
  .promo-cine .pc-flag { position: relative; padding-left: 4px; border-left: 3px solid #5a4630; height: 160px; display: flex; align-items: flex-start; transform-origin: bottom left; }
  .promo-cine .pc-flag canvas { width: 54px; height: 126px; box-shadow: 0 6px 18px rgba(0,0,0,.5); }
  .promo-cine .pc-flag.rise { animation: pcRise 1.1s cubic-bezier(.2,.8,.2,1) .5s both, pcSway 4s ease-in-out 1.7s infinite alternate; }
  .promo-cine .pc-squad { display: grid; grid-template-columns: repeat(10, 12px); gap: 5px 5px; align-content: end; }
  .promo-cine .pc-squad i { display: block; width: 10px; height: 24px; border-left: 2px solid #5a4630; position: relative; }
  .promo-cine .pc-squad i b { position: absolute; left: 0; top: 0; width: 9px; height: 15px; background: var(--fl, #ddd); }
  .promo-cine .pc-squad i.old { opacity: .45; }
  .promo-cine .pc-squad i.nw { animation: pcRise .5s ease-out both; }
  .promo-cine .pc-flagcap { font-size: 12px; color: var(--washi-dim); letter-spacing: .1em; margin-top: 8px; }
  .promo-cine .pc-flagcap b { color: var(--kin); font-weight: 500; }
  .promo-cine .pc-say { border-left: 2px solid var(--kin); padding: 6px 0 6px 16px; opacity: 0; animation: ln .6s ease-out .9s forwards; }
  .promo-cine .pc-say .who { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--kin); letter-spacing: .12em; margin-bottom: 6px; }
  .promo-cine .pc-say .who canvas { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 0 1px var(--line); }
  .promo-cine .pc-say p { margin: 0; font-family: var(--display); font-size: 19px; line-height: 1.8; color: var(--washi); }
  .promo-cine { gap: 10px; padding-block: 22px; }
  .promo-cine .pc-ladder { margin-bottom: 6px; }
  .promo-cine .pc-look .preview3d { width: 200px; height: 220px; }
  .promo-cine .pc-look .preview3d.wide { width: 300px; height: 240px; }
  .promo-cine .card.eq { border-color: var(--washi-dim); background: rgba(236,228,210,.05); }
  .promo-cine .card.eq small { color: var(--washi-dim); }
  .promo-cine .card.rk { border-color: var(--shu); background: rgba(192,69,46,.1); }
  .promo-cine .card.rk small { color: #e38a74; }
  .promo-cine .card .w { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-dim); letter-spacing: 0; }
  .promo-cine .pc-road { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin: 2px 0 6px; }
  .promo-cine .pc-road span { display: flex; align-items: baseline; gap: 6px; padding: 2px 10px; border: 1px solid var(--line); color: var(--washi-dim); }
  .promo-cine .pc-road small { font-size: 12px; }
  .promo-cine .pc-road b { font-family: var(--display); font-size: 16px; color: var(--washi); font-variant-numeric: tabular-nums; }
  .promo-cine #pc-next { position: sticky; bottom: 14px; z-index: 2; box-shadow: 0 6px 20px rgba(0,0,0,.6); }
  .promo-cine .pc-road em { font-style: normal; font-size: 12px; color: var(--shu-text, #e38a74); }
  .promo-cine .pc-road .now { border-color: var(--kin); background: rgba(194,162,90,.1); }
  .promo-cine .pc-road .now b { color: var(--kin); }
  .promo-cine .pc-road .sum { border-style: dashed; }
  .promo-cine.still .pc-flag.rise, .promo-cine.still .pc-squad i.nw { animation: none; }
  @keyframes pcRise { from { transform: translateY(60px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes pcSway { from { transform: rotate(-.6deg); } to { transform: rotate(.8deg); } }
</style>`;
export function promoScreen(Gbefore, G, r, onNext) {
  let pvA = null, pvB = null;
  let done0 = false;
  const done = () => { if (done0) return; done0 = true; pvA && pvA.dispose(); pvB && pvB.dispose(); onNext(); };
  const unlocks = (r.unlock || '').split(' ／ ').flatMap((u) => u.split('・')).filter(Boolean);
  const sA = ladderStep(Gbefore), sB = ladderStep(G);
  if (sB >= 2 && sA < 2) unlocks.push('騎乗（馬上で戦う）', '馬屋');
  // 解放を「率いる兵」「できること」「装備」に分けて見せる
  const isEq = (u) => /兜|槍|刀|胴|陣羽織|具足/.test(u) && !/槍衾|陣形|号令/.test(u);
  const cards = [
    { k: 'rk', l: '率いる兵', t: `${RANKS[r.rankAfter].squad}人の組` },
    ...unlocks.filter((u) => !/の組$|を率いる|^小隊指揮/.test(u) && !isEq(u)).map((u) => ({ k: '', l: 'できること', t: u })),
    // 加増（毎戦の禄）と、連れて行ける供の数
    ...((RANKS[r.rankAfter].roku || 0) > (RANKS[r.rankBefore].roku || 0) ? [{ k: '', l: '加増', t: `禄 ${zeni(RANKS[r.rankBefore].roku)} → ${zeni(RANKS[r.rankAfter].roku)}／戦` }] : []),
    ...((RANKS[r.rankAfter].tomo || 0) > (RANKS[r.rankBefore].tomo || 0) ? [{ k: '', l: 'できること', t: `供を${RANKS[r.rankAfter].tomo}人まで連れて行ける` }] : []),
    ...r.granted.map((id) => ({ k: 'eq', l: '下賜の装備', t: ITEMS[id].name })),
    ...unlocks.filter((u) => isEq(u) && !r.granted.some((id) => ITEMS[id].name === u)).map((u) => ({ k: 'eq', l: '装備', t: u })),
  ].filter((c) => c.t && !(c.k === 'rk' && !RANKS[r.rankAfter].squad));
  // 528：どこで使えるか（行き先）を札に添える
  const WHERE = [[/^禄 /, '戦の後の褒美に入る'], [/^供を/, '城下の「問屋」で雇う'], [/合印/, '城下へ戻る前に定める'], [/弓|編成/, '城下の「組」で割合を選ぶ'], [/陣形|号令|小隊/, (isTouch ? '戦で「号令」の輪' : '戦で Tab の号令の輪')], [/馬屋|騎乗/, '城下の「馬屋」'], [/打刀/, '城下の「武具屋」で買える']];
  for (const c of cards) {
    if (c.k === 'rk') c.w = '城下の「組」で名簿を見る';
    else if (c.k === 'eq') c.w = '城下の「武具屋」で着用中';
    else { const w = WHERE.find(([re]) => re.test(c.t)); if (w) c.w = w[1]; }
  }
  // 529：これまでの戦の歩み（今回の戦を光らせる）
  const road = BATTLES.map((b, i) => { const h = G.history[i]; return `<span class="${i === r.battleIndex ? 'now' : h ? 'done' : ''}"><small>${esc(b.name)}</small><b>${h ? h.total : '—'}</b>${h && h.grade ? `<em>${h.grade}</em>` : ''}</span>`; }).join('');
  const W = promoWords(G, r);
  // 旗：合印を定めていれば合印、まだなら家の紋
  const flagMon = G.aijirushi || SCENARIOS[scenarioKey()].mon;
  const nOld = RANKS[r.rankBefore].squad, nNew = RANKS[r.rankAfter].squad;
  const small = [];
  for (let i = 0; i < nNew; i++) small.push(`<i class="${i < nOld ? 'old' : 'nw'}" style="${i >= nOld ? `animation-delay:${1.6 + (i - nOld) * 0.06}s` : ''}"><b></b></i>`);
  const flagCap = G.aijirushi ? `<b>${esc(MON_NAME[G.aijirushi] || '')}</b>の合印を掲げる組　${nOld ? `${nOld}人 → ` : ''}<b>${nNew}人</b>` : nNew ? `<b>${nNew}人</b>を預かる。組の合印は、城下へ戻る前に定める` : '';
  show(`${PROMO_CSS}<div class="promo-cine ${RM() ? 'still' : ''}">
    <div class="pc-lbl">昇　進</div>
    <div class="pc-rank"><span class="old">${esc(RANKS[r.rankBefore].name)}</span><span class="arrow">→</span><span class="new">${esc(RANKS[r.rankAfter].name)}</span></div>
    <div class="pc-ladder" aria-label="出世の道">${LADDER.map((L, i) => `<i class="${i < sB ? 'done' : i === sB ? 'now' : ''}" style="--i:${i}" title="${esc(L.name)}"></i>`).join('')}</div>
    <div class="pc-ladder-lbl">出世の道　${KANSUJI[sB]}の段 ／ 十段</div>
    <div class="pc-road" aria-label="戦ごとの戦功">${road}<span class="sum"><small>累計戦功</small><b>${r.meritAfter - r.total} → ${r.meritAfter}</b></span></div>
    <div class="pc-band">
      <div><div class="pc-flags"><div class="pc-flag rise"><canvas id="pc-flag" width="64" height="150"></canvas></div>${nNew ? `<div class="pc-squad" aria-label="組の旗 ${nNew}本">${small.join('')}</div>` : ''}</div>
        ${flagCap ? `<div class="pc-flagcap">${flagCap}</div>` : ''}</div>
      <div class="pc-say"><div class="who"><canvas id="pc-mon" width="44" height="44"></canvas>${esc(W.who)}</div><p>「${esc(W.text)}」</p></div>
    </div>
    <div class="pc-unl">${cards.map((c, i) => `<div class="card ${c.k}" style="animation-delay:${1.8 + i * 0.3}s"><small>${esc(c.l)}</small>${esc(c.t)}${c.w ? `<span class="w">${esc(c.w)}</span>` : ''}</div>`).join('')}</div>
    <div class="pc-look"><div><canvas class="preview3d" id="pv-a"></canvas><small>これまで</small></div><div class="pc-arrow">→</div><div><canvas class="preview3d ${sB >= 2 ? 'wide' : ''}" id="pv-b"></canvas><small>これから</small></div></div>
    <button class="btn primary" id="pc-next">戦功の評価を見る</button>
    <p class="skiphint">Enter / Space で次へ</p>
  </div>`, false, (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } });
  // 旗と上官の紋
  const fc = $('pc-flag'); if (fc) drawMon(fc.getContext('2d'), flagMon, 64, 150);
  const mc = $('pc-mon'); if (mc) { const g = mc.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, W.mon, 44, 88); g.restore(); }
  // 小さな旗の地の色は、大きな旗の地の色に合わせる
  if (fc) { const px = fc.getContext('2d').getImageData(3, 140, 1, 1).data; document.querySelectorAll('.pc-squad i b').forEach((b) => { b.style.background = `rgb(${px[0]},${px[1]},${px[2]})`; }); }
  pvA = new Preview($('pv-a')); pvA.setStep(Gbefore, sA);
  pvB = new Preview($('pv-b')); pvB.setStep(G, sB);
  $('pc-next').onclick = done;
  $('pc-next').focus({ preventScroll: true });
  sfx('promote', 1);
  setTimeout(() => sfx('flute', 0.9), 1200);
  setTimeout(() => sfx('taiko', 0.6), 600);
}

// ---------------- 討死（難易度「難」） ----------------
export function deathScreen(G, battleName, onTitle) {
  show(`<div class="story"><div>
    <div class="year">${esc(battleName)}</div>
    <h2>討　死</h2>
    <p>${esc(G.name)}（${esc(RANKS[G.rank].name)}）、この地に果てる。<br>累計戦功 ${G.merit}。その名は、組の者たちだけが覚えていた。</p>
    <button class="btn primary" id="b-dead">タイトルへ</button>
  </div></div>`, false, (e) => { if (e.key === 'Enter') onTitle(); });
  $('b-dead').onclick = onTitle;
  sfx('horagai', 0.5);
}

// ---------------- 合印を定める ----------------
export function aijirushiScreen(G, onDone) {
  const kinds = [['ichimonji', '一文字', 'まっすぐな一本の線。遠くからでも見分けやすい'], ['maru', '丸', '円い印。組の和を表す'], ['igeta', '井桁', '井戸の枠の形。固い守りを表す']];
  // 530：押してすぐ決めず、選ぶ → 組の旗の並びで確かめる → 決める の二段にする
  let sel = null;
  const pick = (k) => {
    sel = k; sfx('ui');
    document.querySelectorAll('.aiji button').forEach((b) => { b.classList.toggle('on', b.dataset.k === sel); b.setAttribute('aria-pressed', b.dataset.k === sel); });
    const K = kinds.find(([x]) => x === k);
    $('aj-look').innerHTML = `<div class="aj-row">${Array.from({ length: Math.min(8, RANKS[G.rank].squad || 5) }, () => '<canvas width="30" height="60"></canvas>').join('')}</div><p><b>${esc(K[1])}</b>　${esc(K[2])}</p>`;
    $('aj-look').querySelectorAll('canvas').forEach((c) => drawMon(c.getContext('2d'), k, 30, 60));
    const ok = $('aj-ok'); ok.disabled = false; ok.textContent = `「${K[1]}」に決める`;
  };
  const decide = () => { if (!sel) return; G.aijirushi = sel; sfx('taiko', 0.6); onDone(); };
  show(`<style>
    .aiji button.on { border-color: var(--kin); box-shadow: inset 0 0 0 1px var(--kin); background: rgba(194,162,90,.08); }
    .aiji button { min-height: 44px; }
    #aj-look { min-height: 96px; margin: 4px 0 16px; }
    #aj-look .aj-row { display: flex; gap: 10px; align-items: flex-end; }
    #aj-look canvas { width: 30px; height: 60px; border-left: 2px solid #5a4630; padding-left: 2px; }
    #aj-look p { margin: 8px 0 0; font-size: 14px; color: var(--washi-dim); } #aj-look b { color: var(--kin); font-weight: 500; }
  </style><div class="wrap">
    <div class="eyebrow">組の合印</div>
    <h2 style="font-family:var(--display);font-size:34px;letter-spacing:.1em;margin:8px 0 12px">預かる組に、印を定める</h2>
    <p class="lead">組頭の見習いとなった者は、配下の足軽の指物に組の合印を付ける。<br>戦場で、自分の後ろに並ぶ旗がこれになる。</p>
    <div class="aiji" role="group" aria-label="合印">${kinds.map(([k, n], i) => `<button data-k="${k}" aria-pressed="false" aria-label="${n}の合印を選ぶ"><canvas width="60" height="120" data-mon="${k}"></canvas>${i + 1}．${n}</button>`).join('')}</div>
    <div id="aj-look" aria-live="polite"><p>印を選ぶと、組の旗の並びがここに出ます。</p></div>
    <div class="row"><button class="btn primary" id="aj-ok" disabled>印を選んでください</button></div>
    <p class="note">数字キー 1〜3 で選び、Enter で決めます。一度決めた印は、この先ずっと組の旗になります。</p>
  </div>`, false, (e) => { const i = ['1', '2', '3'].indexOf(e.key); if (i >= 0) pick(kinds[i][0]); else if (e.key === 'Enter') { e.preventDefault(); decide(); } });
  document.querySelectorAll('canvas[data-mon]').forEach((c) => drawMon(c.getContext('2d'), c.dataset.mon, 60, 120));
  document.querySelectorAll('.aiji button').forEach((b) => b.onclick = () => pick(b.dataset.k));
  $('aj-ok').onclick = decide;
  document.querySelector('.aiji button')?.focus({ preventScroll: true });
}

// ---------------- 城下（拠点） ----------------
const TOWNS_O = {
  1: { place: '清洲 城下', when: '永禄三年　夏' },
  2: { place: '清洲 城下', when: '永禄四年　夏' },
};

// 宿で聞く噂（次の戦の手がかり）
const RUMORS_O = {
  1: ['美濃の斎藤勢は、先手を前に出して様子を見るのが常らしい', '林の陰から横を突かれると、どんな備えも崩れるものよ'],
  2: ['墨俣は川に面しておる。川沿いから回り込まれると厄介じゃ', '柵の内からなら、槍は届いても敵の刀は届かん'],
};

// 施設の小さな絵
const TAB_ICON = {
  boss: '<svg viewBox="0 0 24 24"><path d="M3 11 L12 4 L21 11"/><path d="M5 10 V20 H19 V10"/><path d="M10 20 V14 H14 V20"/></svg>',
  squad: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20 C3 14, 13 14, 13 20"/><path d="M11 20 C11 14, 21 14, 21 20"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M4 20 L18 6"/><path d="M18 6 L21 3 L20 7 Z"/><path d="M8 4 C 11 6, 11 10, 8 12"/></svg>',
  train: '<svg viewBox="0 0 24 24"><path d="M6 20 V8"/><path d="M4 8 H8"/><path d="M12 20 L18 4"/><circle cx="18" cy="16" r="3"/></svg>',
  inn: '<svg viewBox="0 0 24 24"><path d="M3 18 H21"/><path d="M5 18 V10 H19 V18"/><path d="M8 10 V7 H16 V10"/></svg>',
  people: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18"/><path d="M8 8 H16 M8 12 H16 M8 16 H13"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M5 4 H17 L19 6 V20 H5 Z"/><path d="M8 9 H15 M8 13 H15"/></svg>',
  stable: '<svg viewBox="0 0 24 24"><path d="M4 14 C 6 8, 12 7, 15 9 L 19 6 L 18 11 L 16 12 L 16 19"/><path d="M7 14 V19 M12 13 V19"/></svg>',
};

// 次の戦の作戦図（上官が見せる）
function missionDiagramO(town) {
  if (town === 1) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect x="0" y="0" width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <text x="10" y="16" fill="#b9b09c" font-size="11">北（斎藤勢）</text>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${100 + i * 12}" y="40" width="9" height="6" fill="#c0452e"/>`).join('')}<text x="98" y="34" fill="#e36a52" font-size="11">敵の先手</text>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${100 + i * 12}" y="100" width="9" height="6" fill="#5b7aa6"/>`).join('')}<text x="98" y="122" fill="#8fb0e0" font-size="11">前備</text>
    <circle cx="240" cy="70" r="16" fill="rgba(111,138,78,.35)"/><text x="228" y="98" fill="#b9b09c" font-size="11">林の端</text>
    <path d="M240 70 L175 45" stroke="#c2a25a" stroke-width="2" marker-end="url(#ar)"/><text x="190" y="72" fill="#c2a25a" font-size="11">横腹を突く</text>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#c2a25a"/></marker></defs>
  </svg>`;
  if (town === 2) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect x="0" y="0" width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <rect x="240" y="0" width="60" height="150" fill="rgba(70,95,105,.45)"/><text x="248" y="140" fill="#8fb0c0" font-size="11">長良川</text>
    <rect x="120" y="50" width="60" height="50" fill="none" stroke="#c2a25a" stroke-width="2"/><text x="128" y="80" fill="#c2a25a" font-size="11">墨俣の砦</text>
    <path d="M150 5 L150 45" stroke="#e36a52" stroke-width="2" marker-end="url(#ar2)"/><text x="156" y="20" fill="#e36a52" font-size="11">北から</text>
    <path d="M20 75 L115 75" stroke="#e36a52" stroke-width="2" marker-end="url(#ar2)"/><text x="24" y="68" fill="#e36a52" font-size="11">西から</text>
    <path d="M225 10 L185 50" stroke="#e36a52" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ar2)"/><text x="196" y="16" fill="#e36a52" font-size="11">川沿い？</text>
    <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#e36a52"/></marker></defs>
  </svg>`;
  return '';
}

// 戦の道のり（尾張・美濃）
function campaignMapO(G) {
  const nodes = [
    { n: '清洲', x: 150, y: 150, home: true },
    { n: '桶狭間', x: 250, y: 215, b: 0 },
    { n: '森部', x: 95, y: 70, b: 1 },
    { n: '墨俣', x: 150, y: 45, b: 2 },
  ];
  const next = G.battle;
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%">
    <path d="M10 110 C 80 100, 200 90, 310 110" stroke="rgba(236,228,210,.15)" stroke-dasharray="4 4" fill="none"/>
    <text x="16" y="100" fill="#7d7566" font-size="11">美濃</text><text x="16" y="130" fill="#7d7566" font-size="11">尾張</text>
    <path d="M60 10 C 90 60, 120 90, 110 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".6"/><text x="118" y="236" fill="#6f8aa0" font-size="11">木曽川</text>
    <path d="M40 10 C 70 50, 90 80, 70 250" stroke="#4f6f86" stroke-width="2" fill="none" opacity=".45"/><text x="44" y="236" fill="#6f8aa0" font-size="11">長良川</text>
    ${nodes.filter((d) => !d.home).map((d) => `<line x1="150" y1="150" x2="${d.x}" y2="${d.y}" stroke="rgba(194,162,90,.25)" stroke-dasharray="3 3"/>`).join('')}
    ${nodes.map((d) => {
      const done = d.b !== undefined && d.b < next;
      const cur = d.b === next;
      return `<g><circle cx="${d.x}" cy="${d.y}" r="${d.home ? 7 : 9}" fill="${d.home ? '#ece4d2' : done ? '#c2a25a' : cur ? '#c0452e' : '#2c2821'}" stroke="#14120f" stroke-width="2">${cur && !RM() ? '<animate attributeName="r" values="9;12;9" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      <text x="${d.x}" y="${d.y + 24}" fill="${cur ? '#f3e6c4' : '#b9b09c'}" font-size="12" text-anchor="middle">${d.n}${done ? '　済' : cur ? '　次' : ''}</text></g>`;
    }).join('')}
  </svg>`;
}

// 人物録
const PEOPLE_O = [
  { k: 'nobunaga', n: '織田信長', r: '尾張の大名', t: '桶狭間で今川義元を破り、名を天下に知られる。手柄を立てた者を身分に関わりなく取り立てる。' },
  { k: 'genpachi', n: '源八', r: '組頭', t: '桶狭間での最初の上官。口は悪いが面倒見がよい。「首は捨てよ」の下知を叩き込んだ男。' },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', t: '同じ組で槍を並べた同輩。気のいい男で、何かと話しかけてくる。' },
  { k: 'osawa', n: '大沢勘兵衛', r: '足軽大将', t: '森部で初めて組を預けてくれた上官。機を待てる者を重んじる。' },
  { k: 'tokichiro', n: '木下藤吉郎', r: '普請奉行', t: '草履取りから身を起こしたと噂される男。口が達者で、妙に人に好かれる。のちの羽柴秀吉。', min: 2 },
  { k: 'yoshimoto', n: '今川義元', r: '駿河・遠江・三河の大名', t: '「海道一の弓取り」と呼ばれた大大名。桶狭間で討たれた。' },
  { k: 'hibino', n: '日比野下野守', r: '斎藤方の武将', t: '森部の戦いで斎藤勢を率いて戦い、討ち死にした。', min: 1 },
];

const MISSIONS_O = {
  1: { title: '美濃・森部へ', text: '斎藤義龍が急死した。殿は美濃へ兵を出される。その方には五人を預け、先手の横を突く役を与える。' },
  2: { title: '墨俣の砦普請を守れ', text: '長良川の西、墨俣に砦を築く。普請を任されたのは木下藤吉郎という男じゃ。斎藤勢の邪魔が入る。組を率いて守り抜け。' },
};

function talksO(G, town, lastResult) {
  const n = G.name;
  const T = [];
  if (town === 1) {
    const headV = lastResult?.lines.some((l) => l.label === '命令違反' && l.detail.includes('首'));
    T.push({
      id: 'gen1', who: '組頭 源八', rel: 'genpachi', at: 'boss',
      lines: [
        headV ? `${n}、首は捨てよと言うたのを忘れたか。……まあよい、よう戦うた` : `${n}、桶狭間ではよう働いた。わしも鼻が高いわ`,
        '殿は手柄を立てた者を身分に関わりなく取り立てなさる。お主にも目をかけておられるぞ',
      ],
      choices: [
        { t: '源八殿のお引き立てのおかげにございます', fx: { like: 6 }, sup: 3, reply: 'はっは、口の上手い奴め。次も頼むぞ' },
        { t: '次は、もっと大きな手柄を立ててご覧に入れます', fx: { trust: 6 }, reply: 'その意気じゃ。じゃが命あっての物種ぞ' },
      ],
    });
    T.push({
      id: 'ya1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、聞いたか。お主、組頭の見習いになるそうじゃな`, 'わしはまだ槍一本の足軽よ。……ちと羨ましいのう'],
      choices: [
        { t: '弥七、わしの組に来ぬか', fx: { like: 8, trust: 4 }, join: 'yashichi', reply: 'ほ、本当か！　お主の下なら喜んで槍を振るうわ（弥七が組に加わった）' },
        { t: '運がよかっただけだ', fx: { like: 4 }, reply: '運も実力のうちよ。次の戦でも死ぬなよ' },
      ],
    });
  } else if (town === 2) {
    T.push({
      id: 'osa1', who: '足軽大将 大沢勘兵衛', rel: 'osawa', at: 'boss',
      lines: [`${n}、森部の働き、しかと見た`, lastResult && lastResult.lines.some((l) => l.label === '命令違反')
        ? 'じゃが合図の前に動いたのはいかん。組頭は、待つことも仕事のうちじゃ'
        : lastResult && lastResult.lines.some((l) => l.label === '側面攻撃成功')
          ? '横槍を入れる機を待てる者は少ない。組頭として申し分ない'
          : '先手を崩したのは見事。次は横腹を突くことも覚えよ'],
      choices: [
        { t: '部下がよく動いてくれました', fx: { trust: 6, like: 4 }, sup: 3, reply: '手柄を部下に分けられる者は、よい大将になる' },
        { t: 'もっと大きな組を率いとうございます', fx: { trust: 3 }, reply: '焦るな。次の戦で結果を出せば、わしが推挙してやる' },
      ],
    });
    T.push({
      id: 'ya2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['近ごろ、木下藤吉郎という男の噂を聞くか？', '草履取りから成り上がったとかで、口が達者で妙に人に好かれるそうじゃ'],
      choices: [
        { t: '会ってみたいものだ', fx: { like: 3 }, reply: 'お主と気が合うかもしれんな。どっちも成り上がり者じゃ' },
        { t: '口先だけの男ではないか', fx: { trust: 3 }, reply: 'さあのう。じゃが殿はそういう者を好まれるからの' },
      ],
    });
  }
  return T;
}

// ---------------- 長篠編の城下 ----------------
// place・when：見出し。mood：その場の一言。fac：施設ごとの場の説明。next：城下での選択が次の戦にどう効くか
const TOWNS_N = {
    1: { place: '長篠城 本丸', when: '天正三年　五月十八日', mood: '囲みが解けた。焼け落ちた櫓の煙が、まだ川霧に混じっている',
    sky: 'linear-gradient(180deg, #3b2a22 0%, #5a3a2a 45%, #2a2019 100%)',
    fac: { boss: '本丸の城主の間。奥平様が、煤けた鎧のまま座っておられる', squad: '本丸の石垣の陰。預かる者たちが槍を磨いている', shop: '本丸の武具蔵。籠城で残った具足を分けてもらう', train: '本丸の広場。焼け跡を片付けながら槍を振る', inn: '炊き出しの小屋。久しぶりの粥の湯気が立つ', stable: '城の厩。籠城で痩せた馬が数頭残るのみ' },
    next: { spear: '夜の砦は狭い。柵の内での一突きが重くなる', vit: '夜の山越えは長い。走っても気力が尽きにくい', lead: '初めて預かる五人が、砦の兵に崩されにくくなる', drill: '五人の体と槍が鍛えられ、夜討ちで押し負けにくい', shop: '暗い砦の中では、兜と胴が不意の一撃を防ぐ', feast: '夜の山越えの前の腹ごしらえ。組の士気が高いまま砦へ着く', rest: '傷を抱えたまま夜の山は越えられない' } },
  2: { place: '設楽原 徳川の陣所', when: '天正三年　五月二十一日 朝', mood: '連吾川の西、三重の柵の内。朝霧の向こうに武田の旗が並ぶ',
    sky: 'linear-gradient(180deg, #27313a 0%, #45525a 50%, #1f2226 100%)',
    fac: { boss: '酒井様の陣幕の内。床几の前に絵図が広げてある', squad: '柵の裏の持ち場。組の者が杭を打ち直している', shop: '陣の具足方。出陣前の最後の手入れ', train: '柵の裏の空き地。騎馬を止める槍の構えを繰り返す', inn: '陣小屋。鉄砲衆が火縄を干している', stable: '陣の馬繋ぎ。使番の馬が行き来する' },
    next: { spear: '柵の前で足の止まった騎馬を突く一撃が重くなる', vit: '柵の切れ目へ駆けつける足が保つ', lead: '十五人の組が、騎馬の突っ込みに怯みにくい', drill: '十五人の練度が上がり、柵の守りが固くなる', shop: '鉄砲の流れ弾と騎馬の槍に、具足の防御が効く', feast: '長い待ちでも、組の士気が落ちにくい', rest: '傷を抱えたままでは、柵の内で踏みとどまれない' } },
  3: { place: '岡崎 城下', when: '天正三年　夏', mood: '長篠の勝ち戦に沸く町。市が立ち、鍛冶の槌の音が響く',
    sky: 'linear-gradient(180deg, #3a3a30 0%, #6a5f45 55%, #2a261e 100%)',
    fac: { boss: '岡崎城下、大久保様の屋敷。庭で若い侍が弓を引いている', squad: '長屋の前の路地。組の者が褒美の銭を数えている', shop: '鍛冶町の具足屋。長篠の褒美で賑わう', train: '城下の馬場。城攻めの梯子を掛ける稽古もできる', inn: '伝馬町の旅籠。旅の商人が遠江の噂を運んでくる', stable: '城下の馬喰町。遠江攻めに備えて馬が集まる' },
    next: { spear: '門の内の乱戦で押し負けにくくなる', vit: '堀を越えて門まで走る間、息が切れにくい', lead: '二十人の組の攻めが強まり、門で崩れにくい', drill: '弓も槍も練度が上がり、城からの打って出に耐える', shop: '城から降る矢玉に、具足が効く', feast: '城攻めの長丁場でも、組の士気が保つ', rest: '傷を抱えたまま城攻めには出られない' } },
};
// 見出しの絵（城と町の影）
function townArtN(town) {
  const hill = (d, c, o = 1) => `<path d="${d}" fill="${c}" opacity="${o}"/>`;
  // 簡単な櫓・天守（x,y は石垣の下の中ほど、s は大きさ）
  const keep = (x, y, s, tiers = 2, c = '#15120e') => {
    let g = `<path d="M${x - 22 * s} ${y} L${x - 17 * s} ${y - 12 * s} L${x + 17 * s} ${y - 12 * s} L${x + 22 * s} ${y} Z" fill="${c}"/>`;
    let yy = y - 12 * s, w = 15 * s;
    for (let i = 0; i < tiers; i++) {
      g += `<rect x="${x - w * 0.8}" y="${yy - 9 * s}" width="${w * 1.6}" height="${9 * s}" fill="${c}"/>`;
      g += `<path d="M${x - w * 1.25} ${yy - 8 * s} L${x} ${yy - 16 * s} L${x + w * 1.25} ${yy - 8 * s} Z" fill="${c}"/>`;
      yy -= 11 * s; w *= 0.7;
    }
    return g;
  };
  const roofs = (x0, x1, y, c, seed = 1) => {
    let g = '', x = x0, k = seed;
    while (x < x1) { k = (k * 9301 + 49297) % 233280; const w = 14 + (k % 12), h = 5 + (k % 5); g += `<rect x="${x}" y="${y - h}" width="${w - 2}" height="${h + 8}" fill="${c}"/><path d="M${x - 3} ${y - h} L${x + w / 2 - 1} ${y - h - 6} L${x + w + 1} ${y - h} Z" fill="${c}"/>`; x += w + 1; }
    return g;
  };
  const flags = (xs, y, c, h = 16) => xs.map((x) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#15120e" stroke-width="1"/><rect x="${x}" y="${y - h}" width="3.5" height="${h * 0.55}" fill="${c}"/>`).join('');
  const smoke = (x, y, h) => `<path d="M${x} ${y} C ${x - 10} ${y - h * 0.3}, ${x + 12} ${y - h * 0.55}, ${x - 4} ${y - h}" stroke="rgba(200,190,175,.28)" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  const svg = (inner) => `<svg viewBox="0 0 600 132" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style="position:absolute;inset:0" aria-hidden="true">${inner}</svg>`;
  // 左の見出しの字が読めるよう、左ほど暗くする
  const shade = '<defs><linearGradient id="thShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".55" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="600" height="132" fill="url(#thShade)"/>';
  if (town === 1) return svg(`
    ${hill('M0 88 C 80 74, 160 80, 240 76 C 330 70, 420 80, 600 72 V132 H0 Z', '#3a2a22', 0.8)}
    ${flags([60, 72, 84, 130, 142, 196], 80, '#8e2f1f', 11)}
    ${hill('M300 132 V96 C 330 86, 360 66, 392 60 L 520 58 C 540 66, 556 84, 580 132 Z', '#1d1813')}
    ${keep(450, 60, 1.4, 2)}
    <path d="M392 62 L 400 48 M404 61 L 412 47 M505 58 L 512 45 M518 58 L 523 48" stroke="#15120e" stroke-width="2"/>
    ${smoke(404, 52, 50)}${smoke(512, 50, 44)}
    <path d="M0 120 C 120 110, 220 124, 320 116 C 420 108, 500 122, 600 114 V132 H0 Z" fill="#2c3a40" opacity=".85"/>
    <path d="M0 127 C 150 119, 260 131, 600 123" stroke="rgba(200,215,220,.25)" stroke-width="1" fill="none"/>${shade}`);
  if (town === 2) return svg(`
    ${hill('M0 70 C 100 60, 200 66, 300 60 C 400 54, 500 64, 600 58 V132 H0 Z', '#3d474e', 0.75)}
    ${flags([250, 262, 274, 330, 342, 354, 420, 432, 444, 520, 532, 544, 556], 66, '#8e2f1f', 11)}
    <path d="M0 84 C 200 80, 400 86, 600 82 V88 C 400 92, 200 86, 0 90 Z" fill="#5a7384" opacity=".55"/>
    ${hill('M0 132 V96 C 150 92, 300 98, 600 94 V132 Z', '#232a2e')}
    ${[0, 1, 2].map((j) => Array.from({ length: 44 }, (_, i) => `<line x1="${170 + i * 10 + j * 4}" y1="${98 + j * 4}" x2="${170 + i * 10 + j * 4}" y2="${85 + j * 4}" stroke="#121211" stroke-width="1.7"/>`).join('') + `<line x1="${168 + j * 4}" y1="${90 + j * 4}" x2="${604}" y2="${90 + j * 4}" stroke="#121211" stroke-width="1.1"/>`).join('')}
    ${flags([260, 330, 390, 520], 110, '#ece4d2', 30)}
    <path d="M450 132 V110 Q 490 114, 530 110 Q 570 114, 604 110 V132 Z" fill="#b8ae98" opacity=".16"/>
    <path d="M446 108 Q 490 113, 530 108 Q 570 113, 604 108" stroke="rgba(20,18,15,.7)" stroke-width="1.5" fill="none"/>
    ${[470, 490, 510, 550, 570, 590].map((x) => `<line x1="${x}" y1="112" x2="${x}" y2="132" stroke="rgba(20,18,15,.35)" stroke-width="1"/>`).join('')}
    <circle cx="530" cy="121" r="6" fill="none" stroke="rgba(20,18,15,.55)" stroke-width="2"/>
    <rect x="0" y="0" width="600" height="132" fill="url(#mistN2)"/>
    <defs><linearGradient id="mistN2" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#9fb0ba" stop-opacity="0"/><stop offset=".6" stop-color="#9fb0ba" stop-opacity=".2"/><stop offset=".78" stop-color="#9fb0ba" stop-opacity="0"/></linearGradient></defs>${shade}`);
  if (town === 3) return svg(`
    ${hill('M0 80 C 120 68, 240 76, 360 70 C 460 64, 540 72, 600 68 V132 H0 Z', '#4a4434', 0.7)}
    ${hill('M420 132 V96 C 450 80, 470 64, 500 60 L 560 60 C 575 70, 590 90, 600 132 Z', '#1f1b15')}
    ${keep(530, 60, 1.25, 3)}
    ${roofs(180, 440, 108, '#1a1712', 3)}
    ${roofs(140, 470, 122, '#15120e', 7)}
    ${smoke(250, 98, 30)}${smoke(360, 98, 26)}
    ${flags([300, 410], 100, '#ece4d2', 18)}
    <path d="M0 128 C 180 122, 360 132, 600 126 V132 H0 Z" fill="#3c4a48" opacity=".7"/>${shade}`);
  return '';
}
// 強右衛門を送り出す前の城下は、長篠城本丸の中身を使い回す（日付と気配だけ替える）
TOWNS_N[0.5] = { ...TOWNS_N[1], when: '天正三年　五月十四日 夕', mood: '囲まれて四日。兵糧蔵の焼け跡に、夕餉の煙も上がらない' };

const RUMORS_N = {
  0.5: ['川の瀬は夜なら渡れる。武田の見張りは松明で分かる', '強右衛門殿は足が速い。見つからねば、三日で岡崎に着く'],
  1: ['鳶ヶ巣山の砦は尾根に五つ並んでおるそうな。一つ落とせば、隣の砦からも見える', '夜の山では声を立てるな。松明も消して進むのが酒井様のやり方じゃ'],
  2: ['武田の騎馬は、柵の前でいったん足が止まる。そこが突きどころよ', '鉄砲は込め直しに間がかかる。その間を槍で埋めるのが足軽の役目'],
  3: ['諏訪原の城は、丸い馬出と三日月の堀で守られておるそうな', '門さえ破れば、城の中は狭い。組をまとめて押し込め'],
};
const MISSIONS_N = {
  0.5: { title: '鳥居強右衛門を岡崎へ送り出せ', text: '城の兵糧は尽きかけておる。強右衛門が囲みを抜け、岡崎の殿へ後詰を願いに走る。夜の川を下る道を、その方が守れ。見つかれば全てが終わる。' },
  1: { title: '鳶ヶ巣山の砦を夜討ちせよ', text: '酒井忠次様が別働隊を率い、夜の山を越えて鳶ヶ巣山の砦を背後から突く。城を抜けたその方にも五人を預ける。声を立てず、法螺の合図で一斉にかかれ。' },
  2: { title: '設楽原の馬防柵を守れ', text: '鳶ヶ巣山が落ち、武田は背を断たれた。勝頼は設楽原へ打って出てくる。その方の組は大久保忠世様の手に加わり、柵の内を守れ。' },
  3: { title: '遠江・諏訪原城を攻めよ', text: '殿は長篠の勢いのまま遠江へ攻め入られる。大井川を見下ろす諏訪原の城を落とせ。丸馬出から打って出る敵を受け止め、門を破れ。' },
};
const PEOPLE_N = [
  { k: 'ieyasu', n: '徳川家康', r: '三河・遠江の大名', mon: 'tokugawa', t: '武田に押され続けた三河の主。長篠の勝ちで、遠江を取り戻す足がかりを得る。' },
  { k: 'okudaira', n: '奥平信昌', r: '長篠城主', mon: 'okudaira', t: '武田から徳川へ寝返り、わずか五百で長篠城を守り抜いた若い城主。' },
  { k: 'sune', n: '鳥居強右衛門', r: '奥平家の足軽', mon: 'okudaira', t: '囲みを抜けて岡崎へ走り、援軍の報せを持ち帰ろうとして捕らえられた。「援軍は来る」と城へ叫んだと伝わる。', min: 1 },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', mon: 'tokugawa', t: '籠城で槍を並べた同輩。気のいい男で、何かと話しかけてくる。' },
  { k: 'sakai', n: '酒井忠次', r: '徳川の宿老', mon: 'katabami', t: '鳶ヶ巣山の夜討ちを進言し、自ら別働隊を率いた。', min: 1 },
  { k: 'okubo', n: '大久保忠世', r: '徳川の侍大将', mon: 'okubo', t: '設楽原で柵の内の一手を率いた。兵を叱るのも褒めるのも大きな声の男。', min: 2 },
  { k: 'katsuyori', n: '武田勝頼', r: '甲斐・信濃の大名', mon: 'takeda', t: '信玄の跡を継いだ武田の主。長篠で多くの宿将を失う。' },
  { k: 'yamagata', n: '山県昌景', r: '武田の宿将', mon: 'akazonae', t: '赤備えを率いた武田随一の猛将。設楽原で討ち死にした。', min: 3 },
];
const REL_N = [['okudaira', '奥平'], ['sakai', '酒井'], ['okubo', '大久保'], ['yashichi', '弥七']];
function missionDiagramN(town) {
  const ar = (id, c) => `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${c}"/></marker></defs>`;
  if (town === 1) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <path d="M10 60 C 80 40, 200 35, 290 55" stroke="rgba(236,228,210,.3)" stroke-width="10" fill="none"/><text x="12" y="30" fill="#b9b09c" font-size="11">尾根（鳶ヶ巣山）</text>
    ${[50, 100, 150, 200, 255].map((x, i) => `<rect x="${x}" y="${44 - (i === 4 ? 6 : 0)}" width="${i === 4 ? 16 : 11}" height="${i === 4 ? 16 : 11}" fill="none" stroke="#e36a52" stroke-width="2"/>`).join('')}
    <path d="M40 140 C 60 110, 80 90, 95 70" stroke="#c2a25a" stroke-width="2" stroke-dasharray="4 3" fill="none" marker-end="url(#an1)"/><text x="50" y="132" fill="#c2a25a" font-size="11">夜の山越え</text>
    <text x="210" y="90" fill="#e36a52" font-size="11">五つの砦を順に</text>${ar('an1', '#c2a25a')}
  </svg>`;
  if (town === 2) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <path d="M190 0 C 185 50, 195 100, 188 150" stroke="#4f6f86" stroke-width="4" fill="none"/><text x="196" y="140" fill="#8fb0c0" font-size="11">連吾川</text>
    ${[120, 132, 144].map((x) => `<line x1="${x}" y1="10" x2="${x}" y2="140" stroke="#c2a25a" stroke-width="2" stroke-dasharray="10 4"/>`).join('')}<text x="60" y="20" fill="#c2a25a" font-size="11">三重の馬防柵</text>
    ${[35, 75, 115].map((y) => `<path d="M285 ${y} L205 ${y}" stroke="#e36a52" stroke-width="2" marker-end="url(#an2)"/>`).join('')}<text x="232" y="20" fill="#e36a52" font-size="11">武田の騎馬</text>${ar('an2', '#e36a52')}
  </svg>`;
  if (town === 3) return `<svg class="mdiag" viewBox="0 0 300 150" width="100%">
    <rect width="300" height="150" fill="rgba(111,138,78,.08)"/>
    <circle cx="210" cy="75" r="48" fill="rgba(236,228,210,.06)" stroke="#e36a52" stroke-width="2"/><text x="190" y="80" fill="#e36a52" font-size="11">本曲輪</text>
    <path d="M150 40 A 45 45 0 0 0 150 110" stroke="#4f6f86" stroke-width="4" fill="none"/><text x="100" y="30" fill="#8fb0c0" font-size="11">三日月堀</text>
    <circle cx="140" cy="75" r="10" fill="none" stroke="#e36a52" stroke-width="2"/><text x="112" y="100" fill="#e36a52" font-size="11">丸馬出</text>
    <path d="M30 75 L125 75" stroke="#c2a25a" stroke-width="2" marker-end="url(#an3)"/><text x="30" y="68" fill="#c2a25a" font-size="11">寄せ手</text>${ar('an3', '#c2a25a')}
  </svg>`;
  return '';
}
function campaignMapN(G) {
  const home = { n: '岡崎', x: 90, y: 185 };
  // 名の置き場（dx, dy, 寄せ）：近い三つの名が重ならないように
  // 印の番号は戦の id から引く（戦が増えても済・次がずれない）
  const bi = (id) => BATTLES.findIndex((x) => x.id === id);
  const nodes = [{ n: '長篠城', x: 205, y: 95, b: bi('nagashinojo'), lx: 16, ly: 22, a: 'start' }, { n: '豊川', x: 190, y: 138, b: bi('sune'), lx: 0, ly: 20, a: 'middle' }, { n: '鳶ヶ巣山', x: 238, y: 72, b: bi('tobinosu'), lx: 0, ly: -16, a: 'middle' }, { n: '設楽原', x: 172, y: 110, b: bi('shitaragahara'), lx: -14, ly: 20, a: 'end' }, { n: '諏訪原', x: 292, y: 205, b: bi('suwahara') }].filter((d) => d.b >= 0);
  const next = G.battle;
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%">
    <path d="M250 0 C 240 80, 260 160, 250 250" stroke="rgba(236,228,210,.15)" stroke-dasharray="4 4" fill="none"/>
    <text x="16" y="30" fill="#7d7566" font-size="11">三河</text><text x="266" y="30" fill="#7d7566" font-size="11">遠江</text>
    <path d="M210 20 C 190 90, 150 150, 70 240" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".6"/><text x="60" y="232" fill="#6f8aa0" font-size="11">豊川</text>
    <path d="M300 60 C 300 120, 296 180, 304 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".45"/><text x="262" y="244" fill="#6f8aa0" font-size="11">大井川</text>
    ${nodes.map((d) => `<line x1="${home.x}" y1="${home.y}" x2="${d.x}" y2="${d.y}" stroke="rgba(194,162,90,.25)" stroke-dasharray="3 3"/>`).join('')}
    <circle cx="${home.x}" cy="${home.y}" r="7" fill="#ece4d2" stroke="#14120f" stroke-width="2"/><text x="${home.x}" y="${home.y + 22}" fill="#b9b09c" font-size="12" text-anchor="middle">${home.n}</text>
    ${nodes.map((d) => {
      const done = d.b < next, cur = d.b === next;
      return `<g><circle cx="${d.x}" cy="${d.y}" r="9" fill="${done ? '#c2a25a' : cur ? '#c0452e' : '#2c2821'}" stroke="#14120f" stroke-width="2">${cur && !RM() ? '<animate attributeName="r" values="9;12;9" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      <text x="${d.x + (d.lx || 0)}" y="${d.y + (d.ly ?? 24)}" fill="${cur ? '#f3e6c4' : '#b9b09c'}" font-size="12" text-anchor="${d.a || 'middle'}">${d.n}${done ? '　済' : cur ? '　次' : ''}</text></g>`;
    }).join('')}
  </svg>`;
}
function talksN(G, town, lastResult) {
  const n = G.name;
  const T = [];
  const viol = lastResult && lastResult.lines.some((l) => l.label === '命令違反');
  if (town === 1) {
    T.push({ id: 'oku1', who: '長篠城主 奥平信昌', rel: 'okudaira', at: 'boss',
      lines: [`${n}、よう持ちこたえてくれた。五百でこの城を守れたのは、皆の槍のおかげじゃ`, '強右衛門は……「援軍は来る」と叫んで果てた。あの男の声が、わしらを生かしたのだ'],
      choices: [
        { t: '強右衛門殿の分まで、槍を振るいます', fx: { like: 8, trust: 3, respect: 2 }, sup: 3, reply: 'うむ。その心を忘れるな。酒井様の手に、その方を推しておいた' },
        { t: '次は城の外で手柄を立てとうございます', fx: { trust: 4, respect: 4 }, reply: '頼もしい。鳶ヶ巣山へ、その方の組を出す' },
      ] });
    T.push({ id: 'yaN1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、お主、組頭の見習いになるそうじゃな`, '籠城で飯も食えなんだが、わしはまだ生きとる。……お主と一緒なら、夜の山も怖くない'],
      choices: [
        { t: '弥七、わしの組に来ぬか', fx: { like: 8, trust: 4 }, join: 'yashichi', reply: 'ほ、本当か！　お主の下なら喜んで槍を振るうわ（弥七が組に加わった）' },
        { t: '腹ごしらえが先じゃ', fx: { like: 4 }, reply: 'ちがいない！　城の粥も、今日は旨かろう' },
      ] });
  } else if (town === 2) {
    T.push({ id: 'sak1', who: '酒井忠次', rel: 'sakai', at: 'boss',
      lines: [`${n}、鳶ヶ巣山の働き、見ておったぞ`, viol ? 'じゃが合図の前に声を立てたのはいかん。夜討ちは、黙って待てる者の勝ちじゃ' : '砦を背から落とされ、勝頼は退くか、前に出るかを迫られた。……奴は前に出る。設楽原じゃ'],
      choices: [
        { t: '組の者がよう動いてくれました', fx: { trust: 6, like: 4, respect: 3 }, sup: 3, reply: '手柄を部下に分けられる者は、よい大将になる。大久保の手へ行け' },
        { t: '設楽原でも槍を振るいとうございます', fx: { trust: 4, respect: 2 }, reply: 'よう言うた。大久保忠世の柵の内に、その方の組を置く' },
        ...(viol ? [{ t: '声を立てたのは、組の者にございます', fx: { wary: 8, like: -4 }, reply: '……組の者の咎は、組頭の咎じゃ。覚えておけ' }] : []),
      ] });
    T.push({ id: 'yaN2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['見たか、あの柵。川に沿って、どこまでも続いておる', '鉄砲も三千挺とか申す。……本当に騎馬が止まるのかのう'],
      choices: [
        { t: '止まるとも。止まった所を突くのがわしらの役目じゃ', fx: { trust: 4, like: 3 }, reply: 'そうか……そうじゃな。お主が言うと、そんな気がしてくる' },
        { t: '止まらなんだら、逃げるまでよ', fx: { like: 5 }, reply: 'はっは、正直な奴め！' },
      ] });
  } else if (town === 3) {
    T.push({ id: 'okb1', who: '侍大将 大久保忠世', rel: 'okubo', at: 'boss',
      lines: [`${n}！　設楽原では柵をよう守った`, viol ? 'じゃが下知なく柵を出たのは許さん。次に背けば、組を取り上げるぞ' : '武田は山県・内藤・馬場を失った。今が遠江を取り戻す時じゃ'],
      choices: [
        { t: '殿のお役に立てるなら、どこへでも', fx: { like: 6, respect: 2 }, sup: 3, reply: 'よし。諏訪原の城攻め、その方の組を先手に加える' },
        { t: '城攻めは初めてにございます。心得を', fx: { trust: 6 }, reply: '堀と馬出に気をつけよ。門が破れるまでは、組を散らして矢玉を避けよ' },
        ...(viol ? [{ t: '柵の外に、討てる敵が見えたゆえ', fx: { wary: 10, trust: -4 }, reply: '言い訳は要らん！　次は下知を待て' }] : [{ t: '次は、わしの組が一番に門をくぐります', fx: { respect: 4, wary: 4 }, reply: '大きく出たな。……口にした以上は、やってみせよ' }]),
      ] });
    T.push({ id: 'yaN3', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['岡崎の町は、長篠の話で持ちきりじゃ', '強右衛門の話を、子どもらが芝居にして遊んでおった'],
      choices: [
        { t: 'あの男のことは、忘れてはならぬ', fx: { like: 5, trust: 3 }, reply: 'ああ。……わしらも、ああいう死に方ができるかのう' },
        { t: 'わしらの話も、いずれ芝居になるわ', fx: { like: 6 }, reply: 'はっは、それなら派手に槍を振るわんとな！' },
      ] });
  }
  return T;
}
// 筋書きごとの城下の中身を引く（織田家編は oda_town.js。次に向かう戦の番号で引く）
setOdaDiagram(missionDiagramO);
const town_ = () => (scenarioKey() === 'oda' ? odaTown() : scenarioKey() === 'nagashino'
  ? { TOWNS: TOWNS_N, RUMORS: RUMORS_N, MISSIONS: MISSIONS_N, PEOPLE: PEOPLE_N, REL: REL_N, diagram: missionDiagramN, map: campaignMapN, talks: talksN, art: townArtN }
  : { TOWNS: TOWNS_O, RUMORS: RUMORS_O, MISSIONS: MISSIONS_O, PEOPLE: PEOPLE_O, REL: [['genpachi', '源八'], ['yashichi', '弥七'], ['osawa', '大沢'], ['tokichiro', '藤吉郎']], diagram: missionDiagramO, map: campaignMapO, talks: talksO, art: null });
// 城下での選択が次の戦にどう効くか（筋書きに一言が無い時の決まり文句）
const NEXT_DEF = { spear: '突きと薙ぎが重くなる', vit: '走っても気力が尽きにくい', lead: '組が崩れにくくなる', drill: '組の者が押し負けにくくなる', shop: '防御が上がり、受ける傷が減る', feast: '組の士気が高いまま戦を始められる', rest: '傷が癒えねば出陣できない' };
const nextHint = (town, k) => ((town_().TOWNS[town] || {}).next || {})[k] || NEXT_DEF[k];

// ---------------- 組の者の負傷・練度・忠誠 ----------------
// 古い保存には無いので、無ければ作る
function soldierOf(r) {
  if (r.loyal == null) r.loyal = r.special === 'yashichi' ? 80 : Math.min(75, 55 + (r.battles || 0) * 5);
  if (r.wound == null) r.wound = 0;
  return r;
}
// 練度（戦場での強さの段。戦歴と稽古で上がり、3が上限。一段ごとに体力と攻撃 +8%）
const skillOf = (r) => Math.max(0, Math.min(3, (r.battles || 0) + (r.drill || 0)));
const WOUND = ['なし', '浅手', '深手'];
// 名から決まる数（開くたびに変わらないように）
const hashOf = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
// 城下に着いた時：戦の傷と、組頭への忠誠を名簿に写す（一つの城下で一度だけ）
function rosterArrive(G, town, last) {
  const R = (G.roster || []).filter((r) => r.alive);
  // 出陣の時に下げた練度を戻す（城下にいる間は傷の重みを掛けない）
  for (const r of R) if (r.woundPen) { r.drill = (r.drill || 0) + r.woundPen; delete r.woundPen; }
  R.forEach(soldierOf);
  const notes = [];
  if (G.rosterAt === town) return notes;
  G.rosterAt = town;
  const st = last && last.stats;
  if (!st || !st.squad) return notes;
  const lost = 1 - st.squadAlive / st.squad;
  const viol = last.lines.filter((l) => l.label === '命令違反').length;
  for (const r of R) {
    if (!(r.battles > 0)) continue;   // 新しく加わった者は、まだ戦に出ていない
    const h = hashOf(r.id + ':' + town);
    const p = 0.12 + lost * 0.6;
    r.wound = Math.max(r.wound, h < p * 0.35 ? 2 : h < p ? 1 : 0);
    let d = (last.mainDone ? 3 : -2) + (lost === 0 ? 3 : lost > 0.4 ? -6 : 0) + (last.promoted ? 3 : 0) - viol * 3;
    if (r.special === 'yashichi') d = Math.max(d, 1);
    r.loyal = Math.max(0, Math.min(100, r.loyal + d));
  }
  // 忠誠が尽きた者は組を去る
  for (const r of R) {
    if (r.loyal < 25 && r.special !== 'yashichi') { G.roster = G.roster.filter((x) => x !== r); notes.push(`${r.name}が暇を願い出て、組を去った`); }
  }
  const w = R.filter((r) => r.wound && G.roster.includes(r));
  if (w.length) notes.push(`手負い：${w.map((r) => `${r.name}（${WOUND[r.wound]}）`).join('、')}`);
  return notes;
}
// 出陣の時：手当てしていない傷は、その戦の練度を下げる（戻すのは次の城下）
function rosterDepart(G) {
  for (const r of (G.roster || []).filter((x) => x.alive)) {
    soldierOf(r);
    if (r.wound && !r.woundPen) { r.woundPen = r.wound; r.drill = (r.drill || 0) - r.wound; r.loyal = Math.max(0, r.loyal - 3); }
  }
}
const TOWN_CSS = `<style>
  .base .th { position: relative; height: 150px; margin: -6px 0 10px; border: 1px solid var(--line); overflow: hidden; }
  .base .th .tt { position: absolute; left: 18px; right: 18px; bottom: 12px; text-shadow: 0 1px 4px #000, 0 0 12px rgba(0,0,0,.8); }
  .base .th .tt small { display: block; font-size: 12px; letter-spacing: .3em; color: var(--washi-dim); }
  .base .th .tt b { display: block; font-family: var(--display); font-size: 30px; letter-spacing: .14em; font-weight: 800; }
  .base .th .tt span { display: block; font-size: 13px; color: var(--washi); opacity: .85; margin-top: 2px; }
  .base .fac { font-size: 13px; color: var(--washi-dim); margin: -6px 0 14px; padding-left: 12px; border-left: 2px solid var(--line); }
  .base .nx { display: block; margin-top: 4px; font-size: 12.5px; color: var(--kin); }
  .base .nx::before { content: '次の戦では　'; color: var(--washi-faint); font-size: 12px; letter-spacing: .1em; }
  .base .prep { border: 1px solid var(--line); margin: 12px 0; }
  .base .prep h5 { margin: 0; padding: 8px 14px; font-size: 12px; letter-spacing: .25em; color: var(--washi-dim); font-weight: 500; border-bottom: 1px solid var(--line); }
  .base .prep div { display: grid; grid-template-columns: 6.5em 7.5em 1fr; gap: 10px; padding: 7px 14px; font-size: 13px; border-bottom: 1px dashed var(--line); align-items: baseline; }
  .base .prep div:last-child { border-bottom: 0; }
  .base .prep span { color: var(--washi-dim); }
  .base .prep em { font-style: normal; font-variant-numeric: tabular-nums; }
  .base .prep .ok em { color: var(--kin); } .base .prep .todo em { color: var(--washi); } .base .prep .warn em { color: #e38a74; }
  .base .prep small { font-size: 12px; color: var(--washi-faint); }
  .base .choices button .fx { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-faint); letter-spacing: .04em; }
  .base .choices button .fx i { font-style: normal; margin-right: 10px; }
  .base .choices button .fx .up { color: var(--kin); } .base .choices button .fx .dn { color: #e38a74; }
  .base .roster .rr { grid-template-columns: minmax(8em, 1fr) 30px 58px 44px 52px 50px 108px; gap: 8px; align-items: center; }
  .base .roster .rr > span, .base .roster .rr > div { font-size: 13px; }
  .base .roster .sk { letter-spacing: 2px; color: var(--kin); }
  .base .roster .sk i { font-style: normal; color: #5a5346; }
  .base .roster .w1 { color: #d9b36a; } .base .roster .w2 { color: #e38a74; } .base .roster .w0 { color: var(--washi-faint); }
  .base .roster .ly { display: grid; grid-template-columns: 1fr 26px; gap: 6px; align-items: center; }
  .base .roster .ly i { display: block; height: 5px; background: var(--sumi-3); position: relative; }
  .base .roster .ly i b { position: absolute; inset: 0; right: auto; background: var(--moegi); }
  .base .roster .ly.low i b { background: var(--shu); }
  .base .roster .talkb { background: none; border: 1px solid var(--line); color: var(--washi); font-size: 13px; padding: 6px 10px; min-height: 44px; min-width: 44px; cursor: pointer; margin-left: 6px; }
  .base .roster .talkb:disabled { opacity: .38; cursor: default; }
  .base .roster .talkb:hover:not(:disabled) { border-color: var(--washi-dim); color: var(--washi); }
  .base .rlegend { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; color: var(--washi-faint); margin: 10px 0 0; }
  .base .rlegend b { color: var(--washi-dim); font-weight: 500; margin-right: 4px; }
  .base .tw-prog { margin: 0 0 8px; }
  .base .tw-prog .lbl { display: flex; justify-content: space-between; font-size: 13px; color: var(--washi-dim); }
  .base .tw-prog .lbl b { color: var(--kin); font-weight: 500; }
  .base .tw-prog i { display: block; height: 8px; background: var(--sumi-3); margin: 6px 0 4px; position: relative; }
  .base .tw-prog i b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .base .tw-prog small { font-size: 12px; color: var(--washi-faint); }
  .base .tw-warn { display: block; font-size: 12px; color: #e38a74; font-weight: 400; }
  .base details.tw-more summary { cursor: pointer; font-size: 13.5px; color: var(--washi-dim); padding: 12px 0; min-height: 44px; box-sizing: border-box; border-bottom: 1px solid var(--line); }
  .base details.tw-more summary small { color: var(--washi-faint); font-size: 12px; }
  .base .tw-day { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 6px; font-size: 13px; color: var(--washi-dim); }
  .base .tw-day .koku { display: inline-flex; gap: 4px; }
  .base .tw-day .koku i { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--kin); }
  .base .tw-day .koku i.on { background: var(--kin); }
  .base .tw-day b { color: var(--washi); font-weight: 500; }
  .base .tw-day small { color: var(--washi-faint); font-size: 12px; }
  .base .tabs .tdot.td2 { background: none; color: var(--kin); box-shadow: inset 0 0 0 1px var(--kin); }
  .base .tw-up { margin-left: 10px; font-size: 12px; color: var(--kin); border: 1px solid rgba(194,162,90,.6); padding: 0 6px; }
  .base .tw-said { margin-top: 6px; color: var(--washi-dim); }
  .base .tw-said .fx { display: inline; margin-left: 10px; font-size: 12px; }
  .base .tw-said .fx i { font-style: normal; margin-right: 8px; }
  .base .tw-said .fx .up { color: var(--kin); } .base .tw-said .fx .dn { color: #e38a74; }
  .base .tw-left { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  .base .tw-left > span { width: 100%; font-size: 12px; color: var(--washi-dim); }
  @media (max-width: 900px) { .base .roster .rr { grid-template-columns: minmax(7em, 1fr) 28px 50px 40px 48px 44px 90px; gap: 6px; } }
</style>`;

export function baseScreen(G, town0, lastResult, game) {
  // 長篠編は戦が増えても（強右衛門の脱出など）、城下の中身は「次に向かう戦」で引く
  const nextId = BATTLES[town0] && BATTLES[town0].id;
  const town = scenarioKey() === 'nagashino' ? ({ sune: 0.5, tobinosu: 1, shitaragahara: 2, suwahara: 3 }[nextId] ?? town0) : town0;
  const TW = town_();
  const info = TW.TOWNS[town];
  // 戦の傷と忠誠を名簿へ（古い保存には無い値もここで作る）
  const arriveNotes = rosterArrive(G, town, lastResult);
  for (const [k] of TW.REL) relOf(G, k);
  save(G);
  let tab = 'boss';
  let confirmGo = false;
  const T = TW.talks(G, town, lastResult);
  const tabs = [['boss', '上官屋敷'], ['squad', '組'], ['shop', '武具屋'], ['toiya', '問屋'], ['train', '訓練場'], ['inn', '宿'], ['people', '人物録'], ['journal', '日誌'], ['stable', '馬屋']];
  let rosterSort = 'battles';
  const trainedNow = {};   // この城下で稽古して伸ばした物（札に残す）
  const saved = () => { save(G); notice('保存しました'); };
  let preview = null;

  const render = () => {
    const next = RANKS[G.rank + 1];
    const eqNames = ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat'].map((k) => G.equip[k]).filter(Boolean).map((id) => ITEMS[id].name).join('・');
    const aside = `<aside>
      <div class="eyebrow">${TW.art ? '' : `${esc(info.place)}　・　${esc(info.when)}　・　`}${['夕刻', '昼', '朝'][Math.max(0, Math.min(2, G.actions))]}</div>
      <h2>${esc(G.name)}</h2>
      <div class="rank">${esc(RANKS[G.rank].name)}</div>
      <button class="btn small" id="b-ladder-town" style="margin-top:10px">出世の道を見る</button>
      ${G.rank >= 4 || G.battle >= BATTLES.length ? '<button class="btn small" id="b-japan-town" style="margin-top:10px">日本地図</button>' : ''}
      <div style="height:12px"></div>
      ${next ? `<div class="tw-prog" aria-label="次の身分まで"><div class="lbl"><span>次は「${esc(next.name)}」</span><b>あと ${Math.max(0, next.min - G.merit)}</b></div><i><b style="width:${Math.min(100, Math.max(0, (G.merit - RANKS[G.rank].min) / (next.min - RANKS[G.rank].min)) * 100)}%"></b></i><small>累計戦功 ${G.merit} ／ ${next.min}</small></div>` : `<div class="stat"><span>累計戦功</span><b>${G.merit}</b></div>`}
      <div class="stat"><span>所持金</span><b>${zeni(G.kan)}</b></div>
      <div class="stat"><span>上官の評価</span><b>${G.superior}${G.superior < 50 ? '<small class="tw-warn">（50未満：昇進できない）</small>' : ''}</b></div>
      <div class="stat"><span>負傷</span><b style="color:${G.injured ? '#e38a74' : 'inherit'}">${G.injured ? '重傷（要休息）' : 'なし'}</b></div>
      <details class="tw-more"><summary>細かな力　<small>槍${G.stats.spear}・体${G.stats.vit}・統${G.stats.lead}・防${Math.round(equipDef(G) * 100)}%</small></summary>
        <div class="stat"><span>槍術</span><b>${G.stats.spear}</b></div>
        <div class="stat"><span>体力</span><b>${G.stats.vit}</b></div>
        <div class="stat"><span>統率</span><b>${G.stats.lead}</b></div>
        <div class="stat"><span>具足の防御</span><b>${Math.round(equipDef(G) * 100)}%</b></div>
        <div class="stat"><span>組の人数</span><b>${RANKS[G.rank].squad}人</b></div>
      </details>
      <p class="note" style="margin-top:12px">身につけている物：${esc(eqNames)}${G.owned.includes('katana') ? '・打刀' : ''}</p>
      <p class="note">施設は数字キー 1〜9、または ←→ でも切り替えられます</p>
    </aside>`;
    let body = '';
    if (tab === 'boss') {
      const m = TW.MISSIONS[town];
      const cheap = Object.values(ITEMS).filter((it) => it.cost && it.slot !== 'gun' && it.slot !== 'bow' && !G.owned.includes(Object.keys(ITEMS).find((k) => ITEMS[k] === it)) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank));
      const leftovers = [];
      if (G.actions > 0 && !G.injured) leftovers.push(['train', `稽古の時間があと${G.actions}刻`]);
      if ((G.roster || []).some((r) => r.alive && r.wound)) leftovers.push(['inn', '手負いの者が組にいる']);
      if (cheap.length) leftovers.push(['shop', `${zeni(G.kan)}で買える具足がある`]);
      if (G.rank >= 1 && !G.feast && G.kan >= 5) leftovers.push(['inn', 'まだ組に振る舞っていない']);
      // 次の戦への備え：城下での選択が、次の戦のどこに効くかをまとめて見せる
      const R0 = (G.roster || []).filter((r) => r.alive);
      const hurt = R0.filter((r) => r.wound).length;
      const prep = [
        ['稽古', G.actions > 0 && !G.injured ? `あと ${G.actions} 刻` : '済', G.actions > 0 && !G.injured ? 'todo' : 'ok', '訓練場で槍・体力・采配を伸ばす'],
        ['具足', `防御 ${Math.round(equipDef(G) * 100)}%`, cheap.length ? 'todo' : 'ok', cheap.length ? `${nextHint(town, 'shop')}（${zeni(G.kan)}で買える物がある）` : nextHint(town, 'shop')],
        ...(R0.length ? [['組の傷', hurt ? `${hurt}人が手負い` : 'みな無事', hurt ? 'warn' : 'ok', hurt ? '手負いのまま出ると、その者の練度が下がる。宿で手当てを' : '全員が本来の力で戦える']] : []),
        ...(G.rank >= 1 ? [['振る舞い', G.feast ? '済' : 'まだ', G.feast ? 'ok' : 'todo', nextHint(town, 'feast')]] : []),
        ['上官の評価', String(G.superior), G.superior < 50 ? 'warn' : 'ok', G.superior < 50 ? '50未満では昇進できない。上官と話して挽回を' : '昇進の条件を満たしている'],
        ...(G.injured ? [['自分の傷', '重傷', 'warn', nextHint(town, 'rest')]] : []),
      ];
      // 出陣の釦を上に置く（上官との話は下へ。狭い画面でも、開いてすぐ「出陣」に指が届くように）
      body = `
        <div class="item"><div class="n">次の任務：${esc(m.title)}</div><div class="x">${esc(m.text)}${TW.diagram(town)}</div>
        <div class="a"><button class="btn primary small" id="go">${G.injured ? '宿で休んでから出陣' : '任務を受けて出陣'}</button></div></div>
        ${G.injured ? '<p class="note">重傷が癒えていません。「宿で休んでから出陣」を押すと、一刻休んで傷を癒やしてから出陣します。</p>' : ''}
        ${confirmGo ? `<div class="confirm-row"><b>出陣の前に</b>
          <div class="note">身につけた物：${esc(eqNames)}${G.owned.includes('katana') ? '・打刀' : ''}</div>
          <div class="note">組：${R0.length}人（古参 ${R0.filter((r) => r.battles > 0).length}人${hurt ? `・手負い ${hurt}人` : ''}）　・　組の人数の上限 ${RANKS[G.rank].squad}人</div>
          ${leftovers.length ? `<div class="tw-left"><span>やり残し（押すとその施設へ）</span>${leftovers.map(([k, t]) => `<button class="btn small" data-goto="${k}">${esc(t)}　→ ${esc(tabs.find(([x]) => x === k)[1])}</button>`).join('')}</div>` : '<div class="note">やり残しはない。</div>'}
          <div class="row"><button class="btn small" id="go-no">城下に残る</button><button class="btn primary small" id="go2">出陣する</button></div></div>` : ''}
        ${talkHtml(T.filter((t) => t.at === 'boss'))}
        <div class="prep"><h5>次の戦への備え</h5>${prep.map(([a, b, c, d]) => `<div class="${c}"><span>${a}</span><em>${esc(b)}</em><small>${esc(d)}</small></div>`).join('')}</div>
        <div style="height:18px"></div><div class="eyebrow">戦の道のり</div>${TW.map(G)}` + relHtml(G);
    } else if (tab === 'shop') {
      const slots = [['weapon', '槍'], ['hat', '兜・笠'], ['body', '胴'], ['arm', '籠手'], ['thigh', '佩楯'], ['shin', '脛当'], ['coat', '陣羽織']];
      const SLOT_ICON = { weapon: 'shop', hat: 'hat', body: 'body', arm: 'arm', thigh: 'body', shin: 'arm', coat: 'coat' };
      const IC = {
        shop: TAB_ICON.shop,
        hat: '<svg viewBox="0 0 24 24"><path d="M3 15 C 6 6, 18 6, 21 15 Z"/><path d="M2 15 H22"/></svg>',
        body: '<svg viewBox="0 0 24 24"><path d="M6 4 H18 L20 10 L18 20 H6 L4 10 Z"/><path d="M6 9 H18 M6 13 H18 M6 17 H18"/></svg>',
        arm: '<svg viewBox="0 0 24 24"><path d="M8 3 H16 V17 L12 21 L8 17 Z"/><path d="M8 8 H16 M8 12 H16"/></svg>',
        coat: '<svg viewBox="0 0 24 24"><path d="M7 3 L12 6 L17 3 L21 8 L18 10 V21 H6 V10 L3 8 Z"/></svg>',
      };
      // 買える物のうち、防御がいちばん上がる物をおすすめに
      let rec = null, recGain = 0;
      for (const [id, it] of Object.entries(ITEMS)) {
        if (!it.cost || G.owned.includes(id) || it.cost > G.kan || (it.minRank && G.rank < it.minRank)) continue;
        const cur = G.equip[it.slot] ? ITEMS[G.equip[it.slot]] : null;
        const gain = (it.def || 0) - (cur?.def || 0) + ((it.mult || 0) - (cur?.mult || 0)) * 0.5;
        if (gain > recGain) { recGain = gain; rec = id; }
      }
      body = `<canvas class="preview3d" id="pv"></canvas><p class="note" style="text-align:center">戦場での姿（着け替えるとすぐ変わる）</p><div class="row" style="justify-content:space-between"><p class="note">褒美の銭で具足を整える。所持金 ${zeni(G.kan)}<span class="nx">${esc(nextHint(town, 'shop'))}</span></p><div class="row"><button class="btn small" id="auto-eq">一番よい物を着ける</button><button class="btn small" id="own-only">${G.shopOwned ? 'すべて表示' : '持ち物だけ表示'}</button></div></div><div class="items">` + slots.map(([slot, label]) => {
        const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === slot && (!G.shopOwned || G.owned.includes(id)));
        const cur = G.equip[slot] ? ITEMS[G.equip[slot]] : null;
        return ids.map((id) => {
          const it = ITEMS[id];
          const own = G.owned.includes(id);
          const eq = G.equip[slot] === id;
          const lock = it.minRank && G.rank < it.minRank;
          // いま着けている物との比較
          let cmp = '';
          if (!eq) {
            if (it.def !== undefined) { const d = Math.round(((it.def || 0) - (cur?.def || 0)) * 100); if (d) cmp = `<span class="cmp ${d < 0 ? 'neg' : ''}">防御 ${d > 0 ? '+' : ''}${d}%</span>`; }
            if (it.mult !== undefined && cur?.mult !== undefined) { const d = Math.round((it.mult - cur.mult) * 100); if (d) cmp = `<span class="cmp ${d < 0 ? 'neg' : ''}">威力 ${d > 0 ? '+' : ''}${d}%</span>`; }
          }
          let act;
          if (eq) act = '<span class="note">着用中</span>';
          else if (own) act = `<button class="btn small" data-eq="${id}">身につける</button>`;
          else if (lock) act = `<span class="note">${esc(RANKS[it.minRank].name)}から</span>`;
          else if (it.cost === undefined) act = '<span class="note">下賜の品（昇進で賜る）</span>';
          else act = G.kan < it.cost ? `<span class="note">${zeni(it.cost)}（あと${zeni(it.cost - G.kan)}）</span>` : `<button class="btn small" data-buy="${id}">${zeni(it.cost)}で買う</button>`;
          return `<div class="item ${eq ? 'eq' : ''}"><div class="n"><span class="sic">${IC[SLOT_ICON[slot]]}</span>${esc(it.name)}<small>${esc(label)}</small>${cmp}${id === rec ? '<span class="rec">おすすめ</span>' : ''}</div><div class="x">${esc(it.note)}</div><div class="a">${act}</div></div>`;
        }).join('');
      }).join('') + `<div class="item"><div class="n">打刀<small>刀</small></div><div class="x">${esc(ITEMS.katana.note)}</div><div class="a">${G.owned.includes('katana') ? '<span class="note">所持</span>' : (G.kan < ITEMS.katana.cost ? `<span class="note">${zeni(ITEMS.katana.cost)}（あと${zeni(ITEMS.katana.cost - G.kan)}）</span>` : `<button class="btn small" data-buy="katana">${ITEMS.katana.cost}貫で買う</button>`)}</div></div></div>`;
    } else if (tab === 'toiya') {
      // 問屋：供・飛び道具・馬・槍と具足（toiya.js）
      body = toiyaHtml(G);
    } else if (tab === 'train') {
      const tr = [
        { id: 'spear', n: '槍の稽古', x: '槍術 +1（突きと薙ぎの威力 +10%）' },
        { id: 'vit', n: '走り込み', x: '体力 +1（体力 +10・気力 +12）' },
        { id: 'lead', n: '采配の稽古', x: '統率 +1（組の攻撃力 +8%・士気 +3）', min: 1 },
        { id: 'drill', n: '組の稽古', x: '組の全員の練度 +1（一段ごとに体力・攻撃 +8%。城下ごとに一度。手負いの者は加われない）', min: 1 },
      ];
      body = `<p class="note">一日に使える時間は二刻。稽古・休息のいずれかに使う。残り ${G.actions} 刻</p><div class="items">` + tr.map((t) => {
        const lock = t.min && G.rank < t.min;
        if (t.id === 'drill') {
          const done = G.drilled === town;
          return `<div class="item"><div class="n">${t.n}<small>${(G.roster || []).filter((r) => r.alive && !r.wound).length}人</small></div><div class="x">${t.x}<span class="nx">${esc(nextHint(town, 'drill'))}</span></div><div class="a">${lock ? '<span class="note">組頭候補から</span>' : done ? '<span class="note">済み</span>' : (G.injured ? '<span class="note">重傷のため休む</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : '<button class="btn small" data-drill="1">一刻使う</button>')}</div></div>`;
        }
        return `<div class="item ${trainedNow[t.id] ? 'eq' : ''}"><div class="n">${t.n}<small>現在 ${G.stats[t.id]}</small>${trainedNow[t.id] ? `<span class="tw-up">今日 +${trainedNow[t.id]}（${G.stats[t.id] - trainedNow[t.id]} → ${G.stats[t.id]}）</span>` : ''}</div><div class="x">${t.x}<span class="nx">${esc(nextHint(town, t.id))}</span></div><div class="a">${lock ? '<span class="note">組頭候補から</span>' : (G.injured ? '<span class="note">重傷のため休む</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : `<button class="btn small" data-train="${t.id}">一刻使う</button>`)}</div></div>`;
      }).join('') + `</div>${G.injured ? '<p class="note">重傷のため稽古はできない。</p>' : ''}`;
    } else if (tab === 'squad') {
      const R = (G.roster || []).filter((r) => r.alive).map(soldierOf);
      const fallen = (G.fallen || []);
      const key = { battles: (r) => r.battles, kills: (r) => r.kills, loyal: (r) => r.loyal, wound: (r) => r.wound }[rosterSort] || ((r) => r.battles);
      const sk = (r) => { const n = skillOf(r); return `<span class="sk" title="練度 ${n}／3">${'●'.repeat(n)}<i>${'●'.repeat(3 - n)}</i></span>`; };
      const hurt = R.filter((r) => r.wound).length, low = R.filter((r) => r.loyal < 40).length;
      body = R.length ? `<p class="note">${esc(G.aijirushi ? '合印を掲げる' : '')}組の者たち（${R.length}人${hurt ? `・手負い ${hurt}人` : ''}）。生き残った者は古参となり、練度が上がる。</p>
        ${G.recruitsNote ? `<p class="note" style="color:var(--kin)">${esc(G.recruitsNote)}</p>` : ''}
        ${arriveNotes.length ? `<p class="note" style="color:#e3a08c">${arriveNotes.map(esc).join('<br>')}</p>` : ''}
        ${G.rank >= 2 ? `<div class="item"><div class="n">組の編成</div><div class="x">弓組の割合を決める（次の戦から）</div><div class="a"><select id="bowratio" aria-label="弓組の割合"><option value="0" ${G.bowRatio === 0 ? 'selected' : ''}>弓なし（槍だけ）</option><option value="0.33" ${G.bowRatio === undefined || G.bowRatio === 0.33 ? 'selected' : ''}>弓を三分の一</option><option value="0.5" ${G.bowRatio === 0.5 ? 'selected' : ''}>弓を半分</option></select></div></div>` : ''}
        <div class="row" style="margin:10px 0 4px" role="group" aria-label="並べ替え">${[['battles', '戦歴'], ['kills', '討取'], ['wound', '負傷'], ['loyal', '忠誠']].map(([k, n]) => `<button class="btn small ${rosterSort === k ? 'primary' : ''}" data-sort="${k}" aria-pressed="${rosterSort === k}">${n}の順</button>`).join('')}</div>
        <div class="roster"><div class="rr head"><span>名</span><span>役</span><span>戦歴</span><span>討取</span><span>練度</span><span>負傷</span><span>忠誠</span></div>
        ${[...R].sort((x, y) => key(y) - key(x)).map((r) => `<div class="rr" data-who="${esc(r.name)}"><div class="${r.battles > 0 ? 'vet' : ''}">${esc(r.name)}<small style="color:var(--washi-faint);font-size: 12px">${r.special === 'yashichi' ? '（同輩）' : r.battles >= 2 ? '（古参）' : r.battles === 1 ? '（二度目）' : '（新参）'}</small><button class="talkb" data-spk="${esc(r.id)}" ${r.spoke === town ? 'disabled' : ''} title="声をかける（忠誠 +3・城下ごとに一度）">${r.spoke === town ? '話した' : '声をかける'}</button><button class="talkb" data-ren="${esc(r.id)}" title="名を改める">改名</button></div>
          <span>${r.kind === 'bow' ? '弓' : '槍'}</span><span>${r.battles}戦</span><span>${r.kills}人</span>${sk(r)}<span class="w${r.wound}">${WOUND[r.wound]}</span>
          <span class="ly ${r.loyal < 40 ? 'low' : ''}" title="忠誠 ${r.loyal}"><i><b style="width:${r.loyal}%"></b></i><span>${r.loyal}</span></span></div>`).join('')}</div>
        <div class="rlegend"><span><b>練度</b>戦歴と稽古で上がる。一段ごとに体力・攻撃 +8%（3段まで）</span><span><b>負傷</b>手当てせずに出ると、その戦では練度が浅手 −1・深手 −2</span><span><b>忠誠</b>勝ち戦・組を死なせぬ采配・振る舞い・声かけで上がる。25を切ると組を去る${low ? `（いま40未満が${low}人）` : ''}</span></div>
        ${fallen.length ? `<p class="note" style="margin-top:14px">討たれた者：${esc(fallen.join('、'))}</p>` : ''}`
        : '<p class="note">まだ組を持っていない。組頭候補になれば、足軽を預かる。</p>';
    } else if (tab === 'journal') {
      const J = G.journal || [];
      body = J.length ? `<div class="people">${[...J].reverse().map((j) => `<div class="p"><canvas class="pmon" width="44" height="44" data-m="${j.m || G.aijirushi || 'oda'}"></canvas><b>${esc(j.t)}</b><p>${esc(j.s)}</p></div>`).join('')}</div>` : '<p class="note">まだ記すことはない。</p>';
    } else if (tab === 'people') {
      body = `<div class="people">${TW.PEOPLE.filter((p) => !p.min || town >= p.min || (p.k === 'tokichiro' && G.battle >= 3)).map((p) => {
        const r = G.rel[p.k];
        const mon = p.mon || { nobunaga: 'oda', genpachi: 'oda', yashichi: 'oda', osawa: 'oda', tokichiro: 'oda', yoshimoto: 'imagawa', hibino: 'saito' }[p.k];
        const log = (G.relLog || []).filter((l) => l.who === p.k).slice(-2);
        return `<div class="p"><canvas class="pmon" width="44" height="44" data-m="${mon}"></canvas><b>${esc(p.n)}</b><small>${esc(p.r)}</small><p>${esc(p.t)}</p>${r ? `<p>信頼 ${r.trust} ・ 好感 ${r.like} ・ 尊敬 ${relOf(G, p.k).respect} ・ 警戒 ${relOf(G, p.k).wary}${relWord(relOf(G, p.k)) ? `　— ${relWord(relOf(G, p.k))}` : ''}</p>` : ''}${log.map((l) => `<p class="note">${esc(l.s)}</p>`).join('')}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'inn') {
      const rum = TW.RUMORS[town] || [];
      const hurtL = (G.roster || []).filter((r) => r.alive && r.wound);
      const hurtN = hurtL.length, lightN = hurtL.filter((r) => r.wound === 1).length;
      const hurtNames = hurtL.map((r) => `${r.name}・${WOUND[r.wound]}`).join('、');
      const treatCost = Math.max(2, hurtL.reduce((a, r) => a + r.wound, 0));
      const yDead = (G.fallen || []).includes('弥七');
      const yIn = (G.roster || []).some((r) => r.special === 'yashichi' && r.alive);
      const yLine = yDead ? '<div class="histnote" style="border-color:var(--washi-faint)"><b>弥七の弔い</b><br>宿の主人が、弥七の好きだった濁り酒を一杯、黙って置いていった。</div>'
        : yIn ? `<div class="talk"><div><span class="sp">弥七</span>　${esc(G.name)}の組に入ってから、槍の振り方が変わったと皆に言われるわ</div></div>` : '';
      body = (rum.length ? `<div class="histnote"><b>宿で聞いた噂</b><br>${rum.map(esc).join('<br>')}</div>` : '') + yLine + `<div class="items">
        <div class="item"><div class="n">組に振る舞う<small>5貫</small></div><div class="x">酒と飯を振る舞い、次の戦の始めの組の士気 +10・組の者の忠誠 +6<span class="nx">${esc(nextHint(town, 'feast'))}</span></div><div class="a">${G.feast ? '<span class="note">振る舞い済み</span>' : G.rank < 1 ? '<span class="note">組頭候補から</span>' : G.kan < 5 ? '<span class="note">あと' + zeni(5 - G.kan) + '</span>' : '<button class="btn small" id="feast">振る舞う</button>'}</div></div>
        ${hurtN ? `<div class="item"><div class="n">組の傷の手当て<small>${treatCost}貫</small></div><div class="x">医者を呼び、手負い${hurtN}人（${esc(hurtNames)}）の傷をすべて治す・その者の忠誠 +4<span class="nx">手負いのまま出れば、その戦では練度が下がる（浅手 −1・深手 −2）</span></div><div class="a">${G.kan < treatCost ? `<span class="note">あと${zeni(treatCost - G.kan)}</span>` : '<button class="btn small" id="treat">手当てする</button>'}</div></div>` : ''}
        <div class="item"><div class="n">休息する<small>一刻</small></div><div class="x">${G.injured ? '自分の重傷を癒やす' : '自分は無事'}${lightN ? `・組の浅手${lightN}人も癒える` : ''}${G.injured ? `<span class="nx">${esc(nextHint(town, 'rest'))}</span>` : ''}</div><div class="a">${G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : !G.injured && !lightN ? '<span class="note">休む必要はない</span>' : '<button class="btn small" id="rest">休む</button>'}</div></div></div>` + talkHtml(T.filter((t) => t.at === 'inn'));
    } else {
      // 馬屋：足軽大将から。馬を選ぶ・買う・手入れする・名を付ける
      const st = ladderStep(G);
      if (st < 2) {
        body = `<div class="stable-lock"><canvas class="preview3d" id="pv-st"></canvas><div><div class="n" style="font-family:var(--display);font-size:22px;letter-spacing:.1em">馬屋は足軽大将から</div><p class="note">足軽大将になると、自分の馬を持ち、馬上で戦える。駆けて突けば重い一撃、Shift で駆け、Space で手綱を引く。</p><p class="note">いまの累計戦功 ${G.merit} ／ 足軽大将まで ${Math.max(0, RANKS[4].min - G.merit)}</p><button class="btn small" id="st-ladder">出世の道で馬上の姿を見る</button></div></div>`;
      } else {
        const H = myHorse(G);
        G.horses = G.horses || ['tsukikage'];
        body = `<div class="stable"><div><canvas class="preview3d" id="pv-st"></canvas><div class="st-name">${esc(H.name)}<small>${esc(H.kind)}・絆 ${'●'.repeat(H.bond)}${'○'.repeat(5 - H.bond)}</small></div>
          <div class="row" style="justify-content:center"><button class="btn small" id="st-rename">名を付ける</button>${H.bond >= 5 ? '<span class="note">絆はもう満ちている</span>' : G.actions <= 0 ? '<span class="note">今日の時間はもう無い</span>' : '<button class="btn small" id="st-care">手入れする（一刻）</button>'}</div>
          <p class="note" style="text-align:center">手入れで絆が深まると、馬の体力と息が少しずつ伸びる（絆一つにつき4%）</p></div>
          <div class="items">${Object.entries(HORSES).filter(([id, h]) => !h.spoil || G.horses.includes(id)).map(([id, h0]) => {
            const own = G.horses.includes(id), on = H.id === id;
            // 分捕り馬は、どこの誰の馬だったかと付けた名を添える
            const hb = (on ? G.horse : (G.horseBonds || {})[id]) || {};
            const h = h0.spoil ? { ...h0, name: hb.name || h0.name, note: `${hb.from ? `${hb.from}から分捕った馬。` : ''}${h0.note}` } : h0;
            const act = on ? '<span class="note">乗っている</span>' : own ? `<button class="btn small" data-ride="${id}">この馬に乗る</button>` : G.kan < h.cost ? `<span class="note">${h.cost}貫（あと${h.cost - G.kan}貫）</span>` : `<button class="btn small" data-horse="${id}">${h.cost}貫で買う</button>`;
            const bar = (v) => `<i class="hb"><b style="width:${Math.round(v / 1.4 * 100)}%"></b></i>`;
            return `<div class="item ${on ? 'eq' : ''}"><div class="n">${esc(h.name)}<small>${esc(h.kind)}</small></div><div class="x">${esc(h.note)}<div class="hstats"><span>体力</span>${bar(h.hp)}<span>息</span>${bar(h.breath)}<span>速さ</span>${bar(h.speed)}</div></div><div class="a">${act}</div></div>`;
          }).join('')}</div></div>`;
      }
    }
    const talkLeft = T.filter((t) => !G.talked[t.id]);
    const todo = {};
    const mark = (k, m, why) => { (todo[k] = todo[k] || []).push([m, why]); };
    for (const t of talkLeft) if (!(todo[t.at] || []).some(([m]) => m === '話')) mark(t.at, '話', 'まだ話していない人がいる');
    if (G.actions > 0 && !G.injured) mark('train', '稽', `稽古の時間があと${G.actions}刻`);
    if ((G.roster || []).some((r) => r.alive && r.wound) || G.injured) mark('inn', '傷', '手当て・休息が要る者がいる');
    if (Object.entries(ITEMS).some(([id, it]) => it.cost && it.slot !== 'side' && it.slot !== 'gun' && it.slot !== 'bow' && !G.owned.includes(id) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank))) mark('shop', '買', `${zeni(G.kan)}で買える具足がある`);
    if (toiyaCheap(G)) mark('toiya', '買', `${zeni(G.kan)}で雇える供・買える物がある`);
    const hero = TW.art ? `<div class="th" style="background:${info.sky}">${TW.art(town === 0.5 ? 1 : town)}<div class="tt"><small>${esc(info.when)}</small><b>${esc(info.place)}</b><span>${esc(info.mood || '')}</span></div></div>` : '<div class="townsky"></div>';
    const fac = (info.fac || {})[tab];
    show(`${TOWN_CSS}<div class="base tod-${Math.max(0, Math.min(2, G.actions))}">${aside}<main>
      ${hero}
      <div class="tw-day" aria-label="今日の残り ${G.actions}刻"><span>今日の残り</span><span class="koku">${Array.from({ length: 2 }, (_, i) => `<i class="${i < G.actions ? 'on' : ''}"></i>`).join('')}</span><b>${G.actions ? `${G.actions}刻` : 'もう無い'}</b><small>${G.actions ? '稽古・休息・馬の手入れに一刻ずつ使う' : '今日できる事は終わった。あとは出陣のみ'}</small></div>
      <div class="tabs" role="tablist" aria-label="城下の施設">${tabs.map(([k, nme], i) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${TAB_ICON[k] || ''}${i + 1}．${nme}${(todo[k] || []).map(([m, why]) => `<span class="tdot ${m === '話' ? '' : 'td2'}" title="${why}" aria-label="${why}">${m}</span>`).join('')}</button>`).join('')}</div>
      ${fac ? `<p class="fac">${esc(fac)}</p>` : ''}${body}
    </main></div>`, false, (e) => {
      const i = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
      if (i >= 0 && tabs[i]) { tab = tabs[i][0]; confirmGo = false; sfx('ui'); render(); }
    });
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => { tab = b.dataset.tab; confirmGo = false; sfx('ui'); render(); document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true }); };
      // ←→ で隣の施設へ（タブの決まり）
      b.onkeydown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = tabs.findIndex(([k]) => k === b.dataset.tab);
        tab = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0]; confirmGo = false; sfx('ui'); render();
        document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true });
      };
    });
    const bl = $('b-ladder-town'); if (bl) bl.onclick = () => { sfx('ui'); game.ladder('town'); };
    // 問屋の釦
    toiyaBind(G, (msg, snd) => { sfx(snd || 'ui'); save(G); notice(msg); render(); document.querySelector('[data-tab="toiya"]')?.focus({ preventScroll: true }); });
    const bj = $('b-japan-town'); if (bj) bj.onclick = () => { sfx('ui'); if (preview) { preview.dispose(); preview = null; } game.japanMap('town'); };
    const flashPv = () => { const c = $('pv'); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } };
    document.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => { const it = ITEMS[b.dataset.eq]; G.equip[it.slot] = b.dataset.eq; sfx('ui'); saved(); render(); flashPv(); });
    document.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
      const id = b.dataset.buy; const it = ITEMS[id];
      if (G.kan < it.cost) return;
      G.kan -= it.cost; G.owned.push(id);
      if (it.slot !== 'side') G.equip[it.slot] = id;
      sfx('merit'); saved(); render(); flashPv();
    });
    document.querySelectorAll('[data-train]').forEach((b) => b.onclick = () => {
      const k = b.dataset.train; const before = G.stats[k];
      G.stats[k]++; G.actions--; trainedNow[k] = (trainedNow[k] || 0) + 1; sfx('taiko', 0.5); save(G);
      notice(`${{ spear: '槍術', vit: '体力', lead: '統率' }[k]} ${before} → ${G.stats[k]}`);
      (G.journal = G.journal || []).push({ t: `${TW.TOWNS[town].when}　稽古`, s: `${{ spear: '槍の稽古', vit: '走り込み', lead: '采配の稽古' }[k]}に励んだ。` });
      render();
    });
    const fe = $('feast');
    if (fe) fe.onclick = () => { G.kan -= 5; G.feast = true; for (const r of G.roster || []) if (r.alive) { soldierOf(r); r.loyal = Math.min(100, r.loyal + 6); } sfx('merit'); saved(); render(); };
    const trt = $('treat');
    if (trt) trt.onclick = () => {
      const L = (G.roster || []).filter((r) => r.alive && r.wound);
      const cost = Math.max(2, L.reduce((a, r) => a + r.wound, 0));
      if (G.kan < cost) return;
      G.kan -= cost; for (const r of L) { r.wound = 0; r.loyal = Math.min(100, r.loyal + 4); }
      sfx('ui'); notice(`${L.length}人の傷を手当てした`); saved(); render();
    };
    const ae = $('auto-eq');
    if (ae) ae.onclick = () => {
      for (const slot of ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin', 'coat']) {
        let best = G.equip[slot], bv = best ? (ITEMS[best].def || 0) + (ITEMS[best].mult || 0) : -1;
        for (const id of G.owned) { const it = ITEMS[id]; if (it.slot !== slot) continue; const v = (it.def || 0) + (it.mult || 0); if (v > bv) { bv = v; best = id; } }
        if (best) G.equip[slot] = best;
      }
      sfx('ui'); saved(); render(); flashPv();
    };
    const oo = $('own-only');
    if (oo) oo.onclick = () => { G.shopOwned = !G.shopOwned; render(); };
    document.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { rosterSort = b.dataset.sort; render(); });
    const br = $('bowratio');
    if (br) br.onchange = () => { G.bowRatio = +br.value; saved(); };
    document.querySelectorAll('[data-ren]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      const r = (G.roster || []).find((x) => x.id === b.dataset.ren);
      if (!r) return;
      const row = b.closest('.rr > div');
      row.innerHTML = `<input id="ren-in" maxlength="6" value="${esc(r.name)}" aria-label="新しい名" style="background:var(--sumi-2);color:var(--washi);border:1px solid var(--line);padding:8px 8px;min-height:44px;box-sizing:border-box;width:7em;font-size:15px"><button class="talkb" id="ren-ok">この名に決める</button>`;
      const inp = $('ren-in'); inp.focus(); inp.select();
      const ok = () => { const v = inp.value.trim().slice(0, 6); if (v) r.name = v; saved(); render(); };
      $('ren-ok').onclick = ok;
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
    // 組の者に声をかける：その者の様子で返事が変わる
    document.querySelectorAll('[data-spk]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      const r = (G.roster || []).find((x) => x.id === b.dataset.spk);
      if (!r || r.spoke === town) return;
      soldierOf(r);
      const L = r.wound === 2 ? ['この傷では、次は槍が上がりませぬ……', '手当てさえ受けられれば、また戦えまする']
        : r.wound === 1 ? ['かすり傷にござる。次も出まする', '少し痛みますが、なんの']
          : r.loyal < 40 ? ['……組頭は、わしらのことを考えておいでか', '在所へ帰ろうかと、考えておりまする']
            : r.loyal >= 75 ? ['組頭の後ろなら、どこまでも付いて行きまする', '次の戦も、組頭の旗の下で']
              : ['次の戦でも、生きて帰りとうござる', '手柄を立てて、在所の母に楽をさせたい', '槍の稽古、欠かしておりませぬ', '組頭、腹が減りました'];
      r.spoke = town; r.loyal = Math.min(100, r.loyal + 3);
      notice(`${r.name}「${L[hashOf(r.id + town) * L.length | 0]}」　忠誠 +3`);
      sfx('ui'); saved(); render();
    });
    document.querySelectorAll('canvas.pmon').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
    document.querySelectorAll('[data-drill]').forEach((b) => b.onclick = () => { for (const r of G.roster || []) if (r.alive && !r.wound) r.drill = Math.min(2, (r.drill || 0) + 1); G.drilled = town; G.actions--; sfx('taiko', 0.5); saved(); render(); });
    // 武具屋の姿見
    const pv = $('pv');
    if (preview) { preview.dispose(); preview = null; }
    if (pv) { preview = new Preview(pv); preview.setLook(G); }
    const rest = $('rest');
    if (rest) rest.onclick = () => { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions--; sfx('ui'); saved(); render(); };
    // 馬屋
    const pvSt = $('pv-st');
    if (pvSt) { const pvs = new Preview(pvSt); pvs.setStep(G, Math.max(2, ladderStep(G))); }
    const stl = $('st-ladder'); if (stl) stl.onclick = () => { sfx('ui'); game.ladder('town'); };
    // 乗り換える前に、いまの馬の絆と名を覚えておく
    const stash = () => { const c = G.horse || { id: 'tsukikage', bond: 0 }; G.horseBonds = { ...(G.horseBonds || {}), [c.id]: c }; };
    document.querySelectorAll('[data-horse]').forEach((b) => b.onclick = () => {
      const id = b.dataset.horse, h = HORSES[id];
      if (G.kan < h.cost) return;
      stash();
      G.kan -= h.cost; G.horses = [...(G.horses || ['tsukikage']), id];
      G.horse = { id, bond: 0 };
      sfx('neigh', 0.7); saved(); render();
    });
    document.querySelectorAll('[data-ride]').forEach((b) => b.onclick = () => {
      const id = b.dataset.ride;
      stash();
      G.horse = G.horseBonds[id] || { id, bond: 0 };
      sfx('neigh', 0.5); saved(); render();
    });
    const care = $('st-care');
    if (care) care.onclick = () => { G.horse = G.horse || { id: 'tsukikage', bond: 0 }; G.horse.bond = Math.min(5, (G.horse.bond || 0) + 1); G.actions--; sfx('neigh', 0.4); saved(); render(); };
    const ren = $('st-rename');
    if (ren) ren.onclick = () => {
      const H = myHorse(G);
      ren.outerHTML = `<input id="st-nm" maxlength="6" value="${esc(H.name)}" aria-label="馬の名" style="width:8em;min-height:44px;box-sizing:border-box;background:var(--sumi-2);color:var(--washi);border:1px solid var(--line);padding:8px;font-size:15px"><button class="btn small primary" id="st-nm-ok">この名に決める</button>`;
      const inp = $('st-nm'); inp.focus(); inp.select();
      const ok = () => { const v = inp.value.trim().slice(0, 6); if (v) { G.horse = { ...(G.horse || { id: 'tsukikage', bond: 0 }), name: v }; saved(); } render(); };
      $('st-nm-ok').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    };
    const go = $('go');
    if (go) go.onclick = () => {
      // 重傷なら、ここで一刻休んで癒やしてから出陣の確かめへ（宿へ回らなくても進めるように）
      if (G.injured) { G.injured = false; for (const r of G.roster || []) if (r.alive && r.wound === 1) r.wound = 0; G.actions = Math.max(0, (G.actions || 0) - 1); saved(); }
      const cheap = Object.keys(ITEMS).some((k) => { const it = ITEMS[k]; return it.cost && !G.owned.includes(k) && it.cost <= G.kan && !(it.minRank && G.rank < it.minRank); });
      if (!confirmGo) { void cheap; confirmGo = true; sfx('ui'); render(); const g2 = $('go2'); if (g2) g2.focus(); return; }
      sfx('ui'); rosterDepart(G); game.nextBattle();
    };
    const go2 = $('go2');
    if (go2) go2.onclick = () => { sfx('ui'); rosterDepart(G); game.nextBattle(); };
    document.querySelectorAll('[data-goto]').forEach((b) => b.onclick = () => { tab = b.dataset.goto; confirmGo = false; sfx('ui'); render(); document.querySelector(`[data-tab="${tab}"]`)?.focus({ preventScroll: true }); });
    const goNo = $('go-no');
    if (goNo) goNo.onclick = () => { confirmGo = false; render(); };
    document.querySelectorAll('[data-talk]').forEach((b) => b.onclick = () => {
      const t = T.find((x) => x.id === b.dataset.talk);
      const c = t.choices[+b.dataset.c];
      const R = relOf(G, t.rel);
      for (const [k, v] of Object.entries(c.fx)) R[k] = Math.max(0, Math.min(100, (R[k] || 0) + v));
      if (c.sup) G.superior = Math.min(100, G.superior + c.sup);
      if (c.join === 'yashichi' && !(G.roster || []).some((r) => r.special === 'yashichi')) {
        G.roster = G.roster || [];
        // 弥七は古参として組に加わる（新参の一人と入れ替え）
        const i = G.roster.findIndex((r) => r.kind === 'spear' && r.battles === 0 && !r.special);
        const y = { id: 'yashichi', name: '弥七', kind: 'spear', battles: 1, kills: 0, alive: true, special: 'yashichi' };
        if (i >= 0) G.roster[i] = y; else G.roster.push(y);
      }
      G.talked[t.id] = c.reply;
      (G.relLog = G.relLog || []).push({ who: t.rel, s: `${TW.TOWNS[town].when}：「${c.t}」と答えた` });
      sfx('ui'); saved(); render();
    });
  };

  // 答えがどう効くか（上官の評価は昇進に要る。人間関係の値）
  const fxHtml = (c) => {
    const parts = [];
    if (c.sup) parts.push(`<i class="up">上官の評価 +${c.sup}</i>`);
    for (const [k, n] of REL_KEYS) { const v = c.fx[k]; if (v) parts.push(`<i class="${(k === 'wary' ? -v : v) > 0 ? 'up' : 'dn'}">${n} ${sgn(v)}</i>`); }
    if (c.join) parts.push('<i class="up">組に加わる</i>');
    return parts.length ? `<span class="fx">${parts.join('')}</span>` : '';
  };
  const talkHtml = (list) => list.map((t) => {
    const done = G.talked[t.id];
    return `<div class="talk">${t.lines.map((l) => `<div><span class="sp">${esc(t.who)}</span>　${esc(l)}</div>`).join('')}
      ${done ? `${(() => { const c = t.choices.find((x) => x.reply === done); return c ? `<div class="tw-said"><span class="sp">${esc(G.name)}</span>　「${esc(c.t)}」${fxHtml(c)}</div>` : ''; })()}<div style="margin-top:6px"><span class="sp">${esc(t.who)}</span>　${esc(done)}</div>` : `<div class="choices">${t.choices.map((c, i) => `<button data-talk="${t.id}" data-c="${i}">「${esc(c.t)}」${fxHtml(c)}</button>`).join('')}</div>`}
    </div>`;
  }).join('');

  render();
  // 初めての城下では、施設を順に案内する
  if (!G.toured) {
    const steps = [
      ['boss', '上官屋敷', '上官の話を聞き、次の任務を受けて出陣する所。戦の道のりもここで見られる。'],
      ['squad', '組', '預かった足軽の名簿。生き残った者は古参となって強くなる。'],
      ['shop', '武具屋', '褒美の金で具足を整える。着けると戦場の姿も変わる。'],
      ['train', '訓練場', '一日二刻まで、稽古で力を伸ばせる。'],
      ['inn', '宿', '傷を癒やし、同輩と話し、噂を聞く。'],
    ];
    let i = 0;
    document.querySelectorAll('.tour').forEach((e) => e.remove());   // 前の案内が残っていれば外す（二重にしない）
    const tour = document.createElement('div');
    tour.className = 'tour';
    document.body.appendChild(tour);
    const stepFn = () => {
      document.querySelectorAll('.tourhl').forEach((e) => e.classList.remove('tourhl'));
      if (i >= steps.length) { tour.remove(); G.toured = true; save(G); return; }
      const [k, t, d] = steps[i];
      const btn = document.querySelector(`[data-tab="${k}"]`);
      if (btn) btn.classList.add('tourhl');
      tour.innerHTML = `<div class="box" role="dialog" aria-label="城下の案内"><b>城下の案内　${i + 1}/${steps.length}　${t}</b>${d}<div class="row" style="margin-top:8px"><button class="btn small" id="tour-skip">案内を閉じる</button><button class="btn primary small" id="tour-next">${i === steps.length - 1 ? '案内を終える' : '次へ'}</button></div></div>`;
      // 案内の札は、光らせた札のすぐ下に置く（本文を隠さない）
      const bx = tour.querySelector('.box');
      if (btn && bx) {
        const r = btn.getBoundingClientRect();
        const w = Math.min(420, innerWidth - 32);
        const left = Math.max(16, Math.min(r.left, innerWidth - w - 16));
        bx.style.left = left + 'px'; bx.style.top = (r.bottom + 12) + 'px';
        bx.style.setProperty('--arrow', Math.max(12, r.left + r.width / 2 - left - 6) + 'px');
      } else if (bx) { bx.style.left = '50%'; bx.style.bottom = '12vh'; bx.style.transform = 'translateX(-50%)'; }
      $('tour-next').onclick = () => { i++; stepFn(); };
      $('tour-skip').onclick = () => { i = steps.length; stepFn(); };
      $('tour-next').focus();
      tour.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); i = steps.length; stepFn(); } };
    };
    stepFn();
  }
}

// ---------------- 記録帳 ----------------
// 桶狭間編でしか取れない称号（ほかの筋書きでは「桶狭間編」と添えるか、並べない）
const TITLE_ONLY = { noHead: ['okehazama', 'oda'], perfect: ['okehazama', 'oda'], drill: ['okehazama', 'oda'] };
const titlesFor = (k) => Object.entries(TITLES).filter(([id]) => !TITLE_ONLY[id] || TITLE_ONLY[id].includes(k));
export function recordsScreen(onBack) {
  const all = loadAll().filter(Boolean);
  const sum = (f) => all.reduce((a, g) => a + (f(g) || 0), 0);
  const titles = new Set(all.flatMap((g) => g.titles || []));
  let dojoBest = 0;
  try { dojoBest = +(localStorage.getItem('sengoku-risshin-dojo') || 0); } catch (e) { /* noop */ }
  // 538：枠ごとに、その枠の筋書きの戦の名で評定を印の列にして並べる
  const slotRow = (g) => {
    const sc = SCENARIOS[g.scenario || 'okehazama'];
    return `<div class="rc-slot"><div class="rc-h"><b>枠${(g.slot || 0) + 1}：${esc(g.name)}</b><small>${esc(sc.name)}・${esc(RANKS[g.rank].name)}・累計戦功 ${g.merit || 0}</small></div>
      <div class="rc-gr">${sc.battles.map((b, i) => { const gr = (g.grades || [])[i]; return `<span class="${gr ? 'on' : ''}"><small>${esc(b.name)}</small><em class="${gr === '甲上' ? 'top' : ''}">${gr || '—'}</em></span>`; }).join('')}</div></div>`;
  };
  show(`<style>
    .rc-slot { border: 1px solid var(--line); padding: 10px 14px; margin: 10px 0; }
    .rc-h { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; } .rc-h b { font-family: var(--display); font-size: 17px; } .rc-h small { color: var(--washi-dim); font-size: 13px; }
    .rc-gr { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .rc-gr span { display: grid; justify-items: center; min-width: 96px; padding: 4px 8px; border: 1px dashed var(--line); color: var(--washi-faint); }
    .rc-gr span.on { border-style: solid; color: var(--washi-dim); }
    .rc-gr small { font-size: 12px; } .rc-gr em { font-style: normal; font-family: var(--display); font-size: 20px; color: var(--washi-dim); }
    .rc-gr span.on em { color: #e38a74; } .rc-gr em.top { color: var(--kin) !important; }
    .titles .only { display: block; font-size: 12px; color: var(--washi-faint); }
  </style><div class="wrap"><div class="eyebrow">記録帳</div><h2 style="font-family:var(--display);font-size:32px;letter-spacing:.1em;margin:8px 0 6px">これまでの戦い</h2>
    <p class="note">三つの保存の枠を合わせた記録です。評定は、戦ごとのいちばん良いものを残しています（甲上・甲・乙・丙）。</p>
    <div class="records">
      <div><b>${sum((g) => g.merit)}</b><small>累計戦功</small></div>
      <div><b>${sum((g) => g.life && g.life.kills)}</b><small>自ら討った敵</small></div>
      <div><b>${sum((g) => g.life && g.life.parries)}</b><small>受け流し</small></div>
      <div><b>${sum((g) => (g.history || []).filter(Boolean).length)}</b><small>戦った数</small></div>
      <div><b>${titles.size}/${Object.keys(TITLES).length}</b><small>得た称号</small></div>
      <div><b>${dojoBest}</b><small>稽古場の最高</small></div>
    </div>
    ${all.map(slotRow).join('') || '<p class="note">まだ記録がありません。タイトルで「出陣する」を選ぶと、ここに戦ごとの評定が並びます。</p>'}
    <div class="eyebrow" style="margin-top:20px">称号</div>
    <div class="titles">${Object.entries(TITLES).map(([id, t]) => `<div class="${titles.has(id) ? 'got' : ''}"><b>${esc(t.name)}</b><small>${esc(t.note)}</small>${TITLE_ONLY[id] ? `<small class="only">${esc(TITLE_ONLY[id].map((k) => SCENARIOS[k].name).join('・'))}で得られる</small>` : ''}</div>`).join('')}</div>
    <button class="btn primary" id="rec-back">戻る</button></div>`, false, (e) => { if (e.key === 'Escape') onBack(); });
  $('rec-back').onclick = onBack;
}

// ---------------- 稽古場の結果 ----------------
// trial：出世の道から先の身分を試したとき（記録は残さない）
export function dojoResult(kills, wave, time, onAgain, onTitle, trial = null, onLadder = null) {
  let best = 0;
  try { best = +(localStorage.getItem('sengoku-risshin-dojo') || 0); } catch (e) { /* noop */ }
  const isBest = trial == null && kills > best;
  if (isBest) { try { localStorage.setItem('sengoku-risshin-dojo', String(kills)); } catch (e) { /* noop */ } }
  show(`<div class="story"><div>
    <div class="year">稽古場　${trial != null ? `${esc(LADDER[trial].name)}の姿で試し（記録なし）` : '腕試し'}</div>
    <h2>${kills} 人</h2>
    <p>第${wave}陣まで耐えた。　${Math.floor(time / 60)}分${String(Math.floor(time % 60)).padStart(2, '0')}秒${trial != null ? '' : isBest ? '<br><b style="color:var(--kin)">これまでの最高を更新した</b>' : `<br>これまでの最高 ${best} 人`}</p>
    <div class="row" style="justify-content:center"><button class="btn primary" id="dj-again">もう一度</button>${onLadder ? '<button class="btn" id="dj-ladder">出世の道へ</button>' : ''}<button class="btn" id="dj-title">タイトルへ</button></div>
  </div></div>`, false, (e) => { if (e.key === 'Enter') onAgain(); });
  $('dj-again').onclick = onAgain;
  $('dj-title').onclick = onTitle;
  if (onLadder) $('dj-ladder').onclick = onLadder;
}

// ---------------- 出世の道 ----------------
// 足軽から天下人までの十段を、登っていく階段で見せる。段を選ぶと、その身分の姿（足軽大将からは馬上）と、できることが分かる
const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function ladderScreen(G, onBack, onTry) {
  const cur = ladderStep({ ...G, trialStep: null });
  const PLAYABLE = 2;   // 検証版で遊べるのは足軽大将（三段目）まで
  let sel = Math.min(LADDER.length - 1, cur + (cur < PLAYABLE ? 1 : 0));
  let pv = null;
  const need = (i) => {
    const r = LADDER[i].ranks[0];
    return r == null ? null : RANKS[r].min;
  };
  const stepState = (i) => (i < cur ? 'done' : i === cur ? 'now' : i === cur + 1 ? 'next' : 'far');
  const render = () => {
    const L = LADDER[sel];
    const st = stepState(sel);
    const n = need(sel);
    const cond = st === 'done' ? '到達済み' : st === 'now' ? 'いまの身分' : sel > PLAYABLE ? 'この先は本編で（姿は稽古場で見られる）' : `累計戦功 ${n} で届く（いま ${G.merit}・あと ${Math.max(0, n - G.merit)}）`;
    // 537：届くまでの道のりを帯でも見せる
    const base0 = RANKS[G.rank].min;
    const bar = (st === 'next' || st === 'far') && sel <= PLAYABLE && n != null ? `<div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${G.merit}" aria-label="${esc(L.name)}までの累計戦功"><i style="width:${Math.min(100, Math.max(0, (G.merit - base0) / Math.max(1, n - base0)) * 100)}%"></i></div><p class="note" style="margin-top:4px">戦ごとの戦功の上限はおよそ160〜230。任務を果たし、組を死なせず、下知を守るほど多く入る。</p>` : '';
    $('ld-detail').innerHTML = `
      <div class="ld-name"><small>${KANSUJI[sel]}の段</small>${esc(L.name)}</div>
      <div class="ld-cmd">率いる兵　<b>${esc(L.cmd)}</b></div>
      <div class="ld-cond st-${st}">${esc(cond)}</div>${bar}
      <div class="ld-cols">
        <div><h5>できること</h5>${L.can.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
        <div><h5>姿</h5>${L.gear.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
      </div>
      <div class="row"><button class="btn" id="ld-back">戻る</button><button class="btn primary" id="ld-try">${sel >= 2 ? '馬上の姿で' : 'この姿で'}稽古場へ</button></div>
      <p class="note">ここで遊んだ事は記録に残りません。←→ で段を選び、Enter で出陣します。Esc で戻ります。</p>`;
    document.querySelectorAll('.ld-step').forEach((el) => { el.classList.toggle('sel', +el.dataset.i === sel); el.setAttribute('aria-pressed', +el.dataset.i === sel); });
    $('ld-try').onclick = () => { dispose(); onTry(sel); };
    $('ld-back').onclick = () => { dispose(); onBack(); };
    if (pv) pv.setStep(G, sel);
  };
  const dispose = () => { if (pv) { pv.dispose(); pv = null; } };
  show(`<style>
    .ladder .ld-bar { height: 8px; background: var(--sumi-3); max-width: 360px; margin: 8px 0 0; position: relative; }
    .ladder .ld-bar i { position: absolute; inset: 0; right: auto; background: var(--kin); }
    .ladder .ld-step .ld-left { color: var(--kin); }
  </style><div class="wrap ladder">
    <div class="eyebrow">出世の道</div>
    <h2 class="ld-title">足軽から、天下人へ</h2>
    <p class="note">いまの身分：<b style="color:var(--kin)">${esc(rankLabel({ ...G, trialStep: null }))}</b>（累計戦功 ${G.merit}）。検証版で遊べるのは足軽大将まで。その先の身分は、姿を見て稽古場で試せます。</p>
    <div class="ld-stair" role="group" aria-label="十の段">${LADDER.map((L, i) => `<button type="button" aria-label="${KANSUJI[i]}の段 ${esc(L.name)}（${esc(L.cmd)}）${stepState(i) === 'now' ? '・いまの身分' : ''}" class="ld-step st-${stepState(i)} ${i > PLAYABLE ? 'beyond' : ''}" data-i="${i}" style="--i:${i}">
        <span class="k">${KANSUJI[i]}</span><b>${esc(L.name)}</b><small>${esc(L.cmd)}</small>${stepState(i) === 'now' ? '<em>いま</em>' : stepState(i) === 'next' ? '<em class="nx">次</em>' : ''}${stepState(i) === 'next' && i <= PLAYABLE && need(i) != null ? `<small class="ld-left">あと ${Math.max(0, need(i) - G.merit)}</small>` : ''}
      </button>`).join('')}<div class="ld-line" aria-hidden="true"><i style="width:${(cur / (LADDER.length - 1)) * 100}%"></i></div></div>
    <div class="ld-body"><div class="ld-look"><canvas class="preview3d" id="ld-pv"></canvas></div><div id="ld-detail"></div></div>
  </div>`, false, (e) => {
    const stepFocus = () => { if (document.activeElement && document.activeElement.classList.contains('ld-step')) document.querySelector(`.ld-step[data-i="${sel}"]`)?.focus(); };
    if (e.key === 'ArrowRight') { sel = Math.min(LADDER.length - 1, sel + 1); sfx('ui'); render(); stepFocus(); }
    else if (e.key === 'ArrowLeft') { sel = Math.max(0, sel - 1); sfx('ui'); render(); stepFocus(); }
    else if (e.key === 'Enter') { e.preventDefault(); dispose(); onTry(sel); }
    else if (e.key === 'Escape') { dispose(); onBack(); }
  });
  document.querySelectorAll('.ld-step').forEach((el) => { el.onclick = () => { sel = +el.dataset.i; sfx('ui'); render(); }; });
  pv = new Preview($('ld-pv'));
  pv.spin = 0.006;
  render();
}

// ---------------- 後日譚とエンディング ----------------
export function epilogueScreen(G, onDone) {
  const vetL = (G.roster || []).filter((r) => r.alive && r.battles >= 2).sort((a, b) => (b.battles - a.battles) || ((b.kills || 0) - (a.kills || 0)));
  const vets = vetL.length;
  // 539：自分の組の者の名を一人添える（いちばん長く付き従った者。弥七がいれば弥七）
  const y = vetL.find((r) => r.special === 'yashichi') || vetL[0];
  const vetName = y ? `中でも${y.name}は${KANSUJI[y.battles - 1] || y.battles}つの戦を共にし、${y.kills ? `${y.kills}人を討った。` : '一度も列を離れなかった。'}` : '';
  const lastB = BATTLES[BATTLES.length - 1] || {};
  const lines = scenarioKey() === 'oda' ? [
    lastB.id === 'honnoji' ? '天正十年六月二日、本能寺と二条御所は焼け落ち、信長と信忠は帰らなかった。' : lastB.id === 'shitaragahara' ? '天正三年五月、設楽原の柵の前で武田の騎馬は崩れ、宿将の多くが帰らなかった。' : `${lastB.name || '戦'}が終わった。`,
    lastB.id === 'honnoji' ? `燃える京を落ちのびた${G.name}は、${RANKS[G.rank].name}として、ただ一つ残った合印の旗を背に、東へ歩いた。` : `桶狭間の雨の中で槍を握った${G.name}は、${RANKS[G.rank].name}として岐阜へ戻った。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、長く共に戦った古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    (G.tomo || []).length ? `供の${G.tomo.map((t) => t.name).join('・')}も、主の後ろを離れなかった。` : '褒美の銭は、いつも組の者の酒と飯に消えた。',
    lastB.id === 'honnoji' ? '十日の後、中国から駆け戻った羽柴秀吉が、山崎で明智光秀を破る。――墨俣で砦を建てていた、あの藤吉郎である。' : '織田家の戦は、まだ続いていく。',
  ] : scenarioKey() === 'nagashino' ? [
    '天正三年八月、諏訪原城は落ち、牧野城と名を改められた。',
    `${G.name}は${RANKS[G.rank].name}として、その城の門をくぐった。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、長篠の籠城からの古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    '長篠で宿将の多くを失った武田家は、ゆっくりと傾いていく。徳川家康は、奥三河と遠江を一つずつ取り戻していった。',
    (G.rel.okubo || {}).like >= 60 ? '大久保忠世は、「あの足軽上がりは、いずれ一軍を率いる」と周りに言ってはばからなかった。' : '鳥居強右衛門の名は、三河の者たちの間で長く語り継がれた。',
  ] : [
    `永禄十年、織田信長は稲葉山城を落とし、城下を岐阜と改めた。`,
    `${G.name}は${RANKS[G.rank].name}として、その軍勢の中にいた。背には、自らの合印の旗が揺れていた。`,
    vets ? `組には、桶狭間の頃からの古参が${vets}人、変わらず付き従っていた。${vetName}` : '組の顔ぶれは変わっても、合印の旗は変わらなかった。',
    G.rel.tokichiro.like >= 60 ? '墨俣で出会った木下藤吉郎は、やがて羽柴秀吉と名を改め、天下へと駆け上がっていく。その傍らで――。' : '墨俣で出会った木下藤吉郎は、やがて羽柴秀吉と名を改めていく。',
  ];
  const st = show(`<div class="story has-ill ${RM() ? 'fast' : ''}"><div style="max-width:640px">
    ${illustHtml(`epilogue:${SCENARIOS[scenarioKey()].mon || 'tokugawa'}:${G.aijirushi || ''}`, 'epi', '結びの一枚：戦の終わった秋、実った田と、合印の旗の立つ城')}
    <div class="year">後日譚</div>
    ${lines.map((t, i) => `<p style="animation-delay:${0.3 + i * 1.1}s">${esc(t)}</p>`).join('')}
    <div class="credits"><div class="roll">
      <b>戦国立身 3D　検証版</b>企画：kaito
      <b>作り</b>Claude（UI/UX・設計・実装）
      <b>道具</b>Three.js／Web Audio／Google Fonts（しっぽり明朝 B1・Zen角ゴシック New）
      <b>甲冑の3Dスキャン</b>"Armadura Samurai Do-maru, BMVB" by Giravolt（CC BY 4.0・形を減らし色を一部変更）
      <b>顔の3Dスキャン</b>Lee Perry-Smith／Infinite-Realities（CC BY 3.0）
      <b>人の骨と動き</b>three.js の見本 Soldier（Mixamo）
      <b>馬の3Dモデル</b>"Horse" by henrysteve973（CC BY 4.0・形と色を一部変更）
      <b>史実の拠り所</b>『信長公記』ほか
      <b>遊んでくれた人</b>${esc(G.name)}
      <b>　</b>ここまで遊んでくださり、ありがとうございました。
    </div></div>
    <button class="btn primary" id="ep-next">最終評価へ</button>
    ${RM() ? '' : '<div class="st-skip">画面を押すと、残りの文をすぐ出します</div>'}
  </div></div>`, false, (e) => { if (e.key === 'Enter') onDone(); });
  const box = st.querySelector('.story');
  box.addEventListener('click', (e) => { if (!e.target.closest('button')) box.classList.add('fast'); });
  mountIllust(st);
  $('ep-next').onclick = onDone;
  $('ep-next').focus({ preventScroll: true });
  sfx('koto', 0.8);
}

// 人間関係：信頼・好感・尊敬・警戒（警戒だけは高いほど悪い）
const REL_COLOR = { trust: 'var(--kin)', like: '#c86a54', respect: '#8fb0e0', wary: 'var(--washi-faint)' };
function relWord(R) {
  if (R.wary >= 50) return '目を付けられている';
  if (R.respect >= 60 && R.trust >= 55) return '一目置かれている';
  if (R.respect >= 55) return '腕を認められている';
  if (R.like >= 65) return '可愛がられている';
  if (R.trust < 40) return 'まだ信を置かれていない';
  return '';
}
const REL_CSS = `<style>
  .rel4 { display: grid; grid-template-columns: 64px repeat(4, 1fr); gap: 4px 10px; align-items: center; margin: 4px 0; font-size: 12px; color: var(--washi-dim); }
  .rel4 > b { font-weight: 500; color: var(--washi); font-size: 13px; }
  .rel4 .m { display: grid; grid-template-columns: 2.4em 1fr 22px; gap: 5px; align-items: center; }
  .rel4 .m i { display: block; height: 5px; background: var(--sumi-3); position: relative; }
  .rel4 .m i b { position: absolute; inset: 0; right: auto; }
  .rel4 .m span { font-variant-numeric: tabular-nums; text-align: right; }
  .rel4 .m.wary.hi span, .rel4 .m.wary.hi small { color: #e38a74; }
  .rel4 small { font-size: 12px; }
  @media (max-width: 900px) { .rel4 { grid-template-columns: 1fr 1fr; } .rel4 > b { grid-column: 1 / -1; margin-top: 6px; } }
</style>`;
function relHtml(G) {
  const who = town_().REL;
  return `${REL_CSS}<div style="margin-top:18px"><div class="eyebrow" style="margin-bottom:6px">人間関係</div>
    <p class="note" style="margin:0 0 6px">尊敬は戦の働きで上がる。警戒は下知破り・言い訳・大口で上がる（警戒だけは低いほどよい）。</p>
    ${who.map(([k, n]) => {
    const R = relOf(G, k);
    const w = relWord(R);
    return `<div class="rel4"><b>${n}${w ? `<small style="display:block;color:var(--washi-faint);font-weight:400">${w}</small>` : ''}</b>${REL_KEYS.map(([rk, rn]) => `<div class="m ${rk} ${rk === 'wary' && R[rk] >= 40 ? 'hi' : ''}"><small>${rn}</small><i><b style="width:${R[rk]}%;background:${REL_COLOR[rk]}"></b></i><span>${R[rk]}</span></div>`).join('')}</div>`;
  }).join('')}</div>`;
}

// ---------------- 最終評価 ----------------
const QUESTIONS = [
  '戦場の一兵士になった感覚があった',
  '合戦後の戦功評価が嬉しかった',
  '昇進が嬉しかった',
  '初めて部下を持った瞬間が面白かった',
  '部隊への指揮が分かりやすかった',
  '次の戦を遊びたくなった',
];

// 戦いぶりの型と、藤吉郎の言葉
function finalWords(G) {
  const L = G.life || {};
  const type = L.parries >= 15 ? ['受けの達人', '敵の攻めを受け流し、隙を突く戦い方'] : (G.titles || []).includes('flank2') ? ['横槍の将', '敵の横腹を見抜き、組ごと突き崩す戦い方']
    : (G.titles || []).includes('allAlive') ? ['兵を惜しむ将', '部下を死なせず、確かに勝つ戦い方'] : L.kills >= 45 ? ['一騎当千', '自ら槍を振るって道を拓く戦い方'] : ['実直な組頭', '下知を守り、務めを果たす戦い方'];
  if (scenarioKey() === 'nagashino') {
    const ok = G.rel.okubo || { like: 50 };
    const okLine = ok.like >= 60 ? '「柵の内で槍を立てておった小僧が、ここまで来たか」' : ok.like >= 45 ? '「次も、しかと務めよ」' : '「……下知は守れ。それだけじゃ」';
    return `<div class="histnote"><b>戦いぶり：${type[0]}</b><br>${type[1]}。</div><div class="histnote" style="border-color:var(--washi-faint)"><b>大久保忠世</b>${okLine}</div>`;
  }
  const tk = G.rel.tokichiro;
  const tkLine = tk.like >= 60 ? '「お主とはいずれ、もっと大きな戦をしたいものじゃ」' : tk.like >= 45 ? '「また墨俣のような働きを頼みますぞ」' : '「……まあ、よろしゅうに」';
  return `<div class="histnote"><b>戦いぶり：${type[0]}</b><br>${type[1]}。</div><div class="histnote" style="border-color:var(--washi-faint)"><b>木下藤吉郎</b>${tkLine}</div>`;
}

// 戦ごとの戦功を折れ線で（上限の目盛りは、その筋書きの戦の上限から決める）
function finalChart(G) {
  const vals = BATTLES.map((b, i) => (G.history[i] ? G.history[i].total : null));
  const W = 570, H = 170, padL = 48, padR = 56, padT = 26, padB = 30;
  const max = Math.ceil(Math.max(100, ...BATTLES.map((b) => b.cap || 0), ...vals.filter((v) => v != null)) / 50) * 50;
  const x = (i) => padL + i * ((W - padL - padR) / Math.max(1, BATTLES.length - 1)), y = (v) => H - padB - (v / max) * (H - padT - padB);
  const pts = vals.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:10px 0" role="img" aria-label="戦ごとの戦功：${BATTLES.map((b, i) => `${esc(b.name)} ${vals[i] ?? 'なし'}`).join('、')}">
    ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(236,228,210,.12)"/><text x="4" y="${y(v) + 4}" fill="#9a9282" font-size="11">${v}</text>`).join('')}
    ${BATTLES.map((b, i) => (b.cap ? `<line x1="${x(i) - 14}" x2="${x(i) + 14}" y1="${y(b.cap)}" y2="${y(b.cap)}" stroke="rgba(194,162,90,.85)" stroke-width="1.5" stroke-dasharray="3 2"/>` : '')).join('')}
    <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#c2a25a" stroke-width="2"/>
    ${vals.map((v, i) => (v === null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#c2a25a"/><text x="${x(i)}" y="${y(v) + 18}" fill="#ece4d2" font-size="12" text-anchor="middle">${v}${(G.grades || [])[i] ? `・${G.grades[i]}` : ''}</text>`)).join('')}
    ${BATTLES.map((b, i) => `<text x="${x(i)}" y="${H - 8}" fill="#b9b09c" font-size="11" text-anchor="middle">${esc(b.name.replace(/の戦い|の決戦/, ''))}</text>`).join('')}
    <text x="${W - padR + 6}" y="${padT - 10}" fill="#9a9282" font-size="10">点線＝上限</text>
  </svg></div>`;
}
// 最終評価の結びの一文（筋書きごと）
function finalLead(G) {
  const n = RANKS[G.rank].squad;
  const k = scenarioKey();
  if (k === 'nagashino') return `長篠城の塀の内で槍を握っていた名もなき足軽は、わずか三月の後、自らの合印を掲げた${n}人を率いて諏訪原の門をくぐった。`;
  if (k === 'okehazama') return `桶狭間で信長の軍旗を見上げていた足軽は、六年の後、自らの合印を掲げた${n}人を率いている。`;
  if (k === 'oda') { const L = BATTLES[BATTLES.length - 1] || {}; const y0 = 1560, y1 = +((String(L.year).match(/（(\d{4})）/) || [])[1] || 1575); return `桶狭間の雨の中で信長の軍旗を見上げていた足軽は、${y1 - y0}年の後、自らの合印を掲げた${n}人を率いて${String(L.name || '').replace(/の戦い$|攻め$|の決戦$|の変$/, '')}にいた。`; }
  return `名もなき足軽は、自らの合印を掲げた${n}人を率いるまでになった。`;
}

export function finalScreen(G, onRestart, onJapan) {
  const rows = BATTLES.map((b, i) => {
    const h = G.history[i];
    const best = (G.best || [])[i];
    return `<div class="tl-row"><div class="b">${esc(b.name)}</div><div class="r">${h ? `戦後の身分：${esc(RANKS[h.rankAfter].name)}${h.promoted ? '（昇進）' : ''}` : '—'}${best && h && best > h.total ? `　・　最高 ${best}` : ''}</div><div class="m">${h ? h.total : '—'}</div></div>`;
  }).join('');
  const eq = ['weapon', 'hat', 'body', 'arm', 'thigh', 'shin'].map((k) => G.equip[k]).filter(Boolean).map((id) => ITEMS[id].name);
  if (G.owned.includes('katana')) eq.push('打刀');
  show(`<div class="wrap">
    <div class="eyebrow">検証版　最終評価</div>
    <h2 style="font-family:var(--display);font-size:clamp(32px,6vw,52px);letter-spacing:.1em;margin:8px 0 6px">${esc(G.name)}、${esc(RANKS[G.rank].name)}となる</h2>
    <p class="lead">${esc(finalLead(G))}</p>
    ${finalChart(G)}
    <div class="timeline">${rows}<div class="tl-row"><div class="b">累計</div><div class="r">上官の評価 ${G.superior}　・　所持金 ${zeni(G.kan)}</div><div class="m">${G.merit}</div></div></div>
    <p class="note">身につけた物：${esc(eq.join('・'))}　／　難易度「${esc((DIFFICULTY[G.difficulty] || DIFFICULTY.normal).name)}」</p>
    <div class="eyebrow" style="margin-top:22px">称号（${titlesFor(scenarioKey()).filter(([id]) => G.titles.includes(id)).length}/${titlesFor(scenarioKey()).length}）</div>
    <div class="titles">${titlesFor(scenarioKey()).map(([id, t]) => `<div class="${G.titles.includes(id) ? 'got' : ''}"><b>${esc(t.name)}</b><small>${esc(t.note)}</small></div>`).join('')}</div>
    ${(G.roster || []).some((r) => r.alive) ? `<p class="note">最後まで付き従った者：${esc(G.roster.filter((r) => r.alive).map((r) => `${r.name}（${r.battles}戦・${r.kills}人）`).join('、'))}</p>` : ''}
    ${finalWords(G)}
    <div class="histnote"><b>この先の道</b><br>本番MVPでは、足軽大将の先――侍大将として数百人を率い、城主として城を築き、やがて大名として国を動かす道が続く。</div>
    ${relHtml(G)}
    <div style="height:30px"></div>
    <div class="eyebrow" style="margin-bottom:6px">試作の検証（1＝そう思わない 〜 5＝とてもそう思う）</div>
    ${QUESTIONS.map((q, i) => `<div class="q"><p>${i + 1}. ${esc(q)}</p><div class="scale">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="q${i}" id="q${i}-${v}" value="${v}" ${G.feedback?.a?.[i] === v ? 'checked' : ''}>${v}</label>`).join('')}</div></div>`).join('')}
    <div class="q"><p>気づいたこと・面白かった瞬間・分かりにくかった点</p><textarea id="fb-note">${esc(G.feedback?.note || '')}</textarea></div>
    <div class="row"><button class="btn primary" id="fb-copy">結果をまとめてコピー</button>${onJapan ? '<button class="btn primary" id="fin-japan">日本地図へ（天下取りの続き）</button>' : ''}<button class="btn" id="restart">最初から遊ぶ</button></div>
    <div id="rs-confirm"></div>
    <pre class="copy" id="fb-out" hidden></pre>
  </div>`);
  const collect = () => {
    const a = QUESTIONS.map((_, i) => { const r = document.querySelector(`input[name="q${i}"]:checked`); return r ? +r.value : null; });
    G.feedback = { a, note: $('fb-note').value };
    save(G);
    const lines = [`戦国立身 検証版 結果 — ${G.name}（${RANKS[G.rank].name}）`];
    BATTLES.forEach((b, i) => { const h = G.history[i]; lines.push(`${b.name}: 戦功 ${h ? h.total : '-'} / 戦後 ${h ? RANKS[h.rankAfter].name : '-'}`); });
    lines.push(`累計戦功 ${G.merit} / 上官評価 ${G.superior}`);
    QUESTIONS.forEach((q, i) => lines.push(`${i + 1}. ${q}: ${a[i] ?? '未回答'}`));
    if (G.feedback.note) lines.push('メモ: ' + G.feedback.note);
    return lines.join('\n');
  };
  document.querySelectorAll('input[type=radio], #fb-note').forEach((el) => el.addEventListener('change', collect));
  $('fb-copy').onclick = () => {
    const text = collect();
    const out = $('fb-out');
    out.hidden = false;
    out.textContent = text;
    const done = () => { $('fb-copy').textContent = 'コピーしました'; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => { $('fb-copy').textContent = '下の文章を選択してコピーしてください'; });
    else $('fb-copy').textContent = '下の文章を選択してコピーしてください';
  };
  if (onJapan) $('fin-japan').onclick = () => { sfx('ui'); onJapan(); };
  $('restart').onclick = () => {
    confirmBox($('rs-confirm'), 'この記録を消して、足軽から始め直します。', '記録を消して始め直す', onRestart);
  };
}

export function helpOverlay(on) {
  if (!on) { hideScreen(); return; }
  show(`<div class="wrap"><div class="eyebrow">操作説明</div><div style="height:14px"></div>${keysHtml()}
    <div style="height:14px"></div><details><summary class="note" style="cursor:pointer">ゲームパッド</summary><div style="height:8px"></div>${keysHtml(true)}</details>
    <div style="height:22px"></div>
    <div class="eyebrow" style="margin-bottom:8px">戦い方のこつ</div>
    <p class="note">敵の頭上に「！」が出たら斬りかかってくる合図。その直前に右クリックで構えると受け流しになり、次の一撃が「反撃」になる。<br>
    照準が朱色になったら槍が届く。Q で狙い定めると相手を見失わない。一度に斬りかかってくる敵は3人まで。</p>
    <div class="eyebrow" style="margin:16px 0 8px">用語集</div>
    <dl class="gloss">
      <dt>足軽</dt><dd>槍や弓を持って集団で戦う歩兵。</dd>
      <dt>組頭</dt><dd>足軽の小隊（組）を率いる者。その上に足軽大将がいる。</dd>
      <dt>合印</dt><dd>味方を見分けるための印。組の指物に付ける。</dd>
      <dt>指物・幟</dt><dd>背中に差す小旗（指物）と、陣に立てる縦長の旗（幟）。</dd>
      <dt>首級</dt><dd>討ち取った敵の首。戦功の証とされたが、桶狭間では「討ち捨て」が命じられた。</dd>
      <dt>槍衾</dt><dd>槍を隙間なく揃えて構え、敵の突進を止める陣形。</dd>
      <dt>先手</dt><dd>軍の最前に立つ部隊。</dd>
      <dt>普請</dt><dd>砦や城の土木工事。</dd>
      <dt>貫</dt><dd>銭の単位。褒美として与えられる。</dd>
    </dl>
    <div class="eyebrow" style="margin:16px 0 8px">戦功の仕組み</div>
    <p class="note">敵足軽の撃破は1戦で最大30点（11人目から半減、21人目以降は0点）。敵侍 +5、敵武将 +30。<br>
    任務達成 +40・味方救援 +20・側面攻撃 +25・部下生存率80%以上 +30 のほうが大きい。命令違反 -15・勝手な追撃 -10。</p>
    <button class="btn" id="help-close">閉じる（H）</button></div>`, true, (e) => { if (e.key === 'Escape') $('help-close')?.click(); });
}

// ---------------- 一時停止メニュー ----------------
export function pauseMenu(el, o) {
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'pm-h');
  el.innerHTML = `<div class="pmenu">
    <h3 id="pm-h">${esc(o.title || '一時停止')}</h3>
    <div class="btns">
      <button class="btn primary" id="pm-resume">再開する${isTouch ? '' : '（Esc）'}</button>
      <button class="btn" id="pm-settings">設定</button>
      <button class="btn" id="pm-help">操作説明</button>
      <button class="btn" id="pm-retry">この戦をやり直す（R）</button>
      <button class="btn" id="pm-title">タイトルへ戻る</button>
    </div>
    <div class="objs"><div class="eyebrow" style="margin-bottom:6px">現在の任務</div>${o.objectives.map((x) => `<div>${x.state === 'done' ? '✓' : x.state === 'fail' ? '✕' : '・'} <b>${esc(x.text)}</b>${x.progress ? `　<small>${esc(x.progress)}</small>` : ''}</div>`).join('') || '—'}
      <div style="height:12px"></div><div>この戦の戦功 <b>${o.merit}</b>　／　経過 ${Math.floor(o.time / 60)}分${String(Math.floor(o.time % 60)).padStart(2, '0')}秒　／　難易度「${esc(o.difficulty || '')}」</div>
      ${o.lines && o.lines.length ? `<div style="margin-top:8px">${o.lines.map((l) => `<div>${esc(l.label)}${l.detail ? `（${esc(l.detail)}）` : ''}　<b>${l.pts > 0 ? '+' : ''}${l.pts}</b></div>`).join('')}<small>部下生存率は戦の終わりに計上されます</small></div>` : ''}</div>
    <div style="grid-column:1/-1;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start"><canvas id="pm-map" width="400" height="400" style="width:220px;height:220px;border:1px solid var(--line)"></canvas>
      ${o.error ? '<div class="objs" style="max-width:320px"><div class="eyebrow">不具合の記録</div><p class="note">不具合が起きていました。作り手に伝えるときは、この内容を写してください。</p><button class="btn small" id="pm-err">不具合の内容を写す</button></div>' : ''}</div>
    <div id="pm-confirm" style="grid-column:1/-1"></div>
    <div id="pm-set" style="grid-column:1/-1"></div>
  </div>`;
  el.querySelector('#pm-resume').onclick = o.resume;
  if (o.hud && o.battle) o.hud.drawMap(el.querySelector('#pm-map'), o.battle, 170, false);
  const pe = el.querySelector('#pm-err');
  if (pe) pe.onclick = () => { navigator.clipboard?.writeText(o.error).then(() => notice('写しました')).catch(() => notice(o.error)); };
  el.querySelector('#pm-help').onclick = o.help;
  el.querySelector('#pm-settings').onclick = () => {
    const box = el.querySelector('#pm-set');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = settingsHtml();
    bindSettings(o.onSettings);
  };
  const box = el.querySelector('#pm-confirm');
  el.querySelector('#pm-retry').onclick = () => confirmBox(box, 'この戦を最初からやり直します。', 'やり直す', o.retry, { sub: 'この戦で得た戦功は消えます。城下までの記録は残ります。' });
  el.querySelector('#pm-title').onclick = () => confirmBox(box, 'タイトルへ戻ります。', 'タイトルへ戻る', o.title2, { sub: 'この戦の進み具合は消えます。城下までの記録は残ります。' });
  el.querySelector('#pm-resume').focus({ preventScroll: true });
  // 戦の中のキー（Tab・Enter・Space）は戦の操作に取られるので、一時停止の札の中ではボタンの操作に戻す
  el.onkeydown = (e) => {
    if (e.key === 'Tab') { e.stopPropagation(); return; }
    const b = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('button, summary');
    if (b) { e.preventDefault(); e.stopPropagation(); b.click(); }
  };
}
