// ======================================================================
// オンライン対戦の「布陣」の画面（K585・61〜72・11/21 クラウド24）
//   試合の前に戦場を上から見る（ここだけは三人称でなく戦術の地図）。自陣側 30% の区域に、4武将の駒を指で置き、指でなぞって向きを決める。
//   総大将の駒には本陣の印。本陣は決まった区域（後方・中央・側方）の中だけに置ける。
//   編成（コスト・兵種の型・陣形の選び）は hensei_ui.js（cloud-48）。この画面は『4武将の配列』を受け取り、置き場と向きを足して返す。
// 使い方：
//   const ui = mountFujin(root, { generals: ['信長', '柴田', …] か [{ id, name, troops, formation, color }]（hensei_ui.js の手持ちは名前の文字列）, map: { w: 400, h: 300 }, lang: 'ja', onChange, onDone(layout, state) });  // layout＝試合（match.js）へ渡す [{name,pos,facing,jin,honjin}]
//   ui.state() → { generals: [{ id, name, troops, formation, pos: {x,z}, facing, honjin }], honjin: '後方' }
//   ui.destroy()
// 筋書き（ソロ）の戦は変えない。ここは online/ の中だけで完結し、道具の試しは tools/online_fujin.test.mjs（描かない）。
// ======================================================================

const TEXT = {
  ja: { title: '布陣', own: '自陣', honjin: '本陣', go: 'この布陣で出陣', reset: '置き直す', hint: '駒を指で動かし、矢じりをなぞって向きを決める。下の釦で陣形', zone: { 後方: '後方', 中央: '中央', 側方: '側方' }, ok: '置けた', need: '本陣の区域に置いてください' },
  en: { title: 'Deployment', own: 'Your side', honjin: 'HQ', go: 'Deploy and march', reset: 'Reset', hint: 'Drag a piece to place it, drag the arrowhead to face it. Pick a formation below', jin: { 横陣: 'Line', 縦陣: 'Column', 魚鱗: 'Fish-scale', 鶴翼: 'Crane wing', 長蛇: 'Long snake', 方円: 'Ring' }, zone: { 後方: 'Rear', 中央: 'Center', 側方: 'Flank' }, ok: 'Placed', need: 'Place the HQ inside an HQ zone' },
};

// ---- 描かない決まり（試しはここだけ読む） ----------------------------------------------------------

/** 自陣側 30% の長方形。side='south' は +z 側（画面の下）、'north' は −z 側（上）。地図の中心が原点。 */
export function ownZone(map, side = 'south', ratio = 0.3) {
  const w = map.w, h = map.h, d = h * ratio;
  return side === 'north' ? { x0: -w / 2, x1: w / 2, z0: -h / 2, z1: -h / 2 + d } : { x0: -w / 2, x1: w / 2, z0: h / 2 - d, z1: h / 2 };
}

/** 本陣の区域（名前つき・最適が一つにならない）。自陣の中の相対で、後方＝奥の真ん中・中央＝前の真ん中・側方＝左の奥。 */
export function honjinZones(map, side = 'south') {
  const z = ownZone(map, side), w = z.x1 - z.x0, d = z.z1 - z.z0, south = side !== 'north';
  const back = (a, b) => (south ? { z0: z.z1 - d * b, z1: z.z1 - d * a } : { z0: z.z0 + d * a, z1: z.z0 + d * b });
  return [
    { name: '後方', x0: z.x0 + w * 0.3, x1: z.x0 + w * 0.7, ...back(0, 0.45) },
    { name: '中央', x0: z.x0 + w * 0.3, x1: z.x0 + w * 0.7, ...back(0.55, 1) },
    { name: '側方', x0: z.x0 + w * 0.02, x1: z.x0 + w * 0.22, ...back(0, 0.7) },
  ];
}

export function clampToRect(p, r, pad = 0) {
  return { x: Math.min(r.x1 - pad, Math.max(r.x0 + pad, p.x)), z: Math.min(r.z1 - pad, Math.max(r.z0 + pad, p.z)) };
}

