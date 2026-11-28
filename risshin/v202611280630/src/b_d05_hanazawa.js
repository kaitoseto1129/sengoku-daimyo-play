// 武田編 五戦目「花沢城攻め」（元亀元年〔1570〕一月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：駿河の今川方の小原鎮実（資良）が籠もる山の上の花沢城を、信玄は正月に攻めた。城兵は険しい坂で強く守り、
//   寄せ手にも名のある者の討死・手負いが多く出た（勝頼・山県も坂で苦戦した）が、ついに開城させた（『甲陽軍鑑』・焼津市の史跡の案内）。
//   主人公は坂を上る寄せ手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
// 11/21 cloud-10（司令塔「本人の討ち取り5以上・4〜7分」）：受けの段の始めの組に、討てる名のある組頭を一人ずつ混ぜた（d12 と同じ形・busho の討てない将は使わない）
import { withCastle } from './light_castle.js';
import { HANAZAWA_PLAN } from './castles/hanazawa.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const IMAGAWA = { flag: 'imagawa', armor: 0x2e2a26 };
const SPAWN = { x: 0, z: 140 };
const FUMOTO = { x: 4, z: 84 };       // 麓の口
const SAKA = { x: -6, z: 34 };        // 七曲りの坂
const KOGUCHI = { x: 2, z: -6 };      // 城の虎口
const HON = { x: 0, z: -40 };         // 本曲輪
const TANI = { x: 46, z: 40 };         // 城の東の谷（水の手の井戸・K652②）
const NINO = { x: -4, z: -22 };       // 虎口の内の二の曲輪（K652②）

