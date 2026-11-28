// オンライン対戦の命令の輪（docs/online_cmd_cam_1121.md ④・K590②）。携帯の指で：
//   画面を長押し（0.7 秒・動かさない）か左の釦 → 4武将の札（家紋・名・兵数）が輪に並ぶ → 札を押す → 八つの命令の絵が輪に出る → 押せば出る。
//   長押しで開いた時は、押した所の地面が「ここへ」の行き先・「攻撃／追撃」の狙いの近く。左の釦で開いた時は「ここへ」は出さない。
//   常に出る物は左の小さな釦一つだけ（Simple）。字は武将の名前と兵数だけ（kaito が頼んだ字）。時は止めない。
import { isEn } from '../i18n.js';
import { CMD8, unitCount } from './command.js';

const css = (el, s) => { el.style.cssText = s; return el; };
const svg = (inner, size = 34) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#e6f2ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
// 八つの絵（軍配の下知の絵と同じ形を使う）
const ICON = {
  advance: '<path d="M4 12h13M12 6l6 6-6 6"/>',
  attack: '<path d="M5 19 18 6M15 5l4-1-1 4M19 19 6 6M9 5 5 4l1 4"/>',
  here: '<circle cx="12" cy="10" r="4" fill="#f2c94c" stroke="#f2c94c"/><path d="M12 14v7"/>',
  pursue: '<path d="M3 12h9M8 7l5 5-5 5M12 12h8M16 7l5 5-5 5"/>',
  hold: '<path d="M7 21V4M7 5h10l-3 4 3 4H7"/>',
  defend: '<path d="M4 16h16M6 16l2.5-9M11 16l1-9M16 16l2.5-9"/>',
  rally: '<circle cx="12" cy="12" r="3"/><path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4"/>',
  retreat: '<path d="M20 12H7M12 6l-6 6 6 6"/>',
};
// 戦術の絵：軍配（団扇の形）
const TAC_ICON = '<path d="M12 13c-5 0-8-3-8-7 3-2 13-2 16 0 0 4-3 7-8 7zM12 13v8M9 21h6"/>';
const LABEL = { advance: '前進', attack: '攻撃', here: 'ここへ', pursue: '追撃', hold: '停止', defend: '防御', rally: '再集合', retreat: '退却' };

