// 名のある武将の胴丸の形の作り分け（K618 ③・K624・kaito 11/21「甲冑が全部の武将で似ている。使い回しと思われたら良くない」）。
//   名のある武将の骨入りの体は、胴丸の手足の上に当世具足のスキャン（gusoku_scan.js の GS：胴・袖・草摺。全員で一つ）を重ねる。
//   名のある武将の時だけ、そのスキャンの頂点を一度だけ動かした「形の写し」を作って着せる（胴・袖・草摺の形）。
//   並の兵（武者・足軽の当世具足と胴丸）は今のスキャンのまま＝筋書きの兵の重さは変えない。
//   写しは形の種類ごとに一つ（同じ形の武将は共有）。位置と法線だけを持ち、骨・面の並び・UV は元の形と共有する。
//   形は具足の表（kacchu_data.js の KACCHU：plateDo・doStyle・sodeStyle）から読む：
//     胴：南蛮胴（plateDo nanban）＝胸の中に鎬が立つ鳩胸／仙台胴（sendai）＝縦の板で角張る／仏胴（hotoke）＝平らに張った一枚／
//         桶側（okegawa）＝横板で筒に張る／胴丸・毛引（kebiki）＝スキャンのまま／素懸（sugake）＝スキャンのまま
//     袖：大袖（sodeStyle osode・胴丸の毛引）＝大きく外へ張って長い／当世袖（当世具足）＝小さく体に沿う
//     草摺：胴丸・毛引＝長く裾が開く／当世具足＝並／南蛮胴＝短い
//   出所：胴の種類は各武将の docs/generals_look_1108/<名>.md（現存の具足の調べ）。袖・草摺の大きさは胴の種類の時代の型から推した復元案。
import * as THREE from 'three';

// 体の目安（当世具足のスキャンの縛りの姿勢・m・前が +z）：胴の裾（草摺の付け根）・肩（袖の吊り元）
const WAIST = 1.03, SHOULDER_Y = 1.47, SHOULDER_X = 0.155;

const DO = { nanban: 'nanban', sendai: 'sendai', hotoke: 'hotoke' };
// 表の行から形の種類を決める（変える所が無ければ null）
export function shapeOf(nk) {
  if (!nk || globalThis.__noArmorShape) return null;   // __noArmorShape：前後の写真を撮る時だけ（作り分けを止める）
  const doK = DO[nk.plateDo] || (nk.doStyle === 'hotoke' ? 'hotoke' : nk.doStyle === 'okegawa' ? 'oke' : 'base');
  const early = nk.doStyle === 'kebiki' && !nk.plateDo;
  const sode = nk.sodeStyle === 'osode' ? 1.42 : early ? 1.3 : nk.sodeStyle === 'sugake' || nk.doStyle === 'sugake' ? 1.0 : doK === 'base' ? 1.0 : 0.8;
  const kusa = early ? 1.22 : doK === 'nanban' ? 0.86 : doK === 'hotoke' ? 1.06 : 1.0;
  if (doK === 'base' && sode === 1 && kusa === 1) return null;
  return { doK, sode, kusa, key: `${doK}|${sode}|${kusa}` };
}

const CACHE = new Map();
// 元の形（GS の hi・lo）から形の写しを作る（同じ形は覚えて使い回す）。bones は骨の名の並び（胴丸と同じ骨）
export function shapeGeo(src, level, sh, bones) {
  const g = src[level]; if (!g || !sh) return g;
  const ck = level + '|' + sh.key;
  if (CACHE.has(ck)) return CACHE.get(ck);
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const pos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; bi = SI.getComponent(i, c); } }
    const b = bones[bi] || '';
    const ax = Math.abs(x), sx = x < 0 ? -1 : 1;
    if (b === 'Spine2' && ax > SHOULDER_X && sh.sode !== 1) {
      // 袖：肩の外の板（胸の骨に付いて肩から垂れる）を、肩を支点に外と下へ大きく（小さく）
      const s = sh.sode;
      x = sx * (SHOULDER_X + (ax - SHOULDER_X) * (1 + (s - 1) * 1.1));
      y = SHOULDER_Y - (SHOULDER_Y - y) * (1 + (s - 1) * 0.9);
      z *= 1 + (s - 1) * 0.5;
    } else if (b === 'Spine' || b === 'Spine1' || b === 'Spine2' || b === 'Neck' || (b === 'Hips' && y >= WAIST)) {
      const t = Math.max(0, Math.min(1, (y - WAIST) / 0.45));   // 胴の裾 0 → 胸 1
      if (sh.doK === 'nanban') {
        // 鳩胸：胸の真ん中に縦の鎬が立ち、前へ張り出す（横から見ると胸が尖る）
        if (z > -0.02) { const ridge = Math.exp(-((x / 0.08) ** 2)), bell = Math.exp(-(((y - 1.25) / 0.15) ** 2)); z += 0.075 * ridge * bell + 0.018 * bell; }
        x *= 1 + 0.03 * t;
      } else if (sh.doK === 'sendai') {
        // 縦の板の胴：横に張って角張る
        x *= 1.08; if (z > 0) z += 0.012 * t;
      } else if (sh.doK === 'hotoke') {
        // 仏胴：平らに張った一枚の板（前が丸く膨らむ）
        x *= 1.05; if (z > 0) z = z * 1.12 + 0.008;
      } else if (sh.doK === 'oke') {
        // 桶側：横板で筒に張る
        x *= 1.04; z *= 1.04;
      }
    } else if (b === 'Hips' && y < WAIST) {
      // 草摺：裾を下へ伸ばし（縮め）、裾ほど外へ開く
      const d = WAIST - y, k = sh.kusa;
      y = WAIST - d * k;
      const fl = 1 + (k - 1) * 1.1 * (d / 0.25);
      x *= fl; z *= fl;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  const out = new THREE.BufferGeometry();
  for (const k in g.attributes) if (k !== 'position') out.setAttribute(k, g.attributes[k]);
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(g.index);
  for (const gr of g.groups || []) out.addGroup(gr.start, gr.count, gr.materialIndex);
  out.computeBoundingBox(); out.computeBoundingSphere();
  CACHE.set(ck, out);
  return out;
}
