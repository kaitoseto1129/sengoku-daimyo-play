// 長宗我部家編 十一「戸次川の戦い」（天正十四年〔1586〕十二月・豊後国 戸次川）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   既存の t06_hetsugi（豊臣の側）・s05_hetsugi（島津の側）の、長宗我部の足軽の側（作り直しでなく、この家の足軽の目で写した軽い型）。
//   史実：軍監の仙石秀久は元親の止めるのを聞かず戸次川を渡った。島津家久は退くと見せて伏兵で挟み（釣り野伏せ）、豊臣の四国勢は崩れた。
//   長宗我部信親は中津留の河原で七百ほどの兵と踏みとどまって討ち死にした（『長元記』B・『元親記』B・docs/kaito_hetsugi_common_1120.md）。
//   K401：信親の討ち死にを戦の真ん中に置く（見出しと声。字の札は足さない）。勝ちは、河原で踏みとどまって元親を退かせる事
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';
import { hetsugiField, HETSUGI_WORLD, HETSUGI_TIMESLIP, HETSUGI_AT } from './b_t06_hetsugi.js';   // K651：豊臣編の戸次川の戦場をそのまま使う（素材は写さない）
import { naginata } from './humans.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

// 11/25 K651（kaito「長宗我部の戸次川…既存のやつの立場を入れ替えるだけでできるやつはそうしよう」）：
//   前の別の戦場（手書きの丘と細い川）をやめ、豊臣編 t06 の戸次川（大野川・鶴賀城・中津留の河原・左右の林・鏡城）を hetsugiField で建てる。
//   遊ぶ側は長宗我部信親の手の一領具足。行き先は戸次川の戦場の物差し（HETSUGI_AT）で置く（+z が渡る前の岸・−z が中津留の河原）。
// K652⑥（その戦の逸話を本人がやる段）：中津留の河原で信親が大長刀を振るって踏みとどまった最期（『元親記』）を、本人が信親の横で斬り結ぶ。
//   段が尽きると信親が討たれる（字やボタンは足さない。名札と命の棒・声だけ）
const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const AT = HETSUGI_AT, FX = AT.ford.x, RZ = AT.riverZ(FX);
const SPAWN = { x: FX - 6, z: RZ + 40 };               // 渡る前の岸（浅瀬の正面の土手。x−10 では浅瀬の外の深みを渡り、act bot で囲まれて倒れた）
const FORD = { x: FX + 4, z: RZ - 26 };                // 戸次川の向こう岸（鶴賀城の岸の河原）
const LURED = { x: AT.ring.x, z: AT.ring.z + 34 };     // 退く島津を追って入る林の間（中津留の河原の手前）
const NOBU = { x: AT.ring.x - 6, z: AT.ring.z + 18 };  // 中津留の河原（信親の踏みとどまる所）
const BACK = { x: FX - 46, z: RZ + 46 };               // 浅瀬を戻った西の岸（元親の退く道）
const WL = { x: AT.woods[0].x + 24, z: AT.woods[0].z - 2 }, WR = { x: AT.woods[1].x - 24, z: AT.woods[1].z + 2 };   // 林の縁（新納・豊久の伏せ）

