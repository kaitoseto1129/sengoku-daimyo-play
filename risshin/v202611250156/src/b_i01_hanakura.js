// 今川家編 一戦目「花倉の乱」（天文五年〔1536〕六月・駿河国 花倉城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：今川氏輝の急死の後、栴岳承芳（のち義元）と玄広恵探が家督を争った。承芳の方は方ノ上城を落とし、花倉城に籠った恵探を攻め、恵探は普門寺で自害した（『今川記』B・藤枝市の解説 C）。
//   帯（obiTick）の見方を教える小さな戦。字・札・ボタンは足さない。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, REBEL } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, HANA = { x: 50, z: -20 }, KATA = { x: -40, z: 30 }, HON = { x: -115, z: 62 }, ATO = { x: -152, z: 82 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 3 * Math.sin(x * 0.021 + 1) * Math.cos(z * 0.02) + 10 * gauss(x, z, HANA.x, HANA.z, 1700) + 5 * gauss(x, z, KATA.x, KATA.z, 900);

export const i01_hanakura = imagawaBattle({
  id: 'i01_hanakura',
  date: '天文五年（1536）六月　駿河国 花倉城',
  intro: '御屋形様の跡目を、二人の弟が争う。あなたは承芳様の方の足軽。花倉城の恵探を攻める。',
  history: '天文五年（1536）、今川氏輝が急に亡くなり、弟の栴岳承芳と玄広恵探が家を争った（花倉の乱）。承芳の方は方ノ上城を落とし、花倉城を攻めた。恵探は逃れて普門寺で自害し、承芳が今川義元となった（『今川記』B・藤枝市の解説 C）。',
  sides: { a: { name: '栴岳承芳の方', mon: 'imagawa', faction: 'imagawa' }, b: { name: '玄広恵探の方', mon: 'imagawa', faction: 'oda' } },
  force: { a: 1200, b: 500 }, allyLook: IMAGAWA, foeLook: REBEL,
  allyDmg: 0.4, foeDmg: 0.5, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1536, time: 'morning', fogFar: 340, mist: true },
  allies: [
    { name: '岡部親綱の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('岡部親綱'), uS(3), uA(8)] },
    { name: '承芳様の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'imagawa', foeFlags: [{ x: HANA.x - 8, z: HANA.z + 6 }, { x: KATA.x + 6, z: KATA.z + 4 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['岡部親綱', '跡目は承芳様じゃ。花倉の恵探を攻める', 3.4], ['組頭', '金の帯を見よ。前と後ろのつながりじゃ。細うなったら、走って寄せよ', 3.6]] },
    { kind: 'move', at: { x: KATA.x - 14, z: KATA.z + 10 }, label: '方ノ上城の下', obj: '細った帯をたどり、本隊を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '先が伸びた。本隊に寄せと伝えよ', 3.2]] },
    { kind: 'fight', at: KATA, obj: '方ノ上城を守る恵探の手を討つ', title: '方ノ上城', sub: '恵探の方の守り', max: 120, limit: 110,
      say: [['福島の侍', '跡目は恵探様じゃ。通さぬ！', 3]],
      foes: [{ name: '方ノ上の守り', from: { x: KATA.x + 10, z: KATA.z - 10 }, list: [uS(3), uA(12), uB(3)] }],
      later: [{ t: 30, say: ['組頭', '城の裏から出て来た！'], foes: [{ name: '恵探の別手', from: { x: KATA.x + 20, z: KATA.z + 18 }, list: [uS(2), uA(6)] }] }],
      reward: '方ノ上城の守りを破った' },
    { kind: 'move', at: { x: HANA.x - 10, z: HANA.z + 8 }, label: '花倉城', obj: '花倉城の門まで詰める', r: 14, max: 110,
      say: [['岡部親綱', '花倉は近い。押せ。恵探を逃すな', 3.2]] },
  ],
  win: { banner: '花倉城', sub: '跡目は承芳様に', award: '花倉の乱で花倉城まで詰め、承芳の家督を支えた', say: [['岡部親綱', '恵探は落ちた。これより承芳様は、今川義元じゃ', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, HANA.x + 4, HANA.z - 6)); },
  land: {
    height, muddy: 0.15, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-40, 30], [50, -20]]],
    treeDensity: () => 1, clear: (x, z) => [SPAWN, HANA, KATA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 480, tufts: 1700,
  },
});
export default i01_hanakura;
