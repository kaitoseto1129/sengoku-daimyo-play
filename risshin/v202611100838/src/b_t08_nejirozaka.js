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
import { NEJIROZAKA_MIYABE_KACCHU } from './kacchu_data.js';
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
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 11）：段の中身は t08_nejirozaka/ に一段一ファイル
import * as jinchi from './t08_nejirozaka/jinchi.js';       // 始まり：夕暮れの砦の見回り・北の高城の囲みの遠景
import * as shuryoku from './t08_nejirozaka/shuryoku.js';
import * as honjin from './t08_nejirozaka/honjin.js';       // 二巡：秀長と尾藤知宣・島津義久と家久の本陣   // 後半：右の堀（家久）→ 土橋へ戻る（義珍）→ 援け

const WALL_Z = 0;                 // 板塀の線
const WALL_X = 46;                // 塀の東西の端
const MOAT = { z: 7, hw: 3.6, d: 2.2 };   // 塀の前の空堀（土橋は x の ±4）
const EAST_MOAT = { x: WALL_X + 7, z0: -50, z1: 7, hw: 3.6, d: 1.6 }; // 右の堀は東の板塀の外（寸法は推定）
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
const eastMoatDepth = (x, z) => {
  const dx = Math.abs(x - EAST_MOAT.x);
  if (dx >= EAST_MOAT.hw || z <= EAST_MOAT.z0 || z >= EAST_MOAT.z1) return 0;
  return EAST_MOAT.d * Math.cos(dx / EAST_MOAT.hw * Math.PI / 2)
    * sstep((z - EAST_MOAT.z0) / 4) * sstep((EAST_MOAT.z1 - z) / 4);
};

// 台地（砦）は高さ二十二。塀の前から南へ下り、坂の下は田（高さ二）。砦の後ろは丘へ緩く上る
function height(x, z) {
  let h = 22 - 20 * sstep((z - 2) / 70);
  // 砦の左右は台地の縁。東西の寄せ道は崖の上の肩に残す（寸法は推定）。
  h -= 10 * sstep((Math.abs(x) - 82) / 22) * (1 - sstep((z - 25) / 60));
  h += Math.max(0, -z - 60) * 0.12;
  h += 0.35 * Math.sin(x * 0.06 + 0.4) * Math.cos(z * 0.05) + 0.25 * Math.sin(z * 0.09 - x * 0.04);
  // 空堀：塀の前を東西に。土橋の所は掘らない
  const dz = Math.abs(z - MOAT.z), ax = Math.abs(x);
  if (dz < MOAT.hw && ax > 4 && ax < WALL_X + 4) {
    const across = Math.cos((dz / MOAT.hw) * Math.PI / 2);
    h -= MOAT.d * across * sstep((ax - 4) / 1.5) * sstep((WALL_X + 4 - ax) / 2);
  }
  return h - eastMoatDepth(x, z);
}
const inFort = (p) => p.z < WALL_Z - 1.5 && p.z > -60 && Math.abs(p.x) < WALL_X;

function ctx(rt) {
  const F = rt.flags;
  return { faction: 'shimazu', flag: 'shimazu', armor: SHIMAZU.armor, dmg: 0.6, mass: 180, scale: 2, fixedSpawn: true, idleWait: (r, C) => C.s.kind === 'hold', look: (l) => dress(l, SHIMAZU),
    // 鉄砲は塀の内、黒田・小早川は東の尾根。共通の集合指示で破れ口へ移さない。
    friends: () => [F.miyabe, F.todo, F.togawa].filter((g) => g && g.count && !g.routed), botSeek: 80 };
}
const from = (x) => ({ x, z: 78 });

