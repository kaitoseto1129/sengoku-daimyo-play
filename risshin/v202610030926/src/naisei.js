// 内政・武将・評定の計算（画面は japan.js）。進み具合はみな G.japan（J）の中に置く
// J.dom[城]：{ k 石高, s 商業, h 兵, m 民の心 0〜100, kt 普請の積み 0〜45, kn 検地した季節 }
// J.bank[家]：{ g 金（貫）, f 兵糧（石） } ／ J.flow：自分の家の前の季節の増減
// J.gen[名]：{ c 家（-1 は浪人）, at 居る城, loy 忠誠, dead 死んだ季節, 名もなき家臣は s:[統,武,知,政]・b 生まれ・tr 個性・lk 似顔 }
// J.lord[城]：城主の名 ／ J.head[家]：家督を継いだ当主（筋書きの大名から替わった時だけ）
// J.me：自分の名 ／ J.kou：勲功 ／ J.mibun：地図の上の身分（MIBUN の番号） ／ J.post：持ち場の城 ／ J.hyo：この季節の評定
import { BUSHO, LINEUP, SEI, MEI, TRAIT_NOTE } from './generals_data.js';
export { TRAIT_NOTE };

const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// 決まった乱数（名もなき家臣の名と能力は、筋書きと家で毎回同じに）
function prng(seed) {
  let a = hashStr(seed);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r10 = (v) => Math.round(v / 10) * 10;

// ---------------- 身分（地図の上の出世） ----------------
// cmd：一季に命じられる内政の数 ／ say：評定で言える進言の数 ／ decide：評定で決められる数 ／ scope：内政のできる城
export const MIBUN = [
  { name: '足軽大将', cmd: 0, say: 1, decide: 0, scope: 'post', can: '評定で一つ進言できる（内政は部将から）' },
  { name: '侍大将', cmd: 0, say: 2, decide: 0, scope: 'post', can: '進言を二つまで。通れば主命になる（内政は部将から）' },
  { name: '部将', cmd: 2, say: 2, decide: 0, scope: 'post', can: '内政ができるようになる。持ち場の城で内政を二つ' },
  { name: '家老', cmd: 2, say: 3, decide: 0, scope: 'post', can: '家臣の進言に賛否を言える（主君がよく聞く）' },
  { name: '城主', cmd: 2, say: 3, decide: 1, scope: 'own', can: '自分の城を持ち、奉行を選んで内政。評定で一つ決める' },
  { name: '国持', cmd: 3, say: 3, decide: 2, scope: 'all', can: '家中のどの城でも内政。城主を任じ替える。評定で二つ決める' },
];
export const KOU_NEED = [0, 50, 120, 220, 340, 500];
// 内政は部将から（プレイヤーだけの決まり。AI の家や家老の内政には関わらない）
export const NAISEI_FROM = 2;
export const canNaisei = (J) => (J.mibun || 0) >= NAISEI_FROM;
// まだ内政できない時の知らせ（次の身分と、部将まであと何の勲功か）
export function naiseiLock(J) {
  if (canNaisei(J)) return null;
  const m = J.mibun || 0, kou = J.kou || 0;
  const need = Math.max(0, KOU_NEED[NAISEI_FROM] - kou);
  const nx = MIBUN[m + 1], nxNeed = Math.max(0, KOU_NEED[m + 1] - kou);
  const step = m + 1 < NAISEI_FROM ? `次は${nx.name}（あと勲功${nxNeed}）、` : '';
  return {
    need, next: nx.name, nextNeed: nxNeed, to: MIBUN[NAISEI_FROM].name,
    steps: m + 1 < NAISEI_FROM ? `次の身分は${nx.name}（あと勲功${nxNeed}）。${MIBUN[NAISEI_FROM].name}まではあと勲功${need}。` : `次の身分は${nx.name}。あと勲功${need}で内政ができる。`,
    short: `内政は${MIBUN[NAISEI_FROM].name}になってから行えます。いまは合戦で勲功を積みましょう（${step}${MIBUN[NAISEI_FROM].name}まであと勲功${need}）`,
  };
}

// ---------------- 内政の手 ----------------
export const ACTS = {
  kaikon: { name: '開墾', cost: 300, stat: 'pol', tr: '農政', note: '田を開く。石高が増え、秋の年貢が増える' },
  machi: { name: '町づくり', cost: 250, stat: 'pol', tr: '商才', note: '市を開く。商業が伸び、毎季の金が増える' },
  chohei: { name: '兵を集める', cost: 200, stat: 'lea', tr: '猛将', note: '城の兵を増やす。民の心は少し下がる' },
  fushin: { name: '城の普請', cost: 400, stat: 'pol', tr: '築城', note: '堀を深く塀を高く。城が堅くなる' },
  kenchi: { name: '検地', cost: 150, stat: 'int', tr: '農政', note: '田を測り直し、隠れた石高を見つける。民の心は下がる' },
  kaji: { name: '鍛冶町', cost: 300, stat: 'int', tr: '商才', note: '鍛冶を呼ぶ。槍と鉄砲が揃い、城の兵が強くなる' },
};
// 鍛冶町の育ち（0〜10）：一つ育つごとに、その城の兵の強さ +4%
export const kajiOf = (J, id) => (J.dom[id] && J.dom[id].kj) || 0;
const kajiK = (J, id) => 1 + kajiOf(J, id) * 0.04;
export const ACT_KEYS = Object.keys(ACTS);
const STAT_NAME = { lea: '統率', war: '武勇', int: '知略', pol: '政治' };
export const statName = (k) => STAT_NAME[k];

// ---------------- 史実の城主（筋書きの年に、その城を預かっていた者） ----------------
const JOSHU = {
  nagashino: { 浜松城: '徳川家康', 岡崎城: '松平信康', 長篠城: '奥平信昌', 西尾城: '酒井忠次', 掛川城: '石川数正', 岐阜城: '織田信長', 小谷城: '羽柴秀吉', 佐和山城: '丹羽長秀', 観音寺城: '柴田勝家', 犬山城: '池田恒興', 岩村城: '河尻秀隆', 二条御所: '村井貞勝', 伊丹城: '荒木村重', 高槻城: '高山右近', 長島願証寺: '滝川一益', 大河内城: '織田信雄', 岸和田城: '佐久間信盛', 躑躅ヶ崎館: '武田勝頼', 海津城: '高坂昌信', 深志城: '馬場信春', 箕輪城: '内藤昌豊', 駿府館: '山県昌景', 谷村城: '小山田信茂', 飯田城: '秋山虎繁', 高遠城: '武田信廉', 春日山城: '上杉謙信', 坂戸城: '上杉景勝', 厩橋城: '北条高広', 小田原城: '北条氏政', 川越城: '大道寺政繁', 韮山城: '北条氏規', 滝山城: '北条氏照', 吉田郡山城: '毛利輝元', 月山富田城: '吉川元春', 桜尾城: '小早川隆景', 府内館: '大友宗麟', 立花山城: '立花道雪', 内城: '島津義久', 石山本願寺: '本願寺顕如', 米沢城: '伊達輝宗', 岡豊城: '長宗我部元親', 中村城: '吉良親貞' },
  hoi: { 浜松城: '徳川家康', 岐阜城: '織田信長', 小谷城: '浅井長政', 佐和山城: '磯野員昌', 一乗谷城: '朝倉義景', 敦賀城: '朝倉景鏡', 躑躅ヶ崎館: '武田信玄', 海津城: '高坂昌信', 箕輪城: '内藤昌豊', 深志城: '馬場信春', 春日山城: '上杉謙信', 坂戸城: '上杉景勝', 小田原城: '北条氏康', 滝山城: '北条氏照', 韮山城: '北条氏規', 石山本願寺: '本願寺顕如', 吉田郡山城: '毛利元就', 月山富田城: '吉川元春', 府内館: '大友宗麟', 立花山城: '立花道雪', 内城: '島津貴久', 米沢城: '伊達輝宗', 岡豊城: '長宗我部元親' },
  sekigahara: { 江戸城: '徳川家康', 宇都宮城: '徳川秀忠', 大多喜城: '本多忠勝', 小田原城: '大久保忠隣', 箕輪城: '井伊直政', 佐和山城: '石田三成', 大坂城: '豊臣秀頼', 岐阜城: '織田秀信', 清洲城: '福島正則', 熊本城: '加藤清正', 会津若松城: '上杉景勝', 上田城: '真田昌幸', 敦賀城: '大谷吉継', 掛川城: '山内一豊', 吉田城: '池田輝政', 岩出山城: '伊達政宗', 尾山御坊: '前田利長', 吉田郡山城: '毛利輝元', 内城: '島津義弘', 宇土城: '小西行長' },
  osaka: { 江戸城: '徳川秀忠', 駿府館: '徳川家康', 佐和山城: '井伊直孝', 北庄城: '松平忠直', 大坂城: '豊臣秀頼', 仙台城: '伊達政宗', 米沢城: '上杉景勝', 尾山御坊: '前田利常', 高嶺城: '毛利輝元', 内城: '島津忠恒', 熊本城: '加藤嘉明', 姫路城: '池田忠雄', 岡豊城: '山内忠義', 上田城: '真田信之' },
};

// ---------------- 武将 ----------------
// 能力の形：{ n, k 読み, b 生まれ, lea, war, int, pol, tr 個性, lk 似顔, bio, gen 名もなき家臣, me 自分 }
export function bushoOf(J, name) {
  if (!name) return null;
  const e = J.gen && J.gen[name];
  if (e && e.s) return { n: name, k: e.k || '', b: e.b, lea: e.s[0], war: e.s[1], int: e.s[2], pol: e.s[3], tr: e.tr ? e.tr.split('・') : [], lk: e.lk || 'm1', bio: e.bio || '', gen: !e.me, me: !!e.me };
  const v = BUSHO[name];
  if (v) return { n: name, k: v[0], b: v[1], lea: v[3], war: v[4], int: v[5], pol: v[6], tr: v[7] ? v[7].split('・') : [], lk: v[8], bio: v[9] || '' };
  return null;
}
const valueOf = (b) => b.lea * 0.35 + b.war * 0.25 + b.int * 0.15 + b.pol * 0.25;
// 名もなき家臣を一人作る（名は姓と通称の組み合わせ）
function makeRetainer(J, rnd, y, strong) {
  for (let i = 0; i < 40; i++) {
    const n = SEI[Math.floor(rnd() * SEI.length)] + MEI[Math.floor(rnd() * MEI.length)];
    if (J.gen[n] || BUSHO[n]) continue;
    const top = strong ? 70 : 62;
    const st = [0, 1, 2, 3].map(() => Math.round(28 + rnd() * (top - 28)));
    const TR = ['築城', '鉄砲', '騎馬', '調略', '義理堅い', '野心家', '農政', '商才'];
    const tr = rnd() < 0.22 ? TR[Math.floor(rnd() * TR.length)] : '';
    const lk = (rnd() < 0.4 ? 'k' : rnd() < 0.5 ? 'm' : 'e') + Math.floor(rnd() * 4);
    J.gen[n] = { c: -1, at: null, loy: 70, s: st, b: y - 18 - Math.floor(rnd() * 34), tr, lk, bio: '名もなき家臣。家中の務めを黙々とこなす' };
    return n;
  }
  return null;
}
// 自分の能力（身分が上がるほど伸びる）
function meStats(J) { const m = J.mibun || 0; return [44 + m * 7, 56 + m * 5, 46 + m * 5, 40 + m * 7]; }

export const yearOf = (D, turn) => D.y + Math.floor((Math.floor((D.m - 1) / 3) + turn) / 4);
export const ageOf = (D, J, b) => (b ? yearOf(D, J.turn) - b : null);
export const castlesOfClan = (J, cid) => Object.keys(J.own).filter((k) => J.own[k] === +cid).map(Number);
export const gensAt = (J, id) => Object.keys(J.gen).filter((n) => { const e = J.gen[n]; return !e.dead && e.at === +id; });
export const gensOf = (J, cid) => Object.keys(J.gen).filter((n) => { const e = J.gen[n]; return !e.dead && e.c === +cid; });
export const headOf = (D, J, cid) => (J.head && J.head[cid]) || (D.clans[cid] && D.clans[cid].daimyo);
export const lordOf = (J, c) => bushoOf(J, J.lord[c.id]);
// 家老（城主の次に重い二人）
export function karoOf(J, c) {
  const L = J.lord[c.id];
  return gensAt(J, c.id).filter((n) => n !== L).map((n) => bushoOf(J, n)).filter(Boolean).sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 2);
}

