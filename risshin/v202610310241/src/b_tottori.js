import { setCastleMask } from './castle_mask.js';
import { useTerrain } from './asset_manifest.js';
import { timeslipField } from './timeslip_field.js';
import { barkTex, woodTex, thatchTex, groundDetailTex } from './nature.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { pressureTick } from './battle_pressure.js';
import { drawGroundAt, guardDrawCamera, avoidCameraBodies } from './render_camera.js';
// ======================================================================
// 織田家編　鳥取城の戦い（天正九年十月）
// 羽柴秀吉は因幡の鳥取城を囲み、まわりの米を先に買い集めてから、付城と柵で城を囲んで兵糧を断った（鳥取の渇え殺し）。
// 城を守る吉川経家は四か月耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命と引き換えに自害して城を開いた。
// 足軽は羽柴秀吉の手。①夜、千代川の岸に着いた毛利の兵糧舟に火をかける ②兵糧を取りに打って出た城兵を止める
// ③開城の使いを城の木戸まで供する（戦は、ここで終わる）
// 川岸の小競り合いと城兵の出撃は推定復元。史実にない後詰の到着・総攻め・城兵への配膳分岐は置かない。
// 向き：北（-z）に鳥取城の山（久松山）。西（-x）を千代川が海へ流れる。東（+x）に秀吉の本陣（太閤ヶ平）。距離は局地用に縮める
// ======================================================================
import { yamaLift, switchback } from './yamalift.js';
import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { nobori, hut, dou, yagura, jinmaku, campfire, tawara, kagaribiBatch, kabukimon, tobira, dorui, hyoro, umatsunagi, makeSimpleBatch, finalizeSimpleBatch, solidCircle, castleBoardFence, hatazao, lumber, kobune } from './props.js';
import { siegeApproach } from './b_miki.js';
import { flagTexture } from './textures.js';
import { castlePart } from './cgt_castle.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_FIRE_START, EVENT_MESSENGER } from './battle_events.js';
import { gauss, enemyGroup, allyGroup, centerOf, wallLine } from './bhelp.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { interiorBase } from './yagura_inside.js';
import { NAKA } from './naka.js';
import { denseCamp } from './castle_bldg.js';
import { TAIKOGAHIRA, TOTTORI_TAIKOGANARA_PLAN, TOTTORI_SEATS, TOTTORI_HOUSES, TOTTORI_DITCHES } from './castles/tottori.js';
import { applyLook, NIGHT, DAWN, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { campWear } from './kakoi.js';
import { demRelief, demDetail } from './dem.js';
import { dressStage } from './stage_dress.js';
let ttDem = null;
useTerrain('dem_tottori', (data) => { ttDem = data; });
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-70, 200], [-72, 80], [-66, 0], [-74, -90], [-90, -200]];
// 山麓南西の低湿地と、袋川の流れの分かれ（水路）・湿った田（HIST_B。袋川の氾濫原を思わせる）
const BOG = { x: -118, z: 128, r: 58 };
const SUIRO = [[-70, 70], [-92, 104], [-112, 140], [-126, 186]];
// 川岸の東にそそり立つ久松山の麓（46m の急斜面）は、灰色の壁に見せず松と雑木の林にする。
const CLIFF_GROVES = [{ x: -44, z: -60, r: 7, n: 6 }, { x: 58, z: -66, r: 9, n: 6 }, { x: -14, z: -42, r: 12, n: 12 }, { x: -12, z: -62, r: 12, n: 10 }];
function cliffGrove(x, z) {
  for (const g of CLIFF_GROVES) if (Math.hypot(x - g.x, z - g.z) < g.r) return true;
  return false;
}
const boggy = (x, z) => Math.max(0, 1 - Math.hypot((x - BOG.x) * 0.9, z - BOG.z) / BOG.r);
// 城内に逃げ込んだ里の者の姿（飢えた民・女子ども。兵ではない：的にも敵にもならない飾り）
function townsfolk(rt, spots) {
  const body = new THREE.CylinderGeometry(0.3, 0.38, 0.95, 6), head = new THREE.SphereGeometry(0.17, 6, 5);
  const mb = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 1 }), spots.length);
  const mh = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xc9a47e, roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  spots.forEach(([x, z, k], i) => {
    const y = rt.world.heightAt(x, z), sit = k === 's' ? 0.62 : 1;   // 座り込んだ者は丈が低い
    const bodyScale = (k === 'c' ? 0.65 : 1) * sit, headScale = k === 'c' ? 0.8 : 1;
    q.setFromEuler(e.set(0, (i * 2.1) % 6.28, 0));
    // 胴の半分の高さだけ持ち上げ、子どもも足元を地面へそろえる。
    m.compose(p.set(x, y + 0.475 * bodyScale, z), q, s.set(k === 'c' ? 0.7 : 1, bodyScale, k === 'c' ? 0.7 : 1)); mb.setMatrixAt(i, m);
    m.compose(p.set(x, y + 0.95 * bodyScale + 0.145 * headScale, z), q, s.setScalar(headScale)); mh.setMatrixAt(i, m);
  });
  mb.castShadow = true; rt.scene.add(mb, mh);
}
const CASTLE = { x: 10, z: -150 };          // 久松山の山上の陣所
const GATE = { x: 10, z: -84 };
const BOATS = [{ x: -54, z: -30 }, { x: -52, z: -8 }];   // 岸に着いた兵糧舟
const riverX = (z) => z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
// 舟と番兵の通り道だけを川岸の持ち場とする。敗走兵を場外まで追わせない。
// 岸の北では、付城をつなぐ柵が水際の近くを通る。柵の川側は囲みの外。柵の切れ目（z -7）を回って出入りする。
const BANK_FENCE_X = (z) => z <= 1 ? -61 + (z + 7) * 5 / 8 : -56 + (z - 1) * 5 / 9;
const beyondBankFence = (x, z) => z > -7 && z < 10 && x < BANK_FENCE_X(z);
const atBank = (x, z) => x >= riverX(z) + 13.2 && x <= -34 && z >= -66 && z <= 22 && !beyondBankFence(x, z);
// 境目を一歩またぐたびに下知を替えない。岸の道へ戻り切ってから放火へ向ける。
// 任務・印・自動操作で同じ判定を使う。
function bankNeedsReturn(rt) {
  const p = rt.player.u.pos, F = rt.flags;
  if (!atBank(p.x, p.z)) F.bankReturning = true;
  else if (p.x >= riverX(p.z) + 14.4 && p.x <= -35.2 && p.z >= -64.8 && p.z <= 20.8 &&
      !(p.z > -8.2 && p.z < 11.2 && p.x < BANK_FENCE_X(Math.min(10, Math.max(-7, p.z))) + 1.2)) F.bankReturning = false;
  return !!F.bankReturning;
}
// 戻る先は岸の判定より内側へ。歩みを止める余白を含めても川側に残らない。
// 案内の印と自動操作は同じ点を使い、毎コマ点を作らない。
function bankEntry(rt) {
  const p = rt.player.u.pos, at = rt.flags.bankEntry;
  if (beyondBankFence(p.x, p.z)) {
    // 先に柵の端まで岸沿いに進む。斜めに柵を横切ったり、川の中央を戻り先にしない。
    at.z = -11;
    at.x = p.z > -9 ? p.x : riverX(at.z) + 16;
  }
  else {
    at.z = Math.max(-62, Math.min(18, p.z));
    at.x = Math.max(riverX(at.z) + 16, Math.min(-38, p.x));
    // 柵の端でも停止の余白が外側へはみ出さない。
    if (at.z > -8.2 && at.z < 11.2) at.x = Math.max(at.x, BANK_FENCE_X(Math.min(10, at.z + 0.8)) + 2.6);
  }
  return at;
}
// 退避の札も自動操作も、舟の岸と柵の内側を持ち場にする。
// 岸の外では戻り先へ近づく一歩を許し、外れた位置で動けなくしない。
function tottoriRetreatAllowed(rt, point) {
  if (rt.world.inWaterAt(point.x, point.z)) return false;
  const p = rt.player.u.pos, step = rt.flags.step;
  if (step === 1) {
    if (atBank(p.x, p.z)) return atBank(point.x, point.z);
    const at = bankEntry(rt);
    return Math.hypot(point.x - at.x, point.z - at.z) <= Math.hypot(p.x - at.x, p.z - at.z) + 0.01;
  }
  if (step === 2) {
    const inside = point.z >= FENCE_Z + 2 && Math.hypot(point.x - GATE.x, point.z - FENCE_Z) <= 22;
    if (inside) return true;
    // 列から外れている時も、柵の内の守り場へ戻れる候補だけを残す。
    if (p.z >= FENCE_Z + 2 && atTottoriPost(p)) return false;
    return Math.hypot(point.x - GATE.x, point.z - FENCE_Z - 8) < Math.hypot(p.x - GATE.x, p.z - FENCE_Z - 8);
  }
  return true;
}
// 帰りは岸の道から柵の口へ折れる。札と自動操作が同じ曲がり角を指す。
const RETURN_ROAD = [[-42, -8], [-32, 4], [10, 4], [10, 20]];
function returnWay(rt) {
  const F = rt.flags, p = rt.player.u.pos, at = F.returnPoint;
  if (F.step !== 1.5) { at.x = 10; at.z = 20; return at; }
  // 川へ押し出された時は先に岸へ。柵の川側から口へ直進させない。
  if (p.x < riverX(p.z) + 13.2 || beyondBankFence(p.x, p.z)) return bankEntry(rt);
  let i = F.returnIndex;
  while (i < RETURN_ROAD.length - 1 && Math.hypot(p.x - RETURN_ROAD[i][0], p.z - RETURN_ROAD[i][1]) < 3) i++;
  F.returnIndex = i;
  at.x = RETURN_ROAD[i][0]; at.z = RETURN_ROAD[i][1];
  return at;
}
// 岸の広さと、荷を守る範囲は別。舟から離れた相手を山裾まで追わない。
function atBoatPost(rt, p) {
  if (!atBank(p.x, p.z) || p.x > -34) return false;
  // 十六歩だと東の脇道（x -36）まで番兵が追い、放火へ回るたびに退避へ戻る。
  // 舟の前の列（岸側六〜九歩）は残し、脇道まで追って持ち場を空けない。
  // 焼いた舟へ居残ると、残る舟へ進む本人だけが味方の列から離れてしまう。
  for (const b of rt.flags.boats) if ((!b.burnt || rt.flags.burnt >= 2) && Math.hypot(p.x - b.x, p.z - b.z) <= 10) return true;
  return false;
}
// 番兵も寄せ手も舟の岸で戦う。片方だけ戻すと、互いを追って山裾へ流れる。
function bankGuardReturn(rt, u) {
  const F = rt.flags, g = u.group;
  if (F.step !== 1 || !g || (g !== F.guard && g !== F.guard2 && g !== F.hide) ||
      g.routed || !u.alive || u.fleeing || u.rearWound || u.woundOut || u.noTarget) return null;
  if (g.focus && !atBoatPost(rt, g.focus.pos)) g.focus = null;
  const target = u.target;
  // 川下から来る組は岸の道を通す。舟へ着く前の行軍を追撃と取り違えない。
  if (g.order === 'path' && !target && atBank(u.pos.x, u.pos.z)) return null;
  // 持ち場を半歩出た兵も、内側から届く槍には応戦する。境で攻撃を消し続けない。
  if (atBoatPost(rt, u.pos) || target && atBoatPost(rt, target.pos) &&
      atBank(u.pos.x, u.pos.z) && Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) <= 3) {
    if (!target || atBoatPost(rt, target.pos)) return null;
    // 境の外へ半歩出た相手にも、持ち場から届く刃は合わせる。
    // ここで戻すと共通処理が振りまで消し、境で構え直し続けてしまう。
    // 銃・弓の射程で追撃範囲を広げず、舟から離れた本人は追わない。
    if (target.alive && !target.fleeing && !target.woundOut && !target.noTarget &&
        atBank(target.pos.x, target.pos.z) && (u.sidearm || u.type !== 'gun' && u.type !== 'bow') &&
        Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) <= Math.min(u.reach || 2.8, 3)) return null;
  }
  // 歩いて岸へ戻す。位置を飛ばさず、兵が持っている移動先を使い回す。
  const home = u.moralePoint;
  // 控えの元の位置は舟から離れている。そこへ戻すと再び相手を追って往復する。
  let boat = null, distance = Infinity;
  for (const b of F.boats) {
    if (b.burnt && F.burnt < 2) continue;
    const d = Math.hypot(u.pos.x - b.x, u.pos.z - b.z);
    if (d < distance) { boat = b; distance = d; }
  }
  if (!boat) return null;
  // 両軍を同じ点へ戻すと押し合いになる。番は舟側、味方は東の列へ。
  // 列の外端も十歩の持ち場に収め、東の脇道を空ける。
  home.z = boat.z + (Math.floor(u.slot / 3) % 5 - 2) * 1.2;
  home.x = boat.x + (g === F.hide ? 7 : 4.5) + (u.slot % 3) * 0.8;
  if (beyondBankFence(home.x, home.z)) home.x = BANK_FENCE_X(home.z) + 1.8;
  home.y = rt.world.heightAt(home.x, home.z);
  return home;
}
// 夜討ちは柵の口を破る寄せ。山腹や川上まで本人を追い回さない。
const atTottoriPost = (p) => Math.hypot(p.x - GATE.x, p.z - FENCE_Z) <= 24;
// 柵の正面だけでなく、口の脇で実際に槍を合わせた寄せも数える。
// 控えの行軍・柵越しの狙いだけでは、退くまでの刻を進めない。
function tottoriSallyContact(rt, u) {
  if (Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) < 14) return true;
  const foe = u.atk?.target || u.swing?.target || u.target;
  return atTottoriPost(u.pos) && foe?.alive && foe.team !== u.team &&
    !foe.fleeing && !foe.woundOut && !foe.noTarget && atTottoriPost(foe.pos) &&
    (u.atk || u.swing && !u.swing.done || u.guardFlash > 0) &&
    Math.abs(u.pos.y - foe.pos.y) < 3 &&
    Math.hypot(u.pos.x - foe.pos.x, u.pos.z - foe.pos.z) <= Math.min(8, (u.reach || 2.8) + 1) &&
    !rt.army.wallBetween(u.pos, -1, foe.pos, (u.sidearm || u.lookWeapon) === 'spear');
}
function holdTottoriSallies(rt) {
  for (const g of rt.flags.sallies) {
    if (!g.ttOut || g.ttRetreat || g.routed || (g.order !== 'attack' && g.order !== 'path')) continue;
    if (g.focus && !atTottoriPost(g.focus.pos)) g.focus = null;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.noTarget) continue;
      if (g.order === 'path' ? !u.target || atTottoriPost(u.target.pos)
        : atTottoriPost(u.pos) && (!u.target || atTottoriPost(u.target.pos))) continue;
      u.target = null; u.atk = null; u.watch = null; u.charging = false;
      const home = u.moralePoint;
      if (g.order === 'path') {
        const at = g.path[Math.min(g.pathIdx, g.path.length - 1)];
        home.x = at[0]; home.z = at[1];
      } else {
        const dx = u.pos.x - GATE.x, dz = u.pos.z - FENCE_Z;
        const k = Math.min(1, 18 / Math.max(1, Math.hypot(dx, dz)));
        home.x = GATE.x + dx * k; home.z = FENCE_Z + dz * k;
      }
      home.y = rt.world.heightAt(home.x, home.z);
      u.moveTo = home; u.aiT = 0.75;
    }
  }
}
// 全員を討つまで放火を隠さない。番兵から離れた舟へ、味方の隙を使って進める。
function bankBoatGuarded(rt, boat) {
  for (let i = 0; i < 2; i++) {
    const g = i ? rt.flags.guard2 : rt.flags.guard;
    if (gone(g)) continue;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
        Math.hypot(u.pos.x - boat.x, u.pos.z - boat.z) < 4) return true;
  }
  return false;
}
function nextBankBoat(rt) {
  const F = rt.flags, current = F.bankBoat;
  // 番が一瞬離れただけでは「舟へ」と言わない。両方の舟の隙を同じ時計で測る。
  for (const b of F.boats) {
    if (b.burnt || bankBoatGuarded(rt, b)) b.clearSince = null;
    else if (b.clearSince == null) b.clearSince = rt.t;
  }
  // 一瞬の出入りでは印を替えない。番が戻って二秒塞いだ舟へは、
  // 空いた方があれば選び直す。なければ同じ舟への回り道を保つ。
  // 船べりへ着いた後の長押しは保ち、被弾・退避は通常の判定に任せる。
  if (current && !current.burnt) {
    if (rt.distTo(current) <= 3 || !bankBoatGuarded(rt, current)) {
      F.bankBlockedAt = null;
      return current;
    }
    if (F.bankBlockedAt == null) F.bankBlockedAt = rt.t;
    if (rt.t - F.bankBlockedAt < 2) return current;
  }
  let boat = null, nearest = Infinity;
  for (const b of F.boats) {
    if (b.burnt || b.clearSince == null || rt.t - b.clearSince < 2) continue;
    const d = rt.distTo(b);
    if (d < nearest) { boat = b; nearest = d; }
  }
  // 回り道の途中で番が戻っても、行き先そのものは捨てない。
  // 別の舟に隙がなければ同じ舟の脇へ進み、手元の敵だけに応戦する。
  // ここを空にすると、岸道から遠い番兵へ戻り続けて放火が終わらない。
  if (!boat && current && !current.burnt) return current;
  // 焼いた舟の次も、番のいない瞬間を待って行き先を空にしない。
  // 番が残っていても岸の脇を案内し、手元の応戦と実際の放火は別に判定する。
  // 最初の一艘を選ぶ時にも同じ道順を使い、番全員を討つ役目へ戻さない。
  if (!boat) for (const b of F.boats) {
    if (b.burnt) continue;
    const d = rt.distTo(b);
    if (d < nearest) { boat = b; nearest = d; }
  }
  F.bankBoat = boat; F.bankBlockedAt = null;
  return boat;
}
// 通れる岸が空いたら、そのまま舟へ。退いた後も四角い道順を踏み直させない。
// 柵の斜めの境を含めて道中を測り、舟の番の間合いは横切らない。
function bankDirectApproach(rt, boat) {
  const p = rt.player.u.pos, dx = boat.x - p.x, dz = boat.z - p.z;
  const length2 = dx * dx + dz * dz, steps = Math.max(1, Math.ceil(Math.sqrt(length2)));
  for (let i = 0; i <= steps; i++) if (!atBank(p.x + dx * i / steps, p.z + dz * i / steps)) return false;
  for (let i = 0; i < 2; i++) {
    const g = i ? rt.flags.guard2 : rt.flags.guard;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
      const along = ((u.pos.x - p.x) * dx + (u.pos.z - p.z) * dz) / (length2 || 1);
      // 本人より後ろの乱戦から離れる道まで塞がれたと数えない。
      // 手元へ届く敵は残し、正面の番兵は従来どおり回り込む。
      if (along < 0 && !bankRouteThreat(rt, u)) continue;
      const t = Math.max(0, Math.min(1, along));
      if (Math.hypot(u.pos.x - p.x - dx * t, u.pos.z - p.z - dz * t) < 4.5) return false;
    }
  }
  return true;
}
// 乱戦が残る間は、東の岸道から近い側の船べりへ回る。
// 道の印と自動操作で同じ曲がり角を使い、点は設営時の物を使い回す。
function boatApproach(rt, boat) {
  const F = rt.flags, p = rt.player.u.pos, at = F.boatWay;
  const distance = rt.distTo(boat);
  // 一度脇道へ回り始めたら、その曲がり角まで進む。敵の半歩の移動で
  // 直進と迂回を切り替えると、本人も案内の印も乱戦の前を往復する。
  const followingDetour = F.approachBoat === boat && !F.approachDirect && F.approachStep < 3;
  if ((!followingDetour || distance <= 2.2) && bankDirectApproach(rt, boat)) {
    F.approachBoat = boat; F.approachStep = 3;
    F.approachDirect = true;
    F.approachLanded = distance <= 3;
    return boat;
  }
  // 船べりから退いたら脇道へ戻す。古い到着判定で乱戦へ直進させない。
  // 船べりから数歩退いた時点で回り直す。十四歩まで到着済みにすると、
  // 退避先から番兵の列を横切って舟へ戻る往復を続けてしまう。
  // 放火の範囲（三歩）へ入った直後に番兵が動いても、遠い脇道を踏み直させない。
  // 実際の打ち込みへの構え・退避は別の判定に任せ、四歩半離れた時だけ回り直す。
  if (F.approachBoat !== boat || F.approachDirect && distance > 4.5 || F.approachStep === 3 && (distance > 14 || F.approachLanded && distance > 4.5)) {
    F.approachBoat = boat;
    F.approachStep = 0;
    F.approachDirect = false;
    F.approachLanded = false;
    // 番兵が戻る列（x -48〜-42）の中を「脇道」にしない。
    // 回る端は舟を選んだ時だけ測る。近い端が敵で塞がれていれば反対へ。
    let best = Infinity;
    for (const side of [-1, 1]) {
      const z = boat.z + side * 10;
      if (!atBank(boat.x, z)) continue;
      let cost = Math.abs(p.z - z);
      for (const g of [F.guard, F.guard2]) for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        const x = Math.max(boat.x, Math.min(-36, u.pos.x));
        const d = Math.hypot(u.pos.x - x, u.pos.z - z);
        if (d < 8) cost += (8 - d) * 8;
      }
      if (cost < best) { best = cost; F.approachZ = z; }
    }
    at.x = -36; at.z = Math.max(-62, Math.min(-8, p.z));
  }
  // 船べりへ着いたら、途中の印を踏んでいなくても放火へ。
  // 脇道の端（舟から十歩）からの接近中は、道順を最初へ戻さない。
  // 放火できる三歩より外で道順を飛ばすと、番兵の列へ切り込んでしまう。
  if (distance <= 3) { F.approachStep = 3; F.approachLanded = true; }
  if (F.approachStep === 0 && Math.hypot(p.x - at.x, p.z - at.z) < 2) F.approachStep = 1;
  if (F.approachStep === 1) {
    at.x = -36; at.z = F.approachZ;
    if (Math.hypot(p.x - at.x, p.z - at.z) < 2) F.approachStep = 2;
  }
  if (F.approachStep === 2) {
    // 近い端へ回ってから船べりへ折れる。番兵の列へ入り直さない。
    at.x = boat.x; at.z = F.approachZ;
    if (Math.hypot(p.x - at.x, p.z - at.z) < 2) F.approachStep = 3;
  }
  return F.approachStep < 3 ? at : boat;
}
// 列の向こうで味方と戦う兵と、本人の道を塞ぐ兵を区別する。
// 舟へ回る案内と自動操作で同じ間合いを使う。
function bankRouteThreat(rt, o) {
  const u = rt.player.u;
  if (o.fleeing || o.woundOut || o.noTarget || o.invuln || Math.abs(o.pos.y - u.pos.y) >= 3) return false;
  const distance = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
  // 狙いだけが残る八歩先の兵で、空いた脇道から味方の乱戦へ戻さない。
  // 銃・弓の射程を安全な岸道の全域へ広げず、実際の射撃案内は既存の警告に任せる。
  const melee = o.sidearm || o.type !== 'gun' && o.type !== 'bow';
  const attacking = melee && distance <= (o.reach || 2.8) + 1.5 &&
    (o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u);
  return (attacking || distance < 3) &&
    !rt.army.wallBetween(u.pos, -1, o.pos);
}
// 舟への道がある間は、別の味方と戦う番兵へ案内を奪わせない。
// 手元へ来る敵は示し、舟が塞がれている時は従来どおり番を退ける。
function bankEnemyGuideAllowed(rt, enemy) {
  return rt.flags.step !== 1 || bankRouteThreat(rt, enemy) ||
    !bankNeedsReturn(rt) && !nextBankBoat(rt);
}
// 止血後の軽い傷は残る。歩けないほどの傷・出血・深手だけを退く理由にする。
// 画面と岸道の案内で同じ判定を使い、放火と退避を同時に命じない。
function tottoriWoundRetreatNeeded(rt) {
  const u = rt.player.u;
  return u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.3 || u.woundSlow > 0.25 || u.armWound > 0.25;
}
// 傷は自然には戻らない。手当てを済ませ、近くに敵がいない岸道では任務へ戻す。
// 道案内と自動操作を同じ条件にし、深手のまま味方の後ろで待ち続けない。
function bankRouteClear(rt) {
  const F = rt.flags, p = rt.player, u = p.u;
  // 別の味方と戦う敵が八歩先にいるだけでは、岸道から列へ引き戻さない。
  // 手元の敵と、本人へ向かう敵には退避を保つ。被弾直後も無理に放火へ戻さない。
  if (F.step !== 1 || F.ending || rt.over || !u.alive || u.mobbed || p.sta < 20) return false;
  if (rt.t < (rt.retreatUntil || 0) || F.retreatMarked || tottoriWoundRetreatNeeded(rt)) return false;
  if (u.hp < u.maxHp * 0.6 && p.treatmentLeft > 0 && !(p.treatmentNext > rt.t)) return false;
  if (rt.army.nearestEnemy(u, 8, (o) => bankRouteThreat(rt, o))) return false;
  return bankNeedsReturn(rt) || !!nextBankBoat(rt);
}
const CASTLE_ROADS = [switchback([10, 20], [GATE.x, GATE.z + 4], 7, 32), switchback([GATE.x, GATE.z - 4], [CASTLE.x, CASTLE.z + 8], 7, 30)];
// 使いの横へ一定量ずらすと、道の向きによって崖へ出る。道の長さで後ろを測る。
function escortRoadPoint(F, distance, out) {
  const path = F.env.path, lengths = F.envLengths;
  let i = 1;
  while (i < path.length - 1 && lengths[i] < distance) i++;
  const a = path[i - 1], b = path[i];
  const t = Math.max(0, Math.min(1, (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)));
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
  return out;
}
function escortRoadPosition(F, p, out) {
  const path = F.env.path;
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d >= best) continue;
    best = d; out.x = x; out.z = z; out.segment = i; out.gap = Math.sqrt(d);
    out.distance = F.envLengths[i - 1] + (F.envLengths[i] - F.envLengths[i - 1]) * t;
  }
  return out;
}
function escortWay(rt) {
  const F = rt.flags, lengths = F.envLengths;
  const p = escortRoadPosition(F, rt.player.u.pos, F.envPlayerRoad);
  // 隊の要は実際の使いより先へ進む。見えない要でなく、侍本人の歩みを追う。
  const e = escortRoadPosition(F, F.env.units[0].pos, F.envRoad);
  // 道を外れた時は先に中央へ戻す。曲がり角の内側を斜めに横切らない。
  if (p.gap > 0.8) { F.envWay.x = p.x; F.envWay.z = p.z; return F.envWay; }
  // 人足二人の列まで含めて後ろへ。二歩半では最後尾と本人が重なる。
  let distance = F.envArrived ? lengths[lengths.length - 1] : Math.max(0, e.distance - 5);
  if (distance > p.distance) distance = Math.min(distance, Math.max(p.distance + 0.8, lengths[p.segment]));
  else distance = Math.max(distance, Math.min(p.distance - 0.8, lengths[p.segment - 1]));
  return escortRoadPoint(F, distance, F.envWay);
}
// 供をする位置は足元でも、目で追う印は次の折れへ向ける。
// 自動操作の歩く先は変えず、崖へ外れた時と使いが待つ時は従来の戻り先を示す。
function escortGuide(rt) {
  const F = rt.flags, way = escortWay(rt), p = F.envPlayerRoad;
  if (F.envArrived || F.env.order === 'hold' || p.gap > 0.8 ||
      p.distance > F.envRoad.distance || F.envRoad.distance - p.distance > 8) return way;
  let next = p.segment;
  while (next < F.envLengths.length - 1 && F.envLengths[next] <= p.distance + 0.3) next++;
  return escortRoadPoint(F, Math.min(p.distance + 4, F.envLengths[next]), F.envGuide);
}
// 同じ折れの道にいる時だけ、行き先の札を侍本人へ結ぶ。
// 別の折れでは従来の道案内を保ち、切岸を横切る矢印にしない。
function escortGuidePerson(rt) {
  const F = rt.flags;
  escortWay(rt);
  return F.envPlayerRoad.gap <= 0.8 && F.envPlayerRoad.segment === F.envRoad.segment &&
    Math.abs(F.envRoad.distance - F.envPlayerRoad.distance) <= 10 ? F.env.units[0] : null;
}
// 出撃の控えは木戸の内の最初の折れに集める。山上から数百歩を下る間に退却させない。
const SALLY_SEATS = [0.2, 0.6, 1].map((t) => ({
  x: CASTLE_ROADS[1][0][0] + (CASTLE_ROADS[1][1][0] - CASTLE_ROADS[1][0][0]) * t,
  z: CASTLE_ROADS[1][0][1] + (CASTLE_ROADS[1][1][1] - CASTLE_ROADS[1][0][1]) * t,
}));
const FENCE_Z = 12;                        // 秀吉方の柵。山腹でなく、城道の登り口の手前の麓で囲む。
const TAIKO = { x: 152, z: -142, ...TAIKOGAHIRA }; // 内陣は東西58m・南北58m。東は +x、南は +z
const TX = TAIKO.w / 2, TZ = TAIKO.d / 2, TB = TAIKO.bankW / 2;
const TAIKO_LOOKOUTS = TOTTORI_TAIKOGANARA_PLAN.yagura.map(k => ({ ...k, x: TAIKO.x + k.at[0], z: TAIKO.z + k.at[1], innerH: TAIKO.bankInnerH + k.bankH - TAIKO.bankH }));
// 西の土塁へ内側から上がる。最後は梯子の足（櫓の南2.9m）へつなぐ。
const TAIKO_RAMPS = TAIKO_LOOKOUTS.map(k => {
  const pts = [[TAIKO.x - TX + 4, TAIKO.z], [TAIKO.x - TX + 4, k.z + 2.9], [k.x, k.z + 2.9]];
  const first = Math.abs(pts[1][1] - pts[0][1]);
  return { pts, first, total: first + pts[1][0] - k.x - 4, innerH: k.innerH };
});
const TAIKO_PATHS = TOTTORI_TAIKOGANARA_PLAN.paths.map(p => ({ ...p, pts: p.pts.map(([x, z]) => [TAIKO.x + x, TAIKO.z + z]) }));
const TAIKO_SIDES = [-1, 1];
const TAIKO_HOLLOW = TOTTORI_TAIKOGANARA_PLAN.kuruwa.find(k => k.id === 'kubochi');
const TAIKO_PATH_LISTS = TAIKO_PATHS.map(p => [p.pts]);
const TAIKO_ROADS = TAIKO_PATHS.map(p => Object.assign(p.pts, { w: p.w }));
const TAIKO_EXIT = TAIKO_PATHS[1].pts[1];
const TAIKO_LINK = switchback([112, -65], TAIKO_EXIT, 5, 14);
const TAIKO_HORI = TOTTORI_TAIKOGANARA_PLAN.hori.map(h => horiboriHeight(
  h.pts.map(([x, z]) => [TAIKO.x + x, TAIKO.z + z]), { width: h.w, depth: h.deep }));
