// 城下だけの室内支度。共通の床・壁・出入り・戦いをそのまま使う。
import { buildRoom } from './interior_parts.js';
import { cgtOn, cgtHas, cgtBox, cgtParts, cgtSpend, cgtScene, whenCgt, KitBatch } from './cgt.js';

// 買った部品は中央の足もとが原点。実寸の箱に合わせ、廊下へはみ出させない。
let townScene = null, townTris = 0;

function fitted(kb, name, x, y, z, w, h, d, rot = 0) {
  const b = cgtBox(name);
  if (!b || b.h.some(v => !Number.isFinite(v) || v < .00001)) return;
  const ps = cgtParts(name), tris = ps.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (townScene !== cgtScene()) { townScene = cgtScene(); townTris = 0; }
  if (townTris + tris > 24000 || !cgtSpend(tris)) return;
  townTris += tris;
  const sx = w / (b.h[0] * 2), sy = h / (b.h[1] * 2), sz = d / (b.h[2] * 2);
  const cx = b.c[0] * sx, cz = b.c[2] * sz;
  kb.add(name, x - cx * Math.cos(rot) - cz * Math.sin(rot), y - (b.c[1] - b.h[1]) * sy,
    z + cx * Math.sin(rot) - cz * Math.cos(rot), rot, sx, sy, sz);
}

function furnish(I, mesh, night) {
  const kb = new KitBatch();
  for (const lv of I.levels) {
    const y = lv.y, hw = lv.w / 2, hd = lv.d / 2;
    // 床・襖・調度は共通の組み立てで置き換える。ここでは重ねない。
    // 共通の基本形は素材が省かれても残り、部屋の用途が分かる。
    for (const x of [-hw + .35, hw - .35]) {
      const [wx, wz] = I.P(x, hd * .1);
      fitted(kb, 'japanese_lamp_emissive', wx, y, wz, .3, .65, .3, I.rot);
    }
  }
  // 階段は共通の段と手すりを使う。素材の寸法で坂や上り口を塞がない。
  if (kb.n) {
    const g = kb.build({ basic: true, tint: night ? .65 : .85, shadow: false, camBlock: false });
    // 世界座標でまとめた部品を、室内の表示・非表示に従わせる。
    mesh.updateMatrixWorld(true);
    g.applyMatrix4(mesh.matrixWorld.clone().invert());
    mesh.add(g);
  }
}

export function buildTownRoom(rt, x, z, o = {}) {
  const room = buildRoom(rt, x, z, o);
  (rt.flags.layoutRooms || (rt.flags.layoutRooms = [])).push(room);
  if (cgtOn()) whenCgt(() => {
    if (!room.inside || cgtScene() !== rt.scene || !room.root.parent || !cgtHas('tatami_floor_modular_a')) return;
    (rt.flags.townRoomQueue || (rt.flags.townRoomQueue = [])).push({ I: room.inside, mesh: room.root, night: o.night });
  });
  return room;
}

// 天守の中が近づいた時に作られるまで待つ。毎コマの形・材質の生成はしない。
export function townTowerTick(I, night, rt) {
  if (!rt?.player || !cgtOn() || !cgtHas('tatami_floor_modular_a') || cgtScene() !== rt.scene) return;
  const queue = rt.flags.townRoomQueue || (rt.flags.townRoomQueue = []);
  if (I && !I.townQueued && !I.townFurnished && I.mesh) { I.townQueued = true; queue.push({ I, mesh: I.mesh, night }); }
  const p = rt.player.u.pos;
  let best = -1, distance = Infinity;
  for (let k = 0; k < queue.length; k++) {
    const q = queue[k], d = Math.hypot(q.I.x - p.x, q.I.z - p.z);
    if (q.mesh.parent && d < q.I.R + 16 && d < distance) { distance = d; best = k; }
  }
  if (best < 0) return;
  const q = queue.splice(best, 1)[0];
  q.I.townFurnished = true;
  furnish(q.I, q.mesh, q.night);
}
