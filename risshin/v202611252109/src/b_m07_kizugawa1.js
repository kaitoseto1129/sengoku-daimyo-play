// 毛利家編 七戦目「第一次木津川口の戦い」（天正四年〔1576〕七月・摂津国 木津川口）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）
//   史実：石山本願寺は織田信長に囲まれ、毛利輝元へ兵糧を乞うた。村上武吉・乃美宗勝らの毛利水軍（約六百艘）が木津川口へ入り、
//   織田水軍（真鍋・沼間ら約三百艘）を、焙烙火矢で大船ごと焼いて破り、本願寺へ兵糧を入れた（『信長公記』A・『毛利家文書』A。数は通説）。
//   織田家編の木津川口（b_kizugawa.js）の側を入れ替えた戦。調略は無し（海の戦が主）。厳島と同じ海（light_battle.js の sea・coast）と kobune を使い回す
//   本人は毛利の水軍の足軽。浜の舟溜まりで焙烙の箱を受け取り、浜に寄せた織田の舟の兵を討つ。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { kobune, nobori } from './props.js';
import { funeJirushi } from './house_gear.js';   // H3 船印（毛利の赤旗・村上の丸に上）
import { kizuBay1576, kizuBay1576Tick } from './kizu_bay.js';   // K657② 湾・燃える舟
// 村上武吉の手は背に村上の丸に上（能島村上の過所船旗。docs/house_gear_1124.md）
const murakamiFlag = (l) => l.map((s) => ({ ...s, o: { ...(s.o || {}), flag: 'murakami' } }));

const MORI = { flag: 'mori', armor: 0x2a2622 };
const ODA = { flag: 'oda', armor: 0x34322e };
const coast = (x) => -74 + Math.sin(x * 0.019) * 4;   // 北の海の岸（木津川口の浜）
const SPAWN = { x: 120, z: -62 };          // 毛利水軍の舟溜まり
const HOROKU = { x: 78, z: -58 };          // 焙烙火矢を積んだ舟
const SHORE = { x: 30, z: -52 };           // 浜（織田の小舟が寄る）
const SHORE2 = { x: -34, z: -46 };         // 織田の大船が寄せる浜
const BACK = { x: -90, z: -30 };           // 織田の殿が引く先（河口の内）
const TORIDE = { x: -40, z: 18 };          // 岸の上の織田の砦の口（住吉・木津の砦の兵・K652②）
const NIAGE = { x: -110, z: -12 };         // 本願寺への兵糧の荷揚げ場（K652②）

