import * as THREE from 'three';
import { S } from './settings.js';

// 戦の傷は一人三枚まで。絵・形・材質は全員で共有し、当たる時だけ部品を足す。
let shared = null;
function resources() {
  if (shared) return shared;
  const shape = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 8; i++) {
    const y = 1.04 + j * 0.045, a = (i / 8 - 0.5) * 1.0;
    const r = 0.218 + (y - 1.04) * 0.15;
    pos.push(Math.sin(a) * r, y, Math.cos(a) * r * 0.8 + 0.007);
    uv.push(i / 8, j / 4);
    if (j < 4 && i < 8) { const n = j * 9 + i; idx.push(n, n + 1, n + 9, n + 1, n + 10, n + 9); }
  }
  shape.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shape.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  shape.setIndex(idx); shape.computeVertexNormals();
  const materials = {};
  for (const kind of ['scar', 'mud', 'blood']) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (kind === 'scar') {
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = 28 + i * 22, y = 98 - i * 23;
        ctx.strokeStyle = '#241b15'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 19, y - 20); ctx.stroke();
        ctx.strokeStyle = '#998776'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 1, y - 1); ctx.lineTo(x + 18, y - 19); ctx.stroke();
      }
    } else {
      ctx.fillStyle = kind === 'blood' ? '#49201b' : '#51432e';
      const n = kind === 'blood' ? 9 : 26;
      for (let i = 0; i < n; i++) {
        const x = 20 + (i * 37 % 87), y = 20 + (i * 53 % 87), r = kind === 'blood' ? 2 + i % 4 : 4 + i % 8;
        ctx.globalAlpha = kind === 'blood' ? 0.65 : 0.5;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, i, 0, Math.PI * 2); ctx.fill();
      }
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    materials[kind] = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.08, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
  }
  shared = { shape, materials };
  return shared;
}

// 矢もこの入れ物へ。軽い体と骨のある体を替えても、甲冑と一緒に動く。
export function armorFrame(u) {
  if (!u.armorWear) {
    const root = new THREE.Group(); root.matrixAutoUpdate = false;
    u.armorWear = { root, scar: null, mud: null, blood: null };
  }
  syncArmorWear(u);
  return u.armorWear.root;
}

export function syncArmorWear(u, hideBlood = false) {
  const w = u.armorWear;
  if (!w) return;
  const h = u.human, human = h?.root.visible && h.wearFit && h.bones.Spine1;
  const parent = human || u.body;
  if (!parent) return;
  if (w.root.parent !== parent) {
    parent.add(w.root);
    if (human) w.root.matrix.copy(h.wearFit); else w.root.matrix.identity();
    w.root.matrixWorldNeedsUpdate = true;
  }
  w.root.visible = u.isPlayer || u.camD == null || u.camD < 26;
  if (w.blood) { w.blood.visible = !hideBlood && S.blood !== 'off'; w.blood.scale.x = S.blood === 'low' ? 0.65 : 1; }
}

export function markArmor(u, kind, src, hideBlood = false) {
  if (!u?.body || u.isStruct || u.type === 'dummy' || u.type === 'porter' || (kind === 'blood' && (hideBlood || S.blood === 'off'))) return;
  const root = armorFrame(u), w = u.armorWear;
  if (w[kind]) return;
  const r = resources(), m = new THREE.Mesh(r.shape, r.materials[kind]);
  const a = src?.pos ? Math.atan2(src.pos.x - u.pos.x, src.pos.z - u.pos.z) - u.heading : (u.id % 3 - 1) * 0.3;
  m.rotation.y = a;
  if (kind === 'mud') m.position.y = -0.12;
  else if (kind === 'blood') m.position.y = 0.06;
  root.add(m); w[kind] = m;
  syncArmorWear(u, hideBlood);
}
