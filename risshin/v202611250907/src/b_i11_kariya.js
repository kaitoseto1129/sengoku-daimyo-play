// 今川家編 十一戦目「刈谷城の戦い」（永禄三年〔1560〕五月・三河国 刈谷城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：桶狭間の後も鳴海城を守った岡部元信は、義元の首と引き換えに城を明け渡した。駿河へ帰る道で刈谷城を攻め、城主の水野信近を討った（『信長公記』A の鳴海の岡部・刈谷市の解説 C）。
//   帰り道の長い列（帯）を切らさず、刈谷の城下を抜ける。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, KARI = { x: 40, z: -10 }, HON = { x: -112, z: 62 }, ATO = { x: -150, z: 82 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2 * Math.sin(x * 0.022 + 1.5) * Math.cos(z * 0.02) + 8 * gauss(x, z, KARI.x, KARI.z, 1500);

export const i11_kariya = imagawaBattle({
  id: 'i11_kariya',
  date: '永禄三年（1560）五月　三河国 刈谷城',
  intro: '御屋形様は桶狭間で討たれた。鳴海の岡部元信様は、御首を受け取って駿河へ帰る。あなたは岡部の手の足軽。',
  history: '永禄三年（1560）五月、桶狭間で義元が討たれた後も、岡部元信は鳴海城を守り続けた。元信は義元の首と引き換えに城を明け渡し、駿河へ帰る途中で織田方の刈谷城を攻め、城主の水野信近を討った（『信長公記』A・刈谷市の解説 C）。',
  sides: { a: { name: '岡部元信の手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '水野信近の城方', mon: 'oda', faction: 'oda' } },
  force: { a: 1000, b: 600 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1560, time: 'night', fogFar: 300 },
  allies: [
    { name: '岡部元信の先手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('岡部元信'), uS(3), uA(8)] },
    { name: '御首を守る列', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: KARI.x - 8, z: KARI.z + 6 }, { x: KARI.x + 8, z: KARI.z + 6 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['岡部元信', '御屋形様の御首と共に、駿河へ帰る。ただでは帰らぬ', 3.4], ['組頭', '列が長い。御首の列と離れるな', 3.2]] },
    { kind: 'move', at: { x: -50, z: 30 }, label: '刈谷の城下の手前', obj: '細った帯をたどり、御首の列を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '後ろが遅れた。走って寄せよ', 3.2]] },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '夜の城下に出た水野の手を討つ', title: '刈谷の城下', sub: '水野信近の手', max: 120, limit: 110,
      say: [['水野の侍', '今川の残りじゃ！　討ち取れ！', 3]],
      foes: [{ name: '刈谷の城方', from: { x: KARI.x - 6, z: KARI.z - 14 }, list: [busho('水野信近', { horse: false }), uS(4), uA(12), uG(3)] }],
      later: [{ t: 30, say: ['組頭', '後ろの列に寄せて来た！　御首を守れ'], foes: [{ name: '刈谷の別手', from: { x: -40, z: 70 }, list: [uS(2), uA(7), uB(2)] }] }],
      reward: '刈谷の城下で水野の手を討った' },
    { kind: 'move', at: { x: KARI.x - 4, z: KARI.z + 4 }, label: '刈谷城', obj: '城の門まで詰める', r: 14, max: 110,
      say: [['岡部元信', '門まで詰めよ。これが御屋形様への手向けじゃ', 3.2]] },
  ],
  win: { banner: '刈谷城', sub: '御首と共に駿河へ', award: '刈谷城を攻め、義元の御首を守って駿河へ帰った', say: [['岡部元信', '帰るぞ。今川の意地は見せた', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, KARI.x + 4, KARI.z - 6)); },
  land: {
    height, muddy: 0.25, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-50, 30], [40, -10]]],
    treeDensity: () => 0.7, clear: (x, z) => [SPAWN, KARI, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 400, tufts: 1600,
  },
});
export default i11_kariya;
