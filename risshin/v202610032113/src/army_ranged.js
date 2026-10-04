import { gunMisfireChance } from './weather_gameplay.js';
// Army の手法：鉄砲と弓（撃つ・込め直し・硝煙・矢の飛び・狭間・射界）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { RIDE, arrowGeometry, MAT, EMBER_GEO, EMBER_MAT, arrowStub } from './units_model.js';
import { YUMI } from './yumi.js';
import { distToSeg, segHit } from './units.js';
import * as THREE from 'three';
import { WIND_STATE } from './world.js';
import { S as SET } from './settings.js';

// Army の手法（units.js の class Army に足す）
// 画質「低」の煙：粒ごとの Sprite（一粒一回の描き）をやめ、カメラに向く板を一つの束で描く
class SmokeP {
  constructor() { this.isSmokeP = true; this.position = new THREE.Vector3(); this.s = 1; this.scale = { setScalar: (v) => { this.s = v; } }; this.material = { opacity: 0, rotation: 0, color: new THREE.Color() }; }
}
const SMOKE_CAP = 160;
function smokeBatchOf(army) {
  if (army.smokeBatch) return army.smokeBatch;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAP * 3), 3), aS = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAP * 3), 3), aC = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAP * 3), 3);
  for (const a of [aP, aS, aC]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aP', aP); g.setAttribute('aS', aS); g.setAttribute('aC', aC);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: army.smokeTex } }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute vec3 aP; attribute vec3 aS; attribute vec3 aC; varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main(){ vUv = uv; vCol = vec4(aC, aS.z);
  vec4 mvPosition = modelViewMatrix * vec4(aP, 1.0); float c = cos(aS.y), s = sin(aS.y); vec2 q = position.xy * aS.x;
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.name = 'smokeBatch';
  const list = [], keys = [], ord = [];
  mesh.onBeforeRender = (r, sc, cam) => {
    const n = Math.min(list.length, SMOKE_CAP), ce = cam.matrixWorld.elements;
    // 遠い粒から重ねる（束の中は並べ替えが利かないので、ここで並べる）
    for (let i = 0; i < n; i++) { const p = list[i].position, dx = p.x - ce[12], dy = p.y - ce[13], dz = p.z - ce[14]; keys[i] = dx * dx + dy * dy + dz * dz; ord[i] = i; }
    ord.length = n; ord.sort((a, b) => keys[b] - keys[a]);
    const P = aP.array, S = aS.array, C = aC.array;
    for (let k = 0; k < n; k++) {
      const sp = list[ord[k]], m = sp.material;
      P[k * 3] = sp.position.x; P[k * 3 + 1] = sp.position.y; P[k * 3 + 2] = sp.position.z;
      S[k * 3] = sp.s; S[k * 3 + 1] = m.rotation; S[k * 3 + 2] = m.opacity;
      C[k * 3] = m.color.r; C[k * 3 + 1] = m.color.g; C[k * 3 + 2] = m.color.b;
    }
    g.instanceCount = n; aP.needsUpdate = aS.needsUpdate = aC.needsUpdate = true;
  };
  army.scene.add(mesh);
  return (army.smokeBatch = { mesh, list });
}

