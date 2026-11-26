// 上杉編 四戦目「小田原城の戦い」（永禄四年〔1561〕三月）。軽い型（light_battle.js）
//   史実：長尾景虎は関東の諸将を率いて（十万とも）北条氏康の小田原城を囲んだ。蓮池門のあたりまで攻め入ったが、氏康は籠城して出ず、
//   兵糧も尽きて一月ほどで囲みを解いた。帰りに鎌倉の鶴岡八幡宮で上杉憲政から上杉の名と関東管領を継ぎ、上杉政虎と名を改めた。
//   出所：Wikipedia「小田原城の戦い (1561年)」・小田原城天守閣の案内。天気は docs/weather_takeda_uesugi.md（春の晴れ・霞）
import { withCastle } from './light_castle.js';
import { ODAWARA1561_PLAN } from './castles/odawara1561.js';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { ODAWARA1561_LAND } from './b_h02_odawara_k.js';   // K651：北条編 h02 の永禄四年の小田原の地面をそのまま使う（同じ戦は一つの戦場に。城も同じ所）

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const SPAWN = { x: 0, z: -150 };
const SAKAWA = { x: -30, z: -80 };      // 酒匂川のほとりの北条の物見
const TOWN = { x: 10, z: -20 };         // 城下の口（町の焼け跡）
const GATE = { x: 20, z: 40 };          // 蓮池門の前
const CAMP = { x: -10, z: -50 };        // 城下の陣
// K652②（11/25 Sanae・家の編を10分前後に）：逸話の段（K652⑥）＝景虎は蓮池門の前で馬を下り、城の鉄砲の届く所で悠々と酒を飲み、玉が鎧をかすめても動かなかった（『北越軍談』）。
//   本人は殿の横で、門から打って出る北条を寄せない。囲みを解いた後は、酒匂川へ退く道で北条の追い手を払う
const SAKE = { x: 8, z: 24 };           // 蓮池門の前の殿の床几
const SAKAWA2 = { x: -40, z: -108 };    // 酒匂川へ退く道

