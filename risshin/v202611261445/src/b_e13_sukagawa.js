// 伊達家編「須賀川城の戦い」（天正十七年十月〔1589〕・陸奥国 須賀川）。軽い型（light_battle.js）。紙は docs/house_date.md ⑥・docs/fujin/e13_sukagawa.md（K647・11/25 Sanae）
//   出所：『伊達治家記録』（B）・須賀川市の解説（C）。摺上原の後、政宗は二階堂氏の須賀川城を攻めて落とした。数は推（伊達約1万2千・城方約4千は clans_75_1121.md の目安・要確認）
//   仕組み「馬印の勢い」（date_uma.js）：城下町の狭い通りで戦う。町の角で勢いが途切れ（上限五割・向かい風）、蔵の間に敵が潜む。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const FOE = { flag: 'ashina', armor: 0x2e2a2a };
const SPAWN = { x: 140, z: 0 };
const WIND = [0.7, 0.4];
const WOUT = [0.7, 0.4];
const FRONT = { x: 70, z: 0 };
const GOAL = { x: -70, z: 0 };
const KIDO = { x: 14, z: 8 };           // 町の中ほどの木戸（K652②）
const HI = { x: -24, z: -22 };          // 火の手の上がった通り（K652②）
const OCHI = { x: -128, z: 12 };        // 城の裏の落ち口（K652②）
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WOUT, cap0: 0.5, windStep: 99 });

