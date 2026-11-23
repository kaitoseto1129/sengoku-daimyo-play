// オンライン合戦の画面の札（K603・kaito 11/21 docs/kaito_online_battle_1121.md の 11〜28・50〜55・70〜71）。画面を UI だらけにしない：
//   右上＝小さな戦況の地図（自軍の隊・見つけた敵だけ・最後に見た所は薄く・両本陣・川と橋。タップで大きく＝時は止めない・隊を選んで地点をタップ→移動・攻撃・守備・退却）と残り時間
//   左上＝自軍兵力 N/4000・全軍士気（敵は推定のゲージ・正確な数は出さない）／左下＝大名本人の名と命の細い棒
//   下中央＝出陣武将の札（兵力・士気・状態。長押しで詳しく）／上中央＝小さく「戦況」（変わった時だけ）／開戦の3秒の札
//   命令の輪（command_ui.js）は今のまま（長押しで開く）。DOM の小さな札だけ・描く回数は増やさない。試合が終われば片付ける（片付け忘れの守りつき）。
import { isEn, tr } from '../i18n.js';

const EN = (ja, en) => (isEn() ? en : ja);
const CSS = `
.mh{position:fixed;inset:0;pointer-events:none;z-index:41;font:600 12px/1.25 "Noto Serif JP","Hiragino Mincho ProN",serif;color:#f4ecd8;text-shadow:0 0 3px #000,0 0 6px #000}
.mh *{box-sizing:border-box}
.mh .mh-tl{position:absolute;left:max(10px,env(safe-area-inset-left));top:8px;max-width:40vw}
.mh .mh-tl b{font-size:16px;font-weight:700}
.mh .mh-bar{height:8px;margin-top:4px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden}
.mh .mh-bar i{display:block;height:100%;background:#6fb3ff}
.mh .mh-bar i.m{background:#e8c25a}
.mh .mh-self{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:13px}
.mh .mh-g{position:relative;width:52px;height:8px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden}
.mh .mh-g i{position:absolute;left:0;top:0;bottom:0;width:0;background:#8fd18a}
.mh .mh-g i.fear{background:#c06ad8}
.mh .mh-self em{font-style:normal;opacity:.85}
.mh .mh-foe{display:none;margin-top:3px;font-size:11px;letter-spacing:1px;color:#ffb8a8}
.mh .mh-tr{position:absolute;right:max(10px,env(safe-area-inset-right));top:60px;width:auto;text-align:right}
.mh .mh-map{display:block;width:280px;height:210px;border:2px solid #e8d9b0aa;border-radius:4px;background:rgba(20,26,20,.72);pointer-events:auto;touch-action:manipulation}
.mh .mh-tm{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:2px 10px;border-radius:12px;background:#000a;border:1.5px solid #e8d9b0aa;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.mh .mh-tm::before{content:'⌛';font-size:14px}
.mh .mh-tm.hot{color:#ffb35a;border-color:#ffb35a}
.mh .mh-tm.ot{color:#ff6a5a;border-color:#ff6a5a}
.mh.tk .mh-bc,.mh.tk .mh-tip{visibility:hidden}
.mh .mh-tc{position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;width:min(460px,50vw);height:30px;border-radius:15px;overflow:hidden;background:#000b;border:1.5px solid #e8d9b0aa}
.mh .mh-tc .h{position:relative;flex:1 1 0;min-width:0;display:flex;align-items:center;font-size:15px;font-weight:700;white-space:nowrap}
.mh .mh-tc .h i{position:absolute;top:0;bottom:0;width:0;transition:width .5s}
.mh .mh-tc .h.a i{right:0;background:#3a78c8}
.mh .mh-tc .h.f i{left:0;background:#c0392b}
.mh .mh-tc .h span{position:relative;padding:0 12px;width:100%}
.mh .mh-tc .h.a span{text-align:left}.mh .mh-tc .h.f span{text-align:right}
.mh .mh-tc .mid{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#f4ecd8}
.mh .mh-mood{position:absolute;left:50%;top:42px;transform:translateX(-50%);font-size:13px;opacity:.95}
.mh .mh-bl{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:10px;min-width:92px}
.mh .mh-bc{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:6px;--n:4}
.mh .mh-card{width:min(96px,calc((100vw - 440px) / var(--n)));min-height:48px;padding:4px 5px 5px;border-radius:7px;background:rgba(14,18,24,.78);border:1.5px solid #fff4;pointer-events:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.mh .mh-card.sel{border-color:#f2c94c;box-shadow:0 0 8px #f2c94c99}
.mh .mh-card.pick{border-color:#ffd34a;box-shadow:0 0 0 2px #ffd34a,0 0 12px #ffd34acc;animation:mhPick 1s ease-in-out infinite}
@keyframes mhPick{50%{box-shadow:0 0 0 2px #ffd34a,0 0 4px #ffd34a66}}
@media (prefers-reduced-motion:reduce){.mh .mh-card.pick{animation:none}}
.mh .mh-pickmsg{position:absolute;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:3px 10px;border-radius:5px;background:rgba(20,14,8,.85);border:1px solid #ffd34a;color:#ffe9a8;font-size:14px;white-space:nowrap;pointer-events:none;display:none}
.mh .mh-card.out{opacity:.45}
.mh .mh-card .mh-n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.mh .mh-card .mh-s{font-size:12px;opacity:.95;white-space:nowrap}
.mh .mh-card.st-fight{border-color:#ff8a4a}.mh .mh-card.st-adv{border-color:#5fc7ff}.mh .mh-card.st-shake{border-color:#ffd34a}.mh .mh-card.st-rout{border-color:#ff3b3b;background:rgba(70,10,10,.8)}.mh .mh-card.low{border-color:#ff3b3b;animation:mhlow 1s ease-in-out infinite}@keyframes mhlow{50%{box-shadow:0 0 10px #ff3b3b}}@media (prefers-reduced-motion:reduce){.mh .mh-card.low{animation:none;box-shadow:0 0 8px #ff3b3b}}.mh .mh-card.st-rest{border-color:#8fe39a}
.mh .mh-tip{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);padding:5px 12px;border-radius:6px;background:#000c;font-size:14px;white-space:nowrap;display:none}
.mh .mh-intro{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);padding:10px 22px;border-radius:8px;background:#000b;text-align:center;font-size:18px;line-height:1.6;transition:opacity .6s}
.mh .mh-big{position:absolute;inset:0;background:rgba(8,10,8,.82);display:none;pointer-events:auto;touch-action:manipulation}
.mh .mh-big.on{display:block}
.mh .mh-big canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:2px solid #e8d9b0cc;border-radius:6px;background:#2b3326}
.mh .mh-big .mh-x{position:absolute;right:max(12px,env(safe-area-inset-right));top:10px;width:44px;height:44px;border-radius:22px;border:2px solid #fff6;background:#000a;color:#fff;font-size:22px;pointer-events:auto}
.mh .mh-big .mh-cm{position:absolute;right:max(12px,env(safe-area-inset-right));top:72px;display:flex;flex-direction:column;gap:8px}
.mh .mh-big .mh-cm button{min-width:72px;height:52px;border-radius:8px;border:2px solid #e6f2ff;background:rgba(12,22,34,.92);color:#e6f2ff;font:700 16px "Noto Serif JP",serif;pointer-events:auto}
@media (prefers-reduced-motion:reduce){.mh .mh-tc,.mh .mh-intro{transition:none}}
`;
const alive = (s) => s.b && s.b.aliveNominal() > 0 && s.state !== '敗走';
// K629 ②（kaito 11/22「まだ兵の残る隊が地図から消える」）：地図には兵が一人でも残る隊を出す（潰走・退く隊は薄く）
const onMap = (s) => s.b && s.b.aliveNominal() > 0;
// K628 ④：筋書きの地の戦場（s._fr＝盤の回し）では、地の x,z を盤（自軍 −z）へ戻して描く
const unFr = (fr, x, z) => { if (!fr) return { x, z }; const c = Math.cos(fr.rot), sn = Math.sin(fr.rot), dx = x - fr.x, dz = z - fr.z; return { x: dx * c - dz * sn, z: dx * sn + dz * c }; };
const toFr = (fr, x, z) => { if (!fr) return { x, z }; const c = Math.cos(fr.rot), sn = Math.sin(fr.rot); return { x: fr.x + x * c + z * sn, z: fr.z + z * c - x * sn }; };
const posOf = (s) => (s.b?.pos ? unFr(s._fr, s.b.pos.x, s.b.pos.z) : null);
// K639 ⑫（kaito 11/22「地図で戦っている隊を色で囲む」）：斬り合い・押し合いの最中の隊（交戦中・二秒内に当たった）を橙の輪で囲む
const fighting = (s, t) => s.state === '交戦中' || (t - (s.b?._clashAt ?? -99)) < 2;
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

