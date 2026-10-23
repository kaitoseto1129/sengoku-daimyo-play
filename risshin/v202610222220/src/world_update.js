import { isNoRender, NO_STREAMS, distToPolyline } from './world_common.js';
import { WIND, WIND_STATE, GUST, SUN_AXIS, BOLT_COL, WET, TIME } from './world_weather.js';
import { ARMY_MOTION, SHIMMER } from './world_army_shader.js';
import { S as SETTINGS } from './settings.js';
import * as THREE from 'three';
import { trimGeneratedTex } from './generated_tex.js';
import { FLAME_MAT, FLAME_U } from './world_fire.js';
import { setScene } from './audio.js';


export class WorldUpdate {
  update(dt, focus) {
    const draw = !isNoRender();
    // 半秒ごとに川の近くだけ有効にする。止まっているだけでは押し出さない。
    this.waterEscapeT = (this.waterEscapeT || 0) - dt;
    if (this.waterEscapeT <= 0) {
      this.waterEscapeT = 0.5;
      this.waterEscapeNear = false;
      if (focus) for (const st of this.def.streams || NO_STREAMS) {
        if (distToPolyline(focus.x, focus.z, st.pts) >= st.w + 1.5) continue;
        this.waterEscapeNear = this.waterFootDepthAt(focus.x, focus.z, focus.y) <= 0.5;
        if (this.waterEscapeNear) break;
      }
    }
    // 昼には消し、夕・夜に灯す。既存の二〜三個の光を使い回す。
    const beaconLit = this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    for (const f of this.fires) if (f.nightOnly) {
      if (f.lit !== beaconLit) this.fireLightT = 0;
      f.lit = f.flame.visible = f.inner.visible = f.glow.visible = beaconLit;
    }
    if (draw) {
      if (true) this.fireLightT = Math.max(0, (this.fireLightT || 0) - dt);
      else this.assignFireLights(dt, focus);
      // 画質「低」：30m より先の火は内の芯の炎を描かない
      if (false && focus && (this.fireCoreT = (this.fireCoreT || 0) - dt) <= 0) {
        this.fireCoreT = 0.5;
        for (const f of this.fires) {
          const d = Math.hypot(f.x - focus.x, f.z - focus.z);
          if (f.inner) f.inner.layers.mask = d > (f.torch ? 12 : 30) ? 0 : 1;
          if (f.flame) for (const c of f.flame.children) c.layers.mask = d > 30 ? 0 : 1;
          if (f.glow) f.glow.layers.mask = d > 70 ? 0 : 1;
        }
      }
      this.lodTick(dt);
      // 景物の詰め直しは描画直前の今のカメラで一束だけ進める。
      // 更新でも進めると、古い視点の一束と描画時の一束が同じコマへ重なる。
    }
    // 小川の石のまわりの泡がゆらぐ
    if (this.streamFoam) for (const f of this.streamFoam) f.material.opacity = 0.28 + Math.sin((this.time || 0) * 3.1) * 0.07;
    this.time = (this.time || 0) + dt;
    WIND.value = this.time;
    ARMY_MOTION.value = SETTINGS.reduceMotion ? 0 : 1;
    // 風の強弱：ゆっくりした息と、ときどきの突風（嵐は強く）
    const T = this.time;
    const storm = this.timeKey === 'storm' ? 1 : 0;
    const breath = 0.5 + 0.5 * Math.sin(T * 0.13) * Math.sin(T * 0.071 + 1.3);
    const gustPulse = Math.pow(Math.max(0, Math.sin(T * 0.29 + Math.sin(T * 0.05) * 3)), 6);
    WIND_STATE.gust = Math.max(0, this.def.windStrength ?? 1) * (0.55 + breath * 0.45 + gustPulse * 0.7 + storm * 0.6 + this.rainLevel * 0.3);
    WIND_STATE.t = T;
    GUST.value = WIND_STATE.gust;
    this.updateFade(dt);
    if (this.dayClock) this.dayClock.tick(dt);
    this.updateExposure(dt);
    // 日は戦の間も少しずつ動く（六分で十度ほど西へ回り、影の向きが変わっていく）。朝の日は少しずつ昇る
    if (!this.dayClock && !this.fade && this.sunOffset && this.timeKey !== 'night') {
      const a = dt * 0.0005 * (this.def.sunDriftSign ?? 1);
      this.sunOffset.applyAxisAngle(SUN_AXIS, a);
      if (this.mood === 'morning' && this.timeKey === 'day' && this.sunOffset.y < 90) this.sunOffset.y += dt * 0.02;
      this.skyMat.uniforms.sunDir.value.copy(this.sunOffset).normalize();
    }
    // 雲は旗や煙と同じ風下へ。動きを減らす時は、形も流れもその場で止める
    if (SETTINGS.skyMotion && !SETTINGS.reduceMotion) {
      this.cloudPhase = (this.cloudPhase + dt * (3 + WIND_STATE.gust * 2.5)) % 20000;
      const U = this.skyMat.uniforms, drift = dt * (0.004 + WIND_STATE.gust * 0.002);
      U.cloudShift.value.x += WIND_STATE.dirX * drift;
      U.cloudShift.value.y += WIND_STATE.dirZ * drift;
      U.cloudTime.value += dt;
    }
    if (this.smokeCol) {
      // 煙の色は空の明るさに合わせる（夕暮れ・雨の中で白く光らないように）
      const sc = this.smokeCol.pts.material.uniforms.color.value;
      sc.set(0xc8c6c0).multiply(this.hemi.color).multiplyScalar(1.05).lerp(this.scene.fog.color, 0.35);
      this.updateSmokeColumns(dt);
      this.smokeCol.pts.material.uniforms.wind.value.set(WIND_STATE.dirX, WIND_STATE.dirZ).multiplyScalar(WIND_STATE.gust);
    }
    // 歩いた所を踏む（自分の足もと）。踏み荒らしの絵は時々送り直す
    if (draw && focus && this.lastFoot) {
      const mv = Math.hypot(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z);
      if (mv > 0.6 && this.inWaterAt(focus.x, focus.z, focus.y)) { this.spray(focus.x, focus.z, mv > 1.2 ? 7 : 4); this.lastFoot.copy(focus); }
      else if (mv > 0.6) { this.stampWear(focus.x, focus.z, 0.8, 5); this.footprint(focus.x, focus.z, false, Math.atan2(focus.x - this.lastFoot.x, focus.z - this.lastFoot.z)); this.lastFoot.copy(focus); }
    } else if (focus) (this.lastFoot || (this.lastFoot = new THREE.Vector3())).copy(focus);
    this.wearT = (this.wearT || 0) + dt;
    if (this.wearDirty && this.wearT > 0.5) { this.wearT = 0; this.wearDirty = 0; this.wearTex.needsUpdate = true; }
    this.updateHaze(dt, focus);
    if (this.haze) this.haze.mesh.material.uniforms.color.value.set(this.def.hazeColor ?? (this.timeKey === 'night' ? 0x3a4250 : this.timeKey === 'dusk' ? 0xcbb4a0 : this.timeKey === 'storm' ? 0x9a9e9e : 0xd4d2cc));
    if (this.dustVeil) this.dustVeil.mesh.material.uniforms.color.value.set(this.timeKey === 'dusk' ? 0xb08a68 : 0xa89878);
    // 稲光（豪雨のとき）
    if (this.def.lightning && this.rainLevel > 0.7) {
      this.boltT = (this.boltT ?? 6) - dt;
      // 落ちた所の遠さ（m）を決める。近い稲光ほど明るく、雷鳴は音の速さの分だけ遅れて届く（1km で 3 秒）
      if (this.boltT <= 0) { this.boltT = 8 + Math.random() * 9; this.flashT = 0.35; this.boltD = 350 + Math.random() * Math.random() * 2800; this.showBolt(focus); if (this.onBolt) this.onBolt(this.boltD); }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.35) * (Math.random() < 0.7 ? 1 : 0.3) * Math.min(1.25, 0.45 + 450 / (this.boltD || 900));
      this.skyMat.uniforms.flash.value = f * 0.6;
      this.hemi.intensity = (this.baseHemi || this.hemi.intensity) + f * 2.2;
      // 地面と人が一瞬、青白く照らされる
      if (!this.boltFlashOn) { this.hemiCol0.copy(this.hemi.color); this.boltFlashOn = true; }
      this.hemi.color.copy(this.hemiCol0).lerp(BOLT_COL, Math.min(1, f * 0.8));
      // 稲妻の線は最初の 0.1 秒ほどだけ（二度ちらつく）
      if (this.bolt) { const t = 0.35 - this.flashT; this.bolt.visible = t < 0.06 || (t > 0.09 && t < 0.14); }
    } else if (this.skyMat.uniforms.flash.value) {
      this.skyMat.uniforms.flash.value = 0; this.hemi.intensity = this.baseHemi;
      if (this.boltFlashOn) { this.hemi.color.copy(this.hemiCol0); this.boltFlashOn = false; }
      if (this.bolt) this.bolt.visible = false;
    }
    // 遠景の軍勢がゆっくり揺れる
    // 遠景の軍勢：兵の動きは形の側。ここでは進む・退く・崩れる・付いて歩くを進める
    for (const a of this.armies || []) { a.mesh.position.x = a.x0; if (a.tick) a.tick(dt); }
    // 軽い大軍の合戦（前線の押し合い・討たれる者・崩れ）と、その矢
    for (const c of this.clashes || []) c.tick(dt, focus);
    this.updateClashArrows(dt);
    this.shyTick(dt, focus);
    this.sky.position.copy(focus);
    this.mountains.position.set(focus.x, 0, focus.z);
    this.skyMat.uniforms.time.value = this.time;
    this.skyMat.uniforms.lowDetail.value = 0;
    trimGeneratedTex();
    if (focus) this.lastFocus = focus;
    // 足もとの草は描く直前に進める。同じコマの更新と描画で二度走査しない。
    if (draw) this.updateBirds(dt, focus);
    if (this.waterTex && !SETTINGS.reduceMotion) { this.waterTex.offset.y += dt * 0.03; }
    // 雨で地面が濡れて暗くなる
    // 雨で地面が濡れて暗く、少し光る。雨が止んでもしばらく濡れたまま
    this.wetness = Math.max(this.rainLevel, (this.wetness || (this.def.wetStart || 0)) - dt * 0.004);
    this.groundU.uWet.value = this.wetness;
    this.groundU.uSoilRain.value = this.rainLevel;
    WET.value = this.wetness;
    if (this.onWet) this.onWet(this.wetness);
    // 炎の揺らめき
    if (this.fireFlagsDirty) this.separateFireFlags();
    if (FLAME_MAT) { FLAME_U.uNight.value = this.timeKey === 'night' ? 1 : this.timeKey === 'dusk' ? 0.5 : 0; FLAME_U.uT.value = SETTINGS.reduceMotion ? 0 : this.time; FLAME_U.uWind.value.set(WIND_STATE.dirX * WIND_STATE.gust, WIND_STATE.dirZ * WIND_STATE.gust); }
    let farFireCount = 0;
    for (const f of this.fires) {
      // 消灯した松明の炎だけが空中に残らないよう、表示も灯りに合わせる。
      const distance = this.camRef ? Math.hypot(f.x - this.camRef.position.x, f.base - this.camRef.position.y, f.z - this.camRef.position.z) : 0;
      f.flame.visible = !!f.lit && distance < 120;
      f.inner.visible = !!f.lit && distance < 45;
      for (const child of f.flame.children) child.visible = distance < 45;
      f.far.visible = !!f.lit && distance >= 120;
      if (f.far.visible) farFireCount++;
      f.far.position.set(f.x, f.base, f.z);
      f.far.scale.set(f.size * 1.3, f.size * 1.8, 1);
      f.flame.userData.layersBefore = f.lit ? 2 + f.flame.children.length : 0;
      f.flame.userData.layersAfter = !f.lit ? 0 : distance < 45 ? 2 + f.flame.children.length : 1;
      if (f.glow) f.glow.visible = !!f.lit;
      if (!f.lit) { if (f.light) f.light.intensity = 0; continue; }
      const ft = SETTINGS.reduceMotion ? 0 : this.time;
      const k = 0.85 + Math.sin(ft * 2.3 + f.seed) * 0.1 + Math.sin(ft * 3.7 + f.seed * 2) * 0.08;
      // 揺らめき：形の揺れは板の中（flameMat）。ここは大きさの息づき（ゆっくり伸び縮み）だけ
      f.flame.scale.set(f.size * 0.95 * (0.94 + Math.sin(ft * 2.1 + f.seed) * 0.05), f.size * 1.3 * (0.9 + (k - 0.85) * 0.8), 1);
      f.inner.scale.set(f.size * 0.6, f.size * 0.85 * (0.85 + k * 0.2), 1);
      // 中景は外の一枚へ芯の明るさを含ませ、遠景も息づく大きさを保つ。
      if (distance >= 45 && distance < 120) f.flame.scale.x *= 1.12;
      if (distance >= 120) f.far.scale.y *= 0.9 + (k - 0.85) * 0.8;
      f.flame.position.y = f.base + (k - 0.85) * f.size * 0.15;
      // 水面への映り込みにも同じ明るさを渡す。点光源の有無に依存させない。
      f.lightPower = (f.big || f.torch || f.nightOnly || this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 1 : 0;
      if (f.lightPower > 0) f.lightPower = (f.big && !(this.timeKey === 'dusk' || this.timeKey === 'storm' || this.timeKey === 'night') ? 0.9 : f.big ? 10 : f.torch ? 6 : 8) + k * 0.5 * (f.big ? 1.6 : 1);
      if (f.lightStrength != null) f.lightPower = f.lightStrength * (k / 0.85);
      f.lightPower *= this.def.fireLightLift || 1;
      if (f.light) {
        f.light.intensity = f.lightPower;
        f.light.position.set(f.x, f.base + (f.big ? f.size * 0.3 : 0.25), f.z);
      }
      if (f.glow) {
        f.glow.material.opacity = (this.timeKey === 'night' ? 0.22 : f.torch ? 0 : this.timeKey === 'night' ? 0.16 : this.timeKey === 'dusk' || this.timeKey === 'storm' ? 0.12 : 0.04) * f.glowFalloff * (0.8 + k * 0.25);
        if (f.torch) f.glow.position.set(f.x, this.heightAt(f.x, f.z) + 0.04, f.z);
      }
    }
    if (this.farFires) this.farFires.mesh.visible = farFireCount > 0;
    if (this.waterFireReflections) {
      // 点光源を省いても川の炎は残す。既存の三枠へ近い火を入れ、四成分目は選別の距離に使う。
      const reflections = this.waterFireReflections;
      for (const reflection of reflections) reflection.set(0, 0, 0, 4900);
      for (const f of this.fires) {
        if (!f.lit || !f.waterReflection || !(f.lightPower > 0)) continue;
        const d2 = (f.x - focus.x) ** 2 + (f.base - focus.y) ** 2 + (f.z - focus.z) ** 2;
        for (let i = 0; i < reflections.length; i++) {
          if (d2 >= reflections[i].w) continue;
          for (let j = reflections.length - 1; j > i; j--) reflections[j].copy(reflections[j - 1]);
          reflections[i].set(f.x, f.z, f.lightPower, d2);
          break;
        }
      }
    }
    if (draw && !SETTINGS.reduceMotion) this.updateEmbers(dt, focus);
    // 火の音：近くの火のはぜる音と、遠くの大きな火の低い唸り（audio の ambience が鳴らす）
    {
      let near = 0, far = 0;
      for (const f of this.fires) {
        if (!f.lit) continue;
        const d = Math.hypot(f.x - focus.x, f.z - focus.z), sz = f.size || 1;
        near = Math.max(near, Math.min(1, sz / 1.3) * (1 - Math.min(1, d / (8 + sz * 4))));
        if (sz >= 2) far = Math.max(far, Math.min(1, sz / 4) * (1 - Math.min(1, d / 120)));
      }
      setScene({ fire: near, fireFar: far, wet: this.wetness || 0 });
      this.updatePall(dt, focus);
    }
    // 土ぼこりと泥はね
    if (draw) {
      this.updatePuffs(this.dustP, dt, 0);
      this.updatePuffs(this.mudP, dt, 9);
      this.updatePuffs(this.sprayP, dt, 9);
      this.updateFootWaves(dt);
    }
    // 影の範囲をプレイヤー周辺に追従
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    // 雨量を緩やかに変化
    this.rainLevel += (this.targetRain - this.rainLevel) * Math.min(1, dt * 0.4);
    const r = this.rainLevel;
    // 見通し：時間帯の見通しに、戦ごとの霧の遠さ・描画距離の設定・雨・朝靄・硝煙を掛ける
    const L = this.look || TIME.day;
    let vis = L.vis * ((this.def.fogFar || 230) / 230) * (this.distMul || 1);
    // 朝靄：戦の始めは霧が深く、一分ほどでしだいに晴れる（晴れても薄い靄は残る）
    const morningMist = this.dayClock ? this.dayClock.mist : 1;
    const mist = this.def.mist ? (this.dayClock ? morningMist : Math.max(0, 1 - this.time / 60)) : 0;
    vis = vis + ((this.def.mistFar ?? 95) - vis) * mist * mist * (3 - 2 * mist) * 0.9;
    // 雨は遠くを白く隠す。昼の雨は霞を遠くに置き、近い兵の顔・具足・旗の色を残す（夜の雨は闇と合わせて狭いまま）
    vis = vis + ((this.timeKey === 'night' ? 112 : 220) - vis) * r;
    if (this.def.snow) vis *= 1 - this.def.snow * 0.25;
    const smoke = Math.min(1, (this.haze?.k || 0) + (this.dustVeil?.k || 0));
    // 谷の戦では硝煙の粒を残し、左右の山まで白い壁で隠さない。
    vis += (Math.min(vis, this.def.smokeFogFloor ?? 18) - vis) * smoke;
    // 戦ごとの霧の遠さや描画距離を上げても、夜の遠景は闇に沈める。移ろい中は徐々に狭める。
    if (this.timeKey === 'night') {
      const k = this.fade ? Math.min(1, this.fade.t / this.fade.dur) : 1;
      const s = k * k * (3 - 2 * k);
      vis += (Math.min(vis, this.def.nightFogFar ?? TIME.night.vis) - vis) * s;
    }
    const viewLimit = Math.max(80, Math.min(320, this.def.battleViewDistance ?? 80));
    vis = Math.min(Math.max(140, viewLimit), vis);
    // 身の回りを優先する。近い乱戦を残し、遠い地形は八十メートルまでに霞ませる。
    if (!this.def.town && !this.def.dojo && !this.detailCam?.isOrthographicCamera)
      vis = Math.min(vis, viewLimit);
    // 雨中の色の抜けは霞だけへ渡す。遠景の細部や指物を描く距離は増やさない。
    // 霞は少し薄く（隠しすぎない。kaito 10/23 稲生 20）。描く距離（detailVis）は増やさない。
    const fogBase = vis + (this.def.rainFogLift || 0) * r * (1 - smoke);
    const fogVis = fogBase * (this.def.town || this.def.dojo || this.timeKey === "night" ? 1 : 1.15);
    this.detailVis = vis;
    // 敵の発見や案内が参照する見通しは保ち、難しさを変えない。
    this.vis = fogBase;
    // 遠くの軍勢の陽炎：晴れて乾いた昼・午後ほど強く、雨・朝靄・夕暮れでは弱い
    const hot = L === TIME.day || L === TIME.after ? 1 : L === TIME.morning ? 0.4 : 0.2;
    SHIMMER.value = hot * (1 - r) * (1 - mist) * (1 - Math.min(1, (this.wetness || 0) * 1.5));
    // 雲の影は、雨・画質「低」では無し
    const cloud = Math.min(0.95, (L.cloud || 0) * (1 - r) * (1));
    this.scene.fog.near = this.cloudPhase;
    this.scene.fog.far = Math.floor(Math.max(20, fogVis)) + Math.max(0, Math.min(0.95, cloud));
    // 遠景の山の霞を、霧の式に合わせる
    this.mountU.hazeCol.value.copy(this.scene.fog.color);
    this.mountU.mist.value = Math.max(mist, r, this.mood === 'morning' ? 0.35 * morningMist : 0);
    this.mountU.vis.value = fogVis; this.mountU.rain.value = r;
    // 遠い層ほど少なくともこれだけは霞む（晴れた日でも遠い峰は青く抜ける）
    // 雨の日は日の光が弱い（雨の強さで絞る。戦の側が直に入れた値にも掛け算で重ねる）
    { const dim = 1 - r * 0.4; if (Math.abs(dim - (this.rainDim || 1)) > 1e-4) { this.sun.intensity *= dim / (this.rainDim || 1); this.rainDim = dim; } }
    this.skyMat.uniforms.rain.value = r;
    // 朝焼け・夕焼けの移ろい：夕暮れは時が経つほど橙から紅へ深まる。朝は紅から金へ褪せる
    if (this.timeKey === 'dusk') this.duskT = (this.duskT || 0) + dt; else this.duskT = 0;
    const age = this.timeKey === 'dusk' ? (this.dayClock ? Math.max(0, Math.min(1, (this.dayClock.hour - 16) / 2)) : Math.min(1, this.duskT / 300)) : this.mood === 'morning' && this.timeKey === 'day' ? (this.dayClock ? 0.7 * morningMist : Math.max(0, 0.7 - (this.time || 0) / 300)) : 0;
    this.skyMat.uniforms.age.value += (age - this.skyMat.uniforms.age.value) * Math.min(1, dt * 0.5);
    // 霧の中の光の筋：朝靄・朝・雨上がりに、日の差す向きへ斜めの光の帯（雨と嵐では無し）
    {
      const after = this.timeKey === 'after' ? Math.max(0, 1 - (this.afterT || 0) / 150) * 0.8 : 0;
      const sm = Math.max(mist, this.def.mist ? 0.35 * morningMist : 0, this.mood === 'morning' && this.timeKey === 'day' ? 0.45 * morningMist : 0, after, this.timeKey === 'dusk' ? 0.25 : 0);
      this.updateShafts(sm * (1 - r) * (this.timeKey === 'storm' ? 0 : 1), focus);
    }
    for (const m of this.mountains.children) m.material.uniforms.haze.value = Math.min(0.9, Math.max(this.def.mountainHaze ?? 0, 0.2 + m.material.uniforms.layer.value * 0.17));
    if (!draw) return; // 雨量・濡れ・霧・硝煙・遠景の戦況は上で進め、雨粒の絵だけ省く。
    this.updateHail(dt, focus, r);
    if (this.def.snow && r <= 0.03) { this.updateSnow(dt, focus); return; }
    this.rain.visible = r > 0.03;
    if (!this.rain.visible) { this.splashPts.visible = false; this.rainNear.visible = false; return; }
    if (this.def.snow) {
      this.rain.material.color.setHex(0xc9d2d6);
      this.rain.geometry.setDrawRange(0, this.rainData.length / 3 * 2);
    }
    this.rain.material.opacity = (this.def.rainOpacity ?? 0.24) * r;
    const arr = this.rain.geometry.attributes.position.array;
    const d = this.rainData;
    const N = d.length / 3;
    const count = Math.floor(N * r);
    this.rain.geometry.setDrawRange(0, count * 2);
    // 雨筋は風下へ斜めに流れ、突風で強く傾く。粒ごとに速さと長さが違う（近い粒ほど長い筋に見える）
    // 戦ごとに雨の吹く向きを決められる（def.rainDir：[x, z]。桶狭間は織田の背から今川の顔へ）
    const RD = this.def.rainDir, rdx = RD ? RD[0] : WIND_STATE.dirX, rdz = RD ? RD[1] : WIND_STATE.dirZ;
    const wk = (RD ? 4.5 : 2.5) + WIND_STATE.gust * 4.5, wdx = rdx * wk, wdz = rdz * wk;
    for (let i = 0; i < N; i++) {
      const sp = 24 + (i % 7) * 1.6;
      d[i * 3 + 1] -= dt * sp;
      d[i * 3] += dt * wdx; d[i * 3 + 2] += dt * wdz;
      if (d[i * 3 + 1] < 0) { d[i * 3 + 1] += 30; d[i * 3] = (Math.random() - 0.5) * 70; d[i * 3 + 2] = (Math.random() - 0.5) * 70; }
      if (i >= count) continue;
      const x = focus.x + d[i * 3], y = focus.y - 6 + d[i * 3 + 1], z = focus.z + d[i * 3 + 2];
      const o = i * 6;
      const len = 0.025 * (0.7 + (i % 5) * 0.15);
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x - wdx * len; arr[o + 4] = y + sp * len; arr[o + 5] = z - wdz * len;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.updateNearRain(dt, r, wdx, wdz);
    // 跳ね：足もと20mほどの地面に、雨の強さに応じて
    this.splashPts.visible = true;
    const sp = this.splash, SN = this.splashT.length, SL = this.splashLine;
    const splashScale = this.def.rainSplashScale ?? 1;
    for (let i = 0; i < SN; i++) {
      this.splashT[i] -= dt;
      if (this.splashT[i] <= 0) {
        if (Math.random() > r) { sp[i * 3 + 1] = -999; this.splashT[i] = 0.1; }
        else {
          const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 20;
          const x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
          sp[i * 3] = x; sp[i * 3 + 1] = this.heightAt(x, z) + this.waterDepthAt(x, z) + 0.02; sp[i * 3 + 2] = z;
          this.splashT[i] = 0.08 + Math.random() * 0.12;
        }
      }
      // 冠は跳ねた直後に開き、すぐ消える
      const k = 1 - Math.max(0, this.splashT[i]) / 0.2, x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2];
      for (let q = 0; q < 3; q++) {
        const a = q * 2.09 + i, o = i * 18 + q * 6, rr = (0.03 + k * 0.05) * splashScale;
        SL[o] = x + Math.cos(a) * 0.015 * splashScale; SL[o + 1] = y; SL[o + 2] = z + Math.sin(a) * 0.015 * splashScale;
        SL[o + 3] = x + Math.cos(a) * rr; SL[o + 4] = y + (0.04 + k * 0.05) * splashScale; SL[o + 5] = z + Math.sin(a) * rr;
      }
    }
    this.splashPts.geometry.attributes.position.needsUpdate = true;
  }
}