export function zoneAt(zones, p) {
  return zones.find((q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1) || null;
}

/** 向き（ラジアン・+z が 0・x が正で π/2。ゲームの heading と同じ）。駒の中心から指の位置へ。近すぎれば前の向きのまま。 */
export function facingFrom(center, finger, prev = 0) {
  const dx = finger.x - center.x, dz = finger.z - center.z;
  return Math.hypot(dx, dz) < 1e-6 ? prev : Math.atan2(dx, dz);
}

/** 駒どうしが重ならないように押し分ける（最小の間 gap）。固定する駒 idx は動かさない。 */
export function separate(pieces, zone, gap, fixed = -1) {
  const ZS = 0.35;   // 自陣は浅い帯（奥行き30%）。前後には離れにくいので、前後のずれは軽く見て横へ押し分ける（実際の間は d' 以上）
  for (let it = 0; it < 12; it++) {
    let moved = false;
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i].pos, b = pieces[j].pos; let dx = b.x - a.x, dz = (b.z - a.z) * ZS, d = Math.hypot(dx, dz);
      if (d >= gap) continue;
      const share = fixed === i || fixed === j ? 1 : 2;
      if (Math.abs(dx) < gap * 0.3) {   // ほぼ縦に並んだ二つは、横へ割る（前後には逃げ場が無い）：横に必要な間 = √(gap² − dz²)
        const sg = dx === 0 ? (j % 2 ? 1 : -1) : Math.sign(dx), need = Math.sqrt(Math.max(0, gap * gap - dz * dz)), push = (need - Math.abs(dx)) / share;
        if (fixed !== j) b.x += sg * push;
        if (fixed !== i) a.x -= sg * push;
      } else {
        const push = (gap - d) / share, ux = dx / d, uz = dz / d / ZS;
        if (fixed !== j) { b.x += ux * push; b.z += uz * push; }
        if (fixed !== i) { a.x -= ux * push; a.z -= uz * push; }
      }
      moved = true;
    }
    for (const p of pieces) p.pos = clampToRect(p.pos, zone, 3);
    if (!moved) break;
  }
}

/** はじめの並び：自陣の前縁に一列。総大将（先頭）は本陣の『後方』の真ん中。向きは敵（反対側）へ。 */
export function defaultLayout(generals, map, side = 'south') {
  const z = ownZone(map, side), zs = honjinZones(map, side), south = side !== 'north';
  const face = south ? Math.PI : 0;   // 南の自陣は −z（北）を向く。atan2(dx,dz)=π が −z
  const n = generals.length, w = z.x1 - z.x0, frontZ = south ? z.z0 + (z.z1 - z.z0) * 0.25 : z.z1 - (z.z1 - z.z0) * 0.25;
  // K592（11/21）：役（hensei の ROLES＝総大将・左翼・右翼・後詰）の通りに置く。前は一列に順に並べ、左翼が敵へ向いた時の右に出て、後詰が前の端に出た。
  //   敵へ向いた時の左：南の自陣（−z を向く）は −x、北の自陣（+z を向く）は +x。画面では どちらも左に出る（sx の flip）
  const L = south ? -1 : 1, backZ = south ? z.z1 - (z.z1 - z.z0) * 0.12 : z.z0 + (z.z1 - z.z0) * 0.12;
  const ROLE = [null, { x: L * w * 0.3, z: frontZ }, { x: -L * w * 0.3, z: frontZ }, { x: -L * w * 0.2, z: backZ }];
  return generals.map((g, i) => {
    if (i === 0) { const q = zs[0]; return { ...g, pos: { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 }, facing: face, honjin: true }; }
    if (n === 4 && ROLE[i]) return { ...g, pos: { ...ROLE[i] }, facing: face, honjin: false };
    const k = i - 1, m = n - 1;
    return { ...g, pos: { x: z.x0 + w * ((k + 1) / (m + 1)), z: frontZ }, facing: face, honjin: false };
  });
}

/** 置けたか。総大将の駒が本陣の区域の中。返すのは { ok, honjin: 区域の名前 or null }。 */
export function validate(pieces, map, side = 'south') {
  const hq = pieces.find((p) => p.honjin), zone = hq ? zoneAt(honjinZones(map, side), hq.pos) : null;
  return { ok: !!zone, honjin: zone ? zone.name : null };
}

// ---- 画面（DOM と canvas。指で動かす） -------------------------------------------------------------

import { LANG, tr } from '../i18n.js';

