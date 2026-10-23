// 御殿・屋敷の屋根と庭。設営時だけ作り、同じ寸法の形と材質を使い回す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTex } from './nature.js';

const roofs = new Map(), materials = new Map();
export function residenceRoofMat(kind = 'bark', vertexColors = false) {
  const key = `${kind}:${vertexColors}`;
  if (materials.has(key)) return materials.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = kind === 'bark' ? '#75634e' : '#998064'; c.fillRect(0, 0, 256, 256);
  let seed = 53; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // 重ねた檜皮の細かい葺き目、板葺きの継ぎ目と風雨の筋。
  const step = kind === 'bark' ? 8 : 32;
  for (let y = 0; y < 256; y += step) {
    c.fillStyle = 'rgba(24,18,13,.35)'; c.fillRect(0, y, 256, 2);
    for (let x = -32; x < 256; x += 32) {
      const px = x + (y / step % 2) * 16;
      c.fillStyle = `rgba(225,212,186,${.04 + rand() * .13})`; c.fillRect(px, y + 2, 30, step - 2);
      c.fillStyle = 'rgba(35,26,18,.25)'; c.fillRect(px, y + 2, 1, step - 2);
    }
  }
  for (let i = 0; i < 380; i++) { c.fillStyle = 'rgba(30,22,16,.13)'; c.fillRect(rand() * 256, rand() * 256, 1, 3 + rand() * 20); }
  const map = new THREE.CanvasTexture(cv); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide, vertexColors });
  materials.set(key, mat); return mat;
}

// 軒から棟へ三段の曲面。屋根一つは切妻48・寄棟98三角に抑える。
export function residenceRoofGeo(w, d, h, hip = false) {
  const key = `${w}:${d}:${h}:${hip}`;
  if (roofs.has(key)) return roofs.get(key);
  const p = [], uv = [], indices = [];
  const sides = hip ? 4 : 2;
  for (let k = 0; k < sides; k++) {
    const start = p.length / 3;
    const angle = hip ? k * Math.PI / 2 : k * Math.PI;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const al = (hip && k % 2 ? d : w) / 2, ou = (hip && k % 2 ? w : d) / 2;
    for (let j = 0; j <= 3; j++) for (let i = 0; i <= 4; i++) {
      const u = i / 4 * 2 - 1, v = j / 3;
      const lx = u * al * (hip ? 1 - .65 * v : 1), lz = ou * (hip ? 1 - .65 * v : 1 - v);
      const y = h * (.55 * v + .45 * v * v) + (hip ? .16 * u ** 4 * (1 - v) ** 2 : 0);
      p.push(lx * ca + lz * sa, y, -lx * sa + lz * ca);
      uv.push((u + 1) * al / 2, v * Math.hypot(ou, h) / 2);
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const a = start + j * 5 + i; indices.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
    }
  }
  // 寄棟の頂は上の切妻を載せる平面で閉じる。
  if (hip) {
    const a = p.length / 3;
    p.push(-w * .175, h, -d * .175, -w * .175, h, d * .175, w * .175, h, d * .175, w * .175, h, -d * .175);
    uv.push(0, 0, 0, d * .175, w * .175, d * .175, w * .175, 0); indices.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  if (roofs.size >= 64) { const oldest = roofs.keys().next().value; roofs.get(oldest).dispose(); roofs.delete(oldest); }
  roofs.set(key, geo); return geo;
}

let garden;
export function residenceGarden(W, x, z, rot = 0, timber = false) {
  if (!garden) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x786044, map: woodTex(), roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x394b32, roughness: 1 });
    const make = (timber) => {
      const parts = [], leaves = [];
      if (timber) {
        for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
          const g = new THREE.BoxGeometry(2.7 + i * .13, .16, .18); g.translate(i * .08, .12 + row * .17, (i - 1.5) * .21); parts.push(g);
        }
        for (const sx of [-.9, .9]) { const g = new THREE.BoxGeometry(.16, .12, 1.1); g.translate(sx, .04, 0); parts.push(g); }
      } else {
        const trunk = new THREE.CylinderGeometry(.1, .19, 2.4, 5); trunk.rotateZ(-.15); trunk.translate(.18, 1.2, 0); parts.push(trunk);
        for (let i = 0; i < 4; i++) {
          const xx = i % 2 ? -.6 : .75, yy = 1.45 + i * .42, zz = i % 3 * .3 - .3;
          const branch = new THREE.BoxGeometry(1.4, .09, .09); branch.translate(xx / 2, yy, zz); parts.push(branch);
          const crown = new THREE.SphereGeometry(1, 7, 4); crown.scale(.85, .28, .7); crown.translate(xx, yy + .15, zz); leaves.push(crown);
        }
      }
      const group = new THREE.Group();
      for (const [list, mat] of [[parts, wood], [leaves, leaf]]) if (list.length) {
        const mesh = new THREE.Mesh(mergeGeometries(list), mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        for (const g of list) g.dispose();
      }
      return group;
    };
    garden = [make(false), make(true)];
  }
  const group = garden[timber ? 1 : 0].clone(); group.position.set(x, W.heightAt(x, z), z); group.rotation.y = rot; return group;
}
