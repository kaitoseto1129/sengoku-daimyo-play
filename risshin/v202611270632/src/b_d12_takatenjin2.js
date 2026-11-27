// 武田編 十二戦目「高天神城の戦い（二）」（天正九年〔1581〕三月二十二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：家康は高天神城を一年余り囲み、堀と柵と砦で兵糧の道を断った。勝頼は後詰を送れず、兵糧の尽きた城将 岡部元信は
//   三月二十二日の夜、城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した（『信長公記』『三河物語』・掛川市の高天神城跡の案内）。
//   主人公は城兵の一人。夜の打って出で囲みを破り、生きて抜ける。
// 11/21 cloud-10（司令塔）：本人の討ち取りが1だったので、新手と見張りに討てる名のある組頭を一人ずつ混ぜた（討てない将 busho は使わない）
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { withCastle } from './light_castle.js';
import { TAKATENJIN_D12 } from './castles/takatenjin.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -40 };
const KIDO = { x: 4, z: 10 };        // 城の大手の木戸（打って出の口）
const SAKU = { x: -24, z: 64 };      // 徳川の囲みの柵
const TORIDE = { x: 30, z: 104 };    // 囲みの砦（大坂の砦）
const NUKE = { x: 0, z: 150 };       // 囲みの外（林の中の抜け道）

