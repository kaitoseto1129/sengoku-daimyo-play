// 織田家編の城下の中身（screens.js の baseScreen が引く）
// 城下は「次に向かう戦」で決まる。中身は戦の id で引くので、state.js の ODA_LINE に戦を足しても並びがずれない
// 足した戦の中身がまだ無ければ、ODA_LINE の town（城下の名）と年から決まりの文を出す
import { BATTLES, RANKS } from './state.js';

// 城下の見出し。place・when：見出し。mood：その場の一言。next：城下での選択が次の戦にどう効くか
const TOWN = {
  moribe: { place: '清洲 城下', when: '永禄三年　夏', mood: '今川を破った興奮が、まだ町に残っている。辻ごとに桶狭間の話が聞こえる',
    next: { lead: '初めて預かる五人が、斎藤勢に崩されにくくなる', shop: '森の中の斬り合いでは、兜と胴が不意の一撃を防ぐ' } },
  sunomata: { place: '小牧山 城下', when: '永禄九年　夏', mood: '信長が清洲から移した新しい城下。山の上の城から、美濃の方がよく見える',
    next: { drill: '組が柵の内で押し負けにくくなる', shop: '砦の守りは長い。具足が傷を減らす' } },
  inabayama: { place: '小牧山 城下', when: '永禄十年　夏', mood: '西美濃の三人衆が味方についたと、城下は沸いている。美濃取りは目の前だ',
    next: { vit: '夜明けの町を駆け回る。走っても気力が尽きにくい', shop: '大手口の斬り合いで、具足が傷を減らす' } },
  mitsukuri: { place: '岐阜 城下', when: '永禄十一年　夏', mood: '稲葉山は岐阜と名を変えた。将軍様を奉じて京へ上るという噂で持ちきりだ',
    next: { lead: '夜の山攻めで、組がばらけにくくなる', shop: '木戸の内の斬り合いで、具足が命を守る' } },
  kanegasaki: { place: '岐阜 城下', when: '元亀元年　春', mood: '稲葉山を「岐阜」と改めて三年。楽市の触れで、町は人と荷であふれている',
    next: { vit: '殿は走り通し。走っても気力が尽きにくい', shop: '退きながらの斬り合いでは、具足が命を守る' } },
  anegawa: { place: '岐阜 城下', when: '元亀元年　五月', mood: '金ヶ崎から逃げ帰った兵たちが、傷を縛って次の出陣を待っている',
    next: { lead: '川原の押し合いで、組が崩れにくくなる', shop: '浅井の槍は鋭い。兜と胴が突きを防ぐ' } },
  nodafukushima: { place: '岐阜 城下', when: '元亀元年　夏', mood: '姉川の勝ちもつかの間。摂津へ向かう鉄砲衆の荷駄が、町を抜けていく',
    next: { vit: '竹束を担いで堤を上る。走っても気力が尽きにくい', shop: '砦の鉄砲の流れ弾を、具足が防ぐ' } },
  hieizan: { place: '岐阜 城下', when: '元亀二年　夏', mood: '森可成の討ち死にの知らせで、町は沈んでいる。坂本へ向かう荷駄が続く',
    next: { spear: '山道の斬り合いで、突きが重くなる', shop: '僧兵の薙刀は重い。具足が傷を減らす' } },
  odani: { place: '岐阜 城下', when: '天正元年　夏', mood: '朝倉を攻める兵が北へ向かう。浅井のお市の方の話を、誰もが声をひそめて話す',
    next: { lead: '夜の尾根で、組が崩れにくくなる', shop: '京極丸の斬り合いで、具足が傷を減らす' } },
  nagashima: { place: '岐阜 城下', when: '天正二年　夏', mood: '長島ではこれまで二度しくじった。三度目こそと、町の空気は重い',
    next: { drill: '柵の前で組が押し負けにくくなる', shop: '門徒の槍と鉄砲を、具足が防ぐ' } },
  shitaragahara: { place: '岐阜 城下', when: '天正三年　五月', mood: '鉄砲と玉薬を積んだ荷駄が、東へ向かう。町の鍛冶場は夜も槌の音がやまない',
    next: { lead: '柵の内で組が踏みとどまりやすくなる', shop: '柵に取り付く武田の槍を、具足が防ぐ' } },
  takato: { place: '安土 城下', when: '天正十年　春', mood: '湖のほとりに、五層の天守がそびえる。楽市の町は、京よりにぎやかだという',
    next: { spear: '曲輪の斬り合いで、突きが重くなる', shop: '塀の上からの矢玉を、具足が防ぐ' } },
  honnoji: { place: '安土 城下', when: '天正十年　五月', mood: '武田が滅び、町は祝いの酒に酔っている。殿は近く、中国の毛利攻めへ向かわれる',
    next: { vit: '京の通りを駆け抜ける。走っても気力が尽きにくい', shop: '明智の大軍を前に、具足が命を守る' } },
};

