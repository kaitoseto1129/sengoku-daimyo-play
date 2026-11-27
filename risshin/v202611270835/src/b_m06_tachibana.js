// 毛利家編 六戦目「立花山・多々良浜の戦い」（永禄十二年〔1569〕・筑前国 立花山〜多々良浜）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：毛利元就は大友宗麟の筑前の拠点、立花山城（立花鑑載が離反し大友に討たれたあと戸次鑑連らが守る）を攻めて、多々良浜に陣を敷いた。
//   大友は出雲の尼子残党（山中鹿介・尼子勝久）を動かして毛利の背後を突かせ、毛利は筑前から兵を引いた（『大友興廃記』B・福岡県の解説C。毛利約二万・大友約一万は推・引き揚げの理由は諸説）。
//   仕組み：多々良浜の上陸 → 立花山の城方の打って出る手を受ける → 出雲の尼子残党の密使（糸を切る側）を追う → 浜へ退く殿。勝ちは「無事に引き揚げる」。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { palisade, yagura, nobori } from './props.js';

const MORI = { flag: 'mori', armor: 0x2a2622 };
const OTOMO = { flag: 'otomo', armor: 0x3a3a34 };
const SPAWN = { x: 90, z: 60 };            // 多々良浜の毛利の陣
const SHIRO = { x: -10, z: -60 };          // 立花山の山麓
const KEN = { x: -80, z: 10 };             // 尼子残党の密使の通り道
const KAIGAN = { x: 100, z: 100 };         // 引き揚げの浜

