// 長宗我部家編 一戦目「中富川の戦い」（天正十年〔1582〕八月・阿波国 中富川）。軽い型（light_battle.js）・H3（docs/house_chosokabe.md ①②④⑤）
//   史実：長宗我部元親は約二万（通説・諸説）で阿波へ入り、中富川を挟んで十河存保ら三好方約五千（同）と戦って破り、存保は勝瑞城へ退いた。
//   兵の多くは一領具足＝一領の具足と一本の槍を田の傍に置き、合図で出陣した土佐の半農半兵（『土佐物語』B・『長元記』B・徳島県・南国市の解説 C）。
// 仕組み「一領具足の呼び集め」（字は足さない・新しい札とボタンは足さない。動きと旗と音で見せる）：
//   ①戦の前、川の南の田の畦に、しゃがんだ農兵の影が点々といる（bhelp.js の ambush＝しゃがみの作りをそのまま使う）
//   ②主人公が法螺の台（行き先のピン）へ着くと法螺が鳴り、影が立って槍の兵になり、元親の備へ走り寄る（味方の備が太る）
//   ③遅れると、遠い畦の影から先に帰ってしまう（呼べる数が減る。戦は続く・負けではない）
//   その後、川を渡って三好の先手を破り、岸を守り、十河存保の備を崩して勝ち。本物の兵は味方・敵を合わせて二百人ほどまで
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';
import { flagTexture } from './textures.js';
import { flankTick } from './chosokabe_kit.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

const CHOSO = { flag: 'chosokabe', armor: 0x2a2622 };
const MIYOSHI = { flag: 'miyoshi', armor: 0x3a3226 };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: -22, z: -58 };     // ② 法螺の台（田の中の小さな塚）
const FORD = { x: 0, z: 34 };        // ③ 中富川の浅瀬の向こう岸（三好の先手）
const BANK = { x: 2, z: 46 };        // ④ 北の岸を守る
const SOGO = { x: 6, z: 104 };       // ⑤ 十河存保の備（勝瑞の城へ退く道）
const RIVER = [[-220, 22], [-100, 16], [0, 22], [100, 18], [220, 24]];   // 中富川（東へ流れる）
// 田の畦に伏せた一領具足（四つ。遠い順に帰る）
const FIELDS = [
  { at: { x: -60, z: -40 }, far: 0 }, { at: { x: 44, z: -54 }, far: 1 },
  { at: { x: -48, z: -92 }, far: 2 }, { at: { x: 62, z: -96 }, far: 3 }];
const LATE = 26;      // 法螺の台に着くまでの秒がこれを過ぎると、遠い畦から一つずつ帰る
const LATE_STEP = 12;
const ICHIRYO = (n) => ({ type: 'ashigaru', n, o: { hat: 'hachimaki' } });   // 一領具足の野の姿：鉢巻に槍

// ② 呼び集め：法螺の台に着いた時。間に合った影を立たせ、元親の備の横へ走らせて味方に入れる
function callUp(rt) {
  const F = rt.flags;
  if (F.ckCalled) return;
  F.ckCalled = true;
  const late = Math.max(0, (F.ckT || 0) - LATE);
  const gone = Math.min(FIELDS.length - 1, Math.ceil(late / LATE_STEP));   // 一つは必ず残る
  let n = 0;
  (F.ckShadow || []).forEach((g, i) => {
    if (!g || !g.count) return;
    if (FIELDS[i].far >= FIELDS.length - gone) { for (const u of g.units) u._crouch = true; return; }   // 遅れた：その畦は田に戻った（しゃがんだまま）
    n++;
    rt.after(0.4 + i * 0.5, () => {
      g.ambush = false; for (const u of g.units) { u._crouch = false; u.perch = null; }
      g.noAI = false; g.fixed = false; g.order = 'hold'; g.aggro = 14; g.seekRange = 40; g.speed = Math.max(g.speed || 0, 3.4);
      g.anchor = { x: SPAWN.x + (i % 2 ? 10 : -10) + (i > 1 ? (i % 2 ? 8 : -8) : 0), z: SPAWN.z + 10 };
      F.allies.push(g);
    });
  });
  F.ckCalledN = n;
  sfx('hora', 1); rt.after(1.2, () => sfx('hora', 0.8)); rt.after(2.4, () => sfx('toki', 0.9));
  rt.say('長宗我部元親', n >= 3 ? '集まったな。鍬を置いて槍を取れ！' : '……遅い。集まった者だけで行く', 3);
}

