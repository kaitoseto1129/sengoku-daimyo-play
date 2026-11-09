// 武将の名簿（kaito 10/31「たくさんの武将を収録したい」）。織田家編の32戦（state.js の ODA_LINE）に史実で出た武将を、敵味方とも。
// 一人：名・読み・家・生まれ（年と国）・仕えた家・出る戦と役目・見た目（分かる物だけ）。
//   出る戦：{ 戦の id: [0 織田方 | 1 敵, 役目の一文] }。役目に「討死・討たれ」とある人だけ、その戦で討たれうる。
//   見た目（look）：bowl 鉢・crest 立物・armor 胴の色・lace 威・doStyle 胴の作り・mon 家紋・coat 馬の毛色・weapon 得物・spear 槍の拵え。
//   書いていない物は、具足の表（kacchu_data.js）と得物の表（named_gear.js）の値を先に使い、そこにも無い人だけ家の色の範囲から名で決める（復元案）。
// 根拠：太田牛一『信長公記』を主に、各家の通説。生年が分からない人は null（顔の年は戦の年から推す）。逸話や後の軍記だけの話は役目に書かない。
// この表は三角も材質も持たない（読むだけの表）。戦から呼ぶ口は bushouFamous（def.bushou）。

// 戦の年（顔の年を出す目安。ODA_LINE の年と同じ）
export const BATTLE_YEAR = {
  inou: 1556, okehazama: 1560, moribe: 1561, sunomata: 1566, inabayama: 1567, mitsukuri: 1568, okawachi: 1569,
  kanegasaki: 1570, anegawa: 1570, nodafukushima: 1570, shiga: 1570, hieizan: 1571, mikatagahara: 1572, tonezaka: 1573,
  odani: 1573, nagashima: 1574, shitaragahara: 1575, echizen: 1575, echizen_ikko: 1575, iwamura: 1575, tennoji: 1576,
  saika: 1577, tedorigawa: 1577, shigisan: 1577, kizugawa: 1578, miki: 1579, arioka: 1579, iga: 1581, tottori: 1581,
  takato: 1582, tano: 1582, honnoji: 1582,
};

// 威の色（伝統の色の名で）
const C = { kon: 0x232c40, hanada: 0x3c5a8a, moegi: 0x6a7a2c, murasaki: 0x5a3a6a, hi: 0x9a2e20, kuchiba: 0x8a6a3a, cha: 0x6a4026,
  shiro: 0xd8d0bc, kuro: 0x1c1a1a, asagi: 0x4a7a86, kurenai: 0xa8281c, ki: 0xa88a3a, nezu: 0x5a5650, kaki: 0x7a4a2a };
// 家：名・家紋（textures.js の MON の鍵か none）・兵の家（FACTION）・威の幅・隊の名の目当て（戦の中の隊へ加える時）
export const HOUSE = {
  oda: { name: '織田', mon: 'oda', faction: 'oda', laces: [C.kon, C.cha, C.hanada, C.kuro, C.kuchiba, C.asagi, C.moegi, C.kaki, C.hi, C.murasaki, C.ki], g: /織田|信長|馬廻|本陣|森|柴田|佐久間|池田|丹羽|木下|羽柴|坂井|滝川|明智|鉄砲組/ },
  mino: { name: '美濃衆', mon: 'none', faction: 'saito', laces: [C.moegi, C.kuchiba, C.asagi, C.cha], g: /稲葉|氏家|安藤|美濃|三人衆/ },
  tokugawa: { name: '徳川', mon: 'tokugawa', faction: 'tokugawa', laces: [C.kuro, C.kon, C.cha, C.moegi, C.asagi, C.kaki], g: /徳川|酒井|本多|榊原|石川|大久保|鳥居|三河/ },
  nobukatsu: { name: '信勝方', mon: 'kari', faction: 'nobukatsu', laces: [C.cha, C.kaki, C.kuchiba, C.moegi, C.ki], g: /信勝|柴田|林/ },
  imagawa: { name: '今川', mon: 'imagawa', faction: 'imagawa', laces: [C.hi, C.moegi, C.kuchiba, C.kon, C.murasaki, C.ki], g: /今川|旗本|本陣|井伊|松井/ },
  saito: { name: '斎藤', mon: 'saito', faction: 'saito', laces: [C.moegi, C.cha, C.kuchiba, C.kaki, C.asagi, C.hi], g: /斎藤|美濃|長井|日比野/ },
  rokkaku: { name: '六角', mon: 'rokkaku', faction: 'rokkaku', laces: [C.moegi, C.cha, C.kon], g: /六角|箕作|観音寺/ },
  kitabatake: { name: '北畠', mon: 'kitabatake', faction: 'kitabatake', laces: [C.murasaki, C.kon, C.cha], g: /北畠|大河内/ },
  azai: { name: '浅井', mon: 'azai', faction: 'azai', laces: [C.kon, C.asagi, C.murasaki, C.cha, C.moegi, C.kaki], g: /浅井|磯野|遠藤|小谷/ },
  asakura: { name: '朝倉', mon: 'asakura', faction: 'asakura', laces: [C.moegi, C.kon, C.kuchiba, C.hanada, C.cha, C.murasaki, C.hi], g: /朝倉/ },
  miyoshi: { name: '三好', mon: 'miyoshi', faction: 'miyoshi', laces: [C.kon, C.cha, C.moegi], g: /三好|野田|福島/ },
  ikko: { name: '本願寺', mon: 'honganji', faction: 'ikko', laces: [C.shiro, C.cha, C.nezu], g: /一揆|本願寺|門徒|坊官|寺/ },
  enryakuji: { name: '延暦寺', mon: 'none', faction: 'ikko', laces: [C.shiro, C.nezu], g: /延暦寺|僧|山門/ },
  takeda: { name: '武田', mon: 'takeda', faction: 'takeda', laces: [C.kurenai, C.hi, C.cha, C.kuro], g: /武田|山県|馬場|内藤|真田|土屋|小山田|穴山|高遠|岩村/ },
  uesugi: { name: '上杉', mon: 'uesugi', faction: 'uesugi', laces: [C.kon, C.murasaki, C.kuro], g: /上杉/ },
  matsunaga: { name: '松永', mon: 'none', faction: 'oda', laces: [C.cha, C.murasaki], g: /松永|信貴山/ },
  mori: { name: '毛利', mon: 'mori', faction: 'mori', laces: [C.moegi, C.kon, C.cha], g: /毛利|吉川|小早川|水軍|鳥取/ },
  bessho: { name: '別所', mon: 'none', faction: 'mori', laces: [C.cha, C.kaki, C.kon], g: /別所|三木/ },
  araki: { name: '荒木', mon: 'none', faction: 'oda', laces: [C.kon, C.cha], g: /荒木|有岡/ },
  saika: { name: '雑賀', mon: 'none', faction: 'ikko', laces: [C.kuro, C.cha], g: /雑賀|鈴木/ },
  iga: { name: '伊賀衆', mon: 'none', faction: 'ikko', laces: [C.kuro, C.nezu], g: /伊賀|比自山/ },
  akechi: { name: '明智', mon: 'akechi', faction: 'akechi', laces: [C.kon, C.kuro, C.asagi], g: /明智|斎藤利三/ },
};

