// 上杉編 十三戦目「御館の乱」（天正六年〔1578〕三月〜天正七年〔1579〕三月・越後 春日山・御館）。軽い型（light_battle.js）
//   史実：上杉謙信が跡継ぎを決めずに亡くなり、養子の上杉景勝（長尾政景の子）と上杉景虎（北条氏康の子）が家督を争った。
//   景勝は先に春日山城の本丸と金蔵を押さえ、景虎は府内の御館（前の関東管領 上杉憲政の館）に入って戦った。
//   景勝は武田勝頼と和を結んで北条の援けを断ち、翌年三月、御館を攻め落とした。景虎は鮫ヶ尾城へ逃れて自害した。
//   出所：Wikipedia「御館の乱」・上越市の春日山城跡と御館跡の案内。くわしくは docs/chapter_uesugi.md
//   景虎方の旗は北条の紋（hojo）を当てた（景虎は北条氏康の子・北条の援けを受けた）
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const KAGETORA = { flag: 'hojo', armor: 0x3c3226 };
const SPAWN = { x: 0, z: -150 };
const HONMARU = { x: 10, z: -110 };     // 春日山城の本丸の下（景虎方の寄せを受ける所）
const SLOPE = { x: -10, z: -50 };       // 春日山の麓（府内への道）
const TOWN = { x: 10, z: 10 };          // 府内の町（御館の前）
const OTATE = { x: -10, z: 70 };        // 御館の門

export const u13_otate = lightBattle({
  id: 'u13_otate',
  date: '天正六年（1578）五月　夏・曇り　越後国 春日山・御館',
  intro: '上杉謙信が跡継ぎを決めずに亡くなった。上杉景勝は春日山の本丸を押さえ、上杉景虎は府内の御館に入った。家を割る戦が始まる。',
  history: '天正六年（1578）、上杉謙信が亡くなると、養子の上杉景勝と上杉景虎が家督を争った。景勝は春日山城の本丸を押さえ、景虎は府内の御館に入った。景勝は武田勝頼と和を結び、翌年三月に御館を落とした。景虎は鮫ヶ尾城で自害した。',
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '上杉景虎の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 8000, b: 6000 },
  allyLook: UESUGI, foeLook: KAGETORA,
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1578, time: 'day', fogFar: 420,
    hills: [[0, -200, 70, 30], [-120, -120, 60, 16], [140, -80, 60, 12], [0, 160, 80, 6]],
    trees: 520, tufts: 2000,
  },
  allies: [
    { name: '上杉景勝の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉景勝'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['上杉景勝', '本丸と金蔵はこちらが押さえた。景虎は御館に入ったという', 3.4],
      ['上杉景勝', '景虎方がこの山へ寄せて来る。本丸の下で食い止めよ', 3.2]] },
    { kind: 'hold', at: HONMARU, label: '本丸の下', obj: '春日山の本丸の下で、景虎方の寄せを受け止める', r: 18, dur: 100,
      title: '春日山', sub: '景虎方が本丸を奪いに山を上ってくる',
      say: [['組頭', '昨日までの味方じゃ。だが手加減すれば本丸を失う！', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '御館の方から兵が上ってくる！'], foes: [{ name: '景虎方の先手', from: { x: HONMARU.x - 6, z: HONMARU.z + 40 }, list: [uS(3), uA(27)] }] },
        { t: 34, say: ['組頭', '脇の谷からも来る！'], foes: [{ name: '景虎方の二の手', from: { x: HONMARU.x + 30, z: HONMARU.z + 34 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: HONMARU.x - 30, z: HONMARU.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '春日山の本丸を守り抜いた' },
    { kind: 'fight', at: SLOPE, obj: '春日山の麓で、景虎方の陣を崩す', title: '麓の陣', sub: '景虎方が麓に陣を張って本丸を囲む',
      say: [['上杉景勝の使番', '御屋形様より。麓の囲みを破り、府内への道を開け', 3.2]],
      foes: [{ name: '景虎方の麓の陣', from: { x: SLOPE.x, z: SLOPE.z + 12 }, list: [uS(3), uA(30)] },
        { name: '景虎方の鉄砲', from: { x: SLOPE.x + 18, z: SLOPE.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: SLOPE.x + 30, z: SLOPE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '春日山の麓の囲みを破った' },
    { kind: 'fight', at: TOWN, obj: '府内の町で、御館を守る兵を払う', title: '府内', sub: '年が明け、北条の援けは雪で来られない',
      say: [['上杉景勝', '武田とは和を結んだ。北条の兵は峠を越えられぬ。今が攻め時じゃ', 3.4]],
      foes: [{ name: '御館の前の守り', from: { x: TOWN.x, z: TOWN.z + 12 }, list: [uS(3), uA(27)] }],
      later: [{ t: 30, say: ['組頭', '御館から新手が出たぞ！'], foes: [{ name: '御館の新手', from: { x: TOWN.x - 30, z: TOWN.z + 30 }, list: [uS(2), uA(18)] }] }],
      reward: '府内の町を取った' },
    { kind: 'fight', at: OTATE, obj: '御館の門を破り、景虎の旗本を崩す', title: '御館', sub: '景虎の旗本が館を守る',
      say: [['上杉景勝の使番', '館に火が回ります！　景虎殿を逃がすな！', 3.2]],
      foes: [{ name: '上杉景虎の旗本', from: { x: OTATE.x, z: OTATE.z + 8 }, list: [uS(4), uA(21)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: OTATE.x + 30, z: OTATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '御館の門を破った' },
  ],
  win: {
    banner: '御館落つ', sub: '御館は落ち、景虎は鮫ヶ尾城へ逃れて自害した。上杉の家は景勝が継いだ', award: '御館の乱を制した',
    say: [['上杉景勝の使番', '景虎殿は鮫ヶ尾へ逃れ、そこで果てられたとのこと', 3.2],
      ['上杉景勝', '兄弟で争うた傷は深い。越後を立て直すぞ', 3.4]],
  },
});
export default u13_otate;