// 11/21 クラウド35（K563 ③の質）：高天神城の縄張りを置く（castles/takatenjin.js の TAKATENJIN_D12・出所 docs/battle_refs/takatenjin.md）。門・櫓・館は遠景の軽い形（本物の門は閉じて寄せ手と城兵の行き来を塞いだので使わない）
export const d12_takatenjin2 = withCastle(lightBattle({
  id: 'd12_takatenjin2',
  date: '天正九年（1581）三月二十二日　夜　遠江国 高天神城',
  intro: '兵糧は尽きた。岡部元信と共に、夜の闇に紛れて打って出る。徳川の囲みの柵を破り、外へ抜けよ。',
  history: '天正九年（1581）、家康は高天神城を一年余り囲み、兵糧の道を断った。勝頼は後詰を送れず、城将の岡部元信は三月二十二日の夜に城兵と共に打って出て、徳川の囲みに斬り込み、ほとんどが討死した。後詰を出さなかった勝頼の名は落ち、武田から離れる者が増えた。',
  sides: { a: { name: '岡部元信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '徳川の囲み', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 1000, b: 5000 },
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 6,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1581, time: 'night', fogFar: 300,
    hills: [[0, -60, 50, 26], [-120, 40, 70, 14], [120, 60, 60, 14], [0, 170, 60, 6]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：城の大手の木戸・徳川の囲みの柵・囲みの砦・囲みの外 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -40], [4, 10], [-24, 64], [30, 104], [0, 150]], w: 3 }],
    groves: [{ x: -120, z: 40, r: 30, n: 30, kind: 'sugi' }, { x: 120, z: 60, r: 30, n: 30, kind: 'sugi' }],
    trees: 580, tufts: 1500,
  },
  // 11/21 cloud-41（章の通し）：通しの足軽が囲まれて十数秒で倒れる回が残った（受けの段・数十の槍）。敵は変えず、味方の刃を 0.15→0.35 に上げて味方が囲みを削る（本人の討ち取りは減ってもよい）
  allies: [
    { name: '岡部元信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.35, list: [busho('岡部元信'), uS(4), uA(14)] },
    { name: '城兵', at: { x: SPAWN.x + 12, z: SPAWN.z + 4 }, dmg: 0.35, list: [uS(3), uA(12)] },
    // 11/21 cloud-41（章の通し）：通しの本人（組の無い足軽）が木戸の前で三十余の槍に囲まれ80秒前後で倒れた。敵は変えず、本人の脇に城兵の槍衆を一組足す
    { name: '城兵の槍衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 10 }, dmg: 0.35, list: [uS(3), uA(16)] },
  ],
  steps: [
    { kind: 'rest', dur: 18, heal: 0, say: [
      ['城兵', '城壁から見よ。徳川の砦が、城をぐるりと取り巻いておる', 3],
      ['岡部元信', '九年前、われらが攻め上った道じゃ。今度は徳川が登って来る', 3.2],
      ['城兵', '兵糧は、もう数日分しか残っておりませぬ', 3],
      ['使者', '岡部様、戻りました。御屋形様より後詰はござらぬ', 3.2],
      ['岡部元信', '後詰は来ぬ。城に残っても飢えて死ぬだけじゃ', 3.2],
      ['岡部元信', '今宵、打って出る。一人でも多く囲みを抜けよ', 3.2]] },
    { kind: 'fight', at: KIDO, obj: '木戸から打って出て、木戸の前の徳川の見張りを討つ', title: '打って出', sub: '闇の中で鬨の声',
      say: [['城兵', '木戸を開けよ！', 2.4], ['徳川の侍', '城から出て来たぞ！', 2.6]],
      foes: [{ name: '木戸の前の見張り', from: { x: KIDO.x, z: KIDO.z + 16 }, list: [{ type: 'samurai', n: 1, o: { name: '見張りの組頭' } }, uS(5), uA(32)] }],
      later: [{ t: 25, say: ['徳川の侍', '城兵が出た！　囲め！'], foes: [{ name: '囲みの見回り', from: { x: KIDO.x + 16, z: KIDO.z + 20 }, list: [{ type: 'samurai', n: 1, o: { name: '大須賀康高の組頭' } }, uS(3), uA(16)] }] }],
      reward: '木戸の前の見張りを破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + 10, z: KIDO.z + 16 }, obj: '木戸の前の堀端で、松明を振る徳川の足軽を討つ', limit: 90,
      say: [['岡部元信', '松明を消せ。闇に紛れて抜ける', 3.2]],
      foes: [{ name: '松明の徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: KIDO.x + 10, z: KIDO.z + 16 }), list: [uS(2), uA(10)] }],
      reward: '松明の足軽を討った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x - 14, z: KIDO.z + 34 }, obj: '囲みの内の野で、駆け付けた徳川の侍を討つ', limit: 90,
      say: [['組頭', '侍が駆け付けた。囲まれる前に討て', 3.2]],
      foes: [{ name: '駆け付けた徳川の侍', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: KIDO.x - 14, z: KIDO.z + 34 }), list: [uS(3), uA(8)] }],
      reward: '駆け付けた侍を討った' },
    // 11/21 cloud-41（章の通し）：通しの本人が前の段で深手を負い、次の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.6, say: [['岡部元信', '見張りは破った。傷を縛れ、柵へかかる', 2.8]] },
    { kind: 'fight', at: SAKU, obj: '徳川の囲みの柵へ斬り込み、柵の守りを破る', title: '囲みの柵', sub: '柵の内から鉄砲が鳴る',
      say: [['岡部元信', '柵を倒せ！　押し破れ！', 2.8]],
      foes: [
        { name: '柵の守り', from: { x: SAKU.x + 6, z: SAKU.z + 10 }, list: [uS(5), uA(35)] },
        { name: '柵の鉄砲', from: { x: SAKU.x - 10, z: SAKU.z + 16 }, list: [uG(8)] }],
      later: [{ t: 25, say: ['物見', '柵の向こうから新手！'], foes: [{ name: '柵の新手', from: { x: SAKU.x + 16, z: SAKU.z + 18 }, list: [uS(3), uA(16)] }] }, { t: 55, say: ['組頭', '横からも来る！'], foes: [{ name: '横の新手', from: { x: SAKU.x - 20, z: SAKU.z + 8 }, list: [uS(3), uA(12)] }] }],
      reward: '囲みの柵を破った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['岡部元信', '柵は破った。傷を縛れ、鉄砲が残っておる', 2.8]] },   // K674：柵の後で倒れた回（act bot 382秒）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x + 12, z: SAKU.z + 16 }, obj: '柵の内の鉄砲組を斬り払う', limit: 90,
      say: [['組頭', '柵の内の鉄砲じゃ。撃たせるな', 3.2]],
      foes: [{ name: '柵の内の徳川の鉄砲組', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: SAKU.x + 12, z: SAKU.z + 16 }), list: [uS(1), uA(4), uG(6)] }],
      reward: '柵の内の鉄砲組を斬り払った' },
    { kind: 'rest', dur: 6, heal: 0.4, say: [['組頭', '鉄砲は黙った。息を継げ', 2.6]] },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x + 24, z: SAKU.z + 34 }, obj: '柵の裏の陣屋の前で、寝所から出た徳川の兵を討つ', limit: 90,
      say: [['組頭', '陣屋から兵が出て来た。数を増やすな', 3.2]],
      foes: [{ name: '陣屋の徳川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: SAKU.x + 24, z: SAKU.z + 34 }), list: [uS(2), uA(12)] }],
      reward: '陣屋の兵を討った' },
    { kind: 'hold', at: TORIDE, label: '砦の前', obj: '砦から出る徳川の新手を受け、後ろの城兵を通す', r: 16, dur: 45,
      title: '砦', sub: '岡部様が討たれた——',
      say: [['城兵', '岡部様、お討死！', 2.6], ['組頭', '止まるな！　後ろの者を通せ！', 2.8]],
      waves: [
        { t: 6, say: ['徳川の侍', '一人も逃がすな！'], foes: [{ name: '砦の新手', from: { x: TORIDE.x, z: TORIDE.z + 20 }, list: [uS(5), uA(35)] }] },
        { t: 26, say: ['物見', '横から槍衆！'], foes: [{ name: '横の槍衆', from: { x: TORIDE.x - 26, z: TORIDE.z + 6 }, list: [uS(2), uA(14)] }] },
        { t: 40, say: ['組頭', '砦の裏からも出て来る！　止まるな！'], foes: [{ name: '砦の裏の手', from: { x: TORIDE.x + 22, z: TORIDE.z + 16 }, list: [uS(2), uA(14)] }] }],
      reward: '砦の前で城兵を通した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TORIDE.x - 14, z: TORIDE.z + 10 }, obj: '砦の脇の空堀で、追って来る徳川の足軽を斬り払う', limit: 90,
      say: [['組頭', '空堀へ引き込め。追う足軽を斬れ', 3.2]],
      foes: [{ name: '追う徳川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: TORIDE.x - 14, z: TORIDE.z + 10 }), list: [uS(2), uA(12)] }],
      reward: '追う足軽を斬り払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: NUKE.x + 10, z: NUKE.z - 24 }, obj: '林の入り口で、先回りした徳川の弓を討つ', limit: 90,
      say: [['物見', '林の口に弓が先回りしておる！', 3.2]],
      foes: [{ name: '先回りの徳川の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (14) }))({ x: NUKE.x + 10, z: NUKE.z - 24 }), list: [uS(1), uA(4), uB(6)] }],
      reward: '先回りの弓を討った' },
    { kind: 'move', at: NUKE, label: '囲みの外の林', obj: '囲みの外の林へ抜ける', r: 12,
      say: [['組頭', 'あの林じゃ！　走れ！', 2.6]] },
  ],
  win: {
    banner: '高天神城 囲みを抜ける', sub: '城兵のほとんどは討死した', award: '高天神の囲みを抜けた',
    say: [['城兵', '……抜けた。抜けたのは、何人じゃ', 3],
      ['組頭', '後詰の来ぬ城か。甲斐の者は、もう御屋形様を信じぬかもしれぬ', 3.6]],
  },
}), { plan: TAKATENJIN_D12, at: { x: 0, z: 0 }, lift: 0, team: 0 });
// K657②（11/25）：尾根の城と分かるように。乾いた赤土・崖の砂ぼこり・松の濃い緑（timeslip_field.js・数は増やさず色だけ・K643）
d12_takatenjin2.timeslip = {
  wet: 0.05, dust: 0.45, trample: 0.3, debris: 0.4, arrows: 0.5, mudColor: 0x8a6244, hazeColor: 0xb8a888, grassLift: 0.05,
  grass: 0x6e7a46, grassTints: [0xffffff, 0xcfc08e, 0x9aa468], grassH: 0.9, grassCap: 380,
  flagColors: [0x1c1a1a, 0xc23a2a, 0xe6dfcc],
};
export default d12_takatenjin2;
