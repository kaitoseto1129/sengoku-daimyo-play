// 直近三十秒を前半・後半に分けた中央値で、熱によるじわじわした遅れを拾う。
// 入れ物は使い回し、並べ替えは一秒に一度だけ。停止・支度の時間は混ぜない。
export class HeatWatch {
  constructor() {
    this.times = new Float64Array(2048);
    this.frames = new Float64Array(2048);
    this.older = new Float64Array(2048);
    this.recent = new Float64Array(2048);
    this.reset();
  }
  reset() {
    this.time = 0; this.checked = 0; this.count = 0; this.head = 0;
    this.level = 0; this.base = 0; this.fast = 0; this.slow = 0;
    this.before = 0; this.after = 0; this.rise = 0;
  }
  sample(seconds) {
    if (!(seconds > 0) || seconds >= 0.25) return this.reset();
    this.time += seconds;
    this.times[this.head] = this.time; this.frames[this.head] = seconds;
    this.head = (this.head + 1) % this.times.length;
    this.count = Math.min(this.count + 1, this.times.length);
    this.slow = seconds > 0.045 ? this.slow + seconds : 0;
    if (this.time - this.checked < 1) return;
    const span = this.time - this.checked; this.checked = this.time;
    let a = 0, b = 0;
    for (let i = 0; i < this.count; i++) {
      const age = this.time - this.times[i];
      if (age > 30) continue;
      if (age > 15) this.older[a++] = this.frames[i];
      else this.recent[b++] = this.frames[i];
    }
    if (!b) return;
    this.after = median(this.recent, b);
    this.before = a ? median(this.older, a) : this.after;
    this.rise = this.after / this.before - 1;
    if (!this.level && (this.slow > 8 || this.time >= 30 && this.rise >= 0.2 && this.after - this.before >= 0.002)) {
      this.level = 1; this.base = Math.min(this.before, 0.04); this.fast = 0;
    }
    if (this.level) {
      this.fast = this.after <= this.base * 1.08 ? this.fast + span : 0;
      if (this.fast >= 15) { this.level = 0; this.fast = 0; }
    }
  }
}
function median(buffer, count) {
  const values = buffer.subarray(0, count);
  values.sort();
  const half = count >> 1;
  return count & 1 ? values[half] : (values[half - 1] + values[half]) / 2;
}
