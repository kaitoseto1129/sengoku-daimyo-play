// 武田編 八戦目「野田城攻め」（元亀四年〔1573〕正月〜二月）。軽い型（light_battle.js）・型は豊臣編の岩石城（城の前の段と水の手）
//   史実：三方ヶ原で家康を破った信玄は三河へ入り、菅沼定盈の守る野田城（豊川の東の小さな城）を囲んだ。
//   城は小さいが堅く、信玄は甲斐の金掘り衆に城の井戸の水脈を掘り断たせた。水の手を失った城は二月に開き、定盈は捕らえられた。
//   この陣中で信玄の病が重くなり、武田勢は長篠へ退き、信玄は四月に甲斐へ帰る途中で没した（城中の笛を聴いていて撃たれたという話は後の言い伝え）。
//   出所：Wikipedia「野田城の戦い」・新城市の野田城跡の案内。くわしくは docs/chapter_takeda.md・docs/journey/d08_noda.md
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const NODA = { flag: 'tokugawa', armor: 0x2a2a2e };   // 菅沼定盈（徳川方）
const SPAWN = { x: 0, z: -120 };
const RIVER = [[-120, -220], [-110, -100], [-118, 0], [-104, 100], [-112, 220]];   // 豊川（城の西）
const CASTLE = { x: 10, z: 70 };        // 野田城の丘（本丸）
const CAMP = { x: 4, z: -70 };          // 武田の囲みの陣（城の南）
const MINE = { x: -20, z: 4 };          // 金掘りの坑口（城の南西の崖下）
const SOTO = { x: 18, z: 30 };          // 城の外の柵（外郭）
const OTE = { x: 10, z: 52 };           // 大手の門（開城を受け取る所）

