// 武将図鑑と実績（戦功の記録）
// 図鑑：generals_data.js の BUSHO と、戦に出てくる名のある者（下の EXTRA）を並べる。会った者だけ顔と能力・来歴を見せる
// 実績：戦の終わりに zukanRecord(b, G) を呼ぶと、会った武将を記し、取れた実績の札を出す
// 記録は保存（state.js）とは別の鍵で localStorage に置く。読めない・書けない時は、その場の記憶だけで動く
import { BUSHO, LINEUP, TRAIT_NOTE } from './generals_data.js';
import { MAP_SCENARIOS } from './japan_data.js';
import { faceURL } from './japan3d.js';
import { SCENARIOS, SCENARIO_ORDER, BATTLES, ITEMS, HORSES, loadAll, scenarioKey } from './state.js';
import { S, reduceMotion } from './settings.js';
import { sfx } from './audio.js';

import { ZK_KEY as KEY, readZukanRaw } from './zukan_store.js';
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
// 名簿にいない、戦に出てくる者（史実に沿って。分からない年は書かない）
// [読み, 生まれ, 没, 似顔, 来歴, 家, 物語の人物か]
const EXTRA = {
  奥平信昌: ['おくだいらのぶまさ', 1555, 1615, 'k0', '長篠城の城主。わずかな兵で武田の大軍から城を守り抜いた。のちに家康の娘・亀姫を妻に迎えた。', '奥平家'],
  鳥居強右衛門: ['とりいすねえもん', null, 1575, 'm1', '奥平家の足軽。囲まれた長篠城を抜け出し、岡崎へ援軍を頼みに走った。戻る途中で武田方に捕らえられ、「援軍は来る」と城へ叫んで命を落としたと伝わる。', '奥平家'],
  今川義元: ['いまがわよしもと', 1519, 1560, 'e1', '駿河・遠江・三河を治めた「海道一の弓取り」。大軍で尾張へ攻め入ったが、桶狭間で織田勢に討たれた。', '今川家'],
  毛利新介: ['もうりしんすけ', null, 1582, 'k1', '信長の馬廻。桶狭間で今川義元を討ち取った。本能寺の変のとき、織田信忠とともに討死したと伝わる。', '織田家'],
  今福浄閑: ['いまふくじょうかん', null, null, 'b1', '武田方の将。天正三年、遠江の諏訪原城を守ったと伝わる。', '武田家'],
  日比野下野守: ['ひびのしもつけのかみ', null, 1561, 'k2', '斎藤家の将。森部の戦いで織田勢に討たれた。', '斎藤家'],
  長井甲斐守: ['ながいかいのかみ', null, 1561, 'k1', '斎藤家の将。森部の戦いで、日比野下野守とともに討たれた。', '斎藤家'],
  坂井政尚: ['さかいまさひさ', null, 1570, 'k2', '織田家の将。姉川の戦いで先手を務めた。同じ年の暮れ、近江の堅田で討死した。', '織田家'],
  浅井政澄: ['あざいまさずみ', null, null, 'k1', '浅井家の一門。姉川の戦いで浅井勢の一手を率いたと伝わる。', '浅井家'],
  北畠具教: ['きたばたけとものり', 1528, 1576, 'e2', '伊勢国司。大河内城で織田勢を長く防いだが、和睦の末に信長の子・信雄を養子に迎えて家を譲った。のち三瀬の変で謀殺された。', '北畠家'],
  日置大膳: ['へきだいぜん', null, null, 'k2', '北畠家の将。大河内城の籠城で織田勢を防いだと伝わる。', '北畠家'],
  池田勝正: ['いけだかつまさ', null, null, 'e1', '摂津の池田城主。金ヶ崎の退き口で、木下藤吉郎・明智光秀らとともに殿を務めたと伝わる。', '摂津池田家'],
  正覚院豪盛: ['しょうがくいんごうせい', null, null, 'b0', '比叡山延暦寺の僧。焼き討ちの後に山を逃れ、甲斐の武田信玄を頼ったという。', '延暦寺'],
  戸田勝成: ['とだかつしげ', null, 1600, 'k1', '豊臣家の大名。関ヶ原では大谷吉継とともに戦い、討死した。', '大谷家'],
  平塚為広: ['ひらつかためひろ', null, 1600, 'k2', '豊臣家の大名。関ヶ原で大谷吉継の隊に加わって戦い、討死した。', '大谷家'],
  平岡頼勝: ['ひらおかよりかつ', 1560, 1607, 'e1', '小早川秀秋の家老。関ヶ原で秀秋が東軍に付くことに関わったと伝わる。', '小早川家'],
  島津豊久: ['しまづとよひさ', 1570, 1600, 'k0', '島津家久の子。関ヶ原の退き口で、伯父の義弘を逃がすために殿に残り、討死した。', '島津家'],
  寺沢広高: ['てらざわひろたか', 1563, 1633, 'e1', '豊臣家の奉行。関ヶ原では東軍に付き、のちに肥前の唐津を治めた。', '寺沢家'],
  山崎長徳: ['やまざきながのり', null, null, 'k2', '前田家の将。大坂冬の陣で、前田勢として真田丸に寄せた。', '前田家'],
  片倉重長: ['かたくらしげなが', 1585, 1659, 'k0', '伊達家の家臣で、片倉景綱の子。道明寺の戦いで後藤又兵衛の隊と戦い、「鬼の小十郎」と呼ばれた。', '伊達家'],
  松平忠明: ['まつだいらただあきら', 1583, 1644, 'e0', '奥平信昌の子で、家康の外孫。大坂の陣の後、焼けた大坂の町の立て直しを任された。', '徳川家'],
  本多重次: ['ほんだしげつぐ', 1529, 1596, 'k3', '「鬼作左」と呼ばれた徳川の古参。「一筆啓上　火の用心」で始まる短い手紙で知られる。', '徳川家'],
  源八: ['げんぱち', null, null, 'm2', 'この物語の人物。桶狭間で主人公を預かる足軽の組頭。', '織田家', true],
  大沢勘兵衛: ['おおさわかんべえ', null, null, 'k2', 'この物語の人物。森部で主人公の組を率いる足軽大将。', '織田家', true],
  // 831：桶狭間で救う侍と、墨俣の敵将
  前野長兵衛: ['まえのちょうべえ', null, null, 'm1', '織田家の侍。桶狭間の雨の中で今川勢に囲まれ、主人公に救われる（この物語では）。前野家は尾張の土豪で、のちに蜂須賀家と共に藤吉郎を助けた。', '織田家'],
  稲田弾正: ['いなだだんじょう', null, null, 'k2', 'この物語の人物。墨俣の砦普請を襲う斎藤方の侍大将。', '斎藤家', true],
  吉田出雲守: ['よしだいずものかみ', null, null, 'k1', '六角家の将。永禄十一年、織田勢の上洛の道をふさぐ箕作城を守ったと伝わる。', '六角家'],
  座光寺為清: ['ざこうじためきよ', null, null, 'k1', '武田方の将。信濃の国衆で、岩村城攻めの後詰に加わったと伝わる。', '武田家'],
  明智秀満: ['あけちひでみつ', null, 1582, 'k2', '光秀の重臣で娘婿。本能寺の変では先手として押し寄せた。山崎の敗戦の後、坂本城で自害した。', '明智家'],
  池田知正: ['いけだともまさ', 1555, 1604, 'e1', '摂津池田家の当主。荒木村重が謀叛した後も織田方に付き、有岡城攻めに加わったと伝わる。', '摂津池田家'],
  滝野吉政: ['たきのよしまさ', null, null, 'k1', '伊賀衆の将。天正伊賀の乱では柏原城に拠って織田勢に抗ったと伝わる。', '伊賀衆'],
  奈佐日本之介: ['なさひのもとのすけ', null, null, 'k1', '因幡の水軍衆。鳥取城の兵糧攻めのとき、海から兵糧を運び入れようとしたと伝わる。', '毛利家'],
  武田信勝: ['たけだのぶかつ', 1567, 1582, 'm0', '勝頼の嫡男。田野で父とともに最期まで戦い、自害した。まだ十六歳だった。', '武田家'],
};
// 名簿の年の誤りを直す
const FIX = { 織田信長: { d: 1582 } };
// 戦の中の呼び名 → 図鑑の名
const ALIAS = { 木下秀吉: '木下藤吉郎', 藤吉郎: '木下藤吉郎', 強右衛門: '鳥居強右衛門', 河窪信実: '武田信実', 真田信繁: '真田幸村', 本多作左: '本多重次', 勘兵衛: '大沢勘兵衛', 谷大膳: '谷衛好', 蜂須賀小六: '蜂須賀正勝', 稲葉良通: '稲葉一鉄' };

