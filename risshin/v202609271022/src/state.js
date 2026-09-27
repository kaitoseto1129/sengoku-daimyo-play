// 進行データ・戦功計算・昇進判定（docs/mvp-requirements.md の数値に準拠）
import { S } from './settings.js';

// 詳細版 §16 の目安
// roku：毎戦の禄（貫）。tomo：連れて行ける供の数（組とは別に、身分に関わらず雇える）
export const RANKS = [
  { name: '足軽', min: 0, squad: 0, roku: 1, tomo: 2 },
  { name: '足軽組頭候補', min: 80, squad: 5, roku: 1.5, tomo: 2 },
  { name: '足軽組頭', min: 130, squad: 15, roku: 2.5, tomo: 3 },
  { name: '足軽大将候補', min: 220, squad: 20, roku: 3.5, tomo: 4 },
  { name: '足軽大将', min: 350, squad: 30, roku: 5, tomo: 5 },
];

// ---------------- 銭 ----------------
// 所持金 G.kan は貫の数（一貫＝千文。端の文は小数で持つ）。画面では「3貫250文」のように書く
export function zeni(kan) {
  const m = Math.round((kan || 0) * 1000);
  const neg = m < 0 ? '−' : '';
  const a = Math.abs(m), k = Math.floor(a / 1000), r = a % 1000;
  return neg + (k && r ? `${k}貫${r}文` : k ? `${k}貫` : `${r}文`);
}
// 銭を足し引きする（文の単位でそろえて、小数の端数を残さない）
export function addKan(G, v) { G.kan = Math.round(((G.kan || 0) + v) * 1000) / 1000; return G.kan; }

// 供（ともの者）：戦で自分のすぐ後ろについて戦う家来。雇う時に hire、戦ごとに wage の給金（貫）
// type は戦場の兵の種類（units.js）。討たれたら名簿から消える
export const TOMO = {
  yarimochi: { name: '槍持ち', type: 'ashigaru', hire: 3, wage: 0.5, note: '主の替えの槍を担いで付き従い、槍で戦う。安く雇える' },
  wakato: { name: '若党', type: 'samurai', hire: 8, wage: 1.2, note: '腕の立つ侍の若者。刀と槍で主を守り、斬り合いに強い' },
  teppo: { name: '鉄砲足軽', type: 'gun', hire: 12, wage: 1.5, note: '自前の火縄銃で、主の後ろから敵を撃つ。込め直しは遅い' },
  chugen: { name: '中間', type: 'porter', hire: 2, wage: 0.3, note: '荷を担いで付き従う。戦の合間に主の傷を手当てし、分捕りを多く持ち帰る' },
};
const TOMO_NAMES = ['与平', '五助', '三太', '喜八', '孫六', '弥吉', '勘六', '市助', '甚八', '仁助', '八十吉', '千代松'];
export function newTomo(G, kind) {
  const used = new Set((G.tomo || []).map((t) => t.name).concat((G.roster || []).map((r) => r.name)));
  const free = TOMO_NAMES.filter((n) => !used.has(n));
  const pool = free.length ? free : TOMO_NAMES;
  return { id: Math.random().toString(36).slice(2, 8), kind, name: pool[Math.floor(Math.random() * pool.length)], battles: 0, kills: 0, alive: true };
}
export function tomoAlive(G) { return (G.tomo || []).filter((t) => t.alive); }
export function tomoCap(G) { return (RANKS[G.rank] || RANKS[0]).tomo || 2; }
// 出世の道（要件 §4 の十段）。検証版で遊べるのは足軽大将まで。その先は「出世の道」で姿を見て、稽古場で試せる
// ranks：この段にあたる検証版の身分（候補は一つ前の段の中に入る）
export const LADDER = [
  { id: 'ashigaru', name: '足軽', ranks: [0, 1], cmd: '0人', can: ['槍・弓で戦う', '伝令・荷運び', '首級を取る'],
    gear: ['陣笠', '簡素な胴具足', '数打の槍'] },
  { id: 'kumigashira', name: '足軽組頭', ranks: [2, 3], cmd: '5〜15人', can: ['小隊を率いる', '号令（前進・待て・退け）', '槍衾・簡易陣形'],
    gear: ['頭形兜', '胴丸と袖', '合印の指物'] },
  { id: 'ashigarutaisho', name: '足軽大将', ranks: [4], cmd: '20〜60人', can: ['兵種を混ぜた組', '部隊の編成', '騎乗（馬屋が開く）'],
    gear: ['前立付き兜', '陣羽織', '采配', '馬'] },
  { id: 'samuraitaisho', name: '侍大将', ranks: [], cmd: '80〜300人', can: ['槍隊・弓隊・鉄砲隊・騎馬隊', '別働隊と伏兵', '兵糧と軍馬の管理'],
    gear: ['三日月の前立', '朱威の上質な甲冑', '緋の陣羽織', '軍配', '飾り手綱の馬'] },
  { id: 'busho', name: '部将', ranks: [], cmd: '300〜2000人', can: ['複数の部隊を動かす', '軍議に加わる', '城攻め・城の守り', '持ち場の城の内政（日本地図）'],
    gear: ['大鍬形の兜', '母衣', '厚総の馬'] },
  { id: 'karo', name: '家老', ranks: [], cmd: '2000人〜', can: ['作戦を献じる', '他の武将と連携', '家臣を配す'],
    gear: ['脇立の兜', '金縁の甲冑', '錦の陣羽織'] },
  { id: 'joshu', name: '城主', ranks: [], cmd: '一城の兵', can: ['領地と内政', '城下町の普請', '家臣団の編成'],
    gear: ['日輪の前立', '専用の甲冑', '金扇の馬印'] },
  { id: 'kunimochi', name: '国持大名', ranks: [], cmd: '一国の兵', can: ['複数の城', '軍団の編成', '国人衆との交渉'],
    gear: ['白馬', '大馬印'] },
  { id: 'sengokudaimyo', name: '戦国大名', ranks: [], cmd: '数か国の兵', can: ['外交・同盟・婚姻', '調略・降伏勧告'],
    gear: ['金の兜', '大馬印（瓢箪）', '馬鎧'] },
  { id: 'tenkabito', name: '天下人', ranks: [], cmd: '天下の兵', can: ['検地・刀狩', '大名の配置', '全国の治め'],
    gear: ['後光の前立', '金と黒の甲冑', '金の馬鎧'] },
];
// 馬屋の馬（足軽大将から）。hp・breath は倍率、speed は駆け足の倍率
// grade：問屋での格（駄馬・並の馬・駿馬）。乗れるのは足軽大将からだが、買っておくことはできる。月影は足軽大将になると賜る
export const HORSES = {
  daba: { name: '駄馬', kind: '栗毛', grade: '駄馬', coat: 0x6a4a30, hp: 0.8, breath: 0.9, speed: 0.88, cost: 8, note: '荷駄を引いていた小柄な馬。遅く打たれ弱いが、安い' },
  tsukikage: { name: '月影', kind: '栗毛', grade: '並の馬', coat: 0x5a3a24, hp: 1, breath: 1, speed: 1, cost: 0, note: '癖のない馬。はじめて乗るならこれ' },
  hayate: { name: '疾風', kind: '鹿毛', grade: '駿馬', coat: 0x6e4220, hp: 0.85, breath: 1.35, speed: 1.06, cost: 35, note: '息が長く、少し速い。打たれ弱い' },
  iwane: { name: '岩根', kind: '黒鹿毛', grade: '駿馬', coat: 0x2a1d14, hp: 1.35, breath: 0.85, speed: 0.95, cost: 38, note: '打たれ強く、槍衾にも怯みにくい。息は短い' },
  // 戦で分捕って持ち帰った馬（買えない。戦の終わりに持ち帰ると馬屋に並ぶ。どこの誰の馬かは G.horseBonds.bundori.from）
  bundori: { name: '分捕り馬', kind: '青毛', coat: 0x17130f, hp: 1.15, breath: 1.1, speed: 1.02, cost: 0, spoil: true, note: '戦で分捕った敵の馬。戦場の音に慣れていて、体力も息もある' },
};
// いま乗る馬（まだ持っていなければ月影）
export function myHorse(G) {
  const h = G.horse || { id: 'tsukikage', bond: 0 };
  const H = HORSES[h.id] || HORSES.tsukikage;
  const bond = Math.min(5, h.bond || 0);
  return { ...H, id: h.id, name: h.name || H.name, bond, hpMul: H.hp * (1 + bond * 0.04), breathMul: H.breath * (1 + bond * 0.04) };
}

