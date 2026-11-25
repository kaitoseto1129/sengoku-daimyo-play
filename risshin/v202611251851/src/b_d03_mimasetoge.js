// 武田編 三戦目「三増峠の戦い」（永禄十二年〔1569〕十月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で、北条氏照・氏邦の二万に待ち伏せられた。
//   信玄は峠を越える荷駄を守らせつつ、山県昌景の別働隊を志田峠から北条の背へ回し、挟んで破った。武田方も浅利信種が討死（『甲陽軍鑑』・愛川町の史跡の案内）。
//   主人公は荷駄を守る足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
// 11/21 cloud-10（司令塔「本人の討ち取り5以上・4〜7分」）：受けの段の始めの組に、討てる名のある組頭を一人ずつ混ぜた（d12 と同じ形・busho の討てない将は使わない）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const KONIDA = { x: 4, z: 96 };       // 荷駄の列（峠道の上り口）
const SAKA = { x: -10, z: 36 };       // 峠の坂の中ほど
const TOGE = { x: 0, z: -24 };        // 三増峠の上
const TEPPO = { x: 34, z: 66 };        // 荷駄の列の東の林（浅利信種を撃った北条の鉄砲衆・K652②）
const KOE = { x: 4, z: -72 };         // 峠を越えた北の下り口（遅れて来た北条氏政の先手を受ける所・K652②）

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：三増峠の地面（峠・両の尾根の杉・峠道）。北条編 h05 も同じ戦場を使う
export const MIMASE_LAND = {
  seed: 1569, marchMist: 60, marchMistFar: 80, time: 'day', autumn: true, fogFar: 380,
  hills: [[0, -40, 70, 30], [-110, -10, 70, 34], [110, -30, 70, 30], [70, -70, 40, 22], [-60, 90, 50, 12]],
  // 11/21 cloud-19（K563 地形・手書き）：峠道は麓の荷駄の列から坂の中ほどを折れて峠へ上る。両の尾根は丹沢の東の裾の杉と雑木の森
  paths: [{ pts: [[0, 190], [0, 140], [4, 96], [-14, 64], [-10, 36], [8, 8], [0, -24], [0, -80]], w: 3 }],
  groves: [{ x: -70, z: 10, r: 30, n: 36, kind: 'sugi' }, { x: 70, z: -10, r: 30, n: 36, kind: 'sugi' }],
  trees: 610, tufts: 1600,
};

