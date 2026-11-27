// 武田編 一戦目「川中島の戦い（八幡原）」（第四次川中島・永禄四年〔1561〕九月十日）。軽い型（light_battle.js）で書いた（K563・docs/chapter_takeda.md）
//   史実：信玄は海津城から別働隊（高坂昌信・馬場信春ら一万二千）を妻女山の上杉の陣の背へ回し（啄木鳥の戦法）、自らは八千で八幡原に鶴翼を敷いた。
//   謙信はこれを見抜いて夜のうちに妻女山を下り、霧の晴れた朝、八幡原の信玄の本隊へ車懸りで打ち掛かった。
//   武田の本隊は苦戦し、信玄の弟の信繁・山本勘助・諸角虎定らが討死。謙信が自ら信玄の本陣へ斬り込んだと伝える（『甲陽軍鑑』）。
//   昼前に別働隊が戻って上杉の背を突き、上杉は犀川を渡って退いた。主人公は信玄の本隊の足軽。
//   出所：『甲陽軍鑑』・長野市の八幡原史跡公園の案内。くわしくは docs/chapter_takeda.md
// 11/21 cloud-10（司令塔「d01 の討ち取りのばらつき 1〜13」）：受けの段の波に討てる名のある組頭を一人ずつ混ぜた（d12 と同じ形）
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { HACHIMAN_LAND } from './b_u05_hachimanbara.js';   // K651：上杉編 u05 の八幡原の地面をそのまま使う（同じ戦は一つの戦場に）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に。良い方を元にする」）：前の別の地面をやめ、上杉編 u05 の八幡原（雨宮の渡し・千曲川・妻女山・道と森）に載せた。
//   向きは同じ（北が −z＝上杉の寄せる側、千曲川はその奥）。武田の備の置き場は u05 の信繁・本陣の所にそろえた（段・台詞・数は同じ）
const SPAWN = { x: 4, z: 72 };                     // 八幡原の鶴翼の中ほど（北が −z＝上杉の寄せる側）
const NOBUSHIGE = { x: 30, z: 30 };               // 典厩信繁の備（u05 の信繁の手と同じ所）
const HONJIN = { x: 10, z: 90 };                  // 信玄の本陣（八幡社・u05 の本陣と同じ所）
const MAE = { x: 8, z: 54 };                      // 本陣の前の備え
const KANSUKE = { x: -26, z: 34 };                // 山本勘助の備（鶴翼のもう一方）
const BETSU = { x: -10, z: -50 };                 // 別働隊が背を突く所（上杉の後ろ・渡しの手前）
const SAIGAWA = { x: 4, z: -80 };                 // 雨宮の渡しの手前（殿の甘粕景持が踏みとどまった所・K652②）

