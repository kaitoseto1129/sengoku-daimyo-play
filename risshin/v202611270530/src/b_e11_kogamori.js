// 伊達家編「小手森城の戦い」（天正十三年閏八月〔1585〕・陸奥国 安達郡 小手森城）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e11_kogamori.md（K647・11/25 Sanae）
//   出所：『伊達日記』（B）・二本松市の解説（C）。大内定綱の小手森城を政宗が攻め、城兵を討ち果たした（伊達の怖さを広めた戦）。数は推（伊達約8千・城方約2千は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：山城を攻めるので勢いは高めに乗る（上限八割・追い風）。馬印が城の坂を登るほど旗が荒れる。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';
import { withCastle } from './light_castle.js';
import { palisade, kabukimon, village, nobori } from './props.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x2c2a26 };
const SPAWN = { x: 140, z: 0 };
const WIND = [-1, 0.15];
const WOUT = [-1, 0.15];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const KIDO = { x: 10, z: 10 };          // 山城の麓の木戸（K652②）
const GOAL2 = { x: -40, z: 34 };        // 城の南の麓（後詰を受ける所・K652②）
const OCHI = { x: -130, z: -10 };       // 城の裏の落ち口（K652②）
const SHIRO = { x: -78, z: 0 };         // K718/K655 11/26 クラウドさ：場に城が無く霧の野だった→丘の頂に小手森の土の山城を置く（本丸＝GOAL・二の丸の東の柵＝撃ち込みの柵）
const MACHI = { x: -36, z: -30 };       // 城の東南の裾の城外の集落（流れ⑦⑩：火が回り、戦の後に歩く焼けた家）
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
// 小手森城（二本松市針道の小手森城跡）。手本：二本松市の解説（C）・同じ頃の安達郡の土の山城の型（曲輪二つ・柵・堀切・天守石垣なし）。曲輪の広さは推。+x が伊達の寄せる側
const KOGAMORI_PLAN = {
  mon: 'ashina', name: '小手森城', type: 'yamajiro', year: 1585, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 6,
  kuruwa: [
    { id: 'ni', name: '二の曲輪', level: -4, wall: 'saku', hp: 560, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .65,
      poly: rect(14, 38, -14, 14), gapAt: [[38, 0], [38, 8], [38, -8], [26, 14], [20, 14], [32, 14], [26, -14], [14, 0], [14, 8], [14, -8]], gapW: 7 },
    { id: 'hon', name: '本丸', level: 0, wall: 'saku', hp: 900, kind: 'hon', capacity: 100, fallbackTo: null, defenseValue: 1,
      poly: rect(-12, 10, -12, 12), gapAt: [[10, 0], [10, 7], [10, -7], [-12, 10], [-12, -10], [-12, 0], [0, 12], [-6, 12], [0, -12]], gapW: 8 },
  ],
  koguchi: [{ id: 'ote', name: '木戸', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [38, 0], rot: Math.PI / 2, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 }],
  paths: [{ id: 'ote', kind: 'ote', pts: [[50, 0], [38, 0], [14, 0], [10, 0], [0, 0]] }],
  hori: [{ kind: 'karabori', pts: [[12, -11], [12, -3]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[12, 3], [12, 11]], w: 3, deep: 2.5 }],
  yagura: [{ id: 'ote', kind: 'monomi', at: [34, 10], rot: 0 }, { id: 'hon', kind: 'monomi', at: [-8, 8], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-4, -5], w: 9, d: 5, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
// 麓の木戸（KIDO）の柵と門・城外の集落（焼けて煙が上がる）・本丸の大内の幟
function scene(rt) {
  const W = rt.world;
  try { rt.scene.add(palisade(W, [KIDO.x + 4, KIDO.z - 22, KIDO.x + 4, KIDO.z - 4], { solid: false, h: 2.4 })); rt.scene.add(palisade(W, [KIDO.x + 4, KIDO.z + 4, KIDO.x + 4, KIDO.z + 22], { solid: false, h: 2.4 })); } catch (e) { /* 柵が無くても戦は続ける */ }
  try { rt.scene.add(kabukimon(W, KIDO.x + 4, KIDO.z, 5.2, -Math.PI / 2, { doors: false })); } catch (e) { /* 門が無くても戦は続ける */ }
  try { rt.scene.add(village(W, MACHI.x, MACHI.z, { n: 5, r: 13, rot: 0.4, fields: 2, smoke: 1, autumn: true, seed: 1585, groundedHomes: true })); } catch (e) { /* 村が無くても戦は続ける */ }
  try { for (const [dx, dz] of [[-6, 6], [4, 9], [6, -9]]) rt.scene.add(nobori(W, SHIRO.x + dx, SHIRO.z + dz, 'ashina', 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
}
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.8, windStep: 99 });

export const e11_kogamori = withCastle(lightBattle({
  id: 'e11_kogamori',
  date: '天正十三年（1585）閏八月　秋・晴れ　陸奥国 小手森城',
  intro: '父を失う前の秋、政宗は大内定綱を討つため、山城の小手森城へ兵を向けた。',
  history: '天正十三年（1585）閏八月、伊達政宗は大内定綱の小手森城を攻め、城兵を討ち果たした。この苛烈さが東北に伊達の名を知らしめ、周りの大名を震え上がらせた（『伊達日記』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '大内定綱の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 8000, b: 2000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1585, time: 'day', fogFar: 380, autumn: 0.8, sky: { wind: WIND, windStrength: 0.9, overcast: 0.2, mist: 0.1 },
    hills: [[-80, 0, 60, 26], [-20, -110, 50, 14], [150, 120, 50, 9]],
    groves: [{ x: 60, z: -60, r: 30, n: 28 }, { x: 40, z: 70, r: 30, n: 26 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 340, tufts: 2000,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、小手森は山城。麓の木戸を落とせば、坂は一気に登れまする', 3.4],
      ['伊達政宗', 'よい。大内に、伊達の旗を見せてやれ', 3.2],
      ['伊達の使者', '城へ申し入れる。開城なされよ。城兵の命は取らぬ', 3.4],
      ['大内の城兵', '断る！　大内の城は、伊達には渡さぬ！', 3.0],
      ['片倉景綱', '使者が追い返されました。殿、これまでにござる', 3.2]] },
    { kind: 'hold', at: FRONT, label: '小手森の麓', obj: '小手森の麓で、城から打って出る大内勢を受け止める', r: 16, dur: 60,
      title: '小手森の麓', sub: '山城の木戸から、大内勢が打って出る',
      say: [['組頭', '坂の下じゃ！　槍を揃えて受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['大内の侍', '伊達を坂から追い落とせ！'], foes: [{ name: '大内の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '大内の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '小手森の麓を持ちこたえた' },
    // K652②（11/25 Sanae・10分）：伊達は麓の木戸から攻め、山城の曲輪を一つずつ落とした（『伊達日記』B）
    { kind: 'fight', at: KIDO, limit: 120, obj: '麓の木戸を破り、坂の途中の曲輪を落とす', title: '麓の木戸', sub: '木戸の上から、大内の鉄砲が狙う',
      say: [['片倉景綱', '木戸を破れば坂が開きまする。鉄砲に気を付けよ', 3.2]],
      foes: [{ name: '木戸の大内勢', from: { x: KIDO.x - 10, z: KIDO.z - 6 }, list: [uS(3), uA(14)] }, { name: '木戸の鉄砲', from: { x: KIDO.x - 18, z: KIDO.z + 10 }, list: [uS(1), uG(5)] }],
      reward: '麓の木戸を破った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を押し出して、小手森城の本丸の大内勢を崩す', title: '小手森の城', sub: '馬印が坂を登る',
      say: [['伊達成実', '殿、追い風にござる。馬印を坂の上へ', 3.2]],
      foes: [{ name: '小手森の城兵', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('大内定綱', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '小手森の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '小手森城の大内勢を崩した' },
    // K652②：小手森の救いに、蘆名・二本松の後詰が近くまで出た（『伊達日記』B）。城の麓で受け止める
    { kind: 'hold', at: GOAL2, label: '城の南の麓', obj: '城を救いに来た蘆名・二本松の後詰を、麓で受け止める', r: 16, dur: 60, limit: 110,
      title: '後詰', sub: '城の救いに、蘆名と二本松の兵が来る',
      say: [['伊達成実', '南から後詰じゃ！　馬印を下げるな、ここで受けよ', 3.2]],
      waves: [{ t: 6, say: ['蘆名の侍', '小手森を救え！　伊達を挟め！'], foes: [{ name: '蘆名の後詰', from: { x: GOAL2.x + 10, z: GOAL2.z + 40 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '二本松の旗も来るぞ！'], foes: [{ name: '二本松の後詰', from: { x: GOAL2.x - 24, z: GOAL2.z + 36 }, list: [uS(2), uA(12), uG(3)] }] }],
      reward: '蘆名・二本松の後詰を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + 30, z: KIDO.z - 10 }, obj: '山道の坂で、石を転がす小手森の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '石の陰を登れ', 3.2]],
      foes: [{ name: '小手森の足軽', from: { x: KIDO.x + 42, z: KIDO.z - 22 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '山道の坂を登った' },
    { kind: 'hold', at: { x: KIDO.x - 20, z: KIDO.z + 20 }, label: '麓の木戸の内', obj: '麓の木戸の内で、打って出る城方を受け止める', r: 16, dur: 45, limit: 100,
      say: [['見張り', '城から打って出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '城方の兵', from: { x: KIDO.x - 8, z: KIDO.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '城方の兵', from: { x: KIDO.x - 34, z: KIDO.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '麓の木戸を守った' },
    // K652⑥（11/26 クラウドわ）見せ場：政宗は最上義光への書状に「鉄砲八千挺ばかり打たせ」と書いた（天正十三年閏八月・『伊達政宗書状』B・数は誇張とも）。
    //   伊達の鉄砲の撃ち込みの煙の下を本人が柵まで駆け、城将 石川光昌の手を崩す（城将の名は二本松市の解説 C・本人の斬り込みは推）
    { kind: 'fight', at: { x: KIDO.x - 60, z: KIDO.z + 10 }, obj: '鉄砲の撃ち込みの煙の下を柵まで駆け、城将 石川の手を崩す', max: 100, limit: 90,
      title: '八千挺の撃ち込み', sub: '伊達の鉄砲が、山城の柵へ撃ち込む',
      say: [['伊達政宗', '鉄砲を撃ち込め。煙の晴れぬ間に、柵へ駆けよ！', 3.2], ['組頭', '煙の下を走れ！　石川の旗を倒せ！', 3]],
      foes: [{ name: '城将 石川光昌の手', from: { x: KIDO.x - 48, z: KIDO.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '撃ち込みの煙の下で、石川の手を崩した' },
    { kind: 'hold', at: { x: KIDO.x - 100, z: KIDO.z + 0 }, label: '本丸の下で、', obj: '本丸の下で、最後に打って出る城兵を受け止める', r: 16, dur: 45, limit: 100,
      say: [['見張り', '最後の打って出じゃ！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '城兵の最後の寄せ', from: { x: KIDO.x - 88, z: KIDO.z - 12 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '城兵の最後の寄せ', from: { x: KIDO.x - 114, z: KIDO.z + 14 }, list: [uS(2), uA(7)] }] }],
      reward: '本丸の下を守った' },
    { kind: 'fight', at: OCHI, limit: 110, obj: '城の裏の落ち口へ、残った城兵を追う', title: '落ち口', sub: '城の裏から、大内の残りが落ちて行く',
      say: [['足軽', '城に火が回った！　裏口も火じゃ、城兵は退く道を失うぞ……', 3.2], ['伊達政宗', '一人も残すなとは言わぬ。じゃが、刃向かう者は追え', 3.2]],
      foes: [{ name: '大内の残り', from: { x: OCHI.x + 8, z: OCHI.z + 6 }, list: [uS(3), uA(12)] }],
      reward: '城の裏の落ち口まで大内の残りを追った' },
    // K718（11/26）流れ⑦⑧⑩・見せ場：火が回り、退路を失った城の跡。歓声でなく、焼けた家・負傷者・倒れた兵・泣く住民を見て歩く（虐殺を気持ちいい演出にしない）
    { kind: 'move', at: { x: MACHI.x - 2, z: MACHI.z + 8 }, label: '焼けた城下', obj: '戦が終わった城の跡を、静かに歩く', r: 12, max: 50,   // 90→50：最後の歩きが戦の上限 1080秒を越えて任務失敗になった（城なしでも 1078秒でぎりぎり・act bot 11/26 クラウドし）
      say: [['伊達の足軽', '火が回って、逃げ道が無かったそうな……', 3.2], ['城下の女', '（焼けた家の前で、子を抱いて泣いている）', 3.4], ['手負いの兵', '水を……誰か、水を……', 3], ['片倉景綱', '殿、この戦は勝ちにござる。ですが、見ておくべきものがござる', 3.4]] },
  ],
  setup: scene,
  update: umaTick,
  win: {
    banner: '小手森城、落ちる', sub: '城は静まった。焼けた家と倒れた者の上に、伊達の旗が立つ。この戦の噂は、東北に恐れとなって広まる', award: '小手森城で馬印を押し出して戦った',
    say: [['片倉景綱', '城は落ちました。ですが、誰も喜んではおりませぬ', 3.2],
      ['伊達政宗', '怖れられるのも、天下を取る道じゃ……そう思わねば、見ておれぬ', 3.4]],
  },
}), { plan: KOGAMORI_PLAN, at: SHIRO, lift: 0, team: 1, life: false });
e11_kogamori.camPull = 1.6;
export default e11_kogamori;
