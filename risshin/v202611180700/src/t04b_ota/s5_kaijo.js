// 太田城 ⑤ 12〜15分「開城」：水がまた溜まり、城は水に浮かぶ島になる。城から白旗が上がり、門が開く。
// 敵将を討つのではなく、工事と囲みで勝つ。北の土橋で開城の使者を迎える。
import * as THREE from 'three';
import { P, SAIKA, silenceAll, toCastleTick } from './scene_end.js';
import { troops, move, near } from '../toyo15/kit.js';
import { blockLook } from '../fujin_place.js';
import { HASHIBA } from './scene.js';
import { sfx } from '../audio.js';

export default {
  goal: '北の土橋で、開城の使者を迎えよ',
  pin: { ...P.bridge, label: '北の土橋' },
  enter(rt, F) {
    const W = rt.world;
    silenceAll(rt);
    move(F.friends, { x: P.bridge.x - 6, z: P.bridge.z - 8 }, true);
    // 11/18 クラウド 紀州の持ち主（⑥ 470秒の写真「北の土橋で使者を迎えるのに、周りは人夫と三人の護衛だけ」）：
    //   ④の斬り合いで護衛は数人に減る。堤の後詰（幟の林つき）を土橋の東の堤の上へ、味方の新手を西の堤の上へ寄せ、
    //   城を向いて並ばせる（台詞の「堤の上は見渡す限り味方の旗」を絵にする）。新しい兵は足さない
    //   幟は元の田の物を隠し、寄せ先の堤の上に立て直す（幟だけ田に残らない。本数は同じ）
    const line = (g, q, nob) => {
      if (!g || !g.units.some((u) => u.alive && !u.gone)) return;
      const f = Math.atan2(-q.x, -q.z);   // 城（0,0）を向く
      move(g, q); g.facing = f; g.formation = 'yari'; g.anchor = { x: q.x, z: q.z };
      if (!nob) return;
      for (const nb of g._nobs || []) { nb.visible = false; if (nb.parent) nb.parent.remove(nb); }
      g._nobs = [];
      try { blockLook(rt, g, { x: q.x, z: q.z, facing: f, flag: HASHIBA.flag, ranks: 4, nobori: true, side: 0 }); } catch (e) { /* 幟が立てられない時は兵だけ */ }
    };
    line(F.otaGozume, { x: P.bridge.x + 12, z: P.bridge.z - 6 }, true);
    // 堤の上で働いた人夫の組も土橋の西の堤へ寄せて見届けさせる（築いた堤の上から開城を見る）
    let k = 0;
    for (const g of rt.army.groups || []) if (g.team === 0 && (g.name === '味方の新手' || g.name === '築堤の人夫') && k < 4) { line(g, { x: P.bridge.x - 12 - k * 7, z: P.bridge.z - 7 + k * 2.5 }, false); k++; }
    rt.say('羽柴秀長', '水が城の縁まで上がった。もう打って出る力は無い', 3.5);
    rt.after(8, () => rt.say('使番', '城の中では兵糧も水に浸かり、雑賀の衆が言い争っております', 4));
    // 11/17 K355（センゴク権兵衛2・4巻）：秀吉の戦は数で押して見せしめにする物量戦。紀州の結末は皆殺しでなく和睦で収めた
    rt.after(12, () => rt.say('足軽', '堤の上は見渡す限り味方の旗じゃ……城の者は毎朝これを見ておったのか', 3.4));
    rt.after(16, () => {
      // 白旗（城の門の楼の脇に一本）
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), new THREE.MeshLambertMaterial({ color: 0xf2efe6, side: THREE.DoubleSide }));
      const y = W.heightAt(6, -24);
      // 布は竿を軸に揺らす（布の真ん中で回すと竿から離れて宙に浮く）
      const fly = new THREE.Group(); fly.position.set(6, y + 4.6, -24); cloth.position.set(0.75, 0, 0); fly.add(cloth);
      pole.position.set(6, y + 3, -24);
      rt.scene.add(pole, fly); F.white = fly;
      for (const n of F.flags || []) n.visible = false;
      sfx('horagai', 0.6);
      rt.say('足軽', '城に白い旗が上がったぞ！', 3);
    });
    rt.after(28, () => {
      F.envoy = troops(rt, false, '開城の使者', { x: 0, z: -28 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }], SAIKA, { aggro: 0, seek: 0 });
      F.envoy.peaceful = true; F.envoy.fire = false;
      for (const u of F.envoy.units) { u.noTarget = true; u.invuln = true; }
      move(F.envoy, { x: 0, z: -52 }); F.envoy.marching = true; F.envoyT = rt.t;
      rt.say('使番', '門が開きます！　開城の使者にございます', 3.5);
    });
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (F.white) F.white.rotation.y = Math.sin(rt.t * 1.7) * 0.25;
    toCastleTick(rt);
    return !!F.envoy && (F.envoy.units.some((u) => u.pos.z < -38) || rt.t - F.envoyT > 25) && near(rt, P.bridge, 14);
  },
  foes: () => [],
  max: Infinity,
};