// 宿で聞く噂（次の戦の手がかり）
const RUMORS = {
  moribe: ['美濃の斎藤勢は、先手を前に出して様子を見るのが常らしい', '林の陰から横を突かれると、どんな備えも崩れるものよ'],
  sunomata: ['墨俣は川に面しておる。川沿いから回り込まれると厄介じゃ', '柵の内からなら、槍は届いても敵の刀は届かん'],
  inabayama: ['稲葉山は金華山のてっぺんの城じゃ。まともに攻めては落ちん', '町に火を放つと聞いたが、逃げる町の者まで斬ってはならんぞ'],
  mitsukuri: ['六角は観音寺城に籠もるらしい。その前の箕作城が要じゃ', '夜の山攻めは、松明の火を絶やさぬことが肝心よ'],
  kanegasaki: ['越前は山が深い。朝倉は一乗谷の奥に籠もっておるそうな', '北近江の浅井は殿の妹婿じゃ。……じゃが、あの家は朝倉とも古い付き合いと聞く'],
  anegawa: ['浅井の兵は川を渡って一気に押してくるらしい。受け止められるかどうかじゃ', '徳川殿の兵は西の瀬に陣を張るそうな。朝倉を受け持つとか'],
  nodafukushima: ['砦には紀州の鉄砲衆が入っておる。雑賀の者の鉄砲は恐ろしいぞ', 'すぐそばの石山の本願寺が、どちらにつくか分からんそうな'],
  hieizan: ['山の上の坊主どもは、刀も薙刀も使うそうじゃ', '山には里の者も逃げ込んでおるらしい。……刃向かわぬ者まで斬るのかのう'],
  odani: ['小谷は尾根に曲輪が並ぶ山城じゃ。真ん中を取れば、本丸と小丸が離れる', 'お市の方と姫さまたちは、まだ城の中におられるそうな'],
  nagashima: ['長島の門徒は、舟で砦から砦へ渡るそうじゃ', '川の中の島じゃ。柵を結うて、舟で着く者を防がねばならん'],
  shitaragahara: ['武田の騎馬は、どんな陣でも踏み破るそうじゃ', '殿は鉄砲を千挺も集めたとか。柵を三重に結うと聞いた'],
  takato: ['高遠の城主は、信玄公の五男じゃ。降らぬと言うておるらしい', '城は崖の上。門を破らねば入れん'],
  honnoji: ['殿は京の本能寺に、少ない供で泊まられるそうじゃ', '明智様の軍勢も、中国へ向かうため丹波で支度をしておるとか'],
};

// 上役から受ける次の任務
const MISSIONS = {
  moribe: { title: '美濃・森部へ', text: '斎藤義龍が急死した。殿は美濃へ兵を出される。その方には五人を付ける。先手の横を突く役じゃ。' },
  sunomata: { title: '墨俣の砦普請を守れ', text: '長良川の西、墨俣に砦を築く。普請を任されたのは木下藤吉郎じゃ。斎藤勢の邪魔が入る。組を率いて守り抜け。' },
  inabayama: { title: '稲葉山城を囲め', text: '三人衆が味方についた。殿はすぐに稲葉山を囲まれる。藤吉郎の手に入り、夜明けに井口の町へ入れ。' },
  mitsukuri: { title: '南近江・箕作城へ', text: '殿は将軍様を奉じて京へ上られる。道をふさぐ六角の箕作城を、夕暮れから攻める。藤吉郎の手に入れ。' },
  kanegasaki: { title: '越前・朝倉攻め', text: '殿は将軍の命として越前の朝倉を攻める。藤吉郎殿の手に加わり、敦賀の金ヶ崎へ向かえ。' },
  anegawa: { title: '近江・姉川へ', text: '裏切った浅井を討つ。徳川殿と共に姉川に陣を布く。森可成殿の手に入り、下知を待って川を渡れ。' },
  nodafukushima: { title: '摂津・野田と福島へ', text: '三好三人衆が摂津の野田・福島に砦を構えた。前田利家殿の手に入り、砦を囲め。' },
  hieizan: { title: '坂本から比叡山へ', text: '延暦寺は浅井・朝倉をかくまい、中立の求めにも応じなかった。明智光秀殿の手に入り、山道を上れ。' },
  odani: { title: '北近江・小谷城へ', text: '朝倉は滅んだ。残るは小谷の浅井。羽柴秀吉殿の手に入り、夜のうちに京極丸へ攻め上れ。' },
  nagashima: { title: '伊勢・長島へ', text: '三度目の長島攻めじゃ。柴田勝家殿の手に入り、岸に柵を結うて門徒を防げ。' },
  shitaragahara: { title: '三河・設楽原へ', text: '武田勝頼が長篠城を囲んだ。殿は三河へ出陣される。前田利家殿の手に入り、鉄砲奉行の柵の内を守れ。' },
  takato: { title: '甲州征伐・高遠城へ', text: '武田を攻める。信濃の高遠城だけが降らぬ。信忠様の軍の、森長可殿の手に入れ。' },
  honnoji: { title: '京へ', text: '殿は中国攻めの前に京へ入られる。信忠様の供として京へ上れ。' },
};

