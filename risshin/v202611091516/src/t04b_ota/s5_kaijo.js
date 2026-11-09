// 太田城 ⑤ 12〜15分「開城」：水がまた溜まり、城は水に浮かぶ島になる。城から白旗が上がり、門が開く。
// 敵将を討つのではなく、工事と囲みで勝つ。北の土橋で開城の使者を迎える。
import * as THREE from 'three';
import { P, SAIKA, silenceAll } from './scene_end.js';
import { troops, move, near } from '../toyo15/kit.js';
import { sfx } from '../audio.js';

export default {
  goal: '北の土橋で、開城の使者を迎えよ',
  pin: { ...P.bridge, label: '北の土橋' },
  enter(rt, F) {
    const W = rt.world;
    silenceAll(rt);
    move(F.friends, { x: P.bridge.x - 6, z: P.bridge.z - 8 }, true);
    rt.say('羽柴秀長', '水が城の縁まで上がった。もう打って出る力は無い', 3.5);
    rt.after(12, () => rt.say('使番', '城の中では兵糧も水に浸かり、雑賀の衆が言い争っております', 4));
    rt.after(25, () => {
      // 白旗（城の門の楼の脇に一本）
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), new THREE.MeshLambertMaterial({ color: 0xf2efe6, side: THREE.DoubleSide }));
      const y = W.heightAt(6, -24);
      pole.position.set(6, y + 3, -24); cloth.position.set(6.75, y + 4.6, -24);
      rt.scene.add(pole, cloth); F.white = cloth;
      for (const n of F.flags || []) n.visible = false;
      sfx('horagai', 0.6);
      rt.say('足軽', '城に白い旗が上がったぞ！', 3);
    });
    rt.after(45, () => {
      F.envoy = troops(rt, false, '開城の使者', { x: 0, z: -28 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }], SAIKA, { aggro: 0, seek: 0 });
      for (const u of F.envoy.units) { u.noTarget = true; u.invuln = true; }
      move(F.envoy, { x: 0, z: -52 }); F.envoyT = rt.t;
      rt.say('使番', '門が開きます！　開城の使者にございます', 3.5);
    });
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (F.white) F.white.rotation.y = Math.sin(rt.t * 1.7) * 0.25;
    return !!F.envoy && (F.envoy.units.some((u) => u.pos.z < -44) || rt.t - F.envoyT > 40) && (near(rt, P.bridge, 14) || t > 110);
  },
  foes: () => [],
  max: 200,
};
