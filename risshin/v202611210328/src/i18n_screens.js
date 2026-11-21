// K516 英語版：画面の字（ホーム・日本地図・題・戦の選び）の英訳。英語の時だけ i18n.js から読む（日本語の時は読まない・重さ0）。
//   クラウド k365-cloud-30 11/21。k516_untr.mjs（?lang=en で日本語のまま残る字を数える道具）で拾った字。
//   名は人・城の名をローマ字で（長音は ō・ū）。短く、やさしい英語で。表に無い字は日本語のまま残る（足す係が一行ずつ）。
import { tr } from './i18n.js';
const CASTLE = {
  那古野: 'Nagoya', 掛川: 'Kakegawa', 躑躅ヶ崎館: 'Tsutsujigasaki Mansion', 深志: 'Fukashi', 小田原: 'Odawara', 岐阜: 'Gifu',
  観音寺: 'Kannonji', 芥川山: 'Akutagawayama', 飯盛山: 'Iimoriyama', 勝瑞: 'Shōzui', 洲本: 'Sumoto', 十河: 'Sogō',
  月山富田: 'Gassan-Toda', 館山: 'Tateyama', 雑賀: 'Saika', 備中松山: 'Bitchū-Matsuyama', 御着: 'Goshaku', 鳥羽: 'Toba',
  下田: 'Shimoda', 谷村: 'Yamura', 岩村: 'Iwamura', 柏原: 'Kashiwabara', 沼: 'Numa', 甲の尾: 'Kōnoo', 駿府館: 'Sunpu Mansion',
  長島願証寺: 'Nagashima Ganshō-ji', 越前府中: 'Echizen-Fuchū', 猿掛: 'Sarukake', 小谷: 'Odani', 石山本願寺: 'Ishiyama Hongan-ji',
  後瀬山: 'Nochiseyama', 八上: 'Yakami', 上野: 'Ueno', 松尾: 'Matsuo', 飛騨松倉: 'Hida-Matsukura', 比自山: 'Hijiyama',
  清洲: 'Kiyosu', 本: 'Main',
};
const CLAN = {
  織田家: 'Oda clan', 徳川家: 'Tokugawa clan', 武田家: 'Takeda clan', 北条家: 'Hōjō clan', 三好家: 'Miyoshi clan', 毛利家: 'Mōri clan',
  里見家: 'Satomi clan', 鈴木家: 'Suzuki clan', 黒田家: 'Kuroda clan', 宇喜多家: 'Ukita clan', 朝倉家: 'Asakura clan', 神保家: 'Jinbō clan',
  佐竹家: 'Satake clan', 上杉家: 'Uesugi clan', 南部家: 'Nanbu clan', 大友家: 'Ōtomo clan', 本願寺: 'Hongan-ji', 藤林長家: 'Fujibayashi Nagaie',
};
const KIND = { 山城: 'mountain castle', 平城: 'plain castle', 砦: 'fort' };
const cn = (s) => CASTLE[s];

