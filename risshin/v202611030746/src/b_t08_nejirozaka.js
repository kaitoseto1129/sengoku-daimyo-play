// ======================================================================
// 豊臣編　根白坂の戦い（天正十五年四月十七日の夜）
// 豊臣秀長の大軍が日向の高城を囲む。宮部継潤は高城の南の根白坂に、空堀と板塀の砦を築いて島津の後詰を待ち受けた。
// 島津義久・義弘・家久らは夜にこの砦へ総がかりで攻めたが、宮部勢は持ちこたえ、藤堂高虎らの助けが来て島津は退いた。
// この負けで島津は降る道へ進む。
// 自分は部将として宮部の砦の一つの塀を受け持つ。塀に付く → 塀の上で押し返す → 破られた塀を塞ぐ → 援けまで持つ → 夜明けの追い打ち。
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
import { depthStart, depthTick, rest, fight, hold, move, depthBot } from './b_depth.js';
import { withGuard } from './toyo_bot.js';

const WALL_Z = 0;                 // 板塀の線
const WALL_X = 46;                // 塀の東西の端
const MOAT = { z: 7, hw: 3.6, d: 2.2 };   // 塀の前の空堀（土橋は x の ±4）
const BREACH = { x: 0, z: WALL_Z };       // 破られる塀（土橋の奥）
const POST = { x: 0, z: -5 };             // 自分の受け持ちの塀の内
const ROAD = [[0, 150], [2, 100], [0, 60], [0, 14], [0, -70]];
const SHIMAZU = { armor: 0x1e1c1c, lace: 0x3a3a3a, flag: 'shimazu' };
const MIYABE = { armor: 0x2a2622, flag: 'toyotomi' };
const TODO = { armor: 0x2a2622, flag: 'todo' };
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
  return { faction: 'shimazu', flag: 'shimazu', armor: SHIMAZU.armor, dmg: 0.6, mass: 180, look: (l) => dress(l, SHIMAZU),
    friends: () => [F.miyabe, F.guns, F.todo].filter((g) => g && g.count && !g.routed) };
}
const from = (x) => ({ x, z: 78 });

