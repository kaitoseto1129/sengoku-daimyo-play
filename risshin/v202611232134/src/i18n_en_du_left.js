// K516 英語版：武田編・上杉編の残り（en_left_probe 11/24 クラウド Sanae）。戦の中の組の札（左の四枚）と上杉編 u06 の始めの札。英語の時だけ読む。
const N = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const num = (s) => (N[s] ?? s);
const WHO = { 武田: 'Takeda', 城兵: 'Castle garrison', 上杉輝虎: 'Uesugi Terutora', 上杉景勝: 'Uesugi Kagekatsu', 直江兼続: 'Naoe Kanetsugu', 景勝方: 'Kagekatsu’s side', 上杉: 'Uesugi', 北条: 'Hojo' };
const NM = { 柿崎: 'Kakizaki', 長野: 'Nagano', 藤井: 'Fujii', 北条: 'Hojo', 大藤: 'Daito', 中山: 'Nakayama', 今川: 'Imagawa', 朝比奈: 'Asahina', 庵原: 'Iwahara',
  石川: 'Ishikawa', 本多: 'Honda', 鳥居: 'Torii', 野田: 'Noda', 菅沼: 'Suganuma', 木曽: 'Kiso', 千村: 'Chimura', 山村: 'Yamamura', 河尻秀隆: 'Kawajiri Hidetaka',
  滝川: 'Takigawa', 篠岡: 'Shinooka', 稲田: 'Inada', 日比野: 'Hibino', 津田: 'Tsuda', 滝川益重: 'Takigawa Masushige', 上杉: 'Uesugi', 上杉の二の備: 'Uesugi second unit', 上杉の旗本: 'Uesugi guard' };