// 身分から段へ
export function ladderStep(G) {
  if (G && G.trialStep != null) return G.trialStep;
  const r = G ? G.rank : 0;
  const i = LADDER.findIndex((l) => l.ranks.includes(r));
  return i < 0 ? 0 : i;
}
// 画面に出す身分の名（試しのときは試している段の名）
export function rankLabel(G) { if (G.lordTitle) return G.lordTitle; return G.trialStep != null ? LADDER[G.trialStep].name : RANKS[G.rank].name; }
// 馬に乗れるか（足軽大将から）
export function canRide(G) { return ladderStep(G) >= 2; }


// ---------------- 織田家編の戦の並び ----------------
// 織田家が戦ってきた戦を年の順に並べる一か所の表。新しい戦（src/b_*.js）ができたら、年の順の所に一行足す
// （battles.js が中身を持たない戦は、自動で並びから外れる。足しておいても遊べるようになるまで出ない）
// ceil：この戦の後に届く身分の上限（RANKS の番号。足軽0・組頭候補1・組頭2・足軽大将候補3・足軽大将4）。戦が増えたら、ここの数だけで上がり方を整える
// town：この戦の前にいる城下。boss：この戦の上役（精算の一言・昇進の言葉）。rel：その上役の人間関係の鍵
export const ODA_LINE = [
  { id: 'okehazama', name: '桶狭間の戦い', cap: 160, year: '永禄三年（1560）五月十九日', place: '尾張国 桶狭間', ceil: 0, town: '清洲', boss: '組頭 源八', rel: 'genpachi' },
  { id: 'moribe', name: '森部の戦い', cap: 170, year: '永禄四年（1561）五月', place: '美濃国 森部', ceil: 1, town: '清洲', boss: '組頭 源八', rel: 'genpachi' },
  { id: 'sunomata', name: '墨俣築城防衛', cap: 220, year: '永禄九年（1566）九月', place: '美濃国 墨俣', ceil: 2, town: '小牧山', boss: '普請奉行 木下藤吉郎', rel: 'tokichiro' },
  { id: 'inabayama', name: '稲葉山城の戦い', cap: 200, year: '永禄十年（1567）八月', place: '美濃国 稲葉山城', ceil: 2, town: '小牧山', boss: '木下藤吉郎', rel: 'tokichiro' },
  { id: 'mitsukuri', name: '箕作城の戦い', cap: 200, year: '永禄十一年（1568）九月十二日', place: '近江国 箕作城', ceil: 2, town: '岐阜', boss: '木下藤吉郎', rel: 'tokichiro' },
  { id: 'kanegasaki', name: '金ヶ崎の退き口', cap: 170, year: '元亀元年（1570）四月二十八日', place: '越前国 金ヶ崎', ceil: 2, town: '岐阜', boss: '木下藤吉郎', rel: 'tokichiro' },
  { id: 'anegawa', name: '姉川の戦い', cap: 180, year: '元亀元年（1570）六月二十八日', place: '近江国 姉川', ceil: 3, town: '岐阜', boss: '森可成', rel: 'mori' },
  { id: 'nodafukushima', name: '野田・福島の戦い', cap: 200, year: '元亀元年（1570）九月十二日', place: '摂津国 野田・福島', ceil: 3, town: '岐阜', boss: '前田利家', rel: 'toshiie' },
  { id: 'shiga', name: '志賀の陣・宇佐山城', cap: 200, year: '元亀元年（1570）九月二十日', place: '近江国 坂本・宇佐山城', ceil: 3, town: '岐阜', boss: '各務元正', rel: 'mori' },
  { id: 'hieizan', name: '比叡山攻め', cap: 200, year: '元亀二年（1571）九月十二日', place: '近江国 比叡山 延暦寺', ceil: 4, town: '岐阜', boss: '明智光秀', rel: 'akechi' },
  { id: 'mikatagahara', name: '三方ヶ原の戦い', cap: 210, year: '元亀三年（1572）十二月二十二日', place: '遠江国 三方ヶ原', ceil: 4, town: '岐阜', boss: '佐久間信盛', rel: 'nobutada' },
  { id: 'tonezaka', name: '刀根坂の戦い', cap: 210, year: '天正元年（1573）八月十三日', place: '越前国 刀根坂', ceil: 4, town: '岐阜', boss: '柴田勝家', rel: 'shibata' },
  { id: 'odani', name: '小谷城の戦い', cap: 210, year: '天正元年（1573）八月', place: '近江国 小谷城', ceil: 4, town: '岐阜', boss: '羽柴秀吉', rel: 'tokichiro' },
  { id: 'nagashima', name: '長島一向一揆', cap: 210, year: '天正二年（1574）九月', place: '伊勢国 長島', ceil: 4, town: '岐阜', boss: '柴田勝家', rel: 'shibata' },
  { id: 'shitaragahara', name: '設楽原の決戦', cap: 200, year: '天正三年（1575）五月二十一日', place: '三河国 設楽原', ceil: 4, town: '岐阜', boss: '鉄砲奉行 前田利家', rel: 'toshiie' },
  { id: 'echizen', name: '越前一向一揆・木ノ芽峠', cap: 210, year: '天正三年（1575）八月十五日', place: '越前国 木ノ芽峠', ceil: 4, town: '岐阜', boss: '明智光秀', rel: 'akechi' },
  { id: 'iwamura', name: '岩村城の戦い・水晶山', cap: 210, year: '天正三年（1575）十一月十日', place: '美濃国 岩村城', ceil: 4, town: '岐阜', boss: '河尻秀隆', rel: 'nobutada' },
  { id: 'tennoji', name: '天王寺の戦い', cap: 210, year: '天正四年（1576）五月七日', place: '摂津国 天王寺', ceil: 4, town: '安土', boss: '明智光秀', rel: 'akechi' },
  { id: 'saika', name: '雑賀攻め・小雑賀川', cap: 210, year: '天正五年（1577）二月', place: '紀伊国 小雑賀川', ceil: 4, town: '安土', boss: '堀秀政', rel: 'nobutada' },
  { id: 'tedorigawa', name: '手取川の戦い', cap: 210, year: '天正五年（1577）九月二十三日', place: '加賀国 手取川', ceil: 4, town: '安土', boss: '柴田勝家', rel: 'shibata' },
  { id: 'shigisan', name: '信貴山城の戦い', cap: 220, year: '天正五年（1577）十月十日', place: '大和国 信貴山城', ceil: 4, town: '安土', boss: '織田信忠', rel: 'nobutada' },
  { id: 'kizugawa', name: '第二次木津川口の戦い', cap: 220, year: '天正六年（1578）十一月六日', place: '摂津国 木津川口の沖', ceil: 4, town: '安土', boss: '九鬼嘉隆', rel: 'nobutada' },
  { id: 'miki', name: '三木城・大村の合戦', cap: 220, year: '天正七年（1579）九月十日', place: '播磨国 三木', ceil: 4, town: '安土', boss: '羽柴秀吉', rel: 'tokichiro' },
  { id: 'arioka', name: '有岡城の戦い', cap: 220, year: '天正七年（1579）十月十五日', place: '摂津国 有岡城', ceil: 4, town: '安土', boss: '滝川一益', rel: 'tokichiro' },
  { id: 'iga', name: '天正伊賀の乱・比自山城', cap: 220, year: '天正九年（1581）九月', place: '伊賀国 比自山城', ceil: 4, town: '安土', boss: '丹羽長秀', rel: 'nobutada' },
  { id: 'tottori', name: '鳥取城の戦い', cap: 220, year: '天正九年（1581）十月', place: '因幡国 鳥取城', ceil: 4, town: '安土', boss: '羽柴秀吉', rel: 'tokichiro' },
  { id: 'takato', name: '高遠城の戦い', cap: 220, year: '天正十年（1582）三月二日', place: '信濃国 高遠城', ceil: 4, town: '安土', boss: '森長可', rel: 'nagayoshi' },
  { id: 'tano', name: '田野の戦い・天目山', cap: 220, year: '天正十年（1582）三月十一日', place: '甲斐国 田野', ceil: 4, town: '安土', boss: '滝川一益', rel: 'nobutada' },
  { id: 'honnoji', name: '本能寺の変', cap: 220, year: '天正十年（1582）六月二日', place: '山城国 京 本能寺', ceil: 4, town: '安土', boss: '織田信忠', rel: 'nobutada' },
];

