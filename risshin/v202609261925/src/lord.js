// 織田信長で遊ぶ時の道具（題の画面の「織田信長で出陣」と、日本地図の「織田家を率いる」から使う）
// ・信長がその場にいた戦の一覧と、信長の立場での任務・物語の札
// ・戦の中の信長：姿（units.js の GENERALS）、旗本百人、使番（遠くの味方の備へ「進め・待て・退け」）、討たれたら負け
// 記録は残らない（侍大将で出陣と同じく G.practice）
import { newGame, fillRoster } from './state.js';
import { GENERALS } from './units.js';
import { ORDER_NAME } from './player.js';
import { sfx } from './audio.js';

export const LORD = { key: 'nobunaga', name: '織田信長', title: '織田家当主', clan: '織田家' };

// 信長がその場にいた戦（古い順）。goal は信長の立場の任務（無い戦はもとの任務のまま）
// spawn：信長が立つ所（無ければ戦の定義の spawn）
export const LORD_BATTLES = [
  { scn: 'okehazama', id: 'okehazama', name: '桶狭間', year: '永禄三年（1560）五月十九日　尾張国 中島砦', goal: '今川義元の本陣を突け',
    spawn: { x: 16, z: 184, heading: Math.PI },
    text: ['今川義元、二万五千で尾張へ攻め入る。丸根・鷲津の砦は落ち、家中には籠城を説く者も多い。', '信長は清洲を夜明けに発ち、熱田で兵を揃え、中島砦に入った。手勢は二千ほど。', '豪雨の後、今川の本陣は桶狭間の山あいで休んでいるという。――狙うは、義元の首ひとつ。'],
    button: '中島砦を出る', tip: '行軍の間は旗本と一緒に進み、雨が上がったら号令をかけて義元の本陣へ。首は取らず、討ち捨てにせよ' },
  { scn: 'nobunaga_hoi', id: 'kanegasaki', name: '金ヶ崎の退き口', year: '元亀元年（1570）四月二十八日　越前国 金ヶ崎', goal: '京へ退け（殿は藤吉郎）',
    spawn: { x: 30, z: -2, heading: Math.PI },
    text: ['越前へ攻め入り、手筒山と金ヶ崎の城を落とした。一乗谷まで、あと一息。', 'そこへ知らせが届く。北近江の浅井長政――妹お市の夫が、朝倉方についた。前に朝倉、後ろに浅井。', '殿（しんがり）を木下藤吉郎に任せ、わずかな供で朽木越えに京へ退く。生きて帰れば、また戦える。'],
    button: '陣を払う', tip: '南西の朽木越えの道の口まで旗本と退け。谷の口では松永久秀が朽木元綱を説く間、追手を旗本で防げ' },
  { scn: 'nobunaga_hoi', id: 'anegawa', name: '姉川', year: '元亀元年（1570）六月二十八日　近江国 姉川', goal: '浅井の猛攻を耐えて押し返せ',
    spawn: { x: 30, z: 66, heading: Math.PI },
    text: ['金ヶ崎から逃げ帰って二月。兵を立て直し、浅井の小谷城の南、姉川に陣を張った。', '西の瀬は徳川家康が朝倉に当たる。東の瀬、浅井の正面は織田の十三段。', '浅井の先手は猛将・磯野員昌。段を幾重に破られようと、本陣は退かぬ。'],
    button: '姉川へ', tip: '森・池田・木下の段が前を受ける。崩れそうな所へ旗本を回し、J の使番で柴田らの段に下知を送れ' },
  { scn: 'nobunaga_hoi', id: 'hieizan', name: '比叡山', year: '元亀二年（1571）九月十二日　近江国 坂本', goal: '',
    spawn: null,
    text: ['比叡山延暦寺は、志賀の陣で浅井・朝倉の兵を山にかくまい、織田に従わなかった。', '坂本から山を囲み、明智光秀・佐久間信盛らに山道を登らせる。', '刃向かう僧兵は退ける。――山の煙は、京からも見えるだろう。'],
    button: '坂本から山へ', tip: '門を破る組を守って山門を破れ。逃げる者、手向かわぬ者は討たない' },
  { scn: 'nagashino', id: 'shitaragahara', name: '設楽原', year: '天正三年（1575）五月二十一日　三河国 設楽原', goal: '馬防柵で武田を迎え撃ち、勝頼を退かせよ',
    spawn: { x: -22, z: -46, heading: Math.PI / 2 },
    text: ['武田勝頼、一万五千で長篠城を囲む。徳川家康の求めに応じ、三万の兵で岐阜を発った。', '連吾川の西、設楽原に三重の馬防柵を結わせ、鉄砲をその内に並べた。', '鳶ヶ巣山の砦は夜のうちに落ちた。勝頼は退かず、前へ出てくる。――柵で止め、鉄砲で崩す。'],
    button: '柵の内へ', tip: '柵の外へ出ず、寄せる騎馬を鉄砲と槍で崩せ。勝頼が退いたら、殿の馬場隊を追い討て' },
];
export const lordOf = (id) => LORD_BATTLES.find((b) => b.id === id);

