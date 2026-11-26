// 今川家編 八戦目「大高城の兵糧入れ」（永禄三年〔1560〕五月十八日 夜・尾張国 大高城）。軽い型・H3（docs/house_imagawa.md ②）
//   史実：大高城は織田の砦（丸根・鷲津）に囲まれ兵糧が尽きかけていた。松平元康が夜のうちに兵糧を運び入れた（『三河物語』B・『松平記』B）。
//   敵地の中の行軍＝「大軍の綻び」の帯（b_i10_okehazama.js の obiTick を使い回し）を切らさず運ぶ。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { jinmaku, nobori, tawara } from './props.js';
import { obiTick } from './imagawa_obi.js';

const SPAWN = { x: -200, z: 120 }, OTAKA = { x: 100, z: -20 }, HON = { x: -120, z: 90 }, ATO = { x: -170, z: 110 };
const MID = { x: -40, z: 40 }, FACE = (2 * Math.PI) / 3;
const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a }, ODA = { flag: 'oda', armor: 0x24221f };
const height = (x, z) => 2.5 * Math.sin(x * 0.022) * Math.cos(z * 0.019 + 1) + 9 * gauss(x, z, OTAKA.x, OTAKA.z, 1800);

export const i08_otaka = lightBattle({
  id: 'i08_otaka',
  date: '永禄三年（1560）五月十八日　夜　尾張国 大高城',
  intro: '大高城は織田の砦に囲まれ、兵糧が尽きかけている。夜のうちに米を運び入れる。あなたは松平元康の足軽。',
  history: '永禄三年（1560）五月十八日の夜、松平元康は大高城へ兵糧を入れた。城は丸根・鷲津の織田の砦に囲まれていた。元康は夜明け前に米俵を運び入れ、翌朝、丸根の砦を攻めた（『三河物語』B・『松平記』B）。',
  sides: { a: { name: '松平元康の兵糧隊', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田の砦', mon: 'oda', faction: 'oda' } },
  force: { a: 1000, b: 500 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1558, time: 'night', fogFar: 300 },
  allies: [
    { name: '松平元康の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 10 }, face: FACE, list: [busho('松平元康'), uS(3), uA(8)] },
    { name: '米俵の列', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['松平元康', '米を大高へ入れる。列を切らすな。敵地の中じゃ', 3.4], ['組頭', '帯が細うなったら、走って後ろを寄せよ', 3.2]] },
    { kind: 'move', at: MID, label: '道の半ば', obj: '細った帯をたどり、米俵の列を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '列が伸びた。後ろに寄せと伝えよ。離れれば、そこを突かれる', 3.4]] },
    { kind: 'fight', at: { x: 10, z: 10 }, obj: '丸根から出た織田の見張りを払う', title: '夜の道', sub: '織田の見張り', max: 110, limit: 110,
      say: [['織田の侍', '今川の兵糧じゃ！　通すな！', 3]],
      foes: [{ name: '織田の見張り', from: { x: 20, z: -30 }, list: [uS(2), uA(9)] }],
      later: [{ t: 30, say: ['組頭', '別の手も来る！　米俵を守れ'], foes: [{ name: '織田の別手', from: { x: -30, z: -20 }, list: [uS(2), uA(7)] }] }],
      reward: '夜道の織田の見張りを払った' },
    { kind: 'move', at: OTAKA, label: '大高城', obj: '米俵を大高城へ運び入れる', r: 16, max: 120,
      say: [['大高の兵', '米じゃ！　門を開けよ！', 3]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '鷲津と丸根の兵が、米の列に気づいて寄せて来まする！', 3.2], ['松平元康', '米が城に入り切るまで、門の前で止めよ', 3]] },
    { kind: 'hold', at: { x: OTAKA.x - 16, z: OTAKA.z + 14 }, label: '大高城の門の前', obj: '米俵が城へ入り切るまで、門の前で織田の兵を止める', r: 16, dur: 70, title: '門の前', sub: '米俵の列が門をくぐる',
      say: [['組頭', '帯を太く保て。列の尻が切られる', 3]],
      waves: [
        { t: 3, foes: [{ name: '鷲津の兵', from: { x: OTAKA.x + 30, z: OTAKA.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '織田の組頭' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '丸根の兵じゃ！'], foes: [{ name: '丸根の兵', from: { x: OTAKA.x - 40, z: OTAKA.z - 40 }, list: [uS(2), uA(10), { type: 'bow', n: 3 }] }] }],
      reward: '米俵が城へ入り切った' },
    { kind: 'fight', at: { x: 50, z: -40 }, obj: '城の外に出て、米の列を追った織田の手を払う', title: '夜の追い', sub: '織田の手が城の外に残る', max: 120, limit: 120,
      say: [['松平元康', '追い払え。夜が明ければ、我らが砦を攻める', 3]],
      foes: [{ name: '織田の追手', from: { x: 40, z: -50 }, list: [busho('織田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      reward: '米の列を追った織田の手を払った' },
    { kind: 'move', at: OTAKA, label: '大高城', obj: '帯をたどって大高城へ戻る', r: 16, max: 100 },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: OTAKA.x - 16, z: OTAKA.z + 14 }, label: '大高城の門の前', obj: '夜明けまで門の前を守り、丸根から寄せる織田を払う', r: 16, dur: 70, title: '夜明け前', sub: '東の空が白む',
      say: [['組頭', '夜明けまでじゃ。門を渡すな', 3]],
      waves: [
        { t: 3, foes: [{ name: '丸根の寄せ', from: { x: OTAKA.x - 40, z: OTAKA.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '佐久間の組頭' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '鷲津からも来る！'], foes: [{ name: '鷲津の寄せ', from: { x: OTAKA.x + 30, z: OTAKA.z - 30 }, list: [uS(2), uA(10)] }] }],
      reward: '夜明けまで大高城の門を守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTAKA.x - 30, z: OTAKA.z + 30 }, obj: '街道の暗がりで、米俵の列を狙う織田の乱破を討つ', max: 100, limit: 90,
      say: [['松平元康', '闇に紛れて寄る者がいる。米を守れ', 3.2]],
      foes: [{ name: '米俵を狙う乱破', from: { x: OTAKA.x - 18, z: OTAKA.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '米俵の列を守った' },
    { kind: 'hold', at: { x: OTAKA.x - 24, z: OTAKA.z + 22 }, label: '大高の門の前', obj: '大高の門の前で、米を運び入れる間、鷲津から来る織田の足軽を受け止める', r: 16, dur: 45,
      say: [['見張り', '鷲津から松明が来る！　門を守れ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '鷲津の織田の足軽', from: { x: OTAKA.x - 12, z: OTAKA.z + 10 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '鷲津の織田の足軽', from: { x: OTAKA.x - 38, z: OTAKA.z + 36 }, list: [uS(2), uA(7)] }] }],
      reward: '大高の門の前を守った' },
    { kind: 'fight', at: { x: OTAKA.x + 10, z: OTAKA.z - 30 }, obj: '夜明けの堀端で、米蔵を狙う織田の弓を討つ', max: 100, limit: 90,
      say: [['松平元康', '夜が明ける。米蔵を射させるな', 3.2]],
      foes: [{ name: '米蔵を狙う織田の弓', from: { x: OTAKA.x + 22, z: OTAKA.z - 42 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '米蔵を守った' },
    // K656 K652⑥ 逸話の段（大高城の兵糧入れは、丸根・鷲津の織田の砦の目の前で行われた（『松平記』B））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: OTAKA.x - 20, z: OTAKA.z - 24 }, obj: '兵糧を運び入れる間、鷲津から駆け下る織田の手を斬り伏せる', title: '大高城の外', sub: '兵糧入れ', max: 100, limit: 100,
      say: [['飯尾定宗', '米俵を大高へ入れさせるな！', 3], ['組頭', '俵が入るまで、寄せる者は通すな！', 3]],
      foes: [{ name: '織田の鷲津の兵', from: { x: OTAKA.x - 20 + 12, z: OTAKA.z - 24 + -14 }, list: [busho('飯尾定宗', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '兵糧が入るまで織田の手を斬り伏せた' },
  ],
  win: { banner: '大高城', sub: '兵糧を入れた', award: '大高城へ兵糧を入れた', say: [['松平元康', 'よう運んだ。これで大高は持つ。夜が明ければ、丸根じゃ', 3.4]] },
  setup(rt) {
    const W = rt.world, F = rt.flags;
    rt.scene.add(jinmaku(W, HON.x, HON.z, 12, 9, 6, { mon: 'imagawa' }));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, OTAKA.x + dx, OTAKA.z + dz, 'imagawa', 5));
    for (let k = 0; k < 4; k++) { try { rt.scene.add(tawara(W, SPAWN.x + 10 + k * 3, SPAWN.z - 4, 0, 4)); } catch (e) { /* なし */ } }
    F.obi = { a: 1, b: 1, t: 0 };
  },
  update(rt, dt) {
    const O = rt.flags.obi, i = rt.flags.dp?.on ? rt.flags.dp.i : -1;
    if (!O) return;
    if (i === 1) { O.a = Math.max(0.28, O.a - dt / 35); O.b = Math.max(0.28, O.b - dt / 45); }
    else if (i >= 2) { O.a = Math.min(1, O.a + dt / 6); O.b = Math.min(1, O.b + dt / 6); }
    obiTick(rt, dt);
  },
});
Object.assign(i08_otaka.world, {
  height, muddy: 0.3, groundHalf: 420, moveLim: 380,
  paths: [[[-280, 150], [-200, 120], [-40, 40], [100, -20]]],
  treeDensity: () => 0.8, clear: (x, z) => [SPAWN, OTAKA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 420, tufts: 1600,
});
export default i08_otaka;
