// ======================================================================
// 豊臣編　根白坂の戦い（天正十五年四月十七日の夜）
// 豊臣秀長の大軍が日向の高城を囲む。宮部継潤は高城の南の根白坂に、空堀と板塀の砦を築いて島津の後詰を待ち受けた。
// 島津義久・義弘・家久らは夜にこの砦へ総がかりで攻めたが、宮部勢は持ちこたえ、藤堂高虎らの助けが来て島津は退いた。
// この負けで島津は降る道へ進む。
// 自分は部将として宮部の砦の一つの塀を受け持つ。塀に付く → 塀の上で押し返す（南と東の塀） → 破られた塀を塞ぐ → 援けまで持つ → 最後に斬り込む島津忠隣を討つ → 夜明け。
// 兵数（docs/battle_refs/t08_nejirozaka.md）：砦の宮部勢およそ一万、島津勢およそ三万五千。秀長の本隊は救援を止め（尾藤知宣の進言）、藤堂高虎・戸川達安が助け、黒田・小早川が島津の横を突いた。
// 島津の大将（義久・義弘）は坂の下の陣を動かない。前に出て討死したのは島津忠隣・猿渡信光ら。
// 向き：砦は台地の端。塀は z=0 に東西へ。島津は南（+z）の坂の下（小丸川の側の田）から登ってくる。寸法は推定。
// 地形：国土地理院の標高（prototype/tools/dem.mjs の nejirozaka）を切り出す前の、手書きの台地。
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, yagura, tawara, kagaribi } from './props.js';
import { MEM_TIGHT } from './settings.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { addSite } from './map_sites.js';
import { STAGES } from './stages.js';
import { depthStart, depthTick, rest, fight, hold, move, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';
import { goalsTick } from './hud_goals.js';
import { revealName } from './battle_intel.js';

const WALL_Z = 0;                 // 板塀の線
const WALL_X = 46;                // 塀の東西の端
const MOAT = { z: 7, hw: 3.6, d: 2.2 };   // 塀の前の空堀（土橋は x の ±4）
const BREACH = { x: 0, z: WALL_Z };       // 破られる塀（土橋の奥）
const POST = { x: 0, z: -5 };             // 自分の受け持ちの塀の内
const ROAD = [[0, 150], [2, 100], [0, 60], [0, 14], [0, -70]];
const SHIMAZU = { armor: 0x1e1c1c, lace: 0x3a3a3a, flag: 'shimazu' };
const MIYABE = { armor: 0x2a2622, flag: 'toyotomi' };
const TODO = { armor: 0x2a2622, flag: 'todo' };
const UKITA = { armor: 0x2a2622, flag: 'ukita' };
const KURODA = { armor: 0x24221f, flag: 'kuroda' };
const KOBA = { armor: 0x24221f, flag: 'kuki' };   // 左三つ巴（小早川家）
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const sstep = (t) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

// 台地（砦）は高さ二十二。塀の前から南へ下り、坂の下は田（高さ二）。砦の後ろは丘へ緩く上る
function height(x, z) {
  let h = 22 - 20 * sstep((z - 12) / 70);
  h += Math.max(0, -z - 60) * 0.12;
  h += 0.35 * Math.sin(x * 0.06 + 0.4) * Math.cos(z * 0.05) + 0.25 * Math.sin(z * 0.09 - x * 0.04);
  // 空堀：塀の前を東西に。土橋の所は掘らない
  const dz = Math.abs(z - MOAT.z), ax = Math.abs(x);
  if (dz < MOAT.hw && ax > 4 && ax < WALL_X + 4) {
    const across = Math.cos((dz / MOAT.hw) * Math.PI / 2);
    h -= MOAT.d * across * sstep((ax - 4) / 1.5) * sstep((WALL_X + 4 - ax) / 2);
  }
  return h;
}
const inFort = (p) => p.z < WALL_Z - 1.5 && p.z > -60 && Math.abs(p.x) < WALL_X;

function ctx(rt) {
  const F = rt.flags;
  return { faction: 'shimazu', flag: 'shimazu', armor: SHIMAZU.armor, dmg: 0.6, mass: 180, scale: 2, look: (l) => dress(l, SHIMAZU),
    friends: () => [F.miyabe, F.guns, F.todo, F.togawa, F.relief, F.koba].filter((g) => g && g.count && !g.routed) };
}
const from = (x) => ({ x, z: 78 });

function steps(rt) {
  const F = rt.flags;
  return [
    // 1. 受け持ちの土橋の塀へ（始まりの所から二十五歩）
    move({ to: POST, r: 6, label: '土橋の塀', obj: '土橋の奥の塀の内へ入り、鉄砲衆の横に並べ', max: 60,
      say: [['宮部継潤', '鉄砲は塀の狭間へ。火縄の火を外へ見せるな'], ['足軽', '堀の底で、草が鳴っておる……']],
      onEnd: (rt) => { if (F.guns) { F.guns.order = 'hold'; F.guns.aggro = 40; } } }),
    // 2. 島津勢が堀を越えてくる。南の塀と東の塀の上で押し返す（砦は三方から攻められる）
    //   段の見出し（説明の札）は出さない（kaito 五1）。何が起きたかは台詞と右上の目標で分かる
    hold({ at: POST, dur: 70, r: 12, label: '土橋の塀', obj: STEP_TEXT[0],
      say: [['宮部継潤', '来たぞ！　塀に取り付く者を突き落とせ！']],
      waves: [
        // 猿渡信光は史実で根白坂に討死した。手は崩れても退かず、塀の前で討たれるまで戦う（update が守る）
        { t: 4, say: ['足軽', '丸に十字の旗じゃ！　猿渡信光の手が坂を登ってくる！'], foes: () => [{ name: '猿渡信光の手', from: from(-12), off: { x: -6, z: 2 }, list: [{ type: 'busho', n: 1, o: { name: '猿渡信光', horse: true, hat: 'kabuto_w' } }, uS(4), uA(10)], noRout: 20 }] },
        { t: 24, say: ['鉄砲頭', '堀の中に詰まった！　放て！'], foes: () => [{ name: '島津の二の手', from: from(14), off: { x: 8, z: 2 }, list: [uS(2), uA(9), uG(3)] }] },
        { t: 46, say: ['足軽', '東の塀にも取り付いた！　横から来るぞ！'], foes: () => [{ name: '東から回った島津勢', from: { x: 78, z: -14 }, off: { x: 38, z: -14 }, list: [uS(2), uA(10)] }] },
      ],
      noRefill: true, reward: '塀の上で島津の夜討ちを押し返した' }),
    rest({ dur: 5, heal: 0.25, say: [['足軽', '……息が続かぬ'], ['宮部継潤', '島津は引かぬ。まだ来るぞ']] }),
    // 3. 破られた塀に駆け、穴を塞ぐ
    //   破れ口の場所で守る形（坂の下まで敵を追って歩かせない。11/3 測り：fight の形だと bot が坂の下 z=67 まで追って討たれた）
    hold({ at: { x: BREACH.x, z: BREACH.z - 3 }, dur: 60, r: 12, label: '破れ口', obj: STEP_TEXT[1],
      say: [['足軽', '土橋の塀が倒れた！　島津が入ってくる！']],
      waves: [
        { t: 0, foes: () => { breakWall(rt); return [{ name: '破れ口の島津勢', from: { x: 0, z: 40 }, list: [uS(3), uA(12)], noRout: 15 }]; } },
        { t: 30, say: ['宮部継潤', '破れ口に槍を揃えよ！　一人も通すな！'], foes: () => [{ name: '島津の後ろの手', from: { x: 6, z: 60 }, list: [uS(2), uA(10)] }] },
      ],
      noRefill: true, reward: '破られた塀を塞いだ' }),
    // 4. 藤堂高虎の援けが来るまで持ちこたえる（西の塀にも島津が回る）
    hold({ at: { x: BREACH.x, z: BREACH.z - 4 }, dur: 85, r: 14, label: '破れ口', obj: STEP_TEXT[2],
      waves: [
        { t: 6, say: ['足軽', '島津の本手じゃ！　坂の下から新手が来る！'], foes: () => [{ name: '島津の本手', from: from(-6), list: [uS(4), uA(12)], noRout: 30 }] },
        { t: 30, foes: () => { todoArrive(rt); return [{ name: '島津の新手', from: from(20), off: { x: 10, z: 0 }, list: [uS(2), uA(10), uG(3)] }]; } },
        { t: 58, say: ['足軽', '西の塀にも島津が回った！'], foes: () => { reliefArrive(rt); return [{ name: '西から回った島津勢', from: { x: -78, z: -10 }, off: { x: -30, z: -10 }, list: [uS(2), uA(10)] }]; } },
      ],
      noRefill: true, reward: '藤堂の援けが来るまで破れ口を守った' }),
    rest({ dur: 5, heal: 0.3, say: [['藤堂高虎', '黒田殿・小早川殿が島津の横を突いたぞ！'], ['足軽', '島津の旗が、まだ一つ土橋へ来る！']] }),
    // 5. 島津が退く前に、島津忠隣が土橋へ斬り込む（史実で討死した将）
    //   忠隣の手は土橋の前の坂（堀の下）で踏みとどまる。味方の組も一緒に打って出る（kaito AP5：周りの味方も一緒に攻める）
    //   忠隣は二十の若武者で、この坂で討死した（史実）。忠隣と近習は退かず、止めは主人公の手だけ（kaito 三4）。忠隣が倒れるまで段は終わらない
    tadaStep(fight({ at: { x: BREACH.x, z: 30 }, obj: STEP_TEXT[3], max: 120,
      say: [['島津忠隣', '島津忠隣、これにあり！　この塀、越えてみせる！']],
      foes: () => { tadaComes(rt); return [{ name: '島津忠隣の手', from: { x: 2, z: 56 }, list: [uS(2), uA(10)], noRout: 25 }]; },
      reward: (t) => { t.special = { label: '島津忠隣の斬り込みを止めた', pts: 15 }; }, rewardLabel: '島津忠隣の斬り込みを止めた' }), rt),
  ];
}

// 右上の目標の字（段の札・右上の一覧・負けの札を一つの表から出し、途中で言い替えない。kaito 十1）
const STEP_TEXT = ['土橋の塀で、堀を越える島津勢を突き落とす', '倒れた土橋の塀へ走り、破れ口の島津勢を討つ',
  '破れ口で、坂を登る島津の本手と新手を食い止める', '土橋の前の坂で、島津忠隣の手を討つ', '土橋の前の坂で、島津忠隣を自分の槍で討ち取る'];

// 忠隣の段は、寄せた手を崩しても忠隣が生きている間は終わらない
function tadaStep(s, rt) {
  const tick = s.tick;
  s.tick = (r, C, m, ctx, el) => {
    const done = tick(r, C, m, ctx, el);
    if (done) rt.flags.tadaHandDone = true;
    const u = rt.flags.tadaU;
    if (u?.alive) C.goal = u.pos;
    return done && !(u && u.alive);
  };
  s.idleAdvance = false;   // 止まっていても段は先へ飛ばない（忠隣は寄せ続ける。⑤を果たさずに勝ちにしない。kaito 三3）
  s.max = 900;
  return s;
}

// 島津忠隣と近習：坂の下から土橋へ斬り込む。退かず、ほかの者の手では討たれない（主人公が弱らせ切った時だけ討ち取る）
function tadaComes(rt) {
  const F = rt.flags;
  if (F.tada) return;
  F.tada = enemyGroup(rt, { faction: 'shimazu', name: '島津忠隣の近習', fixed: true, anchor: { x: -2, z: 62 }, facing: Math.PI, width: 6, order: 'attack', seekRange: 70, aggro: 16, noRout: true, morale: 100 },
    dress([{ type: 'busho', n: 1, o: { name: '島津忠隣', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(5)], SHIMAZU));
  F.tada.anchor = { x: BREACH.x, z: 14 };
  F.tada.dmgMult = 0.6; F.tada.speed = 4.2;
  const u = F.tadaU = F.tada.units.find((q) => q.name === '島津忠隣');
  // 若武者一人に三分も打ち合わせない（体の強さは出た後に決まるので、一息おいて整える）
  if (u) rt.after(0.3, () => { if (u.alive) { u.maxHp = Math.min(u.maxHp, 460); u.hp = Math.min(u.hp, u.maxHp); } });
  if (u) u.onWound =(src) => { if (src?.isPlayer && u.alive) { u.invuln = false; rt.army.kill(u, src); } };
}

// 島津の夜討ちの松明（史実の目玉の絵）：坂の下の田と、台地の東西の脇の坂を、松明の列が幾筋も砦へ寄せてくる。
//   一つの点の束（THREE.Points・一回の描画）だけ。霧に沈めず、闇の中の火の粒として遠くまで見せる。塀と地形が手前を隠す。
//   列は道（点の並び）を進み、田の列は坂の下で、脇の列は砦の東西の塀の外で止まって残る。夜明けで消す。毎コマ new しない
//   [道, 始めの先頭の距離, 速さ]
const TORCH_COLS = [
  [[[0, 262], [2, 122]], 70, 1.1], [[[-150, 250], [-118, 132]], 70, 0.9], [[[150, 252], [116, 136]], 70, 0.95],
  // 脇の列は台地へ上がり、砦の東西の塀の外を後ろ（北）へ回り込む（総がかりで砦を包む）
  [[[-130, 205], [-96, 92], [-80, 34], [-72, -20], [-64, -62]], 200, 1.9], [[[130, 205], [96, 92], [80, 34], [72, -20], [64, -62]], 200, 1.9],
];
function torchField(rt) {
  const W = rt.world, per = MEM_TIGHT ? 14 : 22, N = TORCH_COLS.length * per, GAP = 3.4;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) seed[i] = (i * 7.31) % 10;
  // 道ごとの区切りの長さ
  const lens = TORCH_COLS.map(([P]) => { const L = [0]; for (let k = 1; k < P.length; k++) L.push(L[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1])); return L; });
  const at = (P, L, d, o) => {
    d = Math.max(0, Math.min(L[L.length - 1], d));
    let k = 1; while (k < L.length - 1 && L[k] < d) k++;
    const t = (d - L[k - 1]) / ((L[k] - L[k - 1]) || 1);
    o.x = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t; o.z = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t;
    return o;
  };
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.25, 'rgba(255,160,60,0.9)'); gr.addColorStop(0.6, 'rgba(200,70,10,0.3)'); gr.addColorStop(1, 'rgba(120,30,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 6, sizeAttenuation: true, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 2;
  rt.scene.add(pts);
  let t = 0, acc = 0;
  const q = { x: 0, z: 0 };
  const T = {
    pts, k: 1,
    update(dt) {
      t += dt; acc += dt;
      if (acc < 0.08 || !pts.visible) return;
      acc = 0;
      let i = 0;
      TORCH_COLS.forEach(([P, d0, sp], ci) => {
        const L = lens[ci], lead = Math.min(L[L.length - 1], d0 + t * sp);
        for (let j = 0; j < per; j++, i++) {
          at(P, L, lead - j * GAP, q);
          const x = q.x + Math.sin(q.z * 0.05 + ci) * 2.5 + ((j & 1) ? 1.1 : -1.1), z = q.z;
          pos[i * 3] = x; pos[i * 3 + 1] = W.heightAt(x, z) + 2.4 + Math.sin(t * 5 + seed[i]) * 0.08; pos[i * 3 + 2] = z;
          const f = (1.05 + 0.3 * Math.sin(t * 9 + seed[i] * 7) * Math.sin(t * 13.7 + seed[i])) * T.k;
          col[i * 3] = f; col[i * 3 + 1] = f * 0.82; col[i * 3 + 2] = f * 0.6;
        }
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
  T.update(0.1);
  return T;
}

// 土橋の奥の板塀を二間ほど倒す（島津が塀を押し倒した所）
function breakWall(rt) {
  const F = rt.flags;
  if (F.broken) return;
  F.broken = true;
  for (const s of F.walls) {
    const cx = (s.seg[0] + s.seg[2]) / 2;
    if (Math.abs(cx - BREACH.x) > 6 || !s.alive) continue;
    s.alive = false; s.hp = 0; s.hitFrom = { x: cx, z: WALL_Z + 4 };
    rt.army.structFall(s);
  }
  sfx('taiko', 0.6);
}

// 藤堂高虎の手が砦の後ろから駆け付ける
function todoArrive(rt) {
  const F = rt.flags;
  if (F.todo) return;
  // 藤堂は秀長の家臣で蔦の旗、戸川達安は宇喜多の手で宇喜多の旗（家ごとに隊を分ける）。説明の札は出さず、台詞と法螺で知らせる（kaito 五1）
  F.todo = allyGroup(rt, { name: '藤堂高虎の手', anchor: { x: -8, z: -50 }, facing: 0, width: 8, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(4), uA(8)], TODO));
  F.todo.anchor = { x: BREACH.x - 3, z: BREACH.z - 6 };
  F.togawa = allyGroup(rt, { name: '戸川達安の手', anchor: { x: 4, z: -52 }, facing: 0, width: 8, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '戸川達安', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uA(7)], UKITA));
  F.togawa.anchor = { x: BREACH.x + 4, z: BREACH.z - 6 };
  KIT.backOf(rt, F.todo, { flag: 'todo', armor: TODO.armor, kind: 'spear', w: 16, depth: 8, count: 140, seed: 1587 });
  rt.say('藤堂高虎', '宮部殿、よう持たれた！　藤堂与右衛門、参ったぞ！', 4);
  rt.after(4.5, () => rt.say('戸川達安', '宇喜多が手の者、戸川達安！　破れ口へ槍を入れよ！', 3.5));
  sfx('horagai', 0.8);
}

// 黒田官兵衛・小早川隆景の後詰が東の尾根から着く（藤堂の後に続く）
function reliefArrive(rt) {
  const F = rt.flags;
  if (F.relief) return;
  // 黒田は藤巴、小早川隆景は左三つ巴（違い鎌は後の秀秋の物で、この年には使わない）
  F.relief = allyGroup(rt, { name: '黒田官兵衛の手', anchor: { x: 96, z: 30 }, facing: -Math.PI / 2, width: 8, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uA(5), uG(2)], KURODA));
  F.relief.anchor = { x: BREACH.x + 14, z: 28 };
  F.koba = allyGroup(rt, { name: '小早川隆景の手', anchor: { x: 100, z: 42 }, facing: -Math.PI / 2, width: 8, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '小早川隆景', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(3), uA(5), uG(1)], KOBA));
  F.koba.anchor = { x: BREACH.x + 20, z: 36 };
  KIT.backOf(rt, F.relief, { flag: 'kuroda', armor: KURODA.armor, kind: 'mixed', w: 16, depth: 8, count: 120, seed: 1588 });
  rt.say('黒田官兵衛', '島津の横を突く。宮部殿の砦は、もう落ちぬ', 4);
  rt.after(4.5, () => rt.say('小早川隆景', '小早川の者ども、尾根を下って島津の横腹へ！', 3.5));
  sfx('horagai', 0.7);
}
const t08_nejirozaka = {
  foeHit: 1.0,
  noWake: true,
  // 見せかけの軍勢は置かない（kaito AQ6・AF・AP9）：遠景の大軍・奥の乱戦の補い・前線の小勢を足さない。島津の大軍は松明の列と、寄せる本物の兵で見せる
  noFrontFill: true,
  frontlineDensity: false,
  // 行き先は頭上の▼一つ（kaito AS・AT・AV15）。ついていく相手の青い印は出さない
  noLeaderFollow: true,
  // 名札は近くの将だけ（坂の下の義弘の本陣の名と命の棒が、砦から見えていた。kaito AS）
  nameRange: 60,
  spawn: { x: -4, z: -30, heading: 0 },
  world: {
    seed: 1587,
    time: 'night',
    nightLift: 3.2,
    mist: true,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 砦の中と空堀は踏まれた土。坂は夏草、坂の下は田
      if (z < WALL_Z + 12 && z > -60 && Math.abs(x) < WALL_X + 4) c.setRGB(c.r * 0.55 + 0.16, c.g * 0.5 + 0.13, c.b * 0.45 + 0.08);
      else if (z > 85) c.setRGB(c.r * 0.6 + 0.05, c.g * 0.7 + 0.12, c.b * 0.6 + 0.04);
    },
    clear: (x, z) => Math.abs(x) < 70 && z > -70 && z < 90,
    trees: 260,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(x) > 80 || z < -80 ? 1 : 0.15),
    groves: [{ x: -90, z: -20, r: 14, n: 16 }, { x: 95, z: 10, r: 14, n: 16 }],
    // 退く島津は坂の下へ消える
    fleeOut: (x, z, team) => team === 1 && z > 110,
  },
  prelude: false,

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ending = false; F.inT = 0;
    // ---- 砦：前の板塀（登って越えられる）・東西の塀・櫓と篝火 ----
    const front = [];
    for (let x = -WALL_X; x <= WALL_X; x += 6) front.push([x, WALL_Z]);
    F.walls = wallLine(rt, front, { team: 0, hp: 1e9, name: '板塀', segLen: 6 });
    wallLine(rt, [[-WALL_X, WALL_Z], [-WALL_X, -50]], { team: 0, hp: 1e9, name: '板塀', segLen: 6 });
    wallLine(rt, [[WALL_X, WALL_Z], [WALL_X, -50]], { team: 0, hp: 1e9, name: '板塀', segLen: 6 });
    for (const x of [-30, 30]) rt.scene.add(yagura(W, x, WALL_Z - 4));
    for (const x of [-38, -18, 12, 24, 40]) rt.scene.add(kagaribi(W, x, WALL_Z - 6));
    for (const [x, z] of [[-22, -8], [10, -9], [34, -8], [-4, -40]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    rt.scene.add(jinmaku(W, -4, -42, 12, 8, 3, { mon: 'toyotomi', solid: false }));
    rt.scene.add(tawara(W, 14, -30, 0.3, 4));
    // ---- 坂の下の島津の本陣（義弘）：旗本に囲まれ、坂の下を動かない（kaito AR3）。遠景の作り物の大軍は置かない ----
    //   この年の名乗りは義珍（義弘と名乗るのは後。kaito 十4 名乗りは年に合わせる）
    F.shHon = enemyGroup(rt, { faction: 'shimazu', name: '島津義珍の本陣', anchor: { x: 4, z: 150 }, facing: Math.PI, width: 12, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', seekRange: 4 },
      dress([{ type: 'busho', n: 1, o: { name: '島津義珍', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(10), uA(8)], SHIMAZU));
    F.shHon.noPursue = true;
    const yU = F.shHon.units.find((u) => u.name === '島津義珍');
    if (yU) yU._crouch = true;   // 坂の下の本陣で床几に座る
    // 本陣の後ろに旗本の控え（寄れば本物の兵に替わる）。坂の上の砦からは松明の陰に沈む
    KIT.backOf(rt, F.shHon, { flag: 'shimazu', armor: SHIMAZU.armor, kind: 'mixed', w: 22, depth: 10, count: 240, gap: 2, seed: 1589 });
    for (const [x, z] of [[-6, 146], [14, 146]]) rt.scene.add(nobori(W, x, z, 'shimazu', 7));
    rt.scene.add(jinmaku(W, 4, 156, 12, 8, 3, { mon: 'shimazu', solid: false }));
    addSite(rt, 'fort', 0, -20, '根白坂の砦');
    F.torches = torchField(rt);
    // ---- 味方：宮部継潤の手と、塀の内の鉄砲 ----
    // 守将の宮部継潤は砦の奥の本陣で床几に座り、旗本に囲まれて下知する（塀へは出ない。kaito AR3・AV7）
    F.miyaHon = allyGroup(rt, { name: '宮部継潤の本陣', anchor: { x: -4, z: -40 }, facing: 0, width: 8, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true, horse: false, hat: 'kabuto_m' } }, uS(10), uA(6)], MIYABE));
    F.miyaU = F.miyaHon.units.find((u) => u.name === '宮部継潤');
    if (F.miyaU) F.miyaU._crouch = true;   // 床几に腰を下ろす
    F.miyabe = allyGroup(rt, { name: '宮部の手', anchor: { x: -14, z: -7 }, facing: 0, width: 14, aggro: 10, noRout: true, order: 'hold' },
      dress([uS(6), uA(18)], MIYABE));
    F.guns = allyGroup(rt, { name: '塀の内の鉄砲', anchor: { x: 12, z: -4 }, facing: 0, width: 12, aggro: 6, noRout: true, order: 'hold', formation: 'line' },
      dress([uS(1), uG(14)], MIYABE));
    const n = RANKS[rt.G.rank || 0]?.squad || 0;
    if (n) rt.makeSquad({ x: -2, z: -24 }, 0, [{ kind: 'spear', n: Math.min(n, 16) }]);

    this.goalsHud(rt);
    for (const nmk of ['猿渡信光', '島津忠隣']) revealName(rt, nmk);
    rt.setPhase('brief');
    rt.obj('main', '根白坂の砦の土橋の塀を、島津の夜討ちから守る', 'main');
    rt.say('宮部継潤', '島津は今宵来る。塀一枚で持たせよ', 4);
    rt.after(4.5, () => rt.say(rt.G.name || nm(rt), '堀の底に、もう人の気配がします', 3.5));
    rt.after(9, () => this.begin(rt));
  },

  // 共通の任務札は今の一行だけなので、目標の札（hud_goals）で置き換え、①〜⑤を最初から全部並べて済んだ物に印。
  //   両軍の兵の数の棒（armybar）も上に出す（kaito 九1・九3・十二1）。樫井・真田丸と同じ作り。戦が終われば元へ戻す
  goalsHud(rt) {
    const hud = rt.hud;
    if (!hud || !hud.root || typeof document === 'undefined') return;
    hud.root.classList.add('nejiro-goals');
    const st = document.createElement('style');
    const H = 'html:root body #hud#hud#hud.nejiro-goals', P = `${H} #h-prog#h-prog.goal-mode`;
    st.textContent = `
${H} #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
${H} #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.nejiro-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
${P} > :not(.pg-goals) { display:none !important; }
${P} > .pg-goals { display:block !important; }
${P} {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
${P} .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
${P} .pg-goals li i { margin-top:3px; }
${P} .pg-goals li span { color:inherit !important; background:none !important; }
${P} .pg-goals li.now { color:#fff !important; }
${P} .pg-goals li.done { color:#cfc9bc !important; }
${P} .pg-goals :is(h3 b, li em) { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
      return out;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.progress = hudProgress;
      if (hud.prog) hud.prog.classList.remove('goal-mode');
      hud.root.classList.remove('nejiro-goals'); st.remove();
      return dispose.call(this);
    };
  },

  begin(rt) {
    const F = rt.flags;
    if (F.started || rt.over) return;
    F.started = true;
    rt.setPhase('battle');
    depthStart(rt, ctx(rt), steps(rt), () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.world.setTime('morning');
    rt.award((t) => { t.main = true; }, '根白坂の砦を守り抜いた');
    sfx('horagai', 0.8);
    // 夜明け。島津は都於郡・佐土原へ退き、秀長の陣は尾藤知宣の言で追わなかった（義久が降るのは五月で、この朝の話ではない）
    rt.say('藤堂高虎', 'よう持ったな。島津の勢いも、これまでよ', 4);
    rt.after(4.5, () => rt.say('使番', '島津勢、都於郡と佐土原へ退いていきまする！', 4));
    rt.after(9, () => rt.say('宮部継潤', '追うな。中納言様の陣からの下知じゃ。この砦が落ちなんだ事が、何よりの手柄よ', 5));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 15);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 味方の隊も段の目当てへ動く（kaito AQ7・BK1）：破れ口の段は宮部の手が土橋の内へ詰め、忠隣の段は藤堂の手と共に土橋の前の坂へ打って出る
    const di = F.dp?.i ?? -1;
    if (di !== F.allyStep) {
      F.allyStep = di;
      const go = di >= 6 ? { x: BREACH.x - 4, z: 26 } : di >= 3 ? { x: BREACH.x - 5, z: BREACH.z - 5 } : null;
      if (go) for (const g of di >= 6 ? [F.miyabe, F.todo, F.togawa, F.relief, F.koba] : [F.miyabe, F.todo, F.togawa]) if (g && g.count && !g.routed) { g.anchor = { ...go }; g.order = di >= 6 ? 'attack' : 'hold'; g.seekRange = Math.max(g.seekRange || 0, di >= 6 ? 40 : 12); }
    }
    // 塀を守る段で、守る刻を十五秒過ぎても堀の外に残る島津の組は退かせる（低い気で立ち尽くし、段が終わらなかった。11/3 測り）
    const C = F.dp && F.dp.on && F.dp.cur;
    if (C && C.s.kind === 'hold' && rt.t - C.t0 > C.s.max - 20) for (const g of C.groups) if (g.count && !g.routed) { g.noRout = false; g.morale = 0; }
    // 猿渡信光は根白坂で討死した（史実）。塀の段が終わっても生きていれば、退く前に塀の内の鉄砲に撃たれる
    if (di >= 2 && !F.saruDone) {
      F.saruDone = true;
      const sa = rt.army.units.find((u) => u.alive && u.name === '猿渡信光');
      const gun = F.guns?.units.find((u) => u.alive);
      if (sa) { rt.army.play('volley', sa.pos, 1); rt.army.kill(sa, gun || null); rt.after(0.8, () => rt.say('鉄砲頭', '猿渡信光、鉄砲に倒れたり！', 3)); }
    }
    // 松明：夜明け（段5の前の休み）で薄れて消える
    const T = F.torches;
    if (T && T.pts.visible) {
      if (F.ending) { T.k = Math.max(0, T.k - dt / 6); if (!T.k) T.pts.visible = false; }
      T.update(dt);
    }
    if (F.ending || !F.started) return;
    // 負け方：砦の中に島津が多く入り込んだまま
    F.scan = (F.scan || 0) - dt;
    if (F.scan <= 0) {
      F.scan = 0.5;
      let k = 0;
      for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && inFort(u.pos)) k++;
      F.inside = k;
    }
    F.inT = F.inside >= 40 ? F.inT + dt : Math.max(0, F.inT - dt);
    if (F.inT > 15)this.lose(rt, '島津が砦の中へなだれ込んだ');
  },
};

t08_nejirozaka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 10000 - (F.ak || 0) * 20), a0: 10000, b: Math.max(0, 35000 - (F.ek || 0) * 40), b0: 35000 };
};
t08_nejirozaka.onKill = (rt, v) => { const F = rt.flags; if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1; };
t08_nejirozaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '塀に付く' : '');
// 始まりの札の二三行（kaito 五4）
t08_nejirozaka.introText = () => '日向の根白坂の砦。今宵、島津勢が空堀を越えて寄せて来る。土橋の塀を守り抜き、斬り込む島津忠隣を討ち取れ。';
t08_nejirozaka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t08_nejirozaka.sides = { a: { name: '豊臣方 宮部継潤', mon: 'toyotomi' }, b: { name: '島津勢', mon: 'shimazu' } };
t08_nejirozaka.date = (rt) => `天正十五年四月十七日　初夏・${rt.flags.ending ? '夜明け' : '夜'}`;
t08_nejirozaka.history = '天正十五年（1587）、豊臣秀長の大軍は日向の高城を囲んだ。宮部継潤らおよそ一万は、高城の南の根白坂に空堀と板塀の砦を築き、島津の後詰を待ち受けた。四月十七日の夜、島津義久・義珍（のちの義弘）らのおよそ三万五千が砦へ総がかりで攻めたが、宮部勢は空堀と板塀と鉄砲で持ちこたえた。秀長の本隊は尾藤知宣の進言で救援を止めたが、藤堂高虎・戸川達安の手勢が助けに入り、黒田官兵衛（孝高）・小早川隆景が島津勢の横を突いた。島津忠隣・猿渡信光らが討死し、島津勢は退いた。五月に義久は頭を丸めて秀吉に降った。両軍の数には諸説がある。';

// 素直な遊び手：段の間は段の的へ。始まる前は受け持ちの塀へ
t08_nejirozaka.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // ⑤：忠隣が近ければ本人へ（近習が間にいればそちらから。樫井の塙と同じ）
  const T = F.dp?.on && F.dp.i === 6 && F.tadaU?.alive && Math.hypot(F.tadaU.pos.x - u.pos.x, F.tadaU.pos.z - u.pos.z) < 14 ? F.tadaU : null;
  if (T && patientStrike) {
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = b.army.nearestEnemy(u, 3, ok) || T;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(p, inp, e, d, true);
    return;
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  goTo(p, inp, POST.x, POST.z, 2);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t08_nejirozaka);

// 右上の目標（段の番号は steps の並び）：土橋の塀 → 破れ口 → 藤堂の援け → 島津忠隣の斬り込み。討つ数の目標は goals5 の一つだけ
const dpAt = (n) => (rt) => (rt.flags.dp?.i ?? -1) >= n;
STAGES.t08_nejirozaka = [[STEP_TEXT[0]], [STEP_TEXT[1], dpAt(3)], [STEP_TEXT[2], dpAt(4)], [STEP_TEXT[3], dpAt(6)]];
// 右上の目標5つ（goals5.js の def.goals5）：段の四つと、史実で討死した島津忠隣。「敵を何人討つ」は入れない（kaito AR1・AW3）
//   ⑤は主人公の止めだけで済む（忠隣はほかの者の手では討たれない。kaito 三4）。全部済むまで勝ちにしない（三3）
const won5 = (rt) => rt.tracker?.main === true;
const curG = (k) => (rt) => (rt.flags.dp?.on && rt.flags.dp.i === k ? rt.flags.dp.cur?.groups || [] : []);
t08_nejirozaka.goals5 = () => [
  { kind: 'stage', k: 0, text: STEP_TEXT[0], noun: '土橋の塀', check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 2, groups: curG(1) },
  { kind: 'stage', k: 1, text: STEP_TEXT[1], noun: '破れ口', check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 4, groups: curG(3) },
  { kind: 'stage', k: 2, text: STEP_TEXT[2], noun: '破れ口', check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 5, groups: curG(4) },
  { kind: 'stage', k: 3, text: STEP_TEXT[3], noun: '島津忠隣の手', check: (rt) => won5(rt) || !!rt.flags.tadaHandDone, groups: curG(6) },
  { kind: 'boss', k: 3, name: '島津忠隣', text: STEP_TEXT[4], check: (rt) => !!rt._g5?.own.has('島津忠隣') },
];

export { t08_nejirozaka };
export default t08_nejirozaka;
