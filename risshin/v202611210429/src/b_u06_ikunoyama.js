// 上杉編 六戦目「生野山の戦い」（永禄四年〔1561〕十一月・武蔵国 生野山）。軽い型（light_battle.js）
//   史実：第四次川中島の後、上杉政虎（輝虎）は再び関東へ出た。北条氏康は武田と結んで武蔵の北へ兵を出し、
//   両軍は武蔵の生野山（いま埼玉県本庄市・児玉の辺り）で戦った。上杉方が北条勢を押し返し、北条勢は南へ退いた。
//   ※ 戦いの細かな経過は史料が少ない（関東の軍記・古文書の断片）。ここでは「北条の先手との野戦→北条の新手を受ける→退く北条を追う」の形に推した。
//   出所：Wikipedia「生野山の戦い」・本庄市の郷土史の案内。くわしくは docs/chapter_uesugi.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HOJO = { flag: 'hojo', armor: 0x2e2a26 };
const SPAWN = { x: -10, z: 150 };
const STREAM = [[-220, 60], [-100, 52], [0, 58], [110, 48], [220, 56]];   // 生野山の北の小川（児玉の野を流れる）
const FORD = { x: 0, z: 40 };           // 小川の渡り（南の岸）
const NOHARA = { x: 10, z: -10 };       // 生野山の北の野（北条の先手が出る所）
const YAMA = { x: -20, z: -70 };        // 生野山の肩（上杉の陣を張る所）
const MINAMI = { x: 30, z: -150 };      // 生野山の南の麓（北条が退く道）

export const u06_ikunoyama = lightBattle({
  id: 'u06_ikunoyama',
  date: '永禄四年（1561）十一月　冬の初め・晴れ　武蔵国 生野山',
  intro: '川中島から戻った上杉政虎は、ふたたび関東へ出た。武田と結んだ北条氏康が、武蔵の北へ兵を出してくる。',
  history: '永禄四年（1561）の秋、第四次川中島の戦いの後、上杉政虎はふたたび関東へ出た。北条氏康は武田と結んで武蔵の北へ兵を出し、両軍は生野山で戦った。上杉方が北条勢を押し返し、北条勢は南へ退いた。',
  sides: { a: { name: '上杉政虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '北条氏康の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 8000, b: 10000 },
  allyLook: UESUGI, foeLook: HOJO,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1561, time: 'day', autumn: true, fogFar: 440,
    river: STREAM, riverW: 10, riverDepth: 0.5,
    hills: [[-20, -80, 60, 18], [-90, -60, 40, 10], [80, -110, 50, 9], [140, 120, 70, 8]],
    trees: 560, tufts: 2000,
  },
  allies: [
    { name: '上杉政虎の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z + 10 }, fixed: true, list: [busho('上杉政虎'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z - 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z - 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉政虎', '氏康め、信玄と手を組んで武蔵の北まで出てきおった', 3.4],
      ['上杉政虎', '生野山を取る。小川を越え、北条の先手を野で叩け', 3.4]] },
    { kind: 'move', at: FORD, label: '小川の渡り', obj: '小川を渡り、生野山の北の野へ', r: 12,
      say: [['組頭', '浅い川じゃ。足を止めるな、向こうに北条の旗が見えるぞ！', 3]] },
    { kind: 'fight', at: NOHARA, obj: '生野山の北の野で、北条の先手を崩す', title: '生野山の北の野', sub: '北条の先手が野に出て構える',
      say: [['北条の侍', '越後の者が来たぞ！　槍を揃えよ！', 3]],
      foes: [
        { name: '北条の先手', from: { x: NOHARA.x - 6, z: NOHARA.z - 10 }, list: [uS(3), uA(18)] },
        { name: '北条の鉄砲', from: { x: NOHARA.x + 16, z: NOHARA.z - 16 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '左から北条の槍が回ってくる！'], foes: [{ name: '北条の脇の槍', from: { x: NOHARA.x - 34, z: NOHARA.z - 4 }, list: [uS(2), uA(12)] }] }],
      reward: '生野山の北の野で北条の先手を崩した' },
    { kind: 'hold', at: YAMA, label: '生野山の肩', obj: '生野山の肩に陣を張り、北条の新手を受け止める', r: 16, dur: 70,
      title: '北条の新手', sub: '氏康の新手が南の麓から山へ押し上げる',
      say: [['上杉政虎の使番', '殿より。山の肩を取れ。上から槍を落とせば北条は登れぬ', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '南の麓から北条の新手！　山へ登ってくるぞ！'], foes: [{ name: '北条の新手', from: { x: YAMA.x + 8, z: YAMA.z - 46 }, list: [uS(3), uA(20)] }] },
        { t: 38, say: ['組頭', '二の手が来る！　肩を明け渡すな！'], foes: [{ name: '北条の二の手', from: { x: YAMA.x - 30, z: YAMA.z - 40 }, list: [uS(2), uA(12), { type: 'bow', n: 4 }] }] }],
      reward: '生野山の肩で北条の新手を受け止めた' },
    { kind: 'fight', at: MINAMI, obj: '南の麓へ下り、退く北条の殿を追い崩す', title: '南の麓', sub: '北条勢が南へ退き始めた',
      say: [['上杉政虎', '北条が崩れた。麓まで追え。深追いはせぬぞ', 3.2]],
      foes: [{ name: '北条の殿', from: { x: MINAMI.x - 4, z: MINAMI.z - 8 }, list: [uS(3), uA(18)] }],
      reward: '南の麓で退く北条の殿を崩した' },
  ],
  win: {
    banner: '北条、退く', sub: '北条勢は生野山から南へ退いた', award: '生野山で北条勢を押し返した',
    say: [['上杉政虎の使番', '北条の旗、南へ下がりまする！', 3.2],
      ['上杉政虎', '関東の者どもは、まだ北条と越後の間で揺れておる。気を抜くな', 3.4]],
  },
});
export default u06_ikunoyama;