// 11/21 クラウド35（K563 ③の質）：北条の小田原城（居館と八幡山古郭）を置く（castles/odawara1561.js・出所 docs/battle_refs/odawara1561.md）。遠景の軽い形
export const u04_odawara = withCastle(lightBattle({
  id: 'u04_odawara',
  date: '永禄四年（1561）三月　春・霞　相模国 小田原',
  intro: '長尾景虎は関東の諸将を集め、北条氏康の小田原城を囲んだ。城下へ入り、門の前まで寄せる。',
  history: '永禄四年（1561）三月、長尾景虎は関東の諸将とともに小田原城を囲み、蓮池門のあたりまで攻め入った。氏康は城に籠もって出ず、景虎は一月ほどで囲みを解いた。帰りに鶴岡八幡宮で上杉の名と関東管領の職を継ぎ、上杉政虎と名を改めた。',
  sides: { a: { name: '長尾景虎と関東の諸将', mon: 'uesugi', faction: 'uesugi' }, b: { name: '北条氏康の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 30000, b: 12000 },
  allyLook: UESUGI, foeLook: HOJO,
  thick: true,   // 型の受けの段の厚み（三の手・新手）を使う
  allyDmg: 0.3,   // 味方の刃（11/21 型の既定 0.4 では味方が先に討ち切り、本人の討ち取りが少なかった）
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: { ...ODAWARA1561_LAND },

  allies: [
    { name: '長尾景虎の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z - 10 }, fixed: true, list: [busho('長尾景虎'), uS(6), uA(10)] },
    { name: '関東の諸将の手', at: { x: SPAWN.x - 24, z: SPAWN.z + 10 }, list: [uS(3), uA(20)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長尾景虎', '関東の者が皆ここに集うた。氏康を城から引きずり出す', 3.4],
      ['長尾景虎', '酒匂川に北条の物見がおる。まずそれを払え', 3.2]] },
    { kind: 'fight', at: SAKAWA, obj: '酒匂川のほとりで、北条の物見を払う', title: '酒匂川', sub: '北条の物見が川を見張る',
      say: [['組頭', '物見を逃がすな！　城へ知らせが行く！', 3]],
      foes: [{ name: '北条の物見', from: { x: SAKAWA.x + 6, z: SAKAWA.z + 10 }, list: [uS(2), uA(16)] },
        { name: '北条の物見の弓', from: { x: SAKAWA.x - 14, z: SAKAWA.z + 12 }, list: [uS(1), { type: 'bow', n: 6 }] }],
      reward: '酒匂川で北条の物見を払った' },
    { kind: 'fight', at: TOWN, obj: '城下の口で、北条の守りを破る', title: '城下', sub: '城下の口に北条の柵',
      say: [['長尾景虎の使番', '殿より。城下へ入れ。町の口の柵を破れ', 3.2]],
      foes: [{ name: '北条の柵の守り', from: { x: TOWN.x, z: TOWN.z + 12 }, list: [uS(3), uA(20)] },
        { name: '北条の鉄砲', from: { x: TOWN.x + 16, z: TOWN.z + 18 }, list: [uS(1), uG(6)] }],
      reward: '城下の口の柵を破った' },
    { kind: 'fight', at: GATE, obj: '蓮池門の前まで寄せる', title: '蓮池門', sub: '門の前に北条の兵が出ている',
      say: [['長尾景虎', '門の前まで寄せよ。氏康に越後の槍を見せてやれ', 3.2]],
      foes: [{ name: '蓮池門の守り', from: { x: GATE.x, z: GATE.z + 8 }, list: [uS(4), uA(18)] },
        { name: '門の上の鉄砲', from: { x: GATE.x + 14, z: GATE.z + 14 }, list: [uS(1), uG(6)] }],
      reward: '蓮池門の前まで寄せた' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'hold', at: SAKE, label: '殿の床几', obj: '門の前で酒を飲む殿の横に立ち、打って出る北条を寄せない', r: 14, dur: 70,
      title: '蓮池門の酒', sub: '景虎は門の前に床几を据え、鉄砲の中で酒を飲む',
      say: [['長尾景虎', '酒を持て。氏康に、越後の者は玉を恐れぬと見せてやる', 3.4], ['組頭', '殿に玉が当たる！　前に立て！　盾になれ！', 3.2]],
      waves: [
        { t: 6, say: ['北条の侍', 'あの床几の者が景虎ぞ！　討ち取れ！'], foes: [{ name: '蓮池門の打って出', from: { x: SAKE.x + 10, z: SAKE.z + 30 }, list: [uS(3), uA(16)] }] },
        { t: 36, say: ['見張り', '脇の門からも出てきた！'], foes: [{ name: '北条の脇の門の兵', from: { x: SAKE.x - 28, z: SAKE.z + 26 }, list: [uS(2), uA(12)] }] }],
      reward: '酒を飲む殿の前を守り抜いた' },
    { kind: 'hold', at: CAMP, label: '城下の陣', obj: '陣へ戻り、城から打って出る北条を受け止める', r: 18, dur: 80,
      title: '打って出', sub: '城は落ちない。北条が門を開けて打って出る',
      say: [['長尾景虎の使番', '城は堅い。陣へ戻れ。北条が打って出るぞ', 3.2]],
      waves: [
        { t: 8, say: ['見張り', '門が開いた！　北条が打って出る！'], foes: [{ name: '北条の打って出', from: { x: CAMP.x + 10, z: CAMP.z + 44 }, list: [uS(3), uA(20)] }] },
        { t: 38, say: ['組頭', '二の手じゃ！　陣を崩すな！'], foes: [{ name: '北条の二の手', from: { x: CAMP.x - 24, z: CAMP.z + 40 }, list: [uS(2), uA(14)] }] }],
      reward: '陣で北条の打って出を受け止めた' },
    { kind: 'fight', at: SAKAWA2, obj: '囲みを解いて酒匂川へ退く道で、北条の追い手を払う', title: '退く道', sub: '一月の囲みを解く。北条が後ろを突きに来る',
      say: [['長尾景虎の使番', '殿より。囲みを解く。後ろの追い手を払いながら酒匂川まで退け', 3.4]],
      foes: [{ name: '北条の追い手', from: { x: SAKAWA2.x + 8, z: SAKAWA2.z + 22 }, list: [uS(3), uA(16)] },
        { name: '北条の追い手の鉄砲', from: { x: SAKAWA2.x + 22, z: SAKAWA2.z + 26 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '北条の騎馬が回り込むぞ！'], foes: [{ name: '北条の騎馬', from: { x: SAKAWA2.x - 26, z: SAKAWA2.z + 14 }, list: [uS(2), uA(12)] }] }],
      reward: '退く道で北条の追い手を払った' },
  ],
  win: {
    banner: '囲みを解く', sub: '氏康は城を出ない。景虎は鎌倉の鶴岡八幡宮へ向かう', award: '小田原の門の前まで寄せた',
    say: [['長尾景虎の使番', '兵糧が尽きかけております。諸将も国へ帰りたがっております', 3.2],
      ['長尾景虎', '囲みを解く。鎌倉へ寄り、八幡宮で関東管領を継ぐ', 3.4]],
  },
}), { plan: ODAWARA1561_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default u04_odawara;
