// 障害物の当たりを十二メートルの升へ分ける。升と候補の入れ物は使い回す。
// 一コマに一度だけ置き直し、門の開閉・倒壊・増設・室内の壁の変更も拾う。
const CELL = 12;
const keyOf = (x, z) => (x + 20000) * 40000 + z + 20000;
const byIndex = (a, b) => a - b;
export class CollisionGrid {
  constructor() {
    this.cells = new Map(); this.near = []; this.marks = new Uint32Array(0);
    this.time = NaN; this.stamp = 0;
  }
  update(list, time, structs) {
    if (this.list === list && this.time === time && this.length === list.length) return;
    this.list = list; this.time = time; this.length = list.length;
    for (const cell of this.cells.values()) cell.length = 0;
    if (this.marks.length < list.length) this.marks = new Uint32Array(list.length + 64);
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      let x0, x1, z0, z1;
      if (structs) {
        if (!w.alive || (!w.seg && !w.solidR)) continue;
        x0 = z0 = Infinity; x1 = z1 = -Infinity;
        if (w.seg && !w.opened) {
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
      if (!Number.isFinite(x0 + x1 + z0 + z1)) continue;
      for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) {
        for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
          const key = keyOf(x, z);
          let cell = this.cells.get(key);
          if (!cell) { cell = []; this.cells.set(key, cell); }
          cell.push(i);
        }
      }
    }
  }
  query(x, z) {
    const out = this.near; out.length = 0;
    if (++this.stamp >= 0xffffffff) { this.marks.fill(0); this.stamp = 1; }
    // 押し戻しで隣の升へ入る余裕を二メートル残す。
    for (let ix = Math.floor((x - 2) / CELL); ix <= Math.floor((x + 2) / CELL); ix++) {
      for (let iz = Math.floor((z - 2) / CELL); iz <= Math.floor((z + 2) / CELL); iz++) {
        const cell = this.cells.get(keyOf(ix, iz));
        if (!cell) continue;
        for (const i of cell) if (this.marks[i] !== this.stamp) { this.marks[i] = this.stamp; out.push(i); }
      }
    }
    return out.sort(byIndex); // 元の押し戻し順を保つ。
  }
}
