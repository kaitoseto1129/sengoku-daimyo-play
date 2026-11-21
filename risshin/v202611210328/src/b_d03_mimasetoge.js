// 武田編 三戦目「三増峠の戦い」（永禄十二年〔1569〕十月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で、北条氏照・氏邦の二万に待ち伏せられた。
//   信玄は峠を越える荷駄を守らせつつ、山県昌景の別働隊を志田峠から北条の背へ回し、挟んで破った。武田方も浅利信種が討死（『甲陽軍鑑』・愛川町の史跡の案内）。
//   主人公は荷駄を守る足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const KONIDA = { x: 4, z: 96 };       // 荷駄の列（峠道の上り口）
const SAKA = { x: -10, z: 36 };       // 峠の坂の中ほど
const TOGE = { x: 0, z: -24 };        // 三増峠の上

export const d03_mimasetoge = lightBattle({
  id: 'd03_mimasetoge',
  date: '永禄十二年（1569）十月六日　晴れ　相模国 三増峠',
  intro: '小田原を囲んだ帰り道。荷駄を引いて三増峠を越える武田の列を、北条の二万が峠で待ち伏せていた。',
  history: '永禄十二年（1569）、武田信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で北条氏照・氏邦の軍に待ち伏せられた。信玄は荷駄を守らせながら山県昌景の別働隊を北条の背へ回し、挟んで破った。武田方でも浅利信種が討死した。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏照・氏邦の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 20000, b: 20000 },
  allyLook: TAKEDA, foeLook: HOJO,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1569, time: 'day', autumn: true, fogFar: 380,
    hills: [[0, -40, 70, 30], [-110, -10, 70, 34], [110, -30, 70, 30], [70, -70, 40, 22], [-60, 90, 50, 12]],
    trees: 680, tufts: 1600,
  },
  allies: [
    { name: '荷駄の守り', at: { ...KONIDA }, list: [busho('浅利信種', { mustLive: false, invuln: false }), uS(3), uA(16)] },
    { name: '武田の先手', at: { x: SPAWN.x + 14, z: SPAWN.z - 20 }, list: [busho('馬場信春'), uS(3), uA(16)] },
    { name: '武田の鉄砲衆', at: { x: SPAWN.x - 14, z: SPAWN.z - 12 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['馬場信春', '峠の上に北条の旗。待ち伏せじゃ', 3],
      ['武田信玄', '荷駄は捨てぬ。昌景は志田峠から回れ。わしらはここで北条を引きつける', 3.6]] },
    { kind: 'hold', at: KONIDA, label: '荷駄の列', obj: '峠道の荷駄を、坂から下りる北条から守る', r: 16, dur: 60,
      title: '待ち伏せ', sub: '峠の上から北条勢が下りて来る',
      say: [['浅利信種', '荷駄の兵糧は甲斐の冬の命じゃ。一俵も渡すな！', 3.2]],
      waves: [
        { t: 4, say: ['北条の侍', '荷駄を奪え！'], foes: [{ name: '北条の先手', from: { x: KONIDA.x - 8, z: KONIDA.z - 40 }, list: [uS(4), uA(26)] }] },
        { t: 30, say: ['組頭', '横の林からも来るぞ！'], foes: [{ name: '北条の弓', from: { x: KONIDA.x + 30, z: KONIDA.z - 26 }, list: [uB(8), uS(2)] }] }],
      reward: '荷駄を守り抜いた' },
    { kind: 'fight', at: SAKA, obj: '坂の中ほどで、北条の二の手を押し返す', title: '峠の坂', sub: '坂の上の北条が槍を揃えて押して来る',
      say: [['使番', '浅利様、お討死……！　馬場様の備へ加われ！', 3.2]],
      foes: [{ name: '北条氏邦の手', from: { x: SAKA.x, z: SAKA.z - 16 }, list: [busho('北条の侍大将', { mustLive: false, invuln: false }), uS(5), uA(29)] }],
      reward: '坂で北条を押し返した' },
    { kind: 'fight', at: TOGE, obj: '回り込んだ山県の赤備えと、峠の上の北条を挟む', title: '赤備え', sub: '志田峠から山県昌景の赤備えが北条の背に現れる',
      say: [['物見', '志田峠に赤い旗！　山県様の備が北条の背へ！', 3.2], ['馬場信春', '今じゃ、挟め！', 2.6]],
      foes: [{ name: '北条氏照の本隊', from: { x: TOGE.x, z: TOGE.z - 8 }, list: [uS(6), uA(29), uG(4)] }],
      later: [{ t: 10, say: ['山県昌景', '赤備え、背から突け！'], foes: [] }],
      reward: '峠の上の北条を崩した' },
  ],
  win: {
    banner: '三増峠の勝ち', sub: '北条は崩れ、武田は荷駄と共に甲斐へ帰った', award: '三増峠で北条を破った',
    say: [['山県昌景', '北条は崩れた。追うには及ばぬ', 3],
      ['武田信玄', '浅利を失うた。だが荷駄は守った。甲斐へ帰るぞ', 3.4]],
  },
});
export default d03_mimasetoge;
