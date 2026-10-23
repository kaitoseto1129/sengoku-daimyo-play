// 人の処理：本物の甲冑。外部向けの入口は humans.js。
import { HUM, preparationFrame, prepBody, prepHead, prepHeadMH, v0, v1, v2, SRC, qualityKeeper, attachBody, isNamed, isSohei, restMatrix, humanBoneMap } from './humans_shared.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetBytes, texOr, textureAtMost } from './bin_assets.js';
import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
// 模様と色を保ち、鉄・布・革を共通の軽い照明で描く。形と骨には触れない。
function armorMaterial(opts) {
  if (!SETTINGS.simpleMaterials) return new THREE.MeshStandardMaterial(opts);
  const { roughness, metalness, envMapIntensity, normalMap, normalScale, ...rest } = opts;
  return new THREE.MeshPhongMaterial({ ...rest, shininess: 18, specular: 0x333333 });
}
import { prepHand } from './humans_hands.js';
import { bodyLoGeo, BSPH } from './humans_lod.js';
import { GENERALS, haoriFold } from './units.js';
import { namedKacchu, namedCrestGeometry } from './named_kacchu.js';
import { unitContour } from './units_model.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WET } from './world.js';
import { GRIME, FP_CUT } from './humans_materials.js';
import { drawMon } from './textures.js';
     // 実写の顔の形と絵
let loading = null;

// ---------------- 読み込み ----------------
function loadHumans() {
  if (loading) return loading;
  if (typeof location !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search))) { HUM.on = false; return (loading = Promise.resolve()); }
  loading = (async () => {
    const L = new GLTFLoader();
    // .glb は公開の場所に置けないので、base64 の文字にした .js（tools/glb2js.mjs で作る）を読んで、ここで元に戻す
    // 生の bytes（src/bin/<名>.bin。無ければ base64 の asset_<名>.js）を読んで GLB に
    const glb = async (name) => {
      const buf = await assetBytes(name);
      await preparationFrame();
      return L.parseAsync(buf.buffer, '');
    };
    // 頭：MakeHuman の写実の頭（CC0。アジアの顔と肌・年と顔の形の作り分け。tools/mhhead.mjs）。?leehead で前の実写スキャンの頭
    const lee = window.__leehead === true || /[?&]leehead/.test(location.search);
    // 体：MakeHuman の写実の体（CC0。アジアの男の形と手。骨と動きは見本の体のまま。tools/mhbody.mjs）。?soldierbody か読めなければ見本の体
    const oldBody = window.__soldierbody === true || /[?&]soldierbody/.test(location.search);
    const sol = await (oldBody ? Promise.reject(new Error('old')) : glb('mhbody')).catch(() => glb('soldier'));
    prepBody(sol);
    await preparationFrame();
    const head = await glb(lee ? 'head' : 'mhhead');
    const tl = new THREE.TextureLoader();
    // 本人の写実の手。体と頭の展開を終えてから読む。
    const hand = await glb('mhhand').catch(() => null);
    if (hand) await tl.loadAsync(new URL('../assets/mh/hand_skin.jpg', import.meta.url).href).then((t) => prepHand(hand, t)).catch(() => {});
    if (lee) {
      const [col, nrm, spec] = await Promise.all(['Map-COL.jpg', 'Infinite-Level_02_Tangent_SmoothUV.jpg', 'Map-SPEC.jpg'].map((f) => tl.loadAsync(new URL('../assets/head/' + f, import.meta.url).href)));
      for (const t of [col, nrm, spec]) { t.flipY = false; t.anisotropy = 4; }
      col.colorSpace = THREE.SRGBColorSpace;
      prepHead(head, col, nrm, spec);
    } else {
      const sk = await Promise.all(['young', 'mid', 'old'].map((f) => tl.loadAsync(new URL('../assets/mh/skin_' + f + '.jpg', import.meta.url).href)));
      prepHeadMH(head, sk);
    }
    // 簡易具足で人を作って貸出枠へ残さないよう、甲冑も支度中に読み終える。
    await loadDomaru();
    await loadKabuto();
    HUM.ready = true;
  })().catch((e) => { HUM.failed = true; HUM.err = String(e && e.stack || e).slice(0, 400); console.warn('骨の入った人を読めませんでした（今の形で描きます）', e); });
  return loading;
}