// 信長で遊ぶ保存（記録は残らない）。k は筋書きの鍵
export function lordGame(k) {
  const G = newGame(LORD.name, 'normal', k);
  G.practice = true; G.injured = false;
  G.lord = LORD.key; G.lordTitle = LORD.title; G.lordClan = LORD.clan;
  // 見た目の段は「城主」（金の馬具・金扇の馬印）。号令は全部使える
  G.rank = 4; G.trialStep = 6; G.merit = 400;
  G.stats = { spear: 3, vit: 3, lead: 3 };
  G.owned = [...new Set([...G.owned, 'spear2', 'hat3', 'body2', 'kote', 'haidate', 'suneate', 'haori', 'katana'])];
  Object.assign(G.equip, { weapon: 'spear2', hat: 'hat3', body: 'body2', arm: 'kote', thigh: 'haidate', shin: 'suneate', coat: 'haori' });
  G.aijirushi = 'eiraku';   // 旗本の旗は永楽通宝
  fillRoster(G, 20, 10);
  return G;
}

// 戦の定義を、信長の立つ所だけ替えて使う（中身は元の定義のまま）
export function lordDef(def, id) {
  const L = lordOf(id);
  if (!L || !L.spawn) return def;
  const d = Object.create(def);
  d.spawn = L.spawn;
  return d;
}

// ---------------- 戦の中の信長 ----------------
// 旗本の数（馬廻・母衣衆・鉄砲・弓・長柄）
const HATAMOTO = { spear: 30, gun: 30, bow: 15, cavalry: 25 };
// 信長の後ろのどこに並ぶか（後ろへ m、右へ m）
const PLACE = { cavalry: [-7, 0], spear: [-15, -9], gun: [-15, 9], bow: [-24, 0] };
let cur = null;   // いまの信長の戦

