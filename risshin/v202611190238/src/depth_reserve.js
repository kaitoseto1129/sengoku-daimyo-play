// 陣の厚みの「待つ備」（台帳 K001・K075 司令塔 11/13）。天王寺で入れた手を、ほかの戦でも使えるよう取り出した物。
//   敵の二陣は本人の前 46m に横に並んで止まって待ち、前の斬り合い（本人の 30m 内の敵）が薄くなったら一組ずつ出す。
//   味方の待つ備は本人の後ろ 28m に置き、味方が薄くなったら前へ出す。どちらも本物の兵の上限（cap）の内。
// 使い方：戦の update から  depthReserve(rt, { cap: rt.def.reserveCap, yieldTo: rt.def.reserveYield, active: (rt) => rt.phase === 'assault', enemy: { make: (rt, anchor) => group }, ally: { make: ... } })
//   make は呼び元の戦の enemyGroup / allyGroup（その戦の装束・旗）で作った隊を返す。置く所は anchor { x, z }。
// K168 11/14 束E：新手を建物（町家・屋敷）の中に置かない。真ん中と前後左右 4m に家の当たりが無い所だけ（小田原の総構えの町で新手が町家の中に出た）
function clearOfSolids(rt, p) {
  const A = rt.army; if (!A.solids?.length || !A.solidBlocked) return true;
  const u = { pos: { y: rt.world.heightAt ? rt.world.heightAt(p.x, p.z) : 0 }, mounted: false };
  for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) if (A.solidBlocked(u, p.x + dx, p.z + dz)) return false;
  return true;
}
// 11/16 クラウドす（K168）：置き場の真ん中が空いていても、隊の並び（幅・奥行き）の端の者が町家の中に立つ（本能寺の東の町で新手13人が家の中）。作った直後に家の外へ押し出す
function outOfSolids(rt, g) {
  const A = rt.army; if (!g || !g.units || !A.solids?.length || !A.solidBlocked) return g;
  for (const u of g.units) for (let i = 0; i < 8 && u.alive && A.solidBlocked(u, u.pos.x, u.pos.z); i++) A.collide(u, 0.1);
  return g;
}
import { isTouch as TOUCH } from './touch.js';
// 11/15 iMac三十 K324（束F・共通の物を先に）：上限の外し（本人から遠い名無しの兵を外して枠を空ける）の共通の手。
//   名のある将の備（組に名のある将が生きている）は、名無しを CORE 人より減らさない＝将が一人で立たない（K287・K285）。
//   今日 姉川・志賀・稲生・小谷・三方ヶ原が戦ごとに u.keepReal を付けていた手当てを既定にした。u.keepReal は今までどおり外さない。
//   ok(u, d)：戦ごとの外してよい所（前の向きの者を外さない等）。返り値は外した数
const CORE = 8;
const postedShooter = (u) => ['gun', 'bow'].includes(u.wpnKind || u.lookWeapon || u.type) && !!(u.perch || u.tower || u.group?.fixed || u.group?.stay);
export function pruneFar(rt, me, max, ok, minD = 100) {
  const far = [];
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isPlayer || u.name || u.isSub || u.type === 'busho' || u.isStruct || u.civ || u.keepReal) continue;
    // 11/19 K362 iMac n-hetsugi（kaito 真田丸「鉄砲が撃たれない」・長篠の柵・天王寺砦の四方の鉄砲）：持ち場に据えた鉄砲・弓（台・櫓の上、持ち場を守る組）は外さない。
    //   全戦を描かずに数えると、61戦中の多くで据えた撃ち手が開戦九十秒までに間引かれていた（真田丸78人・大坂木津35人・設楽原31人・佐和山23人・志賀22人…）
    if (postedShooter(u)) continue;
    // 11/18 夜50-47 K210：名のある将の供回り（lord_retinue.js が足す）は外さない。外すと次の半秒に供回りがまた足され、
    //   伏見で 240 秒に供回り約570人を作っては外す（形づくりと記憶の増え 9MB/分）を繰り返していた。供回りの数は将ごとに 8〜10 人まで
    if (u.officerGuard && u.officerGuard.alive && !u.officerGuard.gone) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (d > minD && (!ok || ok(u, d))) far.push([d, u]);
  }
  if (!far.length) return 0;
  far.sort((a, b) => b[0] - a[0]);
  const left = new Map();   // 名のある将の備 → 残る名無しの数（名の無い備は null）
  const core = (g) => {
    if (!g || g.isPlayerSquad) return null;
    if (left.has(g)) return left.get(g);
    let lead = false, n = 0;
    for (const v of g.units || []) { if (!v.alive || v.gone) continue; if (v.name || v.type === 'busho') lead = true; else n++; }
    const r = lead ? n : null; left.set(g, r); return r;
  };
  let k = 0;
  for (const [, u] of far) {
    if (k >= max) break;
    const g = u.group, c = core(g);
    if (c != null && c <= CORE) continue;
    try { rt.army.despawn(u); k++; if (c != null) left.set(g, c - 1); } catch (e) { /* 外せなければ次へ */ }
  }
  return k;
}
const alive = (g) => g && !g.routed && g.count > 0;
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };

export function depthReserve(rt, o) {
  const F = rt.flags, me = rt.player?.u;
  if (!me?.alive || rt.over || !o.active(rt)) return;
  if (typeof window !== 'undefined' && window.__apx && window.__apx.noreserve) return;   // 実機の前後の比べ専用（x_noreserve）
  const S = F._dr || (F._dr = { t: 0, E: [], A: [], nE: 0, nA: 0 });
  S.wait = o.wait;   // engageNear も筋書きの「まだ寄せない」を守る（下）
  if (S.t > rt.t) return;
  S.t = rt.t + 4;
  const cap = o.cap ?? rt.def.realCap ?? 250;
  let n = 0, foe30 = 0, foe70 = 0, foeBand = 0, friend70 = 0, friendBand = 0, nearest = null, nd = 1e9;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone) continue; n++;
    if (u.isPlayer) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (u.team !== me.team) { if (!u.fleeing) { if (d < 30) foe30++; if (d >= 30 && d < 60) foeBand++; if (d < 70) foe70++; if (d < nd) { nd = d; nearest = u; } } }
    else if (d < 70) { friend70++; if (d >= 30) friendBand++; }
  }
  // 本物の上限に達していたら、本人から 100m より先の名無しの兵（逃げ散った者・遠い持ち場の者）から外して、本人の近くの壁の場所を空ける
  if (n >= cap && (o.enemy || o.ally)) {
    n -= pruneFar(rt, me, 30);
  }
  // 敵の向き（一番近い敵の方へ。見えなければ前）
  let dx = 0, dz = -1;
  if (nearest) { const l = Math.hypot(nearest.pos.x - me.pos.x, nearest.pos.z - me.pos.z) || 1; dx = (nearest.pos.x - me.pos.x) / l; dz = (nearest.pos.z - me.pos.z) / l; }
  // o.dir(rt)：戦の向きが決まっている戦は、その向きに置く（稲生：退く物見が本人の後ろにいる間、林勢の二陣が味方の後ろに湧いた。11/14 K078 iMac二十三）
  { const D = o.dir?.(rt); if (D) { dx = D.x; dz = D.z; } }
  // 置ける所だけに置く（城攻め・籠城：石垣・塀・柵の向こうや歩けない所には出さない）。距離を少し変えて探し、無ければ null
  // 戦の定義が戦う者の範囲を決めている時（def.reserveBox）は、その内だけ（稲生：外に置くと引き戻され一息で飛んだ。11/13 係三）
  // 11/18 クラウド k365-cloud-07（一宮 act bot：新手の侍が戦場の端の外 (-197,17) に置かれ、端の 176 へ一息に引き戻された「戦場の外」「6m 飛んだ」）：
  //   どの戦も、新手は戦場の端（moveLim）から二十歩の内にだけ置く（並びの幅の半分も端の内に収まる）
  const LIM = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 20;
  const B = rt.def?.reserveBox, inBox = (p) => Math.abs(p.x) <= LIM && Math.abs(p.z) <= LIM && (!B || (Math.abs(p.x) <= B.xw && p.z >= B.zn && p.z <= B.zs));
  // 城の守り手の二陣（o.wallOk）は塀・石垣の内に置いてよい（曲輪の奥で待つ。11/13 係三：小谷は塀の向こうしか無く一組も出なかった）
  // 立っている敵の門・木戸の 20m 内には置かない（門の前に立つと、木づちで打つ本人と味方の道を塞ぐ。越前・大滝寺 11/13 クラウドG：門の残り24で八十秒止まった）
  const gates = []; for (const st of rt.army.structs || []) if (st.alive && st.team !== me.team && st.seg && (st.gate || /門|木戸/.test(st.name || ''))) gates.push({ x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 });
  const byGate = (p) => gates.some((G) => Math.hypot(p.x - G.x, p.z - G.z) < 20);
  // def.reserveOk(rt, p, foe)：戦ごとに置いてよい所を決める（高遠：城兵の新手は大手門の内だけ。外の寄せ手の陣に城兵が湧いた。11/13 クラウドか）
  const RO = rt.def?.reserveOk;
  const okAt = (p, wallOk, foe = true) => inBox(p) && !byGate(p) && (!RO || RO(rt, p, foe)) && rt.world.walkable?.(p.x, p.z) !== false && (wallOk || !rt.army.wallBetween(me.pos, -1, p)) && clearOfSolids(rt, p);
  const at1 = (k, lat) => {
    const wallOk = k > 0 && o.wallOk;
    for (const sh of [0, 18, -18, 34, -34]) for (const m of [1, 0.8, 0.65, 1.2]) { const kk = k * m, l = lat + sh, p = { x: me.pos.x + dx * kk - dz * l, z: me.pos.z + dz * kk + dx * l }; if (okAt(p, wallOk, k > 0)) return p; }   // 横へもずらして探す（山・寺の塀の多い所。11/13 クラウドG）
    // 横にずらした所が置けない時は、逆の横・半分の横も試す（置けた所が同じ一点に集まって重ならないよう、横のずれを残す）
    for (const l2 of [-lat, lat * 0.5, -lat * 0.5]) { const p = { x: me.pos.x + dx * k - dz * l2, z: me.pos.z + dz * k + dx * l2 }; if (okAt(p, wallOk, k > 0)) return p; }
    // 山城（小谷）は曲輪と道のほかは急で置けない：本人から 32〜60m に立つ守り手の足元（曲輪の内）を借りる（11/13 係三）
    if (wallOk) { const c = []; for (const u of rt.army.units) { if (!u.alive || u.gone || u.team === me.team || u.fleeing) continue; const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d > 32 && d < 60 && inBox(u.pos) && (!RO || RO(rt, u.pos, true))) c.push(u); } if (c.length) { const u = c[Math.abs(Math.round(lat / 7)) % c.length]; return { x: u.pos.x, z: u.pos.z }; } }
    return null;
  };
  // o.bound：戦ごとの置ける所へ寄せる（墨俣：北の畑の内。川・砦の中に置かない。11/13 クラウドC）。戦の def.reserveBound も同じ（null で置かない）
  const at = o.bound ? (k, lat) => { const p = at1(k, lat); return p && o.bound(p); } : at1;
  const prune = (R) => { for (let i = R.length - 1; i >= 0; i--) if (!alive(R[i])) R.splice(i, 1); };
  prune(S.E); prune(S.A);
  const place = (R, k, wide) => R.forEach((g, i) => { const c = g.center(), d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (Math.abs(d - Math.abs(k)) > 14) { const p = at(k, (i - 1) * wide); if (p) hold(g, p.x, p.z); } });
  const K = o.dist ?? 46;   // 敵の待つ備の距離（戦の def.reserveDist。11/13 クラウドF）
  // 敵の待つ備は四組まで並ぶので、横の置き場は四つの真ん中を本人の正面に（三つ目・四つ目が 60m の外へ出ないよう。11/13 クラウドF）
  const placeE = (R, k, wide) => R.forEach((g, i) => { const c = g.center(), d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (Math.abs(d - Math.abs(k)) > 14 || byGate(c)) { const p = at(k, (i - 1.5) * wide); if (p) hold(g, p.x, p.z); } });
  // 主な任務が 100 秒変わらない間は、新手を作らず待つ備も出さない（尽きない新手に本人と味方が掛かりきりで任務が進まず刻限で負けた。
  //   act bot 11/13：三木・大滝寺・信貴山・木ノ芽峠・設楽原が待つ備ありで失敗、三木は待つ備なしで達成。MB係四）。待つ備は二線として立ったまま残る
  const mk = (rt.objectives || []).filter((q) => q.kind === 'main').map((q) => q.text + (q.state || '')).join('|').replace(/[0-9０-９]+/g, '');   // 「残り75人」の数の減りは進みに数えない
  if (mk !== S.mk) { S.mk = mk; S.mkT = rt.t; }
  const stall = !(typeof o.noStall === 'function' ? o.noStall(rt) : o.noStall) && rt.t - S.mkT > 100;   // 11/18 夜50-03：noStall は関数でもよい（金ヶ崎：離反の後の守りの段は時で進む）   // o.noStall：任務が時で進む戦（稲生・墨俣）は止めない（11/13 クラウドC）
  // 止まりの間は、待つ備を 90m の奥へ下げる（二線として見えたまま、本人の行く手に立ちふさがらない。三木の大村坂で④が終わらなかった）
  // 戦の筋書きの寄せ（名を書いた先手など）が出番を待つ間は、新しい備を作らず枠を空けておく（金ヶ崎 11/13：待つ備が本物の枠を埋め、朝倉の先手が出られなかった）
  const yieldNow = stall || (o.yieldTo && o.yieldTo(rt)), back = stall || (o.yieldBack && yieldNow);   // yieldBack：譲る間は待つ備も奥へ下げる（三木）
  placeE(S.E, back ? 90 : K, 22); place(S.A, -(o.allyDist ?? 28), 22);
  // 本人が先へ進み、置き直せないまま 110m より後ろに取り残された待つ備は外す（枠を埋めたまま新しい備が作れず、30〜60m が空になった。木ノ芽峠 11/13 クラウドG）
  for (let i = S.E.length - 1; i >= 0; i--) {
    const g = S.E[i], c = g.center();
    if (Math.hypot(c.x - me.pos.x, c.z - me.pos.z) <= 110) continue;
    S.E.splice(i, 1); S.nE = Math.max(0, S.nE - 1);
    for (const u of [...g.units]) if (u.alive && !u.gone) { try { rt.army.despawn(u); n--; } catch (e) { /* 外せなければそのまま */ } }
  }
  // 出た備は 60m 先の敵まで探して駆ける（30m では 40m 先の敵を前に立ち尽くした。11/13 稲生 bot 係三）。味方の新手は一番近い敵へ。
  //   敵の新手に本人だけを狙わせると、墨俣・長島・野田福島で本人が囲まれて倒れた（bot 11/13）ので、敵は狙いを持たせない
  const release = (R, aim) => { const g = R.shift(); g.stay = false; g.fire = true; g.aggro = 14; g.seekRange = 60; g.order = 'attack'; g.dest = null; if (aim?.alive) g.focus = aim; };
  // 本人が 24m 内まで踏み込んだ待つ備は、もう前線なのでその場で出す（待ったまま突かれて 30〜60m の層が空になる。刀根坂の追い討ち 200 秒で四組のうち三組が 21〜32m に立っていた。11/13 クラウドF）
  // 戦の定義が出してよい段を決める時（def.reserveRelease）は、その段の外では並べるだけ（岩村の麓の小競り合い。11/13 クラウドH）
  // o.wait：戦の筋書きが「まだ寄せない」間（墨俣の運び・稲生の前衛へ合流）は並べて待たせるだけ（11/13 クラウドC）
  const mayRelease = !back && (!o.canRelease || o.canRelease(rt)) && !o.wait?.(rt);
  if (mayRelease) for (let i = S.E.length - 1; i >= 0; i--) { const g = S.E[i], c = g.center(); if (Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 24) { S.E.splice(i, 1); g.stay = false; g.fire = true; g.aggro = 14; g.seekRange = 60; g.order = 'attack'; g.dest = null; } }
  if (o.enemy && n < cap) {
    // 待つ備は一組を残して出す（30〜60m の層を空にしない。11/13 クラウドG）。出し切るのは上限まで作った後だけ
    // def.reserveNoWave：間合いが空いても新手を本人へ駆けさせない（本人が 24m 内へ踏み込んだ時だけ戦う。木ノ芽峠の木戸の寄せ道 11/13 クラウドG）
    if (mayRelease && !rt.def?.reserveNoWave && foe30 < 14 && (S.E.length >= 2 || (S.E.length && S.nE >= (o.enemy.limit ?? 10)))) { release(S.E, null); return; }
    // 層が薄い（30〜60m に 20 人未満）時は一度に二組まで立てる（立ち上がりの遅れを詰める。11/13 クラウドG）
    let made = 0;
    for (let k = foeBand < 20 ? 2 : 1; k > 0 && !yieldNow && n + (TOUCH ? 14 : 28) <= cap && S.E.length < (foeBand < 48 ? 4 : 3) && S.nE < (o.enemy.limit ?? 10) && (foe70 < 60 || foeBand < 48); k--) {
      const pe = at(K, (S.E.length - 1.5) * 22), g = pe && outOfSolids(rt, o.enemy.make(rt, pe));
      if (!g) break;
      g.stay = true; g.fire = false; g.isReserve = true; S.E.push(g); S.nE++; made++; n += g.count || 0;
    }
    if (made) return;
  }
  if (o.ally && n + (TOUCH ? 12 : 24) <= cap) {   // 11/15 iMac三十四（K210）：足した後も上限の内
    if (friend70 < 30 && S.A.length) { release(S.A, nearest); return; }
    if (!yieldNow && S.A.length < 2 && S.nA < (o.ally.limit ?? 8) && (friend70 < 40 || (o.allyBandMin && friendBand < o.allyBandMin))) {   // o.allyBandMin：味方が本人の30〜70mに薄い戦（桶狭間 11/13 クラウドそ）は、近くに多くても二陣を足す
      const ad = o.allyDist ?? 28, lt = (S.A.length - 0.5) * 22, pa = at(-ad, lt) || (ad > 24 ? at(-24, lt) : null) || (ad > 14 ? at(-14, lt) : null), g = pa && outOfSolids(rt, o.ally.make(rt, pa));   // 遠い所が置けない時は近めも試す（桶狭間 11/14 クラウドよ：-42 が置けず nA=1 のまま）
      if (g) { g.stay = true; g.fire = false; g.isReserve = true; S.A.push(g); S.nA++; }
    }
  }
}