function steps(rt) {
  const F = rt.flags;
  const H = { move: (o) => withoutZone(move(o)), hold: defendHold, rest, uS, uA, uG, from, POST, BREACH, STEP_TEXT, todoArrive, reliefArrive, retreatAll };
  return [
    // 0〜3. 夕暮れの砦を見て回る：右の堀 → 受け持ちの土橋の塀（t08_nejirozaka/jinchi.js）
    ...jinchi.tour(rt, H),
    // 2. 島津勢が堀を越えてくる。南の塀と東の塀の上で押し返す（砦は三方から攻められる）
    //   段の見出し（説明の札）は出さない（kaito 五1）。何が起きたかは台詞と右上の目標で分かる
    saruStep(defendHold({ at: POST, dur: 100, limit: 135, r: 12, label: '土橋の塀', obj: STEP_TEXT[0],
      say: [['宮部継潤', '来たぞ！　塀に取り付く者を突き落とせ！']],
      waves: [
        // 猿渡信光は史実で根白坂に討死した。手は崩れても退かず、塀の前で討たれるまで戦う（update が守る）
        { t: 4, say: ['足軽', '丸に十字の旗じゃ！　猿渡信光の手が坂を登ってくる！'], foes: () => [{ name: '猿渡信光の手', from: from(-12), off: { x: -6, z: 2 }, list: [{ type: 'busho', n: 1, o: { name: '猿渡信光', horse: true, hat: 'kabuto_w' } }, uS(4), uA(10)], noRout: 180 }] },
        { t: 24, say: ['鉄砲頭', '堀の中に詰まった！　放て！'], foes: () => [{ name: '島津の二の手', from: from(14), off: { x: 8, z: 2 }, list: [uS(2), uA(9), uG(3)] }] },
        { t: 46, say: ['足軽', '東の塀にも取り付いた！　横から来るぞ！'], foes: () => [{ name: '東から回った島津勢', from: { x: 78, z: -14 }, off: { x: 38, z: -14 }, list: [uS(2), uA(10)] }] },
      ],
      noRefill: true, reward: '塀の上で島津の夜討ちを押し返した' })),
    rest({ dur: 6, heal: 0.25, say: [['足軽', '……息が続かぬ'], ['宮部継潤', '島津は引かぬ。夜は長い、まだ来るぞ']],
      fn: (r) => { try { r.world.setTime('night'); if (r.world.fade) r.world.fade.dur = 40; } catch (e) { /* 空の切り替えが無い時はそのまま */ } } }),
    // 3. 破られた塀に駆け、穴を塞ぐ
    //   破れ口の場所で守る形（坂の下まで敵を追って歩かせない。11/3 測り：fight の形だと bot が坂の下 z=67 まで追って討たれた）
    defendHold({ at: { x: BREACH.x, z: BREACH.z - 3 }, dur: 90, limit: 125, r: 12, label: '破れ口', obj: STEP_TEXT[1],
      say: [['足軽', '土橋の塀が倒れた！　島津が入ってくる！']],
      waves: [
        { t: 0, foes: () => { breakWall(rt); return [{ name: '破れ口の島津勢', from: { x: 0, z: 40 }, list: [uS(3), uA(12)], noRout: 15 }]; } },
        { t: 30, say: ['宮部継潤', '破れ口に槍を揃えよ！　一人も通すな！'], foes: () => [{ name: '島津の後ろの手', from: { x: 6, z: 60 }, list: [uS(2), uA(10)] }] },
      ],
      noRefill: true, reward: '破られた塀を塞いだ' }),
    // 5. 島津が退く前に、島津忠隣が土橋へ斬り込む（史実で討死した将）
    //   忠隣の手は土橋の前の坂（堀の下）で踏みとどまる。味方の組も一緒に打って出る（kaito AP5：周りの味方も一緒に攻める）
    //   忠隣は二十の若武者で、この坂で討死した（史実）。忠隣と近習は退かず、止めは主人公の手だけ（kaito 三4）。忠隣が倒れるまで段は終わらない
    tadaStep(fight({ at: { x: BREACH.x, z: 30 }, obj: STEP_TEXT[2], max: 120, noRefill: true,
      say: [['島津忠隣', '島津忠隣、これにあり！　この塀、越えてみせる！']],
      foes: () => { tadaComes(rt); return [{ name: '島津忠隣の手', from: { x: 2, z: 56 }, list: [uS(2), uA(10)], noRout: 25 }]; },
      reward: (t) => { t.special = { label: '島津忠隣の斬り込みを止めた', pts: 15 }; }, rewardLabel: '島津忠隣の斬り込みを止めた' }), rt),
    // 8〜12. 家久・義珍の主力：右の堀 → 土橋へ戻る → 援け（t08_nejirozaka/shuryoku.js）
    ...shuryoku.main(rt, H),
  ];
}

// 右上の目標の字（段の札・右上の一覧・負けの札を一つの表から出し、途中で言い替えない。kaito 十1）
const STEP_TEXT = ['土橋の塀で、堀を越える島津勢を突き落とす', '倒れた土橋の塀へ走り、破れ口の島津勢を討つ',
  '土橋の前の坂で、島津忠隣を自分の手で討ち取る', '右の堀で、東から回る島津家久の手を食い止める', '土橋へ戻り、援けが来るまで島津の本手を食い止める'];

// 守備は持ち場で守った刻で果たす。敵の全滅を待って止まったり、
// 持ち場から離れたまま時間切れだけで済んだりしない。残兵は end の下知で退く。
function withdrawWave(C) {
  for (const g of C.groups) if (g.count && !g.routed && g.order !== 'retreat') {
    g.noRout = false;
    g.order = 'retreat'; g.historicalOrders = true; g.noPursue = true;
    g.anchor = { x: g.anchor.x, z: 150 }; g.aggro = 0; g.seekRange = 0;
  }
}

function withoutZone(s) {
  const start = s.start;
  s.start = (rt, ...args) => {
    start(rt, ...args);
    // 画面の案内を消す指定だけでは、持ち場の地面の輪は残る。行き先の▼一つに揃える。
    rt.unzone('dp');
  };
  return s;
}