export const ArmyRanged = {

  // ---------------- 鉄砲 ----------------
  // 引き金を落とす直前：火皿の口薬が燃え、小さな煙が上がる
  panFlash(u, near) {
    if (!near || u.mounted || gunMisfireChance(this.world, this.rain) >= 1) return;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rx = Math.cos(u.heading), rz = -Math.sin(u.heading);
    const x = u.pos.x + fx * 0.35 + rx * 0.14, y = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.5, z = u.pos.z + fz * 0.35 + rz * 0.14;
    this.spark(x, y, z, 3);
    this.flash(x, y, z, 0.38);
    this.smoke(x, y, z, 0, 0, 0.35);
    this.play('hizara', u.pos, 0.8);
  },
  // 放つ。当たるかは弾の散り（遠いほど広がる）と的の大きさ、柵・塀の陰で決まる。雨では火縄が湿って撃てないことが多い
  fireGun(u, t, launch = null) {
    this.lastGun = null;
    if (t.team === u.team || u.mounted || Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) > 100) return false;
    if (Math.random() < gunMisfireChance(this.world, this.rain)) { this.play('click', u.pos, 1); if (this.hooks.onGunMisfire) this.hooks.onGunMisfire(u); return false; }
    if (!u.isPlayer) {
      if (u.gunAmmo === undefined) u.gunAmmo = 20;
      if (u.gunAmmo <= 0) return false;
      u.gunAmmo--;
    }
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rx = Math.cos(u.heading), rz = -Math.sin(u.heading);
    const my = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.46;
    const mx = u.pos.x + fx * 1.3 + rx * 0.1, mz = u.pos.z + fz * 1.3 + rz * 0.1;
    const near = !u.offscreen && u.camD < 90;
    // 筒先の火は距離で膨らませない（140m まで描く）
    if (!u.offscreen && u.camD < 140) this.flash(mx, my, mz, 1);
    if (near) this.spark(mx + fx * 0.15, my, mz + fz * 0.15, 6, fx, fz);
    // 遠い撃ち手の硝煙は大きく（どこから撃ったかが煙で分かるように）
    this.smoke(mx, my, mz, fx, fz, u.camD > 50 ? 1.35 : 1);
    // 距離のこもりと遅れは、戦の音の経路で一度だけ付ける
    this.play('gun', u.pos, 1.6);
    u.fireT = 0.45;
    this.lastGun = null;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    // 高い所からは狙いやすく、低い所からは狙いにくい（見下ろす・見上げる）。有効射程も高さぶん伸び縮みする
    const elev = u.pos.y - t.pos.y;
    // 弾の散り（標準偏差 m）と、的の半分の幅・高さ（立った人・馬上の人）
    let sig = (0.22 + d * 0.017) * (elev > 0 ? Math.max(0.75, 1 - Math.min(elev, 14) * 0.018) : 1 + Math.min(-elev, 14) * 0.025);
    // 有効射程はおよそ50m、届くのは100mほど（史実の目安）。50mを越えた分だけ、さらに弾が散る（高い所はこの境が少し遠くなる）
    const over = Math.max(0, d - (50 + Math.max(-12, Math.min(18, elev * 1.3))));
    if (over > 0) sig *= 1 + over / 50 * 1.5;
    // 撃ち手の前に硝煙が溜まっていると的が見えにくく、弾が散る（凪の日の一斉射撃の後）
    if (this.smokes && this.smokes.length) {
      const mx2 = u.pos.x + (t.pos.x - u.pos.x) * Math.min(1, 6 / Math.max(6, d)), mz2 = u.pos.z + (t.pos.z - u.pos.z) * Math.min(1, 6 / Math.max(6, d));
      let dens = 0;
      for (const o of this.smokes) { const p = o.sp.position; if (Math.abs(p.x - mx2) < 5 && Math.abs(p.z - mz2) < 5) dens += o.sp.material.opacity; }
      sig *= 1 + Math.min(0.5, dens * 0.04);
    }
    // 動く撃ち手の照準は揺れる。本人も兵も同じ散りを使う。
    sig *= 1 + Math.min(2, Math.hypot(u.vel.x, u.vel.z) / 2);
    let sideBias = 0, heightBias = 0;
    if (launch && u.isPlayer) {
      // 筒先から照準の向きへ飛ぶ弾。遠いほど落ち、旗と同じ風下へ流れる。
      const dx = t.pos.x - mx, dz = t.pos.z - mz, hd = Math.hypot(dx, dz) || 1;
      const along = (launch.x * dx + launch.z * dz) / hd;
      const flight = hd / Math.max(1, along), tt = flight * flight;
      const wx = WIND_STATE.dirX * WIND_STATE.gust * 0.08, wz = WIND_STATE.dirZ * WIND_STATE.gust * 0.08;
      sideBias = ((launch.x * flight + wx * tt * 0.5 - dx) * dz - (launch.z * flight + wz * tt * 0.5 - dz) * dx) / hd;
      heightBias = my + launch.y * flight - 4.9 * tt - (t.pos.y + (t.mounted ? RIDE.y : 0) + 1.2);
    }
    // 弾の散りを一度だけ決め、その筋に最初に入る敵の体を拾う。矢と同じく味方は的にしない。
    const radius = Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.random()))) * sig;
    const theta = Math.random() * Math.PI * 2;
    const dx = t.pos.x - mx, dz = t.pos.z - mz, hd = Math.hypot(dx, dz) || 1;
    const lateral = sideBias + radius * Math.cos(theta);
    const bx = t.pos.x + dz / hd * lateral, bz = t.pos.z - dx / hd * lateral;
    const by = t.pos.y + (t.mounted ? RIDE.y : 0) + 1.2 + heightBias + radius * Math.sin(theta);
    const vx = bx - mx, vz = bz - mz, length2 = vx * vx + vz * vz || 1;
    // 的の後ろも届く範囲まで飛ぶ。射撃時だけ最大約250人を調べる。
    const maxQ = 100 / Math.sqrt(length2);
    let victim = null, firstQ = maxQ, hitY = 0;
    for (const o of this.units) {
      if (o === u || !o.alive || o.team === u.team || o.isStruct) continue;
      const q = ((o.pos.x - mx) * vx + (o.pos.z - mz) * vz) / length2;
      if (q <= 0 || q > firstQ) continue;
      const x = mx + vx * q, z = mz + vz * q, y = my + (by - my) * q;
      const bodyR = o.mounted ? 0.6 : 0.3;
      if (Math.hypot(o.pos.x - x, o.pos.z - z) > bodyR || y < o.pos.y + 0.05 || y > o.pos.y + (o.mounted ? RIDE.y + 1.72 : 1.72)) continue;
      // 塀は抜けない。柵の隙間だけ確率で通る。
      if (Math.random() >= this.coverBetween(u.pos, o.pos, u.team)) continue;
      victim = o; firstQ = q; hitY = y;
    }
    const struck = victim === t;
    this.lastGun = { u, t, struck, victim };
    if (victim) {
      const distance = Math.hypot(victim.pos.x - mx, victim.pos.z - mz);
      // 槍と弓と同じく、隊に定めた強さを弾にも通す。
      const dmg = u.dmg * (u.group?.dmgMult ?? 1) * (0.85 + Math.random() * 0.3) * Math.max(0.6, 1 - Math.max(0, distance - 50) / 125);
      const rec = { res: null };
      this.damage(victim, dmg, u, { kind: 'gun', d: distance, y: hitY, out: rec });
      this.gunImpact(victim, u);
      if (victim === t) this.lastGun.armor = rec.res === 'armor';
      if (victim.camD < 90 && rec.res !== 'armor') this.burst(victim.pos.x, hitY, victim.pos.z, 3, 'dust', fx, fz);
    } else if (t.camD < 60) {
      this.burst(bx, this.world.heightAt(bx, bz) + 0.05, bz, 4, 'dust', fx, fz);
    }
    if (t.isPlayer && this.hooks.onGunAtPlayer) this.hooks.onGunAtPlayer(u);
    // 自分のすぐそば（2.5m）を抜けた弾は「ひゅっ」と空を切る音で分かる
    const P = this.playerUnit;
    // 自分を狙って外れた弾も、耳の横を抜ける（鋭い破裂音と、ひゅんと遠ざかる唸り）。近い弾ほど大きい
    if (P && P.alive && P.team !== u.team && !(t === P && struck)) {
      const dm = t === P ? 0.6 + Math.random() * 1.2 : distToSeg(P.pos.x, P.pos.z, [u.pos.x, u.pos.z, t.pos.x + (t.pos.x - u.pos.x) * 0.3, t.pos.z + (t.pos.z - u.pos.z) * 0.3]);
      if (dm < 2.5) {
        // 弾筋に直角に、左か右の耳のそばから鳴らす（どちら側を抜けたかが耳で分かる）
        const bl = d || 1, sx = -(t.pos.z - u.pos.z) / bl, sz = (t.pos.x - u.pos.x) / bl, sd = Math.random() < 0.5 ? -1 : 1;
        this.play('whiz', { x: P.pos.x + sx * sd * 1.5, y: P.pos.y, z: P.pos.z + sz * sd * 1.5 }, 1.3 - dm * 0.3);
      }
    }
    return true;
  },
  // 被弾した列が一瞬詰まる。周りは身を伏せるだけで、弾の当たらない者の体力は減らさない。
  gunImpact(t, u) {
    if (t.isPlayer || t.isStruct) return;
    if (t.alive) t.stagger = Math.max(t.stagger || 0, 0.65);
    if (t.camD > 90 || t._gunShockAt > this.time - 2) return;
    t._gunShockAt = this.time;
    this.forNear(t.pos.x, t.pos.z, 3, (o) => {
      if (o === t || !o.alive || o.team !== t.team || o.team === u.team || o.isPlayer || o.isStruct || o.mounted || o.invuln || o.fleeing || o._gunShockAt > this.time - 2) return;
      o._gunShockAt = this.time;
      o.duckT = this.time + 0.7 + (o.id % 4) * 0.12;
      o.stagger = Math.max(o.stagger || 0, 0.25 + (o.id % 3) * 0.08);
    });
  },
  // 込め直し：筒を立てて火薬と弾を落とし、込め矢で突き固め、火皿に口薬を盛って火蓋を閉じ、火縄を挟み直す
  startReload(u) {
    const dur = 20 + Math.random() * 10; // 不発でも口薬と火縄を整える。短縮しない。
    u.cd = dur;
    const r = u.reloadPose || (u.reloadPose = { t: 0, dur: 0 });
    r.t = 0; r.dur = dur; u.reload = r;
  },
  // a・b の間の地面が高く盛り上がって射線をさえぎるか（丘・尾根の向こうは狙えない）。数点だけ確かめる（毎回全員ではないので軽い）
  terrainBlocks(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 8 || !this.world || !this.world.heightAt) return false;
    const ay = a.y + 1.5, by = b.y + 1.0;
    const n = Math.min(6, Math.max(3, Math.round(L / 12)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const gy = this.world.heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (gy > ay + (by - ay) * t - 0.4) return true;
    }
    return false;
  },
  // a から b への射線を、b の方の柵・塀がさえぎるか（的がそのすぐ後ろにいれば陰になる）。1 ならさえぎる物なし
  coverBetween(a, b, team) {
    if (this.terrainBlocks(a, b)) return 0;
    let k = 1;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (const s of this.structs) {
      if (!s.alive || !s.seg) continue;
      const q = segHit(a.x, a.z, b.x, b.z, s.seg);
      if (q < 0) continue;
      const x = a.x + (b.x - a.x) * q, z = a.z + (b.z - a.z) * q;
      const y = a.y + 1.46 + (b.y - a.y) * q;
      const top = this.world.heightAt(x, z) + (s.h || (/塀|壁|門|石垣|櫓/.test(s.name || '') ? 3 : 2.1));
      if (y < top) k *= /柵/.test(s.name || '') ? 0.6 : 0;
    }
    // 竹束：的のすぐ前（3.5m 内）で、撃つ線の上 0.6m 内に竹束を持つ者が立っていれば、弾はほとんど通らない
    const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    let shield = false;
    this.forNear(b.x, b.z, 3.6, (o) => {
      if (shield || !o.alive || !o.tatake || o.team === team || o.fleeing) return;
      const along = (o.pos.x - a.x) * ux + (o.pos.z - a.z) * uz, lat = Math.abs((o.pos.x - a.x) * uz - (o.pos.z - a.z) * ux);
      if (along < L - 0.2 && along > L - 3.5 && lat < 0.6) shield = true;
      // 持つ本人：竹束を撃つ者の方へ向けていれば守られる
      else if (Math.abs(along - L) < 0.2 && lat < 0.2 && -(Math.sin(o.heading) * ux + Math.cos(o.heading) * uz) > 0.5) shield = true;
    });
    if (shield) k *= 0.3;
    return k;
  },

  // 閃光：筒先のごく短い橙の光
  flash(x, y, z, s = 1) {
    if (SET.reduceMotion) return;
    if (!this.flashTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,.85)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.flashTex = new THREE.CanvasTexture(c);
      this.flashes = [];
    }
    // 火の粒は使い終わった物を使い回す（撃つたびに材質を作って捨てない）
    const fp = this.flashPool || (this.flashPool = []);
    const sp = fp.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.material.rotation = Math.random() * 6.28; sp.material.opacity = 1;
    sp.position.set(x, y, z);
    // 夕暮れ・朝・雨の暗い中では、筒先の火が大きく長く見える
    const tk = this.world && this.world.timeKey, dim = tk === 'dusk' || tk === 'storm' || tk === 'morning';
    sp.scale.setScalar(0.55 * s * (dim ? 1.6 : 1));
    this.scene.add(sp);
    this.flashes.push({ sp, t: 0, life: dim ? 0.1 : 0.07 });
  },

  // 煙の粒を scene へ入れる・外す。画質「低」の粒は、一つの板の束（SmokeBatch）に入れる（粒ごとに描く回数が一回ずつ増えない）
  smokeIn(sp) { if (sp.isSmokeP) { const B = smokeBatchOf(this); B.list.push(sp); B.mesh.visible = true; } else this.scene.add(sp); },
  smokeOut(sp) { if (sp.isSmokeP) { const L = smokeBatchOf(this).list, i = L.indexOf(sp); if (i >= 0) { L[i] = L[L.length - 1]; L.pop(); } } else this.scene.remove(sp); },

  // 硝煙：筒先から前へどっと吹き出し、すぐ勢いを失って、風に流されながら大きく広がって薄れる（数挺撃てばしばらく視界が曇る）
  smoke(x, y, z, fx = 0, fz = 0, amt = 1) {
    if (!this.smokeTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      // もこもこした煙：小さな丸をいくつも重ねる
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 30, px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r, rr = 18 + Math.random() * 22;
        const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(236,234,228,.35)'); gr.addColorStop(1, 'rgba(236,234,228,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      this.smokeTex = new THREE.CanvasTexture(c);
      this.smokes = [];
    }
    // 硝煙の色は少し灰に寄せる（白く光りすぎないように）
    const tint = this.world && this.world.timeKey === 'dusk' ? 0xcdb8a8 : this.world && this.world.timeKey === 'storm' ? 0x9a9e9e : 0xd4d3cc;
    // 一斉射撃（0.4 秒に六発より多い）では、一発ごとの粒を減らして大きくし、隊の前に一枚の煙の壁を作る（古い煙がいきなり消えないように）
    if (amt >= 0.5) { if (this.time - (this._smkT ?? -9) > 0.4) { this._smkT = this.time; this._smkN = 0; } this._smkN++; }
    const vol = amt >= 0.5 && this._smkN > 6;
    // 画質「低」（携帯）は粒を減らして一粒を大きく（煙の板一枚が描く回数一回。重なった煙の塗りも減る）
    const lowQ = SET.quality === 'low';
    // 板の束でも名残を残す。画面内の部品を探す方法では携帯の煙を拾えない
    if (amt >= 0.5 && this.world) this.world.gunSmoke(x, z);
    const cap = SET.reduceMotion ? 40 : lowQ ? 120 : 260;
    const n = SET.reduceMotion ? 1 : lowQ ? (amt < 0.5 ? 1 : vol ? 2 : 3) : amt < 0.5 ? 2 : vol ? 3 : 7;
    const big = lowQ && amt >= 0.5 ? 1.25 : 1;
    for (let k = 0; k < n; k++) {
      // 煙の粒は使い終わった物を使い回す（一斉射撃のたびに何十も材質を作って捨てない）
      const sPool = this.smokePool || (this.smokePool = []);
      // 新しい板を作る前に枠を空け、上限に達した板もその場で使い回す
      while (this.smokes.length >= cap) {
        // 薄い粒から戻す。長く残る白煙を、次の一斉射でまとめて消さない。
        let at = 0, faint = Infinity;
        for (let i = 0; i < this.smokes.length; i++) {
          const o = this.smokes[i], left = (1 - o.t / o.life) * (o.s1 > 2 ? 1 : 0.3);
          if (left < faint) { faint = left; at = i; }
        }
        const o = this.smokes[at]; this.smokeOut(o.sp); sPool.push(o.sp); this.smokes.splice(at, 1);
      }
      const sp = sPool.pop() || (lowQ ? new SmokeP() : new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false })));
      sp.material.opacity = 0.85; sp.material.color.set(tint); sp.material.rotation = Math.random() * 6.28;
      sp.position.set(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.3) * 0.2, z + (Math.random() - 0.5) * 0.2);
      sp.scale.setScalar(0.3 * amt);
      this.smokeIn(sp);
      // 前の粒ほど速く遠くへ（筒先からの噴き出し）。火皿の煙は上へ
      const burst = amt < 0.5 ? 0.3 : 2 + (k / n) * 9 * (0.7 + Math.random() * 0.5);
      // 凪（風が弱い）ほど煙は長く残って隊の前に溜まる。風が強ければ早く流れて薄れる
      const calm = 1 + 0.9 * Math.max(0, Math.min(1, 1.15 - (WIND_STATE.gust ?? 1)));
      const o = sp.smokeState || (sp.smokeState = { sp });
      o.t = 0; o.life = amt < 0.5 ? 2.5 : ((vol ? 15 : 11) + Math.random() * 5) * calm;
      o.vx = fx * burst + (Math.random() - 0.5) * 0.6; o.vz = fz * burst + (Math.random() - 0.5) * 0.6;
      o.vy = amt < 0.5 ? 0.5 : 0.08 + Math.random() * 0.18; o.spin = (Math.random() - 0.5) * 0.3;
      o.s0 = 0.3 * amt; o.s1 = amt < 0.5 ? 0.9 : (5.2 + Math.random() * 1.6) * (vol ? 1.45 : 1) * big;
      this.smokes.push(o);
    }
  },

  updateSmoke(dt) {
    if (this.flashes) for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.life) { this.scene.remove(f.sp); (this.flashPool || (this.flashPool = [])).push(f.sp); this.flashes.splice(i, 1); continue; }
      f.sp.material.opacity = SET.reduceMotion ? 0 : 1 - f.t / f.life;
    }
    if (this.sndQ && this.sndQ.length) {
      for (let i = this.sndQ.length - 1; i >= 0; i--) { const q = this.sndQ[i]; if (this.time >= q.at) { this.sndQ.splice(i, 1); this.play(q.name, q.pos, q.vol); } }
      if (this.sndQ.length > 60) this.sndQ.splice(0, this.sndQ.length - 60);
    }
    if (!this.smokes) return;
    // 風：煙は野の風（旗・草と同じ向き）で流れる。突風の時は速く、凪では隊の前に溜まる
    const ws = 0.9 * Math.max(0.3, Math.min(1.8, WIND_STATE.gust ?? 1));
    const wx = WIND_STATE.dirX * ws, wz = WIND_STATE.dirZ * ws;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { this.smokeOut(s.sp); (this.smokePool || (this.smokePool = [])).push(s.sp); this.smokes.splice(i, 1); continue; }
      // 吹き出した直後にすぐ膨らみ、そのあとゆっくり広がる
      s.sp.scale.setScalar(s.s0 + Math.min(1, s.t * 1.5) * s.s1 * 0.12 + Math.sqrt(k) * s.s1 * 0.88);
      const drag = Math.exp(-dt * 3.2);
      s.vx *= drag; s.vz *= drag;
      const wk = Math.min(1, s.t * 0.8);
      s.sp.position.x += (s.vx + wx * wk) * dt; s.sp.position.z += (s.vz + wz * wk) * dt;
      // 硝煙は重く、昇る勢いはすぐ衰えて、人の背の少し上に溜まって横へ広がる
      s.vy *= Math.exp(-dt * 0.45);
      s.sp.position.y += s.vy * dt;
      if (!SET.reduceMotion) s.sp.material.rotation += s.spin * dt;
      s.sp.material.opacity = 0.76 * Math.min(1, s.t * 10) * Math.pow(1 - k, 0.8) * (1 - k * 0.3);
    }
    if (this.smokeBatch && !this.smokeBatch.list.length) this.smokeBatch.mesh.visible = false;
  },

  // ---------------- 弓矢 ----------------
  // 射る：遠い的・柵の陰の的へは高く射上げる（曲射）。風を少し見越すが、読み切れずに流される
  shoot(u, t, launch = null) {
    if (!u.isPlayer) {
      if (u.arrowAmmo === undefined) u.arrowAmmo = 24;
      if (u.arrowAmmo <= 0) return false;
    }
    // 火矢（g.fireArrows）：柵・門・小屋を的にした時は、その真ん中の少し上へ射込む
    let fireA = false;
    if (t.isStruct) { const q = this.targetPoint(t); fireA = !!(u.group && u.group.fireArrows); t = { pos: { x: q.x, y: this.world.heightAt(q.x, q.z) + 0.4, z: q.z }, isStruct: true }; }
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), rxv = Math.cos(u.heading), rzv = -Math.sin(u.heading);
    const sx = u.pos.x + fx * 0.6 - rxv * 0.12, sy = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.5, sz = u.pos.z + fz * 0.6 - rzv * 0.12;
    const d = Math.hypot(t.pos.x - sx, t.pos.z - sz);
    const lob = d > 24 || this.coverBetween(u.pos, t.pos, u.team) < 1 || !!this.shotBlocked(u, t.pos);
    // 曲射は高く射上げ、柵や前の味方を越えて上から落とす
    // 初速を一定に保つ。遠い的へ無限に強い矢を作らない。
    const speed = 36, dy = t.pos.y + (t.mounted ? RIDE.y : 0) + 1.15 - sy;
    const disc = speed ** 4 - 9.8 * (9.8 * d * d + 2 * dy * speed * speed);
    if (!launch && (d > 100 || disc < 0)) return false;
    const angle = Math.atan((speed * speed + (lob ? 1 : -1) * Math.sqrt(Math.max(0, disc))) / (9.8 * Math.max(0.1, d)));
    const T = Math.max(0.1, d / (speed * Math.cos(angle)));
    // 曲射は的を外しやすい。高い所からは見下ろして狙いやすい
    const elevB = u.pos.y - t.pos.y;
    const spread = (0.8 + d * 0.035) * (1 + (this.rain || 0) * 0.8) * (lob ? 1.4 : 1) * (elevB > 0 ? Math.max(0.8, 1 - Math.min(elevB, 14) * 0.012) : 1);
    const W = this.windAcc();
    let tx = t.pos.x + (t.vel?.x || 0) * T * 0.6 + (Math.random() - 0.5) * spread;
    let tz = t.pos.z + (t.vel?.z || 0) * T * 0.6 + (Math.random() - 0.5) * spread;
    // 風の見越し（七割ほど）
    tx -= W.x * T * T * 0.5 * 0.7; tz -= W.z * T * T * 0.5 * 0.7;
    const ty = t.pos.y + (t.mounted ? RIDE.y : 0) + 1.15;
    const g = 9.8;
    const vel = launch && u.isPlayer ? launch.clone() : new THREE.Vector3((tx - sx) / T, (ty - sy + 0.5 * g * T * T) / T, (tz - sz) / T);
    // カメラの近くで射た矢・本人へ飛ぶ矢は本物の矢の形（src/yumi.js。同時に YUMI.arrowMax 本まで）
    let real = YUMI.ready && (u.camD < YUMI.arrowNear || t.isPlayer);
    if (real) { let n = 0; for (const o of this.arrows) if (o.real) n++; real = n < YUMI.arrowMax; }
    if (!u.isPlayer) u.arrowAmmo--;
    const mesh = real ? new THREE.Mesh(YUMI.ya, YUMI.arrowMat) : new THREE.Mesh(arrowGeometry(), MAT);
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(sx + vel.x, sy + vel.y, sz + vel.z);
    this.scene.add(mesh);
    // 火矢は鏃の後ろに火のついた油布（橙の小さな火）
    if (fireA) { const e = new THREE.Mesh(EMBER_GEO, EMBER_MAT); e.scale.setScalar(4); e.position.set(0, 0, -0.1); mesh.add(e); }
    this.arrows.push({ pos: mesh.position, prev: mesh.position.clone(), vel, team: u.team, owner: u, playerWind: !!(launch && u.isPlayer), life: launch && u.isPlayer ? 8 : T + 2, mesh, dmg: u.dmg * (u.group?.dmgMult || 1), stuck: false, fire: fireA, real });
    this.play('string', u.pos, 0.8);
    if (t.isPlayer && this.hooks.onArrowAtPlayer) this.hooks.onArrowAtPlayer(u);
    this.play('arrow', u.pos, 0.6);
  },
  // 風で矢が流される力（m/秒²）
  windAcc(player = false) {
    const w = player ? (this._playerWind || (this._playerWind = { x: 0, z: 0 })) : (this._arrowWind || (this._arrowWind = { x: 0, z: 0 }));
    if (player) { w.x = WIND_STATE.dirX * WIND_STATE.gust * 0.6; w.z = WIND_STATE.dirZ * WIND_STATE.gust * 0.6; }
    else { const a = this.wind ?? 0.6; w.x = Math.sin(a) * 0.6; w.z = Math.cos(a) * 0.6; }
    return w;
  },

  // 刺さった矢を残す（地面・柵・人。しばらくして消す）
  pinArrow(a, life, parent) {
    a.stuck = true; a.life = life;
    if (parent) {
      const m = a.mesh;
      parent.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      parent.getWorldQuaternion(q);
      m.quaternion.premultiply(q.invert());
      parent.worldToLocal(m.position);
      parent.add(m);
      a.parent = parent;
      // 一人に残す矢は四本まで
      const mine = this.arrows.filter((o) => o.parent === parent);
      if (mine.length > 4) { const o = mine[0]; o.life = 0; }
    }
  },

  // 地面に刺さった矢は、一つの軽い形（InstancedMesh、六百本まで）に写して、戦が終わるまで残す（一本ずつ描かない）
  bakeArrow(a) {
    // 本物の矢は別の束（二百本まで）に写す
    const R = a.real ? 'gArrowsR' : 'gArrows', N = a.real ? 200 : 600;
    if (!this[R]) {
      const im = a.real ? new THREE.InstancedMesh(YUMI.ya, YUMI.arrowMat, N) : new THREE.InstancedMesh(arrowGeometry(), MAT, N);
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      this.scene.add(im);
      this[R] = im; this[R + 'I'] = 0;
    }
    const im = this[R], m = a.mesh;
    m.updateMatrix();
    im.setMatrixAt(this[R + 'I'], m.matrix);
    this[R + 'I'] = (this[R + 'I'] + 1) % N;
    im.count = Math.min(N, im.count + 1);
    im.instanceMatrix.needsUpdate = true;
    a.life = 0;   // 一本ずつの形は次のコマで片付く
  },

  updateArrows(dt) {
    const W = this.windAcc(), PW = this.windAcc(true);
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      // 倒れた者に刺さった矢は、体が残る間は残す（体を片付ける時に一緒に消す）
      if (a.host && !a.host.alive && a.life > 0 && a.life < 1e8) a.life = 1e9;
      if (a.life <= 0) { (a.parent || this.scene).remove(a.mesh); this.arrows.splice(i, 1); continue; }
      // 浅手の者は、肩や腕に刺さった矢の柄を折って戦い続ける（刺さって 2.5〜5 秒後、手の空いた時に。短い折れ口だけ残る）
      if (a.stuck && a.snapT && this.time > a.snapT && a.host) {
        const h = a.host;
        if (!h.alive || h.fleeing) a.snapT = 0;
        else if (!h.atk && !h.swing && !(h.stagger > 0)) {
          a.snapT = 0;
          a.mesh.geometry = arrowStub(); a.mesh.material = MAT;
          if (!h.hit) h.hit = { kind: 'flinch', t: 0, dur: 0.35, from: 'front', side: 1, part: 'arm', res: 'hit' };
          if (h.camD < 25) this.play('wood', h.pos, 0.25);
        }
      }
      if (a.stuck) continue;
      a.vel.y -= 9.8 * dt;
      const wind = a.playerWind ? PW : W;
      a.vel.x += wind.x * dt; a.vel.z += wind.z * dt;
      a.prev.copy(a.pos);
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      const p0 = a.prev, p1 = a.pos;
      // 敵味方の柵・塀に刺さる。曲射で上を越えた矢だけ通る
      let wall = null, wq = 2;
      for (const s of this.structs) {
        if (!s.alive) continue;
        if (s.seg) {
          const q = segHit(p0.x, p0.z, p1.x, p1.z, s.seg);
          if (q < 0 || q > wq) continue;
          const cx = p0.x + (p1.x - p0.x) * q, cz = p0.z + (p1.z - p0.z) * q, cy = p0.y + (p1.y - p0.y) * q;
          const top = this.world.heightAt(cx, cz) + (s.h || (/塀|壁|門|石垣|櫓/.test(s.name || '') ? 3 : 2.1));
          // 柵は杭の間を抜けることがある（四本に一本）
          if (cy < top && !(a.skip && a.skip.has(s))) { if (/柵/.test(s.name || '') && Math.random() < 0.25) (a.skip || (a.skip = new Set())).add(s); else { wall = s; wq = q; } }
        } else if (s.solidR && Math.hypot(p1.x - s.x, p1.z - s.z) < s.solidR && p1.y < this.world.heightAt(s.x, s.z) + 3) { wall = s; wq = 1; }
      }
      // 人：矢の通り道（前のコマからの線）に一番近い所で、体の筒に入ったか
      let hit = null, hq = 2, hy = 0;
      if (!a.glanced) this.forNear((p0.x + p1.x) * 0.5, (p0.z + p1.z) * 0.5, Math.hypot(p1.x - p0.x, p1.z - p0.z) * 0.5 + 0.7, (o) => {
        if (!o.alive || o.team === a.team || o === a.owner || (o.invuln && !this.mayWound(o, a.owner))) return;
        const vx = p1.x - p0.x, vz = p1.z - p0.z, l2 = vx * vx + vz * vz || 1e-6;
        const q = Math.max(0, Math.min(1, ((o.pos.x - p0.x) * vx + (o.pos.z - p0.z) * vz) / l2));
        const cx = p0.x + vx * q, cz = p0.z + vz * q, cy = p0.y + (p1.y - p0.y) * q;
        const rr = o.mounted ? 0.6 : 0.3, top = o.pos.y + (o.mounted ? RIDE.y + 1.72 : 1.72);
        if (Math.hypot(o.pos.x - cx, o.pos.z - cz) < rr && cy > o.pos.y + 0.05 && cy < top && q < hq) { hit = o; hq = q; hy = cy; }
      });
      // 体の筒に入った矢は当たる。陣形や暗さで当たった矢を消さない。
      if (hit && hq <= wq) {
        a.pos.set(p0.x + (p1.x - p0.x) * hq, hy, p0.z + (p1.z - p0.z) * hq);
        const rec = { res: null };
        this.damage(hit, a.dmg, a.owner, { kind: 'arrow', y: hy, out: rec });
        if (rec.res === 'armor') {
          // 甲冑に弾かれて落ちる（小札に当たる高く短い音）
          a.glanced = true;
          if (hit.camD < 40) this.play('kin', a.pos, 0.35);
          a.vel.set(-a.vel.x * 0.15 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, -a.vel.z * 0.15 + (Math.random() - 0.5) * 3);
          a.pos.addScaledVector(a.vel, 0.02);
        } else if (hit.isPlayer) { this.scene.remove(a.mesh); this.arrows.splice(i, 1); }
        else {
          // 刺さったまま残る（倒れれば体と一緒に）
          const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
          a.pos.addScaledVector(a.vel, 0.12 / L);
          this.pinArrow(a, 50, rec.horse || hit.mesh);
          a.host = rec.horse ? null : hit;
          if (!rec.horse && hit.alive && hit.hp > hit.maxHp * 0.45 && !hit.mounted && Math.random() < 0.6) a.snapT = this.time + 2.5 + Math.random() * 2.5;
          if (hit.camD < 40) this.play('thunk', a.pos, 0.35);   // 刺さる鈍い音
        }
        continue;
      }
      if (wall) {
        const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
        a.pos.set(p0.x + (p1.x - p0.x) * wq, p0.y + (p1.y - p0.y) * wq, p0.z + (p1.z - p0.z) * wq).addScaledVector(a.vel, 0.1 / L);
        this.pinArrow(a, 40, null);
        this.play('thunk', a.pos, 0.5);
        if (a.fire) this.igniteStruct(wall, a.pos);
        continue;
      }
      const gy = this.world.heightAt(a.pos.x, a.pos.z);
      // 自分の近く（6m）をかすめて落ちる矢は、その所で風切りが鳴る（射た所の音だけでは、矢の雨の怖さが伝わらない）
      const P = this.playerUnit;
      if (!a.whist && P && a.team !== P.team && Math.abs(a.pos.x - P.pos.x) + Math.abs(a.pos.z - P.pos.z) < 8 && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 6) { a.whist = true; this.play('arrow', a.pos, 1); }
      // 降ってくる矢の下の者は身をすくめる（一本ごとに毎コマは見ず、落ちる手前の一度だけ）
      if (!a.ducked && a.vel.y < -4 && a.pos.y - gy < 6) {
        a.ducked = true;
        this.forNear(a.pos.x, a.pos.z, 4, (o) => { if (o.alive && o.team !== a.team && !o.isPlayer && !o.mounted && !o.atk && !o.swing) o.duckT = this.time + 1 + Math.random() * 0.8; });
      }
      if (a.pos.y < gy) {
        // 地面に斜めに刺さる（鏃が少し埋まる）
        const L = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
        const back = (gy - a.pos.y) / Math.max(0.2, -a.vel.y / L);
        a.pos.addScaledVector(a.vel, -back / L).addScaledVector(a.vel, (a.glanced ? 0.02 : 0.12) / L);
        this.pinArrow(a, a.glanced ? 15 : 30, null);
        this.bakeArrow(a);
      }
    }
    // 残る矢は全部で百八十本まで
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) if (this.arrows[i].stuck && ++n > 180) { const a = this.arrows[i]; (a.parent || this.scene).remove(a.mesh); this.arrows.splice(i, 1); }
  },
  // 鉄砲の段の入れ替わり：撃った者は後ろへ下がって込め直し、次の者が前に出る
  gunRotate(u) {
    const g = u.group;
    u.salvoAt = null;
    if (!g || !g.isGun || !g.front) return;
    const { cols, R } = g.layout(g.initial);
    if (R <= 1 || u.slot >= g.initial) return;
    const s = g.gunSlot(u.slot, g.initial, cols);
    if (s.row === 0) {
      let k = (s.k + 1) % s.cnt;
      for (let i = 0; i < s.cnt; i++) {
        const next = g.units[s.col + k * cols];
        if (next && next.alive && next.type === 'gun') break;
        k = (k + 1) % s.cnt;
      }
      g.front[s.col] = k;
    }
  },
  // 鉄砲の段で、今この者が撃つ番か（前の段にいて、持ち場に着いている）
  gunMayFire(u) {
    const g = u.group;
    if (!g || !g.isGun || !g.front || u.slot >= g.initial) return true;
    if (!(g.order === 'hold' || g.order === 'yari' || g.order === 'follow' || g.order === 'move')) return true;
    const { cols, R } = g.layout(g.initial);
    if (R <= 1) return true;
    return g.gunSlot(u.slot, g.initial, cols).row === 0;
  },

  // 鉄砲の段で持ち場を守っている隊か
  gunGated(g) {
    if (!g.isGun || !g.front || g.gunRanks() <= 1) return false;
    return g.order === 'hold' || g.order === 'yari' || g.order === 'follow' || g.order === 'move';
  },

  // 弾が届く先まで味方を調べる。的より奥の味方にも、外れ弾が届く。
  allyInLine(u, t, d) {
    const tp = t.pos;
    const L = 100;
    if (d <= 0.8) return false;
    const fx = (tp.x - u.pos.x) / d, fz = (tp.z - u.pos.z) / d;
    let hit = false;
    this.forNear(u.pos.x + fx * L / 2, u.pos.z + fz * L / 2, L / 2 + 1, (o) => {
      if (hit || o === u || !o.alive || o.team !== u.team) return;
      const ox = o.pos.x - u.pos.x, oz = o.pos.z - u.pos.z;
      const along = ox * fx + oz * fz;
      if (along < 0.8 || along > L) return;
      // 馬上の的の高さを合わせ、弾の散りと身動きの余裕も取る。
      const y = u.pos.y + 1.46 + ((tp.y ?? u.pos.y) + (t.mounted ? RIDE.y : 0) + 1.2 - u.pos.y - 1.46) * along / d;
      if (y < o.pos.y - 0.3 || y > o.pos.y + (o.mounted ? RIDE.y + 1.72 : 1.72) + 0.3) return;
      if (Math.abs(ox * fz - oz * fx) < 0.55 + along * 0.025) hit = true;
    });
    return hit;
  },

  // ---------------- 狭間・柵ごしに撃つ ----------------
  // 塀・柵の上の高さ
  wallTop(s, x, z) { return this.world.heightAt(x, z) + (s.h || (/塀|壁|門|石垣|櫓/.test(s.name || '') ? 3 : 2.1)); },
  // u から tp へ撃つ線を、自分の方の塀・柵がさえぎるか（さえぎる物を返す。無ければ null）
  // 狭間の後ろに立つ者はその穴から、柵のすぐ後ろ（筒先が柵の外へ出る所）の者は柵の隙間から、櫓や石垣の上の者は塀の上越しに撃てる
  shotBlocked(u, tp) {
    const eye = u.pos.y + (u.mounted ? RIDE.y : 0) + 1.46;
    const L = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z) || 1;
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team !== u.team) continue;
      const q = segHit(u.pos.x, u.pos.z, tp.x, tp.z, s.seg);
      if (q < 0) continue;
      const cx = u.pos.x + (tp.x - u.pos.x) * q, cz = u.pos.z + (tp.z - u.pos.z) * q;
      if (/柵/.test(s.name || '') && q * L < 1.1) continue;
      if (eye > this.wallTop(s, cx, cz) + 0.25) continue;
      const m = u.sama;
      // 狭間の穴を抜ける線（穴の正面から 55 度まで。斜めに撃つと、塀を越す所は穴の真ん中から少しずれる）
      if (m && this.atLoop(u) && Math.hypot(cx - m.x, cz - m.z) < 1.0) continue;
      return s;
    }
    return null;
  },
  // o が u から見て、敵方の塀の向こうに隠れているか（狭間に付いた者・塀より高い所の者は見える。柵は透けて見える）
  hiddenBehind(u, o) {
    if (o.isStruct) return false;
    for (const s of this.structs) {
      if (!s.alive || !s.seg || s.team === u.team || s.team !== o.team || /柵/.test(s.name || '')) continue;
      const q = segHit(u.pos.x, u.pos.z, o.pos.x, o.pos.z, s.seg);
      if (q < 0) continue;
      if (this.atLoop(o)) return false;
      const cx = u.pos.x + (o.pos.x - u.pos.x) * q, cz = u.pos.z + (o.pos.z - u.pos.z) * q;
      if (o.pos.y + (o.mounted ? RIDE.y : 0) + 1.5 > this.wallTop(s, cx, cz)) return false;
      return true;
    }
    return false;
  },
  // 狭間・柵ぎわの持ち場に着いているか
  atLoop(u) { return !!u.loopP && Math.hypot(u.loopP.x - u.pos.x, u.loopP.z - u.pos.z) < 0.55; },
  // 塀の区画の狭間（bhelp の attachSama や wallLine の sama で決まる。無ければ 1.5m ごと＝塀の形の穴と同じ割り方）
  samasOf(s) {
    if (s.sama) return s.sama;
    s.sama = [];
    // 狭間のあるのは城の塀だけ（寺の築地塀・柵・門には無い）
    if (!(s.samaStep || s.name === '塀') || s.gate !== undefined || s.port) return s.sama;
    const [ax, az, bx, bz] = s.seg, L = Math.hypot(bx - ax, bz - az) || 1;
    const n = Math.max(1, Math.round(L / (s.samaStep || 1.5)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      s.sama.push({ s, x: ax + (bx - ax) * t, z: az + (bz - az) * t, kind: s.samaStep ? null : i % 2 ? 'bow' : 'gun', nx: -(bz - az) / L, nz: (bx - ax) / L, by: null });
    }
    return s.sama;
  },
  // 狭間 m から tp を狙えるか（穴の正面から 55 度まで・届く所）。side は兵の立つ側
  samaAims(m, side, tp, range) {
    const dx = tp.x - m.x, dz = tp.z - m.z, d = Math.hypot(dx, dz) || 1;
    return -(dx * m.nx + dz * m.nz) * side / d > 0.57 && d <= range + 1;
  },
  freeSama(u) {
    if (u.sama && u.sama.by === u) u.sama.by = null;
    u.sama = null; u.loopP = null;
  },
  // 撃つ持ち場：柵なら、撃つ線が柵を越す所のすぐ後ろ。塀なら、近くの空いた狭間の真後ろ（一人ずつ）
  loopPost(u, tp, wb) {
    if (/柵/.test(wb.name || '')) {
      const [ax, az, bx, bz] = wb.seg, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, L = Math.sqrt(l2);
      const q = segHit(u.pos.x, u.pos.z, tp.x, tp.z, wb.seg);
      const t = q < 0 ? 0.5 : Math.max(0.08, Math.min(0.92, (((u.pos.x + (tp.x - u.pos.x) * q) - ax) * dx + ((u.pos.z + (tp.z - u.pos.z) * q) - az) * dz) / l2));
      const cx = ax + dx * t, cz = az + dz * t, nx = -dz / L, nz = dx / L;
      if (Math.hypot(cx - u.pos.x, cz - u.pos.z) > 7) return null;
      const sd = (u.pos.x - cx) * nx + (u.pos.z - cz) * nz > 0 ? 1 : -1;
      if (u.sama) this.freeSama(u);
      u.loopP = { x: cx + nx * sd * 0.65, z: cz + nz * sd * 0.65 }; u.loopT = this.time;
      return u.loopP;
    }
    let m = u.sama;
    if (m && !(m.s.alive && m.by === u && this.samaAims(m, u.loopSide, tp, u.range))) { this.freeSama(u); m = null; }
    if (!m && !(u.samaSeekT > this.time)) {
      u.samaSeekT = this.time + 0.4 + Math.random() * 0.3;
      let best = null, bd = 196, bs = 1;
      for (const s of this.structs) {
        if (!s.alive || !s.seg || s.team !== u.team || distToSeg(u.pos.x, u.pos.z, s.seg) > 14) continue;
        for (const c of this.samasOf(s)) {
          if (c.by && c.by !== u && c.by.alive && c.by.sama === c) continue;
          const side = (u.pos.x - c.x) * c.nx + (u.pos.z - c.z) * c.nz > 0 ? 1 : -1;
          if (!this.samaAims(c, side, tp, u.range)) continue;
          // 鉄砲は鉄砲狭間、弓は矢狭間を先に選ぶ
          const k = (c.x - u.pos.x) ** 2 + (c.z - u.pos.z) ** 2 + (c.kind && c.kind !== u.type ? 16 : 0);
          if (k < bd) { bd = k; best = c; bs = side; }
        }
      }
      if (best) {
        if (u.sama) this.freeSama(u);
        best.by = u; u.sama = best; u.loopSide = bs;
        u.loopP = { x: best.x + best.nx * bs * 0.64, z: best.z + best.nz * bs * 0.64 };
      }
      m = best;
    }
    if (!m) return null;
    u.loopT = this.time;
    return u.loopP;
  },

  // 前の段にいる鉄砲か
  gunFront(u) {
    const g = u.group;
    if (g.salvoOnly && u.salvoAt !== g.salvoAt) return false;
    const { cols } = g.layout(g.initial);
    return u.slot >= g.initial || g.gunSlot(u.slot, g.initial, cols).row === 0;
  }
};