function taikoClear(x, z) {
  if ((Math.abs(x - TAIKO.x) < TX + TAIKO.bankW + 14 && Math.abs(z - TAIKO.z) < TZ + TAIKO.bankW + 14)
    || (x > TAIKO.x + TX - 27 && x < TAIKO.x + TX + 14 && z > TAIKO.z + TZ && z < TAIKO.z + TZ + 45)) return true;
  for (let i = 0; i < TAIKO_PATHS.length; i++) if (roadDistance(x, z, TAIKO_PATH_LISTS[i]) < TAIKO_PATHS[i].w / 2 + 2) return true;
  return false;
}
import { jinkeiBuild } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x526782, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 太閤ヶ平を要に栗谷・円護寺・雁金山へ囲む。付城ごとの細かな位置と人数は復元。
// 雁金山の宮部継潤・垣屋駿河守の在陣は「山縣長茂覚書」による（県史だより第103回）。
// 同覚書で丸山方面を受け持つ秀長は、丸山城の西の既存の付城へ置く。距離・陣所は復元。
// https://www.pref.tottori.lg.jp/item/847202.htm
// 信長公記・経家の書状に伝わる兵糧攻め。農民は戦う兵の数に入れない。
const TOTTORI_ATTACK = sonaePlan('付城と兵糧の道の囲み', 0, TAIKO, -Math.PI / 2, [
  ['honjin', '本陣', '羽柴秀吉', 6000, TAIKO.x, TAIKO.z, -Math.PI / 2, 'oda', 'none'],
  ['hidenaga', '丸山方面の囲み', '羽柴秀長', 4000, -132, -210, Math.PI / 2, 'oda', 'none'],
  ['kuridani', '栗谷側の付城', '名は伝わらない', 4000, -24, -12, Math.PI, 'oda', 'oda', 24, 14, 9],
  ['engoji', '円護寺側の付城', '名は伝わらない', 3000, -36, -186, Math.PI / 2, 'oda', 'oda', 18, 24, 14],
  ['karigane', '雁金山の宮部・垣屋の備え', '宮部継潤', 3000, 28, -210, Math.PI, 'oda', 'oda', 18, 18, 10],
]);
const TOTTORI_DEFEND = sonaePlan('山上と麓の守り', 1, { x: CASTLE.x, z: CASTLE.z }, 0, [
  ['honjin', '本陣', '吉川経家', 500, CASTLE.x, CASTLE.z, 0, 'mori', 'mori'],
  ['foot', '麓の木戸と兵糧の番', '森下道誉', 500, GATE.x + 24, GATE.z - 18, 0, 'mori', 'mori'],
  ['ridge', '山上の曲輪の控え', '中村春続', 400, CASTLE.x + 12, CASTLE.z - 6, 0, 'mori', 'mori'],
]);

const TOTTORI_MARUYAMA = sonaePlan('丸山城の守り', 1, { x: -28, z: -222 }, 0, [
  ['honjin', '本陣', '奈佐日本之介', null, -28, -222, 0, 'mori', 'mori'], // 城兵数は不明。鳥取城の千四百と別に扱う。
]);

// 添付の甲冑本：低い弁柄の陣笠と黒・茶の漆胴、紺の小袖へ。白い首布は付けない。
const ODA = { flag: 'oda', armor: 0x292520, hatColor: 0x38251f, lace: 0x4b5360, cloth: 0x293b48, kasaDrape: false };
const KUMIGASHIRA = { flagScale: 1.25 }; // 大きな指物で川岸と柵の組頭を見つけられる。
// 前線の侍は金の三日月と、頬・眉・鼻の彫りがある素顔。名のある城将の具足は保つ。
const BANK_SAMURAI = { hat: 'kabuto_f', menpo: 0, skin: 0xaa805e,
  face: { w: 0.97, jaw: 1.1, chin: 1.0, cheek: 1.3, gaunt: 0.8, brow: 1.35, nose: 1.2, nw: 1.0, eye: 1.1, t: 3 } };
const KIKKAWA = { flag: 'mori', armor: 0x49332b, hatColor: 0x63372c, lace: 0x756651, cloth: 0x343d3d, kasaDrape: false };
const HUNGRY = { flag: 'mori', armor: 0x4a463c, hatColor: 0x553b30, lace: 0x5a5444, cloth: 0x8a806a, kasaDrape: false };   // 飢えた城兵：色の褪せた、ぼろの具足（B098）           // 吉川は毛利の一門（毛利の紋で）
// 飢えは傷と分ける。背丈と槍の長さを保ち、既存の体を細くして歩幅を抑える。
function hungryLook(g) {
  for (const u of g.units) {
    u.mesh.scale.set(0.88, 1, 0.9);
    u.speed *= 0.8; u.run = Math.min(u.run * 0.8, u.speed * 1.15);
    u.fat = Math.max(u.fat || 0, 0.7);
  }
}
const trap = (d, hw, edge) => { const t = Math.max(0, Math.min(1, (hw - d) / edge)); return t * t * (3 - 2 * t); };

const SEATS = TOTTORI_SEATS;
const BANK_FORT = SEATS.find(k => k.id === 'kuridani');
// 本の段状の曲輪を参考にした推定。寸法・道・平場は保ち、角だけ尾根へなじませる。
const seatCut = k => Math.min(6, k.w * .4, k.d * .4);
function seatEdge(k, x, z) {
  const dx = Math.abs(x - k.x), dz = Math.abs(z - k.z), cut = seatCut(k);
  return cut ? Math.max(dx - k.w, dz - k.d, (dx + dz - k.w - k.d + cut) * Math.SQRT1_2)
    : Math.max(dx - k.w, dz - k.d);
}
function seatOutline(k) {
  const x0 = k.x - k.w, x1 = k.x + k.w, z0 = k.z - k.d, z1 = k.z + k.d, c = seatCut(k);
  return c ? [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c],
    [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c], [x0 + c, z0]]
    : [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
}
function tottoriLookout(W, x, z, team = 0, boarded = false, height = 8.8) {
  // 材質・形・遠景の粗い形・登れる床は共有部品をそのまま使う。
  return yagura(W, x, z, true
    ? { team, mon: team ? 'mori' : 'oda', boarded, logFrame: true, crossLashings: true, height } : {});
}
// 写真の丸太・板・縄の備えを、長囲いの持ち場の両端に集める推定復元。
// 中央の乱戦・岸への往復路には置かず、細部は近い陣だけ。更新処理と光源は増やさない。
function tottoriCampTools(rt) {
  const W = rt.world, pieces = [[], [], [], []];
  const pose = new THREE.Object3D(), color = new THREE.Color();
  const wood = 0x766044, bamboo = 0x8b8753, rope = 0xafa080, iron = 0x302c27;
  const add = (kind, x, y, z, sx, sy, sz, col, rx = 0, ry = 0, rz = 0) => {
    pose.position.set(x, y, z); pose.rotation.set(rx, ry, rz); pose.scale.set(sx, sy, sz);
    pose.updateMatrix(); pieces[kind].push({ matrix: pose.matrix.clone(), col });
  };
  // 七本の竹を束ねた備蓄。節と二か所の縄で、一本の緑の柱に見せない。
  for (const [x, z] of [[-24, 37], [-22.8, 37.3], [48, 29], [49.2, 29.3]]) {
    const y = W.heightAt(x, z);
    for (let j = 0; j < 7; j++) {
      const a = j * Math.PI / 3, r = j === 6 ? 0 : .19;
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, h = 1.85 + (j % 3) * .09;
      add(1, bx, y + h / 2, bz, .095, h, .095, j % 2 ? bamboo : 0x777849);
      for (let k = 1; k < 5; k++) add(1, bx, y + k * .37, bz, .105, .035, .105, 0x686b40);
    }
    for (const h of [.45, 1.42]) add(2, x, y + h, z, .3, .3, .65, rope, Math.PI / 2);
  }
  // 板盾を控えの脇へ立て掛ける。写真二枚目の木幌の板面と横桟を参考に、車は付けない。
  for (const [x, z] of [[-26, 40], [46, 35]]) {
    const y = W.heightAt(x, z);
    for (let k = 0; k < 3; k++) {
      const bx = x + k * 1.18;
      for (let j = 0; j < 4; j++) add(0, bx + (j - 1.5) * .25, y + .94, z,
        .24, 1.85, .065, j % 2 ? 0x867350 : 0x79674a, -.12);
      for (const h of [.4, 1.4]) add(0, bx, y + h, z + .08 - (h - .94) * .12,
        1.04, .09, .09, wood);
      add(1, bx, y + .55, z + .42, .055, 1.2, .055, wood, -.65);
    }
    // 盾の後ろに積んだ短い薪。全て同じ六角柱で端面の形を保つ。
    for (let j = 0; j < 9; j++) add(1, x + (j % 3) * .21, y + .13 + Math.floor(j / 3) * .18,
      z + 1, .1, 1.3 - (j % 2) * .15, .1, j % 2 ? wood : 0x5b4b36, Math.PI / 2);
  }
  // 既存の焚火を炊事場へ。黒い釜と口縁、吊り縄、二股の支柱と横木。
  // 火・煙は既存の二基を使い、飢えた城内には炊事場や米を置かない。
  for (const [x, z] of [[-10, 30], [20, 34]]) {
    const y = W.heightAt(x, z);
    for (const side of [-1, 1]) {
      const bx = x + side * .85, ground = W.heightAt(bx, z);
      add(1, bx, ground + .9, z, .06, 1.8, .06, wood);
      add(1, bx - side * .07, ground + 1.7, z, .035, .4, .035, wood, 0, 0, side * .45);
    }
    add(1, x, y + 1.72, z, .055, 2, .055, wood, 0, 0, Math.PI / 2);
    add(1, x, y + 1.3, z, .018, .8, .018, rope);
    add(3, x, y + .85, z, .42, .4, .42, iron);
    add(1, x, y + .8, z, .41, .015, .41, 0x24231e);
    add(2, x, y + .85, z, .42, .42, .7, iron, Math.PI / 2);
    for (const side of [-1, 1]) add(1, x + side * .32, y + .95, z,
      .022, .3, .022, iron, 0, 0, side * .45);
    // 火から離した水桶。細板の胴と二つの箍、上面は暗い水色。
    const bx = x + 1.9, bz = z + .6, by = W.heightAt(bx, bz);
    add(1, bx, by + .28, bz, .29, .55, .29, wood);
    add(1, bx, by + .56, bz, .25, .015, .25, 0x373c35);
    for (const h of [.12, .44]) add(2, bx, by + h, bz, .29, .29, .7, iron, Math.PI / 2);
  }
  const shapes = [new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(1, 1, 1, 6),
    new THREE.TorusGeometry(1, .06, 3, 10), new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)];
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  pieces.forEach((parts, kind) => {
    const mesh = new THREE.InstancedMesh(shapes[kind], material, parts.length);
    parts.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); mesh.setColorAt(i, color.setHex(part.col)); });
    // 小物の影は受けるだけ。四束にまとめ、遠方の山城へ細部を複製しない。
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh);
  });
}
// 太閤ヶ平の内陣は四か月の兵糧攻めの本陣。陣幕の外の北と東の縁に板葺きの陣小屋を並べ、脇に兵糧の俵を積む（本の春日山 CG の段の小屋の詰まり方）。
// 棟数と位置は推定。登り道・櫓台への坂・旗本と控えの場は空け、小屋は一つの束へ結合する。
function taikoBarracks(rt, W) {
  const batch = makeSimpleBatch();
  const spots = [[-6, -23, 0], [3, -23, 0], [12, -23, 0], [21, -23, 0], [-15, -23, 0],
    [22, -13, Math.PI / 2], [-15, -8, Math.PI / 2]];
  const placed = [];
  for (const [dx, dz, rot] of spots) {
    const x = TAIKO.x + dx, z = TAIKO.z + dz, w = 7, d = 4, c = Math.cos(rot), s = Math.sin(rot);
    let low = Infinity, high = -Infinity, clear = true;
    for (const ex of [-w / 2 - .6, 0, w / 2 + .6]) for (const ez of [-d / 2 - .6, 0, d / 2 + .6]) {
      const px = x + ex * c + ez * s, pz = z - ex * s + ez * c, y = W.heightAt(px, pz);
      low = Math.min(low, y); high = Math.max(high, y);
      if (roadDistance(px, pz) < 2.8 || Math.abs(px - TAIKO.x) > TX - 1.5 || Math.abs(pz - TAIKO.z) > TZ - 1.5) clear = false;
    }
    if (!clear || high - low > .6) continue;
    hut(W, x, z, w, d, rot, { ita: true, minka: false, h: 2.1, wall: placed.length % 2 ? 0x746957 : 0x82735e, batch });
    placed.push([x, z, rot]);
  }
  finalizeSimpleBatch(rt, batch);
  // 兵糧は小屋の妻側に二山だけ。俵の形と材質は共通の物を使い回す。
  for (const [x, z, rot] of placed.filter((_, i) => i % 3 === 1)) {
    const px = x + Math.cos(rot) * 5.2, pz = z - Math.sin(rot) * 5.2;
    if (roadDistance(px, pz) > 3) rt.scene.add(tawara(W, px, pz, rot, 6));
  }
}
// 千代川の対岸（西岸）に、川を塞ぐ羽柴方の陣小屋（板葺き）と篝火。持ち場から川越しに最初の画面の正面に入る。
// 棟数と位置は推定。水と道を避け、一つの束へ結合する。
function tottoriBankHuts(rt, W) {
  const batch = makeSimpleBatch(), placed = [];
  for (const [x, z, rot] of [[-89, 2, 1.45], [-91, -9, 1.6], [-88, 13, 1.35], [-93, 22, 1.5]]) {
    let low = Infinity, high = -Infinity, clear = true;
    for (const ex of [-3.2, 0, 3.2]) for (const ez of [-2.2, 0, 2.2]) {
      const px = x + ex * Math.cos(rot) + ez * Math.sin(rot), pz = z - ex * Math.sin(rot) + ez * Math.cos(rot), y = W.heightAt(px, pz);
      low = Math.min(low, y); high = Math.max(high, y);
      if (roadDistance(px, pz) < 2.8 || W.waterDepthAt(px, pz) > 0) clear = false;
    }
    if (!clear || high - low > 1.1) continue;
    hut(W, x, z, 7, 4, rot, { ita: true, minka: false, h: 2.1, wall: placed.length % 2 ? 0x746957 : 0x82735e, batch });
    placed.push([x, z, rot]);
  }
  finalizeSimpleBatch(rt, batch);
  // 小屋の川側に篝火を二基。暗い対岸に板壁と屋根の形を浮かせ、川面へ照りを落とす。
  const fires = placed.filter((_, i) => i < 2).map(([x, z]) => [x + 5.5, z + 4.5]).filter(([x, z]) => W.waterDepthAt(x, z) <= 0);
  if (fires.length) {
    rt.scene.add(kagaribiBatch(W, fires));
    for (const [x, z] of fires) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 16, lightColor: 0xff8a3a, lightStrength: 1.4, lightDecay: 0, waterReflection: true });
  }
}
// 持ち場の北、毛利の舟の荷揚げ場。岸へ下ろした兵糧の俵の山・篝火・毛利の幟と、川上に繋いだ小舟。
// 持ち場から最初の画面の正面に入る。俵は当たりを持たせず（岸の道順を変えない）、篝火は既存の光の付け替えだけ。
function tottoriLanding(rt, W) {
  for (const [x, z, rot, n] of [[-50, -40, .3, 6], [-47.5, -44, -.2, 6], [-52, -47, .1, 5], [-46, -50, .5, 3], [-50.5, -53, -.4, 6]]) {
    rt.scene.add(tawara(W, x, z, rot, n, { solid: false }));
  }
  // 岸の道（羽柴の川岸の組から舟まで）にも二基。暗い一枚の地面に火の照りの溜まりを作る。
  const fires = [[-45, -38], [-44, -55], [-55, -60], [-41, -14], [-47, -26]];
  rt.scene.add(kagaribiBatch(W, fires));
  for (const [x, z] of fires) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 16, lightColor: 0xff8a3a, lightStrength: 1.4, lightDecay: 0 });
  for (const [x, z] of [[-48, -58], [-43, -60], [-53, -36]]) rt.scene.add(nobori(W, x, z, 'mori', 5.5));
  // 川上だけに隠さず、岸の組の対面から奥へ三艘を連ねる。
  // 放火する二艘より沖へ離し、同じ七歩の船体と材質を使い回す。
  for (const [z, rot] of [[10, -.10], [-10, -.05], [-26, .08]]) {
    const x = riverX(z) - 1.5, y = W.heightAt(x, z) + W.waterDepthAt(x, z);
    rt.scene.add(kobune(x, y + .05, z, rot, 7));
  }
}
// 久松山の西の斜面（川岸から見上げる面）に、段の平場と板小屋・柵を重ねる。月明かりで段の影が読める明るさの土と板。
// 段の数・位置は推定の補景。見た目だけで当たりも兵の配置も足さず、形と材質は三つの束にまとめる。
// 手前の栗谷側の付城には羽柴方の陣幕と兵糧の俵を置く。
function hisamatsuTerraces(rt, W) {
  const R = new THREE.Object3D(), pads = [], tops = [], walls = [], wood = [], lamps = [], spots = [];
  const put = (list, x, y, z, sx, sy, sz, ry, rz = 0) => list.push([x, y, z, sx, sy, sz, ry, rz]);
  for (const [li, L] of [18, 32, 46, 60].entries()) {
    for (let z = -44 - li * 3; z > -122; z -= 10 + li % 2 * 2) {
      let x0 = null;
      for (let x = -75; x < 10; x += 0.5) if (W.heightAt(x, z) >= L) { x0 = x; break; }
      if (x0 === null || roadDistance(x0, z) < 5) continue;
      const gx = W.heightAt(x0 + 1, z) - W.heightAt(x0 - 1, z), gz = W.heightAt(x0, z + 1) - W.heightAt(x0, z - 1);
      const gl = Math.hypot(gx, gz) || 1, ox = -gx / gl, oz = -gz / gl, ry = Math.atan2(-oz, ox);
      // 外へ張り出す平場と、下の切岸まで届く土の面。
      // 平場の半分は山へ埋め、外へは二歩半だけ張り出す。切岸の面は下の斜面へ潜るまで伸ばす。
      const cx = x0, cz = z, foot = W.heightAt(x0 + ox * 3, z + oz * 3);
      const depth = Math.max(1.2, Math.min(8, L - foot + 1));
      put(pads, cx, L - 0.3 - depth / 2, cz, 5, depth, 8.5, ry);
      put(tops, cx, L - 0.15, cz, 5.2, 0.3, 8.7, ry);
      // 板小屋は段の三つに二つ。山側へ寄せ、片流れの板屋根を外へ下げる。
      if ((li + Math.round(z)) % 3 !== 0) {
        const hx = x0 - ox * 0.6, hz = z - oz * 0.6;
        put(walls, hx, L + 1, hz, 2.6, 2, 4.2, ry);
        put(wood, hx + ox * 0.2, L + 2.25, hz + oz * 0.2, 3.4, 0.12, 4.8, ry, -0.32);
        // 外を向く戸口の隙から漏れる灯り。夜の山肌で段の並びを読ませる。
        put(lamps, hx + ox * 1.32, L + 0.9, hz + oz * 1.32, 0.05, 1.1, 0.5, ry);
      }
      // 段の縁の柵：杭と二本の横木。
      const ex = x0 + ox * 2.35, ez = z + oz * 2.35, tx = -oz, tz = ox;
      for (let k = -4; k <= 4; k += 1.33) put(wood, ex + tx * k, L + 0.7, ez + tz * k, 0.13, 1.4, 0.13, ry);
      for (const yy of [0.55, 1.15]) put(wood, ex, L + yy, ez, 0.07, 0.08, 8.2, ry);
      spots.push({ x0, z, L, ox, oz, ry, ex, ez, tx, tz, hut: (li + Math.round(z)) % 3 !== 0 });
    }
  }
  // 上の段には城の共通の部品：段の縁に板塀、高い段の三か所に二重の櫓（板壁・板葺き）。山腹の灯りで月夜にも屋根の形を見せる。
  let yaguraLeft = 3;
  for (const q of spots.filter(q => q.L >= 32).sort((a, b) => b.L - a.L || a.z - b.z)) {
    castlePart(W, 'hei', { pts: [[q.ex - q.tx * 4, q.ez - q.tz * 4], [q.ex + q.tx * 4, q.ez + q.tz * 4]], yAt: () => q.L, h: 2.1, kind: 'ita', sama: 1.6 }, { era: 'early' });
    if (q.hut || !yaguraLeft || q.L < 46) continue;
    yaguraLeft--;
    const yx = q.x0 - q.ox * 0.4, yz = q.z - q.oz * 0.4;
    castlePart(W, 'niju', { x: yx, z: yz, rot: q.ry, y: q.L, w: 6, d: 4.6, h1: 3.6, h2: 2.8, stone: q.L - 1.2 }, { era: 'early' });
    W.addFire(yx + q.ox * 3.2, yz + q.oz * 3.2, { torch: true, h: q.L - W.heightAt(yx + q.ox * 3.2, yz + q.oz * 3.2) + 1.2, size: 0.5, smoke: false, lightRadius: 14, lightColor: 0xffa060, lightStrength: 1.4, lightDecay: 0 });
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const [list, mat] of [[pads, new THREE.MeshLambertMaterial({ color: 0x4e4436, emissive: 0x0b0c10 })], [tops, new THREE.MeshLambertMaterial({ color: 0x8a7a62, emissive: 0x15171d })], [walls, new THREE.MeshLambertMaterial({ color: 0xa89878, emissive: 0x1b1c22 })],
    [wood, new THREE.MeshLambertMaterial({ color: 0x5e4f3e, emissive: 0x101116 })], [lamps, new THREE.MeshBasicMaterial({ color: 0xffa04a })]]) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(box, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const q = list[i]; R.position.set(q[0], q[1], q[2]); R.rotation.set(0, q[6], q[7]); R.scale.set(q[3], q[4], q[5]); R.updateMatrix(); mesh.setMatrixAt(i, R.matrix);
    }
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh);
  }
  // 手前の付城の平場：道と番所を避けた所に陣幕を一張り、脇へ兵糧の俵を二山。
  const k = BANK_FORT;
  for (const [x, z] of [[k.x + 6, k.z + 2], [k.x + 4, k.z - 4], [k.x - 2, k.z + 3]]) {
    let ok = true;
    for (const dx of [-5, 0, 5]) for (const dz of [-4, 0, 4]) if (roadDistance(x + dx, z + dz) < 3 || seatEdge(k, x + dx, z + dz) > -0.5) ok = false;
    if (!ok) continue;
    rt.scene.add(jinmaku(W, x, z, 8, 6, 4, { mon: 'oda', contour: true }));
    for (const [tx, tz, r] of [[x - 5.5, z + 1, 0.3], [x + 5.5, z - 1, -0.2]]) if (roadDistance(tx, tz) > 2.5) rt.scene.add(tawara(W, tx, tz, r, 6));
    break;
  }
}
// 曲輪の奥に低い物置を添え、屋敷一棟だけが広い空地に立つ並びを避ける。
// 細かな位置は推定。道・屋敷・民のいる木戸内には増やさず、板小屋を既存の束へ結合する。
function tottoriOutbuildings(W, batch) {
  for (const [id, x, z, w, d, rot] of [
    ['sanjo', -4, -149, 5, 3, 0],
    ['maruyama', -28, -232, 6, 3, 0],
    ['karigane', 27, -216, 4, 3, Math.PI / 2],
    ['hidenaga', 109, -92, 7, 3, 0],
    ['hamasaka', -132, -214, 4, 3, Math.PI / 2],
  ]) {
    const k = SEATS.find(k => k.id === id), c = Math.cos(rot), s = Math.sin(rot);
    let low = Infinity, high = -Infinity, clear = true;
    // 軒先まで道と切岸から離す。小屋のために平場や兵の配置は変えない。
    for (const dx of [-w / 2 - .8, 0, w / 2 + .8]) for (const dz of [-d / 2 - .8, 0, d / 2 + .8]) {
      const px = x + dx * c + dz * s, pz = z - dx * s + dz * c, y = W.heightAt(px, pz);
      low = Math.min(low, y); high = Math.max(high, y);
      if (seatEdge(k, px, pz) > -2 || roadDistance(px, pz) < 2.8) clear = false;
    }
    if (!clear || high - low > .65) continue;
    hut(W, x, z, w, d, rot, { ita: true, minka: false, h: 2.1,
      wall: id === 'sanjo' ? 0x746957 : 0x82735e, batch });
  }
}
// 本の山城の板塀を参考に、上端を薄い笠板で覆う。鳥取の上段だけに適用する。
// 千代川の向こう（北西）に持ち場から見える高い山（浜坂側の付城の山・比高約70m）。川へ向く東の面に段の板塀と
// 二重の櫓、頂に大きな櫓を城の共通の部品で建て、灯りで月夜にも屋根の形を見せる（遠景だけ・当たりなし。配置は推定）。
const FAR_VIEW = { x: -116, z: -150 };   // 持ち場から肩越しに向ける川向こうの尾根と山の城の真ん中
function farHillCastle(rt, W) {
  const o = { era: 'early' };
  for (const [li, L] of [30, 50].entries()) for (const z of [-194, -206, -218]) {
    let x0 = null;
    for (let x = -88; x > -150; x -= 0.5) if (W.heightAt(x, z) >= L) { x0 = x; break; }
    if (x0 === null) continue;
    castlePart(W, 'hei', { pts: [[x0 + 1, z - 5], [x0 + 1, z + 5]], yAt: () => L + 0.2, h: 2.2, kind: 'ita', sama: 1.6 }, o);
    if ((li + Math.round(z / 12)) % 2 === 0) {
      castlePart(W, 'niju', { x: x0 - 3.5, z, rot: Math.PI / 2, y: L, w: 7, d: 5.5, h1: 3.8, h2: 3, stone: L - 1.5 }, o);
    }
    W.addFire(x0 + 2, z + 3, { torch: true, h: L - W.heightAt(x0 + 2, z + 3) + 1.3, size: 0.6, smoke: false, nightOnly: true, lightRadius: 16, lightColor: 0xffa060, lightStrength: 1.6, lightDecay: 0 });
  }
  // 川向こうの低い尾根（比高約12m）にも、川へ向く段の板塀と二重櫓を二か所。持ち場から西・北西を見た奥に屋根が並ぶ。
  for (const z of [-84, -112, -138]) {
    let x0 = null;
    for (let x = -90; x > -140; x -= 0.5) if (W.heightAt(x, z) >= 8) { x0 = x; break; }
    if (x0 === null) continue;
    castlePart(W, 'hei', { pts: [[x0 + 1, z - 7], [x0 + 1, z + 7]], yAt: () => 8.2, h: 2.2, kind: 'ita', sama: 1.6 }, o);
    castlePart(W, 'niju', { x: x0 - 5, z, rot: Math.PI / 2, y: W.heightAt(x0 - 5, z), w: 8, d: 6, h1: 4, h2: 3.2, stone: W.heightAt(x0 - 5, z) - 1.5 }, o);
    W.addFire(x0 + 2, z + 4, { torch: true, h: 8 - W.heightAt(x0 + 2, z + 4) + 1.3, size: 0.6, smoke: false, nightOnly: true, lightRadius: 16, lightColor: 0xffa060, lightStrength: 1.6, lightDecay: 0 });
  }
  const top = TOTTORI_SEATS.find(k => k.id === 'hamasaka');
  castlePart(W, 'niju', { x: top.x + 4, z: top.z + 2, rot: Math.PI / 2, y: top.y, w: 10, d: 7.5, h1: 4.4, h2: 3.4, stone: top.y - 1.5 }, o);
  W.addFire(top.x + 10, top.z + 2, { torch: true, h: top.y - W.heightAt(top.x + 10, top.z + 2) + 1.3, size: 0.7, smoke: false, nightOnly: true, lightRadius: 18, lightColor: 0xffa060, lightStrength: 1.8, lightDecay: 0 });
}
// 久松山の麓：持ち場の右手の切岸の裾を野面積みの石垣で締め、前に細い水堀（手本の写真の石垣と堀の水）。
// 石垣の脇の篝火で、月夜にも石の一つ一つと水の照りを見せる。道の交わる所は空ける（当たりなし・配置は推定）。
function hisamatsuFootIshigaki(rt, W) {
  const runs = [];
  let run = null;
  for (let z = -12; z >= -86; z -= 2) {   // 北から南へ並べ、石の面を川側（西）へ向ける
    let xf = null;
    for (let x = -62; x < -16; x += 0.5) if (W.heightAt(x, z) >= 2.4) { xf = x - 0.6; break; }
    const ok = xf !== null && roadDistance(xf - 2.5, z) > 3.5 && W.heightAt(xf + 4, z) > W.heightAt(xf, z) + 3;
    if (ok) (run || runs[runs.push([]) - 1]).push([xf, z]);
    run = ok ? runs[runs.length - 1] : null;
  }
  const strip = [], idx = [], lamps = [];
  for (const pts of runs) {
    if (pts.length < 4) continue;
    castlePart(W, 'ishigaki', { pts, top: (x, z) => Math.min(W.heightAt(x, z) + 6.5, W.heightAt(x + 3, z) + 0.3), kind: 'nozura' }, { era: 'early' });
    // 堀の外の縁石（低い一段）と、その間の水。水面は地面より少し上に置き、縁石の内へ収める。
    const lip = pts.map(([x, z]) => [x - 4.6, z]);
    castlePart(W, 'ishigaki', { pts: lip, top: (x, z) => W.heightAt(x, z) + 0.95, kind: 'nozura' }, { era: 'early' });
    const base = strip.length / 3;
    for (const [x, z] of pts) {
      const y = Math.max(W.heightAt(x - 0.4, z), W.heightAt(x - 4.4, z)) + 0.55;
      strip.push(x - 0.2, y, z, x - 4.6, y, z);
    }
    for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    for (let i = 2; i < pts.length - 1; i += 9) lamps.push([pts[i][0] - 6, pts[i][1]]);
  }
  if (!strip.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x080c0c, roughness: 0.06, metalness: 0, envMapIntensity: 0.1 }));
  water.receiveShadow = true; rt.scene.add(water);
  rt.scene.add(kagaribiBatch(W, lamps));
  for (const [x, z] of lamps) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 20, lightColor: 0xffa060, lightStrength: 2.2, lightDecay: 0, waterReflection: true });
}
const tottoriBoardFence = (W, seg, o = {}) => castleBoardFence(W, seg, { ...o, boardCap: true });
function tottoriRoofWeights(rt) {
  // 板屋根の押さえ桟は前巡で作成済み。今回は桟の上の平たい重石だけを補う。
  // 小祠と檜皮の主殿には置かない。全棟で形・材質と描く一束を共用する。
  const houses = TOTTORI_HOUSES.filter(b => !b.residence && b.kind !== 'shrine');
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x777264, roughness: 1 }), houses.length * 4);
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion();
  const scale = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  let i = 0;
  for (const b of houses) {
    const base = interiorBase(rt.world, b.x, b.z, b.w, b.d);
    const rd = b.d + 1.2, lz = rd * .72 / 2;
    // 切妻の棟と平行な桟へ載せる。高さは共通の板屋根と同じ勾配から求める。
    const y = base + 3 + .16 + Math.tan(.36) * (rd / 2 - lz);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const seed = i++;
      q.setFromAxisAngle(axis, seed * 1.73);
      scale.set(.26 + (seed % 3) * .035, .105, .19 + (seed % 2) * .035);
      matrix.compose(p.set(b.x + end * b.w * .3, y + .13, b.z + side * lz), q, scale);
      stones.setMatrixAt(seed, matrix);
    }
  }
  stones.castShadow = true; stones.receiveShadow = true; rt.scene.add(stones);
}
// 主殿と山上の長屋の縁側に、写真のような柱付きの板葺き下屋を掛ける。
// 二棟ぶんの板・桁・柱を一つの基本形と材質で描く。戸口と既存の床は保つ。
function tottoriLeanTo(rt) {
  const houses = TOTTORI_HOUSES.filter(b => b.seat === 'sanjo' && (b.residence || !b.kind));
  const parts = [], pitch = Math.atan2(.3, 1.65);
  for (const b of houses) {
    const y = interiorBase(rt.world, b.x, b.z, b.w, b.d);
    const n = Math.ceil((b.w + .7) / .38), step = (b.w + .7) / n;
    for (let j = 0; j < n; j++) parts.push({ x: b.x - (b.w + .7) / 2 + (j + .5) * step,
      y: y + 2.87, z: b.z + b.d / 2 + .675, w: step - .009, h: .065,
      d: Math.hypot(1.65, .3), rot: pitch, col: j % 4 ? 0x776651 : 0x8a7963 });
    parts.push({ x: b.x, y: y + 2.65, z: b.z + b.d / 2 + 1.35,
      w: b.w + .8, h: .14, d: .13, col: 0x534633 });
    for (const t of [-.5, -.25, .25, .5]) {
      const x = b.x + b.w * t, z = b.z + b.d / 2 + 1.3;
      parts.push({ x, y: y + 1.53, z, w: .12, h: 2.26, d: .12, col: 0x62543f });
      solidCircle(x, z, .09);
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 1 }), parts.length);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  parts.forEach((b, i) => {
    pose.position.set(b.x, b.y, b.z); pose.rotation.set(b.rot || 0, 0, 0);
    pose.scale.set(b.w, b.h, b.d); pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix); mesh.setColorAt(i, color.setHex(b.col));
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = true;
  rt.scene.add(mesh);
}
// 曲輪の外周とは別に主殿の敷地を板塀で囲む。写真の屋敷間の細い通路を残す。
function tottoriResidenceFence(rt, noT, batch) {
  const b = TOTTORI_HOUSES.find(b => b.residence), w = b.w / 2 + 2.8;
  const back = b.z - b.d / 2 - 3.3, front = b.z + b.d / 2 + 2.5;
  const corners = [[b.x - w, front], [b.x - w, back], [b.x + w, back],
    [b.x + w, front], [b.x - w, front]];
  for (let j = 1; j < corners.length; j++) {
    const [ax, az] = corners[j - 1], [bx, bz] = corners[j];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let i = 0; i < n; i++) {
      const a = i / n, c = (i + 1) / n;
      // 既存の屋敷道・城道の口は塀にも当たりにも使わない。
      if (roadDistance(ax + (bx - ax) * (a + c) / 2, az + (bz - az) * (a + c) / 2) < 2.8) continue;
      noT(wallLine(rt, [[ax + (bx - ax) * a, az + (bz - az) * a],
        [ax + (bx - ax) * c, az + (bz - az) * c]],
      { team: 1, hp: 1e9, name: '主殿の板塀', mesh: tottoriBoardFence, h: 2.1,
        // 屋敷の間仕切りは狭間のない板塀。内側の二段の桟で板を留める。
        meshOpt: { batch, h: 2.1, plainBoards: true, boardRailsSide: 1 } }));
    }
  }
}
const APPROACHES = SEATS.filter(k => !['sanjo', 'obi', 'kido', 'east'].includes(k.id)).map(k =>
  [[k.x, k.z + k.d + 20], [k.x, k.z + k.d], [k.x, k.z]]);
