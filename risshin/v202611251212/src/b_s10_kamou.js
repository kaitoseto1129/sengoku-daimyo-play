// 島津家編 10戦目「蒲生合戦」（弘治三年（1557）四月　大隅国 蒲生）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津貴久が、大隅の蒲生範清の蒲生城を攻め、落とした（『島津国史』B・姶良市の解説 C）。兵数は推。山の道と林の泥臭い戦。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'kamou', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 70 };

export const s10_kamou = lightBattle({
  id: "s10_kamou",
  date: "弘治三年（1557）四月　大隅国 蒲生",
  intro: "大隅の山の中。蒲生範清の兵が山道と林に潜む。島津貴久の手が、泥の道を押して蒲生城へ迫る。",
  history: "弘治三年（1557）、島津貴久は大隅の蒲生範清を攻め、蒲生城を落とした。山道と林が多く、小さな競り合いを重ねる泥臭い戦だった。この戦で島津は大隅の北の守りを固め、薩摩・大隅の統一へ進んだ。兵数は諸説ある（『島津国史』B・姶良市の解説 C）。",
  sides: { a: { name: "島津貴久の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "蒲生範清の軍", mon: "kamou", faction: "kamou" } },
  force: { a: 4000, b: 5000 },
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1557, time: "day", fogFar: 300, overcast: true,
    hills: [[-30, -10, 60, 11], [70, 30, 45, 8], [-110, 40, 40, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [-8, 24], [4, -16], [-6, -56], [0, -110]], w: 3 }],
    groves: [{ x: -60, z: 10, r: 30, n: 34 }, { x: 60, z: -10, r: 30, n: 34 }, { x: 0, z: -80, r: 22, n: 22 }],
    trees: 400, tufts: 1400,
  },
  allies: [
    { name: "島津貴久の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津貴久"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津貴久", "蒲生は山と林を知り尽くしておる。道を外れるな", 3.4], ["組頭", "泥で足が重い。槍を揃えて、一歩ずつ押せ", 3.2]] },
    { kind: 'fight', at: { x: 0, z: 24 }, obj: "山道の入口に出る蒲生の先手を押し返す", title: "蒲生", sub: "山道の泥の戦", max: 110,
      say: [["蒲生の侍", "島津を山から出すな！", 3]],
      foes: [{ name: "蒲生の先手", from: { x: 0, z: 12 }, list: [uS(3), uA(12)] }, { name: "蒲生の弓", from: { x: 12, z: 4 }, list: [uB(4)] }],
      reward: "山道の入口を押し返した" },
    { kind: 'move', at: { x: 0, z: -16 }, label: "林の道", obj: "林の道を抜けて、蒲生城の下へ進む", r: 12, max: 100,
      say: [["組頭", "林から矢が来るぞ。走り抜けよ", 3]] },
    { kind: 'hold', at: { x: 0, z: -16 }, label: "林の道", obj: "林の中で、左右から出る蒲生の兵を受け止める", r: 16, dur: 60, title: "林の戦", sub: "入り乱れる",
      say: [["島津貴久", "林の戦じゃ。旗を見失うな", 3]],
      waves: [{ t: 5, say: ["蒲生の侍", "林から出たぞ！"], foes: [{ name: "蒲生の伏せ（西）", from: { x: -30, z: -22 }, list: [uS(2), uA(10)] }] }, { t: 25, say: ["蒲生の侍", "東からも回れ！"], foes: [{ name: "蒲生の伏せ（東）", from: { x: 30, z: -22 }, list: [uS(2), uA(10), uG(2)] }] }],
      reward: "林の中の伏せを受け止めた" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    fightS({ x: 40, z: -30 }, '北村の砦の蒲生の兵を破る', '北村の砦', '蒲生の支えの砦', [['島津貴久', '蒲生の城の支えを一つずつ折る', 3]],
      [foe('北村の砦の兵', 46, -44, [uS(2), uA(12)])], { later: [wave(28, '蒲生の侍', '砦を守れ！', [foe('北村の砦の弓', 60, -30, [uS(1), uB(6)])])], reward: '北村の砦を破った' }),
    holdS({ x: -30, z: -40 }, '城の下の田', '城の下の田で、菱刈の後詰を受ける', '菱刈の後詰', '菱刈が蒲生を助けに来る', [['組頭', '菱刈の旗じゃ！　後詰が来たぞ！', 3]],
      [wave(0, '菱刈の侍', '蒲生を助けよ！', [foe('菱刈の後詰', -70, -40, [uS(2), uA(12)])]), wave(30, '菱刈の侍', '横から回れ！', [foe('菱刈の後詰の二', -50, -10, [uS(2), uA(10)])]),
        wave(52, '蒲生の侍', '城からも打って出よ！', [foe('蒲生の打って出', -20, -70, [uS(1), uA(8), uG(2)])])], { reward: '菱刈の後詰を退けた' }),
    fightS({ x: 20, z: -44 }, '城の外の堀の際で、蒲生の鉄砲衆を払う', '堀の際', '堀の内から鉄砲が撃つ', [['島津貴久', '門へ寄る前に、堀の鉄砲を黙らせよ', 3]],
      [foe('堀の際の鉄砲衆', 26, -58, [uS(1), uG(6)]), foe('堀の際の槍', 10, -62, [uS(2), uA(10)])], { later: [wave(28, '蒲生の侍', '堀を越えさせるな！', [foe('堀の際の守り', 40, -50, [uS(2), uA(8)])])], reward: '堀の際の鉄砲衆を払った' }),
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "蒲生城の門で、蒲生範清の旗本を討つ", title: "蒲生城", sub: "範清の旗本", max: 140,
      say: [["島津貴久", "城が見えた。門を破れ！", 3]],
      foes: [{ name: "蒲生範清の旗本", from: { x: 0, z: -68 }, list: [busho('蒲生範清', { horse: true }), uS(3), uA(12)] }],
      reward: "蒲生城の門を破った" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '範清は城を捨てて逃げた。じゃが本丸にまだ兵がおる', 3]]),
    fightS({ x: 0, z: -84 }, '本丸に籠る蒲生の兵を討つ', '本丸', '逃げ遅れた蒲生の兵', [['島津貴久', '本丸を取れば、蒲生は島津のものじゃ', 3]],
      [foe('本丸の蒲生の兵', 0, -98, [uS(3), uA(12)])], { later: [wave(28, '蒲生の侍', '殿の城を守れ！', [foe('本丸の鉄砲', -16, -104, [uS(1), uG(5)])])], reward: '蒲生城を取った' }),
  ],
  win: {
    banner: "蒲生城 落ちる", sub: "泥の山道を押し通した", award: "蒲生城を攻め落とした",
    say: [["組頭", "蒲生城が落ちた。大隅の北が島津の物になる", 3.2]],
  },
});
export default s10_kamou;
