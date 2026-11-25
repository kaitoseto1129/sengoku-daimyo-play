// 島津家編 9戦目「岩剣城の戦い」（天文二十三年（1554）八月　大隅国 岩剣城）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津貴久が、祁答院・蒲生・菱刈の拠る岩剣城を攻めた。義弘の初陣と伝わる（『島津国史』B・霧島市の解説 C）。兵数・城将の名は推。山城を曲輪ごとに登る攻め手の戦。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'kamou', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 70 };

export const s09_iwatsurugi = lightBattle({
  id: "s09_iwatsurugi",
  date: "天文二十三年（1554）八月　大隅国 岩剣城",
  intro: "険しい山の城、岩剣城。敵は蒲生・菱刈・祁答院の寄り合い。島津貴久の手が、曲輪を一つずつ登って攻める。",
  history: "天文二十三年（1554）八月、島津貴久は、祁答院・蒲生・菱刈らが拠る大隅の岩剣城を攻めた。城は険しい山にあり、攻めは長引いたが、落城した。島津義弘はこの戦が初陣と伝わる。島津はまだ九州最強ではなく、薩摩・大隅の小さな勢力どうしの争いだった。兵数は諸説ある（『島津国史』B・霧島市の解説 C）。",
  sides: { a: { name: "島津貴久の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "岩剣城の蒲生・菱刈・祁答院", mon: "kamou", faction: "kamou" } },
  force: { a: 3000, b: 2000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1554, time: "day", fogFar: 320,
    hills: [[0, -20, 70, 10], [-90, 20, 40, 7], [90, 20, 40, 7]],
    paths: [{ pts: [[0, 150], [0, 70], [0, 24], [0, -16], [0, -56], [6, -110]], w: 3 }],
    groves: [{ x: -80, z: 40, r: 26, n: 24 }, { x: 80, z: 40, r: 26, n: 24 }],
    trees: 280, tufts: 1300,
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義弘"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津義弘", "岩剣城は険しい。じゃが、わしの初陣じゃ。曲輪を一つずつ登る", 3.6], ["組頭", "石と矢が降る。盾を前に、足元を見て登れ", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "山の下の曲輪の城兵を押し返して登る", title: "岩剣城", sub: "険しい山の城", max: 110,
      say: [["城兵", "登らせるな！　石を落とせ！", 3]],
      foes: [{ name: "下の曲輪の城兵", from: { x: 0, z: 12 }, list: [uS(3), uA(14)] }, { name: "城の弓", from: { x: 10, z: 2 }, list: [uB(5)] }],
      reward: "山の下の曲輪を登った" },
    { kind: 'rest', dur: 8, heal: 0.4, say: [["組頭", "傷を縛れ。次は二の曲輪じゃ", 3]] },
    { kind: 'fight', at: { x: 0, z: -16 }, obj: "二の曲輪で、蒲生・菱刈の兵を破る", title: "二の曲輪", sub: "三家の寄り合いの兵", max: 110,
      say: [["蒲生の侍", "島津を落とせ！　城を守れ！", 3]],
      foes: [{ name: "蒲生の兵", from: { x: -6, z: -28 }, list: [uS(3), uA(12)] }, { name: "菱刈の兵", from: { x: 8, z: -34 }, list: [uS(2), uA(10), uG(3)] }],
      reward: "二の曲輪を破った" },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "本丸で、城将の祁答院勢を討つ", title: "本丸", sub: "城将の旗本", max: 150,
      say: [["島津義弘", "あの旗じゃ！　本丸へ押せ！", 3]],
      foes: [{ name: "祁答院の旗本", from: { x: 0, z: -68 }, list: [busho('祁答院良重', { horse: false }), uS(3), uA(10)] }],
      later: [{ t: 30, say: ["城兵", "後詰が来るまで持たせよ！"], foes: [{ name: "本丸の城兵", from: { x: -10, z: -76 }, list: [uS(2), uA(8)] }] }],
      reward: "岩剣城の本丸を落とした" },
  ],
  win: {
    banner: "岩剣城 落ちる", sub: "険しい山城を、曲輪ごとに登りきった", award: "岩剣城を攻め落とし、島津の初陣を勝たせた",
    say: [["組頭", "城が落ちた。義弘様の初陣は勝ちじゃ", 3.2], ["島津貴久", "薩摩・大隅はまだ小さな国どうしの争いじゃ。気を抜くな", 3.4]],
  },
});
export default s09_iwatsurugi;
