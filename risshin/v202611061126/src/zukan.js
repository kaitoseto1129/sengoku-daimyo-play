// 武将図鑑と実績（戦功の記録）
// 図鑑：zukan_people.js の名簿（三つの章の戦に出る武将）を出会う順に並べる。会った者だけ 3D の絵と来歴を見せ、会っていない者は影絵
// 実績：戦の終わりに zukanRecord(b, G) を呼ぶと、会った武将を記し、取れた実績の札を出す
// 記録は保存（state.js）とは別の鍵で localStorage に置く。読めない・書けない時は、その場の記憶だけで動く
import { SCENARIOS, BATTLES, ITEMS, HORSES, loadAll, scenarioKey, lineOf } from './state.js';
import { S, reduceMotion } from './settings.js';
import { sfx } from './audio.js';

import { ZK_KEY as KEY, readZukanRaw } from './zukan_store.js';
import { ROSTER, ROSTER_ALIAS } from './bushou_roster.js';
import { ZUKAN_ROWS } from './zukan_people.js';
import { portrait, portraitStop } from './busho_portrait.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = reduceMotion;

// ---------------- 記録 ----------------
let ST = null;
function store() {
  if (ST) return ST;
  ST = readZukanRaw();
  return ST;
}
function keep() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* 書けなくても続ける */ } }

// ---------------- 武将の名簿 ----------------
// 11/2（kaito「150人に」）：図鑑に並べるのは zukan_people.js の名簿だけ（織田家編・豊臣編・徳川編の戦に出る人）。並びは物語で出会う順。
// 会える戦は名簿の戦と、武将の名簿（bushou_roster.js）でその人が出る戦。没年より後の戦は入れない。
const SCN_KEYS = ['oda', 'toyotomi', 'tokugawa'];
// 戦の中の呼び名 → 図鑑の名（名簿の別名と、武将の名簿の別名）
const ALIAS = { 強右衛門: '鳥居強右衛門', 本多作左: '本多重次', 谷大膳: '谷衛好', 木下秀吉: '豊臣秀吉', 藤吉郎: '豊臣秀吉', 河窪信実: '武田信実' };
for (const r of ZUKAN_ROWS) for (const a of r[8].split('・')) if (a) ALIAS[a] = r[0];
for (const [a, n] of Object.entries(ROSTER_ALIAS)) if (!ALIAS[a]) ALIAS[a] = ALIAS[n] || n;
const YEAR_OF = {};
for (const k of SCN_KEYS) for (const b of SCENARIOS[k]?.battles || []) YEAR_OF[b.id] = +((String(b.year).match(/(\d{4})/) || [])[1] || 0);
// 戦の id → その戦で会える名
const MEET = {};
for (const r of ZUKAN_ROWS) {
  const ros = ROSTER[r[0]] || ROSTER[ROSTER_ALIAS[r[0]]] || [r[0], ...r[8].split('・')].map((a) => ROSTER[a]).find(Boolean);
  const ids = new Set([...r[5].split(' '), ...Object.keys(ros?.battles || {})]);
  for (const id of ids) if (YEAR_OF[id] && !(r[3] && YEAR_OF[id] > r[3])) (MEET[id] = MEET[id] || []).push(r[0]);
}
const appearOf = (k, id) => (MEET[id] || []).map((n) => [n]);
// 図鑑では、長い戦の名を短く言い換える。
const WAR_NAME = { sunomata: '墨俣の砦を守る戦', shiga: '宇佐山城の戦い', nagashima: '長島の戦い', echizen: '木ノ芽峠の戦い', echizen_ikko: '大滝寺の戦い', iwamura: '岩村城の戦い', saika: '雑賀の戦い', kizugawa: '木津川口の戦い', miki: '三木城の戦い', iga: '伊賀の戦い', tano: '田野の戦い', kanegasaki: '金ヶ崎から退く戦', hieizan: '比叡山の戦い', honnoji: '本能寺の戦い', shitaragahara: '設楽原の戦い' };
const warName = (b) => WAR_NAME[b.id] || b.name;

let DB = null;
function db() {
  if (DB) return DB;
  const war = {};
  for (const k of SCN_KEYS) for (const b of SCENARIOS[k]?.battles || []) war[b.id] = { id: b.id, name: warName(b), scn: SCENARIOS[k].name, year: YEAR_OF[b.id], i: Object.keys(war).length };
  const list = ZUKAN_ROWS.map((r, i) => ({
    no: i + 1, name: r[0], yomi: r[1], b: r[2], d: r[3], clan: r[4], bio: r[6],
    keys: [r[0], ...r[8].split('・').filter(Boolean)],
    lk: /僧|坊/.test(r[7]) ? 'b' : 'k',
    where: Object.keys(MEET).filter((id) => MEET[id].includes(r[0])).map((id) => war[id]).sort((a, z) => a.year - z.year || a.i - z.i),
  }));
  DB = { list, byName: new Map(list.map((p) => [p.name, p])) };
  return DB;
}
const canon = (raw) => {
  if (!raw) return null;
  const n = String(raw).replace(/^.* /, '').replace(/の(隊|手|備|段|組|旗本|鉄砲|衆)$/, '').replace(/(殿|様)$/, '');
  const k = ALIAS[n] || n;
  return db().byName.has(k) ? k : null;
};
// 会った・討った：前の記録の呼び名（木下藤吉郎など）でも数える
const metAt = (p) => { const m = store().met; for (const k of p.keys) if (m[k]) return m[k]; return 0; };
const isMet = (n) => { const p = db().byName.get(n); return p ? !!metAt(p) : !!store().met[n]; };
const isSlain = (n) => { const p = db().byName.get(n), sl = store().slain || {}; return p ? p.keys.some((k) => sl[k]) : !!sl[n]; };

// これまでの保存から、会った者と取れていた実績を拾う（札は出さない）
function backfill() {
  const st = store();
  let slots = [];
  try { slots = loadAll().filter(Boolean); } catch (e) { slots = []; }
  const t = Date.now();
  for (const g of slots) {
    const sc = SCENARIOS[g.scenario || 'okehazama'];
    if (!sc) continue;
    lineOf(g).slice(0, g.battle || 0).forEach((b) => { for (const [n] of appearOf(g.scenario || 'okehazama', b.id)) if (!st.met[n]) st.met[n] = t; });
  }
  const ctx = { slots };
  for (const a of ACH) if (!st.ach[a.id] && a.save && a.save(ctx)) st.ach[a.id] = t;
  if (Object.keys(st.met).length >= 25 && !st.ach.meet30) st.ach.meet30 = t;
}

// ---------------- 実績 ----------------
// test(c)：戦の終わりに（c は下の zukanRecord で作る）／late(c)：settle の後に（身分・評定）／save(ctx)：保存から拾う
const side = (c, s) => c.side.some((x) => x.includes(s));
const kerai = (g) => (g.kerai || []).filter((k) => k.alive);
const step = (id, name, desc, progress) => ({ id, name, desc, progress,
  save: (x) => x.slots.some((g) => !g.practice && !g.lord && progress(g)) });