// 人物録（at：その戦の城下から載る）
const PEOPLE = [
  { k: 'nobunaga', n: '織田信長', r: '尾張の大名', t: '桶狭間で今川義元を破り、名を天下に知られる。手柄を立てた者を身分に関わりなく取り立てる。', mon: 'oda' },
  { k: 'genpachi', n: '源八', r: '組頭', t: '桶狭間での最初の上官。口は悪いが面倒見がよい。「首は捨てよ」の下知を叩き込んだ男。', mon: 'oda' },
  { k: 'yashichi', n: '弥七', r: '同輩の足軽', t: '同じ組で槍を並べた同輩。気のいい男で、何かと話しかけてくる。', mon: 'oda' },
  { k: 'tokichiro', n: '木下藤吉郎', r: '普請奉行', t: '草履取りから身を起こしたと噂される男。口が達者で、妙に人に好かれる。のちの羽柴秀吉。', at: 'sunomata', mon: 'oda' },
  { k: 'mori', n: '森可成', r: '織田の宿老', t: '美濃攻めから仕える古参の槍の名手。「攻めの三左」と呼ばれた。', at: 'anegawa', mon: 'oda' },
  { k: 'akechi', n: '明智光秀', r: '織田の将', t: '将軍の家臣から織田に仕えた、学のある将。鉄砲にも城普請にも通じる。', at: 'hieizan', mon: 'akechi' },
  { k: 'toshiie', n: '前田利家', r: '鉄砲奉行', t: '若い頃は「槍の又左」と呼ばれた赤母衣衆の筆頭。設楽原では鉄砲衆を預かる。', at: 'shitaragahara', mon: 'maeda' },
  { k: 'shibata', n: '柴田勝家', r: '織田の宿老', t: '「鬼柴田」と呼ばれた猛将。はじめは信長の弟に仕え、のちに織田家の筆頭となる。', at: 'nagashima', mon: 'oda' },
  { k: 'nagayoshi', n: '森長可', r: '織田の将', t: '森可成の子。父に劣らぬ荒武者で「鬼武蔵」と呼ばれた。', at: 'takato', mon: 'oda' },
  { k: 'nobutada', n: '織田信忠', r: '織田家の嫡男', t: '信長の嫡男。甲州征伐の総大将として、自ら高遠城の塀に取り付いたという。', at: 'takato', mon: 'oda' },
  { k: 'yoshimoto', n: '今川義元', r: '駿河・遠江・三河の大名', t: '「海道一の弓取り」と呼ばれた大大名。桶狭間で討たれた。', mon: 'imagawa' },
];

const REL = [['genpachi', '源八'], ['yashichi', '弥七'], ['tokichiro', '藤吉郎'], ['mori', '森可成'], ['akechi', '明智光秀'], ['toshiie', '前田利家'], ['shibata', '柴田勝家'], ['nagayoshi', '森長可'], ['nobutada', '織田信忠']];
export const ODA_REL_NAME = { mori: '森可成', akechi: '明智光秀', toshiie: '前田利家', shibata: '柴田勝家', nagayoshi: '森長可', nobutada: '織田信忠' };

