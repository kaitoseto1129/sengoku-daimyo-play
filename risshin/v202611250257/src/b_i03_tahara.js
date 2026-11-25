// 今川家編 三戦目「田原城の戦い」（天文十六年〔1547〕九月・三河国 田原城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：松平竹千代（のち家康）を駿府へ送る途中、田原の戸田康光が竹千代を奪い織田へ渡した。義元は田原城を攻め、戸田の家は滅んだ（『三河物語』B・田原市の解説 C）。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, TAHA = { x: 45, z: -15 }, HON = { x: -112, z: 60 }, ATO = { x: -150, z: 80 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2 * Math.sin(x * 0.024 + 2) * Math.cos(z * 0.02) + 11 * gauss(x, z, TAHA.x, TAHA.z, 1600);

export const i03_tahara = imagawaBattle({
  id: 'i03_tahara',
  date: '天文十六年（1547）九月　三河国 田原城',
  intro: '田原の戸田が、駿府へ送るはずの竹千代を織田へ渡した。田原城を攻める。あなたは今川の先手の足軽。',
  history: '天文十六年（1547）、松平竹千代は人質として駿府へ送られる途中、田原城主の戸田康光に奪われ、尾張の織田へ渡された。怒った義元は田原城を攻め、戸田の家は滅んだ（『三河物語』B・田原市の解説 C）。',
  sides: { a: { name: '今川の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '戸田康光の城方', mon: 'oda', faction: 'oda' } },
  force: { a: 3000, b: 600 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1547, time: 'day', fogFar: 360 },
  allies: [
    { name: '朝比奈泰能の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('朝比奈泰能'), uS(3), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: TAHA.x - 8, z: TAHA.z + 6 }, { x: TAHA.x + 8, z: TAHA.z + 6 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['朝比奈泰能', '戸田は御屋形様を裏切った。田原を攻め落とす', 3.4], ['組頭', '海べりの道は狭い。列が伸びるぞ', 3.2]] },
    { kind: 'move', at: { x: -50, z: 30 }, label: '田原の城下の手前', obj: '細った帯をたどり、本隊を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '後ろが遅れておる。走って寄せよ', 3.2]] },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '城下に出た戸田の手を討つ', title: '田原の城下', sub: '戸田康光の手', max: 120, limit: 110,
      say: [['戸田康光', '織田様が付いておる。今川など恐れるな', 3.2]],
      foes: [{ name: '戸田の城方', from: { x: TAHA.x - 8, z: TAHA.z - 14 }, list: [busho('戸田康光', { horse: false }), uS(4), uA(13), uB(3)] }],
      later: [{ t: 30, say: ['組頭', '海の方からも来た！'], foes: [{ name: '戸田の別手', from: { x: TAHA.x - 30, z: TAHA.z + 24 }, list: [uS(2), uA(7)] }] }],
      reward: '田原の城下で戸田の手を退けた' },
    { kind: 'move', at: { x: TAHA.x - 4, z: TAHA.z + 4 }, label: '田原城', obj: '城の門まで詰める', r: 14, max: 110,
      say: [['朝比奈泰能', '門まで詰めよ。戸田の城はこれまでじゃ', 3.2]] },
  ],
  win: { banner: '田原城', sub: '戸田を討った', award: '田原城を攻め、竹千代を奪った戸田を討った', say: [['朝比奈泰能', 'よう働いた。竹千代は、いずれ取り戻す', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, TAHA.x + 4, TAHA.z - 6)); },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-50, 30], [45, -15]]],
    treeDensity: () => 0.6, clear: (x, z) => [SPAWN, TAHA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 380, tufts: 1600,
  },
});
export default i03_tahara;
