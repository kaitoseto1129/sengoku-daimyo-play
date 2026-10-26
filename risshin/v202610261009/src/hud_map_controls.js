import { $, STD_SVG, esc, destinationDistance, tagOf, KIND_WORD, TAG_COL } from "./hud_common.js";
import { sightRef } from "./battle_sight.js";
import { simpleControls } from "./simple_controls.js";
import { S, K } from "./settings.js";
import { RADIAL, GROUP_NAME } from "./player.js";
import { RANKS } from "./state.js";
import { isTouch } from "./touch.js";

// 大きな地図の×と拡大・縮小は、字の札が隠れる戦でも画面の右上に絵だけで残す（テスター 10/25「M でしか閉じられない」）。
//   見える・隠れるは大きな地図と同じ（CSS の :has）。一度だけ作り、戦を入り直しても同じ物を使う。
function closeBigmap(hud) {
  if (window.__game?.toggleBigMap && window.__game.hud === hud) window.__game.toggleBigMap();
  else hud.toggleMap();
}
function bigmapTools(hud) {
  if (document.getElementById('bigmap-tools')) return;
  const root = $('hud'); if (!root) return;
  const el = document.createElement('div');
  el.id = 'bigmap-tools';
  const icon = (d) => `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="${d}" stroke="#14120f" stroke-width="8" stroke-linecap="round" fill="none"/><path d="${d}" stroke="#fff3df" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`;
  el.innerHTML = `<button type="button" data-map-tool="close" aria-label="地図を閉じる">${icon('M6 6L22 22M22 6L6 22')}</button>` +
    `<button type="button" data-map-tool="-200" aria-label="地図を拡大する">${icon('M5 14H23M14 5V23')}</button>` +
    `<button type="button" data-map-tool="200" aria-label="地図を縮小する">${icon('M5 14H23')}</button>`;
  const style = document.createElement('style');
  style.textContent = '#bigmap-tools{display:none;position:absolute;right:calc(16px + env(safe-area-inset-right,0px));top:calc(16px + env(safe-area-inset-top,0px));z-index:60;flex-direction:column;gap:8px;pointer-events:auto}' +
    '#hud:has(#bigmap:not([hidden])) #bigmap-tools{display:flex}' +
    // 字の釦は絵の釦と重ねず一つにする。説明の札は絵の釦の左に収める。
    '#hud #maphint .op:has([data-map-zoom]){display:none !important}' +
    '#hud #maphint{right:calc(84px + env(safe-area-inset-right,0px)) !important}' +
    '#bigmap-tools button{width:52px;height:52px;padding:0;display:grid;place-items:center;border-radius:50%;background:rgba(12,10,8,.88);border:2px solid #fff3df;cursor:pointer;touch-action:manipulation}' +
    '#bigmap-tools button:focus-visible{outline:3px solid #fff;outline-offset:2px}';
  el.appendChild(style);
  // 戦場の指の操作（視点・移動）へ渡さず、押した絵だけを効かせる。
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-map-tool]'); if (!b) return;
    const h = window.__game?.hud || hud;
    if (b.dataset.mapTool === 'close') closeBigmap(h);
    else h.zoomBigmap(+b.dataset.mapTool);
  });
  root.appendChild(el);
}

export class HudMapControls {