// K516 戦の後の結果の札と左の棒の字（battle_outcome.js・screens.js・touch.js・state.js の組の名）。どの戦でも英語の時に日本語のまま残っていた
//   （忍城の ?lang=en の通しで拾った。クラウド 忍城の持ち主 11/21）
const GIVEN_EN = { 太郎左: 'Tarōza', 与作: 'Yosaku', 権六: 'Gonroku', 源太: 'Genta', 孫七: 'Magoshichi', 又八: 'Matahachi', 甚兵衛: 'Jinbei', 勘助: 'Kansuke', 彦三: 'Hikoza', 小平次: 'Koheiji', 久蔵: 'Kyūzō', 藤八: 'Tōhachi', 平助: 'Heisuke', 吉蔵: 'Kichizō', 伝七: 'Denshichi', 新六: 'Shinroku', 市兵衛: 'Ichibei', 長吉: 'Chōkichi', 佐吉: 'Sakichi', 茂助: 'Mosuke', 半蔵: 'Hanzō', 喜三郎: 'Kisaburō', 惣次: 'Sōji', 留吉: 'Tomekichi', 善六: 'Zenroku', 兵太: 'Heita', 弥助: 'Yasuke', 六郎: 'Rokurō', 清蔵: 'Seizō', 亀吉: 'Kamekichi' };
const KD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const kanN = (t) => { if (/^\d+$/.test(t)) return +t; let n = 0, d = 0; for (const c of t) { if (KD[c]) d = KD[c]; else if (c === '十') { n += (d || 1) * 10; d = 0; } else if (c === '百') { n += (d || 1) * 100; d = 0; } else return NaN; } return n + d; };
const who = (n, tr) => { if (GIVEN_EN[n]) return GIVEN_EN[n]; const m = n.match(/^ほか(\d+)人$/); if (m) return `${m[1]} other${m[1] === '1' ? '' : 's'}`; const e = tr(n); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : e; };
const RESULT_EN = [
  ['褒美', 'Rewards'], ['預かる組', 'Your squad'], ['金', 'Money'], ['戦功', 'Merit'], ['出世', 'Promotion'], ['武将加入', 'New retainer'], ['特別装備', 'Special gear'], ['自分', 'You'],
  ['視点', 'View'], ['守る', 'Guard'], ['指図', 'Orders'], ['武器の持ち替え・馬の追加操作', 'Switch weapons and extra horse controls'],
  ['ここまで倒すと走る', 'Push to here to run'], ['端まで倒すと走る', 'Push to the edge to run'], ['走る', 'Run'], ['後ずさり', 'Back up'], ['横へ向ける', 'Turn aside'], ['並足', 'Walk'], ['速足', 'Trot'], ['駆け足', 'Gallop'], ['息切れ・並足で休む', 'Winded: walk to rest'], ['息が残り少ない', 'Low on breath'],
  [/^合戦結果[　 ]+(.+)$/, (m, tr) => { const e = tr(m[1].trim()); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `Battle: ${e}`; }],
  [/^任務結果[　 ]+(.+?)[　 ]+(成功|失敗)$/, (m, tr) => { const e = tr(m[1].trim()); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `Mission: ${e}: ${m[2] === '成功' ? 'success' : 'failed'}`; }],
  [/^戦った時間[　 ]+(\d+)分(\d+)秒$/, (m) => `Time fought: ${m[1]}m ${m[2]}s`],
  [/^はじめの(\d+)段のうち(\d+)段を果たした$/, (m) => `Cleared ${m[2]} of the first ${m[1]} stages`],
  [/^(?:([一二三四五六七八九十百\d]+)貫)?(?:([一二三四五六七八九十百]+)文)?$/, (m) => { if (!m[1] && !m[2]) return undefined; const k = m[1] ? kanN(m[1]) : 0, mo = m[2] ? kanN(m[2]) : 0; if (Number.isNaN(k) || Number.isNaN(mo)) return undefined; return [k ? `${k} kan` : '', mo ? `${mo} mon` : ''].filter(Boolean).join(' '); }],
  [/^零$/, () => '0 mon'],
  // 戦の前の『出陣の下知』の札（screens.js storyScreen）。どの戦でも日本語のまま残っていた（クラウド 忍城の持ち主 11/21）
  ['出陣の下知', 'Orders to march'], ['出陣の覚え', 'Marching notes'], ['出陣の儀、上役の下知に従い、この戦の務めを果たすべきこと。', 'March out, follow your superior\'s orders, and do your duty in this battle.'],
  ['諸勢を率い、この戦の務めを果たすべきこと。', 'Lead all the forces and do your duty in this battle.'], ['仍って件の如し（右に書いたとおり）', 'So ordered (as written above)'], ['諸将・旗本中', 'To all generals and bodyguards'],
  ['上役より', 'From your superior'], ['この戦の目的：', 'Goal of this battle: '], ['任務：', 'Mission: '], ['戦の背景と心得を読む', 'Read the background and advice'], ['支度をして出陣する', 'Prepare and march out'], ['やさしく読むと', 'In plain words'], ['足軽衆', 'Foot soldiers'],
  [/^戦の時期：(\d+)年$/, (m) => `When: ${m[1]}`], [/^戦の時期：(.+)$/, (m, tr) => { const e = tr(m[1].trim()); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `When: ${e}`; }],
  [/^(.+?)殿$/, (m, tr) => { const n = m[1].trim(), e = /[぀-ヿ㐀-鿿]/.test(n) ? tr(n) : n; return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `To ${e}`; }],
  [/^(.+?)より$/, (m, tr) => { const e = tr(m[1].trim()); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `From ${e}`; }],
  [/^(\d+)点$/, (m) => `${m[1]} pts`],
  [/^(.+?)[　 ]+討死$/, (m, tr) => { const e = who(m[1].trim(), tr); return e === undefined ? undefined : `${e}: killed`; }],
  [/^(.+?)[　 ]+生存$/, (m, tr) => { const e = who(m[1].trim(), tr); return e === undefined ? undefined : `${e}: survived`; }],
  [/^(.+?)[　 ]+開城$/, (m, tr) => { const e = tr(m[1].trim()); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `${e} surrenders`; }],
];

