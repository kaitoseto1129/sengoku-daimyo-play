// ======================================================================
// 陣中（遠征中の拠点）（K308 要件8〜11・95）
// 遠征の途中で次の戦へ続く時は、本拠地の城下へ戻さず、陣中に戻る。城下より小さく簡素：
//   本陣の幕（軍議）・武具の修理・組の者・馬・戦の様子・出陣の口だけ。字は出さず、言葉は台詞で。
// どの戦の前が陣中かは「次の戦の id」で引く（state.js の ODA_LINE。直前の戦と同じ遠征の続きだけ）。
// ======================================================================
import * as THREE from 'three';
import { jinmaku, kagaribi, hut, nobori, umatsunagi, kabukimon, dobei, yaguramon, sumiyagura, umajirushi, hatazao, hyoro, yagura, palisade, dorui, scaffold, lumber, tawara, shogi, takataba, campfire, nabe } from './props.js';
import { allyGroup, enemyGroup } from './bhelp.js';
import { BATTLES, scenarioKey, ladderStep } from './state.js';
import { seasonOf } from './oda_town.js';
import { townTabOpen } from './town_unlock.js';
import { buildRoom } from './interior_parts.js';
import { kokuraDef } from './town_kokura.js';
import { rippleWater } from './world_water.js';
import { liteMat } from './world_vegetation_materials.js';

// 次の戦の id → 陣中。prev は直前の戦（この戦から続く時だけ陣中にする）
export const JINCHU = {
  shiga: { prev: 'nodafukushima', place: '摂津 天満の陣中', news: '浅井と朝倉が坂本へ出たそうな。宇佐山の森様が危ない。殿は近江へ引き返される' },
  odani: { prev: 'tonezaka', place: '近江 虎御前山の陣中', news: '朝倉は越前で滅んだ。次は小谷の浅井じゃ。この山から城がよう見える' },
  echizen_ikko: { prev: 'echizen', place: '越前 府中の陣中', news: '木ノ芽峠は抜けた。一揆の残りは山の寺へ逃げ込んだそうな' },
  tano: { prev: 'takato', place: '信濃 高遠の陣中', news: '高遠は落ちた。勝頼は新府の城を焼いて、東へ逃げたそうな' },
  // K364 ③（drama_req_1117 14〜18）：官兵衛が有岡へ使いに出て戻らない（三木の前・平井山）／土牢から戻った官兵衛の変わった姿（鳥取の前・太閤ヶ平）
  miki: { prev: 'kizugawa', place: '播磨 平井山の陣中', when: '天正六年十月', drama: 'kanbeiGo', news: '三木の城は別所が固めておる。摂津の荒木様の様子がおかしいそうな' },
  tottori: { prev: 'iga', place: '因幡 太閤ヶ平の陣中', drama: 'kanbeiBack', news: '鳥取の城のまわりの米は、先に高う買い占めたそうな' },
  // K364 要件書60（茶の湯は政治の場）：小田原攻めの本陣（早雲寺）。誰が呼ばれ、誰が呼ばれないか
  t12_odawara: { scn: 'toyotomi', prev: 't11_hachioji', place: '相模 早雲寺の本陣', when: '天正十八年', drama: 'chanoyu', news: '北条の城は三月囲んでも落ちぬ。殿下は茶を点てて待っておられる' },
  // K364 ②（docs/specs/drama_req_1117.md 19〜23）：山崎の後、すぐ賤ヶ岳へ飛ばさず清洲城の評定（清洲会議）。身分で見え方が違う
  // K364⑤ 要件書65-17 九州征伐の海上輸送（iMac n-tennoji）：戸次川の後、岩石城の前に豊前 小倉の湊（船に兵と荷を積む。歩ける場。中身は town_kokura.js）
  t07_ganjaku: { scn: 'toyotomi', prev: 't06_hetsugi', place: '豊前 小倉の湊', when: '天正十五年三月', drama: 'kokura', news: '関白様は赤間関から小倉へ渡られた。九州の最初は岩石の城じゃ' },
  // K364（drama_req 27・54）：冬の陣の和議の後、徳川方の手で大坂の堀が埋められていくのを、堀の縁を歩いて見る（樫井の前・真田丸の後）
  // K364（drama_req 43）：小牧・長久手の前。戦場の前に、書状と使者で諸将の去就が動く。祐筆が書状を書き、使者が出て行き、来る
  t03_komaki: { scn: 'toyotomi', prev: 't02_shizugatake', place: '近江 坂本の羽柴の本陣', when: '天正十二年三月', drama: 'komakiJin', skip: { stable: true, idlers: true, eastHut: true },
    news: '信雄様が家老三人を斬り、徳川殿と結ばれたそうな',
    tips: ['小牧・長久手の前、秀吉と家康は書状で諸将を味方に誘い合いました。', '池田恒興は秀吉方に付き、犬山城を取りました。'] },
  // K364（drama_req 48）：石垣山の築城。忍城の後、小田原を見下ろす笠懸山の普請場。石を積む人足・修羅で石を曳く・木を伐る大工・白い紙を張った塀・眼下の小田原城
  t11_hachioji: { scn: 'toyotomi', prev: 't10_oshi', place: '相模 笠懸山（石垣山）の普請場', when: '天正十八年六月', drama: 'ishigaki',
    news: '北の国の衆（前田様・上杉様）は、八王子の城へ向かわれるそうな',
    tips: ['秀吉は小田原城を見下ろす笠懸山に、石垣の城を築きました。', '石垣山城は、関東で初めての総石垣の城と言われます。'] },
  // K364（drama_req 50）：杭瀬川の前。美濃赤坂の岡山の陣。北に杭瀬川、その向こうの田と大垣の城。家康が着き、金の扇の馬印が上がる
  k04_kuisegawa: { scn: 'tokugawa', prev: 'k03_gifu', place: '美濃 赤坂 岡山の陣', when: '慶長五年九月十四日', drama: 'akasakaJin',
    news: '大垣の城に石田治部が籠もっておる。川向こうの田で、石田の兵が稲を刈っておるそうな',
    tips: ['九月十四日、家康は美濃赤坂の岡山に着陣し、金の扇の馬印を上げました。', '家康の着陣に、大垣城の西軍は驚いたと伝わります。'] },
  // K364（drama_req 50）：岐阜城の前。河田で木曽川を渡った夜の東軍の陣。北に岐阜の城（金華山）。江戸の家康から書状が届き、諸将の去就が語られる
  k03_gifu: { scn: 'tokugawa', prev: 'k02_kawada', place: '美濃 木曽川の北岸の陣', when: '慶長五年八月二十二日', drama: 'kawadaJin', skip: { westHut: true },
    news: '岐阜の城主は織田秀信様。信長公の孫御じゃが、石田方に付かれた',
    tips: ['八月二十二日、東軍は木曽川を渡り、翌日に岐阜城を攻めました。', '岐阜城の城主は、信長の孫の織田秀信でした。'] },
  // K364（drama_req 28・65-3）：金ヶ崎前。手筒山・金ヶ崎を落とした勝ち戦の陣中に、浅井離反の急報が届き、軍議で「退く」と決まる
  kanegasaki: { prev: 'okawachi', place: '越前 敦賀 金ヶ崎の陣中', when: '元亀元年四月', drama: 'kanegasakiJin',
    news: '手筒山の城は一日で落ちた。金ヶ崎の城も明け渡したそうな',
    tips: ['金ヶ崎の前に、信長は手筒山城と金ヶ崎城を落としていました。', '浅井長政は信長の妹お市の夫でした。'] },
  // K364（drama_req 56・65-29）：天王寺・岡山の朝、平野の徳川本陣。使番が駆け込み、金の扇の馬印の下で下知を待つ。荷駄が米を運び、鉄砲衆が火縄を整える
  k15_tennoji_okayama: { scn: 'tokugawa', prev: 'k14_yao_wakae', place: '摂津 平野の徳川本陣', when: '慶長二十年五月七日', drama: 'hirano',
    news: '真田は茶臼山、毛利は天王寺の南に陣を据えたそうな',
    tips: ['五月七日、家康は天王寺口、秀忠は岡山口を受け持ちました。', '真田信繁は茶臼山に陣を据えて待ち受けました。'] },
  k12_kashii: { scn: 'tokugawa', prev: 'k11_sanadamaru', place: '摂津 大坂 惣構えの外', when: '慶長二十年一月', drama: 'horiume',
    news: '冬の和議が成った。堀を埋めたら、兵の多くは国へ戻される、と聞く',
    tips: ['大坂の惣構えの堀は町も城も、囲む守りでした。', '和議の後、大坂の堀は徳川方が埋めました。'] },
  // K364（drama_req 33・65-4〜5）：長篠の戦の前夜の軍議。酒井忠次の鳶ヶ巣山の策と、信長の叱りと内々の許し。徳川の足軽は幕の外で待つ
  tobinosu: { scn: 'nagashino', prev: 'sune', place: '三河 極楽寺山の御本陣', when: '天正三年五月二十日 夜', drama: 'gokurakuji',
    news: '武田は寒狭川を渡って、設楽原の東に陣を張ったそうな' },
  // K364（drama_req 36・65-6）：手取川の前、加賀の陣中。軍議で羽柴と柴田が言い争い、羽柴勢が夜のうちに陣を払って去る
  tedorigawa: { prev: 'saika', place: '加賀 北陸勢の陣中', when: '天正五年八月', drama: 'hokuriku',
    news: '上杉が能登の七尾の城を囲んでおる。城の中で、もう内輪揉めが起きておるそうな' },
  // K364（drama_req 43・65-16）：小牧で一月にらみ合った後、楽田の羽柴本陣で三河への中入りが決まる（長久手の前）
  t03b_nagakute: { scn: 'toyotomi', prev: 't03_komaki', place: '尾張 楽田の羽柴本陣', when: '天正十二年四月六日', drama: 'nakairi',
    news: '徳川の殿は小牧山の砦に籠ったまま、動かれぬそうな' },
  // K364（drama_req 46・65-18）：戸次川の前、鶴賀城を救う陣の軍議。待てと命じられているのに、軍監の仙石秀久が川を渡ると言い張る
  // K364（drama_req 57 兵站・67 次の戦の意味）：忍城の前、開いたばかりの館林の城下の陣。草鞋と兵糧を配り、幕の内で三成・大谷・長束が忍の攻め方を話す
  t10_oshi: { scn: 'toyotomi', prev: 't09_yamanaka', place: '上野 館林の陣', when: '天正十八年六月', drama: 'tatebayashi',
    news: '館林の城は、囲んで数日で開いたそうな。次の忍の城は、沼の中に浮いて見えると聞く' },
  // K364（drama_req 57 兵站の火縄・67）：根来寺の前、焼け落ちた千石堀の城を見る陣。火縄を竿に掛けて乾かし、幕の内で秀次・堀・筒井が根来への寄せ方を話す
  t04_negoro: { scn: 'toyotomi', prev: 't04a_sengokubori', place: '和泉 千石堀の陣', when: '天正十三年三月二十二日', drama: 'sengokuJin',
    news: '千石堀の城は、玉薬の蔵に火が入って、城ごと燃えたそうな' },
  // K364（drama_req 57 兵站の馬・普請・67）：根白坂の夜討ちの前、宮部継潤の砦の普請場。塀の板を運び、馬に飼い葉。幕の内で後詰の約束が揺らぐ
  t08_nejirozaka: { scn: 'toyotomi', prev: 't07_ganjaku', place: '日向 根白坂の砦の普請場', when: '天正十五年四月', drama: 'nejiroJin',
    news: '大納言様の大軍が、高城を囲んだ。島津は城を救いに、必ずこの坂へ来ると聞く' },
  // K364（drama_req 57 兵站の食事・67）：道明寺の前の夜、大和口の先手の陣。夜明けに国分の山を抜ける前に握り飯を配り、幕の内で水野・本多・伊達が先を話す
  k13_domyoji: { scn: 'tokugawa', prev: 'k12_kashii', place: '大和 国分の手前の陣', when: '慶長二十年五月五日 夜', drama: 'kokubuJin',
    news: '樫井では、塙団右衛門が討たれたそうな。大坂方は、残る兵で打って出るしかないと聞く' },
  // K364（drama_req 57 兵站・67）：今福の前の朝、佐竹の陣。冬の寒さに焚き火で手を温め、竹束をそろえる。幕の内で義宣・渋江・梅津が堤の攻め方を話す
  k09_imafuku: { scn: 'tokugawa', prev: 'k08_osaka_kizu', place: '摂津 今福の東の佐竹の陣', when: '慶長十九年十一月二十六日 朝', drama: 'imafukuJin',
    news: '木津川口の砦は、蜂須賀様の手が取ったそうな。次は城の北東、今福の堤じゃと聞く' },
  // K364（drama_req 57 兵站・67）：根来の後、雑賀の者が太田の城に籠った。陣の口で人夫を雇う米と土俵、幕の内で秀吉・秀長・中村が力攻めを避ける話
  t04b_ota: { scn: 'toyotomi', prev: 't04_negoro', place: '紀伊 太田の城を望む陣', when: '天正十三年三月', drama: 'otaJin',
    news: '根来の寺は焼けた。雑賀の者どもは、太田の城に籠ったそうな' },
  // K364（司令塔 11/19「出立のみの鴫野・八尾若江・真田にも陣中」）：三つとも前の戦と同じ日・同じ頃なので、日付を言わず「夜明け前」「朝」「前の夜」で置く
  //   鴫野：上杉の陣、夜明け前。大鍋の粥で体を温め（要件書57 兵站の食事）、幕の内で景勝・直江・須田が堤の三重の柵を話す
  k10_shigino: { scn: 'tokugawa', prev: 'k09_imafuku', place: '摂津 鴫野の東の上杉の陣', when: '慶長十九年十一月 夜明け前', drama: 'shiginoJin', mon: 'uesugi',
    news: '鴫野の堤には、柵が三重に立っておるそうな' },
  //   八尾若江：井伊の陣、朝。槍の穂先を研ぎ（要件書57 兵站の鍛冶）、幕の内で直孝・川手・庵原が若江の木村勢を話す
  k14_yao_wakae: { scn: 'tokugawa', prev: 'k13_domyoji', place: '河内 若江の東の井伊の陣', when: '慶長二十年五月六日 朝', drama: 'wakaeJin', mon: 'ii',
    news: '南の道明寺の方から、鉄砲の音が絶えぬそうな' },
  //   番外 真田：茶臼山の真田の陣、前の夜。赤い具足の紐を締め直し（要件書57 兵站）、幕の内で信繁・大助・毛利勝永が明日を話す
  x15_sanada: { scn: 'tokugawa', prev: 'k17_shuumaku', place: '摂津 茶臼山の真田の陣', when: '慶長二十年五月六日 夜', drama: 'chausuJin', mon: 'sanada',
    news: '今日、道明寺で後藤又兵衛様が、若江で木村重成様が討たれたそうな' },
  t06_hetsugi: { scn: 'toyotomi', prev: 't05_ichinomiya', place: '豊後 戸次川の東の陣', when: '天正十四年十二月十二日', drama: 'heshigawa',
    news: '島津の大軍が鶴賀の城を囲んでおる。城はもう長くは持たぬそうな' },
  // K364（drama_req 52・65-23）：関ヶ原の後、藤川台の家康本陣。首実検の幕の外で待ち、佐和山への下知を聞く
  k07_sawayama: { scn: 'tokugawa', prev: 'k06_sekigahara', place: '美濃 藤川台の御本陣', when: '慶長五年九月十五日 夕', drama: 'fujikawa',
    news: '治部少輔は伊吹の山へ逃げたそうな。島津は東軍の真ん中を破って、南へ抜けたと聞く' },
  t02_shizugatake: { scn: 'toyotomi', prev: 't01_yamazaki', place: '尾張 清洲城', when: '天正十年六月二十七日', drama: 'kiyosu',
    news: '柴田様は越前へ戻られた。長浜の城は柴田様の甥御、勝豊様の手に渡ったそうな' },
  // K364 要件書65-25（真田丸の築造・軍議。11/18 iMac n-nagashino）：鴫野から続く平野の陣。陣の北の野の向こうで、真田が出丸を普請しているのが見える
  k11_sanadamaru: { scn: 'tokugawa', prev: 'k10_shigino', place: '摂津 平野の陣', when: '慶長十九年十一月', drama: 'sanadamaru',
    news: '真田の出丸の前の篠山に、真田の鉄砲が籠もっておる。夜も昼も撃ちかけてくるそうな' },
};

// 今の保存で、次に向かう戦の前が陣中ならその中身。そうでなければ null
export function jinchuOf(G) {
  if (!G) return null;
  const next = BATTLES[G.battle], prev = BATTLES[(G.battle || 0) - 1];
  const J = next && JINCHU[next.id];
  if (!J || (J.scn || 'oda') !== scenarioKey() || !prev || prev.id !== J.prev) return null;
  return { ...J, id: next.id, when: J.when || next.year || '' };
}

const SPOT = {
  boss: { x: 0, z: 6, n: '軍議の幕' }, shop: { x: -17, z: -3, n: '武具の修理場' }, squad: { x: 17, z: -3, n: '組の陣小屋' },
  stable: { x: 19, z: 12, n: '馬つなぎ' }, gate: { x: 0, z: -27, n: '出陣の口' },
};

// 真田丸の普請場（陣の北の野の向こうの坂）：出丸の真ん中・柵の半径・空堀の半径・物見の土手
const SM = { c: { x: 0, z: 74 }, wall: 15, moat: 19, look: { x: -9, z: 24 } };
// 空堀：出丸の南の半月の外を、幅三m・深さ二m余り窪ませる（西から掘り進め、東の端はまだ浅い）
function smKarabori(x, z) {
  const dx = x - SM.c.x, dz = z - SM.c.z, r = Math.hypot(dx, dz);
  if (dz > 2) return 0;
  const a = Math.atan2(dx, -dz), band = 1 - Math.min(1, Math.abs(r - SM.moat) / 1.8);
  if (band <= 0 || Math.abs(a) > 1.4) return 0;
  const dug = a < 0.5 ? 1 : Math.max(0.25, 1 - (a - 0.5) * 0.9);
  return -2.3 * band * band * (3 - 2 * band) * dug;
}

