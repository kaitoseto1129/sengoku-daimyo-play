// K674（11/26 Sanae・一戦10任務）：豊臣家編の戦に、勝った後の史実の続きの段を足す。tokugawa_more.js の moreSteps をそのまま使う。
//   一行 = [休む人, 休む台詞, 休むEN, 段の名, 名EN, 任務, 任務EN, 台詞の人, 敵の台詞, 台詞EN, 敵の組名, 組名EN, 'S2A10G3', 向き]
//   字とボタンは足さない（任務の一行と台詞だけ）。
import { moreSteps, MORE as M0 } from './tokugawa_more.js';
import { cpDone } from './checkpoint_chain.js';
const T = { S: 'samurai', A: 'ashigaru', G: 'gun', B: 'bow', C: 'cavalry' };
const parse = (s) => [...s.matchAll(/([SAGBC])(\d+)/g)].map((m) => ({ type: T[m[1]], n: +m[2] }));
function mk(faction, flag, tbl) {
  const out = { faction, flag, rows: [], en: [] };
  for (const [rs, rl, rle, t, te, o, oe, sn, sl, sle, fn, fne, comp, dir] of tbl) {
    out.rows.push({ rest: [[rs, rl]] });
    out.rows.push({ fight: { title: t, sub: '', obj: o, say: [[sn, sl]], foes: [{ name: fn, list: parse(comp), ...(dir ? { dir } : {}) }] } });
    out.en.push([rl, rle], [t, te], [o, oe], [sl, sle], [fn, fne]);
  }
  return out;
}
export const MORE = {
  t01_yamazaki: mk('akechi', 'akechi', [
    ['羽柴秀長', '天王山の腹に、まだ明智の手が取り付いておる', 'Akechi men are still clinging to the Tennozan slope.', '天王山の腹', 'Tennozan slope', '天王山の腹に取り付いた明智の組を追い落とせ', 'Drive the Akechi squad clinging to the Tennozan slope off the hill', '明智の侍', '山を取れば逆転じゃ。登れ！', 'Take the mountain and we turn the tide. Climb!', '山腹の明智勢', 'Akechi on the slope', 'S2A10', -0.5],
    ['黒田官兵衛', '淀川の堤を、落ちる者が行く。鉄砲を持っておるぞ', 'Fugitives are going along the Yodo embankment, and they carry guns.', '淀川の堤', 'Yodo embankment', '淀川の堤を落ちて行く明智の鉄砲組を討て', 'Cut down the Akechi gunners fleeing along the Yodo embankment', '明智の侍', '堤の上で振り返れ。撃て！', 'Turn on the embankment. Fire!', '堤の鉄砲組', 'Embankment gunners', 'S1A3G6', 0.4],
    ['丹羽長秀', '光秀は小栗栖へ向かう。竹藪の道に殿が残っておる', 'Mitsuhide is heading for Oguruse. A rearguard remains on the bamboo road.', '小栗栖の竹藪', 'Oguruse bamboo grove', '竹藪の道に残る明智の殿を討て', 'Cut down the Akechi rearguard on the bamboo road', '明智の侍', '殿をお逃がしせよ。ここは通さぬ！', 'Get our lord away. You shall not pass here!', '竹藪の殿', 'Bamboo rearguard', 'S2A9', 0.3],
  ]),
  t03_komaki: mk('tokugawa', 'tokugawa', [
    // 11/28 クラウド 小牧の持ち主（流れの崩れ）：この続きの段は⑧ 岩崎城の夜明けの道で出る。楽田・二重堀（二十km 余り北西）の名と台詞が場に合わなかった→岩崎の道の場に合わせる
    ['池田恒興の郎党', '岩崎城の搦手から、城兵が落ちて行く', 'Defenders are slipping out of the rear gate of Iwasaki Castle.', '岩崎城の搦手', 'Rear gate of Iwasaki Castle', '搦手から落ちる岩崎の城兵を討て', 'Cut down the Iwasaki defenders slipping out of the rear gate', '丹羽の侍', '三河へ知らせよ。道を抜けい！', 'Warn Mikawa. Break through the road!', '岩崎の城兵', 'Iwasaki defenders', 'S1A8', -0.4],
    ['森長可', '列の後ろに、徳川の鉄砲が付いて来る', 'Tokugawa gunners are trailing the rear of our column.', '列の後ろの道', 'Road behind the column', '列の後ろに付く徳川の鉄砲組を追い払え', 'Drive off the Tokugawa gunners trailing our column', '徳川の侍', '列の尻を撃て。近づくな、遠くから！', 'Shoot the tail of the column. Keep your distance!', '後を追う鉄砲組', 'Trailing gunners', 'S1A3G6', 0.5],
    ['堀秀政', '道の脇の竹藪が怪しい。伏せておるぞ', 'The bamboo beside the road looks wrong. They are lying in wait.', '道の脇の竹藪', 'Bamboo beside the road', '竹藪に伏せた徳川の組を払え', 'Clear the Tokugawa squad hidden in the bamboo', '徳川の侍', '通り過ぎたら背を衝け！', 'Strike their backs as they pass!', '竹藪の伏兵', 'Bamboo ambushers', 'S2A9', -0.7],
  ]),
  t03b_nagakute: mk('tokugawa', 'tokugawa', [
    ['池田勝入の郎党', '榊原の手が、まだ白山林の外れにおる', "Sakakibara's men are still on the edge of Shirayama grove.", '白山林の外れ', 'Edge of Shirayama grove', '白山林の外れに残る榊原の手を討て', 'Cut down the Sakakibara men remaining on the edge of Shirayama grove', '徳川の侍', '林に引きつけて討て！', 'Lure them into the grove and strike!', '榊原の手', 'Sakakibara squad', 'S2A10', -0.5],
    ['森長可の郎党', '仏ヶ根の手前に、家康様の旗本の先手が出た', "Ieyasu's vanguard guards have appeared before Hotokegane.", '仏ヶ根の手前', 'Before Hotokegane', '仏ヶ根の手前の徳川の旗本の先手を討て', "Cut down the Tokugawa guards' vanguard before Hotokegane", '徳川の侍', '大将首は目の前じゃ。かかれ！', 'The commander is right ahead. Charge!', '旗本の先手', 'Guard vanguard', 'S3A8G3', 0.1],
    ['堀秀政の郎党', '北の尾根に、井伊の赤備えが来る', "Ii's red-armored troops are coming along the north ridge.", '北の尾根', 'North ridge', '北の尾根から下りる井伊の赤備えを食い止めよ', "Hold back Ii's red-armored troops coming down the north ridge", '井伊の侍', '赤備えの名を知らしめよ！', 'Let them learn the name of the Red Devils!', '赤備えの組', 'Red-armored squad', 'S3A6G3', 0.6],
  ]),
  t04a_sengokubori: mk('negoro', 'negoro', [
    ['羽柴秀長', '外の竹藪に、根来の物見がまだ潜んでおる', 'Negoro scouts still lurk in the bamboo outside.', '外の竹藪', 'Outer bamboo thicket', '外の竹藪に潜む根来の物見を討て', 'Cut down the Negoro scouts lurking in the outer bamboo', '根来の者', '寄せ手の数を数えて戻れ！', 'Count the attackers and return!', '竹藪の物見', 'Bamboo scouts', 'S1A8', -0.5],
    ['堀秀政', '土橋の下の水の手を、城兵が守っておる', 'Defenders guard the water supply beneath the earthen bridge.', '土橋の下の水の手', 'Water supply below the bridge', '土橋の下の水の手を守る城兵を追い払え', 'Drive off the defenders guarding the water supply below the bridge', '根来の者', '水を取られれば終わりじゃ。守れ！', 'If they take the water we are done. Hold!', '水の手の番', 'Water guards', 'S1A9', 0.4],
    ['蜂須賀正勝', '二の丸の裏から、鉄砲の音が続く', 'Gunfire keeps coming from behind the second bailey.', '二の丸の裏', 'Behind the second bailey', '二の丸の裏から撃つ根来の鉄砲組を討て', 'Cut down the Negoro gunners firing from behind the second bailey', '根来の者', '手を止めるな。撃て、撃て！', 'Do not stop. Fire, fire!', '二の丸の鉄砲組', 'Second-bailey gunners', 'S1A3G7', 0.2],
    ['筒井順慶', '火薬の蔵のあたりに、番の組がおる', 'A guard squad stands near the powder store.', '火薬の蔵のあたり', 'Near the powder store', '火薬の蔵を守る根来の番を追い払え', 'Drive off the Negoro guards at the powder store', '根来の者', '蔵に火を掛けさせるな！', 'Do not let them set fire to the store!', '蔵の番', 'Store guards', 'S2A8', -0.3],
    ['中村一氏', '北の木戸から、落ちる者が出る。止めよ', 'People are fleeing through the north gate. Stop them.', '北の木戸', 'North gate', '北の木戸から落ちる根来の者を止めよ', 'Stop the Negoro men fleeing through the north gate', '根来の者', '道を開けい。根来へ戻るのじゃ！', 'Clear the way. We are going back to Negoro!', '木戸の落人', 'Gate fugitives', 'S1A9', 0.7],
  ]),
  t04_negoro: mk('negoro', 'negoro', [
    ['堀秀政', '大門の外に、僧兵がまだ立ちはだかる', 'Warrior monks still stand before the great gate.', '大門の外', 'Outside the great gate', '大門の外に立つ僧兵を追い散らせ', 'Scatter the warrior monks standing outside the great gate', '根来の僧兵', '寺を焼かせるな。ここで死ね！', 'Do not let the temple burn. Die here!', '大門の僧兵', 'Gate monks', 'S2A8', 0.2],   // 11/28 クラウド 根来の持ち主：act bot 9遊びで3回この組（十二人）に囲まれ退く背を突かれて倒れた→足軽を二人減らす（千石堀の初めの組と同じ厚さ）
    ['羽柴秀長', '坊舎の裏から行人の組が回り込む', 'A band of Gyonin is circling behind the dormitories.', '坊舎の裏', 'Behind the dormitories', '坊舎の裏へ回る行人の組を討て', 'Cut down the Gyonin band circling behind the dormitories', '行人', '坊舎を焼かれる前に討ち取れ！', 'Cut them down before the dormitories burn!', '行人の組', 'Gyonin band', 'S1A9G2', -0.6],
    ['堀尾吉晴', '杉の森へ、逃げ込む者がおる', 'People are escaping into the cedar forest.', '杉の森', 'Cedar forest', '杉の森へ逃げ込む根来衆を追い立てよ', 'Chase the Negoro men fleeing into the cedar forest', '根来の者', '森で撃て。木の陰から！', 'Fire in the forest, from behind the trees!', '森の根来衆', 'Forest Negoro men', 'S1A4G5', 0.6],
  ]),
  t04b_ota: mk('saika', 'saika', [
    ['羽柴秀長', '堤の外の水に、小舟が出ておる。鉄砲を積んでおるぞ', 'Small boats are out on the water beyond the dike, loaded with guns.', '堤の外の水', 'Water beyond the dike', '堤の外から撃つ小舟の雑賀衆を討て', 'Cut down the Saika men firing from small boats beyond the dike', '雑賀の者', '堤を崩せ。舟から撃ち続けよ！', 'Break the dike. Keep firing from the boats!', '小舟の雑賀衆', 'Saika in boats', 'S1A3G3', -0.5],
    ['蜂須賀正勝', '城の南の水際に、柵を築いて待つ組がおる', 'A squad waits behind a palisade on the south waterside.', '南の水際の柵', 'South waterside palisade', '南の水際の柵に拠る城方を追い払え', 'Drive off the defenders holding the south waterside palisade', '雑賀の者', '水を背に守れ。退くな！', 'Defend with the water behind you. Do not retreat!', '柵の城方', 'Palisade defenders', 'S2A6', 0.3],
    ['黒田官兵衛', '堤の人夫が襲われておる。急げ', 'The dike laborers are under attack. Hurry.', '堤の人夫', 'Dike laborers', '堤の人夫を襲う雑賀の組を討て', 'Cut down the Saika squad attacking the dike laborers', '雑賀の者', '堤を築かせるな。人夫から斬れ！', 'Do not let them build the dike. Cut the laborers first!', '襲う雑賀衆', 'Raiding Saika', 'S1A5', 0.7],
    ['中村一氏', '開城の使者が行く道に、血気の者が立つ', 'Hotheads stand on the road the surrender envoy must take.', '開城の使者の道', "Envoy's road", '使者の道をふさぐ血気の雑賀衆を退けよ', "Drive off the hot-blooded Saika men blocking the envoy's road", '雑賀の者', '降るくらいなら死ぬ。使者を通すな！', 'We would rather die than yield. Do not let the envoy pass!', '血気の者', 'Hotheads', 'S2A5', -0.3],
  ]),
  t05_ichinomiya: mk('chosokabe', 'chosokabe', [
    ['蜂須賀正勝', '麓の道に、長宗我部の物見が出ておる', 'Chosokabe scouts are out on the road at the foot of the hill.', '麓の道', 'Road at the foot', '麓の道の長宗我部の物見を討て', 'Cut down the Chosokabe scouts on the foothill road', '長宗我部の侍', '羽柴の動きを一宮へ知らせよ！', 'Report the Hashiba movements to Ichinomiya!', '麓の物見', 'Foot scouts', 'S1A5', -0.4],
    ['黒田官兵衛', '谷川の渡しに、番の組が立つ', 'A guard squad stands at the stream ford.', '谷川の渡し', 'Stream ford', '谷川の渡しを守る城方を追い払え', 'Drive off the defenders guarding the stream ford', '長宗我部の侍', '渡しを取られるな。浅瀬で討て！', 'Do not lose the ford. Strike them in the shallows!', '渡しの番', 'Ford guards', 'S2A5', 0.3],
    ['小早川隆景', '山の砦から鉄砲が降る', 'Guns are firing down from the hill fort.', '山の砦', 'Hill fort', '山の砦から撃つ長宗我部の鉄砲組を討て', 'Cut down the Chosokabe gunners firing from the hill fort', '長宗我部の侍', '近づけるな。高みから撃て！', 'Keep them back. Fire from the heights!', '砦の鉄砲組', 'Fort gunners', 'S1A3G3', 0.5],
    ['羽柴秀長', '北の道へ、落ちる城兵が行く', 'Defenders are fleeing along the north road.', '北の落ち道', 'North escape road', '北の道を落ちて行く城兵を止めよ', 'Stop the defenders fleeing along the north road', '長宗我部の侍', '土佐へ戻れ。道を開けよ！', 'Back to Tosa. Clear the road!', '落ちる城兵', 'Fleeing defenders', 'S1A5', -0.7],
  ]),
  t06_hetsugi: mk('shimazu', 'shimazu', [
    ['戸次の侍', '浅瀬の岸に、島津の追手が渡って来る', 'Shimazu pursuers are crossing at the shallows.', '浅瀬の追手', 'Pursuers at the shallows', '浅瀬を渡って追う島津の先手を食い止めよ', 'Hold off the Shimazu vanguard crossing the shallows in pursuit', '島津の侍', '釣り野伏せじゃ。逃がすな！', 'The tsurinobuse. Do not let them escape!', '島津の先手', 'Shimazu vanguard', 'S2A10', 0.1],
    ['十河の郎党', '右の林から、島津の伏せが出た', 'A Shimazu ambush has sprung from the right-hand woods.', '右の林', 'Woods on the right', '右の林から出た島津の伏せを払え', 'Clear the Shimazu ambush out of the right-hand woods', '島津の侍', '横から食い付け。足を止めさせよ！', 'Bite in from the side. Stop their feet!', '林の伏せ', 'Woodland ambushers', 'S2A8G2', 0.7],
    ['仙石の郎党', '左の畑から、鉄砲が来る', 'Guns are firing from the fields on the left.', '左の畑', 'Fields on the left', '左の畑から撃つ島津の鉄砲組を討て', 'Cut down the Shimazu gunners firing from the left-hand fields', '島津の侍', '退く背を撃て！', 'Shoot their retreating backs!', '畑の鉄砲組', 'Field gunners', 'S1A3G6', -0.6],
    ['長宗我部の郎党', '岸の石に足を取られるな。追手が詰める', 'Mind the stones on the bank. The pursuers close in.', '岸の石場', 'Rocky bank', '石場に詰める島津の追手を押し返せ', 'Push back the Shimazu pursuers pressing in on the rocky bank', '島津の侍', '殿を討て。大将首ぞ！', 'Kill the rearguard. A commander awaits!', '石場の追手', 'Bank pursuers', 'S2A9', 0.3],
    ['戸次の侍', '渡れば西の岸じゃ。もうひと息', 'Cross, and it is the west bank. One more push.', '西の岸の手前', 'Before the west bank', '西の岸の手前で追い付いた島津の組を退けよ', 'Beat back the Shimazu squad that caught up before the west bank', '島津の侍', '川を渡らせるな。ここで討て！', 'Do not let them cross. Strike here!', '岸の追手', 'Last pursuers', 'S2A8', -0.2],
  ]),
  t07_ganjaku: mk('akizuki', 'akizuki', [
    ['蒲生氏郷', '麓の道に、秋月の物見が出ておる', 'Akizuki scouts are out on the foothill road.', '麓の道', 'Foothill road', '麓の道の秋月の物見を討て', 'Cut down the Akizuki scouts on the foothill road', '秋月の侍', '寄せ手の数を岩石へ知らせよ！', 'Report the attackers numbers to Ganjaku!', '麓の物見', 'Foot scouts', 'S1A8', -0.5],
    ['黒田官兵衛', '崖の上から、石を落とす者がおる', 'Men on the cliff are dropping stones.', '崖の上', 'Clifftop', '崖の上から石を落とす城兵を討て', 'Cut down the defenders dropping stones from the clifftop', '秋月の侍', '石を落とせ。登らせるな！', 'Drop the stones. Do not let them climb!', '崖の城兵', 'Cliff defenders', 'S1A9', 0.4],
    ['宮部継潤', '搦手の木戸が静かじゃ。伏せておるぞ', 'The rear gate is too quiet. They are waiting.', '搦手の木戸', 'Rear gate', '搦手の木戸に伏せた秋月の組を払え', 'Clear the Akizuki squad lying in wait at the rear gate', '秋月の侍', '木戸を開けて、斬り込め！', 'Open the gate and charge!', '木戸の伏兵', 'Gate ambushers', 'S2A8', -0.6],
    ['小早川隆景', '城から落ちる者が、北の谷へ向かうぞ', 'Defenders fleeing the castle are heading for the north valley.', '北の谷', 'North valley', '北の谷へ落ちる城兵を追い立てよ', 'Chase the defenders fleeing into the north valley', '秋月の侍', '谷から古処山へ戻れ！', 'Back to Koshoyama through the valley!', '谷の落人', 'Valley fugitives', 'S1A9', 0.7],
    ['蜂須賀家政', '秋月の使者が来る。その前に、血気の者を払え', 'An Akizuki envoy approaches. First clear the hotheads.', '本丸の前', 'Before the keep', '本丸の前に立つ血気の侍を払え', 'Clear the hot-blooded samurai standing before the keep', '秋月の侍', '降るのは恥じゃ。最後まで戦え！', 'Yielding is shame. Fight to the last!', '血気の侍', 'Hot-blooded samurai', 'S3A6', 0.2],
  ]),
  t08_nejirozaka: mk('shimazu', 'shimazu', [
    ['藤堂高虎', '夜の闇から、島津の夜討ちが来る', 'A Shimazu night raid is coming out of the dark.', '夜の闇', 'The dark', '夜討ちに来る島津の組を押し返せ', 'Push back the Shimazu squad raiding at night', '島津の侍', '篝を消せ。闇で斬れ！', 'Put out the fires. Cut them down in the dark!', '夜討ちの島津勢', 'Night-raid Shimazu', 'S2A10', 0.1],
    ['宮部継潤', '堀の外に、島津の鉄砲が寄る', 'Shimazu guns are closing on the outer moat.', '堀の外', 'Outer moat', '堀に寄せる島津の鉄砲組を討て', 'Cut down the Shimazu gunners closing on the moat', '島津の侍', '柵の隙を撃て！', 'Shoot through the gaps in the stockade!', '堀の鉄砲組', 'Moat gunners', 'S1A3G6', 0.5],
    ['黒田官兵衛', '柵の外へ、島津の伏せが回る', 'A Shimazu ambush is circling around outside the palisade.', '柵の外', 'Outside the palisade', '柵の外へ回る島津の伏せを払え', 'Clear the Shimazu ambushers circling outside the palisade', '島津の侍', '横を衝け。柵の裏へ回れ！', 'Hit the flank. Get behind the palisade!', '回る伏せ', 'Circling ambushers', 'S2A8', -0.7],
    ['小早川隆景', '丘の下に、島津の旗本が出た', 'Shimazu guards have appeared at the foot of the hill.', '丘の下', 'Foot of the hill', '丘の下の島津の旗本を押し戻せ', 'Push back the Shimazu guards at the foot of the hill', '島津の侍', '義久様の前で退くな！', 'Do not retreat before Lord Yoshihisa!', '旗本の組', 'Guard squad', 'S3A7', 0.3],
    ['毛利輝元の郎党', '夜が明ける。退く島津勢が、まだ踏み止まる', 'Dawn breaks. The retreating Shimazu still stand their ground.', '明け方の坂', 'Dawn slope', '明け方に退く島津の殿を追い散らせ', 'Scatter the Shimazu rearguard retreating at dawn', '島津の侍', '殿じゃ。一人でも多く道連れにせよ！', 'We are the rearguard. Take as many as you can with you!', '島津の殿', 'Shimazu rearguard', 'S2A9', -0.3],
  ]),
  t09_yamanaka: mk('hojo', 'hojo', [
    ['堀秀政', '岱崎の出丸から、まだ撃つ者がおる', 'Men are still firing from the Daizaki outwork.', '岱崎の出丸', 'Daizaki outwork', '岱崎の出丸から撃つ北条の鉄砲組を討て', 'Cut down the Hojo gunners firing from the Daizaki outwork', '北条の侍', '出丸を枕に討死せよ！', 'Die with the outwork!', '出丸の鉄砲組', 'Outwork gunners', 'S1A3G6', -0.5],
    ['中村一氏', '西の丸の堀の底に、伏せた組がおる', 'A squad lies hidden in the bottom of the west bailey moat.', '西の丸の堀', 'West bailey moat', '西の丸の堀底に伏せた北条の組を払え', 'Clear the Hojo squad hidden in the west bailey moat', '北条の侍', '畝の間に伏せよ。足元を突け！', 'Lie low between the ridges. Stab at their feet!', '堀底の伏兵', 'Moat ambushers', 'S2A9', 0.4],
    ['一柳直末の郎党', '北の丸の門から、打って出る組がおる', 'A squad is sallying out from the north bailey gate.', '北の丸の門', 'North bailey gate', '北の丸の門から出る北条の組を押し返せ', 'Push back the Hojo squad sallying from the north bailey gate', '北条の侍', '門を開けよ。一太刀浴びせよ！', 'Open the gate. Strike once!', '門の打って出', 'Sally squad', 'S2A8', -0.3],
    ['堀尾吉晴', '二の丸の坂に、北条の侍が構える', 'Hojo samurai stand ready on the second bailey slope.', '二の丸の坂', 'Second bailey slope', '二の丸の坂に構える北条の侍を討て', 'Cut down the Hojo samurai set on the second bailey slope', '北条の侍', '康長様に近づけるな！', 'Keep them away from Lord Yasunaga!', '坂の侍', 'Slope samurai', 'S3A7', 0.2],
    ['宮部継潤', '落ちる者が、三島の方へ行く', 'People are fleeing toward Mishima.', '三島への道', 'Road to Mishima', '三島へ落ちて行く城兵を止めよ', 'Stop the defenders fleeing toward Mishima', '北条の侍', '小田原へ知らせよ！', 'Carry word to Odawara!', '落ちる城兵', 'Fleeing defenders', 'S1A9', 0.7],
  ]),
  t10_oshi: mk('hojo', 'hojo', [
    ['石田三成の郎党', '開城を肯ぜぬ者が、田の道へ出たぞ', 'Men who refuse the surrender have come out onto the paddy paths.', '田の道', 'Paddy paths', '開城を肯ぜぬ城兵を押し返せ', 'Push back the defenders who refuse the surrender', '成田の侍', '主家が降っても、我らは降らぬ！', 'Our lord may yield, but we will not!', '開城を肯ぜぬ城兵', 'Defiant defenders', 'S2A9', 0.3],
    ['大谷吉継', '沼の舟には、開城の知らせが届いておらぬ。撃って来るぞ', 'Word of the surrender has not reached the boats. They are firing.', '堤の外の水', 'Water by the dike', '開城を知らずに撃つ舟の鉄砲を討て', 'Cut down the boat gunners who fire, not knowing of the surrender', '成田の侍', '堤を崩せ。舟から撃て！', 'Break the dike. Fire from the boats!', '舟の鉄砲組', 'Boat gunners', 'S1A3G6', -0.5],
  ]),
  t11_hachioji: mk('hojo', 'hojo', [
    ['前田利家', '山下曲輪の外に、北条の物見がまだおる', 'Hojo scouts remain outside the lower bailey.', '山下曲輪の外', 'Outside the lower bailey', '山下曲輪の外に残る北条の物見を討て', 'Cut down the Hojo scouts remaining outside the lower bailey', '北条の侍', '霧に紛れて知らせよ！', 'Use the mist and carry word!', '曲輪の物見', 'Bailey scouts', 'S1A8', -0.5],
    ['上杉景勝の郎党', '曳橋の向こうに、鉄砲の音が続く', 'Gunfire continues beyond the drawbridge.', '曳橋の向こう', 'Beyond the drawbridge', '曳橋の向こうから撃つ城方の鉄砲組を討て', 'Cut down the defenders firing from beyond the drawbridge', '北条の侍', '橋を落とせ。一人も渡らせるな！', 'Drop the bridge. Let no one cross!', '橋向こうの鉄砲組', 'Bridge gunners', 'S1A3G6', 0.4],
    // 11/28 15:20 UTC クラウド 八王子の持ち主（K658・K674）：上杉景勝は北の搦手（下恩方の側）から攻め登った（docs/battle_refs/t11_hachioji.md 布陣・和樂web・旅マガ）。
    //   頂へ上る搦手の坂で上杉勢を阻む城兵を、上から討って道を開ける（阻む組の数は推定）
    ['上杉景勝の郎党', '搦手の坂で、上杉の先手が城兵に阻まれておる。上から崩してくれ', 'The Uesugi vanguard is held up on the rear-gate slope. Break the defenders from above.', '搦手の坂', 'Rear-gate slope', '搦手の坂で上杉勢を阻む城兵を討て', 'Cut down the defenders blocking the Uesugi on the rear-gate slope', '北条の侍', '搦手は渡さぬ。坂から突き落とせ！', 'The rear gate is not theirs. Throw them down the slope!', '搦手の守り', 'Rear-gate guard', 'S2A6', -0.3],
    // 11/28 14:40 クラウド 八王子の持ち主（K658・K674）：小宮曲輪は狩野一庵が守り、搦手の上杉勢に攻められ一庵は討死（docs/battle_refs/t11_hachioji.md 布陣）
    ['上杉景勝の郎党', '小宮曲輪に、狩野一庵の手がまだ籠っておる', "Kano Ichian's men are still holding out in the Komiya bailey.", '小宮曲輪', 'Komiya bailey', '小宮曲輪に籠る狩野一庵の手を討て', "Cut down Kano Ichian's men holding the Komiya bailey", '北条の侍', '一庵様と共に、ここで果てるまで！', 'We fall here, together with Lord Ichian!', '一庵の手', "Ichian's men", 'S2A6', 0.5],
    // 11/28 UTC クラウド 八王子の持ち主（K658 一戦15分・K674）：本丸の西は大堀切で尾根を断ち、その先が詰の城（西の尾根の石塁と堀切。docs/battle_refs/t11_hachioji.md 縄張り・地形）。
    //   頂が落ちた後、詰の城へ退いて籠る城兵を前田利長の手が追う（籠った組の数は推定）
    ['前田利長', '大堀切の向こう、詰の城へ退く者がおる。堀切を越えて追え', 'Defenders are pulling back to the last redoubt beyond the great trench. Cross it and pursue.', '詰の城', 'Last redoubt', '大堀切の向こう、詰の城に籠る城兵を討て', 'Cut down the defenders holding the last redoubt beyond the great trench', '北条の侍', '堀切を越えさせるな。石を落とせ！', 'Do not let them cross the trench. Drop the stones!', '詰の城の兵', 'Redoubt defenders', 'S2A5G2', 0.2],
    // 11/28 13:30 クラウド 八王子の持ち主（K658 一戦15分・K674）：城代 横地監物は落ちのびて檜原の方へ逃げた。搦手は上杉・真田昌幸（docs/battle_refs/t11_hachioji.md 46行）
    ['真田昌幸の郎党', '北の山道を、檜原の方へ落ちる者がおる。横地の供じゃ', "Men are fleeing up the north path toward Hinohara. Yokochi's retainers.", '檜原への落ち道', 'Path to Hinohara', '北の山道を檜原へ落ちる城兵を止めよ', 'Stop the defenders fleeing up the north path toward Hinohara', '北条の侍', '小田原へ生きて知らせよ。道を開けい！', 'Live and carry word to Odawara. Clear the path!', '落ちる城兵', 'Fleeing defenders', 'S2A6', -0.6],
  ]),
};
// 11/27 cloud-08（関所・司令塔）：岩石城は敵の兵の立っていた所が岩の上・櫓の上に多く、続きの段の寄せがそこから出て本人が届かず〔失〕になった（麓の道・搦手の木戸・血気の侍）。
//   本人と同じ高さ（四m 内）で、塀を挟まない所から寄せる（稲葉山の続きの段と同じ形）。段の数と敵の数・強さは変えない
MORE.t07_ganjaku.limit = 65;   // 十三任務を15〜17分に収める（続きの段一つ百秒→八十秒。段の数・敵は同じ）。11/28 09:35 クラウド t07：act bot --mobile 3戦の1本が段8 着498秒で続きの段が1080秒に届かず→六十五秒
// 11/28 10:15 クラウド t07（K582）：act bot --mobile で続きの五段のうち三段（麓の道・搦手の木戸・北の谷）が六十五秒の打ち切りで〔失〕。
//   寄せた組を崩した後、段の決めの数まで新手が百二十 m 先に湧いて歩く間に刻が切れた（台帳 09:50 の★★「着いて六秒何も起きない」も同じ元）。
//   千石堀・太田と同じく寄せた組を崩せば済む段にする（新手を湧かせない。段の数・寄せる敵の数は同じ）
MORE.t07_ganjaku.noRefill = true;
// 10:30 同：直した後 6戦のうち1戦だけ「搦手の木戸に伏せた組」が刻切れ〔失〕→ 伏せが起きて本人へ斬り掛かる組にする（千石堀・太田と同じ hunt。数は同じ）
MORE.t07_ganjaku.rows.filter((r) => r.fight)[2].fight.foes[0].hunt = true;
MORE.t07_ganjaku.fromAt = (rt, P, d) => {
  const y0 = rt.player?.u?.pos?.y ?? rt.world.heightAt(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  for (let r = 34; r >= 14; r -= 4) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(rt.world.heightAt(x, z) - y0) >= 4) continue;
    if (wb && wb(P, 0, { x, z })) continue;
    return { x, z };
  }
  return { x: P.x + Math.sin(d) * 12, z: P.z + Math.cos(d) * 12 };
};
// 11/28 クラウド 一宮の持ち主：act bot（携帯の見なし・描かず）3回中1回、続きの段の終わり「北の落ち道」で落ちる城兵六人の足軽の一突き二十を重ねられ十六秒で倒れた（696秒）。
//   一宮の元の段の打ち込み（0.05〜0.12）に比べ続きの段の既定 0.22 だけが重かった→一宮の続きの段は軽く（落ちて行く兵は踏み止まる兵より弱い。段の数・敵の数は同じ）
MORE.t05_ichinomiya.dmg = 0.07;   // 0.12 でも三回に一回「渡しの番」七人に十秒で削られた（541秒）→ 元の段の 0.05 に近く
// 11/28 08:15 クラウド 一宮の持ち主：act bot（携帯の見なし・描かず）5戦中1戦、続きの段の寄せが本丸の西の堀切（深さ三・五m）の向こうの
//   城兵の立っていた所から出て、本人が堀切の縁 (-32,96) で詰まった（541秒・行き先 (-70,102)）。岩石城と同じく本人と同じ高さ・塀を挟まない所から、
//   しかも間に堀切・谷（本人より三m 深い所）を挟まない所から寄せる（段の数・敵の数は同じ）
MORE.t05_ichinomiya.fromAt = (rt, P, d) => {
  const H = (x, z) => rt.world.heightAt(x, z), y0 = rt.player?.u?.pos?.y ?? H(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  const dip = (x, z) => { for (let k = 1; k < 8; k++) { const t = k / 8; if (H(P.x + (x - P.x) * t, P.z + (z - P.z) * t) < y0 - 3) return true; } return false; };
  for (let r = 30; r >= 12; r -= 3) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(H(x, z) - y0) >= 4 || dip(x, z)) continue;
    if (wb && wb(P, 0, { x, z })) continue;
    return { x, z };
  }
  return { x: P.x + Math.sin(d) * 12, z: P.z + Math.cos(d) * 12 };
};
// 11/28 13:05 クラウド 一宮の持ち主（K582）：act bot --mobile 639秒、続きの段の終わり「北の落ち道」が96秒続き、601秒に本人が本丸の堀切の縁 (-32,98) で
//   西の堀切の向こう (-97,103) へ進めず詰まった（寄せた組を崩した後、段の決めの数まで新手が百二十 m 先に湧いて歩く）。岩石城・千石堀と同じく
//   寄せた組を崩せば済む段にする（新手を湧かせない。段の数・寄せる敵の数は同じ）
MORE.t05_ichinomiya.noRefill = true;
// 11/28 クラウド 紀州の持ち主：千石堀は本丸の門で勝つので、続きの段の寄せが元の敵の立っていた塀・櫓の上や塀の向こうから出て、
//   act bot（携帯の見なし・描かず）5段とも本人が届かず百秒の打ち切りで終わった（463〜987秒）。岩石城と同じく本人と同じ高さ・塀を挟まない所から寄せる（段の数・敵は同じ）
MORE.t04a_sengokubori.fromAt = MORE.t07_ganjaku.fromAt;
// 11/28 07:45 クラウド 紀州の持ち主（K582）：寄せ口を替えた後も act bot（描かず --mobile）で続きの5段が百秒（竹藪の物見・火薬の蔵・北の木戸は〔失〕）・一戦1008〜1080秒。
//   POSLOG で太田城と同じく、9〜10人の組を崩しても段の決めの数（四十人）まで新手が七十 m 先に湧き、湧いた新手も城の崩れに巻かれて逃げた。
//   寄せた組を崩せば済む段にし（新手を湧かせない）、竹藪の物見・蔵の番は本人へ寄せる（段の数・敵の数は同じ）
MORE.t04a_sengokubori.noRefill = true;
for (const i of [0, 3]) MORE.t04a_sengokubori.rows.filter((r) => r.fight)[i].fight.foes[0].hunt = true;
// 11/28 07:00 クラウド 紀州の持ち主（K582 流れの崩れ）：太田城も開城の後の続きの段4つが act bot（携帯の見なし・描かず）2本とも全部百秒の打ち切り
//   （469→569・576→676・682→780・786→886秒）で、一戦が886秒に延びた。寄せが城の中・水の向こうから出て本人（北の土橋）へ届かない。
//   千石堀と同じく本人と同じ高さ・塀を挟まない所から、しかも水に浸かっていない所から寄せる（段の数・敵の数は同じ）
MORE.t04b_ota.fromAt = (rt, P, d) => {
  const wy = rt.flags?.waterY, H = (x, z) => rt.world.heightAt(x, z);
  const y0 = rt.player?.u?.pos?.y ?? H(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  for (let r = 30; r >= 12; r -= 3) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(H(x, z) - y0) >= 4 || (wy != null && H(x, z) < wy + 0.3) || Math.max(Math.abs(x), Math.abs(z)) < 26) continue;
    if (wb && wb(P, 0, { x, z })) continue;
    return { x, z };
  }
  return MORE.t07_ganjaku.fromAt(rt, P, d);
};
// 07:10 の POSLOG：寄せ口を替えても4段とも百秒。開城の後の組は5〜7人で、段の決めの数（四十人）に届くまで新手が百二十 m 先に湧き、
//   湧いた新手も城の崩れに巻かれてすぐ逃げ散る（469〜860秒の記録で新手9組のうち7組が「逃」）。開城の後の残りの組なので、
//   樫井と同じく寄せた組を崩せば済む段にし（新手を湧かせない）、人夫を襲う組・血気の者は本人へ寄せる。段の数・敵の数は同じ
MORE.t04b_ota.noRefill = true;
for (const i of [2, 3]) MORE.t04b_ota.rows.filter((r) => r.fight)[i].fight.foes[0].hunt = true;
// 11/28 07:20 UTC クラウド 山中の持ち主（K582・K658）：act bot --mobile 2本（980・930秒）で続きの五段が五つとも百秒の打ち切りまで延び、
//   bot の打ち切り1080秒まで百秒しか余らない。山中城も畝堀・塀・曲輪の段差が多く、寄せが塀の向こう・堀の底から出る→岩石城と同じく本人と同じ高さ・塀を挟まない所から寄せ、
//   一段八十秒で切る（段の数・敵の数・強さは同じ）
MORE.t09_yamanaka.fromAt = MORE.t07_ganjaku.fromAt;
// 11/28 08時 クラウド 八王子の持ち主：八王子は深沢山の頂の本丸（柵で囲む）で勝つので、続きの段「山下曲輪の外の物見」が本丸の東の八十七m 先 (-9,-120) に出て、
//   act bot --mobile（高・描かず）で本人が本丸の西の塀際 (-96,-129) から進めず（566秒★★）、百秒の打ち切りで済になった。岩石城・千石堀と同じく本人と同じ高さ・塀を挟まない所から寄せる
MORE.t11_hachioji.fromAt = MORE.t07_ganjaku.fromAt;
// 同じ持ち主（K582 一戦4〜7分）：act bot --mobile 6本で本筋は420〜480秒に済み、続きの二段がほぼ毎回百秒の刻限まで延びて604〜738秒。小牧・山崎と同じく一段を二十五秒で切る（段の数・敵は同じ）
MORE.t11_hachioji.limit = 25;
// 11/28 13時 UTC クラウド 八王子の持ち主（K658 一戦15分・待ちで延ばさず出来事ごとの達成）：上の二十五秒は K658 に背いた縮め（小牧の持ち主のしくじりの帳と同じ）。
//   二十五秒では物見と斬り合う前に段が切れる→小牧・山崎と同じく一段六十秒・新手を湧かせず寄せた組を崩せば済み・刻限は退いて済み。段の数・敵は同じ
MORE.t11_hachioji.limit = 60;
MORE.t11_hachioji.noRefill = true;
MORE.t11_hachioji.timeoutWin = true;
// 11/28 09:20 UTC 同じ持ち主（K582）：_t11_foes.mjs（--mobile・描かず）で物見8人は本人（本丸の西 -104,-152）の五十八m 北 (-86,-97) に出て、二十秒で二十m しか寄らず、
//   段が切れる前に城の崩れで逃げた（本人の刃が一度も届かない）。物見の組は本人を狙って寄せる（山崎の槍の組と同じ手）。鉄砲組は本人の二十m 内に出るので寄せない。段の数・敵は同じ
MORE.t11_hachioji.rows.filter((r) => r.fight)[0].fight.foes[0].hunt = true;
// 09:40 同じ持ち主：寄せても本人は本丸の柵の内、物見は柵の外（botDbg に W）で、二十五秒の内に口を回り切れなかった。本丸は狭く、十四m より外は柵の外になり
//   岩石城の寄せ方では選べる所が無く、五十m 先の外へ落ちていた。本人の十二m〜六m の柵を挟まない所、無ければ本丸の口の内 (-72,-135) から寄せる（口から駆け込む形）
MORE.t11_hachioji.fromAt = (rt, P, d) => {
  const H = (x, z) => rt.world.heightAt(x, z), y0 = rt.player?.u?.pos?.y ?? H(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  if (Math.hypot(P.x + 81, P.z + 136) > 30) return MORE.t07_ganjaku.fromAt(rt, P, d);   // 本丸の外なら今まで通り
  for (const r of [12, 9, 6]) for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(H(x, z) - y0) >= 3 || (wb && wb(P, 0, { x, z }))) continue;
    return { x, z };
  }
  return { x: -72, z: -135 };
};
MORE.t09_yamanaka.limit = 80;
// 11/28 15:10 UTC クラウド 山中の持ち主（K582 流れの崩れ）：携帯 せっかち bot 365秒、続きの段「出丸から撃つ鉄砲組」で寄せた組を崩した後、段の決めの数まで
//   新手の鉄砲組が出丸の塀の上（歩けない地面）に湧き、本人のピンが届かず八十秒の打ち切りで〔失〕（394・401秒 行けず）。八王子・千石堀と同じく
//   寄せた組を崩せば済む段にし（新手を湧かせない）、刻限が来たら残りは退いて済み。段の数・寄せる敵の数・強さは同じ
MORE.t09_yamanaka.noRefill = true;
MORE.t09_yamanaka.timeoutWin = true;
// 11/28 クラウド 山崎の持ち主（K658 一戦15分・K582）：act bot --mobile 2本（1312・1263秒）で続きの三段が百秒の刻限まで延び（天王山の腹は2本とも百秒）、
//   大返し7分＋追撃6分半で21分。続きの段は六十秒で切り、槍の二組（天王山の腹・竹藪の殿）は本人へ寄せる。鉄砲の組（淀川の堤）は寄せない（信貴山と同じ訳）。段の数・敵は同じ
MORE.t01_yamazaki.limit = 60;
// 11/28 10:20 UTC クラウド山崎の持ち主（K658 一戦15分・K582）：act bot --mobile 2戦（1110・1151秒）で続きの三段が三つとも六十秒の刻限まで延びた（寄せた組を崩しても新手が湧き直す）。
//   樫井と同じく新手を湧かせず、寄せた組を崩せば済む段に（達成が見える）。刻限が来たら残りは退いて済み（timeoutWin）。段の数・敵は同じ
MORE.t01_yamazaki.noRefill = true;
MORE.t01_yamazaki.timeoutWin = true;
// 11/28 08:30 UTC クラウド 小牧の持ち主（K582 一戦4〜7分）：act bot で本筋が514秒に済み、続きの三段（岩崎城の搦手・列の後ろ・竹藪）が163秒かかって677秒→上田・木津と同じく一段18秒まで（段の数・敵は同じ）
MORE.t03_komaki.limit = 18;
// 11/28 11時 UTC クラウド 小牧の持ち主（K658 一戦15分・待ちで延ばさず出来事ごとの達成）：上の十八秒は K658（K652② の十分より新しい）に背いた縮め。
//   十八秒では組と斬り合う前に段が〔失〕で切れる→山崎・戸次川と同じく一段六十秒・新手を湧かせず寄せた組を崩せば済み・刻限は退いて済み。槍の二組（搦手・竹藪）は本人へ寄せる。段の数・敵は同じ
MORE.t03_komaki.limit = 60;
MORE.t03_komaki.noRefill = true;
MORE.t03_komaki.timeoutWin = true;
for (const i of [0, 2]) MORE.t03_komaki.rows.filter((r) => r.fight)[i].fight.foes[0].hunt = true;
//   同 11:20：act bot 3本とも「列の後ろに付く徳川の鉄砲組」が出た刻に〔済〕（0秒）。岩崎の道 (142,108) は南の見えない壁（z=120）の際で、
//   既定の出所（foeFrom）が壁の外に立ち、b_t03_komaki.js の「壁の外で攻めに出た敵の兵を去らせる」で生まれてすぐ消えていた
//   →岩石城の出所の手（本人と同じ高さ・塀を挟まない）に、壁の内（四方の壁から十 m 内）だけを足す。段の数・敵は同じ
MORE.t03_komaki.fromAt = (rt, P, d) => {
  const y0 = rt.player?.u?.pos?.y ?? rt.world.heightAt(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army);
  const inBox = (x, z) => Math.abs(x) <= 136 && z >= -100 && z <= 98;   // 同 11:15：4戦に1戦まだ0秒＝退く鉄砲（間合いを取る）が南の際 z=118 の掃除に掛かる→際から二十 m 内へ
  for (let r = 40; r >= 14; r -= 4) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (!inBox(x, z) || Math.abs(rt.world.heightAt(x, z) - y0) >= 4) continue;
    if (wb && wb(P, 0, { x, z })) continue;
    return { x, z };
  }
  return { x: Math.max(-136, Math.min(136, P.x - 12)), z: Math.max(-100, Math.min(98, P.z - 12)) };
};
for (const i of [0, 2]) MORE.t01_yamazaki.rows.filter((r) => r.fight)[i].fight.foes[0].hunt = true;
// 11/28 09時 クラウド 戸次川の持ち主（K582・K658）：act bot --mobile 4本（939〜1012秒）で退きの後の続きの五段が五つとも百秒の刻限まで延び、
//   4本で十段が〔失〕（寄せた組が浅瀬の向こう・林の中に湧き、本人へ来ない）。山崎と同じく一段六十秒で切り、槍の四組は本人へ寄せる。鉄砲の組（左の畑）は寄せない。段の数・敵は同じ
MORE.t06_hetsugi.limit = 60;
//   同 09:35：六十秒・寄せでも五段のうち三〜四段〔失〕（770〜860秒）＝紀州と同じく決めの数まで新手が湧き続け、寄せ口が川床・対岸に出る
//   →寄せた組を崩せば済む段（新手を湧かせない）にし、岩石城と同じく本人と同じ高さ（川床でない）・塀を挟まない所から寄せる
MORE.t06_hetsugi.noRefill = true;
MORE.t06_hetsugi.fromAt = (rt, P, d) => MORE.t07_ganjaku.fromAt(rt, P, d);
for (const i of [0, 1, 3, 4]) MORE.t06_hetsugi.rows.filter((r) => r.fight)[i].fight.foes[0].hunt = true;
// 11/28 09:15 UTC クラウド 根来の持ち主（K582）：大門の僧兵を十人にした後も act bot（描かず）2戦中1戦、続きの段「大門の外」で僧兵の足軽の突きを重ねられ789秒に倒れた
//   （章の通しの 790秒倒れと同じ所・受けた傷 大門の僧兵211）。一宮と同じく続きの段の打ち込みを既定 0.22 から軽く（段の数・敵の数は同じ）
MORE.t04_negoro.dmg = 0.12;
// 11/28 16:25 UTC クラウド 根来の持ち主（K582 流れの崩れ・act bot --mobile 1612 の546秒★★ (94,-67) で行き先 (96,-96) へ進めない）：
//   続きの段の寄せが、既定の「三十〜九十m 先の根来の兵の居た所」から出て、子院の石垣の上（高さ29m・本人は14.8m・二m で八m 上がる崖）に湧いた。
//   千石堀・岩石城と同じく本人と同じ高さ・塀を挟まない所から寄せる（段の数・敵の数・強さは同じ）
MORE.t04_negoro.fromAt = MORE.t07_ganjaku.fromAt;
// 11/28 10:30 UTC クラウド 忍城の一時間の持ち主（K582 流れの崩れ・史実）：忍城は小田原の開城の後に戦わず明け渡した（佐間口の門が開き、城の者が槍を伏せて膝をつく）。
//   なのに続きの段の始めの「逃げの下知」が膝をついた成田の者まで走らせ、寄せは城方の兵の真ん中（本丸の島の中）から出て、本人が門から二の丸へ入り
//   (-74,-90) で詰まった（act bot --mobile 818秒★★）。①膝をついた者（peaceful）は逃がさずその場に残す ②開城を肯ぜぬ者・知らせの届かぬ舟として、
//   城の島から四十m より外・沼に浸からない・本人と同じ高さで塀を挟まない所から寄せる（段の数・敵の数・強さは同じ）
MORE.t10_oshi.onStart = (rt) => {
  const F = rt.flags, keep = F._k652g || (F._k652g = new Set());
  for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) {
    if (g.peaceful) { keep.add(g); continue; }
    if (g.units.every((u) => !u.alive || u.perch)) { g.focus = null; g.order = 'hold'; g.fire = false; g.noEngage = true; continue; }
    g.noRout = false; g.focus = null; g.order = 'flee'; g.routed = true; g.morale = 0;
  }
};
MORE.t10_oshi.fromAt = (rt, P, d) => {
  const H = (x, z) => rt.world.heightAt(x, z), y0 = rt.player?.u?.pos?.y ?? H(P.x, P.z), wb = rt.army?.wallBetween?.bind(rt.army), wy = rt.flags?.lakeY ?? -9;
  const away = Math.atan2(P.x + 95, P.z + 108);   // 本丸 (-95,-108) から本人への向き
  for (let r = 30; r >= 12; r -= 3) for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
    const a = away + da, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, h = H(x, z);
    if (Math.hypot(x + 95, z + 108) < 40 || h < wy + 0.3 || Math.abs(h - y0) >= 3 || (wb && wb(P, 0, { x, z }))) continue;
    return { x, z };
  }
  return { x: P.x + Math.sin(away) * 14, z: P.z + Math.cos(away) * 14 };
};
MORE.t10_oshi.rows.filter((r) => r.fight)[0].fight.foes[0].hunt = true;
// 11/28 15:50 クラウド 忍城の一時間の持ち主（K582）：開城の段の「刃を交えない」を続きの段で外した後、舟の段で新手が百m 東の丘 (37,-34) と元の舟の口 (-82,-72) に
//   代わる代わる湧き、本人が百m を行き来して刻が切れた。岩石城・千石堀と同じく寄せた組を崩せば済む段にする（段の数・寄せる敵の数は同じ）
MORE.t10_oshi.noRefill = true;
// 11/28 17:30 UTC クラウド 根白坂の一時間の持ち主（K658 一戦15分・K582）：act bot --mobile 2本（957・1132秒）で本筋は394秒に済み、続きの五段が一段百十〜百五十秒
//   （寄せた組を崩しても決めの数まで新手が湧き直し、丘の下の段では本人が塀の際 (-11,0) から坂下 (-2,94) へ回れず止まった）。山崎・戸次川と同じく
//   一段六十秒・新手を湧かせず寄せた組を崩せば済み・刻限は退いて済み。出所は元のまま（K712 の遠さを保つ）。段の数・敵は同じ
//   同 17:40：槍の四組を本人へ寄せる手（hunt）も入れると、寄せた組の後ろの鉄砲の束まで本人に付いて来て act bot 5本に2本、続きの段で囲まれ撃たれて倒れた（560・646秒）→寄せる手は外す
MORE.t08_nejirozaka.limit = 60;
MORE.t08_nejirozaka.noRefill = true;
MORE.t08_nejirozaka.timeoutWin = true;
for (const [k, v] of Object.entries(MORE)) M0[k] = v;
// gate：元の win が条件待ちで何度も呼ばれる戦（戸次川）は、条件が揃うまで元の win のまま通す
const GATE = {
  t06_hetsugi: (rt) => { const F = rt.flags, m = F.motoU; return !!F.sogoDead && !F.ending && (F.step === 5 && rt.t - F.stepT > 20 || cpDone(rt) || (m?.alive && !m.gone && !m.dying && m.pos.z > 26)); },
};
export function toyotomiMore(def, id) {
  const win0 = def.win;
  moreSteps(def, MORE[id]);
  const g = GATE[id];
  if (g && win0) { const w1 = def.win; def.win = function (rt, ...a) { return (g(rt) || rt.flags.k652m ? w1 : win0).call(this, rt, ...a); }; }
}
