// 島津家編 11戦目「菱刈合戦」（永禄九年（1566）頃　薩摩国 北薩の川）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：北薩の菱刈氏が相良氏の助けを受けて島津と争った（『島津国史』B・『相良家文書』A）。年・兵数・川の名は推（一六〇年代、とだけ分かる）。旗が近すぎて入り乱れる戦。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'hishikari', armor: 0x2a3036 };
const SPAWN = { x: 0, z: 70 };

export const s11_hishikari = lightBattle({
  id: "s11_hishikari",
  date: "永禄九年（1566）頃　薩摩国 北薩の川",
  intro: "北薩の川の岸。菱刈と相良の旗が近すぎて、敵味方の見分けも付かぬ。島津の手が、川を渡って押し合う。",
  history: "永禄の頃（1560年代）、北薩の菱刈氏は、肥後の相良氏の助けを受け、島津と戦った。川と山に挟まれた狭い土地で、両軍の旗が近く、敵味方が入り乱れる戦になった。ここでの勝ちが、島津の北薩支配の足がかりになった。年・兵数は諸説あり、確かでない（『島津国史』B・『相良家文書』A）。",
  sides: { a: { name: "島津の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "菱刈・相良の軍", mon: "hishikari", faction: "hishikari" } },
  force: { a: 5000, b: 5000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1566, time: "day", fogFar: 320,
    river: [[-200, 0], [-80, -2], [0, 4], [80, 2], [200, 6]], riverW: 14,
    hills: [[-90, -50, 45, 8], [90, -50, 45, 8], [0, 150, 70, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -30], [0, -80]], w: 3 }],
    groves: [{ x: -80, z: 50, r: 24, n: 22 }, { x: 80, z: 50, r: 24, n: 22 }],
    trees: 240, tufts: 1300,
  },
  allies: [
    { name: "島津義久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津義久", "菱刈に、相良が加勢しておる。旗が近い。味方の旗をよう見よ", 3.6], ["組頭", "川を渡って押す。向こう岸で崩されるな", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "川の手前に出た菱刈の先手を押し返す", title: "菱刈", sub: "川の岸の戦", max: 110,
      say: [["菱刈の侍", "川を渡らせるな！", 3]],
      foes: [{ name: "菱刈の先手", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }],
      reward: "川の手前を押し返した" },
    { kind: 'move', at: { x: 0, z: -30 }, label: "川の向こう", obj: "川を渡って、向こう岸の備へ進む", r: 12, max: 100,
      say: [["島津義久", "渡れ！　流れは浅い！", 3]] },
    { kind: 'hold', at: { x: 0, z: -30 }, label: "川の向こう", obj: "向こう岸で、入り乱れる敵を受け止める", r: 18, dur: 60, title: "入り乱れる", sub: "旗が近すぎる",
      say: [["組頭", "旗をよく見よ！　赤い縁が味方じゃ", 3]],
      waves: [{ t: 5, say: ["相良の侍", "相良勢、前へ！"], foes: [{ name: "相良の加勢", from: { x: -14, z: -44 }, list: [uS(3), uA(12)] }] }, { t: 28, say: ["菱刈の侍", "菱刈の本隊、押せ！"], foes: [{ name: "菱刈の本隊", from: { x: 14, z: -48 }, list: [uS(3), uA(12), uG(2)] }] }],
      reward: "入り乱れる中を持ちこたえた" },
    { kind: 'fight', at: { x: 0, z: -70 }, obj: "菱刈の大将の備を崩す", title: "菱刈の旗本", sub: "大将の備", max: 140,
      say: [["島津義久", "あの菱の旗じゃ！　討て！", 3]],
      foes: [{ name: "菱刈の旗本", from: { x: 0, z: -82 }, list: [busho('菱刈重豊', { horse: true }), uS(3), uA(10)] }],
      reward: "菱刈の旗本を崩した" },
  ],
  win: {
    banner: "菱刈勢 崩れる", sub: "入り乱れる川の戦を勝った", award: "菱刈・相良の軍を川の戦で破った",
    say: [["島津義久", "旗の見分けを誤らなんだ。よう戦うた", 3.2]],
  },
});
export default s11_hishikari;