// 筋書き（時代）。いま題の画面に出すのは織田家編だけ（SCENARIO_PICK）。ほかの筋書きは、前の保存の続きと、ほかの遊び方のために残す
export const SCENARIOS = {
  oda: {
    name: '織田家編', year: '永禄三年（1560）〜', faction: 'oda', mon: 'oda', town: '清洲城下',
    blurb: '織田家の足軽として、桶狭間の雨の中から始める。織田家が戦ってきた戦を一つずつ越え、足軽大将へ',
    battles: ODA_LINE,
    ceil: ODA_LINE.map((b) => b.ceil),
  },
  nagashino: {
    name: '長篠編', year: '天正三年（1575）', faction: 'tokugawa', mon: 'tokugawa', town: '岡崎城下',
    blurb: '徳川家の足軽として、設楽原の馬防柵の内に立つ。武田の騎馬が寄せてくる',
    ceil: [1, 1, 2, 3, 4],
    // 作り終えた戦だけを並べる（未完成の戦は ready: false で外す）
    battles: [
      { id: 'nagashinojo', name: '長篠城籠城', cap: 160, year: '天正三年（1575）五月十四日', place: '三河国 長篠城' },
      { id: 'sune', name: '鳥居強右衛門の脱出', cap: 150, year: '天正三年（1575）五月十四日 夜', place: '三河国 長篠 豊川' },
      { id: 'tobinosu', name: '鳶ヶ巣山砦夜襲', cap: 180, year: '天正三年（1575）五月二十一日 夜明け', place: '三河国 鳶ヶ巣山' },
      { id: 'shitaragahara', name: '設楽原の決戦', cap: 200, year: '天正三年（1575）五月二十一日', place: '三河国 設楽原' },
      { id: 'suwahara', name: '諏訪原城攻め', cap: 230, year: '天正三年（1575）八月', place: '遠江国 諏訪原城' },
    ],
  },
  okehazama: {
    name: '桶狭間編', year: '永禄三年（1560）', faction: 'oda', mon: 'oda', town: '清洲城下',
    blurb: '織田家の足軽として、桶狭間の雨の中から出世を始める（以前からの三戦）',
    ceil: [1, 2, 4],
    battles: [
      { id: 'okehazama', name: '桶狭間の戦い', cap: 160, year: '永禄三年（1560）五月十九日', place: '尾張国 桶狭間' },
      { id: 'moribe', name: '森部の戦い', cap: 170, year: '永禄四年（1561）五月', place: '美濃国 森部' },
      { id: 'sunomata', name: '墨俣築城防衛', cap: 220, year: '永禄九年（1566）九月', place: '美濃国 墨俣' },
    ],
  },
  // 四つの筋書きのうち、長篠のほかの三つ（戦国大名の同じ筋書きにそろえる）。今は幕開けの一戦ずつ
  nobunaga_hoi: {
    name: '信長包囲網', year: '元亀元年（1570）', faction: 'oda', mon: 'oda', town: '岐阜城下',
    blurb: '織田家の足軽として、金ヶ崎の退き口から始まる。姉川、そして比叡山へ',
    ceil: [1, 2, 3],
    battles: [
      { id: 'kanegasaki', name: '金ヶ崎の退き口', cap: 170, year: '元亀元年（1570）四月二十八日', place: '越前国 金ヶ崎' },
      { id: 'anegawa', name: '姉川の戦い', cap: 180, year: '元亀元年（1570）六月二十八日', place: '近江国 姉川' },
      { id: 'hieizan', name: '比叡山攻め', cap: 200, year: '元亀二年（1571）九月十二日', place: '近江国 比叡山 延暦寺' },
    ],
  },
  sekigahara: {
    name: '関ヶ原', year: '慶長五年（1600）', faction: 'tokugawa', mon: 'tokugawa', town: '江戸城下',
    blurb: '東軍の足軽として、朝霧の関ヶ原に立つ。松尾山の小早川はまだ動かない',
    ceil: [1],
    battles: [
      { id: 'sekigahara', name: '関ヶ原の戦い', cap: 200, year: '慶長五年（1600）九月十五日', place: '美濃国 関ヶ原' },
    ],
  },
  osaka: {
    name: '大坂の陣', year: '慶長十九年（1614）', faction: 'tokugawa', mon: 'tokugawa', town: '伏見城下',
    blurb: '徳川方の足軽として、大坂城の南に突き出た出丸――真田丸へ寄せる',
    ceil: [1, 2],
    battles: [
      { id: 'sanadamaru', name: '真田丸の戦い', cap: 200, year: '慶長十九年（1614）十二月四日', place: '摂津国 大坂 真田丸' },
      { id: 'domyoji', name: '道明寺の戦い', cap: 210, year: '慶長二十年（1615）五月六日', place: '河内国 道明寺' },
    ],
  },
};
// SCENARIO_PICK：題の画面で「新しく始める」時に選べる筋書き（いまは織田家編だけ。一つなら選ぶ歩は飛ばす）
// SCENARIO_ORDER：前からある筋書き（前の保存の続き・侍大将で出陣・図鑑・テストプレイで使う。題の画面の選択には出さない）
export const SCENARIO_PICK = ['oda'];
export const SCENARIO_ORDER = ['nagashino', 'nobunaga_hoi', 'sekigahara', 'osaka', 'okehazama'];