// 城下での会話（上役の屋敷 boss・宿 inn）。n：名、last：前の戦の結果
function talks(G, i, last) {
  const id = BATTLES[i] && BATTLES[i].id;
  const n = G.name;
  const viol = last && last.lines.some((l) => l.label === '命令違反');
  const T = [];
  if (id === 'moribe') {
    const headV = last && last.lines.some((l) => l.label === '命令違反' && String(l.detail).includes('首'));
    T.push({ id: 'o_gen1', who: '組頭 源八', rel: 'genpachi', at: 'boss',
      lines: [headV ? `${n}、首は捨てよと言うたのを忘れたか。……まあよい、よう戦うた` : `${n}、桶狭間ではよう働いた。わしも鼻が高いわ`, '次の美濃攻めで、お主に五人付ける。組頭の真似事じゃ。うまくやれば、殿のお耳にも入れてやる'],
      choices: [
        { t: '源八殿のお引き立てのおかげにございます', fx: { like: 6 }, sup: 3, reply: 'はっは、口の上手い奴め。次も頼むぞ' },
        { t: '五人、一人も死なせませぬ', fx: { trust: 6, respect: 2 }, reply: 'その意気じゃ。じゃが命あっての物種ぞ' },
      ] });
    T.push({ id: 'o_ya1', who: '同輩 弥七', rel: 'yashichi', at: 'inn',
      lines: [`おい${n}、聞いたか。お主、五人を預かるそうじゃな`, '桶狭間の褒美で、問屋で槍持ちを雇う者もおるそうな。わしは酒で消えたがのう'],
      choices: [
        { t: '弥七、お主も銭を貯めよ', fx: { like: 4 }, reply: 'わかっとる、わかっとる。……次の戦の後でな' },
        { t: '次の戦も、槍を並べよう', fx: { like: 6, trust: 3 }, reply: 'おう！　お主の横なら心強いわ' },
      ] });
  } else if (id === 'sunomata') {
    T.push({ id: 'o_tok1', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`おお、そなたが${n}か。森部で横槍を入れたと聞いたぞ`, viol ? 'じゃが合図より先に動いたとか。わしの砦では、それは困る。待つのも仕事じゃ' : 'わしは墨俣に砦を建てる。材木は川で流して運ぶ。そなたの組には、その普請を守ってもらいたい'],
      choices: [
        { t: '藤吉郎殿の砦、必ず守り抜きます', fx: { like: 6, trust: 4 }, sup: 3, reply: 'よう言うてくれた！　砦ができたら、そなたの名も殿に申し上げる' },
        { t: '本当に一夜で砦が建ちますか', fx: { trust: 3, wary: 2 }, reply: 'はっは、一夜はちと大げさじゃ。じゃが早いぞ、わしの普請は' },
      ] });
    T.push({ id: 'o_ya2', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['小牧山の町は新しゅうて、どこも木の香りがするのう', '藤吉郎という男、草履取りから成り上がったとかで、口が達者で妙に人に好かれるそうじゃ'],
      choices: [
        { t: '会ってみたいものだ', fx: { like: 3 }, reply: 'お主と気が合うかもしれんな。どっちも成り上がり者じゃ' },
        { t: '口先だけの男ではないか', fx: { trust: 3 }, reply: 'さあのう。じゃが殿はそういう者を好まれるからの' },
      ] });
  } else if (id === 'kanegasaki') {
    T.push({ id: 'o_tok2', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`${n}、墨俣からこのかた、ようわしに付いて来てくれた`, '次は越前の朝倉攻めじゃ。わしの手に来い。……何やら胸騒ぎがするがのう'],
      choices: [
        { t: 'どこへなりとお供します', fx: { like: 6, trust: 3 }, sup: 3, reply: 'うむ。そなたのような者がおると、わしも心強い' },
        { t: '胸騒ぎとは、何でございますか', fx: { trust: 4, respect: 2 }, reply: '北近江の浅井よ。朝倉とは古い付き合いじゃ。……退き道は覚えておけ' },
      ] });
    T.push({ id: 'o_ya3', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['岐阜の問屋は大したもんじゃ。鉄砲まで並んでおる', '一挺三十貫と聞いた。わしの禄では何年かかるかのう'],
      choices: [
        { t: 'いずれ組に鉄砲を持たせたい', fx: { like: 3, trust: 3 }, reply: 'お主ならやりかねんな。その時はわしに撃たせてくれ' },
        { t: '槍の方が性に合う', fx: { like: 5 }, reply: 'はっは、わしもじゃ。火縄は雨に弱いしのう' },
      ] });
  } else if (id === 'anegawa') {
    T.push({ id: 'o_tok3', who: '木下藤吉郎', rel: 'tokichiro', at: 'boss',
      lines: [`${n}、金ヶ崎の退き口、ようわしの後ろを守ってくれた`, '次は浅井を討つ。わしは横山の備えに回る。そなたは森可成殿の手に入れ。槍の名手じゃ、学ぶことは多いぞ'],
      choices: [
        { t: '藤吉郎殿のおかげで命拾いしました', fx: { like: 6, trust: 4 }, sup: 3, reply: '何を申す。命拾いしたのはわしの方じゃ' },
        { t: '森殿の下で、手柄を立ててまいります', fx: { respect: 4, trust: 2 }, reply: 'うむ。「攻めの三左」の槍を、よう見ておけ' },
      ] });
  } else if (id === 'hieizan') {
    T.push({ id: 'o_ake1', who: '明智光秀', rel: 'akechi', at: 'boss',
      lines: [`${n}か。姉川での働き、森殿から聞いておった。……その森殿も、宇佐山で討たれた`, '比叡山を攻める。刃向かう僧兵は討つ。じゃが、下知なく逃げる者を追うな。わしの手では、それを守ってもらう'],
      choices: [
        { t: '下知は必ず守ります', fx: { trust: 6, respect: 2 }, sup: 3, reply: 'うむ。その方のような者を探しておった' },
        { t: '山を焼くのは、心が痛みます', fx: { like: 4, wary: 2 }, reply: '……わしもじゃ。されど、これが戦よ。心を痛める者だけが、手を止めることもできる' },
      ] });
    T.push({ id: 'o_ya4', who: '弥七', rel: 'yashichi', at: 'inn',
      lines: ['森様が討たれたと聞いて、わしは泣いた', 'お主はもう組を率いる身じゃ。……わしらのことも、忘れんでくれよ'],
      choices: [
        { t: '忘れるものか。わしらは桶狭間からの仲じゃ', fx: { like: 8, trust: 4 }, reply: 'へへ……そうじゃな。雨の中で、ずぶ濡れで走ったのう' },
        { t: '湿っぽいのはやめじゃ、飲め', fx: { like: 5 }, reply: 'おう、今日はお主のおごりじゃな！' },
      ] });
  } else if (id === 'shitaragahara') {
    T.push({ id: 'o_tos1', who: '前田利家', rel: 'toshiie', at: 'boss',
      lines: [`${n}、これまでの働きは聞いておる。${RANKS[G.rank].name}まで来たか`, '設楽原では、わしら五人の鉄砲奉行が柵の内の鉄砲を預かる。その方の組は、わしの持ち場の槍じゃ。撃ち漏らしを突き落とせ'],
      choices: [
        { t: '槍の又左殿の下で戦えるとは', fx: { like: 6, respect: 3 }, sup: 3, reply: 'はっは、昔の名よ。今は鉄砲の世じゃ。……じゃが、最後に柵を守るのは槍ぞ' },
        { t: '鉄砲の撃ち方も、学びとうございます', fx: { trust: 5 }, reply: 'よかろう。放つ前によう引きつけること。それだけじゃ' },
      ] });
  } else if (id) {
    // これから足す戦の城下（中身がまだ無い時の決まり文句）
    const b = BATTLES[i];
    T.push({ id: `o_gen_${id}`, who: b.boss || '上役', rel: b.rel || 'genpachi', at: 'boss',
      lines: [`${n}、次は${b.name.replace(/の戦い$/, '')}じゃ。${b.place}へ向かう`, '備えを整えておけ'],
      choices: [{ t: '承知いたしました', fx: { trust: 3 }, sup: 2, reply: 'うむ。励め' }] });
  }
  return T;
}

