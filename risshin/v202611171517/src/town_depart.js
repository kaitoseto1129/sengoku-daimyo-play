// ======================================================================
// 出陣の場面（K308 要件49〜50）：城下で出陣の札を選ぶと、すぐ戦へ飛ばず、門の内に兵・旗・荷駄が集まり、
//   主人公も門へ向かう。列が門から出ていくのを町の人が見送り、暗転して戦場へ。五秒ほど。
//   兵の数は身分で増える（足軽＝組の数人／足軽大将から旗と荷駄／侍大将から騎馬の供）。多くても二十人（重くしない）。
//   描かずの確かめ（bot）と「動きを減らす」の設定の時は場面を飛ばす。
// ======================================================================
import { allyGroup } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { unpark } from './town_air.js';
import { BATTLES, scenarioKey, scenario } from './state.js';

// K364 ⑤（docs/specs/drama_req_1117.md 26 ほか）：戦の前の段。その戦だけの出立を、出陣の場面に足す（字幕でなく、目の前の動きと声で）。
//   主人公は何が起きるのか全部は分からないまま付いていく。史実の分けは docs/journey/<戦>.md の K364 の節。
const SORTIE = {
  // 桶狭間：五月十九日の明け方、丸根・鷲津の急報。信長は敦盛を舞い、立ったまま湯漬けを食べ、わずかな供で清洲を飛び出した（信長公記＝A）
  okehazama: {
    sec: 13.5, time: 'morning', lead: { name: '織田信長', n: 5 },
    lines: [[0, '使番', '丸根と鷲津に煙！　今川が砦にかかりましたぞ！', 3], [3.2, '町の人', '殿は敦盛を舞われ、立ったまま湯漬けを掻き込まれたそうな', 3.4],
      [7, '組頭 源八', '殿はもう馬じゃ。供は五騎ばかり……走れ、置いていかれるぞ', 3.4], [10.6, '足軽', 'どこへ行くんじゃ', 1.8], [12, '組頭 源八', '知らん。殿の背を追え', 1.8]],
  },
  // 森部：五月十一日に斎藤義龍が急死、十三日に信長は木曽川・飛騨川を越えて西美濃へ攻め入った（信長公記＝A）。急な出陣の空気（B）
  moribe: {
    sec: 11.5, lead: { name: '織田信長', n: 4 },
    lines: [[0, '使番', '美濃の斎藤義龍、急な病で死んだとの知らせ！', 3], [3.4, '組頭 源八', '殿はこの時を待っておられた。すぐ木曽川を越えるぞ', 3.2],
      [7.2, '足軽', '雲が低い……川が増えておらねばよいが', 2.8], [10, '組の者', '桶狭間の次は美濃か', 1.8]],
  },
  // 墨俣：砦の普請。一夜で築いた話・川上で木を刻んで流した話は『武功夜話』などの伝え（C）。兵の「と聞く」で言う。材木を担ぐ人足が列に混じる
  sunomata: {
    sec: 11.5, lead: { name: '木下藤吉郎', n: 2, horse: false, porters: 6 },
    lines: [[0, '木下藤吉郎', '急げ急げ！　斎藤が気づく前に、美濃の目の前に砦を立てる', 3.2], [3.6, '人足', '材木は担げるだけ担げ、と……', 2.6],
      [6.6, '組の者', '川上で木を刻んで、川へ流すのだ、と聞く。ほんまかのう', 3.2], [9.8, '組頭', '柵が立つまでが、わしらの持ち場じゃ', 2.2]],
  },
  // 稲葉山（drama_req 27：調略・内応を背に）：西美濃三人衆（稲葉・氏家・安藤）が人質を出して信長に付き、信長はすぐ兵を進めた（信長公記＝A）
  inabayama: {
    sec: 11.5, lead: { name: '木下藤吉郎', n: 3, horse: false },
    lines: [[0, '使番', '西美濃の三人衆、人質を出して殿に付くとの由！', 3], [3.4, '木下藤吉郎', '人質を受け取りにも行かぬうちに、殿はもう出られるぞ', 3.2],
      [7.2, '組頭', '稲葉山の背が、がら空きになったのう', 2.6], [9.8, '足軽', '美濃の侍が、今日から味方か……', 2]],
  },
  // 姉川（drama_req 30：以前は味方だった浅井）：金ヶ崎で背いた浅井を討ちに出る。お市は浅井の小谷にいる（A）。言葉は B
  anegawa: {
    sec: 11.5, lead: { name: '織田信長', n: 4 },
    lines: [[0, '組頭', '浅井の旗を見ても、もう味方と思うな', 2.8], [3.4, '組の者', '金ヶ崎の陣に、お市様から両端を縛った小豆の袋が届いた、と聞く', 3.2],
      [6.8, '足軽', 'お市様は……まだ小谷の城におられるのじゃろ', 3], [10, '組頭', '口を慎め。行くぞ', 1.8]],
  },
  // 設楽原（drama_req：長篠の鉄砲の支度）：長篠城が武田に囲まれ、奥平が持ちこたえている（A）。鉄砲と玉薬の荷駄。
  //   兵が一人一本ずつ柵の木を担いで行った話は伝え（C）なので「と聞く」で言う
  shitaragahara: {
    sec: 11.5, lead: { name: '前田利家', n: 2, horse: false, porters: 6 },
    lines: [[0, '使番', '長篠の城、武田に囲まれ候。奥平殿はなお持ちこたえておりまする！', 3.2], [3.6, '前田利家', '鉄砲と玉薬の荷駄が先じゃ。濡らすでないぞ', 3],
      [7, '組の者', '一人一本ずつ、柵の木を担いで行くのだ、と聞く', 3], [10, '足軽', '騎馬を柵で止めるのか……', 1.8]],
  },
  // 関ヶ原前夜（drama_req 51：雨）：九月十四日の夜、西軍が大垣城を出て雨の中を関ヶ原へ回った。家康は夜のうちに後を追った（A）。言葉は B
  k06_sekigahara: {
    scn: 'tokugawa', sec: 12, time: 'night', rain: 0.8, lead: { name: '徳川家康', n: 4, flag: 'tokugawa' },
    lines: [[0, '使番', '石田勢、大垣の城を出て、雨の中を西へ！　関ヶ原へ回るものと見え候', 3.4], [3.8, '徳川家康', '夜のうちに追う。夜が明ければ、そこが戦場じゃ', 3.2],
      [7.4, '組頭', '火縄を濡らすな。笠を深う被れ', 2.6], [10.2, '足軽', '雨で、前の者の背も見えん……', 2]],
  },
  // 夏の陣の入口（drama_req：冬の陣の和議と堀→夏の陣で大坂城が守れない訳）：冬に和を結び、堀は埋められた。大坂方が再び兵を集め、家康は駿府を発った（A）。
  //   「外堀だけの約定が内の堀まで埋まった」は通説の言い方なので兵の「と聞く」で言う
  k12_kashii: {
    scn: 'tokugawa', sec: 12, lead: { name: '徳川家康', n: 4, flag: 'tokugawa' },
    lines: [[0, '使番', '大坂方、またも浪人を集め、城を出る構えとの由！', 3], [3.6, '組頭', '冬に和を結んで、大坂の堀は埋めたはずじゃ', 3],
      [7, '組の者', '外の堀だけの約定が、内の堀まで埋まった、と聞く', 3], [10.2, '足軽', '堀の無い城なら、打って出て来るしかないのう', 2]],
  },
  // 戸次川（drama_req 18 進退の判断）：島津勢が鶴賀城を囲む。秀吉は本隊が来るまで守りを固めよと命じていたが、軍監の仙石秀久は川を渡って攻めると決めた（A）。言葉は B
  t06_hetsugi: {
    scn: 'toyotomi', sec: 12, lead: { name: '仙石秀久', n: 3, flag: 'toyotomi' },
    lines: [[0, '使番', '島津勢、鶴賀の城を囲み候！', 2.6], [3, '仙石秀久', '川を渡って島津を討つ。城を見捨てられるか', 3],
      [6.8, '組の者', '殿下は、本隊が着くまで待てと仰せのはずじゃが……', 3], [10, '組頭', '決めるのは上の方じゃ。黙って付いて行け', 2]],
  },
  // 小田原攻めの入口（drama_req 19 諸大名の集結）：天正十八年、諸国の大名が二十万を超える兵で小田原へ向かった（A）
  t09_yamanaka: {
    scn: 'toyotomi', sec: 12, lead: { name: '豊臣秀次', n: 4, flag: 'toyotomi' },
    lines: [[0, '使番', '東海道は諸国の大名の兵で埋まっておりまする。総勢二十万を超えるとの由', 3.4], [3.8, '組頭', '北条一つに、日の本じゅうが寄せるのか', 2.8],
      [7, '組の者', '箱根の山の城を、一つずつ落として行くそうな', 2.8], [10, '足軽', '……これで戦が終わるんかのう', 2]],
  },
  // 小田原（drama_req 20 石垣山の普請）：小田原城を見下ろす山に石垣の城を築いた（A）。出来上がってから木を伐って一夜で建ったように見せた話は伝え（C）なので「と聞く」
  t12_odawara: {
    scn: 'toyotomi', sec: 12, lead: { name: '豊臣秀吉', n: 3, horse: false, porters: 6, flag: 'toyotomi' },
    lines: [[0, '豊臣秀吉', '北条の目の前の山に、石垣の城を築く。囲んだまま、ここで年を越してもよいぞ', 3.4], [4, '人足', '石を担げ、石を', 2.2],
      [6.6, '組の者', '出来上がったら木を伐って、一夜で城が建ったように見せるのだ、と聞く', 3.2], [10.2, '足軽', '戦より普請の方が長いのう', 1.8]],
  },
  // ---- K364 要件書の残り（11/18 続き）。史実の分けは各戦の docs/journey/<戦>.md の K364 の節 ----
  // 比叡山（31）：山門は浅井・朝倉を山に入れた。信長は味方か中立を求め、さもなくば焼くと告げていた（信長公記＝A）。兵の戸惑い（B）
  hieizan: {
    sec: 12, lead: { name: '織田信長', n: 4 },
    lines: [[0, '使番', '山門は浅井・朝倉に味方し、坂本を見下ろしておりまする', 3], [3.6, '組頭', '味方せぬなら山を焼く、と殿は前から申されておった', 3],
      [7, '足軽', '寺を……攻めるのか', 2], [9.4, '組の者', '僧も、女子供も山におると聞く', 2.4]],
  },
  // 長島（32）：輪中の水郷。舟と地の者の案内（B）。九鬼の船が川を塞ぐ（A）
  nagashima: {
    sec: 12, lead: { name: '柴田勝家', n: 3 },
    lines: [[0, '物見', '輪中は川で切れて、どこまでが島か分からぬ。舟でなければ渡れぬ所ばかり', 3.4], [3.8, '地の者', 'あの村も、その先の砦も、門徒の衆でござる', 3],
      [7.2, '足軽', '見える所の全部が、敵の地か……', 2.4], [9.8, '組頭', '九鬼の船が川を塞ぐ。わしらは堤を行く', 2]],
  },
  // 手取川（35・36）：七尾城の救援に北へ。秀吉は勝家と合わず、届けもなく陣を引き払った（信長公記＝A）。言い争いの中身は B
  tedorigawa: {
    sec: 12, lead: { name: '柴田勝家', n: 4 },
    lines: [[0, '柴田勝家', '七尾の城を救う。上杉が着く前に能登へ入るぞ', 3], [3.6, '組の者', '羽柴様と柴田様が、軍議で言い争うたそうな', 3],
      [7, '足軽', '……羽柴様の旗が、列に見えんのう', 2.4], [9.6, '組頭', '余計な事を言うな', 1.8]],
  },
  // 本能寺（37〜39）：信長はわずかな小姓衆と京の本能寺へ入った（A）。翌日の茶の会や名物の話は伝えを含むので「と聞く」。主人公は何も知らない
  honnoji: {
    sec: 12, lead: { name: '織田信長', n: 3 },
    lines: [[0, '組頭', '上様は小姓衆ばかりを連れて、京の本能寺へ入られる', 3], [3.6, '組の者', '名物の茶道具を運ばせて、京で茶の会を開かれる、と聞く', 3.2],
      [7.2, '足軽', '供が、えらい少ないのう', 2], [9.4, '組頭', '京は上様の膝元じゃ。何が起きるものか', 2.4]],
  },
  // 賤ヶ岳（24・25）：余呉の山々に陣城を並べてのにらみ合い。秀吉は岐阜の信孝に備えて大垣へ（A）。寒さ・炊事・見張り（B）
  t02_shizugatake: {
    scn: 'toyotomi', sec: 12, lead: { name: '羽柴秀長', n: 3, flag: 'toyotomi' },
    lines: [[0, '組頭', '余呉の山に砦を並べて、もうひと月にらみ合いじゃ', 3], [3.6, '足軽', '夜は冷える。向こうの山にも、柴田の火が見えるそうな', 3],
      [7, '使番', '長浜の勝豊様は羽柴に降られた。殿は岐阜の信孝様に備えて大垣へ', 3], [9.8, '組の者', '殿の留守に、柴田が動かねばよいが', 2]],
  },
  // 小牧・長久手（43）：信雄が秀吉に通じたとして家老三人を斬り、家康と結んだ（A）。戦場の前に政治が動く
  t03_komaki: {
    scn: 'toyotomi', sec: 12, lead: { name: '羽柴秀吉', n: 4, flag: 'toyotomi' },
    lines: [[0, '使番', '信雄様が、羽柴に通じたとして家老三人を斬られた由！', 3], [3.6, '組頭', '信雄様の後ろには、徳川殿がおる', 2.6],
      [6.8, '足軽', 'この前まで、皆おなじ織田の家中じゃったのに', 2.8], [9.8, '羽柴秀吉', '諸将への書状を急げ。戦はもう始まっておる', 2]],
  },
  // 紀州（44）：十万を超える羽柴の軍（A）。昔の織田の軍とは大きさが違う（B）
  t04a_sengokubori: {
    scn: 'toyotomi', sec: 12, lead: { name: '羽柴秀吉', n: 4, flag: 'toyotomi' },
    lines: [[0, '使番', '紀州へ向かう兵、十万を超えるとの由', 2.8], [3.4, '古参の侍', '桶狭間の頃の殿の兵は、二千もおらなんだ', 3],
      [6.8, '足軽', '海の方まで、ずっと旗じゃ', 2.4], [9.6, '組頭', '国じゅうの大名が、羽柴の下知で動いておる', 2.2]],
  },
  // 四国（45）：船を並べて海を渡る。馬・米・武具・玉薬・材木（A：渡海の大軍。積み荷の様子は B）
  t05_ichinomiya: {
    scn: 'toyotomi', sec: 12, lead: { name: '羽柴秀長', n: 2, horse: false, porters: 6, flag: 'toyotomi' },
    lines: [[0, '羽柴秀長', '淡路から阿波へ、船を並べて渡る。積み残すな', 3], [3.6, '人足', '馬も米も、玉薬も材木も、みな船へ', 2.6],
      [6.6, '足軽', '海を渡って戦か……船酔いせねばよいが', 2.6], [9.6, '組頭', '島へ兵を送るだけで、一つの戦じゃ', 2.2]],
  },
  // ---- 関ヶ原までの書状と去就（要件書50）・関ヶ原の後（52）・冬の陣の前（53）。徳川編 ----
  // 河田：東軍の諸将は清洲に集まり家康の出馬を待った。家康の使い村越茂助が「なぜ攻めぬ」と伝え、諸将は木曽川を渡った（A）
  k02_kawada: {
    scn: 'tokugawa', sec: 12, lead: { name: '池田輝政', n: 3, flag: 'ageha' },
    lines: [[0, '使番', '内府様の御使い、村越殿より。「方々、なぜ攻めかからぬ」との由！', 3.2], [3.8, '組頭', '待っておったのは、こちらの腹の内を見るためか', 2.8],
      [7, '組の者', '福島様も池田様も、木曽川を渡ると決められた', 2.6], [9.8, '足軽', '書状一つで、戦が動くのう', 2]],
  },
  // 上田：真田昌幸と信繁は西に、信幸は東に分かれた（犬伏の別れ＝A）。秀忠は中山道を上田へ（A）
  k05_ueda: {
    scn: 'tokugawa', sec: 12, lead: { name: '徳川秀忠', n: 4, flag: 'tokugawa' },
    lines: [[0, '使番', '真田安房守は西に付き、上田に籠もるとの由。嫡男の伊豆守殿はお味方', 3.2], [3.8, '組頭', '親子で東と西に分かれたか', 2.4],
      [6.6, '組の者', 'どちらが勝っても、真田の家は残る、と聞く', 2.8], [9.8, '足軽', '……上田の城は小さいと聞いたが', 2]],
  },
  // 佐和山（52）：関ヶ原の勝ちの後、首実検があり、家康は三成の佐和山へ兵を向けた（A）
  k07_sawayama: {
    scn: 'tokugawa', sec: 12, lead: { name: '小早川秀秋', n: 3, flag: 'sashi:kobayakawa:#ece6d6:#16140f' },
    lines: [[0, '使番', '内府様、首実検を終えられ、すぐ佐和山へ向かえとの御下知！', 3.2], [3.8, '組頭', '休む間もないのう。治部の城を落とすまでが関ヶ原じゃ', 3],
      [7.4, '組の者', '先手は小早川様の手じゃ。昨日まで西にいた衆が……', 2.8], [10.2, '足軽', '勝ったら、終わりではないのか', 1.8]],
  },
  // 冬の陣の前（53）：真田信繁が九度山を出て大坂城に入った（A）。徳川方は噂で知る
  k08_osaka_kizu: {
    scn: 'tokugawa', sec: 12, lead: { name: '蜂須賀至鎮', n: 3, flag: 'hachisuka' },
    lines: [[0, '使番', '九度山の真田左衛門佐、大坂の城へ入ったとの由', 2.8], [3.4, '組頭', '浪人が十万も集まっておるそうな', 2.6],
      [6.4, '組の者', '関ヶ原から十四年。また大坂で戦か', 2.6], [9.4, '足軽', '真田……上田で秀忠様の手を止めた家じゃな', 2.4]],
  },
  // 長篠編の鳶ヶ巣山（要件書33・65の5）：酒井忠次の別働隊が夜のうちに山を越えた。信長の鉄砲五百が付いた（信長公記＝A）。
  //   軍議で信長が酒井の策を一度叱りつけた話は伝え（C）なので「と聞く」。柵の戦とは別の作戦が同時に動く
  tobinosu: {
    scn: 'nagashino', sec: 12, time: 'night', lead: { name: '酒井忠次', n: 4, flag: 'tokugawa' },
    lines: [[0, '使番', '酒井様の手、今夜のうちに山を越えて、鳶ヶ巣山へ回る', 3], [3.6, '組頭', '上様の鉄砲五百も付くそうな。声を立てるな', 3],
      [7, '組の者', '軍議では、上様が酒井様の策を一度叱りつけられた、と聞く', 3], [10.2, '足軽', '設楽原の柵とは別に、もう一つ戦が動くのか', 2]],
  },
  // もしもの戦の前（要件書30）：主人公自身が上座に座る軍議。史実ではない（IF）と分かるよう、言葉は「もしも」の戦の中だけに置く
  k16_secret: {
    scn: 'tokugawa', sec: 12,
    lines: (rt) => [[0, '家老', `${rt.G.name || '殿'}様、諸将が揃いました。御下知を`, 3], [3.6, '侍大将', '淀の野で、敵の本隊を待ち受けまする', 2.8],
      [7, '家老', 'この戦の勝ち負けは、殿の一言で決まりまする', 2.8], [10.2, '足軽', '（あの足軽が、軍議の上座におられる）', 2]],
  },
};