const ACH = [
  { id: 'uijin', name: '初陣', desc: 'はじめて戦を終える', test: (c) => !c.dojo, save: (x) => x.slots.some((g) => g.battle > 0) },
  { id: 'ichiban', name: '一番槍', desc: '先頭で槍をつけ、味方がその働きを認める', test: (c) => !c.dojo && c.specials.some((s) => /一番槍/.test(s.label)), save: (x) => x.slots.some((g) => (g.history || []).some((h) => h && (h.deeds || []).some((d) => d.pts > 0 && /一番槍/.test(d.label)))) },
  { id: 'tegara', name: '初手柄', desc: '任務を果たして戦を終える', test: (c) => c.main },
  { id: 'gechi', name: '下知を守り通す', desc: '命令違反も勝手な追撃もせず、任務を果たす', test: (c) => c.main && !c.viol && !c.purs },
  { id: 'nagashi', name: '受け流しの妙', desc: '一つの戦で十回受け流す', test: (c) => c.parries >= 10 },
  { id: 'sandan', name: '三段突き', desc: '一つの戦で三段突きを五回決める', test: (c) => c.thirds >= 5 },
  { id: 'yokoyari', name: '横槍', desc: '一つの戦で組ごと敵の横を二度突く', test: (c) => c.flank >= 2 },
  { id: 'nanori', name: '名のある将を討つ', desc: '敵の武将を討ち取る', test: (c) => c.busho > 0 },
  { id: 'kakezu', name: '一人も欠けず', desc: '組の者を一人も失わずに任務を果たす', test: (c) => c.squad > 0 && c.squadAlive === c.squad && c.main },
  { id: 'hyaku', name: '歴戦の槍', desc: '自ら討った敵が、合わせて百人になる', test: (c) => c.totalKills >= 100, save: (x) => x.slots.some((g) => g.life && g.life.kills >= 100) },
  { id: 'kanja', name: '甲上', desc: '戦の評定で「甲上」を取る', late: (c) => c.grade === '甲上', save: (x) => x.slots.some((g) => (g.grades || []).includes('甲上')) },
  { id: 'kumigashira', name: '足軽組頭へ', desc: '足軽組頭に取り立てられる', late: (c) => c.rank >= 2, save: (x) => x.slots.some((g) => g.rank >= 2) },
  { id: 'taisho', name: '足軽大将へ', desc: '足軽大将に取り立てられる', late: (c) => c.rank >= 4, save: (x) => x.slots.some((g) => g.rank >= 4) },
  { id: 'okehazama', name: '雨の桶狭間', desc: '桶狭間で雨の中を進み、今川の本陣へ入る', test: (c) => c.id === 'okehazama' && c.main && c.flags.rain === true && c.flags.entered === true },
  { id: 'rojo', other: '長篠編', name: '籠城の意地', desc: '長篠城で大手門を守り抜く', test: (c) => c.id === 'nagashinojo' && side(c, '大手門を守った') },
  { id: 'sune', other: '長篠編', name: '強右衛門を送り出す', desc: '見張りに見つからずに、強右衛門を囲みの外へ送り出す', test: (c) => c.id === 'sune' && c.main && side(c, '見つからずに抜けた') },
  { id: 'tobinosu', other: '長篠編', name: '鳶ヶ巣の夜明け', desc: '見つからずに鳶ヶ巣山の砦へ寄せる', test: (c) => c.id === 'tobinosu' && side(c, '見つからずに寄せた') },
  { id: 'teppo', name: '柵の鉄砲', desc: '設楽原で放ての号令を三度聞き、馬防柵を守り抜く', test: (c) => c.id === 'shitaragahara' && c.main && (c.volleys || 0) >= 3 },
  { id: 'akazonae', name: '赤備えを退ける', desc: '設楽原で山県昌景の隊を退ける', test: (c) => c.id === 'shitaragahara' && side(c, '山県昌景隊を退けた') },
  { id: 'suwahara', other: '長篠編', name: '丸馬出を越える', desc: '諏訪原城を攻め落とす', test: (c) => c.id === 'suwahara' && c.main },
  { id: 'shingari', name: '金ヶ崎の殿', desc: '金ヶ崎の退き口で、殿を務め上げる', test: (c) => c.id === 'kanegasaki' && c.main },
  { id: 'anegawa', name: '姉川の横槍', desc: '姉川で、東から回り込む浅井の別手を止める', test: (c) => c.id === 'anegawa' && (side(c, '東の回り込みを止めた') || side(c, '遠藤直経を止めた')) },
  { id: 'hiei', name: '刃向かわぬ者を討たず', desc: '比叡山で、逃げる僧や里の者を一人も討たずに務めを果たす', test: (c) => c.id === 'hieizan' && c.main && side(c, '非戦の者を討たなかった') },
  { id: 'sekigahara', other: '関ヶ原', name: '天下分け目', desc: '関ヶ原で務めを果たす', test: (c) => c.id === 'sekigahara' && c.main },
  { id: 'sanadamaru', other: '大坂の陣', name: '真田丸に挑む', desc: '真田丸の柵を破る', test: (c) => c.id === 'sanadamaru' && side(c, '真田丸の柵を破った') },
  { id: 'ikkiuchi', other: '天下の地図', name: '一騎打ちで城主を討つ', desc: '城攻めで、城将との一騎打ちに勝つ', test: (c) => c.special === '一騎打ちで討ち取り' },
  { id: 'rakujo', other: '天下の地図', name: '城を落とす', desc: '天下の地図から攻めた城を落とす', test: (c) => c.map && c.won && !c.defend },
  { id: 'dojo', name: '稽古場の十人抜き', desc: '稽古場で、倒れるまでに十人を討つ', test: (c) => c.dojo && c.dojoKills >= 10 },
  { id: 'meet30', name: '二十五人と会う', desc: '図鑑で二十五人の武将と会う', test: (c) => c.metCount >= 25, prog: (st) => [Object.keys(st.met).length, 25] },
  // 837：織田家編の戦ごとの目当て（どの戦にも一つ）
  { id: 'hayashi', name: '林美作守を討つ', desc: '稲生で林美作守を討ち取る', test: (c) => c.id === 'inou' && c.bushoNames.some((n) => n.includes('林美作')) },
  { id: 'busho10', name: '十人の将を討つ', desc: '敵の武将を、合わせて十人討ち取る', test: (c) => c.bushoTotal >= 10, prog: (st) => [st.n.busho || 0, 10] },
  { id: 'zensen', name: '全ての戦に勝つ', desc: '全ての戦で務めを果たす', late: (c) => c.allWon, save: (x) => x.slots.some((g) => !g.practice && (g.grades || []).filter((v) => v && v !== '丙').length >= BATTLES.length) },
  { id: 'moribe', name: '森部の横槍', desc: '森部で日比野下野守を討ち取る', test: (c) => c.id === 'moribe' && c.bushoNames.some((n) => n.includes('日比野')) },
  { id: 'sunomata', name: '一夜の砦', desc: '墨俣で柵を一本も破らせずに砦を守る', test: (c) => c.id === 'sunomata' && c.main && c.flags.perfect === true },
  { id: 'inabayama', name: '美濃を取る', desc: '伝承をもとにした裏道攻めで合図の火を上げ、城の囲みを支える', test: (c) => c.id === 'inabayama' && c.main && c.special === '搦手から本丸に火を放った' },
  { id: 'mitsukuri', name: '一夜で落とす', desc: '夜のうちに箕作城を落とす', test: (c) => c.id === 'mitsukuri' && c.main },
  { id: 'nodafukushima', name: '竹束の陰', desc: '野田・福島で組と竹束を並べ、囲まれる前に退く', test: (c) => c.id === 'nodafukushima' && c.main && side(c, '組で竹束を並べた') },
  { id: 'shiga', name: '宇佐山を守る', desc: '宇佐山城を守り通す', test: (c) => c.id === 'shiga' && c.main },
  { id: 'mikatagahara', name: '生きて浜松へ', desc: '三方ヶ原から浜松城へ退く', test: (c) => c.id === 'mikatagahara' && c.main },
  { id: 'odani', name: '京極丸', desc: '小谷城で京極丸を守り、小丸の守りを崩す', test: (c) => c.id === 'odani' && c.main && side(c, '京極丸を取った') },
  { id: 'nagashima', name: '岸の柵', desc: '長島で岸の柵を守り切る', test: (c) => c.id === 'nagashima' && c.main },
  { id: 'takato', name: '高遠の塀', desc: '高遠城の守りを破り、本丸まで攻め入る', test: (c) => c.id === 'takato' && c.main },
  { id: 'honnoji', name: '本能寺の朝', desc: '本能寺で信長を守って戦い、生き延びる', test: (c) => c.id === 'honnoji' && c.main },

  { id: 'okawachi', name: '囲みの先の和睦', desc: '大河内城の囲みを保ち、北畠との和睦を迎える', test: (c) => c.id === 'okawachi' && c.main },
  { id: 'tonezaka', name: '峠から一乗谷へ', desc: '刀根坂で朝倉勢を崩し、一乗谷まで追う', test: (c) => c.id === 'tonezaka' && c.main },
  { id: 'echizen', name: '木ノ芽峠を越える', desc: '越前で山道を進み、峠の砦を落とす', test: (c) => c.id === 'echizen' && c.main },
  { id: 'echizen_ikko', name: '大滝寺の山狩り', desc: '越前の山狩りで大滝寺を攻め落とす（伝承）', test: (c) => c.id === 'echizen_ikko' && c.main },
  { id: 'iwamura', name: '水晶山の夜を守る', desc: '岩村で夜討ちを退け、城のふもとまで追う', test: (c) => c.id === 'iwamura' && c.main && side(c, '夜討ちを受け止めた') },
  { id: 'tennoji', name: '天王寺の囲みを破る', desc: '天王寺砦の囲みを破り、敵を押し戻す', test: (c) => c.id === 'tennoji' && c.main },
  { id: 'saika', name: '川向こうに踏みとどまる', desc: '雑賀で小雑賀川の東岸を守る', test: (c) => c.id === 'saika' && c.main },
  { id: 'tedorigawa', name: '手取川を生きて渡る', desc: '手取川で最後尾を守り、生きて川を渡る', test: (c) => c.id === 'tedorigawa' && c.main },
  { id: 'shigisan', name: '信貴山の天守へ', desc: '信貴山城を攻め、天守の前まで進む', test: (c) => c.id === 'shigisan' && c.main },
  { id: 'kizugawa', name: '鉄の船の一撃', desc: '木津川口で敵の大船に大鉄砲を当て、海を守る', test: (c) => c.id === 'kizugawa' && c.main && side(c, '引き付けた敵の大船に大鉄砲を当てた') },
  { id: 'miki', name: '兵糧の道を断つ', desc: '三木の大村坂で別所勢を討ち、兵糧の道を断つ', test: (c) => c.id === 'miki' && c.main },
  { id: 'arioka', name: '上ろう塚の木戸を守る', desc: '有岡の惣構えに入り、上ろう塚の木戸を固める', test: (c) => c.id === 'arioka' && c.main },
  { id: 'iga', name: '伊賀の土橋を守る', desc: '伊賀で土橋の味方を守り、比自山城を取る', test: (c) => c.id === 'iga' && c.main && side(c, '南の土橋で木戸の組を守った') },
  { id: 'tottori', name: '鳥取の城が開く', desc: '鳥取城の囲みを守り、開城の使いを送る', test: (c) => c.id === 'tottori' && c.main },
  { id: 'tano', name: '谷道を切り開く', desc: '田野の谷道を進み、敵の柵を押さえる', test: (c) => c.id === 'tano' && c.main },
  // 出世・家臣・外交は、城下で選んだ後と戦の精算後だけ調べる。
  step('kumi_ready', 'はじめて組を預かる', '足軽組頭候補になる', (g) => g.rank >= 1),
  step('taisho_ready', '大将への一歩', '足軽大将候補になる', (g) => g.rank >= 3),
  step('kerai_first', 'はじめての家臣', '家臣を一人召し抱える', (g) => (g.kerai || []).length > 0),
  step('kerai_three', '三人の支え', '生きている家臣が三人そろう', (g) => kerai(g).length >= 3),
  step('kerai_gou', '家臣の名が広まる', '家臣に二つ名が付く', (g) => (g.kerai || []).some((k) => k.gou)),
  step('kerai_loyal', '深い忠義', '家臣の忠義を百まで上げる', (g) => kerai(g).some((k) => k.loy >= 100)),
  step('dip_first', '隣の家への一歩', 'はじめて外交の用を果たす', (g) => (g.dip?.at ?? -1) >= 0),
  step('dip_friend', '隣の家と親しく', 'ほかの家との仲を六割まで深める', (g) => Object.values(g.dip?.rel || {}).some((v) => v >= 60)),
  step('dip_wed', '家と家を結ぶ', '婚姻の仲立ちをする', (g) => (g.dip?.wed || []).length > 0),
  { id: 'dip_turn', name: '話し合いで敵を退ける', desc: '使者の働きで敵の一隊を退かせる', test: (c) => c.dip?.kind === 'turn' && c.dip.ok === true && c.dip.moved === true },
  { id: 'dip_aid', name: '約束の援軍', desc: '仲を深めた家の援軍が戦に加わる', test: (c) => c.dip?.kind === 'aid' && c.dip.joined === true },
];
// 844：数で取る実績の途中の数
ACH.find((a) => a.id === 'hyaku').prog = (st) => [st.n.kills, 100];

