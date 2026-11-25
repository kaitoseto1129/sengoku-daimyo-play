// 今川家編 十二戦目「牛久保城の戦い」（永禄四年〔1561〕四月・三河国 牛久保城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：桶狭間の後、松平元康は今川から離れて織田と結び、今川方の牛久保城を攻めた。城は持ちこたえた（『三河物語』B・豊川市の解説 C）。氏真の代の始まり。
//   城を守る戦。門の手と城の本隊の帯を保つ。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, TOKU } from './b_i_common.js';

const SPAWN = { x: -60, z: 40 }, USHI = { x: -85, z: 52 }, GATE = { x: -30, z: 22 }, HON = { x: -100, z: 62 }, ATO = { x: -140, z: 80 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2 * Math.sin(x * 0.02 + 0.4) * Math.cos(z * 0.022) + 10 * gauss(x, z, USHI.x, USHI.z, 1400);

export const i12_ushikubo = imagawaBattle({
  id: 'i12_ushikubo',
  date: '永禄四年（1561）四月　三河国 牛久保城',
  intro: '松平元康が今川を離れ、牛久保城へ攻めて来る。昨日の味方が、今日の敵じゃ。あなたは城を守る足軽。',
  history: '永禄四年（1561）四月、桶狭間の後に岡崎へ戻った松平元康は今川から離れ、今川方の牛久保城を攻めた。城方は持ちこたえたが、三河の国人は次々に今川を離れていった（『三河物語』B・豊川市の解説 C）。',
  sides: { a: { name: '牛久保城の今川方', mon: 'imagawa', faction: 'imagawa' }, b: { name: '松平元康の軍', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 1000, b: 2000 }, allyLook: IMAGAWA, foeLook: TOKU,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1561, time: 'day', fogFar: 360 },
  allies: [
    { name: '門の前の手', at: { x: GATE.x - 6, z: GATE.z + 6 }, face: FACE, list: [busho('牧野成定'), uS(3), uA(8)] },
    { name: '城の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'tokugawa', foeFlags: [{ x: 60, z: -30 }, { x: 70, z: -20 }],
  thin: [2],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['牧野成定', '元康が攻めて来る。駿府の若殿は遠い。我らで守る', 3.4], ['組頭', '門の手と城の帯を切らすな', 3.2]] },
    { kind: 'move', at: GATE, label: '門の前', obj: '門の前に出て、松平を待つ', r: 16, max: 80,
      say: [['組頭', '葵の旗じゃ。昨日まで同じ陣におった者らよ', 3.2]] },
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前で、松平の寄せを受け止める', r: 16, dur: 70,
      title: '松平の寄せ', sub: '三河の兵が門へ押し寄せる',
      say: [['牧野成定', '退くな。帯が細うなったら、城から寄せさせよ', 3.2]],
      waves: [
        { t: 6, say: ['松平の侍', '牛久保を落とせ！'], foes: [{ name: '松平の先手', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [uS(3), uA(12), uG(2)] }] },
        { t: 34, say: ['組頭', '堀の脇からも来た！'], foes: [{ name: '松平の二の手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(8), uB(2)] }] },
      ], reward: '門の前で松平の寄せを受け止めた' },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '打って出て、松平の手を押し返す', title: '打って出る', sub: '松平の旗本', max: 120, limit: 110,
      say: [['牧野成定', '今じゃ、打って出よ！', 3]],
      foes: [{ name: '松平の旗本', from: { x: 40, z: -20 }, list: [busho('酒井忠次', { horse: true }), uS(4), uA(10)] }],
      reward: '打って出て松平の手を押し返した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '松平の本隊が、川を渡って大手へ回りまする！', 3], ['牧野成定', '門へ戻れ。二度目が本当の寄せじゃ', 3]] },
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前へ戻り、松平の本隊の寄せを受け止める', r: 16, dur: 70, title: '本隊の寄せ', sub: '松平の本隊が門へ',
      say: [['組頭', '城の帯を太く保て。門の手が細れば、押し切られる', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '松平の本隊', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '松平の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '鉄砲じゃ！'], foes: [{ name: '松平の鉄砲', from: { x: GATE.x + 50, z: GATE.z - 10 }, list: [uS(1), uG(5), uA(6)] }] }],
      reward: '松平の本隊の寄せを受け止めた' },
    { kind: 'fight', at: { x: 40, z: -20 }, obj: '退く松平の殿を追い、城から遠ざける', title: '追い', sub: '松平の殿が退く', max: 120, limit: 120,
      say: [['牧野成定', '追え。じゃが城を空けるな', 3]],
      foes: [{ name: '松平の殿', from: { x: 50, z: -30 }, list: [busho('松平の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      reward: '松平の殿を追い払った' },
    { kind: 'move', at: { x: GATE.x - 6, z: GATE.z + 6 }, label: '門の前', obj: '帯をたどって門へ戻る', r: 14, max: 90 },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前で、松平に付いた国衆の寄せを受け止める', r: 16, dur: 60, title: '国衆', sub: '三河の国衆が松平に付いた',
      say: [['牧野成定', '昨日の味方が、今日は寄せて来る。じゃが門は渡さぬ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '松平に付いた国衆', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '国衆の侍' } }, uS(3), uA(12)] }] },
        { t: 30, say: ['見張り', '横からも来る！'], foes: [{ name: '国衆の別手', from: { x: GATE.x - 30, z: GATE.z - 30 }, list: [uS(2), uA(8)] }] }],
      reward: '国衆の寄せを受け止めた' },
  ],
  win: { banner: '牛久保城', sub: '城を守り抜いた', award: '牛久保城を守り、松平の寄せを押し返した', say: [['牧野成定', '城は守れた。じゃが、三河はもう今川の物ではないかもしれぬ', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, USHI.x - 4, USHI.z + 4)); },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-200, 110], [-85, 52], [-30, 22], [70, -30]]],
    treeDensity: () => 0.7, clear: (x, z) => [SPAWN, USHI, GATE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 400, tufts: 1700,
  },
});
export default i12_ushikubo;