// 金ヶ崎の城の丘：北西の奥（-12, 50）に高さ十三メートルのなだらかな丘
const KANE_HILL = { x: -12, z: 50, r: 20, h: 13 };   // 陣の幕から四十メートルほど奥の、高い丘
function kaneHill(x, z) { const d = Math.hypot(x - KANE_HILL.x, z - KANE_HILL.z) / KANE_HILL.r; return d >= 1 ? 0 : KANE_HILL.h * (1 - d * d) * (1 - d * d); }
const jinBase = (x, z) => 0.5 * Math.sin(x * 0.031) + 0.4 * Math.cos(z * 0.027) + Math.max(0, z - 30) * 0.12;
// 堀（horiume）：陣の北、z 22 を中に幅六メートル・深さ二・四メートルの東西の溝（x −30〜30）。縁はなだらかに
const HORI = { z: 22, half: 3, x0: -30, x1: 30, depth: 2.4, segs: 8 };
export function jinchuDef(game, J) {
  const season = seasonOf(J.when);
  const def = {
    town: true, jinchu: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    nameTagFontSize: 15,   // 陣中の名の札は戦の中の小さい札と同じ大きさに（K364）
    nameTagCompact: true,   // 陣中は人が近いので、札を細い縁の小さな札にし、近くで大きくしない（K364）
    tips: J.tips,   // 町に入って二十二秒の「戦の心得・豆知識」をその場に合う物から選ぶ（main.js）
    title: J.place, info: { place: J.place, when: J.when }, year: Number((J.when.match(/\d{4}/) || [])[0] || 0), faction: 'oda',
    place: J.place, when: J.when, season,
    spawn: { x: 0, z: -21, heading: 0 },
    world: {
      seed: 1570 + J.id.length, time: 'day', clearAir: true, mood: 'plain',
      height: (x, z) => jinBase(x, z) - (J.drama === 'komakiJin' ? Math.max(0, x - 23) * 0.42 : 0) + (J.drama === 'kanegasakiJin' ? kaneHill(x, z) : 0) - (J.drama === 'ishigaki' ? Math.max(0, z - 27) * 0.62 + Math.max(0, z - 27) ** 2 * 0.004 : 0) + (J.drama === 'sanadamaru' ? smKarabori(x, z) : 0),   // 石垣山は北へ下る山の肩（眼下に小田原）   // 金ヶ崎は落とした城の丘を北西に
      // 河田の陣は西の縁に木曽川を流す（渡ったばかりの川。陣の口の左に見える）
      ...(J.drama === 'komakiJin' ? { water: { x: 26.5, level: -1.1, lake: true } } : {}),   // 坂本：陣の東は琵琶湖（湖畔は浅く下る）
      ...(J.drama === 'akasakaJin' ? { streams: [{ pts: [[-44, 27], [-10, 29], [20, 27.5], [44, 29]], w: 4, depth: 1.1 }] } : {}),
      ...(J.drama === 'kawadaJin' ? { streams: [{ pts: [[-27, -44], [-25, -10], [-26.5, 20], [-25, 44]], w: 4.5, depth: 1.2 }] } : {}),
      // 堀は他の戦の川・堀と同じ作り（world の streams：溝を掘り、水面・流れ・縁の斜めを描く。道明寺の石川と同じ）
      ...(J.drama === 'horiume' ? { streams: [{ pts: [[HORI.x0 - 3, HORI.z], [HORI.x1 + 3, HORI.z]], w: HORI.half + 0.4, depth: HORI.depth, still: true, plainWater: true }] } : {}),
      // 金ヶ崎は城の丘の斜面に木を残し（裸の円い山に見えないよう）、頂の城の所だけ空ける
      clear: (x, z) => J.drama === 'komakiJin' && x > 20 && Math.abs(z) < 80 || J.drama === 'ishigaki' && Math.abs(x) < 16 && z < 90 || J.drama === 'kanegasakiJin' && Math.hypot(x - KANE_HILL.x, z - KANE_HILL.z) < 9 || Math.abs(x) < 32 && z > -34 && z < (J.drama === 'horiume' || J.drama === 'kawadaJin' || J.drama === 'akasakaJin' ? 34 : 26) || J.drama === 'sanadamaru' && Math.abs(x) < 42 && z >= 26 && z < 92,
      // 堀の場は散らす岩を置かない（溝の斜面で灰色の角ばった岩が宙に浮いて見えた）
      trees: 160, tufts: 1800, rocks: J.drama === 'horiume' ? 0 : 40, paths: [[[0, -40], [0, 2]]],
      autumn: season === '秋', winter: season === '冬', young: season === '春' || season === '夏', muddy: 0.25,
      groves: [[-60, 30, 24], [60, 34, 26], [-55, -40, 20], [58, -36, 20]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
    },
    setup(rt) {
      // 陣中には戦が無いので血の跡を置かない（11/18：支度の中で原点の手前に血だまりが二枚置かれ、主人公が近づくと赤い染みに見えた）
      rt.army.hideBlood = true;
      for (const t of [0.2, 2, 6]) rt.after(t, () => { try { rt.army.disposeStains?.(); } catch (e) { /* 跡が無い時はそのまま */ } });
      (J.drama === 'kiyosu' ? buildKiyosu : buildJinchu)(rt, J); const dl = document.getElementById('dateline'); if (dl) dl.textContent = J.when; },
    update(rt, dt) { farFlagTick(rt, dt); if (J.drama === 'sanadamaru') { const F = rt.flags; F.smTick?.(); F.smBowT = (F.smBowT || 0) + dt; const on = Math.sin(F.smBowT * 1.6) > 0.2; for (const g of F.smSaku || []) for (const u of g.units) u._crouch = on; } if (J.drama === 'kiyosu') kiyosuTick(rt, dt); else if (J.drama === 'horiume') horiTick(rt, dt); else if (J.drama === 'hirano') hiranoTick(rt, dt); else if (J.drama === 'kanegasakiJin') kanegasakiTick(rt, dt); else if (J.drama === 'kawadaJin') kawadaTick(rt, dt); else if (J.drama === 'akasakaJin') akasakaTick(rt, dt); else if (J.drama === 'ishigaki') ishigakiTick(rt, dt); else if (J.drama === 'komakiJin') komakiTick(rt, dt); },
    guideTo(rt, tab) {
      const s = SPOT[tab === 'nagaya' ? 'squad' : tab] || SPOT.boss;
      rt.marker('mk-go', { x: s.x, z: s.z }, '');   // 陣中の印は字を出さない（K364・印の形だけ）
      rt.bark(`${s.n}へ。小さな地図の印をたどる`);
    },
    onResume() {},
  };
  if (J.drama === 'kokura') return kokuraDef(game, J, def);   // K364⑤ 65-17 小倉の湊（town_kokura.js が湊の地形・船・荷の行き来に置き換える）
  return def;
}

function buildJinchu(rt, J) {
  const W = rt.world, game = rt.game, G = rt.G;
  // 軍議の幕（本陣）：幕で囲い、南に口。中に上役。印の名に「本陣」を使うと画面で「守る場所」に読み替わるので「軍議の幕」
  const MON = J.mon || (J.scn === 'toyotomi' ? 'toyotomi' : (J.scn === 'tokugawa' || J.scn === 'nagashino') ? 'tokugawa' : 'oda');   // 長篠編は徳川の足軽   // 豊臣編・徳川編の陣中に織田の紋を出さない（K360③）
  rt.scene.add(jinmaku(W, 0, 10, 18, 12, 6, { mon: MON, gapNorth: 6 }));   // K364：前（陣の口の側）にも口を開け、幕の内の上役と軍議が見えるように
  // 11/19 k365-cloud-18：篝火の籠だけで炎（addFire）を灯しておらず、夜・夕の陣（国分・藤川台など）でも火が無かった。
  //   夜と夕だけ炎を出す（nightOnly：昼は消え、煙も出さない）。籠の照り（props の kagaPool）はこの炎に付く
  for (const [x, z] of [[-11, 2], [11, 2], [-11, 18], [11, 18], [-6, -12], [6, -12]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: 0.7, lightRadius: 14, nightOnly: true }); }
  for (const x of [-16, -11, -6, 6, 11, 16]) rt.scene.add(nobori(W, x, -9, MON, 5));
  // 陣小屋（板屋根の仮小屋）：西＝武具の修理場、東＝組の者
  if (!J.skip?.westHut) rt.scene.add(hut(W, -21, -3, 7, 4.5, Math.PI / 2, { ita: true }));   // 西に川を流す陣（河田）は西の小屋を置かない
  if (!J.skip?.eastHut) rt.scene.add(hut(W, 21, -3, 7, 4.5, -Math.PI / 2, { ita: true }));   // 東に湖を見せる陣（坂本）は東の小屋を置かない
  if (!J.skip?.stable) rt.scene.add(umatsunagi(W, 21, 12, Math.PI / 2, 8));   // 場ごとに外せる（K364：どの陣中も同じ並びに見えた）
  // 人：本陣の上役・修理の者・組の者・火の番
  const one = (name, x, z, facing, type = 'ashigaru', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name, flag: null, invuln: true, ...o } }]);
    return g.units[0];
  };
  const bossName = ((BATTLES[G.battle] || {}).boss || '').split(/\s/).pop() || '上役';
  // 軍議の場（下の COUNCIL）では幕の内に武将が床几で並ぶので、仮の上役は置かない（真ん中に立つ者が武将と重なった）
  const COUNCIL = ['gokurakuji', 'hokuriku', 'nakairi', 'heshigawa', 'fujikawa', 'tatebayashi', 'sengokuJin', 'nejiroJin', 'kokubuJin', 'imafukuJin', 'otaJin', 'shiginoJin', 'wakaeJin', 'chausuJin'];
  if (!COUNCIL.includes(J.drama)) one(bossName, 0, 12, Math.PI, 'ashigaru', { weapon: 'none' });
  else councilTable(rt);
  one('具足師', -17, -1.5, -Math.PI / 2, 'porter', { weapon: 'none' });
  if (!J.skip?.idlers) {
    for (let i = 0; i < 3; i++) one('組の者', 15.5 + (i % 2) * 1.4, -5 + i * 1.6, Math.PI / 2 + (i - 1) * 0.4, 'ashigaru', { hat: i % 2 ? 'hachimaki' : 'none' });
    for (const [x, z, f] of [[-9.5, 1, 0.8], [-12.5, 3, -2.2], [9.6, 1.2, -0.8], [12.4, 3.1, 2.3], [-5, -13.5, 0.4], [7.5, -13.8, -0.6]]) one('足軽', x, z, f, 'ashigaru', { weapon: 'none' });
  }
  // 用：軍議・修理・組・馬・戦の様子・出陣
  // 武将との距離（要件書63・64）：足軽までは軍議の幕に入れず、外で待たされ、下知は組頭から聞く。足軽大将候補より上は末席に入る
  const lowRank = ladderStep(G || {}) < 2;
  rt.addInteract('jin-boss', SPOT.boss, lowRank ? `待つ　${SPOT.boss.n}の外で` : `軍議に出る　${SPOT.boss.n}`, () => {
    const F = rt.flags;
    if (!lowRank || F.bossWaited) { game.townOpen('boss'); return; }
    F.bossWaited = true;
    rt.say('番の侍', '控えよ。御大将方の話が済むまで、幕の外で待て', 3.4);
    rt.after(5, () => { if (rt.flags === F) rt.say('組頭', '済んだようじゃ。下知は、わしから伝える', 3); });
    rt.after(7.5, () => { if (rt.flags === F && !rt.over) game.townOpen('boss'); });
  }, { r: 3 });
  rt.addInteract('jin-shop', SPOT.shop, `直す　武具（${SPOT.shop.n}）`, () => game.townOpen('shop'), { r: 3 });
  rt.addInteract('jin-squad', SPOT.squad, '会う　組の者', () => townTabOpen(G, 'squad') ? game.townOpen('squad') : rt.say('組の者', '飯を食うたら、すぐ次じゃ。槍の穂先を研いでおくわい', 4), { r: 3 });
  // 兵站の暮らし（要件書57・66）：馬の給餌・休ませ・替え馬・斃れた馬、武具の繕い。見るたびに別の様子
  const UMA = [['馬方', '陣中の馬は御大将方のものじゃ。足軽は歩きよ'], ['馬方', '水と飼い葉が先じゃ。人より馬が先に飯を食う'],
    ['馬方', '脚を痛めた馬は替え馬と取り替える。替えの無い家は歩きよ'], ['馬方', '蹄が割れておる。藁の沓を履かせて休ませる'],
    ['足軽', '昨日の戦で斃れた馬じゃ。鞍だけは外して持って帰る']];
  if (!J.skip?.stable) rt.addInteract('jin-stable', SPOT.stable, '見る　馬', () => {
    const k = rt.flags.umaI = ((rt.flags.umaI ?? -1) + 1) % UMA.length;
    rt.say(UMA[k][0], UMA[k][1], 3.4);
    if (townTabOpen(G, 'stable')) { const F = rt.flags; rt.after(2.4, () => { if (rt.flags === F && !rt.over) game.townOpen('stable'); }); }
  }, { r: 3 });
  rt.addInteract('jin-news', { x: -6, z: -12 }, '聞く　戦の様子', () => rt.say('物見', J.news, 5), { r: 3 });
  // 陣中の小さな場面（要件書66）：火のそばで、聞くたびに別の話。十〜三十秒の暮らしを散らす
  const LIFE = [
    [['足軽', '城下には戻らん。ここで飯を食うて、このまま次の戦じゃ']],
    [['新参', '古参殿、槍はどこを突けばよいので'], ['古参', '腹より足じゃ。倒れたら、組の者が首を取る']],
    [['足軽', '在所の田は、もう稲刈りかのう'], ['組の者', '言うな。帰りとうなる']],
    [['鉄砲足軽', '火縄が湿った。火にかざして乾かしておる'], ['組頭', '玉薬の袋は火から離せ。陣ごと吹き飛ぶぞ']],
    [['足軽', '草鞋がもう三足目じゃ'], ['人足', '束で編んで持って来た。いくらでも履き潰せ']],
    [['組の者', '討たれた与吉の守り袋じゃ。在所の母者へ届けてやらねば'], ['組頭', '……わしが持って行こう']],
    [['足軽', '国から文が来た。字は読めんが、母者の手じゃ'], ['組の者', '読んでやる。……達者でおるとよ']],
    [['足軽', '明日の敵は、えらい数じゃと聞いたぞ'], ['組頭', '噂で槍は振れん。早う寝ろ']],
  ];
  rt.addInteract('jin-meal', { x: 6, z: -12 }, '聞く　火のそばの話', () => {
    const F = rt.flags, k = F.lifeI = ((F.lifeI ?? -1) + 1) % LIFE.length;
    LIFE[k].forEach(([who, text], i) => rt.after(i * 3.6, () => { if (rt.flags === F) rt.say(who, text, 3.4); }));
  }, { r: 3 });
  rt.addInteract('door-gate', SPOT.gate, '任務を受けて出陣する', () => game.townSortie(), { r: 3.5 });
  // 陣中の印は字を出さず、印の形だけ（11/18 長：「軍議の幕」の字が地面に浮いて見えた）
  rt.marker('mk-boss', SPOT.boss, '');
  rt.marker('mk-gate', SPOT.gate, '');
  rt.flags.doors = { boss: SPOT.boss, shop: SPOT.shop, squad: SPOT.squad, stable: SPOT.stable, gate: SPOT.gate };
  // 戦の後の酒（要件書61・64）：同じ勝ちでも、身分で見える所が違う。足軽までは篝火のそばで組の者と、足軽大将候補より上は幕の内の末席で
  const hi = !lowRank;
  rt.addInteract('jin-sake', hi ? { x: 4, z: 4 } : { x: 12, z: -12 }, hi ? '上がる　武将の席の末席' : '飲む　組の者と', () => {
    const L = hi ? [['上役', 'よう働いた。末席じゃが、盃を受けよ'], ['侍', '上座の方々の話には、口を挟むでないぞ']]
      : [['組の者', '勝ち戦の酒じゃ。濁り酒でも旨いわい'], ['足軽', '幕の内では、殿様方が上座で盃を回しておるそうな']];
    const k = rt.flags.sakeI = ((rt.flags.sakeI ?? -1) + 1) % L.length; rt.say(L[k][0], L[k][1], 4);
  }, { r: 3 });
  try { farCamp(rt, J); } catch (e) { /* 遠景の野営が作れない時も陣中は進む */ }
  if (J.drama && DRAMA[J.drama]) { DRAMA[J.drama](rt, J, one); return; }
  rt.after(1.5, () => rt.say('組頭', '城下には戻らぬ。ここが陣中じゃ。軍議の幕で次の下知を待て', 5));
}

// ======================================================================
// K364 ③ 黒田官兵衛と有岡城（drama_req_1117 14〜18）。主人公は若い兵として、出立を「普通の使い」と思って見送る。
//   帰らない日々・信長方の疑念は、使番・秀吉の様子・兵の噂で知る（神の目で有岡の中を見せない）。
//   史実の分け（docs/journey/miki.md・tottori.md の K364 の節）：村重の謀反・官兵衛が説きに有岡へ行き囚われた・一年後の落城で救われた・足が不自由になった は A。
//   言葉と見せ方は B。竹中半兵衛が松寿丸を匿った話は伝え（C）なので、兵の噂の形にとどめる。
// ======================================================================

// ======================================================================
// K364 要件書57〜59（兵站・大軍の見せ方・戦に出ない人々）：陣中ごとに違う小さな場を足す部品。
//   炊き出し（大鍋と握り飯）・鍛冶（金床と火床）・舟（荷を積んだ小舟）・商人の筵の店・荷車の列。どれも形だけで軽く、用で一言ずつ聞ける
// ======================================================================
function campKitchen(rt, one, x, z, lines) {
  const W = rt.world, F = rt.flags, gy = W.heightAt(x, z);
  try {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.3 }), stone = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1 });
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3, st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), stone); st.position.set(x + Math.cos(a) * 0.55, gy + 0.14, z + Math.sin(a) * 0.55); rt.scene.add(st); }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.55, 14, 1, true), iron); pot.position.set(x, gy + 0.6, z); rt.scene.add(pot);
    const gruel = new THREE.Mesh(new THREE.CircleGeometry(0.58, 14), new THREE.MeshStandardMaterial({ color: 0xe7dfc8, roughness: 0.6 })); gruel.rotation.x = -Math.PI / 2; gruel.position.set(x, gy + 0.82, z); rt.scene.add(gruel);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 7), new THREE.MeshBasicMaterial({ color: 0xff7a24, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); flame.position.set(x, gy + 0.24, z); rt.scene.add(flame);
    // 握り飯の盆
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: 0x6b5232, roughness: 0.9 })); tray.position.set(x + 1.5, gy + 0.5, z); rt.scene.add(tray);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.47, 0.6), new THREE.MeshStandardMaterial({ color: 0x4e3c27, roughness: 0.9 })); stand.position.set(x + 1.5, gy + 0.235, z); rt.scene.add(stand);
    const riceM = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.9 });
    for (let k = 0; k < 8; k++) { const r = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 3), riceM); r.position.set(x + 1.1 + (k % 4) * 0.25, gy + 0.59, z - 0.12 + Math.floor(k / 4) * 0.24); rt.scene.add(r); }
  } catch (e) { /* 形が作れない時も話は進む */ }
  one(null, x - 0.9, z + 0.2, Math.PI / 2, 'ashigaru', { weapon: 'none', hat: 'hachimaki' });   // 炊事の者
  for (let k = 0; k < 3; k++) one(null, x + 1.5 + 0.2 * k, z - 1.2 - k * 0.9, 0, 'ashigaru', { weapon: k === 1 ? 'yari' : 'none' });   // 並ぶ兵
  rt.addInteract('camp-kitchen-' + x, { x: x + 0.6, z: z - 1.4 }, '聞く　炊き出し', () => {
    const k = F.kitI = ((F.kitI ?? -1) + 1) % lines.length; rt.say(lines[k][0], lines[k][1], 3.6);
  }, { r: 2.4 });
}
function campSmithy(rt, one, x, z) {
  const W = rt.world, F = rt.flags, gy = W.heightAt(x, z);
  try {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2b29, roughness: 0.5, metalness: 0.4 }), clay = new THREE.MeshStandardMaterial({ color: 0x7a5a40, roughness: 1 }), wood = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 0.9 });
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.28), iron); anvil.position.set(x, gy + 0.5, z); rt.scene.add(anvil);
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 8), wood); block.position.set(x, gy + 0.2, z); rt.scene.add(block);
    const forge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), clay); forge.position.set(x - 1.3, gy + 0.35, z); rt.scene.add(forge);
    const ember = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.45), new THREE.MeshBasicMaterial({ color: 0xff6a1a })); ember.position.set(x - 1.3, gy + 0.72, z); rt.scene.add(ember);
    const bellows = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), wood); bellows.position.set(x - 2.3, gy + 0.23, z); rt.scene.add(bellows);
    // 直しを待つ槍（立て掛け）
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 5), wood); sp.position.set(x + 1.2 + k * 0.22, gy + 2.0, z + 0.9); sp.rotation.x = -0.22; rt.scene.add(sp); }
  } catch (e) { /* 形が作れない時も話は進む */ }
  one(null, x + 0.5, z - 0.1, -Math.PI / 2, 'ashigaru', { weapon: 'none', hat: 'hachimaki' });   // 鍛冶
  one(null, x - 2.3, z - 0.7, 0, 'ashigaru', { weapon: 'none', hat: 'none' });   // 鞴を踏む弟子
  rt.addInteract('camp-smithy-' + x, { x: x + 0.2, z: z - 1.3 }, '聞く　鍛冶', () => {
    const L = [['鍛冶', '穂先の欠けは打ち直す。柄の割れは、替えるしかない'], ['鍛冶', '昨日の戦で曲がった槍が、まだ二十本あるわい'], ['弟子', '鞴を止めると、火がすぐ冷める']];
    const k = F.smI = ((F.smI ?? -1) + 1) % L.length; rt.say(L[k][0], L[k][1], 3.6);
  }, { r: 2.4 });
}
function campBoat(rt, x, z, rot = 0, cargo = true) {
  const W = rt.world;
  try {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x6a5134, roughness: 0.9 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 5.2), wood); hull.position.y = 0.1; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4, 1), wood); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.35); bow.position.set(0, 0.1, 3.2); g.add(bow);
    if (cargo) { const straw = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 }); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.62, 10), straw); b.rotation.z = Math.PI / 2; b.position.set(0, 0.55 + (k > 2 ? 0.4 : 0), -1.4 + (k % 3) * 0.75); g.add(b); } }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5), wood); pole.position.set(0.6, 1.4, -2); pole.rotation.z = 0.35; g.add(pole);
    const dep = W.waterDepthAt ? W.waterDepthAt(x, z) : 0;   // 水面の高さ＝川底＋深さ
    const lake = W.def?.water?.level;   // 湖（world の water）は水面の高さが決まっている
    g.position.set(x, Math.max(W.heightAt(x, z) + Math.max(0, dep || 0), Number.isFinite(lake) ? lake : -Infinity) - 0.05, z); g.rotation.y = rot; rt.scene.add(g);
  } catch (e) { /* 形が作れない時も話は進む */ }
}
function campStall(rt, one, x, z, lines) {
  const W = rt.world, F = rt.flags, gy = W.heightAt(x, z);
  try {
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ color: 0x8c7a52, roughness: 1, side: THREE.DoubleSide })); mat.rotation.x = -Math.PI / 2; mat.position.set(x, gy + 0.03, z); rt.scene.add(mat);
    const straw = new THREE.MeshStandardMaterial({ color: 0xb59a5c, roughness: 1 }), fish = new THREE.MeshStandardMaterial({ color: 0x7d7466, roughness: 0.8 }), jar = new THREE.MeshStandardMaterial({ color: 0x5a3e2a, roughness: 0.7 });
    for (let k = 0; k < 6; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.26), straw); w.position.set(x - 0.9 + (k % 3) * 0.16, gy + 0.06 + Math.floor(k / 3) * 0.04, z - 0.3); rt.scene.add(w); }   // 草鞋
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.1), fish); f.position.set(x + 0.1, gy + 0.06, z - 0.4 + k * 0.18); rt.scene.add(f); }   // 干し魚
    for (let k = 0; k < 2; k++) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 10), jar); j.position.set(x + 0.8, gy + 0.18, z - 0.3 + k * 0.45); rt.scene.add(j); }   // 味噌の壺
  } catch (e) { /* 形が作れない時も話は進む */ }
  one(null, x, z + 1.0, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none', kosode: 1, kosodeCol: 0x4a5560, haori: null });   // 商人（小袖）
  rt.addInteract('camp-stall-' + x, { x, z: z - 1.2 }, '聞く　商人', () => {
    const k = F.stI = ((F.stI ?? -1) + 1) % lines.length; rt.say(lines[k][0], lines[k][1], 3.6);
  }, { r: 2.4 });
}

// K364 要件書58（「二万の軍勢」は全員を出さなくてよい）：陣中の周りの遠く（陣の地図の外の野）に、ほかの備の野営を並べる。
//   陣小屋の屋根・篝火・幟を InstancedMesh 三つで（描く回数は三つだけ）。水の上・陣の内・遠景の眺め（湖や眼下）には置かない
const _ffM = new THREE.Matrix4(), _ffR = new THREE.Matrix4();
function farFlagTick(rt, dt) {
  const F = rt.flags.farFlags;
  if (!F || (F.t -= dt) > 0) return;
  F.t = 0.25;
  const tt = rt.t || 0;
  for (let k = 0; k < F.base.length; k++) { _ffR.makeRotationY(Math.sin(tt * 1.3 + k * 1.7) * 0.35); _ffM.multiplyMatrices(F.base[k], _ffR); F.flags.setMatrixAt(k, _ffM); }
  F.flags.instanceMatrix.needsUpdate = true;
}
function farCamp(rt, J) {
  const W = rt.world, MON = J.scn === 'toyotomi' ? 0xc9a13a : J.scn === 'tokugawa' ? 0xe8e2d0 : 0xd9b84a;
  const pts = [];
  let seed = 7 + (J.id || '').length * 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 260 && pts.length < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 46 + rnd() * 60, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) < 36 && z > -40 && z < 36) continue;   // 陣の内
    if (J.drama === 'komakiJin' && x > 18) continue;   // 湖
    if (J.drama === 'kawadaJin' && x < -18) continue;   // 木曽川の向こう岸は渡る前の地
    if ((J.drama === 'ishigaki' || J.drama === 'horiume' || J.drama === 'akasakaJin' || J.drama === 'kanegasakiJin') && z > 20 && Math.abs(x) < 60) continue;   // 北の眺め
    try { if (W.waterDepthAt && W.waterDepthAt(x, z) > 0.05) continue; } catch (e) { /* 水の判定が無ければ置く */ }
    pts.push([x, z, rnd()]);
  }
  if (!pts.length) return;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // 陣小屋：幕で囲った低い箱と、三角の板屋根。幟は竿と布
  const wallG = new THREE.BoxGeometry(3.2, 1.3, 2.4); wallG.translate(0, 0.65, 0);
  const roofG = new THREE.CylinderGeometry(1.45, 1.45, 3.5, 3); roofG.rotateZ(Math.PI / 2); roofG.rotateX(-Math.PI / 2); roofG.scale(1, 0.55, 1);   // 棟が上（三角の頂を上へ） roofG.translate(0, 1.85, 0);
  const walls = new THREE.InstancedMesh(wallG, new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 1 }), pts.length);   // 白い陣幕の囲い
  // 幕の黒い帯（陣幕の横の筋）と、人影の点・篝火の煙
  const bandG = new THREE.BoxGeometry(3.24, 0.22, 2.44); bandG.translate(0, 0.95, 0);
  const bands = new THREE.InstancedMesh(bandG, new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1 }), pts.length);
  const manG = new THREE.CapsuleGeometry(0.22, 1.0, 2, 5); manG.translate(0, 0.72, 0);
  const men = new THREE.InstancedMesh(manG, new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1 }), pts.length * 2);
  const smokeG = new THREE.ConeGeometry(0.9, 6, 7, 1, true); smokeG.translate(0, 3.8, 0);
  const smokes = new THREE.InstancedMesh(smokeG, new THREE.MeshBasicMaterial({ color: 0xcfcfc8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), pts.length);
  const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0x4d4338, roughness: 1 }), pts.length);
  const poleG = new THREE.CylinderGeometry(0.04, 0.05, 5, 5); poleG.translate(0, 2.5, 0);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 1 }), pts.length * 2);
  const flagG = new THREE.PlaneGeometry(0.6, 2.4); flagG.translate(0.32, 3.6, 0);
  const flags = new THREE.InstancedMesh(flagG, new THREE.MeshStandardMaterial({ color: MON, roughness: 1, side: THREE.DoubleSide }), pts.length * 2);
  const fireG = new THREE.ConeGeometry(0.4, 0.9, 6); fireG.translate(0, 0.45, 0);
  const fires = new THREE.InstancedMesh(fireG, new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), pts.length);
  let nf = 0, nl = 0, nm = 0;
  pts.forEach(([x, z, r], i) => {
    const y = W.heightAt(x, z);
    q.setFromAxisAngle(v.set(0, 1, 0), r * Math.PI);
    m4.compose(v.set(x, y, z), q, sc.set(1, 1, 1)); walls.setMatrixAt(i, m4); roofs.setMatrixAt(i, m4); bands.setMatrixAt(i, m4);
    for (let k = 0; k < 2; k++) { m4.compose(v.set(x + (k ? 1.6 : -2.2) + r, y, z - 2.4 - k * 0.8), q, sc.set(1, 0.9 + ((r * 7) % 1) * 0.2, 1)); men.setMatrixAt(nm++, m4); }
    for (let k = 0; k < 2; k++) { m4.compose(v.set(x + (k ? 3.2 : -3), y, z + 1.5 * (k ? -1 : 1)), q, sc.set(1, 0.9 + r * 0.3, 1)); poles.setMatrixAt(nl, m4); flags.setMatrixAt(nl++, m4); }
    if (r < 0.55) { m4.compose(v.set(x + 2.2, y, z - 2.2), q, sc.set(1, 1, 1)); fires.setMatrixAt(nf, m4); m4.compose(v.set(x + 2.2, y, z - 2.2), q, sc.set(1, 0.8 + r, 1)); smokes.setMatrixAt(nf++, m4); }
  });
  fires.count = nf; smokes.count = nf; flags.count = nl; poles.count = nl; men.count = nm;
  // 幟の揺れ：四分の一秒ごとに布の向きを少し振る（布だけ。行列を作り直すのは数十枚）
  rt.flags.farFlags = { flags, base: [], t: 0 };
  for (let k = 0; k < nl; k++) { const mm = new THREE.Matrix4(); flags.getMatrixAt(k, mm); rt.flags.farFlags.base.push(mm); }
  for (const m of [walls, bands, roofs, men, poles, flags, fires, smokes]) { m.frustumCulled = false; m.userData.noMerge = true; rt.scene.add(m); }
}


