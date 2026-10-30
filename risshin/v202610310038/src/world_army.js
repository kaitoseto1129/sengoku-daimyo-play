import { rng, SEG } from './world_common.js';
import * as THREE from 'three';
import { armyGeometryCopy, armyLayout, soldierGeo, clothGeo, soldierTint, horseGeo, horseGeoX3, armyPart, armyViewTest, frontKeep, lowKeep, hostGeo } from './world_army_geometry.js';
import { flagTexture, yoseFlagTexture, yoseFlagKinds } from './textures.js';
import { WIND, GUST } from './world_weather.js';
import { ARMY_IDLE } from './world_vegetation_materials.js';
import { ARMY_REAL_R, armyShader, CLASH_NB, CLASH_ROW, clashShader, nearHideRequest } from './world_army_shader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MEM_TIGHT, S as SETTINGS } from './settings.js';
import { mixFor, K_PORTER } from './army_mix.js';
import { armyScale } from './army_scale.js';
// 携帯の間引きの割合は十六段に丸める。カメラが少し動くたびに人数が変わり、全軍の束（army_batch.js）が兵を詰め直すのを減らす（大軍でも重くしない）
const keepStep = (v) => Math.max(1 / 16, Math.floor(v * 16) / 16);

const PORTER_TINT = new THREE.Color(0.95, 0.86, 0.7);
let SASHI_GEO = null, KIBA_FLAG_GEO = null, BANNER_GEO = null, YOSE_BANNER_GEO = null, YOSE_PLUME_GEO = null;

export class WorldArmy {

