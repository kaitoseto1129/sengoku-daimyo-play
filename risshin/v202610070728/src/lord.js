// 織田信長で遊ぶ時の道具（題の画面の「織田信長で出陣」と、日本地図の「織田家を率いる」から使う）
// ・信長がその場にいた戦の一覧と、信長の立場での任務・物語の札
// ・戦の中の信長：姿（units.js の GENERALS）、旗本百人、使番（遠くの味方の備へ「進め・待て・退け」）、討たれたら負け
// 記録は残らない（侍大将で出陣と同じく G.practice）
import { nanbanLook } from './nanban.js';
import { newGame, fillRoster, SCENARIOS, SCENARIO_PICK, SCENARIO_ORDER, scenarioReady } from './state.js';
import { GENERALS } from './units.js';
import { ORDER_NAME } from './player.js';
import { sfx } from './audio.js';
import { canonical } from './settings.js';
import { sendOrder, RUNNER_SPEED } from './denrei.js';

export const LORD = { key: 'nobunaga', name: '織田信長', title: '織田家当主', clan: '織田家' };

// 信長がその場にいた戦（古い順）。goal は信長の立場の任務（無い戦はもとの任務のまま）
// spawn：信長が立つ所（無ければ戦の定義の spawn）
export const LORD_BATTLES = [
  { scn: 'oda', id: 'okehazama', name: '桶狭間', year: '永禄三年（1560）五月十九日　尾張国 中島砦', goal: '今川義元の本陣を突け',
    spawn: { x: 16, z: 184, heading: Math.PI }, at: { x: 16, z: 184, r: 16, why: '中島砦（信長は清洲から熱田を経て中島砦に入り、そこから打って出た）' },
    text: ['今川義元、二万五千で尾張へ攻め入る。丸根・鷲津の砦は落ち、家中には籠城を説く者も多い。', '信長は清洲を夜明けに発ち、熱田で兵を揃え、中島砦に入った。手勢は二千ほど。', '豪雨の後、今川の本陣は桶狭間の山あいで休んでいるという。――狙うは、義元の首ひとつ。'],
    button: '中島砦を出る', tip: '行軍の間は旗本と一緒に進み、雨が上がったら号令をかけて義元の本陣へ。首は取らず、討ち捨てにせよ' },
  { scn: 'oda', id: 'kanegasaki', name: '金ヶ崎の退き口', year: '元亀元年（1570）四月二十八日　越前国 金ヶ崎', goal: '京へ退け（殿は藤吉郎）',
    spawn: { x: 30, z: -2, heading: Math.PI }, at: { x: 30, z: -2, r: 16, why: '金ヶ崎の陣（殿は藤吉郎に任せ、信長は朽木越えで先に京へ退いた）' },
    text: ['越前へ攻め入り、手筒山と金ヶ崎の城を落とした。一乗谷まで、あと一息。', 'そこへ知らせが届く。北近江の浅井長政――妹お市の夫が、朝倉方についた。前に朝倉、後ろに浅井。', '殿（しんがり）を木下藤吉郎に任せ、わずかな供で朽木越えに京へ退く。生きて帰れば、また戦える。'],
    button: '陣を払う', tip: '南西の朽木越えの道の口まで旗本と退け。谷の口では松永久秀が朽木元綱を説く間、追手を旗本で防げ' },
  { scn: 'oda', id: 'anegawa', name: '姉川', year: '元亀元年（1570）六月二十八日　近江国 姉川', goal: '浅井の猛攻を耐えて押し返せ',
    spawn: { x: 30, z: 66, heading: Math.PI }, at: { x: 30, z: 66, r: 16, why: '姉川の南の本陣（十三段の備の後ろ）' },
    text: ['金ヶ崎から逃げ帰って二月。兵を立て直し、浅井の小谷城の南、姉川に陣を張った。', '西の瀬は徳川家康が朝倉に当たる。東の瀬、浅井の正面は織田の十三段。', '浅井の先手は猛将・磯野員昌。段を幾重に破られようと、本陣は退かぬ。'],
    button: '姉川へ', tip: '森・池田・木下の段が前を受ける。崩れそうな所へ旗本を回し、J の使番で柴田らの段に下知を送れ' },
  { scn: 'oda', id: 'hieizan', name: '比叡山', year: '元亀二年（1571）九月十二日　近江国 比叡山 延暦寺', goal: '坂本から本坂を登り、文殊楼を抜けて東塔の根本中堂へ',
    spawn: { x: 172, z: -2, heading: -Math.PI / 2 }, at: { x: 172, z: -2, r: 16, why: '坂本の織田の陣（明智光秀の手の後ろ）' },
    text: ['比叡山延暦寺は、志賀の陣で浅井・朝倉の兵を山にかくまい、織田に従わなかった。', '坂本から、明智光秀の手が日吉社の前を抜け、細い本坂を登る。', '石段の上の文殊楼を抜けて東塔へ。根本中堂の前の抵抗を崩し、西塔へ続く山道の口を押さえる。'],
    button: '坂本から山へ', tip: '細い山道は横に広がれない。刃向かわぬ僧や里の者は討つな' },
  { scn: 'oda', id: 'shitaragahara', name: '設楽原', year: '天正三年（1575）五月二十一日　三河国 設楽原', goal: '馬防柵で武田を迎え撃ち、勝頼を退かせよ',
    spawn: { x: -22, z: -46, heading: Math.PI / 2 }, at: { x: -22, z: -46, r: 16, why: '連吾川の西、馬防柵の内の織田の陣' },
    text: ['武田勝頼、一万五千で長篠城を囲む。徳川家康の求めに応じ、三万の兵で岐阜を発った。', '連吾川の西、設楽原に三重の馬防柵を結わせ、鉄砲をその内に並べた。', '鳶ヶ巣山の砦は夜のうちに落ちた。勝頼は退かず、前へ出てくる。――柵で止め、鉄砲で崩す。'],
    button: '柵の内へ', tip: '柵の外へ出ず、寄せる騎馬を鉄砲と槍で崩せ。勝頼が退いたら、殿の馬場隊を追い討て' },
  // 本能寺：始まりは境内の奥、供は小姓衆ら二十数人（b_honnoji.js の lordSpawn・lordHata・信長の流れ）
  { scn: 'oda', id: 'honnoji', name: '本能寺', year: '天正十年（1582）六月二日　山城国 京 本能寺', goal: '門と御殿を守り、奥で最期を迎えよ',
    spawn: null,
    text: ['中国の毛利攻めの後詰に向かう途中、京の本能寺に泊まった。供は森蘭丸ら小姓衆と、わずかな者だけ。', '夜明け前、表で鬨の声と鉄砲の音。桔梗の旗――明智光秀の一万余りが、寺の築地を幾重にも囲んでいる。', '「是非に及ばず」。弓と槍で寄せる兵を防ぎ、奥へ退く。最後は御殿に火を放ち、史実の最期を迎える。'],
    button: '弓を取る', tip: '表門の内で迎え撃て。門が破れるか火が迫ったら奥へ退け。御殿の口を守り、奥の印で長押しして火を放て' },
  // 攻城 MVP（docs/siege-plan.md F2）の札を、織田家編の id（echizen）へ移した（一覧で二枚に見えないように）
  { scn: 'oda', id: 'echizen', name: '越前一向一揆・木ノ芽峠', year: '天正三年（1575）八月十五日　越前国 木ノ芽峠', goal: '木ノ芽峠の一揆の砦を落とせ',
    spawn: { x: 0, z: -186, heading: 0 }, at: { x: 0, z: -186, r: 16, why: '峠道の南の口（明智光秀の手の後ろ）' }, ifs: true,
    text: ['史実では、信長はこの場にいない（明智光秀・羽柴秀吉の手が峠の砦を攻めた）。――もしも信長自ら出ていたら、の一戦。', '越前一向一揆が、木ノ芽峠に柵二重・土塁・木戸・物見櫓の砦を構えている。', '正面で引きつけ、森から回った手で本陣を崩す。砦攻めの仕組みを見る一戦。'],
    button: '峠へ', tip: '正面の柵を破れ。破れば森から回った手が本陣の脇を突く。本陣を落とせば終わる' },
  // 攻城 C7・C9（docs/siege-plan.md）の札を、織田家編の id（takato）へ移した（一覧で二枚に見えないように）
  { scn: 'oda', id: 'takato', name: '高遠城', year: '天正十年（1582）三月二日　信濃国 高遠城', goal: '仁科盛信の高遠城を攻め落とせ',
    spawn: { x: 0, z: -118, heading: 0 }, at: { x: 0, z: -118, r: 16, why: '大手道の南の口（織田信忠の手の後ろ）' }, ifs: true,
    text: ['史実では、信長はこの場にいない（嫡男・織田信忠の手が城を攻めた）。――もしも信長自ら出ていたら、の一戦。', '武田の城々が次々に開く中、仁科盛信だけは高遠城に籠もり、降るようにとの勧めを退けた。', '縄張り（三の丸・二の丸・法幢院曲輪・本丸）で作り直した高遠攻め。攻め方（大手・搦手・西の切岸・二の丸からの撃ち崩し）で結果が変わる。'],
    button: '高遠へ', tip: '軍議で作戦を選べ。三の丸・法幢院曲輪を落とし、二の丸を経て本丸へ攻め上れ' },
  // 山の広げ（docs/siege-plan.md 7-9・mountain-spec 32）。越前一向一揆の山の寺（大滝寺）を夜と霧の中で攻める
  // echizen（木ノ芽峠）とは別の場所・別の一戦。織田家編の echizen の札のすぐ後ろに出す（screens.js の under）
  { scn: 'siege_mvp', id: 'echizen_ikko', name: '越前・大滝寺の夜討ち', year: '天正三年（1575）八月　越前国 大滝寺', goal: '夜討ちで大滝寺を攻め落とせ', under: 'echizen',
    spawn: { x: 0, z: -202, heading: 0 }, at: { x: 0, z: -202, r: 16, why: '山麓の村（柴田勝家の手の後ろ）' }, ifs: true,
    text: ['史実では、信長はこの場にいない（柴田勝家・前田利家・佐々成政らの手が各地の山の寺を攻めた）。――もしも信長自ら出ていたら、の一戦。', '越前一向一揆が、山の寺（大滝寺）に拠って抗っている。夜と霧に紛れ、外堂から本堂へ攻め上る。', '作戦（正面・谷から回る・火攻め）で結果が変わる。谷筋には伏兵の噂がある。'],
    button: '山の寺へ', tip: '軍議で作戦を選べ。外堂を落とし、夜霧の中、本堂まで攻め上れ' },
];
// 戦ごとの直し。at・spawn：居場所の目安と立つ所（戦の定義の lordAt・lordSpawn が無い時）
// 信長がその場にいなかった戦（if：史実で率いた者）。札に「もしも」を付け、筋が通るように台詞と任務の文を少し替える
// rep：[替える文（正規表現か文字列）, 替えた文]。台詞・任務・見出し・報せ・印の名に掛ける（lordWrap）
// skip：信長では遊べない戦（一人の使いの役目など、当主が出る筋にならない）
export const LORD_FIX = {
  sunomata: { if: '墨俣の砦づくりは『武功夜話』の伝え。この遊びでは木下藤吉郎が普請を指図する', rep: [['お主が噂の殿か！', '殿、自らお出ましとは！']] },
  shiga: { if: '宇佐山城は森可成・織田信治が守った。信長は摂津の野田・福島に在陣', rep: [['殿（信長公）は摂津で三好と対陣しておられる', '殿、摂津から、ようお戻りくだされた'], ['京へ抜かれれば、殿は挟まれる', '京へ抜かれれば、摂津の味方が挟まれる'], ['殿が戻られるまで', '摂津の本隊が戻るまで'], ['上様が戻られるまで', '摂津の本隊が戻るまで']] },
  mikatagahara: { if: '徳川家康が率い、織田からは佐久間信盛・平手汎秀らが援軍に出た', rep: [['殿（信長公）の名代として来た以上', '殿御自ら出られた以上'], ['殿（信長公）に、何と申し上げればよいか', '面目もござらぬ']] },
  iwamura: { if: '嫡男の織田信忠が率いた' },
  tedorigawa: { if: '柴田勝家が率いた' },
  shigisan: { if: '嫡男の織田信忠が率いた' },
  kizugawa: { if: '九鬼嘉隆の水軍が戦った' },
  miki: { if: '羽柴秀吉が率いた' },
  arioka: { if: '滝川一益らが攻めた' },
  iga: { if: '織田信雄・丹羽長秀らが攻めた' },
  tottori: { if: '羽柴秀吉が率いた' },
  takato: { if: '嫡男の織田信忠が率いた' },
  tano: { if: '滝川一益が勝頼を追い詰めた' },
  nagashinojo: { if: '奥平信昌が籠城した。信長は後詰に向かう途中', rep: [['殿と信長公に会うて', '岡崎の殿に会うて']] },
  tobinosu: { if: '徳川の酒井忠次が率いた別働隊' },
  suwahara: { if: '徳川家康が攻めた' },
  sune: { skip: true },
  saika: { skip: true }, // 山手の堀の局地へ信長を置かない。浜手の総大将の戦は別の場が必要。
  // echizen は上の LORD_BATTLES に札を作ったので、ここの rep（新しい台詞に当たらない）は無し
  // battles.js の戦（ほかの係が直している所なので、居場所の目安と立つ所はここに書く）
  moribe: { at: { x: 6, z: 156, r: 24, why: '信長の本陣（陣幕と馬印の所）' }, spawn: { x: 20, z: 150, heading: Math.PI } },   // 旗本が陣幕や遠景の大軍に重ならない横
  // 信長がいた戦の、筋の食い違い
  inabayama: { rep: [['瑞龍寺山の殿への合図じゃ', '瑞龍寺山の本陣への合図じゃ'], ['瑞龍寺山の殿へ合図を送れ', '瑞龍寺山の本陣へ合図を送れ'], ['瑞龍寺山の殿の本陣から', '瑞龍寺山の本陣から']] },
  odani: { skip: true }, // 夜の京極丸攻めは羽柴の手の任務。信長を足軽の攻め口へ出さない。
  okawachi: { rep: [['殿は別の手を打たれよう', '別の手を打たれませ']] },
  tonezaka: { rep: [['信長公の供をせよ', '馬廻を率いて、朝倉の後を追え'], ['信長公について峠道を追え', '馬廻を率いて峠道を追え'], ['殿（信長公）が、自ら馬を出されたぞ', '殿が、自ら馬を出されたぞ']] },
  tennoji: { rep: [['信長公の下知を待て', '天王寺砦へ打って出る時を見定めよ']] },
};
// どの戦にも掛ける文の直し（家来は主君を「殿」と呼ぶ。任務は「〜のもとで」でなく「〜の手を率い」）
const REP_SAY = [[/殿殿/g, '殿'], [/殿（信長公）/g, '殿'], [/――殿は/g, '――信長は'], [/――殿の/g, '――信長の']];
const REP_OBJ = [[/^(.+?)のもとで、/, '$1の手を率い、'], [/^(.+?)の手について、/, '$1の手を率いて、'], [/^(.+?)の手に加わり、/, '$1の手を率い、'], [/^(.+?)の手に加わって/, '$1の手を率いて'], [/の?下知を待て$/, '時を待て'], [/^陣の見張りにつけ$/, '陣の見張りを見回れ']];

