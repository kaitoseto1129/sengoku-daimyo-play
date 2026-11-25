// 今川家編 十三戦目「曳馬城の戦い」（永禄七年〔1564〕・遠江国 曳馬城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：遠江の国人が今川に背いた遠州忩劇。曳馬城の飯尾連龍が背き、今川氏真の軍が攻めた。城は落ちず和睦となった（『松平記』B・浜松市の解説 C）。
//   城の外に出た飯尾の手を退け、打って出る城方から和睦の使いを守る。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, REBEL } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, HIKU = { x: 45, z: -15 }, HON = { x: -112, z: 62 }, ATO = { x: -150, z: 82 }, MAE = { x: -10, z: 15 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2.2 * Math.sin(x * 0.021 + 0.8) * Math.cos(z * 0.02 + 0.3) + 11 * gauss(x, z, HIKU.x, HIKU.z, 1500);

export const i13_hikuma = imagawaBattle({
  id: 'i13_hikuma',
  date: '永禄七年（1564）　遠江国 曳馬城',
  intro: '遠江の国人が背いた。曳馬城の飯尾連龍を、若殿の氏真様の軍で攻める。あなたは今川の先手の足軽。',
  history: '永禄六年（1563）ごろから、遠江の国人が今川に背いた（遠州忩劇）。曳馬城の飯尾連龍も背き、今川氏真の軍が攻めたが城は落ちず、和睦となった。連龍は翌年、駿府で討たれた（『松平記』B・浜松市の解説 C）。',
  sides: { a: { name: '今川氏真の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '飯尾連龍の城方', mon: 'imagawa', faction: 'oda' } },
  force: { a: 3000, b: 1000 }, allyLook: IMAGAWA, foeLook: REBEL,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1564, time: 'day', overcast: true, fogFar: 340 },
  allies: [
    { name: '今川の先手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('朝比奈泰朝'), uS(3), uA(8)] },
    { name: '氏真様の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'imagawa', foeFlags: [{ x: HIKU.x - 8, z: HIKU.z + 6 }, { x: HIKU.x + 8, z: HIKU.z + 6 }],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['朝比奈泰朝', '飯尾は背いた。曳馬を囲む。じゃが、遠江はどこも揺れておる', 3.4], ['組頭', '味方の内にも、心の揺れる者がおる。帯を切らすな', 3.4]] },
    { kind: 'move', at: MAE, label: '曳馬の城下の手前', obj: '細った帯をたどり、本隊を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '本隊が遅れた。寄せと伝えよ', 3.2]] },
    { kind: 'fight', at: { x: 15, z: 5 }, obj: '城下に出た飯尾の手を討つ', title: '曳馬の城下', sub: '飯尾連龍の手', max: 120, limit: 110,
      say: [['飯尾連龍', '今川の世は終わった。遠江は遠江の者が守る', 3.2]],
      foes: [{ name: '曳馬の城方', from: { x: HIKU.x - 6, z: HIKU.z - 14 }, list: [busho('飯尾連龍', { horse: false }), uS(4), uA(12), uG(3)] }],
      later: [{ t: 30, say: ['組頭', '城の脇からも出た！'], foes: [{ name: '飯尾の別手', from: { x: HIKU.x - 30, z: HIKU.z + 22 }, list: [uS(2), uA(7), uB(2)] }] }],
      reward: '曳馬の城下で飯尾の手を退けた' },
    { kind: 'hold', at: MAE, label: '和睦の陣', obj: '和睦の使いが城へ入るまで、打って出る城方を止める', r: 16, dur: 60,
      title: '和睦', sub: '城は固い。使いが城へ入るまで持ちこたえる',
      say: [['朝比奈泰朝', '城は落ちぬ。和睦の使いを出す。使いを守れ', 3.2]],
      waves: [
        { t: 8, say: ['飯尾の侍', '和睦など聞かぬ！　打って出よ！'], foes: [{ name: '飯尾の打って出る手', from: { x: MAE.x + 40, z: MAE.z - 24 }, list: [uS(3), uA(10)] }] },
      ], reward: '和睦の使いを守った' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '和睦を嫌う飯尾の家臣が、城の西の口から打って出ました！', 3.2], ['朝比奈泰朝', '和睦を壊させるな。押し戻せ', 3]] },
    { kind: 'fight', at: { x: HIKU.x - 30, z: HIKU.z + 20 }, obj: '城の西の口から打って出た飯尾の家臣を押し戻す', title: '西の口', sub: '和睦を嫌う者が打って出た', max: 120, limit: 120,
      say: [['組頭', '使いは城の中じゃ。外の騒ぎを鎮めよ', 3]],
      foes: [{ name: '飯尾の家臣', from: { x: HIKU.x - 20, z: HIKU.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '飯尾の組頭' } }, uS(3), uA(12), uB(3)] }],
      later: [{ t: 30, say: ['見張り', '城からまだ出て来る！'], foes: [{ name: '飯尾の新手', from: { x: HIKU.x, z: HIKU.z }, list: [uS(2), uA(8)] }] }],
      reward: '西の口の飯尾の家臣を押し戻した' },
    { kind: 'hold', at: MAE, label: '和睦の陣', obj: '和睦の陣へ戻り、使いが城から出て来るまで守る', r: 16, dur: 60, title: '使いを待つ', sub: '城の中で話がまとまる',
      say: [['朝比奈泰朝', '使いが無事に出て来れば、それで良い', 3]],
      waves: [
        { t: 3, foes: [{ name: '揺れる国衆', from: { x: MAE.x + 40, z: MAE.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '国衆の侍' } }, uS(2), uA(12)] }] },
        { t: 30, say: ['見張り', '後ろからも来る！'], foes: [{ name: '国衆の別手', from: { x: MAE.x - 40, z: MAE.z - 30 }, list: [uS(2), uA(8)] }] }],
      reward: '使いが城から出て来るまで守った' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'fight', at: { x: 15, z: 5 }, obj: '城下に残って騒ぐ飯尾の兵を鎮め、陣を引き払う道を開ける', title: '引き払い', sub: '和睦の後も、城下は騒がしい', max: 120, limit: 120,
      say: [['朝比奈泰朝', '道を開けて、駿府へ引き払う', 3]],
      foes: [{ name: '城下の飯尾の兵', from: { x: 25, z: -5 }, list: [busho('飯尾の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      reward: '城下を鎮め、引き払う道を開けた' },
  ],
  win: { banner: '曳馬城', sub: '和睦を結んだ', award: '曳馬の城下で飯尾の手を退け、和睦の使いを守った', say: [['朝比奈泰朝', '和睦じゃ。じゃが、遠江はもう元には戻らぬ', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, HIKU.x + 4, HIKU.z - 6)); },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [-10, 15], [45, -15]]],
    treeDensity: () => 0.7, clear: (x, z) => [SPAWN, HIKU, HON, ATO, MAE].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 400, tufts: 1700,
  },
});
export default i13_hikuma;
