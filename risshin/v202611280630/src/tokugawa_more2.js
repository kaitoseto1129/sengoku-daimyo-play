// K674（11/26 Sanae）：徳川編の続きの段をさらに足し、一戦10任務にそろえる。tokugawa_more.js の MORE の終わりで rows と en に足される。
//   一行 = [休む人, 休む台詞, 休むEN, 段の名, 名EN, 副題, 副題EN, 任務, 任務EN, 台詞の人, 敵の台詞, 台詞EN, 敵[[名, 名EN, 'S2A10G3', 向き]]]
const T = { S: 'samurai', A: 'ashigaru', G: 'gun', B: 'bow', C: 'cavalry' };
const parse = (s) => [...s.matchAll(/([SAGBC])(\d+)/g)].map((m) => ({ type: T[m[1]], n: +m[2] }));
function rows(tbl, o = {}) {
  const out = { ...o, rows: [], en: [] };
  for (const r of tbl) {
    const [rs, rl, rle, t, te, s, se, o, oe, sn, sl, sle, foes] = r;
    out.rows.push({ rest: [[rs, rl]] });
    out.rows.push({ fight: { title: t, sub: s, obj: o, say: [[sn, sl]], foes: foes.map((f) => ({ name: f[0], list: parse(f[2]), ...(f[3] ? { dir: f[3] } : {}), ...(f[4] === 'hunt' ? { hunt: true } : {}) })) } });   // 五つ目 'hunt'：本人を狙って来る組（木津川口の火薬の蔵 11/28：表から hunt を渡す口が無かった）
    out.en.push([rl, rle], [t, te], [s, se], [o, oe], [sl, sle]);
    for (const f of foes) out.en.push([f[0], f[1]]);
  }
  return out;
}
export const MORE2 = {
  k02_kawada: rows([
    ['池田照政', '渡し場に岐阜へ逃げ遅れた者が溜まっておる', 'Stragglers bound for Gifu are bunched at the ferry.', '木曽川の渡し場', 'Kiso River ferry', '渡しを守って時を稼ぐ織田の組', 'Oda squads holding the ferry to buy time', '渡し場に残る織田の槍組を追い払え', 'Drive the Oda spearmen off the ferry landing', '織田の侍', '舟が出るまで持ちこたえよ！', 'Hold until the boats are away!', [['渡し場の槍組', 'Ferry spearmen', 'S2A10'], ['渡し場の鉄砲組', 'Ferry gunners', 'S1A3G4', 0.5]]],
    ['浅野幸長', '川手の町の口から、まだ鉄砲の音がする', 'Guns are still firing from the mouth of Kawate town.', '川手の町口', 'Kawate town gate', '町口の家の陰から撃つ織田の鉄砲', 'Oda guns firing from behind the houses at the gate', '川手の町口の鉄砲組を討て', 'Cut down the gunners at the Kawate gate', '織田の足軽', '家の陰から撃て。東の者を町へ入れるな！', "Fire from behind the houses. Don't let the Easterners into town!", [['町口の鉄砲組', 'Town-gate gunners', 'S1A4G7', -0.4], ['町口の槍組', 'Town-gate spearmen', 'S2A8', 0.5]]],
    ['一柳直盛', '竹藪が不自然に静かじゃ。伏せておるぞ', 'The bamboo grove is too quiet. They are lying in wait.', '竹藪の伏兵', 'Ambush in the bamboo', '閻魔堂の裏の竹藪に伏せた織田の兵', 'Oda troops lying in the bamboo behind Enmado', '竹藪に伏せた織田の伏兵を払え', 'Clear the Oda ambush from the bamboo grove', '織田の侍', '引き付けてから突け。まだ動くな！', 'Let them close, then thrust. Hold still!', [['竹藪の伏兵', 'Bamboo ambushers', 'S2A9', 0.3]]],
    ['池田照政', '岐阜へ向かう道の辻に、秀信の旗奉行がおる', "Hidenobu's banner officer is at the crossroads on the Gifu road.", '岐阜への辻', 'Gifu crossroads', '本陣の旗を守って退く旗奉行の備', "The banner officer's unit retreating with the colors", '岐阜への辻で秀信の旗奉行の備を討て', "Defeat the banner officer's unit at the Gifu crossroads", '旗奉行', '旗を倒すな。殿様の旗は城まで持ち帰る！', 'Do not let the banner fall. We take it home to the castle!', [['旗奉行の備', 'Banner officers', 'S3A10', 0], ['旗奉行の鉄砲', 'Banner gunners', 'S1A3G5', -0.6]]],
  ]),
  k03_gifu: rows([
    ['池田照政', '七曲りの坂から城兵が石を落とすぞ', 'The garrison is dropping stones from the winding slope.', '七曲りの坂', 'Winding slope', '坂の上から迎え撃つ岐阜の城兵', 'Gifu defenders striking down from the slope', '七曲りの坂を守る城兵を押し上げて討て', 'Push up the slope and cut down its defenders', '城兵', '坂を登らせるな。石を落とせ！', "Don't let them climb. Drop the stones!", [['坂の城兵', 'Slope defenders', 'S2A10G2'], ['坂の槍組', 'Slope spearmen', 'S2A8', 0.5]]],
    ['福島正則', '水の手の門が空いておる。討って出るぞ', 'The water-gate is open. They are sallying out.', '水の手の門', 'Water gate', '水の手から討って出た城兵', 'Defenders sallying out of the water gate', '水の手の門から出た城兵を押し返せ', 'Push back the defenders who came out of the water gate', '城兵', '水の手を守れ。水を断たれれば終わりじゃ！', 'Hold the water gate. If the water is cut, we are finished!', [['水の手の城兵', 'Water-gate defenders', 'S2A10', -0.5]]],
    ['池田照政', '二の丸の門が見えた。ここを破れば天守じゃ', 'The Ninomaru gate is in sight. Break it and the keep is ours.', '二の丸の門', 'Ninomaru gate', '本丸への退き口を塞ぐ城兵', 'Defenders blocking the way back to the main keep', '二の丸の門で退き口を塞ぐ城兵を討て', 'Cut down the defenders blocking the Ninomaru gate', '城兵', '門を閉ざせ。殿様が本丸にお入りになるまで！', 'Bar the gate until our lord is inside the keep!', [['二の丸の門兵', 'Ninomaru gate guards', 'S3A10G3', 0], ['門脇の槍組', 'Gate-side spearmen', 'S2A8', 0.6]]],
  ]),
  k04_kuisegawa: rows([
    ['井伊直政', '川の向こうから宇喜多の殿がまた出て来た。浅瀬で受けよ', 'The Ukita rearguard is out across the river again. Meet them in the shallows.', '浅瀬の殿', 'Shallows rearguard', '杭瀬川の浅瀬で追う者を止める殿', 'A rearguard checking pursuers in the Kuise shallows', '杭瀬川の浅瀬で追手を止める殿を討て', 'Cut down the rearguard in the Kuise shallows', '殿の侍', '浅瀬で止めよ。本陣まで追わせるな！', "Stop them in the shallows. Don't let them reach the camp!", [['浅瀬の殿', 'Shallows rearguard', 'S2A9G2'], ['浅瀬の鉄砲', 'Shallows gunners', 'S1A3G5', 0.5]]],
  ]),
  k05_ueda: rows([
    ['榊原康政', '神川の際の草むらが揺れる。真田の伏せじゃ', 'The grass by the Kami river is moving. A Sanada ambush.', '神川の伏兵', 'Kami river ambush', '神川の草むらに伏せた真田の手', 'Sanada men hidden in the reeds by the Kami river', '神川の草むらに伏せた真田勢を払え', 'Clear the Sanada troops hiding in the reeds', '真田の侍', '川を渡らせてから挟め。まだ撃つな！', "Let them cross, then pinch them. Don't fire yet!", [['川際の伏兵', 'Riverbank ambushers', 'S2A8G4', 0.4], ['草むらの槍組', 'Reed spearmen', 'S2A8', -0.5]]],
  ]),
  k08_osaka_kizu: rows([
    ['蜂須賀至鎮', '堤の櫓から砲が来る。まず櫓の下を取れ', 'Cannon fire from the embankment tower. Take the foot of it first.', '堤の櫓', 'Embankment tower', '川の岸の櫓に籠もる豊臣の守兵', 'Toyotomi defenders in the tower on the bank', '岸の櫓に籠もる守兵を追い落とせ', 'Drive the defenders out of the bank tower', '守兵', '櫓を渡すな。上から撃ち下ろせ！', 'Do not give up the tower. Fire down from above!', [['櫓の守兵', 'Tower defenders', 'S1A4G7'], ['櫓の槍組', 'Tower spearmen', 'S2A8', 0.5]]],
    // 11/28 10:55 UTC クラウド 木津川口（徳川編）の持ち主（K582）：蔵の脇の鉄砲（向き0.5・hunt 無し）が離れて撃ち続け、26秒で六割崩せず〔失〕2/3（1043 の act bot 3本）→ 脇の鉄砲も本人へ向ける（数・強さは同じ）
    ['浅野長晟', '砦の内に火薬の蔵がある。人を出して守っておる', 'There is a powder store in the fort. They are guarding it.', '火薬の蔵', 'Powder store', '蔵を守る砦の兵', 'Fort troops guarding the store', '火薬の蔵を守る砦の兵を討て', 'Cut down the fort troops guarding the powder store', '砦の侍', '蔵だけは守れ。燃えれば砦も終わりじゃ！', 'Guard the store at all costs. If it burns, the fort is done!', [['蔵の守り', 'Store guards', 'S1A6', 0, 'hunt'], ['蔵の脇の鉄砲', 'Gunners beside the store', 'S1A4G2', 0.5, 'hunt']]],
    ['蜂須賀至鎮', '川口の船が戻って来る。岸で受けよ', 'Boats are coming back to the river mouth. Meet them on the bank.', '川口の船手', 'River-mouth boatmen', '船で戻って岸へ上がる豊臣の兵', 'Toyotomi troops landing from boats', '岸へ上がる豊臣の船手を水際で討て', 'Cut down the landing boat troops at the water line', '船手の侍', '岸へ上げよ。砦を取り返す！', 'Land them. We take the fort back!', [['船手の槍組', 'Boat-borne spearmen', 'S2A10', -0.4], ['船手の鉄砲', 'Boat gunners', 'S1A3G5', 0.5]]],
  ]),
  k13_domyoji: rows([
    ['水野勝成', '小松山の下の道に、薄田の兵が残っておる', "Susukida's men remain on the road below Komatsuyama.", '小松山の裾', 'Foot of Komatsuyama', '山の下の道を塞ぐ豊臣の槍', 'Toyotomi spears blocking the road below the hill', '小松山の裾の道を塞ぐ槍組を討て', 'Cut down the spearmen blocking the road at the foot of the hill', '豊臣の侍', '山の上の者を孤立させるな。道を開けておけ！', "Don't let the men on the hill be cut off. Keep the road open!", [['裾の槍組', 'Foothill spearmen', 'S2A10', 0.3]]],
    ['伊達政宗', '後藤の組の鉄砲がまだ残っておる。竹の陰じゃ', "Some of Goto's gunners remain, behind the bamboo.", '竹の陰の鉄砲', 'Gunners in the bamboo', '竹林から撃つ後藤の鉄砲組', "Goto's gunners firing from a bamboo thicket", '竹林から撃つ鉄砲組を討て', 'Cut down the gunners firing from the bamboo', '後藤の足軽', '竹の陰から狙え。又兵衛様の仇を！', 'Aim from the bamboo. For Lord Matabei!', [['竹林の鉄砲組', 'Bamboo gunners', 'S1A4G8', -0.4], ['竹林の槍組', 'Bamboo spearmen', 'S2A8', 0.5]]],
    ['本多忠政', '薄田の旗本が討ち死にを覚悟で向かって来る', "Susukida's guards are charging, resolved to die.", '薄田の旗本', "Susukida's guards", '討ち死にを覚悟で返す薄田隼人の旗本', 'Guards of Susukida Hayato turning back to die fighting', '薄田隼人の旗本の返しを受け止めよ', 'Hold against the turning charge of Susukida Hayato\'s guards', '薄田の侍', '主の前で死ぬ。者ども続け！', 'We die before our lord. Follow me!', [['薄田の旗本', "Susukida's guards", 'S3A10', 0], ['薄田の手槍', "Susukida's spears", 'S2A8', 0.6]]],
    ['水野勝成', '日が傾く。道明寺の村へ退く者を追え', 'The sun is sinking. Chase those withdrawing to Domyoji village.', '道明寺の村口', 'Domyoji village gate', '村へ退く豊臣の殿', 'Toyotomi rearguard falling back into the village', '道明寺の村口で豊臣の殿を討て', 'Cut down the Toyotomi rearguard at the village entrance', '豊臣の殿', '村へ入れ。小松山の仇は明日じゃ！', 'Into the village. Revenge for Komatsuyama is tomorrow!', [['村口の殿', 'Village rearguard', 'S2A10G2', 0.2]]],
  ]),
  k14_yao_wakae: rows([
    ['藤堂高虎', '堤の上に長宗我部の兵が残っておる', "Chosokabe men remain on the embankment.", '八尾の堤', 'Yao embankment', '堤から鉄砲を撃つ長宗我部勢', 'Chosokabe troops firing from the embankment', '堤から撃つ長宗我部の組を追い落とせ', 'Drive the Chosokabe squads off the embankment', '長宗我部の侍', '堤を取らせるな。土佐者の意地を見せよ！', "Don't let them take the bank. Show Tosa pride!", [['堤の鉄砲組', 'Embankment gunners', 'S1A4G7'], ['堤の槍組', 'Embankment spearmen', 'S2A10', 0.5]]],
    // 11/28 クラウド八尾の持ち主（K658・本物らしさ）：木村重成の討死の後に「重成様に続け」「木村の旗本の最後の突き」が来ていた（死んだ将の手が討って出る＝史実と逆）→
    //   『大坂御陣覚書』『難波戦記』の討死の後の出来事に替えた＝木村主計宗明が若江の残兵をまとめて大坂へ退く殿／八尾で長宗我部の陣にいた増田盛次（長盛の子）が退かずに斬り込み、藤堂勢に討たれた
    ['井伊直孝', '木村主計が残る兵をまとめて大坂へ退くぞ。殿を崩せ', 'Kimura Muneaki is gathering the survivors and falling back to Osaka. Break his rearguard.', '木村主計の退き口', "Kimura Muneaki's withdrawal", '重成の討死の後、残兵をまとめて退く木村宗明の殿', "Kimura Muneaki's rearguard covering the survivors after Shigenari's death", '大坂へ退く木村主計の殿を押し崩せ', "Break Kimura Muneaki's rearguard as it falls back to Osaka", '木村の侍', '長門守様の兵を一人でも多く城へ帰せ！', "Get as many of our lord's men back to the castle as we can!", [['木村主計の殿', "Muneaki's rearguard", 'S2A12', 0], ['殿の鉄砲', 'Rearguard gunners', 'S1A3G5', -0.5]]],
    ['藤堂高虎', '長宗我部の陣にいた増田盛次が、退かずに斬り込んで来る。腰を据えよ', 'Masuda Moritsugu, with the Chosokabe, is charging in instead of retreating. Stand firm.', '増田盛次の斬り込み', "Masuda Moritsugu's charge", '父の長盛と分かれて大坂に入り、八尾で退かずに返す増田盛次の組', 'Masuda Moritsugu, who broke with his father to join Osaka, turning back at Yao', '退かずに斬り込む増田盛次の組を受け止めよ', "Hold against Masuda Moritsugu's charge", '増田の侍', '退くは恥。ここで討ち死にじゃ！', 'Retreat is shame. We die here!', [['増田盛次の組', "Masuda's band", 'S3A10', 0], ['増田の鉄砲', "Masuda's gunners", 'S1A3G4', 0.6]]],
  ]),
  // 佐和山（1600/9/18）：本丸の自害の後、搦手と湖の口へ逃れる者・残る侍屋敷の兵を追う（ほかの係の手本 k04 と同じ型）
  k07_sawayama: rows([
    ['小早川の侍', '天守が燃えるぞ。搦手の道へ逃れる者がおる', 'The keep is burning. Some are slipping out by the rear path.', '搦手の道', 'Rear path', '搦手から山を下りて逃れる石田の兵', 'Ishida troops fleeing down the mountain by the rear path', '搦手から逃れる石田の兵を止めよ', 'Stop the Ishida troops fleeing by the rear path', '石田の侍', '殿に続け、搦手から落ちよ！', 'Follow our lord, out by the rear path!', [['搦手の落ち手', 'Rear-path fugitives', 'S2A10', 0, 'hunt']]],
    ['田中吉政', '山の麓の侍屋敷に、まだ兵が籠もっておる', 'Men are still holed up in the samurai houses at the foot of the hill.', '麓の侍屋敷', 'Samurai houses at the foot', '屋敷の塀の内から撃つ城下の兵', 'Troops firing from inside the house walls', '麓の侍屋敷に籠もる兵を討ち払え', 'Clear out the troops holed up in the foot-hill houses', '城下の侍', '屋敷を枕に討ち死にじゃ！', 'We die in these houses!', [['屋敷の籠もり', 'House garrison', 'S1A6G5', 0.6, 'hunt']]],
    ['脇坂安治', '佐和山の下の街道に、長浜へ退く殿がおる', 'A rearguard is withdrawing toward Nagahama on the road below Sawayama.', '長浜への街道', 'Nagahama road', '街道を退く石田の殿', 'Ishida rearguard falling back along the road', '長浜へ退く石田の殿を追い払え', 'Drive off the Ishida rearguard retreating to Nagahama', '石田の侍', '後ろを守れ。殿が逃げ延びるまで！', 'Cover the rear until our lord is clear!', [['街道の殿', 'Road rearguard', 'S2A10G3', -0.5, 'hunt']]],
    ['小早川の侍', '湖の口に舟が着いておる。乗せるな', 'Boats are at the lakeside. Do not let them embark.', '湖の舟入り', 'Lakeside boat landing', '舟で湖を渡ろうとする残兵', 'Remnants trying to cross the lake by boat', '舟に乗ろうとする残兵を湖の岸で止めよ', 'Stop the remnants trying to board boats on the shore', '石田の侍', '舟を出せ、琵琶湖を渡れ！', 'Push off the boats, cross the lake!', [['湖岸の残兵', 'Lakeshore remnants', 'S2A8G2', 0.9, 'hunt']]],
    ['田中吉政', '佐和山の鬨の声が止んだ。最後の手が来る', 'The cries at Sawayama have stopped. A last band is coming.', '城下の最後の手', 'The last band', '城下から討って出る最後の兵', 'The last troops sallying from the castle town', '城下から討って出た最後の手を討て', 'Cut down the last band that sallied out of the town', '石田の侍', '一矢報いずに果てられるか！', 'We will not die without one more blow!', [['最後の手', 'Last band', 'S3A10G4', 0, 'hunt']]],
  ], { faction: 'ishida', flag: 'ishida', limit: 42, noRefill: true }),   // 11/26 佐和山は元の段が長く（811秒）、続きの段は一つ42秒まで（act bot の1080秒に収める）
  //   11/28 09:55 UTC クラウド佐和山の持ち主（K582 act bot --mobile 足跡）：続きの五段で敵が新手の湧きのまま本人から二十五〜七十m 先で逃げ、五段で本人の討ち取り1・二百四十秒（全886〜913秒）
  //   → 樫井・今福と同じく湧きを止め（noRefill）、寄せる組を本人へ向ける（hunt）
  // 樫井（1615/4/29）：塙・淡輪を討った後、大野治房の本隊は貝塚から退いた。残る手（先手の落ち武者・樫井の村の鉄砲・浜の道の殿）を、敵を軽く・段ごとに休みを入れて払う
  // 11/26 クラウドさ：樫井は自分で depthTick を呼ばない（真田丸の写しの ownTick が付いて続きの段が進まず、act bot が千八十秒で時切れ）＝ownTick を外した
  k12_kashii: rows([
    ['浅野の侍', '塙は討たれた。だが八丁畷の脇の田に、散った先手がまだおる', 'Hanawa is dead. But scattered vanguard men remain in the paddies beside Hachichonawate.', '田に散った先手', 'Scattered vanguard', '八丁畷の脇の田に散った塙の兵', "Hanawa's men scattered in the paddies by the road", '田に散った塙の先手を払え', "Clear Hanawa's scattered vanguard from the paddies", '塙の足軽', 'まだ終わらぬ。田の畦から突け！', 'It is not over. Strike from the paddy banks!', [['田の先手', 'Paddy vanguard', 'S2A8'], ['畦の槍組', 'Paddy-bank spearmen', 'A6', 0.5]]],
    ['上田宗箇', '村の家の陰から鉄砲じゃ。伏せて詰めよ', 'Guns from behind the village houses. Keep low and close in.', '村の家の鉄砲', 'Village-house guns', '樫井の家の陰から撃つ豊臣の鉄砲', 'Toyotomi guns firing from behind Kashii houses', '家の陰から撃つ豊臣の鉄砲を払え', 'Drive off the Toyotomi guns behind the houses', '豊臣の鉄砲頭', '近づけるな、撃て！', 'Keep them off. Fire!', [['家の陰の鉄砲', 'Guns behind the houses', 'A4G5'], ['家の陰の槍組', 'Spearmen behind the houses', 'S1A6', -0.5]]],
    ['浅野長晟', '浜へ抜ける道に、淡輪の手の殿が残っておる', "Awa's rearguard remains on the road to the shore.", '浜の道の殿', 'Shore-road rearguard', '浜の道を退く淡輪の手の殿', "Awa's rearguard withdrawing along the shore road", '浜の道を退く淡輪の殿を追え', "Chase Awa's rearguard on the shore road", '淡輪の兵', '殿は我らが務める。通すな！', 'We hold the rear. Let none pass!', [['浜の殿', 'Shore rearguard', 'S1A5', -0.5], ['浜の道の槍組', 'Shore-road spearmen', 'S1A5', 0.5]]],
    ['上田宗箇', '貝塚の方で土煙じゃ。治房の物見が来ておる', "Dust toward Kaizuka. Haruhusa's scouts have come.", '貝塚の物見', 'Kaizuka scouts', '貝塚から様子を見に来た大野の物見', "Ono scouts come from Kaizuka to look", '貝塚から来た大野の物見を追い返せ', 'Turn back the Ono scouts from Kaizuka', '大野の物見', '塙が討たれたと。退け、退け！', 'Hanawa is dead. Fall back!', [['大野の物見', 'Ono scouts', 'C3A6']]],
    ['浅野長晟', '日が高い。樫井の村を固めて、紀州の道を開けよ', 'The sun is high. Secure Kashii village and open the Kii road.', '村の北の残党', 'Northern stragglers', '村の北の口に残った豊臣の兵', 'Toyotomi men left at the north gate', '村の北の口に残った兵を払え', 'Clear the men left at the north gate', '豊臣の足軽', 'ここを抜かれては国へ帰れぬ！', 'If we lose this we cannot get home!', [['北口の残党', 'North gate stragglers', 'S2A8'], ['北口の鉄砲', 'North gate gunners', 'A2G4', 0.5]]],
  ], { faction: 'toyotomi', flag: 'toyotomi', dmg: 0.1, limit: 75, noRefill: true }),   // 11/28 K582：続きの五段が一つ百秒の刻限まで続き全894秒（act bot）→ 一つ18秒まで（4〜7分に収める）
  //   11/28 05時 K652（十分ほど）：18秒では倒しきれず三段が〔失〕。百秒まで延びた元は b_depth の新手の湧き（一段で四十人倒すまで足す）→ 湧きを止め（noRefill）、寄せる組を少し厚くし、刻限75秒（60秒では act bot 四本に一本、浜の殿で〔失〕）。浜の殿は一つの組が75秒でも崩れきらない回があり、左右二つの組に分けた
  // 真田丸（1614/12/4〜）：竹束の陣へ戻った後の冬の陣の続き。①城の内の火薬の爆ぜ（石川康勝の陣）を内応と見た井伊・越前の衆が八丁目口へ寄せ、
  //   打って出た真田の槍に追われる ②力攻めを止めて仕寄せ（竹束と塹壕）を掘る人足を、丸から出た鉄砲から守る ③城方の夜討ち（12/16 本町橋の塙団右衛門）。
  //   win は毎コマ位置の条件で呼ばれるので、条件の後の締め（winEnd）に足す。丸の内の兵（ほめられた塀の撃ち手）は退かせない（onStart）。
  //   敵は丸から遠い東・西の野から寄せる（丸の内の兵の足元から出すと塀の内に閉じこもる）。前田編（b_osaka.js の写し）には足さない
  k11_sanadamaru: rows([
    ['山崎長徳', '城の内で火薬が爆ぜた！　井伊と越前の衆が内応の合図と見て、八丁目口へ押し寄せたぞ', 'Powder exploded inside the castle! The Ii and Echizen men took it for a signal of betrayal and rushed the Hatchome gate.', '八丁目口の退き', 'Hatchome gate retreat', '退く井伊・越前の衆を追って出た真田の槍', 'Sanada spearmen chasing the retreating Ii and Echizen troops', '東から退く味方を追う真田の槍を払え', 'Beat back the Sanada spears chasing our men from the east', '真田の侍', '退く者を追え。一人も帰すな！', 'Chase them down. Let none get away!', [['追い討ちの槍組', 'Pursuing spearmen', 'S2A10', 0], ['追い討ちの鉄砲', 'Pursuing gunners', 'S1A3G4', 0.4]]],
    ['使番', '大御所様の下知：力攻めは止めよ。竹束を並べ、仕寄せを掘って寄せる。人足を守れ', 'Orders from the retired shogun: no more frontal assaults. Line up bamboo shields and dig siege trenches. Guard the laborers.', '仕寄せの人足', 'Trench diggers', '仕寄せを掘る人足を狙って丸から出た鉄砲組', 'Gunners sent out from the fort to pick off the trench diggers', '仕寄せを掘る人足を狙う鉄砲組を討て', 'Cut down the gunners shooting at the trench diggers', '真田の足軽', '掘らせるな。竹束の陰の人足を撃て！', "Don't let them dig. Shoot the laborers behind the shields!", [['人足狙いの鉄砲組', 'Gunners hunting diggers', 'S1A4G7', 0], ['鉄砲組の槍', 'Gunners\' spearmen', 'S2A6', -0.5]]],
    ['山崎長徳', '本町橋で塙団右衛門が蜂須賀の陣へ夜討ちをかけたと。こちらの陣にも来るぞ。篝火を絶やすな', "Ban Dan'emon has raided the Hachisuka camp at Honmachi bridge by night. They will come for us too. Keep the fires lit.", '城方の夜討ち', 'Night raid', '竹束の陣に火をかけに来た城方の組', 'Castle troops coming to set our camp on fire', '竹束の陣へ夜討ちに来た城方の組を討て', 'Cut down the castle troops raiding our camp by night', '城方の侍', '夜討ちじゃ。陣に火をかけよ！', 'A night raid! Set their camp ablaze!', [['夜討ちの組', 'Night raiders', 'S3A10', 0], ['夜討ちの火付け', 'Fire raiders', 'S1A6', 0.5]]],
  ], { faction: 'toyotomi', flag: 'toyotomi', ownTick: true, dmg: 0.18, key: 'winEnd', limit: 55, noRefill: true,
    // 11/28 06時 K582：続きの三段が新手の湧きで一つ百秒の刻限まで続き全804秒（act bot --mobile）→ 樫井と同じく湧きを止め刻限75秒
    // 11/28 07:50 UTC 真田丸の一時間の持ち主：湧き止めの後も act bot --mobile 626秒（続きの三段で150秒・二段目が64秒）→ 刻限 七十五→五十五秒
    only: (rt) => rt.def?.key === 'k11_sanadamaru',
    // 竹束の陣に着いた＝⑦は済み（右上の⑦に印）。段を 8 にして、⑦の退きの仕組み（追いの槍・柵から遠くの組を丸へ引く）を止める
    onStart: (rt) => { const F = rt.flags; F.step = 8; F.returned = true; },
    // 東（八丁目口）→ 北西（丸の西の口）→ 西（本町橋）の野から。丸の柵の外 20 より内へは出さない
    dirs: [Math.PI / 2, -Math.PI * 0.75, -Math.PI / 2],
    fromAt: (rt, P, d) => { const x = P.x + Math.sin(d) * 44, z = Math.max(P.z + Math.cos(d) * 44, 40); return { x, z }; } }),
  // K674（11/26 クラウドす）：天王寺・岡山を10任務に。毛利の殿を破った後・茶臼山の旗の前に二段（勝永が城へ退く道で、四天王寺へ逃げ込んだ者と惣構えの口の殿）。
  //   史実：信繁の討死の後、天王寺口の豊臣方は総崩れで城へ退き、越前の松平忠直勢が一番に城へ乗り込んだ。物見の段（11/13 kaito「やめる」）は戻さない
  k15_tennoji_okayama: rows([
    ['使番', '毛利の殿は崩れた。四天王寺の境内へ、豊臣の兵が逃げ込んだぞ', "Mori's rearguard has broken. Toyotomi men have fled into the Shitennoji grounds.", '四天王寺の境内', 'Shitennoji grounds', '石の鳥居の陰で返す豊臣の兵', 'Toyotomi men turning to fight by the stone torii', '四天王寺の石の鳥居で、逃げ込んだ豊臣の兵を討て', 'Cut down the Toyotomi men who fled to the stone torii of Shitennoji', '豊臣の侍', '寺を背に、ここで死ぬぞ！', 'Backs to the temple. We die here!', [['鳥居の豊臣の兵', 'Torii holdouts', 'S2A8', Math.PI], ['境内の鉄砲', 'Temple-ground gunners', 'S1A2G4', 2.6]]],
    ['松平忠直', '越前の者ども、城へ一番に乗り込むぞ。遅れるな', "Men of Echizen, we will be first into the castle. Don't fall behind!", '惣構えの口', 'Outer-wall gate', '城の惣構えへ退く豊臣の殿', 'Toyotomi rearguard falling back to the outer walls', '惣構えの口で、城へ退く豊臣の殿を討て', 'Cut down the Toyotomi rearguard at the outer-wall gate', '豊臣の侍', '門を閉めるまで、ここを通すな！', 'Hold them until the gate is shut!', [['惣構えの殿', 'Outer-wall rearguard', 'S2A9', Math.PI], ['惣構えの鉄砲', 'Outer-wall gunners', 'S1A2G3', -2.6]]],
  ], { faction: 'toyotomi', flag: 'toyotomi', dmg: 0.18, key: 'stage7',
    only: (rt) => rt.def?.key === 'k15_tennoji_okayama',
    // 殿の段（6）の確かめ（tick6s）が毎コマ stage7 を呼ぶので、段を 6.5 にして止める。続きの段が尽きたら元の stage7（茶臼山の旗）へ
    onStart: (rt) => { const F = rt.flags; F.step = 6.5; rt.unmark?.('k15'); } }),
};
