// 毛利家編 八戦目「第二次木津川口の戦い」（天正六年〔1578〕十一月・摂津国 木津川口）。軽い型（light_battle.js）・H3（docs/house_mori.md ②④）・負ける側の物語（K509）
//   史実：織田信長は九鬼嘉隆に命じ、大砲を積んだ鉄張りの大船（鉄甲船）六隻を造らせた。毛利水軍（約六百艘）は木津川口へ再び入ったが、
//   焙烙火矢は鉄の舷に効かず、九鬼の大砲に毛利の舟は砕かれ、毛利水軍は敗れて退いた（『信長公記』A・『多聞院日記』A。数は諸説）。
//   この戦は「勝つ」でなく「生き延びて退く」：鉄甲船の砲を浜で耐え、小船の兵を払い、退き口の舟へ着けば終わり（負けの戦の物語）。調略は無し。
//   海は第一次と同じ（light_battle.js の sea・coast・kobune）。鉄甲船は黒い大きな kobune の見た目だけ。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { kobune } from './props.js';
import { funeJirushi } from './house_gear.js';   // H3 船印（毛利の赤旗・村上の丸に上）
// 村上武吉の手は背に村上の丸に上（能島村上の過所船旗。docs/house_gear_1124.md）
const murakamiFlag = (l) => l.map((s) => ({ ...s, o: { ...(s.o || {}), flag: 'murakami' } }));

const MORI = { flag: 'mori', armor: 0x2a2622 };
const ODA = { flag: 'oda', armor: 0x2e2c2a };
const coast = (x) => -74 + Math.sin(x * 0.019) * 4;
const SPAWN = { x: 70, z: -60 };           // 浜（毛利水軍の寄せた所）
const SHORE = { x: 20, z: -52 };           // 鉄甲船の砲の下の浜
const SHORE2 = { x: -30, z: -42 };         // 九鬼の小船の兵が上がる浜
const EXIT = { x: 150, z: -64 };           // 退き口（毛利の舟溜まり）

