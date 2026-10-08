// 用語はここだけで管理する。札を作り直した時だけ印を付け、毎コマは調べない。
const TERMS = [
  ['足軽', 'あしがる', '槍や弓、鉄砲を持ち、歩いて集団で戦う兵。'],
  ['組頭', 'くみがしら', '足軽の小さな集まりである「組」を率いる人。'],
  ['足軽大将', 'あしがるたいしょう', 'いくつもの足軽の組をまとめ、戦いを指揮する人。'],
  ['侍大将', 'さむらいたいしょう', '侍や足軽を率いる、部隊の大将。'],
  ['下知', 'げち', '上の立場の人が出す命令。'],
  ['殿', 'しんがり', '退く味方のいちばん後ろを守る部隊。人の名に付く「殿」は敬う呼び方。'],
  ['殿軍', 'でんぐん', '退く味方の後ろを守り、敵を食い止める部隊。'],
  ['備', 'そなえ', '槍や鉄砲などの兵をまとめた、ひとまとまりの部隊。'],
  ['備え', 'そなえ', '槍や鉄砲などの兵をまとめた部隊。「備えを固める」は守りを整えること。'],
  ['赤備え', 'あかぞなえ', '赤い甲冑や旗でそろえた部隊。'],
  ['曲輪', 'くるわ', '土の壁や石垣、堀で囲んだ、城の中の区画。'],
  ['虎口', 'こぐち', '城や砦の出入り口。敵を通しにくくする工夫がある。'],
  ['知行', 'ちぎょう', '働きへの褒美として、領地やそこからの収入を与えられること。'],
  ['与力', 'よりき', '大将を助けるため、その指揮の下に付けられた武士。'],
  ['朱印状', 'しゅいんじょう', '赤い印を押した文書。領地や許しを正式に伝える。'],
  ['合印', 'あいじるし', '味方を見分けるため、旗や身につける物に付ける印。'],
  ['指物', 'さしもの', '誰の兵かを示すため、背中に差す小さな旗などの印。'],
  ['幟', 'のぼり', '部隊の目印として立てる、縦に長い旗。'],
  ['首級', 'しゅきゅう', '討ち取った敵の首。戦での手柄を示す証とされた。'],
  ['槍衾', 'やりぶすま', '槍をすき間なく並べ、敵の突進を止める構え。'],
  ['先手', 'さきて', '軍の先頭に立ち、先に敵と戦う部隊。'],
  ['普請', 'ふしん', '城や砦、堀などを作ったり直したりする工事。'],
  ['兵糧', 'ひょうろう', '戦や行軍に備えて用意する、兵の食べ物。'],
  ['戦功', 'せんこう', '戦であげた手柄。任務を果たすことや味方を助けることも含む。'],
  ['石高', 'こくだか', '領地の豊かさを、取れる米の量に置き換えて表した数。'],
  ['貫', 'かん', '銭を数える単位。この遊びでは、買い物や褒美の金額に使う。'],
];
const byName = new Map(TERMS.map((t) => [t[0], t]));
const words = new RegExp([...byName.keys()].sort((a, b) => b.length - a.length).join('|'), 'g');
const skip = 'button, a, input, textarea, select, option, label, summary, script, style, svg, canvas, dialog, [contenteditable], [role="button"], [role="tab"], [data-no-glossary], #subtitle';
let dialog = null, opener = null, beforeOpen = null;

export function glossaryDialog() { return dialog?.open ? dialog : null; }
export function setGlossaryBeforeOpen(fn) { beforeOpen = fn; }

const style = document.createElement('style');
style.textContent = `
button.word-help { display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:44px; margin:4px; padding:0 4px; border:0; border-bottom:1px solid #c2a25a; border-radius:0; background:#14120f; color:#ece4d2; font:inherit; line-height:1.3; letter-spacing:inherit; vertical-align:middle; cursor:pointer; pointer-events:auto; }
#subtitle .sp button.word-help { box-sizing:border-box; max-width:calc(100% - 8px); white-space:normal; overflow-wrap:anywhere; }
dialog.word-dialog { margin:auto; max-width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); overflow-wrap:anywhere; }
button.word-help:hover, button.word-help:active { background:#302b22; }
/* 巻物では本文と同じ字にする。上下の押す余白だけを行の外へ広げる。 */
.eval .ek button.word-help { display:inline-block; box-sizing:content-box; min-height:0; min-width:0; padding:max(0px, calc((44px - 1lh) / 2)) 0; margin:min(0px, calc((1lh - 44px) / 2)) 0; border:0; background:transparent; color:inherit; line-height:inherit; vertical-align:baseline; text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:3px; }
.eval .ek button.word-help:hover, .eval .ek button.word-help:active { background:transparent; text-decoration-thickness:2px; }
.word-help:focus-visible, .word-dialog :focus-visible { outline:3px solid #c2a25a; outline-offset:2px; box-shadow:0 0 0 5px #14120f; }
dialog.word-dialog { box-sizing:border-box; width:min(560px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; border:1px solid #c2a25a; padding:16px; background:#14120f; color:#ece4d2; font:16px/1.7 var(--ui); z-index:100; }
.word-dialog::backdrop { background:rgba(0,0,0,.7); }
.word-dialog h2 { font-size:24px; margin:0 0 8px; }
.word-dialog p { margin:8px 0 16px; }
.word-dialog .word-actions { position:sticky; top:0; z-index:1; display:flex; flex-wrap:wrap; gap:8px; padding:8px 0; margin-bottom:8px; background:#14120f; }
.word-dialog .btn { min-height:44px; }
.word-dialog small { display:block; font-size:13px; color:#b9b09c; }
.word-dialog input { box-sizing:border-box; width:100%; min-height:44px; padding:8px; margin:8px 0 16px; background:#242019; color:#ece4d2; border:1px solid #b9b09c; font:inherit; }
.word-dialog details { border-bottom:1px solid #9a9282; margin-bottom:8px; }
.word-dialog summary { min-height:44px; cursor:pointer; padding:4px 8px; box-sizing:border-box; }
.word-dialog details p { padding:0 8px; }
`;
document.head.appendChild(style);

