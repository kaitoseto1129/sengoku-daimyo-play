// 今川家編 八戦目「大高城の兵糧入れ」（永禄三年〔1560〕五月十八日 夜・尾張国 大高城）。軽い型・H3（docs/house_imagawa.md ②）
//   史実：大高城は織田の砦（丸根・鷲津）に囲まれ兵糧が尽きかけていた。松平元康が夜のうちに兵糧を運び入れた（『三河物語』B・『松平記』B）。
//   敵地の中の行軍＝「大軍の綻び」の帯（b_i10_okehazama.js の obiTick を使い回し）を切らさず運ぶ。字・札・ボタンは足さない。
import { lightBattle, uS, uA, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { jinmaku, nobori, tawara } from './props.js';
import { obiTick } from './b_i10_okehazama.js';

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
