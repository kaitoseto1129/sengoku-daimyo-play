// 登用の週ごとの暦（K636・kaito 11/22「208人が初めから全部出る→すぐコンプリートされる」・iMac k598-tonya 11/22）。
//   暦の紙は docs/toyo_calendar.md（ここを直したら紙も直す）。
//   ・12/1（火）から一週ずつ。週は火曜の 0 時（端末の暦）で替わる。12/1 より前は第1週として扱う。
//   ・初めの池＝初めの4人（start）＋六家（織田・武田・上杉・徳川・毛利・島津）の N。そこへ週ごとに add の武将を足す（足した武将はその後ずっと出る）。
//   ・第16週の後は全員が出る。
//   ・週の種類：house＝家に寄せた週／arm＝兵種に寄せた週（その登用の候補はその兵種だけ）／story＝筋書きに合わせた特別編。
//   ・今週の登用の枠（pickup.js の activeBanners）と、登用の池（toyo_rules.js・toyo_tiers.js・tojo.js の poolOf）がここを読む。
//   試す：?toyonow=2027-01-10（その日として暦を読む）。node では setToyoNow(Date)。
import { BUSHOU_ONLINE, BUSHOU_BY_ID } from './bushou_online.js';
import { MORE_1124 } from './bushou_more_1124.js';
import { K703_ROWS } from '../bushou_k703.js';