// どの戦で会えるか（戦の id → [名, 立場]）。戦の定義（battles.js・b_*.js）と main.js の BOSS_BY から
const APPEAR = {
  okehazama: [['織田信長', '味方の大将'], ['源八', '組頭'], ['毛利新介', '味方'], ['前野長兵衛', '救う味方'], ['今川義元', '敵の総大将']],
  moribe: [['大沢勘兵衛', '足軽大将'], ['日比野下野守', '敵'], ['長井甲斐守', '敵']],
  sunomata: [['木下藤吉郎', '普請の頭'], ['稲田弾正', '敵の侍大将']],
  // 織田家編の戦（戦の定義に出てくる名のある者）
  inabayama: [['木下藤吉郎', '上役'], ['丹羽長秀', '味方']],
  mitsukuri: [['木下藤吉郎', '上役'], ['丹羽長秀', '味方'], ['佐久間信盛', '味方'], ['吉田出雲守', '敵の城将']],
  okawachi: [['丹羽長秀', '上役'], ['池田恒興', '味方'], ['稲葉一鉄', '味方'], ['滝川一益', '味方'], ['北畠具教', '敵の総大将'], ['日置大膳', '敵']],
  nodafukushima: [['前田利家', '上役'], ['佐々成政', '味方'], ['岩成友通', '敵']],
  shiga: [['森可成', '城の大将'], ['織田信治', '味方'], ['坂井政尚', '味方'], ['朝倉景鏡', '敵']],
  mikatagahara: [['佐久間信盛', '上役'], ['平手汎秀', '味方'], ['徳川家康', '味方の大将'], ['山県昌景', '敵']],
  tonezaka: [['柴田勝家', '上役'], ['織田信長', '味方の大将'], ['山崎吉家', '敵'], ['斎藤龍興', '敵']],
  odani: [['羽柴秀吉', '上役'], ['蜂須賀正勝', '味方'], ['浅井長政', '敵の総大将']],
  nagashima: [['柴田勝家', '上役'], ['織田信広', '味方'], ['下間頼旦', '敵の総大将']],
  echizen: [['明智光秀', '上役'], ['佐久間信盛', '味方'], ['杉浦玄任', '敵'], ['下間頼照', '敵の総大将']],
  takato: [['森長可', '上役'], ['織田信忠', '味方の大将'], ['団忠正', '味方'], ['仁科盛信', '敵の城将']],
  honnoji: [['織田信忠', '上役'], ['村井貞勝', '味方'], ['森蘭丸', '味方'], ['森坊丸', '味方'], ['森力丸', '味方'], ['明智秀満', '敵'], ['明智光秀', '敵の総大将']],
  iwamura: [['河尻秀隆', '上役'], ['毛利長秀', '味方'], ['座光寺為清', '敵'], ['秋山虎繁', '敵の総大将']],
  tennoji: [['明智光秀', '上役'], ['織田信長', '味方の大将'], ['佐久間信盛', '味方'], ['滝川一益', '味方'], ['土橋守重', '敵'], ['下間頼廉', '敵の総大将']],
  saika: [['堀秀政', '上役'], ['鈴木孫一', '敵の総大将']],
  tedorigawa: [['柴田勝家', '上役'], ['丹羽長秀', '味方'], ['前田利家', '味方'], ['上杉謙信', '敵の総大将']],
  shigisan: [['筒井順慶', '上役'], ['明智光秀', '味方'], ['松永久通', '敵'], ['松永久秀', '敵の総大将']],
  kizugawa: [['九鬼嘉隆', '上役'], ['乃美宗勝', '敵']],
  miki: [['羽柴秀吉', '上役'], ['谷衛好', '味方'], ['別所吉親', '敵'], ['別所長治', '敵の総大将']],
  arioka: [['滝川一益', '上役'], ['池田知正', '味方'], ['黒田官兵衛', '味方'], ['栗山善助', '味方'], ['荒木久左衛門', '敵の総大将']],
  iga: [['丹羽長秀', '上役'], ['筒井順慶', '味方'], ['滝野吉政', '敵'], ['百地丹波', '敵の総大将']],
  tottori: [['羽柴秀吉', '上役'], ['蜂須賀正勝', '味方'], ['奈佐日本之介', '敵'], ['吉川経家', '敵の総大将']],
  tano: [['滝川一益', '上役'], ['河尻秀隆', '味方'], ['土屋昌恒', '敵'], ['武田信勝', '敵'], ['武田勝頼', '敵の総大将']],
  nagashinojo: [['奥平信昌', '城主'], ['鳥居強右衛門', '味方']],
  sune: [['鳥居強右衛門', '味方'], ['奥平信昌', '城主']],
  tobinosu: [['酒井忠次', '別働隊の大将'], ['奥平信昌', '味方'], ['武田信実', '敵']],
  shitaragahara: [['大久保忠世', '上官'], ['山県昌景', '敵'], ['内藤昌豊', '敵'], ['真田信綱', '敵'], ['馬場信春', '敵の殿'], ['武田勝頼', '敵の総大将']],
  suwahara: [['大久保忠世', '上官'], ['本多重次', '門破りの頭'], ['今福浄閑', '敵の城将']],
  kanegasaki: [['木下藤吉郎', '殿の大将'], ['明智光秀', '味方'], ['池田勝正', '味方'], ['朝倉景鏡', '敵'], ['朝倉景健', '敵']],
  anegawa: [['森可成', '上官'], ['柴田勝家', '味方'], ['池田恒興', '味方'], ['坂井政尚', '味方'], ['木下藤吉郎', '味方'], ['稲葉一鉄', '味方'], ['榊原康政', '味方'], ['磯野員昌', '敵'], ['遠藤直経', '敵'], ['浅井政澄', '敵']],
  hieizan: [['明智光秀', '上官'], ['佐久間信盛', '味方'], ['正覚院豪盛', '僧兵の大将']],
  sekigahara: [['藤堂高虎', '上官'], ['京極高知', '味方'], ['寺沢広高', '味方'], ['井伊直政', '味方'], ['小早川秀秋', '寝返る'], ['平岡頼勝', '寝返る'], ['脇坂安治', '寝返る'], ['戸田勝成', '敵'], ['平塚為広', '敵'], ['島津義弘', '敵'], ['島津豊久', '敵']],
  sanadamaru: [['山崎長徳', '上官'], ['真田幸村', '敵の大将']],
  domyoji: [['水野勝成', '上官'], ['本多忠政', '味方'], ['松平忠明', '味方'], ['片倉重長', '味方'], ['後藤又兵衛', '敵'], ['薄田兼相', '敵'], ['明石全登', '敵'], ['真田幸村', '敵']],
};
// 833：同じ戦でも筋書きで顔ぶれが違う物（織田家編の設楽原は、織田方から見る）
const APPEAR_BY = { oda: { shitaragahara: [['前田利家', '上役'], ['織田信長', '味方の総大将'], ['徳川家康', '味方'], ['山県昌景', '敵'], ['馬場信春', '敵'], ['武田勝頼', '敵の総大将']] } };
const appearOf = (k, id) => (APPEAR_BY[k] && APPEAR_BY[k][id]) || APPEAR[id] || [];
const SCN_YEAR = { nagashino: 1575, hoi: 1570, sekigahara: 1600, osaka: 1614 };