const HOUSE_PATHS = TOTTORI_HOUSES.map(b => {
  const k = SEATS.find(k => k.id === b.seat) || TAIKO;
  const frontZ = b.seat === 'east' ? -94 : k.z + 5;
  return [[k.x, frontZ], [b.x, frontZ], [b.x, b.z + b.d / 2 + 1.8]];
});
const RIDGE_PATHS = [[[10, -142], [10, -164]], [[10, -128], [26, -128], [26, -94], [34, -94]],
  switchback([28, -198], [30, -180], 3, 12), switchback([-28, -186], [-28, -198], 3, 10)];
const LOOKOUT_PATHS = SEATS.map(k => [[k.x, k.z + 5], [k.x + k.w - 4, k.z + 5], [k.x + k.w - 4, k.z + k.d - 2.1]]);
const LINK_PATHS = [TAIKO_LINK,
  switchback([-36, -110], [-36, -151], 5, 18), [[-28, -186], [-36, -171]],
  [[-14, 18], [-14, 8]], [[-132, -150], [-132, -180]], [[-132, -150], [-105, -150]]];
// 輪の位置と仕寄りの断面は、長い包囲を局地へ縮めた復元。既存の城道・川岸の任務を空ける。
const SIEGE_RING = [[-46, 18], [82, 22], [108, -80], [210, -190], [88, -222], [-112, -222], [-126, -116]];
const SIEGE_FORTS = [SIEGE_RING[1], SIEGE_RING[3], SIEGE_RING[4], SIEGE_RING[5], SIEGE_RING[6]];
const SHIYORI = [[54, 2], [64, -14], [50, -28], [64, -44], [52, -60]];
const SHIYORI_CUT = horiboriHeight(SHIYORI, { depth: .65, width: 4 });
const FORT_PATHS = SIEGE_FORTS.map(([x, z]) => [[x, z + 16], [x, z + 5], [x - 4, z + 5], [x - 4, z]]);
// 多くの民が城に籠もったことは県史による。外の少人数と在所・堂・道は推定復元。
// https://www.pref.tottori.lg.jp/item/847182.htm
// 近世の大きな城下町は置かず、既存の南の家々を疎らな在所として使う。
// 西の村は千代川・水路の西側、麓の町と小堂は東側を保って南へ退く。
const PEOPLE_TEMPLE = { x: 95, z: 138 };
const PEOPLE_PATHS = [
  [[-145, 120], [-163, 130], [-170, 182], [-180, 238]],
  [[50, 85], [48, 116], [48, 165], [48, 238]],
  [[82, 138], [86, 170], [95, 238]],
  [[-156, 175], [-170, 190], [-180, 238]],
];
const peopleRoute = pts => pts.slice(1).map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  { x: -145, z: 120, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: peopleRoute(PEOPLE_PATHS[0]) },
  { x: 50, z: 85, kinds: ['townsman', 'merchant', 'woman', 'child'], route: peopleRoute(PEOPLE_PATHS[1]) },
  { x: 48, z: 116, kinds: ['townsman', 'farmer', 'woman', 'child'], route: peopleRoute(PEOPLE_PATHS[1].slice(1)) },
  { x: 82, z: 138, kinds: ['monk', 'monk', 'woman', 'elder'], route: peopleRoute(PEOPLE_PATHS[2]) },
  // 城から脱出できた者は囲みの外の村へ。兵の組としては作らない。
  { x: -156, z: 175, kinds: ['farmer', 'woman', 'child', 'elder', 'farmer'], route: peopleRoute(PEOPLE_PATHS[3]) },
];
const siegeClear = (x, z) => SIEGE_FORTS.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 16) || roadDistance(x, z, [SHIYORI]) < 5;
const LOCAL_PATHS = [...CASTLE_ROADS, RETURN_ROAD, ...APPROACHES, ...RIDGE_PATHS, ...HOUSE_PATHS, ...LOOKOUT_PATHS, ...LINK_PATHS, ...TAIKO_PATHS.map(p => p.pts), ...TAIKO_RAMPS.map(r => r.pts), SHIYORI, ...FORT_PATHS, ...PEOPLE_PATHS];
const DITCH_HEIGHTS = TOTTORI_DITCHES.map(h => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
// 道との交点は土橋にする。計算の途中で点や配列を作らない。
function roadDistance(x, z, paths = LOCAL_PATHS) {
  let best = 6;
  for (const pts of paths) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x < Math.min(a[0], b[0]) - best || x > Math.max(a[0], b[0]) + best || z < Math.min(a[1], b[1]) - best || z > Math.max(a[1], b[1]) + best) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}
function heightRaw(x, z) {
  let h = 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  h += 40 * gauss(x, z, CASTLE.x + 10, CASTLE.z - 50, 5000);           // 久松山
  h += 125 * gauss(x, z, TAIKO.x, TAIKO.z, 10000);                       // 太閤ヶ平
  // 国土地理院の標高：戦場の外の遠い山肌にだけ、実際の起伏を足す（1 が実の約 2m）
  if (ttDem) h += demRelief(ttDem, x, z, { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.12 });
  // 久松山と太閤ヶ平の山肌に、実測の尾根と沢の凹凸を足す（国土地理院。手書きの山の形はそのまま）。
  // 山肌（高さ12m 超）だけに効かせ、岸・道・曲輪・付城の平場は後のならしで平らなまま。
  if (ttDem) {
    const slope = Math.max(0, Math.min(1, (h - 10) / 20));
    if (slope > 0) h += slope * demDetail(ttDem, x, z, { xy: 2, win: 40, scale: 0.22 });
  }
  h += yamaLift(x, z, LIFT);
  // 山肌だけに振幅0.4m、周期6〜9mの小起伏。道・曲輪のならしより先に足す。
  const rough = Math.max(0, Math.min(1, (h - 12) / 24));
  h += rough * (0.24 * Math.sin(x * (Math.PI * 2 / 8.2) + Math.sin(z * 0.12))
    + 0.16 * Math.sin(z * (Math.PI * 2 / 6.7) + Math.sin(x * 0.15)));
  // 平らな内陣の外に土塁と空堀。南大手・東搦手だけ土橋を残す。
  const lx = x - TAIKO.x, lz = z - TAIKO.z, dx = Math.abs(lx), dz = Math.abs(lz);
  const mainEdge = Math.max(dx - TX, dz - TZ);
  const hollowEdge = Math.max(Math.abs(lx - (TX - 8)) - 8, Math.abs(lz - (TZ + 15.5)) - 15.5);
  const edge = Math.min(mainEdge, hollowEdge);
  if (edge < TAIKO.bankW + 31) {
    const south = lz > TZ - 2 && dx < 12 ? trap(dx, TAIKO.gateW / 2 + 1, 1) : 0;
    const east = lx > TX - 2 ? trap(dz, TAIKO.eastGateW / 2 + 1, 1) : 0;
    const mouth = 1 - Math.max(south, east);
    const innerH = lx > TX - 2 && dz < 10 ? 1.8 : TAIKO.bankInnerH;
    const bank = edge >= 0 && edge <= TAIKO.bankW
      ? innerH * trap(Math.abs(edge - TB), TB, (TAIKO.bankW - TAIKO.bankTopW) / 2) * mouth : 0;
    // 下幅8m・上幅4m。堀底と内陣の基準面を分け、高さを取り違えない。
    const outside = edge > TB ? (TAIKO.bankInnerH - TAIKO.bankH + TAIKO.moatD) * (1 - trap(edge, TAIKO.bankW, TB)) : 0;
    let moat = 0;
    for (const cut of TAIKO_HORI) moat += cut(x, z);
    const bridge = Math.max(lz > TZ && dx < 12 ? trap(dx, TAIKO.southBridgeW / 2, .5) : 0,
      lx > TX ? trap(dz, TAIKO.eastBridgeW / 2, .5) : 0);
    const flat = trap(edge, TAIKO.bankW + 31, 20);
    h += (125 + outside + bank + moat * (1 - bridge) - h) * flat;
    // 南東の内法16×31mを三段の窪地にする。段差の高さは推定、斜面でつなぐ。
    if (hollowEdge < 0 && lz > TZ) {
      let drop = 0;
      for (let i = 0; i < TAIKO_HOLLOW.steps; i++) drop += TAIKO_HOLLOW.stepH * (1 - trap(lz - TZ, i * 31 / 3 + 2, 2));
      h -= drop * trap(hollowEdge, 0, 2);
    }
    // 南虎口の両脇の土塁を前へ出し、平入りの口へ横矢を掛ける。
    for (const side of TAIKO_SIDES) {
      const flank = trap(Math.max(Math.abs(lx - side * 9) - 2, Math.abs(lz - (TZ + TB + 2)) - 2), 2, 2);
      h += (127 - h) * flank;
    }
    let best = 2.4, rampH = h;
    for (const r of TAIKO_RAMPS) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], vx = b[0] - a[0], vz = b[1] - a[1], length = Math.hypot(vx, vz);
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (length * length)));
      const distance = Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz);
      if (distance < best) {
        best = distance;
        rampH = 125 + r.innerH * Math.min(1, ((i === 1 ? 0 : r.first) + t * length) / r.total);
      }
    }
    h += (rampH - h) * trap(best, 2.4, 1);
    for (const k of TAIKO_LOOKOUTS) {
      const pad = trap(Math.max(Math.abs(x - k.x) - k.w / 2, Math.abs(z - k.z) - k.d / 2), 3, 3);
      h += (125 + k.innerH - h) * pad;
    }
  }
  const roadGap = 1 - trap(roadDistance(x, z), 5, 2);
  for (const cut of DITCH_HEIGHTS) h += cut(x, z) * roadGap;
  // 千代川と東岸は山の裾から切り離す。舟が山腹を上る川にしない。
  const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
  // 川床の二十歩は平らなまま、山裾との間を広い斜面でつなぐ。
  const valley = trap(Math.abs(x - rx), 64, 44);
  h += (0.5 + z * 0.001 - h) * valley;
  if (z > -78 && z < 38 && x > -72 && x < -12) {
    // 番兵の川下の道まで平地をつなぐ。外周は十八歩で山へ戻し、六歩幅の壁を作らない。
    const edge = Math.min(x + 72, -12 - x, z + 78, 38 - z);
    const k = Math.max(0, Math.min(1, edge / 18));
    h += (0.6 + z * 0.001 - h) * k * k * (3 - 2 * k);
  }
  for (const seat of SEATS) {
    // 曲輪の外は土の斜面へゆっくり戻す。高い平場を三歩で落とす板状の崖にしない。
    const edge = seatEdge(seat, x, z);
    const k = trap(edge, 32, 32);
    h += (seat.y - h) * k;
    // 土塁も歩く地形に入れる。柵はこの稜線に建てる。
    h += 1.1 * trap(Math.abs(edge), 1.4, 1.4) * roadGap;
    // 切岸の裾の横堀。既存の登城路と戸口の道は土橋として残す。
    h -= 1.2 * trap(Math.abs(edge - 7), 3, 2) * roadGap;
  }
  // 尾根沿いの二本の土塁と、その外の浅い堀。城道を横切る所は空ける。
  for (const off of [-10, 10]) {
    const ax = TAIKO.x - TX - TAIKO.bankW - 12, az = TAIKO.z + off, bx = 70, bz = CASTLE.z + off;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const distance = ((x - ax - t * dx) * -dz + (z - az - t * dz) * dx) / Math.hypot(dx, dz);
    if (t > 0 && t < 1) {
      h += 0.7 * trap(Math.abs(distance), 1.3, 1.3);
      h -= 0.6 * trap(Math.abs(distance - Math.sign(off) * 3), 1.2, 1.2);
    }
  }
  for (const [fx, fz] of SIEGE_FORTS) {
    const r = Math.hypot(x - fx, z - fz);
    if (!(z > fz && Math.abs(x - fx) < 5)) h -= 1.2 * trap(Math.abs(r - 13), 2, 2);
  }
  h += 2.4 * gauss(x, z, 63, -65, 36);
  return h;
}
let BOAT_MODEL = null;
function boatMesh() {
  if (BOAT_MODEL) return BOAT_MODEL.clone();
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a7151, map: woodTex(), roughness: 0.95 });
  const outline = new THREE.Shape();
  outline.moveTo(0, -4.8); outline.lineTo(1.2, -3.4); outline.lineTo(1.2, 3.4);
  outline.lineTo(0, 4.8); outline.lineTo(-1.2, 3.4); outline.lineTo(-1.2, -3.4); outline.closePath();
  // 船底を絞り、舳先と艫を反らせる。薄い板の縁だけが水面に残る形にしない。
  const rim = [[0, -4.8], [1.2, -3.4], [1.2, 3.4], [0, 4.8], [-1.2, 3.4], [-1.2, -3.4]];
  const hull = new THREE.BufferGeometry(), hullVertices = [], hullUvs = [], hullIndices = [];
  for (const [x, z] of rim) {
    hullVertices.push(x, x === 0 ? 0.55 : 0.3, z, x * 0.55, -0.65, z * 0.85);
    hullUvs.push(z / 2, 1, z / 2, 0);
  }
  for (let i = 0; i < rim.length; i++) {
    const a = i * 2, b = ((i + 1) % rim.length) * 2;
    hullIndices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  hull.setAttribute('position', new THREE.Float32BufferAttribute(hullVertices, 3));
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(hullUvs, 2));
  hull.setIndex(hullIndices); hull.computeVertexNormals();
  g.add(new THREE.Mesh(hull, wood));
  const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: false }), wood);
  deck.rotation.x = -Math.PI / 2; g.add(deck);
  const rail = new THREE.BoxGeometry(0.16, 0.55, 6.8), tip = new THREE.BoxGeometry(0.16, 0.6, Math.hypot(1.2, 1.4));
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(rail, wood); m.position.set(side * 1.2, 0.4, 0); g.add(m);
    for (const end of [-1, 1]) {
      const m = new THREE.Mesh(tip, wood); m.position.set(side * 0.6, 0.43, end * 4.1);
      m.rotation.y = Math.atan2(-side * 1.2, end * 1.4); g.add(m);
    }
  }
  const straw = new THREE.MeshStandardMaterial({ color: 0xc1ae87, map: thatchTex(), roughness: 1 });
  const bale = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(bale, straw); t.rotation.z = Math.PI / 2; t.position.set(0, 0.45, -2.6 + i * 1.7); g.add(t); }
  // 苫は板屋根にせず、俵を覆う低い丸みを付ける。二艘で同じ形と材質を使う。
  const cover = new THREE.BufferGeometry(), vertices = [], uvs = [], indices = [];
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8 - 0.5) * 2.1, y = 0.8 + 0.45 * Math.sin(i / 8 * Math.PI);
    vertices.push(x, y, -1.9, x, y, 1.9);
    uvs.push(i / 8, 0, i / 8, 2);
    if (i < 8) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  cover.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  cover.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  cover.setIndex(indices); cover.computeVertexNormals();
  const matCover = straw.clone(); matCover.side = THREE.DoubleSide;
  g.add(new THREE.Mesh(cover, matCover));
  // 荷の火災と見分けられるよう、艫の小さな灯りに木の支えを付ける。
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), wood);
  lampPost.position.set(0, 0.75, 3); g.add(lampPost);
  for (const m of g.children) m.castShadow = true;
  BOAT_MODEL = g;
  return g.clone();
}


// 共通の割れ・苔・滑らかな法線を使い、伸縮と向きで形を変える。
function roundedStone() {
  return rockShape(1, true);
}

function dressTottoriNature(rt) {
  const W = rt.world, bark = barkTex('pine');
  for (const m of W.treeMeshes) {
    // 幹と枝だけを樹皮の茶にそろえる。葉の色・揺れ・木の当たりは保つ。
    if (!m.material.customProgramCacheKey().startsWith('barkNear')) continue;
    m.material.map = bark; m.material.bumpMap = bark;
    m.material.color.setHex(0x8a6a4b); m.material.needsUpdate = true;
  }
  const stone = roundedStone(), matrix = new THREE.Matrix4();
  for (const m of rt.scene.children) {
    // 設営前の地面の岩だけ。木・小道具・兵の形には触れない。
    if (!m.isInstancedMesh || m.geometry.type !== 'IcosahedronGeometry') continue;
    const old = m.geometry; m.geometry = stone; old.dispose();
    m.material.color.setHex(0xd5c9b5);
    m.material.vertexColors = true; m.material.needsUpdate = true;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, matrix);
      matrix.elements[13] -= Math.abs(matrix.elements[5]) * 0.12;
      m.setMatrixAt(i, matrix);
    }
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }
  return stone;
}

// 鳥取の近い山肌だけを細かく分ける。描く地面の材質・水・草の割合は使い回す。
// 一枚の三角面を中心で三つに割るので、隣の区画との境に隙間を作らない。
function dressSlopes(rt, stoneGeo) {
  const W = rt.world;
  if (!W.terrain?.geometry?.index) return;
  const old = W.terrain.geometry, attrs = old.attributes;
  const names = Object.keys(attrs).filter((name) => name !== 'normal');
  const arrays = names.map((name) => Array.from(attrs[name].array));
  const pi = names.indexOf('position'), vertices = arrays[pi], indices = [];
  const index = old.userData.terrainViewIndex || old.index.array, p = attrs.position;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (x < -62 || x > 78 || z < -110 || z > 8) { indices.push(a, b, c); continue; }
    const center = vertices.length / 3;
    for (let k = 0; k < names.length; k++) {
      const attr = attrs[names[k]], out = arrays[k];
      for (let j = 0; j < attr.itemSize; j++) out.push((attr.array[a * attr.itemSize + j] + attr.array[b * attr.itemSize + j] + attr.array[c * attr.itemSize + j]) / 3);
    }
    // 共通の当たりが使う補間高さに合わせる。独立した岩の板を地面に重ねない。
    vertices[center * 3 + 1] = W.heightAt(x, z);
    indices.push(a, b, center, b, c, center, c, a, center);
  }
  const geo = new THREE.BufferGeometry();
  for (let k = 0; k < names.length; k++) geo.setAttribute(names[k], new THREE.Float32BufferAttribute(arrays[k], attrs[names[k]].itemSize));
  geo.setIndex(indices); geo.computeVertexNormals();
  // 細分後は全域の索引を固定する。遠景だけ別の索引へ詰め替えると、
  // 同じ地面でも描画ごとの視点で面が欠ける余地が残る。
  // 元の格子と細分した面を一枚で描き、追加の頂点・材質・毎コマの詰め替えを作らない。
  geo.userData.terrainViewIndex = geo.index.array;
  // 共通の空処理へ戻すと、場面側の地形選別が再び有効になる。
  // 鳥取専用の空処理に替え、細分後の全索引を描画のたびに詰め直させない。
  W.terrain.onBeforeRender = function () {};
  W.terrain.geometry = geo; old.dispose();

  // 小石と草は一つずつの束。城道・曲輪・柵の口には置かない。
  const stone = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: 0xd5c9b5, vertexColors: true }), 72);
  const blades = new THREE.BufferGeometry();
  const stems = [];
  // 幅の狭い、曲がった草の葉。大きな一枚の三角板を地面へ刺さない。
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, x = Math.cos(a) * 0.12, z = Math.sin(a) * 0.12;
    const dx = Math.cos(a) * 0.14, dz = Math.sin(a) * 0.14, h = 0.38 + k % 3 * 0.1;
    const wx = Math.cos(a + Math.PI / 2) * 0.025, wz = Math.sin(a + Math.PI / 2) * 0.025;
    const left = [x - wx, 0, z - wz], right = [x + wx, 0, z + wz];
    const bendL = [x + dx * 0.4 - wx * 0.6, h * 0.65, z + dz * 0.4 - wz * 0.6];
    const bendR = [x + dx * 0.4 + wx * 0.6, h * 0.65, z + dz * 0.4 + wz * 0.6];
    stems.push(...left, ...right, ...bendL, ...right, ...bendR, ...bendL,
      ...bendL, ...bendR, x + dx, h, z + dz);
  }
  blades.setAttribute('position', new THREE.Float32BufferAttribute(stems, 3));
  blades.computeVertexNormals();
  const grass = new THREE.InstancedMesh(blades, new THREE.MeshLambertMaterial({ color: 0x515c36, side: THREE.DoubleSide }), 108);
  const dummy = new THREE.Object3D();
  let ns = 0, ng = 0;
  for (let i = 0; i < 360 && (ns < 72 || ng < 108); i++) {
    // 三株ずつを同じ根際へ寄せ、岸の枯草と裸の通り道を分ける。総数は増やさない。
    const bank = i < 216, clump = Math.floor(i / 3), leaf = i % 3;
    const z = bank ? -92 + (clump * 19.7 % 112) + leaf * 0.28 : -108 + (i * 17.3 % 110);
    const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
    const x = bank ? rx + 19 + (clump % 5) * 1.35 + Math.sin(leaf * 2.4) * 0.35 : -55 + (i * 29.7 % 125);
    if (castleClear(x, z) || (!bank && (z > FENCE_Z - 12 || W.slopeTan(x, z) < 0.45)) || W.waterDepthAt(x, z) > 0.05) continue;
    const y = W.heightAt(x, z);
    dummy.position.set(x, y - 0.04, z); dummy.rotation.set(0.1, i * 1.7, 0.2);
    if (ns < 72) {
      dummy.scale.set(0.33 + (i % 4) * 0.13, 0.27, 0.42 + (i % 3) * 0.15);
      dummy.updateMatrix(); stone.setMatrixAt(ns++, dummy.matrix);
    }
    if (ng < 108) {
      dummy.position.set(x + 0.8, W.heightAt(x + 0.8, z) + 0.03, z);
      dummy.rotation.set(0, i * 2.3, 0); dummy.scale.setScalar(0.8 + (i % 3) * 0.18);
      dummy.updateMatrix(); grass.setMatrixAt(ng++, dummy.matrix);
    }
  }
  stone.count = ns; grass.count = ng; stone.receiveShadow = grass.receiveShadow = true;
  if (W.deferredGroundRocks) {
    groundRocks(W, W.deferredGroundRocks);
    W.deferredGroundRocks = null;
  }
  groundRocks(W, stone);
  rt.scene.add(stone);   // 10/24：草は作らない

  // 切岸の凹凸は地面の材質で表す。端点だけを接地した長い板は、
  // 途中の斜面から浮いて黒い縦筋になるため重ねない。
}

// この戦の敵の鉄砲二人だけを調べる。構えた一発につき一度、発射前に口薬の煙と音。
function warnGuns(rt) {
  const F = rt.flags, player = rt.player, p = player.u.pos;
  if (F.step !== 1 || !F.guard) return;
  for (const u of F.guard.units) {
    const a = u.atk;
    if (!u.alive || u.fleeing || u.woundOut || u.stagger > 0 || !a?.ranged || a.ttWarn || a.t > 0.65 || a.t <= 0.1 || !a.target?.alive) continue;
    if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 45 || rt.army.shotBlocked(u, a.target.pos)) continue;
    a.ttWarn = true;
    rt.army.smoke(u.pos.x, u.pos.y + 1.5, u.pos.z, 0, 0, 0.35);
    rt.army.play('hizara', u.pos, 1);
    if (a.target !== player.u || (F.gunWarnAt ?? -99) + 8 > rt.t) continue;
    F.gunWarnAt = rt.t;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
    const yaw = player.yaw + (player.camYawOff || 0);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const direction = Math.abs(forward) >= Math.abs(right) ? forward > 0 ? '前' : '後ろ' : right > 0 ? '右' : '左';
    rt.bark(`${direction}の舟の番が鉄砲を構えた。柵の陰へ！`);
  }
}

// 足元の土と接地影は地面をなぞる一束。影の描画を切る携帯の画質でも残す。
function groundTottoriPosts(rt) {
  const W = rt.world, positions = [], colors = [];
  const vertex = (x, z, center) => {
    positions.push(x, W.heightAt(x, z) + 0.035, z);
    colors.push(center ? 0.12 : 0.3, center ? 0.09 : 0.22, center ? 0.06 : 0.13, center ? 0.72 : 0);
  };
  const patch = (x, z, rx, rz, rot = 0) => {
    if (W.inWaterAt(x, z)) return;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4;
      vertex(x, z, true);
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const angle of [a, b]) {
        const dx = Math.cos(angle) * rx, dz = Math.sin(angle) * rz;
        vertex(x + dx * c + dz * s, z - dx * s + dz * c, false);
      }
    }
  };
  for (const st of rt.army.structs) {
    if (!st.seg || !/柵|竪土塁/.test(st.name || '')) continue;
    const [ax, az, bx, bz] = st.seg, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let i = 0; i <= n; i++) patch(ax + (bx - ax) * i / n, az + (bz - az) * i / n, 1.3, 1.3);
  }
  const towers = [[-30, FENCE_Z + 8], [40, FENCE_Z + 8], [-58, -188],
    ...SIEGE_FORTS.map(([x, z]) => [x + 5, z - 5]),
    ...TAIKO_LOOKOUTS.map(k => [k.x, k.z]),
    ...SEATS.map(k => [k.x + k.w - 4, k.id === 'east' ? k.z - k.d + 3 : k.z + k.d - 5])];
  for (const [x, z] of towers) {
    patch(x, z, 2.1, 2.1);
    for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) patch(x + dx, z + dz, 0.7, 0.7);
  }
  // 持ち場の足元から荷揚げ場まで、歩き続けた岸道の泥と左右交互の足形。
  // 柵の接地影と同じ一束へ入れ、毎コマの生成や描画の束は増やさない。
  const tracks = [[-30, 10, -42, -8], [-42, -8, -49, -32], [-49, -32, -48, -56]];
  for (const [ax, az, bx, bz] of tracks) {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz), rightX = dz / length, rightZ = -dx / length;
    const steps = Math.ceil(length / .85);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = ax + dx * t, z = az + dz * t;
      if (W.inWaterAt(x, z) || W.slopeTan(x, z) > .45 || beyondBankFence(x, z)) continue;
      // 道幅の斑と足形を交互にずらし、均等な黒い丸の列にしない。
      if (i % 3 === 0) patch(x, z, .75 + .12 * Math.sin(i * 2.3), .9, rot);
      const side = i % 2 ? .27 : -.27;
      patch(x + rightX * side, z + rightZ * side, .16, .36, rot + .12 * Math.sin(i));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  rt.scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
}

