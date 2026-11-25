// 島津家編 13戦目「日向の追撃（三州統一）」（天正五年（1577）十二月　日向国 縣への道）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：高原城の後、伊東義祐は日向を捨てて豊後の大友を頼った。島津は日向を取り、薩摩・大隅・日向の三州をまとめた（『上井覚兼日記』A）。追撃の戦の詳しい場所・兵数は推（出所と「推した」訳：伊東の退去の道を一つの追撃戦にまとめた）。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'ito', armor: 0x2a2a30 };
const SPAWN = { x: 0, z: 70 };

export const s13_hyuga = lightBattle({
  id: "s13_hyuga",
  date: "天正五年（1577）十二月　日向国 縣への道",
  intro: "伊東義祐が日向を捨てて、豊後へ逃げる。島津の兵は、殿の伊東勢を追い散らして道を進む。",
  history: "天正五年（1577）十二月、高原城を失った伊東義祐は、日向を捨てて豊後の大友宗麟を頼った。島津は日向の城を次々に取り、薩摩・大隅・日向の三つの国をまとめた（三州統一）。この追撃戦の場所と兵数は、伊東の退去の道を一つにまとめたもので、確かでない（『上井覚兼日記』A）。",
  sides: { a: { name: "島津の追撃軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "退く伊東勢", mon: "ito", faction: "ito" } },
  force: { a: 10000, b: 5000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1577, time: "day", fogFar: 320, overcast: true,
    hills: [[0, -20, 70, 10], [-90, 20, 40, 7], [90, 20, 40, 7]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -16], [0, -56], [6, -110]], w: 3 }],
    groves: [{ x: -80, z: 40, r: 26, n: 24 }, { x: 80, z: 40, r: 26, n: 24 }],
    trees: 280, tufts: 1300,
  },
  allies: [
    { name: "島津義久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [["島津義久", "伊東は豊後へ逃げる。道に殿を残し、足を遅らせる気じゃ", 3.4], ["組頭", "追え。じゃが、先走るな。殿は手強い", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "道に残った伊東の殿を破る", title: "伊東の殿", sub: "逃げる軍の後ろ", max: 110,
      say: [["伊東の侍", "殿の務めじゃ！　ここで止めよ！", 3]],
      foes: [{ name: "伊東の殿", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }],
      reward: "伊東の殿を破った" },
    { kind: 'move', at: { x: 0, z: -16 }, label: "峠の道", obj: "逃げる伊東勢を追って、峠の道を進む", r: 12, max: 100,
      say: [["島津義久", "荷駄が落ちておる。急げ、追いつくぞ", 3]] },
    { kind: 'fight', at: { x: 0, z: -16 }, obj: "峠で踏みとどまる伊東の備を破る", title: "峠の戦", sub: "最後の抵抗", max: 110,
      say: [["伊東の侍", "殿を豊後へお送りせよ！", 3]],
      foes: [{ name: "峠の伊東勢", from: { x: 0, z: -28 }, list: [uS(3), uA(12), uG(3)] }],
      later: [{ t: 30, say: ["伊東の侍", "もう持たぬ……"], foes: [{ name: "伊東の後詰", from: { x: -10, z: -36 }, list: [uS(2), uA(8)] }] }],
      reward: "峠の伊東勢を破った" },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "縣の入口で、伊東の旗本を追い散らす", title: "日向の城", sub: "伊東の最後の旗本", max: 130,
      say: [["島津義久", "日向はもう島津の物じゃ。追い切れ", 3]],
      foes: [{ name: "伊東の旗本", from: { x: 0, z: -68 }, list: [busho('伊東の殿', { horse: true }), uS(3), uA(10)] }],
      reward: "伊東の旗本を追い散らした" },
  ],
  win: {
    banner: "三州統一", sub: "日向を取り、薩摩・大隅・日向がまとまった", award: "伊東勢を追い、日向を取って三州をまとめた",
    say: [["島津義久", "薩摩・大隅・日向。三つの国が島津の物になった", 3.4], ["組頭", "じゃが、豊後の大友が黙ってはおらぬぞ", 3.2]],
  },
});
export default s13_hyuga;
