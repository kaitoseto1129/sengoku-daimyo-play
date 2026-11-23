// 武田の一般騎馬だけの揃い。武将の具足と共通の馬具の形には手を入れない。
import * as THREE from 'three';
import { P, MK, merge } from './units_model.js';
const RED = 0xb52c20;
export function takedaRider(u, g, o) {
  return !u.name && (u.type === 'cavalry' || o.horse === true && u.type === 'samurai')
    && ['takeda', 'akazonae', 'furin'].includes(g.faction);
}
export function takedaRiderLook(look, fac) {
  Object.assign(look, { armor: RED, helm: RED, hat: 'kabuto', vi: 1,
    lace: 0x7b2018, cloth: 0xc47732, menpo: RED, sode: true,
    takedaRed: true, flag: fac === 'sanada' ? 'sanada' : fac === 'furin' ? 'furin_kiba' : 'takeda_kiba', flagScale: 1.15, flagShape: 0 });
}
export function takedaHorseStyle(style) {
  return { ...style, tack: RED, tassels: 0xc93927, cushion: 0x95271c, reins: 0xf3e7d4 };
}
const heads = new WeakMap();
const shins = new WeakMap();
export function takedaShin(g, look) {
  if (!g || !look.takedaRed) return g;
  if (shins.has(g)) return shins.get(g);
  const result = g.clone(), a = result.attributes, red = new THREE.Color(RED);
  // 臑当の篠だけ朱漆にし、鎧下・足袋・草鞋を保つ。
  for (let i = 0; i < a.position.count; i++) {
    if (Math.floor(a.mtl.getX(i)) % 8 !== MK.cloth || Math.abs(a.color.getX(i) - a.color.getY(i)) > 0.018) continue;
    if (a.position.getY(i) < -0.29) continue;
    a.color.setXYZ(i, red.r, red.g, red.b); a.col2.setXYZ(i, red.r, red.g, red.b);
  }
  shins.set(g, result); return result;
}
export function takedaHead(g, look) {
  if (!g || !look.takedaRed) return g;
  if (heads.has(g)) return heads.get(g);
  const plate = new THREE.BoxGeometry(0.085, 0.085, 0.009);
  plate.rotateZ(Math.PI / 4); plate.scale(1.25, 0.7, 1); plate.translate(0, 1.77, 0.182);
  const result = merge([g.clone(), P(plate, 0xd9b34f, { mk: MK.gold })]);
  heads.set(g, result); return result;
}
// 軽い馬の手綱は既存の線を紅白にする。材質は一隊で共有する。
export function takedaRiderFinish(u) {
  const reins = u.riderModel?.reins;
  if (reins) {
    const colors = new Float32Array(reins.geometry.attributes.position.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < colors.length / 3; i++) col.setHex(Math.floor(i / 2) % 2 ? 0xf3e7d4 : RED).toArray(colors, i * 3);
    reins.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    reins.material = redWhiteReins;
  }
}
const redWhiteReins = new THREE.LineBasicMaterial({ vertexColors: true });