export function applyLord(b) {
  const G = b.G;
  if (!G.lord) return;
  b.lord = true;
  cur = b;
  const u = b.player.u;
  // 姿：織田信長（兜・具足・緋の陣羽織に金の木瓜）。人の形はこの look から作られる（humans.js）
  const gen = GENERALS[LORD.name] || {};
  u.name = LORD.name;
  u.look = { ...u.look, armor: gen.armor, lace: gen.lace, hat: gen.hat, haori: gen.haori, mon: gen.mon, haoriMonCol: gen.haoriMonCol,
    skin: gen.skin, face: 'g:' + LORD.name, menpo: 0, horo: 0, trim: 0xc9a24a };
  // 旗本を百人ほどに（戦の定義や侍大将の組に足りない分を足す）
  const p = u.pos, h = u.heading || 0;
  for (const kind of Object.keys(HATAMOTO)) {
    const gs = b.squadGroups.filter((g) => g.kind === kind);
    const n = HATAMOTO[kind] - gs.reduce((a, g) => a + g.units.length, 0);
    if (n <= 0) continue;
    if (!gs.length) { b.makeSquad({ x: p.x, z: p.z }, h, [{ kind, n, ranks: kind === 'gun' ? 2 : undefined }]); continue; }
    const type = { bow: 'bow', gun: 'gun', cavalry: 'cavalry' }[kind] || 'ashigaru';
    // 馬廻の騎馬は指物を決めずに出す（何人かは背に母衣＝母衣衆になる）。織田でない筋書き（長篠編は徳川）では、織田の旗を差す
    const units = b.army.spawn(gs[0], [{ type, n, o: kind !== 'cavalry' ? { flag: G.aijirushi } : gs[0].faction === 'oda' ? {} : { flag: 'oda' } }]);
    for (const x of units) { x.isSub = true; x.hp = x.maxHp = x.maxHp * 1.15; x.kills = 0; }
    b.squad.push(...units);
  }
  // 旗本を信長の後ろに並べ直す（戦の定義が別の所に組を置いていても）
  const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  for (const g of b.squadGroups) {
    const [bk, sd] = PLACE[g.kind] || [-20, 0];
    g.anchor = { x: p.x + fx * bk + rx * sd, z: p.z + fz * bk + rz * sd };
    g.facing = h; g.order = 'follow'; g.dest = null;
    const n = g.units.length;
    g.units.forEach((x, i) => {
      const s = g.slotPos(i, n);
      x.pos.x = s.x; x.pos.z = s.z; x.pos.y = b.world.heightAt(s.x, s.z);
      x.heading = h;
      if (x.mesh) { x.mesh.position.copy(x.pos); x.mesh.rotation.y = h; }
    });
  }
  b.tracker.subsInit = b.squad.length;
  b.flags.lordSquad0 = b.squad.length;
  // 信長が討たれたら負け（重傷で退くのではなく、戦そのものが終わる）
  b.playerDown = function () {
    const me = this.player.u;
    me.hp = 0; me.alive = false; me.fall = 1; me.deadT = 0;
    this.banner('本陣崩る', `${LORD.name}、討たる`);
    this.say('', '――馬上の信長が崩れ落ちた。旗本が浮き足立つ……', 4);
    this.tracker.main = false;
    this.finish({ down: true }, 5);
  };
  b.after(7, () => b.bark(touchy() ? '左の「使番」で、遠くの味方の備へ「進め・待て・退け」を送れます' : 'J で使番：遠くの味方の備へ「進め・待て・退け」を送れます'));
  mountPanel(b);
}

// 毎コマ（main.js の描画の輪から）：名前と身分の札、本陣の崩れ、使番の札
export function lordFrame(b) {
  if (!b.lord) return;
  const who = document.getElementById('h-who');
  const html = `${LORD.name}<small>${b.G.lordTitle || LORD.title}</small>`;
  if (who && who.innerHTML !== html) who.innerHTML = html;
  // 旗本が一割五分を切れば、本陣が崩れて負け
  if (!b.over && b.t > 20 && b.flags.lordSquad0) {
    const alive = b.squad.filter((s) => s.alive).length;
    if (alive < b.flags.lordSquad0 * 0.15) {
      b.banner('本陣崩る', '旗本が討ち減らされ、信長は兵を退いた');
      b.tracker.main = false;
      b.finish({ down: true }, 5);
    }
  }
  if (P.open) { P.t -= 1 / 60; if (P.t <= 0) { P.t = 0.5; renderPanel(); } }
  const hide = !!(b.over || b.game.paused || b.game.battle !== b);
  if (P.el) P.el.hidden = !P.open || hide;
  if (P.btn) P.btn.hidden = hide;
}

// ---------------- 使番（遠くの味方の備へ下知を送る） ----------------
const P = { el: null, btn: null, open: false, sel: 0, list: [], t: 0 };
const touchy = () => matchMedia('(pointer: coarse)').matches;
const ORD = [{ id: 'go', label: '進め', key: '1' }, { id: 'hold', label: '待て', key: '2' }, { id: 'back', label: '退け', key: '3' }];
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

