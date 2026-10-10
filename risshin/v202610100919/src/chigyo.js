// 侍の村。保存は自由な欄 G.chigyo だけ。描画は札を開いた時だけ行う。
import { BATTLES, scenarioKey, scenario } from './state.js';
import { styleOnce } from './style_once.js';

export const chigyoOn = (G) => !!G && G.rank >= 3 && !G.lord && !G.practice && !G.trialStep && scenarioKey() === 'oda';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function chigyoOf(G) {
  if (!chigyoOn(G)) return null;
  const C = G.chigyo ||= {};
  // 稲葉山を取る前は尾張。賜った村は城下が移っても替えない。
  if (!C.village) C.village = BATTLES[G.battle]?.town === '岐阜' || BATTLES[G.battle]?.town === '安土' ? '美濃国 河渡村' : '尾張国 楽田村';
  const defaults = { fields: 2, water: 0, soldiers: 2, food: 6, at: -1, taxAt: -1, last: '侍となり、村の年貢と人足を預かった。' };
  for (const k of Object.keys(defaults)) if (C[k] === undefined) C[k] = defaults[k];
  return C;
}
const harvest = (C) => C.fields * 2 + C.water * 2;
const troops = (C) => Math.min(C.soldiers, Math.max(0, C.food * 2 - 1));
const WORK = [
  { k: 'fields', name: '田を開く', effect: '田が一枚増える。毎戦の年貢が二石増える。', room: (C) => C.fields < 8, apply: (C) => C.fields++ },
  { k: 'water', name: '用水を直す', effect: '水の通りをよくする。毎戦の年貢が二石増える。', room: (C) => C.water < 3, apply: (C) => C.water++ },
  { k: 'soldiers', name: '村の者を兵に出す', effect: '次の戦から、村の兵が二人増える。兵糧が要る。', room: (C) => C.soldiers < 8, apply: (C) => { C.soldiers = Math.min(8, C.soldiers + 2); } },
];
export function chigyoAct(G, key) {
  const C = chigyoOf(G), w = WORK.find((x) => x.k === key);
  if (!C || !w || C.at === G.battle || C.food < 2 || !w.room(C)) return '';
  C.food -= 2; w.apply(C); C.at = G.battle;
  C.last = `${w.name}仕事を終えた。支度に米二石を使った。`;
  return C.last;
}

