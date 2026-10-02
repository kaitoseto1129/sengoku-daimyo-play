// ======================================================================
// 試しの戦（隠しの筋書き system_mvp）：67 章 野戦の MVP（docs/battle-system-plan.md 第1段・3-2）
// 平らな野。味方 備A・備B・備C（各300、第一線の左中右）・後詰300・本陣100。敵も同じ形で 120m 向かいに。
// 自分は本陣の脇に立つだけ（討たれない）。window.__mvpKillAt（既定 50 秒。0 で討たない）で備A の侍大将を討つ（試しの時だけ）。
// window.__mvpFuku = true で備A に副将（前田利家）を付ける（束2：継承の確かめ）。既定は副将なし（後退→潰走の確かめ）
// 束1：決まった下知だけ（10 秒で第一線が前へ、両軍は 90 秒までにぶつかる）。頭（士気の連鎖・後詰・本陣危機）は束4・5
// 確かめ：NORENDER=1 node prototype/tools/snap.mjs - prototype/tools/mvp/yasen.js
// 向き：南（+z）に味方（北を向く）、北（-z）に敵（南を向く）
// ======================================================================
import { KIT } from './b_nagashinojo.js';
import { butaiTick, lightClash } from './butai.js';
import { makeSonae, sonaeTick, sonaeById, sonaeTaishoDown } from './sonae.js';
import { makeGunsei, gunseiTick } from './gunsei.js';
import { logEvent, meritOf } from './senkyo.js';

const FRONT_Z = 60;      // 第一線（両軍とも中から 60m。向かい合って 120m）
const GOTSUME_Z = 95;
const HONJIN_Z = 125;
const SLOT_X = { left: -45, center: 0, right: 45 };
// 兵種の割合（備は槍・侍・鉄砲・弓・騎馬が混ざる）
const MIX_FRONT = { ashigaru: 0.55, samurai: 0.15, gun: 0.15, bow: 0.1, cavalry: 0.05 };
const MIX_HONJIN = { ashigaru: 0.4, samurai: 0.4, cavalry: 0.2 };

// 両軍の 5 つの備（味方は札として 5 つまで。0-1）
function layout(team) {
  const s = team === 0 ? 1 : -1;          // 味方は +z、敵は -z
  const facing = team === 0 ? Math.PI : 0;
  const side = (slot) => (team === 0 ? SLOT_X[slot] : -SLOT_X[slot]);   // 左右は自分の向きで見る
  const pre = team === 0 ? '' : '敵';
  const T = team === 0
    ? { A: '佐久間信盛', B: '柴田勝家', C: '丹羽長秀', G: '池田恒興', H: '織田信長' }
    : { A: '山県昌景', B: '内藤昌豊', C: '馬場信春', G: '小山田信茂', H: '武田勝頼' };
  return [
    { id: pre + 'A', name: `${pre}備A`, line: 1, slot: 'left', taisho: T.A, fuku: team === 0 && window.__mvpFuku ? '前田利家' : null, nominal: 300, mix: MIX_FRONT, at: { x: side('left'), z: s * FRONT_Z } },
    { id: pre + 'B', name: `${pre}備B`, line: 1, slot: 'center', taisho: T.B, nominal: 300, mix: MIX_FRONT, at: { x: side('center'), z: s * FRONT_Z } },
    { id: pre + 'C', name: `${pre}備C`, line: 1, slot: 'right', taisho: T.C, nominal: 300, mix: MIX_FRONT, at: { x: side('right'), z: s * FRONT_Z } },
    { id: pre + '後詰', name: `${pre}後詰`, line: 'gotsume', slot: 'center', taisho: T.G, nominal: 300, mix: MIX_FRONT, at: { x: 0, z: s * GOTSUME_Z } },
    { id: pre + '本陣', name: `${pre}本陣`, line: 'honjin', slot: 'center', taisho: T.H, nominal: 100, mix: MIX_HONJIN, at: { x: 0, z: s * HONJIN_Z }, major: true },
  ].map((o) => ({ ...o, team, facing, faction: team === 0 ? 'oda' : 'takeda', flag: team === 0 ? 'oda' : 'takeda', armor: KIT.ARMOR[team === 0 ? 'oda' : 'takeda'] }));
}

