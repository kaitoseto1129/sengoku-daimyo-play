// K674（11/26 Sanae）：徳川編の続きの段をさらに足し、一戦10任務にそろえる。tokugawa_more.js の MORE の終わりで rows と en に足される。
//   一行 = [休む人, 休む台詞, 休むEN, 段の名, 名EN, 副題, 副題EN, 任務, 任務EN, 台詞の人, 敵の台詞, 台詞EN, 敵[[名, 名EN, 'S2A10G3', 向き]]]
const T = { S: 'samurai', A: 'ashigaru', G: 'gun', B: 'bow', C: 'cavalry' };
const parse = (s) => [...s.matchAll(/([SAGBC])(\d+)/g)].map((m) => ({ type: T[m[1]], n: +m[2] }));
function rows(tbl, o = {}) {
  const out = { ...o, rows: [], en: [] };
  for (const r of tbl) {
    const [rs, rl, rle, t, te, s, se, o, oe, sn, sl, sle, foes] = r;
    out.rows.push({ rest: [[rs, rl]] });
    out.rows.push({ fight: { title: t, sub: s, obj: o, say: [[sn, sl]], foes: foes.map((f) => ({ name: f[0], list: parse(f[2]), ...(f[3] ? { dir: f[3] } : {}) })) } });
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
    ['島左近', '川の向こうから石田の殿が出て来た。浅瀬で受けよ', 'Their rearguard comes out across the river. Meet them in the shallows.', '浅瀬の殿', 'Shallows rearguard', '杭瀬川の浅瀬で追う者を止める殿', 'A rearguard checking pursuers in the Kuise shallows', '杭瀬川の浅瀬で追手を止める殿を討て', 'Cut down the rearguard in the Kuise shallows', '殿の侍', '浅瀬で止めよ。本陣まで追わせるな！', "Stop them in the shallows. Don't let them reach the camp!", [['浅瀬の殿', 'Shallows rearguard', 'S2A9G2'], ['浅瀬の鉄砲', 'Shallows gunners', 'S1A3G5', 0.5]]],
  ]),
  k05_ueda: rows([
    ['榊原康政', '神川の際の草むらが揺れる。真田の伏せじゃ', 'The grass by the Kami river is moving. A Sanada ambush.', '神川の伏兵', 'Kami river ambush', '神川の草むらに伏せた真田の手', 'Sanada men hidden in the reeds by the Kami river', '神川の草むらに伏せた真田勢を払え', 'Clear the Sanada troops hiding in the reeds', '真田の侍', '川を渡らせてから挟め。まだ撃つな！', "Let them cross, then pinch them. Don't fire yet!", [['川際の伏兵', 'Riverbank ambushers', 'S2A8G4', 0.4], ['草むらの槍組', 'Reed spearmen', 'S2A8', -0.5]]],
  ]),
  k08_osaka_kizu: rows([
    ['蜂須賀至鎮', '堤の櫓から砲が来る。まず櫓の下を取れ', 'Cannon fire from the embankment tower. Take the foot of it first.', '堤の櫓', 'Embankment tower', '川の岸の櫓に籠もる豊臣の守兵', 'Toyotomi defenders in the tower on the bank', '岸の櫓に籠もる守兵を追い落とせ', 'Drive the defenders out of the bank tower', '守兵', '櫓を渡すな。上から撃ち下ろせ！', 'Do not give up the tower. Fire down from above!', [['櫓の守兵', 'Tower defenders', 'S1A4G7'], ['櫓の槍組', 'Tower spearmen', 'S2A8', 0.5]]],
    ['浅野長晟', '砦の内に火薬の蔵がある。人を出して守っておる', 'There is a powder store in the fort. They are guarding it.', '火薬の蔵', 'Powder store', '蔵を守る砦の兵', 'Fort troops guarding the store', '火薬の蔵を守る砦の兵を討て', 'Cut down the fort troops guarding the powder store', '砦の侍', '蔵だけは守れ。燃えれば砦も終わりじゃ！', 'Guard the store at all costs. If it burns, the fort is done!', [['蔵の守り', 'Store guards', 'S2A10G2', 0]]],
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
    ['井伊直孝', '若江の村から木村の兵が出て来る', 'Kimura troops are coming out of Wakae village.', '若江の村口', 'Wakae village gate', '村口から討って出る木村重成の手', "Kimura Shigenari's men sallying from the village", '若江の村口から出る木村の手を押し返せ', 'Push back the Kimura troops sallying from Wakae', '木村の侍', '重成様に続け。徳川の先手を崩せ！', 'Follow Lord Shigenari. Break the Tokugawa vanguard!', [['木村の手', "Kimura's men", 'S2A12', 0], ['木村の鉄砲', "Kimura's gunners", 'S1A3G5', -0.5]]],
    ['藤堂高虎', '木村の旗本が最後の突きに来る。腰を据えよ', "Kimura's guards come for a last thrust. Stand firm.", '木村の旗本', "Kimura's guards", '最後まで退かぬ木村重成の旗本', "Kimura Shigenari's guards, unyielding to the last", '木村重成の旗本の最後の突きを受け止めよ', "Hold against the last thrust of Kimura Shigenari's guards", '木村の旗本', '大将の前を空けるな。ここで死ぬ！', 'Do not leave our commander exposed. We die here!', [['木村の旗本', "Kimura's guards", 'S3A10', 0], ['旗本の鉄砲', 'Guard gunners', 'S1A3G4', 0.6]]],
  ]),
  // 佐和山（1600/9/18）：本丸の自害の後、搦手と湖の口へ逃れる者・残る侍屋敷の兵を追う（ほかの係の手本 k04 と同じ型）
  k07_sawayama: rows([
    ['小早川の侍', '天守が燃えるぞ。搦手の道へ逃れる者がおる', 'The keep is burning. Some are slipping out by the rear path.', '搦手の道', 'Rear path', '搦手から山を下りて逃れる石田の兵', 'Ishida troops fleeing down the mountain by the rear path', '搦手から逃れる石田の兵を止めよ', 'Stop the Ishida troops fleeing by the rear path', '石田の侍', '殿に続け、搦手から落ちよ！', 'Follow our lord, out by the rear path!', [['搦手の落ち手', 'Rear-path fugitives', 'S2A10']]],
    ['田中吉政', '山の麓の侍屋敷に、まだ兵が籠もっておる', 'Men are still holed up in the samurai houses at the foot of the hill.', '麓の侍屋敷', 'Samurai houses at the foot', '屋敷の塀の内から撃つ城下の兵', 'Troops firing from inside the house walls', '麓の侍屋敷に籠もる兵を討ち払え', 'Clear out the troops holed up in the foot-hill houses', '城下の侍', '屋敷を枕に討ち死にじゃ！', 'We die in these houses!', [['屋敷の籠もり', 'House garrison', 'S1A6G5', 0.6]]],
    ['脇坂安治', '佐和山の下の街道に、長浜へ退く殿がおる', 'A rearguard is withdrawing toward Nagahama on the road below Sawayama.', '長浜への街道', 'Nagahama road', '街道を退く石田の殿', 'Ishida rearguard falling back along the road', '長浜へ退く石田の殿を追い払え', 'Drive off the Ishida rearguard retreating to Nagahama', '石田の侍', '後ろを守れ。殿が逃げ延びるまで！', 'Cover the rear until our lord is clear!', [['街道の殿', 'Road rearguard', 'S2A10G3', -0.5]]],
    ['小早川の侍', '湖の口に舟が着いておる。乗せるな', 'Boats are at the lakeside. Do not let them embark.', '湖の舟入り', 'Lakeside boat landing', '舟で湖を渡ろうとする残兵', 'Remnants trying to cross the lake by boat', '舟に乗ろうとする残兵を湖の岸で止めよ', 'Stop the remnants trying to board boats on the shore', '石田の侍', '舟を出せ、琵琶湖を渡れ！', 'Push off the boats, cross the lake!', [['湖岸の残兵', 'Lakeshore remnants', 'S2A8G2', 0.9]]],
    ['田中吉政', '佐和山の鬨の声が止んだ。最後の手が来る', 'The cries at Sawayama have stopped. A last band is coming.', '城下の最後の手', 'The last band', '城下から討って出る最後の兵', 'The last troops sallying from the castle town', '城下から討って出た最後の手を討て', 'Cut down the last band that sallied out of the town', '石田の侍', '一矢報いずに果てられるか！', 'We will not die without one more blow!', [['最後の手', 'Last band', 'S3A10G4']]],
  ], { faction: 'ishida', flag: 'ishida' }),
};