// 侍大将で出陣と同じ戦の一覧を、信長でも遊べるようにする（織田家編の並び → 長篠編 → ほかの筋書き。同じ順・同じ重なりの除き方）
// 上で札を決めていない戦は、並びの年と場所から札を作る。戦の読み込みが済んでから（scenarioReady）作るので、呼ぶ時に組み立てる
// 攻城 MVP・山岳戦 MVP の id は、織田家編の同じ戦の中身を写しただけ（battles.js）。一覧には出さない
const SAME_AS = { kinome: 'echizen', hiei_mtn: 'hieizan', takato_siege: 'takato' };
let built = false;
export function lordList() {
  if (built) return LORD_BATTLES;
  const seen = new Set();
  const order = [...SCENARIO_PICK, ...SCENARIO_ORDER].filter(scenarioReady);
  const out = [];
  for (const k of order) for (const b of SCENARIOS[k].battles) {
    if (SAME_AS[b.id]) continue;
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const have = LORD_BATTLES.find((q) => q.id === b.id);
    if (have) { have.scn = k; out.push(have); continue; }
    const X = LORD_FIX[b.id] || {};
    if (X.skip) continue;
    const late = parseInt((b.year.match(/（(\d+)）/) || [])[1] || '0', 10) > 1582;
    if (late) continue;   // 関ヶ原・大坂など信長の死後の戦は、今は出さない（kaito 2026-09-29）
    const ifs = late || !!X.if;
    out.push({ scn: k, id: b.id, name: b.name.replace(/の戦い$/, ''), year: `${b.year}　${b.place}`, goal: '', spawn: null, ifs,
      text: [`${b.place}。`, late ? '（もしも信長が生きていたら――の一戦）' : X.if ? `史実では、信長はこの場にいない（${X.if}）。――もしも信長自ら出ていたら、の一戦。` : '織田信長として旗本を率いて出る。', '崩れそうな所へ旗本を回し、使番で諸将に下知を送れ。'],
      button: '出陣', tip: '旗本を率いて戦の流れに従え。軍配の図で味方の備に下知を送れ' });
  }
  if (!out.length) return LORD_BATTLES;
  LORD_BATTLES.length = 0; LORD_BATTLES.push(...out);
  built = true;
  return LORD_BATTLES;
}
export const lordOf = (id) => lordList().find((b) => b.id === id);