// K720 二回目（見せ場）：広い平野に長宗我部の大軍が横一列に広がる（遠景の軽い大軍・本物の兵は増やさない）＋第5段で左右の畦から展開する組が立つ
const FLANKS = { flanks: [
  { during: 5, at: { x: -80, z: -30 }, to: { x: SOGO.x - 40, z: SOGO.z + 6 }, n: 9, name: '左へ展開する一領具足', delay: 2, say: ['長宗我部信親', '左へ広がれ！　横一列で押せ！'] },
  { during: 5, at: { x: 80, z: -30 }, to: { x: SOGO.x + 40, z: SOGO.z + 6 }, n: 9, name: '右へ展開する一領具足', delay: 3.5 }] };
function lineAbreast(rt) {
  const W = rt.world; if (!W?.addDistantArmy) return;
  try { W.addDistantArmy({ x: 0, z: -58, w: 240, d: 10, count: 380, facing: 0, armor: 0x2a2622, flagTex: flagTexture('chosokabe'), flag: 'chosokabe', team: 0, seed: 1582 }); } catch (e) { /* 遠景が無くても戦は続ける */ }
}
export const c04_nakatomi = lightBattle({
  id: 'c04_nakatomi',
  date: '天正十年（1582）八月　朝　阿波国 中富川',
  intro: '元親様が阿波へ攻め入る。中富川の向こうに十河存保の三好勢。田の畦には、槍を置いた一領具足が合図を待っている。',
  history: '天正十年（1582）八月、長宗我部元親は約二万（通説・諸説）の兵で阿波に入り、中富川を挟んで十河存保ら三好方約五千と戦って破った。存保は勝瑞城へ退き、やがて讃岐へ逃れた。長宗我部の兵の多くは「一領具足」と呼ばれ、普段は田を耕し、一領の具足と一本の槍を田の傍に置いて、合図で出陣したと伝わる（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '三好の軍', mon: 'miyoshi', faction: 'miyoshi' } },
  force: { a: 20000, b: 5000 },
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: CHOSO, foeLook: MIYOSHI,
  allyDmg: 0.35,
  friendsSend: 3,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1582, time: 'day', fogFar: 460, autumn: true,
    river: RIVER, riverW: 12, riverDepth: 0.5,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 90, 70, 16], [170, 120, 70, 18], [0, 240, 110, 26], [-150, -150, 80, 22], [150, -150, 80, 20]],
    paths: [{ pts: [[0, -140], [0, -40], [0, 0], [0, 34], [4, 104], [0, 170]], w: 3 }],
    // 川の南は一領具足の田（畦に囲まれた一段低い面）。道・川・法螺の台は空ける
    paddy: (x, z) => (z < -10 && z > -130 && Math.abs(x) > 6 && Math.abs(x) < 120 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && ((Math.abs(x) % 24) > 1.4) && ((Math.abs(z) % 22) > 1.4) ? 1 : 0),
    groves: [{ x: -170, z: 90, r: 30, n: 26 }, { x: 170, z: 120, r: 30, n: 26 }, { x: -150, z: -150, r: 34, n: 24 }],
    trees: 360, tufts: 1800,
  },
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '長宗我部信親の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('長宗我部信親'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '川の向こうに十河の兵。阿波を取るのは今じゃ', 3.2],
      ['組頭', '畦の者らは、法螺が鳴れば鍬を捨てて来る。台へ走って、吹け', 3.6],
      ['長宗我部信親', '遅れれば、田へ帰る者も出る。急げ', 3]] },
    { kind: 'move', at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　台に上がって吹け！', 3]] },
    { kind: 'fight', at: FORD, obj: '中富川を渡り、三好の先手を破る', title: '中富川', sub: '浅瀬の向こうに三好の先手',
      say: [['長宗我部元親', '川を渡れ！　一領具足、前へ！', 3], ['三好の侍', '土佐の田舎武者じゃ！　川で討ち取れ！', 3.2]],
      foes: [{ name: '三好の先手', from: { x: FORD.x - 4, z: FORD.z + 14 }, list: [uS(2), uA(12), uG(2)] }],
      later: [{ t: 28, say: ['三好の侍', '鉄砲、岸から撃て！'], foes: [{ name: '三好の鉄砲', from: { x: FORD.x + 16, z: FORD.z + 18 }, list: [uS(1), uG(6)] }] }],
      max: 120, reward: '中富川を渡った' },
    { kind: 'fight', at: { x: FORD.x - 30, z: FORD.z + 10 }, obj: '河原で、杭の陰から撃つ三好の鉄砲を崩す', max: 100, limit: 90,
      say: [['長宗我部元親', '鉄砲の陰へ寄れ', 3.2]],
      foes: [{ name: '三好の鉄砲', from: { x: FORD.x - 18, z: FORD.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '浅瀬の鉄砲を崩した' },
    { kind: 'hold', at: BANK, label: '北の岸', obj: '押し返した先手を支え、堤へ退いた十河の寄せを受ける', r: 16, dur: 60, title: '北の岸', sub: '十河の寄せ',
      say: [['長宗我部信親', '岸を取った！　ここを守れ！', 3]],
      waves: [{ t: 0, say: ['十河の侍', '押し戻せ！　川へ落とせ！'], foes: [{ name: '十河の先陣', from: { x: BANK.x - 10, z: BANK.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['十河の侍', '二陣、かかれ！'], foes: [{ name: '十河の二陣', from: { x: BANK.x + 14, z: BANK.z + 40 }, list: [uS(2), uA(12)] }] }],
      reward: '北の岸を守った' },
    { kind: 'fight', at: SOGO, obj: '左右へ広がった味方と、十河存保の備を崩す', title: '十河存保', sub: '勝瑞の城の前で踏みとどまる', max: 140,
      say: [['長宗我部元親', '左右へ広がれ！　中央を割るぞ！', 3], ['長宗我部元親', '存保はそこじゃ！　押せ！', 3]],
      foes: [{ name: '十河存保の備', from: { x: SOGO.x, z: SOGO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '十河存保', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['十河の侍', '殿を守れ！　旗本、前へ！'], foes: [{ name: '十河の旗本', from: { x: SOGO.x - 14, z: SOGO.z + 20 }, list: [uS(3), uA(10)] }] }],
      reward: '十河存保の備を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'hold', at: { x: FORD.x + 10, z: FORD.z + 50 }, label: '北の岸の道で', obj: '北の岸の道で、勝瑞から出る三好の後詰を受け止める', r: 16, dur: 45,
      say: [['見張り', '勝瑞から後詰が出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '三好の後詰', from: { x: FORD.x + 22, z: FORD.z + 38 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '三好の後詰', from: { x: FORD.x - 4, z: FORD.z + 64 }, list: [uS(2), uA(7)] }] }],
      reward: '北の岸の道を守った' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '十河が崩れた。勝瑞の前の堀端に、まだ三好の鉄砲がおる', 3]]),
    fightS({ x: -36, z: 120 }, '勝瑞の城の堀端で、三好の鉄砲を払う', '勝瑞城', '堀端に三好の鉄砲', [['長宗我部元親', '堀端の鉄砲を払え。城を裸にする', 3]],
      [foe('堀端の三好の鉄砲', -44, 134, [uS(1), uG(6)]), foe('堀端の三好の槍', -26, 138, [uS(2), uA(10)])], { later: [wave(28, '三好の侍', '堀を越えさせるな！', [foe('三好の堀の守り', -60, 124, [uS(2), uA(8)])])], reward: '堀端の鉄砲を払った' }),
    holdS({ x: 30, z: 110 }, '勝瑞の東の口', '勝瑞の東の口で、大雨の中を打って出た城兵を受ける', '大雨', '吉野川があふれ、城兵が打って出る', [['組頭', '大雨で足が取られる。踏みとどまれ！', 3]],
      [wave(0, '十河の侍', '寄せ手は水に足を取られておる！　打って出よ！', [foe('勝瑞の城兵', 44, 136, [uS(2), uA(12)])]), wave(30, '三好の侍', '二の手、続け！', [foe('勝瑞の城兵の二', 60, 116, [uS(2), uA(10)])]),
        wave(54, '三好の侍', '鉄砲、撃ちかけよ！', [foe('勝瑞の鉄砲', 20, 140, [uS(1), uA(6), uG(3)])])], { reward: '大雨の打って出を受けきった' }),
    fightS({ x: 0, z: 140 }, '勝瑞へ退く三好の殿を追い崩す', '三好の殿', '三好の殿が大手の前に踏みとどまる', [['長宗我部元親', '水が引いた。今じゃ、押せ！', 3]],
      [foe('三好の殿の兵', 0, 154, [boss('三好の侍大将', false), uS(3), uA(12)])], { later: [wave(30, '三好の侍', '門を守れ！', [foe('勝瑞の門の兵', -16, 160, [uS(2), uA(8)])])], reward: '三好の殿を崩した' }),
    fightS({ x: 46, z: 138 }, '城下の外れで、十河の旗本の残りを追い散らす', '十河の旗本', '存保を城へ入れる旗本', [['組頭', '存保を城へ入れる気じゃ！　旗本を散らせ！', 3]],
      [foe('十河の旗本の残り', 56, 152, [uS(2), uA(12)])], { later: [wave(26, '十河の侍', '存保様を城へ！', [foe('十河の殿の二', 30, 156, [uS(2), uA(8)])])], reward: '十河の旗本を勝瑞へ追い込んだ' }),
  ],
  setup: lineAbreast,
  update(rt, dt) {
    const F = rt.flags;
    flankTick(rt, FLANKS);
    // 支度の後の最初のコマ：田の畦に一領具足の影を置く（しゃがんだ姿で待つ。味方の段の送り出しには入れない）
    if (!F.ckShadow && rt.player?.u) {
      F.ckShadow = FIELDS.map((f, i) => allyGroup(rt, {
        name: '田の一領具足', flag: CHOSO.flag, anchor: { ...f.at }, facing: Math.atan2(HORA.x - f.at.x, HORA.z - f.at.z), fullStrength: true, noRout: true,
        aggro: 0, seekRange: 0, morale: 92, dmgMult: 0.4, fixed: true, noAI: true, order: 'hold', ambush: true,
      }, dress([ICHIRYO(i < 2 ? 7 : 6)], CHOSO)));
      for (const g of F.ckShadow) for (const u of g.units) { u._crouch = true; u.perch = { x: u.pos.x, y: rt.world.heightAt(u.pos.x, u.pos.z), z: u.pos.z }; }   // perch：近い形（humans）でも膝をつく（humans_animate.js perchCrouch）
    }
    if (F.step === 0 && !F.ckCalled && F.dp?.i >= 1) F.ckT = (F.ckT || 0) + (dt || 0);   // 法螺の台へ向かう間の秒
    if (F.step >= 1 && !F.ckCalled) callUp(rt);   // 台に着いた（段が進んだ）＝呼ぶ
  },
  win: {
    banner: '中富川の勝ち', sub: '三好の兵が勝瑞へ退く', award: '中富川で十河存保を破った',
    say: [['組頭', '十河の兵が退いていく。勝瑞の城へ逃げ込むぞ', 3.2],
      ['長宗我部元親', '一領具足の働き、見事であった', 3.2],
      ['長宗我部元親', '刈り入れの前には、皆を田へ帰してやる', 3]],
  },
});
export default c04_nakatomi;