const JIN_NAMES = ['横陣', '縦陣', '魚鱗', '鶴翼', '長蛇', '方円'];   // online/jinkei6.js の JIN と同じ名（試しでは読み込まない）
const PALETTE = ['#7a1f1a', '#25507a', '#2f6a3a', '#6a4a1f'];

/** 編成の画面（hensei_ui.js）の手持ちは名前の文字列。オブジェクトに直す。 */
export function normalizeGenerals(list) {
  return (list || []).map((g, i) => (typeof g === 'string' ? { id: g, name: g } : { ...g })).map((g, i) => ({ id: g.id ?? g.name, name: g.name, troops: g.troops ?? 1000, formation: JIN_NAMES.includes(g.formation) ? g.formation : '横陣', color: g.color || PALETTE[i % PALETTE.length] }));
}

/** 試合（match.js の rosterOf）へ渡す並び。武将の順のまま [{name, pos:{x,y}, facing, jin, honjin}]。
 *  置き場 pos は【一つの書き方】＝メートル・地図の左上が (0,0)・y は『match の世界の z + h/2』（match.js は x−w/2、y−h/2 で真ん中が原点の世界へ戻す）。
 *  自陣は y の小さい側（match の世界の −z）＝match の既定の自分の側と同じ。{x,z} では渡さない（33 の読み違いの元）。 */
export function toLayout(state, map = { w: 400, h: 300 }) {
  return state.generals.map((g) => ({ name: g.name, pos: { x: +(g.pos.x + map.w / 2).toFixed(2), y: +(g.pos.z + map.h / 2).toFixed(2) }, facing: g.facing, jin: g.formation, honjin: g.honjin }));
}