// 各戦の後に到達できる身分の上限。BATTLES と RANK_CEIL は、いま遊んでいる筋書きの中身に入れ替わる（同じ配列のまま中身だけ）
export const RANK_CEIL = [];
export const BATTLES = [];
let scnKey = null;
export function scenario() { return SCENARIOS[scnKey || 'okehazama']; }
export function scenarioKey() { return scnKey || 'okehazama'; }
export function setScenario(k) {
  if (!SCENARIOS[k]) k = 'okehazama';
  if (k === scnKey) return;
  scnKey = k;
  const sc = SCENARIOS[k];
  const bs = sc.battles.filter((b) => READY.has(b.id));
  BATTLES.splice(0, BATTLES.length, ...bs);
  // 身分の上限：戦ごとに ceil を持つ筋書き（織田家編）はその数。無ければ、並んだ戦の数に合わせて後ろの段から使う（最後の戦のあとで足軽大将に届くように）
  if (bs.every((b) => b.ceil != null)) RANK_CEIL.splice(0, RANK_CEIL.length, ...bs.map((b) => b.ceil));
  else RANK_CEIL.splice(0, RANK_CEIL.length, ...sc.ceil.slice(sc.ceil.length - bs.length));
  for (const f of scnListeners) f(k);
}
const scnListeners = [];
// 遊べる戦（battles.js が中身を持つもの）
const READY = new Set();
// その筋書きに遊べる戦が一つでもあるか（無い筋書きはタイトルに出さない）
export function scenarioReady(k) { return !!SCENARIOS[k] && SCENARIOS[k].battles.some((b) => READY.has(b.id)); }
export function markReady(ids) { for (const id of ids) READY.add(id); if (scnKey) { const k = scnKey; scnKey = null; setScenario(k); } }
export function onScenario(f) { scnListeners.push(f); if (scnKey) f(scnKey); }
setScenario('okehazama');