  toggleMap() {
    this.bigmap = !this.bigmap;
    if (this.bigmap) { this.bigC = null; this.bigUser = false; this.bigRange = null; }
    $('bigmap').hidden = !this.bigmap;
    bigmapTools(this);
    const mh = $('maphint');
    mh.hidden = !this.bigmap;
    clearTimeout(this.mhT);
    if (this.bigmap) {
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      const rows = (this.rt?.allyMapRows || []).filter((r) => r.active && sightRef(this.rt, r, r));
      mh.innerHTML = `<div class="op" style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn" data-map-zoom="-200">地図を拡大する</button><button type="button" class="btn" data-map-zoom="200">地図を縮小する</button><button type="button" class="btn" id="map-close">地図を閉じる</button></div><details><summary style="min-height:44px;cursor:pointer">地図の印・操作・味方の名を見る</summary><div class="lg"><span>▲自分</span><span>●自分の組</span><span>■味方</span><span>▲敵</span><span>◇任務</span><span>本陣は本陣の旗</span></div><div class="lg std"><span>${STD_SVG.honjin}本陣</span><span>${STD_SVG.spear}槍・弓</span><span>${STD_SVG.gun}鉄砲</span><span>${STD_SVG.cavalry}騎馬</span></div><p>${lead ? '地図を押すと、号令先の隊がそこへ向かいます。' : '地図で戦場を見渡せます。'}下の顔の札で隊を選べます。</p>${rows.map((r) => `<p>${r.number}　${esc(r.name)}　${esc(r.action || '')}</p>`).join('')}</details>${simpleControls(this.rt) ? '' : `<details><summary style="min-height:44px;cursor:pointer">小地図の広さを選ぶ</summary><div class="op" style="display:flex;flex-wrap:wrap;gap:8px">${[40,60,100].map((r) => `<button type="button" class="btn" data-map-range="${r}" aria-pressed="${(this.mmRange || 60) === r}">${destinationDistance(this.rt, r)}</button>`).join('')}</div></details>`}`;
      mh.querySelectorAll('button').forEach((b) => { b.style.minHeight = '44px'; b.onkeydown = (e) => { e.stopPropagation(); }; });
      mh.onclick = (e) => {
        e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mapZoom) this.zoomBigmap(+b.dataset.mapZoom);
        if (b.dataset.mapRange) { this.mmRange = +b.dataset.mapRange; mh.querySelectorAll('[data-map-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
        if (b.id === 'map-close') closeBigmap(this);
      };
    }
  }


  cycleMinimap() {
    if (simpleControls(this.rt)) return;
    const ranges = [40, 60, 100];
    this.mmRange = ranges[(ranges.indexOf(this.mmRange || 60) + 1) % 3];
    this.flash(`小地図 ${destinationDistance(this.rt, this.mmRange)}`, 'dim');
  }

  zoomBigmap(dy) { this.bigUser = true; this.bigRange = Math.max(40, Math.min(180, (this.bigRange || 170) + dy * 0.1)); }

  // 戦術マップの中心と縮尺を、いま戦っている所（自分・両軍の隊・任務）に合わせる。ホイールで触ったらその縮尺を守る
  fitBigmap(rt) {
    const pts = [rt.player.u.pos];
    for (const g of rt.army.groups) if (g.count && !g.routed && sightRef(rt, g, g.center()) && g.units.some((u) => u.alive && u.type !== 'dummy')) pts.push(g.center());
    for (const m of rt.markers) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q && !m.intelHidden && (!(m.red || m.person) || sightRef(rt, m, q))) pts.push(q); }
    const P = rt.player.u.pos;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of pts) if (Math.hypot(q.x - P.x, q.z - P.z) < 220) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const tc = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    const tr = Math.max(45, Math.min(180, Math.max(x1 - x0, z1 - z0) / 2 * 1.3 + 12));
    // 急に跳ねないよう、少しずつ寄せる
    const c = this.bigC = this.bigC || tc;
    c.x += (tc.x - c.x) * 0.2; c.z += (tc.z - c.z) * 0.2;
    if (!this.bigUser) this.bigRange = (this.bigRange || tr) + (tr - (this.bigRange || tr)) * 0.2;
  }

  // 戦術マップ上の点を、戦場の位置に直す
  mapToWorld(cv, clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const Sz = cv.width;
    const px = (clientX - r.left) / r.width * Sz, py = (clientY - r.top) / r.height * Sz;
    const sc = Sz / 2 / (this.bigRange || 170);
    const c = this.bigC || { x: 0, z: 0 };
    return { x: c.x + (px - Sz / 2) / sc, z: c.z + (py - Sz / 2) / sc };
  }


  // 方角の帯（北東南西・任務・敵勢・自分の組）
  updateCompass(rt) {
    // 方位磁針は見た目が変わらない細かさで十分（毎コマでなく 20 回/秒ほどに絞る。重い戦ほど助かる）
    if (rt.t - (this._compassT || -1) < 0.05) return;
    this._compassT = rt.t;
    const el = $('compass');
    const p = rt.player;
    // clientWidth は描き直しを強いるので、二秒に一度だけ測る
    if (el._w === undefined || rt.t - el._wt > 2 || rt.t < el._wt) { el._w = el.clientWidth || 480; el._wt = rt.t; }
    const W = el._w;
    const items = [];
    const dirs = [['北', Math.PI], ['東', Math.PI / 2], ['南', 0], ['西', -Math.PI / 2]];
    for (const [t, a] of dirs) items.push({ a, html: `<b>${t}</b>`, cls: 'dir' });
    for (let k = 0; k < 8; k++) if (k % 2) items.push({ a: k * Math.PI / 4, html: '<i></i>', cls: 'tick' });
    const pu = p.u.pos;
    for (const m of rt.markers) {
      // 稲生の行き先は地面の印一本。味方の持ち場を金の目標として重ねない。
      if (rt.def.key === 'inou' || rt.def.key === 'okehazama') continue;
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      const distance = destinationDistance(rt, d);
      items.push({ a: Math.atan2(q.x - pu.x, q.z - pu.z), d, hw: distance.length * 6 * (S.uiScale === 'l' ? 1.2 : 1) + 4, html: `<span>◆</span><small>${distance}</small>`, cls: m.red ? 'mk red' : 'mk' });
    }
    for (const g of rt.squadGroups) {
      if (!g.count) continue;
      const c = g.center();
      if (!sightRef(rt, g, c)) continue;
      if (Math.hypot(c.x - pu.x, c.z - pu.z) < 6) continue;
      items.push({ a: Math.atan2(c.x - pu.x, c.z - pu.z), html: '<span>●</span>', cls: 'mine' });
    }
    for (const it of items) {
      let rel = it.a - p.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      it.x = Math.abs(rel) > Math.PI / 2 ? null : W / 2 - (rel / (Math.PI / 2)) * (W / 2);
    }
    // 向きが変わるたびに帯全体を作り直さず、札を一度作って位置と表示だけを変える。
    const nodes = el._compassNodes || (el._compassNodes = []);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let node = nodes[i];
      if (!node) { node = document.createElement('div'); nodes.push(node); el.appendChild(node); }
      const cls = `c ${it.cls}`;
      if (node.className !== cls) node.className = cls;
      if (node._h !== it.html) { node.innerHTML = it.html; node._h = it.html; }
      // 距離の札が重なる向きでは近い印だけを出す。字を大きくする設定も幅に含める。
      let crowded = false;
      if (it.x !== null && it.d !== undefined) for (let j = 0; j < items.length; j++) {
        const other = items[j];
        if (other.x !== null && other.d !== undefined && (other.d < it.d || other.d === it.d && j < i) && Math.abs(other.x - it.x) < other.hw + it.hw) { crowded = true; break; }
      }
      const hidden = it.x === null || crowded;
      if (node.hidden !== hidden) node.hidden = hidden;
      if (hidden) continue;
      const left = `${it.x.toFixed(1)}px`;
      if (node._left !== left) { node.style.left = left; node._left = left; }
    }
    // 任務が消えた時も札は捨てず、次の任務で使い直す。
    for (let i = items.length; i < nodes.length; i++) if (!nodes[i].hidden) nodes[i].hidden = true;
  }


  // 号令の輪
  // 選んでいる項目は金の塗り＋「▶」、号令先の隊がいま従っている号令は「今」の印、使えない項目は理由の字
  updateRadial(rt) {
    const el = $('radial');
    const p = rt.player;
    if (!p.radial) { el.hidden = true; this.radialKey = ''; return; }
    el.hidden = false;
    p.syncRadial();
    const gs = this.radialGroups || (this.radialGroups = []); gs.length = 0;
    if (rt.squad.length) for (const g of p.selectedGroups()) if (g.count > 0) gs.push(g);
    const cur = gs.length ? (gs[0].pending ? gs[0].pending.id : gs[0].focus ? 'focus' : gs[0].order) : '';
    const kinds = this.unitKinds || [];
    let tags = '';
    for (let i = 0; i < gs.length; i++) tags += (i ? ',' : '') + tagOf(gs[i]);
    const key = `${p.radialSel ?? ''}|${p.radialPreview ?? ''}|${p.selGroup ?? ''}|${cur}|${rt.G.rank ?? ''}|${RADIAL[3].id ?? ''}|${RADIAL[3].label ?? ''}|${kinds.join(',')}|${tags}`;
    if (key === this.radialKey) return;
    this.radialKey = key;
    const focus = el.contains(document.activeElement) ? document.activeElement : null;
    const focusItem = focus?.dataset.radial, focusTeam = focus?.dataset.radialTeam;
    // 早打ちのキーがある号令は、その鍵を添える（輪を開かなくても出せると覚えられる）
    const qk = { follow: K('follow'), hold: K('hold'), attack: K('attack'), retreat: K('retreat'), rally: K('rally') };
    if (!el.dataset.keys) {
      el.dataset.keys = '1';
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const pl = this.rt?.player; if (pl) { pl.radial = false; pl.radialKeyboard = false; pl.radialSel = -1; pl.tabT = null; } el.hidden = true; $('h-squad').focus({ preventScroll:true }); return; }
        const b = e.target.closest('[data-radial]');
        if (!b) { if (e.target.closest('[data-radial-team]')) e.stopPropagation(); return; }
        if (['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const items = el.querySelectorAll('[data-radial]');
          const i = (+b.dataset.radial + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 7 : 1)) % items.length;
          items[i].focus();
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
      });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-radial]'), team = e.target.closest('[data-radial-team]');
        e.stopPropagation();
        if (team) { this.pickGroup(team.dataset.radialTeam); return; }
        if (!b) return;
        if (b.getAttribute('aria-disabled') === 'true') { b.focus({ preventScroll: true }); b.querySelector('.why')?.setAttribute('role', 'status'); return; }
        const pl = this.rt?.player, item = RADIAL[+b.dataset.radial];
        if (!pl || !item) return;
        if (item.id === 'rally') pl.rally(); else pl.command(item.id);
        pl.radialSel = -1; pl.radial = false; pl.radialKeyboard = false; pl.tabT = null; el.hidden = true;
      });
    }
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', `号令の輪・${GROUP_NAME[p.selGroup] || '全隊'}`);
    el.innerHTML = RADIAL.map((it, i) => {
      const a = i * Math.PI / 4;
      const x = Math.sin(a) * 170, y = -Math.cos(a) * 170;
      const locked = it.min && rt.G.rank < it.min;
      const on = i === (p.radialPreview >= 0 ? p.radialPreview : p.radialSel);
      const now = !locked && it.id === cur;
      const why = locked ? `<small class="why">${esc((RANKS[it.min] || {}).name || '')}から</small>` : '';
      return `<div class="rw ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${now ? 'now' : ''}" role="menuitem" tabindex="0" data-radial="${i}" aria-disabled="${locked ? 'true' : 'false'}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${on ? '<span class="sel">▶</span>' : ''}${it.label}${now ? '<i class="nowm" title="いまの号令">今</i>' : ''}${it.min && rt.G.rank === it.min && !now ? '<i class="newm" title="この身分で増えた号令">新</i>' : ''}${qk[it.id] && !locked ? `<kbd>${esc(qk[it.id])}</kbd>` : ''}${why}</div>`;
    }).join('') +
      `<div class="rc"><strong style="display:block;font-size:max(13px, calc(13px * var(--text-scale, 1)))">号令先：${esc(GROUP_NAME[p.selGroup] || '全隊')}</strong>${p.radialSel >= 0 ? RADIAL[p.radialSel].label : (isTouch ? '指で叩いて<br>選ぶ<br><small>真ん中でやめる</small>' : '手元の操作器で選び<br>たぶを放す<br><small>真ん中で放すとやめる</small>')}` +
      // 号令先の隊：札の並び（選んだ隊は金、数字キーでも選べる）
      (kinds.length > 1 ? `<div class="rg">${['all', ...kinds].map((k, i) => {
        const g = rt.squadGroups.find((x) => x.kind === k && x.count > 0);
        const sel = p.selGroup === k || (p.selGroup === 'all' && k === 'all');
        return `<button type="button" data-radial-team="${k}" class="${sel ? 'on' : ''}" aria-pressed="${sel}" style="min-height:44px;margin:4px">${k === 'all' ? '全隊' : KIND_WORD[k] || '組'}${g ? `<i style="background:${TAG_COL[tagOf(g)]}"></i><small>${tagOf(g) === 'ok' ? '数は十分' : tagOf(g) === 'mid' ? '数が減った' : tagOf(g) === 'gone' ? '隊が崩れた' : '半ばより多く失った'}</small>` : ''}<kbd>${i}</kbd></button>`;
      }).join('')}</div><small class="rgk">${isTouch ? '下の顔の札で号令先' : 'じーか数字で号令先'}</small>` : '') + `</div>`;
    const teams = el.querySelector('.rg'); if (teams) el.appendChild(teams);
    if (focusItem !== undefined) el.querySelector(`[data-radial="${focusItem}"]`)?.focus({ preventScroll:true });
    else if (focusTeam) el.querySelector(`[data-radial-team="${focusTeam}"]`)?.focus({ preventScroll:true });
  }
}
