// CSS の :has() を、クラスの付け外しに置き換える（10/24。iPhone の実機で、毎コマの札の書き換えのたびに :has() の照合が走り 4〜5ms 食っていた）。
//   読み込んだ決まり（index.html・screens.css・各戦が足す <style>）の「A:has(X)」を「A.hz-has-N」へ書き換え、
//   「A に当たる要素の中に X があるか」は、DOM が変わった時にだけここで調べてクラスを付け外しする。
//   見た目は前と同じ（同じ要素に同じ決まりが当たる）。毎コマの字の書き換えでは調べ直さない（調べるのは、決まりが名指しする id・クラス・属性・要素が動いた時だけ）。
//   これからの直しで :has() を書いても、ここが自動で置き換える（書く側は気にしなくてよい）。
const PREFIX = 'hz-has-';
const STAT = { rules: 0, sheets: 0, conv: 0, fail: 0, evals: 0, ms: 0 };
if (typeof window !== 'undefined') { window.__hasShim = STAT; window.__hasRules = () => list.map((r) => ({ anchor: r.anchor, inner: r.inner, cls: r.cls })); }
const rules = new Map();   // anchor + '\u0000' + inner → rule
const list = [];
const attrNames = new Set(['class', 'id', 'hidden']);
let observer = null, observing = '';

