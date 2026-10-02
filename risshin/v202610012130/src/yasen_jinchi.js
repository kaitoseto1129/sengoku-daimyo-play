// 野戦陣地の共通部品（yasen_jinchi.js）：長篠・設楽原 統合版 要件
// docs/shitaragahara-unified-spec.md 5〜10・11〜23・56〜59 章を、設楽原専用でなく他の野戦でも使える部品にした物。
// 防御区画（柵の区画タグ・陥落の広さ）・鉄砲の三班交互射撃（三段で撃て）・射界・射線の遮り・予備を入れる判断。
// 今ある馬防柵（b_sunomata.js の buildBobosaku）・鉄砲の組（allyGroup）はそのまま使い、この上に薄く足す。
import { angleDiff } from './units.js';

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
const EACH = (bands, fn) => { for (const k of ['A', 'B', 'C']) for (const g of bands[k] || []) fn(g); };
// 構え：三班とも込めたまま待つ（まだ放たない）
export function kamaeBands(bands) { EACH(bands, (g) => { g.fire = true; g.holdFire = true; g._wantFire = false; }); }
// 放て：構えている班を一斉に放つ（一度きり）
export function volleyBands(bands) { EACH(bands, (g) => { g.holdFire = false; g._wantFire = true; }); }
// 撃ち方やめ：三班とも控えさせ、三段の輪も止める
export function ceaseBands(bands, state) { if (state) state.active = false; EACH(bands, (g) => { g.fire = false; g.holdFire = true; g._wantFire = false; }); }
// 三段で撃て：A→B→C→A…と、ずらして代わる代わる撃ち続ける。戻り値の state.active=false で止める
export function rollBands(rt, bands, o = {}) {
  const stagger = o.stagger ?? 2.2, reload = o.reload ?? 9;
  const state = { active: true };
  const fireOne = (k) => {
    if (!state.active) return;
    const gs = (bands[k] || []).filter((g) => g.count > 0);
    // 射線が味方の槍にふさがれていれば、この回はこの班を控えさせる（inAttack.losTick が毎コマ立てる _losBlocked）
    for (const g of gs) if (!g._losBlocked) { g.fire = true; g.holdFire = false; g._wantFire = true; }
    rt.after(1.1, () => { if (state.active) for (const g of gs) { g.holdFire = true; g._wantFire = false; } });
    rt.after(reload + Math.random() * 1.4, () => fireOne(k));
  };
  ['A', 'B', 'C'].forEach((k, i) => rt.after(i * stagger, () => fireOne(k)));
  return state;
}
// 班ごとの様子（HUD 用）：'WAIT'（控え）・'READY'（込め終わり、待ち）・'FIRE'（撃っている）
export function bandState(bands, k) {
  const gs = (bands[k] || []).filter((g) => g.count > 0);
  if (!gs.length) return null;
  if (gs.some((g) => g._wantFire && !g.holdFire)) return 'FIRE';
  if (gs.every((g) => g.holdFire)) return gs.every((g) => g.fire) ? 'READY' : 'WAIT';
  return 'READY';
}
// 班の残り（HUD の「A 班 READY 80%」の % 用）。組み分けた時の人数を覚えておき、今の人数との割合を返す
export function bandPct(bands, k) {
  const gs = bands[k] || [];
  let n0 = 0, n = 0;
  for (const g of gs) { if (g._bandN0 == null) g._bandN0 = g.count; n0 += g._bandN0; n += g.count; }
  return n0 ? Math.round((100 * n) / n0) : 0;
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
