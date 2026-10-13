// 旧越前の入口も、実寸の木ノ芽峠の定義を使う。
// 縮めた二砦・敵だけ弱い傷・時刻による救済・本陣への斬り込みは重ねない。
import { kinome } from './b_kinome.js';
import * as THREE from 'three';
import { dirtTex } from './nature.js';
import { KINOME_PLAN, KINOME_ROADS } from './castles/kinome.js';
import { distToPolyline } from './world.js';
import { addDeck, groundAt } from './floors.js';
import { tabaGeo } from './taketaba.js';

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
  // 木や据え物を置く前から、描く地面の三角形と同じ高さを読む。
  terrainTriangles: true,
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
  // 携帯横の二行で読み切れる長さにする。台詞の枠は増やさない。
  const say = rt.say;
  rt.say = function (speaker, text, ...args) {
    if (/海側は明智光秀・羽柴秀吉/.test(text)) text = '海側は光秀・秀吉に任せる。我らは木戸を開く';
    return say.call(this, speaker, text, ...args);
  };
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

  // 準備済みの石段の天端を保つ。ここで地形の補間に戻すと、
  // 描いた段と兵の足がずれ、土の支えも横へ二重に突き出す。
  // 実地形と遠景の両側を同じ霞へ溶かし、外縁の切り口を隠す。
  // 谷を向く霞には斜面の緑灰色を少し混ぜる。索敵・雨量・見通しは変えない。
  const slope = new THREE.Color(0x7b8871);
  for (const mesh of [W.terrain, W.farLand]) {
    const mat = mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${key}|越前の縁の霞`;
    mat.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.vertexShader = 'varying vec2 vPassEdge;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nvPassEdge = (modelMatrix * vec4(transformed, 1.0)).xz;');
      const fog = THREE.ShaderChunk.fog_fragment.replace('vec3 fogC = fogColor;',
        `vec3 fogC = mix(fogColor, vec3(${slope.r.toFixed(5)}, ${slope.g.toFixed(5)}, ${slope.b.toFixed(5)}),
          smoothstep(0.0, 32.0, -vFogOff.y) * 0.22);`).replace(
        'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
        `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
          float passEdge = smoothstep(${(W.half - 100).toFixed(1)}, ${(W.half - 8).toFixed(1)},
            max(abs(vPassEdge.x), abs(vPassEdge.y)));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, passEdge);`);
      shader.fragmentShader = 'varying vec2 vPassEdge;\n' + shader.fragmentShader.replace('#include <fog_fragment>', fog);
    };
    mat.needsUpdate = true;
  }

  // 近い木の抜きを一画素の細かな粒へ。形も影も増やさず、遠い木は従来のまま。
  for (const mesh of W.treeMeshes) {
    const mat = mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${key}|越前の細かな葉抜き`;
    mat.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor.a *= smoothstep(1.5, 4.5, length(vViewPosition));',
        `if (length(vViewPosition) < 4.5) {
          vec2 passPixel = floor(gl_FragCoord.xy);
          float passGrain = fract(52.9829189 * fract(dot(passPixel, vec2(0.06711056, 0.00583715))));
          if (passGrain > smoothstep(1.2, 4.5, length(vViewPosition))) discard;
        }`).replace(
        'fract((q.x * 2.0 + q.y * 3.0) * 0.2 + fract(q.y * 0.5) * 0.5)',
        'fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715))))');
    };
    mat.needsUpdate = true;
  }
  // 据えた物と運ぶ物の両方に、越前だけの切り口を使う。三か所の縄は既存の形を残す。
  const plainTaba = tabaGeo(), passTaba = tabaGeo(false, true);
  rt.scene.traverse(mesh => { if (mesh.isMesh && mesh.geometry === plainTaba) mesh.geometry = passTaba; });

  // 木戸と物見だけ、手前で目線を塞ぐ時に透かす。材質・箱・線は初めに用意する。
  const viewParts = [], F = rt.flags;
  for (const part of [F.gateKannon, F.gateKinome, F.gateSaikoji, F.gateHachibuse,
    F.towerKannon, F.towerKinome, F.towerSaikoji, F.towerHachibuse]) {
    for (const root of [part.mesh, part.frame]) if (root) root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.material) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(mat => mat.clone());
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      viewParts.push({ mesh, materials, original: materials.map(mat => ({ opacity: mat.opacity,
        transparent: mat.transparent, depthWrite: mat.depthWrite })), faded: false });
    });
  }
  const cameraTick = rt.player.updateCamera, direction = new THREE.Vector3();
  const target = new THREE.Vector3(), eye = new THREE.Vector3(), candidate = new THREE.Vector3();
  const box = new THREE.Box3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  let downView = false, fadeT = 0;
  rt.player.updateCamera = function (dt, camera) {
    cameraTick.call(this, dt, camera);
    const u = this.u, p = camera.position;
    if (!rt.game.photo) {
      if (!u.alive) {
        if (!downView) {
          target.copy(u.pos); target.y += 1.4;
          let score = Infinity;
          // 深手では高さで斜面を避けない。低い位置から見通せる側へ回る。
          for (const radius of [6, 9, 12]) for (let i = 0; i < 16; i++) {
            const angle = this.yaw + Math.PI + i * Math.PI / 8;
            const x = u.pos.x + Math.sin(angle) * radius, z = u.pos.z + Math.cos(angle) * radius;
            const y = groundAt(W, x, z, u.pos.y) + 1.5;
            if (Math.abs(y - target.y) > radius * .3) continue;
            candidate.set(x, y, z);
            let clear = true;
            for (let j = 1; j <= 12; j++) {
              const f = j / 12, sx = target.x + (x - target.x) * f, sz = target.z + (z - target.z) * f;
              if (target.y + (y - target.y) * f < W.heightAt(sx, sz) + .3) { clear = false; break; }
            }
            if (!clear || this.camBlockHit(target, candidate) !== null) continue;
            const cost = Math.abs(y - target.y) + Math.min(i, 16 - i) * .3 + radius * .05;
            if (cost < score) { score = cost; eye.copy(candidate); }
          }
          if (score === Infinity) {
            // 狭い所でも真上へ逃がさず、倒れた場所から戦場へ目を向ける。
            eye.copy(u.pos); eye.y = groundAt(W, eye.x, eye.z, u.pos.y) + 1.5;
            target.set(eye.x + Math.sin(this.yaw) * 8, eye.y, eye.z + Math.cos(this.yaw) * 8);
          }
          downView = true;
        }
        p.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(target);
        this.camPos.copy(p);
      } else {
        downView = false;
        if (!rt.over) {
          const y = groundAt(W, p.x, p.z, u.pos.y) + .8;
          if (p.y < y) {
            camera.getWorldDirection(direction); p.y = y;
            camera.up.set(0, 1, 0); direction.add(p); camera.lookAt(direction);
            this.camPos.copy(p);
          }
        }
      }
    }
    fadeT -= dt;
    if (fadeT > 0) return;
    fadeT = .12;
    camera.getWorldDirection(direction); ray.set(p, direction);
    for (const part of viewParts) {
      const mesh = part.mesh;
      mesh.updateWorldMatrix(true, false);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).expandByScalar(.8);
      const blocked = box.distanceToPoint(p) < 1.2 ||
        (ray.intersectBox(box, hit) !== null && hit.distanceToSquared(p) < 36);
      const faded = !rt.game.photo && mesh.visible && blocked;
      if (part.faded === faded) continue;
      part.faded = faded;
      for (let i = 0; i < part.materials.length; i++) {
        const mat = part.materials[i], original = part.original[i];
        mat.opacity = faded ? original.opacity * .16 : original.opacity;
        mat.transparent = faded || original.transparent;
        mat.depthWrite = faded ? false : original.depthWrite;
        mat.needsUpdate = true;
      }
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
  // 遠くでは寄る場所を伝え、実際に掛矢を使える範囲だけ操作を案内する。
  // 札の時刻を更新せず、同じ案内を声や知らせへ繰り返し流さない。
  F.gateGuideT = (F.gateGuideT || 0) - dt;
  if (F.gateGuideT <= 0) {
    F.gateGuideT = .25;
    const hand = rt.interacts.find(it => it.id === '_gram');
    if (hand && rt._gg?.cur?.alive) {
      const pos = typeof hand.pos === 'function' ? hand.pos() : hand.pos;
      const ready = pos && Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) < hand.r;
      const text = ready ? '「打つ」を長押しして木戸を破れ' : '木戸の前へ。味方と進め';
      let changed = false;
      for (const o of rt.objectives) if (o.id === '_gate' && o.text !== text) { o.text = text; changed = true; }
      const order = rt.orderObjectives?.get('_gate');
      if (order && order.text !== text) { order.text = text; changed = true; }
      if (changed && rt.missionGuide) rt.missionGuide.scan = 0;
    }
  }
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
    rt.objRemove('_gate');
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
