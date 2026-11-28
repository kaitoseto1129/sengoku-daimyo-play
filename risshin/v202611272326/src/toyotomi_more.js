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
    ['池田恒興の郎党', '小牧山から、徳川の物見が楽田の方へ出て来た', 'Tokugawa scouts have come out of Komakiyama toward Gakuden.', '楽田の外の畑', 'Fields outside Gakuden', '楽田の外の畑へ出た徳川の物見を討て', 'Cut down the Tokugawa scouts who came into the fields outside Gakuden', '徳川の侍', '羽柴の陣を覗け。見たら戻れ！', 'Spy on the Hashiba camp. See it, then return!', '徳川の物見', 'Tokugawa scouts', 'S1A8', -0.4],
    ['蒲生氏郷', '二重堀の外の堀に、酒井の鉄砲が寄せて来る', 'Sakai gunners are creeping up on the moat outside the double moat.', '二重堀の外の堀', 'Outer moat', '堀に寄せる酒井の鉄砲組を追い払え', 'Drive off the Sakai gunners closing on the moat', '酒井の侍', '柵の隙を撃て。近づくな、遠くから！', 'Shoot through the gaps in the stockade. Keep your distance!', '酒井の鉄砲組', 'Sakai gunners', 'S1A3G6', 0.5],
    ['堀秀政', '楽田へ戻る道の竹藪が怪しい。伏せておるぞ', 'The bamboo along the road back to Gakuden looks wrong. They are lying in wait.', '戻り道の竹藪', 'Bamboo on the road back', '竹藪に伏せた徳川の組を払え', 'Clear the Tokugawa squad hidden in the bamboo', '徳川の侍', '通り過ぎたら背を衝け！', 'Strike their backs as they pass!', '竹藪の伏兵', 'Bamboo ambushers', 'S2A9', -0.7],
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
    ['堀秀政', '大門の外に、僧兵がまだ立ちはだかる', 'Warrior monks still stand before the great gate.', '大門の外', 'Outside the great gate', '大門の外に立つ僧兵を追い散らせ', 'Scatter the warrior monks standing outside the great gate', '根来の僧兵', '寺を焼かせるな。ここで死ね！', 'Do not let the temple burn. Die here!', '大門の僧兵', 'Gate monks', 'S2A10', 0.2],
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
    ['石田三成の郎党', '城から、田の道へ打って出る組がおる', 'A squad sallies from the castle along the paddy paths.', '田の道', 'Paddy paths', '田の道へ打って出た城方を押し返せ', 'Push back the defenders sallying onto the paddy paths', '成田の侍', '水に足を取られるな。田の道を守れ！', 'Mind the water. Hold the paddy paths!', '田の城方', 'Paddy defenders', 'S2A9', 0.3],
    ['大谷吉継', '堤の外に、舟の鉄砲が寄る', 'Gunners in boats are closing on the outer dike.', '堤の外の水', 'Water by the dike', '舟から撃つ城方の鉄砲を討て', 'Cut down the defenders firing from boats', '成田の侍', '堤を崩せ。舟から撃て！', 'Break the dike. Fire from the boats!', '舟の鉄砲組', 'Boat gunners', 'S1A3G6', -0.5],
  ]),
  t11_hachioji: mk('hojo', 'hojo', [
    ['前田利家', '山下曲輪の外に、北条の物見がまだおる', 'Hojo scouts remain outside the lower bailey.', '山下曲輪の外', 'Outside the lower bailey', '山下曲輪の外に残る北条の物見を討て', 'Cut down the Hojo scouts remaining outside the lower bailey', '北条の侍', '霧に紛れて知らせよ！', 'Use the mist and carry word!', '曲輪の物見', 'Bailey scouts', 'S1A8', -0.5],
    ['上杉景勝の郎党', '曳橋の向こうに、鉄砲の音が続く', 'Gunfire continues beyond the drawbridge.', '曳橋の向こう', 'Beyond the drawbridge', '曳橋の向こうから撃つ城方の鉄砲組を討て', 'Cut down the defenders firing from beyond the drawbridge', '北条の侍', '橋を落とせ。一人も渡らせるな！', 'Drop the bridge. Let no one cross!', '橋向こうの鉄砲組', 'Bridge gunners', 'S1A3G6', 0.4],
  ]),
};
// 11/27 cloud-08（関所・司令塔）：岩石城は敵の兵の立っていた所が岩の上・櫓の上に多く、続きの段の寄せがそこから出て本人が届かず〔失〕になった（麓の道・搦手の木戸・血気の侍）。
//   本人と同じ高さ（四m 内）で、塀を挟まない所から寄せる（稲葉山の続きの段と同じ形）。段の数と敵の数・強さは変えない
MORE.t07_ganjaku.limit = 80;   // 十三任務を15〜17分に収める（続きの段一つ百秒→八十秒。段の数・敵は同じ）
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