export const e13_sukagawa = lightBattle({
  id: 'e13_sukagawa',
  date: '天正十七年（1589）十月　秋・曇り　陸奥国 須賀川',
  intro: '摺上原の勝ちの後、政宗は二階堂氏の須賀川へ兵を向けた。城下の町の中の戦いになる。',
  history: '天正十七年（1589）十月、摺上原で蘆名を破った伊達政宗は、二階堂氏の須賀川城を攻めて落とした。町の中の戦いで、政宗は南奥州の覇者となった（『伊達治家記録』）。数は諸説ある。',
  sides: { a: { name: '伊達の軍', mon: 'date', faction: 'date' }, b: { name: '二階堂の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 12000, b: 4000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.26,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1589, time: 'day', fogFar: 340, autumn: 0.9, sky: { wind: WIND, windStrength: 0.9, overcast: 0.5, mist: 0.15 },
    hills: [[-90, 0, 40, 14], [150, 130, 50, 8]],
    groves: [{ x: 80, z: -70, r: 28, n: 24 }, { x: -20, z: 80, r: 26, n: 20 }],
    paths: [{ pts: [[150, 0], [70, 0], [-20, 0], [-100, 0]], w: 3 }],
    trees: 260, tufts: 1500,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、須賀川は町の中。蔵と門の間に敵が潜みまする', 3.4],
      ['伊達政宗', '町を焼くな。通りを一つずつ取れ', 3.2]] },
    { kind: 'hold', at: FRONT, label: '須賀川の町の入口', obj: '須賀川の町の入口で、二階堂の先手を受け止める', r: 16, dur: 60,
      title: '須賀川の町', sub: '町の通りから、二階堂勢が打って出る',
      say: [['組頭', '通りの角に気を付けよ！　槍を揃えて進め！', 3.2]],
      waves: [
        { t: 6, say: ['二階堂の侍', '町から伊達を追い出せ！'], foes: [{ name: '二階堂の先手', from: { x: FRONT.x - 42, z: FRONT.z }, list: [uS(3), uA(16)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　押されるな！'], foes: [{ name: '二階堂の二の手', from: { x: FRONT.x - 38, z: FRONT.z + 14 }, list: [uS(3), uA(14)] }] }],
      reward: '町の入口を持ちこたえた' },
    // K652②（11/25 Sanae・10分）：二階堂の将・守屋筑後守が伊達に内応し、町に火を放った。火は風にあおられて広がった（『伊達日記』B）
    { kind: 'fight', at: KIDO, limit: 120, obj: '内応の合図の煙を見て、町の中ほどの木戸を破る', title: '町の木戸', sub: '町の奥から、内応の合図の煙が上がる',
      say: [['片倉景綱', '守屋の合図じゃ。今、木戸を破れば町の奥へ通れまする', 3.4]],
      foes: [{ name: '木戸の二階堂勢', from: { x: KIDO.x - 12, z: KIDO.z - 6 }, list: [uS(3), uA(14)] }, { name: '木戸の鉄砲', from: { x: KIDO.x - 20, z: KIDO.z + 10 }, list: [uS(1), uG(5)] }],
      reward: '町の中ほどの木戸を破った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: HI, label: '火の通り', obj: '火の手の中から打って出る二階堂の手を、通りで受け止める', r: 16, dur: 60, limit: 110,
      title: '町の火', sub: '火は風にあおられ、町を走る',
      say: [['伊達成実', '火が回る！　焼けた通りから二階堂が死に物狂いで来るぞ', 3.4]],
      waves: [{ t: 6, say: ['二階堂の侍', '裏切り者の火じゃ！　せめて伊達を道連れに！'], foes: [{ name: '火の中の二階堂勢', from: { x: HI.x - 36, z: HI.z - 8 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '横の通りからも来る！'], foes: [{ name: '横の通りの二階堂勢', from: { x: HI.x - 10, z: HI.z + 36 }, list: [uS(2), uA(12)] }] }],
      reward: '火の通りで二階堂の手を受け止めた' },
    { kind: 'fight', at: GOAL, limit: 120, obj: '馬印を町の奥へ押し出して、須賀川城の二階堂勢を崩す', title: '須賀川の城', sub: '町の奥の城の門が見える',
      say: [['伊達成実', '殿、町の角で後ろが離れませぬよう', 3.2]],
      foes: [{ name: '須賀川の城兵', from: { x: GOAL.x - 8, z: GOAL.z }, list: [busho('二階堂行親', { mustLive: false, invuln: false }), uS(5), uA(22)] },
        { name: '須賀川の鉄砲', from: { x: GOAL.x - 14, z: GOAL.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '須賀川城の二階堂勢を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KIDO.x + 40, z: KIDO.z - 10 }, obj: '町の入口の柵で、守る二階堂の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '柵を押し破れ', 3.2]],
      foes: [{ name: '二階堂の足軽', from: { x: KIDO.x + 52, z: KIDO.z - 22 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '町の入口の柵を破った' },
    { kind: 'hold', at: { x: KIDO.x - 10, z: KIDO.z + 20 }, label: '町の通りで、', obj: '町の通りで、横の路地から出る二階堂の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '路地から出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '路地の二階堂の兵', from: { x: KIDO.x + 2, z: KIDO.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '路地の二階堂の兵', from: { x: KIDO.x - 24, z: KIDO.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '町の通りを守った' },
    { kind: 'fight', at: { x: KIDO.x - 40, z: KIDO.z + 6 }, obj: '城の大手で、門を守る二階堂の旗本を崩す', max: 100, limit: 90,
      say: [['伊達政宗', '大手を破れ', 3.2]],
      foes: [{ name: '二階堂の旗本', from: { x: KIDO.x - 28, z: KIDO.z - 6 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '城の大手を破った' },
    { kind: 'hold', at: { x: KIDO.x - 90, z: KIDO.z - 8 }, label: '城の裏の道で', obj: '城の裏の道で、落ちて行く二階堂の殿を受け止める', r: 16, dur: 45,
      say: [['見張り', '殿が返す！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '二階堂の殿', from: { x: KIDO.x - 78, z: KIDO.z - 20 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '二階堂の殿', from: { x: KIDO.x - 104, z: KIDO.z + 6 }, list: [uS(2), uA(7)] }] }],
      reward: '城の裏の道を守った' },
    // K652②：城が落ちると、二階堂の家臣たちは城の裏から落ちて行った（『伊達日記』B）
    { kind: 'fight', at: OCHI, limit: 110, obj: '城の裏から落ちる二階堂の旗本の殿を払う', title: '落ち口', sub: '二階堂の家臣が、城の裏から落ちて行く',
      say: [['伊達政宗', '刃向かう殿だけを払え。落ちる者は追うな', 3.2]],
      foes: [{ name: '二階堂の殿', from: { x: OCHI.x + 8, z: OCHI.z + 6 }, list: [uS(3), uA(12)] }],
      reward: '二階堂の殿を払った' },
  ],
  update: umaTick,
  win: {
    banner: '須賀川城、落ちる', sub: '伊達は町の中の戦を制した。南奥州は政宗のものになった', award: '須賀川の町の中で馬印を押し出して戦った',
    say: [['片倉景綱', '須賀川、落ちました。町も無事にございます', 3.2],
      ['伊達政宗', 'これで奥羽に、伊達に並ぶ者は無い', 3.2]],
  },
});
e13_sukagawa.camPull = 1.6;
export default e13_sukagawa;
