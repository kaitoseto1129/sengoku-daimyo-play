// 北条家編 十一戦目「沼尻の合戦」（天正十二年〔1584〕五月〜七月・下野国 沼尻）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：北条氏直は下野の沼尻で、佐竹義重・宇都宮国綱らの北関東の諸将と百日ほど睨み合った。佐竹方は鉄砲を多く揃えていた。
//   北条は岩船山を取って佐竹方の背をおびやかし、やがて両方が和睦して兵を引いた（『佐竹家譜』B・栃木市の解説 C。合戦の細部は推）。
//   主人公は氏直の使番の組。①沼の柵で佐竹の鉄砲の寄せを受ける ②岩船山へ回る ③岩船山の守りを崩す ④取り返しに来る佐竹方を受ける
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const SATAKE = { flag: 'satake', armor: 0x24221f };
const SPAWN = { x: 0, z: 140 };
const SAKU = { x: 0, z: 90 };         // 沼の縁の柵
const IWAFUNE = { x: 90, z: -30 };    // 岩船山の上

export const h14_numajiri = lightBattle({
  id: 'h14_numajiri',
  date: '天正十二年（1584）七月　夏・曇り　下野国 沼尻',
  intro: '沼をはさんで、佐竹・宇都宮と睨み合って百日。氏直様は、岩船山を取って敵の背をおびやかす。',
  history: '天正十二年（1584）、北条氏直は下野の沼尻で、佐竹義重・宇都宮国綱らの北関東の諸将と百日ほど睨み合った。佐竹方は鉄砲を多く揃えていた。北条は岩船山を取って佐竹方の背をおびやかし、やがて両方が和睦して兵を引いた。',
  sides: { a: { name: '北条氏直の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '佐竹義重・宇都宮国綱の軍', mon: 'satake', faction: 'satake' } },
  force: { a: 30000, b: 20000 },
  allyLook: HOJO, foeLook: SATAKE,
  friendsSend: 1,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1584, time: 'day', overcast: true, fogFar: 380,
    river: [[-220, 50], [-100, 56], [-20, 50], [40, 60], [220, 54]], riverW: 26, riverDepth: 0.4,
    hills: [[90, -30, 40, 20], [-80, -60, 60, 10]],
    paths: [{ pts: [[0, 190], [0, 140], [0, 90], [60, 70], [90, -30]], w: 3 }],
    groves: [{ x: 90, z: -40, r: 26, n: 30, kind: 'sugi' }, { x: -90, z: 100, r: 28, n: 26 }],
    trees: 460, tufts: 2000,
  },
  allies: [
    { name: '北条氏直の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z + 10 }, fixed: true, list: [busho('北条氏直'), uS(4), uA(8)] },
    { name: '柵の足軽', at: { x: SAKU.x - 12, z: SAKU.z + 6 }, list: [uS(2), uA(14)] },
    { name: '北条の鉄砲衆', at: { x: SAKU.x + 12, z: SAKU.z + 6 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏直', '佐竹の鉄砲は多い。柵から出るな', 3],
      ['組頭', '敵が沼を渡って来たら、柵の前で受けよ', 3]] },
    { kind: 'hold', at: SAKU, label: '沼の柵', obj: '沼の縁の柵で、佐竹の寄せを受け止める', r: 16, dur: 80, title: '沼の柵', sub: '佐竹の鉄砲の音が沼に響く',
      say: [['佐竹の侍', '北条の柵を破れ！', 3]],
      waves: [
        { t: 3, foes: [{ name: '佐竹の先手', from: { x: SAKU.x - 6, z: SAKU.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹の組頭 真壁' } }, uS(3), uA(18)] }] },
        { t: 30, say: ['見張り', '鉄砲衆が沼の縁に並んだ！'], foes: [{ name: '佐竹の鉄砲衆', from: { x: SAKU.x + 30, z: SAKU.z - 36 }, list: [uS(1), uG(10)] }] },
        { t: 56, foes: [{ name: '宇都宮の手', from: { x: SAKU.x - 30, z: SAKU.z - 40 }, list: [uS(1), uA(10)] }] }],
      reward: '沼の柵で佐竹の寄せを受け止めた' },
    { kind: 'move', at: { x: 60, z: 70 }, label: '岩船山の麓', obj: '沼の東を回り、岩船山の麓へ出る', r: 12, max: 110,
      say: [['北条氏直', '岩船山を取れ。佐竹の背が丸見えになる', 3.2]] },
    { kind: 'fight', at: IWAFUNE, limit: 150, obj: '岩船山の上の佐竹方の守りを崩す', title: '岩船山', sub: '山の上に佐竹方の小屋',
      say: [['組頭', '上へ押し上がれ！', 3]],
      foes: [{ name: '岩船山の守り', from: { x: IWAFUNE.x, z: IWAFUNE.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '佐竹方の組頭 皆川' } }, uS(2), uA(16), uG(2)] }],
      reward: '岩船山を取った' },
    { kind: 'hold', at: IWAFUNE, label: '岩船山', obj: '取り返しに来る佐竹方から、岩船山を守る', r: 16, dur: 70, title: '取り返し', sub: '佐竹方が山を取り返しに来る',
      say: [['見張り', '佐竹が山を取り返しに来る！', 3]],
      waves: [
        { t: 4, foes: [{ name: '佐竹の取り返し', from: { x: IWAFUNE.x - 40, z: IWAFUNE.z - 20 }, list: [busho('佐竹の侍大将', { mustLive: false, invuln: false }), uS(3), uA(18)] }] },
        { t: 34, foes: [{ name: '佐竹の二の手', from: { x: IWAFUNE.x + 10, z: IWAFUNE.z - 44 }, list: [uS(2), uA(12)] }] }],
      reward: '岩船山を守り抜いた' },
  ],
  win: {
    banner: '沼尻の和睦', sub: '岩船山を取られた佐竹方は和を乞い、両軍は兵を引いた', award: '岩船山を取って守った',
    say: [['北条氏直', '百日の睨み合いも、これで終わりじゃ', 3],
      ['組頭', '血を流さずに済む和睦なら、それが一番じゃ', 3]],
  },
});
export default h14_numajiri;
