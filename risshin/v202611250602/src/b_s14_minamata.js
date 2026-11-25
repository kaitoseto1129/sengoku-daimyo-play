// 島津家編 14戦目「水俣城の戦い（肥後侵攻）」（天正九年（1581）九月　肥後国 水俣）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津義久・義弘が、相良義陽の水俣城を攻め、義陽は降った（『上井覚兼日記』A・水俣市の解説 C）。兵数は推。海沿いと山の戦、海からの補給を守る。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'sagara', armor: 0x3a2a28 };
const SPAWN = { x: 0, z: 70 };

export const s14_minamata = lightBattle({
  id: "s14_minamata",
  date: "天正九年（1581）九月　肥後国 水俣",
  intro: "肥後の水俣。相良義陽の水俣城を、山と海から攻める。島津は海から兵糧を運ぶ。あなたは補給の道を守る足軽。",
  history: "天正九年（1581）、島津義久・義弘は肥後の相良義陽を攻め、水俣城を囲んだ。海からは船で兵糧が運ばれ、山からは兵が城へ迫った。相良義陽は降り、島津は肥後へ勢いを広げた。兵数は諸説ある（『上井覚兼日記』A・水俣市の解説 C）。",
  sides: { a: { name: "島津義久・義弘の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "相良義陽の軍", mon: "sagara", faction: "sagara" } },
  force: { a: 12000, b: 7000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1581, time: "day", fogFar: 340,
    sea: [{ pts: [[-120, -220], [-120, 0], [-120, 220]], w: 60, depth: 0.6, still: false, levelAt: () => -0.4 }],
    hills: [[60, -30, 60, 14], [-40, -90, 40, 8], [120, 40, 40, 7]],
    paths: [{ pts: [[-20, 150], [-10, 70], [0, 24], [8, -16], [0, -56], [0, -110]], w: 3 }],
    groves: [{ x: 70, z: 50, r: 26, n: 26 }, { x: 40, z: -70, r: 22, n: 20 }],
    trees: 260, tufts: 1200,
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義弘"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津義弘", "水俣城は海と山の間。船で兵糧を運び、山から攻める", 3.6], ["組頭", "荷駄の道を守れ。山の相良が奪いに来る", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "浜の道に出る相良の砦の兵を押し返す", title: "水俣", sub: "海沿いの道", max: 110,
      say: [["相良の侍", "島津の船を近づけるな！", 3]],
      foes: [{ name: "浜の砦の兵", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }, { name: "砦の鉄砲", from: { x: 10, z: 4 }, list: [uG(4)] }],
      reward: "浜の砦を押し返した" },
    { kind: 'hold', at: { x: 0, z: -16 }, label: "補給の道", obj: "荷駄の道を守り、山から降る相良の兵を受け止める", r: 18, dur: 65, title: "荷駄の道", sub: "山と海の間",
      say: [["島津義弘", "荷駄を守り抜け。城は兵糧が尽きれば落ちる", 3]],
      waves: [{ t: 6, say: ["相良の侍", "荷駄を奪え！"], foes: [{ name: "山の相良勢", from: { x: 20, z: -30 }, list: [uS(2), uA(10)] }] }, { t: 30, say: ["相良の侍", "もう一度じゃ！　山から下りよ！"], foes: [{ name: "相良の二の手", from: { x: 24, z: -36 }, list: [uS(3), uA(12), uG(2)] }] }],
      reward: "補給の道を守った" },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "水俣城の門で、相良義陽の旗本を破る", title: "水俣城", sub: "義陽の旗本", max: 140,
      say: [["島津義弘", "城の兵糧は尽きた。門を破れ", 3]],
      foes: [{ name: "相良義陽の旗本", from: { x: 0, z: -68 }, list: [busho('相良義陽', { horse: true }), uS(3), uA(12)] }],
      reward: "水俣城の門を破った" },
  ],
  win: {
    banner: "水俣城 降る", sub: "海と山から攻め、肥後へ進んだ", award: "水俣城を攻め、相良義陽を降した",
    say: [["島津義弘", "肥後が開けた。九州の中ほどまで、島津の旗が届く", 3.4]],
  },
});
export default s14_minamata;