// 城下には入口の釦一つ。村の札はここで開く。
export function chigyoEntry(G) {
  return chigyoOn(G) ? '<button type="button" class="btn small" data-chigyo-open style="min-height:44px;margin:8px 8px 8px 0">知行の村を見に行く</button>' : '';
}
const CSS = `<style>
.cg{box-sizing:border-box;width:min(800px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:#14120f;color:#ece4d2;border:1px solid #c2a25a;border-radius:8px;padding:16px;font:15px/1.5 sans-serif}
.cg::backdrop{background:rgba(0,0,0,.7)}.cg h2{margin:0 0 8px;font-size:20px}.cg p{margin:8px 0}.cg canvas{width:100%;height:auto;display:block;border-radius:4px}.cg-layout{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cg-work{display:grid;gap:8px}.cg button{min-height:44px;border:1px solid #c2a25a;background:#30281a;color:#ece4d2;border-radius:6px;font:15px/1.5 sans-serif;padding:8px;cursor:pointer}.cg button:disabled{opacity:.38;cursor:default}.cg button:focus-visible{outline:3px solid #c2a25a;outline-offset:2px;box-shadow:0 0 0 5px #14120f}.cg small{font-size:13px;color:#b9b09c;display:block}.cg-close{margin-bottom:8px}.cg-confirm{margin-top:8px}.cg-confirm .row{display:flex;gap:8px;flex-wrap:wrap}.cg-confirm small{margin:8px 0}.cg-confirm button{margin:0}
@media(max-width:640px){.cg-layout{grid-template-columns:1fr}}
</style>`;
function season(G) {
  const year = BATTLES[G.battle]?.year || '';
  const match = year.match(/（\d+）([一二三四五六七八九十]+)月/);
  const month = match?.[1] || '五';
  return ['十一', '十二', '一', '二'].includes(month) ? 3 : ['三', '四', '五'].includes(month) ? 0 : ['六', '七', '八'].includes(month) ? 1 : 2;
}
const SEASONS = ['春', '夏', '秋', '冬'];
const COLORS = [
  ['#c6dcce', '#719350', '#acd5c6', '#527549'],
  ['#b8d9e3', '#557d3a', '#70a441', '#315d38'],
  ['#dbccae', '#947b42', '#c9ad4f', '#6e7040'],
  ['#d9dfe3', '#a6a99a', '#c6cbc5', '#556b5c'],
];
function drawVillage(canvas, G, C) {
  const c = canvas.getContext('2d'); if (!c) return;
  const s = season(G), p = COLORS[s];
  c.fillStyle = p[0]; c.fillRect(0, 0, 480, 260);
  c.fillStyle = p[1]; c.beginPath(); c.moveTo(0, 65); c.quadraticCurveTo(250, 15, 480, 90); c.lineTo(480, 260); c.lineTo(0, 260); c.fill();
  // 森。木は決まった位置に描き、素材も動きも増やさない。
  for (let i = 0; i < 18; i++) {
    const x = 12 + i * 26, y = 65 + i % 4 * 6;
    c.fillStyle = '#63513d'; c.fillRect(x, y, 4, 23);
    c.fillStyle = p[3]; c.beginPath(); c.arc(x + 2, y, 14, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = '#c2d7cf'; c.lineWidth = 8 + C.water * 2;
  c.beginPath(); c.moveTo(0, 126); c.bezierCurveTo(140, 91, 285, 145, 480, 120); c.stroke();
  for (let i = 0; i < C.fields; i++) {
    const x = 18 + i % 4 * 82, y = 145 + Math.floor(i / 4) * 52;
    c.fillStyle = '#705c3f'; c.fillRect(x, y, 76, 46); // 畦
    c.fillStyle = p[2]; c.fillRect(x + 4, y + 4, 68, 38);
    c.strokeStyle = s === 2 ? '#766429' : '#4e7950'; c.lineWidth = 1;
    for (let r = 0; r < 5; r++) { c.beginPath(); c.moveTo(x + 8, y + 8 + r * 7); c.lineTo(x + 67, y + 8 + r * 7); c.stroke(); }
    c.strokeStyle = '#b6d8d6'; c.beginPath(); c.moveTo(x + 77, 127); c.lineTo(x + 77, y + 44); c.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = 360 + i % 2 * 54, y = 155 + i * 24;
    c.fillStyle = '#d3b68d'; c.fillRect(x, y, 38, 25);
    c.fillStyle = '#5e4734'; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 19, y - 20); c.lineTo(x + 44, y); c.fill();
    c.fillStyle = '#453a2c'; c.fillRect(x + 15, y + 8, 9, 17);
  }
}
export function chigyoBind(G, done, confirm) {
  const opener = document.querySelector('[data-chigyo-open]'); if (!opener) return;
  opener.onclick = () => {
    const C = chigyoOf(G); if (!C) return;
    styleOnce('chigyo', CSS);
    const dialog = document.createElement('dialog'); dialog.className = 'cg';
    dialog.setAttribute('aria-labelledby', 'cg-title');
    const paint = () => {
      const used = C.at === G.battle;
      dialog.innerHTML = `<button type="button" class="cg-close">城下へ戻る</button><h2 id="cg-title">${esc(C.village)}・${SEASONS[season(G)]}の村</h2><div class="cg-layout"><div><canvas width="480" height="260" role="img" aria-label="田${C.fields}枚、畦、家、用水、森のある${SEASONS[season(G)]}の村"></canvas><p>田${C.fields}枚・用水${C.water}段・村の兵${C.soldiers}人</p><p>米の蓄え${C.food}石。次の戦の後の年貢${harvest(C)}石。</p><p>次の戦へ村の兵${troops(C)}人。米一石で自分と村の兵を二人まで養い、体力が一割増す。</p><small>戦場が混む時は、入れる兵だけ連れる。年貢は戦の間の収穫をまとめた遊びの数。</small></div><div><p>戦の間に、村の仕事を一つ。どの仕事でも次の戦は同じ。</p><p role="status">${esc(C.last)}</p><div class="cg-work">${WORK.map((w) => `<div><button type="button" data-cg-work="${w.k}" ${used || C.food < 2 || !w.room(C) ? 'disabled' : ''}>${w.name}</button><small>${used ? '● 済・次の戦の後にまた選べる。' : !w.room(C) ? '● 済・これ以上は増やせない。' : C.food < 2 ? '米が二石要る。戦から戻ると年貢が入る。' : `${w.effect} 支度に米二石。`}</small></div>`).join('')}</div><div class="cg-confirm"></div></div></div>`;
      drawVillage(dialog.querySelector('canvas'), G, C);
      dialog.querySelector('.cg-close').onclick = () => dialog.close();
      dialog.querySelectorAll('[data-cg-work]').forEach((button) => { button.onclick = () => {
        const w = WORK.find((x) => x.k === button.dataset.cgWork);
        confirm(dialog.querySelector('.cg-confirm'), `${w.name}。${w.effect}`, w.name, () => {
          const msg = chigyoAct(G, w.k);
          if (msg) { done(msg); paint(); dialog.querySelector('.cg-close').focus(); }
        }, { sub: '米二石を使う。この戦の間は、ほかの村の仕事を選べない。' });
      }; });
    };
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.addEventListener('close', () => { dialog.remove(); document.querySelector('[data-chigyo-open]')?.focus({ preventScroll: true }); });
    document.body.appendChild(dialog); paint(); dialog.showModal();
  };
}

// 他の支度の兵が揃った後に呼ぶ。人数は実際に空いている枠だけ。
export function chigyoBattle(rt) {
  if (!chigyoOn(rt.G) || rt.def.town || rt.def.dojo || rt.def.mapCastle || rt.realm.chigyo) return;
  const C = chigyoOf(rt.G), P = rt.player.u;
  const n = Math.max(0, Math.min(troops(C), 235 - rt.army.units.filter((u) => u.alive).length));
  const units = [];
  if (n) {
    const h = P.heading || 0;
    const g = rt.army.addGroup({ team: 0, faction: scenario().faction, name: '村の兵', order: 'follow', formation: 'line', facing: h, anchor: { x: P.pos.x - Math.sin(h) * 7, z: P.pos.z - Math.cos(h) * 7 }, aggro: 8, spacing: 1.5, morale: 80, noRout: false });
    g.kind = 'tegei';
    units.push(...rt.army.spawn(g, [{ type: 'ashigaru', n, o: { flag: null } }]));
    for (const u of units) { u.isSub = true; u.kills = 0; }
  }
  const food = C.food > 0 ? Math.ceil((units.length + 1) / 2) : 0;
  if (food) {
    C.food -= food;
    P.hp = P.maxHp = P.maxHp * 1.1;
    for (const u of units) u.hp = u.maxHp = u.maxHp * 1.1;
  }
  rt.realm.chigyo = { units, food, held: C.soldiers - units.length };
  rt.after(7, () => { if (!rt.over) rt.bark(`村の兵${units.length}人が付いた。${food ? `村の米${food}石で体力が一割増した` : '村の米は尽きている'}`); });
}
export function chigyoAfter(G, r, rt, i) {
  if (!chigyoOn(G) || rt.def.town || rt.def.dojo || rt.def.mapCastle || BATTLES[i]?.id === 'honnoji' || i >= BATTLES.length - 1) return;
  const had = !!G.chigyo?.village, C = chigyoOf(G);
  if (C.taxAt === i) return;
  r.realmLines ||= [];
  if (!had) r.realmLines.push(`${C.village}の年貢と人足を賜った`);
  const R = rt.realm?.chigyo;
  if (R) {
    const dead = R.units.filter((u) => !u.alive && !(rt.withdrawal && u.gone && u.fleeing && u.hp > 0)).length;
    C.soldiers = Math.max(0, C.soldiers - dead);
    r.realmLines.push(`村の兵${R.units.length}人が出陣・留守${R.held}人。${dead ? `${dead}人が討たれた。` : '皆、村へ戻った。'}米${R.food}石を使った`);
  }
  const nen = Math.min(36 - C.food, harvest(C));
  C.food += nen; C.taxAt = i;
  C.last = `年貢の米${nen}石が入った。蓄え${C.food}石。`;
  r.realmLines.push(`村の年貢　米＋${nen}石（蓄え${C.food}石）`);
}
