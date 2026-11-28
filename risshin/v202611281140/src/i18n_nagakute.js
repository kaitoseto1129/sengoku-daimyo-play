// K516 英語版：長久手の戦い（豊臣編 t03b_nagakute）の画面に出る字
//   （任務の一行・ピンの名・武将と隊の名・結果の札・幕の字・戦の説明）。
//   英語の時だけ b_t03b_nagakute.js から読む（日本語の時は読まない・重さ0）。
//   台詞は戦では字幕を出さないので入れない。人の名はローマ字（姓・名の順）。クラウド 長久手の持ち主 11/21。
export default [
  // 戦の名・幕・時
  ['小牧・長久手 二', 'Komaki-Nagakute II'],
  ['長久手　羽柴軍敗北', 'Nagakute: the Hashiba army is beaten'],
  ['長久手 羽柴軍敗北', 'Nagakute: the Hashiba army is beaten'],
  ['細ヶ根まで退く', 'Fall back to Hosogane'],
  ['天正十二年四月九日　朝・初夏', 'May 1584. Morning, early summer'],
  ['三河へ回り込む中入りの列。白山林の東の徳川の番所を焼き、道を開く。',
    'The raiding column swings around toward Mikawa. Burn the Tokugawa outpost east of Hakusanbayashi and open the road.'],
  ['追う側から追われる側へ。前と横から押し包まれる', 'The hunters become the hunted. Enemies close in from the front and side'],
  ['兵を連れて退いた', 'You fell back with your men'],
  ['生きて退いた', 'You fell back alive'],
  ['細ヶ根まで生きて退いた', 'You reached Hosogane alive'],
  ['結果へ進む', 'Go to results'],
  ['小牧で家康とにらみ合う中、池田恒興の策で、池田恒興・元助、森長可、堀秀政、三好信吉（秀吉の甥。翌年に羽柴秀次と名を改める）のおよそ二万が、家康の留守の三河を突こうと東へ回り込んだ（中入り）。家康はこれを知って小牧山を出て追い、四月九日の朝、白山林で休んでいた信吉の隊を後ろと横から襲って崩した。信吉は馬を失いながら逃れた。堀秀政は檜ヶ根で鉄砲を揃えて追手を押し返したが、家康の本隊が池田・森の後ろへ回ったと知って退いた。家康と信雄は堀と池田・森の間の御旗山（富士ヶ根）に金扇の馬印を立てて本陣を置き、井伊直政の赤備えらを前に出した。長久手で池田・森の勢は前と横から押し包まれ、森長可は眉間を撃たれ、池田元助は安藤直次に、恒興は永井直勝に討たれた。秀吉は戦では家康に勝てず、この年の十一月に信雄と和睦し、家康とも手を結んだ。白山林・檜ヶ根・仏ヶ根の間隔と向きは縮めた復元で、主人公の組の動きは遊びのための筋書き。檜ヶ根に柵・堀を築いた記述は無いので置かない。香流川の流れと仏ヶ根の西の田は地形の写しの推定。',
    'While Hideyoshi and Ieyasu faced each other at Komaki, Ikeda Tsuneoki proposed a raid. About 20,000 men under Ikeda Tsuneoki and Motosuke, Mori Nagayoshi, Hori Hidemasa and Miyoshi Nobuyoshi (Hideyoshi\'s nephew, later Hashiba Hidetsugu) swung east to strike Mikawa while Ieyasu was away. Ieyasu learned of it, left Mount Komaki and gave chase. On the morning of the 9th day of the 4th month, he struck Nobuyoshi\'s resting troops at Hakusanbayashi from behind and the side. Nobuyoshi lost his horse but escaped. Hori Hidemasa lined up his guns at Hinokigane and drove the pursuers back, but fell back when he learned that Ieyasu\'s main army had moved behind Ikeda and Mori. Ieyasu and Nobukatsu set up camp with the golden fan standard on Mount Mihata between them, and sent Ii Naomasa\'s Red Devils forward. At Nagakute the Ikeda and Mori troops were surrounded from the front and side. Mori Nagayoshi was shot in the forehead, Ikeda Motosuke fell to Ando Naotsugu, and Tsuneoki to Nagai Naokatsu. Hideyoshi could not beat Ieyasu in battle, and in the 11th month he made peace with Nobukatsu and came to terms with Ieyasu. The distances and directions between Hakusanbayashi, Hinokigane and Hotokegane are scaled down, and your unit\'s moves are written for the game. No record says Hinokigane had fences or moats, so none are placed. The Kanare River and the fields west of Hotokegane are guessed from the land data.'],

  // 任務（右上の一行）
  ['三河への道で徳川方の番所を焼く', 'Burn the Tokugawa outpost on the road to Mikawa'],
  ['白山林で信吉様の陣を守る', 'Guard Lord Nobuyoshi\'s camp at Hakusanbayashi'],
  ['信吉様と西の檜ヶ根の堀様の陣へ走る', 'Run west with Lord Nobuyoshi to Lord Hori\'s camp at Hinokigane'],
  ['檜ヶ根の丘で榊原の手を通さない', 'Hold the Hinokigane hill against Sakakibara\'s troops'],
  ['仏ヶ根の森長可様の旗まで走る', 'Run to Lord Mori Nagayoshi\'s banner at Hotokegane'],
  ['南の仏ヶ根で井伊の赤備えを食い止める', 'Stop Ii\'s Red Devils at Hotokegane to the south'],
  ['仏ヶ根の池田勝入様の旗本へ駆けつける', 'Rush to Lord Ikeda Shonyu\'s guard at Hotokegane'],
  ['西の細ヶ根の堀様の旗まで退く', 'Fall back west to Lord Hori\'s banner at Hosogane'],
  [/^持ち場の守り (\d+)／(\d+)秒$/, (m) => `Hold your post ${m[1]}/${m[2]} s`],

  // 手柄・負け
  ['三河への道の徳川の番所を焼いた', 'Burned the Tokugawa outpost on the road to Mikawa'],
  ['徳川の番所を焼いた', 'Burned the Tokugawa outpost'],
  ['白山林で信吉様の陣を守った', 'Guarded Lord Nobuyoshi\'s camp at Hakusanbayashi'],
  ['信吉様と檜ヶ根まで走った', 'Ran with Lord Nobuyoshi to Hinokigane'],
  ['檜ヶ根で追手を押し返した', 'Drove back the pursuers at Hinokigane'],
  ['堀様の陣を破られた', 'Lord Hori\'s camp was broken'],
  ['赤備えに囲まれた', 'Surrounded by the Red Devils'],
  [/^兵(\d+)人を連れて細ヶ根まで退いた$/, (m) => `Fell back to Hosogane with ${m[1]} men`],

  // ピン・場所
  ['信吉様の陣', 'Lord Nobuyoshi\'s camp'],
  ['堀秀政様の旗', 'Lord Hori Hidemasa\'s banner'],
  ['堀秀政様の陣', 'Lord Hori Hidemasa\'s camp'],
  ['森長可様の旗', 'Lord Mori Nagayoshi\'s banner'],
  ['池田勝入様の旗本', 'Lord Ikeda Shonyu\'s guard'],
  ['檜ヶ根の丘', 'Hinokigane hill'],
  ['徳川の番所', 'Tokugawa outpost'],

  // 軍・武将・隊
  ['羽柴勢　二万', 'Hashiba army: 20,000'],
  ['徳川・信雄勢　一万四千', 'Tokugawa and Nobukatsu army: 14,000'],
  ['羽柴勢（中入り）', 'Hashiba army (raiding column)'], ['羽柴（中入り）', 'Hashiba (raiding column)'],
  ['徳川・信雄', 'Tokugawa and Nobukatsu'], ['徳川・織田信雄勢', 'Tokugawa and Oda Nobukatsu army'], ['徳川勢', 'Tokugawa army'],
  ['三好信吉', 'Miyoshi Nobuyoshi'], ['三好信吉の馬廻', 'Miyoshi Nobuyoshi\'s horse guard'],
  ['信吉隊', 'Nobuyoshi\'s unit'], ['信吉隊の先手', 'Nobuyoshi\'s vanguard'], ['信吉隊の足軽', 'Nobuyoshi\'s foot soldiers'],
  ['中入りの列の後尾', 'Rear of the raiding column'],
  ['堀秀政', 'Hori Hidemasa'], ['堀秀政の手', 'Hori Hidemasa\'s troops'],
  ['森長可', 'Mori Nagayoshi'], ['森長可の旗本', 'Mori Nagayoshi\'s guard'],
  ['池田恒興', 'Ikeda Tsuneoki'], ['池田恒興の旗本', 'Ikeda Tsuneoki\'s guard'],
  ['池田元助', 'Ikeda Motosuke'], ['池田元助の先手', 'Ikeda Motosuke\'s vanguard'],
  ['池田勢の落ち武者', 'Fleeing Ikeda soldiers'],
  ['徳川家康', 'Tokugawa Ieyasu'], ['徳川家康の旗本', 'Tokugawa Ieyasu\'s guard'], ['徳川家康の旗本の先手', 'Vanguard of Tokugawa Ieyasu\'s guard'],
  ['織田信雄', 'Oda Nobukatsu'], ['織田信雄の旗本', 'Oda Nobukatsu\'s guard'],
  ['井伊直政', 'Ii Naomasa'], ['井伊の赤備え', 'Ii\'s Red Devils'],
  ['榊原康政', 'Sakakibara Yasumasa'], ['榊原康政の手', 'Sakakibara Yasumasa\'s troops'],
  ['大須賀康高', 'Osuga Yasutaka'], ['大須賀康高の手', 'Osuga Yasutaka\'s troops'],
  ['丹羽氏次', 'Niwa Ujitsugu'], ['丹羽氏次の手', 'Niwa Ujitsugu\'s troops'],
  ['水野忠重', 'Mizuno Tadashige'], ['水野忠重の手', 'Mizuno Tadashige\'s troops'], ['水野忠重の鉄砲組', 'Mizuno Tadashige\'s gunners'],
  ['徳川の物見', 'Tokugawa scouts'], ['番所の守り', 'Outpost guards'], ['番所の加勢', 'Outpost reinforcements'],
  ['長蛇', 'Long column'], ['横並び', 'Line abreast'],
  // 行き先の▼の札の名（goals5.js goalNoun が任務の字の頭から切り出す名。英語の時に日本語で残った・en_left_probe 11/21）
  ['三河', 'Mikawa'], ['白山林で信吉様の陣', 'Lord Nobuyoshi\'s camp'], ['細ヶ根', 'Hosogane'], ['檜ヶ根', 'Hinokigane'],
  ['仏ヶ根', 'Hotokegane'], ['白山林', 'Hakusanbayashi'], ['御旗山', 'Mihatayama'], ['勝入様の旗本', 'Lord Shonyu\'s guard'],
  ['赤備え', 'Ii\'s Red Devils'], ['岩崎城', 'Iwasaki Castle'], ['堀様の陣', 'Lord Hori\'s camp'],
  // 布陣の表の備の名（fujin_layout.js t03b_nagakute の blk。末の一〜三は i18n.js の決まりで数字に）。11/28 クラウド 長久手の持ち主（k516_gate ?lang=en 600秒で戦の中に十残った）
  ['堀秀政の後ろの備', "Hori Hidemasa's rear unit"], ['堀の北の二の手', "Hori's north second unit"],
  ['羽柴の殿の北の備', 'Hashiba rearguard (north)'], ['羽柴の殿の南の備', 'Hashiba rearguard (south)'],
  ['羽柴の中ほどの南の備', 'Hashiba center (south)'], ['森長可の後ろの備', "Mori Nagayoshi's rear unit"],
  ['池田元助の後ろの備', "Ikeda Motosuke's rear unit"], ['池田恒興の東の備', "Ikeda Tsuneoki's east unit"],
  ['秀次の陣の北の備', "Hidetsugu's camp (north unit)"], ['徳川の北東の備', 'Tokugawa northeast unit'],
  ['大須賀の後ろの備', "Osuga's rear unit"], ['徳川の東南の備', 'Tokugawa southeast unit'],
  ['榊原の備', "Sakakibara's unit"], ['水野の後ろの備', "Mizuno's rear unit"],
  ['信雄の南の備', "Nobukatsu's south unit"], ['徳川の南の備', 'Tokugawa south unit'],
  ['本多忠勝の駆けつけの備', "Honda Tadakatsu's relief unit"], ['信雄の本陣の備', "Nobukatsu's HQ unit"],
  ['水野の一の備', "Mizuno's first unit"],
];
