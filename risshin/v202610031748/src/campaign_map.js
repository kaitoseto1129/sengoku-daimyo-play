// 出陣の前にだけ読む、描き直しの輪を持たない日本地図。
import { GRID, PROVINCES, MAP_SCENARIOS } from './japan_data.js';
import { gridToLatLon } from './japan_geo.js';
import { ODA_LINE } from './state.js';
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

export function campaignMap(battle, onNext, onBack) {
  const index = ODA_LINE.findIndex((b) => b.id === battle.id);
  const held = new Set(['尾張']);
  for (const [id, names] of EXPANSION) {
    if (ODA_LINE.findIndex((b) => b.id === id) < index) for (const name of names) held.add(name);
  }
  if (held.has('近江')) held.delete('南近江');
  const province = PROVINCES.find((p) => battle.place.startsWith(p.name));
  const castleName = battle.place.split(' ').pop().replace('稲葉山', '岐阜');
  const castle = MAP_SCENARIOS.nagashino.castles.find((c) => c.name === castleName);
  const spot = SPOTS[battle.id] || (castle ? [castle.c, castle.r] : [province.c, province.r]);
  const enemy = ENEMY[battle.id];
  hideScreen();
  const root = document.getElementById('screen');
  root.hidden = false; root.className = ''; root.scrollTop = 0;
  root.innerHTML = `<style>
    .campaign{width:min(1100px,100%);margin:auto;color:var(--washi);padding:16px;box-sizing:border-box}
    .campaign h2{font-size:24px;margin:0 0 8px}.campaign p{font-size:15px;line-height:1.6;margin:8px 0}
    .campaign-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);gap:24px;align-items:center}
    .campaign canvas{display:block;width:100%;aspect-ratio:1000/590;background:#141d21;border:1px solid #9a9282;border-radius:4px}
    .campaign .campaign-year{color:var(--kin);font-size:16px}.campaign .campaign-enemy{color:var(--shu-text)}
    .campaign small{display:block;font-size:13px;line-height:1.6;color:var(--washi-dim)}
    .campaign .row{gap:8px;flex-wrap:wrap;margin-top:16px}.campaign button{min-height:48px;font-size:16px}
    .campaign button:focus-visible{outline:3px solid #c2a25a;outline-offset:3px;box-shadow:0 0 0 6px #14120f}
    @media(max-height:520px) and (min-width:650px){.campaign{padding:8px 16px}.campaign-layout{gap:16px;grid-template-columns:minmax(0,1fr) minmax(260px,.8fr)}.campaign canvas{max-height:calc(100dvh - 80px);object-fit:contain}.campaign h2{font-size:20px}.campaign p{margin:4px 0}.campaign .row{margin-top:8px}}
    @media(max-width:649px){.campaign-layout{grid-template-columns:1fr;gap:16px}.campaign .row{position:sticky;bottom:0;background:#14120f;padding:8px 0}}
  </style><section class="campaign" aria-label="次の戦の日本地図">
    <h2>天下の動き</h2><div class="campaign-layout">
    <canvas width="1000" height="590" role="img" aria-label="日本全体と戦の周りの地図。丸は織田家、三角は敵、二重丸は次の戦。${esc(battle.place)}で${esc(enemy)}と戦う。織田家の広がりは${esc([...held].join('・'))}。"></canvas>
    <div><div class="campaign-year">${esc(battle.year)}</div><h2>${esc(battle.name)}</h2>
    <p>◎ 次の戦　${esc(battle.place)}</p><p class="campaign-enemy">▲ 敵　${esc(enemy)}</p>
    <p>● 織田家の広がり<br>${esc([...held].join('・'))}</p>
    <small>広がりはおよその目安です。国の中には、まだ敵の土地もあります。</small>
    <div class="row"><button class="btn" data-back>出陣の話へ戻る</button><button class="btn primary" data-go>この戦へ出陣する</button></div>
    </div></div></section>`;
  document.title = `${battle.name}の地図｜戦国立身`;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const paths = provinceShapes(), target = point(...spot);
  // 縮めて見せても、地図の字が十二画素より小さくならないようにする。
  const fontSize = Math.max(26, Math.ceil(12000 / Math.max(1, canvas.clientWidth)));
  function drawView(x, y, w, h, bounds, labels) {
    const scale = Math.min(w / (bounds[2] - bounds[0]), h / (bounds[3] - bounds[1]));
    const ox = x + (w - (bounds[2] - bounds[0]) * scale) / 2 - bounds[0] * scale;
    const oy = y + (h - (bounds[3] - bounds[1]) * scale) / 2 - bounds[1] * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(ox, oy); ctx.scale(scale, scale);
    for (const p of PROVINCES) {
      ctx.fillStyle = held.has(p.name) || (p.name === '近江' && held.has('南近江')) ? '#ad8b3e' : p.id === province.id ? '#8f4132' : '#46544b';
      ctx.fill(paths[p.id]);
    }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const px = ox + target[0] * scale, py = oy + target[1] * scale;
    ctx.strokeStyle = '#fff0ca'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, labels ? 13 : 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, labels ? 7 : 3, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `${fontSize}px serif`; ctx.fillStyle = '#ece4d2'; ctx.textAlign = 'left';
    if (labels) {
      ctx.lineWidth = 6; ctx.strokeStyle = '#14120f';
      ctx.strokeText('◎ 次の戦', px + 20, py + 8); ctx.fillText('◎ 次の戦', px + 20, py + 8);
      ctx.fillStyle = '#f0ac96';
      ctx.strokeText(`▲ ${enemy}`, px + 20, py + fontSize + 18); ctx.fillText(`▲ ${enemy}`, px + 20, py + fontSize + 18);
      ctx.fillStyle = '#ece4d2';
      for (const name of ['尾張', '美濃', '近江', '越前', '摂津', '甲斐', '三河', '伊勢', '播磨']) {
        const p = PROVINCES.find((p) => p.name === name), a = point(p.c, p.r);
        const tx = ox + a[0] * scale, ty = oy + a[1] * scale;
        if (Math.hypot(tx - px, ty - py) < 55) continue;
        ctx.strokeText((held.has(name) ? '● ' : '') + name, tx, ty);
        ctx.fillText((held.has(name) ? '● ' : '') + name, tx, ty);
      }
    }
    ctx.restore();
  }
  ctx.fillStyle = '#141d21'; ctx.fillRect(0, 0, 1000, 590);
  // 西日本から東北までの全国図と、次の戦を中心にした拡大図。
  drawView(8, 40, 245, 490, [128.5 * .8, -46, 143 * .8, -30], false);
  const west = Math.min(target[0] - 2.2, 135 * .8), east = Math.max(target[0] + 2.2, 137.5 * .8);
  drawView(280, 40, 710, 490, [west, target[1] - 1.5, east, target[1] + 1.5], true);
  ctx.font = `${fontSize}px serif`; ctx.fillStyle = '#ece4d2';
  ctx.fillText('日本全体', 24, 32); ctx.fillText('戦の周り', 296, 32);
  ctx.fillText('● 織田家　▲ 敵　◎ 次の戦', 296, 568);
  let done = false;
  const go = (fn) => { if (done) return; done = true; sfx('ui'); fn(); };
  root.querySelector('[data-back]').onclick = () => go(onBack);
  root.querySelector('[data-go]').onclick = () => go(onNext);
  root.querySelector('[data-go]').focus({ preventScroll: true });
}
