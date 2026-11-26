// 北条家編 八戦目「三増峠の戦い」（永禄十二年〔1569〕十月六日・相模国 三増峠）。軽い型（light_battle.js）・K647（docs/house_hojo.md ②'）
//   武田編 d03_mimasetoge の同じ戦の、北条の側（氏照・氏邦の手）。
//   史実：小田原から帰る武田を、北条氏照・氏邦が三増峠で待ち伏せた。武田は荷駄を守らせつつ、山県昌景の別手を志田峠から北条の背へ回して挟み、北条は崩れた。
//   武田方も浅利信種が討死した。氏康・氏政の本隊は間に合わなかった（『甲陽軍鑑』B・愛川町の解説 C）。
//   主人公は氏照の手。①峠から荷駄の列を突く ②坂で武田の押し返しを受ける ③背に回った赤備えを受けて、味方を半原へ退かせる（負け戦の殿）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { MIMASE_LAND, konidaDress } from './b_d03_mimasetoge.js';   // K651：武田編 d03 の三増峠の地面をそのまま使う（同じ戦は一つの戦場に）
// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に。良い方を元にする」）：前の別の地面（峠が +z）をやめ、武田編 d03 の三増峠（峠が −z・
//   麓 +z から峠道が上がる）に載せた。北条の陣は峠の上、武田の荷駄は峠道の中ほど。前の段の向きは z を裏返して写した（段・台詞・数は同じ）

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const SPAWN = { x: 0, z: -40 };       // 三増峠の上の北条の陣
const KONIDA = { x: -14, z: 64 };     // 峠道の荷駄の列（d03 の峠道の折れ目）
const SAKA = { x: -10, z: 20 };       // 北条の陣の下の坂
const SHINGARI = { x: 20, z: -4 };    // 半原へ退く道（峠の東の肩）

