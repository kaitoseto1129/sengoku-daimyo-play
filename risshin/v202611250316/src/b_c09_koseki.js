// 長宗我部家編 十三「黄石山城の戦い」（慶長二年〔1597〕八月・朝鮮 慶尚道 黄石山城＝慶長の役）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：慶長の役で、右軍（毛利秀元・加藤清正・黒田長政ら）は慶尚道の山の城 黄石山城を一夜で攻め落とした。
//   長宗我部元親・盛親も右軍の一手として渡ったとされる（『征韓録』B・通説 C。長宗我部の持ち場は推）。呼び集めは使わない（海の向こうには畦の者はいない）
import { chosoBattle, ICHIRYO, uS, uA, uB, uG, busho } from './chosokabe_kit.js';

const MING = { flag: 'ming', armor: 0x5a3a2a };
const SPAWN = { x: 0, z: -40 };
const SAKU = { x: 0, z: 22 };       // 山の裾の柵
const SLOPE = { x: -8, z: 46 };     // 坂の上の受け
const GATE = { x: 4, z: 92 };       // 城の門

export const c09_koseki = chosoBattle({
  id: 'c09_koseki',
  date: '慶長二年（1597）八月　夜　朝鮮 慶尚道 黄石山城',
  intro: '海を渡って、再びの朝鮮。右軍は山の上の黄石山城を、一夜で落とすと決めた。月の下、長宗我部の兵も坂を上る。',
  history: '慶長二年（1597）、豊臣秀吉は再び朝鮮へ兵を送った（慶長の役）。右軍は慶尚道の山の城 黄石山城を夜に攻め、一夜で落とした。長宗我部元親・盛親も右軍の一手として渡ったと伝わる（長宗我部の持ち場と兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '朝鮮の軍', mon: 'ming', faction: 'ming' } },
  force: { a: 3000, b: 7000 },
  foeLook: MING,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1597, time: 'night', fogFar: 320, autumn: true,
    hills: [[GATE.x, GATE.z + 20, 60, 22], [SLOPE.x, SLOPE.z, 40, 8], [-140, 40, 70, 22], [140, 60, 70, 24], [0, -150, 80, 14]],
    paths: [{ pts: [[0, -140], [0, -40], [0, 22], [-8, 46], [4, 92], [0, 140]], w: 2.6 }],
    groves: [{ x: -140, z: 40, r: 34, n: 34 }, { x: 140, z: 60, r: 34, n: 34 }, { x: -60, z: -80, r: 26, n: 22 }],
    trees: 460, tufts: 1400,
  },
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, fixed: true, list: [busho('長宗我部元親'), uS(4), uA(6)] },
    { name: '長宗我部盛親の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('長宗我部盛親'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(4)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部盛親', '一夜で落とせとの下知じゃ。土佐の兵、遅れを取るな', 3.2],
      ['組頭', '月が出ておる。坂の柵まで、声を出さずに寄るぞ', 3],
      ['長宗我部元親', '海の向こうまで来て、討ち死にするでないぞ', 3]] },
    { kind: 'fight', at: SAKU, obj: '山の裾の柵の守り手を破る', title: '黄石山城', sub: '山の裾に柵', max: 120,
      say: [['長宗我部盛親', 'かかれ！', 2.4], ['朝鮮の将', '敵じゃ！　柵を守れ！', 3]],
      foes: [{ name: '柵の守り手', from: { x: SAKU.x + 4, z: SAKU.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 26, say: ['朝鮮の将', '弓、放て！'], foes: [{ name: '城の弓', from: { x: SAKU.x + 20, z: SAKU.z + 18 }, list: [uS(1), uB(6)] }] }],
      reward: '山の裾の柵を破った' },
    { kind: 'hold', at: SLOPE, label: '坂の上', obj: '坂の上を守り、城兵の打って出を受ける', r: 16, dur: 60, title: '坂の上', sub: '城兵が打って出る',
      say: [['組頭', '坂の上を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['朝鮮の将', '打って出よ！　坂から落とせ！'], foes: [{ name: '城兵', from: { x: SLOPE.x + 8, z: SLOPE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['朝鮮の将', '二の手、続け！'], foes: [{ name: '城兵の二', from: { x: SLOPE.x - 20, z: SLOPE.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '坂の上を守った' },
    { kind: 'fight', at: GATE, obj: '城の門を破る', title: '城の門', sub: '城将が門で踏みとどまる', max: 140,
      say: [['長宗我部盛親', '門じゃ！　押せ！', 3]],
      foes: [{ name: '城将の備', from: { x: GATE.x, z: GATE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '城将', horse: false } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['朝鮮の将', '門を守れ！　最後まで！'], foes: [{ name: '門の守り手', from: { x: GATE.x - 14, z: GATE.z + 16 }, list: [uS(2), uA(8)] }] }],
      reward: '黄石山城の門を破った' },
  ],
  win: {
    banner: '黄石山城の勝ち', sub: '一夜で城が落ちる', award: '黄石山城の門を破った',
    say: [['組頭', '……城が落ちた。夜が明ける前じゃ', 3],
      ['長宗我部盛親', '土佐の兵、よう働いた', 3],
      ['組頭', '早う土佐へ帰りたいのう。田が荒れてしまう', 3]],
  },
});
export default c09_koseki;
