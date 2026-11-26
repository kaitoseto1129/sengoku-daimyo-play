// 今川家編 九戦目「丸根・鷲津砦の戦い」（永禄三年〔1560〕五月十九日 朝・尾張国 丸根・鷲津）。軽い型（light_battle.js）・H3（docs/house_imagawa.md ②④）
//   史実：桶狭間の朝、松平元康（のち家康）が丸根砦（佐久間盛重）、朝比奈泰朝が鷲津砦（織田秀敏・飯尾定宗ら）を攻め落とした（『信長公記』A）。
//   元康の先手に主人公。「大軍の綻び」の帯は b_i10_okehazama.js の obiTick を使い回す（元康の手⇄本隊⇄朝比奈の手）。字・札・ボタンは足さない。
//   地形は手書きの丘（丸根・鷲津は低い丘の砦）。本物の兵は最多60人ほど（250人の内）。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { jinmaku, nobori, yagura } from './props.js';
import { obiTick } from './imagawa_obi.js';

const MARU = { x: 0, z: 0 };          // 丸根砦
const WASHI = { x: 170, z: -70 };     // 鷲津砦
const SPAWN = { x: -150, z: 110 };    // 大高の方（南西）
const HON = { x: -70, z: 70 };        // 元康の本隊
const ASA = { x: 40, z: 120 };        // 朝比奈の手（鷲津へ向かう）
const FACE = (3 * Math.PI) / 4;       // 北東へ向く
const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a };
const ODA = { flag: 'oda', armor: 0x24221f };
function height(x, z) {
  return 3 * Math.sin(x * 0.02 + 1) * Math.cos(z * 0.017) + 14 * gauss(x, z, MARU.x, MARU.z, 1500) + 13 * gauss(x, z, WASHI.x, WASHI.z, 1500);
}