// [名, 読み, 家, 生年（不明は null）, 生まれた国, 仕えた家, { 戦: [敵味方, 役目] }, 見た目]
const ROWS = [
  // ---- 織田家 ----
  ['織田信長', 'おだのぶなが', 'oda', 1534, '尾張', '織田', {
    inou: [0, '弟の信勝方を破る。'], okehazama: [0, '今川義元の本陣を突く。'], moribe: [0, '美濃へ攻め入る。'],
    inabayama: [0, '稲葉山城を囲む。'], mitsukuri: [0, '上洛の道で六角を攻める。'], okawachi: [0, '大河内城を囲む。'],
    kanegasaki: [0, '浅井の離反を知り京へ退く。'], anegawa: [0, '本陣で全軍を率いる。'], nodafukushima: [0, '三好の砦を囲む。'],
    shiga: [0, '坂本で浅井・朝倉と向き合う。'], hieizan: [0, '比叡山を攻めさせる。'], tonezaka: [0, '退く朝倉を自ら追う。'],
    odani: [0, '小谷城を囲む。'], nagashima: [0, '長島の一揆を囲む。'], shitaragahara: [0, '柵と鉄砲で武田を迎える。'],
    echizen: [0, '越前の一揆を攻める。'], tennoji: [0, '天王寺砦を救いに出る。'], saika: [0, '雑賀へ大軍を出す。'],
    honnoji: [0, '明智勢に囲まれ自害する。'] }, { lord: 1, horse: 1 }],
  ['織田信忠', 'おだのぶただ', 'oda', 1557, '尾張', '織田', {
    nagashima: [0, '父とともに長島を攻める。'], shitaragahara: [0, '父と並んで陣を張る。'], iwamura: [0, '岩村城攻めの大将。'],
    saika: [0, '雑賀攻めに加わる。'], shigisan: [0, '信貴山城攻めの大将。'], arioka: [0, '有岡城を囲む。'],
    takato: [0, '高遠城を攻め落とす。'], honnoji: [0, '二条御所で討死する。'] }, { lord: 1, horse: 1 }],
  ['織田信雄', 'おだのぶかつ', 'oda', 1558, '尾張', '北畠→織田', { iga: [0, '伊賀攻めの大将。'] }, { lord: 1, horse: 1 }],
  ['柴田勝家', 'しばたかついえ', 'oda', null, '尾張', '織田信勝→織田', {
    inou: [1, '信勝方の大将。'], anegawa: [0, '織田の段を率いる。'], tonezaka: [0, '朝倉を追う先陣。'], nagashima: [0, '長島を囲む一手。'],
    echizen: [0, '越前攻めの一手。'], tedorigawa: [0, '北陸の大将。'] }, { mon: 'kari', horse: 1 }],
  ['丹羽長秀', 'にわながひで', 'oda', 1535, '尾張', '織田', {
    mitsukuri: [0, '箕作城を攻める。'], okawachi: [0, '夜討ちをかける一手。'], anegawa: [0, '徳川に加勢する。'],
    tonezaka: [0, '朝倉を追う。'], shitaragahara: [0, '柵の内に陣を張る。'], echizen: [0, '越前攻めの一手。'],
    tedorigawa: [0, '柴田とともに加賀へ出る。'], arioka: [0, '有岡城を囲む。'], iga: [0, '伊賀へ攻め入る一手。'] }, { mon: 'sujikai', horse: 1 }],
  ['佐久間信盛', 'さくまのぶもり', 'oda', 1528, '尾張', '織田', {
    mitsukuri: [0, '箕作城を攻める。'], anegawa: [0, '佐久間の段を率いる。'], hieizan: [0, '比叡山攻めの一手。'],
    mikatagahara: [0, '徳川へ加勢する。'], tonezaka: [0, '追い遅れて叱られる。'], nagashima: [0, '長島を囲む一手。'],
    shitaragahara: [0, '柵の内に陣を張る。'], tennoji: [0, '天王寺砦を救う。'], shigisan: [0, '信貴山城を囲む。'] }, { mon: 'sakuma' }],
  ['佐久間信栄', 'さくまのぶひで', 'oda', 1556, '尾張', '織田', { tennoji: [0, '天王寺砦に籠る。'] }, { mon: 'sakuma' }],
  ['滝川一益', 'たきがわかずます', 'oda', 1525, '近江', '織田', {
    okawachi: [0, '大河内城を囲む。'], tonezaka: [0, '朝倉を追う。'], nagashima: [0, '船で長島を囲む。'],
    shitaragahara: [0, '柵の内に陣を張る。'], echizen: [0, '越前攻めの一手。'], echizen_ikko: [0, '大滝寺を焼いたと伝わる。'], saika: [0, '雑賀攻めの一手。'],
    kizugawa: [0, '白い大船一艘を九鬼の船団に添わせる。'], arioka: [0, '有岡城を囲む。'], iga: [0, '伊賀へ攻め入る一手。'],
    tano: [0, '勝頼を天目山へ追う。'] }, { mon: 'takigawa', horse: 1 }],
  ['滝川益重', 'たきがわますしげ', 'oda', null, '近江', '滝川', { tano: [0, '勝頼を追い詰める先手。'] }, { mon: 'takigawa' }],
  ['羽柴秀吉', 'はしばひでよし', 'oda', 1537, '尾張', '織田', {
    sunomata: [0, '墨俣に砦を築く。'], inabayama: [0, '稲葉山城を攻める。'], mitsukuri: [0, '箕作城を攻める。'],
    okawachi: [0, '大河内城を囲む。'], kanegasaki: [0, '殿を務める。'], anegawa: [0, '横山城の囲みに加わる。'],
    tonezaka: [0, '朝倉を追う。'], odani: [0, '京極丸を落とす。'], shitaragahara: [0, '柵の内に陣を張る。'],
    echizen: [0, '越前攻めの一手。'], tedorigawa: [0, '柴田と争い陣を去る。'], shigisan: [0, '信貴山城を囲む。'],
    miki: [0, '三木城を囲む大将。'], tottori: [0, '鳥取城を兵糧攻めにする。'] }, { horse: 1, alias: ['木下秀吉', '木下藤吉郎'] }],
  ['羽柴秀長', 'はしばひでなが', 'oda', 1540, '尾張', '織田', { miki: [0, '兄の下で三木を攻める。'], tottori: [0, '兄の陣を助ける。'] }, {}],
  ['明智光秀', 'あけちみつひで', 'oda', null, '美濃', '朝倉→織田', {
    kanegasaki: [0, '殿に加わる。'], hieizan: [0, '焼き討ちの一手。'], echizen: [0, '越前攻めの一手。'],
    tennoji: [0, '天王寺砦を守る。'], saika: [0, '雑賀攻めの一手。'], shigisan: [0, '信貴山城を囲む。'],
    honnoji: [1, '本能寺を囲む大将。'] }, { horse: 1, mon: 'akechi' }],
  ['前田利家', 'まえだとしいえ', 'oda', null, '尾張', '織田', {
    inou: [0, '目を射られても敵を討つ。'], okehazama: [0, '勘当の身で首を取る。'], moribe: [0, '首を取り帰参を許される。'],
    nodafukushima: [0, '春日井堤で戦う。'], shitaragahara: [0, '鉄砲奉行を務める。'], echizen: [0, '木ノ芽峠を越え府中へ進む。'], echizen_ikko: [0, '越前の一揆を攻める。'],
    tedorigawa: [0, '柴田とともに加賀へ出る。'] }, { mon: 'maeda' }],
  ['佐々成政', 'さっさなりまさ', 'oda', null, '尾張', '織田', {
    shitaragahara: [0, '鉄砲奉行を務める。'], echizen: [0, '木ノ芽峠を越え府中へ進む。'], echizen_ikko: [0, '越前の一揆を攻める。'], tedorigawa: [0, '加賀へ出る。'] }, {}],
  ['森可成', 'もりよしなり', 'oda', 1523, '美濃', '斎藤→織田', {
    inou: [0, '信長方で戦う。'], anegawa: [0, '先手の備を率いる。'], shiga: [0, '宇佐山城を出て討死する。'] }, { mon: 'tsuru', horse: 1 }],
  ['池田恒興', 'いけだつねおき', 'oda', 1536, '尾張', '織田', {
    okawachi: [0, '夜討ちをかける一手。'], anegawa: [0, '池田の段を率いる。'], arioka: [0, '有岡城を囲む。'] }, { mon: 'ageha' }],
  ['坂井政尚', 'さかいまさひさ', 'oda', null, '美濃', '斎藤→織田', { anegawa: [0, '先手の段で戦う。'] }, {}],
  ['竹中重矩', 'たけなかしげのり', 'oda', null, '美濃', '斎藤→織田', { anegawa: [0, '遠藤直経を討ち取る。'] }, {}],
  ['蜂須賀正勝', 'はちすかまさかつ', 'oda', 1526, '尾張', '織田', {
    sunomata: [0, '築城を助けたと後に伝わる。'], miki: [0, '三木を囲む一手。'], tottori: [0, '鳥取を囲む一手。'] }, { mon: 'hachisuka' }],
  ['谷衛好', 'たにもりよし', 'oda', 1529, '美濃', '斎藤→織田', { miki: [0, '平田の砦で討死する。'] }, {}],
  ['黒田官兵衛', 'くろだかんべえ', 'oda', 1546, '播磨', '小寺→織田', {
    arioka: [0, '城の牢から救い出される。'], tottori: [0, '秀吉の陣で策を立てる。'] }, { mon: 'kuroda' }],
  ['栗山善助', 'くりやまぜんすけ', 'oda', 1550, '播磨', '黒田', { arioka: [0, '官兵衛を救い出す。'] }, { mon: 'kuroda' }],
  ['宮部継潤', 'みやべけいじゅん', 'oda', null, '近江', '浅井→織田', { tottori: [0, '鳥取を囲む一手。'] }, {}],
  ['中川清秀', 'なかがわきよひで', 'oda', 1542, '摂津', '荒木→織田', { arioka: [0, '荒木を離れ織田に付く。'] }, {}],
  ['高山右近', 'たかやまうこん', 'oda', 1552, '摂津', '荒木→織田', { arioka: [0, '高槻城を開き織田に付く。'] }, {}],
  ['細川藤孝', 'ほそかわふじたか', 'oda', 1534, '山城', '足利→織田', {
    tennoji: [0, '天王寺へ加勢する。'], saika: [0, '雑賀攻めの一手。'], shigisan: [0, '信貴山城を囲む。'] }, {}],
  ['筒井順慶', 'つついじゅんけい', 'oda', 1549, '大和', '織田', {
    saika: [0, '大和の兵で加わる。'], shigisan: [0, '信貴山城を攻める。'], iga: [0, '伊賀へ攻め入る一手。'] }, {}],
  ['堀秀政', 'ほりひでまさ', 'oda', 1553, '美濃', '織田', { saika: [0, '雑賀攻めの一手。'], iga: [0, '伊賀へ攻め入る一手。'] }, { mon: 'hori' }],
  ['蒲生氏郷', 'がもううじさと', 'oda', 1556, '近江', '六角→織田', { iga: [0, '伊賀へ攻め入る一手。'] }, {}],
  ['九鬼嘉隆', 'くきよしたか', 'oda', 1542, '志摩', '織田', { nagashima: [0, '船で長島を囲む。'], kizugawa: [0, '大船六艘で毛利の水軍を退ける。'] }, { mon: 'kuki' }],
  ['塙直政', 'ばんなおまさ', 'oda', null, '尾張', '織田', { shitaragahara: [0, '鉄砲奉行を務める。'], tennoji: [0, '三津寺で討死する。'] }, {}],
  ['野々村三十郎', 'ののむらさんじゅうろう', 'oda', null, '美濃', '織田', { shitaragahara: [0, '鉄砲奉行を務める。'] }, {}],
  ['福富平左衛門', 'ふくずみへいざえもん', 'oda', null, '美濃', '織田', { shitaragahara: [0, '鉄砲奉行を務める。'] }, {}],
  ['金森長近', 'かなもりながちか', 'oda', 1524, '美濃', '織田', { shitaragahara: [0, '鳶ヶ巣山の砦を攻める。'], tedorigawa: [0, '加賀へ出る。'] }, { mon: 'kanamori' }],
  ['斎藤利治', 'さいとうとしはる', 'oda', null, '美濃', '織田', { tedorigawa: [0, '加賀へ出る。'] }, {}],
  ['不破光治', 'ふわみつはる', 'oda', null, '美濃', '斎藤→織田', { echizen: [0, '越前攻めの一手。後に府中三人衆。'], echizen_ikko: [0, '府中から残党を掃う。'], tedorigawa: [0, '加賀へ出る。'] }, {}],
  ['河尻秀隆', 'かわじりひでたか', 'oda', 1527, '美濃', '織田', { iwamura: [0, '信忠を助け岩村城に入る。'], takato: [0, '高遠攻めの一手。'] }, {}],
  ['森長可', 'もりながよし', 'oda', 1558, '美濃', '織田', { takato: [0, '高遠城に攻め入る。'] }, { mon: 'tsuru' }],
  ['団忠正', 'だんただまさ', 'oda', null, '美濃', '織田', { takato: [0, '森とともに先手を務める。'] }, {}],
  ['蜂屋頼隆', 'はちやよりたか', 'oda', null, '美濃', '織田', { tonezaka: [0, '朝倉を追う。'] }, {}],
  ['稲葉一鉄', 'いなばいってつ', 'mino', 1515, '美濃', '斎藤→織田', {
    inabayama: [0, '織田に付く。'], okawachi: [0, '夜討ちをかける一手。'], anegawa: [0, '東から横槍を入れる。'], tonezaka: [0, '朝倉を追う。'] }, { mon: 'inaba' }],
  ['氏家卜全', 'うじいえぼくぜん', 'mino', null, '美濃', '斎藤→織田', { inabayama: [0, '織田に付く。'], anegawa: [0, '東の手を支える。'] }, {}],
  ['安藤守就', 'あんどうもりなり', 'mino', null, '美濃', '斎藤→織田', { inabayama: [0, '織田に付く。'], anegawa: [0, '東の手で戦う。'] }, {}],
  ['織田信広', 'おだのぶひろ', 'oda', null, '尾張', '織田', { nagashima: [0, '長島で討死する。'] }, {}],
  ['織田秀成', 'おだひでなり', 'oda', null, '尾張', '織田', { nagashima: [0, '長島で討死する。'] }, {}],
  ['織田信次', 'おだのぶつぐ', 'oda', null, '尾張', '織田', { nagashima: [0, '長島で討死する。'] }, {}],
  ['織田信治', 'おだのぶはる', 'oda', 1545, '尾張', '織田', { shiga: [0, '森可成とともに討死する。'] }, {}],
  ['青地茂綱', 'あおじしげつな', 'oda', null, '近江', '六角→織田', { shiga: [0, '宇佐山の戦いで討死する。'] }, {}],
  ['各務元正', 'かがみもとまさ', 'oda', null, '美濃', '森', { shiga: [0, '宇佐山城を守る。'] }, { mon: 'tsuru' }],
  ['佐久間大学', 'さくまだいがく', 'oda', null, '尾張', '織田', { inou: [0, '信長方で戦う。'], okehazama: [0, '丸根砦で討死する。'] }, { mon: 'sakuma', alias: ['佐久間盛重'] }],
  ['佐々孫介', 'さっさまごすけ', 'oda', null, '尾張', '織田', { inou: [0, '信長方で討死する。'] }, {}],
  ['黒田半平', 'くろだはんぺい', 'oda', null, '尾張', '織田', { inou: [0, '信長方で戦う。'] }, {}],
  ['服部小平太', 'はっとりこへいた', 'oda', null, '尾張', '織田', { okehazama: [0, '義元に一番槍をつける。'] }, {}],
  ['毛利新介', 'もうりしんすけ', 'oda', null, '尾張', '織田', { okehazama: [0, '義元の首を取る。'] }, {}],
  ['千秋季忠', 'せんしゅうすえただ', 'oda', null, '尾張', '熱田神宮・織田', { okehazama: [0, '先駆けして討死する。'] }, {}],
  ['佐々政次', 'さっさまさつぐ', 'oda', null, '尾張', '織田', { okehazama: [0, '先駆けして討死する。'] }, {}],
  ['織田秀敏', 'おだひでとし', 'oda', null, '尾張', '織田', { okehazama: [0, '鷲津砦で討死する。'] }, {}],
  ['飯尾定宗', 'いのおさだむね', 'oda', null, '尾張', '織田', { okehazama: [0, '鷲津砦で討死する。'] }, {}],
  ['木下雅楽助', 'きのしたうたのすけ', 'oda', null, '尾張', '織田', { okehazama: [0, '馬廻で首を取る。'] }, {}],
  ['中川金右衛門', 'なかがわきんえもん', 'oda', null, '尾張', '織田', { okehazama: [0, '馬廻で首を取る。'] }, {}],
  ['村井貞勝', 'むらいさだかつ', 'oda', null, '近江', '織田', { honnoji: [0, '二条御所で討死する。'] }, {}],
  ['森蘭丸', 'もりらんまる', 'oda', 1565, '美濃', '織田', { honnoji: [0, '信長のそばで討死する。'] }, { mon: 'tsuru' }],
  ['森坊丸', 'もりぼうまる', 'oda', 1566, '美濃', '織田', { honnoji: [0, '兄とともに討死する。'] }, { mon: 'tsuru' }],
  ['森力丸', 'もりりきまる', 'oda', 1567, '美濃', '織田', { honnoji: [0, '兄とともに討死する。'] }, { mon: 'tsuru' }],
  ['高橋虎松', 'たかはしとらまつ', 'oda', null, '尾張', '織田', { honnoji: [0, '御殿の口で討死する。'] }, {}],
  ['菅屋角蔵', 'すがやかくぞう', 'oda', null, '尾張', '織田', { honnoji: [0, '御殿の口で討死する。'] }, {}],
  ['池田勝正', 'いけだかつまさ', 'oda', null, '摂津', '織田', { kanegasaki: [0, '殿に加わる。'] }, {}],
  ['平手汎秀', 'ひらてひろひで', 'oda', null, '尾張', '織田', { mikatagahara: [0, '援軍で討死する。'] }, {}],
  ['水野信元', 'みずののぶもと', 'oda', null, '尾張', '織田', { mikatagahara: [0, '援軍で加わる。'] }, { mon: 'mizuno' }],
  ['長谷川橋介', 'はせがわきょうすけ', 'oda', null, '尾張', '織田', { mikatagahara: [0, '徳川の手で討死する。'] }, {}],
  ['佐脇藤八', 'さわきとうはち', 'oda', null, '尾張', '織田', { mikatagahara: [0, '徳川の手で討死する。'] }, {}],
  ['荒木村重', 'あらきむらしげ', 'araki', 1535, '摂津', '池田→織田', { tennoji: [0, '天王寺攻めに加わる。'] }, {}],
  ['松永久秀', 'まつながひさひで', 'matsunaga', 1508, '山城', '三好→織田', {
    kanegasaki: [0, '朽木越えを助ける。'], tennoji: [0, '天王寺へ加勢する。'], shigisan: [1, '信貴山城で自害する。'] }, { lord: 1 }],
  ['松永久通', 'まつながひさみち', 'matsunaga', 1543, '山城', '三好→織田', { shigisan: [1, '父とともに城に籠る。'] }, {}],
  // ---- 徳川家 ----
  ['徳川家康', 'とくがわいえやす', 'tokugawa', 1543, '三河', '今川→徳川', {
    okehazama: [1, '今川方で大高城に兵糧を入れる。'], kanegasaki: [0, '織田とともに退く。'], anegawa: [0, '西で朝倉と戦う。'],
    mikatagahara: [0, '武田に挑み敗れる。'], shitaragahara: [0, '織田と並んで武田を迎える。'] }, { lord: 1, horse: 1 }],
  ['酒井忠次', 'さかいただつぐ', 'tokugawa', 1527, '三河', '徳川', {
    anegawa: [0, '徳川の先手を率いる。'], mikatagahara: [0, '右の手を率いる。'], shitaragahara: [0, '鳶ヶ巣山の砦を攻める。'] }, { mon: 'katabami', horse: 1 }],
  ['本多忠勝', 'ほんだただかつ', 'tokugawa', 1548, '三河', '徳川', {
    anegawa: [0, '朝倉の大軍に挑む。'], mikatagahara: [0, '退き口を守る。'], shitaragahara: [0, '柵の前で戦う。'] }, { mon: 'honda', horse: 1 }],
  ['榊原康政', 'さかきばらやすまさ', 'tokugawa', 1548, '三河', '徳川', {
    anegawa: [0, '朝倉の横を突く。'], mikatagahara: [0, '左の手で戦う。'], shitaragahara: [0, '柵の前で戦う。'] }, {}],
  ['石川数正', 'いしかわかずまさ', 'tokugawa', null, '三河', '徳川', { anegawa: [0, '徳川の控えを率いる。'], mikatagahara: [0, '一手を率いる。'] }, {}],
  ['大久保忠世', 'おおくぼただよ', 'tokugawa', 1532, '三河', '徳川', { mikatagahara: [0, '退いた後に夜討ちをかける。'], shitaragahara: [0, '柵の前で戦う。'] }, { mon: 'okubo' }],
  ['大久保忠佐', 'おおくぼただすけ', 'tokugawa', 1537, '三河', '徳川', { shitaragahara: [0, '兄とともに戦う。'] }, { mon: 'okubo' }],
  ['鳥居元忠', 'とりいもとただ', 'tokugawa', 1539, '三河', '徳川', { mikatagahara: [0, '一手で戦う。'] }, {}],
  ['夏目吉信', 'なつめよしのぶ', 'tokugawa', null, '三河', '徳川', { mikatagahara: [0, '家康を逃がし討死する。'] }, {}],
  ['本多忠真', 'ほんだただざね', 'tokugawa', null, '三河', '徳川', { mikatagahara: [0, '退き口で討死する。'] }, { mon: 'honda' }],
  ['鳥居忠広', 'とりいただひろ', 'tokugawa', null, '三河', '徳川', { mikatagahara: [0, '討死する。'] }, {}],
  ['成瀬正義', 'なるせまさよし', 'tokugawa', null, '三河', '徳川', { mikatagahara: [0, '討死する。'] }, {}],
  ['奥平信昌', 'おくだいらのぶまさ', 'tokugawa', 1555, '三河', '武田→徳川', { shitaragahara: [0, '長篠城を守り抜く。'] }, { mon: 'okudaira' }],
  // ---- 武田家 ----
  ['武田信玄', 'たけだしんげん', 'takeda', 1521, '甲斐', '武田', { mikatagahara: [1, '武田の大将。'] }, { lord: 1, horse: 1 }],
  ['武田勝頼', 'たけだかつより', 'takeda', 1546, '甲斐', '武田', {
    mikatagahara: [1, '一手を率いる。'], shitaragahara: [1, '武田の大将。'], tano: [1, '田野で自害する。'] }, { lord: 1, horse: 1 }],
  ['武田信勝', 'たけだのぶかつ', 'takeda', 1567, '甲斐', '武田', { tano: [1, '父とともに自害する。'] }, {}],
  ['山県昌景', 'やまがたまさかげ', 'takeda', null, '甲斐', '武田', { mikatagahara: [1, '先手を率いる。'], shitaragahara: [1, '赤備えで突き討死する。'] }, { horse: 1 }],
  ['馬場信春', 'ばばのぶはる', 'takeda', 1515, '甲斐', '武田', { mikatagahara: [1, '一手を率いる。'], shitaragahara: [1, '殿を務め討死する。'] }, { horse: 1 }],
  ['内藤昌豊', 'ないとうまさとよ', 'takeda', null, '甲斐', '武田', { mikatagahara: [1, '一手を率いる。'], shitaragahara: [1, '柵へ攻め寄せ討死する。'] }, { horse: 1 }],
  ['真田信綱', 'さなだのぶつな', 'takeda', 1537, '信濃', '武田', { shitaragahara: [1, '柵へ攻め寄せ討死する。'] }, { horse: 1 }],
  ['真田昌輝', 'さなだまさてる', 'takeda', 1543, '信濃', '武田', { shitaragahara: [1, '兄とともに討死する。'] }, {}],
  ['土屋昌次', 'つちやまさつぐ', 'takeda', null, '甲斐', '武田', { shitaragahara: [1, '柵へ攻め寄せ討死する。'] }, {}],
  ['原昌胤', 'はらまさたね', 'takeda', null, '甲斐', '武田', { shitaragahara: [1, '討死する。'] }, {}],
  ['甘利信康', 'あまりのぶやす', 'takeda', null, '甲斐', '武田', { shitaragahara: [1, '討死する。'] }, {}],
  ['小山田信茂', 'おやまだのぶしげ', 'takeda', 1539, '甲斐', '武田', { mikatagahara: [1, '先手で戦う。'], shitaragahara: [1, '一手を率いる。'] }, {}],
  ['穴山信君', 'あなやまのぶただ', 'takeda', 1541, '甲斐', '武田', { shitaragahara: [1, '一手を率いる。'] }, {}],
  ['武田信廉', 'たけだのぶかど', 'takeda', null, '甲斐', '武田', { shitaragahara: [1, '一手を率いる。'] }, {}],
  ['武田信豊', 'たけだのぶとよ', 'takeda', 1549, '甲斐', '武田', { shitaragahara: [1, '一手を率いる。'] }, {}],
  ['秋山虎繁', 'あきやまとらしげ', 'takeda', null, '甲斐', '武田', { iwamura: [1, '岩村城を守る。'] }, {}],
  ['仁科盛信', 'にしなもりのぶ', 'takeda', null, '甲斐', '武田', { takato: [1, '高遠城で討死する。'] }, {}],
  ['小山田昌行', 'おやまだまさゆき', 'takeda', null, '甲斐', '武田', { takato: [1, '高遠城で討死する。'] }, {}],
  ['諏訪勝右衛門', 'すわかつえもん', 'takeda', null, '信濃', '武田', { takato: [1, '高遠城で討死する。'] }, {}],
  ['土屋昌恒', 'つちやまさつね', 'takeda', 1556, '甲斐', '武田', { tano: [1, '狭い道で織田勢を防ぎ討死する。'] }, {}],
  ['小宮山友晴', 'こみやまともはる', 'takeda', null, '甲斐', '武田', { tano: [1, '勝頼のもとへ駆けつけ討死する。'] }, {}],
  // ---- 浅井・朝倉 ----
  ['浅井長政', 'あざいながまさ', 'azai', 1545, '近江', '浅井', {
    kanegasaki: [1, '織田を離れ背後を突く。'], anegawa: [1, '浅井の大将。'], shiga: [1, '坂本へ攻め寄せる。'], odani: [1, '小谷城で自害する。'] }, { lord: 1, horse: 1 }],
  ['浅井久政', 'あざいひさまさ', 'azai', 1526, '近江', '浅井', { odani: [1, '小丸で自害する。'] }, {}],
  ['磯野員昌', 'いそのかずまさ', 'azai', null, '近江', '浅井', { anegawa: [1, '先手で織田の段を破る。'] }, { horse: 1 }],
  ['遠藤直経', 'えんどうなおつね', 'azai', null, '近江', '浅井', { anegawa: [1, '姉川で討死する。'] }, {}],
  ['赤尾清綱', 'あかおきよつな', 'azai', null, '近江', '浅井', { odani: [1, '赤尾曲輪を守る。'] }, {}],
  ['朝倉景健', 'あさくらかげたけ', 'asakura', null, '越前', '朝倉', { anegawa: [1, '朝倉の大将。'] }, { lord: 1, horse: 1 }],
  ['真柄十郎左衛門', 'まがらじゅうろうざえもん', 'asakura', null, '越前', '朝倉', { anegawa: [1, '姉川で討死する。'] }, {}],
  ['前波新八', 'まえばしんぱち', 'asakura', null, '越前', '朝倉', { anegawa: [1, '姉川で討死する。'] }, {}],
  ['朝倉景恒', 'あさくらかげつね', 'asakura', null, '越前', '朝倉', { kanegasaki: [1, '金ヶ崎城を開く。'] }, {}],
  ['朝倉義景', 'あさくらよしかげ', 'asakura', 1533, '越前', '朝倉', { shiga: [1, '比叡山に陣を張る。'], tonezaka: [1, '越前へ退く。'] }, { lord: 1, horse: 1 }],
  ['山崎吉家', 'やまざきよしいえ', 'asakura', null, '越前', '朝倉', { tonezaka: [1, '殿で討死する。'] }, {}],
  ['河合吉統', 'かわいよしむね', 'asakura', null, '越前', '朝倉', { tonezaka: [1, '刀根坂で討死する。'] }, {}],
  ['斎藤龍興', 'さいとうたつおき', 'saito', 1548, '美濃', '斎藤→朝倉', { inabayama: [1, '稲葉山城を逃れる。'], tonezaka: [1, '朝倉方で討死する。'] }, { lord: 1 }],
  // ---- 今川・斎藤・六角・北畠 ----
  ['今川義元', 'いまがわよしもと', 'imagawa', 1519, '駿河', '今川', { okehazama: [1, '桶狭間で討たれる。'] }, { lord: 1 }],
  ['松井宗信', 'まついむねのぶ', 'imagawa', null, '遠江', '今川', { okehazama: [1, '桶狭間で討死する。'] }, {}],
  ['井伊直盛', 'いいなおもり', 'imagawa', null, '遠江', '今川', { okehazama: [1, '桶狭間で討死する。'] }, { mon: 'ii' }],
  ['由比正信', 'ゆいまさのぶ', 'imagawa', null, '駿河', '今川', { okehazama: [1, '桶狭間で討死する。'] }, {}],
  ['朝比奈泰朝', 'あさひなやすとも', 'imagawa', null, '遠江', '今川', { okehazama: [1, '鷲津砦を落とす。'] }, {}],
  ['岡部元信', 'おかべもとのぶ', 'imagawa', null, '駿河', '今川', { okehazama: [1, '鳴海城を守る。'] }, {}],
  ['鵜殿長照', 'うどのながてる', 'imagawa', null, '三河', '今川', { okehazama: [1, '大高城を守る。'] }, {}],
  ['山田新右衛門', 'やまだしんえもん', 'imagawa', null, '駿河', '今川', { okehazama: [1, '義元のそばで討死する。'] }, {}],
  ['長井衛安', 'ながいもりやす', 'saito', null, '美濃', '斎藤', { moribe: [1, '森部で討死する。'] }, {}],
  ['日比野清実', 'ひびのきよざね', 'saito', null, '美濃', '斎藤', { moribe: [1, '森部で討死する。'] }, {}],
  ['足立六兵衛', 'あだちろくべえ', 'saito', null, '美濃', '斎藤', { moribe: [1, '前田利家に討たれる。'] }, {}],
  ['六角義賢', 'ろっかくよしかた', 'rokkaku', 1521, '近江', '六角', { mitsukuri: [1, '観音寺城を捨てて逃れる。'] }, { lord: 1 }],
  ['六角義治', 'ろっかくよしはる', 'rokkaku', 1545, '近江', '六角', { mitsukuri: [1, '父とともに逃れる。'] }, {}],
  ['北畠具教', 'きたばたけとものり', 'kitabatake', 1528, '伊勢', '北畠', { okawachi: [1, '大河内城に籠る。'] }, { lord: 1 }],
  ['北畠具房', 'きたばたけともふさ', 'kitabatake', 1547, '伊勢', '北畠', { okawachi: [1, '父とともに城に籠る。'] }, {}],
  // ---- 信勝方（稲生） ----
  ['林秀貞', 'はやしひでさだ', 'nobukatsu', null, '尾張', '織田', { inou: [1, '信勝方の家老。'] }, {}],
  ['林美作守', 'はやしみまさかのかみ', 'nobukatsu', null, '尾張', '織田', { inou: [1, '信長に討たれる。'] }, {}],
  ['宮井勘兵衛', 'みやいかんべえ', 'nobukatsu', null, '尾張', '織田', { inou: [1, '前田利家と戦う。'] }, {}],
  // ---- 三好・本願寺・一揆・延暦寺 ----
  ['三好長逸', 'みよしながやす', 'miyoshi', null, '阿波', '三好', { nodafukushima: [1, '野田・福島に砦を築く。'] }, {}],
  ['三好宗渭', 'みよしそうい', 'miyoshi', null, '阿波', '三好', { nodafukushima: [1, '砦に籠る。'] }, {}],
  ['岩成友通', 'いわなりともみち', 'miyoshi', null, '山城', '三好', { nodafukushima: [1, '砦に籠る。'] }, {}],
  ['本願寺顕如', 'ほんがんじけんにょ', 'ikko', 1543, '摂津', '本願寺', { nodafukushima: [1, '門徒に挙兵を命じる。'], tennoji: [1, '石山本願寺の主。'] }, { lord: 1 }],
  ['下間頼廉', 'しもつまらいれん', 'ikko', 1537, '摂津', '本願寺', { tennoji: [1, '本願寺勢を率いる。'] }, {}],
  ['下間頼旦', 'しもつまらいたん', 'ikko', null, '伊勢', '本願寺', { nagashima: [1, '長島の門徒を率いる。'] }, {}],
  ['下間頼照', 'しもつまらいしょう', 'ikko', null, '越前', '本願寺', { echizen: [1, '越前の一揆を率い討たれる。'] }, {}],
  ['杉浦玄任', 'すぎうらげんにん', 'ikko', null, '加賀', '本願寺', { echizen: [1, '越前で討死する。'] }, {}],
  ['正覚院豪盛', 'しょうがくいんごうせい', 'enryakuji', null, '近江', '延暦寺', { hieizan: [1, '山の僧を率いる。'] }, {}],
  ['鈴木孫一', 'すずきまごいち', 'saika', null, '紀伊', '雑賀', { tennoji: [1, '雑賀の鉄砲衆を率いる。'], saika: [1, '雑賀で織田を迎える。'] }, {}],
  ['土橋守重', 'つちはしもりしげ', 'saika', null, '紀伊', '雑賀', { saika: [1, '雑賀の一手を率いる。'] }, {}],
  // ---- 上杉・毛利・別所・荒木・伊賀・明智 ----
  ['上杉謙信', 'うえすぎけんしん', 'uesugi', 1530, '越後', '上杉', { tedorigawa: [1, '手取川で織田勢を破る。'] }, { lord: 1, horse: 1 }],
  ['乃美宗勝', 'のみむねかつ', 'mori', 1527, '安芸', '小早川', { kizugawa: [1, '毛利の水軍を率いる。'] }, {}],
  ['児玉就英', 'こだまなりひで', 'mori', null, '安芸', '毛利', { kizugawa: [1, '毛利の水軍を率いる。'] }, {}],
  ['吉川経家', 'きっかわつねいえ', 'mori', 1547, '石見', '毛利', { tottori: [1, '鳥取城を守り自害する。'] }, { lord: 1 }],
  ['森下道誉', 'もりしたどうよ', 'mori', null, '因幡', '山名→毛利', { tottori: [1, '鳥取城に籠る。'] }, {}],
  ['奈佐日本之介', 'なさやまとのすけ', 'mori', null, '但馬', '毛利', { tottori: [1, '鳥取城に籠る。'] }, {}],
  ['中村春続', 'なかむらはるつぐ', 'mori', null, '因幡', '山名→毛利', { tottori: [1, '鳥取城に籠る。'] }, {}],
  ['別所長治', 'べっしょながはる', 'bessho', 1558, '播磨', '別所', { miki: [1, '三木城の主。'] }, { lord: 1 }],
  ['別所吉親', 'べっしょよしちか', 'bessho', null, '播磨', '別所', { miki: [1, '大村へ打って出る。'] }, {}],
  ['生石治家', 'おいしはるいえ', 'mori', null, '安芸', '毛利', { miki: [1, '毛利の加勢を率いる。'] }, {}],
  ['荒木久左衛門', 'あらききゅうざえもん', 'araki', null, '摂津', '荒木', { arioka: [1, '城を預かる家老。'] }, {}],
  ['渡辺勘大夫', 'わたなべかんだゆう', 'araki', null, '摂津', '荒木', { arioka: [1, '城に籠る将。'] }, {}],
  ['百地丹波', 'ももちたんば', 'iga', null, '伊賀', '伊賀衆', { iga: [1, '伊賀衆を率いる。'] }, {}],
  ['滝野吉政', 'たきのよしまさ', 'iga', null, '伊賀', '伊賀衆', { iga: [1, '柏原城に籠る。'] }, {}],
  ['斎藤利三', 'さいとうとしみつ', 'akechi', null, '美濃', '稲葉→明智', { honnoji: [1, '明智の先手を率いる。'] }, {}],
  ['明智秀満', 'あけちひでみつ', 'akechi', null, '美濃', '明智', { honnoji: [1, '明智の一手を率いる。'] }, {}],
  ['安田国継', 'やすだくにつぐ', 'akechi', null, '美濃', '明智', { honnoji: [1, '寺へ攻め入る。'] }, {}],
  ['前野長康', 'まえのながやす', 'oda', 1528, '尾張', '織田→羽柴', { sunomata: [0, '墨俣の築城を助けたと伝わる。'] }, {}],
  ['長井道利', 'ながいみちとし', 'saito', null, '美濃', '斎藤', { sunomata: [1, '墨俣の砦を攻める斎藤の将と伝わる。'] }, {}],
  ['稲葉良通', 'いなばよしみち', 'mino', 1515, '美濃', '斎藤→織田', { inabayama: [0, '美濃三人衆として織田に付く。'] }, {}],
  ['おつやの方', 'おつやのかた', 'takeda', null, '尾張', '遠山→武田', { iwamura: [1, '岩村城の女城主。秋山虎繁に嫁ぐ。'] }, {}],
  ['中川重政', 'なかがわしげまさ', 'oda', null, '尾張', '織田', { hieizan: [0, '焼き討ちの一手。'] }, {}],
  ['村上元吉', 'むらかみもとよし', 'mori', null, '伊予', '村上→毛利', { kizugawa: [1, '能島村上の将。この戦に間に合ったかは定かでない。'] }, {}],
];

