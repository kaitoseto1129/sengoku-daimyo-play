// ======================================================================
// 稲生の戦い　「一番最初の戦」（kaito 11/9 夜・docs/ino_spec_1109.md）
//   主人公は名を呼ばれない足軽。命令の権限は無く、隊長について行き、出ろと言われたら出て、退けと言われたら退く。
//   流れ：行軍（遠くの信長）→ 物見との初めての斬り合い →「追うな！」→ 前衛に合流（林勢・奥に柴田の旗）→ 林勢と押し合い
//   → 新六の手負い（助けるかは選べる）→ 隊長の討死 → 佐久間隊へ合流 → 林の大旗が倒れる → 柴田勢の前進（遠くの柴田）
//   → 戦線が下がる → 柴田が山田治部左衛門を討つ → 名塚砦へ退く → 信長が来て軍が向き直る → 押し返す → 柴田は手負うて整然と退く
//   → 追撃停止 → 戦の跡を歩く → 退く柴田を黙って見る → 結果は「足軽」のまま。
//   地面・田・稲架・名塚の砦は b_inou_spec.js の物を使う。座標：南が +z（出だし）、北が −z（敵）。
// ======================================================================
import * as THREE from 'three';
import { inou_spec as BASE, reeds, hasaField, farmHouses, paddyRice, nazukaFort, strayArrows } from './b_inou_spec.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori } from './props.js';
import { MEM_TIGHT } from './settings.js';
import { sfx, playMusic, stopMusic } from './audio.js';
import { inouEnemyAlive, INO_GOALS } from './b_inou_goals.js';

const XW = 74, ZS = 146, ZN = -146;
const START = { x: 12, z: 136 };
const NAZUKA_PT = { x: 46, z: 122 };     // 退く先：名塚砦（見えない壁の外 96,116）へ向かう道の口
const NK = MEM_TIGHT ? 0.8 : 1;
const N = (n) => Math.max(2, Math.round(n * NK));
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveIn = (list) => (list || []).reduce((n, g) => n + (g ? g.units.reduce((m, u) => m + (u.alive && !u.gone ? 1 : 0), 0) : 0), 0);
// 退場は描画の片付け。命を残して去った兵も全軍の生存者に含める（討死は命が零）。
const survivorsIn = (list) => (list || []).reduce((n, g) => n + (g ? g.units.reduce((m, u) => m + (u.alive || u.gone && u.hp > 0 ? 1 : 0), 0) : 0), 0);
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ZAKO = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236 };
const HAYA = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, flag: 'nobukatsu', ...(s.o || {}) } }));
const SHIBA = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, flag: 'kari', flagShape: 1, ...(s.o || {}) } }));
// 柴田勢は林勢より整う：揃いの黒い具足・旗が多い
const SHIBA_SET = (list) => list.map((s) => ({ ...s, o: { armor: 0x1d1b19, hatColor: 0x161412, lace: 0x3a3430, flag: 'kari', flagShape: 1, flagScale: 1, ...(s.o || {}) } }));
const FORCE = { a: 700, a0: 700, b: 1700, b0: 1700 };
const round10 = (n) => Math.max(0, Math.round(n / 10) * 10);
const COMRADES = ['弥助', '源太', '新六'];
// この戦の台詞だけを通す（共通の褒め言葉・「でかした」などを出さない。初めて討っても祝わない）
function say(rt, who, text, d) { const F = rt.flags; F._mine = true; try { rt.say(who, text, d); } finally { F._mine = false; } }

const REGROUP_TARGET = { pos: NAZUKA_PT, label: '名塚砦' };
function regroupTarget(F, L) { return L ? { pos: L.pos, label: L === F.sakumaU ? '組頭' : '隊長', unit: L } : REGROUP_TARGET; }

// 行き先のピン：始めから終わりまで切らさない（関所 3）。遠くは金の▼に距離、近くは地面のピン
function pinTo(rt, pos, label, unit = null) {
  const F = rt.flags;
  F.beginnerPinTarget = null;
  if (!pos) { F.farPin = null; return null; }
  const P = rt.player.u.pos;
  if (near(pos, P) > 30) {
    const far = F.farPinObj || (F.farPinObj = { x: 0, z: 0, r: 0, label: '' });
    far.x = pos.x; far.z = pos.z; far.r = 28; far.label = label;
    // 遠くでは場所名と距離を出し、三十m 内で人物本人の印へ渡す。
    far.unit = null; far.enemy = false;
    F.farPin = far;
    return null;
  }
  F.farPin = null;
  const pin = F.beginnerPin || (F.beginnerPin = { x: 0, z: 0, r: 0 });
  pin.x = pos.x; pin.z = pos.z; pin.r = 3; pin.label = label;
  // 名塚への到着後も、向き直る下知までは同じ場所を示す。
  pin.hideDistance = 0; pin.hide = 0; pin.always = true;
  // 隊長のそばに並んでも案内を消さず、移動する本人の頭上を追う。
  pin.unit = unit; pin.enemy = !!unit && unit.team !== rt.player.u.team; pin.flagDestination = !unit;
  F.beginnerPinTarget = pin;
  return pin;
}

