// 11/24 武将の水増しの見直し（頼む文12・kaito「織田は50人・各家20人ぐらい」の人数は減らさない）：
//   名・説明・戦法が他の人と同じだった人（戦法「連携の備え」ほか同名の戦法＋同じ一言）に、史実で一人ずつの戦法・説明を足す。
//   形：id: [戦法名, 戦法の説明, 一言, 戦法名(英), 説明(英), 一言(英), 【あれば】bio, bio(英)]。効き目の数や tac は変えない（名と説明だけ）。
//   表は docs/status/busho_dup_1124.md。
export const DIFF_1124 = {
  oda_nobukatsu: ['北畠の本陣', '伊勢の北畠家を継いだ身で、本陣の槍が戦線を支える。', '伊勢を治め、小牧・長久手で家康と組んだ。', 'Kitabatake HQ', 'Spears at HQ hold the line, backed by Ise.', 'Ruled Ise and sided with Ieyasu at Komaki-Nagakute.'],
  oda_nobutaka: ['神戸の守り', '神戸家を継いだ槍隊が、味方の側面を支える。', '柴田勝家と組み、秀吉に抗した。', 'Kambe guard', 'Spears of the Kambe house cover the flank.', 'Allied with Shibata Katsuie against Hideyoshi.'],
  mori_nagamasa: ['鬼武蔵の突撃', '先頭で槍を振るい、敵の前線へ切り込む。', '「鬼武蔵」と呼ばれた猛将。小牧・長久手で討死した。', 'Demon Musashi charge', 'Charges first and cuts into the enemy front.', 'Called the Demon Musashi. Fell at Komaki-Nagakute.'],
  toyotomi_hidetsugu: ['関白の備え', '叔父・秀吉の名のもと、槍隊が戦線を支える。', '秀吉の甥。のち関白となった。', 'Kampaku guard', 'Spears hold the line in Hideyoshi’s name.', 'Hideyoshi’s nephew, later Kampaku.'],
  katagiri_katsumoto: ['七本槍の踏みとどまり', '賤ヶ岳の七本槍の一人。崩れかけた戦線に踏みとどまる。', '豊臣家の家老。のち大坂の陣の前に城を出た。', 'Spear of Shizugatake', 'One of the Seven Spears; holds a wavering line.', 'Toyotomi chief retainer. Left Osaka before the siege.', '賤ヶ岳の七本槍の一人。のち豊臣家の家老として家康との間を取りもとうとした。', 'One of the Seven Spears of Shizugatake. He later tried to mediate between the Toyotomi and Ieyasu.'],
  hirano_nagayasu: ['七本槍の先駆け', '賤ヶ岳の七本槍の一人。小さな備えで先に当たる。', '七本槍の一人。のち徳川の旗本となった。', 'Spear vanguard', 'One of the Seven Spears; the small unit strikes first.', 'One of the Seven Spears. Later a Tokugawa hatamoto.', '賤ヶ岳の七本槍の一人。のち徳川の旗本となった。', 'One of the Seven Spears of Shizugatake. He later became a Tokugawa hatamoto.'],
  kato_yoshiaki: ['水軍あがりの槍', '七本槍の一人。水軍で鍛えた足で、側面へ回る。', '七本槍の一人。水軍も率い、のち会津の主となった。', 'Naval spear', 'One of the Seven Spears; flanks with naval-trained speed.', 'One of the Seven Spears. Led ships too; later lord of Aizu.', '賤ヶ岳の七本槍の一人。水軍も率いて朝鮮の役で戦った。', 'One of the Seven Spears of Shizugatake. He also led ships in the Korean campaign.'],
  kasuya_takenori: ['播磨の槍', '賤ヶ岳の七本槍の一人。播磨衆の備えで押し支える。', '七本槍の一人。播磨の加古川を領した。', 'Harima spear', 'One of the Seven Spears; Harima troops steady the push.', 'One of the Seven Spears. Held Kakogawa in Harima.', '賤ヶ岳の七本槍の一人。播磨の加古川を領した。', 'One of the Seven Spears of Shizugatake. He held Kakogawa in Harima.'],
  wakisaka_yasuharu: ['淡路の水軍槍', '槍隊が淡路の水軍と組んで戦線を支える。', '七本槍の一人。淡路の洲本を治めた。', 'Awaji naval spear', 'Spears and Awaji ships hold the line together.', 'One of the Seven Spears. Ruled Sumoto on Awaji.'],
  honda_masazumi: ['駿府の側近', '家康の側で采配を支え、槍隊の動きをまとめる。', '本多正信の子。家康の側近として駿府で仕えた。', 'Sunpu aide', 'Backs Ieyasu’s orders and gathers the spears.', 'Son of Honda Masanobu; served Ieyasu at Sunpu.'],
  sakai_ietada: ['忠次の子の槍', '父・酒井忠次の旗のもと、徳川の槍が戦線を支える。', '酒井忠次の子。徳川家に仕え、のち大名となった。', 'Tadatsugu’s heir', 'Under his father’s banner, Tokugawa spears hold.', 'Son of Sakai Tadatsugu; later a daimyo.'],
  uesugi_kagetora: ['御館の若き槍', '北条の血を引く若い槍が、乱の中でも踏みとどまる。', '北条氏康の子で謙信の養子。御館の乱で景勝と争った。', 'Otate young spear', 'A young spear of Hojo blood stands firm.', 'Son of Hojo Ujiyasu, adopted by Kenshin; fought Kagekatsu in the Otate Rebellion.'],
  suda_mitsuchika: ['海津の備え', '川中島の海津城を拠点に、槍隊が北信濃の線を守る。', '信濃の国人。海津城に拠り、上杉に仕えた。', 'Kaizu guard', 'Spears guard the north Shinano line from Kaizu.', 'A Shinano lord holding Kaizu for the Uesugi.'],
  naoe_nobutsuna: ['春日山の直江', '春日山を守る直江家の槍が、戦線を支える。', '上杉家に仕えた直江家の当主。春日山城で討たれた。', 'Naoe of Kasugayama', 'Naoe spears guard the home castle line.', 'Head of the Naoe house; killed at Kasugayama Castle.'],
  kikkawa_mototsune: ['吉川の長子の槍', '父・元春の槍衆を継ぎ、山陰の戦線を支える。', '吉川元春の長男。九州の陣で病没した。', 'Kikkawa heir spear', 'Leads his father’s spears on the San’in line.', 'Eldest son of Kikkawa Motoharu; died of illness in Kyushu.'],
  mori_motonori: ['元就の子の槍', '元就の子として毛利の槍を支える。', '毛利元就の子。のち大津城攻めにも加わった。', 'Motonari’s son', 'Backs the Mori spears as Motonari’s son.', 'Son of Mori Motonari; joined the Otsu Castle siege.'],
  mori_hidemoto: ['南宮山の備え', '関ヶ原の南宮山に陣を取る、動かぬ槍の構え。', '毛利輝元の養子。関ヶ原で南宮山に布陣した。', 'Nangu-san post', 'A still spear post on Nangu-san.', 'Adopted son of Mori Terumoto; held Nangu-san at Sekigahara.'],
  shimazu_tadachika: ['島津の一門槍', '島津の一門として、家中の槍が戦線を支える。', '島津一門の若い槍。薩摩の戦で働いた。', 'Shimazu kin spear', 'Shimazu kin spears hold the line.', 'A young Shimazu kinsman who fought in Satsuma’s wars.'],
  date_harimune: ['天文の乱の槍', '父と争った乱で鍛えた槍が、味方を支える。', '稙宗の子で政宗の祖父。天文の乱で父と争った。', 'Tenbun spear', 'Spears hardened in a war against his own father.', 'Tanemune’s son and Masamune’s grandfather; fought his father in the Tenbun War.'],
  date_tanemune: ['塵芥集の采配', '国を治める采配で、槍隊に決まりを与える。', '伊達家の領国を広げ、分国法「塵芥集」を定めた。', 'Jinkaishu command', 'Rules and discipline steady the spears.', 'Expanded Date lands; set the law code Jinkaishu.'],
  oniniwa_yoshinao: ['人取橋の殿', '人取橋で殿を務めた老将。退く味方を守る。', '鬼庭左月。人取橋の戦いで討死した。', 'Hitotoribashi rear guard', 'An old veteran who guards the retreat.', 'Oniniwa Sazuki. Fell at the battle of Hitotoribashi.'],
  date_hidemune: ['宇和島の槍', '政宗の庶長子の槍が、味方の側を固める。', '伊達政宗の長男で、のち宇和島藩の祖となった。', 'Uwajima spear', 'The eldest son’s spears guard allied flanks.', 'Masamune’s eldest son; founder of the Uwajima domain.'],
  hojo_ujikuni: ['鉢形の備え', '鉢形城を拠点に、武蔵北部の戦線を槍で守る。', '北条氏康の子。鉢形城を拠点とした。', 'Hachigata guard', 'Spears hold north Musashi from Hachigata.', 'Son of Hojo Ujiyasu; based at Hachigata Castle.'],
  hojo_ujinori: ['駿府育ちの槍', '外交で鍛えた落ち着きで、槍隊を崩さず保つ。', '北条氏康の子。若い頃は駿府で過ごし、小田原開城の交渉に当たった。', 'Sunpu-raised spear', 'Diplomat’s composure keeps the spears steady.', 'Son of Hojo Ujiyasu; raised at Sunpu; negotiated the Odawara surrender.'],
  matsuda_norihide: ['小田原評定の槍', '小田原の重臣として、城の槍をまとめる。', '北条家の重臣。小田原の籠城で意見を重ねた。', 'Odawara council spear', 'Gathers the castle’s spears as a senior retainer.', 'Senior Hojo retainer in the Odawara siege debates.'],
  kira_chikasada: ['土佐の弟槍', '兄・元親の槍を、弟として支える。', '長宗我部元親の弟。吉良家を継ぎ土佐で戦った。', 'Tosa brother spear', 'Backs his brother Motochika’s spears.', 'Motochika’s brother; took the Kira name and fought in Tosa.'],
  kagawa_chikakazu: ['讃岐の養子槍', '香川家を継いだ若い槍が、讃岐の線を守る。', '元親の子。讃岐の香川家を継いだ。', 'Sanuki heir spear', 'A young spear guards the Sanuki line.', 'Motochika’s son; heir of the Kagawa house in Sanuki.'],
  kosokabe_chikayasu: ['阿波の使いと槍', '外交で鍛えた目で、槍の間合いを見極める。', '元親の弟。香宗我部家を継ぎ、外交にも当たった。', 'Awa envoy spear', 'A diplomat’s eye picks the spear range.', 'Motochika’s brother; heir of the Kosokabe, also handled diplomacy.'],
  otomo_yoshimune: ['豊後の継ぎ槍', '宗麟の跡を継いだ槍隊が、豊後の線を支える。', '大友宗麟の子。朝鮮の役の失態で家を失った。', 'Bungo heir spear', 'The heir’s spears support the Bungo line.', 'Sorin’s son; lost the house after a failure in the Korean campaign.'],
  shiga_chikatsugu: ['岡城の若槍', '岡城の険しい地の利で、少ない槍で守る。', '大友家に仕え、若くして岡城を守り抜いた。', 'Oka young spear', 'Few spears hold on the steep ground of Oka.', 'Held Oka Castle for the Otomo while still very young.'],
  asai_hisamasa: ['小谷の古槍', '北近江の古い家の槍が、小谷の城を背に戦線を保つ。', '浅井長政の父。小谷城落城の時に自刃した。', 'Odani veteran', 'Old-house spears hold with Odani at their back.', 'Nagamasa’s father; took his life at the fall of Odani.'],
  akai_naomasa: ['小谷の重臣槍', '重臣として小谷の備えをまとめる。', '浅井家の重臣。小谷城を支えた。', 'Odani elder', 'Gathers the Odani guard as a senior retainer.', 'Senior Asai retainer who kept Odani Castle.'],
  endo_naotsune: ['姉川の斬り込み', '姉川で信長の本陣へ迫った、一点突破の槍。', '浅井長政に仕え、姉川で討死した。', 'Anegawa breakthrough', 'A single-point thrust toward Nobunaga’s camp at Anegawa.', 'Served Nagamasa; fell at Anegawa.'],
  asakura_kagetake: ['姉川の朝倉勢', '朝倉の援軍を率い、姉川で浅井の側に並ぶ。', '朝倉の一門。姉川で朝倉勢を率いた。', 'Anegawa Asakura line', 'Leads the Asakura relief force beside the Asai.', 'An Asakura kinsman who led the Asakura troops at Anegawa.'],
  magara_naotaka: ['太郎太刀の槍', '長大な太刀で敵の前線を薙ぎ払う、力の一撃。', '朝倉家の猛将。大太刀「太郎太刀」で知られ、姉川で討死した。', 'Taro-tachi sweep', 'A great sword sweeps the enemy front.', 'Asakura champion known for the great sword Taro-tachi; fell at Anegawa.'],
  imagawa_ujizane: ['掛川の籠城槍', '義元亡き後の家を、掛川の城で守り抜く。', '今川義元の子。蹴鞠に長じ、のち徳川・北条に身を寄せた。', 'Kakegawa holdout', 'Holds the house’s last castle at Kakegawa.', 'Yoshimoto’s son; skilled at kemari; later lived under Tokugawa and Hojo.'],
  saito_tatsuoki: ['稲葉山の若き槍', '堅い稲葉山の城を背に、若い槍が踏ん張る。', '斎藤義龍の子。竹中半兵衛に稲葉山城を奪われた。', 'Inabayama young spear', 'A young spear stands before the strong Inabayama.', 'Yoshitatsu’s son; lost Inabayama Castle to Takenaka Hanbei.'],
  oba_toramasa: ['赤備えの先駆け', '赤備えの元になった、先頭の騎馬。', '武田の宿老。義信の事件に連座して自刃した。', 'Red-armor forerunner', 'The lead cavalry that began the red-armor tradition.', 'A Takeda elder; took his life over the Yoshinobu incident.'],
  sanada_yukitaka: ['調略の備え', '戸石城を調略で落とした知恵で、敵の備えを崩す。', '真田幸隆。調略に優れ、戸石城を攻略した。', 'Subversion line', 'The craft that took Toishi Castle breaks the enemy line.', 'Sanada Yukitaka; a master of subversion who took Toishi Castle.'],
  asano_nagamasa: ['検地の采配', '五奉行の一人。検地で兵糧を整え、味方を養う。', '豊臣の五奉行の一人。検地に当たった。', 'Survey command', 'One of the five bugyo; surveys feed the army.', 'One of Toyotomi’s five bugyo; ran land surveys.'],
  amano_yasukage: ['三奉行の裁き', '三河三奉行の一人。公正な裁きで軍の乱れを抑える。', '三河三奉行の一人。のち駿河で興国寺を治めた。', 'Three-bugyo ruling', 'One of the three Mikawa bugyo; fair rulings calm the ranks.', 'One of the three Mikawa bugyo; later held Kokokuji in Suruga.'],
  sugaya_nagayori: ['奉行の検分', '信長の奉行として戦場を検分し、陣を整える。', '信長の側近。検分の奉行として各地へ使いした。', 'Inspection duty', 'Surveys the field for Nobunaga and trims the ranks.', 'A close aide of Nobunaga sent out as an inspector.'],
  nakamura_kazuuji: ['駿府の中老', '秀吉の中老として、駿府の槍を重く構える。', '豊臣の三中老の一人。駿府城主になった。', 'Sunpu elder', 'A heavy spear stance as one of Hideyoshi’s churo.', 'One of Toyotomi’s three churo; lord of Sunpu.'],
  naito_nobunari: ['駿府の城代', '家康の弟分として駿府を預かり、槍で支える。', '家康の弟とされる。駿府城代を務めた。', 'Sunpu warden', 'Keeps Sunpu for Ieyasu and supports with spears.', 'Said to be Ieyasu’s half-brother; warden of Sunpu.'],
  ishikawa_ienari: ['家成の城代', '掛川城主として、遠江の線を槍で守る。', '石川家成。家康に掛川を預けられた。', 'Ienari’s warden', 'Guards the Totomi line as lord of Kakegawa.', 'Ishikawa Ienari; entrusted with Kakegawa by Ieyasu.'],
  asahina_yasutomo: ['掛川の籠城', '今川家の最後まで、掛川の城で守り抜く。', '今川の家臣。掛川城に籠もり、家康に抗した。', 'Kakegawa siege', 'Holds Kakegawa to the very end of the Imagawa.', 'An Imagawa retainer who held Kakegawa against Ieyasu.'],
  hasegawa_hidekazu: ['馬廻の先駆け', '信長の馬廻として、先頭で本陣を守る。', '信長の馬廻。堀秀政と並ぶ近習だった。', 'Horse-guard vanguard', 'Leads the horse guard around HQ.', 'A Nobunaga horse-guard, a peer of Hori Hidemasa.'],
  nonomura_masanari: ['二条の殿', '信忠のもとで最後まで残る、馬廻の槍。', '信長の馬廻。二条の御所で信忠とともに討死した。', 'Nijo rear guard', 'A horse-guard spear who stays to the end with Nobutada.', 'A Nobunaga horse-guard; died with Nobutada at Nijo.'],
  atobe_katsusuke: ['側近の進言', '勝頼の側近として、守りの采配を支える。', '武田勝頼の側近。天目山で討死した。', 'Aide’s counsel', 'Backs Katsuyori’s defensive orders as an aide.', 'A close aide of Katsuyori; fell at Tenmokuzan.'],
  honjo_sanenori: ['謙信の取次', '謙信の側近として春日山の采配を支える。', '上杉謙信の側近。春日山の政に当たった。', 'Kenshin’s liaison', 'Backs Kenshin’s orders from Kasugayama.', 'A close aide of Kenshin who handled affairs at Kasugayama.'],
  hojo_ujitaka: ['小机の一門', '北条の一門として、小机の備えを固める。', '北条氏綱の子。氏康の弟として一門を支えた。', 'Kozukue kin guard', 'A Hojo kinsman steadies the Kozukue guard.', 'Son of Hojo Ujitsuna; supported the house as Ujiyasu’s brother.'],
  sekiguchi_ujizumi: ['関口の守り', '今川の一門として、駿河の線を守る。', '今川の一門。徳川家康の妻・築山殿の父と伝わる。', 'Sekiguchi guard', 'An Imagawa kinsman guards the Suruga line.', 'Imagawa kin; father of Ieyasu’s wife Tsukiyama, by tradition.'],
  nagai_morihiro: ['甲斐守の槍', '長井甲斐守として、森部で美濃勢の先頭に立つ。', '長井甲斐守。森部の戦いで前田利家に討たれた。', 'Kai-no-kami spear', 'Leads the Mino line at Moribe as Lord of Kai.', 'Nagai, Lord of Kai; killed by Maeda Toshiie at Moribe.', '美濃の斎藤家の武将。甲斐守を称し、森部の戦いで討死した。', 'A Saito commander styled Kai-no-kami. He fell at the battle of Moribe.'],
  hibino_kiyozane: ['下野守の槍', '日比野下野守として、森部で脇を固める。', '日比野下野守。森部の戦いで討死した。', 'Shimotsuke spear', 'Guards the flank at Moribe as Lord of Shimotsuke.', 'Hibino, Lord of Shimotsuke; fell at Moribe.', '美濃の斎藤家の武将。下野守を称し、森部の戦いで討死した。', 'A Saito commander styled Shimotsuke-no-kami. He fell at the battle of Moribe.'],
  mochizuki_rokuro: ['火薬の術', '伝承の火薬と忍びの術で、敵の備えを乱す。', '真田十勇士の一人と伝わる。火薬に通じた人。', 'Powder craft', 'Legendary powder and shinobi arts disturb the enemy.', 'Legend makes him a Sanada hero skilled in powder.', '伝承：真田十勇士の一人。火薬と忍びの術に通じた人で、史実の記録は無い。', 'Legend: one of the Sanada Ten Braves, skilled in powder and shinobi arts. No historical record.'],
  unno_rokuro: ['海野の血筋', '海野家の血を引く伝承の槍で、味方を支える。', '真田十勇士の一人と伝わる。海野の名を継ぐ人。', 'Unno lineage', 'A legendary spear of the Unno line supports allies.', 'Legend makes him a Sanada hero bearing the Unno name.', '伝承：真田十勇士の一人。海野の名を継ぐ人で、史実の記録は無い。', 'Legend: one of the Sanada Ten Braves, bearing the Unno name. No historical record.'],
  saito_magoshiro: ['兄の面目', '兄として弟をかばい、本陣の守りに立つ。', '道三の子で喜平次の兄。義龍に呼ばれ、弟とともに討たれた。', 'Elder brother’s stand', 'As the elder brother he shields the younger at HQ.', 'Dosan’s son, brother of Kihei; lured and killed with him by Yoshitatsu.', '斎藤道三の子で、弟・喜平次の兄。道三に愛されたが、兄の義龍に謀られて討たれたと伝わる。', 'Dosan’s son and elder brother of Kihei. Favored by Dosan, he was killed through a ruse by his brother Yoshitatsu.'],
  saito_kihei: ['弟の連れ立ち', '兄に従い、離れず守りにつく。', '道三の子で孫四郎の弟。兄とともに討たれた。', 'Younger brother’s company', 'Stays at his elder brother’s side on guard.', 'Dosan’s son, younger brother of Magoshiro; killed with him.', '斎藤道三の子で、兄・孫四郎の弟。兄とともに義龍に謀られて討たれたと伝わる。', 'Dosan’s son and younger brother of Magoshiro. Killed with him through Yoshitatsu’s ruse.'],
  tadakata: ['川上の槍', '島津の家中で、槍の備えを支える。', '島津家に仕えた川上家の武将。', 'Kawakami spear', 'Spears supporting the Shimazu retinue.', 'A Kawakami retainer of the Shimazu.', '島津家に仕えた川上家の武将。薩摩の家中を支えた。', 'A Kawakami retainer who served the Shimazu in Satsuma.'],
  tadakura: ['伊集院の槍', '島津の家中で、伊集院家の槍を支える。', '島津家に仕えた伊集院家の武将。', 'Ijuin spear', 'Ijuin spears support the Shimazu retinue.', 'An Ijuin retainer of the Shimazu.', '島津家に仕えた伊集院家の武将。薩摩の家中を支えた。', 'An Ijuin retainer who served the Shimazu in Satsuma.'],
};
export function applyDiff1124(list) {
  const by = new Map(list.map((b) => [b.id, b]));
  for (const [id, r] of Object.entries(DIFF_1124)) {
    const b = by.get(id); if (!b) continue;
    b.senpo = { ...(b.senpo || {}), name: r[0], desc: r[1] }; b.oneLine = r[2]; if (r[6]) b.bio = r[6];
    if (b.en) { b.en.senpo = { ...(b.en.senpo || {}), name: r[3], desc: r[4] }; b.en.oneLine = r[5]; if (r[7]) b.en.bio = r[7]; }
  }
}