export function departScene(rt, done) {
  const gate = rt.flags.doors && rt.flags.doors.gate;
  if (!gate || SETTINGS.reduceMotion || rt.flags.departing) { done(); return; }
  const rank = rt.G.rank || 0;
  const n = Math.min(14, 4 + rank * 2);
  // 列の旗はその章の家の旗（豊臣編・徳川編で永楽銭を出さない。K360③）
  const fac = (scenario() || {}).mon || (scenario() || {}).faction || 'oda';
  const list = [{ type: 'ashigaru', n, o: { invuln: true, flag: fac } }];
  // 兵だけの列にしない（要件書57・59）：どの身分の出陣にも、米と武具を担ぐ人足が付く
  list.push({ type: 'porter', n: rank >= 1 ? 3 : 2, o: { invuln: true, weapon: 'none', name: '荷駄' } });
  if (rank >= 3) list.push({ type: 'cavalry', n: 2, o: { invuln: true, name: '騎馬の供' } });
  const p = rt.player;
  // 主人公は門の内、列の後ろに。門の方を向く
  const px = gate.x - 2.5, pz = gate.z + 16;
  p.u.pos.set(px, rt.world.heightAt(px, pz), pz);
  p.u.heading = Math.PI; p.yaw = Math.PI; p.camYawOff = 0;
  if (p.u.mesh) p.u.mesh.position.copy(p.u.pos);
  // 見える所に湧かせない見張り（spawnGuard）は戦の新手のため。出陣の列は主人公の目の前に集まる場面なので、この時だけ外す
  const guard = rt.army.spawnGuard; rt.army.spawnGuard = null;
  let g;
  try {
  g = allyGroup(rt, { name: '出陣の兵', anchor: { x: gate.x + 1, z: gate.z + 10 }, facing: Math.PI, order: 'move', dest: { x: gate.x, z: gate.z - 30 },
    noRout: true, width: 3, speed: 1.2, march: true, aggro: 0, seekRange: 0, fixed: true }, list);
  } finally { rt.army.spawnGuard = guard; }
  const D = rt.flags.departing = { g, t: 0, done, ended: false };
  // 門の内の見送りの町の人（town_events の見送り・凱旋の四人）は、主人公の立つ所に並んでいた。列の通る道の両脇へ寄せ、道を向かせる（K364）
  try {
    const cur = rt.flags.ev && rt.flags.ev.cur;
    if (cur && cur.cast) cur.cast.forEach((P, i) => {
      const sx = i % 2 ? 1 : -1, x = gate.x + sx * 6.5, z = gate.z + 8 + Math.floor(i / 2) * 2.2;
      unpark(P, { x, z }, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (P.u && P.u.mesh) P.u.mesh.position.y = rt.world.heightAt(x, z);
      P.u.pos.y = rt.world.heightAt(x, z);
    });
  } catch (e) { /* 見送りが無い時はそのまま */ }
  // 門前の町の人（town3d の folk）と捕り方も、列の通る道（門の幅）から脇へ寄せる。主人公の目の前を塞がない
  try {
    const pz = gate.z + 16, side = (x) => (x >= gate.x ? 1 : -1);
    for (const P of rt.flags.folk || []) {
      const u = P.u; if (!u || !u.alive) continue;
      if (Math.abs(u.pos.x - gate.x) < 4.5 && u.pos.z > gate.z - 26 && u.pos.z < pz + 8) {
        const x = gate.x + side(u.pos.x) * (6 + Math.random()), z = u.pos.z;
        u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos);
        u.heading = side(u.pos.x) > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (P.g) { P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x, z }; P.g.facing = u.heading; }
      }
    }
    (rt.flags.guards || []).forEach((q, i) => {
      const x = gate.x + (i % 2 ? 1 : -1) * (4.2 + i * 0.6), z = gate.z + 2;
      q.anchor = { x, z }; q.dest = { x, z };
      if (q.u) { q.u.pos.set(x, rt.world.heightAt(x, z), z); q.u.mesh?.position.copy(q.u.pos); }
      if (q.g) { q.g.order = 'hold'; q.g.dest = null; q.g.anchor = { x, z }; }
    });
  } catch (e) { /* 町の人がいない時はそのまま */ }
  const next = BATTLES[rt.G.battle], X0 = next && SORTIE[next.id], X = X0 && (X0.scn || 'oda') === scenarioKey() ? X0 : null;
  if (X) {
    if (X.time) { try { rt.world.dayClock = null; rt.world.setTime(X.time, true); } catch (e) { /* 今の刻のまま */ } }
    if (X.rain && rt.world.setRainTarget) { rt.world.setRainTarget(X.rain); rt.world.rainLevel = X.rain; }
    // 大将が先に、わずかな騎馬で門を駆け出す。兵はその後を追う
    if (X.lead) {
      const guard2 = rt.army.spawnGuard; rt.army.spawnGuard = null;
      try {
        const L = allyGroup(rt, { name: X.lead.name, noRetinue: true, anchor: { x: gate.x, z: gate.z - 2 }, facing: Math.PI, order: 'move', dest: { x: gate.x, z: gate.z - 60 },
          noRout: true, width: 1, formation: 'column', speed: 4.2, aggro: 0, seekRange: 0, fixed: true },
          [{ type: 'busho', n: 1, o: { name: X.lead.name, invuln: true, horse: X.lead.horse !== false, flag: X.lead.flag || 'oda' } },
            X.lead.horse === false ? { type: 'samurai', n: X.lead.n, o: { invuln: true, flag: X.lead.flag || 'oda' } } : { type: 'cavalry', n: X.lead.n, o: { invuln: true, flag: X.lead.flag || 'oda' } },
            ...(X.lead.porters ? [{ type: 'porter', n: X.lead.porters, o: { invuln: true, weapon: 'none' } }] : [])]);
        if (X.lead.horse === false) L.speed = 1.6;
        D.lead = L;
      } catch (e) { /* 騎馬なしでも進む */ } finally { rt.army.spawnGuard = guard2; }
    }
    for (const [t, who, text, sec] of (typeof X.lines === 'function' ? X.lines(rt) : X.lines)) rt.after(t, () => { if (!D.ended) rt.say(who, text, sec); });
    rt.after(X.sec, () => fadeOut(D));
    return D;
  }
  rt.say('町の人', rank >= 4 ? 'お殿様の御出陣じゃ。道を開けい' : '御出陣じゃ！　ご武運を', 3);
  rt.after(2.4, () => rt.say('組の者', '門を出るぞ。遅れるな', 2.5));
  rt.after(5.2, () => fadeOut(D));
  return D;
}

// 毎コマ：主人公も列の後ろについて門へ歩く（鍵盤の入力は使わない）
export function departTick(rt, dt) {
  const D = rt.flags.departing;
  if (!D || D.ended) return;
  D.t += dt;
  const p = rt.player, gate = rt.flags.doors.gate;
  const dx = gate.x - p.u.pos.x, dz = gate.z - 2 - p.u.pos.z, d = Math.hypot(dx, dz);
  if (D.t > 1.2 && d > 1) {
    const s = Math.min(d, 2.2 * dt);
    p.u.pos.x += dx / d * s; p.u.pos.z += dz / d * s;
    p.u.pos.y = rt.world.heightAt(p.u.pos.x, p.u.pos.z);
    p.u.heading = Math.atan2(dx, dz);
  }
}

function fadeOut(D) {
  if (D.ended) return;
  D.ended = true;
  const f = document.createElement('div');
  f.id = 'depart-fade';
  f.style.cssText = 'position:fixed;inset:0;z-index:8999;background:#000;opacity:0;transition:opacity .7s;pointer-events:none';
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.opacity = '1'; });
  setTimeout(() => { try { D.done(); } finally { setTimeout(() => f.remove(), 400); } }, 800);
}
