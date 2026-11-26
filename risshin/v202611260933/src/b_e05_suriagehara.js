// 伊達家編 一戦目「摺上原の戦い」（天正十七年〔1589〕六月五日）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e05_suriagehara.md
//   史実：伊達政宗（二十三歳）は猪苗代盛国を寝返らせて猪苗代城に入り、磐梯山の南の摺上原で蘆名義広と戦った。
//   はじめ西風が強く、砂塵が伊達の顔を打って押された。やがて風が東へ変わると伊達が押し返し、蘆名は崩れて日橋川（摺上川）で多くが溺れた。
//   政宗は黒川城（会津）へ入った。出所：『伊達治家記録』（B）・磐梯町の解説（C）。伊達約2万・蘆名約1万6千は通説の中間。風の変わりは逸話（B）
// この家だけの仕組み「馬印の勢い」（house_date.md ①）：本人は政宗の馬印の近侍。本人が前へ出ると、味方の備が勢いづいて付いてくる。
//   出すぎて後ろの備から離れると、勢いが落ち、味方は鈍る。勢いは旗のはためき（風の強さ）で見せる。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };     // 伊達の黒漆の具足と竪三引両
const ASHINA = { flag: 'ashina', armor: 0x4a3a2c };  // 蘆名の丸に三つ引両
// 地形：x は東が＋。伊達は東（猪苗代の側）から、蘆名は西（摺上川・会津の側）に構える
const SPAWN = { x: 150, z: 0 };
const RIVER = [[-150, -220], [-140, -100], [-150, 0], [-136, 110], [-146, 220]];   // 摺上川（日橋川）
const FRONT = { x: 92, z: 6 };        // 向かい風の中、蘆名の先手を受ける所
const HILL = { x: 30, z: -8 };        // 台地の縁。馬印を押し出す所
const HONTAI = { x: -36, z: 10 };     // 蘆名の本隊
const KAWA = { x: -108, z: 0 };       // 摺上川の手前（蘆名義広の旗本）
const KAESHI = { x: -70, z: 24 };     // 取って返す蘆名の旗本を受ける所（K652②）
const HASHI = { x: -126, z: -22 };    // 落とされた日橋川の橋の袂（K652②）
const W_IN = [1, 0.12], W_OUT = [-1, -0.1];   // はじめは西風（伊達の顔へ）。変わって東風（蘆名の顔へ）

import { umaTick as umaT } from './date_uma.js';
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: W_IN, wOut: W_OUT });   // 摺上原：向かい風→東風