export const ITEMS = {
  spear0: { slot: 'weapon', name: '数打の槍', note: '足軽に貸し与えられる槍', mult: 1.0, reach: 0 },
  spear1: { slot: 'weapon', name: '上質な槍', note: '突きの威力 +20%', mult: 1.2, reach: 0, cost: 12 },
  spear2: { slot: 'weapon', name: '大身槍', note: '突きの威力 +35%・間合い +0.3。穂が重く、突きの間が2割長い', mult: 1.35, reach: 0.3, cd: 1.2, cost: 22 },
  spear3: { slot: 'weapon', name: '長柄槍', note: '間合い +0.8・威力 +10%。懐に入られると特に弱い（密集の槍衾で真価）', mult: 1.1, reach: 0.8, cd: 1.1, close: 0.45, cost: 18 },
  hat0: { slot: 'hat', name: '陣笠', note: '防御 0%', def: 0, look: 'jingasa' },
  hat1: { slot: 'hat', name: '塗り陣笠', note: '防御 4%', def: 0.04, look: 'jingasa_n' },
  hat2: { slot: 'hat', name: '頭形兜', note: '防御 10%', def: 0.10, look: 'kabuto', cost: 14 },
  hat3: { slot: 'hat', name: '前立付き兜', note: '防御 12%・金の前立', def: 0.12, look: 'kabuto_m', cost: 30, minRank: 2 },
  body0: { slot: 'body', name: '簡素な胴具足', note: '防御 0%・軽い（走ると気力の減りが15%少ない）', def: 0, look: 0 },
  body1: { slot: 'body', name: '胴丸', note: '防御 15%', def: 0.15, look: 1, cost: 16 },
  body2: { slot: 'body', name: '桶側胴', note: '防御 25%・朱の威糸・重い（走ると気力の減りが3割増し）', def: 0.25, look: 2, cost: 28, minRank: 2 },
  kote: { slot: 'arm', name: '籠手', note: '防御 8%', def: 0.08, cost: 8 },
  haidate: { slot: 'thigh', name: '佩楯', note: '防御 5%', def: 0.05, cost: 6 },
  suneate: { slot: 'shin', name: '脛当', note: '防御 4%', def: 0.04, cost: 5 },
  katana: { slot: 'side', name: '打刀', note: '数字キー2で持ち替え。速い斬撃、構えて左で突き。受け流しやすい', cost: 10 },
  haori: { slot: 'coat', name: '陣羽織', note: '組の士気 +5（見た目も変わる）', cost: 18, minRank: 2 },
  // 飛び道具（持っていれば戦の中で持ち替える。数字キー3・4）
  teppo: { slot: 'gun', name: '火縄銃', note: '数字キー3で持ち替え。右で構えて狙い（一人称では照門で）、左で撃つ。撃てば込め直しに十秒ほど。雨では火縄が湿る', cost: 30 },
  yumi: { slot: 'bow', name: '弓', note: '数字キー4で持ち替え。左を押して引き絞り、離して射る。遠くへは山なりに飛ぶ', cost: 8 },
};

// 昇進時に下賜される装備（要件 §4）
export const GRANTS = {
  1: ['hat1', 'spear1'],
  2: ['hat2', 'body1', 'katana'],
  4: ['hat3'],
};

// 部下の名前
const GIVEN = ['太郎左', '与作', '権六', '源太', '孫七', '又八', '甚兵衛', '勘助', '彦三', '小平次', '久蔵', '藤八', '平助', '吉蔵', '伝七', '新六', '市兵衛', '長吉', '佐吉', '茂助', '半蔵', '喜三郎', '惣次', '留吉', '善六', '兵太', '弥助', '六郎', '清蔵', '亀吉'];
export function recruitName(G) {
  const used = new Set((G.roster || []).map((r) => r.name));
  const free = GIVEN.filter((n) => !used.has(n));
  const pool = free.length ? free : GIVEN;
  return pool[Math.floor(Math.random() * pool.length)];
}
export function newRecruit(G, kind = 'spear') {
  return { id: Math.random().toString(36).slice(2, 8), name: recruitName(G), kind, battles: 0, kills: 0, alive: true };
}
// 名簿を組の人数に合わせる（足りなければ新しい足軽を加える）
export function fillRoster(G, spearN, bowN) {
  G.roster = (G.roster || []).filter((r) => r.alive);
  const added = [];
  const need = (kind, n) => {
    const have = G.roster.filter((r) => r.kind === kind).length;
    for (let i = have; i < n; i++) { const r = newRecruit(G, kind); G.roster.push(r); added.push(r); }
  };
  need('spear', spearN);
  need('bow', bowN);
  return added;
}

export const TITLES = {
  firstBlood: { name: '初陣の功', note: '初めて敵を討ち取った' },
  parry10: { name: '受けの名人', note: '一つの戦で10回受け流した' },
  noHead: { name: '下知を守る者', note: '桶狭間で一つも首を取らずに勝った' },
  allAlive: { name: '一人も死なせず', note: '部下を一人も失わずに戦を終えた' },
  flank2: { name: '横槍の名手', note: '一つの戦で側面攻撃を2回決めた' },
  busho: { name: '大将首', note: '敵の武将を自ら討ち取った' },
  rescue: { name: '恩人', note: '囲まれた味方を救った' },
  perfect: { name: '鉄壁', note: '墨俣で柵を一本も破らせなかった' },
  combo: { name: '三段突き', note: '連続突きの三撃目を20回当てた（通算）' },
  veteran: { name: '古参を率いる', note: '三つの戦を生き抜いた部下がいる' },
  noViolation: { name: '忠勤', note: '三つの戦で一度も命令違反をしなかった' },
  taisho: { name: '足軽大将', note: '足軽大将に上り詰めた' },
  drill: { name: '稽古熱心', note: '桶狭間の手ほどきをすべて終えた' },
};

