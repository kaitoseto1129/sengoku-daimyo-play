// 武田編 十一戦目「長篠・設楽原の戦い」（天正三年〔1575〕五月二十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：勝頼は長篠城の囲みを残し、設楽原で連吾川の向こうに馬防柵を三重に結んだ織田・徳川の三万八千へ、一万五千で攻めかかった。
//   山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した
//   （『信長公記』『甲陽軍鑑』・設楽原歴史資料館の案内）。主人公は山県昌景の赤備えの足軽。負け戦を生き延びるのが勝ち。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const AKA = { flag: 'akazonae', armor: 0x8e1f16 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 150 };
const RENGO = [[-220, 40], [-100, 46], [0, 40], [100, 48], [220, 42]];   // 連吾川（柵の手前の浅い川）
const KAWA = { x: 6, z: 62 };        // 連吾川の岸（柵の三十歩手前）
const SAKU1 = { x: -30, z: 22 };     // 一の柵（徳川の大久保の前）
const SAKU2 = { x: 40, z: 20 };      // 二の柵の破れ目
const SHINGARI = { x: 0, z: 120 };   // 退き口（馬場の殿）

export const d11_shitaragahara = lightBattle({
  id: 'd11_shitaragahara',
  date: '天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原',
  intro: '連吾川の向こうに、織田・徳川の馬防柵が三重に並ぶ。山県昌景の赤備えと共に、柵へ寄せよ。',
  history: '天正三年（1575）五月二十一日、武田勝頼は設楽原で、馬防柵を結んだ織田・徳川の大軍へ攻めかかった。山県昌景・内藤昌豊・馬場信春らが柵へ寄せては鉄砲に撃たれ、昼過ぎに武田は崩れた。山県は柵の前で、馬場は殿をつとめて討死した。武田の名のある将の多くがこの日に失われた。',
  sides: { a: { name: '山県昌景の赤備え', mon: 'takeda', faction: 'takeda' }, b: { name: '織田・徳川の柵の兵', mon: 'oda', faction: 'oda' } },
  force: { a: 15000, b: 38000 },
  allyLook: AKA, foeLook: ODA,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 15750521, time: 'morning', wetStart: 0.55, mist: 0.5, fogFar: 380,
    river: RENGO, riverW: 8, riverDepth: 0.4,
    hills: [[0, -60, 70, 14], [-140, -10, 60, 12], [140, -20, 60, 12], [0, 170, 60, 8]],
    trees: 460, tufts: 2000,
  },
  allies: [
    { name: '山県昌景の赤備え', at: { x: SPAWN.x - 12, z: SPAWN.z - 8 }, dmg: 0.25, list: [busho('山県昌景', { armor: AKA.armor }), uS(4), uA(16)] },
    { name: '内藤昌豊の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 6 }, dmg: 0.25, list: [busho('内藤昌豊'), uS(3), uA(14)] },
    { name: '馬場信春の手', at: { x: SPAWN.x, z: SPAWN.z + 12 }, dmg: 0.25, list: [busho('馬場信春'), uS(3), uA(12)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['山県昌景', '柵は三重。だが鉄砲は込めるのに間がある。撃ち終えた所へ駆け込め', 3.4],
      ['組頭', '赤備え、川を渡るぞ！', 2.6]] },
    { kind: 'move', at: KAWA, label: '連吾川の岸', obj: '連吾川を渡り、柵の前の岸へ寄せる', r: 12,
      say: [['物見', '柵の向こうで火縄の煙！　伏せよ！', 3]] },
    { kind: 'fight', at: SAKU1, obj: '一の柵へ寄せ、柵の前に出た徳川の兵を討つ', title: '一の柵', sub: '柵の内から鉄砲が鳴る',
      say: [['山県昌景', '怯むな！　柵に取り付け！', 2.8], ['大久保忠世', '一人も柵を越えさせるな！', 2.6]],
      foes: [
        { name: '大久保の手', from: { x: SAKU1.x + 4, z: SAKU1.z - 10 }, list: [uS(5), uA(35)] },
        { name: '柵の内の鉄砲', from: { x: SAKU1.x - 8, z: SAKU1.z - 18 }, list: [uG(10)] }],
      reward: '一の柵へ取り付いた' },
    { kind: 'fight', at: SAKU2, obj: '二の柵の破れ目で、出て来た織田の兵を押し返す', title: '二の柵', sub: '山県様が撃たれた——',
      say: [['赤備えの侍', '山県様、お討死！', 2.8], ['内藤昌豊', '山県の仇じゃ！　破れ目から押し込め！', 3]],
      foes: [
        { name: '織田の柵の兵', from: { x: SAKU2.x, z: SAKU2.z - 12 }, list: [uS(6), uA(35)] },
        { name: '二の柵の鉄砲', from: { x: SAKU2.x + 10, z: SAKU2.z - 20 }, list: [uG(8)] }],
      reward: '二の柵の破れ目で戦った' },
    { kind: 'hold', at: SHINGARI, label: '退き口', obj: '退き口で馬場信春の殿と共に、追う織田・徳川を食い止める', r: 18, dur: 65,
      title: '殿', sub: '御屋形様を甲斐へ落とせ',
      say: [['馬場信春', 'わしが殿じゃ。御屋形様を落とせ。若い者は生きて甲斐へ帰れ', 3.6]],
      waves: [
        { t: 6, say: ['徳川の侍', '逃がすな！　追え！'], foes: [{ name: '追う徳川の手', from: { x: SHINGARI.x - 20, z: SHINGARI.z - 40 }, list: [uS(5), uA(32)] }] },
        { t: 28, say: ['織田の侍', '武田の殿を討て！'], foes: [{ name: '追う織田の手', from: { x: SHINGARI.x + 20, z: SHINGARI.z - 40 }, list: [uS(5), uA(29)] }] }],
      reward: '退き口で殿を支えた' },
  ],
  win: {
    banner: '設楽原 退き口を生き延びる', sub: '山県・内藤・馬場ら名のある将の多くが討死した', award: '退き口で殿を支えた',
    say: [['使番', '御屋形様は、無事に甲斐へ向かわれました', 3],
      ['組頭', '……生きて帰れ、か。馬場様の言葉、忘れぬ', 3.4]],
  },
});
export default d11_shitaragahara;
