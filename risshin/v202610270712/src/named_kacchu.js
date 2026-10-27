// 全武将の当世具足。鉢・錣・面頬・胴・袖は共通部品を使い回す。
// 近い兜と遠い兜で同じ立物を使い、数珠・白熊・片肌脱ぎも既存の形へ結合する。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bodyGeometry, geoCache, P, MK, merge, monReg } from './units_model.js';

import { KACCHU } from './kacchu_data.js';
export function namedKacchu(look) {
  if (look.kosode || look.sohei || look.nanban || typeof look.face !== 'string' || !look.face.startsWith('g:')) return null;
  return look.kacchu || KACCHU[look.face.slice(2)] || null;
}
export function namedArmorLook(look) {
  const st = namedKacchu(look);
  if (!st) return look;
  // 面を実写の顔へ付ける段では、喉の垂だけにした指定を保つ。
  return { ...look, ...st, ...(look.sideArmor ? { armor: look.sideArmor, helm: look.sideArmor, hatColor: look.sideArmor } : {}), menpoStyle: look.menpoScan ? 'tare' : st.menpoStyle, vi: 1 };
}
const crests = new Map();
export function namedCrestGeometry(kind, hi = true) {
  // 信長の鍬形は既存の形を共用し、木瓜の前立だけ頭の共有形へ加える。
  if (kind === 'oda_kuwa') kind = 'kuwa';
  if (!['ii_tentsuki', 'honda_shika', 'kenshin_nichirin', 'kenshin_izuna', 'niwa_shikami', 'kuwa', 'kuwa_wide', 'moon', 'sun', 'horn', 'cross', 'shida', 'bellflower', 'bull', 'toyotomi_horns', 'feather', 'akechi_ears', 'manji', 'date_moon'].includes(kind)) return null;
  const key = kind === 'honda_shika' && !hi ? kind + '|遠' : kind;
  if (crests.has(key)) return crests.get(key);
  const parts = [];
  const plate = (pts, x, y, z) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 0.005, bevelEnabled: false, curveSegments: 3 });
    g.translate(x, y, z - 0.0025); parts.push(g);
  };
  if (kind === 'ii_tentsuki') {
    // 頭形の鉢の左右から、先が外へ反る幅広い金の天衝。
    for (const sd of [-1, 1]) plate([[0, 0], [0.027, 0.025], [0.075, 0.22], [0.145, 0.43], [0.092, 0.4], [0.035, 0.23], [-0.012, 0.04]].map(([x, y]) => [sd * x, y]), sd * 0.12, 0.17, 0.015);
  }
  if (kind === 'honda_shika' && hi) {
    // 太い根元から外へ反る平たい鹿角。三つの枝と先端を一枚にして使い回す。
    const outline = [[0.075, 0.175], [0.135, 0.18], [0.18, 0.29],
      [0.26, 0.32], [0.355, 0.395], [0.28, 0.365], [0.205, 0.35],
      [0.265, 0.435], [0.36, 0.465], [0.465, 0.565], [0.37, 0.505],
      [0.295, 0.485], [0.34, 0.56], [0.365, 0.675], [0.32, 0.59],
      [0.275, 0.535], [0.24, 0.555], [0.205, 0.63], [0.21, 0.535],
      [0.24, 0.49], [0.195, 0.42], [0.135, 0.32]];
    for (const sd of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(sd * x, y))),
        { depth: 0.018, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, steps: 1, curveSegments: 3 });
      g.translate(0, 0, -0.03); parts.push(g);
    }
  }
  if (kind === 'honda_shika' && !hi) {
    // 遠い兵には元の軽い鹿角を保ち、細かな形を足さない。
    const branch = (a, b, r0, r1) => {
      const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b), v = q.clone().sub(p);
      const g = new THREE.CylinderGeometry(r1, r0, v.length(), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
      g.translate(...p.add(q).multiplyScalar(0.5).toArray()); parts.push(g.toNonIndexed());
    };
    for (const sd of [-1, 1]) {
      const a = [sd * 0.1, 0.18, -0.015], b = [sd * 0.17, 0.31, -0.025], c = [sd * 0.22, 0.44, -0.055], d = [sd * 0.2, 0.59, -0.075];
      branch(a, b, 0.016, 0.013); branch(b, c, 0.013, 0.01); branch(c, d, 0.01, 0.003);
      branch(b, [sd * 0.29, 0.42, 0.015], 0.01, 0.003);
      branch(c, [sd * 0.12, 0.55, 0.035], 0.008, 0.003);
    }
  }
  if (kind === 'kenshin_nichirin') {
    // 後から届いた写真の日輪と瑞雲。雲と円盤を一枚の金の形へ。
    const g = new THREE.CylinderGeometry(0.125, 0.125, 0.005, 20);
    g.rotateX(Math.PI / 2); g.translate(0, 0.37, 0.145); parts.push(g.toNonIndexed());
    plate([[-0.14, 0], [-0.17, 0.025], [-0.145, 0.045], [-0.105, 0.04], [-0.085, 0.075], [-0.045, 0.085], [0, 0.065], [0.04, 0.095], [0.085, 0.08], [0.105, 0.05], [0.15, 0.055], [0.175, 0.03], [0.145, 0], [0.045, -0.015], [-0.045, -0.015]], 0, 0.18, 0.155);
  }
  if (kind === 'kenshin_izuna') {
    // 伝所用の飯綱明神前立を参考にした輪郭。霊狐に正面向きの像を載せる。
    // 細部は補った金の薄板で、近景・遠景とも一度作った結合形を共有する。
    // 長岡市「謙信公兜の前立」：
    // https://www.city.nagaoka.niigata.jp/kankou/rekishi/shiseki/kensinkabuto.html
    // 稽照殿の解説にある雲・火焔・三鈷柄剣・索・狐の三鈷杵を補う。
    // https://uesugi-keishoden.jp/
    // 細部の寸法と輪郭は復元案。手取川当日の着用は断定しない。
    // 火焔は像の背へ置き、顔と翼を覆わず外側へ先を出す。
    for (const sd of [-1, 1])
      plate([[.025, 0], [.085, .025], [.105, .09], [.075, .07],
        [.095, .155], [.06, .125], [.055, .22], [.025, .18],
        [.005, .245], [-.005, .14]].map(([x, y]) => [sd * x, y]), 0, .31, .14);
    // 雲上を駆ける狐。雲は足元へ敷き、脚の輪郭を残す。
    plate([[-.18, 0], [-.2, .02], [-.17, .04], [-.13, .025],
      [-.09, .05], [-.05, .035], [0, .045], [.045, .025],
      [.1, .04], [.16, .02], [.14, 0], [.04, -.01], [-.07, -.01]], 0, .145, .145);
    // 狐の胴・立つ耳と長い鼻・後ろへ上がる尾。
    plate([[-.14, .03], [-.12, .09], [-.07, .12], [.07, .12], [.12, .1],
      [.15, .17], [.19, .2], [.18, .13], [.15, .08], [.1, .04], [-.04, .04]], 0, .17, .15);
    plate([[-.14, .04], [-.19, .07], [-.22, .1], [-.17, .12], [-.16, .19],
      [-.13, .15], [-.1, .19], [-.09, .1], [-.05, .07]], 0, .22, .15);
    for (const [x, dx] of [[-.1, -.05], [.08, .06]])
      plate([[0, 0], [dx, -.06], [dx - .035, -.07], [dx - .035, -.085],
        [dx + .025, -.085], [.03, .01]], x, .22, .15);
    // 衣の裾、翼を広げた迦楼羅姿の胴、くちばしのある頭。
    plate([[-.075, 0], [-.045, .09], [-.025, .16], [.025, .16], [.045, .09],
      [.075, 0], [.02, .02], [0, -.015], [-.02, .02]], 0, .28, .16);
    for (const sd of [-1, 1])
      plate([[.02, .08], [.07, .15], [.12, .18], [.1, .1], [.065, .065],
        [.12, .035], [.1, .02], [.04, .045]].map(([x, y]) => [sd * x, y]), 0, .31, .155);
    plate([[-.025, 0], [-.035, .04], [-.015, .075], [.015, .075], [.035, .04],
      [.025, 0], [0, -.025]], 0, .45, .17);
    // 像の右手（正面から左）に剣、左手に垂れる索。薄板へ結合し描画を増やさない。
    plate([[-.006, 0], [-.006, .055], [-.015, .055], [-.015, .065],
      [-.006, .065], [-.009, .125], [0, .15], [.009, .125],
      [.006, .065], [.015, .065], [.015, .055], [.006, .055], [.006, 0]], -.095, .355, .175);
    for (const sd of [-1, 1])
      plate([[0, 0], [sd * .012, .008], [sd * .014, .024],
        [sd * .005, .018], [sd * .004, .009]], -.095, .345, .175);
    plate([[0, 0], [.01, -.025], [.005, -.07], [.018, -.105],
      [.01, -.11], [-.005, -.07], [0, -.025], [-.008, -.005]], .095, .39, .175);
    // 狐がくわえる三鈷杵。中央と左右の三つの先を両端に設ける。
    for (const sd of [-1, 1])
      plate([[0, -.004], [sd * .017, -.004], [sd * .027, -.016],
        [sd * .039, -.012], [sd * .025, -.008], [sd * .045, 0],
        [sd * .025, .008], [sd * .039, .012], [sd * .027, .016],
        [sd * .017, .004], [0, .004]], -.215, .315, .17);
  }
  const disc = (r, x, y) => {
    const g = new THREE.CylinderGeometry(r, r, 0.005, 20);
    g.rotateX(Math.PI / 2); g.translate(x, y, 0.155); parts.push(g.toNonIndexed());
  };
  const bar = (x, y, w, h) => plate([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], x, y, 0.16);
  const moon = (wide = false) => {
    const pts = [], rx = wide ? 0.36 : 0.14, ry = wide ? 0.13 : 0.14;
    for (let i = 0; i <= 18; i++) { const a = Math.PI + i * Math.PI / 18; pts.push([rx * Math.cos(a), ry * Math.sin(a)]); }
    for (let i = 18; i >= 0; i--) { const a = Math.PI + i * Math.PI / 18; pts.push([rx * Math.cos(a), ry * 0.62 * Math.sin(a) + 0.025]); }
    plate(pts, 0, wide ? 0.38 : 0.34, 0.16);
  };
  if (kind === 'kuwa' || kind === 'kuwa_wide') for (const sd of [-1, 1]) {
    const w = kind === 'kuwa_wide' ? 1.5 : 1;
    plate([[0, 0], [0.055, 0], [0.13 * w, 0.14], [0.17 * w, 0.32], [0.105 * w, 0.27], [0.07, 0.12]].map(([x, y]) => [sd * x, y]), sd * 0.02, 0.17, 0.15);
  }
  if (kind === 'sun') disc(0.13, 0, 0.34);
  if (kind === 'niwa_shikami') {
    // 二本松市の解説にいう獅子頭（しかみ）。角・張った頬・牙の輪郭を金の薄板で補う。
    // 表情と寸法は復元案。一度結合して保管し、近い兜と遠い兜で同じ形を使う。
    const outline = [[-.075, -.075], [-.12, -.035], [-.135, .025], [-.1, .065],
      [-.12, .14], [-.065, .105], [-.045, .075], [0, .09], [.045, .075],
      [.065, .105], [.12, .14], [.1, .065], [.135, .025], [.12, -.035], [.075, -.075]];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const sd of [-1, 1]) {
      const eye = new THREE.Path();
      eye.absellipse(sd * .052, .025, .025, .012, 0, Math.PI * 2, true);
      shape.holes.push(eye);
    }
    const mouth = new THREE.Path();
    mouth.moveTo(-.06, -.025); mouth.lineTo(-.04, -.015); mouth.lineTo(-.025, -.04);
    mouth.lineTo(.025, -.04); mouth.lineTo(.04, -.015); mouth.lineTo(.06, -.025);
    mouth.lineTo(.05, -.055); mouth.lineTo(-.05, -.055); mouth.closePath();
    shape.holes.push(mouth);
    const mask = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false, steps: 1, curveSegments: 4 });
    mask.translate(0, .225, .19); parts.push(mask);
  }
  if (kind === 'moon' || kind === 'date_moon') moon(kind === 'date_moon');
  if (kind === 'cross') { bar(0, 0.34, 0.035, 0.29); bar(0, 0.39, 0.19, 0.035); }
  if (kind === 'horn' || kind === 'bull' || kind === 'toyotomi_horns') for (const sd of [-1, 1]) {
    const pts = kind === 'toyotomi_horns' ? [[0, 0], [0.09, 0.03], [0.27, 0.04], [0.33, 0.12], [0.32, 0.25], [0.24, 0.27], [0.12, 0.2], [0.07, 0.08]] : [[0, 0], [0.045, 0], [0.17, 0.11], [0.24, 0.28], [0.23, 0.43], [0.2, 0.34], [0.12, 0.17], [0.04, 0.06]];
    plate(pts.map(([x, y]) => [sd * x, y]), sd * 0.1, 0.18, 0.015);
  }
  if (kind === 'shida') for (const sd of [-1, 1]) {
    for (let i = 0; i < 8; i++) plate([[0, 0], [0.045, 0.02], [0.1, 0.08], [0.07, 0.09]].map(([x, y]) => [sd * (x + i * 0.012), y + i * 0.034]), sd * 0.06, 0.19, 0.13);
  }
  if (kind === 'bellflower') {
    disc(0.035, 0, 0.32);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const g = new THREE.SphereGeometry(0.07, 6, 4); g.scale(0.6, 1, 0.08); g.rotateZ(-a);
      g.translate(Math.sin(a) * 0.065, 0.32 + Math.cos(a) * 0.065, 0.155); parts.push(g.toNonIndexed());
    }
  }
  if (kind === 'feather') for (let i = -3; i <= 3; i++) {
    plate([[-0.012, 0], [0.012, 0], [0.028 + i * 0.006, 0.4], [i * 0.012, 0.56 - Math.abs(i) * 0.02], [-0.028 + i * 0.006, 0.4]], i * 0.018, 0.19, -0.045);
  }
  if (kind === 'akechi_ears') {
    moon();
    for (const sd of [-1, 1]) plate([[0, 0], [0.07, 0.14], [0.045, 0.33], [0, 0.27], [-0.025, 0.08]].map(([x, y]) => [sd * x, y]), sd * 0.12, 0.19, 0.02);
  }
  if (kind === 'manji') {
    disc(0.155, 0, 0.37);
    // 墨の卍は塗った形へ結合する。
  }
  for (const g of parts) for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
  const g = mergeGeometries(parts); g.computeBoundingSphere();
  if (kind === 'kenshin_nichirin') g.userData.cloudStart = parts[0].attributes.position.count;
  const out = [g, ['honda_shika', 'bull', 'feather'].includes(kind) ? 'black' : 'gold'];
  crests.set(key, out); return out;
}
// 白い大数珠を左肩から右腰へ。拳の半分ほどの珠を十二個、隙間を空けて並べる。体の左は +x。
// 珠は胴の形（base）の前の面を探して、その上へ一つずつ載せる（骨入りの姿でも胴から浮かない）。形は具足ごとに一度だけ作る。
function juzu(base) {
  const parts = [], p = base?.attributes.position, bead = new THREE.SphereGeometry(0.026, 8, 6);
  for (let i = 0; i < 12; i++) {
    const t = i / 11, x = -0.24 + 0.43 * t, y = 1.43 - 0.47 * t, gx = x * 0.9;
    // 浅くした胸の面に沿わせ、数珠だけが前へ浮かないようにする。胴の形があれば、その前の面へ載せる。
    let z = 0.187 + 0.008 * Math.sin(t * Math.PI);
    if (p) {
      let best = -1;
      for (let k = 0; k < p.count; k++) if (Math.abs(p.getX(k) - gx) < 0.03 && Math.abs(p.getY(k) - y) < 0.03 && p.getZ(k) > best) best = p.getZ(k);
      if (best > 0.1) z = best + 0.026;
    }
    const g = bead.clone(); g.translate(gx, y, z);
    parts.push(P(g, 0xd8d3c7, { mk: MK.lac, dirt: 0.2 }));
  }
  bead.dispose();
  return merge(parts);
}
const furGeos = new Map();
function fur(col) {
  if (furGeos.has(col)) return furGeos.get(col);
  const parts = [];
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) {
    const g = new THREE.ConeGeometry(0.038, 0.29, 5);
    g.rotateZ(Math.PI + sd * 0.18); g.translate(sd * (0.17 + i * 0.014), 0.1, -0.04 - i * 0.023);
    parts.push(P(g, col, { reg: 'fur' }));
  }
  const g = merge(parts); furGeos.set(col, g); return g;
}
export function namedArmorGeometry(key, look, hi, part) {
  const st = namedKacchu(look);
  if (!st || !['head', 'haori', 'nohead', 'torso'].includes(part)) return bodyGeometry(key, look, hi, part);
  const ck = '名将|' + key + '|' + part + '|' + hi;
  if (geoCache.has(ck)) return geoCache.get(ck);
  const base = bodyGeometry(ck, look, hi, part), parts = base ? [base.clone()] : [];
  if (part === 'head') {
    if (hi && st.shikoroMimiito != null) {
      // 雑賀の二将の錣の左右の小口へ耳糸を補う。色・太さ・通し方は復元案。
      // 文化庁「黒漆五枚胴具足（伊達政宗所用）」の錣の耳糸を構造の手掛かりとする。
      // https://online.bunka.go.jp/db/heritages/detail/210479
      // 四段それぞれの傾斜と兜の縮尺に合わせ、共有する頭へ一度だけ結合する。
      for (const angle of [Math.PI * .29, Math.PI * 1.71]) for (let i = 0; i < 4; i++) {
        const point = (bottom) => {
          const r = .2 + i * .024 + (bottom ? .022 : 0) + .004;
          const y = 1.635 - i * .056 + (bottom ? -.033 : .033);
          return new THREE.Vector3(Math.sin(angle) * r * .84,
            1.6 + (y - 1.6) * .9,
            .01 + (Math.cos(angle) * r - .012 - i * .012 - .01) * .84);
        };
        const a = point(false), b = point(true), direction = b.clone().sub(a);
        const g = new THREE.CylinderGeometry(.0035, .0035, direction.length(), 4);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), direction.normalize()));
        g.translate(...a.add(b).multiplyScalar(.5).toArray());
        parts.push(P(g, st.shikoroMimiito, { mk: MK.cloth, reg: 'cord' }));
      }
    }
    if (hi && st.shikoroHishinui != null) {
      // 錣の裾板を交差して縫う菱縫。色・針目は雑賀の二将だけの復元案。
      // 小学館「デジタル大辞泉」菱縫：https://kotobank.jp/word/菱縫-609896
      // 兜の最下段の傾きと縮尺に合わせ、頭の共有形へ一度だけ結合する。
      // 頭の骨と一緒に動かし、部品・材質・毎コマの処理は増やさない。
      const point = (angle, y) => {
        const r = .272 + (1.5 - y) / .066 * .022 + .004;
        return new THREE.Vector3(Math.sin(angle) * r * .84,
          1.6 + (y - 1.6) * .9, .01 + (Math.cos(angle) * r - .048 - .01) * .84);
      };
      const start = Math.PI * .29, span = Math.PI * 1.42, count = 24;
      for (let i = 0; i < count; i++) for (const sd of [-1, 1]) {
        const center = start + span * (i + .5) / count, half = span / count * .36;
        const a = point(center - sd * half, 1.476), b = point(center + sd * half, 1.45);
        const direction = b.clone().sub(a);
        const g = new THREE.CylinderGeometry(.0025, .0025, direction.length(), 4);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), direction.normalize()));
        g.translate(...a.add(b).multiplyScalar(.5).toArray());
        parts.push(P(g, st.shikoroHishinui, { mk: MK.cloth, reg: 'cord' }));
      }
    }
    if (st.shinobi != null) {
      // 雑賀の二将だけに補う忍緒。顎下で締め、顔の中央を横切らせない。
      // https://www.chiba-muse.or.jp/SONAN/kikaku/yoroi/sinobinoo.htm
      // https://www.meihaku.jp/armor-basic/armor-wear/
      // 色・寸法・結び方は復元案。頭の共有形に結合し、近景も遠景も同じ位置に保つ。
      const cord = (a, b) => {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
        const direction = end.clone().sub(start);
        const g = new THREE.CylinderGeometry(.004, .004, direction.length(), 4);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), direction.normalize()));
        g.translate(...start.add(end).multiplyScalar(.5).toArray());
        parts.push(P(g, st.shinobi, { mk: MK.cloth, reg: 'cord' }));
      };
      for (const sd of [-1, 1]) {
        cord([sd * .145, 1.65, .01], [sd * .105, 1.53, .075]);
        cord([sd * .105, 1.53, .075], [0, 1.49, .095]);
        cord([0, 1.49, .095], [sd * .022, 1.455, .10]);
        if (hi) {
          const loop = new THREE.TorusGeometry(.012, .0035, 4, 8);
          loop.rotateZ(sd * .5); loop.translate(sd * .012, 1.485, .10);
          parts.push(P(loop, st.shinobi, { mk: MK.cloth, reg: 'cord' }));
        }
      }
    }
    const crest = namedCrestGeometry(st.crest, hi);
    if (crest) {
      const [g, col] = crest;
      const cg = P(g.clone().scale(1.04, 1.04, 1.04).translate(0, 1.49, 0.012), col === 'black' ? 0x14110f : 0xc29a48, { mk: col === 'black' ? MK.lac : MK.gold, reg: 'lacq', dirt: 0.2 });
      if (st.crest === 'kenshin_nichirin') {
        const col = new THREE.Color(0x151312), a = cg.attributes.color, b = cg.attributes.col2;
        for (let i = g.userData.cloudStart; i < a.count; i++) { a.setXYZ(i, col.r, col.g, col.b); b.setXYZ(i, col.r, col.g, col.b); cg.attributes.mtl.setX(i, MK.lac + MK.lac * 8 + 0.18); }
      }
      if (st.crest === 'manji') {
        // 円盤の前に墨の板を結合し、低い細かさでも卍を残す。
        for (const [x, y, w, h] of [[0, 0, 0.025, 0.18], [0, 0, 0.18, 0.025], [0.079, 0.04, 0.025, 0.08], [-0.04, 0.079, 0.08, 0.025], [-0.079, -0.04, 0.025, 0.08], [0.04, -0.079, 0.08, 0.025]]) {
          const mark = new THREE.BoxGeometry(w, h, 0.002);
          mark.translate(x, 0.37 + y, 0.16); mark.scale(1.04, 1.04, 1.04); mark.translate(0, 1.49, 0.012);
          parts.push(P(mark, 0x14110f, { mk: MK.lac, reg: 'lacq' }));
        }
      }
      parts.push(cg);
    }
    if (st.crest === 'oda_kuwa') {
      // 建勲神社伝来の兜を参考にした復元。黒漆の板と金箔紋は既存の一枚絵・材質で描く。
      // 京都国立博物館：https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
      const plaque = new THREE.PlaneGeometry(0.17, 0.2);
      plaque.translate(0, 1.82, 0.19);
      parts.push(P(plaque, 0x14110f, { mk: MK.lac, reg: monReg('oda'), c2: 0xc29a48, mk2: MK.gold, dirt: 0.2 }));
    }
    if (st.fur) parts.push(fur(st.fur).clone().translate(0, 1.49, 0));
  }
  if (hi && st.juzu && (part === 'torso' || part === 'nohead')) parts.push(juzu(base));
  if (st.skinDo && base && (part === 'torso' || part === 'nohead')) {
    const g = parts[0], p = g.attributes.position, c = g.attributes.color, c2 = g.attributes.col2, col = new THREE.Color(st.skinDo);
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.07 && p.getY(i) > 0.94 && p.getY(i) < 1.44 && p.getX(i) < 0.09) { c.setXYZ(i, col.r, col.g, col.b); c2.setXYZ(i, col.r, col.g, col.b); }
    for (const [x, y, rx, ry] of [[-0.065, 1.3, 0.12, 0.085], [-0.04, 1.15, 0.08, 0.09], [-0.02, 1.01, 0.065, 0.05]]) {
      const muscle = new THREE.SphereGeometry(1, 8, 5); muscle.scale(rx * 0.9, ry, 0.015); muscle.translate(x * 0.9, y, 0.15);
      parts.push(P(muscle, st.skinDo, { mk: MK.lac, reg: 'lacq' }));
    }
  }
  const g = parts.length ? merge(parts) : null; geoCache.set(ck, g); return g;
}
