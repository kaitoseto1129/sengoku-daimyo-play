// 島津家編 八戦目「関ヶ原の退き口」（慶長五年〔1600〕九月十五日 未の刻・美濃国 関ヶ原）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ④⑤ s08）
//   史実：西軍が崩れた後、島津義弘の手（約千五百・通説。退いた時は数百とも）は西へ逃げず、東軍の正面を突き破って家康の本陣の前を駆け抜け、
//   伊勢街道（牧田道）を南へ退いた。追う井伊直政・松平忠吉・本多忠勝の手を、道に座って鉄砲を撃ち、残って死ぬまで止める殿（捨て奸）が止めた。
//   島津豊久は烏頭坂のあたりで、長寿院盛淳は義弘の身代わりとなって討ち死に。井伊直政は柏木源藤の鉄砲で傷を負い、追撃は止んだ
//   （『惟新公御自記』B・『島津家文書』A。「捨て奸」の呼び名は後世とも・兵数は諸説）。
//   作り直さず徳川編 k06（b_k06_sekigahara.js）の地形（国土地理院の標高 dem_sekigahara・藤古川・中山道と伊勢街道）と島津の退き道（SHIMA_PATH・捨て奸の一の手と二の手）を使い回す。
//   主人公は捨て奸の側：座って撃ち、殿として残る。勝ち負けでなく生き延びるのが目標（K509）。字・札・ボタンは足さない。本物の兵は250人まで。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';
import { sekiField, SEKI_WORLD, SEKI_TIMESLIP, SEKI_AT } from './b_k06_sekigahara.js';   // K651：徳川編の関ヶ原の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前は k06 の標高・川・道を手で写した軽い地形だった。
//   今は徳川編 k06 の world（標高・藤古川・中山道と伊勢街道・田・林・秋の色・日の移り）と各家の本陣の幕・陣・幟を sekiField で建てる。
//   場所と退き道・捨て奸の所は SEKI_AT（k06 の座標）から取る（手で数を写さない）。逸話の段は捨て奸（K652⑥・下の update）
// ---- 場所（k06 の座標のまま）。島津の陣（小池村の奥の林の陰）→ 東軍の正面（福島の脇）→ 陣場野の本陣の前 → 伊勢街道の捨て奸の一の手・二の手 ----
const AT = SEKI_AT;
const SPAWN = { x: AT.shimazu.x + 20, z: AT.shimazu.z + 8 };   // 島津の陣（小池村の奥の林の陰）の前
const BREAK = { x: -214, z: -50 };                 // 東軍の正面（福島隊の北の脇）を突き破る所
const RUN = { x: -82, z: 6 };                      // 家康の本陣の前を駆け抜け、伊勢街道の口へ
const SUTE1 = AT.sute1, SUTE2 = AT.sute2;              // 捨て奸の一の手・二の手（k06 と同じ所）
const SHIMA_PATH = AT.shimaPath;                       // 島津の退き道（k06 と同じ）
const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const II = { flag: 'ii', armor: 0x8e1f16 };        // 追う東軍は井伊の赤備えを先に（松平忠吉・本多の手も同じ赤の旗の下で追った）
const FACE_N = Math.PI;                            // 北（追ってくる東軍）へ向く

const red = (n) => ({ type: 'cavalry', n });
const sute = (name, at, extra = []) => ({ name, at, face: FACE_N, fixed: true, dmg: 0.55, list: [...extra, uG(6), uS(1)] });