// 11/19 k365-cloud-48（軍議の絵を一段：幕の内の真ん中が空の地面だった）：床几の武将に囲まれた低い机に、墨で描いた陣の絵図を広げ、
//   采配を置く。幕の奥の両隅に篝火。形と材質は一度だけ作って使い回す（毎コマ new しない）
let councilMats = null;
function councilTable(rt) {
  try {
    const W = rt.world, x = 0, z = 11.2, gy = W.heightAt(x, z);
    if (!councilMats) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
      const g = cv.getContext('2d');
      g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 256, 160);
      g.strokeStyle = 'rgba(40,30,20,.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 112); g.bezierCurveTo(70, 92, 120, 136, 256, 100); g.stroke();   // 川
      g.lineWidth = 1.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(70 + i * 38, 46 + (i % 2) * 14, 16, Math.PI, 0); g.stroke(); }   // 山
      g.fillStyle = 'rgba(150,30,25,.9)'; for (const [a, b] of [[60, 80], [104, 70], [150, 84]]) g.fillRect(a, b, 14, 6);   // 味方の備
      g.fillStyle = 'rgba(25,25,25,.9)'; for (const [a, b] of [[176, 40], [206, 56]]) g.fillRect(a, b, 14, 6);   // 敵の備
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      councilMats = { desk: new THREE.MeshStandardMaterial({ color: 0x3e2c1e, roughness: 0.8 }), map: new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
        stick: new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.6 }), tuft: new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 1 }) };
    }
    const M = councilMats, grp = new THREE.Group(); grp.name = '軍議の机';
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), M.desk); top.position.set(0, 0.42, 0); grp.add(top);
    for (const [a, b] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.desk); l.position.set(a, 0.2, b); grp.add(l); }
    const map = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), M.map); map.rotation.x = -Math.PI / 2; map.position.set(0, 0.465, 0); grp.add(map);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.stick); st.rotation.z = Math.PI / 2; st.position.set(0.32, 0.49, 0.28); grp.add(st);   // 采配の柄
    const tf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.tuft); tf.scale.set(1.4, 0.6, 1); tf.position.set(0.62, 0.49, 0.28); grp.add(tf);   // 采配の房
    grp.position.set(x, gy, z); rt.scene.add(grp);
    for (const [kx, kz] of [[-6.5, 14.5], [6.5, 14.5]]) rt.scene.add(kagaribi(W, kx, kz));
  } catch (e) { /* 机が作れなくても軍議は進む */ }
}
// 軍議の座：武将を床几に腰掛けさせる（立ち話にしない。要件書62 座り方）。u.jinchu の座り姿は army_anim が持つ
function seatOn(rt, u) {
  if (!u || !u.pos) return u;
  try { rt.scene.add(shogi(rt.world, u.pos.x, u.pos.z, u.heading || 0)); } catch (e) { /* 床几なしでも座る */ }
  u.jinchu = { standing: false, t: 0, soldiers: [] };
  return u;
}
const DRAMA = {
  // 坂本の羽柴の本陣（要件書43「戦争は戦場に立つ前にもう始まっている」）：本陣の幕の前に文机を並べ、祐筆が書状を書いている。
  //   書き上がった書状を持って使者が騎馬で陣の口から出て行き、入れ替わりに池田恒興の使者が駆け込んで「犬山の城を取った」と告げる。
  //   火のそばでは兵が去就（誰がどちらに付くか）を話す。史実の分け：信雄が家老三人を斬って家康と結んだ・池田恒興が秀吉方に付き犬山城を取った・
  //   秀吉と家康が書状で諸将を誘い合った は A。言葉と陣の様子は B
  komakiJin(rt, J, one) {
    const F = rt.flags, W = rt.world;
    try {
      // 文机と書状：本陣の幕の前（陣の口の側）に三つ。机の上に白い紙と硯、脇に書き上げた書状の束
      const deskM = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.8 }), paperM = new THREE.MeshStandardMaterial({ color: 0xefe9d8, roughness: 1 }), inkM = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.6 });
      for (let i = 0; i < 3; i++) {
        const x = -2.6 + i * 2.6, z = -15.6, gy = W.heightAt(x, z);   // 陣の口から入ってすぐ前（書く手が見える近さ）
        const d = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.6), deskM); d.position.set(x, gy + 0.17, z); rt.scene.add(d);
        const pp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.01, 0.42), paperM); pp.position.set(x - 0.15, gy + 0.345, z); rt.scene.add(pp);
        const sz = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.3), inkM); sz.position.set(x + 0.42, gy + 0.36, z); rt.scene.add(sz);
        for (let k = 0; k < 4; k++) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), paperM); roll.rotation.z = Math.PI / 2; roll.position.set(x + 0.9, gy + 0.04 + k * 0.07, z - 0.1 + (k % 2) * 0.08); rt.scene.add(roll); }
      }
      // 湖畔の坂本の城（水城）：湖に張り出した石垣の台と天守
      const sk = new THREE.Group(), wl = new THREE.MeshStandardMaterial({ color: 0xd6d6cf, roughness: 1 }), rf = new THREE.MeshStandardMaterial({ color: 0x4f5658, roughness: 1 }), st = new THREE.MeshStandardMaterial({ color: 0x8b8b82, roughness: 1 });
      const sb = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 12), st); sb.position.y = 0.6; sk.add(sb);
      for (const [w, h, y] of [[7, 3, 3.7], [5.2, 2.6, 6.5], [3.6, 2.2, 8.9]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), wl); b.position.y = y; sk.add(b); const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.6, 4), rf); r.rotation.y = Math.PI / 4; r.scale.z = 0.8; r.position.y = y + h / 2 + 0.6; sk.add(r); }
      sk.position.set(38, -1.6, 30); sk.rotation.y = 0.3; rt.scene.add(sk);
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 祐筆三人（机の向こうに座る代わりに、机の後ろに立って書く）と、書状を待つ使者
    for (let i = 0; i < 3; i++) one(null, -2.6 + i * 2.6, -14.8, Math.PI, 'samurai', { weapon: 'none', horse: false });   // 祐筆（名の札は出さない・机の向こうで陣の口の方を向いて書く）
    const hs = one('羽柴秀吉', 1.3, -13.2, Math.PI, 'busho', { weapon: 'none', horse: false, flag: 'toyotomi' });   // 祐筆の後ろで書状を言いつける
    // 出て行く使者（騎馬）：本陣の前から陣の口の外へ
    const out = allyGroup(rt, { name: '使者', anchor: { x: 5.5, z: -13 }, facing: Math.PI, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 6 },
      [{ type: 'cavalry', n: 1, o: { invuln: true, weapon: 'none', flag: 'toyotomi' } }]);
    // 来る使者（池田恒興の使い）
    const inn = allyGroup(rt, { name: '使者', anchor: { x: -1.5, z: -31 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 5 },
      [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none' } }]);
    for (let i = 0; i < 3; i++) one('足軽', -8.6 + (i % 2) * 2, -11.4 + Math.floor(i / 2) * 1.6, 0.6 * (i % 2 ? -1 : 1), 'ashigaru', { weapon: i % 2 ? 'yari' : 'none' });
    F.komaki = { out, inn, sent: false, ran: false, told: false };
    // 要件書57・58：湖の舟（坂本の浜に、米を積んだ舟を寄せる）と、浜の商人
    campBoat(rt, 37, -9, 0.4); campBoat(rt, 40, -1, 0.2); campBoat(rt, 36, 7, -0.3);   // 浜の沖（近すぎると浜の高みの陰に隠れる）
    campStall(rt, one, 15, -16, [['商人', '大津と坂本の湊から、米も草鞋も舟で届く'], ['商人', '羽柴様の陣は払いがよい。商いの者が集まるわけじゃ']]);
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '戦はまだ先じゃ。じゃが本陣では毎日書状を書き、諸国へ使者を出しておる', 4.4);
    L(6, '羽柴秀吉', 'これを美濃の国衆へ。こちらに付けば、所領はそのまま、と書いておけ', 4);
    rt.addInteract('komaki-desk', { x: 0, z: -17 }, '見る　書状', () => {
      const k = F.kmI = ((F.kmI ?? -1) + 1) % 2;
      if (k === 0) L(0, '祐筆', '一日に何十通と書く。宛先ごとに、言うことを少しずつ変えるのが骨じゃ', 3.8);
      else L(0, '祐筆', '徳川殿も同じように書状を出しておる。どちらの誘いに乗るかで、戦の形が決まる', 4);
    }, { r: 2.6 });
    rt.addInteract('komaki-fire', { x: -7.6, z: -10.4 }, '聞く　火のそばの話', () => {
      const k = F.kfI = ((F.kfI ?? -1) + 1) % 2;
      if (k === 0) { L(0, '足軽', '信雄様は信長公の御子じゃろう。それと戦うのか', 3.2); L(3.6, '組の者', '去年まで同じ織田の家中。誰がどちらに付くか、まだ分からぬ', 3.6); }
      else L(0, '組の者', '戦の勝ち負けは、槍より先に書状で決まる、と組頭が言うておった', 3.6);
    }, { r: 2.6 });
  },
  // 石垣山の普請場（要件書48：戦は建てること・運ぶことでもある）：陣の北の縁は山の肩で、眼下に小田原の城と町と海。
  //   西で人足が野面の石垣を積み（三段目まで）、修羅に載せた大石を四人が曳いて来る。東では大工が木を伐って材木にする。
  //   北の縁の手前には、白い紙を張った塀が並ぶ。史実の分け：秀吉が小田原城を見下ろす笠懸山に石垣の城を築いた は A。
  //   出来てから周りの木を伐り払い、一夜で城が建ったように見せた（一夜城）は伝え（C）なので兵の「と聞く」。白い紙を張った塀の話も伝え。言葉は B
  ishigaki(rt, J, one) {
    const F = rt.flags, W = rt.world;
    let sled = null;
    try {
      // 野面の石垣（積みかけ）：西（x -16〜-4・z 19）に四段、上の段ほど少なく、裏へ少しずつ引く
      // 野面の石：角を少し崩した平たい直方体（頂点を少しずつずらす）。丸い塊でなく、面のある石に見せる
      const cutG = new THREE.BoxGeometry(1, 0.62, 0.8, 2, 1, 2); { const P = cutG.attributes.position; for (let i = 0; i < P.count; i++) { const k = Math.sin(i * 12.9898) * 43758.5453; const r = k - Math.floor(k); P.setXYZ(i, P.getX(i) * (0.88 + r * 0.2), P.getY(i) * (0.9 + ((r * 7) % 1) * 0.18), P.getZ(i) * (0.86 + ((r * 13) % 1) * 0.24)); } cutG.computeVertexNormals(); }
      const stM = [0x8f8a7c, 0x7f7a6c, 0x9a9484, 0x6f6a5e, 0x85806f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
      for (let row = 0; row < 4; row++) for (let i = 0; i < 14 - row * 3; i++) {
        if (row === 3 && i % 3 === 1) continue;
        const x = -16 + i * 0.95 + (row % 2) * 0.47, z = 19 + row * 0.3, y = W.heightAt(-10, 19) + 0.31 + row * 0.6;
        const b = new THREE.Mesh(cutG, stM[(i * 3 + row) % 5]); b.scale.set(0.92 + (i % 3) * 0.08, 1, 1); b.rotation.y = ((i * 1.7 + row) % 3) * 0.12; b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; rt.scene.add(b);
      }
      // 石の置き場と、修羅（木の橇）に載せた大石
      for (let i = 0; i < 9; i++) { const x = -20 + (i % 3) * 1.1, z = 9 + Math.floor(i / 3) * 1.0; const b = new THREE.Mesh(cutG, stM[i % 5]); b.rotation.y = i * 0.7; b.position.set(x, W.heightAt(x, z) + 0.31, z); rt.scene.add(b); }
      sled = new THREE.Group();
      const woodM = new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 0.9 });
      for (const sx of [-0.45, 0.45]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 2.6), woodM); r.position.set(sx, 0.09, 0); sled.add(r); }
      for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.22), woodM); p.position.set(0, 0.2, -0.9 + k * 0.6); sled.add(p); }
      const big = new THREE.Mesh(cutG, stM[2]); big.scale.set(1.6, 1.5, 1.7); big.position.set(0, 0.68, 0); sled.add(big);
      sled.position.set(-11, W.heightAt(-11, 4), 4); rt.scene.add(sled);
      // 東：木を伐る所（切り株・倒した丸太・挽いた材木）
      const logM = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.9 }), cutM = new THREE.MeshStandardMaterial({ color: 0xc9a46e, roughness: 0.9 });
      for (let i = 0; i < 4; i++) { const x = 16 + (i % 2) * 3, z = 12 + Math.floor(i / 2) * 3; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.5, 9), logM); st.position.set(x, W.heightAt(x, z) + 0.25, z); rt.scene.add(st); const top = new THREE.Mesh(new THREE.CircleGeometry(0.32, 9), cutM); top.rotation.x = -Math.PI / 2; top.position.set(x, W.heightAt(x, z) + 0.51, z); rt.scene.add(top); }
      for (let i = 0; i < 5; i++) { const x = 12.5, z = 7.5 + i * 0.55; const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 4.2, 8), logM); lg.rotation.z = Math.PI / 2; lg.position.set(x, W.heightAt(x, z) + 0.26 + (i % 2) * 0.05, z); rt.scene.add(lg); }
      for (let i = 0; i < 6; i++) { const x = 9.5, z = 7 + i * 0.4; const bd = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.34), cutM); bd.position.set(x, W.heightAt(x, z) + 0.06 + Math.floor(i / 3) * 0.13, z - Math.floor(i / 3) * 1.2); rt.scene.add(bd); }
      // 北の縁の手前：白い紙を張った塀（杭に板と紙）
      const paperM = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.95, side: THREE.DoubleSide }), postM = new THREE.MeshStandardMaterial({ color: 0x5c4a34, roughness: 0.9 });
      for (let i = 0; i < 7; i++) { const x = 1 + i * 2.1, z = 24.5, gy = W.heightAt(x, z); const pnl = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.9), paperM); pnl.position.set(x + 1.05, gy + 1.1, z); rt.scene.add(pnl); const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 6), postM); pst.position.set(x, gy + 1.15, z); rt.scene.add(pst); }
      // 眼下：小田原の城と町と海（山の肩の下、北の遠く）
      const far = new THREE.Group(), wall = new THREE.MeshStandardMaterial({ color: 0xd2d4cf, roughness: 1 }), roofM = new THREE.MeshStandardMaterial({ color: 0x51585a, roughness: 1 }), stoneM2 = new THREE.MeshStandardMaterial({ color: 0x8f918a, roughness: 1 }), houseM = new THREE.MeshStandardMaterial({ color: 0x6e6457, roughness: 1 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 22), stoneM2); base.position.y = 2.5; far.add(base);
      for (const [w, h, y] of [[10, 4, 7], [7.5, 3.4, 10.7], [5.2, 3, 14]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), wall); b.position.set(0, y, 0); far.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 2, 4), roofM); r.rotation.y = Math.PI / 4; r.scale.z = 0.8; r.position.set(0, y + h / 2 + 0.8, 0); far.add(r);
      }
      for (let i = 0; i < 40; i++) { const hx = -70 + (i % 20) * 7.2 + (i >= 20 ? 3.5 : 0), hz = -6 + (i >= 20 ? -7 : 0) + ((i * 7) % 4); if (Math.abs(hx) < 17) continue; const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.2), houseM); hb.position.set(hx, 0.6, hz); far.add(hb); const hr = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 4), roofM); hr.rotation.y = Math.PI / 4; hr.position.set(hx, 1.65, hz); far.add(hr); }   // 城下の町（小さな家を城の両脇と手前に）
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 160), new THREE.MeshStandardMaterial({ color: 0x5e7a86, roughness: 0.4 })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, 70); far.add(sea);
      far.position.set(6, -22, 128); rt.scene.add(far);   // 山の肩より下（谷の霞の上に城と町が見える高さ）
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 石を積む人足（石垣の前）と、木を伐る大工（東）
    for (let i = 0; i < 4; i++) one('人足', -15 + i * 3, 17.4 - (i % 2) * 0.6, Math.PI * 0.05, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'none' });
    for (let i = 0; i < 2; i++) one('大工', 15.2 + i * 3.4, 10.6 + i * 2.6, -0.8 + i * 0.6, 'ashigaru', { weapon: 'none', hat: 'hachimaki' });
    // 修羅を曳く四人（ゆっくり石垣へ）
    const pull = allyGroup(rt, { name: '人足', anchor: { x: -11, z: 6.6 }, facing: 0, order: 'hold', noRout: true, width: 2, aggro: 0, seekRange: 0, speed: 0.7 },
      [{ type: 'ashigaru', n: 4, o: { invuln: true, weapon: 'none' } }]);
    F.ishi = { sled, pull, go: false };
    // 要件書57・59：炊事（普請の人足に握り飯を配る）
    campKitchen(rt, one, 5, -17, [['炊事の者', '人足には握り飯を三つずつ。石を担ぐ者は腹が減る'], ['炊事の者', '米は船で小田原の浜へ着く。山の上まで運ぶのが一苦労よ']]);
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', 'ここは笠懸山。殿下の城を、小田原の目の前に築いておる。北の縁から下を見てみよ', 4.4);
    rt.after(5, () => { if (rt.flags === F) F.ishi.go = true; });
    rt.addInteract('ishi-view', { x: -2, z: 22.5 }, '見る　小田原', () => {
      const k = F.isV = ((F.isV ?? -1) + 1) % 2;
      if (k === 0) L(0, '組頭', 'あれが小田原の城と町じゃ。三月囲んでも、北条は降らぬ', 3.6);
      else L(0, '組の者', '城の向こうは海。北条は、もう逃げ場がないのう', 3.2);
    }, { r: 3 });
    rt.addInteract('ishi-wall', { x: -10, z: 16 }, '聞く　石を積む人足', () => {
      L(0, '人足', '石は野面のまま積む。近江の穴太の衆が積み方を教えておる、と聞く', 3.8); L(4.2, '人足', '関東で、石垣の城を見るのは初めてじゃ', 3);
    }, { r: 2.6 });
    rt.addInteract('ishi-paper', { x: 8, z: 22.6 }, '見る　白い塀', () => {
      L(0, '組の者', '板に白い紙を張って、遠目には白壁に見せるのだ、と聞く', 3.6);
      L(4, '組頭', '出来上がったら、前の木を一度に伐る。小田原からは、一夜で城が建ったように見えるそうな', 4.4);
    }, { r: 3 });
    rt.addInteract('ishi-wood', { x: 13, z: 9.5 }, '聞く　大工', () => {
      L(0, '大工', '伐った木はその場で挽いて、櫓と御殿の材にする。運ぶ手間がいらぬ', 3.8);
    }, { r: 2.6 });
  },
  // 赤坂の岡山の陣（要件書50）：杭瀬川の北岸ではなく東。陣の北を杭瀬川が流れ、その向こうに稲の実った田、遠くに大垣の城。
  //   川の手前に物見の櫓。陣の口のそばでは鉄砲衆が火縄を確かめ、槍を研ぐ兵。十五秒ほどで使番が「内府様、御着陣」と駆け込み、
  //   本陣の脇に金の扇の馬印が上がる。兵は浮き立つが、組頭は「下知があるまで動くな」。
  //   史実の分け：九月十四日の家康の着陣・金扇の馬印・大垣の西軍の動揺・島左近が杭瀬川の向こうで刈田をして誘った は A。言葉は B
  akasakaJin(rt, J, one) {
    const F = rt.flags, W = rt.world;
    let uma = null;
    try {
      // 川向こうの田（実った稲の色の板を数枚）と、遠くの大垣の城（平城：低い石垣の上の天守）
      const paddyM = new THREE.MeshStandardMaterial({ color: 0xb3a25a, roughness: 1 }), bundM = new THREE.MeshStandardMaterial({ color: 0x9c8a46, roughness: 1 });
      for (let i = 0; i < 5; i++) {
        const x = -32 + i * 15, z = 40 + (i % 2) * 4, p = new THREE.Mesh(new THREE.PlaneGeometry(13, 8), paddyM);
        p.rotation.x = -Math.PI / 2; p.position.set(x, W.heightAt(x, z) + 0.06, z); rt.scene.add(p);
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), bundM); const bx = x - 4 + k * 2.4, bz = z - 3.2; b.position.set(bx, W.heightAt(bx, bz) + 0.35, bz); rt.scene.add(b); }   // 刈って立てた稲束
        // 実った稲の畝：低い角度でも田に見えるよう、立った稲の帯を五列（高さ0.7m）。手前の一枚は半分刈ってある
        const rice = new THREE.MeshStandardMaterial({ color: 0xc2a94e, roughness: 1 }), riceG = new THREE.BoxGeometry(12, 0.7, 0.45);
        for (let r = 0; r < 5; r++) { if (i === 2 && r < 2) continue; const rz = z - 2.4 + r * 1.3, row = new THREE.Mesh(riceG, rice); row.position.set(x, W.heightAt(x, rz) + 0.35, rz); rt.scene.add(row); }
      }
      const far = new THREE.Group(), wall = new THREE.MeshStandardMaterial({ color: 0xc9cdcb, roughness: 1 }), roofM = new THREE.MeshStandardMaterial({ color: 0x5b6264, roughness: 1 }), stoneM2 = new THREE.MeshStandardMaterial({ color: 0x8c8f88, roughness: 1 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 18), stoneM2); base.position.y = 2; far.add(base);
      for (const sx of [-1, 1]) { const tw = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), wall); tw.position.set(sx * 10, 5.5, 6); far.add(tw); const tr = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.4, 4), roofM); tr.rotation.y = Math.PI / 4; tr.position.set(sx * 10, 7.7, 6); far.add(tr); }   // 隅の櫓
      for (const [w, h, y] of [[8, 3.4, 5.7], [6, 2.8, 8.9], [4.2, 2.4, 11.6]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), wall); b.position.set(0, y, 0); far.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.8, 4), roofM); r.rotation.y = Math.PI / 4; r.scale.z = 0.8; r.position.set(0, y + h / 2 + 0.7, 0); far.add(r);
      }
      far.position.set(-12, W.heightAt(0, 30), 98); far.scale.setScalar(1.7); rt.scene.add(far);   // 大垣の城：大きく、川向こうの田の先に
      rt.scene.add(yagura(W, 12, 21.5, { rot: Math.PI }));   // 川の手前の物見の櫓
      uma = umajirushi(W, 4.5, 15, 0, 'ogi'); uma.position.y -= 7.5; rt.scene.add(uma);   // 着陣まで下ろしておく
      rt.scene.add(hatazao(W, -6, 18.5, 0, 7, 'tokugawa'));
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 陣の口のそば：鉄砲衆が火縄を確かめ、槍の兵が穂先を研ぐ
    for (let i = 0; i < 3; i++) one('鉄砲足軽', 6 + i * 1.3, -15.5 - (i % 2) * 0.6, -0.3 + i * 0.3, 'ashigaru', { weapon: 'gun' });
    for (let i = 0; i < 3; i++) one('足軽', -7.5 + i * 1.4, -16 + (i % 2) * 0.7, 0.5 - i * 0.35, 'ashigaru', { weapon: 'yari' });
    one('物見', 12, 20, Math.PI * 0.95, 'ashigaru', { weapon: 'none' });
    const runner = allyGroup(rt, { name: '使番', anchor: { x: 1.5, z: -30 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 5 },
      [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none', flag: 'tokugawa' } }]);
    F.aka = { runner, uma, ran: false, told: false, up: 0 };
    // 物見の櫓の「中へ入る」（naka の部屋）は、押しても登れず降りる確かめも取れなかったので、この陣中では外す（K364・長：降りられなければ直す）
    for (const t of [0.2, 1, 3]) rt.after(t, () => { if (rt.flags !== F) return; for (const it of rt.interacts.filter((i) => /^naka_(in|out)_/.test(i.id))) rt.uninteract(it.id); });
    // 要件書58：横に荷駄の列（陣の西の道に、米と玉薬を積んだ荷車を並べる）
    try {
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a5134, roughness: 0.9 }), straw = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 }), box = new THREE.MeshStandardMaterial({ color: 0x3f3328, roughness: 0.8 });
      for (let i = 0; i < 4; i++) {
        const cx = -17, cz = -19 + i * 4.4, gy = W.heightAt(cx, cz), g = new THREE.Group();
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.6), wood); bed.position.y = 0.75; g.add(bed);
        for (const sx of [-0.8, 0.8]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 14), wood); wh.rotation.y = Math.PI / 2; wh.position.set(sx, 0.5, 0); g.add(wh); }
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), wood); sh.rotation.x = Math.PI / 2; sh.position.set(0, 0.6, 2.4); g.add(sh);
        for (let k = 0; k < 3; k++) { const b = i % 2 ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), box) : new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.65, 10), straw); if (!(i % 2)) b.rotation.z = Math.PI / 2; b.position.set(0, 1.05, -0.8 + k * 0.8); g.add(b); }
        g.position.set(cx, gy, cz); rt.scene.add(g);
      }
    } catch (e) { /* 形が作れない時も話は進む */ }
    one(null, -15.5, -12, Math.PI / 2, 'ashigaru', { weapon: 'none', hat: 'none' });   // 荷駄の者
    rt.addInteract('aka-cart', { x: -15, z: -10 }, '聞く　荷駄の者', () => rt.say('荷駄の者', '米と玉薬じゃ。荷駄が着かねば、二万の兵も三日で干上がる', 3.8), { r: 2.4 });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', 'ここは美濃赤坂の岡山。川の向こうが大垣の城、石田治部の本陣じゃ', 4.2);
    rt.addInteract('aka-mono', { x: 11, z: 18.5 }, '聞く　物見', () => {
      const k = F.akI = ((F.akI ?? -1) + 1) % 2;
      if (k === 0) L(0, '物見', '川向こうの田で、石田の兵が稲を刈っておる。こちらを誘っておるのよ', 3.8);
      else L(0, '物見', '刈っておるのは島左近の手じゃ、と聞く', 3.2);
    }, { r: 2.6 });
    rt.addInteract('aka-gun', { x: 7.3, z: -14 }, '聞く　鉄砲衆', () => {
      L(0, '鉄砲足軽', '火縄よし、玉薬よし。いつでも撃てる', 3); L(3.4, '組頭', '撃つのは下知の後じゃ。勝手に川を越えるな', 3.4);
    }, { r: 2.6 });
  },
  // 河田の渡しの後の陣（要件書50 関ヶ原前の東西の政治：書状・使者・去就）：川を渡ったばかりで、兵は濡れた具足と草鞋を火で乾かしている。
  //   北の丘の向こうに岐阜の城の櫓。十秒ほどで江戸の家康の使者が書状を持って駆け込み、組頭が「川を渡った働き」を聞かせる。
  //   火のそばでは、どの大名がどちらに付いたかの話。史実の分け：河田の渡河（八月二十二日）・岐阜城主の織田秀信が西軍・家康が江戸に留まり書状で諸将を動かした は A。
  //   福島と池田の先陣争いは伝えなので兵の「と聞く」。言葉は B
  kawadaJin(rt, J, one) {
    const F = rt.flags, W = rt.world;
    try {
      // 遠景：北の彼方に金華山と、頂の岐阜の城（陣の地図の外の背景として、山と天守の形だけ）
      const far = new THREE.Group();
      // 遠くの山は奥の山なみと同じ霞んだ青緑（作り物の円錐に見えないよう、低くなだらかに）
      // 頂を少し平らに（城を据える所）
      const mtnG = new THREE.CylinderGeometry(7, 52, 24, 18, 3); { const P = mtnG.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > -11 && y < 11) { const a = Math.atan2(P.getZ(i), P.getX(i)); const k = 1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 5 + 1) * 0.05; P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); } } mtnG.computeVertexNormals(); }
      const mtn = new THREE.Mesh(mtnG, new THREE.MeshStandardMaterial({ color: 0x6b7f7c, roughness: 1 }));
      mtn.position.set(0, 12, 0); far.add(mtn);
      // 霞んだ遠さの色（白と黒をくすませる）
      const wall = new THREE.MeshStandardMaterial({ color: 0xc4c9c8, roughness: 1 }), roofM = new THREE.MeshStandardMaterial({ color: 0x5d6466, roughness: 1 });   //（白と黒をくすませる）
      // 頂（高さ24）に据える三重の天守
      for (const [w, h, y] of [[4.2, 2.2, 25.1], [3.2, 1.8, 27.6], [2.3, 1.5, 29.6]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), wall); b.position.set(0, y, 0); far.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.6, 4), roofM); r.rotation.y = Math.PI / 4; r.scale.z = 0.8; r.position.set(0, y + h / 2 + 0.6, 0); far.add(r);
      }
      far.position.set(4, W.heightAt(0, 30) - 2, 108); far.scale.set(1.3, 1.25, 1.3); rt.scene.add(far);   // 山の肩が陣の後ろの木々より上に出る高さ   // 絵の奥行き（150m）の内に収める
      // 渡ったばかりの兵が濡れた物を乾かす：陣の口の左の篝火のまわりに、竿に掛けた小袖と、並べた草鞋
      const fx = -9, fz = -17.5;
      // 地面の焚き火（昼でも見える炎）：組んだ薪と、揺れる炎
      {
        const gy0 = W.heightAt(fx, fz), logM = new THREE.MeshStandardMaterial({ color: 0x4a3622, roughness: 1 });
        for (let k = 0; k < 4; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), logM); lg.rotation.z = Math.PI / 2 - 0.35; lg.rotation.y = k * Math.PI / 4; lg.position.set(fx, gy0 + 0.18, fz); rt.scene.add(lg); }
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 7), new THREE.MeshBasicMaterial({ color: 0xff7a24, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        flame.position.set(fx, gy0 + 0.5, fz); rt.scene.add(flame);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, depthWrite: false }));
        inner.position.set(fx, gy0 + 0.45, fz); rt.scene.add(inner);
        F.kawaFlame = [flame, inner];
      }
      const poleM = new THREE.MeshStandardMaterial({ color: 0x5e4a32, roughness: 0.9 }), clothM = [0x3c4a62, 0x6b5a44, 0x4a4036].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide }));
      const gy = W.heightAt(fx - 3, fz + 1.5);
      for (const dx of [-1.6, 1.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), poleM); p.position.set(fx - 3 + dx, gy + 0.9, fz + 1.5); rt.scene.add(p); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6), poleM); bar.rotation.z = Math.PI / 2; bar.position.set(fx - 3, gy + 1.75, fz + 1.5); rt.scene.add(bar);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), clothM[i]); c.position.set(fx - 4.1 + i * 1.1, gy + 1.22, fz + 1.5); rt.scene.add(c); }
      const strawM = new THREE.MeshStandardMaterial({ color: 0xb59a5c, roughness: 1 });
      for (let i = 0; i < 6; i++) { const z0 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.26), strawM); const x = fx + 1.2 + (i % 3) * 0.3, z = fz - 1.1 + Math.floor(i / 3) * 0.4; z0.position.set(x, W.heightAt(x, z) + 0.02, z); rt.scene.add(z0); }
      rt.scene.add(hyoro(W, -21, 11, Math.PI / 2));
      for (const x of [-15, -9]) rt.scene.add(hatazao(W, x, 18.5, 0, 5, 'tokugawa'));
    } catch (e) { /* 形が作れない時も話は進む */ }
    const ik = one('池田輝政', -1.5, 12.5, Math.PI, 'busho', { weapon: 'none', horse: false, flag: 'ageha' }); if (ik) ik.nameLift = 1.1;
    // 濡れた兵四人：篝火（-9, -17.5）を囲んで手をかざす
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; one('足軽', -9 + Math.sin(a) * 1.5, -17.5 + Math.cos(a) * 1.5, a + Math.PI, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'none' }); }
    const runner = allyGroup(rt, { name: '使者', anchor: { x: 1.5, z: -30 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 4.6 },
      [{ type: 'samurai', n: 1, o: { invuln: true, weapon: 'none', flag: 'tokugawa' } }]);
    F.kawa = { runner, ran: false, told: false };
    // 要件書57・58：渡しの舟（木曽川の岸に、兵と荷を渡した舟を繋ぐ）
    campBoat(rt, -24.5, -8, 0.1); campBoat(rt, -25.2, -1, -0.15); campBoat(rt, -24.8, 6, 0.05, false);
    one(null, -21.3, -6, -Math.PI / 2, 'ashigaru', { weapon: 'none', hat: 'none' });   // 船頭
    rt.addInteract('kawa-boat', { x: -20.8, z: -4.5 }, '聞く　船頭', () => rt.say('船頭', '舟で渡したのは馬と荷だけ。兵は浅瀬を歩いて渡ったわい', 3.8), { r: 2.4 });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '木曽川を渡り切った。草鞋と小袖を火で乾かせ。明日は、あの山の上の岐阜の城じゃ', 4.4);
    rt.addInteract('kawa-fire', { x: -7.2, z: -16.6 }, '聞く　火のそばの話', () => {
      const k = F.kwI = ((F.kwI ?? -1) + 1) % 3;
      if (k === 0) { L(0, '足軽', '小山で内府様に付いた大名衆、本当に皆こちらの味方かのう', 3.4); L(3.8, '組の者', '書状一つで、どちらにも転ぶ世の中よ', 3); }
      else if (k === 1) L(0, '組の者', '福島様と池田様が、どちらが先に岐阜を攻めるかで揉めた、と聞く', 3.6);
      else L(0, '足軽', '川の水が冷たかった。足の指がまだ痺れておる', 3);
    }, { r: 2.6 });
    rt.addInteract('kawa-castle', { x: 3, z: 18 }, '見る　岐阜の城', () => {
      L(0, '組頭', 'あの山の上が岐阜の城。昔、信長公が稲葉山と呼ばれた城を落として名を替えたそうな', 4.2);
    }, { r: 3 });
  },
  // 金ヶ崎の陣中（要件書28・65-3）：勝ち戦の陣中を歩くと、北の丘に落とした金ヶ崎の城（織田の幟が立つ）、分捕った米俵、
  //   火のそばで勝ちを喜ぶ兵。十秒ほどで使番が駆け込み、浅井長政の離反を告げる。軍議の幕の内で信長が「退く」と決め、陣の空気が変わる。
  //   史実の分け：手筒山・金ヶ崎の落城、浅井の離反、信長が朽木越えで京へ退いた は A。言葉と陣の様子は B。小豆袋の話は伝え（C）なので入れない
  kanegasakiJin(rt, J, one) {
    const F = rt.flags, W = rt.world;
    try {
      // 北西の丘の上の金ヶ崎の城（落とした城）：漆喰の塀と櫓門、織田の幟。陣の幕の左の上に見える高さ
      const hx = KANE_HILL.x, hz = KANE_HILL.z;
      rt.scene.add(dobei(W, [hx - 9, hz - 3, hx - 3.4, hz - 3], { shikkui: true, kawara: true, h: 2.6 }));
      rt.scene.add(dobei(W, [hx + 3.4, hz - 3, hx + 9, hz - 3], { shikkui: true, kawara: true, h: 2.6 }));
      rt.scene.add(yaguramon(W, hx, hz - 3, 6, 0, { inside: false, noKit: true }));
      rt.scene.add(sumiyagura(W, hx + 6, hz + 2, { w: 5, d: 4, base: 2.2, inside: false, noKit: true }));
      for (const dx of [-8, -5, 5, 8]) rt.scene.add(nobori(W, hx + dx, hz - 4.6, 'oda', 5));
      // 分捕りの米俵（陣の口から入ってすぐ右）：俵の胴（縄の巻き）が陣の口から見える向きに積む（端の丸い桟俵を正面に向けると黄色い盾に見えた）
      rt.scene.add(hyoro(W, 4.4, -17, 0));
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 信長と藤吉郎は本陣の幕の口（陣の口の側）に立たせ、体と名の札が主人公から見えるように
    one('織田信長', -1.2, 5.2, Math.PI, 'busho', { weapon: 'none', horse: false });
    one('木下藤吉郎', 1.8, 5.0, Math.PI - 0.3, 'samurai', { weapon: 'none', horse: false });
    // 勝ちを喜ぶ兵：入ってすぐの篝火（-6, -12）と米俵のまわり。腕を上げて喜ぶ（cheer）
    const glad = [];
    for (let i = 0; i < 6; i++) {
      const x = i < 3 ? -7.6 + i * 1.6 : 4.6 + (i - 3) * 1.4, z = i < 3 ? -13.6 + (i % 2) * 1.2 : -13.6 - (i % 2) * 0.8;
      const g = one('足軽', x, z, i < 3 ? 0.9 - i * 0.5 : -0.6 + (i - 3) * 0.5, 'ashigaru', { weapon: i % 2 ? 'yari' : 'none', ...(i % 3 === 0 ? { hat: 'hachimaki' } : {}) });
      if (g) glad.push(g);
    }
    const runner = allyGroup(rt, { name: '使番', anchor: { x: 1.5, z: -30 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 5 },
      [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none' } }]);
    F.kane = { runner, ran: false, told: false, glad, cheerT: 0 };
    // 要件書57・59：鍛冶（昨日までの城攻めで欠けた槍を打ち直す）
    campSmithy(rt, one, -12, -7);
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '手筒山も金ヶ崎も落ちた。次は一乗谷の朝倉の館じゃ', 4);
    L(6, '足軽', '分捕りの米じゃ。今夜は腹いっぱい食えるぞ', 3.4);
    rt.addInteract('kane-castle', { x: -12, z: 18 }, '見る　金ヶ崎の城', () => {
      const k = F.kcI = ((F.kcI ?? -1) + 1) % 2;
      if (k === 0) L(0, '組の者', '昨日まで朝倉の城じゃった。もう殿の幟が立っておる', 3.4);
      else L(0, '組頭', '敦賀の湊も押さえた。越前の入口はこちらの物よ', 3.2);
    }, { r: 3 });
    rt.addInteract('kane-kumi', { x: -7.4, z: -10.7 }, '聞く　組の者', () => {
      if (F.kane.told) { L(0, '組の者', '浅井様は殿の妹御の婿じゃぞ。それが背くとは……', 3.4); L(3.8, '足軽', '前は朝倉、後ろは浅井。袋の鼠じゃ', 3); }
      else L(0, '組の者', '近江の浅井様がおられる。背の心配は無いわい', 3.2);
    }, { r: 2.6 });
  },
  // 平野の本陣（要件書56・65-29）：五月七日の朝。家康は平野から天王寺口へ、秀忠は岡山口へ（A）。真田は茶臼山（A）。
  //   主人公は陣の口から入り、使番が本陣の幕へ駆け込むのを見て（ついて行ける）、金の扇の馬印の下で下知を聞く。
  //   荷駄の人足が米俵を本陣の脇へ運び、鉄砲衆は火のそばで火縄を整え、平野の郷の衆が米を届けに来ている。言葉は B
  hirano(rt, J, one) {
    const F = rt.flags, W = rt.world;
    try {
      rt.scene.add(umajirushi(W, 4.5, 15, 0, 'ogi'));
      rt.scene.add(hatazao(W, -6, 18.5, 0, 7, 'tokugawa'));
      rt.scene.add(hyoro(W, -21, 11, Math.PI / 2));
    } catch (e) { /* 形が作れない時も話は進む */ }
    const ieyasu = one('徳川家康', -1.5, 12.5, Math.PI, 'busho', { weapon: 'none', flag: 'tokugawa', horse: false });
    if (ieyasu) ieyasu.nameLift = 1.1;   // 名の札を本陣の幕の上へ（幕に被らない）
    for (let i = 0; i < 3; i++) one('鉄砲足軽', -10.5 + i * 1.3, -10.8, 0.6 - i * 0.5, 'ashigaru', { weapon: 'gun' });
    one('平野の郷の者', -17.5, 7.5, -0.4, 'ashigaru', { weapon: 'none', hat: 'none' });
    // 使番：陣の口から本陣の幕へ駆け込む（三秒後）。着いたら知らせる
    const runner = allyGroup(rt, { name: '使番', anchor: { x: 1.5, z: -30 }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 5 },
      [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none', flag: 'tokugawa' } }]);
    const tw = new THREE.CylinderGeometry(0.26, 0.26, 0.7, 10), twM = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 });
    const carriers = [0, 1].map((k) => {
      const g = allyGroup(rt, { name: '荷駄の人足', anchor: { x: -19 + k, z: 13 + k }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 1.5 },
        [{ type: 'ashigaru', n: 1, o: { invuln: true, weapon: 'none', hat: k ? 'hachimaki' : 'none' } }]);
      const bale = new THREE.Mesh(tw, twM); bale.rotation.z = Math.PI / 2; rt.scene.add(bale);
      return { g, bale, from: { x: -18.5 + k * 1.2, z: 12.5 + k }, to: { x: -10.5 + k * 1.2, z: 9.5 + k * 1.4 }, go: true, wait: k * 2, full: true };
    });
    F.hirano = { runner, carriers, ran: false, told: false };
    // 要件書57・59：炊き出しと商人（平野の郷は商いの町。郷の商人が陣へ物を売りに来ている）
    campKitchen(rt, one, -4.5, -17.5, [['炊事の者', '粥と握り飯じゃ。一人二つまで'], ['炊事の者', '水は沸かしてから飲め。生水は腹を下すぞ']]);
    campStall(rt, one, 6, -18, [['商人', '草鞋はいくらでもあるぞ。戦の前は、いくらあっても足りぬ'], ['商人', '平野の郷の干し魚と味噌じゃ。陣中では銭より米がものを言う']]);
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '平野の御本陣じゃ。金の扇の馬印の下に、大御所様がおられる', 4.2);
    rt.addInteract('hirano-uma', { x: 4.5, z: 13 }, '見る　馬印', () => {
      const k = F.umaI = ((F.umaI ?? -1) + 1) % 2;
      if (k === 0) L(0, '旗本', '金の扇は大御所様の馬印。これが動けば、全軍が動く', 3.6);
      else L(0, '旗本', '今日はこの馬印を、天王寺口へ進める', 3.2);
    }, { r: 2.6 });
    rt.addInteract('hirano-gun', { x: -9.2, z: -10.8 }, '聞く　鉄砲衆', () => {
      L(0, '鉄砲足軽', '朝の露で火縄が湿る。懐で温めておけ', 3.2); L(3.6, '組頭', '茶臼山の真田は、こちらの鉄砲を待ってはくれぬぞ', 3.4);
    }, { r: 2.6 });
    rt.addInteract('hirano-sato', { x: -17.5, z: 7.5 }, '聞く　平野の郷の者', () => {
      L(0, '平野の郷の者', '郷の米を御本陣へ。戦が早う終わってくれれば、それでよい', 3.8);
    }, { r: 2.6 });
  },
  // 堀の埋め立て（要件書27・54）：冬の陣の和議の後、徳川方が惣構えの土手を崩して堀を埋め、二の丸の堀にも手を入れた（A）。
  //   「約定は外の堀だけだった」は通説なので、ここでは言わない（樫井の前の出立で兵の「と聞く」で言う）。堀の縁を歩くと、人足が土を運び、
  //   東から一間ずつ堀が埋まっていく（一区切り十二秒ほど・二分足らずで埋まり切る）。組頭・人足・大坂の町の者・組の者が一言ずつ
  horiume(rt, J, one) {
    const F = rt.flags, W = rt.world;
    const H = F.hori = { p: [1, 1, 0.35, 0, 0, 0, 0, 0], boxes: [], porters: [], t: 0, done: false };
    const segW = (HORI.x1 - HORI.x0) / HORI.segs;
    try {
      // 向こう岸の大坂の塀（白い漆喰に瓦）。門は閉じたまま
      // 惣構えらしく、瓦と狭間の漆喰の塀・櫓門・隅櫓を一つずつ（使い回し）
      rt.scene.add(dobei(W, [HORI.x0, HORI.z + 5.5, -4.2, HORI.z + 5.5], { shikkui: true, kawara: true, h: 2.8 }));
      rt.scene.add(dobei(W, [4.2, HORI.z + 5.5, HORI.x1 - 6, HORI.z + 5.5], { shikkui: true, kawara: true, h: 2.8 }));
      rt.scene.add(yaguramon(W, 0, HORI.z + 5.5, 6, 0, { inside: false, noKit: true }));   // 部品の組み（KitBatch）の白壁は、陣中では白く透けて幽霊のように見えたので、元の形で
      rt.scene.add(sumiyagura(W, HORI.x1 - 2.5, HORI.z + 6.5, { w: 6, d: 5, base: 2.2, inside: false, noKit: true }));   // 部品の組みの白壁は薄く透けて見えたので元の形で
      // 埋める土の塊（東から一区切りずつ上がる）。水は world の streams が描く
      const dirt = new THREE.MeshStandardMaterial({ color: 0x6b5434, roughness: 0.95 });
      const dirt2 = new THREE.MeshStandardMaterial({ color: 0x584530, roughness: 1 }), stoneM = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.9 });
      const tawaraM = new THREE.MeshStandardMaterial({ color: 0xa88f58, roughness: 1 });
      const moundG = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), stoneG = new THREE.DodecahedronGeometry(0.32, 0), tawaraG = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10);
      // 土の塊は堀の形（上が広く底が狭い）に合わせる。箱のままだと縁の斜面から土の壁の面が見えた
      const geo = new THREE.BoxGeometry(segW + 0.05, 2.6, (HORI.half + 0.8) * 2);
      { const P = geo.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) P.setZ(i, P.getZ(i) * (HORI.half - 0.4) / (HORI.half + 0.8)); P.needsUpdate = true; geo.computeVertexNormals(); }
      for (let i = 0; i < HORI.segs; i++) {
        const m = new THREE.Mesh(geo, dirt); m.receiveShadow = true;
        m.userData.x = HORI.x1 - segW * (i + 0.5); m.userData.g = jinBase(m.userData.x, HORI.z);
        m.position.set(m.userData.x, 0, HORI.z); rt.scene.add(m); H.boxes.push(m);
        // 落とした土の跡：上に低い土の盛り上がりと、崩した石・土を詰めた俵を混ぜる（区切りごとに少しずつ置き方を変える）
        for (let k = 0; k < 3; k++) {
          const mo = new THREE.Mesh(moundG, k === 1 ? dirt2 : dirt); mo.scale.set(1.3 + ((i + k) % 3) * 0.35, 0.28 + (k % 2) * 0.12, 1 + ((i * 2 + k) % 3) * 0.3);
          mo.position.set(-segW * 0.33 + k * segW * 0.33 + ((i * 7 + k) % 5 - 2) * 0.25, 1.3, ((i + k * 2) % 5 - 2) * 0.9); m.add(mo);
        }
        for (let k = 0; k < 2; k++) { const st = new THREE.Mesh(stoneG, stoneM); st.scale.set(1.5, 0.75, 1.2); st.position.set(((i * 3 + k * 5) % 7 - 3) * 0.9, 1.3 + 0.17, (k ? 1.4 : -1.2) + (i % 3) * 0.3); st.rotation.y = i + k; st.castShadow = true; m.add(st); }
        if (i % 2 === 0) { const tw = new THREE.Mesh(tawaraG, tawaraM); tw.rotation.z = Math.PI / 2; tw.rotation.y = i * 0.6; tw.position.set(((i * 5) % 7 - 3) * 0.7, 1.55, ((i * 3) % 5 - 2) * 0.8); tw.castShadow = true; m.add(tw); }
      }
      // 土の山（西と東）と、崩した石垣の石
      const pileM = new THREE.MeshStandardMaterial({ color: 0x5e4a30, roughness: 1 });
      for (const [x, z] of [[-14, 12.5], [14, 13]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 18), pileM); c.position.set(x, jinBase(x, z) + 0.5, z); c.castShadow = c.receiveShadow = true; rt.scene.add(c); }
      // 崩した石垣の石：角を落とした切り石（十二面体を平たく伸ばす）を地面に据えて寝かせる。色は花崗岩の灰茶
      const cutG = new THREE.DodecahedronGeometry(0.42, 0), cutM = [0x9a9384, 0x8b8577, 0xa59d8c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true }));
      for (let i = 0; i < 7; i++) {
        const x = -17.2 + (i % 4) * 0.95 + (i > 3 ? 0.45 : 0), z = 15.4 + (i > 3 ? 0.9 : 0), sy = 0.55 + (i % 3) * 0.08;
        const b = new THREE.Mesh(cutG, cutM[i % 3]); b.scale.set(1.45 + (i % 2) * 0.3, sy, 1.05); b.rotation.y = i * 0.9;
        b.position.set(x, jinBase(x, z) + 0.42 * sy * 0.8, z); b.castShadow = b.receiveShadow = true; rt.scene.add(b);
      }
    } catch (e) { /* 形が作れない時も話は進む */ }
    // 堀の水は溜まり水：streams の水面（流れの筋と白い波）を、暗く静かな水面（弱いさざ波と空の映りだけ）の材質へ替える
    try {
      const st = (W.def.streams || [])[0];
      if (st?.mesh) {
        const old = st.mesh.material;
        const mat = rippleWater(liteMat({ color: 0x5c6a66, vertexColors: true, roughness: 0.2, metalness: 0, side: THREE.DoubleSide }), 1, 0, 0.1, W.hemi?.color || null, false, null, null, false, true);
        mat.envMapIntensity = 0.4; mat.roughness = 0.16;
        st.mesh.material = mat; old?.dispose?.();
        // 水の面の共通の作り（water_body.js）は、流れの向き（waterFlow）を持つ面を「川」として速い波と白い筋で描く。堀は流れないので向きを外す
        if (st.mesh.geometry?.attributes?.waterFlow) st.mesh.geometry.deleteAttribute('waterFlow');
      }
      // 川の作りが岸に並べる川石（丸石を低い面で作った灰色の塊）は、堀の土手には出さない（宙に浮いた灰色の角ばった塊に見えた）
      if (st?.rockMesh) st.rockMesh.visible = false;
    } catch (e) { /* 替えられない時は前の水面のまま */ }
    horiPlace(H);
    // 人足：二人一組でもっこ（縄の網に土を入れ、天秤棒を前後で担ぐ）を運び、堀の縁で土を落とす。三組（六人。重くしない）。
    //   'porter' の型と小袖の姿は骨の人にも VAT にも乗らず陣中で隠れたままだったので、得物を持たない足軽の型で描く（名は付けない）
    //   二組は東の土の山から主人公の見る縁（x 10〜16）へ、一組は西の山から西の縁へ。落とした土は堀へ落ちて消え、埋まり具合を少し進める
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 0.9 }), netM = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
    const poleG = new THREE.CylinderGeometry(0.035, 0.035, 1, 6), loadG = new THREE.SphereGeometry(0.28, 10, 8);
    const mk = (pile, dump) => {
      const pair = [0, 1].map((n) => allyGroup(rt, { name: '人足', anchor: { x: pile.x + n * 1.3, z: pile.z }, facing: 0, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 1.6 },
        [{ type: 'ashigaru', n: 1, o: { flag: null, invuln: true, weapon: 'none', hat: n ? 'hachimaki' : 'none' } }]));
      const pole = new THREE.Mesh(poleG, poleM), load = new THREE.Mesh(loadG, netM); load.scale.y = 0.8;
      rt.scene.add(pole, load);
      H.porters.push({ pair, pile, dump, toMoat: true, wait: 0, pole, load, full: true, drop: null });
    };
    mk({ x: 14 - 2.6, z: 13.6 }, { x: 13.2, z: HORI.z - HORI.half - 0.7 });
    mk({ x: 14 - 2.6, z: 12.0 }, { x: 15.8, z: HORI.z - HORI.half - 0.7 });
    mk({ x: -14 + 2.6, z: 13.4 }, { x: -13.5, z: HORI.z - HORI.half - 0.7 });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '和議が成った。大坂の堀を埋めるのは、こちらの手じゃ。北東の堀の縁へ行ってみよ', 4.6);
    one('大坂の町の者', 9.6, HORI.z - 4.4, 0.3, 'ashigaru', { weapon: 'none', hat: 'none', horse: false, vatNameOk: true });
    one('組の者', 19, HORI.z - 4.4, -0.3, 'ashigaru', { weapon: 'yari' });
    rt.addInteract('hori-see', { x: 14.5, z: HORI.z - 5.2 }, '見る　堀', () => {
      const k = F.horiSee = ((F.horiSee ?? -1) + 1) % 3;
      if (k === 0) { L(0, '人足', '惣構えの土手を崩して、その土を入れておる', 3.4); L(3.8, '組頭', '石垣の石も落として沈めよ、との御下知じゃ', 3.4); }
      else if (k === 1) L(0, '人足', '一日で一町ずつ平らになる。大坂の堀も、こうなれば溝よ', 3.6);
      else L(0, '組頭', '堀が無ければ、この城はもう城ではない', 3.2);
    }, { r: 3 });
    rt.addInteract('hori-town', { x: 9.6, z: HORI.z - 4.4 }, '聞く　大坂の町の者', () => {
      const k = F.horiTown = ((F.horiTown ?? -1) + 1) % 2;
      if (k === 0) L(0, '大坂の町の者', '堀が無うなったら、この町は城の内か外か、もう分からぬのう', 3.8);
      else L(0, '大坂の町の者', '戦が終わったと喜んだが……城の方々は、皆黙っておられる', 3.8);
    }, { r: 2.6 });
    rt.addInteract('hori-kumi', { x: 19, z: HORI.z - 4.4 }, '聞く　組の者', () => {
      L(0, '組の者', '大坂方の侍が、塀の上から黙って見ておる', 3.2); L(3.6, '足軽', '城の守りが、日に日に薄うなる', 2.8);
    }, { r: 2.6 });
  },
  // 茶の席（要件書60）：利休が点て、秀吉と家康が座る。足軽までは茶室の外で「誰が呼ばれたか」だけを聞く。足軽大将候補より上は末席から見る
  //   史実の分け：小田原の陣に利休がおり、秀吉が陣中で茶を催した・伊達政宗は遅れて着き、すぐには会われなかった は A。席の顔ぶれと言葉は B
  chanoyu(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world, C = { x: -20, z: 16 };   // 幕の外の西（幕と重ねない）
    try { rt.scene.add(hut(W, C.x, C.z, 5, 4.5, Math.PI / 2, { ita: true })); } catch (e) { /* 茶室の形なしでも進む */ }
    const ko = (col, o = {}) => ({ kosode: 1, kosodeCol: col, hat: 'none', haori: null, armor: col, lace: 0x2a2622, cloth: col, horse: false, ...o });
    one('千利休', C.x + 3.4, C.z - 1.2, Math.PI / 2, 'porter', ko(0x2a2622, { bozu: 1 }));
    one('豊臣秀吉', C.x + 3.4, C.z + 1.4, -Math.PI / 2 + 0.3, 'samurai', ko(0x7a4a2a));
    one('徳川家康', C.x + 5.2, C.z + 0.2, -Math.PI / 2, 'samurai', ko(0x3a3a2c));
    one(null, C.x + 6.6, C.z - 3, Math.PI, 'ashigaru', { weapon: 'yari' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '早雲寺の御本陣じゃ。……あの小さな庵が、殿下の茶の席よ', 4));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '千利休', '……どうぞ', 2.4);
        L(3, '豊臣秀吉', '北条の城を囲んだまま茶を飲む。これも戦よ', 3.2);
        L(7, '徳川家康', 'まことに', 2.2);
        L(10, '組頭', '（末席の者は、口を開かぬものじゃ）', 3);
        L(14, '豊臣秀吉', '伊達の若造は、まだ箱根の手前で待たせておけ', 3.4);
      } else {
        L(0, '番の侍', '茶の席じゃ。呼ばれた方しか入れぬ', 2.8);
        L(3.6, '組の者', '今日は徳川様が呼ばれたそうな。呼ばれた者と呼ばれぬ者で、もう格が決まる', 4);
        L(8.4, '足軽', '奥州の伊達様は遅れて来て、まだ会うてもらえぬと聞く', 3.4);
      }
    };
    rt.after(12, go);
    rt.addInteract('jin-cha', { x: C.x + 6, z: C.z - 1 }, inner ? '上がる　茶の席の末席' : '見る　茶の席', go, { r: 4, prio: 2 });
  },
  // ---- 真田丸の築造（要件書65-25）：主人公は前田の侍。平野の陣の北の物見の土手から、真田の出丸の普請を見る ----
  //   史実の分け：冬の陣で真田信繁が大坂城の南の惣構えの外に出丸を築いた・信繁は九度山から大坂へ入った・前田勢は前の篠山の鉄砲に悩まされた は A。
  //   普請の様子（空堀・柵・人足・櫓の下の軍議）と言葉はゲームの再構成（B）。出丸の形を「半月」と言う呼び方は兵の「と聞く」で言う
  sanadamaru(rt, J, one) {
    const F = rt.flags, W = rt.world, C = SM.c;
    const RED = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
    const add = (o) => { try { if (o) rt.scene.add(o); } catch (e) { /* 部品が無くても進む */ } };
    // 出丸：南へ張り出す柵（西半分は立て終わり、東半分は立てかけ）・内の土塁・後ろの櫓と六文銭の幟
    const at = (r, a) => ({ x: C.x + Math.sin(a) * r, z: C.z - Math.cos(a) * r });
    for (let a = -1.35; a < 1.35; a += 0.27) {
      const p = at(SM.wall, a), q = at(SM.wall, a + 0.27);
      if (a < 0.2) add(palisade(W, [p.x, p.z, q.x, q.z]));
      const d0 = at(SM.wall - 2.6, a), d1 = at(SM.wall - 2.6, a + 0.27);
      add(dorui(W, [d0.x, d0.z, d1.x, d1.z], -Math.sin(a + 0.135), Math.cos(a + 0.135), { w: 2.6, h: 0.9 }));
    }
    for (const a of [-1.1, -0.55, 0.05, 0.6, 1.1]) { const p = at(SM.wall - 4, a); add(nobori(W, p.x, p.z, 'sanada', 5.5)); }
    add(yagura(W, C.x - 6, C.z + 3, {}));
    // 普請の道具：東の立てかけの柵の前に材木・足場、堀の縁に土の俵
    for (const [x, z, r] of [[C.x + 9, C.z - 13.5, 0.5], [C.x + 13, C.z - 9, 1.1]]) add(lumber(W, x, z, r));
    add(scaffold(W, C.x + 11, C.z - 11.5, 0.8));
    for (const [x, z, r] of [[C.x - 7, C.z - 19.5, 0.2], [C.x + 3, C.z - 20, -0.2]]) add(tawara(W, x, z, r, 4));
    const mk = (name, x, z, facing, list) => {
      const g = enemyGroup(rt, { faction: 'toyotomi', name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 2, aggro: 0, seekRange: 0, fixed: true }, list);
      for (const u of g.units) { u.invuln = true; u.noTarget = true; }
      return g;
    };
    // 櫓の下の軍議：床几に掛けた信繁を組頭三人が囲み、図を指す
    add(shogi(W, C.x + 4, C.z + 1, Math.PI));
    mk('真田の軍議', C.x + 4, C.z + 1.2, Math.PI, [{ type: 'busho', n: 1, o: { ...RED, name: '真田信繁', hat: 'kabuto_sanada', haori: 0x7a1a12, horse: false, weapon: 'none', invuln: true } }]);
    F.smCouncil = [[2.2, -0.6, 0.9], [5.8, -0.8, -0.9], [4, -2.4, 0]].map(([dx, dz, f]) =>
      mk('真田の組頭', C.x + dx, C.z + dz, f, [{ type: 'samurai', n: 1, o: { ...RED, horse: false, weapon: 'none', invuln: true, keep: true } }]));
    // 人足：堀の底と土の俵の間を、もっこで土を担いで行き来する（三組・行き来の調子をずらす）
    F.smWork = [];
    for (let i = 0; i < 4; i++) {
      const a = -1.0 + i * 0.45, lo = at(SM.moat, a), hi = at(SM.moat + 4.5, a + 0.1);
      const g = mk('人足', lo.x, lo.z, a, [{ type: 'porter', n: 2, o: { ...RED, flag: null, hat: 'none', weapon: 'none', invuln: true, keep: true } }]);
      g.fixed = false; g.speed = 1.3; g.smA = lo; g.smB = hi; g.smGo = i % 2;
      const flip = (q) => { q.smGo = !q.smGo; const d = q.smGo ? q.smB : q.smA; q.order = 'move'; q.dest = { x: d.x, z: d.z }; q.onArrive = flip; };
      rt.after(0.5 + i * 1.7, () => { if (rt.flags === F) flip(g); });
      F.smWork.push(g);
    }
    // 柵を立てる兵：東の立てかけの所で、柱を起こしては屈む
    F.smSaku = [0.35, 0.65, 0.95].map((a) => { const p = at(SM.wall + 1, a); return mk('真田の足軽', p.x, p.z, a, [{ type: 'ashigaru', n: 1, o: { ...RED, weapon: 'none', invuln: true, keep: true } }]); });
    // 物見の土手（陣の北の端・幕の西）。着くか、少し待つと見えた物を物見と組頭が語る
    const LOOK = SM.look;
    add(nobori(W, LOOK.x - 2.5, LOOK.z + 1.5, 'tokugawa', 5));
    rt.marker('mk-look', LOOK, '物見の土手');
    rt.flags.doors = { ...(rt.flags.doors || {}), look: LOOK };
    const L = (t, who, text, sec = 3.8) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '平野の御陣じゃ。北の土手から、野の向こうを見てみよ。真田が何やら普請をしておる', 4.6));
    F.smStep = 0;
    const go = () => {
      if (F.smStep) return; F.smStep = 1;
      rt.unmark('mk-look');
      L(0, '物見', '真田の出丸じゃ。大坂の惣構えの南の外に、堀と柵で囲うた小さな城を築いておる');
      L(5, '足軽', '昼も夜も、もっこで土を担いでおる……あれだけの人足を、どこから');
      L(10, '組の者', '大将は真田左衛門佐。紀州の九度山に押し込められておった浪人じゃそうな');
      L(15, '物見', '堀は水の無い空堀じゃ。半月の形に、城の外へ張り出しておる、と聞く');
      L(20, '組頭', '櫓の下を見よ。赤い具足の者どもが、床几の大将を囲んで図を指しておる。あれが真田の軍議じゃ', 4.4);
      L(25.5, '足軽', '東の柵は、まだ立てかけじゃ。今なら攻め込めるのでは');
      L(30, '組頭', '下知も無く攻めて、手柄より先に首が飛ぶわ。大御所様は、竹束で寄せて囲めと仰せじゃ', 4.2);
      L(35.5, '組の者', '前の篠山の藪に、真田の鉄砲が籠もっておる。あれが目障りじゃ', 3.6);
      L(40.5, '組頭', '見ておけ。あの丸が出来上がれば、この野が一番の死に場所になる', 4);
      rt.after(46, () => { if (rt.flags !== F || rt.over) return; F.smStep = 2; rt.say('組頭', '支度をせよ。下知が出れば、まず篠山じゃ', 3.6); rt.marker('mk-gate', SPOT.gate, SPOT.gate.n); });
    };
    rt.after(22, go);
    rt.addInteract('jin-look', LOOK, '見る　野の向こう（物見の土手）', go, { r: 6, prio: 2 });
    F.smTick = () => {
      const P = rt.player?.u?.pos;
      if (!P || F.smStep) return;
      if (Math.hypot(P.x - LOOK.x, P.z - LOOK.z) < 6) go();
    };
    // 柵を立てる兵の屈み（柱を起こしては屈む）
    F.smBowT = 0;
  },
  // 長篠の前夜の軍議（要件書33・65-4〜5）：幕の内の声だけが外へ漏れる。徳川の足軽は幕の外で主の帰りを待つ
  //   史実の分け（docs/journey/tobinosu.md の K364 の節）：鳶ヶ巣山の夜襲を酒井忠次が率い、信長の鉄砲衆（金森長近ら）が加わった は A（信長公記）。
  //   軍議で信長が忠次の策を一度叱り、後で内々に許した話は後の世の伝え（C）。主人公は聞いた話として知る。言葉は B
  gokurakuji(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    try { rt.world.dayClock = null; rt.world.setTime('night', true); } catch (e) { /* 刻のまま */ }
    seatOn(rt, one('織田信長', 0, 13.5, Math.PI, 'busho', { flag: 'oda', horse: false }));
    seatOn(rt, one('徳川家康', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'tokugawa', horse: false }));
    const sak = allyGroup(rt, { name: '酒井の主従', noRetinue: true, anchor: { x: 2.6, z: 11.5 }, facing: -Math.PI / 2, order: 'hold', noRout: true, width: 1, formation: 'column', aggro: 0, seekRange: 0, fixed: true, speed: 2.2 },
      [{ type: 'busho', n: 1, o: { name: '酒井忠次', flag: 'tokugawa', invuln: true, horse: false } }]);
    for (const u of sak.units) { u.invuln = true; u.noTarget = true; }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '上様の御本陣の軍議じゃ。殿も酒井様も上がっておられる。幕の外で待て', 4));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      L(0, '酒井忠次', '今夜のうちに山を回り、鳶ヶ巣山の砦を背から突けば、武田は退くに退けませぬ', 4);
      L(4.6, '織田信長', '小賢しい。そのような小策は無用じゃ', 3);
      L(8.2, inner ? '侍' : '組の者', inner ? '（徳川の殿は黙って、酒井様の方を見ておられる）' : '酒井様が叱られた……。皆の前でじゃ', 3);
      // 軍議が果て、忠次だけが呼び戻される（主の下へ、と言って幕の脇へ）
      rt.after(12, () => { if (rt.flags !== F) return; sak.fixed = false; sak.order = 'move'; sak.dest = { x: 6, z: 15 }; });
      if (inner) {
        L(14, '織田信長', '先ほどは、敵の間者の耳を憚った。鉄砲五百を付ける。今夜のうちに行け', 4);
        L(19, '酒井忠次', '……承った', 2.4);
        L(22, '徳川家康', '忠次、頼むぞ', 2.4);
      } else {
        L(14, '足軽', '酒井様だけ、上様の御前へ呼び戻されたぞ', 3);
        L(18.5, '組頭', '叱ったのは、敵の耳に入れぬためじゃったと聞く。……今夜、山を越えるぞ', 4);
      }
      rt.after(inner ? 25 : 23, () => { if (rt.flags !== F) return; sak.order = 'move'; sak.dest = { x: 0, z: -30 }; sak.onArrive = (g) => { for (const u of g.units) if (u.alive) rt.army.despawn(u); }; });
      L(inner ? 26 : 24, '使番', '酒井様の手に加わる者は、出陣の口へ。松明は点けるな', 3.6);
    };
    rt.after(12, go);
    rt.addInteract('jin-gokuraku', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 北陸の不和（要件書36・65-6）：柴田勝家の下に付けられた羽柴秀吉が軍議で言い争い、勝手に陣を払って近江へ戻る
  //   史実の分け（docs/journey/tedorigawa.md の K364 の節）：天正五年の北陸の出陣に秀吉も加わり、勝家と仲違いして無断で引き揚げ、
  //   信長の怒りを買った は A（信長公記）。何で言い争ったか（攻め方の違い）は後の伝え（B〜C）。言葉は B
  hokuriku(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    seatOn(rt, one('柴田勝家', 1.8, 12.5, -Math.PI / 2 - 0.4, 'busho', { flag: 'kari', horse: false }));
    const hide = allyGroup(rt, { name: '羽柴の主従', noRetinue: true, anchor: { x: -1.8, z: 12.5 }, facing: Math.PI / 2 + 0.4, order: 'hold', noRout: true, width: 1, formation: 'column', aggro: 0, seekRange: 0, fixed: true, speed: 2.2 },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', flag: 'toyotomi', invuln: true, horse: false } }]);
    // 羽柴の手の者：陣の西で荷をまとめ始める
    const hagun = allyGroup(rt, { name: '羽柴の手', anchor: { x: -14, z: 2 }, facing: Math.PI, order: 'hold', noRout: true, width: 3, formation: 'column', aggro: 0, seekRange: 0, fixed: true, speed: 1.6, march: true },
      [{ type: 'ashigaru', n: 6, o: { flag: 'toyotomi', invuln: true, weapon: 'yari' } }, { type: 'porter', n: 2, o: { invuln: true, weapon: 'none' } }]);
    for (const g of [hide, hagun]) for (const u of g.units) { u.invuln = true; u.noTarget = true; }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '加賀の陣中じゃ。北陸の大将は柴田様。羽柴様の手も、柴田様の下に付けられた', 4.2));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '柴田勝家', '七尾は上杉に囲まれておる。手取川を越えて、一刻も早う救いに行く', 3.6);
        L(4.4, '羽柴秀吉', '川を背にして上杉と当たるは危のうござる。ここは城を固めて待つべし', 3.8);
        L(9, '柴田勝家', '上様の命は七尾を救えじゃ。北陸の大将はこの勝家ぞ', 3.4);
        L(13, '羽柴秀吉', '……ならば、羽柴の手は要りますまい', 3);
      } else {
        L(0, '組の者', '幕の内で、柴田様と羽柴様が声を荒げておられる', 3.4);
        L(4.4, '足軽', '大将が二人おるようなもんじゃ。……揉めもするわい', 3.2);
      }
      // 秀吉が幕を出て、羽柴の手は夜のうちに陣を払う
      rt.after(16, () => { if (rt.flags !== F) return; hide.fixed = false; hide.order = 'move'; hide.dest = { x: -10, z: -2 }; });
      rt.after(19, () => {
        if (rt.flags !== F) return;
        for (const g of [hide, hagun]) { g.fixed = false; g.order = 'move'; g.dest = { x: -4, z: -44 }; g.onArrive = (gg) => { for (const u of gg.units) if (u.alive) rt.army.despawn(u); }; }
      });
      L(17, '羽柴秀吉', '陣を払え。近江へ戻るぞ', 2.8);
      L(21, '足軽', '羽柴様の手が、陣を払うておる……。下知も無しにか', 3.2);
      L(25.5, '柴田勝家', '……勝手にせい。わしらだけで七尾へ行く', 3.2);
      L(30, '組頭', '上様がお知りになれば、ただでは済むまい。……支度をせよ。わしらは七尾へ急ぐ', 4);
    };
    rt.after(12, go);
    rt.addInteract('jin-hokuriku', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 中入りの軍議（要件書43・65-16）：池田恒興と森長可が三河への回り込みを願い、秀吉が三好信吉を大将に付けて許す
  //   史実の分け（docs/journey/t03b_nagakute.md の K364 の節）：四月六日の夜に三好信吉を大将に池田・森・堀の二万ほどが三河へ向けて発った・
  //   森長可は三月の羽黒で敗れていた は A。中入りを言い出したのが池田恒興という形は通説（B）。言葉は B
  // 鴫野の前の上杉の陣（要件書57 兵站の食事・67）：夜明け前。大鍋の粥。幕の内で上杉景勝はほとんど口をきかず、直江兼続と須田長義が攻め方を話す
  //   史実の分け（docs/journey/k10_shigino.md の K364 の節）：鴫野の堤に柵があり井上頼次が守った・上杉の先手は須田長義・安田能元・
  //   家康の「退いて休め」を景勝が拒んだ は A（上杉家の記録）。景勝が寡黙だった は伝え（C・噂の形）。言葉は B
  shiginoJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('dusk', true); } catch (e) { /* 刻のまま */ }
    try { rt.scene.add(nabe(W, 5, -11)); rt.scene.add(campfire(W, 5, -11)); } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('上杉景勝', 0, 13.5, Math.PI, 'busho', { flag: 'uesugi', horse: false }));
    seatOn(rt, one('直江兼続', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'uesugi', horse: false }));
    seatOn(rt, one('須田長義', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'uesugi', horse: false }));
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.6; one('足軽', 5 + Math.sin(a) * 1.5, -11 + Math.cos(a) * 1.5, a + Math.PI, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'jingasa', flag: 'uesugi' }); }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '夜が明ければ、鴫野の堤じゃ。粥で腹の中から温めておけ', 3.8);
    rt.addInteract('jin-kayu', { x: 5, z: -12.6 }, '聞く　粥の鍋', () => {
      const k = F.kyI = ((F.kyI ?? -1) + 1) % 3;
      if (k === 0) L(0, '足軽', '越後の冬に比べれば、摂津の寒さなど何ほどでもないわ', 3.4);
      else if (k === 1) L(0, '足軽', '堤の両側は泥の田じゃ。落ちたら這い上がれぬと聞く', 3.2);
      else L(0, '組の者', 'うちの殿様は、笑うたところを見た者がおらぬそうな', 3.2);
    }, { r: 2.6 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '直江兼続', '堤の柵は三重。先手は須田、二の手に安田、鉄砲は水原に預けまする', 3.8);
        L(4.4, '須田長義', '柵は一つずつ引き倒す。城から後詰が来ても、退きませぬ', 3.4);
        L(8.4, '上杉景勝', '……うむ', 1.8);
        L(10.8, '直江兼続', '殿のお言葉は、それだけじゃ。……かかれ', 3);
      } else {
        L(0, '組の者', '殿様は幕の内で、一言しか言われなんだそうな', 3.2);
        L(4, '足軽', 'それで皆が動くのじゃから、上杉の家は不思議よ', 3);
        L(8, '組頭', '先手は須田様じゃ。遅れるな', 2.6);
      }
      L(inner ? 14.4 : 11.4, '使番', '先手、鴫野の堤へ！', 2.4);
      L(inner ? 17.4 : 14.4, '組頭', '鍋を下ろせ。……支度をせよ', 2.6);
    };
    rt.after(12, go);
    rt.addInteract('jin-shigino', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 若江の前の井伊の陣（要件書57 兵站の鍛冶・67）：朝。槍の穂先を砥石で研ぐ。幕の内で井伊直孝・川手良列・庵原朝昌が若江の木村勢を話す。
  //   川手良列は戦の中で討死する（史実）ので、ここでは先手を願い出る所だけを見せる（死は言わない）
  //   史実の分け（docs/journey/k14_yao_wakae.md の K364 の節）：若江で井伊直孝が木村重成と戦い、木村は討死・井伊方の川手良列も討死した は A。
  //   直孝が若い大将だった は A（二十六歳）。言葉・研ぎの話は B
  wakaeJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('morning', true); } catch (e) { /* 刻のまま */ }
    try {
      // 陣の口から見て左（+x）に砥石の台（木の台と灰色の石）と立て掛けた槍
      const wM = new THREE.MeshStandardMaterial({ color: 0x5a432c, roughness: 0.9 }), sM = new THREE.MeshStandardMaterial({ color: 0x6f6d68, roughness: 0.7 });
      const tx = 5, tz = -12, ty = W.heightAt(tx, tz);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.4), wM); bench.position.set(tx, ty + 0.15, tz); rt.scene.add(bench);
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.12), sM); stone.position.set(tx, ty + 0.34, tz); rt.scene.add(stone);
      const shaftM = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.8 }), sg = new THREE.CylinderGeometry(0.02, 0.02, 3.6, 5);
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(sg, shaftM); sp.position.set(tx + 1.6 + i * 0.12, ty + 1.75, tz + 0.9); sp.rotation.z = -0.12; rt.scene.add(sp); }
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('井伊直孝', 0, 13.5, Math.PI, 'busho', { flag: 'ii', horse: false }));
    seatOn(rt, one('川手良列', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'ii', horse: false }));
    seatOn(rt, one('庵原朝昌', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'ii', horse: false }));
    one('研ぎ師', 5, -11.2, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 2; i++) one('足軽', 3.4 + i * 1.1, -10.2, 0, 'ashigaru', { weapon: 'none', hat: 'jingasa', flag: 'ii' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '若江の田へ出る。槍の穂先を研いでおけ。赤備えの名に恥じるな', 3.8);
    rt.addInteract('jin-togi', { x: 5, z: -10.6 }, '聞く　砥石の台', () => {
      const k = F.tgI = ((F.tgI ?? -1) + 1) % 3;
      if (k === 0) L(0, '研ぎ師', '冬の陣から半年。錆びた穂先では、具足の継ぎ目に通らぬぞ', 3.6);
      else if (k === 1) L(0, '足軽', '若江の辺りは田ばかりで、畦道しか歩けぬそうな', 3);
      else L(0, '足軽', '木村重成殿は、冬の今福でも退かなかった若い大将と聞く', 3.4);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '庵原朝昌', '木村勢は若江の堤に陣を敷いたとの由。数はこちらより多うござる', 3.6);
        L(4.2, '井伊直孝', '数ではない。赤備えが先に当たれば、向こうは崩れる', 3.2);
        L(7.8, '川手良列', '先手は、この川手に。殿は後ろでお待ちを', 3);
        L(11.2, '井伊直孝', '……任せた。抜け駆けはするなよ', 2.8);
      } else {
        L(0, '組の者', '殿様は、まだお若いのに、少しも怖じておられぬそうな', 3.2);
        L(4, '足軽', '木村殿の手も、皆、討たれる覚悟と聞く', 2.8);
        L(7.6, '組頭', '畦から落ちるな。赤い旗に続け', 2.6);
      }
      L(inner ? 14.4 : 11, '使番', '先手、若江へ！', 2.2);
      L(inner ? 17.2 : 13.8, '組頭', '……支度をせよ', 2.2);
    };
    rt.after(12, go);
    rt.addInteract('jin-wakae', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 茶臼山の真田の陣（番外・要件書57・67）：五月六日の夜。赤い具足の紐を締め直す兵。幕の内で真田信繁・大助・毛利勝永が明日を話し、
  //   信繁が大助を城の秀頼のそばへ送る。史実の分け（docs/journey/x15_sanada.md の K364 の節）：道明寺で後藤基次・若江で木村重成が討たれた・
  //   七日に信繁が茶臼山に陣し、勝永が天王寺口で並んだ は A。大助が城へ入り秀頼に殉じた は A。信繁が大助を城へ送った言葉は B
  chausuJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('night', true); } catch (e) { /* 刻のまま */ }
    seatOn(rt, one('真田信繁', 0, 13.5, Math.PI, 'busho', { flag: 'sanada', horse: false }));
    seatOn(rt, one('真田大助', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'sanada', horse: false }));
    seatOn(rt, one('毛利勝永', -2.6, 11.5, Math.PI / 2, 'busho', { horse: false }));
    for (let i = 0; i < 3; i++) one('足軽', 4.2 + i * 1.1, -11 - (i % 2) * 0.6, Math.PI + 0.4, 'ashigaru', { weapon: 'none', hat: 'jingasa', flag: 'sanada' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '茶臼山の陣じゃ。具足の紐を締め直しておけ。明日は赤い具足がそろって出る', 4);
    rt.addInteract('jin-akazonae', { x: 5.3, z: -10.2 }, '聞く　具足を締め直す兵', () => {
      const k = F.akI = ((F.akI ?? -1) + 1) % 3;
      if (k === 0) L(0, '足軽', '後藤様も木村様も討たれた。残るは、うちの殿と毛利様じゃ', 3.4);
      else if (k === 1) L(0, '足軽', '堀の無い城に籠っても、もう持たぬ。打って出るしかないのじゃ', 3.4);
      else L(0, '組の者', '殿は、狙うは家康の首一つ、と言われたそうな', 3);
    }, { r: 2.6 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '毛利勝永', '明日、天王寺口は我らが並ぶ。真田殿の茶臼山と、肩を並べて当たりまする', 3.8);
        L(4.4, '真田信繁', '狙うは大御所の本陣ただ一つ。それより外は、目もくれぬ', 3.4);
        L(8.4, '真田信繁', '……大助。おぬしは城へ入り、秀頼様のおそばに付け', 3.2);
        L(12, '真田大助', '父上と共に行きとうございます', 2.6);
        L(15, '真田信繁', 'ならぬ。……行け', 2.4);
      } else {
        L(0, '組の者', '幕の内から、大助様が出て来られた。城へ戻られるそうな', 3.4);
        L(4.2, '足軽', '……親子が、別れを言われたのじゃな', 2.8);
        L(7.6, '組頭', '口を慎め。明日に備えよ', 2.4);
      }
      L(inner ? 18 : 11, '使番', '夜が明ければ、茶臼山の前へ出る', 2.6);
      L(inner ? 21 : 14, '組頭', '……支度をせよ', 2.2);
    };
    rt.after(12, go);
    rt.addInteract('jin-chausu', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 太田城の前の陣（要件書57 兵站・67）：根来の後、雑賀の者が太田の城に籠った。陣の口で近在の人夫を米で雇い、土俵を積む。
  //   幕の内で羽柴秀吉・羽柴秀長・中村一氏が、力攻めの損を嫌って別の手を探す（水攻めの決めは戦の始め＝t04b_ota/s1 の秀長の声に残す）
  //   史実の分け（docs/journey/t04b_ota.md の K364 の節）：根来寺が焼けた後、雑賀の者が太田城に籠り、秀吉は城の回りに堤を築いて水攻めにした は A。
  //   人夫に土俵一つごとに米や銭を払った話は伝え（C）なので噂の形。軍議の言葉は B
  otaJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try {
      // 陣の口から見て左（+x）に人夫に払う米俵、右（-x）に土俵（土色の小さな袋）を積む
      rt.scene.add(hyoro(W, 5.4, -15, 0));
      const bagM = new THREE.MeshStandardMaterial({ color: 0x7a6446, roughness: 1 }), bg = new THREE.BoxGeometry(0.55, 0.22, 0.35);
      for (let i = 0; i < 14; i++) {
        const x = -7.2 + (i % 5) * 0.6, z = -13.4 + Math.floor(i / 5) % 2 * 0.42, y = W.heightAt(x, z) + 0.11 + (i >= 10 ? 0.22 : 0);
        const m = new THREE.Mesh(bg, bagM); m.position.set(x, y, z); m.rotation.y = (i % 3 - 1) * 0.15; rt.scene.add(m);
      }
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('羽柴秀吉', 0, 13.5, Math.PI, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('羽柴秀長', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('中村一氏', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'toyotomi', horse: false }));
    // 米を受け取りに来た近在の人夫（小袖）と、払う役の小者
    one('小者', 4.2, -13, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 3; i++) one('人夫', 3.2 + i * 1.0, -11.2 - (i % 2) * 0.6, 0, 'ashigaru', { weapon: 'none', hat: 'none', kosode: true });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '雑賀の者どもは、太田の城に籠った。城を遠巻きにして待て', 3.6);
    rt.addInteract('jin-ninpu', { x: 4.2, z: -11.6 }, '聞く　米を受け取る人夫', () => {
      const k = F.npI = ((F.npI ?? -1) + 1) % 3;
      if (k === 0) L(0, '人夫', '土の俵を一つ運べば、米と銭がもらえるそうな。村じゅうで来たわい', 3.6);
      else if (k === 1) L(0, '小者', '人夫は近在の村から集めた。数は兵より多いかもしれん', 3.2);
      else L(0, '人夫', '城の中には、知った顔もおる。……なるべく早う済めばよいが', 3.4);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '羽柴秀吉', '太田の城は平らな地に建つ小さな城。じゃが、力で攻めれば雑賀の鉄砲で、こちらの損が大きい', 4.4);
        L(5, '羽柴秀長', '城の回りは田と川。紀の川も、すぐ北を流れておりまする', 3.4);
        L(9, '中村一氏', '近在の百姓を、人夫として雇い集めておりまする。米は足りまする', 3.4);
        L(13, '羽柴秀吉', '……よし。兵の命より、土を使え', 2.8);
      } else {
        L(0, '組の者', '幕の内では、城へ斬り込まずに済む手を話しておられるそうな', 3.4);
        L(4.2, '足軽', '人夫をあれほど集めて、何をさせる気じゃろう', 3);
        L(8, '組頭', '上の方々の考えは、明日には分かる', 2.8);
      }
      L(inner ? 16.4 : 11.6, '使番', '明日、城の回りへ出る。人夫の列を守れ', 3);
      L(inner ? 20 : 15.2, '組頭', '……支度をせよ', 2.2);
    };
    rt.after(12, go);
    rt.addInteract('jin-ota', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 今福の前の佐竹の陣（要件書57 兵站・67）：冬の朝。焚き火で手を温め、堤を進む前に竹束をそろえる。
  //   幕の内で佐竹義宣・渋江政光・梅津憲忠が狭い堤の攻め方を話す。前の堤を率いる渋江は戦の中で撃たれて討死する（b_k09_imafuku.js の③）ので、
  //   ここでは死を言わず、渋江が先手を買って出る所だけを見せる
  //   史実の分け（docs/journey/k09_imafuku.md の K364 の節）：佐竹義宣が今福の堤を攻め、柵を破って砦を奪った・木村重成と後藤基次が押し返し、
  //   渋江政光が撃たれて討死した・堤の両側は湿地だった は A。軍議の言葉・寒さの話は B
  imafukuJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('morning', true); } catch (e) { /* 刻のまま */ }
    try {
      // 陣の口から見て右（-x）に竹束を三つ、左（+x）に焚き火と土俵
      for (const [x, z, r] of [[-5, -13.5, 0.1], [-6.4, -13.2, 0.2], [-7.8, -13.6, -0.1]]) rt.scene.add(takataba(W, x, z, r));
      rt.scene.add(campfire(W, 5, -10.5));
      rt.scene.add(tawara(W, 7.4, -13.4, 0.4));
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('佐竹義宣', 0, 13.5, Math.PI, 'busho', { flag: 'satake', horse: false }));
    seatOn(rt, one('渋江政光', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'satake', horse: false }));
    seatOn(rt, one('梅津憲忠', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'satake', horse: false }));
    // 焚き火を囲む足軽三人
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.3; one('足軽', 5 + Math.sin(a) * 1.4, -10.5 + Math.cos(a) * 1.4, a + Math.PI, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'jingasa', flag: 'satake' }); }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '今日は今福の堤を攻める。手がかじかんでは槍も握れぬ。火で温めておけ', 4.2);
    rt.addInteract('jin-takibi', { x: 5, z: -12.2 }, '聞く　焚き火', () => {
      const k = F.tkI = ((F.tkI ?? -1) + 1) % 3;
      if (k === 0) L(0, '足軽', '霜で草鞋が凍りついておる。堤の上で滑らねばよいが', 3.4);
      else if (k === 1) L(0, '足軽', '竹束を抱えて、細い堤を一列で進むのか。両側は泥の田じゃと', 3.6);
      else L(0, '組の者', '城の方には、若い木村重成という大将がおると聞く', 3.2);
    }, { r: 2.6 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '佐竹義宣', '堤の上は一筋の道。柵が幾重にもあると聞く。数では押せぬ', 3.6);
        L(4.2, '梅津憲忠', '竹束を前に立て、柵を一つずつ引き倒して進みまする', 3.4);
        L(8, '渋江政光', '先手は、この渋江が。殿は本陣でお待ちくだされ', 3.4);
        L(11.8, '佐竹義宣', '……頼む。無理はするな', 2.8);
      } else {
        L(0, '組の者', '先手は渋江様と梅津様じゃそうな。殿は後ろの本陣に残られる', 3.6);
        L(4.4, '足軽', '堤の上で鉄砲に狙われたら、隠れる所が無い', 3);
        L(8, '組頭', 'だから竹束を手放すな。それだけ覚えておけ', 3);
      }
      L(inner ? 15.2 : 12, '使番', '先手、堤へ進め！　竹束を前へ', 2.8);
      L(inner ? 18.6 : 15.4, '組頭', '火を消せ。……支度をせよ', 2.6);
    };
    rt.after(12, go);
    rt.addInteract('jin-imafuku', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 道明寺の前の夜の陣（要件書57 兵站の食事・67）：夜明け前に国分の狭い道を抜けて河内へ出る。火を小さくし、握り飯を配る。
  //   幕の内で水野勝成・本多忠政・伊達政宗が話す。家康が勝成に「大将は自ら先駆けするな」と言い含めた話（通説・B）を噂で入れ、
  //   戦の中で勝成が先手を率いる筋（b_k13_domyoji.js）の前触れにする
  //   史実の分け（docs/journey/k13_domyoji.md の K364 の節）：大和口の徳川方が国分を抜けて河内へ出た・先鋒は水野勝成・本多忠政・伊達政宗・
  //   後藤基次が先に小松山へ出た は A。家康の言い含めは通説（B）。言葉・握り飯の話は B
  kokubuJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('night', true); } catch (e) { /* 刻のまま */ }
    try {
      // 陣の口から見て左（+x）に握り飯を配る台（俵と白い小さな握り飯）
      rt.scene.add(tawara(W, 5.6, -13.6, 0.2));
      const riceM = new THREE.MeshStandardMaterial({ color: 0xece6d6, roughness: 1 }), rg = new THREE.SphereGeometry(0.07, 6, 5);
      const tx = 4.2, tz = -12, ty = W.heightAt(tx, tz);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a432c, roughness: 0.9 })); tray.position.set(tx, ty + 0.6, tz); rt.scene.add(tray);
      for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), tray.material); leg.position.set(tx + (i % 2 ? 0.48 : -0.48), ty + 0.3, tz + (i < 2 ? 0.2 : -0.2)); rt.scene.add(leg); }
      for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(rg, riceM); r.scale.set(1, 0.85, 0.8); r.position.set(tx - 0.42 + (i % 6) * 0.17, ty + 0.68, tz - 0.1 + Math.floor(i / 6) * 0.2); rt.scene.add(r); }
      // 篝火は陣中の土台が陣の口の左右（±6, -12）に置く。重ねて足さない
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('水野勝成', 0, 13.5, Math.PI, 'busho', { flag: 'tokugawa', horse: false }));
    seatOn(rt, one('本多忠政', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'tokugawa', horse: false }));
    seatOn(rt, one('伊達政宗', -2.6, 11.5, Math.PI / 2, 'busho', { horse: false }));
    one('炊ぎの者', 4.2, -10.8, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 3; i++) one('足軽', 3 + i * 1.1, -9.4 - (i % 2) * 0.5, 0, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'jingasa' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '夜明け前に国分の山を抜ける。火は小さくせよ。今のうちに握り飯を腹に入れておけ', 4.4);
    rt.addInteract('jin-musubi', { x: 4.2, z: -10.6 }, '聞く　握り飯の台', () => {
      const k = F.msI = ((F.msI ?? -1) + 1) % 3;
      if (k === 0) L(0, '炊ぎの者', '一人二つずつじゃ。明日は昼まで、煮炊きはできぬと思え', 3.4);
      else if (k === 1) L(0, '足軽', '国分の道は狭い。三万の兵が一列で抜けるのか……', 3.2);
      else L(0, '足軽', '山の向こうで、後藤又兵衛が待っておると聞く。夜のうちに出て来るかもしれん', 3.6);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '本多忠政', '国分を抜ければ、河内の野。大坂方は、その出口を狙って来ましょう', 3.8);
        L(4.4, '伊達政宗', '後藤又兵衛が出て来るなら、それこそ好都合。数で押し包む', 3.4);
        L(8.4, '水野勝成', '大御所様には、大将が自ら先駆けするなと言い含められた。……だが、先手を預かる以上、退きはせぬ', 4.6);
        L(13.6, '本多忠政', '日向守殿らしい', 2.4);
      } else {
        L(0, '組の者', '水野様は、大御所様に「自ら槍を振るうな」と言われたそうな', 3.6);
        L(4.4, '足軽', 'あの殿様が、後ろで見ておられるものか', 3);
        L(8, '組頭', '殿の馬に遅れるな。それだけじゃ', 2.8);
      }
      L(inner ? 17 : 11.8, '使番', '夜明け前に発つ。先手は水野様、続いて本多様、伊達様', 3.4);
      L(inner ? 21.4 : 16, '組頭', '握り飯を腰に下げたか。……支度をせよ', 3);
    };
    rt.after(12, go);
    rt.addInteract('jin-kokubu', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 根白坂の砦の普請場（要件書57 兵站の馬・普請・67）：島津の夜討ちの前。砦の塀の板を運ぶ人足、馬つなぎで飼い葉を食む馬の世話。
  //   幕の内で宮部継潤・藤堂高虎・尾藤知宣が話し、尾藤が「本隊は軽々しく動かぬ」と言う（戦の中で秀長の本隊が救援を止める筋の前触れ）
  //   史実の分け（docs/journey/t08_nejirozaka.md の K364 の節）：秀長が高城を囲み、宮部継潤が根白坂に砦を築いた・島津が夜に攻め、
  //   秀長の本隊は尾藤知宣の進言で救援を止め、藤堂高虎らが助けた・尾藤は後に秀吉に罰せられた は A。軍議の言葉・馬の話は B
  nejiroJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try {
      // 陣の口から見て左（+x）に馬つなぎと飼い葉の山、右（-x）に塀の板（材木）の山
      rt.scene.add(umatsunagi(W, 6, -12.5, 0, 5));
      const hayM = new THREE.MeshStandardMaterial({ color: 0xa8945a, roughness: 1 });
      const hay = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), hayM); hay.scale.set(1.3, 0.55, 1); hay.position.set(7.8, W.heightAt(7.8, -14) + 0.25, -14); rt.scene.add(hay);
      for (const [x, z, r] of [[-6, -13, 0.3], [-7.5, -11.4, 1.2]]) rt.scene.add(lumber(W, x, z, r));
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('宮部継潤', 0, 13.5, Math.PI, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('藤堂高虎', 2.6, 11.5, -Math.PI / 2, 'busho', { horse: false }));
    seatOn(rt, one('尾藤知宣', -2.6, 11.5, Math.PI / 2, 'busho', { horse: false }));
    one('馬丁', 5.4, -11.2, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 2; i++) one('人足', -6.4 + i * 1.3, -10.6, Math.PI + 0.4, 'ashigaru', { weapon: 'none', hat: 'hachimaki' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '根白坂の砦じゃ。堀と塀を急げ。島津は高城を救いに、この坂を登って来る', 4.2);
    rt.addInteract('jin-uma', { x: 5.4, z: -10.6 }, '聞く　馬つなぎ', () => {
      const k = F.umI = ((F.umI ?? -1) + 1) % 3;
      if (k === 0) L(0, '馬丁', '豊前から日向まで、馬も歩き通しじゃ。飼い葉と水を切らすと、戦の前に倒れる', 3.8);
      else if (k === 1) L(0, '馬丁', '夜討ちが来ても、馬を放すなよ。暴れ馬は敵より怖い', 3.2);
      else L(0, '人足', '塀の板は、昨日の倍運べと言われた。島津が来る前に仕上げよとさ', 3.4);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '宮部継潤', '堀と塀は、あと二日で仕上がる。島津は必ずこの坂へ来る', 3.6);
        L(4.2, '藤堂高虎', '夜討ちとなれば、すぐに駆け付けまする', 3);
        L(7.8, '尾藤知宣', '……大納言様の本隊は、軽々しくは動かれぬ。砦は砦で持ちこたえられよ', 4);
        L(12.4, '宮部継潤', '承知。この砦は、宮部が持ちこたえる', 3.2);
      } else {
        L(0, '組の者', '幕の内では、後詰が来るか来ぬかで、もめておられるそうな', 3.6);
        L(4.4, '足軽', '戸次川では、島津に誘い出されて大勢やられたと聞く', 3.2);
        L(8.4, '組頭', '砦を出て追うな。塀の内で持ちこたえる。それだけじゃ', 3.2);
      }
      L(inner ? 16.4 : 12.4, '使番', '島津の大軍、坂の下の田へ寄せつつあり！', 3);
      L(inner ? 20.4 : 16.4, '組頭', '塀に付け。……支度をせよ', 2.8);
    };
    rt.after(12, go);
    rt.addInteract('jin-nejiro', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 根来寺の前の千石堀の陣（要件書57 兵站の火縄・67）：千石堀城を落とした翌日。竿に掛けた火縄を火で乾かし、幕の内で根来への寄せ方を話す
  //   史実の分け（docs/journey/t04_negoro.md の K364 の節）：三月二十一日、千石堀城で根来衆が激しく戦い、火が煙硝蔵に入って落ちた・
  //   攻め手は羽柴秀次らで堀秀政・筒井定次らも加わった・二十三日に根来寺へ入り坊舎の多くが焼けた は A。
  //   根来衆の多くが出城に出ていて寺は手薄だった は通説（B）。軍議の言葉・火縄の乾かし方の話は B
  sengokuJin(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try {
      // 火縄の竿：陣の口から見て右（-x）に竿二本と横木、垂れた火縄（細い縄）を十本
      const poleM = new THREE.MeshStandardMaterial({ color: 0x5e4a32, roughness: 0.9 }), cordM = new THREE.MeshStandardMaterial({ color: 0x6b4e30, roughness: 1 });
      const fx = -6, fz = -12, gy = W.heightAt(fx, fz);
      for (const dx of [-1.8, 1.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), poleM); p.position.set(fx + dx, gy + 0.95, fz); rt.scene.add(p); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.8, 6), poleM); bar.rotation.z = Math.PI / 2; bar.position.set(fx, gy + 1.85, fz); rt.scene.add(bar);
      const cg = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4);
      for (let i = 0; i < 10; i++) { const c = new THREE.Mesh(cg, cordM); c.position.set(fx - 1.5 + i * 0.33, gy + 1.25, fz + (i % 2) * 0.05); rt.scene.add(c); }
      // 火は陣中の土台の篝火（-6, -12）を使う。重ねて足さない
      // 玉薬の樽の代わりに俵（陣の口から見て左）
      rt.scene.add(tawara(W, 5, -13.5, 0.2));
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('羽柴秀次', 0, 13.5, Math.PI, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('堀秀政', 2.6, 11.5, -Math.PI / 2, 'busho', { horse: false }));
    seatOn(rt, one('筒井定次', -2.6, 11.5, Math.PI / 2, 'busho', { horse: false }));
    // 火縄の番の小者と、火にあたる鉄砲足軽二人
    one('小者', -6.4, -10.6, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 2; i++) one('鉄砲足軽', -4.6 + i * 1.2, -10.4 - i * 0.6, Math.PI + 0.3, 'ashigaru', { weapon: 'none', hat: 'jingasa' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '千石堀の城は焼け落ちた。次は根来の寺じゃ。今夜のうちに火縄を乾かしておけ', 4.2);
    rt.addInteract('jin-hinawa', { x: -6, z: -10.4 }, '聞く　火縄の竿', () => {
      const k = F.hnI = ((F.hnI ?? -1) + 1) % 3;
      if (k === 0) L(0, '小者', '火縄は湿れば火が付かぬ。火のそばで、一本ずつ乾かすのじゃ', 3.6);
      else if (k === 1) L(0, '鉄砲足軽', '千石堀では、城の玉薬の蔵に火が入って、城の者ごと燃えた。あれは見とうなかった', 3.8);
      else L(0, '鉄砲足軽', '根来の坊主は、鉄砲の名手ぞろいと聞く。撃ち合いになれば、向こうが上手じゃ', 3.6);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '羽柴秀次', '千石堀は落ちた。この勢いのまま、根来の寺へ寄せる', 3.4);
        L(4, '堀秀政', '寺には鉄砲衆が残っておりましょう。門前へ寄せる前に、竹束をそろえさせまする', 4);
        L(8.6, '筒井定次', '根来の衆の多くは、千石堀や積善寺の城へ出ておりました。寺は手薄のはず', 3.8);
        L(13, '羽柴秀次', '手薄でも、寺の鉄砲は侮るな。……明日の朝、発つ', 3.4);
      } else {
        L(0, '組の者', '幕の内では、竹束をそろえて寺の門へ寄せる、と話しておられるそうな', 3.6);
        L(4.4, '足軽', '寺に鉄砲とは。仏様もさぞ驚いておられよう', 3);
        L(8, '組頭', '笠を下げ、竹束の陰から出るな。それだけ覚えておけ', 3.2);
      }
      L(inner ? 17.4 : 12, '使番', '明日の朝、根来へ発つ。先手は秀次様の手じゃ', 3.2);
      L(inner ? 21.4 : 16, '組頭', '火縄を濡らすな。……支度をせよ', 3);
    };
    rt.after(12, go);
    rt.addInteract('jin-sengoku', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 忍城の前の館林の陣（要件書57 兵站・67）：館林の城が開いた後、北の忍へ向かう前。陣の口で草鞋と兵糧を配り、幕の内で忍の攻め方を話す
  //   史実の分け（docs/journey/t10_oshi.md の K364 の節）：天正十八年、石田三成・大谷吉継・長束正家らが館林城を開かせ、続いて忍城を囲んだ・
  //   忍城は沼と深田に囲まれた城だった は A。長束正家が豊臣の兵糧の奉行を務めた は A。軍議の言葉・草鞋の数は B（作り）
  //   この場面で水攻めは言わない（水を入れる決めは戦の中の丸墓山の軍議＝b_t10_oshi.js の②）。力攻めが先、の向きだけ見せる
  tatebayashi(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try {
      // 陣の口から見て左（+x）に兵糧の俵、右（-x）に草鞋の束（藁色の小箱を二段に積む）
      rt.scene.add(hyoro(W, 5.2, -15.5, 0));
      rt.scene.add(tawara(W, 3.4, -13.2, 0.3));
      const strawM = new THREE.MeshStandardMaterial({ color: 0xb59a5c, roughness: 1 });
      const sg = new THREE.BoxGeometry(0.14, 0.05, 0.28);
      for (let i = 0; i < 18; i++) {
        const x = -5.6 + (i % 6) * 0.22, z = -14.2 + (Math.floor(i / 6) % 2) * 0.34, y = W.heightAt(x, z) + 0.03 + (i >= 12 ? 0.06 : 0);
        const m = new THREE.Mesh(sg, strawM); m.position.set(x, y, z); m.rotation.y = (i % 3) * 0.2; rt.scene.add(m);
      }
    } catch (e) { /* 形が作れない時も話は進む */ }
    seatOn(rt, one('石田三成', 0, 13.5, Math.PI, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('大谷吉継', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('長束正家', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'toyotomi', horse: false }));
    // 草鞋を配る小者と、受け取りに並ぶ足軽三人
    one('小者', -5, -12.6, Math.PI, 'ashigaru', { weapon: 'none', hat: 'none' });
    for (let i = 0; i < 3; i++) one('足軽', -5 + (i - 1) * 0.9, -10.6 - i * 0.7, 0, 'ashigaru', { weapon: 'none', hat: i % 2 ? 'hachimaki' : 'jingasa' });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(1.5, '組頭', '館林の城は開いた。北の忍へ発つ前に、草鞋と兵糧を受け取っておけ', 4);
    rt.addInteract('jin-waraji', { x: -5, z: -11.6 }, '聞く　草鞋配り', () => {
      const k = F.wrI = ((F.wrI ?? -1) + 1) % 3;
      if (k === 0) L(0, '小者', '一人に五足ずつじゃ。忍の辺りは深田と沼で、草鞋がすぐ駄目になるそうな', 3.8);
      else if (k === 1) L(0, '足軽', '二万の兵に五足なら、十万足か……誰が編んだのやら', 3.2);
      else L(0, '小者', '米は長束様の差配で、小田原の陣から回しておる。粗末にするなよ', 3.4);
    }, { r: 2.4 });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '石田三成', '館林は数日で開いた。忍も同じく、まず寄せて攻める', 3.4);
        L(4, '大谷吉継', '忍は沼の中の城。道は細い土手ばかりで、一度に寄せられるのは一握りじゃ', 4);
        L(8.6, '長束正家', '二万の口を養う米は、長くは続きませぬ。囲むなら早う決めねば', 3.6);
        L(12.8, '石田三成', '殿下に、手ぬるいとは言わせぬ。……攻め方は、着いてから見る', 3.6);
      } else {
        L(0, '組の者', '幕の内では、石田様と大谷様が忍の攻め方を話しておられるそうな', 3.6);
        L(4.4, '足軽', '館林は数日で開いた。忍もすぐ開くじゃろう', 3);
        L(8, '組頭', '沼の城を甘う見るな。土手から落ちれば、首まで泥じゃ', 3.2);
      }
      L(inner ? 17.4 : 12, '使番', '明日、忍へ発つ。先手は石田様の手じゃ', 3.2);
      L(inner ? 21.4 : 16, '組頭', '草鞋の替えを腰に下げておけ。……支度をせよ', 3.2);
    };
    rt.after(12, go);
    rt.addInteract('jin-tatebayashi', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  nakairi(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    seatOn(rt, one('羽柴秀吉', 0, 13.5, Math.PI, 'busho', { flag: 'toyotomi', horse: false }));
    seatOn(rt, one('池田恒興', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'ageha', horse: false }));
    seatOn(rt, one('森長可', 2.6, 9.6, -Math.PI / 2, 'busho', { flag: 'tsuru', horse: false }));
    seatOn(rt, one('三好信吉', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'toyotomi', horse: false }));
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '楽田の御本陣じゃ。小牧山の徳川とにらみ合うて、もうひと月になる', 4));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '池田恒興', '徳川の本隊は小牧山に張り付いておる。手薄な三河へ回り込めば、家康は戻らずにはおれませぬ', 4.2);
        L(4.8, '森長可', '羽黒の負けを、取り返させてくだされ', 3);
        L(8.4, '羽柴秀吉', '……よかろう。信吉を大将に付ける。夜のうちに発て。気取られるなよ', 4);
        L(13, '三好信吉', '承った', 2.2);
      } else {
        L(0, '組の者', '池田様と森様が、三河へ回り込む策を出されたそうな', 3.4);
        L(4.4, '足軽', '二万も動かせば、気取られずには済むまい……', 3);
        L(8.4, '組頭', '口を慎め。決めるのは上の方々じゃ', 3);
      }
      L(inner ? 16 : 12.5, '使番', '三好信吉様、池田様、森様、堀様の手は、今夜のうちに発つ。松明は点けるな', 4.2);
      L(inner ? 21 : 17.5, '組頭', 'われらも信吉様の後に付く。……支度をせよ', 3.4);
    };
    rt.after(12, go);
    rt.addInteract('jin-nakairi', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 戸次川の前の軍議（要件書46・65-18）：殿下の本隊が着くまで動くなと命じられている。軍監の仙石は渡ると言い、長宗我部元親は止める
  //   史実の分け（docs/journey/t06_hetsugi.md の K364 の節）：秀吉は本隊の着くまで守りを固めよと命じていた・仙石秀久が渡河を決め、
  //   長宗我部信親・十河存保が討たれ大敗した・仙石は讃岐を取り上げられた は A。軍議で元親が止め仙石が押し切った形は通説（B）。言葉は B
  heshigawa(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    seatOn(rt, one('仙石秀久', 0, 13.5, Math.PI, 'busho', { horse: false }));
    seatOn(rt, one('長宗我部元親', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'katabami', horse: false }));
    seatOn(rt, one('長宗我部信親', 2.6, 9.6, -Math.PI / 2, 'busho', { flag: 'katabami', horse: false }));
    seatOn(rt, one('十河存保', -2.6, 11.5, Math.PI / 2, 'busho', { horse: false }));
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '戸次川の東の陣じゃ。殿下からは、本隊が着くまで動くなと言われておる', 4.2));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '仙石秀久', '鶴賀の城を見殺しにはできぬ。今夜のうちに川を渡り、島津を討つ', 3.6);
        L(4.2, '長宗我部元親', '島津は数が多い。川を背にして当たれば、退く道がござらぬ。殿下の本隊を待つべし', 4.2);
        L(9, '仙石秀久', '軍監はこの秀久じゃ。臆したか', 3);
        L(12.4, '十河存保', '……軍監の下知とあらば、従うまで', 3);
        L(16, '長宗我部信親', '父上。……先陣は、わたくしが', 3);
      } else {
        L(0, '組の者', '仙石様は渡ると言い、長宗我部様は待てと言うておられるそうな', 3.6);
        L(4.4, '足軽', '殿下は動くなと言われたのでは……。この寒さで、冬の川を渡るのか', 3.6);
        L(9, '組頭', '軍監の仙石様が決めれば、それまでじゃ', 3);
      }
      L(inner ? 20 : 13, '使番', '今夜、戸次川を渡る。先陣は長宗我部様、続いて十河様、仙石様', 4);
      L(inner ? 25 : 18, '組頭', '川の水は冷たいぞ。草鞋を濡らすな。……支度をせよ', 3.4);
    };
    rt.after(12, go);
    rt.addInteract('jin-heshigawa', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  // 関ヶ原の後（要件書52・65-23）：勝ったその日の夕、首実検の幕の外。勝っても終わらない＝すぐ佐和山へ
  //   史実の分け（docs/journey/k07_sawayama.md の K364 の節）：戦の後に家康が藤川台で首実検をした・三成は逃れていた・島津は退き口を破って逃れ、
  //   井伊直政はその追い討ちで手傷を負った・佐和山へは小早川・脇坂・朽木・小川・田中らが向かった は A。
  //   「勝って兜の緒を締めよ」と兜の緒を締め直した話は後の世の伝え（C）なので噂の形。大谷吉継の首が見つからなかった話は伝え（C）。言葉は B
  fujikawa(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2, W = rt.world;
    try { W.dayClock = null; W.setTime('dusk', true); if (W.setRainTarget) { W.setRainTarget(0.35); W.rainLevel = 0.35; } } catch (e) { /* 刻と雨のまま */ }
    seatOn(rt, one('徳川家康', 0, 13.5, Math.PI, 'busho', { flag: 'tokugawa', horse: false }));
    seatOn(rt, one('本多忠勝', 2.6, 11.5, -Math.PI / 2, 'busho', { flag: 'tokugawa', horse: false }));
    seatOn(rt, one('井伊直政', -2.6, 11.5, Math.PI / 2, 'busho', { flag: 'ii', horse: false }));
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '藤川台の内府様の御本陣じゃ。首実検が始まる。……声を立てるな', 4));
    let done = false;
    const go = () => {
      if (done) return; done = true;
      if (inner) {
        L(0, '井伊直政', '島津は、われらの真ん中を破って南へ逃れました。……この腕は、その時に', 4);
        L(4.6, '徳川家康', '治部は見つからぬか', 2.6);
        L(7.6, '本多忠勝', 'まだ。伊吹の山へ入ったと聞きまする', 3);
        L(11, '徳川家康', '勝って終わりではない。佐和山を攻めよ。先手は小早川', 3.6);
      } else {
        L(0, '組の者', '内府様は兜を被り直して、緒を締められたそうな。勝って兜の緒を締めよ、と', 4);
        L(4.6, '足軽', '雨と霧で、どれが誰の首かも分からぬほどじゃ', 3.2);
        L(8.4, '組の者', '大谷様の首は、とうとう見つからぬと聞く', 3.2);
      }
      L(inner ? 15.4 : 12.4, '使番', '小早川様の手を先手に、佐和山へ。治部少輔の城じゃ', 3.8);
      L(inner ? 20 : 17, '組頭', '今日勝ったばかりじゃが、休む間は無い。……支度をせよ', 3.6);
    };
    rt.after(12, go);
    rt.addInteract('jin-fujikawa', { x: 0, z: 2 }, '待つ　首実検の幕の外で', go, { r: 4, prio: 2 });
  },
  kanbeiGo(rt, J, one) {
    const F = rt.flags, kan = allyGroup(rt, { name: '黒田の主従', noRetinue: true, anchor: { x: 3, z: 10 }, facing: Math.PI, order: 'hold', noRout: true, width: 2, formation: 'column', aggro: 0, seekRange: 0, fixed: true, speed: 3 },
      [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', flag: 'kuroda', invuln: true, horse: true } }, { type: 'samurai', n: 2, o: { flag: 'kuroda', invuln: true, keep: true } }]);
    for (const u of kan.units) { u.invuln = true; u.noTarget = true; }
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    rt.after(1.5, () => rt.say('組頭', '平井山の御陣じゃ。軍議の幕の前で、下知を待て', 4));
    F.kgStep = 0;
    const go = () => {
      if (F.kgStep) return; F.kgStep = 1;
      L(0, '羽柴秀吉', '摂津の荒木殿が上様に背いた。誰ぞ、説きに行く者はおらぬか');
      L(4.5, '黒田官兵衛', '私が行きます。荒木殿とは知らぬ仲ではない。言葉で戻してみせまする');
      L(9.5, '羽柴秀吉', '頼む。……無理はするな', 3);
      rt.after(12.5, () => { if (rt.flags !== F) return; kan.fixed = false; kan.order = 'move'; kan.dest = { x: 0, z: -44 }; kan.speed = 2.4; kan.onArrive = (g) => { for (const u of g.units) if (u.alive) rt.army.despawn(u); }; });
      L(15, '組の者', '軍師殿じゃ。使いなら、すぐに戻られよう', 3.2);
      // 日が過ぎる（暗転）。官兵衛は戻らない
      rt.after(22, () => { if (rt.flags === F) rt.scene.visible = false; });
      rt.after(23.4, () => {
        if (rt.flags !== F) return;
        rt.scene.visible = true;
        rt.banner('ひと月の後', '官兵衛殿は、まだ戻らぬ');
        for (const u of kan.units) if (u.alive && !u.gone) rt.army.despawn(u);
      });
      L(26, '足軽', '官兵衛殿が戻らぬ。……どうなされたのじゃ', 3);
      L(30.5, '物見', '有岡の城に捕らわれた、と聞いた。……いや、荒木に付いた、とも', 3.6);
      L(35.5, '使番', '安土より。上様は、黒田は荒木に付いた、と仰せにござる', 3.6);
      L(40.5, '羽柴秀吉', '……官兵衛が、裏切るものか', 3.2);
      L(45, '組頭', '人質の御子は、どうなる……。さあ、支度をせよ。三木の城が先じゃ', 4);
    };
    // 軍議の幕の前に来るか、少し歩いたら始まる
    rt.after(10, go);
    rt.addInteract('jin-kanbei', { x: 0, z: 2 }, '聞く　軍議の幕', go, { r: 4, prio: 2 });
  },
  kanbeiBack(rt, J, one) {
    const F = rt.flags, inner = ladderStep(rt.G || {}) >= 2;
    // 戻った官兵衛：杖を突き、従者に支えられて幕の前をゆっくり歩く（土牢の一年で足を悪くした）
    const kan = allyGroup(rt, { name: '黒田の主従', noRetinue: true, anchor: { x: -12, z: -3 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 2, formation: 'column', aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'busho', n: 1, o: { name: '黒田官兵衛', flag: 'kuroda', invuln: true, horse: false, weapon: 'none', hat: 'hachimaki' } }, { type: 'samurai', n: 1, o: { flag: 'kuroda', invuln: true, keep: true, weapon: 'none' } }]);
    for (const u of kan.units) { u.invuln = true; u.noTarget = true; }
    rt.after(1.5, () => rt.say('組頭', '太閤ヶ平の御陣じゃ。……幕の前を見よ。黒田官兵衛殿じゃ', 4));
    rt.after(3, () => { if (rt.flags !== F) return; kan.fixed = false; kan.order = 'move'; kan.dest = { x: 9, z: -3 }; kan.speed = 0.55; kan.onArrive = (g) => { g.order = 'hold'; }; });
    const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
    L(7, '足軽', 'あれが官兵衛殿か……足を引いておられる', 3);
    L(11.5, '組の者', '有岡の土牢に一年じゃ。頭も膝も、もう元には戻らぬそうな', 3.6);
    if (inner) {
      L(17, '黒田官兵衛', '……城の中の者が何を食うておるか、わしはよう知っておる', 3.6);
      L(23.5, '黒田官兵衛', 'それでも、鳥取は兵糧で落とす。槍で死なせるより、早う開かせる', 3.8);
    } else {
      L(17, '組頭', '軍師殿は、前より口数が少のうなられた', 3.2);
    }
    L(inner ? 28 : 23, '足軽', '竹中様が、官兵衛殿の御子を匿うておられた、と噂じゃ。……竹中様はもう亡い', 4);
  },
};

// ======================================================================
// K364 ② 清洲会議（天正十年六月二十七日・尾張 清洲城）。drama_req_1117 19〜23。
//   足軽まで：評定の間には入れず、庭と縁から武将の出入りと声だけ。足軽大将候補より上：評定の座に控えて聞く。
//   座って話しているだけなのに張り詰める。済むと秀吉と勝家が廊下から別々の方へ歩き去る（もう同じ側ではない）。
//   史実の分け（docs/journey/t02_shizugatake.md の K364 の節）：跡目＝三法師・長浜は勝家へ・山城と丹波は秀吉へ は A。
//   勝家が信孝を推した形は通説（B）。言葉はゲームの再構成（B）。秀吉が三法師を抱いて現れた話は軍記の伝え（C）なので入れない。
// ======================================================================
const KY = { room: { x: 0, z: 10, w: 14, d: 10 }, door: { x: 0, z: 4.2 }, gate: { x: 0, z: -27 }, shop: { x: -17, z: -3 } };
function buildKiyosu(rt, J) {
  const game = rt.game, G = rt.G, F = rt.flags;
  const inner = F.kyInner = ladderStep(G || {}) >= 2;
  try { F.kyRoom = buildRoom(rt, KY.room.x, KY.room.z, { w: KY.room.w, d: KY.room.d, council: true, rot: Math.PI }); } catch (e) { F.kyRoom = null; }
  for (const [x, z] of [[-9, 2], [9, 2], [-6, -12], [6, -12]]) rt.scene.add(kagaribi(W0(rt), x, z));
  // 城の出入りの口：冠木門と白壁の土塀（野原に印だけが浮かないように。門は開けたまま、通り道は塞がない）
  try {
    const W = W0(rt), gz = KY.gate.z;
    rt.scene.add(kabukimon(W, KY.gate.x, gz, 5, 0, { doors: false }));
    for (const seg of [[-34, gz, -3.2, gz], [3.2, gz, 34, gz]]) rt.scene.add(dobei(W, seg, { shikkui: true, kawara: true }));
  } catch (e) { /* 門なしでも進む */ }
  const one = (name, x, z, facing, type = 'busho', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name: name || undefined, flag: null, invuln: true, weapon: 'none', horse: false, ...o } }]);
    return g;
  };
  // 評定の座：上座に三法師（幼い。言葉は無い）、左右に向き合う四人の宿老
  const R = KY.room;
  F.kySanbo = one('三法師', R.x, R.z + 3.4, Math.PI, 'porter', { hat: 'none', kosode: 1, kosodeCol: 0x8a2a24, haori: null, mon: null });
  try { for (const u of F.kySanbo.units) u.mesh?.scale.setScalar(0.62); } catch (e) { /* そのままの丈でも進む */ }
  // 城の中の評定は甲冑でなく小袖・袴の姿（要件書62。色は家ごとに分けるだけで、細かな服飾は考証の前の仮）
  const ko = (col) => ({ kosode: 1, kosodeCol: col, hat: 'none', haori: null, armor: col, lace: 0x2a2622, cloth: col });
  F.kyHide = one('羽柴秀吉', R.x - 2.6, R.z + 0.6, Math.PI / 2, 'samurai', ko(0x7a4a2a));
  F.kyShiba = one('柴田勝家', R.x + 2.6, R.z + 0.6, -Math.PI / 2, 'samurai', ko(0x2a2c36));
  one('丹羽長秀', R.x - 2.6, R.z + 2.4, Math.PI / 2, 'samurai', ko(0x3e4a36));
  one('池田恒興', R.x + 2.6, R.z + 2.4, -Math.PI / 2, 'samurai', ko(0x5a4a30));
  // 庭：西に羽柴の家来、東に柴田の家来。互いに目を合わせない
  F.kyHa = allyGroup(rt, { name: '羽柴の家来', anchor: { x: -9, z: -2 }, facing: Math.PI / 2, width: 4, formation: 'line', order: 'hold', noRout: true, aggro: 0, seekRange: 0, fixed: true },
    [{ type: 'samurai', n: 4, o: { flag: 'toyotomi', invuln: true, keep: true } }]);
  F.kySb = allyGroup(rt, { name: '柴田の家来', anchor: { x: 9, z: -2 }, facing: -Math.PI / 2, width: 4, formation: 'line', order: 'hold', noRout: true, aggro: 0, seekRange: 0, fixed: true },
    [{ type: 'samurai', n: 4, o: { flag: 'kari', invuln: true, keep: true } }]);
  // 戸口の番士（名札は出さない。声だけ「番士」）
  F.kyBan = [one(null, KY.door.x - 1.8, KY.door.z - 0.6, Math.PI, 'ashigaru', { weapon: 'yari' }), one(null, KY.door.x + 1.8, KY.door.z - 0.6, Math.PI, 'ashigaru', { weapon: 'yari' })];
  for (const g of [F.kyHa, F.kySb]) for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  rt.addInteract('jin-shop', KY.shop, '直す　武具（具足師）', () => game.townOpen('shop'), { r: 3 });
  one('具足師', KY.shop.x, KY.shop.z + 1.5, -Math.PI / 2, 'porter');
  rt.addInteract('jin-news', { x: -6, z: -12 }, '聞く　城の噂', () => {
    // 山崎の後の京（要件書42）：明智の残党狩り・安土の城が焼けた（A）・信長亡き後の空白（B）も噂で
    const N = ['京では明智の残りの者が狩られておる。安土の御城も焼けたそうな', '上様も中将様も亡うなられて、誰が天下を見るのか、皆が様子をうかがっておる', '柴田様は越前へ戻られた。長浜の城は甥御の勝豊様の手じゃ', '岐阜の信孝様も、三法師様を手放されぬそうな', '冬になれば越前は雪で道が閉じる。柴田様は春まで動けまい'];
    const i = F.kyNews || 0; F.kyNews = i + 1; rt.say('城の者', N[i % N.length], 5);
  }, { r: 3 });
  rt.addInteract('door-gate', KY.gate, '任務を受けて出陣する', () => game.townSortie(), { r: 3.5 });
  rt.marker('mk-boss', KY.door, '');   // 字を出さない（K364）
  rt.marker('mk-gate', KY.gate, '');
  rt.flags.doors = { boss: KY.door, shop: KY.shop, gate: KY.gate };
  F.kyStep = 0;
  rt.after(1.5, () => rt.say('組頭', inner ? '清洲の御城じゃ。上様の御跡目を決める評定に、お主も控えよとの仰せじゃ'
    : '清洲の御城じゃ。上様の御跡目を決める評定があるそうな。足軽は庭までじゃぞ', 5));
}
function W0(rt) { return rt.world; }
function kyAfter(rt, sec, fn) { const F = rt.flags; rt.after(sec, () => { if (rt.flags === F && !rt.over) fn(); }); }
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
// 堀の土の塊を、埋まり具合（0＝空・1＝地面の高さ）の所へ置く
function horiPlace(H) {
  H.boxes.forEach((m, i) => { const p = H.p[i]; m.visible = p > 0.01; m.position.y = m.userData.g - 0.08 - (1 - p) * 2.3 - 1.3; });
}
function horiTick(rt, dt) {
  const H = rt.flags.hori;
  if (!H) return;
  H.t += dt;
  const k = H.p.findIndex((p) => p < 1);
  if (k >= 0) { H.p[k] = Math.min(1, H.p[k] + dt / 12); horiPlace(H); }
  else if (!H.done) { H.done = true; rt.say('組頭', '外の堀は平らになった。次は、城から打って出るしかあるまい', 4); }
  // 人足：二人で前後にもっこを担ぎ、土の山と堀の縁を行き来する。縁で一息置いて土を落とす
  for (const q of H.porters) {
    const [a, b] = q.pair.map((g) => g.units[0]);
    if (!a || !b || !a.alive || !b.alive) continue;
    const to = q.toMoat ? q.dump : q.pile;
    const dx = to.x - a.pos.x, dz = to.z - a.pos.z, dd = Math.hypot(dx, dz) || 1;
    if (q.wait > 0) {
      q.wait -= dt;
      if (q.wait <= 0) { q.toMoat = !q.toMoat; if (!q.toMoat) { q.full = false; } else q.full = true; }
    } else if (dd < 1.2) {
      q.wait = q.toMoat ? 1.6 : 1.2;
      // 縁に着いたら土を堀へ落とす（落ちて消える。区切りの埋まりを少し進める）
      if (q.toMoat && q.full) { q.drop = { y: 0, vy: 0, x: q.load.position.x, z: q.load.position.z + 1.2 }; const k = H.p.findIndex((p) => p < 1); if (k >= 0) H.p[k] = Math.min(1, H.p[k] + 0.04); }
    } else {
      // 前の者は行き先へ、後ろの者は一メートル半あとを付いて行く
      const ux = dx / dd, uz = dz / dd;
      for (const [g, back] of [[q.pair[0], 0], [q.pair[1], 1.5]]) {
        const d2 = { x: to.x - ux * back, z: to.z - uz * back };
        if (g.order !== 'move' || !g.dest || Math.abs(g.dest.x - d2.x) + Math.abs(g.dest.z - d2.z) > 0.6) { g.order = 'move'; g.dest = d2; g.anchor = { ...d2 }; }
      }
    }
    // 天秤棒と網：二人の肩の間に渡し、網は真ん中に下げる
    const sy = 1.42, mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2, my = (a.pos.y + b.pos.y) / 2 + sy;
    // 二人の間が離れた時（曲がり角）も、棒は二メートル足らずに留め、前の者の側へ寄せる
    const L = Math.min(1.9, Math.max(0.6, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)));
    q.pole.position.set(mx, my, mz); q.pole.scale.set(1, L + 0.4, 1);
    q.pole.quaternion.setFromUnitVectors(_up, _dir.set(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z).normalize());
    // 担ぐ二人のどちらかがカメラの前で消えている時（味方を透かす決まり）は、棒と網も出さない（宙に棒だけが浮いた）
    const seen = a.mesh.visible && b.mesh.visible;
    q.pole.visible = seen;
    q.load.visible = seen && q.full; q.load.position.set(mx, my - 0.45, mz);
    if (q.drop) {
      const D = q.drop; D.vy -= 9.8 * dt; D.y += D.vy * dt;
      if (!q.dropM) { q.dropM = q.load.clone(); rt.scene.add(q.dropM); }
      q.dropM.visible = true; q.dropM.position.set(D.x, my - 0.45 + D.y, D.z);
      if (D.y < -2.6) { q.dropM.visible = false; q.drop = null; }
    }
  }
}
// 平野の本陣：使番を本陣の幕へ走らせ、着いたら知らせる。荷駄の人足は米俵を担いで置き場と本陣の脇を行き来する
// 坂本の本陣：十秒で書状を持った使者が騎馬で陣の口から出て行き、十八秒で池田恒興の使者が駆け込む
function komakiTick(rt, dt) {
  const K = rt.flags.komaki;
  if (!K) return;
  const F = rt.flags;
  if (!K.sent && rt.t > 10) { K.sent = true; const g = K.out; g.order = 'move'; g.dest = { x: 2, z: -40 }; g.anchor = { ...g.dest }; rt.say('組頭', '書状を持った使者が出る。道を空けよ', 2.8); }
  if (!K.ran && rt.t > 18) { K.ran = true; const g = K.inn; g.order = 'move'; g.dest = { x: -1.5, z: -12.6 }; g.anchor = { ...g.dest }; }
  const u = K.inn.units[0];
  if (K.ran && !K.told && u && Math.hypot(u.pos.x + 1.5, u.pos.z + 12.6) < 1.6) {
    K.told = true;
    rt.say('使者', '池田恒興様より！羽柴方に付き、尾張の犬山の城を取られた由！', 4);
    rt.after(4.4, () => { if (rt.flags === F && !rt.over) rt.say('羽柴秀吉', 'よし。勝入（恒興）が付けば、美濃は揺れぬ。書状をもっと書け', 4); });
    rt.after(8.8, () => { if (rt.flags === F && !rt.over) rt.say('組の者', '一通の書状で、城が一つこちらへ来る……', 3); });
  }
}
// 石垣山：修羅（大石を載せた橇）を四人が曳いて石垣の前まで進め、着いたら石の置き場へ戻って曳き直す
function ishigakiTick(rt, dt) {
  const K = rt.flags.ishi;
  if (!K || !K.sled || !K.go) return;
  const g = K.pull, lead = g.units[0];
  if (!lead) return;
  const to = K.back ? { x: -11, z: 6.6 } : { x: -11, z: 14.2 };
  if (Math.hypot(lead.pos.x - to.x, lead.pos.z - to.z) < 1.2) { K.back = !K.back; return; }
  if (g.order !== 'move' || !g.dest || g.dest.z !== to.z) { g.order = 'move'; g.dest = to; g.anchor = { ...to }; }
  // 修羅は曳く者たちの後ろ（石垣へ向かう時）・前（戻る時）に付いて動く
  let cx = 0, cz = 0, n = 0; for (const u of g.units) if (u.alive) { cx += u.pos.x; cz += u.pos.z; n++; }
  if (!n) return; cx /= n; cz /= n;
  const sz = cz - (K.back ? -2.2 : 2.2);
  K.sled.position.set(cx, rt.world.heightAt(cx, sz), sz);
}
// 赤坂の陣：十五秒で使番が家康の着陣を告げ、金の扇の馬印をゆっくり上げる
function akasakaTick(rt, dt) {
  const K = rt.flags.aka;
  if (!K) return;
  const F = rt.flags, r = K.runner, u = r.units[0];
  if (!K.ran && rt.t > 15) { K.ran = true; r.order = 'move'; r.dest = { x: 1.5, z: 6.5 }; r.anchor = { ...r.dest }; }
  if (K.ran && !K.told && u && Math.hypot(u.pos.x - 1.5, u.pos.z - 6.5) < 1.6) {
    K.told = true;
    rt.say('使番', '内府様、御着陣！', 2.6);
    rt.after(3.2, () => { if (rt.flags === F && !rt.over) rt.say('足軽', '金の扇じゃ……内府様が来られた！', 3); });
    rt.after(6.6, () => { if (rt.flags === F && !rt.over) rt.say('組の者', '川向こうの大垣の城がざわついておるぞ', 3.2); });
    rt.after(10.2, () => { if (rt.flags === F && !rt.over) rt.say('組頭', '浮かれるな。下知があるまで、川を越えてはならぬ', 3.6); });
  }
  if (K.told && K.uma && K.up < 7.5) { const d = Math.min(7.5 - K.up, dt * 2.2); K.up += d; K.uma.position.y += d; }
}
// 河田の陣：十秒で江戸からの使者を本陣へ走らせ、書状を読ませる
function kawadaTick(rt, dt) {
  const K = rt.flags.kawa;
  if (!K) return;
  for (const [i, f] of (rt.flags.kawaFlame || []).entries()) { const t = rt.t * (7 + i * 3); f.scale.set(1 + Math.sin(t) * 0.08, 1 + Math.sin(t * 1.7 + i) * 0.15, 1 + Math.cos(t) * 0.08); }
  const F = rt.flags, r = K.runner, u = r.units[0];
  // 知らせの前は、勝ちを喜ぶ兵が時々腕を上げる（知らせの後は止む）
  if (!K.told && (K.cheerT -= dt) <= 0) { K.cheerT = 2.6; for (const v of K.glad) if (v.alive && Math.random() < 0.5) v.cheer = 1.4; }
  if (!K.ran && rt.t > 10) { K.ran = true; r.order = 'move'; r.dest = { x: 1.5, z: 6.5 }; r.anchor = { ...r.dest }; }
  if (K.ran && !K.told && u && Math.hypot(u.pos.x - 1.5, u.pos.z - 6.5) < 1.6) {
    K.told = true;
    rt.say('使者', '江戸の内府様より御書状！「木曽川を越えた働き、まことに見事」との由', 4.2);
    rt.after(4.6, () => { if (rt.flags === F && !rt.over) rt.say('池田輝政', '内府様はまだ江戸を動かれぬ。働きで示せ、ということよ', 3.8); });
    rt.after(9, () => { if (rt.flags === F && !rt.over) rt.say('組頭', '明朝、岐阜の城へかかる。今夜のうちに足を休めよ', 3.6); });
  }
}
// 金ヶ崎の陣中：十秒で使番を本陣へ走らせ、浅井の離反を告げる。軍議で退くと決まる
function kanegasakiTick(rt, dt) {
  const K = rt.flags.kane;
  if (!K) return;
  const F = rt.flags, r = K.runner, u = r.units[0];
  // 知らせの前は、勝ちを喜ぶ兵が時々腕を上げる（知らせの後は止む）
  if (!K.told && (K.cheerT -= dt) <= 0) { K.cheerT = 2.6; for (const v of K.glad) if (v.alive && Math.random() < 0.5) v.cheer = 1.4; }
  if (!K.ran && rt.t > 10) { K.ran = true; r.order = 'move'; r.dest = { x: 1.5, z: 6.5 }; r.anchor = { ...r.dest }; }
  if (K.ran && !K.told && u && Math.hypot(u.pos.x - 1.5, u.pos.z - 6.5) < 1.6) {
    K.told = true;
    rt.say('使番', '申し上げます！近江の浅井長政殿、背かれた由！朝倉に付き、後ろを塞ぐ構え！', 4.2);
    rt.after(4.6, () => { if (rt.flags === F && !rt.over) rt.say('組の者', '……浅井様が？　殿の妹御の婿じゃぞ', 3.2); });
    rt.after(8.2, () => { if (rt.flags === F && !rt.over) rt.say('織田信長', '退く。朽木を越えて京へ戻る', 3.4); });
    rt.after(12, () => { if (rt.flags === F && !rt.over) rt.say('組頭', '殿（しんがり）は木下様が受け持たれるそうな。わしらもじゃ', 3.8); });
  }
}
function hiranoTick(rt, dt) {
  const H = rt.flags.hirano;
  if (!H) return;
  const F = rt.flags, r = H.runner, u = r.units[0];
  if (!H.ran && rt.t > 3) { H.ran = true; r.order = 'move'; r.dest = { x: 1.5, z: 6.5 }; r.anchor = { ...r.dest }; }
  if (H.ran && !H.told && u && Math.hypot(u.pos.x - 1.5, u.pos.z - 6.5) < 1.6) {
    H.told = true;
    rt.say('使番', '申し上げます！茶臼山に真田、赤備えで陣を据えた由！', 3.6);
    rt.after(4, () => { if (rt.flags === F && !rt.over) rt.say('徳川家康', '……天王寺口へ出る。将軍には岡山口を固めよと伝えよ', 4); });
    rt.after(8.5, () => { if (rt.flags === F && !rt.over) rt.say('組頭', '今日で終わる戦じゃ。手柄を焦って抜け駆けするなよ', 3.6); });
  }
  for (const c of H.carriers) {
    const v = c.g.units[0];
    if (!v || !v.alive) continue;
    const to = c.go ? c.to : c.from;
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { c.go = !c.go; c.full = c.go; } }
    else if (Math.hypot(v.pos.x - to.x, v.pos.z - to.z) < 1.1) c.wait = 1.4;
    else if (c.g.order !== 'move' || !c.g.dest || c.g.dest.x !== to.x || c.g.dest.z !== to.z) { c.g.order = 'move'; c.g.dest = to; c.g.anchor = { ...to }; }
    c.bale.visible = c.full && v.mesh.visible;
    c.bale.position.set(v.pos.x, v.pos.y + 1.62, v.pos.z);
    c.bale.rotation.y = v.heading || 0;
  }
}
function kiyosuTick(rt, dt) {
  const F = rt.flags, P = rt.player?.u?.pos, R = KY.room;
  // 宿老が戸口を通る間、番士は片膝をついて頭を下げる（要件書63）。今ある屈みの姿（_crouch。伏見の元忠の床几と同じ）を使う
  if (F.kyBowT > 0) {
    F.kyBowT -= dt;
    const on = F.kyBowT > 0;
    for (const g of F.kyBan || []) for (const u of g.units) u._crouch = on;
  }
  if (!P || F.kyStep === undefined) return;
  // 足軽は評定の間へ上がれない（戸口の手前で止める）
  if (!F.kyInner && Math.abs(P.x - R.x) < R.w / 2 + 0.4 && P.z > KY.door.z - 0.8 && P.z < R.z + R.d / 2 + 0.5) {
    P.z = KY.door.z - 0.8; rt.player.u.mesh?.position.copy(P);
    if (!F.kyBlockT || rt.t - F.kyBlockT > 15) { F.kyBlockT = rt.t; rt.say('番士', '足軽はここより先へは上がれぬ。縁の下に控えよ', 3); }
  }
  if (F.kyStep === 0 && Math.hypot(P.x - KY.door.x, P.z - KY.door.z) < (F.kyInner ? 4 : 7)) { F.kyStep = 1; kiyosuTalk(rt); }
}
function kiyosuTalk(rt) {
  const F = rt.flags, inner = F.kyInner;
  // 声：内にいれば顔を見て、外にいれば声だけ（同じ言葉の一部しか聞こえない）
  const L = inner ? [
    [0, '番士', '御着座を。声を立てるな'],
    [3.5, '柴田勝家', '上様の御跡は、三七殿（信孝）が継がれるのが道理であろう'],
    [8.5, '羽柴秀吉', '筋目から申せば、中将様（信忠）の御子、三法師様にござる'],
    [13.5, '柴田勝家', '三法師様は、まだ三つぞ'],
    [18, '丹羽長秀', '…………筋目は、三法師様じゃな'],
    [22.5, '池田恒興', 'わしも、それでよい'],
    [26.5, '丹羽長秀', '長浜の城は柴田殿へ。山城と丹波は羽柴殿へ'],
    [31, '柴田勝家', '……さようか'],
  ] : [
    [0, '組の者', '……評定の間から、声がする'],
    [5, '柴田勝家', '――信孝が継がれるのが道理であろう！'],
    [10.5, '羽柴秀吉', '――筋目から申せば、三法師様にござる'],
    [16, '組の者', '……声が止んだ。誰も口を開かん'],
    [22, '組頭', '決まったようじゃ。……柴田様の顔を見よ'],
  ];
  for (const [t, who, text] of L) kyAfter(rt, t, () => rt.say(who, text, 3.6));
  // 評定が済む：秀吉は西へ、勝家は東へ。秀吉が呼んでも勝家は振り返らない
  kyAfter(rt, inner ? 35 : 27, () => {
    F.kyStep = 2;
    // 座から戸口へ出て（壁を抜けない）、縁の先で左右へ分かれる。家来がそれぞれの主の後ろに付く
    const go = (g, home, side, dest) => {
      if (!g) return;
      const way = [{ x: side * 0.7, z: KY.room.z }, { x: side * 0.5, z: KY.door.z - 1.5 }, dest];
      const step = (q) => {
        const p = way.shift();
        q.order = p ? 'move' : 'hold'; q.dest = p || null; q.onArrive = p ? step : null;
        if (p !== dest) return;
        if (home) { home.fixed = false; home.order = 'move'; home.dest = { x: dest.x, z: dest.z - 3 }; home.speed = 1.4; }
      };
      g.fixed = false; g.speed = 1.4; step(g);
    };
    F.kyBowT = 5;
    go(F.kyHide, F.kyHa, -1, { x: -30, z: -6 });
    go(F.kyShiba, F.kySb, 1, { x: 30, z: -6 });
    rt.unmark('mk-boss');
  });
  kyAfter(rt, inner ? 39 : 31, () => rt.say('羽柴秀吉', '柴田殿！　……また、いずれ', 3));
  kyAfter(rt, inner ? 43 : 35, () => rt.say('組頭', '振り返られなんだ。……あのお二人、もう同じ道は歩かれまい', 4));
  kyAfter(rt, inner ? 49 : 41, () => { F.kyStep = 3; rt.say('組頭', '支度をせよ。いずれ、近江で柴田様と槍を合わせる日が来る', 4); rt.marker('mk-gate', KY.gate, '出陣の口'); });
}
