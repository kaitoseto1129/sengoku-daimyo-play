// 風・川・鳥は audio.js の場所と天気の判定を使う。
// ここでは実際の旗と本陣からの音を補う。素材は一度だけ作り、同時に三つまで。
import { S } from './settings.js';
import { WIND_STATE } from './world.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
const EMPTY = [];
function bake(ctx, kind, seconds) {
  const rate = 22050, b = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
  const a = b.getChannelData(0);
  let seed = 173, low = 0, phase = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / rate, end = Math.min(1, (seconds - t) / 0.12);
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * 0.13;
    if (kind === 'flag') {
      const pulse = Math.exp(-t * 13) + 0.65 * Math.exp(-Math.abs(t - 0.13) * 28);
      a[i] = low * pulse * end;
    } else if (kind === 'drum') {
      phase += Math.PI * 2 * (57 + 32 * Math.exp(-t * 18)) / rate;
      a[i] = (Math.sin(phase) * Math.exp(-t * 7) + low * Math.exp(-t * 35) * 0.4) * end;
    } else {
      phase += Math.PI * 2 * (142 + 10 * Math.sin(t * 4) + 1.5 * Math.sin(t * 33)) / rate;
      const env = Math.min(1, t / 0.25) * end;
      a[i] = (Math.sin(phase) * 0.55 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.09 + low * 0.03) * env;
    }
  }
  return b;
}

export class BattleEnvironment {
  constructor(rt) {
    this.rt = rt;
    this.ctx = null;
    this.dead = false;
    this.audible = false;
    this.volume = -1;
    this.scanT = 0;
    this.flagT = 1;
    this.callT = 18 + Math.random() * 15;
    this.flag = null;
    this.camp = null;
    this.campPoint = { x: 0, z: 0 };
    this.voices = [];
    this.unlock = () => {
      if (this.dead || this.rt.def.town || this.rt.def.dojo) return;
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        try {
          this.ctx = new Audio();
          this.bus = this.ctx.createGain();
          this.bus.gain.value = 0;
          this.bus.connect(this.ctx.destination);
          this.bank = { flag: bake(this.ctx, 'flag', 0.45), drum: bake(this.ctx, 'drum', 0.7), horn: bake(this.ctx, 'horn', 1.8) };
          for (let i = 0; i < 3; i++) {
            const gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
            const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
            filter.type = 'lowpass'; filter.Q.value = 0.5;
            filter.connect(gain);
            if (pan) { gain.connect(pan); pan.connect(this.bus); } else gain.connect(this.bus);
            this.voices.push({ gain, filter, pan, source: null });
          }
        } catch (e) { this.dispose(); return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    document.addEventListener('pointerdown', this.unlock);
    document.addEventListener('keydown', this.unlock);
    this.hide = () => this.sync(false);
    window.addEventListener('blur', this.hide);
    document.addEventListener('visibilitychange', this.hide);
    if (navigator.userActivation?.hasBeenActive) this.unlock();
  }

  // 戦が止まっている時にも呼ぶ。音量の保存値は今の設定を読むだけ。
  sync(on) {
    this.audible = on && !this.dead;
    if (!this.ctx || this.dead) return;
    const volume = this.audible ? 0.7 * 0.72 * clamp(S.volume) * clamp(S.volAmb) : 0;
    if (volume === this.volume) return;
    this.volume = volume;
    this.bus.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
    if (!volume) for (const v of this.voices) if (v.source) {
      try { v.source.stop(); } catch (e) { /* 止め済み */ }
    }
  }

  play(kind, at, strength, rain) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.audible || this.volume <= 0) return;
    const v = this.voices.find((q) => !q.source);
    if (!v) return;
    const p = this.rt.player.u.pos, yaw = this.rt.player.yaw;
    const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz);
    const far = kind !== 'flag';
    const reach = far ? 250 : 20;
    if (d >= reach) return;
    v.gain.gain.value = strength * (1 - d / reach) ** 2 * (far ? 1 - rain * 0.45 : 1);
    v.filter.frequency.value = far ? Math.max(220, 1200 - d * 3 - rain * 300) : 1700;
    if (v.pan) v.pan.pan.value = Math.max(-0.9, Math.min(0.9, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, d)));
    const src = this.ctx.createBufferSource();
    src.buffer = this.bank[kind]; src.playbackRate.value = 0.94 + Math.random() * 0.12;
    src.connect(v.filter); v.source = src;
    src.onended = () => { src.disconnect(); if (v.source === src) v.source = null; };
    src.start();
  }

  tick(dt) {
    const rt = this.rt;
    if (this.dead || !this.audible || !this.ctx || rt.def.town || rt.def.dojo) return;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.flag = this.camp = null;
      let fd = 20, cd = 250;
      const p = rt.player.u.pos;
      for (const g of rt.army.groups) for (const s of g.stds || EMPTY) {
        const u = s.userData.carrier;
        if (!u?.alive || s.userData.std?.down) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < fd) { fd = d; this.flag = u; }
      }
      for (const h of rt.taisho ? [rt.taisho.a, rt.taisho.b] : EMPTY) {
        if (!h || h.state === 'dead' || h.captured || (h.u && !h.u.alive)) continue;
        const at = h.u ? h.u.pos : h.at;
        if (!at) continue;
        const d = Math.hypot(at.x - p.x, at.z - p.z);
        if (d > 30 && d < cd) { cd = d; this.camp = at; }
      }
      // 総大将を置かない戦は、既存の軽い本陣を音の場所にする。
      if (!this.camp) for (const a of rt.world.armies || EMPTY) {
        if (a.kind !== 'honjin' || a.rout || !a.mesh.visible) continue;
        const x = a.mesh.position.x + a.cx + a.off.x, z = a.mesh.position.z + a.cz + a.off.z;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d <= 30 || d >= cd) continue;
        cd = d; this.campPoint.x = x; this.campPoint.z = z; this.camp = this.campPoint;
      }
    }
    const rain = clamp(rt.world.rainLevel || 0), gust = Math.max(0, WIND_STATE.gust - 0.35);
    this.flagT -= dt;
    if (this.flagT <= 0) {
      this.flagT = 0.6 + Math.random() * 1.3 / (0.5 + gust);
      if (this.flag?.alive && gust > 0.1) this.play('flag', this.flag.pos, Math.min(0.13, gust * 0.08) * (1 - rain * 0.2), rain);
    }
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = 28 + Math.random() * 30;
      if (this.camp && !rt.over && !rt.aftermath) this.play(Math.random() < 0.6 ? 'drum' : 'horn', this.camp, 0.12, rain);
    }
  }

  dispose() {
    this.dead = true;
    document.removeEventListener('pointerdown', this.unlock);
    document.removeEventListener('keydown', this.unlock);
    window.removeEventListener('blur', this.hide);
    document.removeEventListener('visibilitychange', this.hide);
    if (this.ctx) {
      for (const v of this.voices) {
        if (v.source) { try { v.source.stop(); } catch (e) { /* 止め済み */ } }
        v.filter.disconnect(); v.gain.disconnect(); if (v.pan) v.pan.disconnect();
      }
      this.bus?.disconnect();
      this.ctx.close().catch(() => {});
    }
    this.bank = null;
  }
}