// 地図の絵（小・大とも同じ描き方）。世界は x が左右・z が上下（自軍の南＝−z が下）。カメラの右が −x なので、x を反転して描く
function drawMap(cv, rt, M, P, sel) {
  const W = cv.width, H = cv.height, o = M.o?.map || { w: 400, h: 300 };
  const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  const X = (x) => W / 2 - (x / o.w) * W * 0.88, Y = (z) => H / 2 - (z / o.h) * H * 0.88;
  const r = o.river;
  if (r) {
    g.fillStyle = '#4a7fa8'; const y0 = Y(r.z + r.w / 2), hh = Math.max(2, (r.w / o.h) * H); g.fillRect(0, y0, W, hh);
    g.fillStyle = '#b9a06a'; for (const bx of [...(r.bridges || []), ...(r.fords || [])]) g.fillRect(X(bx) - 3, y0 - 1, 6, hh + 2);
  }
  const big = W > 200, rad = big ? 7 : 3.5;
  // K627 ②（kaito 11/22 写真 piece_1122.webp「地図の駒は布陣図の凸の形」）：駒は凸の形（上に細い頭・下に広い台）。自軍は頭が敵の方（上）、敵は頭が自軍の方（下）。
  //   名は連れた武将の全員を省かずに（前は四字で切り、重なって読めない者が居た）。本陣の駒は金の縁と『本』
  const totsu = (x, y, k, up, fill, stroke, lw) => {
    const bw = k * 2.2, bh = k * 1.15, tw = k * 1.0, th = k * 0.85, sg = up ? 1 : -1, yb = y + sg * (bh / 2 - 0.5 * th / 2);
    g.beginPath();
    g.rect(x - bw / 2, up ? yb - bh / 2 + th / 2 : yb - bh / 2 - th / 2, bw, bh);
    g.rect(x - tw / 2, up ? yb - bh / 2 + th / 2 - th : yb + bh / 2 - th / 2, tw, th + 0.5);
    g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = stroke;
    // 縁は外形だけ（凸の外周）
    const L = x - bw / 2, Rr = x + bw / 2, T0 = up ? yb - bh / 2 + th / 2 : yb - bh / 2 - th / 2, B0 = T0 + bh, tl = x - tw / 2, trr = x + tw / 2;
    g.beginPath();
    if (up) { g.moveTo(L, B0); g.lineTo(L, T0); g.lineTo(tl, T0); g.lineTo(tl, T0 - th); g.lineTo(trr, T0 - th); g.lineTo(trr, T0); g.lineTo(Rr, T0); g.lineTo(Rr, B0); }
    else { g.moveTo(L, T0); g.lineTo(L, B0); g.lineTo(tl, B0); g.lineTo(tl, B0 + th); g.lineTo(trr, B0 + th); g.lineTo(trr, B0); g.lineTo(Rr, B0); g.lineTo(Rr, T0); }
    g.closePath(); g.stroke();
  };
  // K627 ③ の続き（11/23）：ぶつかる隊どうしの名が重なって読めない（馬場が内藤の下に隠れた）→ 先に描いた名と重なる時は、上下へ一行ずつずらす
  const boxes = [], labels = [];
  const label = (t, x, y, col, dir = 1) => { if (big && t) labels.push([t, x, y, col, dir, g.globalAlpha]); };   // 名は駒を全部描いた後に（駒が名に乗らないように）
  const drawLabel = (t, x, y, col, dir, al) => {
    g.globalAlpha = al; const fs = W > 400 ? 12 : 10; g.font = `${fs}px sans-serif`; g.textAlign = 'center';
    const w = g.measureText(t).width, h = fs + 2;
    for (let i = 0; i < 4 && boxes.some((r) => Math.abs(r.x - x) < (r.w + w) / 2 && Math.abs(r.y - y) < h); i++) y += dir * h;
    boxes.push({ x, y, w });
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y);
  };
  const nameOf = (s) => { const n = s.taisho || s.b?.taishoU?.name || s.name || ''; return isEn() ? tr(n) : n; };
  // 自軍
  for (const s of M.sonae || []) {
    if (s.team || !onMap(s)) continue;
    const p = posOf(s); if (!p) continue;
    const hon = s.line === 'honjin' || s.major;
    g.globalAlpha = s._out || !alive(s) ? 0.4 : 1;   // K628 ⑤：退いて逃げる隊は薄く
    if (fighting(s, rt.t || 0)) { g.save(); g.strokeStyle = '#ff9a2e'; g.lineWidth = big ? 2.5 : 1.8; g.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin((rt.t || 0) * 3)); g.beginPath(); g.arc(X(p.x), Y(p.z), rad * 2.1, 0, 6.3); g.stroke(); g.restore(); }
    totsu(X(p.x), Y(p.z), rad, true, '#3f7fe0', s === sel ? '#f2c94c' : hon ? '#ffd34a' : '#fff', s === sel || hon ? 2.5 : 1);
    if (hon && big) { g.fillStyle = '#fff'; g.font = '700 9px sans-serif'; g.textAlign = 'center'; g.fillText(EN('本', 'HQ').slice(0, 2), X(p.x), Y(p.z) + 4); }
    label(nameOf(s), X(p.x), Y(p.z) + rad + 12, '#fff');
  }
  // K627 ③（kaito「柴田隊と戦っているのに地図で動く敵の印は山県隊だけ」）：敵は全部の隊を今いる所に動かし、名も出す（霧の『最後に見た所』で止めない）
  for (const s of M.sonae || []) {
    if (!s.team || !onMap(s)) continue;
    const p = posOf(s); if (!p) continue;
    const hon = s.line === 'honjin' || s.major;
    g.globalAlpha = s._out || !alive(s) ? 0.4 : 1;
    if (fighting(s, rt.t || 0)) { g.save(); g.strokeStyle = '#ff9a2e'; g.lineWidth = big ? 2.5 : 1.8; g.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin((rt.t || 0) * 3)); g.beginPath(); g.arc(X(p.x), Y(p.z), rad * 2.1, 0, 6.3); g.stroke(); g.restore(); }
    totsu(X(p.x), Y(p.z), rad, false, '#d23a30', hon ? '#ffd34a' : '#fff', hon ? 2.5 : 1);
    if (hon && big) { g.fillStyle = '#fff'; g.font = '700 9px sans-serif'; g.textAlign = 'center'; g.fillText(EN('本', 'HQ').slice(0, 2), X(p.x), Y(p.z) + 2); }
    label(nameOf(s), X(p.x), Y(p.z) - rad - 5, '#ffd6cc', -1);   // 敵の名は上へずらす
  }
  for (const L of labels) drawLabel(...L);
  // K639 ⑬：的にした敵へ、選んだ隊から矢印（三秒）
  { const A = M.hud?.aimed; if (A && (rt.t - A.t) < 3 && onMap(A.from) && onMap(A.to)) { const a = posOf(A.from), b2 = posOf(A.to); g.strokeStyle = '#f2c94c'; g.lineWidth = big ? 3 : 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(X(a.x), Y(a.z)); g.lineTo(X(b2.x), Y(b2.z)); g.stroke(); g.setLineDash([]); } }
  if (M.hud?.dest && big) { const d = M.hud.dest; g.strokeStyle = '#f2c94c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(d.x) - 8, Y(d.z) - 8); g.lineTo(X(d.x) + 8, Y(d.z) + 8); g.moveTo(X(d.x) + 8, Y(d.z) - 8); g.lineTo(X(d.x) - 8, Y(d.z) + 8); g.stroke(); }
  g.globalAlpha = 1;
  // K629 ⑬（kaito 11/22「地図で自分の居場所が分かるように」）：本人の居場所に、向いている方を指す金の矢印（白い縁・一番上に描く）
  const me = rt.player?.u;
  if (me?.pos && me.alive !== false) {
    const fr = M.o?._frame, a = unFr(fr, me.pos.x, me.pos.z), h = me.heading || 0, b2 = unFr(fr, me.pos.x + Math.sin(h) * 10, me.pos.z + Math.cos(h) * 10);
    const ax = X(a.x), ay = Y(a.z); let dx = X(b2.x) - ax, dy = Y(b2.z) - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const k = big ? 11 : 7, nx = -dy, ny = dx;
    g.beginPath(); g.moveTo(ax + dx * k, ay + dy * k); g.lineTo(ax - dx * k * 0.7 + nx * k * 0.75, ay - dy * k * 0.7 + ny * k * 0.75); g.lineTo(ax - dx * k * 0.3, ay - dy * k * 0.3); g.lineTo(ax - dx * k * 0.7 - nx * k * 0.75, ay - dy * k * 0.7 - ny * k * 0.75); g.closePath();
    g.fillStyle = '#ffd34a'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); g.lineWidth = 1; g.strokeStyle = '#fff'; g.stroke();
  }
}

