// 野戦陣地の共通部品（yasen_jinchi.js）：長篠・設楽原 統合版 要件
// docs/shitaragahara-unified-spec.md 5〜10・11〜23・56〜59 章を、設楽原専用でなく他の野戦でも使える部品にした物。
// 防御区画（柵の区画タグ・陥落の広さ）・鉄砲の三班交互射撃（三段で撃て）・射界・射線の遮り・予備を入れる判断。
// 今ある馬防柵（b_sunomata.js の buildBobosaku）・鉄砲の組（allyGroup）はそのまま使い、この上に薄く足す。
import { angleDiff } from './units.js';
export { addFieldFence, buildFieldworks, fieldworkHeight } from './yasen_obstacles.js';

// ---------------- 防御区画（柵のタグ・陥落の広さ） ----------------
// fence（buildBobosaku の戻り値）へ、z の範囲で区画名を付ける。zones = [{ name, z0, z1 }]
export function tagZones(fence, zones) {
  for (const s of fence) {
    const mid = (s.seg[1] + s.seg[3]) / 2;
    const z = zones.find((zz) => mid >= zz.z0 && mid < zz.z1);
    s.zone = z ? z.name : null;
  }
}
// 区画・列の陥落の広さ（壊れた所がひと続きで何m続くか）。'none'|'small'|'medium'|'large'
export function gapSize(fence, zone, row = 0) {
  const segs = fence.filter((s) => s.zone === zone && s.row === row).sort((a, b) => a.seg[1] - b.seg[1]);
  let best = 0, run = 0;
  for (const s of segs) {
    const len = Math.abs(s.seg[3] - s.seg[1]);
    if (!s.alive) { run += len; best = Math.max(best, run); } else run = 0;
  }
  return { m: best, level: best < 1 ? 'none' : best < 7 ? 'small' : best < 15 ? 'medium' : 'large' };
}
// 区画の柵の残り（0〜1。HUD の細いゲージに使う）
export function zoneHp(fence, zone, row = 0) {
  const segs = fence.filter((s) => s.zone === zone && s.row === row);
  if (!segs.length) return 1;
  return segs.reduce((a, s) => a + (s.alive ? s.hp / s.maxHp : 0), 0) / segs.length;
}
// いちばん危ない区画（陥落が広い所）。無ければ null
export function worstZone(fence, zones, row = 0) {
  let best = null, bw = -1;
  for (const z of zones) {
    const g = gapSize(fence, z.name, row);
    const w = g.level === 'large' ? 3 : g.level === 'medium' ? 2 : g.level === 'small' ? 1 : 0;
    if (w > bw) { bw = w; best = z.name; }
  }
  return bw > 0 ? best : null;
}

