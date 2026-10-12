// 七曲輪・東大手・西搦手の復元は共用し、高遠の遊びやすさだけをここで補う。
// 登録時に縄張り版を写す読み口にも、同じ高遠の補正を渡す。
import * as THREE from 'three';
import { takato_siege as takato } from './b_takato_siege.js';
import { isTouch } from './touch.js';

const baseSetup = takato.setup;
const baseUpdate = takato.update;
const baseAssault = takato.assault;
const baseTint = takato.world.tint;

takato.world.tint = (x, z, h, c) => {
  baseTint(x, z, h, c);
  const shade = .91 + .09 * Math.sin(x * .19 + z * .07) * Math.cos(z * .23)
    + .035 * Math.sin(x * .73 - z * .51);
  c.multiplyScalar(shade);
};

takato.setup = function (rt) {
  baseSetup.call(this, rt);
  const F = rt.flags;
  // 準備中に近い前列を絞る。戦闘中の消失・同じ場所への補充は行わない。
  F.sanSpear.shrinkReal(6);
  F.sanGun.shrinkReal(10);
  F.reserveDef.shrinkReal(8);
  F.defendTotal = F.defenders.reduce((n, b) => n + b.realCount(), 0);

  const color = new THREE.Color();
  for (const mesh of rt.scene.children) {
    if (!mesh.isInstancedMesh) continue;
    if (mesh.count === 120 && mesh.geometry.type === 'IcosahedronGeometry'
        && mesh.material.color.getHex() === 0x948570) {
      // 丸い石の上面に斑の苔。百二十個とも形と材質を共有する。
      const geo = new THREE.SphereGeometry(1, 10, 7), p = geo.attributes.position;
      const colors = new Float32Array(p.count * 3);
      const stone = new THREE.Color(0x929796), moss = new THREE.Color(0x66744b);
      for (let i = 0; i < p.count; i++) {
        const patch = Math.max(0, p.getY(i) - .15)
          * (.55 + .45 * Math.sin(p.getX(i) * 7 + p.getZ(i) * 5));
        color.copy(stone).lerp(moss, patch);
        color.toArray(colors, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mesh.geometry.dispose(); mesh.geometry = geo;
      mesh.material.color.setHex(0xffffff); mesh.material.vertexColors = true;
      mesh.material.needsUpdate = true;
      for (let i = 0; i < mesh.count; i++) {
        color.setScalar(.8 + (i % 5) * .045); mesh.setColorAt(i, color);
      }
      mesh.instanceColor.needsUpdate = true;
    } else if (mesh.count === 160 && mesh.geometry.type === 'ConeGeometry'
        && mesh.material.color.getHex() === 0x9c895a) {
      // 早春なので短い草に、枯れ葉と芽吹きの色を混ぜる。
      const points = [];
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3, x = Math.cos(a) * .16, z = Math.sin(a) * .16;
        points.push(-x, -.3, -z, x, -.3, z, x * .25, .35, z * .25);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geo.computeVertexNormals(); mesh.geometry.dispose(); mesh.geometry = geo;
      mesh.material.side = THREE.DoubleSide; mesh.material.color.setHex(0xffffff);
      mesh.material.needsUpdate = true;
      for (let i = 0; i < mesh.count; i++) {
        color.setHex(i % 3 ? 0x827d51 : 0x68764c); mesh.setColorAt(i, color);
      }
      mesh.instanceColor.needsUpdate = true;
    }
  }

  // 開いた門には、扉の横に静かな三角旗を立てる。閉め直せば旗も下ろす。
  const poleGeo = new THREE.CylinderGeometry(.055, .055, 4.5, 5);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.3, 0, 1.6, 3.8, 0, 0, 3.3, 0], 3));
  flagGeo.computeVertexNormals();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4b4034 });
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xeee1ba, side: THREE.DoubleSide });
  F.openFlags = [];
  for (const gate of Object.values(F.gates)) {
    const s = gate.struct, x = s.seg[0] + s.nx * .7, z = s.seg[1] + s.nz * .7;
    const flag = new THREE.Group(), pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2.25;
    flag.add(pole, new THREE.Mesh(flagGeo, flagMat));
    flag.position.set(x, rt.world.heightAt(x, z), z);
    flag.rotation.y = Math.atan2(s.nx, s.nz); flag.visible = false;
    rt.scene.add(flag); F.openFlags.push({ gate, flag });
    const open = gate._openNow;
    gate._openNow = function (byForce) {
      const wasOpen = this.opened, bark = rt.bark;
      // 共通の開門通知を、この戦の任務に結び付けた一文へ置き換える。
      rt.bark = () => {};
      try { open.call(this, byForce); } finally { rt.bark = bark; }
      flag.visible = this.opened;
      if (wasOpen || rt.over || F.ending) return;
      takato.guideAssault(rt);
      const task = F.guideText || '大手の先手に続け';
      const action = byForce ? 'を破った' : 'が開いた';
      const who = this === F.gates.karamete || this === F.gates.hodoin ? '大手の先手は、' : '';
      rt.bark(`${this.name}${action}。${who}${task}`);
    };
  }

  // 薄い赤枠は高遠の間だけ。戦を離れる際に必ず元へ戻す。
  const style = document.createElement('style');
  style.textContent = `
#vignette.hurt { background: radial-gradient(ellipse at center, transparent 65%, rgba(130,12,4,.14) 100%); }
#vignette.dying, body.rm #vignette.dying { animation: none; box-shadow: inset 0 0 95px rgba(130,12,4,.24); backdrop-filter: none; -webkit-backdrop-filter: none; }
#vignette.side { opacity: .45; }
`;
  document.head.appendChild(style);
  const dispose = rt.dispose;
  rt.dispose = function (...args) {
    style.remove();
    rt.hud.updateThreats = threats;
    poleGeo.dispose(); flagGeo.dispose(); poleMat.dispose(); flagMat.dispose();
    return dispose.apply(this, args);
  };

  // 共通の射線判定と三枠を使い、鉄砲の向きを矢印で示す。
  const threats = rt.hud.updateThreats;
  rt.hud.updateThreats = function (battle) {
    const before = this.threatAt;
    threats.call(this, battle);
    if (before === this.threatAt) return;
    for (const el of this.threatEls) {
      if (el.hidden || !el.textContent.includes('鉄砲')) continue;
      const text = el.textContent;
      const arrow = text.includes('前') ? '↑' : text.includes('後ろ') ? '↓' : text.includes('左') ? '←' : '→';
      el.textContent = arrow + text.slice(1);
    }
  };
  rt.after(22, () => {
    if (rt.over || F.ending || !rt.player.u.alive) return;
    rt.hud.hint(isTouch
      ? '槍や刀は「構え」を押して受ける。もう一度押すと解く。鉄砲は竹束の陰へ。'
      : '槍や刀は右クリックで構える。鉄砲は竹束の陰へ。', null, 9000);
  });
};