// ---------------- 取った時の小さな札 ----------------
let toastBox = null;
const toastQ = [];
const toastShown = [];
let toastOn = false, toastPending = false, toastTimer = null, toastWatch = null;
function toast(a) {
  toastQ.push(a);
  if (!toastPending) {
    toastPending = true;
    setTimeout(() => { toastPending = false; nextToast(); }, 0);
  }
}
// 開戦中の実績は待ち列に残し、戦功を記す時に出す。一時停止中も出さない。
function battleNoticeBlocked() {
  const hud = document.getElementById('hud'), pause = document.getElementById('pause');
  return !!(hud?.classList.contains('battle-active') && (!hud.hidden || pause && !pause.hidden));
}
function clearToasts() {
  clearTimeout(toastTimer);
  toastWatch?.disconnect(); toastWatch = null;
  toastBox?.remove(); toastBox = null;
  toastQ.length = 0; toastShown.length = 0; toastOn = false;
}
function nextToast() {
  if (battleNoticeBlocked()) return;
  const resultHost = document.querySelector('.ev-ach-notices');
  // 城下では再生しない。未読の実績は図鑑の「新しい」で知らせる。
  if (!resultHost || resultHost.closest('[hidden]')) { clearToasts(); return; }
  toastShown.push(...toastQ.splice(0));
  if (!toastShown.length) return;
  css();
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'zk-toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
  }
  resultHost.appendChild(toastBox);
  // 三枚に収めるため、四件以上なら二枚と残りのまとめ札にする。
  const notices = toastShown.length <= 3 ? toastShown : [...toastShown.slice(0, 2), {
    name: `ほか ${toastShown.length - 2} つの実績`, desc: '図鑑で見る',
  }];
  toastBox.replaceChildren(...notices.map((a) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'zk-toast' + (RM() ? ' rm' : '');
    el.innerHTML = `<i aria-hidden="true">功</i><div><small>実績を得た</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`;
    el.onclick = (e) => { e.stopPropagation(); clearToasts(); zukanOpen('ach'); };
    return el;
  }));
  if (!toastOn) {
    toastOn = true;
    try { sfx('merit', 0.5); } catch (e) { /* 音が無くても */ }
    toastTimer = setTimeout(clearToasts, 3000);
    toastWatch = new MutationObserver(() => {
      if (!resultHost.isConnected || resultHost.closest('[hidden]') || battleNoticeBlocked()) clearToasts();
    });
    toastWatch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  }
}
function grant(a, silent) {
  const st = store();
  if (st.ach[a.id]) return false;
  st.ach[a.id] = Date.now();
  import('./native_bridge.js').then((m) => m.gcUnlock(a.id)).catch(() => {});
  if (!silent) toast(a);
  return true;
}

// 同じ処理で得た実績はまとめて渡し、表示の上限は小さな札の側で守る。
function announce(got) {
  for (const a of got) toast(a);
}
export function zukanProgress(G, silent = false) {
  const got = [];
  if (!G || G.practice || G.lord) return got;
  const st = store();
  for (const a of ACH) if (a.progress && a.progress(G) && grant(a, true)) {
    got.push(a);
    (st.at = st.at || {})[a.id] = `出世と城下・${G.name || ''}`;
  }
  if (got.length) { keep(); if (!silent) announce(got); }
  return got;
}