// 野戦の戦（opt-in）：戦の定義に待つ備が無ければ、その戦の兵の装束（bhelp.js が覚えた rt._tpl）で自動で待つ備を作る
export const FIELD_RESERVE = new Set(['inou', 'anegawa', 'mikatagahara', 'shitaragahara', 'tedorigawa', 'moribe', 'nodafukushima', 'tonezaka', 'shiga', 'kanegasaki', 'echizen', 'okawachi', 'mitsukuri', 't01_yamazaki']);
// 城攻め・籠城の戦（寄せ手と守り手の層：先鋒・二線・予備・後詰。11/13 司令塔）。開始は 90 秒後（寄せる間を待つ）。置けない所には出さない
export const SIEGE_RESERVE = new Set(['sunomata', 'inabayama', 'odani', 'nagashima', 'iwamura', 'saika', 'shigisan', 'miki', 'arioka', 'takato', 'hieizan', 't04_negoro', 't07_ganjaku', 't10_oshi', 't11_hachioji', 't12_odawara', 't09_yamanaka', 'k11_sanadamaru', 'k12_kashii', 'k13_domyoji', 'k14_yao_wakae', 'k17_shuumaku', 'k01_fushimi', 'k03_gifu', 'k07_sawayama', 'k08_osaka_kizu', 'k10_shigino', 'k09_imafuku', 'k02_kawada', 'k04_kuisegawa', 'k05_ueda', 'honnoji', 't03_komaki', 't03b_nagakute', 't04a_sengokubori', 't04b_ota', 't05_ichinomiya', 't06_hetsugi', 't08_nejirozaka', 't01_yamazaki', 't02_shizugatake', 'echizen_ikko', 'okawachi']);
// 田野は入れない（11/13 クラウドB）：武田の供は史実で四十人ほど（K196 史実の規模）。狭い谷で新手を横に置くと崖の上で止まり（新手11人が (103,-30) で20秒★★★27回）、
//   道の上に置くと鳥居畑の柵の内に入り柵の段が終わらず1080秒で失敗した。守りの層は b_tano.js の五つの持ち場（谷道・後ろ・小宮山・柵・土屋）で作る
// 鳥取も入れない：kaito の指示書（docs/tottori_spec_1109.md）は「戦わない戦・敵を大量に斬って埋めない」。新手が七組（200秒で30〜60mに敵93人）出て、
//   補給の舟の段で侍に囲まれ348秒で倒れた（11/13 act bot）。外して751秒で達成
// 伊賀も入れない：土橋の段は「味方が敵より多い間に20秒守る」で進む。新手が足され続けて敵が上回り、九十九折りの坂（-24,-30）に新手11人が重なって、
//   266秒から1080秒まで土橋の段が終わらず失敗した（11/13 act bot）
export const fromTpl = (T, n, at, name, extra) => {
  const sum = T.list.reduce((a, e) => a + e.n, 0), f = n / sum;
  // 11/14 クラウド：手本に騎馬が入ると、待つ備の新手が騎馬になり一太刀が傷の上限（六十余り）で本人を囲んだ（木津川口 300・河田 215）。待つ備は徒の兵だけにする
  const foot = (e) => e.type === 'cavalry' ? { ...e, type: 'ashigaru', o: { ...(e.o || {}), horse: false } } : (e.o?.horse ? { ...e, o: { ...e.o, horse: false } } : e);
  // 弾と矢の傷は組の倍率（dmgMult）も def.playerTaken も効かない。鉄砲衆を写した新手が十〜二十五m から九ずつ浴びせ、木津川口（大坂冬）で act を四回続けて倒した。
  //   弓・鉄砲は組の一割五分まで（残りは長柄の足軽に）
  const list = T.list.map((e) => ({ ...foot(e), n: Math.max(1, Math.round(e.n * f)) }));
  const tot = list.reduce((a, e) => a + e.n, 0);
  let room = Math.max(1, Math.round(tot * 0.15)), moved = 0;
  for (const e of list) if (e.type === 'gun' || e.type === 'bow') { const keep = Math.min(e.n, room); room -= keep; moved += e.n - keep; e.n = keep; }
  if (moved) { const a = list.find((e) => e.type === 'ashigaru'); if (a) a.n += moved; else list.push({ type: 'ashigaru', n: moved }); }
  return { o: { ...T.o, ...extra, name, anchor: at, fixed: true, order: 'hold', aggro: 15, seekRange: 16, isReserveTpl: true }, list: list.filter((e) => e.n > 0) };   // isReserveTpl：bhelp.js が騎馬を混ぜない（11/14 クラウドゆ）
};
const FOOT = new Set(['ashigaru', 'samurai', 'gun', 'bow']);
export function liveTpl(rt, foe) {
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
// 既定も 0.7：待つ備は層の厚みを見せる兵。元の兵と同じ強さで足すと、墨俣・長島・野田福島の act bot が囲まれて倒れた（待つ備無しなら達成。11/13 係三）。
//   待っている間は弓・鉄砲を撃たない（46m 先から背に矢が来た）。出る時に撃ち始める
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
  // 待つ備を畳む段（def.reserveFold）：並んでいた組は逃げ散らせ、新しく作らない（岩村の追い討ち：麓に残った待つ備が麓を守る味方を討ち尽くし負けた。11/13 クラウドH）
  if (rt.def.reserveFold && rt.def.reserveFold(rt)) {
    const S = rt.flags._dr, me = rt.player?.u;
    if (S && S.E.length) { S.F = (S.F || []).concat(S.E); for (const g of S.E) { g.stay = false; for (const u of g.units) if (u.alive) u.fleeing = true; } S.E.length = 0; }
    // 逃げた新手は本人から 35m 離れたら消す（麓の奥に残ると「登り口を固めよ」の敵に数えられ、岩村が刻限で負けた。11/13 クラウドH）
    if (S && S.F && me) for (const g of S.F) for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 35) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    return;
  }
  // def.frontFillLimit：前を埋める備の組の上限（既定30）。高遠は城兵の新手が寄せ手の本物を溶かした（11/13 MB係四）
  // def.frontFillWhen：前を埋める備を出してよい段（山中城は本丸の段で新手が本人を囲み倒した。11/14 クラウドE）
  frontFill(rt, { limit: rt.def.frontFillLimit, active: (r) => r.t > (siege ? 60 : 6) && !r.hud?.introWaiting && r.phase !== 'end' && !r.over && !r.flags?.ending && (!r.def.frontFillWhen || r.def.frontFillWhen(r)),
    // 11/14 クラウド：既定の一太刀を 待つ備 0.7→0.45・前を埋める備 1→0.5 に（act bot で河田・八王子・鴫野の三戦続けて、倒れの傷の一番が共通の「新手」215〜285。十の戦が既に戦ごとに 0.3〜0.5 へ下げていた）
  // def.frontFillSize・def.reserveDmgMult：前を埋める城兵の人数と一太刀（既定は二十八人・そのまま）。高遠で新手が倒れの傷の一番だった（11/13 MB係四）
    // 11/14 クラウド：def.reserveNoEnemy（城方の待つ備を出さない戦）は前を埋める備の敵の新手も出さない（根来で止めた後も前を埋める新手に倒れた 110）
    enemy: T.E && !rt.def.reserveNoEnemy && ((r, at, face) => { const m = fromTpl(T.E, Math.round((r.def.frontFillSize ?? 28) / (TOUCH ? 2 : 1)), at, '新手', { width: r.def.reserveWidth ?? 18, facing: face, dmgMult: r.def.reserveDmgMult ?? 0.5 }); return enemyGroup(r, m.o, m.list); }),
    ally: T.A && !rt.def.reserveNoAlly?.(rt) && ((r, at, face) => { const m = fromTpl(T.A, TOUCH ? 12 : 24, at, '味方の新手', { width: 16, facing: face, fullStrength: true, noRout: true }); return allyGroup(r, m.o, m.list); }) });
  // def.reserveWallOk === true：野戦でも柵の向こうに待つ備を置く（設楽原：敵はいつも馬防柵の外。11/14 クラウドし）。def.reserveNoStall：任務の止まりで奥へ下げない
  // def.reserveAllyBand：味方が本人の30〜70m に薄い時も味方の新手を出す目安（桶狭間の allyBandMin と同じ。11/17 owner-2 箕作 ③）。無い戦は今まで通り
  depthReserve(rt, { allyBandMin: rt.def.reserveAllyBand, bound: rt.def.reserveBound, canRelease: rt.def.reserveRelease, wait: rt.def.reserveWait, noStall: rt.def.reserveNoStall, wallOk: siege && rt.def.reserveWallOk !== false || rt.def.reserveWallOk === true, dist: rt.def.reserveDist, cap: rt.def.reserveCap, yieldTo: rt.def.reserveYield, yieldBack: rt.def.reserveYieldBack, active: (r) => r.t > (r.def.reserveFrom ?? (siege ? 90 : 45)) && !r.hud?.introWaiting && r.phase !== 'end' && !r.over && !r.flags?.ending,   // 設楽原は戦の間ずっと phase が brief のままなので、phase では止めない
    enemy: T.E && !rt.def.reserveNoEnemy && { limit: rt.def.reserveLimit ?? 24, make: (r, at) => { const m = fromTpl(T.E, Math.round((rt.def.reserveSize ?? 28) / (TOUCH ? 2 : 1)), at, '新手', { width: r.def.reserveWidth ?? 18, dmgMult: r.def.reserveDmgMult ?? 0.45 }); return enemyGroup(r, m.o, m.list); } },
    // def.reserveNoAlly(rt)：味方の新手を出さない段（金ヶ崎の殿：後ろへ退くほど味方が減って見える事が大事。11/14 K104 iMac二十六）
    ally: T.A && !rt.def.reserveNoAlly?.(rt) && { limit: 12, make: (r, at) => { const m = fromTpl(T.A, TOUCH ? 12 : 24, at, '味方の新手', { width: 16, fullStrength: true, noRout: true }); return allyGroup(r, m.o, m.list); } } });
}