// 信長で遊ぶ保存（記録は残らない）。k は筋書きの鍵
export function lordGame(k) {
  const G = newGame(LORD.name, 'normal', k);
  G.practice = true; G.injured = false;
  G.lord = LORD.key; G.lordTitle = LORD.title; G.lordClan = LORD.clan; G.lordFaction = 'oda';
  // 見た目の段は「城主」（金の馬具・金扇の馬印）。号令は全部使える
  G.rank = 4; G.trialStep = 6; G.merit = 400;
  G.stats = { spear: 3, vit: 3, lead: 3 };
  G.owned = [...new Set([...G.owned, 'spear2', 'hat3', 'body2', 'kote', 'haidate', 'suneate', 'haori', 'katana', 'teppo', 'spear4', 'yumi'])];
  Object.assign(G.equip, { weapon: 'spear2', hat: 'hat3', body: 'body2', arm: 'kote', thigh: 'haidate', shin: 'suneate', coat: 'haori' });
  G.aijirushi = 'eiraku';   // 旗本の旗は永楽通宝
  fillRoster(G, 20, 10);
  return G;
}

// 戦の定義を、信長で遊ぶ形に替えて使う（中身は元の定義のまま）
// ・立つ所：def.lordSpawn（戦の定義）→ 上の札の spawn → def.spawn
// ・居場所の目安：def.lordAt（戦の定義）→ 上の札の at。{ x, z, r, why }。bot の目（audit.js）が始まりの位置を確かめる
// ・もしもの戦（lordIf）：信長がその場にいなかった戦。居場所の目安は無くてよい
// ・台詞・任務の文を直し、脇役の信長を馬廻の頭に替える（lordWrap）
export function lordDef(def, id) {
  const L = lordOf(id);
  const X = LORD_FIX[id] || {};
  const d = Object.create(def);
  // def.spawn が getter だけの戦（b_echizen_ikko.js など、攻め手・守り手で場所を変える）もあるので、
  // 代入でなく defineProperty で上書きする（代入だと継承した getter に弾かれて例外になる）
  Object.defineProperty(d, 'spawn', { value: def.lordSpawn || X.spawn || (L && L.spawn) || def.spawn, writable: true, enumerable: true, configurable: true });
  d.lordAt = def.lordAt || X.at || (L && L.at) || null;
  d.lordIf = !!(L && L.ifs);
  d.setup = function (rt) { lordWrap(rt, X); const r = def.setup.call(this, rt); purgeDouble(rt); return r; };
  return d;
}
const fixText = (s, list) => { if (typeof s !== 'string') return s; for (const [a, b] of list) s = s.replace(a, b); return s; };
function lordWrap(rt, X) {
  // 戦ごとの直し（X.rep）を先に掛け、どの戦にも掛ける直しを後に掛ける
  const say = X.rep ? [...X.rep, ...REP_SAY] : REP_SAY, obj = X.rep ? [...X.rep, ...REP_OBJ] : REP_OBJ;
  const P = Object.getPrototypeOf(rt);
  rt.say = (sp, text, dur) => P.say.call(rt, sp, fixText(text, say), dur);
  rt.bark = (text, warn) => P.bark.call(rt, fixText(text, say), warn);
  rt.banner = (t, s2) => P.banner.call(rt, fixText(t, say), fixText(s2, say));
  rt.obj = (oid, text, kind) => P.obj.call(rt, oid, fixText(text, obj), kind);
  // 信長の印（脇役の信長に付けていた印）は出さない。信長は自分
  rt.marker = (mid, pos, label, o) => (label === LORD.name ? rt.unmark(mid) : P.marker.call(rt, mid, pos, fixText(label, say), o));
  // 脇役の信長（戦の定義が出す NPC の信長）は、信長で遊ぶ時は出さない。戦の途中で出る分も、出た直後に取り除く
  const spawn = rt.army.spawn.bind(rt.army);
  rt.army.spawn = (...a) => {
    const us = spawn(...a);
    if ((us || []).some((u) => u.name === LORD.name)) { purgeDouble(rt); rt.after(0, () => purgeDouble(rt)); }
    return us;
  };
}
// 自分でない「織田信長」を戦場から除き、筋書きがその者を指していた所（rt.flags の中）を自分へ向け替える
// （NPC の信長の台詞 rt.say('織田信長', …) は、そのまま自分の下知として出る）
function purgeDouble(rt) {
  const me = rt.player && rt.player.u;
  if (!me) return;
  for (const u of rt.army.units) {
    if (u === me || u.name !== LORD.name || u.gone) continue;
    u.invuln = false;
    rt.army.despawn(u);
    const g = u.group;
    if (g && g.leader === u) g.leader = g.units.find((q) => q.alive && q !== u) || null;
  }
  const F = rt.flags || {};
  for (const k of Object.keys(F)) { const v = F[k]; if (v && v !== me && v.name === LORD.name && v.pos) F[k] = me; }
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
  if (b.army.hooks.nanban && !u.look.kosode) u.look = nanbanLook(u.look);
  // 旗本を百人ほどに（戦の定義や侍大将の組に足りない分を足す）
  const p = u.pos, h = u.heading || 0;
  // 信長として率いる組は全員鉄砲（kaito の下知）。戦の定義が先に組んだ槍・弓・騎馬の組（b.squadGroups）も、鉄砲へ作り直す
  // （組そのものは消さず、中の兵だけを鉄砲に差し替える。号令「構え」「放て」「三段で撃て」等は g.kind === 'gun' を見るのでそのまま効く）
  if (!b.def.lordHata) for (const g of b.squadGroups) {
    if (g.kind === 'gun' || g.kind === 'tomo') continue;
    const n = g.units.filter((x) => x.alive).length;
    g.kind = 'gun';
    g.fire = true;
    g.formation = 'line';
    g.fuku = null;
    if (!n) continue;
    for (const x of g.units) if (x.alive) b.army.despawn(x);
    b.squad = b.squad.filter((x) => x.group !== g);
    g.units = g.units.filter((x) => x.alive);
    const units = b.army.spawn(g, [{ type: 'gun', n, o: { flag: G.aijirushi } }]);
    if (n >= 6) g.ranks = 2;
    units.forEach((x) => { x.isSub = true; x.kills = 0; });
    b.squad.push(...units);
  }
  // 戦の定義が供の数を決めていれば（def.lordHata：本能寺のわずかな供など）それに従う。無ければ、それも鉄砲に揃える
  const HATA = b.def.lordHata || { gun: HATAMOTO.spear + HATAMOTO.gun + HATAMOTO.bow + HATAMOTO.cavalry };
  for (const kind of Object.keys(HATA)) {
    const gs = b.squadGroups.filter((g) => g.kind === kind);
    const n = HATA[kind] - gs.reduce((a, g) => a + g.units.length, 0);
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
  // 供の数を決めている戦は、並べる所も戦の定義に任せる
  // 旗本は全員鉄砲の組なので、組が複数あれば横に並べて重ならないようにする
  let gunIdx = 0;
  if (!b.def.lordHata) for (const g of b.squadGroups) {
    const [bk, sd] = g.kind === 'gun' ? [-15, 9 - gunIdx++ * 12] : PLACE[g.kind] || [-20, 0];
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
    if (this.def.lordDown) { this.def.lordDown(this); return; }
    me.hp = 0; me.alive = false; me.fall = 1; me.deadT = 0;
    this.banner('本陣崩る', `${LORD.name}、討たる`);
    this.say('', '――馬上の信長が崩れ落ちた。旗本が浮き足立つ……', 4);
    this.tracker.main = false;
    this.finish({ down: true }, 5);
  };
  b.after(7, () => b.bark(touchy() ? '左の「使番」で、遠くの味方の備へ「進め・待て・退け」を送れます' : 'ジェーで使番：遠くの味方の備へ「進め・待て・退け」を送れます'));
  mountPanel(b);
}

// 毎コマ（main.js の描画の輪から）：名前と身分の札、本陣の崩れ、使番の札
export function lordFrame(b) {
  if (!b.lord) return;
  const who = document.getElementById('h-who');
  const html = `${LORD.name}<small>${b.G.lordTitle || LORD.title}</small>`;
  if (who && who.innerHTML !== html) who.innerHTML = html;
  // 旗本が一割五分を切れば、本陣が崩れて負け
  if (!b.over && b.t > 20 && b.flags.lordSquad0 && !b.def.lordHata) {
    const alive = b.squad.filter((s) => s.alive).length;
    if (alive < b.flags.lordSquad0 * 0.15 && b.canFailMission()) {
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
    return `<li class="${i === P.sel ? 'on' : ''}" data-row="${i}" aria-current="${i === P.sel}"><div class="lp-nm"><b>${esc(nameOf(g))}</b><small>${dirWord(b, c)} ${Math.round(d)}メートル・${g.count}人・いま「${st}」</small></div>` +
      `<div class="lp-ord">${ORD.map((o) => `<button type="button" data-row="${i}" data-ord="${o.id}" ${marching ? 'disabled' : ''}><kbd>${o.key}</kbd>${o.label}</button>`).join('')}</div></li>`;
  }).join('');
  P.el.innerHTML = `<header><h3>使番を送る</h3><button type="button" id="lord-close" aria-label="閉じる">閉じる<kbd>ジェー</kbd></button></header>` +
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
  const secs = Math.max(1, it.d / RUNNER_SPEED);
  b.say(LORD.name, `${nmG}へ伝えよ。「${o.label}」じゃ`, 2);
  b.bark(`使番が${nmG}へ走る（${Math.ceil(secs)}秒ほど）`);
  sfx('taiko', 0.3);
  P.open = false;
  if (P.el) P.el.hidden = true;
  // 使番が馬で走って届ける（着く秒・途中で討たれるかは denrei.js が決める）
  sendOrder(b, b.player.u.pos, g, { id: ord, apply: () => {
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
  } }, { team: 0, faction: g.faction || 'oda', name: nmG, lord: true });
}

// キー：J で開く・閉じる。開いている間は ↑↓・1〜3 をこの札が使う（号令の数字と取り合わない）
window.addEventListener('keydown', (e) => {
  const b = cur;
  if (!b || !b.lord || b.over || b.game.battle !== b || b.game.paused) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (canonical(e.code) === 'KeyJ') { stop(); if (!e.repeat) toggle(); return; }
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
#lord-panel ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
#lord-panel li { border: 1px solid rgba(236,228,210,.14); border-left: 3px solid transparent; padding: 6px 8px; cursor: pointer; }
#lord-panel li.on { border-left-color: var(--shu); background: rgba(192,69,46,.14); border-color: rgba(194,162,90,.5); }
#lord-panel .lp-nm b { font-size: 15px; }
#lord-panel .lp-nm small { display: block; font-size: 12.5px; color: var(--washi-dim); margin-top: 2px; }
#lord-panel .lp-ord { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }
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