takato.assault = function (rt) {
  const after = rt.after;
  // 出撃は史実の流れを保ち、最初の六十秒は門内で備えさせる。
  rt.after = function (sec, fn, ...args) {
    return after.call(this, sec === 6 ? Math.max(6, 60 - rt.t) : sec, fn, ...args);
  };
  try { baseAssault.call(this, rt); } finally { rt.after = after; }
};

takato.guideAssault = function (rt) {
  const F = rt.flags;
  if (F.step < 1 || F.honFell || F.ending) return;
  const g = F.gates;
  let text;
  if (F.niFell) text = g.honInner.opened ? '本丸門を通り、城兵を退けよ'
    : `${g.honOuter.opened ? g.honInner.name : g.honOuter.name}を破れ`;
  else if (F.sanFell) text = g.gateNi.opened ? `${g.gateNi.name}を通り、城兵を退けよ`
    : `${g.gateNi.name}を破り、二の丸へ入れ`;
  else if (F.sallyOut || F.sallyUntil) text = `${g.oteInner.name}から出た城兵を押し返せ`;
  else if (g.oteInner.opened) text = `${g.oteInner.name}を通り、三の丸へ入れ`;
  else text = `${g.oteOuter.opened ? g.oteInner.name : g.oteOuter.name}を破れ`;
  if (F.guideText !== text) { F.guideText = text; rt.obj('main', text, 'main', true); }
};

takato.update = function (rt, dt) {
  baseUpdate.call(this, rt, dt);
  for (const item of rt.flags.openFlags) item.flag.visible = item.gate.opened;
};

export { takato };