// 下知を送れる味方の備：自分の旗本でない、三人より多い味方の隊（近い順）
function corps(b) {
  const p = b.player.u.pos;
  return b.army.groups
    .filter((g) => g.team === 0 && !g.isPlayerSquad && g !== b.player.group && g.count >= 3)
    .map((g) => { const c = g.center(); return { g, c, d: Math.hypot(c.x - p.x, c.z - p.z) }; })
    .sort((a, z) => a.d - z.d).slice(0, 8);
}
const nameOf = (g) => g.name || (g.leader && g.leader.name ? `${g.leader.name}の隊` : '味方の隊');
function dirWord(b, c) {
  const p = b.player.u.pos;
  // 北が -z
  const a = Math.atan2(c.x - p.x, -(c.z - p.z));
  return DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
function nearestFoe(b, c) {
  let best = null, bd = Infinity;
  for (const g of b.army.groups) {
    if (g.team !== 1 || !g.count || g.routed) continue;
    const e = g.center(), d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function mountPanel(b) {
  document.getElementById('lord-panel')?.remove();
  document.getElementById('lord-btn')?.remove();
  injectStyle();
  const el = document.createElement('section');
  el.id = 'lord-panel';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '使番を送る');
  document.body.appendChild(el);
  P.el = el; P.open = false; P.sel = 0;
  // 指の端末：左上の「視点」の下に「使番」
  const tc = document.getElementById('tc');
  if (tc && touchy()) {
    const bt = document.createElement('button');
    bt.id = 'lord-btn'; bt.className = 'tb sq'; bt.type = 'button';
    bt.textContent = '使番';
    bt.setAttribute('aria-label', '使番を送る（遠くの味方の備へ下知）');
    bt.addEventListener('click', () => toggle());
    tc.appendChild(bt);
    P.btn = bt;
  } else P.btn = null;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ord]');
    if (t) { send(+t.dataset.row, t.dataset.ord); return; }
    const r = e.target.closest('[data-row]');
    if (r) { P.sel = +r.dataset.row; renderPanel(); return; }
    if (e.target.closest('#lord-close')) toggle(false);
  });
}

function toggle(on = !P.open) {
  const b = cur;
  if (!b || b.over || b.game.battle !== b) return;
  P.open = on;
  if (on) { P.sel = 0; P.t = 0.5; renderPanel(); sfx('ui'); }
  if (P.el) P.el.hidden = !on;
}

function renderPanel() {
  const b = cur;
  if (!b || !P.el) return;
  P.list = corps(b);
  if (P.sel >= P.list.length) P.sel = Math.max(0, P.list.length - 1);
  const rows = P.list.map(({ g, c, d }, i) => {
    const marching = g.order === 'path';
    const st = marching ? '行軍中' : g.order === 'follow' ? 'ついて来る' : ORDER_NAME[g.order] || '待つ';
    return `<li class="${i === P.sel ? 'on' : ''}" data-row="${i}" aria-current="${i === P.sel}"><div class="lp-nm"><b>${esc(nameOf(g))}</b><small>${dirWord(b, c)} ${Math.round(d)}m・${g.count}人・いま「${st}」</small></div>` +
      `<div class="lp-ord">${ORD.map((o) => `<button type="button" data-row="${i}" data-ord="${o.id}" ${marching ? 'disabled' : ''}><kbd>${o.key}</kbd>${o.label}</button>`).join('')}</div></li>`;
  }).join('');
  P.el.innerHTML = `<header><h3>使番を送る</h3><button type="button" id="lord-close" aria-label="閉じる">閉じる<kbd>J</kbd></button></header>` +
    (P.list.length ? `<ol>${rows}</ol>` : '<p class="lp-none">下知を送れる味方の備が近くにいません。</p>') +
    `<p class="lp-help">${touchy() ? '備を選び、「進め・待て・退け」を押す。使番が走って届けます。' : '↑↓ で備を選び、1 進め・2 待て・3 退け。遠い備ほど届くのが遅れます。'}</p>`;
}

function send(row, ord) {
  const b = cur;
  const it = P.list[row];
  if (!b || !it || b.over) return;
  const g = it.g;
  if (g.order === 'path') return;
  const o = ORD.find((x) => x.id === ord);
  const nmG = nameOf(g);
  const secs = Math.max(1, Math.min(9, it.d / 14));
  b.say(LORD.name, `${nmG}へ伝えよ。「${o.label}」じゃ`, 2);
  b.bark(`使番が${nmG}へ走る（${Math.ceil(secs)}秒ほど）`);
  sfx('taiko', 0.3);
  P.open = false;
  if (P.el) P.el.hidden = true;
  b.after(secs, () => {
    if (!g.count || b.over) return;
    const c = g.center();
    const foe = nearestFoe(b, c);
    g.calm = false; g.focus = null;
    if (ord === 'go') {
      g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 70); g.holdFire = false; g.formation = 'line';
      if (foe) { g.anchor = { x: foe.x, z: foe.z }; g.facing = Math.atan2(foe.x - c.x, foe.z - c.z); }
    } else if (ord === 'hold') {
      g.order = 'hold'; g.dest = null; g.anchor = { x: c.x, z: c.z };
    } else {
      // 敵から離れる向きへ二十五 m（敵がいなければ信長の方へ）
      const p = b.player.u.pos;
      let dx = foe ? c.x - foe.x : p.x - c.x, dz = foe ? c.z - foe.z : p.z - c.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const dest = { x: c.x + dx * 25, z: c.z + dz * 25 };
      g.order = 'move'; g.dest = dest; g.speed = 3.2;
      g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...dest }; gg.facing = Math.atan2(-dx, -dz); };
    }
    for (const x of g.units) x.aiT = 0;
    b.bark(`${nmG}「${o.label}、承った！」`);
  });
}