function scene(rt) {
  const W = rt.world;
  const at = (x, z) => Math.max(-0.5, W.heightAt(x, z)) + 0.05;
  // 砕かれた毛利の舟（浜に乗り上げて傾く）
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 9 + ((i * 7) % 3), z = coast(x) - 2 - (i % 2) * 3;
    try { const b = funeJirushi(kobune(x, at(x, z), z, Math.PI * (0.35 + (i % 4) * 0.12), 8 + (i % 2)), 8 + (i % 2), i % 2 ? 'murakami' : 'mori'); if (b) rt.scene.add(b); } catch (e) { /* 舟の形が無くても戦は続ける */ }
  }
  // 鉄甲船六隻（黒く大きい舟・河口の沖に並ぶ・見た目だけ）
  for (let i = 0; i < 6; i++) {
    const x = -90 + i * 30, z = coast(x) - 26 - (i % 2) * 6;
    try { const b = funeJirushi(kobune(x, -0.45, z, Math.PI * 0.5, 20), 20, 'oda', 3.5); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
  // 沖の毛利水軍の残りの舟
  for (let i = 0; i < 10; i++) {
    const x = 20 + i * 18 + ((i * 7) % 5), z = coast(x) - 52 - (i % 3) * 12;
    try { const b = funeJirushi(kobune(x, -0.45, z, Math.PI * 0.5 + ((i * 5) % 7 - 3) * 0.1, 8 + (i % 3)), 8 + (i % 3), i % 3 === 1 ? 'murakami' : 'mori'); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
}

export const m08_kizugawa2 = lightBattle({
  id: 'm08_kizugawa2',
  date: '天正六年（1578）十一月　朝　摂津国 木津川口',
  intro: '織田は鉄を張った大船を造った。毛利水軍は木津川口へ再び入るが、焙烙は鉄の舷に効かない。生きて舟へ戻れ。',
  history: '天正六年（1578）十一月、織田信長は九鬼嘉隆に鉄を張った大船六隻（鉄甲船）を造らせ、大砲を積ませた。毛利水軍は再び六百艘ほどで木津川口へ入ったが、焙烙火矢は鉄の舷に弾かれ、九鬼の大砲は毛利の舟を次々と砕いた。毛利水軍は敗れ、本願寺へ兵糧を入れる事はできなかった（『信長公記』・『多聞院日記』。数は諸説）。',
  sides: { a: { name: '毛利水軍', mon: 'mori', faction: 'mori' }, b: { name: '九鬼嘉隆の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 6000, b: 2500 },
  allyLook: MORI, foeLook: ODA,
  thick: true,
  noMarch: true,
  allyDmg: 0.3,
  foeDmg: 0.85,   // 鉄甲船と鉄砲。第一次より手強い
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI * 1.5 },
  world: {
    seed: 1578, time: 'day', fogFar: 300, overcast: true, mist: 0.25,
    coast,
    sea: [{ pts: [[-320, -150], [0, -152], [320, -150]], w: 74, depth: 3, still: true, levelAt: () => -0.5 }],
    hills: [[100, 40, 56, 10], [-60, 60, 70, 8], [-150, 20, 50, 7]],
    paths: [{ pts: [[-30, -42], [20, -52], [70, -60], [150, -64]], w: 2.6 }],
    groves: [{ x: 90, z: 30, r: 30, n: 26 }, { x: -110, z: 50, r: 34, n: 26 }],
    trees: 300, tufts: 1500,
    tint(x, z, h, c) {
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.13 * k, c.g * (1 - k) + 0.17 * k, c.b * (1 - k) + 0.2 * k); return; }
      if (z < cz + 9) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.5 * k, c.g * (1 - k) + 0.46 * k, c.b * (1 - k) + 0.4 * k); }
    },
  },
  allies: [
    { name: '村上武吉の手', at: { x: SPAWN.x + 8, z: SPAWN.z + 2 }, list: murakamiFlag([busho('村上武吉'), uS(5), uA(8)]) },
    { name: '乃美宗勝の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 8 }, list: [busho('乃美宗勝'), uS(3), uA(12)] },
    { name: '焙烙衆', at: { x: SPAWN.x + 12, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  setup: scene,
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['村上武吉', '織田の新しい大船は、黒い鉄で覆われておる。焙烙が効くか、試す', 3.6],
      ['乃美宗勝', '殿、焙烙が弾かれます！　鉄の舷に当たって、燃えませぬ！', 3.4],
      ['村上武吉', '……ならば浜で生き延びよ。負けた戦でも、舟へ帰る者は残さねばならぬ', 3.6]] },
    { kind: 'hold', at: SHORE, label: '砲の下の浜', obj: '鉄甲船の大砲の下、浜で耐える', r: 18, dur: 70,
      title: '鉄甲船', sub: '九鬼の大砲が毛利の舟を砕く',
      say: [['組頭', '伏せよ！　あの大筒は舟を砕く！　浜の窪みに身を寄せろ！', 3.2]],
      waves: [{ t: 8, say: ['九鬼嘉隆', '鉄の舷には何も効かぬ！　寄せる舟は砕け！'], foes: [{ name: '九鬼の鉄砲衆', from: { x: SHORE.x - 6, z: SHORE.z + 34 }, list: [uS(2), uB(8)] }] },
        { t: 40, say: ['組頭', '九鬼の小船が浜へ来るぞ！'], foes: [{ name: '九鬼の小船の兵', from: { x: SHORE.x + 12, z: SHORE.z + 34 }, list: [uS(3), uA(12)] }] }],
      reward: '鉄甲船の大砲の下で浜を耐えた' },
    { kind: 'fight', at: SHORE2, obj: '浜へ上がる九鬼の兵を払う', title: '九鬼の兵', sub: '九鬼は浜へ兵を上げて毛利を追う',
      say: [['乃美宗勝', '舟へ戻る道を開け！　浜の九鬼勢を払え！', 3.2]],
      foes: [{ name: '九鬼の本隊', from: { x: SHORE2.x - 6, z: SHORE2.z + 8 }, list: [uS(3), uA(15)] }, { name: '九鬼の弓', from: { x: SHORE2.x - 20, z: SHORE2.z + 4 }, list: [uS(1), uB(6)] }],
      later: [{ t: 40, say: ['組頭', '二の手が来るぞ！'], foes: [{ name: '九鬼の二の手', from: { x: SHORE2.x - 18, z: SHORE2.z + 24 }, list: [uS(2), uA(12)] }] }],
      reward: '浜の九鬼勢を払って退き口を開いた' },
    { kind: 'move', at: EXIT, label: '退き口の舟溜まり', obj: '舟溜まりまで走り、舟へ退く', r: 14, max: 140,
      say: [['村上武吉', '本願寺は救えなんだ。だが、毛利の水軍は残す。舟へ走れ！', 3.2]] },
  ],
  win: {
    banner: '第二次木津川口の負け', sub: '焙烙は鉄甲船に効かず、毛利水軍は退いた', award: '木津川口の負け戦を生き延びて舟へ退いた',
    say: [['村上武吉', '鉄の船には、焙烙も歯が立たぬ。海は織田のものになった', 3.4],
      ['乃美宗勝', '負けた。だが、お主のような者が舟へ戻ってくれた。それが何より', 3.4],
      ['組頭 与三左', '本願寺は孤立する。これからは、毛利の力も試される', 3.2]],
  },
});
export default m08_kizugawa2;
