// 陣の厚みの「待つ備」（台帳 K001・K075 司令塔 11/13）。天王寺で入れた手を、ほかの戦でも使えるよう取り出した物。
//   敵の二陣は本人の前 46m に横に並んで止まって待ち、前の斬り合い（本人の 30m 内の敵）が薄くなったら一組ずつ出す。
//   味方の待つ備は本人の後ろ 28m に置き、味方が薄くなったら前へ出す。どちらも本物の兵の上限（cap）の内。
// 使い方：戦の update から  depthReserve(rt, { cap: rt.def.reserveCap, yieldTo: rt.def.reserveYield, active: (rt) => rt.phase === 'assault', enemy: { make: (rt, anchor) => group }, ally: { make: ... } })
//   make は呼び元の戦の enemyGroup / allyGroup（その戦の装束・旗）で作った隊を返す。置く所は anchor { x, z }。
import { isTouch as TOUCH } from './touch.js';
const alive = (g) => g && !g.routed && g.count > 0;
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };

export function depthReserve(rt, o) {
  const F = rt.flags, me = rt.player?.u;
  if (!me?.alive || rt.over || !o.active(rt)) return;
  if (typeof window !== 'undefined' && window.__apx && window.__apx.noreserve) return;   // 実機の前後の比べ専用（x_noreserve）
  const S = F._dr || (F._dr = { t: 0, E: [], A: [], nE: 0, nA: 0 });
  if (S.t > rt.t) return;
  S.t = rt.t + 4;
  const cap = o.cap ?? 250;
  let n = 0, foe30 = 0, foe70 = 0, foeBand = 0, friend70 = 0, nearest = null, nd = 1e9;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone) continue; n++;
    if (u.isPlayer) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (u.team !== me.team) { if (!u.fleeing) { if (d < 30) foe30++; if (d >= 30 && d < 60) foeBand++; if (d < 70) foe70++; if (d < nd) { nd = d; nearest = u; } } }
    else if (d < 70) friend70++;
  }
  // 本物の上限に達していたら、本人から 100m より先の名無しの兵（逃げ散った者・遠い持ち場の者）から外して、本人の近くの壁の場所を空ける
  if (n >= cap && (o.enemy || o.ally)) {
    const far = []; for (const u of rt.army.units) { if (!u.alive || u.gone || u.isPlayer || u.name || u.isSub || u.type === 'busho' || u.isStruct || u.civ) continue; const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d > 100) far.push([d, u]); }
    far.sort((a, b) => b[0] - a[0]);
    let k = 0; for (const [, u] of far) { if (k >= 30) break; try { rt.army.despawn(u); k++; } catch (e) { /* 外せなければ次へ */ } } n -= k;
  }
  // 敵の向き（一番近い敵の方へ。見えなければ前）
  let dx = 0, dz = -1;
  if (nearest) { const l = Math.hypot(nearest.pos.x - me.pos.x, nearest.pos.z - me.pos.z) || 1; dx = (nearest.pos.x - me.pos.x) / l; dz = (nearest.pos.z - me.pos.z) / l; }
  // 置ける所だけに置く（城攻め・籠城：石垣・塀・柵の向こうや歩けない所には出さない）。距離を少し変えて探し、無ければ null
  // 戦の定義が戦う者の範囲を決めている時（def.reserveBox）は、その内だけ（稲生：外に置くと引き戻され一息で飛んだ。11/13 係三）
  const B = rt.def?.reserveBox, inBox = (p) => !B || (Math.abs(p.x) <= B.xw && p.z >= B.zn && p.z <= B.zs);
  // 城の守り手の二陣（o.wallOk）は塀・石垣の内に置いてよい（曲輪の奥で待つ。11/13 係三：小谷は塀の向こうしか無く一組も出なかった）
  const okAt = (p, wallOk) => inBox(p) && rt.world.walkable?.(p.x, p.z) !== false && (wallOk || !rt.army.wallBetween(me.pos, -1, p));
  const at = (k, lat) => {
    const wallOk = k > 0 && o.wallOk;
    for (const sh of [0, 18, -18, 34, -34]) for (const m of [1, 0.8, 0.65, 1.2]) { const kk = k * m, l = lat + sh, p = { x: me.pos.x + dx * kk - dz * l, z: me.pos.z + dz * kk + dx * l }; if (okAt(p, wallOk)) return p; }   // 横へもずらして探す（山・寺の塀の多い所。11/13 クラウドG）
    // 横にずらした所が置けない時は、逆の横・半分の横も試す（置けた所が同じ一点に集まって重ならないよう、横のずれを残す）
    for (const l2 of [-lat, lat * 0.5, -lat * 0.5]) { const p = { x: me.pos.x + dx * k - dz * l2, z: me.pos.z + dz * k + dx * l2 }; if (okAt(p, wallOk)) return p; }
    // 山城（小谷）は曲輪と道のほかは急で置けない：本人から 32〜60m に立つ守り手の足元（曲輪の内）を借りる（11/13 係三）
    if (wallOk) { const c = []; for (const u of rt.army.units) { if (!u.alive || u.gone || u.team === me.team || u.fleeing) continue; const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d > 32 && d < 60 && inBox(u.pos)) c.push(u); } if (c.length) { const u = c[Math.abs(Math.round(lat / 7)) % c.length]; return { x: u.pos.x, z: u.pos.z }; } }
    return null;
  };
  const prune = (R) => { for (let i = R.length - 1; i >= 0; i--) if (!alive(R[i])) R.splice(i, 1); };
  prune(S.E); prune(S.A);
  const place = (R, k, wide) => R.forEach((g, i) => { const c = g.center(), d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (Math.abs(d - Math.abs(k)) > 14) { const p = at(k, (i - 1) * wide); if (p) hold(g, p.x, p.z); } });
  const K = o.dist ?? 46;   // 敵の待つ備の距離（戦の def.reserveDist。11/13 クラウドF）
  // 敵の待つ備は四組まで並ぶので、横の置き場は四つの真ん中を本人の正面に（三つ目・四つ目が 60m の外へ出ないよう。11/13 クラウドF）
  const placeE = (R, k, wide) => R.forEach((g, i) => { const c = g.center(), d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (Math.abs(d - Math.abs(k)) > 14) { const p = at(k, (i - 1.5) * wide); if (p) hold(g, p.x, p.z); } });
  placeE(S.E, K, 22); place(S.A, -28, 22);
  // 戦の筋書きの寄せ（名を書いた先手など）が出番を待つ間は、新しい備を作らず枠を空けておく（金ヶ崎 11/13：待つ備が本物の枠を埋め、朝倉の先手が出られなかった）
  // 主な任務が 100 秒変わらない間は、新手を作らず待つ備も出さない（尽きない新手に本人と味方が掛かりきりで任務が進まず刻限で負けた。
  //   act bot 11/13：三木・大滝寺・信貴山・木ノ芽峠・設楽原が待つ備ありで失敗、三木は待つ備なしで達成。MB係四）。待つ備は二線として立ったまま残る
  const mk = (rt.objectives || []).filter((q) => q.kind === 'main').map((q) => q.text + (q.state || '')).join('|').replace(/[0-9０-９]+/g, '');   // 「残り75人」の数の減りは進みに数えない
  if (mk !== S.mk) { S.mk = mk; S.mkT = rt.t; }
  const stall = rt.t - S.mkT > 100;
  const yieldNow = stall || (o.yieldTo && o.yieldTo(rt));
  // 出た備は 60m 先の敵まで探して駆ける（30m では 40m 先の敵を前に立ち尽くした。11/13 稲生 bot 係三）。味方の新手は一番近い敵へ。
  //   敵の新手に本人だけを狙わせると、墨俣・長島・野田福島で本人が囲まれて倒れた（bot 11/13）ので、敵は狙いを持たせない
  const release = (R, aim) => { const g = R.shift(); g.stay = false; g.aggro = 14; g.seekRange = 60; g.order = 'attack'; g.dest = null; if (aim?.alive) g.focus = aim; };
  // 本人が 24m 内まで踏み込んだ待つ備は、もう前線なのでその場で出す（待ったまま突かれて 30〜60m の層が空になる。刀根坂の追い討ち 200 秒で四組のうち三組が 21〜32m に立っていた。11/13 クラウドF）
  for (let i = S.E.length - 1; i >= 0; i--) { const g = S.E[i], c = g.center(); if (Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 24) { S.E.splice(i, 1); g.stay = false; g.aggro = 14; g.seekRange = 60; g.order = 'attack'; g.dest = null; } }
  if (o.enemy && n < cap) {
    // 待つ備は一組を残して出す（30〜60m の層を空にしない。11/13 クラウドG）。出し切るのは上限まで作った後だけ
    if (!stall && foe30 < 14 && (S.E.length >= 2 || (S.E.length && S.nE >= (o.enemy.limit ?? 10)))) { release(S.E, null); return; }
    // 層が薄い（30〜60m に 20 人未満）時は一度に二組まで立てる（立ち上がりの遅れを詰める。11/13 クラウドG）
    let made = 0;
    for (let k = foeBand < 20 ? 2 : 1; k > 0 && !yieldNow && n < cap && S.E.length < (foeBand < 48 ? 4 : 3) && S.nE < (o.enemy.limit ?? 10) && (foe70 < 60 || foeBand < 48); k--) {
      const pe = at(K, (S.E.length - 1.5) * 22), g = pe && o.enemy.make(rt, pe);
      if (!g) break;
      g.stay = true; g.isReserve = true; S.E.push(g); S.nE++; made++; n += g.count || 0;
    }
    if (made) return;
  }
  if (o.ally && n < cap) {
    if (friend70 < 30 && S.A.length) { release(S.A, nearest); return; }
    if (!yieldNow && S.A.length < 2 && S.nA < (o.ally.limit ?? 8) && friend70 < 40) {
      const pa = at(-28, (S.A.length - 0.5) * 22), g = pa && o.ally.make(rt, pa);
      if (g) { g.stay = true; g.isReserve = true; S.A.push(g); S.nA++; }
    }
  }
}