// 名 → 一人
export const ROSTER = {};
// 別名 → 名（同じ人に別の具足や顔を割り当てない）
export const ROSTER_ALIAS = {};
for (const [name, yomi, house, born, province, served, battles, look] of ROWS) {
  const { alias, lord, horse, ...lk } = look;
  ROSTER[name] = { name, yomi, house, born, province, served, battles, look: lk, lord: !!lord, horse: !!horse };
  for (const a of alias || []) ROSTER_ALIAS[a] = name;
}
export const rosterOf = (name) => ROSTER[name] || ROSTER[ROSTER_ALIAS[name]] || null;
// 戦 → 出る武将の名（名簿の並び順）
export const BATTLE_BUSHOU = {};
for (const p of Object.values(ROSTER)) for (const id of Object.keys(p.battles)) (BATTLE_BUSHOU[id] || (BATTLE_BUSHOU[id] = [])).push(p.name);

// 名から決まる 0〜1 の値（同じ名なら毎回同じ。salt で別の値）
export function nameHash(name, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const ch of String(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (arr, name, salt) => arr[Math.floor(nameHash(name, salt) * arr.length) % arr.length];
// 立物の伝わらない人に付ける形：鍬形の類（当時の兜にふつうの金物。その人だけの立物は作らない）
const GENERIC_CREST = ['none', 'none', 'none', 'kuwa', 'kuwa', 'kuwa_wide', 'kuwa_ken', 'kuwa_ken', 'kuwa_sun'];
const COAT_KINDS = ['鹿毛', '鹿毛', '鹿毛', '黒鹿毛', '黒鹿毛', '栗毛', '栗毛', '青毛', '栃栗毛', '芦毛'];

// 名簿の値から組む具足（kacchu_data.js の KACCHU の一行と同じ並び）。表に無い人だけに使う
export function rosterKacchu(name) {
  const p = rosterOf(name); if (!p) return null;
  const H = HOUSE[p.house] || HOUSE.oda, L = p.look;
  const lace = L.lace ?? pick(H.laces, name, 3);
  // 胴の塗り：黒漆・溜塗・茶漆・錆地・朱溜・金溜（並んだ時に一人ずつ違って見えるよう幅を広げた。10/31）
  const armor = L.armor ?? pick([0x1c1a1a, 0x24221f, 0x3a1e16, 0x4a3222, 0x4a3a2e, 0x5e2418, 0x5e4a2c], name, 5);
  return {
    bowl: L.bowl ?? pick(['suji', 'suji', 'zunari', 'momonari', 'eboshi'], name, 1),
    crest: L.crest ?? (p.lord ? pick(['kuwa', 'kuwa_wide', 'kuwa_ken'], name, 2) : pick(GENERIC_CREST, name, 2)),
    armor, lace, doStyle: L.doStyle ?? pick(['kebiki', 'kebiki', 'sugake', 'okegawa'], name, 4),
    haori: 0, menpo: nameHash(name, 6) < 0.35 ? pick([0x1c1a1a, 0x6a1c14, 0x2a2420], name, 7) : 0,
    mon: L.mon ?? H.mon,
  };
}
// 顔の揺らぎ：[幅, えら, 頬骨, 眉の張り, 鼻, 目の細さ] と髭の量（0〜1）。名で決め、年で髭を抑える
export function rosterFaceShape(name, age = 38) {
  const r = (s, a, b) => +(a + (b - a) * nameHash(name, 20 + s)).toFixed(2);
  const shape = [r(0, 0.93, 1.08), r(1, 0.85, 1.32), r(2, 0.98, 1.35), r(3, 1.0, 1.36), r(4, 0.88, 1.16), r(5, 0.95, 1.3)];
  const beard = age < 20 ? 0 : age < 26 ? r(6, 0, 0.2) : r(6, 0.15, 0.95);
  return { shape, beard };
}
// 顔の年：生年と、その人が出る戦の年の中ほど
export function rosterAge(name, born) {
  const p = rosterOf(name), b = born ?? p?.born;
  const ys = p ? Object.keys(p.battles).map((id) => BATTLE_YEAR[id]).filter(Boolean) : [];
  if (!b) return null;
  const y = ys.length ? ys.sort((a, c) => a - c)[Math.floor(ys.length / 2)] : 1575;
  return Math.max(15, Math.min(72, y - b));
}
// 馬の毛色（units_model.js の COATS の名）と得物（named_gear.js の並び）
export function rosterCoat(name) { const p = rosterOf(name); return p?.look.coat || pick(COAT_KINDS, name, 9); }
export function rosterGear(name) {
  const p = rosterOf(name); if (!p) return null;
  if (p.look.weapon) return { weapon: p.look.weapon, spear: p.look.spear || (p.look.weapon === 'spear' ? 'su' : ''), style: '' };
  // 大将は刀を帯び、自分から槍を振るわない。ほかは素槍・大身槍・十文字槍から（家の役目の補い）
  return p.lord ? { weapon: 'sword', spear: '', style: '' } : { weapon: 'spear', spear: pick(['su', 'su', 'omi', 'jumonji'], name, 11), style: '' };
}

// 戦の定義から「この戦にはこの武将たち」を呼ぶ口（def.bushou = ['浅井長政', …] か { name, g, at, near, horse } を混ぜてよい）。
//   名簿の敵味方・家から def.famous（battle.js の placeFamous）の一つを作る。名簿に無い名・この戦に出ない名は入れない。
// 味方の将は自分の兵へ名乗らない（名は頭上の名札で足りる。11/6 共通の係・姉川の頼み）。敵の将の名乗り（〇〇なり）は残す
const ALLY_LINES = ['槍をそろえて進め！', '遅れを取るな！', '列を崩すな！', 'わしに続け！'];
const FOE_LINES = ['なり。押し返せ！', 'なり。かかれ！', 'なり。一歩も退くな！', 'なり。槍をそろえよ！'];
export function bushouFamous(battleId, list = BATTLE_BUSHOU[battleId] || []) {
  const out = [];
  for (const it of list) {
    const o = typeof it === 'string' ? { name: it } : it, p = rosterOf(o.name), b = p?.battles[battleId];
    if (!p || !b) continue;
    const team = o.team ?? b[0], H = HOUSE[p.house] || HOUSE.oda, dies = /討死|討たれ/.test(b[1]);
    out.push({
      name: o.name, team, g: o.g || H.g, shared: true, loose: o.loose ?? true,
      line: o.line || (team === 0 ? pick(ALLY_LINES, o.name, 13) : o.name + pick(FOE_LINES, o.name, 13)),
      flag: o.flag || (p.look.mon && p.look.mon !== 'none' ? p.look.mon : H.mon !== 'none' ? H.mon : undefined),
      horse: o.horse ?? p.horse, mortal: team === 0 && dies, invuln: team !== 0 && !dies ? true : undefined,
      ...(o.at ? { at: o.at } : {}), ...(o.near ? { near: true } : {}), ...(o.faction ? { faction: o.faction } : {}),
      role: b[1],
    });
  }
  return out;
}
// 戦の定義に def.bushou があれば、def.famous へ一度だけ足す（同じ名は重ねない）
export function withBushou(def) {
  if (!def || !def.bushou || def._bushouDone) return def;
  def._bushouDone = true;
  // 支度で作り置く武将（def.reserve）と、もう famous にいる人は重ねない（姉川の柴田・磯野）
  const have = new Set([...(def.famous || []).map((e) => e.name), ...(def.reserve || []).map((r) => r.o?.name).filter(Boolean)]);
  def.famous = [...(def.famous || []), ...bushouFamous(def.key, def.bushou).filter((e) => !have.has(e.name))];
  return def;
}
