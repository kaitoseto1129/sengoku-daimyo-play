// 島津家編 六戦目「根白坂の戦い」（天正十五年〔1587〕四月十七日の夜・日向国 根白坂）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④ s06・docs/fujin/s06_nejirozaka.md）
//   史実：豊臣秀長の大軍（八万余・通説）が日向の高城を囲み、宮部継潤が根白坂に空堀と板塀の砦を築いた。島津義久・義弘・家久らは夜に砦へ総がかりで
//   夜襲したが、宮部勢は持ちこたえ、藤堂高虎らの救援と黒田・小早川の横槍で島津は押し返された。島津忠隣らが討死し、島津は降る道へ進む（『九州御動座記』B。兵数は諸説）。
//   作り直さず豊臣編 t08（b_t08_nejirozaka.js）の側を入れ替え：砦の線（塀 z=0）・南の坂の下の島津の寄せ・北に藤堂・秀長の後詰、をそのまま軽い型へ。
//   主人公は夜襲する島津の足軽。塀へ登る→内の曲輪へ→藤堂の後詰で崩れる→追われて退く。勝ち負けでなく、退いて生き延びるのが目標（K509）。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { nejiroField, NEJIRO_WORLD, NEJIRO_AT, nejiroBreak } from './b_t08_nejirozaka.js';   // K651：豊臣編の根白坂の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と道）をやめ、豊臣編 t08 の根白坂
//   （台地の砦・板塀と空堀・土橋・櫓と篝火・宮部の陣幕・坂の下の田・島津の本陣・坂を登る松明の列）を nejiroField で建てる。
//   遊ぶ側は坂の下から登る島津の足軽。行き先は根白坂の物差し（NEJIRO_AT）で置く（+z が坂の下、−z が砦の奥）。
//   K652⑥（逸話の段）：島津が土橋の奥の板塀を押し倒して破る所（豊臣編の破れ口と同じ所）を、本人が塀に取り付いた時に起こす

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const MIYABE = { flag: 'toyotomi', armor: 0x2a3a52 };
const AT = NEJIRO_AT;
const SPAWN = { x: 2, z: 100 };                            // 坂の下の田の縁（島津の本陣の前・寄せ道の上）
const WALL = { x: AT.breach.x, z: AT.wallZ + 12 };          // 砦の塀の前（空堀の土橋の外）
const INNER = { x: -6, z: AT.wallZ - 22 };                  // 砦の内の曲輪
const RETREAT = { x: 2, z: 96 };                            // 坂の下まで退く
const STAND = { x: 2, z: 124 };                             // 追われる中で踏みとどまる所（坂の下の田の間の道）