function steps(rt) {
  const F = rt.flags;
  return [
    // 1. 塀と堀に兵を付け、鉄砲を並べる
    move({ to: POST, r: 6, label: '受け持ちの塀', obj: '塀に兵を付け、鉄砲を並べよ', max: 60,
      say: [['宮部継潤', '鉄砲は塀の狭間へ。火縄の火を外へ見せるな'], ['足軽', '堀の底で、草が鳴っておる……']],
      onEnd: (rt) => { if (F.guns) { F.guns.order = 'hold'; F.guns.aggro = 40; } } }),
    // 2. 島津勢が堀を越えてくる。塀の上で押し返す
    hold({ at: POST, dur: 70, r: 12, title: '島津の夜討ち', sub: '堀を越え、塀へ取り付いてくる', label: '受け持ちの塀', obj: '塀を越える島津勢を押し返せ',
      say: [['宮部継潤', '来たぞ！　塀に取り付く者を突き落とせ！']],
      waves: [
        { t: 4, say: ['足軽', '丸に十字の旗じゃ！　島津家久の手が坂を登ってくる！'], foes: () => [{ name: '島津家久の手', from: from(-12), off: { x: -6, z: 2 }, list: [{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(2), uA(10)], noRout: 20 }] },
        { t: 24, say: ['鉄砲頭', '堀の中に詰まった！　放て！'], foes: () => [{ name: '島津の二の手', from: from(14), off: { x: 8, z: 2 }, list: [uS(2), uA(9), uG(3)] }] },
        { t: 46, say: ['足軽', '東の塀にも取り付いた！'], foes: () => [{ name: '島津の新手', from: from(30), off: { x: 18, z: 2 }, list: [uS(2), uA(10)] }] },
      ],
      reward: '塀の上で島津の夜討ちを押し返した' }),
    rest({ dur: 5, heal: 0.25, say: [['足軽', '……息が続かぬ'], ['宮部継潤', '島津は引かぬ。まだ来るぞ']] }),
    // 3. 破られた塀に駆け、穴を塞ぐ
    fight({ at: { x: BREACH.x, z: BREACH.z - 3 }, title: '塀が破られた', sub: '土橋の奥の板塀が倒れた', obj: '破られた塀へ駆け、入る島津勢を退けよ', max: 110,
      say: [['足軽', '土橋の塀が倒れた！　島津が入ってくる！']],
      foes: () => { breakWall(rt); return [{ name: '破れ口の島津勢', from: { x: 0, z: 40 }, list: [uS(3), uA(12)], noRout: 15 }]; },
      later: [{ t: 30, say: ['宮部継潤', '破れ口に槍を揃えよ！　一人も通すな！'], foes: () => [{ name: '島津の後ろの手', from: { x: 6, z: 60 }, list: [uS(2), uA(10)] }] }],
      reward: (t) => { t.special = { label: '破られた塀を塞いだ', pts: 20 }; }, rewardLabel: '破られた塀を塞いだ' }),
    // 4. 藤堂高虎の援けが来るまで持ちこたえる
    hold({ at: { x: BREACH.x, z: BREACH.z - 4 }, dur: 85, r: 14, title: '援けを待つ', sub: '藤堂高虎の手が、坂の上を駆けてくる', label: '破れ口', obj: '藤堂高虎の援けが来るまで、破れ口を持ちこたえよ',
      waves: [
        { t: 6, say: ['足軽', '島津義弘の旗じゃ！　本手が来る！'], foes: () => [{ name: '島津義弘の手', from: from(-6), list: [{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(3), uA(12)], noRout: 30 }] },
        { t: 30, foes: () => { todoArrive(rt); return [{ name: '島津の新手', from: from(20), off: { x: 10, z: 0 }, list: [uS(2), uA(10), uG(3)] }]; } },
        { t: 58, say: ['足軽', 'まだ来る……！'], foes: () => { reliefArrive(rt); return [{ name: '島津の最後の寄せ', from: from(-24), off: { x: -8, z: 0 }, list: [uS(2), uA(10)] }]; } },
      ],
      reward: '藤堂の援けが来るまで破れ口を守った' }),
    rest({ dur: 7, heal: 0.3, fn: (rt) => { rt.world.setTime('morning'); hidenagaArrive(rt); }, banner: ['夜が明ける', '島津勢が坂の下へ退きはじめた'],
      say: [['藤堂高虎', '島津が崩れたぞ！　坂の下まで追い落とせ！'], ['豊臣秀長', '根白坂は破れなんだ。島津に、もう打つ手はない']] }),
    // 5. 夜明け、退く島津を追い打つ
    fight({ at: { x: 0, z: 50 }, title: '追い打ち', sub: '坂を下る島津の殿を崩す', obj: '破れ口から出て、退く島津の殿を追い打て', max: 100,
      foes: () => [{ name: '島津の殿', from: { x: 4, z: 70 }, list: [uS(2), uA(10), uG(3)], dmg: 0.45 }],
      reward: (t) => { t.special = { label: '退く島津の殿を崩した', pts: 15 }; }, rewardLabel: '退く島津の殿を崩した' }),
  ];
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
  F.todo = allyGroup(rt, { name: '藤堂高虎の手', anchor: { x: -6, z: -50 }, facing: 0, width: 10, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(4), uA(14)], TODO));
  F.todo.anchor = { x: BREACH.x, z: BREACH.z - 6 };
  KIT.backOf(rt, F.todo, { flag: 'todo', armor: TODO.armor, kind: 'spear', w: 16, depth: 8, count: 140, seed: 1587 });
  rt.banner('藤堂高虎の援け', '砦の後ろから、新手が駆け付けた');
  rt.say('藤堂高虎', '宮部殿、よう持たれた！　藤堂が参ったぞ！', 4);
  sfx('horagai', 0.8);
}

// 黒田官兵衛・小早川隆景の後詰が東の尾根から着く（藤堂の後に続く）
function reliefArrive(rt) {
  const F = rt.flags;
  if (F.relief) return;
  F.relief = allyGroup(rt, { name: '黒田・小早川の後詰', anchor: { x: 40, z: -46 }, facing: 0, width: 10, aggro: 14, order: 'attack', seekRange: 60, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: false, hat: 'kabuto_m' } }, { type: 'busho', n: 1, o: { name: '小早川隆景', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(3), uA(10), uG(3)], MIYABE));
  F.relief.anchor = { x: BREACH.x + 14, z: BREACH.z - 6 };
  KIT.backOf(rt, F.relief, { flag: 'toyotomi', armor: MIYABE.armor, kind: 'mixed', w: 16, depth: 8, count: 120, seed: 1588 });
  rt.banner('後詰が着いた', '黒田官兵衛・小早川隆景の手が東の尾根から');
  rt.say('黒田官兵衛', '島津の横を突く。宮部殿の砦は、もう落ちぬ', 4);
  sfx('horagai', 0.7);
}
// 夜明け、秀長の本陣の旗が砦の後ろの丘に上がる（高城を囲む大軍から）
function hidenagaArrive(rt) {
  const F = rt.flags;
  if (F.hidenaga) return;
  F.hidenaga = allyGroup(rt, { name: '豊臣秀長の本陣', anchor: { x: -10, z: -52 }, facing: 0, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
    dress([{ type: 'busho', n: 1, o: { name: '豊臣秀長', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(4)], MIYABE));
  for (const [x, z] of [[-18, -56], [0, -58]]) rt.scene.add(nobori(rt.world, x, z, 'toyotomi', 7));
}

const t08_nejirozaka = {
  foeHit: 1.0,
  noWake: true,
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
    // ---- 遠くの大軍：坂の下の島津勢、北の高城を囲む秀長の軍勢 ----
    KIT.farHost(rt, 0, 120, 120, 20, 400, Math.PI, SHIMAZU.armor, 'shimazu', 81, 'mixed');
    KIT.farHost(rt, -110, 100, 50, 16, 200, Math.PI * 0.85, SHIMAZU.armor, 'shimazu', 82, 'spear');
    KIT.farHost(rt, 0, -150, 140, 20, 400, 0, MIYABE.armor, 'toyotomi', 83, 'mixed');
    F.torches = torchField(rt);
    // ---- 味方：宮部継潤の手と、塀の内の鉄砲 ----
    F.miyabe = allyGroup(rt, { name: '宮部継潤の手', anchor: { x: -14, z: -6 }, facing: 0, width: 12, aggro: 10, noRout: true, order: 'hold' },
      dress([{ type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true, horse: false, hat: 'kabuto_m' } }, uS(3), uA(12)], MIYABE));
    F.guns = allyGroup(rt, { name: '塀の内の鉄砲', anchor: { x: 12, z: -4 }, facing: 0, width: 12, aggro: 6, noRout: true, order: 'hold', formation: 'line' },
      dress([uS(1), uG(10)], MIYABE));
    const n = RANKS[rt.G.rank || 0]?.squad || 0;
    if (n) rt.makeSquad({ x: -2, z: -24 }, 0, [{ kind: 'spear', n: Math.min(n, 16) }]);

    rt.setPhase('brief');
    rt.obj('main', '根白坂の砦の塀を、夜明けまで守り抜け', 'main');
    rt.say('宮部継潤', '島津は今宵来る。塀一枚で持たせよ', 4);
    rt.after(4.5, () => rt.say(rt.G.name || nm(rt), '堀の底に、もう人の気配がします', 3.5));
    rt.after(9, () => this.begin(rt));
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
    rt.award((t) => { t.main = true; }, '根白坂の砦を守り抜いた');
    sfx('horagai', 0.8);
    rt.banner('島津、退く', '根白坂の砦は落ちなかった');
    rt.say('藤堂高虎', 'よう持ったな。島津の勢いもこれまでよ', 4);
    rt.after(4.5, () => rt.say('使番', '島津義久殿、頭を丸めて殿下に降るとのこと！', 4));
    rt.after(9, () => rt.say('豊臣秀長', '九州の戦は終わる。殿下がおぬしに城を与えるそうじゃ', 5));
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
    rt.banner('砦が破られた', why);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 松明：夜明け（段5の前の休み）で薄れて消える
    const T = F.torches;
    if (T && T.pts.visible) {
      if (F.dp && F.dp.i >= 5) { T.k = Math.max(0, T.k - dt / 6); if (!T.k) T.pts.visible = false; }
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
  return { a: Math.max(0, 15000 - (F.ak || 0) * 20), a0: 15000, b: Math.max(0, 20000 - (F.ek || 0) * 30), b0: 20000 };
};
t08_nejirozaka.onKill = (rt, v) => { const F = rt.flags; if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1; };
t08_nejirozaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜討ちを待つ' : '');
t08_nejirozaka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t08_nejirozaka.sides = { a: { name: '豊臣方 宮部継潤', mon: 'toyotomi' }, b: { name: '島津勢', mon: 'shimazu' } };
t08_nejirozaka.date = (rt) => `天正十五年四月十七日　初夏・${rt.flags.dp && rt.flags.dp.i >= 5 ? '夜明け' : '夜'}`;
t08_nejirozaka.history = '天正十五年（1587）、豊臣秀長の大軍は日向の高城を囲んだ。宮部継潤は高城の南の根白坂に空堀と板塀の砦を築き、島津の後詰を待ち受けた。四月十七日の夜、島津義久・義弘・家久らは砦へ総がかりで攻めたが、宮部勢は空堀と板塀と鉄砲で持ちこたえ、藤堂高虎・黒田官兵衛（孝高）・小早川隆景らが助けに駆け付けて島津勢は退いた。この負けで島津は豊臣に降る道へ進み、五月に義久は頭を丸めて秀吉に降った。両軍の数には諸説がある。';

// 素直な遊び手：段の間は段の的へ。始まる前は受け持ちの塀へ
t08_nejirozaka.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  goTo(p, inp, POST.x, POST.z, 2);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t08_nejirozaka);

export { t08_nejirozaka };
export default t08_nejirozaka;