export function mountMatchHud(rt, M, P) {
  if (typeof document === 'undefined' || M.hud) return M.hud;
  if (!document.getElementById('mh-css')) { const st = el('style'); st.id = 'mh-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = el('div', 'mh'); root.setAttribute('aria-hidden', 'false'); document.body.appendChild(root);
  const H = { root, t0: rt.t, last: '', lastAt: -99, sel: null, mode: '拮抗' };
  const nominalAll = (team) => (M.sonae || []).filter((s) => !!s.team === !!team).reduce((a, s) => a + (s.b?.nominal || 0), 0);
  H.total = Math.round(nominalAll(0) || 4000);
  // 左上：自軍兵力・全軍士気・敵の推定
  const tl = el('div', 'mh-tl', root); H.tl = tl; H.tlText = el('b', '', tl);
  const bar2 = el('div', 'mh-bar', tl); H.tlMor = el('i', 'm', bar2); H.foe = el('div', 'mh-foe', tl);
  // 本人（大名）の疲れ・恐れ・武器：小さく（命の棒は戦の画面の札が出す）
  H.self = el('div', 'mh-self', tl); H.selfSta = el('i', 'sta', el('span', 'mh-g', H.self)); H.selfFear = el('i', 'fear', el('span', 'mh-g', H.self)); H.selfW = el('em', '', H.self);
  // 右上：地図と残り時間
  const tr_ = el('div', 'mh-tr', root); H.cv = el('canvas', 'mh-map', tr_); H.cv.width = 280; H.cv.height = 210; H.tm = el('div', 'mh-tm', tr_);
  H.cv.setAttribute('role', 'button'); H.cv.setAttribute('aria-label', EN('戦況の地図を大きくする', 'Enlarge battle map'));
  // 上中央・開戦の札
  // 上中央：一本のゲージを半分に割る。左＝自軍の人数（青）・右＝敵軍の約の人数（赤・見えない間は ？）。真ん中の下に戦況
  H.tc = el('div', 'mh-tc', root);
  const ha = el('div', 'h a', H.tc); H.gaI = el('i', '', ha); H.gaT = el('span', '', ha);
  const hf = el('div', 'h f', H.tc); H.gfI = el('i', '', hf); H.gfT = el('span', '', hf); el('div', 'mid', H.tc);
  H.mood = el('div', 'mh-mood', root);
  H.intro = el('div', 'mh-intro', root);
  const w0 = Math.round(nominalAll(0)), w1 = Math.round(nominalAll(1));
  H.intro.innerHTML = `${EN('自軍', 'Your army')} ${w0}　${EN('敵軍', 'Foe')} ${w1}<br>${EN('敵本陣を崩す・敵の全軍の士気を崩す', 'Break their HQ or their will')}`;
  setTimeout(() => { H.intro.style.opacity = '0'; setTimeout(() => H.intro.remove(), 700); }, 3200);
  // 左下：大名本人の名と命は、戦の画面の既存の札が出す（二重に出さない）
  // 下中央：武将の札
  const bc = el('div', 'mh-bc', root); bc.style.setProperty('--n', String(Math.max(4, (M.sonae || []).filter((x) => !x.team).length))); H.tip = el('div', 'mh-tip', root); H.cards = new Map();
  const mine = (M.sonae || []).filter((s) => !s.team);
  for (const s of mine) {
    const c = el('div', 'mh-card', bc); const n = el('div', 'mh-n', c); const bar3 = el('div', 'mh-bar', c); const bi = el('i', '', bar3); const m3 = el('div', 'mh-bar', c); const mi = el('i', 'm', m3); const st = el('div', 'mh-s', c);
    let timer = 0, long = false;
    const down = () => { long = false; timer = setTimeout(() => { long = true; showTip(s); }, 600); };
    const up = () => { clearTimeout(timer); if (long) { H.tip.style.display = 'none'; return; }
      // K639 ⑪：討たれて移る武将を選ぶ間は、光っている札を押すとその武将へ移る
      const pk = M.picking; if (pk?.choose && pk.list?.includes(s)) { pk.choose(s); return; }
      H.sel = H.sel === s ? null : s; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointerup', up); c.addEventListener('pointerleave', () => { clearTimeout(timer); H.tip.style.display = 'none'; });
    H.cards.set(s, { c, n, bi, mi, st });
  }
  const showTip = (s) => {
    const b = s.b, kind = s.type || s.kind || '';
    const gunPct = b.real?.ammoPct ?? b.ammoPct;
    H.tip.textContent = `${isEn() ? tr(s.taisho || '') : s.taisho} ${Math.round(b.aliveNominal())}/${Math.round(b.nominal)} ${EN('士気', 'Mor')}${Math.round(b.morale ?? 100)}${Number.isFinite(gunPct) ? ` ${EN('弾', 'Ammo')}${Math.round(gunPct)}%` : ''}${kind ? ' ' + kind : ''}`;
    H.tip.style.display = 'block';
  };
  // 大きい地図（時は止めない）
  const big = el('div', 'mh-big', root); H.big = big; H.bcv = el('canvas', '', big);
  const bx = el('button', 'mh-x', big); bx.type = 'button'; bx.textContent = '×'; bx.setAttribute('aria-label', EN('地図を閉じる', 'Close map'));
  H.cm = el('div', 'mh-cm', big);
  const fitBig = () => { const o = M.o?.map || { w: 400, h: 300 }, vw = innerWidth - 100, vh = innerHeight - 70, k = Math.min(vw / o.w, vh / o.h); H.bcv.width = Math.round(o.w * k * 1); H.bcv.height = Math.round(o.h * k); H.bcv.style.width = H.bcv.width + 'px'; H.bcv.style.height = H.bcv.height + 'px'; };
  H.cv.addEventListener('click', () => { fitBig(); big.classList.add('on'); H.sel = H.sel || (M.sonae || []).find((s) => !s.team && alive(s)) || null; });
  bx.addEventListener('click', (e) => { e.stopPropagation(); big.classList.remove('on'); H.dest = null; renderCm(); });
  const renderCm = () => {
    H.cm.textContent = '';
    if (!H.dest || !H.sel) return;
    const ids = [['here', '移動', 'Move'], ['attack', '攻撃', 'Attack'], ['defend', '守備', 'Hold'], ['retreat', '退却', 'Retreat']];
    for (const [id, ja, en] of ids) {
      const b = el('button', '', H.cm); b.type = 'button'; b.textContent = EN(ja, en);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const u = M.cmd?.me?.().find((x) => x.o === H.sel || x.o?.b === H.sel.b || x.name === H.sel.taisho);
        try { if (u && M.cmd?.fire) M.cmd.fire(u, id, { at: H.dest }); } catch (er) { /* 命令が出せなくても試合は進む */ }
        H.dest = null; renderCm();
      });
    }
  };
  H.bcv.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = H.bcv.getBoundingClientRect(), o = M.o?.map || { w: 400, h: 300 };
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const x = (0.5 - px) * o.w / 0.88, z = (0.5 - py) * o.h / 0.88;
    // 自軍の隊の近くを押したら、その隊を選ぶ。そうでなければ地点
    let near = null, nd = 18;
    for (const s of M.sonae || []) { if (s.team || !alive(s)) continue; const p = posOf(s); const d = Math.hypot(p.x - x, p.z - z); if (d < nd) { nd = d; near = s; } }
    // K639 ⑬（kaito 11/22「携帯：自分の隊を押して、地図の敵を押すとその敵を的にする」）：隊を選んだ後に敵の駒の近くを押したら、その敵へ『攻撃』を出す
    let foeHit = null, fd = 20;
    if (H.sel && !near) for (const s of M.sonae || []) { if (!s.team || !onMap(s)) continue; const p = posOf(s); const d = Math.hypot(p.x - x, p.z - z); if (d < fd) { fd = d; foeHit = s; } }
    if (foeHit) {
      const u = M.cmd?.me?.().find((q) => q.o === H.sel || q.o?.b === H.sel.b || q.name === H.sel.taisho);
      try { if (u && M.cmd?.fire) M.cmd.fire(u, 'attack', { at: { x: foeHit.b.pos.x, z: foeHit.b.pos.z }, tg: (rt.sonae || M.sonae || []).indexOf(foeHit) }); } catch (er) { /* 命令が出せなくても試合は進む */ }
      H.aimed = { from: H.sel, to: foeHit, t: rt.t }; H.dest = null;
    }
    else if (near) { H.sel = near; H.dest = null; } else if (H.sel) H.dest = toFr(M.o?._frame, x, z);   // K628 ④：盤で押した地点を地の x,z へ
    renderCm(); drawMap(H.bcv, rt, M, P, H.sel);
  });
  // 片付け忘れの守り
  H.guard = setInterval(() => { if (!root.isConnected || performance.now() - (H.seen || performance.now()) > 1500) unmountMatchHud(M); }, 700);
  M.hud = H; return H;
}