export function mountFujin(root, opts) {
  const map = opts.map || { w: 400, h: 300 };
  const side = 'north';   // この画面の中の世界は match の世界と同じ向き（自陣は −z・敵は +z・向き 0 は +z）。画面では自陣が下に出る。opts.side は使わない
  const L = TEXT[(opts.lang || LANG) === 'en' ? 'en' : 'ja'];   // ゲームの言語の設定（i18n.js）に合わせる。日本語の時は英語の字を出さない
  const gens = normalizeGenerals(opts.generals);
  let pieces = defaultLayout(gens, map, side), sel = 0, drag = null;
  const zone = ownZone(map, side), zones = honjinZones(map, side);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;background:#1b2a1c;color:#f3ecd8;font:15px/1.4 sans-serif;touch-action:none;user-select:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;min-height:44px';
  const title = document.createElement('div'); title.textContent = L.title; title.style.cssText = 'font-weight:700;flex:1';
  const status = document.createElement('div'); status.style.cssText = 'font-size:12px;opacity:.85';
  const btn = (txt, strong) => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = `min-height:44px;min-width:44px;padding:0 14px;border-radius:8px;border:1px solid #c9b27a;background:${strong ? '#8a2a1f' : 'transparent'};color:#f3ecd8;font-size:15px`; return b; };
  const sty = document.createElement('style');
  sty.textContent = '@keyframes fujinGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,233,168,.0),0 0 6px 1px rgba(255,233,168,.35)}50%{box-shadow:0 0 0 4px rgba(255,233,168,.28),0 0 18px 6px rgba(255,233,168,.75)}}.fujin-go.on{animation:fujinGlow 1.6s ease-in-out infinite;border-color:#ffe9a8!important}@media (prefers-reduced-motion:reduce){.fujin-go.on{animation:none;box-shadow:0 0 0 3px rgba(255,233,168,.8)}}';
  wrap.appendChild(sty);
  const bReset = btn(L.reset, false), bGo = btn(L.go, true); bGo.classList.add('fujin-go');
  bar.append(title, status, bReset, bGo);
  const cv = document.createElement('canvas'); cv.style.cssText = 'flex:1;width:100%;min-height:0';
  const jinRow = document.createElement('div'); jinRow.style.cssText = 'display:flex;gap:8px;padding:0 12px 6px;overflow-x:auto';
  const jinBtns = JIN_NAMES.map((n) => { const b = document.createElement('button'); b.textContent = L.jin?.[n] || n; b.dataset.jin = n; b.style.cssText = 'min-height:44px;min-width:56px;padding:0 10px;border-radius:8px;border:1px solid #c9b27a;background:transparent;color:#f3ecd8;font-size:15px;flex:none'; b.onclick = () => { if (pieces[sel]) { pieces[sel].formation = n; draw(); opts.onChange?.(api.state()); } }; jinRow.appendChild(b); return b; });
  const hint = document.createElement('div'); hint.textContent = L.hint; hint.style.cssText = 'font-size:12px;opacity:.7;padding:2px 12px 6px';
  wrap.append(bar, cv, jinRow, hint); root.appendChild(wrap);
  const g2 = cv.getContext('2d');

  // 地図の座標 ⇄ 画面の座標
  let sc = 1, ox = 0, oz = 0, W = 0, H = 0;
  const fit = () => {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height)); cv.width = W * dpr; cv.height = H * dpr; g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (W < 120 || H < 120) return;   // まだ大きさが決まっていない間は並べ直さない
    const m = 34;   // 縁の駒（半径24）が欠けないよう、地図の外に駒の半径ぶんの余白
    // K592（11/21）：携帯の横（874×402）では地図の全部を入れると自陣の帯が六十 px ほどになり、駒（直径48）が重なって指で置けなかった。
    //   駒を置けるのは自陣だけなので、自陣の端から地図の 55% までを画面に入れ、自陣を画面の下に付ける（敵の側の奥は上へ切れる）
    const VIS = 0.55;
    sc = Math.max(0.2, Math.min((W - 2 * m) / map.w, (H - 2 * m) / (map.h * VIS))); ox = W / 2; oz = H - m - (map.h / 2) * sc;   // 自陣の端（南は +z・北は −z。どちらも flip で画面の下）を下から m の所へ
    separate(pieces, zone, (2 * radius() + 8) / sc, 0);   // 初めの並びでも駒どうしを画面で 8px 以上離す（総大将は動かさない）
    draw();
  };
  // 自陣は常に画面の下に出す：south は z を反転しない（+z が下）にして下へ、north は上下を入れ替えて下に自陣
  const flip = side === 'north' ? -1 : 1;
  const sx = (p) => ox + p.x * sc * flip, sy = (p) => oz + p.z * sc * flip;
  const fromS = (x, y) => ({ x: ((x - ox) / sc) * flip, z: ((y - oz) / sc) * flip });

  const radius = () => Math.max(24, Math.min(map.w, map.h) * sc * 0.055);   // 押せる所は 44px 以上（半径24＝直径48）・駒の間は 8px 以上（separate）
  const st = () => validate(pieces, map, side);

  function rect(r, fill, stroke, dash) {
    const x0 = sx({ x: r.x0, z: r.z0 }), x1 = sx({ x: r.x1, z: r.z1 }), y0 = sy({ x: r.x0, z: r.z0 }), y1 = sy({ x: r.x1, z: r.z1 });
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (fill) { g2.fillStyle = fill; g2.fillRect(x, y, w, h); }
    if (stroke) { g2.setLineDash(dash || []); g2.strokeStyle = stroke; g2.lineWidth = 1.5; g2.strokeRect(x, y, w, h); g2.setLineDash([]); }
  }
  function draw() {
    g2.clearRect(0, 0, W, H);
    rect({ x0: -map.w / 2, x1: map.w / 2, z0: -map.h / 2, z1: map.h / 2 }, '#2d4630', '#6f8a63');
    rect(zone, 'rgba(201,178,122,.16)', '#c9b27a', [6, 4]);
    for (const q of zones) rect(q, 'rgba(138,42,31,.18)', '#c8574a', [3, 3]);
    // 区域の字は出さない（駒と重なって読めない）。置けた区域の名は上の帯の『本陣：後方』が言う。赤い点線の四角が本陣の区域。
    const r = radius();
    pieces.forEach((p, i) => {
      const x = sx(p.pos), y = sy(p.pos), h = p.facing;   // 向きは画面でも z の向き（flip 済み）
      const dx = Math.sin(h) * flip, dy = Math.cos(h) * flip;
      g2.beginPath(); g2.arc(x, y, r, 0, Math.PI * 2); g2.fillStyle = p.color || '#7a1f1a'; g2.fill();
      g2.lineWidth = i === sel ? 3 : 1.5; g2.strokeStyle = i === sel ? '#ffe9a8' : '#f3ecd8'; g2.stroke();
      if (p.honjin) { const bw = Math.max(30, L.honjin.length * 12 + 8); g2.fillStyle = '#ffe9a8'; g2.fillRect(x - bw / 2, y - r - 16, bw, 15); g2.fillStyle = '#7a1f1a'; g2.font = 'bold 12px sans-serif'; g2.textAlign = 'center'; g2.fillText(L.honjin, x, y - r - 4); }
      const nm = ((opts.lang || LANG) === 'en' ? tr(p.name || '') : (p.name || '')).slice(0, 8); g2.font = (nm.length > 6 ? 9 : nm.length > 3 ? 11 : 13) + 'px sans-serif'; g2.textAlign = 'center'; g2.lineWidth = 3; g2.strokeStyle = 'rgba(0,0,0,.6)'; g2.strokeText(nm, x, y + 4); g2.fillStyle = '#fff'; g2.fillText(nm, x, y + 4);
      const hx = x + dx * (r + 18), hy = y + dy * (r + 18);   // 向きの矢じり（なぞる所）
      g2.beginPath(); g2.moveTo(hx + dx * 14, hy + dy * 14); g2.lineTo(hx - dy * 10 - dx * 6, hy + dx * 10 - dy * 6); g2.lineTo(hx + dy * 10 - dx * 6, hy - dx * 10 - dy * 6); g2.closePath();
      g2.fillStyle = i === sel ? '#ffe9a8' : '#c9b27a'; g2.fill();
    });
    for (const b of jinBtns) { const on = pieces[sel]?.formation === b.dataset.jin; b.style.background = on ? '#8a2a1f' : 'transparent'; b.setAttribute('aria-pressed', String(on)); }
    const v = st(); status.textContent = v.ok ? `${L.honjin}：${L.zone[v.honjin]}` : L.need; status.style.color = v.ok ? '#bfe3a1' : '#f2b3aa'; bGo.disabled = !v.ok; bGo.style.opacity = v.ok ? '1' : '.45'; bGo.classList.toggle('on', v.ok && !drag);   // 本陣が区域に置けたら出陣の釦が光る（駒を動かしている間は光らせない）
  }

  function hit(px, py) {
    const r = radius();
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i], x = sx(p.pos), y = sy(p.pos), h = p.facing, dx = Math.sin(h) * flip, dy = Math.cos(h) * flip;
      if (Math.hypot(px - (x + dx * (r + 18)), py - (y + dy * (r + 18))) < 28) return { i, mode: 'turn' };
      if (Math.hypot(px - x, py - y) < r + 6) return { i, mode: 'move' };
    }
    return null;
  }
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => { const q = pt(e), h = hit(q.x, q.y); if (!h) return; sel = h.i; drag = { ...h, dx: 0, dz: 0 }; if (h.mode === 'move') { const w = fromS(q.x, q.y); drag.dx = pieces[h.i].pos.x - w.x; drag.dz = pieces[h.i].pos.z - w.z; } cv.setPointerCapture?.(e.pointerId); draw(); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return; const q = pt(e), w = fromS(q.x, q.y), p = pieces[drag.i];
    if (drag.mode === 'move') { p.pos = clampToRect({ x: w.x + drag.dx, z: w.z + drag.dz }, zone, 3); separate(pieces, zone, (2 * radius() + 8) / sc, drag.i); }
    else p.facing = facingFrom(p.pos, w, p.facing);
    draw(); opts.onChange?.(api.state());
  });
  const up = () => { drag = null; draw(); opts.onChange?.(api.state()); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  bReset.onclick = () => { pieces = defaultLayout(gens, map, side); sel = 0; draw(); opts.onChange?.(api.state()); };
  bGo.onclick = () => { if (st().ok) opts.onDone?.(toLayout(api.state(), map), api.state()); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro?.observe(cv); fit();

  const api = {
    state: () => ({ generals: pieces.map((p) => ({ id: p.id, name: p.name, troops: p.troops, formation: p.formation, pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) }, facing: +p.facing.toFixed(3), honjin: !!p.honjin })), honjin: st().honjin }),
    destroy: () => { ro?.disconnect(); wrap.remove(); },
  };
  return api;
}