// 11/13 K285：見せかけの軽い兵の代わりに、同じ場所・同じ向きへ「本物の備」を置く（noFake の戦）。人数は元の 約 scale 分の一まで（上限 max）。
//   戦の中で動き・戦い・倒れる本物。遠くは qualityTier 2（army_quality.js）で骨無しの束・考えを間引いて安く描く。装束は bhelp.js が覚えた rt._tpl から。
export function realFromLight(rt, o, enemyGroup, allyGroup, scale = 0.12, max = 36, name = '遠くの備', leaders = null) {
  const T = rt._tpl && rt._tpl[o.team === 1 ? 'E' : 'A']; if (!T) return null;
  // 同じ名の備は一つだけ（K287「同じ名は一つ」：二度作られて 秋田・松平の名が二つずつ出た）
  const seen = rt._farNames || (rt._farNames = new Set()); if (name && name !== '遠くの備') { if (seen.has(name)) return null; seen.add(name); }
  const n = Math.max(o.min ?? 8, Math.min(max, Math.round((o.count || 100) * scale)));
  // 11/17 クラウド kaito2：置き場を戦場の端（moveLim）の内へ収める（山中城：遠くの備が z=280 に置かれ、93秒で端の 236 へ一息に引き戻され「兵が戦場の外に出た・一息で飛んだ」）
  // 隊の並びの幅（最大 30m）の半分と奥行きも内へ（端ぎりぎりに置くと並びの外の者が端で押し戻され一点に重なった・一宮 25秒 (55,-170)）
  { const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 12 - Math.max(8, Math.min(30, (o.w || 20) * 0.6)) / 2; o = { ...o, x: Math.max(-lim, Math.min(lim, o.x)), z: Math.max(-lim, Math.min(lim, o.z)) }; }
  const m = fromTpl(T, n, { x: o.x, z: o.z }, name, { width: Math.max(8, Math.min(30, (o.w || 20) * 0.6)), facing: o.facing || 0, formation: T.o.formation || 'yari', stay: true, fixed: true, noRout: true, morale: 100, aggro: 15, seekRange: 16, ...(o.team === 1 ? {} : { fullStrength: true }) });
  // 布陣図の名（K287）：その列の大名・将の名を 名のある武将として一人ずつ付ける（真上・遠くでも頭の上に名が出る。同じ名は一つ）
  if (o.look) m.list = m.list.map((e) => ({ ...e, o: { ...(e.o || {}), ...o.look } }));   // 表の旗・具足の色（fujin_table.js）
  // 11/16 MacBook天王寺-厚み（K293・K315）：表の行が騎馬の割合（cav 0〜1）を持つ時だけ、その分の侍・足軽を騎馬に替える（fromTpl は待つ備を徒にする。布陣の騎馬の塊「真田の騎馬」が徒だった）
  if (o.cav > 0 && !rt.def.noHorse) { const tot = m.list.reduce((a, e) => a + e.n, 0); let k = Math.round(tot * Math.min(1, o.cav)); const L = [];
    for (const e of m.list) { if (k > 0 && (e.type === 'samurai' || e.type === 'ashigaru' || e.type === 'gun' || e.type === 'bow')) { const c = Math.min(k, e.n); k -= c; L.push({ ...e, type: 'cavalry', n: c, o: { ...(e.o || {}), horse: undefined } }); if (e.n > c) L.push({ ...e, n: e.n - c }); } else L.push(e); }
    m.list = L; }
  // K315（kaito 11/15「名のある武将は全員馬に乗せる」・束F K324 で全戦へ）：列の将は馬に乗せる（units.js が武将を馬に。def.noHorse の戦と塀の内は徒）
  // 11/17 K363（kaito 天王寺・岡山「毛利勝永が2体出てきた」・全戦）：列の将は、同じ名の将が既に本物で生きていれば付けない（同じ名が二人並ばない）
  if (leaders && leaders.length) leaders = leaders.filter((nm) => !rt.army.units.some((u) => u.alive && !u.gone && u.name === nm));
  if (leaders && leaders.length) m.list = [...leaders.map((nm) => ({ type: 'busho', n: 1, o: { name: nm, _fjLeader: true, ...(rt.def.noHorse ? { horse: false } : {}) } })), ...m.list];
  const g = o.team === 1 ? enemyGroup(rt, m.o, m.list) : allyGroup(rt, m.o, m.list);
  if (g) { g.stay = true; g.order = 'hold'; g._far = true; }
  // 11/16 MacBook天王寺-厚み（K315「名のある武将は全員馬に」）：列の将は撃ち合いで馬を撃たれて徒になっていた（天王寺 330秒で秋田・浅野が徒）。将の馬だけ倒れにくく（討たれれば落ちる）
  if (g && leaders && leaders.length) for (const u of g.units || []) if (u.type === 'busho' && leaders.includes(u.name)) { u.horseMax = 1400; u.horseHp = 1400; u._fjLeader = true; }
  return g;
}