export function newGame(name, difficulty = 'normal', scn = 'oda') {
  return {
    v: 2,
    scenario: scn,
    tomo: [],
    slot: S.slot,
    journal: [],
    difficulty,
    roster: [],
    titles: [],
    life: { parries: 0, thirds: 0, violations: 0, kills: 0 },
    name: name || '弥五郎',
    rank: 0,
    merit: 0,
    superior: 50,
    kan: 0,
    stats: { spear: 1, vit: 1, lead: 1 },
    owned: ['spear0', 'hat0', 'body0'],
    equip: { weapon: 'spear0', hat: 'hat0', body: 'body0', arm: null, thigh: null, shin: null, coat: null },
    aijirushi: null,
    battle: 0,
    injured: false,
    actions: 2,
    rel: {
      genpachi: { trust: 50, like: 50 },
      yashichi: { trust: 50, like: 55 },
      osawa: { trust: 45, like: 50 },
      tokichiro: { trust: 40, like: 50 },
      okudaira: { trust: 45, like: 50 },
      sakai: { trust: 40, like: 50 },
      okubo: { trust: 45, like: 50 },
    },
    talked: {},
    history: [],
    feedback: null,
  };
}

// 古い保存データに新しい項目を補う
export function migrate(G) {
  if (!G) return G;
  G.difficulty = G.difficulty || 'normal';
  G.roster = G.roster || [];
  G.titles = G.titles || [];
  G.life = Object.assign({ parries: 0, thirds: 0, violations: 0, kills: 0 }, G.life || {});
  G.equip = Object.assign({ arm: null, thigh: null, shin: null, coat: null }, G.equip || {});
  G.best = G.best || [];
  G.journal = G.journal || [];
  // 筋書きを持たない古い保存は桶狭間編
  G.scenario = G.scenario || 'okehazama';
  // 長篠編の上官との仲（古い保存にも足しておく）
  G.rel = G.rel || {};
  for (const k of ['genpachi', 'yashichi', 'osawa', 'tokichiro', 'okudaira', 'sakai', 'okubo']) G.rel[k] = G.rel[k] || { trust: 45, like: 50 };
  if (G.slot === undefined) G.slot = 0;
  G.v = 2;
  return G;
}

export function hasItem(G, id) { return G.owned.includes(id); }

export function equipDef(G) {
  let d = 0;
  for (const k of ['hat', 'body', 'arm', 'thigh', 'shin']) if (G.equip[k]) d += ITEMS[G.equip[k]].def || 0;
  return d;
}

// 保存の枠は三つ（一つ目は以前の保存と同じ場所）
const SAVE_KEY = 'sengoku-risshin-save-v1';
const slotKey = (i) => (i ? `${SAVE_KEY}-s${i}` : SAVE_KEY);
export function save(G) {
  if (G.practice) return;
  try {
    const k = slotKey(G.slot ?? S.slot);
    // 前の保存を一つ写しておく（壊れたときに戻せるように）
    const prev = localStorage.getItem(k);
    if (prev) localStorage.setItem(k + '-bak', prev);
    localStorage.setItem(k, JSON.stringify(G));
  } catch (e) { /* 保存できない環境 */ }
}
export function load(i = S.slot) {
  let s = null;
  try { s = localStorage.getItem(slotKey(i)); } catch (e) { return null; }
  if (!s) return null;
  try { return migrate(JSON.parse(s)); } catch (e) {
    // 読めなければ一つ前の写しから戻す
    try { const b = localStorage.getItem(slotKey(i) + '-bak'); return b ? migrate(JSON.parse(b)) : null; } catch (e2) { return null; }
  }
}
export function loadAll() { return [0, 1, 2].map((i) => load(i)); }
export function clearSave(i = S.slot) { try { localStorage.removeItem(slotKey(i)); localStorage.removeItem(slotKey(i) + '-bak'); } catch (e) { /* noop */ } }

// ---------------- 戦功 ----------------
export class MeritTracker {
  constructor(battleIndex) {
    this.battle = BATTLES[battleIndex];
    this.c = { ashigaru: 0, samurai: 0, heads: 0, subKills: 0, flank: 0, rescue: 0, denrei: 0, flag: 0, point: 0, capture: 0 };
    this.busho = [];
    this.side = [];
    this.special = null;
    this.main = null;
    this.violations = [];
    this.pursuits = 0;
    this.subsInit = 0;
    this.subsAlive = 0;
  }

