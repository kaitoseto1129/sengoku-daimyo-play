// 侍の村。保存は自由な欄 G.chigyo だけ。描画は札を開いた時だけ行う。
import { BATTLES, scenarioKey, scenario, addKan, zeni } from './state.js';
import { styleOnce } from './style_once.js';

export const chigyoOn = (G) => !!G && G.rank >= 3 && !G.lord && !G.practice && !G.trialStep && scenarioKey() === 'oda';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function chigyoOf(G) {
  if (!chigyoOn(G)) return null;
  const C = G.chigyo ||= {};
  // 稲葉山を取る前は尾張。賜った村は城下が移っても替えない。
  if (!C.village) C.village = BATTLES[G.battle]?.town === '岐阜' || BATTLES[G.battle]?.town === '安土' ? '美濃国 河渡村' : '尾張国 楽田村';
  const defaults = { fields: 2, water: 0, soldiers: 2, food: 6, town: 1, mine: 1, gate: 1, temple: 1, survey: 0, market: 0, road: 0, fort: 0, separate: 0, unrest: 0, seasonAt: '', event: '', at: -1, taxAt: -1, last: '侍となり、村の年貢と人足を預かった。' };
  for (const k of Object.keys(defaults)) if (C[k] === undefined) C[k] = defaults[k];
  return C;
}
// 値は知行内の働きの段数。鉱山は小さな採掘場で、史実の領有を足さない。
const harvest = (C) => C.fields * 2 + C.water * 2 + C.survey;
const troops = (C) => Math.min(C.soldiers, Math.max(0, C.food * (2 + C.road) - 1), Math.max(0, C.soldiers - C.unrest));
export const chigyoUsed = (G) => G.chigyo?.at === G.battle || G.dom?.at === G.battle || (G.dom?.workAt === G.battle && G.dom?.workN > 0);
const WORK = [
  { k: 'survey', name: '検地で田を調べる', cost: 1, effect: '田と年貢を確かめる。田が一枚増え、兵糧が四石増える。不満も一つ増す。', room: (C) => C.survey < 3 && C.fields < 8, apply: (C) => { C.fields++; C.survey++; C.food = Math.min(36, C.food + 4); C.unrest = Math.min(3, C.unrest + 1); } },
  { k: 'market', name: '楽市楽座で商いを広げる', cost: 2, effect: '町が一段育つ。商人から兵糧四石が届く。関所の取り立ては減る。', room: (C, G) => C.market < 3 && ['岐阜', '安土'].includes(BATTLES[G.battle]?.town), apply: (C) => { C.market++; C.town++; C.gate = Math.max(0, C.gate - 1); C.food = Math.min(36, C.food + 4); if (C.event === 'merchant') C.event = ''; } },
  { k: 'road', name: '街道を普請して米を運ぶ', cost: 1, effect: '街道と関所が一段育つ。米一石で養える村の兵が一人増える。商人の頼みも済む。', room: (C) => C.road < 3, apply: (C) => { C.road++; C.gate++; C.food = Math.min(36, C.food + 2); if (C.event === 'merchant') { C.town++; C.event = ''; } } },
  { k: 'fort', name: '城を普請して具足を守る', cost: 2, effect: '蔵と具足の置き場を整える。次の戦から自分と村の兵の体力が一段につき三％増す。', room: (C) => C.fort < 3, apply: (C) => { C.fort++; } },
  { k: 'separate', name: '兵と農の役目を分ける', cost: 2, effect: '田に残す者と戦う者を決める。村の兵が二人増え、突きが一段につき三％強くなる。', room: (C) => C.separate < 3 && C.soldiers < 8, apply: (C) => { C.separate++; C.soldiers = Math.min(8, C.soldiers + 2); } },
  { k: 'mine', name: '鉱山の坑道を直す', cost: 1, effect: '鉱山が一段育つ。採掘の銭一貫と兵糧二石を受け取り、次の戦に備える。', room: (C) => C.mine < 4, apply: (C, G) => { C.mine++; addKan(G, 1); C.food = Math.min(36, C.food + 2); } },
  { k: 'soldiers', name: '村の兵を補う', cost: 1, effect: '村の兵が二人増える。討たれた兵の席を補い、次の戦に連れる。兵糧も二石を備える。', room: (C) => C.soldiers < 8, apply: (C) => { C.soldiers = Math.min(8, C.soldiers + 2); C.food = Math.min(36, C.food + 2); } },
  { k: 'temple', name: '寺社と村の頼みを聞く', cost: 0, effect: '寺社との結びが育ち、不満が二つ減る。救い米四石が届き、凶作や一揆の備えになる。', room: (C) => C.temple < 4 || C.unrest > 0 || C.event === 'famine' || C.event === 'ikko', apply: (C) => { C.temple = Math.min(4, C.temple + 1); C.unrest = Math.max(0, C.unrest - 2); C.food = Math.min(36, C.food + 4); if (C.event !== 'merchant') C.event = ''; } },
];
export function chigyoReady(G) {
  const C = chigyoOf(G);
  return !!C && !chigyoUsed(G) && WORK.some((w) => w.room(C, G) && (G.kan || 0) >= w.cost);
}
export function chigyoAct(G, key) {
  const C = chigyoOf(G), w = WORK.find((x) => x.k === key);
  if (!C || !w || chigyoUsed(G) || (G.kan || 0) < w.cost || !w.room(C, G)) return '';
  addKan(G, -w.cost); w.apply(C, G); C.at = G.battle;
  C.last = `${w.name}仕事を終えた。${w.cost ? zeni(w.cost) + 'を使った。' : '銭の支払いなし。'}${w.effect}`;
  return C.last;
}
export function chigyoPreview(G) {
  const C = chigyoOf(G);
  return C ? `村の兵${troops(C)}人・米${C.food}石${C.food ? '（米で体力＋十％）' : '（米なし）'}。城の備えで体力＋${C.fort * 3}％・村の兵の突き＋${C.separate * 3}％${C.unrest ? `。村の不満${C.unrest}で兵が減る` : ''}` : '';
}
const EVENTS = { famine: '凶作：米が半分しか取れず、蔵の米も三石減った。寺社と村の頼みを聞くと救い米が届く。', ikko: '一揆：取り立てへの不満が高まり、兵が村に残る。寺社と村の頼みを聞くと不満が減る。', merchant: '商人の頼み：荷車が街道を通れない。街道の普請か楽市楽座で商いを助ける。' };
export function chigyoIncome(G, index = G.battle) {
  const C = chigyoOf(G); if (!C) return null;
  const s = season(G, index), year = BATTLES[index]?.year?.match(/（(\d+)）/)?.[1] || String(index);
  const stamp = `${year}:${s}`;
  const rate = [0.5, 0.25, 1.5, 0.25][s];
  const turn = (Number(year) + s) % 5;
  const event = turn === 0 ? 'famine' : C.unrest >= 2 && C.temple < 3 ? 'ikko' : turn === 2 ? 'merchant' : '';
  return { stamp, event, rate, townRate: [1, 1.5, 1, 0.5][s], season: SEASONS[s], rice: Math.floor(Math.floor(harvest(C) * rate) * (event === 'famine' ? 0.5 : 1)), coins: Math.round((event === 'ikko' ? 0.5 : 1) * (C.town * [1, 1.5, 1, 0.5][s] + C.mine * 0.5 + C.gate * 0.25) * 1000) / 1000, due: C.seasonAt !== stamp };
}