// 11/13 K285（kaito「近づいたら空っぽ」）：歩いて近づく間ずっと、本人の前（向きの 60°内）60m に本物が 40 人以上いる形にする。
//   足りなければ、前 45m に本物の備を一組ずつ置く（敵の側へ向かうなら敵・味方の側なら味方）。置いた備は持ち場で待ち、本人が近づけば斬り合う。
//   本物の上限（cap）に達していたら、本人から 100m 以上先の名無しの兵を外して場所を空ける。
export function frontFill(rt, o) {
  const F = rt.flags, me = rt.player?.u;
  if (!me?.alive || rt.over || !o.active(rt)) return;
  if (typeof window !== 'undefined' && window.__apx && window.__apx.noreserve) return;
  const S = F._ff || (F._ff = { t: 0, n: 0, groups: [] });
  if (S.t > rt.t) return;
  S.t = rt.t + 3;
  const cap = o.cap ?? rt.def.realCap ?? 250, want = o.want ?? 40;
  const yaw = rt.player.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  let n = 0, front = 0, foeF = 0, nearest = null, nd = 1e9;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone) continue; n++;
    if (u.isPlayer) continue;
    const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < 60 && (dx * fx + dz * fz) > 0.5 * d) { front++; if (u.team !== me.team) foeF++; }
    if (u.team !== me.team && !u.fleeing && d < nd) { nd = d; nearest = u; }
  }
  // def.frontFillFoe：前を敵の本物だけで数える（味方で前が埋まる戦。稲葉山の町を焼く段 11/15 K338）
  //   11/18 クラウド k365-cloud-13：段ごとに決める戦のため、関数（rt を受ける）でもよい（野田福島の浅瀬の岸の段だけ）
  const foeOnly = typeof rt.def?.frontFillFoe === 'function' ? rt.def.frontFillFoe(rt) : rt.def?.frontFillFoe;
  if ((foeOnly ? foeF : front) >= want || S.n >= (o.limit ?? 30)) return;
  // 前が敵の側か（一番近い敵が前の向きにあれば敵）
  let enemySide = true;
  if (nearest) { const dx = nearest.pos.x - me.pos.x, dz = nearest.pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1; enemySide = (dx * fx + dz * fz) / l > 0.3; }
  // u.keepReal：持ち場を守る本物（設楽原の柵の鉄砲など・K119）は外さない。外すと遠い口の柵が空になる
  // 11/15 iMac三十四（K210）：一組（敵28・味方24。携帯は半分）を足しても上限を越えない時だけ足す（上限の手前で足して 290→318 になっていた。設楽原）
  const room = TOUCH ? 14 : 28;
  if (n + room > cap) {
    n -= pruneFar(rt, me, 30, (u) => !(((u.pos.x - me.pos.x) * fx + (u.pos.z - me.pos.z) * fz) > 0));
    if (n + room > cap) return;
  }
  const RO = rt.def?.reserveOk;
  // 戦の定義に置き場の決まりが無い時、敵の新手は「行き先の印より遠く」へは置かない（11/14 クラウドゆ：本人の向く先へ置かれ続けた新手を act bot が追い、
  //   印から離れて任務が止まった。小田原 石垣山へ162m までしか寄れず切り上げ・山中城 本丸の松田に66m・忍城 堰から150m。印の手前と周りの層はそのまま。本人が印に立つ守りの段でも前45〜60m に置けるよう印から65m までは許す）
  const MK = !RO && enemySide ? (() => { let best = null, bd = 1e9; for (const m of rt.markers || []) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (!q || !Number.isFinite(q.x)) continue; const d = Math.hypot(q.x - me.pos.x, q.z - me.pos.z); if (d < bd) { bd = d; best = q; } } return best ? { q: best, d: bd } : null; })() : null;
  // 11/16 iMac：def.reserveBox（戦う者の範囲）は前を埋める備にも当てる（長久手：壁 x=158 の外 188 に置かれ、毎コマ引き戻され 179 回飛んだ）
  const FB = rt.def?.reserveBox;
  // 11/17 クラウドイ四（志賀 act bot：前を埋める新手が湖べり x=100〜116 に立ち、一息で 93 へ引き戻され飛んだ）：戦の reserveBound（置けない所・寄せ先）は前を埋める備にも当てる
  const RB = rt.def?.reserveBound;
  const okAt = (p) => (!RB || ((b) => b && b.x === p.x && b.z === p.z)(RB(p))) && clearOfSolids(rt, p) && (!rt.world.half || Math.max(Math.abs(p.x), Math.abs(p.z)) <= rt.world.half - 24) && (!rt.def?.moveLim || Math.max(Math.abs(p.x), Math.abs(p.z)) <= rt.def.moveLim - 24) && (!FB || (Math.abs(p.x) <= FB.xw && p.z >= FB.zn && p.z <= FB.zs)) && rt.world.walkable?.(p.x, p.z) !== false && !rt.army.wallBetween(me.pos, -1, p) && (!RO || RO(rt, p, enemySide)) &&
    (!MK || Math.hypot(p.x - MK.q.x, p.z - MK.q.z) <= Math.max(65, MK.d + 10));
  for (const k of [45, 36, 52, 60]) {
    const p = { x: me.pos.x + fx * k, z: me.pos.z + fz * k };
    if (!okAt(p)) continue;
    const mk = enemySide ? o.enemy : o.ally; if (!mk) return;
    const g = outOfSolids(rt, mk(rt, p, Math.atan2(-fx, -fz)));
    if (g) { g.stay = true; g._rsv = true; S.n++; S.groups.push(g); return; }
  }
}

// 11/13 K074（kaito「構えの兵が敵の前で突っ立つ・15m 内は斬り合う」）：待つ備（_rsv）・置き場の備（_far）は、敵が 18m 内に来たら 待ちを解いて斬り合いへ（stay を解き、攻めの下知）。
//   測り＝天王寺で「敵まで15m内・速さ 0.3m/s 未満・斬り合いも狙いも無い」兵が 平均 23・最大 70 いた（待つ備・置き場の備が 狙いの範囲 2〜5m で立っていた）。
export function engageNear(rt) {
  const F = rt.flags; if (F._enT > rt.t) return; F._enT = rt.t + 1.5;
  const units = rt.army.units;
  for (const g of rt.army.groups) {
    if (!(g._far || g._rsv || g.isReserve) || !g.stay || g.routed || !g.units) continue;
    // 11/18 cloud-06（墨俣 act bot 3回中2回倒れ）：筋書きが待たせる間（o.wait＝墨俣の運び）の待つ備は、十八 m に敵が来ても解かない。
    //   解くと二陣が寄せの口へ回り、柵の外の本人を運びの段で囲んで倒した（296秒・斎藤の二陣）
    if (g.isReserve && F._dr?.wait?.(rt) && F._dr.E.includes(g)) continue;
    const c = g.center(); if (!c) continue;
    let near = false;
    for (const u of units) { if (!u.alive || u.gone || u.team === g.team || u.fleeing || u.isCourier || u.civ) continue; if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 18) { near = true; break; } }
    if (near) { g.stay = false; g.order = 'attack'; g.aggro = 18; g.seekRange = 26; g.dest = null; g.path = null; g._apCharge = false; }
  }
  // 11/17 K358（桶狭間 act bot：今川の本陣・井伊の備えの「守り」の兵が本人の三 m 内で八回、六秒何もしなかった）：
  //   本人の三・五 m 内で狙いも振りも無い敵は、二度続けて見つけたら（三秒）本人へ打ち掛かる（順番待ちは player_pressure が決める）
  const P = rt.player?.u;
  if (P?.alive && !P.noTarget && !rt.over) for (const u of units) {
    if (!u.alive || u.gone || u.team === P.team || u.isPlayer || u.civ || u.isStruct || u.fleeing || u.noTarget || u.perch || u.target || u.atk || u.woundOut || u.type === 'dummy' || u.type === 'porter' || (u.type === 'gun' || u.type === 'bow') && !u.sidearm
      || Math.abs(u.pos.x - P.pos.x) > 3.5 || Math.abs(u.pos.z - P.pos.z) > 3.5 || Math.abs(u.pos.y - P.pos.y) > 1.8) { u._besideN = 0; continue; }
    if ((u._besideN = (u._besideN || 0) + 1) >= 2) { u._besideN = 0; u.target = P; u.moveTo = null; u.aiT = 1.5; }
  }
  // 11/18 cloud-06（見回り：賤ヶ岳・金ヶ崎などで『自分のすぐそばの敵の鉄砲・弓が6秒以上なにもしない』）：脇差の無い射手は本人の三歩半内では撃てず立つだけ。
  //   二度続けて見つけたら（三秒）、本人から離れる向きへ六歩下がって構え直す（近くで撃たせない・敵の数と強さは変えない）
  if (P?.alive && !P.noTarget && !rt.over) for (const u of units) {
    if (!u.alive || u.gone || u.team === P.team || u.fleeing || u.noTarget || u.perch || u.atk || u.woundOut || !(u.type === 'gun' || u.type === 'bow') || u.sidearm
      || Math.abs(u.pos.x - P.pos.x) > 3.5 || Math.abs(u.pos.z - P.pos.z) > 3.5 || Math.abs(u.pos.y - P.pos.y) > 1.8) { u._shooterN = 0; continue; }
    if ((u._shooterN = (u._shooterN || 0) + 1) < 2) continue;
    u._shooterN = 0;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    u.target = null; u.moveTo = { x: u.pos.x + dx / d * 6, z: u.pos.z + dz / d * 6 }; u.aiT = 3;
  }
  // 11/16 iMac（戸次川・山崎・千石堀・長久手の act bot）：出た新手（stay を解いた待つ備）が、遠い的（本人・名のある将）へ向かう道で塀・林・柵に掛かり、
  //   八 m 内の敵を前に二十秒立った（山崎 393秒 14回 など）。八秒その場を動かない者は、的を外して目の前の敵と斬り合う。考えを間引いた遠くの兵は触らない
  const t = rt.t;
  // 11/18 K365（全戦の棒立ち・cloud-06）：出た新手（攻め）が遠景扱いのまま、六十 m 内の敵を前に持ち場で立ち続けた（賤ヶ岳 27件・野田福島 13件・三方ヶ原の「味方の新手」）。
  //   新手の組の中心が十二秒で一 m も動かず、六十 m 内に敵がいれば、持ち場を敵の四 m 手前へ移す（遠景の兵も持ち場ごと寄る）
  for (const g of rt.army.groups) {
    if (!(g._rsv || g.isReserve) || g.stay || g.routed || !g.count || g.civ || g.order !== 'attack' || g.focus) { if (g) g._rsvSt = null; continue; }
    const c = g.center(); if (!c) continue;
    const st = g._rsvSt;
    if (!st || Math.hypot(c.x - st.x, c.z - st.z) > 1) { g._rsvSt = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - st.t < 12) continue;
    st.t = rt.t;
    const e = rt.army.nearestEnemy({ pos: c, team: g.team }, 60, (o) => !o.fleeing && !o.noTarget && !o.isStruct && !o.civ);
    if (!e) continue;
    const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
    if (d < 8) continue;
    g.anchor = { x: e.pos.x - dx / d * 4, z: e.pos.z - dz / d * 4 }; g.dest = null; g.path = null;
  }
  // 11/18 K365（全戦の棒立ち・cloud-06）：新手に限らず、攻め・道行き・移る下知の組（朝倉の追手の path・味方の手の attack など）も同じ形で
  //   八 m 内の敵を前に二十秒立った（act bot の「行き先があるのに20秒動かない兵」の多く）。持ち場を守る組・本人の組・城の中の守りは除く
  const moving = (g) => (g.order === 'attack' || g.order === 'path' || g.order === 'move') && !g.isPlayerSquad && !g.interiorHold && !g.fixed && !g.honjin;
  for (const g of rt.army.groups) {
    if (!((g._rsv || g.isReserve) || moving(g)) || g.stay || g.routed || !g.count || g.civ) continue;
    for (const u of g.units) {
      // 11/18 夜50-04（小谷 act bot：味方の兵が塀の向こうの的（20〜40m）を持ったまま、行き先へ歩けず二十秒立つ・(-45,-41)(-58,-86)(-62,-24)）：
      //   六m より遠い的を持つ者も見張り、八秒動かず的が塀の向こうなら、的を外して目の前の敵へ（いなければ考え直す）
      const farT = u.target && !u.target.isStruct && u.target.alive !== undefined && (!u.target.alive || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) > 6);
      if (!u.alive || u.gone || u.isPlayer || u.fleeing || u.target && !farT || u.atk || u.qualityAbstract || u.farSim || u.perch || (u.type === 'gun' || u.type === 'bow') && !u.sidearm) { u._rsvStill = null; continue; }
      const k = u._rsvStill;
      if (!k || Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 0.8) { u._rsvStill = { x: u.pos.x, z: u.pos.z, t }; continue; }
      if (t - k.t < 8) continue;
      k.t = t;
      if (farT && u.target.alive && !rt.army.wallBetween(u.pos, -1, u.target.pos)) continue;   // 塀の無い遠い的へは、歩みの遅れだけなので触らない
      const e = rt.army.nearestEnemy(u, 8, (o) => !o.fleeing && !o.noTarget && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 2 && !rt.army.wallBetween(u.pos, -1, o.pos));
      if (farT) u.target = null;
      // 11/19 クラウド kaito2（道明寺の照らし：薄田兼相と本人の一騎打ちの最中、薄田の隊の足軽がここで隊の的を外し「間合いが離れた」で切れた）：一騎打ちの隊の的は残す
      if (e) { if (!(rt.army.duel && rt.army.duel.foe.group === g)) g.focus = null; u.target = e; u.moveTo = null; u.aiT = 2; }
      else { u.moveTo = null; u.aiT = 0; }
    }
  }
  siegeUnstick(rt, t);
  if (!rt.def?.noStillUnstick) stillUnstick(rt, t);
}