// キー：J で開く・閉じる。開いている間は ↑↓・1〜3 をこの札が使う（号令の数字と取り合わない）
window.addEventListener('keydown', (e) => {
  const b = cur;
  if (!b || !b.lord || b.over || b.game.battle !== b || b.game.paused) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.code === 'KeyJ') { stop(); if (!e.repeat) toggle(); return; }
  if (!P.open) return;
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { stop(); const n = P.list.length || 1; P.sel = (P.sel + (e.code === 'ArrowDown' ? 1 : n - 1)) % n; renderPanel(); return; }
  const k = { Digit1: 'go', Digit2: 'hold', Digit3: 'back' }[e.code];
  if (k) { stop(); if (!e.repeat) send(P.sel, k); return; }
  if (e.code === 'Escape') { toggle(false); }
}, true);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function injectStyle() {
  if (document.getElementById('lord-style')) return;
  const st = document.createElement('style');
  st.id = 'lord-style';
  st.textContent = `
#lord-panel { position: fixed; right: calc(16px + env(safe-area-inset-right, 0px)); top: 50%; transform: translateY(-50%); z-index: 8; width: min(380px, calc(100vw - 32px)); max-height: 78vh; overflow: auto;
  background: rgba(14,11,8,.92); border: 1px solid rgba(194,162,90,.55); border-top: 2px solid var(--shu); color: var(--washi); font-family: var(--ui); padding: 12px 14px; box-shadow: 0 8px 28px rgba(0,0,0,.5); }
#lord-panel[hidden] { display: none; }
#lord-panel header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
#lord-panel h3 { margin: 0; font-family: var(--display); font-size: 17px; letter-spacing: .12em; color: var(--kin); }
#lord-panel ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
#lord-panel li { border: 1px solid rgba(236,228,210,.14); border-left: 3px solid transparent; padding: 6px 8px; cursor: pointer; }
#lord-panel li.on { border-left-color: var(--shu); background: rgba(192,69,46,.14); border-color: rgba(194,162,90,.5); }
#lord-panel .lp-nm b { font-size: 15px; }
#lord-panel .lp-nm small { display: block; font-size: 12.5px; color: var(--washi-dim); margin-top: 2px; }
#lord-panel .lp-ord { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
#lord-panel button { min-height: 44px; font: 600 15px/1.1 var(--ui); color: var(--washi); background: rgba(44,40,33,.9); border: 1px solid rgba(194,162,90,.45); cursor: pointer; padding: 4px 8px; }
#lord-panel button:hover:not([disabled]) { border-color: var(--kin); }
#lord-panel button:active:not([disabled]) { background: rgba(192,69,46,.6); }
#lord-panel button[disabled] { opacity: .45; cursor: not-allowed; }
#lord-panel button:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
#lord-panel kbd { font: 600 12px/1 var(--ui); color: var(--kin); border: 1px solid rgba(194,162,90,.5); padding: 2px 4px; margin-right: 6px; }
#lord-panel #lord-close kbd { margin: 0 0 0 6px; }
#lord-panel .lp-help, #lord-panel .lp-none { margin: 8px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--washi-dim); }
#tc #lord-btn { left: calc(env(safe-area-inset-left, 0px) + 12px); top: calc(env(safe-area-inset-top, 0px) + 178px); width: 52px; height: 52px; border-radius: 12px; }
#tc #lord-btn[hidden] { display: none; }
`;
  document.head.appendChild(st);
}