function announceTottoriRear(rt, u) {
  if (u.ttRearAt != null) return;
  u.ttRearAt = rt.t; u.ttRearUntil = rt.t + 1.6;
  rt.army.play('step', u.pos, 0.9);
  rt.hud.damageFrom(Math.atan2(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) - rt.player.yaw);
  if (rt.flags.rearNoticeAt == null) {
    rt.flags.rearNoticeAt = rt.t;
    rt.bark('後ろに敵！　振り向いて構えよ', true);
  }
  rt.rearWindupT = rt.t;
}

// 最初の背後の打ち込みだけ、振りかぶってから一・六秒は斬らせない。矢玉と以後の斬り合いは従来どおり。
function installTottoriRearWarning(rt) {
  const player = rt.player, damage = player.takeDamage, windup = rt.army.hooks.onWindup, dispose = rt.dispose;
  const rear = rt.warnRear, W = rt.world, footprint = W.footprint;
  // 跡は四十八枚まで。乱れ幅も含めて一歩あけ、足踏みで重ねない。
  const footprints = new Float32Array(96);
  let footprintCount = 0, footprintIndex = 0;
  W.footprint = function (x, z, hoof, rot) {
    for (let i = 0; i < footprintCount; i++) {
      const dx = x - footprints[i * 2], dz = z - footprints[i * 2 + 1];
      if (dx * dx + dz * dz < 1) return;
    }
    const before = this.feetI || 0;
    footprint.call(this, x, z, hoof, rot);
    if (!this.feet || this.feetI === before) return;
    footprints[footprintIndex * 2] = x; footprints[footprintIndex * 2 + 1] = z;
    footprintIndex = (footprintIndex + 1) % 48;
    footprintCount = Math.min(48, footprintCount + 1);
    this.feetI %= 48; this.feet.count = Math.min(48, this.feet.count);
  };
  // 接近・振りかぶり・被弾の知らせを同じ一度の記録へ集める。
  rt.warnRear = function (u, target) {
    if (target.isPlayer && target.alive && !this.over && u.team !== target.team && this.army.behindOf(target, u))
      announceTottoriRear(this, u);
  };
  // 背後の敵は足音と構える猶予で知らせる。急な坂を一枚の円で
  // またぐ人工の影は、地面から離れた大きな板になるため置かない。
  rt.army.hooks.onWindup = (u, target) => {
    if (target.isPlayer && target.alive && u.team !== target.team && !rt.over && !u.atk?.ranged && rt.army.behindOf(target, u)) {
      announceTottoriRear(rt, u);
      if (!u.ttRearSwingSeen) { u.ttRearSwingSeen = true; u.ttRearUntil = rt.t + 1.6; }
      if (u.atk && !u.atk.ranged && rt.t < u.ttRearUntil) {
        u.atk.t = u.atk.dur = Math.max(u.atk.dur, u.ttRearUntil - rt.t + 0.3);
        u.playerMeleeUntil = rt.army.time + u.atk.dur + 1.4;
        return;
      }
    }
    if (windup) windup(u, target);
  };
  player.takeDamage = function (amount, src) {
    const u = this.u, melee = u.hitKind !== 'gun' && u.hitKind !== 'arrow';
    if (amount > 0 && melee && src?.alive && !src.isStruct && src.team !== u.team) {
      // 振りかぶった後で背後へ回った相手にも、一度は向き直る余地を残す。
      if (rt.army.behindOf(u, src)) {
        announceTottoriRear(rt, src);
        if (!src.ttRearSwingSeen) { src.ttRearSwingSeen = true; src.ttRearUntil = rt.t + 1.6; }
      }
      if (rt.t < (src.ttRearUntil ?? -1)) { u.hitKind = null; u.hitHorse = false; return 0; }
    }
    return damage.call(this, amount, src);
  };
  rt.dispose = function () {
    rt.warnRear = rear; W.footprint = footprint;
    player.takeDamage = damage; rt.army.hooks.onWindup = windup; this.dispose = dispose;
    return dispose.call(this);
  };
}

function warnTottoriRear(rt) {
  const F = rt.flags;
  if (rt.t < (F.rearScanAt || 0)) return;
  F.rearScanAt = rt.t + 0.15;
  const player = rt.player.u, p = player.pos;
  let nearest = null, distance = 9;
  for (const u of rt.army.units) {
    if (!u.alive || u.team === player.team || u.fleeing || u.woundOut || u.noTarget || u.group?.noAI ||
        u.type === 'gun' || u.type === 'bow' || !rt.army.behindOf(player, u) || Math.abs(u.pos.y - p.y) > 2) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < distance && !rt.army.wallBetween(p, -1, u.pos)) { nearest = u; distance = d; }
  }
  if (!nearest) { F.rearDistance = 99; return; }
  // 前より近くなった時の足音は半秒に一度。遠い音より近い音を強くする。
  if (rt.t >= (F.rearStepAt || 0) && distance < (F.rearDistance ?? 99) - 0.08) {
    F.rearStepAt = rt.t + 0.55;
    rt.army.play('step', nearest.pos, 0.35 + (9 - distance) * 0.07);
  }
  F.rearDistance = distance;
  announceTottoriRear(rt, nearest);
}

// 舟の役目では山肌を横歩きして登らない。小さい歩幅だと共通の
// 段差検査だけでは急斜面も通るため、足元の勾配も同じ場所で調べる。
function installTottoriBankFooting(rt) {
  const player = rt.player, W = rt.world, canStep = player.canStep, dispose = rt.dispose;
  player.canStep = function (x0, z0, x, z, y) {
    if (!canStep.call(this, x0, z0, x, z, y)) return false;
    // 柵の守りと木戸への供は元の城道・階段の判定を保つ。
    const h0 = W.heightAt(x0, z0);
    if (rt.flags.step > 1 || this.u.naka || this.u.climb || Math.abs(y - h0) > 0.35) return true;
    const limit = W.def.climbTan ?? 0.7;
    const slope = W.slopeTan(x, z), fromSlope = W.slopeTan(x0, z0);
    if (slope <= limit && fromSlope <= limit) return true;
    // 押し出された者は、元の段差検査を通る下り足で岸へ戻れる。
    // 平地から法面へ入る一歩と、法面に居続ける横歩きは通さない。
    return fromSlope > limit && W.heightAt(x, z) < h0 - 0.000001;
  };
  rt.dispose = function () {
    player.canStep = canStep; this.dispose = dispose;
    return dispose.call(this);
  };
}

// 屋外では床下・軒下をカメラの置き場にしない。線の当たりだけでは、
// 櫓の脚の間から入った視点が床と筋交いを天井のように映してしまう。
function installTottoriCamera(rt) {
  const player = rt.player, updateCamera = player.updateCamera, dispose = rt.dispose;
  const look = new THREE.Vector3();
  const game = rt.game, drawNow = game?.drawNow;
  const measure = rt.flags.tottoriView = {};
  // 建て終わった時に一度だけ拾う。屋根の張り出しと画面の端の余白を含める。
  const covers = NAKA.list.map(I => {
    const lv = I.levels[0], top = I.levels[I.levels.length - 1];
    return { I, hw: lv.w / 2 + 1.4, hd: lv.d / 2 + 1.4,
      bottom: rt.world.heightAt(I.x, I.z) - 1, top: top.y + top.h + 3 };
  });
  // 舟の苫と船べりにも視点を入れない。舟は動かないので準備時に一度だけ測る。
  for (const b of rt.flags.boats) {
    const v = b.m.position, a = b.m.rotation.y;
    covers.push({ I: { x: v.x, z: v.z, c: Math.cos(a), s: Math.sin(a) },
      hw: 1.8, hd: 5.4, bottom: v.y - 0.6, top: v.y + 2.2 });
  }
  // 通常の追従と直接描画で同じ遮蔽判定を使う。視点だけが崖の向こうへ回らない。
  const lookShift = { x: 0, y: 0, z: 0 };
  const keepSight = (camera) => {
    const p = player.u.pos, v = camera.position;
    look.set(p.x + lookShift.x, p.y + 1.4 + lookShift.y, p.z + lookShift.z);
    const dx = v.x - look.x, dy = v.y - look.y, dz = v.z - look.z;
    const length = Math.hypot(dx, dy, dz), steps = Math.min(64, Math.max(1, Math.ceil(length / 0.4)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (look.y + dy * t >= drawGroundAt(rt.world, look.x + dx * t, look.z + dz * t) + 0.45) continue;
      let lo = (i - 1) / steps, hi = t;
      for (let j = 0; j < 6; j++) {
        const mid = (lo + hi) / 2;
        if (look.y + dy * mid >= drawGroundAt(rt.world, look.x + dx * mid, look.z + dz * mid) + 0.45) lo = mid;
        else hi = mid;
      }
      v.set(look.x + dx * lo, look.y + dy * lo, look.z + dz * lo);
      return true;
    }
    return false;
  };
  player.updateCamera = function (dt, camera) {
    updateCamera.call(this, dt, camera);
    // 実際に室内や櫓の床に上がった時は、従来の室内視点を使う。
    if (NAKA.cur || rt.game?.photo) return;
    const v = camera.position, p = this.u.pos;
    let moved = false;
    // 川岸の東は久松山の城道の肩（約40m）が十二歩で立ち上がる。斜面が画面の片側をふさぐ時は、
    // 本人を軸に視点を回し、川面と舟・奥の山を見る向きへ逃がす（狙い・一人称の間は回さない）。
    {
      let goal = 0;
      const ox = v.x - p.x, oz = v.z - p.z, od = Math.hypot(ox, oz);
      if (od > 0.5 && !this.aiming && !this.lock && this.fpK < 0.3 && rt.flags.step <= 1) {
        const fx = -ox / od, fz = -oz / od, rx = -fz, rz = fx, W = rt.world;
        let hr = -99, hl = -99;
        for (const s of [4, 8, 13]) for (const a of [-4, 0, 7, 14]) {
          hr = Math.max(hr, W.heightAt(p.x + rx * s + fx * a, p.z + rz * s + fz * a));
          hl = Math.max(hl, W.heightAt(p.x - rx * s + fx * a, p.z - rz * s + fz * a));
        }
        const d = hr - hl;
        goal = Math.sign(d) * Math.max(0, Math.min(1, (Math.abs(d) - 4) / 12));
      }
      this.ttWallK = (this.ttWallK || 0) + (goal - (this.ttWallK || 0)) * Math.min(1, dt * 1.6);
      const k = this.ttWallK;
      lookShift.x = lookShift.z = 0;
      if (Math.abs(k) > 0.01 && od > 0.5) {
        // 右の斜面なら視線を左へ回し、視点と注視点をそろって斜面から離す（本人は画面の右寄り）。
        // 回すだけだと視点が斜面へ上がり、手前の土が画面の半分を埋める。
        const th = -0.35 * k, c = Math.cos(th), s = Math.sin(th);
        const nx = ox * c - oz * s, nz = ox * s + oz * c;
        const sx = (-nz / od) * 2.4 * k, sz = (nx / od) * 2.4 * k;   // 回した視線の右の逆＝斜面から遠い側
        lookShift.x = sx; lookShift.z = sz;
        v.x = p.x + nx + sx; v.z = p.z + nz + sz;
        v.y += 0.7 * Math.abs(k);
        moved = true;
      }
    }
    // 川岸で手で見回していない間は、肩越しを川向こうの山（段の板塀と二重櫓の並ぶ尾根と山）へ向け直す。
    // 視点は本人の後ろ上、注視点は山の方へ二十五歩・少し上（上向き六度、十五度まで）。地面の下に置かない。
    {
      const bank = rt.flags.step <= 1 && p.x < -28 && p.z > -70 && p.z < 25;
      const free = !this.aiming && !this.lock && this.fpK < 0.3 && (this.lookIdle || 0) > 1.2;
      this.ttAimK = (this.ttAimK || 0) + ((bank && free ? 1 : 0) - (this.ttAimK || 0)) * Math.min(1, dt * 1.2);
      const k = this.ttAimK;
      if (k > 0.01) {
        const tx = FAR_VIEW.x - p.x, tz = FAR_VIEW.z - p.z, tl = Math.hypot(tx, tz) || 1, fx = tx / tl, fz = tz / tl;
        const D = 6.2, H = 2.6, A = 25, pitch = 0.1;
        const cx = p.x - fx * D, cz = p.z - fz * D, cy = p.y + H;
        v.x += (cx - v.x) * k; v.z += (cz - v.z) * k; v.y += (cy - v.y) * k;
        v.y = Math.max(v.y, rt.world.heightAt(v.x, v.z) + 0.8);
        const ly = Math.min(A * Math.tan(pitch), (A + D) * Math.tan(0.26) - (v.y - p.y - 1.4));
        lookShift.x += (fx * A - lookShift.x) * k; lookShift.z += (fz * A - lookShift.z) * k; lookShift.y = ly * k;
        moved = true;
      }
    }
    for (const b of covers) {
      const I = b.I;
      if (I.disabled || v.y < b.bottom || v.y > b.top) continue;
      const dx = v.x - I.x, dz = v.z - I.z;
      let x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
      if (Math.abs(x) >= b.hw || Math.abs(z) >= b.hd) continue;
      // 本人が外にいる側へ出す。本人も床下なら、最寄りの外縁へ出す。
      const px = (p.x - I.x) * I.c - (p.z - I.z) * I.s;
      const pz = (p.x - I.x) * I.s + (p.z - I.z) * I.c;
      if (Math.abs(px) >= b.hw) x = Math.sign(px) * b.hw;
      else if (Math.abs(pz) >= b.hd) z = Math.sign(pz) * b.hd;
      else if (b.hw - Math.abs(x) < b.hd - Math.abs(z)) x = (Math.sign(x) || 1) * b.hw;
      else z = (Math.sign(z) || 1) * b.hd;
      v.x = I.x + x * I.c + z * I.s; v.z = I.z - x * I.s + z * I.c;
      v.y = Math.max(v.y, rt.world.heightAt(v.x, v.z) + 0.8);
      moved = true;
    }
    // 視点だけを切岸の上へ上げると、本人との間に土の壁が残る。
    // 先に交差の手前へ寄せ、その場所の地面から高さを取る。
    if (keepSight(camera)) moved = true;
    const floor = drawGroundAt(rt.world, v.x, v.z) + 0.8;
    if (v.y < floor) { v.y = floor; moved = true; }
    // 屋根・地面の補正で動いた視点も兵の胴へ入れない。接近した相手の笠だけが
    // 大写しになり、自分が白い輪郭だけになるのを防ぐ。既存の入れ物を使う。
    if (this.u.alive && !this.aiming && this.fpK < 0.5) {
      const x = v.x, y = v.y, z = v.z;
      avoidCameraBodies(rt.army.units, this.u, look, v);
      if (v.x !== x || v.y !== y || v.z !== z) moved = true;
    }
    if (moved) {
      // 鳥取の補正で動いた後も、屋根や柵を横切っていないか測り直す。
      const hit = this.camBlockHit(look, v);
      if (hit !== null) v.lerpVectors(look, v, Math.max(0, hit - 0.03));
      this.camPos.copy(v);
      camera.lookAt(look);
    }
    // 柵で寄せた後も、手前の四隅が切岸へ潜らないようにする。
    if (guardDrawCamera(rt.world, camera, measure) > 0) {
      keepSight(camera);
      camera.lookAt(look);
      guardDrawCamera(rt.world, camera, measure);
      camera.lookAt(look);
    }
    this.camPos.copy(v);
  };
  // 近寄って見る時や速回し後の直接描画も、実際の三角面を測る。
  const guardedDraw = function (fresh, scene) {
    if (this.battle === rt && (!scene || scene === rt.scene) && !NAKA.cur && !this.photo) {
      // 直接描画でも高さを動かした分だけ本人へ向き直す。坂の土だけを映さない。
      let moved = keepSight(this.camera);
      if (moved) this.camera.lookAt(look);
      if (guardDrawCamera(rt.world, this.camera, measure) > 0) moved = true;
      if (keepSight(this.camera)) moved = true;
      // 直接描く時も通常の追従と同じく、近い味方や馬の胴から視点を出す。
      // 速回し後の写真でも手前の笠・肩だけが大写しになるのを防ぐ。
      if (player.u.alive && !player.aiming && player.fpK < 0.5) {
        const v = this.camera.position, x = v.x, y = v.y, z = v.z;
        avoidCameraBodies(rt.army.units, player.u, look, v);
        if (v.x !== x || v.y !== y || v.z !== z) {
          const hit = player.camBlockHit(look, v);
          if (hit !== null) v.lerpVectors(look, v, Math.max(0, hit - 0.03));
          moved = true;
        }
      }
      if (moved) {
        this.camera.lookAt(look);
        guardDrawCamera(rt.world, this.camera, measure);
        this.camera.lookAt(look);
      }
      player.camPos.copy(this.camera.position);
    }
    return drawNow.call(this, fresh, scene);
  };
  if (drawNow) game.drawNow = guardedDraw;
  rt.dispose = function () {
    if (game?.drawNow === guardedDraw) game.drawNow = drawNow;
    player.updateCamera = updateCamera; this.dispose = dispose;
    return dispose.call(this);
  };
}

// 「番を退け」は敵を退ける下知。共通の文言判定を使わず、実際の段の合図だけを札へ添える。
function tottoriSignal(rt, objective, sound, cue, at, vol = 0.8) {
  objective.cue = cue; objective.cueT = rt.t;
  rt.army.play(sound, at, vol);
}

// 今の任務で戦える最寄りの一人。討たれた相手は待たずに選び直す。
const tottoriFighting = (u) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying &&
  !u.downed && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && !u.invuln;
function tottoriFoeAllowed(rt, u) {
  const F = rt.flags;
  return tottoriFighting(u) && (F.step === 1
    ? (u.group === F.guard || u.group === F.guard2) && atBank(u.pos.x, u.pos.z) && bankRouteThreat(rt, u)
    : u.group?.ttOut && !u.group.ttRetreat && u.pos.z >= FENCE_Z && atTottoriPost(u.pos));
}
function tottoriNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.ending || rt.over || F.step !== 1 && F.step !== 2) return null;
  if (F.step === 1 && (F.burnt >= 2 || bankNeedsReturn(rt))) return null;
  if (F.foeAt > rt.t && F.foeAt <= rt.t + .25 && tottoriFoeAllowed(rt, F.foeNear)) return F.foeNear;
  F.foeAt = rt.t + .25;
  let nearest = null, distance = Infinity;
  const groups = F.step === 1 ? F.bankGroups : F.sallies;
  for (const g of groups) for (const u of g.units) {
    if (!tottoriFoeAllowed(rt, u)) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < distance) { distance = d; nearest = u; }
  }
  F.foeNear = nearest;
  return nearest;
}

