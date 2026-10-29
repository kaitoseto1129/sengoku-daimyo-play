// 全武将の当世具足。鉢・錣・面頬・胴・袖は共通部品を使い回す。
// 近い兜と遠い兜で同じ立物を使い、数珠・白熊・片肌脱ぎも既存の形へ結合する。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { bodyGeometry, geoCache, P, MK, merge, haoriPoint } from './units_model.js';

import { KACCHU } from './kacchu_data.js';
import { S } from './settings.js';
import { realCrestGeometry } from './kabuto_real.js';
export function namedKacchu(look) {
  if (look.kosode || look.sohei || look.nanban || typeof look.face !== 'string' || !look.face.startsWith('g:')) return null;
  return look.kacchu || KACCHU[look.face.slice(2)] || null;
}
export function namedArmorLook(look) {
  const st = namedKacchu(look);
  if (!st) return look;
  // 面を実写の顔へ付ける段では、喉の垂だけにした指定を保つ。
  return { ...look, ...st, ...(look.sideArmor ? { armor: look.sideArmor, helm: look.sideArmor, hatColor: look.sideArmor } : {}), menpoStyle: look.menpoScan ? 'tare' : st.menpoStyle, vi: 1, ...(look.noHaori ? { haori: 0 } : {}) };
}
const crests = new Map();
export function namedCrestGeometry(kind, hi = true) {
  // 名のある武将の本物の立物（kabuto_real.js）
  const real = realCrestGeometry(kind, hi);
  if (real !== undefined) return real;
  if (!['ii_tentsuki', 'honda_shika', 'kenshin_nichirin', 'kenshin_izuna', 'niwa_shikami', 'kuwa', 'kuwa_wide', 'oda_kuwa', 'sankoken', 'moon', 'sun', 'horn', 'cross', 'shida', 'bellflower', 'bull', 'toyotomi_horns', 'feather', 'akechi_ears', 'manji', 'date_moon', 'takigawa_buffalo'].includes(kind)) return null;
  const buffaloSolid = kind === 'takigawa_buffalo' && S.quality === 'high';
  const key = (kind === 'honda_shika' && !hi) || (kind === 'oda_kuwa' && hi) ? kind + (hi ? '|近' : '|遠') : buffaloSolid ? kind + '|立体' : kind;
  if (crests.has(key)) return crests.get(key);
  const parts = [];
  const plate = (pts, x, y, z) => {
    // 打ち出しの金具の厚み：縁を丸く落とし、縁に照りの線が立つように（板一枚の切り絵に見せない）
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), hi ? { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0022, bevelSize: 0.0018, bevelSegments: 2, curveSegments: 3 } : { depth: 0.005, bevelEnabled: false, curveSegments: 3 });
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
    // 近い形は、縁を丸めた厚い円盤を少し膨らませる（鏡のような平らな丸にしない）
    if (hi) {
      // 表は浅い球の面（中が 5mm 盛り上がる）、縁は厚み 5mm の帯、裏は平ら
      const R = (r * r + 0.005 * 0.005) / (2 * 0.005), th = Math.asin(r / R);
      const dome = new THREE.SphereGeometry(R, 28, 5, 0, Math.PI * 2, 0, th);
      dome.rotateX(Math.PI / 2); dome.translate(0, 0, -(R - 0.005));
      const rim = new THREE.CylinderGeometry(r, r, 0.005, 28, 1, true); rim.rotateX(Math.PI / 2); rim.translate(0, 0, -0.0025);
      const back = new THREE.CircleGeometry(r, 28); back.rotateY(Math.PI); back.translate(0, 0, -0.005);
      // 縁の覆輪（打ち出しの縁の玉）：横から見ても厚みが分かり、縁に照りの輪が立つ（平たい切り抜きに見せない。10/28）
      const bead = new THREE.TorusGeometry(r, 0.0042, 6, 40); bead.translate(0, 0, -0.0005);
      for (const g of [dome, rim, back, bead]) { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); n.translate(x, y, 0.155); parts.push(n); }
      return;
    }
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
  if (kind === 'kuwa' || kind === 'kuwa_wide' || kind === 'oda_kuwa') for (const sd of [-1, 1]) {
    const w = kind === 'kuwa_wide' ? 1.5 : 1;
    plate([[0, 0], [0.055, 0], [0.13 * w, 0.14], [0.17 * w, 0.32], [0.105 * w, 0.27], [0.07, 0.12]].map(([x, y]) => [sd * x, y]), sd * 0.02, 0.17, 0.15);
  }
  let backing = null;
  if (kind === 'oda_kuwa') {
    // 伝来具足の木瓜前立を基本形で復元。金の輪と唐花は鍬形へ結合し、黒漆の板だけ別材質。
    // 五つの窠の外周は、旗の木瓜と同じ半径の丸を寄せて求める。
    const outline = (scale) => {
      const pts = [];
      for (let i = 0; i < 80; i++) {
        const a = i * Math.PI / 40, x = Math.cos(a), y = Math.sin(a);
        let r = 0;
        for (let j = 0; j < 5; j++) {
          const b = Math.PI / 2 + j * Math.PI * 2 / 5, dot = 0.45 * Math.cos(a - b);
          r = Math.max(r, dot + Math.sqrt(0.55 ** 2 - 0.45 ** 2 + dot ** 2));
        }
        pts.push(new THREE.Vector2(x * r * scale, y * r * scale));
      }
      return pts;
    };
    const mount = new THREE.Shape(outline(0.128));
    backing = new THREE.ExtrudeGeometry(mount, { depth: 0.009, bevelEnabled: false });
    backing.translate(0, 0.335, 0.17);
    // 京都国立博物館の解説にある枝菊文の鍬形台。台の輪郭・彫りの配置は復元。
    // https://www.kyohaku.go.jp/jp/collection/meihin/kin/item07/
    // 木瓜の板と鍬形の根元をつなぎ、既存の金・黒の二つの形へまとめる。
    plate([[-0.105, 0], [0.105, 0], [0.105, 0.046], [0.075, 0.058],
      [-0.075, 0.058], [-0.105, 0.046]], 0, 0.17, 0.178);
    const engraving = [backing];
    const cut = (shape) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.001, bevelEnabled: false });
      g.translate(0, 0, 0.181); engraving.push(g);
    };
    if (hi) {
      // 同館が記す魚子地。小さな環を暗い縁として並べ、枝菊の周りの粒を補う。
      // 粒径と配置は復元。六角の環を生成時に複製・結合し、描画回数と毎コマの処理を増やさない。
      const grain = new THREE.RingGeometry(0.0008, 0.0013, 6).toNonIndexed();
      for (let row = 0; row < 9; row++) for (let col = 0; col < 34; col++) {
        const x = -0.099 + col * 0.006 + (row % 2) * 0.003, y = 0.175 + row * 0.005;
        if (Math.abs(x) > (y > 0.214 ? 0.075 : 0.099)) continue;
        // 菊と枝の線には重ねない。
        if (Math.abs(Math.abs(x) - 0.063) < 0.017 && Math.abs(y - 0.205) < 0.017) continue;
        if (Math.abs(x) < 0.063 && Math.abs(y - (0.173 + Math.abs(x) * 0.37)) < 0.004) continue;
        engraving.push(grain.clone().translate(x, y, 0.182));
      }
      grain.dispose();
    }
    for (const sd of [-1, 1]) {
      // 菊の花弁と枝を暗い細線で示す。
      const flower = new THREE.Shape();
      for (let i = 0; i < 32; i++) {
        const a = i * Math.PI / 16, r = i % 2 ? 0.009 : 0.014;
        const x = sd * 0.063 + Math.cos(a) * r, y = 0.205 + Math.sin(a) * r;
        if (i === 0) flower.moveTo(x, y); else flower.lineTo(x, y);
      }
      flower.closePath();
      const center = new THREE.Path();
      center.absarc(sd * 0.063, 0.205, 0.005, 0, Math.PI * 2, true);
      flower.holes.push(center); cut(flower);
      const branch = new THREE.Shape([
        new THREE.Vector2(sd * 0.018, 0.18), new THREE.Vector2(sd * 0.021, 0.18),
        new THREE.Vector2(sd * 0.061, 0.195), new THREE.Vector2(sd * 0.058, 0.196),
      ]);
      cut(branch);
    }
    backing = mergeGeometries(engraving);
    for (const g of engraving) g.dispose();
    for (const [outer, inner] of [[0.115, 0.102], [0.092, 0.081]]) {
      const ring = new THREE.Shape(outline(outer));
      ring.holes.push(new THREE.Path(outline(inner).reverse()));
      const g = new THREE.ExtrudeGeometry(ring, { depth: 0.003, bevelEnabled: false });
      g.translate(0, 0.335, 0.181); parts.push(g);
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / 5;
      const petal = new THREE.Shape();
      petal.moveTo(0.012, -0.009); petal.quadraticCurveTo(0.074, -0.028, 0.065, 0);
      petal.quadraticCurveTo(0.074, 0.028, 0.012, 0.009); petal.closePath();
      const g = new THREE.ExtrudeGeometry(petal, { depth: 0.003, bevelEnabled: false, curveSegments: 4 });
      g.rotateZ(a); g.translate(0, 0.335, 0.181); parts.push(g);
    }
    disc(0.006, 0, 0.335);
    // 中心も漆板の前へ出す。
    parts[parts.length - 1].translate(0, 0, 0.028);
  }
  if (kind === 'sun') disc(0.13, 0, 0.34);
  if (kind === 'sankoken') {
    // 伝光秀所用具足の三鈷剣を基本形で復元。中央の剣と内へ返る左右の鈷。
    // 近景・遠景とも、この一度だけ結合した形を使い回す。
    plate([[-0.012, 0], [0.012, 0], [0.018, 0.18], [0.035, 0.22],
      [0, 0.34], [-0.035, 0.22], [-0.018, 0.18]], 0, 0.18, 0.155);
    for (const sd of [-1, 1]) plate([[0, 0.055], [0.055, 0.085], [0.08, 0.14],
      [0.075, 0.205], [0.025, 0.255], [0.045, 0.18], [0.04, 0.135],
      [0.015, 0.105], [0, 0.095]].map(([x, y]) => [sd * x, y]), 0, 0.18, 0.155);
  }
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
  if (kind === 'takigawa_buffalo') {
    // 時代祭の銀水牛脇立を参考にした復元。前額でなく鉢の左右へ据え、幅広い角を外へ反らす。
    // 高画質では縁を丸め、根元に厚みを持たせて先へ薄くする。断面の厚さは復元上の補完。
    // 左右を一つの形へ結合し、近景・遠景とも保存した形を使う。毎コマ作らない。
    const outline = [[0, 0], [0.09, -0.015], [0.23, 0.035], [0.37, 0.14],
      [0.46, 0.29], [0.49, 0.47], [0.46, 0.62], [0.43, 0.44],
      [0.36, 0.31], [0.25, 0.24], [0.12, 0.2], [0, 0.12]];
    for (const sd of [-1, 1]) {
      const horn = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(sd * x, y))),
        { depth: 0.018, bevelEnabled: buffaloSolid, bevelThickness: 0.024, bevelSize: 0.008, bevelSegments: 2, steps: 1, curveSegments: 3 });
      if (buffaloSolid) {
        const pos = horn.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const taper = 1 - 0.85 * Math.min(1, Math.max(0, pos.getY(i) / 0.62));
          pos.setZ(i, 0.009 + (pos.getZ(i) - 0.009) * taper);
        }
        horn.computeVertexNormals();
      }
      horn.translate(sd * 0.13, 0.12, -0.035); parts.push(horn);
      if (buffaloSolid) {
        // 角の根元を鉢の側面へ留める受け金。取り付け方と寸法は復元上の補完。
        // 銀の角と同じ形へ結合し、材質・描画回数・毎コマの処理を増やさない。
        const socket = new THREE.BoxGeometry(.032, .13, .1).toNonIndexed();
        socket.translate(sd * .145, .155, -.026); parts.push(socket);
        for (const y of [.12, .19]) {
          const rivet = new THREE.SphereGeometry(.009, 6, 4).toNonIndexed();
          rivet.scale(1, 1, .5); rivet.translate(sd * .145, y, .026);
          parts.push(rivet);
        }
      }
    }
  }
  if (kind === 'manji') {
    disc(0.155, 0, 0.37);
    // 墨の卍は塗った形へ結合する。
  }
  for (const g of parts) for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
  // 近い形は、鉢の丸みに沿って左右の先を後ろへ少し反らす（本の鍬形・脇立は平らな板でなく反りがある）。面の向きが場所ごとに変わり、照りが帯になって流れる
  if (hi) for (let gi = 0; gi < parts.length; gi++) {
    let g = parts[gi]; const flat = g.type === 'ExtrudeGeometry';
    if (g.index) g = parts[gi] = g.toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) - 0.32 * x * x); }
    // 板は頂点をつないで滑らかな法線に（三角ごとの面の照りが出ない。縁の面取りは丸く光る）
    if (flat) { g.deleteAttribute('normal'); for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a); const m = mergeVertices(g, 1e-5); m.computeVertexNormals(); g = parts[gi] = m.toNonIndexed(); }
  }
  const g = mergeGeometries(parts); g.computeBoundingSphere();
  if (kind === 'kenshin_nichirin') g.userData.cloudStart = parts[0].attributes.position.count;
  const out = [g, kind === 'takigawa_buffalo' ? 'silver' : ['honda_shika', 'bull', 'feather'].includes(kind) ? 'black' : 'gold'];
  if (backing) out.push([[backing, 'black']]);
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
  if (part === 'haori' && st.haori && st.haoriMon === 'takigawa_haori' && S.quality === 'high') {
    // 大滝寺の一益：背だけの布を、前の開いた袖なしの陣羽織へ補う。
    // 前身頃・裏地・胸紐の細部は復元案。既存の背布と同じ骨・材質へ結合し、形は保存する。
    const lining = new THREE.Color(st.haori).multiplyScalar(.62).getHex();
    for (const sd of [-1, 1]) {
      const front = new THREE.CylinderGeometry(.262, .35, .64, 10, 4, true,
        sd > 0 ? .36 : -Math.PI * .6, Math.PI * .6 - .36);
      front.translate(0, 1.12, -.004);
      const pos = front.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i) + .004;
        // 背布と同じ体格・肩・ひだで脇をつなぐ。遠景への切り替えでも前後を揃える。
        pos.setXYZ(i, ...haoriPoint(Math.atan2(x, z), y, look.tier, hi));
      }
      front.computeVertexNormals();
      const inner = front.clone(), ip = inner.attributes.position, ix = inner.index.array;
      for (let i = 0; i < ip.count; i++) {
        const x = ip.getX(i), z = ip.getZ(i) + .004, r = Math.hypot(x, z);
        ip.setX(i, x * (1 - .012 / r)); ip.setZ(i, z * (1 - .012 / r) - .004);
      }
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
      inner.computeVertexNormals();
      parts.push(P(front, st.haori, { reg: 'cloth', dirt: .2 }), P(inner, lining, { reg: 'cloth', dirt: .2 }));
      // 前端・脇・襟元・裾で表地と裏地をつなぐ。断面が開いた二枚の板にしない。
      // 筒の格子の外周だけを拾い、既存の羽織へ結合して近景・遠景で使い回す。
      // 厚さと仕立ては復元上の補完で、所用品の実測ではない。
      const edgePositions = [];
      const edge = (a, b) => {
        for (const [p, i] of [[pos, a], [pos, b], [ip, a], [pos, b], [ip, b], [ip, a]]) {
          edgePositions.push(p.getX(i), p.getY(i), p.getZ(i));
        }
      };
      // 表地と同じ向きで外周をたどる。内側の面を裏返しても縁の向きは保つ。
      for (let i = 0; i < 10; i++) { edge(i, i + 1); edge(45 + i, 44 + i); }
      for (let i = 0; i < 4; i++) { edge((i + 1) * 11, i * 11); edge(i * 11 + 10, (i + 1) * 11 + 10); }
      const edging = new THREE.BufferGeometry();
      edging.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      edging.computeVertexNormals();
      parts.push(P(edging, st.haori, { reg: 'cloth', dirt: .2 }));
      // 胸紐は左右の前端へ届かせ、中央に小さな結び目を置く。
      const end = new THREE.Vector3(...haoriPoint(sd * .36, 1.28, look.tier, hi));
      const center = new THREE.Vector3(...haoriPoint(0, 1.28, look.tier, hi));
      center.x = 0;
      const direction = end.clone().sub(center);
      const tie = new THREE.CylinderGeometry(.006, .006, direction.length(), 5);
      tie.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      tie.translate((end.x + center.x) / 2, (end.y + center.y) / 2, (end.z + center.z) / 2);
      parts.push(P(tie, 0xd8d0bc, { mk: MK.cloth, reg: 'plain' }));
    }
    const knot = new THREE.SphereGeometry(.012, 6, 4);
    const knotAt = haoriPoint(0, 1.28, look.tier, hi);
    knot.scale(1, .7, .7); knot.translate(...knotAt);
    parts.push(P(knot, 0xd8d0bc, { mk: MK.cloth, reg: 'plain' }));
  }
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
      for (const [extra, ink] of crest[2] || []) {
        parts.push(P(extra.clone().scale(1.04, 1.04, 1.04).translate(0, 1.49, 0.012), ink === 'black' ? 0x14110f : ink === 'silver' ? 0xc7cbd0 : ink === 'white' ? 0xe8e4da : 0xc29a48,
          { mk: ink === 'black' ? MK.lac : ink === 'silver' ? MK.iron : ink === 'white' ? MK.cloth : MK.gold, reg: ink === 'white' ? 'fur' : 'lacq', dirt: 0.2 }));
      }
      const cg = P(g.clone().scale(1.04, 1.04, 1.04).translate(0, 1.49, 0.012), col === 'silver' ? 0xc7cbd0 : col === 'black' ? 0x14110f : 0xc29a48, { mk: col === 'silver' ? MK.iron : col === 'black' ? MK.lac : MK.gold, reg: 'lacq', dirt: 0.2 });
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