// ---------------- 鉄砲の三班交互射撃（三段で撃て） ----------------
// guns（allyGroup の配列）を三つの班（A/B/C）へ振り分ける。各組に g.band を付けて返す
export function assignBands(guns) {
  const bands = { A: [], B: [], C: [] };
  const KEY = ['A', 'B', 'C'];
  guns.forEach((g, i) => { g.band = KEY[i % 3]; bands[g.band].push(g); });
  return bands;
}
const BAND_KEYS = ['A', 'B', 'C'];
const EACH = (bands, fn) => { for (const k of BAND_KEYS) for (const g of bands[k] || []) fn(g); };
// 傷で戦えない者・弾切れ・脇差へ替えた者は、装填待ちの人数へ含めない。
function gunAvailable(u) {
  return u.type === 'gun' && u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && !u.sidearm && u.gunAmmo !== 0;
}
function gunReady(u) { return gunAvailable(u) && !u.reload && !(u.cd > 0) && !(u.stagger > 0) && !(u.confused > 0); }
// 構え：三班とも込めたまま待つ（まだ放たない）
export function kamaeBands(bands) { EACH(bands, (g) => { g.fire = true; g.holdFire = true; g._wantFire = false; }); }
// 号令時に込め終えた者だけへ、一発分の許可を渡す。全員を永久には待たない。
function releaseGroup(g, minReady = 0.34) {
  if (!g.count || g.routed || g._losBlocked || g._fieldWait || g.order !== 'hold') return false;
  let n = 0, ready = 0, target = false;
  for (const u of g.units) if (gunAvailable(u)) {
    n++;
    if (gunReady(u)) {
      ready++;
      const t = u.target;
      if (t?.alive && !t.isStruct && !t.noTarget && t.team !== u.team) {
        const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
        if (d > 4 && d <= u.range) target = true;
      }
    }
  }
  if (!target || !ready || ready < Math.ceil(n * minReady)) return false;
  g.salvoAt = (g.salvoAt || 0) + 1; g.salvoOnly = true;
  for (const u of g.units) u.salvoAt = gunReady(u) ? g.salvoAt : null;
  g.fire = true; g.holdFire = false; g._wantFire = true;
  return true;
}
// 放て：準備のできた班を一斉に放つ（一度きり）。閉じる時刻は呼び出し側が決める。
export function volleyBands(bands) { EACH(bands, (g) => releaseGroup(g)); }
// 撃ち方やめ：三班とも控えさせ、交互射撃の輪も止める
export function ceaseBands(bands, state) {
  if (state) state.active = false;
  EACH(bands, (g) => { g.fire = false; g.holdFire = true; g._wantFire = false; g.salvoOnly = false; });
}
// 三班をずらして始め、以後は各組の実際の装填・被害・射線で次の射撃を決める。
export function rollBands(rt, bands, o = {}) {
  const stagger = o.stagger ?? 6.6, reload = Math.max(20, o.reload ?? 20);
  const state = { active: true };
  kamaeBands(bands);
  const fireOne = (g) => {
    if (!state.active || rt.over || rt.flags?.ending) return;
    if (!g.count || g.routed) return;
    const fired = releaseGroup(g);
    if (fired) rt.after(2.5, () => {
      if (state.active) { g.holdFire = true; g._wantFire = false; }
    });
    // 射手がいない時は短く調べ直す。装填は兵自身の二十秒以上の工程を通す。
    const disorder = Math.max(0, 70 - (g.morale ?? 100)) / 20;
    rt.after(fired ? reload + disorder + Math.random() * 2 : 0.8, () => fireOne(g));
  };
  for (let i = 0; i < BAND_KEYS.length; i++) for (const g of bands[BAND_KEYS[i]] || []) rt.after(i * stagger + Math.random() * 0.5, () => fireOne(g));
  return state;
}
// 班の様子は号令の旗ではなく、生きて戦える射手の実際の工程から読む。
export function bandState(bands, k) {
  let n = 0, ready = 0, reload = 0, aim = false, fire = false, enabled = false;
  for (const g of bands[k] || []) if (!g.routed) for (const u of g.units) if (gunAvailable(u)) {
    n++; if (gunReady(u)) ready++; if (u.reload) reload++;
    if (u.atk?.ranged) aim = true;
    if (u.fireT > 0) fire = true;
    if (g.fire !== false) enabled = true;
  }
  if (!n) return null;
  return fire ? 'FIRE' : aim ? 'AIM' : !enabled ? 'WAIT' : ready ? 'READY' : reload ? 'RELOAD' : 'WAIT';
}
// 生存率ではなく、戦える射手のうち弾込めを終えている割合。
export function bandPct(bands, k) {
  let n = 0, ready = 0;
  for (const g of bands[k] || []) if (!g.routed) for (const u of g.units) if (gunAvailable(u)) { n++; if (gunReady(u)) ready++; }
  return n ? Math.round(100 * ready / n) : 0;
}
export function bandLabel(state) {
  return state === 'FIRE' ? '発砲中' : state === 'AIM' ? '狙っている' : state === 'READY' ? '射撃できる' : state === 'RELOAD' ? '弾込め中' : '待機中';
}

