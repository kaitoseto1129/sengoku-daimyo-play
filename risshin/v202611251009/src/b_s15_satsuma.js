// 島津家編 15戦目「薩摩撤退（九州征伐）」（天正十五年（1587）五月　薩摩国 川内への道）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：根白坂の後、島津義久は豊臣秀吉に降り、島津は薩摩へ退いた（『九州御動座記』B・薩摩川内市の解説 C）。この戦（殿として退く）は、史実の退きを一つの戦にまとめた推。勝ち負けでなく、退いて生き延びるのが目標（K509）。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'toyotomi', armor: 0x2a3a52 };
const SPAWN = { x: 0, z: -20 };

export const s15_satsuma = lightBattle({
  id: "s15_satsuma",
  date: "天正十五年（1587）五月　薩摩国 川内への道",
  intro: "根白坂の後、島津は本国の薩摩まで退く。豊臣の大軍が追う。あなたは殿の足軽。川内まで退き切る。",
  history: "天正十五年（1587）五月、根白坂の後、島津義久は川内の泰平寺で豊臣秀吉に降った。九州制覇の寸前だった島津は、薩摩・大隅と日向の一部を残して退いた。この戦の追う豊臣勢と退く道の場所・兵数は、史実の退きを一つにまとめたもので、確かでない（『九州御動座記』B・薩摩川内市の解説 C）。",
  sides: { a: { name: "島津の殿", mon: 'shimazu', faction: 'shimazu' }, b: { name: "追う豊臣勢", mon: "toyotomi", faction: "toyotomi" } },
  force: { a: 10000, b: 100000 },
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.45, friendsSend: 2, minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1587, time: "day", fogFar: 300, overcast: true,
    hills: [[0, 40, 70, 10], [-90, 20, 40, 8], [90, 20, 40, 8]],
    paths: [{ pts: [[0, -120], [0, -20], [0, 40], [0, 90], [0, 140]], w: 3 }],
    groves: [{ x: -80, z: 20, r: 26, n: 24 }, { x: 80, z: 20, r: 26, n: 24 }],
    trees: 260, tufts: 1200,
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho('島津義弘'), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + -2 }, list: [uS(1), uG(8)] },
    { name: "殿の槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + -8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [["島津義久", "もはや戦に勝つ時ではない。本国まで退き、家を残す", 3.6], ["組頭", "殿は我らじゃ。追う敵を止めて、また退け", 3.2]] },
    { kind: 'fight', at: { x: 0, z: -10 }, obj: "追ってくる豊臣の先手を止める", title: "殿", sub: "追う先手を止める", max: 110,
      say: [["豊臣の侍", "島津は崩れたぞ！　追え！", 3]],
      foes: [{ name: "豊臣の先手", from: { x: 0, z: -50 }, list: [uS(3), uA(12)] }],
      reward: "追う先手を止めた" },
    { kind: 'move', at: { x: 0, z: 80 }, label: "川内の渡", obj: "川内の渡まで退く", r: 12, max: 100,
      say: [["島津義久", "退け！　渡まで退け！", 3], ["豊臣の侍", "逃がすな！", 3]] },
    { kind: 'hold', at: { x: 0, z: 80 }, label: "川内の渡", obj: "渡で踏みとどまり、追う豊臣勢を受け止める", r: 18, dur: 60, title: "渡の殿", sub: "退く本隊のために",
      say: [["組頭", "ここで食い止めよ。本隊が渡る時を稼ぐ", 3]],
      waves: [{ t: 6, say: ["豊臣の侍", "渡を押さえよ！"], foes: [{ name: "豊臣の二の手", from: { x: -10, z: 30 }, list: [uS(3), uA(12)] }] }, { t: 30, say: ["豊臣の侍", "大軍で押し潰せ！"], foes: [{ name: "豊臣の大勢", from: { x: 10, z: 24 }, list: [uS(3), uA(14), uG(3)] }] }],
      reward: "渡で追手を食い止めた" },
    { kind: 'move', at: { x: 0, z: 130 }, label: "川内", obj: "川内の泰平寺まで退き切る", r: 14, max: 110,
      say: [["島津義久", "泰平寺が見えた。あそこで、わしが関白に会う", 3.2]] },
  ],
  win: {
    banner: "薩摩へ退いた", sub: "殿を務め、本国まで生き延びた", award: "殿として退き、薩摩まで生き延びた",
    say: [["島津義久", "島津は残った。それが何より大事じゃ", 3.2], ["組頭", "生きて帰った。それが殿の勝ちじゃ", 3.2]],
  },
});
export default s15_satsuma;
