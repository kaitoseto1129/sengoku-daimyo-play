// 名のある将の供回り（kaito 11/2 Q・全戦）
//   名のある将（武将・名あり）は一人でいない：同じ隊の侍を供回りにし、足りなければ見えない所で侍を足して将を囲ませる。
//   敵の将は倒すのが大変（命を二倍）。敵の将が襲われたら、近くの備が助けに来る（突っ立たない）。
//   供回りの動き（将を囲み、将へ寄る敵を迎える）は officer.js の officerThink と guardSpot。
import { FACTION } from './units_data.js';
import { guardSpot } from './officer.js';

const CAP = 242;          // 本物の兵の上限（250）に少し余裕を残す
const SPAWN_FAR = 42;     // 遊び手からこれより遠い時だけ足す（目の前に湧かせない）

const isLord = (u) => u && u.alive && !u.gone && !u.fleeing && u.name && u.type === 'busho' &&
  !u.isPlayer && !u.isSub && !u.isTomo && !u.kerai && !u.civ && !u.isStruct && !u.noRetinue;

function headOf(g) {
  if (isLord(g.leader) && g.leader.group === g) return g.leader;
  for (const u of g.units) if (isLord(u)) return u;
  return null;
}

const canGuard = (v, small) => v.alive && !v.gone && !v.fleeing && !v.name && !v.isStandard && !v.stdHeld && !v.banner && !v.isUma &&
  !v.woundOut && !v.rearWound && v.type !== 'gun' && v.type !== 'bow' && v.type !== 'porter' && v.type !== 'dummy' &&
  (v.type === 'samurai' || v.type === 'cavalry' || small && v.type === 'ashigaru');

export function lordRetinueTick(rt, dt) {
  const def = rt.def;
  if (def.dojo || def.town || def.noRetinue || rt.over || !rt.army) return;
  if ((rt._retT = (rt._retT || 0) - dt) > 0) return;
  rt._retT = 0.5;
  const A = rt.army, P = rt.player.u, t = rt.t;
  let alive = A.pendingSpawn || 0;
  for (const u of A.units) {
    if (!u.alive) continue;
    alive++;
    // 敵の名のある将は倒すのが大変（一度だけ。戦の定義が決めた命の割合は保つ）
    if (!u._retHp && u.team !== P.team && isLord(u)) { u._retHp = true; u.maxHp *= 1.5; u.hp *= 1.5; }
    // 敵の将の家臣（供回り）も豪の者：一太刀二太刀では倒れない（十八の3・BZ）
    if (!u._retGuardHp && u.team !== P.team && u.officerGuard && isLord(u.officerGuard)) { u._retGuardHp = true; u.maxHp *= 1.2; u.hp *= 1.2; }
  }
  // 助けに呼んだ備の狙いを、時が過ぎたら解く
  for (const g of A.groups) if (g._retFocus && g._retFocus.until < t) { if (g.focus === g._retFocus.u) g.focus = null; g._retFocus = null; }
  const lords = rt._retLords || (rt._retLords = []);
  lords.length = 0;
  for (const g of A.groups) {
    if (g.isPlayerSquad || g.civ || g.routed || g.noRetinue) continue;
    const L = headOf(g);
    if (L) { L._retD = Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z); lords.push(L); }
  }
  lords.sort((a, b) => a._retD - b._retD);
  for (const L of lords) {
    const g = L.group, foe = L.team !== P.team;
    const want = def.retinue ?? (L.isLord || L.isTaisho || rt.taisho?.b?.u === L ? 10 : 8);
    const used = [];
    let have = 0;
    for (const v of g.units) if (v.officerGuard === L && v.alive && !v.fleeing && !v.isStandard) { have++; used.push(v.officerGuardSlot); }
    const slot = () => { let s = 0; while (used.includes(s)) s++; used.push(s); return s; };
    if (have < want) {
      // 同じ隊の侍を、近い順に供回りへ。足軽は旗本・本陣の隊なら皆、槍の列で戦う隊なら列を痩せさせないよう四人まで
      const retinueGroup = /(本陣|旗本|馬廻|近習|小姓)/.test(g.name || '') || g.units.length <= 8;
      let ashi = 0;
      for (const v of g.units) if (v.officerGuard === L && v.type === 'ashigaru') ashi++;
      const cand = [];
      for (const v of g.units) if (v !== L && canGuard(v, true) && (!v.officerGuard || !v.officerGuard.alive) &&
        Math.hypot(v.pos.x - L.pos.x, v.pos.z - L.pos.z) < 30) cand.push(v);
      cand.sort((a, b) => (a.type === 'ashigaru') - (b.type === 'ashigaru') ||
        Math.hypot(a.pos.x - L.pos.x, a.pos.z - L.pos.z) - Math.hypot(b.pos.x - L.pos.x, b.pos.z - L.pos.z));
      for (const v of cand) {
        if (have >= want) break;
        if (v.type === 'ashigaru' && !retinueGroup && ashi >= 4) continue;
        if (v.type === 'ashigaru') ashi++;
        v.officerGuard = L; v.officerGuardSlot = slot(); v.aiT = 0; have++;
      }
    }
    // まだ足りなければ、見えない所で侍を足す（一度に二人まで・近い将から・本物の兵の上限を守る）
    //   遠くて軽い兵へ戻している備（butai の遠い側）には足さない。足すと次の一秒で軽い兵へ戻され、また足す…を毎秒くり返し、
    //   稲葉山で十分に四千人の兵を作っては捨てて記憶が伸び続けた（11/8 docs/crash_1108.md）
    const shrinking = g.butai && !g.butai.noSwitch && g.butai.wantReal == null && !g.butai._isNear();
    if (have < want && alive < CAP && !shrinking && (t < 5 || L._retD > SPAWN_FAR) && !L.inside && !L.climb && !L.perch) {
      const n = Math.min(2, want - have, CAP - alive);
      const fac = FACTION[g.faction] || {};
      const armor = fac.busho ?? fac.armor;
      // 一人の座（width 1 の本陣）へ足す時は、将を要にした円陣にする。一列のままだと、遊び手から遠く頭の回らない間に
      //   供回りが将の後ろへ一列に下がり、陣幕に詰まって十人が一点に重なる（設楽原の信長の本陣 11/11）
      if (g.width === 1 && g.leader === L && g.formation !== 'ring' && !g.cav) g.formation = 'ring';
      const made = A.spawn(g, [{ type: 'samurai', n, o: armor != null ? { armor } : {} }]) || [];
      for (const v of made) {
        v.officerGuard = L; v.officerGuardSlot = slot(); v.aiT = 0;
        guardPlace(rt, g, L, v);
        alive++;
      }
      have += made.length;
    }
    if (foe) rescue(rt, L, g);
  }
}

