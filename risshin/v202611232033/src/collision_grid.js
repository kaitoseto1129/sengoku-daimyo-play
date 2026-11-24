// 障害物の当たりを十二メートルの升へ分ける。升と候補の入れ物は使い回す。
// 毎コマは位置の変更だけ調べ、升をまたいだ時・増設した時だけ置き直す。
const CELL = 12;
const keyOf = (x, z) => (x + 20000) * 40000 + z + 20000;
const byIndex = (a, b) => a - b;
export class CollisionGrid {
  constructor() {
    this.cells = new Map(); this.queries = new Map(); this.marks = new Uint32Array(0);
    this.bounds = new Int32Array(0); this.version = 0;
    this.time = NaN; this.stamp = 0;
  }
  update(list, time, structs) {
    if (this.list === list && this.time === time && this.length === list.length && this.structs === structs) return;
    let changed = this.list !== list || this.length !== list.length || this.structs !== structs;
    this.list = list; this.time = time; this.length = list.length; this.structs = structs;
    if (this.marks.length < list.length) {
      this.marks = new Uint32Array(list.length + 64);
      this.bounds = new Int32Array((list.length + 64) * 4); changed = true;
    }
    const rebuild = changed, B = this.bounds;
    // 11/18 K365（比叡山 障害物 9907・毎コマ 0.63ms）：囲みの生の値が前と同じ物は升の計算（割り算・切り捨て）を省く。値が変われば今までどおり
    if (!structs && (!this.raw || this.raw.length < list.length * 4)) { this.raw = new Float64Array((list.length + 64) * 4).fill(NaN); }
    const R = this.raw;
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      let x0, x1, z0, z1;
      if (!structs && !rebuild) {
        const at = i * 4, a0 = w.x0, a1 = w.x1, b0 = w.z0, b1 = w.z1;
        if (R[at] === a0 && R[at + 1] === a1 && R[at + 2] === b0 && R[at + 3] === b1) continue;
        R[at] = a0; R[at + 1] = a1; R[at + 2] = b0; R[at + 3] = b1;
      } else if (!structs) { const at = i * 4; R[at] = w.x0; R[at + 1] = w.x1; R[at + 2] = w.z0; R[at + 3] = w.z1; }
      if (structs) {
        x0 = z0 = Infinity; x1 = z1 = -Infinity;
        // 開閉・倒壊は当たりの本処理でその場で判定する。候補は残し、同じコマでの復帰も拾う。
        if (w.seg) {
          x0 = Math.min(w.seg[0], w.seg[2]) - .7; x1 = Math.max(w.seg[0], w.seg[2]) + .7;
          z0 = Math.min(w.seg[1], w.seg[3]) - .7; z1 = Math.max(w.seg[1], w.seg[3]) + .7;
        }
        if (w.solidR) {
          x0 = Math.min(x0, w.x - w.solidR); x1 = Math.max(x1, w.x + w.solidR);
          z0 = Math.min(z0, w.z - w.solidR); z1 = Math.max(z1, w.z + w.solidR);
        }
      } else {
        x0 = w.x0 - .7; x1 = w.x1 + .7; z0 = w.z0 - .7; z1 = w.z1 + .7;
      }
      if (Number.isFinite(x0 + x1 + z0 + z1)) {
        x0 = Math.floor(x0 / CELL); x1 = Math.floor(x1 / CELL);
        z0 = Math.floor(z0 / CELL); z1 = Math.floor(z1 / CELL);
      } else { x0 = z0 = 1; x1 = z1 = 0; }
      const at = i * 4;
      if (B[at] !== x0 || B[at + 1] !== x1 || B[at + 2] !== z0 || B[at + 3] !== z1) {
        // 一つ動いただけで、動かない陣幕や柵まで全て置き直さない。
        // 古い升から外して新しい升へ入れる。候補の順は query で元に戻す。
        if (!rebuild) this.place(i, true);
        changed = true; B[at] = x0; B[at + 1] = x1; B[at + 2] = z0; B[at + 3] = z1;
        if (!rebuild) this.place(i, false);
      }
    }
    if (!changed) return;
    this.version++;
    if (!rebuild) return;
    for (const cell of this.cells.values()) cell.length = 0;
    for (let i = 0; i < list.length; i++) this.place(i, false);
  }
  place(i, remove) {
    const B = this.bounds, at = i * 4;
    for (let x = B[at]; x <= B[at + 1]; x++) {
      for (let z = B[at + 2]; z <= B[at + 3]; z++) {
        const key = keyOf(x, z);
        let cell = this.cells.get(key);
        if (remove) {
          if (!cell) continue;
          const n = cell.indexOf(i);
          if (n >= 0) { cell[n] = cell[cell.length - 1]; cell.pop(); }
        } else {
          if (!cell) { cell = []; this.cells.set(key, cell); }
          cell.push(i);
        }
      }
    }
  }
  // 四角（x0..x1, z0..z1）に掛かる升の物を一度ずつ fn(i) に渡す（順は升の順。11/9 矢玉の当たり用）。升の数が多すぎる時は false
  forBox(x0, z0, x1, z1, fn) {
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.cells.size + 16) return false;
    if (++this.stamp >= 0xffffffff) { this.marks.fill(0); this.stamp = 1; }
    for (let ix = i0; ix <= i1; ix++) for (let iz = j0; iz <= j1; iz++) {
      const cell = this.cells.get(keyOf(ix, iz));
      if (!cell) continue;
      for (const i of cell) if (this.marks[i] !== this.stamp) { this.marks[i] = this.stamp; fn(i); }
    }
    return true;
  }
  query(x, z) {
    // 二メートルの余裕も含めた同じ升なら、兵ごと・二度の当たりごとに集め直さない。
    const x0 = Math.floor((x - 2) / CELL), x1 = Math.floor((x + 2) / CELL);
    const z0 = Math.floor((z - 2) / CELL), z1 = Math.floor((z + 2) / CELL);
    // 11/21 クラウド k365-03（K564 掃除の跳ね・小田原 alloc_prof）：鍵が三十億を超えて小さな整数に収まらず、引くたびに数の箱を作っていた。
    //   升の番号が ±511 の内（±六千m）は小さな鍵、外は元の鍵（負の数にして重ならないように）
    const key = x0 > -512 && x0 < 512 && z0 > -512 && z0 < 512
      ? ((x0 + 512) * 1024 + z0 + 512) * 4 + (x1 - x0) * 2 + z1 - z0
      : -(keyOf(x0, z0) * 4 + (x1 - x0) * 2 + z1 - z0) - 1;
    let cached = this.queries.get(key);
    if (cached && cached.version === this.version) return cached.ids;
    if (!cached) {
      // 長く歩いても候補の入れ物が増え続けない。古い入れ物を使い回す。
      if (this.queries.size >= 512) {
        const oldest = this.queries.keys().next().value;
        cached = this.queries.get(oldest); this.queries.delete(oldest);
      } else cached = { ids: [], version: -1 };
      this.queries.set(key, cached);
    }
    const out = cached.ids; out.length = 0; cached.version = this.version;
    if (++this.stamp >= 0xffffffff) { this.marks.fill(0); this.stamp = 1; }
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.cells.get(keyOf(ix, iz));
        if (!cell) continue;
        for (const i of cell) if (this.marks[i] !== this.stamp) { this.marks[i] = this.stamp; out.push(i); }
      }
    }
    return out.sort(byIndex); // 元の押し戻し順を保つ。
  }
}