// 11/18 クラウド29（司令塔の名指し・全戦共通）：行き先があるのに隊速0で立つ兵（金ヶ崎の明智の鉄砲足軽 path・山崎の鉄砲小組が本人2m で棒立ち・
//   根来の新手が塀の向こう69m の的へ attack のまま・長久手の三好の馬廻 move・井伊の騎馬の詰まり）。上の新手の直しは狙いを持つ兵・鉄砲を外すので、ここで拾う。
//   八秒ほとんど動かなければ：①二・五 m 内の敵に刃（鉄砲は撃つ）を向ける ②狙いが十二 m より遠く塀の向こうなら、塀の無い三十 m 内の敵へ替える
//   ③二度続けて動けなければ、行き先の方から左右へ振った歩ける所へ一度歩かせて道を引き直す。戦ごとに def.noStillUnstick で切れる
const STILL_ORD = new Set(['attack', 'path', 'move', 'assault', 'charge']);
function stillUnstick(rt, t) {
  const A = rt.army, W = rt.world;
  if (rt.flags._stlT > t) return; rt.flags._stlT = t + 1;
  for (const g of A.groups) {
    if (!g.count || g.routed || g.civ || g.stay || g.isPlayerSquad || g.isRunner || g.interiorHold || g.fixed || !STILL_ORD.has(g.order)) continue;
    for (const u of g.units) {
      if (!u.alive || u.gone || u.isPlayer || u.fleeing || u.atk || u.swing || u.qualityAbstract || u.farSim || u.perch || u.climb || u.naka || u.woundOut || u.isStruct || u.noTarget) { u._stl = null; continue; }
      const k = u._stl;
      if (!k || Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 0.8) { u._stl = { x: u.pos.x, z: u.pos.z, t, n: 0 }; continue; }
      if (t - k.t < 8) continue;
      k.t = t; k.n++;
      const ok = (o) => !o.fleeing && !o.noTarget && !o.isStruct && !o.civ && Math.abs(o.pos.y - u.pos.y) < 2;
      const e = A.nearestEnemy(u, 2.5, (o) => ok(o) && !A.wallBetween(u.pos, u.team, o.pos));
      if (e) { u.target = e; u.moveTo = null; u.aiT = 2; continue; }
      const tg = u.target?.alive ? u.target : g.focus?.alive ? g.focus : null;
      if (tg && !tg.isStruct && Math.hypot(tg.pos.x - u.pos.x, tg.pos.z - u.pos.z) > 12 && (k.n > 1 || A.wallBetween(u.pos, u.team, tg.pos))) {
        const n = A.nearestEnemy(u, 30, (o) => o !== tg && ok(o) && !A.wallBetween(u.pos, u.team, o.pos));
        if (n) { u.target = n; const dx = n.pos.x - u.pos.x, dz = n.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1; u.moveTo = { x: n.pos.x - dx / dl * 1.4, z: n.pos.z - dz / dl * 1.4 }; u.aiT = 2; continue; }
      }
      // 11/18 クラウド29（止まりの型を数えた：筋書き50・着いて待つ20・持ち場8・歩けず1）：攻めの下知のまま持ち場に着いて、二十五 m 内の敵を前に待つ兵は、その敵へ寄って斬り合う
      if (!u.target && PUSH.has(g.order) && !(u.type === 'gun' || u.type === 'bow') && (!u.moveTo || Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 5)) {   // 11/19 クラウド29：信貴山 act bot 39秒 attack の足軽が行き先 4m 手前・敵18m で二十秒止まった＝『着いた』を 2.5m から 5m へ
        const n = A.nearestEnemy(u, 25, (o) => ok(o) && !A.wallBetween(u.pos, u.team, o.pos));
        if (n) { u.target = n; const dx = n.pos.x - u.pos.x, dz = n.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1, sd = (u.id % 2 ? 1 : -1) * 1.2; u.moveTo = { x: n.pos.x - dx / dl * 1.4 - dz / dl * sd, z: n.pos.z - dz / dl * 1.4 + dx / dl * sd }; u.aiT = 2; continue; }
      }
      const mt = u.moveTo;
      if (k.n < 2 || !mt || Math.hypot(mt.x - u.pos.x, mt.z - u.pos.z) < 2) continue;
      // 11/19 クラウド29（信貴山 act bot 48秒：attack の足軽が行き先 3m 手前で、敵は塀の向こう 31m・二十秒止まる）：五 m 内の行き先に歩けないなら、着いたと見なす
      if (Math.hypot(mt.x - u.pos.x, mt.z - u.pos.z) < 5) { u.moveTo = null; u.aiT = 3; k.n = 0; continue; }
      const base = Math.atan2(mt.x - u.pos.x, mt.z - u.pos.z), sd = u.id % 2 ? 1 : -1;
      for (const da of [1.1, -1.1, 1.8, -1.8]) {
        const a = base + da * sd, r = u.mounted ? 7 : 5, px = u.pos.x + Math.sin(a) * r, pz = u.pos.z + Math.cos(a) * r;
        if (W?.walkable?.(px, pz) === false || A.wallBetween(u.pos, -1, { x: px, y: u.pos.y, z: pz })) continue;
        if (Math.abs((W?.heightAt?.(px, pz) ?? u.pos.y) - u.pos.y) > 2.5) continue;
        u.moveTo = { x: px, z: pz }; u.aiT = 2.5; k.n = 0; break;
      }
      if (k.n >= 3) { u.aiT = 0; k.n = 0; }   // 11/19 クラウド29：回り込む先が四つとも塞がれて三度目なら、考え直させる
    }
  }
}