const who = (k) => WHO[k];
export default [
  ["弓衆", "Archers"], ["鉄砲衆", "Arquebusiers"], ["槍衆", "Spearmen"],
  [/^(武田|城兵|上杉|北条)の(槍衆|弓衆|鉄砲衆)$/, (m) => `${who(m[1])} ${{ 槍衆: 'spearmen', 弓衆: 'archers', 鉄砲衆: 'arquebusiers' }[m[2]]}`],
  [/^(上杉輝虎|上杉景勝|直江兼続)の旗本$/, (m) => `${who(m[1])}’s guard`],
  [/^(武田|景勝方)の(後備え|備)\s*(\d+)\s*([一二三四五六七八九])$/, (m) => `${who(m[1])} ${m[2] === '後備え' ? 'reserve' : 'unit'} ${m[3]}-${num(m[4])}`],
  [/^(武田|景勝方)の脇の備え\s*(東|西|南|北)\s*([一二三四五六七八九])$/, (m) => `${who(m[1])} flank unit ${{ 東: 'East', 西: 'West', 南: 'South', 北: 'North' }[m[2]]} ${num(m[3])}`],
  ["上杉政虎の軍", "Uesugi Masatora’s army"], ["北条氏康の軍", "Hojo Ujiyasu’s army"],
  ["上杉政虎の軍　8,000人", "Uesugi Masatora’s army: 8,000"], ["北条氏康の軍　10,000人", "Hojo Ujiyasu’s army: 10,000"],
  ["川中島から戻った上杉政虎は、ふたたび関東へ出た。武田と結んだ北条氏康が、武蔵の北へ兵を出してくる。", "Back from Kawanakajima, Uesugi Masatora marches into the Kanto again. Hojo Ujiyasu, allied with Takeda, is sending troops into northern Musashi."],

  // ---- 組頭・手・旗本（名は表の通り。表に無い名は日本語のまま残して見張りに出す） ----
  [/^(.+?)の組頭(?: (.+))?$/, (m) => { const a = NM[m[1]], b = m[2] === undefined ? '' : NM[m[2]]; if (a === undefined || b === undefined) return undefined; return `${a} squad leader${b ? ' ' + b : ''}`; }],
  ["上杉の二の備", "Uesugi second unit"], ["上杉の旗本", "Uesugi guard"],
  ["坂の上の新手", "Fresh troops on the slope"], ["上の曲がりから新手じゃ！　踏みとどまれ！", "Fresh troops from the upper bend! Hold your ground!"],
  ["砦の裏の手", "Force behind the fort"], ["砦の裏からも出て来る！　止まるな！", "They are coming from behind the fort too! Keep moving!"],
  ["木曽の二の手", "Kiso second force"], ["木曽の二の手が坂を下りて来る！", "Kiso’s second force is coming down the slope!"],
  ["柵の陰から鉄砲衆！　身を低く！", "Arquebusiers behind the fence! Keep low!"], ["脇の尾根に人影！　伏せじゃ！", "Figures on the side ridge! Get down!"],
  ["坑口は守った。傷を縛って、柵へかかるぞ", "The mine mouth is held. Bind your wounds, then on to the fence"],
  ["大手の口は取った。傷を縛れ、井楼の下へ回るぞ", "The main gate is ours. Bind your wounds, then around to the base of the watchtower"],
  ["井楼は守った。傷を縛れ、西の丸へかかるぞ", "The watchtower is held. Bind your wounds, then on to the western enclosure"],
  ["息を継げ、傷を縛れ。次が来るぞ", "Catch your breath and bind your wounds. The next wave is coming"],
  ["見張りは破った。傷を縛れ、柵へかかる", "The lookouts are broken. Bind your wounds, then on to the fence"],
  ["柵の前は取った。息を継げ、傷を縛れ", "The ground before the fence is ours. Catch your breath and bind your wounds"],
  ["伏せは押し返した。傷を縛れ、退き口へ", "The ambush is pushed back. Bind your wounds and head for the retreat road"],
  ["大手は持たせた。傷を縛れ、二の丸の塀へ回るぞ", "The main gate holds. Bind your wounds, then around to the second enclosure wall"],
  ["本丸へ退け。傷を縛れ。最後はここで迎える", "Fall back to the keep. Bind your wounds. We make our last stand here"],
  ["追手は止めた。傷を縛れ。次は道の口じゃ", "The pursuers are stopped. Bind your wounds. The mouth of the road is next"],
  ["まだ斬られに来るか……いや、押せ！", "Still coming to be cut down... no, push them back!"],
  ["武田の最後の者どもじゃ！　残らず討て！", "The last of Takeda’s men! Cut them all down!"],
  ["数で押し通せ！", "Push through with numbers!"],
  ["追手の二の手", "Second pursuit force"], ["道の口の新手", "Fresh troops at the road mouth"], ["里の裏の山からも来る！", "They are coming from the hill behind the village too!"],
  ["里の裏の手", "Force behind the village"], ["田野の三の手", "Third force at Tano"], ["小宮山友晴", "Komiyama Tomoharu"], ["小宮山友晴の手", "Komiyama Tomoharu’s force"],
  ["行軍の列", "Marching column"], ["後ろの城兵", "Garrison behind"], ["業盛の旗本", "Narimori’s guard"],
  ["与平殿", "Lord Yohei"],
  // ---- 城下・結果の札の残り（共通の字。En で一度も出なかった物） ----
  ["組に酒を振る舞う", "Treat your squad to sake"], ["始めの組の士気 +10", "Starting squad morale +10"], ["振る舞う", "Treat them"], [/^(\d+)貫で振る舞う$/, (m) => `Treat them for ${m[1]} kan`], ["組に加わる", "Joins your squad"],
  ["組の者を鍛える", "Drill your squad"], ["組の強さ +8%（練度 +1）", "Squad strength +8% (training +1)"], ["鍛える", "Drill"], [/^槍の威力 (\d+)% → (\d+)%$/, (m) => `Spear power ${m[1]}% → ${m[2]}%`],
  ["装備変更", "Change gear"], ["後日譚を読む", "Read the aftermath"], ["50未満では昇進できない。上官と話して挽回を", "Below 50 you cannot be promoted. Talk to your superior to win him back"], ["（50未満では昇進できない）", "(cannot be promoted below 50)"],
  // ---- 両軍の名と人数「名　3,000人」→「Name: 3,000」（名は表で引く。引けなければ日本語のまま） ----
  [/^(.+?)　([\d,]+)人$/, (m, tr) => { const e = tr(m[1]); if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(e)) return undefined; return `${e}: ${m[2]}`; }],
  ["峠の上の北条", "Hojo on the pass"],
  [/^(.+?)の組頭(?: (.+?))?[、 ]*slain!$/, (m) => { const a = NM[m[1]], b = m[2] === undefined ? '' : NM[m[2]]; if (a === undefined || b === undefined) return undefined; return `${a} squad leader${b ? ' ' + b : ''} slain!`; }],
];
