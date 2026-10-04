// 戦の前後にだけ読む日本地図。地形は一度描き、短い動きの間だけ写す。
import { GRID, PROVINCES, MAP_SCENARIOS } from './japan_data.js';
import { gridToLatLon } from './japan_geo.js';
import { ODA_LINE } from './state.js';
import { reduceMotion } from './settings.js';
import { hideScreen } from './screens.js';
import { sfx } from './audio.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENEMY = {
  okehazama: '今川家', moribe: '斎藤家', sunomata: '斎藤家', inabayama: '斎藤家',
  mitsukuri: '六角家', okawachi: '北畠家', kanegasaki: '朝倉家・浅井家', anegawa: '浅井家・朝倉家',
  nodafukushima: '三好家・本願寺', shiga: '朝倉家・浅井家', hieizan: '延暦寺', mikatagahara: '武田家',
  tonezaka: '朝倉家', odani: '浅井家', nagashima: '長島の一向一揆', shitaragahara: '武田家',
  echizen: '越前の一向一揆', echizen_ikko: '越前の一向一揆', iwamura: '武田家', tennoji: '本願寺',
  saika: '雑賀衆', tedorigawa: '上杉家', shigisan: '松永家', kizugawa: '毛利家', miki: '別所家',
  arioka: '荒木家', iga: '伊賀の地侍', tottori: '毛利家', takato: '武田家', tano: '武田家', honnoji: '明智家',
};
// 戦う前の勢力の目安。国の一部の支配や争いが残る所も含む。
const EXPANSION = [
  ['inabayama', ['美濃']], ['mitsukuri', ['南近江', '山城']], ['okawachi', ['伊勢']],
  ['odani', ['近江', '越前', '若狭']], ['shigisan', ['大和']], ['arioka', ['摂津']],
  ['miki', ['播磨']], ['iga', ['伊賀']], ['takato', ['信濃']], ['tano', ['甲斐', '駿河']],
];
// 同じ国の戦を区別するための升目。城が表にあれば、その位置を使う。
const SPOTS = {
  moribe: [496, 729], sunomata: [497, 722], mitsukuri: [466, 747], kanegasaki: [459, 714],
  anegawa: [455, 719], nodafukushima: [420, 779], shiga: [451, 757], hieizan: [445, 756],
  mikatagahara: [554, 770], tonezaka: [460, 709], nagashima: [495, 766],
  shitaragahara: [545, 758], echizen: [460, 707], echizen_ikko: [468, 690],
  tennoji: [424, 785], saika: [425, 826], tedorigawa: [484, 662], kizugawa: [414, 785],
  arioka: [415, 766], iga: [459, 779], tano: [604, 725], honnoji: [438, 760],
};
let shapes = null;
const point = (c, r) => { const [lon, lat] = gridToLatLon(c, r); return [lon * .8, -lat]; };
function provinceShapes() {
  if (shapes) return shapes;
  shapes = PROVINCES.map(() => new Path2D());
  const { alpha, gc, step } = GRID;
  let k = 0;
  for (let i = 0; i < GRID.prov.length; i += 2) {
    const id = alpha.indexOf(GRID.prov[i]) - 1;
    let n = alpha.indexOf(GRID.prov[i + 1]);
    while (n > 0) {
      const c = k % gc, r = Math.floor(k / gc), len = Math.min(n, gc - c);
      if (id >= 0) {
        const path = shapes[id], a = point(c * step, r * step), b = point((c + len) * step, r * step);
        const d = point(c * step, (r + 1) * step), e = point((c + len) * step, (r + 1) * step);
        path.moveTo(...a); path.lineTo(...b); path.lineTo(...e); path.lineTo(...d); path.closePath();
      }
      k += len; n -= len;
    }
  }
  return shapes;
}