const mvp_yasen = {
  spawn: { x: 14, z: HONJIN_Z + 4, heading: Math.PI },
  noReserve: true,
  noWake: true,        // 近くの軽い兵は KIT の wake で替えない（備の本物は butai.js が配る。250 の枠を守る）
  noTaishoRaid: true,
  noDespair: true,
  world: {
    seed: 6701,
    time: 'after',
    paths: [],
    height: (x, z) => 0.25 * Math.sin(x * 0.03) * Math.cos(z * 0.025),
    clear: (x, z) => Math.abs(x) < 150 && Math.abs(z) < 160,
    trees: 120,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) < 150 && Math.abs(z) < 160 ? 0 : 1),
    fleeOut: (x, z, team) => (team === 1 ? z < -170 : z > 170),
  },
  sides: { a: { name: '織田勢', mon: 'oda' }, b: { name: '武田勢', mon: 'takeda' } },
  // 両軍の総大将は本陣の備の侍大将（def：taisho.js は旗本を出さず、討っても即の勝ち負けにしない。総大将の扱いは束5 の gunsei.js）
  taisho: { a: { name: '織田信長', def: true }, b: { name: '武田勝頼', def: true } },
  date: () => '試しの野　備の動き',

  setup(rt) {
    const F = rt.flags;
    F.ending = false;
    rt.player.u.invuln = true;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    for (const team of [0, 1]) for (const o of layout(team)) makeSonae(rt, o);
    for (const team of [0, 1]) makeGunsei(rt, { team });
    // 本陣の陣幕（見た目だけ）
    KIT.honjin(rt, 0, HONJIN_Z + 6, { mon: 'oda', people: false, fire: false });
    KIT.honjin(rt, 0, -HONJIN_Z - 6, { mon: 'takeda', people: false, fire: false });
    F.killAt = window.__mvpKillAt ?? 50;
    F.advanced = false; F.attacked = false; F.killed = false;
    rt.obj('mvp', '試しの野：備の動きを見届けよ', 'main');
    rt.say('使番', '試しの野でござる。本陣の脇で、備の動きを見ておられよ', 4);
    rt.after(10, () => this.advance(rt));
  },

  // 第一線が前へ（両軍とも中ほどまで）。決まった下知だけ（頭は束4・5）
  advance(rt) {
    const F = rt.flags;
    if (F.advanced) return;
    F.advanced = true;
    for (const S of rt.sonae) if (S.line === 1) {
      const toZ = S.team === 0 ? 4 : -4;
      S.order({ id: 'charge', to: { x: S.b.pos.x, z: toZ } });
    }
    rt.banner('第一線、前へ', '両軍の備が押し出す');
  },

  update(rt, dt) {
    const F = rt.flags;
    butaiTick(rt, dt);
    sonaeTick(rt, dt);
    gunseiTick(rt, dt);
    if (F.ending) return;
    // 近づいた第一線は打ち合う（届いた所で「かかれ」）
    if (F.advanced && !F.attacked && rt.t > 45) {
      F.attacked = true;
      for (const S of rt.sonae) if (S.line === 1) S.order({ id: 'attack' });
    }
    // 遠い（軽い）備どうしは数で押し合う
    const L = rt.sonae;
    for (const a of L) {
      if (a.team !== 0 || a.state === '敗走') continue;
      for (const e of L) {
        if (e.team !== 1 || e.state === '敗走') continue;
        if (Math.hypot(a.b.pos.x - e.b.pos.x, a.b.pos.z - e.b.pos.z) < 30) lightClash(a.b, e.b, dt, 1);
      }
    }
    // 試し：決まった時に備A の侍大将を討つ
    if (!F.killed && F.killAt > 0 && rt.t >= F.killAt) {
      F.killed = true;
      const S = sonaeById(rt, 'A');
      const u = S && S.b.taishoU;
      if (u && u.alive) { rt.army.kill(u, null); logEvent(rt, 'mvpKill', { team: 0, who: 'A' }); }
      else if (S && !u) { sonaeTaishoDown(S, null); logEvent(rt, 'mvpKill', { team: 0, who: 'A' }); }   // 軽い備（本物の将がいない）
    }
    rt.objProgress('mvp', `${Math.round(rt.t)}秒`);
    if (rt.t > 330) this.end(rt);
  },

  end(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('mvp');
    rt.banner('試しの終わり', '備の動きを見届けた');
    meritOf(rt);   // 束6：64 章の戦功を logEvent の記録から rt.award へ
    rt.finish({}, 4);
  },
};

export { mvp_yasen };