export const CAL_START = '2026-12-01';
const SIX = ['oda', 'takeda', 'uesugi', 'tokugawa', 'mori', 'shimazu'];
// en は英語の画面の名（i18n は pickup.js が足す）
export const WEEKS = [
  { kind: 'house', house: 'oda', name: '今週の登用 織田家', en: 'This week: Oda', bg: 'base', pickup: 'nobunaga', focus: ['nobunaga', 'katsuie', 'toshiie'],
    add: ['nobumori', 'yoshinari', 'narimasa', 'tsuneoki', 'ittetsu', 'oda_nobukatsu', 'oda_nobutaka', 'mori_nagamasa', 'hidemasa', 'oda_nobutada', 'nagahide'] },
  { kind: 'house', house: 'takeda', name: '今週の登用 武田家', en: 'This week: Takeda', bg: 'kai', pickup: 'shingen', focus: ['shingen', 'masakage', 'katsuyori'],
    add: ['nobushige_t', 'nobukimi', 'torashige', 'torayasu', 'oba_toramasa', 'sanada_yukitaka', 'katsuyori', 'masanobu_k', 'kansuke', 'nobukata'] },
  { kind: 'house', house: 'uesugi', name: '今週の登用 上杉家', en: 'This week: Uesugi', bg: 'yuki', pickup: 'kenshin', focus: ['kenshin', 'kanetsugu', 'kagekatsu'],
    add: ['shigenaga', 'kagetsuna_n', 'fujisuke', 'takahiro', 'masakage_n', 'uesugi_kagetora', 'kanetsugu', 'kagekatsu', 'sadamitsu', 'shigeie', 'yoshikiyo'] },
  { kind: 'arm', arm: 'teppo', name: '鉄砲武将の週', en: 'Gunner Week', bg: 'kiri', pickup: 'mitsuhide', focus: ['mitsuhide', 'kazumasu', 'magoichi_saika'],
    add: ['mitsuhide', 'kazumasu', 'magoichi_saika', 'munekatsu', 'takeyoshi', 'tokitaka', 'shimazu_takahisa'] },
  { kind: 'story', story: 'oda', name: '織田編 特別編 桶狭間', en: 'Oda Special: Okehazama', bg: 'base', pickup: 'imagawa_yoshimoto', focus: ['imagawa_yoshimoto', 'saito_dosan', 'ujisato'],
    add: ['imagawa_yoshimoto', 'imagawa_ujizane', 'taigen_sessai', 'saito_dosan', 'saito_yoshitatsu', 'saito_tatsuoki', 'ujisato'] },
  { kind: 'house', house: 'date', name: '今週の登用 伊達家', en: 'This week: Date', bg: 'oshu', pickup: 'masamune', focus: ['masamune', 'kagetsuna_date', 'shigezane_date'],
    add: ['masamune', 'kagetsuna_date', 'shigezane_date', 'tsunamoto_oniniwa', 'terumune_date', 'shigezane_rusu', 'date_harimune', 'date_tanemune', 'oniniwa_yoshinao', 'date_hidemune', 'shiraishi_munezane', 'harada_munetoki', 'katakura_shigenaga', 'watari_shigemune', 'date_sanemoto', 'ishikawa_akimitsu', 'kokubu_morishige', 'hasekura_tsunenaga', 'endo_mototsugu', 'goto_nobuyasu', 'koyanagawa_morimune', 'hamada_kagetaka'] },
  { kind: 'house', house: 'tokugawa', name: '今週の登用 徳川家', en: 'This week: Tokugawa', bg: 'base', pickup: 'ieyasu', focus: ['ieyasu', 'tadakatsu', 'naomasa'],
    add: ['mototada', 'tadayo', 'kazumasa', 'hanzo', 'nobumasa', 'nobuyasu_m', 'honda_masazumi', 'naomasa', 'masanobu_h', 'katsunari', 'hideyasu', 'tokugawa_hidetada', 'okubo_tadasuke', 'matsudaira_ietada', 'matsudaira_yasutada', 'honda_shigetsugu', 'torii_tadayoshi', 'okubo_tadataka', 'matsudaira_tadayoshi', 'yagyu_munenori', 'ii_naotaka', 'doi_toshikatsu', 'sakai_shigetada', 'toda_tadatsugu', 'suganuma_sadamitsu', 'amano_yasukage', 'ishikawa_ienari', 'itakura_katsushige', 'naito_nobunari'] },
  { kind: 'story', story: 'oda', name: '織田編 特別編 姉川', en: 'Oda Special: Anegawa', bg: 'base', pickup: 'asai_nagamasa', focus: ['asai_nagamasa', 'asakura_soteki', 'asakura_yoshikage'],
    add: ['asai_nagamasa', 'asai_hisamasa', 'akai_naomasa', 'endo_naotsune', 'asakura_yoshikage', 'asakura_kagetake', 'magara_naotaka', 'asakura_soteki',
      // K580（11/24 kaito「浅井・朝倉を各20人」）
      'asai_sukemasa', 'isono_kazumasa', 'kaiho_tsunachika', 'atsuji_sadayuki', 'amenomori_kiyosada', 'mitamura_kunisada', 'asai_masazumi', 'anyoji_ujihide', 'imamura_ujinao', 'dodo_kuranosuke', 'hori_hidemura', 'higuchi_naofusa', 'onogi_hidetoshi', 'asai_inosane', 'taya_akimasa', 'nomura_naotaka',
      'asakura_toshikage', 'asakura_sadakage', 'asakura_takakage', 'asakura_kagetaka', 'asakura_kagenori', 'asakura_kagetaka2', 'asakura_kageyuki', 'asakura_kagetsune', 'yamazaki_yoshiie', 'uozumi_kagekata', 'maenami_yoshitsugu', 'tomita_nagashige', 'torii_kagechika', 'kawai_yoshimune', 'takumi_kagetane', 'magara_naozumi'] },
  { kind: 'arm', arm: 'kiba', name: '騎馬武将の週', en: 'Cavalry Week', bg: 'kai', pickup: 'shingen', focus: ['shingen', 'kenshin', 'yoshishige_satake'],
    add: ['takeda_nobutora', 'kotaro_fuma', 'yoshishige_satake', 'yoshiaki_mogami'] },
  { kind: 'house', house: 'mori', name: '今週の登用 毛利家', en: 'This week: Mori', bg: 'setouchi', pickup: 'motonari', focus: ['motonari', 'takakage', 'motoharu'],
    add: ['michiyoshi', 'hiroie', 'hideaki', 'ekei', 'takaie', 'sadatoshi', 'kikkawa_mototsune', 'mori_hidemoto', 'takakage', 'muneharu', 'naoie_ukita', 'kodama_narikata', 'hoida_motokiyo', 'amano_takashige', 'sugihara_morishige', 'ichikawa_tsuneyoshi', 'kokushi_mototsuke', 'shishido_mototsugu', 'kikkawa_tsuneie', 'watanabe_nagashi'] },
  { kind: 'house', house: 'hojo', name: '今週の登用 北条家', en: 'This week: Hojo', bg: 'base', pickup: 'ujiyasu', focus: ['ujiyasu', 'tsunashige_hojo', 'hojo_soun'],
    add: ['ujiyasu', 'tsunashige_hojo', 'ujimasa_hojo', 'ujiteru_hojo', 'ujinao_hojo', 'hojo_soun', 'hojo_ujitsuna', 'hojo_ujikuni', 'hojo_ujinori', 'matsuda_norihide'] },
  { kind: 'house', house: 'shimazu', name: '今週の登用 島津家と九州', en: 'This week: Shimazu & Kyushu', bg: 'kyushu', pickup: 'yoshihiro', focus: ['yoshihiro', 'otomo_sorin', 'takahashi_joun'],
    add: ['tadamune', 'tadatsune', 'arinobu', 'tokihisa', 'morizumi', 'tadanaga', 'yoshihiro', 'otomo_sorin', 'otomo_yoshimune', 'takahashi_joun', 'bekki_akitsura', 'shiga_chikatsugu', 'takanobu_ryuzoji', 'muneshige', 'shimazu_tadayoshi', 'shimazu_yoshitora', 'kimotsuki_kanetsugu', 'hishijima_kunisada', 'honda_chikasada', 'shirahama_shigemasa', 'hirata_masumune', 'shimazu_hisayasu', 'usuki_akinobu', 'yoshihiro_akimasa', 'yoshioka_akioki', 'tawara_chikakata', 'takita_shigechika', 'tsunokuma_sekishu', 'yoshihiro_shigenobu', 'ono_shigeyuki', 'tokito_tsurasada', 'yufu_koreyoshi', 'komono_masutoki', 'ichimanda_akizane', 'saeki_koreyori', 'otomo_yoshiaki', 'saito_shigezane'] },
  { kind: 'story', story: 'toyotomi', name: '豊臣編 特別編 賤ヶ岳', en: 'Toyotomi Special: Shizugatake', bg: 'base', pickup: 'kiyomasa', focus: ['kiyomasa', 'masanori_fukushima', 'kanbei'],
    add: ['kiyomasa', 'mitsunari_ishida', 'yoshitsugu_otani', 'masanori_fukushima', 'nagamasa_kuroda', 'hidenaga_toyotomi', 'toyotomi_hidetsugu', 'katagiri_katsumoto', 'kato_yoshiaki', 'wakisaka_yasuharu', 'hirano_nagayasu', 'kasuya_takenori', 'kanbei', 'hanbei_takenaka', 'ukita_hideie', 'konishi_yukinaga', 'hosokawa_tadaoki', 'toyotomi_hideyori', 'asano_nagamasa', 'masuda_nagamori', 'nagatsuka_masaie', 'maeda_gen_i', 'sengoku_hidehisa', 'horio_yoshiharu', 'nakamura_kazuuji', 'ikoma_chikamasa', 'asano_yoshinaga', 'hachisuka_iemasa', 'kinoshita_iesada', 'toyotomi_hidekatsu', 'hitotsuyanagi_naosue', 'tanaka_yoshimasa', 'terasawa_hirotaka', 'mori_hidekane', 'maeno_nagayasu', 'kuwayama_shigeharu', 'kuki_yoshitaka'] },
  { kind: 'house', house: 'chosokabe', name: '今週の登用 長宗我部と四国', en: 'This week: Chosokabe & Shikoku', bg: 'setouchi', pickup: 'motochika', focus: ['motochika', 'nobuchika', 'nagayoshi_miyoshi'],
    add: ['motochika', 'nobuchika', 'chosokabe_morichika', 'kira_chikasada', 'kagawa_chikakazu', 'kosokabe_chikayasu', 'nagayoshi_miyoshi', 'hisahide_matsunaga', 'chosokabe_kunichika', 'hisatake_chikanobu', 'hisatake_chikanao', 'tani_tadasumi', 'yoshida_takayori', 'yoshida_shigeyasu', 'fukudome_chikamasa', 'nakajima_shigekatsu', 'hiyama_chikaoki', 'yamada_motoyoshi', 'tsuno_chikatada', 'motoyama_shigetoki', 'kira_chikazane', 'ike_yorikazu', 'aki_kunitora', 'ichijo_kanesada'] },
  { kind: 'arm', arm: 'yumi', name: '弓武将の週', en: 'Archer Week', bg: 'setouchi', pickup: 'motonari', focus: ['motonari', 'yoshihisa', 'ujiyasu'],
    add: ['sakon'] },
  { kind: 'story', story: 'sanada', name: '特別編 真田と大坂', en: 'Special: Sanada & Osaka', bg: 'kiri', pickup: 'nobushige', focus: ['nobushige', 'masayuki', 'sanada_nobuyuki'],
    add: ['nobushige', 'masayuki', 'sanada_nobuyuki'] },
  // K640 ③（11/22 kaito「武将を増やす」）：第17〜20週。史実で名のある人を、地方ごとに
  { kind: 'story', story: 'tohoku', name: '特別編 東北と関東の諸将', en: 'Special: Tohoku & Kanto Lords', bg: 'oshu', pickup: 'ashina_moriuji', focus: ['ashina_moriuji', 'satomi_yoshitaka', 'nagano_narimasa'],
    add: ['nanbu_nobunao', 'tsugaru_tamenobu', 'ashina_moriuji', 'soma_yoshitane', 'ando_chikasue', 'yuki_harutomo', 'satomi_yoshitaka', 'nagano_narimasa', 'ota_sukemasa', 'narita_ujinaga'] },
  { kind: 'story', story: 'kyushu', name: '特別編 九州と四国の諸将', en: 'Special: Kyushu & Shikoku Lords', bg: 'kyushu', pickup: 'naoshige_nabeshima', focus: ['naoshige_nabeshima', 'sogo_kazumasa', 'akizuki_tanezane'],
    add: ['naoshige_nabeshima', 'akizuki_tanezane', 'arima_harunobu', 'kono_michinao', 'sogo_kazumasa', 'miyoshi_yoshikata'] },
  { kind: 'story', story: 'chugoku', name: '特別編 畿内と中国の諸将', en: 'Special: Kinai & Chugoku Lords', bg: 'setouchi', pickup: 'sue_harukata', focus: ['sue_harukata', 'hosokawa_fujitaka', 'araki_murashige'],
    add: ['hosokawa_fujitaka', 'araki_murashige', 'tsutsui_junkei', 'amago_haruhisa', 'yamanaka_shikanosuke', 'sue_harukata', 'ouchi_yoshitaka'] },
  { kind: 'story', story: 'osaka', name: '特別編 大坂の陣と名将たち', en: 'Special: Osaka & Great Captains', bg: 'kiri', pickup: 'goto_matabei', focus: ['goto_matabei', 'mori_katsunaga', 'todo_takatora'],
    add: ['goto_matabei', 'mori_katsunaga', 'kimura_shigenari', 'akashi_takenori', 'todo_takatora', 'hachisuka_masakatsu', 'yamauchi_kazutoyo'] },
  // K650（11/24 kaito「織田家はまだまだいる」）：第21週。織田家の家臣・一門25人（bushou_online.js の NEW_K650）
  { kind: 'house', house: 'oda', name: '今週の登用 織田家の家臣たち', en: 'This week: Oda Retainers', bg: 'base', pickup: 'kuki_yoshitaka', focus: ['kuki_yoshitaka', 'sakuma_morimasa', 'oda_nobuhide'],
    add: ['oda_nobuhide', 'kuki_yoshitaka', 'sakuma_morimasa', 'takayama_ukon', 'nakagawa_kiyohide', 'ujiie_bokuzen', 'ando_morinari', 'fuwa_mitsuharu', 'hanawa_naomasa', 'hayashi_hidesada', 'hirate_masahide', 'oda_nobukane', 'oda_nagamasu', 'oda_nobuyuki', 'tsuda_nobusumi', 'mori_ranmaru', 'maeda_gen_i', 'hasegawa_hidekazu', 'sugaya_nagayori', 'mori_yoshikatsu', 'hattori_kazutada', 'yanada_masatsuna', 'saito_toshiharu', 'miyabe_keijun', 'maeno_nagayasu', 'oda_nobuhiro', 'oda_nobumitsu', 'nonomura_masanari'] },
];
// K646（11/24 各家20人）：足した50人も週に入れる（斎藤は桶狭間の週・真田は真田と大坂の週・諸家は地方ごとの週）。16週の後は全員が出る
{
  const add = (story, ids) => { const w = WEEKS.find((x) => x.story === story && x.add); if (w) for (const id of ids) if (!w.add.includes(id)) w.add.push(id); };
  add('oda', ['saito_michitoshi', 'hineno_hirosuke', 'takekoshi_naomitsu', 'saito_toshiharu', 'saito_toshimitsu', 'akechi_mitsuyasu', 'nagai_morihiro', 'hibino_kiyozane', 'toki_yorinari', 'nagai_nagahiro', 'ando_morinari', 'ujiie_bokuzen', 'endo_morikazu', 'takenaka_shigemoto', 'fuwa_mitsuharu', 'inada_danjo', 'adachi_rokubei', 'saito_magoshiro', 'saito_kihei', 'sato_tadayoshi', 'kishi_nobuchika']);
  add('sanada', ['sanada_nobutsuna', 'sanada_masateru', 'yazawa_yoritsuna', 'yazawa_yoriyasu', 'sanada_nobumasa', 'sanada_daisuke', 'sanada_nobuyoshi', 'sanada_nobumasa_k', 'oyamada_shigemasa', 'kawahara_tsunaie', 'uderu_morikiyo', 'tokita_takanaga', 'kanbara_shigeharu', 'yokotani_yukishige', 'takanashi_naiki', 'sarutobi_sasuke', 'kirigakure_saizo', 'mochizuki_rokuro', 'unno_rokuro', 'miyoshi_seikai', 'anayama_kosuke']);
  add('tohoku', ['kunohe_masazane', 'oda_ujiharu']);
  add('chugoku', ['amago_tsunehisa', 'urakami_munekage', 'bessho_nagaharu', 'hatano_hideharu']);
  add('osaka', ['ashikaga_yoshiaki', 'rokkaku_yoshikata', 'kennyo_honganji', 'shimotsuma_rairen', 'miyoshi_nagayasu', 'miyoshi_masayasu', 'iwanari_tomomichi', 'kitabatake_tomonori']);
}
// 11/24 増員の武将を各家の週へ（bushou_more_1124.js）
for (const m of MORE_1124) { const w = WEEKS.find((x) => x.kind === 'house' && x.house === m[2]) || WEEKS.find((x) => x.add.some((i) => BUSHOU_BY_ID[i]?.house === m[2])); if (w && !w.add.includes(m[0])) w.add.push(m[0]); }
// K703（11/26 名簿を300人へ）：足した50人も各家の週へ（週の上限 CAP を越えた分は第22週からの家の週が出す）。家の週が無い家（その他・豊臣）は、同じ家の人がいる週へ
for (const r of K703_ROWS) { const w = WEEKS.find((x) => x.kind === 'house' && x.house === r[4]) || WEEKS.find((x) => x.add.some((i) => BUSHOU_BY_ID[i]?.house === r[4])); if (w && !w.add.includes(r[0])) w.add.push(r[0]); }
export const ARM_NAME = { teppo: '鉄砲', kiba: '騎馬', yumi: '弓' };
// ---- K636（11/24 Sanae）一年の暦：初めの池を絞り、週に出す人数に上限を付け、あふれた分を第22週から52週まで回す ----
//   kaito 11/22「初めから全部出る→すぐコンプリート」。初めの池＝初めの4人（六家の24人）＋六家の N を一家5人まで（約54人）。
//   第1〜21週の筋は今のまま（家・兵種・特別編）。一週に新しく出す人は CAP 人まで（目当て・注目が先・次に格の高い順）。
//   あふれた人は、第22週からの「家の週・兵種の週・復刻の週」が家ごとにまとめて出す。第52週（2027/11/22〜28）の後で全員が出る。
const CAP = 9, YEAR = 52, BASE_N = 5;
const RK = ['SSR', 'SR', 'R', 'N'];
export const HOUSE_JA = { oda: '織田家', takeda: '武田家', uesugi: '上杉家', tokugawa: '徳川家', mori: '毛利家', shimazu: '島津家', date: '伊達家', other: '諸家', toyotomi: '豊臣家', hojo: '北条家', chosokabe: '長宗我部家', otomo: '大友家', asai: '浅井家', asakura: '朝倉家', imagawa: '今川家', saito: '斎藤家', sanada: '真田家' };
export const HOUSE_EN = { oda: 'Oda', takeda: 'Takeda', uesugi: 'Uesugi', tokugawa: 'Tokugawa', mori: 'Mori', shimazu: 'Shimazu', date: 'Date', other: 'Various Lords', toyotomi: 'Toyotomi', hojo: 'Hojo', chosokabe: 'Chosokabe', otomo: 'Otomo', asai: 'Asai', asakura: 'Asakura', imagawa: 'Imagawa', saito: 'Saito', sanada: 'Sanada' };
const rkOf = (id) => { const i = RK.indexOf(BUSHOU_BY_ID[id]?.rank); return i < 0 ? 9 : i; };
const BASE = (() => {
  const L = BUSHOU_ONLINE.filter((b) => b.start).map((b) => b.id), n = {};
  for (const b of BUSHOU_ONLINE) if (!b.start && SIX.includes(b.house) && b.rank === 'N' && (n[b.house] = (n[b.house] || 0) + 1) <= BASE_N) L.push(b.id);
  return L;
})();
{
  const seen = new Set(BASE);
  const orig = WEEKS.splice(0, WEEKS.length);
  for (const w of orig) {
    const want = [...new Set([w.pickup, ...(w.focus || []), ...w.add])].filter((id) => BUSHOU_BY_ID[id] && !seen.has(id));
    const first = want.filter((id) => id === w.pickup || (w.focus || []).includes(id));
    const rest = want.filter((id) => !first.includes(id));
    const keep = [...first, ...rest].slice(0, CAP);
    for (const id of keep) seen.add(id);
    WEEKS.push({ ...w, add: keep });
  }
  const pend = [];
  for (const w of orig) for (const id of w.add) if (BUSHOU_BY_ID[id] && !seen.has(id) && !pend.includes(id)) pend.push(id);
  for (const b of BUSHOU_ONLINE) if (!seen.has(b.id) && !pend.includes(b.id)) pend.push(b.id);
  let j = 0;
  const take = (ids) => { for (const id of ids) { seen.add(id); pend.splice(pend.indexOf(id), 1); } return ids; };
  while (pend.length || WEEKS.length < YEAR) {
    j++;
    const left = YEAR - WEEKS.length, cap = Math.min(14, Math.max(CAP, Math.ceil(pend.length / Math.max(1, left))));
    if (!pend.length) {
      const h = SIX[(j - 1) % SIX.length], top = BUSHOU_ONLINE.filter((b) => b.house === h && seen.has(b.id)).sort((a, b) => RK.indexOf(a.rank) - RK.indexOf(b.rank)).slice(0, 3).map((b) => b.id);
      WEEKS.push({ kind: 'house', house: h, name: `今週の登用 ${HOUSE_JA[h]}（復刻）`, en: `This week: ${HOUSE_EN[h]} (Rerun)`, bg: 'base', pickup: top[0], focus: top, add: [], rerun: true });
      continue;
    }
    const armN = { teppo: 0, kiba: 0, yumi: 0 };
    for (const id of pend) if (armN[BUSHOU_BY_ID[id].fav] != null) armN[BUSHOU_BY_ID[id].fav]++;
    const arm = j % 4 === 0 ? Object.keys(armN).sort((a, b) => armN[b] - armN[a])[0] : null;
    if (arm && armN[arm] >= 3) {
      const ids = take(pend.filter((id) => BUSHOU_BY_ID[id].fav === arm).sort((a, b) => rkOf(a) - rkOf(b)).slice(0, cap));
      WEEKS.push({ kind: 'arm', arm, name: `${ARM_NAME[arm]}武将の週`, en: { teppo: 'Gunner Week', kiba: 'Cavalry Week', yumi: 'Archer Week' }[arm], bg: arm === 'kiba' ? 'kai' : 'kiri', pickup: ids[0], focus: ids.slice(0, 3), add: ids });
      continue;
    }
    const cnt = {};
    for (const id of pend) { const h = BUSHOU_BY_ID[id].house; cnt[h] = (cnt[h] || 0) + 1; }
    const h = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const mine = pend.filter((id) => BUSHOU_BY_ID[id].house === h).sort((a, b) => rkOf(a) - rkOf(b)).slice(0, cap);
    const ids = take([...mine, ...pend.filter((id) => !mine.includes(id)).slice(0, cap - mine.length)]);   // 家の人が足りない週は、ほかの家の人で埋める
    WEEKS.push({ kind: 'house', house: h, name: `今週の登用 ${HOUSE_JA[h] || h}`, en: `This week: ${HOUSE_EN[h] || h}`, bg: 'base', pickup: ids[0], focus: ids.slice(0, 3), add: ids });
  }
}