// ---------------- はじめの用意（古い保存にも足す） ----------------
export function initNaisei(D, J, o = {}) {
  J.head = J.head || {}; J.flow = J.flow || null;
  if (J.kou == null) J.kou = 0;
  if (J.mibun == null) J.mibun = o.practice ? 4 : 0;
  if (J.cmdT == null) { J.cmdT = -1; J.cmdN = 0; }
  if (J.dom && J.gen) return;
  const rnd = prng(J.scn + '|はじめ');
  const y = yearOf(D, J.turn);
  J.dom = {}; J.bank = {}; J.gen = {}; J.lord = {};
  for (const c of D.castles) {
    const k = c.koku + ((J.koku && J.koku[c.id]) || 0);
    J.dom[c.id] = { k, s: Math.round((c.koku / 40) * ({ hira: 1.2, yama: 0.9, toride: 0.5 }[c.type] ?? 1)), h: r10(k * 0.03 + 200), m: 55 + Math.floor(rnd() * 18), kt: ((J.fort && J.fort[c.id]) || 0) * 12, kn: -9 };
  }
  J.koku = {};
  for (const cid of Object.keys(D.clans)) {
    const cs = castlesOfClan(J, cid);
    J.bank[cid] = { g: Math.round(cs.reduce((a, id) => a + J.dom[id].s, 0) * 1.2), f: Math.round(cs.reduce((a, id) => a + J.dom[id].k, 0) * 0.1) };
  }
  // 前に集めた兵（一組五百人）は本城の兵に
  if (J.levy) { const hq = castlesOfClan(J, D.player).map((id) => D.byId[id]).sort((a, b) => b.hq - a.hq || b.koku - a.koku)[0]; if (hq) J.dom[hq.id].h += J.levy * 500; J.levy = 0; }
  // 武将を家に置き、城主を決める
  const L = LINEUP[J.scn] || {};
  const jos = JOSHU[J.scn] || {};
  for (const [cid, cl] of Object.entries(D.clans)) {
    const c0 = +cid;
    const names = (L[cl.name] || []).filter((n) => !J.gen[n]);
    if (cl.daimyo && !names.includes(cl.daimyo) && !J.gen[cl.daimyo]) names.unshift(cl.daimyo);
    for (const n of names) {
      if (BUSHO[n]) J.gen[n] = { c: c0, at: null, loy: 0 };
      else { const r2 = prng(n); J.gen[n] = { c: c0, at: null, loy: 0, s: [52 + Math.floor(r2() * 20), 48 + Math.floor(r2() * 22), 46 + Math.floor(r2() * 22), 48 + Math.floor(r2() * 22)], b: y - 30 - Math.floor(r2() * 20), tr: '', lk: 'k' + Math.floor(r2() * 4), bio: `${cl.name}の当主` }; }
    }
    const cs = castlesOfClan(J, cid).map((id) => D.byId[id]).sort((a, b) => b.hq - a.hq || b.koku - a.koku);
    // 足りなければ名もなき家臣で埋める（城ごとに城主と家老がいるように）
    const want = Math.max(3, cs.length * 2);
    while (names.length < want) { const n = makeRetainer(J, rnd, y, names.length < cs.length); if (!n) break; J.gen[n].c = c0; names.push(n); }
    const pool = names.filter((n) => n !== cl.daimyo);
    const free = new Set(cs.map((c) => c.id));
    const place = (c, n) => { J.lord[c.id] = n; J.gen[n].at = c.id; free.delete(c.id); const i = pool.indexOf(n); if (i >= 0) pool.splice(i, 1); };
    for (const c of cs) { const n = jos[c.name]; if (n && J.gen[n] && J.gen[n].c === c0 && !J.gen[n].at && (pool.includes(n) || n === cl.daimyo)) place(c, n); }
    if (cl.daimyo && J.gen[cl.daimyo] && J.gen[cl.daimyo].at == null) { const c = cs.find((x) => free.has(x.id)); if (c) place(c, cl.daimyo); else if (cs[0]) J.gen[cl.daimyo].at = cs[0].id; }
    pool.sort((a, b) => valueOf(bushoOf(J, b)) - valueOf(bushoOf(J, a)));
    for (const c of cs) if (free.has(c.id) && pool.length) place(c, pool[0]);
    // 残りは家老として、城に順に（本城から）
    let i = 0;
    for (const n of pool) { if (!cs.length) break; J.gen[n].at = cs[i % cs.length].id; i++; }
    // 忠誠
    for (const n of names) {
      const b = bushoOf(J, n), e = J.gen[n];
      e.loy = n === cl.daimyo ? 100 : b.tr.includes('義理堅い') ? 92 : b.tr.includes('野心家') ? 52 + (hashStr(n) % 15) : 66 + (hashStr(n) % 22);
    }
  }
  // 自分
  const me = o.me || '自分';
  J.me = J.gen[me] ? me + '（自分）' : me;
  const hq = castlesOfClan(J, D.player).map((id) => D.byId[id]).sort((a, b) => b.hq - a.hq || b.koku - a.koku);
  // 持ち場：敵に近い大きな城（本城のほかに）
  const front = hq.filter((c) => [...D.adj[c.id]].some((n) => J.own[n] !== D.player)).sort((a, b) => b.koku - a.koku)[0] || hq[0];
  J.post = front ? front.id : null;
  J.gen[J.me] = { c: D.player, at: J.post, loy: 100, s: meStats(J), b: y - 24, tr: '', lk: 'k1', me: true, bio: '足軽から身を起こした侍。この地図の主' };
  if (J.mibun >= 4 && J.post != null) J.lord[J.post] = J.me;
  syncFort(D, J);
  syncSupply(D, J);
}
// 3D の城攻めや地図の印が使う J.fort（0〜3）を、普請の積みから
export function syncFort(D, J) { for (const c of D.castles) J.fort[c.id] = Math.min(3, Math.floor((J.dom[c.id].kt || 0) / 12)); }

