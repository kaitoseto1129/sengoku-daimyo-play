import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import * as THREE from 'three';
import { GUST } from './world.js';
import { S as SETTINGS } from './settings.js';
// 森部：雨中の渡河 → 先手 → 長い槍の押し合い → 両将の備を崩す → 集結。
import { gauss, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { tuftClumpAt } from './world_common.js';
import { RANKS } from './state.js';
import { nobori, timberRoof, jinmaku } from './props.js';
import { woodTex, mudTex } from './nature.js';
import { MORIBE_KACCHU } from './kacchu_data.js';
import { addInterior } from './naka.js';
import { sendOrder } from './denrei.js';
import { nagashinojo } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { revealName } from './battle_intel.js';
import { gone as groupGone, seasonOf } from './b_shared.js';
import { camp } from './b_mid.js';
import { demBlend, demSample } from './dem.js';
import { drawGroundAt } from './render_camera.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_UNIT_BREAK, EVENT_COMMANDER_KILLED, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';

// ======================================================================
// 第2戦　森部
// ======================================================================
// 略図の距離は推定。南の本陣と東の川までの野を、会戦の足元へ縮めない。
const FIELD2 = 800;
const CAMP2 = { x: 0, z: 700 };
const NAGARA2 = 500;
const ROAD2 = [[-40, FIELD2], [-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176], [4, -FIELD2]];
// 楡俣川（南の支流）の南岸から始め、腿までの流れを渡って北岸の川岸で組をそろえる。
const NIREMATA2 = 88;
// 楡俣川の流れの中ほどの z（下の streams の折れ線と同じ形）。
const nireZ = (x) => x < -70 ? NIREMATA2 + 2 * Math.min(1, (-70 - x) / 730) : x < 46 ? NIREMATA2 : NIREMATA2 + 6 * Math.min(1, (x - 46) / 454);
// 南岸の水際から始め、渡河そのものは残して岸までの長い歩きを省く。
const START2 = { x: 40, z: 98 };
// 北岸の水際で渡河を終える。岸へ上がった後まで、奥の集合場所を追わせない。
const POINT2 = { x: 40, z: 79 };
const FORD_R = 4;
// 向こう岸へ上がれば渡河済み。浅瀬から横へそれても、小旗へ戻らせない。
const atFordBank = (p) => p.z <= nireZ(p.x) - (NIREMATA2 - POINT2.z);
const FRONT2 = { x: 4, z: 20 };
const ASSEMBLY2 = { x: 14, z: 10 };
const RETREAT2 = { x: 24, z: 48 };
const YAKUSHI2 = { x: 66, z: 46 };
const LINE2 = -58;
// 在所の戸口・堂前から同じ岸を通る細道（位置は復元）。水田と木で塞がない。
const PEOPLE_PATHS2 = [
  [[-126, 10], [-124.6, 14.6], [-144, 20.6], [-240, 20.6]],
  [[-142, 34], [-143, 39], [-160, 45], [-240, 45]],
  [[-142, 58], [-170, 58], [-240, 58]],
  [[66, 46], [66, 51.2], [94, 56], [140, 56], [210, 40]],
  [[82, 56], [94, 56]],
];
// 印が画面外でも、視点から見た進む向きを任務の一行に残す。
function moribeDestination(rt, pos, label) {
  const p = rt.player, dx = pos.x - p.u.pos.x, dz = pos.z - p.u.pos.z;
  const yaw = p.yaw + (p.camYawOff || 0);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const arrow = forward < -Math.abs(right) ? '↶' : Math.abs(right) > Math.abs(forward) * .6 ? right > 0 ? '→' : '←' : '↑';
  return `${arrow} ${label}`;
}
// 先手を退けた場所に近い味方の岸を、一度だけ守備先にする。
function moribeHoldPoint(rt) {
  const F = rt.flags;
  if (F.lineFixed) return;
  const p = rt.player.u.pos;
  let best = Infinity;
  for (const g of F.friends) if (!gone(g)) {
    const c = g.center(), z = Math.min(POINT2.z, c.z);
    const d = Math.hypot(c.x - p.x, z - p.z);
    if (d >= best || !rt.world.walkable(c.x, z)) continue;
    best = d; F.linePoint.x = c.x; F.linePoint.z = z;
  }
  if (best === Infinity) { F.linePoint.x = POINT2.x; F.linePoint.z = POINT2.z; }
  F.lineFixed = true;
}
function peoplePathDistance(x, z) {
  let d = Infinity;
  for (const path of PEOPLE_PATHS2) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}

// 堂と在所の屋敷は推定復元。外壁の戸口と共通の室内の入口を同じ位置へそろえる。
function moribeBuildings(rt) {
  const W = rt.world, geo = new THREE.BoxGeometry(1, 1, 1, 1, 4, 1), bundles = new Map(), details = new Map();
  // 軒下と地際の陰を既存の箱へ焼く。柱・壁・床で同じ形を使い、動く影は増やさない。
  const gp = geo.attributes.position, gn = geo.attributes.normal, shades = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const t = gp.getY(i) + .5;
    const k = gn.getY(i) < -.5 ? .48 : gn.getY(i) > .5 ? 1 : .68 + Math.sin(t * Math.PI) * .28;
    shades[i * 3] = shades[i * 3 + 1] = shades[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  const at = new THREE.Object3D();
  // 安八町の薬師堂の伝承を踏まえた復元。民家は西の在所へ寄せ、水路の上に置かない。
  // 民の人数・位置・避難路は史料にない。北岸のまま、村は西へ、堂は東の野へ逃がす。
  const routeOf = (path, from) => path.slice(from).map(([x, z]) => ({ x, z }));
  const villageRoute = routeOf(PEOPLE_PATHS2[2], 1);
  const templeRoute = routeOf(PEOPLE_PATHS2[3], 2);
  rt.civilianBands = [
    { x: -142, z: 58, kinds: ['farmer', 'woman', 'child', 'elder'], mode: 'watch', route: villageRoute },
    { x: 82, z: 56, kinds: ['farmer', 'merchant', 'woman', 'monk'], mode: 'watch', route: templeRoute },
  ];
  for (const b of [
    { x: YAKUSHI2.x, z: YAKUSHI2.z, w: 5.4, d: 4.8, rot: 0, h: 3.2, kind: 'hondo', name: '森部の薬師堂', roof: 0x3a3430 },
    { x: -126, z: 10, w: 6, d: 4, rot: .3, h: 2.7, kind: 'yashiki', name: '在所の屋敷', roof: 0x6a5c44 },
    { x: -142, z: 34, w: 5, d: 4, rot: -.2, h: 2.7, kind: 'yashiki', name: '在所の小屋敷', roof: 0x6a5c44, shoji: true },
  ]) {
    const { x, z, w, d, rot, h } = b, hw = w / 2, hd = d / 2, temple = b.kind === 'hondo';
    const c = Math.cos(rot), s = Math.sin(rot), door = 1.8, dh = 2.2;
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let ground = drawGroundAt(W, x, z);
    for (const lx of [-hw, hw]) for (const lz of [-hd, hd]) {
      const [px, pz] = P(lx, lz); ground = Math.max(ground, drawGroundAt(W, px, pz));
    }
    const y = ground + .45;
    W.addGroundShade(x, z, w + 2.4, d + 2.4, rot, .43);
    const box = (lx, ly, lz, ww, hh, dd, color, tilt = 0) => {
      const [px, pz] = P(lx, lz);
      at.position.set(px, ly, pz); at.rotation.set(0, rot, 0); at.rotateZ(tilt);
      at.scale.set(ww, hh, dd); at.updateMatrix();
      // 細い板目・貫・垂木は輪郭を保ち、影へは足さない。
      const target = hh <= .18 || ww <= .025 || dd <= .025 ? details : bundles;
      if (!target.has(color)) target.set(color, []);
      target.get(color).push(at.matrix.clone());
    };
    const windows = [-1, 1].map(side => ({ face: 'x', s: side, t: 0, w: 1.2, y0: .8, y1: 1.9, shoji: true }));
    const I = addInterior(W, { x, z, rot, kind: b.kind, name: b.name, hasExterior: true,
      levels: [{ w, d, h, y }], door: { w: door, h: dh }, wins: () => windows,
      approach: { pad: .2, len: 1.8 } });
    rt.civilianBands.push({ x: I.doorOut.x, z: I.doorOut.z, mode: 'inside',
      kinds: temple ? ['monk', 'monk', 'farmer'] : ['farmer', 'woman', 'child', 'elder'],
      route: temple ? templeRoute : routeOf(PEOPLE_PATHS2[b.shoji ? 1 : 0], 2) });
    // 一方の屋敷は明かりを通す障子。戸の当たりと横滑りは共通の仕組みへ任せる。
    if (b.shoji) for (const panel of I.doors || []) panel.kind = 'shoji';
    box(0, y - .1, 0, w + .3, .2, d + .3, 0x55422f);
    for (const lx of [-hw, hw]) for (const lz of [-hd, hd]) {
      const [px, pz] = P(lx, lz), gy = drawGroundAt(W, px, pz), rise = y - gy;
      box(lx, gy + .09, lz, .56, .22, .54, 0x625c4c);
      box(lx, gy + rise / 2, lz, .3, rise, .3, temple ? 0x827b6d : 0x55422f);
      box(lx, y + h / 2, lz, .16, h, .16, 0x493624);
    }
    const wall = temple ? 0x6a5a44 : 0x86705a;
    box(0, y + h / 2, -hd, w, h, .08, wall);
    for (const side of [-1, 1]) {
      box(side * (hw + door / 2) / 2, y + h / 2, hd, (w - door) / 2, h, .08, wall);
      box(side * (door / 2 + .08), y + dh / 2, hd, .16, dh, .18, 0x493624);
      // 側面の明かり障子の穴を空け、紙と桟は室内の共通部品で描く。
      for (const end of [-1, 1]) box(side * hw, y + h / 2, end * (hd + .6) / 2, .08, h, hd - .6, wall);
      box(side * hw, y + .4, 0, .08, .8, 1.2, wall);
      box(side * hw, y + (h + 1.9) / 2, 0, .08, h - 1.9, 1.2, wall);
    }
    box(0, y + (h + dh) / 2, hd, door, h - dh, .08, wall);
    box(0, y + dh + .06, hd, door + .3, .12, .18, 0x493624);
    // 板壁の継ぎ目と胴差し。柱と同じ束へ入れ、戸口・窓の穴は残す。
    for (const zz of [-hd, hd]) {
      box(0, y + h - .12, zz, w + .18, .18, .18, 0x493624);
      if (zz < 0) box(0, y + .62, zz - .05, w, .12, .12, 0x493624);
    }
    // 背板の細い目地と戸口の上の垂木。床下を塞がず、雨の堂の構造を読めるようにする。
    for (let lx = -hw + .38; lx < hw; lx += .38)
      box(lx, y + h / 2, -hd - .045, .022, h - .2, .025, 0x493e30);
    for (let lx = -hw; lx <= hw + .01; lx += w / 8)
      box(lx, y + h - .03, 0, .1, .12, d + (temple ? 1.35 : .7), 0x493624);
    // 正面にも板の継ぎ目と貫を出し、遠目でも一枚の箱壁にしない。
    for (const side of [-1, 1]) {
      const span = hw - door / 2;
      box(side * (hw + door / 2) / 2, y + .65, hd + .055, span, .1, .08, 0x493624);
      for (let lx = door / 2 + .35; lx < hw; lx += .35)
        box(side * lx, y + h / 2, hd + .045, .02, h - .16, .025, 0x493e30);
    }
    if (temple) {
      // 小堂の組物と妻の束。既存の柱と同じ形・材質の束へまとめる。
      for (const lx of [-hw, 0, hw]) {
        box(lx, y + h + .12, hd, .42, .16, .4, 0x493624);
        box(lx, y + h + .25, hd, .24, .14, .54, 0x55422f);
      }
      for (const side of [-1, 1]) {
        box(side * hw, y + h + .25, 0, .14, .65, .14, 0x493624);
        box(side * hw, y + h + .08, 0, .16, .14, d - .3, 0x493624);
      }
    }
    // 堂の縁と上がり段。足場の判定は既存の室内に任せる。
    if (temple) {
      for (let i = 0; i < 2; i++)
        box(0, y - .3 + i * .15, hd + .6 - i * .2, door + .6, .15, .45, 0x55422f);
      // 堂の正面に低い縁と欄間を出し、雨の野でも民家と違う横の輪郭を作る。
      // 箱・木肌・描画の束を共用し、戸口の幅と足場の判定は保つ。
      box(0, y - .08, hd + .3, w + .45, .16, .65, 0x73604a);
      for (const side of [-1, 1]) {
        box(side * (hw + door / 2) / 2, y + .5, hd + .54, hw - door / 2, .09, .08, 0x55422f);
        for (let lx = door / 2 + .3; lx < hw; lx += .48) {
          box(side * lx, y + .27, hd + .54, .065, .5, .065, 0x55422f);
          box(side * lx, y + dh + .25, hd + .07, .055, .32, .09, 0x493624);
        }
      }
    }
    // 共通の板葺きで葺き重ねと軒裏の木組みを出す。戸口や室内の高さは保つ。
    rt.scene.add(timberRoof(x, y + h + .15, z, w, d, rot,
      { eave: temple ? .8 : .45, pitch: temple ? .48 : .36, color: b.roof }));
  }
  // 在所の軒先の雨除けと荷。配置は復元。道と兵の通る中央を空け、当たりは増やさない。
  // 柱と荷箱は上の部材と同じ箱・材質・描画の束へ入れる。
  const store = (x, y, z, w, h, d, color) => {
    at.position.set(x, y, z); at.rotation.set(0, 0, 0); at.scale.set(w, h, d); at.updateMatrix();
    if (!bundles.has(color)) bundles.set(color, []);
    bundles.get(color).push(at.matrix.clone());
  };
  for (const [x, z] of [[-29, 42], [56, 24]]) {
    let y = drawGroundAt(W, x, z);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.4, 1.4])
      y = Math.max(y, drawGroundAt(W, x + dx, z + dz));
    W.addGroundShade(x, z, 6.2, 4.5, 0, .35);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.4, 1.4]) {
      const gy = drawGroundAt(W, x + dx, z + dz);
      store(x + dx, (gy + y + 2.25) / 2, z + dz, .14, y + 2.25 - gy, .14, 0x493624);
    }
    store(x, y + 2.15, z, 4.7, .16, .16, 0x55422f);
    // 雨除けは棟・母屋・垂木で支える。横からも軒裏と荷台がつながる復元。
    for (const dz of [-1.35, 1.35]) store(x, y + 2.2, z + dz, 4.7, .16, .16, 0x55422f);
    for (let i = 0; i < 7; i++) {
      const px = x - 2.1 + i * .7;
      for (const side of [-1, 1]) {
        at.position.set(px, y + 2.5, z + side * .85);
        at.rotation.set(side * .3, 0, 0); at.scale.set(.095, .12, 1.85); at.updateMatrix();
        bundles.get(0x493624).push(at.matrix.clone());
      }
    }
    // 風上の板壁・貫・筋交いで雨除けの骨組みを見せる。既存の箱の束へまとめる。
    for (let i = 0; i < 12; i++)
      store(x - 2.1 + i * .38, y + 1.05, z - 1.4, .35, 1.95, .065,
        i % 3 ? 0x79634b : 0x5b4937);
    for (const h of [.5, 1.65]) store(x, y + h, z - 1.34, 4.55, .12, .12, 0x493624);
    // 妻側の腰板・桁・棟束。横からも屋根を支える構造と、雨を避ける荷置き場を読む。
    // 既存の箱の束へ入れ、兵の当たりと通り道は変えない。
    for (const side of [-1, 1]) {
      store(x + side * 2.2, y + 2.15, z, .14, .18, 2.95, 0x493624);
      store(x + side * 2.2, y + 2.47, z, .12, .55, .12, 0x493624);
      store(x + side * 2.2, y + .38, z, .075, .65, 2.6, 0x79634b);
      store(x + side * 2.2, y + .75, z, .14, .1, 2.8, 0x493624);
      for (const dz of [-.85, 0, .85])
        store(x + side * 2.245, y + .38, z + dz, .025, .65, .025, 0x493e30);
    }
    for (const side of [-1, 1]) {
      at.position.set(x + side * 1.72, y + 1.75, z + 1.4);
      at.rotation.set(0, 0, side * -.72); at.scale.set(.12, 1.05, .12); at.updateMatrix();
      bundles.get(0x493624).push(at.matrix.clone());
    }
    for (let i = 0; i < 5; i++) {
      const xx = x - 1.45 + (i % 3) * 1.2, zz = z + (i > 2 ? .55 : -.5);
      const gy = drawGroundAt(W, xx, zz);
      store(xx, gy + .34, zz, 1.05, .68, .8, i % 2 ? 0x786044 : 0x62513c);
      store(xx, gy + .7, zz, 1.1, .06, .85, 0x493624);
      // 荷箱の帯と蓋。単色の積み木へ見せず、同じ木材の描画に収める。
      for (const dx of [-.33, .33]) {
        store(xx + dx, gy + .35, zz + .41, .065, .68, .035, 0x493624);
        store(xx + dx, gy + .74, zz, .065, .035, .86, 0x493624);
      }
    }
    // 軒下の槍架と担ぎ棒。荷置き場の役割が横からも読める輪郭を、同じ木材の束で出す。
    // 柱の外側へ寄せ、入口と実兵の進路には当たりを加えない（備品の配置は復元）。
    for (const dz of [-.9, .9]) {
      store(x - 2.85, y + .6, z + dz, .11, 1.2, .11, 0x55422f);
      store(x - 2.85, y + .12, z + dz, .65, .12, .18, 0x493624);
    }
    store(x - 2.85, y + 1.1, z, .14, .13, 2.15, 0x79634b);
    for (let i = 0; i < 6; i++) {
      at.position.set(x - 2.85, y + 1.65, z - .72 + i * .29);
      at.rotation.set(0, 0, -.2); at.scale.set(.045, 3.25 + (i % 3) * .15, .045); at.updateMatrix();
      bundles.get(0x55422f).push(at.matrix.clone());
    }
    // 小屋掛けの足元に濡れた板の敷場。長短を崩し、屋根だけが野に浮いた見え方を避ける。
    for (let i = 0; i < 7; i++) {
      const xx = x - 1.35 + i * .43, zz = z + 1.6 + (i % 3) * .09;
      store(xx, drawGroundAt(W, xx, zz) + .035, zz, .36, .07, 1.1 + (i % 2) * .3, 0x62513c);
    }
    // 荷置き場の片側に差し掛け。柱・母屋・葺き板を同じ束へ入れ、描画は増やさない。
    // 正面の通路と槍架を避け、左右同じ箱だけに見えない雨宿りの輪郭を作る。
    const leanSide = x < 0 ? -1 : 1, leanX = x + leanSide * 3.4;
    for (const dz of [-1.35, 1.35]) {
      const px = x + leanSide * 4.45, pz = z + dz, gy = drawGroundAt(W, px, pz);
      store(px, (gy + y + 1.7) / 2, pz, .13, Math.max(.1, y + 1.7 - gy), .13, 0x493624);
      store(leanX, y + 1.92, pz, 2.5, .14, .14, 0x55422f);
    }
    for (let i = 0; i < 9; i++) {
      at.position.set(leanX, y + 2.02, z - 1.5 + i * .37);
      at.rotation.set(0, 0, -leanSide * .22); at.scale.set(2.65, .075, .4); at.updateMatrix();
      bundles.get(i % 3 ? 0x62513c : 0x55422f).push(at.matrix.clone());
    }
    for (let i = 0; i < 3; i++) {
      const px = leanX + leanSide * .35, pz = z - .95 + i * .9, gy = drawGroundAt(W, px, pz);
      store(px, gy + .22, pz, .75, .44, .65, 0x79634b);
      for (const dx of [-.24, .24]) store(px + dx, gy + .46, pz, .055, .055, .7, 0x493624);
    }
    // 荷置きの後ろを低い柴垣で囲う。既存の木材の束へまとめ、兵の通り道に当たりを足さない。
    for (let i = 0; i < 19; i++) {
      const px = x - 3.6 + i * .4, pz = z - 2.5, gy = drawGroundAt(W, px, pz);
      store(px, gy + .62, pz, .065, 1.15 + Math.sin(i * 2.4) * .13, .075, 0x79634b);
    }
    for (const h of [.32, .88]) store(x, y + h, z - 2.5, 7.6, .075, .09, 0x55422f);
    // 雨除けの妻に槍組の印。低い屋根と幟を重ね、野の中でも荷置きの所在を読めるようにする。
    rt.scene.add(nobori(W, x + leanSide * 4.8, z - 1.9, x < 0 ? 'oda' : 'saito', 5.5));
    // 屋根下の腰掛けと長い荷台。柱と同じ描画の束で、人が使う高さの横線を残す。
    for (const dx of [-1.5, 1.5]) {
      store(x + dx, y + .32, z + .6, .16, .64, .9, 0x493624);
      store(x + dx, y + .68, z + .6, .8, .12, 1.15, 0x79634b);
    }
    store(x, y + .76, z - .55, 3.6, .14, .75, 0x79634b);
    for (const dx of [-1.4, 1.4]) store(x + dx, y + .35, z - .55, .14, .7, .65, 0x493624);
    rt.scene.add(timberRoof(x, y + 2.3, z, 4.8, 3.1, 0, { eave: .45, pitch: .3, color: 0x62513c }));
  }
  // 柱・壁は一束、細部は影なしの一束。色は各部品へ持たせ、材質と形は共用する。
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: woodTex(), bumpMap: woodTex(), bumpScale: .035, roughness: .88 });
  // 木肌の暗い絵と部材の茶色を二重に掛けない。縁・柱・板の色差を雨の散乱光に残す。
  material.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
        'sampledDiffuseColor.rgb = mix(vec3(0.42), vec3(1.0), sampledDiffuseColor.rgb);\n diffuseColor *= sampledDiffuseColor;'));
  };
  material.customProgramCacheKey = () => '森部の雨の木肌';
  const tint = new THREE.Color();
  for (const batch of [bundles, details]) {
    let count = 0;
    for (const matrices of batch.values()) count += matrices.length;
    if (!count) continue;
    const mesh = new THREE.InstancedMesh(geo, material, count);
    let index = 0;
    for (const [color, matrices] of batch) {
      tint.setHex(color);
      for (const matrix of matrices) {
        mesh.setMatrixAt(index, matrix); mesh.setColorAt(index++, tint);
      }
    }
    mesh.castShadow = batch === bundles; mesh.receiveShadow = true; mesh.userData.noMerge = true;
    mesh.computeBoundingSphere(); rt.scene.add(mesh);
  }
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); material.dispose(); return dispose.call(this); };
}