let forced = null;
export function setToyoNow(d) { forced = d == null ? null : new Date(d); }
export function toyoNow(now) {
  if (now) return new Date(now);
  if (forced) return forced;
  try { const q = new URLSearchParams(location.search).get('toyonow'); if (q) { const d = new Date(q + 'T12:00:00'); if (!isNaN(d)) return d; } } catch (e) { /* 試しの口が無くても */ }
  return new Date();
}
const startT = () => { const [y, m, d] = CAL_START.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
// 今の週の番号（0 から）。12/1 より前は 0。16週を過ぎたら WEEKS.length（＝全員が出る）
export function weekIndex(now) {
  const t = toyoNow(now).getTime(), s = startT();
  if (t < s) return 0;
  return Math.min(WEEKS.length, Math.floor(Math.round((t - s) / 3600e3) / 168));
}
export function weekFrom(i) { const d = new Date(startT()); d.setDate(d.getDate() + 7 * i); return d; }
const md = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;

let cacheK = -1, cacheS = null;
// 今出る武将の id の Set（解禁した武将だけ）
export function openSet(now) {
  const k = weekIndex(now);
  if (k === cacheK && cacheS) return cacheS;
  const s = new Set(BASE);
  if (k >= WEEKS.length) for (const b of BUSHOU_ONLINE) s.add(b.id);
  else for (let i = 0; i <= k; i++) for (const id of WEEKS[i].add) s.add(id);
  cacheK = k; cacheS = s; return s;
}
export const isOpen = (id, now) => openSet(now).has(id);
export const openRoster = (now) => { const s = openSet(now); return BUSHOU_ONLINE.filter((b) => s.has(b.id)); };

// 今週の登用の枠（pickup.js が並べる）。16週を過ぎたら null
export function weekBanner(now) {
  const k = weekIndex(now); if (k >= WEEKS.length) return null;
  const w = WEEKS[k], end = weekFrom(k + 1); end.setDate(end.getDate() - 1);
  return { id: 'week_' + (k + 1), ...w, week: k + 1, to: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` };
}
// 来週の予告（一行）。来週が無ければ null。en は英語の画面の一行
export function nextNotice(now) {
  const k = weekIndex(now) + 1;
  const w = WEEKS[k]; if (!w) return null;
  const from = weekFrom(k), s = openSet(now);
  const news = w.add.filter((id) => !s.has(id)).map((id) => BUSHOU_BY_ID[id]).filter(Boolean)
    .sort((a, b) => RK.indexOf(a.rank) - RK.indexOf(b.rank)).slice(0, 3);
  if (!news.length) return { text: `${md(from)}から ${w.name}`, en: `From ${from.getMonth() + 1}/${from.getDate()}: ${w.en}` };
  return { text: `${md(from)}から ${news.map((b) => b.name).join('・')}${w.add.length > news.length ? 'ほか' : ''}が登用に出る`, en: `From ${from.getMonth() + 1}/${from.getDate()}: new generals join (${w.en})`, ids: news.map((b) => b.id) };
}
