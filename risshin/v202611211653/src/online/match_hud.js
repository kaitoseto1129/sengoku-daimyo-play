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
.mh .mh-tl{position:absolute;left:max(10px,env(safe-area-inset-left));top:8px;max-width:46vw}
.mh .mh-tl b{font-size:13px;font-weight:700}
.mh .mh-bar{height:5px;margin-top:3px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden}
.mh .mh-bar i{display:block;height:100%;background:#6fb3ff}
.mh .mh-bar i.m{background:#e8c25a}
.mh .mh-self{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:10px}
.mh .mh-g{position:relative;width:34px;height:5px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden}
.mh .mh-g i{position:absolute;left:0;top:0;bottom:0;width:0;background:#8fd18a}
.mh .mh-g i.fear{background:#c06ad8}
.mh .mh-self em{font-style:normal;opacity:.85}
.mh .mh-foe{margin-top:3px;font-size:11px;letter-spacing:1px;color:#ffb8a8}
.mh .mh-tr{position:absolute;right:max(10px,env(safe-area-inset-right));top:52px;width:auto;text-align:right}
.mh .mh-map{display:block;width:112px;height:84px;border:1.5px solid #e8d9b0aa;border-radius:4px;background:rgba(20,26,20,.72);pointer-events:auto;touch-action:manipulation}
.mh .mh-tm{margin-top:2px;font-size:12px}
.mh .mh-tm.hot{color:#ffb35a}
.mh .mh-tc{position:absolute;left:50%;top:10px;transform:translateX(-50%);padding:2px 12px;border-radius:12px;background:#000a;font-size:13px;opacity:0;transition:opacity .4s}
.mh .mh-tc.on{opacity:1}
.mh .mh-bl{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:10px;min-width:92px}
.mh .mh-bc{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:6px}
.mh .mh-card{width:68px;padding:3px 4px 4px;border-radius:6px;background:rgba(14,18,24,.78);border:1.5px solid #fff4;pointer-events:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.mh .mh-card.sel{border-color:#f2c94c;box-shadow:0 0 8px #f2c94c99}
.mh .mh-card.out{opacity:.45}
.mh .mh-card .mh-n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}
.mh .mh-card .mh-s{font-size:10px;opacity:.9;white-space:nowrap}
.mh .mh-tip{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);padding:4px 10px;border-radius:6px;background:#000c;font-size:12px;white-space:nowrap;display:none}
.mh .mh-intro{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);padding:10px 22px;border-radius:8px;background:#000b;text-align:center;font-size:15px;line-height:1.6;transition:opacity .6s}
.mh .mh-big{position:absolute;inset:0;background:rgba(8,10,8,.82);display:none;pointer-events:auto;touch-action:manipulation}
.mh .mh-big.on{display:block}
.mh .mh-big canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:2px solid #e8d9b0cc;border-radius:6px;background:#2b3326}
.mh .mh-big .mh-x{position:absolute;right:max(12px,env(safe-area-inset-right));top:10px;width:44px;height:44px;border-radius:22px;border:2px solid #fff6;background:#000a;color:#fff;font-size:22px;pointer-events:auto}
.mh .mh-big .mh-cm{position:absolute;right:max(12px,env(safe-area-inset-right));top:72px;display:flex;flex-direction:column;gap:8px}
.mh .mh-big .mh-cm button{min-width:60px;height:44px;border-radius:8px;border:2px solid #e6f2ff;background:rgba(12,22,34,.92);color:#e6f2ff;font:700 14px "Noto Serif JP",serif;pointer-events:auto}
@media (prefers-reduced-motion:reduce){.mh .mh-tc,.mh .mh-intro{transition:none}}
`;
const alive = (s) => s.b && s.b.aliveNominal() > 0 && s.state !== '敗走';
const posOf = (s) => (s.b?.pos ? { x: s.b.pos.x, z: s.b.pos.z } : null);
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
  // 自軍
  for (const s of M.sonae || []) {
    if (s.team || !alive(s)) continue;
    const p = posOf(s); if (!p) continue;
    const hon = s.line === 'honjin' || s.major;
    g.fillStyle = '#5aa6ff'; g.strokeStyle = s === sel ? '#f2c94c' : '#fff';
    g.lineWidth = s === sel ? 3 : 1;
    if (hon) { g.fillRect(X(p.x) - rad, Y(p.z) - rad, rad * 2, rad * 2); g.strokeRect(X(p.x) - rad, Y(p.z) - rad, rad * 2, rad * 2); }
    else { g.beginPath(); g.arc(X(p.x), Y(p.z), rad, 0, 7); g.fill(); g.stroke(); }
    if (big) { g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText((isEn() ? tr(s.taisho || '') : (s.taisho || '')).slice(0, 4), X(p.x), Y(p.z) + rad + 12); }
  }
  // 敵（見つけた分だけ・最後に見た所は薄く）
  const R = P.rules, fog = M.fog;
  if (R?.fogView && fog) for (const s of M.sonae || []) {
    if (!s.team) continue;
    const v = R.fogView(fog, s.id); if (!v || !v.pos) continue;
    const hon = s.line === 'honjin' || s.major;
    g.save(); g.translate(X(v.pos.x), Y(v.pos.z)); g.rotate(Math.PI / 4);
    if (v.estimate) { g.globalAlpha = .55; g.setLineDash([2, 2]); g.strokeStyle = '#ffd6cc'; g.lineWidth = 1.2; g.strokeRect(-rad, -rad, rad * 2, rad * 2); }
    else { g.fillStyle = '#e0443a'; g.strokeStyle = '#fff'; g.lineWidth = hon ? 2 : 1; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.strokeRect(-rad, -rad, rad * 2, rad * 2); }
    g.restore();
  }
  if (M.hud?.dest && big) { const d = M.hud.dest; g.strokeStyle = '#f2c94c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(d.x) - 8, Y(d.z) - 8); g.lineTo(X(d.x) + 8, Y(d.z) + 8); g.moveTo(X(d.x) + 8, Y(d.z) - 8); g.lineTo(X(d.x) - 8, Y(d.z) + 8); g.stroke(); }
  g.globalAlpha = 1;
}

export function mountMatchHud(rt, M, P) {
  if (typeof document === 'undefined' || M.hud) return M.hud;
  if (!document.getElementById('mh-css')) { const st = el('style'); st.id = 'mh-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = el('div', 'mh'); root.setAttribute('aria-hidden', 'false'); document.body.appendChild(root);
  const H = { root, t0: rt.t, last: '', lastAt: -99, sel: null, mode: '拮抗' };
  const nominalAll = (team) => (M.sonae || []).filter((s) => !!s.team === !!team).reduce((a, s) => a + (s.b?.nominal || 0), 0);
  H.total = Math.round(nominalAll(0) || 4000);
  // 左上：自軍兵力・全軍士気・敵の推定
  const tl = el('div', 'mh-tl', root); H.tlText = el('b', '', tl); const bar = el('div', 'mh-bar', tl); H.tlBar = el('i', '', bar);
  const bar2 = el('div', 'mh-bar', tl); H.tlMor = el('i', 'm', bar2); H.foe = el('div', 'mh-foe', tl);
  // 本人（大名）の疲れ・恐れ・武器：小さく（命の棒は戦の画面の札が出す）
  H.self = el('div', 'mh-self', tl); H.selfSta = el('i', 'sta', el('span', 'mh-g', H.self)); H.selfFear = el('i', 'fear', el('span', 'mh-g', H.self)); H.selfW = el('em', '', H.self);
  // 右上：地図と残り時間
  const tr_ = el('div', 'mh-tr', root); H.cv = el('canvas', 'mh-map', tr_); H.cv.width = 224; H.cv.height = 168; H.tm = el('div', 'mh-tm', tr_);
  H.cv.setAttribute('role', 'button'); H.cv.setAttribute('aria-label', EN('戦況の地図を大きくする', 'Enlarge battle map'));
  // 上中央・開戦の札
  H.tc = el('div', 'mh-tc', root);
  H.intro = el('div', 'mh-intro', root);
  const w0 = Math.round(nominalAll(0)), w1 = Math.round(nominalAll(1));
  H.intro.innerHTML = `${EN('自軍', 'Your army')} ${w0}　${EN('敵軍', 'Foe')} ${w1}<br>${EN('敵本陣を崩す・敵の全軍の士気を崩す', 'Break their HQ or their will')}`;
  setTimeout(() => { H.intro.style.opacity = '0'; setTimeout(() => H.intro.remove(), 700); }, 3200);
  // 左下：大名本人の名と命は、戦の画面の既存の札が出す（二重に出さない）
  // 下中央：武将の札
  const bc = el('div', 'mh-bc', root); H.tip = el('div', 'mh-tip', root); H.cards = new Map();
  const mine = (M.sonae || []).filter((s) => !s.team);
  for (const s of mine) {
    const c = el('div', 'mh-card', bc); const n = el('div', 'mh-n', c); const bar3 = el('div', 'mh-bar', c); const bi = el('i', '', bar3); const m3 = el('div', 'mh-bar', c); const mi = el('i', 'm', m3); const st = el('div', 'mh-s', c);
    let timer = 0, long = false;
    const down = () => { long = false; timer = setTimeout(() => { long = true; showTip(s); }, 600); };
    const up = () => { clearTimeout(timer); if (long) { H.tip.style.display = 'none'; return; } H.sel = H.sel === s ? null : s; };
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
    if (near) { H.sel = near; H.dest = null; } else if (H.sel) H.dest = { x, z };
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
  const mine = (M.sonae || []).filter((s) => !s.team), foe = (M.sonae || []).filter((s) => s.team);
  const now = (M.sonae && P.army?.army4kNominal?.(rt)) || [0, 0];
  const n0 = Math.round(now[0]), n1 = Math.round(now[1] || 0);
  const live = mine.filter(alive);
  const mor = live.length ? Math.round(live.reduce((a, s) => a + (s.b.morale ?? 100), 0) / live.length) : 0;
  const key = `${n0}|${mor}`;
  if (H.k1 !== key) { H.k1 = key; H.tlText.textContent = `${EN('自軍兵力', 'Troops')} ${n0}/${H.total}　${EN('士気', 'Morale')} ${mor}%`; H.tlBar.style.width = Math.max(0, Math.min(100, n0 / H.total * 100)) + '%'; H.tlMor.style.width = mor + '%'; }
  // 敵の兵力は正確に出さない：見つけた隊がある時だけ、六つのうち何個かの推定（四捨五入・見えない間は ？）
  const seen = (P.rules?.fogView ? foe.filter((s) => P.rules.fogView(M.fog, s.id)).length : 0) || (M.foeEstimate?.seenEver ? 1 : 0);
  // K603 20〜22（k592）：■の数は match.js の推定（見えない隊は最後に見た数・情報の武将がいれば正確）。無ければ今まで通り
  const q = M.foeEstimate ? Math.max(0, Math.min(6, M.foeEstimate.q)) : Math.max(0, Math.min(6, Math.round(n1 / Math.max(1, nominalOf(foe)) * 6)));
  const foeText = seen ? '■'.repeat(q) + '□'.repeat(6 - q) : '？？？？？？';
  if (H.foe.textContent !== foeText) { H.foe.textContent = foeText; H.foe.setAttribute('aria-label', EN('敵の兵力の推定', 'Estimated foe strength')); }
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
  if (mood !== H.mood0 && rt.t - H.t0 > 20) { if (H.mood0 !== undefined || mood !== 'even') showTc(H, MOOD[mood]); }
  H.mood0 = mood;
  // 右上：地図は半秒ごと・残り時間
  if (rt.t - (H.mapAt || -9) > 0.5) { H.mapAt = rt.t; drawMap(H.cv, rt, M, P, H.sel); if (H.big.classList.contains('on')) drawMap(H.bcv, rt, M, P, H.sel); }
  const left = Math.max(0, Math.round((M.limit || 900) - (rt.t - M.t0)));
  const tm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (H.tm.textContent !== tm) { H.tm.textContent = tm; H.tm.classList.toggle('hot', left <= 180); }
  // 下中央：札
  for (const [s, c] of H.cards) {
    const n = Math.round(s.b.aliveNominal()), nm = isEn() ? tr(s.taisho || '') : (s.taisho || '');
    if (c.n.textContent !== nm) c.n.textContent = nm;
    c.bi.style.width = Math.max(0, Math.min(100, n / Math.max(1, s.b.nominal) * 100)) + '%';
    c.mi.style.width = Math.max(0, Math.min(100, s.b.morale ?? 100)) + '%';
    const stt = EN(s.state || '', s.state || ''); if (c.st.textContent !== `${n} ${stt}`) c.st.textContent = `${n} ${stt}`;
    c.c.classList.toggle('sel', H.sel === s); c.c.classList.toggle('out', !alive(s));
  }
}
const nominalOf = (L) => L.reduce((a, s) => a + (s.b?.nominal || 0), 0) || 4000;
function showTc(H, text) { H.tc.textContent = `${EN('戦況', 'Battle')} ${text}`; H.tc.classList.add('on'); clearTimeout(H.tcT); H.tcT = setTimeout(() => H.tc.classList.remove('on'), 4000); }

export function unmountMatchHud(M) {
  const H = M?.hud; if (!H) return;
  clearInterval(H.guard); clearTimeout(H.tcT); try { H.root.remove(); } catch (e) { /* 無ければよい */ }
  M.hud = null;
}