export const e05_suriagehara = lightBattle({
  id: 'e05_suriagehara',
  date: '天正十七年（1589）六月五日　夏・西風　陸奥国 摺上原',
  intro: '伊達政宗は猪苗代城を得て、磐梯山の南の摺上原に出た。向こうには蘆名義広の軍。西からの風が強い。',
  history: '天正十七年（1589）六月、伊達政宗は猪苗代盛国を味方に付けて猪苗代城に入り、磐梯山の南の摺上原で蘆名義広と戦った。はじめは西からの強い風に砂塵を浴びて押されたが、風が東へ変わると伊達が押し返し、蘆名勢は崩れて日橋川で多くが溺れたと伝わる。義広は常陸の佐竹のもとへ落ち、政宗は会津の黒川城に入って、南奥羽の大半を手にした。政宗は二十三歳だった。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '蘆名義広の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 20000, b: 16000 },
  allyLook: DATE, foeLook: ASHINA,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.28,
  friendsSend: 0,   // 段の始めに味方を送らない。味方は馬印（本人）に付いてくる（umaTick）
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1589, time: 'day', fogFar: 440, sky: { wind: W_IN, windStrength: 0.6 },
    river: RIVER, riverW: 16, riverDepth: 0.7,
    hills: [[60, -190, 90, 46], [20, 0, 70, 6], [200, 150, 70, 18], [-60, 180, 60, 12]],   // 北に磐梯山の裾・真ん中に低い台地
    paths: [{ pts: [[150, 0], [92, 6], [30, -8], [-36, 10], [-108, 0]], w: 3 }],
    groves: [{ x: 200, z: 150, r: 30, n: 30 }, { x: 60, z: -150, r: 40, n: 40 }],
    trees: 360, tufts: 2400,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 12 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 20 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['伊達政宗', '馬印を離すな。わしの旗は、お前と共にある', 3.4],
      ['片倉景綱', '風が悪うござる。砂が目に入る。今は受けて、時を待たれよ', 3.4]] },
    { kind: 'hold', at: FRONT, label: '向かい風', obj: '向かい風の中、蘆名の先手を受け止める', r: 16, dur: 60,
      title: '摺上原', sub: '西の風が砂を巻き上げる。蘆名が風に乗って寄せる',
      say: [['組頭', '目を伏せよ！　槍を下げるな！', 3]],
      waves: [
        { t: 6, say: ['蘆名の侍', '風はこちらに吹いておる！　押せ！'], foes: [{ name: '蘆名の先手', from: { x: FRONT.x - 40, z: FRONT.z }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　ここで退くな！'], foes: [{ name: '蘆名の二の手', from: { x: FRONT.x - 36, z: FRONT.z + 16 }, list: [uS(2), uA(10)] }] }],
      reward: '向かい風の中で蘆名の先手を受け止めた' },
    { kind: 'move', at: HILL, label: '台地の縁', obj: '風が変わった。馬印を台地の縁へ押し出す', r: 12,
      say: [['伊達政宗', '風が変わった。今じゃ、馬印を前へ！', 3.2], ['伊達成実', '殿の旗が出たぞ！　遅れるな！', 3]] },
    { kind: 'fight', at: HONTAI, limit: 130, obj: '勢いに乗って、蘆名の本隊を崩す', title: '押し出し', sub: '東の風が蘆名の顔を打つ',
      say: [['蘆名の侍', '砂で前が見えぬ！', 3]],
      foes: [{ name: '蘆名の本隊', from: { x: HONTAI.x - 6, z: HONTAI.z }, list: [uS(4), uA(20)] },
        { name: '蘆名の鉄砲', from: { x: HONTAI.x - 14, z: HONTAI.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '勢いに乗って蘆名の本隊を崩した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②（11/25 Sanae・10分）：崩れかけた蘆名の旗本は取って返し、決死で伊達の先手を押し返した（『会津四家合考』B）
    { kind: 'hold', at: KAESHI, label: '取って返す蘆名', obj: '取って返す蘆名の旗本の決死の手を、馬印の前で受け止める', r: 16, dur: 60, limit: 110,
      title: '蘆名の意地', sub: '崩れかけた蘆名が、最後の力で取って返す',
      say: [['伊達成実', '蘆名の旗本が取って返したぞ！　ここで押し負けるな！', 3.2]],
      waves: [{ t: 6, say: ['蘆名の侍', '会津を渡すな！　取って返せ！'], foes: [{ name: '蘆名の旗本の決死の手', from: { x: KAESHI.x - 36, z: KAESHI.z }, list: [uS(3), uA(15)] }] },
        { t: 30, say: ['組頭', '横の田からも来るぞ！'], foes: [{ name: '蘆名の横の手', from: { x: KAESHI.x - 12, z: KAESHI.z + 36 }, list: [uS(2), uA(11), uG(3)] }] }],
      reward: '取って返す蘆名の旗本を受け止めた' },
    { kind: 'fight', at: KAWA, limit: 110, obj: '摺上川へ、蘆名の旗本を追い落とす', title: '摺上川', sub: '崩れた蘆名勢が川へ逃げる',
      say: [['片倉景綱', '川まで追え。ここで会津が決まる', 3.2]],
      foes: [{ name: '蘆名義広の旗本', from: { x: KAWA.x - 4, z: KAWA.z }, list: [busho('蘆名義広', { mustLive: false, invuln: false }), uS(4), uA(14)] }],
      reward: '摺上川へ蘆名の旗本を追い落とした' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HILL.x + 40, z: HILL.z + 10 }, obj: '向かい風の野で、矢を射る蘆名の弓を討つ', max: 100, limit: 90,
      say: [['伊達政宗', '風が敵に吹く。押せ', 3.2]],
      foes: [{ name: '蘆名の弓', from: { x: HILL.x + 52, z: HILL.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '向かい風の野の弓を討った' },
    { kind: 'hold', at: { x: HILL.x - 20, z: HILL.z + 20 }, label: '台地の縁で、', obj: '台地の縁で、回り込む蘆名の足軽を受け止める', r: 16, dur: 45,
      say: [['見張り', '蘆名が回り込む！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '回り込む蘆名の足軽', from: { x: HILL.x - 8, z: HILL.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '回り込む蘆名の足軽', from: { x: HILL.x - 34, z: HILL.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '台地の縁を守った' },
    { kind: 'fight', at: { x: HILL.x - 70, z: HILL.z + 10 }, obj: '摺上川の岸で、渡って逃げる蘆名の兵を討つ', max: 100, limit: 90,
      say: [['組頭', '川へ追い落とせ', 3.2]],
      foes: [{ name: '逃げる蘆名の兵', from: { x: HILL.x - 58, z: HILL.z - 2 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '摺上川の岸を押さえた' },
    { kind: 'hold', at: { x: HILL.x - 90, z: HILL.z - 10 }, label: '橋のたもとで', obj: '橋のたもとで、追われて戻る蘆名の殿を受け止める', r: 16, dur: 45,
      say: [['見張り', '殿が返して来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '蘆名の殿', from: { x: HILL.x - 78, z: HILL.z - 22 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '蘆名の殿', from: { x: HILL.x - 104, z: HILL.z + 4 }, list: [uS(2), uA(7)] }] }],
      reward: '橋のたもとを守った' },
    // K652②：日橋川の橋は落とされ、退く蘆名勢の多くが川で討たれ、溺れた（『会津四家合考』B）。橋の袂に残った殿を払う
    { kind: 'fight', at: HASHI, limit: 110, obj: '落とされた橋の袂で、退けずに残った蘆名の殿を払う', title: '日橋川の橋', sub: '橋が落ち、蘆名は退く道を失った',
      say: [['片倉景綱', '橋が落ちておる。蘆名の殿は背水じゃ、侮るな', 3.2]],
      foes: [{ name: '橋の袂の蘆名の殿', from: { x: HASHI.x + 8, z: HASHI.z + 6 }, list: [uS(3), uA(13)] }],
      reward: '橋の袂の蘆名の殿を払った' },
  ],
  update: umaTick,
  win: {
    banner: '会津へ', sub: '蘆名勢は川で崩れた。政宗は黒川城へ入る', award: '摺上原で馬印を押し出した',
    say: [['伊達成実', '蘆名義広、川を越えて落ちていきます！', 3.2],
      ['伊達政宗', 'よう旗を離さなんだ。会津はわしのものじゃ', 3.4]],
  },
});
// 少し引いて、本人の右後ろの馬印（竿三・三m＋黒鳥毛の笠）が画面に入るように（def.camPull：戦ごとの引き）
e05_suriagehara.camPull = 1.6;
export default e05_suriagehara;