function defendHold(o) {
  const s = withoutZone(hold(o)), tick = s.tick, end = s.end, dur = o.dur || 90;
  s.limit = Infinity;
  s.idleAdvance = false;
  s.noHardCap = true;   // 共通の打ち切りでも、持ち場を離れたまま守備を済ませない。
  s.tick = (rt, C, m, ctx, el, dt) => {
    const inT = C.inT;
    // 手当てなどで守備の刻が不足しても、寄せ自体は刻限で終える。
    // 退却後に共通の呼び寄せを回すと、八秒ごとに攻撃へ戻ってしまう。
    if (!C.recalled) {
      tick(rt, C, m, ctx, el, dt);
      if (el >= (o.limit || dur + 35) && !C.waves.length) {
        C.recalled = true;
        withdrawWave(C);
      }
    }
    const p = rt.player.u.pos;
    C.inT = inT + (Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14) ? dt : 0);
    // 寄せが尽きても持ち場で守った刻が足りなければ、敵零人の表示で止めない。
    rt.objProgress('dp', `${o.label}で守る あと${Math.max(0, Math.ceil(Math.max(dur - el, dur * 0.45 - C.inT)))}秒`);
    return el >= dur && !C.waves.length && C.inT >= dur * 0.45;
  };
  s.end = (rt, C, ...args) => {
    // 組頭が生きている寄せ手も、退く下知で坂の下へ戻す。
    // 士気を零にするだけでは退かず、次の寄せと砦に積み重なる。
    withdrawWave(C);
    end(rt, C, ...args);
  };
  return s;
}

// 段の終わりの退却指示より先に、猿渡の討死を確定する。
function saruStep(s) {
  const start = s.start, tick = s.tick, end = s.end;
  s.start = (rt, ...args) => {
    // 見回りは夕暮れ、最初の寄せから夜討ち。守備が済むまで夕暮れを残さない。
    rt.world.setTime('night');
    if (rt.world.fade) rt.world.fade.dur = 12;
    start(rt, ...args);
  };
  const saruFalls = (rt) => {
    const sa = rt.army.units.find((u) => u.alive && u.name === '猿渡信光');
    if (sa) {
      const gun = rt.flags.guns?.units.find((u) => u.alive);
      rt.army.play('volley', sa.pos, 1);
      // この段の討死は確定。近習が将を一度救う共通処理で生き残らせない。
      sa.officerSaved = true;
      rt.army.kill(sa, gun || null);
      rt.after(0.8, () => rt.say('鉄砲頭', '猿渡信光、鉄砲に倒れたり！', 3));
    }
    rt.flags.saruDone = true;
  };
  s.tick = (rt, C, ...args) => {
    const done = tick(rt, C, ...args);
    // 主人公が持ち場へ戻るのを待つ間も、猿渡を生かして退かせない。
    if (C.recalled && !rt.flags.saruDone) saruFalls(rt);
    return done;
  };
  s.end = (rt, ...args) => {
    if (!rt.flags.saruDone) saruFalls(rt);
    end(rt, ...args);
  };
  return s;
}

// 忠隣の段は、寄せた手を崩しても忠隣が生きている間は終わらない
function tadaStep(s, rt) {
  const tick = s.tick;
  s.tick = (r, C, m, ctx, el) => {
    // 手勢への退却の下知が出た後は、共通処理の呼び寄せで攻撃へ戻さない。
    if (!rt.flags.tadaHandDone && tick(r, C, m, ctx, el)) rt.flags.tadaHandDone = true;
    const u = rt.flags.tadaU;
    if (u?.alive) C.goal = u.pos;
    if (u?.alive && rt.flags.tadaHandDone) rt.objProgress('dp', '土橋の前の坂で、島津忠隣を討ち取れ');
    return rt.flags.tadaHandDone && !!u && !u.alive && !!rt._g5?.own.has('島津忠隣');
  };
  s.idleAdvance = false;   // 止まっていても段は先へ飛ばない（忠隣は寄せ続ける。⑤を果たさずに勝ちにしない。kaito 三3）
  s.max = 900;
  s.limit = Infinity;   // 共通の時間切れでも、主人公の止めを飛ばさない
  s.noHardCap = true;   // 忠隣を残して次へ進むと、最後の全目標判定で永久に止まる。
  return s;
}

