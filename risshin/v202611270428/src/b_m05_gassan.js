// 毛利家編 五戦目「月山富田城の戦い」（永禄八〜九年〔1565〜66〕・出雲国 月山富田城）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：毛利元就は尼子義久の月山富田城を約一年半囲んだ。三つの口の力攻めは退けられ、毛利は兵糧の道を断つ長い囲みに切り替えた。
//   城内の将へ密書を送って降らせ（『雲陽軍実記』B）、飢えた尼子義久は永禄九年十一月に降った（安来市の解説C。毛利約三万・尼子約一万は通説）。
//   仕組み：三つの口の力攻めを退けられる → 兵糧の道の荷駄を討つ（兵糧攻め） → 城内の将へ調略の糸 → 山の曲輪 → 義久の降伏。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, jinmaku, nobori } from './props.js';
import { withCastle } from './light_castle.js';
import { plant } from './mori_show.js';
import { GASSAN_PLAN } from './castles/gassan.js';   // K716：第一次（m12）と同じ月山の山と城（前に逃げた同じ地形）
const GASSAN = { x: 0, z: -60 };
const NIGE = { x: 110, z: 96 };   // 第一次の殿の坂（m12 の TONO）＝去年、元就を逃がして皆が退いた坂

const MORI = { flag: 'mori', armor: 0x2a2622 };
const AMAGO = { flag: 'kyogoku', armor: 0x3a3a34 };
const SPAWN = { x: 90, z: 80 };            // 洗合の本陣
const GUCHI = { x: 30, z: 20 };            // 御子守口の前
const HEI = { x: -80, z: 56 };             // 兵糧の道（尼子の荷駄）
const INNER = { x: -20, z: -40 };          // 城内の将の曲輪（降らせる）
const MARU = { x: -10, z: -92 };           // 山の本丸
const KAWA = { x: 30, z: 70 };             // 富田川の河原（山中鹿介と品川大膳の一騎討ち・K652②）
const SHIOYA = { x: -50, z: -6 };          // 塩谷口の吉川の陣（尼子の夜討ち・K652②）

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-10, -50], [14, -60], [-6, -96]]) rt.scene.add(yagura(W, dx, dz, { rot: 0 }));
    rt.scene.add(palisade(W, [-30, -30, 14, -30], { solid: true, h: 2.4 }));
    rt.scene.add(jinmaku(W, SPAWN.x - 8, SPAWN.z + 6, 14, 10, 4, { mon: 'mori' }));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, INNER.x + dx, INNER.z + dz, 'kyogoku', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m05_gassan = withCastle(lightBattle({
  id: 'm05_gassan',
  date: '永禄九年（1566）　昼　出雲国 月山富田城',
  intro: '月山富田城は難攻不落。三つの口の力攻めは退けられた。元就は兵糧の道を断ち、城内の将へ密書を送って、長い囲みを締める。',
  history: '永禄八年（1565）、毛利元就は尼子義久の月山富田城を約三万で囲んだ。三つの口（御子守口・塩谷口・菅谷口）の力攻めは険しい山に退けられ、毛利は兵糧の道を断つ長い囲みに切り替えた。城内の将へ密書を送って降らせ、飢えた城は永禄九年十一月、尼子義久が降って終わった（『雲陽軍実記』B・安来市の解説C。毛利約三万・尼子約一万は通説）。',
  sides: { a: { name: '毛利元就の軍', mon: 'mori', faction: 'mori' }, b: { name: '尼子義久の軍', mon: 'kyogoku', faction: 'amago' } },
  force: { a: 30000, b: 10000 },
  allyLook: MORI, foeLook: AMAGO,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.55,   // K716 二回目：信長で出陣の通しが早くに倒れた
  minutes: 6,
  stepLimit: 60,   // K716 二回目：段を足して通しが1080秒の上限で打ち切られた（未達）。上限の無い段を60秒で次へ
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.1 },
  world: {
    seed: 1565, time: 'day', fogFar: 420,
    // K716：第一次（b_m12_gassan1.js）と同じ山・同じ道（同じ地形で、前に逃げた所へ戻って来る）
    hills: [[0, -60, 60, 30], [-80, -20, 44, 18], [20, -20, 36, 12], [150, 30, 50, 10], [-140, 60, 50, 9]],
    paths: [{ pts: [[90, 80], [30, 20], [-20, -40], [-10, -92]], w: 3 }, { pts: [[90, 80], [-10, 70], [-80, 56]], w: 2.6 }, { pts: [[0, 40], [60, 80], [110, 96], [150, 120]], w: 2.6 }],
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
      ['毛利元就', 'よい。まず口の前の備を受け、次に兵糧の道じゃ', 3.2],
      ['組頭', 'この山、見覚えがある。ここは前に、我らが逃げた場所じゃ。今度は我らが囲む番ぞ', 3.8]] },
    // K716 見せ場：前に攻めて敗れた城へ戻る。同じ地形。「ここ、前に逃げた場所だ」と分かる坂へ歩いて行く
    { kind: 'move', at: NIGE, label: '前に逃げた坂', obj: '去年、負けて退いた坂へ戻り、そこに陣の柵を立てる', r: 12, max: 100,
      say: [['吉川元春', 'この坂じゃ。渡辺通が身代わりに立った所よ。今度は我らが、山を囲む', 3.6], ['組頭', '見よ。同じ月山じゃ。あの塩谷口も、石を落とされた坂も、覚えておる', 3.4]] },
    { kind: 'hold', at: GUCHI, label: '御子守口の前', obj: '御子守口の前で、城から打って出る尼子勢を受け止める', r: 18, dur: 70,
      title: '三つの口', sub: '尼子が山から打って出る',
      say: [['吉川元春', '尼子が口を開けた！　坂の途中で受けよ！', 3.2]],
      waves: [
        { t: 6, say: ['尼子の侍', '毛利を山から追い落とせ！', 3], foes: [{ name: '尼子の打って出る手', from: { x: GUCHI.x - 6, z: GUCHI.z - 40 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', 'まだ来るぞ！　囲みを崩されるな！'], foes: [{ name: '尼子の二の手', from: { x: GUCHI.x + 14, z: GUCHI.z - 44 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '御子守口の前で尼子の出撃を受け止めた' },
    // K652②（11/25 Sanae・10分）：永禄八年九月、富田川の中州で品川大膳（棫木狼介）が山中鹿介に一騎討ちを挑み、討たれた（『雲陽軍実記』B）。その後の河原の斬り合い
    { kind: 'fight', at: KAWA, obj: '富田川の河原で、山中鹿介の手と斬り結ぶ', title: '富田川', sub: '品川大膳が鹿介に討たれた。河原が斬り合いになる',
      say: [['組頭', '品川殿が討たれた！　鹿介の手が河原を渡って来るぞ！', 3.2], ['吉川元春', '鹿介を深追いするな。河原で手を止めよ', 3.2]],
      foes: [{ name: '山中鹿介の手', from: { x: KAWA.x - 10, z: KAWA.z - 12 }, list: [busho('山中鹿介'), uS(3), uA(14)] }, { name: '尼子の河原の弓', from: { x: KAWA.x + 12, z: KAWA.z - 16 }, list: [uS(1), uB(5)] }],
      reward: '富田川の河原で鹿介の手を押し返した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: HEI, obj: '兵糧の道へ回り、尼子の荷駄を討つ', title: '兵糧の道', sub: '城への米を断つ',
      say: [['毛利元就', '力で落ちぬ城は、腹で落とす。荷駄を討ち、米の道を断て', 3.2]],
      foes: [{ name: '尼子の荷駄の護り', from: { x: HEI.x - 6, z: HEI.z + 6 }, list: [uS(3), uA(16), uB(6)] }, { name: '荷駄の足軽', from: { x: HEI.x + 8, z: HEI.z - 6 }, list: [uS(2), uA(12)] }],
      later: [{ t: 40, say: ['組頭', '城から荷駄を取り返しに来るぞ！'], foes: [{ name: '尼子の取り返し', from: { x: HEI.x + 20, z: HEI.z - 20 }, list: [uS(3), uA(14)] }] }],
      reward: '尼子の兵糧の道を断った' },
    // K652②：飢えた城方は囲みの陣へ夜討ちを掛けた。塩谷口は吉川元春の受け持ち（『陰徳太平記』B）
    { kind: 'hold', at: SHIOYA, label: '塩谷口の陣', obj: '塩谷口の陣で、飢えた尼子の夜討ちを受け止める', r: 16, dur: 60, limit: 110,
      title: '夜討ち', sub: '米の尽きた尼子が、囲みを破ろうとする',
      say: [['吉川元春', '腹を空かせた兵は死に物狂いじゃ。陣を空けるな', 3.2]],
      waves: [{ t: 6, say: ['尼子の侍', '毛利の陣の米を奪え！'], foes: [{ name: '尼子の夜討ちの手', from: { x: SHIOYA.x - 8, z: SHIOYA.z - 40 }, list: [uS(3), uA(14)] }] },
        { t: 32, say: ['組頭', '横からも来るぞ！'], foes: [{ name: '尼子の夜討ちの二の手', from: { x: SHIOYA.x - 38, z: SHIOYA.z - 10 }, list: [uS(2), uA(12)] }] }],
      reward: '塩谷口で尼子の夜討ちを受け止めた' },
    // K716 ⑦⑧：城内から逃亡者・山上の旗が減る（飢えた尼子の旗が、曲輪から一本ずつ消えて行く）
    { kind: 'rest', dur: 9, heal: 0.1, fn: (rt) => { const gs = plant(rt, [[-26, -70], [-8, -78], [10, -70], [-40, -86], [22, -86], [-18, -100]], 'kyogoku', 5.5);
        gs.forEach((g, k) => rt.after(2 + k * 1.2, () => { if (!rt.over) g.visible = false; })); },
      say: [['見張り', '城から逃げて来る者が出ておる。米が尽きたのじゃ', 3.2], ['組頭', '見よ。山の上の旗が、一本、また一本と減って行く', 3.4]] },
    { kind: 'chouryaku', target: 'gassan_sho', at: INNER, label: '城内の将の備', obj: '山の曲輪の、城内の将の備へ密書を届ける', r: 9, max: 100,
      say: [['毛利元就', '米が絶えれば、城内にも毛利に付こうという者が出る。この書状を、あの将へ渡せ', 3.8]],
      turnSay: ['城内の将', '飢えた兵を死なせとうはない。毛利殿に付く', 3.6],
      failSay: ['組頭', '間に合わなんだか。あの備は敵のままじゃ、構えよ！', 3.2],
      reward: '密書を届け、城内の将の備を毛利に付けた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GUCHI.x - 20, z: GUCHI.z + 20 }, obj: '御子守口の坂で、石を転がす尼子の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '石の陰へ寄れ', 3.2]],
      foes: [{ name: '石を転がす尼子の足軽', from: { x: GUCHI.x - 8, z: GUCHI.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '御子守口の坂を押さえた' },
    { kind: 'hold', at: { x: GUCHI.x + 30, z: GUCHI.z + 20 }, label: '兵糧の道の脇', obj: '兵糧の道の脇で、荷駄を取り返しに来る尼子の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '荷駄を取り返しに来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '尼子の兵', from: { x: GUCHI.x + 42, z: GUCHI.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '尼子の兵', from: { x: GUCHI.x + 16, z: GUCHI.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '兵糧の道を守った' },
    { kind: 'fight', at: { x: GUCHI.x - 30, z: GUCHI.z - 40 }, obj: '城内の曲輪で、降る前の尼子の旗本を討つ', max: 100, limit: 90,
      say: [['毛利元就', '旗本を崩せ。城は飢えておる', 3.2]],
      foes: [{ name: '尼子の旗本', from: { x: GUCHI.x - 18, z: GUCHI.z - 52 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '城内の曲輪を押さえた' },
    { kind: 'hold', at: { x: GUCHI.x - 10, z: GUCHI.z - 70 }, label: '山の本丸の下', obj: '山の本丸の下で、最後に打って出る尼子の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '最後の打って出じゃ！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '尼子の最後の兵', from: { x: GUCHI.x + 2, z: GUCHI.z - 82 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '尼子の最後の兵', from: { x: GUCHI.x - 24, z: GUCHI.z - 56 }, list: [uS(2), uA(7)] }] }],
      reward: '山の本丸の下を守った' },
    { kind: 'fight', at: MARU, obj: '山の曲輪を上り、尼子義久の本丸へ迫る', title: '山の曲輪', sub: '飢えた城の最後の守り',
      say: [['吉川元春', '城内の備が降った。曲輪を上れ、本丸が見えるぞ！', 3.2]],
      foes: [{ name: '本丸の守り', from: { x: MARU.x + 6, z: MARU.z - 6 }, list: [uS(4), uA(18)] }, { name: '尼子の弓', from: { x: MARU.x - 12, z: MARU.z - 2 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '義久の旗本が出て来るぞ！'], foes: [{ name: '義久の旗本', from: { x: MARU.x + 16, z: MARU.z - 20 }, list: [uS(3), uA(10)] }] }],
      reward: '月山富田城の山の曲輪を上り、本丸へ迫った' },
    // K716 ⑨⑩：降伏の使者・開城
    { kind: 'rest', dur: 8, heal: 0, say: [['尼子の使者', '義久、城兵の命と引き換えに、降り申す', 3.2], ['吉川元春', '城門が開いたぞ。一年半の囲みが、終わった', 3.4]] },
  ],
  win: {
    banner: '月山富田城の勝ち', sub: '尼子義久が降った', award: '月山富田城の長い囲みを終わらせた',
    say: [['吉川元春', '義久殿が城を出られました。尼子は降りました', 3.2],
      ['毛利元就', '一年半の囲みであった。刀より、米と書状が城を落とした', 3.6],
      ['組頭 与三左', 'お主の働きで、無駄な血が流れずに済んだ', 3.2]],
  },
}), { plan: GASSAN_PLAN, at: GASSAN, lift: 0, team: 1, life: false });
export default m05_gassan;