// 足元の低い泥塊。広大な野へ均等に薄めず、渡河後の会戦帯にだけ置く（配置は復元）。
// 当たり・地形の高さを変えず、一つの形・材質・描画で崩れた土の輪郭を出す。
function moribeSoil(rt) {
  const W = rt.world, geo = new THREE.SphereGeometry(1, 7, 4);
  // 土の肩に平たい切断面を作らず、根で崩れた不揃いな丸みを残す。形は全て共用。
  const sp = geo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const k = 1 + .12 * Math.sin(x * 7 + z * 4) * Math.cos(y * 5);
    sp.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mudTex(true), bumpMap: mudTex(true), bumpScale: .018, roughness: .94, envMapIntensity: .2 });
  // 泥の絵に茶と個体色を重ねると黒い破片になる。絵の濃淡を地表と同じ湿土へ戻す。
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', `
        float soilGrain = clamp(dot(sampledDiffuseColor.rgb, vec3(0.333)) / 0.055, 0.75, 1.2);
        sampledDiffuseColor.rgb = vec3(0.115, 0.085, 0.052) * soilGrain;
        diffuseColor *= sampledDiffuseColor;`));
  };
  mat.customProgramCacheKey = () => '森部の湿った土塊';
  const soil = new THREE.InstancedMesh(geo, mat, 760), at = new THREE.Object3D(), color = new THREE.Color();
  let seed = 254, count = 0;
  const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600 && count < 760; i++) {
    const x = -66 + R() * 140, z = -84 + R() * 160;
    if (peoplePathDistance(x, z) < 2 || W.def.paddy(x, z) > .2
      || W.def.streams.some(st => distToPolyline(x, z, st.pts) < st.w + 1)) continue;
    // 草の株と同じ群落の縁へ芝土を残し、泥の真ん中に石粒のように散らさない。
    const patch = tuftClumpAt(x, z), road = distToPolyline(x, z, ROAD2);
    if (patch < .28 || patch > .72 || road < 2) continue;
    // 小粒だけでは横から輪郭が消える。大小を混ぜ、崩れた芝土の低い肩を残す。
    // 一部は踏み場の縁に寄った低い土の肩。小さな同形の粒だけで野を覆わない。
    const shoulder = count % 3 === 0;
    const length = shoulder ? .28 + R() * .42 : .12 + R() * R() * .32;
    // 歩行用の補間と描く三角形には差がある。土塊の腹を描く地面へ埋める。
    const ground = drawGroundAt(W, x, z);
    const rim = Math.min(ground, drawGroundAt(W, x - length, z), drawGroundAt(W, x + length, z),
      drawGroundAt(W, x, z - length * .4), drawGroundAt(W, x, z + length * .4));
    at.position.set(x, rim - .035, z);
    at.rotation.set((drawGroundAt(W, x, z + .3) - drawGroundAt(W, x, z - .3)) / .6,
      shoulder ? Math.atan2(1, .18 + Math.cos(z * .06) * .2) : R() * Math.PI * 2,
      -(drawGroundAt(W, x + .3, z) - drawGroundAt(W, x - .3, z)) / .6);
    at.scale.set(length, shoulder ? .09 + R() * .04 : .055 + length * .12,
      length * (shoulder ? .18 + R() * .2 : .35 + R() * .6)); at.updateMatrix();
    soil.setMatrixAt(count, at.matrix);
    const tone = .88 + R() * .22;
    color.setRGB(tone, tone, tone); soil.setColorAt(count++, color);
  }
  soil.count = count; soil.receiveShadow = true; soil.computeBoundingSphere(); W.scene.add(soil);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); mat.dispose(); return dispose.call(this); };
}

// 深手で戦列を離れた兵だけの備えは、討ち残しや帰着待ちに数えない。
const gone = (g) => groupGone(g) || !g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
// 前の段の声は記録に残し、今の下知を待たせない。
function clearOldSpeech(rt) {
  const hud = rt.hud, F = rt.flags, stage = F.stage || 'brief';
  for (let i = hud.subQ.length - 1; i >= 0; i--) {
    const line = hud.subQ[i];
    if (line.moribeStage !== undefined && (line.moribeStage !== stage || line.moribeEnding !== !!F.ending)) hud.subQ.splice(i, 1);
  }
  const line = hud.shownLine;
  if (line?.moribeStage !== undefined && (line.moribeStage !== stage || line.moribeEnding !== !!F.ending)) hud.nextSub();
}
// 手当て中の兵に引かれず、今戦える兵の位置へ寄せる。入れ物は隊ごとに使い回す。
// 隊の旗持ち（黄旗）の足元。旗持ちが倒れたら隊の真ん中。
function flagPos(g) {
  const u = g.stds?.[0]?.userData.carrier;
  return u && u.alive && !u.gone && !u.fleeing && !u.woundOut ? u.pos : fightingCenter(g);
}
function fightingCenter(g) {
  const c = g._moribeCenter || (g._moribeCenter = { x: 0, z: 0 });
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) {
    x += u.pos.x; z += u.pos.z; n++;
  }
  c.x = n ? x / n : g.anchor.x; c.z = n ? z / n : g.anchor.z;
  return c;
}
// 段が変わる下知だけ、前備の位置から既存の合成音を鳴らす。隊の細かな合図は重ねない。
function moribeSignal(rt, kind) {
  rt.flags.signalSoundAt = rt.t;
  const g = !gone(rt.flags.A) ? rt.flags.A : !gone(rt.flags.B) ? rt.flags.B : null;
  rt.army.playFar(`sig_${kind}`, g ? fightingCenter(g) : rt.player.u.pos, 1);
}
// 上役は組頭の源八（柴田の前備）。雨の中でも三十歩ほどは怒鳴り声が届く。その外へは共通の本物の使番で運ぶ。
function orderSpeech(rt, text, dur = 4) {
  const from = rt.flags.moribeOfficer;
  if (rt.over || !from?.alive || from.gone || from.fleeing || from.woundOut || from.noTarget || from.group?.routed) return;
  const stage = rt.flags.stage, ending = rt.flags.ending;
  if (Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) <= 30 && sightPoint(rt, from.pos)) {
    rt.say('隊長 源八（げんぱち）', text, dur);   // 声の届く所で怒鳴る。名札は城下と同じ「隊長 源八（げんぱち）」
    return;
  }
  sendOrder(rt, from, rt.player.u, { id: 'word', apply: () => {
    // 遅れて届いた前の段の下知で、今の任務を覆さない。
    if (!rt.over && rt.flags.stage === stage && rt.flags.ending === ending)
      rt.say('使番', `源八殿より。「${text}」`, dur);
  } }, { team: 0, faction: 'oda', name: '自分の槍組' });
}

// 復元した呼び声。姿と声が結びつく近さで一度だけ。下知の読み上げ中には重ねない。
function nearbyVoice(rt, group, name, key, text) {
  const F = rt.flags;
  if (F[key] || rt.hud.subT > 0 || rt.hud.subQ.length || rt.t < (F.namedVoiceAt || 0)) return;
  for (const u of group.units) {
    if (u.name !== name || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
    if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 26 || !sightPoint(rt, u.pos)) return;
    F[key] = true; F.namedVoiceAt = rt.t + 12;
    rt.say(name, text, 3.5);
    return;
  }
}

// 国土地理院の標高（森部古戦場。束0 の asset_dem_moribe.js）を手書きの base（低い湿地）に混ぜる
let moribeDem = null;
let moribeDatum = 0;
useTerrain('dem_moribe', (data) => {
  moribeDatum = data ? demSample(data, START2.x, NIREMATA2) : 0;
  moribeDem = data;
});
const MORIBE_DEM_OPTIONS = { scale: 1, xyScale: 1 };
// 実測の最も低い所でなく浅瀬を高さの基準にする。川面だけを下げて岸を急坂にしない。
// 範囲の縁でも基準の差を滑らかに戻し、実測の起伏と外側の地形を保つ。
const moribeHeight = (x, z, b) => (moribeDem ? demBlend(moribeDem, x, z, b + moribeDatum, MORIBE_DEM_OPTIONS, b + moribeDatum - 3) - moribeDatum : b);

// 森部だけの浅瀬。粗い地形の岸に引かれて埋もれた川面を、渡る帯でそろえる。
function moribeFord(rt) {
  const W = rt.world, st = W.def.streams[1], pa = st.mesh.geometry.attributes.position;
  // ピンも到着判定も、描いた水面から地面が出る最初の岸に合わせる。
  // 川の中央で地面が浅くなっていても、ピンを中央へ置かない。
  // 描かれた北岸と到着判定の両方を満たす地点を、出陣時に一度だけ探す。
  // 川幅は片側の幅。水面の外から探し、岸へ一歩上がった所を行き先にする。
  // 幅と同じ値から「幅より小さい間」で探すと、一度も岸を調べられない。
  let bank = st.w + .5;
  while (bank < st.w + 12 && (W.heightAt(START2.x, nireZ(START2.x) - bank) < .14 ||
    drawGroundAt(W, START2.x, nireZ(START2.x) - bank) < .14)) bank += .25;
  POINT2.z = nireZ(START2.x) - bank;
  for (let i = 0; i < st.surface.length; i += 3) {
    const x = st.surface[i], k = Math.max(0, Math.min(1, (160 - Math.abs(x)) / 30));
    const y = st.surface[i + 2] + (0.12 - st.surface[i + 2]) * k;
    st.surface[i + 2] = y;
    pa.setY(i / 3 * 2, y); pa.setY(i / 3 * 2 + 1, y);
  }
  pa.needsUpdate = true;
  // 杭に挟まれた渡り道だけ砂色にする。既存の川面の色を変え、描画や形は増やさない。
  const colors = st.mesh.geometry.attributes.color;
  const sand = new THREE.Color(0x9b956b);
  for (let i = 0; i < pa.count; i++) {
    const k = Math.max(0, Math.min(1, (7 - Math.abs(pa.getX(i) - START2.x)) / 2));
    colors.setXYZ(i, colors.getX(i) + (sand.r - colors.getX(i)) * k,
      colors.getY(i) + (sand.g - colors.getY(i)) * k,
      colors.getZ(i) + (sand.b - colors.getZ(i)) * k);
  }
  colors.needsUpdate = true;
  // 粗い頂点の色だけでは帯がぼやける。水面自身に砂底と細かい白波を描き、杭の間を岸から岸へつなぐ。
  const waterMat = st.mesh.material, waterCompile = waterMat.onBeforeCompile;
  const waterKey = waterMat.customProgramCacheKey();
  waterMat.onBeforeCompile = function (sh, renderer) {
    waterCompile.call(this, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', `
      float fordEdge = abs(vWPw.x - ${START2.x.toFixed(1)}) + sin(vWPw.z * 1.7) * 0.22;
      float fordBand = 1.0 - smoothstep(4.5, 6.0, fordEdge);
      float fordGrain = texture2D(tMacro, vWPw.xz * 0.9).r;
      float fordRipple = smoothstep(0.86, 0.98, sin(vWPw.z * 6.0 + fordGrain * 2.0 - uTime * 1.4));
      vec3 fordSand = mix(vec3(0.40, 0.34, 0.21), vec3(0.64, 0.59, 0.43), fordGrain);
      diffuseColor.rgb = mix(diffuseColor.rgb, fordSand, fordBand * 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.78, 0.66), fordRipple * fordBand * 0.45);
      #include <lights_fragment_begin>
    `);
  };
  waterMat.customProgramCacheKey = () => waterKey + '|森部の浅瀬';
  waterMat.needsUpdate = true;
  st.mesh.userData.waterSurfaceReady = true;
  st.mesh.geometry.computeVertexNormals();
  st.mesh.geometry.computeBoundingSphere();
  // 岸と浅瀬の石、渡る帯の杭。出陣時だけ作り、形と材質を使い回す。
  const stoneGeo = new THREE.SphereGeometry(1, 7, 5);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x827b69, roughness: 1 });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 24);
  const pegGeo = new THREE.CylinderGeometry(0.045, 0.065, 1.2, 5);
  const pegMat = new THREE.MeshStandardMaterial({ color: 0xe8cd81, roughness: 1 });
  const pegs = new THREE.InstancedMesh(pegGeo, pegMat, 8), at = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    // 同じ二十四個を帯の両脇へ。両岸だけでなく流れの中にも石が続く。
    const x = START2.x + (i % 2 ? 1 : -1) * (5.5 + Math.sin(i * 2) * .45);
    const z = nireZ(x) - 10 + Math.floor(i / 2) * 20 / 11;
    at.position.set(x, Math.max(W.heightAt(x, z) + 0.12, 0.1), z);
    at.scale.set(0.45 + i % 3 * 0.12, 0.22, 0.36); at.rotation.y = i * 1.7;
    at.updateMatrix(); stones.setMatrixAt(i, at.matrix);
  }
  at.scale.set(1, 1, 1); at.rotation.set(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const x = i % 2 ? 46 : 34, z = POINT2.z + Math.floor(i / 2) * (START2.z - POINT2.z) / 3;
    // 同じ八本を渡り口から対岸まで並べ、水中でも杭の頭を水面に出す。
    at.position.set(x, Math.max(W.heightAt(x, z), .12) + 0.55, z);
    at.updateMatrix(); pegs.setMatrixAt(i, at.matrix);
  }
  W.scene.add(stones, pegs);
  // 粗い地形の面に沿う濡れた岸。細分した色の帯で流れと土手をつなぐ。
  // 高さ・水深・移動判定は保ち、地表から浮く石の列を岸の代わりにしない。
  const bankPos = [], bankColors = [], bankUV = [], bankIndices = [];
  const bankColor = new THREE.Color();
  for (const side of [-1, 1]) {
    const start = bankPos.length / 3;
    for (let i = 0; i <= 110; i++) {
      const x = -100 + i * 2, center = nireZ(x);
      // 描画と水深調べが参照する川面は浅瀬では高さ〇・一二。
      // 実際の地表がその高さを越える所を水際にする。
      let edge = 0;
      while (edge < 20 && W.heightAt(x, center + side * edge) < .14) edge += .25;
      for (let j = 0; j < 4; j++) {
        const offset = edge + j * (1.05 + .2 * Math.sin(x * .23));
        const z = center + side * offset;
        bankPos.push(x, W.heightAt(x, z) + .018, z);
        bankUV.push(x * .45, z * .45);
        const k = j / 3, grain = .95 + .05 * Math.sin(x * 2.7 + j);
        bankColor.setRGB((.24 + k * .12) * grain, (.22 + k * .1) * grain, (.16 + k * .05) * grain);
        bankColors.push(bankColor.r, bankColor.g, bankColor.b, j === 3 ? 0 : .7);
        if (i < 110 && j < 3) {
          const a = start + i * 4 + j;
          bankIndices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        }
      }
    }
  }
  const bankGeo = new THREE.BufferGeometry();
  bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankPos, 3));
  bankGeo.setAttribute('color', new THREE.Float32BufferAttribute(bankColors, 4));
  bankGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bankUV, 2));
  bankGeo.setIndex(bankIndices); bankGeo.computeVertexNormals();
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, bumpMap: mudTex(), bumpScale: .025,
    roughness: .63, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const banks = new THREE.Mesh(bankGeo, bankMat); banks.receiveShadow = true;
  W.scene.add(banks);
  // 水際の草は点状の芽でなく、低く倒れた葉の株。同じ形一つを束ねて描く。
  const reedPos = [], reedColors = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4, dx = Math.cos(angle), dz = Math.sin(angle), h = .34 + i * .065;
    reedPos.push(-dz * .025, 0, dx * .025, dz * .025, 0, -dx * .025, dx * .23, h, dz * .23);
    reedColors.push(.25, .3, .12, .25, .3, .12, .5, .52, .24);
  }
  const reedGeo = new THREE.BufferGeometry();
  reedGeo.setAttribute('position', new THREE.Float32BufferAttribute(reedPos, 3));
  reedGeo.setAttribute('color', new THREE.Float32BufferAttribute(reedColors, 3)); reedGeo.computeVertexNormals();
  const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide });
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 160);
  for (let i = 0; i < 160; i++) {
    const x = -92 + i / 2 * 2.5 + Math.sin(i * 13.1), side = i % 2 ? 1 : -1;
    let edge = 0;
    while (edge < 20 && W.heightAt(x, nireZ(x) + side * edge) < .14) edge += .5;
    const z = nireZ(x) + side * (edge + 2.3 + Math.sin(i * 2.1) * 1.4);
    const fordTrack = Math.abs(x - START2.x) < 5;
    at.position.set(x, W.heightAt(x, z), z); at.rotation.set(0, i * 2.4, 0);
    const scale = fordTrack ? .35 : .8 + (Math.sin(i * 5.1) + 1) * .4;
    at.scale.set(scale, fordTrack ? .12 : scale, scale); at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
  }
  reeds.computeBoundingSphere(); W.scene.add(reeds);
  const dispose = rt.dispose;
  rt.dispose = function () {
    stoneGeo.dispose(); stoneMat.dispose(); pegGeo.dispose(); pegMat.dispose();
    bankGeo.dispose(); bankMat.dispose(); reedGeo.dispose(); reedMat.dispose();
    return dispose.call(this);
  };
}

// 視点に入り込んだ兵と、自分を隠す手前の味方は、描く間だけ装備と馬ごと避ける。
// 肩だけの半透明では袖や脚が大写しに残る。描いた後の復元は元の処理へ任せる。
function moribeNearBodies(rt) {
  const player = rt.player, fade = player.allyFade;
  const tip = new THREE.Vector3(), butt = new THREE.Vector3();
  const viewTip = new THREE.Vector3(), viewButt = new THREE.Vector3();
  // 肩への線だけでは、その上で目前の敵を横切る柄を拾えない。
  // カメラの前の細い箱と柄の線分を調べる。端点が両方とも箱の外でも拾う。
  const crossesView = (a, b) => {
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = a.getComponent(axis), delta = b.getComponent(axis) - start;
      const min = axis === 2 ? -8 : axis === 1 ? -0.8 : -0.9;
      const max = axis === 2 ? -0.2 : axis === 1 ? 1.1 : 0.9;
      if (Math.abs(delta) < 0.0001) { if (start < min || start > max) return false; continue; }
      const t0 = (min - start) / delta, t1 = (max - start) / delta;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return false;
    }
    return true;
  };
  const simpleParts = ['body', 'legL', 'legR'];
  // 広い輪で肩を透かすと、横に立つ兵まで幽霊になる。
  // 体の遮蔽は下の視線判定だけで避け、旗と長柄の共通処理は使う。
  player.nearAllyVisit = () => {};
  player.allyFade = function (cam) {
    fade.call(this, cam);
    if (!cam) return;
    const c = cam.position, p = this.u.pos;
    const vx = p.x - c.x, vz = p.z - c.z, len2 = vx * vx + vz * vz;
    for (const u of rt.army.units) {
      // 距離の切り替えで簡易模型の脚だけ戻さない。描く直前に全身の表示をそろえる。
      // 骨の姿を使わない時は胴を戻し、棒状の脚だけが野に残るのを防ぐ。
      if (u.human && !u.gone && !u.isStruct && !u.mounted && u !== this.u) {
        // 絵札が全身を描く兵へ簡易な胴と脚を重ねない。
        const simple = !u.human.root.visible && !u.efuda;
        for (const key of simpleParts) {
          const part = u[key];
          if (!part) continue;
          part.visible = simple;
          // 非表示の間に親から外された部品も、同じ描画で戻す。
          // 別の親へ持たせた部品は動かさない。道具と形は既存の物を使う。
          if (simple && !part.parent) {
            u.mesh.add(part); part.updateWorldMatrix(true, true);
          }
        }
      }
      // 倒れる途中の味方も視点へ食い込む。生死で遮蔽の確認を外さない。
      if (u.gone || u.isStruct || u === this.u || !u.alive && u.team !== this.u.team) continue;
      const dx = u.pos.x - c.x, dz = u.pos.z - c.z;
      // 味方の馬の首と肩には余裕を取る。敵は共通処理と同じ、体へ入り込む近さに限る。
      // 味方用の広い輪を敵にも使うと、横から迫る敵が武器ごと消えてしまう。
      const ally = u.team === this.u.team;
      // 持ち主が横に離れていても、斜めの長槍は視点へ届く。
      // 柄の実際の両端で調べ、体と奥の槍列は残す。作業用の点は使い回す。
      const w = u.wpn;
      if (ally && w?.visible && (u.wpnKind || u.lookWeapon) === 'spear'
          && dx * dx + dz * dz < 144) {
        w.updateWorldMatrix(true, false);
        butt.set(0, 0, w.userData.butt ?? -1.6).applyMatrix4(w.matrixWorld);
        tip.set(0, 0, w.userData.tip ?? 2).applyMatrix4(w.matrixWorld);
        const flex = w.userData.flex;
        if (flex?.on) {
          flex.b.updateWorldMatrix(true, false);
          tip.set(0, 0, flex.G.tip - flex.G.j2).applyMatrix4(flex.b.matrixWorld);
        }
        viewButt.copy(butt).applyMatrix4(cam.matrixWorldInverse);
        viewTip.copy(tip).applyMatrix4(cam.matrixWorldInverse);
        if (crossesView(viewButt, viewTip)) this.hideNearFlag(w);
        const sx = tip.x - butt.x, sy = tip.y - butt.y, sz = tip.z - butt.z;
        const length2 = sx * sx + sy * sy + sz * sz;
        const along = Math.max(0, Math.min(1,
          ((c.x - butt.x) * sx + (c.y - butt.y) * sy + (c.z - butt.z) * sz) / (length2 || 1)));
        if ((butt.x + sx * along - c.x) ** 2 + (butt.y + sy * along - c.y) ** 2
            + (butt.z + sz * along - c.z) ** 2 < 2.25) this.hideNearFlag(w);
        // 視点の直近だけでなく、自分の肩までを横切る味方の柄も避ける。
        // 敵の槍と、自分より先の槍列は残す。三点の狭い帯だけを調べる。
        if (this.fpK < 0.5) for (let i = 1; i <= 3; i++) {
          const t = i / 3, qx = c.x + vx * t, qz = c.z + vz * t;
          const qy = c.y + (p.y + 1.3 - c.y) * t;
          const k = Math.max(0, Math.min(1,
            ((qx - butt.x) * sx + (qy - butt.y) * sy + (qz - butt.z) * sz) / (length2 || 1)));
          if ((butt.x + sx * k - qx) ** 2 + (butt.y + sy * k - qy) ** 2
              + (butt.z + sz * k - qz) ** 2 < 0.81) { this.hideNearFlag(w); break; }
        }
      }
      // 手前の味方の長槍が空まで横切ると、敵の構えが棒の陰に埋もれる。
      // 視点のすぐ前だけ長柄を避ける。奥の槍列まで抜いて乱戦を薄くしない。
      if (ally && dx * dx + dz * dz < 16) {
        const e = cam.matrixWorldInverse.elements, dy = u.pos.y + 1.3 - c.y;
        const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
        const side = e[0] * dx + e[4] * dy + e[8] * dz;
        if (depth > -1 && depth < 3 && Math.abs(side) < 0.65 + Math.max(0, depth) * 0.12) {
          if ((u.wpnKind || u.lookWeapon) === 'spear' || u.look?.standard) this.hideNearFlag(u.wpn);
          this.hideNearFlag(u.flag);
          this.hideNearFlag(u.standardFlag);
          this.hideNearFlag(u.human?.parts?.pole);
        }
      }
      // 距離だけで隠すのは視点が体へ入る近さまで。横の味方は残し、遮蔽は下の線分で判じる。
      const r = u.mounted ? ally ? 2.2 : 1.5 : 0.95;
      const inside = dx * dx + dz * dz < r * r
        && c.y >= u.pos.y - 0.2 && c.y <= u.pos.y + (u.mounted ? 4.4 : 2.6);
      // 敵の馬も胴より首が前へ張り出す。中心からの円だけでは、
      // 鼻先から視点が入り、人馬が画面を覆う。馬の向きに沿う狭い楕円で補う。
      // 前線の敵まで隠さず、視点そのものが人馬へ入った時だけ避ける。
      let insideHorse = false;
      if (u.mounted && !ally && dx * dx + dz * dz < 6.25
          && c.y >= u.pos.y - 0.2 && c.y <= u.pos.y + 3.4) {
        const yaw = u.mesh.rotation.y, sn = Math.sin(yaw), cs = Math.cos(yaw);
        const side = dx * cs - dz * sn, along = dx * sn + dz * cs;
        insideHorse = side * side / 0.81 + along * along / 4.84 < 1;
      }
      // カメラの近さだけでは、少し先の肩や馬の胴が自分を覆う。
      // 自分までの線分に限り、前線の敵と自分より先の味方は残す。
      const t = len2 > 0.01 ? (dx * vx + dz * vz) / len2 : -1;
      const width = u.mounted ? 1.9 : 1.1;
      const y = c.y + (p.y + 1.3 - c.y) * t;
      const blocks = ally && this.fpK < 0.5 && t > 0 && t < 1
        && (dx - vx * t) ** 2 + (dz - vz * t) ** 2 < width * width
        && y >= u.pos.y && y <= u.pos.y + (u.mounted ? 4.4 : 2.5);
      // 寄った視点では自分までの線分が短くなり、少し先の騎手の胴を拾えない。
      // カメラの向きで、すぐ前に大写しになる味方の騎馬だけも避ける。
      // 横の徒歩と敵には広げない。行列の数値を使い、毎コマ道具を作らない。
      let riderBlocks = false;
      if (ally && u.mounted && dx * dx + dz * dz < 81) {
        const e = cam.matrixWorldInverse.elements, dy = u.pos.y + 2.2 - c.y;
        const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
        const side = e[0] * dx + e[4] * dy + e[8] * dz;
        const rise = e[1] * dx + e[5] * dy + e[9] * dz;
        // 騎手の中心だけでなく、馬の肩と背の旗が中央へ張り出す幅も含める。
        riderBlocks = depth > -1 && depth < 7.5
          && Math.abs(side) < 1.9 + Math.max(0, depth) * 0.12
          && Math.abs(rise) < 3;
      }
      // 共通の遮蔽が先に体を隠した時は、徒歩兵も装具を一緒に避ける。
      // 簡易兵や遠景への切り替えによる非表示は、遮蔽と取り違えない。
      const hiddenBody = u.camHidden || this.nearAllyHid.includes(u.mesh);
      if (!inside && !insideHorse && !blocks && !riderBlocks && !hiddenBody) continue;
      this.hideNearFlag(u.mesh);
      this.hideNearFlag(u.human?.root);
      this.hideNearFlag(u.horse);
      this.hideNearFlag(u.wpn);
      this.hideNearFlag(u.flag);
      this.hideNearFlag(u.standardFlag);
      this.hideNearFlag(u.human?.parts?.pole);
      this.hideNearFlag(u.uma);
    }
    // 本陣と備を行き来する二騎は army.units に入らない。人馬の親を避け、母衣だけ残さない。
    // 自分を覆う近さに限り、奥を走る使番は残す。描いた後は共通の処理で戻る。
    if (rt.couriers) for (const courier of rt.couriers) {
      const m = courier.m;
      if (!m.visible) continue;
      const dx = m.position.x - c.x, dz = m.position.z - c.z;
      if (dx * dx + dz * dz >= 81) continue;
      const e = cam.matrixWorldInverse.elements, dy = m.position.y + 2.2 - c.y;
      const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
      const side = e[0] * dx + e[4] * dy + e[8] * dz;
      const rise = e[1] * dx + e[5] * dy + e[9] * dz;
      const inside = dx * dx + dz * dz < 4.84 && c.y >= m.position.y - 0.2 && c.y <= m.position.y + 4.4;
      if (inside || depth > -1 && depth < 7.5 && Math.abs(side) < 1.9 + Math.max(0, depth) * 0.12 && Math.abs(rise) < 3)
        this.hideNearFlag(m);
    }
    // 体から独立している隊旗も、隠した旗持ちと一緒に戻す。
    for (const g of rt.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const u = s.userData.carrier;
        if (!s.userData.std.down && u && this.nearAllyHid.includes(u.mesh)) this.hideNearFlag(s);
      }
    }
  };
}

// 竿の側と上端は留め、自由な縁ほど波打つ。視線を塞ぐ旗は竿ごと避ける。
function moribeCloth(rt) {
  const mats = new WeakMap(), owned = [], clock = { value: 0 }, wind = { value: 0 };
  const draped = [], vertex = new THREE.Vector3(), inverse = new THREE.Matrix4();
  // 手持ちの幟と隊旗の両方を泥へ寝かせる。落ちた時だけ布を作り、毎コマは触らない。
  const layCloth = (cloth) => {
    const source = cloth.geometry, geo = source.clone(), pa = geo.attributes.position;
    source.computeBoundingBox();
    const width = source.boundingBox.max.x - source.boundingBox.min.x;
    const height = source.boundingBox.max.y - source.boundingBox.min.y;
    cloth.updateWorldMatrix(true, false); inverse.copy(cloth.matrixWorld).invert();
    for (let i = 0; i < pa.count; i++) {
      // 敵旗の切れ込みは絵の座標より竿へ近い。同じ絵の座標で引くと、
      // 竿を越えて裏返った幅広い面になるため、実際の縁から折り量を求める。
      const free = Math.max(0, Math.min(1, (pa.getX(i) - source.boundingBox.min.x) / (width || 1)));
      const loose = Math.max(0, Math.min(1, (source.boundingBox.max.y - pa.getY(i)) / (height || 1)));
      const k = free * loose;
      // 留めた辺は保ち、自由な裾を内側へ折る。幅も縮め、長方形の板を地に残さない。
      const pleat = Math.sin(free * Math.PI * 4 + loose * 3);
      const gather = Math.sin(loose * Math.PI / 2);
      vertex.set(pa.getX(i) - width * 0.86 * free * gather,
        pa.getY(i) + height * 0.48 * k * loose
          + width * (0.22 * k * k + 0.08 * pleat * k), pa.getZ(i)).applyMatrix4(cloth.matrixWorld);
      vertex.y = rt.world.heightAt(vertex.x, vertex.z) + 0.025
        + (0.025 + 0.12 * pleat * pleat) * free * gather;
      vertex.applyMatrix4(inverse); pa.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    geo.userData.moribeShape = source; cloth.geometry = geo; draped.push(geo);
  };
  const dress = (cloth, down = false) => {
    if (!cloth?.isMesh) return;
    const geo = cloth.geometry;
    if (cloth.material.userData.moribeCloth && cloth.userData.moribeGeo === geo && cloth.userData.moribeDown === down) return;
    const base = cloth.userData.moribeBase || (cloth.userData.moribeBase = cloth.material);
    let shapes = mats.get(base);
    if (!shapes) { shapes = { up: new WeakMap(), down: new WeakMap() }; mats.set(base, shapes); }
    const variants = down ? shapes.down : shapes.up;
    const shape = geo.userData.moribeShape || geo;
    let mat = variants.get(shape);
    if (!mat) {
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const rect = { value: new THREE.Vector4(b.min.x, b.min.y, Math.max(0.001, b.max.x - b.min.x), Math.max(0.001, b.max.y - b.min.y)) };
      const fallen = { value: down ? 1 : 0 };
      mat = base.clone();
      // 布の奥の兵や竿を透かさず、幟どうしの前後も深さで決める。
      mat.side = THREE.DoubleSide; mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
      if (down) {
        // 立っていた時の元の材質へ戻す処理で、落ちた白旗の泥まで消さない。
        mat.color.multiplyScalar(0.48); mat.roughness = 1; mat.metalness = 0;
        mat.depthWrite = true;
      }
      mat.userData.moribeCloth = true;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.mbTime = clock; sh.uniforms.mbWind = wind; sh.uniforms.mbRect = rect; sh.uniforms.mbFallen = fallen;
        sh.vertexShader = `uniform float mbTime, mbWind, mbFallen;