// 11/21 クラウド35（K563 ③の質）：花沢城（本曲輪・二ノ曲輪と大堀切）を置く（castles/hanazawa.js・出所 docs/battle_refs/hanazawa.md）。遠景の軽い形
export const d05_hanazawa = withCastle(lightBattle({
  id: 'd05_hanazawa',
  date: '元亀元年（1570）一月　雪まじりの晴れ　駿河国 花沢城',
  intro: '駿河の花沢城は、細い七曲りの坂の上。今川の小原鎮実が、最後の今川の城として籠もる。',
  history: '元亀元年（1570）正月、武田信玄は駿河の今川方の花沢城を攻めた。城は険しい坂の上にあり、城兵は強く守って寄せ手に多くの討死・手負いが出たが、ついに開城させた。これで駿河の今川方の城はほぼ尽きた。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '小原鎮実の城兵', mon: 'imagawa', faction: 'imagawa' } },
  force: { a: 12000, b: 1000 },
  allyLook: TAKEDA, foeLook: IMAGAWA,
  friendsSend: 2,   // K652②（11/25）：段が六つになり、一組だと本人が水の手と虎口で囲まれて倒れた（act bot 二回）。近い二組を出す
  //   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1570, snow: 0.25, time: 'day', winter: true, fogFar: 380,
    hills: [[0, -36, 50, 34], [-80, -10, 60, 26], [90, 0, 60, 24], [0, 30, 40, 14]],
    // 11/21 cloud-19（K563 地形・手書き）：焼津の北の谷。谷の底を小川が南へ流れ、麓の口から七曲りの坂が虎口へ折れて上る。谷の両の斜面は杉の森
    river: [[46, -140], [40, -60], [52, 40], [44, 120], [50, 220]], riverW: 6, riverDepth: 0.3,
    paths: [{ pts: [[0, 190], [0, 140], [4, 84], [-14, 60], [8, 46], [-6, 34], [10, 14], [2, -6], [0, -40]], w: 2.4 }],
    groves: [{ x: -60, z: 20, r: 30, n: 34, kind: 'sugi' }, { x: 80, z: -20, r: 28, n: 30, kind: 'sugi' }],
    trees: 640, tufts: 1200,
  },
  allies: [
    { name: '武田の先手', at: { x: SPAWN.x + 10, z: SPAWN.z - 10 }, list: [busho('山県昌景'), uS(3), uA(16)] },
    { name: '武田勝頼の手', at: { x: SPAWN.x - 12, z: SPAWN.z - 6 }, list: [busho('武田勝頼'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['山県昌景', '坂は七つ曲がる。上から石と矢が来る。止まれば狙い撃ちじゃ', 3.4],
      ['武田勝頼', '今川の最後の城。ここを落とせば駿河は武田の物', 3.2]] },
    { kind: 'fight', at: FUMOTO, obj: '麓の口の柵を守る城兵を払う', title: '麓の口', sub: '坂の下の柵に城兵が出ている',
      say: [['今川の侍', '坂へ寄せさせるな！', 2.8]],
      foes: [{ name: '麓の守り', from: { x: FUMOTO.x, z: FUMOTO.z - 12 }, list: [uS(3), uA(22), uB(4)] }],
      reward: '麓の口を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: FUMOTO.x - 14, z: FUMOTO.z - 16 }, obj: '麓の口の先で、柵の内の今川の弓を討つ', limit: 90,
      say: [['組頭', '柵の内に弓がおる。盾を上げて寄れ', 3.2]],
      foes: [{ name: '柵の内の今川の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: FUMOTO.x - 14, z: FUMOTO.z - 16 }), list: [uS(2), uA(6), uB(5)] }],
      reward: '柵の内の弓を討った' },
    // K652②（11/25 Sanae・10分に）：山城の花沢は谷の井戸から水を汲んだ。坂を攻める前に東の谷の水の手を断つ（囲みの定石・山県の手）
    { kind: 'rest', dur: 8, heal: 0.4, say: [['山県昌景', '坂を攻める前に、東の谷の水の手を断て。渇けば城兵の槍も鈍る', 3.4]] },
    { kind: 'fight', at: TANI, limit: 120, obj: '東の谷へ回り、水の手を守る城兵を払う', title: '谷の水の手', sub: '谷の井戸を城兵が守る',
      say: [['今川の侍', '水の手を渡すな！', 2.8]],
      foes: [
        { name: '水の手の守り', from: { x: TANI.x + 6, z: TANI.z - 14 }, list: [{ type: 'samurai', n: 1, o: { name: '今川の組頭 由比' } }, uS(2), uA(14)] },
        { name: '谷の上の弓', from: { x: TANI.x - 10, z: TANI.z - 22 }, list: [uB(6)] }],
      later: [{ t: 40, say: ['組頭', '城から助けが下りて来る！'], foes: [{ name: '水の手の助け', from: { x: TANI.x + 18, z: TANI.z - 24 }, list: [uS(1), uA(10)] }] }],
      reward: '谷の水の手を断った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TANI.x - 14, z: TANI.z - 14 }, obj: '谷の上の物見台から下りる今川の兵を討つ', limit: 90,
      say: [['物見', '物見台から兵が下りて来る！', 3.2]],
      foes: [{ name: '物見台から下りる今川の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: TANI.x - 14, z: TANI.z - 14 }), list: [uS(2), uA(10)] }],
      reward: '物見台の兵を討った' },
    // 11/27 クラウドす（K722④）：夜討ちの段が昼の空のまま『夜が更けた』の台詞だけだった→この一息で日を暮れさせ（時の飛ぶ段なのですぐ替える）、押し返した後は次の七曲りの段の始めから夜明けへ移ろわせる（段を足すと味方の組が麓に留まり、二の曲輪で本人が倒れた・act bot 二回）
    { kind: 'rest', dur: 8, heal: 0.8, say: [['組頭', '水の手は断った。息を継げ、七曲りへ戻るぞ', 2.8]],   // 夜は見通しが利かず足が鈍る（terrain_tags 0.9）分、傷を多めに縛る
      fn: (r) => { const W = r.world; if (W?.setTime && W.timeKey !== 'night') { W.dayClock = null; W.setTime('night', true); } } },
    // K722 ④：要件書「城方が夜に打って出る→武田側が押し返す」。水を断たれた城兵が闇に紛れて麓の陣へ出る（二の丸の死に物狂いとは別の、夜の一夜討ち）
    { kind: 'hold', at: FUMOTO, label: '麓の陣', obj: '夜、麓の陣へ打って出る城兵を押し返す', r: 16, dur: 50,
      title: '夜討ち', sub: '渇いた城兵が闇に紛れて下りて来る',
      say: [['見張り', '夜が更けた。城の木戸が開く音がする！', 3]],
      waves: [
        { t: 5, say: ['今川の侍', '水を取り返せ！　闇へ紛れよ！'], foes: [{ name: '夜討ちの城兵', from: { x: FUMOTO.x - 6, z: FUMOTO.z - 26 }, list: [uS(2), uA(12)] }] },
        { t: 28, say: ['山県昌景', '追うな。陣の前で押し返せ。夜明けまで持てばよい', 3.2], foes: [{ name: '夜討ちの二の手', from: { x: FUMOTO.x + 12, z: FUMOTO.z - 24 }, list: [uS(2), uA(10)] }] }],
      reward: '夜討ちを押し返した' },
    { kind: 'hold', at: SAKA, label: '七曲りの坂', obj: '七曲りの坂で、上からの石と槍を凌いで踏みとどまる', r: 14, dur: 85,
      title: '七曲り', sub: '坂の上から城兵が槍で突き落としに来る',
      say: [['組頭', '夜が明けた。城兵は渇いておる。七曲りを攻め上るぞ', 3], ['組頭', '盾を前へ！　一曲がりずつ上るぞ！', 3]],
      waves: [
        { t: 6, say: ['今川の侍', '突き落とせ！'], foes: [{ name: '坂の上の槍', from: { x: SAKA.x, z: SAKA.z - 24 }, list: [{ type: 'samurai', n: 1, o: { name: '今川の組頭 朝比奈' } }, uS(4), uA(19)] }] },
        { t: 30, say: ['組頭', '石が来る、身を低く！'], foes: [{ name: '坂の上の弓', from: { x: SAKA.x + 12, z: SAKA.z - 28 }, list: [{ type: 'samurai', n: 1, o: { name: '今川の組頭 庵原' } }, uB(8)] }] },
        { t: 58, say: ['組頭', '上の曲がりから新手じゃ！　踏みとどまれ！'], foes: [{ name: '坂の上の新手', from: { x: SAKA.x - 10, z: SAKA.z - 26 }, list: [uS(3), uA(16)] }] }],
      reward: '七曲りを上り切った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKA.x + 8, z: SAKA.z - 12 }, obj: '七曲りの上の木戸で、石を落とす今川の足軽を討つ', limit: 90,
      say: [['組頭', '木戸の上から石を落とす。木戸へ取り付け', 3.2]],
      foes: [{ name: '木戸の今川の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: SAKA.x + 8, z: SAKA.z - 12 }), list: [uS(2), uA(12)] }],
      reward: '木戸の足軽を討った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '坂は上り切った。傷を縛れ。虎口は槍が詰まっておるぞ', 2.8]] },   // K652②：七曲りから息を継がずに虎口へ入り、深手のまま倒れた（act bot 11/25 二回）
    { kind: 'fight', at: KOGUCHI, obj: '虎口の城兵を崩し、城へ入る', title: '虎口', sub: '虎口に城兵が詰めて槍を揃える',
      say: [['山県昌景', '虎口を割れ。割れれば城は持たぬ', 3]],
      foes: [{ name: '虎口の守り', from: { x: KOGUCHI.x, z: KOGUCHI.z - 10 }, list: [uS(5), uA(22)] }],
      reward: '虎口を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KOGUCHI.x + 6, z: KOGUCHI.z - 10 }, obj: '虎口の内の蔵の前で、槍を構える今川の侍を討つ', limit: 90,
      say: [['組頭', '蔵の前に侍が出た。囲んで討て', 3.2]],
      foes: [{ name: '蔵の前の今川の侍', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KOGUCHI.x + 6, z: KOGUCHI.z - 10 }), list: [uS(4), uA(8)] }],
      reward: '蔵の前の侍を討った' },
    // K652②：虎口を破られた城兵は、二の曲輪で最後の打って出をした（花沢は武田方の損が多かった城・『甲陽軍鑑』）
    { kind: 'rest', dur: 8, heal: 0.75, say: [['組頭', '虎口は破った。傷を縛れ。曲輪の中から来るぞ', 2.8]] },
    { kind: 'hold', at: NINO, label: '二の曲輪', obj: '二の曲輪で、最後に打って出る今川の侍を受け止める', r: 14, dur: 65,
      title: '二の曲輪', sub: '今川の侍が死に物狂いで打って出る',
      say: [['山県昌景', '退く所の無い兵が一番強い。ここで受け切れ', 3.2]],
      waves: [
        { t: 5, say: ['今川の侍', '今川の城は渡さぬ！'], foes: [{ name: '二の曲輪の侍', from: { x: NINO.x + 4, z: NINO.z - 16 }, list: [{ type: 'samurai', n: 1, o: { name: '今川の組頭 岡部' } }, uS(2), uA(12)] }] },
        { t: 32, say: ['組頭', '土塁の上から石じゃ！'], foes: [{ name: '土塁の上の兵', from: { x: NINO.x - 12, z: NINO.z - 14 }, list: [uB(5), uA(6)] }] }],
      reward: '二の曲輪を持ちこたえた' },
    // K722 ⑧⑨：攻囲のまま降伏の使いを立てる（敵全滅でなく開城させる戦）
    { kind: 'rest', dur: 8, heal: 0.5, say: [['武田の使番', '降伏を勧める使いを城へ送った。返事を待つ間、囲みを解くな', 3.2], ['山県昌景', '攻めるばかりが戦ではない。開城なら兵を損なわぬ', 3.2]] },
    { kind: 'fight', at: HON, limit: 150,   // 小原鎮実は倒れない（開城して退いた）ので、旗本を六割崩せば段を済ます（無いと七分の上限まで延びた・578秒）
      obj: '本曲輪の城兵を降す', title: '本曲輪', sub: '小原鎮実の旗本が最後の守りにつく',
      say: [['小原鎮実', '今川の城は、ここが最後じゃ……', 3], ['武田の使番', '城を空にせよ。降るなら命は取らぬ。小原殿、開城なされよ', 3.4]],
      foes: [{ name: '小原鎮実の旗本', from: { x: HON.x, z: HON.z - 6 }, list: [busho('小原鎮実'), uS(5), uA(16)] }],
      reward: '花沢城を開城させた' },
  ],
  // 11/27 クラウドす（K722④）：夜討ちの段（麓の陣）を越えたら、夜明けへ四十五秒かけて移ろわせる（途中から続けた時も同じ）
  update(rt) {
    const D = rt.flags.dp, W = rt.world;
    if (rt.over || !D || !W?.setTime || W.timeKey !== 'night') return;
    const yo = this.steps.findIndex((x) => x.label === '麓の陣');
    if (yo >= 0 && D.i > yo) { W.dayClock = null; W.setTime('morning'); }
  },
  win: {
    banner: '花沢城 開城', sub: '小原鎮実は城を明け渡した。駿河の今川方の城はほぼ尽きた', award: '花沢城を開城させた',
    say: [['使番', '小原殿、城を明け渡すと申しておりまする', 3],
      ['山県昌景', '坂で多くを失うた。だが駿河は手に入れた', 3.2]],
  },
}), { plan: HANAZAWA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default d05_hanazawa;
