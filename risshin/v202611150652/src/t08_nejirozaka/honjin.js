// ======================================================================
// 根白坂　両軍の大将（二巡・docs/generals_toyo_toku_1108.md の 11）
//   豊臣：方面の総大将の豊臣秀長は砦の北の本陣（高城の囲みの側）で床几に座る。尾藤知宣が「救援は危うし」と止める（史実）。
//   島津：坂の下の義珍の本陣の左右に、義久と家久の本陣。三人とも坂の下を動かない（討てない）。
// 呼び方：setup で install(rt, H)。H = { MIYABE, SHIMAZU, dress }。藤堂の着く時に bito(rt)。
// ======================================================================
import { allyGroup, enemyGroup } from '../bhelp.js';
import { shogi, jinmaku, nobori } from '../props.js';

const seat = (rt, g, name, at, face) => {
  for (const u of g.units) {
    if (u.name !== name) continue;
    // 討死しない総大将。討たれない指定だけでは、主人公の手傷で討死する共通処理がある。
    // 狙いから外す指定は名札と敵の▼まで消す。手傷の後も本陣に残す指定で守る。
    u.invuln = true; u.mustLive = true; u._crouch = true;
    u.onWound = () => { u.hp = Math.max(1, u.hp); };
    u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos);
  }
  try { rt.scene.add(shogi(rt.world, at.x, at.z, face)); } catch (e) { /* 飾り */ }
};

export function install(rt, H) {
  const F = rt.flags, W = rt.world;
  // 秀長の本陣（砦の北の丘。砦の奥の宮部の陣幕のさらに後ろ）
  const HS = { x: 14, z: -96 };
  try { rt.scene.add(jinmaku(W, HS.x, HS.z, 14, 9, 3, { mon: 'toyotomi', solid: false })); for (const [x, z] of [[4, -88], [24, -88]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7)); } catch (e) { /* 飾り */ }
  F.hidenaga = allyGroup(rt, { name: '豊臣秀長の本陣', anchor: HS, facing: 0, width: 5, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', fullStrength: true },
    H.dress([{ type: 'busho', n: 1, o: { name: '豊臣秀長', invuln: true, horse: false, hat: 'kabuto_w' } }, { type: 'samurai', n: 1, o: { name: '尾藤知宣', invuln: true } }, { type: 'samurai', n: 4 }], H.MIYABE));
  F.hidenaga.noPursue = true;
  seat(rt, F.hidenaga, '豊臣秀長', HS, 0);
  // 島津義久・家久の本陣（義珍の本陣の左右。坂の下）
  for (const [name, at] of [['島津義久', { x: -30, z: 158 }], ['島津家久', { x: 38, z: 156 }]]) {
    const g = enemyGroup(rt, { faction: 'shimazu', name: `${name}の本陣`, anchor: at, facing: Math.PI, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', seekRange: 4 },
      H.dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a2626 } }, { type: 'samurai', n: 5 }], H.SHIMAZU));
    g.noPursue = true;
    seat(rt, g, name, at, Math.PI);
    try { rt.scene.add(nobori(W, at.x + 6, at.z - 4, 'shimazu', 7)); } catch (e) { /* 飾り */ }
  }
}

// 藤堂が来る少し前：本陣では尾藤知宣が救援を止める。藤堂・戸川は構わず駆け付ける
export function bito(rt) {
  if (rt.flags.bitoSaid) return;
  rt.flags.bitoSaid = true;
  rt.say('使番', '中納言様の本陣にて、尾藤知宣様が「救援は危うし」とお止めしております！', 3.6);
}