// 11/17 クラウド kaito2（K150 城攻め全般の詰まり）：城攻めの戦で、攻めの下知（attack・assault・charge）の槍・刀の兵が、
//   塀・柵・門の前で八秒動かず狙いも無い時：①塀の向こうでない八 m 内の敵と斬り合う ②目の前の敵が塀・柵・門の向こうなら、その柵・門（打ち破れる物）を打つ
//   ③どちらも無ければ考え直させる。act bot の「敵を前に20秒止まった」（三木の大村坂で羽柴の槍組が柵ぎわ 4〜6m の敵を前に立ち尽くした）を減らす。
//   石垣（壊せない物）は打たない。考えを間引いた遠くの兵・持ち場（hold・yari）の守り手・本人の組・梯子と櫓の上の者は触らない
// 11/17：前は SIEGE_EXTRA で鳥取・伊賀・箕作・大河内・野田福島・金ヶ崎・越前一向・木ノ芽も入れていたが、箕作の act bot が物見の段から
//   止まり 1080秒で時間切れになった（直し無しなら 267秒で達成・cloud-23 の見つけ）。確かめた城攻め（SIEGE_RESERVE と siegePath の戦）だけにする
const PUSH = new Set(['attack', 'assault', 'charge']);
// 11/17 ニ三（比叡山 act bot 491秒 新手11人が (-50,-72) に10組重なる）：十m 以上遠い敵を狙うだけの新手の attack も、斬り合いでなければ散らす
// 討たれた・倒れた相手を持ったままの兵（考えを止めた絵の兵など）を『斬り合い中』と数えない（11/18 夜50-04）
const liveFoe = (t) => !!t && t.alive !== false && !t.gone && !t.downed;
// 道行き・移る・退く組は、十m 内に生きた相手を持つ者がいる時だけ『斬り合い中』（小谷 act bot 658秒 cut：羽柴の後詰19人が path のまま重なり、
//   遠い相手を時々持つ一人のせいで四秒の待ちが毎回消え、三十九秒散らせなかった）
const nearFoe = (u, r) => liveFoe(u.target) && Math.hypot((u.target.pos?.x ?? 1e9) - u.pos.x, (u.target.pos?.z ?? 1e9) - u.pos.z) < r;
function holdUnstack(rt, t) {
  const A = rt.army;
  // 11/18 クラウドな（小谷 act bot 562秒 cut (-8,-115) 新手12人が attack のまま重なる）：斬り合う者が一人もいない新手の attack も同じに散らす
  // 11/18 夜50-04（小谷 act bot 552秒 cut (-1,22) 味方の新手10人・絵の兵8 が attack のまま重なり『散らし 無』）：考えを止めた絵の兵は討たれた相手を u.target に持ったままで、
  //   それが四m 内に倒れていると『斬り合い中』と数えて散らさなかった。生きて立つ相手だけを数える
  // 11/18 クラウド29：「待て」（hold）の組が十秒、兵の半分より多く 0.5m 内に重なったまま（有岡 act bot 191秒 味方の新手12人 (-412,-81) 45組・岩村・伏見・一宮も）なら、
  //   その場で一人ずつ渦の形（1.3m 間）に散らす。斬り合い中・考えを間引いた遠くの兵・本人の組は触らない
  for (const g of A.groups) {
    if (// 11/17 クラウドい（山中城 act bot 96秒 山内一豊の隊40人が path のまま (11,199) に46組重なる）：狙い・斬り合いの無い path の大きな組（20人〜）も同じに散らす
    !(g.order === 'hold' || ((g._rsv || g.isReserve || rt.def?.stackAllAttack) && g.order === 'attack' && !g.units.some((u) => u.alive && ((u.atk && !(rt.def?.stackAllAttack && (u.atk.ranged || u.atk.bow))) || (u.target && u.target.alive !== false && !u.target.gone && !u.target.downed && Math.hypot((u.target.pos?.x ?? 1e9) - u.pos.x, (u.target.pos?.z ?? 1e9) - u.pos.z) < (rt.def?.stackAllAttack ? 4 : 10))))) || (g.order === 'path' && (g.count >= 20 || (rt.def?.stackPath && g.count >= 5)) && !g.units.some((u) => u.alive && (u.atk || nearFoe(u, 10)))) || (rt.def?.stackMove && g.order === 'move' && !g.units.some((u) => u.alive && (u.atk || nearFoe(u, 10)))) || (rt.def?.stackRetreat && g.order === 'retreat' && !g.units.some((u) => u.alive && (u.atk || nearFoe(u, 10))))) || g.isPlayerSquad || g.routed || !g.count || g.civ || g.count < 5) { g._sgHd = null; continue; }
    // 数えるのは bot_stack.js と同じ兵（狙いを持って立つ兵も数える）。散らすのは振りの最中・遠くの兵・塀の上・登りの途中でない者だけ
    const al = g.units.filter((u) => u.alive && !u.gone && !u.isPlayer && (!u.mounted || (g.order === 'retreat' && rt.def?.stackRetreat)) && !u.fleeing && !u.downed && !u.woundOut);
    let close = 0;
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { const dx = al[i].pos.x - al[j].pos.x, dz = al[i].pos.z - al[j].pos.z; if (dx * dx + dz * dz < 0.25 && Math.abs(al[i].pos.y - al[j].pos.y) < 1.5) close++; }
    if (al.length < 5 || close <= al.length * 0.5) { g._sgHd = null; continue; }
    if (!g._sgHd) { g._sgHd = t; continue; }
    if (t - g._sgHd < 4) continue;   // 11/17 クラウドお：待ちを六秒から四秒へ（比叡山・箕作・有岡の act bot で新手が六秒重なって見えた）
    g._sgHd = null; const sgPrev = g._sgAt; g._sgAt = t;
    let cx = 0, cz = 0; for (const u of al) { cx += u.pos.x; cz += u.pos.z; } cx /= al.length; cz /= al.length;
    // 11/17 ネ三（小谷 act bot 241秒・中学生の bot：味方の新手11人が歩けない所 (-20,-108) に重なって立った）：渦の中心が歩けない地面なら、近くの歩ける所（高さ差3m内）へ寄せる
    if (rt.world?.walkable?.(cx, cz) === false) {
      let done = false;
      for (let rr = 2; rr <= 14 && !done; rr += 2) for (let k = 0; k < 12 && !done; k++) {
        const qx = cx + Math.cos(k * 0.5236) * rr, qz = cz + Math.sin(k * 0.5236) * rr;
        if (rt.world.walkable(qx, qz) !== false && Math.abs((rt.world.heightAt?.(qx, qz) ?? 0) - (rt.world.heightAt?.(cx, cz) ?? 0)) < 3 && !A.wallBetween?.({ x: cx, y: al[0].pos.y, z: cz }, al[0].team, { x: qx, z: qz })) { cx = qx; cz = qz; done = true; }
      }
    }
    // 11/18 ユ三（稲生 act bot 221・251秒 林秀貞の備14人が見えない壁 z=-146 の際で散らしても壁に押されて一列に戻る）：def.unstackBox のある戦は、渦の中心を壁から六m 内へ寄せる
    const ub = rt.def?.unstackBox;
    if (ub) { cx = Math.max(ub.x0 + 6, Math.min(ub.x1 - 6, cx)); cz = Math.max(ub.z0 + 6, Math.min(ub.z1 - 6, cz)); }
    // 11/18 クラウド29（小谷 act bot 728秒：信長の旗本12人が hold のまま、33m 先の塞がれた持ち場へ押し続けて重なり直した）：四十五秒内に二度目の重なりなら、持ち場を四十五m 内まで今の所へ移す
    const holdFar = sgPrev != null && t - sgPrev < 45 ? 45 : 20;
    if (g.order === 'hold' && g.anchor && Math.hypot(g.anchor.x - cx, g.anchor.z - cz) < holdFar) { g.anchor.x = cx; g.anchor.z = cz; }   // 待ちの持ち場の印が重なった一点のままだと、散らしても兵が戻る
    al.forEach((u, i) => {
      if (u.atk || u.perch || u.climb) return;
      const r = 1.3 * Math.sqrt(i + 0.5), a = i * 2.4;
      let p = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
      if (A.wallBetween?.({ x: cx, y: u.pos.y, z: cz }, u.team, p) || rt.world?.walkable?.(p.x, p.z) === false) p = { x: cx + Math.cos(a) * 0.8, z: cz + Math.sin(a) * 0.8 };
      // 11/17 ネ三（小谷 act bot：cut の段 (7,-114) で味方の新手13人が37組重なり）：遠くで考えを間引かれた兵は moveTo が効かず重なったままだった。
      //   本人から三十m 超の遠い兵は、同じ渦の形へ直に置く（見えない遠さなので跳ねて見えない）。近い兵は従来どおり歩かせる
      const me = rt.player?.u?.pos;
      const again = (sgPrev != null && t - sgPrev < 45) || !!g.fixed;   // 散らしても四十五秒内にまた重なった組は、近い兵も直に置く（11/17 ネ三：中学生の bot で climb (-32,-124) の新手12人が散らしても戻った）   // 11/18 ナ五：fixed の組（刀根坂の柴田勝家の手 406秒 28人46組）は持ち場へ引き戻されるので初めから直に置く
      if (((u.farSim || u.qualityAbstract) && me && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 30 || again || u.qualityAbstract) && rt.world?.walkable?.(p.x, p.z) !== false && Math.abs((rt.world.heightAt?.(p.x, p.z) ?? u.pos.y) - u.pos.y) < ((u.farSim || u.qualityAbstract) && !u.perch && !u.climb ? 3 : 1.2)) {   // 11/17 ネ三（小谷 act bot 391秒 cut (-48,-99) 軽い兵12人が散らしても戻る）：軽い兵は _farWant で歩くので直に置くしかない。坂の段差も三m まで許す
        // 11/17 ミ三（刀根坂 act bot 162秒 新手が9m一息に飛ぶ25回）：近くで直に置く兵は一回5mまで（見える所で跳ねない）。残りは歩かせる
        // 11/18 クラウドさ（伏見 act bot 230秒 本人から三十m 超の新手が9m一息に飛ぶ9回）：遠い兵も一回5mまで（三十m は携帯でも見える。散らしは六秒ごとに続くので数回で渦に揃う）
        // 11/18 K365 cloud-33（千石堀 act bot：秀吉の本陣の足軽が本人の近くで6〜10m 飛んだ）：本人から三十m 内の兵は一回2.5mまで
        const dd = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
        // 11/18 K168 クラウド kaito2（岐阜 600秒 471秒：見えない新手の侍が御殿の箱 (7,1) の縁から 0.54m 内に置かれた）：直に置く先が建物・塀の当たりの内か、そこまでの線が壁を越える時は置かずに歩かせる
        const cap0 = u.qualityAbstract ? (g.fixed ? 4 : 5) : (me && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 30 ? 5 : 2.5);
        const bad = (q) => { const dq = Math.hypot(q.x - u.pos.x, q.z - u.pos.z), k0 = dq > cap0 ? cap0 / dq : 1, nx = u.pos.x + (q.x - u.pos.x) * k0, nz = u.pos.z + (q.z - u.pos.z) * k0; return A.solids?.length && A.solidBlocked && (A.solidBlocked(u, nx, nz) || A.solidCrossed?.(u, u.pos.x, u.pos.z, nx, nz)) || (k0 < 1 ? A.wallBetween?.(u.pos, -1, { x: nx, z: nz }) : A.wallBetween?.({ x: cx, y: u.pos.y, z: cz }, u.team, q)) || rt.world?.walkable?.(nx, nz) === false; };   // 塀の見方は元の渦と同じ（芯から置く先へ）。途中で止まる時だけ今の足から
        if (bad(p)) {   // 渦の形の他の向き（同じ半径）を六つ試す。どれも塞がる時は置かない（比叡山 act bot 397秒：絵の兵の新手5人が箱の脇で重なったまま）
          let q = null; for (let k = 1; k < 7 && !q; k++) { const c = { x: cx + Math.cos(a + k * 0.9) * r, z: cz + Math.sin(a + k * 0.9) * r }; if (!bad(c)) q = c; }
          if (!q) { if (!u.farSim && !u.qualityAbstract) { u.moveTo = p; u.aiT = 3; } return; }
          p = q;
        }
        { const dq = Math.hypot(p.x - u.pos.x, p.z - u.pos.z), k0 = dq > cap0 ? cap0 / dq : 1; u._cpx = u.pos.x + (p.x - u.pos.x) * k0; u._cpz = u.pos.z + (p.z - u.pos.z) * k0; }
        const dd2 = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
        const cap = u.qualityAbstract ? (g.fixed ? 4 : 5) : (me && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 30 ? 5 : 2.5);   // 11/18 クラウドう（稲生 act bot 246秒 林秀貞の備の絵の兵 qualityAbstract12 が散らし1秒後も重なる）：本物でない絵の兵は跳ねても見えないので一回6mまで   // 11/18 ナ五：fixed の組（刀根坂の柴田の手）は歩く分と合わさって6m超に跳ねた。fixed は四mまで
        if (dd2 <= cap) { u.pos.x = p.x; u.pos.z = p.z; if (u.qualityAbstract || u.farSim) { const hh = rt.world.heightAt?.(p.x, p.z); if (hh != null && Math.abs(hh - u.pos.y) > 0.5) u.pos.y = hh; } return; }
        const kc = cap / dd2; u.pos.x += (p.x - u.pos.x) * kc; u.pos.z += (p.z - u.pos.z) * kc; u.moveTo = p; u.aiT = 3; return;
      }
      if (u.farSim || u.qualityAbstract) return;
      u.moveTo = p; u.aiT = 3;
    });
  }
}
function siegeUnstick(rt, t) {
  const id = rt.def && (rt.def.key || rt.def.id), A = rt.army;
  if (typeof location !== 'undefined' && /[?&]nounstick\b/.test(location.search)) return;   // 前後の比べ専用
  // 11/18 クラウド29（cloud-08：越前・志賀でも hold の重なり）：hold の散らしは野戦（FIELD_RESERVE）にも掛ける
  // 11/17 クラウド（天王寺・岡山の持ち主）：深い備を持たない戦も、def.holdUnstack で hold の散らしだけを使える（天王寺・岡山 511秒 将軍の旗本7人が (26,118) に重なる・連絡帳 11/19 12:30）
  if ((SIEGE_RESERVE.has(id) || FIELD_RESERVE.has(id) || rt.def?.siegePath || rt.def?.holdUnstack) && !rt.def?.noSiegeUnstick) holdUnstack(rt, t);
  if (!(SIEGE_RESERVE.has(id) || rt.def?.siegePath) || rt.def?.noSiegeUnstick || !A.wallAt) return;
  // 「行け」（move）の下知のまま十五秒ほとんど動かない組（行き先が塀・崖の向こうで着けない）は、着いた事にして今の所で構え直す（隊の並びに開く）。
  //   佐和山の act bot 456秒：味方の新手11人が move のまま (-8,-93) の一点に重なって止まった（siege_path の使番・ally_goal の寄せの行き先が届かない所）
  for (const g of A.groups) {
    // 戦の筋書きが着いた時の続き（onArrive）を持つ組は触らない（箕作 11/17：物見の段の組を構え直させ、筋書きの続きを消して段が302秒止まった）
    if (g.order !== 'move' || g.onArrive || g.isPlayerSquad || g.isRunner || g.routed || !g.count || g.civ || g.team !== rt.player?.u?.team) { g._sgMv = null; continue; }
    const c = g.center(g._sgProbe || (g._sgProbe = {})), m = g._sgMv;
    if (!m || Math.hypot(c.x - m.x, c.z - m.z) > 1.5 || m.d !== g.dest) { g._sgMv = { x: c.x, z: c.z, t, d: g.dest }; continue; }
    if (t - m.t < 15) continue;
    // 筋書きの行軍（門の開くのを待つ列など）は触らない：兵の半分より多い組が 0.5m 内に重なっている時だけ（bot_stack.js と同じ物差し）
    const al = g.units.filter((u) => u.alive && !u.gone && !u.mounted && !u.fleeing);
    let close = 0;
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { const dx = al[i].pos.x - al[j].pos.x, dz = al[i].pos.z - al[j].pos.z; if (dx * dx + dz * dz < 0.25) close++; }
    if (al.length < 5 || close <= al.length * 0.5) { m.t = t; continue; }
    g._sgMv = null;
    const foe = A.nearestEnemy(g.units.find((u) => u.alive) || rt.player.u, 30, (o) => !o.fleeing && !o.isStruct && !o.civ && !o.noTarget);
    g.dest = null;
    if (foe) { g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 30); }
    else { g.order = 'hold'; if (g.anchor) { g.anchor.x = c.x; g.anchor.z = c.z; } else g.anchor = { x: c.x, z: c.z }; }
    for (const u of g.units) if (u.alive && !u.fleeing) { u.moveTo = null; u.aiT = Math.min(u.aiT ?? 0, 0.3); }
  }
  for (const g of A.groups) {
    if (g._rsv || g.isReserve || g.stay || g.routed || !g.count || g.civ || g.isPlayerSquad || g.interiorHold || !PUSH.has(g.order)) continue;
    for (const u of g.units) {
      if (!u.alive || u.gone || u.isPlayer || u.name || u.fleeing || u.target || u.atk || u.qualityAbstract || u.farSim || u.perch || u.climb || u.naka || u.mounted || u.woundOut
        || (u.type === 'gun' || u.type === 'bow') && !u.sidearm) { u._sgStill = null; continue; }
      const k = u._sgStill;
      if (!k || Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 0.8) { u._sgStill = { x: u.pos.x, z: u.pos.z, t }; continue; }
      if (t - k.t < 8) continue;
      k.t = t;
      const e = A.nearestEnemy(u, 8, (o) => !o.fleeing && !o.noTarget && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 2 && !A.wallBetween(u.pos, u.team, o.pos));
      // 狙いを付けても、同じ敵に寄る数の決まり（crowdOk）で次の考えで外れて立ち続けた（三木の槍組・6m 先の敵）。目の前の敵の脇まで歩かせてから狙う
      if (e) { u.target = e; const dx = e.pos.x - u.pos.x, dz = e.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1, sd = (u.id % 2 ? 1 : -1) * 1.2; u.moveTo = { x: e.pos.x - dx / dl * 1.4 - dz / dl * sd, z: e.pos.z - dz / dl * 1.4 + dx / dl * sd }; u.aiT = 2; continue; }
      const w = A.nearestEnemy(u, 12, (o) => !o.fleeing && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3);
      const ws = w && A.wallAt(u.pos, u.team, w.pos);
      if (ws && ws.alive && !ws.opened && !ws.noTarget && ws.maxHp < 1e8 && !/竹束|土俵|仕寄/.test(ws.name || '') && (!A.distTo || A.distTo(u, ws) < 6)) { u.target = ws; u.moveTo = null; u.aiT = 3; continue; }
      u.moveTo = null; u.aiT = 0;
    }
  }
}
