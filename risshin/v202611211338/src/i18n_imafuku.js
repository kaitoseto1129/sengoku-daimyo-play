// K516 英語版：今福の戦い（k09_imafuku）の画面に出る字（戦の名・任務の一行・ピン・武将と組の名・物語の札・結果の札・使番の声）。
//   英語の時だけ b_k09_imafuku.js から読む（日本語の時は読まない・重さ0）。名は人の名をローマ字で、組は短い英語で。
//   クラウド 今福の持ち主 11/21。
const MOR = { 意気盛ん: 'high spirits', 平常: 'steady', 動揺: 'shaken', 崩れかけ: 'breaking' };
const NAME = new Map([
  ['梅津憲忠', 'Umezu Noritada'], ['渋江政光', 'Shibue Masamitsu'], ['佐竹義宣', 'Satake Yoshinobu'], ['戸村義国', 'Tomura Yoshikuni'],
  ['木村重成', 'Kimura Shigenari'], ['後藤又兵衛', 'Goto Matabei'], ['矢野正倫', 'Yano Masanori'], ['飯田家貞', 'Iida Iesada'],
  ['堀尾忠晴', 'Horio Tadaharu'], ['榊原康勝', 'Sakakibara Yasukatsu'], ['水原親憲', 'Suibara Chikanori'],
]);
const UNIT = new Map([
  ['梅津憲忠の隊', 'Umezu troop'], ['渋江政光の組', 'Shibue squad'], ['戸村義国の組', 'Tomura squad'], ['佐竹の二の備', 'Satake second line'],
  ['佐竹の後備', 'Satake rear guard'], ['佐竹義宣の本陣', 'Satake Yoshinobu HQ'], ['木村重成の隊', 'Kimura troop'], ['木村重成の先手', 'Kimura vanguard'],
  ['木村重成の二の手', 'Kimura second wave'], ['木村重成の殿', 'Kimura rear guard'], ['木村重成の反撃', 'Kimura counterattack'],
  ['後藤又兵衛の隊', 'Goto troop'], ['後藤又兵衛の殿', 'Goto rear guard'], ['後藤又兵衛の舟の鉄砲', 'Goto boat guns'],
  ['矢野正倫の守兵', 'Yano garrison'], ['飯田家貞の守兵', 'Iida garrison'], ['矢来の番手', 'Palisade guard'], ['櫓の守り', 'Tower guard'],
  ['今福村の鉄砲', 'Imafuku village guns'], ['堤の南の葦の鉄砲', 'Guns in the south reeds'], ['鯰江川べりの鉄砲衆', 'Namazue river guns'],
  ['大和川べりの鉄砲衆', 'Yamato river guns'], ['堀尾忠晴の鉄砲衆', 'Horio guns'], ['榊原康勝の鉄砲衆', 'Sakakibara guns'],
  ['水原親憲の鉄砲衆', 'Suibara guns'], ['上杉の加勢', 'Uesugi support'], ['足軽', 'Ashigaru'],
]);
const who = (s) => NAME.get(s) || UNIT.get(s);
export default [
  ...NAME, ...UNIT,
  // 戦の名・日時・場所
  ['今福の戦い', 'Battle of Imafuku'], ['今福', 'Imafuku'], ['今福（大坂城の北東）', 'Imafuku (northeast of Osaka Castle)'],
  ['佐竹勢', 'Satake army'], ['豊臣方', 'Toyotomi side'], ['佐竹', 'Satake'], ['豊臣', 'Toyotomi'],
  ['佐竹　千五百', 'Satake 1,500'], ['豊臣　六百', 'Toyotomi 600'],
  ['慶長十九年十一月二十六日　大坂城の北東', 'Dec 26, 1614. Northeast of Osaka Castle'],
  ['慶長十九年（1614）十一月二十六日　夜明け前・薄霧', 'Dec 26, 1614. Before dawn, light mist'],
  ['夜明け前の今福。鯰江川と大和川にはさまれた一筋の堤を、梅津憲忠の隊と西へ寄せる。豊臣方の四重の柵を破り、砦を奪え。',
    'Imafuku before dawn. With Umezu Noritada\'s troop, push west along the single dike between the Namazue and Yamato rivers. Break the four palisades and take the fort.'],
  // 任務（右上の一行）
  ['堤を西へ進み、四重の柵を破って今福の砦を奪う', 'Push west on the dike, break the four palisades and take the Imafuku fort'],
  ['堤の上を西へ、砦の前まで進め', 'Go west along the dike to the fort'],
  ['堤を西へ進み、砦の前へ', 'Go west on the dike to the fort'],
  ['四つの柵の木戸を破り、矢野正倫と飯田家貞を討て', 'Break the four palisade gates. Slay Yano Masanori and Iida Iesada'],
  ['四重の柵を破り今福の砦を奪う', 'Break the four palisades and take the Imafuku fort'],
  ['奪った今福の砦に踏みとどまり、木村重成の反撃を押しとどめよ', 'Hold the captured fort and stop Kimura Shigenari\'s counterattack'],
  ['奪った砦で木村重成の反撃を止める', 'Stop Kimura\'s counterattack at the fort'],
  ['今福の砦の西口へ戻れ', 'Return to the west gate of the fort'],
  ['砦の西口で残る反撃を押し返せ', 'Push back the last attack at the west gate'],
  ['上杉の加勢とともに、砦の西の堤から木村・後藤の殿を追い払え', 'With the Uesugi support, drive the Kimura and Goto rear guard off the dike west of the fort'],
  ['砦の西の堤で木村・後藤の殿を追い払う', 'Drive off the Kimura and Goto rear guard west of the fort'],
  ['上杉の鉄砲が中州から撃ちかける', 'Uesugi guns fire from the sandbar'],
  ['鴫野の上杉勢が大和川の中州から撃ちかける', 'The Uesugi at Shigino fire from the Yamato river sandbar'],
  ['細い堤の上に鉄砲が並ぶ', 'Guns line the narrow dike'], ['佐竹の先手が崩れる', 'The Satake vanguard breaks'],
  ['堤へ寄せる', 'Advance to the dike'], ['押し返す', 'Push back'],
  // 結果・知らせ
  ['今福の砦を奪った', 'Imafuku fort taken'], ['砦を奪った', 'Fort taken'], ['矢野正倫と飯田家貞の首を挙げた', 'Yano Masanori and Iida Iesada slain'],
  ['矢野正倫と飯田家貞', 'Yano and Iida'],   // ②の行き先の札（goal_sign の名）
  ['今福を保ち、豊臣方を退けた', 'Held Imafuku and drove off the Toyotomi'], ['増援とともに豊臣方を退けた', 'Drove off the Toyotomi with reinforcements'],
  ['今福堤で踏みとどまった', 'Held firm on the Imafuku dike'], ['堤の上で踏みとどまった', 'Held firm on the dike'],
  ['佐竹勢は今福の堤を保った', 'The Satake held the Imafuku dike'], ['佐竹勢は今福から押し戻された', 'The Satake were pushed out of Imafuku'],
  ['刻限までに今福を保てなかった', 'Imafuku was not held in time'], ['堤の上で潰えた', 'Crushed on the dike'],
  ['味方の大将が討たれた', 'Our general was killed'], ['味方の隊が崩れた', 'Our troop broke'], ['敵の隊が崩れた', 'Enemy troop broke'],
  ['渋江政光、討死', 'Shibue Masamitsu killed'], ['豊臣方、退く', 'The Toyotomi retreat'], ['一騎打ち', 'Duel'],
  // ピン・場所
  ['堤', 'Dike'], ['砦の前', 'Before the fort'], ['砦の木戸', 'Fort gate'], ['砦の東口', 'Fort east gate'], ['砦の西口', 'Fort west gate'],
  ['砦の矢来', 'Fort palisade'], ['砦の西の堤', 'Dike west of the fort'], ['今福の砦', 'Imafuku fort'], ['外の矢来', 'Outer palisade'],
  ['外の矢来の木戸', 'Outer palisade gate'], ['堤をふさぐ四重の柵', 'Four palisades across the dike'], ['使番', 'Messenger'],
  ['殿', 'My lord'], ['お頭', 'Captain'], ['長蛇', 'Long column'],
  // 声（使番・武将）
  ['大坂城は目と鼻の先。半右衛門、内膳、先陣は任せた。音を立てずに寄せよ', 'Osaka Castle is right before us. Han\'emon, Naizen, the van is yours. Advance without a sound'],
  ['通れるのはこの堤だけじゃ。夜の明けぬうちに、堤の陰に身を低うして寄る。声を立てるな', 'This dike is the only way. Keep low in its shadow before dawn. Not a word'],
  ['気づかれた！　今福村と葦の中から鉄砲じゃ！　堤の両側に伏せておる！', 'We\'re spotted! Guns from Imafuku village and the reeds! They lie on both sides of the dike!'],
  ['堤の両側から鉄砲が並んだ！　横から撃たれる！', 'Guns on both sides of the dike! We\'re shot from the flank!'],
  ['堤から外れるな！　足を取られて動けなくなるぞ！', 'Stay on the dike! You\'ll sink in the mud!'],
  ['木戸を破れ！　柵を一つずつ越えて砦へ迫れ！', 'Break the gate! Cross each palisade and close on the fort!'],
  ['木戸が倒れた！　次の柵じゃ、続け！', 'The gate is down! On to the next palisade!'],
  ['砦の木戸が倒れた！　中へ斬り込め！', 'The fort gate is down! Cut your way in!'],
  ['あの馬上の指物が佐竹の侍大将じゃ。鉄砲、狙え！', 'That rider with the banner is the Satake commander. Guns, aim!'],
  ['よし、今福を取ったぞ！　今福村に付城を急げ。……西に鉄砲の列が見える、気を許すな', 'Imafuku is ours! Fortify the village. ...Guns to the west. Stay sharp'],
  ['旗は木村長門守！　若い大将が自ら出てきた！', 'The banner of Kimura Nagato! The young general comes himself!'],
  ['木村の新手が堤を押してくる！　下がるな！', 'Kimura\'s fresh troops push down the dike! Don\'t fall back!'],
  ['後藤又兵衛じゃ！　川からも舟で鉄砲が寄せてくる！', 'Goto Matabei! Guns are coming by boat on the river!'],
  ['渋江様が撃たれた！　渋江内膳様、お討死！', 'Lord Shibue is shot! Shibue Naizen is dead!'],
  ['内膳殿を失うた……堤の上に、これだけ倒れるとは', 'We lost Naizen... So many fallen on the dike'],
  ['内膳殿の分まで踏みとどまれ！　ここを抜かれれば佐竹は終わりじゃ', 'Hold for Naizen! If they break through here, the Satake are finished'],
  ['堤が……！　皆、東へ退け！', 'The dike...! Everyone, fall back east!'],
  ['佐竹を見捨てるな！　中州から堤の敵を横から撃て！', 'Don\'t abandon the Satake! Fire on the dike from the sandbar!'],
  ['大和川の中州に上杉の鉄砲じゃ！　竹に雀の旗が並んだ！', 'Uesugi guns on the Yamato sandbar! Their sparrow banners are up!'],
  ['上杉の弾か……脇腹をやられた。構わぬ、退きながら撃て！', 'Uesugi shot... my side is hit. No matter, fire as you fall back!'],
  ['上杉の鉄砲が殿を崩したぞ！　木村・後藤は城へ退く！', 'Uesugi guns broke their rear guard! Kimura and Goto fall back to the castle!'],
  ['長門殿、城へ引かれよ。殿も退くぞ、仮橋を渡れ！', 'Lord Nagato, back to the castle. The rear guard follows. Cross the bridge!'],
  ['鴫野で鉄砲が鳴った。上杉はもう寄せておる。軍監殿に「佐竹は油断」と咎められたぞ', 'Guns at Shigino. The Uesugi already attack. The inspector says the Satake were careless'],
  ['旗を立てよ。柵を結い直せ。今福は佐竹が持つ', 'Raise the banners. Retie the palisade. Imafuku is Satake\'s'],
  ['南の鴫野では、まだ上杉の鉄砲が鳴っておる……', 'To the south at Shigino, Uesugi guns still sound...'],
  // 数・名を含む字
  [/^砦の西口を守る あと(\d+)秒$/, (m) => `Hold the fort west gate: ${m[1]}s left`],
  [/^佐竹の組が砦を守り抜いたぞ！　(殿|お頭)、西の堤へ！$/, (m) => `The Satake held the fort! ${m[1] === '殿' ? 'My lord' : 'Captain'}, to the west dike!`],
  [/^佐竹の組が(.+)を討ったぞ！$/, (m) => { const e = who(m[1]); return e ? `The Satake squad cut down ${e}!` : undefined; }],
  [/^(.+)、討ち取ったり！$/, (m) => { const e = who(m[1]); return e ? `${e} slain!` : undefined; }],
  [/^(.+?)[　 ]+討ち取ったり[！!]?$/, (m) => { const e = who(m[1]); return e ? `${e} slain!` : undefined; }],   // 大きな筆の字（victory_moment の brushWord「飯田家貞 討ち取ったり」）
  [/^(.+)を討った$/, (m) => { const e = who(m[1]); return e ? `Slew ${e}` : undefined; }],
  [/^(.+)が深手じゃ！　豊臣の者が担いで引いていく！$/, (m) => { const e = who(m[1]); return e ? `${e} is badly hurt! The Toyotomi carry him off!` : undefined; }],
  [/^(.+)に深手を負わせた$/, (m) => { const e = who(m[1]); return e ? `Badly wounded ${e}` : undefined; }],
  [/^(.+)が退いていく！$/, (m) => { const e = who(m[1]); return e ? `${e} falls back!` : undefined; }],
  [/^(.+)・(意気盛ん|平常|動揺|崩れかけ)$/, (m) => { const e = who(m[1]); return e ? `${e}: ${MOR[m[2]]}` : undefined; }],
];