export const s08_sekigahara = lightBattle({
  id: 's08_sekigahara',
  date: '慶長五年（1600）九月十五日　未の刻　美濃国 関ヶ原',
  intro: '西軍は崩れた。島津義弘の手は、逃げずに東軍の正面を突き破って退く。あなたは殿に残る一人。',
  history: '慶長五年（1600）九月十五日、関ヶ原で西軍が崩れた後、島津義弘の手（約千五百・通説）は西へ逃げず、東軍の正面を突き破って家康の本陣の前を駆け抜け、伊勢街道を南へ退いた。追う井伊直政・松平忠吉・本多忠勝の手を、道に座って鉄砲を撃ち、残って死ぬまで止める殿の者が止めた（のちに「捨て奸」と呼ばれる。呼び名は後世とも）。島津豊久・長寿院盛淳は討ち死にし、井伊直政は鉄砲で傷を負って追撃は止んだ。義弘は数十人で薩摩へ帰り着いた（兵の数は諸説ある）。',
  sides: { a: { name: '島津義弘の手', mon: 'shimazu', faction: 'shimazu' }, b: { name: '追う東軍', mon: 'ii', faction: 'tokugawa' } },
  force: { a: 1500, b: 3500 },
  allyLook: SHIMAZU, foeLook: II,
  allyDmg: 0.4,
  foeDmg: 0.55,
  friendsSend: 1,
  minutes: 7,
  noMarch: true,   // 退き口は陣から始まる（共通の行軍の入りは使わない）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI / 2 },
  world: { seed: 1600, time: 'day', fogFar: 300 },
  allies: [
    { name: '島津豊久の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, list: [busho('島津豊久'), uS(3), uA(8)] },
    sute('捨て奸 一の手', SUTE1),
    sute('捨て奸 二の手', SUTE2, [busho('長寿院盛淳', { horse: false })]),
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津義弘', '小早川が寝返り、西軍は崩れた。じゃが、島津は背を見せて逃げぬ', 3.6],
      ['島津義弘', '敵の正面を突き破り、伊勢へ抜ける。進め！', 3.2],
      ['島津豊久', '伯父上は先へ。殿はわしらが務めまする', 3.2]] },
    { kind: 'fight', at: BREAK, obj: '東軍の正面を突き破る', title: '退き口', sub: '敵中を突き破る', max: 80, limit: 90,
      say: [['島津豊久', 'かかれ！　前へ、前へ抜けよ！', 2.8], ['福島の侍', '島津が向かってくるぞ！　逃げるのではないのか！', 3.2]],
      foes: [{ name: '東軍の先手', from: { x: BREAK.x + 8, z: BREAK.z + 6 }, list: [uS(3), uA(14)] }],
      later: [{ t: 25, say: ['東軍の侍', '横から当たれ！　島津を囲め！'], foes: [{ name: '東軍の二の手', from: { x: BREAK.x + 14, z: BREAK.z - 10 }, list: [uS(2), uA(7)] }] }],
      reward: '東軍の正面を突き破った' },
    { kind: 'move', at: RUN, label: '伊勢街道', obj: '家康の本陣の前を駆け抜け、伊勢街道へ', r: 14, max: 90,
      say: [['島津豊久', '止まるな！　家康の本陣の前を駆け抜けよ！', 3], ['組頭', '振り向くな。南の道へ走れ', 2.8]] },
    { kind: 'hold', at: SUTE1, label: '捨て奸', obj: '道に座って撃ち、赤備えの追手を止める', r: 16, dur: 70, title: '捨て奸', sub: '座って撃ち、残る',
      say: [['組頭', 'ここに座れ。火縄を構えよ。わしらが残って、殿を逃がす', 3.6], ['井伊の侍', '島津を逃がすな！　赤備え、かかれ！', 3]],
      waves: [{ t: 4, foes: [{ name: '井伊の赤備え', from: { x: SUTE1.x - 10, z: SUTE1.z - 52 }, list: [uS(2), red(4), uA(8)] }] },
        { t: 34, say: ['松平の侍', '下野守様に続け！　島津を討て！'], foes: [{ name: '松平忠吉の手', from: { x: SUTE1.x + 14, z: SUTE1.z - 50 }, list: [uS(3), uA(10)] }] }],
      reward: '一の手で赤備えを止めた' },
    { kind: 'move', at: { x: SUTE2.x, z: SUTE2.z - 6 }, label: '二の手', obj: '二の手の所まで退く', r: 12, max: 70,
      say: [['組頭', '豊久様が烏頭坂で討たれた……。走れ、二の手まで退け', 3.4]] },
    { kind: 'hold', at: SUTE2, label: '捨て奸', obj: '最後の殿として、井伊の追撃を止める', r: 16, dur: 75, title: '殿', sub: '殿様が伊勢へ抜けるまで',
      say: [['長寿院盛淳', 'わしが兵庫頭じゃ！　ここで討ち取れるものなら討ってみよ', 3.6], ['井伊直政', '島津兵庫を逃がすな！　わしが自ら討つ！', 3.2]],
      waves: [{ t: 4, foes: [{ name: '井伊直政の旗本', from: { x: SUTE2.x - 6, z: SUTE2.z - 56 }, list: [busho('井伊直政'), uS(3), red(4), uA(6)] }] },
        { t: 36, say: ['本多の侍', '本多の手も続け！　坂を押し上げよ！'], foes: [{ name: '本多忠勝の手', from: { x: SUTE2.x + 16, z: SUTE2.z - 50 }, list: [uS(2), red(3), uA(8)] }] }],
      reward: '殿として最後まで残った' },
  ],
  win: {
    banner: '退き口', sub: '殿として残り、生き延びた', award: '関ヶ原の退き口で殿を務めて生き延びた',
    say: [['組頭', '柏木源藤の鉄砲が、井伊直政を撃ち落とした！', 3.2],
      ['井伊の侍', '殿が撃たれた！　引け、追うのはやめじゃ！', 3],
      ['組頭', '義弘様は伊勢へ抜けられた。生きて薩摩へ帰るぞ', 3.4]],
  },
  setup(rt) {
    // 先に南へ走る島津義弘の本隊（退き道 SHIMA_PATH の上を、本人より先に伊勢街道へ）。殿の者が止めている間に見えなくなる
    const F = rt.flags;
    F.s8Main = allyGroup(rt, { name: '島津義弘の本隊', flag: SHIMAZU.flag, anchor: { x: SPAWN.x + 22, z: SPAWN.z + 4 }, facing: Math.PI / 2, fullStrength: true, noRout: true, aggro: 0, seekRange: 0, morale: 100, dmgMult: 0.4, order: 'hold' },
      dress([busho('島津義弘'), uS(4), uA(6)], SHIMAZU));
    F.s8I = 0;
  },
  update(rt, dt) {
    const F = rt.flags, A = rt.army;
    // 捨て奸：座ったまま（しゃがみ）、北から来る追手へ六秒ごとに斉射。段に着くまでは撃たない
    if (!F.s8Sat && F.allies?.length) {
      F.s8Sat = true;
      for (const g of F.allies.slice(1)) if (g) for (const u of g.units) u._crouch = true;
    }
    if ((F._s8T = (F._s8T || 0) - dt) <= 0 && !F.ending) {
      F._s8T = 6;
      const line = F.step >= 2 && F.step < 4 ? F.allies?.[1] : F.step >= 4 ? F.allies?.[2] : null;
      if (line && line.count) {
        const foes = A.groups.filter((g) => g.team !== line.team && !g.routed && g.count);
        if (foes.length) { try { A.scriptSalvo(line, foes, 6, 70); } catch (e) { /* なし */ } }
        for (const u of line.units) if (u.alive) u._crouch = true;   // 撃った後も座り直す（立って逃げない）
      }
      // 本人が座ってい（持ち場の内で止まってい）る時は、本人の組も座る
      const P = rt.player?.u, sq = rt.player?.squad;
      if (P && sq?.units) { const sit = (F.step === 3 || F.step === 5) && Math.hypot(P.vel?.x || 0, P.vel?.z || 0) < 0.3;
        for (const u of sq.units) if (u.alive && u.type === 'gun') u._crouch = sit; }
    }
    // 義弘の本隊：道の上を一つずつ南へ。最後の所に着いたら外す（遠くへ去った兵は数えない）
    const M = F.s8Main;
    if (M && M.count && !F.s8Gone && F.step >= 1) {
      const q = SHIMA_PATH[Math.min(F.s8I, SHIMA_PATH.length - 1)], c = M.center();
      M.order = 'move'; M.dest = { ...q }; M.anchor = { ...q }; M.speed = Math.max(M.speed || 0, 3.2);
      if (c && Math.hypot(c.x - q.x, c.z - q.z) < 10) {
        if (F.s8I >= SHIMA_PATH.length - 1) { F.s8Gone = true; for (const u of M.units) { try { A.despawn(u); } catch (e) { /* なし */ } } }
        else F.s8I++;
      }
    }
    // 勝ちの締め：柏木源藤の一発で井伊直政が落ち、追手が北へ引く
    if (F.ending && !F.s8Back && F.step >= 5) {
      F.s8Back = true;
      sfx('volley', 0.9);
      for (const g of A.groups) if (g.team !== rt.player.u.team && g.count) { g.order = 'retreat'; g.noRout = false; g.dest = { x: g.center().x, z: -220 }; }
    }
  },
});
// K651：徳川編の関ヶ原の地面・川・道・田・林をそのまま使う（getter も写すため descriptor ごと）
s08_sekigahara.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(SEKI_WORLD));
s08_sekigahara.world.mood = 'afternoon';   // 未の刻の退き口（徳川編は朝霧から始まる）
s08_sekigahara.timeslip = SEKI_TIMESLIP;
// 戦場を建てる（徳川編の関ヶ原と同じ所）→ 軽い型の setup（島津の組・段）
{ const s0 = s08_sekigahara.setup; s08_sekigahara.setup = function* (rt) { yield* sekiField(rt); s0.call(this, rt); }; }
export default s08_sekigahara;