let DB = null;
function toHex(col) {
  try { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#6a5a48'; c.fillStyle = col; return c.fillStyle; } catch (e) { return '#6a5a48'; }
}
// 家の色を墨に寄せる（顔の地に使う）
function inkOf(col) {
  const h = toHex(col || '#6a5a48');
  const n = parseInt(h.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v, w) => Math.round(v * 0.42 + w * 0.58);
  return `rgb(${m(r, 42)},${m(g, 36)},${m(b, 28)})`;
}
function db() {
  if (DB) return DB;
  const clanOf = {}, clanCol = {}, scnOf = {};
  for (const [k, sc] of Object.entries(MAP_SCENARIOS)) for (const c of Object.values(sc.clans || {})) if (!clanCol[c.name]) clanCol[c.name] = c.color;
  for (const s of ['nagashino', 'hoi', 'sekigahara', 'osaka']) for (const [c, l] of Object.entries(LINEUP[s] || {})) for (const n of l) if (!clanOf[n]) { clanOf[n] = c; scnOf[n] = s; }
  // 会える戦：名 → [{ scn, id, name, role, year }]
  const where = {};
  for (const k of [...new Set(['oda', ...SCENARIO_ORDER])]) {
    const sc = SCENARIOS[k]; if (!sc) continue;
    for (const b of sc.battles) for (const [n, role] of appearOf(k, b.id)) {
      const y = +((b.year.match(/（(\d{4})）/) || [])[1] || 0);
      (where[n] = where[n] || []).push({ scn: sc.name, id: b.id, name: b.name, role, year: y });
    }
  }
  const list = [];
  const add = (name, v) => {
    const w = where[name] || [];
    const yr = (w[0] && w[0].year) || SCN_YEAR[v.scn] || 1575;
    list.push({ ...v, name, where: w, age: v.b ? yr - v.b : 0, col: clanCol[v.clan] || '#6a5a48' });
  };
  for (const [n, a] of Object.entries(BUSHO)) {
    const f = FIX[n] || {};
    add(n, { yomi: a[0], b: f.b ?? a[1], d: f.d ?? a[2], st: [a[3], a[4], a[5], a[6]], traits: a[7] ? a[7].split('・') : [], lk: a[8], bio: a[9], clan: clanOf[n] || '浪人', scn: scnOf[n] });
  }
  for (const [n, a] of Object.entries(EXTRA)) add(n, { yomi: a[0], b: a[1], d: a[2], st: null, traits: [], lk: a[3], bio: a[4], clan: a[5], story: !!a[6] });
  const byName = new Map(list.map((p) => [p.name, p]));
  // 家の並び：人の多い順
  const cnt = {};
  for (const p of list) cnt[p.clan] = (cnt[p.clan] || 0) + 1;
  const clans = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, 'ja'));
  DB = { list, byName, clans, cnt };
  return DB;
}
const canon = (raw) => {
  if (!raw) return null;
  const n = String(raw).replace(/^.* /, '').replace(/の(隊|手|備|段|組|旗本|鉄砲|衆)$/, '');
  const k = ALIAS[n] || n;
  return db().byName.has(k) ? k : null;
};
const isMet = (n) => !!store().met[n];

// これまでの保存から、会った者と取れていた実績を拾う（札は出さない）
function backfill() {
  const st = store();
  let slots = [];
  try { slots = loadAll().filter(Boolean); } catch (e) { slots = []; }
  const t = Date.now();
  for (const g of slots) {
    const sc = SCENARIOS[g.scenario || 'okehazama'];
    if (!sc) continue;
    sc.battles.slice(0, g.battle || 0).forEach((b) => { for (const [n] of appearOf(g.scenario || 'okehazama', b.id)) if (!st.met[n]) st.met[n] = t; });
  }
  const ctx = { slots };
  for (const a of ACH) if (!st.ach[a.id] && a.save && a.save(ctx)) st.ach[a.id] = t;
  if (Object.keys(st.met).length >= 25 && !st.ach.meet30) st.ach.meet30 = t;
}

