// 資料本第三組の全57枚を見て選んだ当世具足。写真のない人の組み合わせは復元案。
// 名簿・史実の参戦表・城攻めの城主を網羅。別名は同じ具足を使う。
// [名、鉢、立物、胴の色、威、胴の作り、陣羽織、面頬、家紋、写真の番号]。
// 10/28：同じ見た目の武将を二人作らない。鉢・立物・白熊が同じなら、威・陣羽織・胴の色のどれかを大きく（色の差55以上）変える。
// 写真と出典のある人を先に決め、裏付けの無い人は名の重い順に、威と陣羽織を伝統の色（紺・縹・萌黄・紫・緋・朽葉など）から選んだ復元案。
export const KACCHU = {};
for (const [name, bowl, crest, armor, lace, doStyle, haori, menpo, mon, ref] of [
  // 稲生の参戦者。所用具足・立物・個人紋は未確認。筋兜と毛引威の復元で補う。
  // 佐久間大学は信盛と、佐々孫介は成政と、黒田半平は官兵衛と取り違えない。
  ["佐久間大学", "suji", "none", 0x22241e, 0x4a7a86, "kebiki", 0, 0, "none", ""],
  ["佐々孫介", "suji", "none", 0x22241e, 0x6a7a2c, "kebiki", 0, 0, "none", ""],
  ["黒田半平", "suji", "none", 0x22241e, 0x9a2e20, "kebiki", 0, 0, "none", ""],
  ["林美作守", "suji", "none", 0x834031, 0x8b503b, "kebiki", 0, 0, "none", ""],
  ["宮井勘兵衛", "suji", "none", 0x88432f, 0x2e3a52, "kebiki", 0, 0, "none", ""],
  // 建勲神社伝来の伝信長所用・紺糸威胴丸を参考にした復元案。刀根坂での着用は未確認。
  // 京都国立博物館「紺糸威胴丸 兜・大袖付」：https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
  // 伝来の兜の鍬形と、黒漆地に金の織田木瓜を置いた前立を組み合わせる。長島当日の着用は未確認。
  ["織田信長", "suji", "oda_kuwa", 0x1c1a1a, 0x2e4468, "kebiki", 0, 0, "oda", ""],
  // 田野での立物の着用は未確認。甲冑と威の色は復元案とし、立物は創作しない。
  // 勝頼の所用具足は未確認。武田の紅の威の復元案。肖像は高野山持明院の勝頼像。白熊は信玄だけに付けて二人を見分ける。
  ["武田勝頼", "momonari", "none", 0x1c1a1a, 0x9a2e20, "sugake", 0x1f2a44, 0, "takeda", ""],
  ["上杉謙信", "suji", "kenshin_nichirin", 0x1c1a1a, 0x703d78, "sugake", 0, 0x151312, "uesugi", "2be2dd91"],
  ["北条氏政", "suji", "kuwa", 0x1c1a1a, 0x66513a, "okegawa", 0, 0, "hojo", ""],
  ["三好長治", "suji", "kuwa", 0x1c1a1a, 0x466270, "okegawa", 0, 0, "miyoshi", ""],
  ["毛利輝元", "suji", "kuwa", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0, "mori", ""],
  ["大友宗麟", "suji", "kuwa", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0, "otomo", ""],
  ["島津義久", "suji", "kuwa", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0, "shimazu", ""],
  ["龍造寺隆信", "suji", "kuwa", 0x1c1a1a, 0xa88a3a, "okegawa", 0, 0, "none", ""],
  ["長宗我部元親", "suji", "kuwa", 0x1c1a1a, 0xb0a890, "okegawa", 0, 0, "chosokabe", ""],
  ["伊達輝宗", "zunari", "kuwa", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0, "date", ""],
  ["蘆名盛氏", "zunari", "moon", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["南部晴政", "momonari", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["正木時忠", "eboshi", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["佐竹義重", "zunari", "kuwa", 0x1c1a1a, 0x3c5a8a, "okegawa", 0, 0, "satake", ""],
  // 本の写真（伝家康所用・水牛の脇立の兜）。三方ヶ原・設楽原の姿。歯朶具足（久能山東照宮・伊予札黒糸威胴丸具足）は関ヶ原の頃の物なので使わない。
  ["徳川家康", "namban", "bull", 0x292820, 0x7a5036, "hotoke", 0, 0x9c2e21, "tokugawa", "7f564693"],
  ["本願寺顕如", "suji", "kuwa", 0x2a2420, 0x6a2a5a, "okegawa", 0x4a2a4a, 0, "none", ""],
  ["鈴木佐大夫", "namban", "horn", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["河野通宣", "suji", "cross", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["宇都宮広綱", "zunari", "shida", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["宗義調", "momonari", "bellflower", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["大崎義直", "eboshi", "kuwa", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["葛西晴信", "namban", "moon", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["長続連", "suji", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["土持親成", "zunari", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  // 信貴山の将。立物の伝来は未確認で、具足・威・羽織は復元案。
  ["松永久秀", "suji", "none", 0x1c1a1a, 0x6a3a1a, "okegawa", 0x7a1a12, 0, "none", ""],
  ["宇喜多直家", "momonari", "horn", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["波多野秀治", "eboshi", "cross", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["山名祐豊", "namban", "shida", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  // 三木での立物の裏付けは未確認。具足の色と陣羽織は復元案。
  ["別所長治", "suji", "none", 0x24221f, 0x5a2a1c, "okegawa", 0x1f2a44, 0, "none", ""],
  // 岩村の諸将：所用具足・立物の裏付けは未確認。色と胴・鉢は当世具足の復元で、固有の立物を作らない。
  ["織田信忠", "suji", "none", 0x1c1a1a, 0x3c5a8a, "okegawa", 0x6a1a14, 0x1c1a1a, "oda", ""],
  ["織田信雄", "suji", "sun", 0x1c1a1a, 0x3c5a8a, "okegawa", 0x5a1a14, 0x1c1a1a, "oda", ""],
  // 勝家の長島当日の具足・立物は未確認。大鍬形を固有の姿とせず、立物なしの復元案にする。
  // 胴・威・陣羽織の色も復元。雁の紋と伝来の金幣馬印で隊を見分ける。
  ["柴田勝家", "momonari", "none", 0x2c241c, 0x704126, "okegawa", 0x4a3020, 0x2c241c, "kari", ""],
  // 長島での所用具足・立物は未確認。角を固有の印にせず、筋兜と立物なしで復元する。
  // 胴・威・陣羽織の色は復元案。違い筋は丹羽の所属を示し、当日の旗の意匠までは断定しない。
  ["丹羽長秀", "suji", "none", 0x22241e, 0x3a5a3a, "sugake", 0x2e3a2a, 0x22241e, "sujikai", ""],
  // 信盛の立物・具足の細部は未確認。十字を固有の姿にせず、立物なしの復元とする。
  ["佐久間信盛", "suji", "none", 0x2a2420, 0x5a4630, "sugake", 0xcfc8b4, 0, "sakuma", ""],
  // 一益の具足は復元案。羊歯の立物の裏付けは未確認なので、筋兜に立物を付けない。
  ["滝川一益", "suji", "none", 0x1c1a1a, 0x6a6a6a, "kebiki", 0x2a2a32, 0x1c1a1a, "takigawa", ""],
  ["羽柴秀吉", "suji", "toyotomi_horns", 0xa2a19a, 0xe4dfcc, "sugake", 0, 0xa62b1d, "toyotomi", "deb38af9"],
  // 光秀の当日の着用具足は未確認。黒漆の具足は復元案とし、家紋から創作した桔梗の立物は付けない。
  // 兎耳の兜は伝・明智秀満のものなので、光秀へ流用しない。
  ["明智光秀", "suji", "none", 0x1c1a1a, 0x2e3a52, "okegawa", 0x7a1a12, 0x1c1a1a, "akechi", ""],
  // 長島の池田勝三郎。所用具足・立物は未確認で、月を本人固有の姿にしない。
  // 頭形兜・黒漆具足・威と陣羽織の色は復元。揚羽蝶は所属を示す。
  ["池田恒興", "zunari", "none", 0x24221f, 0x2e3a52, "okegawa", 0x7a1a12, 0x24221f, "ageha", ""],
  ["森長可", "zunari", "sun", 0x1c1a1a, 0x2a2a2a, "okegawa", 0x1a1a1a, 0, "tsuru", ""],
  ["前田利家", "namazu", "none", 0xaa914f, 0x554732, "kebiki", 0, 0x302b25, "maeda", "82f4105d"],
  // 長島の佐々蔵介。所用具足・立物は未確認で、角を本人固有の姿として付けない。
  // 頭形兜・黒漆具足・威と陣羽織の色は復元。棕櫚は所属の紋として用いる。
  // 手取川の寄せ手。当日の立物は未確認なので、無立物の復元とする。
  ["佐々成政", "zunari", "none", 0x1c1a1a, 0x9a2e20, "sugake", 0x2a2a2a, 0x1c1a1a, "shuro", ""],
  ["蜂須賀正勝", "zunari", "none", 0x2a1c18, 0x7a2a1c, "sugake", 0x7a1a12, 0x2a1c18, "hachisuka", ""],
  ["黒田官兵衛", "zunari", "none", 0x151312, 0x454347, "hotoke", 0x1a1a1a, 0x151312, "kuroda", ""],
  // 長島の稲葉伊予守。当日の所用具足・立物は未詳。桔梗の立物を固有の姿にしない。
  // 頭形兜・毛引威・陣羽織の色は復元。折敷に三文字は所属の紋として用いる。
  ["稲葉一鉄", "zunari", "none", 0x2a2420, 0x5a4a2a, "kebiki", 0xcfc8b4, 0, "inaba", ""],
  ["細川藤孝", "momonari", "kuwa", 0x24221f, 0x2e3a52, "kebiki", 0x3a3a52, 0x24221f, "oda", ""],
  // 伊賀では当時の通称も登録。日野町の解説では忠三郎賦秀。具足の細部は復元案。
  // https://www.town.shiga-hino.lg.jp/0000003695.html
  ["蒲生忠三郎", "suji", "none", 0x242222, 0xd8d0bc, "okegawa", 0, 0, "none", ""],
  ["蒲生氏郷", "namazu", "bull", 0x242222, 0x493746, "hotoke", 0x3a2a4a, 0x242222, "oda", ""],
  ["河尻秀隆", "momonari", "none", 0x1c1a1a, 0x2a2a2a, "okegawa", 0x2a2622, 0x1c1a1a, "none", ""],
  ["佐久間盛政", "momonari", "kuwa_wide", 0x24221f, 0x3c5a8a, "okegawa", 0x302b32, 0x24221f, "oda", ""],
  // 家紋は三つ盛亀甲に花菱。具足・陣羽織の色と当日の着用は復元案。
  ["堀秀政", "momonari", "none", 0x1c1a1a, 0x2e3a4a, "okegawa", 0x7a1a12, 0, "hori", ""],
  ["荒木村重", "momonari", "cross", 0x24221f, 0x2e3a52, "sugake", 0x2a2a3a, 0x24221f, "oda", ""],
  ["高山右近", "momonari", "shida", 0x24221f, 0x3c5a8a, "sugake", 0, 0x24221f, "oda", ""],
  ["中川清秀", "momonari", "bellflower", 0x24221f, 0x3c5a8a, "sugake", 0, 0x24221f, "oda", ""],
  ["福島正則", "eboshi", "kuwa", 0x1c1a1a, 0x3c5a8a, "kebiki", 0, 0x1c1a1a, "oda", ""],
  // 赤備え：『甲陽軍鑑』に兄飯富虎昌の赤備えを継いだとある。具足と三日月の立物の実物は未確認（復元案）。
  ["山県昌景", "suji", "moon", 0x8e1f16, 0xb8342a, "okegawa", 0x7a1a12, 0x8e1f16, "takeda", ""],
  // 馬場・内藤・高坂の所用具足は未確認。武田の家紋は保ち、立物と威の色は見分けるための復元案。
  ["馬場信春", "suji", "sun", 0x1c1a1a, 0x2a3a5a, "okegawa", 0x2e3a52, 0x1c1a1a, "takeda", ""],
  ["内藤昌豊", "suji", "kuwa_wide", 0x2a2420, 0x7a2a1c, "sugake", 0x4a3a22, 0x2a2420, "takeda", ""],
  ["高坂昌信", "suji", "horn", 0x1c1a1a, 0x9a2e20, "sugake", 0, 0x1c1a1a, "takeda", ""],
  // 真田兄弟の十字・月の立物は未確認。六文銭を使い、主家の武田菱を個人紋にしない復元。
  // 上田市： https://www.city.ueda.nagano.jp/uploaded/attachment/12750.pdf
  ["真田信綱", "suji", "none", 0x1c1a1a, 0x9a2e20, "sugake", 0x3a2622, 0, "sanada", ""],
  ["真田昌幸", "suji", "shida", 0x1c1a1a, 0x9a2e20, "kebiki", 0x2e3a42, 0x1c1a1a, "takeda", ""],
  ["穴山信君", "suji", "bellflower", 0x1c1a1a, 0x9a2e20, "kebiki", 0x2e3a42, 0x1c1a1a, "takeda", ""],
  ["小山田信茂", "zunari", "kuwa", 0x3a2622, 0x9a2e20, "kebiki", 0x3a2a22, 0x3a2622, "takeda", ""],
  // 個人の現存具足を断定せず、参戦する侍大将の復元案。立物は足さない。
  ["小幡信貞", "suji", "none", 0x24221f, 0xa88a3a, "sugake", 0, 0, "takeda", ""],
  ["小笠原長忠", "suji", "none", 0x24221f, 0x5a2a1c, "sugake", 0, 0, "tokugawa", ""],
  ["武田信廉", "zunari", "moon", 0x29251f, 0x9a2e20, "okegawa", 0x2e3a42, 0x29251f, "takeda", ""],
  ["秋山虎繁", "zunari", "none", 0x2a2420, 0x9a2e20, "okegawa", 0x4a5a22, 0, "takeda", ""],
  // 高遠の守将。固有の立物は未確認。武田方の色を保つ推定復元。
  ["仁科盛信", "zunari", "none", 0x3a2622, 0x9a2e20, "okegawa", 0x4a2a5a, 0x3a2622, "takeda", ""],
  ["木曽義昌", "zunari", "horn", 0x29251f, 0x9a2e20, "sugake", 0x4a3a22, 0x29251f, "takeda", ""],
  // 昌恒の立物・具足の確実な記録は未確認。十字を固有の印とせず、立物なしの復元案にする。
  ["土屋昌恒", "zunari", "none", 0x3a2622, 0x9a2e20, "sugake", 0xcfc8b4, 0x3a2622, "takeda", ""],
  ["直江景綱", "suji", "moon", 0x1c1a1a, 0x703d78, "okegawa", 0, 0x1c1a1a, "uesugi", ""],
  ["本庄繁長", "suji", "sun", 0x1c1a1a, 0x703d78, "okegawa", 0, 0x1c1a1a, "uesugi", ""],
  ["上杉景勝", "suji", "manji", 0x242222, 0x35435a, "kebiki", 0, 0x8e3724, "uesugi", "a7c70e25"],
  ["上杉景虎", "suji", "horn", 0x1c1a1a, 0x703d78, "sugake", 0, 0x1c1a1a, "uesugi", ""],
  ["直江兼続", "suji", "cross", 0x1c1a1a, 0x703d78, "sugake", 0x2e3a42, 0, "uesugi", ""],
  ["北条氏照", "suji", "moon", 0x1c1a1a, 0x66513a, "okegawa", 0, 0x1c1a1a, "hojo", ""],
  ["北条氏規", "suji", "sun", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0x1c1a1a, "hojo", ""],
  ["北条氏邦", "suji", "kuwa_wide", 0x1c1a1a, 0x66513a, "sugake", 0, 0x1c1a1a, "hojo", ""],
  ["十河存保", "suji", "moon", 0x1c1a1a, 0x466270, "okegawa", 0, 0x1c1a1a, "miyoshi", ""],
  ["三好康長", "suji", "sun", 0x1c1a1a, 0x466270, "okegawa", 0, 0x1c1a1a, "miyoshi", ""],
  ["小早川隆景", "suji", "moon", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0x1c1a1a, "mori", ""],
  ["吉川元春", "suji", "sun", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "mori", ""],
  ["吉川広家", "suji", "kuwa_wide", 0x1c1a1a, 0x2e3a52, "sugake", 0, 0x1c1a1a, "mori", ""],
  ["立花道雪", "suji", "moon", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "otomo", ""],
  ["大友義統", "suji", "sun", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0x1c1a1a, "otomo", ""],
  ["香宗我部親泰", "suji", "moon", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0x1c1a1a, "chosokabe", ""],
  ["吉良親貞", "suji", "sun", 0x1c1a1a, 0xa88a3a, "okegawa", 0, 0x1c1a1a, "chosokabe", ""],
  ["谷忠澄", "suji", "kuwa_wide", 0x1c1a1a, 0x3c5a8a, "sugake", 0, 0x1c1a1a, "chosokabe", ""],
  ["福留親政", "suji", "horn", 0x1c1a1a, 0x485448, "sugake", 0, 0x1c1a1a, "chosokabe", ""],
  ["久武親信", "suji", "cross", 0x1c1a1a, 0x485448, "sugake", 0x2e3a42, 0, "chosokabe", ""],
  // 本の写真：黒糸威二枚胴具足（本多家伝来）。鹿角の脇立と肩の大数珠。
  ["本多忠勝", "suji", "honda_shika", 0x151312, 0x24211e, "kebiki", 0, 0x25221f, "honda", "1b6415c3"],
  ["榊原康政", "momonari", "none", 0x474239, 0x384d5d, "hotoke", 0, 0x3a3027, "none", "559d6146"],
  // 本の写真（伝酒井忠次所用の具足）。
  ["酒井忠次", "suji", "none", 0x24221f, 0x33445e, "okegawa", 0, 0x3a3430, "katabami", "ef24e26c"],
  ["石川数正", "suji", "horn", 0x1c1a1a, 0x3c5a8a, "sugake", 0, 0x1c1a1a, "tokugawa", ""],
  ["大久保忠世", "suji", "cross", 0x24221f, 0x2e3a52, "sugake", 0x7a1a12, 0, "okubo", ""],
  ["鳥居元忠", "suji", "shida", 0x1c1a1a, 0x413e32, "kebiki", 0x2e3a42, 0x1c1a1a, "tokugawa", ""],
  ["服部半蔵", "suji", "bellflower", 0x1c1a1a, 0x413e32, "kebiki", 0x2e3a42, 0x1c1a1a, "tokugawa", ""],
  ["松平家忠", "zunari", "kuwa", 0x29251f, 0x413e32, "kebiki", 0x2e3a42, 0x29251f, "tokugawa", ""],
  ["内藤信成", "zunari", "moon", 0x29251f, 0x413e32, "okegawa", 0x7a1a12, 0x29251f, "tokugawa", ""],
  ["松平信康", "zunari", "sun", 0x29251f, 0x413e32, "okegawa", 0x4a3a22, 0, "tokugawa", ""],
  // 本願寺の坊官。法体に具足を着けた復元案（所用品は未確認）。立物は付けない。
  ["下間頼廉", "zunari", "none", 0x1c1a1a, 0x5a4a3a, "okegawa", 0x3a3a3a, 0x1c1a1a, "none", ""],
  ["鈴木孫一", "suji", "sun", 0x151312, 0x2a2a2a, "okegawa", 0x7a1a12, 0x151312, "none", ""],
  // 信貴山の将。立物の伝来は未確認で、具足・威・羽織は復元案。
  ["松永久通", "suji", "none", 0x24221f, 0x6a3a1a, "okegawa", 0x8a6a2a, 0x24221f, "none", ""],
  // 長島で囲船を率いた林佐渡守。所用の兜・立物は未詳で、烏帽子形と月を固有の姿にしない。
  // 筋兜・黒漆具足、威と陣羽織の色は復元。木瓜は織田方の所属を示す。
  ["林秀貞", "suji", "none", 0x1c1a1a, 0x3c5a8a, "kebiki", 0x2e3a42, 0, "oda", ""],
  // 公記巻七の囲船の将・島田所之助。所用具足・立物・陣羽織の細部は未詳。
  // 林と同じ筋兜・黒漆具足を共用する復元。木瓜は織田方の所属で、固有の立物は付けない。
  ["島田所之助", "suji", "none", 0x1c1a1a, 0x3c5a8a, "kebiki", 0xcfc8b4, 0, "oda", ""],
  ["村井貞勝", "eboshi", "sun", 0x24221f, 0x4a4a4a, "kebiki", 0x7a1a12, 0x24221f, "oda", ""],
  // 長島の蜂屋兵庫頭。所用具足・立物は未詳。烏帽子形と大鍬形を本人固有の姿にしない。
  // 筋兜・黒漆具足、威と陣羽織の色は復元。木瓜は織田方の所属を示す。
  ["蜂屋頼隆", "suji", "none", 0x1c1a1a, 0x3c5a8a, "okegawa", 0x8a6a2a, 0x1c1a1a, "oda", ""],
  // 長近の所用兜の形と角は未確認。筋兜で補い、個人の具足へ織田木瓜を刻まない。
  ["金森長近", "suji", "none", 0x1c1a1a, 0x3c5a8a, "okegawa", 0x5a5a5a, 0x1c1a1a, "none", ""],
  ["塙直政", "eboshi", "cross", 0x1c1a1a, 0x3c5a8a, "okegawa", 0x2e3a42, 0x1c1a1a, "oda", ""],
  // 長島の上野守。本人所用の鉢・立物は未確認。烏帽子形と羊歯を固有の姿にしない。
  // 筋兜・黒漆具足、威と陣羽織の色は復元。織田木瓜は所属を示す。
  ["織田信包", "suji", "none", 0x1c1a1a, 0x8a6a2a, "sugake", 0x4a3a22, 0, "oda", ""],
  ["前田利久", "eboshi", "bellflower", 0x1c1a1a, 0x3c5a8a, "sugake", 0x4a3a22, 0x1c1a1a, "oda", ""],
  ["生駒家長", "namban", "kuwa", 0x29251f, 0x3c5a8a, "sugake", 0x4a3a22, 0x29251f, "oda", ""],
  ["山内一豊", "namban", "moon", 0x29251f, 0x3c5a8a, "kebiki", 0x4a3a22, 0x29251f, "oda", ""],
  ["中川重政", "namban", "sun", 0x29251f, 0x3c5a8a, "kebiki", 0x4a3a22, 0x29251f, "oda", ""],
  ["織田長益", "namban", "kuwa_wide", 0x29251f, 0x3c5a8a, "kebiki", 0x302b32, 0, "oda", ""],
  ["前野長康", "suji", "none", 0x2a2420, 0x5a4630, "okegawa", 0x5a5a5a, 0x2a2420, "none", ""],
  ["菅屋長頼", "namban", "cross", 0x29251f, 0x3c5a8a, "okegawa", 0x302b32, 0x29251f, "oda", ""],
  ["福富秀勝", "namban", "shida", 0x29251f, 0x3c5a8a, "okegawa", 0x302b32, 0x29251f, "oda", ""],
  ["野々村正成", "namban", "bellflower", 0x29251f, 0x3c5a8a, "sugake", 0x302b32, 0x29251f, "oda", ""],
  ["水野信元", "zunari", "kuwa", 0x24221f, 0x6a7a2c, "sugake", 0, 0, "oda", ""],
  ["毛利長秀", "suji", "moon", 0x24221f, 0x2e3a52, "sugake", 0x7a1a12, 0x24221f, "oda", ""],
  ["曽根昌世", "zunari", "shida", 0x29251f, 0x9a2e20, "sugake", 0x4a3a22, 0x29251f, "takeda", ""],
  ["土屋昌続", "zunari", "bellflower", 0x3a2622, 0x9a2e20, "kebiki", 0x3a2622, 0, "takeda", ""],
  ["跡部勝資", "momonari", "kuwa", 0x24221f, 0x9a2e20, "kebiki", 0x302b32, 0x24221f, "takeda", ""],
  ["一条信龍", "momonari", "moon", 0x24221f, 0x9a2e20, "kebiki", 0x302b32, 0x24221f, "takeda", ""],
  ["保科正俊", "momonari", "sun", 0x24221f, 0x9a2e20, "okegawa", 0x302b32, 0x24221f, "takeda", ""],
  ["原昌胤", "momonari", "kuwa_wide", 0x24221f, 0x9a2e20, "okegawa", 0x302b32, 0x24221f, "takeda", ""],
  ["長坂光堅", "momonari", "horn", 0x24221f, 0x9a2e20, "okegawa", 0, 0, "takeda", ""],
  ["横田康景", "momonari", "cross", 0x24221f, 0x9a2e20, "sugake", 0, 0x24221f, "takeda", ""],
  ["今福虎孝", "momonari", "shida", 0x24221f, 0x9a2e20, "sugake", 0, 0x24221f, "takeda", ""],
  ["武田信実", "momonari", "bellflower", 0x24221f, 0x9a2e20, "sugake", 0, 0x24221f, "takeda", ""],
  ["小宮山昌友", "eboshi", "kuwa", 0x1c1a1a, 0x9a2e20, "kebiki", 0, 0x1c1a1a, "takeda", ""],
  ["斎藤朝信", "suji", "shida", 0x1c1a1a, 0x703d78, "kebiki", 0x2e3a42, 0x1c1a1a, "uesugi", ""],
  ["甘粕景持", "suji", "bellflower", 0x1c1a1a, 0x703d78, "kebiki", 0x2e3a42, 0x1c1a1a, "uesugi", ""],
  ["北条高広", "zunari", "kuwa", 0x29251f, 0x703d78, "kebiki", 0x2e3a42, 0x29251f, "uesugi", ""],
  ["新発田長敦", "zunari", "moon", 0x29251f, 0x703d78, "okegawa", 0x2e3a42, 0x29251f, "uesugi", ""],
  ["山吉豊守", "zunari", "sun", 0x29251f, 0x703d78, "okegawa", 0x4a3a22, 0, "uesugi", ""],
  ["鬼小島弥太郎", "zunari", "kuwa_wide", 0x29251f, 0x703d78, "okegawa", 0x4a3a22, 0x29251f, "uesugi", ""],
  ["吉江景資", "zunari", "horn", 0x29251f, 0x703d78, "sugake", 0x4a3a22, 0x29251f, "uesugi", ""],
  ["竹俣慶綱", "zunari", "cross", 0x29251f, 0x703d78, "sugake", 0x4a3a22, 0x29251f, "uesugi", ""],
  ["安田長秀", "zunari", "shida", 0x29251f, 0x703d78, "sugake", 0x4a3a22, 0x29251f, "uesugi", ""],
  ["大熊朝秀", "zunari", "bellflower", 0x29251f, 0x703d78, "kebiki", 0x302b32, 0, "uesugi", ""],
  ["千坂景親", "momonari", "kuwa", 0x24221f, 0x703d78, "kebiki", 0x302b32, 0x24221f, "uesugi", ""],
  ["北条綱成", "suji", "horn", 0x1c1a1a, 0x6a7a2c, "sugake", 0, 0x1c1a1a, "hojo", ""],
  ["松田憲秀", "suji", "cross", 0x1c1a1a, 0x66513a, "sugake", 0x7a1a12, 0, "hojo", ""],
  ["大道寺政繁", "suji", "shida", 0x1c1a1a, 0x66513a, "kebiki", 0x7a1a12, 0x1c1a1a, "hojo", ""],
  ["北条幻庵", "suji", "bellflower", 0x1c1a1a, 0x66513a, "kebiki", 0x7a1a12, 0x1c1a1a, "hojo", ""],
  ["清水康英", "zunari", "kuwa", 0x29251f, 0x66513a, "kebiki", 0x7a1a12, 0x29251f, "hojo", ""],
  ["笠原康勝", "zunari", "moon", 0x29251f, 0x66513a, "okegawa", 0x2e3a42, 0x29251f, "hojo", ""],
  ["石巻家貞", "zunari", "sun", 0x29251f, 0x66513a, "okegawa", 0x7a1a12, 0, "hojo", ""],
  ["多目元忠", "zunari", "kuwa_wide", 0x29251f, 0x66513a, "okegawa", 0x4a3a22, 0x29251f, "hojo", ""],
  ["内藤綱秀", "zunari", "horn", 0x29251f, 0x66513a, "sugake", 0x4a3a22, 0x29251f, "hojo", ""],
  ["大藤秀信", "zunari", "cross", 0x29251f, 0x66513a, "sugake", 0x4a3a22, 0x29251f, "hojo", ""],
  ["垪和氏続", "zunari", "shida", 0x29251f, 0x66513a, "sugake", 0x4a3a22, 0x29251f, "hojo", ""],
  ["北条氏忠", "zunari", "bellflower", 0x29251f, 0x66513a, "kebiki", 0x302b32, 0, "hojo", ""],
  ["三好政康", "suji", "kuwa_wide", 0x1c1a1a, 0x9a2e20, "sugake", 0, 0x1c1a1a, "miyoshi", ""],
  ["篠原自遁", "suji", "horn", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "miyoshi", ""],
  ["福原貞俊", "suji", "horn", 0x1c1a1a, 0xa88a3a, "sugake", 0, 0x1c1a1a, "mori", ""],
  ["口羽通良", "suji", "cross", 0x1c1a1a, 0x5a643c, "sugake", 0xcfc8b4, 0, "mori", ""],
  ["児玉就方", "suji", "shida", 0x1c1a1a, 0x5a643c, "kebiki", 0xcfc8b4, 0x1c1a1a, "mori", ""],
  ["熊谷信直", "suji", "bellflower", 0x1c1a1a, 0x5a643c, "kebiki", 0xcfc8b4, 0x1c1a1a, "mori", ""],
  ["天野隆重", "zunari", "kuwa", 0x29251f, 0x5a643c, "kebiki", 0xcfc8b4, 0x29251f, "mori", ""],
  ["乃美宗勝", "zunari", "moon", 0x24221f, 0x4a3a2a, "okegawa", 0xcfc8b4, 0x24221f, "mori", ""],
  ["井上就在", "zunari", "sun", 0x29251f, 0x5a643c, "okegawa", 0x1f2a44, 0, "mori", ""],
  ["渡辺長", "zunari", "kuwa_wide", 0x29251f, 0x5a643c, "okegawa", 0x7a1a12, 0x29251f, "mori", ""],
  ["宍戸隆家", "zunari", "horn", 0x29251f, 0x5a643c, "sugake", 0x7a1a12, 0x29251f, "mori", ""],
  ["益田藤兼", "zunari", "cross", 0x29251f, 0x5a643c, "sugake", 0x7a1a12, 0x29251f, "mori", ""],
  ["平賀広相", "zunari", "shida", 0x29251f, 0x5a643c, "sugake", 0x7a1a12, 0x29251f, "mori", ""],
  ["三吉隆亮", "zunari", "bellflower", 0x29251f, 0x5a643c, "kebiki", 0x7a1a12, 0, "mori", ""],
  ["香川光景", "momonari", "kuwa", 0x24221f, 0x5a643c, "kebiki", 0x302b32, 0x24221f, "mori", ""],
  ["児玉就英", "momonari", "moon", 0x24221f, 0x3a4a3a, "kebiki", 0x2e3a2a, 0x24221f, "mori", ""],
  ["臼杵鑑速", "suji", "kuwa_wide", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "otomo", ""],
  ["角隈石宗", "suji", "horn", 0x1c1a1a, 0x5a2a1c, "sugake", 0, 0x1c1a1a, "otomo", ""],
  ["佐伯惟教", "suji", "cross", 0x1c1a1a, 0x65597a, "sugake", 0x7a1a12, 0, "otomo", ""],
  ["田原親賢", "suji", "shida", 0x1c1a1a, 0x65597a, "kebiki", 0x7a1a12, 0x1c1a1a, "otomo", ""],
  ["朽網鑑康", "suji", "bellflower", 0x1c1a1a, 0x65597a, "kebiki", 0x7a1a12, 0x1c1a1a, "otomo", ""],
  ["志賀親守", "zunari", "kuwa", 0x29251f, 0x65597a, "kebiki", 0x7a1a12, 0x29251f, "otomo", ""],
  ["田北鑑重", "zunari", "moon", 0x29251f, 0x65597a, "okegawa", 0x7a1a12, 0x29251f, "otomo", ""],
  ["斎藤鎮実", "zunari", "sun", 0x29251f, 0x65597a, "okegawa", 0x7a1a12, 0, "otomo", ""],
  ["田原親宏", "zunari", "kuwa_wide", 0x29251f, 0x65597a, "okegawa", 0x7a1a12, 0x29251f, "otomo", ""],
  ["島津義弘", "suji", "moon", 0x1c1a1a, 0x2a2a2a, "okegawa", 0x2a2a2a, 0x1c1a1a, "shimazu", ""],
  ["島津歳久", "suji", "sun", 0x1c1a1a, 0xb0a890, "okegawa", 0, 0x1c1a1a, "shimazu", ""],
  ["島津家久", "suji", "kuwa_wide", 0x1c1a1a, 0xa88a3a, "sugake", 0, 0x1c1a1a, "shimazu", ""],
  ["新納忠元", "suji", "horn", 0x1c1a1a, 0xb0a890, "sugake", 0, 0x1c1a1a, "shimazu", ""],
  ["樺山善久", "suji", "cross", 0x1c1a1a, 0x493f34, "sugake", 0x8a6a2a, 0, "shimazu", ""],
  ["種子島時堯", "suji", "shida", 0x1c1a1a, 0x493f34, "kebiki", 0x8a6a2a, 0x1c1a1a, "shimazu", ""],
  ["北郷時久", "suji", "bellflower", 0x1c1a1a, 0x493f34, "kebiki", 0x8a6a2a, 0x1c1a1a, "shimazu", ""],
  ["鎌田政年", "zunari", "kuwa", 0x29251f, 0x493f34, "kebiki", 0x8a6a2a, 0x29251f, "shimazu", ""],
  ["鍋島直茂", "suji", "moon", 0x1c1a1a, 0xa88a3a, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["成松信勝", "suji", "bellflower", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["百武賢兼", "suji", "kuwa_wide", 0x1c1a1a, 0xb0a890, "sugake", 0, 0x1c1a1a, "none", ""],
  ["木下昌直", "zunari", "horn", 0x1c1a1a, 0x2e3a52, "sugake", 0, 0x1c1a1a, "none", ""],
  ["納富信景", "suji", "cross", 0x1c1a1a, 0x66513b, "sugake", 0x5a5a5a, 0, "none", ""],
  ["龍造寺長信", "suji", "shida", 0x1c1a1a, 0x66513b, "kebiki", 0x5a5a5a, 0x1c1a1a, "none", ""],
  ["江里口信常", "suji", "bellflower", 0x1c1a1a, 0x66513b, "kebiki", 0x5a5a5a, 0x1c1a1a, "none", ""],
  ["鍋島信房", "zunari", "kuwa", 0x29251f, 0x66513b, "kebiki", 0x5a5a5a, 0x29251f, "none", ""],
  ["桑名親光", "suji", "shida", 0x1c1a1a, 0x3c5a8a, "kebiki", 0x2e3a42, 0x1c1a1a, "chosokabe", ""],
  ["江村親家", "suji", "bellflower", 0x1c1a1a, 0x3c5a8a, "kebiki", 0x2e3a42, 0x1c1a1a, "chosokabe", ""],
  ["伊達晴宗", "suji", "moon", 0x1c1a1a, 0xb0a890, "okegawa", 0, 0x1c1a1a, "date", ""],
  ["遠藤基信", "zunari", "sun", 0x1c1a1a, 0x3c5a8a, "okegawa", 0, 0x1c1a1a, "date", ""],
  ["鬼庭良直", "zunari", "kuwa_wide", 0x1c1a1a, 0x2e3a52, "sugake", 0, 0x1c1a1a, "date", ""],
  ["留守政景", "zunari", "horn", 0x1c1a1a, 0x3c5a8a, "sugake", 0, 0x1c1a1a, "date", ""],
  ["石川昭光", "suji", "cross", 0x1c1a1a, 0x2d4058, "sugake", 0xcfc8b4, 0, "date", ""],
  ["白石宗実", "suji", "shida", 0x1c1a1a, 0x2d4058, "kebiki", 0x7a1a12, 0x1c1a1a, "date", ""],
  ["亘理元宗", "suji", "bellflower", 0x1c1a1a, 0x2d4058, "kebiki", 0x7a1a12, 0x1c1a1a, "date", ""],
  ["小梁川盛宗", "zunari", "kuwa", 0x29251f, 0x2d4058, "kebiki", 0x7a1a12, 0x29251f, "date", ""],
  ["金上盛備", "zunari", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["富田隆実", "zunari", "kuwa", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["佐瀬種常", "zunari", "horn", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["松本氏輔", "zunari", "cross", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["針生盛幸", "zunari", "shida", 0x1c1a1a, 0x66513b, "sugake", 0x1f2a44, 0, "none", ""],
  ["新国貞通", "zunari", "bellflower", 0x1c1a1a, 0x66513b, "kebiki", 0x4a5a22, 0x1c1a1a, "none", ""],
  ["北信愛", "momonari", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["九戸政実", "momonari", "moon", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["南部信直", "momonari", "cross", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["桜庭直綱", "momonari", "shida", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["八戸政栄", "momonari", "bellflower", 0x1c1a1a, 0x66513b, "sugake", 0x2e3a42, 0, "none", ""],
  ["東政勝", "momonari", "kuwa", 0x1c1a1a, 0x66513b, "kebiki", 0x7a1a12, 0x1c1a1a, "none", ""],
  ["里見義弘", "eboshi", "horn", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["加藤信景", "eboshi", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["正木頼忠", "eboshi", "shida", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["和田昭為", "zunari", "moon", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0x1c1a1a, "satake", ""],
  ["小野崎義昌", "zunari", "sun", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "satake", ""],
  ["車斯忠", "zunari", "kuwa_wide", 0x1c1a1a, 0x3c5a8a, "sugake", 0, 0x1c1a1a, "satake", ""],
  ["真壁氏幹", "zunari", "horn", 0x1c1a1a, 0x9a2e20, "sugake", 0, 0x1c1a1a, "satake", ""],
  ["東義久", "suji", "cross", 0x1c1a1a, 0x3e5474, "sugake", 0x8a6a2a, 0, "satake", ""],
  ["平岩親吉", "zunari", "kuwa_wide", 0x29251f, 0x413e32, "okegawa", 0x1f2a44, 0x29251f, "tokugawa", ""],
  ["高力清長", "zunari", "horn", 0x29251f, 0x413e32, "sugake", 0x1f2a44, 0x29251f, "tokugawa", ""],
  ["天野康景", "zunari", "cross", 0x29251f, 0x413e32, "sugake", 0x1f2a44, 0x29251f, "tokugawa", ""],
  ["渡辺守綱", "zunari", "shida", 0x29251f, 0x413e32, "sugake", 0xcfc8b4, 0x29251f, "tokugawa", ""],
  ["大久保忠佐", "zunari", "bellflower", 0x29251f, 0x413e32, "kebiki", 0xcfc8b4, 0, "tokugawa", ""],
  ["松井忠次", "momonari", "kuwa", 0x24221f, 0x413e32, "kebiki", 0x4a5a22, 0x24221f, "tokugawa", ""],
  ["松平信一", "momonari", "moon", 0x24221f, 0x413e32, "kebiki", 0x7a1a12, 0x24221f, "tokugawa", ""],
  ["本多広孝", "momonari", "sun", 0x24221f, 0x413e32, "okegawa", 0x7a1a12, 0x24221f, "tokugawa", ""],
  ["菅沼定盈", "momonari", "kuwa_wide", 0x24221f, 0x413e32, "okegawa", 0x302b32, 0x24221f, "tokugawa", ""],
  ["奥平貞能", "momonari", "horn", 0x24221f, 0x2e3a52, "okegawa", 0, 0, "tokugawa", ""],
  ["内藤家長", "momonari", "cross", 0x24221f, 0x2e3a52, "sugake", 0, 0x24221f, "tokugawa", ""],
  ["大須賀康高", "momonari", "shida", 0x24221f, 0x2e3a52, "sugake", 0, 0x24221f, "tokugawa", ""],
  ["阿部正勝", "momonari", "bellflower", 0x24221f, 0x2e3a52, "sugake", 0, 0x24221f, "tokugawa", ""],
  ["植村家存", "eboshi", "kuwa", 0x1c1a1a, 0x2e3a52, "kebiki", 0, 0x1c1a1a, "tokugawa", ""],
  ["七里頼周", "namban", "bellflower", 0x1c1a1a, 0x66513b, "sugake", 0, 0x1c1a1a, "none", ""],
  ["下間頼照", "suji", "horn", 0x2a2420, 0x4a3a2a, "sugake", 0x3a3430, 0x2a2420, "none", ""],
  // 鉢伏の守将は『信長公記』巻八の専修寺・阿波賀三郎兄弟による。
  // https://www.library-archives.pref.fukui.lg.jp/fukui/07/kenshi/T2/T2-4-01-05-04-03.htm
  // 本人の具足は未確認。筋兜・黒漆の胴丸を復元案とし、立物・陣羽織・家紋は足さない。
  ["阿波賀三郎", "suji", "none", 0x1c1a1a, 0x6a2a5a, "kebiki", 0, 0, "none", ""],
  ["杉浦玄任", "suji", "cross", 0x2a2420, 0x3c5a8a, "sugake", 0x3a2a1a, 0, "none", ""],
  ["下間仲之", "eboshi", "moon", 0x1c1a1a, 0x66513b, "kebiki", 0x2e3a42, 0x1c1a1a, "none", ""],
  ["土橋守重", "suji", "moon", 0x151312, 0x3a3a3a, "okegawa", 0xcfc8b4, 0x151312, "none", ""],
  ["太田宗正", "namban", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  // 村上水軍の将。所用具足は未確認。南蛮兜は復元案。
  ["村上武吉", "namban", "cross", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["村上吉充", "zunari", "horn", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["平岡房実", "zunari", "kuwa", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "none", ""],
  ["壬生綱雄", "suji", "shida", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["武田信豊", "eboshi", "moon", 0x1c1a1a, 0x9a2e20, "kebiki", 0x2e3a42, 0, "takeda", ""],
  // 山梨県立博物館の軍陣影解説にある、日輪の前立と白熊の諏訪法性兜にちなむ姿。
  // https://www.museum.pref.yamanashi.jp/pdfdata/nenpou/nenpouh17.pdf
  ["武田信玄", "suji", "sun", 0x221c18, 0xa8281c, "kebiki", 0x7a1a12, 0x221c18, "takeda", ""],
  ["北条氏康", "momonari", "kuwa", 0x24221f, 0x66513a, "kebiki", 0xcfc8b4, 0x24221f, "hojo", ""],
  // 長政の所用具足は未確認。肖像は高野山持明院の浅井長政像。萌黄の威は復元案。
  ["浅井長政", "suji", "moon", 0x1c1a1a, 0x3c5a48, "sugake", 0x2a3a30, 0, "azai", ""],
  // 義景の所用具足は未確認。肖像は心月寺の朝倉義景像。烏帽子形の兜と萌黄の威は復元案。
  ["朝倉義景", "eboshi", "sun", 0x24221f, 0x3a5a3a, "kebiki", 0x3a4a2a, 0, "asakura", ""],
  // 野田・福島：長逸の十字前立は裏付け未確認のため外す。具足・衣の色は復元案。
  ["三好長逸", "suji", "none", 0x24221f, 0xd8d0bc, "sugake", 0x2a3a4a, 0, "miyoshi", ""],
  // 宗渭本人の具足・立物・陣羽織は未確認。黒漆の筋兜と素懸威で補い、固有の飾りは付けない。
  ["三好宗渭", "suji", "none", 0x1c1a1a, 0xb0a890, "sugake", 0, 0, "miyoshi", ""],
  // 元就の所用具足は未確認。肖像は毛利博物館の毛利元就像。復元案。
  ["毛利元就", "momonari", "sun", 0x24221f, 0x5a643c, "okegawa", 0x302b32, 0x24221f, "mori", ""],
  ["島津貴久", "zunari", "moon", 0x29251f, 0x493f34, "okegawa", 0x8a6a2a, 0x29251f, "shimazu", ""],
  ["神保長職", "zunari", "cross", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0, "none", ""],
  ["畠山義綱", "momonari", "shida", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0, "none", ""],
  ["藤林長門守", "eboshi", "bellflower", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  // 父子の当日の具足は未詳。南蛮鉢や固有の立物を断定せず、筋兜・黒漆の復元案。
  ["北畠具房", "suji", "none", 0x1c1a1a, 0x2e3a52, "okegawa", 0x4a2a5a, 0, "kitabatake", ""],
  ["森可成", "suji", "sun", 0x24221f, 0x2e3a52, "kebiki", 0x4a5a22, 0x24221f, "tsuru", ""],
  // 長島の伊賀伊賀守。所用具足・立物は未詳。大鍬形を本人固有の姿にしない。
  // 筋兜・黒漆の具足・威の色は復元。木瓜は織田方の所属を示す。
  ["安藤守就", "suji", "none", 0x24221f, 0x2e3a52, "kebiki", 0xcfc8b4, 0x24221f, "oda", ""],
  ["氏家直元", "zunari", "none", 0x24221f, 0x9a2e20, "kebiki", 0, 0x24221f, "none", ""],
  // 公記巻七の氏家左京亮（直昌）。元亀二年に討死した父・直元の姿を流用しない。
  // 所用具足・立物・陣羽織は未詳。筋兜と黒漆具足は既存部品による復元で、立物なし。
  // 木瓜は織田方の所属を示す。本人の家紋や当日の旗印と断定しない。
  ["氏家直昌", "suji", "none", 0x1c1a1a, 0xb0a890, "kebiki", 0x2e3a42, 0, "oda", ""],
  ["真田幸隆", "eboshi", "kuwa_wide", 0x1c1a1a, 0x9a2e20, "okegawa", 0x2e3a42, 0x1c1a1a, "takeda", ""],
  ["柿崎景家", "momonari", "moon", 0x1c1a1a, 0x2a3a5a, "kebiki", 0x4a2a5a, 0x1c1a1a, "uesugi", ""],
  // 久政の所用具足は未確認。長政と見分ける朽葉の威の復元案。
  ["浅井久政", "suji", "moon", 0x2e2a26, 0x8a6a2a, "okegawa", 0x4a3a22, 0x2e2a26, "azai", ""],
  ["磯野員昌", "suji", "none", 0x2a1c18, 0x7a5a2a, "okegawa", 0x1f2a44, 0x2a1c18, "azai", ""],
  ["遠藤直経", "suji", "kuwa_wide", 0x1c1a1a, 0x6a1c14, "sugake", 0x7a1a12, 0x1c1a1a, "azai", ""],
  ["海北綱親", "zunari", "horn", 0x1c1a1a, 0xa88a3a, "sugake", 0, 0x1c1a1a, "azai", ""],
  // 景健の所用具足・立物は未確認。浅井長政と見分ける頭形の兜・紺の威・茶の陣羽織の復元案で、立物は付けない。
  ["朝倉景健", "zunari", "none", 0x24221f, 0x2e3a52, "okegawa", 0x8a5a2a, 0x24221f, "asakura", ""],
  ["朝倉景鏡", "suji", "none", 0x24221f, 0x3a5a3a, "okegawa", 0x8a6a2a, 0x24221f, "asakura", ""],
  ["山崎吉家", "suji", "none", 0x24221f, 0x2e3a52, "sugake", 0x3a6a72, 0x24221f, "asakura", ""],
  ["三好義継", "suji", "shida", 0x1c1a1a, 0x466270, "kebiki", 0xcfc8b4, 0x1c1a1a, "miyoshi", ""],
  ["篠原長房", "suji", "bellflower", 0x1c1a1a, 0x466270, "kebiki", 0xcfc8b4, 0x1c1a1a, "miyoshi", ""],
  ["平手汎秀", "suji", "none", 0x24221f, 0x9a7a3a, "okegawa", 0x7a1a12, 0, "oda", ""],
  // 長島での所用具足・立物は未確認。羊歯を固有の印にせず、筋兜と黒漆の具足で復元する。
  // 威と陣羽織の色も復元。織田木瓜は所属を示し、個人の馬印は補わない。
  ["織田信広", "suji", "none", 0x1c1a1a, 0x6a6a6a, "okegawa", 0x6a1a14, 0x1c1a1a, "oda", ""],
  // 公記巻七の津田孫十郎（信次）。所用具足・立物・陣羽織は未詳。
  // 筋兜と黒漆具足は復元。信広と同じ部品を共用し、織田木瓜は所属だけを示す。
  ["織田信次", "suji", "none", 0x1c1a1a, 0xb0a890, "okegawa", 0x6a1a14, 0x1c1a1a, "oda", ""],
  // 公記巻七の早尾口先陣・不破河内守。所用具足・立物・陣羽織は未詳。
  // 筋兜・黒漆具足は共通部品による復元。固有の立物や陣羽織を創作せず、木瓜は織田方の所属だけを示す。
  ["不破光治", "suji", "none", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0, "oda", ""],
  // 長島の浅井新八。所用具足は未詳。筋兜・黒漆具足と威の色は復元。
  // 個人の立物・陣羽織は補わず、木瓜は織田方の所属だけを示す。
  ["浅井新八", "suji", "none", 0x1c1a1a, 0xa88a3a, "sugake", 0, 0, "oda", ""],
  // 公記巻七の一江口御伴衆・梶原平次。諱と所用具足は未詳。
  // https://ja.wikisource.org/wiki/信長公記
  // 筋兜・黒漆具足は共通部品で復元。固有の立物・陣羽織・個人紋は補わない。
  ["梶原平次", "suji", "none", 0x1c1a1a, 0x6a6a6a, "sugake", 0, 0, "none", ""],
  // 公記巻七の早尾口先陣・篠橋攻め衆、飯沼勘平。所用具足は未詳。
  // 筋兜・黒漆の素懸威は共通部品による復元。立物・陣羽織は補わず、木瓜は所属のみを示す。
  ["飯沼勘平", "suji", "none", 0x1c1a1a, 0x2e3a52, "sugake", 0, 0, "oda", ""],
  // 志賀での所用具足と立物は未確認。鉢・威・陣羽織は復元とし、個人の印と誤認する桔梗を付けない。
  ["織田信治", "suji", "none", 0x1c1a1a, 0xd8d0bc, "okegawa", 0x5a1a14, 0x1c1a1a, "oda", ""],
  ["小山田虎満", "eboshi", "horn", 0x1c1a1a, 0x9a2e20, "okegawa", 0x2e3a42, 0x1c1a1a, "takeda", ""],
  ["赤尾清綱", "suji", "cross", 0x2a2420, 0x7a2a1c, "sugake", 0x3a2a22, 0, "azai", ""],
  ["阿閉貞征", "suji", "shida", 0x1c1a1a, 0x6a7a2c, "kebiki", 0x2e3a42, 0x1c1a1a, "azai", ""],
  ["大野木秀俊", "suji", "bellflower", 0x1c1a1a, 0x6a7a2c, "kebiki", 0x2e3a42, 0x1c1a1a, "azai", ""],
  ["真柄直隆", "zunari", "horn", 0x1c1a1a, 0xb0a890, "sugake", 0, 0x1c1a1a, "asakura", ""],
  ["魚住景固", "suji", "cross", 0x1c1a1a, 0x6a7a2c, "sugake", 0x2e3a42, 0, "asakura", ""],
  ["前波吉継", "suji", "shida", 0x1c1a1a, 0xd8d0bc, "kebiki", 0x2e3a42, 0x1c1a1a, "asakura", ""],
  ["印牧能信", "suji", "bellflower", 0x1c1a1a, 0xd8d0bc, "kebiki", 0x2e3a42, 0x1c1a1a, "asakura", ""],
  ["朝倉景隆", "zunari", "kuwa", 0x29251f, 0x735535, "kebiki", 0x2e3a42, 0x29251f, "asakura", ""],
  ["堀江景忠", "zunari", "moon", 0x29251f, 0x735535, "okegawa", 0x7a1a12, 0x29251f, "asakura", ""],
  ["岩成友通", "zunari", "none", 0x24221f, 0x2a4a5a, "kebiki", 0x4a5a22, 0x24221f, "miyoshi", ""],
  ["香西長信", "zunari", "moon", 0x29251f, 0x466270, "okegawa", 0x2e3a42, 0x29251f, "miyoshi", ""],
  ["吉弘鑑理", "zunari", "horn", 0x29251f, 0x65597a, "sugake", 0x7a1a12, 0x29251f, "otomo", ""],
  ["吉岡長増", "zunari", "cross", 0x29251f, 0x65597a, "sugake", 0x7a1a12, 0x29251f, "otomo", ""],
  ["中野宗時", "zunari", "moon", 0x29251f, 0x2d4058, "okegawa", 0x5a5a5a, 0x29251f, "date", ""],
  ["石川高信", "zunari", "kuwa", 0x1c1a1a, 0x3c5a8a, "kebiki", 0x2e3a42, 0x1c1a1a, "none", ""],
  ["里見義堯", "eboshi", "bellflower", 0x1c1a1a, 0x2e3a52, "sugake", 0, 0x1c1a1a, "none", ""],
  ["寺島職定", "zunari", "bellflower", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["小島職鎮", "momonari", "kuwa", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["芳賀高定", "eboshi", "moon", 0x1c1a1a, 0x66513b, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["織田秀信", "zunari", "kuwa", 0x1c1a1a, 0x3c5a8a, "sugake", 0xcfc8b4, 0x1c1a1a, "oda", ""],
  ["長宗我部盛親", "zunari", "kuwa", 0x29251f, 0xd8d0bc, "kebiki", 0x2e3a42, 0x29251f, "chosokabe", ""],
  ["伊達政宗", "suji", "date_moon", 0x16191b, 0x2d4058, "okegawa", 0x252a35, 0, "date", ""],
  ["最上義光", "namban", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0, 0, "none", ""],
  ["佐竹義宣", "suji", "shida", 0x1c1a1a, 0x3e5474, "kebiki", 0x8a6a2a, 0x1c1a1a, "satake", ""],
  ["石田三成", "zunari", "kuwa", 0x1c1a1a, 0xa88a3a, "okegawa", 0, 0, "ishida", ""],
  ["豊臣秀頼", "zunari", "kuwa", 0x1c1a1a, 0x6a6a6a, "okegawa", 0, 0, "toyotomi", ""],
  ["宇喜多秀家", "zunari", "kuwa_wide", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "none", ""],
  ["小早川秀秋", "momonari", "horn", 0x1c1a1a, 0x3c5a8a, "okegawa", 0, 0, "none", ""],
  ["前田利長", "zunari", "kuwa", 0x1c1a1a, 0x5a2a1c, "okegawa", 0, 0, "maeda", ""],
  ["加藤清正", "zunari", "none", 0xae945d, 0xb38a60, "katahada", 0, 0x875749, "none", "a5a1c499"],
  ["黒田長政", "zunari", "kuwa", 0x1c1a1a, 0x6a2a5a, "okegawa", 0, 0, "kuroda", ""],
  ["立花宗茂", "momonari", "cross", 0x1c1a1a, 0x3c5a8a, "okegawa", 0, 0, "none", ""],
  ["池田輝政", "eboshi", "shida", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0, "none", ""],
  ["細川忠興", "zunari", "feather", 0x181717, 0x2c2b29, "kebiki", 0, 0x28201e, "none", "48e4b5c5"],
  ["藤堂高虎", "namban", "bellflower", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0, "none", ""],
  ["大谷吉継", "zunari", "moon", 0x1c1a1a, 0x66513b, "okegawa", 0x5a5a5a, 0, "none", ""],
  ["島津忠恒", "zunari", "sun", 0x29251f, 0x493f34, "okegawa", 0xcfc8b4, 0, "shimazu", ""],
  ["徳川秀忠", "eboshi", "moon", 0x1c1a1a, 0x413e32, "kebiki", 0x7a1a12, 0, "tokugawa", ""],
  // 本の写真：朱漆塗仏胴具足（井伊家伝来・直政所用）と金の天衝。
  ["井伊直政", "zunari", "ii_tentsuki", 0xa52b1c, 0xb8342a, "hotoke", 0, 0x96291e, "ii", "bd862d2e"],
  ["結城秀康", "eboshi", "kuwa_wide", 0x1c1a1a, 0x413e32, "okegawa", 0x2e3a42, 0x1c1a1a, "tokugawa", ""],
  ["大久保忠隣", "eboshi", "horn", 0x1c1a1a, 0x413e32, "okegawa", 0x2e3a42, 0x1c1a1a, "tokugawa", ""],
  ["酒井家次", "eboshi", "cross", 0x1c1a1a, 0x413e32, "okegawa", 0x2e3a42, 0x1c1a1a, "tokugawa", ""],
  ["島左近", "zunari", "moon", 0x1c1a1a, 0x3c5a8a, "okegawa", 0, 0x1c1a1a, "ishida", ""],
  ["片桐且元", "zunari", "moon", 0x1c1a1a, 0x9a2e20, "okegawa", 0, 0x1c1a1a, "toyotomi", ""],
  ["大野治長", "zunari", "sun", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0x1c1a1a, "toyotomi", ""],
  ["加藤嘉明", "zunari", "kuwa_wide", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "toyotomi", ""],
  ["蜂須賀家政", "momonari", "horn", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "toyotomi", ""],
  ["明石全登", "zunari", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0xa8764a, 0x1c1a1a, "none", ""],
  ["黒田如水", "zunari", "moon", 0x1c1a1a, 0xd8d0bc, "okegawa", 0, 0x1c1a1a, "kuroda", ""],
  ["鍋島勝茂", "momonari", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0xab784b, 0, "none", ""],
  ["真田幸村", "suji", "kuwa", 0x8e1f16, 0xb8342a, "okegawa", 0, 0, "sanada", ""],
  ["津野親忠", "zunari", "moon", 0x29251f, 0xd8d0bc, "okegawa", 0x2e3a42, 0x29251f, "chosokabe", ""],
  ["楯岡満茂", "zunari", "sun", 0x1c1a1a, 0x66513b, "okegawa", 0xa8764a, 0x1c1a1a, "none", ""],
  ["松平忠吉", "eboshi", "shida", 0x1c1a1a, 0x413e32, "sugake", 0x4a3a22, 0, "tokugawa", ""],
  ["本多忠朝", "eboshi", "bellflower", 0x1c1a1a, 0x413e32, "sugake", 0x4a3a22, 0x1c1a1a, "tokugawa", ""],
  ["水野勝成", "namban", "kuwa", 0x24221f, 0x5a2a1c, "sugake", 0x3a2a1a, 0x24221f, "mizuno", ""],
  ["本多忠政", "namban", "moon", 0x151312, 0x2a2a2a, "kebiki", 0x2a2a2a, 0x151312, "honda", ""],
  ["京極高知", "namban", "sun", 0x29251f, 0x413e32, "kebiki", 0x4a3a22, 0x29251f, "tokugawa", ""],
  ["田中吉政", "namban", "kuwa_wide", 0x29251f, 0x413e32, "kebiki", 0x302b32, 0, "tokugawa", ""],
  ["浅野長政", "namban", "horn", 0x29251f, 0x413e32, "okegawa", 0x302b32, 0x29251f, "tokugawa", ""],
  ["浅野長晟", "namban", "cross", 0x29251f, 0x413e32, "okegawa", 0x302b32, 0x29251f, "tokugawa", ""],
  ["仙石秀久", "namban", "shida", 0x29251f, 0x413e32, "okegawa", 0x302b32, 0x29251f, "tokugawa", ""],
  ["可児才蔵", "namban", "bellflower", 0x29251f, 0x413e32, "sugake", 0x302b32, 0x29251f, "tokugawa", ""],
  ["平野長泰", "zunari", "kuwa", 0x24221f, 0xb0a890, "sugake", 0, 0, "tokugawa", ""],
  ["糟屋武則", "zunari", "moon", 0x24221f, 0xa88a3a, "sugake", 0, 0x24221f, "tokugawa", ""],
  ["真田信之", "zunari", "sun", 0x24221f, 0xa88a3a, "kebiki", 0, 0x24221f, "tokugawa", ""],
  ["小西行長", "zunari", "sun", 0x1c1a1a, 0xb0a890, "okegawa", 0, 0x1c1a1a, "ishida", ""],
  ["相良頼房", "zunari", "kuwa_wide", 0x1c1a1a, 0xa88a3a, "sugake", 0, 0x1c1a1a, "ishida", ""],
  ["脇坂安治", "momonari", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0xab784b, 0x1c1a1a, "none", ""],
  ["長束正家", "suji", "cross", 0x1c1a1a, 0xb39a61, "sugake", 0x2e3a42, 0, "toyotomi", ""],
  ["大野治房", "suji", "shida", 0x1c1a1a, 0xb39a61, "kebiki", 0x2e3a42, 0x1c1a1a, "toyotomi", ""],
  ["薄田兼相", "suji", "bellflower", 0x2a1c18, 0x7a5a2a, "kebiki", 0x8a6a2a, 0x2a1c18, "toyotomi", ""],
  // 木津川口の九鬼。後年の豊臣紋は付けない。所用具足・立物は未確認で、黒漆の無立物として復元。
  ["九鬼嘉隆", "zunari", "none", 0x1c1a1a, 0x2a3a5a, "kebiki", 0xcfc8b4, 0x1c1a1a, "none", ""],
  ["毛利秀元", "momonari", "kuwa_wide", 0x24221f, 0x5a643c, "okegawa", 0x7a1a12, 0x24221f, "mori", ""],
  ["安国寺恵瓊", "momonari", "horn", 0x24221f, 0xa88a3a, "okegawa", 0, 0, "mori", ""],
  ["久武親直", "zunari", "sun", 0x29251f, 0x485448, "okegawa", 0x5a5a5a, 0, "chosokabe", ""],
  ["桑名吉成", "zunari", "kuwa_wide", 0x29251f, 0x485448, "okegawa", 0xcfc8b4, 0x29251f, "chosokabe", ""],
  ["天童頼澄", "momonari", "horn", 0x1c1a1a, 0x66513b, "okegawa", 0xab784b, 0x1c1a1a, "none", ""],
  ["龍造寺政家", "eboshi", "horn", 0x1c1a1a, 0x66513b, "okegawa", 0xae7a4c, 0x1c1a1a, "none", ""],
  ["最上義俊", "zunari", "moon", 0x1c1a1a, 0xb0a890, "sugake", 0, 0x1c1a1a, "none", ""],
  ["前田利常", "momonari", "moon", 0x1c1a1a, 0x2e3a52, "okegawa", 0, 0x1c1a1a, "maeda", ""],
  ["山内忠義", "eboshi", "kuwa_wide", 0x1c1a1a, 0x66513b, "okegawa", 0xae7a4c, 0, "none", ""],
  ["池田忠雄", "namban", "cross", 0x1c1a1a, 0x66513b, "okegawa", 0xb17c4d, 0x1c1a1a, "none", ""],
  ["井伊直孝", "zunari", "kuwa_wide", 0x24221f, 0xb0a890, "kebiki", 0, 0x24221f, "tokugawa", ""],
  ["松平忠直", "momonari", "horn", 0x24221f, 0xb0a890, "kebiki", 0, 0x24221f, "tokugawa", ""],
  ["後藤又兵衛", "zunari", "moon", 0x2a2624, 0xa88a3a, "okegawa", 0x2a2a2a, 0x2a2624, "toyotomi", ""],
  ["毛利勝永", "zunari", "sun", 0x29251f, 0xb39a61, "okegawa", 0x4a3a22, 0, "toyotomi", ""],
  ["木村重成", "zunari", "kuwa_wide", 0x29251f, 0xb39a61, "okegawa", 0x4a3a22, 0x29251f, "toyotomi", ""],
  ["榊原康勝", "suji", "cross", 0x24221f, 0xb8342a, "okegawa", 0x2e3a42, 0, "tokugawa", ""],
  ["松井宗信", "suji", "kuwa", 0x221816, 0x9a2e20, "okegawa", 0x6a2418, 0, "imagawa", ""],
  ["服部小平太", "suji", "moon", 0x24221f, 0x3c5a8a, "okegawa", 0x3a2a22, 0x24221f, "none", ""],
  ["各務元正", "suji", "none", 0x24221f, 0x9a2e20, "okegawa", 0x4a2a5a, 0x24221f, "none", ""],
  ["栗山善助", "suji", "kuwa_wide", 0x24221f, 0x2a2a2a, "sugake", 0x2a2a2a, 0x24221f, "kuroda", ""],
  ["谷衛好", "suji", "horn", 0x24221f, 0x4a4a2a, "sugake", 0x7a1a12, 0x24221f, "none", ""],
  ["藤掛永勝", "suji", "cross", 0x2a2420, 0xd8d0bc, "sugake", 0x3a2e24, 0, "azai", ""],
  ["団忠正", "suji", "shida", 0x24221f, 0x3c5a8a, "kebiki", 0x5a5a5a, 0x24221f, "none", ""],
  // 龍興の所用具足は未確認。斎藤の紋と紫の威は復元案。
  ["斎藤龍興", "zunari", "sun", 0x22241e, 0x6a5a8a, "okegawa", 0x4a3a5a, 0x22241e, "saito", ""],
  // 信貴山の将。立物の伝来は未確認で、具足・威・羽織は復元案。
  ["筒井順慶", "zunari", "none", 0x24221f, 0x5a3a5a, "kebiki", 0x8a6a2a, 0x24221f, "igeta", ""],
  // 本能寺の先手。月の立物は未確認で、黒漆の具足は復元案。
  ["斎藤利三", "zunari", "none", 0x1c1a1a, 0x2e3a52, "okegawa", 0x3a6a72, 0x1c1a1a, "akechi", ""],
  // 小姓三兄弟の立物は未確認。具足は復元案、本能寺では戦の小袖指定を優先する。
  ["森蘭丸", "zunari", "none", 0x24221f, 0x3c5a8a, "okegawa", 0x2a2622, 0, "oda", ""],
  ["森坊丸", "zunari", "none", 0x24221f, 0x3c5a8a, "okegawa", 0x7a1a12, 0x24221f, "oda", ""],
  ["森力丸", "zunari", "none", 0x24221f, 0x3c5a8a, "sugake", 0x4a2a5a, 0x24221f, "oda", ""],
  ["奥平信昌", "zunari", "cross", 0x24221f, 0x4a3a2a, "sugake", 0xcfc8b4, 0x24221f, "okudaira", ""],
  ["鳥居強右衛門", "zunari", "shida", 0x2a2622, 0x4a3a2a, "sugake", 0x8a6a2a, 0x2a2622, "none", ""],
  // 伝：江戸の軍記に、赤地の錦の直垂・胸白の具足・八龍を打った五枚兜とある。実物は未確認。八龍は鉢の前の龍（humans.js の KB_DRAGON）で示す。
  ["今川義元", "suji", "none", 0x221816, 0xd8d0bc, "kebiki", 0x9e241b, 0, "imagawa", ""],
  ["大沢勘兵衛", "momonari", "kuwa", 0x2a2420, 0x3c5a8a, "kebiki", 0x4a3a22, 0x2a2420, "none", ""],
  ["日比野下野守", "momonari", "moon", 0x22241e, 0x6b6a4a, "kebiki", 0x3a4632, 0x22241e, "none", ""],
  ["長井甲斐守", "momonari", "sun", 0x22241e, 0x5a5a3a, "okegawa", 0x4a5a22, 0x22241e, "none", ""],
  ["戸田勝成", "momonari", "kuwa_wide", 0x24221f, 0x4a4a2a, "okegawa", 0x4a5a22, 0x24221f, "none", ""],
  ["真田信繁", "zunari", "honda_shika", 0x8e1f16, 0xb8342a, "hotoke", 0x7a1a12, 0, "sanada", ""],
  ["今福浄閑", "momonari", "cross", 0x2a2420, 0x7a2a1c, "sugake", 0x3a2a1a, 0x2a2420, "takeda", ""],
  ["河窪信実", "momonari", "shida", 0x2a2420, 0x9a2e20, "sugake", 0x3a2a22, 0x2a2420, "takeda", ""],
  ["島津豊久", "momonari", "bellflower", 0x1c1a1a, 0x2a2a2a, "sugake", 0x2a2a2a, 0x1c1a1a, "shimazu", ""],
  ["平塚為広", "eboshi", "kuwa", 0x24221f, 0x5a5a3a, "kebiki", 0x3a3a2a, 0x24221f, "none", ""],
  ["今川方の侍大将", "eboshi", "moon", 0x221816, 0x9a2e20, "kebiki", 0x7a2418, 0, "imagawa", ""],
  ["稲田弾正", "eboshi", "sun", 0x22241e, 0x6a5a8a, "kebiki", 0x3a3048, 0x22241e, "saito", ""],
  ["浅井の殿の侍大将", "eboshi", "kuwa_wide", 0x2e2a26, 0x3c5a48, "okegawa", 0x7a1a12, 0x2e2a26, "azai", ""],
  ["朝倉の侍大将", "eboshi", "horn", 0x33291f, 0x7a5a2a, "okegawa", 0x4a3a1a, 0x33291f, "asakura", ""],
  ["吉田出雲守", "eboshi", "cross", 0x24221f, 0x5a4630, "okegawa", 0x7a1a12, 0x24221f, "none", ""],
  ["毛利新介", "eboshi", "shida", 0x2a2420, 0x7a2a1c, "sugake", 0x2a2622, 0, "none", ""],
  // 桶狭間（永禄三年）の直盛は、井伊の赤備え（天正十年以後の直政）より前。黒漆に紺糸の復元案で、所用品は未確認。
  ["井伊直盛", "eboshi", "none", 0x1c1a1a, 0x2e3a52, "sugake", 0x22405a, 0x1c1a1a, "ii", ""],
  ["由比正信", "namban", "kuwa", 0x221816, 0x9a2e20, "sugake", 0x6a2418, 0x221816, "imagawa", ""],
  ["足立六兵衛", "namban", "moon", 0x22241e, 0x6a5a8a, "kebiki", 0x7a1a12, 0x22241e, "saito", ""],
  ["日根野弘就", "suji", "none", 0x22241e, 0x9a2e20, "kebiki", 0x3a6a72, 0x22241e, "saito", ""],
  ["長井道利", "suji", "none", 0x22241e, 0x9a2e20, "kebiki", 0xcfc8b4, 0, "saito", ""],
  ["建部秀明", "namban", "horn", 0x24221f, 0x3a5a3a, "okegawa", 0x7a1a12, 0x24221f, "none", ""],
  ["北畠具教", "suji", "none", 0x1c1a1a, 0x7a2a5a, "okegawa", 0x4a2a4a, 0x1c1a1a, "kitabatake", ""],
  ["日置大膳", "namban", "shida", 0x2a2420, 0x6a4a2a, "okegawa", 0x7a1a12, 0x2a2420, "none", ""],
  ["池田勝正", "suji", "none", 0x24221f, 0x6a7a2c, "sugake", 0x8a6a2a, 0x24221f, "none", ""],
  ["坂井政尚", "suji", "kuwa", 0x2a2420, 0x5a2a1c, "sugake", 0x3a2a1a, 0, "none", ""],
  ["正覚院豪盛", "suji", "none", 0x2a2420, 0x8a6a2a, "sugake", 0xcfc8b4, 0x2a2420, "none", ""],
  ["河合吉統", "suji", "none", 0x24221f, 0xa88a3a, "kebiki", 0x22405a, 0x24221f, "asakura", ""],
  // 刀根坂の討死名にある詫美越後守。所用具足・個人紋は未確認のため、筋兜と黒漆の具足で補う。
  // 朝倉紋は所属の目印。固有の立物・陣羽織・馬印は創作しない。
  ["詫美越後守", "suji", "none", 0x24221f, 0x2e3a52, "kebiki", 0, 0x24221f, "asakura", ""],
  ["竹中重治", "suji", "kuwa_wide", 0x1c1a1a, 0x3a3a3a, "kebiki", 0x7a1a12, 0x1c1a1a, "none", ""],
  ["下間頼旦", "suji", "horn", 0x2a2420, 0x5a4a3a, "kebiki", 0xcfc8b4, 0x2a2420, "none", ""],
  ["座光寺為清", "suji", "cross", 0x3a2622, 0x7a2a1c, "okegawa", 0xcfc8b4, 0, "takeda", ""],
  ["河田長親", "suji", "shida", 0x1c1a1a, 0x2a3a5a, "okegawa", 0x5a5a5a, 0x1c1a1a, "none", ""],
  ["海老名友清", "suji", "bellflower", 0x24221f, 0xa88a3a, "okegawa", 0x3a2a1a, 0x24221f, "none", ""],
  ["村上元吉", "zunari", "kuwa", 0x24221f, 0x6a2a1a, "sugake", 0xcfc8b4, 0x24221f, "none", ""],
  ["別所吉親", "zunari", "moon", 0x2a2420, 0xb0a890, "sugake", 0x3a2a1a, 0x2a2420, "none", ""],
  ["生石治家", "zunari", "sun", 0x24221f, 0x3a4a3a, "sugake", 0x8a4a28, 0, "none", ""],
  ["池田知正", "zunari", "kuwa_wide", 0x24221f, 0x2e3a52, "kebiki", 0x7a1a12, 0x24221f, "none", ""],
  // 有岡の岸の砦の将。立物の裏付けは未確認なので、無立物の復元案とする。
  ["渡辺勘大夫", "zunari", "none", 0x2a2420, 0x5a4630, "kebiki", 0x5a5a5a, 0x2a2420, "none", ""],
  ["百地丹波", "zunari", "cross", 0x2a2622, 0x3a3a3a, "kebiki", 0x8a6a2a, 0x2a2622, "none", ""],
  ["滝野吉政", "zunari", "shida", 0x2a2622, 0x4a3a2a, "okegawa", 0x5a5a5a, 0x2a2622, "none", ""],
  // 鳥取の守将。月・桔梗の立物は未確認。具足の色と羽織は復元案。
  ["奈佐日本之介", "zunari", "none", 0x24221f, 0x8a6a2a, "okegawa", 0x1f2a44, 0, "none", ""],
  // 鳥取の山名旧臣。所用の具足・個人紋は未確認で、筋兜・桶側胴を共用する復元案。
  // 参戦と所属：https://www.cgr.mlit.go.jp/tottori/tono/25shisanmeguri/fudoki_h19/totorijyou/shiro3.html
  ["中村春続", "suji", "none", 0x24221f, 0xb8342a, "okegawa", 0x7a1a12, 0, "none", ""],
  ["森下道誉", "momonari", "kuwa", 0x24221f, 0x4a3a2a, "okegawa", 0x8a6a2a, 0x24221f, "none", ""],
  // 高遠の守将。固有の立物は未確認。武田方の色を保つ推定復元。
  ["小山田昌行", "momonari", "none", 0x3a2622, 0x9a2e20, "sugake", 0xcfc8b4, 0x3a2622, "takeda", ""],
  // 高遠の守将。固有の立物は未確認。武田方の色を保つ推定復元。
  ["諏訪勝右衛門", "momonari", "none", 0x2a2420, 0x7a2a1c, "sugake", 0x8a6a2a, 0x2a2420, "takeda", ""],
  // 田野での立物の着用は未確認。甲冑と威の色は復元案とし、立物は創作しない。
  ["武田信勝", "momonari", "none", 0x1c1a1a, 0xa8281c, "sugake", 0x7a1a12, 0x1c1a1a, "takeda", ""],
  ["小宮山友晴", "momonari", "horn", 0x3a2622, 0x7a2a1c, "kebiki", 0x2a2622, 0, "takeda", ""],
  ["明智秀満", "namban", "akechi_ears", 0x20201b, 0x5b483c, "hotoke", 0, 0x352822, "akechi", "23582d96"],
  ["安田国継", "momonari", "shida", 0x24221f, 0x4a4a5a, "kebiki", 0x2a2a32, 0x24221f, "akechi", ""],
  // 有岡の城将。桔梗前立を裏付ける資料は未確認。黒漆の桶側胴と無立物の兜は推定復元。
  ["荒木久左衛門", "momonari", "none", 0x24221f, 0x2e3a52, "okegawa", 0x4a5a22, 0x24221f, "none", ""],
  // 上ろう塚で内応した将。具足・陣羽織・紋は未確認。既存の筋兜・桶側胴を使い、立物と紋は付けない。
  ["中西新八郎", "suji", "none", 0x24221f, 0x6a7a2c, "okegawa", 0, 0, "none", ""],
  ["六角義賢", "eboshi", "kuwa", 0x1c1a1a, 0x3a5a3a, "okegawa", 0x7a1a12, 0x1c1a1a, "none", ""],
  // 鳥取の守将。月・桔梗の立物は未確認。具足の色と羽織は復元案。
  ["吉川経家", "eboshi", "none", 0x24221f, 0x3a4a3a, "okegawa", 0x7a1a12, 0, "none", ""],
  ["羽柴秀長", "eboshi", "sun", 0x2a2420, 0x9a7a3a, "sugake", 0x6a4a1c, 0x2a2420, "toyotomi", ""],
  ["木下雅楽助", "eboshi", "kuwa_wide", 0x24221f, 0x66513b, "sugake", 0xcfc8b4, 0x24221f, "none", ""],
  ["中川金右衛門", "eboshi", "horn", 0x24221f, 0x3c5a8a, "sugake", 0x4a3a22, 0, "none", ""],
  ["山田新右衛門", "eboshi", "cross", 0x24221f, 0x66513b, "kebiki", 0xcfc8b4, 0x24221f, "none", ""],
  ["氏家卜全", "eboshi", "shida", 0x24221f, 0x66513b, "kebiki", 0x7a1a12, 0, "none", ""],
  ["真柄十郎左衛門", "eboshi", "bellflower", 0x24221f, 0x66513b, "kebiki", 0x7a1a12, 0x24221f, "none", ""],
  ["前波新八", "namban", "kuwa", 0x1c1a1a, 0x66513b, "okegawa", 0x7a1a12, 0x1c1a1a, "none", ""],
  ["長谷川橋介", "suji", "none", 0x1c1a1a, 0x8a6a2a, "okegawa", 0x5a5a5a, 0x1c1a1a, "none", ""],
  ["佐脇藤八", "suji", "none", 0x1c1a1a, 0xb8342a, "okegawa", 0x8a6a2a, 0x1c1a1a, "none", ""],
  ["野々村三十郎", "namban", "kuwa_wide", 0x1c1a1a, 0x66513b, "sugake", 0x7a1a12, 0, "none", ""],
  ["福富平左衛門", "namban", "horn", 0x1c1a1a, 0x66513b, "sugake", 0x4a5a22, 0x1c1a1a, "none", ""],
  // 利治の南蛮兜・十字の立物は未確認。色と陣羽織は復元案、兜は立物のない筋兜にする。
  ["斎藤利治", "suji", "none", 0x1c1a1a, 0xd8d0bc, "sugake", 0x8a6a2a, 0x1c1a1a, "none", ""],
  // 北国出陣の不破光治。所用具足は未確認。黒漆の筋兜と素懸威で補い、固有の立物・家紋は創作しない。
  ["不破光治", "suji", "none", 0x1c1a1a, 0xd8d0bc, "sugake", 0x4a5a22, 0x1c1a1a, "none", ""],
  // 公記巻十の氏家左京亮・原彦二郎。所用具足は未確認なので、黒漆の筋兜・素懸威で補う。
  // 父の氏家卜全の姿を流用せず、立物・陣羽織・個人紋・馬印は足さない。
  // https://ja.wikisource.org/wiki/信長公記
  ["氏家直昌", "suji", "none", 0x1c1a1a, 0x9a2e20, "sugake", 0, 0x1c1a1a, "none", ""],
  ["原彦二郎", "momonari", "none", 0x1c1a1a, 0xd8d0bc, "sugake", 0, 0x1c1a1a, "none", ""],
  ["高橋虎松", "namban", "shida", 0x1c1a1a, 0x66513b, "kebiki", 0x4a5a22, 0x1c1a1a, "none", ""],
  ["菅屋角蔵", "namban", "bellflower", 0x1c1a1a, 0x66513b, "kebiki", 0x7a1a12, 0x1c1a1a, "none", ""],
  ["松平忠明", "momonari", "kuwa", 0x29251f, 0x2e3a52, "kebiki", 0, 0, "none", ""],
  ["片倉重長", "momonari", "moon", 0x29251f, 0x3c5a8a, "okegawa", 0, 0x29251f, "none", ""],
  // 三木の出撃将。所用具足・立物・個人紋は未確認。共通の筋兜・桶側胴で復元。
  ["別所甚太夫", "suji", "none", 0x29251f, 0xd8d0bc, "okegawa", 0xcfc8b4, 0x29251f, "none", ""],
  ["別所三太夫", "momonari", "none", 0x29251f, 0x6a6a6a, "okegawa", 0, 0x29251f, "none", ""],
  ["山崎長徳", "momonari", "kuwa_wide", 0x29251f, 0x2e3a52, "okegawa", 0, 0x29251f, "none", ""],
  ["寺沢広高", "eboshi", "horn", 0x29251f, 0x2e3a52, "sugake", 0, 0x29251f, "none", ""],
  ["平岡頼勝", "suji", "cross", 0x29251f, 0x2a2a2a, "sugake", 0x2e3a42, 0, "none", ""],
  // 所用の立物・旗印・馬印は未確認。具足の色と作りは復元、立物と個人の紋は無印に留める。
  ["青地茂綱", "suji", "none", 0x29251f, 0x6a6a6a, "sugake", 0xcfc8b4, 0x29251f, "none", ""],
  ["武藤五郎右衛門", "suji", "none", 0x29251f, 0xd8d0bc, "kebiki", 0x5a5a5a, 0x29251f, "none", ""],
  ["肥田彦左衛門", "zunari", "none", 0x24221f, 0x3c5a8a, "kebiki", 0xcfc8b4, 0x24221f, "none", ""],
  ["真田昌輝", "zunari", "none", 0x24221f, 0x3c5a8a, "kebiki", 0x3a6a72, 0x24221f, "sanada", ""],
  ["佐久間信栄", "zunari", "none", 0x24221f, 0x8a6a2a, "okegawa", 0x4a3a22, 0, "none", ""],
  ["氏家直通", "zunari", "none", 0x24221f, 0xd8d0bc, "okegawa", 0x4a3a22, 0x24221f, "none", ""],
  ["伊賀伊賀守", "zunari", "none", 0x24221f, 0x6a6a6a, "okegawa", 0x4a3a22, 0x24221f, "none", ""],
  ["本多重次", "zunari", "cross", 0x24221f, 0x66513b, "sugake", 0x5a5a5a, 0x24221f, "none", ""],
  ["毛利秀頼", "zunari", "shida", 0x24221f, 0x2e3a52, "sugake", 0x4a3a22, 0x24221f, "none", ""],
  // 銀白の具足は桃山期（仙台市博物館所蔵）。永禄期の藤吉郎は黒漆の筋兜・胴丸で補う復元案。
  // https://www.city.sendai.jp/museum/shuzohin/shuzohin/shuzohin-05.html
  // 若い頃の秀吉。所用品は伝わらず、頭形の兜に朽葉の威の軽い具足の復元案。後年の馬藺の兜や桐紋は使わない。
  ["木下藤吉郎", "zunari", "none", 0x2a2420, 0x8a6a2a, "kebiki", 0x7a1a12, 0, "none", ""],
  ["豊臣秀吉", "suji", "toyotomi_horns", 0xa2a19a, 0xe4dfcc, "sugake", 0, 0xa62b1d, "toyotomi", "deb38af9"],
  ["明智光春", "namban", "akechi_ears", 0x20201b, 0x5b483c, "hotoke", 0, 0x352822, "akechi", "23582d96"],
  ["蜂須賀小六", "zunari", "cross", 0x2a1c18, 0x7a2a1c, "sugake", 0x7a1a12, 0x2a1c18, "hachisuka", ""],
  // 一鉄と同じ人物。通称によって立物を変えない。
  ["稲葉良通", "zunari", "none", 0x2a2420, 0x5a4a2a, "kebiki", 0xcfc8b4, 0, "inaba", ""],
  ["竹中半兵衛", "suji", "kuwa_wide", 0x1c1a1a, 0x3a3a3a, "kebiki", 0x7a1a12, 0x1c1a1a, "none", ""],
  ["本多作左", "zunari", "cross", 0x24221f, 0x66513b, "sugake", 0x5a5a5a, 0x24221f, "none", ""],
  // 信長公記巻八の呼称を使う。浅野長政や毛利輝元の装備・家紋を流用しない。
  ["毛利河内", "zunari", "none", 0x24221f, 0x6a2a5a, "sugake", 0x7a1a12, 0x24221f, "none", ""],
  ["浅野左近", "suji", "none", 0x24221f, 0xa88a3a, "okegawa", 0x8a6a2a, 0, "none", ""],
  ["猿荻甚太郎", "zunari", "none", 0x2a2420, 0xb0a890, "sugake", 0x4a3a22, 0, "none", ""],
  ["土屋昌次", "zunari", "bellflower", 0x3a2622, 0x9a2e20, "kebiki", 0x3a2622, 0, "takeda", ""],
  // 箕作を攻める浅井新八。長政と同一視せず、個人紋・立物・羽織は未確認として補う。
  ["浅井新八", "zunari", "none", 0x24221f, 0x3c5a8a, "kebiki", 0, 0, "none", ""],
  // 10/28 戦・台詞に出て決まりの無かった人。所用品の確かな記録の無い人は、立物を付けない復元案。
  // 金陀美具足（久能山東照宮・重要文化財）：大高城の兵糧入れで若い元康が着たと伝わる金溜塗の具足。
  ["松平元康", "suji", "none", 0xb08a3a, 0x8a6a2a, "okegawa", 0, 0, "tokugawa", ""],
  ["宮部継潤", "zunari", "none", 0x2a2420, 0x3c5a8a, "okegawa", 0x8a6a2a, 0, "none", ""],
  ["朽木元綱", "momonari", "none", 0x1c1a1a, 0x5a2a1c, "okegawa", 0, 0, "none", ""],
  ["斎藤義龍", "momonari", "none", 0x22241e, 0x4a3a5a, "kebiki", 0x2a2a3a, 0x22241e, "saito", ""],
  ["松平忠輝", "suji", "none", 0x1c1a1a, 0xb0a890, "kebiki", 0xcfc8b4, 0x1c1a1a, "tokugawa", ""],
]) {
  KACCHU[name] = { bowl, crest, armor, helm: armor, lace, odo: lace, doStyle, haori, menpo, menpoStyle: "hanbo", mon, ref, hat: "kabuto", hatFix: 1, lac: armor === 0xa52b1c || armor === 0x8e1f16 ? "shu" : "kuro", fuki: "kuro" };
}
// 同じ人物の別名に別の兜や威を割り当てない。
KACCHU["氏家卜全"] = KACCHU["氏家直元"];
// 同じ人物の別名に別の兜や威を割り当てない。
KACCHU["蜂須賀小六"] = KACCHU["蜂須賀正勝"];
// 忠勝の数珠、康政の白熊、秀吉の馬毛、信玄の白熊、清正の片肌脱ぎは共通形へ結合する。
KACCHU["佐久間信盛"].flag = "sakuma";
KACCHU["本多忠勝"].juzu = true;
KACCHU["榊原康政"].fur = 0xe4dfcc;
for (const name of ["羽柴秀吉", "豊臣秀吉"]) KACCHU[name].fur = 0x6d5440;
// 信玄（kaito の手本 reports/ref/generals/takeda_shingen.webp を物差しに。絵は貼らない）：諏訪法性の兜（白熊・金の鍬形と獅子）、
//   朱の威の袖と草摺、金の瓦佩楯、朱の家地に金の篠の脛当。手本は後の世の写しの具足で、伝来品そのものではない（復元案）
Object.assign(KACCHU["武田信玄"], { hat: "kabuto_suwa", crest: "none", lace: 0xb02a1c, odo: 0xb02a1c, kusazuriColor: 0xb02a1c,
  haidateGold: true, suneateColor: 0xc9a24a, suneateGold: true, suneateCloth: 0x9a241a });
// 謙信（手本 uesugi_kenshin.png を物差しに）：紺の糸の威に朱と白の段、金の小さな前立（飯綱）、黒漆の脛当。復元案
Object.assign(KACCHU["上杉謙信"], { crest: "kenshin_izuna", lace: 0x1a2238, odo: 0x1a2238, doStyle: "kebiki",
  doLaceBands: [[1.02, 0x1a2238], [1.1, 0xb02a1c], [1.15, 0xe6e0d0], [1.22, 0xb02a1c], [1.32, 0x1a2238], [Infinity, 0xb02a1c]],
  sodeLaceBands: [[1.2, 0x1a2238], [1.27, 0xb02a1c], [1.31, 0xe6e0d0], [1.35, 0xb02a1c], [Infinity, 0x1a2238]],
  suneateColor: 0x111012, suneateCloth: 0x1a2238 });
// 三方ヶ原の備の表示名でも同じ具足を使う。
KACCHU["武田信豊（典厩）"] = KACCHU["武田信豊"];
KACCHU["武田信廉（逍遥軒）"] = KACCHU["武田信廉"];
KACCHU["加藤清正"].skinDo = 0x875749;
KACCHU["前田利家"].fur = 0x9c9584;
// 手取川専用。利家の金小札に、伝来具足の白糸素懸威と金箔押熨斗烏帽子形兜を合わせる。
// 石川県立美術館「前田家 武の装い2」：
// https://www.pref.ishikawa.lg.jp/ishibi/events/20170601_1.html
// 手取川当日の着用を示すものではなく、よく知られた姿による復元案。
// 成政の角の立物は裏付けを確認できないため付けない。具足・陣羽織の配色は従来の復元を使う。
// 戦の読み込み時にだけ作り、近景・遠景で同じ部品と材質を使い回す。
export const TEDORIGAWA_KACCHU = {
  // 謙信の伝所用筋兜は飯綱明神像の前立。日輪と瑞雲から伝来品に基づく姿へ。
  // 山形県「色々威腹巻 兜、壺袖付」：
  // https://www.pref.yamagata.jp/cgi-bin/yamagata-takara/?id=1072&m=detail
  // 閲兵にも用いられた伝来品を参考とする復元案で、手取川での着用は未確認。
  // 稽照殿の所蔵品解説では、胴・袖は上から紫・紅・紫、以下は草摺まで藍韋。
  // https://uesugi-keishoden.jp/
  // 山形県は主体の韋を黒韋と記すため、藍は黒に近い色で補う。色の境と染色は復元案。
  '上杉謙信': { ...KACCHU['上杉謙信'], crest: 'kenshin_izuna', doStyle: 'kebiki',
    // 姫鶴一文字の附属拵は、鐔なし・藍韋平巻で、目貫は表裏同じ位置。
    // 米沢市上杉博物館の解説を参考に拵えだけ補う。当日の刀銘・所用は断定しない。
    // https://www.denkoku-no-mori.yonezawa.yamagata.jp/togodb/capt.php?ID=17039
    // 刃の長さ・反り・攻撃の型・間合いは従来どおり。
    swordMount: 'kenshin_aikuchi',
    // 本人の指物も本陣脇と同じ「毘」にそろえる。竹に雀は家紋として保つ。
    // 米沢市上杉博物館の伝来軍旗を参考にした復元で、当日の指物の所用は未確認。
    // https://www.denkoku-no-mori.yonezawa.yamagata.jp/012tatakau.htm
    flag: 'uesugi_bi',
    // 同資料の六十一間総覆輪。汎用の筋模様ではなく、鉢の各間の縁を金で覆う。
    sujiPlates: 61,
    // 同資料の錣は三枚。近景でも汎用の四段へ戻さず、上二枚に吹返しを添える。
    shikoroRows: 3, fukigaeshiRows: 2,
    // 稽照殿の所蔵品解説にある二重錣を補う。外の三枚錣とは別に首沿いの内錣を置く。
    // 内側の段数・寸法・威色は復元案。手取川当日の着用は断定しない。
    doubleShikoro: true,
    // 同資料は腹巻。毛引威の模様だけでなく、背で引き合わせる作りも示す。
    // 引合緒の位置と寸法は復元案。当日の着用は断定しない。
    backOpening: true,
    // 山形県の上記解説は六段下りの壺袖。汎用の平たい袖でなく、裾を内へ絞る。
    // 湾曲の寸法は復元案。六段の色々威と共通の形・材質の共有は保つ。
    // 冠板は壺袖の折冠を参考に上端を外へ折る。細部と当日の着用は復元案。
    sodeShape: 'tsubo',
    // 高さの低い方から指定する。胴・袖とも最上段の紫を落とさず、同じ順に威す。
    // 共通の色分け処理を使い、袖の表と重ねる糸、草摺の色もそろえる。
    lace: 0x1c2029, odo: 0x1c2029,
    doLaceBands: [[1.05, 0x1c2029], [1.17, 0x703d78], [1.30, 0x9a302d], [Infinity, 0x703d78]],
    // 六段の袖板（一・三九から一・一五）の境へ色を合わせる。
    // 上から紫・紅・紫を各一段、下三段を藍韋とする復元案。
    // 紅が二段を占め、紫と藍の境が一段下へずれていた指定を直す。
    // 板表と重ねる糸は同じ表を参照し、形・材質は既存の共有物を使う。
    sodeLaceBands: [[1.27, 0x1c2029], [1.31, 0x703d78], [1.35, 0x9a302d], [Infinity, 0x703d78]] },
  // 勝家の大鍬形を所用とする根拠は未確認。手取川では立物なしの桃形兜で補う。
  // 具足・陣羽織の色は復元案。雁金の旗と大身槍は従来の指定を使う。
  // 福井市立郷土歴史博物館の展示目録も、伝所用の金箔馬印を江戸時代としているため流用しない。
  // https://www.history.museum.city.fukui.fukui.jp/tenji/kaisetsusheets/18.pdf
  // 徒歩では大身槍を頭上で回さず、後ろ足で踏ん張り、腰を返す突きで剛勇を示す。
  // 当日の槍術を示す史料ではなく復元演出。利家と同じ既存の型を使い回す。
  // 馬上の鐙を踏む動きと、攻撃の間合い・威力・間隔は保つ。
  '柴田勝家': { ...KACCHU['柴田勝家'], crest: 'none', spearThrust: true },
  // 二本松市「広報にほんまつ」平成三十年六月号九頁の、伝長秀・長重着用
  // 「金花猫塗唐冠兜」を参考に、汎用の筋兜から冠形の鉢・左右の纓・獅子頭の前立へ。
  // https://www.city.nihonmatsu.lg.jp/data/doc/1527481349_doc_18_0.pdf
  // 手取川当日の着用は未確認。寸法・塗り・細かな表情は復元案。
  // 胴・陣羽織・筋違の旗・素槍は従来の指定を使い、豪傑の型や馬印は足さない。
  // 胴の素懸威に袖・錣もそろえる。身分の既定値で、この二部位だけ毛引威に戻さない。
  // 上記資料は兜の参考であり、威し方は当日の所用を断定しない復元案。
  // 近景・遠景とも既存の素懸威の形と材質を共有する。
  // 草摺も既存の五段の板に威糸を五段合わせる。汎用の四段分では板の継ぎ目からずれる。
  // 板の段数は伝来兜の資料からの断定ではなく、従来の具足の復元形を保つ。
  '丹羽長秀': { ...KACCHU['丹羽長秀'], bowl: 'tokan', crest: 'niwa_shikami',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 岐阜関ケ原古戦場記念館の利家所用兜の複製展示を形の参考にする。
  // https://sekigahara.pref.gifu.lg.jp/news/p4363/
  // 文化遺産データベースの兜高は錣を含め六十八・五センチ。鉢だけをその高さにしない。
  // https://online.bunka.go.jp/db/heritages/detail/184472
  // 同具足の由緒は天正十二年。手取川での着用を断定せず、よく知られた姿の復元とする。
  '前田利家': { ...KACCHU['前田利家'], bowl: 'noshi_eboshi',
    // 上記の金小札具足に合わせ、胴・袖・草摺の札を金箔の材質にする。
    // 黄土色の漆の反射へ戻さず、白糸は布のまま保つ。当日の着用は未確認。
    kozaneFinish: 'gold',
    // 天正三年には府中三人衆。若年の赤母衣衆の装いを、この戦にも自動で引き継がない。
    // 越前市「企画展 府中三人衆と越前」：
    // https://www.city.echizen.lg.jp/office/010/0501/futyu3.html
    // 当日の母衣の所用は未確認なので付けない復元案。共通の母衣指定は指物を隠すため、
    // ここで外し、既存の梅鉢の指物を見せる。旗の筆形・当日の所用も断定しない。
    horo: 0, flag: 'maeda',
    // 胴丸は右脇で引き合わせる。色だけの筒にせず、脇の合わせと引合緒を示す。
    // 兵庫県立歴史博物館「胴丸」。緒の位置と寸法は復元案。
    // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
    rightOpening: true,
    // 草摺の五段の板に、白糸の模様も五段を合わせる。汎用の四段分へ戻さない。
    // 板の形は既存の復元を保ち、近景・遠景とも同じ威糸の間隔にする。
    kusazuriLaceRows: 5,
    // 長い朱柄の槍は頭上で回さず、腰と後ろ足を使う突きで剛勇を示す。
    // 当日の槍術を示す史料はなく復元演出。間合い・威力・攻撃間隔は変えない。
    spearThrust: true,
    // 鯰尾兜の共通指定から毛飾りを引き継がない。上記の熨斗烏帽子形兜を参考とし、
    // この兜で所用を確認できない毛飾りは足さず、金箔押の鉢の輪郭を見せる。
    fur: 0,
    // 胴・袖に加え、錣も白糸素懸威として補う。身分による汎用の毛引威へ戻さない。
    // 上記の伝来具足を参考とする復元案で、当日の錣の威し方は断定しない。
    lace: 0xe4dfcc, odo: 0xe4dfcc, doStyle: 'sugake', sodeStyle: 'sugake', shikoroStyle: 'sugake' },
  // 成政も天正三年から府中三人衆。若年の黒母衣衆の姿を自動で引き継がない。
  // 越前市「越前市の歴史年表」：
  // https://www.city.echizen.lg.jp/office/090/030/echizenshinorekisi.html
  // 当日の母衣の所用は未確認なので外す復元案。母衣で隠れていた棕櫚の指物を見せる。
  // 指物の当日の所用・筆形も断定せず、既存の紋と形を使う。得物と動きは従来どおり。
  // 胴の素懸威に袖・錣もそろえる。名将の身分による既定の毛引威へ戻さない。
  // 所用具足の伝来を確認できないため、当日の着用を断定しない復元案。
  // 近景・遠景とも既存の素懸威の形と材質を共有し、得物・動き・強さは保つ。
  // 草摺は従来の五段の板へ威糸の五段を合わせる。当日の所用具足を新たに断定しない。
  // 灰色の陣羽織も所用の裏付けがないため、この戦では外して素懸威の具足を見せる。
  // 着用しなかったと断定するものではなく、利治・稲葉と同じ方針の復元案。
  // 棕櫚の指物・素槍・動きは保ち、既存の具足の形と材質を使う。
  '佐々成政': { ...KACCHU['佐々成政'], crest: 'none', horo: 0, haori: 0, flag: 'shuro',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 利治も所用の陣羽織は未確認。殿の稲葉と同じく、この戦では具足を表に出す復元案。
  // 汎用の紫灰色の陣羽織を固有の装いとして引き継がず、黒漆の筋兜・素懸威と素槍を保つ。
  // 個人の旗印・馬印も補わない。隊の織田旗と兵数、攻撃の型・威力は従来どおり。
  // 胴に合わせ、袖・錣も素懸威で補う。身分の既定値による毛引威を混ぜない。
  // 当日の所用を示す指定ではなく、既存の形と材質を使う復元案。
  // 草摺も既存の五段の板へ威糸を五段合わせ、素懸威の既定の四段によるずれを除く。
  '斎藤利治': { ...KACCHU['斎藤利治'], haori: 0, flag: null, pole: false,
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 稲葉の清水神社伝来具足は伊予小札の素懸威・最上胴丸。汎用の毛引威から替える。
  // 岐阜県「素懸威鎧兜（稲葉一鉄着領）附鎧櫃」：
  // https://www.pref.gifu.lg.jp/page/6052.html
  // 胴丸の右脇の引き合わせも既存の共有部品で補う。細部の形・配色と当日の着用は復元案。
  // 袖と錣も素懸威で補う。胴だけの指定では、侍大将の汎用の毛引威が両部位に残る。
  // 上記の素懸威具足を参考に威し方をそろえる復元案。錣の威し方は同解説に明記されていない。
  // 近景・遠景とも既存の素懸威の形と材質を共有し、当日の所用は断定しない。
  // 兜の立物・陣羽織は未確認のまま足さず、得物・動き・兵数・威力は保つ。
  // 草摺の素懸威も既存の五段の板へ五段合わせ、汎用の四段分による継ぎ目のずれを除く。
  // 同資料に草摺の段数の明記はなく、形・寸法と当日の着用は従来どおり復元案。
  '稲葉良通': { ...KACCHU['稲葉良通'], crest: 'none', haori: 0,
    doStyle: 'sugake', sodeStyle: 'sugake', shikoroStyle: 'sugake', rightOpening: true, kusazuriLaceRows: 5 },
  // 安藤の当日の所用具足と立物は未確認。大鍬形を断定せず、既存の配色で補う。
  '安藤守就': { ...KACCHU['安藤守就'], crest: 'none', mon: 'none' },
  // 伊賀伊賀守は安藤守就の別名。別人の角付き兜を割り当てず、同じ復元を使う。
  '伊賀伊賀守': { ...KACCHU['安藤守就'], crest: 'none', mon: 'none' },
  // 三将の胴は素懸威で補っているが、袖・錣は身分の既定値で毛引威になっていた。
  // この戦の復元案として袖・錣も素懸威にそろえる。当日の所用具足は未確認。
  // 既存の形・材質を共有し、固有の立物・旗印・馬印や豪傑の型は補わない。
  // 草摺は五段の板へ威糸も五段合わせる。四段の絵を引き伸ばして継ぎ目からずらさない。
  // 段数は既存の復元形に合わせる指定であり、当日の所用を示すものではない。
  '不破光治': { ...KACCHU['不破光治'], sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  '氏家直昌': { ...KACCHU['氏家直昌'], sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  '原彦二郎': { ...KACCHU['原彦二郎'], sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 長近は伝着用の緋羅紗陣羽織（日枝神社蔵）を参考に、汎用の青灰色から緋色へ。
  // 高山市の展示資料による伝来品で、手取川当日の着用や正確な染色は確定しない。
  // 鶴毛陣羽織は秀吉拝領の伝承なので、この戦の姿には混ぜない。
  // https://www.city.takayama.lg.jp/_res/projects/default_project/_page_/001/001/021/sumitake.pdf
  // https://www.city.takayama.lg.jp/_res/projects/default_project/_page_/001/008/306/akitirasi.pdf
  // 金森家は裏梅鉢。隊の既定値で織田の木瓜を本人の指物にしない。
  // 高山市の公式観光資料は家紋・白旗の馬印を紹介するが、手取川当日の所用は未確認。
  // https://www.hidatakayama.or.jp/special/detail_345.html
  // 裏梅鉢を緋の陣羽織に補う。紋の位置・白い染めは復元案で、当日の所用は断定しない。
  // 既存の紋の絵の空き枠と共通の陣羽織の形・材質を使い回す。
  // この戦では指物・受筒を付けず、陣羽織と素槍で姿を示す。隊の旗と戦う人数は保つ。
  // 岐阜県博物館報第一号「美濃・飛騨の甲冑」二十七頁の伝長近所用具足を参考にする。
  // https://www.gifu-kenpaku.jp/wp-content/uploads/2022/09/岐阜県博物館_館報第1号_昭和52年度（1978）.pdf
  // 越中頭形兜、紫糸素懸威の胴、紺糸素懸威の錣。筋兜・青い胴の威から替える。
  // 袖は欠失し、同書は陣羽織着用のためと推定する。袖を足さない復元案とする。
  // 同資料の金箔塗七間五段の草摺を補う。胴・兜は金にせず、威糸も紫の布のまま保つ。
  // 同資料の裾板の熊毛植毛も補う。手取川当日の着用は未確認。
  // 毛の長さ・黒褐色と胴の形は復元案。毛の絵と草摺の共有部品へ結合し、更新処理は足さない。
  // 錣の紺と胴の紫を分け、近景・遠景とも共有の形と材質へ組み込む。
  '金森長近': { ...KACCHU['金森長近'], bowl: 'zunari', doStyle: 'sugake',
    kusazuriColor: 0xc9a24a, kusazuriFinish: 'gold', kusazuriLaceRows: 5, kusazuriFur: 0x211b17,
    lace: 0x604269, odo: 0x604269, shikoroLace: 0x28334f, shikoroStyle: 'sugake', sode: false, haori: 0xa62b1d,
    haoriMon: 'kanamori', haoriMonCol: 0xe6dfcf, flag: null, pole: false },
};
// 稲葉一鉄と良通は同一人。伝来の素懸威具足を別名でも共用し、桔梗の立物へ戻さない。
// 参考資料は上記の岐阜県の解説。当日の着用は断定しない。
TEDORIGAWA_KACCHU['稲葉一鉄'] = TEDORIGAWA_KACCHU['稲葉良通'];
// 森部（永禄四年）専用の復元。南蛮兜・金鯰尾の後年の姿を流用しない。
// 利家所用の金小札具足は安土桃山時代：東京国立博物館の展示解説。
// https://www.tnm.jp/modules/r_free_page/index.php?id=2740&lang=ja
// この戦の具足・立物・陣羽織の実物は確認できないため、黒漆の筋兜と毛引威で補う。
export const MORIBE_KACCHU = {};
for (const name of ["織田信長", "前田利家", "日比野下野守", "長井甲斐守", "足立六兵衛"]) {
  const base = KACCHU[name];
  MORIBE_KACCHU[name] = { ...base, bowl: "suji", crest: "none", doStyle: "kebiki", haori: 0,
    armor: 0x22241e, helm: 0x22241e, lac: "kuro", fur: 0, ref: "" };
}
// 勘当中の私的な参戦。赤母衣衆の役目の姿を固定しない（装いは復元）。
MORIBE_KACCHU["前田利家"].horo = 0;
MORIBE_KACCHU["前田利家"].flag = null;
MORIBE_KACCHU["前田利家"].pole = false;
// 斎藤方の三人の個人紋は未確認。隊の斎藤の旗は保ち、具足に主家の紋を刻まない。
MORIBE_KACCHU["足立六兵衛"].mon = "none";
// 桶狭間の所用具足は確定していないため、永禄期の和式具足による復元案。
// 南蛮胴の伝来だけでは信長の当日着用を裏付けられない。後年の姿と分ける。
// 参考：https://emuseum.nich.go.jp/detail?content_base_id=100509&content_part_id=001
export const OKEHAZAMA_KACCHU = {
  "織田信長": { ...KACCHU["織田信長"], bowl: "suji", crest: "kuwa", doStyle: "kebiki", haori: 0 },
  // 山田は今川の旗本。個人の立物・家紋は不明なので立物を外し、所属の紋で補う。
  "山田新右衛門": { ...KACCHU["山田新右衛門"], bowl: "suji", crest: "none", mon: "imagawa", haori: 0 },
};
// 熱田神宮の解説では真柄十郎左衛門直隆。同じ人の具足を通称でも使う。
// https://atsutajingu.or.jp/houmotukan_kusanagi/kusanagi/
// 甲冑の細部は復元案。通称だけに別の烏帽子兜・桔梗紋を割り当てない。
KACCHU["真柄十郎左衛門"] = KACCHU["真柄直隆"];
// 同じ人の別の呼び名（原田直政は天正三年からの塙直政、藤吉郎は木下藤吉郎）。
KACCHU["原田直政"] = KACCHU["塙直政"];
KACCHU["藤吉郎"] = KACCHU["木下藤吉郎"];
// 走る足軽の強右衛門と、名のない役目名は武将の甲冑へ替えない。
for (const name of ["鳥居強右衛門", "今川方の侍大将", "浅井の殿の侍大将", "朝倉の侍大将"]) delete KACCHU[name];

// 小谷の夜攻め専用。所用具足の確証はないため、当時の筋兜・黒漆の具足で復元する。
// 後年の秀吉の具足写真や桐紋を、天正元年の姿の根拠にはしない。
// 長浜城歴史博物館の小谷籠城期の頭形兜：https://nagahama-rekihaku.jp/digital-museum/15
export const ODANI_KACCHU = {
  '羽柴秀吉': { ...KACCHU['羽柴秀吉'], crest: 'none', armor: 0x2a2420, helm: 0x2a2420,
    lace: 0x7a5a2a, odo: 0x7a5a2a, haori: 0x6a4a1c, menpo: 0, mon: 'none', fur: 0, ref: '' },
};
// 元亀二年の比叡山専用。勝家の当日の具足・立物・陣羽織は未確認。
// 桃形鉢と大鍬形を本人固有の姿として固定せず、筋兜・立物なしの復元とする。
// 色と威は既存の物を共用し、鬼柴田の豪傑の型は既存の強い突きで示す。
export const HIEIZAN_KACCHU = {
  // 京都国立博物館の伝信長所用・紺糸威胴丸を参考にする。当日の着用は未確認。
  // https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
  // 四十間筋兜の鍬形に、黒漆地・金の織田木瓜の前立を添える。陣羽織は補わない。
  // 胴丸の右脇の引き合わせも復元。締め紐の位置と結び方は描画上の補い。
  // 伝来品に付属する大袖（長さ三十六・四センチ）と十二間の草摺も補う。幅や吊るす位置は復元。
  // 同館が小形とする錣も補う。段数は既存のまま、広がりと垂れの寸法は復元。
  // 草摺長二十八・八センチも同館の解説に合わせる。吊るす高さと裾の広がりは復元。
  // 鉢高十・八センチ。頭へ合わせる縮小後も、同館の実測高になるよう指定する。
  // 顎下で留める兜の緒も補う。色・結び方・通し位置は当日の装束を確定しない復元。
  // 兜の緒の役目：https://www.touken-world.jp/tips/11037/
  // 本小札の重なりも胴の形に補う。札の枚数・厚みは実測ではなく復元。
  '織田信長': { ...KACCHU['織田信長'], sujiPlates: 40, bowlHeight: 0.108, shinodare: false, crest: 'oda_kuwa', shikoroStyle: 'compact', helmetCord: true, doOpening: 'right', honkozane: true, sodeStyle: 'osode', kusazuriCount: 12, kusazuriLength: 0.288, haori: 0, ref: '' },
  // 共通の侍大将に付く金の三本篠垂も、本人の装飾として確認できないため補わない。
  // 三将の緒も信長と同じ共有形で補う。色・結び方は本人所用の再現ではなく復元。
  // 密集した山道では頭上で槍を回さず、後ろ足で踏ん張って腰を返す既存の型を使う。
  // 本人の槍術を断定しない演出。豪傑の指定・馬上の動き・攻撃の強さは保つ。
  // 桶側胴に付く袖・錣は素懸威で補い、侍大将の既定の毛引威へ戻さない。
  // 本人所用の具足は未確認。既存の板・威糸を使い、配色と剛勇の動きは保つ。
  // 錣は近景の四段を遠景でも保つ。段数は既存の復元形で、本人所用の断定ではない。
  '柴田勝家': { ...KACCHU['柴田勝家'], bowl: 'suji', crest: 'none', shinodare: false, helmetCord: true, haori: 0, ref: '', flag: 'kari', spearThrust: true,
    sodeStyle: 'sugake', sodeCrownFit: true, shikoroStyle: 'sugake', shikoroRows: 4, kusazuriLaceRows: 5, kusazuriStepped: true },
  // 信盛の当日の装束は未確認。筋兜・立物なしの既存具足で補い、陣羽織は足さない。
  // 丸の内に三引両は家紋による復元で、比叡山での旗色や使用を断定しない。
  // 信盛も立物だけでなく、根拠未確認の金の三本篠垂を補わない。
  // 胴の素懸威に袖・錣もそろえ、草摺は五段の板と威糸の段を合わせる。
  // 当日の所用具足は未確認。配色と形は既存の共有部品による復元案。
  // 信盛も近景の四段の錣を遠景で保ち、最下段が消えて首元が開くのを防ぐ。
  '佐久間信盛': { ...KACCHU['佐久間信盛'], shinodare: false, helmetCord: true, haori: 0, ref: '',
    sodeStyle: 'sugake', sodeCrownFit: true, shikoroStyle: 'sugake', shikoroRows: 4, kusazuriLaceRows: 5, kusazuriStepped: true },
  // 井伊美術館の伝光秀所用・紅糸縅本小札二枚胴具足を参考にした復元案。
  // https://www.ii-museum.jp/blank-27
  // 黒漆・紅糸の毛引威と六十二間筋兜の三鈷剣前立。当日の着用・陣羽織は未確認。
  // 桔梗は既存の家紋と指物に保ち、後代の具足櫃の紋から立物を作らない。
  // 二枚胴の前後の分割と左脇の蝶番も補う。構造の参考：兵庫県立歴史博物館。
  // https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_touseigusoku/
  // 黒漆の筋鉢と三鈷剣を保ち、同館の解説で確認できない金の三本篠垂は補わない。
  // 胴・草摺以外は切付小札という同館の解説に合わせ、袖と錣は一枚の板に札頭の刻みを付ける。
  '明智光秀': { ...KACCHU['明智光秀'], sujiPlates: 62, shinodare: false, helmetCord: true, crest: 'sankoken', doStyle: 'kebiki', doOpening: 'nimai', honkozane: true, sodeStyle: 'kiritsuke', shikoroStyle: 'kiritsuke',
    lace: 0x9a2e20, odo: 0x9a2e20, haori: 0, menpo: 0, ref: '' },
};
// 四将の吹返しに共通処理の丸い金具を補わない。本人所用の紋金具としては未確認。
// 金具が無かったとの断定ではなく、根拠のない固有装飾を足さない復元案。
for (const armor of Object.values(HIEIZAN_KACCHU)) armor.fukigaeshiBadge = false;
// 既存の八幡座の下に天辺の穴を補う。一般的な筋兜の構造による復元で、本人所用の穴径は未確認。
// https://www.kazo-dmuseum.jp/04visit/02castle/05-05-01.htm
// 勝家・信盛の筋兜にも同じ構造を補う。八幡座の下を鉢で塞がず、近遠で保つ。
for (const name of ['織田信長', '明智光秀', '柴田勝家', '佐久間信盛']) HIEIZAN_KACCHU[name].tehenHole = true;
// 肩上と胸板を高紐と留め具でつなぐ。寸法・通し方は本人所用の実測ではなく復元。
// 名古屋刀剣博物館の構造解説：https://www.meihaku.jp/armor-basic/yoroitoha/
for (const name of ['織田信長', '明智光秀']) HIEIZAN_KACCHU[name].takahimo = true;
// 勝家・信盛も肩上から胸板への結着を補う。本人所用の形ではなく一般的な構造の復元。
// 小学館『デジタル大辞泉』「高紐」：https://kotobank.jp/word/高紐-559420
// 信長・光秀と同じ共有形を使い、遠くで肩と胸の緒が途切れないようにする。
for (const name of ['柴田勝家', '佐久間信盛']) HIEIZAN_KACCHU[name].takahimo = true;
// 長島の木下小一郎（秀長）専用。日輪前立・烏帽子形の所用は未確認。
// 筋兜と黒漆の素懸威、威の色は共通部品による復元。
// 後年の豊臣の桐紋を遡らせず、木瓜は織田方の所属だけを示す。
export const NAGASHIMA_KACCHU = {
  // 信長は伝所用の紺糸威胴丸を参考にする。長島当日の着用を断定するものではない。
  // 京都国立博物館：https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
  // 共通設定の鍬形と木瓜前立の組み合わせを遡らせず、立物なしの筋兜で復元する。
  // 黒漆・紺の毛引威を保ち、木瓜は所属の紋、永楽通宝は本陣の旗で示す。
  // 胴丸は右脇で引き合わせる。伝来品を参考にした毛引威の胴へ、既存の開きと引合緒を指定する。
  // 兵庫県立歴史博物館：https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_doumaru/
  // 開きと緒の寸法は復元。共有する胴の形へ結合し、毎コマの処理は増やさない。
  '織田信長': { ...KACCHU['織田信長'], crest: 'none', haori: 0, menpo: 0, horo: 0,
    rightOpening: true, ref: '' },
  // 一江口の信忠と、包囲に加わる信広・信次にも長島専用の復元を指定する。
  // 参戦・一門の討死：信長公記巻七、東京大学史料編纂所「大日本史料第十編之二十四」。
  // https://www.hi.u-tokyo.ac.jp/publication/syoho/38/pub_shiryo-10-24/
  // 三人の当日の陣羽織・面頬・母衣は未詳。共通名簿の赤い陣羽織と面頬を引き継がず、
  // 筋兜・無立物・黒漆具足と威の復元色を保つ。木瓜は織田方の所属だけを示す。
  // 既存の指揮像と腰の刀を使い、固有の名刀・馬印・豪傑の型は補わない。
  '織田信忠': { ...KACCHU['織田信忠'], haori: 0, menpo: 0, horo: 0, ref: '' },
  '織田信広': { ...KACCHU['織田信広'], haori: 0, menpo: 0, horo: 0, ref: '' },
  '織田信次': { ...KACCHU['織田信次'], haori: 0, menpo: 0, horo: 0, ref: '' },
  // 勝家の当日の具足・陣羽織・面頬は未詳。既存の黒漆具足と威の復元色を保ち、
  // 共通設定の茶の陣羽織・面頬を固有の姿として引き継がない。雁の旗と金幣馬印は保つ。
  // 「鬼柴田」の武勇は既存の腰の溜めと踏み込みで表し、槍を頭上で回す技は使わない。
  // 福井県立歴史博物館：https://www.pref.fukui.lg.jp/muse/Cul-Hist/kikaku/kako/2023/20230729_onishibata.html
  '柴田勝家': { ...KACCHU['柴田勝家'], haori: 0, menpo: 0, horo: 0, spearThrust: true, ref: '' },
  // 坂手の郷を押さえる佐久間父子は同じ方針で復元。父だけに共通設定の陣羽織を残さない。
  // 当日の所用は未詳。筋兜・素懸威と三引両の所属紋を保ち、個人の馬印は補わない。
  // 胴の素懸威に袖・錣もそろえ、草摺は既存の五段の板と威糸の段を合わせる。
  // 当日の所用を断定せず、既存の形・材質を共有する復元案。
  '佐久間信盛': { ...KACCHU['佐久間信盛'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 押付郷の丹羽五郎左衛門。当日の所用具足は未詳。
  // 筋兜・無立物と違い筋の所属紋を保ち、共通設定の陣羽織・面頬は引き継がない。
  // 袖・錣が身分の既定値の毛引威へ戻らないよう、胴と同じ素懸威で復元する。
  // 草摺の五段は既存の板に威糸を合わせる指定で、当日の段数を示すものではない。
  '丹羽長秀': { ...KACCHU['丹羽長秀'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 稲葉伊予守の清水神社伝来具足を参考に、毛引威から素懸威・右脇引き合わせへ替える。
  // 岐阜県：https://www.pref.gifu.lg.jp/page/6052.html
  // 長島当日の着用は未詳。袖・錣・草摺の五段の威と配色は既存部品による復元。
  // 無立物と折敷に三文字の所属紋を保ち、陣羽織・面頬・母衣は補わない。
  '稲葉一鉄': { ...KACCHU['稲葉一鉄'], doStyle: 'sugake', rightOpening: true,
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5,
    haori: 0, menpo: 0, horo: 0, ref: '' },
  // 船上四将の当日の陣羽織は未確認。色付きの陣羽織を固有の姿として固定しない。
  // 九鬼の参戦： https://www.bunka.pref.mie.lg.jp/rekishi/kenshi/asp/arekore/detail8.html
  // 林佐渡守・島田所助の囲船：信長公記巻七「河内長島」。
  // 兜・黒漆具足と威は既存部品による復元。旗は所属を示し、個人の馬印は補わない。
  '九鬼嘉隆': { ...KACCHU['九鬼嘉隆'], haori: 0, mon: 'kuki', ref: '' },
  // 滝川も船上の指揮像。長島当日の陣羽織は未詳のため、他の船将と同じ復元方針にする。
  // 三つ団子の馬印と旗は戦の定義で示し、具足に個人の立物を補わない。
  '滝川一益': { ...KACCHU['滝川一益'], haori: 0, ref: '' },
  '林秀貞': { ...KACCHU['林秀貞'], haori: 0, ref: '' },
  '島田所之助': { ...KACCHU['島田所之助'], haori: 0, ref: '' },
  // 公記巻七「河内長島」の捶水。北畠茶筅に従い大船で参陣。諱・読み・所用具足は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足は共通部品による復元。固有の立物・陣羽織・個人紋・母衣は補わない。
  '捶水': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の鳥屋野尾。北畠茶筅に従い大船で参陣。諱と当日の所用具足は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html （河内長島、十五日の船勢）
  // 筋兜・黒漆具足は共通部品による復元。立物・陣羽織・個人紋・母衣は補わない。
  '鳥屋野尾': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七で北畠茶筅に従い大船で参陣する田丸。諱・所用具足は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足は共通部品で復元。立物・陣羽織・個人紋・母衣は補わない。
  '田丸': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七「河内長島」で北畠茶筅に従い大船で参陣する大東・小作・坂奈井。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足は未詳。共通の筋兜・黒漆具足で復元し、固有の立物・陣羽織・個人紋・母衣は補わない。
  '大東': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '小作': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '坂奈井': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の安宅船で参陣した水野監物。諱と当日の所用具足は断定しない。
  // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
  // 筋兜・黒漆具足は共通部品による復元。立物・陣羽織・個人紋・母衣は補わない。
  '水野監物': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の安宅船で参陣した伊藤三丞。諱と当日の所用具足は未詳。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足を共用する復元。立物・陣羽織・個人紋・母衣は補わない。
  '伊藤三丞': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆。所用具足は未詳で、既存の筋兜・黒漆具足による復元。
  // https://ja.wikisource.org/wiki/信長公記
  // 諱や固有の立物・陣羽織・個人紋・母衣は補わず、所属は傍らの織田の旗で示す。
  '津田半左衛門': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '津田又十郎': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '津田市介': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆、のち篠橋攻め衆。所用具足・立物・陣羽織は未詳。
  // https://ja.wikisource.org/wiki/信長公記 （巻七・河内長島）
  // 筋兜・黒漆具足は共通部品による復元。個人紋・母衣・固有の立物は補わない。
  '津田孫十郎': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆・市橋伝左衛門、塚本小大膳。諱と所用具足は未詳。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足は既存部品による復元。立物・陣羽織・個人紋・母衣は補わない。
  '市橋伝左衛門': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '塚本小大膳': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆・佐藤六左衛門。諱と所用具足は断定しない。
  // https://ja.wikisource.org/wiki/信長公記
  // 筋兜・黒漆具足は共通部品による復元。立物・陣羽織・個人紋・母衣は補わない。
  '佐藤六左衛門': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七「河内長島」の一江口御伴衆・関小十郎衛門。史料の通称で示す。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足は未詳。共通の筋兜・黒漆具足による復元で、固有の飾り・個人紋は補わない。
  '関小十郎衛門': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七「河内長島」の一江口御伴衆・坂井越中守。諱は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足は未詳。筋兜・黒漆具足は共通部品による復元で、顔も肖像とはしない。
  // 坂井政尚とは分け、固有の立物・陣羽織・個人紋・母衣・馬印は補わない。
  '坂井越中守': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 一江口の梶原平次。顔も共通部品による復元で、肖像や年齢の考証とはしない。
  // 所属は傍らの織田の旗で示し、個人の母衣・馬印は補わない。
  '梶原平次': { ...KACCHU['梶原平次'], menpo: 0, horo: 0, ref: '' },
  // 公記巻七「河内長島」の一江口御伴衆・長谷川與次。史料の通称で示す。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足は未詳。筋兜・黒漆具足と威の色は共通部品による復元。
  // 立物・陣羽織・面頬・個人紋・母衣は補わず、所属は傍らの織田の旗で示す。
  '長谷川與次': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七「河内長島」の一江口御伴衆。諱や個人の装備は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足・威の色は共通部品による復元。所属は傍らの織田の旗で示す。
  // 固有の立物・陣羽織・面頬・個人紋・母衣は補わない。
  '山田三左衛門': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '和田新介': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆・中島豊後守。諱と所用具足は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 筋兜・黒漆具足は共通部品による復元。所属は傍らの旗だけで示す。
  // 固有の立物・陣羽織・面頬・個人紋・母衣は補わない。
  '中島豊後守': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の篠橋攻め衆・津田大隅守と横井雅楽助。津田は早尾口の先陣にも見える。
  // https://kininaruart.com/artist/shincho/n7.html
  // 諱と所用具足は断定しない。筋兜・黒漆具足の共通部品で復元し、所属は傍らの旗で示す。
  // 固有の立物・陣羽織・面頬・個人紋・母衣・馬印は補わない。
  '津田大隅守': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  '横井雅楽助': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七「河内長島」の西・賀鳥口の稲葉右京助。諱は補わず記録の通称で示す。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足・立物・陣羽織は未詳。既存の筋兜・黒漆具足の形と材質で復元する。
  // 一鉄の個人装備を流用せず、立物・陣羽織・個人紋・母衣は付けない。
  '稲葉右京助': { ...KACCHU['浅井新八'], mon: 'none', ref: '' },
  // 公記巻七の大鳥居攻め衆「稲葉伊予守、同喜六」。諱・所用具足は断定しない。
  // https://ja.wikisource.org/wiki/信長公記
  // 筋兜・黒漆具足を共用する復元。固有の立物・陣羽織・個人紋・母衣は補わない。
  '稲葉喜六': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の早尾口先陣・押付郷の市橋九郎左衛門。諱は断定しない。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足・立物・陣羽織は未詳。既存の筋兜・黒漆具足を共用する復元。
  // 個人紋・馬印を作らず、織田方の所属は傍らの旗だけで示す。
  '市橋九郎左衛門': { ...KACCHU['浅井新八'], mon: 'none', ref: '' },
  // 公記巻七「河内長島」の早尾口先陣・丸毛兵庫、同三郎兵衛。
  // https://ja.wikisource.org/wiki/信長公記
  // 所用具足・立物・陣羽織は未詳。浅井新八の筋兜・黒漆具足の形と材質で復元。
  // 個人紋を付けず、織田方の所属は傍らの旗だけで示す。
  '丸毛兵庫': { ...KACCHU['浅井新八'], mon: 'none', ref: '' },
  '丸毛三郎兵衛': { ...KACCHU['浅井新八'], mon: 'none', ref: '' },
  // 公記巻七「河内長島」の早尾口先陣・中条将監、飯尾隠岐守。諱は断定しない。
  // https://ja.wikisource.org/wiki/信長公記
  // 所用具足・立物・陣羽織は未詳。既存の筋兜・黒漆具足を共用する復元。
  // 固有の立物・陣羽織・個人紋は補わず、所属は傍らの織田の旗で示す。
  '中条将監': { ...KACCHU['浅井新八'], crest: 'none', haori: 0, mon: 'none', ref: '' },
  '飯尾隠岐守': { ...KACCHU['浅井新八'], crest: 'none', haori: 0, mon: 'none', ref: '' },
  // 公記巻七の一江口御伴衆・簗田左衛門太郎。諱は断定せず、記録の通称で示す。
  // https://kininaruart.com/artist/shincho/n7.html
  // 所用具足は未詳。筋兜・黒漆具足の共通部品で復元し、立物・陣羽織・個人紋・母衣は補わない。
  '簗田左衛門太郎': { ...KACCHU['浅井新八'], crest: 'none', haori: 0,
    menpo: 0, mon: 'none', horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆・斎藤新五（利治）。当日の所用具足・立物は未詳。
  // https://kininaruart.com/artist/shincho/n7.html
  // 南蛮兜・十字前立を固有の姿にせず、既存の筋兜・黒漆具足で復元。
  // 威の色は復元案。陣羽織・個人紋・馬印は補わない。
  '斎藤利治': { ...KACCHU['斎藤利治'], bowl: 'suji', crest: 'none',
    haori: 0, menpo: 0, horo: 0, mon: 'none', ref: '' },
  // 公記巻七の北畠茶筅（信雄）は船で参陣し、神戸三七らと南大島口を担当。
  // https://kininaruart.com/artist/shincho/n7.html
  // 当日の所用具足・立物・陣羽織は未詳。日輪前立を遡らせず、筋兜・黒漆具足で復元。
  // 威の色は復元案。木瓜は織田方の所属のみを示し、固有の馬印は補わない。
  '織田信雄': { ...KACCHU['織田信雄'], crest: 'none', haori: 0, menpo: 0, horo: 0, ref: '' },
  // 公記巻七の一江口御伴衆・加路戸島口攻め衆の上野守（信包）。当日の所用具足は未詳。
  // 共通名簿の茶の陣羽織を固定せず、黒漆の筋兜・無立物と素懸威の復元を保つ。
  // 袖・錣も胴の素懸威にそろえ、草摺の既存の五段の板に威糸を合わせる。
  // 素懸威の仕立ての参考：https://www.pref.gifu.lg.jp/page/6052.html
  // 信包本人の着用の根拠ではない。木瓜は所属のみを示し、形と材質は既存品を共用する。
  '織田信包': { ...KACCHU['織田信包'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 公記巻七の南大島口攻め衆・神部三七（信孝）。所用具足・立物・陣羽織は未詳。
  // https://kininaruart.com/artist/shincho/n7.html
  // 信包の筋兜・黒漆具足を共用する復元。木瓜は織田方の所属のみを示す。
  // 胴・袖・錣を素懸威にそろえ、草摺は既存の五段の板に威糸を合わせる復元。
  // 素懸威の仕立ての参考：https://www.pref.gifu.lg.jp/page/6052.html
  // 本人の着用を示す資料ではなく、形と材質は既存部品を共用する。
  '織田信孝': { ...KACCHU['織田信包'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 公記巻七の早尾口先陣・押付郷の不破彦三。諱は断定せず通称で示す。
  // 所用具足・立物・陣羽織は未詳。不破光治の筋兜・黒漆具足の形と材質で復元する。
  // 木瓜は織田方の所属のみを示し、本人固有の紋・馬印とはしない。
  '不破彦三': { ...KACCHU['不破光治'], ref: '' },
  // 公記巻七の坂手の郷の押さえ・佐久間父子。子の信栄の所用具足・立物は未詳。
  // https://ja.wikisource.org/wiki/信長公記
  // 父の筋兜・黒漆具足の共通形で復元し、固有の立物・陣羽織・馬印は補わない。
  // 父と同じ素懸威を袖・錣にも指定し、草摺の五段と威糸の段を合わせる復元。
  // 身分の既定値で袖・錣だけ毛引威になるのを防ぐ。当日の所用の断定ではない。
  '佐久間信栄': { ...KACCHU['佐久間信盛'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 公記巻七の一江口御伴衆・森勝蔵（長可）。当日の所用具足・立物は未詳。
  // https://ja.wikisource.org/wiki/信長公記
  // 日輪前立を固有の姿とせず、頭形兜と黒漆具足で復元。陣羽織・個人の馬印は補わない。
  // 木瓜は織田方の所属のみを示す。後年の武勇や名槍をこの日の装いの根拠にしない。
  '森長可': { ...KACCHU['森長可'], crest: 'none', haori: 0, mon: 'oda', horo: 0, ref: '' },
  // 公記巻七の篠橋攻め衆・水野下野守。当日の所用具足・立物は未詳。
  // 筋兜・立物なし・黒漆の素懸威で復元。木瓜は織田方の所属だけを示す。
  // 袖・錣も胴と同じ素懸威にし、草摺の五段の板に威糸を合わせる復元。
  // 当日の段数は断定せず、既存の形・材質を共用する。
  '水野信元': { ...KACCHU['水野信元'], crest: 'none', horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  // 公記巻七の早尾口先陣・佐々蔵介、一江口御伴衆・池田勝三郎。
  // https://kininaruart.com/artist/shincho/n7.html （河内長島）
  // 頭形兜・立物なし・黒漆具足と威の色は共通部品による復元。
  // 当日の陣羽織・面頬は未確認。所属紋は保ち、共通設定の装いを固定しない。
  // 成政の黒母衣衆の経歴と、長島当日の母衣の着用は分ける。
  // 富山市郷土博物館：https://www.city.toyama.toyama.jp/etc/muse/kikakuhaku/list/h25/2503/2503.html
  // 胴・袖・錣を素懸威にそろえ、草摺の五段の板へ威糸も五段合わせる。
  // 所用具足は未詳のまま、共通の形・材質で復元し、得物と動きは保つ。
  '佐々成政': { ...KACCHU['佐々成政'], haori: 0, menpo: 0, horo: 0, ref: '',
    sodeStyle: 'sugake', shikoroStyle: 'sugake', kusazuriLaceRows: 5 },
  '池田恒興': { ...KACCHU['池田恒興'], haori: 0, menpo: 0, horo: 0, ref: '' },
  // 公記巻七の早尾口先陣・河尻與兵衛。長島当日の具足・陣羽織・面頬・母衣は未詳。
  // 筋兜・立物なし・黒漆具足と威の色は復元。共通名簿の陣羽織・面頬・母衣は引き継がない。
  '河尻秀隆': { ...KACCHU['河尻秀隆'], bowl: 'suji', crest: 'none', haori: 0, menpo: 0, horo: 0, ref: '' },
  // 木下小一郎の陣羽織・面頬・母衣も当日の裏付けは未確認。黒漆の具足を見せる復元とする。
  '羽柴秀長': { ...KACCHU['羽柴秀長'], bowl: 'suji', crest: 'none',
    armor: 0x1c1a1a, helm: 0x1c1a1a, haori: 0, menpo: 0, horo: 0, mon: 'oda', ref: '' },
  // 利家所用の金小札具足は安土桃山時代の品。天正二年の着用を裏付ける物ではない。
  // https://www.tnm.jp/modules/r_free_page/index.php?id=2740&lang=ja
  // 長島当日の具足・立物・陣羽織は未詳。筋兜・黒漆・毛引威で復元する。
  // 金鯰尾・毛・赤母衣を当日の姿として固定せず、梅鉢は所属の紋として使う。
  '前田利家': { ...KACCHU['前田利家'], bowl: 'suji', crest: 'none',
    armor: 0x22241e, helm: 0x22241e, lace: 0x554732, odo: 0x554732,
    lac: 'kuro', haori: 0, menpo: 0, fur: 0, horo: 0, ref: '' },
};
// 月や十字の立物を史実として付けない。威・羽織の色は見分けるための復元案。
for (const name of ['浅井長政', '浅井久政', '赤尾清綱']) {
  ODANI_KACCHU[name] = { ...KACCHU[name], crest: 'none', ref: '' };
}

// 大滝寺専用の復元。当日の所用具足・陣羽織・面頬の細部は未確認。
// 筋兜・黒漆の具足を共用し、面頬を省いた姿で補う。非着用を史実と断定する指定ではない。
// 時代祭の一益像に見られる銀水牛脇立・黒糸威・赤地の陣羽織を復元の参考にする。
// 陣羽織は外丸のない立四窠紋で補い、隊旗の丸に竪木瓜と分ける。展示品の細部まで再現したとはしない。
// この戦だけの復元案とし、ほかの戦の姿は共通表に残す。形と材質は既存の陣羽織を使い回す。
// 展示の紹介：https://muraka1950.seesaa.net/article/202010article_17.html
// 時代祭の復元装束は天正三年の所用品を示す史料ではない。威の二つの色指定を揃え、近景と遠景で共用する。
export const ECHIZEN_IKKO_KACCHU = {
  // 刀を抜いている間は長い鞘を空にする。脇差は腰に残す。刀銘・拵えは特定せず既存の形を共用。
  '滝川一益': { ...KACCHU['滝川一益'], crest: 'takigawa_buffalo', lace: 0x24242a, odo: 0x24242a, haori: 0x8a241c, haoriMon: 'takigawa_haori', menpo: 0, shinTies: true, emptySaya: true, sayaCord: true, sayaSori: .07, sayaOval: .65, tsukaOval: .75, uwaobi: 0x43382c, ref: '' },
};

// 野田・福島（元亀元年）の利家。後年の金鯰尾具足をそのまま着せない復元案。
// 東京国立博物館の利家所用具足は安土桃山時代： https://www.tnm.jp/modules/r_free_page/index.php?id=2740&lang=ja
export const NODAFUKUSHIMA_KACCHU = {
  "前田利家": { ...KACCHU["前田利家"], bowl: "suji", crest: "none", doStyle: "kebiki",
    armor: 0x22241e, helm: 0x22241e, haori: 0, menpo: 0, fur: 0, lac: "kuro", ref: "" },
};

// 稲生（弘治二年）の専用復元。利家の金鯰尾・金具足を若年期へ遡らせない。
// 東京国立博物館の利家所用具足は安土桃山時代：
// https://www.tnm.jp/uploads/r_press/FAX_336.pdf
// 当日の具足・立物・陣羽織は未確認。共通の筋兜・毛引威を使い、豪傑の得物と動きは保つ。
export const INOU_KACCHU = {};
for (const name of ["織田信長", "柴田勝家", "森可成", "前田利家",
  "佐久間大学", "佐々孫介", "黒田半平", "林美作守", "宮井勘兵衛"]) {
  const base = KACCHU[name], enemy = ["柴田勝家", "林美作守", "宮井勘兵衛"].includes(name);
  INOU_KACCHU[name] = { ...base, bowl: "suji", crest: "none", doStyle: "kebiki",
    armor: enemy ? 0x88432f : 0x22241e, helm: enemy ? 0x88432f : 0x22241e,
    lace: enemy ? 0x96583d : 0x334f70, odo: enemy ? 0x96583d : 0x334f70,
    haori: 0, menpo: 0, fur: 0, horo: 0, lac: enemy ? "shu" : "kuro", ref: "" };
}
