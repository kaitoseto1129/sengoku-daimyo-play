import { WorldWeather } from './world_weather.js';
import { WorldGround } from './world_ground.js';
import { WorldScenery } from './world_scenery.js';
import { WorldSmoke } from './world_smoke.js';
import { WorldSky } from './world_sky.js';
import { WorldHaze } from './world_haze.js';
import { WorldWater } from './world_water.js';
import { WorldGrass } from './world_grass.js';
import { WorldArmyScene } from './world_army_scene.js';
import { WorldArmy } from './world_army.js';
import { WorldFire } from './world_fire.js';
import { WorldTerrain } from './world_terrain.js';
import { WorldVegetation } from './world_vegetation.js';
import { WorldBirds } from './world_birds.js';
import { WorldRain } from './world_rain.js';
import { WorldVisibility } from './world_visibility.js';
import { WorldLod } from './world_lod.js';
import { WorldUpdate } from './world_update.js';
import { NEAR_REQ, ARMY_NEAR, ARMY_REAL_R, ARMY_REAL_P, ARMY_SPLIT_R, ARMY_P } from './world_army_shader.js';
import { ArmyBatch } from './army_batch.js';
import * as THREE from 'three';
import { guardDrawCamera } from './render_camera.js';
import { S as SETTINGS } from './settings.js';
import { isNoRender, HALF, SEG, distToPolyline, fordLift, FIRE_FILL, roadTag, tuftClumpAt } from './world_common.js';
import { _shC, shadowRange } from './world_shadow.js';
import { fieldState } from './world_fields.js';
import { WIND_STATE, WIND_DIR, WIND, GUST, MOOD_BY_SEED } from './world_weather.js';
import { castlePlan, castleInside, castleHeight } from './world_castle.js';
import { BattleTime } from './battle_time.js';
import { POST } from './post.js';
import { groundAt } from './floors.js';


