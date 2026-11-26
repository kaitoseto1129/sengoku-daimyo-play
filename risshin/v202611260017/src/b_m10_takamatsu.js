// 毛利家編 十戦目「備中高松城の戦い（毛利の救援）」（天正十年〔1582〕五〜六月・備中国 高松）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：羽柴秀吉は清水宗治の籠る備中高松城を足守川の水で囲んだ（水攻め）。毛利輝元・吉川元春・小早川隆景は約五万（通説）で救援に着いたが、
//   水に囲まれた城へは近づけず、織田信長の来援（本能寺の前）の知らせもあって、安国寺恵瓊が和睦を結ぶ使いに立った。本能寺の急報は毛利に遅れて入り、
//   秀吉は和睦を急いで「大返し」へ向かう（『太閤記』B・『毛利家文書』A。数は通説）。織田家編の備中高松（大返しの前）を毛利の側から見る。
//   調略の最後：両陣の間に立つ羽柴方の使いの備（約百五十を二十人で）へ、和睦の密書を届け切ると、その備は旗の縁が赤→藍に変わる（寝返りでなく「停戦の使い」の形に縮めた・推）。
//   水に囲まれた低い湿地の見た目は、足守川の広い浅瀬（streams）。字・札・ボタンは足さない
import * as THREE from 'three';
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const HASHIBA = { flag: 'oda', armor: 0x34322e };   // 羽柴の旗は織田家の旗（秀吉は1582年には織田家臣）
const SPAWN = { x: 90, z: -80 };           // 毛利の本陣（岩崎山・日差山の高み）
const TUTSUMI = { x: 30, z: -26 };         // 水攻めの堤の外
const ENVOY = { x: -10, z: 24 };           // 両陣の間・羽柴方の使いの備
const HOLD = { x: -24, z: 40 };            // 堤の外の湿地
const SHIRO = { x: -50, z: 88 };           // 水に囲まれた高松城の前（堤の向こう）
const UKITA = { x: 70, z: -10 };           // 日差山の麓（宇喜多の手が出る所・K652②）
const FUNE = { x: 4, z: -2 };              // 堤の際（羽柴の舟手が寄る所・K652②）
const MIEOKURI = { x: -32, z: 60 };        // 堤の際（清水宗治の舟を見送る所・K652②）
const KAMO = { x: 64, z: 34 };             // 境目の加茂城（羽柴の手が攻める・K652②）