// ---------------- 本物の胴丸（甲冑一揃いの3Dスキャン） ----------------
// 博物館に飾られた本物の胴丸（胴・袖・草摺・佩楯・籠手・脛当・兜・面頬）を、着ている人形の顔と手ごと、骨の入った人に着せる
// ・形：assets/domaru_lite/domaru.glb（tools/domaru.mjs で台と槍を取り、約2万8千・1万6千・8千面に減らし、量子化と骨の重みを付けた物）。同梱の形を読む
// ・作者表記（CC BY 4.0）：This work is based on "Armadura Samurai Do-maru, BMVB" by Giravolt（docs/CREDITS.md）
// ・人形は腕を下ろして立っているので、骨をその姿に合わせた「着せる時の立ち姿」を作り、そこからの動きで甲冑を動かす
// crowd：侍・騎馬武者・武将（兵）にも着せる（人形の兜と顔は描かず、兵ごとの兜と顔を付ける）
// hiCap：細かい形（胴丸hi 約2.8万面・兜hi 約1.6万面）を同時に出す人数の上限（カメラに近い順。名のある武将と本人は数えず必ず細かい形）
const DOMARU = { on: true, ready: false, failed: false, near: 17, crowd: true, hiCap: 40 };
let DM = null;
let dmLoading = null;
function loadDomaru() {
  if (dmLoading) return dmLoading;
  dmLoading = (async () => {
    const buf = await assetBytes('domaru');
    const tl = new THREE.TextureLoader();
    const [gl, col, nrm] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      ...['domaru_col', 'domaru_nrm'].map((n) => texOr(n, new URL('../assets/domaru_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: /col$/.test(n) ? 8 : 4 })),
    ]);
    const geo = {};
    gl.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, p = g.attributes.position;
      // 量子化の節の倍率を形へ戻す。骨の逆行列は従来のメートルのまま共有する。
      if (p.array instanceof Int16Array) {
        const a = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { a[i * 3] = p.getX(i) * o.scale.x; a[i * 3 + 1] = p.getY(i) * o.scale.y; a[i * 3 + 2] = p.getZ(i) * o.scale.z; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        g.computeBoundingBox(); g.computeBoundingSphere();
      }
      geo[o.name] = g;
    });
    const levels = ['hi', 'mid', 'lo'].filter(k => geo[k]);
    for (const k of levels) {
      const g = geo[k];
      g.setAttribute('skinIndex', g.getAttribute('_joints')); g.setAttribute('skinWeight', g.getAttribute('_weights'));
      g.deleteAttribute('_joints'); g.deleteAttribute('_weights');
    }
    const ex = gl.parser.json.extras || {};
    // 前腕・手と胴（腰・脚）にまたがる三角は外す：人形は腕を下ろして前腕が胴に触れているので、腕を上げると細く伸びて線に見える
    for (const k of levels) {
      const g = geo[k], J = g.getAttribute('skinIndex'), W = g.getAttribute('skinWeight'), I = g.index;
      const grp = (i) => { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = W.getComponent(i, c); if (w > bw) { bw = w; bi = J.getComponent(i, c); } } const n = ex.bones[bi] || ''; return /ForeArm|Hand/.test(n) ? n[0] : /Arm|Shoulder/.test(n) ? 'a' : 'b'; };
      const keep = [];
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
        const s = new Set([grp(a), grp(b), grp(c)]);
        if ((s.has('R') || s.has('L')) && (s.has('b') || (s.has('R') && s.has('L')))) continue;
        // 二の腕と胴にまたがる長い三角（袖の紐など）も、腕を上げると伸びるので外す
        if (s.has('a') && s.has('b')) { const P_ = g.attributes.position, e = Math.max(v0.fromBufferAttribute(P_, a).distanceTo(v1.fromBufferAttribute(P_, b)), v0.distanceTo(v2.fromBufferAttribute(P_, c)), v1.distanceTo(v2)); if (e > 0.05) continue; }
        keep.push(a, b, c);
      }
      g.setIndex(keep);
    }
    // 一般兵は共通の1024角。本人・名将の2048角と形・法線はそのまま保つ。
    // 中遠景は既存の縮小段を描画器が選ぶ。毎コマの距離判定・材質の交換を足さない。
    const crowdCol = await textureAtMost(col, 1024);
    // 御貸具足は兜・顔を別に描く。隠す頭は絵の処理で捨てず、共有の形から一度だけ外す。
    const head = ex.bones.indexOf('Head');
    const withoutHead = (g) => {
      const J = g.attributes.skinIndex, W = g.attributes.skinWeight, I = g.index, keep = [];
      const hidden = (v) => {
        let weight = 0;
        for (let c = 0; c < 4; c++) if (J.getComponent(v, c) === head) weight += W.getComponent(v, c);
        return weight > 0.5;
      };
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
        if (!hidden(a) || !hidden(b) || !hidden(c)) keep.push(a, b, c);
      }
      const out = new THREE.BufferGeometry();
      out.attributes = { ...g.attributes }; out.setIndex(keep);
      out.boundingBox = g.boundingBox; out.boundingSphere = g.boundingSphere;
      return out;
    };
    DM = { hi: geo.hi, mid: geo.mid || geo.lo, lo: geo.lo, stand: geo.stand, bones: ex.bones, joints: ex.joints, col, crowdCol, nrm, inv: null,
      loanMid: withoutHead(geo.mid || geo.lo), loanLo: withoutHead(geo.lo), far: bodyLoGeo(geo.lo, 1 / 48) || geo.lo };
    DOMARU.ready = true;
  })().catch((e) => { DOMARU.failed = true; DOMARU.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の胴丸を読めませんでした（今の形で描きます）', e); });
  return dmLoading;
}

// 本物の兜の3Dスキャン（名のある武将の兜。胴丸の人形の兜と入れ替える）
// ・形：assets/kabuto_lite/kabuto.glb（tools/kabuto.mjs で台と中の支えと面頬を取り、約1万6千面と約3千面に減らした物）。src/asset_kabuto.js に base64 で入れてある
// ・作者表記（CC BY 4.0）：This work is based on "Samurai Helmet - 3D Scan" by chrr273u（コペンハーゲン国立博物館の兜。docs/CREDITS.md）
// ・形の座標：錣の裾が y=0、鉢の軸が x=z=0、前が +z、1 = 1m。頭の骨（Head）の立ち姿の位置から KB_FIT だけずらしてかぶせる
const KABUTO = { on: true, ready: false, failed: false };
const KB_FIT = { y: -0.03, z: 0.012, s: 1.04 };
let KB = null;
let kbLoading = null;
function loadKabuto() {
  if (kbLoading) return kbLoading;
  kbLoading = (async () => {
    const buf = await assetBytes('kabuto');
    const [gl, col] = await Promise.all([
      new GLTFLoader().parseAsync(buf.buffer, ''),
      texOr('kabuto_col', new URL('../assets/kabuto_lite/kabuto_col.jpg', import.meta.url).href, { srgb: true, anisotropy: 8 }),
    ]);
    const geo = {};
    // スキャンの兜は前が +x へ約27°回っていた（錣の開きと吹返しの真ん中で測った）。形ごと戻して、正面を +z にそろえる
    gl.scene.traverse((o) => { if (o.isMesh) { o.geometry.rotateY(-0.47); o.geometry.computeVertexNormals(); geo[o.name] = o.geometry; } });
    const hiN = kbFlatten(geo.hi), loN = kbFlatten(geo.lo);
    for (const g of [geo.hi, geo.lo]) g.setAttribute('kbFlat', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    KB = { hi: geo.hi, lo: geo.lo, hiN, loN, col, mats: new Map(), fuki: kbFuki(geo.hi), menpo: null };
    // 名のある武将の兜の材質を先に作っておく（戦の中で new しない）
    for (const nm of new Set([...Object.keys(GENERALS), ...Object.keys(KB_BY)])) { const st = kabutoStyle({ face: 'g:' + nm }); kabutoMat(st, !!st.mon && !!KB.fuki[0] && !!KB.fuki[1]); }
    KABUTO.ready = true;
    // 面頬（denis_cliofas「Menpō - Samurai Mask」CC BY 4.0）：名のある武将で面頬を付ける人に。読めなければ今の打ち出しの面頬のまま
    try {
      const mbuf = await assetBytes('menpo');
      const tl = new THREE.TextureLoader();
      const [mg, mc, mn] = await Promise.all([new GLTFLoader().parseAsync(mbuf.buffer, ''), ...['menpo_col', 'menpo_nrm'].map((n) => texOr(n, new URL('../assets/menpo_lite/' + n + '.jpg', import.meta.url).href, { srgb: /col$/.test(n), anisotropy: 4 }))]);
      let g = null; mg.scene.traverse((o) => { if (o.isMesh) g = o.geometry; });
      g.computeVertexNormals();
      // 一般兵の口元は共用の軽い形。元の輪郭と絵を保ち、支度中に一度だけ作る。
      KB.menpo = { geo: g, crowdGeo: bodyLoGeo(g, 1 / 96) || g, mc, mn, mats: new Map() };
    } catch (e) { console.warn('面頬の形を読めませんでした（今の面頬で描きます）', e); }
  })().catch((e) => { KABUTO.failed = true; KABUTO.err = String(e && e.stack || e).slice(0, 400); console.warn('本物の兜を読めませんでした（胴丸の兜で描きます）', e); });
  return kbLoading;
}
// 名のある武将の顔に、面頬の形を付ける（頭の骨の立ち姿の位置から MP_FIT だけずらす。形は上の縁が y=0・奥が z=0・前が +z）
const MP_FIT = { y: 0.08, z: 0.04, s: 1.2 };
// 色：絵は朱漆。武将の面頬の色（look.menpo）が赤でなければ、絵の明るさだけを残してその色の漆に塗り替える
function menpoMat(col) {
  const c = new THREE.Color(col || 0x6a1c14), hsl = c.getHSL({});
  const red = hsl.s > 0.4 && (hsl.h < 0.05 || hsl.h > 0.95);
  const key = red ? 'red' : c.getHex();
  const M = KB.menpo.mats;
  if (!M.has(key)) {
    const m = armorMaterial({ map: KB.menpo.mc, normalMap: KB.menpo.mn, roughness: 0.42, metalness: 0.15, side: THREE.DoubleSide });
    const tint = c.clone().multiplyScalar(2.2);
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          ${red ? 'diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.8) * 0.85;' : `diffuseColor.rgb = min(vec3(1.0), vec3(${tint.r.toFixed(3)}, ${tint.g.toFixed(3)}, ${tint.b.toFixed(3)}) * (0.35 + lum));`} }
        diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.3;`);
    };
    m.customProgramCacheKey = () => 'menpo|' + key;
    M.set(key, m);
  }
  return M.get(key);
}
function dressMenpo(h) {
  if (h.parts.menpo) return;
  const hd = SRC.rest.Head, k = MP_FIT.s;
  const fit = new THREE.Matrix4().makeTranslation(hd.x, hd.y + MP_FIT.y, hd.z + MP_FIT.z).multiply(new THREE.Matrix4().makeScale(k, k, k));
  const geo = qualityKeeper(h.u) ? KB.menpo.geo : KB.menpo.crowdGeo;
  const m = attachBody(h, 'Head', geo, fit, menpoMat(h.look && (h.look.menpoScan || h.look.menpo)));
  // 口元は共有の実物を保つ。小さな面頬のために影の描画を追加しない。
  m.castShadow = false;
  h.parts.menpo = m;
}
// 名のある武将の頭に、本物の兜をかぶせる（遠くは軽い形）
// 武将ごとの兜の作り（GENERALS の兜・具足の色・家紋から決める）：
// ・漆：kuro 黒漆・shu 朱漆・sabi 錆地・natural スキャンのまま。鉢・眉庇・吹返しを塗り替え、金の筋と覆輪は残す
// ・前立：kuwa 鍬形・kuwaL 大鍬形・mika 三日月・nichi 日輪の板・nichiR 朱の日輪・tentsuki 天衝・tsuno 鹿角・none 無し
// ・スキャンの鉢の前の龍は、下の数人だけに残す（ほかの人は龍を鉢へ寄せて潰し、地の漆で塗る）
// ・吹返しの金の丸は、家紋がある人はその家の紋（金）に替える
// 龍はスキャンの兜の元の前立。華やかな兜で知られる今川義元だけに残す
const KB_DRAGON = new Set(['今川義元']);
const KB_SABI = new Set(['saito', 'asakura', 'azai', 'rokkaku', 'maru']);
// 名のある大将は史実の具足に寄せて決める。lac 鉢の漆・crest 前立・fuki 吹返し（lac 鉢と同じ・kin 金・shu 朱・kuro 黒・kawa 革）・odo 威の色
// ・家康：歯朶の前立に黒漆（歯朶具足）　・秀吉：馬藺の後立に黒漆と金の吹返し　・利家：金箔押の兜　・勝家：錆地に大鍬形
// ・信玄・勝頼：諏訪法性の兜に寄せて黒漆に大鍬形（白い毛は付けない）　・謙信：日輪と瑞雲　・忠勝：黒漆に鹿角　・直政・信繁：朱漆（赤備え）
const KB_BY = {
  織田信長: { lac: 'kuro', crest: 'kuwa', fuki: 'kin', odo: 0x2e4468 },
  今川義元: { lac: 'natural', crest: 'none', fuki: 'lac', odo: 0x7a2418 },
  徳川家康: { lac: 'kuro', crest: 'shida', fuki: 'kuro', odo: 0x24211e },
  羽柴秀吉: { lac: 'kuro', crest: 'bari', fuki: 'kin', odo: 0x8a6a2e },
  木下藤吉郎: { lac: 'sabi', crest: 'none', fuki: 'kawa', odo: 0x6a4a26 },
  前田利家: { lac: 'kin', crest: 'none', fuki: 'kin', odo: 0x7a5a2a },
  柴田勝家: { lac: 'sabi', crest: 'kuwaL', fuki: 'kawa', odo: 0x4a2418 },
  明智光秀: { lac: 'kuro', crest: 'kuwa', fuki: 'kawa', odo: 0x2a3650 },
  浅井長政: { lac: 'kuro', crest: 'kuwa', fuki: 'shu', odo: 0x34503e },
  武田信玄: { lac: 'kuro', crest: 'kuwaL', fuki: 'kin', odo: 0x8a2418 },
  武田勝頼: { lac: 'kuro', crest: 'kuwaL', fuki: 'shu', odo: 0x8a2a1c },
  上杉謙信: { lac: 'kuro', crest: 'mika', fuki: 'kin', odo: 0x4a3a62 },
  本多忠勝: { lac: 'kuro', crest: 'tsuno', fuki: 'kuro', odo: 0x24211e },
  井伊直政: { lac: 'shu', crest: 'tentsuki', fuki: 'shu', odo: 0xa8301f },
  真田信繁: { lac: 'shu', crest: 'tsuno', fuki: 'shu', odo: 0xa8301f },
  山県昌景: { lac: 'shu', crest: 'kuwa', fuki: 'shu', odo: 0xa8301f },
  森可成: { lac: 'sabi', crest: 'nichiR', fuki: 'kawa' },
  丹羽長秀: { lac: 'sabi', crest: 'mika', fuki: 'kawa' },
  滝川一益: { lac: 'kuro', crest: 'mika', fuki: 'kawa' },
  佐々成政: { lac: 'kuro', crest: 'kuwaL', fuki: 'shu' },
  黒田官兵衛: { lac: 'kuro', crest: 'none', fuki: 'kuro' },
};
const KB_CREST = { kabuto_m: 'kuwa', kabuto_b: 'kuwaL', kabuto_g: 'kuwaL', kabuto_r: 'kuwa', kabuto_f: 'mika', kabuto_w: 'nichi', kabuto_s: 'nichiR', kabuto_suwa: 'kuwaL', kabuto_shida: 'shida', kabuto_t: 'kuwa', kabuto_tentsuki: 'tentsuki', kabuto_shika: 'tsuno', kabuto_sanada: 'tsuno', kabuto_bari: 'bari' };
function kabutoStyle(L) {
  const nm = typeof L.face === 'string' ? L.face.slice(2) : '', gd = GENERALS[nm] || {}, hat = gd.hat || L.hat || '', by = namedKacchu(L) || KB_BY[nm] || {};
  let hs = 0; for (const ch of nm) hs = (hs * 31 + ch.charCodeAt(0)) >>> 0;
  const hsl = new THREE.Color(gd.armor ?? L.armor ?? 0).getHSL({});
  const red = /^kabuto_(r|tentsuki|sanada)$/.test(hat) || (hsl.s > 0.5 && hsl.l > 0.2 && (hsl.h < 0.05 || hsl.h > 0.95));
  const mon = gd.mon || L.mon;
  // 決まりの無い人は家ごと（具足の色・家紋）と名前の散らしで
  const lac = by.lac || (red ? 'shu' : KB_SABI.has(mon) ? (hs % 3 ? 'sabi' : 'kuro') : ['kuro', 'sabi', 'kuro', 'kuro', 'sabi', 'natural'][hs % 6]);
  const fuki = by.fuki || (red ? 'shu' : ['lac', 'kawa', 'lac', 'kin', 'kawa'][(hs >>> 3) % 5]);
  const odo = by.odo ?? gd.lace ?? L.lace ?? 0x3a2a20;
  const dragon = KB_DRAGON.has(nm);
  const crest = L.takedaRed ? 'hishi' : by.crest || KB_CREST[hat] || 'none';
  return { lac, crest, dragon, fuki, odo, mon: mon && mon !== 'none' ? mon : null };
}
// 兜の形の座標での、鉢の前の面（楕円の鉢で近く見る）
const kbFront = (x, y) => { const R = 0.135 * Math.sqrt(Math.max(0, 1 - ((y - 0.13) / 0.155) ** 2)); return Math.sqrt(Math.max(0, R * R - x * x)); };
// 鉢の前の龍を鉢へ寄せて潰した形（kbFlat=1 の所は漆で塗る）。読み込みの時に一度だけ
function kbFlatten(g) {
  const n = g.clone(), p = n.attributes.position, f = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(x) > 0.08 || y < 0.158 || y > 0.265 || z < 0.05) continue;
    const zb = kbFront(x, y);
    if (z < zb + 0.004) continue;
    p.setZ(i, zb + 0.002 + (z - zb) * 0.06); f[i] = 1;
  }
  n.setAttribute('kbFlat', new THREE.BufferAttribute(f, 1));
  n.computeVertexNormals();
  return n;
}
// 吹返しの金の丸の場所と向き（左右）。形から測る（外を向く面の点を集める）
function kbFuki(g) {
  const p = g.attributes.position, nr = g.attributes.normal, out = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(s * 0.15, 0.172, 0.1), P = new THREE.Vector3(), N = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 > 0.025 ** 2) continue;
      if (nr.getX(i) * s * 0.6 + nr.getZ(i) * 0.8 < 0.2) continue;
      P.x += x; P.y += y; P.z += z; N.x += nr.getX(i); N.y += nr.getY(i); N.z += nr.getZ(i); k++;
    }
    out.push(k > 8 ? { p: P.multiplyScalar(1 / k), n: N.normalize() } : null);
  }
  return out;
}
// 漆の色（kin は金箔押）。吹返しは lac（鉢と同じ）か下の色。威（錣の糸）は武将ごとの色に染め直す
const KB_LAC = { natural: null, kuro: 0x16120f, shu: 0x8e2416, sabi: 0x4a2a1a, kin: 0xa8823a };
const KB_FUKI = { kin: 0xa8823a, shu: 0x8e2416, kuro: 0x16120f, kawa: 0x5c3a20 };
// 材質は（漆・吹返し・威・紋）の組ごとに一つ。読み込みの時に名のある武将の分を先に作り、あとは使い回す（形の作りは一つ＝描き分けは uniform だけ）
function kabutoMat(st, kill = false, fine = false) {
  const lk = st.lac, fk = st.fuki === 'lac' || !st.fuki ? lk : st.fuki, odo = st.odo ?? null;
  const key = lk + '|' + fk + '|' + (odo ?? '-') + (kill ? '|mon' : '') + (fine ? '|fine' : '');
  if (KB.mats.has(key)) return KB.mats.get(key);
  const c = KB_LAC[lk], fc = KB_FUKI[fk] ?? KB_LAC[fk];
  const lac = new THREE.Color(c ?? 0x3a2418), disc = c == null ? new THREE.Color(0xa08a68) : lk === 'kin' ? new THREE.Color(0x2a1c12) : lac;
  const fuki = new THREE.Color(fc ?? 0x3a2418), odoC = new THREE.Color(odo ?? 0x3a2418);
  const F = KB.fuki || [], far = new THREE.Vector3(9, 9, 9);
  // スキャンの絵は光が焼き込まれているので、照らしは控えめ（粗さ高め）。塗った漆は少し艶。金箔は金物らしく。裏（鉢の内・錣の裏）は暗く
  const mat = armorMaterial({ map: KB.col, roughness: c == null ? 0.62 : lk === 'kin' ? 0.38 : 0.5, metalness: lk === 'kin' ? 0.6 : 0.18, envMapIntensity: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    unitContour(sh);
    Object.assign(sh.uniforms, { uLac: { value: lac }, uDisc: { value: disc }, uLacK: { value: c == null ? 0 : 1 }, uKill: { value: kill ? 1 : 0 },
      uFuki: { value: fuki }, uFukiK: { value: fc == null ? 0 : 1 }, uOdo: { value: odoC }, uOdoK: { value: odo == null ? 0 : 1 },
      uF0: { value: F[0] ? F[0].p : far }, uF1: { value: F[1] ? F[1].p : far } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float kbFlat; varying vec3 vKb; varying float vKbF;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKb = position; vKbF = kbFlat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLac, uDisc, uF0, uF1, uFuki, uOdo; uniform float uLacK, uKill, uFukiK, uOdoK; varying vec3 vKb; varying float vKbF;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float lum = dot(c, vec3(0.3, 0.59, 0.11));
        float gold = smoothstep(0.6, 0.75, (mx - mn) / (mx + 1e-4)) * smoothstep(0.4, 0.5, c.g / (c.r + 1e-4)) * smoothstep(0.1, 0.16, mx);
        float disc = uKill * (1.0 - smoothstep(0.024, 0.032, min(distance(vKb, uF0), distance(vKb, uF1))));
        float up = smoothstep(0.118, 0.13, vKb.y);
        // 吹返し：鉢の外の前の左右の返り
        float fk = smoothstep(0.145, 0.155, length(vKb.xz)) * smoothstep(0.02, 0.05, vKb.z) * smoothstep(0.08, 0.1, abs(vKb.x)) * smoothstep(0.112, 0.125, vKb.y) * (1.0 - smoothstep(0.23, 0.25, vKb.y));
        c = mix(c, uLac * (0.45 + 1.4 * lum), uLacK * up * (1.0 - fk) * (1.0 - gold) * (1.0 - disc));
        c = mix(c, uFuki * (0.45 + 1.4 * lum), uFukiK * fk * (1.0 - gold) * (1.0 - disc));
        // 威：錣（鉢より下）の糸を武将の色に。明るさの起伏は絵のまま
        c = mix(c, min(vec3(1.0), uOdo * (0.5 + 2.6 * lum)), uOdoK * (1.0 - up) * (1.0 - fk) * (1.0 - gold) * 0.9);
        c = mix(c, uDisc * (0.6 + 0.8 * lum), disc);
        c = mix(c, uLac * (0.55 + 0.8 * lum), vKbF);
        diffuseColor.rgb = c * (gl_FrontFacing ? 0.82 : 0.25); }`);
    if (fine && !SETTINGS.simpleMaterials) {
      // 吹返しの革・漆・金箔と錣の糸を、同じ一枚の形の中で描き分ける。
      // 模様の明るさを磨きと擦れにも使い、新しい絵や形は足さない。
      sh.fragmentShader = 'float kbFinishGold, kbFinishLeather, kbFinishCord, kbFinishWear;\n' + sh.fragmentShader
        .replace('c = mix(c, uLac * (0.45 + 1.4 * lum)', `
          kbFinishGold = max(gold, max(up * (1.0 - fk) * ${lk === 'kin' ? '1.0' : '0.0'}, fk * ${fk === 'kin' ? '1.0' : '0.0'}));
          kbFinishLeather = fk * ${fk === 'kawa' ? '1.0' : '0.0'} * (1.0 - gold);
          kbFinishCord = (1.0 - up) * (1.0 - fk) * (1.0 - gold);
          kbFinishWear = 1.0 - smoothstep(0.12, 0.48, lum);
          c = mix(c, uLac * (0.45 + 1.4 * lum)`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.34, 0.7, kbFinishWear);
          roughnessFactor = mix(roughnessFactor, 0.24 + kbFinishWear * 0.24, kbFinishGold);
          roughnessFactor = mix(roughnessFactor, 0.74 + kbFinishWear * 0.14, kbFinishLeather);
          roughnessFactor = mix(roughnessFactor, 0.86, kbFinishCord);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = kbFinishGold * (0.82 - kbFinishWear * 0.25) * (1.0 - kbFinishLeather) * (1.0 - kbFinishCord);`);
    }
  };
  mat.customProgramCacheKey = () => fine ? 'kabuto-finish3|' + lk + '|' + fk : 'kabuto2';
  KB.mats.set(key, mat);
  return mat;
}
// 前立の形（兜の形の座標。台は眉庇の上の真ん中）。形も材質も一つずつ作って使い回す
const CREST_GEO = new Map();
let CREST_MAT = null;
function crestMats() {
  if (!CREST_MAT) {
    const S = THREE.DoubleSide;
    CREST_MAT = {
      gold: armorMaterial({ color: 0xc29a48, metalness: 0.85, roughness: 0.3, side: S }),
      black: armorMaterial({ color: 0x14110f, metalness: 0.1, roughness: 0.3, side: S }),
      red: armorMaterial({ color: 0x8e2416, metalness: 0.05, roughness: 0.35, side: S }),
    };
  }
  return CREST_MAT;
}
const CREST_NAMED = new THREE.Matrix4();
const CREST_M = new THREE.Matrix4().makeTranslation(0, 0.162, 0.142).multiply(new THREE.Matrix4().makeRotationX(-0.14));
const CREST_BACK = new THREE.Matrix4().makeTranslation(0, 0.25, -0.07).multiply(new THREE.Matrix4().makeRotationX(0.25));
function crestGeo(kind) {
  const named = namedCrestGeometry(kind);
  if (named) return [named];
  if (CREST_GEO.has(kind)) return CREST_GEO.get(kind);
  const flat = (pts, d = 0.004) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: d, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -d / 2); return g; };
  // 刃：二次の曲線を芯に、幅 w0→w1 で細る板（sd で左右）
  const blade = (sd, p1, p2, w0, w1) => {
    const L = [], R = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = (1 - t) ** 2, b = 2 * (1 - t) * t, e = t * t;
      const x = b * p1[0] + e * p2[0] + a * 0.012, y = b * p1[1] + e * p2[1];
      const dx = 2 * (1 - t) * (p1[0] - 0.012) + 2 * t * (p2[0] - p1[0]), dy = 2 * (1 - t) * p1[1] + 2 * t * (p2[1] - p1[1]);
      const l = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2;
      L.push([sd * (x - dy / l * w), y + dx / l * w]); R.push([sd * (x + dy / l * w), y - dx / l * w]);
    }
    return flat(sd > 0 ? [...R, ...L.reverse()] : [...L, ...R.reverse()]);
  };
  const dai = () => { const g = new THREE.BoxGeometry(0.05, 0.026, 0.007); g.translate(0, 0.008, 0); return g.toNonIndexed(); };
  const parts = [];   // [形, 材質の鍵]
  const kuwa = (sp, h, w0, w1) => { for (const sd of [1, -1]) parts.push([blade(sd, [0.07, 0.03], [sp, h], w0, w1), 'gold']); parts.push([dai(), 'gold']); };
  if (kind === 'hishi') parts.push([flat([[0, 0.025], [0.065, 0.075], [0, 0.125], [-0.065, 0.075]]), 'gold']);
  if (kind === 'kuwa') kuwa(0.085, 0.16, 0.016, 0.007);
  if (kind === 'kuwaL') kuwa(0.12, 0.22, 0.018, 0.008);
  if (kind === 'tentsuki') { for (const sd of [1, -1]) parts.push([blade(sd, [0.03, 0.12], [0.1, 0.3], 0.022, 0.05), 'gold']); parts.push([dai(), 'gold']); }
  if (kind === 'mika') {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = Math.PI * 1.12 + (i / 20) * Math.PI * 0.76; pts.push([Math.cos(a) * 0.15, 0.155 + Math.sin(a) * 0.15]); }
    for (let i = 20; i >= 0; i--) { const a = Math.PI * 1.12 + (i / 20) * Math.PI * 0.76; pts.push([Math.cos(a) * 0.143, 0.179 + Math.sin(a) * 0.143]); }
    parts.push([flat(pts), 'gold'], [dai(), 'gold']);
  }
  if (kind === 'nichi' || kind === 'nichiR') {
    const d = new THREE.CylinderGeometry(0.048, 0.048, 0.004, 28); d.rotateX(Math.PI / 2); d.translate(0, 0.07, 0);
    const st = new THREE.BoxGeometry(0.01, 0.03, 0.005); st.translate(0, 0.012, 0);
    parts.push([d.toNonIndexed(), kind === 'nichiR' ? 'red' : 'gold'], [st.toNonIndexed(), 'gold'], [dai(), 'gold']);
    if (kind === 'nichiR') { const r = new THREE.TorusGeometry(0.049, 0.0035, 5, 28); r.translate(0, 0.07, 0); parts.push([r.toNonIndexed(), 'gold']); }
  }
  // 歯朶（家康の歯朶具足の前立）：台から扇に開く金の葉を左右に三枚ずつと真ん中に一枚
  if (kind === 'shida') {
    for (const sd of [1, -1]) {
      parts.push([blade(sd, [0.02, 0.07], [0.04, 0.135], 0.026, 0.005), 'gold']);
      parts.push([blade(sd, [0.045, 0.055], [0.08, 0.1], 0.024, 0.005), 'gold']);
      parts.push([blade(sd, [0.06, 0.03], [0.105, 0.055], 0.02, 0.004), 'gold']);
    }
    parts.push([blade(1, [0.0, 0.08], [-0.012, 0.15], 0.022, 0.005), 'gold'], [dai(), 'gold']);
  }
  // 馬藺（秀吉の馬藺の後立）：鉢の後ろから光のように開く細い金の葉。形の座標は後ろの台が原点
  if (kind === 'bari') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2.3, Ln = 0.27;
      const sx = Math.abs(Math.sin(a)), sd = a < 0 ? -1 : 1;
      parts.push([blade(sd, [sx * Ln * 0.5 + 0.006, Math.cos(a) * Ln * 0.5], [sx * Ln, Math.cos(a) * Ln], 0.012, 0.003), 'gold']);
    }
  }
  if (kind === 'tsuno') {
    for (const sd of [1, -1]) {
      const main = new THREE.CatmullRomCurve3([[0.015, 0, 0], [0.05, 0.05, -0.01], [0.075, 0.12, -0.03], [0.06, 0.2, -0.06]].map(([x, y, z]) => new THREE.Vector3(sd * x, y, z)));
      const tine = new THREE.CatmullRomCurve3([[0.062, 0.085, -0.02], [0.095, 0.12, -0.02], [0.11, 0.16, -0.03]].map(([x, y, z]) => new THREE.Vector3(sd * x, y, z)));
      parts.push([new THREE.TubeGeometry(main, 12, 0.007, 5).toNonIndexed(), 'black'], [new THREE.TubeGeometry(tine, 6, 0.005, 5).toNonIndexed(), 'black']);
    }
  }
  // 材質ごとに一つの形にまとめる
  const by = {};
  for (const [g, k] of parts) { for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); (by[k] = by[k] || []).push(g); }
  const out = Object.entries(by).map(([k, gs]) => { const g = mergeGeometries(gs); g.computeVertexNormals(); g.computeBoundingSphere(); return [g, k]; });
  CREST_GEO.set(kind, out);
  return out;
}
const MON_PLANE = new THREE.PlaneGeometry(0.058, 0.058);
function dressKabuto(h) {
  const hd = SRC.rest.Head, k = KB_FIT.s, L = h.look || {};
  const st = kabutoStyle(L);
  const fit = new THREE.Matrix4().makeTranslation(hd.x, hd.y + KB_FIT.y, hd.z + KB_FIT.z).multiply(new THREE.Matrix4().makeScale(k, k, k));
  // 吹返しの紋（家紋の絵は陣羽織と同じ作り。金で）
  const monMat = st.mon && KB.fuki[0] && KB.fuki[1] ? (monDecal(st.mon, 0xc9a24a) || {}).material : null;
  const G = st.dragon ? [KB.hi, KB.lo] : [KB.hiN, KB.loN];
  const m = attachBody(h, 'Head', G[0], fit, kabutoMat(st, !!monMat));
  m.userData.surfaceBase = m.material;
  m.userData.surfaceFine = kabutoMat(st, !!monMat, true);
  m.frustumCulled = true;
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = false && !h.u.isPlayer ? 9 : DOMARU.near;
    const want = !cam.isOrthographicCamera && (qualityKeeper(h.u) || d2 < near * near && m.userData.hiOK !== false) ? G[0] : G[1];
    if (m.geometry !== want) m.geometry = want;
  };
  const add = (geo, mat, mx) => { const c = new THREE.Mesh(geo, mat); c.matrixAutoUpdate = false; c.matrix.copy(mx); c.castShadow = true; m.add(c); return c; };
  if (st.crest !== 'none') {
    const CM = crestMats();
    // 龍の人の鍬形は、龍の頭の後ろ（鉢の前）から立てる
    const mx = namedKacchu(L) ? CREST_NAMED : st.crest === 'bari' ? CREST_BACK : st.dragon ? new THREE.Matrix4().makeTranslation(0, 0.2, 0.118).multiply(new THREE.Matrix4().makeRotationX(-0.2)) : CREST_M;
    for (const [g, key] of crestGeo(st.crest)) add(g, CM[key], mx);
  }
  if (monMat) {
    for (const f of KB.fuki) {
      const z = f.n, x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
      add(MON_PLANE, monMat, new THREE.Matrix4().makeBasis(x, y, z).setPosition(f.p.clone().addScaledVector(z, 0.003)));
    }
  }
  h.parts.kabuto = m;
}
// 人と具足の素材は、出陣や姿の見本で必要になった時だけ読む。
// 本物の胴丸を着る人：名のある武将と、look.real の人（侍大将より上の本人）
function wantsDomaru(look) { return DOMARU.on && !!look && (!!look.hero || !!look.real || isNamed(look)); }
// 近い一般兵は全員スキャンの具足。遠景は dressCrowd の元の姿を使う。
const crowdDomaru = (look) => DOMARU.on && DOMARU.crowd && !!look && !look.kosode && !isSohei(look) && !wantsDomaru(look);
// 着せる時の骨の立ち姿（人の根元の座標）の逆行列。腕と脚の骨は人形の腕・脚の向きへ回し、どの骨も人形の関節の位置へ
function domaruInverses() {
  if (DM.inv) return DM.inv;
  const J = DM.joints, R = SRC.rest;
  // 骨 → [骨の立ち姿での子の関節, 人形の子の関節]
  const AIM = {
    RightArm: ['RightForeArm', 'RightForeArm'], RightForeArm: ['RightHand', 'RightHand'], RightHand: ['RightHandMiddle1', 'RightFinger'],
    LeftArm: ['LeftForeArm', 'LeftForeArm'], LeftForeArm: ['LeftHand', 'LeftHand'], LeftHand: ['LeftHandMiddle1', 'LeftFinger'],
    RightUpLeg: ['RightLeg', 'RightLeg'], RightLeg: ['RightFoot', 'RightFoot'], LeftUpLeg: ['LeftLeg', 'LeftLeg'], LeftLeg: ['LeftFoot', 'LeftFoot'],
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion();
  DM.inv = DM.bones.map((nm) => {
    const j = new THREE.Vector3(...J[nm]), r = R[nm];
    const M = new THREE.Matrix4().makeTranslation(j.x, j.y, j.z);
    if (AIM[nm]) {
      a.copy(R[AIM[nm][0]]).sub(r).normalize(); b.set(...J[AIM[nm][1]]).sub(j).normalize();
      M.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q.setFromUnitVectors(a, b)));
    }
    M.multiply(new THREE.Matrix4().makeTranslation(-r.x, -r.y, -r.z)).multiply(restMatrix(nm));
    return M.invert();
  });
  return DM.inv;
}
// 材質：スキャンの絵そのまま。威糸（紺）だけ、武将の威しの色へ塗り替える（紺の武将はそのまま）
// 赤備えなど、小札の色が黒でない家は、黒い漆の所をその色へ塗る（隊の色をそろえる）
// noHead：兵の侍に着せる時は、人形の兜と顔を描かない（兵ごとの兜・顔を上に付ける）
const dmMats = new Map();
const armorTint = (hex) => { const c = new THREE.Color(hex ?? 0x1c1a1a); const hsl = c.getHSL({}); return hsl.s > 0.35 && hsl.l > 0.12 ? c : null; };
// 人形の顔と面頬の所（胴丸の形の座標：前が +z）。この中の頭の頂点を抜く
const DM_FACE = { z: 0.02, x: 0.105, y: 1.695 };
// 武将の兜の合わせ：鉢の広げ（前後左右）と下げ（m）。実写の顔は人形の顔より小さく低いので、眉庇が眉の少し上に来るまで深くかぶせる
const HELM_FIT = { w: 1.08, dy: 0.055 };
// 胴丸の材質の道具（値の揺らぎと、高さの変わりから法線を傾ける）
const DM_GLSL = `
float dmHb(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dmVn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmHb(i), dmHb(i + vec3(1,0,0)), f.x), mix(dmHb(i + vec3(0,1,0)), dmHb(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dmHb(i + vec3(0,0,1)), dmHb(i + vec3(1,0,1)), f.x), mix(dmHb(i + vec3(0,1,1)), dmHb(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 dmBump(vec3 sp, vec3 sn, vec2 dH, float fd) {
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 R1 = cross(sy, sn), R2 = cross(sn, sx);
  float det = dot(sx, R1) * fd;
  vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * sn - g);
}
`;
// 使い込みの四通り（x 刀傷・擦り傷の多さ、y 汚れの濃さ、z 日焼けの褪せ、w 傷の場所のずらし）。人ごとに選ぶ（材質は四つまで増える）
const DM_WEAR = [[0.25, 0.7, 0.1, 0.0], [0.7, 1.0, 0.3, 3.1], [1.0, 1.35, 0.5, 5.7], [0.45, 0.85, 0.75, 8.3]];
function domaruMaterial(look, noHead = false, wv = 0, detailed = true) {
  const lace = new THREE.Color(look.lace ?? 0x2e3a52);
  const blueLace = lace.b > lace.r * 1.15 && lace.b > lace.g;
  const tint = armorTint(look.armor);
  // noHead：true は兜と顔を描かない。'helm' は兜（鉢・錣・吹返し・眉庇）を残し、人形の顔と面頬だけを抜く（名のある武将：スキャンの兜に、その人の顔と前立）
  const helm = noHead === 'helm';
  const k = (blueLace ? 'blue' : lace.getHex()) + '|' + (tint ? tint.getHex() : 0) + (helm ? '|hm' : noHead ? '|nh' : '') + '|w' + wv + (detailed ? '|detail' : '|crowd');
  if (dmMats.has(k)) return dmMats.get(k);
  // 両面で描き、裏（甲冑の内側）は暗く塗る：腕を上げた時の脇など、スキャンに写っていない所が、抜けずに暗い隙間に見える
  const m = armorMaterial({ map: detailed ? DM.col : DM.crowdCol, normalMap: DM.nrm, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.55, metalness: 0.15, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const U = { uLace: { value: lace }, uLaceAmt: { value: blueLace ? 0 : 1 }, uArm: { value: tint || new THREE.Color(0) }, uArmAmt: { value: tint ? 1 : 0 }, uWV: { value: new THREE.Vector4(...(DM_WEAR[wv] || DM_WEAR[0])) } };
  const hi = noHead ? humanBoneMap(DM.bones, domaruInverses())[DM.bones.indexOf('Head')] : -1;
  m.onBeforeCompile = (sh) => {
    unitContour(sh);
    Object.assign(sh.uniforms, U);
    // 一般兵は頭の面を形から除いてあるので、画素を捨てる処理も不要。
    if (noHead && (detailed || helm)) {
      sh.vertexShader = 'varying float vHd;\nvarying vec3 vHP0;\n' + sh.vertexShader.replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
        vHd = 0.0; vHP0 = position;
        for (int i = 0; i < 4; i++) { float bi = skinIndex[i]; if (abs(bi - ${hi}.0) < 0.5) vHd += skinWeight[i]; }`);
      // 兜は少し深く（下げて）、鉢を少し広げてかぶる（武将の頭は人形の頭より大きい）
      if (helm) sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', `{
          float hw = 0.0; for (int i = 0; i < 4; i++) { if (abs(skinIndex[i] - ${hi}.0) < 0.5) hw += skinWeight[i]; }
          if (hw > 0.5) { vec3 c = vec3(0.0, 1.66, -0.02); transformed = c + (transformed - c) * vec3(${HELM_FIT.w.toFixed(3)}, 1.0, ${HELM_FIT.w.toFixed(3)}); transformed.y -= ${HELM_FIT.dy.toFixed(3)}; }
        }
        #include <skinning_vertex>`);
      sh.fragmentShader = 'varying float vHd;\nvarying vec3 vHP0;\n' + sh.fragmentShader.replace('void main() {', helm
        ? 'void main() {\n if (vHd > 0.5 && vHP0.z > ' + DM_FACE.z.toFixed(3) + ' && abs(vHP0.x) < ' + DM_FACE.x.toFixed(3) + ' && vHP0.y < ' + DM_FACE.y.toFixed(3) + ') discard;'
        : 'void main() {\n if (vHd > 0.5) discard;');
    }
    sh.uniforms.uWet = WET;
    sh.uniforms.uGrime = GRIME;
    // 着せる前の立ち姿の位置（m。足の裏が 0、前が +z）：縅の目・汚れの場所を、動いても甲冑に貼り付いたまま描く
    const handBones = humanBoneMap(DM.bones, domaruInverses());
    const rightHand = handBones[DM.bones.indexOf('RightHand')], leftHand = handBones[DM.bones.indexOf('LeftHand')];
    sh.vertexShader = 'varying vec3 vDmP;\nvarying vec2 vDmGlove;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vDmP = position;')
      .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
        float handWeight = 0.0;
        #ifdef USE_SKINNING
        for (int i = 0; i < 4; i++) {
          if (abs(skinIndex[i] - ${rightHand}.0) < 0.5 || abs(skinIndex[i] - ${leftHand}.0) < 0.5) handWeight += skinWeight[i];
        }
        #endif
        vDmGlove = vec2(smoothstep(0.35, 0.75, handWeight), smoothstep(0.15, 0.7, normal.z));`);
    sh.fragmentShader = 'uniform vec3 uLace, uArm;\nuniform float uLaceAmt, uArmAmt, uWet, uGrime;\nuniform vec4 uWV;\nvarying vec3 vDmP;\nvarying vec2 vDmGlove;\nfloat dmCloth, dmGold, dmLacq, dmLeather, dmH, dmWv, dmEdge, dmDust;\n' + DM_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        // スキャンの絵は博物館の暗い照明で撮られているので、少し明るく戻す
        diffuseColor.rgb = min(diffuseColor.rgb * 1.55, vec3(1.0));
        vec3 c = diffuseColor.rgb;
        float laceMask = smoothstep(1.08, 1.45, c.b / (max(c.r, c.g) + 0.002)) * smoothstep(0.003, 0.012, c.b);
        float blue = laceMask * uLaceAmt;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), ll = dot(uLace, vec3(0.2126, 0.7152, 0.0722));
        // 黒い漆（暗く、色の薄い所）
        float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / (max(c.r, max(c.g, c.b)) + 0.01);
        // 黒漆も漆として判定する。染め直しの有無を材質判定へ混ぜない。
        float lac = smoothstep(0.2, 0.06, l) * smoothstep(0.55, 0.2, sat) * (1.0 - laceMask);
        // 色の漆は深く沈んだ色に（明るい斑をそのまま持ち上げると、塗りたての玩具の赤に見える）
        vec3 armC = uArm * (0.5 + l * 3.2);
        diffuseColor.rgb = mix(c, uLace * min(3.0, l / max(ll, 0.002)) * 1.2, blue);
        diffuseColor.rgb = mix(diffuseColor.rgb, armC, lac * uArmAmt);
        // 藍の威糸は、洗いざらしの褪せた藍に（スキャンの鮮やかな青のままだと染めたての作り物に見える）
        float blue0 = laceMask * (1.0 - uLaceAmt);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.45, 0.25))) * vec3(0.92, 0.97, 1.12), blue0 * 0.3);
        if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.012, 0.01, 0.009);
        // 材の見分け：糸（威し・色の濃い明るい所）は布の艶消し、金具（黄みの強い明るい所）は金属の照り、黒い漆は滑らかだが擦れて斑
        float yel = smoothstep(0.15, 0.35, (c.r + c.g) * 0.5 - c.b) * smoothstep(0.08, 0.2, l);
        dmGold = yel * (1.0 - laceMask);
        dmCloth = max(laceMask, (1.0 - smoothstep(0.1, 0.4, lac + dmGold)) * smoothstep(0.35, 0.6, sat));
        dmLacq = lac;
        // 茶の革帯を鉄の鏡面へ混ぜない。元の絵の色から読み、威糸と金具は除く。
        dmLeather = smoothstep(1.12, 1.6, c.r / max(c.g, 0.003))
          * smoothstep(1.06, 1.5, c.g / max(c.b, 0.003))
          * (1.0 - max(dmGold, max(dmCloth, dmLacq)));
        // 手の肌は出さず、黒い布と手甲の鈍い鉄に替える（形・材質は全員で共有）。
        float glove = vDmGlove.x, plate = vDmGlove.y;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.018, 0.021, 0.019), vec3(0.055, 0.061, 0.058), plate), glove);
        dmCloth = mix(dmCloth, 1.0 - plate, glove);
        dmLeather *= 1.0 - glove; dmGold *= 1.0 - glove; dmLacq *= 1.0 - glove;
        diffuseColor.rgb *= 1.0 - uWet * 0.25 * dmCloth;
        // 絵の細かな起伏：ぼかした明るさとの差。小札の段の影・縅の目・金具の縁が、後で凹凸になる（絵の段にそろう）
        float lb = min(dot(texture2D(map, vMapUv, 2.5).rgb * 1.55, vec3(0.2126, 0.7152, 0.0722)), 1.0);
        dmH = clamp(l - lb, -0.25, 0.25);
        dmWv = 0.5; dmEdge = 0.0; dmDust = 0.0;
        if (${detailed && !SETTINGS.simpleMaterials ? 'gl_FrontFacing' : 'false'}) {
          vec3 p = vDmP;
          float n1 = dmVn(p * 16.0), n2 = dmVn(p * 75.0 + 3.1), n3 = dmVn(p * 260.0 + 7.7);
          // 縅糸の編み目：糸は縦に通る（胴・袖・草摺・錣）。一筋 1cm ほどの平組に、杉綾の目。遠くでは消す
          {
            float au = atan(p.x, p.z + 0.03) * 0.21 * 100.0, av = p.y * 330.0;
            float fu = fract(au), gap = smoothstep(0.0, 0.14, min(fu, 1.0 - fu));
            float chev = fract(av + abs(fu - 0.5) * 1.6), rib = smoothstep(0.0, 0.3, chev) * smoothstep(1.0, 0.7, chev);
            float fw = fwidth(av) + fwidth(au) * 4.0;
            dmWv = mix(0.5, gap * (0.35 + rib * 0.65), (1.0 - smoothstep(0.3, 0.9, fw)) * dmCloth);
            diffuseColor.rgb *= mix(1.0, 0.72 + dmWv * 0.5, dmCloth);
            // 糸の毛羽と色むら（染めの濃い薄い、日に焼けた所）
            diffuseColor.rgb *= mix(1.0, 0.86 + n1 * 0.2 + (n3 - 0.5) * 0.12, dmCloth);
          }
          // 擦れ：板の角・縁（丸みの強い所）で漆が薄くなり、下地の茶が出る。金具の角は明るく光る
          {
            vec3 vp = -vViewPosition, dpx = dFdx(vp), dpy = dFdy(vp);
            float curv = dot(dFdx(vNormal), dpx) / max(dot(dpx, dpx), 1e-10) + dot(dFdy(vNormal), dpy) / max(dot(dpy, dpy), 1e-10);
            dmEdge = smoothstep(14.0, 55.0, curv) * smoothstep(0.3, 0.7, n2 * 0.7 + n1 * 0.3);
            // 絵の中の明るい斑（元から擦れた所）も擦れに数える
            dmEdge = max(dmEdge, smoothstep(0.05, 0.14, dmH) * smoothstep(0.55, 0.75, n2));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.085, 0.045), dmEdge * dmLacq * 0.7);
            // 漆の細かな剥げ：小さな斑に下地の茶が覗く（新品の一色の黒にしない）
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.065, 0.035), smoothstep(0.72, 0.9, n3 * 0.55 + n2 * 0.45) * dmLacq * 0.5);
          }
          // 金具：金の照り（黄みを少し深く）。角は擦れて明るい
          diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * vec3(1.12, 1.0, 0.7) + vec3(0.03, 0.02, 0.0) + dmEdge * 0.08, vec3(1.0)), dmGold);
          // 使い込んだ汚れ：溝（小札の重なり・糸の目）に埃が溜まり、上を向いた面に土埃。腰から下（草摺の裾・佩楯・脛当）は泥
          float up = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          float cav = smoothstep(0.0, -0.12, dmH);
          float dust = (cav * 0.6 + smoothstep(0.35, 0.9, up) * 0.45) * (0.3 + 0.7 * n1) * (0.45 + 0.7 * uGrime) * (1.0 - uWet * 0.7);
          float mudA = smoothstep(0.66, 0.12, p.y) * (0.3 + 0.7 * smoothstep(0.35, 0.7, n1 * 0.6 + n2 * 0.4)) * (0.3 + 0.7 * uGrime);
          mudA += smoothstep(0.8, 0.92, n3 * 0.5 + n2 * 0.5) * smoothstep(0.95, 0.4, p.y) * 0.6 * (0.3 + 0.7 * uGrime);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.15), clamp(dust, 0.0, 0.7) * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.078, 0.055), clamp(mudA, 0.0, 1.0) * 0.6 * (1.0 - uWet * 0.3));
          dmDust = clamp(dust * 0.5 + mudA * 0.7, 0.0, 1.0);
          // 人ごとの汚れの濃さ
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.14, 0.11), clamp(dmDust * (uWV.y - 0.8), 0.0, 0.4));
          // 日焼けの褪せ：色の漆は茶へ、威糸は白っぽく褪せる（肩と兜の上ほど）
          float sunU = smoothstep(1.0, 1.6, p.y) * uWV.z;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.72, 0.6) + vec3(0.03, 0.02, 0.01), dmLacq * sunU * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.2 + 0.03, dmCloth * sunU * 0.4);
          // 刀傷と擦り傷：胴と袖の前に、斜めの細い切れ目。漆が削れて下地が白く、縁は暗い
          {
            vec3 q = p + vec3(uWV.w, uWV.w * 0.7, 0.0);
            float cut = 0.0;
            // 消える距離・背面・布・金具では、最後にゼロを掛ける傷の計算を省く。
            // 微分は分岐の外で求め、近くの傷と遠くで消える境目を保つ。
            float fw = fwidth(p.y) * 60.0;
            if (fw < 1.2 && p.z >= 0.0 && dmCloth < 1.0 && dmGold < 1.0) {
              for (int i = 0; i < 3; i++) {
                float fi = float(i);
                vec2 d = normalize(vec2(cos(fi * 2.1 + uWV.w), sin(fi * 2.1 + uWV.w)));
                float ln = dot(q.xy, d) * 7.0 + dmVn(q * 3.0 + fi) * 0.8;
                float line = 1.0 - smoothstep(0.0, 0.035, abs(fract(ln) - 0.5));
                // 傷は短く途切れ途切れに（胴に長く走ると、紐を巻いたように見える）
                // 線の外は傷がないので、途切れを作る二つの雑音も読まない。
                if (line > 0.0) {
                  float seg = smoothstep(0.78, 0.9, dmVn(q * 5.5 + fi * 4.0)) * smoothstep(0.35, 0.7, dmVn(q * 23.0 + fi));
                  cut = max(cut, line * seg);
                }
              }
            }
            cut *= uWV.x * (0.3 + 0.7 * uGrime) * (1.0 - dmCloth) * (1.0 - dmGold);
            cut *= 1.0 - smoothstep(0.4, 1.2, fw);
            // 削れた所は下地の錆び色（明るい白にしない）。縁の暗さも少し
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(0.3, 0.22, 0.15), 0.8), cut * 0.6);
            dmEdge = max(dmEdge, cut);
          }
        }
      }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        // 漆は擦れ・埃で照りに斑（新品の一律の照りにしない）。滑らかな所は深い照り、擦れた所は曇る
        float wear = ${detailed ? 'dmVn(vDmP * 40.0) * 0.7 + dmVn(vDmP * 140.0) * 0.3' : '0.5'};
        // 露出した鉄は酸化と擦れのある鈍い面。革・布・漆の照りを別々にする。
        roughnessFactor = 0.43 + wear * 0.2;
        roughnessFactor = mix(roughnessFactor, ${'0.36 + wear * 0.22 + dmEdge * 0.16'}, dmLacq);
        roughnessFactor = mix(roughnessFactor, 0.72 + wear * 0.14, dmLeather);
        roughnessFactor = mix(roughnessFactor, ${'1.0'}, dmCloth);
        // 金具：磨かれた照りに、細かな引っ掻き傷
        float scr = ${detailed ? 'smoothstep(0.55, 0.8, dmVn(vec3(vDmP.x * 600.0, vDmP.y * 40.0, vDmP.z * 600.0)))' : '0.5'};
        roughnessFactor = mix(roughnessFactor, 0.24 + scr * 0.22, dmGold);
        roughnessFactor = mix(roughnessFactor, 0.95, dmDust);
        // 雨：漆と金具は濡れて照りが増し、糸は水を吸って暗く重くなる（照りは少しだけ）
        // 濡れた漆も使い込んだ擦れを残す。鉄板と威糸を同じ鏡面へしない。
        roughnessFactor *= 1.0 - uWet * mix(0.18, 0.06, max(dmCloth, dmLeather));
      }`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      ${'metalnessFactor = 0.82 * (1.0 - dmDust);'}
      metalnessFactor = mix(metalnessFactor, 0.0, max(dmLeather, max(dmCloth, dmLacq)));
      metalnessFactor = mix(metalnessFactor, 0.85, dmGold * (1.0 - dmDust));`).replace('#include <normal_fragment_maps>', SETTINGS.simpleMaterials ? '#include <normal_fragment_maps>' : `#include <normal_fragment_maps>
      {
        // 小札の段・縅の目の凹凸（絵の細かな起伏と、編み目の高さ）
        // 小札と威の凹凸を分ける。画素より細かい所は消し、遠景のちらつきを防ぐ。
        float dmDetail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
        float hB = (dmH * mix(0.009, 0.005, dmCloth) + (dmWv - 0.5) * 0.0022 * dmCloth)
          * dmDetail * (1.0 - dmDust * 0.45);
        normal = dmBump(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)), faceDirection);
      }`).replace('#include <lights_fragment_end>', SETTINGS.simpleMaterials ? '#include <lights_fragment_end>' : `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        // 漆の艶：日の光が細く鋭く映る（塗りの上の透けた層の照り）。金具は少し広く、金色に光る
        // directLight は日差しの最後の値（影が掛かった色）
        vec3 Hd = normalize(directLight.direction + normalize(vViewPosition));
        float nh = clamp(dot(normal, Hd), 0.0, 1.0), nl = clamp(dot(normal, directLight.direction), 0.0, 1.0);
        float cc = dmLacq * (1.0 - dmDust) * (1.0 - dmEdge * 0.7) * (gl_FrontFacing ? 1.0 : 0.0);
        reflectedLight.directSpecular += directLight.color * nl * (pow(nh, 180.0) * 0.7 * cc + pow(nh, 70.0) * 0.45 * dmGold * (1.0 - dmDust) * vec3(1.0, 0.84, 0.52));
      }
      #endif
      {
        // 光源によらない白い縁光は足さず、実際の空と篝火の照りで素材を読む。
        // 黒漆の空の映り込みを抑え、金具の反射と威糸の艶消しを分ける。
        // 雨空の広い照りを残し、黒漆の袖と胴の面を曇天でも分ける。
        reflectedLight.indirectSpecular *= mix(1.0, 0.48 + uWet * 0.28, dmLacq);
        reflectedLight.indirectSpecular *= mix(1.0, 0.42, dmLeather);
        reflectedLight.indirectSpecular *= mix(1.0, 0.25, dmCloth);
      }`).replace('#include <aomap_fragment>', `#include <aomap_fragment>
      {
        // 既存の絵の谷を遮光に使う。段が画素より細かい距離では消してちらつきを避ける。
        float detail = 1.0 - smoothstep(0.003, 0.018, max(length(dFdx(vMapUv)), length(dFdy(vMapUv))));
        float cavity = (1.0 - smoothstep(-0.1, 0.0, dmH)) * detail;
        // 糸の谷も遮光する。遠くでは細部を消し、直接光と金具の反射は保つ。
        float weaveShade = mix(1.0, 0.72 + 0.28 * dmWv, dmCloth * detail);
        // 板の谷と革帯の重なりを曇天の回り込みにも残す。直接光は既存の影を使う。
        float occlusion = (1.0 - cavity * (0.55 + dmLeather * 0.16)) * weaveShade;
        reflectedLight.indirectDiffuse *= occlusion;
        reflectedLight.indirectSpecular *= occlusion;
      }`);
    // 一人称：目のすぐ前（FP_CUT の球の中）に来た自分の袖・肩の板は描かない（目の前を塞がない。他の人は目から遠いので消えない）
    if (detailed) {
      sh.uniforms.uFpCut = FP_CUT;
      sh.vertexShader = 'varying vec3 vFpW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vFpW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform vec4 uFpCut;\nvarying vec3 vFpW;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (uFpCut.w > 0.0 && distance(vFpW, uFpCut.xyz) < uFpCut.w) discard;');
    }
  };
  m.customProgramCacheKey = () => 'domaru' + (helm ? '-hm' : noHead ? '-nh' : '') + (detailed ? '-detail' : '-crowd');
  dmMats.set(k, m);
  return m;
}
// 骨の入った人に本物の胴丸を着せる（顔も手も人形の物を使う）。noHead の時は兜と顔を描かない
function dressDomaru(h, noHead = false) {
  // 元の体は隠す（現代の服の膨らみが甲冑の外へ出るので）。脇の、スキャンに写っていない所は、甲冑の裏（暗い）が見える
  h.body.visible = false;
  const sk = new THREE.Skeleton(DM.bones.map((nm) => h.bones[nm]), domaruInverses());
  const detailed = qualityKeeper(h.u) || !!h.u.name;
  // 一般兵は足軽も武者も頭を除いた中精細スキャンを共有する。
  h.loanedDomaru = noHead === true && !detailed;
  const variant = detailed ? Math.floor(((h.seed || 0) * 5.37) % 1 * 4) : 0;
  const m = new THREE.SkinnedMesh(h.loanedDomaru ? DM.loanMid : DM.hi, domaruMaterial(h.look, noHead, variant, detailed));
  m.userData.surfaceBase = m.material;
  // 一般兵の凹凸と汚れはスキャンの絵・法線で描く。画素ごとの多重雑音は本人・武将だけ。
  m.userData.surfaceFine = detailed ? domaruMaterial(h.look, noHead, variant, true) : m.material;
  m.bind(sk, new THREE.Matrix4());
  // 一般兵の影は、元からある具足の一体形で描く。胴丸の影は追加しない。
  m.castShadow = !h.loanedDomaru; m.receiveShadow = true;
  m.frustumCulled = true; m.boundingSphere = BSPH;
  // 遠くは軽い形（影を描く時も軽い形）
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = DOMARU.near;
    // 十五メートル以内は全員、中精細以上のスキャン。遠景と影は軽い段。
    // 遠景の形も読み込み時に共用で作り、描くたびに形の置き場を検索しない。
    const close = !cam.isOrthographicCamera && d2 < near * near;
    const want = h.loanedDomaru
      ? close ? DM.loanMid : DM.loanLo
      : !cam.isOrthographicCamera && (qualityKeeper(h.u) || close && m.userData.hiOK !== false) ? DM.hi
        : !cam.isOrthographicCamera && d2 < 35 * 35 ? DM.mid
          : !cam.isOrthographicCamera && d2 > 35 * 35 && !HUM.lodOff ? DM.far : DM.lo;
    if (m.geometry !== want) m.geometry = want;
  };
  h.root.add(m);
  h.parts.domaru = m;
}
// 本陣の飾り甲冑：飾り台に据えた胴丸（台・人形・槍ごと。約1万2千面）。読み込みを待ってから返す
// 使い方：const g = await displayArmor(); g.position.set(x, 地面の高さ, z); g.rotation.y = 向き; scene.add(g)
async function displayArmor({ scale = 1 } = {}) {
  await loadDomaru();
  if (!DM) return null;
  const g = new THREE.Group();
  const m = new THREE.Mesh(DM.stand, domaruMaterial({}));
  // 形は人形の足の裏が 0。台の底（約 -0.4m）を地面に
  DM.stand.computeBoundingBox();
  m.position.y = -DM.stand.boundingBox.min.y;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.scale.setScalar(scale);
  return g;
}

// 本陣の飾りの具足一式（櫃に腰掛けた姿の3Dスキャン。約2万面・遠くは4千面）。読み込みを待ってから返す
// ・yoroi：國學院大學栃木学園参考館「yoroi」（CC BY 4.0）。既定はこれ
// ・tokyo：TokyoDigitalHeritage「Samurai Armor, Tokyo National Museum (Ueno)」（CC BY 4.0）。館の中での撮影の決まり（写真の商用利用）を kaito が確かめるまでは出さない（YOROI.tokyo を true にすると出る）
// 形は台（櫃）の底が y=0、前が +z。使い方：const g = await displayYoroi(); g.position.set(x, 地面, z); g.rotation.y = 向き; scene.add(g)
const YOROI = { on: true, tokyo: false };
let YR = null;
let yrLoading = null;
function loadYoroi() {
  if (yrLoading) return yrLoading;
  yrLoading = (async () => {
    const buf = await assetBytes('yoroi');
    const gl = await new GLTFLoader().parseAsync(buf.buffer, '');
    YR = { geo: {}, mat: {} };
    gl.scene.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); YR.geo[o.name] = o.geometry; } });
  })().catch((e) => { YR = null; console.warn('飾りの具足を読めませんでした', e); });
  return yrLoading;
}
async function displayYoroi({ kind = 'yoroi', scale = 1 } = {}) {
  if (!YOROI.on || (kind === 'tokyo' && !YOROI.tokyo)) return null;
  await loadYoroi();
  if (!YR || !YR.geo[kind]) return null;
  if (!YR.mat[kind]) {
    const col = await texOr(kind + '_col', new URL('../assets/yoroi_lite/' + kind + '_col.jpg', import.meta.url).href, { srgb: true, anisotropy: 8 });
    // スキャンの絵は館の明かりが焼き込まれているので、照らしは控えめに（粗く、少し暗く）
    const m = armorMaterial({ map: col, color: 0xd8d8d8, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.3;'); };
    m.customProgramCacheKey = () => 'yoroi';
    YR.mat[kind] = m;
  }
  const hi = YR.geo[kind], lo = YR.geo[kind + '_lo'] || hi;
  const m = new THREE.Mesh(hi, YR.mat[kind]);
  m.castShadow = true; m.receiveShadow = true;
  // 近く（25m の内）だけ細かい形
  m.onBeforeRender = (r, s, cam) => {
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const want = !cam.isOrthographicCamera && (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2 < 625 ? hi : lo;
    if (m.geometry !== want) m.geometry = want;
  };
  const g = new THREE.Group();
  g.add(m); g.scale.setScalar(scale);
  return g;
}
// 家紋の絵：旗の絵（textures.js）から紋の形だけを抜き、紋の色で塗る
const monMats = new Map();
let MON_GEO = null;
function monDecal(kind, col) {
  const key = kind + '|' + col;
  if (!monMats.has(key)) {
    const W = 256, H = 400, cy = Math.round(H * 0.32);
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    // 読み出す絵は、画面の描画（GPU）でなく手元（CPU）の絵に描く：GPU の絵からの読み出しは、混んだ機械では一枚に何秒もかかり、戦の始めに固まる元だった
    const sg = src.getContext('2d', { willReadFrequently: true });
    drawMon(sg, kind, W, H);
    const d = sg.getImageData(0, cy - 128, W, 256).data;
    // 地の色（四隅）から離れた所が紋
    const bg = [d[(10 * W + 128) * 4], d[(10 * W + 128) * 4 + 1], d[(10 * W + 128) * 4 + 2]];
    const out = document.createElement('canvas'); out.width = out.height = 256;
    const og = out.getContext('2d', { willReadFrequently: true }), img = og.createImageData(256, 256);
    const c = new THREE.Color(col);
    let n = 0;
    for (let i = 0; i < 256 * 256; i++) {
      const x = i % 256;
      const dd = Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]);
      const a = x < 20 ? 0 : Math.min(255, Math.max(0, (dd - 60) * 3));
      if (a > 128) n++;
      img.data[i * 4] = c.r * 255; img.data[i * 4 + 1] = c.g * 255; img.data[i * 4 + 2] = c.b * 255; img.data[i * 4 + 3] = a;
    }
    og.putImageData(img, 0, 0);
    if (n < 200) { monMats.set(key, null); return null; }
    const tex = new THREE.CanvasTexture(out); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const gold = c.r > 0.6 && c.b < 0.45;
    monMats.set(key, armorMaterial({ map: tex, alphaTest: 0.5, roughness: gold ? 0.35 : 0.85, metalness: gold ? 0.7 : 0, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
  }
  const mat = monMats.get(key);
  if (!mat) return null;
  if (!MON_GEO) {
    // 陣羽織（units.js の形）の背の外側に、少し浮かせて貼る（体の座標。武将の体つき 1.08）
    const r0 = 1.08, rAt = (y) => 0.35 * r0 + (0.262 * r0 - 0.35 * r0) * ((y - 0.8) / 0.64);
    const y0 = 1.02, y1 = 1.38;
    MON_GEO = new THREE.CylinderGeometry(rAt(y1) + 0.007, rAt(y0) + 0.007, y1 - y0, 12, 1, true, Math.PI - 0.62, 1.24);
    MON_GEO.translate(0, (y0 + y1) / 2, 0);
    const p = MON_GEO.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const r = Math.hypot(x, z) || 1; const d = haoriFold(Math.atan2(x, z), y); p.setXYZ(i, x * (1 + d / r), y, z * (1 + d / r) - 0.004); }
    MON_GEO.computeVertexNormals();
  }
  const m = new THREE.Mesh(MON_GEO, mat);
  m.frustumCulled = false;
  return m;
}

export { loading, loadHumans, DOMARU, DM, dmLoading, loadDomaru, KABUTO, KB, kbLoading, loadKabuto, dressMenpo, kabutoStyle, CREST_GEO, CREST_MAT, dressKabuto, wantsDomaru, crowdDomaru, dmMats, domaruMaterial, dressDomaru, displayArmor, YOROI, YR, displayYoroi, monMats, MON_GEO, monDecal };
