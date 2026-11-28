// 今川家編 三戦目「田原城の戦い」（天文十六年〔1547〕九月・三河国 田原城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：松平竹千代（のち家康）を駿府へ送る途中、田原の戸田康光が竹千代を奪い織田へ渡した。義元は田原城を攻め、戸田の家は滅んだ（『三河物語』B・田原市の解説 C）。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';
import { withCastle } from './light_castle.js';
import { TAHARA_PLAN } from './castles/tahara.js';   // K656 K655 11/28 クラウドさ：田原湾に突き出た丘の土の城（三の丸・本丸・二の丸・空堀・柵・櫓・大手門・搦手）

const SPAWN = { x: -170, z: 90 }, TAHA = { x: 45, z: -15 }, HON = { x: -112, z: 60 }, ATO = { x: -150, z: 80 };
const FACE = (3 * Math.PI) / 4;
// K656 K655（11/28 クラウドさ）：前は霧の野の丘だけで、組頭の言う「海風の吹く低地の城」の海が無かった。田原城は田原湾に突き出た丘で三方が海
//   （田原市の解説 C）。城の丘を本丸と二の丸の下まで広げ、東（x>120）と南（z>65・城下より東）の地面を浜から沖へ下げて、静かな海を二枚置く。
//   段の場所（浜の舟の湧き (95,5)・(105,-25)、浜の道 (11,29)・(25,15)）は陸のまま。
const sm = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const seaK = (x, z) => Math.max(sm((z - 64) / 24) * sm((x + 40) / 40), sm((x - 122) / 22));
const height = (x, z) => {
  const h = 2 * Math.sin(x * 0.024 + 2) * Math.cos(z * 0.02) + 11 * gauss(x, z, TAHA.x + 10, TAHA.z - 14, 2600), s = seaK(x, z);
  return h * (1 - s) - 3.2 * s;
};
const SEA = { depth: 2, still: true, levelAt: () => -0.6, waterColor: [0x557a80, 0x1f3a46] };

