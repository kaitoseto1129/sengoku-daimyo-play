// K516 英語版：オンラインの画面（online/ のホーム・家を選ぶ・軍団の編成・布陣・命令・戦術・武将登用・金を足す）の字の英訳。
//   英語の時だけ i18n.js から読む（日本語の時は読まない・重さ0）。クラウド k365-cloud-15 11/21。
//   online/*.js の日本語の字を抜き出して訳した（約270）。名は人の名をローマ字で（長音は ō・ū）。短く、やさしい英語で。
//   数や名の入る字は [正規表現, (m, tr) => 英語] の形で渡す（i18n.js の PAT へ）。
const NAMES = [
  ['織田信長', 'Oda Nobunaga'], ['武田信玄', 'Takeda Shingen'], ['上杉謙信', 'Uesugi Kenshin'], ['徳川家康', 'Tokugawa Ieyasu'],
  ['毛利元就', 'Mōri Motonari'], ['島津義久', 'Shimazu Yoshihisa'], ['豊臣秀吉', 'Toyotomi Hideyoshi'], ['真田信繁', 'Sanada Nobushige'],
  ['柴田勝家', 'Shibata Katsuie'], ['山県昌景', 'Yamagata Masakage'], ['本多忠勝', 'Honda Tadakatsu'], ['島津家久', 'Shimazu Iehisa'],
  ['島津義弘', 'Shimazu Yoshihiro'], ['吉川元春', 'Kikkawa Motoharu'], ['柿崎景家', 'Kakizaki Kageie'], ['黒田官兵衛', 'Kuroda Kanbei'],
  ['馬場信春', 'Baba Nobuharu'], ['小早川隆景', 'Kobayakawa Takakage'], ['明智光秀', 'Akechi Mitsuhide'], ['伊達政宗', 'Date Masamune'],
  ['前田利家', 'Maeda Toshiie'], ['榊原康政', 'Sakakibara Yasumasa'], ['酒井忠次', 'Sakai Tadatsugu'], ['内藤昌豊', 'Naitō Masatoyo'],
  ['斎藤朝信', 'Saitō Tomonobu'], ['島津歳久', 'Shimazu Toshihisa'], ['長宗我部信親', 'Chōsokabe Nobuchika'], ['滝川一益', 'Takigawa Kazumasu'],
  ['丹羽長秀', 'Niwa Nagahide'], ['井伊直政', 'Ii Naomasa'], ['武田勝頼', 'Takeda Katsuyori'], ['直江兼続', 'Naoe Kanetsugu'],
  ['真田昌幸', 'Sanada Masayuki'], ['加藤清正', 'Katō Kiyomasa'], ['木下藤吉郎', 'Kinoshita Tōkichirō'], ['甘粕景持', 'Amakasu Kagemochi'],
  ['毛利隆元', 'Mōri Takamoto'], ['佐久間信盛', 'Sakuma Nobumori'], ['森可成', 'Mori Yoshinari'], ['佐々成政', 'Sassa Narimasa'],
  ['高坂昌信', 'Kōsaka Masanobu'], ['武田信繁', 'Takeda Nobushige'], ['本庄繁長', 'Honjō Shigenaga'], ['鳥居元忠', 'Torii Mototada'],
  ['大久保忠世', 'Ōkubo Tadayo'], ['口羽通良', 'Kuchiba Michiyoshi'], ['新納忠元', 'Niiro Tadamoto'], ['蒲生氏郷', 'Gamō Ujisato'],
  ['金森長近', 'Kanamori Nagachika'], ['河尻秀隆', 'Kawajiri Hidetaka'], ['小山田信茂', 'Oyamada Nobushige'], ['土屋昌続', 'Tsuchiya Masatsugu'],
  ['安田長秀', 'Yasuda Nagahide'], ['色部勝長', 'Irobe Katsunaga'], ['平岩親吉', 'Hiraiwa Chikayoshi'], ['渡辺守綱', 'Watanabe Moritsuna'],
  ['熊谷信直', 'Kumagai Nobunao'], ['児玉就忠', 'Kodama Naritada'], ['伊集院忠棟', 'Ijūin Tadamune'], ['樺山忠助', 'Kabayama Tadasuke'],
];
const HOUSE = [
  ['織田', 'Oda'], ['武田', 'Takeda'], ['上杉', 'Uesugi'], ['徳川', 'Tokugawa'], ['毛利', 'Mōri'], ['島津', 'Shimazu'], ['諸家', 'Other clans'],
  ['織田家', 'Oda clan'], ['武田家', 'Takeda clan'], ['上杉家', 'Uesugi clan'], ['徳川家', 'Tokugawa clan'], ['毛利家', 'Mōri clan'], ['島津家', 'Shimazu clan'],
];
const WORDS = [
  // 兵種の型・隊の様子
  ['標準', 'Standard'], ['敗走', 'Routed'], ['槍重視', 'Spear-heavy'], ['守備重視', 'Defensive'], ['鉄砲重視', 'Gun-heavy'], ['騎馬重視', 'Cavalry-heavy'],
  // 命令の一字（釦）と言葉
  ['進', 'Go'], ['攻', 'Attack'], ['此', 'Here'], ['追', 'Chase'], ['止', 'Stop'], ['守', 'Hold'], ['集', 'Rally'], ['退', 'Retreat'],
  ['後退中', 'Falling back'], ['前進', 'Advance'], ['攻撃', 'Attack'], ['ここへ', 'Move here'], ['追撃', 'Pursue'], ['停止', 'Stop'],
  ['防御', 'Defend'], ['再集合', 'Regroup'], ['退却', 'Retreat'], ['命令', 'Orders'],
  // 布陣
  ['布陣', 'Deployment'], ['自陣', 'Your side'], ['本陣', 'Headquarters'], ['この布陣で出陣', 'Go to battle with this deployment'], ['置き直す', 'Place again'],
  ['駒を指で動かし、矢じりをなぞって向きを決める。下の釦で陣形', 'Drag a piece to move it. Trace the arrow to turn it. Pick a formation below'],
  ['後方', 'Rear'], ['中央', 'Center'], ['側方', 'Flank'], ['置けた', 'Placed'], ['本陣の区域に置いてください', 'Place it inside the headquarters area'],
  ['横陣', 'Line'], ['縦陣', 'Column'], ['魚鱗', 'Wedge'], ['鶴翼', 'Crane wing'], ['長蛇', 'Long snake'], ['方円', 'Circle'],
  ['正面が広い・向きを変えるのは遅い', 'Wide front. Slow to turn'], ['進むのが速い・正面は狭い', 'Moves fast. Narrow front'],
  ['一点を破る・横を回られやすい', 'Breaks one point. Easy to flank'], ['包む・中が薄い', 'Surrounds. Thin in the middle'],
  ['細い道を抜ける・横から突かれると弱い', 'Gets through narrow roads. Weak from the side'], ['どの向きにも構える・前へは遅い', 'Faces every way. Slow to advance'],
  // 武将の考え・隊の様子
  ['積極攻撃', 'Aggressive'], ['慎重', 'Careful'], ['機動', 'Mobile'], ['戦術', 'Tactics'], ['命令に忠実', 'Follows orders'],
  ['立て直し', 'Reforming'], ['本陣の防衛', 'Guarding HQ'], ['疲れて休む', 'Resting'], ['弾を取りに戻る', 'Getting ammo'], ['撃つ', 'Firing'],
  ['味方の救援', 'Helping allies'], ['疲れた敵へ新手', 'Fresh troops on tired foes'], ['予備', 'Reserve'], ['斬り合い', 'Melee'], ['側面', 'Flank attack'],
  ['高所を取る', 'Taking high ground'], ['誘い', 'Luring'], ['敵が見えない', 'No enemy in sight'], ['寄せる', 'Closing in'], ['受ける', 'Holding'],
  ['持ち場', 'At post'], ['前へ', 'Forward'], ['混乱', 'Confused'], ['予備待機', 'Waiting in reserve'],
  // 軍団の編成
  ['軍団の編成', 'Army setup'], ['戻る', 'Back'], ['武将の重さ', 'General cost'], ['総大将と三人', 'Commander and three'], ['手持ちの武将', 'Your generals'],
  ['空き', 'Empty'], ['兵種の型', 'Troop type'], ['総大将', 'Commander'], ['左翼', 'Left wing'], ['右翼', 'Right wing'], ['後詰', 'Rear guard'], ['・軍団', ' army'],
  // 家を選ぶ・ホーム
  ['家を選ぶ', 'Choose a clan'], ['六つの家', 'Six clans'], ['オンラインのホーム', 'Online home'], ['オンラインの部品がまだ無い', 'Online is not ready yet'],
  // 模擬合戦・結果
  ['平原', 'Plain'], ['川と橋', 'River and bridge'], ['模擬合戦', 'Practice battle'], ['本陣が崩れた', 'Headquarters fell'], ['全軍が崩れた', 'Whole army broke'],
  ['時間切れの判定', 'Decided at time up'], ['引き分け', 'Draw'], ['負け', 'Defeat'], ['降伏した', 'Surrendered'],
  // 戦術
  ['鉄砲集中運用', 'Massed guns'], ['込めた鉄砲隊が二つ以上・七十m 内に敵', 'Two or more loaded gun units. Enemy within 70m'],
  ['釣り野伏', 'Fake retreat ambush'], ['退く隊を敵が追い・横に伏兵の隊・士気五十以上', 'Enemy chases a retreating unit. Ambush unit at the side. Morale 50 or more'],
  ['真田の備え', 'Sanada defense'], ['柵・塀・土塁の十二m 内で守る隊（45秒・士気の下限30・込め5%速い）', 'Units holding within 12m of fences, walls or earthworks (45 s, morale stays 30 or more, reload 5% faster)'],
  ['予備投入', 'Send in reserves'], ['士気の落ちた備と、まだ戦っていない控えの隊', 'A shaken unit and a fresh reserve unit'],
  ['連続攻勢', 'Rolling attack'], ['敵と当たっている備と、八十m 内の空いた備', 'A unit in contact and a free unit within 80m'],
  ['猛攻', 'All-out attack'], ['敵へ進む・当たっている槍の隊', 'Spear units advancing on or fighting the enemy'],
  ['赤備突撃', 'Red Guard charge'], ['空いた騎馬の隊と、味方と当たっている敵の隊が六十m 内', 'A free cavalry unit, and an enemy fighting your troops within 60m'],
  ['軍師', 'Strategist'], ['いつでも（1試合1回）', 'Any time (once per match)'], ['鉄砲の指揮', 'Gun command'], ['槍の備え', 'Spear line'],
  ['戦術が無い', 'No tactics'], ['使い切った', 'Used up'], ['間を置く', 'Cooling down'], ['込めた鉄砲隊が足りない', 'Not enough loaded gun units'],
  ['退く隊・追う敵・伏兵がそろわない', 'Need a retreating unit, a chasing enemy and an ambush unit'], ['柵・塀の近くで守る隊がいない', 'No unit holding near a fence or wall'],
  ['押された備か控えがいない', 'No shaken unit or reserve'], ['当たっている備と空いた備がそろわない', 'Need a unit in contact and a free unit'],
  ['進む槍の隊がいない', 'No advancing spear unit'], ['空いた騎馬か、当たっている敵がいない', 'No free cavalry or no enemy in contact'], ['隊がいない', 'No units'],
  // 武将登用・券・金
  ['S 以上の選択券', 'S or better choice ticket'], ['SS 確定券', 'SS guaranteed ticket'], ['SS の選択券', 'SS choice ticket'], ['初陣の備え', 'First battle pack'],
  ['A 以上の登用券 1', 'A or better recruit ticket ×1'], ['陣幕 1', 'Camp curtain ×1'], ['月次の軍資金', 'Monthly war funds'], ['シーズンの帳', 'Season pass'],
  ['シーズンの帳（上）', 'Season pass (premium)'], ['武将登用', 'Recruit generals'], ['A 以上の登用券', 'A or better recruit ticket'], ['金を足す', 'Add gold'], ['閉じる', 'Close'],
  ['登用の頼み状', 'Recruiting letter'], ['使って登用する', 'Use it to recruit'], ['武将を選んで登用する', 'Choose a general to recruit'],
  ['登用の券はまだありません。有料の登用 30・80・120回で券が届きます。', 'No recruit tickets yet. Paid recruits give tickets at 30, 80 and 120 pulls.'],
  ['登用', 'Recruit'], ['頼み状の武将', 'Featured general'], ['持っている（武将印へ）', 'Owned (turns into a general seal)'], ['今回は見送り', 'Skip this time'],
  ['書状', 'Letter'], ['書状を開く', 'Open the letter'], ['おすすめを自動で選ぶ', 'Pick the best for me'], ['次の組へ', 'Next set'], ['登用を終える', 'Finish recruiting'],
  ['十回登用の結果', '10-pull results'], ['確率と天井', 'Odds and pity'], ['登用する武将を選ぶ', 'Choose a general to recruit'], ['・持っている', ' · owned'], ['登用した', 'Recruited'],
  // 画面の札の中の字（>…< の間）
  ['この家で始める', 'Start with this clan'], ['この軍で決める', 'Use this army'], ['一人あたり', 'Per general'], ['一人ごと', 'Each'], ['一回登用', '1 pull'],
  ['三人のどれかに', 'One of three'], ['人数', 'Count'], ['十回登用', '10 pulls'], ['合戦', 'Battle'], ['回', 'pulls'],
  ['支払いは App Store で行います。買った金は登用だけに使えます。戦の強さは買えません。', 'Payment is through the App Store. Gold you buy is only for recruiting. You cannot buy battle strength.'],
  ['書状を三通開き、三人から一人を登用します。登用しなかった二人は、今回は見送り。', 'Open three letters and recruit one of the three. The other two are skipped this time.'],
  ['格', 'Rank'], ['武将', 'Generals'], ['無料で登用', 'Recruit for free'], ['登用の間へ戻る', 'Back to recruiting'], ['腕比べ', 'Contest'],
  ['買わずに戻る', 'Go back without buying'], ['軍団', 'Army'], ['選ばずに戻る', 'Go back without choosing'], ['重なった武将は武将印になります。', 'Duplicate generals become general seals.'],
];
const PATS = [
  [/^(.+)の備$/, (m, tr) => `${tr(m[1])} unit`],
  [/^(.+)の騎馬$/, (m, tr) => `${tr(m[1])} cavalry`],
  [/^(.+)で始める$/, (m, tr) => `Start as ${tr(m[1])}`],
  [/^家：(.+)$/, (m, tr) => `Clan: ${tr(m[1])}`],
  [/^(.+)の確定券$/, (m, tr) => `${tr(m[1])} guaranteed ticket`],
  [/^(.+)確定まで 残り (\d+)回$/, (m, tr) => `${m[2]} pulls until ${tr(m[1])} is guaranteed`],
  [/^戦術可能　(.+)$/, (m, tr) => `Tactic ready: ${tr(m[1])}`],
  [/^十回登用　(\d+)／(\d+)組$/, (m) => `10-pull  set ${m[1]} of ${m[2]}`],
  [/^書状 (\d+)$/, (m) => `Letter ${m[1]}`],
  [/^(.+)が届いた$/, (m, tr) => `Received: ${m[1].split('・').map((x) => tr(x)).join(', ')}`],
  [/^おすすめ（(.+)）を登用する$/, (m, tr) => `Recruit the pick (${tr(m[1])})`],
  [/^無料 (\d+)／(\d+)$/, (m) => `Free ${m[1]}/${m[2]}`],
  [/^(.+)（(\d+)枚）$/, (m, tr) => `${tr(m[1])} (${m[2]})`],
  [/^(\d+)回＝(.+)$/, (m, tr) => `${m[1]} pulls = ${tr(m[2])}`],
  [/^無料の登用（毎日(\d+)回・毎日の務めで(\d+)回）$/, (m) => `Free recruits (${m[1]} a day, ${m[2]} more from daily tasks)`],
  [/^(.+)（一度だけ）$/, (m, tr) => `${tr(m[1])} (one time only)`],
  [/^初めての時は ＋(\d+)$/, (m) => `+${m[1]} the first time`],
  [/^金 ([\d,]+)(・.*)?$/, (m, tr) => `Gold ${m[1]}${m[2] ? ' · ' + m[2].slice(1).split('、').map((x) => tr(x)).join(', ') : ''}`],
  [/^重さ(\d+)$/, (m) => `Cost ${m[1]}`],
  [/^重さ(\d+)\/(\d+)$/, (m) => `Cost ${m[1]}/${m[2]}`],
  [/^SS が出た時、その半分は (.+)。(.+)を登用せずに (\d+)回で、(.+)の確定券が届きます。$/, (m, tr) => `When an SS appears, half the time it is ${tr(m[1])}. If you do not get ${tr(m[2])} in ${m[3]} pulls, you receive a ${tr(m[4])} guaranteed ticket.`],
  // 「名・ランク・重さN」「軍団の編成・名・名・重さN/M」のような・区切り
  [/^軍団の編成・(.+)$/, (m, tr) => `Army: ${m[1].split('・').map((x) => tr(x)).join(' · ')}`],
];
// 「家・武将・武将…」の読み上げの名（家を選ぶ札の aria-label など）：全部の区切りが表にある時だけ英語にする（一つでも残れば i18n.js が捨てる）
PATS.push([/^([^・]+家)・(.+)$/, (m, tr) => [m[1], ...m[2].split('・')].map((x) => tr(x)).join(', ')]);
export default [...NAMES, ...HOUSE, ...WORDS, ...PATS];