function scene(rt) {
  const W = rt.world;
  try {
    for (const [dx, dz] of [[-14, -80], [12, -90]]) rt.scene.add(yagura(W, dx, dz, { rot: 0 }));
    rt.scene.add(palisade(W, [-34, -56, 14, -56], { solid: true, h: 2.4 }));
    for (const [dx, dz] of [[-4, 4], [6, 6]]) rt.scene.add(nobori(W, SHIRO.x + dx, SHIRO.z + dz, 'otomo', 5.5));
  } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m06_tachibana = lightBattle({
  id: 'm06_tachibana',
  date: '永禄十二年（1569）　昼　筑前国 立花山・多々良浜',
  intro: '毛利は九州へ渡り、立花山の城を攻めた。ところが出雲では尼子の残党が動き出した。元就は、勝ちながら引く判断を迫られる。',
  history: '永禄十二年（1569）、毛利元就は大友宗麟の筑前の拠点、立花山城を攻め、多々良浜に陣を敷いた。大友方の戸次鑑連らは山の城から打って出て毛利を悩ませた。そのころ大友は、出雲の尼子の残党を動かして毛利の背後を突かせた。毛利は筑前から兵を引き、尼子の乱を鎮めに向かった（『大友興廃記』B・福岡県の解説C。毛利約二万・大友約一万は推・引き揚げの理由は諸説・要確認）。',
  sides: { a: { name: '毛利の九州攻めの軍', mon: 'mori', faction: 'mori' }, b: { name: '大友方の軍', mon: 'otomo', faction: 'otomo' } },
  force: { a: 20000, b: 10000 },
  allyLook: MORI, foeLook: OTOMO,
  thick: true,
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  stepLimit: 80,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.2 },
  world: {
    seed: 1569, time: 'day', fogFar: 420,
    // K716：九州の海岸平野（中国地方の山の景色と変える）。南に海・多々良川の湿地の流れ
    river: [[-200, 36], [-70, 44], [50, 38], [200, 48]], riverW: 16, riverDepth: 0.3,
    sea: [{ pts: [[-300, 190], [0, 196], [300, 186]], w: 90, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[-10, -100, 60, 24], [-70, -40, 40, 12], [-100, 20, 44, 10], [120, -20, 50, 10]],
    paths: [{ pts: [[90, 60], [40, 0], [-10, -60]], w: 3 }, { pts: [[-10, -60], [-80, 10], [40, 100], [100, 100]], w: 2.6 }],
    groves: [{ x: 120, z: 10, r: 30, n: 26 }, { x: -120, z: 70, r: 32, n: 28 }, { x: 20, z: 120, r: 28, n: 24 }],
    trees: 360, tufts: 1800,
  },
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 2 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '小早川隆景の手', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [busho('小早川隆景'), uS(3), uA(12)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 12 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['吉川元春', '多々良浜に着いた。立花山は海を背にした低い山城じゃ', 3.6],
      ['小早川隆景', '兄上、国元の様子が気になります。出雲の便りが遅うございます', 3.4],
      ['吉川元春', 'まず立花山の戸次勢を叩く。お主、先手につけ', 3.2],
      ['組頭', '山側からも海側からも、大友の旗が出る。どちらを支えるか、その場で決めよ', 3.6]] },
    // K716 見せ場：山側と海側の両方から敵が現れ、どちらを支えるか瞬間的に判断する
    { kind: 'hold', at: { x: 62, z: 24 }, label: '陣の前', obj: '山側と海側の二つから寄せる大友勢を、陣の前で支える', r: 18, dur: 55, limit: 90,
      title: '山と海', sub: '山側からも海側からも、大友の旗が出る',
      say: [['組頭', '山側の立花山から戸次の手が！　……海側にも舟が着いた！　どちらを支える！', 3.6]],
      waves: [
        { t: 5, say: ['大友の侍', '山から押せ！　毛利を浜へ落とせ！', 3], foes: [{ name: '山側の大友勢', from: { x: 46, z: -22 }, list: [uS(2), uA(10), uB(3)] }] },
        { t: 9, say: ['大友の水夫', '舟を着けよ！　海側から陣の背を突く！', 3], foes: [{ name: '海側の大友勢', from: { x: 84, z: 74 }, list: [uS(2), uA(9), uB(2)] }] },
        { t: 30, foes: [{ name: '山側の大友の二の手', from: { x: 30, z: -28 }, list: [uS(2), uA(8)] }] }],
      reward: '山側と海側の二方から寄せる大友勢を支えた' },
    { kind: 'fight', at: SHIRO, obj: '立花山の麓へ攻め上がり、大友の先手を討つ', title: '立花山', sub: '海を背にした山城へ',
      say: [['吉川元春', '山は低い。一気に麓の備を破れ！', 3.2]],
      foes: [{ name: '立花山の先手', from: { x: SHIRO.x + 6, z: SHIRO.z - 6 }, list: [uS(2), uA(10)] }, { name: '城の弓', from: { x: SHIRO.x - 12, z: SHIRO.z - 14 }, list: [uS(1), uB(4)] }],
      reward: '立花山の麓の大友の先手を討った' },
    { kind: 'hold', at: SHIRO, label: '立花山の麓', obj: '戸次鑑連の打って出る手を、麓で受け止める', r: 18, dur: 70,
      title: '戸次鑑連', sub: '雷神の手が山を駆け下りる',
      say: [['小早川隆景', '戸次が出て来た！　あの手は強い、槍を揃えよ！', 3.2]],
      waves: [
        { t: 6, say: ['戸次鑑連', '輿を前へ出せ！　わしが雷じゃ、毛利を海へ押し返せ！', 3.4], foes: [{ name: '戸次鑑連の旗本', from: { x: SHIRO.x - 6, z: SHIRO.z - 40 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['高橋鎮種', '戸次殿に続け！　高橋の手が横から入る！', 3.2], foes: [{ name: '高橋鎮種の二の手', from: { x: SHIRO.x + 14, z: SHIRO.z - 44 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '戸次鑑連の打って出る手を受け止めた' },
    { kind: 'fight', at: KEN, obj: '背後へ回る大友の別手を討つ', title: '背後', sub: '出雲の知らせが届く前に',
      say: [['吉川元春', '出雲で尼子が兵を挙げたと、早馬が来た。大友が裏から手を回しておる', 3.6],
        ['小早川隆景', '背後の手を討ち、浜へ戻る道を開こう', 3.2]],
      foes: [{ name: '大友の別手', from: { x: KEN.x - 6, z: KEN.z + 6 }, list: [uS(3), uA(12), uB(4)] }],
      reward: '浜へ戻る道を開いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SHIRO.x - 20, z: SHIRO.z + 30 }, obj: '多々良浜の砂で、陣を襲う大友の足軽を討つ', max: 100, limit: 90,
      say: [['毛利元就', '陣を守れ', 3.2]],
      foes: [{ name: '大友の足軽', from: { x: SHIRO.x - 8, z: SHIRO.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '浜の大友の足軽を討った' },
    { kind: 'hold', at: { x: SHIRO.x + 30, z: SHIRO.z + 40 }, label: '山麓の道で、', obj: '山麓の道で、立花山から出る大友の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '山から打って出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '立花山の大友の兵', from: { x: SHIRO.x + 42, z: SHIRO.z + 28 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '立花山の大友の兵', from: { x: SHIRO.x + 16, z: SHIRO.z + 54 }, list: [uS(2), uA(7)] }] }],
      reward: '山麓の道を守った' },
    { kind: 'fight', at: { x: SHIRO.x - 40, z: SHIRO.z + 20 }, obj: '山の木戸で、閉ざそうとする城の兵を押し破る', max: 100, limit: 90,
      say: [['組頭', '木戸を閉じさせるな', 3.2]],
      foes: [{ name: '木戸の城の兵', from: { x: SHIRO.x - 28, z: SHIRO.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '山の木戸を破った' },
    { kind: 'fight', at: { x: SHIRO.x - 60, z: SHIRO.z + 8 }, obj: '尼子残党の密使の道で、使いを守る足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '使いを捕らえよ', 3.2]],
      foes: [{ name: '使いを守る足軽', from: { x: SHIRO.x - 48, z: SHIRO.z - 4 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '密使の道を押さえた' },
    { kind: 'hold', at: { x: SHIRO.x + 100, z: SHIRO.z + 110 }, label: '引き揚げの浜', obj: '引き揚げの浜で、追って来る大友の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '大友が追って来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '追う大友の兵', from: { x: SHIRO.x + 112, z: SHIRO.z + 98 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '追う大友の兵', from: { x: SHIRO.x + 86, z: SHIRO.z + 124 }, list: [uS(2), uA(7)] }] }],
      reward: '引き揚げの浜を守った' },
    { kind: 'hold', at: KAIGAN, label: '多々良浜', obj: '浜まで退き、追う大友の手を受け止める', r: 18, dur: 60,
      title: '引き揚げ', sub: '勝っていても、国元を守るために引く',
      say: [['毛利元就', '九州は取れずとも、安芸と出雲を失えば元も子もない。浜まで退け、殿を固めよ', 3.6]],
      waves: [{ t: 6, say: ['大友の侍', '毛利が退くぞ！　追え！'], foes: [{ name: '大友の追撃', from: { x: KAIGAN.x - 40, z: KAIGAN.z - 30 }, list: [uS(3), uA(14)] }] }],
      reward: '多々良浜まで退き、追撃を受け止めた' },
  ],
  win: {
    banner: '多々良浜の陣を保つ', sub: '大友の攻めを押し返し、毛利は陣を保った', award: '多々良浜から兵を損なわず引き揚げた',
    say: [['小早川隆景', '大友の攻めは押し返した。陣は保ったぞ', 3.2],
      ['吉川元春', '引くも戦じゃ。出雲の乱を鎮めれば、また九州へ来られる', 3.6],
      ['組頭 与三左', '殿を支えたお主の槍で、皆が国へ帰れる', 3.2]],
  },
});
export default m06_tachibana;
