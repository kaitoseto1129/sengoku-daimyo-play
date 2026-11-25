// 毛利家編 十戦目「備中高松城の戦い（毛利の救援）」（天正十年〔1582〕五〜六月・備中国 高松）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：羽柴秀吉は清水宗治の籠る備中高松城を足守川の水で囲んだ（水攻め）。毛利輝元・吉川元春・小早川隆景は約五万（通説）で救援に着いたが、
//   水に囲まれた城へは近づけず、織田信長の来援（本能寺の前）の知らせもあって、安国寺恵瓊が和睦を結ぶ使いに立った。本能寺の急報は毛利に遅れて入り、
//   秀吉は和睦を急いで「大返し」へ向かう（『太閤記』B・『毛利家文書』A。数は通説）。織田家編の備中高松（大返しの前）を毛利の側から見る。
//   調略の最後：両陣の間に立つ羽柴方の使いの備（約百五十を二十人で）へ、和睦の密書を届け切ると、その備は旗の縁が赤→藍に変わる（寝返りでなく「停戦の使い」の形に縮めた・推）。
//   水に囲まれた低い湿地の見た目は、足守川の広い浅瀬（streams）。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const HASHIBA = { flag: 'oda', armor: 0x34322e };   // 羽柴の旗は織田家の旗（秀吉は1582年には織田家臣）
const SPAWN = { x: 90, z: -80 };           // 毛利の本陣（岩崎山・日差山の高み）
const TUTSUMI = { x: 30, z: -26 };         // 水攻めの堤の外
const ENVOY = { x: -10, z: 24 };           // 両陣の間・羽柴方の使いの備
const HOLD = { x: -24, z: 40 };            // 堤の外の湿地
const SHIRO = { x: -50, z: 88 };           // 水に囲まれた高松城の前（堤の向こう）