export const i03_tahara = withCastle(imagawaBattle({
  id: 'i03_tahara',
  date: '天文十六年（1547）九月　三河国 田原城',
  intro: '田原の戸田が、駿府へ送るはずの竹千代を織田へ渡した。田原城を攻める。あなたは今川の先手の足軽。',
  history: '天文十六年（1547）、松平竹千代は人質として駿府へ送られる途中、田原城主の戸田康光に奪われ、尾張の織田へ渡された。怒った義元は田原城を攻め、戸田の家は滅んだ（『三河物語』B・田原市の解説 C）。',
  sides: { a: { name: '今川の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '戸田康光の城方', mon: 'oda', faction: 'oda' } },
  force: { a: 3000, b: 600 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.45, friendsSend: 1, minutes: 5,   // 11/28 クラウドさ：城の柵と口が付き、門・本丸の段で敵が口から本人へ寄るので 0.55→0.45（act bot 二回とも終盤に倒れた）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1547, time: 'day', fogFar: 360 },
  allies: [
    { name: '朝比奈泰能の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('朝比奈泰能'), uS(3), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: TAHA.x - 8, z: TAHA.z + 6 }, { x: TAHA.x + 8, z: TAHA.z + 6 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['朝比奈泰能', '戸田は御屋形様を裏切った。田原を攻め落とす', 3.4], ['組頭', '山の城ではない。海風の吹く低地の城じゃ。海べりの道は狭い。列が伸びるぞ', 3.4]] },
    { kind: 'move', at: { x: -50, z: 30 }, label: '田原の城下の手前', obj: '細った帯をたどり、本隊を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '後ろが遅れておる。走って寄せよ', 3.2]] },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '城下に出た戸田の手を討つ', title: '田原の城下', sub: '戸田康光の手', max: 120, limit: 110,
      say: [['戸田康光', '織田様が付いておる。今川など恐れるな', 3.2]],
      foes: [{ name: '戸田の城方', from: { x: TAHA.x - 8, z: TAHA.z - 14 }, list: [busho('戸田康光', { horse: false }), uS(4), uA(13), uB(3)] }],
      later: [{ t: 30, say: ['組頭', '海の方からも来た！'], foes: [{ name: '戸田の別手', from: { x: TAHA.x - 30, z: TAHA.z + 24 }, list: [uS(2), uA(7)] }] }],
      reward: '田原の城下で戸田の手を退けた' },
    { kind: 'move', at: { x: TAHA.x - 4, z: TAHA.z + 4 }, label: '田原城', obj: '城の門まで詰める', r: 14, max: 110,
      say: [['朝比奈泰能', '門まで詰めよ。戸田の城はこれまでじゃ', 3.2]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'fight', at: { x: TAHA.x - 6, z: TAHA.z + 8 }, obj: '田原城の門の前で、戸田の守りを崩す', title: '田原城の門', sub: '戸田の兵が門を固める', max: 120, limit: 120,
      say: [['朝比奈泰能', '門を破れ。戸田を逃がすな', 3]],
      foes: [{ name: '田原の門の守り', from: { x: TAHA.x, z: TAHA.z }, list: [{ type: 'samurai', n: 1, o: { name: '戸田の組頭' } }, uS(3), uA(12), uB(4)] }],
      later: [{ t: 30, say: ['戸田の侍', '海の方から回れ！'], foes: [{ name: '浜の戸田', from: { x: TAHA.x + 30, z: TAHA.z + 30 }, list: [uS(2), uA(8)] }] }],
      reward: '田原城の門を破った' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [['組頭', '帯を見よ。城の中へ入ると切れやすい。本隊を寄せよ', 3.4]] },
    { kind: 'hold', at: { x: TAHA.x - 2, z: TAHA.z + 2 }, label: '門の内', obj: '門の内で、本丸から打って出る戸田の兵を受け止める', r: 14, dur: 60, title: '門の内', sub: '戸田の兵が本丸から下りる',
      say: [['朝比奈泰能', '本隊が入るまで、門の内を守れ', 3]],
      waves: [
        { t: 3, foes: [{ name: '本丸の戸田', from: { x: TAHA.x + 14, z: TAHA.z - 20 }, list: [uS(3), uA(10)] }] },
        { t: 30, say: ['見張り', '鉄砲の音じゃ！'], foes: [{ name: '戸田の弓衆', from: { x: TAHA.x + 24, z: TAHA.z - 6 }, list: [uS(1), uB(6), uA(4)] }] }],
      reward: '門の内を守った' },
    { kind: 'fight', at: { x: TAHA.x + 14, z: TAHA.z - 18 }, obj: '本丸の前で、戸田康光の旗本を崩す', title: '本丸', sub: '康光が最後の兵をまとめる', max: 120, limit: 120,
      say: [['朝比奈泰能', '康光の旗じゃ。突け！', 3]],
      foes: [{ name: '戸田康光の旗本', from: { x: TAHA.x + 20, z: TAHA.z - 24 }, list: [busho('戸田康光', { mustLive: false, invuln: false }), uS(3), uA(10)] }],
      reward: '戸田康光の旗本を崩した' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: TAHA.x + 14, z: TAHA.z - 18 }, label: '本丸', obj: '本丸を押さえ、浜から舟で来た戸田の一族を受け止める', r: 16, dur: 70, title: '浜の舟', sub: '戸田の一族が舟で戻って来た',
      say: [['朝比奈泰能', '本丸は取った。浜から来る者を寄せるな', 3]],
      waves: [
        { t: 3, foes: [{ name: '舟の戸田', from: { x: TAHA.x + 50, z: TAHA.z + 20 }, list: [{ type: 'samurai', n: 1, o: { name: '戸田の侍' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '弓じゃ！'], foes: [{ name: '舟の弓', from: { x: TAHA.x + 60, z: TAHA.z - 10 }, list: [uS(1), uB(7), uA(4)] }] }],
      reward: '本丸を守り切った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TAHA.x - 40, z: TAHA.z + 24 }, obj: '城下の町口で、逃げ込む戸田の足軽を追い散らす', max: 100, limit: 90,
      say: [['組頭', '町の口を塞げ。城へ逃がすな', 3.2]],
      foes: [{ name: '戸田の足軽', from: { x: TAHA.x - 28, z: TAHA.z + 12 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '町の口を押さえた' },
    { kind: 'hold', at: { x: TAHA.x - 20, z: TAHA.z + 30 }, label: '浜の道で、舟', obj: '浜の道で、舟で渡って来る戸田の加勢を受け止める', r: 16, dur: 45,
      say: [['見張り', '浜に舟が着く！　上げさせるな', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '浜へ着く戸田の加勢', from: { x: TAHA.x - 8, z: TAHA.z + 18 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '浜へ着く戸田の加勢', from: { x: TAHA.x - 34, z: TAHA.z + 44 }, list: [uS(2), uA(7)] }] }],
      reward: '浜の道を守った' },
    { kind: 'fight', at: { x: TAHA.x + 20, z: TAHA.z - 30 }, obj: '二の丸の櫓の下で、鉄砲を構える戸田の兵を討つ', max: 100, limit: 90,
      say: [['組頭', '櫓の下へ付け。撃たせるな', 3.2]],
      foes: [{ name: '櫓の鉄砲の兵', from: { x: TAHA.x + 32, z: TAHA.z - 42 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '二の丸の櫓の下を押さえた' },
    // K656 K652⑥ 逸話の段（戸田康光は竹千代を織田へ渡した城主で、田原城で討たれた（『三河物語』B））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: TAHA.x + 8, z: TAHA.z - 10 }, obj: '本丸に踏みとどまる戸田康光を討つ', title: '本丸', sub: '戸田康光、本丸に立つ', max: 100, limit: 100,
      say: [['戸田康光', '竹千代を渡したは、わしの意地じゃ！', 3], ['組頭', '本丸の康光を討て。逃がすな！', 3]],
      foes: [{ name: '戸田康光', from: { x: TAHA.x + 8 + 12, z: TAHA.z - 10 + -14 }, list: [busho('戸田康光', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '本丸で戸田康光を討った' },
  ],
  win: { banner: '田原城', sub: '戸田を討った', award: '田原城を攻め、竹千代を奪った戸田を討った', say: [['朝比奈泰能', 'よう働いた。竹千代は、いずれ取り戻す', 3.4]] },
  land: {
    // 海は歩けない（act bot で、退く敵を追って本人が東の海の底を三百m 歩いた）。川と同じ深さの当たり
    riverCross: true,
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-50, 30], [45, -15]]],
    treeDensity: (x, z) => (seaK(x, z) > 0.08 ? 0 : 0.6), clear: (x, z) => [SPAWN, TAHA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 380, tufts: 1600,
    streams: [{ ...SEA, pts: [[10, 250], [120, 215], [420, 200]], w: 150 }, { ...SEA, pts: [[270, -440], [270, 240]], w: 130 }],
  },
}), { plan: TAHARA_PLAN, at: { x: TAHA.x, z: TAHA.z }, lift: 0, team: 1, life: false });
export default i03_tahara;