export const s06_nejirozaka = lightBattle({
  id: 's06_nejirozaka',
  date: '天正十五年（1587）四月十七日　夜　日向国 根白坂',
  intro: '豊臣秀長の八万が高城を囲む。島津は夜に、根白坂の砦へ総がかりで夜襲をかける。あなたは坂を登る足軽。',
  history: '天正十五年（1587）四月十七日の夜、島津義久・義弘・家久らは、豊臣秀長の大軍が高城を囲む中、宮部継潤が築いた根白坂の砦へ夜襲をかけた。宮部勢は空堀と板塀で持ちこたえ、藤堂高虎らの救援と黒田・小早川の横槍で島津は押し返された。島津忠隣らが討死し、この負けで島津は降る道へ進んでいく（兵の数は諸説ある）。',
  sides: { a: { name: '島津の夜襲', mon: 'shimazu', faction: 'shimazu' }, b: { name: '豊臣秀長の軍', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 20000, b: 80000, la: 0.25, lb: 0.04 },   // K652①：島津は忠隣らを失い押し返された。豊臣の損は少ない（討ち取りに合わせて少しずつ）
  allyLook: SHIMAZU, foeLook: MIYABE,
  allyDmg: 0.35,
  foeDmg: 0.4,   // 11/25 K651：豊臣編の砦（塀の内の足軽が厚い）で act bot が一度倒れた（塀の宮部勢の傷128）→0.5→0.4
  playerTaken: 0.5,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: { seed: 15870417, time: 'night' },   // 下で豊臣編の根白坂の world に置き換える（K651）
  allies: [
    { name: '島津忠隣の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 4 }, list: [busho('島津忠隣'), uS(4), uA(12)] },
    { name: '島津の鉄砲衆', at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: '夜襲の槍衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['島津義弘', '高城は囲まれたままじゃ。秀長の大軍とまともには戦えぬ。夜のうちに、根白坂の砦を落とす', 3.8],
      ['島津忠隣', '砦は宮部の一万。灯りを消して坂を登れ。塀に付けば、こちらのものじゃ', 3.6]] },
    { kind: 'fight', at: WALL, obj: '闇に紛れて坂を登り、砦の板塀の守りを破る', title: '根白坂', sub: '夜の砦へ総がかり',
      say: [['宮部の侍', '島津じゃ！　夜討ちじゃ！　塀に寄せるな！', 3]],
      foes: [{ name: '塀の宮部勢', from: { x: WALL.x, z: WALL.z - 12 }, list: [uS(3), uA(14)] }, { name: '砦の鉄砲', from: { x: WALL.x + 14, z: WALL.z - 18 }, list: [uG(6)] }],
      max: 100, reward: '砦の板塀を破った' },
    { kind: 'fight', at: INNER, obj: '砦の内の曲輪へ攻め込む', title: '砦の内', sub: '宮部勢が踏みとどまる', max: 110,
      say: [['島津忠隣', '塀は破れた！　曲輪まで押せ！　夜が明ける前に決めるぞ！', 3.2]],
      foes: [{ name: '宮部継潤の旗本', from: { x: INNER.x, z: INNER.z - 12 }, list: [busho('宮部継潤', { horse: false }), uS(3), uA(12)] }],
      later: [{ t: 30, say: ['藤堂の侍', '藤堂高虎の後詰じゃ！　島津を横から突け！', 3.2], foes: [{ name: '藤堂高虎の後詰', from: { x: INNER.x + 40, z: INNER.z + 6 }, list: [uS(3), uA(14)] }] }],
      reward: '砦の内へ攻め込んだ' },
    { kind: 'move', at: RETREAT, label: '坂の下', obj: '後詰が来た。坂の下まで退く', r: 14, max: 80,
      say: [['島津忠隣', 'これまでじゃ！　退け！　坂の下まで退け！', 3], ['藤堂の侍', '島津が崩れたぞ！　追え、一人も逃がすな！', 3.2]] },
    { kind: 'hold', at: STAND, label: '坂の下', obj: '追ってくる豊臣勢を止め、夜明けまで生き延びる', r: 18, dur: 70, title: '追われる', sub: '大軍に追われて退く',
      say: [['組頭', '振り向くな。踏みとどまるのは短くてよい。生きて高城の囲みの外へ戻れ', 3.4]],
      waves: [{ t: 4, foes: [{ name: '藤堂勢の追手', from: { x: STAND.x - 6, z: STAND.z - 54 }, list: [uS(3), uA(14)] }] },
        { t: 28, say: ['黒田の侍', '黒田・小早川の手が横から来る！　島津を逃がすな！'], foes: [{ name: '黒田・小早川の手', from: { x: STAND.x + 40, z: STAND.z - 40 }, list: [uS(3), uA(12)] }] },
        { t: 48, foes: [{ name: '豊臣の後備え', from: { x: STAND.x - 30, z: STAND.z - 50 }, list: [uS(2), uA(10)] }] }],
      reward: '追ってくる豊臣勢を止めて生き延びた' },
  ],
  win: {
    banner: '根白坂 退く', sub: '夜襲は破れた。島津は降る道へ向かう', award: '根白坂の夜襲で追撃を止めて生き延びた',
    say: [['組頭', '夜が明けてきた。夜襲は破れたが、わしらは生きて戻れる', 3.4],
      ['島津義弘', '秀長の大軍には勝てぬ。……これまでか', 3.4]],
  },
});
// K651：豊臣編の根白坂の地面・空堀・坂・田・道をそのまま使う（getter も写すため descriptor ごと）
s06_nejirozaka.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(NEJIRO_WORLD));
s06_nejirozaka.world.time = 'night';   // 夜襲（豊臣編は暮れ方から夜へ）
s06_nejirozaka.world.fleeOut = (x, z, team) => team === 0 && z > 150;   // 豊臣編は退く島津（敵）が坂の下へ消える。ここでは島津が味方
// 戦場を建てる（豊臣編の根白坂と同じ所）→ 軽い型の setup（島津の組・段）
{ const s0 = s06_nejirozaka.setup; s06_nejirozaka.setup = function* (rt) { const f = yield* nejiroField(rt, { team: 1 }); rt.flags.walls = f.walls; rt.flags.torches = f.torches; s0.call(this, rt); }; }
// 塀に取り付いたら土橋の奥の板塀を押し倒す（豊臣編の破れ口と同じ所・同じ倒れ方）。松明の列は坂を登り続ける
{ const u0 = s06_nejirozaka.update; s06_nejirozaka.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags, P = rt.player?.u?.pos;
  if (!F.broken && F.walls && ((F.step || 0) >= 1 || (P && Math.hypot(P.x - WALL.x, P.z - WALL.z) < 14))) nejiroBreak(rt);
  if (F.torches?.pts.visible) F.torches.update(dt);
}; }
export default s06_nejirozaka;
