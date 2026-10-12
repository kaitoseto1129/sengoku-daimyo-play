// 七曲輪・東大手・西搦手の復元は共用し、高遠の遊びやすさだけをここで補う。
// 登録時に縄張り版を写す読み口にも、同じ高遠の補正を渡す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

  // 霞で三層とも砂色にならないよう、近い尾根ほど濃い青灰色を残す。
  for (const m of rt.world.mountMats) {
    const layer = m.uniforms.layer.value;
    m.color.setHex([0x394d48, 0x566762, 0x75817f][layer]);
    m.fragmentShader = m.fragmentShader.replace('mix(c, hc, hz)',
      'mix(c, hc, min(hz, mix(0.52 + layer * 0.15, 0.88, night)))');
    m.needsUpdate = true;
  }

  // 手持ち幟・指物も、紋ごとの材質と一つの布形を共有する。
  const clothShapes = new Map(), clothMats = new Map(), ringParts = [];
  for (const y of [.28, 0, -.28]) {
    const g = new THREE.TorusGeometry(.025, .008, 4, 8);
    g.rotateX(Math.PI / 2); g.translate(-.008, y, 0); ringParts.push(g);
  }
  const rings = mergeGeometries(ringParts);
  for (const g of ringParts) g.dispose();
  const ringColors = new Float32Array(rings.attributes.position.count * 3);
  ringColors.fill(1);
  rings.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));
  for (let i = 0; i < rings.attributes.uv.count; i++) rings.attributes.uv.setXY(i, .02, .5);
  const dressFlag = (flag) => {
    if (!flag || flag.userData.takatoCloth) return;
    flag.userData.takatoCloth = true;
    const original = flag.geometry;
    if (!clothShapes.has(original)) {
      const g = original.clone(), p = g.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), free = Math.max(0, x / .36);
        const fold = x * 27 + y * 5;
        p.setZ(i, p.getZ(i) + Math.sin(fold) * .018 * free);
        const shade = .88 + .12 * Math.cos(fold);
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      // 乳の輪も布と同じ一描画へ。兵ごとに小道具の描画を増やさない。
      clothShapes.set(original, mergeGeometries([g, rings])); g.dispose();
    }
    const base = flag.material;
    if (!clothMats.has(base)) {
      const mat = base.clone(); mat.vertexColors = true;
      mat.onBeforeCompile = base.onBeforeCompile;
      mat.customProgramCacheKey = () => base.customProgramCacheKey() + '高遠の皺';
      clothMats.set(base, mat);
    }
    flag.geometry = clothShapes.get(original); flag.material = clothMats.get(base);
  };
  const dressUnit = (u) => { dressFlag(u.flag); dressFlag(u.standardFlag); };
  for (const u of rt.army.units) dressUnit(u);
  const addUnit = rt.army.addUnit;
  rt.army.addUnit = function (...args) {
    const u = addUnit.apply(this, args); dressUnit(u); return u;
  };

  // 深手にした敵を記録し、終幕だけそちらへ向ける。戦闘中の操作は変えない。
  const player = rt.player, takeDamage = player.takeDamage, downCamera = player.updateDownCamera;
  const foeLook = new THREE.Vector3();
  player.takeDamage = function (amount, src) {
    const taken = takeDamage.call(this, amount, src);
    if (taken > 0 && src?.pos && src.team !== this.u.team && !src.isStruct) F.downFoe = src;
    return taken;
  };
  player.updateDownCamera = function (dt, camera) {
    const foe = F.downFoe;
    if (foe && !this.downCamReady) {
      this.yaw = Math.atan2(foe.pos.x - this.u.pos.x, foe.pos.z - this.u.pos.z);
    }
    downCamera.call(this, dt, camera);
    if (foe) {
      foeLook.set(foe.pos.x, foe.pos.y + 1.35, foe.pos.z);
      camera.lookAt(foeLook);
    }
  };

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
    rt.army.addUnit = addUnit;
    player.takeDamage = takeDamage; player.updateDownCamera = downCamera;
    for (const g of clothShapes.values()) g.dispose();
    for (const m of clothMats.values()) m.dispose();
    rings.dispose();
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