// ---------------- 戦の終わりに呼ぶ（main.js の endBattle の頭から） ----------------
export function zukanRecord(b, G) {
  setTimeout(() => { if (!toastOn && toastQ.length) nextToast(); }, 0);
  try {
    const st = store();
    const t = Date.now();
    const def = b.def || {};
    const map = !!def.mapCastle;
    const id = map ? 'map' : def.dojo ? 'dojo' : ((BATTLES[b.index] || {}).id || '');
    // 会った者：この戦の顔ぶれと、戦場にいた名のある者
    const met = new Set();
    for (const [n] of appearOf(scenarioKey(), id)) met.add(n);
    for (const u of (b.army && b.army.units) || []) { const n = canon(u.name); if (n) met.add(n); }
    if (map && def.mapInfo) for (const s of [def.mapInfo.atk, def.mapInfo.def]) if (s) { const n = canon(s.lord) || canon(s.daimyo); if (n) met.add(n); }
    const fresh = [...met].filter((n) => !st.met[n]);
    for (const n of fresh) {
      st.met[n] = t;
      (st.metBattle = st.metBattle || {})[n] = map ? (def.name || '天下の地図の城攻め') : def.dojo ? '稽古場' : warName(BATTLES[b.index] || { id, name: def.name || '名の分からない戦' });
    }
    const tr = b.tracker || {}, s = b.stats || {}, F = b.flags || {};
    // 討った武将（手柄の記録の名）。初めて討った日を残す
    for (const n of new Set((tr.busho || []).map(canon).filter(Boolean))) { const sl = st.slain || (st.slain = {}); if (!sl[n]) sl[n] = t; }
    const squad = (b.squad || []).length;
    const practice = !!(G && (G.practice || G.lord));
    if (!def.dojo && !practice) { st.n.battles++; st.n.kills += s.kills || 0; st.n.busho = (st.n.busho || 0) + (tr.busho || []).length; }
    const c = {
      id, map, flags: F, dip: b.realm?.dipResult, dojo: !!def.dojo, dojoKills: F.kills || 0,
      main: tr.main === true && !(b.result && b.result.dead), side: tr.side || [], special: tr.special ? tr.special.label : '',
      busho: (tr.busho || []).length, bushoNames: (tr.busho || []).map(String), titles: (G && G.titles) || [], viol: (tr.violations || []).length, purs: tr.pursuits || 0, flank: (tr.c && tr.c.flank) || 0,
      kills: s.kills || 0, parries: s.parries || 0, thirds: s.thirds || 0, totalKills: Math.max(st.n.kills, (G && G.life && G.life.kills + (s.kills || 0)) || 0),
      specials: tr.specials || [],
      squad, squadAlive: (b.squad || []).filter((x) => x.alive).length,
      volleys: F.volleys || 0, won: map && tr.main === true, defend: !!(def.mapInfo && def.mapInfo.defend),
      metCount: Object.keys(st.met).length,
      bushoTotal: st.n.busho || 0,
    };
    // 845：どの戦で取ったかも残す。846：同じ戦で取った物は一枚の札に束ねる
    const where = map ? '天下の地図の城攻め' : def.dojo ? '稽古場' : ((BATTLES[b.index] || {}).name || '');
    const got = [];
    if (!practice || def.dojo) for (const a of ACH) if (a.test && a.test(c) && grant(a, true)) { got.push(a); (st.at = st.at || {})[a.id] = `${where}${G && G.name ? `・${G.name}` : ''}`; }
    announce(got);
    keep();
    // 身分と評定は settle の後に決まるので、今の処理が終わってから見る
    const idx = b.index;
    if (G && !G.practice && !map && !def.dojo) setTimeout(() => {
      const lc = { rank: G.rank || 0, grade: (G.grades || [])[idx], allWon: (G.grades || []).filter((v) => v && v !== '丙').length >= BATTLES.length };
      const got = [];
      for (const a of ACH) if (a.late && a.late(lc) && grant(a, true)) { got.push(a); (st.at = st.at || {})[a.id] = `${(BATTLES[idx] || {}).name || ''}・${G.name || ''}`; }
      got.push(...zukanProgress(G, true));
      announce(got);
      keep();
    }, 0);
    return { met: fresh };
  } catch (e) { console.warn('zukan', e); return null; }
}