export const h05_mimase = lightBattle({
  id: 'h05_mimase',
  date: '永禄十二年（1569）十月六日　晴れ　相模国 三増峠',
  intro: '小田原から帰る武田の列を、峠で待ち伏せる。氏康様の本隊が着くまで、武田を足止めする。',
  history: '永禄十二年（1569）、小田原から甲斐へ帰る武田信玄の軍を、北条氏照・氏邦が三増峠で待ち伏せた。信玄は山県昌景の別手を志田峠から北条の背へ回して挟み、北条は崩れた。氏康・氏政の本隊は間に合わなかった。武田方でも浅利信種が討死した。',
  sides: { a: { name: '北条氏照・氏邦の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 20000, b: 20000 },
  allyLook: HOJO, foeLook: TAKEDA,
  friendsSend: 2,
  minutes: 6,
  playerTaken: 0.45,   // 信長で出陣の試し（act bot の一回目）でも倒れ切らないように（h02 より寄せが厚い戦が多い）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: { ...MIMASE_LAND, marchMist: 0, sky: { clearAir: true } },   // 11/26 せ：晴れの日。北条は峠で待つ側なので武田の進軍の朝靄（d03 の marchMist）は掛けず、荷駄の列が霞に消えないように
  setup: (rt) => { konidaDress(rt, SPAWN.x, SPAWN.z - 6); },

  allies: [
    { name: '北条氏照の手', at: { x: SPAWN.x + 14, z: SPAWN.z + 10 }, list: [busho('北条氏照'), uS(3), uA(14)] },
    { name: '北条氏邦の手', at: { x: SPAWN.x - 16, z: SPAWN.z + 8 }, list: [busho('北条氏邦'), uS(3), uA(14)] },
    { name: '北条の鉄砲衆', at: { x: KONIDA.x - 10, z: KONIDA.z - 30 }, list: [uS(1), uG(8)] },
    { name: '北条の先手', at: { x: KONIDA.x + 12, z: KONIDA.z - 26 }, face: 0, list: [uS(2), uA(12)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏照', '武田の列が峠道を上がって来る。荷駄を突け', 3.2],
      ['北条氏邦', '父上の本隊が来るまで、武田を峠に留めるのじゃ', 3.2]] },
    { kind: 'fight', at: KONIDA, limit: 150, obj: '峠から駆け下り、武田の荷駄の列を突く', title: '待ち伏せ', sub: '荷駄の列が峠道に伸びている',
      say: [['組頭', '荷駄を奪え！　武田の冬の兵糧じゃ！', 3]],
      foes: [{ name: '荷駄の守り', from: { x: KONIDA.x, z: KONIDA.z + 10 }, list: [busho('武田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(16)] }],
      later: [{ t: 34, say: ['武田の侍', '荷駄を守れ！　一俵も渡すな！'], foes: [{ name: '武田の加勢', from: { x: KONIDA.x + 24, z: KONIDA.z + 26 }, list: [uS(1), uA(10)] }] }],
      reward: '武田の荷駄の列を突いた' },
    { kind: 'hold', at: SAKA, label: '陣の下の坂', obj: '陣の下の坂で、武田の押し返しを受け止める', r: 16, dur: 80, title: '押し返し', sub: '馬場信春の備が坂を上って来る',
      say: [['北条氏照', '坂を守れ！　上を取っておるのはわしらじゃ！', 3]],
      waves: [
        { t: 4, say: ['武田の侍', '坂を上がれ！　北条を峠から落とせ！'], foes: [{ name: '馬場信春の備', from: { x: SAKA.x - 6, z: SAKA.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭 土屋' } }, uS(3), uA(20)] }] },
        // K652⑥ 逸話の段：武田の左の備を率いた浅利信種は、北条の鉄砲に当たって討死した（『甲陽軍鑑』B）。本人は鉄砲衆の前で、浅利の手を受けて斬る
        { t: 40, say: ['組頭', 'あの指物は浅利信種じゃ！　鉄砲衆、狙え！　わしらは槍で止めよ！'], foes: [{ name: '浅利信種の手', from: { x: SAKA.x + 30, z: SAKA.z + 30 }, list: [busho('浅利信種', { mustLive: false, invuln: false }), uS(1), uG(6), uA(4)] }] }],
      reward: '坂で武田の押し返しを受け止めた' },
    { kind: 'hold', at: SHINGARI, label: '退く道', obj: '背に回った赤備えを受け、味方が半原へ退く間を作る', r: 16, dur: 70, title: '赤備え', sub: '志田峠から山県昌景の赤備えが背に現れた',
      say: [['物見', '後ろに赤い旗！　山県の赤備えじゃ！', 3], ['北条氏照', '……挟まれた。半原へ退け。殿を頼む', 3.2]],
      waves: [
        { t: 4, say: ['山県昌景', '赤備え、背から突け！'], foes: [{ name: '山県昌景の赤備え', from: { x: SHINGARI.x + 44, z: SHINGARI.z - 36 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭 広瀬' } }, uS(3), uA(18)] }] },
        { t: 36, foes: [{ name: '赤備えの二の手', from: { x: SHINGARI.x - 40, z: SHINGARI.z - 40 }, list: [uS(2), uA(12)] }] }],
      reward: '殿を務め、味方を半原へ退かせた' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '浅利信種、鉄砲に当たって討死！　されど赤備えが峠を回り込みまする', 3.4],
      ['北条氏照', '半原へ退く。追う武田を払いながら下れ', 3.2]] },
    { kind: 'fight', at: { x: 46, z: -40 }, limit: 140, obj: '半原への道で、追って来る武田の手を払う', title: '退き口', sub: '武田の追手が峠の肩を越える',
      say: [['組頭', '振り向いて一度だけ突け。追手が止まる', 3]],
      foes: [{ name: '武田の追手', from: { x: 34, z: -24 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭' } }, uS(3), uA(16)] }],
      later: [{ t: 28, say: ['見張り', '赤備えの騎馬じゃ！'], foes: [{ name: '赤備えの騎馬', from: { x: 70, z: -20 }, list: [{ type: 'cavalry', n: 4 }, uS(2), uA(8)] }] }],
      reward: '半原への道で武田の追手を払った' },
    { kind: 'hold', at: { x: 66, z: -84 }, label: '半原の口', obj: '半原の口で、味方が退き終えるまで武田を受け止める', r: 16, dur: 70, title: '半原', sub: '氏政様の本隊は荻野まで来ている',
      say: [['北条氏照', 'ここを持てば、皆が荻野へ下れる', 3]],
      waves: [
        { t: 3, foes: [{ name: '武田の寄せ', from: { x: 54, z: -50 }, list: [uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '武田の弓じゃ！'], foes: [{ name: '武田の弓', from: { x: 86, z: -52 }, list: [uS(1), uB(8), uA(6)] }] }],
      reward: '半原の口で味方が退き終えるまで持った' },
  ],
  win: {
    banner: '三増峠の負け戦', sub: '北条は崩れたが、殿で味方を退かせた', award: '負け戦の殿を務めた',
    say: [['北条氏邦', '父上の本隊は間に合わなんだ。じゃが兵は残った', 3.4],
      ['組頭', '負けて生きて帰るのも、足軽の手柄じゃ', 3]],
  },
});
export default h05_mimase;
