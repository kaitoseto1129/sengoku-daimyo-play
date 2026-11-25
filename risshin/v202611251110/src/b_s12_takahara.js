// 島津家編 12戦目「高原城の戦い」（天正四年（1576）八月　日向国 高原城）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津義久・義弘が、伊東方の高原城を囲み、水の手を断って開城させた。これを境に伊東の崩れが始まる（『上井覚兼日記』A・小林市の解説 C）。城将の名・兵数は推。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'ito', armor: 0x2a2a30 };
const SPAWN = { x: 0, z: 70 };

export const s12_takahara = lightBattle({
  id: "s12_takahara",
  date: "天正四年（1576）八月　日向国 高原城",
  intro: "日向の山城、高原城。島津の兵は水の手の沢を押さえ、城を渇かせる。あなたは沢を守る足軽。",
  history: "天正四年（1576）八月、島津義久・義弘は、伊東方の高原城を囲んだ。島津勢は城の水の手を断ち、城兵は水に困って開城した。この城を失った伊東義祐は力を落とし、日向の伊東の崩れが始まった。城将の名・兵数は諸説ある（『上井覚兼日記』A・小林市の解説 C）。",
  sides: { a: { name: "島津義久・義弘の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "高原城の伊東方", mon: "ito", faction: "ito" } },
  force: { a: 8000, b: 4000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1576, time: "day", fogFar: 300,
    hills: [[0, -50, 60, 16], [-80, 10, 40, 8], [80, 10, 40, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [-10, 24], [0, -16], [0, -60]], w: 3 }],
    groves: [{ x: -70, z: 40, r: 26, n: 26 }, { x: 70, z: 40, r: 26, n: 26 }],
    trees: 320, tufts: 1300,
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義弘"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津義弘", "高原城は山の上。攻めれば損が多い。水の手を断つ", 3.6], ["組頭", "沢を押さえよ。城から水を汲みに出る者を一人も通すな", 3.2]] },
    { kind: 'move', at: { x: 0, z: 24 }, label: "水の手の沢", obj: "水の手の沢まで進む", r: 12, max: 90,
      say: [["島津義弘", "沢へ急げ。城の水は、あそこから来る", 3]] },
    { kind: 'hold', at: { x: 0, z: 24 }, label: "水の手の沢", obj: "沢を守り、水を取りに出る城兵を押し返す", r: 16, dur: 70, title: "水の手", sub: "沢を押さえる",
      say: [["組頭", "ここを取られるな。一日で城は渇く", 3]],
      waves: [{ t: 6, say: ["城兵", "水を取れ！　沢へ出ろ！"], foes: [{ name: "水を取りに出る城兵", from: { x: 0, z: 6 }, list: [uS(2), uA(10)] }] }, { t: 30, say: ["城兵", "皆で出るぞ！　押し破れ！"], foes: [{ name: "城兵の大勢", from: { x: -8, z: 2 }, list: [uS(3), uA(12), uG(3)] }] }],
      reward: "水の手の沢を守り抜いた" },
    { kind: 'rest', dur: 8, heal: 0.4, say: [["島津義弘", "城の水が尽きた。門が開く", 3]] },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "城門を破り、渇いた城兵を破る", title: "高原城", sub: "城門", max: 130,
      say: [["城兵", "もう水が無い……それでも退くな！", 3]],
      foes: [{ name: "城門の兵", from: { x: 0, z: -68 }, list: [busho('福永丹波', { horse: false }), uS(3), uA(10)] }],
      reward: "高原城の門を破った" },
  ],
  win: {
    banner: "高原城 開く", sub: "水を断って、山城を落とした", award: "水の手を断って高原城を落とした",
    say: [["島津義弘", "伊東の崩れが始まる。日向が動くぞ", 3.2]],
  },
});
export default s12_takahara;