// ---------------- 予備を入れる判断（長篠・設楽原 統合版 37・45 章） ----------------
// 区画ごとに自動で動く予備隊：いちばん危ない区画（柵の陥落が広い所）へ向き、別の区画が危なくなれば向き直る。
// reserve：allyGroup（order・dest・onArrive・anchor・facing を持つ、動ける組）。fence・zones は yasen_jinchi の物をそのまま渡す
// o：{ x（予備の並ぶ列の x）、home（危ない所が無い時に戻る場所）、facing、onMove(zoneNameOrNull) }
export function reserveTick(rt, reserve, fence, zones, dt, o = {}) {
  if (!reserve || !reserve.count || reserve.routed) return;
  reserve._rvT = (reserve._rvT ?? 0) - dt;
  if (reserve._rvT > 0) return;
  reserve._rvT = 2.5;
  const wz = worstZone(fence, zones);
  if (wz === (reserve._rvZone || null)) return;
  reserve._rvZone = wz;
  const facing = o.facing ?? Math.PI / 2;
  if (wz) {
    const z = zones.find((zz) => zz.name === wz);
    const mid = (z.z0 + z.z1) / 2;
    reserve.order = 'move'; reserve.dest = { x: o.x ?? reserve.anchor.x, z: mid };
  } else {
    reserve.order = 'move'; reserve.dest = { ...(o.home || reserve.anchor) };
  }
  reserve.onArrive = (g) => { g.order = 'hold'; g.anchor = { ...g.dest }; g.facing = facing; };
  if (o.onMove) o.onMove(wz);
}

// ---------------- 射界・射線の遮り ----------------
// group の正面から見て、点 (tx,tz) が射界（既定 弧80度＝±40度）の内か
export function inArc(g, tx, tz, half = (Math.PI * 40) / 180) {
  const c = g.center ? g.center() : g.anchor;
  if (!c) return true;
  const a = Math.atan2(tx - c.x, tz - c.z);
  return Math.abs(angleDiff(g.facing || 0, a)) < half;
}
// 鉄砲の組の前に、揉み合う味方の槍組がいれば撃てない（射線の遮り）。毎コマ呼ぶと g._losBlocked を立てる
export function losTick(guns, spears, dist = 7) {
  for (const g of guns) {
    const c = g.center ? g.center() : g.anchor;
    if (!c) { g._losBlocked = false; continue; }
    let blocked = false;
    for (const sp of spears) {
      if (!sp || !sp.count || sp.routed) continue;
      const sc = sp.center ? sp.center() : sp.anchor;
      if (!sc) continue;
      const dx = sc.x - c.x, dz = sc.z - c.z, d = Math.hypot(dx, dz);
      if (d < dist && d > 0.5 && Math.abs(angleDiff(g.facing || 0, Math.atan2(dx, dz))) < Math.PI / 3 && sp.order === 'attack') blocked = true;
    }
    g._losBlocked = blocked;
  }
}

// 設楽原以外の野戦（姉川・三方ヶ原・手取川・桶狭間）の鉄砲の組へ：毎コマ呼ぶと、前で味方の槍組が揉み合う間は撃たず、開けたらまた撃つ。
// 組へ班（A/B/C）も付ける。guns は allyGroup の配列（無い・全滅は無視）。
export function jinchiTick(rt, guns) {
  const gs = (guns || []).filter((g) => g && g.count > 0);
  if (!gs.length) return;
  if (!gs[0].band) assignBands(gs);
  const spears = rt.army.groups.filter((s) => s.team === gs[0].team && !s.isGun && s.count > 0);
  losTick(gs, spears);
  for (const g of gs) {
    if (g._losBlocked && g.fire !== false && !g.holdFire) { g.fire = false; g._losOff = true; }
    else if (!g._losBlocked && g._losOff) { g.fire = true; g._losOff = false; }
  }
}