uniform vec4 mbRect;
vec3 mbFold() {
  float x = clamp((position.x - mbRect.x) / mbRect.z, 0.0, 1.0);
  float y = clamp((position.y - mbRect.y) / mbRect.w, 0.0, 1.0);
  vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float a = x * 15.0 + y * 5.0 + mbTime * 2.6 + root.x * 0.53 + root.z * 0.37;
  float amp = mix(min(0.30, mbRect.z * 0.18) + mbWind * 0.035, 0.0, mbFallen);
  float k = x * (1.0 - y);
  // 風が弱くても、濡れた布の折れとふくらみを残す。上辺と竿側は動かさない。
  float bow = min(0.34, mbRect.z * 0.32) * (1.0 - mbFallen);
  float crease = x * 6.283185 + y * 2.0;
  float fold = 0.65 + 0.35 * sin(crease);
  return vec3(sin(a) * amp * k + bow * k * x * fold,
    (amp * (sin(a) * (1.0 - y) + cos(a) * 15.0 * k)
      + bow * k * (2.0 * fold + x * 0.35 * 6.283185 * cos(crease))) / mbRect.z,
    (amp * (-sin(a) * x + cos(a) * 5.0 * k)
      + bow * x * x * (-fold + (1.0 - y) * 0.70 * cos(crease))) / mbRect.w);
}
// 濡れた裾の重み。竿側と上辺は留め、動きを減らしても垂れは残す。
vec3 mbSag() {
  float x = clamp((position.x - mbRect.x) / mbRect.z, 0.0, 1.0);
  float loose = 1.0 - clamp((position.y - mbRect.y) / mbRect.w, 0.0, 1.0);
  float weight = mbRect.w * 0.12 * (1.0 - mbFallen);
  return vec3(weight * x * x * loose * loose,
    2.0 * weight * x * loose * loose / mbRect.z,
    -2.0 * weight * x * x * loose / mbRect.w);
}
` + sh.vertexShader
          .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed.z += mbFold().x;
  transformed.y -= mbSag().x;`)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  vec3 fold = mbFold();
  vec3 sag = mbSag();
  objectNormal = normalize(mix(vec3(-sag.y * fold.z - (1.0 - sag.z) * fold.y,
    -fold.z, 1.0 - sag.z), objectNormal, mbFallen));`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.69, 0.60), 0.16);`);
      };
      mat.customProgramCacheKey = () => 'moribe_cloth';
      variants.set(shape, mat); owned.push(mat);
    }
    cloth.material = mat; cloth.userData.moribeGeo = geo; cloth.userData.moribeDown = down;
  };
  const dropWeapon = rt.army.dropWeapon;
  rt.army.dropWeapon = function (u) {
    dropWeapon.call(this, u);
    const w = u.dropped, cloth = u.standardFlag;
    if (!w?.userData.standard || !cloth || cloth.parent !== w || w.userData.moribeGroundCloth) return;
    w.userData.moribeGroundCloth = true;
    // 幟の竿は縦軸。槍の前後を測る共通処理の後で、実際の石突と先を泥へ合わせる。
    // 横方向の法線で長い竿を持ち上げず、竿の下の九点だけで支える。落ちた時に一度だけ。
    const x = w.position.x, z = w.position.z, a = w.rotation.y;
    const sn = Math.sin(a), cs = Math.cos(a);
    const back = w.userData.butt ?? -1.05, front = w.userData.tip ?? 2.55;
    const y0 = this.world.heightAt(x + sn * back, z + cs * back);
    const y1 = this.world.heightAt(x + sn * front, z + cs * front);
    w.rotation.set(Math.PI / 2 - Math.atan2(y1 - y0, front - back), a, 0, 'YXZ');
    w.position.y = 0; w.updateMatrix();
    let lift = -Infinity;
    for (let i = 0; i <= 8; i++) {
      vertex.set(0, back + (front - back) * i / 8, 0).applyMatrix4(w.matrix);
      lift = Math.max(lift, this.world.heightAt(vertex.x, vertex.z) + 0.025 - vertex.y);
    }
    w.position.y = lift;
    layCloth(cloth); dress(cloth, true);
  };
  // 背に付いた指物は手の幟と別。亡骸が残る間も、立った時の四角い布を残さない。
  // 共通の折り布と材質を使い、地に倒れた時に一度だけ替える。
  const animDeath = rt.army.animDeath;
  rt.army.animDeath = function (u, dt, near) {
    animDeath.call(this, u, dt, near);
    const d = u.death;
    if (!u.flag || !d || d.aid || d.floor || d.t <= 0.9 || d.moribeFlagFolded) return;
    d.moribeFlagFolded = true;
    this.foldGroundFlag(u.flag);
  };
  rt.scene.traverse((o) => { if (o.userData.flag?.isMesh) dress(o.userData.flag); });
  const update = rt.updateStandards;
  rt.updateStandards = function (dt) {
    update.call(this, dt);
    clock.value = SETTINGS.reduceMotion ? 0 : this.t;
    wind.value = SETTINGS.reduceMotion ? 0 : GUST.value;
    for (const g of this.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const d = s.userData.std;
        // 視点のため姿を消した旗持ちの隊旗だけを空に残さない。
        // 遠景用の軽い兵と、地へ落ちた旗は従来どおり残す。
        if (!d.down && s.userData.carrier?.camHidden) s.visible = false;
        if (d.kind === 'cavalry') continue;
        // 竿先の接地計算と回す順をそろえる。傾斜で布だけ接地して竿が浮くのを防ぐ。
        if (d.down) s.rotation.set(s.rotation.x, s.rotation.y, 0, 'YXZ');
        // 倒れた時は共通の地に垂れた形へ着替え、風の振れも小さくする。
        if (d.down && d.downT >= 0.7 && !d.cloth.geometry.userData.moribeShape) {
          // 竿の両端だけでなく、布も地形へ沿わせる。倒れ切った時に一度だけ。
          layCloth(d.cloth);
        }
        dress(d.cloth, d.down);
        if (!d.down) {
          s.rotation.x = Math.max(-0.18, Math.min(0.18, s.rotation.x));
          s.rotation.z = Math.max(-0.1, Math.min(0.1, s.rotation.z));
        }
        // 近い布が視点と自分の間を塞ぐ時は、共通処理の非表示を保つ。
        if (d.down) d.cloth.visible = true;
      }
    }
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const mat of owned) mat.dispose();
    for (const geo of draped) geo.dispose();
    return dispose.call(this);
  };
}

// 信長公記首巻「もりべ合戦」。三手の細かな位置・兵数は復元。龍興の後詰は置かない。
const MORIBE_JIN = [
  battleJin('三手の備え', 0, CAMP2, Math.PI, [
    ['mbShiba', '先手', '柴田勝家', 400, 8, 116, 'A', 'oda', 'kari'],
    ['mbMori', '左手', '森可成', 300, -52, 114, 'Y', 'oda', 'tsuru'],
    ['mbRight', '右手', '名は伝わらない', 200, 62, 116, 'R3', 'oda'],
    ['mbMain', '本備', '名は伝わらない', 300, -22, 126, 'B', 'oda'],
    ['mbNobu', '本陣', '織田信長', 300, CAMP2.x, CAMP2.z, 'odaCamp', 'eiraku', 'oda'],
  ], '織田千五百ほど。各手の割り振りは復元。'),
  battleJin('横に並ぶ備え', 1, { x: -34, z: -100 }, 0, [
    ['mbVan', '先手', '名は伝わらない', 1000, 16, -62, 'V', 'saito'],
    ['mbHibi', '本備東', '日比野下野守', 2000, -14, -76, 'M', 'saito'],
    ['mbNagai', '本備西', '長井甲斐守', 2000, -54, -78, 'N', 'saito'],
    ['mbReserveN', '西の控え', '名は伝わらない', 500, -44, -114, 'reserves.0', 'saito'],
    ['mbReserveM', '東の控え', '名は伝わらない', 500, 12, -138, 'reserves.1', 'saito'],
  ], '斎藤六千ほどとも。長井・日比野の控え。龍興本人の出陣は示さない。'),
];

// ついていく旗だけを高く大きく残し、ほかの味方の旗は小さく低くする（黄旗が何本もあって迷う。kaito 10/23）。
//   一秒に一度だけ見る。落ちた旗（場に置かれた旗）は共通の処理が元の大きさへ戻す。
function quietOtherFlags(rt, keep) {
  const F = rt.flags;
  if (rt.t < (F.flagQuietAt || 0)) return;
  F.flagQuietAt = rt.t + 1;
  const team = rt.player.u.team;
  for (const g of rt.army.groups) {
    if (g.team !== team || g.isPlayerSquad || !g.stds?.length) continue;
    const k = !keep || g === keep ? 1 : .55;
    for (const s of g.stds) if (s.parent && s.parent !== rt.scene && s.scale.x !== k) s.scale.setScalar(k);
  }
}

const F_autoAt = (rt) => rt.flags.autoOrderAt || 0;
const moribeFoeReady = (u, p) => u?.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut &&
  !u.noTarget && !u.isStruct && !u.civ && u.team !== p.u.team && u.mesh?.visible !== false;

