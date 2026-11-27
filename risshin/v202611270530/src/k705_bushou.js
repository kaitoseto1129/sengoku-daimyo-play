// K705④（11/26 kaito「それぞれのメインの武将の甲冑をちゃんとした見た目にしよう」）：名のある武将を K697 の本物の人の体に。
// 形：tools/k705_bushou.py が K697 と同じ体（MakeHuman CC0・Mixamo の骨）に当世具足（鎧直垂・胴・草摺七間五段・当世袖・籠手・佩楯・脛当）を
//   着せた一つの形（src/bin/k705_bushou.bin）と、段の面の並び（src/bin/k705_lod.bin。近 16,900・中 4,500・遠 1,400 三角）。
// 兜（鉢・錣・吹返・前立・脇立・後立）は武将ごとに今の作り（humans_armor.js の dressKabuto。現存品を手本にした立物）を同じ頭の骨へ付ける。
// 色：武将ごとの具足の表（kacchu_data.js の KACCHU：漆・威・胴の作り）を絵の升の色へ（材質は武将ごと・描き方は一つ）。手本と出所は docs/status/k705/refs.md
// 骨は今の骨の人の骨のまま（K697 と同じく骨の位置だけ K697 の比へ＝humans_animate.js の k697Pose）。?k705=0 で前の作り
import * as THREE from 'three';
import { GLTFLoader } from './glb_loader.js';
import { assetBytes } from './bin_assets.js';
import { MEM_TIGHT } from './settings.js';
import { K697, K697_ON, K697_LOD, monCell, MONC } from './k697_body.js';
import { namedKacchu } from './named_kacchu.js';

export const K705 = { ready: false, lod: null, lodN: null, names: null, inv: null, bind: null, baseMat: null, n: 0 };
export const K705_ON = { on: typeof location === 'undefined' || !/[?&]k705=0/.test(location.search) };
let loading = null;
export function loadK705() {
  if (loading) return loading;
  loading = (async () => {
    const buf = await assetBytes('k705_bushou');
    const g = await new GLTFLoader().parseAsync(buf.buffer.byteLength === buf.byteLength ? buf.buffer : buf.slice().buffer, '');
    let sm = null; g.scene.traverse((o) => { if (o.isSkinnedMesh) sm = o; });
    if (!sm) throw new Error('武将の形が無い');
    const f = K697.f;
    K705.names = sm.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const S = new THREE.Matrix4().makeScale(f, f, f);
    K705.inv = sm.skeleton.boneInverses.map((m) => S.clone().multiply(m));
    K705.bind = sm.bindMatrix.clone();
    const lb = await assetBytes('k705_lod');
    const u8 = lb.byteOffset % 4 ? lb.slice() : lb;
    const H = new Uint32Array(u8.buffer, u8.byteOffset, 1 + new Uint32Array(u8.buffer, u8.byteOffset, 1)[0]);
    let off = u8.byteOffset + H.byteLength;
    const base = sm.geometry;
    K705.lod = [];
    for (let i = 1; i < H.length; i++) {
      const lg = new THREE.BufferGeometry();
      for (const k in base.attributes) lg.setAttribute(k, base.attributes[k]);
      lg.setIndex(new THREE.BufferAttribute(new Uint16Array(u8.buffer.slice(off, off + H[i] * 2)), 1));
      off += H[i] * 2;
      lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
      lg.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.1, -1), new THREE.Vector3(1, 2.1, 1));
      lg.userData.k705 = i - 1;
      K705.lod.push(lg);
    }
    // 陣羽織（11/27）：uv の u が 1 より上の三角が陣羽織。陣羽織の無い武将の段は、その三角を外した並び（頂点は同じ物）
    const UVA = base.attributes.uv;
    K705.lodN = K705.lod.map((lg) => {
      const I = lg.index.array, keep = [];
      for (let t = 0; t < I.length; t += 3) if (UVA.getX(I[t]) < 1) keep.push(I[t], I[t + 1], I[t + 2]);
      const g = new THREE.BufferGeometry();
      for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from(keep), 1));
      g.boundingSphere = lg.boundingSphere; g.boundingBox = lg.boundingBox; g.userData.k705 = lg.userData.k705;
      return g;
    });
    K705.baseMat = sm.material;
    const map = sm.material.map, img = map && map.image;
    if (MEM_TIGHT && img && (img.width || 0) > 1024 && typeof createImageBitmap === 'function') {
      try {
        const small = await createImageBitmap(img, { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' });
        const t = map.clone(); t.image = small; t.needsUpdate = true; sm.material.map = t; map.dispose(); img.close?.();
      } catch (e) { K705.mapErr = String(e).slice(0, 80); }
    }
    K705.sphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.3);
    K705.ready = true;
  })().catch((e) => { K705.err = String(e && e.stack || e).slice(0, 300); console.warn('K705 の武将の形を読めませんでした', e); });
  return loading;
}