// 島津忠隣と近習：坂の下から土橋へ斬り込む。退かず、ほかの者の手では討たれない（主人公が弱らせ切った時だけ討ち取る）
function tadaComes(rt) {
  const F = rt.flags;
  if (F.tada) return;
  F.tada = enemyGroup(rt, { faction: 'shimazu', name: '島津忠隣の近習', fixed: true, anchor: { x: -2, z: 62 }, facing: Math.PI, width: 6, order: 'attack', seekRange: 70, aggro: 16, noRout: true, morale: 100 },
    dress([{ type: 'busho', n: 1, o: { name: '島津忠隣', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(5)], SHIMAZU));
  F.tada.anchor = { x: BREACH.x, z: 14 };
  // 忠隣は本陣の将と違い、自ら斬り込んで討死する。共通の軍師に退かせず、近習と共に土橋へ進む。
  F.tada.order = 'assault'; F.tada.leaderAssault = true;
  F.tada.historicalOrders = true; F.tada.noPursue = true;
  F.tada.dmgMult = 0.6; F.tada.speed = 4.2;
  const u = F.tadaU = F.tada.units.find((q) => q.name === '島津忠隣');
  if (u) {
    // 共通の武将の後退判断を外す。ほかの者には討たれない指定と、主人公の止めは下で守る。
    u.keep = true;
    // 乗り手の保護を馬まで広げると、馬に当たった刃が傷を付けずに消える。
    u.mortalHorse = true;
  }
  // 若武者一人に三分も打ち合わせない（体の強さは出た後に決まるので、一息おいて整える）
  if (u) rt.after(0.3, () => { if (u.alive) { u.maxHp = Math.min(u.maxHp, 460); u.hp = Math.min(u.hp, u.maxHp); } });
  if (u) u.onWound = (src) => {
    if (!src?.isPlayer || !u.alive) return;
    // 主人公の止めを近習の救出で取り消さない。ほかの者の手傷では討死にしない。
    u.officerSaved = true;
    u.invuln = false;
    rt.army.kill(u, src);
  };
}

// 島津の夜討ちの松明（史実の目玉の絵）：坂の下の田と、台地の東西の脇の坂を、松明の列が幾筋も砦へ寄せてくる。
//   炎と薄い煙の二つの点群を共用する。白く発光させず、塀と地形と霧が奥を隠す。
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
  // 白い加算の光球をやめ、細い炎の輪郭を透過で描く。
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 12, 0, 57);
  gr.addColorStop(0, 'rgba(185,40,3,0)'); gr.addColorStop(0.4, '#df4c08');
  gr.addColorStop(0.8, '#ff9a16'); gr.addColorStop(1, '#9d2504');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 57);
  g.bezierCurveTo(13, 53, 27, 35, 26, 27); g.bezierCurveTo(36, 36, 34, 18, 37, 10);
  g.bezierCurveTo(49, 35, 48, 50, 32, 57); g.fill();
  g.fillStyle = '#ffc145'; g.beginPath(); g.moveTo(32, 54);
  g.quadraticCurveTo(25, 48, 34, 35); g.quadraticCurveTo(40, 49, 32, 54); g.fill();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 2.8, sizeAttenuation: true, vertexColors: true, transparent: true,
    blending: THREE.NormalBlending, depthWrite: false, fog: true, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 2;
  rt.scene.add(pts);
  // 煙は全列で一つの点群を共用し、火のすぐ上だけに薄く流す。
  const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = smokeCanvas.height = 32;
  const sg = smokeCanvas.getContext('2d'), shade = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
  shade.addColorStop(0, 'rgba(65,57,49,0.3)'); shade.addColorStop(1, 'rgba(65,57,49,0)');
  sg.fillStyle = shade; sg.fillRect(0, 0, 32, 32);
  const smokePos = new Float32Array(N * 3), smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  const smokeMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(smokeCanvas), size: 3.2,
    transparent: true, depthWrite: false, opacity: 0.5, fog: true });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; rt.scene.add(smoke);
  let t = 0, acc = 0, marchT = 0, retreat = 0;
  const q = { x: 0, z: 0 };
  const T = {
    pts, k: 1,
    update(dt) {
      t += dt; acc += dt;
      // 夜明けは寄せ道を逆にたどって坂下へ退く。消すだけでは退却の知らせと食い違う。
      if (rt.flags.retreating) retreat += dt * 4;
      else marchT += dt;
      smoke.visible = pts.visible; smokeMat.opacity = T.k * 0.5;
      if (acc < 0.08 || !pts.visible) return;
      acc = 0;
      let i = 0;
      TORCH_COLS.forEach(([P, d0, sp], ci) => {
        const L = lens[ci], lead = Math.min(L[L.length - 1], d0 + marchT * sp) - retreat;
        for (let j = 0; j < per; j++, i++) {
          at(P, L, lead - j * GAP, q);
          const x = q.x + Math.sin(q.z * 0.05 + ci) * 2.5 + ((j & 1) ? 1.1 : -1.1), z = q.z;
          pos[i * 3] = x; pos[i * 3 + 1] = W.heightAt(x, z) + 2.4 + Math.sin(t * 5 + seed[i]) * 0.08; pos[i * 3 + 2] = z;
          const f = (0.75 + 0.15 * Math.sin(t * 9 + seed[i] * 7) * Math.sin(t * 13.7 + seed[i])) * T.k;
          col[i * 3] = f; col[i * 3 + 1] = f * 0.65; col[i * 3 + 2] = f * 0.3;
          const rise = (t * 0.35 + seed[i]) % 1;
          smokePos[i * 3] = x + rise * 0.8; smokePos[i * 3 + 1] = pos[i * 3 + 1] + 1 + rise * 1.8;
          smokePos[i * 3 + 2] = z;
        }
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      smokeGeo.attributes.position.needsUpdate = true;
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
  honjin.bito(rt);
  // 藤堂は秀長の家臣で蔦の旗、戸川達安は宇喜多の手で宇喜多の旗（家ごとに隊を分ける）。説明の札は出さず、台詞と法螺で知らせる（kaito 五1）
  F.todo = allyGroup(rt, { name: '藤堂高虎の手', anchor: { x: -8, z: -50 }, facing: 0, width: 8, aggro: 14, order: 'hold', seekRange: 18, noPursue: true, historicalOrders: true, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(4), uA(8)], TODO));
  F.todo.anchor = { x: BREACH.x - 3, z: BREACH.z - 6 };
  F.togawa = allyGroup(rt, { name: '戸川達安の手', anchor: { x: 4, z: -52 }, facing: 0, width: 8, aggro: 14, order: 'hold', seekRange: 18, noPursue: true, historicalOrders: true, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '戸川達安', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uA(7)], UKITA));
  F.togawa.anchor = { x: BREACH.x + 4, z: BREACH.z - 6 };
  KIT.backOf(rt, F.todo, { flag: 'todo', armor: TODO.armor, kind: 'spear', w: 16, depth: 8, count: 140, seed: 1587 });
  rt.after(4, () => rt.say('藤堂高虎', '構わぬ、宮部殿を見捨てられるか。藤堂与右衛門、参ったぞ！', 4));
  rt.after(8.5, () => rt.say('戸川達安', '宇喜多が手の者、戸川達安！　破れ口へ槍を入れよ！', 3.5));
  sfx('horagai', 0.8);
}

// 黒田官兵衛・小早川隆景の後詰が東の尾根から着く（藤堂の後に続く）
function reliefArrive(rt) {
  const F = rt.flags;
  if (F.relief) return;
  // 黒田は藤巴、小早川隆景は左三つ巴（違い鎌は後の秀秋の物で、この年には使わない）
  F.relief = allyGroup(rt, { name: '黒田官兵衛の手', anchor: { x: 96, z: 30 }, facing: -Math.PI / 2, width: 8, aggro: 14, order: 'hold', seekRange: 18, noPursue: true, historicalOrders: true, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uA(5), uG(2)], KURODA));
  // 東の尾根から土橋前の東脇へ進み、寄せ手を射程に収める。坂下へ追わない。
  F.relief.anchor = { x: 16, z: 14 };
  F.koba = allyGroup(rt, { name: '小早川隆景の手', anchor: { x: 100, z: 42 }, facing: -Math.PI / 2, width: 8, aggro: 14, order: 'hold', seekRange: 18, noPursue: true, historicalOrders: true, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '小早川隆景', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(3), uA(5), uG(1)], KOBA));
  F.koba.anchor = { x: 20, z: 24 };
  KIT.backOf(rt, F.relief, { flag: 'kuroda', armor: KURODA.armor, kind: 'mixed', w: 16, depth: 8, count: 120, seed: 1588 });
  rt.say('黒田官兵衛', '島津の横を突く。宮部殿の砦は、もう落ちぬ', 4);
  rt.after(4.5, () => rt.say('小早川隆景', '小早川の者ども、尾根を下って島津の横腹へ！', 3.5));
  sfx('horagai', 0.7);
}
// 退却の知らせと同時に実際の隊と松明を坂下へ戻し、味方の追撃を止める。
function retreatAll(rt) {
  rt.flags.retreating = true;
  for (const g of rt.army.groups) {
    if (g.team === 0) { g.order = 'hold'; g.noPursue = true; g.historicalOrders = true; g.aggro = 0; g.seekRange = 0; }
    else {
      // 坂の下の大将も床几を離れて退く。着座したまま滑って逃げない。
      for (const u of g.units) if (u.alive) u._crouch = false;
      g.noAI = false; g.order = 'retreat'; g.historicalOrders = true; g.noPursue = true;
      g.anchor = { x: g.anchor.x, z: 240 }; g.aggro = 0; g.seekRange = 0;
    }
  }
}

