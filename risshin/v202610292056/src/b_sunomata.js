import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior, facePanels } from './naka.js';
import { SOLIDS, castleMat } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
// 墨俣の戦の定義（砦づくりと守り。battles.js から分けた。中身は元のまま）
import { palisade, bobosaku, kabukimon, tawara, hut, yagura, lumber, scaffold, umatsunagi, campfire, hasa, nobori, kagaribi, takataba, kobune, stumps, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { demSample } from './dem.js';
import { distToPolyline } from './world.js';
import { gauss, allyGroup, nm, enemyGroup, centerOf, unitPos } from './bhelp.js';
import { nagashinojo } from './b_nagashinojo.js';
import { RANKS } from './state.js';
import { buildHorse, aimArm, paint } from './units_model.js';
import { reduceMotion, S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { flagTexture } from './textures.js';
import { dirtTex, mudTex } from './nature.js';
import { volleyAt } from './b_okehazama.js';
import { battleEvent, EVENT_MESSENGER, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { sky } from './b_shared.js';
import { makeSiegeZones, ZONE_STATE, WIN } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset, FL } from './floors.js';
import { makeButai, butaiTick, adoptGroup } from './butai.js';
import { chooseRoute } from './siege_ai.js';
import { addTaba, tickTabas, patchGunCover } from './taketaba.js';
import { addFieldFence } from './yasen_obstacles.js';
import { flagBlocksView } from './units_flags.js';
import { rainDanger } from './arrow_rain.js';
import { localClear } from './army_local_way.js';
import { timeslipField } from './timeslip_field.js';
import { FORT, ROAD3, ROAD3N, YOSE, SIDE_WORD, HORI, SUNOMATA_PLAN, SUNOMATA_PATHS, SHEDS as PLAN_SHEDS, sunomataGround } from './castles/sunomata.js';

// ======================================================================
// 第3戦　墨俣
// 縄張りは castles/sunomata.js（riverFortPlan に倣った河川砦：砦の内・岸の舟着き・物見・外の空堀・寄せの道）。
// 斎藤の寄せは「備（butai）」：本物は波の組、後ろの数百は軽い大軍。寄せる道は寄せの頭（chooseRoute）が
// 柵の内の守りの厚さを見て毎回選び、竹束を押してゆっくり寄せ場まで来てから柵へ取り付く。
// 守り切りは寄せの退却、人足の生存、柵の完成、砦内の安全をそろえて決める。
// ======================================================================
// 合印：柵の口の斬り合いで敵味方を見分ける。織田方の手は旗と同じ黄土の陣笠、斎藤の寄せ手は柿渋の陣笠と大きめの旗指物。
// （具足はどちらも黒く、旗の色だけでは乱戦で取り違えた。名のある武将の兜はそのまま）
const ODA_AIJI = { hatColor: 0x9c7c34 };
const SAITO_AIJI = { hatColor: 0x6a3222, flagScale: 1.25 };
const aiji = (list, look) => list.map((e) => ({ ...e, o: { ...look, ...(e.o || {}) } }));
const allyGroupA = (rt, o, list) => allyGroup(rt, o, aiji(list, ODA_AIJI));
const MOAT = HORI.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));

// 射た時の場所に警告を残さない。味方の矢は本人に当たらない。
function sunoArrowWarning(rt) {
  const F = rt.flags;
  if (rt.t < (F.arrowSenseAt || 0)) return;
  F.arrowSenseAt = rt.t + .25;
  const mark = document.getElementById('rain-mark');
  if (!mark || mark.hidden) return;
  const p = rt.player.u;
  let danger = false;
  if (!rt.over && !rt.ended && !F.ending && !F.won && p.alive) for (const v of rt.army._rain?.volleys || []) {
    if (v.team !== p.team && v.t < v.T + .4 && Math.hypot(v.x - p.pos.x, v.z - p.pos.z) < v.r + 4) { danger = true; break; }
  }
  if (!danger) mark.hidden = true;
}

// 近い斬り合いと敗走だけ、実際に踏んだ距離で足音・低い土煙を出す。
// 半歩の押し合いも拾うが、棒立ち・足踏み・舟上から煙は出さない。
function sunoFooting(rt) {
  const F = rt.flags, A = rt.army, W = rt.world, P = rt.player.u;
  if (rt.over || !P.alive || F.won || F.ending || rt.t < (F.footSenseAt || 0)) return;
  F.footSenseAt = rt.t + .18;
  const units = A.units, n = units.length, start = (F.footCursor || 0) % Math.max(1, n);
  let picked = null;
  for (let i = 0; i < n; i++) {
    const u = units[(start + i) % n], p = u.pos;
    const moved = u.sunoFootX === undefined ? 0 : Math.hypot(p.x - u.sunoFootX, p.z - u.sunoFootZ);
    u.sunoFootX = p.x; u.sunoFootZ = p.z;
    if (!u.alive || u.dying || u.gone || u.isPlayer || u.mounted || u.naka || u.perch || u.climb ||
        u.boatSeat?.aboard || u.woundOut || u.type === 'porter' || u.offscreen ||
        Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 32 ||
        (!u.fleeing && (!u.target?.alive || u.target.isStruct ||
          Math.hypot(p.x - u.target.pos.x, p.z - u.target.pos.z) > Math.min(5, u.reach + 1.5)))) {
      u.sunoFootTravel = 0; continue;
    }
    // 転送や配置替えの距離を踏み込みに数えない。
    u.sunoFootTravel = (u.sunoFootTravel || 0) + (moved < 2 ? moved : 0);
    if (u.sunoFootTravel < .65) continue;
    u.sunoFootTravel %= .65;
    if (!picked && rt.t >= (F.footFxAt || 0)) { picked = u; F.footCursor = (start + i + 1) % n; }
  }
  if (!picked) return;
  F.footFxAt = rt.t + .45;
  const p = picked.pos, wet = W.rainLevel > .3 || W.waterFootDepthAt(p.x, p.z, p.y) > .02;
  if (rt.t >= (F.footSoundAt || 0)) {
    F.footSoundAt = rt.t + .9;
    A.play(wet ? 'stepWet' : 'step', p, picked.fleeing ? .65 : .45);
  }
  if (wet || reduceMotion() || Math.abs(p.y - W.heightAt(p.x, p.z)) > .35) return;
  const dust = W.dustCloud(p.x, p.z, false, true);
  if (dust) {
    dust.x = p.x; dust.z = p.z; dust.life = 1.8 + (picked.id % 4) * .2;
    dust.s0 = .35; dust.s1 = 1.3; dust.a = .065; dust.rise = .04;
  }
}

// 墨俣の札は今やる一件。別の手柄の判定は残し、済・失敗の札を積まない。
const TASK_ORDER = ['complete', 'retreat', 'rescue', 'flag', 'porters', 'nida', 'scout', 'post', 'gate', 'defend'];
const FIRST_TASK_ORDER = ['complete', 'retreat', 'rescue', 'defend', 'gate', 'flag', 'porters', 'nida', 'scout', 'post'];
const LAST_TASK_ORDER = ['complete', 'retreat', 'rescue', 'post', 'defend', 'flag', 'porters', 'nida', 'scout', 'gate'];
const SUNO_WOOD_PICK = { x: -6, z: 7 }, SUNO_WOOD_DROP = { x: 6, z: -10 };
// 門外の迎えが済んだら、閉じた柵越しの持ち場でなく南門への道を示す。
// 曲がり角と門内の点は同じ入れ物を使い回す。
function sunoReturnPoint(rt) {
  const F = rt.flags, p = rt.player.u.pos, point = F.returnPoint;
  if (F.ending || F.won || rt.over || !point ||
      (F.sunoTask !== 'defend' && F.sunoTask !== 'post' && F.sunoTask !== 'gate' && F.sunoTask !== 'rescue') ||
      // 柵の内側まで門外扱いにすると、守備位置から閉じた柵を横切る案内になる。
      Math.abs(p.x) < FORT && Math.abs(p.z) < FORT) return null;
  const side = p.x < 0 ? -1 : 1;
  if (p.z < FORT + 3 && (Math.abs(p.x) > 2 || p.z < -FORT)) {
    point.x = side * (FORT + 6);
    point.z = Math.abs(p.x) < FORT + 3 ? p.z : FORT + 6;
  } else {
    point.x = 0;
    point.z = Math.abs(p.x) < 2 && p.z < FORT + 4 ? FORT - 3 : FORT + 4;
  }
  return point;
}
// 回避中にも、済んだ迎えや古い北の守りへ指図を戻さない。
function sunoRainDuty(rt) {
  const F = rt.flags;
  if (sunoReturnPoint(rt)) return '南門から砦へ戻る';
  if (F.carryingWood) return '材木を人足へ渡す';
  if (F.sunoTask === 'rescue') return '人足の前で敵を止める';
  if (F.sunoTask === 'nida' || F.sunoTask === 'porters') return '道の印から人足を迎える';
  if (F.woodDelivered && F.buildBusy) return '柵を直す人足を守る';
  return '柵を守る';
}
// 人足は修理と退避で動く。空になった北の置き場へ材木を渡させない。
// 受け手の位置をそのまま使い、少し近い人が現れるたびに印を飛ばさない。
function sunoWoodDrop(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  let receiver = null, best = Infinity;
  for (const hand of F.wk.units) {
    if (!hand.alive || hand.dying || hand.gone || hand.fleeing || hand.woundOut || hand.noTarget) continue;
    const d = Math.hypot(hand.pos.x - p.x, hand.pos.z - p.z) - (hand === F.woodReceiver ? 2 : 0);
    if (d < best) { best = d; receiver = hand; }
  }
  F.woodReceiver = receiver;
  return receiver?.pos || null;
}
// 材を取りに行ける切れ目を、案内と遊び手でそろえる。
// 内外の区別だけで運搬を止めず、運ぶ小道と受け手への間合いを見る。
function sunoSupplyLull(rt) {
  const F = rt.flags;
  if (!F.wave) return false;
  const a = SUNO_WOOD_PICK, b = sunoWoodDrop(rt);
  if (!b) return false;
  const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz || 1;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team !== 1 || u.fleeing || u.woundOut || u.noTarget || u.group?.routed || u.group?.noAI) continue;
    const t = Math.max(0, Math.min(1, ((u.pos.x - a.x) * dx + (u.pos.z - a.z) * dz) / lengthSq));
    if (Math.hypot(u.pos.x - a.x - dx * t, u.pos.z - a.z - dz * t) < 8) return false;
  }
  return true;
}
// 運ぶ材を探す時に、手当ての「静止中・そばに護衛」の条件を使わない。
// 歩いて近づいても場所を保ち、斬り合いの最中は担ぐ・渡すの両方を止める。
function sunoCanHandleWood(rt) {
  const p = rt.player, u = p.u;
  return !p.mounted && !u.climb && !p.pending && !u.pAtk && !u.swing &&
    // 回避の時計は平常時も減って負になる。正の間だけ担ぐのを止める。
    !p.shot && !p.aiming && !(p.draw > 0) && !(p.chargeT > 0) && !(p.dodgeT > 0) &&
    !(u.stagger > 0) && !(p.staggerT > 0) && !(p.knockT > 0) &&
    sunoSupplySafe(rt);
}
// 運べる切れ目でも、本人に槍が届く間は運搬を命じない。案内と遊び手で同じ条件を使う。
function sunoSupplySafe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  // 案内・長押し・首取りで同じ索敵を重ねない。次のコマか本人の移動で調べ直す。
  if (F.supplySafeT !== rt.t || F.supplySafeX !== p.x || F.supplySafeY !== p.y || F.supplySafeZ !== p.z) {
    F.supplySafeT = rt.t; F.supplySafeX = p.x; F.supplySafeY = p.y; F.supplySafeZ = p.z;
    F.supplySafe = !rt.army.nearestEnemy(rt.player.u, 8, F.woodThreat);
  }
  return F.supplySafe;
}
// 布を巻いた後の待ち時間には任務へ戻す。新たな出血と次の手当ては残す。
function sunoTreatmentNeeded(rt) {
  const p = rt.player;
  return p.treatmentLeft > 0 && !(p.treatmentNext > rt.t) &&
    (p.u.wounds?.bleed > .0001 || p.u.hp < p.u.maxHp * .6);
}
// 止血後の小さな傷は残る。歩みの低下だけで、戦が終わるまで退避を命じ続けない。
// 走れなくなるほどの傷・出血・深手では、引き続き味方の後ろへ下げる。
function sunoWoundRetreatNeeded(rt) {
  const u = rt.player.u;
  return u.wounds?.bleed > .0001 || u.hp < u.maxHp * .3 || u.woundSlow > .25 || u.armWound > .25;
}
function sunoNeedsRetreat(rt) {
  const cue = rt.hud.retreatGuide;
  return !!(cue?.active && cue.valid) || rt.flags.retreatMarked || sunoWoundRetreatNeeded(rt) ||
    rt.player.u.mobbed || rt.player.sta < 20 || rt.t < (rt.retreatUntil || 0);
}
// 守る場所を遠い敵の「近づけ」で消さない。届く相手と本人への打ち込みだけ受ける。
function sunoMeleeGuide(rt, enemy) {
  if (!enemy?.alive || rt.flags.ending || sunoNeedsRetreat(rt)) return false;
  const p = rt.player, u = p.u;
  return Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z)
    <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust') ||
    enemy.atk?.target === u || enemy.swing?.target === u && !enemy.swing.done;
}
// 守備の印は到着しても残し、移動だけを促す札にしない。
const SUNO_GUARD_GUIDE = { h: 2.5, guideArea: 'guard', guideRadius: 3, waitGuide: () => '柵の内で構え、槍の先まで来た敵を突け' };
const WORK_SHELTER = { x: -4, z: 9 };
const WORK_SHELTERS = [WORK_SHELTER, { x: 4, z: 9 }, { x: 0, z: 13 }];
// 小屋の南の空いた小道から、追手のいない退き先を選ぶ。一秒ごとの見張りで点を使い回す。
function sunoWorkShelter(rt) {
  const F = rt.flags;
  let best = F.workShelter || WORK_SHELTER, score = -Infinity;
  for (const point of WORK_SHELTERS) {
    let clearanceSq = 24 * 24;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.team !== 1 || u.fleeing || u.woundOut || u.noTarget || u.group?.routed) continue;
      if (Math.abs(u.pos.x) > FORT + 12 || Math.abs(u.pos.z) > FORT + 12) continue;
      // 今の最短距離を縮めない敵には、柵越しの判定を重ねない。
      const dx = u.pos.x - point.x, dz = u.pos.z - point.z, dSq = dx * dx + dz * dz;
      if (dSq >= clearanceSq) continue;
      if (rt.army.wallBetween(u.pos, -1, point,
        (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) continue;
      clearanceSq = dSq;
    }
    // ほぼ同じ安全さなら行き先を保ち、左右へ往復させない。
    const value = Math.sqrt(clearanceSq) + (point === F.workShelter ? 2 : 0);
    if (value > score) { score = value; best = point; }
  }
  F.workShelter = best;
  return best;
}
// 負傷や回避の案内でも、修理が残っている事を同じ札で知らせる。
function sunoRepairDetail(rt, order = true) {
  const F = rt.flags;
  const hands = F.wk.count <= 4 ? `人足あと${F.wk.count}人。二人を下回ると普請は失敗。` : '';
  const wood = F.carryingWood ? '材木を担いでいる。敵が離れたら印の人足へ渡せ。'
    : !F.woodDelivered ? '材木は未配達。敵が退いたら小屋の南西で担げ。' : '';
  if (F.wave !== 3) return hands + wood;
  let broken = 0;
  for (const s of F.segs) if (!s.alive) broken++;
  return hands + wood +
    (broken ? `破れ目${broken}か所。` + (!order ? '人足の修理が必要。' : F.buildBusy && F.workNotice
      ? F.workNotice + '。' : '人足の道を空け、修理を守れ。') : '');
}
function sunoSync(rt) {
  const tasks = rt.flags.sunoTasks;
  // 接敵中は柵の守りを先にする。荷駄や旗の手柄は裏で判定を続ける。
  const order = rt.flags.wave === 3 ? LAST_TASK_ORDER
    : rt.flags.wave === 1 && !rt.flags.next2 ? FIRST_TASK_ORDER : TASK_ORDER;
  let next = null;
  for (const id of order) {
    const task = tasks.get(id);
    if (task && !task.state) { next = task; break; }
  }
  const old = rt.flags.sunoTask;
  if (old && old !== next?.id) rt.objRemove(old);
  rt.flags.sunoTask = next?.id || null;
  if (next) {
    // そばの下知として出す。運びかけの古い札が後から戻らない。
    rt.obj(next.id, next.text, next.kind, true);
    rt.objProgress(next.id, next.progress);
  }
}
function sunoObj(rt, id, text, kind = 'main') {
  const tasks = rt.flags.sunoTasks || (rt.flags.sunoTasks = new Map());
  let task = tasks.get(id);
  if (!task) { task = { id, text, kind, state: '', progress: '' }; tasks.set(id, task); }
  else {
    if (task.text !== text) {
      task.progress = '';
      // 同じ任務の持ち場変更も、共通の十秒待ちを挟まず本文へ反映する。
      if (rt.flags.sunoTask === id) rt.hud.taskShownAt = -99;
    }
    task.text = text; task.kind = kind; task.state = '';
  }
  sunoSync(rt);
  return task;
}
function sunoProgress(rt, id, text) {
  const task = rt.flags.sunoTasks?.get(id);
  if (task && !task.state) task.progress = text;
  if (rt.flags.sunoTask === id) rt.objProgress(id, text);
}
// 聞こえた合図は、今の任務札にも添える。音の意味と自分の下知を取り違えない。
function sunoCue(rt, text) {
  const task = rt.objectives.find((o) => o.id === rt.flags.sunoTask);
  if (task) { task.cue = text; task.cueT = rt.t; }
}
function sunoEnemySignal(rt, group) {
  rt.army.playFar('sig_kakari', centerOf(group), 1.1);
  sunoCue(rt, '敵の合図：法螺貝と陣太鼓の早打ち。柵の内で受けよ');
  rt.after(2.2, () => {
    if (rt.over || rt.flags.ending || rt.flags.won || !group.count || group.routed) return;
    rt.army.play('eshout', centerOf(group), 1.4);
  });
}
// 舟や日暮れの寄せで任務が変わる時は、選んだ持ち場の印も同じ柵へ移す。
// 稲生の型：守る柵の内の一点（ピンと味方の集まる所）。三の手は選んだ持ち場。
function sunoPostPoint(rt) {
  const F = rt.flags, side = F.wave === 3 ? F.post3 || F.guardSide || 'n' : F.guardSide || 'n';
  const p = F.sunoPostAt || (F.sunoPostAt = { x: 0, z: 0, side: '' });
  if (p.side !== side) {
    p.side = side;
    if (side === 'e') { p.x = FORT - 3; p.z = 0; } else if (side === 'w') { p.x = -FORT + 3; p.z = 0; } else { p.x = 4; p.z = -FORT + 3; }
  }
  return p;
}
// 一番近い残りの敵（控えで動かない組・退く者は数えない）。半秒ごとに選び直し、毎コマ全員を見ない。
function sunoNearestFoe(rt) {
  const F = rt.flags, me = rt.player.u;
  const ok = (u) => u?.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct &&
    u.team !== me.team && u.group && !u.group.routed && !u.group.noAI;
  if (rt.t < (F.sunoFoeAt || 0) && (F.sunoFoe === null || ok(F.sunoFoe))) return F.sunoFoe;
  F.sunoFoeAt = rt.t + .5;
  let best = null, bd = Infinity;
  if (F.wave) for (const u of rt.army.units) {
    if (!ok(u)) continue;
    const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  F.sunoFoe = best;
  return best;
}
function sunoPost(rt, text, side) {
  rt.unmark('post0');
  rt.flags.guardSide = side;
  const pt = side === 'n' ? { x: 6, z: -FORT + 1.4 }
    : side === 'w' ? { x: -FORT + 1.4, z: 0 } : { x: FORT - 1.4, z: 0 };
  rt.marker('post3', pt, `${SIDE_WORD[side]}の柵`, SUNO_GUARD_GUIDE);
  sunoObj(rt, 'post', text, 'order');
}
function sunoClose(rt, id, state) {
  const task = rt.flags.sunoTasks?.get(id);
  if (!task || task.state) return;
  task.state = state; task.progress = '';
  if (state === 'done') rt.objDone(id); else rt.objFail(id);
  rt.objRemove(id);
  sunoSync(rt);
}
const sunoDone = (rt, id) => sunoClose(rt, id, 'done');
const sunoFail = (rt, id) => sunoClose(rt, id, 'fail');
function sunoRemove(rt, id) {
  rt.flags.sunoTasks?.delete(id); rt.objRemove(id);
  if (rt.flags.sunoTasks) sunoSync(rt);
}

// この戦に置かれた蜂須賀の幟だけ染め直す。共有の旗の絵・材質は変えない。
let hachiCloth;
const hachiMats = new WeakMap();
function dressHachiFlags(rt) {
  const original = flagTexture('hachisuka');
  rt.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.map !== original) return;
    if (!hachiCloth) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#ad8239'; g.fillRect(0, 0, 128, 256);
      // 丸に三つの山形。史実の家紋と断定しない、この戦だけの合印。
      g.strokeStyle = '#242018'; g.lineWidth = 5;
      g.beginPath(); g.arc(64, 72, 22, 0, Math.PI * 2); g.stroke();
      for (const y of [62, 72, 82]) {
        g.beginPath(); g.moveTo(51, y + 4); g.lineTo(64, y - 4); g.lineTo(77, y + 4); g.stroke();
      }
      for (let y = 0; y < 256; y += 4) { g.fillStyle = 'rgba(30,24,16,.05)'; g.fillRect(0, y, 128, 1); }
      hachiCloth = new THREE.CanvasTexture(c); hachiCloth.colorSpace = THREE.SRGBColorSpace;
    }
    const base = mesh.material;
    let mat = hachiMats.get(base);
    if (!mat) {
      mat = base.clone(); mat.map = hachiCloth;
      mat.onBeforeCompile = base.onBeforeCompile; mat.customProgramCacheKey = base.customProgramCacheKey;
      hachiMats.set(base, mat);
    }
    mesh.material = mat;
    // 幟の竿・横木も一緒に細くし、布だけが横木から外れないようにする。
    if (mesh.parent?.userData.flag === mesh) mesh.parent.scale.x *= .6;
    else mesh.scale.x *= .6;
  });
}

// 小道と柵の間を空ける。縄張りの小道・室内・外壁・歩く時の避け先で同じ寸法を使う。
const SHEDS = PLAN_SHEDS;
const MAIN_SHED = { name: '普請小屋', x: 0, z: -4, w: 5.4, d: 3.6, rot: 0, kind: 'yagura' };

// 普請の人足は、端の丸い材木を二本の縄で束ねて背負う。形は全員で共用する。
let sunoLoad;
// 普請の手と槍の守りを服でも見分ける。姿だけ替え、体力や歩みは変えない。
const SUNO_PORTER_LOOK = { kosode: 1, kosodeCol: 0x72634b, obi: 0x393126, dirt: .65 };
let sunoRouteMat;
// 行き先の小旗は白い板でなく、組の合印を染めた小さな布にする。
let sunoDestCloth, sunoDestGeo;
const sunoDestMats = new WeakMap();
function sunoDestMaterial(base) {
  if (base.userData.sunoDest) return base;
  let mat = sunoDestMats.get(base);
  if (mat) return mat;
  if (!sunoDestCloth) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#b49a64'; g.fillRect(0, 0, 128, 96);
    for (let y = 0; y < 96; y += 3) {
      g.fillStyle = y % 2 ? 'rgba(40,30,18,.09)' : 'rgba(240,220,180,.09)';
      g.fillRect(0, y, 128, 1);
    }
    g.fillStyle = '#242018'; g.font = 'bold 56px serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('組', 64, 49);
    sunoDestCloth = new THREE.CanvasTexture(c); sunoDestCloth.colorSpace = THREE.SRGBColorSpace;
  }
  mat = base.clone(); mat.map = sunoDestCloth; mat.userData.sunoDest = true;
  sunoDestMats.set(base, mat);
  return mat;
}
function sunoPorterLoad() {
  if (sunoLoad) return sunoLoad;
  const parts = [];
  // 三本の小丸太。長さを少し違え、肩の幅を大きく越える荷にしない。
  for (const [y, z, length] of [[1.22, -.28, .82], [1.22, -.44, .9], [1.35, -.36, .78]]) {
    const log = new THREE.CylinderGeometry(.065, .075, length, 7);
    log.rotateZ(Math.PI / 2); log.translate(0, y, z);
    parts.push(paint(log, 0x80613d));
    // 木口は樹皮より明るくし、平たい箱と見分けられるようにする。
    for (const x of [-length / 2 - .002, length / 2 + .002]) {
      const end = new THREE.CircleGeometry(x < 0 ? .065 : .075, 7);
      end.rotateY(x < 0 ? -Math.PI / 2 : Math.PI / 2); end.translate(x, y, z);
      parts.push(paint(end, 0xc2a16c));
    }
  }
  for (const x of [-.24, .24]) {
    const rope = new THREE.TorusGeometry(.155, .012, 4, 12);
    rope.rotateY(Math.PI / 2); rope.scale(1, .9, 1); rope.translate(x, 1.26, -.36);
    parts.push(paint(rope, 0xc8b58b));
  }
  sunoLoad = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return sunoLoad;
}

// 束ねた小屋も、視線を塞ぐ近い面だけ抜く。共有材は変えず、材ごとに一度だけ用意する。
const sunoNearMats = new WeakMap(), sunoFenceMats = new WeakMap();
const SUNO_VIEW = { value: new THREE.Vector3() };
const SUNO_GOAL = { value: new THREE.Vector3() };
const SUNO_FORWARD = { value: new THREE.Vector3(0, 0, -1) };
const sunoClothMats = new WeakMap();
// 元の家紋と旗の時計を保ち、この戦の布だけ襞を深くする。
function sunoClothMaterial(base) {
  if (base.userData.sunoCloth) return base;
  let mat = sunoClothMats.get(base);
  if (mat) return mat;
  mat = base.clone(); mat.userData.sunoCloth = true;
  mat.color.set(base.map?.userData.mon === 'saito' ? 0xb5b8af : 0xc8b993);
  const compile = base.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(base, sh, renderer);
    sh.vertexShader = sh.vertexShader.replace('transformed.z += (', 'transformed.z += 1.6 * (')
      .replace('vec3(-dzdx, -dzdy, 1.0)', 'vec3(-dzdx * 1.6, -dzdy * 1.6, 1.0)');
  };
  mat.customProgramCacheKey = () => base.customProgramCacheKey() + '_suno_cloth';
  sunoClothMats.set(base, mat);
  return mat;
}
function sunoNearMaterial(base, fence = false) {
  if (base.userData.sunoSmoothNear) return base;
  const cache = fence ? sunoFenceMats : sunoNearMats;
  let mat = cache.get(base);
  if (mat) return mat;
  mat = base.clone();
  // 共通の視点処理に点描を重ねさせない。墨俣専用の材質だけを指定する。
  mat.userData.sunoSmoothNear = true;
  // 共通の置き幟は足元からの距離で全体を薄くするため、頭上に透けた大旗が残る。
  // 墨俣では布と竿の濃さ・奥行きを戻し、視線を塞ぐ時だけ既存の一時非表示へ渡す。
  const solidNobori = base.customProgramCacheKey().includes('_near_nobori');
  if (solidNobori) { mat.transparent = false; mat.depthWrite = true; }
  // 半透明の壁を何枚も重ねると、白い室内や横木が画面全体に残る。
  // 元の奥行きと濃さを保ち、邪魔な面は描かない。布の元の透過設定も保つ。
  mat.forceSinglePass = true;
  // すぐ目の前の大きな旗は、視点に触れるより前に外す。壁や柵の輪郭は従来どおり。
  const nearRadius = base.userData.sunoCloth || base.userData.sunoDest || base.map?.userData.mon ? 1.35 : fence ? 1.1 : .45;
  const sightRadius = fence ? 1.15 : .6;
  const compile = base.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(base, sh, renderer);
    if (solidNobori) sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.a *= vNearNobori;', '');
    sh.uniforms.uSunoView = SUNO_VIEW;
    sh.uniforms.uSunoGoal = SUNO_GOAL;
    sh.vertexShader = 'varying vec3 vSunoNear;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 sunoPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        sunoPosition = batchingMatrix * sunoPosition;
      #endif
      #ifdef USE_INSTANCING
        sunoPosition = instanceMatrix * sunoPosition;
      #endif
      vSunoNear = (modelMatrix * sunoPosition).xyz;`);
    sh.fragmentShader = 'varying vec3 vSunoNear;\nuniform vec3 uSunoView;\nuniform vec3 uSunoGoal;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      vec3 sunoLine = uSunoView - cameraPosition;
      float sunoAlong = dot(vSunoNear - cameraPosition, sunoLine) / max(dot(sunoLine, sunoLine), 0.01);
      float sunoCover = length(vSunoNear - (cameraPosition + sunoLine * clamp(sunoAlong, 0.0, 1.0)));
      // 本人より前の柵は切り抜かない。杭の先だけが宙に残る穴を作らず、
      // 視点と本人の間に入った材だけを避ける。
      // 柵際では本人の肩と槍先まで空ける。遠い壁や柱は残す。
      vec3 sunoGoalLine = uSunoGoal - cameraPosition;
      float sunoGoalAlong = dot(vSunoNear - cameraPosition, sunoGoalLine) / max(dot(sunoGoalLine, sunoGoalLine), 0.01);
      float sunoGoalCover = length(vSunoNear - (cameraPosition + sunoGoalLine * sunoGoalAlong));
      // 敵への視線を塞ぐ手前の材だけ空け、遠い柵は残す。
      bool sunoGoalNear = sunoGoalAlong > 0.0 && sunoGoalAlong < 0.95
        && length(vSunoNear - cameraPosition) < 3.0 && sunoGoalCover < 0.8;
      if (sunoGoalNear || (sunoAlong > 0.0 && sunoAlong < 0.98 && sunoCover < ${sightRadius.toFixed(2)})
        || length(vSunoNear - cameraPosition) < ${nearRadius.toFixed(2)}) discard;`);
  };
  mat.customProgramCacheKey = () => base.customProgramCacheKey() + (fence ? '_suno_fence' : '_suno_near') + nearRadius;
  cache.set(base, mat);
  return mat;
}

// 柵ぎわの足場と物見の柱も、手前の材だけ透かす。遠くの輪郭と当たりは保つ。
function sunoNearFrame(group) {
  group.traverse((mesh) => {
    if (mesh.isMesh && mesh.material && !Array.isArray(mesh.material)) mesh.material = sunoNearMaterial(mesh.material, true);
  });
  return group;
}

// 固定の逆茂木は柵の向きごとに結合する。手前を透かす材質と地面に沿う形は保つ。
// 兵・壊れる柵・完成時に外す足場はここへ入れない。
function sunoMergeSakamogi(scene, rows) {
  for (const groups of Object.values(rows)) {
    const byMat = new Map();
    for (const group of groups) {
      group.updateMatrixWorld(true);
      for (const mesh of group.children) {
        let parts = byMat.get(mesh.material);
        if (!parts) { parts = []; byMat.set(mesh.material, parts); }
        mesh.geometry.applyMatrix4(mesh.matrixWorld);
        parts.push(mesh.geometry);
      }
    }
    for (const [mat, parts] of byMat) {
      const geo = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

// 二択は知らせ欄の横並びを使い、指で押す高さと持ち場の字を保つ。
function sunoChoiceLayout(rt) {
  const root = rt.hud.root, layout = document.createElement('style');
  layout.textContent = `
    /* 出陣前に空の地図・方位帯を見せない。説明と出陣の釦に目を向ける。 */
    #hud.suno-view:has(#intro:not([hidden])) :is(.tl,.tr,#compass,#armybar,#dateline,#crosshair,#staring) { visibility:hidden; }
    /* 下知を題字・人物紹介の下へ隠さない。狭い画面では本文だけを送る。 */
    html body #hud.suno-view #intro:has(#intro-go) > .card.card {
      width:min(520px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
      height:min(620px, calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
      max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
    }
    #hud.suno-view #intro:has(#intro-go) .intro-reading {
      flex:1 1 0; min-height:0; width:100%; overflow-y:auto; scrollbar-gutter:stable;
      pointer-events:auto; touch-action:pan-y; overscroll-behavior:contain;
    }
    #hud.suno-view #intro #intro-go { flex-shrink:0; }
    #hud.suno-view #intro .date { letter-spacing:.02em; text-wrap:balance; }
    #hud.suno-view #intro .intro-reading > :last-child { margin-bottom:8px; }
    #hud.suno-view #intro .suno-people-toggle {
      min-height:44px; margin-top:8px; padding:8px 16px; border:1px solid #c2a25a;
      background:#14120f; color:#ece4d2; font:inherit; font-size:15px; cursor:pointer;
    }
    @media (max-height:500px) {
      html body #hud.suno-view #intro:has(#intro-go) > .card.card { width:min(680px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); }
      #hud.suno-view #intro .intro-reading p { margin:8px 0 0; }
      #hud.suno-view #intro .card .rule { margin:8px auto; }
    }
    #hud.suno-view:not(.suno-death) #cine { display:none !important; }
    #hud.suno-view:not(.suno-death):has(#cine.on) .tl,
    #hud.suno-view:not(.suno-death):has(#cine.on) .tr,
    #hud.suno-view:not(.suno-death):has(#cine.on) #armybar,
    #hud.suno-view:not(.suno-death):has(#cine.on) #compass { opacity:1; transition:none; }
    html body #hud.suno-view #battle-notices.choosing {
      left:calc(16px + env(safe-area-inset-left, 0px)) !important;
      right:auto !important; width:min(520px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))) !important;
      /* 中央寄せの移動量を持ち越すと、左の選択肢が画面外へ出る。 */
      transform:none !important; translate:none !important;
      top:calc(60px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
      max-width:520px; margin-inline:0; max-height:calc(100vh - 144px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
    }
    #hud.suno-view #battle-notices #choice { padding:6px 8px !important; }
    #hud.suno-view #battle-notices.choosing #choice { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; }
    #hud.suno-view #battle-notices.choosing #choice :is(h5,.choice-help,#choice-seconds,.tm) { grid-column:1 / -1; }
    /* 判断中は古い任務を上に積まない。判断の札の状態を直接見る。 */
    #hud.suno-view.mission-visible #battle-notices.choosing #objectives:not([hidden]):not(.notice-muted),
    #hud.suno-view #battle-notices.choosing :is(#objectives,#battle-message),
    #hud.suno-view:has(#battle-notices.choosing) #choice-tasks { display:none !important; }
    #hud.suno-view #battle-notices #choice .opt {
      min-width:0; min-height:48px; padding:8px; margin-top:0; grid-column:auto;
    }
    #hud.suno-view #battle-notices #choice .opt small { white-space:normal; overflow-wrap:anywhere; }
    /* 操作の説明を畳んでも、問い・時間・選ぶ結果は残す。 */
    #hud.suno-view.suno-choice-folded #battle-notices #choice :is(.choice-help,.tm) {
      position:absolute; width:1px; height:1px; padding:0; margin:0; overflow:hidden; clip-path:inset(50%);
    }
    #hud.suno-view #battle-notices #choice #choice-seconds { font-size:12px; }
    /* 百四画素の札を九十六画素で切らない。選択で上へ動く分も空ける。 */
    #hud.suno-view #h-units { max-height:none; padding-top:4px; }
    #hud.suno-view #h-units .uc { flex-shrink:0; }
    /* 隊ごとの下知を一行ずつ読む。「射撃中」の末尾だけ次の行へ落とさない。 */
    @media (min-height:501px) and (min-width:901px) {
      #hud.suno-view #h-squad .ord {
        flex-basis:100%; min-width:0; white-space:normal; overflow-wrap:anywhere;
        line-height:1.6;
      }
      #hud.suno-view #h-squad .ord small { display:inline-block; white-space:nowrap; }
    }
    /* 長いけがの文で格子の幅を押し広げず、命の棒も墨の枠内へ収める。 */
    html body #hud.suno-view .bl #h-hp.hp {
      grid-template-columns:minmax(0, 1fr) auto !important;
      width:100%; min-width:0; max-width:100%;
    }
    html body #hud.suno-view .bl #h-hp.hp :is(i,em) { min-width:0; max-width:100%; }
    html body #hud.suno-view .bl #h-hp.hp em {
      width:100%; box-sizing:border-box; overflow-wrap:anywhere; word-break:normal;
      font-size:max(14px, calc(14px * var(--text-scale, 1))) !important; line-height:1.4;
    }
    html body #hud.suno-view .bl #h-hp.hp em svg { width:18px; height:20px; }
    html.touch body #hud.suno-view > #battle-log-entry {
      width:auto !important; min-width:88px !important; min-height:44px; padding:4px 8px !important; box-sizing:border-box;
    }
    @media (max-width:600px) {
      #hud.suno-view #battle-notices.choosing #choice { grid-template-columns:minmax(0,1fr); }
    }
    #hud.suno-view .mk:not(.red) b { color:#ece4d2; background:#14120f; padding:4px 8px; font-size:max(15px, calc(15px * var(--text-scale, 1))); }
    #hud.suno-view #crosshair { background:#14120f; border-radius:50%; box-shadow:0 0 0 2px #ece4d2; }
    #hud.suno-view .range-cue { background:#14120f; color:#ece4d2; padding:4px 8px; font-size:14px; box-shadow:0 0 0 1px #a18a58; }
    /* 気力・連撃・使う札を照準から離し、正面の敵の手元を空ける。 */
    #hud.suno-view #staring { left:calc(50% - 90px); top:calc(50% - 70px); }
    #hud.suno-view #staring + .combat-cue-label {
      left:calc(50% - 80px) !important; top:calc(50% - 46px) !important;
      transform:translateX(-50%); white-space:nowrap;
    }
    #hud.suno-view #combo { left:calc(50% + 48px); top:calc(50% - 70px); }
    #hud.suno-view #prompt {
      top:calc(50% + 112px); max-width:calc(100vw - 32px); box-sizing:border-box;
      font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6;
      color:#ece4d2; background:#14120f;
    }
    #hud.suno-view #prompt.fence-blocked { top:calc(50% + 112px); }
    /* この戦の味方の柵は立て直す操作。共通の「倒して通る」は添えない。 */
    #hud.suno-view #prompt.fence-blocked strong { display:none; }
    /* 移動中は押せない札になる。見出しと補足を横につなげず、端の内へ収める。 */
    html.touch body #hud.suno-view #wait-guard.guard-travel.wait-status:disabled:not([hidden]) {
      width:240px; max-width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
      box-sizing:border-box;
    }
    html.touch body #hud.suno-view #wait-guard :is(span,small) {
      display:block; min-width:0; max-width:100%; white-space:normal;
      word-break:normal; overflow-wrap:anywhere;
    }
    /* 任務を一文字幅まで縮めず、守る場所と動作を同じ札の横幅で読む。 */
    html body #hud.suno-view #battle-notices:not(.choosing) #objectives:not(.expand) {
      width:100% !important; align-self:stretch; min-width:0 !important;
    }
    /* 地面の印に付く札も同じ列へ収め、小地図へ固定配置を戻さない。 */
    html body #hud.suno-view.single-guide #battle-notices:not(.choosing) > #objectives:is(.ground-order,.turn-coach,.facing-order):not(.expand),
    html body #hud.suno-view.single-guide #battle-notices:not(.choosing) > #objectives.linked-destination.ground-order:not(.expand) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; max-width:100% !important;
    }
    html body #hud.suno-view #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
      display:block !important; width:100% !important; box-sizing:border-box;
    }
    /* 補足にも墨を敷く。昼の空や砂地の上で持ち場の説明を消さない。 */
    html body #hud.suno-view #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small {
      color:#ece4d2 !important; background:#14120f !important;
      opacity:1 !important; padding:2px 4px; box-sizing:border-box;
      font-size:max(15px, calc(15px * var(--text-scale, 1))) !important;
      line-height:1.4; white-space:normal; overflow-wrap:anywhere;
    }
    #hud.suno-view .mk.main, #hud.suno-view .mk.quiet { opacity:1; }
    /* 作業・回避中も、選ばれた任務一枚に持ち場と期限を残す。 */
    html body #hud.suno-view.working #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand):not([hidden]):not(.notice-muted),
    html body #hud.suno-view:is(.rain-danger,.dodge-active,.dodge-turn-coach) #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand):not([hidden]):not(.notice-muted) {
      display:block !important; visibility:visible !important; pointer-events:auto;
    }
    html body #hud.suno-view:is(.rain-danger,.dodge-active) #objectives:not(.expand) #obj-list { display:block !important; }
    html body #hud.suno-view:is(.rain-danger,.dodge-active) #objectives:not(.expand) #obj-list li.cur small:is(.goal-place,.obj-cue) { display:none !important; }
    #rain-mark.suno-rain { white-space:nowrap; }
    @media (min-height:501px) and (min-width:901px) {
      /* 軍の名と今の下知に横幅を分け、右の斎藤軍を任務札の下へ隠さない。 */
      html body #hud.suno-view #armybar {
        left:calc(208px + env(safe-area-inset-left, 0px));
        right:calc(224px + min(320px, 30vw) + env(safe-area-inset-right, 0px));
        width:auto; max-width:640px; transform:none;
        grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr);
      }
      /* 小地図の左へ一枚分あけ、下知と地図を同時に読めるようにする。 */
      html body #hud.suno-view #battle-notices:not(.choosing),
      html body #hud.suno-view.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
        top:calc(20px + env(safe-area-inset-top, 0px)) !important;
        width:min(320px, 30vw) !important; transform:none !important;
        /* 二枚目の説明を高さ四分の一で切らない。大きな字では欄を送って読める。 */
        max-height:min(360px, 40vh) !important;
        overflow-y:auto; pointer-events:auto;
      }
    }
    @media (max-height:500px) {
      /* 近い敵へ槍を向けても、任務の欄を右下の操作札へ移さない。 */
      html.touch body #hud.suno-view.hand-action-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
        position:static !important; inset:auto !important; transform:none !important;
        width:100% !important; max-width:100% !important; min-height:44px !important;
      }
      html.touch body #hud.suno-view.hand-action-guide #battle-notices #objectives#objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
        font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
      }
      /* 正面の敵の頭と槍先を空け、地図の左に下知を寄せる。長い文は欄を送って読む。 */
      html body #hud.suno-view.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-now,.obj-text) {
        font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; line-height:1.4 !important;
      }
      html body #hud.suno-view.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
      html body #hud.suno-view #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important;
        top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
        transform:none !important;
        width:min(300px, calc(100vw - 200px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))) !important;
      }
      /* 敵への構えと任務の補足を、同じ欄の中で読める高さにする。 */
      html body #hud.suno-view.compact-battle #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        max-height:min(168px, 42vh) !important;
        overflow-y:auto; overscroll-behavior:contain;
      }
      /* 札の中を縮めて末尾を切らず、必要な時は欄全体を送る。 */
      html body #hud.suno-view #battle-notices:not(.choosing) > #objectives:not(.expand) {
        flex:0 0 auto; max-height:none !important; overflow:visible !important;
      }
      #hud.suno-view #prompt, #hud.suno-view #prompt.fence-blocked { top:calc(50% + 72px); }
      #hud.suno-view #combo { top:calc(50% - 44px); }
      /* 右の下知と中央の照準から離し、危険の知らせを一枚にする。 */
      #rain-mark.suno-rain {
        left:calc(16px + env(safe-area-inset-left, 0px)) !important; transform:none !important;
        top:calc(64px + env(safe-area-inset-top, 0px)) !important;
        padding:6px 8px !important; font-size:13px !important; letter-spacing:0 !important;
      }
      /* 守り方・材木の渡し方も携帯で読めるようにする。今の一件だけを出す。 */
      #hud.suno-view #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small:not(.goal-place):not(.obj-cue) {
        display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4;
      }
      /* 合図の説明は札を開いた時に読む。持ち場と守り方を先に残す。 */
      html body #hud.suno-view #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.obj-cue { display:none !important; }
      /* 気力は下端の中央へ。行き先と敵の間合いの札から離す。 */
      html.touch #hud.suno-view #staring { left:calc(50% - 32px); top:auto; bottom:calc(24px + env(safe-area-inset-bottom, 0px)); }
      html.touch #hud.suno-view #staring + .combat-cue-label {
        left:calc(50% - 4px) !important; top:auto !important; bottom:calc(24px + env(safe-area-inset-bottom, 0px));
      }
    }
  `;
  document.head.appendChild(layout); root.classList.add('suno-view');
  // 人物名だけを半行見せず、読みたい時に紹介を開く。共通の下知と釦は保つ。
  const intro = rt.hud.intro;
  rt.hud.intro = function (...args) {
    intro.apply(this, args);
    const reading = this.root.querySelector('#intro .intro-reading');
    const goal = reading.querySelector('p b');
    if (goal) goal.textContent = '勝つには：三度の寄せから柵を守り抜く';
    const people = reading.querySelectorAll('.intro-person, .intro-castle');
    if (!people.length) return;
    const toggle = document.createElement('button'), panel = document.createElement('div');
    toggle.type = 'button'; toggle.className = 'suno-people-toggle';
    toggle.textContent = '味方と砦の紹介を読む';
    toggle.setAttribute('aria-expanded', 'false');
    panel.id = 'suno-intro-people'; panel.hidden = true;
    toggle.setAttribute('aria-controls', panel.id);
    for (const person of people) panel.appendChild(person);
    toggle.onclick = () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      toggle.textContent = panel.hidden ? '味方と砦の紹介を読む' : '紹介を閉じる';
    };
    reading.append(toggle, panel);
  };
  const dispose = rt.dispose.bind(rt);
  rt.dispose = () => {
    rt.hud.intro = intro;
    document.getElementById('rain-mark')?.classList.remove('suno-rain');
    root.classList.remove('suno-view', 'suno-death', 'suno-choice-folded', 'suno-last'); layout.remove(); dispose();
  };
}

// 外から建物へ入る視線は軒・柱の手前で止める。室内からの視線は既存の壁判定へ任せる。
function fortView(rt) {
  const W = rt.world, boxes = [];
  const put = (x, z, rot, w, d, low, top, roof, struct = null, closed = false) => {
    boxes.push({ x, z, c: Math.cos(rot), s: Math.sin(rot), hw: w / 2, hd: d / 2, low, top, roof, struct, closed });
  };
  for (const p of [MAIN_SHED, ...SHEDS]) {
    const y = W.heightAt(p.x, p.z) + .14;
    put(p.x, p.z, p.rot, p.w + .7, p.d + .6, y, y + 2.15 + (p.w / 2 + .35) * .25 + .25, y + 1.95, p === MAIN_SHED ? rt.flags.hut : null, true);
  }
  for (const t of rt.flags.C.towers) {
    const y = W.heightAt(t.x, t.z);
    put(t.x, t.z, t.naka.rot, 4, 4, y, t.topY + 2.5, t.topY + 1.95);
    sunoLookoutTrim(t, t.topY - y);
    sunoNearFrame(t.mesh);
    t.mesh.traverse((m) => { if (m.geometry) m.userData.camBlock = true; });
  }
  if (true) {
    const y = W.heightAt(0, FORT);
    // 門の上は通り抜けられる室内ではない。視点が板壁へ入った時も押し戻す。
    put(0, FORT - .65, 0, 7.4, 3.3, y + 3.44, y + 5.5, y + 4.75, null, true);
  }
  W.nonWalkSurface = (x, z, y) => {
    for (const b of boxes) {
      if (b.struct && !b.struct.alive) continue;
      const dx = x - b.x, dz = z - b.z;
      if (y >= b.roof && Math.abs(dx * b.c - dz * b.s) <= b.hw && Math.abs(dx * b.s + dz * b.c) <= b.hd) return true;
    }
    return false;
  };
  W.cameraBlockFraction = (from, to) => {
    let nearest = null;
    for (const b of boxes) {
      if (b.struct && !b.struct.alive) continue;
      const x = from.x - b.x, z = from.z - b.z;
      const fx = x * b.c - z * b.s, fz = x * b.s + z * b.c;
      const dx = to.x - from.x, dz = to.z - from.z;
      const vx = dx * b.c - dz * b.s, vz = dx * b.s + dz * b.c;
      // 物見の室内は実際の壁で判定する。戸を塞いだ小屋は、肩の視点が内側へ
      // 入っても省かない。視点を本人へ寄せ、屋根と白い内壁が画面を覆うのを防ぐ。
      if (!b.closed && Math.abs(fx) <= b.hw - .55 && Math.abs(fz) <= b.hd - .5 && from.y >= b.low && from.y <= b.roof) continue;
      let enter = 0, exit = 1;
      for (let axis = 0; axis < 3; axis++) {
        const p = axis === 0 ? fx : axis === 1 ? from.y : fz;
        const v = axis === 0 ? vx : axis === 1 ? to.y - from.y : vz;
        const low = axis === 0 ? -b.hw - .3 : axis === 1 ? b.low - .3 : -b.hd - .3;
        const high = axis === 0 ? b.hw + .3 : axis === 1 ? b.top + .3 : b.hd + .3;
        if (Math.abs(v) < .00001) { if (p < low || p > high) { exit = -1; break; } }
        else { const a = (low - p) / v, c = (high - p) / v; enter = Math.max(enter, Math.min(a, c)); exit = Math.min(exit, Math.max(a, c)); }
      }
      if (enter <= exit && (nearest === null || enter < nearest)) nearest = enter;
    }
    // 結合した柵も、区画の線で視点を止める。破れ目と柵より上の視線は通す。
    for (const s of rt.flags.segs) {
      if (!s.alive || s.opened) continue;
      const [ax, az, bx, bz] = s.seg, sx = bx - ax, sz = bz - az;
      const vx = to.x - from.x, vz = to.z - from.z;
      const den = vx * sz - vz * sx;
      if (Math.abs(den) < .00001) continue;
      const dx = ax - from.x, dz = az - from.z;
      const t = (dx * sz - dz * sx) / den, along = (dx * vz - dz * vx) / den;
      if (t <= 0 || t >= 1 || along < -.05 || along > 1.05) continue;
      const x = from.x + vx * t, z = from.z + vz * t, y = from.y + (to.y - from.y) * t;
      const ground = W.heightAt(x, z);
      if (y < ground - .2 || y > ground + 2.6) continue;
      const hit = Math.max(0, t - .35 / Math.max(.35, Math.hypot(vx, to.y - from.y, vz)));
      if (nearest === null || hit < nearest) nearest = hit;
    }
    return nearest;
  };
}

// 折れた柵は盛り土の根を軸に、倒れ先の地面まで伏せる。墨俣の区画だけに適用する。
function sunoFenceFall(rt) {
  const tilt = rt.army.structTilt.bind(rt.army);
  rt.army.structTilt = (s, angle) => {
    if (angle > .16 && rt.flags.segs.includes(s)) {
      const [ax, az, bx, bz] = s.seg, len = Math.hypot(bx - ax, bz - az);
      if (!Number.isFinite(len) || len < 1e-6) return false;
      const x = (ax + bx) / 2, z = (az + bz) / 2, nx = -(bz - az) / len, nz = (bx - ax) / len;
      const sign = s.hitFrom ? Math.sign((s.hitFrom.x - x) * nx + (s.hitFrom.z - z) * nz) || 1 : 1;
      const drop = rt.world.heightAt(x - nx * sign * 2.1, z - nz * sign * 2.1) + .12 - rt.world.heightAt(x, z);
      if (!Number.isFinite(drop)) return false;
      const end = Math.acos(Math.max(-.4, Math.min(.4, drop / 2.1)));
      angle = .16 + (end - .16) * Math.min(1, (angle - .16) / 1.19);
    }
    return tilt(s, angle);
  };
}

// 墨俣専用の逆茂木。閉じた円柱で木の厚みを出し、削り面・枝・結び縄まで設営時にまとめる。
let sunoWoodMat, sunoRopeMat;
function sunoSakamogi(world, x, z, rot, len) {
  // 据え付けの芯と向きを少しずつずらす。通り道には張り出さない範囲。
  rot += (h01s(x, z + 19) - .5) * .32;
  // 逆茂木の列を定規で引いた縁にしない。口の幅は残し、列の奥行きだけずらす。
  const stagger = (h01s(x + 31, z) - .5) * 1.1;
  x += Math.sin(rot) * stagger; z += Math.cos(rot) * stagger;
  if (!sunoWoodMat) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#a18a69'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 64; i++) {
      const xx = h01s(i, 1) * 128;
      g.strokeStyle = i % 3 ? '#796348' : '#bc9f78'; g.lineWidth = 1 + h01s(i, 2) * 2;
      g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, 80, xx - 5, 170, xx + 2, 256); g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const xx = 12 + h01s(i, 3) * 104, yy = 20 + h01s(i, 4) * 216;
      g.strokeStyle = '#665039'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(xx, yy, 4, 11, .15, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(xx, yy, 1.5, 5, .15, 0, Math.PI * 2); g.stroke();
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    sunoWoodMat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1 });
    sunoRopeMat = new THREE.MeshStandardMaterial({ color: 0xb69a65, roughness: 1 });
  }
  const wood = [], rope = [], up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color(), quat = new THREE.Quaternion();
  const add = (geo, hex, list) => {
    if (list === wood) {
      color.setHex(hex);
      const a = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    list.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const log = (a, b, r0, r1, hex, bare = false) => {
    const d = new THREE.Vector3().subVectors(b, a), length = d.length();
    // 同じ端点の材は、向きを作らず省く。
    if (!Number.isFinite(length) || length < 1e-6) return;
    const geo = new THREE.CylinderGeometry(r1, r0, length, 8, 1, false);
    geo.translate(0, length / 2, 0); geo.applyQuaternion(quat.setFromUnitVectors(up, d.multiplyScalar(1 / length))); geo.translate(a.x, a.y, a.z);
    if (bare) geo.attributes.uv.array.fill(0);
    add(geo, hex, wood);
  };
  const n = Math.max(3, Math.round(len / .9));
  for (let i = 0; i < n; i++) {
    const q = h01s(x + i, z), r = .14 + q * .065;
    const a = new THREE.Vector3(-len / 2 + (i + .5) * len / n + (q - .5) * .28, .08 + q * .09, -.5 + q * .65);
    // 根を土に置き、枝先は腰より低く外へ向ける。柵の上に木の束が浮いて見えない高さ。
    const b = a.clone().add(new THREE.Vector3((h01s(i, x) - .5) * 1.3, .4 + h01s(i, z) * .6, 1.8 + h01s(x + i, z + 37) * 2));
    const d = b.clone().sub(a).normalize(), shoulder = b.clone().addScaledVector(d, -.42);
    const hex = [0x9c896f, 0xb19b7d, 0x88755e][Math.floor(h01s(x + i, z + 7) * 3)];
    log(a, shoulder, r, r * .8, hex);
    log(shoulder, b, r * .8, .008, 0xe0bd86, true);
    for (let k = 0; k < 3; k++) {
      const start = a.clone().lerp(shoulder, .3 + k * .21);
      const end = start.clone().add(new THREE.Vector3((k % 2 ? 1 : -1) * (.42 + q * .45), .2 + q * .25, .3 + q * .4));
      const neck = end.clone().lerp(start, .2);
      log(start, neck, .055, .035, hex); log(neck, end, .035, .003, 0xe0bd86, true);
    }
    const tie = a.clone().lerp(shoulder, .12);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.TorusGeometry(r + .016, .021, 4, 10);
      ring.rotateX(Math.PI / 2); ring.applyQuaternion(quat.setFromUnitVectors(up, d));
      const at = tie.clone().addScaledVector(d, (k - 1) * .05); ring.translate(at.x, at.y, at.z); add(ring, 0, rope);
    }
    const knot = new THREE.SphereGeometry(.055, 6, 4); knot.scale(1.4, 1, 1);
    knot.translate(tie.x + r, tie.y + .04, tie.z); add(knot, 0, rope);
  }
  log(new THREE.Vector3(-len / 2, .12, -.2), new THREE.Vector3(len / 2, .12, -.2), .1, .09, 0xa08a6c);
  for (let i = 0; i < n; i += 2) {
    const xx = -len / 2 + (i + .5) * len / n;
    log(new THREE.Vector3(xx, -.15, -.45), new THREE.Vector3(xx + .05, .45, -.4), .07, .04, 0xa08a6c);
  }
  const group = new THREE.Group();
  for (const [parts, mat] of [[wood, sunoWoodMat], [rope, sunoRopeMat]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), sunoNearMaterial(mat, true));
    for (const geo of parts) geo.dispose();
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  // 斜面でも支柱の根が浮かないよう、各頂点の地面の高さへ合わせる。
  const c = Math.cos(rot), sn = Math.sin(rot), ground = world.heightAt(x, z);
  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), pz = pos.getZ(i);
      pos.setY(i, pos.getY(i) + world.heightAt(x + px * c + pz * sn, z - px * sn + pz * c) - ground);
    }
    mesh.geometry.computeVertexNormals();
  }
  group.position.set(x, ground, z); group.rotation.y = rot;
  return group;
}

// 外の水堀の飾り：水際の乱杭・外の岸の低い杭柵・堀につないだ小舟。設営時に一つの形へまとめる（当たりは持たない）。
// 北の土橋と西の寄せ道の前は空ける。水堀の乱杭は戦国の城の堀の守りを参考にした遊びの補い。
function sunoMoatScenery(rt) {
  const W = rt.world, wood = [], up = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion(), color = new THREE.Color();
  const log = (a, b, r0, r1, hex) => {
    const d = new THREE.Vector3().subVectors(b, a), length = d.length();
    if (!(length > 1e-6)) return;
    const geo = new THREE.CylinderGeometry(r1, r0, length, 6, 1, false);
    geo.translate(0, length / 2, 0); geo.applyQuaternion(quat.setFromUnitVectors(up, d.multiplyScalar(1 / length))); geo.translate(a.x, a.y, a.z);
    color.setHex(hex);
    const c = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    wood.push(geo.toNonIndexed()); geo.dispose();
  };
  const open = (x, z) => (Math.abs(x) < 6 && z < -20) || (Math.abs(z) < 6 && x < -20);
  for (const h of HORI) {
    const P = h.pts;
    let bed = Infinity;
    for (const [x, z] of P) bed = Math.min(bed, W.heightAt(x, z));
    const water = bed + h.deep * .45;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      // 砦の側を向く法線
      let nx = -tz, nz = tx;
      if (nx * -ax + nz * -az < 0) { nx = -nx; nz = -nz; }
      for (let u = 1.2; u < len - .6; u += .75) {
        const x = ax + tx * u, z = az + tz * u, q = h01s(x * 1.7, z * 1.3);
        if (open(x, z)) continue;
        // 乱杭：砦の側の水際から外へ斜めに突き出す尖り杭。水面より上へ二・五メートルほど出し、始めの持ち場（砦の内）から柵越しに穂先の列が見える。
        const ix = x + nx * (2.4 + q * .6), iz = z + nz * (2.4 + q * .6);
        const g = Math.min(W.heightAt(ix, iz), water) - .25;
        const lean = .35 + q * .25, side = (h01s(x, z + 5) - .5) * .3;
        const top = new THREE.Vector3(ix - nx * lean + tx * side, Math.max(water, W.heightAt(ix, iz)) + 2.5 + q * .5, iz - nz * lean + tz * side);
        const base = new THREE.Vector3(ix, g, iz), neck = base.clone().lerp(top, .82);
        const hex = [0x6e5a42, 0x7d684d, 0x5d4b37][Math.floor(q * 3)];
        log(base, neck, .07 + q * .02, .06, hex); log(neck, top, .06, .005, 0xb39a72);
        // 外の岸の低い杭柵：一・五メートルごとの杭に横木を二本。
        const ox = x - nx * 4.6, oz = z - nz * 4.6;
        if (Math.round(u / .75) % 2 === 0) {
          const og = W.heightAt(ox, oz);
          log(new THREE.Vector3(ox, og - .2, oz), new THREE.Vector3(ox, og + 1.15 + q * .15, oz), .06, .045, hex);
        }
      }
      // 杭柵の横木：開いた口で切りながら、六メートルほどの材を継ぐ。
      for (let u = .8; u < len - 1; u += 6) {
        const e = Math.min(len - .6, u + 6.2), x0 = ax + tx * u - nx * 4.6, z0 = az + tz * u - nz * 4.6, x1 = ax + tx * e - nx * 4.6, z1 = az + tz * e - nz * 4.6;
        if (open(x0, z0) || open(x1, z1) || open((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        for (const hh of [.45, .95]) log(new THREE.Vector3(x0, W.heightAt(x0, z0) + hh, z0), new THREE.Vector3(x1, W.heightAt(x1, z1) + hh + .02, z1), .045, .045, 0x7a6448);
      }
    }
  }
  if (wood.length) {
    const geo = mergeGeometries(wood, false);
    for (const g of wood) g.dispose();
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, sunoNearMaterial(sunoWoodMat, true));
    mesh.castShadow = true; mesh.receiveShadow = true;
    rt.scene.add(mesh);
  }
  // 堀につないだ小舟：北と西の堀に三艘。水に浮かせ、舳先は堀の筋に沿わせる。
  for (const [x, z, rot] of [[-20, -31, Math.PI / 2 + .08], [-31, -18, .06], [20, -31, -Math.PI / 2 - .1]]) {
    const hz = HORI.find((h) => h.pts.some(([px, pz]) => Math.abs(px - x) < 40 && Math.abs(pz - z) < 40));
    let bed = Infinity;
    for (const [px, pz] of hz.pts) bed = Math.min(bed, W.heightAt(px, pz));
    rt.scene.add(kobune(x, bed + hz.deep * .45 - .12, z, rot, 5));
  }
}

// 足跡・木屑・籠・縄と、影を描かない画質でも残る接地の陰。設営時に二つの束へまとめる。
let sunoYardMat, sunoShadeMat;
function sunoWorkyard(rt) {
  const W = rt.world, parts = [], shades = [];
  sunoYardMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  sunoShadeMat ||= new THREE.MeshBasicMaterial({ color: 0x211c14, transparent: true, opacity: .18, depthWrite: false });
  const put = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const c = new THREE.Color(hex), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  const patch = (x, z, w, d, rot, hex, list = null) => {
    const g = new THREE.CircleGeometry(1, 8);
    // 土の縁を同じ楕円にしない。閉じ目の頂点は同じ半径に保つ。
    const rim = g.attributes.position;
    for (let i = 1; i < rim.count; i++) {
      const r = .72 + h01s(x + (i - 1) % 8, z) * .4;
      rim.setXY(i, rim.getX(i) * r, rim.getY(i) * r);
    }
    g.rotateX(-Math.PI / 2); g.scale(w, 1, d); g.rotateY(rot); g.translate(x, 0, z);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, W.heightAt(pos.getX(i), pos.getZ(i)) + (list ? .03 : .025));
    g.computeVertexNormals();
    // 地面の色は地形の陰と土の模様を通して暗く見える。同じ値の平らな板は日なたで白く浮くので、踏み土の濃さと赤みへ寄せる。
    if (list) { list.push(g.toNonIndexed()); g.dispose(); } else { const c = new THREE.Color(hex); put(g, c.setRGB(c.r * .5, c.g * .34, c.b * .22).getHex()); }
  };
  // 柵の根元の土は既存の杭と同じ束。こちらはその外に薄い陰を添える。
  for (const seg of rt.flags.segs) {
    const [ax, az, bx, bz] = seg.seg, len = Math.hypot(bx - ax, bz - az), rot = -Math.atan2(bz - az, bx - ax);
    for (let i = 0; i < Math.ceil(len); i++) {
      const t = (i + .5) / Math.ceil(len);
      patch(ax + (bx - ax) * t, az + (bz - az) * t, .72, .5, rot, 0, shades);
    }
  }
  // 逆茂木の支柱の下にも、地面に沿った土と陰を残す。
  for (let k = -2; k <= 2; k++) for (const [x, z, rot] of [[k * 7, -FORT - 5.5, 0], [-FORT - 5.5, k * 7, Math.PI / 2], [FORT + 5.5, k * 7, Math.PI / 2]]) {
    if (k === 0 && x < FORT) continue;
    for (let i = -2; i <= 2; i++) {
      const px = x + Math.cos(rot) * i, pz = z + Math.sin(rot) * i;
      patch(px, pz, .7, .48, rot, 0x66553d);
      patch(px, pz, .8, .65, rot, 0, shades);
    }
  }
  for (let i = 0; i < 52; i++) {
    const z = 12 - i * .45, x = (i % 2 ? .18 : -.18) + Math.sin(i * .22) * .24;
    patch(x, z, .09, .19, .1, i % 3 ? 0x675b46 : 0x8d7d5c);
  }
  // 柵ぎわの踏み残しと寄せ口の泥。中央の歩く線から外へ、湿った窪みと崩れた土塊を散らす。
  // 小物の二つの束へ含めるため、描く回数も当たりも増やさない。
  for (let i = 0; i < 48; i++) {
    const x = (h01s(i, 81) - .5) * 42, z = -12 - h01s(i, 83) * 16;
    if (Math.abs(x) < 2.6 || (Math.abs(x) < 4 && z > -16)) continue;
    patch(x, z, .3 + h01s(i, 85) * .75, .2 + h01s(i, 87) * .4, i * 2.39996,
      i % 3 ? 0x75664e : 0x524b39);
    if (true) {
      const clod = new THREE.DodecahedronGeometry(.06 + h01s(i, 89) * .08, 0);
      clod.scale(1.6, .45, 1); clod.rotateY(i * 2.39996);
      clod.translate(x, W.heightAt(x, z) + .015, z); put(clod, i % 2 ? 0x827155 : 0x65563f);
    }
  }
  // 普請と守備で往復した足場。土・草・凹凸が同じ踏み跡を読み、色の板を増やさない。
  // 柵の内外へ幅の違う跡を置き、整地した庭にも濃淡を残す。
  for (let i = 0; i < 38; i++) {
    const a = i * 2.39996, r = 3 + h01s(i, 43) * (FORT - 5);
    W.stampWear(Math.cos(a) * r, Math.sin(a) * r, .8 + h01s(i, 51) * 1.2, 48 + h01s(i, 53) * 55);
  }
  // 寄せ口から柵へ続く踏み荒らし。土の広がりと途切れた二筋の轍を既存の束へ入れる。
  // 地形の当たり・歩く速さは保ち、草の間に湿った土の濃淡だけを見せる。
  for (const side of ['n', 'w', 'e']) for (let i = 0; i < 22; i++) {
    const along = FORT + 1.5 + i * .67, bend = Math.sin(i * .31) * .6;
    const x = side === 'n' ? bend : (side === 'w' ? -along : along);
    const z = side === 'n' ? -along : bend;
    const rot = side === 'n' ? 0 : Math.PI / 2;
    W.stampWear(x, z, 1.1 + h01s(i, 61) * .8, 60 + h01s(i, 63) * 70);
    if (i % 3 === 0) patch(x, z, 1.5 + h01s(i, 31), .85, rot, i % 2 ? 0x756346 : 0x817153);
    for (const sign of [-1, 1]) {
      const offset = sign * (.65 + Math.sin(i * .17) * .12);
      patch(x + (side === 'n' ? offset : 0), z + (side === 'n' ? 0 : offset), .075, .3 + h01s(i, 17) * .2, rot, 0x655940);
    }
  }
  for (const [x, z] of [[-9, 7], [9, -10], [10, 4], [8, -14]]) {
    for (let i = 0; i < 14; i++) {
      const px = x + (h01s(i, x) - .5) * 3, pz = z + (h01s(i, z) - .5) * 2;
      const chip = new THREE.BoxGeometry(.06 + h01s(i, 8) * .05, .025, .12 + h01s(i, 9) * .2);
      chip.rotateY(i * 2.3); chip.translate(px, W.heightAt(px, pz) + .035, pz); put(chip, i % 2 ? 0xb39b70 : 0x8c7856);
    }
    // 縄の巻き束。小道には置かず、材木の脇へ寄せる。
    for (let i = 0; i < 3; i++) {
      const rope = new THREE.TorusGeometry(.23 + i * .055, .025, 4, 12); rope.rotateX(Math.PI / 2);
      rope.translate(x + 1.1, W.heightAt(x + 1.1, z + .5) + .04, z + .5); put(rope, 0xb5a078);
    }
    const yy = W.heightAt(x - 1.2, z + .4);
    const basket = new THREE.CylinderGeometry(.3, .21, .4, 8, 1, true); basket.translate(x - 1.2, yy + .2, z + .4); put(basket, 0x8f7751);
    for (let i = 0; i < 4; i++) {
      const rim = new THREE.TorusGeometry(.22 + i * .023, .018, 3, 8); rim.rotateX(Math.PI / 2);
      rim.translate(x - 1.2, yy + .05 + i * .11, z + .4); put(rim, 0xb19a6c);
    }
  }
  if (true) {
    // 写真の作事場のように、材の脇に低い馬と挽き割り板、掛矢を置く。
    // 中央の小道・人足の作業先・馬繋ぎを避け、既存の木屑と同じ束へ焼き込む。
    for (const [x, z, rot] of [[-9, 8.5, .15], [9, -12.7, -.2]]) {
      const y = W.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
      const box = (dx, yy, dz, w, h, d, col, tilt = 0) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.rotateZ(tilt); g.translate(dx, yy, dz); g.rotateY(rot); g.translate(x, y, z); put(g, col);
      };
      for (const dx of [-.85, .85]) {
        for (const side of [-1, 1]) {
          const g = new THREE.BoxGeometry(.1, .77, .12);
          g.rotateX(side * .3); g.translate(dx, .35, side * .27); g.rotateY(rot); g.translate(x, y, z); put(g, 0x65543f);
        }
        box(dx, .72, 0, .14, .13, .95, 0x78664c);
      }
      for (let k = 0; k < 3; k++) box(0, .83 + k * .095, (k % 2) * .045, 2.65 - k * .12, .085, .37, PLANK[k]);
      // 掛矢の木頭と柄。刃物の光沢や現代の金具は付けない。
      box(.45, 1.14, .07, .08, .075, .86, 0x9c875f);
      box(.45, 1.16, -.32, .44, .2, .22, 0x6c5338);
      patch(x, z, 1.7, .75, rot, 0, shades);
      // 作業馬の足元も既存の接地陰にまとめる。
      for (const dx of [-.85, .85]) patch(x + dx * c, z - dx * s, .22, .5, rot, 0, shades);
    }
  }
  const addMesh = (list, mat) => {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    for (const g of list) g.dispose();
    mesh.receiveShadow = true; rt.scene.add(mesh); return mesh;
  };
  addMesh(parts, sunoYardMat); addMesh(shades, sunoShadeMat);
  sunoTimberShelter(rt);
  // 持ち場は既存の札で示す。地面に現代の区画線を描かない。
}

// 南の街道脇の支度。砦の推定縄張りを変えず、補給路・寄せ口の外だけに置く。
// 写真の板囲い・木組みに倣った仮設の陣で、墨俣の遺構の再現ではない。
function sunoSupplyScenery(rt) {
  const W = rt.world;
  sunoYardMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const camp = new THREE.LOD();
  for (const coarse of [false, true]) {
    const parts = [];
    const put = (geo, col) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (g !== geo) geo.dispose();
      const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    };
    const ground = (x, z) => W.heightAt(x - 29, z + 77);
    const box = (x, y, z, w, h, d, col, tilt = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateX(tilt); g.translate(x, ground(x, z) + y, z); put(g, col);
    };
    // 風除けの麻布。下端を浮かせた三つの幕、出入りと街道側は大きく開ける。
    for (let k = 0; k < 3; k++) {
      const x = -5 + k * 3.1;
      box(x, 1.12, -3, .1, 2.4, .1, 0x69553d);
      const cloth = new THREE.PlaneGeometry(3, 1.35, coarse ? 1 : 6, coarse ? 1 : 3);
      const a = cloth.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const u = (a.getX(i) + 1.5) / 3;
        a.setXYZ(i, a.getX(i) + x + 1.5,
          a.getY(i) + ground(x + 1.5, -3) + 1.35 - Math.sin(u * Math.PI) * .16,
          -3 + Math.sin(u * Math.PI) * .16);
      }
      cloth.computeVertexNormals();
      // 表裏を同じ束へ入れ、専用の両面材や透過描画を増やさない。
      const back = cloth.clone(), idx = back.index;
      for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); }
      back.computeVertexNormals(); put(cloth, 0xb6a581); put(back, 0xa69779);
      if (!coarse) for (const dx of [.07, 2.93]) for (const y of [.78, 1.85]) {
        box(x + dx, y, -3, .12, .045, .18, 0x887454);
      }
    }
    box(4.3, 1.12, -3, .1, 2.4, .1, 0x69553d);
    // 片流れの葦葺き。板小屋と区別し、煮炊きの側と街道側は壁を作らない。
    for (const x of [-4.7, -.7]) for (const z of [-1.9, .8]) box(x, 1, z, .13, 2.15, .13, 0x68553d);
    for (const z of [-1.9, .8]) box(-2.7, 2.08 - (z + .55) * .19, z, 4.5, .14, .14, 0x584733);
    box(-2.7, 2.18, -.55, 4.7, .18, 3.4, 0x837752, .19);
    if (!coarse) {
      for (let k = 0; k < 18; k++) box(-4.93 + k * .26, 2.29, -.55, .055, .065, 3.4, k % 3 ? 0xa19469 : 0x655e42, .19);
      for (const z of [-1.7, -.4, .8]) box(-2.7, 2.35 - (z + .55) * .19, z, 4.7, .08, .09, 0x594d34);
      // 俵の傍らの水桶と、石を据えた竈。煙は既存の仕組み一筋だけ。
      for (const [x, z] of [[-3.8, 0], [-2.9, .1], [2.8, -.8]]) {
        const bucket = new THREE.CylinderGeometry(.3, .24, .5, 10, 1, true);
        bucket.translate(x, ground(x, z) + .25, z); put(bucket, 0x877351);
        for (const yy of [.09, .4]) {
          const hoop = new THREE.TorusGeometry(.27, .025, 3, 10);
          hoop.rotateX(Math.PI / 2); hoop.translate(x, ground(x, z) + yy, z); put(hoop, 0x504b38);
        }
      }
      for (let k = 0; k < 7; k++) {
        const a = k * Math.PI * 2 / 7, x = 1.4 + Math.cos(a) * .55, z = .8 + Math.sin(a) * .55;
        const stone = new THREE.DodecahedronGeometry(.23, 0);
        stone.scale(1.1, .8, 1); stone.translate(x, ground(x, z) + .15, z); put(stone, 0x615c4e);
      }
    }
    const pot = new THREE.SphereGeometry(.39, 8, 5, 0, Math.PI * 2, .35, Math.PI - .7);
    pot.scale(1, .85, 1); pot.translate(1.4, ground(1.4, .8) + .48, .8); put(pot, 0x39362f);
    const mesh = new THREE.Mesh(mergeGeometries(parts), sunoYardMat);
    for (const g of parts) g.dispose();
    mesh.receiveShadow = true;
    camp.addLevel(mesh, coarse ? 65 : 0);
  }
  camp.addLevel(new THREE.Group(), 180);
  camp.position.set(-29, 0, 77); rt.scene.add(camp);
  W.addSmokeColumn(-27.6, W.heightAt(-27.6, 77.8) + .65, 77.8, { size: .35 });
  // 南東の小さな刈田。畦の高さは足首以下、兵が通る中央や街道に物を立てない。
  const parts = [];
  const fieldBox = (x, z, w, d, h, col) => {
    const g = paint(new THREE.BoxGeometry(w, h, d), col);
    g.translate(x, W.heightAt(x, z) + h / 2, z); parts.push(g);
  };
  for (const [x, z] of [[18, 55], [37, 61]]) {
    for (const dx of [-7, 7]) for (let k = 0; k < 10; k++) fieldBox(x + dx, z - 9 + k * 2, .38, 2.05, .14, 0x746c4a);
    for (const dz of [-10, 10]) for (let k = 0; k < 7; k++) fieldBox(x - 6 + k * 2, z + dz, 2.05, .38, .14, 0x746c4a);
    for (let k = 0; k < 120; k++) {
      const px = x - 6 + h01s(k, x) * 12, pz = z - 9 + h01s(k, z) * 18;
      fieldBox(px, pz, .07, .12, .12 + h01s(k, 71) * .1, k % 3 ? 0x948454 : 0x6c6644);
    }
  }
  const fields = new THREE.LOD(), mesh = new THREE.Mesh(mergeGeometries(parts), sunoYardMat);
  for (const g of parts) g.dispose();
  mesh.receiveShadow = true; fields.position.set(28, 0, 58);
  mesh.geometry.translate(-28, 0, -58);
  fields.addLevel(mesh, 0); fields.addLevel(new THREE.Group(), 110); rt.scene.add(fields);
}

// 急ごしらえの板屋。入口は共通の引き戸で開閉する。設営時だけ組み、材質は使い回す。
let shedMat;
const PLANK = [0x7a6e5c, 0x6b604f, 0x857865, 0x726552];
const h01s = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
// 作事場の材を雨から守る片流れの板屋。柱は既存の材木の当たりの内に納める。
function sunoTimberShelter(rt) {
  const lod = new THREE.LOD(), rot = .2;
  for (const coarse of [false, true]) {
    const parts = [];
    const box = (x, y, z, w, h, d, col, tilt = 0) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      g.rotateX(tilt); g.translate(x, y, z);
      const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    };
    for (const x of [-1.8, 1.8]) for (const z of [-.52, .52]) {
      const h = 2.18 - z * .18;
      box(x, h / 2 - .08, z, .14, h + .16, .14, 0x655843);
      if (!coarse) {
        // 丸太置場の足元を空けたまま、桁を受ける横木と縄の巻き目を見せる。
        for (const yy of [h - .15, h - .1]) box(x, yy, z, .18, .027, .19, 0xa18b63);
      }
    }
    for (const z of [-.52, .52]) box(0, 2.18 - z * .18, z, 4.15, .15, .16, 0x514535);
    if (coarse) box(0, 2.3, 0, 4.65, .07, 2.4, 0x81745e, .178);
    else {
      for (const x of [-1.8, -.9, 0, .9, 1.8]) box(x, 2.25, 0, .09, .1, 2.42, 0x65543d, .178);
      for (let row = 0; row < 2; row++) for (let k = 0; k < 12; k++) {
        const z = row === 0 ? .55 : -.55;
        box(-2.3 + (k + .5) * 4.6 / 12, 2.33 - z * .18 + row * .025, z,
          4.6 / 12 - .008, .055, 1.35, PLANK[Math.floor(h01s(k, row + 41) * 4)], .178);
      }
      for (const z of [-.85, .1, .9]) box(0, 2.43 - z * .18, z, 4.72, .07, .085, 0x594c39, .178);
      // 挽き割った板を桁へ立て掛ける。中央の道や作業馬へは張り出さない。
      for (let k = 0; k < 3; k++) box(.65 + k * .24, .82, -.38, .21, 1.65, .055, PLANK[k], -.12);
    }
    lod.addLevel(shedMesh(parts), coarse ? 55 : 0);
  }
  lod.position.set(9, rt.world.heightAt(9, -10), -10); lod.rotation.y = rot;
  rt.scene.add(lod);
}
// 急造中の板屋を全面が風化した古屋にしない。新材と転用材を混ぜる外観上の補い。
// 岐阜県の地学案内の「丸太小屋程度」を参考にするが、材の新旧の割合は不明。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
const SUNO_NEW_PLANK = [0xb49a70, 0xa88d63, 0xbca37c, 0xad936b];
function sunoShedPlank(i, seed) {
  return seed < .72 ? SUNO_NEW_PLANK[i] : PLANK[i];
}
// 二枚の板戸は同じ形と木材を共用し、既存の引き戸の行列だけで動かす。
let sunoShedDoorGeometry;
function sunoShedDoorPanels(count) {
  if (!sunoShedDoorGeometry) {
    const parts = [];
    const box = (x, y, z, w, h, d, hex) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      g.translate(x, y, z);
      const c = new THREE.Color(hex), colors = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < colors.length; k += 3) {
        colors[k] = c.r; colors[k + 1] = c.g; colors[k + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
    };
    // 既存の戸の基準寸法へ納め、開閉時の幅・高さは共通の処理で合わせる。
    const edges = [-.45, -.18, .13, .45];
    for (let k = 0; k < edges.length - 1; k++) {
      const x = (edges[k] + edges[k + 1]) / 2, w = edges[k + 1] - edges[k];
      box(x, .9, 0, w - .006, 1.8, .06, sunoShedPlank(k, h01s(k, 3)));
      const h = .13 + h01s(k, 5) * .12;
      box(x, h / 2, .034, w - .016, h, .008, 0x584e3d);
    }
    for (const yy of [.33, 1.47]) box(0, yy, -.05, .9, .095, .04, 0x51412f);
    // 戸をまたぐ掛け桟にはせず、各戸の手掛かりを木で添える。
    box(.3, .98, .06, .08, .2, .06, 0x51412f);
    sunoShedDoorGeometry = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
  }
  shedMat ||= castleMat('wood');
  const mesh = new THREE.InstancedMesh(sunoShedDoorGeometry, sunoNearMaterial(shedMat), count);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return [mesh];
}
function fortShed(rt, p, parts) {
  const y = rt.world.heightAt(p.x, p.z) + .14, H = 2.15;
  const kind = p.name === '材木の蔵' ? 'lumber' : p.name === '兵糧小屋' ? 'granary'
    : p.name === '南門の番所' ? 'bansho' : p.kind === 'nagaya' ? 'nagaya' : 'workshop';
  const I = addInterior(rt.world, { name: p.name, kind, profile: 'toride', x: p.x, z: p.z, rot: p.rot, team: 0,
    levels: [{ y, w: p.w, d: p.d, h: H }], door: { w: 1.4, h: 1.9, sliding: 'itado', buildPanels: sunoShedDoorPanels },
    approach: { pad: .2, len: .8 }, hasExterior: true, entryFire: false,
    wins: () => [{ face: 'z', s: -1, t: 0, w: 1.1, y0: .95, y1: 1.7 },
      ...[-1, 1].map((s) => ({ face: 'x', s, t: 0, w: 1.1, y0: .95, y1: 1.7 }))],
  });
  let roofTurn = 0;
  const box = (x, yy, z, w, h, d, hex, tilt = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateZ(tilt); g.translate(x, yy, z); g.rotateY(p.rot + roofTurn); g.translate(p.x, y, p.z);
    const color = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = color.r; a[k + 1] = color.g; a[k + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  const stone = (x, yy, z, r) => {
    const g = new THREE.DodecahedronGeometry(r, 0); g.scale(1.3, .6, 1); g.rotateY(x * 3 + z); g.translate(x, yy, z); g.rotateY(p.rot + roofTurn); g.translate(p.x, y, p.z);
    const c = new THREE.Color(0x7d7a70).multiplyScalar(.8 + h01s(x, z) * .35), a = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  // 細い板を縦に並べ、戸口と明かり窓を外壁にも抜く。
  for (const face of ['z', 'x']) for (const side of [-1, 1]) {
    const len = face === 'z' ? p.w : p.d, off = (face === 'z' ? p.d : p.w) / 2 - .08;
    const holes = face === 'z' && side === 1 ? [{ t0: -.7, t1: .7, y0: 0, y1: 1.9 }]
      : [{ t0: -.55, t1: .55, y0: .95, y1: 1.7 }];
    for (const [a, b, low, high] of facePanels(len, H, holes)) {
      const n = Math.ceil((b - a) / .45), w = (b - a) / n;
      for (let k = 0; k < n; k++) {
        const t = a + (k + .5) * w;
        // 普請で運び込んだ新材を主に、灰茶の転用材を交ぜる。板ごとの濃淡も残す。
        const tone = sunoShedPlank((Math.floor(t * 7.3 + p.x * 3.1 + side * 5) % 4 + 4) % 4,
          h01s(t + p.x, p.z + side));
        if (face === 'z') box(t, (low + high) / 2, side * off, w - .006, high - low, .08, tone);
        else box(side * off, (low + high) / 2, t, .08, high - low, w - .006, tone);
        // 裾の泥と雨じみ。薄い板をまとめて描き、窓と戸口には重ねない。
        const stain = Math.min(high - low, .14 + h01s(t, p.z + side) * .25);
        if (low === 0) {
          if (face === 'z') box(t, stain / 2, side * (off + .045), w - .02, stain, .014, 0x625844);
          else box(side * (off + .045), stain / 2, t, .014, stain, w - .02, 0x625844);
        }
      }
    }
  }
  for (const x of [-p.w / 2 + .1, p.w / 2 - .1]) for (const z of [-p.d / 2 + .1, p.d / 2 - .1]) {
    box(x, H / 2, z, .22, H, .22, 0x65533e);
    for (const yy of [.45, H - .25]) for (let k = 0; k < 3; k++) box(x, yy + k * .035, z, .26, .025, .26, 0xb2a079);
  }
  // 土台（地に据えた太い角材）と、壁の上の桁。柱と横の材が前に出て、板壁の箱に見せない
  for (const side of [-1, 1]) {
    box(0, .09, side * (p.d / 2 - .08), p.w + .1, .18, .16, 0x3e3226);
    box(side * (p.w / 2 - .08), .09, 0, .16, .18, p.d + .1, 0x3e3226);
    box(0, H - .08, side * (p.d / 2 - .08), p.w + .2, .16, .18, 0x45372a);
    box(side * (p.w / 2 - .08), H - .08, 0, .18, .16, p.d + .2, 0x45372a);
  }
  for (const x of [-.78, .78]) box(x, .95, p.d / 2 - .08, .14, 1.9, .16, 0x51412f);
  box(0, 1.98, p.d / 2 - .08, 1.7, .16, .16, 0x51412f);
  // 二本の溝を持つ敷居と鴨居。動く板戸は naka_doors.js に任せる。
  for (const z of [p.d / 2 + .005, p.d / 2 + .105, p.d / 2 + .205]) {
    box(0, .025, z, 2.9, .05, .03, 0x51412f);
    box(0, 1.92, z, 2.9, .06, .03, 0x51412f);
  }
  if (true) {
    // 写真の長屋は長い壁の途中にも柱と貫が見える。戸口と窓は空けたまま木組みを出す。
    if (p.kind === 'nagaya') for (const side of [-1, 1]) {
      const z = side * (p.d / 2 + .015), bays = Math.ceil(p.w / 1.4);
      for (let k = 1; k < bays; k++) {
        const x = -p.w / 2 + k * p.w / bays;
        if (Math.abs(x) < .85) continue;
        box(x, H / 2, z, .14, H, .14, 0x594b39);
      }
      const spans = side > 0 ? [[-p.w / 2, -.8], [.8, p.w / 2]] : [[-p.w / 2, p.w / 2]];
      for (const [a, b] of spans) for (const yy of [.72, 1.85]) {
        box((a + b) / 2, yy, z + side * .075, b - a, .095, .075, 0x60503c);
      }
    }
    // 写真の番所の小さな明かり窓。裸の四角い穴にせず、木枠・縦格子・引き板を添える。
    // 戸口には置かず、室内が開けた三つの窓と同じ位置・幅を使う。
    for (const [face, side] of [['z', -1], ['x', -1], ['x', 1]]) {
      const off = (face === 'z' ? p.d : p.w) / 2 + .015;
      const frame = (t, yy, w, h, depth, col) => {
        if (face === 'z') box(t, yy, side * off, w, h, depth, col);
        else box(side * off, yy, t, depth, h, w, col);
      };
      for (const yy of [.94, 1.72]) frame(0, yy, 1.27, .09, .14, 0x51412f);
      for (const t of [-.59, .59]) frame(t, 1.33, .09, .86, .12, 0x51412f);
      for (const t of [-.36, -.12, .12, .36]) frame(t, 1.33, .035, .7, .055, 0x67553f);
      // 引き板は壁の上に寄せて開け、窓や兵の視線をふさがない。
      for (let k = 0; k < 3; k++) frame(.72 + k * .19, 1.33, .18, .71, .065, PLANK[(k + 1) % 4]);
    }
  }
  // 板葺きの番所・長屋。新旧の板を二段に重ね、押さえ木と小石で留める。
  // 高画質では写真の長屋と同じく長辺に棟を通す。壁・戸口・室内の向きは保つ。
  const longRidge = true && p.w > p.d;
  roofTurn = longRidge ? Math.PI / 2 : 0;
  const roofW = longRidge ? p.d : p.w, roofD = longRidge ? p.w : p.d;
  const half = roofW / 2 + .35, rise = half * .25, slope = Math.hypot(half, rise), RD = roofD + .6, ang = Math.atan(.25);
  for (const side of [-1, 1]) {
    const n = Math.ceil(RD / .5);
    if (true) {
      // 写真の板屋の軒下：屋根板を支える垂木を外壁から出す。
      // 棟の向きと一緒に回し、既存の建物の束に結合する。
      const rafters = Math.ceil(roofD / .65);
      for (let k = 0; k <= rafters; k++) {
        const z = -roofD / 2 + k * roofD / rafters;
        box(side * half / 2, H + rise / 2 - .18, z,
          slope + .09, .11, .09, PLANK[(k + 1) % 4], -side * ang);
        // 切り口だけ明るくし、軒の下面に等間隔の木口を見せる。
        box(side * (half + .025), H - .185, z, .035, .11, .09, 0x978367, -side * ang);
      }
      for (let row = 0; row < 2; row++) for (let k = 0; k < n; k++) {
        const f = (row + .5) / 2, z = -RD / 2 + (k + .5) * RD / n;
        // 新材と転用材のむら、軒側の濡れ色を既存の板の頂点色で出す。
        const seed = h01s(k + p.x * 3, row + p.z + side * 11);
        const tone = new THREE.Color(sunoShedPlank(Math.floor(seed * 4), seed))
          .multiplyScalar(row === 0 ? .84 + seed * .1 : .97 + seed * .07);
        box(side * half * (1 - f), H + rise * f - .08 + row * .035, z,
          slope / 2 + .13, .065, RD / n - .012,
          tone.getHex(), -side * ang);
      }
    } else {
      for (let row = 0; row < 4; row++) for (let k = 0; k < n; k++) {
        const f = (row + .5) / 4, z = -RD / 2 + (k + .5) * RD / n;
        box(side * half * (1 - f), H + rise * f - .12 + row * .045, z, slope / 4 + .16, .18, RD / n + .03, [0x796d4f, 0x8c7953, 0x695e48, 0x95825c][(k + row) % 4], -side * ang);
        if ((k + row) % 3 === 0) box(side * half * (1 - f), H + rise * f + row * .045, z, slope / 4 + .2, .04, RD / n * .7, PLANK[(k + row) % 4], -side * ang);
      }
    }
    for (const f of [.28, .58, .88]) {
      const bx = side * half * (1 - f), by = H - .2 + rise * f + .2;
      box(bx, by, 0, .1, .1, RD, 0x4a3e30);
      for (let q = 0; q < 5; q++) {
        const z = -RD / 2 + (q + .5 + (h01s(p.x + q, f) - .5) * .5) * RD / 5, r = .1 + h01s(q, p.z + f) * .08;
        stone(bx + side * .02, by + .1 + r * .5, z, r);
      }
    }
  }
  // 天井を張らない普請小屋。棟木・垂木を板葺きの下へ渡し、室内から小屋組が見える。
  box(0, H + rise - .27, 0, .18, .18, RD, 0x45372a);
  for (let z = -roofD / 2 + .2; z < roofD / 2; z += .6) for (const side of [-1, 1]) {
    box(side * half / 2, H + rise / 2 - .28, z, slope, .08, .09, 0x65533e, -side * ang);
  }
  // 妻の破風板（屋根の縁に沿った板）
  for (const zs of [-1, 1]) for (const side of [-1, 1]) box(side * half / 2, H + rise / 2 - .14, zs * RD / 2, slope + .1, .22, .06, 0x3e3226, -side * ang);
  if (true) {
    const gableN = Math.ceil(roofW / .4), gableStep = roofW / gableN;
    for (let k = 0; k < gableN; k++) {
      const x = -roofW / 2 + (k + .5) * gableStep;
      const h = Math.max(.05, rise * (1 - Math.abs(x) / half));
      for (const z of [-roofD / 2 + .08, roofD / 2 - .08]) box(x, H + h / 2 - .1, z, gableStep, h, .08, 0x6e604c);
    }
    box(0, H + rise + .02, 0, .16, .09, RD + .12, 0x514333);
  } else for (let x = -p.w / 2; x < p.w / 2; x += .4) {
    const h = Math.max(.05, rise * (1 - Math.abs(x + .2) / half));
    for (const z of [-p.d / 2 + .08, p.d / 2 - .08]) box(x + .2, H + h / 2 - .1, z, .4, h, .08, 0x6e604c);
  }
  return I;
}
function shedMesh(parts, fence = false) {
  // 木目と節のある板の材（城・砦の部品と同じ。色だけの板にすると、陰の面が紺の箱に見えた）
  shedMat ||= castleMat('wood');
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), sunoNearMaterial(shedMat, fence));
  // この材は近い面を半透明にしている。共通の点描を重ねず、壁のざらつきを防ぐ。
  mesh.material.userData.sunoSmoothNear = true;
  for (const g of parts) g.dispose();
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.camBlock = true;
  return mesh;
}

// 井楼の近景だけ、妻の小屋組と軒桁の継ぎ手を補う。
// 丸太小屋程度という地学案内を参考にした仮設の姿。実際の物見の構造は不明。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 縄張りの boarded: false に合わせ、追加部品でも下部を囲わず、中段の張り出しを作らない。
function sunoLookoutTrim(t, H) {
  const lod = t.mesh.children.find((m) => m.isLOD);
  if (!lod) return;
  const parts = [];
  const box = (x, y, z, w, h, d, col, tilt = 0, turn = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateZ(tilt); g.translate(x, y, z); g.rotateY(turn);
    const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  };
  for (const z of [-1.88, 1.88]) {
    box(0, H + 1.92, z, 3.55, .12, .13, 0x574733);
    box(0, H + 2.16, z, .12, .48, .12, 0x6a5841);
    for (const side of [-1, 1]) box(side * .96, H + 2.4 - .96 * Math.sin(.34), z,
      2.08, .15, .11, 0x504334, -side * .34);
  }
  // 板屋根を受ける軒桁。遠くは共通の粗い屋根だけを描く。
  for (const x of [-1.28, 1.28]) box(x, H + 1.94, 0, .14, .14, 3.94, 0x574733);
  // 上屋の桁の継ぎ手。共通井楼にある丸太の木口・縄を重ねず、角材の添え木と木栓だけ足す。
  // 桁より上の近景部品なので、南の梯子口と狭間には掛からない。
  for (const x of [-1.28, 1.28]) {
    box(x, H + 1.94, -.32, .19, .19, .46, 0x6d5d46);
    for (const z of [-.46, -.18]) {
      box(x + Math.sign(x) * .105, H + 1.94, z, .045, .055, .055, 0x9b896b);
    }
    // 妻側へ出た梁の木口は面だけ褪せさせ、短い割れを刻む。
    for (const z of [-1.975, 1.975]) {
      box(x, H + 1.94, z, .14, .14, .012, 0x8e7e64);
      box(x + .018, H + 1.935, z + Math.sign(z) * .008, .012, .065, .006, 0x514535);
    }
  }
  lod.levels[0].object.add(shedMesh(parts));
}

// 木曽川から材木を流したという築城伝承を、岸につないだ筏で示す。
// 参考：岐阜県観光連盟「豊臣 岐阜旅・墨俣一夜城」。史実の輸送路の復元ではない。
// https://www.toyotomi.kankou-gifu.jp/spot-sunomata.html
function sunoTimberRaft(rt) {
  const W = rt.world, raft = new THREE.Group();
  const logGeo = paint(new THREE.CylinderGeometry(.19, .22, 6.8, 8), 0x736048);
  const ropeGeo = paint(new THREE.CylinderGeometry(.035, .035, 1, 6), 0xa38b60);
  const wood = castleMat('wood'), rope = wood;
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const tie = (ax, ay, az, bx, by, bz) => {
    direction.set(bx - ax, by - ay, bz - az);
    const m = new THREE.Mesh(ropeGeo, rope);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.scale.y = direction.length();
    m.quaternion.setFromUnitVectors(up, direction.normalize());
    raft.add(m);
  };
  // 舟の上陸線と南門への道を空け、下流側の深みに浮かべる。橋にはしない。
  const x = 65, z = 40, y = W.def.water.level + .08;
  for (let i = -3; i <= 3; i++) {
    const log = new THREE.Mesh(logGeo, wood);
    log.rotation.x = Math.PI / 2;
    log.position.set(x + i * .4, y, z + (i % 2) * .13);
    log.castShadow = true; log.receiveShadow = true;
    raft.add(log);
  }
  for (const dz of [-2.1, 2.1]) {
    tie(x - 1.44, y + .2, z + dz, x + 1.44, y + .2, z + dz);
    tie(x - 1.44, y - .2, z + dz, x + 1.44, y - .2, z + dz);
    for (const side of [-1, 1]) tie(x + side * 1.44, y - .2, z + dz, x + side * 1.44, y + .2, z + dz);
  }
  tie(57, W.heightAt(57, z) + .1, z, x - 1.44, y + .2, z);
  rt.scene.add(raft);
}

// 南の通り幅六メートルを保った冠木門と、開放した仮設の物見。
// 岐阜県の地学案内は丸太小屋程度、大垣市は砦的な城と説明する。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// https://www.city.ogaki.lg.jp/0000000723.html
// 板壁と矢狭間で閉じた渡櫓を断定せず、普請中の木組みとして表す。
// この門・物見の存在や構造を示す史料はなく、遊びの補い。
function sunoGate(rt) {
  const W = rt.world;
  rt.scene.add(sunoNearFrame(kabukimon(W, 0, FORT, 6, 0, { doors: false })));
  const parts = [], y = W.heightAt(0, FORT);
  const box = (x, yy, z, w, h, d, col, tilt = 0, roll = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateX(tilt); g.rotateZ(roll); g.translate(x, yy + y, z + FORT);
    const c = new THREE.Color(col), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  // 写真の木造門の厚い板戸。両扉は柱の外側へ開き切り、六メートルの通りを保つ。
  // 足元は門柱の地盤に合わせ、内側の小屋・南門前の旗には重ねない。
  for (const side of [-1, 1]) {
    const x = side * 3.38, bottom = Math.max(.12,
      W.heightAt(x, FORT) - y + .1, W.heightAt(x, FORT - 2.85) - y + .1);
    const height = 2.85 - bottom;
    for (let k = 0; k < 9; k++) {
      const z = -(k + .5) * 2.85 / 9;
      box(x, bottom + height / 2, z, .12, height, 2.85 / 9 - .008, PLANK[(k + 2) % 4]);
      box(x + side * .066, bottom + .12, z, .014, .24, 2.85 / 9 - .02, 0x574b3b);
    }
    for (const yy of [bottom + .3, (bottom + 2.85) / 2, 2.6]) {
      box(x + side * .09, yy, -1.425, .1, .14, 2.95, 0x51412f);
    }
    for (const z of [-.08, -2.77]) box(x, (bottom + 2.85) / 2, z, .18, height + .08, .14, 0x51412f);
    // 蝶番の帯は黒鉄を鈍い茶黒で表す。扉と同じ束なので描画は増えない。
    for (const yy of [bottom + .35, 2.55]) box(x - side * .08, yy, -.2, .045, .1, .45, 0x39332b);
  }
  // 渡櫓の奥にも地面から柱を立てる。六メートルの通りの外で床下の梁を受ける。
  for (const x of [-3.2, 3.2]) {
    const bottom = W.heightAt(x, FORT - 1.6) - y - .12;
    box(x, (bottom + 3.55) / 2, -1.6, .28, 3.55 - bottom, .28, 0x514333);
    box(x, 3.36, -.65, .32, .26, 2.7, 0x45372a);
  }
  // 写真の門を見上げた時の横架材。厚い一枚の床を、梁・根太・敷板に分ける。
  // 下端は既存の冠木より上に収め、通りの高さは変えない。
  for (const z of [-1.55, .25]) box(0, 3.35, z, 7.05, .3, .24, 0x45372a);
  for (let k = 0; k < 9; k++) box(-3.2 + k * .8, 3.47, -.65, .12, .18, 2.2, 0x62513c);
  for (let k = 0; k < 18; k++) box(-3.45 + (k + .5) * 6.9 / 18, 3.6, -.65,
    6.9 / 18 - .008, .1, 2.1, PLANK[(k + 1) % 4]);
  for (const x of [-3.2, 0, 3.2]) {
    for (const z of [-1.6, .3]) box(x, 4.18, z, .18, 1.4, .18, 0x514333);
  }
  // 閉じた板壁・矢狭間は設けず、手すりと筋交いで物見の足場を支える。
  // 屋根・敷板・垂木の細部は残し、通路の幅・高さと兵の当たりは保つ。
  // 部品は既存の頂点色の束へ結合し、毎コマの処理や材質は増やさない。
  for (const z of [-1.62, .32]) {
    for (const yy of [3.86, 4.5]) box(0, yy, z, 6.6, .12, .12, 0x51412f);
    for (const side of [-1, 1]) box(side * 1.6, 4.2, z,
      Math.hypot(3.02, .9), .12, .12, 0x68563e, 0, side * Math.atan2(.9, 3.02));
    box(0, 4.83, z, 6.9, .14, .16, 0x514333);
  }
  for (const x of [-3.3, 3.3]) {
    for (const yy of [3.86, 4.5, 4.83]) box(x, yy, -.65, .12, .12, 1.98, 0x51412f);
    box(x, 4.2, -.65, .12, .12, Math.hypot(1.72, .9), 0x68563e, -Math.atan2(.9, 1.72));
  }
  for (const side of [-1, 1]) {
    // 軒裏の垂木と木口。屋根板のすぐ下へ納め、門の床下や六メートルの通路には出さない。
    for (let k = 0; k <= 9; k++) box(-3.45 + k * 6.9 / 9, 4.93, -.65 + side * .68,
      .095, .11, 1.72, 0x68563e, side * .3);
    // 棟から軒まで一枚の板にせず、上段が下段を覆う二段葺き。
    // 上下で継ぎ目を半枚ずらし、雨の入る一直線の隙間を作らない。
    for (let row = 0; row < 2; row++) {
      const q = row === 0 ? 1.05 : .3, yy = 5.04 + (.68 - q) * Math.tan(.3) + row * .045;
      for (let k = 0; k < 18 + row; k++) {
        const a = Math.max(-3.6, -3.6 - row * .2 + k * .4);
        const b = Math.min(3.6, -3.6 - row * .2 + (k + 1) * .4);
        box((a + b) / 2, yy, -.65 + side * q, b - a - .008, .065, .91,
          PLANK[(k + row + (side > 0 ? 1 : 0)) % 4], side * .3);
      }
    }
    // 板を留める押さえ木は屋根面に沿わせる。軒先には濡れた木口の細い帯。
    for (const q of [.42, 1.18]) box(0, 5.04 + (.68 - q) * Math.tan(.3) + (q < .5 ? .12 : .075),
      -.65 + side * q, 7.3, .085, .1, 0x584a36, side * .3);
    box(0, 5.04 + (.68 - 1.485) * Math.tan(.3) - .025,
      -.65 + side * 1.485, 7.2, .09, .065, 0x514638, side * .3);
  }
  box(0, 5.32, -.65, 7.4, .12, .16, 0x4a3e30);
  // 頭上の板壁も柵と同じく、目の前を塞ぐ中央の材だけ抜く。
  rt.scene.add(shedMesh(parts, true));
}

// 写真の塀沿いの細長い幟。織田の紋と風向きは共通部品から受け、墨俣の据え旗だけ細くする。
function sunoFortFlag(W, x, z) {
  const flag = nobori(W, x, z, 'oda', 5);
  flag.scale.x *= .68;
  return flag;
}

// 南門から街道の曲がり角を順に示す。点は使い回し、人足が近づいたら迎え先へ切り替える。
const SUPPLY_GUIDE = [[0, FORT + 5], [-18, 34], [-36, 44], [-62, 64], [-90, 86]];
function supplyGuidePoint(rt) {
  const F = rt.flags, ND = F.K, point = F.supplyGuidePoint;
  if (!ND?.count || ND.routed) return null;
  const pos = rt.player.u.pos;
  // 散らばった人足の平均点は空き地になる。実際に迎えられる一人へ案内する。
  // 少し近い人が横切るたびに印を飛ばさず、迎えたら次の人へ替える。
  let receiver = null, best = Infinity;
  for (const u of ND.units) {
    if (!u.alive || u.dying || u.gone || u.fleeing || u.woundOut || u.type !== 'porter' || u.saved) continue;
    const d = Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z) - (u === F.supplyReceiver ? 2 : 0);
    if (d < best) { receiver = u; best = d; }
  }
  F.supplyReceiver = receiver;
  if (!receiver) return null;
  const x = receiver.pos.x, z = receiver.pos.z;
  let i = F.supplyGuideI;
  while (i < SUPPLY_GUIDE.length && Math.hypot(pos.x - SUPPLY_GUIDE[i][0], pos.z - SUPPLY_GUIDE[i][1]) < 6) i++;
  F.supplyGuideI = i;
  if (z > FORT && Math.abs(pos.x) < FORT && Math.abs(pos.z) < FORT) i = 0;
  else while (i < SUPPLY_GUIDE.length && Math.hypot(x, z - FORT) < Math.hypot(SUPPLY_GUIDE[i][0], SUPPLY_GUIDE[i][1] - FORT) + 8) i++;
  F.supplyGuideAt = i;
  point.x = i < SUPPLY_GUIDE.length ? SUPPLY_GUIDE[i][0] : x;
  point.z = i < SUPPLY_GUIDE.length ? SUPPLY_GUIDE[i][1] : z;
  return point;
}

// 寄せの頭：柵の内の守り（織田の兵）が厚い側を避ける。道の長さ・口の狭さに揺らぎを掛けて選ぶ（siege_ai.js の chooseRoute）
function pickYose(rt, prefer) {
  const thick = (r) => {
    let n = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 0 && Math.hypot(u.pos.x - (r.yose.x + r.dir.x * 20), u.pos.z - (r.yose.z + r.dir.z * 20)) < 14) n++;
    return 1 + n * 0.35 + (prefer && prefer !== r.id ? 0.6 : 0);
  };
  const routes = Object.values(YOSE).map((r) => ({ ...r, defThickness: thick(r) }));
  return YOSE[(chooseRoute(routes, Math.random) || YOSE.kita).id];
}
// 斎藤の寄せの備：本物は波の組をそのまま預け（adoptGroup）、後ろに続く数百は軽い大軍（名目の数）で見せる
function yoseButai(rt, g, o) {
  const at = { x: o.at.x - o.dir.x * 14, z: o.at.z - o.dir.z * 14 };
  const b = makeButai(rt, { name: o.name, general: o.general, team: 1, faction: 'saito', kind: 'ashigaru', nominal: g.count + o.back, real: 0, lightWidth: 16, lightDepth: 14, at, facing: Math.atan2(o.dir.x, o.dir.z), armor: o.armor || 0x3a3a30, flag: 'saito' });
  adoptGroup(b, g);
  b.light.army.team = 1;
  b.light.army.jinkeiGuard = true;
  // 既存の後続を寄せ口の後ろへ詰める。本物への切替はせず、人数と攻撃の段取りを保つ。
  const d = Math.max(0, Math.hypot(at.x, at.z) - FORT - 22);
  b.push = () => { if (b.light && d > 0 && g.count && !g.routed) b.light.advance(d, d / 1.6); };
  return b;
}
// 竹束を押して寄せ場までゆっくり進み、着いたら柵へ取り付く（kaito 10/1「攻め手は竹束を押してゆっくり寄せる」）
function yoseApproach(rt, g, r, side, n = 3) {
  if (!g.count || g.routed) return;
  const sp0 = g.speed;
  g.order = 'move'; g.dest = { x: r.yose.x + r.dir.x * 9, z: r.yose.z + r.dir.z * 9 }; g.speed = 2.2;
  g.onArrive = (gg) => { gg.order = 'assault'; gg.speed = sp0; gg.formation = 'yari'; gg.yariRanks = 3; gg.width = 6; gg.facing = Math.atan2(r.dir.x, r.dir.z); };
  g.assault = assaultFn(rt, side);
  const c = g.center();
  for (let k = 0; k < n; k++) addTaba(rt, c.x + r.dir.x * 3, c.z + r.dir.z * 3, 1, { van: g, dir: r.dir, off: (k - (n - 1) / 2) * 3.4, vanDist: 3, rot: Math.atan2(r.dir.x, r.dir.z) });
  // 寄せ場へ実際に着くまで隊列を保つ。時間だけで柵への突撃に切り替えない。
}

function buildFort(rt) {
  const W = rt.world;
  const segs = [];
  const nSegs = [];
  // 柵を一つの束へまとめる。土塁は歩く地形にあり、薄い別面を重ねない。
  // 二センチの土の面は地面と交差し、裾や区画の継ぎ目が三角にちらつく。
  const fb = makeSimpleBatch();
  const add = (ax, az, bx, bz, side, nx, nz) => {
    const s = rt.army.addStruct({ seg: [ax, az, bx, bz], side, nx, nz, hp: 240, maxHp: 240, team: 0, name: '柵' });
    s.mesh = palisade(W, s.seg, { batch: fb, mound: false, boardScreen: side === 's' || (side === 'e' && az > 0) }); // 盛り土は地形にある。木の材質の黒い帯を重ねない。
    if (!s.mesh.isBatchedPart) rt.scene.add(s.mesh);
    segs.push(s);
    if (side === 'n') nSegs.push(s);
  };
  const st = (FORT * 2) / 8;
  for (let i = 0; i < 8; i++) {
    const a = -FORT + i * st, b = a + st;
    add(a, -FORT, b, -FORT, 'n', 0, -1);
    add(-FORT, a, -FORT, b, 'w', -1, 0);
    add(FORT, a, FORT, b, 'e', 1, 0);
  }
  for (const [a, b] of [[-18, -13], [-13, -8], [-8, -3], [3, 8], [8, 13], [13, 18]]) add(a, FORT, b, FORT, 's', 0, 1);
  // 四隅は柵が直角に出会う所。角の内側で二つの柵にはさまれて進めなくなるのを防ぐため、角を斜めに削る
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(sx * (FORT - 0.9), sz * FORT, sx * FORT, sz * (FORT - 0.9), 'c', sx * 0.7, sz * 0.7);
  }
  // 墨俣の柵だけ近い面を透かす。区画の破損・修理の窓口は保つ。
  for (const [mat, list] of [...fb.byMat]) {
    fb.byMat.delete(mat); fb.byMat.set(sunoNearMaterial(mat, true), list);
  }
  finalizeSimpleBatch(rt, fb);
  sunoFenceFall(rt);
  // 完成した砦から始めない（spec 17〜24）：北の柵は普請の途中。北門（中央2区画）と、もう1区画は
  // まだ結っていない（alive=false・見た目は隠す＝assaultFn の「破れ目」と同じ扱いで、弱点として遊びに使える）
  segs.gate = [nSegs[3], nSegs[4]];
  segs.unfinished = [nSegs[2], nSegs[3], nSegs[4]];
  for (const s of segs.unfinished) { s.alive = false; s.mesh.visible = false; s.building = true; }
  return segs;
}

// 小屋や材木の中を作業先にしない。一区画に取り掛かる時だけ空いた足場を探す。
function sunoWorkPoint(s) {
  const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
  const rects = obstacleRects();
  for (const inset of [6, 8, 10, 12]) for (const along of [0, -2, 2]) {
    const x = Math.max(-FORT + 3, Math.min(FORT - 3, mx - s.nx * inset + s.nz * along));
    const z = Math.max(-FORT + 3, Math.min(FORT - 3, mz - s.nz * inset - s.nx * along));
    if (rects.some((o) => {
      const dx = x - o.x, dz = z - o.z;
      return Math.abs(dx * o.c - dz * o.s) < o.hw + 1 && Math.abs(dx * o.s + dz * o.c) < o.hd + 1;
    })) continue;
    if (SOLIDS.some((o) => o.k === 'c' && Math.hypot(x - o.x, z - o.z) < o.r + 1)) continue;
    return { x, z };
  }
  return { x: mx < 0 ? -6 : 6, z: 10 };
}

// 普請は実在の人足が持ち場へ着いてから進む。敵が迫れば作業を止める。
function finishBuild(rt, order, onDone, reinforce = false) {
  const F = rt.flags;
  if (!order.length || rt.over || F.ending || F.won) return;
  if (F.buildBusy) { if (!reinforce) F.buildPending = { order, onDone }; return; }
  F.buildBusy = true;
  let i = 0, worked = 0, point = null, retreatUntil = 0;
  const done = () => {
    F.buildBusy = false; F.workHands = false; F.workNotice = '';
    const wk = F.wk;
    wk.order = 'move'; wk.dest = F.workShelter || WORK_SHELTER;
    wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; };
    if (onDone) onDone();
  };
  const step = () => {
    if (rt.over || F.ending || F.won) { F.buildBusy = false; return; }
    const wk = F.wk;
    if (!wk || wk.routed || !wk.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget)) {
      F.buildBusy = false;
      if (reinforce) { F.reinforcing = false; F.reinforceStopped = true; }
      return;
    }
    // 待つ間に直った区画を、もう一度結び直して期限を使わない。
    if (!reinforce) {
      while (i < order.length && order[i].alive) { i++; worked = 0; point = null; }
      if (i === order.length) { done(); return; }
    }
    // 最後の寄せが退き、破れ目が塞がったら、任意の補強より点検を先にする。
    if (reinforce && F.w3Clear && F.segs.every((seg) => seg.alive)) {
      F.buildBusy = false; F.workHands = false; F.workNotice = '';
      F.reinforcing = false; F.reinforcePending = false; F.reinforceStopped = true;
      return;
    }
    const s = order[i];
    // 北の補強で手が塞がっても、新たな破れ目の修理を後回しにしない。
    if (reinforce && F.segs.some((seg) => !seg.alive && !order.slice(i).includes(seg))) {
      F.buildBusy = false; F.workHands = false; F.reinforcing = false; F.reinforcePending = true;
      repairFort(rt); return;
    }
    point ||= sunoWorkPoint(s);
    F.buildPoint = point;
    const { x, z } = point;
    wk.order = 'move'; wk.dest = point; wk.speed = 1.4; wk.onArrive = null;
    let hands = 0, foe = false;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
      // 閉じた柵や小屋の向こうの控えだけで、普請を止め続けない。
      if (u.team === 1 && !u.group?.routed && Math.hypot(u.pos.x - x, u.pos.z - z) < 10 && !rt.army.wallBetween(u.pos, -1, point,
        (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) foe = true;
      // 作業先が安全でも、列の端の人足へ槍が届く。柵越しの槍も含め、実際の人足との間合いで先に退く。
      if (u.team === 1 && !u.group?.routed && !foe) for (const hand of wk.units) {
        if (!hand.alive || hand.gone || hand.fleeing || hand.woundOut) continue;
        if (Math.hypot(u.pos.x - hand.pos.x, u.pos.z - hand.pos.z) < 10 &&
            !rt.army.wallBetween(u.pos, -1, hand.pos, (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) { foe = true; break; }
      }
      if (u.group === wk && Math.hypot(u.pos.x - x, u.pos.z - z) < 8) hands++;
    }
    // 敵が近い間は、人足を柵ぎわに立たせたままにしない。小屋の南の陰へ下げ、槍の列の後ろで待たせる。
    // 十メートルの境目をまたぐたびに前へ戻さず、危険が去って三秒は退避を続ける。
    if (foe) retreatUntil = rt.t + 3;
    const retreating = rt.t < retreatUntil;
    if (retreating) { wk.dest = F.workShelter || WORK_SHELTER; wk.speed = 2.2; }
    F.workNotice = retreating ? '人足は退避中。破れ目で敵を止めよ' : hands < 2 ? '人足が柵へ向かう。道を空けよ' : '人足が柵を結んでいる。材木を渡せば早まる';
    sunoProgress(rt, 'gate', F.workNotice);
    if (F.sunoTask === 'rescue') sunoProgress(rt, 'rescue', F.workNotice);
    // 人足が結んでいる間は、掛矢で杭を打つ音が柵ぎわから聞こえる（普請が進んでいる事を画面の字に頼らず伝える）。
    F.workHands = !retreating && hands >= 2;
    if (F.workHands) { worked += F.buildStock > 0 ? 2 : 1; if (F.buildStock > 0) F.buildStock--; rt.army.play('knock', { x, z }, 0.55); rt.after(0.45, () => { if (!rt.over) rt.army.play('knock', { x: x + 1, z }, 0.4); }); }
    if (worked >= 5) {
      if (reinforce && !s.reinforced) { s.maxHp *= 1.25; s.reinforced = true; }
      // 倒れる途中の更新を外し、束ねた柵も元の姿へ戻してから見せる。
      if (rt.army.falling) rt.army.falling = rt.army.falling.filter((f) => f.s !== s);
      rt.army.structTilt(s, 0);
      s.wearLv = 0; s.tiltA = 0; s.knock = 0;
      s.alive = true; s.hp = s.maxHp; s.building = false; s.mesh.visible = true;
      if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
      rt.army.play('knock', { x, z }, 0.8);
      worked = 0; point = null; i++;
    }
    if (i < order.length) rt.after(1, step);
    else done();
  };
  step();
}

// 馬防柵：南北に長い柵を三重に。列の間は数メートル、ところどころに虎口（出入りの口）を空ける
// x0 が一列目（敵に近い側）、facing が敵の方向（+1 = x の正の向き）
export function buildBobosaku(rt, o) {
  const { x0, z0, z1, rows = 3, gap = 7, segLen = 6, gates = [], facing = 1, hp = 520 } = o;
  const out = [];
  const bb = o.noBatch ? null : makeSimpleBatch();
  if (bb) bb.mergeFence = true;
  for (let r = 0; r < rows; r++) {
    const x = x0 - facing * r * gap;
    const off = (r % 2) * segLen * 0.5;   // 列ごとに口の位置をずらす
    for (let z = z0 + off; z < z1 - 0.5; z += segLen) {
      const a = z, b = Math.min(z1, z + segLen);
      const mid = (a + b) / 2;
      // 虎口：口の位置（列ごとに半区画ずらす）を含む区画は結わない
      if (gates.some((g) => { const gz = g + (r % 2) * segLen * 0.5; return gz >= a && gz < b; })) continue;
      const bend = Math.sin(mid * 0.05 + r) * 1.2 + (Math.floor((mid + r * 7) / 24) % 2) * 1.1;   // まっすぐすぎない：折れと一段のずれ（A119）
      const s = addFieldFence(rt, [x + bend, a, x + bend, b - 0.9], { side: 'baboo', nx: facing, nz: 0, hp, team: 0, name: '馬防柵', row: r, horse: true, batch: bb });
      out.push(s);
    }
  }
  if (bb) finalizeSimpleBatch(rt, bb);
  return out;
}

// 壊れた柵だけを一区画ずつ直す。小屋の傷は声だけでは戻さない。
function repairFort(rt) {
  if (rt.flags.buildBusy) { rt.flags.repairPending = true; return; }
  rt.flags.repairPending = false;
  finishBuild(rt, rt.flags.segs.filter((s) => !s.alive), () => rt.say('人足', '破れた柵を結び直したぞ', 3));
}

// 普請を失った時は、自分の組も小屋を避けて南門へ退く。終わりの待ちにも退き先を残す。
function retreatFort(rt) {
  const warning = document.getElementById('rain-mark');
  if (warning) warning.hidden = true;
  rt.marker('retreat', { x: 0, z: FORT + 8 }, '南門の外へ退く', { h: 2.5, guideArea: 'retreat', guideRadius: 3 });
  for (const g of rt.squadGroups || []) {
    if (!g.count || g.routed) continue;
    const c = g.center();
    if (Math.abs(c.x) >= FORT || Math.abs(c.z) >= FORT) continue;
    const lane = c.x < 0 ? -6 : 6;
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0;
    g.path = [[lane, c.z], [lane, 10], [0, 10], [0, FORT + 8]];
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 0, z: FORT + 8 }; };
  }
}

// 砦内でまだ戦える敵だけを調べる。退く者を討ち尽くす条件にはしない。
function fortSafe(rt) {
  for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && Math.abs(u.pos.x) < FORT + 3 && Math.abs(u.pos.z) < FORT + 3) return false;
  return true;
}

// 北の寄せの間は、柵が結ばれても前野の槍列を持ち場の左右に残す。
// 西の寄せに替わった時だけ、西の持ち場へ戻る。
function gateWall(rt, on) {
  const F = rt.flags, g = F.ally;
  if (!g || !g.count || g.routed) return;
  if (on) {
    if (F.gateWallOn) return;
    F.gateWallOn = true;
    g.order = 'move'; g.dest = { x: 6, z: -FORT + 1.4 }; g.speed = 3;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 6, z: -FORT + 1.4 }; q.facing = Math.PI; q.formation = 'yari'; q.yariRanks = 2; q.width = 6; q.aggro = 6; };
    rt.say('前野長康', '北の柵に槍を並べるぞ。お主も左右の仲間と内から突け', 3.5);
  } else if (F.gateWallOn && !on) {
    F.gateWallOn = false;
    g.order = 'move'; g.dest = { x: -14, z: 2 }; g.speed = 2.6;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -14, z: 2 }; q.facing = -Math.PI / 2; q.width = 3; q.aggro = 5; };
  }
}

function assaultFn(rt, side) {
  const outside = { x: 0, z: 0 }, cands = [];
  let crowdTeam, crowdSeg, crowdCount;
  const countCrowd = (o) => { if (o.alive && o.team === crowdTeam && o.segTarget === crowdSeg) crowdCount++; };
  const farFromCorner = (s) => {
    const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
    return Math.min(Math.hypot(mx - FORT, mz - FORT), Math.hypot(mx - FORT, mz + FORT), Math.hypot(mx + FORT, mz - FORT), Math.hypot(mx + FORT, mz + FORT)) > 6;
  };
  return (u) => {
    const F = rt.flags;
    const goal = u._sunoAssaultGoal || (u._sunoAssaultGoal = { x: 0, z: 0 });
    const inside = Math.abs(u.pos.x) < FORT - 0.4 && Math.abs(u.pos.z) < FORT - 0.4;
    if (inside) {
      if (!F.hut.alive) return null;
      // 小屋を一度に打てるのは6人まで。あぶれた者は小屋のまわりで守り手と斬り合う（一息に焼け落ちないように）
      const hit = F.hutHit || (F.hutHit = []);
      for (let i = hit.length - 1; i >= 0; i--) if (!hit[i].alive || hit[i].gone || hit[i].fleeing || hit[i].woundOut || hit[i].noTarget || !hit[i].group || hit[i].group.routed || Math.hypot(hit[i].pos.x - F.hut.x, hit[i].pos.z - F.hut.z) > 7) hit.splice(i, 1);
      if (hit.includes(u)) return F.hut;
      if (hit.length < 6) { hit.push(u); return F.hut; }
      const foe = rt.army.nearestEnemy(u, 16);
      if (foe) { goal.x = foe.pos.x; goal.z = foe.pos.z; return goal; }
      const a = u.id * 2.4;
      goal.x = F.hut.x + Math.sin(a) * 7.5; goal.z = F.hut.z + Math.cos(a) * 7.5; return goal;
    }
    // 戦える先頭六人は遊び手の守る区画へ。欠けた列は同じ組の後続が埋める。
    const p = rt.player.u.pos;
    const guarding = rt.player.u.alive && !F.ending && !rt.over &&
      (side === 'n' ? Math.abs(p.x) < FORT - 5 && p.z < -FORT + 5 && p.z > -FORT
        : side === 'w' ? Math.abs(p.z) < FORT - 5 && p.x < -FORT + 5 && p.x > -FORT : false);
    let frontRank = u.slot;
    if (guarding && u.group) {
      frontRank = 0;
      for (const o of u.group.units) {
        if (o === u) break;
        if (o.alive && !o.dying && !o.gone && !o.fleeing && !o.woundOut && !o.noTarget) frontRank++;
      }
    }
    if (guarding && frontRank < 6) {
      // 各人の左右の位置から区画を選ぶ。同じ区画を選んでから端へ丸めると、端の兵が重なる。
      const lat = (frontRank - 2.5) * .75;
      // 四隅を避けた六区画の中へ、六人の列ごと収める。
      const edge = FORT - FORT / 4 - .3 - 2.5 * .75;
      const lateral = Math.max(-edge, Math.min(edge, side === 'n' ? p.x : p.z)) + lat;
      let front = null, distance = Infinity;
      for (const s of F.segs) {
        if (s.side !== side || !s.alive || !farFromCorner(s)) continue;
        const d = side === 'n' ? Math.abs((s.seg[0] + s.seg[2]) / 2 - lateral) : Math.abs((s.seg[1] + s.seg[3]) / 2 - lateral);
        if (d < distance) { front = s; distance = d; }
      }
      // 自分の行き先が破れ目なら、隣の杭へ押し込まず下の侵入の道を使う。
      if (front && distance <= FORT / 8) {
        goal.x = side === 'n' ? Math.max(front.seg[0] + .3, Math.min(front.seg[2] - .3, lateral)) : -FORT - 1.1;
        goal.z = side === 'n' ? -FORT - 1.1 : Math.max(front.seg[1] + .3, Math.min(front.seg[3] - .3, lateral));
        u.segTarget = front;
        // 柵を打つ長さだけで止まらず、守り手と突き合う所まで踏み込む。
        if (Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z) > .65) return goal;
        return front;
      }
    }
    // 破れ目があればそこから入る
    let gap = null, gd = 50;
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      outside.x = mx + s.nx * 2.5; outside.z = mz + s.nz * 2.5;
      if (d < gd && !rt.army.wallBetween(u.pos, -1, outside) && rt.world.walkable(outside.x, outside.z)) { gd = d; gap = s; }
    }
    if (gap) {
      const mx = (gap.seg[0] + gap.seg[2]) / 2, mz = (gap.seg[1] + gap.seg[3]) / 2;
      const out = (u.pos.x - mx) * gap.nx + (u.pos.z - mz) * gap.nz;
      const lat = Math.abs((u.pos.x - mx) * gap.nz - (u.pos.z - mz) * gap.nx);
      const step = out < 3 && lat < 2 ? -5 : 2.5;
      goal.x = mx + gap.nx * step; goal.z = mz + gap.nz * step; return goal;
    }
    if (u.segTarget?.alive) {
      rt.army.targetPoint(u.segTarget, u, outside);
      outside.x += u.segTarget.nx * 2; outside.z += u.segTarget.nz * 2;
      if (rt.army.wallBetween(u.pos, -1, outside)) u.segTarget = null;
    }
    if (!u.segTarget || !u.segTarget.alive) {
      // 角（袋小路）に近い柵は外す。角へ押し込まれて詰まるのを防ぐ（kaito 10/1：4m→6mに広げた。原因を測って・束の詰まり）
      cands.length = 0;
      for (const s of F.segs) if (s.alive && s.side === side && farFromCorner(s)) cands.push(s);
      if (!cands.length) for (const s of F.segs) if (s.alive && s.side === side) cands.push(s);
      if (!cands.length) return F.hut;
      // 柵は the 一区画に何人も詰めかけない（crowdOk は的が柵の時は数を絞らないので、ここで絞る。
      // 絞らないと、人気の一区画――たいてい角のすぐ隣――に皆が寄って、角の袋へ押し込まれて詰まる）
      let best = null, bd = Infinity;
      for (const s of cands) {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        outside.x = mx + s.nx * 2; outside.z = mz + s.nz * 2;
        if (rt.army.wallBetween(u.pos, -1, outside) || !rt.world.walkable(outside.x, outside.z)) continue;
        crowdTeam = u.team; crowdSeg = s; crowdCount = 0;
        rt.army.forNear(mx, mz, 3.2, countCrowd);
        if (crowdCount >= 7) continue;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      // 届く区画が混んでいても、届かない反対側の柵へ振り替えない。
      if (!best) for (const s of cands) {
        rt.army.targetPoint(s, u, outside); outside.x += s.nx * 2; outside.z += s.nz * 2;
        if (!rt.army.wallBetween(u.pos, -1, outside) && rt.world.walkable(outside.x, outside.z)) { best = s; break; }
      }
      u.segTarget = best;
    }
    if (u.segTarget) return u.segTarget;
    // 物見や堀に遮られた遠い兵にも、柵へ回る行き先を返す。空なら元の控えへ戻ってしまう。
    if (side === 'e') {
      goal.x = Math.max(FORT + 8, Math.min(52, u.pos.x)); goal.z = 3;
      if (Math.abs(u.pos.z - 3) < 3) goal.x = FORT + 3;
    } else if (side === 'n') {
      goal.x = 0; goal.z = u.pos.z < -FORT - 12 ? -FORT - 14 : -FORT - 3;
    } else {
      goal.x = u.pos.x < -FORT - 12 ? -FORT - 14 : -FORT - 3; goal.z = 0;
    }
    return goal;
  };
}

let sunoDem = null;
useTerrain('dem_sunomata', (data) => { sunoDem = data; });

// 古木曽川の短い合流区間。長良川と同じ水位でつなぎ、合流口に段差を作らない。
// 川筋は岐阜県の地学案内を参考にした補い。幅・深さ・水位の数値は遊びの設定。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 地面の南端は百八十メートル。合流口の中心まで外へ出すと、岸を掘れず水面だけが地図外でつながる。
// 下流側という関係を保ち、合流口を地面の内へ収める。東岸南端の寄せ列は川幅の外に残す。
// 東の流入部も両岸まで地面の内へ収める。旧配置では中心線が南端より外を走り、
// 東端で本流の幅の一部しか見えなかった。東岸の道の南端（百四十二メートル）を避け、
// 下流の合流口は保ったまま、幅三十二メートルの流れを東の地図外からつなぐ。
const SUNO_OLD_KISO = { pts: [[204, 164], [164, 164], [136, 170], [104, 176]], w: 16, depth: 1.8, level: -0.7 };
// 西の枝流れ。川床と岸の土色で同じ中心線を使い、草地が水際まで続かないようにする。
// 網目状だった川辺の表現上の補いで、当時の流路の復元ではない。
// 上流端を西の地面の外へ抜き、低地の途中から突然湧く水路にしない。浅瀬と寄せ手の通り道は保つ。
// 西の上流を直線の排水路にせず、低地を曲がる枝流れにする。
// 国土交通省「濃尾平野と洪水」の網目状の自然河川からの類推で、犀川の旧流路の復元ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 控えと寄せ道の間だけで曲げ、北の浅瀬・合流口・兵の持ち場は保つ。
const SUNO_WEST_BROOK = { pts: [[-188, -68], [-150, -62], [-116, -54], [-80, -48], [-30, -44], [30, -46], [60, -60], [68, -64]], w: 2.4, depth: 0.7, joinRiver: true, fords: [{ x: 0, w: 8 }] };
// 砦の北東を回る枝水路。水面と岸の砂泥・草の被覆で同じ川筋を参照する。
const SUNO_FORT_BROOK = { pts: [[30, -46], [42, -29], [56, -28], [64, -24]], w: 2.2, depth: .45, joinRiver: true };

// 砂泥の色と草の被覆に同じ岸を使う。色だけ替えると草の地表と草株が水際を覆ってしまう。
// 国土交通省の自然河川の説明を参考にした補いで、永禄年間の植生・裸地幅の復元ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
function sunoBrookBank(x, z) {
  if (z <= -76 || z >= -18 || x >= 62) return 0;
  // 一定幅の排水路のような帯を避け、陸側の砂泥と草の境だけを緩く変える。
  // 水際までの砂泥は保ち、従来の岸幅の内で収める。自然河川からの類推で、
  // 当時の岸の復元ではない。頂点色と草の設営だけに使い、川床と浅瀬は動かさない。
  const spread = 2.2 + .3 * Math.sin(x * .061 + z * .037) * Math.cos(z * .097 - x * .023);
  let t = z < -36 ? Math.max(0, Math.min(1,
    (SUNO_WEST_BROOK.w * spread - distToPolyline(x, z, SUNO_WEST_BROOK.pts)) / (SUNO_WEST_BROOK.w * (spread - 1)))) : 0;
  // 西の枝流れだけを塗ると、分岐した先が草色で途切れて見える。
  // 高画質の枝水路も湿った砂泥へつなぐ。川床・持ち場・兵の密度には触れない。
  if (x > 24) t = Math.max(t, Math.max(0, Math.min(1,
    (SUNO_FORT_BROOK.w * spread - distToPolyline(x, z, SUNO_FORT_BROOK.pts)) / (SUNO_FORT_BROOK.w * (spread - 1)))));
  return t * t * (3 - 2 * t);
}
function sunoRiverBank(x, z) {
  // 古木曽川の北岸も、川筋から岸幅いっぱいまで砂泥をなじませる。
  // 南百四十四メートルで切ると、岸の途中に直線の草の境が現れる。
  // 国土交通省の自然河川の説明（下記）からの補い。川床・水位・兵の足場は保つ。
  const oldKiso = x > 104 && z > 164 - SUNO_OLD_KISO.w * 2
    ? Math.max(0, Math.min(1, (SUNO_OLD_KISO.w * 2 - distToPolyline(x, z, SUNO_OLD_KISO.pts)) / SUNO_OLD_KISO.w)) : 0;
  // 改修前の網目状の川辺を、護岸のように平行な砂泥の帯にしない。
  // 国土交通省「濃尾平野と洪水」を参考にした補い。永禄年間の岸の復元ではない。
  // https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
  // 水際は固定し、陸側の砂泥と草の境だけを緩く蛇行させる。
  // 川床・舟の航路・兵の足場は動かさず、頂点色と草の被覆で同じ境を使う。
  const west = 50 + 2.5 * Math.sin(z * .047) + 1.2 * Math.sin(z * .113 + .8);
  const east = 118 + 1.4 * Math.sin(z * .039 + 1.7) + .6 * Math.sin(z * .097);
  const t = Math.max(oldKiso, Math.max(0, Math.min(1, (x - west) / (62 - west), (east - x) / (east - 112))));
  return t * t * (3 - 2 * t);
}

// 改修前の川を一様な深さの水路にしない。岸寄りと下流の中州を既存の地面へ盛る。
// 国土交通省「濃尾平野と洪水」：木曽三川は網目状につながっていた。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 砂州の位置・高さは地勢からの補いで、永禄年間の河床を復元した値ではない。
// 舟の横断線（南北二十メートル付近）・筏（南四十メートル）から離し、その付近の深みを残す。
// 下流だけに細い中州を補い、両側に深い流れを残す。岸へ続く渡し場にはしない。
// 中州は南百三十四〜百七十メートル。古木曽川の合流口・東岸の寄せ列とも重ねない。
// 国土交通省の網目状の自然河川からの類推で、この場所の中州を史実と断定しない。
// 既存の川床・砂泥色を使い、形・材質・毎コマの生成は加えない。
const SUNO_RIVER_BARS = [[69, -106, 8, 25], [104, 112, 6, 28], [85, 152, 6, 18]];
function sunoRiverBed(x, z, bed) {
  for (const [cx, cz, rx, rz] of SUNO_RIVER_BARS) {
    const across = (x - cx) / rx, along = (z - cz) / rz;
    const oval = across * across + along * along;
    if (oval < 1) {
      // 同じ対称な楕円の盛り土にせず、流れの向きに裾を偏らせ、水際へ緩いむらを付ける。
      // 上記の自然河川からの類推で、当時の砂州の形を断定するものではない。
      // 元の範囲の縁と頂部の高さを保つ。舟・筏・合流口の深みへは広げない。
      // 既存の地形頂点だけを使い、材質・描画数・毎コマの処理を増やさない。
      const q = oval + oval * (1 - oval)
        * (.28 * along + .18 * Math.sin(across * 3 + along * 2 + cx));
      bed = Math.max(bed, -2.6 + 2.7 * (1 - q) ** 2);
    }
  }
  return bed;
}

// 岐阜県の教材「濃尾平野の自然堤防帯」：細長い微高地に集落、背後の低地に水田。
// https://gakuen.gifu-net.ed.jp/~contents/mizubunka/html/01010211/01010211_nr01.html
// 南西の在所と刈田に限った地勢の補い。永禄年間の旧流路・高さの復元ではない。
// 範囲の縁で高さと傾きを滑らかに戻し、砦・寄せ口・舟着きの地面には届かせない。
function sunoLevee(x, z) {
  return Math.max(0, 1 - ((x + 106 - (z - 150) * .08) / 30) ** 2 - ((z - 150) / 60) ** 2) ** 2;
}
function sunoBackswamp(x, z) {
  return Math.max(0, 1 - ((x + 73) / 25) ** 2 - ((z - 150) / 45) ** 2) ** 2;
}
// 在所を南北へ向けた時の八枚の田に合わせた低地。共通の村は起伏が大きいと田を置かない。
// 刈田の面だけを低く均し、周囲四メートルで元の地面へ戻す。高さ・区画は遊びの補い。
function sunoFieldFloor(x, z) {
  const d = Math.max(-86 - x, x + 61, 120 - z, z - 181, 0);
  const t = Math.max(0, 1 - d / 4);
  return t * t * (3 - 2 * t);
}

// 西岸の控えは、中央の広場の外にいる。隊列の足場へ河畔林を重ねない。
// 配置済みの備えの幅・奥行きと槍先の余地を含む伐開範囲。陣跡の復元ではない。
// 木の総数・形・材質は保ち、設営時の植樹候補だけを周囲の林へ回す。
// 南の織田の控え二隊も伐開する。中央の広場だけでは、南門の後詰と
// 荷駄を支える隊列の中へ木が生える。人数・持ち場・寄せの筋は保つ。
// 河畔林のある低地を参考にした設営上の補いで、史実の陣地の復元ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 岸の六隊は九メートル進んで元へ退く。待機地だけでなく往復する足元も踏み土へつなぐ。
// 川辺の設営を表す地表の補いで、当時の陣跡・植生を確定するものではない。
// 配置と地表で同じ南北位置を使う。既存の頂点色と草の被覆だけを使い、兵と河床は保つ。
const SUNO_SHORE_RANKS = [-150, -90, -35, 22, 82, 142];
const SUNO_CAMP_CLEAR = [
  [-30, -150, 43, 19], [-120, -106, 28, 28], [-150, -12, 30, 16], [-128, 90, 20, 22],
  [-36, 100, 26, 16], [34, 104, 23, 12],
  // 西の林の寄せ手九人と物見七人も、幹と隊列が重ならない小さな待機地を取る。
  // 上記の河畔林からの類推。周囲の林は残し、史実の陣跡とは扱わない。
  // 既存の植樹除外・踏み土・草の被覆を共用し、兵の位置と人数は保つ。
  [-106, -26, 11, 10], [-142, 48, 11, 10],
  // 東岸の常駐する十隊も、草が茂ったままの地面に立たせない。
  // 西向きの備えは幅と奥行きが入れ替わる。実際に置いた隊列の範囲に合わせる。
  // 低湿な川辺の地表を参考にした補いで、史料に残る陣跡ではない。
  [146, -118, 9, 22], [146, -62, 22, 14], [146, -8, 9, 22],
  [146, 50, 22, 14], [146, 110, 22, 14],
  [180, -104, 22, 14], [180, -66, 16, 12], [180, -24, 20, 24],
  [180, 52, 22, 14], [180, 116, 22, 14],
  ...SUNO_SHORE_RANKS.map((z) => [122, z, 14, 10]),
];
function sunoCampClear(x, z) {
  for (const [cx, cz, rx, rz] of SUNO_CAMP_CLEAR) {
    // 横隊の隅にも槍と枝葉の余地を取る。外縁は丸め、林を升目に切らない。
    if (((x - cx) / rx) ** 4 + ((z - cz) / rz) ** 4 < 1) return true;
  }
  return false;
}

// 控えの足元は踏まれた湿り土と刈り残し。伐開した全域を裸地にはしない。
// この陣の地表を示す史料はなく、川辺で兵が待機する様子の補い。
// 地面の色と草の被覆だけで共用し、兵の足場・形・材質・毎コマの処理は増やさない。
function sunoCampWear(x, z) {
  // 東西の岸を分けて候補を絞る。地面と草の設営時だけ調べ、毎コマは扱わない。
  const east = x > 112;
  let wear = 0;
  for (const [cx, cz, rx, rz] of SUNO_CAMP_CLEAR) {
    if ((cx > 112) !== east || Math.abs(x - cx) >= rx * .72 || Math.abs(z - cz) >= rz * .72) continue;
    const q = ((x - cx) / (rx * .72)) ** 4 + ((z - cz) / (rz * .72)) ** 4;
    const t = Math.max(0, Math.min(1, (1 - q) * 2));
    wear = Math.max(wear, t * t * (3 - 2 * t));
  }
  return wear;
}

// 首巻の洲股修築と一夜城伝承を分ける。陣図そのものにも、伝承の人物と創作の配置を明記する。
const SUNOMATA_JIN = [
  battleJin('砦の守り（築城伝承）', 0, { x: 4, z: 2 }, Math.PI, [
    ['suKino', '本陣', '木下藤吉郎', 5, 4, 2, 'tokichiro.group', 'oda'],
    ['suMaeno', '西の柵', '前野長康', 11, -14, 2, 'ally', 'oda'],
    ['suHachi', '東の柵と舟着き', '蜂須賀正勝', 10, 13, 2, 'ally2', 'oda', 'hachisuka'],
    ['suSupply', '南門と普請の控え', '名は伝わらない', 170, -36, 100, 'jinSupply', 'oda'],
  ], '藤吉郎・小六・長康は築城伝承の人物。この持ち場の配置を示す同時代史料はない。人数は遊びの開始人数で、自分の組・人足・別の控えは含まない。史実の総勢は不明。'),
  battleJin('三方の寄せ（遊びの配置）', 1, { x: 180, z: -24 }, -Math.PI / 2, [
    ['suNorth', '北の寄せ手', '名は伝わらない', 200, -30, -150, 'jinNorth', 'saito', 'saito', 0],
    ['suWest', '西の寄せ手', '名は伝わらない', 140, -150, -12, 'jinWest', 'saito', 'saito', Math.PI / 2],
    ['suEast', '東岸の控え', '名は伝わらない', 100, 180, -66, 'jinEast', 'saito'],
    ['suHead', '東岸奥の控え', '名は伝わらない', 150, 180, -24, 'jinEnemyCamp', 'saito'],
  ], '北・西の寄せ手と東岸の控えは遊びの配置。ここに攻城用の陣地があったと確かめられたものではない。人数は遊びの開始人数で、他の控えと寄せ手は別。史実の総勢・指揮した将は不明。'),
];

// 在所の外の見物場所と退路。同じ道を地面にも描き、木や草で塞がない。
const SUNO_CIVILIAN_BANDS = [
  // 控えの東端（x=-47）と二十四メートル以上空ける。
  // x=-24 の道は列脇で二十三メートルとなり、民の警戒範囲に入り退路から逸れていた。
  // 稲架（x=-30）の東を通り、川の西岸より内側の刈田から南へ退く。
  { x: -36, z: 72, kinds: ['farmer', 'woman', 'child', 'elder'], route: [[-18, 92], [-18, 122], [-18, 172], [-18, 177.5]] },
  // 南西の騎馬の控えからも三十四メートル空け、村西の道の脇で見物する。
  // 西側の民は家並み越しに砦を見ず、村の北西にある西の寄せ道を見る。
  // 寄せ道には砦の柵がないため、二十八メートル手前で見通しの確認を打ち切らない。
  { x: -156, z: 132, watchAt: YOSE.nishi.far, watchTargetClearance: 0, kinds: ['townsman', 'merchant', 'monk', 'woman', 'child'], route: [[-162, 132], [-177.5, 132]] },
  // 家並みの東西の外で見物。家の中や北の荷駄道から逃げ始めない。
  // 南の控えの列端（南端は z=119）から三十四メートル以上離す。
  // z=150 では全員が配置時に除かれる。稲架の南、家並みの東から刈田沿いに退く。
  { x: -64, z: 160, kinds: ['farmer', 'woman', 'child'], route: [[-60, 170], [-60, 177.5]] },
  { x: -138, z: 150, watchAt: YOSE.nishi.far, watchTargetClearance: 0, kinds: ['farmer', 'woman', 'elder'], route: [[-156, 150], [-177.5, 150]] },
];

// 村西の見物は林の中へ向けず、寄せ道まで細い見通しを残す。
// 退路も道の線だけでなく家族がよけ合う畦幅を空ける。家や稲架の当たりはそのまま。
// 区間は設営前に一度だけ作り、植生の配置判定では数値だけを使う。
const SUNO_CIVILIAN_CLEAR = SUNO_CIVILIAN_BANDS.flatMap((b) => {
  const points = [[b.x, b.z], ...b.route], segments = [];
  for (let i = 1; i < points.length; i++) segments.push([points[i - 1], points[i], 4]);
  const at = b.watchAt ?? { x: 0, z: 0 };
  segments.push([points[0], [at.x, at.z], 7]);
  return segments.map(([a, p, width]) => ({ x: a[0], z: a[1], dx: p[0] - a[0], dz: p[1] - a[1],
    length2: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2, width2: width * width }));
});
function sunoCivilianClearing(x, z) {
  for (const s of SUNO_CIVILIAN_CLEAR) {
    const dx = x - s.x, dz = z - s.z;
    const t = s.length2 ? Math.max(0, Math.min(1, (dx * s.dx + dz * s.dz) / s.length2)) : 0;
    if ((dx - t * s.dx) ** 2 + (dz - t * s.dz) ** 2 < s.width2) return true;
  }
  return false;
}

const sunomata = {
  jinkei: SUNOMATA_JIN,
  // ---- 稲生の型（inou-standard）：右上は任務の一行・行き先はピン一本・敵は頭上の▼・大将は印 ----
  // 材木・手当て・人足を迎える寄り道と、その字の札は出さない。三度の寄せを柵の内で受ければ勝ち。
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  focusEnemySignOnly: true,
  noDodgeCard: true,
  hideGuideSteps: true, // 右上は一行だけ。「あと何歩」を足さない。
  noPlayerFoot: true, // 自分の足元の白い輪は出さない（稲生と同じ。ちらつきの元）。
  quietMiss: true, // 外れは音なし。当たりの音・よろけ・血しぶきだけで手応えを示す。
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || !!rt.flags.won || /討ち取|討死|勝|崩れ|守りきった|砦を残した/.test(t),
  missions: ['この はたを まもれ', 'このてきをたおせ', 'てきの大将をたおせ'],
  // 毎回いまの戦場から決める。討った・退けた瞬間に次の一行へ替わり、古い字を残さない。
  missionOf(rt) {
    if (sunomata.commanderTarget(rt)) return 2;
    const u = sunoNearestFoe(rt);
    return u && Math.hypot(u.pos.x, u.pos.z) < FORT + 35 ? 1 : 0;
  },
  missionHeading(rt) { return sunomata.missions[sunomata.missionOf(rt)]; },
  // 最後の寄せの大将が柵へ寄った時だけ、名と命の棒と大きな▼をその人へ。
  commanderTarget(rt) {
    const F = rt.flags, u = F.yoseBoss;
    if (F.wave !== 3 || F.won || F.ending || rt.over || !u?.alive || u.gone || u.fleeing || u.dying || u.woundOut) return null;
    return Math.hypot(u.pos.x, u.pos.z) < FORT + 30 ? u : null;
  },
  missionSignTarget(rt) { return sunomata.commanderTarget(rt) || (sunomata.missionOf(rt) === 1 ? sunoNearestFoe(rt) : null); },
  namedGuideTarget(rt) { return sunomata.commanderTarget(rt); },
  // 守る段は持ち場の柵へ（着いても残し、味方がそこへ集まる）。戦う段は一番近い残りの敵へ。
  missionPin(rt) {
    const F = rt.flags;
    if (F.won || F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.sunoPin || (F.sunoPin = { x: 0, z: 0, r: 5, hide: 5 });
    const me = rt.player.u.pos, stage = sunomata.missionOf(rt);
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.route = false;
    q.flagDestination = true; q.guardBoundary = false; q.guardFootRadius = .95;
    if (stage === 0) {
      const p = sunoPostPoint(rt);
      q.x = p.x; q.z = p.z; q.r = q.hide = 5;
      q.waiting = true; q.arrived = Math.hypot(me.x - p.x, me.z - p.z) < 5;
      // 持ち場の白い太い輪（半径五歩）は、地面を大きな弧で横切る線に見えた（10/28）。行き先は旗のピンだけで示す。
      return q;
    }
    const u = stage === 2 ? sunomata.commanderTarget(rt) : sunoNearestFoe(rt);
    if (!u) return null;
    // 届く敵は頭上の印だけ。柵や小屋が間にある時は、近くても通れる口へ回す。
    if (rt.player.inRange && rt.player.rangeCueTarget === u) return null;
    const route = F.sunoRoute || (F.sunoRoute = {
      x: 0, y: 0, z: 0, at: -1,
      capture: (_p, _inp, x, z) => {
        F.sunoRoute.x = x; F.sunoRoute.z = z; F.sunoRoute.y = rt.world.heightAt(x, z);
      },
    });
    if (rt.t >= route.at || route.unit !== u || Math.hypot(me.x - route.px, me.z - route.pz) > 1) {
      route.at = rt.t + .5; route.unit = u; route.px = me.x; route.pz = me.z;
      route.blocked = !localClear(rt.army, me, u.pos);
      route.x = u.pos.x; route.z = u.pos.z; route.y = u.pos.y;
      if (route.blocked) {
        sunomataWay(rt, null, route.capture, u.pos.x, u.pos.z, .5);
        // 南門までの途中にも小屋がある。まず選んだ口までの道をもう一段読む。
        if (!localClear(rt.army, me, route)) sunomataWay(rt, null, route.capture, route.x, route.z, .5);
        // 門を出た後も、北や反対側の敵へ柵を斜めに横切らず外周を回る。
        if ((Math.abs(me.x) >= FORT || Math.abs(me.z) >= FORT) &&
            (Math.abs(u.pos.x) >= FORT || Math.abs(u.pos.z) >= FORT) && !localClear(rt.army, me, route))
          sunoOuterGuide(rt, u.pos, route);
      }
      route.y = rt.world.heightAt(route.x, route.z);
    }
    q.x = route.blocked ? route.x : u.pos.x; q.z = route.blocked ? route.z : u.pos.z;
    q.r = q.hide = route.blocked ? .5 : 8;
    // 通れる直線でも、遠い相手までは同じ道の矢印をつなぐ。
    q.route = route.blocked || Math.hypot(me.x - u.pos.x, me.z - u.pos.z) > 8;
    q.enemy = !q.route; q.unit = q.route ? null : u;
    return q;
  },
  routeFootsteps: true,
  // 砦にいる本人を使う。名の確かでない敵将や、台本外の寄せは増やさない。
  taisho: { a: { name: '木下藤吉郎', use: true }, b: null },
  noTaishoRaid: true,
  botOrders: true, // 柵の内での守り・南門への回り道・深手の退避を遊び手の突進で上書きしない。
  noWake: true, // 遠景の控えは軽い姿で保つ。実際に戦うのは開戦時から置いた三度の寄せと舟の兵。
  noReserve: true, // 共通の補充で台本外の新しい寄せを足さない。
  noDistantBattle: true, // 点呼に入らない飾りの軍勢を共通側で重ねない。
  // 共通の「前線の濃さ」は、控えの寄せ手を台本の外で砦へ送り、柵の内に物見を湧かせていた。寄せは三度の手と、日暮れの小さな波だけで決める。
  frontlineDensity: false,
  noRevive: true,
  // 最終の視線を使う。背中へ向かう線だけでは、正面の柵に視界を塞がれる。
  frameCamera(rt, pos, look) {
    const enemy = rt.army.missionMarkedEnemy;
    if (enemy?.alive) { SUNO_GOAL.value.copy(enemy.pos); SUNO_GOAL.value.y += enemy.mounted ? 2.2 : 1.4; }
    else SUNO_GOAL.value.copy(look);
    const dx = look.x - pos.x, dy = look.y - pos.y, dz = look.z - pos.z;
    const length = Math.hypot(dx, dy, dz);
    // 視点と注視点が重なる間は、直前の向きを保つ。
    if (Number.isFinite(length) && length > 1e-6) SUNO_FORWARD.value.set(dx / length, dy / length, dz / length);
  },
  keepCombatTask: true, keepTaskLabel: true, keepTaskWithDodge: true,
  // 構える札・材木を渡す札が出ても、守る場所と普請の下知を消さない。
  keepTaskWithGuard: true, keepTaskWithWork: true,
  // 接敵時も、守る人足と普請の下知を同じ欄に保つ。
  keepTaskPanel: true, keepApproachTaskPanel: true, keepCombatTaskHeading: true,
  keepTaskWithRain: true, keepCombatTaskDetail: true,
  // 出陣直後も指の絵に置き換えず、守る場所を知らせる。
  keepOpeningTaskLabel: true,
  // 柵際でも守る方角を残し、「近づく」の案内で柵外へ誘わない。
  keepGuardTaskLabel: true, keepDestinationTask: true, keepWaitOrderLabel: true,
  keepRescueTaskLabel: true,
  meleeGuide: sunoMeleeGuide,
  waitGuardAllowed: sunoMeleeGuide,
  meleeApproachLabel: () => '味方と並び、敵を待つ',
  releaseGuardForAttack: true,
  // 共通の歩数だけの札へ替えず、迎え・運搬・柵の守りの目的を残す。
  keepFlagTravelTask: true, keepFlagArrivalTask: true,
  namedGuideMarkers: true,
  travelGuideLabel: (rt) => sunomata.taskText(rt, '持ち場の印へ進む'),
  // 携帯の移動札も持ち場の名を保つ。回避先への直線歩数を「旗まで」と添えない。
  waitTravelLabel: (rt) => sunomata.taskText(rt, '持ち場の印へ進む'),
  guardTravelLabel: (rt) => sunomata.waitTravelLabel(rt),
  // 移動札の補足も、遠い敵へ向かわせず現在の持ち場に合わせる。
  guardPurposeText(rt) {
    const id = rt.missionGuide?.marker?.id;
    if (id === 'insideGuard' || id === 'workGuard') return '印の人足を守る';
    if (id === 'post0' || id === 'post3' || id === 'gateGuard')
      return '柵の内で守る';
    return '味方と並び、近い敵を止める';
  },
  hideEdgeGoalDistance: true,
  taskDetails: true,
  // 味方を空の人型で囲まず、頭上の丸で見分ける。見やすさを強める設定は残す。
  teamSignsOnly: true,
  // 甲冑と槍先を太い六角形で覆わず、狙う一人の四隅と頭上へ小さな印を添える。
  compactCombatGuides: true, compactEnemyFrame: true, compactFlagFrames: true,
  compactHoldGuide: true,
  // 近い視点でも守備・救援・回避の輪を小さく保ち、兵の手元を空ける。
  smallTaskAreas: true, smallRetreatAreas: true, compactFloorGuides: true,
  // 回避先の旗は残し、本人から画面端まで伸びる白線を短い案内にする。
  shortDodgeArrow: true, compactDodgeArrow: true,
  retreatLinkLength: 100, retreatArrowLength: 80,
  compactGuardGuide: true, compactDodgeGuide: true,
  // 短い長押しの説明を二行まで収め、命の札とは既存の八画素を空ける。
  dodgeActionHalfWidth: 116, dodgeActionHeight: 72,
  distanceUnit: 'steps',
  // 救援・運搬先も地面へ投影し、近くの兵の胴に大きな輪を重ねない。
  groundCombatMarkers: true,
  // 地面24点の通行・遮蔽を毎回調べず、既存の上限付きの足元の輪を使う。
  taskAreaFootRing: true,
  compactDestinationSign: true,
  avoidDestinationNotices: true,
  avoidMarkerNotices: true,
  treatmentTaskGuidance: true,
  woundRetreatNeeded: sunoWoundRetreatNeeded,
  keepRetreatReason: true, keepWoundRetreatReason: true,
  keepDodgeGuideLabel: true,
  treatmentGuideNeeded: sunoTreatmentNeeded,
  treatmentApproachLabel: '手当ての印まで下がれ',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentReady) return p.treating ? '手当てを押し続けよ' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '敵から離れ、味方の後ろへ';
    // まだ退き先へ届いていない人を、その場で待たせない。
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '手当ての印まで下がれ';
    if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    if (Math.hypot(p.u.vel.x, p.u.vel.z) >= .3) return 'ここで足を止め、傷を縛る';
    return '攻撃をやめ、手当ての支度を待て';
  },
  coverGuideLabel: '矢を避け、物陰へ下がれ',
  waitOrderLabel(rt, reached) {
    if (!rt.flags.ending && !rt.over && rainDanger(rt.army)) return sunoRainDuty(rt);
    if (!rt.flags.ending && !rt.over && sunoNeedsRetreat(rt)) return sunomata.taskText(rt, '');
    const id = rt.missionGuide?.marker?.id;
    if (id === 'returnGate') return '道の印から南門へ戻る';
    // 運搬・迎えの印を、北の守りへ読み替えない。
    if (id === 'woodPick' || id === 'woodDrop') return sunomata.taskText(rt, '');
    if (id === 'exitGate' || id === 'nida' || id === 'porterGuide') {
      if (id === 'exitGate' || rt.flags.supplyGuideAt === 0) return '真ん中の道から南門を出る';
      return reached && rt.flags.supplyGuideAt >= SUPPLY_GUIDE.length
        ? '人足のそばで敵を止め、南門へ迎える' : '道の印をたどり、人足を迎える';
    }
    if (rt.flags.sunoTask === 'rescue') return reached || !sunoSupplySafe(rt)
      ? '味方と並び、人足を守る' : '人足の前の印へ進む';
    if (rt.missionGuide?.marker?.id === 'workGuard')
      return reached ? '道を空け、人足を守る' : '柵を直す人足の印へ進む';
    return reached ? rt.flags.wave ? '柵の内で敵を槍で突く' : '柵の内で寄せを待つ'
      : '柵の内の印へ進む';
  },
  // 負傷時の退避を、普請の持ち場そのものと取り違えさせない。
  retreatGuideLabel(rt, reached) {
    if (rt.flags.ending) return reached ? '組をまとめて待て' : '南門の外へ退け';
    const cue = rt.hud.retreatGuide;
    // 深手でも、手当ての支度が済んだ時は退く命令で長押しの案内を消さない。
    if (cue?.active && cue.valid && cue.treatment)
      return sunomata.treatmentGuideLabel(rt, cue);
    if (reached && rt.player.sta < rt.player.maxSta * .6) return 'ここで息を整える';
    return reached ? '味方の後ろで構えよ' : '味方へ下がる';
  },
  // 古い持ち場や資材の印に案内を奪わせず、今見えている任務に合わせる。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.sunoTask === 'retreat') return 'retreat';
    if (sunoReturnPoint(rt)) return 'returnGate';
    // 担いだ材は近くに敵がいなければ渡し切る。遠い侵入で運搬先を消さない。
    const supplySafe = !sunoNeedsRetreat(rt) && sunoSupplySafe(rt);
    if (F.carryingWood && supplySafe) return 'woodDrop';
    if (F.sunoTask === 'rescue') return 'insideGuard';
    // 担いだまま接敵しても、まず柵の内で受ける。安全になれば同じ材を届ける。
    if (F.carryingWood) return F.wave === 3 ? 'post3' : 'post0';
    if (F.healMarked && !F.buildBusy) return 'heal';
    // 守備・普請の札が上にあっても、未配達なら切れ目に材へ案内する。
    // 物見や荷駄を迎える別任務の道筋は奪わない。
    if (!F.woodDelivered && supplySafe && (F.sunoTask === 'defend' || F.sunoTask === 'post' || F.sunoTask === 'gate') && sunoSupplyLull(rt)) return 'woodPick';
    // 材が届いた後は、持ち場の任務中も安全な合間に修理先を示す。
    if (F.woodDelivered && F.buildBusy && F.buildPoint && supplySafe &&
        (F.sunoTask === 'defend' || F.sunoTask === 'post' || F.sunoTask === 'gate') && sunoSupplyLull(rt)) return 'workGuard';
    if (F.sunoTask === 'defend' && F.wave === 1 && F.scoutDone) return 'exitGate';
    if (F.sunoTask === 'nida') return 'nida';
    if (F.sunoTask === 'porters') return 'porterGuide';
    if (F.sunoTask === 'post') return 'post3';
    if (F.sunoTask === 'gate') return 'gateGuard';
    if (F.sunoTask === 'defend') {
      // 寄せが退いた時の札は修理。古い守備位置へ案内し続けない。
      if (supplySafe && sunoSupplyLull(rt)) return F.woodDelivered && F.buildBusy && F.buildPoint ? 'workGuard' : '';
      return F.wave === 3 ? 'post3' : 'post0';
    }
    return '';
  },
  // 短い札にも、どこで何を守るかを残す。判定用の任務本文は変えない。
  taskText(rt, text) {
    const F = rt.flags, id = rt.missionGuide?.marker?.id;
    if (!F.ending && !rt.over && rainDanger(rt.army)) return sunoRainDuty(rt);
    if (!F.ending && !rt.over && sunoNeedsRetreat(rt)) {
      const cue = rt.hud.retreatGuide;
      if (cue?.active && cue.valid && cue.treatment) return sunomata.treatmentGuideLabel(rt, cue);
      return sunomata.retreatGuideLabel(rt, !!(cue?.active && cue.valid &&
        Math.hypot(cue.x - rt.player.u.pos.x, cue.z - rt.player.u.pos.z) < cue.radius));
    }
    if (id === 'returnGate') return '南門から砦へ戻る';
    if (id === 'exitGate') return '南門を出て人足を迎える';
    if (id === 'woodDrop') {
      const hand = sunoWoodDrop(rt);
      return hand && Math.hypot(rt.player.u.pos.x - hand.x, rt.player.u.pos.z - hand.z) < 3
        ? '材木を人足へ渡す' : '印の人足へ材木を運ぶ';
    }
    if (F.sunoTask === 'rescue') return '人足の前で敵を止める';
    if (id === 'woodPick') return '小屋の南西で材木を担ぐ';
    if (id === 'workGuard') return '柵を直す人足のそばで守る';
    if (id === 'nida' || id === 'porterGuide') return F.supplyGuideAt === 0
      ? '南門から人足を迎える'
      : F.supplyGuideAt < SUPPLY_GUIDE.length ? '道の印をたどり人足を迎える'
      : rt.missionGuide.distance < 6 ? '人足のそばで敵を止める' : '材木を担ぐ人足へ進む';
    if (F.sunoTask === 'defend' && F.woodDelivered && F.buildBusy && sunoSupplyLull(rt)) return '柵を直す人足を守る';
    if (id === 'post0' || id === 'post3' || id === 'gateGuard') {
      return !F.wave ? '柵の内で寄せを待つ' : '柵の内で敵を止める';
    }
    return text;
  },
  // 負傷時は移動と普請を同時に命じず、今の案内に合う補足を一つだけ出す。
  taskDetail(rt, title, progress) {
    const F = rt.flags, cue = rt.hud.retreatGuide;
    if (F.ending || rt.over) return progress;
    const limit = F.wave === 3 ? `日暮れまで${Math.max(0, Math.ceil(F.finishAt - rt.t))}秒。` : '';
    // 表示中の回避札ではなく、実際に届く敵の矢を見る。運搬中に古い説明を戻さない。
    if (rainDanger(rt.army)) {
      return limit + 'まず印へよける。その後、' + sunoRainDuty(rt) + '。' + sunoRepairDetail(rt, false);
    }
    if (cue?.active && cue.valid && cue.treatment)
      return limit + (rt.player.treatmentReady || rt.player.treating ? '「手当て」を三秒長押しして血を止めよ。' : '印に着いたら足を止め、攻撃をやめる。手当ての札が出たら三秒長押し。') + sunoRepairDetail(rt, false);
    if (sunoNeedsRetreat(rt))
      return limit + (rt.player.sta < 20
        ? cue?.active && cue.valid && Math.hypot(cue.x - rt.player.u.pos.x, cue.z - rt.player.u.pos.z) < cue.radius
          ? 'ここで構えを解き、息を整えよ。' : 'まず印まで下がれ。着いたら構えを解き、息を整えよ。'
        : '組と退き、敵を離してから守りへ戻れ。') + sunoRepairDetail(rt, false);
    if (rt.missionGuide?.marker?.id === 'returnGate')
      return limit + '閉じた柵を回り、南門を通れ。戻ったら持ち場の印へ。';
    if (rt.missionGuide?.marker?.id === 'exitGate')
      return '真ん中の道から南門を出よ。門外の道を守り、材木を運ぶ人足を迎えよ。';
    // 回避・退避では修理の補足を一度だけ作る。通常の命令文は必要な時に作る。
    // 材を運び切る案内中は、迎えや救援の説明を重ねない。
    // 行き先の選び方と同じ順で、今の長押し操作を知らせる。
    if (rt.missionGuide?.marker?.id === 'woodDrop') return limit + '印の人足のそばで「材木を人足へ渡す」を長押し。' + sunoRepairDetail(rt, false);
    if (rt.missionGuide?.marker?.id === 'woodPick')
      return limit + '小屋の南西の材木へ進み、「材木を担ぐ」を長押し';
    if ((F.sunoTask === 'nida' || F.sunoTask === 'porters') && F.supplyGuideAt === 0)
      return '真ん中の道から南門を出よ。門外の人足を迎え、道を守れ。';
    if (F.sunoTask === 'nida' || F.sunoTask === 'porters')
      return '人足は材木を担いで南門へ進む。そばの敵を止め、道を空けよ。';
    const repair = sunoRepairDetail(rt);
    if (!F.woodDelivered && (F.sunoTask === 'defend' || F.sunoTask === 'post' || F.sunoTask === 'gate') && !sunoSupplySafe(rt))
      return limit + '近い敵を止め、離れたら材木を運べ。' + repair;
    if (F.sunoTask === 'rescue')
      return limit + '味方と並び、近い敵を槍で止めよ。' + (repair || `人足${F.wk.count}人。`);
    if (F.sunoTask === 'defend' && sunoSupplyLull(rt) && F.buildBusy && F.woodDelivered)
      return limit + (repair || F.workNotice || '柵を直す人足を守り、道を空けよ');
    return progress || limit + repair;
  },
  // 回避中も砦の守りを忘れさせず、歩く操作と見回す操作を区別する。
  dodgeTurnLabel(rt, right, touch) {
    const side = right ? '右' : '左';
    return touch ? `画面を${side}へなぞって見回す` : `手元の操作器を${side}へ動かして見回す`;
  },
  dodgeMoveLabel: (rt, side) => `${side}へなぞってよける`,
  // 携帯の細い札でも、動作の途中で一文字だけ次の行へ送らない。
  dodgeActionText: '長押しでよける',
  // 回避の札は dodgeLabel と別に描かれる。守備中に共通の「にげる」を戻さない。
  dodgeGuideLabel(rt, reached, rain) {
    return reached ? 'ここで敵へ槍を向ける' : rain ? sunomata.rainDodgeGuideLabel(rt, false) : '印までよけ、槍を構える';
  },
  rainDodgeGuideLabel(rt, reached) {
    if (reached) return 'ここで矢が過ぎるのを待つ';
    return '印へよけ、矢を避ける';
  },
  // 画面端の矢印も同じ退避の指図を使う。実在の隊旗へ逃げる命令に替えない。
  escapePlaceLabel(rt, rain, side) {
    const direction = side || '印';
    return rain ? `${direction}へ矢をよける` : `${direction}へよける`;
  },
  // 三秒半でも八秒後に出し直される指の大札は出さず、方向の矢印で案内する。
  dodgeTurnDuration: 0,
  dodgeAvoidNotices: true,
  // 見回さず構えていても寄せと戦の時計は続ける。
  pauseTurnPractice: false,
  retreatPointAllowed(rt, point) {
    const p = rt.player.u.pos;
    // 守備中の退き先を林へ延ばさない。南門前は逃げ道として残す。
    // 人足を迎える門外の任務と、敗走の道筋は変えない。
    if (rt.flags.ending || Math.abs(p.x) >= FORT || Math.abs(p.z) >= FORT) return true;
    return Math.abs(point.x) < FORT - 1 && Math.abs(point.z) < FORT - 1 ||
      Math.abs(point.x) < 3 && point.z >= FORT - 1 && point.z < FORT + 8;
  },
  dodgePointAllowed(rt, point) {
    const p = rt.player.u.pos;
    // 柵内の守備中に、柵の外を回避先として勧めない。門外の任務は従来どおり。
    return Math.abs(p.x) >= FORT || Math.abs(p.z) >= FORT ||
      Math.abs(point.x) < FORT - 1 && Math.abs(point.z) < FORT - 1;
  },
  dodgeLabel(rt, direction, rain) {
    // 共通の矢印が示す前方・左右・振り向きを、そのまま言葉にも残す。
    if (direction.includes('振り向く')) return direction;
    if (direction.startsWith('前')) return '前へよける';
    if (direction.startsWith('右')) return '右へよける';
    if (direction.startsWith('左')) return '左へよける';
    return rain ? '矢をよけて 下がる' : '敵からよける';
  },
  strictHits: true, // 一撃の上限と連続被弾の軽減で本人だけ助けない。
  // 寄せ手が近い時は槍の守りを優先する。人足の普請と本人の立て直しを競合させない。
  fenceUseOK: (rt) => !rt.flags.buildBusy && !rt.flags.insideDanger && fortSafe(rt)
    && !rt.army.nearestEnemy(rt.player.u, 7),
  // 視点へ入る味方は描く間だけ避ける。少し先の具足を点描の塊にしない。
  nearAllyFadeRadius: 2.4, nearAllySolidBody: true,
  // 近い味方の騎馬も拾い、視線を塞ぐ間は馬と騎手を一緒に避ける。
  nearAllyHorseFade: true, nearAllyWholeOcclusion: true,
  hidePlayerSign: true, // 自分は背中で見分ける。足元の白い輪を材木や退き先の印と取り違えさせない。
  // 視点に触れて姿を避けた時も、旗や門柱の上へ人形の輪郭を描かない。
  playerFootSignOnly: true,
  // 笠だけを透かして顔や首布を露出させず、体へ入る時の全身回避にそろえる。
  nearHatFadeRadius: 0, nearSpearFade: true, fadeCloseStandards: true,
  // 狭い柵際で長旗が敵の上半身を覆わない幅。竿と横木も既存の仕組みでそろう。
  standardClothScale: .72,
  // 槍を振った跡が白い板にならないよう、刃先だけ短く薄く残す。
  narrowWeaponTrail: true,
  // 墨俣では画面の兵と号令札の視線をそろえ、布を透かす時は竿も同じ濃さにする。
  sightFromCamera: true, fadeCloseStandardFrame: true,
  readableLogEntry: true, rangeCueClearCenter: true,
  // 自分の組への下知は、上役の隊が進む知らせと分ける（組へ号令するたびに「任務の印へ」が重なっていた）。
  signalHint: (rt, g, kind) => g.team !== rt.player.u.team || kind !== 'susume' ? ''
    : g.isPlayerSquad ? '組の太鼓：進め' : '味方の隊が進む。自分の組は任務の印へ向かえ',
  // 南門へまっすぐ歩ける中央の道。北西の小屋と柵の間から始めない。
  // 稲生の標準（kaito 10/23）：小地図・足元の輪・浮かぶ字の札を出さず、行き先のピン・敵の頭上の▼・右上の任務一行に絞る。
  noControlsHelp: true,   // 操作の字は尾張の戦で覚える。この戦では出さない
  missionStyle: 'field',   // 共通の頭上印を刀でなく稲生と同じ赤い▼に・ピンを判定地点に固定（field_signs・mission_pin）
  noFieldMap: true,
  hideArmyPeek: true,
  foeMarks: true,
  keepTaskLabel: true,
  keepDestinationTask: true,
  immediateTaskChanges: true,
  spawn: { x: 2, z: 12, heading: Math.PI },
  // 身の回りの当時の場（timeslip_field.js）。永禄九年九月は今の十月・長良川の岸の秋。
  // 普請の砦の内外は人夫と寄せ手に踏まれた湿った土。北の畑と西の林の口ほど、倒れた槍・矢・斎藤方の旗が多い。
  // 岸には葦、刈り残しの草は穂が枯れ色。長良川の川面（x 56 から）には置かない。
  timeslip: {
    wet: 0.45, dust: 0.3, trample: 0.35, debris: 0.9, arrows: 0.8, reeds: 1,
    // 普請場は砂利の曲輪とは違い、運搬の轍と守兵の踏み跡を残す。
    workGround: true, crushedGrass: true, mudColor: 0x75654c, mudOpacity: .38,
    pools: .35, grassH: .75,
    paths: [{ pts: [[0, 24], [0, 5], [6, -10]], w: 3 },
      { pts: [[-13, 7], [-6, 7], [6, -10]], w: 2.2 }],
    grass: 0x9a9a5e, grassTints: [0xffffff, 0xe6dcae, 0xcfd0a0], tallGrass: 0.8,
    flagColors: [0xe2ded2, 0x2a2826, 0x3a4a6a],
    fights: [[0, -FORT - 12, 30], [-FORT - 12, 0, 30], [0, -FORT, 16], [-FORT, 0, 16]],
    skip: (x, z) => x > 56,
  },
  // 民の位置と道は復元。江戸期の墨俣宿・寺町や天守の城下を持ち込まない。
  // 寺町の移転時期：大垣市 https://www.city.ogaki.lg.jp/0000019596.html
  // 百姓は南西の在所、町人・商人と旅の僧は在所へ続く道の脇から見物する。
  // 南の控え・荷駄道を横切らず、刈田の東側か村の西側を回って退く。寺町の位置は作らない。
  // 村の周りも組と退路を明示し、共通処理で民家の脇へ退路のない百姓を足さない。
  civilianCrowd: {
    // 普請や荷運びの人足だけでは逃げない。兵の接近と火への警戒は保つ。
    ignorePorters: true,
    // 搬送などで戦場を離れた兵の古い位置を恐れず、畦や家族の合流場所を使えるようにする。
    ignoreGoneSoldiers: true,
    // 主人公の斬撃と短い発砲音を見落とさず、家並み越しでも近い戦いから退く。
    watchPlayerCombat: true,
    rememberSoldierCombat: true,
    // 勝敗が決まっても、火の近くや畦の途中で家族を立ち止まらせない。
    evacuateAfterBattle: true,
    // 在所から見ているのは砦の普請。離れた控え兵の人数で視線を変えない。
    watchAt: { x: 0, z: 0 },
    // 在所の家や稲架越しを見物場所にせず、寄せ道へ見通せる村外れに立つ。
    // 二十四メートルより先の家や稲架も調べる。砦の柵・土塁は見物の対象なので、
    // 中心の二十八メートル手前で止め、在所からの見通し全体を確かめる。
    watchTargetClearance: 28,
    // 家だけでなく低い土手の向こうも見物場所にしない。子の低い目線でも判定する。
    watchTerrainSight: true,
    // 家並みや土手の向こうの遠い兵・火では見物を切り上げない。
    // 十二メートル以内は足音や火の気配でも気付き、見えなくても逃げる。
    noticeHearingDistance: 12,
    // 家や土手で兵が隠れていても、近くの斬り合いの音には気付いて退く。
    // 静かな控え兵や火は、これまでの見通しと十二メートルの気配で判断する。
    fightingHearingDistance: 40,
    // 見物中も退路と同じ間隔で見張り、走る兵や燃え広がる火への気付きを遅らせない。
    dangerCheckInterval: 0.2,
    // 村外れで隣の組が逃げ出したら、兵が目の前へ来るのを待たず畦へ退く。
    // 遠い在所まで一斉に逃がさず、近くの人の逃げ始めだけを合図にする。
    neighborAlarmDistance: 32,
    neighborAlarmDuration: 3,
    // 見物の間合い（三十四メートル）から兵が寄れば、槍際になる前に畦へ退く。
    // 逃走中と家族待ちも同じ間合いで警戒し、道へ戻って兵へ近寄らない。
    soldierNoticeDistance: 24,
    // 配置時から逃走中まで乱戦には四十メートル空け、初めから危険な場所で見物させない。
    fightingNoticeDistance: 40,
    // 騎馬は徒歩兵より早く畦へ迫る。三十四メートルで気付き、家族で退き始める。
    mountedNoticeDistance: 34,
    // 家や稲架で姿が隠れても、走る馬の蹄の音で早めに家族を畦へ退かせる。
    // 止まった控えの騎馬では見物を切り上げない。
    mountedHearingDistance: 24,
    // 気付く間合いの内へ、別の危険をよけるために踏み込まない。
    // 徒歩の実兵・控えは二十四メートル、騎馬は三十四メートル空ける。
    // 斬り合い中の兵は見物の警戒と同じ四十メートル、火は広がりを足して二十二メートル空ける。
    escapeClearance: { soldiers: 24, troops: 24, mounted: 34, fighting: 40, fire: 22 },
    // 子や年寄りが遅れても、その人へ迫る兵や火を見落とさない。
    individualDanger: true,
    // 逃げる向きも一人ずつ決め、安全な畦では子や年寄りに歩調を合わせる。
    individualEscape: true,
    sharedEscapePace: true,
    // 後ろの子や年寄りへ危険が迫る間は、先の大人も畦で待たず道を空ける。
    // 全員が兵や火から離れたら、再び歩調をそろえて合流する。
    familyDangerResponse: true,
    // 逃走中も大人と子の体の幅を空け、畦の曲がり角で重ならない。
    keepPeopleApart: true,
    // 曲がり角で離れた子や年寄りを安全な畦で待ち、外周からも一緒に退く。
    keepFamiliesTogether: true,
    // 家や水路をよける配置で大人が全員外れた組は、子だけで見物させない。
    requireAdultCompanion: true,
    // 到着判定の手前で止まる分も空け、出口で待つ家族の体を重ねない。
    exitSpacing: 1.4,
    // 共通の松明は大きさ〇・七。篝火より小さい火が畦へ迫っても逃げ、退路でもよける。
    fireSize: 0.6,
    // 炎が大きいほど早く気付き、逃げ道でも火の広がりから間隔を取る。
    avoidFireSpread: true,
    // 屋根や台の上で見える炎にも気付き、本人と退路の見張りをそろえる。
    watchRaisedFire: true,
    // 控えの旗列も兵のいる場所として避ける。実兵への入れ替え前も民を通さない。
    avoidDistantTroops: true,
    // 控えの列の角も途中でかすめず、畦への斜めの逃げ道全体で間合いを守る。
    continuousTroopClearance: true,
    // 見物の配置は実兵と同じ三十四メートル。逃走中の二十四メートルとは分ける。
    distantWatchDistance: 34,
    // 敗走する列も里の者には危険。退く兵が畦へ来た時も見物や家族待ちを続けない。
    avoidRoutedTroops: true,
    // 道中へ兵や火が来た時も調べ直す。近づかれた民は、その場に縛らず離れる方へ逃がす。
    escapeCheckInterval: 0.2,
    // 見物中も見通せる六十四メートル内の退路を見張り、畦を塞がれる前に退く。
    watchRouteDistance: 64,
    // 組の中心だけでなく、端の子や大人から畦へ出る道も見張る。
    // 退路へ迫る兵や火も、本人への接近と同じ間隔で確かめる。
    watchRouteFromPeople: true,
    watchRouteCheckInterval: 0.2,
    // 逃げ始めた後も残りの畦を見張り、先へ回り込む兵や火に気付いてよける。
    watchEscapingRoute: true,
    // 兵や火をよけて次の畦へ出た人を、通り過ぎた道標へ引き戻さない。
    rejoinEscapeRoute: true,
    // 兵や家族をよけて畦の脇へ出ても、空けてある四メートルの幅から先の道へ戻れる。
    routeRejoinDistance: 4,
    // 家並みの外の見物場所から、最初の道標まで水路や家を横切らず出られる所だけ使う。
    requireRouteAccess: true,
    // 最初の畦だけでなく、村外れの出口まで家・岸・水路で途切れない道を使う。
    requireFullRouteAccess: true,
    // 地面が通れても控え兵や火で塞がれた畦は使わず、出口の家族待ちの位置も確かめる。
    requireSafeRouteAccess: true,
    // 家の角や稲架は点の間でも通り抜けない。民だけの退路判定に使う。
    continuousEscapeSolids: true,
    // 大人の体の半幅は約〇・三六メートル。家や稲架にも岸と同じ余白を取り、
    // 三十センチだけ空いた角へ肩が食い込む道を、配置時から退路に選ばない。
    escapeSolidMargin: 0.4,
    // 川・枝水路の縁は体の半幅も空ける。家族の退路と出口も同じ幅で確かめる。
    escapeBankMargin: 0.4,
    // 畦の曲がりを四メートル手前で省かず、稲架や家並みの外の道をたどる。
    routeCornerRadius: 1,
    // 家の角や稲架の脇では歩幅を詰めて曲がり、三メートル先が塞がれただけで止まらない。
    shortEscapeSteps: true,
    // 最後の道標は外周の出口。四メートル手前の刈田で姿を消さない。
    routeArrivalRadius: 0.3,
    // 近くの町人・商人もそれぞれの小袖で描く。百姓の形への代用を減らす。
    // 既存の七人の枠は保ち、二人だけ初めに用意して使い回す。
    modelKinds: ['farmer', 'farmer', 'woman', 'woman', 'child', 'monk', 'elder', 'townsman', 'merchant'],
    // 子・年寄りと大人それぞれの背丈を、遠景から近くの姿へ替える時も保つ。
    consistentModelScale: true,
    // 子の小さな歩幅と年寄りの歩みを、畦で実際に進んだ距離に合わせる。
    naturalEscapeGait: true,
    bands: SUNO_CIVILIAN_BANDS,
  },
  world: {
    // 共通の膝・腰・胸の踏ん張りを使い、柵を押す兵の装備の重さを見せる。
    infantryWeight: true,
    closeBattleWeight: true, contactBraceObstacles: true, rearSpearSupport: true,
    // 葉房と裸地を共通部品で描く。兵の数・地形の当たりは変えない。
    branchFoliage: true, foldedNeedleCards: true, patchyGround: true,
    // 土塊の升の境に陰を付けず、窪みも踏まれた泥へ薄く残す。
    softEarthCrust: true, subtleMudRelief: true,
    livingSpearHedge: true,
    // 隊の密度と歩く速さを保ち、足の拍子だけを一人ずつずらす。
    variedMarch: true,
    // 横斬りのひねりを残したまま宙で止めず、肩と胴を地面で支える。
    settleSideFalls: true, groundedFalls: true, fallPaceSpread: .35,
    // 地面へ落ちた指物は、広げた板でなく皺を寄せた布にする。
    crumpledFlags: true,
    // 人数と斬り合いは維持し、16mより遠い無名兵だけ既存の軽い骨付きの形へ。
    lowHumanDetail: 16,
    // 空中の白い柱は、地面ではなく視点に追従する光の板。墨俣では出さない。
    noShafts: true,
    // 湿った川辺の土煙で砦全体を白く隠さず、数歩先の兵と柵を見せる。
    smokeFogFloor: 110,
    // 南門外の人足と林の口を、近場の霞で消さない。遠景の兵は増やさない。
    battleViewDistance: 140,
    // 少ない弓衆から数十本を増やさず、遠い矢も自然な太さと霧で描く。
    naturalArrowRain: true, arrowRainPerBow: 1,
    // 現代の白黒の区画帯で普請場を覆わない。矢・落下の影・退き先の案内は残す。
    arrowRainGroundCue: false,
    // 味方の援護射撃は本人に当たらない。危険の輪と退避先も敵の矢だけで選ぶ。
    enemyArrowWarnings: true,
    // 外れ矢を砦内へ積み重ね、白い羽の短冊で足元を覆わない。射矢と当たりは残す。
    noGroundArrows: true,
    // 体や馬に刺さっても、飛んでいた矢の長さを保つ。
    keepPinnedArrowSize: true,
    pinnedArrowAxisScale: true,
    // 親子の行列更新で描く時の体格へ合わせる。場全体から矢を走査し直さない。
    pinnedArrowRenderScale: true,
    unitFlagMaterial: (base) => sunoNearMaterial(sunoClothMaterial(base)),
    // 外壁と共通室内の梁・壁で同じ透かし方を使い、近い屋根に網目を重ねない。
    interiorMaterial: (mat) => sunoNearMaterial(mat),
    // 固定小物を材質ごとに結合。画面外の部品と結合した景物の影を低画質で省く。
    compactScenery: true,
    moveWay: sunomataRunnerWay,
    runnerWay: sunomataRunnerWay,
    blockedHint(rt) {
      if (rt.blockedMove?.cause === '兵の列') return '味方の列を横へよけて通れ';
      const p = rt.player.u.pos;
      if (Math.abs(p.x) < FORT - 3 && Math.abs(p.z) < FORT - 3) return '小屋や材木をよけ、真ん中の道へ回れ';
      return rt.flags.sunoTask === 'nida' || rt.flags.sunoTask === 'porters' || rt.flags.sunoTask === 'retreat'
        ? '外へ出る時は南門へ。真ん中の道を歩け' : '柵の内で止まり、隙間から槍で突け';
    },
    seed: 33,
    // 濃尾平野の川辺。遠山の見かけの高さだけを抑え、形の細かさや兵の密度は保つ。
    // 地域の地形参考：大垣市「大垣市の河川の概要」。当時の川筋の復元資料ではない。
    // https://www.city.ogaki.lg.jp/0000002089.html
    mountainScale: 0.18,
    // 遠山の手前も濃尾平野の低地へつなぐ。共通の丘陵をそのまま足すと、
    // 歩ける地面の外に十数メートルの丘が並び、川辺を盆地のように囲ってしまう。
    // 国土交通省の平野の成り立ちからの補い。永禄年間の標高の復元ではない。
    // https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
    // 遠景の既存頂点だけを低くし、戦場の足場・河床・兵・描画の細かさは保つ。
    farReliefScale: 0.1,
    // 濃尾平野の南東を山で囲まない。北・西の遠山へ滑らかにつなぐ地勢の補い。
    // 大垣市の地域別構想を参考にした方角の表現で、個々の峰の復元ではない。
    // https://www.city.ogaki.lg.jp/cmsfiles/contents/0000053/53056/04daiyonR3.pdf
    mountainProfile: (x, z) => Math.min(1, Math.max(0, -x, -z) * 2),
    mountainHaze: 0.8,
    // 整地した庭に同じ穴と土塊を並べず、土手の模様も法線の向きで細い縞へ潰さない。
    // 既存の地面設定だけを使い、歩く高さ・当たり・絵の枚数は増やさない。
    softEarthCrust: true, sparseEarthCrust: true,
    subtleMudRelief: true, stableSlopeGrain: true,
    muddy: 0.45,     // 川辺の砦は湿っている
    // 乾いた肩と湿った窪みを土色で分ける。既存の踏み跡だけを使い、
    // 普請砦の小道に荷車の轍を足さず、道と草の境をなだらかにつなぐ。
    wetFieldRuts: 'wear', softPathSoil: true,
    paths: [...SUNOMATA_PATHS, ...SUNO_CIVILIAN_BANDS.map((b) => [[b.x, b.z], ...b.route])],
    water: { x: 62, x2: 112, level: -0.7 },
    riverCross: true, // 舟以外は深みを歩いて渡れない。   // 長良川：向こう岸は 112 から
    waterSlow: true,   // 水が主役（spec first6 17〜24）：川の中は terrain_tags の 'water' で歩み・向き変えが鈍る
    time: 'day',
    autumn: true,
    // 川辺の低地の支流を本流の河床までつなぐ。当時の川筋は不明で、犀川の正確な復元ではない。
    // 地域の河川の参考：大垣市「大垣市の河川の概要」 https://www.city.ogaki.lg.jp/0000002089.html
    streams: [
      // 天正十四年の河道変動前は、境川筋の古木曽川が墨俣で長良川に合流した。
      // 国土交通省「木曽三川の歴史・文化」第九十二号、五頁。
      // https://www.cbr.mlit.go.jp/kisokaryu/KISSO/pdf/kisso-VOL92.pdf
      // 岐阜県の地学案内「一夜城跡」では、古木曽川の合流点は城跡より下流側。
      // https://geo-gifu.org/tour/12_tour/tour_12_4.html
      // これを参考に、北東にあった合流口を南東へ移す。座標は遊びの補い。
      // 古木曽川は当時の本流。水面の幅三十二メートル・深さ・流路の長さは保つ。
      // 岸の斜面は中心線から三十二メートル。南東の寄せ列（南百四十二メートル）と
      // 控えを避け、寄せ道・舟の航路・兵の持ち場へ届かない下流側へつなぐ。
      // 東の地面の端より外から流れ込み、長良川の河床へつなぐ。
      // 幅と深さは合流が読み取れるための補いで、当時の測量値ではない。
      SUNO_OLD_KISO,
      // 北の道と支流の交差は浅瀬。川床と水面を共通の浅瀬処理でそろえる（位置は遊びの補い）。
      // 合流口で本流の深い河床から水位を作ると、水面が本流より沈む。
      // 河口だけ長良川の水位へ寄せ、北の道の浅瀬と寄せ手の足場は保つ。
      SUNO_WEST_BROOK,
      // 当時の確定した堀でなく、岸の区画を囲う浅い枝水路の補い。舟着きと南の道は空ける。
      // 水面・川床・岸は同じ定義を使い、河口の水位も本流へつなぐ。
      SUNO_FORT_BROOK,
    ],
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.08 + x * 0.02);
      // 川沿いの低地。高い丘でなく、寄せ手の旗が見える低い微高地。
      h += 1.4 * gauss(x, z, -140, -140, 3000) + 0.9 * gauss(x, z, -150, 60, 2600);
      // 現代の標高は低地の参考。下限だけでは現代の盛り土まで高地として持ち込んでしまう。
      // 補正を上下とも一・五メートル以内へ滑らかに収める。幅は遊びの補いで、当時の測量値ではない。
      // 川床・砦・空堀の整地はこのあとに行う。
      if (sunoDem) {
        // 実測は氾濫原の高さ（相対およそ 7.5m）を基準にし、その上下の起伏（長良川の堤・自然堤防・旧流路の窪み）だけを 1/4 に縮めて足す。
        const raw = demSample(sunoDem, x * 4, z * 4) - 7.5;
        const edge = Math.max(0, Math.min(1, (sunoDem.range - Math.max(Math.abs(x), Math.abs(z)) * 4) / 80));
        h += edge * (2.2 * Math.tanh(Math.max(raw, 0) * 0.28 / 2.2) + 1.2 * Math.tanh(Math.min(raw, 0) * 0.28 / 1.2));
      }
      // 在所を細長い自然堤防に載せ、隣の刈田を浅い後背低地にする。
      // 地形の頂点だけを動かす。新しい水面・障害物・材質は加えない。
      h += sunoLevee(x, z) - .35 * sunoBackswamp(x, z);
      h += (-.2 - h) * sunoFieldFloor(x, z);
      // 水位をそろえる合流区間は、岸が水面より下がらない低い地盤へ整える。
      // 共通の川床処理がこの地盤を掘る。長良川の岸・河床は続く処理で保つ。
      // 南東の寄せ列より南だけに限り、砦・舟の航路・持ち場の地面は変えない。
      if (x > 104 && z > 144) {
        const d = distToPolyline(x, z, SUNO_OLD_KISO.pts);
        const t = Math.max(0, Math.min(1, (40 - d) / 8, (x - 104) / 8));
        h += (Math.max(h, .2) - h) * t;
      }
      // 両岸の低い窪みが、水面のない川外へ続かないよう岸の地盤をつなぐ。
      // 現代の標高補正による窪みもここで収める。堤防の復元ではなく、
      // 網目状の自然河川を表す補い（上の国土交通省資料）。高さは遊びの設定。
      // 岸から八メートルで元の低地へ戻し、砦・東岸の控えの足場には届かせない。
      // 枝流れと古木曽川は共通側がこのあと掘るため、合流口を塞がない。
      if (x > 50 && x < 120) {
        const t = Math.max(0, Math.min(1, (x - 50) / 8, (120 - x) / 8));
        h += (Math.max(h, .2) - h) * t * t * (3 - 2 * t);
      }
      // 支流の合流口には岸の盛り上がりを残さない。浅い川床だけでは、
      // 本流へそろえた水面より地面が高くなり、河口が乾いた土で途切れる。
      // 網目状の自然河川（上の国土交通省資料）からの地形の補い。
      // 高画質の枝水路も同じ勾配で深みへつなぎ、北の浅瀬と舟着きは保つ。
      if (x > 50 && x < 66 && z > -76 && z < -16) {
        const d = Math.min(distToPolyline(x, z, SUNO_WEST_BROOK.pts) / (SUNO_WEST_BROOK.w * 2),
          distToPolyline(x, z, SUNO_FORT_BROOK.pts) / (SUNO_FORT_BROOK.w * 2));
        if (d < 1) {
          const t = (x - 50) / 16, channel = (1 - d) ** 2 * (1 + 2 * d);
          h = Math.min(h, .2 - 2.8 * t * t * (3 - 2 * t) * channel);
        }
      }
      // 岸の地盤から深みへ下げ、川面の範囲と河床をそろえる。
      // 西岸も水面の始まる六十二メートルから掘る。陸側の水面判定がない場所に
      // 水位より低い溝を残さず、六十六メートル以東の深み・砂州・舟の航路は保つ。
      // 網目状の自然河川を参考にした接続の補いで、永禄年間の岸の測量値ではない。
      if (x > 62 && x < 112) {
        const bank = Math.min(1, (x - 62) / 4, (112 - x) / 4);
        h = h * (1 - bank) - 2.6 * bank;
        h = sunoRiverBed(x, z, h);
      }
      h = sunomataGround(x, z, h);
      // 外の空堀（castles/sunomata.js の HORI）
      for (const f of MOAT) h += f(x, z);
      return h;
    },
    tint(x, z, h, c) {
      const trodden = sunoCampWear(x, z) * .7;
      c.r += (.39 - c.r) * trodden; c.g += (.34 - c.g) * trodden; c.b += (.25 - c.b) * trodden;
      // 排水の悪い刈田の泥を暗くし、微高地との違いを既存の頂点色で示す。
      const wet = sunoBackswamp(x, z) * .65;
      c.r += (.31 - c.r) * wet; c.g += (.28 - c.g) * wet; c.b += (.20 - c.b) * wet;
      // 枝流れの岸も湿った砂泥にする。濃尾平野の自然河川を参考にした補い。
      // https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
      // 既存の頂点色だけを使い、浅瀬の深さ・寄せ手の道・斬り合いは変えない。
      const mud = sunoBrookBank(x, z) * .8;
      if (mud > 0) {
        c.r += (.38 - c.r) * mud; c.g += (.33 - c.g) * mud; c.b += (.24 - c.b) * mud;
      }
      // 改修前の川辺を一様な帯にせず、水際の泥から乾いた砂泥へなじませる。
      // 国土交通省「濃尾平野と洪水」の自然河川を参考にした補い。土質・水位の復元ではない。
      // https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
      // 既存の頂点色だけを変え、河床・舟の航路・兵の通り道は保つ。
      // 古木曽川の合流口も同じ砂泥へつなぐ。長良川だけを塗ると、支流の水際が草地で途切れる。
      // 合流点の参考：https://geo-gifu.org/tour/12_tour/tour_12_4.html
      // 水際の土色は低地の表現上の補い。地形・水位・舟の航路は変えない。
      const bank = sunoRiverBank(x, z);
      if (bank > 0) {
        const dry = Math.max(0, Math.min(1, (h + .7) / .8));
        // 流れが残す砂泥のむら。水際は湿った暗色、乾いた岸ほど淡い砂色を混ぜる。
        // 既存の地面の色だけで表し、素材・形・毎コマの処理は増やさない。
        const sand = dry * (.025 * Math.sin(z * .19 + x * .31) + .015 * Math.cos(z * .37 - x * .13));
        c.r += (.38 + dry * .15 + sand - c.r) * bank;
        c.g += (.35 + dry * .13 + sand * .85 - c.g) * bank;
        c.b += (.27 + dry * .09 + sand * .6 - c.b) * bank;
      }
      if (Math.abs(x) < FORT && Math.abs(z) < FORT) {
        const wet = .5 + .5 * Math.sin(x * .57 + z * .23) * Math.cos(z * .48 - x * .19);
        c.setRGB(.36 + wet * .09, .31 + wet * .08, .23 + wet * .06);
      }
    },
    // 林縁を四角く切らず、伐り開いた広場の外側へ大小の入り江を残す。
    // 後背低地の刈田と周囲四メートルにも木を生やさず、既存の田の区画を保つ。
    // 北・西・南西の控えも林と分ける。兵の位置・人数と、中央の斬り合いは保つ。
    // 村人の立つ畦と退路も空け、陣・刈田の伐開と両立させる。
    clear: (x, z) => (Math.abs(x) < 70 + 8 * Math.sin(z * .071) ** 2
      && Math.abs(z) < 70 + 13 * Math.sin(x * .053 + 1) ** 2) || x > 45 || Math.hypot(x + 100, z - 150) < 34 || sunoFieldFloor(x, z) > 0 || sunoCampClear(x, z)
      || SUNO_CIVILIAN_BANDS.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < 49)
      || sunoCivilianClearing(x, z),
    // 川辺の林を杉・松が半数近い山林の姿にしない。広葉樹を主にする。
    // 国土交通省の長良川の植生資料（ヤナギ・エノキ等）を参考にした地勢の補い。
    // https://www.cbr.mlit.go.jp/kisojyo/cms/info/pdf/info07%20%20310712.pdf
    // 現代の植生からの類推で、永禄年間の樹種・割合の復元ではない。
    // 数値は累積の境目。本数・乱数の消費・共有する形と材質は保つ。
    treeMix: { sugi: .04, matsu: .16 },
    // 整地した中央は踏み土、柵際と逆茂木の間は刈り残した草。緑一色にも砂一色にもしない。
    grassMix: (x, z, road) => {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const margin = Math.max(0, Math.min(1, (edge - 10) / 10));
      const lane = Math.max(0, Math.min(1, (road - 1.4) / 1.6));
      return lane * (.08 + margin * .75);
    },
    // 刈田は既存の稲株と畦で表す。草地の色・草株を重ねず、田の外へ滑らかに戻す。
    // 自然堤防と水田の土地利用の参考は sunoFieldFloor の上の岐阜県教材。
    // 水際は砂泥を主にし、岸から離れるほど草地へ戻す。草の細かさや兵の数は保つ。
    groundCover: (x, z) => (1 - sunoFieldFloor(x, z))
      * (1 - .85 * sunoCampWear(x, z))
      * (1 - .9 * Math.max(sunoRiverBank(x, z), sunoBrookBank(x, z))) * Math.max(.12, Math.min(1,
      (Math.max(Math.abs(x), Math.abs(z)) - 9) / 12 + Math.sin(x * .39 + z * .28) * .24)),
    trees: 260,
    tufts: 3500,
    // 追加の林にも陣の伐開・道・水際の除外を適用する。通常の植樹だけでは控えに木が重なる。
    // 南の十四本は控えの西端から、街道と寄せ道の間の空いた低地へ移す。
    // 河畔林の参考は上記の国土交通省資料。林の実位置の復元ではない。
    // 本数・広葉樹の形と材質は保ち、兵の配置・人数・進路は変えない。
    clearGroves: true,
    groves: [{ x: -95, z: -30, r: 14, n: 20, kind: 'broad' }, { x: -94, z: 48, r: 12, n: 14, kind: 'broad' }, { x: 30, z: -110, r: 14, n: 18, kind: 'broad' }],
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  compactIntro: true,
  introTaskFirst: true,
  // 任務を先に示し、開戦前にも史実・築城伝承・遊びの設定を分けて伝える。
  introText: 'まず北の柵の内で敵を待て。近づいた敵を槍で突き、外へ追うな。勝つには材木を一度届ける必要がある。敵が退いたら小屋の南西で材木を担ぎ、印の人足へ渡せ。外へ出る時は南門へ。信長公記には、永禄四年に信長が墨俣の守りを固めたとあります。この戦は永禄九年の一夜城伝承を借りた防衛戦です。史実の総勢は不明です。陣の配置・川筋・兵数・季節・時刻と空模様は遊びの設定です。',
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    // 具足の入れ物は遠近で骨へ付け替わり、縮尺も変わる。
    // 矢は兵の根へ留め、具足の拡大で槍ほど長くなるのを防ぐ。
    const pinArrow = rt.army.pinArrow;
    rt.army.pinArrow = function (a, life, parent, support = null) {
      if (parent && !support) for (const u of this.units) {
        if (u.armorWear?.root === parent) { parent = u.mesh; break; }
      }
      return pinArrow.call(this, a, life, parent, support);
    };
    // 資材・築城中の行き先の守りは墨俣だけに付ける。他の戦の兵ごとの足には検査を増やさない。
    // 開戦時に一度だけ包み、更新中は入れ物を作らない。
    const steer = rt.army.steer.bind(rt.army);
    rt.army.steer = (u, dt, want, speed, face) => {
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (want && (!Number.isFinite(want.x) || !Number.isFinite(want.z))) want = null;
      if (!Number.isFinite(speed)) speed = 0;
      if (face != null && !Number.isFinite(face)) face = null;
      return steer(u, dt, want, speed, face);
    };
    // 川辺の裸地を敷物の升目や同じ足形の列にしない。墨俣の地面だけ
    // 高画質でも足形入りの写真へ戻さず、継ぎ目のない細かな土粒と泥を使う。
    // 材質・地形・共通の絵は書き換えない。
    W.groundU.tDirt.value = W.groundU.tBank.value = dirtTex(true, true);
    W.groundU.tMud.value = mudTex(true);
    W.terrain.material.color.setHex(0xc7b495);
    // 砦の内は踏み固めた暗い土、柵の下の土塁は草の生えた土（10/28 資料との差：内も外も同じ橙の一枚）。
    // 地面の一回の描画の色だけ。形・当たり・絵は変えない。
    {
      const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey.bind(mat);
      mat.customProgramCacheKey = () => cacheKey() + '|墨俣の土塁';
      mat.onBeforeCompile = (sh, renderer) => {
        compile.call(mat, sh, renderer);
        sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
          float snD = max(abs(vWP.x), abs(vWP.z));
          float snIn = 1.0 - smoothstep(${(FORT - 2.2).toFixed(1)}, ${(FORT - 1.2).toFixed(1)}, snD);
          float snBank = smoothstep(${(FORT - 1.8).toFixed(1)}, ${(FORT - .6).toFixed(1)}, snD) * (1.0 - smoothstep(${(FORT + 2.6).toFixed(1)}, ${(FORT + 4.2).toFixed(1)}, snD));
          snBank *= 1.0 - (1.0 - smoothstep(3.0, 5.0, abs(vWP.x))) * step(${(FORT - 3).toFixed(1)}, vWP.z);
          float snL = dot(col, vec3(0.3, 0.55, 0.15));
          col = mix(col, vec3(snL) * vec3(0.98, 0.84, 0.66) * 0.8, snIn * 0.6);
          float snTuft = smoothstep(0.3, 0.7, macro2);
          col = mix(col, grass * vec3(0.78, 0.86, 0.62), snBank * mix(0.5, 0.85, snTuft));
          diffuseColor.rgb *= col;`);
      };
      mat.needsUpdate = true;
    }
    sunoChoiceLayout(rt);
    flReset();
    // 人足の救援と近い槍の守りを優先する。首取りは安全になれば同じ遺体で再開できる。
    // 案内と長押しが共用する入口で止め、遺体や手柄の判定そのものは消さない。
    const nearestInteract = rt.nearestInteract.bind(rt);
    rt.nearestInteract = () => {
      const item = nearestInteract();
      if (item?.id.startsWith('head') && !rt.over && !F.ending &&
          (F.insideDanger || !sunoSupplySafe(rt))) return null;
      return item;
    };
    SUNO_VIEW.value.copy(rt.player.u.pos); SUNO_VIEW.value.y += 1.4;
    // 小屋で押された視点へ自分の笠・首布が大写しになる時だけ、描く間は全身を避ける。
    // 既存の復帰処理へ渡し、装具や顔だけを透かさない。位置を調べる入れ物は一度だけ作る。
    const player = rt.player, fpHide = player.fpHide, selfHead = new THREE.Vector3();
    player.fpHide = function (on, camera) {
      fpHide.call(this, on, camera);
      if (!on || camera !== rt.camera || rt.game?.photo || this.fpK >= .5 || !this.u.alive) return;
      const u = this.u, head = u.human?.root.visible ? u.human.parts?.hat || u.head : u.head;
      if (!head) return;
      head.getWorldPosition(selfHead);
      if (selfHead.distanceToSquared(camera.position) >= .64) return;
      this.hideNearFlag(u.mesh); this.hideNearFlag(u.human?.root); this.hideNearFlag(u.wpn);
    };
    // 組の道筋を白い板に見せない。墨俣の札だけ薄い土色にし、柵より先に描く。
    const buildDestFlag = rt.buildDestFlag.bind(rt);
    rt.buildDestFlag = (...args) => {
      const flag = buildDestFlag(...args);
      if (!sunoRouteMat) {
        sunoRouteMat = flag.route.material.clone();
        sunoRouteMat.color.set(0xc7bda7); sunoRouteMat.opacity = .18;
      }
      flag.route.material = sunoRouteMat; flag.route.renderOrder = -1;
      if (!sunoDestGeo) {
        sunoDestGeo = flag.cloth.geometry.clone();
        const p = sunoDestGeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          p.setZ(i, p.getZ(i) * 2 + Math.sin(x * 24 + p.getY(i) * 9) * .025 * x / .62);
        }
        sunoDestGeo.computeVertexNormals();
        sunoDestGeo.computeBoundingSphere();
      }
      flag.cloth.geometry = sunoDestGeo; flag.cloth.scale.set(.8, .8, 1);
      flag.cloth.material = sunoNearMaterial(sunoDestMaterial(flag.cloth.material));
      return flag;
    };
    // 共通の更新は小旗の材を戻すため、その直後に墨俣の染め布へ替える。
    const updateDestMarks = rt.updateDestMarks.bind(rt);
    rt.updateDestMarks = (dt) => {
      updateDestMarks(dt);
      for (const g of rt.squadGroups) if (g.destFlag?.root.visible) {
        g.destFlag.cloth.material = sunoNearMaterial(sunoDestMaterial(g.destFlag.cloth.material));
      }
    };
    // 普請の守りでは名のある敵も寄せ手の一人。自動の一騎打ちで下知を遮らない。
    rt.army.hooks.canDuel = () => false;
    // 共通の札と台詞をこの戦だけで絞る。討死の返事は実際の死亡処理中だけ。
    // 矢の案内は共通の回避とは別に道を探す。同じ柵内の条件を渡し、
    // 落下範囲の外へ出るために守りの柵を越えさせない。門外の迎えは保つ。
    rt.army.hooks.rainEscapePointAllowed = (point) => F.ending || sunomata.dodgePointAllowed(rt, point);
    const arrowRain = rt.army.hooks.onArrowRain;
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (volley.team === rt.player.u.team || rt.over || F.ending || F.won) return;
      arrowRain(volley, under);
      const mark = document.getElementById('rain-mark');
      if (mark && !mark.hidden) {
        mark.classList.add('suno-rain'); mark.textContent = '▲ 敵の矢　印の方へよけよ';
      }
    };
    const bark = rt.bark.bind(rt), say = rt.say.bind(rt), onKill = rt.onKill.bind(rt);
    rt.bark = (text, ...args) => {
      if (text === '後ろに敵！　振り向いて構えよ') {
        // 判定は本人の背中。見回した画面では正面にもなるので、画面の向きと取り違えない言葉にする。
        if (F.rearNoticeT != null && rt.t - F.rearNoticeT < 20) return;
        F.rearNoticeT = rt.t;
        text = '背を狙われた！　敵へ槍を向けて構えよ';
      }
      if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢が降る/.test(text) && document.getElementById('rain-mark')?.hidden === false) return;
      text = text.replace(/影から出よ/g, '小屋か竹束の陰へ退け');
      if (/敵が背を見せた！.*追え|敵が崩れた！.*押せ/.test(text)) text = '寄せ手が退く。柵の内で構え、次の寄せに備えよ';
      if (['gate', 'defend', 'post', 'rescue'].includes(F.sunoTask) &&
          /敵が退いて列を組み直す。休ませるな！|敵が息を継いでおる。今のうちに寄せよ！|敵が下がった！.*押せ！/.test(text))
        text = '寄せ手が下がった。追わず、柵の内で槍を揃えよ';
      if (text.includes('笠を傾け') && text.includes('矢')) text = '矢じゃ！　小屋か竹束の陰へ寄れ';
      if (text === '南の控えに命が届いた。押し続けよ') {
        if (F.southOrderNoticeT != null && rt.t - F.southOrderNoticeT < 120) return;
        F.southOrderNoticeT = rt.t;
      }
      if (text.startsWith('弓隊が遅れている')) {
        if (F.bowLagShown) return;
        F.bowLagShown = true;
      }
      return bark(text, ...args);
    };
    rt.onKill = (v, k) => {
      if (v === rt.player.u && !v.alive) rt.hud.root.classList.add('suno-death');
      F.allyFell = v.team === 0 && !v.alive && !v.civ && !v.isStruct;
      try { return onKill(v, k); } finally { F.allyFell = false; }
    };
    rt.say = (name, text, ...args) => {
      if (name === '木下藤吉郎' && text.includes('仲間が討たれた') && !F.allyFell) return;
      if (name === rt.G.name && text === 'かかれっ！突っ込め！' &&
          ['gate', 'defend', 'post', 'rescue'].includes(F.sunoTask)) text = '槍を揃え、ここで迎え撃て！';
      if (name === rt.G.name && text === '敵は遠い。前へ出るぞ' &&
          ['gate', 'defend', 'post', 'rescue'].includes(F.sunoTask)) {
        text = F.sunoTask === 'rescue' ? '人足の前で構えよ。敵を迎え撃つぞ'
          : '柵の内で構えよ。寄せてくる敵を待つぞ';
      }
      if (text.includes('笠を傾け') && text.includes('矢')) text = '矢じゃ！　小屋か竹束の陰へ寄れ';
      return say(name, text, ...args);
    };
    // 時計が毎回使う夕色を開戦時だけ調整し、陰の兵にも空の光を回す。
    const dusk = W.dayClock?.dusk;
    if (dusk) {
      dusk.sky.set(0xd3a08a); dusk.fog.set(0xb79b8d); dusk.top.set(0x956f79);
      dusk.glow.set(0xff8054); dusk.glowK = .85;
      dusk.hemiSky.set(0xd3b9a0); dusk.hemiGround.set(0x81715b);
      dusk.hemiI = Math.max(dusk.hemiI, 1.65); dusk.sunI = Math.max(dusk.sunI, 1.7);
    }
    // 味方一人へ寄せ手全員を重ねず、共通の狙い分けで隣の守り手にも槍を向ける。
    // 柵への攻撃は assaultFn の区画ごとの混雑判定で決める。
    // 縄張り（castles/sunomata.js）：物見・空堀・場の当たり。柵は下の buildFort が結う
    F.C = buildCastlePlan(rt, SUNOMATA_PLAN, { buildTowers: true, team: 0, dense: false });   // 墨俣は築く戦：普請の足場と兵の動きを塞がない
    patchGunCover(rt);
    // 洲股の地域と、一夜城伝承の推定場所を分ける。今の川筋や縄張りは確定しない。
    // 縄張りの細部・寄せの道筋はゲーム補完。もしもの防衛戦である事自体が GAME_C
    F.hist = { sunomataRegion: 'HIST_A', site: 'HIST_B', fort: 'HIST_B', kuruwa: 'GAME_C', assaultRoutes: 'GAME_C', foeComposition: 'GAME_C', sheds: 'GAME_C', channels: 'GAME_C' };
    F.segs = buildFort(rt);
    sunoWorkyard(rt);
    // 南の冠木門と仮設の物見、兵糧の俵
    sunoGate(rt);
    rt.scene.add(tawara(W, 9, -11, 0.4, 6), tawara(W, -10, 7, -0.3, 5), tawara(W, 6, 8, 1.2, 3));
    F.hut = rt.army.addStruct({ x: 0, z: -4, r: 3.8, solidR: 0, hp: 1500, maxHp: 1500, armor: 0.4, team: 0, name: '普請小屋' });
    W.sunoHut = F.hut;
    const mainParts = [], rampStart = FL.ramps.length, deckStart = FL.decks.length;
    F.hut.naka = fortShed(rt, MAIN_SHED, mainParts);
    F.hut.naka.struct = F.hut;
    F.hut.floors = { rampStart, rampEnd: FL.ramps.length, deckStart, deckEnd: FL.decks.length };
    F.hut.mesh = shedMesh(mainParts);
    rt.scene.add(F.hut.mesh);
    // 砦の内の小屋の並び：兵舎・倉・武器置場・兵糧置場・作業場（急ごしらえの板屋。柵の内側に寄せる）
    const shedParts = [];
    for (const p of SHEDS) fortShed(rt, p, shedParts);
    rt.scene.add(shedMesh(shedParts), tawara(W, 12, 13, .2, 6));
    fortView(rt);
    // 北西の物見は縄張り側が一つ置く。重ねて置かない。
    // 斜面の逆茂木：柵の外に尖った枝の束を並べる（北と東西。南の門の前は空ける）
    const sakamogi = { n: [], w: [], e: [] };
    for (let k = -2; k <= 2; k++) {
      // 北の口と西の寄せ道の中央は空け、枝で兵の足元を埋めない。
      if (k !== 0) {
        sakamogi.n.push(sunoSakamogi(W, k * 7, -FORT - 5.5, Math.PI, 5));
        sakamogi.w.push(sunoSakamogi(W, -FORT - 5.5, k * 7, -Math.PI / 2, 5));
      }
      sakamogi.e.push(sunoSakamogi(W, FORT + 5.5, k * 7, Math.PI / 2, 5));
    }
    rt.scene.add(lumber(W, 9, -10, 0.2));
    rt.scene.add(lumber(W, 10, 4, -0.1));
    rt.scene.add(lumber(W, -9, 7, 1.4));
    // 完成した西の守り場には足場を残さず、敵の顔と槍先を見通せるようにする。
    // 開いた北の口の両脇には足場を重ねない。北東の普請用の足場は残す。
    // 未完成の柵ぎわの資材：丸太の山・足場・俵（普請の途中の跡。A049）
    rt.scene.add(sunoNearFrame(lumber(W, -13, -18, 0.6)), sunoNearFrame(lumber(W, 14, -19, -0.4)), sunoNearFrame(lumber(W, -19, 12, 1.2)), tawara(W, 17, 8, 0.3, 4));
    // 普請の途中：北東の隅は櫓の足場だけ、縄を張った杭で次に結う柵の線を示す
    F.scaf = sunoNearFrame(scaffold(W, 13, -13, 0.1));
    rt.scene.add(F.scaf);
    // 北の口のすぐ内にあった馬繋ぎは、口と柵の間に人を閉じ込めた（本人が六十秒挟まった）。東の一つだけ残す。
    rt.scene.add(umatsunagi(W, 14.5, 4, Math.PI / 2, 8));
    // 打って出る時の控え馬。飾りの馬繋ぎだけでなく、手綱を取れる馬を一頭置く。
    const h = buildHorse();
    h.position.set(12, W.heightAt(12, 5), 5);
    h.rotation.y = Math.PI;
    rt.scene.add(h);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h, heading: Math.PI, spd: 0, t: 20, calm: true, from: { team: 0, house: '織田', name: '', speed: 1, hp: 200 } });
    // 控え馬の案内は最初の寄せの後。出陣の下知に重ねない。
    // 大軍：川向こうに斎藤の控えを置く遊びの配置。北と西の微高地にも備え（襲来はそこから来る）
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, kind, host: false });
      m.army.team = flag === 'oda' ? 0 : 1;
      m.army.jinkeiGuard = true; // 控えは近づいた本人の後へ勝手について行かない。
      return m;
    };
    // 岸の寄せ列と控えを分ける。西向きの隊は奥行きが東西の幅になる。
    // 人数は保ち、岸を進退する六隊と常駐する備を同じ地面へ重ねない（配置は遊びの補い）。
    // 馬の博物館「戦国武士と馬」：戦国期は歩兵の役割が大きく、馬上の戦闘は減った。
    // https://bajibunka.or.jp/uma/event/event_20230908.html
    // この場の騎馬比率は不明。百騎の塊でなく、徒歩を主に馬上の武者を添える補い。
    // 人数は兵種から切り離し、従来の二隊各百人を保つ。近くの寄せ手には触れない。
    // 百五十人ずつの鉄砲専隊を二つ並べる根拠は確認できない。
    // 同じ人数・同じ配置のまま、槍を主に鉄砲を添えた既存の備えへ替える。
    // これは兵種を断定しないための遊びの補いで、史実の比率を復元するものではない。
    // 東岸奥の一隊は、下で陣図の参照先とともに置く。
    const KS = [['mixed', 150], ['spear', 150], ['mixed', 150], ['spear', 150], ['mixed', 150], ['mixed', 100], [null, 150], ['mixed', 100], ['spear', 150]];
    [[146, -118], [146, -62], [146, -8], [146, 50], [146, 110], [180, -104], [180, -24], [180, 52], [180, 116]]
      .forEach(([x, z], i) => {
        const [kind, count] = KS[i];
        // 一・三の備えは従来の横長の持ち場を保ち、隣の控えへ広げない。
        const front = i === 0 || i === 2;
        if (kind) DA(x, z, front ? 28 : 16, front ? 6 : 28, count, -Math.PI / 2, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 7 + i, kind);
      });
    // 川向こうの控えは軽い旗列。参戦の記録がない龍興の本陣は置かない。
    F.jinEast = DA(180, -66, 12, 18, 100, -Math.PI / 2, 0x35382c, 'saito', 15, 'spear');
    // 陣幕と床几の大将まで描く本陣は、根拠のない指揮所を確定させてしまう。
    // 同じ百五十人・広がり・向きで、既存の混成の備えへ替える。陣の実位置の復元ではない。
    F.jinEnemyCamp = DA(180, -24, 30, 24, 150, -Math.PI / 2, 0x35382c, 'saito', 16, 'mixed');
    for (const [x, z] of [[132, -90], [134, 20], [136, 80], [150, -40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.jinNorth = DA(-30, -150, 60, 12, 200, 0.1, 0x35382c, 'saito', 17, 'mixed');
    DA(-120, -106, 24, 30, 160, 0.8, 0x3a3a30, 'saito', 18, 'spear');
    F.jinWest = DA(-150, -12, 12, 40, 140, Math.PI / 2, 0x35382c, 'saito', 19, 'spear');
    // 味方：南に控える織田の備え。史実の陣形ではなく、通り道を空ける遊びの配置。
    // 後詰九人の待機場所と重ねず、荷駄の街道と後詰が南門へ向かう道の東へ寄せる。
    // 百七十人と隊の広がりは保ち、陣形の札も同じ持ち場を指す。
    F.jinSupply = DA(-36, 100, 34, 14, 170, Math.PI, KT.ARMOR.oda, 'oda', 21, 'spear');
    // 南の控えも全員を鉄砲持ちにせず、人数・持ち場を保つ。
    DA(34, 104, 28, 6, 130, Math.PI, KT.ARMOR.oda, 'oda', 22, 'mixed');
    DA(-128, 90, 20, 14, 110, 2.0, KT.ARMOR.oda, 'oda', 23, 'mixed');
    sunoSupplyScenery(rt);
    // 家並みは南北に延びる自然堤防の上、八枚の刈田は東隣の後背低地へ向ける。
    // 当時の集落の復元ではなく、濃尾平野の土地利用を参考にした配置。
    KT.farVillage(rt, -100, 150, { rot: Math.PI / 2, n: 6, fields: 8, seed: 5, autumn: true, groundedHomes: true });
    // 秋の刈田：稲架は田の端に置き、家並みや控えの兵の列から離す。
    for (const [x, z, r] of [[-84, 128, 0.1], [-62, 140, 0.05], [-84, 158, -0.1], [-62, 174, 0.2]]) rt.scene.add(hasa(W, x, z, r, 9));
    for (const [x, z] of [[-36, 88], [34, 94]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 陸の材木と、川を使う伝承の資材輸送。材の一山を岸につないだ筏へ替える。
    rt.scene.add(lumber(W, -14, 34, 0.5), lumber(W, -36, 34, 1.2));
    sunoTimberRaft(rt);
    // 襲来ごとに岸へ出る六隊。常駐する備と奥の控えの間に通り道を取り、同じ場所に兵を重ねない。
    // 東岸は x=112。隊の奥行き八メートルごと陸に残し、前進しても川へ踏み込ませない。
    // 岸の三隊も鉄砲専隊とする根拠はない。各六十人と進退は保ち、他の控えと同じ混成の備えにする。
    // 史実の兵種比率を確定する変更ではなく、任務で斬り合う実兵の編成は従来どおり。
    F.far = SUNO_SHORE_RANKS.map((z, i) => ({ m: DA(126, z, 10, 8, 60, -Math.PI / 2, 0x35382c, 'saito', 40 + i, i % 2 ? 'mixed' : 'spear'), v: 0 }));
    // 写真の土塁上の旗列。織田の同じ紋を七メートル間隔で足し、北の普請口と井楼の梯子を空ける。
    const fortFlags = true
      ? [[-16, 9], [-16, 2], [16, 9], [16, 2], [-9, -16], [9, -16]]
      : [[-15, 15], [15, 15], [0, -15]];
    for (const [x, z] of fortFlags) rt.scene.add(sunoFortFlag(W, x, z));
    // 篝火（夕暮れに灯る）
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) W.addFire(x, z, { torch: true, h: 1.5, nightOnly: true });
    // 城の見栄え（A4）：篝火の火の下に鉄の籠の台、砦の外（北と西の寄せ口の間）に逆茂木、川の岸に竹束
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) rt.scene.add(kagaribi(W, x, z - 0.02));
    for (const [x, z, r] of [[-12, -25, Math.PI], [12, -25, Math.PI], [-25, -10, -Math.PI / 2], [-25, 10, -Math.PI / 2]]) sakamogi[x === -25 ? 'w' : 'n'].push(sunoSakamogi(W, x, z, r, 6));
    sunoMergeSakamogi(rt.scene, sakamogi);
    sunoMoatScenery(rt);
    // 北の二束は枝水路の川床・斜面から舟着きの平場へ上げる。
    // 水運の立地の参考：https://geo-gifu.org/tour/12_tour/tour_12_4.html
    // 当時の防御施設の復元ではなく、既存の川筋と陸上の設営を整合させる補い。
    // 四束の形・材質・向きは共用し、舟着きへの道と物見の足元は空ける。
    for (const [x, z] of [[40, -19], [42, -15], [40, 26], [42, 30]]) rt.scene.add(takataba(W, x, z, Math.PI / 2));
    F.perfect = true;

    const n = RANKS[rt.G.rank].squad || 5;
    // 守りや敵の強さを本人の身分で変えない。
    const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
    rt.makeSquad({ x: 0, z: 10 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    const tk = allyGroupA(rt, { name: '藤吉郎', fixed: true, fullStrength: true, anchor: { x: 4, z: 2 }, facing: Math.PI, formation: 'ring', aggro: 5 }, [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', invuln: true, allyOk: true, hat: 'jingasa_n' } }, { type: 'ashigaru', n: 4 }]);
    tk.leader = tk.units[0]; F.tk = tk;
    F.tokichiro = tk.units[0];
    const wk = allyGroup(rt, { name: '人足', fixed: true, fullStrength: true, anchor: { x: -6, z: -10 }, facing: 0, width: 3, aggro: 0 }, [{ type: 'porter', n: 10, o: { ...SUNO_PORTER_LOOK, porterLoad: sunoPorterLoad() } }]);
    F.wk = wk;
    wk.sunoWorkers = true;
    F.insideThreat = { x: 0, z: 0 };
    rt.marker('insideGuard', () => F.insideDanger && !F.ending && !F.won && !rt.over ? F.insideThreat : null,
      '人足の前の守り', { h: 2, guideArea: 'guard', guideRadius: 3, waitGuide: () => '味方と並び、人足へ来る敵を止めよ' });
    rt.marker('workGuard', () => F.buildBusy && F.buildPoint && F.woodDelivered && !F.insideDanger && !F.ending && !F.won && !rt.over ? F.buildPoint : null,
      '柵を直す人足', { h: 2, guideArea: 'guard', guideRadius: 5, waitGuide: () => '人足の道を空け、そばで敵を待て' });
    F.workers = wk.units.slice(0, 4);
    // 材木を運ぶ間も人足と敵を見張る。材を届けると実際の普請が早まる。
    F.buildStock = 0;
    // 木の材質は頂点の色を使う。木口も塗り、手元と地面の材を黒い塊にしない。
    const carryGeo = new THREE.CylinderGeometry(.12, .15, 2.1, 6);
    const carryColors = new Float32Array(carryGeo.attributes.position.count * 3);
    const barkColor = new THREE.Color(0x92734c), endColor = new THREE.Color(0xc2a16c);
    for (let i = 0; i < carryGeo.attributes.position.count; i++) {
      const c = Math.abs(carryGeo.attributes.normal.getY(i)) > .9 ? endColor : barkColor;
      carryColors[i * 3] = c.r; carryColors[i * 3 + 1] = c.g; carryColors[i * 3 + 2] = c.b;
    }
    carryGeo.setAttribute('color', new THREE.BufferAttribute(carryColors, 3));
    const carried = new THREE.Mesh(carryGeo, castleMat('wood'));
    carried.rotation.z = Math.PI / 2; carried.position.set(0, 1, .45); carried.visible = false;
    rt.player.u.mesh.add(carried); F.carriedWood = carried;
    const canCarry = () => !rt.over && !F.won && !F.ending && rt.player.u.alive;
    // 敗走中・深手で戦えない敵や、小屋の壁の向こうの敵で受け取りを止めない。
    // 槍の届く柵越しは危険として残す。案内役も同じ八歩の条件を使う。
    F.woodThreat = (e) => !e.fleeing && !e.woundOut && !e.noTarget && !e.group?.routed &&
      Math.abs(e.pos.y - rt.player.u.pos.y) < 3 &&
      !rt.army.wallBetween(e.pos, e.team, rt.player.u.pos,
        (e.wpnKind || e.lookWeapon || e.weapon) === 'spear');
    // 大きな丸太の山（-9, 7）には当たりがある。担ぐ材と印は東脇の空いた地面へ。
    // 案内役が山の外へよけ続け、長押しの距離へ入れない配置を避ける。
    const woodPick = SUNO_WOOD_PICK;
    // 担ぐ印を空の地面に置かず、本人が担ぐのと同じ材を低く積む。
    // 形と材質は担ぎ材と共用し、設営時だけ作る。
    const woodStack = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(carried.geometry, carried.material);
      const x = woodPick.x + (i < 3 ? (i - 1) * .32 : 0), z = woodPick.z;
      log.rotation.x = Math.PI / 2;
      log.position.set(x, W.heightAt(x, z) + (i < 3 ? .16 : .43), z);
      log.castShadow = true; log.receiveShadow = true; woodStack.add(log);
    }
    rt.scene.add(sunoNearFrame(woodStack));
    rt.addInteract('woodPick', () => canCarry() && !F.carryingWood && sunoCanHandleWood(rt) ? woodPick : null, '材木を担ぐ', () => {
      if (!canCarry() || F.carryingWood) return;
      if (!sunoCanHandleWood(rt)) { rt.bark('敵を押し返してから材木を担げ'); return; }
      F.carryingWood = true; carried.visible = true;
      rt.marker('woodDrop', () => canCarry() && F.carryingWood ? sunoWoodDrop(rt) : null, '材木を受け取る人足', { h: 2 });
      sunoProgress(rt, F.sunoTask || 'defend', '印の人足へ運び、材木を渡せ');
    }, { r: 3, hold: 1, prio: 2 });
    const woodReceiverPoint = () => {
      if (!canCarry() || !F.carryingWood || !sunoCanHandleWood(rt)) return null;
      const point = sunoWoodDrop(rt);
      return point && Math.abs(point.y - rt.player.u.pos.y) < 3 &&
        !rt.army.wallBetween(rt.player.u.pos, -1, point) ? point : null;
    };
    rt.addInteract('woodDrop', woodReceiverPoint, '材木を人足へ渡す', () => {
      if (!canCarry() || !F.carryingWood) return;
      // 長押しの途中で敵が来ても、材を消費せず守りへ戻す。
      if (!sunoCanHandleWood(rt)) { rt.bark('敵を押し返してから材木を渡せ'); return; }
      const point = woodReceiverPoint();
      if (!point || Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z) > 3) return;
      F.carryingWood = false; carried.visible = false; F.buildStock = Math.min(3, Math.max(0, Number.isFinite(F.buildStock) ? F.buildStock : 0) + 1);
      if (F.finalCheckSent && !F.buildBusy) F.finalChecked = true;
      else if (!F.buildBusy) {
        if (F.segs.some((s) => !s.alive)) repairFort(rt);
        else this.doubleFence(rt);
      }
      rt.unmark('woodDrop'); rt.army.play('wood', point, .7);
      if (!F.woodDelivered) {
        F.woodDelivered = true;
        rt.award((t) => t.side.push('材木を担ぎ、普請を早めた'), '材木を担ぎ、普請を早めた');
      }
      rt.bark(F.finalChecked ? '材木を渡し、仕上げの点検を終えた' : '材木が届いた。人足が柵を結ぶ手が早まる');
    }, { r: 3, hold: 1, prio: 2 });
    rt.marker('woodPick', () => canCarry() && !F.carryingWood ? woodPick : null, '普請に使う材木', { h: 2 });
    // 人足は斬り合いの場から下がって待つ。士気が崩れて砦の外へ散り、そのまま任務が終わる事はさせない。
    wk.noRout = true;
    F.ally = allyGroupA(rt, { name: '前野長康の手', fixed: true, fullStrength: true, formation: 'yari', anchor: { x: -14, z: 2 }, facing: -Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '前野長康', invuln: true, allyOk: true } }, { type: 'ashigaru', n: 10 }]);
    // 川並衆：東の柵（川の側）を受け持つ
    F.ally2 = allyGroupA(rt, { name: '川並衆', fixed: true, fullStrength: true, formation: 'yari', anchor: { x: 13, z: 2 }, facing: Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, allyOk: true, hat: 'jingasa_n' } }, { type: 'ashigaru', n: 9 }]);
    F.koroku = F.ally2.units[0];
    F.ally.leader = F.ally.units[0]; F.ally2.leader = F.koroku;
    this.reserves(rt);
    // 門の印は出陣直後から残す。閉じた柵の向こうの敵へ直進させない。
    rt.scene.add(sunoFortFlag(W, -3.8, FORT + 2), sunoFortFlag(W, 3.8, FORT + 2));
    rt.marker('exitGate', { x: 0, z: FORT + 2 }, '外へ出る門（南門）', { h: 2.5 });
    F.returnPoint = { x: 0, z: FORT + 4 };
    rt.marker('returnGate', () => sunoReturnPoint(rt), '砦へ戻る道（南門）', { h: 2.5, guideAlways: true });
    F.guardSide = 'n';
    rt.marker('post0', { x: 6, z: -FORT + 1.4 }, '守る柵', SUNO_GUARD_GUIDE);

    // 守る砦：後詰は三の手の段で一度だけ呼び、区域側からは重ねて出さない。
    // 寄せが退き、人足と柵が残り、敵のいない砦を二十秒守ってから勝つ。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'honjin', name: '砦の内', test: F.C.kuruwa.toride.test, pos: { x: 0, z: 0 }, need: 1, hold: 6, start: ZONE_STATE.FRIEND },
        { id: 'kishi', name: '岸の舟着き', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 3, hold: 8, start: ZONE_STATE.FRIEND },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      reinforceAt: { zoneId: 'honjin', sec: 150 },
      onReinforce: () => this.callReinforce(rt),
      winWhen: [
        [() => !!F.w3Clear && F.safeSince != null && rt.t - F.safeSince >= 20 && fortSafe(rt) && F.wk.count >= 2 && !F.buildBusy && F.segs.every((s) => s.alive) && F.finalChecked && F.woodDelivered, WIN.timeHeld('honjin', 4)],
      ],
      onWin: () => this.holdWin(rt),
    });

    rt.setPhase('brief');
    sunoObj(rt, 'defend', '材木を一度届け、柵の内で人足と小屋を守れ', 'main');
    rt.banner('敵が来る。砦はまだ組みかけじゃ', '人足が柵を結ぶ間、内から槍で守れ');
    sunoObj(rt, 'perfect', '追加の手柄：柵を一か所も破らせずに守れ（破れても主任務は続く）', 'side');
    rt.say('木下藤吉郎', '北の口へ。柵の内から槍で守れ。人足が柵を結ぶぞ', 3.5);
    // 砦は完成していない所から始まる（spec 17〜24）：北の柵は普請の途中で、北門もまだ塞がっていない。
    // 上役が出した普請の順に、組で人足を守る。敵が迫れば作業を止める。
    sunoObj(rt, 'gate', '北の口で、人足の普請を守れ', 'side');
    rt.marker('gateGuard', { x: 6, z: -FORT + 1.4 }, () => !rt.over && !F.ending && F.sunoTask === 'gate' ? '守る柵' : '', SUNO_GUARD_GUIDE);
    rt.after(4, () => {
      if (rt.over || F.ending || F.won) return;
      const mark = (id, seg, label) => rt.marker(id, { x: (seg.seg[0] + seg.seg[2]) / 2, z: (seg.seg[1] + seg.seg[3]) / 2 }, label);
      mark('buildGate', F.segs.gate[0], '北門の口');
      mark('buildSide', F.segs.unfinished[0], '北門の西脇の破れ');
      rt.choose('足軽大将「どちらの口から塞ぐ？」', [
      { label: '北門から塞ぐ', note: '人足を守り、北門を先に閉じる' },
      { label: '脇の柵から直す', note: '西を先に固め、北門は後にする' },
    ], (i) => {
      rt.unmark('buildGate'); rt.unmark('buildSide');
      if (rt.over || F.ending || F.won) return;
      const [g1, g2] = F.segs.gate;
      const extra = F.segs.unfinished.find((s) => s !== g1 && s !== g2);
      const order = i === 0 ? [g1, g2, extra] : [extra, g1, g2];
      rt.say('木下藤吉郎', i === 0 ? 'よし、北門から塞ぐぞ！' : '脇の破れからじゃ、急げ！', 2.5);
      finishBuild(rt, order, () => { sunoDone(rt, 'gate'); sunoRemove(rt, 'gate'); rt.say('木下藤吉郎', '北の柵、ひとまず塞いだぞ！', 2.5); });
      // 選び終えてから敵を動かす。時間切れでも最初の接敵は三十秒ほどに収める。
      F.nextWaveAt = Math.max(12, rt.t + 3);
      rt.after(F.nextWaveAt - rt.t, () => this.wave1(rt));
    }, 5); });
    // 操作の案内は短く一件ずつ。接敵中に判断の札を重ねない。
    rt.after(18, () => rt.bark(bows ? `号令の相手を「弓隊」に替えると、弓 ${bows}人へ命じられる` : '組は槍だけ。柵の内から突け'));
    rt.after(20, () => rt.bark('「守る場所」の印へ歩き、柵の内から槍で突け。外へ出る時は南門の旗へ'));
    // 最初の持ち場の印は敵が来ても残し、閉じた柵へ直進させない。
    // 槍の届く柵際を持ち場にし、前野の槍列と一緒に受ける。
    // 一の手の道は、寄せの頭が選ぶ（北の畑か、西の林の口か。毎回変わる）
    rt.after(9, () => {
      if (F.wave) return;
      const w = SIDE_WORD[F.r1.side];
      rt.say('木下藤吉郎', `敵は${w}から来る。まず北の口で人足を守れ`, 3.5);
    });
    // 柵の補強は材木を届ける行動、控えの弓は二の手の支度で進める。
    // 普請小屋で手当てを受けられる（襲来の合間の立て直し）
    F.healCd = 0;
    // 普請中や手当て不要の時は札を出さず、すぐ隣の材木を担ぐ操作と取り違えさせない。
    const healPoint = { x: -6, z: 5 };
    rt.addInteract('heal', () => canCarry() && !F.healUsed && !F.buildBusy && !F.carryingWood && sunoTreatmentNeeded(rt) ? healPoint : null, '傷を縛ってもらう（一度まで）', () => {
      if (F.healUsed) { rt.hud.flash('この小屋の手当ては一度まで。処置は済んだ', 'dim'); return; }
      const p = rt.player, u = p.u;
      if (p.treatmentLeft <= 0) { rt.hud.flash('手当ての布が尽きた', 'dim'); return; }
      if (!p.treatmentSafe()) { rt.hud.flash('敵から退き、足を止めて手当てを受ける', 'dim'); return; }
      if (F.buildBusy) { rt.hud.flash('人足は柵を直している。手が空くまで待て', 'dim'); return; }
      let helper = null, helperD = Infinity;
      for (const o of F.wk.units) if (o.alive && !o.fleeing && !o.woundOut) {
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < helperD) { helper = o; helperD = d; }
      }
      if (!helper) { rt.hud.flash('手当てをする者がいない', 'dim'); return; }
      if (Math.hypot(helper.pos.x - u.pos.x, helper.pos.z - u.pos.z) > 3) {
        F.wk.order = 'move'; F.wk.dest = { x: -6, z: 5 };
        F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; };
        rt.hud.flash('人足が来るまで、敵から離れて待て', 'dim'); return;
      }
      if (!p.treatWounds(0.05)) return;
      F.healUsed = true;
      rt.uninteract('heal'); rt.unmark('heal'); F.healMarked = false;
      rt.say('人足', '傷を縛りまする。ご無理なさいますな', 2.5);
      sfx('ui');
    }, { r: 4 });
    rt.after(50, () => rt.bark('深手を負ったら普請小屋へ。敵から離れ、足を止めて手当てを受けよ'));
    // 四項目の手ほどきは任務の下に残り続ける。ここでは持ち場と号令の短い案内に絞る。
    F.nextWaveAt = 12;
    buildBattleJin(rt);
    dressHachiFlags(rt);
    rt.scene.traverse((mesh) => {
      if (mesh.isMesh && mesh.material?.map?.userData.mon) mesh.material = sunoClothMaterial(mesh.material);
    });
    // 置き幟を一度だけ集める。視点に入る旗は布と竿をまとめて描く間だけ避ける。
    const placedFlags = [];
    rt.scene.traverse((group) => {
      if (!group.userData.flag) return;
      placedFlags.push(group.userData.flag);
      group.traverse((mesh) => {
        if (mesh.isMesh && mesh.material && !Array.isArray(mesh.material)) mesh.material = sunoNearMaterial(mesh.material);
      });
    });
    const allyFade = rt.player.allyFade.bind(rt.player), flagSight = new THREE.Vector3();
    rt.player.allyFade = (cam) => {
      allyFade(cam);
      if (!cam) return;
      // 背中までの線だけでは、正面の敵を覆う幟を拾えない。
      // 最終の視線を本人の三歩先まで延ばす。足元を受ける既存判定へ高さを合わせる。
      const length = cam.position.distanceTo(SUNO_VIEW.value) + 3;
      flagSight.copy(cam.position).addScaledVector(SUNO_FORWARD.value, length);
      flagSight.y -= 1.4;
      for (const flag of placedFlags) {
        if (flagBlocksView(flag, cam.position, rt.player.u.pos, 3) ||
            flagBlocksView(flag, cam.position, flagSight, 1.35)) rt.player.hideNearFlag(flag);
      }
    };
    // 人足の背の材木だけ、カメラへ食い込む近さで透かす。形と材質は使い回す。
    for (const g of [wk, F.supplyReserve]) for (const u of g.units) {
      for (const mesh of u.mesh.children) if (mesh.geometry === sunoLoad) mesh.material = sunoNearMaterial(mesh.material, true);
    }
    tk.formation = 'ring';
    // 稲生の型：担ぐ・手当ての札と印は出さない。材木は届いた扱い。
    F.woodDelivered = true; F.healUsed = true;
    for (const id of ['woodPick', 'woodDrop', 'heal']) { rt.uninteract(id); rt.unmark(id); }
    F.botBrain = makeSunomataBrain(rt);
  },

  reserves(rt) {
    const F = rt.flags;
    F.r1 = pickYose(rt); F.r2 = F.r1.id === 'kita' ? YOSE.nishi : YOSE.kita;
    const camp = (name, at, facing, list) => enemyGroup(rt, { fixed: true, faction: 'saito', name, anchor: at, facing, order: 'hold', formation: 'yari', yariRanks: 3, width: 6, aggro: 4, seekRange: 6, noAI: true, fleeDir: { x: at.x < -60 ? -1 : 0, z: at.x < -60 ? 0 : -1 } }, aiji(list, SAITO_AIJI));
    // 一の手は仕寄りから押し出した位置に控える。既存の先手が数秒歩いて柵へ取り付く。
    const firstAt = { x: F.r1.yose.x + F.r1.dir.x * 4, z: F.r1.yose.z + F.r1.dir.z * 4 };
    // 一の手は先手と後詰の二つ。先手が柵の口で揉み合う間に後詰が押し出し、組が一度に二十人を受けないようにする。
    F.reserveW1 = camp('斎藤の一の手', firstAt, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1, o: { name: '斎藤方の先手頭' } }, { type: 'ashigaru', n: 11 }]);
    F.reserveW1b = camp('斎藤の一の手（後詰）', { x: firstAt.x - F.r1.dir.x * 10, z: firstAt.z - F.r1.dir.z * 10 }, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }]);
    // 波の合間に柵を探る物見の小勢（一の手の後は一の手の側、二の手の後は北の畑から）
    F.probe1 = camp('斎藤の物見', { x: F.r1.from.x - F.r1.dir.x * 2, z: F.r1.from.z - F.r1.dir.z * 2 }, Math.atan2(F.r1.dir.x, F.r1.dir.z), [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    F.probe2 = camp('斎藤の物見（北）', { x: 14, z: -66 }, 0, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 1 }]);
    // 二の手は寄せの口の手前（柵から四十米ほど）に控え、砦から旗が見える。一の手の後、すぐ寄せて来る間合い。
    const r2At = { x: F.r2.from.x - F.r2.dir.x * 6, z: F.r2.from.z - F.r2.dir.z * 6 };
    F.reserveW2 = camp('斎藤の二の手', r2At, Math.atan2(F.r2.dir.x, F.r2.dir.z), [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 3 }]);
    // 北の畑・西の林という寄せの筋を保ち、控えを寄せ場の後ろへ置く。
    // 百米以上の道を歩く控えは遠景に任せ、本物を一分以上待たせない。
    F.reserveW3a = camp('斎藤の三の手（北）', { x: -10, z: -56 }, 0.45, [{ type: 'samurai', n: 1, o: { name: '斎藤方の旗持ち', flag: 'saito', flagScale: 1.8, tag: 'flag' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }]);
    F.reserveW3b = camp('斎藤の三の手（西）', { x: -56, z: -10 }, 1.2, [{ type: 'busho', n: 1, o: { name: '斎藤方の寄せ大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 3 }]);
    // 三の手の十五人を後続の三組へ分ける。総兵数を増やさず、同じ兵が順に寄せる。
    F.duskWaves = ['n', 'w', 'n'].map((side, i) => ({
      side, startedAt: null,
      group: camp(`日暮れの寄せ手（${['一', '二', '三'][i]}の組）`,
        side === 'n' ? { x: 12 + i * 4, z: -52 } : { x: -52, z: 12 },
        side === 'n' ? 0 : Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]),
    }));
    F.reserveW3d = camp('西の林の寄せ手', { x: -106, z: -26 }, Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }]);
    F.supplyEnemy = camp('西の林の物見', { x: -142, z: 48 }, Math.PI / 2, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
    F.boatWaves = [-20, -6, 8].map((z, i) => {
      const g = camp(`舟の寄せ手（${['一', '二', '三'][i]}の舟）`, { x: 130, z }, -Math.PI / 2,
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 2 }]);
      g.aggro = 0; g.fire = false; g.noRout = true; return g;
    });
    F.boatCrew = F.boatWaves[0];
    const guard = (name, at, list, formation = 'yari') => allyGroupA(rt, { fixed: true, fullStrength: true, name, anchor: at, facing: Math.PI, formation, aggro: 5, width: 3 }, list);
    F.gunReserve = guard('川並衆の鉄砲', { x: -6, z: 6 }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }], 'line');
    F.bowReserve = guard('控えの弓', { x: 6, z: 6 }, [{ type: 'bow', n: 2 }], 'line');
    F.supplyReserve = guard('材木の荷駄', { x: -112, z: 104 }, [{ type: 'porter', n: 4, o: { ...SUNO_PORTER_LOOK, porterLoad: sunoPorterLoad() } }, { type: 'ashigaru', n: 2 }], 'column');
    F.supplyReserve.speed = 1.5;
    // 荷駄と後詰は呼ばれるまで動かない（共通の頭が「敵が七十米に来た」と西の林の物見へ打って出させていた）
    F.supplyReserve.stay = true;
    F.reinforceReserve = guard('南の控え', { x: -64, z: 112 }, [{ type: 'ashigaru', n: 9 }], 'column');
    F.reinforceReserve.stay = true;
    // 柵へ取り付く寄せ手は、三割ほど討たれると竹束の陰へ崩れる（城攻めの寄せは長く持たない）。
    // 柵の内の守り手は足場と柵の陰の分だけ傷が浅い。数で劣る組が持ち場を守れる釣り合いにする。
    for (const g of [F.reserveW1, F.reserveW2, F.reserveW3a, F.reserveW3b, F.reserveW3d, ...F.duskWaves.map((q) => q.group), ...F.boatWaves]) g.morale = 72;
    for (const g of [F.ally, F.ally2, F.tk, F.gunReserve, F.bowReserve]) if (g) g.defMult = 1.4;
    F.reserveB1 = yoseButai(rt, F.reserveW1, { name: '北西の先手の備', at: F.reserveW1.anchor, dir: F.r1.dir, back: 160 });
    F.reserveB2 = yoseButai(rt, F.reserveW2, { name: '北西の次の備', at: F.reserveW2.anchor, dir: F.r2.dir, back: 150 });
    F.reserveB3a = yoseButai(rt, F.reserveW3a, { name: '北の控えの備', at: F.reserveW3a.anchor, dir: { x: 0.4, z: 0.92 }, back: 130 });
    F.reserveB3b = yoseButai(rt, F.reserveW3b, { name: '西の控えの備', at: F.reserveW3b.anchor, dir: { x: 0.93, z: 0.36 }, back: 130 });
    F.flagbearer = F.reserveW3a.units[0];
    F.yoseBoss = F.reserveW3b.units.find((u) => u.name === '斎藤方の寄せ大将') || null;
    this.boats(rt, null);
  },

  wave1(rt) {
    const F = rt.flags;
    if (F.wave || F.ending || F.won || rt.over) return;
    F.wave = 1; F.waveT = 0; F.nextWaveAt = 0; F.w1T = rt.t;
    rt.setPhase('w1');
    const r = F.r1 || YOSE.kita, w = SIDE_WORD[r.side];
    F.guardSide = r.side;
    rt.marker('post0', r.side === 'n' ? { x: 6, z: -FORT + 1.4 } : { x: -FORT + 1.4, z: 0 }, `守る場所（${w}の柵）`, SUNO_GUARD_GUIDE);
    F.W1 = F.reserveW1;
    F.B1 = F.reserveB1; F.B1.push();
    yoseApproach(rt, F.W1, r, r.side);
    rt.after(16, () => {
      if (rt.over || F.ending || F.won || F.next2) return;
      F.W1b = F.reserveW1b;
      if (!F.W1b.count || F.W1b.routed) return;
      yoseApproach(rt, F.W1b, r, r.side, 1);
      rt.bark(`${w}の後詰が押し出してきた。口を空けるな`, true);
    });
    gateWall(rt, r.side === 'n');
    rt.banner('斎藤勢、来襲', `${w}より`);
    rt.say('木下藤吉郎', `敵の法螺と早打ちじゃ！　${w}から竹束を押して来る。柵の内で受けよ！`, 3.5);
    rt.after(6, () => {
      if (rt.over || F.ending || F.won || F.next2) return;
      rt.say('斎藤方の先手頭', '柵が結ばれる前に押せ！　あの人足を止めるのだ！', 3);
    });
    rt.after(10, () => { if (rt.over || F.ending || F.won || !F.W1 || !F.W1.count || F.W1.routed) return; rt.say('前野長康', 'わしの手も柵で受ける。お主は印の柵へ。内から槍を揃えよ', 3.5); });
    rt.marker('w', centerOf(F.W1), '敵の寄せ', { red: true, group: F.W1 });
    sunoProgress(rt, 'defend', '');
    sunoObj(rt, 'defend', `${w}の柵の内から槍で寄せ手を止めよ`, 'main');
    sunoEnemySignal(rt, F.W1);
  },

  wave2(rt) {
    const F = rt.flags;
    if (F.W2 || F.ending || F.won || rt.over) return;
    F.wave = 2; F.waveT = 0; F.nextWaveAt = 0; sunoRemove(rt, 'scout'); sunoRemove(rt, 'gate');
    rt.setPhase('w2');
    // 波ごとに日が傾く：二の手は昼下がり、三の手で夕焼け
    rt.world.setTime('afternoon');
    // 二の手の道：寄せの頭が、一の手で守りが厚くなった側を避けて選ぶ（毎回変わる）
    // 二の手は控えていた側（一の手の反対）から寄せる。控えの場から遠い側へ百米以上歩かせると、戦の間が空く。
    const r = F.r2 || YOSE.kita, w = SIDE_WORD[r.side];
    F.guardSide = r.side;
    rt.marker('post0', r.side === 'n' ? { x: 6, z: -FORT + 1.4 } : { x: -FORT + 1.4, z: 0 }, `守る場所（${w}の柵）`, SUNO_GUARD_GUIDE);
    F.W2 = F.reserveW2;
    F.B2 = F.reserveB2; F.B2.push();
    const g = F.W2, c = g.center();
    g.formation = 'column'; g.colW = 2; g.speed = 2.2;
    // 同じ側なら前へ進む。側を替える時だけ砦の北西を回り、遠い控えへ逆戻りしない。
    // 縦隊の「道」は後列が遅れると先頭が待ち続け、二の手が控えの場で立ち尽くした（八十秒以上）。
    // 一つずつの行き先（move）で歩かせ、着かなくても update の見張りが寄せ場へ向かわせる。
    const fromNorth = c.z < -FORT - 12;
    const go = (q) => { if (!rt.over && !F.ending && F.wave === 2) yoseApproach(rt, q, r, r.side); };
    g.order = 'move';
    if (fromNorth === (r.side === 'n')) { g.dest = { ...r.from }; g.onArrive = go; }
    else { g.dest = { x: -FORT - 14, z: -FORT - 14 }; g.onArrive = (q) => { q.order = 'move'; q.dest = { ...r.from }; q.onArrive = go; }; }
    F.w2Go = rt.t; F.w2Fn = go;
    gateWall(rt, r.side === 'n');
    rt.banner('二の手', `${w}より`);
    rt.say('木下藤吉郎', `敵の法螺と早打ち、${w}の旗が動いた！　柵を守れ。南西の材木も迎えるぞ`, 4);
    rt.marker('w', centerOf(F.W2), '敵の寄せ', { red: true, group: F.W2 });
    sunoObj(rt, 'defend', `${w}の柵の内から二の手を止めよ`, 'main');
    sunoEnemySignal(rt, F.W2);
    // 西の柵の内に味方の鉄砲（まだ数は少ない）。二の手が柵へ寄せた所で一斉に放つ
    F.gunW = F.gunReserve;
    F.gunW.order = 'move'; F.gunW.dest = r.side === 'n' ? { x: -3, z: -FORT + 5 } : { x: -FORT + 5, z: -3 };
    F.gunW.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.facing = r.side === 'n' ? Math.PI : -Math.PI / 2; };
    const bow = F.bowReserve;
    bow.order = 'move'; bow.dest = { x: 5, z: -FORT + 6 };
    bow.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.facing = Math.PI; };
    rt.after(9, () => {
      if (rt.over || F.ending || F.won || F.wave !== 2) return;
      rt.say('蜂須賀正勝', `${w}へ鉄砲を回した。竹束の陰から出た敵を撃つぞ`, 3.5);
    });
    // 荷駄を迎える寄り道は無い（稲生の型）。材木は届いた扱いで、林の組は最後の寄せに加わる。
    F.nidaDone = true; F.saved = 2; F.KEwait = false;
  },

  wave3(rt) {
    const F = rt.flags;
    if (F.wave >= 3 || F.ending || F.won || rt.over) return;
    rt.unmark('post0');
    // 荷駄がまだ着かないまま日が傾いた時は、着いた分で材木の行方を決めて三の手へ移る。
    if (F.K && !F.nidaDone) {
      F.nidaDone = true; rt.unmark('nida'); rt.unmark('gate'); rt.unmark('ke');
      if (F.saved >= 2) { sunoDone(rt, 'nida'); rt.award((t) => { t.side.push('材木を届けた'); t.c.portersSaved = F.saved; }, '材木を届けた'); this.doubleFence(rt); }
      else sunoFail(rt, 'nida');
    }
    F.wave = 3; F.waveT = 0; F.nextWaveAt = 0; sunoRemove(rt, 'nida');
    sunoPost(rt, F.post3 === 'e' ? '東の柵で川並衆と舟の敵を止めよ' : '柵を守れ。舟は川並衆に任せよ', F.post3 || 'n');
    rt.setPhase('w3');
    rt.world.setTime('dusk');
    F.w3T = rt.t;
    // 寄せの時刻は保ち、最後に材を運び、修理と十八秒の点検をする間を残す。
    F.finishAt = Math.min(480, rt.t + 225);
    F.duskNext = 0;
    // 荷駄を狙う役が終わった林の組も、同じ生き残りで最後の寄せに加わる。敵を足し直さない。
    if (F.supplyEnemy.count && !F.supplyEnemy.routed) {
      F.lastPush = F.supplyEnemy;
      F.lastPush.focus = null; F.lastPush.onArrive = null;
      F.lastPush.order = 'assault'; F.lastPush.noAI = false;
      F.lastPush.assault = assaultFn(rt, 'w'); F.lastPush.speed = 3; F.lastPush.aggro = 8; F.lastPush.seekRange = 45;
      rt.after(14, () => {
        if (rt.over || F.ending || F.won || !F.lastPush.count || F.lastPush.routed) return;
        rt.say('前野長康', '林に残った者も西の柵へ来る。追わずに、ここで受けるぞ', 3.5);
      });
    }
    F.W3a = F.reserveW3a;
    F.B3a = F.reserveB3a; F.B3a.push();
    yoseApproach(rt, F.W3a, YOSE.kita, 'n', 2);
    gateWall(rt, true);
    F.W3b = F.reserveW3b;
    F.B3b = F.reserveB3b; F.B3b.push();
    yoseApproach(rt, F.W3b, YOSE.nishi, 'w', 2);
    // 北西の寄せのあと、三隻が二十六秒ずつ間を空けて出る。各舟の弓と槍が東の柵へ寄せる。
    rt.after(32, () => {
      if (rt.over || F.ending || F.won || F.wave !== 3) return;
      rt.say('足軽', '川に舟が出たぞ！　斎藤の者が川を渡ってくる！', 3.5);
      if (F.post3 === 'e') sunoPost(rt, '舟が着く前に東の柵へ。川並衆と並んで守れ', 'e');
      rt.marker('boats', () => ({ x: F.boats[1].m.position.x, z: F.boats[1].m.position.z }), '川を渡る舟', { red: true, h: 2.5 });
      this.boats(rt, (g, i) => {
        if (i === 0) { F.W3c = g; F.landT = rt.t; }
        g._sunoLandT = rt.t; g.order = 'assault'; g.noAI = false; g.noRout = false; g.aggro = 8; g.seekRange = 45; g.fire = true; g.speed = 3;
        g.anchor.x = 58; g.assault = assaultFn(rt, 'e');
        if (!g.count) { rt.bark('舟から岸へ寄せる者はいない'); return; }
        rt.army.play('eshout', { x: 54, z: -6 }, 1.4);
        rt.say('蜂須賀正勝', ['一の舟が着いた！　川の口はわしと守れ！', '二の舟じゃ！　槍を揃え、柵の内で受けるぞ！', 'これが最後の舟。押し返せば、人足が仕上げに回れるぞ！'][i], 3.5);
        if (F.post3 === 'e') sunoPost(rt, i < 2 ? '東の柵で舟の敵を止めよ。次の舟も来る' : '東の柵で最後の舟の敵を止め、普請を守れ', 'e');
        battleEvent(rt, EVENT_REINFORCEMENT, { x: 54, z: -6 }, g, 1, true,
          F.post3 === 'e' ? '川から新手。東の柵を守れ' : '川から新手。東の柵は川並衆が受ける');
        rt.marker('w3', centerOf(g), '敵の寄せ（東）', { red: true, group: g });
      });
    });
    F.flagbearer = F.W3a.units[0];
    // 伏兵：西の林から不意に
    rt.after(22, () => {
      if (rt.over || F.ending || F.won || F.wave !== 3) return;
      // 開戦時から林に控えた同じ組が出る。見つけて先に退ければ復活しない。
      F.W3d = F.reserveW3d;
      if (!F.W3d.count || F.W3d.routed) return;
      F.W3d.order = 'assault';
      F.W3d.assault = assaultFn(rt, 'w');

      rt.banner('西の寄せ手', '林から出る');
      rt.say('足軽', '西の林の組が出てきたぞ！', 3);
      rt.marker('w4', centerOf(F.W3d), '西の林の寄せ手', { red: true, group: F.W3d });
    });
    rt.banner('最後の寄せ', '北と西の旗。川には舟');
    rt.say('木下藤吉郎', '選んだ柵を守れ。日暮れまでに敵を退け、普請を終えるぞ', 4);
    rt.after(7, () => {
      if (rt.over || F.ending || F.won || F.wave !== 3) return;
      rt.say('斎藤方の寄せ大将', '北と西から押し寄せよ！　舟の手も岸へ付け！', 3);
    });
    rt.marker('w', centerOf(F.W3a), '敵の寄せ（北）', { red: true, group: F.W3a });
    rt.marker('w2', centerOf(F.W3b), '敵の寄せ（西）', { red: true, group: F.W3b });
    rt.marker('flag', unitPos(F.flagbearer), '敵の旗', { red: true, group: F.W3a });
    sunoObj(rt, 'defend', '最後の寄せを止め、砦の内を守れ', 'main');
    sunoEnemySignal(rt, F.W3a);
    rt.bark('旗が崩れれば寄せ手も揺れる。柵を離れて追うな');
  },

  // 物見の小勢：柵の一区画に取り付き、破れ目を探る。数は少なく、討つか追えば退く。
  probe(rt, k, g, side) {
    const F = rt.flags;
    if (rt.over || F.ending || F.won || !g || !g.count || g.routed) return;
    F['PR' + k] = g; F['pr' + k + 'T'] = rt.t;
    g.order = 'assault'; g.assault = assaultFn(rt, side); g.speed = 3; g.formation = 'line';
    rt.marker('pr' + k, centerOf(g), '柵を探る物見', { red: true, group: g });
    rt.bark(`${SIDE_WORD[side]}の柵に斎藤の物見が寄る。破れ目を探らせるな`, true);
  },

  // 材木を運んだ人足が、北の柵を一区画ずつ結び直して補強する。
  doubleFence(rt) {
    const F = rt.flags;
    if (F.w3Clear) { F.reinforcePending = false; return; }
    if (F.doubleFence || F.reinforcing || F.reinforceStopped) return;
    if (F.buildBusy) { F.reinforcePending = true; return; }
    F.reinforcePending = false;
    F.reinforcing = true;
    const remaining = F.segs.filter((s) => s.side === 'n' && !s.reinforced).sort((a, b) => Number(a.alive) - Number(b.alive));
    const done = () => { F.reinforcing = false; F.doubleFence = F.segs.every((s) => s.side !== 'n' || s.reinforced); };
    if (!remaining.length) done(); else finishBuild(rt, remaining, done, true);
  },
  // 完了時に新しい大型櫓を出さない。既存の足場と小さな物見で守りを固める。
  fortDone(rt) {
    rt.army.play('wood', { x: 13, z: -13 }, 1);
  },
  // 開戦時から同じ舟・兵を置く。船上だけ固定し、舷から歩いて同じ兵が上陸する。
  boats(rt, onLand) {
    const F = rt.flags;
    if (F.boats) { F.onLand = onLand; return; }
    // 東岸は百十二からだが、その手前四メートルも浅い斜面。
    // 全長七メートルの船尾まで深みに収め、岸に乗り上げた姿で待機させない。
    // 上陸の順・二十四秒の渡河・乗り手の人数は保つ。航路は遊びの補い。
    F.boats = [[105, -20], [105, -6], [105, 8]].map(([x, z], i) => {
      const m = kobune(x, -0.65, z, -Math.PI / 2);
      rt.scene.add(m);
      // 全長七メートルの舟首を陸へ突き込まず、河床のある岸ぎわで止める。
      // 舟の中心を六十四に置き、同じ乗り手が舳先から浅い岸へ歩いて上がる。
      return { m, x, z, x1: 64, delay: i * 26, group: F.boatWaves[i], landed: false, passengers: F.boatWaves[i].units.map((u, j) => {
        const at = { x: x + (Math.floor(j / 2) - 1.5) * 1.1, y: -0.35, z: z + (j % 2 ? .4 : -.4) };
        u.perch = at; u.pinT = Infinity;
        u.pos.set(at.x, -0.35, at.z); u.mesh.position.copy(u.pos);
        return { u, at, dx: at.x - x, dz: at.z - z };
      }) };
    });
    F.boatT = 0;
  },
  moveBoats(rt, dt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.won || !F.boats || F.landed || !F.onLand) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    F.boatT = (Number.isFinite(F.boatT) ? F.boatT : 0) + dt;
    for (let i = 0; i < F.boats.length; i++) {
      const b = F.boats[i];
      if (b.landed || F.boatT < b.delay) continue;
      const k = Math.min(1, (F.boatT - b.delay) / 24);
      let landed = true;
      b.m.position.x = b.x + (b.x1 - b.x) * k;
      b.m.rotation.z = Math.sin(F.boatT * 1.7 + b.z) * 0.03;
      for (const q of b.passengers) {
        if (!q.u.alive || !q.u.perch) continue;
        if (q.u.woundOut || q.u.fleeing || q.u.noTarget) { q.u.perch = null; q.u.pinT = 0; continue; }
        if (k >= 1) q.dx -= dt * 1.2;
        q.at.x = b.m.position.x + q.dx; q.at.z = b.z + q.dz;
        q.at.y = q.at.x <= 60 ? rt.world.heightAt(q.at.x, q.at.z) : -0.35;
        q.u.pos.set(q.at.x, q.at.y, q.at.z);
        q.u.mesh.position.copy(q.u.pos);
        if (q.at.x <= 58) { q.u.perch = null; q.u.pinT = 0; }
        else landed = false;
      }
      if (k >= 1 && landed) { b.landed = true; F.onLand(b.group, i); }
    }
    if (F.boats.every((b) => b.landed)) { F.landed = true; rt.unmark('boats'); }
  },

  // 川向こうの押し出し：襲来ごとに二隊が岸まで出て、しばらく睨んでから戻る
  moveFar(rt, dt) {
    const F = rt.flags;
    if (F.wave && F.farWave !== F.wave) {
      F.farWave = F.wave;
      for (const q of F.far.slice((F.wave - 1) * 2, F.wave * 2)) { q.v = 1; q.t = 0; }
    }
    for (const q of F.far) {
      if (!q.v) continue;
      q.t += dt;
      if (q.v === 1 && !q.go) { q.go = true; q.m.advance(9, 8); }
      if (q.v === 1 && q.t > 34) { q.v = -1; q.m.retreat(9, 13); }
      if (q.v === -1 && q.t > 48) { q.v = 0; q.go = false; }
    }
    nagashinojo.kit.backTick(rt);
    // 替えた組だけ一度整える。任務の控え・人足・舟の兵には触れない。
    for (const g of rt.army.groups) if (g.woke && !g.sunomataFormed) {
      g.sunomataFormed = true;
      g.formation = g.woke.kind === 'honjin' ? 'ring' : g.units.some((u) => u.type === 'gun' || u.type === 'bow' || u.mounted) ? 'line' : 'yari';
      g.yariRanks = 3;
      for (const u of g.units) u.mesh.scale.set(1, 1, 1);
      // 寄せの後ろの備は、本物に替えても隊列のまま控える。開いた北門へ一度に雪崩れ込ませず、
      // 柵へ取り付くのは台本の波だけにする（一の手で人足が討ち尽くされて七十秒で終わった）。
      if (g.team === 1) {
        g.order = 'hold'; g.guard = false; g.noAI = true; g.aggro = 3; g.seekRange = 6; g.sunoRear = true;
        const d = Math.hypot(g.anchor.x, g.anchor.z);
        if (d < FORT + 22) { const k = (FORT + 22) / (d || 1); g.anchor.x *= k; g.anchor.z *= k; }
        g.facing = Math.atan2(-g.anchor.x, -g.anchor.z);
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    sunoArrowWarning(rt);
    sunoFooting(rt);
    SUNO_VIEW.value.copy(rt.player.u.pos); SUNO_VIEW.value.y += 1.4;
    rt.hud.root.classList.toggle('suno-death', !rt.player.u.alive);
    rt.hud.root.classList.toggle('suno-last', F.wave === 3 && !F.ending && !F.won && !rt.over);
    if (F.choiceSeen !== rt.choice) { F.choiceSeen = rt.choice; F.choiceFoldAt = rt.t + 1.5; }
    rt.hud.root.classList.toggle('suno-choice-folded', !!rt.choice && (reduceMotion() || rt.t >= F.choiceFoldAt));
    // 実在の人足四人だけ、普請中に手を動かす。歩み・体力・勝敗は変えない。
    if (!rt.over && rt.player.u.alive && !F.ending && !F.won && !reduceMotion() && F.buildBusy && F.workHands) for (const u of F.workers) {
      if (!u.alive || u.dying || u.gone || u.fleeing || u.woundOut || u.moving > .1 || u.offscreen || !u.armR || !u.armL) continue;
      const beat = .5 + .5 * Math.sin(rt.t * 5 + u.id * 1.7);
      aimArm(u.armR, .24, .8 + beat * .42, .38);
      aimArm(u.armL, -.2, .83, .4);
    }
    const gone = (g) => !g || g.routed || !g.units.some((u) => u.alive && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
    butaiTick(rt, dt);
    tickTabas(rt, dt);
    this.moveFar(rt, dt);
    this.moveBoats(rt, dt);
    if (!fortSafe(rt)) { F.w3Clear = false; F.safeSince = null; }
    if (F.SZ && !F.ending && !rt.over) F.SZ.tick(dt);
    if (F.won || F.ending || rt.over || !rt.player.u.alive) {
      if (!F.woodClosed) {
        F.woodClosed = true; F.carriedWood.visible = false;
        rt.uninteract('woodPick'); rt.uninteract('woodDrop'); rt.unmark('woodPick'); rt.unmark('woodDrop');
      }
      return;
    }
    if (!F.hut.alive && rt.canFailMission()) { this.onStructDestroyed(rt, F.hut); return; }
    // 寄せが退いても修理や点検が止まれば終わらなかった。期限は接敵の猶予と別に必ず判定する。
    const deadline = F.finishAt ?? 480;
    if (rt.t >= deadline && F.w3Clear && F.safeSince != null && rt.t - F.safeSince >= 20 && F.finalChecked && F.woodDelivered && !F.buildBusy && F.segs.every((s) => s.alive)) {
      this.holdWin(rt);
      if (F.won) return;
    }
    // 稲生の型：日暮れまで小屋と人足を守り抜けば、残りの寄せは退いて勝ち（守り抜けの一行と同じ物差し）。
    if (rt.t >= deadline && F.wave === 3 && F.hut.alive && F.wk.count >= 2 && !F.wk.routed) {
      for (const g of rt.army.groups) if (g.team !== rt.player.u.team && !g.routed && g.count) { g.noRout = false; g.morale = 0; }
      this.holdWin(rt, true); return;
    }
    if (rt.t >= deadline || (rt.canFailMission() && (F.wk.count < 2 || F.wk.routed))) {
      F.ending = true; rt.tracker.main = false; sunoFail(rt, 'defend');
      for (const id of ['gate', 'nida', 'porters', 'scout', 'post', 'flag', 'perfect']) {
        const task = F.sunoTasks?.get(id);
        if (task && !task.state) sunoFail(rt, id);
      }
      for (const id of ['post3', 'gate', 'nida', 'porterGuide', 'heal', 'hut', 'scout', 'ke', 'flagdrop', 'w', 'w2', 'w3', 'w4', 'boats', 'post0', 'flag', 'pr1', 'pr2']) rt.unmark(id);
      rt.uninteract('heal'); rt.uninteract('flag');
      sunoObj(rt, 'retreat', '任務は失敗。南門の外へ退け。組をまとめよ', 'main');
      retreatFort(rt);
      if (rt.t >= deadline) rt.world.setTime('dusk');
      const failureReason = F.wk.count < 2 || F.wk.routed ? '人足が足りず、柵を仕上げられなかった'
        : !F.w3Clear || !fortSafe(rt) ? '日暮れまでに最後の寄せを退けられなかった'
        : F.buildBusy || F.segs.some((s) => !s.alive) ? '日暮れまでに破れた柵を直せなかった'
        : !F.woodDelivered ? '日暮れまでに材木を人足へ届けなかった'
        : !F.finalChecked ? '日暮れまでに柵の結び目の点検が済まなかった'
        : '寄せ手が退くのが遅く、日暮れまで砦の安全を確かめられなかった';
      rt.banner('普請を止め、組を下げる', failureReason);
      rt.say('木下藤吉郎', `${failureReason}。南の門へ退け、組を散らすな！`, 4);
      rt.finish({ failureReason, scriptedEnd: true }, 12); return;
    }
    F.waveT = (F.waveT || 0) + dt;
    if (rt.t < (F.noticeT || 0)) return;
    F.noticeT = rt.t + 1;
    if (!F.buildBusy) {
      if (F.buildPending) { const q = F.buildPending; F.buildPending = null; finishBuild(rt, q.order, q.onDone); }
      else if (F.repairPending) repairFort(rt);
      else if (F.reinforcePending) this.doubleFence(rt);
    }
    // 一人の侵入でも人足の前を守る。危険が去れば元の任務と持ち場へ戻す。
    // 柵の内の敵の固まりへ、藤吉郎の手と川並衆が持ち場ごと寄って槍を向ける。退けば元の持ち場へ戻る。
    let inN = 0, threat = null, guardHand = null, closest = Infinity;
    const work = sunoWorkShelter(rt);
    // 柵越しに人足へ届く槍も、普請を止める時と同じ十メートルで見張る。
    // 敵が柵を越えるまで救援を待つと、端の人足だけが先に討たれる。
    for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && !u.group?.noAI && Math.abs(u.pos.x) < FORT + 10 && Math.abs(u.pos.z) < FORT + 10) {
      let threatensHand = false;
      // 砦内でも、人足から遠い敵だけで救援を続けて運搬の印を隠さない。
      // 北と東から同時に入ると平均点が空き地になる。実際の人足に最も近い敵を受ける。
      for (const hand of F.wk.units) {
        if (!hand.alive || hand.gone || hand.fleeing || hand.woundOut) continue;
        const d = Math.hypot(u.pos.x - hand.pos.x, u.pos.z - hand.pos.z);
        if (d >= 10 || rt.army.wallBetween(u.pos, -1, hand.pos,
          (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) continue;
        threatensHand = true;
        if (d < closest) { closest = d; threat = u; guardHand = hand; }
      }
      if (threatensHand) inN++;
    }
    F.insideDanger = inN > 0;
    if (F.insideDanger) {
      // 敵の固まりの中心へ本人を誘わず、避難する人足の前へ案内する。
      // 退き先へ着く前も、実際に襲われている人足の前を示す。遠い避難先へ案内しない。
      const handPos = guardHand ? guardHand.pos : work;
      const dx = (threat ? threat.pos.x : handPos.x) - handPos.x, dz = (threat ? threat.pos.z : handPos.z) - handPos.z;
      const d = Math.max(1, Math.hypot(dx, dz)), step = Math.min(3, d * .5);
      F.insideThreat.x = handPos.x + dx / d * step;
      F.insideThreat.z = handPos.z + dz / d * step;
      if (!rt.world.walkable(F.insideThreat.x, F.insideThreat.z) || rt.army.wallBetween(handPos, -1, F.insideThreat)) {
        F.insideThreat.x = handPos.x; F.insideThreat.z = handPos.z;
      }
      sunoObj(rt, 'rescue', '人足へ迫る敵を止め、普請を守れ', 'main');
      sunoProgress(rt, 'rescue', `普請の人足${F.wk.count}人。印の所で味方と槍を並べよ`);
      // 普請中の退避は作業先と人足の実際の間合いで決める。
      // 反対の柵への侵入で、安全な側の修理まで止めない。
      if (!F.buildBusy && !F.wk.routed) {
        F.workHands = false;
        F.wk.order = 'move'; F.wk.dest = work; F.wk.speed = 2.2;
        F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
      }
    } else if (F.sunoTasks?.has('rescue')) sunoRemove(rt, 'rescue');
    for (const g of [F.tk, F.ally, F.ally2]) {
      if (!g || !g.count || g.routed || g.order !== 'hold') continue;
      if (inN >= 1 && threat) {
        if (!g._sunoHome) {
          g._sunoHome = { x: g.anchor.x, z: g.anchor.z };
          g._sunoHomeFacing = g.facing;
        }
        g._sunoCover ||= { x: 0, z: 0 };
        // 三隊を人足の前の一点へ重ねず、敵を向く列の中央と左右へ分ける。
        const dx = threat.pos.x - F.insideThreat.x, dz = threat.pos.z - F.insideThreat.z;
        const d = Math.hypot(dx, dz) || 1;
        const flank = g === F.ally ? -4 : g === F.ally2 ? 4 : 0;
        const x = Math.max(-FORT + 3, Math.min(FORT - 3, F.insideThreat.x + dz / d * flank));
        const z = Math.max(-FORT + 3, Math.min(FORT - 3, F.insideThreat.z - dx / d * flank));
        g._sunoCover.x = x; g._sunoCover.z = z;
        if (!rt.world.walkable(x, z) || rt.army.wallBetween(F.insideThreat, -1, g._sunoCover)) {
          g._sunoCover.x = F.insideThreat.x; g._sunoCover.z = F.insideThreat.z;
        }
        g.anchor = g._sunoCover;
        g.facing = Math.atan2(dx, dz);
        g.aggro = 12;
      } else if (g._sunoHome) { g.anchor = g._sunoHome; g._sunoHome = null; g.facing = g._sunoHomeFacing; g.aggro = 5; }
    }
    // 稲生の型：守る段は藤吉郎の手と自分の組がピンの柵の内へ集まる（守る所に味方が集まる絵）。
    if (!F.insideDanger && sunomata.missionOf(rt) === 0) {
      const p = sunoPostPoint(rt);
      const fac = p.side === 'n' ? Math.PI : p.side === 'e' ? Math.PI / 2 : -Math.PI / 2;
      for (const g of [F.tk, ...(rt.squadGroups || [])]) {
        if (!g?.count || g.routed || g._sunoHome || g.order !== 'hold') continue;
        const at = g._sunoGather || (g._sunoGather = { x: 0, z: 0 });
        at.x = p.x + (p.side === 'e' ? -3 : p.side === 'w' ? 3 : 0); at.z = p.z + (p.side === 'n' ? 3 : 0);
        g.anchor = at; g.facing = fac;
      }
    }
    for (const g of rt.squadGroups || []) if (g.count) { const c = g.center(); g.defMult = Math.abs(c.x) < FORT && Math.abs(c.z) < FORT ? 1.3 : 1; }
    // 控えの寄せ手は、自分の番が来るまで共通の頭で打って出ない（三の手の控えが一の手の間に砦へ入っていた）。
    for (const g of [F.W1, F.W1b, F.PR1, F.PR2, F.W2, F.W3a, F.W3b, F.W3c, F.W3d, F.KE, F.scoutOut]) if (g && g.noAI) { g.noAI = false; g.aggro = Math.max(g.aggro, 8); g.seekRange = Math.max(g.seekRange || 0, 45); }
    // 遠さだけで寄せを打ち切らない。最後の舟も同じ兵が柵へ向かい、傷ついた小勢だけ退く。
    for (const g of F.boatWaves) if (g._sunoLandT != null && !gone(g)) {
      g.noAI = false; g.order = 'assault'; g.aggro = 8; g.seekRange = 45;
    }
    for (const [g, t0] of [[F.boatWaves[1], F.boatWaves[1]._sunoLandT], [F.boatWaves[2], F.boatWaves[2]._sunoLandT], [F.W1, F.w1T], [F.W1b, F.w1T], [F.PR1, F.pr1T], [F.PR2, F.pr2T], [F.W2, F.w2Go], [F.W3a, F.w3T], [F.W3b, F.w3T], [F.W3c, F.landT], [F.W3d, F.w3T], [F.lastPush, F.w3T]]) {
      if (gone(g) || t0 == null || rt.t - t0 < 40 || g.count > 3) continue;
      g.noRout = false; g.morale = 0;
    }
    for (const k of [1, 2]) if (F['PR' + k] && gone(F['PR' + k])) rt.unmark('pr' + k);
    // 寄せの見張り：歩いている波が十秒ほとんど進まなければ（後列待ち・到着判定の詰まり）、次の段へ進める。
    for (const g of [F.W1, F.W1b, F.PR1, F.PR2, F.W2, F.W3a, F.W3b]) {
      if (gone(g) || g.order !== 'move') { if (g) g._sunoStall = null; continue; }
      const c = g.center(), st = g._sunoStall || (g._sunoStall = { x: c.x, z: c.z, t: rt.t });
      if (Math.hypot(c.x - st.x, c.z - st.z) > 3) { st.x = c.x; st.z = c.z; st.t = rt.t; continue; }
      if (rt.t - st.t < 10) continue;
      g._sunoStall = null;
      const f = g.onArrive; g.onArrive = null;
      if (f) f(g); else { g.order = 'assault'; g.formation = 'yari'; }
    }
    F.portersUnsafe = false;
    if (F.nidaDone && F.portersLeft > 0) {
      let left = 0;
      for (const u of F.K.units) if (u.type === 'porter' && u.alive && !u.saved) {
        if (Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        else {
          left++;
          if (rt.army.nearestEnemy(u, 12, (e) => !e.fleeing && !e.woundOut && !e.noTarget)) F.portersUnsafe = true;
        }
      }
      F.portersLeft = left;
      if (left) {
        sunoObj(rt, 'porters', `南門の外に人足${left}人。道を守って迎えよ`, 'side');
        if (!F.porterGuideMarked) {
          F.porterGuideMarked = true;
          rt.marker('porterGuide', () => !rt.over && !F.ending && !F.won && F.sunoTask === 'porters' ? supplyGuidePoint(rt) : null,
            () => F.supplyGuideAt === 0 ? '人足を迎える南門'
              : F.supplyGuideAt < SUPPLY_GUIDE.length ? '人足へ向かう道の曲がり角' : '残った人足の守り', { guideAlways: true });
        }
      } else {
        rt.unmark('porterGuide'); F.porterGuideMarked = false;
        sunoRemove(rt, 'porters');
        const allSaved = F.K.units.every((u) => u.type !== 'porter' || u.saved);
        rt.award((t) => { t.c.portersSaved = F.saved; t.c.portersLeft = 0; if (allSaved) t.side.push('遅れた人足も迎えた'); }, allSaved ? '遅れた人足も迎えた' : '外の人足の行方を確かめた');
      }
    }
    // 波の後ろの旗列も退く。札と後ろの動きの判定は一秒おき。
    for (const [b, g] of [[F.B1, F.W1], [F.B2, F.W2], [F.B3a, F.W3a], [F.B3b, F.W3b]]) {
      if (b && !b._back && gone(g)) { b._back = true; if (b.light) b.light.retreat(40, 14); }
    }
    // 深手のときだけ、手当ての場所を示す
    if (rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.65 && !(F.hurtHintT > rt.t)) {
      F.hurtHintT = rt.t + 12;
      rt.bark(Math.abs(rt.player.u.pos.x) > FORT || Math.abs(rt.player.u.pos.z) > FORT ? '南門から戻れ。敵を向いて構えよ'
        : rt.player.treatmentLeft > 0 && !rt.player.bandaged && !F.healUsed
          ? F.buildBusy ? '味方の後ろへ退け。人足は普請中じゃ。敵から離れて傷を縛れ' : '味方の後ろへ。小屋で傷を縛れ'
          : '構えて味方の後ろへ下がれ', true);
    }
    const low = rt.player.u.alive && !F.healUsed && !rt.player.bandaged && rt.player.treatmentLeft > 0 && rt.player.u.hp < rt.player.u.maxHp * 0.55 && !(F.healCd > rt.t);
    if (low && !F.healMarked) { F.healMarked = true; rt.marker('heal', { x: -6, z: 5 }, '手当て', { h: 2.5 }); }
    if (!low && F.healMarked) { F.healMarked = false; rt.unmark('heal'); }
    // 小屋の見える傷みと、物見の知らせ。正確な耐久や敵の到着秒は出さない。
    const hutPct = Math.round(F.hut.hp / F.hut.maxHp * 100);
    const wait = F.nextWaveAt ? Math.ceil(F.nextWaveAt - rt.t) : 0;
    sunoProgress(rt, 'defend', F.carryingWood ? '印の人足へ運び、材木を渡せ' : wait > 0 ? F.wave
      ? F.woodDelivered ? F.workNotice || '材木は届いた。柵の内で次の寄せに備えよ' : '材木の印で担ぎ、印の人足へ運べ'
      : '人足の普請を守り、最初の寄せに備えよ' : hutPct > 50 ? '柵の内から寄せ手を止め、人足を守れ' : '小屋が傷んでいる。組を小屋へ戻し、取り付いた敵を止めよ');
    // 襲来の十秒前：物見が敵の旗の動きを知らせる。
    if (F.wave && wait > 0 && wait <= 10 && F.warnFor !== F.nextWaveAt) { F.warnFor = F.nextWaveAt; rt.bark('物見「北と西で旗が動いた。持ち場に付け！」', true); }
    // 小屋が打たれ始めたら早めに知らせ、印を立てる（気づいた時には手遅れ、にならないように）
    const hw = hutPct <= 25 ? 25 : hutPct <= 50 ? 50 : hutPct <= 85 ? 85 : 0;
    if (hw && hw < (F.hutWarnLevel || 100) && rt.t >= (F.hutWarnAt || 0)) {
      if (!F.hutWarnLevel) { rt.marker('hut', { x: 0, z: -4 }, '普請小屋', { h: 5 }); rt.after(30, () => rt.unmark('hut')); }
      F.hutWarnLevel = hw; F.hutWarnAt = rt.t + 8;
      if (hw === 85) rt.say('木下藤吉郎', '小屋に敵が取り付いた！　組を連れて戻れ、小屋を守れ！', 3.5);
      else rt.bark('普請小屋が危ない！　中に入った敵を押し返せ', true);
    }
    if (F.wave === 1 && gone(F.W1) && (!F.W1b || gone(F.W1b)) && rt.t - F.w1T > 18 && fortSafe(rt) && !F.next2) {
      F.next2 = true; F.next2T = rt.t;
      rt.unmark('w');
      rt.say('木下藤吉郎', 'ようやった！　じゃが、まだ来るぞ。今のうちに備えを直せ', 4);
      sunoObj(rt, 'defend', F.woodDelivered ? '破れた柵を直し、次の寄せに備えよ' : '材木の印で担ぎ、印の人足へ渡せ', 'main');
      repairFort(rt);
      // 下知を読み、選んでから物見と次の寄せを動かす。
      rt.after(4, () => {
        if (rt.over || F.ending || F.won || F.wave !== 1) return;
        rt.choose('材木が来る。守る所は？', [
        { label: '砦で柵を直す', note: '人足を守る。林の敵は残る' },
        { label: '南門から林の敵を追う', note: '荷駄を守り、五十秒で戻る' },
      ], (i) => {
        if (rt.over || F.ending || F.won || F.wave !== 1) return;
        rt.G.rel.tokichiro.like += 3;
        // 未配達の時は往復と長押しの間を取り、小勢の寄せも同じ切れ目の後にする。
        const supplyPause = i === 0 && !F.woodDelivered ? 28 : 10;
        rt.after(i === 0 ? supplyPause : 1, () => this.probe(rt, 1, F.probe1, F.r1.side));
        if (i === 0) {
          this.doubleFence(rt);
          rt.say('木下藤吉郎', F.woodDelivered ? 'よし、人足が北の柵を固める。寄せに備えよ' : '今のうちに小屋の南西で材木を担げ。印の人足へ渡すのじゃ', 3.5);
          rt.after(supplyPause, () => this.wave2(rt)); F.nextWaveAt = rt.t + supplyPause;
        }
        else {
          F.scoutOut = F.supplyEnemy;

          sunoObj(rt, 'scout', '西の林の物見を追い払え', 'side');
          rt.marker('scout', centerOf(F.scoutOut), '西の林の物見', { red: true, group: F.scoutOut });
          rt.say('木下藤吉郎', '南の門から出よ。林に潜む者を追い散らせ。遅れるなよ、二の手が来るまでに戻れ', 4);
          F.scoutT = rt.t;
        }
      }, 5); });
    }
    // 保険：判断の段で二の手が始まらないまま長引いたら、二の手を始める
    if (F.next2T && !F.W2 && !F.wave2Q && rt.t - F.next2T > 110) { F.wave2Q = true; this.wave2(rt); }
    if (F.scoutOut && !F.scoutDone) {
      const q = F.scoutOut;
      sunoProgress(rt, 'scout', `南門から林へ。あと${Math.max(0, Math.ceil(50 - (rt.t - F.scoutT)))}秒で切り上げる`);
      if (gone(q) || rt.t - F.scoutT > 50) {
        F.scoutDone = true; rt.unmark('scout');
        if (gone(q)) { F.woodsClear = true; sunoDone(rt, 'scout'); rt.award((t) => t.side.push('西の林の物見を追い払った'), '西の林の物見を追い払った'); rt.say('木下藤吉郎', 'でかした！　これで荷駄の道は安い。戻れ、二の手じゃ', 3.5); }
        else { sunoFail(rt, 'scout'); rt.say('木下藤吉郎', 'もうよい、戻れ！　二の手が来るぞ', 3); }
        sunoObj(rt, 'defend', '南門から砦へ戻り、組をまとめよ', 'main');
        sunoProgress(rt, 'defend', '次は柵の守り。南門の旗へ戻れ');
        rt.after(10, () => this.wave2(rt)); F.nextWaveAt = rt.t + 10;
      }
    }
    if (F.wave === 2) {
      // 荷駄
      if (F.K && !F.nidaDone) {
        for (const u of F.K.units) {
          if (u.alive && u.type === 'porter' && !u.saved && Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        }
        let alivePorters = 0;
        for (const u of F.K.units) if (u.alive && u.type === 'porter' && !u.saved) alivePorters++;
        sunoProgress(rt, 'nida', F.saved >= 2 ? `材木が届いた。門外の人足${alivePorters}人を迎えよ`
          : alivePorters ? `門外に人足${alivePorters}人。南門の先の道を守れ` : '運ぶ人足を失った。砦の守りへ戻れ');
        if (F.saved >= 2 && (alivePorters === 0 || F.waveT > 150)) {
          F.nidaDone = true; sunoDone(rt, 'nida'); rt.unmark('nida');
          F.portersLeft = alivePorters;
          const allSaved = F.K.units.every((u) => u.type !== 'porter' || u.saved);
          const deed = allSaved ? '荷駄と人足を守った' : alivePorters ? '材木を届けた。門外の人足が残る' : '材木を届けた。人足を失った';
          rt.award((t) => { t.side.push(deed); t.c.portersSaved = F.saved; t.c.portersLeft = alivePorters; }, deed);
          if (alivePorters) rt.say('人足', `まだ外に${alivePorters}人おる。南門の道を守ってくれ`, 3.5);
          rt.say('木下藤吉郎', '材木が届いた！　人足を北の柵に回せ', 3.5);
          this.doubleFence(rt);
          battleEvent(rt, EVENT_MESSENGER, { x: 0, z: 8 }, F.K, 0, true, '材木が砦に届いた。北の柵を固める');
        } else if (F.saved + alivePorters < 2 || F.waveT > 150) {
          F.nidaDone = true; sunoFail(rt, 'nida'); rt.unmark('nida');
          rt.say('木下藤吉郎', '材木が足りぬ。今ある柵で受ける。砦へ戻れ', 3);
        }
      }
      // 荷駄を狙う組：狙った人足が倒れたか砦へ入ったら次の人足へ。狙う荷駄がもう無ければ西の林へ退く（林の口で立ち尽くさない）
      if (F.KE && !gone(F.KE) && !F.KEwithdraw) {
        const fo = F.KE.focus;
        if (!fo || !fo.alive || fo.saved) {
          const next = F.nidaDone ? null : F.K && F.K.units.find((u) => u.alive && u.type === 'porter' && !u.saved);
          if (next) F.KE.focus = next;
          else {
            F.KE.focus = null; F.KE.order = 'move'; F.KE.dest = { x: -150, z: 48 }; F.KEwithdraw = true;
            F.KE.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
          }
        }
      }
      if (F.nidaDone) rt.unmark('gate');
      if (F.KE && (gone(F.KE) || F.KEwithdraw)) rt.unmark('ke');
      if (F.W2 && volleyAt(rt, 'sunoW2', F.gunW, [F.W2], { r: 34, until: rt.t + 1e9, hit: 26, who: '蜂須賀正勝', text: '竹束の陰から出たぞ。鉄砲、揃えて放て！', then: ['木下藤吉郎', '斉射で二の手が揺れた！　追うな。柵の内で槍を揃え、人足を守れ！'] })) {
        sunoCue(rt, '味方の合図：鉄砲、揃えて放て。斉射の後も柵を守れ');
      }
      // 荷駄の結果が出たら、柵を直し最後の持ち場を選ぶ。
      // 二の手が崩れたら、荷駄の行方を長く待たずに三の手へ（荷駄を待つ間、六十秒以上だれも来なかった）。
      if (gone(F.W2) && F.w2ClearT == null) F.w2ClearT = rt.t;
      const nidaSettled = F.nidaDone && !F.portersUnsafe && (gone(F.KE) || (F.KEwithdraw && Math.hypot(F.KE.center().x, F.KE.center().z) > FORT + 12)) && !F.KEwait;
      if (fortSafe(rt) && gone(F.W2) && (nidaSettled || rt.t - F.w2ClearT > 6) && !F.next3) {
        F.next3 = true;
        rt.unmark('w');
        rt.say('木下藤吉郎', '日が傾いてきた。次が正念場じゃ', 3.5);
        repairFort(rt);
        // 判断：夕暮れの三の手に、組をどこに置くか
        rt.after(4, () => {
          if (rt.over || F.ending || F.won || F.wave !== 2) return;
          rt.choose('藤吉郎「北と東、どちらの柵を守る？」', [
          { label: '北の柵を守る', note: '北の敵を止める。東は川並衆へ' },
          { label: '東の柵を守る', note: '川並衆と舟の敵を止める' },
        ], (i) => {
          if (rt.over || F.ending || F.won || F.wave !== 2) return;
          F.post3 = i === 0 ? 'n' : 'e';
          F.guardSide = F.post3;
          const groups = rt.squadGroups || [];
          const pt = i === 0 ? { x: 0, z: -FORT + 3 } : { x: FORT - 3, z: 0 };
          for (let k = 0; k < groups.length; k++) {
            const sg = groups[k]; if (!sg.count || sg.routed) continue;
            const post = i === 0 ? { x: k * 5 - 3, z: -FORT + 6 + k * 2 } : { x: FORT - 6 - k * 5, z: k * 5 + 2 };
            sg.order = 'move'; sg.dest = post; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = post; g.facing = i === 0 ? Math.PI : Math.PI / 2; };
          }
          rt.marker('post3', pt, i === 0 ? '北の柵' : '東の川の側', SUNO_GUARD_GUIDE);
          // 持ち場の印は最後の寄せを受け終わるまで残す。
          rt.say('木下藤吉郎', i === 0 ? 'よし、北を固めよ。東は小六に任せる' : 'よし、川の側じゃ。北は守りの手に踏ん張らせる', 3);
          const supplyPause = F.woodDelivered ? 5 : 22;
          rt.after(F.woodDelivered ? 1 : supplyPause, () => this.probe(rt, 2, F.probe2, 'n'));
          rt.after(supplyPause, () => this.wave3(rt)); F.nextWaveAt = rt.t + supplyPause;
        }, 15); });
        sunoObj(rt, 'defend', '柵を直し、最後の持ち場を選べ', 'main');
        // 三の手の時計は判断の返事から数える。選ぶ途中に寄せを始めない。
      }
    }
    // 三の手と最後の押しを退け、普請の点検が済めば味方の合図で終える。
    if (F.wave === 3) {
      if (F.saved >= 2 && F.waveT >= 55 && !F.reinforced) { F.reinforced = true; this.callReinforce(rt); }
      const left = Math.max(0, Math.ceil(F.finishAt - rt.t));
      const workGuide = F.carryingWood ? '担いだ材木を印の人足へ渡せ'
        : F.buildBusy && !F.workHands ? F.workNotice || '柵を直す人足を守れ'
        : !F.woodDelivered ? '材木はまだ届けていない。寄せの合間に一度運べ'
        : F.buildBusy ? F.workNotice || '柵を直す人足を守れ'
        : F.segs.some((s) => !s.alive) ? '破れ目を守れ。寄せの合間に柵を直す' : '敵を退け、柵の修理と点検まで終えよ';
      const countdown = `${left <= 45 ? '日が沈むぞ' : left <= 90 ? '日暮れが近い' : '日が傾いてきた'}。期限あと${left}秒。${workGuide}`;
      // 後続は四十五秒から二十五秒おき。最後の組にも接敵・退却と、修理・点検の時間を残す。
      const q = F.duskWaves[F.duskNext];
      if (q && rt.t >= F.w3T + (45 + F.duskNext * 25) * Math.min(180, F.finishAt - F.w3T) / 180) {
        F.duskNext++;
        q.startedAt = rt.t;
        const g = q.group;
        if (!gone(g)) {
          g.noAI = false; g.order = 'assault'; g.onArrive = null;
          g.assault = assaultFn(rt, q.side); g.speed = 3; g.aggro = 8; g.seekRange = 45;
          sunoPost(rt, `${SIDE_WORD[q.side]}の柵で日暮れの寄せ手を止めよ`, q.side);
          rt.marker('w4', centerOf(g), `日暮れの寄せ手（${SIDE_WORD[q.side]}）`, { red: true, group: g });
          rt.bark(`${SIDE_WORD[q.side]}から次の寄せ手。柵の内で受けよ`, true);
        }
      }
      for (const wave of F.duskWaves) {
        if (wave.startedAt != null && rt.t - wave.startedAt >= 40 && wave.group.count <= 3 && !gone(wave.group)) {
          wave.group.noRout = false; wave.group.morale = 0;
        }
      }
      sunoProgress(rt, 'post', countdown);
      sunoProgress(rt, 'defend', countdown);
      // 侵入の任務が先に出ている間も、日暮れの期限と仕上げの必要を隠さない。
      if (F.insideDanger) sunoProgress(rt, 'rescue', `日暮れまで${left}秒。人足${F.wk.count}人。味方と印へ。敵を退け、柵を仕上げよ`);
      const warning = left <= 15 ? 15 : left <= 30 ? 30 : left <= 60 ? 60 : 0;
      if (warning && warning !== F.duskWarn) {
        F.duskWarn = warning;
        rt.bark(`日暮れまで${left}秒！　砦の敵を退け、柵を仕上げよ`, true);
      }
      if (F.duskNext === F.duskWaves.length && F.duskWaves.every((q) => gone(q.group)) && F.landed && F.W3d && gone(F.W3a) && gone(F.W3b) && F.boatWaves.every(gone) && gone(F.W3d) && gone(F.lastPush) && fortSafe(rt)) {
        this.holdWin(rt); if (F.won) return;
        if (!F.w3Clear) {
          sunoRemove(rt, 'post');
          sunoObj(rt, 'defend', F.woodDelivered ? '柵の修理と仕上げをする人足を守れ' : '材木を運び、柵の修理と仕上げを助けよ', 'main');
          rt.say('木下藤吉郎', '寄せ手は退いた。追うな。砦の内で柵を仕上げるぞ', 3.5);
        }
        F.w3Clear = true;
        if (rt.phase !== 'end') rt.setPhase('end');
        if (F.safeSince == null) F.safeSince = rt.t;
        if (!F.buildBusy && F.segs.some((s) => !s.alive)) repairFort(rt);
        if (!F.buildBusy && F.segs.every((s) => s.alive) && !F.finalCheckSent) {
          F.finalCheckSent = true;
          F.finalCheckAt = rt.t;
          sunoObj(rt, 'defend', F.woodDelivered ? '柵の結び目を点検中。人足を守れ' : '材木を担ぎ、印の人足へ渡せ', 'main');
          rt.say('人足', left < 18 ? '日暮れが迫る！　材木を担ぎ、印のわしらへ渡してくれ！'
            : '結び目を見回るぞ。十八秒ほど守れ。材木を渡してくれれば早い', 3.5);
          // 柵沿いは兵舎と物見でふさがる。中央の小道から結び目を見渡して仕上げる。
          F.wk.order = 'path'; F.wk.formation = 'column'; F.wk.colW = 2; F.wk.speed = 1.8;
          const c = F.wk.center(), lane = c.x < 0 ? -6 : 6;
          F.wk.path = [[lane, c.z], [lane, -10], [0, -10], [6, -10], [6, 5], [0, 10], [-6, 5], [-6, -10]]; F.wk.pathIdx = 0;
          F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -4, z: 9 }; F.finalChecked = true; };
          // 縦隊の道は後列待ちで止まる事がある。見回りは十八秒で済んだものとし、勝ちの判定を止めない。
          rt.after(18, () => { if (!F.finalCheckSent || F.finalChecked) return; F.finalChecked = true; F.wk.order = 'move'; F.wk.dest = { x: -4, z: 9 }; F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -4, z: 9 }; }; });
        }
        if (F.finalChecked && F.woodDelivered && !F.buildBusy && F.segs.every((s) => s.alive) && rt.t - F.safeSince >= 20) { this.holdWin(rt); return; }
        const safeLeft = Math.max(0, Math.ceil(20 - (rt.t - F.safeSince)));
        sunoProgress(rt, 'defend', `期限あと${left}秒。` + (!F.woodDelivered ? '材木を一度、人足へ届けよ' : F.buildBusy ? F.workNotice || '柵を直す人足を守れ。材木を渡せば早まる'
          : F.segs.some((s) => !s.alive) ? '人足の道を空け、破れた柵を直させよ'
          : !F.finalChecked ? F.finalCheckSent
            ? `点検あと${Math.max(0, Math.ceil(18 - (rt.t - F.finalCheckAt)))}秒。${left < 18 - (rt.t - F.finalCheckAt) ? '材木をもう一度渡せば、点検が済む' : '砦の内で守れ。材木を渡せば早まる'}`
            : '人足の道を空け、点検を始めさせよ'
          : `点検は済んだ。あと${safeLeft}秒、砦の内を守れ`));
      } else {
        F.w3Clear = false; F.safeSince = null;
        if (rt.phase === 'end') rt.setPhase('w3');
      }
    }
  },

  // 守りきった（三の手を退け、砦の内の安全と普請の仕上げを確かめた）。
  holdWin(rt, force = false) {
    const F = rt.flags;
    // 稲生の型：寄せを退けた瞬間（寄せ大将を討てばその場）で勝つ。修理と点検の待ちは置かない。
    if (F.won || F.ending || rt.over || !F.hut.alive || !force && !fortSafe(rt)) return;
    {
      const warning = document.getElementById('rain-mark');
      if (warning) warning.hidden = true;
      rt.unmark('w4');
      F.won = true;
      rt.unmark('w'); rt.unmark('w2'); rt.unmark('w3'); rt.unmark('flag');
      for (const id of ['post3', 'gate', 'nida', 'porterGuide', 'heal', 'hut', 'scout', 'ke', 'pr1', 'pr2']) rt.unmark(id);
      rt.uninteract('heal'); sunoRemove(rt, 'gate'); sunoRemove(rt, 'porters');
      sunoDone(rt, 'defend');
      const deed = F.perfect ? '墨俣の人足と小屋を守り、柵を破らせず普請を仕上げた'
        : '墨俣の柵は破られたが、人足と小屋を守り、普請を仕上げた';
      rt.award((t) => {
        t.main = true; t.side.push(deed);
        if (F.perfect) t.special = { label: '砦の完全防衛', pts: 30 };
      }, F.perfect ? '主任務達成・砦の完全防衛' : '辛うじて普請を仕上げた・柵の完全防衛は失敗');
      if (F.perfect) { sunoDone(rt, 'perfect'); rt.grantTitle('perfect'); }
      if (F.flagOffered && !F.flagTaken) sunoFail(rt, 'flag');
      rt.banner(F.perfect ? '守りきった' : '辛うじて砦を残した', F.perfect ? '墨俣に砦が建つ' : '柵は破られたが、人足と小屋を守り、普請を仕上げた');
      rt.say('木下藤吉郎', F.perfect ? `守りきったぞ！　${nm(rt)}、お主のおかげじゃ！`
        : '柵は破られた。じゃが、人足と小屋は残った。辛うじて普請を仕上げたな', 4);
      this.fortDone(rt);
      sfx('horagai', 0.8);
      sunoRemove(rt, 'post');
      rt.unmark('flagdrop'); rt.uninteract('flag');
      battleEvent(rt, EVENT_RETREAT, { x: 0, z: -FORT }, F.W3a, 1, true, F.perfect
        ? '寄せ手が退く。墨俣の普請を守りきった' : '寄せ手が退く。破れた柵を直し、辛うじて砦を残した');
      for (const id of TASK_ORDER) sunoRemove(rt, id);
      sunoObj(rt, 'complete', '人足と小屋を守り、普請を仕上げた', 'main');
      rt.uninteract('woodPick'); rt.uninteract('woodDrop'); rt.unmark('woodPick'); rt.unmark('woodDrop');
      F.carriedWood.visible = false;
      rt.finish({ scriptedEnd: true }, 16);
      // 余韻は終わりの段に入ってから積む（finish の退き口の支度が、それより前の時計を消す）。
      // 勝鬨が上がり、川向こうの旗が退き、次の戦（稲葉山）へ思いを向けて閉じる。
      rt.after(1.5, () => rt.army.play('eiei', { x: 0, z: 0 }, 1.1));
      rt.after(4, () => rt.say('人足', F.woodDelivered ? 'あんたの材木が役に立った。杭も結び目も、これで持つぞ' : '槍で守ってくれたおかげじゃ。わしらの手で柵が結べた', 3));
      rt.after(7.5, () => rt.say('', '信長公記には、信長が墨俣の守りを固めたとある。一夜城は後に伝わった物語。', 4));
      rt.after(12, () => rt.say('木下藤吉郎', '次は稲葉山。美濃を取るには、まだお主の働きが要るぞ', 3));
    }
  },

  // 守る砦の援軍（fort-spec 18）：南から後詰の一隊が駆けつけ、砦の内へ入って加勢する
  callReinforce(rt) {
    const F = rt.flags;
    if (F.reinforceCalled || F.won || F.ending || rt.over) return;
    F.reinforceCalled = true;
    const r = F.reinforceReserve;
    if (!r.count || r.routed) return;
    r.order = 'path'; r.pathIdx = 0; r.path = [[-64, 112], [-36, 44], [0, 26], [0, FORT - 4]]; r.speed = 2.6;
    r.onArrive = (g) => {
      g.order = 'hold'; g.anchor = { x: 0, z: FORT - 4 }; g.aggro = 12;
      if (rt.over || F.won || F.ending) return;
      rt.bark('南門へ後詰が着いた。砦を固める');
      battleEvent(rt, EVENT_REINFORCEMENT, { x: 0, z: FORT + 10 }, r, 0, true, '南の門へ後詰が着いた');
    };
    rt.bark('南の後詰が砦へ向かい始めた');
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v === F.flagbearer) rt.unmark('flag');
    // 寄せ大将を討てば、最後の寄せはその場で崩れて勝ち（稲生の型：敵将を討てば勝ち）。
    if (v === F.yoseBoss && !F.won && !F.ending && !rt.over) {
      for (const g of rt.army.groups) if (g.team !== rt.player.u.team && !g.routed && g.count) { g.noRout = false; g.morale = 0; }
      rt.after(2, () => this.holdWin(rt, true));
    }
  },

  onStructHit(rt, s) {
    if (!SIDE_WORD[s.side]) return;
    const F = rt.flags;
    F.sideWarn = F.sideWarn || {};
    if ((F.sideWarn[s.side] ?? -99) + 12 > rt.t) return;
    F.sideWarn[s.side] = rt.t;
    rt.bark(`${{ n: '北', w: '西', e: '東', s: '南' }[s.side]}の柵が攻められている！`, true);
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (F.ending || F.won || rt.over) return;
    if (s === F.hut) {
      const I = s.naka, f = s.floors;
      if (I && !I.disabled) {
        I.disabled = true;
        if (I.mesh) I.mesh.visible = false;
        for (const list of [SOLIDS, INTERIOR_WALLS]) for (let k = list.length - 1; k >= 0; k--) if (list[k].naka === I.id) list.splice(k, 1);
        for (let k = f.deckStart; k < f.deckEnd; k++) FL.decks[k].y = -10000;
        for (let k = f.rampStart; k < f.rampEnd; k++) FL.ramps[k].ya = FL.ramps[k].yb = -10000;
      }
      if (!rt.canFailMission()) return;
      F.ending = true;
      for (const id of ['gate', 'nida', 'porters', 'scout', 'post', 'flag', 'perfect']) sunoFail(rt, id);
      for (const id of ['post0', 'post3', 'gate', 'nida', 'porterGuide', 'heal', 'hut', 'scout', 'ke', 'flagdrop', 'w', 'w2', 'w3', 'w4', 'boats', 'flag', 'buildGate', 'buildSide']) rt.unmark(id);
      rt.uninteract('heal'); rt.uninteract('flag');
      sunoObj(rt, 'retreat', '小屋を失い、任務は失敗。南門の外へ退け', 'main');
      retreatFort(rt);
      rt.banner('普請小屋が破られた');
      rt.say('木下藤吉郎', '小屋を失った。普請を止める。南門へ退け！', 4);
      rt.tracker.main = false;
      sunoFail(rt, 'defend');
      rt.finish({}, 12);
      return;
    }
    F.finalChecked = false; F.finalCheckSent = false;
    // 寄せの途中の破れも修理待ちへ。実際の作業は敵との間合いと人足の到着を待つ。
    F.repairPending = true;
    if (F.perfect) {
      F.perfect = false; sunoFail(rt, 'perfect');
      rt.bark('柵の完全防衛は失敗。主任務は続く。人足と小屋を守り、破れ目を塞げ', true);
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    if (rt.t >= (F.breachSayT || 0)) { F.breachSayT = rt.t + 8; rt.say('木下藤吉郎', '柵が破られたぞ！　破れ目を塞げ！', 3); }
    sfx('wood', 1);
  },

  onFinish(rt, info) {
    if (info.down) info.failureReason = rt.downReason || rt.player.downCause() || '深手を負い、砦の守りを続けられなかった';
    const R = rt.G.rel.tokichiro;
    if (rt.tracker.main) { R.trust += 10; R.like += 10; }
    if (rt.flags.perfect && rt.tracker.main) R.like += 5;
  },
};

// 使番は閉じた柵を横切らず南門へ回る。遠方の点と本物の騎馬で同じ道を使う。
function sunomataRunnerWay(army, u, want) {
  // 人足も小屋を横切らず、使番と同じ空いた道で南の陰へ回る。
  if (!u.group?.isRunner && !u.group?.sunoWorkers) return want;
  const pos = u.pos, me = Math.abs(pos.x) < FORT - 0.3 && Math.abs(pos.z) < FORT - 0.3;
  const to = Math.abs(want.x) < FORT - 0.3 && Math.abs(want.z) < FORT - 0.3;
  let x = want.x, z = want.z;
  // 門を抜けた直後も柵から離れきるまで南へ進む。外の行き先へ斜めに折れない。
  if (!me && !to && Math.abs(pos.x) < FORT + 4 && pos.z > FORT - 1 && want.z < FORT + 2) {
    x = pos.z < FORT + 4 ? 0 : (want.x < 0 ? -1 : 1) * (FORT + 4);
    z = FORT + 4;
  }
  if (me !== to) {
    if (!me && pos.z < FORT + 2 && (Math.abs(pos.x) > 1.4 || pos.z < FORT - 1)) {
      const sx = pos.x < 0 ? -1 : 1;
      x = sx * (FORT + 4);
      z = Math.abs(pos.x) < FORT + 2.5 ? pos.z : FORT + 4;
    } else {
      const az = me ? FORT - 3 : FORT + 3;
      x = 0;
      z = Math.abs(pos.x) > 1.4 || (me ? pos.z < FORT - 5 : pos.z > FORT + 5) ? az : me ? FORT + 3 : FORT - 3;
    }
  }
  // 普請小屋だけでなく、兵舎や材木の角も回る。退避先が安全でも、途中の壁に人足を残さない。
  // 使番の道は保ち、人足の行き先だけ補正する。座標は末尾の点を使い回す。
  if (u.group.sunoWorkers && me && to) for (const s of obstacleRects()) {
    const hw = s.hw + .7, hd = s.hd + .7;
    const ux = (pos.x - s.x) * s.c - (pos.z - s.z) * s.s;
    const uz = (pos.x - s.x) * s.s + (pos.z - s.z) * s.c;
    const tx = (x - s.x) * s.c - (z - s.z) * s.s;
    const tz = (x - s.x) * s.s + (z - s.z) * s.c;
    // 中にいる人足は既存の戸口への歩みに任せる。
    if (Math.abs(ux) < hw && Math.abs(uz) < hd) continue;
    // 並びの端が箱の中に入る行き先も、外の足場へ寄せる。
    let vx = tx, vz = tz;
    if (Math.abs(tx) < hw && Math.abs(tz) < hd) {
      if (hw - Math.abs(tx) < hd - Math.abs(tz)) vx = Math.sign(tx || ux || 1) * (hw + .3);
      else vz = Math.sign(tz || uz || 1) * (hd + .3);
    } else {
      const dx = tx - ux, dz = tz - uz;
      let enter = 0, leave = 1;
      if (Math.abs(dx) < 1e-6) { if (Math.abs(ux) >= hw) continue; }
      else {
        const a = (-hw - ux) / dx, b = (hw - ux) / dx;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
      if (Math.abs(dz) < 1e-6) { if (Math.abs(uz) >= hd) continue; }
      else {
        const a = (-hd - uz) / dz, b = (hd - uz) / dz;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
      if (enter >= leave) continue;
      if (Math.abs(ux) / hw > Math.abs(uz) / hd) {
        vx = Math.sign(ux || 1) * (hw + .4); vz = Math.sign(tz || uz || 1) * (hd + .4);
      } else {
        vx = Math.sign(tx || ux || 1) * (hw + .4); vz = Math.sign(uz || 1) * (hd + .4);
      }
      // 角へ着いたら次の角へ進む。辺の長さが違う箱で同じ角を選び続けない。
      if (Math.hypot(vx - ux, vz - uz) < .6) {
        if (Math.abs(tx) > hw) vx = Math.sign(tx) * (hw + .4);
        else vz = Math.sign(tz) * (hd + .4);
      }
    }
    x = s.x + vx * s.c + vz * s.s;
    z = s.z - vx * s.s + vz * s.c;
    break;
  }
  const hut = army.world?.sunoHut;
  if (me && hut?.alive) {
    const dx = x - pos.x, dz = z - pos.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((hut.x - pos.x) * dx + (hut.z - pos.z) * dz) / l2));
    if (Math.hypot(pos.x + dx * t - hut.x, pos.z + dz * t - hut.z) < 5.4 && Math.hypot(x - hut.x, z - hut.z) > 5.2) {
      const a0 = Math.atan2(pos.x - hut.x, pos.z - hut.z), a1 = Math.atan2(x - hut.x, z - hut.z);
      let da = a1 - a0; da -= Math.PI * 2 * Math.round(da / (Math.PI * 2));
      const a = a0 + Math.sign(da || 1) * Math.min(Math.abs(da), 0.7);
      x = hut.x + Math.sin(a) * 6.2; z = hut.z + Math.cos(a) * 6.2;
    }
  }
  if (x === want.x && z === want.z) return want;
  const point = u._sunoRunnerWay || (u._sunoRunnerWay = { x: 0, z: 0 });
  point.x = x; point.z = z;
  return point;
}

// 墨俣の bot：砦の内に留まり、柵の内から槍で突く。柵を越えた敵を先に討つ。荷駄を狙う敵だけは南の門から打って出て討つ
// （柵の外の敵へまっすぐ歩くと柵に当たって動けなくなるので、柵の手前で止まって待つ）
// 守りと退却で同じ道を使う。柵を横切らず、南門と普請小屋の脇を歩く。
const SHED_DOORS = [...SHEDS, MAIN_SHED];
// 砦の内の角材の山・資材・兵舎（壁の当たりではなく箱の当たり）。bot が壁へ押し続けないための避け先。
let rectCache = null;
function obstacleRects() {
  if (rectCache && rectCache.n === SOLIDS.length) return rectCache.list;
  const list = SHED_DOORS.map((s) => ({ x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2, c: Math.cos(s.rot), s: Math.sin(s.rot) }));
  for (const o of SOLIDS) if (o.k === 'r' && o.yTop == null && Math.abs(o.x) < FORT && Math.abs(o.z) < FORT && o.hw * o.hd > 0.15 && o.hw < 6 && o.hd < 6) list.push(o);
  rectCache = { n: SOLIDS.length, list };
  return list;
}
function sunomataWalk(b, inp, goTo, x, z, r) {
  const p = b.player, u = p.u, F = b.flags;
  // 押しても進まない（兵や角材の間に挟まった）時は、一秒ほど真横へ回って抜ける。
  const wd = u._sunoWedge || (u._sunoWedge = { x: u.pos.x, z: u.pos.z, t: b.t, until: 0, dir: 1 });
  if (b.t < wd.until) {
    const lx = x - u.pos.x, lz = z - u.pos.z, ll = Math.hypot(lx, lz) || 1;
    return goTo(p, inp, u.pos.x + (-lz / ll) * wd.dir * 4, u.pos.z + (lx / ll) * wd.dir * 4, 0.5);
  }
  if (b.t - wd.t >= 0.5) {
    if (Math.hypot(u.pos.x - wd.x, u.pos.z - wd.z) < 0.12 && Math.hypot(x - u.pos.x, z - u.pos.z) > r + 1.2) { wd.until = b.t + 0.9; wd.dir = -wd.dir; }
    wd.x = u.pos.x; wd.z = u.pos.z; wd.t = b.t;
  }
  return sunomataWay(b, inp, goTo, x, z, r);
}

// 人が遊ぶ時の足あとも、既存の門・破れ目・小屋を回る道を使う。兵の動きは変えない。
function sunomataWay(b, inp, goTo, x, z, r) {
  const p = b.player, u = p.u, F = b.flags;
  const me = Math.abs(u.pos.x) < FORT - 0.3 && Math.abs(u.pos.z) < FORT - 0.3;
  const to = Math.abs(x) < FORT - 0.3 && Math.abs(z) < FORT - 0.3;
  if (!me && !to && Math.abs(u.pos.x) < FORT + 3.5 && u.pos.z > FORT - 1 && z < FORT + 2) {
    const sx = x < 0 ? -1 : 1;
    return goTo(p, inp, u.pos.z < FORT + 3.5 ? 0 : sx * (FORT + 4), FORT + 4, 0.5);
  }
  // 兵舎や小屋の中にいる時は、まず戸口（各小屋の +z の面）から外へ出る。壁越しに行き先へ押し続けない。
  for (const s of SHED_DOORS) {
    const dx = u.pos.x - s.x, dz = u.pos.z - s.z, c = Math.cos(s.rot), n = Math.sin(s.rot);
    const lx = dx * c - dz * n, lz = dx * n + dz * c;
    if (Math.abs(lx) > s.w / 2 || Math.abs(lz) > s.d / 2) continue;
    const tx = x - s.x, tz = z - s.z;
    if (Math.abs(tx * c - tz * n) < s.w / 2 && Math.abs(tx * n + tz * c) < s.d / 2) break;
    const out = lz > s.d / 2 - 0.9 ? s.d / 2 + 1.4 : s.d / 2 - 0.6;
    return goTo(p, inp, s.x + out * n, s.z + out * c, 0.4);
  }
  if (!me && to) {
    // 柵の破れ目（普請途中の北の口も）のすぐ外にいれば、砦を外から回らずにそこから入る。
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const out = (u.pos.x - mx) * s.nx + (u.pos.z - mz) * s.nz, lat = Math.abs((u.pos.x - mx) * s.nz - (u.pos.z - mz) * s.nx);
      if (out > -0.5 && out < 9 && lat < 6) return lat > 1.4 && out > 1 ? goTo(p, inp, mx + s.nx * 2.5, mz + s.nz * 2.5, 0.6) : goTo(p, inp, mx - s.nx * 4, mz - s.nz * 4, 0.8);
    }
  }
  if (me !== to) {
    // 南門へ正面から入り始めたら、そのまま通る。門の手前で外周へ戻さない。
    if (!me && u.pos.z < FORT + 2 && (Math.abs(u.pos.x) > 1.4 || u.pos.z < FORT - 1)) {
      const sx = u.pos.x < 0 ? -1 : 1;
      if (Math.abs(u.pos.x) < FORT + 2.5) return goTo(p, inp, sx * (FORT + 4), u.pos.z, 1);
      return goTo(p, inp, sx * (FORT + 4), FORT + 4, 1.5);
    }
    const az = me ? FORT - 3 : FORT + 3;
    if (Math.abs(u.pos.x) > 1.4 || (me ? u.pos.z < FORT - 5 : u.pos.z > FORT + 5)) { x = 0; z = az; r = 0.8; }
    else return goTo(p, inp, 0, me ? FORT + 3 : FORT - 3, 0.5);
  }
  // 小屋の中が行き先なら、戸口（+z の面の中ほど）の前を通ってから入る。壁の外から中へ押し続けない。
  for (const s of SHED_DOORS) {
    const c = Math.cos(s.rot), n = Math.sin(s.rot);
    const inBox = (px, pz, m) => { const dx = px - s.x, dz = pz - s.z; return Math.abs(dx * c - dz * n) < s.w / 2 + m && Math.abs(dx * n + dz * c) < s.d / 2 + m; };
    if (!inBox(x, z, -0.3) || inBox(u.pos.x, u.pos.z, 0.2)) continue;
    const lx = (u.pos.x - s.x) * c - (u.pos.z - s.z) * n, lz = (u.pos.x - s.x) * n + (u.pos.z - s.z) * c;
    if (lz > s.d / 2 + 0.5 && Math.abs(lx) < 1.2) continue;
    const fz = s.d / 2 + 1.0;
    return goTo(p, inp, s.x + fz * n, s.z + fz * c, 0.5);
  }
  // 兵舎・小屋の壁へまっすぐ押し続けない。行き先が小屋の際なら外へずらし、道が小屋を横切るなら角を回る。
  if (me && to) for (const s of obstacleRects()) {
    const c = s.c, n = s.s, hw = s.hw + 0.6, hd = s.hd + 0.6;
    const loc = (px, pz) => [(px - s.x) * c - (pz - s.z) * n, (px - s.x) * n + (pz - s.z) * c];
    const [ux, uz] = loc(u.pos.x, u.pos.z);
    if (Math.abs(ux) < hw - 0.5 && Math.abs(uz) < hd - 0.5) continue;
    let [tx, tz] = loc(x, z);
    const world = (lx, lz) => [s.x + lx * c + lz * n, s.z - lx * n + lz * c];
    if (Math.abs(tx) < hw && Math.abs(tz) < hd) {
      if (hw - Math.abs(tx) < hd - Math.abs(tz)) tx = Math.sign(tx || 1) * (hw + 0.2); else tz = Math.sign(tz || 1) * (hd + 0.2);
      [x, z] = world(tx, tz); continue;
    }
    // 線分と広げた矩形の交差（局所座標）
    let t0 = 0, t1 = 1; const dx = tx - ux, dz = tz - uz;
    for (const [d0, o, h] of [[dx, ux, hw], [dz, uz, hd]]) {
      if (Math.abs(d0) < 1e-6) { if (Math.abs(o) >= h) { t1 = -1; break; } continue; }
      let a0 = (-h - o) / d0, a1 = (h - o) / d0; if (a0 > a1) [a0, a1] = [a1, a0];
      t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
    }
    if (t0 < t1 && !(Math.abs(ux) < hw && Math.abs(uz) < hd && Math.hypot(dx, dz) < 3)) {
      const cx = (ux < 0 ? -1 : 1) * (hw + 0.5), cz = (uz < 0 ? -1 : 1) * (hd + 0.5);
      const via = Math.abs(ux) / hw > Math.abs(uz) / hd ? [cx, Math.sign(tz || 1) * (hd + 0.5)] : [Math.sign(tx || 1) * (hw + 0.5), cz];
      const w = world(via[0], via[1]); return goTo(p, inp, w[0], w[1], 0.6);
    }
  }
  const hx = F.hut.x, hz = F.hut.z;
  if (F.hut.alive && me) {
    const dx = x - u.pos.x, dz = z - u.pos.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((hx - u.pos.x) * dx + (hz - u.pos.z) * dz) / l2));
    if (Math.hypot(u.pos.x + dx * t - hx, u.pos.z + dz * t - hz) < 5.4 && Math.hypot(x - hx, z - hz) > 5.2) {
      const a0 = Math.atan2(u.pos.x - hx, u.pos.z - hz), a1 = Math.atan2(x - hx, z - hz);
      let da = a1 - a0; da -= Math.PI * 2 * Math.round(da / (Math.PI * 2));
      const a = a0 + Math.sign(da || 1) * Math.min(Math.abs(da), 0.7);
      return goTo(p, inp, hx + Math.sin(a) * 6.2, hz + Math.cos(a) * 6.2, 0.6);
    }
  }
  return goTo(p, inp, x, z, r);
}

// 外周の四隅だけを調べる。歩ける道を選び、地点は戦ごとに作って使い回す。
function sunoOuterGuide(rt, goal, out) {
  const p = rt.player.u.pos, edge = FORT + 4;
  const corners = rt.flags.sunoGuideCorners || (rt.flags.sunoGuideCorners = [
    { x:-edge, z:-edge }, { x:edge, z:-edge }, { x:edge, z:edge }, { x:-edge, z:edge },
  ]);
  for (const c of corners) c.y = rt.world.heightAt(c.x, c.z);
  let best = Infinity;
  for (const a of corners) {
    const first = Math.hypot(a.x - p.x, a.z - p.z);
    if (first < .8 || !localClear(rt.army, p, a)) continue;
    for (const b of corners) {
      const distance = first + Math.hypot(a.x - b.x, a.z - b.z) + Math.hypot(goal.x - b.x, goal.z - b.z);
      if (distance >= best || !localClear(rt.army, b, goal) || a !== b && !localClear(rt.army, a, b)) continue;
      best = distance; out.x = a.x; out.z = a.z;
    }
  }
}

// 殿を狙う別働隊も、閉じた柵へ直進せず南門へ回る。出撃時だけ道を作る。
sunomata.taishoRaidPath = (g, lord) => {
  if (Math.abs(lord.pos.x) >= FORT || Math.abs(lord.pos.z) >= FORT) return null;
  const c = g.center(), x = c.x < 0 ? -FORT - 6 : FORT + 6;
  return [[x, c.z], [x, FORT + 6], [0, FORT + 6], [0, FORT - 4]];
};
sunomata.botWithdraw = (b, inp, { goTo }) => {
  if (b.player.lock) inp.e.add('KeyQ');
  sunomataWalk(b, inp, goTo, 0, FORT + 70, 3);
};

sunomata.botDefendsFort = true;
function makeSunomataBrain(b) {
  let inp, goTo;
  const clampPoint = [0, 0], emptyThreats = [];
  const p = b.player, u = p.u, F = b.flags;
  // 退き先は一度だけ用意し、敵が小屋へ来た時は別の空いた所を選ぶ。
  const restPoints = [[-6, 5], [6, 10], [0, 14], [-12, 10], [12, 10]];
  let restPoint = restPoints[0], senseAt = -1, closeFoes = 0, closeFriends = 0;
  const inF = (q, m = 0) => Math.abs(q.x) < FORT - m && Math.abs(q.z) < FORT - m;
  const walk = (x, z, r) => sunomataWalk(b, inp, goTo, x, z, r);
  // 回り道で決めた歩みを保ったまま敵を向く。前進のまま向きだけ替えると柵や小屋へ突っ込む。
  const faceWalking = (e) => {
    const walking = inp.k.has('KeyW'), walkYaw = p.yaw;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (!walking) return;
    inp.k.delete('KeyW');
    const da = walkYaw - p.yaw;
    if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
  };
  const strike = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 4) faceWalking(e);
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    let attacker = null, ad = 10;
    for (const o of b.army.threats || emptyThreats) {
      if (!o.alive || o.team === u.team || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
          Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // まだ届かない振りで足と反撃を止めない。構えの気力を遠くで使い切らない。
      if (od > (o.reach || 2.9) + 0.3 && !o.charging) continue;
      // 届く振りのうち、今の相手より近い敵だけ柵を調べる。
      if (od >= ad || b.army.wallBetween(o.pos, o.team, u.pos,
        (o.wpnKind || o.lookWeapon || o.weapon) === 'spear')) continue;
      if (od < ad) { ad = od; attacker = o; }
    }
    if (attacker) {
      // 振りが当たるまで構えを保ち、別の敵への突きで受けを解かない。
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      inp.guardHold = true; inp.leftPressed = false; inp.chargeHold = false;
      // 受け流した直後は、次の振りが来ていても払いで押し返す。
      // 予兆だけで反撃を消し続けると、構えの気力を使い切って倒れる。
      inp.leftPressed = p.counterT > 0 && ad < (p.weapon === 'sword' ? 1.9 : 2.8) &&
        !attacker.invuln && p.cd <= 0 && !p.pending && p.sta >= 18;
    } else if (d < (p.weapon === 'sword' ? 1.9 : 2.8) && !e.invuln &&
        Math.abs(e.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, e.pos, p.weapon === 'spear')) {
      // 本体の槍と同じく柵越しに届く。柵を壁扱いすると、破られるまで一度も突けない。
      // 打ち込みを受けた後は構えを解き、払いになる猶予が過ぎてから突く。
      // 構えのまま連打して気力を使い切らず、届く相手へ一振りずつ返す。
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.leftPressed = !p.guard && p.time - (p.guardOffT ?? -9) > 0.45 &&
        p.cd <= 0 && !p.pending && p.sta > p.maxSta * 0.35;
    }
  };
  // 柵の内へ寄せる点：四隅（柵が直角に出会う袋）へは寄せず、角から 4m 手前の辺の上で待つ（(±18,±18) の詰まり）
  const clampIn = (x, z, m) => {
    let cx = Math.max(-m, Math.min(m, x)), cz = Math.max(-m, Math.min(m, z));
    const k = m - 4;
    if (Math.abs(cx) > k && Math.abs(cz) > k) {
      if (Math.abs(x) < Math.abs(z)) cx = Math.sign(cx) * k; else cz = Math.sign(cz) * k;
    }
    clampPoint[0] = cx; clampPoint[1] = cz; return clampPoint;
  };
  const fight = (e) => {
    const eIn = inF(e.pos), meIn = inF(u.pos, 0.3);
    // 柵の外の敵：柵の手前（内側）の近い所で待って突く
    if (meIn && !eIn) {
      const [cx, cz] = clampIn(e.pos.x, e.pos.z, FORT - 1.1);
      walk(cx, cz, 0.5);
    } else if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2.4) walk(e.pos.x, e.pos.z, 2.2);
    strike(e);
    // 持ち場への下知と突撃の往復で、同じ号令を何度も叫ばせない。
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 30; }
  };
  const fightable = (o) => !o.invuln && !o.fleeing && !o.woundOut && !o.group?.routed;
  const insideEnemy = (o) => fightable(o) && inF(o.pos, 0.4);
  const visible = (o) => !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 &&
    !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon || o.weapon) === 'spear');
  const supplyEnemy = (o) => fightable(o) && o.group === F.KE;
  const outsideEnemy = (o) => fightable(o) && Math.abs(o.pos.x) < FORT + 8 && Math.abs(o.pos.z) < FORT + 8;
  const activeEnemy = (o) => fightable(o) && (o.group === F.W1 || o.group === F.W1b || o.group === F.PR1 || o.group === F.PR2 || o.group === F.W2 || o.group === F.W3a || o.group === F.W3b || o.group === F.W3c || o.group === F.W3d);
  const byFlag = (x) => x.id === 'flag';
  const byWoodPick = (item) => item.id === 'woodPick', byWoodDrop = (item) => item.id === 'woodDrop';
  return (nextInput, nextGoTo) => {
    inp = nextInput; goTo = nextGoTo;
  // 前のコマの横歩き・後ずさりを残さない（四つの歩みが同時に押されたまま、柵ぎわで六十秒止まっていた）。
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  inp.guardHold = false;
  if (!u.alive) return;
  // 狙いを固定したままだと、回り道や構えの向きが更新時に敵へ戻される。
  if (p.lock) inp.e.add('KeyQ');
  // 深手・包囲・気力切れは、小屋を回って砦の後ろへ退く。
  // 敵から離れる向きを柵の内へ丸めるだけでは、柵ぎわで足が止まる。
  const hurt = sunoTreatmentNeeded(b);
  const tired = p.sta < p.maxSta * 0.22;
  // 傷が増えてからでは退く前に囲まれる。人数と退き先は半秒ごとに調べる。
  if (b.t >= senseAt) {
    senseAt = b.t + 0.5;
    closeFoes = 0; closeFriends = 0;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.fleeing || o.noTarget || o.isStruct || o.woundOut || o.type === 'porter' ||
          Math.abs(o.pos.y - u.pos.y) >= 3) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (o.team !== u.team && d < 5 && visible(o)) closeFoes++;
      else if (o.team === u.team && d < 8 && o.type !== 'gun' && o.type !== 'bow' &&
          !b.army.wallBetween(u.pos, -1, o.pos)) closeFriends++;
    }
    let best = -Infinity;
    for (const point of restPoints) {
      let clearance = 20;
      for (const o of b.army.units) {
        if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.isStruct || o.woundOut) continue;
        clearance = Math.min(clearance, Math.hypot(o.pos.x - point[0], o.pos.z - point[1]));
      }
      // 手当ての小屋が安全なら戻る。追手がいる時は、同じ所で足を止めない。
      const score = clearance - Math.hypot(u.pos.x - point[0], u.pos.z - point[1]) * 0.15 +
        (point === restPoints[0] && clearance >= 12 ? 8 : 0);
      if (score > best) { best = score; restPoint = point; }
    }
  }
  const surrounded = closeFoes >= 3 && closeFoes > closeFriends + 1;
  if (hurt || tired || surrounded || u.mobbed || F.botRest) {
    // 追手は十二歩まで見張り、布を巻けるかは本体と同じ護衛・壁・八歩の条件で決める。
    const near = b.army.nearestEnemy(u, 12, visible);
    // 退く理由（気力切れ・囲み・手当て）が消えたら持ち場へ戻る。柵越しの敵が近いだけで休み続けると、
    // 砦へ入った敵が人足を討つ間も柵ぎわで立ち尽くした。
    const trig = tired || surrounded || u.mobbed || hurt;
    F.botRest = trig ? !!near || p.sta < p.maxSta * 0.6 || hurt : p.sta < p.maxSta * 0.45;
    if (F.botRest) {
      inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
      // 攻め続ける組を前に置き去りにせず、退き先へ連れて戻る。
      if (b.squad.length && b.squadGroups[0].order !== 'follow' && !(b.botCmdT > b.t)) {
        inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
      }
      // 普請中の人足を待たず、案内と同じ護衛の陰で自分の布を巻く。
      // 既に安全なら足を止め、静止待ちと三秒の長押しを完了する。
      const shelter = hurt && p.treatmentShelter(u.pos);
      const cue = b.hud.retreatGuide;
      if (!shelter) {
        if (hurt && cue?.active && cue.valid && cue.treatment) walk(cue.x, cue.z, .5);
        else walk(restPoint[0], restPoint[1], 0.8);
      }
      if (near) {
        // 近い敵より、実際に振りかぶっている敵へ構える。
        let face = null, d = 10;
        for (const o of b.army.threats || emptyThreats) {
          if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
              Math.abs(o.pos.y - u.pos.y) >= 3) continue;
          const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
          if (od > (o.reach || 2.9) + 0.3 && !o.charging) continue;
          if (od >= d || b.army.wallBetween(o.pos, o.team, u.pos,
            (o.wpnKind || o.lookWeapon || o.weapon) === 'spear')) continue;
          if (od < d) { face = o; d = od; }
        }
        if (face) faceWalking(face);
        // 近いだけの敵には構えない。振りの合間に気力と受け流しの猶予を戻す。
        inp.guardHold = !!face;
      }
      if (shelter && p.treatmentReady) { inp.e.add('KeyE'); inp.k.add('KeyE'); }
      return;
    }
  }
  // 寄せの切れ目に一度運ぶ。担いだ後は近くに敵がいなければ人足へ渡し切る。
  // 遠い侵入のたびに戦いへ戻ると、材を担いだまま期限を迎えていた。
  const carryLull = sunoSupplyLull(b);
  if ((F.carryingWood || (carryLull && !F.woodDelivered)) && sunoSupplySafe(b)) {
    const it = b.interacts.find(F.carryingWood ? byWoodDrop : byWoodPick);
    const point = it && (typeof it.pos === 'function' ? it.pos() : it.pos);
    if (it) {
      // 槍を振り終える間も材へ向かう。受け取りが一時的に隠れたからと
      // 再び敵を突くと、振り続けていつまでも材を担げない。
      inp.leftPressed = false; inp.chargeHold = false;
      const dest = point || (F.carryingWood ? sunoWoodDrop(b) || SUNO_WOOD_DROP : SUNO_WOOD_PICK);
      if (Math.hypot(dest.x - u.pos.x, dest.z - u.pos.z) >= it.r - .5) walk(dest.x, dest.z, 1.5);
      else if (point) { inp.e.add('KeyE'); inp.k.add('KeyE'); }
      return;
    }
  }
  // 材を渡す途中の接敵と、普段の守備は、柵を越えた敵を先に止める。
  const inside = b.army.nearestEnemy(u, 60, insideEnemy);
  if (inside) { fight(inside); return; }
  // 任務の材木を届けてから、柵内に落ちた旗だけ拾う。守りを離れて敵の控えへ出ない。
  const fl = b.interacts.find(byFlag);
  if (F.woodDelivered && fl && inF(fl.pos, 1) && !b.army.nearestEnemy(u, 3)) {
    if (Math.hypot(fl.pos.x - u.pos.x, fl.pos.z - u.pos.z) > 2) walk(fl.pos.x, fl.pos.z, 1.5);
    else { inp.e.add('KeyE'); inp.k.add('KeyE'); }
    return;
  }
  // 迎えの任務は先に南門へ回る。柵内から門外の敵へ寄ると、閉じた北の柵を押し続けていた。
  if ((F.sunoTask === 'nida' || F.sunoTask === 'porters') && (inF(u.pos, .3) ||
      Math.abs(u.pos.x) < 3 && u.pos.z > FORT - 3 && u.pos.z < FORT + 3)) {
    inp.leftPressed = false; inp.chargeHold = false;
    walk(0, FORT + 5, .8);
    if (b.squad.length && b.squadGroups[0].order !== 'follow' && !(b.botCmdT > b.t)) {
      inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
    }
    return;
  }
  // 荷駄を狙う敵は打って出て討つ
  if (F.KE && F.KE.count && !F.KE.routed && !F.nidaDone) {
    const e = b.army.nearestEnemy(u, 200, supplyEnemy);
    if (e) { fight(e); return; }
  }
  // 迎えの敵が退いた後も、残った人足へ道の印をたどる。守備の帰還処理で門の内外を往復しない。
  if (F.sunoTask === 'nida' || F.sunoTask === 'porters') {
    const point = supplyGuidePoint(b);
    if (point) {
      inp.leftPressed = false; inp.chargeHold = false;
      walk(point.x, point.z, 2);
      return;
    }
  }
  // 守備中に柵の外へ出たら戻る。近い敵へ歩み寄ると帰還せず控えまで追ってしまう。
  if (!inF(u.pos, 0.3)) {
    // 開いた北の口の外へ一歩出ただけなら、追って出ずに口から内へ戻る（追い続けて敵の控えの中へ出ていた）。
    const gapOpen = F.segs.gate.some((s) => !s.alive);
    const atGap = gapOpen && Math.abs(u.pos.x) < 6 && u.pos.z < -FORT + 1 && u.pos.z > -FORT - 8;
    const foe = b.army.nearestEnemy(u, 3.5, fightable);
    if (atGap) { goTo(p, inp, 0, -FORT + 5, 0.8); if (foe) strike(foe); return; }
    walk(0, FORT - 5, 1.5);
    if (foe) strike(foe);
    return;
  }
  // 柵に寄ってくる敵：柵の内側から突く
  const e = b.army.nearestEnemy(u, 30, outsideEnemy);
  if (e) { fight(e); return; }
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 30; }
  // 寄せ手の来る側の柵の内へ
  // 控えの隊へ走らず、今寄せている隊の側へ付く。
  const far = b.army.nearestEnemy(u, 220, activeEnemy);
  if (far) { const [cx, cz] = clampIn(far.pos.x, far.pos.z, FORT - 2.5); walk(cx, cz, 2); }
  else walk(0, -10, 3);
  };
}
sunomata.botBrain = (b, inp, { goTo }) => {
  const brain = b.flags.botBrain || (b.flags.botBrain = makeSunomataBrain(b));
  brain(inp, goTo);
};
// 普請・舟・行軍の時間をまとめて飛ばすと瞬間移動になるため、この戦は待ち飛ばしを使わない。
sunomata.canSkip = () => '';
sunomata.skip = () => {};
sunomata.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// すでに砦にいる三人を共通の武将の呼び口へ渡す。新しい兵は加えない。
sunomata.famous = [
  { name: '前野長康', team: 0, g: /前野長康/, line: '西の柵を離れるな！' },
  { name: '木下藤吉郎', team: 0, g: /藤吉郎/, line: '普請の手を止めるな。柵を守れ！' },
  { name: '蜂須賀正勝', team: 0, g: /川並衆/, line: '川の側はわしらが守る。組を離すな！' },
];
// 築城年は伝承、秋の景物と空模様・時刻は遊びの設定。残らない月日を確定しない。
sunomata.date = (rt) => `永禄九年（築城伝承）　秋・${sky(rt)}（遊びの設定）`;

// 史料にない千五百対四千へ兵を足さず、この場に配置した兵だけ一人ずつ数える。
// 武器を持たない普請・荷駄の人足は兵力へ混ぜない。姿と仕事はそのまま残す。
// take で軽い姿を隠した同じ一人は実兵側だけに数え、戻した兵と討死を重ねない。
sunomata.force = (rt) => {
  let a = 0, b = 0;
  for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'dummy' && u.type !== 'porter' && !u.civ && !u.isStruct) {
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  for (const A of rt.world.armies || []) {
    const n = Math.max(0, A.n - A.took);
    if (A.team === 0) a += n; else if (A.team === 1) b += n;
  }
  const initial = rt.flags.sunomataForce || (rt.flags.sunomataForce = { a, b });
  return { a, a0: initial.a, b, b0: initial.b };
};
// 史料と地勢の参照先。築城伝承を借りた筋と、当時の記録で確認できる事を分ける。
// 信長公記・首巻「十四条合戦之事」：https://ja.wikisource.org/wiki/信長公記
// 川の合流と水運の立地：https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 自然河川と低地：https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
sunomata.history = '信長公記の首巻「十四条合戦之事」には、永禄四年（1561）、信長が洲股の要害を固めて在陣し、十四条の戦の後に引き払ったとある。永禄九年（1566）に藤吉郎が一夜で築いたとも伝わるが、信長公記にその記録はない。伝承のよりどころの一つである『武功夜話』は後の時代の作で、成立や内容に疑いがある。戦国当時の確かな記録としては扱えない。この戦は築城伝承を借りた防衛戦。藤吉郎・小六・前野長康の役割、三度の寄せ、舟の上陸、兵数と砦の細部は遊びの補いで、史料にある合戦の再現ではない。南門の屋根付きの物見は、急造の木組みを表す開放した足場とした。北西の物見も下部の板壁と中段の張り出しで囲わず、丸太組みを見せる仮設の姿とした。高さ・床・梯子と上の囲いは保っている。門や物見の存在・形を裏付ける史料はなく、これも遊びの補い。普請中の板屋は、全面が風化した古屋に見えないよう壁・戸・屋根に新材の色を交ぜた。新材と転用材の割合・色を示す史料はなく、急造の様子を伝える外観上の補い。岸につないだ材木の筏は、木曽川上流から材を流したという築城伝承を表す。筏の姿と係留場所は遊びの補いで、史料で確かめられた輸送の再現ではない。史実の両軍の総勢と兵種の割合は不明。控えは戦国期の歩兵の役割を参考に、徒歩を主に馬上の武者を添えた遊びの編成で、墨俣の実際の編成を示すものではない。両軍の人数表示は、この場の実兵と遠景の控えを合わせた遊びの配置人数で、史実の総勢ではない。武器を持たない普請・荷駄の人足は含めず、遠景から実兵へ移した同じ兵は二重に数えない。陣形の人数は各持ち場の開始人数を示す。砦外の控えも含み、三十六メートル四方の柵内に全員が入るものではない。天正十四年（1586）の河道変動前、古木曽川は今の境川筋から墨俣で長良川に合流していた。古木曽川の合流口は、城跡より下流側だったとする地学資料を参考に南東へ置いた。川幅や合流点の位置は遊びのために縮めた補いで、当時の川筋を復元したものではない。合流部の水面は長良川とそろえ、岸は水面より高い低地につなぐ。水位や岸の高さは当時の測量値ではなく、自然につながる川辺を表す補い。岸寄りの砂州は、改修前の川辺を表す地形の補い。位置や高さを裏付ける当時の記録はなく、舟の航路と中央の深みは残している。南西の在所を載せた細長い微高地と、隣の湿った刈田は、濃尾平野の自然堤防と後背低地を参考にした補い。在所から街道への小道は、湿った刈田を避けて家並みの西側の微高地に沿わせた。南の控えへは、街道から隊列の西・南の外縁を回る細い踏み道を補った。兵や荷駄の待機場所と刈田は避けている。この踏み道は陣内の行き来を表す遊びの補いで、当時の軍道を示す史料に基づくものではない。西の寄せ手にも、控えから既存の出発点を経て空堀の手前へ続く踏み道を補った。河畔林が進路を塞がないための設営上の補いで、当時の道筋を復元したものではない。北西の控えからも、北の横隊の南側を回って北の寄せ道へ合流する踏み道を補った。支流の浅瀬や兵の配置は変えず、林の中で控えが孤立しないための補いとした。この道筋も当時の史料で確認されたものではない。旧流路・集落・田・道の位置や高さを裏付ける当時の記録はなく、確定した地形の復元ではない。現代の標高は大まかな低地の参考に留め、当時の川筋・縄張りは確定しない。控えの隊列の周囲は隅まで伐り開き、足元に踏まれた湿り土と刈り残した草を交ぜた。兵が待機する様子を伝える地表の補いで、当時の陣跡や植生を復元したものではない。周囲の林は、長良川のヤナギ・エノキなどの河畔林を参考に、広葉樹を主にした。現代の植生からの類推であり、樹種・割合・林の位置を当時の記録から復元したものではない。秋という季節、昼から夕への時刻と天気は遊びの設定で、築城の月日を示す記録に基づくものではない。主人公は上役の下知に従う一組の持ち場で、任務の失敗は史実の織田軍の敗北ではない。';

sunomata.history += '東岸の控えには、二列の備えの間を通る踏み道を補った。岸へ向かう横道は、北端と南端の寄せ列の中心を貫かず、それぞれの北側の空き地へつないだ。南の横道は古木曽川の合流口より手前に収めた。兵の人数・持ち場・進退を保った遊びの配置で、当時の軍道を示す史料に基づくものではない。';
sunomata.history += '下流の細い中州は、国土交通省が説明する改修前の網目状の自然河川から補った地形。両側に深い流れを残し、舟の横断線・筏・古木曽川の合流口から離した。中州の存在・位置・高さを当時の記録で確かめたものではない。';

sunomata.history += '古木曽川の合流口は、地面を描く範囲の内へ収め、川床と岸が長良川につながるようにした。西の枝流れは上流を地図外へ延ばした。いずれも川の連続性を表す補いで、当時の合流点の座標や水源を示すものではない。';

sunomata.history += '材木の筏の係留岸から舟着きの道へ、荷揚げの踏み道を補った。水運で森林資源を運び込める立地を参考に、既存の南門への道につないだ遊びの補いで、当時の荷揚げ場や道筋を復元したものではない。';

sunomata.history += '南西からの街道は、南西の控えの隊列を横切らないよう南側の外縁へ回し、在所からの小道もその街道へつないだ。南西の控えの南端と街道の間にも細い踏み道を補い、隊列や田を横切らず行き来できるようにした。兵の持ち場と人数を保った陣内の往来の補いで、当時の街道や陣跡を復元したものではない。';

sunomata.history += '長良川の西岸は、水面の範囲から中央の深みへ下がる斜面にそろえ、陸側に水位より低い溝が残らないようにした。自然河川としてのつながりを表す補いで、当時の岸の位置・勾配を復元したものではない。';

sunomata.history += '西と北東の枝水路の合流口は、川床を長良川の深みへ下げ、水面より高い土で流れが途切れないようにした。網目状だった自然河川を参考にした遊びの補いで、当時の支流の位置・深さを復元したものではない。';

sunomata.history += '西の枝流れの上流は、直線の排水路のような姿を避け、控えと寄せ道の間で緩く曲げた。川床・水面・岸の砂泥は同じ川筋を使う。西と北東の枝水路では、砂泥と草の境にも緩いむらを付けた。改修前の網目状の自然河川からの類推で、当時の犀川の流路や岸を復元したものではない。北の浅瀬・合流口と兵の配置は保っている。';

sunomata.history += '古木曽川の東の流入部は、川幅の一部だけが地図の南端に見える配置を改め、東端から両岸の見える流れとしてつないだ。下流の合流口・川幅・水位は保ち、東岸の控えと道を避けた。水運に適した立地を伝える遊びの補いで、当時の川筋の復元ではない。';

sunomata.history += '北の道は北の控えの東側へ回し、横隊の兵を縦に貫かない配置にした。控えの南端からも既存の北西の踏み道へつなぎ、兵が並ぶ場所と往来を分けた。北西の斜めの備えも、中心から横隊を貫いていた踏み道を東の伐開縁へ移し、人数と持ち場を保った。水運の拠点という立地を参考にした陣内の補いで、当時の道筋や陣跡を復元したものではない。';

sunomata.history += '東岸で進退する六隊の待機地と往復する帯にも、踏まれた湿り土と刈り残しをつないだ。川辺の設営を伝える地表の補いで、当時の陣跡や植生の復元ではない。兵数・隊列・進退と川床は保っている。';

sunomata.history += '砦を囲む遠景の地面は、濃尾平野の成り立ちを参考に低い起伏へ抑えた。低地が遠山の手前まで続く地勢の補いで、当時の標高を復元したものではない。';

sunomata.history += '川の砂州は、対称な楕円の盛り土に見えないよう、流れに沿う裾と水際に緩い偏りを付けた。国土交通省が説明する改修前の自然河川からの類推で、永禄年間の砂州の形を復元したものではない。砂州の範囲と頂部の高さ、舟・筏・合流口の深みは保っている。';

sunomata.history += '西の林の寄せ手と物見の待機地も小さく伐り開き、足元を踏み土と刈り残しへなじませた。河畔林での設営を表す補いで、当時の陣跡や植生を復元したものではない。';

sunomata.history += '舟着きの北の竹束二つは、枝水路の川床や斜面に沈まないよう岸の平場へ移した。水運を支える川辺の設営を表す遊びの補いで、当時の竹束の有無や配置を示す史料に基づくものではない。';

sunomata.rts = true;
export { sunomata };