// 11/26 クラウドす K655・K657②：水攻めの水と、水に浮く高松城。前は野の両軍しか写らず高松と当てられなかった。
//   地面は world.hills で、城の周りを浅く窪ませ（沼の田）、城の島を高め、南に堤（低い土の筋）を盛る。その上に平らな水を一枚置く。
//   高松城は石垣も天守も無い沼の平城（土塁と塀と櫓・岡山市の史跡の解説 C・『太閤記』B）。水に沈んだ村の屋根と立ち枯れの木を少し。形は基本形だけ・毎コマ作らない
const LAKE = { x: -50, z: 108 }, ISLE = { x: -46, z: 98 }, WATER_Y = -0.3;
const DIKE = [[-98, 88], [-74, 72], [-44, 65], [-14, 68], [12, 82]];
function dikeHills() {
  const out = [];
  for (let i = 0; i < DIKE.length - 1; i++) {
    const [ax, az] = DIKE[i], [bx, bz] = DIKE[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n, 4, 0.7]);
  }
  return out;
}
function floodAndCastle(rt) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0), g = new THREE.Group(); g.name = 'takamatsuFlood';
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x5d6660, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false, envMapIntensity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(66, 56, 1); water.position.set(LAKE.x, WATER_Y, LAKE.z + 4); water.renderOrder = 1; g.add(water);
  const earth = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 }), plaster = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.9 });
  const board = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.85 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0x6e6248, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1), prism = new THREE.CylinderGeometry(1, 1, 1, 3), pyr = new THREE.ConeGeometry(1, 1, 4);
  const put = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); return m; };
  const roof = (mat, x, y, z, len, w, ht, ry = 0) => { const m = new THREE.Mesh(prism, mat); m.rotation.set(0, ry, Math.PI / 2); m.scale.set(ht, len, w); m.position.set(x, y, z); g.add(m); };
  const top = h(ISLE.x, ISLE.z);
  // 本丸の土塁（八角に回す）と上の塀
  for (let i = 0; i < 8; i++) {
    if (i === 6) continue;   // 南の門の切れ目
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, r = 12, x = ISLE.x + Math.cos(a) * r, z = ISLE.z + Math.sin(a) * r, ry = -a + Math.PI / 2, y = h(x, z);
    put(box, earth, x, y + 0.5, z, 9.6, 1.6, 2.6, ry);
    put(box, plaster, x, y + 1.9, z, 9.4, 1.2, 0.35, ry);
    put(box, board, x, y + 2.6, z, 9.6, 0.18, 0.8, ry);
  }
  // 二重の櫓（白壁に板葺の寄棟）
  put(box, plaster, ISLE.x + 3, top + 2.4, ISLE.z + 2, 7, 4.8, 6);
  put(pyr, board, ISLE.x + 3, top + 5.6, ISLE.z + 2, 6.4, 1.8, 5.6, Math.PI / 4);
  put(box, plaster, ISLE.x + 3, top + 7.3, ISLE.z + 2, 4.2, 2.6, 3.6);
  put(pyr, board, ISLE.x + 3, top + 9.4, ISLE.z + 2, 4.6, 2.2, 4, Math.PI / 4);
  // 館と蔵（板葺の切妻）
  for (const [dx, dz, l, w] of [[-5, -3, 8, 5], [-4, 5, 6, 4], [6, -6, 5, 4]]) { const x = ISLE.x + dx, z = ISLE.z + dz, y = h(x, z); put(box, wood, x, y + 1.3, z, l, 2.6, w); roof(board, x, y + 3.2, z, l + 0.8, w * 0.62, 1.3); }
  // 南の門（櫓門）
  { const a = 6 / 8 * Math.PI * 2 + Math.PI / 8, x = ISLE.x + Math.cos(a) * 12, z = ISLE.z + Math.sin(a) * 12, y = h(x, z), ry = -a + Math.PI / 2;
    put(box, wood, x, y + 1.6, z, 5, 3.2, 2.4, ry); put(pyr, board, x, y + 3.9, z, 4.4, 1.4, 2.6, ry + Math.PI / 4); }
  // 水に沈んだ村の屋根（茅葺の棟だけが出る）と立ち枯れの木
  for (const [x, z, r] of [[-86, 96, 0.4], [-78, 124, 1.2], [-20, 118, 0.2], [-14, 96, 1.6], [-62, 136, 0.9], [-30, 84, 2.3]]) roof(thatch, x, WATER_Y + 0.55, z, 7, 2.6, 1.2, r);
  for (const [x, z] of [[-72, 88], [-24, 104], [-66, 128], [-8, 110], [-36, 132]]) put(box, wood, x, WATER_Y + 1.6, z, 0.35, 3.8, 0.35, x);
  // 清水宗治の舟（城の南の水の上）
  put(box, wood, ISLE.x + 4, WATER_Y + 0.25, ISLE.z - 19, 1.6, 0.5, 6, 0.3);
  rt.scene.add(g);
}