const moribe = {
  compactIntro: true,
  introName: '森部（もりべ）の戦い',
  introTaskFirst: true,
  introPeopleFolded: true,   // 横持ちでは下知を先に読み、人物紹介は自分で開く。
  // 操作は稲生で覚える。ここでは行き先と勝つための流れを伝える。
  introText: '黄色い杭の間の浅瀬を渡り、向こう岸の小旗へ。',
  introSides: { a: '織田軍', b: '斎藤軍' },
  introPeople: [
    { id: 'moribe-oda', name: '織田信長（おだ のぶなが）', note: '味方の大将。大将は、兵たちをまとめる人。味方と一緒に戦おう。' },
    { id: 'moribe-nagai', name: '長井甲斐守（ながい かいのかみ）', note: '敵の大将の一人。まわりで守る敵の兵と一緒にいる。仲間と協力して倒す。' },
    { id: 'moribe-hibino', name: '日比野下野守（ひびの しもつけのかみ）', note: 'もう一人の敵の大将。長井と日比野と守る兵を倒したら、新しく出る黄色い印へ仲間と戻る。' },
  ],
  enemyTriangleSigns: true, // 森部の敵は頭上の赤い三角で見分ける。
  nearbyAllySignLimit: 0, // 味方の頭上に白い小旗を出さない。追う旗はピン一本、敵は赤い印で分ける。
  noDodgeCard: true, // 矢の雨で「〜をむこう」「にげる」の札を出さない（kaito 10/23 稲生 4）。
  hideMissionDots: true, // 任務の段数は見出しにある。仲間の人数と紛れる五つの丸は出さない。
  missionSingleLine: true, // 右上は任務一行と、文字のない待ち時間の丸だけ。
  // 仲間の名札は一人だけ。密集しても五人分の文字を重ねない。
  missionAllyLabel: 'ついてくる仲間',
  missionContext: '永禄四年（一五六一）・森部（もりべ）の戦い',
  // 見出しは大きな出来事（討ち取り・勝ち負け・雨上がり・合図の火）だけ。行き先や構えの指示の見出しは出さない（kaito 10/23）。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|城が開く|合図の火|雨が上がった|届かず|進めず/.test(t),
  // 右上の一行は「何をするか」だけ（kaito 10/23 49・50）。段の総称で通し、向き・行き先の字は書かない。
  missions: ['川を渡れ', '仲間を待て', '赤い▼の敵を倒せ', '仲間と耐えろ', '日比野下野守を倒せ', '長井甲斐守を倒せ', '逃げる敵を追え', '仲間と集まれ'],
  // ピン・▼・名前は同じ本人へ。描画の間引きで相手を替えない。
  commanderTarget(rt) {
    const F = rt.flags;
    if (F.stage !== 'press' || F.pursuing || F.ending) return null;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? F.HM : F.HN;
      if (!g) continue;
      for (const u of g.units) if (u.type === 'busho' && u.alive && !u.gone && !u.dying &&
          !u.fleeing && !u.woundOut && !u.noTarget) return u;
    }
    return null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  // 頭上の▼一つを大きくして、まず戦う相手を示す。選び直しは四分の一秒に一度。
  missionSignTarget(rt) {
    const F = rt.flags, p = rt.player;
    if (!F.signal || F.ending || F.stage === 'assemble') return null;
    // 討ち取りの段では、離れた一般兵へ印を乗り換えない。
    if (F.stage === 'press' && !F.pursuing) {
      const u = this.commanderTarget(rt);
      if (u) { F.signTarget = u; return u; }
    }
    if (p.inRange && moribeFoeReady(p.rangeCueTarget, p)) return p.rangeCueTarget;
    if (rt.t < F.signTargetAt && F.signStage === F.stage && moribeFoeReady(F.signTarget, p)) return F.signTarget;
    F.signTargetAt = rt.t + .25; F.signStage = F.stage;
    let target = null, best = 48 * 48;
    for (const u of rt.army.units) {
      if (!moribeFoeReady(u, p)) continue;
      const dx = u.pos.x - p.u.pos.x, dz = u.pos.z - p.u.pos.z;
      const yaw = p.yaw + (p.camYawOff || 0);
      if (dx * Math.sin(yaw) + dz * Math.cos(yaw) < 0) continue;
      const d = (dx * dx + dz * dz) * (u === F.signTarget ? .8 : 1);
      if (d >= best || !sightPoint(rt, u.pos)) continue;
      best = d; target = u;
    }
    F.signTarget = target;
    return target;
  },
  missionOf(rt) {
    const F = rt.flags;
    if (!F.signal) return F.pointReached ? 1 : 0;
    if (F.stage === 'contact') return F.vBroken ? 3 : 2;
    if (F.stage === 'hold') return 3;
    if (F.stage === 'assemble') return 7;
    if (F.pursuing) return 6;
    const boss = (g) => !gone(g) && g.units.some((u) => u.type === 'busho' && u.alive && !u.fleeing);
    if (boss(F.HM)) { revealName(rt, '日比野下野守'); return 4; }
    if (boss(F.HN)) { revealName(rt, '長井甲斐守'); return 5; }
    return 6;
  },
  missionHeading(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 渡河済みのコマから待機へ替える。集合判定の更新を待たせない。
    if (!F.signal && F.pointInside) return F.fordThreat ? '敵を倒せ' : '仲間を待て';
    // 集まる間と、その場で耐える間を同じ一行で区別する。向き・距離は書かない。
    if (F.stage === 'assemble') {
      if (F.gatherUnit || Math.hypot(p.x - F.asm.x, p.z - F.asm.z) >= 12) return '仲間と集まれ';
      return '仲間を待て';
    }
    if (F.squadGuide && Math.hypot(p.x - F.squadGuide.pos.x, p.z - F.squadGuide.pos.z) >= 16 ||
        !F.signal && F.pointReached && !F.pointInside ||
        (F.stage === 'hold' || F.stage === 'contact' && F.vBroken) &&
        Math.hypot(rt.player.u.pos.x - F.linePoint.x, rt.player.u.pos.z - F.linePoint.z) >= 24)
      return '仲間と集まれ';
    return this.missions[this.missionOf(rt)];
  },
  minutes: 7,
  missionTimeLabel: '戦の残り目安',
  missionStatusFirst: (rt) => !rt.flags.signal && !rt.flags.pointDone,
  retreatMoveLabel: '印の方へ移動',
  missionAlly(rt) {
    return rt.flags.squadGuide || rt.squad.find((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut);
  },
  // 組への下知は自分で押させず、段に合わせて自ら出す（字の釦で分からせない。kaito 10/23）。
  //   号令の声と法螺・太鼓で伝わる。同じ号令の取り消しに当たらないよう五秒あける。
  autoSquadOrder(rt) {
    const action = this.squadOrderNeed(rt);
    if (!action || action.disabled || F_autoAt(rt) > rt.t) return;
    rt.flags.autoOrderAt = rt.t + 5;
    const selected = rt.player.selGroup;
    rt.player.selGroup = 'all';
    try { rt.player.command(action.command); } finally { rt.player.selGroup = selected; }
  },
  squadOrderNeed(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.squadGroups.length) return null;
    let command = null;
    if (!F.signal && !F.pointDone) command = F.pointInside && F.pointReady ? 'hold' : 'follow';
    else if (F.stage === 'assemble' || F.stage === 'hold' && !F.lineReady || F.squadGuide) command = 'follow';
    else if ((F.stage === 'contact' || F.stage === 'press') && rt.squadGroups.some((g) => !gone(g) && g.order === 'hold')) command = 'follow';
    if (!command) return null;
    let active = false, pending = false, allOrdered = true;
    for (const g of rt.squadGroups) if (!gone(g)) {
      active = true;
      if (g.pending) pending = true;
      if (g.order !== command) allOrdered = false;
    }
    // 伝達済みの命令を押せないボタンにせず、待つ理由は任務の文で伝える。
    if (!active || allOrdered && !pending) return null;
    const action = F.missionAction || (F.missionAction = {});
    action.command = command;
    action.disabled = pending;
    action.label = pending ? command === 'hold' ? '止まる合図を伝えている' : 'ついてくる合図を伝えている' : command === 'hold' ? 'ここで仲間を待たせる' : F.signal && (F.stage === 'contact' || F.stage === 'press') ? '仲間と進む' : '仲間を呼ぶ';
    return action;
  },
  // 右上はミッションの一行だけ。距離・向き・操作の字を見出しに出さない（kaito 10/23 49・50）。
  autoTreatment: true, // 味方に守られて足を止めると、三秒かけて布を巻く。
  meleeHitFeedback: false, // 命中は本人の赤い▼とよろめきで示し、照準の印を重ねない。
  missionStatus() { return ''; }, // 行き先は黄色い矢印と輪だけで示す。
  tacticsCommandText: '', // 横へ回る助言に、操作のない「配下に命じて押せ」を足さない。
  missionWaitProgress(rt) {
    const F = rt.flags;
    if (!F.signal && F.pointInside && !F.pointDone) return F.pointReady ? 1 : F.fordGatherProgress || 0;
    if (F.stage === 'assemble' && !F.gatherUnit && Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12)
      return Math.min(1, (F.assembleT || 0) / 8);
    if (F.stage === 'hold') {
      const elapsed = Math.max(0, rt.t - F.holdStart);
      const reservesReady = (F.wave1 || gone(F.reserves[0])) && (F.wave2 || gone(F.reserves[1]));
      // 列を支える働き・控えの到着・反撃の時刻を、実際の終了条件とそろえる。
      return Math.min(1, Math.max(elapsed / 100,
        Math.min(F.lineT / 25, elapsed / 45, reservesReady ? 1 : .85)));
    }
    return null;
  },
  // 任務の到着判定と同じ位置・半径。入れ物と既存の隊の中心を使い回す。
  missionPin(rt) {
    const F = rt.flags, q = F.moribePin;
    if (!q || F.ending || rt.over) return null;
    // 人を追う印と地面の小旗を区別し、段が変わったら追う相手を消す。
    q.unit = null;
    // 着いた後の足元や画面端へ、移動を促す印を残さない。
    q.waiting = false; q.arrived = false; q.progress = 0;
    if (F.stage === 'contact' && !F.vBroken && !F.squadGuide) return null;
    let pos = null, r = 6, hide = 6;
    if (!F.signal) {
      if (F.pointDone) return null;
      // 岸に上がるまで一本だけ示し、渡った瞬間に消す。足元へ戻らせない。
      if (F.pointInside) return null;
      pos = POINT2; r = FORD_R; hide = 0;
    } else if (F.squadGuide) {
      pos = F.squadGuide.pos; r = hide = 16;
    } else if (F.stage === 'assemble') {
      pos = F.gatherUnit ? F.gatherUnit.pos : F.asm;
      r = hide = F.gatherUnit ? 6 : 12;
      // 集結地点へ着いたら歩き直させず、同じピンの中で帰着を待つ。
      q.waiting = !F.gatherUnit;
      q.arrived = q.waiting && Math.hypot(rt.player.u.pos.x - pos.x, rt.player.u.pos.z - pos.z) < r;
      q.progress = q.arrived ? Math.min(1, (F.assembleT || 0) / 8) : 0;
    } else if (F.stage === 'press' && F.pursuing) {
      return null; // 敵を追う段は赤い▼だけ。地面の行き先と混ぜない。
    } else if (F.stage === 'press') {
      const boss = this.commanderTarget(rt);
      if (!boss) return null;
      q.unit = boss; pos = boss.pos; r = hide = 6;
    } else if (F.stage === 'hold' || F.vBroken) {
      // 守備を始めた地点に固定し、隊が動いても守る場所を動かさない。
      pos = F.linePoint;
      r = hide = 24;
      q.waiting = true;
      q.arrived = !!pos && Math.hypot(rt.player.u.pos.x - pos.x, rt.player.u.pos.z - pos.z) < r;
      // 迎撃中のピンをその場の進み具合へ替え、余計な矢印を残さない。
      q.progress = this.missionWaitProgress(rt) || 0;
    } else if (!gone(F.V)) {
      // 「斎藤の先手を崩す」の間は、その先手の真ん中へ。味方の旗を指すと、どれが先手か分からない（初めての人の迷い）。
      pos = fightingCenter(F.V); r = 6; hide = 8;
    } else {
      pos = !gone(F.A) ? flagPos(F.A) : !gone(F.B) ? flagPos(F.B) : null;
      r = hide = 10;
    }
    if (!pos) return null;
    q.x = pos.x; q.z = pos.z; q.r = r; q.hide = hide;
    return q;
  },
  keepCombatTaskHeading: true,   // 敵一人への押し方で、組を率いる任務の見出しを消さない。
  // 敵一人の間合いより、組をそろえる下知と旗への移動を優先する。
  meleeApproachText(rt) {
    const F = rt.flags;
    if (F.squadGuide) return '離れた仲間の印へ戻れ';
    if (F.stage === 'assemble') return '追わず、戻る印へ集まれ';
    if (!F.signal) return '川を渡り、仲間を待て';
    if (F.stage === 'hold') return F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ';
    return '味方と並び、敵へ槍を向けよ';
  },
  hideApproachAction: true,   // 接近中は組の任務を一度だけ出し、攻撃・向き直りの操作は残す。
  keepApproachTaskPanel: true,   // 敵へ寄る別の旗印と道筋を、組の行き先に重ねない。
  meleeApproachLabel(rt) {
    const F = rt.flags;
    if (!F.signal) return rt.objectives.find((o) => o.id === 'point' && !o.state)?.text || '川を渡った所で、合図を待て';
    if (F.squadGuide || F.stage === 'assemble' && F.gatherUnit) return '仲間のそばへ';
    if (F.stage === 'assemble') return Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12 ? '仲間とここで川への道を守れ' : '戻る印へ仲間と集まれ';
    if (F.stage === 'hold') return F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ';
    return '味方と並び、敵へ進め';
  },
  compactFieldGuides: true,   // 敵の姿を太い人型と大矢印で覆わず、頭の脇の小さな印で示す。
  compactCombatGuides: true,   // 森部だけ、相手の印と足元の向きを小さくし、槍の動きを見せる。
  subtleTargetFrames: true,
  cornerEnemyGuide: true,   // 描画側で使う指定。相手の手足を隠す太い箱を、細い四隅へ替える。
  playerFootSignOnly: true,   // 本人も別経路の白い人型で囲まず、肩越しの具足と槍を見せる。
  teamSignsOnly: true,   // 白い人型で具足を覆わず、頭上の印で示す。見やすさ優先の設定は残す。
  compactHoldGuide: true,
  smallTaskAreas: true,   // 渡河後の待機・退避も足元の小さな印へ。十歩以上の白い弧で槍列を覆わない。
  compactDestinationSign: true,   // 携帯の乱戦でも旗への案内で兵の胴を覆わない。
  routeGuideArrowOnly: true,
  destinationPointerScale: 0.65,
  footFlagGuides: true,   // 頭上へ持ち上げた旗と長い結び線を、実旗の足元の小印へ戻す。
  quietCombatCues: true,   // 危険の向きは端の小さい合図へ。予告の時刻と防御の判定は保つ。
  groundFlagGuides: true,   // 実物の幟を縦の輪で囲まず、足元の旗印だけで行き先を示す。
  compactFlagGuide: true,   // 布全体の囲みと頭上の印を重ねず、根元の案内へそろえる。
  compactGroundGoalRing: true,   // 小さい輪の指定を最小半径で打ち消さず、兵の脚を空ける。
  compactGuardPostRing: true,   // 守る場所も同じ小さな輪にし、強調用の太線へ戻さない。
  smallFlagAvoidNotices: true,   // 行き先の印は任務札と命の帯に重ねない。
  subtleGroundGuides: true,
  compactFloorGuides: true,
  compactDestinationArea: true,
  compactDodgeGuide: true,   // 回避先も同じ小さい輪にし、目前の騎手を覆わない。
  groundCombatMarkers: true,
  groundLockRing: true,
  keepOpeningTaskLabel: true,   // 待つ場所を示す間も、組を連れて渡る下知を残す。
  keepWaitOrderLabel: true,
  // 横持ちでも、川を渡る下知と組をそろえる下知を残す。
  waitTravelLabel(rt) {
    return rt.def.waitOrderLabel(rt);
  },
  guardTravelLabel(rt) {
    return rt.def.travelGuideLabel(rt);
  },
  waitOrderLabel(rt) {
    // 到着後も、組を呼ぶ・列を止める下知を残す。
    return rt.objectives.find((o) => o.id === 'point' && !o.state)?.text || '川を渡った所で、合図を待て';
  },
  waitGuardAllowed: () => false,   // 操作を教える臨時の札は出さず、通常の構えを使う。
  waitGuardButtonText: '構えて防ぐ',
  compactWaitGuard: true,   // 横持ちでは短い長押しの文を使い、指の下の釦は端に固定する。
  guardStartText: '一撃を ふせぐ',
  guardWaitText: '一撃を ふせぐ',
  releaseGuardForAttack: true,   // 打ち終わりは長押しの構えを解き、既存の反撃案内へ渡す。
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u, F = rt.flags;
    if (!F.signal || F.ending || F.stage === 'assemble' || !enemy?.alive || enemy.team === u.team ||
        enemy.gone || enemy.fleeing || enemy.woundOut || enemy.noTarget || enemy.invuln ||
        enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        rt.army.wallBetween(u.pos, -1, enemy.pos)) return false;
    // 正面の敵にすきがあっても、別の槍が本人へ打ち込む間は防ぐ。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.gone || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          !rt.army.wallBetween(u.pos, -1, e.pos)) return false;
    }
    return true;
  },
  treatmentTaskGuidance: true,
  // 浅い一撃ごとに前進と退避を往復させない。危険時の退避・手当ては残す。
  damageRetreatNeeded: (rt) => !!rt.flags.retreatMarked || rt.player.u.hp < rt.player.u.maxHp * .3 ||
    rt.player.u.wounds?.bleed > .0001 || !!rt.player.u.mobbed || rt.player.sta < 20,
  woundEffectMin: 0.05,   // 浅い傷は部位だけ。退く必要は深手・包囲などの案内で伝える。
  woundEffectText: (_rt, slow) => slow ? '足のけが・歩みが遅い' : '腕のけが・突きが弱い',
  guardButtonText: '構える',
  guardButtonHelp: '印の敵の一撃を防ぐ',
  nobiki: true,   // 共通の終幕で、退きの法螺貝と二つ打ちの退き太鼓を一度だけ鳴らす。
  jinkei: MORIBE_JIN,
  // 目前の騎馬と、視点へ食い込む徒歩の肩を避ける。戦う間合いは変えない。
  clampCamera(rt, pos) {
    const p = rt.player, u = p.u;
    const v = rt.flags.moribeRiderView || (rt.flags.moribeRiderView = { at: -1, last: rt.t, gx: 0, gz: 0, x: 0, z: 0 });
    const dt = Math.max(0, Math.min(0.1, rt.t - v.last)); v.last = rt.t;
    if (!u.alive || rt.over || p.fpK > 0.3 || p.aiming || p.overHold || p.cmdOpen || p.radial) {
      v.gx = v.gz = v.x = v.z = 0; v.at = -1; return;
    }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (rt.t >= v.at) {
      v.at = rt.t + 0.15; v.gx = v.gz = 0;
      let strongest = 0;
      for (const o of rt.army.units) {
        if (!o.alive || o === u || o.isStruct || o.woundOut || o.gone) continue;
        const ux = o.pos.x - u.pos.x, uz = o.pos.z - u.pos.z;
        if (ux * ux + uz * uz > 64) continue;
        const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z, d = Math.hypot(dx, dz);
        const radius = o.mounted ? 4.8 : 1.5;
        if (d >= radius || Math.abs(o.pos.y + (o.mounted ? 3 : 1.4) - pos.y) > (o.mounted ? 2.5 : 1)) continue;
        // 離れた後ろの馬では動かさない。すぐ横へ食い込む馬は向きを問わず避ける。
        if (d > 2.8 && dx * fx + dz * fz < d * 0.55) continue;
        const pull = Math.min(o.mounted ? 2.2 : 0.7, (radius - d) * 0.65);
        if (pull <= strongest) continue;
        strongest = pull;
        // 後ろへ一律に引くと、視点の後方や横の騎馬へ逆に食い込む。
        v.gx = d > 0.01 ? -dx / d * pull : -fx * pull;
        v.gz = d > 0.01 ? -dz / d * pull : -fz * pull;
      }
    }
    const k = Math.min(1, dt * (v.gx || v.gz ? 6 : 2.5));
    v.x += (v.gx - v.x) * k; v.z += (v.gz - v.z) * k;
    pos.x += v.x; pos.z += v.z;
  },
  // 今の任務と同じ印へ案内する。先手を退けた後は味方、反撃では敵の大将。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return null;
    if (!F.signal) return F.pointDone ? null : 'point';
    if (F.squadGuide) return 'squadReturn';
    if (F.stage === 'contact' && !F.vBroken) return null;
    if (F.stage === 'press') return F.marked && !gone(F.marked) ? 'commanders' : null;
    if (F.stage === 'contact' && F.vBroken) return 'support';
    return F.stage === 'assemble' ? F.gatherUnit ? 'gatherSquad' : 'assemble' : F.stage === 'hold' ? 'line' : 'frontFlag';
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (!F.signal) return rt.def.waitOrderLabel(rt);
    if (F.squadGuide || F.stage === 'assemble' && F.gatherUnit) return '仲間のそばへ';
    if (F.stage === 'assemble') return Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12 ? '仲間とここで川への道を守れ' : '戻る印へ仲間と集まれ';
    if (F.stage === 'press') return F.pursuing ? '逃げる敵を追う' : F.marked ? '味方と進み、敵の印へ' : '仲間と待て';
    if (F.stage === 'contact' && F.vBroken) return '印へ仲間と集まれ';
    return F.stage === 'hold' ? F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ' : '味方と進み、赤い三角の兵と戦え';
  },
  noticeLimit: 2,
  immediateTaskChanges: true,   // 渡り終えたら、その場の集結・防御の下知へすぐ替える。
  keepTaskLabel: true,   // 近い敵の印で、組の集結や槍列を守る下知を「敵をたおせ」に替えない。
  keepGuardTaskLabel: true,   // 反撃できる時も、組の下知を敵一人の頭上へ移さない。
  keepDestinationTask: true,   // 集結への帰着も本備への前進も、同じ「旗へすすめ」に省かない。
  hideGuideSteps: true,   // 歩数で下知を置き換えず、黄色い矢印で行き先を示す。
  keepCombatTask: true,   // 到着した人数・待つ理由を、戦っている間も任務に残す。
  keepTaskWithGuard: true,   // 携帯の「ふせぐ」が出ても、組の持ち場と進む下知を残す。
  keepRetreatReason: true,   // 「ここへ」に省かず、息切れや包囲など退く理由を見出しに残す。
  keepWoundRetreatReason: true,   // 出血時も、下がる理由と手当ての下知を残す。
  treatmentApproachLabel: '手当ての印へ下がれ',
  coverGuideLabel: '矢を避けて、物かげへ',
  coverGuideTouchLabel: '長押しで物かげへ移動',
  coverGuideHeldText: '物かげへ移動中\n指を離すと止まる',
  shortRetreatArrow: true,   // 画面外の味方へ退く印は端の短い矢印にし、槍の間合いを横切らない。
  swipeArrowLength: 48,   // 足元から旗まで兵を横断する線を引かず、進む向きだけを短く示す。
  guideArrowLength: 48,   // 待機・退避の別経路も同じ長さにそろえる。
  spacedCombatCues: true,
  staminaLabel: '自分の気力',   // 敵の顔に重なった輪を、敵の残り気力と取り違えない。
  // 息切れと負傷を区別する。敵が退いたという下知と「逃げろ」を並べない。
  // 危険の判定・退き先・回復の条件は共通の処理を保つ。
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    if (u.hp < u.maxHp * 0.3)
      return reached ? '味方のそばで構えよ' : '深手だ。味方へ下がれ';
    if (u.mobbed) return reached ? '味方と敵へ構えよ' : '囲まれた。味方へ下がれ';
    if (rt.player.sta < 20) return reached ? 'ここで息を整えよ' : '息切れ。味方へ下がれ';
    if (rt.flags.retreatMarked)
      return reached ? '味方と敵へ構えよ' : '味方のそばで立て直せ';
    if (u.wounds?.bleed > .0001)
      return reached ? '味方のそばで手当てせよ' : '血が出ている。味方の後ろへ';
    if (rt.t < (rt.retreatUntil || 0))
      return reached ? '味方と敵へ構えよ' : '一撃を受けた。味方の後ろへ';
    return reached ? '味方と敵へ構えよ' : '味方の列へ下がれ';
  },
  distanceUnit: 'steps',   // 旗へ結ぶ札と戦う相手の案内も、畦への道と同じ歩数にそろえる。
  edgeDestinationCaption: (_rt, marker, distance) => `${marker.id === 'point' ? '川の向こうの印' : (marker.id === 'squadReturn' || marker.id === 'gatherSquad') ? '仲間' : marker.id === 'commanders' ? '敵の印' : '味方の旗'}まで あと${Math.max(1, Math.ceil(distance / 0.75))}歩`,
  distanceText(rt, distance) {
    const id = rt.missionGuide?.marker?.id;
    // 輪の中心までの距離ではなく、列の確認が始まる縁までを示す。
    if (id === 'point') return rt.flags.pointInside ? '川の向こうの印に到着' : `印まで あと${Math.max(1, Math.ceil((distance - 10) / 0.75))}歩`;
    return distance < 3 ? 'すぐ近く' : `あと${Math.ceil(distance / 0.75)}歩`;
  },
  // 体は視線を遮る時だけ避ける。横の笠は透かさず、長柄だけ共通処理で避ける。
  nearAllyFadeRadius: 3.8,
  nearAllyFadeLevel: 1,
  nearAllyHorseFade: true,
  nearFlagFadeRadius: 6,   // 布の端が手前へ張り出す大きな幟も、描く間だけ竿ごと避ける。
  nearSpearFade: false,   // 横の味方の槍を短く透かさず、視線を塞ぐ長柄だけ避ける。
  nearSpearBatchRadius: 18,   // 手前で避けた槍を、更新時の別の束に残さない。
  nearLongWeaponRadius: 3.2,   // 手前の長柄・竿を避け、乱戦でも敵の肩と槍先を見せる。
  keepPlayerWeapon: true,   // 自分の槍は残し、どこへ構えているか見せる。
  avoidWaymarkThreats: true,   // 危険の札で、前備へ向かう印の名を隠さない。
  actionableThreats: true,   // 敵の向きだけでなく、構える下知も一行で示す。
  compactThreats: true,   // 携帯横でも長い危険札で槍列と旗を隠さない。
  compactThreatAction: () => '構えて防げ',   // 危険が迫ったその場で、今の設定に合う防御の押し方を示す。
  rearThreatFrame: true,   // 振り向いた視点から見た敵の向きを示す。
  rearAdviceView: true,   // 後ろを見る視点でも、警告の左右・前後を見えている向きへ合わせる。
  largeWaymarks: true,   // 雨の川向こうでも、向かう印とその名を読めるようにする。
  treatmentCrossSign: true,   // その場の手当ては十字印。集結先の旗と取り違えさせない。
  foeHit: 1,
  // 重なる槍の傷を共通の仕組みで間引く。満タンの傷枠でも、
  // 体力九十二から近接だけで倒れるまで六十秒以上（厳しい戦は従来どおり）。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  learningFight: false,   // 初陣用の傷の軽減は、この槍戦に持ち込まない。
  noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
  noWake: true,   // 予告のない新手を増やさず、開戦時に置いた控えを前へ出す。
  lordHata: { spear: 36 },   // 信長で遊ぶ時も槍の供にし、兵の枠を守る。
  noTaisho: true,   // 両将を討っても一瞬で終わらず、戦場を固める。
  allyReports: false,   // 味方の様子は源八の怒鳴り声と旗で伝える。小地図の番号の読み上げは出さない。
  battleVoices: { lines: { enemy: {
    ambient: ['織田勢が川を渡ったぞ。槍をそろえよ', '長井様と日比野様の旗を守れ', '城へ退く道を塞がせるな'],
  } } },
  spawn: { x: START2.x, z: START2.z, heading: Math.PI },
  // 信長で遊ぶ時は前へ出た所から始め、後方からの長い行軍で任務を止めない。
  lordSpawn: { x: POINT2.x + 4, z: POINT2.z + 4, heading: Math.PI },
  lordAt: { x: POINT2.x, z: POINT2.z, r: 24, why: '渡河後の槍組のそば（前へ出た位置は復元）' },
  world: {
    seed: 21,
    namedKacchu: MORIBE_KACCHU,
    variedInfantry: true,
    variedLoanArmor: true,
    variedHeadgear: true,   // 共通の六組の装備・補修跡を使い、兵数と強さは保つ。
    longHoro: 'round',   // 使番の背は既存の籠と布の丸い形を使い、細長い板に見せない。
    // 肩の小さな布印で、背の旗が隠れる乱戦でも味方を見分ける（色と採用は復元）。
    allyShoulderMark: 0xc4b895,
    clothFolds: true,   // 置き幟の竿へ通す乳と、布のひだ。
    noticeRepeatGap: 32,   // 同じ知らせは三十秒以内に繰り返さない。
    groundHalf: FIELD2,
    keepTerrainGrid: true,   // 画質「低」も足元と同じ格子を描く。粗い別格子では面の高さが再びずれる。
    terrainTriangles: true,   // 足元を描画する三角形の面へそろえ、粗い升目の起伏で浮かせない。
    wholeInfantrySilhouette: true,   // 軽い姿へ戻る遠さでも脚を残し、胴や笠だけを浮かせない。
    completeCrowdLegs: true,   // 骨入りの遠目の姿にも袴と脛の布を残し、具足の間を空洞にしない。
    drawTimeUnitParts: true,   // 骨と具足の逆行列を描く時にそろえ、槍も持ち主と同じ束で描く。
    movingHiddenBones: true,   // 画面外でも移動した兵の骨をそろえ、手足や具足を前の場所へ残さない。
    fullTipMatrices: true,   // 遠い兵も手首と指を同時に移し、槍の手元を体につなぐ。
    contactShadows: true,   // 近い兵の足元に既存の薄い影を使い、曇天でも地面との接点を示す。
    meleeGroundedFeet: true,   // 近景の既存十八人枠で、押し合いと突き戻しの足を地面へそろえる。
    infantryWeight: true,   // 同じ接地枠で膝・腰・胸へ荷重を渡し、受ける脚を兵ごとに替える。
    moveLim: FIELD2 - 4,
    time: 'storm',
    naturalArrowRain: true,   // 遠矢を太い黒い短冊にせず、雨の見通しに合わせる。
    stormLight: { sunI: 1.65, hemiI: 1.3, sunPos: [-65, 85, 40],
      sky: 0x7e8c90, top: 0x52656f, fog: 0x8b9999,
      hemiSky: 0xb7c6ca, hemiGround: 0x514735 },   // 雲越しの斜光と土の照り返し。兵の見通しは同じ。
    unitCloudFill: .55,   // 共通の近景補光で、黒漆の胴・袖・威糸へ雲の柔らかな光を回す。
    closeCombatAssist: true,   // 初めて組を預かる槍戦の、近い相手への向き直り。
    allyPersonalSpace: 1.2,   // 自分の六歩以内だけ、味方の肩が食い込まない間合い。
    playerMeleeFloor: 1 / 3,   // 無名の足軽は、三歩以内で三度当てれば倒れる。
    muddy: 0.5,
    patchyGround: true,   // 草の株と地肌を同じ不規則な群落へそろえる。
    nearGrassClumpBase: .025,
    nearGrassClumpGain: 1.8,   // 株の総枠は保ち、裸地と根の残る群落を分ける。
    wetFieldRuts: 'wear',   // 通った帯の踏み跡から濡れと溝を出す。野一面に平行な溝を敷かない。
    trampledField: [8, 8, 48, 62],   // 中心と半幅。会戦帯は田の薄い水膜より泥と根を見せる。川・両翼の田・足場は保つ。
    alluvialRocks: true,   // 野の礫は小さく丸め、泥へ埋める。大岩の板を敷き詰めない。
    rockDrawGround: true,
    rockCenterGround: true,
    curvedRockTufts: true,
    litRockTufts: true,
    grassMix(x, z, pd) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 85)
        * Math.max(0, 1 - Math.abs(z - 4) / 78);
      const patch = tuftClumpAt(x, z);
      // 群落の芯には根を残す。会戦帯全体の草を三重に削らず、通った場所だけ倒す。
      return THREE.MathUtils.smoothstep(pd, 0.7, 3.8) * (0.72 + patch * .24 - front * .32);
    },
    softEarthCrust: true,   // 乾いた土塊の陰を升の境で切らず、泥の野を敷石に見せない。
    sparseEarthCrust: true,   // 雨の裸地には土塊をまばらに残す。
    softPathSoil: true,   // 畦道の土と草を連続して混ぜる。足場の高さは変えない。
    subtleMudRelief: true,   // 泥の窪みは踏まれた帯に薄く散らし、野一面を丸い穴で埋めない。
    churnedMud: true,   // 既存の濡れた圧痕を深め、踏まれた土の縁と窪みで照りを分ける。
    livingSpearHedge: true,   // 槍衾でも息と押される力で手元が小さく動く。
    steadyHorseReactions: true,   // 泥の槍列では踏みとどまる。驚くたびに人馬ごと宙へ跳ばさない。
    rearSpearSupport: true,   // 近い後列は、打ち合う前列の笠の上へ槍を送る。密着・行軍中は立てる。
    groundedFallImpact: true,   // 討たれた瞬間でなく、体が地を打った時に音と泥を出す。
    wetEarthBursts: true,   // 雨の土は白い埃にせず、低く重い泥粒にする。
    groundedFalls: true,   // 亡骸に沿って槍を寝かせ、横倒しの胴の厚みも支える。
    settleSideFalls: true,   // 横倒しの途中の前傾を戻し、胴を地へ寝かせる。
    settleFallenLimbs: true,   // 倒れ終わると、浮いた手足も泥へ下ろす。
    crumpledFlags: true,   // 落ちた指物は縮んだ布として泥の上へ伏せる。
    ordinaryFlagStride: 4,   // 無名の長柄足軽は四人に一本。組の旗・隊旗・武将の旗は残す（割合は復元）。
    waterSlow: true,
    riverCross: true,   // 深い長良川を徒歩で素通りしない。南の楡俣川は腿ほどの深さで渡る。
    paths: [ROAD2, ...PEOPLE_PATHS2],
    height(x, z) {
      const b = 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 1.2 * gauss(x, z, 130, 60, 3000) + 1 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300) + 0.9 * Math.exp(-((x - NAGARA2) ** 2) / 1500) + 0.7 * Math.exp(-((x + 70) ** 2) / 50);   // 自然堤防（川筋の微高地）
      // 楡俣川の両岸に低い土手（自然堤防）。田の水と川面を分け、川筋として読めるようにする。
      const dz = Math.abs(z - nireZ(x));
      // 広い野の地形は約十一歩刻み。渡る所を平らにし、細い水面が起伏に埋もれないようにする。
      const ford = Math.max(0, Math.min(1, (160 - Math.abs(x)) / 30)) * Math.max(0, Math.min(1, (30 - dz) / 12));
      const h = moribeHeight(x, z, b);
      return h + (0.2 - h) * ford + (x < NAGARA2 - 40 ? 0.5 * Math.exp(-((dz - 12) ** 2) / 36) : 0);
    },
    tint(x, z, h, c) {
      // 渡河後に両軍が踏んだ会戦帯。川や田はそれぞれの水面を保つ。
      const front = Math.max(0, 1 - Math.abs(x - 8) / 85)
        * Math.max(0, 1 - Math.abs(z - 4) / 78);
      const patch = 0.65 + 0.35 * Math.sin(x * 0.19 + Math.sin(z * 0.13));
      const churn = front * patch * 0.8;
      c.setRGB(c.r + (0.32 - c.r) * churn, c.g + (0.265 - c.g) * churn, c.b + (0.19 - c.b) * churn);
      // 田の畦
      if (Math.abs(x) < 120 && (Math.floor(x / 22) + Math.floor(z / 18)) % 3 === 0 && Math.abs(x - 50) > 18) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.95 + 0.02, c.b * 0.8);
      if (z < LINE2 && z > LINE2 - 1.5 && Math.abs(x) < 110) c.setRGB(0.38, 0.33, 0.22);
      // 川べりの泥と踏み跡：水ぎわから土手の上まで濃い土の色
      { const dz = Math.abs(z - nireZ(x)); if (dz > 8 && dz < 18 && x < NAGARA2 - 40) { const k = 1 - Math.abs(dz - 13) / 5; c.setRGB(c.r + (0.33 - c.r) * k, c.g + (0.29 - c.g) * k, c.b + (0.2 - c.b) * k); } }
    },
    clear: (x, z) => peoplePathDistance(x, z) < 5 || (Math.abs(x) < 160 && Math.abs(z - nireZ(x)) < 30) || (Math.abs(x) < 42 && z > -100 && z < 130) || Math.hypot(x - 52, z - 112) < 22 || Math.hypot(x - 45, z - 70) < 12 || Math.hypot(x + 126, z + 30) < 34,
    // 五月の田：水を張り、苗を植えたばかり（畦を残す）
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (peoplePathDistance(x, z) < 3 || Math.hypot(x - YAKUSHI2.x, z - YAKUSHI2.z) < 7) return 0;
      if (Math.abs(x) > 120 || Math.abs(x - 50) < 18 || Math.abs(z - nireZ(x)) < 18) return 0;   // 川べりは田にしない
      if ((Math.floor(x / 22) + Math.floor(z / 18)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18);
      if (distToPolyline(x, z, ROAD2) < 5) return 0;
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    // 長良川は東の約五百メートル先。川幅・曲がり・楡俣川の浅瀬は復元。
    streams: [{ pts: [[NAGARA2 + 20, -FIELD2], [NAGARA2, -450], [NAGARA2 - 10, -100], [NAGARA2 + 20, 300], [NAGARA2 + 50, FIELD2]], w: 60, depth: 1.4 },
      { pts: [[-FIELD2, NIREMATA2 + 2], [-70, NIREMATA2], [46, NIREMATA2], [NAGARA2, NIREMATA2 + 6]], w: 9, depth: 0.7 },   // 楡俣川：川幅十八メートル・腿までの流れ（川幅は復元。w は片側の幅）
      { pts: [[-70, -FIELD2], [-66, -40], [-74, 60], [-70, FIELD2]], w: 1.2, depth: 0.7 }],
    mist: false,   // 雨は公記にあるが、濃い霧は確定できない。
    fogFar: 360,   // 雨は残し、川向こうと両将の槍列の輪郭まで読めるようにする。
    battleViewDistance: 140,   // 描画の上限内で両翼と控えを見せる。遠い兵は既存の軽い姿を使う。
    trees: 140,
    tufts: 2800,   // 河原の踏み場を、同じ黄色い穂の株で埋めない。
    // 既存の株数を畦・会戦の両脇へ集める。遠い野へ散らして足元を裸にしない。
    undergrowthBands: [{ x: -20, z: 22, w: 22, d: 72 }, { x: 28, z: 18, w: 22, d: 64 },
      { x: -82, z: 30, w: 22, d: 46 }, { x: 36, z: 64, w: 28, d: 7 }],
    nearGrassClumpBase: .22,
    nearGrassClumpGain: 1.65,
    young: true,
    // 雨を吸った下葉は灰緑、踏まれた帯は低く泥色へ。遠景と足元で同じ分布を使う。
    tuftHeight(x, z) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 65) * Math.max(0, 1 - Math.abs(z - 12) / 75);
      return (.38 + Math.pow(tuftClumpAt(x, z), 2) * 1.05) * (1 - front * .28);
    },
    tuftColor(x, z, color) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 65) * Math.max(0, 1 - Math.abs(z - 12) / 75);
      const grey = color.r * .3 + color.g * .55 + color.b * .15;
      color.setRGB(color.r * .52 + grey * .48, color.g * .52 + grey * .48, color.b * .52 + grey * .48);
      const soil = .18 + front * .28;
      color.setRGB(color.r + (.22 - color.r) * soil, color.g + (.235 - color.g) * soil, color.b + (.135 - color.b) * soil);
    },
    // 草と泥の配分は上の会戦帯の定義を使う。重複定義で畦や川岸の草まで薄めない。
    tuftTint: 0x8fa783,   // 雨の初夏。黄白色の草が一面に光らないようにする。
    // 川べりの会戦の帯は開け、木は在所寄りの野の縁へ置く（位置は復元）。
    treeDensity: (x, z) => (Math.hypot(x, z - FRONT2.z) < 160 ? 0 : Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: -180, z: -60, r: 12, n: 10 }, { x: -192, z: -32, r: 10, n: 5 }],
  },
  setup(rt) {
    // 安八町の案内：森部下河原2831。首実検の伝えを後日談へ。
    // https://www.town.anpachi.lg.jp/0000000392.html
    // 当時の姿と戦場での配置は復元。近代の石碑は置かない。
    moribeBuildings(rt);
    moribeSoil(rt);
    rt.flags.yakushiReconstruction = true;
    const W = rt.world;
    // 先手の通った帯を既存の踏み跡の絵へ焼く。面も兵も増やさない。
    W.stampTrail([[38, 68], [29, 45], [12, 22], [4, -8], [-8, -44]], 7, 72);
    W.stampTrail([[-46, 14], [-18, 8], [14, -2], [49, -15]], 9, 60);
    W.stampTrail([[-40, -37], [-12, -32], [25, -39], [61, -51]], 8, 58);
    // 渡り口から北岸へ続く踏み場。水の上に模様を置かず、両岸の草と泥へつなぐ。
    W.stampTrail([[40, 123], [40, 104]], 3.2, 130);
    W.stampTrail([[40, 73], [38, 65], [29, 45]], 3.2, 130);
    moribeFord(rt);
    moribeNearBodies(rt);
    // 落馬した瞬間の描画用の高さを空馬へ引き継ぐと、坂の判定に阻まれて宙で止まる。
    // 森部の野を逃げる空馬だけ、進路を調べる前に足元へ戻す。捕らえた馬は共通のまま。
    const looseHorses = rt.army.updateLooseHorses;
    rt.army.updateLooseHorses = function (dt) {
      if (this.looseHorses) for (const o of this.looseHorses) {
        if (o.kept || o.held > 0) continue;
        const p = o.h.position;
        p.y = W.heightAt(p.x, p.z);
      }
      looseHorses.call(this, dt);
    };
    // 畦の起伏では、足元より胸の下が低いことがある。倒れ切る時だけ胸を地へ戻す。
    // 馬からの落下・手当て・床上は元の処理を保つ。計算の道具は出陣時に用意する。
    const animDeath = rt.army.animDeath, fallAxis = new THREE.Vector3();
    rt.army.animDeath = function (u, dt, near) {
      animDeath.call(this, u, dt, near);
      const D = u.death, m = u.mesh;
      if (u.gone || u.mounted || D.aid || D.floor || D.kind === 'unhorse' || D.t < 0.9) return;
      const settle = THREE.MathUtils.smoothstep(D.t, 0.9, 1.3);
      fallAxis.set(0, 1, 0).applyQuaternion(m.quaternion);
      const x = m.position.x + fallAxis.x * 0.85, z = m.position.z + fallAxis.z * 0.85;
      m.position.y += (W.heightAt(x, z) + 0.2 - (m.position.y + fallAxis.y * 0.85)) * settle;
    };
    // 任務の下に短い治療の一行。二枠が埋まる間は「兵に届く」を重ねない。
    rt.hud.root.classList.add('moribe-notices');
    const noticeStyle = document.createElement('style');
    noticeStyle.textContent = `
/* 次の一手と号令を右の任務札にまとめる。横持ちでも二行を切らない。 */
#hud #h-prog[data-battle="moribe"] { width:min(320px, 38vw); }
/* 待ち時間の丸は任務と同じ一行。秒の字や別の札は足さない。 */
html:root body #hud.mission-only #h-prog[data-battle="moribe"]:has(.pg-pie:not([hidden])) {
 display:flex; align-items:center; gap:12px;
}
html:root body #hud.mission-only #h-prog[data-battle="moribe"] .pg-st { flex:1; min-width:0; }
html:root body #hud.mission-only #h-prog[data-battle="moribe"] > .pg-time:has(.pg-pie:not([hidden])) {
 display:flex !important; order:-1; margin:0; flex:none;
}
#hud #h-prog[data-battle="moribe"] .pg-pie { width:28px; height:28px; position:relative; }
#hud #h-prog[data-battle="moribe"] .pg-pie::after {
 content:""; position:absolute; left:calc(50% - 1px); top:12%; width:2px; height:38%;
 background:#fff3df; box-shadow:0 0 1px 1px #14120f; transform-origin:50% 100%;
 transform:rotate(calc(var(--p, 0) * 3.6deg));
}
/* 共通の一行省略より優先し、今することを最後まで読めるようにする。 */
html:root body #hud.mission-only #h-prog[data-battle="moribe"] .pg-st span {
 max-width:100% !important; white-space:normal !important; overflow:visible !important;
 text-overflow:clip !important; overflow-wrap:anywhere !important;
}
#hud #h-prog[data-battle="moribe"] .pg-next { white-space:normal; overflow:visible; text-overflow:clip; }
#hud #h-prog[data-battle="moribe"] .pg-context { white-space:pre-line; margin-top:4px; }
#hud #h-prog[data-battle="moribe"] .pg-action {
 display:block; width:100%; min-height:44px; margin-top:8px; padding:8px;
 border:2px solid #fff3ba; border-radius:6px; background:#f3d184; color:#14120f;
 font:700 16px/1.4 var(--ui); pointer-events:auto; touch-action:manipulation; cursor:pointer;
}
#hud #h-prog[data-battle="moribe"] .pg-action:disabled { background:#373326; color:#fff3ba; cursor:default; }
#hud #h-prog[data-battle="moribe"] .pg-action[hidden] { display:none; }
#hud #h-prog[data-battle="moribe"] .pg-action:focus-visible { outline:3px solid #fff3ba; outline-offset:3px; }
#hud.moribe-notices #battle-notices:not(.choosing) #objectives { order:0 !important; }
#hud.moribe-notices #battle-notices:not(.choosing) #battle-message { order:1 !important; }
/* 下知は左の任務一枚で読む。開始の同文は畳み、足元の行き先は残す。 */
#hud.moribe-notices:has(#objectives:not([hidden]):not(.notice-muted):not(.expand)) #battle-opening > span {
 display:none !important;
}
/* 共通の旗・遮蔽案内が任務を消しても、森部の組への下知は残す。 */
html body #hud.moribe-notices.cover-guidance #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:flex !important; visibility:visible !important;
}
html body #hud.moribe-notices:is(.flag-guide,.person-guide) #battle-notices #objectives:not(.expand) #obj-list {
 display:block !important;
}
/* 中央固定の道案内より優先し、下知と補足を同じ欄へ収める。 */
html:root body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important;
}
html:root body #hud.moribe-notices.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur small:not([hidden]):not(.notice-muted):not(:empty):not(.goal-place) {
 display:block !important;
}
/* 字幕の表示指定で、選外や空の字幕を復活させない。短い知らせの上の空札を畳む。 */
html body #hud.moribe-notices #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted,:empty) {
 display:none !important;
}
/* 地面の印へ任務札を動かさず、知らせの欄で折り返す。地図・警告と重ねない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.ground-order:not(.expand),
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 max-width:100% !important; overflow-wrap:anywhere; box-sizing:border-box;
}
/* 敵を追う釦と任務を別々に動かさず、同じ欄で読めるようにする。 */
html body #hud.moribe-notices.guard-button-help #battle-notices:not(.choosing) #objectives:not(.expand):has(.guard-action-button) {
 position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
 padding:8px !important; background:#14120f !important; box-sizing:border-box;
}
html body #hud.moribe-notices.guard-button-help #objectives:not(.expand):has(.guard-action-button) > #obj-list {
 display:block !important;
}
#hud.moribe-notices .battle-action .guard-action-button {
 width:100%; min-width:0; min-height:48px; padding:6px 8px;
 font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.3;
}
#hud.moribe-notices .battle-action .guard-action-button small {
 font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4;
}
#hud.moribe-notices .battle-action .guard-action-button.guard-now {
 border-width:3px; border-radius:8px; animation:none; box-shadow:none;
}
#hud.moribe-notices .guard-sign { width:18px; height:22px; }
/* 傷の長い文で命の帯を広げない。残量と傷は同じ墨の札の中で読む。 */
html body #hud.moribe-notices .bl #h-hp.hp {
 grid-template-columns:max-content minmax(0,1fr) !important;
 width:max(244px, calc(224px * var(--text-scale, 1) + 16px)) !important;
 max-width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
}
html body #hud.moribe-notices .bl #h-hp.hp em {
 min-width:0; max-width:100%; white-space:normal !important;
 word-break:normal !important; overflow-wrap:anywhere !important;
 font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.5;
}
html body #hud.moribe-notices .bl #h-hp.hp em svg { width:18px; height:22px; }
/* 手前の槍や旗を地図の道と取り違えないよう、和紙の裏まで不透明にする。 */
html body #hud.moribe-notices #minimap,
html body #hud.moribe-notices.lean.calm #minimap { background:#e8ddc2; opacity:1 !important; }
html body #hud.moribe-notices #battle-notices #objectives.travel-retreat:not(.expand) li.cur .obj-now {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
 line-height:1.4; white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
}
/* 到着人数を本文の横へ詰めず、指図・補足の順に札の全幅で読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) {
 position:relative !important; inset:auto !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 transform:none !important; box-sizing:border-box;
}
html body #hud.moribe-notices #battle-notices #objectives:not(.expand) #obj-list li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 height:auto !important; max-height:none !important; box-sizing:border-box;
}
/* 防御の操作が出ても、組の持ち場と帰る理由を消さない。 */
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list,
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:block !important;
}
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:#14120f !important; padding:8px !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
 position:static !important; display:block !important; width:100% !important;
 min-width:0 !important; max-width:100% !important; height:auto !important;
 white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
 box-sizing:border-box;
}
/* 一文字だけの二行目と、行ごとに分かれる墨の短冊を避ける。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 text-wrap:balance; background:none !important; box-shadow:none !important;
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
/* 共通の地上札より優先し、長い下知を左の欄で読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now,
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:is(.ground-order,.flag-travel-order,.linked-destination):not(.expand) #obj-list li.cur .obj-now {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
html body #hud.moribe-notices #battle-notices #objectives:not(.expand) li.cur small {
 margin-top:4px;
}
/* 退く下知の間に、前の畦の到着人数・待ち時間を並べない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) li.cur small {
 display:none !important;
}
/* 退く警告を先に読み、組の持ち場は同じ札の二段目に残す。人数や距離は混ぜない。 */
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur .obj-full {
 position:static !important; display:block !important; inset:auto !important; transform:none !important;
 width:100% !important; height:auto !important; max-height:none !important; margin-top:4px;
 color:#ece4d2; font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
 font-weight:400; line-height:1.6 !important; white-space:normal !important;
 overflow:visible !important; overflow-wrap:anywhere !important;
}
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur .obj-full::before {
 content:'立て直したら：';
}
/* 同じ「下がれ」を操作欄と任務欄で二度読ませない。降馬の釦は残す。 */
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) .battle-action:not(:has(button)) {
 display:none !important;
}
#hud.moribe-notices .hold-cover[aria-pressed="true"] { background:#65552a !important; box-shadow:inset 0 0 0 3px #fff3ba; }
#hud.moribe-notices #prompt.treatment-action { display:none !important; }
#hud.moribe-notices .battle-notice.treatment { white-space:nowrap; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; }
#hud.moribe-notices:has(#battle-message:not([hidden])) .range-cue { display:none; }
/* 本文と人物紹介は縮めずに送る。出陣の釦には重ならない。 */
html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
 display:flex; flex-direction:column; align-items:stretch;
}
#hud.moribe-notices #intro:has(#intro-go) .intro-reading {
 display:block; width:100%; flex:1 1 auto; min-height:0;
 overflow-y:auto; box-sizing:border-box; padding-bottom:16px; scroll-padding-bottom:16px;
 touch-action:pan-y; overscroll-behavior:contain; pointer-events:auto;
}
#hud.moribe-notices #intro .intro-scroll { flex-shrink:0; font-size:13px; line-height:1.4; }
#hud.moribe-notices #intro .intro-people summary {
 min-height:44px; box-sizing:border-box; padding:10px 8px;
 font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6;
 color:#f2cd72; text-decoration:underline; cursor:pointer;
}
#hud.moribe-notices #intro .intro-people summary:focus-visible {
 outline:3px solid var(--kin); outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
}
#hud.moribe-notices #intro #intro-wait { white-space:pre-line; }
/* 防御は決まった端で押す。敵を追って札が動き、槍先を隠すのを避ける。 */
html body #hud.moribe-notices #wait-guard {
 left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 top:calc(96px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
 width:208px; max-width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
 box-sizing:border-box; height:auto; min-height:56px; border-radius:8px; border-width:3px;
 gap:8px; flex-wrap:nowrap; font-size:max(16px, calc(16px * var(--text-scale, 1)));
}
html.tc-sw body #hud.moribe-notices #wait-guard {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
}
#hud.moribe-notices #wait-guard svg { width:24px; height:32px; }
#hud.moribe-notices #wait-guard span {
 position:static; width:auto; min-width:0; flex:1; padding:0; background:none; white-space:normal;
 font:inherit;
}
#hud.moribe-notices #wait-guard small {
 position:static; width:auto; min-width:0; white-space:normal; overflow-wrap:anywhere;
 font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
}
/* 手・説明・盾の三列を明示し、暗黙の三列目が説明の幅を奪わないようにする。 */
html.touch body #hud.moribe-notices #wait-guard {
 grid-template-columns:24px minmax(0, 1fr) 24px; column-gap:8px; row-gap:2px;
}
html.touch body #hud.moribe-notices #wait-guard svg:first-child {
 width:24px; height:32px;
}
html.touch body #hud.moribe-notices #wait-guard svg + svg {
 width:24px; height:32px;
}
html.touch body #hud.moribe-notices #wait-guard :is(span,small) {
 width:auto; min-width:0; white-space:normal; overflow-wrap:anywhere;
 font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
}
/* 矢を避ける移動釦の長文を折り返す。押す範囲と左右の設定は共通のまま。 */
html.touch body #hud.moribe-notices button.cover-guide.hold-cover {
 width:232px; max-width:calc(100vw - 48px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
}
html.touch body #hud.moribe-notices button.cover-guide.hold-cover span {
 white-space:pre-line; overflow-wrap:anywhere; max-width:100%;
}
/* 同じ目的地の文字札は任務一枚にまとめ、地面の旗と向きの印を残す。 */
#hud.moribe-notices #markers .mk.main:not(.person-goal) { display:none !important; }
/* 共通の親指側・中央の固定指定より優先し、森部の下知を知らせ欄へ収める。 */
html:root body #hud.moribe-notices #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important; min-width:0 !important;
}
/* 防御の説明は端の釦にまとめ、上の札には組の下知を残す。 */
html.touch body #hud.moribe-notices.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:has(.guard-caption) {
 display:none !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
 display:block !important;
}
@media (min-height:501px) {
 html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
  width:min(560px, calc(100vw - 32px)); height:auto; max-height:min(640px, 72dvh);
 }
 html body #hud.moribe-notices #intro:has(#intro-go) .intro-reading {
  flex:0 1 auto;
 }
 /* 雨の野へ操作の字を透かさず、指揮と回避の押す釦を読めるようにする。 */
 html:not(.touch) body #hud.moribe-notices:not(.ending):not(:has(#intro:not([hidden]))) #h-bottom {
  opacity:1;
 }
 html:not(.touch) body #hud.moribe-notices #h-bottom .slot {
  background:#14120f;
 }
 html body #hud.moribe-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(104px + env(safe-area-inset-top, 0px)) !important; width:min(320px, 32vw) !important;
  bottom:auto !important; transform:none !important;
  max-height:calc(100dvh - 344px) !important; overflow-y:auto;
  overscroll-behavior:contain; pointer-events:auto;
 }
}
/* 欄の高さに合わせて札を押し潰さず、長い下知は欄全体を送って読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
 flex:0 0 auto; min-height:0; max-height:none !important; overflow:visible;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .obj-now,
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
 max-height:none !important; overflow:visible !important; white-space:normal !important;
}
/* 共通の行ごとの墨より優先する。森部は任務と補足を一枚で読み、空の黒帯を残さない。 */
html body #hud.moribe-notices:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:#14120f !important; padding:8px !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-now,small),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 background:none !important; padding:0;
}
/* 向き直る操作は本文と操作欄に残す。空白だけの補足と手の図を別の黒帯にしない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place.facing-help:has(.facing-gesture),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small:is([hidden],.notice-muted,:empty),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:is([hidden],:empty) {
 display:none !important;
}
/* 着いた後の人数・待つ理由も、任務を開かず読めるようにする。 */
#hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) li.cur small:not(.goal-place):not([hidden]):not(.notice-muted):not(:empty) {
 display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.6;
 color:#ece4d2;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small:not(.goal-place) {
 white-space:pre-line !important;
}
@media (max-height:500px) {
 /* 長押しの説明を二段で読める幅にし、槍列の高さを大札で覆わない。字の拡大時は折り返す。 */
 html.touch body #hud.moribe-notices #wait-guard {
  width:232px; min-height:64px;
 }
 /* 横向きでも勝つ条件まで読める高さと幅を取り、出陣の釦は縮めない。 */
 html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
  width:min(680px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
  padding:12px 16px; gap:8px;
 }
 #hud.moribe-notices #intro .intro-reading p { margin:6px 0; }
 #hud.moribe-notices #intro-go { flex:0 0 auto; }
 /* 矢の警告は上の空きへ。任務と下知の札にはかぶせない。 */
 html.touch body:has(#hud.moribe-notices) #rain-mark {
  top:calc(env(safe-area-inset-top, 0px) + 8px) !important;
  max-width:calc(100vw - 400px); box-sizing:border-box;
  font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
  line-height:1.4; letter-spacing:0 !important;
 }
 /* 共通の高さ制限で切らず、一つの欄を指で送る。子の札を縮めず、開いた任務は共通の表示を使う。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
  width:min(304px, 40vw) !important; transform:none !important;
  max-height:min(48vh, calc(100dvh - 164px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
  overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) {
  flex:0 0 auto; max-height:none !important; overflow:visible;
  display:flex !important; flex-direction:column;
  background:#14120f !important; padding:8px !important;
 }
 /* 組の任務を先に読み、敵一人への操作は小さい補足として続ける。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list {
  order:0;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
  order:1; margin-top:4px;
  font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 /* 向き直る補足も任務欄に収める。大きな手の図で前列と到着人数を押し出さない。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.turn-coach:not(.expand) {
  position:relative !important; inset:auto !important;
  width:100% !important; max-width:100% !important; padding:8px !important;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action :is(.approach-gesture,.turn-gesture) {
  display:none !important;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #battle-message {
  flex:0 0 auto; min-height:0; max-height:none !important; overflow:visible;
  pointer-events:auto;
 }
 /* 出陣の補足が釦の裏へ潜らないよう、本文の末尾に余白を残す。 */
 #hud.moribe-notices #intro:has(#intro-go) .intro-reading {
  overflow-y:auto; box-sizing:border-box; padding-bottom:16px; scroll-padding-bottom:16px; touch-action:pan-y;
 }
}
`;
    document.head.appendChild(noticeStyle);
    // 共通処理から直接出る褒美の札も含め、森部の札は同じ秒に二つまで。
    const hud = rt.hud, hudBark = hud.bark, hudBanner = hud.banner, hudSay = hud.say, hudRects = hud.hudRects;
    // 先手と戦う間は赤い三角だけ。味方へ戻る古い矢印を重ねない。
    const combatSignsOnly = () => rt.flags.stage === 'contact' && !rt.flags.vBroken && !rt.flags.squadGuide;
    const hudBattleGoal = hud.drawBattleGoal, hudFootDirection = hud.drawFootDirection;
    hud.drawBattleGoal = function (g, battle) {
      // 命中は相手の赤い▼で示す。胴に別の印を重ねない。
      if (battle === rt) {
        const pin = rt.def.missionPin(rt);
        if (combatSignsOnly() || !pin || pin.arrived && !pin.waiting) return false;
      }
      return hudBattleGoal.call(this, g, battle);
    };
    hud.drawFootDirection = function (g, battle, target) {
      if (battle === rt && combatSignsOnly()) return false;
      return hudFootDirection.call(this, g, battle, target);
    };
    const hudPlayerSign = hud.drawPlayerSign;
    // 本人は肩越しに見える。白い二重輪を待機場所と取り違えさせず、川の向こうの印だけ残す。
    hud.drawPlayerSign = function (g, battle) {
      return battle === rt ? false : hudPlayerSign.call(this, g, battle);
    };
    // 敵と命中の反応は共通の赤い▼だけ。別の白い印を重ねない。
    const hudEnemyOutline = hud.drawEnemyOutline;
    hud.drawEnemyOutline = function (g, u, battle, guarding) {
      return battle === rt ? false : hudEnemyOutline.call(this, g, u, battle, guarding);
    };
    // 開始案内の強調指定も小さな印へそろえる。判定の半径と遮蔽の確認は変えない。
    const hudFootRing = hud.drawTargetFootRing;
    hud.drawTargetFootRing = function (g, battle, pos, scale = 1, person = false, prominent = false, guardPost = false) {
      return battle === rt
        ? hudFootRing.call(this, g, battle, pos, Math.min(scale, 0.65), person, false, guardPost)
        : hudFootRing.call(this, g, battle, pos, scale, person, prominent, guardPost);
    };
    // 待機専用の描画は smallTaskAreas を通らないため、森部では同じ小さな足元印へ渡す。
    // 地面の起伏・遮蔽と表示の上限は共通の印に任せ、待機判定の広さは保つ。
    const hudWaitFrame = hud.drawWaitFrame;
    hud.drawWaitFrame = function (g, battle, pos, radius) {
      return battle === rt ? this.drawTargetFootRing(g, battle, pos, 0.65)
        : hudWaitFrame.call(this, g, battle, pos, radius);
    };
    // 共通の矢の警告は画面全体の子。森部だけ、印と敵の警告が避ける箱へ加える。
    // 元の四分の一秒の測定を使い、同じ箱へ重複して足さない。
    let measuredRects = null;
    hud.hudRects = function () {
      const rects = hudRects.call(this);
      if (this.rt !== rt || rects === measuredRects) return rects;
      measuredRects = rects;
      const mark = document.getElementById('rain-mark');
      if (mark && !mark.hidden) {
        const box = mark.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          rects.push(box);
          this.rectsAll = rects.concat(this.mkRects);
        }
      }
      return rects;
    };
    let cardSecond = -1, cardCount = 0;
    const takeCard = () => {
      const second = Math.floor(rt.t);
      if (second !== cardSecond) { cardSecond = second; cardCount = 0; }
      if (cardCount >= 2) return false;
      cardCount++; return true;
    };
    const warnings = {
      shaken: { at: -99, n: 0, lines: ['組が動揺している。旗のそばで声をかけよ', '組の足が止まった。仲間を励ませ', '槍の列が乱れた。旗の下へ組を集めよ'] },
      surrounded: { at: -99, n: 0, lines: ['囲まれた！　味方の旗へ下がれ', '敵が四方にいる。味方の列へ戻れ', '退く道が狭い。組と一緒に抜けよ'] },
    };
    hud.bark = function (text, warn) {
      if (this.rt !== rt) return hudBark.call(this, text, warn);
      if (/使いが\s*味方へ向かった/.test(text)) return; // 任務とは別の使いを追わせない。
      if (/が遅れている（待つか、道を空けて呼べ）/.test(text)) text = '仲間が遅れている。その場で待つと追いつく';
      const w = /組が動揺/.test(text) ? warnings.shaken : /囲まれた|四方から敵|後ろにも敵|取り籠め/.test(text) ? warnings.surrounded : null;
      if (w && rt.t - w.at < 30) return;
      if (!takeCard()) return;
      if (w) { w.at = rt.t; text = w.lines[w.n++ % w.lines.length]; }
      return hudBark.call(this, text, warn);
    };
    hud.banner = function (text, sub) {
      if (this.rt !== rt) return hudBanner.call(this, text, sub);
      if (takeCard()) return hudBanner.call(this, text, sub);
      const phase = rt.phase;
      rt.after(1, () => { if (hud.rt === rt && rt.phase === phase) hud.banner(text, sub); });
    };
    hud.say = function (speaker, text, dur, urgent, detail) {
      if (this.rt !== rt) return hudSay.call(this, speaker, text, dur, urgent, detail);
      clearOldSpeech(rt);
      // 使番と任務の下知は雑談より先に読む。八秒の間引きは共通処理を使う。
      const accepted = hudSay.call(this, speaker, text, dur, urgent, detail);
      if (accepted) for (const line of this.subQ) if (line.moribeStage === undefined) {
        line.moribeStage = rt.flags.stage || 'brief'; line.moribeEnding = !!rt.flags.ending;
      }
      return accepted;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.bark = hudBark; hud.banner = hudBanner; hud.say = hudSay; hud.hudRects = hudRects;
      hud.drawPlayerSign = hudPlayerSign; hud.drawWaitFrame = hudWaitFrame;
      hud.drawBattleGoal = hudBattleGoal; hud.drawFootDirection = hudFootDirection;
      hud.drawEnemyOutline = hudEnemyOutline;
      hud.drawTargetFootRing = hudFootRing;
      hud.root.classList.remove('moribe-notices'); noticeStyle.remove();
      return dispose.call(this);
    };
    // 柴田の悔やみは、共通の討死処理へ渡す本当の味方の死に一度だけ結ぶ。
    const onKill = rt.army.hooks.onKill, say = rt.say;
    let fallenAt = -99, fallen = 0, mourned = 0;
    rt.army.hooks.onKill = (v, k) => {
      if (v.team === rt.player.u.team && !v.alive && !v.civ && !v.isStruct && !v.isPlayer) { fallen++; fallenAt = rt.t; }
      return onKill(v, k);
    };
    rt.say = function (speaker, text, dur) {
      if (/^(?:柴田)?勝家$/.test(speaker) && /無念|仲間を失った|嘆くのは後/.test(text)) {
        if (fallen <= mourned || rt.t - fallenAt > 2) return;
        mourned = fallen;
      }
      return say.call(this, speaker, text, dur);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { rain: 'HIST_A', crossing: 'HIST_A', spearBattle: 'HIST_A', commanders: 'HIST_A', nagara: 'HIST_B', paddy: 'HIST_B', formation: 'GAME_C', reserveWaves: 'GAME_C', ford: 'GAME_C' };
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    rt.firstFights = false;
    rt.flags.rescued = true;   // 倒れてから体力を戻して戦列へ復帰する救済を、この戦では使わない。
    // 渡河の移動は総攻めの合図ではない。森部の下知が出るまで隊の太鼓を鳴らさない。
    // 隊の行き先の細かな直しでは鳴らさない。両軍を合わせて三十二秒あけ、字は出さない。
    const signalStages = [null, null], signalKinds = [null, null];
    rt.army.hooks.onSignal = (g, kind, at) => {
      const F = rt.flags;
      if (!F.signal || rt.over || F.ending || F.quiet || g.hidden || g.hideFlags) return;
      if ((F.signalSoundAt ?? -99) + 32 > rt.t) return;
      if (signalStages[g.team] === F.stage && signalKinds[g.team] === kind) return;
      signalStages[g.team] = F.stage; signalKinds[g.team] = kind;
      F.signalSoundAt = rt.t;
      rt.army.playFar(`sig_${kind}`, at, 0.9);
    };
    // 槍列で囲む戦。山場を一騎打ちの札で覆わず、組と戦い続ける。
    rt.army.hooks.canDuel = () => false;
    // 仲間が遠くで討った首を、自分に催促しない。自分の討ち取りも近くで一度だけ知らせる。
    const bark = rt.bark;
    rt.bark = function (text, warn) {
      if (text === '証がない。近くで首を袋に納めよ') {
        const record = this.meritKills?.find((r) => r.src.isPlayer && !r.foe.alive && !r.foe.gone && !r.head &&
          !r.witnesses.length && r.foe !== this.flags.proofNoted &&
          Math.hypot(r.foe.pos.x - this.player.u.pos.x, r.foe.pos.z - this.player.u.pos.z) < 12);
        if (!record) return;
        this.flags.proofNoted = record.foe;
        text = '討った敵の証がない。近くで首を袋に納めよ';
      }
      return bark.call(this, text, warn);
    };
    // 深手の退避中も、近くの敵は共通処理で戦い続ける。
    // 公記の森部は織田の大勝。味方の兵（自分と組を除く）への打ち込みを少し浅くし、勝ち戦の芯が溶けないようにする。
    const damage = rt.army.damage;
    rt.army.damage = function (t, amount, src, ...rest) {
      if (t && t.team === 0 && !t.isPlayer && !t.group?.isPlayerSquad && src?.team === 1) amount *= 0.7;
      const hp = t?.hp;
      const result = damage.call(this, t, amount, src, ...rest);
      if (src?.isPlayer && t?.team !== src.team && t.hp < hp) {
        // 命中後は少し形を保ってから戻す。乱戦でも一瞬の変化で終わらせない。
        t.moribeHitUntil = rt.t + 1.8;
        // 命を減らした本人だけがよろめく。空振りや味方には反応を付けない。
        if (t.alive) {
          t.stagger = Math.max(t.stagger || 0, .6);
          // 当たった体を小さく押し戻し、重なった隣の兵と反応を見分ける。
          if (t.push && !t.mounted && !t.isStruct) {
            const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            t.push.x += dx / d * .7; t.push.z += dz / d * .7;
          }
        }
      }
      return result;
    };
    const n = Math.min(24, RANKS[rt.G.rank].squad || 5);
    rt.makeSquad({ x: START2.x + 5, z: START2.z - 3 }, Math.PI, [{ kind: 'spear', n }]);   // 組は右前で一緒に流れへ入る
    // 三手は楡俣川の南岸に並び、遊び手と同じ流れを渡る。柴田・本備・森の備は勝ち戦の芯なので、
    // 兵は討たれても隊ごとの総崩れはしない（右手の小勢は崩れうる）。
    rt.flags.A = allyGroup(rt, { name: '柴田の前備', fixed: true, anchor: { x: 32, z: 98 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 1, o: { name: '源八', invuln: true } }, { type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true } }]);
    rt.flags.B = allyGroup(rt, { name: '本備', fixed: true, anchor: { x: -22, z: 116 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 24 }, { type: 'bow', n: 2 }, { type: 'samurai', n: 2 }]);
    // 上役の源八は戦の後に城下で昇進を告げる。この戦では討たれない。
    rt.flags.moribeOfficer = rt.flags.A.units.find((u) => u.name === '源八');
    // 小勢が横に広がりすぎず、槍の前線へ合流する（細かな隊の位置は復元）。
    rt.flags.R3 = allyGroup(rt, { name: '右手の備', fixed: true, anchor: { x: 52, z: 104 }, facing: Math.PI, aggro: 10, morale: 100, noRout: false, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 1 }]);
    rt.flags.Y = allyGroup(rt, { name: '森の横備え', fixed: true, anchor: { x: -48, z: 108 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'busho', n: 1, o: { name: '森可成', invuln: true } }]);
    // 斎藤の先手は北岸の畦へ寄せ、渡る織田勢へ矢を射かけてから槍で受ける（弓の数は復元）。
    rt.flags.V = enemyGroup(rt, { faction: 'saito', name: '斎藤の先手', fixed: true, anchor: { x: 30, z: 48 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: false, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 26 }, { type: 'bow', n: 4 }, { type: 'samurai', n: 2 }]);
    // 日比野下野守の備え（足立六兵衛を含む）
    rt.flags.M = enemyGroup(rt, { faction: 'saito', name: '日比野の備', fixed: true, anchor: { x: -14, z: -30 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 18 }, { type: 'samurai', n: 2 }, { type: 'samurai', n: 1, o: { name: '足立六兵衛' } }, { type: 'bow', n: 3 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', name: '長井の備', fixed: true, anchor: { x: -44, z: -34 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 2 }]);
    // 両将は備の後ろで旗本の侍に囲まれて控え、槍の押し合いの後に自ら前へ出る（位置と人数は復元）。
    // 大将の生きている間は旗本が踏みとどまる。両将の首が勝ち戦の山場（公記：両将を含む百七十余人討死）。
    rt.flags.HM = enemyGroup(rt, { faction: 'saito', name: '日比野下野守の旗本', fixed: true, anchor: { x: -8, z: -54 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HN = enemyGroup(rt, { faction: 'saito', name: '長井甲斐守の旗本', fixed: true, anchor: { x: -36, z: -58 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HM.hatamoto = rt.flags.HN.hatamoto = true;
    // 畦道沿いの持ち場で迎え撃つ。広い野へ味方を追い続けさせない。
    for (const g of [rt.flags.HM, rt.flags.HN]) {
      g.noAI = true; g.noPursue = true;
    }
    for (const [x, z] of [[30, 124], [-30, 126], [0, 120]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    for (const [x, z] of [[0, -96], [-34, -90], [-60, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));

    // 曇天の明るさを保ち、土からの照り返しを抑えて軒裏と具足の陰を分ける。
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'storm') {
        look.hemiI = 1.65;
        look.hemiGround.setHex(0x4c4638);
        look.sunI = 1.65;
        look.sunDir.set(-.48, .78, .4).normalize();
        look.vis = Math.max(look.vis, 360);
      }
      return look;
    };
    // 足元の草も低い若葉へ。森部の出陣時だけ既存の形と材質を調整する。
    if (W.nearGrass) {
      W.nearGrass.geometry.scale(1, 0.65, 1);
      W.nearGrass.material.color.setHex(0x8fa783);
    }
    // 浅い田の足跡を大きな白い輪と玉にしない。川の水しぶきは残し、既存の形を使う。
    if (W.footWaves) {
      W.footWaves.mesh.geometry.scale(0.55, 1, 0.55);
      W.footWaves.mesh.material.opacity = 0.14;
    }
    if (W.sprayP) W.sprayP.points.material.uniforms.scale.value *= 0.65;
    // 槍がぶつかる野へ烏を降ろさない。近い簡易な翼が黒い破片に見えるのも避ける。
    // 上空の群れは既存の更新で飛ばし、兵と争う所へ寄せる着地先だけを止める。
    const birdSpot = W.birdSpot;
    W.birdSpot = function (flock, focus) {
      return rt.over ? birdSpot.call(this, flock, focus) : null;
    };
    // 雨量・濡れ・雨音は保つ。手前の太い板を描かず、細い線を半分にして薄くする。
    W.updateNearRain = function () { this.rainNear.visible = false; };
    const updateWorld = W.update;
    W.update = function (dt, focus) {
      updateWorld.call(this, dt, focus);
      if (!this.rain.visible) return;
      this.rain.geometry.setDrawRange(0, Math.floor(this.rain.geometry.drawRange.count / 4) * 2);
      this.rain.material.opacity *= 0.65;
      // 泥の跳ねを白い草のように野一面へ並べない。既存の線を少数だけ描く。
      this.splashPts.geometry.setDrawRange(0, Math.floor(this.splashT.length / 4) * 6);
      this.splashPts.material.color.setHex(0x807d70);
      this.splashPts.material.opacity = 0.18 * this.rainLevel;
    };
    // 公記は開戦当日の雨を記す。渡河中に晴れから雨へ変わる演出にしない。
    W.setTime('storm'); W.setRainTarget(0.65);
    W.rainLevel = W.wetness = 0.65;
    rt.setPhase('brief');
    rt.banner('雨の森部（もりべ）、敵は川の向こう', '黄色い杭の間を歩いて渡れ');
    rt.obj('point', '黄色い杭の間を歩いて渡れ', 'main');
    rt.marker('point', POINT2, () => rt.flags.pointInside ? 'ここで仲間を待つ' : '向こう岸の矢印の輪へ',
      { guideArea: 'wait', guideRadius: FORD_R });
    rt.zone('point', POINT2.x, POINT2.z, FORD_R);
    rt.say('隊長 源八（げんぱち）', '黄色い杭の間が浅瀬だ。向こう岸の印まで歩いて渡れ', 5);
    // 公記：勘当の身の前田利家が、許しなく森部に加わり首を挙げた。
    rt.after(17, () => { if (!rt.flags.ending && !rt.over) rt.bark('仲間「勘当の前田利家殿まで、槍を持って駆けつけたぞ」'); });
    rt.flags.point = POINT2;
    rt.flags.friends = [rt.flags.A, rt.flags.B, rt.flags.Y, rt.flags.R3];
    // 控えは開戦時からここにいる。後の段では追加せず、持ち場から歩いて出す。
    rt.flags.reserves = [[-44, -76, '長井の控え'], [12, -80, '日比野の控え']].map(([x, z, name]) =>
      enemyGroup(rt, { faction: 'saito', name, fixed: true, anchor: { x, z }, facing: 0, formation: 'yari', yariRanks: 3,
        aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 2 }]));
    rt.flags.opposition = [rt.flags.V, rt.flags.M, rt.flags.N, ...rt.flags.reserves, rt.flags.HM, rt.flags.HN];
    rt.flags.taskTick = 0;
    rt.flags.moribePin = { x: POINT2.x, z: POINT2.z, r: FORD_R, hide: FORD_R };
    rt.flags.linePoint = { x: FRONT2.x, z: FRONT2.z };
    // 公記では斎藤勢は墨俣から森部口へ出る。墨俣側は北、細かな布陣は復元。
    // 南北の会戦の並びは保つ。実兵は既に寄せた備、遠景は広い野に残る備として置く。
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      // 大きな控えは三つの槍組に分け、間に通り道を残す（割り振りは復元）。
      // 同じ人数を同じ一枚の描画で扱い、槍と旗が一つの黒い塊になるのを避ける。
      const sonae = count >= 500 && kind === 'spear' ? [-1, 0, 1].map((side, i) => ({
        right: side * 27, front: i === 1 ? 3 : -3, w: 22, d,
        kind: 'spear', banners: 1,
        count: Math.floor(count / 3) + (i < count % 3 ? 1 : 0),
      })) : null;
      // 分けた組にも兵種を渡す。省くと混成の備えになり、鉄砲と騎馬が混ざる。
      // 大幟は各組一本。背の小旗と合わせ、兵の顔と槍列を布で塞がない（本数は復元）。
      return W.addDistantArmy({ x, z, w: sonae ? 76 : w, d: sonae ? d + 6 : d, count, facing, armor, flag, mon: flag, seed, kind, sonae, terrainRanks: true, banners: 1, near: true, host: false, flagRate: 0.12 });
    };
    const KS = ['spear', 'bow', 'spear', 'spear', 'cavalry', 'spear', 'bow', 'honjin', 'spear'];
    // 安八町の伝承は千五百対六千。軽い両翼と後続を含め、敵の厚みを約四倍に見せる。
    // https://www.town.anpachi.lg.jp/0000000392.html
    // 同じ人数の三備を雨の中景へ寄せ、残る後続は北の奥に保つ。配置は復元。
    // 墨俣側の控え。龍興本人の出陣を確かな事として描かない。
    F.farS = [[-86, -64], [-168, -360], [-30, -88], [74, -70], [136, -320], [-180, -240], [100, -260], null, [-100, -440]]
      .map((q, i) => {
        if (!q) return null;
        const army = DA(q[0], q[1], 52, KS[i] === 'bow' ? 12 : (KS[i] === 'honjin' ? 44 : 24), KS[i] === 'cavalry' ? 80 : KS[i] === 'bow' ? 220 : 600, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i]);
        // 寄せた描画用の三備から実兵を増やさず、任務と難しさを保つ。
        if (i === 0 || i === 2 || i === 3) army.noWake = true;
        return army;
      }).filter(Boolean);
    const KO = ['spear', 'bow', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-192, 580], [-100, 640], [0, 640], [-40, 500], [-260, 570]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'bow' ? 6 : 12, KO[i] === 'cavalry' ? 12 : 40, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 楡俣川を同じ時に渡る織田の後続（軽い作り）。合図で前へ出る。
    F.farX = [[-110, 96, 160], [-170, 100, 120], [86, 110, 120]]
      .map(([x, z, n], i) => DA(x, z, 34, 10, n, Math.PI, KT.ARMOR.oda, 'oda', 40 + i, 'spear'));
    F.farO.push(...F.farX);
    // 濃尾の野は平らで、雨の日は遠い山並みが見えない（灰色の空に山の形の穴が開いて見えるのを防ぐ）。
    if (W.mountains) W.mountains.visible = false;
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.odaCamp = camp(rt, { x: CAMP2.x, z: CAMP2.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', haori: 0x7a1d14 }, guard: 15, reserve: 0, runTo: { x: -20, z: 60 } });
    // 両翼の後方に控えの幕。白幟だけの野に、地面へ接した陣の横の輪郭を置く。
    // 所在は復元。戦う帯・控えの進路から外し、新たな兵や障害物を増やさない。
    for (const [x, z] of [[-58, -30], [64, -28]]) {
      W.addGroundShade(x, z, 22, 12, 0, .3);
      rt.scene.add(jinmaku(W, x, z, 20, 10, 8, { mon: 'saito', solid: false }));
      for (const dx of [-11, 11]) rt.scene.add(nobori(W, x + dx, z - 4, 'saito', 5.5));
    }
    // 陣幕の口と向きが逆でも、実兵の旗本は敵の来る北側を守る。
    const guard = F.odaCamp.guard, shift = CAMP2.z - 13 - guard.anchor.z;
    guard.anchor.z = CAMP2.z - 13;
    for (const u of guard.units) { u.pos.z += shift; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    F.odaCamp.guard.formation = 'yari';
    rt.scene.add(nobori(W, -12, CAMP2.z + 6, 'eiraku', 5.5));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 両翼の槍の前線。音・旗・煙の仕組みは共通の呼び口を使う。
    // 中央の実兵の両脇へ同じ人数を寄せ、前列同士の空白を短くする。実兵化と難しさは保つ。
    F.fronts = [-19, 21].map((x, i) => clash(rt, { x, z: i ? 38 : 30, facing: Math.PI, w: 26, gap: 2.5, gap0: 16, seed: 231 + i,
      groundedMelee: true,   // 同じ兵数の押し合いから、既存の泥跳ねと低い飛沫の霞を出す。
      measuredMelee: true,   // 前列の踏み込みと後列の詰め、押し返しの時間差を共通の動きで出す。
      noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
      noWake: true, noRout: false, killRate: 0.3, nearHide: 0, host: false,
      // 両翼は奥行きの深い槍列。背の旗を減らし、実兵の背後を白い布で塞がない。
      // 大幟・兵数・並び・押し合いの進みは保つ（指物の割合は復元）。
      A: { flag: 'oda', armor: KT.ARMOR.oda, count: 100, kind: 'spear', team: 0, faction: 'oda', flagRate: 0.08, bannerStride: 12 },
      B: { flag: 'saito', armor: KT.ARMOR.saito, count: 400, kind: 'spear', team: 1, faction: 'saito', flagRate: 0.08, bannerStride: 12 } }));
    // 重複する後方軍勢は足さない。備え表の控えは上の遠景と開戦時の実兵へ結ぶ。
    // 序盤から川向こうの敵が見える。射かける音は実際の弓兵に任せる。
    for (const [x, z] of [[20, 54], [42, 52], [30, 48]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.after(4, () => {
      const V = rt.flags.V;
      if (gone(V)) return;
      V.speed = 2.1;   // 雨の畦を先手が北岸へ寄せてくる。
      V.order = 'move'; V.dest = { x: 30, z: 60 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 18; g.anchor = { x: 30, z: 60 }; };
      if (!rt.flags.signal) rt.marker('V', centerOf(V), '斎藤の先手', { red: true, group: V });
      rt.say('足軽', '向こう岸に斎藤の先手！　岸へ寄せてくるぞ！', 3);
    });
    buildBattleJin(rt);
    moribeCloth(rt);
    // 備え表の結び直しで弓混じりの横陣に戻っても、三列の槍組を保つ。
    for (const g of [...F.friends, ...F.opposition]) { g.formation = 'yari'; g.yariRanks = 3; }
    for (const g of rt.squadGroups) { g.formation = 'yari'; g.yariRanks = 2; }
    // 三手も遊び手と並んで楡俣川を渡り、北岸の畦に槍をそろえる。
    for (const [g, x, z] of [[F.A, 20, 60], [F.B, -22, 70], [F.Y, -40, 60], [F.R3, 64, 66]]) {
      g.leader = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
      g.order = 'move'; g.dest = { x, z }; g.speed = 2;
      g.onArrive = (u) => { u.order = 'hold'; };
    }
  },

  update(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    nagashinojo.kit.backTick(rt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    // 時刻で言わせず、実際に腿ほどの水へ入った瞬間だけ知らせる。
    // 水深は描いた川面を使う。歩みの遅さと足元のしぶきも共通の水の処理へ結ぶ。
    if (!F.fordVoice && Math.abs(p.z - nireZ(p.x)) < 9 && rt.world.waterFootDepthAt(p.x, p.z, p.y) >= 0.4) {
      F.fordVoice = true;
      rt.hud.bark('仲間「砂色の浅瀬を進め。向こう岸の印で待ってくれ」');
    }
    // 渡河の到着だけはピンと同じコマで反映する。隊の見直しの一秒を待たせない。
    if (!F.signal) {
      // 一度渡った後は北岸全体を到着済みとする。小旗を通り越しても戻らせない。
      F.pointInside = atFordBank(p);
      if (F.pointInside) F.pointReached = true;
    }
    // 任務と隊の見直しは一秒ごと。毎コマ配列や行き先を作らない。
    F.taskTick -= dt;
    if (F.taskTick > 0) return;
    if (rt.player.u.alive && !rt.choice) this.autoSquadOrder(rt);
    quietOtherFlags(rt, !F.signal || F.stage === 'press' || F.stage === 'assemble' ? null : F.stage === 'hold' ? !gone(F.B) && F.B : !gone(F.A) && F.A);
    const elapsed = F.lastTask === undefined ? 1 : rt.t - F.lastTask;
    F.lastTask = rt.t; F.taskTick = 1;
    // 人数と画面から見た方向を一秒ごとに更新。視界外でも仲間が消えたと見せない。
    let squadAlive = 0, squadNear = 0, squadAcross = 0, trailing = null, trailDist = 0;
    for (const u of rt.squad) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget || u.group?.routed) continue;
      squadAlive++;
      const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (distance < 16) squadNear++;
      if (Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) < 16) squadAcross++;
      if (distance > trailDist) { trailDist = distance; trailing = u; }
    }
    const atPoint = atFordBank(p);
    F.squadContext = !F.signal
      ? atPoint ? `自分は到着・仲間 ${squadAcross}／${squadAlive}人が到着` : `仲間 ${squadNear}／${squadAlive}人がついてくる`
      : `仲間：そばに${squadNear}／${squadAlive}人`;
    if (F.signal && trailing && trailDist >= 16) F.squadContext += '\n' + moribeDestination(rt, trailing.pos, `離れた仲間まで約${Math.ceil(trailDist / .75)}歩`);
    clearOldSpeech(rt);
    if (!F.breathUsed && F.signal && rt.player.u.hp > 0 && rt.player.u.hp < 30 && rt.G.difficulty !== 'hard') {
      F.breathUsed = true; F.breathUntil = rt.t + 12;
      rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
      rt.bark('深手だ。仲間を呼び、南の畦へ下がれ', true);
    }
    // 使番の足を速めず、まだ前の下知を守っている理由を伝える。
    const waitingOrder = rt.squadGroups?.some((g) => g.pending?.id === 'attack' || g.pending?.id === 'follow');
    if (!!waitingOrder !== !!F.attackOrderWaiting) {
      F.attackOrderWaiting = !!waitingOrder;
      // 号令を続けて出しても、往復の知らせで任務を埋めない。
      if (rt.t >= (F.orderNoticeAt || 0)) {
        F.orderNoticeAt = rt.t + 32;
        rt.bark(waitingOrder ? '隊長の合図を仲間へ伝えている' : '隊長の合図が仲間に届いた');
      }
    }
    // 届いた号令と、列や地形で止まる理由を分けて記録する。一秒に一度だけ。
    for (const g of rt.squadGroups || []) {
      const st = g.moribeOrderStatus || (g.moribeOrderStatus = {});
      let ready = 0, fighting = 0, blocked = 0, rear = 0, moving = 0;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut) continue;
        ready++;
        if (u.target?.alive && !u.target.isStruct) fighting++;
        if (u.pressBack || u._gated) rear++;
        if (u.moving > 0.1) moving++;
        const want = u.moveTo || g.slotPos(u.slot, g.initial);
        if (rt.army.wallBetween(u.pos, -1, want) || !rt.world.walkable(want.x, want.z)) blocked++;
      }
      st.order = g.pending ? '使番が向かっている' : g.order;
      st.ready = ready; st.fighting = fighting; st.blocked = blocked; st.rear = rear; st.moving = moving;
      st.target = g.focus?.name || g.units.find(u => u.alive && u.target?.alive)?.target?.group?.name || '';
      const reason = g.pending || moving || !ready ? '' : blocked ? '畦を回る。旗のそばへ寄れ！' : rear ? '前の槍を支えておる。列をそろえて押せ！' : fighting ? '敵の槍に止められておる。組で押し返せ！' : '';
      if (reason && reason !== st.reason && rt.t >= (F.squadStopSayAt || 0)) {
        rt.bark(`仲間「${reason}」`); F.squadStopSayAt = rt.t + 32;
      }
      st.reason = reason;
    }
    if (F.signal && (F.friends.every(gone) || F.odaCamp.general?.woundOut)) {
      if (!F.collapseWarn) { F.collapseWarn = rt.t; rt.bark('味方の備が崩れた。仲間を呼び、川の方へ下がれ', true); }
      if (rt.t >= 240 && rt.t - F.collapseWarn >= 30 && rt.canFailMission()) { this.endBattle(rt, false); return; }
    }
    let friendDist = Infinity;
    for (const g of F.friends) if (!gone(g)) { const c = g.center(); friendDist = Math.min(friendDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    let squadDist = Infinity;
    for (const g of rt.squadGroups) if (!gone(g)) { const c = g.center(); squadDist = Math.min(squadDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    const separated = F.signal && rt.t >= 30 && rt.t - F.signal >= 30 && F.stage !== 'assemble' &&
      (friendDist > 40 || (squadDist !== Infinity && squadDist > 40));
    // 一度示した仲間は合流まで保つ。四十歩の境で消したり別人へ移したりしない。
    let squadGuide = F.squadGuide;
    if (squadGuide && (F.stage === 'assemble' || !squadGuide.alive || squadGuide.gone || squadGuide.fleeing ||
        squadGuide.woundOut || squadGuide.rearWound || squadGuide.noTarget || squadGuide.group?.routed)) squadGuide = null;
    let squadGuideDist = squadGuide ? Math.hypot(squadGuide.pos.x - p.x, squadGuide.pos.z - p.z) : Infinity;
    if (!squadGuide && separated) for (const u of rt.squad) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.group?.routed) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < squadGuideDist) { squadGuideDist = d; squadGuide = u; }
    }
    if (squadGuideDist < 16) squadGuide = null;
    if (F.squadGuide !== squadGuide) {
      F.squadGuide = squadGuide;
      if (squadGuide) rt.marker('squadReturn', () => F.squadGuide?.pos, '離れた仲間・そばで呼べ');
      else rt.unmark('squadReturn');
    }
    const separateText = squadDist !== Infinity && squadDist > 40
      ? F.squadGuide ? '仲間が遠い。仲間の印へ迎えに行け' : '仲間を呼び集め、味方の黄色い旗へ戻れ'
      : '味方の列から離れた。仲間と黄色い旗へ戻れ';
    if (separated && !(F.separateSayAt > rt.t)) {
      F.separateSayAt = rt.t + 32; rt.bark(separateText, true);
    }
    const u = rt.player.u;
    if (!F.signal) {
      let alive = 0, near = 0;
      const arrivals = F.fordArrivals || (F.fordArrivals = []);
      arrivals.length = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed) {
        alive++;
        const remaining = Math.max(0, Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) - 16);
        if (!remaining) near++;
        arrivals.push(remaining / Math.max(.5, u.group?.speed || 1.5));
      }
      arrivals.sort((a, b) => a - b);
      const waitSeconds = Math.max(1, Math.ceil(arrivals[Math.ceil(alive * .6) - 1] || 0));
      F.pointReady = alive === 0 || near >= Math.ceil(alive * 0.6);
      if (F.pointInside) {
        F.fordWaitMax = Math.max(F.fordWaitMax || 1, waitSeconds);
        F.fordGatherProgress = F.pointReady ? 1 : Math.max(F.fordGatherProgress || 0, 1 - waitSeconds / F.fordWaitMax);
      }
      // 実際に六割が岸へ着いたらすぐ合図。集合の後に秒待ちを重ねない。
      // 集結中にも先手は寄せてくる。「待て」だけで無防備に立たせない。
      const approaching = rt.army.nearestEnemy(rt.player.u, 8, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      F.fordThreat = !!(approaching && sightPoint(rt, approaching.pos));
      if (!F.pointDone) {
        const ready = F.pointReady;
        const task = rt.objectives.find((o) => o.id === 'point');
        if (task) {
          if (!F.pointInside) task.text = F.pointReached ? '仲間と集まれ' : '川を渡れ';
          else if (F.fordThreat) task.text = 'この場所で仲間と敵を迎え撃て';
          else if (!ready) task.text = `仲間を待て（目安${waitSeconds}秒）`;
          else task.text = '仲間がそろった、味方と進め';
        }
        rt.objProgress('point', '');
      }
      if (!F.pointDone && F.pointInside && F.pointReady) {
        F.pointDone = true; rt.objDone('point'); rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
        rt.award((t) => { t.c.point = 1; }, '渡河して組をそろえた');
      }
      if (!F.fordNudge && rt.t > 20 && !F.pointReached) { F.fordNudge = true; orderSpeech(rt, '黄色い杭の間を通り、向こう岸の印まで進め', 4); }
      if (F.pointDone || (F.pointInside && F.fordThreat) || F.pointReached && rt.t >= 45) this.signal(rt);
      return;
    }
    this.feedReserves(rt);
    this.advanceEnemies(rt);
    this.advanceFriends(rt);
    if (F.stage === 'contact') {
      if (rt.t - F.signal >= 12) nearbyVoice(rt, F.A, '柴田勝家', 'shibataVoice', '槍を並べよ！　川を背に、一人も取り残すな！');
      if (!F.vBroken && gone(F.V)) this.onRout(rt, F.V);
      rt.objProgress(F.vBroken ? 'support' : 'break', '');
      // 先手が退いた時点で本備と控えを寄せる。次の斬り合いを待ってから下知しない。
      if (F.vBroken) {
        rt.objRemove('break'); rt.unmark('V');
        rt.objRemove('support'); rt.unmark('support');
        moribeHoldPoint(rt);
        F.stage = 'hold'; F.holdStart = rt.t; F.lineT = 0;
        rt.setPhase('hold'); rt.banner('槍を打ち合わせる', '雨の中、両軍が押し合う');
        rt.obj('line', '印へ仲間と集まれ', 'main');
        rt.marker('line', () => F.linePoint, () => F.lineT >= 25 ? '本備の横・列を支えた。控えに備えよ' : '守る印・仲間と守れ', { hideNear: 24, hideOnArrival: true }); rt.zone('line', F.linePoint.x, F.linePoint.z, 24);
        orderSpeech(rt, '印へ集まれ。印に着いたら、その場で敵を迎え撃て', 5);
        for (const g of [F.M, F.N]) if (!gone(g)) { if (g.order !== 'move') g.order = 'attack'; g.seekRange = 30; }
      }
    } else if (F.stage === 'hold') {
      const el = rt.t - F.holdStart;
      if (el >= 12) nearbyVoice(rt, F.Y, '森可成', 'moriVoice', '横はわしらが支える！　組で槍を合わせよ！');
      let together = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 16) together++;
      const closeEnemy = rt.army.nearestEnemy(rt.player.u, 16, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      const insideLine = Math.hypot(p.x - F.linePoint.x, p.z - F.linePoint.z) < 24;
      const lineReady = (together > 0 || squadAlive === 0) && insideLine && !gone(F.B);
      F.lineTogether = together; F.lineReady = lineReady;
      // 退く下知と、旗で待つ秒読みを同時に出さない。退避中は働きの確認も休める。
      const fallingBack = F.breathUntil > rt.t || u.mobbed || gone(F.B);
      if (lineReady && !fallingBack) F.lineT += elapsed;
      // 敵がいる時もいない時も任務は守備。攻撃を禁じる「待て」は出さない。
      const holdSeconds = Math.max(1, Math.ceil(100 - el));
      const lineAction = F.breathUntil > rt.t ? '退く道の印へ下がる' : gone(F.B) ? closeEnemy ? '構えながら、南の畦へ下がれ' : '南の畦へ下がる' : u.mobbed ? '味方と列をそろえ直せ' : !insideLine ? '印へ仲間と集まれ' : `到着。この場を守れ（反撃まで最長${holdSeconds}秒）`;
      const task = rt.objectives.find((o) => o.id === 'line');
      if (task) task.text = lineAction;
      const guardHelp = closeEnemy && lineReady && !fallingBack && !F.squadGuide ? '。印に到着。味方とこの場を守れ' : '';
      rt.objProgress('line', '');
      if (F.lineT >= 25 && !F.lineAwarded) { F.lineAwarded = true; rt.award((t) => t.side.push('槍の押し合いを支えた'), '槍列を支えた。控えにも備えよ'); }
      // 組で列を支え、二手の控えを受けた働きが反撃を早める。時間だけで手柄は付けない。
      const counterattack = F.lineAwarded && el >= 45 &&
        (F.wave1 || gone(F.reserves[0])) && (F.wave2 || gone(F.reserves[1]));
      // 前の槍列がすべて退けば、控える旗本だけを残して百秒待たせない。
      const frontBroken = gone(F.V) && gone(F.M) && gone(F.N) && F.reserves.every(gone);
      const enemyBroken = F.opposition.every(gone);
      if (el >= 100 || counterattack || frontBroken || enemyBroken) {
        if (F.lineT >= 25) { rt.objDone('line'); }
        else rt.objFail('line');
        rt.objRemove('line'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line');
        F.stage = 'press'; F.pressStart = rt.t; rt.setPhase('press');
        rt.banner(enemyBroken ? '敵が退いた' : counterattack ? '組の働きで、反撃へ' : '大将の旗本へ', enemyBroken ? '深追いせず、列を保て' : counterattack ? '支えた槍列が、両将の旗本へ押し出す' : '長井甲斐守・日比野下野守の旗が、雨の向こうに残る');
        rt.obj('commanders', (F.bossDown || 0) < 2 ? '長井甲斐守・日比野下野守を討て' : '味方と進み、残る敵を押せ', 'main');
        orderSpeech(rt, enemyBroken ? '敵は退いた。組を離すな。残る旗を見届けよ' : counterattack ? 'お主の組が列を支えた！　陣太鼓の早打ちじゃ、味方と押し出して両将の旗本を囲め！' : '陣太鼓の早打ちじゃ！　長井と日比野の旗本へ、味方と並んで押すぞ。一人で走るな！', 5);
        if (!enemyBroken) {
          moribeSignal(rt, 'kakari');
          // 長い押し合いで両将も手負い。旗本に守られても、囲めば討てる。
          for (const g of [F.HM, F.HN]) if (!gone(g)) {
            g.speed = 2.2; g.seekRange = 8;
            g.order = 'hold'; g.dest = null; g.onArrive = null;
            for (const u of g.units) if (u.type === 'busho' && u.alive) u.hp = Math.min(u.hp, u.maxHp * 0.5);
            // 大将の後ろに控えていた後備が雨の中から続き、大将の周りが入り乱れる（見える兵は250まで）。
            const live = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
            if (live < 210) {
              const c = g.center();
              g.rear = enemyGroup(rt, { faction: 'saito', name: g === F.HM ? '日比野の後備' : '長井の後備', fixed: true,
                anchor: { x: c.x + (g === F.HM ? 8 : -8), z: c.z - 26 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, morale: 90, noRout: true, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }]);
              g.rear.speed = 2.3;
              F.opposition.push(g.rear);
            }
          }
          battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.HM.anchor, F.HM, 1, true, '長井甲斐守・日比野下野守が、旗本を率いて自ら前へ出た');
          // 柴田の二の備が後ろから追いつき、自分の左右で大将の旗本へ槍を入れる。
          if (rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0) < 215) {
            const p = rt.player.u.pos;
            const g2 = allyGroup(rt, { name: '柴田の二の備', fixed: true, anchor: { x: p.x + 6, z: p.z + 22 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 2 }]);
            g2.order = 'attack'; g2.seekRange = 45; g2.speed = 2.4;
            F.friends.push(g2);
          }
        }
        for (const g of F.friends) if (!gone(g)) { g.calm = false; g.order = 'attack'; g.seekRange = 35; }
      }
    } else if (F.stage === 'press') {
      if (rt.t - F.pressStart >= 8) nearbyVoice(rt, F.HM, '日比野下野守', 'hibinoVoice', '日比野下野守はここじゃ！　旗を捨てるな、槍で押し返せ！');
      if (rt.t - F.pressStart >= 20) nearbyVoice(rt, F.HN, '長井甲斐守', 'nagaiVoice', 'まだ退かぬ！　旗本、わしに続け！');
      // 大将が長く討たれぬ時は、乱戦の別の所で織田の兵に討たれる（公記どおり両将とも討死。戦が終わらない事も防ぐ）。
      // 一人ずつ（七十五秒と百秒）。同じ瞬間に二つの見出しを重ねない。
      const fall = rt.t - F.pressStart >= 100 ? 2 : rt.t - F.pressStart >= 75 ? 1 : 0;
      if ((F.bossDown || 0) < fall && !(F.bossFallAt > rt.t)) {
        const u = F.HM.units.find((x) => x.type === 'busho' && x.alive) || F.HN.units.find((x) => x.type === 'busho' && x.alive);
        if (u) { F.bossFallAt = rt.t + 5; rt.army.kill(u, null); }
      }
      if (!F.standDown && fall >= 2) { F.standDown = true; for (const g of F.opposition) g.noRout = false; }
      // 総大将の討死・側面攻撃・逃亡の連鎖は共通の士気の仕組みに任せる。
      let left = 0, commanders = 0, target = null, remainingName = '';
      for (const g of F.opposition) if (!gone(g)) {
        left++; if (!target) target = g;
        for (const u of g.units) if (u.type === 'busho' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) { commanders++; remainingName = u.name; }
      }
      // 敗走を確かめる八秒も、任務の見出しと下知をそろえる。
      const task = rt.objectives.find((o) => o.id === 'commanders');
      if (task) task.text = (F.bossDown || 0) < 2 ? commanders > 1 ? '長井甲斐守・日比野下野守を討て' : commanders === 1 ? `${remainingName}を討て` : '味方と両将の旗本を攻めよ' : !left ? '川への道を守り、戻る合図を待て' : '仲間と残る敵と戦え';
      // 大将が生きている備を先に指す。印は大将の身に付け、旗本の侍に囲まれた所を見せる。
      for (const g of F.opposition) if (!gone(g) && g.units.some((u) => u.type === 'busho' && u.alive && !u.fleeing)) { target = g; break; }
      if (target !== F.marked) {
        F.marked = target;
        const boss = target?.units.find((u) => u.type === 'busho' && u.alive);
        if (boss) rt.marker('commanders', () => boss.alive && !boss.fleeing ? boss.pos : centerOf(target)(), `${boss.name}の旗本`, { red: true, group: target });
        else if (target) rt.marker('commanders', centerOf(target), '斎藤の旗', { red: true, group: target });
        else rt.unmark('commanders');
      }
      // 進む印と任務は同じ大将一人を指す。二人分の長い官名を並べない。
      const markedBoss = F.marked?.units.find((u) => u.type === 'busho' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
      if (task && markedBoss && !F.squadGuide) task.text = `${markedBoss.name}を仲間と討て`;
      rt.objProgress('commanders', '');
      if (!left && !F.routWaitSaid && (F.bossDown || 0) < 2) { F.routWaitSaid = true; orderSpeech(rt, '敵は引いた。ほかの手の敗走を確かめるまで、川への道を守れ', 4); }
      if (left) F.routConfirmT = null;
      else if (F.routConfirmT == null) F.routConfirmT = rt.t;
      // 両将が討たれて崩れたら、湿地を逃げる斎藤勢を組で追う（森部の見せ場＝追撃）。
      //   一番近い逃げる兵へピンを付ける。二十秒か、近くに逃げる兵がいなくなったら集結へ。
      F.pursuing = F.bossDown >= 2 && !left;
      if (F.pursuing) {
        if (!F.pursueSaid) {
          F.pursueSaid = true; moribeSignal(rt, 'kakari');
          rt.say('源八', '斎藤勢が崩れたぞ！　ぬかるみで足が鈍っておる、追え！', 4);
          F.asmPre = !gone(F.A) ? { ...fightingCenter(F.A) } : { x: p.x, z: p.z };
        }
        let best = null, bd = 90;
        for (const u of rt.army.units) {
          if (!u.alive || u.gone || u.team === rt.player.u.team || !u.fleeing || u.noTarget) continue;
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (d < bd) { bd = d; best = u; }
        }
        F.pursueTarget = best;
        const task = rt.objectives.find((o) => o.id === 'commanders');
        if (task) task.text = '逃げる敵を追う';
        rt.objProgress('commanders', '');
      }
      if (F.bossDown >= 2 && !left && rt.t - F.routConfirmT >= (F.pursueTarget ? 22 : 15)) {
        F.pursuing = false; F.pursueTarget = null;
        F.sBack = true; F.stage = 'assemble'; F.assembleStart = rt.t; F.assembleT = 0;
        F.squadGuide = null; rt.unmark('squadReturn');
        // 集結は柴田の旗の下（遠い元の畦まで歩かせない）。柴田の備が無ければ自分の居る所。
        { const c = F.asmPre || (!gone(F.A) ? fightingCenter(F.A) : p); F.asm = { x: c.x, z: c.z }; }
        rt.objDone('commanders'); rt.objRemove('commanders'); rt.unmark('commanders');
        rt.banner('斎藤勢、崩れる', '旗が倒れ、北へ退いていく');
        battleEvent(rt, EVENT_RETREAT, FRONT2, null, 1, true, '斎藤勢が墨俣の方へ退き始めた');
        F.farS.forEach((m, i) => rt.after(i * 1.2, () => m.rout({ hideAfter: 0 })));
        F.fronts.forEach((c) => c.rout('B', { hideAfter: Infinity }));
        moribeSignal(rt, 'atsumare');
        rt.obj('assemble', '仲間と旗へ戻る', 'main');
        rt.marker('assemble', F.asm, '戻る場所の旗'); rt.zone('assemble', F.asm.x, F.asm.z, 12);
        orderSpeech(rt, 'もう追うな。仲間と戻る場所の旗へ戻れ。そろったら川への道を見張れ', 4);
        for (const g of F.friends) if (!gone(g)) { g.order = 'move'; g.dest = { x: F.asm.x + (g === F.Y ? -26 : g === F.R3 ? 26 : g === F.A ? -8 : -16), z: F.asm.z };
          g.onArrive = (u) => { u.order = 'hold'; }; }
      }
    } else if (F.stage === 'assemble') {
      let alive = 0, near = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && !u.group?.routed) { alive++; if (Math.hypot(u.pos.x - F.asm.x, u.pos.z - F.asm.z) < 18) near++; }
      // 旗で同じ号令を繰り返させず、離れた仲間まで迎えに行けるようにする。
      // 呼びに向かった後は相手を保つ。合流したら旗へ戻り、元の六割・八秒の条件で確かめる。
      const previous = F.gatherUnit;
      if (previous && (!previous.alive || previous.gone || previous.fleeing || previous.woundOut || previous.rearWound || previous.noTarget || previous.group?.routed ||
          Math.hypot(previous.pos.x - F.asm.x, previous.pos.z - F.asm.z) < 18 || Math.hypot(previous.pos.x - p.x, previous.pos.z - p.z) < 6)) F.gatherUnit = null;
      if (!F.gatherUnit && near < Math.ceil(alive * 0.6) && Math.hypot(p.x - F.asm.x, p.z - F.asm.z) < 12) {
        let distance = Infinity;
        for (const u of rt.squad) {
          if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.group?.routed || Math.hypot(u.pos.x - F.asm.x, u.pos.z - F.asm.z) < 18) continue;
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (d < distance) { distance = d; F.gatherUnit = u; }
        }
      }
      if (previous !== F.gatherUnit) {
        F.gatherCalled = false;
        if (F.gatherUnit) rt.marker('gatherSquad', () => F.gatherUnit?.pos, '離れた仲間・近くで呼べ');
        else rt.unmark('gatherSquad');
      }
      const danger = rt.army.nearestEnemy(rt.player.u, 30, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      if (danger && sightPoint(rt, danger.pos) && !(F.pursuerAt > rt.t)) {
        F.pursuerAt = rt.t + 8;
        const dx = danger.pos.x - p.x, dz = danger.pos.z - p.z;
        rt.bark(`${Math.abs(dx) > Math.abs(dz) ? dx > 0 ? '東' : '西' : dz > 0 ? '南' : '北'}の追手が近い。味方と押し返せ`);
      }
      // 移動命令の終わりでなく、生きて戦列に残る兵の帰着を数える。
      // 畦の端で止まった隊も、持ち場に六割が着けば集結したと扱う。
      let returning = 0;
      for (const g of F.friends) if (!gone(g)) {
        const x = F.asm.x + (g === F.Y ? -26 : g === F.R3 ? 26 : g === F.A ? -8 : -16);
        let count = 0, arrived = 0;
        for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget) {
          count++; if (Math.hypot(u.pos.x - x, u.pos.z - F.asm.z) < 18) arrived++;
        }
        if (arrived < Math.ceil(count * 0.6)) returning++;
      }
      const othersReady = returning === 0;
      if (!danger && Math.hypot(p.x - F.asm.x, p.z - F.asm.z) < 12 && near >= Math.ceil(alive * 0.6)) F.assembleT += elapsed;
      else F.assembleT = 0;
      const task = rt.objectives.find((o) => o.id === 'assemble');
      if (task) task.text = F.gatherUnit ? '矢印の仲間を迎えに行け' : Math.hypot(p.x - F.asm.x, p.z - F.asm.z) >= 12 ? '戻る印へ仲間と集まれ' : '仲間とここで川への道を守れ';
      rt.objProgress('assemble', '');
      if (F.bossDown >= 2 && othersReady && F.assembleT >= 8) this.endBattle(rt, true);
    }
    if (!F.longWarn && rt.t >= 390) { F.longWarn = true; orderSpeech(rt, F.stage === 'assemble' ? '集結が遅れておる。旗の下へ組を呼べ。そろわねば任務を果たせぬ' : '攻めが長引いておる。備が崩れねば、組を川へ下げるぞ', 4); }
    if (!F.ending && rt.t >= 420) this.endBattle(rt, false);
  },

  feedReserves(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    let near = 0;
    for (const g of F.opposition) {
      if (gone(g) || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2)) continue;
      for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 30) near++;
    }
    // 前線が薄くなったら、段の時計より先に下知する。二手は十秒以上ずらす。
    const thin = rt.t - F.signal >= 25 && near <= 6;
    for (let i = 0; i < F.reserves.length; i++) {
      const warned = i ? 'wave2Warn' : 'wave1Warn', sent = i ? 'wave2' : 'wave1';
      if (F[sent] || gone(F.reserves[i])) continue;
      if (i && !gone(F.reserves[0]) && (!F.wave1 || rt.t - F.wave1At < 10)) continue;
      const due = F.stage === 'hold' && rt.t - F.holdStart >= (i ? 22 : 0);
      if (F[warned] === undefined && (due || thin || (!i && F.vBroken))) {
        F[warned] = rt.t;
        rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
        rt.bark(i ? '斎藤の控えがまた来る。味方の列で迎えよ。退くなら南の畦だ' : '斎藤の控えが来る。味方の列で迎えよ。退く道は南の畦だ', true);
      }
      if (F[warned] !== undefined && rt.t - F[warned] >= 4) {
        F[sent] = true; F[i ? 'wave2At' : 'wave1At'] = rt.t; this.reserve(rt, i);
      }
    }
  },

  advanceEnemies(rt) {
    const F = rt.flags;
    if (F.stage === 'assemble') return;
    const flag = rt.squadGroups.find((g) => !gone(g));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    const aim = Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    for (const g of F.opposition) {
      if (gone(g) || g.hatamoto || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2)) continue;
      if (g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && u.target?.alive && !u.target.gone &&
          !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      if (Math.hypot(c.x - aim.x, c.z - aim.z) <= 8) {
        // 前列は着いている。後列の到着待ちで「移動」の探索六歩に閉じ込めない。
        g.order = 'attack'; g.seekRange = 35; g.onArrive = null;
        continue;
      }
      const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
      dest.x = aim.x + (g === F.N || g === F.reserves[0] ? -6 : 6); dest.z = aim.z - 6;
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePushArrive || (g._moribePushArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  advanceFriends(rt) {
    // 「攻める」だけでは探索の外の敵へ歩かず、古い畦へ戻り続ける。
    // 先手の後も同じ兵が前へ続く。本備は会戦の範囲で自分の後ろを支える。
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    for (const g of F.friends) {
      if (gone(g) || (g.order !== 'attack' && g.order !== 'move') || g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.target?.alive && !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      const escort = g === F.B && Math.hypot(p.x - FRONT2.x, p.z - FRONT2.z) < 65 &&
        Math.hypot(p.x - c.x, p.z - c.z) > 18;
      let nearest = null, distance = Infinity;
      // 任務の印は一つでも、味方の備は二手の旗本を囲む。
      // 前備と右手は日比野、本備と横備えは長井へ。片方が退いたら残る備へ回る。
      // 距離だけで選ぶと四隊とも近い旗本に重なり、敵が味方の肩に埋もれる。
      const assigned = g === F.A || g === F.R3 ? F.HM : F.HN;
      if (F.stage === 'press') for (const foe of F.opposition) {
        if (!foe.hatamoto || gone(foe)) continue;
        if (!gone(assigned) && foe !== assigned) continue;
        const q = fightingCenter(foe), d = Math.hypot(q.x - c.x, q.z - c.z);
        if (d < distance) { nearest = q; distance = d; }
      }
      if (!nearest) for (const foe of F.opposition) {
        if (gone(foe) || (foe.hatamoto && F.stage !== 'press') ||
            (foe === F.reserves[0] && !F.wave1) || (foe === F.reserves[1] && !F.wave2)) continue;
        const q = fightingCenter(foe), d = Math.hypot(q.x - c.x, q.z - c.z);
        if (d < distance) { nearest = q; distance = d; }
      }
      if (!escort && (!nearest || distance <= 18)) {
        if (nearest) { g.order = 'attack'; g.seekRange = 35; g.onArrive = null; }
        continue;
      }
      const dest = g._moribePressDest || (g._moribePressDest = { x: 0, z: 0 });
      if (escort) { dest.x = p.x - 8; dest.z = p.z + 8; }
      else {
        // 横の備は敵の左右へ寄せ、中央の味方を横切って同じ一点へ詰めない。
        const flank = g === F.Y ? -10 : g === F.R3 ? 10 : 0;
        dest.x = nearest.x + ((c.x - nearest.x) * 12 - (c.z - nearest.z) * flank) / distance;
        dest.z = nearest.z + ((c.z - nearest.z) * 12 + (c.x - nearest.x) * flank) / distance;
      }
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePressArrive || (g._moribePressArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  signal(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.signal) return;
    F.signal = rt.t; F.stage = 'contact'; rt.setPhase('contact');
    // 合図の後は先手が岸の遊び手へ寄せる。古い持ち場で待ち続けない。
    if (!gone(F.V)) { F.V.order = 'attack'; F.V.seekRange = 35; F.V.aggro = 18; F.V.onArrive = null; }
    if (!F.pointDone) rt.objFail('point');
    rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
    rt.tutEnd();
    moribeSignal(rt, 'kakari');
    rt.after(2.2, () => {
      if (!rt.over && !F.ending && F.stage === 'contact' && !gone(F.A))
        rt.army.playFar('toki', fightingCenter(F.A), 0.8);
    });
    rt.banner('仲間と前の敵を迎え撃て', '赤い三角は敵。印のない兵は味方');
    rt.obj('break', '赤い三角の敵と戦え', 'main');
    rt.marker('V', centerOf(F.V), '斎藤の先手', { red: true, group: F.V });
    rt.marker('frontFlag', () => !gone(F.A) ? fightingCenter(F.A) : !gone(F.B) ? fightingCenter(F.B) : null,
      '前備の旗・味方に続け', { minor: true, hideNear: 16, hideOnArrival: true });
    orderSpeech(rt, '法螺貝と陣太鼓の早打ちじゃ！　鬨を上げ、前備に続け。槍の列を切らすな！', 4);
    for (const g of F.friends) if (!gone(g)) { g.onArrive = null; g.order = 'attack'; g.seekRange = 40; }
    // 中央も隊ごとに前へ出す。左右は中央を突っ切らず、それぞれの畦から横へ回る。
    for (const [g, x, z] of [[F.A, 18, 40], [F.B, -12, 44], [F.Y, -46, 22], [F.R3, 50, 30]]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x, z };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    }
    F.V.noRout = false;
    for (const g of [F.M, F.N]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g === F.M ? -12 : -44, z: 8 }; g.speed = 2.1;
      // 大将の旗本も備のすぐ後ろへ詰め、押し合いの間は旗を立てて控える。
      const h = g === F.M ? F.HM : F.HN;
      h.order = 'move'; h.dest = { x: g === F.M ? -8 : -36, z: -28 }; h.speed = 1.8;
      h.onArrive = (a) => { a.order = 'hold'; };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 40; };
    }
    // 先手が戦う間に既存の控えを本備の後ろまで歩かせる。初めの斬り合いには加えない。
    for (let i = 0; i < F.reserves.length; i++) {
      const g = F.reserves[i];
      g.order = 'move'; g.dest = { x: i ? 8 : -32, z: i ? -20 : -14 }; g.speed = 2.1;
      g.onArrive = (arrived) => { arrived.order = 'hold'; };
    }
    F.fronts.forEach((c) => c.go());
    F.farO.forEach((m, i) => rt.after(i * 1.3, () => m.advance(24, 18)));
    battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.A.anchor, F.A, 0, true, '織田の槍の列が前へ出た');
  },

  reserve(rt, index) {
    const g = rt.flags.reserves[index];
    if (gone(g)) return;
    const flag = rt.squadGroups.find((squad) => !gone(squad));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    const aim = Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
    dest.x = aim.x + (index ? 6 : -6); dest.z = aim.z - 6;
    g.order = 'move'; g.dest = dest; g.speed = 2.1;
    g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    battleEvent(rt, EVENT_REINFORCEMENT, g.center(), g, 1, false, '斎藤の控えが前へ出る');
  },

  endBattle(rt, won) {
    const F = rt.flags;
    // 七分の期限・味方の崩壊は戦固有の決着。近くの敵で共通の待ち時間を延ばさない。
    if (!won && rt.t < 420 && (!rt.canFailMission() || rt.t < 240)) return;
    if (rt.over || F.ending) return;
    F.ending = true; rt.tracker.main = won;
    F.squadGuide = null; rt.unmark('squadReturn');
    if (!won) for (const g of F.friends) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g.anchor.x, z: 116 }; g.onArrive = (u) => { u.order = 'hold'; };
    }
    if (F.stage === 'assemble') {
      if (won && F.assembleT >= 8) { rt.objDone('assemble'); rt.award((t) => t.side.push('勝った後も組をまとめた'), '勝った後も組をまとめた'); }
      else rt.objFail('assemble');
    } else { rt.objFail(F.stage === 'hold' ? 'line' : F.stage === 'contact' ? 'break' : 'commanders'); }
    rt.unmark('frontFlag'); rt.unmark('support'); rt.objRemove('support');
    rt.unmark('assemble'); rt.unmark('gatherSquad'); F.gatherUnit = null; rt.unzone('assemble'); rt.unmark('commanders'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line'); rt.unmark('V');
    rt.banner(won ? '森部の勝ち戦' : '仲間と川へ下がれ', won ? '敵が退き、組の持ち場を固めた' : F.friends.every(gone) || F.odaCamp.general?.woundOut ? '味方の備が崩れた。残る者と川へ退け' : F.stage === 'assemble' ? '組の集結を果たせなかった。川への道を守りながら退け' : '攻めが長引いた。敵の備が残るため川へ退け');
    orderSpeech(rt, won ? 'よう押し切った。組を離すな。勝鬨を上げるぞ' : '低い法螺貝と二つ打ちの太鼓は退けの合図じゃ。仲間と川へ下がり、備えを立て直せ', 4);
    if (won) {
      // 雨が細り、勝鬨。首実検と次の戦（墨俣）への引きで余韻を残す。
      rt.world.setRainTarget?.(0.25);
      rt.after(2, () => { sfx('victory', 0.9); rt.bark('織田勢「えい、えい、おう！」'); });
      rt.marker('yakushi', YAKUSHI2, '森部の薬師堂・場所と姿は復元');
      rt.after(5, () => {
        // 首実検は共通の首袋・証人の記録に従う。利家へ手柄を付け替えない。
        let confirmed = false, who = '';
        for (const r of rt.meritKills || []) {
          if (r.foe.name !== '足立六兵衛') continue;
          if (r.src.isPlayer) { who = 'player'; break; }
          if (r.src.name !== '前田利家') continue;
          const witness = r.witnesses.some((u) => u.alive && !u.fled && !u.fleeing);
          const head = r.head && r.carrier?.alive && !r.carrier.fled && !r.carrier.fleeing;
          if (head || witness) { confirmed = true; break; }
        }
        F.toshiieAdachiConfirmed = confirmed;
        rt.say('仲間', who === 'player' ? '首取り足立と呼ばれた六兵衛を、お主が討ったとは……' : confirmed ? '前田又左衛門殿が、首取り足立の首を挙げなされた。勘当も解けような' : '前田又左衛門殿も首を挙げたと聞いた。勘当の身で、ようやるわ', 4.5);
      });
      rt.after(10, () => rt.say('隊長 源八（げんぱち）', `${(F.bossDown || 0) >= 2 ? '長井も日比野も討たれた' : '長井と日比野の備は崩れた'}。次は墨俣で足場を守るぞ。美濃への道は、まだ続く`, 5));
    }
    const failureReason = won ? '' : F.friends.every(gone) || F.odaCamp.general?.woundOut
      ? '味方の列が崩れ、川岸を守れなくなった'
      : F.stage === 'assemble' ? '時間内に組と味方の集結を終えられなかった'
      : '時間内に敵を押し返せなかった';
    rt.finish({ scriptedEnd: true, failureReason }, won ? 16 : 11);
    // 終幕の共通音が鳴った後に札を出す。同じ退けの音を札からもう一度鳴らさない。
    if (!won) rt.obj('withdraw', '低い法螺貝と退き太鼓で、仲間と川へ退け', 'main', true);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.V && F.signal && F.stage === 'contact' && !F.vBroken) {
      moribeHoldPoint(rt);
      F.vBroken = true; rt.unmark('V'); rt.objDone('break'); rt.objRemove('break');
      rt.obj('support', '印へ仲間と集まれ', 'main');
      rt.marker('support', () => !gone(F.B) ? F.linePoint : !gone(F.A) ? fightingCenter(F.A) : null, '守る印・ここで敵を迎え撃て');
      rt.award((t) => t.side.push('斎藤の先手を押し返した'), '斎藤の先手を押し返した');
      orderSpeech(rt, '目の前の敵は退いた。印へ集まれ。矢印が消えたら次の敵を待つぞ', 4);
    }
    if (!F.ending && !rt.over && (g === F.M || g === F.N) && sightPoint(rt, g.center())) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, true, '斎藤の備が崩れた');
  },

  onKill(rt, v, k) {
    if (v.name === '足立六兵衛' && k?.name === '前田利家' && !rt.flags.toshiieReport) {
      rt.flags.toshiieReport = true; rt.flags.toshiieAdachi = true;
      if (sightPoint(rt, v.pos)) rt.say('足軽', '利家殿が足立六兵衛を討ったぞ！', 3);
    }
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group?.hatamoto) {
      const F = rt.flags;
      F.bossDown = (F.bossDown || 0) + 1;
      // 公記：長井甲斐守・日比野下野守とも討死。名を呼ばわり、残る備の足をすくませる。
      rt.banner(`${v.name}、討死`, F.bossDown >= 2 ? '両将が討たれた。斎藤勢が浮き足立つ' : 'もう一人の大将の旗が残る');
      rt.say(k?.isPlayer ? rt.G.name || '自分' : '足軽', k?.isPlayer ? `${v.name}、討ち取ったり！` : `${v.name}を討ち取ったぞ！`, 4);
      if (k?.isPlayer) rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 40 }; }, `${v.name}を討ち取った`, v.pos);
      sfx('toki', 0.9);
      // 大将の生きている間は旗本が踏みとどまる。討たれた備から崩れ、両将が討たれれば全体が揺らぐ。
      v.group.noRout = false;
      if (v.group.rear) v.group.rear.noRout = false;
      if (F.bossDown >= 2) for (const g of F.opposition) g.noRout = false;
      for (const g of F.opposition) if (!gone(g)) g.morale = Math.max(0, (g.morale ?? 80) - (g === v.group ? 45 : F.bossDown >= 2 ? 40 : 15));
      F.marked = null;
    }
  },
  onPlayerHit(rt, t) {
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に仕掛けた'), '命令違反：合図の前に仕掛けた');
      orderSpeech(rt, '槍をそろえるまで待て！');
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に突撃を命じた'), '命令違反：合図の前に突撃を命じた');
      orderSpeech(rt, 'まだじゃ！　組をそろえよ！');
    }
  },
};