export const d03_mimasetoge = lightBattle({
  id: 'd03_mimasetoge',
  date: '永禄十二年（1569）十月六日　晴れ　相模国 三増峠',
  intro: '小田原を囲んだ帰り道。荷駄を引いて三増峠を越える武田の列を、北条の二万が峠で待ち伏せていた。',
  history: '永禄十二年（1569）、武田信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で北条氏照・氏邦の軍に待ち伏せられた。信玄は荷駄を守らせながら山県昌景の別働隊を北条の背へ回し、挟んで破った。武田方でも浅利信種が討死した。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏照・氏邦の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 20000, b: 20000 },
  allyLook: TAKEDA, foeLook: HOJO,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: MIMASE_LAND,

  allies: [
    { name: '荷駄の守り', at: { ...KONIDA }, list: [busho('浅利信種', { mustLive: false, invuln: false }), uS(3), uA(16)] },
    { name: '武田の先手', at: { x: SPAWN.x + 14, z: SPAWN.z - 20 }, list: [busho('馬場信春'), uS(3), uA(16)] },
    { name: '武田の鉄砲衆', at: { x: SPAWN.x - 14, z: SPAWN.z - 12 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['馬場信春', '峠の上に北条の旗。待ち伏せじゃ', 3],
      ['武田信玄', '荷駄は捨てぬ。昌景は志田峠から回れ。わしらはここで北条を引きつける', 3.6]] },
    { kind: 'hold', at: KONIDA, label: '荷駄の列', obj: '峠道の荷駄を、坂から下りる北条から守る', r: 16, dur: 110,   // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：60→110秒・三の波と四の波を足した
      title: '待ち伏せ', sub: '峠の上から北条勢が下りて来る',
      say: [['浅利信種', '荷駄の兵糧は甲斐の冬の命じゃ。一俵も渡すな！', 3.2]],
      waves: [
        { t: 4, say: ['北条の侍', '荷駄を奪え！'], foes: [{ name: '北条の先手', from: { x: KONIDA.x - 8, z: KONIDA.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 大藤' } }, uS(4), uA(26)] }] },
        { t: 30, say: ['組頭', '横の林からも来るぞ！'], foes: [{ name: '北条の弓', from: { x: KONIDA.x + 30, z: KONIDA.z - 26 }, list: [uB(8), uS(2)] }] },
        { t: 58, say: ['浅利信種', '二の手が下りて来る！　荷駄の車を盾にせよ！'], foes: [{ name: '北条の二の手', from: { x: KONIDA.x - 26, z: KONIDA.z - 34 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 中山' } }, uS(3), uA(22)] }] },
        { t: 84, say: ['組頭', '後ろの道を塞ぎに回ったぞ！'], foes: [{ name: '北条の回り込み', from: { x: KONIDA.x + 18, z: KONIDA.z + 30 }, list: [uS(3), uA(16)] }] }],
      reward: '荷駄を守り抜いた' },
    // K652②（11/25 Sanae・10分に）：浅利信種は北条の鉄砲に撃たれて討死した（『甲陽軍鑑』）。本人は東の林の鉄砲衆へ斬り込む
    { kind: 'rest', dur: 8, heal: 0.4, say: [['使番', '浅利様が東の林からの鉄砲に撃たれた……！', 3], ['馬場信春', '林の鉄砲を黙らせよ。荷駄が狙い撃ちにされる', 3.2]] },
    { kind: 'fight', at: TEPPO, limit: 120, obj: '東の林の北条の鉄砲衆へ斬り込み、黙らせる', title: '林の鉄砲', sub: '林の陰から北条の鉄砲が荷駄を撃つ',
      say: [['組頭', '火縄の光を目当てに走れ！　込める間に斬り込め！', 3.2]],
      foes: [
        { name: '北条の鉄砲衆', from: { x: TEPPO.x + 8, z: TEPPO.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の鉄砲頭 富永' } }, uS(2), uG(8), uA(8)] },
        { name: '鉄砲の守りの槍', from: { x: TEPPO.x - 10, z: TEPPO.z - 16 }, list: [uS(2), uA(14)] }],
      later: [{ t: 40, say: ['組頭', '林の奥から新手！'], foes: [{ name: '林の新手', from: { x: TEPPO.x + 20, z: TEPPO.z - 20 }, list: [uS(3), uA(12)] }] }],
      reward: '林の鉄砲衆を黙らせた' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '鉄砲は黙った。傷を縛れ、坂へ上るぞ', 2.8]] },
    // 11/21 cloud-41（章の通し）：坂の段が385秒かかり725秒になった回がある。斬り合いの段に上限150秒（六割崩していれば済）
    { kind: 'fight', at: SAKA, limit: 150, obj: '坂の中ほどで、北条の二の手を押し返す', title: '峠の坂', sub: '坂の上の北条が槍を揃えて押して来る',
      say: [['使番', '浅利様、お討死……！　馬場様の備へ加われ！', 3.2]],
      foes: [{ name: '北条氏邦の手', from: { x: SAKA.x, z: SAKA.z - 16 }, list: [busho('北条の侍大将', { mustLive: false, invuln: false }), uS(5), uA(29)] }],
      reward: '坂で北条を押し返した' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '坂は押し返した。傷を縛れ。峠の上へかかるぞ', 2.8]] },   // K652②：段が増え、坂から息を継がずに峠の上へ入って倒れた回がある（act bot 11/25）
    { kind: 'fight', at: TOGE, limit: 150, obj: '回り込んだ山県の赤備えと、峠の上の北条を挟む', title: '赤備え', sub: '志田峠から山県昌景の赤備えが北条の背に現れる',
      say: [['物見', '志田峠に赤い旗！　山県様の備が北条の背へ！', 3.2], ['馬場信春', '今じゃ、挟め！', 2.6]],
      foes: [{ name: '北条氏照の本隊', from: { x: TOGE.x, z: TOGE.z - 8 }, list: [uS(6), uA(29), uG(4)] }],
      later: [{ t: 10, say: ['山県昌景', '赤備え、背から突け！'], foes: [] }],
      reward: '峠の上の北条を崩した' },
    // K652②：北条氏政の本隊は荻野まで来ていたが間に合わなかった。武田は峠を越え、追って来た氏政の先手を払って甲斐へ退いた（『甲陽軍鑑』）
    { kind: 'rest', dur: 8, heal: 0.7, say: [['物見', '南から北条氏政の本隊の旗！　荻野まで来ておりまする！', 3.2], ['武田信玄', '峠を越えよ。追う先手だけ払って甲斐へ帰る', 3.2]] },
    { kind: 'hold', at: KOE, label: '峠の下り口', obj: '峠の下り口で、追って来る北条氏政の先手を払い、荷駄を通す', r: 16, dur: 70,
      title: '退き', sub: '氏政の先手が峠を越えて追って来る',
      say: [['馬場信春', '荷駄が下り切るまで、ここを持て', 3]],
      waves: [
        { t: 5, say: ['北条の侍', '甲斐へ帰すな！　荷駄を奪え！'], foes: [{ name: '北条氏政の先手', from: { x: KOE.x + 4, z: KOE.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 笠原' } }, uS(2), uA(14)] }] },
        { t: 34, say: ['組頭', '峠の脇の道からも来る！'], foes: [{ name: '北条の脇の手', from: { x: KOE.x - 20, z: KOE.z + 24 }, list: [uS(1), uA(10), uB(4)] }] }],
      reward: '荷駄を峠の向こうへ通した' },
  ],
  win: {
    banner: '三増峠の勝ち', sub: '北条は崩れ、武田は荷駄と共に甲斐へ帰った', award: '三増峠で北条を破った',
    say: [['山県昌景', '北条は崩れた。追うには及ばぬ', 3],
      ['武田信玄', '浅利を失うた。だが荷駄は守った。甲斐へ帰るぞ', 3.4]],
  },
});
export default d03_mimasetoge;