const tottori = {
  // 稲生の共通表示へそろえる。道順・放火・開城の判定と兵数はこの戦のものを使う。
  missionSingleLine: true, hideMissionDots: true, hideGuideSteps: true,
  enemyTriangleSigns: true, nearbyAllySignLimit: 0, noDodgeCard: true, noSiegeCards: true,
  noPlayerFoot: true, quietMiss: true,
  missionPinCaption: '', missionDetail: () => '', missionStatus: () => '',
  speechAllowed: (rt) => !!rt.flags.ending || rt.over,
  bannerAllowed: (rt) => !!rt.flags.ending || rt.over,
  compactMapAllies: true, mapCommanderAlways: true,
  missions: ['味方と集まれ', '舟を焼け', '▼の敵を倒せ', '岸を守れ', '柵へ戻れ', '柵を守れ', '使いに続け', '木戸へ進め'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.step === 0) return 0;
    if (F.step === 1) return F.burnt >= 2 ? 3 : tottoriNearestFoe(rt) ? 2 : 1;
    if (F.step === 1.5) return 4;
    if (F.step === 2) return F.breachT > 0 && tottoriNearestFoe(rt) ? 2 : 5;
    if (F.step === 2.5) return 5;
    return F.envArrived ? 7 : 6;
  },
  missionHeading(rt) {
    if (rt.flags.ending || rt.over) return rt.tracker.main ? '鳥取城、開く' : '味方と退け';
    if (rt.flags.step === 1 && bankNeedsReturn(rt)) return '岸へ戻れ';
    return this.missions[this.missionOf(rt)];
  },
  missionSignTarget: tottoriNearestFoe,
  // 経家は城内の大将として示す。討ち取りの目標にはせず、開城の史実を保つ。
  commanderSignTarget(rt) {
    const u = rt.flags.ehon?.general;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u.pos;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.goalPin;
    q.unit = q.marker = null; q.enemy = q.approach = q.defend = q.waiting = q.arrived = q.route = false;
    q.always = q.silent = true; q.r = 3; q.hide = 0;
    let at;
    if (F.step === 0) at = F.hide.anchor;
    else if (F.step === 1 && bankNeedsReturn(rt)) at = bankEntry(rt);
    else if (this.missionOf(rt) === 2 && (q.unit = tottoriNearestFoe(rt))) {
      at = q.unit.pos; q.enemy = q.approach = true; q.r = q.hide = .2;
      if (rt.player.inRange && rt.player.rangeCueTarget === q.unit) return null;
    } else if (F.step === 1) {
      const boat = nextBankBoat(rt);
      at = boat ? boatApproach(rt, boat) : F.bankPost;
      q.r = 2; q.defend = q.waiting = F.burnt >= 2;
    } else if (F.step === 1.5) at = returnWay(rt);
    else if (F.step === 2 || F.step === 2.5) {
      at = F.guardPost; q.r = 8; q.defend = q.waiting = true;
    } else if (F.step === 3) at = F.envArrived ? F.gatePost : escortGuide(rt);
    if (!at) return null;
    q.x = at.x; q.z = at.z;
    q.arrived = !q.enemy && Math.hypot(me.x - q.x, me.z - q.z) <= q.r;
    return q;
  },
  nearAllySolidBody: true, // 肩越しの視点を近い兵の外へ置き、胴を透かし続けない。
  positionPersonGuide: true, bodyHeightGuides: true, // 頭の描画時の骨と足元を混ぜず、同じ立ち位置から印を測る。
  compactCombatGuides: true, compactEnemyFrame: true, // 胴を覆う六角形を四隅の細い印へ替える。
  enemyCornerSign: true, enemySignOnly: true, // 実際の敵の囲みも四隅にし、重なる「この敵」の札を省く。
  compactApproachGuide: true, // 接近は足元からの短い案内。敵の脇に「ここへ」の大旗を重ねない。
  noUnitContrast: true, compactPlayerSign: true, playerSignMinScale: 0.4, playerSignScale: 0.65, // 共通の大きい下限を使わず、鳥取の小さい足元の輪を有効にする。
  compactDodgeGuide: true, compactGroundGoalRing: true, compactHoldGuide: true,
  compactTravelArrow: true, // 岸道・城道の矢印を縮め、先を歩く兵を隠さない。
  smallFlagAvoidNotices: true, // 画面の端の旗と添え字も任務・台詞の札を避ける。
  routeDestinationSight: true, // 岸の曲がり角を肩越しに収め、遠い旗だけを探させない。
  smallTaskAreas: true, taskAreaFootRing: true, // 守り場は中心の小さい印。到着範囲を白い大輪で覆わない。
  // 鳥取の井楼だけ、垂直の通し柱と交互に重なる横木を使う。
  lookoutLogFrame: true,
  // 共通の民の形・材質と近景の使い回し。兵数・当たり・戦功には加えない。
  civilianCrowd: { bands: PEOPLE_BANDS },
  meleeGrace: { rate: 0.008, burst: 0.35, interval: 1.6 },
  // 家ごとの口ぐせをこの戦だけで替え、後世の「三本の矢」を言わせない。
  battleVoices: { lines: { ally: {
    // 囲まれた知らせに別の行き先を添えず、任務の指示を一つに保つ。
    encircle2: ['敵に囲まれた！'],
    encircle1: ['敵が脇へ回っている！'],
    rout: ['敵が退いた。追わず、持ち場へ戻れ！'],
  }, enemy: {
    ambient: ['腹が減った……もう、動けぬ……', '米は、まだ届かぬか……', '木戸まで、戻らねば……'],
    nanori: ['毛利の名にかけて！', '城の者を守るぞ！'],
    push: ['兵糧の道を開け！', '槍をそろえよ！'],
    pushing: ['米を城へ入れるぞ！', 'そこを退け！'],
    waver: ['力が、入らぬ……', '木戸へ退け！'],
    breaking: ['もう槍が持てぬ……', '城へ戻れ！'],
  } } },
  jinkei: [TOTTORI_ATTACK, TOTTORI_DEFEND, TOTTORI_MARUYAMA],
  noHead: true, // 首の証ではなく、放火・柵の守り・使いの供を働きとする。
  noWake: true, // 持ち場の実兵だけを使い、囲みの遠景から新しい兵を増やさない。
  frontlineDensity: false, // 舟の番・柵の夜討ちだけを使う。帰還中に共通の物見を湧かせない。
  noDistantBattle: true, botOrders: true, immediatePhaseTasks: true, immediateTaskChanges: true, taskDetails: true,
  keepTaskLabel: true, // 近くの敵へ構えても、放火・帰還・柵を守る下知を消さない。
  taskText(rt, text) {
    // 停戦後の短い札も使いに続く下知にそろえ、旗への汎用案内へ戻さない。
    if (rt.flags.step !== 3) return text;
    return rt.flags.envArrived ? '使いは着いた。木戸へ進め'
      : rt.flags.env?.order === 'hold' ? '待っている使いのそばへ'
        : '使いの後ろを歩き、木戸へ';
  },
  keepCombatTaskHeading: true, // 携帯の攻撃案内でも「囲みの敵へ」で守りの任務を上書きしない。
  keepTaskPanel: true, // 相手の枠へ任務札を移さず、岸・柵の下知を同じ場所で読む。
  keepApproachTaskPanel: true, // 敵へ近づく間も、舟の数と下知を上の任務札に残す。
  enemyGuideAllowed: bankEnemyGuideAllowed,
  navigationEnemyAllowed: bankEnemyGuideAllowed,
  combatTaskLabel(rt) {
    // 共通の攻撃案内でも「敵へ進め」に戻さない。負傷時の退避は共通処理を優先する。
    return rt.objectives.find((o) => o.id === 'main' && !o.state)?.text || '';
  },
  keepGuardTaskLabel: true, // 構える相手の枠へ切り替わっても、守り場の案内を保つ。
  keepCombatTask: true, // よける案内の間も、舟を焼く役目を札に残す。
  keepCombatTaskDetail: true, // 構えている間も、舟の残りと城兵の動きを読む。
  meleeApproachText: '敵へ一歩進み、構えよ',
  keepTaskWithDodge: true, // よける時も現在の役目を知らせの選別から外さない。
  keepTaskWithGuard: true, // 構える釦の間も、焼いた舟の数と次の役目を残す。
  compactWaitGuard: true, // 携帯横画面では中央を追う位置指定を外し、端で長押しする。
  retreatStepsNewLine: true, // 退く下知と歩数を分け、「あと」の途中だけで折り返さない。
  // 残った傷だけで「舟へ進め」と「味方へ下がる」を同時に出さない。
  woundEffectText: (_rt, slow) => slow ? '足のけが' : '腕のけが',
  woundRetreatNeeded: tottoriWoundRetreatNeeded,
  keepWoundRetreatReason: true,
  // 遠い番兵や退避の残り時間だけでは、放火へ向かう道に守りの釦を出し続けない。
  waitGuardAllowed: (rt, enemy) => !bankRouteClear(rt) &&
    (rt.flags.step !== 1 || !!enemy?.alive && bankRouteThreat(rt, enemy)),
  pauseTurnPractice: false, // 携帯の見回し待ちで、舟の番・兵・戦の時計を止めない。
  dodgeTurnDuration: 4,
  dodgeAvoidNotices: true,
  introTaskFirst: true,
  introPeopleFolded: true,
  compactIntro: true,
  // 横向きの携帯では最初の一手だけを読む。続く役目は任務の一行へ渡す。
  introText: 'まず、川岸の味方と集まろう。味方と舟の番を退け、舟のそばで火をかけよう。',
  // 手当て後も体力は自然に戻らない。岸が安全なら、残った傷だけで放火の札を隠さない。
  fireWorkAllowed: (rt, it) => (it.id === 'b0' || it.id === 'b1') &&
    atBank(rt.player.u.pos.x, rt.player.u.pos.z) && bankRouteClear(rt),
  coverGuidePlace: true,
  coverGuideLabel: '矢玉を避け、物かげへ',
  coverHitAllowed(rt, _hit, q) {
    if (rt.flags.step !== 1) return true;
    // 自動操作と同じ岸を使う。柵の外や山裾の陰へ印だけを出さない。
    const p = rt.player.u.pos;
    if (!atBank(p.x, p.z)) return false;
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z)));
    for (let i = 1; i <= n; i++) if (!atBank(p.x + (q.x - p.x) * i / n, p.z + (q.z - p.z) * i / n)) return false;
    return true;
  },
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    if (reached) return tottoriWoundRetreatNeeded(rt) ? rt.player.treatmentLeft > 0 ? '味方の後ろで止まり、手当てを' : '味方の後ろで構えよ'
      : rt.flags.step === 1 ? '敵が離れたら舟へ戻れ' : '味方のそばで構えよ';
    const reason = u.wounds?.bleed > 0.0001 ? '血が出ている。' : tottoriWoundRetreatNeeded(rt) ? '傷が深い。' : '';
    return reason + (rt.flags.step === 1 ? '岸の味方へ退け' : '味方の後ろへ退け');
  },
  retreatDestinationLabel: (rt) => rt.flags.step === 1 ? '岸の味方の後ろへ' : '味方の後ろへ',
  namedGuideMarkers: true,
  // 供の位置までの距離を「木戸まで」と誤読させない。残りの城道は任務の補足へ。
  distanceText: () => '',
  retreatPointAllowed: tottoriRetreatAllowed,
  botRetreatStepAllowed: tottoriRetreatAllowed,
  dodgeLabel: (_rt, direction, rain) => direction ? direction.replace('にげる', 'よける') : rain ? '矢をよけよ' : '敵から離れ、構えよ',
  dodgeTurnLabel: (rt, right, touch) => `${touch ? SETTINGS.touchSwap ? '左側を' : '右側を' : '手元の操作器を'}${right ? '右' : '左'}へ${touch ? 'なぞる' : '動かす'}。${rt.flags.step === 1 ? '岸へ戻れ' : '味方へ戻れ'}`,
  dodgeGuideLabel: (rt, reached, rain) => rain ? '矢の輪の外へよけよう'
    : reached ? '敵へ槍を向け、構えよ' : rt.flags.step === 1 ? '岸の味方へ退き、構えよ' : '味方のそばへ退き、構えよ',
  dodgePointAllowed(rt, point) {
    if (rt.world.inWaterAt(point.x, point.z)) return false;
    if (rt.flags.step !== 1) return true;
    const p = rt.player.u.pos;
    if (atBank(p.x, p.z)) return atBank(point.x, point.z);
    // 既に岸の外なら、戻る道へ近づく候補だけを残す。
    const entry = bankEntry(rt);
    return Math.hypot(point.x - entry.x, point.z - entry.z) <= Math.hypot(p.x - entry.x, p.z - entry.z);
  },
  // 敵のいない岸道では舟へ案内する。接近戦や深手では守り・手当てを優先する。
  routeGuidePriority(rt) {
    if (bankRouteClear(rt)) return true;
    const F = rt.flags, p = rt.player, u = p.u;
    return !F.ending && (F.step === 0 || F.step === 1 || F.step === 1.5 || F.step === 3) &&
      p.inCombatT <= 0 && u.hp >= u.maxHp * 0.6 && !u.mobbed && p.sta >= 20 &&
      !rt.army.nearestEnemy(u, 8, (o) => !o.fleeing && !o.woundOut && !o.noTarget &&
        Math.abs(o.pos.y - u.pos.y) < 3);
  },
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.step === 0) return '川岸の組へ';
    if (F.step === 1) {
      if (bankNeedsReturn(rt)) return '岸の道へ';
      const boat = nextBankBoat(rt);
      if (!boat) return F.burnt < 2 ? '舟の番へ' : '岸を守れ';
      return boatApproach(rt, boat) === boat ? '兵糧舟へ' : '脇の岸道へ';
    }
    if (F.step === 1.5) return F.returnIndex < RETURN_ROAD.length - 1 ? '柵への岸道' : '柵の口へ';
    if (F.step === 2 || F.step === 2.5) return '柵の守り場';
    if (F.step === 3) return '使いのそばへ';
    return '持ち場へ';
  },
  // 画面の外へ出た道の印にも同じ行き先を出す。「旗へ」では舟の岸を探せない。
  edgeDestinationLabel(rt) { return this.travelGuideLabel(rt); },
  edgeDestinationCaption(rt) { return this.travelGuideLabel(rt); },
  // 本人が守り続けている寄せと、停戦への移り目を共通の八分で切らない。
  // 持ち場を離れた待機は延ばさず、各段の猶予にも上限を置く。
  pacingWait(rt) {
    const F = rt.flags;
    // 寄せが来た直後も守れる時間を残す。二十五秒の守りを達成してからでは遅い。
    if (F.step === 2) return !F.breachT &&
      rt.t - F.stepT < 210 && rt.player.u.pos.z >= FENCE_Z && atTottoriPost(rt.player.u.pos);
    if (F.step === 2.5) return rt.t - F.stepT < 6;
    return F.step === 3 && (F.ending || rt.t - F.stepT < 90);
  },
  // 敵が離れたら傷を残したまま岸へ戻る。手当て・包囲・接近戦では通常の退避を保つ。
  botEvacuating: bankRouteClear,
  // 避け足で川へ入ったり、山裾へ退き続けたりしない。実際の放火・守りは本人を待つ。
  botCoverBlocked: (rt, from, to) => rt.flags.step === 1 && !atBank(to.x, to.z) ||
    rt.flags.step === 1.5 && (rt.world.inWaterAt(to.x, to.z) || to.z < from.z - 0.5),
  // 深手の退避も岸の道へ。山裾の遠い味方まで下がって往復しない。
  botRetreatWay(rt, at) {
    if (rt.flags.step === 1.5) return returnWay(rt);
    if (rt.flags.step === 2) {
      at.x = Math.max(GATE.x - 10, Math.min(GATE.x + 10, at.x));
      at.z = Math.max(FENCE_Z + 4, Math.min(FENCE_Z + 18, at.z));
      return at;
    }
    if (rt.flags.step !== 1) return at;
    if (bankNeedsReturn(rt)) return bankEntry(rt);
    at.z = Math.max(-62, Math.min(18, at.z));
    at.x = Math.max(riverX(at.z) + 16, Math.min(-38, at.x));
    if (at.z > -8.2 && at.z < 11.2) at.x = Math.max(at.x, BANK_FENCE_X(Math.min(10, at.z + 0.8)) + 2.6);
    return at;
  },
  lordHata: { spear: 12 }, // 別の遊び方でも共通の百人の旗本を足さない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.step === 0) return 'hide';
    if (F.step === 1) {
      if (bankNeedsReturn(rt)) return 'bank-road';
      const boat = nextBankBoat(rt);
      return boat ? boatApproach(rt, boat) === boat ? 'b' + boat.i : 'bank-approach' : 'bank-fight';
    }
    if (F.step === 1.5 || F.step === 2 || F.step === 2.5) return 'return';
    if (F.step === 3) return 'env';
    return null;
  },
  noTaisho: true, // 両本陣はこの戦で置く。架空の大将襲撃隊は送らない。
  // 身の回りの当時の場（timeslip_field.js）。天正九年十月は今の十一月末・時雨の夜。
  // 千代川の岸は濡れてぬかるみ、枯れた葦が茂る。舟の岸と柵の前ほど、倒れた槍と吉川方の旗・矢が多い。
  timeslip: {
    wet: 0.45, dust: 0.15, trample: 0.15, debris: 1, arrows: 0.4, reeds: 0.9,
    mudColor: 0x7a6c5c, grassLift: 0.12, grass: 0x6c6648, grassTints: [0xffffff, 0xd8cca0, 0xb4ac88], grassH: 1.2, tallGrass: 1.25,   // 岸の地面を暗い一枚に見せない：枯れ草の株を濃く（10/28）
    // 夜の月に白い落ち旗が地面の白い染みに見えた（10/28）。布は煤けた色、水たまりの映りも落とす。
    flagColors: [0x6a6152, 0x24211e, 0x4a3a2c], poolDim: 0.5,
    fights: [[BOATS[0].x, BOATS[0].z, 26], [BOATS[1].x, BOATS[1].z, 22], [10, FENCE_Z, 30], [GATE.x, GATE.z, 22]],
  },
  camLift: -1.1, // 馬上の視点を下げ、持ち場から千代川の水面と舟の列を横から見せる（地面ばかりを写さない）。
  playerRegen: 0.015,   // 稲生の標準：戦っていない間は命がゆっくり戻る（岸の鉄砲・矢で削られたまま作業へ戻れない事を防ぐ）
  spawn: { x: -30, z: 10, heading: -Math.PI / 2 },
  world: {
    noHaori: true, // 本の足軽姿にそろえ、名のある将も陣羽織・母衣を付けない。
    seed: 15810, moveLim: 250, groundHalf: 250,
    climbTan: 0.7, // 道のない切岸は登らず、城道と階段から木戸へ向かう。
    maxWalkDrop: 1.2, // 山道の外へ踏み出して崖下へ落ちない。設営した階段は既存の足場判定で通す。
    keepSpawnInside: true, // 武将の後ろの持ち場と供も含め、陣形全体を場内へ収める。
    // 陰の側にも空の弱い光を残し、黒漆の胴・袖・手元を読み取れるようにする。
    nightLift: 2.9, nightFill: 0.68, nightMoonMin: 0.7, nightMetalness: 0.18, waterFireReflections: true,
    time: 'night', unitNightScale: 0, // 兵だけの青白い自己発光を止め、地面と同じ月光で照らす。
    kasaDrape: false, // 本人と護送の供にも同じ陣笠の仕立て。白い首布を残さない。
    shadowBoneOrder: true, // 胴丸の軽い影も、体と共有する骨番号へそろえる。
    darkFootprints: true, // 足跡は月光で照らす泥色。道案内は既存の矢印一つ。
    contactShadows: true, infantryWeight: true, meleeGroundedFeet: true, // 接地影・重心移動に加え、突き合う間も両足を坂へ合わせる。
    drawTimeUnitParts: true, // 骨と逆行列を同じ描画で揃え、槍は兵の束だけで描く。
    fullTipMatrices: true, // 坂を下る遠い兵も手首と指をそろえ、麓まで皮膚が帯状に伸びるのを防ぐ。
    movingHiddenBones: true, // 画面外を歩く兵も、根元が動いた時は骨まで同じ位置へ移す。
    terrainTriangles: true, // 視点・歩く高さを、実際に描く三角面にそろえる。
    keepTerrainGrid: true, // 低画質でも足場と同じ格子。坂の兵・柵を地面から浮かせない。
    climbTan: 0.70, maxWalkDrop: 1.2, // 切岸を歩いて登らず、路肩からも落ちない。城道・階段は従来どおり通す。
    groundedSlopeRocks: true, deferRockGround: true, curvedRockTufts: true,
    // 形を替えてから岩を接地。斜面をまたぐ黒い扇形の影を重ねない。
    riverCross: true, // 本人も番兵も共通の水深判定を使い、深みで槍を振り続けない。
    wind: [0.7, -0.3],
    autumn: true, // 新暦十一月の雑木と枯草。積雪のない晩秋。
    winter: false,
    branchTrees: false, roundNeedles: true, lookoutKind: 'ro', // 裸の横枝と屋根なしの骨を避け、霧の中にも葉と板屋根を残す。
    branchFoliage: true, nearCedarBranches: true, // 松・雑木は共有の葉房、杉は枝の段を保ち、山腹の縦長の板を避ける。
    layeredNeedles: true, softFarNeedles: true, raggedNeedles: true, brokenNeedleTiers: true, // 共有の樹冠で枝先と下枝を崩し、円錐を積んだ輪郭を和らげる。
    variedFalls: true, spreadFalls: true, crumpledFlags: true,
    fallPaceSpread: 0.35, // 一斉に討たれても、膝が折れる間は兵ごとに違う。
    contactFalls: true, wetEarthBursts: true, // 地を打ってから具足の音と低い泥粒。湿った岸に白煙を立てない。
    settleSideFalls: true, groundedFalls: true, // 横斬りで倒れた肩を地へ寝かせ、胴の厚みを残す。
    terrainContactFalls: true, settleFallenBody: true, settleFallenLimbs: true,
    // 少し離れた亡骸も腰と胸を土へ下ろす。手足だけを接地して胴を宙に残さない。
    slopeContactFalls: true, slopeLitter: true, bareFallenHats: true,
    longitudinalSpearFalls: true, // 長柄は握りの前後の実寸で岸の坂へ沿わせる。
    // 亡骸は腰と胸の下で坂へ接地。落ちた笠と長柄も同じ斜面へ寝かせる。
    livingSpearHedge: true, // 後列は味方の肩越しへ槍を上げ、前列は間合いに合わせて短く握る。
    reachableSpearGrip: true, // 近い徒歩兵の握りも肩から届く位置へ寄せ、腕を伸ばし切った構えを避ける。
    variedMarch: true, noGroundArrows: true,
    longHoro: 'round', // 使番の母衣は既存の丸い竹籠と布を使う。背から赤い板を垂らさない。
    allyCloth: [0x6a5a48, 0x9a765b, 0xb0a181, 0x7a6a52],
    muddy: 0.35, slopeForest: 0.6, cliffRock: 0.18, tuftTint: 0x514b32,
    patchyGround: true, // 土の絵・遠い草・足元の株を同じ群落へそろえる。
    // 舟へ回る岸の帯だけ、踏まれた泥と根・濡れた窪み・土塊を出す。一色の土の平場にしない。
    trampledField: [-46, -16, 13, 42], wetFieldRuts: 'wear', churnedMud: true,
    softEarthCrust: true, // 土塊の陰を升の縁で消し、岸の地面に四角い敷石を並べない。
    stableSlopeGrain: true, // 山肌の細かな凹凸で模様の向きを回さず、長い折れ線の筋を抑える。
    stableCliffGrain: true, slopeForestTint: true, // 切岸の苔の筋を抑え、既存の土・落葉・林の斑を山肌へ残す。
    stableRockProjection: true, // 岩肌も二方向の色を混ぜ、曲がる法線で模様を細い帯へ圧縮しない。
    nearGrassTint: 0x514b32, // 足もとの草にも枯草の色を掛け、月夜の蛍光色を抑える。
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    streams: [{ pts: RIVER, w: 12, depth: 1.2, fireReflection: true }, { pts: SUIRO, w: 3.2, depth: 0.7 }],   // 袋川のほか、南西の低湿地へ分かれる水路
    paths: [...TAIKO_ROADS, [TAIKO_EXIT, [108, -80], [60, -30], [20, 40], [-30, 10], [-50, -18]], ...LOCAL_PATHS],
    height,
    // 山麓南西の低湿地：湿って暗い緑と、水路沿いの田
    tint(x, z, h, c) {
      const b = boggy(x, z);
      if (b > 0.05) c.setRGB(c.r * (1 - 0.35 * b) + 0.02, c.g * (1 - 0.18 * b) + 0.03, c.b * (1 - 0.3 * b) + 0.02);
      // 水際は湿った土、その外は草。夜でも水の青緑と岸の茶・緑を分ける。
      const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
      const bank = trap(Math.abs(Math.abs(x - rx) - 20), 10, 5);
      if (bank && z > -100 && z < 90) {
        const grass = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.23);
        c.setRGB(c.r * (1 - bank) + (0.27 + grass * 0.05) * bank,
          c.g * (1 - bank) + (0.23 + grass * 0.17) * bank,
          c.b * (1 - bank) + (0.12 + grass * 0.04) * bank);
      }
      // 高い山肌に土と岩のまだらを残す。木・岩は既存の軽い植生を使う。
      if (h > 20) {
        const soil = Math.max(0, Math.sin(x * 0.13 + z * 0.07) * Math.cos(z * 0.19)) * Math.min(1, (h - 20) / 30);
        c.setRGB(c.r * (1 - soil) + 0.19 * soil, c.g * (1 - soil) + 0.12 * soil, c.b * (1 - soil) + 0.065 * soil);
      }
    },
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (boggy(x, z) < 0.12 || z < 96) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    clear: (x, z) => castleClear(x, z) || taikoClear(x, z) || siegeClear(x, z) || (Math.abs(x) < 100 && z > -100 && z < 90 && !cliffGrove(x, z)),
    trees: 180,
    tufts: 600,
    treeDensity: (x, z) => (castleClear(x, z) || taikoClear(x, z) || siegeClear(x, z) ? 0 : Math.abs(x) < 100 && z > -100 && z < 90 && !cliffGrove(x, z) ? 0.1 : 1),
    groves: [{ x: 60, z: -20, r: 12, n: 8 }, { x: -30, z: 60, r: 12, n: 8 }, ...CLIFF_GROVES],
    fleeOut: (x, z, team) => team === 1 && (z < -210 || x < -120),
  },

  waitForPlayer: true, // 動く・構える・打つまで開戦を待ち、無操作で敗退させない。
  setup(rt) {
    const W = rt.world;
    // 左下の「馬の息」の字を出さない（帯だけ残す。字は使わない）。
    rt.hud.root.dataset.tottori = '';
    const breathStyle = document.createElement('style');
    breathStyle.textContent = '#hud[data-tottori] #h-breath > span { display:none !important; }';
    document.head.appendChild(breathStyle);
    const disposeBreath = rt.dispose.bind(rt);
    rt.dispose = () => { breathStyle.remove(); delete rt.hud.root.dataset.tottori; disposeBreath(); };
    timeslipField(rt);   // 身の回りの濡れた岸・枯れ葦・倒れた槍と旗（def.timeslip）
    const F = rt.flags;
    setCastleMask(W, [
      ...TOTTORI_SEATS.map(seatOutline),
      ...TOTTORI_TAIKOGANARA_PLAN.kuruwa.map(q => q.poly.map(([x, z]) => [TAIKO.x + x, TAIKO.z + z])),
    ]);
    // 本陣の付城に陣小屋・長屋・蔵と櫓の種類を、本の CG の密度で（兵を置いた後に縁へ並べる。castle_bldg.js）
    denseCamp(rt, TOTTORI_TAIKOGANARA_PLAN, TAIKO.x, TAIKO.z);
    // 谷の霞の中で星だけが雪粒のように白く浮かない明るさへ。この戦の空だけを調整。
    if (W.stars) { W.stars.material.opacity = 0.35; W.stars.material.size = 1; }
    // 共通の判断が的を選び直しても、実際の一歩で持ち場を守る。この戦の世界だけに結ぶ。
    W.def.combatSpace = (_army, u) => bankGuardReturn(rt, u);
    // 下知が替わったら古い合図も消す。敵を「退ける」札で味方の退き太鼓を鳴らさない。
    rt.signalCue = (o) => { o.cue = ''; o.cueT = 0; };
    // 持ち越した傷は演出だけ。出血・骨の傷による減速と開始時の体力減少を持ち込まない。
    const u = rt.player.u;
    F.oldWound = !!u.wounds || u.hp < u.maxHp;
    u.hp = u.maxHp; u.wounds = null; u.woundSlow = 0; u.armWound = 0;
    dressSlopes(rt, dressTottoriNature(rt));
    // 城壁用の石の目地を山全面へ貼らず、既存の土の粒を岩肌にも使う。
    // この戦の地面の指定だけを替え、城やほかの戦の材質は保つ。
    W.groundU.tStone.value = W.groundU.tDirt.value;
    // tint は草・土の配分用。実際の地色は鳥取の既存材質へ重ね、月光でも白い崖にしない。
    const groundMat = W.terrain.material, compileGround = groundMat.onBeforeCompile;
    // 平地にも湿った土の色を残す。夜の青い光で岸全体が雪原に見えるのを抑える。
    groundMat.color.setHex(0xc1b196);
    const groundKey = groundMat.customProgramCacheKey;
    groundMat.customProgramCacheKey = () => groundKey.call(groundMat) + '|tottoriAutumnBank3';
    groundMat.onBeforeCompile = function (sh, renderer) {
      compileGround.call(this, sh, renderer);
      sh.fragmentShader = sh.fragmentShader.replace('// 城の地面を確定', `
        vec3 hillN = normalize(vWN);
        float hillMask = smoothstep(12.0, 32.0, vWP.y) * smoothstep(0.025, 0.16, 1.0 - hillN.y);
        float soilPatch = smoothstep(0.25, 0.75, macro2);
        // 麓の平地にも枯草と湿った土の色を残す。山だけの補正では岸が雪原に見える。
        // 既存の斑を使い、川・田の水面と血の跡は染め直さない。
        float bankMask = (1.0 - smoothstep(8.0, 20.0, vWP.y))
          * smoothstep(0.65, 0.9, hillN.y) * (1.0 - smoothstep(0.3, 0.8, surfaceWater));
        vec3 bankTint = mix(vec3(0.76, 0.69, 0.51), vec3(0.94, 0.86, 0.67), soilPatch);
        col *= mix(vec3(1.0), bankTint, bankMask);
        // 共通の地面が横から貼った土・根・岩肌を保ち、秋の地色だけを掛ける。
        // 真上から貼った草と土で上書きすると、急坂に長い折れ線の筋が戻る。
        vec3 hillTint = mix(vec3(0.62, 0.48, 0.32), vec3(0.76, 0.62, 0.44), soilPatch);
        col *= mix(vec3(1.0), hillTint, hillMask * (1.0 - smoothstep(0.3, 0.8, surfaceWater)));
        // 持ち場脇の久松山の急な裾を、月に白く光る灰色の壁にしない：雑木と笹の暗い斑、露岩の黒い筋（10/29）。
        {
          float scSteep = smoothstep(0.12, 0.42, 1.0 - hillN.y) * smoothstep(1.5, 5.0, vWP.y) * (1.0 - smoothstep(0.3, 0.8, surfaceWater));
          float scA = texture2D(tMacro, vWP.xz * 0.05 + vec2(0.13, 0.57)).r, scB = texture2D(tMacro, vec2(vWP.x + vWP.z, vWP.y) * 0.09 + 0.31).r;
          vec3 scrub = mix(vec3(0.16, 0.15, 0.09), vec3(0.27, 0.22, 0.13), smoothstep(0.35, 0.7, scA));
          scrub = mix(scrub, vec3(0.07, 0.065, 0.055), smoothstep(0.58, 0.72, scB) * 0.8);
          col = mix(col, scrub * (0.85 + 0.3 * scA), scSteep * 0.82);
        }
        // 月明かりでも川岸に湿った土の色を残す。水面と山肌には重ねない。
        float riverBankX = vWP.z < 0.0 ? -66.0 + vWP.z * 8.0 / 90.0 : -66.0 - vWP.z * 6.0 / 80.0;
        float bankDistance = abs(vWP.x - riverBankX);
        float riverBankMask = smoothstep(12.0, 16.0, bankDistance) * (1.0 - smoothstep(28.0, 36.0, bankDistance));
        riverBankMask *= smoothstep(-100.0, -90.0, vWP.z) * (1.0 - smoothstep(80.0, 90.0, vWP.z));
        col *= mix(vec3(1.0), vec3(0.84, 0.76, 0.57), riverBankMask * (1.0 - smoothstep(0.3, 0.8, surfaceWater)));
        // 岸の平地を茶の一枚にしない：枯れ草の黄土の斑、窪みの濡れた黒い泥、舟へ通う踏み跡の筋（10/28 点付け「地面に踏み跡を」）。
        {
          float tbDry = 1.0 - smoothstep(0.3, 0.8, surfaceWater);
          float tbG = texture2D(tMacro, vWP.xz * 0.021 + 0.41).r, tbF = texture2D(tMacro, vWP.xz * 0.11 + 0.17).r;
          float tbK = bankMask * tbDry;
          col = mix(col, vec3(0.3, 0.25, 0.13) * mix(0.8, 1.15, tbF), smoothstep(0.52, 0.64, tbG) * 0.8 * tbK);
          col = mix(col, vec3(0.06, 0.05, 0.04), smoothstep(0.36, 0.27, tbG) * 0.7 * tbK);
          float tbTrack = 1.0 - smoothstep(0.0, 1.0, abs(fract(vWP.x * 0.045 + sin(vWP.z * 0.06) * 0.6 + tbF * 0.25) - 0.5) * 8.0 - 0.6);
          col = mix(col, vec3(0.16, 0.12, 0.085), clamp(tbTrack, 0.0, 1.0) * 0.55 * tbK * smoothstep(-80.0, -60.0, vWP.x));
        }
        // 城の地面を確定`);
    };
    groundMat.needsUpdate = true;
    // 自然の崖は共通の岩肌を使う。山全体へ石垣の目地を刻まない。
    // 遠景の輪は内側だけを描く。既に内向きの面まで反転しない。
    // 法線も面に合わせ、稜線の裏側が黒い三角として垂れないようにする。
    const ma = new THREE.Vector3(), mb = new THREE.Vector3(), mc = new THREE.Vector3();
    const mn = new THREE.Vector3(), edge = new THREE.Vector3();
    for (const mountain of W.mountains.children) {
      const index = mountain.geometry.index, pos = mountain.geometry.attributes.position;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        ma.fromBufferAttribute(pos, a); mb.fromBufferAttribute(pos, b); mc.fromBufferAttribute(pos, c);
        mn.subVectors(mb, ma).cross(edge.subVectors(mc, ma));
        if (mn.x * (ma.x + mb.x + mc.x) + mn.z * (ma.z + mb.z + mc.z) > 0) {
          index.setX(i + 1, c); index.setX(i + 2, b);
        }
      }
      index.needsUpdate = true; mountain.geometry.computeVertexNormals();
      mountain.material.side = THREE.FrontSide; mountain.material.needsUpdate = true;
    }
    // 波は使い回し、水際だけ透かす。夜の空の照り返しを弱め、白い板にしない。
    for (const st of W.def.streams) if (st.mesh) {
      const mat = st.mesh.material, geo = st.mesh.geometry;
      // 持ち場の正面の千代川は月光を拾い、湿った土と水面を見分けられるようにする。
      // 水路は従来の明るさ。共通の波と篝火の映りを使い、光源は増やさない。
      const mainRiver = st.pts === RIVER;
      mat.color.setHex(mainRiver ? 0x687d80 : 0x59665c);
      mat.roughness = mainRiver ? 0.48 : 0.82; mat.envMapIntensity = mainRiver ? 0.22 : 0.12;
      mat.emissive.setHex(mainRiver ? 0x050a0c : 0x000000);
      // 共通の波の準備は不透明に戻すため、ここで岸の透けを有効にする。
      // 深さは川の中央に残し、透明な縁では地面や草を隠さない。
      mat.transparent = true; mat.opacity = 1; mat.depthWrite = true; mat.alphaTest = 0.01;
      const banks = new Float32Array(geo.attributes.position.count);
      for (let i = 0; i < banks.length; i++) banks[i] = i % 2;
      geo.setAttribute('tottoriBank', new THREE.BufferAttribute(banks, 1));
      const compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
      const nightReflection = mainRiver ? '0.55' : '0.2';
      mat.onBeforeCompile = (sh) => {
        compile.call(mat, sh);
        sh.uniforms.uTottoriNight = W.nightU;
        sh.vertexShader = 'attribute float tottoriBank; varying float vTottoriBank;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTottoriBank = tottoriBank;');
        sh.fragmentShader = 'uniform float uTottoriNight; varying float vTottoriBank;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            float shore = smoothstep(0.0, 0.14, min(vTottoriBank, 1.0 - vTottoriBank));
            diffuseColor.a *= shore;`)
          .replace('uWaterSky * (0.08 + waterEdge * 0.3)', `uWaterSky * mix(1.0, ${nightReflection}, uTottoriNight) * (0.08 + waterEdge * 0.3)`);
      };
      mat.customProgramCacheKey = () => cacheKey + '|tottori-bank-' + nightReflection; mat.needsUpdate = true;
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { starving: 'HIST_A', taikogahira: 'HIST_A', kikkawaTsunee: 'HIST_A', kaboBoats: 'HIST_B', marsh: 'HIST_B', townsfolk: 'GAME_C', sallies: 'GAME_C' };
    // 城内に逃げ込んだ民：木戸の内の曲輪に、座り込んだ者・立つ者・子ども（的にならない飾り）
    townsfolk(rt, [[4, -102, 's'], [8, -106, 's'], [14, -100, 'c'], [18, -108, 's'], [0, -112, 'c'], [12, -114, 's'], [22, -104, 'p'], [-4, -98, 's'], [6, -118, 'p'], [16, -120, 'c'], [26, -112, 's'], [-2, -122, 's']]);
    F.goalPin = { x: 0, z: 0 };
    F.bankPost = { x: -42, z: -8 }; F.guardPost = { x: GATE.x, z: FENCE_Z + 8 };
    F.gatePost = { x: GATE.x, z: GATE.z + 6 };
    F.step = 0; F.stepT = rt.t; F.ek = 0; F.ak = 0; F.burnt = 0; F.day = 0;
    // ---- 城を囲む柵（木戸の前は開けてある） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-50, FENCE_Z + 4], [0, FENCE_Z]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[20, FENCE_Z], [70, FENCE_Z + 6]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z] of [[-30, FENCE_Z + 8], [40, FENCE_Z + 8]]) rt.scene.add(tottoriLookout(W, x, z));
    // 囲みの柵の口は両端の旗で示す。二十歩を一本の冠木・屋根で覆わない。
    // 通り道と柵の当たりは保ち、夜討ちを迎える視界を空ける。
    for (const x of [0, 20]) rt.scene.add(nobori(W, x, FENCE_Z + 2, 'oda', 6));
    const siegeBatch = makeSimpleBatch();
    noT(wallLine(rt, [[70, FENCE_Z + 6], [72, 19]], { team: 0, hp: 1e9, name: '付城をつなぐ柵', meshOpt: { batch: siegeBatch } }));
    for (const [x, z] of SIEGE_FORTS) {
      const corners = [[x - 10, z + 10], [x - 10, z - 10], [x + 10, z - 10], [x + 10, z + 10]];
      const walls = noT(wallLine(rt, corners, { team: 0, hp: 1e9, name: '付城の柵', segLen: 8, meshOpt: { batch: siegeBatch } }));
      for (const pts of [[[x - 10, z + 10], [x - 4, z + 10]], [[x + 4, z + 10], [x + 10, z + 10]]]) walls.push(...noT(wallLine(rt, pts, { team: 0, hp: 1e9, name: '付城の柵', meshOpt: { batch: siegeBatch } })));
      for (const s of walls) dorui(W, s.seg, s.nx, s.nz, { h: .8, w: 1.8, batch: siegeBatch });
      hut(W, x - 4, z, 4, 3, 0, { ita: true, batch: siegeBatch });
      hut(W, x + 4, z + 3, 4, 3, 0, { ita: true, batch: siegeBatch });
      // 高画質では小屋の北に控えの庭を取り、陣幕の裾を斜面へ沿わせる。南の口は道に合わせる。
      const high = true;
      rt.scene.add(jinmaku(W, x - 4, z + (high ? -1 : 0), high ? 8 : 7, high ? 8 : 6, 4,
        { mon: 'oda', ...(high ? { contour: true } : {}) }),
      tottoriLookout(W, x + 5, z - 5, 0, false, 6.4), nobori(W, x, z + 8, 'oda', 5));
    }
    // 南の柵は既存の二本を使う。城兵と開城の使いが通る二十歩の口をふさがない。
    const posts = [], tips = [], rails = [], pose = new THREE.Object3D();
    for (let i = 1; i < SIEGE_RING.length; i++) {
      const from = SIEGE_RING[i], to = SIEGE_RING[(i + 1) % SIEGE_RING.length];
      const dx = to[0] - from[0], dz = to[1] - from[1], inset = 10 / Math.max(Math.abs(dx), Math.abs(dz));
      const a = SIEGE_FORTS.includes(from) ? [from[0] + dx * inset, from[1] + dz * inset] : from;
      const b = SIEGE_FORTS.includes(to) ? [to[0] - dx * inset, to[1] - dz * inset] : to;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(len / 10);
      for (let j = 0; j < n; j++) {
        const ax = a[0] + (b[0] - a[0]) * j / n, az = a[1] + (b[1] - a[1]) * j / n;
        const bx = a[0] + (b[0] - a[0]) * (j + 1) / n, bz = a[1] + (b[1] - a[1]) * (j + 1) / n;
        const x = (ax + bx) / 2, z = (az + bz) / 2;
        // 川は舟を止める持ち場、道との交点は守備の口。付城の小屋にも柵を重ねない。
        if (W.inWaterAt(x, z) || roadDistance(x, z) < 5) continue;
        rt.army.addStruct({ seg: [ax, az, bx, bz], nx: -(bz - az) / (len / n), nz: (bx - ax) / (len / n), h: 2.4, team: 0, hp: 1e9, noTarget: true, wall: true, name: '付城をつなぐ柵' });
        // 長い遮断線は杭・尖った先・横木の三束で描く。実兵を増やさない。
        const count = Math.ceil(len / n / .8);
        for (let k = 0; k <= count; k++) {
          const px = ax + (bx - ax) * k / count, pz = az + (bz - az) * k / count;
          const y = W.heightAt(px, pz);
          pose.position.set(px, y + 1, pz); pose.rotation.set(0, 0, 0); pose.scale.set(.12, 2.3, .12); pose.updateMatrix(); posts.push(pose.matrix.clone());
          pose.position.y = y + 2.3; pose.scale.set(.12, .3, .12); pose.updateMatrix(); tips.push(pose.matrix.clone());
        }
        for (const y of [.7, 1.7]) {
          const ya = W.heightAt(ax, az), yb = W.heightAt(bx, bz), span = len / n;
          pose.position.set(x, (ya + yb) / 2 + y, z);
          pose.rotation.set(0, -Math.atan2(bz - az, bx - ax), Math.atan2(yb - ya, span));
          pose.scale.set(Math.hypot(span, yb - ya), .13, .13); pose.updateMatrix(); rails.push(pose.matrix.clone());
        }
      }
    }
    const wood = new THREE.MeshLambertMaterial({ color: 0x756044 });
    for (const [matrices, geometry] of [[posts, new THREE.CylinderGeometry(1, 1, 1, 5)], [tips, new THREE.ConeGeometry(1, 1, 5)], [rails, new THREE.BoxGeometry(1, 1, 1)]]) {
      const mesh = new THREE.InstancedMesh(geometry, wood, matrices.length);
      for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    }
    siegeApproach(rt, SHIYORI, siegeBatch);
    finalizeSimpleBatch(rt, siegeBatch);
    // ---- 鳥取城の木戸と山の上の屋敷 ----
    rt.scene.add(kabukimon(W, GATE.x, GATE.z, 7, 0, { doors: false }));
    F.gateDoor = tobira(W, GATE.x, GATE.z, 7); rt.scene.add(F.gateDoor);
    F.gateBar = rt.army.addStruct({ seg: [GATE.x - 3.5, GATE.z, GATE.x + 3.5, GATE.z], nx: 0, nz: 1, hp: 1e9, team: 1, name: '城の木戸', noTarget: true });
    // 閉じる木戸だけは従来の進行に結ぶ。ほかの虎口は常に開ける。
    buildTottoriCastles(rt, noT);
    for (const [x, z] of [[GATE.x - 6, GATE.z - 4], [GATE.x + 6, GATE.z - 4]]) rt.scene.add(nobori(W, x, z, 'mori', 6));
    // ---- 岸の兵糧舟 ----
    F.boats = BOATS.map((b, i) => {
      const x = riverX(b.z);
      // 川幅の端へ着け、岸から火をかけられるようにする。
      // 川の縁は、描く地面の三角面によって浅くなる。船底と舳先まで水のある
      // 所へ最大一・二歩だけ寄せる。岸の放火の印と道順は動かさない。
      let bx = x + 10.2;
      const c = Math.cos(-0.09), s = Math.sin(-0.09);
      for (let j = 0; j < 4; j++) {
        let depth = Infinity;
        for (const [px, pz] of [[0, -4.8], [0, 4.8], [-1.2, -3.4], [1.2, -3.4], [-1.2, 3.4], [1.2, 3.4]]) {
          depth = Math.min(depth, W.waterDepthAt(bx + px * c + pz * s, b.z - px * s + pz * c));
        }
        if (depth >= 0.18 || j === 3) break;
        bx -= 0.4;
      }
      // 岸の地面が水面より高くても、舟を地面の上へ持ち上げない。
      const m = boatMesh(), y = W.heightAt(x, b.z) + W.waterDepthAt(x, b.z);
      m.position.set(bx, y + 0.15, b.z); m.rotation.y = -0.09; rt.scene.add(m);
      // 火をかける印は船べりの岸側へ。川の曲がりで舟と印が離れない。
      // 印は岸の内へ一歩寄せる。川岸の境に立って、川へ入ったと数えない。
      return { ...b, x: x + 15, m, i };
    });
    // 苫と俵のそばの小さな灯り。舟を焼く前から川面に船べりが見える。
    for (const b of F.boats) {
      const x = b.m.position.x + Math.sin(b.m.rotation.y) * 3, z = b.z + Math.cos(b.m.rotation.y) * 3;
      b.lamp = W.addFire(x, z, { torch: true, size: 0.2, smoke: false, lightRadius: 10, lightColor: 0xff8a3a, lightStrength: 0.6, lightDecay: 0, waterReflection: true, h: b.m.position.y - W.heightAt(x, z) + 1.2 });
    }
    // 舟の番の篝火：岸の舟を持ち場から見えるように、船べりの岸側へ一基ずつ（毛利の荷揚げの番。位置は推定）。
    const boatBeacons = F.boats.map((b) => [b.m.position.x + 5, b.z + 4]);
    rt.scene.add(kagaribiBatch(W, boatBeacons));
    for (const [x, z] of boatBeacons) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 22, lightColor: 0xff8a3a, lightStrength: 2.4, lightDecay: 0, waterReflection: true });
    // 川上で先に火をかけられた米舟。持ち場から北の川面に炎と煙が見え、焼く仕事が分かる。
    for (const [z, rot, size] of [[-50, 0.35, 3.2], [-76, -0.2, 2.4]]) {
      const x = riverX(z) + 4, m = boatMesh(), y = W.heightAt(x, z) + W.waterDepthAt(x, z);
      m.position.set(x, y - 0.1, z); m.rotation.set(0.06, rot, -0.12); rt.scene.add(m);
      W.addFire(x, z, { size, smoke: false, lightRadius: 22, lightColor: 0xff7a2a, lightStrength: 2.2, lightDecay: 0, waterReflection: true, h: m.position.y - W.heightAt(x, z) + 0.6 });
      W.addSmokeColumn(x, y + 3, z, { size: size + 0.4 });
    }
    tottoriLanding(rt, W);
    tottoriBankHuts(rt, W);
    // ---- 川岸と柵を受け持つ組 ----
    F.hide = allyGroup(rt, { name: '羽柴の川岸の組', fixed: true, formation: 'line', anchor: { x: -38, z: 6 }, facing: -Math.PI / 2, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.hachi = allyGroup(rt, { name: '羽柴の柵の組', fixed: true, formation: 'line', anchor: { x: 10, z: FENCE_Z + 12 }, facing: Math.PI, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.oda = [F.hide, F.hachi];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -26, z: 22 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 太閤ヶ平の本陣と大軍（軽い作り） ----
    // 秀吉は東の陣城に置き、経家は山上に置く。近い組への命令は組頭・伝令が伝える。
    F.honjin = camp(rt, { x: TAIKO.x, z: TAIKO.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀吉', hat: 'kabuto_bari' }, guard: 15, reserve: 16, runTo: { x: -20, z: 20 } });
    // 太閤ヶ平は攻めの本陣だけでなく、毛利の後詰が来た時の大きな野戦にも備える堅い陣城。内郭を大きな土塁で囲む
    // 南大手・東搦手を開け、北には口を作らない。
    const west = TAIKO.x - TX - TB, east = TAIKO.x + TX + TB;
    const north = TAIKO.z - TZ - TB, south = TAIKO.z + TZ + TB;
    const gap = TAIKO.gateW / 2, eastGap = TAIKO.eastGateW / 2;
    const [nw, sw] = TAIKO_LOOKOUTS;
    const nx = nw.x - nw.w / 2 - 1, sx = sw.x - sw.w / 2 - 1;
    for (const pts of [
      // 台の外を回って柵を置き、内側の登り道と梯子は空ける。
      [[TAIKO.x - gap, south], [TAIKO.x - 7, south], [TAIKO.x - 7, south + 4],
        [TAIKO.x - 11, south + 4], [TAIKO.x - 11, south], [west, south],
        [sx, sw.z + sw.d / 2 + 1], [sx, sw.z - sw.d / 2 - 1], [west, sw.z - sw.d / 2 - 1],
        [west, nw.z + nw.d / 2 + 1], [nx, nw.z + nw.d / 2 + 1],
        [nx, nw.z - nw.d / 2 - 1], [east, north], [east, TAIKO.z - eastGap]],
      [[TAIKO.x + gap, south], [TAIKO.x + 7, south], [TAIKO.x + 7, south + 4],
        [TAIKO.x + 11, south + 4], [TAIKO.x + TX - 16 - TB, south + 31],
        [east, south + 31], [east, TAIKO.z + eastGap]],
    ]) noT(wallLine(rt, pts, { team: 0, hp: 1e9, name: '柵', segLen: 8 }));
    rt.scene.add(kabukimon(W, TAIKO.x, south, TAIKO.gateW, 0), kabukimon(W, east, TAIKO.z, TAIKO.eastGateW, Math.PI / 2));
    for (const k of TAIKO_LOOKOUTS) rt.scene.add(tottoriLookout(W, k.x, k.z, 0, true));
    rt.scene.add(hyoro(W, TAIKO.x - 8, TAIKO.z + 10, 0.4), umatsunagi(W, TAIKO.x + 10, TAIKO.z - 8, 0.3, 8));
    taikoBarracks(rt, W);
    hisamatsuTerraces(rt, W);
    farHillCastle(rt, W);
    hisamatsuFootIshigaki(rt, W);
    if (true) {
      // 兵糧は寄せ手の陣にだけ置く。空腹の城内へ米俵を増やさない。
      rt.scene.add(hatazao(W, TAIKO.x + 20, TAIKO.z + 12, 0, 5, 'oda'),
        lumber(W, TAIKO.x - 19, TAIKO.z - 17));
    }
    // 東西の尾根沿いの二重の遮断線。麓の木戸や川岸の退路は横切らない。
    for (const off of [-10, 10]) {
      noT(wallLine(rt, [[TAIKO.x - TX - TAIKO.bankW - 12, TAIKO.z + off], [70, CASTLE.z + off]], { team: 0, hp: 1e9, name: '竪土塁', segLen: 10 }));
      // 土塁の形は高さの関数にある。柵の下に模型を重ねて二重に盛らない。
    }
    F.ehon = camp(rt, { x: CASTLE.x, z: CASTLE.z, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '吉川経家', hat: 'kabuto_m' }, guard: 15, reserve: 10, runTo: { x: GATE.x, z: GATE.z - 8 } });
    // 本の城図にある高い登り旗で城将の居所を示す。既存の材質を使い、支度時だけ置く。
    rt.scene.add(nobori(W, CASTLE.x + 3, CASTLE.z + 3, 'mori', 9));
    // 丸山方面の秀長は西の付城から城へ向く。既存の旗本・控えを移し、兵は増やさない。
    F.hidenaga = camp(rt, { x: -132, z: -210, compact: true, facing: Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀長' }, guard: 15, reserve: 10, runTo: { x: -132, z: -180 } });
    // 番所の戸口と襖に旗竿の束を重ねず、幕の外を通れる陣にする。
    F.nasa = camp(rt, { x: -28, z: -222, compact: true, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '奈佐日本之介' }, guard: 15, reserve: 10, runTo: { x: -30, z: -186 } });
    F.castleGuards = [['森下道誉', GATE.x + 24, GATE.z - 18], ['中村春続', CASTLE.x + 12, CASTLE.z - 6]].map(([name, x, z]) => {
      const g = enemyGroup(rt, { fixed: true, noAI: true, faction: 'mori', name: name + 'と近習', anchor: { x, z }, facing: 0, width: 3, formation: 'ring', aggro: 4 },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: false } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], KIKKAWA));
      g.units[0].campProtected = true;
      return g;
    });
    F.jinHosts = buildSonae(rt, this.jinkei);
    // 千代川の西岸にも羽柴の囲みの列と篝火（兵糧の舟を通さない川の封鎖。位置と人数は推定）。軽い遠景の兵だけ。
    for (const [x, z, w, count, seed] of [[-100, -30, 30, 46, 15901], [-104, 4, 22, 30, 15902]]) {
      const h = W.addDistantArmy({ x, z, w, d: 6, count, facing: Math.PI / 2, team: 0, armor: 0x2e2822, flagTex: flagTexture('oda'), mon: 'oda', kind: 'mixed', seed });
      h.army.noWake = true;
    }
    {
      const westFires = [[-92, -44], [-93, -18], [-95, 12]];
      rt.scene.add(kagaribiBatch(W, westFires));
      for (const [x, z] of westFires) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 18, lightColor: 0xff8a3a, lightStrength: 1.6, lightDecay: 0, waterReflection: true });
    }
    const beaconPoints = [[-40, FENCE_Z + 14], [0, FENCE_Z + 14], [40, FENCE_Z + 14], [60, 100]];
    // 脚と薪の籠を四基まとめ、既存の炎の照明だけを使う。
    rt.scene.add(kagaribiBatch(W, beaconPoints));
    for (const [x, z] of beaconPoints) {
      W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 18, lightColor: 0xff8a3a, lightStrength: 1.6, lightDecay: 0 });
    }
    for (const [x, z] of [[-10, 30], [20, 34]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { lightRadius: 18, lightColor: 0xff8a3a, lightStrength: 1.6, lightDecay: 0 }); }
    tottoriCampTools(rt);
    // 舟の護衛と控えは始めから岸に置く。名のある城将を前線の番兵へ重ねない。
    F.guard = enemyGroup(rt, { fixed: true, historicalOrders: true, faction: 'mori', name: '舟の番', anchor: { x: -52, z: -20 }, facing: Math.PI / 2, width: 5, formation: 'line', aggro: 12, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: BANK_SAMURAI }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }], KIKKAWA));
    // 夜の舟の番は、寄せ手に気づくまで（舟の夜の下知まで）撃たない。組へ着く前に遠くから撃ち倒さない。
    F.guard.fire = false;
    F.guard2 = enemyGroup(rt, { fixed: true, historicalOrders: true, faction: 'mori', name: '川上の舟の番', anchor: { x: -54, z: -58 }, facing: Math.PI / 2, width: 4, formation: 'line', aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: BANK_SAMURAI }, { type: 'ashigaru', n: 7 }], KIKKAWA));
    F.bankGroups = [F.guard, F.guard2];
    // 城兵は初めから木戸の内に待つ。新手はこの控えが道を通って出る。
    // 柵の実兵は共通設定で減るため、城兵も三組計二十一人に絞る。
    // 飢えた兵の打つ間を長くし、足軽大将が味方と二〜三分持ちこたえられる余地を作る。
    // 下りも退却時と同じ折れ道を使う。後列が持ち場へ直進して切岸で止まるのを防ぐ。
    F.sallies = [0, 1, 2].map((i) => enemyGroup(rt, { fixed: true, noAI: true, faction: 'mori', name: i ? '木戸の控え' : '木戸の城兵',
      anchor: { ...SALLY_SEATS[i] }, facing: 0, width: 3, colW: 2, formation: 'column', roadColumn: true, followColumnRoad: true, aggro: 5, morale: 55, dmgMult: 0.8, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: { ...BANK_SAMURAI, cdBase: 2, windup: 0.6 } }, { type: 'ashigaru', n: 6, o: { cdBase: 2.4, windup: 0.65 } }], HUNGRY)));
    for (const g of F.sallies) hungryLook(g);
    F.tgun = allyGroup(rt, { fixed: true, name: '柵の内の鉄砲組', anchor: { x: 8, z: FENCE_Z + 17 }, facing: Math.PI, width: 9, aggro: 4, formation: 'line' },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'gun', n: 10 }], ODA));
    // 遊び始めて百十秒の頃、本人の向かう先の二十五〜三十五メートル（道の脇へ九メートルずらす）に、羽柴勢と城兵の押し合いが起こる。
    // 打って出た城兵の組（F.sallies）とは別で、崩れず、時間を持たせる。本人の道筋は塞がない。
    const clashAt = (base, tag, wide = 7.5) => {
      if (rt.over || rt.flags.ending || !rt.player.u.alive) return;
      const p = rt.player.u.pos; let yaw = rt.player.yaw || 0;
      if (tag) { const gp = F.guard.units.find((u) => u.alive)?.pos; if (gp && Math.hypot(gp.x - p.x, gp.z - p.z) > 20) yaw = Math.atan2(gp.x - p.x, gp.z - p.z); }   // 開戦すぐの組は、舟の番（本人の向かう先）の方へ
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      for (const [k, side] of [[0, 1], [1, -1]]) {
        let d = base + k * 6, mx, mz;
        for (; d >= 8; d -= 3) { mx = p.x + fx * d - fz * side * wide; mz = p.z + fz * d + fx * side * wide; if (W.heightAt(mx, mz) >= (W.waterY ?? -99) + 0.3) break; }
        if (d < 8) continue;
        const mel = (g) => { g.noRout = true; g.noAI = true; g.fire = false; g.morale = 100; g.dmgMult = .2; return g; };
        const face = Math.atan2(-fx, -fz);
        mel(allyGroup(rt, { fixed: true, fullStrength: true, name: '羽柴の押さえ' + tag + k, anchor: { x: mx - fx * 2.2, z: mz - fz * 2.2 }, facing: yaw, order: 'hold', width: 6, formation: 'yari', aggro: 9, morale: 100 },
          dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'ashigaru', n: 8 }], ODA)));
        const e = mel(enemyGroup(rt, { fixed: true, faction: 'mori', name: '柵へ迫る城兵' + tag + k, anchor: { x: mx + fx * 2.2, z: mz + fz * 2.2 }, facing: face, order: 'hold', width: 6, formation: 'yari', aggro: 9, morale: 100, fleeDir: { x: fx, z: fz } },
          dress([{ type: 'samurai', n: 1, o: { ...BANK_SAMURAI, cdBase: 2, windup: 0.6 } }, { type: 'ashigaru', n: 8, o: { cdBase: 2.4, windup: 0.65 } }], HUNGRY)));
        hungryLook(e);
        W.addFire(mx - fz * 4, mz + fx * 4, { torch: true, h: 1.6, size: .7, smoke: false, lightRadius: 26, lightColor: 0xffa060, lightStrength: 2.8, lightDecay: 0 });
      }
    };
    // 開戦すぐ（12秒）にも、25秒の画面の前 20〜30m で押し合いを起こす（10/30 実機の門：開戦25秒でまばら）
    rt.after(14, () => clashAt(22, 'α', 3));
    rt.after(110, () => clashAt(24, ''));
    // 主殿と陣所の床・護衛の持ち場を保ち、軽い備えから兵を追加しない。
    for (const g of rt.army.groups) {
      g.noAI = true;
      // 待機中の城兵も、共通の小勢の寄せで持ち場を離れない。
      // この戦の道順・接近への応戦・柵への出撃はそのまま使う。
      if (g.team === 1) g.historicalOrders = true;
    }
    for (const c of [F.honjin, F.ehon, F.hidenaga, F.nasa]) {
      c.guard.guard = true; c.guard.guardSight = 18; c.guard.guardLeash = 7;
      if (c.general) { c.general.campProtected = true; c.general.noTarget = true; c.general.group.aggro = 0; }
    }
    // 名乗りの札だけでも敵味方と所属が分かる。実在の将の名は保つ。
    for (const g of rt.army.groups) for (const u of g.units) {
      if (u.isPlayer || !['samurai', 'busho', 'cavalry'].includes(u.type)) continue;
      const side = g.team === 1 ? '敵の毛利方' : '味方の羽柴方';
      u.nanori = u.name ? `${side}、${u.name}なり！` : `${side}、槍をそろえよ！`;
    }
    // 兵の内訳と数は準備時に一度だけ固定し、途中に戦う新手を足さない。

    // 賀露の湊も塞いである（海から兵糧を入れさせない。遠景だけの軽い作り）
    rt.scene.add(tottoriLookout(W, -58, -188), nobori(W, -58, -184, 'oda', 6));

    F.env = allyGroup(rt, { name: '秀吉の使い', fixed: true, anchor: { x: 0, z: FENCE_Z + 8 }, facing: Math.PI, width: 1.4, colW: 1, roadColumn: true, followColumnRoad: true, aggro: 0, noRout: true, noAI: true, order: 'hold', formation: 'column', speed: 1.6, civ: true },
      [{ type: 'samurai', n: 1, o: { name: '使いの侍', flag: null } }, { type: 'porter', n: 2, o: { flag: null } }]);
    for (const u of F.env.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    // 月を少し高く置き、槍の影が岸を端から端まで走る黒い線にならないようにする。月明かりは岸の兵と石垣の形が読める明るさ（10/30 採点：暗すぎる）。
    // 月と反対を向いた胴・船べりにも空の光を残す。月の影と夜空は保つ。
    applyLook(rt, { ...NIGHT, time: 'night', dir: [0.8, 0.48, -0.4], sunI: 0.85, hI: 1.45, sun: 0xa3abb8, hs: 0x848d9c }); rt.world.lookDark = true;
    // 出陣札の間は世界の更新が止まる。遠景の霞もここで夜色にそろえる。
    W.mountU.hazeCol.value.copy(W.scene.fog.color);
    W.mountU.vis.value = W.lookOf('night').vis;
    W.prepareNight();
    // 携帯でも雪の粒に見えない、細かな星。点の数や光は増やさない。
    if (W.stars) {
      W.stars.material.size = 0.7; W.stars.material.opacity = 0.25;
      // 星の数も絞る。霞の濃い岸で、空いっぱいの白粒を雪と見誤らせない。
      W.stars.geometry.setDrawRange(0, 180);
    }
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '川岸の組へ進み、一手をそろえよ' : '川岸の組へ合流せよ', 'main', true);
    this.siegeScene(rt, '鳥取城を囲んで四か月', '山の城へ米を運ぶ舟。今夜は、この岸を守る');
    rt.say('組頭', '川面の灯りを見よ。米舟二艘を焼くぞ。まず、わしらの列へ', 5);
    rt.marker('hide', centerOf(F.hide), '川岸の組', { group: F.hide, guideAlways: true });
    // 川上の舟へ視点を向け、最初から川面の舟と岸の組を見渡せるようにする。
    // 舟より少し川下（西）へ向け、北西に高まる対岸の山肌で画面の右半分をふさがない。
    // ただし右の端には久松山の西の斜面（段の平場・板小屋・灯り）を入れる。舟は左寄りに入る。
    const first = F.boats[1].m.position, player = rt.player;
    player.yaw = player.u.heading = Math.atan2(first.x - 4 - player.u.pos.x, first.z + 3 - player.u.pos.z);
    this.openDay(rt);
    if (F.oldWound) rt.after(2, () => { if (!rt.over) rt.say('組頭', '古傷には布を巻いた。今夜は十分に動けるぞ', 3); });
    groundTottoriPosts(rt);
    installTottoriRearWarning(rt);
    installTottoriBankFooting(rt);
    installTottoriCamera(rt);
    // 岸の土は砂色の滑らかな写真でなく、湿った河原の泥の写真（共通の絵を使い回す。CC0 の泥）。月夜でも土塊と窪みの濃淡が残る。
    if (W.groundU) W.groundU.tDirt.value = W.groundU.tBank.value = groundDetailTex('mud');
    // 舟を焼きに寄る岸の手前（25秒の目線）：踏み固めた岸の土と湿った泥、半ば埋めた石と捨てた俵。建物・旗は既にある物で足りる。
    dressStage(rt, { at: { x: -46, z: -34 }, heading: 0, flag: false, huts: 0, fence: false, yagura: false, clutter: 3, rocks: 4, fire: false, wet: 0.9, trodden: 0.9, radius: 38 });
  },

  // 日の間隔を省略して次の持ち場へ。城内の正確な数を示す軍議は開かない。
  openDay(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || (F.step !== 0 && F.step !== 1.5)) return;
    F.day = F.step === 0 ? 6 : 13;
    // 初夜は短い下知だけ。帰還の段では移動が済みしだい城兵を迎える。
    if (F.step === 1.5) {
      rt.banner('岸の役目を終えた', '次は柵の口。味方と岸沿いに戻れ');
      this.dayEvent(rt, '打って出た城兵');
    } // 初夜の下知は、本人が川岸の組へ着いてから出す。
  },
  // 日送りから戦場へ戻る時だけ知らせる。舟の夜の途中で何日も進めない。
  siegeScene(rt, title, subtitle = '城を出た者は痩せ衰え、寄せ手にも疲れが見える') {
    const F = rt.flags, st = { siege: { fatigue: 30 + F.day * 0.7, morale: 65 } }; // 囲む側の疲れの復元値。城内の残量は知らない。
    for (const g of rt.army.groups) if (g.team === 0) campWear(g, st.siege.fatigue, Math.max(35, st.siege.morale));
    rt.banner(title, subtitle);
    return st;
  },
  dayEvent(rt, kind) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (kind === '兵糧舟の夜' && F.step === 0) {
      this.boats(rt);
    } else if (kind === '打って出た城兵' && F.step === 1.5) F.sortieReady = true;
  },

  // ① 兵糧舟に火をかける
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t; F.ak0 = F.ak || 0; F.ek0 = F.ek || 0;
    rt.setPhase('boats');
    this.siegeScene(rt, '兵糧舟の夜', '味方の列で舟の番を退け、岸の二艘に火をかけよ');
    // 舟を焼く組は、選んで出した夜討ちの手。囲みの陣の疲れはあっても、番兵とぶつかってすぐには崩れない。
    F.hide.morale = Math.max(F.hide.morale, 80);
    // 舟を焼くまでは岸の組が持ち場を捨てない。討たれる者は出るが、組ごと逃げて本人だけを残さない。
    F.hide.noRout = true;
    rt.say('組頭', '法螺貝と早打ちじゃ。この組で舟の番へ懸かれ。二艘に火をかけよ', 5);
    rt.unmark('hide');
    F.bankEntry = { x: -42, z: -4 };
    F.returnPoint = { x: 10, z: 20 };
    F.boatWay = { x: -36, z: -8 };
    rt.marker('bank-road', () => bankEntry(rt), '舟へ戻る岸の道', { guideAlways: true });
    rt.marker('bank-approach', () => {
      const boat = nextBankBoat(rt);
      return boat ? boatApproach(rt, boat) : F.boatWay;
    }, '舟へ回る岸の道', { guideAlways: true });
    // 敵の現在地でなく、番兵と出会う岸の持ち場へ案内する。
    rt.marker('bank-fight', { x: -48, z: -16 }, '味方と舟の番を退けよ', { guideAlways: true });
    const task = rt.obj('main', '味方と番を退け、舟二艘を焼け', 'main', true);
    tottoriSignal(rt, task, 'sig_kakari', '法螺貝と早打ち：舟の番へ', F.hide.center());
    // 夜の見通しを待たず、既存の番兵を川岸の組へ寄せる。
    F.guard.fire = true;
    F.guard.march = true; F.guard.colW = 3; F.guard.order = 'path';
    F.guard.path = [[-48, -16], [-42, -4]]; F.guard.pathIdx = 0;
    F.guard.onArrive = (g) => { g.march = false; g.order = 'hold'; g.focus = null; };
    // 夜の見通しの外でも、川岸の平地を通って番兵へ寄せる。
    F.hide.march = true; F.hide.colW = 3; F.hide.order = 'path';
    F.hide.path = [[-38, 10], [-42, -4], [-48, -16]]; F.hide.pathIdx = 0;
    F.hide.onArrive = (g) => { g.march = false; g.order = 'hold'; g.focus = null; };
    rt.marker('guard', centerOf(F.guard), '舟の番', { red: true, group: F.guard });
    rt.after(12, () => {
      if (F.step !== 1 || F.ending || gone(F.guard2)) return;
      // 夜の見通しに頼って待たず、岸の通れる道を隊で寄せる。
      F.guard2.march = true; F.guard2.colW = 3; F.guard2.order = 'path';
      F.guard2.path = [[-56, -50], [-56, -34], [-48, -24], [-42, -4]]; F.guard2.pathIdx = 0;
      F.guard2.onArrive = (g) => { g.march = false; g.formation = 'yari'; g.yariRanks = 3; g.order = 'hold'; g.focus = null; g.aggro = 12; };
      rt.marker('guard2', centerOf(F.guard2), '川上から来る舟の番', { red: true, group: F.guard2 });
      rt.say('足軽', '川上から舟の番が来たがや！', 3);
    });
    for (const b of F.boats) {
      b.name = b.i === 0 ? '川下の兵糧舟' : '川上の兵糧舟';
      rt.marker('b' + b.i, b, b.name, { h: 2, guideAlways: true });
      rt.addInteract('b' + b.i, { x: b.x, z: b.z }, b.name + 'に火をかける', () => this.burn(rt, b), { r: 3, hold: 2 });
    }
    // 任務札が長く変わらない時（bot 10/28：「舟二艘を焼け」のまま二分あまり何も起きない）は、舟のそばまで来た味方の足軽が松明で火をかける。
    // 本人が先に火をかければ従来どおり。番が舟に張り付いている間は、味方も火をかけない。
    F.boatStartT = rt.t;
    const allyBurn = () => {
      if (F.step !== 1 || F.ending || rt.over) return;
      const next = F.boats.find((boat) => !boat.burnt);
      if (!next) return;
      const since = rt.t - Math.max(F.boatStartT, F.burntT || 0);
      const near = (g) => g && !groupGone(g) && g.units.some((o) => o.alive && Math.hypot(o.pos.x - next.x, o.pos.z - next.z) < 16);
      const guarded = [F.guard, F.guard2].some((g) => g && !groupGone(g) && g.units.some((o) => o.alive && !o.fleeing && Math.hypot(o.pos.x - next.x, o.pos.z - next.z) < 7));
      if (since > 90 && near(F.hide) && !guarded) {
        rt.say('足軽', '松明を投げ込んだぞ！　舟に火が回った！', 3);
        this.burn(rt, next);
      }
      rt.after(4, allyBurn);
    };
    rt.after(4, allyBurn);
  },
  burn(rt, b) {
    const F = rt.flags;
    if (b.burnt || F.step !== 1 || F.ending || rt.over || !rt.player.u.alive) return;
    b.burnt = true;
    rt.uninteract('b' + b.i); rt.unmark('b' + b.i);
    // 船べりの灯りを燃える荷へ替え、同じ舟が点光源の枠を二つ使わない。
    rt.world.removeFire(b.lamp); b.lamp = null;
    rt.world.addFire(b.m.position.x, b.z, { size: 1.9, smoke: false, lightRadius: 18, lightColor: 0xff8a3a, lightStrength: 1.6, lightDecay: 0, waterReflection: true, h: b.m.position.y - rt.world.heightAt(b.m.position.x, b.z) }); rt.world.addSmokeColumn(b.m.position.x, b.m.position.y + 3, b.z, { size: 2.4 });
    F.burnt++; F.burntT = rt.t;
    // 放火の順にかかわらず、手柄が荷の搬入を止めたことを一度ずつ返す。
    rt.say('組頭', F.burnt === 1 ? '一艘は燃えた。残る舟へ組ごと進むぞ。味方のそばを離れるな'
      : '二艘とも燃えた。追わず岸を守れ。退き太鼓で戻るぞ', 4);
    battleEvent(rt, EVENT_FIRE_START, b, null, 1, false, '毛利の兵糧舟が燃え始めた');
    const label = b.name + 'を焼いた';
    rt.award((t) => t.side.push(label), label);
    if (F.burnt >= 2) rt.obj('main', '岸を守れ。退き太鼓を待て', 'main', true);
    else {
      rt.obj('main', '味方と進み、残る舟に火をかけよ', 'main', true);
      // 最初の舟の前で味方を止めない。残る舟の東の岸道を、既存の組で歩いて進む。
      // 番兵の列を横切らず、最後は舟から十歩以内の支えの位置へ着ける。
      const next = F.boats.find((boat) => !boat.burnt), g = F.hide;
      if (next && !groupGone(g)) {
        const c = g.center();
        g.focus = null; g.march = true; g.colW = 3; g.order = 'path';
        g.path = [[-38, Math.max(-62, Math.min(-8, c.z))], [-38, next.z], [next.x + 7, next.z]];
        g.pathIdx = 0;
        g.anchor.x = next.x + 7; g.anchor.z = next.z;
      }
    }
  },

  // 本人が舟を焼き、護衛を退けて次の日へ進む。
  midA(rt) {
    const F = rt.flags;
    if (F.step !== 1) return;
    F.step = 1.5; F.stepT = rt.t; rt.setPhase('return');
    const p = rt.player.u.pos;
    F.returnIndex = p.x >= 4 && p.z >= 4 ? 3 : p.x >= -32 ? 2 : p.z >= -8 ? 1 : 0;
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight'); rt.unmark('bank-approach');
    const task = rt.obj('main', '岸道から柵の口へ戻れ', 'main', true);
    tottoriSignal(rt, task, 'sig_nobiki', '退き太鼓：追わず柵へ戻れ', F.hide.center());
    rt.marker('return', () => returnWay(rt), () => F.step === 1.5 && F.returnIndex < RETURN_ROAD.length - 1 ? '柵へ戻る岸の道' : F.step === 2 ? '柵の内の守り場' : '柵の口へ戻れ', { h: 3, guideAlways: true });
    F.hide.retreatOnly = true; F.hide.focus = null; F.hide.noRout = false;
    F.hide.order = 'path'; F.hide.pathIdx = 0;
    F.hide.path = [...RETURN_ROAD, [10, FENCE_Z + 12], [-10, FENCE_Z + 12]];
    F.hide.onArrive = (g) => { g.order = 'hold'; g.retreatOnly = false; };
    this.openDay(rt);
    rt.say('組頭', '退き太鼓じゃ。舟は止めた。敵を追わず、岸沿いに柵の口へ戻れ', 4);
    // 帰還は更新側で確かめる。川岸にいる間に夜討ちを始めない。
  },
  midB(rt) {
    const F = rt.flags;
    if (F.step !== 2) return;
    F.step = 2.5; F.stepT = rt.t; rt.setPhase('env-wait');
    F.gateBar.opened = false;
    for (const leaf of F.gateDoor.userData.leaves) leaf.rotation.y = 0;
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.award((t) => t.side.push('柵の口を守った'), '柵の口を守った');
    rt.obj('main', '柵を守り、秀吉方の使いを待て', 'main', true);
    rt.objProgress('main', '城兵は退いた。追わず、ここで待て');
    rt.banner('城兵が退いた', '追わずに柵の口を守れ');
    rt.after(4, () => { if (F.step === 2.5 && !F.ending && !rt.over) this.envoy(rt); });
  },

  // ② 打って出た城兵を止める
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t; F.ak0 = F.ak || 0; F.ek0 = F.ek || 0; F.holdT = 0; F.sallyPressAt = rt.t + 12;
    this.siegeScene(rt, '幾日か後の夜討ち', '飢えた城兵が打って出た。柵の口を守れ');
    rt.setPhase('sortie');
    // 帰還の一点を指し続けず、味方と構える持ち場として案内する。
    rt.marker('return', () => returnWay(rt), '柵の内の守り場', {
      h: 0.3, guideArea: 'guard', guideRadius: 8,
      waitGuide: () => F.sallies.every((g) => gone(g) || g.routed || g.ttRetreat || g.ttReturned)
        ? '城兵は退いている。追わず、ここで待て' : '坂の方を向き、味方と柵を守れ',
    });
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight'); rt.unmark('bank-approach');
    for (const q of [F.guard, F.guard2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    const task = rt.obj('main', HI(rt) ? '一手を率い、柵で城兵を止めよ' : '柵の口で城兵を止めよ', 'main', true);
    tottoriSignal(rt, task, 'horagai', '法螺貝：柵の口を守れ', { x: GATE.x, z: FENCE_Z + 8 }, 0.6);
    rt.say('組頭', '柵の法螺貝じゃ。持ち場を固め、夜討ちを防げ。城へ退く者は追うな', 4);
    F.sallies.forEach((g, i) => {
      // 飢えは足・息・気力へ反映する。得物の威力を一律に半分にしない。
      campWear(g, 60, 50);
      rt.after(i * 12, () => {
        if (F.step !== 2 || F.ending || gone(g)) return;
        F.gateBar.opened = true; F.gateDoor.userData.open();
        // 通常の行軍形へ替えると道に沿う縦隊が外れる。山道では二列の縦隊を保つ。
        g.ttOut = true; g.march = false; g.marching = false; g.formation = 'column'; g.order = 'path'; g.pathIdx = 0;
        const road = CASTLE_ROADS[0].slice().reverse();
        g.path = [[GATE.x, GATE.z - 4], ...road.filter((p) => p[1] > GATE.z && p[1] < FENCE_Z + 10), [GATE.x, FENCE_Z + 10]];
        g.ttIngress = [[SALLY_SEATS[i].x, SALLY_SEATS[i].z], ...g.path];
        // 幾日か後の夜。城兵は闇にまぎれて坂の下まで降りてから見つかる。
        // 長い九十九折りを歩き切るのを待たせず、柵から四十歩ほどの折れから寄せる。
        let k = g.path.findIndex((q) => q[1] > FENCE_Z - 40);
        if (k > 0) {
          const [tx, tz] = g.path[k], W = rt.world;
          g.anchor.x = tx; g.anchor.z = tz; g.pathIdx = k + 1;
          const next = g.path[g.pathIdx];
          g._face = g.facing = Math.atan2(next[0] - tx, next[1] - tz);
          // 木戸内の横ずれをそのまま移さず、後列も九十九折りの道上から歩き出す。
          g._slotFit = null; g._routeCols = 0;
          for (const u of g.units) if (u.alive) {
            const at = g.slotPos(u.slot, g.initial);
            u.pos.x = at.x; u.pos.z = at.z; u.pos.y = W.heightAt(at.x, at.z); u.moveTo = null; u.target = null;
          }
        }
        g.onArrive = (q) => { q.march = false; q.formation = 'yari'; q.width = 3; q.yariRanks = 4; q.order = 'attack'; q.seekRange = 24; };
        if (i === 0) rt.army.play('eshout', g.center(), 0.7);
        rt.say('足軽', i === 0 ? '坂から敵の鬨の声じゃ！　城兵が出てきたがや！'
          : i === 1 ? '坂に次の槍の列じゃ！　柵の口を固めよ！' : '最後の列じゃ！　味方の槍から離れるな！', 3);
        rt.marker('s' + (i + 1), centerOf(g), '打って出た城兵', { red: true, group: g });
      });
    });
    // 川岸の組は口を通って戻る。左右の柵を横切る直線の命令へ戻さない。
    F.hide.onArrive = (g) => { g.order = 'hold'; g.aggro = 12; g.retreatOnly = false; };
    rt.after(5, () => { if (F.step === 2 && !F.ending) rt.say('組頭', '鉄砲、柵まで引きつけよ。槍組は列を保て', 4); });
    volleyAt(rt, { guns: () => [F.tgun], foes: () => F.sallies.filter(g => !g.ttRetreat), who: '組頭', near: 20, drop: 0, max: 50,
      say: '放て！　槍組、持ち場を崩すな！', line: '鉄砲の煙の後ろで、槍の列を保て' });
  },

  // 十二秒ごとに既存の城兵へ下知。坂の道順を残し、柵の口の味方へ寄せる。
  pressSallies(rt) {
    const F = rt.flags;
    F.sallyPressAt = rt.t + 12;
    let pressing = false;
    for (const g of F.sallies) {
      if (!g.ttOut || g.ttRetreat || g.ttReturned || g.routed || gone(g)) continue;
      const from = g.ttPressFrom || (g.ttPressFrom = { x: 0, y: 0, z: 0 });
      from.x = g.anchor.x; from.z = g.anchor.z; from.y = rt.world.heightAt(from.x, from.z);
      if (g.order === 'path') {
        const at = Math.min(g.pathIdx, g.path.length - 1), goal = g.path[at];
        let front = false;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget &&
            Math.hypot(u.pos.x - goal[0], u.pos.z - goal[1]) < 6) { front = true; break; }
        // 先頭が折れに着いたら次へ。後列待ちで長く止めず、壁や坂は飛び越さない。
        if (!front || Math.hypot(g.anchor.x - goal[0], g.anchor.z - goal[1]) >= 3) continue;
        const next = g.path[at + 1];
        if (next) {
          const to = g.ttPressPoint || (g.ttPressPoint = { x: 0, y: 0, z: 0 });
          to.x = next[0]; to.z = next[1]; to.y = rt.world.heightAt(to.x, to.z);
          if (rt.army.wallBetween(from, -1, to) || rt.army.terrainBlocks(from, to)) continue;
          g.pathIdx = at + 1; pressing = true;
        } else if (g.onArrive) {
          const arrive = g.onArrive; g.onArrive = null; arrive(g); pressing = true;
        }
      }
      if (g.order !== 'attack') continue;
      let foe = null, distance = Infinity;
      for (const u of rt.army.units) {
        if (u.team === g.team || !u.alive || u.fleeing || u.woundOut || u.noTarget || u.campProtected ||
            Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) > 24) continue;
        const d = Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z);
        if (d < distance && !rt.army.wallBetween(from, -1, u.pos) && !rt.army.terrainBlocks(from, u.pos)) {
          foe = u; distance = d;
        }
      }
      g.focus = foe;
      if (foe) {
        g.seekRange = 24; pressing = true;
        for (const u of g.units) if (u.alive && !u.target) u.aiT = 0;
      }
    }
    if (pressing) rt.bark('次の小勢が寄せてくる。味方と槍をそろえよ');
  },

  // ③ 開城の使いを供する
  envoy(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 3; F.stepT = rt.t;
    // 停戦後に「強い突き」の札を残さず、使いへの案内へ譲る。
    rt.hintQ.length = 0;
    clearTimeout(rt.hud.hintDefer); clearTimeout(rt.hud.hintTimer);
    rt.hud.hintCur = null; rt.hud.drawCard();
    rt.unmark('return');
    rt.setPhase('envoy');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.say('使いの侍', '吉川経家殿が、城の者の助命を願われた。ここからは槍を引け', 5.5);
    // 和議の返事が届いてから停戦する。城の守りを突然消さない。
    for (const g of rt.army.groups) {
      g.order = 'hold'; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.noTarget = true; u.dmg = 0; }
    }
    applyLook(rt, DAWN);
    rt.world.lookDark = false;
    rt.after(1, () => rt.world.setTime('morning'));
    // 日送りや戦功で、経家の自害と城内の助命という史実の結末を変えない。
    F.terms = '城将自害・残る城兵助命';
    this.siegeScene(rt, '十月二十五日　開城の返答', '幾日か後。槍を収め、秀吉方の使いと木戸へ');
    rt.after(10, () => { if (F.step === 3 && !F.ending && !rt.over)
      rt.say('使いの侍', '羽柴秀吉様の返事を運ぶ。わしのそばを離れるな', 4); });
    rt.obj('main', '使いの後ろを歩き、木戸へ', 'main', true);
    rt.objProgress('main', '幾日か後の朝。開城の返事を届ける');
    battleEvent(rt, EVENT_MESSENGER, GATE, null, 0, true, '秀吉方の使いが城へ返答に向かう');
    const g = F.env;
    // 使いは斬り合いの対象外だが、護送の到着では本人と人足の歩みを待つ。
    g.arriveNoncombat = true;
    g.order = 'path'; g.path = [[GATE.x, FENCE_Z + 8], ...CASTLE_ROADS[0].slice(1), [GATE.x, GATE.z + 6]]; g.pathIdx = 0;
    F.envLengths = [0];
    for (let i = 1; i < g.path.length; i++) F.envLengths.push(F.envLengths[i - 1] + Math.hypot(g.path[i][0] - g.path[i - 1][0], g.path[i][1] - g.path[i - 1][1]));
    F.envWay = { x: 0, z: 0 }; F.envGuide = { x: 0, z: 0 }; F.envRoad = {}; F.envPlayerRoad = {};
    // 返答の日は幾日か後。使いの列が坂の上の折れまで登った所から供をする。麓の折れを歩き直させない。
    {
      const k = Math.min(5, g.path.length - 2), W = rt.world;
      // 折れの頂点から始めると、視線の先が次の道でなく山肌になる。
      // 先頭も本人も折り返した先へ置き、同じ道の進む方へ向ける。
      const start = F.envLengths[k] + Math.min(8, (F.envLengths[k + 1] - F.envLengths[k]) / 2);
      const head = escortRoadPoint(F, start, F.envWay), tx = head.x, tz = head.z;
      rt.scene.visible = false;
      let row = 0;
      for (const u of g.units) if (u.alive) {
        const at = escortRoadPoint(F, start - row++ * 1.2, F.envWay);
        u.pos.x = at.x; u.pos.z = at.z; u.pos.y = W.heightAt(at.x, at.z); u.moveTo = null;
      }
      g.anchor.x = tx; g.anchor.z = tz; g.pathIdx = k + 1;
      // 固定の斜めずらしでは折れの切岸へ出る。直前の道の中央で使いの後ろに付く。
      const behind = escortRoadPoint(F, start - 5, F.envWay);
      const P = rt.player.u, px = behind.x, pz = behind.z;
      const sx = px - P.pos.x, sz = pz - P.pos.z;
      for (const q of rt.squadGroups || []) {
        for (const u of q.units) if (u !== P && u.alive && !u.woundOut) { u.pos.x += sx; u.pos.z += sz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; }
        if (q.anchor) { q.anchor.x += sx; q.anchor.z += sz; }
      }
      P.pos.x = px; P.pos.z = pz; P.pos.y = W.heightAt(px, pz);
      // 日送りの間に遠い麓の視点を引きずらず、使いの方へ向けて始める。
      P.heading = rt.player.yaw = Math.atan2(tx - px, tz - pz);
      rt.player.pitch = -0.12; rt.player.camYawOff = 0; rt.player.camInit = false;
      rt.after(0.5, () => { rt.scene.visible = true; });
    }
    g.onArrive = () => { F.envArrived = true; g.order = 'hold'; F.gateBar.opened = true; F.gateDoor.userData.open(); };
    F.env = g;
    rt.marker('env', () => escortGuide(rt), '使いの侍に続け', {
      group: g, guideAlways: true, guidePerson: () => escortGuidePerson(rt), guideTalk: false,
      guidePersonLabel: 'この使いの後ろを歩こう',
    });
    rt.zone('gate', GATE.x, GATE.z + 6, 10);
    rt.zone('env-wait', g.anchor.x, g.anchor.z, 8);
    F.envRing = rt.rings.find((q) => q.userData.id === 'env-wait');
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 3) return;
    if (!F.defended || !F.envArrived || rt.distTo(F.env.center()) > 10 || Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z - 6) > 10) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('env'); rt.unzone('gate'); rt.unzone('env-wait');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '鳥取城の囲みを守り、開城の使いを供した', pts: 20 }; }, '鳥取城、開く');
    sfx('kane', 0.5);
    rt.banner('鳥取城、開く', '城将は自害。残る城兵と民・僧は助命');
    rt.say('伝令', '経家殿は腹を召された。残る城の者は助命にござる。木戸を空けよ', 5.5);
    // 食事の後日談は結果の史実の札に残す。開城と経家の結末はここで伝える。
    rt.player.u.invuln = true;
    rt.after(6, () => {
      if (rt.over) return;
      rt.say('語り', '年が明ければ、信忠の軍は信濃へ。次の戦は、高遠城', 4.5);
      rt.finish({ scriptedEnd: true }, 6);
    });
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && (m.group.team === 1 ? gone(m.group) : groupGone(m.group))) rt.unmark(m.id); }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    warnGuns(rt);
    warnTottoriRear(rt);
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) {
      // 定時の声も任務札と同じ指示。負傷時の案内には重ねない。
      if (F.step === 2 && (F.outsideHintT > rt.t || F.breachT > 0)) F.pressureSayAt = rt.t + 8;
      const main = rt.objectives.find((o) => o.id === 'main');
      // 舟の番は岸、城兵は柵を守る。本人を遠くまで追う下知で上書きしない。
      pressureTick(rt, F.step, [], F.step === 3 ? [F.env] : F.oda,
        main?.progress || main?.text || '柵の口で、味方と槍をそろえよ');
    }
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    // 短い待機で飢えまで治さない。既存の疲れた姿・歩みへ半秒ごとに渡す。
    if (guide) for (const g of F.sallies) for (const u of g.units) if (u.alive) u.fat = Math.max(u.fat || 0, 0.7);
    // 開戦の操作後は、合流か短い下知で舟の夜へ。立ち止まっても番兵は来る。
    // 放火・柵の守り・護送の達成は、引き続き本人の働きを待つ。
    if (F.step === 0 && rt.t - F.stepT >= 2 &&
        (rt.distTo(F.hide.center()) <= 8 || rt.t - F.stepT >= 8 && rt.distTo(F.hide.center()) <= 60)) this.dayEvent(rt, '兵糧舟の夜');
    if (F.step === 1) {
      // 一艘が燃えて三十秒（一艘も燃えなければ百秒）たっても残る舟の番が張り付いていれば、飢えた番兵は火を見て崩れ、城へ逃げる。
      // 番と味方が舟の前で押し合ったまま、八分の刻を使い切らない（10/27）。
      if ((F.burnt === 1 && rt.t - F.burntT > 30 || F.burnt === 0 && rt.t - F.stepT > 100) && !F.guardBroke && rt.distTo(F.hide.center()) <= 60) {
        F.guardBroke = true;
        for (const g of [F.guard, F.guard2]) {
          if (groupGone(g) || g.routed) continue;
          const c = g.center(), dx = CASTLE.x - c.x, dz = CASTLE.z - c.z, L = Math.hypot(dx, dz) || 1;
          g.routed = true; g.order = 'flee'; g.fleeDir = { x: dx / L, z: dz / L }; g.fleeSet = true;
          for (const u of g.units) if (u.alive) { u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; }
        }
      }
      const outside = bankNeedsReturn(rt);
      if (outside && guide && (F.bankHintAt ?? -99) + 12 <= rt.t) {
        F.bankHintAt = rt.t; F.pressureSayAt = rt.t + 12;
        rt.say('組頭', F.burnt < 2 ? '敵を追うな。岸の道から残る舟へ戻れ'
          : '二艘は燃えた。敵を追わず岸の印へ戻れ。味方と退き太鼓を待て', 4);
      }
      if (guide) {
        const boat = nextBankBoat(rt);
        const around = boat && boatApproach(rt, boat) !== boat;
        const blocked = boat && rt.army.nearestEnemy(rt.player.u, 8, (o) => bankRouteThreat(rt, o));
        // 退く案内を出す間、任務の補足だけが「舟へ進め」と残らないようにする。
        const retreat = tottoriWoundRetreatNeeded(rt) || rt.player.u.mobbed || rt.player.sta < 20 ||
          rt.t < (rt.retreatUntil || 0) || F.retreatMarked ||
          rt.player.u.hp < rt.player.u.maxHp * 0.6 && rt.player.treatmentLeft > 0 && !(rt.player.treatmentNext > rt.t);
        // 岸を外れた時は見出しでも戻す。舟の数は補足に残す。
        const main = rt.objectives.find((o) => o.id === 'main');
        if (main) {
          main.text = outside ? '岸の道へ戻れ' : F.burnt === 0 ? '味方と舟二艘を焼け' : F.burnt < 2 ? '味方と残る舟を焼け' : '岸を守れ。退き太鼓を待て';
          // 放火の案内と「番へ懸かれ」の古い合図を重ねない。
          if (retreat || outside || boat || F.burnt >= 2) main.cue = '';
        }
        rt.objProgress('main', retreat ? `焼いた舟 ${F.burnt}／2。味方の後ろで身を守れ`
          : outside ? beyondBankFence(p.x, p.z) ? `焼いた舟 ${F.burnt}／2。柵の切れ目から岸へ` : `焼いた舟 ${F.burnt}／2。岸の道を通って舟へ`
          : blocked ? `焼いた舟 ${F.burnt}／2。敵と間をあけてから岸道へ`
          : boat ? around ? `焼いた舟 ${F.burnt}／2。岸の印をたどって舟へ`
            : rt.distTo(boat) > 4 ? `焼いた舟 ${F.burnt}／2。舟へ進め`
            : `焼いた舟 ${F.burnt}／2。放火の札を長押し`
            : F.burnt < 2 ? `焼いた舟 ${F.burnt}／2。味方と番を退けよ`
              : '二艘は燃えた。味方の列で岸を守れ');
      }
      // 二艘を焼いた瞬間に帰還へ。残る番兵を追う待ち時間は置かない。
      if (F.burnt >= 2) this.midA(rt);
    }
    if (F.step === 1.5) {
      const d = Math.hypot(p.x - 10, p.z - FENCE_Z - 8);
      if (guide) {
        const at = returnWay(rt);
        rt.objProgress('main', `次の岸の印まで ${Math.ceil(Math.hypot(p.x - at.x, p.z - at.z) / 0.75)}歩。柵へ戻れ`);
      }
      if (F.sortieReady && d <= 16) this.sortie(rt);
    }
    if (F.step === 2) {
      const L = F.sallies;
      if (guide) holdTottoriSallies(rt);
      if (rt.t >= F.sallyPressAt) this.pressSallies(rt);
      if (guide) {
        let returning = 0, returned = 0, engaged = 0, advancing = 0, waiting = 0;
        for (const g of L) {
          if (gone(g) || g.ttReturned) returned++;
          else if (g.ttRetreat) returning++;
          else { advancing++; if (!g.ttOut) waiting++; if (g.ttContactT != null) engaged++; }
        }
        const main = rt.objectives.find((o) => o.id === 'main');
        if (main) {
          main.text = !advancing ? '追わず、柵の口を守れ' : HI(rt) ? '一手を率い、柵で城兵を止めよ' : '柵の口で城兵を止めよ';
          if (!advancing) main.cue = '';
        }
        // 守った刻を数える範囲と同じ中心で案内する。
        const away = Math.hypot(p.x - GATE.x, p.z - FENCE_Z);
        rt.objProgress('main', away > 24 ? `敵を追わず、柵の口へ戻れ。あと ${Math.round(away)}歩`
          : p.z < FENCE_Z ? '柵の口を通って味方へ戻れ'
          : F.outsideHintT > rt.t ? '敵を向いて構え、柵の口の味方へ退け'
            : returned === L.length ? '城兵は退いた。柵の口へ戻れ'
              : returning && !advancing ? '城兵が城道を退いている。追わず柵を守れ'
                : engaged ? '寄せている城兵 ' + (advancing - waiting) + '組。' + (waiting ? '坂にも控えがいる' : '味方と柵を守れ')
                  : '坂から城兵が来る。味方と柵を守れ');
      }
      let inside = 0, nearEnemy = false, contact = false;
      for (const g of L) {
        let fighting = 0;
        // 手当てへ退く兵は寄せ・突破・接触に数えない。退避先を守り場へ上書きもしない。
        // 回復して戻った兵は次の更新から再び数え、隊が消えた扱いにはしない。
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget) {
          fighting++;
          // 守りの参加は一度、退避の案内は半秒ごと。毎コマ同じ柵の当たりを調べない。
          if ((!F.defended || guide) && g.ttOut && !g.ttRetreat && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 18 &&
              !rt.army.wallBetween(u.pos, -1, p)) {
            F.defended = true; if (guide) nearEnemy = true;
            // 山道の控えの声は届けない。二列目が本人の近くで交戦してから聞かせる。
            if (guide && g === L[1] && !F.enemyCall) {
              F.enemyCall = true;
              rt.say('城兵の組頭', '経家様の城へ、米の道を開け！', 3);
            }
          }
          if (g.ttOut && !g.ttRetreat && u.pos.z > FENCE_Z + 22) inside++;
          // 先頭が柵へ寄せてから戦う刻を数える。行軍だけで寄せを終わらせない。
          if (g.ttOut && !g.ttRetreat && g.ttContactT == null && tottoriSallyContact(rt, u)) g.ttContactT = rt.t;
          if (g.ttOut && !g.ttRetreat && g.ttContactT != null && Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) < 24) contact = true;
        }
        g.ttFighting = fighting;
      }
      // 破られた判定と同じ四人を基準にする。一人が踏み込むたびに守った刻を消さない。
      // 本人が持ち場を離れた時と、まとまった城兵が柵を抜けた時は数え直す。
      if (inside >= 4 || p.z < FENCE_Z || Math.hypot(p.x - GATE.x, p.z - FENCE_Z) >= 24) F.holdT = 0;
      else if (contact) F.holdT += dt;
      for (const g of L) {
        // 四〜七分の戦を目安に、三組が口で戦う刻を確保する。兵数と列の密度は保つ。
        // 討ち減らすだけでなく、本人が口を守り続けても飢えた寄せは退く。
        // 接触前の行軍や、持ち場を離れた待機では進めない。帰路も同じ城道を使う。
        if (F.defended && g.ttOut && !g.ttRetreat && !g.routed && g.ttContactT != null &&
            ((g.ttFighting <= g.initial * 0.75 && rt.t - g.ttContactT > 45) ||
              (F.holdT >= 55 && rt.t - g.ttContactT > 70) || rt.t - g.ttContactT > 90 ||
              F.firstRetreatT != null && rt.t - F.firstRetreatT > 30 && rt.t - g.ttContactT > 20)) {   // 舟に手間取っても八分の内に使いまで進める。一組が退けば残りも後を追う（10/27 縮め）
          if (F.firstRetreatT == null) F.firstRetreatT = rt.t;
          g.ttRetreat = true; g.formation = 'column'; g.march = false; g.marching = false; g.focus = null;
          // 退却中の近接戦で足を止めず、同じ城道を歩いて木戸へ戻す。
          g.retreatOnly = true;
          // 遅れた兵も折れ道を戻る。隊列へ直進して切岸で止まり、護送を始められなくしない。
          g.followColumnRoad = true;
          for (const u of g.units) { u.target = null; u.atk = null; u.watch = null; }
          g.order = 'path'; g.path = g.ttIngress.slice().reverse(); g.pathIdx = 1;
          // 接触した位置から城側の折れへ戻る。毎回柵前の終点まで歩き直させない。
          // 隊の位置は動かさず、いまいる道の区間から逆順にたどる。
          let nearest = Infinity;
          for (let i = 1; i < g.path.length; i++) {
            const a = g.path[i - 1], b = g.path[i], dx = b[0] - a[0], dz = b[1] - a[1];
            const k = Math.max(0, Math.min(1, ((g.anchor.x - a[0]) * dx + (g.anchor.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
            const d = (g.anchor.x - a[0] - dx * k) ** 2 + (g.anchor.z - a[1] - dz * k) ** 2;
            if (d <= nearest) { nearest = d; g.pathIdx = i; }
          }
          g.onArrive = (q) => { q.ttReturned = true; q.order = 'hold'; q.march = false; q.aggro = 5; q.onArrive = null; };
          if (!F.withdrawSaid) {
            F.withdrawSaid = true;
            rt.say('組頭', '口を守り抜いたぞ！　退く者を追わず、味方の列を保て', 4);
          }
        }
      }
      if (guide && nearEnemy && (p.z < FENCE_Z || rt.player.u.hp < rt.player.u.maxHp * 0.55) && !(F.outsideHintT > rt.t)) {
        F.outsideHintT = rt.t + 30;
        const hint = '敵を向いて構え、柵の口の味方へ退け';
        rt.objProgress('main', hint);
        rt.say('組頭', hint, 4);
        F.pressureSayAt = rt.t + 30;
      }
      F.breachT = inside >= 4 ? (F.breachT || 0) + dt : 0;
      if (F.breachT > 0 && !(F.breachWarnAt > rt.t)) {
        F.breachWarnAt = rt.t + 12; rt.bark('城兵が柵の内へ入った！　口へ戻って押し返せ');
      }
      // 一組が退いて四十秒たてば、坂で寄せきれない残りの組も城へ退く（坂で止まった組を待って時間切れにしない）。
      if (F.firstRetreatT != null && rt.t - F.firstRetreatT > 40 && !F.salliesBroke) {
        F.salliesBroke = true;
        for (const g of L) {
          if (groupGone(g) || g.routed || g.ttRetreat || g.ttReturned) continue;
          const c = g.center(), dx = CASTLE.x - c.x, dz = CASTLE.z - c.z, D = Math.hypot(dx, dz) || 1;
          g.routed = true; g.order = 'flee'; g.fleeDir = { x: dx / D, z: dz / D }; g.fleeSet = true;
          for (const u of g.units) if (u.alive) { u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; }
        }
      }
      if (guide && F.breachT > 0) rt.objProgress('main', '柵の内の敵を押し返せ');
      if (F.breachT >= 8 && rt.canFailMission()) { this.lose(rt); return; }
      // 味方や遠くからの攻撃で全て退けた時も、本人が柵の内へ戻れば守りを果たす。
      // 接近した相手がもういないため、十八歩以内の遭遇だけを待つと開城へ進めない。
      // 未出撃の控えや戦える寄せが残る間は、これまでどおり迎え撃つ。
      if (!F.defended && p.z >= FENCE_Z && atTottoriPost(p) &&
          L.every((g) => g.ttOut && gone(g))) F.defended = true;
      // 退く者のうち、まだ戦える兵が全員持ち場から離れれば次へ。
      // 深手で残った者まで含む隊の中心を待つと、守り終えても時間切れになる。
      if (F.defended && Math.hypot(p.x - GATE.x, p.z - FENCE_Z) < 24 &&
          L.every((g) => gone(g) || g.routed || g.ttOut && (g.ttReturned ||
            g.ttRetreat && g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.rearWound || u.noTarget ||
              u.pos.z < FENCE_Z - 16 && Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) > 26)))) this.midB(rt);
    }
    if (F.step === 2.5 && rt.t - F.stepT >= 6) this.envoy(rt);
    if (F.step === 3 && F.env) {
      const c = F.env.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 14 && F.env.order === 'path') {
        F.env.order = 'hold'; F.env.anchor.x = c.x; F.env.anchor.z = c.z;
        if ((F.envHintAt ?? -99) + 8 <= rt.t) {
          F.envHintAt = rt.t;
          rt.say('使いの侍', '離れたので待つぞ。わしのそばへ戻れ', 4);
        }
      }
      else if (!F.envArrived && d < 8 && F.env.order === 'hold') F.env.order = 'path';
      if (F.envRing) {
        F.envRing.visible = !F.envArrived && F.env.order === 'hold';
        if (F.envRing.visible) rt.drapeRing(F.envRing, c.x, c.z);
      }
      if (guide) {
        const a = F.env.arrivalStatus;
        const arrival = a && a.arrived < a.needed ? '。供の者を待て' : '';
        const road = escortRoadPosition(F, p, F.envPlayerRoad);
        const left = Math.ceil((road.gap + Math.max(0, F.envLengths[F.envLengths.length - 1] - road.distance)) / 0.75);
        rt.objProgress('main', F.envArrived ? '使いは着いた。木戸の輪へ'
          : F.env.order === 'hold' ? '使いは待っている。輪の中へ戻れ'
            : `使いの後ろを歩け。木戸まで ${left}歩${arrival}`);
      }
      if (F.envArrived && d <= 10) this.win(rt);
    }
  },

  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('return'); rt.unzone('env-wait'); rt.unzone('gate');
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight'); rt.unmark('bank-approach'); rt.unmark('env');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    for (const b of F.boats) { rt.unmark('b' + b.i); rt.uninteract('b' + b.i); }
    rt.objProgress('main', '');
    rt.banner(F.step < 2 ? '米舟を止められなかった' : '持ち場を破られた',
      F.step < 2 ? '岸の組は後ろへ退く。舟を焼く役目は果たせなかった' : '城兵が柵の内へ入り、組は後ろの陣へ退く');
    rt.player.u.invuln = true;
    rt.finish({}, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    // 城兵は北へ直進すると九十九折りを外れて山肌へ詰まる。崩れた場所から城道へ戻す。
    // 道と兵ごとの曲がり角は、隊が崩れた時に一度だけ決める。
    if (g.ttIngress) {
      g.fleePath = g.ttIngress.slice(0, -1).reverse();
      for (const u of g.units) {
        if (!u.alive) continue;
        let nearest = Infinity, at = 0;
        for (let i = 0; i < g.fleePath.length; i++) {
          const p = g.fleePath[i], d = (u.pos.x - p[0]) ** 2 + (u.pos.z - p[1]) ** 2;
          if (d < nearest) { nearest = d; at = i; }
        }
        u.fleePathIdx = at;
      }
    }
    if (g.team !== 1 || g.civ || rt.t - (rt.flags.routSaidT ?? -99) < 30) return;
    rt.flags.routSaidT = rt.t;
    const c = g.center();
    if (Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) < 35) rt.say('足軽', '敵が引くぞ。柵へ戻れ！', 2.5);
  },
};

// 両軍の総勢（羽柴勢 二万余り、鳥取城の兵 千四百ほどと城に逃げ込んだ人々。数には諸説ある）
tottori.force = () => ({ a: 20000, a0: 20000, b: 1400, b0: 1400 });
tottori.sides = { a: { name: '羽柴軍', mon: 'oda' }, b: { name: '吉川軍', mon: 'mori' } };
// 名将を無名の前線隊へ自動追加しない。経家と秀吉は各本陣に一人ずつ。
tottori.date = (rt) => rt.flags.step >= 3 ? '天正九年十月二十五日　冬・開城' : '天正九年十月　冬・夜';
tottori.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tottori.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  rt.flags.day = 6;
  tottori.boats(rt);
};
tottori.history = '天正九年（1581）、中国攻めを進める羽柴秀吉は、因幡の鳥取城を囲んだ。秀吉は城のまわりに付城と柵を築き、陸と海の兵糧の道を断った（鳥取の渇え殺し）。毛利方は船で兵糧を運び込もうとしたが、秀吉方に阻まれた。城を守る吉川経家は四か月ほど耐えたが、城の中は飢えに苦しみ、十月二十五日、経家ら城将の自害と引き換えに、残る城兵や籠城した人々の助命が認められ、城は開かれた。城から出た者の多くが、与えられた食べ物を急に食べて命を落としたとも伝わる。兵の数には諸説ある。 戦う城兵は千四百ほど、避難した人々は別に数える。川岸の放火、城兵の出撃と使いの護送、各備えの人数と細かな位置、夜明けの時刻と天気は史料で確定できず、包囲の持ち場を表す復元。北の丸山城・雁金山城と長い囲みの全域、山と川の距離は縮めている。付城の輪と小屋・陣幕、仕寄り道、竹束・土俵・虎落と築山の細かな配置は、当時の攻城の備えを表す復元。';

// 素直な遊び手：舟の番と戦い、舟に火をかけ、打って出た城兵を止め、使いのそばを歩く
tottori.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 一歩で止まらず、下知の条件である川岸の組との合流まで歩く。
  if (F.step === 0) {
    inp.guardHold = false;
    const c = F.hide.center();
    goTo(p, inp, c.x, c.z, 6);
    if (!F.playerReady) inp.k.add('KeyW');
    return;
  }
  // 帰還中は近い敵を追わず、岸から柵の開いた口へ。川の中で斬り合いを続けない。
  if (F.step === 1.5 || F.step === 2 && Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z - 8) > 24) {
    if (p.lock) inp.e.add('KeyQ');
    const at = F.step === 1.5 ? returnWay(b) : F.returnPoint;
    if (F.step === 2) { at.x = GATE.x; at.z = Math.abs(u.pos.x - GATE.x) > 6 || u.pos.z < FENCE_Z - 11 ? FENCE_Z - 8 : FENCE_Z + 8; }
    goTo(p, inp, at.x, at.z, 1.5);
    inp.guardHold = !!b.army.nearestEnemy(u, 4);
    return;
  }
  // 深手の退避と手当ては共通の頭に任せる。自然回復を待って任務を止めない。
  if (F.step === 1 && bankNeedsReturn(b)) {
    if (p.lock) inp.e.add('KeyQ');
    // 近い番兵がいる時だけ構え、真横の岸へ上がる。柵の川側にいる時は、柵の切れ目を回る。
    const at = bankEntry(b);
    goTo(p, inp, at.x, at.z, 0.8);
    inp.guardHold = !!b.army.nearestEnemy(u, 4);
    return;
  }
  // 印へ着いて長押しを始めたら、近くの番兵の構えだけで中断しない。
  // 実際の被弾・押し出しによる中断は共通の操作に任せる。
  const fireBoat = F.step === 1 ? nextBankBoat(b) : null;
  let approachEnemy = null;
  if (fireBoat) {
    const at = boatApproach(b, fireBoat);
    if (at !== fireBoat) {
      if (p.lock) inp.e.add('KeyQ');
      inp.leftPressed = false; inp.chargeHold = false;
      approachEnemy = b.army.nearestEnemy(u, 8, (o) =>
        (o.group === F.guard || o.group === F.guard2) && atBank(o.pos.x, o.pos.z) && bankRouteThreat(b, o));
      // 道を塞ぐ相手の前で、構えたまま同じ印へ歩き続けない。
      // 近くで塞がれた時だけ下の応戦へ渡し、離れた敵は追わない。
      if (!approachEnemy) {
        goTo(p, inp, at.x, at.z, 1.2);
        inp.guardHold = false;
        return;
      }
    }
  }
  if (fireBoat && Math.hypot(fireBoat.x - u.pos.x, fireBoat.z - u.pos.z) <= 2.2) {
    if (p.lock) inp.e.add('KeyQ');
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    inp.k.add('KeyE');
    return;
  }
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 手元へ届いた敵には先に応戦する。柵越しの槍と、構えを解く間の同じ相手を保つ。
  // 山道の控えや帰路の隊へは、遠くから追いかけない。
  let attacker = null, attackDist = 10, attackTime = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        F.step === 1 && (!atBank(o.pos.x, o.pos.z) || !bankRouteThreat(b, o)) ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 遠い控えの柵を毎コマ調べない。受ける相手は十歩以内だけ。
    if (d >= 10 || b.army.wallBetween(u.pos, -1, o.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    // 近い敵の振りかぶりより、既に振り出した槍を先に受ける。
    const hitTime = o.swing && !o.swing.done ? 0 : o.charging ? d / Math.max(1, o.speed) : o.atk?.t ?? Infinity;
    if (d < 10 && (hitTime < attackTime || (hitTime === attackTime && d < attackDist))) {
      attacker = o; attackDist = d; attackTime = hitTime;
    }
  }
  // 舟の印へ進める隙は放火を優先。十歩先の敵を選び直して、岸を往復し続けない。
  // 手元への打ち込みだけは先に受ける。放火そのものは本人の長押しを待つ。
  if (F.step === 1 && !approachEnemy && !(attacker && attackDist < reach + 1 && attackTime < 1.2)) {
    const boat = nextBankBoat(b);
    // 番兵が舟に張り付いて火をかけられない時は、舟のそばの番兵へ懸かる（人も同じく番を退けてから火をかける）。
    // 十歩手前で待ち続けて、八分の刻を使い切らない。
    // 行く手の舟のそば（七歩）にいる番兵が十二歩以内なら先に懸かる。遠回りの道を塞ぐもう一艘の番も同じ。
    const boatGuard = boat && Math.hypot(boat.x - u.pos.x, boat.z - u.pos.z) > 2.2 ?
      b.army.nearestEnemy(u, 12, (o) => o.team !== u.team && !o.fleeing && !o.woundOut &&
        !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 &&
        F.boats.some((q) => !q.burnt && Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 7)) : null;
    if (boatGuard) approachEnemy = boatGuard;
    else if (boat) {
      if (p.lock) inp.e.add('KeyQ');
      inp.guardHold = false;
      const d = Math.hypot(boat.x - u.pos.x, boat.z - u.pos.z);
      // 三歩以内で放火できる。船べりや兵に押されても、印へ密着するまで歩き続けない。
      if (d > 2.2) goTo(p, inp, boat.x, boat.z, 2);
      else inp.k.add('KeyE');
      return;
    }
  }
  const close = strikeTarget(b, reach);
  // 正面だけ受けられるので、別の敵への反撃より実際の打ち手へ向き直る。
  const e = attacker || approachEnemy || (close && !close.fleeing && !close.woundOut && !close.noTarget && !close.invuln &&
    (F.step !== 1 || (close.group === F.guard || close.group === F.guard2) && atBank(close.pos.x, close.pos.z)) &&
    (F.step !== 2 || (close.group?.ttOut && !close.group.ttRetreat)) &&
    (!close.group?.ttRetreat || close.target === u) ? close : null) ||
    b.army.nearestEnemy(u, F.step === 1 && nextBankBoat(b) ? 5 : 12, (o) => !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln &&
    (F.step !== 1 || (o.group === F.guard || o.group === F.guard2) && atBank(o.pos.x, o.pos.z)) &&
    (F.step !== 2 || (o.group?.ttOut && !o.group.ttRetreat && o.pos.z >= FENCE_Z)) &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e && F.step < 3) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85 || (F.step === 2 && u.pos.z < FENCE_Z + 2)) {
      // 柵の守りでは城兵へ突進せず、味方の列がある口の内側までに留める。
      // 歩く向きと受ける向きを分け、戻る間も実際の打ち手へ構える。
      goTo(p, inp, F.step === 2 ? Math.max(GATE.x - 4, Math.min(GATE.x + 4, e.pos.x)) : e.pos.x,
        F.step === 2 ? Math.max(FENCE_Z + 4, Math.min(FENCE_Z + 14, e.pos.z)) : e.pos.z, F.step === 2 ? 1 : reach * 0.85);
      if (F.step === 2) {
        const walkYaw = p.yaw;
        p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
        if (inp.k.has('KeyW')) {
          const da = walkYaw - p.yaw;
          inp.k.delete('KeyW');
          if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
          if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
        }
      }
    }
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    const boat = nextBankBoat(b);
    if (boat) {
      const d = Math.hypot(boat.x - u.pos.x, boat.z - u.pos.z);
      // 火をかける札の内側に余白を残し、岸で立ち止まって長押しする。
      if (d > 2.2) goTo(p, inp, boat.x, boat.z, 2);
      else inp.k.add('KeyE');
      return;
    }
    // 隊の中心には、逃げた兵や深手の兵も含まれる。まだ戦える番兵へ寄る。
    // 番兵のいない中心で立ち止まり、放火にも進めなくなるのを防ぐ。
    let guard = null, gd = Infinity;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? F.guard : F.guard2;
      if (gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.invuln || !atBank(o.pos.x, o.pos.z)) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < gd) { guard = o; gd = d; }
      }
    }
    if (guard) { goTo(p, inp, guard.pos.x, guard.pos.z, 2); return; }
    const it = b.interacts.find((q) => q.id.startsWith('b'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1) goTo(p, inp, it.pos.x, it.pos.z, 0.8); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 1.5) { goTo(p, inp, 10, FENCE_Z + 8, 3); return; }
  // 山道にいる控えの横位置を追わず、城兵が出てくる柵の口で迎える。
  if (F.step === 2) { goTo(p, inp, GATE.x, FENCE_Z + 4, 2); return; }
  if (F.step === 3 && F.env) {
    const at = escortWay(b);
    // 鋭い折り返しでも、手前で到着した扱いにして足を止めない。
    goTo(p, inp, at.x, at.z, 0.1);
  }
};

export { tottori };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 10, z: -150, tx: 10, tz: -110, w: 40, R: 120, rise: 110 };

const BENCH_SEGMENTS = LOCAL_PATHS.flatMap(pts => pts.slice(1).map((b, i) => {
  const a = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
  return { x: a[0], z: a[1], dx, dz, l2: dx * dx + dz * dz || 1,
    x0: Math.min(a[0], b[0]) - 4.4, x1: Math.max(a[0], b[0]) + 4.4,
    z0: Math.min(a[1], b[1]) - 4.4, z1: Math.max(a[1], b[1]) + 4.4 };
}));
function benchedHeight(x, z) {
  const h = gradedCastleHeight(x, z);
  // 実測の土橋と土塁は高さの関数で完成している。幅8.8mの共通の道ならしを重ねない。
  const lx = x - TAIKO.x, lz = z - TAIKO.z;
  if (Math.min(Math.max(Math.abs(lx) - TX, Math.abs(lz) - TZ),
    Math.max(Math.abs(lx - (TX - 8)) - 8, Math.abs(lz - (TZ + 15.5)) - 15.5)) < TAIKO.bankW + TAIKO.moatW) return h;
  let best = 4.4, bx = 0, bz = 0;
  for (const s of BENCH_SEGMENTS) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.l2));
    const xx = s.x + s.dx * t, zz = s.z + s.dz * t, d = Math.hypot(x - xx, z - zz);
    if (d < best) { best = d; bx = xx; bz = zz; }
  }
  return best < 4.4 ? h + (gradedCastleHeight(bx, bz) - h) * trap(best, 4.4, 1.8) : h;
}
function height(x, z) {
  let h = roadDistance(x, z, CASTLE_ROADS) < 2.6 ? gradedCastleHeight(x, z) : benchedHeight(x, z);
  // 地形の一升は約3.5m。建物だけの小さな平場では補間した地面が床を突き抜ける。
  // 戸口・外階段の下と梯子の手前まで、一升ぶん余裕のある同じ高さの平場にする。
  for (const b of BUILDING_PADS) {
    // 床の平場は保ち、外側十二歩で山へ戻す。四歩幅の高い柱を作らない。
    const k = trap(Math.max(Math.abs(x - b.x) - b.hw, Math.abs(z - b.z) - b.hd), 12, 12);
    if (k) h += (b.y - h) * k;
  }
  // 城道のならしが川岸を再び持ち上げないよう、最後に舟と岸道をつなぐ。
  // 東端は城道の折れ（x -22）より手前で元へ戻す。木戸・曲輪の高さは保つ。
  const bankRoad = trap(x + 34, 12, 12) * trap(-72 - x, 8, 8)
    * Math.min(trap(-66 - z, 12, 12), trap(z - 22, 12, 12));
  h += (0.6 + z * 0.001 - h) * bankRoad;
  // 柵・味方の列・戻りの印を同じ低い平場に載せる。山の木戸までは城道を登る。
  // 平場の広さと東西・南側の三十二歩の斜面を保ち、北の山裾は四十歩でつなぐ。
  // 各方向の弱い方を使い、角でも元の斜面の形を保つ。柵の前を巨大な土の壁にしない。
  const bankZ = z < 6 ? trap(6 - z, 40, 40) : trap(z - 50, 32, 32);
  const bank = Math.min(trap(Math.abs(x - 10) - 64, 32, 32), bankZ);
  h += (1.8 - h) * bank;
  // 持ち場の前（西）の岸を川へゆるく下げ、平場の縁で千代川の水面と舟が隠れないようにする。
  // 平場のならしで干上がっていた川床も下げ、持ち場の正面に水を張る。
  const lipX = Math.max(0, Math.min(1, (-42 - x) / 18, (x + 92) / 14));
  const lip = lipX * lipX * (3 - 2 * lipX) * trap(Math.abs(z - 5), 43, 18) * bank;
  h -= 1.6 * lip;
  // 栗谷側の番所は岸と同じ低い曲輪。低地のならしを重ねた後にも平場を
  // 保ち、床を支える地面を坂へ引き下げない。外周は八歩の斜面で戻す。
  const fortPad = trap(seatEdge(BANK_FORT, x, z), 12, 8);
  h += (BANK_FORT.y - h) * fortPad;
  const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
  const shore = trap(Math.abs(Math.abs(x - rx) - 20), 7, 4);
  if (shore && z > -100 && z < 90 && roadDistance(x, z) > 4.5) {
    h += shore * (0.22 + 0.16 * Math.sin(z * 0.43) * Math.cos(x * 0.61));
  }
  h += SHIYORI_CUT(x, z);
  // 山裾や建物の平場で城道まで押し下げると、折れの途中が崖になる。
  // 最後に道幅をならす。麓の二折れは柵と同じ平場、そこから木戸へ登る。
  let influence = 0, weights = 0, floors = 0;
  for (const r of CLIMB_GRADES) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    const k = trap(d, 20, 16.8);
    if (!k) continue;
    // 隣の折れへ最寄りが替わる境でも高さを飛ばさない。
    // 道の中心は保つ。外の肩を十六歩余りでつなぎ、八乗の重みで
    // 隣の道へ急に切り替わる細長い壁を作らない。
    const distance = 0.25 + d * d, weight = k / (distance * distance);
    floors += weight * castleRoadGrade(r, i, t);
    weights += weight; influence = Math.max(influence, k);
  }
  // 岸道をならした後に城道の肩を重ねると、舟へ回る東の道（x -36）が
  // 二十歩以上の山腹へ戻ってしまう。岸道の内側では低い足場を保ち、
  // 東端の城道（x -22）まで既存のなだらかな重みでつなぐ。
  return weights ? h + (floors / weights - h) * influence * (1 - bankRoad) : h;
}

// 曲輪の中と戸口の道から木を除く。土塁の見た目と当たりは同じ区画で作る。
function castleClear(x, z) {
  for (const k of SEATS) if (Math.abs(x - k.x) < k.w + 4 && Math.abs(z - k.z) < k.d + 4) return true;
  return roadDistance(x, z) < 4.5;
}
const BUILDING_PADS = [
  { x: PEOPLE_TEMPLE.x, z: PEOPLE_TEMPLE.z, hw: 10, hd: 8, y: heightRaw(PEOPLE_TEMPLE.x, PEOPLE_TEMPLE.z) },
  ...SIEGE_FORTS.map(([x, z]) => ({ x, z, hw: 6, hd: 6, y: heightRaw(x, z) })),
  ...TOTTORI_HOUSES.map(b => ({ x: b.x, z: b.z + 2, hw: b.w / 2 + 4, hd: b.d / 2 + 6,
    y: SEATS.find(k => k.id === b.seat)?.y ?? 125 })),
  ...SEATS.map(k => ({ x: k.x + k.w - 4, z: k.z + k.d - 3, hw: 5, hd: 7, y: k.y })),
  ...TAIKO_LOOKOUTS.map(k => ({ x: k.x, z: k.z, hw: k.w / 2, hd: k.d / 2, y: 125 + k.innerH })),
];
const CLIMB_GRADES = CASTLE_ROADS.map((pts, i) => {
  const lengths = [0];
  for (let j = 1; j < pts.length; j++) lengths.push(lengths[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  return { pts, lengths, total: lengths[lengths.length - 1], start: i ? 0 : lengths[2], low: i ? 104 : 1.8, high: i ? 140 : 104 };
});
function castleRoadGrade(r, i, t) {
  const a = Math.max(0, r.lengths[i - 1] - r.start), b = Math.max(0, r.lengths[i] - r.start);
  const length = r.lengths[i] - r.lengths[i - 1], landing = Math.min(6, length * 0.2);
  // 折り返しは水平な踊り場。内側で隣の道を拾っても、足元の高さを飛ばさない。
  const along = Math.max(0, Math.min(1, (t * length - landing) / (length - landing * 2)));
  return r.low + (r.high - r.low) * (a + (b - a) * along) / (r.total - r.start);
}
function gradedCastleHeight(x, z) {
  // 道の平らな幅は保ち、外の山肌へ二十七歩余りかけて戻す。
  // 百歩高い城道の肩を広げ、川から見える細長い壁を和らげる。
  let h = heightRaw(x, z), influence = 0, weights = 0, floors = 0;
  for (const r of CLIMB_GRADES) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
    const k = trap(d, 30, 27.4);
    if (!k) continue;
    // 最寄りの折れだけを選ぶと、二本の道の中間で高さが飛び、長い壁になる。
    // 近い道を強く残しつつ、隣の折れとの間も連続する山肌にする。
    const distance = 1 + d * d;
    const weight = k * k * k * k / (distance * distance);
    floors += weight * castleRoadGrade(r, i, t);
    weights += weight; influence = Math.max(influence, k);
  }
  // 木戸の下にも短い平場を残し、二本の登り道を同じ高さでつなぐ。
  if (weights) h += (floors / weights - h) * influence;
  const gatePad = trap(Math.max(Math.abs(x - GATE.x) - 6, Math.abs(z - GATE.z) - 3), 24, 24);
  return h + (104 - h) * gatePad;
}
function buildTottoriCastles(rt, noT) {
  const W = rt.world, batch = makeSimpleBatch();
  // 遠い曲輪も柵・板葺き小屋を材質ごとにまとめる。実兵は追加しない。
  for (const k of SEATS) {
    const x0 = k.x - k.w, x1 = k.x + k.w, z0 = k.z - k.d, z1 = k.z + k.d;
    const outline = seatOutline(k);
    for (let edge = 1; edge < outline.length; edge++) {
      const [ax, az] = outline[edge - 1], [bx, bz] = outline[edge];
      // 上の曲輪は板塀、斜面を見下ろす南側と小さな付城は透ける柵。
      const board = true && ['sanjo', 'kido', 'maruyama'].includes(k.id) && (az + bz) / 2 < k.z + k.d - 1;
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        // 門の柱と同じ幅だけ空け、道が斜めに横切る口も塞がない。
        if (roadDistance(mx, mz) < 5) continue;
        noT(wallLine(rt, [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]],
          { team: k.team, hp: 1e9, name: board ? '板塀' : '柵', ...(board ? { mesh: tottoriBoardFence, h: 2.4 } : {}), meshOpt: { batch, ...(board ? { h: 2.4 } : {}) } }));
      }
    }
    if (['sanjo', 'obi', 'east'].includes(k.id)) {
      const mouths = [];
      for (const path of [...CASTLE_ROADS, ...RIDGE_PATHS]) for (let j = 1; j < path.length; j++) {
        const a = path[j - 1], b = path[j], dx = b[0] - a[0], dz = b[1] - a[1];
        for (const [axis, edge] of [[0, x0], [0, x1], [1, z0], [1, z1]]) {
          const span = b[axis] - a[axis]; if (!span) continue;
          const t = (edge - a[axis]) / span; if (t < 0 || t > 1) continue;
          const x = a[0] + dx * t, z = a[1] + dz * t;
          if (x < x0 + 2 || x > x1 - 2) { if (axis !== 0 || z < z0 + 2 || z > z1 - 2) continue; }
          if (z < z0 || z > z1 || mouths.some(p => Math.hypot(p[0] - x, p[1] - z) < 8)) continue;
          mouths.push([x, z]); rt.scene.add(kabukimon(W, x, z, 7, Math.atan2(dx, dz), { doors: false }));
        }
      }
    }
    if (!['sanjo', 'obi', 'kido', 'east'].includes(k.id)) rt.scene.add(kabukimon(W, k.x, z1, 7, 0, { doors: false }));
    // 東の長屋の外階段へ櫓の根石を重ねない。
    const lx = x1 - 4, lz = k.id === 'east' ? z0 + 3 : z1 - 5;
    // 主曲輪の高井楼に対し、狭い帯曲輪と小さな付城は低い物見にする。
    // 高さは外形・梯子・登れる床へ同じ値を渡す。二種類に絞り、遠景の形も共用する。
    const lookoutHeight = ['sanjo', 'maruyama', 'hidenaga'].includes(k.id) ? 8.8 : 6.4;
    rt.scene.add(tottoriLookout(W, lx, lz, k.team, k.id === 'sanjo', lookoutHeight));
    if (true) {
      // 旗を全曲輪の同じ隅へ一本ずつ立てず、大きな曲輪では尾根の両端へ分ける。
      // 南西の既存の旗は残し、北西は屋敷と道のない縁だけを使う。
      const flags = [[x0 + 3, z1 - 3, 5.5]];
      if (['sanjo', 'maruyama', 'hidenaga'].includes(k.id)) flags.push([x0 + 3, z0 + 3, 4.6]);
      for (const [x, z, h] of flags) {
        if (roadDistance(x, z) < 2.6) continue;
        rt.scene.add(nobori(W, x, z, k.team ? 'mori' : 'oda', h));
      }
    }
    // 梯子の足と曲輪内の道をつなぐ（床・梯子の当たりは共通室内）。
    if (!['obi', 'kido', 'east'].includes(k.id)) hut(W, x1 - 5, z0 + 4, 5, 3, 0, { ita: true, minka: false, batch });
  }
  for (const b of TOTTORI_HOUSES) {
    const k = SEATS.find(k => k.id === b.seat);
    // 写真の曲輪ごとの屋敷は用途で作り分ける。全棟を白い障子と入母屋にしない。
    // 既存の板葺き・板戸・連子窓を使い、材質別に結合する。床と戸口の寸法は保つ。
    const high = true, plain = !b.residence && b.kind !== 'shrine';
    goten(rt, b.x, b.z, { w: b.w, d: b.d, doorX: 0, team: k?.team ?? 0, tile: false,
      naka: true, noTarget: true,
      // 番所・長屋・空蔵は灰茶の重ね板葺きと縦板の妻壁。主殿と小祠は従来の葺き方。
      // 既存の部品の指定だけを変え、床・戸口・押さえ桟と重石の高さを保つ。
      ...(high ? { earth: b.kind === 'kura' ? 0xb8a88a : 0xc7b899, fieldFort: plain,
        weatheredBoards: plain, boardRoofColors: [0x79705e, 0x696354, 0x897960, 0x726655],
        boardRoof: !b.residence } : {}),
      eave: .65, eaveThickness: .08, kind: b.kind || 'house', profile: 'tottori', name: b.name });
  }
  if (true) {
    tottoriOutbuildings(W, batch);
    tottoriRoofWeights(rt);
    tottoriLeanTo(rt);
    tottoriResidenceFence(rt, noT, batch);
  }
  // 木戸の脇は閉門の幅を残し、土塁と柵で外の縁へ結ぶ。
  for (const sd of [-1, 1]) noT(wallLine(rt, [[GATE.x + sd * 3.6, GATE.z], [GATE.x + sd * 30, GATE.z]],
    { team: 1, hp: 1e9, name: '柵', meshOpt: { batch } }));
  for (const [x, z] of [[-138, 168], [-154, 158], [-143, 147], [62, 145], [77, 154]])
    hut(W, x, z, 7, 4, 0, { batch });
  // 寺名・規模・位置は未確定。後世の大寺院を写さず、在所の小堂を一つだけ置く。
  // 正面を西の避難道へ向ける。民の立つ所へ階段・建物の当たりを重ねない。
  rt.scene.add(dou(W, PEOPLE_TEMPLE.x, PEOPLE_TEMPLE.z, 6, 4, -Math.PI / 2));
  // 空の井戸の口。二基を同じ形・材質で描き、円の当たりを見た目に合わせる。
  const wells = [[-6, -157], [160, -134]], ring = new THREE.CylinderGeometry(.8, 1, .65, 10, 1, true);
  const mouths = new THREE.InstancedMesh(ring, new THREE.MeshStandardMaterial({ color: 0x655b49, roughness: 1 }), wells.length);
  const matrix = new THREE.Matrix4();
  wells.forEach(([x, z], i) => { matrix.makeTranslation(x, W.heightAt(x, z) + .33, z); mouths.setMatrixAt(i, matrix); solidCircle(x, z, 1); });
  rt.scene.add(mouths);
  // 北西の海は地形の外の遠景だけ。川・低湿地・刈田と山並みは既存の地形を使う。
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 110), new THREE.MeshStandardMaterial({ color: 0x303e40, roughness: .9, envMapIntensity: .12, transparent: true, depthWrite: false }));
  // 地形の外の海も、四辺を霞へほどいて長方形の境を残さない。
  sea.material.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec2 vTottoriSea;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTottoriSea = uv;');
    sh.fragmentShader = 'varying vec2 vTottoriSea;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 edge = min(vTottoriSea, 1.0 - vTottoriSea);
        diffuseColor.a *= smoothstep(0.0, 0.08, min(edge.x, edge.y));`);
  };
  sea.rotation.x = -Math.PI / 2; sea.position.set(-160, .7, -350); sea.userData.camBlock = false; rt.scene.add(sea);
  finalizeSimpleBatch(rt, batch);
}
