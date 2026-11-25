// 毛利家編 五戦目「月山富田城の戦い」（永禄八〜九年〔1565〜66〕・出雲国 月山富田城）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：毛利元就は尼子義久の月山富田城を約一年半囲んだ。三つの口の力攻めは退けられ、毛利は兵糧の道を断つ長い囲みに切り替えた。
//   城内の将へ密書を送って降らせ（『雲陽軍実記』B）、飢えた尼子義久は永禄九年十一月に降った（安来市の解説C。毛利約三万・尼子約一万は通説）。
//   仕組み：三つの口の力攻めを退けられる → 兵糧の道の荷駄を討つ（兵糧攻め） → 城内の将へ調略の糸 → 山の曲輪 → 義久の降伏。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, jinmaku, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };
const SPAWN = { x: 90, z: 80 };            // 洗合の本陣
const GUCHI = { x: 30, z: 20 };            // 御子守口の前
const HEI = { x: -80, z: 56 };             // 兵糧の道（尼子の荷駄）
const INNER = { x: -20, z: -40 };          // 城内の将の曲輪（降らせる）
const MARU = { x: -10, z: -92 };           // 山の本丸

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-10, -50], [14, -60], [-6, -96]]) rt.scene.add(yagura(W, dx, dz, { rot: 0 }));
    rt.scene.add(palisade(W, [-30, -30, 14, -30], { solid: true, h: 2.4 }));
    rt.scene.add(jinmaku(W, SPAWN.x - 8, SPAWN.z + 6, 14, 10, 4, { mon: 'mori' }));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, INNER.x + dx, INNER.z + dz, 'kyogoku', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m05_gassan = lightBattle({
  id: 'm05_gassan',
  date: '永禄九年（1566）　昼　出雲国 月山富田城',
  intro: '月山富田城は難攻不落。三つの口の力攻めは退けられた。元就は兵糧の道を断ち、城内の将へ密書を送って、長い囲みを締める。',
  history: '永禄八年（1565）、毛利元就は尼子義久の月山富田城を約三万で囲んだ。三つの口（御子守口・塩谷口・菅谷口）の力攻めは険しい山に退けられ、毛利は兵糧の道を断つ長い囲みに切り替えた。城内の将へ密書を送って降らせ、飢えた城は永禄九年十一月、尼子義久が降って終わった（『雲陽軍実記』B・安来市の解説C。毛利約三万・尼子約一万は通説）。',
  sides: { a: { name: '毛利元就の軍', mon: 'mori', faction: 'mori' }, b: { name: '尼子義久の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 30000, b: 10000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.1 },
  world: {
    seed: 1565, time: 'day', fogFar: 420,
    hills: [[-15, -90, 66, 30], [-60, -30, 44, 16], [-100, 60, 44, 10], [130, 20, 60, 14], [60, 110, 46, 10]],
    paths: [{ pts: [[90, 80], [30, 20], [-20, -40], [-10, -92]], w: 3 }, { pts: [[90, 80], [-10, 70], [-80, 56]], w: 2.6 }],
    groves: [{ x: 110, z: -20, r: 34, n: 30 }, { x: -130, z: 20, r: 32, n: 28 }, { x: 30, z: 120, r: 30, n: 26 }],
    trees: 420, tufts: 1800,
  },
  allies: [
    { name: '毛利元就の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 2 }, fixed: true, list: [busho('毛利元就'), uS(5), uA(8)] },
    { name: '吉川元春の手', at: { x: SPAWN.x - 12, z: SPAWN.z - 6 }, list: [busho('吉川元春'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  turncoats: [{ key: 'gassan_sho', name: '城内の将の備', at: INNER, face: Math.PI * 0.9, list: [uS(2), uA(13), uB(4), { type: 'ashigaru', n: 1, o: { standard: 'kyogoku', flag: null, weapon: 'none', dmg: 0 } }] }],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['毛利元就', '月山は三つの口を持つ山じゃ。力で攻めても、石と矢の雨に阻まれる', 3.6],
      ['吉川元春', '父上、尼子の兵糧は日ごとに減っております。道を断てば、城は自ら弱ります', 3.4],
      ['毛利元就', 'よい。まず口の前の備を受け、次に兵糧の道じゃ', 3.2]] },
    { kind: 'hold', at: GUCHI, label: '御子守口の前', obj: '御子守口の前で、城から打って出る尼子勢を受け止める', r: 18, dur: 70,
      title: '三つの口', sub: '尼子が山から打って出る',
      say: [['吉川元春', '尼子が口を開けた！　坂の途中で受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['尼子の侍', '毛利を山から追い落とせ！', 3], foes: [{ name: '尼子の打って出る手', from: { x: GUCHI.x - 6, z: GUCHI.z - 40 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', 'まだ来るぞ！　囲みを崩されるな！'], foes: [{ name: '尼子の二の手', from: { x: GUCHI.x + 14, z: GUCHI.z - 44 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '御子守口の前で尼子の出撃を受け止めた' },
    { kind: 'fight', at: HEI, obj: '兵糧の道へ回り、尼子の荷駄を討つ', title: '兵糧の道', sub: '城への米を断つ',
      say: [['毛利元就', '力で落ちぬ城は、腹で落とす。荷駄を討ち、米の道を断て', 3.2]],
      foes: [{ name: '尼子の荷駄の護り', from: { x: HEI.x - 6, z: HEI.z + 6 }, list: [uS(3), uA(16), uB(6)] }, { name: '荷駄の足軽', from: { x: HEI.x + 8, z: HEI.z - 6 }, list: [uS(2), uA(12)] }],
      later: [{ t: 40, say: ['組頭', '城から荷駄を取り返しに来るぞ！'], foes: [{ name: '尼子の取り返し', from: { x: HEI.x + 20, z: HEI.z - 20 }, list: [uS(3), uA(14)] }] }],
      reward: '尼子の兵糧の道を断った' },
    { kind: 'chouryaku', target: 'gassan_sho', at: INNER, label: '城内の将の備', obj: '山の曲輪の、城内の将の備へ密書を届ける', r: 9, max: 100,
      say: [['毛利元就', '米が絶えれば、城内にも毛利に付こうという者が出る。この書状を、あの将へ渡せ', 3.8]],
      turnSay: ['城内の将', '飢えた兵を死なせとうはない。毛利殿に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、城内の将の備を毛利に付けた' },
    { kind: 'fight', at: MARU, obj: '山の曲輪を上り、尼子義久の本丸へ迫る', title: '山の曲輪', sub: '飢えた城の最後の守り',
      say: [['吉川元春', '城内の備が降った。曲輪を上れ、本丸が見えるぞ！', 3.2]],
      foes: [{ name: '本丸の守り', from: { x: MARU.x + 6, z: MARU.z - 6 }, list: [uS(4), uA(18)] }, { name: '尼子の弓', from: { x: MARU.x - 12, z: MARU.z - 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '義久の旗本が出て来るぞ！'], foes: [{ name: '義久の旗本', from: { x: MARU.x + 16, z: MARU.z - 20 }, list: [uS(3), uA(10)] }] }],
      reward: '月山富田城の山の曲輪を上り、本丸へ迫った' },
  ],
  win: {
    banner: '月山富田城の勝ち', sub: '尼子義久が降った', award: '月山富田城の長い囲みを終わらせた',
    say: [['吉川元春', '義久殿が城を出られました。尼子は降りました', 3.2],
      ['毛利元就', '一年半の囲みであった。刀より、米と書状が城を落とした', 3.6],
      ['組頭 与三左', 'お主の働きで、無駄な血が流れずに済んだ', 3.2]],
  },
});
export default m05_gassan;