// 野戦の戦（opt-in）：戦の定義に待つ備が無ければ、その戦の兵の装束（bhelp.js が覚えた rt._tpl）で自動で待つ備を作る
export const FIELD_RESERVE = new Set(['inou', 'anegawa', 'mikatagahara', 'shitaragahara', 'tedorigawa', 'moribe', 'nodafukushima', 'tonezaka', 'shiga', 'kanegasaki', 'echizen', 'okawachi', 'mitsukuri', 't01_yamazaki']);
// 城攻め・籠城の戦（寄せ手と守り手の層：先鋒・二線・予備・後詰。11/13 司令塔）。開始は 90 秒後（寄せる間を待つ）。置けない所には出さない
export const SIEGE_RESERVE = new Set(['sunomata', 'inabayama', 'odani', 'nagashima', 'iwamura', 'saika', 'shigisan', 'miki', 'arioka', 'takato', 'hieizan', 't04_negoro', 't07_ganjaku', 't10_oshi', 't11_hachioji', 't12_odawara', 't09_yamanaka', 'k11_sanadamaru', 'k12_kashii', 'k13_domyoji', 'k14_yao_wakae', 'k17_shuumaku', 'k01_fushimi', 'k03_gifu', 'k07_sawayama', 'k08_osaka_kizu', 'k10_shigino', 'k09_imafuku', 'k02_kawada', 'k04_kuisegawa', 'k05_ueda', 'honnoji', 't03_komaki', 't03b_nagakute', 't04a_sengokubori', 't04b_ota', 't05_ichinomiya', 't06_hetsugi', 't08_nejirozaka', 't01_yamazaki', 't02_shizugatake', 'echizen_ikko']);
// 田野は入れない（11/13 クラウドB）：武田の供は史実で四十人ほど（K196 史実の規模）。狭い谷で新手を横に置くと崖の上で止まり（新手11人が (103,-30) で20秒★★★27回）、
//   道の上に置くと鳥居畑の柵の内に入り柵の段が終わらず1080秒で失敗した。守りの層は b_tano.js の五つの持ち場（谷道・後ろ・小宮山・柵・土屋）で作る
// 鳥取も入れない：kaito の指示書（docs/tottori_spec_1109.md）は「戦わない戦・敵を大量に斬って埋めない」。新手が七組（200秒で30〜60mに敵93人）出て、
//   補給の舟の段で侍に囲まれ348秒で倒れた（11/13 act bot）。外して751秒で達成
// 伊賀も入れない：土橋の段は「味方が敵より多い間に20秒守る」で進む。新手が足され続けて敵が上回り、九十九折りの坂（-24,-30）に新手11人が重なって、
//   266秒から1080秒まで土橋の段が終わらず失敗した（11/13 act bot）
const fromTpl = (T, n, at, name, extra) => {
  const sum = T.list.reduce((a, e) => a + e.n, 0), f = n / sum;
  return { o: { ...T.o, ...extra, name, anchor: at, fixed: true, order: 'hold', aggro: 3, seekRange: 5 }, list: T.list.map((e) => ({ ...e, n: Math.max(1, Math.round(e.n * f)) })) };
};
const FOOT = new Set(['ashigaru', 'samurai', 'gun', 'bow']);
function liveTpl(rt, foe) {
  const me = rt.player?.u; if (!me) return null;
  // 守り手が小さな組に分かれている戦（曲輪ごとの番）もあるので、同じ側の名無しの兵を全部数え、旗と家は一番大きな組から
  let best = null, bn = 0, all = 0;
  const by = new Map();
  for (const g of rt.army.groups) {
    if (g.routed || g.isPlayerSquad || (g.team !== me.team) !== !!foe) continue;
    let n = 0;
    for (const u of g.units) {
      if (!u.alive || u.name || u.isPlayer || !FOOT.has(u.type)) continue;
      n++; all++;
      const e = by.get(u.type); if (e) { e.n++; continue; }
      const o = {}; for (const k of ['flag', 'mon', 'weapon']) if (typeof u[k] === 'string') o[k] = u[k];
      by.set(u.type, { type: u.type, n: 1, o });
    }
    if (n > bn) { bn = n; best = g; }
  }
  if (!best || all < 8) return null;
  return { o: { team: best.team, faction: best.faction }, list: [...by.values()] };
}
// def.reserveDmgMult：城の内で本人を囲む戦だけ、新手の打ち込みを弱める（山中城 11/13 クラウドE）
export function autoReserve(rt, enemyGroup, allyGroup) {
  const id = rt.def && (rt.def.key || rt.def.id);
  const siege = SIEGE_RESERVE.has(id);
  if (!(FIELD_RESERVE.has(id) || siege) || rt.def.ownReserve) return;
  if (typeof location !== 'undefined' && /[?&]noreserve\b/.test(location.search)) return;   // 前後の比べ専用
  const T = rt._tpl || (rt._tpl = {});
  // 敵（味方）を enemyGroup を通さずに作る戦（城の守り手など）は装束の手本が無い。生きている名無しの兵から写す（11/13 係三）
  if (!T.E && !(T._tE > rt.t)) { T._tE = rt.t + 10; T.E = liveTpl(rt, 1); }
  if (!T.A && !(T._tA > rt.t)) { T._tA = rt.t + 10; T.A = liveTpl(rt, 0); }
  if (!T.E && !T.A) return;
  depthReserve(rt, { wallOk: siege && rt.def.reserveWallOk !== false, dist: rt.def.reserveDist, cap: rt.def.reserveCap, yieldTo: rt.def.reserveYield, active: (r) => r.t > (r.def.reserveFrom ?? (siege ? 90 : 45)) && !r.hud?.introWaiting && r.phase !== 'end' && !r.over && !r.flags?.ending,   // 設楽原は戦の間ずっと phase が brief のままなので、phase では止めない
    enemy: T.E && !rt.def.reserveNoEnemy && { limit: rt.def.reserveLimit ?? 24, make: (r, at) => { const m = fromTpl(T.E, Math.round((rt.def.reserveSize ?? 28) / (TOUCH ? 2 : 1)), at, '新手', { width: 18, ...(r.def.reserveDmgMult ? { dmgMult: r.def.reserveDmgMult } : {}) }); return enemyGroup(r, m.o, m.list); } },
    ally: T.A && { limit: 12, make: (r, at) => { const m = fromTpl(T.A, TOUCH ? 12 : 24, at, '味方の新手', { width: 16, fullStrength: true, noRout: true }); return allyGroup(r, m.o, m.list); } } });
}