export const d08_noda = lightBattle({
  id: 'd08_noda',
  date: '元亀四年（1573）正月　冬・晴れ　三河国 野田',
  intro: '三方ヶ原で徳川家康を破った武田信玄は、三河の野田城を囲んだ。城は小さいが堅い。甲斐の金掘り衆が城の水の手を掘り断ちにかかる。',
  history: '元亀四年（1573）正月、武田信玄は菅沼定盈の守る三河の野田城を囲んだ。城は小さいが堅く、信玄は甲斐の金掘り衆に城の井戸の水脈を断たせた。水の手を失った城は二月に開いたが、この陣中で信玄の病は重くなり、武田勢は兵を退いた。信玄は四月、甲斐へ帰る途中で没した。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '野田城の城兵（菅沼定盈）', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 500 },
  allyLook: TAKEDA, foeLook: NODA,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1573, time: 'day', winter: true, fogFar: 440,
    river: RIVER, riverW: 16, riverDepth: 0.7,
    hills: [[CASTLE.x, CASTLE.z, 30, 16], [CASTLE.x + 30, CASTLE.z + 20, 26, 10], [120, -40, 60, 14], [-60, 160, 50, 12], [80, -190, 60, 10]],
    trees: 480, tufts: 1800,
  },
  allies: [
    { name: '武田信玄の旗本', at: { x: CAMP.x - 16, z: CAMP.z - 12 }, fixed: true, list: [busho('武田信玄'), uS(6), uA(10)] },
    { name: '山県昌景の手', at: { x: MINE.x + 14, z: MINE.z - 10 }, dmg: 0.2, list: [busho('山県昌景'), uS(3), uA(14)] },
    { name: '甲斐の金掘り衆の守り', at: { x: MINE.x - 8, z: MINE.z - 6 }, dmg: 0.2, list: [uS(2), uA(16)] },
    { name: '武田の鉄砲衆', at: { x: MINE.x + 22, z: MINE.z - 18 }, dmg: 0.2, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['武田信玄', '小さき城よ。されど、力で攻めれば兵を損なう', 3.4],
      ['山県昌景', '甲斐の金掘りに、城の井戸の水を断たせまする', 3.4],
      ['武田信玄', '囲みの陣へ寄れ。金掘りの者どもを城兵から守れ', 3.2]] },
    { kind: 'move', at: CAMP, label: '囲みの陣', obj: '城の南の、囲みの陣へ寄る', r: 14,
      say: [['組頭', '竹束を前へ。城の鉄砲の届く所では頭を下げよ', 3]] },
    { kind: 'hold', at: MINE, label: '金掘りの坑口', obj: '金掘りの坑口を、打って出た城兵から守る', r: 16, dur: 135,   // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：90→135秒・三の手を足した
      title: '水の手', sub: '城兵が金掘りの坑口を潰しに打って出る',
      say: [['金掘りの頭', '水の脈はこの下じゃ。あと少し掘らせてくだされ！', 3.2]],
      waves: [
        { t: 6, say: ['野田の城兵', '穴を埋めよ！　水の手を守れ！'], foes: [{ name: '野田の城兵', from: { x: MINE.x + 12, z: MINE.z + 24 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', '崖の上から鉄砲が来る！　坑口の前を固めよ！'], foes: [{ name: '野田の鉄砲', from: { x: MINE.x - 10, z: MINE.z + 26 }, list: [uS(2), uA(8), uG(5)] }] },
        { t: 58, say: ['野田の城兵', '水の手を失えば城は終わりじゃ！　皆出よ！'], foes: [{ name: '野田の城兵の二の手', from: { x: MINE.x + 26, z: MINE.z + 18 }, list: [uS(3), uA(14)] }] },
        { t: 86, say: ['組頭', '坑口の上の崖からも下りて来る！'], foes: [{ name: '野田の城兵の三の手', from: { x: MINE.x - 22, z: MINE.z + 20 }, list: [uS(3), uA(16)] }] }],
      reward: '金掘りの坑口を守り抜いた' },
    { kind: 'fight', at: SOTO, obj: '城の外の柵を破り、城兵を本丸へ追い込む', title: '外郭', sub: '城兵が外の柵に籠もる',
      say: [['山県昌景', '水を断たれた城は長くは持たぬ。外の柵を破り、本丸へ押し込めよ', 3.4]],
      foes: [
        { name: '外郭の城兵', from: { x: SOTO.x, z: SOTO.z + 10 }, list: [uS(3), uA(20)] },
        { name: '外郭の弓', from: { x: SOTO.x + 16, z: SOTO.z + 14 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '城の脇の門から新手じゃ！'], foes: [{ name: '城の脇の手', from: { x: SOTO.x - 26, z: SOTO.z + 12 }, list: [uS(2), uA(10)] }] },
        { t: 75, say: ['野田の城兵', '本丸へは一歩も入れぬ！'], foes: [{ name: '本丸の前の城兵', from: { x: SOTO.x + 8, z: SOTO.z + 22 }, list: [uS(3), uA(14)] }] }],
      reward: '外の柵を破り、城兵を本丸へ追い込んだ' },
    { kind: 'rest', dur: 10, heal: 0.3, say: [
      ['武田の使番', '城から使いが来た！　菅沼定盈、城を明け渡すとのこと', 3.4],
      ['山県昌景', '……お屋形様のお加減が優れぬ。開城を受け取ったら、すぐに兵をまとめよ', 3.4]] },
    { kind: 'move', at: OTE, label: '大手の門', obj: '大手の門へ進み、開城を受け取る', r: 12,
      say: [['組頭', '城兵に手を出すな。開いた城を受け取るだけじゃ', 3]] },
  ],
  win: {
    banner: '野田城の開城', sub: '水の手を断たれ、野田城は開いた', award: '野田城の水の手を断ち、開城させた',
    say: [['山県昌景', '城は取った。されど、お屋形様のお体が……', 3.4],
      ['武田信玄', '構わぬ。長篠まで兵を退き、しばし休む', 3.2]],
  },
});
export default d08_noda;
