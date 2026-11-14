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
    const far = []; for (const u of rt.army.units) { if (!u.alive || u.gone || u.isPlayer || u.name || u.isSub || u.type === 'busho' || u.isStruct || u.civ || u.keepReal) continue; const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d > 100) far.push([d, u]); }
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
  // 立っている敵の門・木戸の 20m 内には置かない（門の前に立つと、木づちで打つ本人と味方の道を塞ぐ。越前・大滝寺 11/13 クラウドG：門の残り24で八十秒止まった）
  const gates = []; for (const st of rt.army.structs || []) if (st.alive && st.team !== me.team && st.seg && (st.gate || /門|木戸/.test(st.name || ''))) gates.push({ x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 });
  const byGate = (p) => gates.some((G) => Math.hypot(p.x - G.x, p.z - G.z) < 20);
  // def.reserveOk(rt, p, foe)：戦ごとに置いてよい所を決める（高遠：城兵の新手は大手門の内だけ。外の寄せ手の陣に城兵が湧いた。11/13 クラウドか）
  const RO = rt.def?.reserveOk;
  const okAt = (p, wallOk, foe = true) => inBox(p) && !byGate(p) && (!RO || RO(rt, p, foe)) && rt.world.walkable?.(p.x, p.z) !== false && (wallOk || !rt.army.wallBetween(me.pos, -1, p));
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
  const stall = !o.noStall && rt.t - S.mkT > 100;   // o.noStall：任務が時で進む戦（稲生・墨俣）は止めない（11/13 クラウドC）
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
    for (let k = foeBand < 20 ? 2 : 1; k > 0 && !yieldNow && n < cap && S.E.length < (foeBand < 48 ? 4 : 3) && S.nE < (o.enemy.limit ?? 10) && (foe70 < 60 || foeBand < 48); k--) {
      const pe = at(K, (S.E.length - 1.5) * 22), g = pe && o.enemy.make(rt, pe);
      if (!g) break;
      g.stay = true; g.fire = false; g.isReserve = true; S.E.push(g); S.nE++; made++; n += g.count || 0;
    }
    if (made) return;
  }
  if (o.ally && n < cap) {
    if (friend70 < 30 && S.A.length) { release(S.A, nearest); return; }
    if (!yieldNow && S.A.length < 2 && S.nA < (o.ally.limit ?? 8) && (friend70 < 40 || (o.allyBandMin && friendBand < o.allyBandMin))) {   // o.allyBandMin：味方が本人の30〜70mに薄い戦（桶狭間 11/13 クラウドそ）は、近くに多くても二陣を足す
      const ad = o.allyDist ?? 28, lt = (S.A.length - 0.5) * 22, pa = at(-ad, lt) || (ad > 24 ? at(-24, lt) : null) || (ad > 14 ? at(-14, lt) : null), g = pa && o.ally.make(rt, pa);   // 遠い所が置けない時は近めも試す（桶狭間 11/14 クラウドよ：-42 が置けず nA=1 のまま）
      if (g) { g.stay = true; g.fire = false; g.isReserve = true; S.A.push(g); S.nA++; }
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
  return { o: { ...T.o, ...extra, name, anchor: at, fixed: true, order: 'hold', aggro: 15, seekRange: 16 }, list: T.list.map((e) => ({ ...e, n: Math.max(1, Math.round(e.n * f)) })) };
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
  frontFill(rt, { limit: rt.def.frontFillLimit, active: (r) => r.t > (siege ? 60 : 6) && !r.hud?.introWaiting && r.phase !== 'end' && !r.over && !r.flags?.ending,
    // def.frontFillSize・def.reserveDmgMult：前を埋める城兵の人数と一太刀（既定は二十八人・そのまま）。高遠で新手が倒れの傷の一番だった（11/13 MB係四）
    enemy: T.E && ((r, at, face) => { const m = fromTpl(T.E, Math.round((r.def.frontFillSize ?? 28) / (TOUCH ? 2 : 1)), at, '新手', { width: 18, facing: face, ...(r.def.reserveDmgMult != null ? { dmgMult: r.def.reserveDmgMult } : {}) }); return enemyGroup(r, m.o, m.list); }),
    ally: T.A && ((r, at, face) => { const m = fromTpl(T.A, TOUCH ? 12 : 24, at, '味方の新手', { width: 16, facing: face, fullStrength: true, noRout: true }); return allyGroup(r, m.o, m.list); }) });
  depthReserve(rt, { bound: rt.def.reserveBound, canRelease: rt.def.reserveRelease, wallOk: siege && rt.def.reserveWallOk !== false, dist: rt.def.reserveDist, cap: rt.def.reserveCap, yieldTo: rt.def.reserveYield, yieldBack: rt.def.reserveYieldBack, active: (r) => r.t > (r.def.reserveFrom ?? (siege ? 90 : 45)) && !r.hud?.introWaiting && r.phase !== 'end' && !r.over && !r.flags?.ending,   // 設楽原は戦の間ずっと phase が brief のままなので、phase では止めない
    enemy: T.E && !rt.def.reserveNoEnemy && { limit: rt.def.reserveLimit ?? 24, make: (r, at) => { const m = fromTpl(T.E, Math.round((rt.def.reserveSize ?? 28) / (TOUCH ? 2 : 1)), at, '新手', { width: 18, dmgMult: r.def.reserveDmgMult ?? 0.7 }); return enemyGroup(r, m.o, m.list); } },
    ally: T.A && { limit: 12, make: (r, at) => { const m = fromTpl(T.A, TOUCH ? 12 : 24, at, '味方の新手', { width: 16, fullStrength: true, noRout: true }); return allyGroup(r, m.o, m.list); } } });
}

// 11/13 K285：見せかけの軽い兵の代わりに、同じ場所・同じ向きへ「本物の備」を置く（noFake の戦）。人数は元の 約 scale 分の一まで（上限 max）。
//   戦の中で動き・戦い・倒れる本物。遠くは qualityTier 2（army_quality.js）で骨無しの束・考えを間引いて安く描く。装束は bhelp.js が覚えた rt._tpl から。
export function realFromLight(rt, o, enemyGroup, allyGroup, scale = 0.12, max = 36, name = '遠くの備', leaders = null) {
  const T = rt._tpl && rt._tpl[o.team === 1 ? 'E' : 'A']; if (!T) return null;
  const n = Math.max(8, Math.min(max, Math.round((o.count || 100) * scale)));
  const m = fromTpl(T, n, { x: o.x, z: o.z }, name, { width: Math.max(8, Math.min(30, (o.w || 20) * 0.6)), facing: o.facing || 0, formation: T.o.formation || 'yari', stay: true, fixed: true, noRout: true, morale: 100, aggro: 15, seekRange: 16, ...(o.team === 1 ? {} : { fullStrength: true }) });
  // 布陣図の名（K287）：その列の大名・将の名を 名のある武将として一人ずつ付ける（真上・遠くでも頭の上に名が出る。同じ名は一つ）
  if (leaders && leaders.length) m.list = [...leaders.map((nm) => ({ type: 'busho', n: 1, o: { name: nm, horse: false } })), ...m.list];
  const g = o.team === 1 ? enemyGroup(rt, m.o, m.list) : allyGroup(rt, m.o, m.list);
  if (g) { g.stay = true; g.order = 'hold'; g._far = true; }
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
  if (front >= want || S.n >= (o.limit ?? 30)) return;
  // 前が敵の側か（一番近い敵が前の向きにあれば敵）
  let enemySide = true;
  if (nearest) { const dx = nearest.pos.x - me.pos.x, dz = nearest.pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1; enemySide = (dx * fx + dz * fz) / l > 0.3; }
  // u.keepReal：持ち場を守る本物（設楽原の柵の鉄砲など・K119）は外さない。外すと遠い口の柵が空になる
  if (n >= cap) {
    const far = []; for (const u of rt.army.units) { if (!u.alive || u.gone || u.isPlayer || u.name || u.isSub || u.type === 'busho' || u.isStruct || u.civ || u.keepReal) continue; const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d > 100 && !(((u.pos.x - me.pos.x) * fx + (u.pos.z - me.pos.z) * fz) > 0)) far.push([d, u]); }
    far.sort((a, b) => b[0] - a[0]); let k = 0; for (const [, u] of far) { if (k >= 30) break; try { rt.army.despawn(u); k++; } catch (e) { /* 次へ */ } } n -= k;
    if (n >= cap) return;
  }
  const RO = rt.def?.reserveOk;
  const okAt = (p) => (!rt.world.half || Math.max(Math.abs(p.x), Math.abs(p.z)) <= rt.world.half - 24) && rt.world.walkable?.(p.x, p.z) !== false && !rt.army.wallBetween(me.pos, -1, p) && (!RO || RO(rt, p, enemySide));
  for (const k of [45, 36, 52, 60]) {
    const p = { x: me.pos.x + fx * k, z: me.pos.z + fz * k };
    if (!okAt(p)) continue;
    const mk = enemySide ? o.enemy : o.ally; if (!mk) return;
    const g = mk(rt, p, Math.atan2(-fx, -fz));
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
    const c = g.center(); if (!c) continue;
    let near = false;
    for (const u of units) { if (!u.alive || u.gone || u.team === g.team || u.fleeing || u.isCourier || u.civ) continue; if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 18) { near = true; break; } }
    if (near) { g.stay = false; g.order = 'attack'; g.aggro = 18; g.seekRange = 26; g.dest = null; g.path = null; g._apCharge = false; }
  }
}