// ---------------- 実績 ----------------
// test(c)：戦の終わりに（c は下の zukanRecord で作る）／late(c)：settle の後に（身分・評定）／save(ctx)：保存から拾う
const side = (c, s) => c.side.some((x) => x.includes(s));
const ACH = [
  { id: 'uijin', name: '初陣', desc: 'はじめて戦を終える', test: (c) => !c.dojo, save: (x) => x.slots.some((g) => g.battle > 0) },
  { id: 'ichiban', name: '一番槍', desc: '戦ではじめて敵を一人討つ', test: (c) => !c.dojo && c.kills > 0, save: (x) => x.slots.some((g) => g.life && g.life.kills > 0) },
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
  { id: 'okehazama', name: '雨の桶狭間', desc: '桶狭間で今川の本陣へ斬り込む', test: (c) => c.id === 'okehazama' && c.special === '今川本陣突入' },
  { id: 'rojo', other: '長篠編', name: '籠城の意地', desc: '長篠城で大手門を守り抜く', test: (c) => c.id === 'nagashinojo' && side(c, '大手門を守った') },
  { id: 'sune', other: '長篠編', name: '強右衛門を送り出す', desc: '見張りに見つからずに、強右衛門を囲みの外へ送り出す', test: (c) => c.id === 'sune' && c.main && side(c, '見つからずに抜けた') },
  { id: 'tobinosu', other: '長篠編', name: '鳶ヶ巣の夜明け', desc: '見つからずに鳶ヶ巣山の砦へ寄せる', test: (c) => c.id === 'tobinosu' && side(c, '見つからずに寄せた') },
  { id: 'teppo', name: '鉄砲三段', desc: '設楽原で「放て」の号令を三度聞き、馬防柵を守り抜く', test: (c) => c.id === 'shitaragahara' && c.main && (c.volleys || 0) >= 3 },
  { id: 'akazonae', name: '赤備えを退ける', desc: '設楽原で山県昌景の隊を退ける', test: (c) => c.id === 'shitaragahara' && side(c, '山県昌景隊を退けた') },
  { id: 'suwahara', other: '長篠編', name: '丸馬出を越える', desc: '諏訪原城を攻め落とす', test: (c) => c.id === 'suwahara' && c.main },
  { id: 'shingari', name: '金ヶ崎の殿', desc: '金ヶ崎の退き口で、殿を務め上げる', test: (c) => c.id === 'kanegasaki' && c.main },
  { id: 'anegawa', name: '姉川の横槍', desc: '姉川で、本陣を狙う遠藤直経を止める', test: (c) => c.id === 'anegawa' && side(c, '遠藤直経を止めた') },
  { id: 'hiei', name: '刃向かわぬ者を討たず', desc: '比叡山で、逃げる僧や里の者を一人も討たずに務めを果たす', test: (c) => c.id === 'hieizan' && side(c, '非戦の者を討たなかった') },
  { id: 'sekigahara', other: '関ヶ原', name: '天下分け目', desc: '関ヶ原で務めを果たす', test: (c) => c.id === 'sekigahara' && c.main },
  { id: 'sanadamaru', other: '大坂の陣', name: '真田丸に挑む', desc: '真田丸の柵を破る', test: (c) => c.id === 'sanadamaru' && side(c, '真田丸の柵を破った') },
  { id: 'ikkiuchi', other: '天下の地図', name: '一騎打ちで城主を討つ', desc: '城攻めで、城将との一騎打ちに勝つ', test: (c) => c.special === '一騎打ちで討ち取り' },
  { id: 'rakujo', other: '天下の地図', name: '城を落とす', desc: '天下の地図から攻めた城を落とす', test: (c) => c.map && c.won && !c.defend },
  { id: 'dojo', name: '稽古場の十人抜き', desc: '稽古場で、倒れるまでに十人を討つ', test: (c) => c.dojo && c.dojoKills >= 10 },
  { id: 'meet30', name: '二十五人と会う', desc: '図鑑で二十五人の武将と会う', test: (c) => c.metCount >= 25, prog: (st) => [Object.keys(st.met).length, 25] },
  // 837：織田家編の戦ごとの目当て（どの戦にも一つ）
  { id: 'moribe', name: '森部の横槍', desc: '森部で日比野下野守を討ち取る', test: (c) => c.id === 'moribe' && c.bushoNames.some((n) => n.includes('日比野')) },
  { id: 'sunomata', name: '一夜の砦', desc: '墨俣で柵を一本も破らせずに砦を守る', test: (c) => c.id === 'sunomata' && c.main && c.titles.includes('perfect') },
  { id: 'inabayama', name: '美濃を取る', desc: '稲葉山城で務めを果たす', test: (c) => c.id === 'inabayama' && c.main },
  { id: 'mitsukuri', name: '一夜で落とす', desc: '箕作城で務めを果たす', test: (c) => c.id === 'mitsukuri' && c.main },
  { id: 'nodafukushima', name: '竹束の陰', desc: '野田・福島で務めを果たす', test: (c) => c.id === 'nodafukushima' && c.main },
  { id: 'shiga', name: '宇佐山を守る', desc: '宇佐山城を守り通す', test: (c) => c.id === 'shiga' && c.main },
  { id: 'mikatagahara', name: '生きて浜松へ', desc: '三方ヶ原から浜松城へ退く', test: (c) => c.id === 'mikatagahara' && c.main },
  { id: 'odani', name: '京極丸', desc: '小谷城で務めを果たす', test: (c) => c.id === 'odani' && c.main },
  { id: 'nagashima', name: '岸の柵', desc: '長島で岸の柵を守り切る', test: (c) => c.id === 'nagashima' && c.main },
  { id: 'takato', name: '高遠の塀', desc: '高遠城で務めを果たす', test: (c) => c.id === 'takato' && c.main },
  { id: 'honnoji', name: '本能寺の朝', desc: '本能寺の変で務めを果たす', test: (c) => c.id === 'honnoji' && c.main },
];
// 844：数で取る実績の途中の数
ACH.find((a) => a.id === 'hyaku').prog = (st) => [st.n.kills, 100];

// ---------------- 取った時の小さな札 ----------------
let toastBox = null;
const toastQ = [];
let toastOn = false;
function toast(a) {
  toastQ.push(a);
  if (!toastOn) nextToast();
}
function nextToast() {
  const a = toastQ.shift();
  if (!a) { toastOn = false; return; }
  toastOn = true;
  css();
  if (!toastBox || !toastBox.isConnected) {
    toastBox = document.createElement('div');
    toastBox.className = 'zk-toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
  }
  // 評価中は巻物の下の専用欄へ。遅れて得る身分・評定の実績もここへ並べる。
  const resultHost = document.querySelector('.ev-ach-notices');
  if (resultHost && toastBox.parentElement !== resultHost) resultHost.appendChild(toastBox);
  const el = document.createElement('div');
  el.className = 'zk-toast' + (RM() ? ' rm' : '');
  el.innerHTML = `<i aria-hidden="true">功</i><div><small>実績を得た</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`;
  toastBox.appendChild(el);
  try { sfx('merit', 0.5); } catch (e) { /* 音が無くても */ }
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); nextToast(); }, RM() ? 0 : 320); }, 4200);
}
function grant(a, silent) {
  const st = store();
  if (st.ach[a.id]) return false;
  st.ach[a.id] = Date.now();
  if (!silent) toast(a);
  return true;
}

