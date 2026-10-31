// 戦の前後にだけ読む日本地図。表示時に一度だけ描く。
import { GRID, PROVINCES, MAP_SCENARIOS } from './japan_data.js';
import { gridToLatLon } from './japan_geo.js';
import { ODA_LINE } from './state.js';
import { hideScreen } from './screens.js';
import { sfx } from './audio.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENEMY = {
  inou: '織田信勝（末森）', okehazama: '今川家', moribe: '斎藤家', sunomata: '斎藤家', inabayama: '斎藤家',
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
  ['tonezaka', ['越前の一部', '若狭の一部']], ['odani', ['近江']], ['shigisan', ['大和']], ['arioka', ['摂津']],
  ['miki', ['大村坂周辺']], ['iga', ['伊賀']], ['takato', ['高遠城周辺']], ['tano', ['甲斐', '駿河']],
];
// 同じ国の戦を区別するための升目。城が表にあれば、その位置を使う。
const SPOTS = {
  inou: [500, 752], moribe: [496, 729], sunomata: [497, 722], mitsukuri: [466, 747], kanegasaki: [459, 714],
  anegawa: [455, 719], nodafukushima: [420, 779], shiga: [451, 757], hieizan: [445, 756],
  mikatagahara: [554, 770], tonezaka: [460, 709], nagashima: [495, 766],
  shitaragahara: [545, 758], echizen: [460, 707], echizen_ikko: [468, 690],
  tennoji: [424, 785], saika: [425, 826], tedorigawa: [484, 662], kizugawa: [414, 785],
  arioka: [415, 766], iga: [459, 779], tano: [604, 725], honnoji: [438, 760],
};
const TOWNS = { 清洲: { c: 499, r: 751, kuni: '尾張' }, 岐阜: { c: 501, r: 723, kuni: '美濃' }, 小牧山: { c: 495, r: 734, kuni: '尾張' }, 安土: { c: 451, r: 744, kuni: '近江' } };
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
    const history = G?.history || [];
    const result = history.slice().reverse().find((h) => h?.battleId === id) || history.slice().reverse().find((h) => !h?.battleId && h?.battle === ODA_LINE[at]?.name);
    if (at >= 0 && at < index) {
      if (result?.won === true) for (const name of names) held.add(name);
    }
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
    .campaign canvas{display:block;box-sizing:border-box;width:100%;aspect-ratio:1000/590;background:#141d21;border:1px solid #9a9282;border-radius:4px}
    .campaign-summary{display:none}
    .campaign .campaign-year{color:var(--kin);font-size:16px}.campaign .campaign-enemy{color:var(--shu-text)}
    .campaign .row{gap:8px;flex-wrap:wrap;margin-top:16px}.campaign button{min-height:48px;font-size:16px}
    .campaign button:focus-visible{outline:3px solid #c2a25a;outline-offset:3px;box-shadow:0 0 0 6px #14120f}
    @media(max-height:520px) and (min-width:650px){.campaign{padding:8px 16px}.campaign-layout{gap:16px;grid-template-columns:minmax(0,7fr) minmax(0,3fr)}.campaign h2{font-size:20px}.campaign .campaign-copy{display:none}.campaign-summary{display:block;color:#fff5e1;font-size:16px;line-height:1.6}.campaign-summary p{font-size:16px;margin:4px 0}.campaign-details{min-width:0}.campaign .row{margin-top:8px}.campaign button{width:100%;padding:8px;font-size:16px}}
    @media(max-width:649px){.campaign-layout{grid-template-columns:1fr;gap:16px}.campaign .row{position:sticky;bottom:0;background:#14120f;padding:8px 0}}
  </style><section class="campaign" aria-label="${victory ? '勝った後' : '次の戦'}の日本地図">
    <h2>天下の動き</h2><div class="campaign-layout">
    <canvas width="1000" height="590" role="img" aria-label="日本全体と戦の周りの地図。丸は織田家、三角は敵、二重丸は${victory ? '勝った戦' : '次の戦'}。${esc(battle.place)}で${esc(enemy)}${victory ? 'に勝った' : 'と戦う'}。織田家の広がりは${esc([...after].join('・'))}。"></canvas>
    <div class="campaign-details"><div class="campaign-summary"><p>戦：${esc(battle.place.split(' ').pop())}</p><p>相手：${esc(enemy.replaceAll('家', ''))}</p><p>年：${esc(battle.year.split('（')[0])}</p></div><div class="campaign-copy" tabindex="0" role="region" aria-label="戦の場所と勢力の説明"><div class="campaign-year">${esc(battle.year)}</div><h2>${esc(battle.name)}</h2>
    <p>◎ ${victory ? '勝った戦' : '次の戦'}　${esc(battle.place)}</p><p class="campaign-enemy">▲ 敵　${esc(enemy)}</p>
    <p>● 織田家の広がり<br>${esc([...after].join('・'))}</p>
    </div><div class="row">${victory ? '' : '<button class="btn" data-back>出陣の話へ戻る</button>'}<button class="btn primary ${victory ? '' : 'launch'}" data-go>${victory ? '戦功を見る' : 'この戦へ出陣する'}</button></div>
    </div></div></section>`;
  document.title = `${battle.name}の地図｜戦国立身`;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const paths = provinceShapes(), target = point(...spot);
  // 表示寸法と端末の画素密度から、一度だけ描画面の大きさを決める。
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width - 2), height = Math.max(1, rect.height - 2);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
  ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 590, 0, 0);
  // 縁取りを含めず、表示される字の高さを十二画素以上にする。
  const fontSize = Math.max(26, Math.ceil(12 / Math.min(width / 1000, height / 590)));
  // 地形の塗りも表示時だけ。形は次に地図を開く時にも使い回す。
  const mapBounds = [128.5 * .8, -46, 146 * .8, -30];
  const mw = 1000, mh = 1000;
  function layer(kind) {
    const image = document.createElement('canvas'); image.width = mw; image.height = mh;
    const c = image.getContext('2d');
    c.scale(mw / (mapBounds[2] - mapBounds[0]), mh / (mapBounds[3] - mapBounds[1]));
    c.translate(-mapBounds[0], -mapBounds[1]);
    for (const p of PROVINCES) {
      const ours = held.has(p.name);
      const next = after.has(p.name);
      if (kind === 1 && !ours && p.id !== province.id && !(p.name === '近江' && held.has('南近江'))) continue;
      if (kind === 2 && (!next || ours) && !(p.name === '近江' && after.has('南近江') && !held.has('南近江'))) continue;
      c.fillStyle = kind === 2 || (kind === 1 && ours) ? '#ad8b3e' : kind === 1 ? '#8f4132' : '#46544b';
      if (kind === 0 || (kind === 1 && (ours || p.id === province.id)) || (kind === 2 && next)) c.fill(paths[p.id]);
      // 南近江の一部は国全体を塗らず、南の位置の印だけで示す。
      const partial = p.name === '近江' && (kind === 1 ? held.has('南近江') : kind === 2 && after.has('南近江') && !held.has('南近江'));
      if (partial) {
        const a = point(451, 753);
        c.save(); c.clip(paths[p.id]); c.fillStyle = '#ad8b3e';
        c.beginPath(); c.arc(a[0], a[1], .13, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    // 部分支配は国全体の色にせず、取った場所の印にとどめる。
    const partials = [['越前の一部', '越前', 460, 709], ['若狭の一部', '若狭', 435, 719], ['大村坂周辺', '播磨', 390, 780], ['高遠城周辺', '信濃', 559, 726]];
    for (const [name, kuni, col, row] of partials) {
      if (kind !== 1 || !held.has(name)) continue;
      const p = PROVINCES.find((p) => p.name === kuni), a = point(col, row);
      if (!p) continue;
      c.save(); c.clip(paths[p.id]); c.fillStyle = '#ad8b3e'; c.beginPath(); c.arc(a[0], a[1], .13, 0, Math.PI * 2); c.fill(); c.restore();
    }
    // 国全体を取らない戦では、勝った場所の小さな印だけを広げる。
    if (kind === 2 && !gained.some((name) => PROVINCES.some((p) => p.name === name))) {
      c.save(); c.clip(paths[province.id]); c.fillStyle = '#ad8b3e';
      c.beginPath(); c.arc(target[0], target[1], .18, 0, Math.PI * 2); c.fill(); c.restore();
    }
    return image;
  }
  const land = layer(0), forces = layer(1), gain = victory ? layer(2) : null;
  const town = TOWNS[battle.town];
  const origin = town ? point(town.c, town.r) : null;
  const townProvince = town && (town.kuni ? PROVINCES.find((p) => p.name === town.kuni) : PROVINCES.find((p) => p.id === town.prov));
  const names = new Set(['尾張', '美濃', '近江', '越前', '摂津', '甲斐', '三河', '伊勢', '播磨', province.name, townProvince?.name]);
  const labelsAt = [...names].flatMap((name) => {
    const p = PROVINCES.find((p) => p.name === name);
    return p ? [{ a: point(p.c, p.r), text: (after.has(name) ? '● ' : '') + name }] : [];
  });
  const center = origin || target;
  const near = [Math.min(target[0], center[0]) - .8, Math.min(target[1], center[1]) - .8, Math.max(target[0], center[0]) + .8, Math.max(target[1], center[1]) + .8];
  const mark = victory ? '◎ 勝った戦' : '◎ 次の戦';
  const enemyMark = `▲ ${enemy}`, legend = `● 織田家　▲ 敵　${mark}`;
  const font = `${fontSize}px serif`;
  let markLines, enemyLines;
  function prepareLabels() {
    ctx.font = font;
    const wrap = (text) => {
      const lines = []; let line = '';
      for (const ch of text) {
        if (line && ctx.measureText(line + ch).width > 690) { lines.push({ text: line, width: ctx.measureText(line).width }); line = ''; }
        line += ch;
      }
      if (line) lines.push({ text: line, width: ctx.measureText(line).width });
      return lines;
    };
    markLines = wrap(`${mark}　${battle.place.split(' ').pop()}`); enemyLines = wrap(enemyMark);
  }
  prepareLabels();
  // 札の箱を縁取り込みで測り、近い空き場所へずらす。表示時だけ使う。
  function drawLabel(lines, x, y, w, h, px, top, occupied) {
    const bw = Math.max(...lines.map((line) => line.width)) + 12;
    const bh = fontSize * 1.3 * lines.length + 12;
    const left = x + 4, right = x + w - bw - 4;
    const bottom = y + h - bh - 4;
    const preferredX = Math.max(left, Math.min(px + 20, right));
    const preferredY = Math.max(y + 4, Math.min(top - fontSize - 6, bottom));
    let box = null, distance = Infinity;
    const consider = (bx, by) => {
      if (bx < left || bx > right || by < y + 4 || by > bottom) return;
      if (occupied.some((b) => bx < b.x + b.w + 8 && bx + bw + 8 > b.x && by < b.y + b.h + 8 && by + bh + 8 > b.y)) return;
      const d = (bx - preferredX) ** 2 + (by - preferredY) ** 2;
      if (d < distance) { distance = d; box = { x: bx, y: by, w: bw, h: bh }; }
    };
    consider(preferredX, preferredY);
    if (!box) {
      const step = Math.max(8, fontSize / 2);
      for (let by = y + 4; by <= bottom; by += step) {
        consider(preferredX, by);
        for (let bx = left; bx <= right; bx += step) consider(bx, by);
      }
    }
    // 入り切らない地名は省く。戦の札と相手の札を先に確保する。
    if (!box) return;
    occupied.push(box);
    ctx.fillStyle = '#14120f';
    for (let row = 0; row < lines.length; row++) {
      const tx = box.x + 6, ty = box.y + 6 + fontSize + row * fontSize * 1.3;
      ctx.strokeText(lines[row].text, tx, ty); ctx.fillText(lines[row].text, tx, ty);
    }
    return box;
  }
  function drawView(x, y, w, h, bounds, labels, spread, march, won) {
    const scale = Math.min(w / (bounds[2] - bounds[0]), h / (bounds[3] - bounds[1]));
    const ox = x + (w - (bounds[2] - bounds[0]) * scale) / 2 - bounds[0] * scale;
    const oy = y + (h - (bounds[3] - bounds[1]) * scale) / 2 - bounds[1] * scale;
    const px = ox + target[0] * scale, py = oy + target[1] * scale;
    const sx = ox + (origin || target)[0] * scale, sy = oy + (origin || target)[1] * scale;
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
    if (!victory && origin && march > 0) {
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
      ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff';
      // 二重丸の場所も空ける。地名・相手・戦の札を同じ箱の列で管理する。
      const occupied = [{ x: px - 17, y: py - 17, w: 34, h: 34 }];
      const battleBox = drawLabel(markLines, x, y, w, h, px, py + 8, occupied);
      drawLabel(enemyLines, x, y, w, h, px, py + fontSize + 18, occupied);
      for (const { a, text } of labelsAt) {
        const tx = ox + a[0] * scale, ty = oy + a[1] * scale;
        if (tx < x || tx > x + w || ty < y || ty > y + h) continue;
        drawLabel([{ text, width: ctx.measureText(text).width }], x, y, w, h, tx - 20, ty, occupied);
      }
      // ずらした戦の札と二重丸を線で結び、戦場の位置を明確にする。
      if (battleBox) {
        const ex = Math.max(battleBox.x, Math.min(px, battleBox.x + battleBox.w));
        const ey = Math.max(battleBox.y, Math.min(py, battleBox.y + battleBox.h));
        const length = Math.hypot(ex - px, ey - py);
        ctx.strokeStyle = '#fff0ca'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + (ex - px) * 16 / length, py + (ey - py) * 16 / length);
        ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // 演出用の毎コマ描画や寸法監視は持たず、完成した地図を一度描く。
  ctx.fillStyle = '#141d21'; ctx.fillRect(0, 0, 1000, 590);
  drawView(8, 40, 245, 490, mapBounds, false, 1, 1, 1);
  drawView(280, 40, 710, 490, near, true, 1, 1, 1);
  ctx.font = font; ctx.textAlign = 'left';
  ctx.fillStyle = '#14120f'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  for (const [text, x, y] of [['日本全体', 24, 32], ['戦の周り', 296, 32], [legend, 296, 568]]) {
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
  }
  let done = false;
  const go = (fn) => { if (done) return; done = true; sfx('ui'); fn(); };
  root.querySelector('[data-back]')?.addEventListener('click', () => go(onBack));
  root.querySelector('[data-go]').onclick = () => go(onNext);
  root.querySelector('section').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || victory) return;
    e.preventDefault(); go(onBack);
  });
  root.querySelector('[data-go]').focus({ preventScroll: true });
}