export const c07_hetsugi = chosoBattle({
  id: 'c07_hetsugi',
  date: '天正十四年（1586）十二月　夕　豊後国 戸次川',
  intro: '島津を討つため、四国の衆が豊後へ渡った。軍監の仙石秀久は、元親様の止めるのも聞かず、川を渡ると言う。',
  history: '天正十四年（1586）十二月、豊臣方の四国の衆は豊後の戸次川で島津家久と戦った。軍監の仙石秀久は元親の止めるのを聞かずに川を渡り、島津の伏兵に挟まれて崩れた。元親の嫡男 信親は中津留の河原で踏みとどまり、二十二歳で討ち死にした。元親は伊予へ逃れ、この後は人が変わったように気を落としたと伝わる（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '島津の軍', mon: 'shimazu', faction: 'shimazu' } },
  force: { a: 6000, b: 12000, la: 0.45, lb: 0.15 },   // K652①：討ち取りに合わせて少しずつ。四国の衆は大きく崩れ、島津の損は少ない（t06 の史実の数）
  foeLook: SHIMAZU,
  foeDmg: 0.45,   // 11/25 K651：豊臣編の戦場（深い大野川・広い河原）で act bot が二度倒れた（足軽の一太刀22）→0.7→0.45
  playerTaken: 0.4,   // 11/25 K651：act bot 241秒で中津留の河原の段に倒れた（島津の新手から足軽の傷213）→本人の受ける傷を 0.6→0.4（d11 と同じ手）
  thick: true,   // 11/25 act bot 討ち取り3（5分）＝受けの段に三の手・激突の段に新手
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },   // 川（−z）を向く
  world: { seed: 1586, time: 'dusk', winter: true },     // 下で豊臣編の戸次川の world に置き換える（K651）
  allies: [
    { name: '長宗我部信親の手', at: { x: SPAWN.x - 6, z: SPAWN.z - 4 }, list: [busho('長宗我部信親', { mustLive: false }), uS(4), uA(10)] },
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 12, z: SPAWN.z + 10 }, list: [busho('長宗我部元親'), uS(3), uA(6)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 6, z: SPAWN.z - 6 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['仙石秀久', '島津は川向こうで縮こまっておる。渡って討て！', 3.2],
      ['長宗我部元親', '待たれよ。島津は退くと見せて挟むぞ', 3],
      ['長宗我部信親', '父上……軍監の下知では是非もない。渡りまする', 3.2]] },
    { kind: 'fight', at: FORD, obj: '戸次川を渡り、島津の先手を突く', title: '戸次川', sub: '島津の先手が川向こうに', max: 110,
      say: [['組頭', '渡れ！　冷たいぞ、足を取られるな！', 3], ['島津の侍', '引け、引けい！', 2.6]],
      foes: [{ name: '島津の先手', from: { x: AT.ijuin.x - 8, z: AT.ijuin.z + 22 }, list: [uS(2), uA(12)] }],
      reward: '戸次川を渡った' },
    { kind: 'fight', at: LURED, obj: '左右から出た島津の伏兵を払う', title: '釣り野伏せ', sub: '退いた島津が左右から挟む', max: 120,
      say: [['島津家久', '今じゃ！　挟め！', 2.8], ['組頭', '伏兵じゃ！　左右から来る！', 3]],
      foes: [{ name: '島津の伏兵', from: WL, list: [uS(2), uA(10)] }, { name: '島津の伏兵の二', from: WR, list: [uS(2), uA(8), uG(2)] }],
      reward: '伏兵を払った' },
    { kind: 'hold', at: NOBU, label: '中津留の河原', obj: '信親様の横で踏みとどまり、島津の新手を斬る', r: 16, dur: 70, title: '中津留の河原', sub: '信親様が大長刀を振るう',
      say: [['長宗我部信親', '父上を頼む。ここは信親が引き受けた！', 3]],
      waves: [{ t: 0, say: ['島津の侍', '首を取れ！'], foes: [{ name: '島津の新手', from: { x: NOBU.x + 8, z: NOBU.z - 34 }, list: [uS(2), uA(12)] }] },
        { t: 32, say: ['島津の侍', '一人も渡すな！'], foes: [{ name: '島津の新手の二', from: { x: WL.x + 10, z: WL.z + 6 }, list: [uS(2), uA(10)] }] }],
      reward: '中津留の河原で踏みとどまった' },
    { kind: 'rest', dur: 10, heal: 0.25, banner: ['長宗我部信親 討死', '中津留の河原'], say: [
      ['組頭', '若殿が……信親様が、討たれた……！', 3.2],
      ['長宗我部元親', '信親……！　信親はどこじゃ！', 3]] },
    { kind: 'move', at: BACK, label: '退く道', obj: '川を戻り、元親の退く道まで下がる', r: 10, max: 90,
      say: [['組頭', '殿を逃がせ！　退け！', 2.8]] },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '信親様が……。殿だけは、土佐へお返しせよ', 3.2]]),
    holdS({ x: -30, z: 40 }, '西の岸の土手', '西の岸の土手で、川を渡って追う島津を受ける', '追う島津', '島津が川を渡って追う', [['組頭', '土手で止めよ！　殿が退く間じゃ！', 3]],
      [wave(0, '島津の侍', '四国の衆を一人も帰すな！', [foe('島津の追手', 20, -20, [uS(2), uA(12)])]), wave(30, '島津の侍', '下の瀬からも渡れ！', [foe('島津の追手の二', -60, -10, [uS(2), uA(10)])])], { reward: '土手で島津を止めた' }),
    fightS({ x: -90, z: 60 }, '鏡城への道に回った島津の伏せを払う', '道の伏せ', '退く道に島津が伏せる', [['組頭', '道に伏せがおる！　斬り抜けよ！', 3]],
      [foe('道の島津の伏せ', -100, 44, [uS(2), uA(12)])], { later: [wave(28, '島津の侍', '弓、道を射よ！', [foe('道の島津の弓', -80, 30, [uS(1), uB(6)])])], reward: '道の伏せを払った' }),
    fightS({ x: -128, z: 72 }, '鏡城の下で、追い付いた島津の騎馬を崩す', '島津の騎馬', '馬で追う島津の手', [['組頭', '馬じゃ！　槍を揃えよ！', 3]],
      [foe('島津の騎馬の手', -120, 52, [boss('島津の侍大将'), uS(2), uA(10)])], { later: [wave(28, '島津の侍', '囲め！', [foe('島津の騎馬の二', -150, 50, [uS(2), uA(8)])])], reward: '島津の騎馬を崩した' }),
    holdS({ x: -160, z: 82 }, '鏡城の下の陣', '陣の前で、元親様が伊予へ退くまで殿をする', '殿', '元親を伊予へ退かせる', [['長宗我部元親', '……信親を置いて退くのか。すまぬ', 3.2]],
      [wave(0, '島津の侍', '元親を逃がすな！', [foe('島津の最後の追手', -120, 40, [uS(2), uA(12)])]), wave(30, '島津の侍', '陣を焼け！', [foe('島津の追手の三', -170, 40, [uS(2), uA(10)])])], { reward: '元親様を戸次川から退かせた' }),
  ],
  // 信親の最期（K652⑥）：河原の段の間は信親の手を河原に据えて大長刀で斬り結ばせ、段が尽きた所で討たれる（t06 の closeRing と同じ討ち方）
  update(rt) {
    const F = rt.flags;
    if (!F.c7Nobu) {
      const g = (F.allies || []).find((a) => a?.name === '長宗我部信親の手'), u = g?.units.find((x) => x.name === '長宗我部信親');
      if (!u) return;
      F.c7Nobu = { g, u }; naginata(u); u.showHp = true;   // 信親は大長刀で八人を斬ったと『元親記』
    }
    const { g, u } = F.c7Nobu;
    if (F.step === 2 && g.count) { g.anchor = { x: NOBU.x - 3, z: NOBU.z - 4 }; g.order = 'hold'; g.aggro = 16; g.seekRange = 18; }
    if (F.step >= 3 && !F.c7Fell && u.alive) {
      F.c7Fell = true;
      u.invuln = false; u.mustLive = false; u.officerSaved = true;
      const by = rt.army.units.find((x) => x.alive && x.team === 1 && Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z) < 12) || null;
      rt.army.kill(u, by);
    }
  },
  win: {
    banner: '元親を退かせた', sub: '四国の衆が伊予へ逃れる', award: '戸次川で元親の退き口を守った',
    say: [['長宗我部元親', '……信親を、置いてきてしもうた', 3.2],
      ['組頭', '若殿は七百と共に、最後まで槍を振るわれた', 3.2],
      ['組頭', '土佐へ帰ろう。若殿の分まで、田を守るんじゃ', 3]],
  },
});
// K651：豊臣編の戸次川の地面・大野川・浅瀬・林・道をそのまま使う（getter も写すため descriptor ごと）
c07_hetsugi.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(HETSUGI_WORLD));
c07_hetsugi.timeslip = HETSUGI_TIMESLIP;
c07_hetsugi.mapNorth = Math.PI * 1.5;   // 実の北はゲームの −x（豊臣編と同じ）
// 戦場を建てる（豊臣編の戸次川と同じ所）→ 軽い型の setup（長宗我部の組・段）
{ const s0 = c07_hetsugi.setup; c07_hetsugi.setup = function* (rt) { yield* hetsugiField(rt); s0.call(this, rt); }; }
export default c07_hetsugi;