function scene(rt) {
  const W = rt.world;
  try { floodAndCastle(rt); } catch (e) { /* 小道具が無くても戦は続ける */ }
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
    hills: [[90, -90, 56, 18], [-120, -20, 50, 8], [130, 40, 50, 9], [LAKE.x, LAKE.z, 42, -1.3], [ISLE.x, ISLE.z, 15, 3.2], ...dikeHills()],   // 窪み（沼の田）・城の島・堤
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
    // K652②（11/25 Sanae・10分）：羽柴方には宇喜多の兵（約一万）が付き、毛利の陣の前に出ていた（『太閤記』B・『陰徳太平記』B）
    { kind: 'fight', at: UKITA, obj: '日差山の麓へ出た宇喜多の手を払う', title: '宇喜多の手', sub: '羽柴に付いた宇喜多が、毛利の陣を探る',
      say: [['吉川元春', '宇喜多め、羽柴に付いて我らの陣の前に出おった。追い払え', 3.4]],
      foes: [{ name: '宇喜多の先手', from: { x: UKITA.x - 10, z: UKITA.z + 14 }, list: [uS(3), uA(14)] }, { name: '宇喜多の鉄砲', from: { x: UKITA.x + 12, z: UKITA.z + 18 }, list: [uS(1), uB(5)] }],
      reward: '日差山の麓の宇喜多の手を払った' },
    // K652②：高松の囲みの間、羽柴は毛利の境目の城（冠山・宮路山・加茂・日幡）も攻めた。加茂城では城の一部が破られた（『太閤記』B・岡山市の解説 C）
    { kind: 'fight', at: KAMO, obj: '境目の加茂城を攻める羽柴の手を、横から突く', title: '加茂城', sub: '境目の城が、羽柴に攻められている',
      say: [['吉川元春', '加茂の城が攻められておる。横から突いて、城の者を助けよ', 3.4]],
      foes: [{ name: '加茂城を攻める羽柴の手', from: { x: KAMO.x - 10, z: KAMO.z + 12 }, list: [uS(3), uA(14)] }, { name: '寄せ手の鉄砲', from: { x: KAMO.x + 12, z: KAMO.z + 16 }, list: [uS(1), uB(5)] }],
      reward: '加茂城を攻める羽柴の手を崩した' },
    { kind: 'fight', at: HOLD, obj: '堤の外へ出た羽柴の先手を払う', title: '堤の外', sub: '羽柴の先手が毛利の物見を討ちに出る',
      say: [['吉川元春', '羽柴の先手が出た！　使いの道を開け！', 3.2]],
      foes: [{ name: '羽柴の先手', from: { x: HOLD.x + 6, z: HOLD.z + 6 }, list: [uS(3), uA(15)] }, { name: '羽柴の鉄砲', from: { x: HOLD.x - 10, z: HOLD.z + 4 }, list: [uS(1), uB(6)] }],
      reward: '堤の外の羽柴の先手を払い、使いの道を開いた' },
    // K652②：水の上では羽柴の舟が城の周りを見張っていた（『太閤記』B）。堤の際へ寄る舟手を払う
    { kind: 'fight', at: FUNE, obj: '堤の際へ舟で寄る羽柴の舟手を払う', title: '舟手', sub: '水の上から、羽柴の舟が寄って来る',
      say: [['小早川隆景', '舟で回り込んで来るぞ。使いの道を、水の側から塞がせるな', 3.4]],
      foes: [{ name: '羽柴の舟手', from: { x: FUNE.x - 12, z: FUNE.z + 12 }, list: [uS(2), uA(12), uB(4)] }],
      reward: '堤の際の羽柴の舟手を払った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
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
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HOLD.x - 16, z: HOLD.z + 20 }, obj: '水攻めの堤の上で、堤を崩そうとする備中の足軽を討つ', max: 100, limit: 90,
      say: [['小早川隆景', '堤を守れ', 3.2]],
      foes: [{ name: '堤を崩す足軽', from: { x: HOLD.x - 4, z: HOLD.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '水攻めの堤の上を守った' },
    { kind: 'hold', at: { x: HOLD.x + 20, z: HOLD.z - 10 }, label: '堤の外の道で', obj: '堤の外の道で、使いを守って寄せる羽柴の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '羽柴の兵が寄る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '羽柴の兵', from: { x: HOLD.x + 32, z: HOLD.z - 22 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '羽柴の兵', from: { x: HOLD.x + 6, z: HOLD.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '堤の外の道を守った' },
    // K652②：和睦の約束で、清水宗治は水の上の舟で舞い、腹を切った（『太閤記』B・『清水家文書』A に辞世）
    { kind: 'move', at: MIEOKURI, label: '堤の際', obj: '堤の際へ行き、舟の上の清水宗治を見送る', r: 12, max: 100,
      say: [['安国寺恵瓊', '清水殿が舟を出された。城の兵の命と引き換えじゃ', 3.4], ['小早川隆景', '見送れ。毛利のために腹を切る男じゃ', 3.2]] },
  ],
  win: {
    banner: '高松の和睦', sub: '毛利と羽柴は和睦した', award: '備中高松で和睦の使いを運んだ',
    say: [['安国寺恵瓊', '和睦が成った。清水殿の切腹で、城は開く', 3.4],
      ['小早川隆景', '羽柴殿は急いでおる。何か、京であったのかもしれぬ', 3.6],
      ['組頭 与三左', 'お主の運んだ書状が、五万の戦を止めた。よう走った', 3.2]],
  },
});
export default m10_takamatsu;