  lines() {
    const L = [];
    const c = this.c;
    if (c.ashigaru) {
      const n = c.ashigaru;
      const pts = Math.min(n, 10) * 2 + Math.max(0, Math.min(n, 20) - 10);
      L.push({ label: '敵足軽撃破', detail: `${n}人${n > 20 ? '（上限）' : n > 10 ? '（逓減）' : ''}`, pts });
    }
    if (c.samurai) L.push({ label: '敵侍撃破', detail: `${c.samurai}人${c.samurai > 4 ? '（上限）' : ''}`, pts: Math.min(c.samurai, 4) * 5 });
    for (const b of this.busho) L.push({ label: '敵武将撃破', detail: b, pts: 30 });
    if (c.heads) L.push({ label: '首級獲得', detail: `${c.heads}${c.heads > 2 ? '（上限）' : ''}`, pts: Math.min(c.heads, 2) * 10 });
    if (c.denrei) L.push({ label: '伝令成功', detail: '', pts: 15 * c.denrei });
    if (c.rescue) L.push({ label: '味方救援', detail: '', pts: 20 * c.rescue });
    if (c.point) L.push({ label: '指示地点の確保', detail: '', pts: 15 });
    if (c.capture) L.push({ label: '拠点制圧', detail: '', pts: 30 * c.capture });
    if (c.flag) L.push({ label: '敵旗奪取', detail: '', pts: 15 * c.flag });
    if (this.special) L.push({ label: this.special.label, detail: '特別戦功', pts: this.special.pts, sp: true });
    for (const s of this.side) L.push({ label: '副任務達成', detail: s, pts: 15 });
    if (this.main === true) L.push({ label: '任務達成', detail: '', pts: 40 });
    if (this.main === false) L.push({ label: '任務失敗', detail: '', pts: -30 });
    if (c.subKills) L.push({ label: '部下の撃破', detail: `${c.subKills}人（2人ごとに+1）`, pts: Math.min(20, Math.floor(c.subKills / 2)) });
    if (c.flank) L.push({ label: '側面攻撃成功', detail: `${c.flank}回${c.flank > 2 ? '（上限）' : ''}`, pts: Math.min(c.flank, 2) * 25 });
    // 部下生存率は戦の終了時にのみ計上する
    if (this.subsInit > 0 && this.finalized) {
      const r = this.subsAlive / this.subsInit;
      const pct = `${this.subsAlive}/${this.subsInit}人（${Math.round(r * 100)}%）`;
      if (r >= 0.8) L.push({ label: '部下生存率', detail: pct, pts: 30 });
      else if (r >= 0.6) L.push({ label: '部下生存率', detail: pct, pts: 15 });
      else if (r < 0.5) L.push({ label: '部下生存率50%未満', detail: pct, pts: -20 });
      else L.push({ label: '部下生存率', detail: pct, pts: 0 });
    }
    for (const v of this.violations) L.push({ label: '命令違反', detail: v, pts: -15 });
    for (let i = 0; i < this.pursuits; i++) L.push({ label: '勝手な追撃', detail: '', pts: -10 });
    // 下知を一度も破らずに務めを果たした（戦の終わりにだけ）
    if (this.finalized && this.main === true && !this.violations.length && !this.pursuits) L.push({ label: '下知を守り通した', detail: '命令違反・勝手な追撃なし', pts: 10 });
    for (const l of L) { l.cat = meritCat(l); if (l.label === '敵武将撃破' || l.sp) l.big = true; }
    return L;
  }

  raw() { return this.lines().reduce((a, l) => a + l.pts, 0); }
  total() { return Math.max(0, Math.min(this.battle.cap, this.raw())); }

  superiorDelta() {
    let d = 0;
    if (this.main === true) d += 10;
    if (this.main === false) d -= 15;
    d += 5 * (this.side.length + this.c.denrei + this.c.rescue);
    d -= 10 * this.violations.length;
    d -= 5 * this.pursuits;
    return d;
  }
}

// 戦功の四つの区分：武（自ら戦う）・任（任務）・将（組の指揮）・忠（下知を守る）
export const MERIT_CATS = ['武', '任', '将', '忠'];
const CAT_OF = {
  敵足軽撃破: '武', 敵侍撃破: '武', 敵武将撃破: '武', 首級獲得: '武',
  伝令成功: '任', 味方救援: '任', 指示地点の確保: '任', 拠点制圧: '任', 敵旗奪取: '任', 副任務達成: '任', 任務達成: '任', 任務失敗: '任',
  部下の撃破: '将', 側面攻撃成功: '将', 部下生存率: '将', 部下生存率50未満: '将',
  命令違反: '忠', 勝手な追撃: '忠', 下知を守り通した: '忠', 敵前逃亡: '忠',
};
export function meritCat(l) { return CAT_OF[l.label] || CAT_OF[String(l.label).replace('%', '')] || '任'; }

// その戦の上官（人間関係の鍵）。戦の表に rel があればそれ（織田家編）
const BOSS_REL = { nagashino: ['okudaira', 'sakai', 'okubo', 'okubo'], okehazama: ['genpachi', 'osawa', 'tokichiro'] };
// 人間関係の値を補う（古い保存には尊敬・警戒が無いので、無ければ作る）
export function relOf(G, k) {
  G.rel = G.rel || {};
  const R = G.rel[k] = G.rel[k] || { trust: 45, like: 50 };
  if (R.respect == null) R.respect = 40;
  if (R.wary == null) R.wary = 15;
  return R;
}

export function verdictFor(total) {
  if (total >= 150) return '「比類なき働きである」';
  if (total >= 110) return '「目覚ましい働きである」';
  if (total >= 80) return '「よう働いた」';
  return '「今一歩であった」';
}

const UNLOCKS = {
  1: '小隊指揮（5人）・合印の旗',
  2: '15人の組・弓隊の編入・陣形・打刀・頭形兜',
  3: '20人の組',
  4: '30人を率いる足軽大将・前立付き兜・馬屋（次の段階）',
};

// 褒美の銭の内訳（貫）。label・detail・kan の行を返す
export function payLines(G, tr, total, rank = G.rank) {
  const L = [];
  const c = tr.c;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  L.push({ label: '恩賞', detail: `戦功${total}`, kan: r3(total * 0.06) });
  if (tr.main === true) L.push({ label: '任務の褒美', detail: '', kan: 2 });
  const kill = Math.min(c.ashigaru || 0, 20) * 0.1 + Math.min(c.samurai || 0, 6) * 0.4 + tr.busho.length * 3;
  if (kill) L.push({ label: '討ち取り', detail: `足軽${c.ashigaru || 0}・侍${c.samurai || 0}${tr.busho.length ? `・武将${tr.busho.length}` : ''}`, kan: r3(kill) });
  let spoil = (c.heads || 0) * 1 + (c.flag || 0) * 1.5 + (c.capture || 0) * 2;
  const chugen = tomoAlive(G).some((t) => t.kind === 'chugen');
  if (chugen) spoil = spoil * 1.3 + 0.3;
  if (spoil) L.push({ label: '分捕り', detail: chugen ? '中間が荷を担いで持ち帰った分も' : '首・旗・拠点', kan: r3(spoil) });
  L.push({ label: '禄', detail: `${(RANKS[rank] || RANKS[0]).name}の扶持`, kan: (RANKS[rank] || RANKS[0]).roku || 1 });
  const T = tomoAlive(G);
  const wage = T.reduce((a, t) => a + ((TOMO[t.kind] || {}).wage || 0), 0);
  if (wage) L.push({ label: '供の給金', detail: `${T.length}人`, kan: r3(-wage) });
  return L;
}