const MOOD = { even: '拮抗', up: '自軍優勢', down: '自軍劣勢' };
export function tickMatchHud(rt, M, P) {
  const H = M.hud || mountMatchHud(rt, M, P); if (!H) return;
  H.seen = performance.now();
  // K627：左上の［止める］［視点］［保存］［設定］の下へ全軍士気を下ろす（重ならない）。一秒に一度だけ測る
  if (!(H.seen - (H.tlAt || 0) < 1000)) {
    H.tlAt = H.seen; const rs = [];
    for (const b of document.querySelectorAll('#tc-pause,#tc-view,#tc-map,#tc-save,#tc-set,#tc-sound,#side-ctl .side-btn')) {
      const r = b.getBoundingClientRect(); if (r.width && getComputedStyle(b).visibility !== 'hidden') rs.push(r);
    }
    const w = H.tl.offsetWidth || 140, h = H.tl.offsetHeight || 54; let y = 8;
    for (let k = 0; k < 4; k++) {   // 重なる釦があれば、その下へ。下にも釦があれば、もう一段
      const hit = rs.filter((r) => r.left < 10 + w && r.right > 10 && r.top < y + h && r.bottom > y);
      if (!hit.length) break; y = Math.max(...hit.map((r) => r.bottom)) + 6;
    }
    const top = y > 8 ? Math.round(y) + 'px' : '';
    if (H.tlTop !== top) { H.tlTop = top; H.tl.style.top = top; }
  }
  { const sp = document.getElementById('sword-pair'); if (sp) sp.remove(); }   // オンラインの合戦では武器の持ち替えの QR の札を出さない
  const mine = (M.sonae || []).filter((s) => !s.team), foe = (M.sonae || []).filter((s) => s.team);
  const now = (M.sonae && P.army?.army4kNominal?.(rt)) || [0, 0];
  const n0 = Math.round(now[0]), n1 = Math.round(now[1] || 0);
  const live = mine.filter(alive);
  const mor = live.length ? Math.round(live.reduce((a, s) => a + (s.b.morale ?? 100), 0) / live.length) : 0;
  const key = `${n0}|${mor}`;
  if (H.k1 !== key) { H.k1 = key; H.tlText.textContent = `${EN('全軍士気', 'Morale')} ${mor}%`; H.tlMor.style.width = mor + '%'; }
  // 敵の兵力は正確に出さない：見つけた隊がある時だけ、六つのうち何個かの推定（四捨五入・見えない間は ？）
  const seen = (P.rules?.fogView ? foe.filter((s) => P.rules.fogView(M.fog, s.id)).length : 0) || (M.foeEstimate?.seenEver ? 1 : 0);
  // K603 20〜22（k592）：■の数は match.js の推定（見えない隊は最後に見た数・情報の武将がいれば正確）。無ければ今まで通り
  const q = M.foeEstimate ? Math.max(0, Math.min(6, M.foeEstimate.q)) : Math.max(0, Math.min(6, Math.round(n1 / Math.max(1, nominalOf(foe)) * 6)));
  const foeText = seen ? '■'.repeat(q) + '□'.repeat(6 - q) : '？？？？？？';
  if (H.foe.textContent !== foeText) { H.foe.textContent = foeText; H.foe.setAttribute('aria-label', EN('敵の兵力の推定', 'Estimated foe strength')); }
  // 上中央のゲージ：自軍 n 人／敵軍 約 m 人（百人きざみ・見えない間は ？）
  // K629 ①（kaito 11/22「敵の人数を討つたびにその場で減らす」）：見つけた後は敵の今の人数をそのまま出す（前は六つきざみの推定を百人に丸め、討っても動かなかった）
  const foeNom = nominalOf(foe), m1 = Math.round(n1);
  const gk = `${n0}|${seen ? m1 : -1}`;
  if (H.gk !== gk) {
    H.gk = gk;
    H.gaI.style.width = Math.max(0, Math.min(100, n0 / H.total * 100)) + '%'; H.gfI.style.width = seen ? Math.max(0, Math.min(100, m1 / foeNom * 100)) + '%' : '0%';
    H.gaT.textContent = `${EN('自軍', 'You')} ${n0}`; H.gfT.textContent = `${EN('敵軍', 'Foe')} ${seen ? m1 : '？'}`;
  }
  // 本人の疲れ（気力の減り）・恐れ（組の者の怯え）・今の武器
  try {
    const p = rt.player;
    if (p) {
      const tired = Math.max(0, Math.min(1, 1 - (p.sta ?? p.maxSta ?? 1) / Math.max(1, p.maxSta || 1))), fear = Math.max(0, Math.min(1, rt.squadFear?.() || 0));
      H.selfSta.style.width = Math.round(tired * 100) + '%'; H.selfFear.style.width = Math.round(fear * 100) + '%';
      const W = { spear: ['槍', 'Spear'], sword: ['刀', 'Sword'], gun: ['鉄砲', 'Gun'], bow: ['弓', 'Bow'] }[p.weapon]; const wt = W ? EN(W[0], W[1]) : '';
      if (H.selfW.textContent !== wt) H.selfW.textContent = wt;
      H.self.title = EN('疲れ・恐れ・武器', 'Fatigue / fear / weapon');
    }
  } catch (e) { /* 本人の札が出せなくても続ける */ }
  // 戦況（変わった時だけ出す）
  const ratio = (n0 / H.total) / Math.max(0.05, n1 / Math.max(1, nominalOf(foe)));
  const mood = M.foeEstimate?.mood || (ratio > 1.25 ? 'up' : ratio < 0.8 ? 'down' : 'even');   // 戦況も推定から（敵の本当の数は使わない）
  if (mood !== H.mood0) { H.mood0 = mood; H.mood.textContent = `${EN('戦況', 'Battle')} ${EN(MOOD[mood], { even: 'Even', up: 'Ahead', down: 'Behind' }[mood])}`; }
  // 右上：地図は半秒ごと・残り時間
  if (rt.t - (H.mapAt || -9) > 0.5) { H.mapAt = rt.t; drawMap(H.cv, rt, M, P, H.sel); if (H.big.classList.contains('on')) drawMap(H.bcv, rt, M, P, H.sel); }
  // K629 ⑥（kaito 11/22「時間切れと出たが残り時間が出ていない」）：砂時計の印と枠で目立たせ、十五分を過ぎた延長（最大三分）は延長の残りを赤で数える（前は 0:00 で止まって見えた）
  const el0 = rt.t - M.t0, len = M.limit || 900, ot = el0 > len;
  const left = Math.max(0, Math.round(ot ? len + 180 - el0 : len - el0));
  const tm = `${ot ? '+' : ''}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (H.tm.textContent !== tm) { H.tm.textContent = tm; H.tm.classList.toggle('hot', !ot && left <= 180); H.tm.classList.toggle('ot', ot); H.tm.setAttribute('aria-label', EN(ot ? '延長の残り時間' : '残り時間', ot ? 'Overtime left' : 'Time left')); }
  // K629 ⑤（kaito 11/22 写真 hud_overlap.jpg）：討死の引き継ぎの顔の札が出ている間は、下の武将の札を隠して一列にする（二つが重なっていた）
  H.root.classList.toggle('tk', !!document.querySelector('.oltk'));
  // K639 ⑪：移る武将を選ぶ間は、下の札の中の移れる者を光らせ、一言だけ出す
  { const pk = M.picking?.list ? M.picking : null; if (!H.pickMsg) { H.pickMsg = el('div', 'mh-pickmsg', H.root); H.pickMsg.textContent = EN('討たれた。光る札の武将へ移る', 'You fell. Tap a glowing card to take over'); } H.pickMsg.style.display = pk ? 'block' : 'none'; H.pickList = pk ? pk.list : null; }
  // 下中央：札
  for (const [s, c] of H.cards) {
    const n = Math.round(s.b.aliveNominal()), nm = isEn() ? tr(s.taisho || '') : (s.taisho || '');
    if (c.n.textContent !== nm) c.n.textContent = nm;
    c.bi.style.width = Math.max(0, Math.min(100, n / Math.max(1, s.b.nominal) * 100)) + '%';
    c.mi.style.width = Math.max(0, Math.min(100, s.b.morale ?? 100)) + '%';
    const sv = STV[s.state] || ['', '', s.state || '', s.state || '', ''];
    const stt = `${sv[0]}${isEn() ? sv[3] : sv[2]}`; if (c.st.textContent !== `${n} ${stt}`) c.st.textContent = `${n} ${stt}`;
    for (const k of ST_CLS) c.c.classList.toggle(k, sv[4] === k);
    c.c.classList.toggle('low', alive(s) && n / Math.max(1, s.b.nominal) <= 0.3);
    c.c.classList.toggle('sel', H.sel === s); c.c.classList.toggle('out', !alive(s)); c.c.classList.toggle('pick', !!H.pickList?.includes(s));
  }
}
// 札の状態：[絵, -, 分かる言葉, English, 札の色の class]
const STV = { '待機': ['□ ', '', '控え', 'Hold', ''], '予備待機': ['□ ', '', '控え', 'Reserve', ''], '前進中': ['▶ ', '', '進軍中', 'Advancing', 'st-adv'], '交戦中': ['⚔ ', '', '戦闘中', 'Fighting', 'st-fight'],
  '動揺': ['！', '', '動揺', 'Shaken', 'st-shake'], '混乱': ['！', '', '混乱', 'Chaos', 'st-shake'], '後退中': ['◀ ', '', '退却中', 'Falling back', 'st-shake'], '敗走': ['✖ ', '', '潰走', 'Routed', 'st-rout'], '再編中': ['↻ ', '', '立て直し', 'Regrouping', 'st-rest'] };
const ST_CLS = ['st-adv', 'st-fight', 'st-shake', 'st-rout', 'st-rest'];
const nominalOf = (L) => L.reduce((a, s) => a + (s.b?.nominal || 0), 0) || 4000;

export function unmountMatchHud(M) {
  const H = M?.hud; if (!H) return;
  clearInterval(H.guard); clearTimeout(H.tcT); try { H.root.remove(); } catch (e) { /* 無ければよい */ }
  M.hud = null;
}