const t08_nejirozaka = {
  lethal: true,   // 命懸けの戦場（lethal.js。先取り 11/9 豊臣B）
  foeHit: 1.0,
  minutes: 15, expectMin: 15,
  // 持ち場での守備と忠隣への止め、夜明けの締めを共通の十八分打ち切りで飛ばさない。
  // 敗北は主人公の討死か、砦へ敵がなだれ込んだ時に決める。
  pacingWait: () => true,
  playerTaken: 0.35,   // 15分の長い守り（忠隣の坂で倒れた。11/8 bot）   // 15分の構成（docs/toyo15_plan_1108.md の 11）
  noWake: true,
  // 見せかけの軍勢は置かない（kaito AQ6・AF・AP9）：遠景の大軍・奥の乱戦の補い・前線の小勢を足さない。島津の大軍は松明の列と、寄せる本物の兵で見せる
  noFrontFill: true,
  frontlineDensity: false,
  // 行き先は頭上の▼一つ（kaito AS・AT・AV15）。ついていく相手の青い印は出さない
  noLeaderFollow: true,
  noGroundGuide: true,
  dpNoMark: true,
  // 共通の任務札が一件表示でも、①〜⑤を最初から並べる。
  goalsAllRows: true,
  // 東の尾根から来る黒田・小早川の名も、砦の奥から分かる距離にする。
  nameRange: 140,
  // 距離だけでなく名札の枠も確保し、近くの将で後詰二人の名を消さない。
  nameTagLimit: 12,
  // 猿渡の討死は名のある知らせで伝え、共通の隊崩れの札を重ねない。
  bannerAllowed: (rt, text) => !/隊が崩れた|敵の組頭が討たれた/.test(text),
  // 布陣図の地名（docs/fujin/t08_nejirozaka.md）
  introMapPlaces: [{ x: 0, z: -14, name: '根白坂の砦' }, { x: 14, z: -96, name: '羽柴秀長の本陣' }, { x: 4, z: 172, name: '島津の陣' }],
  spawn: { x: -4, z: -30, heading: 0 },
  world: {
    namedKacchu: NEJIROZAKA_MIYABE_KACCHU,
    seed: 1587,
    time: 'dusk',   // 第一波は暮れ方。破れ口の前に夜へ（15分の構成）
    nightLift: 2.2,
    mist: true,
    paths: [ROAD],
    // 小丸川と坂の下の田は場外側。川筋・畦の寸法は推定で、戦う道を横切らない。
    streams: [{ pts: [[-300, 218], [-120, 208], [70, 218], [300, 238]], w: 13, depth: 1.5 }],
    paddy: (x, z) => z > 92 && z < 180 && Math.abs(x) > 10 && Math.abs(x) < 165
      ? (Math.abs(x % 24) > 1.5 && Math.abs(z % 28) > 1.5 ? 0.8 : 0) : 0,
    height,
    tint(x, z, h, c) {
      // 砦の中と空堀は踏まれた土。坂は夏草、坂の下は田
      if ((Math.abs(z - MOAT.z) < MOAT.hw && Math.abs(x) > 4 && Math.abs(x) < WALL_X + 4) || eastMoatDepth(x, z) > 0)
        c.setRGB(0.19, 0.14, 0.09);
      else if (z > 2 && z < 72 && Math.abs(x) < 4) c.setRGB(0.32, 0.25, 0.14);
      else if (z < WALL_Z + 12 && z > -60 && Math.abs(x) < WALL_X + 4) c.setRGB(c.r * 0.55 + 0.16, c.g * 0.5 + 0.13, c.b * 0.45 + 0.08);
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
    // 幅九十二は六で割り切れない。東の塀までつなぎ、端の二歩を通り抜けられなくする。
    front.push([WALL_X, WALL_Z]);
    // 11/8 二3：杭だけの柵でなく、杭に板を張った板塀に見せる（props.js の boardScreen）
    const BOARD = { boardScreen: true };
    F.walls = wallLine(rt, front, { team: 0, hp: 1e9, name: '板塀', segLen: 6, meshOpt: BOARD });
    wallLine(rt, [[-WALL_X, WALL_Z], [-WALL_X, -50]], { team: 0, hp: 1e9, name: '板塀', segLen: 6, meshOpt: BOARD });
    wallLine(rt, [[WALL_X, WALL_Z], [WALL_X, -50]], { team: 0, hp: 1e9, name: '板塀', segLen: 6, meshOpt: BOARD });
    for (const x of [-30, 30]) rt.scene.add(yagura(W, x, WALL_Z - 4));
    for (const x of [-38, -18, 12, 24, 40]) rt.scene.add(kagaribi(W, x, WALL_Z - 6));
    for (const [x, z] of [[-22, -8], [10, -9], [34, -8], [-4, -40]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    // 11/8 一2：宮部の本陣は前の塀から遠い砦の奥に、広い陣幕で囲む
    rt.scene.add(jinmaku(W, -4, -48, 18, 12, 3, { mon: 'toyotomi', solid: false }));
    rt.scene.add(tawara(W, 14, -30, 0.3, 4));
    // ---- 坂の下の島津の本陣（義弘）：旗本に囲まれ、坂の下を動かない（kaito AR3）。遠景の作り物の大軍は置かない ----
    //   この年の名乗りは義珍（義弘と名乗るのは後。kaito 十4 名乗りは年に合わせる）
    F.shHon = enemyGroup(rt, { faction: 'shimazu', name: '島津義珍の本陣', anchor: { x: 4, z: 150 }, facing: Math.PI, width: 12, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', seekRange: 4 },
      dress([{ type: 'busho', n: 1, o: { name: '島津義珍', invuln: true, mustLive: true, horse: false, hat: 'kabuto_w', haori: 0x2a2626 } }, uS(10), uA(8)], SHIMAZU));
    F.shHon.noPursue = true;
    const yU = F.shHon.units.find((u) => u.name === '島津義珍');
    if (yU) yU._crouch = true;   // 坂の下の本陣で床几に座る
    // 本陣の後ろに旗本の控え（寄れば本物の兵に替わる）。坂の上の砦からは松明の陰に沈む
    KIT.backOf(rt, F.shHon, { flag: 'shimazu', armor: SHIMAZU.armor, kind: 'mixed', w: 22, depth: 10, count: 240, gap: 2, seed: 1589 });
    for (const [x, z] of [[-6, 146], [14, 146]]) rt.scene.add(nobori(W, x, z, 'shimazu', 7));
    rt.scene.add(jinmaku(W, 4, 156, 12, 8, 3, { mon: 'shimazu', solid: false }));
    addSite(rt, 'fort', 0, -20, '根白坂の砦');
    F.torches = torchField(rt);
    jinchi.install(rt, { MIYABE, SHIMAZU });
    honjin.install(rt, { MIYABE, SHIMAZU, dress });
    // ---- 味方：宮部継潤の手と、塀の内の鉄砲 ----
    // 守将の宮部継潤は砦の奥の本陣で床几に座り、旗本に囲まれて下知する（塀へは出ない。kaito AR3・AV7）
    F.miyaHon = allyGroup(rt, { name: '宮部継潤の本陣', anchor: { x: -4, z: -48 }, facing: 0, width: 8, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true, horse: false, hat: 'kabuto' } }, uS(10), uA(6)], MIYABE));
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
    if (F.ending || !this.goals5().every((g) => g.check(rt))) return;
    F.ending = true;
    F.dawn = true;
    rt.setPhase('end');
    rt.world.setTime('morning');
    if (rt.world.fade) rt.world.fade.dur = 12;
    // 締めが済むまで勝ちを確定しない。確定後は台詞と戦の更新が止まる。
    retreatAll(rt);
    sfx('horagai', 0.8);
    // 夜明け。島津は都於郡・佐土原へ退き、秀長の陣は尾藤知宣の言で追わなかった（義久が降るのは五月で、この朝の話ではない）
    rt.say('藤堂高虎', 'よう持ったな。島津の勢いも、これまでよ', 4);
    rt.after(4.5, () => rt.say('使番', '島津勢、都於郡と佐土原へ退いていきまする！', 4));
    rt.after(9, () => rt.say('宮部継潤', '追うな。中納言様の陣からの下知じゃ。この砦が落ちなんだ事が、何よりの手柄よ', 5));
    // 余韻：北の高城も囲みのまま。島津は降る道へ（義久が降るのは五月）
    rt.after(14.5, () => rt.say('使番', '高城は、なお囲みの内。中納言様の本隊が押さえております', 3.6));
    rt.after(18.5, () => rt.say('藤堂高虎', '島津が降るのも遠くはあるまい。九州が平らぐぞ', 3.6));
    rt.player.u.invuln = true;
    rt.after(23, () => {
      rt.objDone('main');
      rt.award((t) => { t.main = true; }, '根白坂の砦を守り抜いた');
      rt.finish({ scriptedEnd: true }, 1);
    });
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
    // 夜明けの締めでも松明は消す。段が終わった同じコマに攻撃指示を戻さない。
    const T = F.torches;
    if (T && T.pts.visible) {
      if (F.ending) { T.k = Math.max(0, T.k - dt / 6); if (!T.k) T.pts.visible = false; }
      T.update(dt);
    }
    if (F.ending || !F.started) return;
    for (const g of [F.miyabe, F.guns, F.todo, F.togawa, F.relief, F.koba]) if (g) { g.noPursue = true; g.historicalOrders = true; }
    // 味方の隊も段の目当てへ動く（kaito AQ7・BK1）：破れ口の段は宮部の手が土橋の内へ詰め、忠隣の段は藤堂の手と共に土橋の前の坂へ打って出る
    const di = F.dp?.i ?? -1;
    if (di !== F.allyStep) {
      F.allyStep = di;
      const go = di === 7 ? { x: BREACH.x - 4, z: 26 } : di === 9 ? { x: shuryoku.EAST.x - 6, z: -6 } : di >= 5 ? { x: BREACH.x - 5, z: BREACH.z - 5 } : null;
      // 11/8 二2：秀長の陣は追い討ちをしていない。打って出るのは土橋の前の坂まで。黒田・小早川は東の尾根で島津の横に止まり、坂を下って追わない
      // 坂へ出ても持ち場を保つ。攻撃命令のままでは、生き残った寄せ手を坂下まで追ってしまう。
      // 次の守備では索敵の広さも戻し、忠隣の段の二十二歩を引き継がない。
      if (go) for (const [i, g] of [F.miyabe, F.todo, F.togawa].entries()) if (g && g.count && !g.routed) {
        // 三つの備を同じ中心へ詰めず、土橋の左右と後ろに守りを重ねる。
        g.anchor = { x: go.x + (i === 1 ? -12 : i === 2 ? 12 : 0), z: go.z - (i ? 8 : 0) };
        g.order = 'hold'; g.seekRange = di === 7 ? 22 : 12;
      }
      if (di >= 12) for (const g of [F.relief, F.koba]) if (g && g.count && !g.routed) { g.order = 'hold'; g.seekRange = 18; }
    }
    const C = F.dp && F.dp.on && F.dp.cur;
    // 猿渡が生きている間は隊を退かせない。共通の持久戦処理は残り三人や刻限で退却禁止を解く。
    // 出現時の退却禁止も塀の段の上限より長くし、軍の更新前に期限が切れる隙間を作らない。
    if (di === 4 && C) for (const g of C.groups) {
      if (g.units.some((u) => u.alive && u.name === '猿渡信光')) g.noRout = true;
    }
    // 15分の構成：忠隣の段で手の者と九十秒斬り合ったら、寄せ手は退き、忠隣と近習は土橋へ寄り続ける（手の者を討ち尽くすまで十分続いた。11/8 bot）
    if (C && di === 7 && rt.t - C.t0 > 90 && !F.tadaHandDone) {
      F.tadaHandDone = true;
      // 組頭が生きている組は士気を下げるだけでは退かない。下知で坂の下へ退かせる。
      for (const g of C.groups) if (g !== F.tada && g.count) {
        g.noRout = false; g.morale = 0;
        g.order = 'retreat'; g.historicalOrders = true; g.noPursue = true;
        g.anchor = { x: g.anchor.x, z: 150 }; g.aggro = 0; g.seekRange = 0;
      }
      rt.say('宮部の侍', F.tadaU?.alive
        ? '忠隣の寄せ手が退くぞ！　忠隣は、なお土橋へ斬り込んでくる！'
        : '忠隣の寄せ手が退くぞ！　土橋の前で槍を揃えよ！', 3);
    }
    // 忠隣は刻限で味方に討たせない。主人公の止めまで斬り込みを続け、目標を未達のまま先へ進めない。
    // 負け方：砦の中に島津が多く入り込んだまま
    F.scan = (F.scan || 0) - dt;
    if (F.scan <= 0) {
      F.scan = 0.5;
      let k = 0;
      for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && u.group?.order !== 'retreat' && inFort(u.pos)) k++;
      F.inside = k;
    }
    // 四十人以上の侵入が十五秒続いた時だけ守りの破れとする。途切れた侵入を足し合わせない。
    F.inT = F.inside >= 40 ? F.inT + dt : 0;
    if (F.inT >= 15)this.lose(rt, '島津が砦の中へなだれ込んだ');
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
t08_nejirozaka.date = (rt) => `天正十五年四月十七日　初夏・${rt.flags.dawn ? '夜明け' : (rt.flags.dp?.i ?? -1) < 4 ? '夕暮れ' : '夜'}`;
t08_nejirozaka.history = '天正十五年（1587）、豊臣秀長の大軍は日向の高城を囲んだ。宮部継潤らおよそ一万は、高城の南の根白坂に空堀と板塀の砦を築き、島津の後詰を待ち受けた。四月十七日の夜、島津義久・義珍（のちの義弘）らのおよそ三万五千が砦へ総がかりで攻めたが、宮部勢は空堀と板塀と鉄砲で持ちこたえた。秀長の本隊は尾藤知宣の進言で救援を止めたが、藤堂高虎・戸川達安の手勢が助けに入り、黒田官兵衛（孝高）・小早川隆景が島津勢の横を突いた。島津忠隣・猿渡信光らが討死し、島津勢は退いた。五月に義久は頭を丸めて秀吉に降った。両軍の数には諸説がある。';

// 素直な遊び手：段の間は段の的へ。始まる前は受け持ちの塀へ
t08_nejirozaka.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 固定位置で七割五分まで自然回復を待つと、敵が寄った時に退き続ける。
  // 共通の頭で安全な味方を探して手当てし、済んだら忠隣への止めにも戻る。
  const needsTreatment = u.hp < u.maxHp * 0.5 && p.treatmentLeft > 0 && !p.bandaged;
  if (F.dp?.on && (needsTreatment || p.sta < p.maxSta * 0.22 || F.dpBack)) {
    depthBot(b, inp, goTo); return;
  }
  // ⑤：寄せ手を崩した後は遠くても忠隣へ向かう。共通の頭は討たれない指定の将を選ばない。
  const T = F.dp?.on && F.dp.i === 7 && F.tadaU?.alive && (F.tadaHandDone || Math.hypot(F.tadaU.pos.x - u.pos.x, F.tadaU.pos.z - u.pos.z) < 14) ? F.tadaU : null;
  if (T && patientStrike) {
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = b.army.nearestEnemy(u, 3, ok) || T;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀は一・九歩より内側で届く。槍の間合いで止まると忠隣を討てず、戦が終わらない。
    const reach = (p.weapon === 'sword' ? 1.9 : 2.8) * 0.85;
    if (d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach); else inp.k.delete('KeyW');
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
STAGES.t08_nejirozaka = [[STEP_TEXT[0]], [STEP_TEXT[1], dpAt(6)], [STEP_TEXT[2], dpAt(7)], [STEP_TEXT[3], dpAt(9)], [STEP_TEXT[4], dpAt(11)]];
// 右上の目標5つ（goals5.js の def.goals5）：段の四つと、史実で討死した島津忠隣。「敵を何人討つ」は入れない（kaito AR1・AW3）
//   ⑤は主人公の止めだけで済む（忠隣はほかの者の手では討たれない。kaito 三4）。全部済むまで勝ちにしない（三3）
const won5 = (rt) => rt.tracker?.main === true;
const curG = (k) => (rt) => (rt.flags.dp?.on && rt.flags.dp.i === k ? rt.flags.dp.cur?.groups || [] : []);
t08_nejirozaka.goals5 = () => [
  { kind: 'stage', k: 0, text: STEP_TEXT[0], noun: '土橋の塀', place: (rt) => (rt.flags.dp?.i ?? -1) < 4 ? rt.flags.dp?.cur?.goal || POST : POST, check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 5, groups: curG(4) },
  { kind: 'stage', k: 1, text: STEP_TEXT[1], noun: '破れ口', place: () => BREACH, check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 7, groups: curG(6) },
  { kind: 'boss', k: 2, name: '島津忠隣', text: STEP_TEXT[2], check: (rt) => !!rt._g5?.own.has('島津忠隣') },
  { kind: 'stage', k: 3, text: STEP_TEXT[3], noun: '右の堀', place: () => shuryoku.EAST, check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 10, groups: curG(9) },
  { kind: 'stage', k: 4, text: STEP_TEXT[4], noun: '土橋の塀', place: () => POST, check: (rt) => won5(rt) || (rt.flags.dp?.i ?? -1) >= 12, groups: curG(11) },
];

export { t08_nejirozaka };
export default t08_nejirozaka;
