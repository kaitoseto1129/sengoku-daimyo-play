// ======================================================================
// 桶狭間 14〜15分：余韻（谷の出口の旗に戻ってから）
//   義元の首は挙がり、今川勢は西の深田へ崩れた。旗に戻った組で勝鬨を三度。
//   使番が、大高城の松平元康（のちの家康）も兵をまとめて退いてゆくと知らせる（次の戦への伏線）。信長は「清洲へ帰る」。
//   遠くの別働の今川勢（大高・丸根の方）も退く。三度の勝鬨と使番の知らせの間も本人が動ける。
// ======================================================================
import { sfx } from '../audio.js';
import * as THREE from 'three';
import { jinmaku, shogi, kagaribi } from '../props.js';

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.o15 || (F.o15 = {});
  if (v.yoinT) return;
  v.yoinT = rt.t;
  // 足軽の戦功を認める三言は、勝鬨と使番・信長の声の後に聞かせる。
  const endAt = rt.G.lord ? 40 : 42;   // K355：首実検と熱田の知らせまで聞かせる
  // 共通の終戦予約も最後の余韻にそろえ、三秒早く切り上げない。
  if (!rt.over) rt._closing = { at: rt.t + endAt, info: { scriptedEnd: true }, delay: 4 };
  const lord = !!rt.G.lord, NOB = lord ? '自分' : '織田信長';
  // 遠くの別働の今川勢（丸根・鷲津・大高の方）も退いてゆく
  for (const m of F.detached || []) { try { m.rout?.({ hideAfter: 60 }); } catch (e) { /* 退かせられなくても進む */ } }
  const toki = (t, s) => rt.after(t, () => { rt.army.playFar?.('toki', rt.player.u.pos, 1.5); sfx('taiko', 1); rt.say('組頭 源八', s, 2.2); });
  rt.after(3, () => sfx('horagai', 0.8));
  toki(4.5, 'えい、えい！');
  rt.after(6, () => rt.say('織田の兵', 'おう！', 1.4));
  toki(12.5, 'えい、えい！');
  rt.after(14, () => rt.say('織田の兵', 'おう！', 1.4));
  toki(20.5, 'えい、えい！');
  rt.after(22, () => rt.say('織田の兵', 'おおう！', 1.8));
  rt.after(25, () => rt.say('使番', '大高の城の松平蔵人佐（元康）殿も、兵をまとめて三河へ退いてゆきまする！', 3.8));
  rt.after(29.5, () => rt.say(NOB, '二万の大軍も、大将を失えばこの通りじゃ。', 3.2));
  // K355（センゴク外伝 桶狭間戦記 5巻 第37話・docs/books/okehazama_manga.md）：首実検。旗の脇に木瓜の幕の小さな囲い・床几・篝火二つ・首桶の台。
  //   信長が義元の首と向き合い両手をつく（字は使わず、短い声だけ）。幕は通り抜けられる（本人を閉じ込めない）。形は余韻の始めに一度だけ組む
  try {
    const P = rt.player.u.pos, q = F.returnPin || P, side = C.fieldVector(9, -4), W = rt.world;
    const cx = q.x + side.x, cz = q.z + side.z, grp = new THREE.Group();
    grp.add(jinmaku(W, cx, cz, 8, 6, 3, { mon: 'oda', solid: false }));
    const st = shogi(W, cx, cz - 1.6, 0, { gunbai: true }); st.position.set(cx, W.heightAt(cx, cz - 1.6), cz - 1.6); grp.add(st);
    grp.add(kagaribi(W, cx - 2.6, cz + 2.4), kagaribi(W, cx + 2.6, cz + 2.4));
    // 首桶（白木の桶に白布）を低い台に据える
    const y0 = W.heightAt(cx, cz);
    const dai = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.32, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a6a46 }));
    dai.position.set(cx, y0 + 0.16, cz); grp.add(dai);
    const oke = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0xc9b48c }));
    oke.position.set(cx, y0 + 0.48, cz); grp.add(oke);
    const nuno = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0xe8e2d2 }));
    nuno.position.set(cx, y0 + 0.66, cz); grp.add(nuno);
    rt.scene.add(grp); v.kubiJin = grp;
    rt.after(30.8, () => { if (!rt.over) rt.say('毛利新介', '御屋形様、今川治部大輔の御首にござりまする。', 3); });
    rt.after(34, () => { if (!rt.over) rt.say(NOB, '……海道一の弓取りであった。手厚く葬れ。', 3.2); });
    // K355：引き揚げの道で見た西の煙の答え（熱田は戦場から遠いので兵は置かず、知らせだけ）
    rt.after(37.2, () => { if (!rt.over) rt.say('使番', '熱田の湊へ寄せた今川の船手は、町の衆が追い返しました！', 2.8); });
  } catch (e) { /* 首実検の囲いが組めなくても余韻は進む */ }
  rt.after(endAt, () => { if (!rt.over) then(); });
}