// 将の周りの持ち場へ置く。壁の向こう・段の違う所なら、将のすぐ後ろへ
const PL = { x: 0, z: 0 };
function guardPlace(rt, g, L, v) {
  const f = g.forward(), p = guardSpot(g, L, v, PL);
  const y = rt.world.heightAt(p.x, p.z);
  if (rt.army.wallBetween(L.pos, -1, p) || Math.abs(y - L.pos.y) > 1.5) {
    // 将のすぐ後ろへ二列で並べる。一点に置くと、陣幕の内の本陣で供回り十人が重なったまま立つ（設楽原の信長の本陣 11/11）
    const s = v.officerGuardSlot || 0, col = (s % 5) - 2, back = 1.6 + Math.floor(s / 5) * 0.9;
    const ok = (bk, sd) => {
      p.x = L.pos.x - f.x * bk + f.z * sd; p.z = L.pos.z - f.z * bk - f.x * sd;
      return !rt.army.wallBetween(L.pos, -1, p) && Math.abs(rt.world.heightAt(p.x, p.z) - L.pos.y) <= 1.5;
    };
    if (!ok(back, col * 0.9) && !ok(-back, col * 0.9) && !ok(0, (col || 1) * 0.9)) {
      const a = s * 2.4;
      p.x = L.pos.x + Math.cos(a) * 0.7; p.z = L.pos.z + Math.sin(a) * 0.7;
    }
  }
  v.pos.x = p.x; v.pos.z = p.z; v.pos.y = rt.world.heightAt(p.x, p.z);
  v.heading = L.heading; v.mesh.position.copy(v.pos); v.mesh.rotation.y = v.heading;
}

// 敵の将が襲われた（敵が八歩内）：近くの同じ方の備を二つまで、その敵へ向かわせる（十八秒）
function rescue(rt, L, g) {
  if ((L._retCallT ?? -99) + 15 > rt.t) return;
  const A = rt.army;
  const foe = A.nearestEnemy(L, 8, (o) => !o.fleeing && !o.isStruct);
  if (!foe) return;
  L._retCallT = rt.t;
  const near = [];
  for (const h of A.groups) {
    if (h === g || h.team !== L.team || h.routed || h.isPlayerSquad || h.civ || h.hidden || h.ambush || h.stay || h.noRescue || h.order === 'retreat' || h.count < 3 || (h.focus && h.focus.alive)) continue;
    const c = h.center(), d = Math.hypot(c.x - L.pos.x, c.z - L.pos.z);
    if (d < 70) near.push([d, h]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (const [, h] of near.slice(0, 2)) { h.focus = foe; h._retFocus = { u: foe, until: rt.t + 18 }; }
  if (near.length) A.play('eshout', L.pos, 1.1);
}
