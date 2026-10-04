// 要件の時間帯を数分の戦へ縮める。秒数や細かな時刻は史実の断定ではなく、移ろいの目安。
// 夜討ち・日をまたぐ包囲・独自の夜明けは、戦の定義の段取りを保つ。
const HOURS = {
  okehazama: { day: [12, 13, 150], storm: [13, 14, 90], after: [14, 15, 180] },
  anegawa: { day: [6, 11, 300], afternoon: [11, 13, 120] },
  shitaragahara: { day: [6, 12, 240], afternoon: [12, 14, 180] },
  sekigahara: { day: [8, 14, 420] },
  // 墨俣の昼→夕暮れは伝承をもとにした守りの場面。史実の開戦時刻とは扱わない。
  sunomata: { day: [12, 14, 120], afternoon: [14, 16, 150], dusk: [16, 17.8, 180] },
};
const COLORS = ['sky', 'fog', 'sun', 'hemiSky', 'hemiGround', 'top', 'glow'];
const VALUES = ['sunI', 'hemiI', 'glowK', 'cover', 'cloudDark', 'vis', 'cloud'];

export class BattleTime {
  static supports(key) { return !!HOURS[key]; }
  constructor(world, key) {
    this.world = world;
    this.hours = HOURS[key];
    this.hour = this.hours.day[0];
    this.elapsed = 0;
    this.total = 0;
    this.eveningEnd = key === 'sunomata';
    this.key = world.timeKey;
    // 色・方向・山の作業用の入れ物は開戦時に一度だけ作る。
    this.morning = world.lookOf('morning');
    this.noon = world.lookOf('noon');
    this.dusk = world.lookOf('dusk');
    this.look = world.currentLook();
    this.mountA = this.look.sky.clone();
    this.mountB = this.look.sky.clone();
    this.tick(0);
  }
  tick(dt) {
    const W = this.world;
    if (this.key !== W.timeKey) { this.key = W.timeKey; this.elapsed = 0; }
    const stage = this.hours[this.key];
    if (!stage) return;
    if (!this.stopped) {
      this.elapsed += dt;
      this.total += dt;
      let target = stage[0] + (stage[1] - stage[0]) * Math.min(1, this.elapsed / stage[2]);
      // 普請が長引いても、七分の守りの締切では日が暮れる。
      if (this.eveningEnd) target = Math.max(target, 12 + 5.8 * Math.min(1, this.total / 420));
      // 待ちを飛ばしても日を瞬間移動させず、同じ時間帯へ戻っても逆行しない。
      this.hour += Math.min(Math.max(0, target - this.hour), dt * 0.04);
    }
    const h = this.hour, L = this.look;
    if (this.key === 'day' || this.key === 'afternoon' || this.key === 'dusk') {
      const a = h < 12 ? this.morning : this.noon;
      const b = h < 12 ? this.noon : this.dusk;
      const k = h < 12 ? Math.max(0, Math.min(1, (h - 6) / 6)) : Math.max(0, Math.min(1, (h - 14) / 4));
      const s = k * k * (3 - 2 * k);
      for (let i = 0; i < COLORS.length; i++) { const p = COLORS[i]; L[p].copy(a[p]).lerp(b[p], s); }
      for (let i = 0; i < VALUES.length; i++) { const p = VALUES[i]; L[p] = a[p] + (b[p] - a[p]) * s; }
      for (let i = 0; i < L.mount.length; i++) L.mount[i] = this.mountA.set(a.mount[i]).lerp(this.mountB.set(b.mount[i]), s).getHex();
      W.applyLook(L);
    }
    // 東から昇り、南を通って西へ沈む。朝夕は低く、昼は高いので影の長さも変わる。
    // 地図の東を＋横、北を－奥行きとする。雨雲が変わっても日の位置は変えない。
    const angle = (h - 6) * Math.PI / 12;
    L.sunDir.set(Math.cos(angle), Math.max(0.015, Math.sin(angle) * 0.85), Math.sin(angle) * 0.45).normalize();
    W.sunOffset.copy(L.sunDir).multiplyScalar(120);
    W.skyMat.uniforms.sunDir.value.copy(L.sunDir);
    this.mist = Math.max(0, Math.min(1, (10 - h) / 4));
  }
  get label() { return this.hour < 10 ? '朝' : this.hour < 13 ? '昼' : this.hour < 16 ? '昼下がり' : '夕暮れ'; }
}
