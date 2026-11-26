// 島津家編 六戦目「根白坂の戦い」（天正十五年〔1587〕四月十七日の夜・日向国 根白坂）。軽い型（light_battle.js）・H3（docs/house_shimazu.md ②④ s06・docs/fujin/s06_nejirozaka.md）
//   史実：豊臣秀長の大軍（八万余・通説）が日向の高城を囲み、宮部継潤が根白坂に空堀と板塀の砦を築いた。島津義久・義弘・家久らは夜に砦へ総がかりで
//   夜襲したが、宮部勢は持ちこたえ、藤堂高虎らの救援と黒田・小早川の横槍で島津は押し返された。島津忠隣らが討死し、島津は降る道へ進む（『九州御動座記』B。兵数は諸説）。
//   作り直さず豊臣編 t08（b_t08_nejirozaka.js）の側を入れ替え：砦の線（塀 z=0）・南の坂の下の島津の寄せ・北に藤堂・秀長の後詰、をそのまま軽い型へ。
//   主人公は夜襲する島津の足軽。塀へ登る→内の曲輪へ→藤堂の後詰で崩れる→追われて退く。勝ち負けでなく、退いて生き延びるのが目標（K509）。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';
import { nejiroField, NEJIRO_WORLD, NEJIRO_AT, nejiroBreak, NEJIRO_ARMY, NEJIRO_DEPTH, nejiroSide, t08_nejirozaka } from './b_t08_nejirozaka.js';   // K651：豊臣編の根白坂の戦場をそのまま使う（素材は写さない）

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
    // K656 見せ場（11/26 クラウドさ）：史実＝義久の甥で義弘の婿の島津忠隣（二十歳）は、空堀を越えて塀へ斬り込み、宮部勢の鉄砲に撃たれて討死した（『島津家譜』・通説）。
    //   本人が、撃たれて倒れた忠隣の亡骸のそばで寄せる宮部の槍を払い、首を渡さずに忠隣の手を退かせる（段の頭で忠隣を倒す＝update の K656）
    { kind: 'fight', at: { x: WALL.x - 6, z: WALL.z - 4 }, obj: '撃たれた忠隣の亡骸を守り、首を取りに来る宮部の槍を払う', title: '忠隣討死', sub: '若き大将が塀の前に倒れる', max: 100, limit: 90,
      say: [['宮部の侍', '若い大将を撃ち倒したぞ！　首を取れ！', 3], ['組頭', '忠隣様が撃たれた！　首は渡すな！　亡骸を囲め！', 3.4]],
      foes: [{ name: '首を取りに来る宮部の槍', from: { x: WALL.x + 4, z: WALL.z - 16 }, list: [uS(2), uA(10)] }],
      later: [{ t: 26, say: ['宮部の侍', '鉄砲、塀の上から撃ち下ろせ！', 3], foes: [{ name: '塀の上の宮部の鉄砲', from: { x: WALL.x - 14, z: WALL.z - 18 }, list: [uS(1), uG(4)] }] }],
      reward: '忠隣の亡骸を守り抜いた' },
    { kind: 'move', at: RETREAT, label: '坂の下', obj: '後詰が来た。坂の下まで退く', r: 14, max: 80,
      say: [['組頭', 'これまでじゃ！　退け！　坂の下まで退け！', 3], ['藤堂の侍', '島津が崩れたぞ！　追え、一人も逃がすな！', 3.2], ['井楼の物見', '毛利・蜂須賀の勢も出たぞ！　高城の囲みを締めよ！', 3.2]] },
    { kind: 'hold', at: STAND, label: '坂の下', obj: '追ってくる豊臣勢を止め、夜明けまで生き延びる', r: 18, dur: 70, title: '追われる', sub: '大軍に追われて退く',
      say: [['組頭', '振り向くな。踏みとどまるのは短くてよい。生きて高城の囲みの外へ戻れ', 3.4]],
      waves: [{ t: 4, foes: [{ name: '藤堂勢の追手', from: { x: STAND.x - 6, z: STAND.z - 54 }, list: [uS(3), uA(14)] }] },
        { t: 28, say: ['黒田の侍', '黒田・小早川の手が横から来る！　島津を逃がすな！'], foes: [{ name: '黒田・小早川の手', from: { x: STAND.x + 40, z: STAND.z - 40 }, list: [uS(3), uA(12)] }] },
        { t: 48, foes: [{ name: '豊臣の後備え', from: { x: STAND.x - 30, z: STAND.z - 50 }, list: [uS(2), uA(10)] }] }],
      reward: '追ってくる豊臣勢を止めて生き延びた' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['島津義弘', '忠隣が討たれた……。高城の囲みを解き、都於郡へ退く', 3.2]]),
    fightS({ x: -40, z: 140 }, '退く道に回った黒田の手を払う', '黒田の手', '黒田の兵が退く道に回る', [['組頭', '退く道に敵がおる！　斬り抜けよ！', 3]],
      [foe('黒田の回りの手', -56, 124, [uS(2), uA(12)])], { later: [wave(28, '黒田の侍', '撃ちかけよ！', [foe('黒田の鉄砲', -60, 150, [uS(1), uG(5)])])], reward: '黒田の手を払った' }),
    holdS({ x: 4, z: 146 }, '島津の陣', '陣の前で、坂を下りて追う豊臣の大勢を受ける', '陣の前', '豊臣の大勢が坂を下りる', [['島津義弘', '陣を焼いて退く。それまでここを渡すな', 3]],
      [wave(0, '藤堂の侍', '島津の陣を踏み潰せ！', [foe('坂を下りる藤堂勢', 0, 90, [uS(2), uA(12)])]), wave(30, '宮部の侍', '砦の仇じゃ！', [foe('坂を下りる宮部勢', -40, 100, [uS(2), uA(10)])]),
        wave(52, '藤堂の侍', '鉄砲、陣を撃て！', [foe('藤堂の鉄砲', 40, 100, [uS(1), uA(6), uG(3)])])], { reward: '陣の前を守った' }),
    fightS({ x: 40, z: 130 }, '陣の東の田で、横から入った小早川の手を崩す', '小早川の手', '小早川の兵が横から入る', [['組頭', '東から来た！　槍を向けよ！', 3]],
      [foe('小早川の手', 56, 120, [boss('小早川の侍大将'), uS(2), uA(12)])], { later: [wave(28, '小早川の侍', '島津を囲め！', [foe('小早川の手の二', 60, 146, [uS(2), uA(8)])])], reward: '小早川の手を崩した' }),
    fightS({ x: -16, z: 160 }, '都於郡への道を塞ぐ豊臣の物見を払う', '都於郡への道', '豊臣の物見が道を塞ぐ', [['島津義弘', '都於郡まで退けば、まだ戦える', 3]],
      [foe('道の豊臣の物見', -24, 172, [uS(2), uA(10)])], { later: [wave(26, '豊臣の侍', '撃て！', [foe('道の豊臣の鉄砲', 0, 172, [uS(1), uG(4)])])], reward: '都於郡への道を開いた' }),
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
// 11/26 K661（kaito「戦場は交換できているが、兵の布陣とか仕組みを全部コピーしないと」）：豊臣編の両軍の布陣（NEJIRO_ARMY）を側を入れ替えて置く＝
//   坂の下の島津義珍の本陣（床几の義珍・旗本・後ろの控え）、砦の奥の宮部継潤の本陣、塀の内の宮部の手（槍）と塀の内の鉄砲二十丁（豊臣編と同じ所・同じ数）、
//   陣立ての表（豊臣の備・島津の備。本人が近づくと本物の兵に替わる）と布陣の表。豊臣編の筋（宮部の本人の塀の守り）は使わず、島津の本人の段はこの紙の段
s06_nejirozaka.sideFlip = true;
s06_nejirozaka.depth = NEJIRO_DEPTH(true);
{ const P = { x: t08_nejirozaka.spawn.x, z: t08_nejirozaka.spawn.z }; s06_nejirozaka.lazyFrom = () => P; }   // 布陣の表の備・陣立ての厚みは、豊臣編の本人の出る所（砦の内）から測って立てる＝豊臣編と同じ時に同じ備
{ const s0 = s06_nejirozaka.setup; s06_nejirozaka.setup = function* (rt) {
  nejiroSide(true);   // K661：豊臣方 team 1・島津方 team 0
  const f = yield* nejiroField(rt, { team: 1 }); rt.flags.walls = f.walls; rt.flags.torches = f.torches;
  NEJIRO_ARMY.shimazu(rt);   // 坂の下の島津の本陣（豊臣編と同じ所・同じ数）
  NEJIRO_ARMY.miyabe(rt);    // 宮部の本陣・塀の内の槍と鉄砲（豊臣編と同じ所・同じ数）
  // 塀の内の鉄砲は豊臣編では本人の味方。島津の本人へは近い所で号令を待たず撃つ（army_think の closeShot）ので、本人への一発だけ和らげる（他の兵どうしは元のまま）
  const F = rt.flags;
  if (F.guns) F.guns.dmgMultPlayer = 0.35;
  if (F.miyabe) F.miyabe.dmgMultPlayer = 0.5;
  yield;
  s0.call(this, rt);
}; }
// 塀に取り付いたら土橋の奥の板塀を押し倒す（豊臣編の破れ口と同じ所・同じ倒れ方）。松明の列は坂を登り続ける
const S06_TADA = s06_nejirozaka.missions.indexOf('撃たれた忠隣の亡骸を守り、首を取りに来る宮部の槍を払う');   // その段の最中の F.step（済んだ段の数）
{ const u0 = s06_nejirozaka.update; s06_nejirozaka.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags, P = rt.player?.u?.pos;
  // K656：忠隣討死の段の頭で、忠隣を塀の前の鉄砲で倒す（一斉射の音と硝煙）。手の者は退かずに亡骸を囲む
  if (!F.tadaDown && F.step === S06_TADA) {
    F.tadaDown = true;
    const g = F.allies?.[0], t = g?.units.find((u) => u.alive && u.type === 'busho');
    if (t) {
      rt.army.play?.('volley', { x: WALL.x, y: t.pos.y, z: WALL.z - 14 }, 1.4);
      if (rt.army.duel && rt.army.duel.foe === t) rt.army.duelEnd(false, '');
      t.invuln = false; t.mustLive = false; t.hp = 0; rt.army.kill(t, null);
      g.anchor = { x: WALL.x - 6, z: WALL.z - 4 };
    }
  }
  if (!F.broken && F.walls && ((F.step || 0) >= 1 || (P && Math.hypot(P.x - WALL.x, P.z - WALL.z) < 14))) nejiroBreak(rt);
  if (F.torches?.pts.visible) F.torches.update(dt);
}; }
export default s06_nejirozaka;