  addDistantArmy(o) {
    const LOG = globalThis.__mixLog;   // 割合を数える道具（tools/armymix.js）だけが置く
    if (!o.people && this.outsideNearView(o.x, o.z, Math.hypot(o.w || 20, o.d || 10))) { if (LOG) LOG.push({ w: 'far', mon: o.mon || o.flag || o.flagTex?.userData.mon, kind: o.kind || 'mixed', n: o.count || 300 }); return this.emptyDistantArmy(o); }
    const mon = o.mon || o.flag || o.flagTex?.userData.mon;
    const familyMon = o.yoseFamily || (['takeda', 'akazonae', 'furin', 'azai', 'asakura', 'imagawa'].includes(o.flag) ? o.flag : mon);
    const family = ['takeda', 'akazonae', 'furin'].includes(familyMon) ? 'takeda' : familyMon;
    // 本陣・鉄砲列・指定済みの持ち場は保つ。広い平場の備と騎馬だけ寄せの横隊にする。
    const yose = o.yose ?? (!o.people && ['takeda', 'azai', 'asakura', 'imagawa'].includes(family)
      && ['mixed', 'cavalry'].includes(o.kind || 'mixed') && (o.w || 20) >= 8 && (o.d || 10) >= 8);
    const redCavalry = family === 'takeda' && o.kind === 'cavalry';
    o = { ...o, terrainRanks: o.terrainRanks ?? this.def.distantOrganicRanks, yose, flagRate: redCavalry ? 1 : o.flagRate };
    const R = rng(o.seed || 9);
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    const facing = o.facing || 0;
    // 兵の割合（army_mix.js）：後詰めが付く隊は、小者・陣夫を後詰めの奥の列へ回す。付かない隊は隊の後ろに荷駄の列を作る
    const kd0 = o.kind || 'mixed', willHost = !o.people && o.host !== false && kd0 !== 'honjin' && kd0 !== 'cavalry' && (o.count || 300) >= 60 && !this.nearView;
    o.mix = o.mix || mixFor(this.def.battleKey);
    if (o.ownPorters === undefined) o.ownPorters = !willHost && (o.count || 300) >= 30;
    let L;
    if (o.people) {
      const KD = { spear: 0, gun: 1, bow: 2, samurai: 3, banner: 4, rider: 5, seated: 6, porter: K_PORTER };
      L = { list: o.people.map((p) => ({ wx: p.x, wz: p.z, yawW: p.facing ?? facing, k: KD[p.k] ?? (p.k | 0), helm: p.helm ?? (KD[p.k] >= 3 ? 1 : 0), ex: p.ex ?? (p.k === 'spear' ? 1.2 : 0), general: p.general, flag: p.flag ?? (p.k === 'banner' || p.k === 'seated' ? 0 : 1), yaw: 0 })) };
    } else L = armyLayout(o, R);
    if (yose && o.people) {
      L.list.sort((a, b) => (b.k >= 3 ? 1 : 0) - (a.k >= 3 ? 1 : 0) || (b.k === 5 && (b.ex === 0 || b.ex === 2) ? 1 : 0) - (a.k === 5 && (a.ex === 0 || a.ex === 2) ? 1 : 0));
      L.nImp = L.list.filter((p) => p.k >= 3).length;
    }
    const S = L.list, N = S.length;
    if (LOG) { const c = {}; for (const q of S) c[q.k] = (c[q.k] || 0) + 1; LOG.push({ w: o.people ? 'people' : 'army', mon, kind: o.kind || 'mixed', n: N, c }); }
    // 指定した山城だけ、遠景の騎馬武者も徒立ちへ。馬の形と材質を作る前に替える。
    if (this.def.distantFootOnly) for (const s of S) if (s.k === 5) { s.k = 3; s.ex = 0; }
    const near = o.near ?? N <= 160;
    const armor = redCavalry ? 0xb52c20 : o.armor || 0x2a2622;
    const flagKind = o.flag || o.mon || o.flagTex?.userData.mon || 'tokugawa';
    const fieldFlag = this.def.armyFlagKinds?.[flagKind];
    const flagTex = redCavalry ? flagTexture(flagKind === 'furin' ? 'furin_kiba' : 'takeda_kiba') : fieldFlag ? flagTexture(fieldFlag) : o.flagTex || flagTexture(flagKind);
    const U = {
      uYose: { value: yose ? 1 : 0 },
      uFieldRanks: { value: o.fieldRanks === true && o.kind === 'spear' ? 1 : 0 },
      uOrganicRanks: { value: o.terrainRanks ? 1 : 0 },
      uAT: WIND, uGust: GUST, uIdle: ARMY_IDLE, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
      uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
      uTerrainTriangles: { value: this.def.distantTerrainTriangles && this.def.terrainTriangles ? 1 : 0 },
      // 本人から60m（ARMY_REAL_R）の内の軽い兵は描かない（棒人間を出さない。10/10 kaito「なんで棒人間まだいるの」）。そこは本物の兵で埋める
      uNear: { value: 0 }, uUnavailable: { value: 0 }, uRealNear: ARMY_REAL_R,
      uMoveLim: { value: this.def?.moveLim || 176 },
    };
    // 長い守兵の列だけ、中ほどの立体を保つ距離を隊ごとに指定できる。
    if (o.detailMiddle != null) U.uSplitR = { value: new THREE.Vector2(16, o.detailMiddle) };
    // 低の近景は顔・袖・兜を残す軽い立体。遠さに応じて三段階で形を替える。
    const body = new THREE.InstancedMesh(soldierGeo(armor, near), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), N);
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const flagMat = armyShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U);
    if (redCavalry && !KIBA_FLAG_GEO) KIBA_FLAG_GEO = clothGeo(0.3, 1.05, 3, 3, 0, 2.62, -0.17, 11);
    const flags = new THREE.InstancedMesh(redCavalry ? KIBA_FLAG_GEO : SASHI_GEO, flagMat, N);
    const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2);
    const d = new THREE.Object3D(), col = new THREE.Color(), cf = Math.cos(facing), sf = Math.sin(facing);
    const riders = [], bearers = [], chiefs = [];
    let sx = 0, sz = 0;
    S.forEach((s, i) => {
      let x, z, yaw;
      if (s.wx !== undefined) { x = s.wx; z = s.wz; yaw = s.yawW; } else {
        x = o.x + s.lx * cf + s.lz * sf; z = o.z - s.lx * sf + s.lz * cf;
        yaw = facing + s.yaw + (R() - 0.5) * (yose || U.uFieldRanks.value ? 0.04 : 0.24);
      }
      // 山際の控えは列を緩く蛇行させる。人数と進軍の軸は保ち、高さは移した地点で読む。
      if (o.terrainRanks && s.wx === undefined) {
        x += Math.sin(s.lz * 0.19 + o.seed) * 1.6;
        z += Math.sin(s.lx * 0.13 + o.seed * 0.7) * 3.2;
      }
      sx += x; sz += z;
      // 高さは形の側で地面から読み直す（ここの高さは画面の外かどうかの判断用）
      d.position.set(x, this.heightAt(x, z), z);
      d.rotation.set(0, yaw, 0);
      // 背丈と肩幅のばらつき（ときどき大柄な者・小柄な者）
      const tall = yose && s.k === 5 && s.ex === 2 ? 1.02 : 0.891 + R() * 0.063;
      const width = 0.93 + R() * 0.15;
      d.scale.set(tall * width, tall, tall * (0.96 + (width - 1) * 0.6));
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix); flags.setMatrixAt(i, d.matrix);
      // 一人ずつ少し色が違う（使い込んだ具足）
      body.setColorAt(i, !redCavalry && yose && s.k === 5 && s.ex === 2 ? col.set(0xe7c07a) : s.k === K_PORTER ? soldierTint(col, R).multiply(PORTER_TINT) : soldierTint(col, R));
      info.set([R(), s.k, s.helm, s.ex], i * 4); info2.set([s.flag, R()], i * 2);
      if (s.k === 5) { riders.push(i); if (yose && family === 'takeda' && s.ex === 2) chiefs.push(i); }
      if (s.k === 4) bearers.push(i);
    });
    const setInfo = (mesh, idx) => {
      const a = new Float32Array(idx.length * 4), b = new Float32Array(idx.length * 2);
      idx.forEach((j, n) => { a.set(info.subarray(j * 4, j * 4 + 4), n * 4); b.set(info2.subarray(j * 2, j * 2 + 2), n * 2); });
      mesh.geometry = armyGeometryCopy(mesh.geometry);
      mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(a, 4));
      mesh.geometry.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(b, 2));
      mesh.geometry.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(idx.length), 1));
    };
    const all = S.map((_, i) => i);
    setInfo(body, all); setInfo(flags, all);
    this.lodTwin(body, armor);
    body.userData.lod.deep = true;   // 遠い軍勢の体（乱戦の見せ物 addClash とは分ける）
    this.lodFlag(flags);
    const grp = new THREE.Group();
    grp.add(body, flags);
    const m4 = new THREE.Matrix4();
    const copyTo = (mesh, idx) => { idx.forEach((j, n) => { body.getMatrixAt(j, m4); mesh.setMatrixAt(n, m4); }); setInfo(mesh, idx); };
    // 幟（旗持ちの竿から垂れる）
    let banners = null;
    if (bearers.length) {
      let geo = BANNER_GEO, mat = armyShader(new THREE.MeshLambertMaterial({ map: yose && !redCavalry && !this.def.armyFlagKinds ? yoseFlagTexture(family) : flagTex, side: THREE.DoubleSide }), U);
      if (yose) {
        if (!YOSE_BANNER_GEO) YOSE_BANNER_GEO = clothGeo(0.66, 3.7, 3, 6, 0.3, 5.2, 0.14, 12);
        geo = YOSE_BANNER_GEO;
        const compile = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh) => { compile(sh); if (family === 'takeda' && !redCavalry && !this.def.armyFlagKinds) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (clamp(vMapUv.x, 0.008, 0.992) + mod(aInfo.w, 6.0)) / 6.0;'); };
        mat.customProgramCacheKey = () => family === 'takeda' && !redCavalry && !this.def.armyFlagKinds ? '寄せの幟六色' : '寄せの幟';
      }
      banners = new THREE.InstancedMesh(geo, mat, bearers.length);
      copyTo(banners, bearers); this.lodFlag(banners, true, yose); grp.add(banners);
    }
    // 足もとは地形の高さへ合わせる。斜面で浮き、黒い楕円にも見える影の板は置かない。
    // 馬
    let horses = null;
    if (riders.length) {
      horses = new THREE.InstancedMesh(horseGeo(), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), riders.length);
      copyTo(horses, riders); this.lodTwin(horses, null, true, horseGeo(true), 0, horseGeoX3());
      const HC = [0x3a2a1e, 0x4e3624, 0x2a221c, 0x5e4430, 0x6a5040, 0x1e1a18];
      riders.forEach((i, n) => { col.set(yose && S[i].ex === 2 ? 0xe9e4d6 : HC[Math.floor(R() * HC.length)]).multiplyScalar(0.9 + R() * 0.2); horses.setColorAt(n, col); });
      grp.add(horses);
    }
    // 白熊の飾りは中央の一騎だけ。全員の形へ足さず、一枚の形を使い回す。
    let plumes = null;
    if (chiefs.length) {
      if (!YOSE_PLUME_GEO) {
        const P = [];
        const crown = new THREE.SphereGeometry(0.23, 8, 4); crown.scale(1.05, 0.75, 1); crown.translate(0, 1.89, -0.03); armyPart(P, crown, 0xeee8d9, 0);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.45 + i * 1.1 / 6), hair = new THREE.ConeGeometry(0.075, 0.55, 4);
          hair.rotateZ(Math.PI); hair.translate(Math.cos(a) * 0.21, 1.65, -0.12 - Math.sin(a) * 0.17); armyPart(P, hair, 0xe6dfd0, 0);
        }
        YOSE_PLUME_GEO = mergeGeometries(P);
      }
      plumes = new THREE.InstancedMesh(YOSE_PLUME_GEO, armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), chiefs.length);
      copyTo(plumes, chiefs); grp.add(plumes);
    }
    // 本陣：陣幕と馬印
    if (o.kind === 'honjin' && o._maku) this.honjinDressing(grp, o, facing);
    this.scene.add(grp);
    const cx = o.people ? sx / N : o.x, cz = o.people ? sz / N : o.z;
    const A = { mesh: grp, x0: 0, U, body, flags, n: N, nImp: L.nImp ?? N, cx, cz, facing, face0: facing, off: new THREE.Vector3(), tw: null, rout: 0, followFn: null , hw0: (o.w || 20) / 2, hd0: (o.d || 10) / 2, people: !!o.people };
    // 遠くほど兵を間引き、旗は体の二倍まで残す。既存の束と軽い形で旗の林を保つ。
    const cw = new THREE.Vector3(), outside = armyViewTest(body);
    // 同じ描画の体・旗・馬は、遠さを一度だけ数える。
    const lodState = { n: 0, flags: false, gone: false, dd: 0 };
    let lodFrame = -1, lodCam = null;
    const lod = (r, cam) => {
      if (lodFrame === r.info.render.frame && lodCam === cam) return lodState;
      lodFrame = r.info.render.frame; lodCam = cam;
      cw.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(grp.matrixWorld);
      const dd = Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z);
      // 霧の奥（見通しの一倍半より先）はほとんど見えないので描かない
      const vis = this.detailVis || this.vis || 230, gone = dd > vis * 1.5 + 30 || outside(cam, 48 + U.uRoutT.value * 12);
      // 高：45m（本物の兵に替わる輪の外）より先の遠い軍勢は奥ほど間引く（霞の中の人数の厚みは残す）
      const hiQ = true, near0 = Math.min(hiQ ? 45 : 110, vis * 0.6);
      const keep = !MEM_TIGHT ? 1 : this.def.denseFront && false ? frontKeep(this.def, dd) : keepStep((dd < near0 ? 1 : Math.max(hiQ ? 0.3 : 0.4, 1 - (dd - near0) / (hiQ ? 180 : 260))) * lowKeep(dd));
      lodState.n = gone ? 0 : Math.max(A.nImp, Math.ceil(N * keep));
      lodState.flags = !gone && (!MEM_TIGHT || dd < Math.min(230, vis));
      lodState.gone = gone;
      lodState.dd = dd;
      return lodState;
    };
    // 数が 0 になる形（遠い背旗・霧の奥の馬や幟）は、次のコマから描く順に入れない（0 人でも一回ずつ描いていた）。本体の形が見張る
    flags.userData.maskByBody = true;
    body.onBeforeRender = (r, sc, cam) => {
      const l = lod(r, cam); body.count = l.n;
      flags.layers.mask = l.flags && !flags.userData.lod?.sashiCut ? 1 : 0;
      for (const m of [banners, horses, plumes]) if (m) m.layers.mask = l.gone ? 0 : 1;
    };
    // 高は lodTick の兵ごとの選び（lodSplit）が同じ仕事をする。両方だと元の束を消した上に三つの写しを毎コマ描く
    if (o.detailPerSoldier && false) this.soldierDetail(body, grp, armor, o.detailMiddle);
    flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); flags.count = l.flags ? Math.min(N, l.n * 2) : 0; };
    //   馬も、低（携帯）では数を減らす（lowKeep）
    const lodAll = (mesh) => { const n0 = mesh.count; mesh.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); mesh.count = l.gone ? 0 : Math.max(mesh === horses && yose ? Math.min(n0, 21) : 0, Math.ceil(n0 * (mesh === horses ? this.def.denseFront ? frontKeep(this.def, l.dd) : lowKeep(150) : 1))); }; };
    if (banners) lodAll(banners);
    if (horses) lodAll(horses);
    if (plumes) lodAll(plumes);
    // 後詰め：隊の後ろに、同じ旗の軽い兵を厚く続ける（地平を埋める奥行き。本体と同じ動き・崩れ方。戦の数や置き換えには入れない）
    //   奥の列は小者・陣夫（隊と後詰めを合わせて表の二割。混ぜた備えの隊だけ。槍・鉄砲・弓だけの隊の後ろは一割）
    if (!o.people && o.host !== false && kd0 !== 'honjin' && kd0 !== 'cavalry' && N >= 60) {
      const hn = typeof o.host === 'number' ? o.host : Math.round(Math.max(40, Math.min(420, N * 0.8)) * armyScale(this.def.battleKey));   // 戦の兵力で厚く（army_scale.js）
      const pf = Math.min(0.6, (kd0 === 'mixed' ? o.mix.porter : o.mix.porter / 2) * (N + hn) / hn);
      const h = this.armyHost({ x: o.x, z: o.z, facing, w: o.w || 20, d: o.d || 10, count: hn, armor, flagTex, seed: (o.seed || 9) + 71, U, porter: pf });
      if (h.meshes.length) grp.add(...h.meshes);   // 近い視点（nearView）は空。空の add は three が誤りを出す
      A.hostD = h.depth; A.host = h;
    }
    // 逃げる兵は隊の外へ出るので、画面の外かどうかの判断をやめる
    for (const c of grp.children) if (c.isInstancedMesh) c.computeBoundingSphere();
    const ctl = (v) => { for (const c of grp.children) c.position.copy(A.off); return v; };
    grp.advance = (dist, secs, opt = {}) => {
      const fx = Math.sin(A.face0), fz = Math.cos(A.face0);
      A.tw = { from: A.off.clone(), to: A.off.clone().add(new THREE.Vector3(fx * dist, 0, fz * dist)), t: 0, secs: secs || Math.abs(dist) / (opt.charge ? 3 : 1.3), charge: !!opt.charge, back: dist < 0 && opt.turn !== false };
      return grp;
    };
    grp.retreat = (dist, secs) => grp.advance(-Math.abs(dist), secs || Math.abs(dist) / 1.3);
    // 部隊の下知は、初めの向きへ距離だけ進むのでなく、指定された地点へ進む。
    grp.moveTo = (x, z, secs, opt = {}) => {
      const lim = (this.def.moveLim || 176) - Math.max(A.hw0, A.hd0) - 2;
      grp.updateWorldMatrix(true, false);
      const to = new THREE.Vector3(Math.max(-lim, Math.min(lim, x)), 0, Math.max(-lim, Math.min(lim, z)));
      grp.worldToLocal(to); to.y = 0; to.x -= A.cx; to.z -= A.cz;
      const d = to.distanceTo(A.off);
      A.tw = { from: A.off.clone(), to, t: 0, secs: secs || Math.max(0.1, d / (opt.charge ? 3 : 1.3)), charge: !!opt.charge, back: !!opt.back };
      return grp;
    };
    grp.halt = () => { A.tw = null; return grp; };
    grp.rout = (opt = {}) => {
      if (A.rout) return grp;
      A.rout = 1; A.routHide = opt.hideAfter ?? 40; A.tw = null;
      U.uRout.value = 1; U.uRoutT.value = 0;
      for (const c of grp.children) c.frustumCulled = false;
      return grp;
    };
    grp.reform = () => {
      A.rout = 0; A.tw = null; A.off.set(0, 0, 0); ctl();
      U.uRout.value = 0; U.uRoutT.value = 0; U.uMarch.value = 0; U.uCharge.value = 0; U.uTurn.value = 0;
      for (const c of grp.children) { c.visible = true; c.frustumCulled = true; }
      return grp;
    };
    grp.follow = (fn, opt = {}) => { A.followFn = fn; A.gap = opt.gap ?? A.gap ?? 0; A.followSpeed = opt.speed ?? 2.6; return grp; };
    grp.army = A;
    // 本物の兵に道を譲る（yieldArmies）ために、形ごとの入れ物と、旗持ち・騎馬の番を覚えておく
    A.parts = { body, flags, banners, horses, plumes, chiefs, bearers, riders, grp }; A.hid = new Float32Array(N);
    // 最初に道を譲るコマで、軍勢全体の行列を複製しない。
    A.base = body.instanceMatrix.array.slice();
    // 本物の兵に置き換える時に使う：家紋・並び・人ごとの種類（0 槍 1 鉄砲 2 弓 3 侍 4 旗持ち 5 騎馬 6 床几）
    A.mon = o.mon || o.flag || (o.flagTex && o.flagTex.userData.mon) || null; if (o.team !== undefined) A.team = o.team;   // 家紋の無い軽い大軍でも、敵か味方かを渡せる（無いと味方として起きる）
    A.yose = yose; A.yoseFamily = family;
    A.armor = armor; A.kind = o.kind || (o.people ? 'people' : 'mixed'); A.people = !!o.people;
    A.kinds = S.map((s) => s.k); A.taken = new Uint8Array(N); A.took = 0;
    // (x, z) に近い、まだ置き換えていない兵を n 人まで選んで隠し、その場所・向き・種類を返す（r m より遠い者は選ばない）
    // 隠した兵は、大きさを 0 にするだけ（場所は残すので、隊の広がりの計算は変わらない）
    const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), z3 = new THREE.Vector3(0, 0, 0);
    grp.take = (x, z, n, r = 1e9, pick = null, canStand = null) => {
      grp.updateWorldMatrix(true, false);
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (A.taken[i]) continue;
        // 道を譲って隠した兵（大きさ 0）は、元の置き場の行列から向きを取る
        if (A.base && A.hid[i] > 0) m4.fromArray(A.base, i * 16); else body.getMatrixAt(i, m4);
        tp.setFromMatrixPosition(m4).add(A.off); tp.applyMatrix4(grp.matrixWorld);
        // 場外の遠景は戦う兵に替えない。出した後に境界へ飛ばすことを防ぐ。
        const lim = this.def.moveLim || 176;
        if (Math.abs(tp.x) > lim - 1 || Math.abs(tp.z) > lim - 1) continue;
        if (canStand && !canStand(tp.x, tp.z)) continue;
        const d = Math.hypot(tp.x - x, tp.z - z);
        if (d < r && (pick ? pick(A.kinds[i]) : A.kinds[i] !== K_PORTER)) cand.push({ i, d, x: tp.x, z: tp.z, yaw: Math.atan2(m4.elements[8], m4.elements[10]) + grp.rotation.y + (A.tw && A.tw.back ? Math.PI : 0) });
      }
      cand.sort((a, b) => a.d - b.d);
      const out = cand.slice(0, n);
      // 大きさ 0 に（道を譲って既に 0 の兵を分解すると向きが NaN になるので、場所だけ残す）
      const hide = (mesh, j) => { mesh.getMatrixAt(j, m4); tp.setFromMatrixPosition(m4); m4.makeScale(0, 0, 0).setPosition(tp); mesh.setMatrixAt(j, m4); mesh.instanceMatrix.needsUpdate = true; };
      // 隠す前の形を覚えておく（give で軽い兵に戻す時に使う）
      const keep = (mesh, j, i) => { const mm = new THREE.Matrix4(); if (A.base && A.hid[i] > 0) mm.fromArray(A.base, i * 16); else mesh.getMatrixAt(j, mm); return [mesh, j, mm]; };
      for (const c of out) {
        A.taken[c.i] = 1; A.took++;
        const sv = [keep(body, c.i, c.i), keep(flags, c.i, c.i)];
        hide(body, c.i); hide(flags, c.i);
        if (banners) { const j = bearers.indexOf(c.i); if (j >= 0) { sv.push(keep(banners, j, c.i)); hide(banners, j); } }
        if (horses) { const j = riders.indexOf(c.i); if (j >= 0) { sv.push(keep(horses, j, c.i)); hide(horses, j); } }
        if (plumes) { const j = chiefs.indexOf(c.i); if (j >= 0) { sv.push(keep(plumes, j, c.i)); hide(plumes, j); } }
        (A.saved || (A.saved = new Map())).set(c.i, sv);
        c.k = A.kinds[c.i]; c.general = S[c.i].general;
        if (yose) c.flagKind = fieldFlag || (c.k === 4 ? yoseFlagKinds(family)[Math.round(S[c.i].ex) % 6] : o.flag || family);
        const mm = sv[0][2]; mm.decompose(tp, tq, ts);
        c.sx = ts.x; c.sy = ts.y; c.sz = ts.z;
        c.helm = info[c.i * 4 + 2]; c.ex = info[c.i * 4 + 3]; c.flag = info2[c.i * 2];
      }
      return out;
    };
    // (x, z) から r m の内に残っている（まだ替えていない）軽い兵の数
    grp.left = (x, z, r) => {
      grp.updateWorldMatrix(true, false);
      let k = 0;
      for (let i = 0; i < N; i++) { if (A.taken[i]) continue; body.getMatrixAt(i, m4); tp.setFromMatrixPosition(m4).add(A.off); tp.applyMatrix4(grp.matrixWorld); if (Math.hypot(tp.x - x, tp.z - z) < r) k++; }
      return k;
    };
    // take で隠した兵 i を、軽い兵に戻す（本物の兵を大軍の中へ帰す時。帰した兵は、また take で選べる）
    const giveInv = new THREE.Matrix4(), givePos = new THREE.Vector3();
    grp.give = (i, pos = null, yaw = null) => {
      const sv = A.saved && A.saved.get(i);
      if (!sv || !A.taken[i]) return false;
      if (pos) {
        grp.updateWorldMatrix(true, false);
        giveInv.copy(grp.matrixWorld).invert();
        givePos.copy(pos).applyMatrix4(giveInv).sub(A.off);
        const old = sv[0][2].elements, ox = old[12], oz = old[14];
        const turn = yaw === null ? 0 : yaw - grp.rotation.y - Math.atan2(old[8], old[10]);
        m4.makeRotationY(turn);
        for (const [, , mm] of sv) {
          mm.elements[12] -= ox; mm.elements[14] -= oz;
          mm.premultiply(m4);
          mm.elements[12] += givePos.x; mm.elements[14] += givePos.z;
        }
      }
      for (const [mesh, j, mm] of sv) { mesh.setMatrixAt(j, mm); mesh.instanceMatrix.needsUpdate = true; }
      if (A.base) A.base.set(sv[0][2].elements, i * 16);
      if (A.hid[i] > 0) A.hidN = Math.max(0, (A.hidN || 0) - 1);
      A.hid[i] = 0;
      A.saved.delete(i); A.taken[i] = 0; A.took = Math.max(0, A.took - 1);
      return true;
    };
    A.tick = (dt) => {
      if (A._autoDistant && (!grp.visible || SETTINGS.reduceMotion)) return;
      let moving = 0, charge = 0, turn = 0;
      if (A.rout) {
        U.uRoutT.value += dt;
        if (A.routHide && U.uRoutT.value > A.routHide) for (const c of grp.children) c.visible = false;
      } else if (A.tw) {
        const T = A.tw; T.t += dt;
        const k = Math.min(1, T.t / T.secs), e = yose && T.charge ? k * (0.45 + 0.55 * k) : k * k * (3 - 2 * k);
        A.off.lerpVectors(T.from, T.to, e); ctl();
        moving = 1; charge = T.charge ? (yose ? Math.max(0, (k - 0.55) / 0.45) : 1) : 0; turn = T.back ? 1 : 0;
        if (k >= 1) A.tw = null;
      } else if (A.followFn) {
        const t = A.followFn();
        if (t) {
          // 後ろへ付く：隊の真ん中を、相手の後ろ gap m に置く。向きもゆっくり合わせる
          const dh = Math.atan2(Math.sin(t.facing - A.facing), Math.cos(t.facing - A.facing));
          const tx = t.x - Math.sin(t.facing) * A.gap, tz = t.z - Math.cos(t.facing) * A.gap;
          const px = grp.position.x + A.cx, pz = grp.position.z + A.cz;
          const dx = tx - px, dz = tz - pz, dl = Math.hypot(dx, dz);
          const step = Math.min(dl, dt * (A.followSpeed ?? 2.6));
          if (dl > 0.6) { grp.position.x += dx / dl * step; grp.position.z += dz / dl * step; A.x0 = grp.position.x; moving = 1; }
          if (Math.abs(dh) > 0.05) {
            const r = Math.sign(dh) * Math.min(Math.abs(dh), dt * 0.5);
            A.facing += r; grp.rotation.y += r;
            // 回った分だけ、隊の真ん中がずれないように置き直す
            const c = Math.cos(r), s = Math.sin(r), qx = A.cx, qz = A.cz;
            A.cx = qx * c + qz * s; A.cz = -qx * s + qz * c;
            grp.position.x = px - A.cx; grp.position.z = pz - A.cz; A.x0 = grp.position.x;
            moving = 1;
          }
        }
      }
      // 近づかれて退く（shyTick）：背を向けて行けない側へ下がる。進む・付いて歩くの最中でも、その道ごと横へずらす
      if (A.shyV && !A.rout) {
        const sx = A.shyV.x * dt, sz = A.shyV.z * dt;
        A.off.x += sx; A.off.z += sz;
        if (A.tw) { A.tw.from.x += sx; A.tw.from.z += sz; A.tw.to.x += sx; A.tw.to.z += sz; }
        ctl(); A.shyD = (A.shyD || 0) + Math.hypot(sx, sz);
        moving = 1; charge = 0; turn = A.shyV.turn;
      }
      if (A.fadeK !== undefined && A.fadeK > 0) { A.fadeK = Math.max(0, A.fadeK - dt / 3.5); if (!A.fadeK) { grp.visible = false; A.shyV = null; } }
      // 大軍の上の土埃：歩く・駆ける・崩れる時は足もとから土煙が立ち、止まっていても大勢の足踏みで薄いかすみが漂う（乾いた日だけ）
      A.dustT = (A.dustT ?? Math.random() * 3) - dt;
      if (A.dustT <= 0 && N >= 40 && !(A._autoDistant && SETTINGS.reduceMotion)) {
        const run = charge || A.rout, go = moving || run;
        // 大きな軍勢ほど、止まっていても足踏みの土煙が絶えない
        const big = Math.max(0.4, Math.min(1, 250 / (N + (A.hostD ? N * 0.8 : 0))));
        A.dustT = (run ? 0.35 : go ? 0.8 : 4 + Math.random() * 3) * big;
        const W = this;
        if (!(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5)) {
          const hw = (o.w || 20) * 0.5, hd = (o.d || 10) * 0.5, lx = (Math.random() - 0.5) * 2 * hw, lz = go && redCavalry ? hd - 2.5 - Math.random() * 2 : go ? -hd - Math.random() * (A.hostD || hd) : hd - Math.random() * (2 * hd + (A.hostD || 0));
          const c = Math.cos(A.facing), sn = Math.sin(A.facing);
          const rc = Math.cos(grp.rotation.y), rs = Math.sin(grp.rotation.y);
          const x = grp.position.x + A.cx + rc * A.off.x + rs * A.off.z + lx * c + lz * sn;
          const z = grp.position.z + A.cz - rs * A.off.x + rc * A.off.z - lx * sn + lz * c;
          if (!W.inWaterAt(x, z) && grp.visible && W.dustVeil) {
            const dust = W.dustCloud(x, z, !!run || (go && o.kind === 'cavalry'), !!A._autoDistant);
            if (go && !run && dust) {
              const q = dust;
              if (q) { q.s1 *= 1.5; q.a *= 0.7; q.rise *= 0.45; }
            }
            if (!go && dust) { dust.a *= 0.6; dust.s1 *= 1.5; dust.life *= 1.6; }
          }
        }
      }
      // 歩き出し・止まりはなめらかに
      U.uMarch.value += (moving - U.uMarch.value) * Math.min(1, dt * 2.5);
      U.uCharge.value += (charge - U.uCharge.value) * Math.min(1, dt * 1.5);
      U.uTurn.value += (turn - U.uTurn.value) * Math.min(1, dt * 1.8);
    };
    this.armies = this.armies || [];
    this.armies.push(A);
    return grp;
  }


  // 後詰め（隊の後ろに続く軽い兵の厚い層）を作る。返す物：{ meshes, depth }（入れ物に足すのは呼ぶ側）
  // o：{ x, z, facing, w, d, count, armor, flagTex, seed, U }
  //   (x, z, facing) は隊の真ん中と向き、w・d は隊の幅と奥行き。U は動き（進む・崩れる）を共にする隊の uniform
  //   奥ほど列の間が開き、横へ少し広がり、霧の色へ沈む。ところどころ備えの切れ目、後ろの列には幟の林
  //   形は後詰め用の軽い形を使い回し、遠いほど数を間引く。カメラの近く（ARMY_NEAR の外 25m まで）は描かない
  armyHost(o) {
    if (this.nearView) return { meshes: [], depth: 0, n: 0 };
    const R = rng(o.seed || 31);
    const F = o.facing || 0, cf = Math.cos(F), sf = Math.sin(F);
    const w = o.w || 20, hd = (o.d || 10) / 2, n = Math.max(1, o.count | 0);
    // 大きい戦（army_scale.js）は奥行きの上限も伸ばす（地平まで続く備え）。列の数の上限も同じ割合
    const big = armyScale(this.def.battleKey), depth = Math.max(10, Math.min(42 * big, n / Math.max(6, w * 0.8) * 1.4 + 4));
    const S = [];
    // 前の列から後ろへ：列の間は奥ほど開き（1.1m → 1.8m）、横は奥ほど少し広がる
    let z = -hd - 1.2, row = 0;
    const cuts = [];
    for (let x = -w / 2 + 8 + R() * 8; x < w / 2 - 4; x += 10 + R() * 8) cuts.push(x);   // 備えの切れ目
    while (S.length < n && row < 60 * big) {
      const t = Math.min(1, (-z - hd) / depth);
      const ww = w * (1 + t * 0.25), sx = 1.0 + t * 0.45;
      const cols = Math.max(2, Math.round(ww / sx));
      for (let c = 0; c < cols && S.length < n; c++) {
        const lx = -ww / 2 + (c + 0.5) * ww / cols + (R() - 0.5) * sx * 0.5;
        if (cuts.some((q) => Math.abs(lx / (1 + t * 0.25) - q) < 0.8 + t * 1.2)) continue;
        if (R() < 0.06 + t * 0.12) continue;   // 奥ほどまばらに
        const r = R();
        // 幟は奥ほど多く（後ろの備えの旗の林）。列にそろえず散らす
        const k = r < 0.035 + t * 0.07 ? 4 : r < 0.16 ? 3 : 0;
        S.push({ lx, lz: z + (R() - 0.5) * 0.6, t, k, ex: k === 0 ? 1.2 + R() * 0.45 : 0, helm: k === 3 || R() < 0.1 ? 1 : 0, flag: k === 4 ? 0 : R() < 0.82 ? 1 : 0 });
      }
      z -= 1.1 + t * 0.7; row++;
    }
    const realDepth = -z - hd;
    // 奥の列（o.porter の割合）は小者・陣夫：荷を担いで行き来する。幟はそのまま残す（小荷駄の旗）
    if (o.porter > 0) {
      const from = Math.floor(S.length * (1 - o.porter));
      for (let i = from; i < S.length; i++) if (S[i].k !== 4) Object.assign(S[i], { k: K_PORTER, ex: 0, helm: 0, flag: 0 });
    }
    // 遠くで間引く時にまだらに残るよう混ぜる
    for (let i = S.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [S[i], S[j]] = [S[j], S[i]]; }
    const N = S.length, U = { ...o.U, uRealNear: ARMY_REAL_R, uNear: { value: 0 }, uUnavailable: { value: 0 } };
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const body = new THREE.InstancedMesh(armyGeometryCopy(hostGeo(o.armor || 0x2a2622)), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), N);
    const flags = new THREE.InstancedMesh(armyGeometryCopy(SASHI_GEO), armyShader(new THREE.MeshLambertMaterial({ map: o.flagTex, side: THREE.DoubleSide }), U), N);
    const bear = [];
    const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2), host = new Float32Array(N);
    const d = new THREE.Object3D(), col = new THREE.Color();
    S.forEach((q, i) => {
      const x = o.x + q.lx * cf + q.lz * sf, zz = o.z - q.lx * sf + q.lz * cf;
      d.position.set(x, this.heightAt(x, zz), zz);
      d.rotation.set(0, F + (R() - 0.5) * 0.3, 0);
      d.scale.set(0.9 + R() * 0.2, 0.85 + R() * 0.27, 0.9 + R() * 0.2);
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix); flags.setMatrixAt(i, d.matrix);
      // 奥ほど少し色が浅く（遠い者は細部が潰れて灰色がかる）
      soldierTint(col, R).lerp(new THREE.Color(0.92, 0.92, 0.9), q.t * 0.25);
      if (q.k === K_PORTER) col.multiply(PORTER_TINT);   // 小者は具足でなく褪せた麻の色
      body.setColorAt(i, col);
      info.set([R(), q.k, q.helm, q.ex], i * 4); info2.set([q.flag, R()], i * 2); host[i] = 0.12 + 0.88 * q.t;
      if (q.k === 4) bear.push(i);
    });
    const attr = (mesh, idx) => {
      const a = new Float32Array(idx.length * 4), b = new Float32Array(idx.length * 2), h = new Float32Array(idx.length);
      idx.forEach((j, m) => { a.set(info.subarray(j * 4, j * 4 + 4), m * 4); b.set(info2.subarray(j * 2, j * 2 + 2), m * 2); h[m] = host[j]; });
      mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(a, 4));
      mesh.geometry.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(b, 2));
      mesh.geometry.setAttribute('aHost', new THREE.InstancedBufferAttribute(h, 1));
    };
    const all = S.map((_, i) => i);
    attr(body, all); attr(flags, all); this.lodFlag(flags);
    const meshes = [body, flags];
    let banners = null;
    if (bear.length) {
      banners = new THREE.InstancedMesh(armyGeometryCopy(BANNER_GEO), armyShader(new THREE.MeshLambertMaterial({ map: o.flagTex, side: THREE.DoubleSide }), U), bear.length);
      const m4 = new THREE.Matrix4();
      bear.forEach((j, m) => { body.getMatrixAt(j, m4); banners.setMatrixAt(m, m4); });
      attr(banners, bear); this.lodFlag(banners, true); meshes.push(banners);
    }
    // 遠いほど軽く：兵を間引き、背の指物は見通しの内だけ。霧の奥は描かない
    const cx = o.x - sf * (hd + realDepth / 2), cz = o.z - cf * (hd + realDepth / 2), cw = new THREE.Vector3();
    const lodState = { gone: false, keep: 1, flags: false };
    const lod = (mesh, cam) => {
      cw.set(cx, 0, cz).add(mesh.position); if (mesh.parent) cw.applyMatrix4(mesh.parent.matrixWorld);
      const dd = Math.hypot(cam.position.x - cw.x, cam.position.z - cw.z), vis = this.detailVis || this.vis || 230;
      const gone = dd > vis * 1.5 + 30 + realDepth / 2;
      lodState.gone = gone;
      lodState.keep = !MEM_TIGHT ? 1 : this.def.denseFront && false ? frontKeep(this.def, dd, true) : keepStep((dd < 50 ? 1 : Math.max(0.3, 1 - (dd - 50) / 180)) * lowKeep(dd, true));   // 後詰めは 50m より先を奥ほど間引く
      lodState.flags = !gone && (!MEM_TIGHT || dd < Math.min(230, vis));
      return lodState;
    };
    body.onBeforeRender = (r, sc, cam) => { const l = lod(body, cam); body.count = l.gone ? 0 : Math.ceil(N * l.keep); };
    // 遠い塊は、とても遠い兵の形（一人 160 面ほど）で描く（lodTick。中ほどの形は持たない）
    this.lodTwin(body, o.armor || 0x2a2622, false);
    flags.onBeforeRender = (r, sc, cam) => { const l = lod(flags, cam); flags.count = l.flags ? Math.min(N, Math.ceil(N * l.keep * 2)) : 0; };
    // 低（携帯）でも軽い旗の束を残す。見通しの外は描かない。
    if (banners) { const nb = bear.length; banners.onBeforeRender = (r, sc, cam) => { const l = lod(banners, cam); banners.count = l.gone ? 0 : nb; }; }
    for (const m of meshes) m.computeBoundingSphere();
    return { meshes, depth: realDepth, n: N };
  }


  // 戦う隊の後ろに、同じ旗・同じ並びの軽い兵を続けて置く（戦う兵と遠景の境目を消す）
  // o：{ x, z, facing, flag（家紋の鍵）か flagTex, armor, kind, w, depth, count, gap, seed }
  //   (x, z) は戦う隊の真ん中、facing はその向き。軽い兵はその後ろ gap m（既定 5）から depth m の奥行きで並ぶ
  // 返す物は addDistantArmy と同じ（advance・rout・follow が使える）。
  //   隊に付いて歩かせるには：b.follow(() => g.count ? { ...centerOf(g), facing: g.facing } : null)
  addBacking(o) {
    const w = o.w || 16, depth = o.depth || 10, gap = o.gap ?? 5, f = o.facing || 0;
    const back = gap + depth / 2;
    const grp = this.addDistantArmy({
      x: 0, z: 0, w, d: depth, count: o.count || Math.round(w * depth * 0.8), facing: f, armor: o.armor, flagTex: o.flagTex, flag: o.flag, seed: o.seed || 77, kind: o.kind || 'spear',
    });
    grp.position.set(o.x - Math.sin(f) * back, 0, o.z - Math.cos(f) * back);
    grp.army.x0 = grp.position.x;
    grp.army.gap = back;
    return grp;
  }


  // 軽い大軍の合戦：二つの軽い大軍が一本の前線で向き合い、前の列どうしで槍を叩き合い、押し合う（兵力の数には入れない）
  // o：{ x, z, facing, w, gap, gap0, closeSpeed, seed, A, B, play, smoke, link, killRate, maxDrift, noRout, noWake, nearHide }
  //   (x, z) は前線の真ん中、facing は A の向き（B はその逆を向く）、w は前線の幅、gap は前の列どうしの間（既定 3.4m）
  //   A・B：{ flag か flagTex, armor, count, guns（二列目が鉄砲）, bows（後ろから矢）, flagRate }
  //          team（0 味方・1 敵）・faction（兵の家）を渡すと本物の兵に替えられる。hidden で描かない（柵の内の本物の兵が受ける側など）
  //   gap0：はじめの間（0 ならはじめから組み合っている。go() で寄せ合う）
  //   play(音, 位置, 大きさ)・smoke(x, y, z, fx, fz)：戦の側の音と硝煙（rt.army.play・rt.army.smoke）
  //   link()：本物の兵の前線の場所 { x, z } を返す（その近くの前線は、本物の押し引きに合わせて動く）
  // 返す物（C）：
  //   C.go()                      寄せ合って組み合う
  //   C.push(side, k)             side（'A'|'B'）の側へ押す力を足す（k は 0〜1。0 で戻す）
  //   C.shake(side, v)            side の士気を v 下げる（寝返り・横槍など）
  //   C.rout(side, { from, hideAfter, minFight })   side が崩れて逃げる（from：-1 左の端から・1 右の端から・0 ばらばら。minFight 秒は組み合ってから待つ）
  //   C.cavalry(side, { from, count, flag, armor, delay })   side の騎馬の塊が、相手の横（from の端）へ突っ込む
  //   C.volley(side)・C.arrows(side)   鉄砲の一斉射撃（煙）・矢の雨
  //   C.take(side, x, z, n, r)    (x, z) に近い兵を n 人隠し、その場所・向き・種類を返す（本物の兵に置き換える時に。addDistantArmy の take と同じ形）
  //   C.stat()                    { phase, A: 生きている数, B, mA: 士気, mB, lostA, lostB }
  addClash(o, deferred = null) {
    // 遠い乱戦は設定だけ保管する。近づくまで形・材質・土煙・戦闘の更新を作らない。
    // noWake でも後で近づく兵は省かず、設定と台本の指示を同じ乱戦へ引き継ぐ。
    if (!deferred && o.noWake && this.outsideNearView(o.x, o.z, (o.w || 60) / 2)) {
      const C = { o, mesh: new THREE.Group(), x: o.x, z: o.z, facing: o.facing || 0,
        phase: o.gap0 ? 'wait' : 'fight', blocks: [], woke: [], cav: [], later: [], drift: 0 };
      C.A = { U: {}, alive: o.A?.count || 0, m: 100, lost: 0, routed: false };
      C.B = { U: {}, alive: o.B?.count || 0, m: 100, lost: 0, routed: false };
      // 遠景の更新間隔が使う列数は、形を作らず同じ式で求める。
      const nb = Math.max(1, Math.min(CLASH_NB, Math.round((o.w || 60) / (o.bw || 6))));
      const cols = Math.max(2, Math.round((o.w || 60) / nb / 0.95));
      for (const key of ['A', 'B']) C[key].rows = Math.max(3, Math.round((o[key]?.count || nb * cols * 8) / nb / cols));
      const commands = [];
      for (const name of ['go', 'push', 'shake', 'rout', 'volley', 'arrows', 'cavalry', 'reinforce', 'giveBack']) {
        C[name] = (key, value, count, pos, yaw) => {
          // 続けて出る押し引きは最後の値、士気の変化は合計だけを保つ。
          let old;
          for (const q of commands) if (q.name === name && (name === 'go' || name === 'push' || q.key === key)) { old = q; break; }
          if (old && (name === 'go' || name === 'push' || name === 'shake' || name === 'rout')) {
            if (name === 'shake') old.value += value;
            else { old.key = key; old.value = value; }
          } else commands.push({ name, key, value, count, pos, yaw });
          if (name === 'go' && C.phase === 'wait') C.phase = 'close';
          if (name === 'rout') C[key].routed = true;
          return C;
        };
      }
      C.left = () => 0; C.take = () => [];
      C.stat = () => ({ phase: C.phase, A: C.A.alive, B: C.B.alive, mA: C.A.m, mB: C.B.m,
        lostA: 0, lostB: 0, drift: 0, routed: C.A.routed ? 'A' : C.B.routed ? 'B' : '' });
      let activeTick = null;
      C.tick = (dt, focus) => {
        if (activeTick) { activeTick(dt, focus); return; }
        if (!C.mesh.visible || this.outsideNearView(o.x, o.z, (o.w || 60) / 2)) return;
        const wrappedTick = C.tick;
        this.addClash(o, C);
        activeTick = C.tick;
        C.tick = wrappedTick;
        for (const q of commands) C[q.name](q.key, q.value, q.count, q.pos, q.yaw);
        commands.length = 0;
        activeTick(dt, focus);
      };
      this.clashes = this.clashes || [];
      this.clashes.push(C);
      return C;
    }
    const R = rng(o.seed || 5);
    // 演出のばらつきで討たれる抽選を変えない。
    const effectR = rng((o.seed || 5) + 701);
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    const F = o.facing || 0, cf = Math.cos(F), sf = Math.sin(F);
    const W = o.w || 60, gap = o.gap ?? 3.4;
    const nb = Math.max(1, Math.min(CLASH_NB, Math.round(W / (o.bw || 6))));
    const bwr = W / nb, cols = Math.max(2, Math.round(bwr / 0.95));
    const toW = (lx, lz) => [o.x + lx * cf + lz * sf, o.z - lx * sf + lz * cf];
    const C = Object.assign(deferred || {}, { o, nb, cols, t: 0, phase: o.gap0 ? 'wait' : 'fight', app: o.gap0 ? -o.gap0 / 2 : 0, drift: 0, bias: 0, fx: { dust: 0, snd: 1, shout: 4, gun: 5, bow: 7 }, cav: [], later: [], x: o.x, z: o.z, facing: F });
    C.blocks = Array.from({ length: nb }, (_, j) => ({ j, lx: -W / 2 + (j + 0.5) * bwr, f: 0, ph: R() * 6.3, fight: o.gap0 ? 0 : 1, hide: 0 }));
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const grp = deferred ? C.mesh : new THREE.Group();
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), z3 = new THREE.Vector3(0, 0, 0), yAx = new THREE.Vector3(0, 1, 0);
    const mkAttr = (geo, n) => {
      const g = armyGeometryCopy(geo);
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('aClash', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      g.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      return g;
    };
    const setOne = (mesh, i, s, dead) => {
      const g = mesh.geometry;
      g.attributes.aInfo.array.set([s.sd, s.k, s.helm, s.ex], i * 4);
      g.attributes.aInfo2.array.set([dead ? 0 : s.flag, dead ? R() : s.r2], i * 2);
      g.attributes.aClash.array.set([s.j, dead && o.measuredMelee ? WIND.value : s.slot, s.row, dead ? 1 : 0], i * 4);
    };
    const place = (mesh, i, x, z, yaw, sc) => {
      p3.set(x, this.heightAt(x, z), z); q4.setFromAxisAngle(yAx, yaw);
      m4.compose(p3, q4, sc || s3); mesh.setMatrixAt(i, m4);
    };
    // 片方の側を作る
    const side = (key, sgn) => {
      const P = o[key] || {};
      const armor = P.armor || 0x2a2622;
      const flagKind = P.flag || P.flagTex?.userData.mon || 'tokugawa';
      const fieldFlag = this.def.armyFlagKinds?.[flagKind];
      const flagTex = fieldFlag ? flagTexture(fieldFlag) : P.flagTex || flagTexture(flagKind);
      const rows = Math.max(3, Math.round((P.count || nb * cols * 8) / nb / cols)), per = rows * cols;
      const U = {
        uAT: WIND, uGust: GUST, uIdle: typeof ARMY_IDLE !== 'undefined' ? ARMY_IDLE : { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
        uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
        uTerrainTriangles: { value: this.def.clashTerrainTriangles && this.def.terrainTriangles ? 1 : 0 },
        uBlk: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4()) }, uBlk2: { value: Array.from({ length: CLASH_NB }, () => new THREE.Vector4(0, 0, cols, 0)) },
        uRealNear: o.realNear != null ? { value: Math.max(12, o.realNear) } : ARMY_REAL_R, uSide: { value: sgn }, uApp: { value: C.app }, uAppM: { value: 0 }, uAppC: { value: 0 }, uNearHide: o.nearHide != null ? { value: o.nearHide } : { value: 0 }, uMeasuredMelee: { value: o.measuredMelee ? 1 : 0 },
      };
      U.uSplitR = { value: new THREE.Vector2(16, this.def.clashMiddleDetail ?? 16) };
      // 設営後に台本が指定した近距離の設定も、材質を作る前に渡す。
      if (deferred) Object.assign(U, C[key].U);
      const S = { key, sgn, P, U, rows, per, n0: per * nb, alive: per * nb, lost: 0, mod: 0, m: 100, routed: false, blk: [], slots: [], near: [], far: [], all: [] };
      for (let j = 0; j < nb; j++) {
        const b = C.blocks[j];
        const perm = Array.from({ length: cols }, (_, c) => c);
        for (let i = cols - 1; i > 0; i--) { const q = Math.floor(R() * (i + 1)); [perm[i], perm[q]] = [perm[q], perm[i]]; }
        const sl = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols && sl.length < per; c++) {
          const last = r === rows - 1;
          let k = 0;
          // 指定した戦だけ大幟の間を広げる。空いた所は同じ人数の槍兵にする。
          if (last && c % (P.bannerStride ?? 4) === 1) k = 4;
          else if (P.guns && r === 1) k = 1;
          else if (P.bows && r === rows - 2) k = 2;
          else if (R() < 0.12) k = 3;
          // 押し合う備えは組ごとに肩を寄せる。同じ人数と乱数を保ち、均等な散開にしない。
          const lx = b.lx + (c + 0.5 - cols / 2) * (bwr / cols) * (o.measuredMelee ? .88 : 1) + (R() - 0.5) * 0.3;
          const lz = -sgn * (gap / 2 + r * CLASH_ROW + (R() - 0.5) * 0.35);
          const s = { j, row: r, slot: r * cols + perm[c], lx, lz, yaw: F + (sgn > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.3, k, sd: R(), r2: R(),
            helm: k === 3 ? 1 : R() < 0.08 ? 1 : 0, ex: k === 0 ? 1.25 + R() * 0.3 : k === 1 && r === 1 ? 1 : 0, flag: k === 4 ? 0 : R() < (P.flagRate ?? 0.8) ? 1 : 0, sc: [0.9 + R() * 0.2, 0.86 + R() * 0.24 + (R() < 0.06 ? 0.06 : 0), 0.9 + R() * 0.2] };
          sl.push(s);
          // 近い形（高精細）は前の2列まで。3列目からは遠い形へ（姉川のように合戦が複数同時に組む戦で三角面が重くなり過ぎないよう）
          (r < 2 ? S.near : S.far).push(s);
        }
        sl.sort((a, c) => a.slot - c.slot);
        S.slots.push(sl);
        S.blk.push({ k: 0, kd: 0, rt: 0, rDelay: -1, n0: sl.length });
      }
      // 遠くで間引く時に後ろの列がまだらに残るよう、後ろの者は混ぜる
      for (let i = S.far.length - 1; i > 0; i--) { const q = Math.floor(R() * (i + 1)); [S.far[i], S.far[q]] = [S.far[q], S.far[i]]; }
      // 画質「低」（携帯）：前の列も混ぜておく（遠くで前の列を間引く時に、塊ごと欠けないように。乱数の並びは変えない）
      if (false) for (let i = S.near.length - 1; i > 0; i--) { const q = (i * 7919 + 13) % (i + 1); [S.near[i], S.near[q]] = [S.near[q], S.near[i]]; }
      S.all = S.near.concat(S.far);
      if (globalThis.__mixLog) { const c = {}; for (const q of S.all) c[q.k] = (c[q.k] || 0) + 1; globalThis.__mixLog.push({ w: 'clash', team: P.team, mon: flagKind, n: S.all.length, c }); }
      const matB = clashShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U);
      const lowG = false;   // 低（携帯）は前の列も五角の軽い形
      const bodyN = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? this.def.denseFront ? 'xlo' : 'lo' : true), S.near.length), matB, S.near.length);
      const bodyF = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'xlo' : false), Math.max(1, S.far.length)), matB, Math.max(1, S.far.length));
      bodyF.count = S.far.length;
      const flags = new THREE.InstancedMesh(mkAttr(SASHI_GEO, S.all.length), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), S.all.length);
      const bear = S.all.filter((s) => s.k === 4);
      const banners = new THREE.InstancedMesh(mkAttr(BANNER_GEO, Math.max(1, bear.length)), clashShader(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }), U), Math.max(1, bear.length));
      banners.count = bear.length;
      const CAP = o.corpses ?? 360;
      const dead = new THREE.InstancedMesh(mkAttr(soldierGeo(armor, lowG ? 'xlo' : false), CAP), matB, CAP);
      dead.count = 0;
      const col = new THREE.Color();
      const put = (mesh, list, tag) => list.forEach((s, i) => {
        const [x, z] = toW(s.lx, s.lz);
        place(mesh, i, x, z, s.yaw, p3.clone().set(...s.sc));
        setOne(mesh, i, s, false);
        if (tag) { s[tag] = i; s.mesh = mesh; }
      });
      put(bodyN, S.near, 'mi'); put(bodyF, S.far, 'mi');
      for (const [mesh, list] of [[bodyN, S.near], [bodyF, S.far]]) list.forEach((s, i) => { mesh.setColorAt(i, soldierTint(col, R)); });
      S.all.forEach((s, i) => { s.fi = i; });
      put(flags, S.all, null);
      bear.forEach((s) => { s.bi = bear.indexOf(s); });
      put(banners, bear, null);
      for (let i = 0; i < CAP; i++) { dead.setColorAt(i, col.setRGB(0.85, 0.85, 0.85)); }
      S.meshes = { bodyN, bodyF, flags, banners, dead, CAP, nd: 0 };
      grp.add(bodyN, bodyF, flags, banners, dead);
      if (!P.hidden) {
        for (const m of [bodyN, bodyF, dead]) this.lodTwin(m, armor, true, null,
          lowG && this.def.lowArmyDetail && m !== bodyN ? 2 : 0);
        this.lodFlag(flags); this.lodFlag(banners, true);
      }
      for (const m of [bodyN, bodyF, flags, banners, dead]) { m.frustumCulled = false; if (P.hidden) m.visible = false; }
      // 後詰め：組み合う列の後ろに、同じ旗の軽い兵を厚く続ける（前線が押し引きすると一緒に動く。崩れる時は一緒に逃げる）
      if (!P.hidden && o.host !== false) {
        const HU = { uAT: WIND, uGust: GUST, uIdle: U.uIdle, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 }, uHgt: U.uHgt, uHP: U.uHP };
        const back = gap / 2 + rows * CLASH_ROW, fs = F + (sgn > 0 ? 0 : Math.PI);
        const [hx, hz] = toW(0, -sgn * back);
        const hn = typeof P.host === 'number' ? P.host : Math.round(Math.max(60, Math.min(480, (P.count || nb * cols * 8) * 0.7)) * armyScale(this.def.battleKey));
        // 組み合う列の後ろの奥は小者・陣夫（前線には出さない。army_mix.js）
        const h = this.armyHost({ x: hx, z: hz, facing: fs, w: W * 1.05, d: 0, count: hn, armor, flagTex, seed: (o.seed || 5) * 13 + (sgn > 0 ? 1 : 2), U: HU, porter: Math.min(0.6, mixFor(this.def.battleKey).porter * ((P.count || nb * cols * 8) + hn) / hn) });
        const hg = new THREE.Group();
        if (h.meshes.length) hg.add(...h.meshes);
        for (const m of h.meshes) m.frustumCulled = false;
        grp.add(hg);
        S.host = { g: hg, U: HU, fx: Math.sin(fs), fz: Math.cos(fs) };
      }
      return S;
    };
    C.A = side('A', 1); C.B = side('B', -1);
    const sides = [C.A, C.B];
    this.scene.add(grp);
    C.mesh = grp;
    // 遠くほど軽く：後ろの列を間引き、背の指物をやめる。霧の奥は描かない
    const lodState = { gone: false, dd: 0, keep: 1, flags: false };
    let lodFrame = -1, lodCam = null;
    const lod = (r, cam) => {
      if (lodFrame === r.info.render.frame && lodCam === cam) return lodState;
      lodFrame = r.info.render.frame; lodCam = cam;
      const dx = cam.position.x - o.x, dz = cam.position.z - o.z;
      const lx = Math.max(0, Math.abs(dx * cf - dz * sf) - W / 2), lz = Math.max(0, Math.abs(dx * sf + dz * cf) - 12);
      const dd = Math.hypot(lx, lz), vis = this.detailVis || this.vis || 230;
      const gone = dd > vis * 1.5 + 30, near0 = Math.min(60, vis * 0.5);   // 高は 60m より先の後ろの列を間引く（前の二列は全員）
      lodState.gone = gone; lodState.dd = dd;
      lodState.keep = !MEM_TIGHT ? 1 : this.def.denseFront && false ? frontKeep(this.def, dd) : (dd < near0 ? 1 : Math.max(0.3, 1 - (dd - near0) / 220)) * lowKeep(dd);
      lodState.flags = !gone && (!MEM_TIGHT || dd < Math.min(230, vis));
      return lodState;
    };
    for (const S of sides) {
      const M = S.meshes, nF = S.far.length, nA = S.all.length, nN = S.near.length;
      const outside = armyViewTest(M.bodyN, this.def.lowArmyDetail ? [M.bodyF, M.flags, M.banners] : null);
      let sideFrame = -1, sideCam = null, sideGone = false;
      const sideLod = (r, cam) => {
        if (sideFrame === r.info.render.frame && sideCam === cam) return sideGone;
        sideFrame = r.info.render.frame; sideCam = cam;
        const l = lod(r, cam);
        if (l.gone) return sideGone = true;
        // 全列の範囲を取った低画質は、揺れ・前詰め・逃走の余裕だけ足す。
        const margin = this.def.lowArmyDetail ? 12 : 48;
        let padding = margin + S.rows * CLASH_ROW + Math.abs(S.U.uApp.value);
        for (const b of S.U.uBlk.value) padding = Math.max(padding, margin + S.rows * CLASH_ROW + Math.abs(S.U.uApp.value) + Math.abs(b.x) + b.w * 12);
        return sideGone = outside(cam, padding);
      };
      //   低（携帯）：背の指物を描かない遠さでは、前の列も間引く（指物は兵と同じ番号で並ぶので、指物のある内は間引かない）
      // 0 人になる背旗・幟・後ろの列は、次のコマから描く順に入れない（前の列の形が見張る）
      M.flags.userData.maskByBody = true;
      const nbAll = M.banners.count;
      M.bodyN.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); const g = l.gone || sideLod(r, cam); M.flags.layers.mask = l.flags && !g && !M.flags.userData.lod?.sashiCut ? 1 : 0; M.banners.layers.mask = g || !M.banners.count && !nbAll ? 0 : 1; M.bodyF.layers.mask = g || !nF ? 0 : 1; M.dead.layers.mask = M.dead.count ? 1 : 0; M.bodyN.count = sideLod(r, cam) ? 0 : l.flags || true ? nN : Math.ceil(nN * Math.min(1, frontKeep(this.def, l.dd) * 1.5)); };
      M.bodyF.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.bodyF.count = sideLod(r, cam) ? 0 : Math.ceil(nF * l.keep); };
      M.flags.onBeforeRender = (r, sc, cam) => { const l = lod(r, cam); M.flags.count = l.flags && !sideLod(r, cam) ? nN + Math.min(nF, Math.ceil(nF * l.keep * 2)) : 0; };
      const nb0 = M.banners.count;
      M.banners.onBeforeRender = (r, sc, cam) => { M.banners.count = sideLod(r, cam) ? 0 : nb0; };
    }
    const other = (S) => (S === C.A ? C.B : C.A);
    const sideOf = (k) => (k === 'B' ? C.B : C.A);
    // 塊 j の前線の世界の場所
    C.frontAt = (j, dz = 0) => { const b = C.blocks[j]; const [x, z] = toW(b.lx, b.f + dz); return { x, z }; };
    C.blockNear = (x, z) => {
      const dx = x - o.x, dz = z - o.z, lx = dx * cf - dz * sf;
      const j = Math.max(0, Math.min(nb - 1, Math.floor((lx + W / 2) / bwr)));
      const p = C.frontAt(j);
      return { j, d: Math.hypot(p.x - x, p.z - z) };
    };
    // 兵 s の今の世界の場所
    const posOf = (S, s) => {
      const B = S.blk[s.j], kc = B.kd / cols, fr = Math.floor(kc);
      const sh = s.row <= fr ? fr : kc;
      const off = S.sgn * C.blocks[s.j].f + sh * CLASH_ROW + C.app;
      return toW(s.lx, s.lz + S.sgn * off);
    };
    // 一人討たれる：塊の前の列から。倒れ姿を残す
    const kill = (S, j) => {
      const B = S.blk[j];
      if (B.k >= B.n0 - 1 || B.rt > 0) return false;
      const s = S.slots[j][B.k];
      B.k++; S.alive--; S.lost++;
      if (s && !s.taken) {
        const M = S.meshes, i = M.nd % M.CAP;
        const [x, z] = posOf(S, s);
        const fwd = S.sgn * 0.8;
        const [x2, z2] = [x + sf * fwd * (R() - 0.3), z + cf * fwd * (R() - 0.3)];
        const deathYaw = R() * 6.28;
        if (o.measuredMelee) {
          // 元の体と倒れる体を同時に出さず、同じ向き・大きさで受け渡す。形と材質はそのまま使う。
          const mix = S.U.uBlk.value[j].y * (1 - THREE.MathUtils.smoothstep(s.row, Math.floor(B.kd / cols) + 1.5, Math.floor(B.kd / cols) + 2.6));
          const forward = mix * (0.8 + 2.2 * (s.sd * 7.31 % 1));
          const lateral = mix * 2.2 * (s.sd * 3.77 % 1 - 0.5);
          const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
          place(M.dead, i, x + forward * sin + lateral * cos, z + forward * cos - lateral * sin, s.yaw, s3.set(...s.sc));
          s3.set(1, 1, 1);
          const hide = (mesh, at) => { mesh.getMatrixAt(at, m4); m4.scale(z3); mesh.setMatrixAt(at, m4); mesh.instanceMatrix.needsUpdate = true; };
          hide(s.mesh, s.mi); hide(M.flags, s.fi);
          if (s.bi !== undefined) hide(M.banners, s.bi);
        } else place(M.dead, i, x2, z2, o.groundedMelee ? s.yaw : deathYaw);
        setOne(M.dead, i, s, true);
        if (o.groundedMelee) {
          M.dead.geometry.attributes.aClash.array[i * 4 + 3] = 2 + S.U.uAT.value;
          // 倒れる形へ替えた瞬間に立ち姿を隠す。後列が詰める速さは保つ。
          const bodyAttr = s.mesh.geometry.attributes.aClash;
          bodyAttr.setY(s.mi, -1); bodyAttr.needsUpdate = true;
          const flagAttr = M.flags.geometry.attributes.aClash;
          flagAttr.setY(s.fi, -1); flagAttr.needsUpdate = true;
          if (s.bi != null) {
            const bannerAttr = M.banners.geometry.attributes.aClash;
            bannerAttr.setY(s.bi, -1); bannerAttr.needsUpdate = true;
          }
        }
        M.nd++; M.dead.count = Math.min(M.nd, M.CAP);
        M.dead.instanceMatrix.needsUpdate = true;
        for (const a of ['aInfo', 'aInfo2', 'aClash']) M.dead.geometry.attributes[a].needsUpdate = true;
        if (R() < 0.3) this.puff(x2, z2, 1);
      }
      return true;
    };
    const wetGround = () => this.rainLevel > 0.4 || (this.wetness || 0) > 0.5;
    const play = (k, p, v) => { if (o.play) o.play(k, p, v); };
    C.go = () => { if (C.phase === 'wait') C.phase = 'close'; return C; };
    C.push = (k, v) => { C.bias = (k === 'B' ? -1 : 1) * v; return C; };
    C.shake = (k, v) => { sideOf(k).mod -= v; return C; };
    C.rout = (k, opt = {}) => {
      const S = sideOf(k);
      if (S.routed) return C;
      // minFight：組み合ってからその秒が経つまでは崩れない（寄せてすぐ崩れて、ぶつかり合いが見えないことのないように）
      const left = (opt.minFight || 0) - (C.fightT || 0) + (C.phase === 'fight' ? 0 : -C.app / 2.5);
      if (left > 0) { if (!S.routWait) { S.routWait = true; C.later.push({ t: left, fn: () => { S.routWait = false; C.rout(k, { ...opt, minFight: 0 }); } }); } return C; }
      S.routed = true; S.hideAfter = opt.hideAfter ?? 45; S.routT = 0;
      const from = opt.from ?? 0;
      C.blocks.forEach((b, j) => {
        const B = S.blk[j];
        if (B.rDelay >= 0) return;
        const ord = from > 0 ? nb - 1 - j : from < 0 ? j : R() * nb * 0.5;
        B.rDelay = ord * 0.45 + R() * 1.2;
      });
      C.winner = other(S); C.pursueT = 0;
      play('eshout', { x: o.x, z: o.z }, 2);
      return C;
    };
    // 塊をいくつか崩す（横を突かれた端から）
    const routBlocks = (S, js) => { for (const j of js) { const B = S.blk[j]; if (B.rDelay < 0) B.rDelay = R() * 1.5; } };
    C.volley = (k) => {
      const S = sideOf(k), E = other(S);
      if (S.routed) return C;
      let n = 0;
      for (let j = 0; j < nb; j++) {
        if (R() < 0.35 || S.blk[j].rDelay >= 0) continue;
        const p = C.frontAt(j, -S.sgn * (gap / 2 + CLASH_ROW * 1.2));
        // 煙は三つの塊に一つ（煙の板が重なりすぎて重くならないように）。硝煙の名残はさらに間引く
        if (n++ % 3 === 0) { if (o.smoke) o.smoke(p.x, this.heightAt(p.x, p.z) + 1.4, p.z, sf * S.sgn, cf * S.sgn); else this.gunSmoke(p.x, p.z); }
        if (R() < 0.6) kill(E, j);
      }
      play('volley', { x: o.x, z: o.z }, 1.2);
      return C;
    };
    // 矢の雨：後ろの列から相手の真ん中へ、弧を描いて落ちる
    C.arrows = (k) => {
      const S = sideOf(k), E = other(S);
      if (S.routed) return C;
      const A = this.clashArrows || this.buildClashArrows();
      for (let i = 0; i < 70; i++) {
        const j = Math.floor(R() * nb);
        const a = C.frontAt(j, -S.sgn * (gap / 2 + S.rows * CLASH_ROW * 0.8)), b = C.frontAt(j, S.sgn * (gap / 2 + 3 + R() * E.rows * CLASH_ROW * 0.8));
        const lat = (R() - 0.5) * bwr;
        A.list.push({ x0: a.x + cf * lat, z0: a.z - sf * lat, x1: b.x + cf * lat + (R() - 0.5) * 2, z1: b.z - sf * lat + (R() - 0.5) * 2, t: -R() * 0.8, dur: 2.2 + R() * 0.6, h: 16 + R() * 8 });
      }
      if (A.list.length > A.CAP) A.list.splice(0, A.list.length - A.CAP);
      play('volleyBow', { x: o.x, z: o.z }, 1);
      C.later.push({ t: 2.6, fn: () => { for (let j = 0; j < nb; j++) if (R() < 0.3) kill(E, j); } });
      return C;
    };
    C.cavalry = (k, opt = {}) => {
      const S = sideOf(k), E = other(S);
      const from = opt.from || (R() < 0.5 ? -1 : 1);
      // 相手の横の端から 40m ほど外、相手の列の中ほどの深さから駆ける
      const lz = E.sgn * -1 * (gap / 2 + E.rows * CLASH_ROW * 0.5) + C.drift;
      const lx0 = from * (W / 2 + 42);
      const [x, z] = toW(lx0, lz);
      const [tx, tz] = toW(from * (W / 2 - bwr), lz);
      const face = Math.atan2(tx - x, tz - z);
      const grp2 = this.addDistantArmy({ x, z, w: 12, d: 16, count: opt.count || 70, facing: face, armor: opt.armor || S.P.armor, flagTex: opt.flagTex, flag: opt.flag || S.P.flag, seed: 300 + C.cav.length, kind: 'cavalry' });
      grp2.visible = false;
      const cv = { grp: grp2, from, E, t: -(opt.delay || 0), secs: 9, hit: false, x, z, tx, tz };
      C.cav.push(cv);
      return grp2;
    };
    // 本物の兵に置き換える：(x, z) に近いまだ生きている兵を n 人隠し、その場所・向き・種類を返す
    C.left = (k, x, z, r) => {
      const S = sideOf(k);
      let n = 0;
      for (const s of S.all) {
        if (s.taken || s.slot < S.blk[s.j].k || S.blk[s.j].rt > 0) continue;
        const [px, pz] = posOf(S, s);
        if (Math.hypot(px - x, pz - z) < r) n++;
      }
      return n;
    };
    C.take = (k, x, z, n, r = 1e9) => {
      const S = sideOf(k);
      const cand = [];
      for (const s of S.all) {
        if (s.taken || s.slot < S.blk[s.j].k || S.blk[s.j].rt > 0) continue;
        const [px, pz] = posOf(S, s);
        const d = Math.hypot(px - x, pz - z);
        if (d < r) cand.push({ s, d, x: px, z: pz, yaw: s.yaw, k: s.k });
      }
      cand.sort((a, b) => a.d - b.d);
      const out = cand.slice(0, n);
      const M = S.meshes;
      const hide = (mesh, i) => { mesh.getMatrixAt(i, m4); m4.decompose(p3, q4, s3); m4.compose(p3, q4, z3); mesh.setMatrixAt(i, m4); mesh.instanceMatrix.needsUpdate = true; s3.set(1, 1, 1); };
      for (const c of out) {
        c.s.taken = true; S.alive--;
        hide(c.s.mesh, c.s.mi); hide(M.flags, c.s.fi);
        if (c.s.bi !== undefined) hide(M.banners, c.s.bi);
      }
      C.lastTaken = out.map((c) => c.s);
      return out.map(({ x, z, yaw, k, s }) => ({ x, z, yaw, k, helm: s.helm, flag: s.flag, sx: s.sc[0], sy: s.sc[1], sz: s.sc[2] }));
    };
    // 本物に替えた兵を、軽い兵へ戻す（隠した形を元の置き場に戻す）。list は take で隠した兵、n は戻す数
    C.giveBack = (k, list, n, pos = null, yaw = null) => {
      const S = sideOf(k), M = S.meshes;
      for (const sv of list.slice(0, n)) {
        if (!sv.taken) continue;
        sv.taken = false; S.alive++;
        if (pos) {
          const dx = pos.x - o.x, dz = pos.z - o.z;
          sv.lx = dx * cf - dz * sf;
          const B = S.blk[sv.j], kc = B.kd / cols, fr = Math.floor(kc), sh = sv.row <= fr ? fr : kc;
          sv.lz = dx * sf + dz * cf - S.sgn * (S.sgn * C.blocks[sv.j].f + sh * CLASH_ROW + C.app);
          if (yaw !== null) sv.yaw = yaw;
        }
        const [x, z] = toW(sv.lx, sv.lz), sc = s3.set(...sv.sc);
        place(sv.mesh, sv.mi, x, z, sv.yaw, sc); sv.mesh.instanceMatrix.needsUpdate = true;
        place(M.flags, sv.fi, x, z, sv.yaw, sc); M.flags.instanceMatrix.needsUpdate = true;
        if (sv.bi !== undefined) { place(M.banners, sv.bi, x, z, sv.yaw, sc); M.banners.instanceMatrix.needsUpdate = true; }
      }
    };
    // 新手（あらて）：k の側の後ろから、新しい軍勢が駆けつけて前線に加わる（着けば、その側は士気を取り戻し、しばらく押す）
    //   o.surge = { k: 'B', every: 50, count: 120, flank: 0.3 }：組み合っている間、every 秒ごと。flank の割合で、相手の横の端へ回り込む騎馬
    C.surges = 0;
    // 新手・回り込みの知らせ：本人から 90m 内の時だけ、25 秒に一度まで（同じ知らせを繰り返さない）
    const surgeSay = (k, p, flank) => {
      const rt = o.rt, P = rt && rt.player && rt.player.u;
      if (!P || !rt.bark || Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 90 || (rt.t - (this.surgeSaid || -99)) < 25) return;
      this.surgeSaid = rt.t;
      const foe = sideOf(k).P.team !== 0;
      rt.bark(foe ? (flank ? '敵の騎馬が横へ回り込むぞ！' : '敵の新手じゃ！　まだあれほど来るのか……！') : (flank ? '味方の騎馬が敵の横へ回った！' : '味方の後詰が来たぞ！'), foe);
    };
    C.reinforce = (k, opt = {}) => {
      const S = sideOf(k), E = other(S);
      if (S.routed || C.winner) return C;
      const j = Math.floor(R() * nb);
      const back = -S.sgn * (gap / 2 + S.rows * CLASH_ROW + 34);
      const p0 = C.frontAt(j, back), face = F + (S.sgn > 0 ? 0 : Math.PI);
      const big = (opt.count || 120) > 180;
      const g2 = this.addDistantArmy({ x: p0.x, z: p0.z, w: Math.min(bwr * (big ? 6 : 4), big ? 46 : 30), d: big ? 16 : 10, count: opt.count || 120, facing: face, armor: S.P.armor, flagTex: S.P.flagTex, flag: S.P.flag, seed: 500 + C.surges * 7 + (k === 'B' ? 1 : 0), kind: 'spear' });
      C.surges++;
      g2.advance(28, 11);
      play('toki', p0, 1.6);
      if (big) { play('jindaiko', p0, 1.4); play('tramp', p0, 1.5); }
      C.later.push({ t: 11, fn: () => {
        g2.visible = false;
        S.mod += 18; S.alive = Math.min(S.n0, S.alive + Math.round((opt.gain || opt.count || 120) * 0.4));   // 見た目の数（count）と、戦に足す数（gain）は別
        const old = C.bias; C.push(k, 0.35);
        C.later.push({ t: 16, fn: () => { C.bias = old; } });
        play('eshout', C.frontAt(j), 2);
      } });
      if (o.onSurge) o.onSurge(k, p0); else surgeSay(k, p0, false);
      return C;
    };
    C.stat = () => ({ phase: C.phase, A: C.A.alive, B: C.B.alive, mA: Math.round(C.A.m), mB: Math.round(C.B.m), lostA: C.A.lost, lostB: C.B.lost, drift: +C.drift.toFixed(1), routed: C.A.routed ? 'A' : C.B.routed ? 'B' : '' });
    // 毎こま：寄せ・押し合い・討たれる者・崩れ・音と土煙
    C.tick = (dt, focus) => {
      if (C._autoDistant && (!grp.visible || SETTINGS.reduceMotion)) return;
      C.t += dt;
      const t = C.t;
      for (let i = C.later.length - 1; i >= 0; i--) { const L = C.later[i]; L.t -= dt; if (L.t <= 0) { C.later.splice(i, 1); L.fn(); } }
      if (C.phase === 'close') {
        const sp = Math.max(C.app > -8 ? 3.2 : 1.5, o.closeSpeed || 0);
        C.app = Math.min(0, C.app + sp * dt);
        for (const S of sides) { S.U.uAppM.value = 1; S.U.uAppC.value = C.app > -12 ? 1 : 0; }
        if (C.fx.dust <= 0 && !wetGround()) { C.fx.dust = C._autoDistant ? 3 : 0.25; const j = Math.floor(R() * nb); for (const S of sides) { const p = C.frontAt(j, -S.sgn * (gap / 2 - C.app)); this.dustCloud(p.x, p.z, false, !!C._autoDistant); } }
        if (C.app >= 0) {
          C.phase = 'fight';
          play('eshout', { x: o.x, z: o.z }, 2.2);
          for (let i = 0; i < 3; i++) play('clash', C.frontAt(Math.floor(R() * nb)), 1);
          for (const S of sides) { S.U.uAppM.value = 0; S.U.uAppC.value = 0; }
        }
      }
      C.fx.dust -= dt;
      const fight = C.phase === 'fight';
      if (fight) C.fightT = (C.fightT || 0) + dt;
      // 押し合う前線は足元も荒れる。乱数と戦闘判定には触らず、一秒ごとに既存の跡へ加える。
      C.wearT = (C.wearT || 0) + dt;
      if (false && fight && C.wearT >= 1 && this.wearData) {   // 10/24：踏み荒らしは作らない
        C.wearT = 0;
        for (const b of C.blocks) {
          this.stampWear(o.x + b.lx * cf + b.f * sf, o.z - b.lx * sf + b.f * cf, Math.min(4, bwr * 0.7), 14);
        }
      }
      // 雨上がりは乾いた土煙を立てず、既存の粒の入れ物で低い泥跳ねを出す。
      if (o.groundedMelee && (fight || C.phase === 'close') && wetGround() && C.fx.dust <= 0) {
        C.fx.dust = 0.35 + R() * 0.35;
        const j = Math.floor(R() * nb), b = C.blocks[j];
        const side = R() < 0.5 ? C.A : C.B;
        const rt = side.blk[j].rt;
        const lz = b.f - side.sgn * (gap / 2 - C.app + Math.min(12, rt * 4));
        const x = o.x + b.lx * cf + lz * sf, z = o.z - b.lx * sf + lz * cf;
        if (Math.hypot(x - focus.x, z - focus.z) < 150 && (!C.winner || C.pursueT < 12)) {
          this.puff(x, z, 2);
          // 濡れた前線にも低い飛沫の霞を残す。乾いた大きな砂煙にはしない。
          // 既存の雲の上限と再利用を守り、視界・命中判定に使わない描画だけの霞。
          if (effectR() < 0.4 && !this.inWaterAt(x, z)) {
            const mist = this.dustCloud(x, z, false, true, true);
            if (mist) {
              mist.yOff = false; mist.s0 = 1.8; mist.s1 = 5.5;
              mist.life = 6; mist.a = 0.1; mist.rise = 0.025;
            }
          }
        }
      }
      // 乱戦の土煙：押し合う前線から、踏み荒らされた土が絶えず舞い上がる（乾いた日。近い前線ほど多く、崩れて追う時は騎馬の土煙も）
      if (fight && !wetGround() && C.fx.dust <= 0) {
        const fd = Math.hypot(o.x - focus.x, o.z - focus.z);
        C.fx.dust = C._autoDistant ? (2.5) : fd < 120 ? 0.22 : fd < 250 ? 0.55 : 1.4;
        const p = C.frontAt(Math.floor(R() * nb), (R() - 0.5) * gap);
        if (o.measuredMelee) {
          // 押し込んでいる肩へ煙を寄せ、同じ間隔の煙幕にしない。粒の数は増やさない。
          C.fx.dust *= 0.7 + effectR() * 0.6;
          if (C.pressSpeed > 0.3) {
            const b = C.blocks[C.pressBlock];
            p.x = o.x + b.lx * cf + b.f * sf;
            p.z = o.z - b.lx * sf + b.f * cf;
          }
        }
        // 川や田の中で組み合う所は、土煙でなく水しぶき（姉川の瀬など）
        if (this.inWaterAt(p.x, p.z)) {
          if (fd < 160) this.spray(p.x + (R() - 0.5) * 3, p.z + (R() - 0.5) * 3, 5);
          // 川の上の水煙の帳：蹴立てた細かな飛沫が低く白く漂い、奥の列を薄く霞ませる（地の靄と同じ板を使い回す）
          const M = this.mistVeil;
          if (M && fd < 100 && R() < 0.3 && M.list.length < M.CAP - 6) M.list.push({ x: p.x + (R() - 0.5) * 6, z: p.z + (R() - 0.5) * 6, t: 0, life: 9 + R() * 7, s0: 4 + R() * 2, s1: 9 + R() * 5, a: 0.05 + R() * 0.025, rise: 0.012, fin: 0.9 });
        } else {
        // 四つに一つは大きな土煙：前線の上に褐色の帳がかかり、奥の列を霞ませる（薄く広く、長く残る）
        const wide = !C.winner && R() < 0.25;
        const dust = this.dustCloud(p.x + (R() - 0.5) * 3, p.z + (R() - 0.5) * 3, wide || (!!C.winner && R() < 0.5), !!C._autoDistant);
        if (wide && dust) { dust.a *= 0.45; dust.s1 *= 1.3; dust.rise *= 0.5; }
        if (o.measuredMelee && dust) {
          // 足で蹴った土は地表に薄く広がる。前列の姿を高い煙で覆わない。
          dust.rise *= 0.3; dust.s0 *= 0.75; dust.life *= 0.8;
        }
        }
      }
      // 士気：生きている割合と、戦の側から与えた揺さぶり
      for (const S of sides) {
        S.m = Math.max(0, Math.min(100, 100 * (S.alive / S.n0 - 0.3) / 0.7 + S.mod));
        if (fight && !S.routed && !o.noRout && S.m <= 0) C.rout(S.key);
      }
      // 押し合いの流れ：強い側が少しずつ押す。戦の側の push でも押す
      const adv = Math.max(-1, Math.min(1, (C.A.m - C.B.m) / 100 + C.bias));
      const maxD = o.maxDrift ?? 10;
      if (fight && !C.winner) C.drift = Math.max(-maxD, Math.min(maxD, C.drift + adv * dt * 0.35));
      // 崩れた後：勝った側が 12 秒ほど追って前へ出る
      if (C.winner) {
        C.pursueT += dt;
        if (C.pursueT < 12) C.drift += C.winner.sgn * dt * 1.3;
      }
      // 本物の兵の前線（その近くの塊はそれに合わせる）
      let linked = false, linkX = 0, linkZ = 0;
      if (o.link) { const p = o.link(); if (p) { const dx = p.x - o.x, dz = p.z - o.z; linked = true; linkX = dx * cf - dz * sf; linkZ = Math.max(-maxD - 4, Math.min(maxD + 4, dx * sf + dz * cf)); } }
      const kr = (o.killRate ?? 0.09) * dt;
      let af = 0;
      C.pressSpeed = 0; C.pressBlock = 0;
      for (const b of C.blocks) {
        const j = b.j;
        let tg = C.drift + (fight ? 1.3 * Math.sin(t * 0.42 + b.ph) + 0.6 * Math.sin(t * 1.05 + j * 2.1) : 0);
        // 押し引きの波：ときどき塊ごとに片方がどっと押し込み（3〜5m）、やがて押し返される。隣の塊にも少し伝わる
        if (fight && !C.winner && !o.calm) {
          b.sgT = (b.sgT ?? R() * 8) - dt;
          if (b.sgT <= 0) { b.sgT = 6 + R() * 10; b.sg = (R() < 0.5 + adv * 0.3 ? 1 : -1) * (3 + R() * 2); b.sgL = 3 + R() * 4; }
          if (b.sgL > 0) b.sgL -= dt; else b.sg = (b.sg || 0) * Math.max(0, 1 - dt * 0.4);
          const nb2 = (C.blocks[j - 1] ? C.blocks[j - 1].sg || 0 : 0) + (C.blocks[j + 1] ? C.blocks[j + 1].sg || 0 : 0);
          tg += (b.sg || 0) + nb2 * 0.25;
        }
        if (linked) { const w = Math.exp(-Math.abs(b.lx - linkX) / 26); tg += (linkZ - tg) * w * 0.85; }
        const f0 = b.f;
        b.f += (tg - b.f) * Math.min(1, dt * 0.9);
        af += b.f;
        const v = (b.f - f0) / Math.max(dt, 1e-3);
        if (Math.abs(v) > C.pressSpeed) { C.pressSpeed = Math.abs(v); C.pressBlock = j; }
        // 敗走の知らせが届くまでは組み合い、届いた塊から斬り合いをほどく。
        const stillFighting = o.groundedMelee && C.winner && other(C.winner).blk[j].rt === 0;
        const want = fight && (!C.winner || stillFighting) ? 1 : 0;
        b.fight += (want - b.fight) * Math.min(1, dt * 1.5);
        for (const S of sides) {
          const B = S.blk[j];
          // 崩れ：遅れの秒が過ぎたら、その塊は踵を返して逃げる
          if (B.rDelay >= 0) { B.rDelay -= dt; if (B.rDelay < 0) { B.rDelay = 1e9; B.rt = 0.001; } }
          if (B.rt > 0) B.rt += dt;
          // 討たれる：押されている側ほど多く
          if (fight && !C.winner && b.fight > 0.5) {
            const lose = 1 - adv * S.sgn * 0.7 - (v * S.sgn < -0.3 ? -0.3 : 0);
            if (R() < kr * Math.max(0.2, lose) && (S.alive / S.n0 > 0.35 || S.routed)) kill(S, j);
          }
          B.kd += (B.k - B.kd) * Math.min(1, dt * 1.2);
          const U = S.U;
          // 入り混じる強さ：組み合っている間はいつも少し、押し込んだ塊ほど深く（o.mix で戦ごとに変えられる。0 で今までどおり）
          const mixW = (o.mix ?? 1) * b.fight * (0.45 + Math.min(0.55, Math.abs(b.sg || 0) * 0.12));
          const breakK = o.groundedMelee ? Math.min(1, B.rt / 0.7) : S.routed || B.rt > 0 ? 1 : 0;
          U.uBlk.value[j].set(b.f, mixW * (1 - breakK), B.kd, B.rt);
          const mv = C.winner === S && C.pursueT < 12 ? 1 : Math.min(1, Math.abs(v) * 0.8);
          U.uBlk2.value[j].set(b.fight * (1 - breakK), mv, cols, b.hide);
        }
      }
      for (const S of sides) {
        S.U.uApp.value = C.app;
        if (S.routed) {
          S.routT += dt;
          if (S.routT > S.hideAfter) for (const k of ['bodyN', 'bodyF', 'flags', 'banners']) S.meshes[k].visible = false;
        }
        // 後詰め：前線の押し引き（塊のずれの平均）と寄せ合いに付いて動く。崩れたら一緒に逃げる
        const H = S.host;
        if (H) {
          const k = C.app + S.sgn * af / nb;
          H.g.position.set(H.fx * k, 0, H.fz * k);
          H.U.uMarch.value = Math.max(S.U.uAppM.value, C.winner === S && C.pursueT < 12 ? 1 : 0);
          if (S.routed) {
            H.U.uRout.value = 1; H.U.uRoutT.value += dt;
            if (S.routT > S.hideAfter) H.g.visible = false;
          }
        }
      }
      // 騎馬の横槍：駆けて、着いたら相手の端の塊を崩す
      for (const cv of C.cav) {
        if (cv.t < 0) { cv.t += dt; if (cv.t >= 0) { cv.grp.visible = true; cv.grp.advance(Math.hypot(cv.tx - cv.x, cv.tz - cv.z), cv.secs, { charge: true }); play('gallop', { x: cv.x, z: cv.z }, 1.5); } continue; }
        cv.t += dt;
        if (!cv.hit && !wetGround() && R() < dt * 4) { const k = Math.min(1, cv.t / cv.secs); this.dustCloud(cv.x + (cv.tx - cv.x) * k, cv.z + (cv.tz - cv.z) * k, true); }
        if (!cv.hit && cv.t > cv.secs * 0.9) {
          cv.hit = true;
          const tgt = cv.E;
          const js = cv.from > 0 ? [nb - 1, nb - 2, nb - 3] : [0, 1, 2];
          for (const jj of js) if (jj >= 0 && jj < nb) { for (let q = 0; q < 6; q++) kill(tgt, jj); }
          tgt.mod -= 25;
          routBlocks(tgt, js.filter((jj) => jj >= 0 && jj < nb).slice(0, 2));
          play('eshout', { x: cv.tx, z: cv.tz }, 2);
        }
      }
      if (!fight) return;
      // 新手と、横へ回り込む騎馬（o.surge）
      if (o.surge && !C.winner) {
        const Su = o.surge;
        // 小出しにせず、間を空けて大きな塊でどっと来る（every は 1.5 倍の間、数は 1.8 倍。数は軽い兵で、近くは本物に替わる）
        C.fx.surge = (C.fx.surge ?? (Su.first ?? Su.every * 0.9)) - dt;
        if (C.fx.surge <= 0) {
          C.fx.surge = Su.every * 1.5 * (0.85 + R() * 0.3);
          if (R() < Math.min(0.6, (Su.flank ?? 0.3) * 1.5) && C.cav.length < 3) { C.cavalry(Su.k, { count: 100, delay: 0 }); if (o.onSurge) o.onSurge(Su.k, null, 'flank'); else surgeSay(Su.k, { x: o.x, z: o.z }, true); }
          else C.reinforce(Su.k, { count: Math.round((Su.count || 120) * 1.8), gain: (Su.count || 120) * 1.2 });   // 間が 1.5 倍なので、足す数は 1.2 倍（押しの強さはほぼ元のまま）
        }
      }
      // 音：槍の打ち合う音と遠い喚き、ときどき鬨の声。鉄砲・弓の側は時々撃つ
      C.fx.snd -= dt; C.fx.shout -= dt; C.fx.gun -= dt; C.fx.bow -= dt;
      if (C.fx.snd <= 0) {
        C.fx.snd = 0.9 + R() * 1.6;
        const j = Math.floor(R() * nb), p = C.frontAt(j);
        const escaping = o.groundedMelee && C.winner && other(C.winner).blk[j].rt > 0;
        if (!escaping) { play(R() < 0.5 ? 'clash' : 'far', p, 0.9); if (R() < 0.3) play('umeki', p, 0.6); }
        else if (C.pursueT < 12) play(R() < 0.5 ? 'far' : 'umeki', p, 0.6);
      }
      if (C.fx.shout <= 0) {
        C.fx.shout = 9 + R() * 8;
        if (!o.groundedMelee || !C.winner) {
          const kind = R() < 0.5 ? 'eshout' : 'toki', p = C.frontAt(Math.floor(R() * nb));
          if (o.measuredMelee) {
            // 隣の塊まで同じ鬨を上げず、押す所の掛け声と押し返される所の呻きを交ぜる。
            const b = C.blocks[C.pressBlock];
            p.x = o.x + b.lx * cf + b.f * sf; p.z = o.z - b.lx * sf + b.f * cf;
            play(C.pressSpeed > 0.3 ? 'eshout' : effectR() < 0.6 ? 'umeki' : kind, p, C.pressSpeed > 0.3 ? 1.2 : 0.7);
          } else play(kind, p, 1.4);
        }
      }
      if (C.fx.dust <= 0 && !wetGround()) { C.fx.dust = C._autoDistant ? 3 : 0.5; const p = C.frontAt(Math.floor(R() * nb)); this.dustCloud(p.x, p.z, false, !!C._autoDistant); }
      if (C.fx.gun <= 0) { C.fx.gun = 7 + R() * 6; for (const S of sides) if (S.P.guns && !S.routed && !C.winner) C.volley(S.key); }
      if (C.fx.bow <= 0) { C.fx.bow = 10 + R() * 6; for (const S of sides) if (S.P.bows && !S.routed && !C.winner) C.arrows(S.key); }
      C.fx.wake = (C.fx.wake || 0) - dt;
      // 本物へ替えるのは小分けに（一度に五人ずつ・倍の速さで。替わる数の速さは同じで、一コマに兵の形を何十も作らない）
      if (C.fx.wake <= 0) { C.fx.wake = 0.15; wakeTick(); }
    };
    // 本物の兵に替える（b_nagashinojo の wake と同じ決まり：take で軽い兵を隠してその場に本物を立てる・g.guard・戦う兵は250人まで）
    // 合戦では、プレイヤーが前線の60m以内に寄った所の両方の側を替え、本物どうしで斬り合わせる。軽い側が崩れたら、替えた兵も崩れる
    // o.rt（戦）と、A・B の team（0 味方・1 敵）・faction（兵の家）を渡した時だけ
    const WAKE_TYPE = ['ashigaru', 'gun', 'bow', 'samurai', 'ashigaru', 'cavalry', 'samurai', 'porter'];
    C.woke = [];
    C.wakeEnabled = !!o.rt && !o.noWake && sides.every((S) => S.P.team !== undefined);
    C.nearKey = 'clash' + Math.random().toString(36).slice(2, 7);
    const wakeTick = () => {
      const rt = o.rt;
      for (const q of C.woke) for (const g of q.groups) if (g.count && !g.routed && g.clashSide.routed) { g.noRout = false; g.morale = 0; }
      if (!rt || rt.over || o.noWake || (rt.def && rt.def.noWake)) return;
      const P = rt.player && rt.player.u;
      if (!P || !P.alive) return;
      // 戻す判断は控えと共通。近くで勝った兵も、60m以内では本物のまま残す。
      for (let i = C.woke.length - 1; i >= 0; i--) {
        if (!C.woke[i].groups.some((g) => g.count)) C.woke.splice(i, 1);
      }
      // 勝ち負けが決まった合戦では、新しくは替えない（残った兵は上の決まりで軽い兵の列へ戻る）
      if (C.winner) return;
      // 既に替えた所も、60m以内に軽い兵が残れば続けて替える。
      const R0 = Math.max(60, o.wakeR || 0);
      if (!sides.some((S) => C.left(S.key, P.pos.x, P.pos.z, R0))) return;
      const at = C.frontAt(C.blockNear(P.pos.x, P.pos.z).j);
      let alive = 0;
      for (const u of rt.army.units) if (u.alive) alive++;
      const room = Math.min(250, rt.def.wakeRoom ?? 250, o.room ?? 250);
      if (room - alive < 20 && this.recycleNear) alive -= this.recycleNear(20 - (room - alive));
      const n = Math.max(0, Math.min(5, Math.floor((room - alive) / 2)));
      // 近くの軽い兵は本人を中心とする除外輪で隠す。
      nearHideRequest(C.nearKey, 0);
      if (n < 3) return;
      const q = { x: at.x, z: at.z, groups: [], taken: {} };
      for (const S of sides) {
        if (S.P.team === undefined) continue;
        // 自分の持ち場では、味方は控えめに・敵は多めに本物へ替える（o.allyWake・o.foeWake。既定 1＝これまでどおり）
        const bias = S.P.team === P.team ? (o.allyWake ?? 1) : (o.foeWake ?? 1);
        const nSide = Math.max(0, Math.min(Math.round(n * bias), room - alive));
        if (nSide < 2) continue;
        const pts = C.take(S.key, P.pos.x, P.pos.z, nSide, R0);
        q.taken[S.key] = C.lastTaken;
        if (!pts.length) continue;
        let x = 0, z = 0;
        for (const p of pts) { x += p.x; z += p.z; }
        x /= pts.length; z /= pts.length;
        const face = F + (S.sgn > 0 ? 0 : Math.PI);
        const g = rt.army.addGroup({ team: S.P.team, faction: S.P.faction || (S.P.team === 0 ? 'tokugawa' : 'saito'), name: '備の兵', order: 'attack', formation: 'line', anchor: { x, z }, facing: face, noGuard: true,
          width: Math.max(4, Math.min(12, pts.length * 1.1)), aggro: 12, seekRange: 22, morale: 80, speed: 2.6, fleeDir: { x: -Math.sin(face), z: -Math.cos(face) } });
        const mon = S.P.flag || S.P.flagTex?.userData.mon;
        rt.army.spawn(g, pts.map((p) => ({ type: WAKE_TYPE[p.k] || 'ashigaru', n: 1, o: {
          x: p.x, z: p.z, heading: p.yaw, armor: S.P.armor, hat: p.helm ? 'kabuto' : 'jingasa', flag: p.flag ? mon : null,
          ...(p.k === 4 && mon ? { standard: mon, flag: null, weapon: 'none', dmg: 0 } : {}),
        } })));
        g.leader = g.units.find((u) => u.type === 'samurai') || null;
        g.guard = true; g.clashSide = S; g.recyclable = true; alive += g.count;
        g.units.forEach((u, i) => { u.wkClash = { C, key: S.key, s: q.taken[S.key][i] }; if (!rt.def.wakeFullSize) u.mesh.scale.set(pts[i].sx, pts[i].sy, pts[i].sz); });
        q.groups.push(g);
      }
      if (q.groups.length) { C.woke.push(q); play('eshout', at, 1.2); }
    };
    this.clashes = this.clashes || [];
    if (!deferred) this.clashes.push(C);
    return C;
  }

  // 本物の兵の遠い者を、軽い兵の形でまとめて描く（units.js の Army.updateImpostors が使う）
  // 甲冑の色と旗ごとに一つ。一人ずつの形の代わりに、胴・旗の二度の描画で何十人も描ける
  // 返す物：{ put(i, x, z, yaw, k, helm, ex, flag, sd), commit(n), dispose() }（k は軽い兵の種類：0 槍 1 鉄砲 2 弓 3 侍）
  makeImpostor(armor, flag, cap = 160, far = false) {
    if (!this.hgtTex) {
      const t = new THREE.DataTexture(this.grid, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.hgtTex = t;
    }
    if (!SASHI_GEO) { SASHI_GEO = clothGeo(0.34, 0.62, 3, 1, 0, 2.62, -0.17, 11); BANNER_GEO = clothGeo(0.72, 2.6, 3, 6, 0.3, 5.2, 0.14, 12); }
    const U = {
      uNear: { value: 0 }, uRealNear: { value: 0 },
      uAT: WIND, uGust: GUST, uIdle: ARMY_IDLE, uMarch: { value: 0 }, uCharge: { value: 0 }, uTurn: { value: 0 }, uRout: { value: 0 }, uRoutT: { value: 0 },
      uHgt: { value: this.hgtTex }, uHP: { value: new THREE.Vector3(this.half, this.step, SEG) },
    };
    const mk = (geo) => {
      const g = armyGeometryCopy(geo);
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aHost', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      return g;
    };
    // 高：まとめて描く兵は 48m より先だけなので、腕・袖のある軽い形（205 面）。110m より先（far）は輪郭の形
    // 画質「低」（携帯）：まとめて描く遠い兵は、角の少ない遠い形（一人 1100 面 → 300 面ほど。低では 12m より先の兵だけ。far：18m より先の兵の束は、さらに軽い形）
    const body = new THREE.InstancedMesh(mk(soldierGeo(armor, false && (this.def.denseFront || this.def.lowArmyDetail) ? (far ? 'x3lo' : 'xlo') : far ? ('x3lo') : 'xlo')), armyShader(new THREE.MeshLambertMaterial({ vertexColors: true }), U), cap);
    const flags = new THREE.InstancedMesh(mk(SASHI_GEO), armyShader(new THREE.MeshLambertMaterial({ map: flagTexture(flag || 'tokugawa'), side: THREE.DoubleSide }), U), cap);
    const meshes = [body, flags];
    for (const m of meshes) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
    const col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < cap; i++) body.setColorAt(i, col);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), yAx = new THREE.Vector3(0, 1, 0);
    const A = body.geometry.attributes, B = flags.geometry.attributes;
    // 描く直前のカメラを知らせる（写真モードなどで、兵の更新なしにカメラが動いた時に、まとめ直してもらう）
    const R = { onCam: null };
    body.onBeforeRender = (r, sc, cam) => { if (R.onCam) R.onCam(cam.position); };
    return Object.assign(R, {
      cap,
      put: (i, x, z, yaw, k, helm, ex, fl, sd) => {
        if (i >= cap) return;
        p.set(x, this.heightAt(x, z), z); q.setFromAxisAngle(yAx, yaw); m4.compose(p, q, sc);
        body.setMatrixAt(i, m4); flags.setMatrixAt(i, m4);
        const at = i * 4;
        A.aInfo.array[at] = B.aInfo.array[at] = sd;
        A.aInfo.array[at + 1] = B.aInfo.array[at + 1] = k;
        A.aInfo.array[at + 2] = B.aInfo.array[at + 2] = helm;
        A.aInfo.array[at + 3] = B.aInfo.array[at + 3] = ex;
        A.aInfo2.array[i * 2] = B.aInfo2.array[i * 2] = fl; A.aInfo2.array[i * 2 + 1] = B.aInfo2.array[i * 2 + 1] = sd;
      },
      commit: (n) => {
        n = Math.min(n, cap);
        body.count = flags.count = n;
        flags.visible = n > 0;   // 空の束は描かない（体の束は写真の視点の見張りに残す）
        if (!n) return;
        for (const m of meshes) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aInfo.needsUpdate = true; m.geometry.attributes.aInfo2.needsUpdate = true; }
      },
      dispose: () => { this.scene.remove(body, flags); },
    });
  }
}
