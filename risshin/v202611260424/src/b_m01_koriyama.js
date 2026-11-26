// 毛利家編 一戦目「吉田郡山城の戦い」（天文九〜十年〔1540〜41〕・安芸国 吉田郡山城）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：尼子詮久（のち晴久）は約三万で吉田郡山城を囲んだ。城方は毛利元就と宍戸元源ら約三千で籠城し、青山の土取場で尼子勢を討った。
//   尼子の陣中に疫病が出て士気が落ち、大内義隆の援軍（陶隆房ら約一万）が着くと尼子は退いた（『毛利元就卿伝』・『陰徳太平記』B・安芸高田市の解説C）。
//   この戦に調略の糸は使わない（仕組みは次戦 m02 から。house_mori.md ②）。籠城の受け → 青山の土取場へ打って出る → 援軍が着いて退く尼子を追う。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, jinmaku, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };   // 尼子は京極の流れ＝平四つ目結（textures.js の kyogoku）
const SPAWN = { x: 0, z: -40 };            // 城の曲輪
const GATE = { x: 0, z: -4 };              // 城の大手（南の麓）
const AOYAMA = { x: -96, z: 22 };          // 青山の土取場（尼子の本陣の脇）
const TAJIHI = { x: 70, z: 100 };          // 多治比川の浅瀬（尼子の退き口）
const MIYAZAKI = { x: -40, z: 72 };        // 宮崎長尾の尼子の陣（尼子久幸・K652②）

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-16, -14], [16, -14], [0, -52]]) rt.scene.add(yagura(W, dx, dz, { rot: 0 }));
    rt.scene.add(palisade(W, [-30, -8, 30, -8], { solid: true, h: 2.4 }));
    rt.scene.add(jinmaku(W, AOYAMA.x - 8, AOYAMA.z - 8, 14, 10, 4, { mon: 'kyogoku' }));
    for (const [dx, dz] of [[-6, 4], [6, 4], [14, -2]]) rt.scene.add(nobori(W, AOYAMA.x + dx, AOYAMA.z + dz, 'kyogoku', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m01_koriyama = lightBattle({
  id: 'm01_koriyama',
  date: '天文十年（1541）　昼　安芸国 吉田郡山城',
  intro: '尼子の三万が吉田郡山城を囲んだ。城方は三千。元就は城に籠もって寄せ手を受け、大内の援軍を待つ。',
  history: '天文九年（1540）九月、尼子詮久は約三万の兵で安芸の吉田郡山城を囲んだ。城に籠もる毛利元就と宍戸元源らは約三千。元就は城の守りを固め、青山の土取場に出て尼子勢を討った。冬に入り尼子の陣に疫病が広がるころ、大内義隆の援軍（陶隆房ら約一万）が着き、天文十年正月、尼子は囲みを解いて退いた。この勝ちで、毛利は大内の下で生き延び、のちの飛躍の足がかりをつかんだ。',
  sides: { a: { name: '毛利元就の城方', mon: 'mori', faction: 'mori' }, b: { name: '尼子詮久の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 3000, b: 30000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1540, time: 'day', fogFar: 420,
    river: [[-200, 128], [-60, 122], [70, 118], [200, 126]], riverW: 12, riverDepth: 0.35,
    hills: [[0, -90, 52, 22], [-96, 40, 44, 12], [-30, -60, 30, 8], [150, 20, 60, 14], [-170, -10, 50, 10]],
    paths: [{ pts: [[0, -52], [0, -4], [0, 40], [30, 90]], w: 3 }, { pts: [[0, -4], [-50, 12], [-96, 22]], w: 2.6 }],
    groves: [{ x: -150, z: 80, r: 34, n: 30 }, { x: 140, z: 60, r: 34, n: 30 }, { x: 40, z: -110, r: 30, n: 26 }],
    trees: 380, tufts: 1800,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '宍戸元源の手', at: { x: SPAWN.x - 14, z: SPAWN.z + 8 }, list: [busho('宍戸元源'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 16, z: SPAWN.z + 10 }, list: [uS(1), uB(10)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '尼子は三万。我らは三千。じゃが、この城は山じゃ。攻め上るほど、敵は削れる', 3.8],
      ['宍戸元源', '大内殿の援軍が着くまで持ちこたえれば、我らの勝ちじゃ', 3.4],
      ['組頭', '石を落とせ、矢を放て。曲輪の高みから離れるな', 3.2]] },
    { kind: 'hold', at: GATE, label: '城の大手', obj: '城の大手で、尼子の寄せ手を受け止める', r: 18, dur: 70,
      title: '籠城', sub: '尼子の大軍が、山の城へ攻め上る',
      say: [['毛利元就', '来たぞ。坂の途中で足を止めさせよ。大手は通すな', 3.2]],
      waves: [
        { t: 6, say: ['尼子の侍', '小さな城じゃ！　一気に踏み潰せ！', 3], foes: [{ name: '尼子の先手', from: { x: GATE.x - 6, z: GATE.z + 44 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', 'まだ来るぞ！　退くな！'], foes: [{ name: '尼子の二の手', from: { x: GATE.x + 14, z: GATE.z + 48 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '大手で尼子の寄せ手を受け止めた' },
    { kind: 'fight', at: AOYAMA, obj: '青山の土取場へ打って出て、尼子の陣を討つ', title: '青山', sub: '土取場の尼子勢を横から討つ',
      say: [['毛利元就', '敵は疲れておる。青山の土取場へ出て、横腹を突け', 3.2]],
      foes: [{ name: '青山の尼子勢', from: { x: AOYAMA.x + 6, z: AOYAMA.z + 6 }, list: [uS(3), uA(16)] }, { name: '尼子の弓', from: { x: AOYAMA.x - 10, z: AOYAMA.z - 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '陣から新手が出て来るぞ！'], foes: [{ name: '尼子の新手', from: { x: AOYAMA.x - 24, z: AOYAMA.z + 20 }, list: [uS(2), uA(12)] }] }],
      reward: '青山の土取場で尼子勢を討った' },
    { kind: 'hold', at: GATE, label: '城の大手', obj: '大内の援軍が着くまで、もう一度大手を守る', r: 18, dur: 60,
      title: '援軍を待つ', sub: '尼子の陣に疫病が出ても、囲みは解けない',
      say: [['宍戸元源', '南から土煙じゃ。大内の旗が見えるぞ！', 3.2]],
      waves: [{ t: 4, say: ['尼子の侍', '城を落とさねば帰れぬ！　もう一度攻めよ！'], foes: [{ name: '尼子の決死の備', from: { x: GATE.x, z: GATE.z + 46 }, list: [uS(3), uA(14)] }] }],
      reward: '大内の援軍が着くまで城を守り抜いた' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②（11/25 Sanae・10分。元の act bot が533秒＝足すのは一段だけ）：天文十年正月、大内・毛利は宮崎長尾の尼子の陣を攻め、尼子久幸（詮久の大叔父）が討たれた（『毛利元就卿伝』・『陰徳太平記』B）
    { kind: 'fight', at: MIYAZAKI, obj: '大内勢と共に、宮崎長尾の尼子の陣を攻める', title: '宮崎長尾', sub: '雪の中、尼子久幸の陣へ',
      say: [['毛利元就', '陶殿は天神尾から、我らは宮崎長尾へ。尼子の陣を一つずつ落とす', 3.6], ['組頭', '雪で足が取られる。槍を低く構えよ', 3]],
      foes: [{ name: '尼子久幸の手', from: { x: MIYAZAKI.x - 6, z: MIYAZAKI.z + 8 }, list: [busho('尼子久幸', { mustLive: false, invuln: false }), uS(3), uA(16)] }, { name: '宮崎長尾の弓', from: { x: MIYAZAKI.x + 12, z: MIYAZAKI.z + 14 }, list: [uS(1), uB(6)] }],
      reward: '宮崎長尾の尼子の陣を破り、尼子久幸を討った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'hold', at: { x: GATE.x - 30, z: GATE.z + 20 }, label: '大手の前で、', obj: '大手の前で、昼に寄せる尼子の弓を受け止める', r: 16, dur: 45,
      say: [['見張り', '尼子の矢が降る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '尼子の弓', from: { x: GATE.x - 18, z: GATE.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '尼子の弓', from: { x: GATE.x - 44, z: GATE.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '大手の前を守った' },
    { kind: 'fight', at: { x: GATE.x + 40, z: GATE.z + 30 }, obj: '城の外の陣の跡で、柵を壊す尼子の足軽を討つ', max: 100, limit: 90,
      say: [['毛利元就', '柵を壊させるな', 3.2]],
      foes: [{ name: '尼子の足軽', from: { x: GATE.x + 52, z: GATE.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '陣の跡の足軽を討った' },
    { kind: 'hold', at: { x: GATE.x - 60, z: GATE.z + 60 }, label: '青山の道で、', obj: '青山の道で、本陣へ戻ろうとする尼子の足軽を受け止める', r: 16, dur: 45,
      say: [['見張り', '本陣へ戻る気だ！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '戻る尼子の足軽', from: { x: GATE.x - 48, z: GATE.z + 48 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '戻る尼子の足軽', from: { x: GATE.x - 74, z: GATE.z + 74 }, list: [uS(2), uA(7)] }] }],
      reward: '青山の道を守った' },
    { kind: 'fight', at: { x: GATE.x + 20, z: GATE.z + 90 }, obj: '多治比川の岸で、渡る尼子の殿を討つ', max: 100, limit: 90,
      say: [['毛利元就', '退く尼子を追え', 3.2]],
      foes: [{ name: '尼子の殿', from: { x: GATE.x + 32, z: GATE.z + 78 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '多治比川の岸を押さえた' },
    { kind: 'hold', at: { x: GATE.x + 50, z: GATE.z + 100 }, label: '多治比川の浅', obj: '多治比川の浅瀬で、逃れて来る尼子の落武者を受け止める', r: 16, dur: 45,
      say: [['見張り', '落ち武者が来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '尼子の落武者', from: { x: GATE.x + 62, z: GATE.z + 88 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '尼子の落武者', from: { x: GATE.x + 36, z: GATE.z + 114 }, list: [uS(2), uA(7)] }] }],
      reward: '多治比川の浅瀬を守った' },
    { kind: 'fight', at: TAJIHI, obj: '退く尼子の殿を、多治比川の浅瀬まで追う', title: '多治比川', sub: '大内の援軍と共に、退く尼子を追う',
      say: [['毛利元就', '陶殿が着かれた。尼子は退く。殿の備を追い払え', 3.2]],
      foes: [{ name: '尼子の殿', from: { x: TAJIHI.x - 6, z: TAJIHI.z + 8 }, list: [uS(4), uA(12)] }],
      reward: '退く尼子の殿を崩した' },
  ],
  win: {
    banner: '吉田郡山の勝ち', sub: '尼子は囲みを解いて退いた', award: '吉田郡山城で尼子の大軍を退けた',
    say: [['宍戸元源', '三万の尼子が、山を下りて帰って行く', 3.2],
      ['毛利元就', '城に籠もって待った甲斐があった。大内殿に礼を言わねばならぬ', 3.6],
      ['組頭 与三左', 'お主も、よう石を投げた。これで郡山は守れた', 3.2]],
  },
});
export default m01_koriyama;