function scene(rt) {
  const W = rt.world;
  try { for (const [dx, dz] of [[-6, 4], [8, 6], [16, 12]]) rt.scene.add(nobori(W, SHIRO.x + dx, SHIRO.z + dz, 'oda', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m10_takamatsu = lightBattle({
  id: 'm10_takamatsu',
  date: '天正十年（1582）六月　雨　備中国 高松',
  intro: '羽柴秀吉は高松城を水で囲んだ。毛利の五万は救援に着いたが、水に阻まれて動けない。和睦の使いに、密書を運べ。',
  history: '天正十年（1582）五月、羽柴秀吉は清水宗治の籠る備中高松城を、足守川の水を引いて囲んだ（水攻め）。毛利輝元・吉川元春・小早川隆景は五万ほどで救援に着いたが、水に囲まれた城に近づけない。信長の来援の知らせもあり、毛利は安国寺恵瓊を使いに立てて和睦を探った。六月、本能寺の急報が秀吉に入り、秀吉は和睦を急いだ。清水宗治の切腹と引き換えに城は開かれ、秀吉は大返しに向かった（『太閤記』・『毛利家文書』。数は通説）。',
  sides: { a: { name: '毛利輝元の軍', mon: 'mori', faction: 'mori' }, b: { name: '羽柴秀吉の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 50000, b: 30000 },
  allyLook: MORI, foeLook: HASHIBA,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 0.8 },
  world: {
    seed: 1582, time: 'day', fogFar: 320, rain: 0.4, overcast: true, wetStart: true,
    hills: [[90, -90, 56, 18], [-120, -20, 50, 8], [130, 40, 50, 9]],
    river: [[-150, 120], [-60, 118], [60, 124], [160, 120]], riverW: 36, riverDepth: 0.5,   // 水攻めの水（足守川の広い浅瀬・城の向こう）
    paths: [{ pts: [[90, -80], [30, -26], [-10, 24], [-24, 40], [-50, 88]], w: 2.8 }],
    groves: [{ x: 110, z: -20, r: 32, n: 30 }, { x: -90, z: 10, r: 30, n: 22 }],
    trees: 330, tufts: 1500,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '小早川隆景の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('小早川隆景'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  // 調略の糸：両陣の間に立つ羽柴方の使いの備（和睦の密書を受ける）
  turncoats: [{ key: 'envoy', name: '羽柴方の使いの備', at: ENVOY, face: Math.PI * 0.1, list: [uS(2), uA(12), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'oda', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['小早川隆景', '高松の城は、水の中に浮いておる。五万でも近づけぬ', 3.4],
      ['安国寺恵瓊', '殿、信長公の来援が近いと聞きます。和睦の道を、探らねばなりませぬ', 3.6],
      ['小早川隆景', 'お主、恵瓊の書状を、羽柴の使いの備へ届けよ。斬られる前に、渡せ', 3.4]] },
    { kind: 'move', at: TUTSUMI, label: '堤の外', obj: '水攻めの堤の外まで進む', r: 12, max: 120,
      say: [['組頭', '羽柴の物見が堤から見ておる。雨の陰を伝え', 3]] },
    { kind: 'fight', at: HOLD, obj: '堤の外へ出た羽柴の先手を払う', title: '堤の外', sub: '羽柴の先手が毛利の物見を討ちに出る',
      say: [['吉川元春', '羽柴の先手が出た！　使いの道を開け！', 3.2]],
      foes: [{ name: '羽柴の先手', from: { x: HOLD.x + 6, z: HOLD.z + 6 }, list: [uS(3), uA(15)] }, { name: '羽柴の鉄砲', from: { x: HOLD.x - 10, z: HOLD.z + 4 }, list: [uS(1), uB(6)] }],
      reward: '堤の外の羽柴の先手を払い、使いの道を開いた' },
    { kind: 'chouryaku', target: 'envoy', at: ENVOY, label: '羽柴方の使い', obj: '羽柴方の使いの備へ、和睦の密書を届ける', r: 9, max: 100,
      say: [['安国寺恵瓊', '羽柴殿は、和睦を望んでおる。この書状を、使いの頭へ渡せ', 3.8]],
      turnSay: ['羽柴方の使いの頭', '恵瓊殿の書状、確かに受け取った。殿へお届けいたす', 3.6],
      failSay: ['組頭', '間に合わなんだか。羽柴の備は、まだ敵のままじゃ、構えよ！', 3.2],
      reward: '和睦の密書を届け、羽柴方の使いの備を停戦に就かせた' },
    { kind: 'hold', at: HOLD, label: '堤の外の湿地', obj: '和睦が結ばれるまで、血気にはやる羽柴の手を受け止める', r: 16, dur: 65,
      title: '和睦の前', sub: '和睦が結ばれるまで、湿地で持ちこたえる',
      say: [['吉川元春', '和睦の使いが進む間、持ちこたえよ！　ここで崩れれば和睦も崩れる！', 3.2]],
      waves: [{ t: 6, say: ['羽柴の将', '毛利を破るなら今ぞ！　押せ！'], foes: [{ name: '羽柴の将の手', from: { x: HOLD.x - 8, z: HOLD.z + 36 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', 'まだ来るぞ！　退くな！'], foes: [{ name: '羽柴の二の手', from: { x: HOLD.x + 14, z: HOLD.z + 36 }, list: [uS(2), uA(12)] }] }],
      reward: '和睦が結ばれるまで羽柴の手を受け止めた' },
  ],
  win: {
    banner: '高松の和睦', sub: '毛利と羽柴は和睦した', award: '備中高松で和睦の使いを運んだ',
    say: [['安国寺恵瓊', '和睦が成った。清水殿の切腹で、城は開く', 3.4],
      ['小早川隆景', '羽柴殿は急いでおる。何か、京であったのかもしれぬ', 3.6],
      ['組頭 与三左', 'お主の運んだ書状が、五万の戦を止めた。よう走った', 3.2]],
  },
});
export default m10_takamatsu;
