// 武田編 二戦目「箕輪城攻め」（永禄九年〔1566〕九月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：西上野の長野氏は業政の死の後も子の業盛が箕輪城に籠もり、武田に抗った。信玄は二万で箕輪城を囲み、
//   搦手の若田原の戦いで城兵を破り、大手から攻め入った。業盛は城の持仏堂で自刃し、上野の長野氏は絶えた（『甲陽軍鑑』・高崎市の史跡の案内）。
//   主人公は大手の寄せ手の足軽。城は丘と曲輪の段（軽い型の地面の丘）で見せる。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
// 11/21 cloud-10（司令塔「本人の討ち取り5以上・4〜7分」）：受けの段の始めの組に、討てる名のある組頭を一人ずつ混ぜた（d12 と同じ形・busho の討てない将は使わない）
import { withCastle } from './light_castle.js';
import { MINOWA_PLAN } from './castles/minowa.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const NAGANO = { flag: 'maru', armor: 0x2c2a27 };
const SPAWN = { x: 0, z: 150 };
const WAKATA = { x: -40, z: 90 };     // 若田原（城の南西の原・打って出た城兵と当たる所）
const OTE = { x: 6, z: 46 };          // 大手の木戸の前
const NINO = { x: 4, z: 6 };          // 二の丸の前
const HON = { x: 0, z: -34 };         // 本丸（持仏堂）
const KARAME = { x: -26, z: 62 };     // 搦手の坂（若田原から城へ上る道・K652②）
const HORI = { x: 2, z: -14 };        // 二の丸と本丸の間の大堀切（K652②）

