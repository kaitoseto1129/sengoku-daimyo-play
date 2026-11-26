// 武将は bushou_online.js の ID。名簿にない武将は近い武将で補う。
// 伊達・北条は名簿に同家の武将が一人ずつのため、諸家の武将を加えた仮の編成。
// 豊臣秀吉は同一人物の木下藤吉郎を使う。
const formation = (id, name, nameEn, year, generals) => ({ id, name, nameEn, year, generals });

// 0〜1。大きいほど、その行動や情報を重視する。
// reserve は予備投入の積極性、retreat は後退と反転の活用度。
export const NPC_CLANS = [
  {
    id: 'oda', name: '織田', nameEn: 'Oda', description: '鉄砲と柔軟な采配で攻める。', descriptionEn: 'Uses firearms and flexible command.',
    ai: { aggression: 0.75, reserve: 0.65, flank: 0.65, ambush: 0.45, retreat: 0.5, shooting: 0.95, waves: 0.65, intelligence: 0.8 },
    formations: [
      formation('oda_1560', '桶狭間期', 'Okehazama era', 1560, ['nobunaga', 'katsuie', 'yoshinari', 'nobumori']),
      formation('oda_1570', '天下布武期', 'Unification era', 1570, ['nobunaga', 'mitsuhide', 'katsuie', 'tokichiro']),
      formation('oda_1575', '長篠期', 'Nagashino era', 1575, ['nobunaga', 'kazumasu', 'katsuie', 'nagahide']),
      formation('oda_1582', '本能寺期', 'Honnoji era', 1582, ['nobunaga', 'mitsuhide', 'nagahide', 'toshiie']),
    ],
    firstWin: { id: 'oda_first_win', name: '織田撃破の証', nameEn: 'Oda victory token' },
    challenge: { id: 'oda_gunkeep', name: '織田を鉄砲隊5割以上残して倒す', nameEn: 'Defeat Oda keeping half your gunners', condition: 'gun_keep_half' },
  },
  {
    id: 'takeda', name: '武田', nameEn: 'Takeda', description: '騎馬と高い士気で波状攻撃を仕掛ける。', descriptionEn: 'Cavalry and high morale drive successive attacks.',
    ai: { aggression: 0.9, reserve: 0.8, flank: 0.75, ambush: 0.55, retreat: 0.65, shooting: 0.35, waves: 0.95, intelligence: 0.7 },
    formations: [
      formation('takeda_a', '信玄の軍勢', 'Shingen army', 1572, ['shingen', 'masakage', 'nobuharu', 'masatoyo']),
      // 真田昌輝は名簿にいないため、同じ真田家の昌幸を使う。
      formation('takeda_b', '勝頼の軍勢', 'Katsuyori army', 1575, ['katsuyori', 'masakage', 'nobuharu', 'masayuki']),
    ],
    firstWin: { id: 'takeda_first_win', name: '武田撃破の証', nameEn: 'Takeda victory token' },
    challenge: { id: 'takeda_honjin', name: '武田を本陣陥落で倒す', nameEn: 'Defeat Takeda by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'uesugi', name: '上杉', nameEn: 'Uesugi', description: '高い士気と機動力で敵陣を突く。', descriptionEn: 'Strikes with high morale and mobility.',
    ai: { aggression: 0.9, reserve: 0.55, flank: 0.8, ambush: 0.4, retreat: 0.55, shooting: 0.35, waves: 0.7, intelligence: 0.7 },
    formations: [
      formation('uesugi_a', '謙信の軍勢', 'Kenshin army', 1561, ['kenshin', 'kageie', 'tomonobu', 'kagemochi']),
      formation('uesugi_b', '景勝の軍勢', 'Kagekatsu army', 1600, ['kagekatsu', 'kanetsugu', 'shigenaga', 'kagechika']),
    ],
    firstWin: { id: 'uesugi_first_win', name: '上杉撃破の証', nameEn: 'Uesugi victory token' },
    challenge: { id: 'uesugi_honjin', name: '上杉を本陣陥落で倒す', nameEn: 'Defeat Uesugi by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'tokugawa', name: '徳川', nameEn: 'Tokugawa', description: '堅い守りと後詰で反撃する。', descriptionEn: 'Defends firmly and counterattacks with reserves.',
    ai: { aggression: 0.45, reserve: 0.8, flank: 0.55, ambush: 0.5, retreat: 0.8, shooting: 0.6, waves: 0.55, intelligence: 0.75 },
    formations: [
      formation('tokugawa_a', '三河の軍勢', 'Mikawa army', 1575, ['ieyasu', 'tadakatsu', 'yasumasa', 'tadatsugu']),
      formation('tokugawa_b', '徳川四天王', 'Four guardians of Tokugawa', 1600, ['ieyasu', 'tadakatsu', 'yasumasa', 'naomasa', 'tadatsugu']),
    ],
    firstWin: { id: 'tokugawa_first_win', name: '徳川撃破の証', nameEn: 'Tokugawa victory token' },
    challenge: { id: 'tokugawa_honjin', name: '徳川を本陣陥落で倒す', nameEn: 'Defeat Tokugawa by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'mori', name: '毛利', nameEn: 'Mori', description: '情報と伏兵を生かして包み込む。', descriptionEn: 'Uses intelligence and ambushes to surround the enemy.',
    ai: { aggression: 0.55, reserve: 0.7, flank: 0.85, ambush: 0.85, retreat: 0.65, shooting: 0.55, waves: 0.6, intelligence: 0.95 },
    formations: [
      formation('mori_a', '元就の軍勢', 'Motonari army', 1555, ['motonari', 'motoharu', 'takakage', 'takamoto']),
      formation('mori_b', '輝元の軍勢', 'Terumoto army', 1582, ['terumoto', 'motoharu', 'takakage', 'muneharu']),
    ],
    firstWin: { id: 'mori_first_win', name: '毛利撃破の証', nameEn: 'Mori victory token' },
    challenge: { id: 'mori_honjin', name: '毛利を本陣陥落で倒す', nameEn: 'Defeat Mori by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'shimazu', name: '島津', nameEn: 'Shimazu', description: '伏兵と鉄砲で誘い込み反撃する。', descriptionEn: 'Lures enemies into ambushes and firearm volleys.',
    ai: { aggression: 0.7, reserve: 0.8, flank: 0.8, ambush: 0.95, retreat: 0.9, shooting: 0.8, waves: 0.6, intelligence: 0.8 },
    formations: [
      formation('shimazu_a', '島津四兄弟', 'Four Shimazu brothers', 1584, ['yoshihisa', 'yoshihiro', 'toshihisa', 'iehisa']),
      formation('shimazu_b', '島津の軍勢', 'Shimazu army', 1600, ['yoshihiro', 'toyohisa', 'tadamune', 'morizumi']),
    ],
    firstWin: { id: 'shimazu_first_win', name: '島津撃破の証', nameEn: 'Shimazu victory token' },
    challenge: { id: 'shimazu_notsuri', name: '島津を釣り野伏を受けずに倒す', nameEn: 'Defeat Shimazu without falling for the feigned retreat', condition: 'no_tsurinobuse' },
  },
  {
    id: 'date', name: '伊達', nameEn: 'Date', description: '鉄砲と機動力を合わせて攻める。', descriptionEn: 'Combines firearms and mobility in attack.',
    ai: { aggression: 0.8, reserve: 0.6, flank: 0.8, ambush: 0.55, retreat: 0.55, shooting: 0.85, waves: 0.65, intelligence: 0.7 },
    formations: [
      formation('date_a', '政宗の軍勢', 'Masamune army', 1600, ['masamune', '片倉景綱', '伊達成実', '鬼庭綱元']),
      formation('date_b', '政宗の別働隊', 'Masamune alternate army', 1600, ['masamune', '伊達成実', '原田宗時', '白石宗実']),
    ],
    firstWin: { id: 'date_first_win', name: '伊達撃破の証', nameEn: 'Date victory token' },
    challenge: { id: 'date_honjin', name: '伊達を本陣陥落で倒す', nameEn: 'Defeat Date by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'hojo', name: '北条', nameEn: 'Hojo', description: '堅い陣と予備で敵の攻めを受け止める。', descriptionEn: 'Holds attacks with strong defenses and reserves.',
    ai: { aggression: 0.35, reserve: 0.85, flank: 0.45, ambush: 0.6, retreat: 0.7, shooting: 0.6, waves: 0.4, intelligence: 0.75 },
    formations: [
      formation('hojo_a', '氏康の軍勢', 'Ujiyasu army', 1560, ['ujiyasu', '北条綱成', '北条氏政', '北条氏照']),
      formation('hojo_b', '氏康の別働隊', 'Ujiyasu alternate army', 1560, ['ujiyasu', '北条綱成', '北条氏邦', '松田憲秀']),
    ],
    firstWin: { id: 'hojo_first_win', name: '北条撃破の証', nameEn: 'Hojo victory token' },
    challenge: { id: 'hojo_honjin', name: '北条を本陣陥落で倒す', nameEn: 'Defeat Hojo by capturing its headquarters', condition: 'headquarters_capture' },
  },
  {
    id: 'toyotomi', name: '豊臣', nameEn: 'Toyotomi', description: '多彩な武将と情報で機を見て攻める。', descriptionEn: 'Uses varied commanders and intelligence to seize opportunities.',
    ai: { aggression: 0.7, reserve: 0.75, flank: 0.75, ambush: 0.6, retreat: 0.6, shooting: 0.65, waves: 0.75, intelligence: 0.9 },
    formations: [
      formation('toyotomi_a', '秀吉の軍勢', 'Hideyoshi army', 1590, ['tokichiro', '豊臣秀長', 'kanbei', '竹中半兵衛']),
      formation('toyotomi_b', '豊臣の別働隊', 'Toyotomi alternate army', 1590, ['tokichiro', 'kiyomasa', '福島正則', '石田三成']),
    ],
    firstWin: { id: 'toyotomi_first_win', name: '豊臣撃破の証', nameEn: 'Toyotomi victory token' },
    challenge: { id: 'toyotomi_honjin', name: '豊臣を本陣陥落で倒す', nameEn: 'Defeat Toyotomi by capturing its headquarters', condition: 'headquarters_capture' },
  },
];

// 総大将を先頭とする編成の各位置。左翼・右翼は味方から見た向き。
export const NPC_FORMATION_POSITIONS = {
  4: ['中央', '左翼', '右翼', '後詰'],
  5: ['中央', '左翼', '右翼', '後詰', '予備'],
  6: ['中央', '左翼', '右翼', '後詰', '予備', '遊撃'],
};
export const NPC_FORMATION_POSITIONS_EN = {
  4: ['Center', 'Left wing', 'Right wing', 'Rear guard'],
  5: ['Center', 'Left wing', 'Right wing', 'Rear guard', 'Reserve'],
  6: ['Center', 'Left wing', 'Right wing', 'Rear guard', 'Reserve', 'Mobile force'],
};

// 反応の遅さ・予備の甘さは大きいほど不利。側面の回数は一戦の上限。
// 霧への強さ・判断の速さは大きいほど有利。兵力と命は変更しない。
export const NPC_DIFFICULTIES = [
  { id: 'beginner', name: '初級', nameEn: 'Beginner', reactionDelay: 0.9, reserveWeakness: 0.9, flankCount: 1, fogStrength: 0.2, decisionSpeed: 0.25 },
  { id: 'intermediate', name: '中級', nameEn: 'Intermediate', reactionDelay: 0.65, reserveWeakness: 0.65, flankCount: 2, fogStrength: 0.4, decisionSpeed: 0.45 },
  { id: 'advanced', name: '上級', nameEn: 'Advanced', reactionDelay: 0.35, reserveWeakness: 0.35, flankCount: 3, fogStrength: 0.7, decisionSpeed: 0.7 },
  { id: 'shura', name: '修羅', nameEn: 'Shura', reactionDelay: 0.1, reserveWeakness: 0.1, flankCount: 4, fogStrength: 0.9, decisionSpeed: 0.95 },
];

// K608（11/21 k592）：各家の家臣団（相手を選ぶ画面に十人ほど見せる・編成に足りない時はここから足す）。家の違う者は入れない。
//   六家は登用の表（bushou_online.js）のその家の者から、伊達・北条・豊臣は登用の表に家臣が少ないので名で書く（名だけの武将は姿と家紋は家の大名に倣う）
export const NPC_RETAINERS = {
  date: ['伊達政宗', '片倉景綱', '伊達成実', '鬼庭綱元', '原田宗時', '白石宗実', '留守政景', '屋代景頼', '片倉重長', '支倉常長'],
  hojo: ['北条氏康', '北条綱成', '北条氏政', '北条氏照', '北条氏邦', '松田憲秀', '大道寺政繁', '北条幻庵', '多目元忠', '富永直勝'],
  toyotomi: ['木下藤吉郎', '豊臣秀長', '黒田官兵衛', '竹中半兵衛', '加藤清正', '福島正則', '石田三成', '蜂須賀正勝', '浅野長政', '堀秀政'],
};
export const NPC_CLAN_BY_ID = Object.fromEntries(NPC_CLANS.map((clan) => [clan.id, clan]));