function scene(rt) {
  const W = rt.world;
  const at = (x, z) => Math.max(-0.5, W.heightAt(x, z)) + 0.05;
  // 浜の毛利の舟溜まり（舟の毛利勢の見た目）
  for (let i = 0; i < 8; i++) {
    const x = 90 + i * 7 + ((i * 5) % 3), z = coast(x) - 2 - (i % 3) * 3;
    try { const b = funeJirushi(kobune(x, at(x, z), z, Math.PI * 0.5 + ((i * 3) % 5 - 2) * 0.06, 8 + (i % 2)), 8 + (i % 2), i % 2 ? 'murakami' : 'mori'); if (b) rt.scene.add(b); } catch (e) { /* 舟の形が無くても戦は続ける */ }
  }
  // 沖を埋める毛利水軍の舟（見た目だけ・六百艘を軽く見せる）
  for (let i = 0; i < 18; i++) {
    const x = -160 + i * 20 + ((i * 13) % 9), z = coast(x) - 36 - (i % 4) * 13;
    try { const b = funeJirushi(kobune(x, -0.45, z, Math.PI * 0.5 + ((i * 11) % 7 - 3) * 0.08, 9 + (i % 3)), 9 + (i % 3), i % 3 === 1 ? 'murakami' : 'mori'); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
  // 織田の大船：K657②（11/25 わ）織田家編の安宅船の形で四艘。段が進むと焙烙で燃える。湾の澪標と河口の葦も（kizu_bay.js）
  kizuBay1576(rt, coast);
  try { for (const [dx, dz] of [[-4, 4], [8, 6]]) rt.scene.add(nobori(W, SHORE2.x + dx, SHORE2.z + dz, 'oda', 5.5)); } catch (e) { /* 小道具が無くても戦は続ける */ }
}

export const m07_kizugawa1 = lightBattle({
  id: 'm07_kizugawa1',
  date: '天正四年（1576）七月　昼　摂津国 木津川口',
  intro: '石山本願寺は織田に囲まれ、兵糧が尽きかけている。毛利水軍は木津川口へ入り、焙烙火矢で織田の舟を焼いて兵糧を入れる。',
  history: '天正四年（1576）七月、織田信長に囲まれた石山本願寺は毛利輝元に兵糧を乞うた。村上武吉・乃美宗勝らの毛利水軍は、およそ六百艘で木津川口へ入った。織田水軍は真鍋・沼間らの約三百艘。毛利の舟は焙烙火矢（火薬を詰めた焼き玉）を投げて織田の大船へ寄り、次々と焼いた。織田水軍は崩れ、毛利は本願寺へ兵糧を入れた（『信長公記』・『毛利家文書』。数は通説）。',
  sides: { a: { name: '毛利水軍', mon: 'mori', faction: 'mori' }, b: { name: '織田水軍', mon: 'oda', faction: 'oda' } },
  force: { a: 6000, b: 3000 },
  allyLook: MORI, foeLook: ODA,
  thick: true,
  noMarch: true,   // 舟溜まりの浜から始める（行軍の入りは海へ道を引く）
  allyDmg: 0.35,
  foeDmg: 0.7,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.5 },
  world: {
    seed: 1576, time: 'day', fogFar: 330,
    coast,
    sea: [{ pts: [[-320, -150], [0, -152], [320, -150]], w: 74, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[100, 40, 56, 10], [-60, 60, 70, 8], [-150, 20, 50, 7]],
    paths: [{ pts: [[130, -62], [78, -58], [30, -52], [-34, -46], [-90, -30]], w: 2.6 }],
    groves: [{ x: 90, z: 30, r: 30, n: 26 }, { x: -110, z: 50, r: 34, n: 26 }],
    trees: 300, tufts: 1500,
    tint(x, z, h, c) {
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.14 * k, c.g * (1 - k) + 0.2 * k, c.b * (1 - k) + 0.24 * k); return; }
      if (z < cz + 9) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.54 * k, c.g * (1 - k) + 0.5 * k, c.b * (1 - k) + 0.42 * k); }
    },
  },
  allies: [
    { name: '村上武吉の手', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, fixed: true, list: murakamiFlag([busho('村上武吉'), uS(5), uA(8)]) },
    { name: '乃美宗勝の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 8 }, list: [busho('乃美宗勝'), uS(3), uA(12)] },
    { name: '焙烙衆', at: { x: SPAWN.x + 12, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  update: kizuBay1576Tick,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['村上武吉', '本願寺の兵糧が尽きる。今日、木津川口を抜く', 3.4],
      ['乃美宗勝', '織田の舟は大きいが、足が遅い。焙烙で焼けば、一艘ずつ燃える', 3.6],
      ['村上武吉', '焙烙の舟へ走れ。箱を受け取って、浜の織田勢に備えよ', 3.4]] },
    { kind: 'move', at: HOROKU, label: '焙烙の舟', obj: '焙烙火矢を積んだ舟へ走る', r: 12, max: 120,
      say: [['組頭', '焙烙の箱は軽くはない。落とすなよ', 3]] },
    { kind: 'fight', at: SHORE, obj: '浜に寄せた織田の小舟の兵を討つ', title: '木津川口の浜', sub: '織田の小舟が浜へ寄せて来る',
      say: [['村上武吉', '焙烙を投げよ！　織田の舟を寄せるな！', 3.2]],
      foes: [{ name: '織田の小舟の兵', from: { x: SHORE.x + 6, z: SHORE.z + 6 }, list: [uS(3), uA(16)] }, { name: '織田の鉄砲', from: { x: SHORE.x - 10, z: SHORE.z + 4 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '織田の二の舟が来るぞ！'], foes: [{ name: '織田の二の舟の兵', from: { x: SHORE.x + 18, z: SHORE.z + 22 }, list: [uS(2), uA(12)] }] }],
      reward: '木津川口の浜で織田の小舟の兵を破った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'hold', at: SHORE2, label: '大船の寄せる浜', obj: '火を逃れて浜へ上がる織田の兵を受け止める', r: 16, dur: 65,
      title: '大船の炎上', sub: '焙烙で燃える織田の大船から兵が上がる',
      say: [['乃美宗勝', '大船が燃えた！　逃げて来る兵が浜へ上がるぞ！　槍を揃えよ！', 3.2]],
      waves: [{ t: 6, say: ['真鍋', '舟を捨てるな！　浜で踏みとどまれ！'], foes: [{ name: '真鍋の手', from: { x: SHORE2.x + 8, z: SHORE2.z + 36 }, list: [uS(3), uA(14)] }] },
        { t: 36, say: ['組頭', 'まだ上がって来るぞ！　退くな！'], foes: [{ name: '沼間の手', from: { x: SHORE2.x - 14, z: SHORE2.z + 36 }, list: [uS(2), uA(12)] }] }],
      reward: '燃える大船から上がる織田の兵を受け止めた' },
    // K652②（11/25 Sanae・10分）：海の戦と同じ日に、本願寺の門徒は陸の織田の砦（木津・住吉）へ打って出た（『信長公記』A）。岸の上の砦の兵を払う
    { kind: 'fight', at: TORIDE, obj: '岸の上の織田の砦から出る兵を払う', title: '岸の砦', sub: '陸からも織田が浜を狙う',
      say: [['乃美宗勝', '岸の上の砦から織田が下りて来る！　浜を挟まれるな！', 3.2], ['組頭', '門徒衆も砦を攻めておる。こちらは下りる口を押さえよ', 3.2]],
      foes: [{ name: '織田の砦の兵', from: { x: TORIDE.x + 8, z: TORIDE.z + 14 }, list: [uS(3), uA(14)] }, { name: '砦の鉄砲', from: { x: TORIDE.x - 12, z: TORIDE.z + 18 }, list: [uS(1), uB(5)] }],
      reward: '岸の上の織田の砦の兵を払った' },
    { kind: 'fight', at: BACK, obj: '河口の内へ引く織田の殿を追う', title: '河口の内', sub: '織田水軍は河口の内へ退いていく',
      say: [['村上武吉', '本願寺へ兵糧の舟を通す。織田の殿を河口から払え', 3.2]],
      foes: [{ name: '織田水軍の殿', from: { x: BACK.x + 6, z: BACK.z - 8 }, list: [uS(4), uA(12)] }],
      reward: '河口の内で織田水軍の殿を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SHORE.x + 40, z: SHORE.z + 0 }, obj: '舟溜まりの外で、近づく織田の小舟の足軽を討つ', max: 100, limit: 90,
      say: [['村上武吉', '小舟を寄せさせるな', 3.2]],
      foes: [{ name: '織田の小舟の足軽', from: { x: SHORE.x + 52, z: SHORE.z - 12 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '舟溜まりの外を守った' },
    { kind: 'hold', at: { x: SHORE.x - 20, z: SHORE.z + 20 }, label: '浜の砂で、上', obj: '浜の砂で、上がって来る織田の足軽を受け止める', r: 16, dur: 45,
      say: [['見張り', '織田が浜へ上がる！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '上がる織田の足軽', from: { x: SHORE.x - 8, z: SHORE.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '上がる織田の足軽', from: { x: SHORE.x - 34, z: SHORE.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '浜の砂を守った' },
    { kind: 'fight', at: { x: SHORE.x - 60, z: SHORE.z + 30 }, obj: '河口の内で、逃げる織田の殿の舟の兵を討つ', max: 100, limit: 90,
      say: [['村上武吉', '逃がすな。火矢を放て', 3.2]],
      foes: [{ name: '織田の殿の舟の兵', from: { x: SHORE.x - 48, z: SHORE.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '河口の内を押さえた' },
    { kind: 'hold', at: { x: SHORE.x - 30, z: SHORE.z + 0 }, label: '岸の砦の口で', obj: '岸の砦の口で、救いに出る織田の兵を受け止める', r: 16, dur: 45,
      say: [['見張り', '砦から救いが出る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '砦の織田の兵', from: { x: SHORE.x - 18, z: SHORE.z - 12 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '砦の織田の兵', from: { x: SHORE.x - 44, z: SHORE.z + 14 }, list: [uS(2), uA(7)] }] }],
      reward: '砦の口を守った' },
    // K652②：毛利水軍は本願寺へ兵糧を入れた（『信長公記』A）。荷を揚げ切るまで、荷揚げ場を守る
    { kind: 'hold', at: NIAGE, label: '荷揚げ場', obj: '本願寺の兵糧を揚げ切るまで、荷揚げ場を守る', r: 16, dur: 60, limit: 110,
      title: '兵糧入れ', sub: '米俵を本願寺の舟へ移す',
      say: [['村上武吉', '俵を本願寺の舟へ移せ！　揚げ切るまで、誰も近づけるな', 3.4]],
      waves: [{ t: 6, say: ['織田の侍', '兵糧を入れさせるな！　俵を焼け！'], foes: [{ name: '荷を狙う織田の手', from: { x: NIAGE.x + 10, z: NIAGE.z + 38 }, list: [uS(3), uA(13)] }] },
        { t: 32, say: ['組頭', '岸沿いにも来るぞ！'], foes: [{ name: '岸沿いの織田の手', from: { x: NIAGE.x + 40, z: NIAGE.z + 14 }, list: [uS(2), uA(10), uB(3)] }] }],
      reward: '本願寺の兵糧を揚げ切るまで、荷揚げ場を守った' },
  ],
  win: {
    banner: '第一次木津川口の勝ち', sub: '本願寺へ兵糧が入った', award: '木津川口で織田水軍を焙烙で破った',
    say: [['村上武吉', '織田の大船、みな燃えた。本願寺へ兵糧を入れたぞ', 3.2],
      ['乃美宗勝', '焙烙は海の戦の道を変えた。だが、織田も黙ってはおるまい', 3.6],
      ['組頭 与三左', 'お主の運んだ焙烙が、舟を焼いた。よう走った', 3.2]],
  },
});
export default m07_kizugawa1;