// 11/21 クラウド35（K563 ③の質）：箕輪城（三の丸・二の丸・本丸と大堀切）を置く（castles/minowa.js・出所 docs/battle_refs/minowa.md）。遠景の軽い形
export const d02_minowa = withCastle(lightBattle({
  id: 'd02_minowa',
  date: '永禄九年（1566）九月　晴れ　上野国 箕輪城',
  intro: '上野の箕輪城に、長野業盛が籠もる。父の業政は六度武田を退けた。信玄は二万で城を囲んだ。',
  history: '永禄九年（1566）、武田信玄は二万の兵で西上野の箕輪城を囲んだ。城主の長野業盛は若田原で打って出たが敗れ、大手から攻め入られて城の持仏堂で自刃した。これで信玄は西上野を手に入れた。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '長野業盛の城兵', mon: 'maru', faction: 'nagano' } },
  force: { a: 20000, b: 1500 },
  allyLook: TAKEDA, foeLook: NAGANO,
  friendsSend: 2,   // 11/21 cloud-10：一組だと act bot で七百秒を越えた（討ち取りは十四〜十五）ので二組に。段の始めに攻めに出す味方の組は本人に近い組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1566, time: 'day', autumn: true, fogFar: 420,
    hills: [[0, -30, 46, 22], [0, 8, 40, 12], [-120, -60, 70, 26], [130, -40, 70, 24], [70, 120, 50, 8]],
    // 11/21 cloud-19（K563 地形・手書き）：城の西の崖下を榛名白川が南へ流れ、南の若田原へ開ける。大手道は南から木戸へ上り、城山と西の崖は雑木林
    river: [[-96, -160], [-92, -60], [-100, 20], [-118, 110], [-130, 200]], riverW: 12, riverDepth: 0.5,
    paths: [{ pts: [[0, 190], [0, 150], [-20, 110], [6, 46], [4, 6], [0, -34]], w: 3 }],
    groves: [{ x: -70, z: -40, r: 26, n: 30 }, { x: 40, z: -50, r: 22, n: 24 }],
    trees: 500, tufts: 1800,
  },
  allies: [
    { name: '武田の先手', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, list: [busho('内藤昌秀'), uS(3), uA(18)] },
    { name: '武田の鉄砲衆', at: { x: SPAWN.x - 14, z: SPAWN.z - 6 }, list: [uS(1), uG(10)] },
    { name: '武田の二の手', at: { x: SPAWN.x - 4, z: SPAWN.z + 10 }, list: [uS(3), uA(16)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['内藤昌秀', '業政が生きておる間は、この城を六度攻めて六度退いた', 3.4],
      ['内藤昌秀', '子の業盛は若い。だが父に似て退かぬぞ', 3.2],
      ['物見', '城の南西、若田原へ城兵が打って出て来まする！', 3.2]] },
    { kind: 'fight', at: WAKATA, limit: 120, obj: '若田原で、打って出た城兵を崩す', title: '若田原', sub: '長野の城兵が城を出て野で迎え討つ',
      say: [['長野の侍', '甲斐の者に箕輪は渡さぬ！', 3]],
      foes: [
        { name: '長野の打って出の手', from: { x: WAKATA.x - 6, z: WAKATA.z - 14 }, list: [busho('長野の侍大将', { mustLive: false, invuln: false }), uS(4), uA(26)] },
        { name: '長野の弓', from: { x: WAKATA.x + 14, z: WAKATA.z - 22 }, list: [uB(6)] }],
      reward: '若田原で城兵を崩した' },
    // K652②（11/25 Sanae・10分に）：若田原の崩れを上泉信綱が搦手の坂で支えた（上野国一本槍・『甲陽軍鑑』・落城の後に信玄が召し抱えを望んだ）。本人が坂でその槍を受ける
    { kind: 'rest', dur: 8, heal: 0.65, say: [['組頭', '若田原は崩した。傷を縛れ、搦手の坂へ追うぞ', 2.8]] },
    { kind: 'fight', at: KARAME, limit: 120, obj: '搦手の坂で、殿の上泉信綱の槍を受け止める', title: '上野国一本槍', sub: '上泉信綱が退く城兵の殿に立つ',
      say: [['内藤昌秀', 'あれが上泉伊勢守じゃ。一人で坂を塞いでおる。囲んで押せ', 3.4], ['上泉信綱', '新陰の太刀、受けてみよ', 3]],
      foes: [{ name: '上泉信綱の手', from: { x: KARAME.x, z: KARAME.z - 18 }, list: [busho('上泉信綱'), uS(2), uA(12)] }],
      later: [{ t: 36, say: ['組頭', '城から助けが下りて来る！　坂を渡すな！'], foes: [{ name: '搦手の城兵', from: { x: KARAME.x - 16, z: KARAME.z - 22 }, list: [{ type: 'samurai', n: 1, o: { name: '長野の組頭 青柳' } }, uS(1), uA(12)] }] }],
      reward: '上泉信綱の殿を押し返した' },
    { kind: 'hold', at: OTE, label: '大手の木戸の前', obj: '大手の木戸の前で、城の上からの矢と石を凌ぐ', r: 14, dur: 55,
      title: '大手', sub: '木戸の上の矢倉から矢と礫が降る',
      say: [['組頭', '盾を上げろ！　木戸が開くまで、ここを動くな！', 3]],
      waves: [
        { t: 6, say: ['長野の侍', '木戸の前の者を払え！'], foes: [{ name: '大手の守り', from: { x: OTE.x, z: OTE.z - 20 }, list: [{ type: 'samurai', n: 1, o: { name: '長野の組頭 藤井' } }, uS(4), uA(19)] }] },
        { t: 32, say: ['組頭', '矢倉の弓じゃ！　身を低く！'], foes: [{ name: '矢倉の弓衆', from: { x: OTE.x + 12, z: OTE.z - 24 }, list: [uB(8)] }] }],
      reward: '大手の木戸を破った' },
    { kind: 'fight', at: NINO, limit: 100, obj: '二の丸へ攻め上る', title: '二の丸', sub: '二の丸の城兵が坂の上で槍を揃える',
      say: [['内藤昌秀', '坂を一気に上れ！　足を止めれば上から突かれるぞ', 3.2]],
      foes: [{ name: '二の丸の守り', from: { x: NINO.x, z: NINO.z - 10 }, list: [uS(5), uA(26), uG(3)] }],
      reward: '二の丸を取った' },
    // K652②：二の丸と本丸の間の大堀切（箕輪城の一番の堀・castles/minowa.js）。堀の底へ下りて向こうの土塁を上る
    { kind: 'rest', dur: 8, heal: 0.6, say: [['組頭', '二の丸は取った。息を継げ。次は大堀切じゃ', 2.8]] },
    { kind: 'hold', at: HORI, label: '大堀切', obj: '大堀切の底で、土塁の上から突く城兵を凌ぎ、本丸の口を取る', r: 14, dur: 65,
      title: '大堀切', sub: '本丸の前の深い堀。上から槍と石が来る',
      say: [['内藤昌秀', '堀の底で止まるな。土塁へ取り付け！', 3]],
      waves: [
        { t: 5, say: ['長野の侍', '堀へ落とせ！'], foes: [{ name: '土塁の守り', from: { x: HORI.x + 6, z: HORI.z - 16 }, list: [{ type: 'samurai', n: 1, o: { name: '長野の組頭 白川' } }, uS(2), uA(14)] }] },
        { t: 32, say: ['組頭', '石が来る！　土塁の陰へ！'], foes: [{ name: '本丸の弓', from: { x: HORI.x - 10, z: HORI.z - 20 }, list: [uB(6), uA(6)] }] }],
      reward: '大堀切を越えた' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '堀は越えた。傷を縛れ。本丸じゃ', 2.8]] },   // K652②：段が六つになり、本丸の頭で深手のまま倒れた回がある（act bot 11/25）
    // 11/21 cloud-41：最後の段が七分の上限まで延びた（通しで箕輪 731・蒲原 709秒）。若田原 120・二の丸 100・本丸 120 秒を上限に（六割崩していれば済）。通しで若田原だけで 300 秒かかった
    { kind: 'fight', at: HON, limit: 120, obj: '本丸に攻め入り、業盛の旗本を崩す', title: '本丸', sub: '長野業盛の旗本が最後の槍を構える',
      say: [['長野業盛', '春風に梅も桜も散り果てて……ここが長野の最期の場じゃ', 3.6]],
      foes: [{ name: '長野業盛の旗本', from: { x: HON.x, z: HON.z - 8 }, list: [busho('長野業盛', { mustLive: false, invuln: false }), uS(6), uA(16)] }],
      reward: '本丸を落とした' },
  ],
  win: {
    banner: '箕輪城 落城', sub: '長野業盛は持仏堂で自刃。西上野は武田の手に', award: '箕輪城を落とした',
    say: [['物見', '業盛殿、持仏堂にて御自害……', 3],
      ['内藤昌秀', '六度退いた城じゃ。よう戦った城兵を、手厚く葬れ', 3.4]],
  },
}), { plan: MINOWA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default d02_minowa;
