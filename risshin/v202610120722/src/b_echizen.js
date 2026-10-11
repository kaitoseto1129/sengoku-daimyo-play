// 旧越前の入口も、実寸の木ノ芽峠の定義を使う。
// 縮めた二砦・敵だけ弱い傷・時刻による救済・本陣への斬り込みは重ねない。
import { kinome } from './b_kinome.js';
import * as THREE from 'three';
import { dirtTex } from './nature.js';
import { KINOME_PLAN, KINOME_ROADS } from './castles/kinome.js';
import { distToPolyline } from './world.js';
import { addDeck, groundAt } from './floors.js';

const echizen = Object.defineProperties({}, Object.getOwnPropertyDescriptors(kinome));

// 越前の入口二郭だけを整える。共通の木ノ芽峠の定義や縄張りは変えない。
const courts = KINOME_PLAN.kuruwa.filter(k => k.id === 'kannon' || k.id === 'kinome_sou').map(k => {
  const x0 = Math.min(...k.poly.map(p => p[0])), x1 = Math.max(...k.poly.map(p => p[0]));
  const z0 = Math.min(...k.poly.map(p => p[1])), z1 = Math.max(...k.poly.map(p => p[1]));
  // 道と土塁から離れた平場の高さを採る。道の補正を郭全体へ広げない。
  let far = -1, y = 0;
  for (let iz = 1; iz < 5; iz++) for (let ix = 1; ix < 5; ix++) {
    const x = x0 + (x1 - x0) * ix / 5, z = z0 + (z1 - z0) * iz / 5;
    let d = Infinity;
    for (const road of KINOME_ROADS) d = Math.min(d, distToPolyline(x, z, road));
    if (d > far) { far = d; y = kinome.world.height(x, z); }
  }
  return { id: k.id, x0, x1, z0, z1, y };
});

echizen.world = {
  ...kinome.world,
  height(x, z) {
    for (const c of courts) {
      // 柵際の土塁は残し、門を抜けた平場を同じ高さにする。
      if (x > c.x0 + 3 && x < c.x1 - 3 && z > c.z0 + 3 && z < c.z1 - 3) return c.y;
    }
    return kinome.world.height(x, z);
  },
  tint(x, z, h, color) {
    let d = Infinity;
    for (const road of KINOME_ROADS) d = Math.min(d, distToPolyline(x, z, road));
    if (d < 8) color.setRGB(.52, .40, .25);
    else color.setRGB(.38, .46, .27);
  },
};

echizen.setup = function (rt) {
  // 既存の十秒後の手ほどき一回を、押す操作まで分かる言葉にする。
  const after = rt.after;
  rt.after = function (seconds, fn) {
    if (seconds === 10 && this.phase === 'brief') fn = () => {
      if (!rt.over && !rt.flags.ending && rt.player.u.alive)
        rt.say('組頭', '槍は敵へ向けよ。「構え」を押し続け、味方のそばで受けよ', 5);
    };
    return after.call(this, seconds, fn);
  };
  try { kinome.setup.call(this, rt); } finally { rt.after = after; }

  const W = rt.world, pos = [], uv = [], indices = [];
  for (const c of courts) {
    const y = rt.flags.C.kuruwa[c.id].level, first = pos.length / 3;
    // 土の床と兵の足場を同じ高さにする。素材と描く形は二郭で一つ。
    pos.push(c.x0, y + .04, c.z0, c.x0, y + .04, c.z1,
      c.x1, y + .04, c.z0, c.x1, y + .04, c.z1);
    uv.push(c.x0 * .23, c.z0 * .23, c.x0 * .23, c.z1 * .23,
      c.x1 * .23, c.z0 * .23, c.x1 * .23, c.z1 * .23);
    indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    addDeck({ ...c, y: y + .04, name: '門内の土の平場' });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: dirtTex(), color: 0xb3976a,
    roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  floor.receiveShadow = true; rt.scene.add(floor);

  // 高さの補間を描く三角形とそろえる。床へ入る時の足と目線のずれを防ぐ。
  const heightAt = W.heightAt;
  W.heightAt = function (x, z) {
    if (Math.abs(x) >= this.half || Math.abs(z) >= this.half) return heightAt.call(this, x, z);
    const n = Math.round(this.half * 2 / this.step), row = n + 1;
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const k = iz * row + ix, g = this.grid;
    return tx + tz <= 1 ? g[k] + (g[k + 1] - g[k]) * tx + (g[k + row] - g[k]) * tz
      : g[k + row + 1] + (g[k + row] - g[k + row + 1]) * (1 - tx)
        + (g[k + 1] - g[k + row + 1]) * (1 - tz);
  };
  const cameraTick = rt.player.updateCamera, direction = new THREE.Vector3();
  rt.player.updateCamera = function (dt, camera) {
    cameraTick.call(this, dt, camera);
    if (!this.u.alive || rt.over) return;
    const p = camera.position;
    const y = groundAt(W, p.x, p.z, this.u.pos.y) + .8;
    const inside = courts.some(c => this.u.pos.x > c.x0 && this.u.pos.x < c.x1
      && this.u.pos.z > c.z0 && this.u.pos.z < c.z1);
    if (p.y < y || inside) {
      camera.getWorldDirection(direction);
      p.y = Math.max(p.y, y);
      camera.up.set(0, 1, 0);
      direction.add(p); camera.lookAt(direction);
    }
  };
  // 最初は門外の二人を受ける。郭内の人数は三十秒後から元の上限で戻す。
  rt.flags.echizenOpening = [];
  for (const b of rt.flags.defenders) {
    if (b._openingPost || !b.real) continue;
    if (b.realCount() > 2) b.shrinkReal(b.realCount() - 2);
    rt.flags.echizenOpening.push({ group: b.real, seekRange: b.real.seekRange, aggro: b.real.aggro });
  }
  // 深手は出血の共通札一つに任せ、同じ退避の声を重ねない。
  rt.player.treatmentHint = true;
  rt.retreatCallN = 4;
};

echizen.update = function (rt, dt) {
  kinome.update.call(this, rt, dt);
  const F = rt.flags, u = rt.player.u;
  if (rt.over || F.ending || !u.alive) return;
  if (rt.t < 30) for (const b of F.defenders) {
    if (b._openingPost || !b.real) continue;
    b.real.stay = true; b.real.seekRange = 0; b.real.aggro = 0;
  }
  else if (F.echizenOpening) {
    for (const o of F.echizenOpening) {
      o.group.seekRange = o.seekRange; o.group.aggro = o.aggro;
    }
    F.echizenOpening = null;
  }
  if (u.hp <= u.maxHp * .4 && !F.dangerTip) {
    F.dangerTip = true;
    if (!(u.wounds?.bleed > .0001)) rt.bark('深手じゃ。構えたまま、味方の後ろへ退け', true);
  }
  if (!F.echizenGateCleared && !F.gateKannon.struct.alive) {
    F.echizenGateCleared = true;
    for (let i = rt.objectives.length - 1; i >= 0; i--) {
      const o = rt.objectives[i];
      if (/打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(o.id);
    }
    for (const [id, o] of rt.orderObjectives || [])
      if (/打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(id);
    rt.obj('main', '木戸が開いた。味方と入り、観音丸の守りを崩せ', 'main', true);
  }
};
export { echizen };