// 次の戦の作戦図（森部・墨俣は前からある図。screens.js から渡してもらう）
let oldDiagram = () => '';
export function setOdaDiagram(f) { oldDiagram = f; }
function diagram(i) {
  const id = BATTLES[i] && BATTLES[i].id;
  if (id === 'moribe') return oldDiagram(1);
  if (id === 'sunomata') return oldDiagram(2);
  return '';
}

// 戦の道のり（尾張・美濃・近江・越前・三河）。印の番号は戦の id から引く（戦が増えても済・次がずれない）
const PLACES = {
  okehazama: [218, 176, '桶狭間'], moribe: [148, 100, '森部'], sunomata: [176, 116, '墨俣'], kanegasaki: [72, 30, '金ヶ崎'], anegawa: [100, 92, '姉川'],
  hieizan: [44, 150, '比叡山'], shitaragahara: [288, 188, '設楽原'],
  // これから足す戦
  inabayama: [186, 94, '稲葉山'], mitsukuri: [80, 138, '箕作'], odani: [104, 78, '小谷'], nagashima: [168, 186, '長島'], takato: [300, 60, '高遠'], honnoji: [30, 170, '本能寺'], nodafukushima: [22, 214, '野田・福島'],
};
const HOMES = { 清洲: [192, 144], 小牧山: [206, 126], 岐阜: [184, 96], 安土: [70, 120] };
function map(G) {
  const next = G.battle;
  const nodes = BATTLES.map((b, i) => ({ b: i, p: PLACES[b.id] })).filter((d) => d.p);
  const home = (BATTLES[next] && BATTLES[next].town) || (BATTLES[BATTLES.length - 1] || {}).town || '清洲';
  const H = HOMES[home] || HOMES.清洲;
  const rm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `<svg class="cmap" viewBox="0 0 320 250" width="100%" role="img" aria-label="戦の道のり">
    <text x="16" y="26" fill="#7d7566" font-size="11">越前</text><text x="16" y="120" fill="#7d7566" font-size="11">近江</text><text x="210" y="70" fill="#7d7566" font-size="11">美濃</text><text x="240" y="150" fill="#7d7566" font-size="11">尾張</text><text x="270" y="232" fill="#7d7566" font-size="11">三河</text>
    <path d="M60 110 C 50 140, 60 180, 80 200" stroke="#4f6f86" stroke-width="7" fill="none" opacity=".35"/><text x="54" y="210" fill="#6f8aa0" font-size="11">琵琶湖</text>
    <path d="M150 20 C 170 80, 180 140, 175 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".55"/><text x="150" y="240" fill="#6f8aa0" font-size="11">長良川</text>
    <path d="M230 20 C 210 90, 200 150, 200 250" stroke="#4f6f86" stroke-width="3" fill="none" opacity=".45"/><text x="204" y="240" fill="#6f8aa0" font-size="11">木曽川</text>
    ${nodes.map((d) => `<line x1="${H[0]}" y1="${H[1]}" x2="${d.p[0]}" y2="${d.p[1]}" stroke="rgba(194,162,90,.22)" stroke-dasharray="3 3"/>`).join('')}
    <rect x="${H[0] - 6}" y="${H[1] - 6}" width="12" height="12" fill="#ece4d2" stroke="#14120f" stroke-width="2"/><text x="${H[0]}" y="${H[1] - 12}" fill="#ece4d2" font-size="12" text-anchor="middle">${home}</text>
    ${nodes.map((d) => {
      const done = d.b < next, cur = d.b === next;
      return `<g><circle cx="${d.p[0]}" cy="${d.p[1]}" r="8" fill="${done ? '#c2a25a' : cur ? '#c0452e' : '#2c2821'}" stroke="#14120f" stroke-width="2">${cur && !rm ? '<animate attributeName="r" values="8;11;8" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle>
      <text x="${d.p[0]}" y="${d.p[1] + 22}" fill="${cur ? '#f3e6c4' : '#b9b09c'}" font-size="12" text-anchor="middle">${d.p[2]}${done ? '　済' : cur ? '　次' : ''}</text></g>`;
    }).join('')}
  </svg>`;
}

// 城下の中身を、いまの戦の並び（BATTLES）の番号で引ける形にして返す
export function odaTown() {
  const TOWNS = {}, RUM = {}, MIS = {};
  BATTLES.forEach((b, i) => {
    const t = TOWN[b.id] || { place: `${b.town || '清洲'} 城下`, when: b.year.replace(/（\d+）/, '　').split('　').slice(0, 2).join('　') };
    TOWNS[i] = { ...t, fac: t.fac };
    RUM[i] = RUMORS[b.id] || [];
    MIS[i] = MISSIONS[b.id] || { title: `${b.name}へ`, text: `${b.place}へ向かう。${b.boss || '上役'}の手に入り、下知を待て。` };
  });
  const idx = (id) => BATTLES.findIndex((b) => b.id === id);
  const people = PEOPLE.map((p) => ({ ...p, min: p.at ? (idx(p.at) < 0 ? 999 : idx(p.at)) : 0 }));
  return { TOWNS, RUMORS: RUM, MISSIONS: MIS, PEOPLE: people, REL, diagram, map, talks, art: null };
}