// 城下には入口の釦一つ。村の札はここで開く。
export function chigyoEntry(G) {
  return chigyoOn(G) ? '<button type="button" class="btn small" data-chigyo-open style="min-height:44px;margin:8px 8px 8px 0">知行の村と町を整える</button>' : '';
}
const CSS = `<style>
.cg{box-sizing:border-box;width:min(800px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:#14120f;color:#ece4d2;border:1px solid #c2a25a;border-radius:8px;padding:16px;font:15px/1.5 sans-serif}
.cg::backdrop{background:rgba(0,0,0,.7)}.cg h2{margin:0 0 8px;font-size:20px}.cg p{margin:8px 0}.cg canvas{width:100%;height:auto;display:block;border-radius:4px}.cg-layout{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cg-work{display:grid;gap:8px}.cg button{min-height:44px;border:1px solid #c2a25a;background:#30281a;color:#ece4d2;border-radius:6px;font:15px/1.5 sans-serif;padding:8px;cursor:pointer}.cg button:disabled{opacity:.38;cursor:default}.cg button:focus-visible{outline:3px solid #c2a25a;outline-offset:2px;box-shadow:0 0 0 5px #14120f}.cg small{font-size:13px;color:#b9b09c;display:block}.cg-pages{display:flex;gap:8px;margin-top:8px}.cg-close{margin-bottom:8px}.cg-confirm{margin-top:8px}.cg-confirm .row{display:flex;gap:8px;flex-wrap:wrap}.cg-confirm small{margin:8px 0}.cg-confirm button{margin:0}
@media(max-width:640px){.cg-layout{grid-template-columns:1fr}}
</style>`;
function season(G, index = G.battle) {
  const year = BATTLES[index]?.year || '';
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
  c.fillStyle = '#b9a478'; c.fillRect(0, 238, 480, 6 + C.road * 3);
  for (let i = 0; i < C.town; i++) {
    const x = 16 + i * 48;
    c.fillStyle = '#dab88a'; c.fillRect(x, 99, 30, 22);
    c.fillStyle = '#813f32'; c.fillRect(x - 3, 95, 36, 6);
  }
  c.fillStyle = '#413a30'; c.fillRect(307, 75, 8 + C.mine * 4, 18);
  for (let i = 0; i < C.gate; i++) { c.fillStyle = '#604933'; c.fillRect(320 + i * 20, 222, 5, 22); c.fillRect(315 + i * 20, 222, 18, 4); }
  c.fillStyle = '#ddc49d'; c.fillRect(394, 92, 48, 24);
  c.fillStyle = '#514739'; c.fillRect(388, 85, 60, 8 + C.temple * 2);
  c.fillStyle = '#aaa394'; c.fillRect(441, 126, 32, 16 + C.fort * 12);
  c.fillStyle = '#393930'; c.fillRect(438, 122, 38, 7);

}
export function chigyoBind(G, done, confirm) {
  const opener = document.querySelector('[data-chigyo-open]'); if (!opener) return;
  opener.onclick = () => {
    const C = chigyoOf(G); if (!C) return;
    styleOnce('chigyo', CSS);
    const dialog = document.createElement('dialog'); dialog.className = 'cg';
    dialog.setAttribute('aria-labelledby', 'cg-title');
    let page = 0;
    const paint = () => {
      const used = chigyoUsed(G), income = chigyoIncome(G);
      dialog.innerHTML = `<button type="button" class="cg-close">城下へ戻る</button><h2 id="cg-title">${esc(C.village)}・${SEASONS[season(G)]}の村と町</h2><div class="cg-layout"><div><canvas width="480" height="260" role="img" aria-label="田、町、鉱山、関所、寺社と城の普請の様子"></canvas><p>田${C.fields}・町${C.town}・鉱山${C.mine}・関所${C.gate}・寺社${C.temple}</p><p>米${C.food}石・銭${zeni(G.kan)}・村の不満${C.unrest}。</p><p>次の戦：${esc(chigyoPreview(G))}</p><p>${income.due ? `${income.season}の見込み：年貢の米${income.rice}石・銭${zeni(income.coins)}。` : '今の季節の年貢は受け取り済み。'}同じ年の同じ季節では二重に受け取らない。</p><small>季節は次の戦の年月に合わせる。収入と領地の段数は遊びの数。城の普請は預かった持ち場の備え。兵と農の分けは役目分担で、刀狩ではない。</small></div><div><p>いまの一手：${used ? '内政は済んだ。城下へ戻り出陣に備える。' : C.event ? '村の出来事に備える仕事を一つ選ぶ。' : '村と町を整える仕事を一つ選ぶ。'}屋敷の内政と合わせて一つ。</p><p role="status">${esc(C.last)}</p>${C.event ? `<p>${esc(EVENTS[C.event])}</p>` : ''}<div class="cg-work">${WORK.slice(page * 3, page * 3 + 3).map((w) => `<div><button type="button" data-cg-work="${w.k}" ${used || (G.kan || 0) < w.cost || !w.room(C, G) ? 'disabled' : ''}>${w.name}（${w.cost ? zeni(w.cost) : '銭は不要'}）</button><small>${used ? '● 済・次の戦の後にまた選べる。' : !w.room(C, G) ? w.k === 'market' && !['岐阜', '安土'].includes(BATTLES[G.battle]?.town) ? '稲葉山を取った後、岐阜で選べる。' : '● 済・これ以上は増やせない。' : (G.kan || 0) < w.cost ? `あと${zeni(w.cost - (G.kan || 0))}要る。` : w.effect}</small></div>`).join('')}</div><div class="row cg-pages"><button type="button" data-cg-page="${page - 1}" ${page ? '' : 'disabled'}>前の仕事を見る</button><button type="button" data-cg-page="${page + 1}" ${page === 2 ? 'disabled' : ''}>ほかの仕事を見る</button></div><small>${page + 1}／三組。見るだけでは仕事を選んだ事にならない。</small><div class="cg-confirm"></div></div></div>`;
      drawVillage(dialog.querySelector('canvas'), G, C);
      dialog.querySelectorAll('[data-cg-page]').forEach((button) => { button.onclick = () => { page = Number(button.dataset.cgPage); paint(); dialog.querySelector('[data-cg-work]:not(:disabled),.cg-close')?.focus({ preventScroll: true }); }; });
      dialog.querySelector('.cg-close').onclick = () => dialog.close();
      dialog.querySelectorAll('[data-cg-work]').forEach((button) => { button.onclick = () => {
        const w = WORK.find((x) => x.k === button.dataset.cgWork);
        confirm(dialog.querySelector('.cg-confirm'), `${w.name}。${w.effect}`, w.name, () => {
          const msg = chigyoAct(G, w.k);
          if (msg) { done(msg); paint(); dialog.querySelector('.cg-close').focus(); }
        }, { sub: `${w.cost ? zeni(w.cost) + 'を使う。' : '銭は使わない。'}この戦の間は、屋敷を含めほかの内政を選べない。` });
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
  const food = C.food > 0 ? Math.ceil((units.length + 1) / (2 + C.road)) : 0;
  if (food) {
    C.food -= food;
    P.hp = P.maxHp = P.maxHp * 1.1;
    for (const u of units) u.hp = u.maxHp = u.maxHp * 1.1;
  }
  const fort = 1 + C.fort * 0.03;
  P.hp *= fort; P.maxHp *= fort;
  for (const u of units) { u.hp *= fort; u.maxHp *= fort; u.dmg *= 1 + C.separate * 0.03; }
  rt.realm.chigyo = { units, food, held: C.soldiers - units.length };
  rt.after(7, () => { if (!rt.over) rt.bark(`村の兵${units.length}人。米${food}石${food ? 'で体力＋十％' : '・米なし'}${C.fort ? `。城の備えで体力＋${C.fort * 3}％` : ''}${C.separate ? `。村の兵の突き＋${C.separate * 3}％` : ''}`); });
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
  const income = chigyoIncome(G, i);
  C.taxAt = i;
  if (!income.due) { r.realmLines.push(`${income.season}の年貢は受け取り済み。村の米${C.food}石`); return; }
  C.seasonAt = income.stamp;
  // 出来事は季節ごとに一度だけ。読み直しで振り直さず、史実の戦や敵味方は替えない。
  C.event = income.event;
  if (C.event === 'famine') C.food = Math.max(0, C.food - 3);
  if (C.event === 'ikko') C.unrest = Math.min(3, C.unrest + 1);
  const nen = Math.max(0, Math.min(36 - C.food, income.rice));
  const coins = income.coins;
  C.food += nen; addKan(G, coins);
  C.last = `${income.season}の年貢の米${nen}石と銭${zeni(coins)}が入った。${C.event ? EVENTS[C.event] : '村と町は穏やか。'}`;
  r.realmLines.push(C.last);
}