// 遊び手の代わりに動かす時も、同じ段と札に従う。
moribe.botOrders = true;   // 渡河・持ち場・反撃の待ちを、性格の突進で上書きしない。
moribe.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  if (!u.alive || F.ending) return;
  const sq = b.squadGroups[0];
  const gathering = !F.signal || F.stage === 'assemble';
  const liningUp = !F.signal && F.pointInside && F.pointReady;
  const gatherOrder = liningUp ? 'hold' : 'follow';
  const calling = F.gatherUnit && !F.gatherCalled && Math.hypot(F.gatherUnit.pos.x - u.pos.x, F.gatherUnit.pos.z - u.pos.z) < 10;
  if (sq && gathering && !sq.pending && (sq.order !== gatherOrder || calling) && !(b.botCmdT > b.t)) {
    inp.e.add(liningUp ? 'KeyX' : 'KeyZ'); b.botCmdT = b.t + 5;
    if (calling) F.gatherCalled = true;
  }
  // 構えは正面だけに効く。最寄りの兵より、実際に打ち込む相手を先に受ける。
  let attacker = null, attackDist = 10;
  if (b.army.threats) for (const o of b.army.threats) {
    if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < attackDist) { attacker = o; attackDist = d; }
  }
  // 戦場で実際に落馬した馬だけを拾う。開戦時の空馬は置かない。
  if ((!gathering || (F.pointDone && !F.signal)) && !attacker && !p.mounted && p.mountT <= 0 && !b.army.nearestEnemy(u, 8)) {
    let horse = p.catching?.o || null, hd = gathering ? 6 : 12;
    if (!horse) for (const o of b.army.looseHorses || []) {
      if (!o.from || !o.h.parent || o.mode === 'fled') continue;
      if (gathering && Math.hypot(o.h.position.x - POINT2.x, o.h.position.z - POINT2.z) >= 8) continue;
      const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
      if (d < hd) { hd = d; horse = o; }
    }
    if (horse) {
      if (p.lock) inp.e.add('KeyQ');
      inp.runHeld = false;
      if (p.catching) {
        inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      } else if (hd < 3) inp.e.add('KeyR');
      else goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
      return;
    }
  }
  if (gathering && !attacker) { const q = F.stage === 'assemble' ? (F.gatherUnit?.pos || F.asm || ASSEMBLY2) : POINT2; goTo(p, inp, q.x, q.z, 5); return; }
  if (F.breathUntil > b.t) {
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, RETREAT2.x, RETREAT2.z, 5);
    if (sq && sq.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
    return;
  }
  // 退ける間が終わった後の手当ては共通の頭に任せる。自然回復はないので、
  // 体力が四分の三へ戻るまで待つと、畦で背を向けたまま戦えなくなる。
  // 押し合いの持ち場にいる敵へ寄る。十四歩の外で戦う敵を見落として、畦で待ち続けない。
  // 構えを解いて突くまで、届く相手を保つ。近い兵が入れ替わるたびに
  // 半秒の反撃待ちを消すと、敵が大勢いても一度も突けない。
  const previous = p.botStrikeFoe;
  const keep = p.botStrikeUntil > p.time && previous?.alive && !previous.noTarget && !previous.fleeing && !previous.invuln &&
    previous.team !== u.team && Math.abs(previous.pos.y - u.pos.y) < 3 &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.9 : 2.8) &&
    !b.army.wallBetween(u.pos, -1, previous.pos) &&
    (F.stage !== 'hold' || Math.hypot(previous.pos.x - FRONT2.x, previous.pos.z - FRONT2.z) < 38);
  const e = attacker || (keep ? previous : null) || b.army.nearestEnemy(u, F.stage === 'hold' || F.stage === 'press' ? 40 : 14,
    (o) => !o.noTarget && !o.fleeing && !o.invuln && o.type !== 'dummy' &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
      (F.stage !== 'hold' || Math.hypot(o.pos.x - FRONT2.x, o.pos.z - FRONT2.z) < 38));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (attacker) {
      // 他の打ち手がいなければ、長い振りかぶりに先の突きを合わせる。
      // 全ての振りかぶりで反撃待ちを消すと、槍を解く半秒が取れない。
      let opening = !u.mobbed && d < reach;
      if (opening) for (const o of b.army.threats) {
        if (o !== attacker && o.alive && !o.fleeing && o.team !== u.team &&
            Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= o.reach + 0.3 &&
            !b.army.wallBetween(u.pos, -1, o.pos)) { opening = false; break; }
      }
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      patientStrike(p, inp, e, d, opening);
    } else {
      if (!gathering && d > reach * 0.85 && !e.charging) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      patientStrike(p, inp, e, d);
    }
    // 遠い敵への突撃は、まず「移動」してから攻撃に変わる。
    // 三秒で言い直すと、四秒内の同じ号令を取り消す仕組みに掛かってしまう。
    if (!gathering && sq && sq.order !== 'attack' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 5; }
    return;
  }
  let q = FRONT2;
  if (F.stage === 'contact' && !gone(F.V)) q = F.V.center();
  if (F.stage === 'press') { const g = F.opposition.find((g) => !gone(g)); if (g) q = g.center(); }
  // 次の敵へ向かう間は組も連れて行く。前の戦場に残った組を迎えに戻る往復を防ぐ。
  if (sq && sq.order !== 'follow' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  goTo(p, inp, q.x, q.z, 4);
};
moribe.canSkip = () => '';   // 雨中の布陣から槍の会戦まで、同じ時計で進める。
moribe.rts = true;
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// 公記に時刻の指定はない。遊びの昼景を確定した時刻として表示しない。
moribe.date = () => `永禄四年五月十四日　${seasonOf('五月')}・雨（時刻不詳）`;
// 千五百対六千は伝承上の目安。公記の森部の記事自体には総兵数の記載がない。
// 残りの人数（kaito 10/23 稲生 21）。戦う実兵の減り方の割合で、目安の総数を減らす。
//   一人を何十人へ水増しせず、割合だけを使う。数え直しは一秒に一度。入れ物は使い回す。
function remainingForce(rt, a0, b0, aKeep, bKeep, out) {
  const F = rt.flags, c = F.forceCount || (F.forceCount = { at: -9, a: 0, b: 0, a0: 0, b0: 0 });
  if (rt.t - c.at >= 1) {
    c.at = rt.t; let a = 0, b = 0;
    for (const u of rt.army.units) {
      if (u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter') continue;
      if (!u.alive || u.gone || u.fleeing || u.woundOut) continue;
      if (u.team === rt.player.u.team) a++; else b++;
    }
    c.a = a; c.b = b; c.a0 = Math.max(c.a0, a); c.b0 = Math.max(c.b0, b);
  }
  const ra = c.a0 ? c.a / c.a0 : 1, rb = c.b0 ? c.b / c.b0 : 1;
  out.a = Math.round(a0 * (aKeep + (1 - aKeep) * ra) / 10) * 10; out.a0 = a0;
  out.b = Math.round(b0 * (bKeep + (1 - bKeep) * rb) / 10) * 10; out.b0 = b0;
  return out;
}
const MORIBE_FORCE = { a: 1500, a0: 1500, b: 6000, b0: 6000, aCaption: '約', bCaption: '約' };
moribe.force = (rt) => rt?.army && rt.player?.u ? remainingForce(rt, 1500, 6000, .8, .5, MORIBE_FORCE) : MORIBE_FORCE;
moribe.history = '信長公記の森部の記事は、五月十四日の雨、墨俣から長井甲斐守・日比野下野守が出たこと、信長が楡俣川を越え、長く槍を合わせたことを記す。両将を含む百七十余人が討たれた。前田利家が足立六兵衛を討ったとも記す。永禄四年とするのが通説だが、この記事そのものには年の記載がない。織田約千五百、斎藤約六千は伝承上の目安。川の位置や細かな布陣には諸説があり、浅瀬・畦の持ち場・控えの押し出す順は復元である。武将の呼び声と、組の働きで早まる反撃は遊びのための復元である。三手の細かな配分・将の持ち場・昼の明るさは確定できない。数刻の戦いを短い時間に縮め、見える兵も総勢全員を描くものではない。主人公は上役の下知で自分の槍組を動かす。組の任務失敗は史実の織田軍の敗北を意味しない。';
export { moribe };
