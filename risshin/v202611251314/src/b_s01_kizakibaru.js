// 島津家編 一戦目「木崎原の戦い」（元亀三年〔1572〕五月・日向国 木崎原）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ①④⑤）
//   史実：日向の伊東義祐の兵約三千（伊東祐安ら）が、島津の加久藤城を攻めて退き、木崎原で休んだ所を、飯野城の島津義弘が約三百で破った。
//   伊東方は大将の伊東祐安をはじめ多くの将を失った。島津の「釣り野伏せ」の最初の例と通説で言われる（『島津国史』B・えびの市の解説 C。兵数は諸説）。
// 仕組み「釣り野伏せ」の三拍（字は足さない・新しい札とボタンは足さない。動きと旗と音で見せる）：
//   ①中央の囮（主人公の組と義弘の旗本）が伊東の先手に当たる
//   ②伊東の本隊が北から押し出し、囮はわざと南へ退く（味方の備が後ろへ向く）。追う伊東の備は道に長く伸びる
//   ③伏せ場まで引いたら、左右の林にしゃがんで旗を倒していた伏兵が、法螺と鬨で旗を立てて一斉に出る（bhelp.js の ambush＝しゃがみの作りをそのまま使う）
//   最後に伊東の大将の備を崩して勝ち。本物の兵は味方・敵を合わせて二百人ほどまで
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { preFoes } from './b_depth.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const ITO = { flag: 'ito', armor: 0x3a3226 };
const SPAWN = { x: 0, z: -24 };
const STRIKE = { x: 0, z: 34 };      // ① 道の北で伊東の先手に当たる
const LURE = { x: 0, z: -76 };       // ② 退いて引き込む伏せ場（左右に林）
const KILL = { x: 0, z: -58 };       // ③ 伏せ場の口で挟む
const TAISHO = { x: 6, z: 18 };      // 伊東の大将の備が踏みとどまる所
const GROVE_L = { x: -38, z: -46 }, GROVE_R = { x: 38, z: -46 };   // 左右の伏せの林
const RIVER = [[-200, 120], [-90, 112], [0, 118], [90, 110], [200, 116]];   // 北の池島川（伊東勢が休んだ川辺）

// 追ってくる伊東の備（道の上に長く伸びる三つ。前の段の終わりに北から出し、退く囮を追わせる）
const CHASE = [
  { name: '伊東の先陣', from: { x: -4, z: 22 }, list: [uS(2), uA(14)] },
  { name: '伊東の二陣', from: { x: 6, z: 42 }, list: [uS(2), uA(12)] },
  { name: '伊東の三陣', from: { x: -2, z: 62 }, list: [uS(2), uA(12)] }];

// ② 退く段の始め：伊東の本隊を北から出し、囮（本人）を追わせる。段の敵には入れない（退く段の終わりに崩されないように）
function startChase(rt) {
  const F = rt.flags, ctx = F.dp?.ctx;
  if (F.kzChase || !ctx) return;
  F.kzChase = CHASE.map((c) => {
    const g = preFoes(rt, ctx, c.from, { ...c });
    if (!g) return null;
    g.stay = false; g.order = 'attack'; g.aggro = 14; g.seekRange = 60; g.noRout = true;
    g.anchor = { x: KILL.x, z: KILL.z + 6 };
    g.speed = Math.max(g.speed || 0, 3.4);   // 追う兵は走る
    if (rt.player?.u) g.focus = rt.player.u;
    return g;
  });
  sfx('taiko', 0.9);
  rt.army.play('eshout', CHASE[0].from, 1.8);
}
// ③ 挟む段の始め：左右の伏兵が旗を立てて出る（法螺・鬨・鉄砲の斉射）
function springAmbush(rt) {
  const F = rt.flags;
  if (F.kzSprung) return;
  F.kzSprung = true;
  for (const g of F.kzAmbush || []) {
    if (!g || !g.count) continue;
    g.ambush = false; for (const u of g.units) u._crouch = false;
    g.noAI = false; g.fixed = false; g.order = 'attack'; g.aggro = 30; g.seekRange = 70;
    g.anchor = { x: KILL.x + Math.sign(g.anchor.x) * 6, z: KILL.z + 4 };
    F.allies.push(g);
  }
  rt.say('島津義弘', '今じゃ！　かかれ！', 2.6); rt.after(2.8, () => rt.say('伊東の侍', '林に伏兵！　謀られた！', 3));
  sfx('hora', 1); rt.after(0.5, () => sfx('volley', 0.9)); rt.after(0.9, () => sfx('toki', 1));
}