export function campaignMap(battle, onNext, onBack, { G, victory = false } = {}) {
  const index = ODA_LINE.findIndex((b) => b.id === battle.id);
  const held = new Set(['尾張']);
  for (const [id, names] of EXPANSION) {
    const at = ODA_LINE.findIndex((b) => b.id === id);
    const result = G?.history?.find((h) => h?.battle === ODA_LINE[at]?.name);
    if (at >= 0 && at < index && result?.won !== false) for (const name of names) held.add(name);
  }
  if (held.has('近江')) held.delete('南近江');
  const province = PROVINCES.find((p) => battle.place.startsWith(p.name)) || PROVINCES.find((p) => p.name === '尾張');
  const castleName = battle.place.split(' ').pop().replace('稲葉山', '岐阜');
  const castle = MAP_SCENARIOS.nagashino.castles.find((c) => c.name === castleName);
  const spot = SPOTS[battle.id] || (castle ? [castle.c, castle.r] : [province.c, province.r]);
  const enemy = ENEMY[battle.id] || '相手の軍';
  const gained = victory ? (EXPANSION.find(([id]) => id === battle.id)?.[1] || []) : [];
  const after = new Set(held);
  for (const name of gained) after.add(name);
  if (after.has('近江')) after.delete('南近江');
  hideScreen();
  const root = document.getElementById('screen');
  root.hidden = false; root.className = ''; root.scrollTop = 0;
  root.innerHTML = `<style>
    .campaign{width:min(1100px,100%);margin:auto;color:var(--washi);padding:16px;box-sizing:border-box}
    .campaign h2{font-size:24px;margin:0 0 8px}.campaign p{font-size:15px;line-height:1.6;margin:8px 0}
    .campaign-details{min-width:0}.campaign-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);gap:24px;align-items:center}
    .campaign canvas{display:block;width:100%;aspect-ratio:1000/590;background:#141d21;border:1px solid #9a9282;border-radius:4px}
    .campaign .campaign-year{color:var(--kin);font-size:16px}.campaign .campaign-enemy{color:var(--shu-text)}
    .campaign small{display:block;font-size:13px;line-height:1.6;color:var(--washi-dim)}
    .campaign .row{gap:8px;flex-wrap:wrap;margin-top:16px}.campaign button{min-height:48px;font-size:16px}
    .campaign button:focus-visible{outline:3px solid #c2a25a;outline-offset:3px;box-shadow:0 0 0 6px #14120f}
    @media(max-height:520px) and (min-width:650px){.campaign{padding:8px 16px}.campaign-layout{gap:16px;grid-template-columns:minmax(0,1fr) minmax(260px,.8fr)}.campaign canvas{max-height:calc(100dvh - 80px);object-fit:contain}.campaign h2{font-size:20px}.campaign p{margin:4px 0}.campaign-details{max-height:calc(100dvh - 56px);overflow:auto}.campaign .row{margin-top:8px;position:sticky;bottom:0;background:#14120f;padding:8px 0}}
    @media(max-width:649px){.campaign-layout{grid-template-columns:1fr;gap:16px}.campaign .row{position:sticky;bottom:0;background:#14120f;padding:8px 0}}
  </style><section class="campaign" aria-label="${victory ? '勝った後' : '次の戦'}の日本地図">
    <h2>天下の動き</h2><div class="campaign-layout">
    <canvas width="1000" height="590" role="img" aria-label="日本全体と戦の周りの地図。丸は織田家、三角は敵、二重丸は${victory ? '勝った戦' : '次の戦'}。${esc(battle.place)}で${esc(enemy)}${victory ? 'に勝った' : 'と戦う'}。織田家の広がりは${esc([...after].join('・'))}。"></canvas>
    <div class="campaign-details"><div class="campaign-year">${esc(battle.year)}</div><h2>${esc(battle.name)}</h2>
    <p>◎ ${victory ? '勝った戦' : '次の戦'}　${esc(battle.place)}</p><p class="campaign-enemy">▲ 敵　${esc(enemy)}</p>
    <p>● 織田家の広がり<br>${esc([...after].join('・'))}</p>
    <small>色と道は遊びの目安です。史実の領土や進軍路とは異なります。</small><p data-motion role="status">${victory ? '勝った場所から、織田家の色が広がる' : '勢力の広がり → 軍の道 → 戦の場所'}</p>
    <div class="row">${victory ? '' : '<button class="btn" data-back>出陣の話へ戻る</button><button class="btn" data-skip>動きを飛ばす</button>'}<button class="btn primary" data-go>${victory ? '動きを飛ばして戦功を見る' : 'この戦へ出陣する'}</button></div>
    </div></div></section>`;
  document.title = `${battle.name}の地図｜戦国立身`;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const paths = provinceShapes(), target = point(...spot);
  // 縮めて見せても、地図の字が十二画素より小さくならないようにする。
  const fontSize = Math.max(26, Math.ceil(12000 / Math.max(1, canvas.clientWidth)));
  // 地形の塗りは画面を開いた時だけ。毎コマは小さな絵を写すだけにする。
  const mapBounds = [128.5 * .8, -46, 146 * .8, -30];
  const mw = 1000, mh = 1000;
  function layer(kind) {
    const image = document.createElement('canvas'); image.width = mw; image.height = mh;
    const c = image.getContext('2d');
    c.scale(mw / (mapBounds[2] - mapBounds[0]), mh / (mapBounds[3] - mapBounds[1]));
    c.translate(-mapBounds[0], -mapBounds[1]);
    for (const p of PROVINCES) {
      const ours = held.has(p.name) || (p.name === '近江' && held.has('南近江'));
      const next = after.has(p.name) || (p.name === '近江' && after.has('南近江'));
      if (kind === 1 && !ours && p.id !== province.id) continue;
      if (kind === 2 && (!next || ours)) continue;
      c.fillStyle = kind === 2 || (kind === 1 && ours) ? '#ad8b3e' : kind === 1 ? '#8f4132' : '#46544b';
      c.fill(paths[p.id]);
    }
    // 領土が増えない戦では、勝った場所の小さな印だけを広げる。
    if (kind === 2 && !gained.length) {
      c.save(); c.clip(paths[province.id]); c.fillStyle = '#ad8b3e';
      c.beginPath(); c.arc(target[0], target[1], .18, 0, Math.PI * 2); c.fill(); c.restore();
    }
    return image;
  }
  const land = layer(0), forces = layer(1), gain = victory ? layer(2) : null;
  const town = MAP_SCENARIOS.nagashino.castles.find((c) => c.name === battle.town + '城');
  const origin = town ? point(town.c, town.r) : point(493, 737);
  const names = ['尾張', '美濃', '近江', '越前', '摂津', '甲斐', '三河', '伊勢', '播磨'];
  const labelsAt = names.map((name) => { const p = PROVINCES.find((p) => p.name === name); return { name, a: point(p.c, p.r), text: (after.has(name) ? '● ' : '') + name }; });
  const near = [Math.min(target[0] - 2.2, 135 * .8), target[1] - 1.5, Math.max(target[0] + 2.2, 137.5 * .8), target[1] + 1.5];
  const bounds = [...mapBounds];
  const mark = victory ? '◎ 勝った戦' : '◎ 次の戦';
  const enemyMark = `▲ ${enemy}`, legend = `● 織田家　▲ 敵　${mark}`, font = `${fontSize}px serif`;
  ctx.font = font;
  const markWidth = ctx.measureText(mark).width, enemyWidth = ctx.measureText(enemyMark).width;
  function drawView(x, y, w, h, bounds, labels, spread, march, won) {
    const scale = Math.min(w / (bounds[2] - bounds[0]), h / (bounds[3] - bounds[1]));
    const ox = x + (w - (bounds[2] - bounds[0]) * scale) / 2 - bounds[0] * scale;
    const oy = y + (h - (bounds[3] - bounds[1]) * scale) / 2 - bounds[1] * scale;
    const px = ox + target[0] * scale, py = oy + target[1] * scale;
    const sx = ox + origin[0] * scale, sy = oy + origin[1] * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const ix = ox + mapBounds[0] * scale, iy = oy + mapBounds[1] * scale;
    const iw = (mapBounds[2] - mapBounds[0]) * scale, ih = (mapBounds[3] - mapBounds[1]) * scale;
    ctx.drawImage(land, ix, iy, iw, ih);
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, spread * 18 * scale), 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(forces, ix, iy, iw, ih); ctx.restore();
    if (gain) {
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, Math.max(1, won * 18 * scale), 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(gain, ix, iy, iw, ih); ctx.restore();
    }
    if (!victory && march > 0) {
      const mx = sx + (px - sx) * march, my = sy + (py - sy) * march;
      ctx.strokeStyle = '#fff0ca'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.fillStyle = '#fff0ca'; ctx.beginPath(); ctx.moveTo(mx, my - 9); ctx.lineTo(mx - 7, my + 7); ctx.lineTo(mx + 7, my + 7); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = '#fff0ca'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, labels ? 13 : 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, labels ? 7 : 3, 0, Math.PI * 2); ctx.stroke();
    ctx.font = font; ctx.fillStyle = '#ece4d2'; ctx.textAlign = 'left';
    if (labels) {
      ctx.lineWidth = 6; ctx.strokeStyle = '#14120f';
      const tx = Math.min(px + 20, x + w - markWidth - 8);
      ctx.strokeText(mark, tx, py + 8); ctx.fillText(mark, tx, py + 8);
      ctx.fillStyle = '#f0ac96';
      const ex = Math.min(px + 20, x + w - enemyWidth - 8);
      ctx.strokeText(enemyMark, ex, py + fontSize + 18); ctx.fillText(enemyMark, ex, py + fontSize + 18);
      ctx.fillStyle = '#ece4d2';
      for (const { a, text } of labelsAt) {
        const tx = ox + a[0] * scale, ty = oy + a[1] * scale;
        if (Math.hypot(tx - px, ty - py) < 55) continue;
        ctx.strokeText(text, tx, ty);
        ctx.fillText(text, tx, ty);
      }
    }
    ctx.restore();
  }
  let done = false, frame = 0, last = 0;
  const start = performance.now(), duration = victory ? 3200 : 4200;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  const go = (fn) => { if (done) return; done = true; cancelAnimationFrame(frame); sfx('ui'); fn(); };
  const skip = root.querySelector('[data-skip]');
  const status = root.querySelector('[data-motion]');
  function paint(elapsed) {
    const spread = victory ? 1 : clamp(elapsed / 1200);
    const march = clamp((elapsed - 1000) / 1500);
    const zoom = victory ? 1 : clamp((elapsed - 2500) / 1700);
    const eased = zoom * zoom * (3 - 2 * zoom);
    for (let j = 0; j < 4; j++) bounds[j] = mapBounds[j] + (near[j] - mapBounds[j]) * eased;
    ctx.fillStyle = '#141d21'; ctx.fillRect(0, 0, 1000, 590);
    drawView(8, 40, 245, 490, mapBounds, false, spread, march, clamp(elapsed / 2500));
    drawView(280, 40, 710, 490, bounds, zoom === 1, spread, march, clamp(elapsed / 2500));
    ctx.font = font; ctx.fillStyle = '#ece4d2'; ctx.textAlign = 'left';
    ctx.fillText('日本全体', 24, 32); ctx.fillText(zoom === 1 ? '戦の周り' : '軍の動き', 296, 32);
    ctx.fillText(legend, 296, 568);
  }
  function finish() {
    cancelAnimationFrame(frame); paint(duration);
    status.textContent = victory ? '織田家の色が広がった' : '戦の場所に着いた。出陣できます';
    if (victory) root.querySelector('[data-go]').textContent = '戦功を見る';
    if (skip) {
      const focused = document.activeElement === skip; skip.hidden = true;
      if (focused) root.querySelector('[data-go]').focus({ preventScroll: true });
    }
  }
  function tick(now) {
    if (done || !canvas.isConnected || root.hidden) return;
    const elapsed = reduceMotion() ? duration : now - start;
    if (elapsed >= duration) { finish(); if (victory) go(onNext); return; }
    // 携帯向けに三十コマまで。地形・配列・形は使い回す。
    if (now - last >= 33) { paint(elapsed); last = now; }
    frame = requestAnimationFrame(tick);
  }
  root.querySelector('[data-back]')?.addEventListener('click', () => go(onBack));
  root.querySelector('[data-go]').onclick = () => go(onNext);
  if (skip) skip.onclick = finish;
  root.querySelector('section').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (victory) go(onNext); else finish();
  });
  root.querySelector('[data-go]').focus({ preventScroll: true });
  if (reduceMotion()) finish();
  else { paint(0); frame = requestAnimationFrame(tick); }
}