// ---------------- 画面 ----------------
let styled = false;
function css() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.id = 'zk-css';
  st.textContent = `
#zk .zk-em { overflow-x: auto; padding: 14px 18px 18px; }
#zk .zk-em-roll { display: flex; flex-direction: row-reverse; gap: 0; min-width: min-content; color: #1d1a16; background: radial-gradient(ellipse at 30% 30%, rgba(160,130,80,.12), transparent 60%), repeating-linear-gradient(97deg, rgba(120,95,60,.05) 0 2px, transparent 2px 9px), #ece2cc; box-shadow: 0 10px 30px rgba(0,0,0,.5), inset 0 0 40px rgba(120,90,50,.25); border-left: 14px solid #3a2616; border-right: 14px solid #3a2616; }
#zk .zk-em-s { padding: 14px 18px; border-left: 1px solid rgba(29,26,22,.3); min-width: 220px; max-width: 460px; }
#zk .zk-em-s:last-child { border-left: 0; }
#zk .zk-em-s h3 { margin: 0 0 8px; font-family: var(--display); font-size: 18px; letter-spacing: .2em; color: #14110d; border-bottom: 2px solid #1d1a16; padding-bottom: 4px; }
#zk .zk-em-s h3 small { font-size: 12px; letter-spacing: .1em; color: #5a4a36; }
#zk .zk-em-s .none { margin: 0; font-size: 14px; color: #5a4a36; }
#zk .zk-em-b { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
#zk .zk-em-b li { display: grid; grid-template-columns: 1fr auto; column-gap: 10px; align-items: baseline; font-size: 14px; }
#zk .zk-em-b li b { font-family: var(--display); font-size: 16px; color: #14110d; }
#zk .zk-em-b li small, #zk .zk-em-b li em { font-size: 12px; font-style: normal; color: #5a4a36; }
#zk .zk-em-b li .sl { grid-row: span 2; font-style: normal; font: 800 14px/1 var(--display); color: #fff4e6; background: #b23a26; padding: 4px 5px; }
#zk .zk-em-p { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
#zk .zk-em-p button { display: grid; justify-items: center; gap: 2px; width: 100%; min-height: 44px; padding: 4px; background: none; border: 1px solid rgba(29,26,22,.25); color: #14110d; cursor: pointer; font: 600 12px var(--ui); }
#zk .zk-em-p .fc { width: 56px; height: 56px; overflow: hidden; display: block; }
#zk .zk-em-p .fc img, #zk .zk-em-p .fc svg { width: 100%; height: 100%; object-fit: cover; }
#zk .zk-em-g { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
#zk .zk-em-g li { font-size: 14px; padding: 3px 10px; border: 1px solid rgba(29,26,22,.45); color: #14110d; background: rgba(255,255,255,.25); }
@media (max-height: 500px) { #zk .zk-em { padding: 8px 12px; } #zk .zk-em-s { padding: 10px 12px; } #zk .zk-em-p .fc { width: 44px; height: 44px; } }

/* 左上の戻る（index.html の .topback）の下から並べる */
#zk .zk-top { padding-top: 56px; }
html.touch.inframe #zk .zk-top { padding-top: 118px; }
#zk { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; background: radial-gradient(ellipse at 30% 10%, #29231b 0%, var(--sumi) 65%); color: var(--washi); font-family: var(--ui);
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
#zk * { box-sizing: border-box; }
#zk button, #zk select, #zk input { font-family: var(--ui); min-height: 44px; min-width: 44px; }
.zk-top { display: flex; align-items: center; gap: 12px 16px; padding: 10px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.zk-top h2 { margin: 0; font-family: var(--display); font-size: 24px; letter-spacing: .14em; font-weight: 600; }
.zk-top h2::before { content: ''; display: inline-block; width: 4px; height: 20px; background: var(--shu); margin-right: 10px; vertical-align: -2px; }
.zk-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
.zk-scope { font-size: 12px; letter-spacing: .08em; color: var(--washi-dim); border: 1px solid var(--line); padding: 1px 8px; }
.zk-tabs button, .zk-seg button { min-height: 44px; min-width: 44px; padding: 8px 16px; background: transparent; color: var(--washi-dim); border: 1px solid var(--line); font-size: 15px; letter-spacing: .1em; cursor: pointer; }
.zk-tabs button[aria-selected=true] { color: var(--washi); border-color: var(--washi); box-shadow: inset 0 -3px 0 var(--shu); }
.zk-tabs button:hover, .zk-seg button:hover { color: var(--washi); border-color: var(--washi-dim); }
.zk-x { min-height: 44px; min-width: 44px; padding: 8px 18px; background: transparent; color: var(--washi); border: 1px solid var(--washi-dim); font-size: 15px; cursor: pointer; letter-spacing: .1em; }
.zk-x:hover { background: var(--washi); color: var(--sumi); }
.zk-pane { flex: 1; min-height: 0; min-width: 0; overflow-wrap: anywhere; overflow-y: auto; padding: 12px 16px 32px; overscroll-behavior: contain; }
.zk-tools { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: end; }
.zk-f { display: grid; gap: 4px; font-size: 13px; color: var(--washi-dim); letter-spacing: .06em; }
.zk-f input, .zk-f select { min-height: 44px; padding: 6px 10px; background: var(--sumi-2); color: var(--washi); border: 1px solid var(--washi-faint); font-size: 15px; }
.zk-f input { width: 200px; }
.zk-f input::placeholder { color: var(--washi-faint); }
.zk-seg { display: flex; flex-wrap: wrap; gap: 8px; }
.zk-seg button { font-size: 14px; letter-spacing: .06em; padding: 8px 12px; }
.zk-f { max-width: 100%; min-width: 0; }
.zk-f select { max-width: 100%; }
.zk-seg button[aria-pressed=true] { background: var(--washi); color: var(--sumi); border-color: var(--washi); }
.zk-sum { margin: 12px 0 10px; font-size: 14px; color: var(--washi-dim); display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.zk-sum b { font-family: var(--display); font-size: 20px; color: var(--kin); font-variant-numeric: tabular-nums; margin: 0 2px; }
.zk-meter { flex: 1; min-width: 120px; max-width: 320px; height: 6px; background: rgba(236,228,210,.1); position: relative; }
.zk-meter i { position: absolute; inset: 0 auto 0 0; background: var(--shu); }
.zk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 10px; }
.zk-c { position: relative; display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; align-items: center; min-height: 88px; padding: 10px; text-align: left; cursor: pointer;
  background: linear-gradient(180deg, #efe7d4, #e2d8c0); color: #1d1712; border: 1px solid #b8a988; box-shadow: 0 1px 0 rgba(0,0,0,.4); }
.zk-c:hover { border-color: var(--shu-deep); box-shadow: 0 0 0 1px var(--shu-deep); }
.zk-c:focus-visible { outline: 3px solid var(--kin); outline-offset: 2px; }
.zk-c .fc { width: 64px; height: 64px; position: relative; background: #2a241c; overflow: hidden; grid-row: span 2; }
.zk-c .fc img, .zk-d .fc img { width: 100%; height: 100%; display: block; }
.zk-c b { font-family: var(--display); font-size: 17px; line-height: 1.25; letter-spacing: .04em; font-weight: 600; }
.zk-c small { display: block; font-size: 12px; color: #5a4e3e; line-height: 1.35; }
.zk-c .zk-meet { grid-column: 1 / -1; }
.zk-c .st { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; margin-top: 4px; font-size: 12px; color: #5a4e3e; text-align: center; }
.zk-c .st em { display: block; font-style: normal; font-family: var(--display); font-size: 16px; color: #1d1712; font-variant-numeric: tabular-nums; }
.zk-c .st em.hi { color: #8e2f1f; }
.zk-c.un { background: linear-gradient(180deg, #3a342b, #2f2a23); color: var(--washi-dim); border-color: #4a4236; }
.zk-c.un small { color: var(--washi-dim); }
.zk-c.un .st em { color: var(--washi-dim); }
.fc svg { width: 100%; height: 100%; display: block; }
.un .fc::after { content: '？'; position: absolute; inset: 0; display: grid; place-items: center; padding-top: 18%; color: #ece4d2; font-family: var(--display); font-size: 30px; text-shadow: 0 1px 2px #000; }
.un .fc { background: linear-gradient(180deg, #8a806c, #6a6152); }
.zk-c .seal { position: absolute; top: 6px; right: 6px; font-size: 12px; color: #8e2f1f; border: 1px solid #8e2f1f; padding: 0 4px; font-family: var(--display); line-height: 1.5; }
.zk-c .story { color: #6a5a40; }
.zk-tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
.zk-tbl th { position: sticky; top: -12px; background: var(--sumi-2); z-index: 1; text-align: left; font-weight: 500; color: var(--washi-dim); border-bottom: 1px solid var(--washi-faint); padding: 4px; }
.zk-tbl th button { width: 100%; min-height: 44px; padding: 6px 8px; background: transparent; border: 0; color: inherit; font: inherit; text-align: inherit; cursor: pointer; white-space: nowrap; }
.zk-tbl th button:hover { color: var(--washi); }
.zk-tbl th[aria-sort] button { color: var(--kin); }
.zk-tbl td { padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.zk-tbl td.n { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--display); font-size: 16px; }
.zk-tbl td.n.hi { color: #e38a74; }
.zk-tbl tr.un td { color: var(--washi-dim); }
.zk-tbl .fc { display: block; flex: 0 0 40px; width: 40px; height: 40px; position: relative; background: #2a241c; overflow: hidden; }
.zk-tbl .fc img { width: 100%; height: 100%; display: block; }
.zk-tbl .un .fc::after, .zk-tbl tr.un .fc::after { font-size: 20px; }
.zk-tbl .nm { min-height: 44px; padding: 4px 6px; background: transparent; border: 0; color: var(--washi); font-family: var(--display); font-size: 16px; text-align: left; cursor: pointer; text-decoration: underline; text-decoration-color: var(--washi-faint); text-underline-offset: 4px; }
.zk-tbl tr.un .nm { color: var(--washi-dim); }
.zk-tbl .nm:hover { color: var(--kin); }
.zk-tbl small { color: var(--washi-dim); font-size: 12px; }
.zk-empty { padding: 32px 0; text-align: center; color: var(--washi-dim); }
.zk-empty button { margin-top: 12px; }
.zk-dlg { position: fixed; inset: 0; z-index: 51; display: grid; place-items: center; background: rgba(8,7,5,.72); padding: 16px; }
.zk-d { position: relative; width: min(880px, 100%); max-height: 100%; overflow-y: auto; background: linear-gradient(180deg, #f1e9d6, #e4dac3); color: #1d1712; border: 1px solid #b8a988; padding: 20px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.zk-d::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--shu-deep); }
.zk-d .hd { display: grid; grid-template-columns: 148px 1fr; gap: 18px; align-items: start; }
.zk-d .fc { width: 148px; height: 148px; position: relative; background: #2a241c; border: 1px solid #8a7a5a; }
.zk-d .fc.pt { background: radial-gradient(circle at 50% 35%, #4a4034, #1a1612); overflow: hidden; }
.zk-d .fc.pt img { object-fit: cover; object-position: 50% 20%; }
.zk-d .fc::after { font-size: 64px; }
.zk-d h3 { margin: 0; font-family: var(--display); font-size: 32px; letter-spacing: .12em; font-weight: 600; line-height: 1.2; }
.zk-d .yomi { font-size: 14px; color: #5a4e3e; letter-spacing: .12em; margin-top: 2px; }
.zk-d dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 12px 0 0; font-size: 15px; }
.zk-d dt { color: #5a4e3e; font-size: 13px; letter-spacing: .08em; padding-top: 2px; }
.zk-d dd { margin: 0; }
.zk-d h4 { margin: 18px 0 8px; font-family: var(--display); font-size: 17px; letter-spacing: .14em; color: #8e2f1f; font-weight: 600; border-bottom: 1px solid #c8b995; padding-bottom: 4px; }
.zk-bars { display: grid; gap: 8px; }
.zk-bar { display: grid; grid-template-columns: 44px 1fr 40px; gap: 10px; align-items: center; font-size: 14px; }
.zk-bar i { height: 10px; background: rgba(29,23,18,.14); position: relative; }
.zk-bar i b { position: absolute; inset: 0 auto 0 0; background: #3a2e22; }
.zk-bar i b.hi { background: #8e2f1f; }
.zk-bar em { font-style: normal; font-family: var(--display); font-size: 20px; text-align: right; font-variant-numeric: tabular-nums; }
.zk-trait { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 8px; border: 1px solid #8a7a5a; font-size: 13px; }
.zk-trait small { color: #5a4e3e; margin-left: 6px; }
.zk-where { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; font-size: 15px; }
.zk-where li { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.zk-where small { color: #5a4e3e; font-size: 13px; }
.zk-where .r { font-size: 12px; padding: 0 6px; border: 1px solid #8a7a5a; color: #3a2e22; }
.zk-where .r.foe { border-color: #8e2f1f; color: #8e2f1f; }
.zk-bio { font-family: var(--display); font-size: 17px; line-height: 1.9; margin: 0; }
.zk-lock { color: #5a4e3e; font-size: 15px; line-height: 1.7; margin: 0; }
.zk-d .ft { display: flex; gap: 8px; justify-content: space-between; margin-top: 20px; flex-wrap: wrap; }
.zk-d .ft button { min-height: 44px; min-width: 44px; padding: 8px 16px; background: transparent; border: 1px solid #5a4e3e; color: #1d1712; font-size: 15px; cursor: pointer; letter-spacing: .08em; }
.zk-d .ft button:hover { background: #1d1712; color: #f1e9d6; }
.zk-d .ft button.pri { background: #8e2f1f; border-color: #8e2f1f; color: #fff5ea; }
.zk-d:focus { outline: none; }
.zk-d button:focus-visible { outline: 3px solid #8e2f1f; outline-offset: 2px; }
.zk-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.zk-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 10px; }
.zk-tag { font-style: normal; font-size: 12px; margin-left: 8px; padding: 0 5px; border: 1px solid var(--washi-faint); color: var(--washi-dim); }
.zk-prog { display: block; height: 6px; background: #1b1814; box-shadow: 0 0 0 1px rgba(236,228,210,.35); margin: 6px 0 2px; max-width: 220px; }
.zk-prog i { display: block; height: 100%; background: var(--kin); }
.zk-h3 { font-size: 15px; letter-spacing: .15em; color: var(--washi); margin: 22px 0 8px; font-weight: 600; }
.zk-a { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; align-items: center; min-height: 84px; padding: 12px; border: 1px solid #4a4236; background: #2f2a23; color: var(--washi-dim); }
.zk-a .sl { width: 56px; height: 56px; display: grid; place-items: center; border: 2px dashed var(--washi-faint); border-radius: 50%; font-family: var(--display); font-size: 22px; color: var(--washi-faint); }
.zk-a b { display: block; font-family: var(--display); font-size: 18px; letter-spacing: .08em; color: var(--washi); font-weight: 600; }
.zk-a span { display: block; font-size: 13px; line-height: 1.5; margin-top: 2px; }
.zk-a small { display: block; font-size: 12px; margin-top: 4px; color: var(--washi-dim); }
.zk-a.got { background: linear-gradient(180deg, #efe7d4, #e2d8c0); color: #3a2e22; border-color: #b8a988; }
.zk-a.got b { color: #1d1712; }
.zk-a.got small { color: #5a4e3e; }
.zk-a.got .sl { border: 2px solid #8e2f1f; background: #8e2f1f; color: #fff5ea; transform: rotate(-8deg); }
.zk-note { font-size: 13px; color: var(--washi-dim); line-height: 1.6; margin: 16px 0 0; }
.zk-toasts { position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); right: calc(16px + env(safe-area-inset-right, 0px)); z-index: 60; display: grid; gap: 8px; pointer-events: none; max-width: calc(100vw - 32px); }
.zk-toast { box-sizing: border-box; min-height: 44px; pointer-events: auto; cursor: pointer; text-align: left; font: 15px/1.4 var(--ui); display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center; width: 320px; max-width: 100%; padding: 10px 14px 10px 10px; background: linear-gradient(180deg, #efe7d4, #e2d8c0); color: #1d1712; border: 1px solid #b8a988; border-left: 5px solid #8e2f1f; box-shadow: 0 8px 24px rgba(0,0,0,.5); animation: zkin .35s ease-out; }
.zk-toast i { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: #8e2f1f; color: #fff5ea; font-style: normal; font-family: var(--display); font-size: 20px; transform: rotate(-8deg); }
.zk-toast small { display: block; font-size: 12px; color: #5a4e3e; letter-spacing: .12em; }
.zk-toast b { display: block; font-family: var(--display); font-size: 16px; letter-spacing: .06em; }
.zk-toast span { display: block; font-size: 15px; color: #3a2e22; line-height: 1.45; }
.zk-toast:focus-visible { outline: 3px solid #8e2f1f; outline-offset: 2px; }
.ev2 .ev-ach-notices .zk-toasts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ev2 .ev-ach-notices .zk-toast { grid-template-columns: minmax(0, 1fr); gap: 0; height: 80px; padding: 6px 10px; min-width: 0; }
.ev-ach-notices .zk-toast i { display: none; }
.ev-ach-notices .zk-toast div { min-width: 0; }
.ev-ach-notices .zk-toast b, .ev-ach-notices .zk-toast span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zk-a.got .zk-new { display: inline-block; color: #8e2f1f; border: 1px solid #8e2f1f; padding: 0 4px; font-size: 12px; }
.zk-toast.rm, body.rm .zk-toast { animation: none; transition: none; }
@keyframes zkin { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
/* 横向きの携帯でも、列を横へ押し出さず、一人ずつ縦へ並べる。 */
@media (max-width: 960px) {
  .zk-tbl, .zk-tbl thead, .zk-tbl tbody { display: block; }
  .zk-tbl thead tr { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .zk-tbl th { position: static; display: block; padding: 0; border: 0; }
  .zk-tbl th:not(:has(button)) { display: none; }
  .zk-tbl tbody { display: grid; gap: 8px; }
  .zk-tbl tbody tr { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 8px; border: 1px solid var(--line); }
  .zk-tbl td { min-width: 0; border: 0; padding: 4px; }
  .zk-tbl td:first-child, .zk-tbl td:last-child { grid-column: 1 / -1; }
  .zk-tbl td:nth-child(2) { grid-column: span 2; }
  .zk-tbl td:nth-child(3) { grid-column: span 3; }
  .zk-tbl td.n { text-align: left; }
  .zk-tbl td.n::before { content: attr(data-label); display: block; font: 12px var(--ui); color: var(--washi-dim); }
}
@media (max-width: 720px), (max-height: 460px) {
  .zk-top { padding: 6px 12px; gap: 8px; }
  .zk-top h2 { font-size: 20px; }
  .zk-pane { padding: 8px 12px 24px; }
  .zk-f input { width: 150px; }
  .zk-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .zk-c { grid-template-columns: 52px 1fr; min-height: 76px; padding: 8px; }
  .zk-c .fc { width: 52px; height: 52px; }
  .zk-c b { font-size: 16px; }
  .zk-d { padding: 14px 16px; }
  .zk-d .hd { grid-template-columns: 104px 1fr; gap: 14px; }
  .zk-d .fc { width: 104px; height: 104px; }
  .zk-d h3 { font-size: 26px; }
  .zk-cols { grid-template-columns: 1fr; }
  .zk-sum { margin: 8px 0; }
}
@media (max-height: 460px) { .zk-dlg { padding: 8px; } .zk-d h4 { margin-top: 12px; } }
/* 背の低い画面（携帯横）：下に並ぶ釦（戦功評価の「題の画面へ」など）を隠さないよう、上の右に出す */
@media (max-height: 520px) { .zk-toasts { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; } .zk-toast { width: 280px; padding: 6px 10px 6px 6px; } }
@media (prefers-reduced-motion: reduce) { .zk-toast { animation: none; transition: none; } }
`;
  document.head.appendChild(st);
}

