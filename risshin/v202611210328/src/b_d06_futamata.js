// 武田編 六戦目「二俣城攻め」（元亀三年〔1572〕十月〜十二月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：西上作戦の信玄は、徳川方の中根正照が守る遠江の二俣城を勝頼・信豊らに攻めさせた。城は天竜川と二俣川に囲まれた崖の上で、
//   大手からは落ちなかった。城兵は天竜川の崖に井楼（つるべの櫓）を組んで水を汲んでいたので、武田は上流から筏を流して井楼を壊し、
//   水の手を断って開城させた（『三河物語』『甲陽軍鑑』・浜松市の史跡の案内）。主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 140 };
const RIVER = [[-220, -120], [-100, -112], [0, -118], [100, -110], [220, -116]];   // 天竜川（城の北の崖の下）
const OTE = { x: 8, z: 60 };          // 大手の前
const KAMI = { x: -60, z: -96 };      // 天竜川の上流の岸（筏を流す所）
const IROU = { x: 10, z: -96 };       // 井楼（水の手）の崖の下
const OTE2 = { x: 4, z: 20 };         // 開城を迫る大手の口

export const d06_futamata = lightBattle({
  id: 'd06_futamata',
  date: '元亀三年（1572）十二月　晴れ　遠江国 二俣城',
  intro: '天竜川の崖の上の二俣城は、大手から攻めても落ちぬ。城の水は、崖に組んだ井楼から天竜川で汲んでいる。',
  history: '元亀三年（1572）、西上作戦の武田信玄は、徳川方の中根正照が守る二俣城を勝頼らに攻めさせた。城は大手から落ちず、武田は天竜川の上流から筏を流して城の水の手の井楼を壊し、水を断って開城させた。この後、信玄は三方ヶ原で家康と戦う。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '中根正照の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 1200 },
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1572, time: 'day', winter: true, fogFar: 420,
    river: RIVER, riverW: 26, riverDepth: 1.2,
    hills: [[0, -40, 44, 24], [-130, -20, 70, 26], [130, -10, 70, 24], [70, 110, 40, 8]],
    trees: 560, tufts: 1600,
  },
  allies: [
    { name: '武田勝頼の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, list: [busho('武田勝頼'), uS(4), uA(16)] },
    { name: '武田信豊の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [busho('武田信豊'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '大手を攻めても、崖の上の城は落ちぬ', 3],
      ['武田信豊', '城の水は天竜川の井楼から汲んでおる。あれを壊せば城は渇く', 3.4]] },
    { kind: 'hold', at: OTE, label: '大手の前', obj: '大手の前で城兵の打って出を受け、城の目を引きつける', r: 16, dur: 50,
      title: '大手', sub: '城兵が門を開けて打って出る',
      say: [['組頭', '大手で騒げ。城の目をこちらへ引きつけよ！', 3]],
      waves: [
        { t: 6, say: ['徳川の侍', '甲斐の者を追い払え！'], foes: [{ name: '大手の打って出', from: { x: OTE.x, z: OTE.z - 26 }, list: [uS(4), uA(22)] }] },
        { t: 28, say: ['組頭', '門の上から鉄砲！'], foes: [{ name: '大手の鉄砲', from: { x: OTE.x + 12, z: OTE.z - 30 }, list: [uG(6)] }] }],
      reward: '大手で城の目を引きつけた' },
    { kind: 'move', at: KAMI, label: '天竜川の上流の岸', obj: '天竜川の上流へ回り、筏を流す', r: 14,
      say: [['武田信豊', '筏を組め。流れに乗せて井楼へぶつけるぞ', 3.2]] },
    { kind: 'fight', at: IROU, obj: '井楼の崖の下で、水の手を守る城兵を払う', title: '水の手', sub: '筏が井楼に当たる。崖の下に城兵が下りて来る',
      say: [['物見', '筏が井楼に当たった！　柱が折れるぞ！', 3.2], ['徳川の侍', '水の手を守れ！', 2.6]],
      foes: [
        { name: '水の手の守り', from: { x: IROU.x + 8, z: IROU.z + 10 }, list: [uS(4), uA(22)] },
        { name: '崖の上の弓', from: { x: IROU.x - 10, z: IROU.z + 20 }, list: [uB(6)] }],
      reward: '水の手を断った' },
    { kind: 'fight', at: OTE2, obj: '大手の口へ寄せ、渇いた城に開城を迫る', title: '開城を迫る', sub: '水を断たれた城兵が最後に打って出る',
      say: [['武田勝頼', '水の無い城は持たぬ。最後の一押しじゃ', 3]],
      foes: [{ name: '中根正照の手', from: { x: OTE2.x, z: OTE2.z - 12 }, list: [busho('中根正照'), uS(5), uA(19)] }],
      reward: '二俣城を開城させた' },
  ],
  win: {
    banner: '二俣城 開城', sub: '中根正照は城を明け渡し浜松へ退いた。道は三方ヶ原へ', award: '二俣城を開城させた',
    say: [['使番', '中根殿、城を明け渡し、浜松へ退くと', 3],
      ['武田勝頼', '次は家康じゃ。浜松の前を通って、出て来るか見てやろう', 3.4]],
  },
});
export default d06_futamata;