export function decorateTerms(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE || root.closest(skip)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest(skip)) continue;
    words.lastIndex = 0;
    if (words.test(node.data)) nodes.push(node);
  }
  for (const text of nodes) {
    const value = text.data;
    words.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let end = 0, match;
    while ((match = words.exec(value))) {
      const name = match[0], at = match.index;
      if (name === '備え' || name === '備' && value[at + name.length] === 'え') continue;
      // 「装備」「備前」「信長殿」など、別の意味の字には印を付けない。
      if ((name === '備' || name === '殿') && (/[一-龯々]/.test(value[at - 1] || '') || /[一-龯々]/.test(value[at + name.length] || ''))) continue;
      frag.append(value.slice(end, at));
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'word-help'; button.dataset.word = name;
      button.textContent = name; button.setAttribute('aria-label', `${name}の意味を読む`);
      frag.append(button); end = at + name.length;
    }
    if (!end) continue;
    frag.append(value.slice(end)); text.replaceWith(frag);
  }
}

// 戦の札は hud.js の差分更新から呼ぶ。ここで見張るのは、時の止まった画面だけ。
export function watchGlossaryScreens() {
  const roots = ['screen', 'pause'].map((id) => document.getElementById(id)).filter(Boolean);
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    const changed = new Set();
    for (const r of records) {
      if (r.type === 'characterData') changed.add(r.target.parentElement);
      else for (const n of r.addedNodes) changed.add(n.nodeType === Node.TEXT_NODE ? n.parentElement : n);
    }
    for (const root of changed) if (root?.isConnected) decorateTerms(root);
    observe();
  });
  const observe = () => { for (const root of roots) observer.observe(root, { childList:true, subtree:true, characterData:true }); };
  for (const root of roots) decorateTerms(root);
  observe();
}

export function openGlossary(name = null) {
  if (name && !byName.has(name)) return;
  if (!glossaryDialog()) {
    opener = document.activeElement;
    beforeOpen?.();
    dialog = document.createElement('dialog');
    dialog.className = 'word-dialog'; dialog.setAttribute('aria-labelledby', 'word-heading');
    dialog.addEventListener('close', () => {
      dialog.remove(); dialog = null;
      const fromBattle = opener?.closest('#hud') && !document.getElementById('pause')?.hidden;
      const target = !fromBattle && opener?.isConnected && opener.offsetParent !== null ? opener : document.getElementById('pm-resume');
      target?.focus({ preventScroll:true }); opener = null;
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  }
  dialog.replaceChildren();
  const heading = document.createElement('h2'); heading.id = 'word-heading';
  heading.textContent = name || '用語集'; dialog.appendChild(heading);
  const note = document.createElement('p');
  if (name) {
    const term = byName.get(name), reading = document.createElement('small');
    reading.textContent = term[1]; dialog.appendChild(reading);
    note.textContent = term[2]; dialog.appendChild(note);
  } else {
    note.textContent = '言葉を押すと意味が読めます。画面の下線のある言葉も押せます。'; dialog.appendChild(note);
    const label = document.createElement('label'); label.htmlFor = 'word-search'; label.textContent = '言葉や読みで探す'; dialog.appendChild(label);
    const search = document.createElement('input'); search.id = 'word-search'; search.type = 'search'; dialog.appendChild(search);
    const list = document.createElement('div'); dialog.appendChild(list);
    for (const [word, reading, meaning] of TERMS) {
      const entry = document.createElement('details'), title = document.createElement('summary'), body = document.createElement('p');
      title.textContent = `${word}（${reading}）`; body.textContent = meaning;
      entry.dataset.search = word + reading; entry.append(title, body); list.appendChild(entry);
    }
    const empty = document.createElement('p'); empty.textContent = '見つかりません。短い言葉で探してください。'; empty.hidden = true; empty.setAttribute('role', 'status'); dialog.appendChild(empty);
    search.oninput = () => {
      const key = search.value.trim().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
      let count = 0;
      for (const entry of list.children) { entry.hidden = !entry.dataset.search.includes(key); if (!entry.hidden) count++; }
      empty.hidden = count > 0;
    };
  }
  const actions = document.createElement('div'); actions.className = 'word-actions';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = '閉じる'; close.onclick = () => dialog.close(); actions.appendChild(close);
  if (name) {
    const all = document.createElement('button'); all.type = 'button'; all.className = 'btn'; all.textContent = '用語集を開く'; all.onclick = () => openGlossary(); actions.appendChild(all);
  }
  dialog.insertBefore(actions, heading.nextSibling); dialog.scrollTop = 0;
  (name ? close : dialog.querySelector('input')).focus({ preventScroll:true });
}

// 下の札の「会話を開く」まで同時に押さない。
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button[data-word]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation(); button.focus({ preventScroll:true }); openGlossary(button.dataset.word);
}, true);
window.addEventListener('keydown', (event) => {
  if (!glossaryDialog()) return;
  event.stopImmediatePropagation();
  if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
}, true);
