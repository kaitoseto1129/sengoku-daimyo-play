// 北条家編 十戦目「若御子の対陣（黒駒合戦）」（天正十年〔1582〕八月・甲斐国 黒駒）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   史実：天正壬午の乱。北条氏直は若御子に陣して、新府の徳川家康と長く睨み合った。
//   八月十二日、御坂峠から甲府へ出ようとした北条氏忠・氏勝の別手を、鳥居元忠らが黒駒で破った。秋に両家は和睦した
//   （『家忠日記』A・『北条五代記』B・笛吹市の解説 C。細部は推）。
//   主人公は氏忠の別手。①御坂峠を下る ②黒駒で鳥居の待ち伏せを受ける ③峠へ退く味方の殿
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { village, nobori } from './props.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 150 };
const KUROKOMA = { x: -6, z: 40 };    // 黒駒の村の口
const SAKA = { x: 10, z: 100 };       // 御坂峠への上り坂（殿）

// 11/26 せ K655：黒駒と分かる物。前は杉の丘と兵だけで、どこの峠とも分からなかった。
//   この戦の芯は「御坂峠を下りた北条の別手が、黒駒の村の口で林に伏せた鳥居の三つ葉葵に待ち伏せられた」こと（『家忠日記』A・笛吹市の解説 C）。
//   峠道の東の脇に黒駒の村（民家・畑）を置き、村の口の西と東の林の縁に徳川の幟、峠道を下る北条の列に北条の幟を立てる。
//   村は道から外し、幟は当たりが無い（遊びは前と同じ）
function kurokomaDress(rt) {
  const W = rt.world;
  rt.scene.add(village(W, KUROKOMA.x + 28, KUROKOMA.z - 6, { n: 6, r: 14, fields: 6, smoke: 1, seed: 1582 }));
  for (const [x, z] of [[-30, 2], [-24, -4], [-18, -9], [-12, -13], [12, -12], [18, -8], [24, -3]]) rt.scene.add(nobori(W, KUROKOMA.x + x, KUROKOMA.z + z, 'tokugawa', 7));
  // 11/26 せ（窓口の目視「両家の幟が読めない」）：峠の口の杉林の縁にも三つ葉葵の伏せの幟（この戦の杉林の段の伏せ・『家忠日記』A）。峠の上から手前に見える
  for (const [x, z] of [[-31, 118], [-30, 108], [-32, 98], [-29, 88], [31, 96], [30, 86], [33, 76]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 8));
  for (const [x, z] of [[5, 134], [-5, 128], [9, 112], [-1, 106], [5, 88], [-5, 80], [1, 68], [-9, 62], [-3, 54]]) rt.scene.add(nobori(W, x, z, 'hojo', 7));
}