export const s01_kizakibaru = lightBattle({
  id: 's01_kizakibaru',
  date: '元亀三年（1572）五月　朝　日向国 木崎原',
  intro: '伊東の兵三千が加久藤の城を攻めて退き、木崎原で休んでいる。飯野の島津義弘の手は三百。正面から当たれば勝てぬ。',
  history: '元亀三年（1572）五月、日向の伊東義祐の兵約三千が島津の加久藤城を攻めて退き、木崎原で休んだ。飯野城の島津義弘は約三百の兵を分け、中の一手で当たってわざと退き、追ってきた伊東勢を左右に伏せた兵で挟んだ。伊東方は大将の伊東祐安をはじめ多くの将を失った。島津の「釣り野伏せ」の最初の例と伝わる（兵の数は諸説ある）。',
  sides: { a: { name: '島津義弘の手', mon: 'shimazu', faction: 'shimazu' }, b: { name: '伊東の軍', mon: 'ito', faction: 'ito' } },
  force: { a: 300, b: 3000 },
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: ITO,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1572, time: 'day', fogFar: 420,
    river: RIVER, riverW: 10, riverDepth: 0.5,
    hills: [[-62, -48, 30, 6], [62, -48, 30, 6], [-150, 60, 60, 14], [150, 40, 60, 16], [0, 210, 90, 22]],
    paths: [{ pts: [[0, -120], [0, -76], [0, -24], [0, 34], [4, 90], [0, 140]], w: 3 }],
    groves: [{ x: GROVE_L.x - 8, z: GROVE_L.z, r: 22, n: 34 }, { x: GROVE_R.x + 8, z: GROVE_R.z, r: 22, n: 34 }, { x: -150, z: 60, r: 30, n: 24 }, { x: 150, z: 40, r: 30, n: 24 }],
    trees: 420, tufts: 2200,
  },
  allies: [
    { name: '島津義弘の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 6 }, list: [busho('島津義弘'), uS(4), uA(8)] },
    { name: '囮の足軽', at: { x: SPAWN.x + 8, z: SPAWN.z - 2 }, list: [uS(1), uA(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['島津義弘', '敵は三千、わしらは三百。正面から当たれば、ひとたまりもない', 3.4],
      ['島津義弘', '左右の林に兵を伏せた。中の手が当たり、退いて、敵を林の間まで引け', 3.6],
      ['組頭', '退く時は振り向くな。林の間まで走れ。そこで向き直る', 3.2]] },
    { kind: 'fight', at: STRIKE, obj: '道の北で、伊東の先手に当たる', title: '木崎原', sub: '川辺で休む伊東の先手',
      say: [['伊東の侍', '島津の小勢が出てきたぞ！　討ち取れ！', 3]],
      foes: [{ name: '伊東の先手', from: { x: STRIKE.x - 4, z: STRIKE.z + 12 }, list: [uS(2), uA(12)] }],
      max: 90, reward: '伊東の先手に当たった' },
    { kind: 'move', at: LURE, label: '林の間', obj: '退いて、伊東勢を林の間まで引く', r: 10, max: 100,
      say: [['島津義弘', '引け！　林の間まで引け！', 3], ['伊東の侍', '島津が逃げるぞ！　追え、一人も返すな！', 3.2]] },
    { kind: 'hold', at: KILL, label: '林の間', obj: '向き直って待ち、追ってきた伊東勢を挟む', r: 16, dur: 70, title: '伏せ', sub: '林の間で向き直る',
      say: [['島津義弘', '向き直れ！　ここで待て。まだじゃ', 3]],
      waves: [{ t: 0, foes: CHASE.map((c, i) => ({ ...c, adopt: (rt) => rt.flags.kzChase?.[i] })) },
        { t: 45, say: ['伊東の侍', '後陣を入れよ！　島津は小勢じゃ！'], foes: [{ name: '伊東の後陣', from: { x: 8, z: KILL.z + 50 }, list: [uS(2), uA(14)] }] }],
      reward: '林の間で伊東勢を挟んだ' },
    { kind: 'fight', at: TAISHO, obj: '伊東の大将の備を崩す', title: '伊東の大将', sub: '伊東祐安が踏みとどまる', max: 140,
      say: [['島津義弘', '大将はそこじゃ！　押せ！', 3]],
      foes: [{ name: '伊東祐安の備', from: { x: TAISHO.x, z: TAISHO.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '伊東祐安', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['伊東の侍', '大将を守れ！　旗本、前へ！'], foes: [{ name: '伊東の旗本', from: { x: TAISHO.x - 14, z: TAISHO.z + 20 }, list: [uS(3), uA(10)] }] }],
      reward: '伊東の大将の備を崩した' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['島津義弘', '祐安を討った。伊東は退くぞ。一人も加久藤を越えさせるな', 3.2]]),
    fightS({ x: -30, z: 60 }, '退く伊東の殿を追い崩す', '伊東の殿', '伊東勢が退きにかかる', [['組頭', '追え！　小勢と侮った報いじゃ！', 3]],
      [foe('伊東の殿', -40, 76, [uS(2), uA(12)])], { later: [wave(28, '伊東の侍', '弓、追手を射よ！', [foe('伊東の殿の弓', -20, 92, [uS(1), uB(6)])])], reward: '伊東の殿を崩した' }),
    fightS({ x: 30, z: 70 }, '柚木崎丹後守の手を崩す', '柚木崎丹後守', '伊東の剛の者が義弘に挑む', [['島津義弘', '柚木崎か！　わしが相手じゃ', 3]],
      [foe('柚木崎丹後守の手', 40, 84, [boss('柚木崎丹後守'), uS(2), uA(10)])], { later: [wave(28, '伊東の侍', '丹後守様を助けよ！', [foe('柚木崎の供', 56, 70, [uS(2), uA(8)])])], reward: '柚木崎丹後守を討った' }),
    holdS({ x: 0, z: 60 }, '加久藤の道', '道を守り、返してきた伊東の後陣を受ける', '伊東の後陣', '伊東の後陣が返す', [['組頭', '後陣が返してきた！　道を渡すな！', 3]],
      [wave(0, '伊東の侍', '島津は三百じゃ！　押し潰せ！', [foe('伊東の返しの手', 0, 100, [uS(2), uA(12)])]), wave(30, '伊東の侍', '横から回れ！', [foe('伊東の返しの二', -40, 96, [uS(2), uA(10)])]),
        wave(52, '伊東の侍', '鉄砲、撃て！', [foe('伊東の鉄砲', 40, 100, [uS(1), uA(6), uG(3)])])], { reward: '伊東の後陣を受けきった' }),
    fightS({ x: -10, z: 110 }, '伊東祐信の旗本を討つ', '伊東祐信', '伊東の一門が踏みとどまる', [['島津義弘', 'あれが最後の旗じゃ。押せ！', 3]],
      [foe('伊東祐信の旗本', -10, 124, [boss('伊東祐信'), uS(3), uA(10)])], { later: [wave(30, '伊東の侍', '退くな！', [foe('伊東の最後の兵', 10, 130, [uS(2), uA(8)])])], reward: '伊東祐信の旗本を崩した' }),
  ],
  update(rt, dt) {
    const F = rt.flags;
    // 支度の後の最初のコマ：左右の林に伏兵を置く（しゃがんで旗を倒した姿で待つ。味方の段の送り出しには入れない）
    if (!F.kzAmbush && rt.player?.u) {
      F.kzAmbush = [[GROVE_L, '左の伏兵'], [GROVE_R, '右の伏兵']].map(([p, name]) => allyGroup(rt, {
        name, flag: SHIMAZU.flag, anchor: { ...p }, facing: Math.sign(p.x) * Math.PI / 2, fullStrength: true, noRout: true,
        aggro: 0, seekRange: 0, morale: 95, dmgMult: 0.45, fixed: true, noAI: true, order: 'hold', ambush: true,
      }, dress([uS(3), uA(12), uG(3)], SHIMAZU)));
      for (const g of F.kzAmbush) for (const u of g.units) u._crouch = true;
    }
    if (F.step === 1 && !F.kzChase) startChase(rt);   // ① の後＝退く段の始め
    // 深追い：伏兵が出るまで、追う伊東の兵は退く囮（本人）を狙って走り続ける（道の上に長く伸びる）
    if (F.kzChase && !F.kzSprung && (F._kzT = (F._kzT || 0) - (dt || 0)) <= 0) {
      F._kzT = 0.5;
      const P = rt.player?.u;
      if (P?.alive) for (const g of F.kzChase) if (g && g.count) for (const u of g.units) if (u.alive && !u.fleeing && !u.gone) { u.target = P; u.aiT = 1.5; u.moveTo = null; }
    }
    // 伏せ場に着いた後、追ってきた伊東の先陣が林の間へ入った時（着いて四十秒まで待つ）に伏兵が出る＝挟む
    if (F.step === 2 && !F.kzSprung) {
      F.kzWait = (F.kzWait || 0) + (dt || 0);
      const lead = (F.kzChase || []).find((g) => g && g.count && !g.routed)?.center();
      if (F.kzWait > 40 || !lead || lead.z < KILL.z + 34) springAmbush(rt);
    }
  },
  win: {
    banner: '木崎原の勝ち', sub: '三百で三千を破った', award: '木崎原で伊東勢を挟んで破った',
    say: [['組頭', '伊東の大将が討たれた。敵が崩れていく', 3.2],
      ['島津義弘', '退いて、待って、挟む。これが島津の戦じゃ', 3.4],
      ['島津義弘', '皆、よう走った。飯野へ帰るぞ', 3]],
  },
});
export default s01_kizakibaru;
