// 櫓の共通の室内。戦と城下で同じ寸法・入口・狭間を使う。
import { addInterior } from './naka.js';
import { addLadder, FL } from './floors.js';

// 小谷の斜面では中心の高さだけで建てると、端の地面が板床を突き抜ける。
// 組み立て時だけ床の範囲を測り、外の形と室内で同じ基準を使う。
export function interiorBase(world, x, z, w, d, rot = 0) {
  let y = world.heightAt(x, z);
  if (!world.def.interiorFit) return y;
  const c = Math.cos(rot), s = Math.sin(rot);
  const nx = Math.ceil((w + .8) / .5), nz = Math.ceil((d + .8) / .5);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -(w + .8) / 2 + (w + .8) * i / nx, lz = -(d + .8) / 2 + (d + .8) * j / nz;
    y = Math.max(y, world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
  }
  return y;
}

export function sumiInside(world, x, z, { w = 6, d = 5, base = 2.2, rot = 0, team } = {}) {
  const y = world.heightAt(x, z) - .3 + base + .02;
  const I = addInterior(world, {
    name: '隅櫓', kind: 'yagura', x, z, rot, team, profile: 'yagura',
    levels: [{ y, w: w * .96, d: d * .96, h: 2.95 }, { y: y + 3.35, w: w * .7, d: d * .7, h: 2.1 }],
    door: { side: 1, lx: -w * .18, w: 1.1 }, approach: { pad: 1.35 + .02 * d, len: Math.max(2.4, base * 1.15) },
    wins: (lv, k) => k === 0 ? [-1, 1].flatMap(q => [-1, 1].map(s => ({ face: 'z', s, t: q * w * .25, w: .9, y0: 2.18, y1: 2.68 })))
      : [-1, 1].map(s => ({ face: 'z', s, t: 0, w: 1.1, y0: 1.06, y1: 1.6 })),
  });
  return I;
}

export function gateInside(world, x, z, w = 5, rot = 0, o = {}) {
  const Lw = w + 5.6;
  return addInterior(world, {
    name: o.name || '櫓門', kind: 'gate', x, z, rot, team: o.team, profile: 'yagura',
    levels: [{ y: interiorBase(world, x, z, Lw, 4.2, rot) + 3.95, w: Lw - .4, d: 3.6, h: 2 }],
    // 徒歩の体高1.7mと横木が同じ高さになるのを避ける。外の戸口も床から1.9mにそろえる。
    door: { side: 1, lx: Lw / 2 - 1.2, w: 1.1, h: 1.9 }, approach: { pad: .5, len: 4.2 },
    wins: () => [-1, 0, 1].flatMap(q => [-1, 1].map(s => ({ face: 'z', s, t: q * 2.4, w: 1, y0: 1.2, y1: 1.7 }))),
  });
}

export function lookoutInside(world, x, z, o = {}) {
  const y = world.heightAt(x, z) + 6.6;
  const I = addInterior(world, {
    name: o.name || '物見櫓', kind: 'yagura', x, z, rot: o.rot || 0, team: o.team, profile: 'yagura', open: true,
    levels: [{ y, w: 2.8, d: 2.8, h: 2.1 }], door: { side: 1, lx: 0, w: .9, rail: .95 },
    wins: () => ['x', 'z'].flatMap(face => [-1, 1].map(s => ({ face, s, t: 0, w: 2.5, y0: 1.22, y1: 2.1 }))),
  });
  // 外の梯子の足もとから床の内へ上がる。城下でも同じ梯子を使う。
  const [fx, fz] = I.P(0, 2.9), [tx, tz] = I.P(0, .7);
  const id = addLadder({ x: fx, z: fz, rot: I.rot, y0: world.heightAt(fx, fz), y1: y, deck: I.deckIds[0], hp: o.hp ?? 30, team: null, name: '物見櫓の梯子' });
  const l = FL.ladders[id]; l.placed = true; l.maxHp = l.hp; l.topX = tx; l.topZ = tz;
  I.ladderId = id;
  return I;
}
