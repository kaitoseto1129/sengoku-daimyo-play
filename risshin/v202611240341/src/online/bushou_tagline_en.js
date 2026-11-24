// K516/K637（海外向け）：英語の時、武将の名の下に出す一言（例：Oda Nobunaga — Daimyo seeking to unify Japan）。講義にしない短さ（六十字まで）。
//   SS・S は一人ずつの手書き。A・R・N は「家＋役目＋兵の型」の型から（武将が増えても必ず一言が出る）。
const HOUSE_EN = { oda: 'Oda', takeda: 'Takeda', uesugi: 'Uesugi', tokugawa: 'Tokugawa', mori: 'Mori', shimazu: 'Shimazu', date: 'Date', hojo: 'Hojo', toyotomi: 'Toyotomi', chosokabe: 'Chosokabe', otomo: 'Otomo', asai: 'Asai', asakura: 'Asakura', imagawa: 'Imagawa', saito: 'Saito', sanada: 'Sanada', other: '' };
const ROLE = { SR: 'general', A: 'general', R: 'commander', N: 'retainer' };
const ARM = { teppo: 'gunner captain', yari: 'spear captain', kiba: 'cavalry captain', shubi: 'defensive commander', yumi: 'archer captain', std: 'field commander' };
// 11/24 頼む文20：SSR・SR で一言が無かった95人（史実の一言。六十字まで）
const TAGLINE_EN_SR = {
  nobuharu: 'Takeda veteran said to be unscathed in 70 battles', toshiie: 'Spear lord of Kaga, Nobunaga’s loyal retainer', yasumasa: 'One of Ieyasu’s Four Guardians, steady in command', tomonobu: 'Uesugi general who guarded Kenshin’s flank',
  nobuchika: 'Heir of Chosokabe, killed at Hetsugigawa', hidemasa: 'Gifted young general under Nobunaga and Hideyoshi', nobukata: 'Chief elder of Takeda, killed at Uedahara', kansuke: 'Strategist said to have planned Kawanakajima',
  sadamitsu: 'Uesugi strategist who dragged a rival into a lake', shigeie: 'Uesugi vassal who rebelled and held out for years', yoshikiyo: 'Shinano lord who twice beat Shingen', masanobu_h: 'Tokugawa’s shrewd adviser and trusted aide',
  katsunari: 'Hot-blooded Tokugawa spearman, lord of Fukuyama', hideyasu: 'Ieyasu’s second son, lord of Echizen', terumoto: 'Mori heir, one of the Five Elders under Hideyoshi', muneharu: 'Defender of Takamatsu who chose death to save his men',
  munekatsu: 'Mori naval commander of the Seto Inland Sea', takeyoshi: 'Murakami pirate lord of the Inland Sea', toyohisa: 'Shimazu warrior who died covering the retreat at Sekigahara', tokitaka: 'Lord of Tanegashima who obtained Japan’s first guns',
  tsunamoto_oniniwa: 'Date retainer and trusted adviser of Masamune', terumune_date: 'Masamune’s father, lord of Yonezawa', ujiteru_hojo: 'Later Hojo general, lord of Hachioji Castle', kotaro_fuma: 'Leader of the Fuma ninja band in service to the Hojo',
  ujinao_hojo: 'Last lord of the Later Hojo, fell at Odawara', oda_nobutada: 'Nobunaga’s heir, died at Nijo Castle in 1582', tokugawa_hidetada: 'Ieyasu’s heir, second Tokugawa shogun', takeda_nobutora: 'Shingen’s father, exiled by his own son',
  shimazu_takahisa: 'Shimazu lord who first united southern Kyushu', hojo_ujitsuna: 'Second lord of the Later Hojo, expanded into Kanto', chosokabe_morichika: 'Last Chosokabe lord, fought at Osaka', takahashi_joun: 'Otomo defender who held Iwaya to the last man',
  bekki_akitsura: 'Otomo general known as the “Demon of Bekki”', asakura_yoshikage: 'Last lord of Echizen, defeated by Nobunaga', asakura_soteki: 'Elder statesman who kept Asakura strong for decades', taigen_sessai: 'Monk-strategist who raised Imagawa Yoshimoto',
  saito_yoshitatsu: 'Saito heir who overthrew his father Dosan', sanada_nobuyuki: 'Sanada elder son who sided with the Tokugawa', ashina_moriuji: 'Lord of Aizu who ruled the north for decades', satomi_yoshitaka: 'Lord of Awa who resisted the Hojo for years',
  nagano_narimasa: 'Lord of Minowa, Shingen’s hardest foe in Kozuke', sogo_kazumasa: 'Fearless Miyoshi brother, “Demon Sogo”', hosokawa_fujitaka: 'Warlord and poet who served shogun and Nobunaga', araki_murashige: 'Settsu lord who rebelled against Nobunaga',
  amago_haruhisa: 'Amago lord who clashed with the Mori', sue_harukata: 'Ouchi general who toppled his own lord', mori_katsunaga: 'Toyotomi loyalist who fought bravely at Osaka', todo_takatora: 'Master castle builder who served many lords',
  konishi_yukinaga: 'Christian merchant-turned-general of Hideyoshi', hosokawa_tadaoki: 'Hot-tempered lord, tea master and Sekigahara ally', toyotomi_hideyori: 'Hideyoshi’s son, died at Osaka Castle', ii_naotaka: 'Ii “Red Devil” captain who fought at Osaka',
  oda_nobuhide: 'Nobunaga’s father, lord of Owari', sakuma_morimasa: 'Fierce Oda general nicknamed “Demon Genba”', takayama_ukon: 'Christian lord loyal to his faith', asai_sukemasa: 'Founder of the Asai rise in Omi',
  isono_kazumasa: 'Asai general who nearly broke Nobunaga’s line', kaiho_tsunachika: 'Asai elder and veteran retainer', asakura_toshikage: 'Founder of Asakura power, built Ichijodani', asakura_sadakage: 'Asakura lord who kept the clan stable',
  asakura_takakage: 'Asakura lord who expanded into Kaga', yamazaki_yoshiie: 'Asakura general of Echizen', hara_torataka: 'Takeda “Demon Mino” with many battle wounds', nagao_tamekage: 'Kenshin’s father, Echigo’s strongman',
  asahina_yasuyoshi: 'Imagawa veteran who guarded Suruga', okabe_motonobu: 'Imagawa loyalist who held Kutsukake after Okehazama', imagawa_ujichika: 'Imagawa lord who wrote the clan’s law code', amano_takashige: 'Mori retainer of Aki',
  sugihara_morishige: 'Mori retainer, expert in Iwami campaigns', kikkawa_tsuneie: 'Defender of Tottori who chose death to save his men', shimazu_tadayoshi: 'Shimazu reformer, father of Yoshihisa and Yoshihiro', kimotsuki_kanetsugu: 'Osumi lord who fought the Shimazu',
  harada_munetoki: 'Date vassal of Mutsu', katakura_shigenaga: 'Katakura heir, the “Demon Kojuro” at Osaka', chosokabe_kunichika: 'Chosokabe lord who rebuilt the clan', hisatake_chikanobu: 'Chosokabe general killed at Hetsugigawa',
  aki_kunitora: 'Lord of Aki, defeated by Chosokabe', usuki_akinobu: 'One of the Three Elders of Otomo', yoshihiro_akimasa: 'Otomo elder and Takahashi Joun’s father', tawara_chikakata: 'Otomo elder and general',
  ono_shigeyuki: 'Otomo’s fearless spearman at Iwaya', tokito_tsurasada: 'Otomo retainer who survived Iwaya', yufu_koreyoshi: 'Otomo veteran, one of the Three Elders', otomo_yoshiaki: 'Otomo lord, Sorin’s father',
  saito_michitoshi: 'Saito elder who guarded Mino', hineno_hirosuke: 'Saito general turned Oda retainer', saito_toshimitsu: 'Akechi’s chief retainer, executed after Yamazaki', yazawa_yoritsuna: 'Sanada elder who defended Numata',
  ashikaga_yoshiaki: 'Last Muromachi shogun, driven out by Nobunaga', rokkaku_yoshikata: 'Lord of southern Omi, rival of Nobunaga', kennyo_honganji: 'High priest of Honganji who led the Ikko resistance', miyoshi_nagayasu: 'One of the Miyoshi Triumvirate who held Kyoto',
  amago_tsunehisa: 'Lord of Izumo, rival of the Mori for the west', kitabatake_tomonori: 'Lord of Ise and master swordsman', kunohe_masazane: 'Northern lord who rebelled against Hideyoshi',
};
export const TAGLINE_EN = {
  ukita_hideie: 'One of the Five Elders, young lord of Bizen',
  nobunaga: 'Daimyo seeking to unify Japan', shingen: 'Tiger of Kai, master of cavalry', kenshin: 'Dragon of Echigo, devout and undefeated', ieyasu: 'Patient lord who would found the Tokugawa shogunate',
  motonari: 'Schemer who built the Mori realm in western Japan', yoshihisa: 'Daimyo who brought Kyushu under Shimazu rule', nobushige: 'Sanada hero of the Osaka campaigns', yoshihiro: 'Fierce Shimazu general of the famous retreat at Sekigahara',
  masamune: 'One-eyed dragon of Oshu', masayuki: 'Cunning lord of Ueda who twice beat the Tokugawa', ujiyasu: 'Lord of the Later Hojo, master of Kanto', motochika: 'Lord who united Shikoku',
  otomo_sorin: 'Christian daimyo of Bungo', asai_nagamasa: 'Lord of Omi, Nobunaga’s brother-in-law and enemy', imagawa_yoshimoto: 'Lord of Suruga, felled at Okehazama', nagayoshi_miyoshi: 'Ruler of the capital before Nobunaga',
  katsuie: 'Oda’s fierce senior general', masakage: 'Red-armored Takeda cavalry commander', tadakatsu: 'Tokugawa’s peerless spearman', iehisa: 'Shimazu general who won at Hetsugigawa',
  motoharu: 'Mori general, the fighting arm of the clan', kageie: 'Uesugi’s spearhead commander', kanbei: 'Strategist behind Hideyoshi’s rise', takakage: 'Mori’s calm strategist and diplomat',
  mitsuhide: 'Skilled Oda general who turned on Nobunaga', kazumasu: 'Oda gun commander who ruled Kanto briefly', nagahide: 'Steady Oda administrator and general', naomasa: 'Tokugawa’s “Red Devil” cavalry leader',
  katsuyori: 'Takeda heir who lost at Nagashino', kanetsugu: 'Uesugi’s brilliant chief retainer', kiyomasa: 'Toyotomi’s fierce castle builder and spearman', masanobu_k: 'Takeda’s patient defender of the north',
  ujisato: 'Gifted Oda general and tea lover', kagekatsu: 'Kenshin’s heir, lord of Echigo', muneshige: 'Kyushu’s famed general, loyal and unbeaten', sakon: 'Ishida Mitsunari’s famed battlefield commander',
  kagetsuna_date: 'Masamune’s trusted adviser', shigezane_date: 'Date’s daring field commander', tsunashige_hojo: 'Hojo’s “Yellow Eight Banners” general', ujimasa_hojo: 'Hojo lord who faced Hideyoshi at Odawara',
  mitsunari_ishida: 'Hideyoshi’s able administrator', yoshitsugu_otani: 'Brave, loyal Toyotomi general', masanori_fukushima: 'Hideyoshi’s fierce spearman of Shizugatake', nagamasa_kuroda: 'Kanbei’s son, a hero of Sekigahara',
  hidenaga_toyotomi: 'Hideyoshi’s calm younger brother', hojo_soun: 'Founder of the Later Hojo', saito_dosan: 'The “Viper of Mino”', hanbei_takenaka: 'Young strategist who seized a castle with a handful of men',
  magoichi_saika: 'Gun master leading the Saika gunners', hisahide_matsunaga: 'Ruthless schemer of Yamato', yoshiaki_mogami: 'Lord of Yamagata who held Hasedo', takanobu_ryuzoji: 'The “Bear of Hizen,” lord of northern Kyushu',
  naoie_ukita: 'Scheming lord of Bizen', yoshishige_satake: 'The “Demon” of Hitachi', naoshige_nabeshima: 'Founder of the Saga domain', goto_matabei: 'Fearless spearman who died at Domyoji',
};
export function taglineEn(b) {
  if (!b) return '';
  if (TAGLINE_EN[b.id]) return TAGLINE_EN[b.id];
  if (TAGLINE_EN_SR[b.id]) return TAGLINE_EN_SR[b.id];
  const h = HOUSE_EN[b.house] ?? '';
  return `${h ? h + ' ' : ''}${ROLE[b.rank] || 'commander'} · ${ARM[b.fav || 'std'] || ARM.std}`;
}
