// t04b_ota/scene.js … 太田城の舞台（平地の城・周りの堤・出水の堰・水）。段の中身は s1〜s5
// 城は真ん中、堤は城から六十五歩の輪（土を盛った高まり）。北に城と堤をつなぐ土橋。
import * as THREE from 'three';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg, solidRect, tawara } from '../props.js';
import { allyGroup } from '../bhelp.js';
import { addSite } from '../map_sites.js';
import { rippleWater } from '../world_water.js';
import { liteMat } from '../world_vegetation_materials.js';
import { troops } from '../toyo15/kit.js';
import { sentries } from '../t04a_sengokubori/scene.js';

export const HASHIBA = { armor: 0x282420, flag: 'toyotomi' };
export const SAIKA = { armor: 0x302a24, flag: 'maru' };
export const P = {
  spawn: { x: -34, z: -112 }, camp: { x: -18, z: -104 },
  work: { x: -26, z: -62 },        // 築堤の所（堤の北西）
  pile: { x: -34, z: -80 },        // 土俵の山
  weir: { x: -46, z: -46 },        // 出水の堰
  breach: { x: 60, z: -18 },       // のちに崩れる東の堤
  bridge: { x: 0, z: -58 },        // 北の土橋（使者を迎える所）
  gate: { x: 0, z: -26 },          // 城の北の門
};
const clamp = (v) => Math.max(0, Math.min(1, v));
export function otaHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = -0.8 + 1.6 * clamp((34 - d) / 10);
  h += 3.2 * clamp(1 - Math.abs(d - 65) / 8);
  if (Math.abs(x) < 4 && z < -22 && z > -70) h = Math.max(h, 1.2);
  return h;
}
function fence(rt, seg, h = 2.4) {
  rt.scene.add(castleBoardFence(rt.world, seg, { h }));
  const s = solidSeg(...seg, 0.18); s.missileH = h; s.missileType = 'wood';
}
export const porters = (rt, name, at, n = 8) => {
  const g = allyGroup(rt, { faction: 'oda', name, anchor: at, width: 6, fixed: true, fullStrength: true, aggro: 0, seekRange: 0 },
    [{ type: 'porter', n, o: { armor: 0x4a4034, flag: null } }]);
  g.noAI = true; return g;
};
export function build(rt) {
  const F = rt.flags, W = rt.world;
  rt.scene.add(jinmaku(W, P.camp.x, P.camp.z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, P.camp.x, P.camp.z + 1));
  const camp = troops(rt, true, '秀吉の本陣', { x: P.camp.x, z: P.camp.z + 1 }, [{ type: 'ashigaru', n: 10 }, { type: 'busho', n: 1, o: { name: '羽柴秀吉' } }], HASHIBA);
  camp.stay = true; camp.aggro = 0; camp.seekRange = 0;
  for (const u of camp.units) if (u.name === '羽柴秀吉') { u.invuln = true; u.noTarget = true; u.jinchu = { standing: false, t: 0, soldiers: [] }; }
  // 城（板塀の四角・北に門）と城の中の小屋・幟
  for (const seg of [[-23, -25, -4, -25], [4, -25, 23, -25], [-23, -25, -23, 25], [23, -25, 23, 25], [-23, 25, 23, 25]]) fence(rt, seg);
  rt.scene.add(kabukimon(W, 0, -25, 8));
  F.castleHut = hut(W, 0, 9, 12, 8); rt.scene.add(F.castleHut);
  rt.scene.add(hut(W, -12, -6, 7, 5));
  F.flags = [[10, 12], [-14, 14], [14, -18], [-14, -18]].map(([x, z]) => { const n = nobori(W, x, z, 'maru'); rt.scene.add(n); return n; });
  for (let x = -40; x <= -28; x += 3) rt.scene.add(tawara(W, x, P.pile.z));
  // 堰（板の水門）と水（城の周りに溜まる）
  F.weir = new THREE.Mesh(new THREE.BoxGeometry(1, 2.3, 6), new THREE.MeshLambertMaterial({ color: 0x483727 }));
  F.weir.position.set(P.weir.x, W.heightAt(P.weir.x, P.weir.z) + 1, P.weir.z); F.weir.rotation.y = Math.PI / 4; rt.scene.add(F.weir);
  F.weirSolid = solidRect(P.weir.x, P.weir.z, 1, 6, Math.PI / 4);
  const mat = rippleWater(liteMat({ color: 0x384b40, roughness: 0.2 }), 0.4, 0.8, 2, W.hemi?.color, false, null, null, false, true);
  F.water = new THREE.Mesh(new THREE.CircleGeometry(60, 64), mat);
  F.water.rotation.x = -Math.PI / 2; F.water.position.y = -1; rt.scene.add(F.water);
  F.waterY = -1; F.waterTo = -1;
  // 築く堤（盛り土）：段が進むと高くなる
  F.mound = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 5), new THREE.MeshLambertMaterial({ color: 0x5b4a36 }));
  F.mound.position.set(P.work.x, W.heightAt(P.work.x, P.work.z), P.work.z); F.mound.rotation.y = Math.atan2(P.work.x, P.work.z) + Math.PI / 2;
  F.mound.scale.y = 0.2; rt.scene.add(F.mound);
  F.posts = sentries(rt, '城の塀の鉄砲衆', [{ x: -13, z: -24 }, { x: -7, z: -24 }, { x: 7, z: -24 }, { x: 13, z: -24 }], 0.04);
  F.friends = troops(rt, true, '築堤の護衛', { x: -30, z: -96 }, [{ type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }, { type: 'busho', n: 1, o: { name: '羽柴秀長', horse: true } }], HASHIBA);
  F.friends.stay = true;
  addSite(rt, 'castle', 0, 0, '太田城');
  addSite(rt, 'fort', P.work.x, P.work.z, '出水の堤');
  addSite(rt, 'fort', P.weir.x, P.weir.z, '出水の堰');
  addSite(rt, 'fort', P.breach.x, P.breach.z, '東の堤');
}
// 水の高さを目当て（F.waterTo）へゆっくり寄せる。毎コマ
export function waterTick(rt, dt) {
  const F = rt.flags;
  const k = F.waterTo > F.waterY ? 0.03 : 0.12;
  F.waterY += Math.sign(F.waterTo - F.waterY) * Math.min(Math.abs(F.waterTo - F.waterY), dt * k);
  F.water.position.y = F.waterY;
}