// 11/2：図鑑の画面は「並び・影絵・開いた一人の札」だけ（Simple is the best）。探す・絞る・並べ替え・表・能力は出さない
const ZK2_CSS = `
#zk .zk-grid2 { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
#zk .zk-g { position: relative; display: grid; grid-template-rows: auto auto; width: 100%; min-height: 44px; padding: 0 0 6px; background: #241f19; border: 1px solid #4a4236; color: var(--washi); cursor: pointer; text-align: center; font: 600 13px/1.3 var(--display); }
#zk .zk-g:hover { border-color: var(--shu-deep); }
#zk .zk-g:focus-visible { outline: 3px solid var(--kin); outline-offset: 2px; }
#zk .zk-g .fc { display: block; width: 100%; aspect-ratio: 5 / 6; background: radial-gradient(circle at 50% 35%, #4a4034, #1a1612); overflow: hidden; }
#zk .zk-g .fc img, #zk .zk-g .fc svg { width: 100%; height: 100%; display: block; object-fit: cover; }
#zk .zk-g.un { background: #1c1814; border-color: #3a342b; }
#zk .zk-g.un .fc { background: #2a241c; }
#zk .zk-g b { display: block; padding: 4px 2px 0; font-weight: 600; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#zk .zk-g.un b { color: var(--washi-dim); }
#zk .zk-d2 .hd { grid-template-columns: 168px 1fr; }
#zk .zk-d2 .fc { width: 168px; height: 202px; background: radial-gradient(circle at 50% 35%, #4a4034, #1a1612); overflow: hidden; }
#zk .zk-d2 .fc img, #zk .zk-d2 .fc svg { width: 100%; height: 100%; object-fit: cover; display: block; }
#zk .zk-d2 .zk-bio { margin-top: 12px; }
#zk .zk-d2 .zk-where { margin-top: 6px; }
#zk .zk-d2 .zk-where li.no { color: #8a7a5a; }
@media (max-width: 720px), (max-height: 460px) {
  #zk .zk-grid2 { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; }
  #zk .zk-g { font-size: 12px; }
  #zk .zk-d2 .hd { grid-template-columns: 120px 1fr; gap: 14px; }
  #zk .zk-d2 .fc { width: 120px; height: 144px; }
  #zk .zk-d2 h3 { font-size: 24px; }
  #zk .zk-d2 .zk-bio { font-size: 15px; line-height: 1.7; }
}`;
const yearTxt = (p) => `${p.b ? `${p.b}年` : '生年不詳'}〜${p.d ? `${p.d}年` : '没年不詳'}`;
let root = null, lastFocus = null, faceIO = null, dlg = null;
const V = { tab: 'busho' };

