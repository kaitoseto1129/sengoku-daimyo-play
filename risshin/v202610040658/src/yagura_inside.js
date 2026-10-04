// 櫓の共通の室内。戦と城下で同じ寸法・入口・狭間を使う。
import { addInterior } from './naka.js';
import { addLadder, FL } from './floors.js';

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
    levels: [{ y: world.heightAt(x, z) + 3.95, w: Lw - .4, d: 3.6, h: 2 }],
    door: { side: 1, lx: Lw / 2 - 1.2, w: 1.1 }, approach: { pad: .5, len: 4.2 },
    wins: () => [-1, 0, 1].flatMap(q => [-1, 1].map(s => ({ face: 'z', s, t: q * 2.4, w: 1, y0: 1.2, y1: 1.7 }))),
  });
}

export function lookoutInside(world, x, z, o = {}) {
  const y = world.heightAt(x, z) + 6.6;
  const I = addInterior(world, {
    name: o.name || '物見櫓', kind: 'yagura', x, z, team: o.team, profile: 'yagura', open: true,
    levels: [{ y, w: 2.8, d: 2.8, h: 2.1 }], door: { side: 1, lx: 0, w: .9 },
    wins: () => ['x', 'z'].flatMap(face => [-1, 1].map(s => ({ face, s, t: 0, w: 2.5, y0: 1.22, y1: 2.1 }))),
  });
  // 外の梯子の足もとから床の内へ上がる。城下でも同じ梯子を使う。
  const id = addLadder({ x, z: z + 2.9, y0: world.heightAt(x, z + 2.9), y1: y, deck: I.deckIds[0], hp: o.hp ?? 30, team: null, name: '物見櫓の梯子' });
  const l = FL.ladders[id]; l.placed = true; l.maxHp = l.hp; l.topX = x; l.topZ = z + .7;
  I.ladderId = id;
  return I;
}