// ---------------- 戦の終わりに呼ぶ（main.js の endBattle の頭から） ----------------
export function zukanRecord(b, G) {
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
    for (const n of fresh) st.met[n] = t;
    const tr = b.tracker || {}, s = b.stats || {}, F = b.flags || {};
    const squad = (b.squad || []).length;
    const practice = !!(G && (G.practice || G.lord));
    if (!def.dojo && !practice) { st.n.battles++; st.n.kills += s.kills || 0; }
    const c = {
      id, map, dojo: !!def.dojo, dojoKills: F.kills || 0,
      main: tr.main === true && !(b.result && b.result.dead), side: tr.side || [], special: tr.special ? tr.special.label : '',
      busho: (tr.busho || []).length, bushoNames: (tr.busho || []).map(String), titles: (G && G.titles) || [], viol: (tr.violations || []).length, purs: tr.pursuits || 0, flank: (tr.c && tr.c.flank) || 0,
      kills: s.kills || 0, parries: s.parries || 0, thirds: s.thirds || 0, totalKills: Math.max(st.n.kills, (G && G.life && G.life.kills + (s.kills || 0)) || 0),
      squad, squadAlive: (b.squad || []).filter((x) => x.alive).length,
      volleys: F.volleys || 0, won: map && tr.main === true, defend: !!(def.mapInfo && def.mapInfo.defend),
      metCount: Object.keys(st.met).length,
    };
    // 845：どの戦で取ったかも残す。846：同じ戦で取った物は一枚の札に束ねる
    const where = map ? '天下の地図の城攻め' : def.dojo ? '稽古場' : ((BATTLES[b.index] || {}).name || '');
    const got = [];
    if (!practice || def.dojo) for (const a of ACH) if (a.test && a.test(c) && grant(a, true)) { got.push(a); (st.at = st.at || {})[a.id] = `${where}${G && G.name ? `・${G.name}` : ''}`; }
    if (got.length) toast(got.length === 1 ? got[0] : { name: got.map((a) => a.name).join('・'), desc: `${where}で${got.length}つの実績を得た` });
    keep();
    // 身分と評定は settle の後に決まるので、今の処理が終わってから見る
    const idx = b.index;
    if (G && !G.practice && !map && !def.dojo) setTimeout(() => {
      const lc = { rank: G.rank || 0, grade: (G.grades || [])[idx] };
      for (const a of ACH) if (a.late && a.late(lc) && grant(a)) (st.at = st.at || {})[a.id] = `${(BATTLES[idx] || {}).name || ''}・${G.name || ''}`;
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
#zk button, #zk select, #zk input { font-family: var(--ui); }
.zk-top { display: flex; align-items: center; gap: 12px 16px; padding: 10px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.zk-top h2 { margin: 0; font-family: var(--display); font-size: 24px; letter-spacing: .14em; font-weight: 600; }
.zk-top h2::before { content: ''; display: inline-block; width: 4px; height: 20px; background: var(--shu); margin-right: 10px; vertical-align: -2px; }
.zk-tabs { display: flex; gap: 4px; margin-left: auto; }
.zk-scope { font-size: 12px; letter-spacing: .08em; color: var(--washi-dim); border: 1px solid var(--line); padding: 1px 8px; }
.zk-tabs button, .zk-seg button { min-height: 44px; min-width: 44px; padding: 8px 16px; background: transparent; color: var(--washi-dim); border: 1px solid var(--line); font-size: 15px; letter-spacing: .1em; cursor: pointer; }
.zk-tabs button[aria-selected=true] { color: var(--washi); border-color: var(--washi); box-shadow: inset 0 -3px 0 var(--shu); }
.zk-tabs button:hover, .zk-seg button:hover { color: var(--washi); border-color: var(--washi-dim); }
.zk-x { min-height: 44px; min-width: 44px; padding: 8px 18px; background: transparent; color: var(--washi); border: 1px solid var(--washi-dim); font-size: 15px; cursor: pointer; letter-spacing: .1em; }
.zk-x:hover { background: var(--washi); color: var(--sumi); }
.zk-pane { flex: 1; overflow-y: auto; padding: 12px 16px 32px; overscroll-behavior: contain; }
.zk-tools { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: end; }
.zk-f { display: grid; gap: 4px; font-size: 13px; color: var(--washi-dim); letter-spacing: .06em; }
.zk-f input, .zk-f select { min-height: 44px; padding: 6px 10px; background: var(--sumi-2); color: var(--washi); border: 1px solid var(--washi-faint); font-size: 15px; }
.zk-f input { width: 200px; }
.zk-f input::placeholder { color: var(--washi-faint); }
.zk-seg { display: flex; }
.zk-seg button { font-size: 14px; letter-spacing: .06em; padding: 8px 12px; }
.zk-seg button + button { border-left: 0; }
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
.zk-tbl th { position: sticky; top: -12px; background: var(--sumi-2); z-index: 1; text-align: left; font-weight: 500; color: var(--washi-dim); border-bottom: 1px solid var(--washi-faint); padding: 0; }
.zk-tbl th button { width: 100%; min-height: 44px; padding: 6px 8px; background: transparent; border: 0; color: inherit; font: inherit; text-align: inherit; cursor: pointer; white-space: nowrap; }
.zk-tbl th button:hover { color: var(--washi); }
.zk-tbl th[aria-sort] button { color: var(--kin); }
.zk-tbl td { padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.zk-tbl td.n { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--display); font-size: 16px; }
.zk-tbl td.n.hi { color: #e38a74; }
.zk-tbl tr.un td { color: var(--washi-faint); }
.zk-tbl .fc { width: 40px; height: 40px; position: relative; background: #2a241c; overflow: hidden; }
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
.zk-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.zk-tag { font-style: normal; font-size: 12px; margin-left: 8px; padding: 0 5px; border: 1px solid var(--washi-faint); color: var(--washi-dim); }
.zk-prog { display: block; height: 6px; background: #1b1814; box-shadow: 0 0 0 1px rgba(236,228,210,.35); margin: 6px 0 2px; max-width: 220px; }
.zk-prog i { display: block; height: 100%; background: var(--kin); }
.zk-h3 { font-size: 15px; letter-spacing: .15em; color: var(--washi); margin: 22px 0 8px; font-weight: 600; }
.zk-a { display: grid; grid-template-columns: 56px 1fr; gap: 12px; align-items: center; min-height: 84px; padding: 12px; border: 1px solid #4a4236; background: #2f2a23; color: var(--washi-dim); }
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
.zk-toast { display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center; width: 320px; max-width: 100%; padding: 10px 14px 10px 10px; background: linear-gradient(180deg, #efe7d4, #e2d8c0); color: #1d1712; border: 1px solid #b8a988; border-left: 5px solid #8e2f1f; box-shadow: 0 8px 24px rgba(0,0,0,.5); animation: zkin .35s ease-out; }
.zk-toast i { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: #8e2f1f; color: #fff5ea; font-style: normal; font-family: var(--display); font-size: 20px; transform: rotate(-8deg); }
.zk-toast small { display: block; font-size: 12px; color: #5a4e3e; letter-spacing: .12em; }
.zk-toast b { display: block; font-family: var(--display); font-size: 18px; letter-spacing: .06em; }
.zk-toast span { display: block; font-size: 12px; color: #3a2e22; line-height: 1.45; }
.zk-toast.out { opacity: 0; transform: translateY(-8px); transition: opacity .3s, transform .3s; }
.zk-toast.rm, body.rm .zk-toast { animation: none; transition: none; }
@keyframes zkin { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
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
/* 背の低い画面（スマホ横）：下に並ぶ釦（戦功評価の「タイトルへ」など）を隠さないよう、上の右に出す */
@media (max-height: 520px) { .zk-toasts { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; } .zk-toast { width: 280px; padding: 6px 10px 6px 6px; } }
@media (prefers-reduced-motion: reduce) { .zk-toast { animation: none; transition: none; } }
`;
  document.head.appendChild(st);
}

const ST_NAMES = ['統率', '武勇', '知略', '政治'];
const SORTS = [
  ['yomi', '読み順'], ['met', '会った順'], ['s0', '統率'], ['s1', '武勇'], ['s2', '知略'], ['s3', '政治'], ['sum', '能力の合計'], ['born', '生まれ年'],
];
const V = { tab: 'busho', q: '', clan: '', sort: 'yomi', view: 'card', show: 'all' };
let root = null, lastFocus = null, faceIO = null, dlg = null;
const yearTxt = (p) => (p.b || p.d ? `${p.b ? `${p.b}年` : '生年不詳'}〜${p.d ? `${p.d}年` : '没年不詳'}` : '生没年不詳');
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const sumOf = (p) => (p.st ? p.st.reduce((a, v) => a + v, 0) : -1);

function faceSrc(p) {
  return faceURL(p.name, { name: p.clan, crest: p.clan[0] }, inkOf(p.col), { lk: p.lk, age: p.age || undefined });
}
// まだ会っていない者の影絵（頭の形だけ：k 兜・e 烏帽子・m 髷・b 坊主）
function shadowSvg(lk) {
  const k = (lk || 'm')[0];
  const head = k === 'k' ? '<path d="M36 64 Q36 30 64 30 Q92 30 92 64 L100 70 L28 70 Z"/><path d="M50 34 L36 6 L44 6 L58 32 Z M78 34 L92 6 L84 6 L70 32 Z"/>'
    : k === 'e' ? '<path d="M46 44 Q44 8 70 6 Q84 14 80 44 Z"/>' : k === 'm' ? '<rect x="58" y="28" width="12" height="12" rx="3"/>' : '';
  return `<svg viewBox="0 0 128 128" aria-hidden="true"><g fill="#211b15">${head}<ellipse cx="64" cy="62" rx="20" ry="25"/><rect x="55" y="80" width="18" height="16"/><path d="M6 128 C10 104 30 94 50 92 L78 92 C98 94 118 104 122 128Z"/></g></svg>`;
}
function faceHtml(p, big) {
  if (!isMet(p.name)) return `<span class="fc">${shadowSvg(p.lk)}</span>`;
  return `<span class="fc" data-face="${esc(p.name)}">${big ? `<img alt="" src="${faceSrc(p)}">` : ''}</span>`;
}
// 顔は見える所に来てから描く（四百人ぶんを一度に描かない）
function watchFaces(scope) {
  if (faceIO) faceIO.disconnect();
  const els = scope.querySelectorAll('.fc[data-face]:not(.done)');
  const draw = (el) => {
    const p = db().byName.get(el.dataset.face);
    if (!p || el.classList.contains('done')) return;
    el.classList.add('done');
    el.insertAdjacentHTML('afterbegin', `<img alt="" src="${faceSrc(p)}">`);
  };
  // 初めに見える分はすぐ描く（下の 3D が重いと、見張りの知らせが遅れるため）
  [...els].slice(0, 42).forEach(draw);
  if (!('IntersectionObserver' in window)) { els.forEach(draw); return; }
  faceIO = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { draw(e.target); faceIO.unobserve(e.target); } }, { root: scope.closest('.zk-pane'), rootMargin: '200px' });
  els.forEach((el) => { if (!el.classList.contains('done')) faceIO.observe(el); });
}

function filtered() {
  const { list } = db();
  const st = store();
  const q = kata2hira(V.q.trim());
  let r = list.filter((p) => (!V.clan || p.clan === V.clan)
    && (V.show === 'all' || (V.show === 'war' ? p.where.some((w) => w.scn === (SCENARIOS.oda || {}).name) : !!st.met[p.name]))
    && (!q || p.name.includes(q) || p.yomi.includes(q) || p.clan.includes(q)));
  const y = (a, b) => a.yomi.localeCompare(b.yomi, 'ja');
  const val = (p) => {
    if (!st.met[p.name] || !p.st) return -1;
    if (V.sort === 'sum') return sumOf(p);
    return p.st[+V.sort[1]];
  };
  if (V.sort === 'yomi') r.sort(y);
  else if (V.sort === 'met') r.sort((a, b) => (st.met[b.name] || 0) - (st.met[a.name] || 0) || y(a, b));
  else if (V.sort === 'born') r.sort((a, b) => (a.b || 9999) - (b.b || 9999) || y(a, b));
  else r.sort((a, b) => val(b) - val(a) || y(a, b));
  return r;
}

function cardHtml(p, i) {
  const m = isMet(p.name);
  const best = p.st ? Math.max(...p.st) : 0;
  const stHtml = p.st ? `<span class="st" aria-hidden="true">${p.st.map((v, k) => `<span>${ST_NAMES[k][0]}<em class="${m && v === best && v >= 85 ? 'hi' : ''}">${m ? v : '？'}</em></span>`).join('')}</span>` : '';
  const label = `${p.name}（${p.yomi}）・${p.clan}${m ? (p.st ? `・${ST_NAMES.map((n, k) => `${n}${p.st[k]}`).join('・')}` : '') : '・まだ会っていない'}`;
  return `<button type="button" class="zk-c ${m ? '' : 'un'}" data-p="${esc(p.name)}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(label)}">
    ${faceHtml(p)}<span><b>${esc(p.name)}</b><small>${esc(p.yomi)}</small></span><small>${esc(p.clan)}${p.story ? '<span class="story">・物語</span>' : ''}</small>${stHtml}</button>`;
}
function tableHtml(r) {
  const cols = [['name', '名'], ['clan', '家'], ['born', '生没年'], ['s0', '統率'], ['s1', '武勇'], ['s2', '知略'], ['s3', '政治'], ['sum', '計'], ['war', '会える戦']];
  const sortable = { name: 'yomi', born: 'born', s0: 's0', s1: 's1', s2: 's2', s3: 's3', sum: 'sum' };
  const th = cols.map(([k, l]) => {
    const sk = sortable[k];
    const on = sk && V.sort === sk;
    return `<th scope="col" ${on ? `aria-sort="${sk === 'yomi' || sk === 'born' ? 'ascending' : 'descending'}"` : ''}>${sk ? `<button type="button" data-sort="${sk}">${l}${on ? (sk === 'yomi' || sk === 'born' ? ' ▲' : ' ▼') : ''}</button>` : `<span style="display:block;padding:6px 8px">${l}</span>`}</th>`;
  }).join('');
  const rows = r.map((p, i) => {
    const m = isMet(p.name);
    const best = p.st ? Math.max(...p.st) : 0;
    const n = (v) => `<td class="n ${m && v === best && v >= 85 ? 'hi' : ''}">${p.st ? (m ? v : '？') : '—'}</td>`;
    return `<tr class="${m ? '' : 'un'}"><td style="display:flex;gap:8px;align-items:center">${faceHtml(p)}<button type="button" class="nm" data-p="${esc(p.name)}" tabindex="${i === 0 ? 0 : -1}">${esc(p.name)}</button></td>
      <td>${esc(p.clan)}</td><td><small>${esc(yearTxt(p))}</small></td>${p.st ? p.st.map(n).join('') : '<td class="n">—</td>'.repeat(4)}<td class="n">${p.st ? (m ? sumOf(p) : '？') : '—'}</td>
      <td><small>${p.where.length ? esc([...new Set(p.where.map((w) => w.name))].join('・')) : '—'}</small></td></tr>`;
  }).join('');
  return `<table class="zk-tbl"><caption class="sr" style="position:absolute;left:-9999px">武将の一覧。列の見出しを押すと並べ替える</caption><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBusho(pane, keepFocus) {
  const { list, clans, cnt } = db();
  const st = store();
  const metN = list.filter((p) => st.met[p.name]).length;
  const r = filtered();
  const tools = pane.querySelector('.zk-tools');
  if (!tools) {
    pane.innerHTML = `<div class="zk-tools">
      <label class="zk-f">名で探す<input type="search" id="zk-q" placeholder="例：のぶなが" autocomplete="off" value="${esc(V.q)}"></label>
      <label class="zk-f">家<select id="zk-clan"><option value="">すべての家（${list.length}）</option>${clans.map((c) => `<option value="${esc(c)}" ${V.clan === c ? 'selected' : ''}>${esc(c)}（${cnt[c]}）</option>`).join('')}</select></label>
      <label class="zk-f">並べ替え<select id="zk-sort">${SORTS.map(([k, l]) => `<option value="${k}" ${V.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="zk-f"><span id="zk-lb-show">見る範囲</span><div class="zk-seg" role="group" aria-labelledby="zk-lb-show">${[['all', 'すべて'], ['war', '織田家編で会える'], ['met', '会った']].map(([k, l]) => `<button type="button" data-show="${k}" aria-pressed="${V.show === k}">${l}</button>`).join('')}</div></div>
      <div class="zk-f"><span id="zk-lb-view">見せ方</span><div class="zk-seg" role="group" aria-labelledby="zk-lb-view">${[['card', '札'], ['table', '表']].map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${V.view === k}">${l}</button>`).join('')}</div></div>
    </div><div class="zk-sum" aria-live="polite"></div><div class="zk-list"></div>`;
    const q = pane.querySelector('#zk-q');
    let qT = 0;
    q.oninput = () => { V.q = q.value; clearTimeout(qT); qT = setTimeout(() => renderBusho(pane, true), 150); };
    pane.querySelector('#zk-clan').onchange = (e) => { V.clan = e.target.value; renderBusho(pane, true); };
    pane.querySelector('#zk-sort').onchange = (e) => { V.sort = e.target.value; renderBusho(pane, true); };
    pane.querySelectorAll('[data-show]').forEach((b) => b.onclick = () => { V.show = b.dataset.show; pane.querySelectorAll('[data-show]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderBusho(pane, true); });
    pane.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { V.view = b.dataset.view; pane.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderBusho(pane, true); });
  }
  pane.querySelector('#zk-sort').value = V.sort;
  // 834：織田家編で会える者のうち何人に会ったか
  const oda = list.filter((p) => p.where.some((w) => w.scn === (SCENARIOS.oda || {}).name));
  const odaMet = oda.filter((p) => st.met[p.name]).length;
  pane.querySelector('.zk-sum').innerHTML = `<span>織田家編で会える ${oda.length}人のうち <b>${odaMet}</b>人</span><span class="zk-meter" aria-hidden="true"><i style="width:${(odaMet / Math.max(1, oda.length) * 100).toFixed(1)}%"></i></span><span>名簿の全部では ${metN}／${list.length}人・いま並んでいるのは ${r.length}人</span>`;
  const box = pane.querySelector('.zk-list');
  if (!r.length) {
    box.innerHTML = `<div class="zk-empty"><p>当てはまる武将がいません。</p><button type="button" class="zk-x" id="zk-clear">絞り込みを外す</button></div>`;
    box.querySelector('#zk-clear').onclick = () => { V.q = ''; V.clan = ''; V.show = 'all'; pane.innerHTML = ''; renderBusho(pane); };
    return;
  }
  box.innerHTML = V.view === 'table' ? tableHtml(r) : `<div class="zk-grid" role="list" aria-label="武将の札。矢印キーで選び、決定で開く">${r.map(cardHtml).join('')}</div>`;
  box.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openCard(b.dataset.p, r.map((p) => p.name)));
  box.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => {
    const k = b.dataset.sort;
    V.sort = k;
    renderBusho(pane);
    pane.querySelector(`[data-sort="${k}"]`)?.focus({ preventScroll: true });
  });
  watchFaces(box);
  void keepFocus;
}

// 札の並びを矢印キーで動く（並びの中は Tab 一つで入れる）
function rovingKeys(e) {
  const items = [...root.querySelectorAll('.zk-list [data-p]')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return false;
  let cols = 1;
  if (V.view === 'card' && items.length > 1) { const top = items[0].offsetTop; cols = items.findIndex((x) => x.offsetTop !== top); if (cols < 0) cols = items.length; }
  let j = i;
  if (e.key === 'ArrowRight' && V.view === 'card') j = i + 1;
  else if (e.key === 'ArrowLeft' && V.view === 'card') j = i - 1;
  else if (e.key === 'ArrowDown') j = i + cols;
  else if (e.key === 'ArrowUp') j = i - cols;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = items.length - 1;
  else if (e.key === 'PageDown') j = i + cols * 4;
  else if (e.key === 'PageUp') j = i - cols * 4;
  else return false;
  j = Math.max(0, Math.min(items.length - 1, j));
  items[i].tabIndex = -1; items[j].tabIndex = 0; items[j].focus({ preventScroll: true });
  items[j].scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  return true;
}

function openCard(name, order) {
  const p = db().byName.get(name);
  if (!p) return;
  const m = isMet(name);
  const st = store();
  const i = order.indexOf(name);
  if (!dlg) { dlg = document.createElement('div'); dlg.className = 'zk-dlg'; root.appendChild(dlg); dlg.onclick = (e) => { if (e.target === dlg) closeCard(); }; }
  const ret = root.querySelector(`.zk-list [data-p="${CSS.escape(name)}"]`);
  const best = p.st ? Math.max(...p.st) : 0;
  const where = p.where.length
    ? `<ul class="zk-where">${p.where.map((w) => `<li><span class="r ${/敵|寝返/.test(w.role) ? 'foe' : ''}">${esc(w.role)}</span><span>${esc(w.name)}</span><small>${esc(w.scn)}</small></li>`).join('')}</ul>`
    : '<p class="zk-lock">この物語の戦には、まだ出てこない。天下の地図の城攻めで出会えるかもしれない。</p>';
  dlg.innerHTML = `<div class="zk-d ${m ? '' : 'un'}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="zk-d-h">
    <div class="hd">${faceHtml(p, true)}<div>
      <h3 id="zk-d-h">${esc(p.name)}</h3><div class="yomi">${esc(p.yomi)}</div>
      <dl><dt>家</dt><dd>${esc(p.clan)}${p.story ? '（この物語の人物）' : ''}</dd><dt>生没年</dt><dd>${esc(yearTxt(p))}</dd>
      ${m && st.met[name] ? `<dt>会った日</dt><dd>${new Date(st.met[name]).toLocaleDateString('ja-JP')}</dd>` : '<dt>まだ</dt><dd>会っていない</dd>'}</dl></div></div>
    <div class="zk-cols"><div>
      ${p.st ? `<h4>能力</h4><div class="zk-bars">${p.st.map((v, k) => `<div class="zk-bar"><span>${ST_NAMES[k]}</span><i role="img" aria-label="${ST_NAMES[k]} ${m ? v : '不明'}"><b class="${m && v === best && v >= 85 ? 'hi' : ''}" style="width:${m ? v : 0}%"></b></i><em>${m ? v : '？'}</em></div>`).join('')}</div>` : ''}
      ${m && p.traits.length ? `<h4>個性</h4>${p.traits.map((t) => `<span class="zk-trait">${esc(t)}${TRAIT_NOTE[t] ? `<small>${esc(TRAIT_NOTE[t])}</small>` : ''}</span>`).join('')}` : ''}
      <h4>この戦で会える</h4>${where}
    </div><div>
      <h4>来歴</h4>${m ? `<p class="zk-bio">${esc(p.bio || '伝わることは少ない。')}</p>` : `<p class="zk-lock">戦で会うと、顔と能力、来歴が分かる。${p.where.length ? `「${esc(p.where[0].name)}」に出てくる。` : ''}</p>`}
    </div></div>
    <div class="ft"><div style="display:flex;gap:8px"><button type="button" id="zk-prev" ${i <= 0 ? 'disabled' : ''} aria-label="前の武将">前の武将</button><button type="button" id="zk-next" ${i < 0 || i >= order.length - 1 ? 'disabled' : ''} aria-label="次の武将">次の武将</button></div>
      <button type="button" class="pri" id="zk-dx">図鑑にもどる</button></div></div>`;
  dlg.hidden = false;
  dlg.dataset.ret = name;
  dlg._order = order;
  const go = (d) => { const n = order[i + d]; if (n) { openCard(n, order); } };
  dlg.querySelector('#zk-prev').onclick = () => go(-1);
  dlg.querySelector('#zk-next').onclick = () => go(1);
  dlg.querySelector('#zk-dx').onclick = closeCard;
  dlg._go = go;
  const box = dlg.querySelector('.zk-d');
  box.scrollTop = 0;
  box.focus({ preventScroll: true });
  void ret;
  try { sfx('ui'); } catch (e) { /* 音が無くても */ }
}
function closeCard() {
  if (!dlg || dlg.hidden) return;
  const name = dlg.dataset.ret;
  dlg.hidden = true; dlg.innerHTML = '';
  const el = root.querySelector(`.zk-list [data-p="${CSS.escape(name)}"]`);
  if (el) { root.querySelectorAll('.zk-list [data-p]').forEach((x) => x.tabIndex = -1); el.tabIndex = 0; el.focus({ preventScroll: true }); el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}

function renderAch(pane) {
  const st = store();
  // 分母は、いま遊べる筋書き（織田家編）で取れる物。ほかの筋書き・天下の地図の物は下に分けて並べる（836）
  const main = ACH.filter((a) => !a.other), other = ACH.filter((a) => a.other);
  const got = main.filter((a) => st.ach[a.id]).length;
  const row = (a) => {
    const t = st.ach[a.id];
    const pr = !t && a.prog ? a.prog(st) : null;
    return `<div class="zk-a ${t ? 'got' : ''}" role="listitem"><span class="sl" aria-hidden="true">${t ? '功' : '未'}</span><div><b>${esc(a.name)}</b>${a.other ? `<em class="zk-tag">${esc(a.other)}</em>` : ''}<span>${esc(a.desc)}</span>${pr ? `<span class="zk-prog" role="img" aria-label="${pr[0]}／${pr[1]}"><i style="width:${Math.min(100, pr[0] / pr[1] * 100).toFixed(0)}%"></i></span><small>${Math.min(pr[0], pr[1])}／${pr[1]}</small>` : ''}<small>${t ? `${new Date(t).toLocaleDateString('ja-JP')}に得た${st.at && st.at[a.id] ? `（${esc(st.at[a.id])}）` : ''}` : pr ? '' : 'まだ得ていない'}</small></div></div>`;
  };
  pane.innerHTML = `<div class="zk-sum" aria-live="polite"><span>得た実績 <b>${got}</b>／${main.length}</span><span class="zk-meter" aria-hidden="true"><i style="width:${(got / main.length * 100).toFixed(1)}%"></i></span><span>延べ ${st.n.battles}戦・討ち取り ${st.n.kills}人</span></div>
    <div class="zk-ach" role="list">${main.map(row).join('')}</div>
    <h3 class="zk-h3">ほかの筋書き・天下の地図の実績</h3>
    <div class="zk-ach" role="list">${other.map(row).join('')}</div>
    <p class="zk-note">実績と図鑑は、三つの保存の枠とは別に、このブラウザに記しています。保存の枠を消しても残ります。</p>`;
}

// 絵巻：いまの保存の歩み。戦った戦・会った武将・手に入れた武具を、右から左へ読む一巻きに（和紙に墨）
function renderEmaki(pane) {
  const st = store();
  let G = null;
  try { G = loadAll()[S.slot] || loadAll().find(Boolean) || null; } catch (e) { G = null; }
  const { byName } = db();
  const hist = G ? BATTLES.map((b, i) => ({ b, h: (G.history || [])[i] })).filter((x) => x.h) : [];
  const met = Object.entries(st.met).sort((a, z) => z[1] - a[1]).map(([n]) => byName.get(n)).filter(Boolean).slice(0, 18);
  const gear = G ? [...new Set([...(G.owned || []).filter((id) => ITEMS[id] && ITEMS[id].cost), ...(G.horses || []).map((id) => 'h:' + id)])] : [];
  const gearName = (id) => (id.startsWith('h:') ? (HORSES[id.slice(2)] || {}).name || '馬' : ITEMS[id].name);
  const sec = (h, body) => `<section class="zk-em-s"><h3>${h}</h3>${body}</section>`;
  pane.innerHTML = `<div class="zk-em" role="region" aria-label="歩みの絵巻"><div class="zk-em-roll">
    ${sec('戦った戦', hist.length ? `<ol class="zk-em-b">${hist.map(({ b, h }) => `<li><b>${esc(b.name)}</b><small>${esc((b.year || '').replace(/（.*$/, ''))}</small>${h.grade ? `<i class="sl">${esc(h.grade)}</i>` : ''}<em>戦功 ${h.total}</em></li>`).join('')}</ol>` : '<p class="none">まだ戦っていない</p>')}
    ${sec(`会った武将 <small>${Object.keys(st.met).length}人</small>`, met.length ? `<ul class="zk-em-p">${met.map((p) => `<li><button type="button" data-em="${esc(p.name)}" aria-label="${esc(p.name)}の札を開く">${faceHtml(p, true)}<b>${esc(p.name)}</b></button></li>`).join('')}</ul>` : '<p class="none">まだ誰にも会っていない</p>')}
    ${sec('手に入れた武具', gear.length ? `<ul class="zk-em-g">${gear.map((id) => `<li>${esc(gearName(id))}</li>`).join('')}</ul>` : '<p class="none">まだ何も買っていない</p>')}
  </div></div>${G ? `<p class="zk-note">${esc(G.name)}の歩み（いまの保存の枠）</p>` : ''}`;
  pane.querySelectorAll('[data-em]').forEach((b) => b.onclick = () => openCard(b.dataset.em, met.map((p) => p.name)));
}
const TABS = ['busho', 'emaki', 'ach'];
const TAB_H = { busho: '武将図鑑', emaki: '歩みの絵巻', ach: '実績' };
function setTab(k, focus) {
  V.tab = k;
  root.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus({ preventScroll: true }); });
  root.querySelector('#zk-h').textContent = TAB_H[k];
  // 記録の範囲：図鑑・実績は全保存データ共通、歩みはいまの保存の枠（この物語）だけ
  root.querySelector('#zk-scope').textContent = k === 'emaki' ? 'この物語の記録' : '全保存データ共通';
  const pb = root.querySelector('#zk-p-busho'), pa = root.querySelector('#zk-p-ach'), pe = root.querySelector('#zk-p-emaki');
  pb.hidden = k !== 'busho'; pa.hidden = k !== 'ach'; pe.hidden = k !== 'emaki';
  if (k === 'busho') { if (!pb.querySelector('.zk-tools')) renderBusho(pb); else watchFaces(pb.querySelector('.zk-list')); }
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
  if (e.key === 'Escape') { e.preventDefault(); if (e.target.id === 'zk-q' && e.target.value) { e.target.value = ''; V.q = ''; renderBusho(root.querySelector('#zk-p-busho')); return; } zukanClose(); return; }
  if (e.target.getAttribute && e.target.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); const i = TABS.indexOf(V.tab); setTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true); return; }
  if (e.target.closest && e.target.closest('.zk-list') && e.target.matches('[data-p]') && rovingKeys(e)) { e.preventDefault(); return; }
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
  root.innerHTML = `<header class="zk-top"><h2 id="zk-h">武将図鑑</h2><small class="zk-scope" id="zk-scope" aria-live="polite">全保存データ共通</small>
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
  if (faceIO) { faceIO.disconnect(); faceIO = null; }
  if (root) { root.remove(); root = null; dlg = null; }
  if (!quiet && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
}
// 838：一人の札を開く（評定の画面の「新たに会った武将」から）
export function zukanOpenCard(name) { zukanOpen('busho'); const n = canon(name) || name; if (db().byName.has(n)) openCard(n, [n]); }
// 確かめ用：数を見る
export function zukanCount() { const { list } = db(); const st = store(); return { people: list.length, met: Object.keys(st.met).length, ach: ACH.length, got: Object.keys(st.ach).length }; }