// まだ会っていない者の影絵（兜の武将・坊主）
function shadowSvg(lk) {
  const head = lk === 'b' ? '' : '<path d="M36 64 Q36 30 64 30 Q92 30 92 64 L100 70 L28 70 Z"/><path d="M50 34 L36 6 L44 6 L58 32 Z M78 34 L92 6 L84 6 L70 32 Z"/>';
  return `<svg viewBox="0 0 128 154" aria-hidden="true"><g fill="#0f0c09">${head}<ellipse cx="64" cy="64" rx="20" ry="25"/><rect x="55" y="82" width="18" height="16"/><path d="M4 154 C8 116 30 100 50 96 L78 96 C98 100 120 116 124 154Z"/></g></svg>`;
}
// 会った者は 3D の上半身の絵（撮れるまで影絵）
function faceHtml(p) {
  if (!isMet(p.name)) return `<span class="fc">${shadowSvg(p.lk)}</span>`;
  return `<span class="fc" data-face="${esc(p.name)}">${shadowSvg(p.lk)}</span>`;
}
function fillFace(el) {
  if (el.classList.contains('done')) return;
  el.classList.add('done');
  const nm = el.dataset.face;
  portrait(nm).then((url) => { if (url && el.isConnected) el.innerHTML = `<img alt="" src="${url}">`; });
}
// 絵は見える所に来てから撮る（百五十人ぶんを一度に撮らない）
function watchFaces(scope) {
  if (faceIO) faceIO.disconnect();
  const els = [...scope.querySelectorAll('.fc[data-face]:not(.done)')];
  if (!('IntersectionObserver' in window)) { els.forEach(fillFace); return; }
  faceIO = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { fillFace(e.target); faceIO.unobserve(e.target); } }, { root: scope.closest('.zk-pane'), rootMargin: '120px' });
  els.forEach((el) => faceIO.observe(el));
}

function renderBusho(pane) {
  const { list } = db();
  pane.innerHTML = `<ul class="zk-grid2" aria-label="武将の並び">${list.map((p, i) => {
    const m = isMet(p.name);
    return `<li><button type="button" class="zk-g ${m ? '' : 'un'}" data-p="${esc(p.name)}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(m ? `${p.name}（${p.clan}）` : 'まだ会っていない武将')}">${faceHtml(p)}<b>${m ? esc(p.name) : '？'}</b></button></li>`;
  }).join('')}</ul>`;
  const order = list.map((p) => p.name);
  pane.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openCard(b.dataset.p, order));
  watchFaces(pane);
}

// 並びを矢印キーで動く（並びの中は Tab 一つで入れる）
function rovingKeys(e) {
  const items = [...root.querySelectorAll('.zk-grid2 [data-p]')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return false;
  const top = items[0].offsetTop;
  let cols = items.findIndex((x) => x.offsetTop !== top); if (cols < 1) cols = items.length;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, PageDown: cols * 4, PageUp: -cols * 4 }[e.key];
  let j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : step != null ? i + step : null;
  if (j == null) return false;
  j = Math.max(0, Math.min(items.length - 1, j));
  items[i].tabIndex = -1; items[j].tabIndex = 0; items[j].focus({ preventScroll: true });
  items[j].scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  return true;
}

// 開いた一人の札：絵・名・読み・生没年・家・主な戦・一言。会っていない者は影絵と、会える戦だけ
function openCard(name, order) {
  const p = db().byName.get(name);
  if (!p) return;
  const m = isMet(name);
  const i = order.indexOf(name);
  if (!dlg) { dlg = document.createElement('div'); dlg.className = 'zk-dlg'; root.appendChild(dlg); dlg.onclick = (e) => { if (e.target === dlg) closeCard(); }; }
  const wars = `<ul class="zk-where">${p.where.map((w) => `<li><span>${esc(w.name)}</span><small>${esc(w.scn)}・${w.year}年</small></li>`).join('')}</ul>`;
  dlg.innerHTML = `<div class="zk-d zk-d2 ${m ? '' : 'un'}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="zk-d-h">
    <div class="hd"><span class="fc">${shadowSvg(p.lk)}</span><div>
      <h3 id="zk-d-h">${m ? esc(p.name) : '？'}</h3>${m ? `<div class="yomi">${esc(p.yomi)}</div>
      <dl><dt>生没年</dt><dd>${esc(yearTxt(p))}</dd><dt>家</dt><dd>${esc(p.clan)}</dd>${isSlain(name) ? '<dt>討った</dt><dd>この手で討ち取った</dd>' : ''}</dl>
      <p class="zk-bio">${esc(p.bio)}</p>` : `<p class="zk-lock">${esc(p.where[0]?.name || '')}で会える</p>`}
    </div></div>
    ${m ? `<h4>主な戦</h4>${wars}` : ''}
    <div class="ft"><div style="display:flex;gap:8px"><button type="button" id="zk-prev" ${i <= 0 ? 'disabled' : ''}>前の武将</button><button type="button" id="zk-next" ${i < 0 || i >= order.length - 1 ? 'disabled' : ''}>次の武将</button></div>
      <button type="button" class="pri" id="zk-dx">図鑑にもどる</button></div></div>`;
  dlg.hidden = false;
  dlg.dataset.ret = name;
  if (m) portrait(name).then((url) => { const fc = url && dlg && dlg.dataset.ret === name && dlg.querySelector('.hd .fc'); if (fc) fc.innerHTML = `<img alt="" src="${url}">`; });
  const go = (d) => { const n = order[i + d]; if (n) openCard(n, order); };
  dlg.querySelector('#zk-prev').onclick = () => go(-1);
  dlg.querySelector('#zk-next').onclick = () => go(1);
  dlg.querySelector('#zk-dx').onclick = closeCard;
  dlg._go = go;
  const box = dlg.querySelector('.zk-d');
  box.scrollTop = 0;
  box.focus({ preventScroll: true });
  try { sfx('ui'); } catch (e) { /* 音が無くても */ }
}
function closeCard() {
  if (!dlg || dlg.hidden) return;
  const name = dlg.dataset.ret;
  dlg.hidden = true; dlg.innerHTML = '';
  const el = root.querySelector(`.zk-grid2 [data-p="${CSS.escape(name)}"]`);
  if (el) { root.querySelectorAll('.zk-grid2 [data-p]').forEach((x) => x.tabIndex = -1); el.tabIndex = 0; el.focus({ preventScroll: true }); el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}

const achRead = new Set();
function renderAch(pane) {
  const st = store();
  // 分母は、いま遊べる筋書き（織田家編）で取れる物。ほかの筋書き・天下の地図の物は下に分けて並べる（836）
  const main = ACH.filter((a) => !a.other), other = ACH.filter((a) => a.other);
  const got = main.filter((a) => st.ach[a.id]).length;
  const row = (a) => {
    const t = st.ach[a.id];
    const fresh = t && !st.achSeen?.[a.id];
    if (fresh) achRead.add(a.id);
    const pr = !t && a.prog ? a.prog(st) : null;
    return `<div class="zk-a ${t ? 'got' : ''}" role="listitem"><span class="sl" aria-hidden="true">${t ? '功' : '？'}</span><div><b>${esc(a.name)}${fresh ? ' <small class="zk-new">新しい</small>' : ''}</b>${a.other ? `<em class="zk-tag">${esc(a.other)}</em>` : ''}<span>${esc(a.desc)}</span>${pr ? `<span class="zk-prog" role="img" aria-label="${pr[0]}／${pr[1]}"><i style="width:${Math.min(100, pr[0] / pr[1] * 100).toFixed(0)}%"></i></span><small>${Math.min(pr[0], pr[1])}／${pr[1]}</small>` : ''}<small>${t ? `${new Date(t).toLocaleDateString('ja-JP')}に得た${st.at && st.at[a.id] ? `（${esc(st.at[a.id])}）` : ''}` : 'まだ得ていない'}</small></div></div>`;
  };
  pane.innerHTML = `<div class="zk-sum" aria-live="polite"><span>得た実績 <b>${got}</b>／${main.length}</span><span class="zk-meter" aria-hidden="true"><i style="width:${(got / main.length * 100).toFixed(1)}%"></i></span><span>延べ ${st.n.battles}戦・討ち取り ${st.n.kills}人</span></div>
    <div class="zk-ach" role="list">${main.map(row).join('')}</div>
    <h3 class="zk-h3">ほかの筋書き・天下の地図の実績</h3>
    <div class="zk-ach" role="list">${other.map(row).join('')}</div>
    <p class="zk-note">実績と図鑑は、三つの保存の枠とは別に、この閲覧画面に記しています。保存の枠を消しても残ります。</p>`;
}

// 絵巻：いまの保存の歩み。戦った戦・会った武将・手に入れた武具を、右から左へ読む一巻きに（和紙に墨）
function renderEmaki(pane) {
  const st = store();
  let G = null;
  try { G = loadAll()[S.slot] || loadAll().find(Boolean) || null; } catch (e) { G = null; }
  const { byName } = db();
  const hist = G ? BATTLES.map((b, i) => ({ b, h: (G.history || [])[i] })).filter((x) => x.h) : [];
  const met = Object.entries(st.met).sort((a, z) => z[1] - a[1]).map(([n]) => byName.get(canon(n))).filter((p, i, a) => p && a.indexOf(p) === i).slice(0, 18);
  const gear = G ? [...new Set([...(G.owned || []).filter((id) => ITEMS[id] && ITEMS[id].cost), ...(G.horses || []).map((id) => 'h:' + id)])] : [];
  const gearName = (id) => (id.startsWith('h:') ? (HORSES[id.slice(2)] || {}).name || '馬' : ITEMS[id].name);
  const sec = (h, body) => `<section class="zk-em-s"><h3>${h}</h3>${body}</section>`;
  pane.innerHTML = `<div class="zk-em" role="region" aria-label="歩みの絵巻"><div class="zk-em-roll">
    ${sec('戦った戦', hist.length ? `<ol class="zk-em-b">${hist.map(({ b, h }) => `<li><b>${esc(b.name)}</b><small>${esc((b.year || '').replace(/（.*$/, ''))}</small>${h.grade ? `<i class="sl">${esc(h.grade)}</i>` : ''}<em>戦功 ${h.total}</em></li>`).join('')}</ol>` : '<p class="none">まだ戦っていない</p>')}
    ${sec(`会った武将 <small>${Object.keys(st.met).length}人</small>`, met.length ? `<ul class="zk-em-p">${met.map((p) => `<li><button type="button" data-em="${esc(p.name)}" aria-label="${esc(p.name)}の札を開く">${faceHtml(p)}<b>${esc(p.name)}</b></button></li>`).join('')}</ul>` : '<p class="none">まだ誰にも会っていない</p>')}
    ${sec('手に入れた武具', gear.length ? `<ul class="zk-em-g">${gear.map((id) => `<li>${esc(gearName(id))}</li>`).join('')}</ul>` : '<p class="none">まだ何も買っていない</p>')}
  </div></div>${G ? `<p class="zk-note">${esc(G.name)}の歩み（いまの保存の枠）</p>` : ''}`;
  pane.querySelectorAll('[data-em]').forEach((b) => b.onclick = () => openCard(b.dataset.em, met.map((p) => p.name)));
  watchFaces(pane);
}
const TABS = ['busho', 'emaki', 'ach'];
const TAB_H = { busho: '武将図鑑', emaki: '歩みの絵巻', ach: '実績' };
function setTab(k, focus) {
  V.tab = k;
  root.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus({ preventScroll: true }); });
  root.querySelector('#zk-h').textContent = TAB_H[k];
  // 記録の範囲：図鑑・実績は全保存データ共通、歩みはいまの保存の枠（この物語）だけ
  root.querySelector('#zk-scope').textContent = k === 'emaki' ? 'この物語の記録' : '全保存記録共通';
  const pb = root.querySelector('#zk-p-busho'), pa = root.querySelector('#zk-p-ach'), pe = root.querySelector('#zk-p-emaki');
  pb.hidden = k !== 'busho'; pa.hidden = k !== 'ach'; pe.hidden = k !== 'emaki';
  if (k === 'busho') { if (!pb.querySelector('.zk-grid2')) renderBusho(pb); else watchFaces(pb); }
  else if (k === 'emaki') renderEmaki(pe);
  else renderAch(pa);
}