export default [
  ...RESULT_EN,
  // ホーム
  ['ホーム', 'Home'], ['出陣', 'Sortie'], ['城下町', 'Castle town'], ['武将図鑑', 'Warlord guide'],
  ['雑兵', 'Foot soldier'], ['足軽', 'Ashigaru'], ['足軽大将', 'Ashigaru captain'], ['侍大将', 'Samurai captain'], ['武将', 'Warlord'], ['大名', 'Daimyo'],
  ['戦功', 'Merit'], ['体力', 'Health'], ['気力', 'Stamina'], ['士気', 'Morale'], ['馬', 'Horse'],
  ['戦いの準備中', 'Preparing for battle'],
  ['近くの戦場の地図', 'Map of the battlefield nearby'], ['組の陣形を選ぶ', 'Choose your unit formation'], ['戦場の大きな地図', 'Large map of the battlefield'],
  ['今の任務。押すとほかの任務を開く', 'Current mission. Press to open other missions'], ['任務の一覧を開く', 'Open the mission list'],
  [/^今日のお題（果たした数 (\d+)／(\d+)・開いた日 (\d+)日）$/, (m) => `Daily challenge (${m[1]}/${m[2]} done, ${m[3]} days opened)`],
  [/^次の位「(.+)」まで あと(\d+)点$/, (m) => `${m[2]} points to the next rank: ${({ 足軽: 'Ashigaru', 足軽大将: 'Ashigaru captain', 侍大将: 'Samurai captain', 武将: 'Warlord', 大名: 'Daimyo' })[m[1]] || m[1]}`],
  [/^出世の階段。今は(.+)$/, (m) => `Rank ladder. Now: ${({ 雑兵: 'Foot soldier', 足軽: 'Ashigaru', 足軽大将: 'Ashigaru captain', 侍大将: 'Samurai captain', 武将: 'Warlord', 大名: 'Daimyo' })[m[1]] || m[1]}`],

  // 日本地図
  ['城下へ戻る', 'Back to the castle town'], ['城下へ戻る（Esc）', 'Back to the castle town (Esc)'],
  ['日本の立体地図。城は幟を押すか、右の一覧から選べます', '3D map of Japan. Press a banner or pick a castle from the list on the right'],
  ['日本地図。攻められる城は右の一覧からも選べます', 'Map of Japan. Castles under attack can also be picked from the list on the right'],
  ['夏', 'Summer'], ['春', 'Spring'], ['秋', 'Autumn'], ['冬', 'Winter'],
  ['元亀元年', 'Genki 1 (1570)'], ['信長包囲網', 'Nobunaga encirclement'], ['六月・信長包囲網', 'June. Nobunaga encirclement'],
  ['地図の見え方', 'Map view'], ['城・評定・内政を見る', 'View castles, council and domestic affairs'], ['地図の見え方の押し釦を開く', 'Open the map view buttons'], ['見え方', 'View'],
  ['地図に寄る', 'Zoom in'], ['寄る', 'In'], ['地図を引く', 'Zoom out'], ['引く', 'Out'],
  ['自分の国を見る', 'View your territory'], ['自国', 'Home'], ['日本全体を見る', 'View all of Japan'], ['全国', 'All'],
  ['地図の見方（凡例）を開く', 'Open the map key'], ['凡例', 'Key'], ['地図の見方', 'How to read the map'],
  ['家ごとの城の数（勢力の帯）を開く', 'Open castles per clan (power bar)'], ['勢力', 'Power'],
  ['平面の地図に切り替える', 'Switch to the flat map'], ['平面', 'Flat'],
  ['山城', 'Mountain castle'], ['平城', 'Plain castle'], ['砦', 'Fort'], ['本城', 'Main castle'], ['城', 'Castle'],
  ['攻められる城', 'Castle under attack'], ['危', '!'], ['狙われそうな自分の城', 'Your castle that may be targeted'], ['落', 'Fell'], ['この季節に落ちた城', 'Castles that fell this season'],
  ['守りの固さ', 'Defense'], ['街道', 'Road'], ['攻め口', 'Attack route'],
  ['北を上に戻す', 'North up'], ['北', 'N'], ['地図を大きく見る', 'Enlarge the map'],
  ['押したまま動かす・矢印釦で動かす ・ 回し車・＋－で寄る ・ 城を押して選ぶ', 'Hold and drag, or use the arrow buttons · Wheel or +/− to zoom · Press a castle to pick it'],
  ['本城（家の要。大きな旗・金の縁・「本」）', 'Main castle (heart of a clan: big flag, gold rim, "Main")'],
  ['城（▲山城・■平城）', 'Castle (▲ mountain · ■ plain)'], ['砦（◆。小さな旗）', 'Fort (◆, small flag)'],
  ['自分の家の領地の境（金の線）', 'Border of your clan (gold line)'], ['街道（隣り合う城をつなぐ道）', 'Road (links neighboring castles)'],
  ['攻め口（自分の城から攻められる城へ）', 'Attack route (from your castle to a castle you can attack)'],
  ['補給線（本拠から味方の城だけを通る道）', 'Supply line (from home through allied castles only)'], ['補給の断たれた城への道', 'Road to a castle cut off from supply'],
  ['前線（敵の城と向き合う道）', 'Front line (facing an enemy castle)'], ['いま攻められる城', 'Castle you can attack now'], ['攻められる城の印', 'Mark of a castle you can attack'],
  ['隣の敵が強い自分の城', 'Your castle with a strong enemy next to it'], ['急', 'Urgent'], ['敵が攻め寄せている自分の城', 'Your castle under enemy attack'],
  ['この季節に持ち主が替わった城', 'Castles that changed hands this season'],
  ['朱の破線の輪が、いま攻められる城です。地図の城か、下の名を押すと城主と様子が分かります。', 'A red dashed ring marks a castle you can attack now. Press it on the map, or a name below, to see its lord and state.'],
  ['不利', 'Bad odds'], ['有利', 'Good odds'],
  ['「危」の城：岩村城。隣の敵が強い。内政の「城の普請」で固めておくと守りやすい。', 'Castle at risk: Iwamura. A strong enemy is next to it. Fortify it with "Castle works" in domestic affairs.'],
  ['危ない城をすべて見る（1城）', 'View all castles at risk (1)'], ['評定の進言が3つ残っている', '3 council proposals remain'],
  ['直近の操作の結果を見る', 'See the result of your last action'], ['地図の印で、味方と目標の場所を確かめよう。', 'Use the map marks to check where your allies and goals are.'],
  [/^勢力（城の数）：(.+)$/, (m) => 'Power (castles): ' + m[1].replace(/、/g, ', ').replace(/(\S+?)家 (\d+)/g, (x, a, n) => `${(CLAN[a + '家'] || a).replace(' clan', '')} ${n}`).replace('ほか', 'others')],
  [/^(毛利|織田|北条|武田|南部|上杉|三好|大友|徳川) (\d+)$/, (m) => `${({ 毛利: 'Mōri', 織田: 'Oda', 北条: 'Hōjō', 武田: 'Takeda', 南部: 'Nanbu', 上杉: 'Uesugi', 三好: 'Miyoshi', 大友: 'Ōtomo', 徳川: 'Tokugawa' })[m[1]]} ${m[2]}`],
  [/^ほか (\d+)$/, (m) => `Others ${m[1]}`],
  // 城の札（地図の幟）
  [/^(.+?)(城|館)?(（本城）)?、(.+?)、(山城|平城|砦)、兵およそ(\d+)人(、攻められる城)?$/, (m) => {
    const n = cn(m[1]) || cn(m[1] + m[2]), c = CLAN[m[4]];
    if (!n || !c) return undefined;
    const tail = m[2] === '館' ? ' Mansion' : m[2] === '城' ? ' Castle' : '';
    return `${n}${tail}${m[3] ? ' (main castle)' : ''}, ${c}, ${KIND[m[5]]}, about ${m[6]} troops${m[7] ? ', under attack' : ''}`;
  }],
  [/^([^、（）]+?)(?:城|館|寺)$/, (m) => { const n = CASTLE[m[1]]; if (!n) return undefined; return m[0].endsWith('館') ? `${n} Mansion` : m[0].endsWith('寺') ? n : `${n} Castle`; }],
  // 勢力の名
  ...Object.entries(CLAN).map(([j, e]) => [j, e]),
  ['朝倉義景', 'Asakura Yoshikage'], ['神保長職', 'Jinbō Nagamoto'], ['鈴木佐大夫', 'Suzuki Sadayū'], ['佐竹義重', 'Satake Yoshishige'], ['北条氏康', 'Hōjō Ujiyasu'],
  ['武田信玄', 'Takeda Shingen'], ['三好長逸', 'Miyoshi Nagayasu'], ['織田信長', 'Oda Nobunaga'], ['明智光秀', 'Akechi Mitsuhide'], ['塙直政', 'Hanawa Naomasa'],
  ...Object.entries(CASTLE).filter(([j]) => !['本'].includes(j)).map(([j, e]) => [j, e]),
  ['本', 'Main'], ['攻', 'Atk'],
  ['石山本願寺', 'Ishiyama Hongan-ji'], ['長島願証寺', 'Nagashima Ganshō-ji'],
  ['清洲城', 'Kiyosu Castle'], ['岩村城', 'Iwamura Castle'], ['小谷城', 'Odani Castle'], ['芥川山城', 'Akutagawayama Castle'], ['後瀬山城', 'Nochiseyama Castle'],
  ['八上城', 'Yakami Castle'], ['上野城', 'Ueno Castle'], ['松尾城', 'Matsuo Castle'], ['飛騨松倉城', 'Hida-Matsukura Castle'], ['柏原城', 'Kashiwabara Castle'], ['比自山城', 'Hijiyama Castle'],
  ['攻められる城', 'Castles under attack'],

  // 国の力・城下の札
  ['織田家の力', 'Power of the Oda clan'], ['織田信長・あなたは足軽大将', 'Oda Nobunaga · You are an ashigaru captain'],
  ['石高', 'Rice yield'], ['万', 'x10k'], ['人', ' '], ['石', 'koku'], ['金', 'Gold'], ['貫', 'kan'], ['兵糧', 'Provisions'], ['兵', 'Troops'],
  [/^金ひと月あたり 増える (\d+)$/, (m) => `Gold per month: +${m[1]}`], [/^兵糧ひと月あたり 減る (\d+)$/, (m) => `Provisions per month: −${m[1]}`], [/^兵ひと月あたり 増える (\d+)$/, (m) => `Troops per month: +${m[1]}`],
  [/^\+(\d+)\/月$/, (m) => `+${m[1]}/mo`], [/^−(\d+)\/月$/, (m) => `−${m[1]}/mo`],
  [/^秋の年貢の見込み \+([\d,]+)石$/, (m) => `Expected autumn tax +${m[1]} koku`],
  ['次の戦へ', 'To the next battle'], [/^城下へ戻って、次の戦（(.+)）の支度をする$/, (m) => `Return to the town and prepare for the next battle (${tr(m[1])})`],
  ['近ごろの知らせ', 'Recent news'], ['はじめ', 'Start'],
  ['信長包囲網の世。浅井の裏切りで金ヶ崎から逃げ帰った信長は、姉川で浅井・朝倉に決戦を挑む。三好・本願寺・武田が次々に敵へ回る。', 'The age of the Nobunaga encirclement. Betrayed by Asai at Kanegasaki, Nobunaga flees home, then meets Asai and Asakura at the Anegawa. Miyoshi, Hongan-ji and Takeda turn against him one by one.'],
  ['今の目標', 'Current goal'], ['いまの物語：弘治二年　信長包囲網のころ', 'Story now: Kōji 2, the days of the Nobunaga encirclement'],
  ['本願寺を討つ。長島願証寺を落とす', 'Defeat Hongan-ji. Take Nagashima Ganshō-ji'], ['長島願証寺を攻める', 'Attack Nagashima Ganshō-ji'],
  ['季節を送る', 'Next season'], [/^当主 (.+)・城 (\d+)$/, (m) => `Lord: ${({ 織田信長: 'Oda Nobunaga' })[m[1]] || m[1]} · ${m[2]} castles`],
  ['身分', 'Rank'], [/^勲功 (\d+)／(\d+)$/, (m) => `Merit ${m[1]}/${m[2]}`], [/^勲功 (\d+)、次の身分まで (\d+)$/, (m) => `Merit ${m[1]}, ${m[2]} to the next rank`],
  ['内政・評定・武将・天下を開く', 'Open domestic affairs, council, warlords and the realm'], [/^決まっていない進言 (\d+)$/, (m) => `${m[1]} proposals undecided`],
  ['地図の札', 'Map card'], ['内政', 'Domestic'], ['（部将から）', '(from your officers)'], ['評定', 'Council'], ['天下', 'Realm'],
  ['あなたの持ち場', 'Your post'], [/^城主 (.+) の札を開く$/, (m) => `Open the card of lord ${({ 明智光秀: 'Akechi Mitsuhide' })[m[1]] || m[1]}`],
  ['城主', 'Lord'], ['42歳', 'Age 42'], [/^(\d+)歳$/, (m) => `Age ${m[1]}`],
  [/^統率(\d+)・武勇(\d+)・知略(\d+)・政治(\d+)$/, (m) => `Leadership ${m[1]} · Valor ${m[2]} · Intellect ${m[3]} · Politics ${m[4]}`],
  [/^統率(\d+)・政治(\d+)$/, (m) => `Leadership ${m[1]} · Politics ${m[2]}`],
  ['統', 'Ldr'], ['武', 'Val'], ['知', 'Int'], ['政', 'Pol'],
  ['野心家', 'Ambitious'], ['不満がたまると寝返る', 'Turns coat when discontent builds'], ['鉄砲の扱いに長ける。守りに強い', 'Skilled with guns. Strong on defense'], ['家老', 'Elder'],
  [/^([\d.]+)万石$/, (m) => `${Math.round(parseFloat(m[1]) * 10000).toLocaleString('en-US')} koku`], ['商業', 'Commerce'], [/^([\d,]+)人$/, (m) => `${m[1]}`], ['堅さ', 'Solidity'], ['民の心', 'Loyalty'],
  [/^商業から入る金：毎季 約(\d+)貫（兵の支出を引く前）。$/, (m) => `Gold from commerce: about ${m[1]} kan each season (before troop costs).`],

  // 題・戦の選び
  ['ほかの操作', 'More options'], ['空き', 'Empty'],
  ['城下で自動保存します。保存文字列は城下で保存した時の控えです。進行・図鑑・実績・稽古の記録が入ります。端末の設定と戦の途中の状態は含みません。', 'Saves automatically in the castle town. The save code is a copy made there. It holds progress, guide, achievements and training; not device settings or mid-battle state.'],
  ['進みは自動で保存します。題の画面の「保存記録」→「枠1」で見られます。', 'Progress saves automatically. See it under "Save data" → "Slot 1" on the title screen.'],
  ['織田家編', 'Oda story'], ['永禄三年（1560）〜', 'Eiroku 3 (1560) –'],
  ['織田家の足軽として、尾張の稲生の野から始める。織田家が戦ってきた戦を一つずつ越え、足軽大将へ', 'Start as an Oda ashigaru on the fields of Ino in Owari. Clear the battles the Oda fought, one by one, up to ashigaru captain'],
  ['届く身分：', 'Reachable rank: '], ['まで', '(max)'], ['織田家編の戦の並びを見る', 'See the battle list of the Oda story'],
  ['豊臣編', 'Toyotomi story'], ['天正十年（1582）〜', 'Tenshō 10 (1582) –'], ['本能寺の後、羽柴秀吉に付いて天下統一まで戦う', 'After Honnō-ji, fight beside Hashiba Hideyoshi until the realm is united'],
  ['豊臣編の戦の並びを見る', 'See the battle list of the Toyotomi story'],
  ['易', 'Easy'], ['難', 'Hard'], ['受ける傷が少ない。退いて手当ては二回まで', 'Less damage taken. Retreat to be treated up to twice'],
  ['重傷を負うと後送される。傷は城下へ戻れば癒える', 'Badly wounded, you are sent to the rear. Wounds heal in the town'], ['重傷はそのまま討死。やり直しはきかない', 'A bad wound is death. No retries'],
  // 織田家編の戦
  ['稲生の戦い', 'Battle of Ino'], ['桶狭間の戦い', 'Battle of Okehazama'], ['森部の戦い', 'Battle of Moribe'], ['墨俣築城防衛', 'Defense of the Sunomata fort'],
  ['稲葉山城の戦い', 'Battle of Inabayama Castle'], ['箕作城の戦い', 'Battle of Mitsukuri Castle'], ['大河内城の戦い', 'Battle of Ōkōchi Castle'], ['金ヶ崎の退き口', 'Retreat from Kanegasaki'],
  ['姉川の戦い', 'Battle of the Anegawa'], ['野田・福島の戦い', 'Battle of Noda and Fukushima'], ['志賀の陣・宇佐山城', 'Siege at Shiga · Usayama Castle'], ['比叡山攻め', 'Assault on Mt. Hiei'],
  ['三方ヶ原の戦い', 'Battle of Mikatagahara'], ['刀根坂の戦い', 'Battle of Tonezaka'], ['小谷城の戦い', 'Battle of Odani Castle'], ['長島一向一揆', 'Nagashima Ikkō-ikki'],
  ['長篠・設楽原の戦い', 'Battle of Nagashino and Shitaragahara'], ['越前一向一揆・木ノ芽峠', 'Echizen Ikkō-ikki · Kinome Pass'], ['越前・大滝寺の山狩り（伝承）', 'Echizen · Ōtakidera mountain sweep (legend)'],
  ['岩村城の戦い・水晶山', 'Battle of Iwamura Castle · Mt. Suishō'], ['天王寺の戦い', 'Battle of Tennōji'], ['雑賀攻め・小雑賀川', 'Siege of Saika · Kozaikagawa'], ['手取川の戦い', 'Battle of the Tedorigawa'],
  ['信貴山城の戦い', 'Battle of Shigisan Castle'], ['第二次木津川口の戦い', 'Second Battle of Kizugawaguchi'], ['三木城・大村の合戦', 'Battle of Miki Castle and Ōmura'], ['有岡城の戦い', 'Battle of Arioka Castle'],
  ['天正伊賀の乱・比自山城', 'Tenshō Iga War · Hijiyama Castle'], ['鳥取城の戦い', 'Battle of Tottori Castle'], ['高遠城の戦い', 'Battle of Takatō Castle'], ['田野の戦い・天目山', 'Battle of Tano · Mt. Temmoku'],
  ['本能寺の変', 'Honnō-ji Incident'],
  // 豊臣編の戦
  ['山崎の戦い', 'Battle of Yamazaki'], ['賤ヶ岳の戦い', 'Battle of Shizugatake'], ['小牧・長久手 一', 'Komaki and Nagakute I'], ['小牧・長久手 二', 'Komaki and Nagakute II'],
  ['紀州征伐／千石堀城', 'Kishū campaign / Sengokubori Castle'], ['紀州征伐／根来寺', 'Kishū campaign / Negoro-ji'], ['紀州征伐／太田城', 'Kishū campaign / Ōta Castle'], ['四国征伐／一宮城', 'Shikoku campaign / Ichinomiya Castle'],
  ['戸次川の戦い', 'Battle of the Hetsugigawa'], ['岩石城攻め', 'Siege of Iwaya Castle'], ['根白坂の戦い', 'Battle of Nejirozaka'], ['山中城の戦い', 'Battle of Yamanaka Castle'],
  ['忍城攻め', 'Siege of Oshi Castle'], ['八王子城の戦い', 'Battle of Hachiōji Castle'], ['小田原征伐', 'Odawara campaign'],
  // 負けの札（battle_retry.js・全戦共通）：題・釦・負けた訳・二度目からの手がかり・再開の札（クラウド 長篠城の持ち主 11/21）
  ['戦に負けた', 'Battle lost'], ['討死', 'Killed'], ['負傷', 'Wounded'],
  ['直前から再開', 'Retry from just before'], ['戦の最初から', 'Restart the battle'], ['結果を見る', 'See the results'],
  ['援護を強くする', 'Get more support'], ['このまま戦う', 'Keep fighting'], ['この局面を易しくする', 'Make this part easier'],
  ['火で大きな傷を負った', 'You were badly burned'], ['高い所から落ちた', 'You fell from a high place'],
  ['矢や鉄砲で傷を負った', 'You were hit by arrows or guns'], ['傷が重なり、戦えなくなった', 'Your wounds piled up and you could not fight'],
  ['本陣に 敵が入った', 'The enemy broke into the main camp'], ['敵を止めきれなかった', 'You could not stop the enemy'],
  ['味方が押され、守りきれなかった', 'Your side was pushed back and could not hold'],
  ['矢と鉄砲の前に立ち止まらず、横から回ろう', 'Do not stand still in front of arrows and guns. Go around the side.'],
  ['囲まれる前に、味方の列へ戻ろう', 'Get back to your allies before you are surrounded.'],
  ['火の手を避けて、別の道から回ろう', 'Avoid the fire and take another way.'],
  ['一人で前に出ず、味方と並んで戦おう', 'Do not go ahead alone. Fight beside your allies.'],
  ['行き先の印から離れずに戦おう', 'Stay near the goal marker while you fight.'],
  ['前回まで', 'Before'], ['現在', 'Now'],
];