// 山の寺（比叡山延暦寺・一向一揆の寺など）。名で判じる。まわりの国の士気と街道に効く【山31】
const TERA_RE = /本願寺|願証寺|延暦寺/;
export const isTera = (c) => TERA_RE.test(c.name);

// ---------------- 砦の補給線・建てる・偵察（地図との結び。siege-plan 7-7／fort-spec 30〜33・39） ----------------
// 補給線：自分の家の城だけを通って本城（hq）へ行けるか。行けなければ J.cut（断たれ）。
// 行けても、隣が敵の城で、その城に出来上がった砦があれば J.slow（遅れ）【砦31】
export function syncSupply(D, J) {
  J.cut = J.cut || {}; J.slow = J.slow || {};
  for (const c of D.castles) {
    const cl = J.own[c.id];
    if (c.hq) { J.cut[c.id] = false; J.slow[c.id] = false; continue; }
    const seen = new Set([c.id]), q = [c.id];
    let reach = false;
    while (q.length) {
      const id = q.shift();
      if (D.byId[id].hq && J.own[id] === cl) { reach = true; break; }
      for (const n of D.adj[id]) if (J.own[n] === cl && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    J.cut[c.id] = !reach;
    // 隣が敵の砦、または敵の寺（街道をにらむ寺院勢力）だと街道の通りが遅れる【砦31・山31】
    J.slow[c.id] = reach && [...D.adj[c.id]].some((n) => J.own[n] !== cl && ((J.toride && J.toride[n] && J.toride[n].done) || isTera(D.byId[n])));
  }
}
// 建てる：自分の国境の城に砦を築き、守りと補給の支えにする【砦33】
export const TORIDE_COST = { g: 500, days: 2 };
export const isBorder = (D, J, id) => { const o = J.own[id]; return [...D.adj[id]].some((n) => J.own[n] !== o); };
export const canBuildToride = (D, J, id) => J.own[id] === D.player && isBorder(D, J, id) && !(J.toride && J.toride[id]);
export function startToride(D, J, id, logs, t) {
  if (!canBuildToride(D, J, id)) return false;
  const bank = J.bank[D.player] = J.bank[D.player] || { g: 0, f: 0 };
  if ((bank.g || 0) < TORIDE_COST.g) return false;
  bank.g -= TORIDE_COST.g;
  J.toride = J.toride || {};
  J.toride[id] = { done: false, until: J.turn + TORIDE_COST.days, clan: D.player };
  if (logs) logs.push({ t, s: `${D.byId[id].name}のほとりに砦の普請を始めた（${TORIDE_COST.days}季節で出来る）` });
  return true;
}
export function tickToride(D, J, logs, t) {
  if (!J.toride) return;
  for (const id of Object.keys(J.toride)) {
    const f = J.toride[id];
    if (!f.done && t >= f.until) {
      f.done = true;
      if (f.clan === D.player && logs) logs.push({ t, s: `${D.byId[id] ? D.byId[id].name : id}の砦が出来た。守りと物見が固くなった` });
    }
  }
}
// 偵察：成功すると次の軍議で敵の備えが「？」でなく見える【砦39】
export function doScout(D, J, c, logs, t) {
  const spy = bestSpy(D, J);
  const chance = clamp(55 + (spy ? spy.int * 0.4 : 0) - (J.fort[c.id] || 0) * 8, 15, 92);
  const ok = Math.random() * 100 < chance;
  J.scout = J.scout || {};
  if (ok) J.scout[c.id] = J.turn;
  if (logs) logs.push({ t, s: ok ? `${spy ? spy.n + 'を忍ばせ、' : ''}${c.name}の備えが分かった` : `${c.name}へ放った物見は手がかりを得られなかった`, k: ok ? 'good' : '' });
  return ok;
}
// 直近2季節のうちに物見が成ったか（軍議の G.enemy の known と同じ考え。渡すのは地図側だけ）
export const scouted = (J, c) => !!(J.scout && J.scout[c.id] != null && J.turn - J.scout[c.id] <= 2);

// ---------------- 城の強さ ----------------
export const baseKata = (c) => ({ yama: 45, hira: 30, toride: 18 }[c.type] ?? 30) + (c.hq ? 10 : 0);
export function kataOf(J, c) {
  const L = lordOf(J, c);
  return clamp(Math.round(baseKata(c) + (J.dom[c.id].kt || 0) + (L && L.tr.includes('築城') ? 8 : 0)), 0, 100);
}
// 城主の采配の重み（統率と武勇。猛将は少し上乗せ）
export function lordFactor(b) {
  if (!b) return 0.88;
  return 1 + (b.lea - 50) / 250 + (b.war - 50) / 350 + (b.tr.includes('猛将') ? 0.05 : 0) + (b.tr.includes('鉄砲') ? 0.03 : 0);
}
// 補給線が断たれていると守りが弱り（0.7倍）、隣に敵の砦があると少し弱る（0.9倍）【砦30・31】
export const defPow = (J, c) => J.dom[c.id].h * (1 + kataOf(J, c) / 90) * lordFactor(lordOf(J, c)) * kajiK(J, c.id)
  * (J.cut && J.cut[c.id] ? 0.7 : J.slow && J.slow[c.id] ? 0.9 : 1);
export function clanPow(J, cid) { return castlesOfClan(J, cid).reduce((a, id) => a + J.dom[id].h * lordFactor(bushoOf(J, J.lord[id])) * kajiK(J, id), 0); }

// ---------------- 金と兵糧の流れ ----------------
// 一季の見込み（秋は年貢が入る）
export function flowOf(D, J, cid, season) {
  let gi = 0, go = 0, fi = 0, fo = 0, hg = 0;
  for (const id of castlesOfClan(J, cid)) {
    const d = J.dom[id];
    gi += d.s * (0.2 + d.m / 400);
    go += d.h * 0.12;
    // 補給線が断たれると兵糧消費が増える（断たれ1.3倍・敵砦で遅れ1.1倍）【砦31】
    fo += d.h * 0.5 * (J.cut && J.cut[id] ? 1.3 : J.slow && J.slow[id] ? 1.1 : 1);
    if (season === '秋') fi += d.k * 0.12 * (0.6 + d.m / 250);
    const cap = d.k * 0.045;
    if (d.h < cap * 0.8) hg += r10((cap - d.h) * 0.05);
  }
  return { g: Math.round(gi - go), gi: Math.round(gi), go: Math.round(go), f: Math.round(fi - fo), fi: Math.round(fi), fo: Math.round(fo), h: hg };
}
// 秋の年貢の見込み（いつでも出せるように）
export function taxOf(J, cid) { return Math.round(castlesOfClan(J, cid).reduce((a, id) => { const d = J.dom[id]; return a + d.k * 0.12 * (0.6 + d.m / 250); }, 0)); }
export const foodCap = (J, cid) => Math.round(castlesOfClan(J, cid).reduce((a, id) => a + J.dom[id].k, 0) * 0.3) + 2000;

// ---------------- 内政の手の見込みと実行 ----------------
export function effOf(b, act) { const A = ACTS[act]; let e = 0.55 + (b[A.stat] / 100) * 0.9; if (b.tr.includes(A.tr)) e *= 1.35; return e; }
export function preview(D, J, c, act, b, season) {
  const d = J.dom[c.id], A = ACTS[act], cid = J.own[c.id];
  const bank = J.bank[cid] || { g: 0 };
  const e = effOf(b, act);
  let gain = 0, why = '', word = '';
  if (act === 'kaikon') {
    gain = Math.round(c.koku * 0.05 * e * (season === '冬' ? 0.5 : 1));
    if (d.k + gain > c.koku * 2.2) why = '田はもう開き尽くした';
    word = `石高 +${gain.toLocaleString('ja-JP')}石${season === '冬' ? '（冬は土が凍り半分）' : ''}`;
  } else if (act === 'machi') {
    gain = Math.round((c.koku / 40) * 0.12 * e + 15);
    if (d.s + gain > (c.koku / 40) * 3.2) why = '町はもう賑わいきっている';
    word = `商業 +${gain}（毎季の金 +${Math.round(gain * (0.2 + d.m / 400))}貫）`;
  } else if (act === 'chohei') {
    const room = Math.max(0, Math.round(d.k * 0.07) - d.h);
    gain = Math.min(room, r10((120 + b.lea * 3) * e));
    if (gain < 50) why = '集められる人手がない（石高に見合う兵はもういる）';
    word = `兵 +${gain.toLocaleString('ja-JP')}人・民の心 −4`;
  } else if (act === 'fushin') {
    gain = Math.round(8 * e);
    if ((d.kt || 0) >= 45) why = '城はこれ以上堅くできない';
    word = `城の堅さ +${gain}`;
  } else if (act === 'kenchi') {
    gain = Math.round(d.k * 0.07 * e);
    if (J.turn - d.kn < 4) why = '検地は一年に一度まで';
    word = `石高 +${gain.toLocaleString('ja-JP')}石・民の心 −10`;
  } else if (act === 'kaji') {
    gain = e > 1.1 ? 2 : 1;
    if (kajiOf(J, c.id) >= 10) why = '鍛冶町はもう賑わいきっている';
    else if ((d.s || 0) < (c.koku / 40) * 0.8) why = '先に市を開く（鍛冶は町の商いが要る）';
    word = `鍛冶 +${gain}（城の兵 +${gain * 4}%）`;
  }
  if (!why && bank.g < A.cost) why = `金が足りない（${A.cost}貫いる）`;
  return { ok: !why, why, gain, word, cost: A.cost, e };
}
// 実行して、言葉の結果を返す（数字だけにしない）
export function doAct(D, J, c, act, b, season) {
  const p = preview(D, J, c, act, b, season);
  if (!p.ok) return null;
  const d = J.dom[c.id], cid = J.own[c.id];
  J.bank[cid].g -= p.cost;
  const who = b.me ? '自ら' : `${b.n}が`;
  if (act === 'kaikon') { d.k += p.gain; d.m = clamp(d.m - 1, 0, 100); return `${c.name}：${who}田を開き、石高が${p.gain.toLocaleString('ja-JP')}石増えた`; }
  if (act === 'machi') { d.s += p.gain; d.m = clamp(d.m + 1, 0, 100); return `${c.name}：${who}市を開き、町に人が集まり出した（商業 +${p.gain}）`; }
  if (act === 'chohei') { d.h += p.gain; d.m = clamp(d.m - 4, 0, 100); return `${c.name}：${who}兵を${p.gain.toLocaleString('ja-JP')}人集めた`; }
  if (act === 'fushin') { d.kt = Math.min(45, (d.kt || 0) + p.gain); syncFort(D, J); return `${c.name}：${who}堀を深くし塀を高くした。城が堅くなった`; }
  if (act === 'kaji') { d.kj = Math.min(10, (d.kj || 0) + p.gain); return `${c.name}：${who}鍛冶を呼び、槍と鉄砲が揃ってきた（鍛冶 ${d.kj}）`; }
  if (act === 'kenchi') { d.k += p.gain; d.kn = J.turn; d.m = clamp(d.m - 10, 0, 100); return `${c.name}：${who}検地を行い、隠れた田${p.gain.toLocaleString('ja-JP')}石を見つけた。民は不満げだ`; }
  return null;
}
// その城で内政を任せられる武将（奉行）。政治の高い順
export function bugyoFor(D, J, c, act) {
  const cid = J.own[c.id];
  const here = gensAt(J, c.id).filter((n) => J.gen[n].c === cid);
  const list = [...new Set([...here, ...(cid === D.player && J.gen[J.me] ? [J.me] : [])])].map((n) => bushoOf(J, n)).filter(Boolean);
  return list.sort((a, b) => effOf(b, act) - effOf(a, act));
}

// ---------------- 季節の動き ----------------
function isFront(D, J, id, allied) { const o = J.own[id]; return [...D.adj[id]].some((n) => !allied(o, J.own[n])); }
// 他家（と、自分の手の届かない自分の家の城）の内政。家老や城主が勝手に進める
function aiNaisei(D, J, cid, season, allied, skip) {
  const bank = J.bank[cid];
  const ids = castlesOfClan(J, cid).filter((id) => !skip.has(id));
  // 自分の家は家老の差配なので控えめに（蔵の金を残す）
  const mineClan = +cid === D.player;
  let n = mineClan ? 1 : Math.min(ids.length, 1 + Math.floor(ids.length / 2));
  const reserve = mineClan ? 900 : 250;
  ids.sort(() => Math.random() - 0.5);
  const need = flowOf(D, J, cid, '夏').fo * 2;
  for (const id of ids) {
    if (n <= 0) break;
    const c = D.byId[id], d = J.dom[id];
    const L = bushoOf(J, J.lord[id]); if (!L) continue;
    const front = isFront(D, J, id, allied);
    let act = 'kaikon';
    if (bank.f < need && J.turn - d.kn >= 4 && d.m > 50) act = 'kenchi';
    else if (front && d.h < d.k * 0.045) act = 'chohei';
    else if (front && (d.kt || 0) < 30 && Math.random() < 0.6) act = 'fushin';
    else if (bank.g < 700) act = 'machi';
    else act = Math.random() < 0.55 ? 'kaikon' : 'machi';
    if (bank.g < ACTS[act].cost + reserve) continue;
    if (doAct(D, J, c, act, L, season)) n--;
  }
}
// 季節の終わりの計算：金と兵糧・民の心・兵の増減・他家の内政・忠誠・寝返り・老いと死・浪人。知らせの行を返す
export function seasonTick(D, J, season, allied, skip = new Set()) {
  const logs = [], P = D.player, t = J.turn + 1;
  tickToride(D, J, logs, t);
  syncSupply(D, J);
  const before = { g: (J.bank[P] || {}).g || 0, f: (J.bank[P] || {}).f || 0, h: castlesOfClan(J, P).reduce((a, id) => a + J.dom[id].h, 0) };
  for (const cid of Object.keys(D.clans)) {
    const ids = castlesOfClan(J, cid);
    if (!ids.length) continue;
    const bank = J.bank[cid] = J.bank[cid] || { g: 0, f: 0 };
    const fl = flowOf(D, J, cid, season);
    bank.g += fl.g; bank.f += fl.f;
    bank.f = Math.min(bank.f, foodCap(J, cid));
    if (season === '秋' && +cid === P) logs.push({ t, s: `秋の年貢が納められた。兵糧 +${fl.fi.toLocaleString('ja-JP')}石`, k: 'good' });
    if (bank.f < 0) {
      bank.f = 0;
      for (const id of ids) { J.dom[id].h = r10(J.dom[id].h * 0.9); J.dom[id].m = clamp(J.dom[id].m - 5, 0, 100); }
      if (+cid === P) logs.push({ t, s: '兵糧が尽き、兵が一割逃げ出した', k: 'bad' });
    }
    if (bank.g < 0) { bank.g = 0; for (const n of gensOf(J, cid)) J.gen[n].loy = clamp(J.gen[n].loy - 3, 0, 100); if (+cid === P) logs.push({ t, s: '金が尽きて俸禄が滞った。家臣が不満を漏らす', k: 'bad' }); }
    for (const id of ids) {
      const d = J.dom[id], L = bushoOf(J, J.lord[id]);
      // 山の寺（比叡山・一向一揆などの寺院勢力）が隣にあると、味方なら民の心が支えられ、敵なら乱れる【山31】
      const teraK = [...D.adj[id]].reduce((a, n) => a + (isTera(D.byId[n]) ? (J.own[n] === cid ? 1.5 : -1.5) : 0), 0);
      d.m = clamp(d.m + (d.m < 60 ? 2 : d.m > 72 ? -1 : 0) + (L && L.pol >= 80 ? 1 : 0) + teraK, 0, 100);
      const cap = d.k * 0.045;
      if (d.h < cap * 0.8) d.h += r10((cap - d.h) * 0.05);
      // 一揆：民の心がひどく低いと
      if (d.m < 25 && Math.random() < 0.3) {
        d.h = r10(d.h * 0.85); d.m += 12;
        if (+cid === P) logs.push({ t, s: `${D.byId[id].name}の領内で一揆。兵を割いて鎮めた`, k: 'bad' });
      }
    }
    aiNaisei(D, J, cid, season, allied, +cid === P ? skip : new Set());
  }
  // 忠誠のうつろい
  const lostBy = {};
  const prevC = J.hist.length > 1 ? J.hist[J.hist.length - 2].c : null;
  if (prevC) for (const cid of Object.keys(D.clans)) lostBy[cid] = Math.max(0, (prevC[cid] || 0) - castlesOfClan(J, cid).length);
  for (const n of Object.keys(J.gen)) {
    const e = J.gen[n];
    if (e.dead || e.c < 0 || e.me || n === headOf(D, J, e.c)) continue;
    const b = bushoOf(J, n);
    const base = b.tr.includes('義理堅い') ? 92 : b.tr.includes('野心家') ? 55 : 70;
    e.loy += Math.sign(base - e.loy);
    if (lostBy[e.c]) e.loy -= Math.min(10, lostBy[e.c] * (b.tr.includes('野心家') ? 6 : 3));
    e.loy = clamp(e.loy, 0, 100);
  }
  // 寝返り：忠誠の低い城主が、隣の強い家に城ごと付く
  for (const [id, n] of Object.entries(J.lord)) {
    const e = J.gen[n]; if (!e || e.dead || e.me || e.c < 0 || n === headOf(D, J, e.c)) continue;
    const b = bushoOf(J, n);
    if (b.tr.includes('義理堅い') || e.loy >= 35 || J.own[id] !== e.c) continue;
    const own = e.c;
    const nb = [...new Set([...D.adj[id]].map((x) => J.own[x]))].filter((o) => o !== own && !allied(own, o));
    const strong = nb.filter((o) => clanPow(J, o) > clanPow(J, own) * 1.1).sort((a, x) => clanPow(J, x) - clanPow(J, a))[0];
    if (strong == null) continue;
    if (Math.random() > (35 - e.loy) / 100 + (b.tr.includes('野心家') ? 0.18 : 0.04)) continue;
    const c = D.byId[id];
    J.own[id] = strong; J.fallen[id] = t;
    for (const g of gensAt(J, id)) { const ge = J.gen[g]; if (ge.me) continue; if (g === n || ge.loy < 60) { ge.c = strong; ge.loy = 60; } else { moveToClan(D, J, g, own); } }
    const on = D.clans[own].name, sn = D.clans[strong].name;
    logs.push({ t, s: `${n}、${c.name}ごと${on}を離れ${sn}に寝返る`, k: own === P ? 'bad' : strong === P ? 'good' : '' });
  }
  // 老いと病（冬に一度）
  if (season === '冬') {
    for (const n of Object.keys(J.gen)) {
      const e = J.gen[n]; if (e.dead || e.me) continue;
      const b = bushoOf(J, n), age = ageOf(D, J, b.b);
      if (!age || age < 58) continue;
      if (Math.random() > 0.01 + (age - 58) * 0.009) continue;
      e.dead = t;
      const wasHead = e.c >= 0 && n === headOf(D, J, e.c);
      if (!b.gen || wasHead) logs.push({ t, s: `${n}、病により世を去る（${age}歳）`, k: wasHead ? 'big' : '' });
      afterDeath(D, J, n, logs, t);
    }
  }
  // 浪人：家を失った者が、他家に仕える（自分の家へは評定で願い出る）
  for (const n of Object.keys(J.gen)) {
    const e = J.gen[n]; if (e.dead || e.c >= 0 || e.me) continue;
    if (Math.random() > 0.2) continue;
    const alive = Object.keys(D.clans).map(Number).filter((cid) => castlesOfClan(J, cid).length);
    if (!alive.length) continue;
    const to = alive[Math.floor(Math.random() * alive.length)];
    if (to === P) { if (!J.offer && !bushoOf(J, n).gen) J.offer = n; continue; }
    moveToClan(D, J, n, to);
    e.loy = 60;
    if (!bushoOf(J, n).gen) logs.push({ t, s: `浪人の${n}、${D.clans[to].name}に仕える`, k: '' });
  }
  // 自分の家の増減（上の帯の「+○/月」の元）
  const bk = J.bank[P] || { g: 0, f: 0 };
  J.flow = { t, g: bk.g - before.g, f: bk.f - before.f, h: castlesOfClan(J, P).reduce((a, id) => a + J.dom[id].h, 0) - before.h };
  return logs;
}
// 城を持たない者は家の本城へ。家に城がなければ浪人
function moveToClan(D, J, n, cid, but) {
  const e = J.gen[n];
  const cs = castlesOfClan(J, cid).filter((id) => id !== but).map((id) => D.byId[id]).sort((a, b) => b.hq - a.hq || b.koku - a.koku);
  if (!cs.length) { e.c = -1; e.at = null; return; }
  e.c = +cid; e.at = cs[0].id;
}
// 死んだ者の後始末：城主なら家老が継ぐ、当主なら家督を継ぐ
function afterDeath(D, J, n, logs, t, but) {
  const e = J.gen[n];
  for (const [id, L] of Object.entries(J.lord)) if (L === n) {
    const next = gensAt(J, id).filter((x) => x !== n && J.gen[x].c === J.own[id]).map((x) => bushoOf(J, x)).sort((a, b) => valueOf(b) - valueOf(a))[0];
    if (next) J.lord[id] = next.n; else delete J.lord[id];
  }
  if (e.c >= 0 && n === headOf(D, J, e.c) && castlesOfClan(J, e.c).some((id) => id !== but)) {
    const heir = gensOf(J, e.c).filter((x) => x !== n && !J.gen[x].me).map((x) => bushoOf(J, x)).sort((a, b) => (b.n.slice(0, 2) === n.slice(0, 2)) - (a.n.slice(0, 2) === n.slice(0, 2)) || valueOf(b) - valueOf(a))[0];
    if (heir) { J.head[e.c] = heir.n; J.gen[heir.n].loy = 100; logs.push({ t, s: `${heir.n}が${D.clans[e.c].name}の家督を継ぐ`, k: 'big' }); }
  }
}
// 城が落ちた時の、城にいた武将の行く末（討死・降る・落ち延びる）と、新しい城主。J.own もここで書き換える
export function capture(D, J, c, win, logs, t, fromId) {
  const lose = J.own[c.id] === win ? null : J.own[c.id];
  const oldLord = J.lord[c.id];
  const here = gensAt(J, c.id);
  const loseName = lose != null ? D.clans[lose].name : '';
  for (const n of here.sort((a, b) => (b === oldLord) - (a === oldLord))) {
    const e = J.gen[n]; if (e.me) { moveToClan(D, J, n, e.c, c.id); continue; }
    const b = bushoOf(J, n), isLord = n === oldLord, head = lose != null && n === headOf(D, J, lose);
    const r = Math.random();
    const named = !b.gen;
    if (r < (isLord ? 0.2 : 0.1)) {
      e.dead = t;
      if (named || isLord) logs.push({ t, s: `${n}、${c.name}で討死`, k: isLord && named ? 'big' : '' });
      afterDeath(D, J, n, logs, t, c.id);
    } else if (!head && !b.tr.includes('義理堅い') && r < 0.55) {
      e.c = win; e.at = c.id; e.loy = 48;
      if (named) logs.push({ t, s: `${n}、${D.clans[win].name}に降る`, k: win === D.player ? 'good' : '' });
    } else {
      moveToClan(D, J, n, lose, c.id);
      if (e.c < 0 && named) logs.push({ t, s: `${n}、城を落ち延びて浪人となる`, k: '' });
    }
  }
  delete J.lord[c.id];
  J.dom[c.id].kt = Math.max(0, (J.dom[c.id].kt || 0) - 8);
  J.dom[c.id].m = clamp(J.dom[c.id].m - 12, 0, 100);
  // 新しい城主：攻めた城の家臣から（いなければ家中の手の空いた者、それもなければ名もなき家臣）
  const cand = (fromId != null ? gensAt(J, fromId) : []).concat(gensOf(J, win)).filter((n) => { const e = J.gen[n]; return e.c === win && !e.me && !Object.values(J.lord).includes(n) && n !== headOf(D, J, win); });
  let nl = cand.map((n) => bushoOf(J, n)).sort((a, b) => valueOf(b) - valueOf(a))[0];
  if (!nl) { const n = makeRetainer(J, prng(J.scn + c.id + '|' + t), yearOf(D, J.turn), false); if (n) { J.gen[n].c = win; J.gen[n].loy = 70; nl = bushoOf(J, n); } }
  if (nl) { J.lord[c.id] = nl.n; J.gen[nl.n].at = c.id; }
  // 持ち主を替える（城をすべて失った家の者は浪人に）
  J.own[c.id] = win;
  syncFort(D, J);
  syncSupply(D, J);
  // 砦ごと落ちた城は失う（持ち主が替わったので築きかけ・出来た砦とも意味を失う）【砦30〜32】
  if (J.toride && J.toride[c.id]) delete J.toride[c.id];
  if (lose != null && !castlesOfClan(J, lose).length) for (const n of gensOf(J, lose)) { J.gen[n].c = -1; J.gen[n].at = null; }
}
// 他家どうしの城攻め（数で決める）。兵と兵糧が減り、落ちれば城主の行く末も
// cap=false の時は城を取れない（小競り合いどまり）。史実にない家どうしの勝手な攻め取りを止めるため（japan.js の advance）
export function aiBattle(D, J, from, to, cid, logs, t, cap = true) {
  const dF = J.dom[from], dT = J.dom[to];
  const bank = J.bank[cid] || { f: 0 };
  const sent = Math.max(200, r10(dF.h * 0.6));
  const cost = Math.round(sent * 0.6);
  const hungry = bank.f < cost;
  bank.f = Math.max(0, bank.f - cost);
  const a = sent * lordFactor(bushoOf(J, J.lord[from])) * (hungry ? 0.6 : 1);
  const d = defPow(J, D.byId[to]) * (D.byId[to].hq ? 1.15 : 1);
  const p = clamp(0.08 + 0.84 * (a / (a + d)) - 0.12, 0.05, 0.82);
  const won = cap && Math.random() < p;
  if (won) { dF.h = Math.max(100, dF.h - sent); dT.h = r10(sent * 0.55); capture(D, J, D.byId[to], cid, logs, t, from); }
  else { dF.h = Math.max(100, dF.h - r10(sent * 0.3)); dT.h = Math.max(100, dT.h - r10(dT.h * 0.15)); dT.kt = Math.max(0, (dT.kt || 0) - 3); }
  return { won, p, hungry };
}
// 攻めの見込みの数（他家が狙う城を選ぶ時に）
export function aiOdds(D, J, from, to, cid) {
  const a = J.dom[from].h * 0.6 * lordFactor(bushoOf(J, J.lord[from]));
  const d = defPow(J, D.byId[to]);
  return a / (a + d);
}

// ---------------- 自分の家の出陣 ----------------
// 出せる兵・金と兵糧の足り・戦える日数
export function campaign(D, J) {
  const P = D.player;
  const ids = castlesOfClan(J, P);
  const pool = ids.reduce((a, id) => a + J.dom[id].h, 0);
  let army = Math.max(800, r10(pool * 0.55));
  const bank = J.bank[P] || { g: 0, f: 0 };
  const why = [];
  const gNeed = (n) => Math.round(n * 0.1);
  if (bank.g < gNeed(army)) { army = Math.max(800, r10(bank.g / 0.1)); why.push('金が足りず、矢銭の出せる分だけ'); }
  const perDay = (n) => n * 0.03;
  let days = Math.floor(bank.f / perDay(army));
  if (days < 12) { const n2 = Math.max(800, r10(bank.f / perDay(12))); if (n2 < army) { army = n2; why.push('兵糧が乏しく、十二日分の兵だけ'); } days = Math.floor(bank.f / perDay(army)); }
  days = clamp(days, 0, 60);
  return { army, days, pool, gold: gNeed(army), food: Math.round(perDay(army) * Math.min(days, 20)), why };
}
// 出陣の後始末（勝ち負けで兵が減る。金と兵糧を払う）
export function afterCampaign(D, J, c, fromId, won, logs, t) {
  const P = D.player, cp = campaign(D, J);
  const bank = J.bank[P];
  bank.g = Math.max(0, bank.g - cp.gold); bank.f = Math.max(0, bank.f - cp.food);
  const loss = cp.army * (won ? 0.14 : 0.28);
  const ids = castlesOfClan(J, P).filter((id) => id !== c.id);
  const tot = ids.reduce((a, id) => a + J.dom[id].h, 0) || 1;
  for (const id of ids) J.dom[id].h = Math.max(100, r10(J.dom[id].h - (loss * J.dom[id].h) / tot));
  if (won) {
    J.dom[c.id].h = r10(cp.army * 0.3);
    for (const id of ids) J.dom[id].h = Math.max(100, r10(J.dom[id].h - (cp.army * 0.3 * J.dom[id].h) / tot));
    capture(D, J, c, P, logs, t, fromId);
  } else { J.dom[c.id].h = Math.max(100, r10(J.dom[c.id].h * 0.8)); J.dom[c.id].kt = Math.max(0, (J.dom[c.id].kt || 0) - 4); syncFort(D, J); }
}

// ---------------- 勲功と身分 ----------------
export function addKou(D, J, n) {
  J.kou = (J.kou || 0) + n;
  let up = null;
  const from = J.mibun || 0;
  while (J.mibun < MIBUN.length - 1 && J.kou >= KOU_NEED[J.mibun + 1]) { J.mibun++; up = MIBUN[J.mibun]; }
  if (up) {
    const e = J.gen[J.me]; if (e) e.s = meStats(J);
    // 城主になったら、持ち場の城を預かる
    if (J.mibun >= 4 && J.post != null && J.own[J.post] === D.player && J.lord[J.post] !== J.me) { J.lord[J.post] = J.me; if (e) e.at = J.post; }
    // 部将になって初めて内政ができる時は、一度だけ知らせる（japan.js の取り立ての札）
    if (from < NAISEI_FROM && J.mibun >= NAISEI_FROM) J.naiseiNew = true;
  }
  return up;
}
// 自分が内政できる城（部将より下は無い。その間は家老が差配する）
export function scopeCastles(D, J) {
  if (!canNaisei(J)) return [];
  const P = D.player, sc = MIBUN[J.mibun].scope;
  const mine = castlesOfClan(J, P).map((id) => D.byId[id]);
  if (sc === 'all') return mine;
  if (sc === 'own') { const o = mine.filter((c) => J.lord[c.id] === J.me); return o.length ? o : mine.filter((c) => c.id === J.post); }
  const p = mine.find((c) => c.id === J.post) || mine[0];
  return p ? [p] : [];
}
// 持ち場が他家に取られた時は、別の城へ
export function fixPost(D, J) {
  if (J.post != null && J.own[J.post] === D.player) return;
  const mine = castlesOfClan(J, D.player).map((id) => D.byId[id]).sort((a, b) => b.koku - a.koku);
  J.post = mine.length ? mine[0].id : null;
  if (J.gen[J.me]) J.gen[J.me].at = J.post;
  if (J.mibun >= 4 && J.post != null && !Object.values(J.lord).includes(J.me)) { J.lord[J.post] = J.me; }
}

// ---------------- 評定 ----------------
// h：{ attackable(c), odds(c), danger(c), allied(a, b), season } を japan.js から
export function makeCouncil(D, J, h) {
  const P = D.player, items = [];
  const gens = gensOf(J, P).filter((n) => !J.gen[n].me && n !== headOf(D, J, P)).map((n) => bushoOf(J, n)).filter(Boolean);
  const used = new Set();
  const pick = (score) => { const s = gens.filter((b) => !used.has(b.n)).sort((a, b) => score(b) - score(a))[0]; if (s) used.add(s.n); return s; };
  const bank = J.bank[P] || { g: 0, f: 0 };
  const fl = flowOf(D, J, P, '夏');
  const mine = castlesOfClan(J, P).map((id) => D.byId[id]);
  const toAutumn = { 春: 2, 夏: 1, 秋: 0, 冬: 3 }[h.season] ?? 1;
  const cp = campaign(D, J);
  // 兵糧
  if (bank.f < fl.fo * (toAutumn + 1) + cp.food) {
    const b = pick((x) => x.pol + (x.tr.includes('農政') ? 20 : 0));
    const c = mine.filter((x) => J.turn - J.dom[x.id].kn >= 4).sort((a, x) => J.dom[x.id].k - J.dom[a.id].k)[0] || mine[0];
    if (b && c) items.push({ id: 'food', who: b.n, kind: 'act', act: J.turn - J.dom[c.id].kn >= 4 ? 'kenchi' : 'kaikon', cid: c.id, pr: 90, text: `兵糧が足りませぬ。${toAutumn ? `秋の年貢まで${toAutumn}季、` : ''}このままでは出陣もままなりませぬ。${c.name}で${J.turn - J.dom[c.id].kn >= 4 ? '検地を' : '田を開きましょう'}。` });
  }
  // 攻め
  const tg = D.castles.filter((c) => h.attackable(c)).map((c) => ({ c, o: h.odds(c) })).sort((a, b) => ['good', 'even', 'bad'].indexOf(a.o[1]) - ['good', 'even', 'bad'].indexOf(b.o[1]) || J.dom[a.c.id].h - J.dom[b.c.id].h)[0];
  if (tg && tg.o[1] !== 'bad') {
    const b = pick((x) => x.war + (x.tr.includes('猛将') ? 25 : 0));
    const L = lordOf(J, tg.c);
    if (b) items.push({ id: 'atk', who: b.n, kind: 'attack', cid: tg.c.id, pr: tg.o[1] === 'good' ? 85 : 60, text: `${tg.c.name}を攻めましょう。城兵はおよそ${J.dom[tg.c.id].h.toLocaleString('ja-JP')}${L ? `、城主は${L.n}` : ''}。見込みは${tg.o[0]}にござる。` });
  }
  // 守り
  const risky = mine.filter((c) => h.danger(c) >= 2 && (J.dom[c.id].kt || 0) < 40).sort((a, b) => kataOf(J, a) - kataOf(J, b))[0];
  if (risky) {
    const b = pick((x) => x.pol + (x.tr.includes('築城') ? 30 : 0));
    if (b) items.push({ id: 'def', who: b.n, kind: 'act', act: 'fushin', cid: risky.id, pr: 75, text: `${risky.name}の隣の敵は強うございます。堀を深くし、城を固めねばなりませぬ。` });
  }
  // 金
  if (bank.g < 600) {
    const b = pick((x) => x.pol + (x.tr.includes('商才') ? 25 : 0));
    const c = mine.sort((a, x) => x.koku - a.koku)[0];
    if (b && c) items.push({ id: 'gold', who: b.n, kind: 'act', act: 'machi', cid: c.id, pr: 70, text: `蔵の金が乏しゅうございます（${bank.g.toLocaleString('ja-JP')}貫）。${c.name}の城下に市を開き、商いを盛んにいたしましょう。` });
  }
  // 兵
  const weak = mine.filter((c) => J.dom[c.id].h < J.dom[c.id].k * 0.04 && h.danger(c) >= 1).sort((a, b) => J.dom[a.id].h - J.dom[b.id].h)[0];
  if (weak) {
    const b = pick((x) => x.lea);
    if (b) items.push({ id: 'levy', who: b.n, kind: 'act', act: 'chohei', cid: weak.id, pr: 65, text: `${weak.name}の兵が薄うございます（${J.dom[weak.id].h.toLocaleString('ja-JP')}人）。兵を集めておきましょう。` });
  }
  // 調略：敵の城主の心が離れている（知略の高い者だけが気づく）
  const spy = gens.filter((b) => !used.has(b.n) && (b.int >= 75 || b.tr.includes('調略'))).sort((a, b) => b.int - a.int)[0];
  if (spy) {
    const t2 = D.castles.filter((c) => h.attackable(c) && !c.hq).map((c) => ({ c, L: J.lord[c.id] && J.gen[J.lord[c.id]] })).filter((x) => x.L && x.L.loy < 55 && !bushoOf(J, J.lord[x.c.id]).tr.includes('義理堅い')).sort((a, b) => a.L.loy - b.L.loy)[0];
    if (t2) { used.add(spy.n); items.push({ id: 'turn', who: spy.n, kind: 'turn', cid: t2.c.id, pr: 72, text: `${t2.c.name}の${J.lord[t2.c.id]}は主家に不満を抱く様子。寝返りを誘えば、戦わずに城が手に入るやもしれませぬ。` }); }
  }
  // 家中の者の心
  const unhappy = gens.filter((b) => J.gen[b.n].loy < 45).sort((a, b) => J.gen[a.n].loy - J.gen[b.n].loy)[0];
  if (unhappy) {
    const b = pick((x) => x.int);
    if (b) items.push({ id: 'loy', who: b.n, kind: 'reward', target: unhappy.n, pr: 68, text: `${unhappy.n}殿の心が離れております（忠誠${J.gen[unhappy.n].loy}）。褒美を与えて繋ぎ留めねば、寝返りもありえまする。` });
  }
  // 浪人の召し抱え
  if (J.offer && J.gen[J.offer] && J.gen[J.offer].c < 0 && !J.gen[J.offer].dead) {
    const r = bushoOf(J, J.offer);
    const b = pick((x) => x.int);
    if (b && r) items.push({ id: 'hire', who: b.n, kind: 'hire', target: r.n, pr: 66, text: `浪人の${r.n}（統率${r.lea}・武勇${r.war}）が仕官を願い出ております。召し抱えましょう。支度金に300貫。` });
  }
  items.sort((a, b) => b.pr - a.pr);
  return { t: J.turn, items: items.slice(0, 4), done: [], said: 0, decided: 0, order: null };
}
// 主君（大名）がどの進言を採るか：一番の物。自分の進言も見込みで採る
export function lordPick(hy) { return hy.items.filter((x) => !x.state)[0] || null; }
// 寝返りの誘いの見込み（城主の忠誠と個性、こちらの調略の上手）
export function turnChance(D, J, c, spy) {
  const L = lordOf(J, c), e = L && J.gen[L.n];
  if (!L || !e) return 0.1;
  if (L.tr.includes('義理堅い') || L.n === headOf(D, J, J.own[c.id])) return 0.02;
  const sk = spy ? (spy.int - 60) / 200 + (spy.tr.includes('調略') ? 0.12 : 0) : 0;
  return clamp(0.08 + (60 - e.loy) / 110 + (L.tr.includes('野心家') ? 0.12 : 0) + sk - (c.hq ? 0.2 : 0), 0.03, 0.8);
}
export const bestSpy = (D, J) => gensOf(J, D.player).map((n) => bushoOf(J, n)).filter(Boolean).sort((a, b) => (b.int + (b.tr.includes('調略') ? 20 : 0)) - (a.int + (a.tr.includes('調略') ? 20 : 0)))[0];
// 寝返り：城主が城ごとこちらに付く（心の離れた家臣も連れて。忠義の者は落ち延びる）
export function turnCastle(D, J, c, to, logs, t) {
  const from = J.own[c.id];
  for (const n of gensAt(J, c.id)) {
    const e = J.gen[n]; if (e.me) continue;
    if (n === J.lord[c.id] || e.loy < 65) { e.c = +to; e.loy = 55; }
    else { moveToClan(D, J, n, from, c.id); if (logs && !bushoOf(J, n).gen) logs.push({ t, s: `${n}は寝返りに従わず、${c.name}を去った`, k: '' }); }
  }
  J.own[c.id] = +to;
  if (!castlesOfClan(J, from).length) for (const n of gensOf(J, from)) { J.gen[n].c = -1; J.gen[n].at = null; }
}