// ---- 主な武将の直垂（具足の下の衣）の色：現存の直垂・肖像に拠る物と、拠り所の無い人の復元案（docs/status/k705/refs.md）----
const CLOTH = {
  '織田信長': 0x4a2a58,   // 紫（復元案。長興寺の肖像の衣の色に寄せる）
  '武田信玄': 0x7a1a12,   // 緋（武田の赤。陣羽織の色）
  '上杉謙信': 0xcfc8b4,   // 白（行人包の白に揃える。肖像）
  '徳川家康': 0x4a3a22,   // 茶（復元案）
  '羽柴秀吉': 0xa8281c, '豊臣秀吉': 0xa8281c,   // 紅（桐紋の金襴の直垂の色。復元案）
  '柴田勝家': 0x4a3020,
  '前田利家': 0x6a4a1e,   // 黄土（金の具足に合わせた復元案）
  '伊達政宗': 0x1c1c20,   // 黒（黒漆五枚胴具足に揃える）
  '毛利元就': 0x8e2418,   // 紅地桐文散錦直垂（毛利博物館・重要文化財）の紅
  '今川義元': 0x9e241b,
  '浅井長政': 0x2a3a30,
  '真田信繁': 0x8e1f16, '真田幸村': 0x8e1f16,   // 赤備え
};
// 胴の作り → 縅の見せ方。0 毛引（糸がびっしり）・1 素懸（対の糸だけ）・2 桶側胴（横板を鋲で留めた段の筋）・3 仏胴・南蛮胴・五枚胴（筋の無い一枚の漆の板）。草摺と袖は 2・3 も素懸
//   11/27：前は 2 と 3 が一つで、桶側と仏胴の武将が同じ胴に見えた（K642）
export const k705Mode = (st) => /hotoke|namban|nanban|sendai|yukinoshita/.test((st.plateDo || '') + ' ' + (st.doStyle || '')) ? 3 : /okegawa/.test(st.doStyle || '') ? 2 : /sugake/.test(st.doStyle || '') ? 1 : 0;
const MODE = k705Mode;
const lin = (hex) => new THREE.Color(hex);
const MATS = new Map();
export function k705Spec(L) {
  const st = namedKacchu(L) || {};
  const nm = typeof L.face === 'string' ? L.face.slice(2) : '';
  const lac = st.kozaneColor ?? st.armor ?? L.armor ?? 0x1c1a1a;
  const lace = st.lace ?? st.odo ?? L.lace ?? 0x3a2a20;
  // 陣羽織：具足の表の haori（0 は着ない）。紋は陣羽織の紋・家紋の順。地が明るい羽織は墨の紋、暗い羽織は白の紋
  const haori = L.noHaori ? 0 : (L.haori ?? st.haori ?? 0) || 0;
  const mon = haori ? (L.haoriMon || st.mon || L.mon || null) : null;
  const hl = haori ? new THREE.Color(haori).getHSL({}).l : 0;
  const monCol = L.haoriMonCol || (hl > 0.55 ? 0x1c1a1a : 0xe6dfcf);
  // 直垂：主な武将は上の表、外の武将は威の色を沈めた色（陣羽織の色と同じにしない）
  const cloth = CLOTH[nm] ?? new THREE.Color(lace).multiplyScalar(0.55).getHex();
  return { lac, lace, cloth, mode: MODE(st), haori, mon: mon && mon !== 'none' ? mon : null, monCol };
}
export function k705Material(sp) {
  const key = [sp.lac, sp.lace, sp.cloth, sp.mode, sp.haori, sp.mon, sp.monCol].join('|');
  let m = MATS.get(key);
  if (m) return m;
  m = K705.baseMat.clone();
  m.side = THREE.DoubleSide;
  // 漆の明るさ：黒漆は暗いまま、朱・金・銀の漆は元の明るさへ（升の印は暗い漆 l≈0.022）
  const cell = sp.haori && sp.mon ? monCell(sp.mon) : -1;
  const U = { uLac: { value: lin(sp.lac) }, uLace: { value: lin(sp.lace) }, uCloth: { value: lin(sp.cloth) }, uMode: { value: sp.mode },
    uHaori: { value: lin(sp.haori || 0x3a3028) }, uMonCol: { value: lin(sp.monCol) }, uMon: { value: MONC.tex },
    uMonCell: { value: new THREE.Vector3(cell >= 0 ? cell % 8 : 0, cell >= 0 ? Math.floor(cell / 8) : 0, cell >= 0 ? 1 : 0) } };
  m.userData.k705U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform vec3 uLac, uLace, uCloth, uHaori, uMonCol, uMonCell; uniform float uMode; uniform sampler2D uMon;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 tq = vMapUv * 4.0; vec2 ti = floor(tq);
        vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        if (vMapUv.x > 1.0) {
          // 陣羽織（u が 1〜2 は背・2〜3 は前と肩）：直垂の升の織り目の明るさのまま武将の羽織の色へ。背の真ん中（肩甲骨の間）に紋
          diffuseColor.rgb = uHaori * (0.55 + 0.45 * l / 0.13);
          if (vMapUv.x < 2.0 && uMonCell.z > 0.5) {
            vec2 tf = fract(tq); vec2 p = vec2((tf.x - 0.5) / 0.171, ((1.0 - tf.y) - 0.64) / 0.105);
            if (abs(p.x) < 1.0 && abs(p.y) < 1.0) {
              float mk = 1.0 - texture2D(uMon, (uMonCell.xy + 0.5 + p * 0.5 * 0.86) / 8.0).g;
              diffuseColor.rgb = mix(diffuseColor.rgb, uMonCol, smoothstep(0.35, 0.65, mk));
            }
          }
          ti = vec2(-1.0);
        }
        bool lam = ti.y == 2.0 && (ti.x == 0.0 || ti.x == 1.0) || ti.y == 3.0 && ti.x == 0.0;   // 胴・草摺・袖
        if (ti.x == 2.0 && ti.y == 1.0) diffuseColor.rgb = uCloth * (l / 0.13);                  // 直垂
        else if (ti.x == 3.0 && ti.y == 1.0) diffuseColor.rgb = uCloth * 0.5 * (l / 0.042);      // 袴・足袋
        else if (lam || ti.x == 3.0 && ti.y == 3.0 || ti.x == 3.0 && ti.y == 2.0) {
          bool lace = c.b > c.r * 1.6;
          bool pair = lace && c.g > c.r * 1.75;                                                   // 素懸の対の糸
          bool isDo = ti.x == 0.0 && ti.y == 2.0;
          bool drop = lam && (uMode > 1.5 && isDo || uMode > 0.5 && !pair);                       // 糸を外して漆の板を見せる
          if (lace && !drop) diffuseColor.rgb = (uLace * 1.45 + vec3(0.025)) * (l / 0.12);   // 縅の糸は漆より明るく（暗い戦でも糸の色が読めるように）
          else if (uMode > 2.5 && isDo) diffuseColor.rgb = (uLac + vec3(0.02)) * (0.92 + 0.08 * l / 0.12);   // 仏胴・南蛮胴・五枚胴：筋の無い一枚の板（照りは漆の艶で出す）
          else if (lace && drop) diffuseColor.rgb = (uLac + vec3(0.02)) * (0.7 + 0.5 * l / 0.12);   // 糸を外した所は漆の小札（筋は残す）
          else if (!lam && c.b > c.r * 1.3) diffuseColor.rgb = uCloth * 0.5 * (l / 0.042);       // 籠手・佩楯の家地
          else if (l < 0.07) diffuseColor.rgb = (uLac + vec3(0.02)) * (l / 0.022);   // 黒漆でも板の照りと筋が見えるよう少し持ち上げる
        }
      }`);
  };
  m.customProgramCacheKey = () => 'k705';
  MATS.set(key, m);
  return m;
}
// 名のある武将（本人の外）をこの形にするか
export function k705Want(u, L) {
  if (!K705_ON.on || !K697_ON.on || !K705.ready || !K697.ready || !u || u.isPlayer || u.mounted || u.bakeRig) return false;
  if (!L || L.hero || L.hero9 || L.sohei || L.kosode || L.nanban || L.kacchu?.generic) return false;
  if (typeof L.face !== 'string' || !L.face.startsWith('g:')) return false;
  return !!namedKacchu(L);
}
// 今の骨の人 h に着せる（体は隠す）。兜は呼ぶ側が dressKabuto で付ける
export function dressK705(h, L) {
  const B = h.bones;
  const bones = K705.names.map((n) => B[n]);
  if (bones.some((b) => !b)) return null;
  const sp = k705Spec(L), LODS = sp.haori ? K705.lod : K705.lodN;
  const m = new THREE.SkinnedMesh(LODS[0], k705Material(sp));
  m.name = 'k705';
  m.bind(new THREE.Skeleton(bones, K705.inv), K705.bind);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = true;
  m.boundingSphere = K705.sphere;
  m.userData.k697 = true; m.userData.k705 = true;
  h.model.add(m);
  const T = [];
  for (const n in K697.T) { const b = B[n]; if (b && n !== 'Hips') { b.position.copy(K697.T[n]); b.updateMatrix(); T.push(b, K697.T[n]); } }
  h.k697T = T; h.k697F = K697.f;
  if (B.Hips) { B.Hips.position.multiplyScalar(K697.f); B.Hips.updateMatrix(); }
  h.body.visible = false;
  h.parts.k705 = m;
  h.root.userData.k697 = true; h.root.userData.k705 = true;
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    let lv;
    if (cam.isOrthographicCamera) lv = h.k697D2 > K697_LOD[1] * K697_LOD[1] ? 2 : 1;
    else {
      const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2; h.k697D2 = d2;
      lv = d2 < K697_LOD[0] * K697_LOD[0] ? 0 : d2 < K697_LOD[1] * K697_LOD[1] ? 1 : 2;
    }
    const g = LODS[lv]; if (m.geometry !== g) m.geometry = g;
  };
  K705.n++;
  return m;
}