export const i09_marune = lightBattle({
  id: 'i09_marune',
  date: '永禄三年（1560）五月十九日　夜明け　尾張国 丸根・鷲津',
  intro: '桶狭間の朝。大高城の前に、織田の二つの砦がある。丸根と鷲津。あなたは松平元康の先手の足軽。',
  history: '永禄三年（1560）五月十九日の未明、今川義元の先手は大高城の前の織田の砦を攻めた。松平元康が丸根砦（佐久間盛重）、朝比奈泰朝が鷲津砦（織田秀敏・飯尾定宗ら）。盛重は討ち死にし、二つの砦は昼前に落ちた。義元はこの報せに「目出度い」と喜び、桶狭間山で休んだ（『信長公記』A）。',
  sides: { a: { name: '松平元康の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田の砦', mon: 'oda', faction: 'oda' } },
  force: { a: 4000, b: 700 },
  allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1559, time: 'day', fogFar: 340, mist: true },
  allies: [
    { name: '松平元康の手', at: { x: SPAWN.x + 20, z: SPAWN.z - 14 }, face: FACE, list: [busho('松平元康'), uS(4), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '朝比奈泰朝の手', at: ASA, face: FACE, list: [busho('朝比奈泰朝', { horse: false }), uS(3), uA(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['松平元康', '夜が明ける。丸根は我らが攻める。鷲津は朝比奈殿じゃ', 3.4],
      ['組頭', '列が伸びておる。金の帯が細うなったら、走って後ろを寄せよ', 3.4]] },
    { kind: 'move', at: { x: -40, z: 40 }, label: '丸根の麓', obj: '細った帯をたどり、丸根の麓へ本隊を寄せる', r: 16, max: 100,
      say: [['組頭', '帯が細い。本隊に寄せと伝えよ。離れて攻めれば、砦に押し返される', 3.4]] },
    { kind: 'fight', at: { x: -8, z: 8 }, obj: '丸根砦の城方を討ち、門を破る', title: '丸根', sub: '佐久間盛重の砦', max: 120, limit: 120,
      say: [['佐久間盛重', '尾張を守る砦じゃ。一歩も通すな。矢を放て！', 3.2], ['組頭', '盾を前へ。門まで詰めよ', 3]],
      foes: [{ name: '丸根の城方', from: { x: MARU.x + 6, z: MARU.z - 8 }, list: [busho('佐久間盛重', { horse: false }), uS(3), uA(10), uG(3)] }],
      later: [{ t: 35, say: ['組頭', '城方が打って出て来た！　囲まれるな'], foes: [{ name: '丸根の打って出る手', from: { x: MARU.x - 14, z: MARU.z - 26 }, list: [uS(2), uA(8)] }] }],
      reward: '丸根砦の門を破った' },
    { kind: 'move', at: { x: 140, z: -50 }, label: '鷲津へ', obj: '帯を伸ばし、鷲津の朝比奈殿へ加勢に走る', r: 18, max: 110,
      say: [['松平元康', '丸根は落ちた。朝比奈殿が苦戦しておる。鷲津へ走れ', 3.2]] },
    { kind: 'fight', at: { x: 160, z: -62 }, obj: '鷲津砦の城方を討つ', title: '鷲津', sub: '織田秀敏の砦', max: 120, limit: 110,
      say: [['織田秀敏', '殿が来られるまで持ちこたえよ。ここは通すな', 3.2]],
      foes: [{ name: '鷲津の城方', from: { x: WASHI.x + 8, z: WASHI.z - 10 }, list: [busho('織田秀敏', { horse: false }), uS(3), uA(10), uG(2)] }],
      later: [{ t: 30, say: ['朝比奈泰朝', '今じゃ、押せ。門が開くぞ'], foes: [{ name: '鷲津の二の手', from: { x: WASHI.x + 26, z: WASHI.z + 10 }, list: [uS(2), uA(8)] }] }],
      reward: '鷲津砦を落とした' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '鷲津は落ちた！　されど善照寺の方から織田の後詰が来まする', 3.2], ['松平元康', '砦を渡すな。後詰を受けよ', 3]] },
    { kind: 'hold', at: { x: 160, z: -62 }, label: '鷲津砦', obj: '鷲津砦で、取り返しに来る織田の後詰を受け止める', r: 16, dur: 70, title: '取り返し', sub: '織田の後詰が砦へ',
      say: [['朝比奈泰朝', '砦の内で受けよ。帯を切らすな', 3]],
      waves: [
        { t: 3, foes: [{ name: '織田の後詰', from: { x: 120, z: -110 }, list: [{ type: 'samurai', n: 1, o: { name: '織田の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '弓じゃ！'], foes: [{ name: '織田の弓', from: { x: 200, z: -100 }, list: [uS(1), uB(7), uA(4)] }] }],
      reward: '鷲津砦を守った' },
    { kind: 'move', at: { x: -8, z: 8 }, label: '丸根砦', obj: '帯をたどって丸根砦へ戻る', r: 16, max: 110,
      say: [['松平元康', '丸根へ戻る。大高へ入る支度じゃ', 3]] },
    { kind: 'hold', at: { x: -8, z: 8 }, label: '丸根砦', obj: '丸根砦で、中島の方から打ちかかる佐々・千秋の手を受け止める', r: 16, dur: 60, title: '佐々・千秋', sub: '織田の三百が前へ出た',
      say: [['組頭', '数は少ない。じゃが死ぬ気で来る。固まれ', 3]],
      waves: [{ t: 3, foes: [{ name: '佐々・千秋の手', from: { x: 40, z: -50 }, list: [busho('佐々政次', { mustLive: false, invuln: false }), uS(4), uA(10)] }] }],
      reward: '佐々・千秋の手を退けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MARU.x - 30, z: MARU.z + 20 }, obj: '丸根砦の堀の前で、板塀から射る城方の弓を崩す', max: 100, limit: 90,
      say: [['松平元康', '塀の弓を黙らせよ', 3.2]],
      foes: [{ name: '丸根の弓', from: { x: MARU.x - 18, z: MARU.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '丸根の塀の弓を崩した' },
    { kind: 'fight', at: { x: MARU.x + 20, z: MARU.z - 20 }, obj: '丸根砦の二の曲輪で、佐久間盛重の旗本を崩す', max: 100, limit: 90,
      say: [['松平元康', '旗本を崩せ。大将は奥じゃ', 3.2]],
      foes: [{ name: '佐久間の旗本', from: { x: MARU.x + 32, z: MARU.z - 32 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '丸根の二の曲輪を取った' },
    { kind: 'hold', at: { x: MARU.x + 70, z: MARU.z - 60 }, label: '鷲津へ向かう', obj: '鷲津へ向かう道で、丸根から逃れて来た織田の手を受け止める', r: 16, dur: 45,
      say: [['見張り', '丸根から落ちた者が来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '丸根の落ち武者', from: { x: MARU.x + 82, z: MARU.z - 72 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '丸根の落ち武者', from: { x: MARU.x + 56, z: MARU.z - 46 }, list: [uS(2), uA(7)] }] }],
      reward: '鷲津への道を守った' },
    // K656 K652⑥ 逸話の段（佐久間盛重は丸根砦で討ち死にした（『信長公記』A））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: -4, z: 4 }, obj: '丸根砦の大将・佐久間盛重と最後の斬り合いをする', title: '丸根砦', sub: '佐久間盛重、討死', max: 100, limit: 100,
      say: [['佐久間盛重', '殿の砦ぞ。一歩も退くな！', 3], ['組頭', '砦の大将を討て。丸根を落とせ！', 3]],
      foes: [{ name: '佐久間盛重', from: { x: -4 + 12, z: 4 + -14 }, list: [busho('佐久間盛重', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '丸根砦で佐久間盛重と斬り合った' },
  ],
  win: {
    banner: '丸根・鷲津', sub: '二つの砦が落ちた', award: '丸根・鷲津の砦を落とし、大高城の道を開いた',
    say: [['松平元康', '二つの砦は落ちた。これで大高は安泰じゃ', 3.4], ['組頭', '御屋形様は桶狭間で休まれる。だが、この大軍は長い。気を抜くな', 3.4]],
  },
  setup(rt) {
    const W = rt.world, F = rt.flags;
    for (const P of [MARU, WASHI]) {
      try { rt.scene.add(yagura(W, P.x + 4, P.z - 6)); } catch (e) { /* なし */ }
      for (const [dx, dz] of [[-8, 6], [8, 6], [0, -10]]) rt.scene.add(nobori(W, P.x + dx, P.z + dz, 'oda', 6));
    }
    rt.scene.add(jinmaku(W, HON.x, HON.z, 14, 10, 6, { mon: 'imagawa' }));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, HON.x + dx, HON.z + dz, 'imagawa', 5));
    F.obi = { a: 1, b: 1, t: 0 };
  },
  update(rt, dt) {
    const F = rt.flags, D = F.dp, O = F.obi;
    if (!O) return;
    const i = D?.on ? D.i : -1;
    // 帯：丸根の麓へ走る間は細る（号令が届くと戻る）。鷲津へ向かう間は朝比奈との帯が細り、着くと戻る
    if (i === 1) O.a = Math.max(0.28, O.a - dt / 40);
    else if (i === 2) O.a = Math.min(1, O.a + dt / 6);
    else if (i === 3) O.b = Math.max(0.28, O.b - dt / 40);
    else if (i >= 4) { O.b = Math.min(1, O.b + dt / 6); }
    obiTick(rt, dt);
  },
});
Object.assign(i09_marune.world, {
  height, muddy: 0.2, groundHalf: 420, moveLim: 380,
  paths: [[[-260, 160], [-150, 110], [-40, 40], [0, 4], [90, -30], [170, -70]]],
  treeDensity: (x, z) => 0.8,
  clear: (x, z) => [MARU, WASHI, SPAWN, HON, ASA].some((p) => Math.hypot(x - p.x, z - p.z) < 24),
  trees: 460, tufts: 1800,
});
export default i09_marune;