export class World {
  constructor(scene, def) {
    for (const k of Object.keys(NEAR_REQ)) delete NEAR_REQ[k];   // 前の戦の頼みを持ち越さない
    ARMY_NEAR.value = 0;
    ARMY_REAL_R.value = 0;
    ARMY_REAL_P.value.set(1e5, 1e5);
    this.scene = scene;
    scene.userData.limitedUnitShadows = true;
    this.def = def;
    this.nearView = true;
    // 実描画の値を同じ入れ物へ記録する。前後比較は同じ戦・視点で読む。
    this.nearViewInfo = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, far: 150 };
    this.armyBatch = new ArmyBatch(scene, {
      uArmyNear: ARMY_NEAR, uArmyRealR: ARMY_REAL_R, uArmySplitR: ARMY_SPLIT_R,
      uMoveLim: { value: 176 },
    });
    this.shadowWalk = { targets: [], roots: [], frozen: [], cache: new WeakMap(), matrix: new THREE.Matrix4(), world: new THREE.Matrix4() };
    // 全部の戦で、描く直前に今の視点で遠景と軽い兵の形を選び直す（描かない早送りの後の最初の一枚も、遊びの時と同じ軽さで描く）
    {
      const before = scene.onBeforeRender;
      scene.onBeforeRender = (r, sc, cam, target) => {
        this.armyBatch.restore();
        before.call(sc, r, sc, cam, target);
        if (cam?.isPerspectiveCamera && cam.far > 150) { cam.far = 150; cam.updateProjectionMatrix(); }
        // 写真用の直接描画でも斜面の内側へ入らない。地面の面を選ぶ前に視点を補正する。
        if (this.def.terrainContactView && cam?.isPerspectiveCamera && this.terrain) {
          this.drawContact || (this.drawContact = {});
          guardDrawCamera(this, cam, this.drawContact);
        }
        // 索引の転送より先に地面の面を選ぶ。地面自身の描画直前では一コマ遅れる。
        if (cam && this.terrain?.visible) {
          const terrain = this.terrain;
          terrain.updateWorldMatrix(true, false);
          terrain.onBeforeRender(r, sc, cam, terrain.geometry, terrain.material, null);
        }
        if (!cam?.isPerspectiveCamera) {
          // 上から見る地図へ替えた時は、直前の画面外判定を持ち越さない。
          if ((this.def.armyViewCull ?? true) && this.armyView?.active) { this.detailCam = cam; this.lodTick(0, true); }
          return;
        }
        // 早送り・一時停止の後も、最初の一枚から今の視点で遠景を選ぶ。
        // 草木の詰め直しは視点が変わった時だけ。兵の形の一斉更新は視点の交換・大きな移動の時だけ。
        const e = cam.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
        if (this.firePool) {
          this.assignFireLights(0, this.fireCamera.set(x, y, z));
          this.updateFireFill(x, z);
        }
        const detailMove = Math.abs(x - this.detailX) + Math.abs(y - this.detailY) + Math.abs(z - this.detailZ);
        const detailFresh = this.detailCam !== cam || this.detailQuality !== SETTINGS.quality ||
          detailMove > 8 || (this.detailWorldTime === this.time && detailMove > 1) || isNoRender() ||
          (this.def.armyViewCull ?? true) && (!this.armyView || this.armyView.direction.dot(_shC.set(-e[8], -e[9], -e[10])) < 0.9994 ||
            Math.abs(x - this.armyView.position.x) + Math.abs(y - this.armyView.position.y) + Math.abs(z - this.armyView.position.z) > 8 || this.armyView.projection !== cam.projectionMatrix.elements[0]);
        this.detailCam = cam; this.detailQuality = SETTINGS.quality;
        this.detailWorldTime = this.time;
        this.detailX = x; this.detailY = y; this.detailZ = z;
        ARMY_P.value.set(x, z);
        this.lodTick(0, detailFresh);
        // 描かない早送りの後も、足もとの草を今の場所へ敷いてから詰める
        if (this.lastFocus) this.updateNearGrass(this.lastFocus, detailFresh);
        this.packNearGrass(cam);
        for (const detail of this.soldierDetails || []) detail(r, sc, cam);
        this.cullCam = cam; this.cullTick();
        // 建物・地形・草木の陰影は既存の頂点色で保ち、動く影を落とさない。
        const shadowFocus = this.lastFocus || this.sun.target.position;
        shadowRange(sc, shadowFocus.x, shadowFocus.z, this.shadowWalk, 0);
        this.armyBatch.draw(r, cam, this.armies, this.clashes);
      };
      const after = scene.onAfterRender;
      scene.onAfterRender = (r, sc, cam, target) => {
        // 次の進行で作る遠近の写しへ、描画中だけの非表示を持ち越さない。
        this.armyBatch.restoreLayers();
        after.call(sc, r, sc, cam, target);
        if (cam?.isPerspectiveCamera) {
          const info = this.nearViewInfo;
          info.calls = r.info.render.calls; info.triangles = r.info.render.triangles;
          info.geometries = r.info.memory.geometries; info.textures = r.info.memory.textures;
          info.programs = r.info.programs?.length || 0; info.far = cam.far;
        }
      };
    }
    this.field = fieldState(def);
    this.villageFields = [];
    // 川と田は全戦で足を取る。明示した例外だけ止める。
    if (def.waterSlow == null) def.waterSlow = true;
    // 浅瀬で詰まった時だけ、既存の当たりを確かめる横への押し出しを使う。
    // 戦の定義を再利用する時も、前の世界への参照を残さない。
    if (def.streams?.length && (def.blockedEscape == null ||
      Object.getOwnPropertyDescriptor(def, 'blockedEscape')?.get?.name === 'waterBlockedEscape')) {
      const world = this;
      this.waterBlockedEscapeGetter = function waterBlockedEscape() { return !!world.waterEscapeNear; };
      Object.defineProperty(def, 'blockedEscape', { configurable: true, enumerable: true,
        get: this.waterBlockedEscapeGetter });
      if (def.blockedEscapeAfter == null) def.blockedEscapeAfter = 2.5;
    }
    // 広い山城も地面の頂点数は増やさない。
    this.half = def.groundHalf || HALF;
    // 戦ごとの風の向き（def.wind：[x, z]。無ければ雨の向き、それも無ければ南西の風）。旗・煙・草・雨がみな同じ向きに流れる
    { const wd = def.wind || def.rainDir || [0.565, 0.825], l = Math.hypot(wd[0], wd[1]) || 1; WIND_STATE.dirX = wd[0] / l; WIND_STATE.dirZ = wd[1] / l;
      WIND_DIR.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
      WIND_STATE.t = 0; WIND.value = 0;
      WIND_STATE.gust = GUST.value = Math.max(0, def.windStrength ?? 1); }
    this.grid = new Float32Array((SEG + 1) * (SEG + 1));
    this.step = (this.half * 2) / SEG;
    // 城・砦の縄張り（def.castle：{ seed, x, z, kind, n, r, rise }）。地形を段にして、props.js の buildCastle が塀・門・櫓を置く
    this.castle = def.castle ? castlePlan({ ...def.castle, base: def.height(def.castle.x || 0, def.castle.z || 0) }) : null;
    for (let j = 0; j <= SEG; j++) {
      for (let i = 0; i <= SEG; i++) {
        const x = -this.half + i * this.step, z = -this.half + j * this.step;
        let h = def.height(x, z);
        // 細かな起伏：数メートルごとのうねり（平らすぎる地面をなくす）
        const pd = def.paddy ? def.paddy(x, z) : 0;
        const flat = (def.clear && def.clear(x, z)) || pd > 0 || (this.castle && castleInside(this.castle, x, z, 3));
        if (this.castle) h = castleHeight(this.castle, x, z, h);
        // 実測地形に独自の起伏を足す戦では、周期的な細波を二重に載せない。
        if (!flat && !def.noGroundRipples) h += (Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2) * Math.cos(z * 0.27 - x * 0.05) * 0.28 + Math.sin(x * 0.83 + z * 0.61) * 0.07);
        // 田は畦より一段低い（水を張った面が畦に囲まれて見える）。畦が土手に見えるよう、段を深めに
        h -= pd * 0.32;
        // 小川：流れに沿って地面を掘り下げる
        for (const st of def.streams || []) {
          const d = distToPolyline(x, z, st.pts);
          if (d < st.w * 2) h -= (st.depth - fordLift(st, x)) * Math.pow(1 - d / (st.w * 2), 1.5);
        }
        this.grid[j * (SEG + 1) + i] = h;
      }
    }
    // 朝の戦か（def.mood が無ければ、朝靄の戦を朝とみなす）
    this.mood = def.mood || MOOD_BY_SEED[def.seed] || (def.mist ? 'morning' : 'plain');
    this.buildLights();
    // 炎は既存の発光板・地面の照り・共有の暖色の升で見せる。
    this.firePool = [];
    if (def.waterFireReflections) this.waterFireReflections = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    this.fireCamera = new THREE.Vector3();
    if (true) {
      const data = new Float32Array(64 * 64 * 4);
      this.fireFill = { data, strength: new Float32Array(64 * 64), tex: new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat, THREE.FloatType), time: -1, matTime: -1 };
      FIRE_FILL.map.value = this.fireFill.tex;
      this.fireFill.tex.needsUpdate = true;
    }
    FIRE_FILL.area.value.z = 0;
    this.buildWear();
    this.buildTerrain();
    def.prepareTerrain?.(this);
    this.buildVegetation();
    if (def.water) { this.buildWater(def.water); this.buildReeds(); }
    for (const st of def.streams || []) this.buildStream(st);
    this.buildRain();
    this.buildSky();
    if (def.lightning) this.prepareBolt();
    this.buildFarLand();
    this.buildDust();
    this.buildBirds();
    this.fires = [];
    this.cloudPhase = (def.seed || 0) * 37 % 900;
    this.setTime(def.time || 'day');
    if (BattleTime.supports(def.battleKey)) this.dayClock = new BattleTime(this, def.battleKey);
    this.rainLevel = 0;
    this.targetRain = 0;
    POST.drops = 0; POST.smoke = 0;
    this.updateExposure(99);
  }


  // その地点の草の割合（地面を混ぜた割合から読む。0〜1）
  grassAt(x, z) {
    if (this.def.grassSlopeMax != null && this.slopeTan(x, z) > this.def.grassSlopeMax) return 0;
    if (!this.splat) return 1;
    const fx = Math.max(0, Math.min(SEG - 0.0001, (x + this.half) / this.step));
    const fz = Math.max(0, Math.min(SEG - 0.0001, (z + this.half) / this.step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = j * (SEG + 1) + i, b = a + SEG + 1;
    // 描く地面と同じ三角形で草と水を補間する。丸めた一升の裸地で道肩まで消さない。
    const wa = tx + tz <= 1 ? 1 - tx - tz : 0, wd = tx + tz > 1 ? tx + tz - 1 : 0;
    const wb = tx - wd, wc = tz - wd;
    const wet = this.waterW[a] * wa + this.waterW[a + 1] * wb + this.waterW[b] * wc + this.waterW[b + 1] * wd;
    const grass = this.splat[a * 3] * wa + this.splat[(a + 1) * 3] * wb
      + this.splat[b * 3] * wc + this.splat[(b + 1) * 3] * wd;
    return wet > 0.3 ? 0 : Math.min(grass, this.groundCoverAt(x, z));
  }


  // 草の群落と裸地は遠い株・足元の株・土の絵で同じ分布にする。
  // 歩くたびに乱数で草が生え替わらず、追加の絵も要らない。
  groundCoverAt(x, z) {
    if (!this.def.patchyGround) return 1;
    // 株のまとまりと裸地の境を共用し、別の斑で草を二度間引かない。
    const patch = tuftClumpAt(x, z);
    const cover = Math.max(0.08, Math.min(1, (patch - 0.28) * 2.2));
    return cover * (this.def.groundCover ? this.def.groundCover(x, z) : 1);
  }


  heightAt(x, z) {
    // 北へ長い野戦は、砦の細かな格子を保ったまま外の地面へつなぐ。
    if (this.def.fieldNorth != null && z < -this.half) return this.def.height(x, z);
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const i = Math.max(0, Math.min(SEG - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(SEG - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
    const g = this.grid, W = SEG + 1;
    const a = g[j * W + i], b = g[j * W + i + 1], c = g[(j + 1) * W + i], d = g[(j + 1) * W + i + 1];
    // 小谷の切岸は、描く三角形と同じ平面から高さを読む。四隅の補間では面の下へ目線が入る。
    if (this.def.terrainTriangles) return tx + tz <= 1
      ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }


  // 勾配の急さ（tan）。山城の切岸・急な斜面は登れない（道・梯子・階段＝def.paths は例外）
  slopeTan(x, z) {
    const e = 0.8;
    const h0 = this.heightAt(x, z);
    const hx = this.heightAt(x + e, z) - h0;
    const hz = this.heightAt(x, z + e) - h0;
    return Math.hypot(hx, hz) / e;
  }


  onRoad(x, z) {
    return !!roadTag(this, x, z);
  }


  // 35度ほどより急な坂は、道・梯子・階段の上でなければ登れない（山城の切岸・急な斜面のため）
  // 土塁に climbAt（登れる所）を書いた時は、そのほかの土塁の上は通さない（castle_parts.js の doruiLine が noClimb に置く。束21）
  // この勾配の判定は、noClimb を使う山城の戦か def.climbTan を書いた山の戦でだけ効かせる：野戦は国土地理院の実測地形を混ぜている所があり（例：桶狭間）、
  //   実測の細かい尾根が35度を超える所があって、道から離れると進めなくなってしまったため（kaito 10/1）
  walkable(x, z, y) {
    if (this.def.fieldNorth != null && (z < this.def.fieldNorth + 10 || z > this.half - 10 || Math.abs(x) > this.half - 10)) return false;
    if ((this.def.riverCross || this.def.streams?.some(st => st.fords?.length)) && this.waterFootDepthAt(x, z, groundAt(this, x, z, y ?? this.heightAt(x, z))) > (this.def.wadeDepth ?? 0.85)) return false;
    if (this.noClimb) for (const f of this.noClimb) if (f(x, z)) return false;
    if (!this.noClimb && this.def.climbTan == null) return true;
    return this.slopeTan(x, z) <= (this.def.climbTan ?? 0.70) || this.onRoad(x, z);   // 山の戦は def.climbTan で登れる急さを変える（比叡山）
  }


  // 戦の終わりに呼ぶ：遠景の大軍（addDistantArmy・addBacking・armyHost の後詰め）と軽い大軍の合戦（addClash）が
  //   自前で作った形（InstancedMesh）は戦ごとに clone した物で、兵のジオメトリ（units.js・humans.js）のように使い回さない。
  //   disposeしないと戦をまたいで GPU の持ち物が溜まり続け、重い戦の始まり（brief）で固まって見える一因になる
  //   （材質の map（家紋・旗の絵）は flagTexture のキャッシュを使い回すので、ここでは形と材質だけ dispose する）
  dispose() {
    if (this.groundShades) {
      for (const mesh of this.groundShades) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      this.groundShadeMat.dispose(); this.groundShades.length = 0;
    }
    // 定義は次の戦でも残る。川の判定から終了した戦場全体を抱え込まない。
    // 古い支度の片付けでは、同じ定義に付いた次の戦の判定を消さない。
    if (this.waterBlockedEscapeGetter && Object.getOwnPropertyDescriptor(this.def, 'blockedEscape')?.get === this.waterBlockedEscapeGetter) {
      delete this.def.blockedEscape;
    }
    this.waterBlockedEscapeGetter = null;
    if (this.fireFill) {
      this.fireFill.tex.dispose();
      // 取り消した古い支度から、次の戦の照明画像は外さない。
      if (FIRE_FILL.map.value === this.fireFill.tex) {
        FIRE_FILL.map.value = null;
        FIRE_FILL.area.value.z = 0;
      }
    }
    if (this.fireGlowBatch) { this.scene.remove(this.fireGlowBatch); this.fireGlowBatch.geometry.dispose(); this.fireGlowBatch.material.dispose(); }
    // 影の的（2048²：絵 16MB＋深さ 16MB）と映り込みの的（768×1024：9MB）は three が自分では返さない。題の世界の分が戦の間ずっと GPU に残っていた（10/20 iPhone の GPU process の調べ）
    try { if (this.sun && this.sun.shadow && this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } } catch (e) { /* 返せなくてもよい */ }
    try { if (this.envRT) { this.envRT.dispose(); this.envRT = null; } if (this.pmrem) { this.pmrem.dispose(); this.pmrem = null; } } catch (e) { /* 返せなくてもよい */ }
    if (this.smokeCol) this.smokeCol.far.dispose(this.scene);
    if (this.farFires) this.farFires.dispose(this.scene);
    this.armyBatch.dispose();
    const disposeGrp = (grp) => {
      if (!grp) return;
      grp.traverse((o) => {
        if (o.isInstancedMesh || o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
    };
    for (const A of this.armies || []) disposeGrp(A.mesh);
    for (const C of this.clashes || []) disposeGrp(C.mesh);
    // 木の芯と葉を一緒に描く影の材質も、戦を終えたら手放す。
    const freed = new Set();
    for (const m of this.treeMeshes || []) if (m.customDepthMaterial && !freed.has(m.customDepthMaterial)) {
      m.customDepthMaterial.dispose(); freed.add(m.customDepthMaterial);
    }
    for (const m of this.lodList || []) {
      const L = m.userData.lod;
      for (const g of [L.lo, L.xlo, L.xxlo, L.x4]) if (g && g !== L.hi && !freed.has(g)) { g.dispose(); freed.add(g); }
    }
    this.lodList = [];
    this.soldierDetails = [];
    for (const detail of this.buildingDetails || []) { detail.hi.dispose(); detail.lo.dispose(); }
    this.buildingDetails = [];
    this.armies = []; this.clashes = [];
    if (this.scorches) { this.scene.remove(this.scorches.mesh); disposeGrp(this.scorches.mesh); this.scorches = null; }
  }
}

export { HALF, isNoRender, roadTag, FLAG_MOON, flagMoonlight, rng, distToPolyline } from './world_common.js';

export { hazeAt, WIND_STATE, GUST, WIND_DIR, WET } from './world_weather.js';

export { ARMY_IDLE } from './world_vegetation_materials.js';

export { rippleWater } from './world_water.js';

export { ARMY_NEAR, ARMY_P, ARMY_REAL_P, ARMY_REAL_R, ARMY_REAL_NEAR, ARMY_SPLIT_R, nearHideRequest } from './world_army_shader.js';

export { setRenderer, hasMultiDraw } from './world_sky.js';

export { castlePlan, castleInside, castleHeight } from './world_castle.js';

// 元と同じ試作へ一度だけ移す。毎コマの呼び出しに包みや追加の割り当てを挟まない。
for (const part of [WorldWeather, WorldGround, WorldScenery, WorldSmoke, WorldSky, WorldHaze, WorldWater, WorldGrass, WorldArmyScene, WorldArmy, WorldFire, WorldTerrain, WorldVegetation, WorldBirds, WorldRain, WorldVisibility, WorldLod, WorldUpdate]) {
  const descriptors = Object.getOwnPropertyDescriptors(part.prototype);
  delete descriptors.constructor;
  Object.defineProperties(World.prototype, descriptors);
}