export const h07_wakamiko = lightBattle({
  id: 'h07_wakamiko',
  date: '天正十年（1582）八月十二日　夏・晴れ　甲斐国 黒駒',
  intro: '若御子で徳川と睨み合って十日。氏忠様の別手は御坂峠を越え、甲府の背へ出る。',
  history: '天正十年（1582）、主のいなくなった甲斐を、北条氏直と徳川家康が争った。氏直は若御子に陣して家康と長く睨み合った。八月、御坂峠から出た北条氏忠・氏勝の別手は、黒駒で鳥居元忠らに破られた。秋に両家は和睦し、甲斐と信濃は徳川、上野は北条と決まった。',
  sides: { a: { name: '北条氏忠・氏勝の別手', mon: 'hojo', faction: 'hojo' }, b: { name: '鳥居元忠ら徳川の手', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 10000, b: 2000 },
  allyLook: HOJO, foeLook: TOKU,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1583, time: 'day', fogFar: 380, sky: { clearAir: true },   // 11/26 せ：夏の晴れ。峠から黒駒の村が見下ろせるように霧は外した
    hills: [[0, 160, 80, 28], [-100, 40, 60, 20], [100, 20, 60, 22]],
    paths: [{ pts: [[0, 190], [0, 150], [10, 100], [-6, 40], [0, -40]], w: 3 }],
    groves: [{ x: -60, z: 90, r: 30, n: 34, kind: 'sugi' }, { x: 60, z: 70, r: 30, n: 34, kind: 'sugi' }],
    trees: 600, tufts: 1600,
  },
  setup: (rt) => { kurokomaDress(rt); },
  allies: [
    { name: '北条氏忠の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 10 }, list: [busho('北条氏忠'), uS(3), uA(14)] },
    { name: '北条氏勝の手', at: { x: SPAWN.x - 14, z: SPAWN.z - 6 }, list: [busho('北条氏勝'), uS(3), uA(14)] },
    { name: '北条の鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 10 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏忠', '峠を下りれば甲府の背じゃ。徳川は若御子に釘付けよ', 3.2],
      ['組頭', '道が細い。列を乱すな', 3]] },
    { kind: 'move', at: KUROKOMA, label: '黒駒', obj: '御坂峠を下り、黒駒の村の口へ出る', r: 12, max: 120,
      say: [['組頭', '村の脇の林が静か過ぎる。物見を先に出せ', 3]],
      ambush: { t: 10, foes: [{ name: '徳川の物見', from: { x: KUROKOMA.x + 20, z: KUROKOMA.z + 20 }, list: [uS(1), uA(8)] }] } },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KUROKOMA.x + 12, z: KUROKOMA.z + -14 }, obj: '峠の道で、先に出た徳川の物見を討て', limit: 90,
      say: [['組頭', '先に出た徳川の物見じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '先に出た徳川の物見', from: { x: KUROKOMA.x + 20, z: KUROKOMA.z + -24 }, list: [uS(2), uA(10)] }],
      reward: '先に出た徳川の物見を破った' },
    { kind: 'hold', at: KUROKOMA, label: '黒駒', obj: '黒駒の村の口で、鳥居の待ち伏せを受け止める', r: 16, dur: 90, title: '待ち伏せ', sub: '林から徳川の兵が一斉に出た',
      say: [['物見', '林に三つ葉葵！　待ち伏せじゃ！', 3], ['北条氏勝', '小勢じゃ！　慌てるな！', 3]],
      waves: [
        // K652⑥ 逸話の段：黒駒では十九歳の水野勝成が鳥居の手の先駆けとなり、真っ先に北条の列へ斬り込んで首を取った（『水野勝成覚書』B・『寛政重修諸家譜』B）。本人は村の口で、その若武者と斬り結んで止める
        { t: 3, say: ['鳥居元忠', '北条は峠道に伸び切っておる。頭を叩け！'], foes: [{ name: '鳥居元忠の手', from: { x: KUROKOMA.x - 30, z: KUROKOMA.z - 30 }, list: [uS(2), uA(12)] }] },
        { t: 10, say: ['見張り', '若武者が一騎、真っ先に駆けて来る！　水野勝成じゃ！'], foes: [{ name: '水野勝成の先駆け', from: { x: KUROKOMA.x - 24, z: KUROKOMA.z - 34 }, list: [{ type: 'samurai', n: 1, o: { name: '水野勝成', horse: true } }, uS(1), uA(4)] }] },
        { t: 16, say: ['北条氏勝', 'あの若武者を止めよ！　頭を止めれば小勢じゃ！'], foes: [] },
        { t: 34, say: ['見張り', '鉄砲じゃ！　伏せよ！'], foes: [{ name: '徳川の鉄砲', from: { x: KUROKOMA.x + 30, z: KUROKOMA.z - 24 }, list: [uS(1), uG(8)] }] },
        { t: 62, foes: [{ name: '徳川の二の手', from: { x: KUROKOMA.x, z: KUROKOMA.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '徳川の組頭 三宅' } }, uS(1), uA(10)] }] }],
      reward: '黒駒で待ち伏せを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KUROKOMA.x + -16, z: KUROKOMA.z + -10 }, obj: '村の家の陰で、鉄砲を撃つ徳川の兵を討て', limit: 90,
      say: [['組頭', '鉄砲を撃つ徳川の兵じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '鉄砲を撃つ徳川の兵', from: { x: KUROKOMA.x + -24, z: KUROKOMA.z + -20 }, list: [uS(2), uA(8), uG(3)] }],
      reward: '鉄砲を撃つ徳川の兵を破った' },
    { kind: 'hold', at: SAKA, label: '御坂の坂', obj: '峠へ退く味方の殿をし、追う徳川を止める', r: 16, dur: 70, title: '殿', sub: '別手は峠へ退く',
      say: [['北条氏忠', '……峠へ退く。殿の組は追手を止めよ', 3.2]],
      waves: [
        { t: 4, say: ['徳川の侍', '追え！　北条を峠へ追い返せ！'], foes: [{ name: '徳川の追手', from: { x: SAKA.x - 6, z: SAKA.z - 44 }, list: [uS(3), uA(18)] }] },
        { t: 36, foes: [{ name: '徳川の追手の二の手', from: { x: SAKA.x + 26, z: SAKA.z - 40 }, list: [uS(2), uA(12)] }] }],
      reward: '殿で追う徳川を止めた' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '鳥居の兵が峠の口まで追って来まする！', 3],
      ['北条氏忠', '峠の口で一度押し返し、林の伏せを払え', 3]] },
    { kind: 'fight', at: { x: -40, z: 116 }, limit: 140, obj: '峠の口の杉林に伏せた徳川の兵を払う', title: '杉林', sub: '杉林から鉄砲が鳴る',
      say: [['組頭', '林の中じゃ。鉄砲を撃たせる前に寄れ！', 3]],
      foes: [{ name: '杉林の徳川の伏せ', from: { x: -54, z: 100 }, list: [{ type: 'samurai', n: 1, o: { name: '鳥居の組頭' } }, uS(3), uA(12), uG(4)] }],
      later: [{ t: 30, say: ['見張り', '東の林からも！'], foes: [{ name: '東の林の徳川', from: { x: 50, z: 84 }, list: [uS(2), uA(10)] }] }],
      reward: '杉林の伏せを払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: -26, z: 104 }, obj: '峠の坂で、追って来る徳川の足軽を払え', limit: 90,
      say: [['組頭', '追って来る徳川の足軽じゃ。槍を揃えよ', 3.2]],
      foes: [{ name: '追って来る徳川の足軽', from: { x: -18, z: 94 }, list: [uS(2), uA(10)] }],
      reward: '追って来る徳川の足軽を破った' },
    { kind: 'hold', at: { x: 4, z: 140 }, label: '御坂の峠', obj: '御坂の峠の上で、別手が峠を越え終えるまで守る', r: 16, dur: 70, title: '峠の上', sub: '若御子の本陣へ使いが走った',
      say: [['北条氏忠', '峠を越えれば甲斐の口は我らの物じゃ。ここで持て', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '峠を上る徳川', from: { x: 8, z: 104 }, list: [uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '鳥居の旗本じゃ！'], foes: [{ name: '鳥居の旗本', from: { x: -16, z: 100 }, list: [busho('鳥居の侍大将', { mustLive: false, invuln: false }), uS(2), uA(10)] }] }],
      reward: '御坂の峠を守り、別手が峠を越えた' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: 4, z: 140 }, label: '御坂の峠', obj: '日が暮れるまで峠の上に留まり、夜討ちに来る徳川の兵を払う', r: 16, dur: 60, title: '夜の峠', sub: '日が暮れる',
      say: [['組頭', '篝火を絶やすな。夜討ちが来るぞ', 3]],
      waves: [
        { t: 3, foes: [{ name: '徳川の夜討ち', from: { x: 30, z: 104 }, list: [{ type: 'samurai', n: 1, o: { name: '徳川の組頭' } }, uS(3), uA(12)] }] },
        { t: 30, say: ['見張り', '林からも来る！'], foes: [{ name: '林の徳川', from: { x: -40, z: 110 }, list: [uS(2), uA(8)] }] }],
      reward: '夜討ちを払い、峠を守った' },
  ],
  win: {
    banner: '黒駒の負け戦', sub: '別手は峠へ退いた。秋に北条と徳川は和睦した', award: '黒駒の殿を務めた',
    say: [['北条氏勝', '小勢に破られるとは……。じゃが兵は峠を越えた', 3.4],
      ['組頭', '水野の若武者め、あの年で先駆けとは……', 3],
      ['組頭', '甲斐は徳川、上野は北条。戦わずに決まるそうじゃ', 3.2]],
  },
});
export default h07_wakamiko;
