// K516 英語版：武田編・上杉編の戦の選びの画面などに出る字（戦の名・場所・町・章の説明）。
//   英語の時だけ i18n.js が読む（日本語の時は読まない・重さ0）。人名・地名は docs/en_glossary_clans.md に合わせる。クラウド46 11/21。
export default [
  // 町
  ['甲府', 'Kofu'], ['駿府', 'Sunpu'], ['新府', 'Shinpu'], ['春日山', 'Kasugayama'], ['春日山城下', 'Below Kasugayama Castle'],
  // 章の名・説明
  ['武田の足軽として、川中島から天目山まで戦う', 'As a Takeda foot soldier, fight from Kawanakajima to Mt. Temmoku'],
  ['天文二十二年（1553）〜', 'Tenbun 22 (1553) –'],
  ['長尾景虎（上杉謙信）に付き、川中島から関東・北陸へ戦う', 'Serve Nagao Kagetora (Uesugi Kenshin) and fight from Kawanakajima to the Kanto and Hokuriku'],
  // 武田編 戦の名・場所
  ['川中島の戦い', 'Battle of Kawanakajima'], ['信濃国 八幡原（第四次川中島）', 'Hachimanbara, Shinano (Fourth Kawanakajima)'],
  ['箕輪城攻め', 'Siege of Minowa Castle'], ['三増峠の戦い', 'Battle of Mimase Pass'], ['蒲原城攻め', 'Siege of Kanbara Castle'], ['花沢城攻め', 'Siege of Hanazawa Castle'],
  ['二俣城攻め', 'Siege of Futamata Castle'], ['野田城攻め', 'Siege of Noda Castle'], ['三河国 野田城', 'Noda Castle, Mikawa'],
  ['高天神城の戦い（一）', 'Battle of Takatenjin Castle (I)'], ['高天神城の戦い（二）', 'Battle of Takatenjin Castle (II)'], ['長篠城攻め', 'Siege of Nagashino Castle'],
  ['鳥居峠の戦い', 'Battle of Torii Pass'], ['天目山の戦い', 'Battle of Mt. Temmoku'],
  // 上杉編 戦の名・場所
  ['布施の戦い', 'Battle of Fuse'], ['信濃の布施（第一次川中島）', 'Fuse, Shinano (First Kawanakajima)'],
  ['犀川の戦い', 'Battle of the Sai River'], ['信濃の犀川（第二次川中島）', 'Sai River, Shinano (Second Kawanakajima)'],
  ['上野原の戦い', 'Battle of Uenohara'], ['信濃の上野原（第三次川中島）', 'Uenohara, Shinano (Third Kawanakajima)'],
  ['小田原城の戦い', 'Battle of Odawara Castle'], ['相模の小田原城', 'Odawara Castle, Sagami'],
  ['八幡原の戦い', 'Battle of Hachimanbara'], ['信濃の八幡原（第四次川中島）', 'Hachimanbara, Shinano (Fourth Kawanakajima)'],
  ['生野山の戦い', 'Battle of Ikunoyama'], ['武蔵の生野山', 'Ikunoyama, Musashi'],
  ['塩崎の対陣', 'Standoff at Shiozaki'], ['信濃の塩崎（第五次川中島）', 'Shiozaki, Shinano (Fifth Kawanakajima)'],
  ['臼井城の戦い', 'Battle of Usui Castle'], ['下総の臼井城', 'Usui Castle, Shimosa'],
  ['本庄繁長の乱', 'Revolt of Honjo Shigenaga'], ['越後の本庄城', 'Honjo Castle, Echigo'],
  ['尻垂坂の戦い', 'Battle of Shiritarezaka'], ['越中の尻垂坂', 'Shiritarezaka, Etchu'],
  ['七尾城の戦い', 'Battle of Nanao Castle'], ['能登の七尾城', 'Nanao Castle, Noto'],
  ['手取川の戦い', 'Battle of the Tedori River'], ['加賀の手取川', 'Tedori River, Kaga'],
  ['御館の乱', 'Otate Disturbance'], ['越後の春日山・御館', 'Kasugayama and Otate, Echigo'],
  ['新発田重家の乱', 'Revolt of Shibata Shigeie'], ['越後の新発田城', 'Shibata Castle, Echigo'],
  ['長谷堂城の戦い', 'Battle of Hasedo Castle'], ['出羽の長谷堂城', 'Hasedo Castle, Dewa'],
  // 題の画面：身分つきの名・筋書きの終わり・次の戦・記録の注意（K516 クラウド46）
  [/^(.+)・(雑兵|足軽|足軽大将|侍大将|武将|大名)$/, (m) => { const R = { 雑兵: 'Foot soldier', 足軽: 'Ashigaru', 足軽大将: 'Ashigaru captain', 侍大将: 'Samurai commander', 武将: 'Warlord', 大名: 'Daimyo' }; return `${m[1]} · ${R[m[2]]}`; }],
  [/^(武田|上杉)編を終えた$/, (m) => `${m[1] === '武田' ? 'Takeda' : 'Uesugi'} chapters complete`],
  [/^(武田|上杉)編・次は(.+)$/, (m) => `${m[1] === '武田' ? 'Takeda' : 'Uesugi'} · Next: ${m[2]}`],
  ['記録を残さずに、好きな戦をもう一度遊べます（いまの身分・装備・組のまま）。', 'Replay any battle you like without saving progress (rank, gear and squad stay as they are).'],
  [/^進みは自動で保存します。題の画面の「保存記録」→「枠(\d)」で見られます。枠(\d)の「(.+)」は残ります。$/, (m) => `Progress saves automatically. Find it under Saved records → Slot ${m[1]} on the title screen. Slot ${m[2]}'s "${m[3]}" is kept.`],
  // 武田編の戦の場所（戦の中の年と場所の札・K516 クラウド46）
  ['上野国 箕輪城', 'Minowa Castle, Kozuke'],
  ['相模国 三増峠', 'Mimase Pass, Sagami'],
  ['駿河国 蒲原城', 'Kanbara Castle, Suruga'],
  ['駿河国 花沢城', 'Hanazawa Castle, Suruga'],
  ['遠江国 二俣城', 'Futamata Castle, Totomi'],
  ['遠江国 三方ヶ原', 'Mikatagahara, Totomi'],
  ['遠江国 高天神城', 'Takatenjin Castle, Totomi'],
  ['三河国 長篠城', 'Nagashino Castle, Mikawa'],
  ['三河国 設楽原', 'Shitaragahara, Mikawa'],
  ['信濃国 鳥居峠', 'Torii Pass, Shinano'],
  ['信濃国 高遠城', 'Takato Castle, Shinano'],
  ['甲斐国 田野', 'Tano, Kai'],
  // 戦の中の組の人数の読み上げ（aria-label）：名前は表で引く
  [/^(.+) 残り([\d,]+)人$/, (m, t) => { const n = t(m[1]); return (n === undefined || /[\u3040-\u30ff\u4e00-\u9fff]/.test(n)) ? undefined : `${n}: ${m[2]} left`; }],
  // 信貴山城の段の見出し（一覧の番号つきの行の後ろ・K516 クラウド46）
  ['尾根道の伏兵を討ち、大手の木戸へ登る', 'Defeat the ambush on the ridge road and climb to the main gate'],
  ['大手の木戸を掛矢で打つ', 'Break the main gate with mallets'],
  ['土橋で、打って出た松永勢を討つ', 'Cut down the Matsunaga sortie on the earthen bridge'],
  ['北尾根の下の曲輪を取り、松永屋敷との道を断つ', 'Take the lower bailey on the north ridge and cut the road to the Matsunaga residence'],
  ['本丸の南口へ攻め入り、館の前を固める', 'Storm the south entrance of the main keep and secure the front of the hall'],
  // 名前の無い軍の人数の読み上げ（岩村城）
  [/^\s*残り([\d,]+)人$/, (m) => `${m[1]} left`],
];