// 評定の区切り（戦功の上限に対する割合）。任務を果たせなければ丙
export const GRADE_CUT = [['甲上', 0.85], ['甲', 0.65], ['乙', 0.45]];

export function settle(G, tr, battleIndex) {
  const lines = tr.lines();
  const raw = tr.raw();
  const total = tr.total();
  const before = { rank: G.rank, merit: G.merit, superior: G.superior };
  G.merit += total;
  G.superior = Math.max(0, Math.min(100, G.superior + tr.superiorDelta()));
  // 褒美の銭：戦功・任務・討ち取り・分捕りと、身分の禄。供の給金はここから払う（数戦で馬や鉄砲一挺に手が届くくらい）
  const pay = payLines(G, tr, total, before.rank);
  const reward = Math.round(pay.reduce((a, l) => a + l.kan, 0) * 1000) / 1000;
  addKan(G, reward);
  const unpaid = G.kan < 0;
  if (unpaid) G.kan = 0;

  let promoted = false;
  let reason = '';
  const ceil = RANK_CEIL[battleIndex] ?? RANKS.length - 1;
  const next = RANKS[G.rank + 1];
  if (next && G.rank < ceil) {
    if (G.merit < next.min) reason = `累計戦功が${next.min}に届かず`;
    else if (G.superior < 50) reason = '上官の評価が足りぬ';
    else if (tr.main !== true) reason = '任務を果たせなかった';
    else if (tr.violations.length > 2) reason = '命令違反が多すぎる';
    else {
      // 織田家編は戦が多いので、一つの戦で上がるのは一段まで（足軽から一気に足軽大将へ飛ばない）
      const maxUp = scenarioKey() === 'oda' ? 1 : 9;
      for (let k = 0; k < maxUp && G.rank < ceil && RANKS[G.rank + 1] && G.merit >= RANKS[G.rank + 1].min; k++) { G.rank += 1; promoted = true; }
    }
  }
  const granted = [];
  const unlocks = [];
  for (let r = before.rank + 1; r <= G.rank; r++) {
    if (UNLOCKS[r]) unlocks.push(UNLOCKS[r]);
    for (const id of GRANTS[r] || []) {
      if (!G.owned.includes(id)) { G.owned.push(id); granted.push(id); }
      const it = ITEMS[id];
      if (it.slot === 'hat' || it.slot === 'body' || it.slot === 'weapon') {
        const cur = ITEMS[G.equip[it.slot]];
        if ((it.def || it.mult || 0) > (cur.def || cur.mult || 0)) G.equip[it.slot] = id;
      }
    }
  }
  let recommend = '';
  const after = RANKS[G.rank + 1];
  if (after && G.merit >= after.min - 60) recommend = `次の戦の働き次第で${after.name}に推挙しよう`;

  const result = {
    battleIndex, battle: tr.battle.name, lines, raw, total, cap: tr.battle.cap, capped: raw > tr.battle.cap,
    verdict: verdictFor(total), reward, pay, unpaid, kanAfter: G.kan, rokuAfter: (RANKS[G.rank] || RANKS[0]).roku, promoted, reason, recommend, granted,
    rankBefore: before.rank, rankAfter: G.rank, meritAfter: G.merit, superiorBefore: before.superior, superiorAfter: G.superior,
    unlock: unlocks.join(' ／ '), mainDone: tr.main === true,
  };
  // 評定：戦功の上限に対する割合と任務の成否で、甲上・甲・乙・丙
  const ratio = total / tr.battle.cap;
  const grade = tr.main !== true ? '丙' : (GRADE_CUT.find(([, k]) => ratio >= k) || ['丙'])[0];
  result.grade = grade;
  G.grades = G.grades || [];
  const order = ['丙', '乙', '甲', '甲上'];
  if (!G.grades[battleIndex] || order.indexOf(grade) > order.indexOf(G.grades[battleIndex])) G.grades[battleIndex] = grade;
  G.history[battleIndex] = { battle: tr.battle.name, total, rankAfter: G.rank, promoted, grade };
  // 区分ごとの小計
  result.cats = {};
  for (const c of MERIT_CATS) {
    const ls = lines.filter((l) => l.cat === c);
    result.cats[c] = { pts: ls.reduce((a, l) => a + l.pts, 0), plus: ls.filter((l) => l.pts > 0).reduce((a, l) => a + l.pts, 0), minus: ls.filter((l) => l.pts < 0).reduce((a, l) => a + l.pts, 0), n: ls.length };
  }
  // この戦の上官との仲：働きで尊敬、下知破りで警戒と信頼が動く
  const bk = (BATTLES[battleIndex] && BATTLES[battleIndex].rel) || (BOSS_REL[scenarioKey()] || [])[battleIndex];
  result.relChange = [];
  if (bk) {
    const R = relOf(G, bk);
    const d = { respect: { 甲上: 8, 甲: 5, 乙: 2, 丙: -3 }[grade] + (tr.busho.length ? 5 : 0), wary: 0, trust: 0 };
    d.wary = tr.violations.length * 10 + tr.pursuits * 5 - (tr.violations.length || tr.pursuits ? 0 : 3);
    d.trust = -5 * tr.violations.length + 4 * (tr.c.rescue + tr.c.denrei);
    for (const k of ['respect', 'wary', 'trust']) {
      const b0 = R[k];
      R[k] = Math.max(0, Math.min(100, R[k] + d[k]));
      d[k] = R[k] - b0;
    }
    result.relChange.push({ k: bk, d, after: { ...R } });
  }
  return result;
}