// 括弧・角括弧・引用符を飛ばして、i の開き括弧に対応する閉じ括弧の位置
function closeOf(s, i) {
  let d = 0, q = '';
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') { d--; if (d === 0) return k; }
  }
  return -1;
}
// 一番外の段のカンマで分ける
function splitTop(s) {
  const out = []; let d = 0, q = '', a = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    else if (c === ',' && d === 0) { out.push(s.slice(a, k)); a = k + 1; }
  }
  out.push(s.slice(a));
  return out.map((x) => x.trim()).filter(Boolean);
}
// :has の直前の複合の選び方（同じ要素を指す部分）の始まり
function anchorStart(s, i) {
  let d = 0;
  for (let k = i - 1; k >= 0; k--) {
    const c = s[k];
    if (c === ')' || c === ']') d++;
    else if (c === '(' || c === '[') {
      if (d > 0) { d--; continue; }
      // :not( や :is( の中の先頭の :has は、外の要素のこと（外へ出て続けて辿る）
      if (s.slice(k + 1, i).trim() === '') continue;
      return k + 1;
    } else if (d === 0 && (c === ' ' || c === '>' || c === '+' || c === '~' || c === ',' || c === '\n' || c === '\t')) return k + 1;
  }
  return 0;
}
// 複合の選び方から、要素を探すための軽い形（要素名・#id・.クラス・[属性]。:疑似は外す）
function liteOf(seg) {
  let out = '', d = 0;
  const m = /^[a-zA-Z][\w-]*|^\*/.exec(seg); if (m) out = m[0] === '*' ? '' : m[0];
  for (let k = m ? m[0].length : 0; k < seg.length; k++) {
    const c = seg[k];
    if (c === '(') { d++; continue; }
    if (c === ')') { d--; continue; }
    if (d !== 0) continue;
    if (c === '#' || c === '.') { const t = /^[#.][\w-]+/.exec(seg.slice(k)); if (t) { out += t[0]; k += t[0].length - 1; } }
    else if (c === '[') { const j = closeOf(seg, k); if (j > 0) { out += seg.slice(k, j + 1); k = j; } }
    else if (c === ':' && seg[k + 1] === ':') break;
  }
  return out || '*';
}
function tokens(sel, r) {
  for (const m of sel.matchAll(/#([\w-]+)/g)) r.ids.add(m[1]);
  for (const m of sel.matchAll(/\.([\w-]+)/g)) r.cls.add(m[1]);
  for (const m of sel.matchAll(/\[\s*([\w-]+)/g)) { r.attrs.add(m[1]); attrNames.add(m[1]); }
  for (const m of sel.matchAll(/(?:^|[\s>+~,(])([a-zA-Z][\w-]*)/g)) r.tags.add(m[1].toLowerCase());
  if (/:(empty|first|last|nth|only)/.test(sel)) r.struct = true;
}
function ruleOf(anchor, inner) {
  const key = anchor + '\u0000' + inner;
  let r = rules.get(key);
  if (r) return r;
  const parts = splitTop(inner).map((p) => {
    const c = p[0];
    if (c === '>') return { k: 1, s: ':scope ' + p };
    if (c === '+') return { k: 2, s: p.slice(1).trim() };
    if (c === '~') return { k: 3, s: p.slice(1).trim() };
    return { k: 0, s: p };
  });
  const id = /^#([\w-]+)$/.exec(anchor);
  r = { cls: PREFIX + list.length, anchor, inner, parts, id: id ? id[1] : null, on: new Set(), ids: new Set(), cls2: null, attrs: new Set(), tags: new Set(), struct: false, bad: false };
  r.cls2 = new Set(); const tk = { ids: r.ids, cls: r.cls2, attrs: r.attrs, tags: r.tags }; tokens(anchor + ' ' + inner, tk); r.struct = tk.struct || false;
  r.bare = /(^|[\s>+~,(])\[/.test(anchor + ' ' + inner);   // 要素名・id・クラスの無い [属性] だけの選び方
  rules.set(key, r); list.push(r); STAT.rules++;
  return r;
}
function test(el, r) {
  for (const p of r.parts) {
    if (p.k === 0 || p.k === 1) { if (el.querySelector(p.s)) return true; }
    else if (p.k === 2) { const n = el.nextElementSibling; if (n && n.matches(p.s)) return true; }
    else for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (n.matches(p.s)) return true;
  }
  return false;
}
function evalRule(r) {
  if (r.bad) return;
  STAT.evals++;
  try {
    const els = r.id ? [document.getElementById(r.id)].filter(Boolean) : document.querySelectorAll(r.anchor);
    const now = new Set();
    for (const el of els) { if (test(el, r)) { now.add(el); if (!el.classList.contains(r.cls)) el.classList.add(r.cls); } }
    for (const el of r.on) if (!now.has(el)) el.classList.remove(r.cls);
    r.on = now;
  } catch (e) { r.bad = true; }
}
// 選び方の文字列の :has(...) を全てクラスへ（中の :has も）
function convert(sel) {
  let i = sel.indexOf(':has('), guard = 0;
  while (i >= 0 && guard++ < 64) {
    const j = closeOf(sel, i + 4);
    if (j < 0) return null;
    const inner = sel.slice(i + 5, j).trim();
    if (inner.includes(':has(')) return null;
    const a = anchorStart(sel, i);
    const r = ruleOf(liteOf(sel.slice(a, i)), inner);
    sel = sel.slice(0, i) + '.' + r.cls + sel.slice(j + 1);
    i = sel.indexOf(':has(');
  }
  return sel;
}
const fresh = [];
function walk(rs) {
  for (const rule of rs) {
    const st = rule.selectorText;
    if (st && st.includes(':has(')) {
      const n0 = list.length, ns = convert(st);
      if (ns) { rule.selectorText = ns; }
      if (rule.selectorText.includes(':has(')) STAT.fail++; else STAT.conv++;
      for (let k = n0; k < list.length; k++) fresh.push(list[k]);
    }
    if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
  }
}
const done = new WeakSet();
function processSheet(sheet) {
  if (!sheet || done.has(sheet)) return;
  let rs; try { rs = sheet.cssRules; } catch (e) { return; }
  done.add(sheet); STAT.sheets++;
  walk(rs);
}
function processAll() {
  for (const sh of document.styleSheets) processSheet(sh);
  for (const sh of document.adoptedStyleSheets || []) processSheet(sh);
}
function flushFresh() {
  if (!fresh.length) return;
  const rs = fresh.splice(0);
  for (const r of rs) evalRule(r);
  observe();
}
function observe() {
  const want = [...attrNames].sort().join(',');
  if (want === observing) return;
  if (observing) observer.disconnect();
  observing = want;
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: [...attrNames] });
}
const dirty = new Set();
// 変わった要素 el（属性 attr が old から変わった。attr が無ければ足し引きされた要素）に関わる決まりへ印を付ける
function touchEl(el, attr, old) {
  const id = el.id, cl = el.classList, tag = el.localName;
  for (const r of list) {
    if (dirty.has(r)) continue;
    let hit = !!(id && r.ids.has(id)) || (attr === 'id' && !!old && r.ids.has(old));
    if (!hit) for (const c of cl) if (r.cls2.has(c)) { hit = true; break; }
    if (!hit && attr === 'class' && old) for (const c of old.split(/\s+/)) if (c && r.cls2.has(c)) { hit = true; break; }
    if (!hit && r.tags.has(tag) && (!attr || attr === 'class' || r.attrs.has(attr))) hit = true;
    if (!hit && attr && r.bare && r.attrs.has(attr)) hit = true;
    if (hit) dirty.add(r);
  }
}
function touchTree(n) {
  if (n.nodeType !== 1) return;
  if (n.localName === 'style' || n.localName === 'link') {
    if (n.sheet) processSheet(n.sheet);
    else if (n.localName === 'link') n.addEventListener('load', () => { processSheet(n.sheet); flushFresh(); }, { once: true });
  }
  touchEl(n, null, null);
  if (n.firstElementChild) for (const c of n.querySelectorAll('[id],[class],style,link')) {
    if (c.localName === 'style' || c.localName === 'link') { if (c.sheet) processSheet(c.sheet); }
    touchEl(c, null, null);
  }
}
function onMut(recs) {
  const t0 = performance.now();
  let structural = false;
  for (const m of recs) {
    if (m.type === 'attributes') {
      if (m.attributeName === 'class' && m.target.classList && onlyOurs(m.oldValue, m.target.className)) continue;
      touchEl(m.target, m.attributeName, m.oldValue);
    } else {
      const t = m.target;
      // <style> の字を差し替えた時は、新しい決まりの束を書き換える
      if (t.localName === 'style') { processSheet(t.sheet); continue; }
      let el = false;
      for (const n of m.addedNodes) if (n.nodeType === 1) { el = true; touchTree(n); }
      for (const n of m.removedNodes) if (n.nodeType === 1) { el = true; touchTree(n); }
      if (el) structural = true;
    }
  }
  if (structural) for (const r of list) if (r.struct) dirty.add(r);
  for (const r of fresh.splice(0)) dirty.add(r);
  if (dirty.size) {
    for (const r of dirty) evalRule(r);
    dirty.clear();
    observer.takeRecords();   // 自分で付け外ししたクラスの知らせは捨てる
    observe();
  }
  STAT.ms += performance.now() - t0;
}
// クラスの変わりが、ここで付け外しする印だけなら調べ直さない
function onlyOurs(a, b) {
  if (a == null) return false;
  const strip = (s) => s.split(/\s+/).filter((c) => c && !c.startsWith(PREFIX)).join(' ');
  return strip(a) === strip(b);
}
export function startHasShim() {
  if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (/[?&]hasshim=0/.test(location.search)) return;
  observer = new MutationObserver(onMut);
  processAll();
  for (const r of list) evalRule(r);
  fresh.length = 0;
  observe();
}
startHasShim();