const ino = {
  ...BASE,
  introText: () => '信長の弟・信勝を立てて、柴田勝家と林美作守が背いた。あなたは名も無い足軽の一人。隊長について行け。',
  introPeople: [
    { id: '信長', name: '織田信長', note: '清洲城の主。家中の多くが弟の信勝に付いた。足軽からは遠い人。' },
    { id: '信勝', name: '柴田勝家', note: '信勝の家老。柴田勢 千を率いる。この日は敵。' },
    { id: '林', name: '林美作守', note: '林勢 七百を率いて名塚の砦へ寄せる。' },
  ],
  goalVisibleRows: 1,
  goalRowsAhead: false,
  keepBattleSigns: true, // 行き先の印を出す間も、両軍の数と武将の名を残す。
  goalSignTriangle: true, // 画面の外でも矢印へ回さず、縁の▼で示す。
  noFieldMap: true,
  fieldMapRight: false,
  mapMarks: () => null,
  hideNameTag: (u) => u.name === '隊長' || COMRADES.includes(u.name) || u.name === '組頭' || !!u.inouNoWord,
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取/.test(t),
  speechAllowed: (rt) => !!rt.flags?._mine,
  force(rt) {
    const F = rt?.flags;
    if (!F?.allAlly) { FORCE.a = 700; FORCE.b = 1700; return FORCE; }
    const a = survivorsIn(F.allAlly), a0 = F.allAllyN || 1;
    // 物見も林勢七百の内。出現前は控えとして数え、出現時に人数を回復させない。
    const scouts = F.scoutN || 0;
    const h = survivorsIn(F.haya) + (F.scoutG ? survivorsIn([F.scoutG]) : scouts);
    const h0 = (F.hayaN || 0) + scouts || 1, s = survivorsIn(F.shiba), s0 = F.shibaN || 1;
    // 後詰も七百の内訳。初めに決めた全軍の人数で損耗を量り、合流で討死を戻さない。
    const total = F.allAlly.reduce((n, g) => n + (g?.units.length || 0), 0);
    FORCE.a = round10(Math.max(0, 700 * (1 - (total - a) / a0)));
    FORCE.b = round10(700 * h / h0 + 1000 * s / s0);
    return FORCE;
  },
  missionHeading(rt) { return INO_GOALS[rt.flags.ph || 'march'] || INO_GOALS.march; },
  missionSignTarget(rt, range = 30) {
    const F = rt.flags;
    if (!['scout', 'hayashi', 'shibata', 'push'].includes(F.ph)) return null;
    const P = rt.player.u.pos;
    let best = null, bd = range * range;
    for (const u of rt.army.units) {
      if (u.team === rt.player.u.team || !inouEnemyAlive(u) || u.invuln) continue;
      // 物見・林勢・柴田勢の下知に、別の備の兵を混ぜない。
      if (F.ph === 'scout' ? u.group !== F.scoutG :
          !(F.ph === 'hayashi' ? F.haya : F.shibaLines)?.includes(u.group)) continue;
      const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  // ピンは段ごとに一つ：ついて行く人・行く所・押し合う所
  missionPin(rt) {
    const t = this.pinTarget(rt);
    if (!t) return pinTo(rt, null);
    return pinTo(rt, t.pos, t.label, t.enemy || t.unit || null);
  },
  pinTarget(rt) {
    const F = rt.flags, L = F.lead?.alive && !F.lead.gone ? F.lead : F.sakumaU?.alive && !F.sakumaU.gone ? F.sakumaU : null;
    switch (F.ph) {
      case 'march': case 'van': return regroupTarget(F, L);
      case 'scout': case 'hayashi': case 'shibata': case 'push': {
        // 三十m 外でも同じ任務の敵へ進む。敵が残っているのに組頭へ戻さない。
        const e = this.missionSignTarget(rt, Infinity);
        if (e) return { pos: e.pos, label: F.ph === 'scout' ? '林の物見' : F.ph === 'hayashi' ? '林勢' : '柴田勢', enemy: e };
        return regroupTarget(F, L);
      }
      case 'join': return F.sakumaU?.alive && !F.sakumaU.gone ? { pos: F.sakumaU.pos, label: '佐久間隊', unit: F.sakumaU } : regroupTarget(F, L);
      case 'retreat': return { pos: NAZUKA_PT, label: '名塚砦' };
      case 'rally': return F.nobuU?.alive && !F.nobuU.gone ? { pos: F.nobuU.pos, label: '殿', unit: F.nobuU } : { pos: NAZUKA_PT, label: '名塚砦' };
      case 'after': return F.shinrokuU?.alive && !F.shinrokuU.gone && !F.shinMet ? { pos: F.shinrokuU.pos, label: '新六', unit: F.shinrokuU } : regroupTarget(F, L);
      default: return regroupTarget(F, L);
    }
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    Object.assign(FORCE, { a: 700, b: 1700 });
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }
    { let fb = rt.firstBattle; Object.defineProperty(rt, 'firstBattle', { configurable: true, get() { return fb && !window.__game?.hud?.introWaiting; }, set(v) { fb = v; } }); }
    rt.def.playerAtkMax = rt.world.def.playerAtkMax = 2;
    F.groups = []; F.holdPlayer = false; F.ph = 'march'; F.phT = 0; F.dinT = 2; F.inLine = 0; F.lineT = 0;
    reeds(rt); hasaField(rt); farmHouses(rt); paddyRice(rt); nazukaFort(rt);
    { const lookOf = W.lookOf, upd = W.update;
      W.lookOf = function (key) { const L = lookOf.call(this, key); if (key === 'day') { L.fog.setHex(0x8c9a8e); L.sunI *= 0.78; L.hemiI *= 1.18; L.cover = Math.max(L.cover, 0.62); } return L; };
      if (W.timeKey === 'day') W.applyLook(W.lookOf('day'));
      W.update = function (...a) { const r = upd.apply(this, a), fog = this.scene.fog, f = Math.floor(fog.far);
        if (this.timeKey === 'day' && f >= 85 && f < 210) fog.far = 210 + (fog.far - f); return r; }; }
    const fixed = true;
    // 自分の組：隊長と足軽七人（弥助・源太・新六）。主人公は列の後ろ
    F.kumi = allyGroup(rt, { name: '隊長', anchor: { x: 12, z: 124 }, facing: Math.PI, width: 1, aggro: 6, speed: 2.8, order: 'hold', noRout: true, noFrontline: true, fixed },
      [{ type: 'samurai', n: 1, o: { name: '隊長', invuln: true, keep: true, horse: false } }]);
    F.lead = F.capU = F.kumi.units[0];
    F.kumiLeader = F.capU; F.bossName = '隊長';
    F.mates = allyGroup(rt, { name: '足軽', fullStrength: true, anchor: { x: 12, z: 129 }, facing: Math.PI, width: 4, aggro: 0, speed: 2.8, noAI: true, noRout: true, order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.2, fixed },
      [...['弥助', '源太'].map((name) => ({ type: 'ashigaru', n: 1, o: { name, keep: true, invuln: true } })), { type: 'ashigaru', n: 4 }]);
    F.yasukeU = F.mates.units.find((u) => u.name === '弥助');
    // 新六は一人の組（手負うて下がる所を別に動かす）。それまでは組の左に付いて歩く
    F.shinG = allyGroup(rt, { name: '新六', anchor: { x: 9, z: 130 }, facing: Math.PI, width: 1, aggro: 0, speed: 2.8, noAI: true, noRout: true, order: 'hold', fixed },
      [{ type: 'ashigaru', n: 1, o: { name: '新六', keep: true, invuln: true } }]);
    F.shinrokuU = F.shinG.units[0];
    // 前衛の味方（三組）：初めは五十m 先に立つ。前衛に合流すると一つの小さな戦線になる
    F.van = [-6, 30, 46].map((x) => allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x, z: 44 }, facing: Math.PI, width: 5, aggro: 0, speed: 2.8, noAI: true, noRout: true, order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15, fixed },
      [{ type: 'ashigaru', n: N(7), o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
    // 佐久間隊（右）：組頭が隊長の代わりに主人公らを呼ぶ
    F.sakuma = allyGroup(rt, { name: '佐久間隊', fullStrength: true, anchor: { x: 30, z: 40 }, facing: Math.PI, width: 5, aggro: 0, speed: 2.8, noAI: true, noRout: true, order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15, fixed },
      [{ type: 'samurai', n: 1, o: { name: '組頭', invuln: true, keep: true, horse: false } }]);
    F.sakumaU = F.sakuma.units[0];
    // 林勢（四組・三十余り）：前衛の三十m 先。林美作守は列の後ろで馬上、大旗を立てる
    F.haya = [-10, 6, 22, 38].map((x) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢', anchor: { x, z: 6 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5, noRout: true, noAI: true, formation: 'line', morale: 80, dmgMult: 0.4, order: 'hold', aggro: 0, speed: 3, fixed },
        HAYA([{ type: 'ashigaru', n: N(6), o: { flagScale: 1 } }, { type: 'ashigaru', n: N(2) - 1 }, { type: 'bow', n: 1 }, { type: 'samurai', n: 1 }]));
      // 控えの弓は下知まで射かけない。noAI だけでは兵個々の射撃判断は止まらない。
      g.fire = false;
      F.groups.push(g); return g;
    });
    F.hayaBoss = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守', anchor: { x: 16, z: -12 }, facing: 0, width: 2, noRout: true, noAI: true, order: 'hold', aggro: 0, morale: 100, fixed },
      HAYA([{ type: 'busho', n: 1, o: { name: '林美作守', invuln: true, keep: true, horse: true } }, { type: 'samurai', n: 3 }]));
    F.groups.push(F.hayaBoss);
    F.hayaBossU = F.hayaBoss.units.find((u) => u.name === '林美作守');
    F.haya.push(F.hayaBoss);
    F.hayaN = aliveIn(F.haya);
    F.scoutN = 6;
    // 林の大旗（倒れる旗）
    F.hayaFlag = nobori(W, 16 + 2, -14, 'nobukatsu', 7.5); rt.scene.add(F.hayaFlag);
    // 柴田勢（横の奥・東）：初めは百m 余り奥。林勢が崩れた後に鬨とともに寄せる。林勢より多く、列が厚い
    F.shibaLines = [-40, -24, -8, 8, 24, 40].map((x, i) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勢', anchor: { x: x - 20, z: -110 - (i % 2) * 3 }, facing: 0, fleeDir: { x: -1, z: -1 }, width: 6, noRout: true, noAI: true, formation: 'line', morale: 100, dmgMult: 0.5, defMult: 1.2, order: 'hold', aggro: 0, speed: 2.6, fixed },
        SHIBA_SET([{ type: 'ashigaru', n: N(8) - 1 }, { type: 'bow', n: 1 }, { type: 'ashigaru', n: N(2), o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
      g.fire = false;
      g.lineX = x; F.groups.push(g); return g;
    });
    F.shibaG = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勝家', anchor: { x: -10, z: -124 }, facing: 0, fleeDir: { x: -1, z: -1 }, width: 3, noRout: true, noAI: true, order: 'hold', aggro: 0, morale: 100, dmgMult: 0.8, fixed },
      SHIBA_SET([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, keep: true, horse: true } }, { type: 'cavalry', n: 2, o: { invuln: true } }, { type: 'samurai', n: 4, o: { invuln: true } }]));
    F.shibaU = F.shibaG.units.find((u) => u.name === '柴田勝家');
    F.groups.push(F.shibaG);
    F.shibaFlag = nobori(W, -8, -126, 'kari', 7.5); rt.scene.add(F.shibaFlag);
    F.shiba = [...F.shibaLines, F.shibaG];
    F.shibaN = aliveIn(F.shiba);
    // 信長の一団：遠く（七十m 余り西）を通るだけ。後で名塚の前へ駆けつける
    F.nobuG = allyGroup(rt, { name: '信長の旗本', fullStrength: true, anchor: { x: -66, z: 30 }, facing: Math.PI, width: 4, aggro: 0, speed: 3.2, noAI: true, noRout: true, order: 'hold', fixed },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, keep: true, horse: true, flag: 'oda' } }]),
        { type: 'samurai', n: 1, o: { name: '森可成', invuln: true, keep: true } }, { type: 'cavalry', n: 3, o: { invuln: true } },
        { type: 'samurai', n: 1, o: { name: '黒田半平', invuln: true, keep: true } },
        { type: 'samurai', n: 1, o: { name: '口中杉若', invuln: true, keep: true, horse: false } },
        { type: 'samurai', n: 1, o: { name: '織田造酒丞', invuln: true, keep: true } },
        { type: 'samurai', n: 3, o: { invuln: true } }]);
    F.nobuU = F.nobuG.units.find((u) => u.name === '織田信長') || null;
    F.hanbeiU = F.nobuG.units.find((u) => u.name === '黒田半平');
    F.nobuFlag = nobori(W, -64, 34, 'oda', 6.5); rt.scene.add(F.nobuFlag);
    F.allAlly = [F.kumi, F.mates, F.shinG, ...F.van, F.sakuma, F.nobuG];
    // 後から来る森の手と山田も七百の内。登場で人数を増やさず、討死は数から引く。
    F.allAllyN = aliveIn(F.allAlly) + N(9) + 2 + 1;
    rt.obj('main', INO_GOALS.march, 'main');
    this.march(rt);
  },

  // 段を変える（右上の一行が変わる）
  go(rt, ph) {
    const F = rt.flags;
    if (F.ph === ph || F.ending && ph !== 'after') return;
    F.ph = ph; F.phT = rt.t;
    rt.obj('main', INO_GOALS[ph], 'main');
  },
  sayIf(rt, ph, t, who, s, d = 3) { rt.after(t, () => { if (rt.flags.ph === ph && !rt.over) say(rt, who, s, d); }); },
  moveG(g, dest, speed, then) {
    if (!live(g)) return;
    if (g.inouRetiring) { g.inouRetiring = false; g.retreatOnly = false; g.peaceful = false; for (const u of g.units) u.noTarget = false; }
    // 移動の下知では古い斬り合いを切る。
    g.focus = null;
    for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; u.aiT = 0; }
    g.order = 'move'; g.dest = { ...dest }; if (speed) g.speed = speed; g.anchor = { ...dest };
    g.onArrive = (q) => { if (then === 'attack') this.fight(q); else q.order = then || 'hold'; };
  },
  fight(g, aggro = 14) {
    if (!live(g)) return;
    if (g.inouRetiring || g.peaceful) { g.inouRetiring = false; g.retreatOnly = false; g.peaceful = false; for (const u of g.units) u.noTarget = false; }
    g.fire = true; g.noAI = false; g.order = 'attack'; g.aggro = aggro; g.seekRange = 26; g.onArrive = null;
  },
  // 整然と退く隊は、通常の移動中の敵探しへ戻さず、旗と同じ退路を進む。
  retireG(g, dest, speed, exposed = false) {
    if (!live(g)) return;
    g.inouRetiring = true; g.retreatOnly = true; g.peaceful = true;
    // 攻撃対象から外した新六や退く旗本も、持ち場に着いた人数へ数える。
    g.arriveNoncombat = true;
    g.noAI = true; g.routing = false; g.focus = null; g.aggro = 0; g.fire = false;
    g.anchor = { ...g.center() }; g.dest = { ...dest };
    g.path = [[dest.x, dest.z]]; g.pathIdx = 0; g.order = 'path'; g.speed = speed;
    g.onArrive = (q) => { q.order = 'hold'; q.path = null; q.aggro = 0; };
    for (const u of g.units) { u.noTarget = !exposed; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; u.aiT = 0; }
  },

  // 0:00 行軍：隊長「おい、そこの者。槍を持て。」→ 列の後ろについて北へ。遠くを信長の一団が通る
  march(rt) {
    const F = rt.flags, s = (t, w, x, d) => this.sayIf(rt, 'march', t, w, x, d);
    sfx('tramp', 0.6);
    s(1, '隊長', 'おい、そこの者。槍を持て。', 2.6);
    s(4, '隊長', '出るぞ。遅れるな。', 2.2);
    const step = (t, z) => rt.after(t, () => { if (F.ph !== 'march') return; this.moveG(F.kumi, { x: 12, z: z - 4 }, 2.6); this.moveG(F.mates, { x: 12, z }, 2.6); sfx('taiko', 0.6); });
    step(6, 112); step(40, 96); step(72, 82);
    s(14, '弥助', '初陣か？', 2.2);
    s(18, '源太', '槍は前に出しすぎるなよ。腰で突け。', 2.8);
    s(24, '足軽', '今日は身内同士だ。気を抜くな。', 2.8);
    rt.after(30, () => { if (F.ph === 'march') sfx('horagai', 0.4); });
    s(34, '新六', '柴田勢は強いらしいぞ……', 2.6);
    // 1:20 遠くを信長の一団が通る（会話なし。名前は一瞬だけ）
    rt.after(52, () => { if (live(F.nobuG)) { this.moveG(F.nobuG, { x: -66, z: 120 }, 3.2); sfx('gallop', 0.4); } });
    s(60, '足軽', '……殿だ。殿がお見えだ。', 2.6);
    // 合流していない本人の「ついていけ」を、待ち時間だけで済ませない。
    // 遅れて来た場合は update で合流を拾う。
  },

  // 2:00 物見との初めての斬り合い（六対六ほど。横でも味方が戦う）
  scout(rt) {
    const F = rt.flags, P = rt.player.u;
    this.go(rt, 'scout');
    F.scoutG = enemyGroup(rt, { faction: 'nobukatsu', name: '林の物見', anchor: { x: 12, z: 60 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 4, noRout: true, noAI: true, order: 'move', dest: { x: 12, z: 78 }, aggro: 0, speed: 2.8, dmgMult: 0.25, morale: 60, fixed: true },
      HAYA([{ type: 'ashigaru', n: F.scoutN }]));
    for (const u of F.scoutG.units) { u.hp = u.maxHp = Math.max(22, P.dmg * 2); u.cdBase *= 1.6; }
    F.scoutG.onArrive = (q) => this.fight(q, 16);
    F.groups.push(F.scoutG);
    say(rt, '隊長', '前から敵じゃ！　物見ぞ。', 2.4);
    rt.after(2.6, () => { if (F.ph !== 'scout') return; say(rt, '隊長', '槍、構え！', 2); sfx('taiko', 0.9); this.fight(F.mates, 12); this.fight(F.kumi, 10); });
  },
  // 3:30 敵の小隊が退く →「追うな！ 隊列を崩すな！」
  scoutBack(rt) {
    const F = rt.flags;
    if (F.scoutBack) return;
    // 味方が物見を退けても、列に加わらない本人の任務は済ませない。
    if (!F.lead?.alive || near(F.lead.pos, rt.player.u.pos) > 16) return;
    F.scoutBack = true;
    if (live(F.scoutG)) { const g = F.scoutG; g.routing = true; g.order = 'retreat'; g.dest = { x: 12, z: -60 }; g.fleeDir = { x: 0, z: -1 }; g.speed = 3.6; g.aggro = 0; g.focus = null; g.fire = false; g.onArrive = null; for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; } }
    say(rt, '隊長', '追うな！　隊列を崩すな！', 2.8);
    for (const g of [F.mates, F.kumi]) if (live(g)) this.retireG(g, g.center(), g.speed, true);
    this.go(rt, 'van');
    rt.after(3.5, () => { this.moveG(F.kumi, { x: 12, z: 50 }, 2.8); this.moveG(F.mates, { x: 12, z: 54 }, 2.8); });
    this.sayIf(rt, 'van', 6, '隊長', '前衛に合流するぞ。ついて来い。', 2.6);
    rt.after(30, () => { if (F.ph === 'van' && !F.manySaid) { F.manySaid = true; say(rt, '弥助', '……多いな。', 2.2); } });
    this.sayIf(rt, 'van', 34, '足軽', '奥の雁金の旗……あれが柴田か。', 2.8);
    rt.after(58, () => { if (F.ph === 'van' && F.lead?.alive && near(F.lead.pos, rt.player.u.pos) < 14) this.hayashi(rt); });
  },

  // 5:00 林勢と接触（味方二十余り・敵三十余り）。主人公は隊長のすぐ後ろ。隊長の「押せ」「左へ寄れ」「下がれ」
  hayashi(rt) {
    const F = rt.flags;
    this.go(rt, 'hayashi');
    F.contactT = rt.t;
    sfx('taiko', 1); rt.after(0.5, () => sfx('taiko', 0.9));
    rt.army.play('toki', { x: 12, z: 30 }, 1.4);
    for (const g of F.haya) if (g !== F.hayaBoss) { this.moveG(g, { x: g.anchor.x, z: 26 }, 2.8, 'attack'); }
    for (const g of [...F.van, F.mates, F.kumi]) this.moveG(g, { x: g === F.mates || g === F.kumi ? 12 : g.anchor.x, z: 34 }, 2.8, 'attack');
    say(rt, '隊長', '押せ！', 1.8);
    const s = (t, w, x, d) => this.sayIf(rt, 'hayashi', t, w, x, d);
    s(14, '隊長', '左へ寄れ！　列を詰めよ！', 2.4);
    rt.after(14, () => { if (F.ph === 'hayashi' && live(F.kumi)) { F.kumi.anchor = { x: 8, z: F.kumi.anchor.z }; } });
    s(28, '隊長', '下がれ！　一歩下がって槍を揃えよ！', 2.6);
    s(38, '隊長', '前へ！', 1.8);
    // 5:50 新六が斬られる（倒れず、手負いで下がる）
    rt.after(48, () => {
      const S = F.shinrokuU;
      if (F.ph !== 'hayashi' || !S?.alive) return;
      F.shinHurtT = rt.t;
      say(rt, '新六', 'ぐっ……！', 1.6);
      S.hp = Math.max(1, S.maxHp * 0.2); S.noTarget = true; S.invuln = true; S.target = null;
      // 負傷後は敵探しと射撃も止め、手負いのまま後ろへ離脱する。
      this.retireG(F.shinG, { x: S.pos.x + 4, z: S.pos.z + 22 }, 1.0);
      rt.after(1.6, () => say(rt, '弥助', '新六が斬られた！', 2));
    });
    // 6:30 隊長が敵の槍を受けて倒れる
    rt.after(90, () => { if (F.ph === 'hayashi') this.capDown(rt); });
  },
  capDown(rt) {
    const F = rt.flags, C = F.capU;
    if (F.capDead || !C?.alive) return;
    F.capDead = true;
    let k = null, bd = 30;
    for (const u of rt.army.units) if (u.team === 1 && u.alive && !u.gone && near(u.pos, C.pos) < bd) { bd = near(u.pos, C.pos); k = u; }
    C.invuln = false; C.inouNoWord = true;
    rt.army.play('eshout', C.pos, 1.2);
    rt.army.kill(C, k);
    rt.after(0.8, () => say(rt, '弥助', '隊長！', 1.8));
    rt.after(3.2, () => say(rt, '組頭', 'そこの連中！　こっちへ来い！', 2.6));
    rt.after(3.4, () => { F.lead = F.sakumaU; this.go(rt, 'join'); });
    // 弥助・源太らも古い相手から離れ、本人が佐久間隊へ合流するまで組頭のそばで待つ。
    rt.after(4, () => { if (live(F.mates) && F.sakumaU) this.retireG(F.mates, { x: F.sakumaU.pos.x - 3, z: F.sakumaU.pos.z + 2 }, 3, true); });
  },
  joined(rt) {
    const F = rt.flags;
    if (F.joined || !F.sakumaU?.alive || F.sakumaU.gone || near(F.sakumaU.pos, rt.player.u.pos) >= 9) return;
    F.joined = true;
    say(rt, '組頭', 'よし、わしの後ろにつけ。', 2.4);
    this.go(rt, 'hayashi');
    this.fight(F.sakuma, 12);
    this.fight(F.mates, 12);
    // 美作守は信長が自ら討つ。旗本を先に進め、近くの足軽へ手柄を渡さない。
    if (F.hayaBossU?.alive) this.moveG(F.nobuG, { x: F.hayaBossU.pos.x, z: F.hayaBossU.pos.z + 3 }, 5);
    rt.after(36, () => this.hayashiFall(rt));
  },
  // 7:20 林の大旗が揺れ、遠くで美作守が討たれて大旗が倒れる → 林勢が崩れる
  hayashiFall(rt) {
    const F = rt.flags;
    if (F.hayaDown) return;
    const B = F.hayaBossU, N = rt.G.lord ? rt.player.u : F.nobuU;
    // 到着前に遠くから討った事にせず、旗と知らせも実際の討ち取りまで待つ。
    if (B?.alive && (!N?.alive || near(B.pos, N.pos) > 4.5)) {
      if (!rt.G.lord) this.moveG(F.nobuG, { x: B.pos.x, z: B.pos.z + 3 }, 5);
      rt.after(0.5, () => { if (!F.ending && !rt.over) this.hayashiFall(rt); });
      return;
    }
    // 半平が先に斬り合う間を残し、その後で信長が突き伏せる。
    const H = F.hanbeiU;
    if (B?.alive && H?.alive && !H.gone && !F.hanbeiMetT) {
      H.target = B; H.watch = null; H.moveTo = null; H.aiT = 0;
      this.fight(F.nobuG, 16);
      this.fight(F.hayaBoss, 16);
      if (near(H.pos, B.pos) <= 4.5) {
        F.hanbeiMetT = rt.t;
        say(rt, '黒田半平', '美作守殿、黒田半平じゃ。勝負！', 2.4);
      }
      rt.after(0.5, () => { if (!F.ending && !rt.over) this.hayashiFall(rt); });
      return;
    }
    if (B?.alive && F.hanbeiMetT && rt.t - F.hanbeiMetT < 3) {
      rt.after(0.5, () => { if (!F.ending && !rt.over) this.hayashiFall(rt); });
      return;
    }
    F.hayaDown = true; F.flagFallT = rt.t;
    say(rt, '足軽', '林の大旗が揺れておる！', 2.4);
    if (B?.alive) { B.invuln = false; B.inouNoWord = true; B.heroDmg = 0; rt.army.kill(B, N); }
    F.flagFalling = rt.t;
    rt.army.play('toki', { x: 16, z: -6 }, 1.3);
    this.moveG(F.nobuG, { x: -66, z: 120 }, 5);
    rt.after(4.6, () => rt.banner('織田信長、林美作守を討ち取る', ''));
    rt.after(7, () => say(rt, '足軽', '林勢、崩れます！', 2.4));
    rt.after(7.5, () => {
      for (const g of F.haya) if (live(g)) {
        g.routing = true; g.noRout = false; g.order = 'retreat'; g.dest = { x: g.anchor.x, z: -150 }; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true; g.speed = 3.4; g.aggro = 0; g.focus = null; g.morale = 10;
        // 敗走の下知で矢と槍を止め、残っていた追撃の相手も外す。
        g.fire = false; g.onArrive = null;
        for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; }
      }
      for (const g of [...F.van, F.sakuma, F.mates]) if (live(g)) this.moveG(g, { x: g.anchor.x, z: 12 }, 2.6);
    });
    rt.after(18, () => { if (!F.ending) say(rt, '足軽', '勝ったぞ！', 2); });
    rt.after(24, () => this.shibata(rt));
  },
  // 8:10 別の方向から法螺 → 柴田勢の前進。柴田は騎馬で前、周りに旗持ち・近習
  shibata(rt) {
    const F = rt.flags;
    if (F.shibaOn) return;
    F.shibaOn = true;
    sfx('horagai', 0.9); rt.after(1.4, () => sfx('horagai', 0.8));
    rt.after(3, () => say(rt, '弥助', '……柴田だ。', 2.2));
    try { playMusic('climax'); } catch (e) { /* 音の無い時も続ける */ }
    this.go(rt, 'shibata');
    for (const g of F.shibaLines) this.moveG(g, { x: g.lineX, z: -36 }, 2.2);
    this.moveG(F.shibaG, { x: 6, z: -58 }, 2.2);
    for (const g of [...F.van, F.sakuma, F.mates]) if (live(g)) this.moveG(g, { x: g.anchor.x, z: 18 }, 2.6);
    this.sayIf(rt, 'shibata', 26, '足軽', '権六だ！', 2);
    this.sayIf(rt, 'shibata', 34, '柴田勝家', '押せ！', 2);
    rt.after(36, () => {
      if (F.ph !== 'shibata') return;
      F.shibaPushT = rt.t;
      sfx('taiko', 1); rt.army.play('toki', { x: 0, z: -20 }, 1.5);
      for (const g of F.shibaLines) this.moveG(g, { x: g.lineX, z: 10 }, 2.8, 'attack');
      this.moveG(F.shibaG, { x: 6, z: -36 }, 2.4);
      for (const g of [...F.van, F.sakuma, F.mates]) this.fight(g, 14);
    });
    this.sayIf(rt, 'shibata', 56, '足軽', '下がるな！', 1.8);
    this.sayIf(rt, 'shibata', 66, '足軽', '左が押されておる！　右もじゃ！', 2.6);
    // 戦線が下がる（敵を倒しても列は押される）
    for (const t of [52, 62, 72, 82]) rt.after(t, () => {
      if (F.ph !== 'shibata') return;
      for (const g of [...F.van, F.sakuma, F.mates]) if (live(g)) {
        // 斬り合い中も相手を外して五m 下がり、着いた所で槍を揃え直す。
        // 基準点だけを動かすと、攻撃中の兵は元の戦線に残ってしまう。
        const c = g.center();
        this.retireG(g, { x: c.x, z: Math.min(ZS - 6, c.z + 5) }, 2.4, true);
        g.onArrive = (q) => { q.path = null; this.fight(q, 14); };
      }
    });
    // 11:00 柴田本人が前線近くで味方の侍武者（山田治部左衛門）を討つ
    rt.after(76, () => this.yamada(rt));
    // 11:40 味方が大きく下がる → 名塚砦まで退け
    rt.after(136, () => { if (F.ph === 'shibata') this.retreat(rt); });
  },
  yamada(rt) {
    const F = rt.flags, P = rt.player.u.pos;
    if (F.yamadaT || F.ph !== 'shibata') return;
    F.yamadaT = rt.t;
    // 主人公から三十五m ほど横（戦線の上）
    const side = P.x < 12 ? 1 : -1, at = { x: Math.max(-XW + 6, Math.min(XW - 6, P.x + side * 32)), z: Math.min(ZS - 6, P.z - 8) };
    F.yamadaG = allyGroup(rt, { name: '山田治部左衛門', anchor: at, facing: Math.PI, width: 1, aggro: 0, speed: 3, noAI: true, noRout: true, order: 'hold', fixed: true },
      [{ type: 'samurai', n: 1, o: { name: '山田治部左衛門', keep: true, invuln: true, horse: false } }]);
    F.yamadaU = F.yamadaG.units[0];
    F.allAlly.push(F.yamadaG);
    F.shibaG.speed = 4.2; F.shibaGo = { x: at.x, z: at.z - 3 };
  },
  // 退く（後ろから柴田勢）
  retreat(rt) {
    const F = rt.flags;
    if (F.retreatT) return;
    F.retreatT = rt.t;
    F.shibaGo = null;
    say(rt, '組頭', '退け！　名塚の砦まで退けい！', 2.6);
    this.go(rt, 'retreat');
    for (const g of [...F.van, F.sakuma, F.mates]) if (live(g)) this.retireG(g, { x: Math.max(20, Math.min(56, g.anchor.x + 20)), z: 116 + Math.random() * 8 }, 3.2, true);
    for (const g of F.shibaLines) if (live(g)) this.moveG(g, { x: g.lineX, z: 70 }, 2.2, 'attack');
    this.moveG(F.shibaG, { x: 6, z: 30 }, 2.2);
    this.sayIf(rt, 'retreat', 8, '弥助', '走れ！　振り向くな！', 2.2);
  },
  // 12:20 信長本人が前線近くへ。旗本が合流し、逃げていた兵が止まり、旗が立つ → 全軍が向き直る
  rally(rt) {
    const F = rt.flags, P = rt.player.u.pos;
    if (F.rallyT) return;
    F.rallyT = rt.t;
    this.go(rt, 'rally');
    // 向き直る間は追撃を止める。持ち場だけ替えると、古い相手と到着時の攻撃が残る。
    for (const g of F.shibaLines) if (live(g)) {
      this.retireG(g, g.center(), g.speed, true);
      g.inouRetiring = false; // 退場ではなく足止め。遠い翼も戦場から消さない。
    }
    const at = { x: Math.max(-XW + 6, P.x - 22), z: Math.min(ZS - 6, P.z + 6) };
    if (live(F.nobuG)) {
      // 西の奥から駆けつける（二十〜三十m）
      const c = F.nobuG.center();
      if (near(c, at) > 60) for (const u of F.nobuG.units) { u.pos.x = at.x - 30 + (u.pos.x - c.x); u.pos.z = at.z + 10 + (u.pos.z - c.z); u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
      this.moveG(F.nobuG, at, 5);
      sfx('gallop', 0.9);
    }
    say(rt, '足軽', '殿だ！', 1.8);
    // 別の隊が合流する（新しい組が西から来て並ぶ）
    F.mori = allyGroup(rt, { name: '森可成の手', fullStrength: true, anchor: { x: -40, z: 128 }, facing: Math.PI, width: 6, aggro: 0, speed: 3.6, noAI: true, noRout: true, order: 'hold', formation: 'line', dmgMult: 0.6, defMult: 1.2, fixed: true },
      [{ type: 'ashigaru', n: N(9), o: { flagScale: 1 } }, { type: 'samurai', n: 2 }]);
    F.allAlly.push(F.mori);
    this.moveG(F.mori, { x: 4, z: 112 }, 3.6);
    // 旗本が遅れても、遠い信長の号令だけで反撃を始めない。
    const turn = () => {
      if (rt.over || F.ending || F.ph !== 'rally') return;
      const lord = rt.G.lord ? rt.player.u : F.nobuU;
      if (!lord?.alive || lord.gone || near(lord.pos, rt.player.u.pos) > 30) {
        rt.after(0.5, turn);
        return;
      }
      say(rt, rt.G.lord ? '自分' : '織田信長', '者ども、返せ！　敵は主に槍を向ける者ぞ！', 3.2);
      sfx('taiko', 1); rt.army.play('toki', lord.pos, 1.6);
      rt.after(6, () => { if (!rt.over && !F.ending && F.ph === 'rally') this.push(rt); });
    };
    rt.after(6, turn);
  },
  // 12:50 柴田勢を押し返せ：左右の味方が一斉に前進、主人公もその中
  push(rt) {
    const F = rt.flags;
    if (F.pushT) return;
    F.pushT = rt.t;
    this.go(rt, 'push');
    say(rt, '組頭', '押し返せ！　皆で出るぞ！', 2.2);
    for (const g of [...F.van, F.sakuma, F.mates, F.mori]) if (live(g)) { g.dmgMult = 0.75; this.moveG(g, { x: g.anchor.x, z: 70 }, 3, 'attack'); }
    if (live(F.nobuG)) this.moveG(F.nobuG, { x: F.nobuG.center().x + 4, z: 96 }, 2.6);
    for (const g of F.shibaLines) if (live(g)) { this.fight(g, 14); g.dmgMult = 0.3; g.morale = 50; }
    F.shibaN2 = aliveIn(F.shibaLines);
    rt.after(70, () => this.shibaBack(rt));
  },
  // 13:30 柴田勢が崩れ始め、柴田が手負うて退く（旗を守り、殿を置き、整って退く）
  shibaBack(rt) {
    const F = rt.flags;
    if (F.shibaBackT || F.ph !== 'push') return;
    F.shibaBackT = rt.t;
    say(rt, '近習', '権六様！', 1.8);
    if (F.shibaU) F.shibaU.hp = Math.min(F.shibaU.hp, F.shibaU.maxHp * 0.5);
    rt.after(2, () => say(rt, '柴田勝家', '退く！　旗を守れ。殿を置け！', 2.8));
    rt.after(3, () => {
      const rear = F.shibaLines.filter(live);
      rear.forEach((g, i) => {
        if (i === 0) { g.order = 'hold'; g.aggro = 10; g.dmgMult = 0.3; rt.after(16, () => this.retireG(g, { x: -60, z: -130 }, 2.6)); return; }   // 殿
        this.retireG(g, { x: -40 + i * 8, z: -130 }, 2.4);
      });
      this.retireG(F.shibaG, { x: -30, z: -120 }, 2);
    });
    rt.after(22, () => this.stopChase(rt));
  },
  // 14:10 追撃停止。BGM が落ちる
  stopChase(rt) {
    const F = rt.flags;
    if (F.stopT) return;
    F.stopT = rt.t;
    say(rt, '組頭', '追うな！　ここまでじゃ。', 2.6);
    try { stopMusic(5); } catch (e) { /* 音の無い時も続ける */ }
    for (const g of [...F.van, F.sakuma, F.mates, F.mori, F.nobuG]) if (live(g)) {
      // 前進の到着命令を残すと、追撃停止後も古い攻撃の下知が残り、持ち場を整えられない。
      // 相手を消すだけでは次の判断で加勢し直す。余韻の間は敵探しも止める。
      g.noAI = true; g.peaceful = true; g.retreatOnly = true; g.arriveNoncombat = true;
      g.order = 'hold'; g.aggro = 0; g.fire = false; g.anchor = { ...g.center() };
      g.onArrive = null; g.dest = null; g.path = null; g.focus = null;
      for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; }
    }
    // 戦の跡を歩く本人だけを置き去りにしない。声を掛ける仲間と組頭が実際に歩いて集まる。
    const P = rt.player.u.pos;
    for (const [g, dx] of [[F.mates, -4], [F.sakuma, 4]]) if (live(g)) {
      this.retireG(g, { x: Math.max(-XW + 6, Math.min(XW - 6, P.x + dx)), z: Math.max(ZN + 6, Math.min(ZS - 6, P.z + 4)) }, 3.4);
    }
    // 退く旗本も攻撃を止める。到着時に古い攻撃命令へ戻さない。
    for (const g of F.shiba) if (live(g)) {
      g.aggro = 0; g.focus = null; g.fire = false;
      g.onArrive = (q) => { q.order = 'hold'; q.path = null; q.aggro = 0; };
      for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.moveTo = null; }
    }
    F.ending = true;
    rt.objDone('main'); rt.tracker.main = true;
    rt.player.u.invuln = true;
    if (!rt.over) rt._closing = { at: rt.t + 70, info: { scriptedEnd: true }, delay: 5 };
    this.go(rt, 'after');
    // 新六が生きていれば座り込んでいる
    if (F.shinrokuU?.alive && live(F.shinG)) this.retireG(F.shinG, { x: F.shinrokuU.pos.x, z: F.shinrokuU.pos.z }, 1);
    rt.after(10, () => { if (F.shinrokuU?.alive && !F.shinMet) say(rt, '弥助', '新六は……あそこじゃ。生きておる。', 2.6); });
    rt.after(40, () => this.coda(rt));
  },
  // 14:50 遠くに退く柴田。主人公は黙って見る → 15:00 暗転と結果
  coda(rt) {
    const F = rt.flags;
    if (F.codaT) return;
    F.codaT = rt.t;
    // 柴田は退いた先から戻らず、同じ街道の奥へ去る。
    if (live(F.shibaG)) { this.retireG(F.shibaG, { x: -50, z: -140 }, 1.4); }
    F.lead = F.sakumaU?.alive ? F.sakumaU : F.lead;
    say(rt, '弥助', '柴田権六……あれで負けたのか。', 3);
    rt.after(3.6, () => say(rt, '源太', '恐ろしい男だ。', 2.4));
    rt.after(8, () => say(rt, '組頭', 'よく生きて戻ったな。', 2.6));
    rt.after(11, () => {
      const kills = rt.stats?.kills || 0, kept = F.lineT > 0 ? F.inLine / F.lineT : 1;
      // 戦功：撃破（共通の数）・味方救援・隊列維持・生還。札は出さない（結果の画面だけ）
      rt.award((t) => t.side.push('稲生の初陣から生きて戻った'), '');
      if (F.helped) rt.award((t) => { t.c.rescue = (t.c.rescue || 0) + 1; }, '');
      F.result = { kills, help: F.helped ? 1 : 0, line: kept > 0.6 ? '良' : kept > 0.35 ? '可' : '乱れ', alive: true };
      if (kept > 0.6) rt.award((t) => t.side.push('隊列を崩さずについて行った'), '');
      // 同じ隊の者のその後（戦間で使う）
      F.squad = COMRADES.map((name) => {
        const u = name === '新六' ? F.shinrokuU : F.mates.units.find((v) => v.name === name);
        // 遠くへ離脱すると alive は外れる。命を残して退場した新六を討死にしない。
        const survived = u?.hp > 0 && (u.alive || u.gone);
        return [name, !survived ? '討死' : name === '新六' && F.shinHurtT ? '負傷' : '生存'];
      });
      F.squad.push(['隊長', F.capU?.alive && F.capU.hp > 0 ? '生存' : '討死']);
      // 戦の跡を歩く任務も締める。共通の待機は予備なので、余韻が済んだ今は解除する。
      rt.objDone('main');
      rt._closing = null;
      rt._closingDone = true;
      rt.finish({ scriptedEnd: true }, 4);
    });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (k?.isPlayer && v.team !== rt.player.u.team) {
      F.pk = (F.pk || 0) + 1;
      // 2:40 初めて敵を倒す：祝わない。隊長「前を見ろ！」
      if (F.pk === 1 && !F.capDead) rt.after(0.6, () => say(rt, '隊長', '前を見ろ！', 1.8));
    }
  },

  update(rt, dt) {
    const F = rt.flags, P = rt.player.u;
    // 戦う者の範囲（退く者は除く）
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.group?.routing || u.fleeing || u.group?.order === 'retreat' || u.group?.inouRetiring) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 林の大旗が倒れる（竿の根元を軸に一秒半）
    if (F.flagFalling && F.hayaFlag) { const k = Math.min(1, (rt.t - F.flagFalling) / 1.6); F.hayaFlag.rotation.x = k * k * 1.45; if (k >= 1) F.flagFalling = 0; }
    // 柴田の旗は柴田と一緒に動く。信長の旗も
    if (F.shibaFlag) {
      // 戦場を去った旗本の大旗だけを、最後の位置に残さない。
      F.shibaFlag.visible = !!F.shibaU?.alive && !F.shibaU.gone;
      if (F.shibaFlag.visible) F.shibaFlag.position.set(F.shibaU.pos.x + 1.6, F.shibaU.pos.y, F.shibaU.pos.z - 1.2);
    }
    if (F.nobuFlag) {
      // 信長の大旗も本人が戦場を去った後に残さない。大将として遊ぶ時は本人に付ける。
      const lord = rt.G.lord ? P : F.nobuU;
      F.nobuFlag.visible = !!lord?.alive && !lord.gone;
      if (F.nobuFlag.visible) F.nobuFlag.position.set(lord.pos.x + 1.6, lord.pos.y, lord.pos.z + 1.2);
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const L = F.lead?.alive && !F.lead.gone ? F.lead : null;
    if (!F.shinHurtT && live(F.shinG) && live(F.mates)) {
      const c = F.mates.center(), to = { x: c.x - 3, z: c.z + 1 };
      if (['scout', 'hayashi'].includes(F.ph) && F.mates.order === 'attack') { if (F.shinG.order !== 'attack') this.fight(F.shinG, 10); }
      else if (near(F.shinrokuU.pos, to) > 3) { F.shinG.order = 'move'; F.shinG.dest = to; F.shinG.speed = 3; F.shinG.onArrive = (q) => { q.order = 'hold'; }; }
    }
    // 隊列：隊長（組頭）のそばにいた割合（結果の「隊列維持」）
    if (L && !F.ending && ['march', 'van', 'hayashi', 'shibata', 'push'].includes(F.ph)) { F.lineT += 0.25; if (near(L.pos, P.pos) < 14) F.inLine += 0.25; }
    // 遅れると「遅れるな！」、前へ出すぎると「戻れ！」
    if (L && !F.ending && (F.nagT = (F.nagT || 0) - 0.25) <= 0) {
      const d = near(L.pos, P.pos);
      if (F.ph === 'march' && d > 16) { F.nagT = 8; say(rt, F.capDead ? '組頭' : '隊長', '遅れるな！', 1.6); }
      else if ((F.ph === 'van' || F.ph === 'scout' && F.scoutBack) && P.pos.z < L.pos.z - 18) { F.nagT = 8; say(rt, '隊長', '戻れ！　列に戻れ！', 1.8); }
    }
    if (F.ph === 'march' && rt.t >= 115 && L && near(L.pos, P.pos) < 16) this.scout(rt);
    // 物見が二人に減るか七十秒で退く
    if (F.ph === 'scout' && !F.scoutBack && F.scoutG && (aliveIn([F.scoutG]) <= 2 || rt.t - F.phT > 70)) this.scoutBack(rt);
    // 佐久間隊へ合流
    if (F.ph === 'join' && F.sakumaU?.alive && near(F.sakumaU.pos, P.pos) < 9) this.joined(rt);
    // 遅れて着いても進める。待ち時間だけで前衛への合流を済ませない。
    if (F.ph === 'van' && rt.t - F.phT >= 58 && L && near(L.pos, P.pos) < 14) this.hayashi(rt);
    // 新六を助ける（下がる途中の新六のそばへ寄る）
    if (F.shinHurtT && rt.t - F.shinHurtT > 3 && !F.shinMet && F.shinrokuU?.alive && near(F.shinrokuU.pos, P.pos) < 3.5) {
      F.shinMet = true;
      if (!F.ending && rt.t - F.shinHurtT > 3 && rt.t - F.shinHurtT < 60) { F.helped = true; say(rt, '新六', 'すまぬ……助かった。', 2.4); }
      else if (F.ending) say(rt, '新六', '……生きておったか。お主も。', 2.8);
    }
    // 林勢を押し合いで六割まで減らしても、隊長の討死は待たずに進む
    if (F.ph === 'hayashi' && !F.capDead && F.contactT && rt.t - F.contactT > 75 && aliveIn(F.haya) <= F.hayaN * 0.45) this.capDown(rt);
    // 柴田は主人公から五十m より近づかない（軍勢の向こう側にいる人）。山田を討つ時だけ三十m まで
    const S = F.shibaU;
    if (S?.alive && F.shibaG && F.shibaOn && !F.shibaBackT && !F.codaT) {
      const minD = F.shibaGo ? 28 : 50, d = near(S.pos, P.pos);
      if (F.shibaGo) {
        const Y = F.yamadaU;
        F.shibaG.order = 'move'; F.shibaG.dest = F.shibaGo;
        if (Y?.alive && near(S.pos, Y.pos) < 4) {
          Y.invuln = false; rt.army.play('eshout', Y.pos, 1.4); rt.army.kill(Y, S);
          rt.after(0.6, () => say(rt, '足軽', '山田殿が！', 1.8));
          F.shibaGo = null; this.moveG(F.shibaG, { x: S.pos.x, z: S.pos.z - 26 }, 2.6);
        }
      }
      if (d < minD) { const k = (minD + 4) / Math.max(1, d); F.shibaG.order = 'move'; F.shibaG.dest = { x: Math.max(-XW + 4, Math.min(XW - 4, P.pos.x + (S.pos.x - P.pos.x) * k)), z: Math.max(ZN + 4, P.pos.z + (S.pos.z - P.pos.z) * k) }; }
    }
    // 押し返し：柴田勢が半ば崩れたら退く
    if (F.ph === 'push' && F.shibaN2 && aliveIn(F.shibaLines) <= F.shibaN2 * 0.55) this.shibaBack(rt);
    // 名塚砦に着いたら信長が来る
    if (F.ph === 'retreat' && near(P.pos, NAZUKA_PT) < 14 && rt.t - F.retreatT > 6) this.rally(rt);
    // 敗走する敵と離脱する新六だけが去る。隊長・組頭らの後退は戦場内の合流なので、遅れた本人から離れても消さない。
    for (const g of F.groups) if (g.routing || g.order === 'retreat' || g.inouRetiring) for (const u of g.units) if ((u.team !== P.team || g === F.shinG) && u.alive && !u.gone && near(u.pos, P.pos) > 70) rt.army.despawn(u);
    // 戦の段だけ流れ矢
    if (['hayashi', 'shibata', 'push'].includes(F.ph)) { const s0 = F.stage; F.stage = 1; strayArrows(rt, 0.25); F.stage = s0; }
    // 立っている主人公の所へ、近い敵が二人まで来る（押し合いの段だけ）
    if ((F.foeT = (F.foeT || 0) - 0.25) <= 0 && ['hayashi', 'shibata', 'push'].includes(F.ph)) {
      F.foeT = 5;
      const list = F.ph === 'hayashi' ? F.haya : F.shibaLines;
      if (!rt.army.nearestEnemy(P, 9, inouEnemyAlive)) {
        const cand = [];
        for (const g of list) if (live(g) && !g.routing && g.order !== 'hold') for (const u of g.units) if (inouEnemyAlive(u) && !u.mounted && !u.invuln) cand.push([near(u.pos, P.pos), u]);
        cand.sort((a, b) => a[0] - b[0]);
        for (const [d, u] of cand.slice(0, 2)) if (d < 50) { u.target = P; u.watch = null; u.moveTo = null; }
      }
    }
    // 乱戦の音
    if ((F.dinT -= 0.25) <= 0) {
      F.dinT = 1.4 + Math.random() * 1.2;
      let best = null, bd = 80;
      for (const g of F.groups) { if (!live(g) || g.routing || g.order === 'retreat') continue; const c = g.center(), d = near(c, P.pos); if (d < bd && d > 6 && g.units.some((u) => u.alive && u.target)) { bd = d; best = c; } }
      if (best) { const k = (F.dinK = ((F.dinK || 0) + 1) % 4); rt.army.play(k === 0 ? 'tramp' : k === 1 ? 'shaftContact' : k === 2 ? 'eshout' : 'clash', best, Math.min(1.4, 0.7 + 30 / (bd + 20))); }
    }
  },

  // bot：近い敵を突き、いなければピンへ。退く段は敵に構わずピンへ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    const fightPh = ['scout', 'hayashi', 'shibata', 'push'].includes(F.ph);
    if (fightPh) {
      // 案内と同じ備を相手にする。まだ出陣していない柴田勢へ横道にそれない。
      const e = this.missionSignTarget(b, 9);
      if (e) {
        const d = near(e.pos, u.pos);
        if (p.lock && p.lock !== e) inp.e.add('KeyQ');
        p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
        if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
        patientStrike(p, inp, e, d, true);
        return;
      }
    }
    inp.guardHold = false;
    const T = this.pinTarget(b);
    if (T) goTo(p, inp, T.pos.x, T.pos.z + (T.enemy ? 0 : 2.5), 2.2);
  },
};
ino.history = BASE.history;
ino.depth = BASE.depth;
ino.date = BASE.date;
ino.timeslip = BASE.timeslip;
export { ino as inou_1109 };
