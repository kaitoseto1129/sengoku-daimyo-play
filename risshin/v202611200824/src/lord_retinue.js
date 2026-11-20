// 名のある将の供回り（kaito 11/2 Q・全戦）
//   名のある将（武将・名あり）は一人でいない：同じ隊の侍を供回りにし、足りなければ見えない所で侍を足して将を囲ませる。
//   敵の将は倒すのが大変（命を二倍）。敵の将が襲われたら、近くの備が助けに来る（突っ立たない）。
//   供回りの動き（将を囲み、将へ寄る敵を迎える）は officer.js の officerThink と guardSpot。
import { FACTION } from './units_data.js';
import { guardSpot } from './officer.js';

const CAP = 242;          // 本物の兵の上限（250）に少し余裕を残す
const SPAWN_FAR = 42;     // 遊び手からこれより遠い時だけ足す（目の前に湧かせない）
// 11/16 K341⑤ iMac n-kiba：本物の兵が上限を超えた戦（設楽原 286 人など）では、後ろの本陣の将（信長・家康・勝頼）が一人きりで立っていた。
//   一人きり（供回り三人未満）の将へ遊び手が LONE_NEAR まで近づいたら、上限を超えても EXTRA まで供回りを足す。遊び手が LONE_DROP より離れたら、足した者を消して枠を返す
const LONE_NEAR = 170, LONE_DROP = 260, EXTRA = 12;

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
  let alive = A.pendingSpawn || 0, extra = 0;
  for (const u of A.units) {
    if (!u.alive) continue;
    alive++;
    if (u._retExtra) extra++;
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
    // 一人きりの将：遠ざかったら足した者を消す。近づいたら上限を超えても足す
    if (L._retD > LONE_DROP && L._retLone) { L._retLone = false; for (const v of g.units) if (v._retExtra && v.alive && !v.gone && !v.target) { A.despawn(v); extra--; alive--; have--; } }
    const over = alive >= CAP && (have < 3 || L._retLone) && L._retD < LONE_NEAR && extra < EXTRA && !L.invisible && !g.hidden && !(typeof window !== 'undefined' && window.__apx && window.__apx.noLone);   // __apx.noLone：前の写真を撮る時だけ切る
    if (have < want && (alive < CAP || over) && !shrinking && (t < 5 || L._retD > SPAWN_FAR) && !L.inside && !L.climb && !L.perch) {
      const n = over ? Math.min(2, want - have, EXTRA - extra) : Math.min(2, want - have, CAP - alive);
      const fac = FACTION[g.faction] || {};
      const armor = fac.busho ?? fac.armor;
      // 一人の座（width 1 の本陣）へ足す時は、将を要にした円陣にする。一列のままだと、遊び手から遠く頭の回らない間に
      //   供回りが将の後ろへ一列に下がり、陣幕に詰まって十人が一点に重なる（設楽原の信長の本陣 11/11）
      if (g.width === 1 && g.leader === L && g.formation !== 'ring' && !g.cav) g.formation = 'ring';
      // 11/16 K341⑤ iMac n-kiba：馬の将の両脇（持ち場 3・4＝真横 3.1m）が空いていれば、そこへ馬廻を馬で足す（二騎まで。馬に乗れない戦・塀の内は徒）
      const side = L.mounted && !rt.def.noHorse ? [3, 4].filter((k) => !used.includes(k)).slice(0, n) : [];
      // 11/18 クラウド kaito2（稲葉山 act bot）：足す侍は隊の並び（slotPos）で一度作られ、池田の控えの隊では戦場の外 (32,277) に出来てから
      //   将の脇へ移されていた。初めから将の周りで作る（移す先は guardPlace が端の内に収める）
      // 11/19 クラウド kaito2（有岡 act bot：荒木久左衛門の手の10人が一点に重なった）：同じ一点で作ると、guardPlace の届かない者が重なる。
      //   一人ずつ将の周りの輪（半径2.4m）に、戦場の端の内へ収めて置く
      const lim = (rt.world.def.moveLim || 176) - 1.5, ringAt = (k) => {
        const a = (k + extra * 0.37) * 2.4, x = L.pos.x + Math.cos(a) * 2.4, z = L.pos.z + Math.sin(a) * 2.4;
        return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
      };
      const o0 = armor != null ? { armor } : {};
      const list = [];
      for (let k = 0; k < n; k++) list.push({ type: 'samurai', n: 1, o: { ...o0, ...ringAt(k), ...(k < side.length ? { horse: true } : {}) } });
      const made = A.spawn(g, list) || [];
      for (const k of side) used.push(k);
      let si = 0;
      for (const v of made) {
        v.officerGuard = L; v.officerGuardSlot = v.mounted && si < side.length ? side[si++] : slot(); v.aiT = 0;
        if (over) { v._retExtra = true; extra++; L._retLone = true; }   // 一人きりと分かった将は、三人で止めずに want まで囲む
        guardPlace(rt, g, L, v);
        alive++;
      }
      have += made.length;
    }
    // 11/16 K341⑤ iMac n-kiba：馬の将は、徒の供回りの半ばより多くが九歩より後ろへ置いて行かれたら、歩みを落として待つ（森部の信長が供回りを五十五歩も置き去りにしていた）。
    //   斬り合い・突撃・退き・逃げる時は待たない（army_move.js が u._waitGuardsT の間だけ速さを抑える）
    if (L.mounted && !L.fleeing && !L.charging && !L.target && !L.atk && g.order !== 'retreat') {
      let n = 0, lag = 0;
      for (const v of g.units) if (v.officerGuard === L && v.alive && !v.fleeing && !v.mounted && !(v.target && v.target.alive)) { n++; if (Math.hypot(v.pos.x - L.pos.x, v.pos.z - L.pos.z) > 9) lag++; }
      if (n >= 3 && lag * 2 > n) L._waitGuardsT = A.time + 0.7;
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
      // 11/15 K338：半径 0.7 に十人を置くと 0.5m 未満の組が出て一点に重なる（信貴山の筒井・有岡の滝川 act bot ★★）。巻き貝の形に半径を広げ、どの二人も 0.6m 以上離す
      const r = 0.9 + 0.13 * s;
      p.x = L.pos.x + Math.cos(a) * r; p.z = L.pos.z + Math.sin(a) * r;
    }
  }
  // 将が戦場の端に立つ時も、供回りを端の外へ置かない（稲葉山の池田の控え：(185,151) に出来て端へ一息に戻された）
  const lim = (rt.world.def.moveLim || 176) - 1.5;
  p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
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