function onKey(e) {
  // 図鑑の中の操作は、下の画面（題・戦）へ渡さない
  e.stopPropagation();
  if (dlg && !dlg.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeCard(); return; }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); dlg._go(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'Tab') trap(e, dlg);
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); zukanClose(); return; }
  if (e.target.getAttribute && e.target.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); const i = TABS.indexOf(V.tab); setTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true); return; }
  if (e.target.closest && e.target.closest('.zk-grid2') && e.target.matches('[data-p]') && rovingKeys(e)) { e.preventDefault(); return; }
  if (e.key === 'Tab') trap(e, root);
}
function trap(e, box) {
  const f = [...box.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')].filter((x) => x.offsetParent !== null && x.tabIndex >= 0);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus({ preventScroll: true }); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus({ preventScroll: true }); }
}

// 開く：which は 'busho'（武将図鑑）か 'ach'（実績）
export function zukanOpen(which = 'busho') {
  css();
  if (!document.getElementById('zk2-css')) { const st = document.createElement('style'); st.id = 'zk2-css'; st.textContent = ZK2_CSS; document.head.appendChild(st); }
  store();
  backfill();
  keep();
  if (root) zukanClose(true);
  lastFocus = document.activeElement;
  root = document.createElement('div');
  root.id = 'zk';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'zk-h');
  root.innerHTML = `<header class="zk-top"><h2 id="zk-h">武将図鑑</h2><small class="zk-scope" id="zk-scope" aria-live="polite">全保存記録共通</small>
    <div class="zk-tabs" role="tablist" aria-label="図鑑と実績">
      <button type="button" role="tab" data-tab="busho" id="zk-t-busho" aria-controls="zk-p-busho">武将図鑑</button>
      <button type="button" role="tab" data-tab="emaki" id="zk-t-emaki" aria-controls="zk-p-emaki">歩み</button>
      <button type="button" role="tab" data-tab="ach" id="zk-t-ach" aria-controls="zk-p-ach">実績</button></div>
    <button type="button" class="topback" id="zk-close" aria-label="戻る"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>戻る</button></header>
    <section class="zk-pane" id="zk-p-busho" role="tabpanel" aria-labelledby="zk-t-busho"></section>
    <section class="zk-pane" id="zk-p-emaki" role="tabpanel" aria-labelledby="zk-t-emaki" hidden></section>
    <section class="zk-pane" id="zk-p-ach" role="tabpanel" aria-labelledby="zk-t-ach" hidden></section>`;
  document.body.appendChild(root);
  dlg = null;
  root.addEventListener('keydown', onKey);
  root.addEventListener('keyup', (e) => e.stopPropagation());
  root.querySelector('#zk-close').onclick = () => zukanClose();
  root.querySelectorAll('[role=tab]').forEach((t) => t.onclick = () => { try { sfx('ui'); } catch (e) { /* 音 */ } setTab(t.dataset.tab); });
  setTab(TABS.includes(which) ? which : 'busho');
  root.querySelector(`[data-tab="${V.tab}"]`).focus({ preventScroll: true });
  try { sfx('ui'); } catch (e) { /* 音が無くても */ }
}
export function zukanClose(quiet) {
  if (achRead.size) {
    const st = store();
    st.achSeen = st.achSeen || {};
    for (const id of achRead) st.achSeen[id] = true;
    achRead.clear(); keep();
  }
  if (faceIO) { faceIO.disconnect(); faceIO = null; }
  portraitStop();
  if (root) { root.remove(); root = null; dlg = null; }
  if (!quiet && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
// 838：一人の札を開く（評定の画面の「新たに会った武将」から）
export function zukanOpenCard(name) { zukanOpen('busho'); const n = canon(name) || name; if (db().byName.has(n)) openCard(n, [n]); }
// 確かめ用：数を見る
// 確かめ用：その戦で会える名
export function zukanMeet(id) { return (MEET[id] || []).slice(); }
export function zukanCount() { const { list } = db(); const st = store(); return { people: list.length, met: Object.keys(st.met).length, ach: ACH.length, got: Object.keys(st.ach).length }; }