export const d01_kawanakajima = lightBattle({
  id: 'd01_kawanakajima',
  date: '永禄四年（1561）九月十日　朝霧　信濃国 八幡原',
  intro: '霧の朝。別働隊が妻女山の上杉の背へ回った。信玄の本隊は八幡原に鶴翼を敷き、逃げて来る上杉を待つ。だが霧の向こうから来たのは、上杉の全軍だった。',
  history: '永禄四年（1561）九月、武田信玄は別働隊を妻女山の上杉謙信の背へ回し、自らは八幡原に陣を敷いた。謙信はこれを見抜いて夜のうちに山を下り、霧の晴れた朝、信玄の本隊へ打ち掛かった。信玄の弟の信繁、山本勘助らが討死する激しい戦いとなったが、昼前に別働隊が戻り、上杉は犀川を渡って退いた。',
  sides: { a: { name: '武田信玄の本隊', mon: 'takeda', faction: 'takeda' }, b: { name: '上杉政虎の軍', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 8000, b: 13000 },
  allyLook: TAKEDA, foeLook: UESUGI,
  friendsSend: 1,   // 段の始めに攻めに出す味方の組は本人に近い一組だけ（全部出すと本人より先に討ち切る）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },   // 北（−z）の霧の方を向く
  world: { ...HACHIMAN_LAND },

  allies: [
    { name: '武田信玄の旗本', at: { ...HONJIN }, fixed: true, list: [busho('武田信玄'), uS(6), uA(12)] },
    { name: '武田信繁の備', at: { ...NOBUSHIGE }, list: [busho('武田信繁', { mustLive: false, invuln: false }), uS(4), uA(16)] },
    { name: '山本勘助の備', at: { ...KANSUKE }, list: [busho('山本勘助', { mustLive: false, invuln: false }), uS(3), uA(14)] },
    { name: '本陣の前の備え', at: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, list: [uS(2), uA(18)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 12, z: SPAWN.z - 4 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['組頭', '妻女山の方の報せを待て。陣を整えよ。霧で何も見えぬ', 3.2],
      ['武田信玄', '別働隊が妻女山を突けば、上杉は山を下りてここへ来る。逃げて来る所を討つ', 3.6],
      ['山本勘助', '霧が晴れまする……', 2.6],
      ['物見', '霧が晴れてゆく……正面いっぱいに旗！　毘の旗じゃ、上杉の全軍がおりまする！', 3.6]] },
    { kind: 'hold', at: MAE, label: '本陣の前の備え', obj: '霧から来る上杉の車懸りを、本陣の前で受け止める', r: 16, dur: 100,   // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：70→100秒・四の備を足した
      title: '車懸り', sub: '上杉の備が入れ替わり立ち替わり打ち掛かる',
      say: [['武田信玄', '慌てるな。別働隊が戻るまで、この陣を一歩も退くな', 3.4]],
      waves: [
        { t: 4, say: ['上杉の侍', '信玄の本陣はそこじゃ！　かかれ！'], foes: [{ name: '柿崎景家の手', from: { x: MAE.x - 6, z: MAE.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '柿崎の組頭' } }, uS(4), uA(16)] }] },
        { t: 30, say: ['組頭', '次の備が入れ替わって来るぞ！　息を継がせぬ気じゃ！'], foes: [{ name: '上杉の二の備', from: { x: MAE.x + 20, z: MAE.z - 42 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の二の備の組頭' } }, uS(3), uA(16)] }] },
        { t: 52, say: ['組頭', 'また来た！　槍を下ろすな！'], foes: [{ name: '上杉の三の備', from: { x: MAE.x - 24, z: MAE.z - 40 }, list: [uS(3), uA(14), uG(3)] }] },
        { t: 78, say: ['組頭', '四の備じゃ！　車は止まらぬ！'], foes: [{ name: '上杉の四の備', from: { x: MAE.x + 6, z: MAE.z - 46 }, list: [uS(4), uA(18)] }] }],
      reward: '本陣の前で車懸りを受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: MAE.x - 4, z: MAE.z - 20 }, obj: '霧の中で、本陣の前へ抜けた上杉の足軽を討つ', limit: 90,
      say: [['組頭', '霧の中に抜けた者がおる。槍を揃えよ', 3.2]],
      foes: [{ name: '抜けた上杉の足軽', from: { x: MAE.x - 4, z: MAE.z - 34 }, list: [uS(2), uA(10)] }],
      reward: '本陣の前へ抜けた足軽を討った' },
    { kind: 'fight', at: NOBUSHIGE, obj: '左の典厩信繁の備へ加勢し、上杉を押し返す', title: '典厩信繁', sub: '信繁の備が上杉に囲まれている',
      say: [['使番', '典厩様の備が囲まれております！　加勢を！', 3.2]],
      foes: [
        { name: '上杉の左の備', from: { x: NOBUSHIGE.x - 10, z: NOBUSHIGE.z - 16 }, list: [uS(4), uA(18)] },
        { name: '上杉の鉄砲', from: { x: NOBUSHIGE.x + 12, z: NOBUSHIGE.z - 24 }, list: [uS(1), uG(6)] }],
      later: [{ t: 36, say: ['使番', '典厩様、お討死……！　山本勘助殿も！'], foes: [{ name: '上杉の新手', from: { x: NOBUSHIGE.x - 26, z: NOBUSHIGE.z - 8 }, list: [uS(3), uA(14)] }] }],
      reward: '典厩の備を支えた' },
    // K652②（11/25 Sanae・10分に）：鶴翼の右、山本勘助の備も崩れ、勘助は啄木鳥の策が破れた責めを負って討死した（『甲陽軍鑑』）。本人は右へ走り、勘助の備の崩れを止める
    { kind: 'rest', dur: 8, heal: 0.65, say: [['使番', '右の勘助殿の備も崩れかけておる！　走れ！', 3]] },
    { kind: 'fight', at: KANSUKE, limit: 120, obj: '右の山本勘助の備へ走り、崩れを止める', title: '山本勘助', sub: '啄木鳥の策が破れ、勘助が自ら槍を取る',
      say: [['山本勘助', '策を読まれたは、わしの不覚。ここで死んで詫びる', 3.4]],
      foes: [
        { name: '上杉の右の備', from: { x: KANSUKE.x + 10, z: KANSUKE.z - 18 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の組頭 色部' } }, uS(4), uA(18)] },
        { name: '上杉の弓', from: { x: KANSUKE.x - 8, z: KANSUKE.z - 26 }, list: [uS(1), uA(6), uG(4)] }],
      later: [{ t: 40, say: ['組頭', '勘助殿が見えぬ！　……崩れるな、ここを持て！'], foes: [{ name: '上杉の右の新手', from: { x: KANSUKE.x + 24, z: KANSUKE.z - 10 }, list: [uS(3), uA(14)] }] }],
      reward: '右の備の崩れを止めた' },
    { kind: 'fight', at: { x: KANSUKE.x + 14, z: KANSUKE.z + 14 }, obj: '勘助の備の後ろで、回り込む上杉の弓を討つ', limit: 90,
      say: [['組頭', '弓が後ろへ回った。射させるな', 3.2]],
      foes: [{ name: '回り込む上杉の弓', from: { x: KANSUKE.x + 24, z: KANSUKE.z + 4 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '回り込む弓を討った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['組頭', '右は持たせた。息を継げ、次は本陣じゃ', 2.8]] },
    { kind: 'hold', at: HONJIN, label: '信玄の本陣', obj: '本陣へ斬り込む上杉の騎馬を、信玄の前で防ぐ', r: 14, dur: 55, limit: 110,   // K652②：倒れない政虎の騎馬が残り、段が428秒延びた回がある（act bot 11/25）
      title: '本陣へ斬り込み', sub: '萌黄の胴肩衣の騎馬武者が本陣へ駆け入る',
      say: [['旗本の侍', '白い頭巾の騎馬が一騎、本陣へ！　お屋形様を守れ！', 3.4]],
      waves: [
        { t: 3, say: ['武田信玄', '……来たか（一騎打ちは『甲陽軍鑑』の伝え。戦場の語り伝えのとおりに）', 3.2], foes: [{ name: '上杉の旗本の騎馬', from: { x: HONJIN.x - 18, z: HONJIN.z - 30 }, list: [busho('上杉政虎'), uS(5)] }] },
        { t: 28, say: ['組頭', '騎馬の後ろに徒の槍が続く！'], foes: [{ name: '上杉の旗本の徒', from: { x: HONJIN.x + 16, z: HONJIN.z - 28 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の旗本の組頭' } }, uS(3), uA(12)] }] }],
      reward: '信玄の本陣を守り抜いた' },
    { kind: 'fight', at: { x: HONJIN.x + 6, z: HONJIN.z - 22 }, obj: '本陣の脇で、取り付いた上杉の足軽を斬り払う', limit: 90,
      say: [['組頭', '本陣の脇に取り付かれた！　払え！', 3.2]],
      foes: [{ name: '取り付いた上杉の足軽', from: { x: HONJIN.x + 14, z: HONJIN.z - 36 }, list: [uS(3), uA(10)] }],
      reward: '本陣の脇の足軽を払った' },
    { kind: 'fight', at: BETSU, obj: '戻った別働隊と、上杉を犀川の方へ追い崩す', title: '別働隊の帰り', sub: '高坂・馬場の別働隊が上杉の背を突く',
      say: [['物見', '妻女山の方から味方の旗！　別働隊が戻りましたぞ！', 3.4], ['武田信玄', '今じゃ。前と後ろから挟め', 3]],
      foes: [{ name: '上杉の殿', from: { x: BETSU.x, z: BETSU.z - 8 }, list: [uS(4), uA(16)] }],
      reward: '上杉を挟んで崩した' },
    { kind: 'fight', at: { x: BETSU.x + 2, z: BETSU.z - 34 }, obj: '退く道で、踏みとどまる上杉の旗本の手を追い崩す', limit: 90,
      say: [['組頭', '旗本が踏みとどまっておる。崩せ', 3.2]],
      foes: [{ name: '踏みとどまる上杉の旗本', from: { x: BETSU.x + 6, z: BETSU.z - 46 }, list: [uS(3), uA(10)] }],
      reward: '退く道の旗本を崩した' },
    // K652②：上杉は千曲川の雨宮の渡しを越えて退いた。殿の甘粕景持の手は渡しで踏みとどまり、追う武田を何度も押し返した（『甲陽軍鑑』『北越軍談』）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['武田信玄', '追え。だが雨宮の渡しには殿が残る。甘粕じゃ、侮るな', 3.4]] },
    { kind: 'fight', at: SAIGAWA, limit: 120, obj: '雨宮の渡しで、殿の甘粕景持の手と斬り結ぶ', title: '雨宮の渡しの殿', sub: '甘粕景持が渡しに踏みとどまる',
      say: [['組頭', '川へ追い落とせ！　だが深追いして水へ入るな', 3], ['甘粕景持', 'ここは一歩も通さぬ。皆、川を渡れ！', 3]],
      foes: [{ name: '甘粕景持の手', from: { x: SAIGAWA.x + 6, z: SAIGAWA.z - 16 }, list: [busho('甘粕景持'), uS(4), uA(18)] }],
      later: [{ t: 36, say: ['物見', '殿が引き返して来る！　鉄砲も！'], foes: [{ name: '甘粕の引き返しの手', from: { x: SAIGAWA.x - 18, z: SAIGAWA.z - 14 }, list: [{ type: 'samurai', n: 1, o: { name: '甘粕の組頭' } }, uS(3), uA(12), uG(4)] }] }],
      reward: '雨宮の渡しまで上杉を追った' },
  ],
  win: {
    banner: '八幡原', sub: '上杉は犀川を渡って善光寺へ退いた', award: '八幡原で上杉を退けた',
    say: [['物見', '上杉が犀川を渡って退いて行きまする！', 3.2],
      ['武田信玄', '信繁を失うた。勝ったとは言えぬ……', 3.4],
      ['武田信玄', 'だが北信濃は武田の物じゃ。海津の城を固めよ', 3.4]],
  },
});
export default d01_kawanakajima;