// getUnits()：[{ id, name, mon, o }]（id 0 が自分の総大将）・pickGround(x, y)：画面の点→地面 {x,z}|null・onCmd(unit, id, arg)
// tacticReady(u)：その武将の固有戦術が今使えるか（使える時は札が金に光り、命令の輪に九つ目の戦術の絵が出る）
export function mountCmdRing({ getUnits, pickGround, onCmd, tacticReady = null, doc = document, hold = 700, canvasSel = 'canvas' }) {
  const root = css(doc.createElement('div'), 'position:fixed;inset:0;z-index:40;display:none;pointer-events:none');
  root.id = 'cmd-ring';
  doc.body.appendChild(root);
  const S = { open: false, cx: 0, cy: 0, at: null, unit: null };
  const R = 84;
  // 輪の半径は数に合わせる（隣どうしの丸い釦の間が 12px 以上＝決まりの 8px に余り）。
  //   輪の中心は画面の端から寄せる：左右は iPhone 横の切り欠き（約 47px）の外、上下は 8px の外に釦が全部入るように。押した所（S.at）は変えない
  const EDGE_X = 48, EDGE_Y = 8;
  const place = (els, r0) => {
    const n = els.length, bw = Math.max(...els.map((b) => b._w)), bh = Math.max(...els.map((b) => b._h));
    const r = n > 1 ? Math.max(r0, (Math.max(bw, bh) + 12) / (2 * Math.sin(Math.PI / n))) : r0;
    const w = doc.documentElement.clientWidth || innerWidth, h = doc.documentElement.clientHeight || innerHeight;
    const cx = Math.max(EDGE_X + r + bw / 2, Math.min(w - EDGE_X - r - bw / 2, S.x0)), cy = Math.max(EDGE_Y + r + bh / 2, Math.min(h - EDGE_Y - r - bh / 2, S.y0));
    S.cx = cx; S.cy = cy;
    els.forEach((b, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; b.style.left = (cx + Math.cos(a) * r - b._w / 2) + 'px'; b.style.top = (cy + Math.sin(a) * r - b._h / 2) + 'px'; });
  };
  // 11/27 cloud-19（司令塔：輪の札が左の目当ての札・下の武将の札・命の札と重なる）：輪が開いている間は、輪の札と釦（周り 8px）に掛かる画面の札を隠し、閉じたら戻す。
  //   開いている間は輪の下地（root・inset:0）が押しを全部受けるので、下の札は押せない。見えなくするだけで、釦も字も足さない
  const hidden = [];
  const unhide = () => { for (const [e, v] of hidden.splice(0)) e.style.visibility = v; };
  const hideUnder = () => {
    unhide();
    const rs = [...root.children].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rs.length) return;
    const W = innerWidth, Hh = innerHeight;
    for (const e of doc.body.querySelectorAll('body *')) {
      if (root.contains(e) || e.contains(root) || e.tagName === 'CANVAS' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
      const r = e.getBoundingClientRect();
      if (!(r.width > 2 && r.height > 2) || r.width * r.height > W * Hh * 0.3) continue;
      if (!rs.some((q) => r.left < q.right + 8 && r.right > q.left - 8 && r.top < q.bottom + 8 && r.bottom > q.top - 8)) continue;
      if (getComputedStyle(e).visibility === 'hidden') continue;
      hidden.push([e, e.style.visibility]); e.style.visibility = 'hidden';
    }
  };
  const clear = () => { while (root.firstChild) root.firstChild.remove(); };
  const cardRects = () => [...doc.querySelectorAll('.mh .mh-bc .mh-card')].filter((e) => { for (let p = e; p && p !== doc.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || (c.visibility === 'hidden' && !hidden.some(([h]) => h === p || h.contains(p)))) return false; } return true; })
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  // 開いている間に札が後から出る（試合の始めの数秒は下の札がまだ隠れている）ので、0.3 秒ごとに一段目の置き方と隠しを見直す
  let watch = 0;
  const rewatch = () => { clearInterval(watch); watch = setInterval(() => { if (!S.open) return clearInterval(watch); if (!S.unit && S.aligned !== cardRects().length) showUnits(); else hideUnder(); }, 300); };
  const close = () => { S.open = false; S.unit = null; clearInterval(watch); clear(); unhide(); root.style.display = 'none'; root.style.pointerEvents = 'none'; };

  // 一段目：4武将の札
  const showUnits = () => {
    clear();
    const els = [];
    for (const u of getUnits()) {
      const n = unitCount(u.o);
      const b = css(doc.createElement('button'), 'position:absolute;width:96px;height:64px;border-radius:7px;border:1.5px solid #fff6;background:rgba(14,18,24,.86);color:#fff;padding:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;font:600 12px/1.15 sans-serif;pointer-events:auto');
      b._w = 96; b._h = 64;
      b.type = 'button'; b.dataset.unit = u.id; b.disabled = !n;
      if (!n) b.style.opacity = '0.4';
      // 戦術が使える時：金の縁と光（色だけに頼らず、角に小さな軍配の印も）
      let tac = false;
      try { tac = !!(n && tacticReady && tacticReady(u)); } catch (e) { tac = false; }
      if (tac) {
        b.dataset.tactic = '1'; b.style.borderColor = '#f2c94c'; b.style.boxShadow = '0 0 10px 3px rgba(242,201,76,.75)';
        const fan = doc.createElement('span'); fan.innerHTML = svg(TAC_ICON, 14).replace('#e6f2ff', '#f2c94c');
        fan.style.cssText = 'position:absolute;right:2px;top:2px;line-height:0'; b.appendChild(fan);
      }
      u._tac = tac;
      // K639 ⑪（kaito 11/22「下の札が数字の棒から急にアイコンに替わる」）：輪の一段目も、下の武将の札（match_hud の mh-card）と同じ形＝名・兵の棒（青）・士気の棒（金）・人数と状態
      const so = u.o, nom = Math.max(1, so?.b?.nominal || n || 1), mor = Math.max(0, Math.min(100, so?.b?.morale ?? 100));
      const ST = { '待機': ['□ ', '控え', 'Hold'], '予備待機': ['□ ', '控え', 'Reserve'], '前進中': ['▶ ', '進軍中', 'Advancing'], '交戦中': ['⚔ ', '戦闘中', 'Fighting'], '動揺': ['！', '動揺', 'Shaken'], '混乱': ['！', '混乱', 'Chaos'], '後退中': ['◀ ', '退却中', 'Falling back'], '敗走': ['✖ ', '潰走', 'Routed'], '再編中': ['↻ ', '立て直し', 'Regrouping'] }[so?.state] || ['', '', ''];
      const bar = (pct, col) => { const o = doc.createElement('span'); o.style.cssText = 'display:block;width:100%;height:6px;margin-top:3px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden'; const i = doc.createElement('i'); i.style.cssText = `display:block;height:100%;width:${pct}%;background:${col}`; o.appendChild(i); return o; };
      const nm = doc.createElement('span'); nm.textContent = u.name || '';
      nm.style.cssText = 'display:block;width:100%;font-size:13px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const ct = doc.createElement('span'); ct.textContent = `${n} ${ST[0]}${isEn() ? ST[2] : ST[1]}`; ct.style.cssText = 'display:block;width:100%;font-size:12px;text-align:left;white-space:nowrap;margin-top:2px';
      b.style.alignItems = 'stretch'; b.style.padding = '4px 5px 5px'; b.style.background = 'rgba(14,18,24,.86)'; b.style.borderRadius = '7px';
      b.append(nm, bar(Math.min(100, n / nom * 100), '#6fb3ff'), bar(mor, '#e8c25a'), ct);
      b.addEventListener('click', (e) => { e.stopPropagation(); S.unit = u; showCmds(); });
      root.appendChild(b); els.push(b);
    }
    // 11/27 cloud-19：画面の下に武将の札（match_hud の mh-card・27 が命の札の上の左へ並べた）があれば、輪の一段目の札をその同じ所・同じ大きさに重ねる
    //   （輪に札を散らすと、目当ての札・命の札・持ち替えの絵と重なった）。札が無い・数が違う時は今まで通り輪に並べる
    const cards = cardRects();
    let capAt = null;
    S.aligned = cards.length;
    if (cards.length === els.length) {
      // 札どうしの間が 8px より狭ければ、輪の札を左右に少し細くして 8px 空ける
      const gap = Math.min(99, ...cards.slice(1).map((r, i) => Math.max(Math.abs(r.left - cards[i].right), Math.abs(r.top - cards[i].bottom) < 2 ? 99 : 0)));
      const ins = gap < 8 ? Math.ceil((8 - gap) / 2) : 0;
      els.forEach((b, i) => { const r = cards[i]; b.style.left = (r.left + ins) + 'px'; b.style.top = r.top + 'px'; b.style.width = (r.width - ins * 2) + 'px'; b.style.height = Math.max(44, r.height) + 'px'; });
      const top = Math.min(...cards.map((r) => r.top)), l = Math.min(...cards.map((r) => r.left)), rr = Math.max(...cards.map((r) => r.right));
      capAt = { x: (l + rr) / 2, y: top - 8 - 11 };
    } else place(els, R);
    // 何の札か一目で：輪の真ん中（札の並びに重ねた時は並びの上）に「命令を出す武将」の題（二段目は軍配の絵の釦が並ぶ）
    const cap = css(doc.createElement('div'), 'position:absolute;transform:translate(-50%,-50%);padding:3px 10px;border-radius:10px;background:rgba(12,22,34,.85);color:#e6f2ff;font:700 13px/1.2 sans-serif;white-space:nowrap;pointer-events:none');
    cap.textContent = isEn() ? 'Pick a commander' : '命令を出す武将'; cap.style.left = (capAt ? capAt.x : S.cx) + 'px'; cap.style.top = (capAt ? capAt.y : S.cy) + 'px'; root.appendChild(cap);
    hideUnder();
  };
  // 二段目：八つの命令（地面の点が無い時は「ここへ」を出さない）
  const showCmds = () => {
    clear();
    const els = [];
    for (const c of CMD8) {
      if (c.at && !S.at) continue;
      const b = css(doc.createElement('button'), 'position:absolute;width:52px;height:52px;border-radius:26px;border:2px solid #e6f2ff;background:rgba(12,22,34,.92);padding:0;pointer-events:auto;display:flex;align-items:center;justify-content:center');
      b._w = 52; b._h = 52;
      b.type = 'button'; b.dataset.cmd = c.id; b.setAttribute('aria-label', LABEL[c.id]);
      b.innerHTML = svg(ICON[c.id]);
      b.addEventListener('click', (e) => { e.stopPropagation(); const u = S.unit, at = S.at; close(); onCmd(u, c.id, at ? { at } : {}); });
      root.appendChild(b); els.push(b);
    }
    // 九つ目：固有戦術（使える時だけ）。金の縁
    if (S.unit && S.unit._tac) {
      const b = css(doc.createElement('button'), 'position:absolute;width:52px;height:52px;border-radius:26px;border:2px solid #f2c94c;background:rgba(40,30,8,.94);box-shadow:0 0 10px 3px rgba(242,201,76,.6);padding:0;pointer-events:auto;display:flex;align-items:center;justify-content:center');
      b._w = 52; b._h = 52;
      b.type = 'button'; b.dataset.cmd = 'tactic'; b.setAttribute('aria-label', '戦術');
      b.innerHTML = svg(TAC_ICON).replace('#e6f2ff', '#f2c94c');
      b.addEventListener('click', (e) => { e.stopPropagation(); const u = S.unit, at = S.at; close(); onCmd(u, 'tactic', at ? { at } : {}); });
      root.appendChild(b); els.push(b);
    }
    place(els, R);
    hideUnder();
  };
  const open = (x, y, withGround) => {
    const w = doc.documentElement.clientWidth || innerWidth, h = doc.documentElement.clientHeight || innerHeight;
    S.x0 = x; S.y0 = y; S.cx = x; S.cy = y;
    S.at = withGround && pickGround ? pickGround(x, y) : null;
    S.open = true; root.style.display = 'block'; root.style.pointerEvents = 'auto';
    showUnits(); rewatch();
  };
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });   // 輪の外を押せば閉じる

  // 画面の長押し：動かさず 0.7 秒。指が動けば（見回し・歩き）取り消す
  let timer = null, start = null;
  const down = (e) => {
    if (S.open || (e.button && e.button !== 0)) return;
    if (!(e.target && e.target.closest && e.target.closest(canvasSel))) return;
    if (e.pointerType === 'mouse') return;   // パソコンの押しっぱなし（見回し）で勝手に出さない。左の［命令］釦から
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => { if (start) open(start.x, start.y, true); start = null; }, hold);
  };
  const move = (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) { clearTimeout(timer); start = null; } };
  const up = () => { clearTimeout(timer); start = null; };
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', up, true);
  // 左の釦（長押しが難しい時の入口）
  const btn = css(doc.createElement('button'), 'position:fixed;left:max(8px, env(safe-area-inset-left));top:200px;width:56px;height:56px;border-radius:28px;border:2px solid #79b9eb;background:rgba(12,39,69,.9);padding:0;z-index:30;pointer-events:auto;display:flex;align-items:center;justify-content:center');
  btn.id = 'cmd-ring-btn'; btn.type = 'button'; btn.setAttribute('aria-label', '命令');
  btn.innerHTML = svg('<path d="M12 3v18M6 7c3-2 9-2 12 0M7 7l-2 6h6zM17 7l-2 6h6z"/>', 36);
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (S.open) close(); else { const r = btn.getBoundingClientRect(); open(r.right + R + 50, r.top + 22, false); } });
  doc.body.appendChild(btn);
  return { root, btn, open, close, state: S, dispose() { close(); clearTimeout(timer); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true); root.remove(); btn.remove(); } };
}
