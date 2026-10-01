// 隊（class Group：陣形と持ち場）と兵一人（class Unit）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { TYPES } from './units_data.js';
import * as THREE from 'three';

// ---------------- 部隊・兵 ----------------
let nextId = 1;

// 陣形の呼び名（号令・軍配の札に使う）。魚鱗・鶴翼は足軽大将から
export const FORM_JA = { line: '横陣', column: '縦陣', loose: '散開', yari: '槍衾', dense: '密集', march: '行軍', gyorin: '魚鱗', kakuyoku: '鶴翼' };

export class Group {
  constructor(o) {
    Object.assign(this, {
      team: 0, faction: 'oda', name: '', order: 'hold', formation: 'line', width: 0, spacing: 1.5,
      anchor: { x: 0, z: 0 }, facing: 0, dest: null, path: null, pathIdx: 0, speed: 2.2,
      aggro: 10, seekRange: 45, morale: 100, noRout: false, routed: false,
      fleeDir: { x: 0, z: -1 }, flankHits: 0, flankAwarded: false, dmgMult: 1, defMult: 1,
      isPlayerSquad: false, focus: null, fire: true, leader: null, onRout: null, assault: null, label: '',
    }, o);
    this.fleeSet = !!(o && o.fleeDir);   // 逃げる向きを戦の定義が決めたか（決めていなければ、崩れた時に敵から離れる向き）
    this.id = nextId++;
    this.units = [];
    this.initial = 0;
  }
  alive() { return this.units.filter((u) => u.alive); }
  get count() { let n = 0; for (const u of this.units) if (u.alive) n++; return n; }
  center() {
    let x = 0, z = 0, n = 0;
    for (const u of this.units) if (u.alive) { x += u.pos.x; z += u.pos.z; n++; }
    return n ? { x: x / n, z: z / n } : { x: this.anchor.x, z: this.anchor.z };
  }
  forward() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  // 鉄砲の段の数（鉄砲の隊だけ。ranks で決められる。1 なら一列）
  gunRanks() { return this.isGun && (this.formation === 'line' || this.formation === 'yari') && !this.marching ? Math.max(1, this.ranks || 2) : 1; }   // 三段は戦の定義の g.ranks = 3 で（既定の二段の方が一度に撃つ数が多い）
  // 並び方：横に何人、横の間（sp）と段の間（sd）
  //   横陣は横を詰め（1.1m ほど）、段の間を少し空けた（1.6m ほど）浅く広い形。正面の幅で大軍に見せる
  //   騎馬の隊は 2〜3 段の塊（馬は横 2m・前後 3m ほど場所をとる）
  layout(n) {
    const f = this.marching ? 'march' : this.formation;
    let sp = f === 'loose' ? this.spacing * 2.2 : f === 'yari' ? this.spacing * 0.8 : f === 'dense' ? this.spacing * 0.58 : this.spacing, sd = sp;
    const wide = f === 'line' && !this.isGun && !this.cav && this.spacing >= 1.4;
    if (wide) { sp = this.spacing * 0.74; sd = this.spacing * 1.07; }
    let cols = this.width || Math.max(2, Math.ceil(Math.sqrt(n * (wide && !this.isPlayerSquad ? 4.8 : 2.2))));
    if (this.cav) {
      sp = this.spacing * 1.3; sd = this.spacing * 2.1;
      if (!this.width && f !== 'column' && f !== 'march') cols = Math.max(2, Math.ceil(n / (n >= 12 ? 3 : n >= 5 ? 2 : 1)));
    }
    if (f === 'column') cols = this.colW || 2;   // 縦隊の列の数（道幅に合わせて g.colW で決められる。既定は二列）
    if (f === 'march') cols = this.colW || (n >= 24 ? 4 : n >= 9 ? 3 : 2);
    // 槍衾の段の数（既定は二段。g.yariRanks で三段にもできる）
    if (f === 'yari') cols = Math.max(2, Math.ceil(n / (this.yariRanks || 2)));
    // 魚鱗（突撃の深い縦隊）：正面を狭く、段を深く詰める。鶴翼（薄く長い横陣）：二段で横へ長く、両の端が少し前へ出る
    // 密集：門を破る勢いの固まり。正面を狭く、ほぼ真四角に詰める（縦隊より幅を持たせ、槍衾より深く）
    if (f === 'dense') cols = this.width || Math.max(2, Math.ceil(Math.sqrt(n)));
    if (f === 'gyorin') { sp = this.spacing * 0.8; sd = this.spacing * 0.95; cols = Math.max(2, Math.ceil(Math.sqrt(n * 0.6))); }
    if (f === 'kakuyoku') { sp = this.spacing * 0.95; sd = this.spacing * 1.1; cols = Math.max(2, Math.ceil(n / 2)); }
    const R = this.gunRanks();
    if (R > 1) cols = Math.ceil(n / R);
    return { f, sp, sd, cols, R };
  }
  // 鉄砲の段：i 番の兵の列と、その列で何番目か
  gunSlot(i, n, cols) {
    const col = i % cols, k = Math.floor(i / cols);
    const cnt = Math.floor((n - 1 - col) / cols) + 1;
    const fr = (this.front && this.front[col]) || 0;
    return { col, k, cnt, row: (k - fr + cnt) % cnt };
  }
  // 兵ごとに決まった小さなずれ（-1〜1）。同じ兵はいつも同じ所にずれる
  slotJit(i, k) {
    let x = Math.imul((i + 1) * 374761393 + this.id * 668265263 + k * 1013904223, 1274126177);
    x ^= x >>> 13; x = Math.imul(x, 1103515245); x ^= x >>> 16;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }
  // 騎馬の混じる隊（騎馬が一割〜六割）：騎馬は前の中ほどに 2〜3 段の塊、徒歩はその後ろに横陣。{ r, b, cav } を返す（無ければ null）
  mixedSlot(i, n, f) {
    if (f !== 'line' || this.cav || this.isGun || !(this.cavShare > 0.1)) return null;
    const ty = this._slotTypes;
    if (!ty || ty.length < n) return null;
    if (!this._mix || this._mix.n !== n) {
      const cav = [], foot = [];
      for (let k = 0; k < n; k++) (ty[k] === 'cavalry' || ty[k] === 'horse' ? cav : foot).push(k);
      const at = new Map();
      const cs = this.spacing * 1.3, cd = this.spacing * 2.1;
      const cr = cav.length >= 9 ? 3 : cav.length >= 4 ? 2 : 1, cc = Math.ceil(cav.length / cr);
      cav.forEach((k, j) => {
        const row = Math.floor(j / cc), col = j % cc, inRow = Math.min(cc, cav.length - row * cc);
        at.set(k, { r: (col - (inRow - 1) / 2) * cs + (row % 2) * cs * 0.5, b: row * cd, cav: true });
      });
      const fs = this.spacing * 0.74, fd = this.spacing * 1.07, b0 = cav.length ? cr * cd + 0.6 : 0;
      const fc = this.width || Math.max(2, Math.ceil(Math.sqrt(foot.length * 4.8)));
      foot.forEach((k, j) => {
        const row = Math.floor(j / fc), col = j % fc, inRow = Math.min(fc, foot.length - row * fc);
        at.set(k, { r: (col - (inRow - 1) / 2) * fs, b: b0 + row * fd, cav: false });
      });
      this._mix = { n, at };
    }
    return this._mix.at.get(i) || null;
  }
  slotPos(i, n) {
    // 円陣（大将を囲む旗本。ai.js の guard）：大将の分を除いた者で、要を中心に輪を作る。多ければ内と外の二重
    if (this.formation === 'ring') {
      const L = this.leader && this.leader.alive ? this.leader.slot : -1;
      const k = L >= 0 && i > L ? i - 1 : i, m = Math.max(1, L >= 0 ? n - 1 : n);
      const outer = m > 14 ? Math.ceil(m * 0.62) : m, inner = k >= outer;
      const cnt = inner ? m - outer : outer, j = inner ? k - outer : k;
      const rad = Math.max(2.4, cnt * this.spacing * 0.95 / (2 * Math.PI)) * (inner ? 0.62 : 1);
      const a = (j + (inner ? 0.5 : 0)) / Math.max(1, cnt) * Math.PI * 2 + this.slotJit(i, 3) * 0.05;
      return { x: this.anchor.x + Math.sin(a) * rad, z: this.anchor.z + Math.cos(a) * rad };
    }
    const { f, sp, sd, cols, R } = this.layout(n);
    let row, col, inRow, lat = 0, r, b, jl, jd;
    const mx = R > 1 ? null : this.mixedSlot(i, n, f);
    if (mx) {
      r = mx.r; b = mx.b; row = Math.round(b / 1.6); col = Math.round(r / 1.1);
      jl = mx.cav ? 0.25 : 0.12; jd = mx.cav ? 0.4 : 0.22;
    } else {
      if (R > 1) {
        // 撃った者は後ろの段へ下がり、込めた者が前に出る。段ごとに半間ずらし、すれ違えるように
        const s = this.gunSlot(i, n, cols);
        row = s.row; col = s.col; inRow = cols;
        lat = (row % 2) * sp * 0.5;
      } else {
        row = Math.floor(i / cols); col = i % cols;
        inRow = Math.min(cols, n - row * cols);
        // 騎馬の段は半騎ずつずらし、隙間の無い塊にする
        if (this.cav && f !== 'column' && f !== 'march') lat = (row % 2) * sp * 0.5;
      }
      r = (col - (inRow - 1) / 2) * sp + lat;
      b = row * sd * (f === 'column' || f === 'march' ? 1.3 : R > 1 ? 0.8 : 1);
      // 鶴翼：両の端ほど前へ（翼を広げた浅い弧）。魚鱗：前の段ほど狭く、鱗のように段ごとに半人ずらす
      if (f === 'kakuyoku' && inRow > 2) { const e = (col - (inRow - 1) / 2) / ((inRow - 1) / 2); b -= e * e * inRow * sp * 0.09; }
      if (f === 'gyorin') { r += (row % 2) * sp * 0.5; r *= Math.min(1, 0.6 + row * 0.2); }
      jl = this.cav ? 0.25 : R > 1 ? 0.06 : 0.12; jd = this.cav ? 0.4 : R > 1 ? 0.1 : f === 'column' || f === 'march' ? 0.15 : 0.22;
    }
    // 人が並んだ列にする：兵ごとの小さなずれと、段ごとのゆるい波（格子に見せない）
    r += this.slotJit(i, 1) * jl;
    b += this.slotJit(i, 2) * jd + (f === 'line' || f === 'yari' ? Math.sin(col * 0.55 + row * 2.1 + this.id) * (R > 1 ? 0.06 : 0.16) : 0);
    // 歩いている間は、並びがゆっくり崩れては戻る（歩幅の違う者が遅れ、前へ出る。止まれば整う）
    const wb = this._wob || 0;
    if (wb > 0.01 && R <= 1) { const T = this._t || 0; r += Math.sin(T * 0.55 + i * 1.7) * 0.2 * wb; b += Math.sin(T * 0.4 + i * 2.3) * (this.cav ? 0.7 : 0.4) * wb; }
    // 並びは、ゆっくり向きを変える隊の向き（_face）に合わせる
    const h = this._face ?? this.facing;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -Math.cos(h), rz = Math.sin(h);
    const wo = this._whOff;   // 端を軸にした旋回のずれ（shapeGroup）
    return { x: this.anchor.x + rx * r - fx * b + (wo ? wo.x : 0), z: this.anchor.z + rz * r - fz * b + (wo ? wo.z : 0) };
  }
  // 横の広がりの半分（向きを変える速さに使う）
  halfWidth() {
    // 今の人数で見る（半分討たれた隊は、並びは元のままでも早く回れる）
    const n = Math.max(1, this.count), { sp, cols } = this.layout(this.initial || 1);
    return Math.min(cols, n) * sp / 2;
  }
}

export class Unit {
  constructor(o) {
    const t = TYPES[o.type];
    Object.assign(this, {
      team: 0, type: 'ashigaru', name: '', hp: t.hp, maxHp: t.hp, dmg: t.dmg, reach: t.reach, cd: 0, cdBase: t.cd,
      windup: t.windup, speed: t.speed, run: t.run, range: t.range || 0, heading: 0, alive: true, fleeing: false,
      target: null, moveTo: null, atk: null, aiT: Math.random() * 0.3, slot: 0, isPlayer: false, isSub: false,
      confused: 0, invuln: false, deadT: 0, anim: Math.random() * 10, moving: 0, lastHitT: 99, hitFlash: 0,
      tag: '', noHead: false,
    }, o);
    this.id = nextId++;
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.vel = { x: 0, z: 0 };
    this.mv = { x: 0, z: 0 };     // 自分の足での速さ（加減速する）
    this.push = { x: 0, z: 0 };   // 押し合いの力（ならして使う）
  }
}
