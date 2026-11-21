// K516 英語版：諏訪原城攻め（長篠編 五戦目 suwahara）の画面に出る字（任務・副任務・ピン・組の名・札・物語・数の入る字）。
//   英語の時だけ b_suwahara.js から読む（日本語の時は読まない・重さ0）。rt.say の台詞は字幕を出さないので入れない。クラウド46 11/21。
const MOR = { 意気盛ん: 'high spirits', 平常: 'steady', 動揺: 'shaken', 崩れかけ: 'breaking' };
const mo = (w) => MOR[w] || w;
export default [
  // 場所・人・組
  ['一の門', 'First gate'], ['二の門（櫓門）', 'Second gate (tower gate)'], ['二の門', 'Second gate'], ['塀', 'Wall'], ['馬出の柵', 'Palisade of the outwork'], ['櫓', 'Tower'],
  ['徳川家康', 'Tokugawa Ieyasu'], ['大久保組', 'Okubo unit'], ['大久保忠世', 'Okubo Tadayo'], ['先手・左', 'Vanguard, left'], ['先手・右', 'Vanguard, right'],
  ['門破りの組', 'Gate-breaking unit'], ['門破りの頭 本多作左', 'Gate-breaker leader Honda Sakuza'], ['馬出の守り', 'Outwork defenders'], ['大手の守り', 'Main-gate defenders'],
  ['本曲輪の城兵', 'Main-bailey garrison'], ['今福浄閑', 'Imafuku Jokan'], ['使番', 'Messenger'], ['大久保の槍組', 'Okubo spear unit'],
  ['搦手の城兵', 'Back-gate garrison'], ['搦手より城兵', 'Garrison from the back gate'], ['本曲輪の奥の城兵', 'Garrison deep in the main bailey'], ['城将・今福浄閑', 'Castle commander Imafuku Jokan'],
  ['今福浄閑の旗本', 'Imafuku Jokan’s guards'], ['徳川軍', 'Tokugawa army'], ['武田方 諏訪原城', 'Takeda: Suwahara Castle'],
  // 任務・副任務
  ['三日月堀を越え、城将今福浄閑を討て', 'Cross the crescent moat and kill the castle commander Imafuku Jokan'], ['組を散開させて堀へ寄せよ', 'Spread your unit out and advance to the moat'],
  ['組を率い、城の前の三日月堀の際まで寄せる', 'Lead your unit to the edge of the crescent moat before the castle'], ['寄せよ', 'Advance'],
  ['丸馬出から出る城兵を受け止め、押し返す', 'Meet the garrison sortieing from the round outwork and push it back'], ['打って出た敵を崩せ', 'Break the enemy that sallied out'],
  ['門を破れ', 'Break the gate'], ['門破りの組を守り、大手の一の門・二の門を破る', 'Guard the gate-breaking unit and break the first and second main gates'],
  ['門破りの組を半分より多く生かして、門を破れ', 'Break the gate, keeping more than half of the gate-breaking unit alive'],
  ['弓組で隅櫓の射手を射落とせ', 'Shoot down the corner-tower archers with your archers'], ['本曲輪へ押し込め', 'Push into the main bailey'],
  ['本曲輪へ押し込み、城将今福浄閑を討つ', 'Push into the main bailey and kill the commander Imafuku Jokan'], ['組と今福浄閑を討ち取れ', 'Kill Imafuku Jokan and his unit'],
  ['枡形へ押し込め', 'Push into the square gate court'], ['枡形の奥の二の門を破れ', 'Break the second gate beyond the court'], ['寄せの下知まで待つ', 'Wait for the order to advance'],
  ['副任務：馬出の出撃を押し返した', 'Side mission: pushed back the outwork sortie'], ['副任務：門破りの組を守った', 'Side mission: protected the gate-breakers'],
  ['副任務：組を散開させた', 'Side mission: spread the unit out'], ['副任務：隅櫓の射手を黙らせた', 'Side mission: silenced the corner-tower archers'],
  // ピン・札・出来事
  ['三日月堀の際まで', 'To the edge of the crescent moat'], ['三日月堀の際', 'Edge of the crescent moat'], ['堀の際まで寄せた', 'Reached the moat edge'],
  ['馬出の出撃', 'Outwork sortie'], ['丸馬出より打って出る', 'Sortie from the round outwork'], ['左右の脇の口から', 'From the side gates, left and right'],
  ['脇の口から出た所を狙え。まだ撃つな……', 'Aim at those coming out of the side gates. Do not fire yet...'], ['先手の鉄砲、放てぇっ！', 'Vanguard gunners, fire!'],
  ['一斉射', 'Volley'], ['先手の鉄砲が、馬出から出た敵へ揃えて放つ', 'The vanguard gunners fire together at the enemy from the outwork'],
  ['馬出の出撃を押し返した', 'Pushed back the outwork sortie'], ['門破りの組、大手の一の門へ', 'Gate-breaking unit to the first main gate'],
  ['門破りの組を守った', 'Protected the gate-breakers'], ['二の門、破れる', 'The second gate breaks'], ['一の門、破れる', 'The first gate breaks'],
  ['諏訪原城を落とした', 'Took Suwahara Castle'], ['諏訪原城、落つ', 'Suwahara Castle falls'], ['組を散開させた', 'Spread the unit out'],
  ['隅櫓の射手を黙らせた', 'Silenced the corner-tower archers'], ['城将・今福浄閑、討たれる', 'Commander Imafuku Jokan is killed'], ['城兵は城を捨てて落ちていく', 'The garrison abandons the castle and flees'],
  ['日暮れ', 'Dusk'], ['城は落ちず、寄せ手は陣へ引き揚げた', 'The castle did not fall; the attackers withdrew to camp'], ['組、潰える', 'The unit is wiped out'],
  ['預かった二十人を失った', 'Lost all twenty men entrusted to you'], ['城将討ち取り', 'Commander killed'], ['城将・今福浄閑を討ち取った', 'Killed the commander Imafuku Jokan'],
  ['馬出の守り、まだ崩れませぬ！', 'The outwork defense still holds!'], ['一の門、まだ破れず！', 'The first gate still holds!'],
  ['二の門、まだ破れず！　枡形で横矢を受けております！', 'The second gate still holds! We are taking flanking fire in the gate court!'],
  ['昼', 'Noon'], ['昼下がり', 'Afternoon'], ['夕暮れ', 'Dusk'],
  ['諏訪原城は、武田方が大井川の西の台地に築いた遠江攻めの拠点で、丸馬出と三日月堀の縄張りが残る。ただし残る縄張りには徳川時代の改修も含まれ、今の城跡の形すべてを武田時代のものとは決められない。この戦の曲輪・門・堀の配置は城跡をもとにした推定である。天正三年、長篠の戦いの後に徳川家康はこの城を攻め、八月に落とした。城兵の多くは小山城の方へ退いたと伝わり、城将・今福浄閑の最期には諸説がある。家康は城を牧野城と改め、武田方の高天神城に向き合う押さえとした。',
    'Suwahara Castle was a Takeda base for attacking Totomi, built on a plateau west of the Oi River; its round outwork (maru-umadashi) and crescent moat (mikazuki-bori) survive. The surviving earthworks include Tokugawa-era alterations, so the whole present shape cannot be called Takeda work. The layout of the baileys, gates and moats in this battle is an estimate based on the castle ruins. In 1575, after the battle of Nagashino, Tokugawa Ieyasu attacked the castle and took it in August. Most of the garrison are said to have withdrawn toward Oyama Castle, and accounts of the death of the commander Imafuku Jokan differ. Ieyasu renamed it Makino Castle and made it a check against the Takeda stronghold of Takatenjin.'],
  // 数・形の入る字
  [/^打って出た敵・(.+)$/, (m) => `Enemy that sallied out — ${mo(m[1])}`], [/^搦手の城兵・(.+)$/, (m) => `Back-gate garrison — ${mo(m[1])}`],
  [/^門破りの組（(\d+)人）$/, (m) => `Gate-breaking unit (${m[1]})`], [/^隅櫓の射手 (\d+)人$/, (m) => `Corner-tower archers ${m[1]}`],
  [/^(東|西)の堀沿いから門破りを狙う$/, (m) => `Aims at the gate-breakers along the ${m[1] === '東' ? 'east' : 'west'} moat`],
  [/^あと (\d+)m$/, (m) => `${m[1]}m to go`], [/^打って出た敵 (\d+)人$/, (m) => `Sortied enemy ${m[1]}`], [/^残り (\d+)\/(\d+)人$/, (m) => `${m[1]}/${m[2]} left`],
  [/^本曲輪の城兵 (\d+)人$/, (m) => `Main-bailey garrison ${m[1]}`],
  [/^(.+) (\d+)% ・ 門破り (\d+)人$/, (m) => `${m[1] === '一の門' ? 'First gate' : m[1] === '二の門' ? 'Second gate' : m[1]} ${m[2]}% · gate-breakers ${m[3]}`],
  [/^(.*)・日暮れまで (\d+)分$/, (m, tr) => `${m[1] ? (tr ? tr(m[1]) : m[1]) + ' · ' : ''}${m[2]} min to dusk`], [/^(.+)が軋んでいる（残り (\d+)%）$/, (m) => `${m[1] === '一の門' ? 'The first gate' : m[1] === '二の門' ? 'The second gate' : m[1]} is straining (${m[2]}% left)`],
  [/^天正三年八月　秋・(雨|晴)・(.+)$/, (m) => `August 1575 — autumn, ${m[1] === '雨' ? 'rain' : 'clear'}, ${({ 昼: 'midday', 昼下がり: 'afternoon', 夕暮れ: 'dusk' })[m[2]] || m[2]}`],
  // 戦の前と後の札（11/21 クラウド suwahara の持ち主）：物語の札（main.js）・始まりの札（battle_welcome.js）・戦の前の心得・落城の札（castle_fall_data.js）・出世の言葉と町の噂（screens.js）
  ['天正三年（1575）八月　遠江', 'August 1575 — Totomi'], ['諏訪原城', 'Suwahara Castle'], ['城を囲む', 'Surround the castle'],
  ['長篠で宿将の多くを失い、武田家中は揺れていた。家康はこの機を逃さず、遠江へ攻め入る。', 'Having lost many veteran generals at Nagashino, the Takeda house was shaken. Ieyasu seized the moment and marched into Totomi.'],
  ['狙うは大井川を見下ろす台地の山城、諏訪原城。丸い馬出と三日月の堀に守られた、武田の遠江の要である。', 'His target was Suwahara Castle, a hill fort on a plateau above the Oi River. Guarded by a round outwork and a crescent moat, it was the Takeda keystone in Totomi.'],
  [/^(.+)は(雑兵|足軽|足軽大将|侍大将)として、城攻めの先手に加わった。$/, (m) => `${m[1]} joined the vanguard of the siege as ${({ 雑兵: 'a foot soldier', 足軽: 'an ashigaru', 足軽大将: 'an ashigaru captain', 侍大将: 'a samurai commander' })[m[2]]}.`],
  ['堀と土の壁で守る城。門への道を確かめよう。', 'A castle guarded by moats and earthen walls. Find the way to the gate.'],
  ['丸馬出から打って出る敵を受け止め、門が破れたら組をまとめて本曲輪へ押し込め', 'Hold the enemy sallying from the round outwork. When the gate breaks, keep your unit together and push into the main bailey.'],
  ['諏訪原城　落城', 'Suwahara Castle falls'], ['城兵、小山城へ退く', 'The garrison flees to Koyama Castle'],
  ['大手の枡形、破れました！', 'The main gate court is broken!'], ['今福浄閑殿の手、崩れました！', 'Imafuku Jokan’s men have broken!'],
  ['諏訪原の兵', 'Suwahara soldier'], ['小山城へ落ちよ！', 'Fall back to Koyama Castle!'], ['味方の侍', 'Allied samurai'], ['……武田の旗が下りたぞ。', '...The Takeda banner is down.'],
  ['侍大将　大久保忠世', 'Samurai commander Okubo Tadayo'],
  ['諏訪原の門を破ったのは、その方の組じゃ。殿のお許しが出た。今日より侍大将。馬に乗り、組を率いよ', 'It was your unit that broke Suwahara’s gate. Our lord has given his leave: from today you are a samurai commander. Ride, and lead your men.'],
  ['城攻めの働き、殿にも申し上げた。足軽大将として励め', 'I told our lord of your work in the siege. Serve well as an ashigaru captain.'],
  ['諏訪原の城は、丸い馬出と三日月の堀で守られておるそうな', 'They say Suwahara Castle is guarded by a round outwork and a crescent moat.'],
  ['門さえ破れば、城の中は狭い。組をまとめて押し込め', 'Once the gate is broken, it is cramped inside. Keep your unit together and push in.'],
  // 描かずの英語の通し（11/21）で戦の中に残った二つ：大将の名札（点なし）と、speech_clean.js が『押し返す』を『迎え撃つ』に替えた段の札
  ['城将今福浄閑', 'Castle commander Imafuku Jokan'], ['丸馬出から出る城兵を受け止め、迎え撃つ', 'Meet the garrison sortieing from the round outwork and hold it'],
  ['天正三年八月　遠江', 'August 1575 — Totomi'],
  // 描かずの英語の通し（11/21 suwahara の持ち主・en_left_probe nagashino / lord:nagashino）で残った二つ：読み込みの「いつ・どこ」の一行と、行き先の▼の札（.gs-tag）
  ['天正三年八月　遠江国 諏訪原城', 'August 1575. Suwahara Castle, Totomi'], ['枡形の奥の二の門', 'Second gate beyond the court'],
];
