import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { ishigaki, dorui, dobei, palisade, hut, nobori, kabukimon, stoneStepGeo, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { monomi } from './castle_parts.js';
import { HON, OOHIROMA, SAKURABABA, BANSHO, ONMAYA, NAKAMARU, KYOGOKU, KOMARU, SANNO2, AKAO } from './castles/odani.js';

// 映像に合わせた景観の推定復元。主尾根の順序・大堀切・赤尾屋敷の居所は動かさない。
// 土の外庭を先に、御局屋敷の高台を後に重ねる。主尾根の攻め道から離した平場。
// 外庭は南へ逃がし、清水谷から西木戸へ登る道と重ねない。
const OKU_OUT = { x: -36, z: NAKAMARU.cz + 25, hw: 8, hd: 8, h: NAKAMARU.level - 12 };
const OKU = { x: -36, z: NAKAMARU.cz, hw: 5, hd: 17.5, h: NAKAMARU.level - 7 };
const BELOW_HORI = { x: 38, z: -48, hw: 12, hd: 12, h: Math.min(NAKAMARU.level - 13, HON.level - 4) };
const KOSHI = [
  { x: 54, z: 24, hw: 6, hd: 7, h: HON.level - 22 },
  { x: 56, z: 3, hw: 5, hd: 6, h: HON.level - 18 },
  { x: 56, z: -17, hw: 5, hd: 6, h: HON.level - 14 },
];
// 表7：清水谷側の帯曲輪（幅3〜5m）。大広間の脇は約5mの石垣の下。高さの差は表7の石垣の値。
// 御馬屋から中丸までの全長は高さの差が不明のため、数の分かる大広間の脇だけ置く。
const OBI = { x: -OOHIROMA.hw - 5.5, z: OOHIROMA.cz, hw: 2, hd: (OOHIROMA.z1 - OOHIROMA.z0) / 2 - 6, h: OOHIROMA.level - 5 };
const PLATS = [OKU_OUT, OKU, BELOW_HORI, OBI, ...KOSHI];
// 台の南の口から外庭へ、腰曲輪の南北の口から次の段へつなぐ。
const LINKS = [
  { ax: OKU.x, az: OKU.z + OKU.hd, ay: OKU.h, bx: OKU.x, bz: OKU_OUT.z + OKU_OUT.hd, by: OKU_OUT.h, w: 2.6 },
  ...KOSHI.slice(1).map((p, i) => ({ ax: KOSHI[i].x, az: KOSHI[i].z - KOSHI[i].hd, ay: KOSHI[i].h, bx: p.x, bz: p.z + p.hd, by: p.h, w: 1.3 })),
  { ax: KOSHI[2].x, az: KOSHI[2].z - KOSHI[2].hd, ay: KOSHI[2].h, bx: BELOW_HORI.x + BELOW_HORI.hw, bz: BELOW_HORI.z + 5, by: BELOW_HORI.h, w: 1.3 },
];
for (const p of LINKS) { p.dx = p.bx - p.ax; p.dz = p.bz - p.az; p.len = Math.hypot(p.dx, p.dz); }

export function odaniExtraClear(x, z) {
  for (const p of PLATS) if (Math.abs(x - p.x) < p.hw + 3 && Math.abs(z - p.z) < p.hd + 3) return true;
  for (const p of LINKS) {
    const t = Math.max(0, Math.min(1, ((x - p.ax) * p.dx + (z - p.az) * p.dz) / (p.len * p.len)));
    if (Math.hypot(x - p.ax - p.dx * t, z - p.az - p.dz * t) < p.w + 2) return true;
  }
  return false;
}

export function odaniExtraHeight(x, z, h) {
  // 長浜市保存管理計画表7・30頁：桜馬場は東西二段の曲輪。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 西側を六十センチ下げる推定復元。高低の向き・高さ・境は実測値ではない。
  // 中央の尾根道と門・外周の柵の足もとは保ち、二メートルの坂でつなぐ。
  // 既存の地面だけを使い、形・材質や毎コマの入れ物は増やさない。
  if (SETTINGS.quality === 'high' && z > SAKURABABA.z0 && z < SAKURABABA.z1
    && x > SAKURABABA.x - SAKURABABA.hw + 1 && x < SAKURABABA.x - 3) {
    const lower = Math.max(0, Math.min(1, (SAKURABABA.x - 3 - x) / 2));
    const edge = Math.max(0, Math.min(1,
      (x - SAKURABABA.x + SAKURABABA.hw - 1) / 2,
      (z - SAKURABABA.z0) / 3, (SAKURABABA.z1 - z) / 3));
    h -= .6 * lower * edge;
  }
  // 長浜市保存管理計画表7・31頁：本丸は上下二段の曲輪。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 南側を六十センチ下げる推定復元。御殿・庭石・中央の旗本の集合点は上段に残す。
  // 境は二メートルの坂でつなぎ、外周と南門への既存の坂の接続高は保つ。
  // 描画と歩行が同じ地面を使い、新しい形・材質や毎コマの入れ物は増やさない。
  if (SETTINGS.quality === 'high' && z > HON.cz + 8 && z < HON.z1
    && Math.abs(x - HON.x) < HON.hw - 1) {
    const lower = Math.max(0, Math.min(1, (z - HON.cz - 8) / 2));
    const edge = Math.max(0, Math.min(1,
      (HON.hw - 1 - Math.abs(x - HON.x)) / 2, (HON.z1 - z) / 3));
    h -= .6 * lower * edge;
  }
  // 長浜市保存管理計画表7・31頁：中丸は三段の平場からなる。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 段の高さ・境は縮めた縄張りでの推定。中央の集合点と外周の石垣の高さは保つ。
  // 二つの段差は二メートルの坂でつなぎ、南北の反撃と土橋の通行を妨げない。
  if (SETTINGS.quality === 'high' && z > NAKAMARU.z0 && z < NAKAMARU.z1
    && Math.abs(x - NAKAMARU.x) < NAKAMARU.hw - 1) {
    const south = NAKAMARU.cz + 3, north = NAKAMARU.cz - 3;
    const riseSouth = Math.max(0, Math.min(1, (south + 1 - z) / 2));
    const riseNorth = Math.max(0, Math.min(1, (north + 1 - z) / 2));
    const edge = Math.max(0, Math.min(1,
      (NAKAMARU.hw - 1 - Math.abs(x - NAKAMARU.x)) / 2,
      (z - NAKAMARU.z0) / 2, (NAKAMARU.z1 - z) / 2));
    h += (-0.5 + 0.5 * riseSouth + 0.5 * riseNorth) * edge;
  }
  // 小丸は三段。兵の集合点を変えず、段の境は歩ける勾配でつなぐ。
  if (z > KOMARU.z0 && z < KOMARU.z1 && Math.abs(x) < KOMARU.hw - 2) {
    const tier = Math.max(0, Math.min(1, (KOMARU.z1 - 9 - z))) * 0.6
      + Math.max(0, Math.min(1, (KOMARU.z1 - 17 - z))) * 0.6;
    const edge = Math.min(1, (KOMARU.hw - 2 - Math.abs(x)) / 2, (z - KOMARU.z0) / 3);
    h += tier * Math.max(0, edge);
  }
  // 高画質の本丸は上の南側の削平だけで上下二段を表す（保存管理計画表7）。
  // 北側も盛り上げると三段になるため、高画質には旧来の盛土を重ねない。
  if (SETTINGS.quality !== 'high' && z > HON.z0 && z < HON.z0 + 12 && Math.abs(x) < HON.hw - 2) {
    const t = Math.min(1, (z - HON.z0) / 3, (HON.z0 + 12 - z) / 3, (HON.hw - 2 - Math.abs(x)) / 3);
    if (t > 0) h += 1.2 * t * t * (3 - 2 * t);
  }
  // 御馬屋は北の面を開ける。三方の土手と角の虎口は縄張りで作る。
  if (z >= ONMAYA.z0 && z < ONMAYA.z0 + 3 && Math.abs(x) > 4.1 && Math.abs(x) < ONMAYA.hw - 3)
    h = Math.min(h, ONMAYA.level);
  // 京極丸の東だけ約3mの土塁。南北の口の近くでは低くして道を避ける。
  if (z > KYOGOKU.z0 + 5 && z < KYOGOKU.z1 - 5 && Math.abs(x - KYOGOKU.hw) < 3) {
    const end = Math.min(1, (z - KYOGOKU.z0 - 5) / 3, (KYOGOKU.z1 - 5 - z) / 3);
    h = Math.max(h, KYOGOKU.level + 3 * (1 - Math.abs(x - KYOGOKU.hw) / 3) * end);
  }
  for (const p of PLATS) {
    const d = Math.max(Math.abs(x - p.x) - p.hw, Math.abs(z - p.z) - p.hd);
    if (d >= 3) continue;
    const t = d <= 0 ? 1 : 1 - d / 3;
    h += (p.h - h) * t * t * (3 - 2 * t);
  }
  for (const p of LINKS) {
    const t = ((x - p.ax) * p.dx + (z - p.az) * p.dz) / (p.len * p.len);
    if (t < 0 || t > 1) continue;
    const d = Math.abs((x - p.ax) * p.dz - (z - p.az) * p.dx) / p.len;
    if (d >= p.w + 1) continue;
    const k = d <= p.w ? 1 : p.w + 1 - d;
    h += (p.ay + (p.by - p.ay) * t - h) * k;
  }
  return h;
}

export function buildOdaniFukugen(rt, ramps, stoneKuruwa = []) {
  const W = rt.world, batch = makeSimpleBatch();
  const add = (m) => { if (m && !m.isBatchedPart) rt.scene.add(m); };
  const stone = (pts, y, h = 4, out = 1) => add(ishigaki(W, pts, { batch, topY: y, minH: h, maxH: h, lean: 0.18, big: 1.7, noKit: true, out }));
  const earth = (seg, y) => add(dobei(W, seg, { batch, baseY: y, h: 2.2, ita: true, tsuchi: 0xb09c78 }));
  const fence = (seg) => add(palisade(W, seg, { batch, h: 1.9, solid: true, mound: false }));
  // 既存の土塀の足もとを積み、南北の門の幅を残す。御馬屋の土塁には石垣を重ねない。
  for (const k of [HON, OOHIROMA, SAKURABABA, NAKAMARU]) {
    // 保存管理計画表7・30頁：桜馬場の周囲は切岸による防御。
    // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
    // 高画質では一律四メートルの石垣を重ねず、既存の地面の切岸を見せる。
    // 礎石・木柵・門と床はそのまま使い、兵の持ち場や通路は動かさない。
    if (k === SAKURABABA && SETTINGS.quality === 'high') continue;
    // 主郭は縄張りの壁の区間から描く。ここでは残りの低い段だけを補う。
    if (stoneKuruwa.includes(k)) continue;
    const x0 = k.x - k.hw, x1 = k.x + k.hw, y = k.level + 0.65;
    for (const z of [k.z0, k.z1]) {
      stone([[x0 + 3, z], [-3.8, z]], y, 4, z === k.z0 ? -1 : 1);
      stone([[3.8, z], [x1 - 3, z]], y, 4, z === k.z0 ? -1 : 1);
    }
    stone([[x0, k.z0 + 3], [x0, k.z1 - 3]], y);
    stone([[x1, k.z1 - 3], [x1, k.z0 + 3]], y);
    stone([[x1 - 3, k.z1], [x1, k.z1 - 3]], y);
    stone([[x1, k.z0 + 3], [x1 - 3, k.z0]], y);
    stone([[x0 + 3, k.z0], [x0, k.z0 + 3]], y);
    stone([[x0, k.z1 - 3], [x0 + 3, k.z1]], y);
  }
  // 表7・30頁：番所は西側の弓状土塁と登城道側の礫を盛った土塁で守る。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 番所北辺の高さ3mの石垣という根拠はない。高画質では低い土の堤に改める。
  // 位置・幅1.4m・高さ90cmは推定。中央の道・木戸・兵の持ち場は空ける。
  // 大広間の桜馬場側の約4mの石垣は記録どおり残す。同じ初期化時の束にまとめる。
  for (const [k, z, h, out] of [[BANSHO, BANSHO.z0, 3, -1], [OOHIROMA, OOHIROMA.z1, 4, 1]]) {
    if (k === BANSHO && SETTINGS.quality === 'high') {
      for (const seg of [[k.x - k.hw + 3, z, -4.2, z], [4.2, z, k.x + k.hw - 3, z]])
        add(dorui(W, seg, 0, -1, { batch, w: 1.4, h: .9, bareSoil: true, capEnds: true, closeBack: true }));
      continue;
    }
    stone([[k.x - k.hw + 3, z], [-4.2, z]], k.level, h, out);
    stone([[4.2, z], [k.x + k.hw - 3, z]], k.level, h, out);
  }
  // 黒金門の両脇は約3.5m。門の開口と既存の坂へは張り出さない。
  for (const x of [-4.2, 4.2])
    stone([[x, SAKURABABA.z0], [x, OOHIROMA.z1 - 3]], OOHIROMA.level, 3.5, x < 0 ? 1 : -1);
  // 本丸の幅広の直線階段。石垣の天端の土塀を、門の両脇まで続ける。
  for (const x of [-4.4, 4.4]) {
    stone([[x, OOHIROMA.z0], [x, HON.z1]], HON.level + 0.65, 5, x < 0 ? -1 : 1);
    earth([x, OOHIROMA.z0, x, HON.z1], HON.level + 0.65);
  }
  // 御局屋敷：五メートルの石の台、土塀、主屋と二棟。外庭は土と木柵。
  const enclose = (p, kind, gap = 2.8) => {
    const x0 = p.x - p.hw, x1 = p.x + p.hw, z0 = p.z - p.hd, z1 = p.z + p.hd;
    const north = KOSHI.includes(p) ? [[x0, z0, p.x - gap, z0], [p.x + gap, z0, x1, z0]] : [[x0, z0, x1, z0]];
    const east = p === BELOW_HORI ? [[x1, z0, x1, p.z + 3.3], [x1, p.z + 6.7, x1, z1]] : [[x1, z0, x1, z1]];
    const segs = [...north, ...east, [x1, z1, p.x + gap, z1], [p.x - gap, z1, x0, z1], [x0, z1, x0, z0]];
    for (const s of segs) {
      if (kind === 'stone') { stone([[s[0], s[1]], [s[2], s[3]]], p.h, 5, -1); earth(s, p.h); }
      else fence(s);
    }
  };
  enclose(OKU_OUT, 'wood'); enclose(OKU, 'stone');
  rt.scene.add(kabukimon(W, OKU.x, OKU.z + OKU.hd, 5.4));
  if (true) {
    // 外庭の門を挟んで浅井の三つ盛り亀甲。台の狭い屋根際へ重ねず、土の庭に立てる。
    for (const side of [-1, 1]) rt.scene.add(nobori(W, OKU_OUT.x + side * 5,
      OKU_OUT.z + OKU_OUT.hd - 2, 'azai', side < 0 ? 5 : 4.6));
  }
  for (const [x, z, w, d] of [[OKU.x, OKU.z - 7, 6, 9], [OKU.x, OKU.z + 4, 4, 4], [OKU.x, OKU.z + 11, 5, 3]]) add(hut(W, x, z, w, d, 0, { ita: true, boardRoof: true, weatheredBoards: true, batch }));
  // 赤尾屋敷は居所と入口を保ったまま、西の木戸を避けて台の石を見せる。
  const ax0 = AKAO.x - AKAO.hw, ax1 = AKAO.x + AKAO.hw, az0 = AKAO.z - AKAO.hd, az1 = AKAO.z + AKAO.hd;
  stone([[ax0, az1], [ax1, az1], [ax1, az0], [ax0, az0]], W.heightAt(AKAO.x, AKAO.z), 3);
  // 腰曲輪・帯曲輪の細い道は、南北の柵を開けて階段へ出られるようにする。
  for (const p of KOSHI) enclose(p, 'wood', 1.7);
  enclose(BELOW_HORI, 'wood');
  // 帯曲輪は外（谷側）の縁だけ柵。内は大広間の石垣の切岸。
  fence([OBI.x - OBI.hw, OBI.z - OBI.hd, OBI.x - OBI.hw, OBI.z + OBI.hd]);
  if (true) {
    // 写真の斜面の屋敷群に倣い、一段に一棟と幟。中央の南北の道と階段口を空ける。
    // 曲輪の既存の床だけを使い、斜面へ新しい台や石垣を増やさない。配置は推定。
    for (let i = 0; i < KOSHI.length; i++) {
      const p = KOSHI[i];
      add(hut(W, p.x + 3, p.z - 1, 3.2, i === 0 ? 6 : 4.6, 0,
        { ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch, wall: i % 2 ? 0x75634d : 0x685742 }));
      rt.scene.add(nobori(W, p.x - p.hw + 1.4, p.z + 2, 'azai', 5));
    }
    add(hut(W, BELOW_HORI.x + 5, BELOW_HORI.z + 1, 6, 5, 0,
      { ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch, wall: 0x75634d }));
    rt.scene.add(nobori(W, BELOW_HORI.x + 8, BELOW_HORI.z - 7, 'azai', 5));
  }
  // 高画質の井楼は下を開けた丸太組みで統一。旗は守り手の浅井家を明示する。
  const lookout = { team: 1, mon: 'azai', boarded: false, logFrame: true };
  // 11/6 fixc1844（critic60「京極丸の周りに井楼が四つ五つ・尾根に天守のような塔」）：堀切の下と奥の最高段の物見は確かな証が無いので立てない。
  //   京極丸・小丸・本丸の物見櫓（castles/odani.js）だけを残す。
  void lookout; void SANNO2;
  for (const k of [HON, SAKURABABA]) add(hut(W, k.x + k.hw - 4, k.cz + 7, 4, 3.4, 0, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall: 0x6e6250 }));
  finalizeSimpleBatch(rt, batch);

  // 全て組み立て時だけ作る。踏石の形と材質を使い回し、一度の描画にまとめる。
  const steps = [];
  const stair = (ax, az, bx, bz, w, count) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = count ?? Math.ceil(len / 0.4);
    const rise = Math.abs(W.heightAt(bx, bz) - W.heightAt(ax, az)) / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t;
      const cols = Math.max(1, Math.ceil(w / 1.2));
      for (let col = 0; col < cols; col++) {
        const off = -w / 2 + (col + 0.5) * w / cols;
        steps.push({ x: x + dz / len * off, z: z - dx / len * off, y: W.heightAt(x, z) + 0.04 - rise / 2,
          w: w / cols - 0.035, h: Math.max(0.12, rise + 0.12), d: len / n - 0.015, rot: Math.atan2(dx, dz) });
      }
    }
  };
  for (const r of ramps) if (r.a[0] === 0 && r.b[0] === 0) stair(r.a[0], r.a[1], r.b[0], r.b[1], r.b[1] === HON.z1 - 3 ? 6.4 : r.w * 2 - 0.3, r.b[1] === OOHIROMA.z1 - 3 ? 7 : undefined);
  for (const p of LINKS) stair(p.ax, p.az, p.bx, p.bz, p.w * 2 - 0.2);
  const mesh = new THREE.InstancedMesh(stoneStepGeo(1, 1, 1), new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xa49882 }), steps.length);
  const dummy = new THREE.Object3D(), shade = new THREE.Color();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i], high = true;
    // 白い規格石の列を避け、踏まれた灰茶の自然石と土の目地にする。
    // 高さと歩行の床はそのまま。既存の形を縮めて幅と奥行きだけに小さな差を付ける。
    dummy.position.set(s.x, s.y, s.z); dummy.rotation.y = s.rot;
    dummy.scale.set(s.w * (high ? .94 + (i % 3) * .02 : 1), s.h, s.d * (high ? .95 + (i % 2) * .03 : 1));
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, shade.setHex((high ? [0x998c76, 0x827b69, 0xa09680, 0x8b826e] : [0xddd6c7, 0xc4bca9, 0xe1d9c8])[i % (high ? 4 : 3)]));
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.receiveShadow = true; rt.scene.add(mesh);
}
