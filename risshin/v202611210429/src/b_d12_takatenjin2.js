// 武田編 十二戦目「高天神城の戦い（二）」（天正九年〔1581〕三月二十二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：家康は高天神城を一年余り囲み、堀と柵と砦で兵糧の道を断った。勝頼は後詰を送れず、兵糧の尽きた城将 岡部元信は
//   三月二十二日の夜、城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した（『信長公記』『三河物語』・掛川市の高天神城跡の案内）。
//   主人公は城兵の一人。夜の打って出で囲みを破り、生きて抜ける。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -40 };
const KIDO = { x: 4, z: 10 };        // 城の大手の木戸（打って出の口）
const SAKU = { x: -24, z: 64 };      // 徳川の囲みの柵
const TORIDE = { x: 30, z: 104 };    // 囲みの砦（大坂の砦）
const NUKE = { x: 0, z: 150 };       // 囲みの外（林の中の抜け道）

export const d12_takatenjin2 = lightBattle({
  id: 'd12_takatenjin2',
  date: '天正九年（1581）三月二十二日　夜　遠江国 高天神城',
  intro: '兵糧は尽きた。岡部元信と共に、夜の闇に紛れて打って出る。徳川の囲みの柵を破り、外へ抜けよ。',
  history: '天正九年（1581）、家康は高天神城を一年余り囲み、兵糧の道を断った。勝頼は後詰を送れず、城将の岡部元信は三月二十二日の夜に城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した。後詰を出さなかった勝頼の名は落ち、武田から離れる者が増えた。',
  sides: { a: { name: '岡部元信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '徳川の囲み', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 1000, b: 5000 },
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1581, time: 'night', fogFar: 300,
    hills: [[0, -60, 50, 26], [-120, 40, 70, 14], [120, 60, 60, 14], [0, 170, 60, 6]],
    trees: 640, tufts: 1500,
  },
  allies: [
    { name: '岡部元信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.25, list: [busho('岡部元信'), uS(4), uA(14)] },
    { name: '城兵', at: { x: SPAWN.x + 12, z: SPAWN.z + 4 }, dmg: 0.25, list: [uS(3), uA(12)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['岡部元信', '後詰は来ぬ。城に残っても飢えて死ぬだけじゃ', 3.2],
      ['岡部元信', '今宵、打って出る。一人でも多く囲みを抜けよ', 3.2]] },
    { kind: 'fight', at: KIDO, obj: '木戸から打って出て、木戸の前の徳川の見張りを討つ', title: '打って出', sub: '闇の中で鬨の声',
      say: [['城兵', '木戸を開けよ！', 2.4], ['徳川の侍', '城から出て来たぞ！', 2.6]],
      foes: [{ name: '木戸の前の見張り', from: { x: KIDO.x, z: KIDO.z + 16 }, list: [uS(5), uA(32)] }],
      reward: '木戸の前の見張りを破った' },
    { kind: 'fight', at: SAKU, obj: '徳川の囲みの柵へ斬り込み、柵の守りを破る', title: '囲みの柵', sub: '柵の内から鉄砲が鳴る',
      say: [['岡部元信', '柵を倒せ！　押し破れ！', 2.8]],
      foes: [
        { name: '柵の守り', from: { x: SAKU.x + 6, z: SAKU.z + 10 }, list: [uS(5), uA(35)] },
        { name: '柵の鉄砲', from: { x: SAKU.x - 10, z: SAKU.z + 16 }, list: [uG(8)] }],
      reward: '囲みの柵を破った' },
    { kind: 'hold', at: TORIDE, label: '砦の前', obj: '砦から出る徳川の新手を受け、後ろの城兵を通す', r: 16, dur: 60,
      title: '砦', sub: '岡部様が討たれた——',
      say: [['城兵', '岡部様、お討死！', 2.6], ['組頭', '止まるな！　後ろの者を通せ！', 2.8]],
      waves: [
        { t: 6, say: ['徳川の侍', '一人も逃がすな！'], foes: [{ name: '砦の新手', from: { x: TORIDE.x, z: TORIDE.z + 20 }, list: [uS(5), uA(35)] }] },
        { t: 26, say: ['物見', '横から槍衆！'], foes: [{ name: '横の槍衆', from: { x: TORIDE.x - 26, z: TORIDE.z + 6 }, list: [uS(4), uA(26)] }] }],
      reward: '砦の前で城兵を通した' },
    { kind: 'move', at: NUKE, label: '囲みの外の林', obj: '囲みの外の林へ抜ける', r: 12,
      say: [['組頭', 'あの林じゃ！　走れ！', 2.6]] },
  ],
  win: {
    banner: '高天神城 囲みを抜ける', sub: '城兵のほとんどは討死した', award: '高天神の囲みを抜けた',
    say: [['城兵', '……抜けた。抜けたのは、何人じゃ', 3],
      ['組頭', '後詰の来ぬ城か。甲斐の者は、もう御屋形様を信じぬかもしれぬ', 3.6]],
  },
});
export default d12_takatenjin2;
