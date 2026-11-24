// K516/K637（海外向け）：英語の時、武将の名の下に出す一言（例：Oda Nobunaga — Daimyo seeking to unify Japan）。講義にしない短さ（六十字まで）。
//   SS・S は一人ずつの手書き。A・R・N は「家＋役目＋兵の型」の型から（武将が増えても必ず一言が出る）。
const HOUSE_EN = { oda: 'Oda', takeda: 'Takeda', uesugi: 'Uesugi', tokugawa: 'Tokugawa', mori: 'Mori', shimazu: 'Shimazu', date: 'Date', hojo: 'Hojo', toyotomi: 'Toyotomi', chosokabe: 'Chosokabe', otomo: 'Otomo', asai: 'Asai', asakura: 'Asakura', imagawa: 'Imagawa', saito: 'Saito', sanada: 'Sanada', other: '' };
const ROLE = { A: 'general', R: 'commander', N: 'retainer' };
const ARM = { teppo: 'gunner captain', yari: 'spear captain', kiba: 'cavalry captain', shubi: 'defensive commander', yumi: 'archer captain', std: 'field commander' };
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
  const h = HOUSE_EN[b.house] ?? '';
  return `${h ? h + ' ' : ''}${ROLE[b.rank] || 'commander'} · ${ARM[b.fav || 'std'] || ARM.std}`;
}
