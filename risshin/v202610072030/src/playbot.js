// 自動テストプレイの bot（戦国大名の playbot にならう）
// 使い方：index.html?bot を開くと、桶狭間編・長篠編の戦・日本地図の城攻め・稽古場を順に自動で遊び、数と気づきを画面にまとめる。保存には触れない。
//   ?bot&only=nagashinojo,castle のように戦の鍵を並べると、その戦だけを遊ぶ（鍵：okehazama moribe sunomata nagashinojo tobinosu shitaragahara suwahara anegawa sekigahara sanadamaru castle dojo town mikatagahara）
//   ?bot&k=2 は何回目か（日本地図の筋書きを回ごとに替える）
//   ?bot&persona=chu&n=2 は五人のテストプレイヤーの一人として遊ぶ（性格は下の PERSONAS。tools/players.sh が順に回す）
import { newGame, fillRoster, RANKS, BATTLES, SCENARIOS, SCENARIO_ORDER, setScenario } from './state.js';
import { Auditor } from './audit.js';
import { ensureJapan, MAP_KEYS } from './japan.js';
import { touchFrame, touchInput, isTouch } from './touch.js';
import { S } from './settings.js';
import { RADIAL } from './player.js';
import { GENERALS, WOUND_FLOOR } from './units.js';
import { lordGame, lordList } from './lord.js';
import { depthBot } from './b_depth.js';
import { botInput as fake } from './bot_input.js';

const Q = new URLSearchParams(location.search);
const ONLY = Q.get('only') ? new Set(Q.get('only').split(',')) : null;
// 1000人の遊び手の変わり目（tools/players1000.mjs の表から。無ければ今までの五人の遊び方のまま）
//   sens 見回しの感度（0.6・1・1.6）／ pausy=1 途中で一時停止を開く人 ／ habit ren|kamae|hashiri|mayoi|yomu ／ mode tooshi|one|lord ／ spd 1〜3 ／ prog 0〜3 ／ buy uma|teppo|tomo|buki|nashi ／ view tp|fp ／ pick 種 ／ pc=1 パソコン ／ maxshots
const V = { row: Q.get('row'), habit: Q.get('habit') || '', mode: Q.get('mode') || '', spd: +(Q.get('spd') || 2), prog: +(Q.get('prog') || 0), buy: Q.get('buy') || '', view: Q.get('view') || '', pick: +(Q.get('pick') || 0), pc: Q.get('pc') === '1', sens: +(Q.get('sens') || 0), pausy: Q.get('pausy') === '1' };
const want = (key) => !ONLY || ONLY.has(key);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 自動プレイも見渡しを終えてから開戦する。裏の画面では本番の時計が止まるため、
// 戦と同じ刻みで演出だけを進める。札の片付けと入力の解除は本番の終了処理に任せる。
async function watchDeployment(game) {
  while (game.deployment) {
    game.deployment.update(0.05);
    await wait(0);
  }
}
const openingWait = (game) => !!(game && (game.deployment || game.pendingIntro || game.hud?.introWaiting || document.getElementById('intro')?.hidden === false));
const press = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); };

// 戦だけを早送りする前に、見渡しも通常の終了処理まで進める。
// 一時停止だけ解くと札が残り、指の操作をふさいでしまう。
function finishDeployment(game) {
  const view = game.deployment;
  if (!view) return;
  view.jump();
  view.update(3);
}

// 開戦の札は歩く操作では閉じない。人と同じ釦を押し、閉じた事まで確かめる。
// 札が残った時は戦を早送りせず、出陣できなかった原因として記録する。
function enterBattle(game, pad = null) {
  // 見渡しの終了処理が題を出す。先に成功扱いにすると、後から札が指をふさぐ。
  if (game.deployment) return false;
  // 一時停止を直接解いた道具でも、後回しの題を先に出す。
  // 残すと、途中の一時停止から戻った時に初めて開いて歩みをふさぐ。
  if (game.pendingIntro && !game.deployment && !game.gungiOn) {
    const show = game.pendingIntro;
    game.pendingIntro = null;
    show();
  }
  const intro = document.getElementById('intro');
  // 待つ印だけでなく、後回しの題と実際の札も片付いたことを求める。
  if (game.pendingIntro) return false;
  if (!game.hud.introWaiting) return !!intro?.hidden;
  const go = document.getElementById('intro-go');
  if (!go || go.disabled || !go.getClientRects().length) return false;
  if (pad) {
    // 前の札の同じ釦名を覚えていても、新しい出陣の釦を押す。
    pad.cache.clear();
    if (!pad.tap(go, '出陣する（開戦の札）')) return false;
  } else go.click();
  return !game.deployment && !game.pendingIntro && !game.hud.introWaiting && intro.hidden;
}

// 囲まれたら敵へ向いたまま下がる。傷の自然回復を待って退き続けない。
function survive(b, inp) {
  const p = b.player, u = p.u, army = b.army;
  b.botSurviving = false;
  // 落ちのびる下知の間は、居残る味方へ戻らず、戦ごとの退き口をたどる。
  if (b.def.botEvacuating?.(b)) { b.botSurviveUntil = 0; return false; }
  // 砦の柵と普請小屋を回る退避は、戦専用の頭に任せる。
  if (b.def.botDefendsFort) { b.botSurviveUntil = 0; return false; }
  let foe = null, fd = 10, attacker = null, ad = 10, mate = null, md = 24, close = 0, support = 0, ex = 0, ez = 0;
  for (const o of army.units) {
    if (o === u || !o.alive || o.fleeing || o.group?.routed || o.group?.hidden || o.downed || o.isStruct || o.type === 'dummy' || o.noTarget) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const attacking = (o.atk && o.atk.target === u && !o.atk.bow) ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    // 塀越しの兵は数えない。ただし、柵を越えて届く槍の打ち手には構えて退く。
    const over = o.team !== u.team && attacking && (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (d > 24 || Math.abs(o.pos.y - u.pos.y) > 3 ||
        (over ? army.wallBetween(o.pos, -1, u.pos, true) : army.wallBetween(u.pos, -1, o.pos))) continue;
    if (o.team !== u.team) {
      if (d < fd) { fd = d; foe = o; }
      if (d < ad && o.type !== 'gun' && o.type !== 'bow' && attacking) { ad = d; attacker = o; }
      if (d < 5 && !o.playerQueue && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) { close++; ex += o.pos.x; ez += o.pos.z; }
    } else if (!o.isStruct && o.type !== 'porter' && !o.rearWound && !o.woundOut) {
      if (d < 8 && o.type !== 'gun' && o.type !== 'bow') support++;
      if (d < md) { md = d; mate = o; }
    }
  }
  // 前線の一人へ戻るだけでは再び囲まれる。敵の塊から離れる側の味方を選ぶ。
  if (close && mate) {
    let score = Infinity;
    for (const o of army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.group?.routed || o.group?.hidden || o.downed || o.noTarget || o.isStruct ||
          o.type === 'porter' || o.rearWound || o.woundOut) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d > 24 || Math.abs(o.pos.y - u.pos.y) > 3 || army.wallBetween(u.pos, -1, o.pos)) continue;
      const away = Math.hypot(o.pos.x - ex / close, o.pos.z - ez / close);
      const value = d - Math.min(away, 16) * 1.5;
      if (value < score) { score = value; mate = o; md = d; }
    }
  }
  const hurt = u.hp < u.maxHp * 0.55, tired = p.sta < p.maxSta * 0.22;
  // 傷を縛れるのは一度だけ。残り回数があっても処置済みなら任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted &&
    !(b.def.botTreatmentPoint && b.botTreatNext === Infinity);
  // 手当て後の傷は戻らない。列へ戻り、一人の敵を受けられる時まで退避を繰り返さない。
  // 包囲・気力切れ・手当て前は、味方がそばにいても退く。
  const supported = support >= 2 && close <= 1;
  // 前線の敵三人を包囲と決めつけない。味方と並べる時まで退くと、槍を一度も合わせられない。
  const outnumbered = close >= 4 || close >= 3 && close > support + 1;
  if (u.mobbed || outnumbered || (close && (tired || (hurt && (canTreat || !supported))))) {
    b.botSurviveUntil = b.t + 2;
  }
  const retreating = b.botSurviveUntil > b.t;
  if (retreating || (hurt && canTreat && !foe && mate)) {
    b.botSurviving = true;
    inp.leftPressed = false; inp.chargeHold = false; inp.k.delete('KeyE');
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    inp.runHeld = false; inp.guardHold = !!foe;
    if (retreating && foe) {
      // 退避中も実際の打ち手を受ける。近いだけの敵へ向くと、横からの一撃が構えを抜ける。
      const face = attacker || foe;
      // 狙いを残すと、指で向き直っても更新時に別の敵へ引き戻される。
      if (p.lock && p.lock !== face) inp.e.add('KeyQ');
      p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
      // 味方へ戻る方向を、敵に向いたまま前後左右の歩みに替える。
      let dx = mate ? mate.pos.x - u.pos.x : u.pos.x - (close ? ex / close : foe.pos.x);
      let dz = mate ? mate.pos.z - u.pos.z : u.pos.z - (close ? ez / close : foe.pos.z);
      // 味方の列の後ろへ四歩。入れ物は戦ごとに使い回す。
      const back = b._botBackPoint || (b._botBackPoint = { x: 0, z: 0 });
      const ax = (mate ? mate.pos.x : u.pos.x) - (close ? ex / close : foe.pos.x);
      const az = (mate ? mate.pos.z : u.pos.z) - (close ? ez / close : foe.pos.z);
      const len = Math.hypot(ax, az) || 1;
      back.x = u.pos.x + dx + ax / len * 4; back.z = u.pos.z + dz + az / len * 4;
      // 山道では後ろの味方まで道の折れをたどる。法面へ退き続けない。
      const way = b.world.def.moveWay ? b.world.def.moveWay(army, u, back) : back;
      if (!army.wallBetween(u.pos, -1, way)) { dx = way.x - u.pos.x; dz = way.z - u.pos.z; }
      else { dx = u.pos.x - foe.pos.x; dz = u.pos.z - foe.pos.z; }
      // 壁に沿う左右の一歩も試す。ふさがれた後ろへ押し続けない。
      const step = b._botEscapeStep || (b._botEscapeStep = { x: 0, z: 0 });
      let best = -Infinity, bx = 0, bz = 0;
      const walk = Math.atan2(dx, dz), moving = Math.hypot(dx, dz) > 0.3;
      const choose = !(b._botEscapeAt > b.t);
      for (let i = 0; choose && moving && i < 7; i++) {
        const turn = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 4;
        const sx = Math.sin(walk + turn), sz = Math.cos(walk + turn);
        step.x = u.pos.x + sx * 1.5; step.z = u.pos.z + sz * 1.5;
        if (army.wallBetween(u.pos, -1, step) || !b.world.walkable(step.x, step.z, u.pos.y)) continue;
        let danger = 0;
        for (const o of army.units) {
          if (!o.alive || o.team === u.team || o.fleeing || o.isStruct || o.noTarget || o.playerQueue ||
              Math.abs(o.pos.y - u.pos.y) > 1.8) continue;
          const gap = Math.hypot(o.pos.x - step.x, o.pos.z - step.z);
          if (gap < 4) danger += (4 - gap) * (o.target === u ? 2 : 1);
        }
        const value = Math.cos(turn) * 2 - danger;
        if (value > best) { best = value; bx = sx; bz = sz; }
      }
      // 探し直しは四分の一秒ごと。毎コマ全兵を七回たどらない。
      if (choose) { b._botEscapeAt = b.t + 0.25; b._botEscapeX = bx; b._botEscapeZ = bz; }
      dx = b._botEscapeX || 0; dz = b._botEscapeZ || 0;
      const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
      const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
      if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
      // 深手や包囲から退く時は、振りが途切れても歩みを止めない。
      // 反撃のための半秒の待ちで止まると、次の打ち込みで退避をやり直し続ける。
      // 一人を相手にし、元気か、手当てを終えて味方の列へ戻れた時だけ隙を突く。
      const reach = p.weapon === 'sword' ? 1.9 : 2.8;
      const faceDist = attacker ? ad : fd;
      if ((!hurt || (!canTreat && supported)) && !u.mobbed && close <= 1 && !attacker && canStrike(p, face) && faceDist < reach &&
          !tired && p.sta >= 18 &&
          (p.weapon === 'sword' || p.weapon === 'spear')) {
        // 突きの待ち時間に構え直すと、槍を解く半秒を毎回やり直してしまう。
        patientStrike(p, inp, face, faceDist);
        if (!inp.guardHold) {
          inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
        }
      }
      return true;
    }
    if (!foe && mate && canTreat && hurt && !(b.botTreatNext > b.t)) {
      if (!b.botTreatUntil) b.botTreatUntil = b.t + 12;
      const back = b.def.botTreatmentPoint?.(b);
      if (p.lock) inp.e.add('KeyQ');
      if (p.treatmentReady) inp.k.add('KeyE');
      else if (back) goTo(p, inp, back.x, back.z, 1);
      else if (md > 4) goTo(p, inp, mate.pos.x, mate.pos.z, 4);
      else {
        // 被弾から六秒、安全に立ち止まり、三秒長押しして縛る。
        // 敵を狙う癖や狙いの固定を残すと、手当て可能にならない。
        inp.guardHold = false;
        if (p.lock) inp.e.add('KeyQ');
        if (p.treatmentReady) inp.k.add('KeyE');
      }
      if (b.t < b.botTreatUntil) return true;
      // 峠では敵に会うまで待ち直さず、本道の任務へ戻す。
      b.botTreatUntil = 0; b.botTreatNext = b.def.botTreatmentPoint ? Infinity : b.t + 15;
    } else b.botTreatUntil = 0;
    // 退き口が開いたら任務へ戻る。体力が全快するのを待たない。
    b.botSurviveUntil = 0;
  }
  if (inp.k.has('KeyS') || inp.k.has('KeyA') || inp.k.has('KeyD')) {
    inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  }
  b.botSurviving = false;
  return false;
}

// 討たれない相手も、実際に手傷を負わせられる間は突ける。深手の後は連打しない。
function canStrike(p, e) {
  return !e.woundOut && (!e.invuln ||
    (e.hp > e.maxHp * WOUND_FLOOR && p.rt.army.mayWound(e, p.u)));
}

// 受ける間と突く間を分ける。槍は構えたまま押すと、気力を使う払いになる。
function strikeTarget(b, radius) {
  const p = b.player, u = p.u;
  // 近いだけの兵より、今こちらへ打ち込む兵を先に受ける。
  // 敵の槍が柵を越えて届く時も、こちらの間合いだけで打ち手を見失わない。
  let attacker = null, ad = radius;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget ||
        o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const over = (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (d < ad && !b.army.wallBetween(o.pos, -1, u.pos, over)) { attacker = o; ad = d; }
  }
  if (attacker) return attacker;
  const previous = p.botStrikeFoe;
  // 構えを解いている間は、まだ届く相手を保つ。近い兵の入れ替わりで反撃を取り消さない。
  if (p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team &&
      !previous.fleeing && !previous.noTarget && canStrike(p, previous) &&
      Math.abs(previous.pos.y - u.pos.y) < 3 &&
      Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.9 : 2.8) &&
      !b.army.wallBetween(u.pos, -1, previous.pos, p.weapon === 'spear')) return previous;
  return b.army.nearestEnemy(u, radius, (o) => o.type !== 'dummy' && !o.noTarget && canStrike(p, o) && !o.fleeing &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos,
      p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2.8));
}

function patientStrike(p, inp, e, d, windupOpening = false) {
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 味方へ向けた振りは自分への打ち込みではない。打ち手の実際の的を見る。
  const attacking = (e.atk && e.atk.target === p.u && !e.atk.bow) ||
    (e.swing && !e.swing.done && e.swing.target === p.u) || (e.charging && e.target === p.u);
  // 長い振りかぶりには、普通の突きが先に届く間だけ反撃できる。
  // 戦の頭が他の打ち手も確かめた時だけ使う。振り出した武器には割り込まない。
  const winding = windupOpening && e.atk?.target === p.u && !e.atk.ranged && !e.atk.bow &&
    e.atk.t > 0.65 && !e.charging && !(e.swing && !e.swing.done);
  const safe = d < reach && (!attacking || winding);
  const opening = safe &&
    (winding || p.counterT > 0 || e.cd > 0.3 || e.stagger > 0.3 || e.target !== p.u);
  // 構えを解いた槍は半秒ほど待つ。敵の隙が縮んでも、その途中で構え直さない。
  // 別の相手や新しい振りかぶりには、待ちを持ち越さない。
  if (!safe || p.botStrikeFoe !== e) p.botStrikeUntil = 0;
  if (opening && !(p.botStrikeUntil > p.time)) { p.botStrikeFoe = e; p.botStrikeUntil = p.time + 0.7; }
  const striking = safe && (opening || p.botStrikeUntil > p.time);
  // 打ち込みがない間は構えを解いて気力を戻す。隙がなくても構え続けると、
  // 突くための気力を失い、次の打ち込みで構えまで崩れてしまう。
  inp.guardHold = !striking && !!attacking;
  inp.runHeld = false; inp.chargeHold = false;
  inp.leftPressed = striking && canStrike(p, e) && p.cd <= 0 && !p.pending && p.sta > p.maxSta * 0.35 &&
    (p.weapon === 'sword' || p.weapon === 'spear') &&
    (p.weapon === 'sword' || (!p.guard && p.time - (p.guardOffT ?? -9) > 0.45));
}

// 戦ごとの遊び方（素直な遊び手を真似る）
export function brain(b, inp) {
  const p = b.player, u = p.u;
  b.botCovering = false;
  b.botFollowingTaba = false;
  // 決着後も追手は動く。退却中は操作を止めず、殿の後ろへ離れる。
  if (b.withdrawal && !b.ended && u.alive) {
    inp.k.clear(); inp.e.clear(); inp.leftPressed = false; inp.guardHold = false;
    inp.runHeld = false; inp.chargeHold = false; inp.quickCmd = null;
    const foe = b.army.nearestEnemy(u, 40, (o) => !o.fleeing && !o.noTarget && !o.isStruct);
    if (b.def.botWithdraw) b.def.botWithdraw(b, inp, { goTo });
    else {
      const g = b.withdrawal.guard;
      const c = g && g.team === u.team ? g.center() : u.pos;
      let dx = g && g.team === u.team ? g.fleeDir.x : foe ? u.pos.x - foe.pos.x : -Math.sin(p.yaw);
      let dz = g && g.team === u.team ? g.fleeDir.z : foe ? u.pos.z - foe.pos.z : -Math.cos(p.yaw);
      const d = Math.hypot(dx, dz) || 1, lim = b.world.def.moveLim || 176;
      goTo(p, inp, Math.max(-lim, Math.min(lim, c.x + dx / d * 40)),
        Math.max(-lim, Math.min(lim, c.z + dz / d * 40)), 3);
    }
    if (foe && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 8) {
      const walkYaw = p.yaw, walking = inp.k.has('KeyW');
      p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      if (walking) {
        inp.k.delete('KeyW');
        const da = walkYaw - p.yaw;
        if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
      }
      inp.guardHold = true;
    } else inp.runHeld = true;
    return;
  }
  // 操作できない終戦の演出では、直前の入力を持ち越さない。
  if (b.over || b.ended || b.flags.ending) {
    inp.k.clear(); inp.e.clear(); inp.leftPressed = false; inp.guardHold = false;
    inp.runHeld = false; inp.chargeHold = false; inp.quickCmd = null;
    return;
  }
  if (!u.alive) return;
  // 手綱を取る一秒ほどは歩く判断を休む。別の頭が持ち場へ歩かせると、
  // 手綱が届かなくなり、乗る前に取り消される。
  if (p.catching) {
    inp.k.clear(); inp.e.clear(); inp.leftPressed = false; inp.guardHold = false;
    inp.runHeld = false; inp.chargeHold = false; inp.quickCmd = null;
    b.botSurviving = false;
    return;
  }
  // 砦では門への道順と組への下知を先に考え、その後で射撃を避ける。
  // 射手が交互に狙うだけで、戦の頭が一度も呼ばれなくなるのを防ぐ。
  if (survive(b, inp)) return;
  if (!b.def.botDefendsFort && cover(b, inp)) return;
  // 戦を濃くする段（b_depth.js）の間は、その段の的へ
  if (b.flags.dp && b.flags.dp.on && !b.def.botBrainDepth) { depthBot(b, inp, goTo); cover(b, inp); return; }
  // 戦ごとの遊び方があればそれを使う（b_*.js の def.botBrain）
  if (b.def.botBrain) { b.def.botBrain(b, inp, { goTo, patientStrike, strikeTarget, canStrike }); cover(b, inp); return; }
  // 柵を使う別の戦にも、設楽原の動きを押し付けない。
  if (b.flags.fence) return shitaraBrain(b, inp);
  // 深手なら下がって手当て（墨俣の普請小屋）
  const heal = b.interacts.find((x) => x.id === 'heal');
  if (heal && u.hp < u.maxHp * 0.4 && !(b.flags.healCd > b.t)) {
    goTo(p, inp, 0, 1, 2);
    if (Math.hypot(u.pos.x, u.pos.z - 0.5) < 3.5) inp.e.add('KeyE');
    return;
  }
  // 近くに敵がいれば向き直って突く
  const e = b.army.nearestEnemy(u, b.index === 0 && b.phase !== 'assault' ? 0 : 40, (o) => o.type !== 'dummy' && !o.noTarget);
  inp.k.delete('KeyW');
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    // 予兆を見たら構える
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    // 号令は2秒に一度まで（人が連打しないのと同じ）
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && d < 20 && (b.index !== 1 || b.flags.signal) && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 2; }
    return;
  }
  inp.guardHold = false;
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 2; }
  // 任務の印へ向かう
  // 墨俣では砦を離れすぎない（旗を追って砦を空けない）
  const far = (x) => b.index === 2 && x.id === 'flag' && x.pos && typeof x.pos !== 'function' && Math.hypot(x.pos.x, x.pos.z) > 45;
  const m = b.markers.find((x) => !x.red && !far(x)) || b.markers.find((x) => !far(x));
  if (b.index === 0 && b.phase === 'brief' && b.flags.genpachi) {
    const g = b.flags.genpachi;
    goTo(p, inp, g.pos.x, g.pos.z, 2.5);
    if (Math.hypot(g.pos.x - u.pos.x, g.pos.z - u.pos.z) < 3) inp.e.add('KeyE');
    return;
  }
  if (b.index === 0 && (b.phase === 'march' || b.phase === 'wait')) {
    if (b.flags.denrei === 'active' && b.flags.yohei) { goTo(p, inp, b.flags.yohei.pos.x, b.flags.yohei.pos.z, 2); if (Math.hypot(b.flags.yohei.pos.x - u.pos.x, b.flags.yohei.pos.z - u.pos.z) < 3) inp.e.add('KeyE'); return; }
    const c = b.hostGroup.center();
    goTo(p, inp, c.x + 2, c.z, 4);
    return;
  }
  if (b.index === 0 && b.phase === 'assault' && !b.flags.entered) { goTo(p, inp, 18, -116, 2); return; }
  if (m) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q) goTo(p, inp, q.x, q.z, 3); }
  // 首や旗は取る（ただし桶狭間は取らない）
  const it = b.nearestInteract();
  inp.k.delete('KeyE');
  if (it && !(b.index === 0 && it.id.startsWith('head'))) { inp.e.add('KeyE'); inp.k.add('KeyE'); inp.k.delete('KeyW'); }
}
function shitaraGate(route, z) {
  let gz = route.gates[0];
  for (const g of route.gates) if (Math.abs(g - z) < Math.abs(gz - z)) gz = g;
  return gz + route.offset;
}
// 近い虎口から柵と土塁の後ろへ出て、南北へ移る。遠い虎口へ柵を横切らない。
function shitaraPost(b, inp, post) {
  const p = b.player, pos = p.u.pos, route = b.flags.fenceRoute;
  if (!route) { goTo(p, inp, post.x, post.z, 1.5); return; }
  if (pos.x > route.rearX + 0.8 && (Math.abs(pos.z - post.z) > 8 || pos.x > post.x + 1.5)) {
    const gz = shitaraGate(route, pos.z);
    if (Math.abs(pos.z - gz) > 0.8) goTo(p, inp, pos.x, gz, 0.5);
    else goTo(p, inp, route.rearX, gz, 0.5);
  } else if (pos.x <= route.rearX + 0.8 && Math.abs(pos.z - shitaraGate(route, post.z)) > 0.8) {
    goTo(p, inp, route.rearX, shitaraGate(route, post.z), 0.5);
  } else goTo(p, inp, post.x, post.z, 1.5);
}
// 設楽原：普請と組の持ち場を守り、射撃の後に撃ち漏らしを受ける。追い討ちは虎口から出る
function shitaraBrain(b, inp) {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW');
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
  const inside = !F.pursuit;
  const post = F.pendingWave ? F.commandPt : F.wave === 0 ? F.prepPt : F.commandPt;
  const waiting = inside && (!F.close || F.waveRest || F.cur?.doneWave);
  // 下知で決まった奥の持ち場を守る。射撃待ちでも奥の柵まで抜けた敵は止める。
  // 柵間の敵は追わず、鉄砲の射線を空ける。
  let attacker = null, ad = 4.5;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 敵の穂先が柵を越える時は、敵側から実際の打ち込みの道を調べる。
    const over = (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (b.army.wallBetween(o.pos, -1, u.pos, over)) continue;
    if (d < ad) { ad = d; attacker = o; }
  }
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const e = attacker || b.army.nearestEnemy(u, inside ? 12 : 40, (o) =>
    !o.fleeing && !o.noTarget && canStrike(p, o) && Math.abs(o.pos.y - u.pos.y) < 3 &&
    (!inside || o.pos.x < 14) && (!waiting || post && o.pos.x < 0 && Math.hypot(o.pos.x - post.x, o.pos.z - post.z) < 12) && !b.army.wallBetween(u.pos, -1, o.pos,
      p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 受け止める下知の後は、近い敵にも突きの間合いまで寄る。
    // 「近い敵」と見ただけで止まると、敵の槍だけが届く距離で構え続けてしまう。
    // 敵を追う時も、持ち場へ歩く時と同じ詰まりの判断と回り込みを使う。
    if (d > reach && (!waiting || e.pos.x < 0) && (!inside || u.pos.x < 12.4)) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.9);
    // 打ち込み中は受け、隙に構えを解いて突く。構えたままの連打は払いになり、気力を失う。
    if (d < reach) patientStrike(p, inp, e, d);
    else { inp.guardHold = !!attacker; inp.runHeld = false; }
    return;
  }
  if (inside) {
    if (post) shitaraPost(b, inp, post);
    // 次の持ち場へは奥の道を走る。敵を受ける時と到着後は歩みに戻す。
    inp.runHeld = !!post && !F.close && !F.waveRest && inp.k.has('KeyW') &&
      Math.hypot(u.pos.x - post.x, u.pos.z - post.z) > 12 && p.sta > p.maxSta * 0.4;
    return;
  }
  // 柵の外へ：三列で重なる虎口を通って殿へ。
  const route = F.fenceRoute;
  if (route && u.pos.x < route.frontX - 0.5) {
    const gz = shitaraGate(route, u.pos.z);
    if (Math.abs(u.pos.z - gz) > 0.8) goTo(p, inp, u.pos.x, gz, 0.5);
    else goTo(p, inp, route.frontX, gz, 0.5);
    return;
  }
  const m = b.markers.find((x) => x.id === 'rear');
  if (m) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q) goTo(p, inp, q.x, q.z, 3); }
}

// 鉄砲の狙いと飛んでくる矢を見て横へ逃げる。矢玉は構えでは防げない。
function cover(b, inp) {
  const p = b.player, u = p.u;
  if (!u.alive) return false;
  // 目の前の打ち込みを受ける間は射手へ向き直らない。横走りで構えを解くと、
  // 鉄砲を避けるたびに足軽の一撃を受ける。退避と戦ごとの頭に受けを任せる。
  for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.isStruct ||
        o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    if (!((o.atk && !o.atk.bow && o.atk.target === u) ||
        (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u))) continue;
    const spear = (o.wpnKind || o.lookWeapon) === 'spear';
    if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (o.reach || 2.9) + 0.3 &&
        !b.army.wallBetween(o.pos, -1, u.pos, spear)) return false;
  }
  let s = null, near = Infinity, fireIn = Infinity;
  for (const o of b.army.threats || []) {
    // 狙い始めた鉄砲は、射手の側で射線を確かめ済み。歩きを塞ぐ柵でも玉は通る。
    // 歩き用の wallBetween で除くと、柵越しの鉄砲だけ避けなくなる。
    if (!o.alive || o.fleeing || o.type !== 'gun' || o.atk?.target !== u) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 近い射手より、先に撃つ射手を避ける。別の鉄砲の発射を見落とさない。
    if (o.atk.t < fireIn || (o.atk.t === fireIn && d < near)) { fireIn = o.atk.t; near = d; s = o; }
  }
  if (!s) {
    // 弓も引き絞る姿を見て避け始める。矢が届く直前からでは、泥道や指の向き直りが間に合わない。
    for (const o of b.army.units) {
      if (!o.alive || o.fleeing || o.team === u.team || o.type !== 'bow' ||
          !o.atk?.bow || o.atk.target !== u || b.army.hiddenBehind(o, u) ||
          b.army.shotBlocked(o, u.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < near) { near = d; s = o; }
    }
  }
  if (!s) {
    // 弓の引きは threats に含まれない。実際の矢の進路を読み、被弾前に避ける。
    // 入れ物は増やさず、もう地面や塀に刺さった矢は調べない。
    let soon = 1.5;
    for (const a of b.army.arrows || []) {
      if (a.stuck || a.glanced || a.team === u.team || !a.owner) continue;
      const dx = u.pos.x - a.pos.x, dz = u.pos.z - a.pos.z;
      const speed2 = a.vel.x * a.vel.x + a.vel.z * a.vel.z;
      if (speed2 < 1) continue;
      const t = (dx * a.vel.x + dz * a.vel.z) / speed2;
      if (t <= 0 || t >= soon) continue;
      const y = a.pos.y + a.vel.y * t - 4.9 * t * t;
      if (y < u.pos.y || y > u.pos.y + (p.mounted ? 3.5 : 1.9) ||
          Math.hypot(dx - a.vel.x * t, dz - a.vel.z * t) > 1) continue;
      soon = t; s = a.owner;
    }
  }
  if (!s) {
    s = b.botShooter;
    if (!s?.alive || !(b.t - (b.botShotT ?? -99) < 2.5)) return false;
    if (s.type === 'gun' && (b.army.shotBlocked(s, u.pos) || b.army.hiddenBehind(s, u))) return false;
    if (b.army.nearestEnemy(u, 4, (o) => o.type !== 'bow' && o.type !== 'gun' &&
        !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 &&
        !b.army.wallBetween(u.pos, u.team, o.pos, false))) return false;
    // 被弾後の避け足は三秒だけ。飛来中の矢や鉄砲の狙いには待ち時間を設けない。
    if (!(b._botCoverUntil > b.t)) {
      if (b._botCoverNext > b.t) return false;
      b._botCoverUntil = b.t + 3;
      b._botCoverNext = b.t + 15;
    }
  }
  // 竹束の陰から横へ飛び出すと、避け足そのものが矢玉を招く。
  // taketaba.js の防ぎ方と同じ距離・向きで、射手との間に楯があるかを見る。
  const sx = s.pos.x - u.pos.x, sz = s.pos.z - u.pos.z, sd = Math.hypot(sx, sz);
  if (sd > 6) {
    for (const tb of b.flags.tabas || []) {
      if (tb.team !== u.team) continue;
      const dx = tb.x - u.pos.x, dz = tb.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d >= 0.05 && d <= 2.6 && (dx * sx + dz * sz) / (d * sd) > 0.5) return false;
    }
  }
  // 狙われている間じゅう斬り合いを止めると、町屋の鉄砲が交互に狙うだけで
  // 一度も反撃できない。発射まで間があれば、届く敵との打ち合いを続ける。
  const melee = b.army.nearestEnemy(u, 3, (o) => !o.fleeing && !o.woundOut && !o.noTarget &&
    !o.isStruct && o.type !== 'gun' && o.type !== 'bow' &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (melee && s.type === 'gun' && s.atk?.target === u && s.atk.t > 0.5) return false;
  // 塀へ同じ避け足を出し続けない。通れる側を選び、入れ物は使い回す。
  const step = b._botCoverPoint || (b._botCoverPoint = { x: 0, y: 0, z: 0 });
  let side = u.id % 2 ? 1 : -1;
  const len = sd || 1, dx = sz / len, dz = -sx / len;
  step.x = u.pos.x + dx * side * 2; step.y = u.pos.y; step.z = u.pos.z + dz * side * 2;
  if (b.army.wallBetween(u.pos, -1, step) || b.def.botCoverBlocked?.(b, u.pos, step)) {
    side = -side;
    step.x = u.pos.x + dx * side * 2; step.z = u.pos.z + dz * side * 2;
    if (b.army.wallBetween(u.pos, -1, step) || b.def.botCoverBlocked?.(b, u.pos, step)) return false;
  }
  let face = s, ad = 6;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { face = o; ad = d; }
  }
  if (p.lock && p.lock !== face) inp.e.add('KeyQ');
  p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
  // 鉄砲を避ける時も、横からの槍には正面を向けて構える。
  inp.guardHold = face !== s; inp.leftPressed = false; inp.chargeHold = false;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  const fw = (step.x - u.pos.x) * Math.sin(p.yaw) + (step.z - u.pos.z) * Math.cos(p.yaw);
  const across = -(step.x - u.pos.x) * Math.cos(p.yaw) + (step.z - u.pos.z) * Math.sin(p.yaw);
  if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(across) > 0.3) inp.k.add(across > 0 ? 'KeyD' : 'KeyA');
  inp.runHeld = !inp.guardHold;
  if (s.type === 'gun' && s.atk && s.atk.t < 0.5 && p.sta >= 20 && p.dodgeT <= -0.3) inp.e.add('Space');
  b.botCovering = true;
  return true;
}

// 建物・柵など当たりに引っかかって進めない時は、まっすぐ狙わず少し脇へそれて回り込む
// （goTo は直線で歩かせるだけで道を選ばない。稲葉山の町の家（b_inabayama.js の HOUSES）のような
// 障害物の手前で詰まる不具合が、ここを直せば戦をまたいで直る）
function goTo(p, inp, x, z, r, roadReady = false) {
  const u = p.u;
  if (!roadReady && p.rt.world.def.moveWay) {
    const goal = p._roadGoal || (p._roadGoal = { x: 0, z: 0 });
    goal.x = x; goal.z = z;
    const q = p.rt.world.def.moveWay(p.rt.army, u, goal);
    if (q !== goal) { x = q.x; z = q.z; r = Math.min(r, q.botRadius ?? 1); }
  }
  const d = Math.hypot(x - u.pos.x, z - u.pos.z), t = p.rt.t;
  const q = p._gtPos || (p._gtPos = { x: u.pos.x, z: u.pos.z, t });
  const changed = !p._gtGoal || Math.hypot(x - p._gtGoal.x, z - p._gtGoal.z) > 1;
  const goal = p._gtGoal || (p._gtGoal = { x: 0, z: 0 });
  goal.x = x; goal.z = z;
  // 道の曲がり角や新しい行き先では、前の詰まりを引き継がない。
  if (d <= r || changed) {
    p._gtStuckT = 0; p._gtDetourT = 0;
    q.x = u.pos.x; q.z = u.pos.z; q.t = t;
    if (d <= r) { inp.k.delete('KeyW'); return; }
  }
  // 呼ばれた回数ではなく、一秒間に実際に進んだ距離で詰まりを見る。
  if (t - q.t >= 1) {
    const moved = Math.hypot(u.pos.x - q.x, u.pos.z - q.z);
    p._gtStuckT = moved < 0.35 ? (p._gtStuckT || 0) + t - q.t : 0;
    q.x = u.pos.x; q.z = u.pos.z; q.t = t;
    if (p._gtStuckT >= 2 && !(p._gtDetourT > t)) {
      p._gtSide = p._gtSide ? -p._gtSide : (u.id % 2 ? 1 : -1);
      p._gtDetourT = t + 3;
    }
  }
  let yaw = Math.atan2(x - u.pos.x, z - u.pos.z);
  // 動き始めても三秒は同じ側へ回り、すぐ壁へ当たり直さない。
  if (p._gtDetourT > t) yaw += p._gtSide * 1.35;
  p.yaw = yaw; inp.k.add('KeyW');
  p._botGoToT = t; p._botGoToYaw = yaw;
}

const rep0 = (i) => (BATTLES[i] ? BATTLES[i].name.replace(/の戦い|の決戦|築城防衛/, '') : `第${i + 1}戦`);

// o：{ name, note, start }（start を渡すと startBattle の代わりにそれで戦を始める。日本地図の城攻め用）
async function playOne(game, i, G, aud, o = {}) {
  game.G = G;
  game.lastError = '';
  if (o.start) o.start(); else game.startBattle(i);
  // 定義は出陣時に読む。支度中に次の戦を頼むと、前の読み込みが取り消される。
  for (let n = 0; n < 120 && !game.battle && !game.lastError; n++) await wait(250);
  const b = game.battle;
  const name = o.name || rep0(i);
  if (!b) return { battle: name, note: o.note || '', errors: [game.lastError || '戦の支度が時間内に終わらなかった'], stuck: [], waits: [], flow: [], named: [], time: 0, msPerFrame: 0, merit: 0, main: false, squad: '—', down: false, lines: '' };
  finishDeployment(game);
  await watchDeployment(game);
  // 開戦の札も出陣の釦から閉じる。札の上で歩みを試さない。
  if (!enterBattle(game)) {
    game.stopBattle();
    return { battle: name, note: o.note || '', errors: ['開戦の札から出陣できなかった'], stuck: [], waits: [], flow: [], named: [], time: 0, msPerFrame: 0, merit: 0, main: false, squad: '—', down: false, lines: '' };
  }
  if (!b.flags.rojoUI) game.paused = false;
  document.getElementById('pause').hidden = true;
  if (aud) { aud.attach(b, name); aud.scanDom(`${name}・開戦`); }
  let paused1 = false;
  const inp = fake();
  const rep = { battle: name, note: o.note || '', key: b.def.key || (b.def.mapCastle ? 'castle' : ''), errors: [], stuck: [], waits: [], flow: [] };
  const onErr = (ev) => rep.errors.push(`${ev.message}（${(ev.filename || '').split('/').pop()}:${ev.lineno}）`);
  window.addEventListener('error', onErr);
  let t = 0, lastObj = '', lastObjT = 0, lastObjPh = '', lastPos = { x: 0, z: 0 }, idle = 0, frames = 0, ms = 0, lastMain = '';
  // 何に削られたか（矢・鉄砲・槍…）を数える。矢玉なら cover() が身を守る
  const hurt = {};
  const td = b.player.takeDamage.bind(b.player);
  b.player.takeDamage = (a, src) => {
    const d = td(a, src);
    const k = src ? (src.isStruct ? '柵' : ({ bow: '弓', gun: '鉄砲', cavalry: '騎馬', samurai: '侍', busho: '武将', ashigaru: '足軽' }[src.type] || src.type)) : '?';
    hurt[k] = (hurt[k] || 0) + (d || 0);
    if (src && (src.type === 'bow' || src.type === 'gun') && d > 0) { b.botShotT = b.t; b.botShooter = src; }
    return d;
  };
  const dt = 0.05;
  try {
    while (game.battle === b && !b.ended && t < 900) {
      if (!enterBattle(game)) { rep.errors.push('開戦の「出陣する」を押しても戦を始められなかった'); break; }
      // 日送りの札では本番と同じく戦を止め、実時間の時計だけを待つ。
      if (game.paused) { await wait(100); continue; }
      inp.endFrame();
      for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) inp.k.delete(k);
      brain(b, inp);
      const t0 = performance.now();
      b.update(dt, inp);
      ms += performance.now() - t0; frames++;
      if (aud) aud.tick(dt);
      // 一時停止の札も一度測る
      if (aud && !paused1 && t > 30) { paused1 = true; game.noLock = true; press('Escape'); await wait(400); aud.scanDom(`${name}・一時停止`); await aud.tryButtons(document.getElementById('pause'), `${name}・一時停止`); press('Escape'); await wait(200); game.paused = false; document.getElementById('pause').hidden = true; }
      t += dt;
      if (rep.decisionTime == null && (b.over || b.ended || b.flags.ending || !b.player.u.alive)) rep.decisionTime = Math.round(b.t);
      // 任務が長く変わらない場面（待たされている所）
      const key = b.objectives.map((o) => o.text + o.state).join('|');
      if (key !== lastObj) { if (t - lastObjT > 120) rep.waits.push(`${Math.round(lastObjT)}〜${Math.round(t)}秒：任務が変わらない（段 ${lastObjPh || '―'}）`); lastObj = key; lastObjT = t; lastObjPh = b.phase; }
      // 任務の流れ（主な任務の文が変わった時だけ記す）
      // 戦略家の操作は専用の試験で扱う。この通常試験には人物別の操作係がいない。
      const mo = b.objectives.filter((q) => q.kind === 'main').map((q) => q.text + (q.state ? `〔${q.state === 'done' ? '済' : '失'}〕` : '')).join('／');
      if (mo !== lastMain) { lastMain = mo; if (rep.flow.length < 14) rep.flow.push(`${Math.round(b.t)}s ${mo || '（任務なし）'}`); }
      // 動けなくなった所
      const u = b.player.u.pos;
      if (!openingWait(game) && Math.hypot(u.x - lastPos.x, u.z - lastPos.z) < 0.02 && inp.k.has('KeyW')) idle += dt; else idle = 0;
      if (idle > 8) { rep.stuck.push(`${Math.round(t)}秒：前へ進めない（${Math.round(u.x)}, ${Math.round(u.z)}・段 ${b.phase || '―'}）`); idle = -30; }
      lastPos = { x: u.x, z: u.z };
      if (frames % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) { rep.errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' ')); }
  window.removeEventListener('error', onErr);
  rep.timeout = t >= 900 && !b.over;
  rep.named = aud ? aud.endCheck(b, rep.timeout) : [];
  rep.time = rep.decisionTime ?? Math.round(b.t);
  rep.afterDecision = Math.max(0, Math.round(b.t) - rep.time);
  rep.msPerFrame = +(ms / Math.max(1, frames)).toFixed(2);
  rep.merit = b.tracker.total();
  rep.main = b.tracker.main;
  rep.squad = b.squad.length ? `${b.squad.filter((s) => s.alive).length}/${b.squad.length}` : '—';
  rep.down = !!(b.result && b.result.down);
  rep.hurt = Object.entries(hurt).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join('・');
  rep.lines = b.tracker.lines().map((l) => `${l.label} ${l.pts > 0 ? '+' : ''}${l.pts}`).join('、');
  // 戦のあとの画面（昇進・評価、地図の城攻めなら地図の結果の札）も測る
  await wait(3500);
  if (aud) aud.scanDom(`${name}・戦のあと（昇進／評価）`);
  await wait(3500);
  if (aud) aud.scanDom(`${name}・戦のあと（評価）`);
  return rep;
}

// 日本地図から城を一つ選んで攻める（地図の筋書きは回ごとに替える）
async function playMap(game, aud, k) {
  const G = newGame('bot', 'normal', 'nagashino');
  G.practice = true; G.rank = 3; G.aijirushi = 'maru'; G.owned.push('katana');
  const mk = MAP_KEYS[(Q.get('mapk') != null ? +Q.get('mapk') : k) % MAP_KEYS.length];   // &mapk=番号：地図を決めて試す
  G.japan = null; ensureJapan(G, mk);
  game.G = G;
  game.japanMap('title', true);
  await wait(1500);
  aud.where = `日本地図（${mk}）`;
  aud.scanDom(`日本地図（${mk}）`);
  const J = window.__japan;
  const fail = (msg) => ({ battle: '日本地図の城攻め', note: mk, errors: [msg], stuck: [], waits: [], flow: [], named: [], time: 0, msPerFrame: 0, merit: 0, main: false, squad: '—', down: false, lines: '' });
  if (!J) return fail('日本地図が開かなかった（window.__japan が無い）');
  let ids = Object.keys(J.J.own).filter((id) => J.attackable(id));
  // &ctype=toride|yama|hira：城の形を絞って試す（無ければ絞らない）
  const ct = Q.get('ctype');
  if (ct && ids.some((id) => J.D.byId[id].type === ct)) ids = ids.filter((id) => J.D.byId[id].type === ct);
  if (!ids.length) return fail(`攻められる城が一つもない（${mk}）`);
  const id = ids[Math.floor(Math.random() * ids.length)];
  J.select(id); await wait(500);
  aud.scanDom(`日本地図・城を選んだ（${mk}）`);
  const c = J.D.byId[id];
  const rep = await playOne(game, 0, G, aud, { name: '日本地図の城攻め', note: `${mk}・${c.name}（${c.type}）`, start: () => J.attack() });
  // 地図の結果の札が、戦の結果と合っているか
  const rc = document.querySelector('.jp-rc');
  const won = rep.main === true && !rep.down;
  if (!rc) aud.add('辻褄', 'mapNoResult', '地図の城攻めのあと、結果の札が出ない', rep.note, 'endMapBattle → japanMap に result が渡っているかを見る');
  else if (rc.classList.contains('won') !== won) aud.add('辻褄', 'mapResultMismatch', '地図の結果の札が、戦の結果と食い違う', `戦：${won ? '勝ち' : '負け'}／札：${rc.classList.contains('won') ? '落城' : '落ちず'}（${rep.note}）`, 'endMapBattle の won の決め方と、戦の任務の成否をそろえる');
  else if (won && window.__japan && window.__japan.J.own[id] !== window.__japan.D.player) aud.add('辻褄', 'mapOwn', '城を落としたのに、地図の持ち主が変わらない', rep.note, 'japanResult で J.own を書き換える');
  return rep;
}

// 一つの戦だけ試す（?bot=2 など）
export async function runOne(game, i) {
  const G = newGame('bot', 'normal', window.__botScn || 'oda');
  G.practice = true; G.rank = [0, 1, 2][i]; G.aijirushi = 'maru';
  if (i === 2) G.owned.push('katana');
  const n = RANKS[G.rank].squad;
  if (n) fillRoster(G, n - (i >= 2 ? Math.round(n / 3) : 0), i >= 2 ? Math.round(n / 3) : 0);
  return playOne(game, i, G);
}

// 城下を測る（戦のあとの G で、札を一つずつ開く）
async function scanTown(game, G, i, aud, scn) {
  try {
    game.G = G; G.battle = i + 1; game.base(); await wait(700);
    document.querySelector('.tour')?.remove();
    for (const tb of [...document.querySelectorAll('[data-tab]')].map((x) => x.dataset.tab)) {
      document.querySelector(`[data-tab="${tb}"]`)?.click(); await wait(350);
      aud.scanDom(`${scn}の城下（${i + 1}戦目のあと）・${document.querySelector(`[data-tab="${tb}"]`)?.textContent.trim() || tb}`);
      await aud.tryButtons(document.getElementById('screen'), `${scn}の城下・${tb}`);
    }
  } catch (e) { aud.add('落ちた', 'town:' + String(e).slice(0, 40), `城下で例外：${String(e).slice(0, 80)}`, String(e && e.stack || '').split('\n')[1] || '', '城下の画面の組み立てを見直す'); }
}

export async function run(game) {
  // 戦の定義（battles.js）は題の画面から裏で読み始まるが、読み終わる前だと BATTLES が空で
  // listPlayable が城攻め・稽古場しか拾えない。ここで読み終わりを待ってから先へ進む
  await import('./battles.js');
  // テストプレイヤー（性格）で遊ぶ：?bot&persona=chu など（下の runPersona）
  if (Q.get('persona') || window.__persona) return runPersona(game, Q.get('persona') || window.__persona);
  // 速回し：描画を1秒に2枚まで落とす（戦の計算は bot が回すので、描画は画面を測る分だけでよい）。?bot&fast=0 で落とさない
  if (Q.get('fast') !== '0') {
    const caf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 500);
    window.cancelAnimationFrame = (id) => { clearTimeout(id); caf(id); };
  }
  // ?bot&norender：3D を描かない（機械が混んでいる時に。画面の字や札は DOM なので測れる。描画の不具合は見えなくなる）
  // 本体は main.js の isNorender() がループの draw() をまるごと飛ばす。ここは念のための二重の備え（renderer.render を直に呼ぶ道具のため）
  if ((Q.has('norender') || window.__norender) && game.renderer) game.renderer.render = () => {};
  const panel = document.createElement('div');
  panel.className = 'botpanel';
  panel.innerHTML = '<b>テストプレイ bot</b><div id="bot-log">戦を順に自動で遊んでいます…</div>';
  document.body.appendChild(panel);
  const log = (s) => { document.getElementById('bot-log').innerHTML += `<div>${s}</div>`; };
  const reports = [];
  const aud = new Auditor();
  window.__aud = aud;
  game.noLock = true;
  // タイトル・設定を測る
  aud.scanDom('タイトル');
  document.getElementById('b-set')?.click(); await wait(500);
  aud.scanDom('設定');
  await aud.tryButtons(document.getElementById('screen'), '設定');
  game.title(); await wait(400);
  const base = newGame('bot', 'normal', window.__botScn || 'oda');
  base.practice = true;
  const OKE = ['okehazama', 'moribe', 'sunomata'];
  for (let i = 0; i < 3; i++) {
    if (!want(OKE[i])) continue;
    const G = JSON.parse(JSON.stringify(base));
    G.practice = true; G.rank = Math.max(G.rank, [0, 1, 2][i]); G.aijirushi = 'maru';
    if (i === 2) G.owned.push('katana');
    const n = RANKS[G.rank].squad;
    if (n) fillRoster(G, n - (i >= 2 ? Math.round(n / 3) : 0), i >= 2 ? Math.round(n / 3) : 0);
    log(`${['桶狭間', '森部', '墨俣'][i]}を遊んでいます…`);
    const r = await playOne(game, i, G, aud);
    // 城下も測る（戦のあとの G で）
    if (i < 2 && want('town')) await scanTown(game, G, i, aud, '桶狭間編');
    reports.push(r);
    log(`${r.battle}：${r.time}秒・戦功${r.merit}・任務${r.main === true ? '達成' : '失敗'}・組${r.squad}・不具合${r.errors.length}件`);
  }
  // 長篠編：できている戦を順に（身分は戦の順に 足軽→組頭候補→組頭→足軽大将候補）
  {
    game.G = newGame('bot', 'normal', 'nagashino');
    const n = BATTLES.length;
    const keys = BATTLES.map((x) => x.id);
    for (let i = 0; i < n; i++) {
      if (!want(keys[i])) continue;
      const G = newGame('bot', 'normal', 'nagashino');
      G.practice = true; G.rank = Math.max(0, Math.min(3, i + (4 - n))); G.aijirushi = 'maru';
      if (G.rank >= 2) G.owned.push('katana');
      const sq = RANKS[G.rank].squad;
      if (sq) fillRoster(G, sq - (G.rank >= 2 ? Math.round(sq / 3) : 0), G.rank >= 2 ? Math.round(sq / 3) : 0);
      log(`${keys[i]}を遊んでいます…`);
      const r = await playOne(game, i, G, aud);
      if (i < n - 1 && want('town')) await scanTown(game, G, i, aud, '長篠編');
      reports.push(r);
      log(`${r.battle}：${r.time}秒・戦功${r.merit}・任務${r.main === true ? '達成' : '失敗'}・不具合${r.errors.length}件`);
    }
  }
  // ほかの筋書き（信長包囲網・関ヶ原・大坂の陣…）：できている戦を順に、新しく始めた身分で
  for (const sk of SCENARIO_ORDER.filter((k) => k !== 'nagashino' && k !== 'okehazama' && SCENARIOS[k])) {
    game.G = newGame('bot', 'normal', sk);
    const keys = BATTLES.map((x) => x.id);
    for (let i = 0; i < keys.length; i++) {
      if (!want(keys[i])) continue;
      const G = newGame('bot', 'normal', sk);
      G.practice = true; G.aijirushi = 'maru';
      log(`${SCENARIOS[sk].name}・${keys[i]}を遊んでいます…`);
      const r = await playOne(game, i, G, aud);
      r.battle = `${r.battle}（${SCENARIOS[sk].name}）`;
      reports.push(r);
      log(`${r.battle}：${r.time}秒・戦功${r.merit}・任務${r.main === true ? '達成' : '失敗'}・不具合${r.errors.length}件`);
    }
  }
  // 日本地図から城を一つ攻める
  if (want('castle')) {
    log('日本地図から城を攻めています…');
    let r;
    try { r = await playMap(game, aud, +(Q.get('k') || 0)); } catch (e) { r = { battle: '日本地図の城攻め', note: '', errors: [String(e && e.stack || e).split('\n').slice(0, 3).join(' ')], stuck: [], waits: [], flow: [], named: [], time: 0, msPerFrame: 0, merit: 0, main: false, squad: '—', down: false, lines: '' }; }
    reports.push(r);
    log(`${r.battle}（${r.note}）：${r.time}秒・任務${r.main === true ? '達成' : '失敗'}・不具合${r.errors.length}件`);
  }
  // 稽古場も90秒だけ試す
  let dojoLine = '■ 稽古場：試さず', dojoData = null;
  if (want('dojo')) {
  log('稽古場を試しています…');
  game.startDojo();
  await new Promise((r) => setTimeout(r, 1500));
  const db = game.battle;
  aud.attach(db, '稽古場');
  game.paused = false; document.getElementById('pause').hidden = true;
  const dinp = fake();
  let dt = 0; const derr = [];
  const onE = (ev) => derr.push(ev.message);
  window.addEventListener('error', onE);
  try {
    while (game.battle === db && !db.over && dt < 90) {
      dinp.endFrame();
      brain(db, dinp);
      db.update(0.05, dinp); dt += 0.05;
      aud.tick(0.05);
      if (Math.round(dt * 20) % 200 === 0) await wait(0);
    }
  } catch (e) { derr.push(String(e)); }
  window.removeEventListener('error', onE);
  aud.scanDom('稽古場・終わり');
  dojoLine = `■ 稽古場：${Math.round(dt)}秒で第${db.flags.wave}陣、討ち取り ${db.flags.kills}人${db.over ? '（倒れた）' : ''}、不具合 ${derr.length ? derr.join('／') : 'なし'}`;
  dojoData = { time: Math.round(dt), wave: db.flags.wave, kills: db.flags.kills, down: !!db.over, errors: derr };
  game.stopBattle();
  }
  const text = ['戦国立身 テストプレイの報告', dojoLine, ...reports.flatMap((r) => [
    `■ ${r.battle}${r.note ? `（${r.note}）` : ''}：${r.time}秒、戦功 ${r.merit}、任務 ${r.main === true ? '達成' : '失敗'}${r.down ? '（重傷）' : ''}、組の生き残り ${r.squad}、1コマの計算 ${r.msPerFrame}ms`,
    `  内訳：${r.lines || 'なし'}`,
    ...(r.errors.length ? r.errors.map((e) => `  不具合：${e}`) : ['  不具合：なし']),
    ...r.stuck.map((e) => `  動けない：${e}`),
    ...r.waits.map((e) => `  待たされる：${e}`),
    ...(r.flow || []).map((e) => `  任務：${e}`),
    ...(r.named || []).map((e) => `  武将：${e}`),
    ...(r.hurt ? [`  受けた傷：${r.hurt}`] : []),
  ])].join('\n');
  window.__botReport = text;
  window.__botData = { audit: aud.items, size: `${innerWidth}×${innerHeight}`, dojo: dojoData, battles: reports };
  panel.innerHTML = `<b>テストプレイ bot の報告</b><pre>${text.replace(/</g, '&lt;')}</pre><button class="btn small" id="bot-copy">報告を写す</button>`;
  document.getElementById('bot-copy').onclick = () => navigator.clipboard?.writeText(text);
  console.log(text);
}

// ======================================================================
// 五人のテストプレイヤー（性格）
// 同じ bot の頭（brain）に、人ごとの癖を重ねて遊ぶ。画面は携帯の横向きで、操作は touch.js の丸の釦・左の棒・右のなぞりを通す
// （input に直に入れない。押そうとした所に別の物が重なっていれば、指はその上の物に当たる＝押せない所が見つかる）
// 見つけた事は「困った事」として、どこで・何が・どれくらい困ったか・画面の写真 を持つ。感想の文は人ごとの口ぐせで書く
// 困り具合：3＝やめたくなった・2＝かなり困った・1＝少し気になった
// ======================================================================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 角の差（-π〜π）。値が壊れていても止まらないように、回さずに割り算で
const adiff = (a, b) => { const d = b - a; if (!Number.isFinite(d)) return 0; return d - Math.PI * 2 * Math.round(d / (Math.PI * 2)); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 時代に合わない言葉（台詞・見出しに出たら歴史好きが怒る）
const MODERN = /(OK|ＯＫ|オッケー|ミッション|クリア|スタート|ボーナス|ダメージ|レベル|スキル|ゲージ|コンボ|HP|ステージ|リトライ|ポイント|チュートリアル|ボス|ヒット|チャンス|ピンチ|ラッキー|ナイス|バトル|ターゲット|エリア|ゴール)/;

export const PERSONAS = {
  chu: {
    key: 'chu', short: '中学生', name: 'はじめての中学生', who: 'ハルト（13歳・中学一年。ゲームは携帯で毎日）',
    style: '説明は読まない。ボタンは連打。すぐ迷い、すぐ倒れる',
    weights: { 落ちた: 2, 辻褄: 0.6, 使いづらい: 3, 数と文: 1 },
    cares: /tiny|small|offscreen|btnover|hudover|covered|contrast|noshadow|refuse|nag|long|choice|idleObj|blame/,
    ignore: /farBury|jump|out:|deadTarget|grpOver|outnumbered|routFight/,
    prefer: (L) => L.filter((x) => x.i === 0 || x.kind === 'dojo'),
    run: false,
  },
  reki: {
    key: 'reki', short: '歴史好き', name: '歴史好きの大人', who: 'ミチオ（62歳・町の郷土史の会。大河ドラマは欠かさず見る）',
    style: '一人称で戦場を見て回る。史実・装束・家紋・台詞の辻褄に厳しい',
    weights: { 落ちた: 1, 辻褄: 3, 使いづらい: 0.4, 数と文: 2 },
    cares: /stuck|passive|farBury|jump|named|friendly|routFight|outnumbered|msg:|txt:/,
    ignore: /tiny|small|contrast|noshadow|covered|hudover|btnover|dead:/,
    prefer: (L) => L.filter((x) => x.scn === 'nagashino' || x.scn === 'sekigahara' || x.scn === 'okehazama'),
    run: false,
  },
  act: {
    key: 'act', short: 'アクション好き', name: 'アクション好き', who: 'ソウタ（24歳・アクションゲームと格闘ゲームが好き）',
    style: '味方と並び、構えて受け流してから突く。囲まれたら下がり、後ろで傷を縛る',
    weights: { 落ちた: 2, 辻褄: 1.5, 使いづらい: 1, 数と文: 0.5 },
    cares: /passive|deadTarget|invuln|named|stuck|dmgNaN/,
    ignore: /tiny|contrast|noshadow|long|choice/,
    prefer: (L) => L.filter((x) => x.kind === 'dojo' || /shitaragahara|anegawa|sekigahara|okehazama|moribe|domyoji|castle/.test(x.id)),
    run: false,
  },
  sen: {
    key: 'sen', short: '戦略家', name: '指揮好きの戦略家', who: 'ケイコ（45歳・将棋と戦略ゲームが好き）',
    style: '号令・軍配（全軍の指揮）・陣形を使い倒す。信長でも出陣する',
    weights: { 落ちた: 2, 辻褄: 2, 使いづらい: 1.5, 数と文: 0.7 },
    cares: /stuck|outnumbered|routFight|idleObj|grpOver|btnover|hudover|covered/,
    ignore: /tiny|contrast|noshadow/,
    prefer: (L) => L.filter((x) => x.kind === 'lord' || x.rank >= 1),
    run: false,
  },
  sek: {
    key: 'sek', short: 'せっかち', name: 'せっかちな社会人', who: 'ユウキ（35歳・会社員。昼休みの20分で遊ぶ）',
    style: '台詞は飛ばす。待たされるのが大嫌い。短い時間で遊ぶ',
    weights: { 落ちた: 2, 辻褄: 1, 使いづらい: 1.5, 数と文: 0.5 },
    cares: /nag|long|bannerQ|idleObj|timeout|choiceLong/,
    ignore: /farBury|jump|out:|contrast|noshadow|tiny/,
    prefer: (L) => L,
    run: true,
    cap: 600,
  },
};
export const PERSONA_ORDER = ['chu', 'reki', 'act', 'sen', 'sek'];

// ---------------- 指で触る（touch.js を通す） ----------------
class TouchPad {
  constructor(game, ctx) {
    this.game = game; this.ctx = ctx; this.real = isTouch ? touchInput(game) : null; this.id = 100;
    this.move = null; this.look = null; this.held = new Map(); this.radial = null;
    this.cv = document.getElementById('view');
    this.moveZone = document.getElementById('tc-mzone');
    this.stickSpots = [[0.5, 0.4], [0.32, 0.2], [0.7, 0.3], [0.25, 0.7]];
    this.lookSpots = [[0.66, 0.36], [0.6, 0.22], [0.78, 0.28], [0.56, 0.5]];
    this.cache = new Map();   // 押す所ごとの「指の下に何があるか」（2秒は覚えておく。毎コマ測ると重い）
  }
  // 軽い見え方（hidden の札の中でないか）
  shown(el) { return !!el && !el.hidden && !el.closest('[hidden]'); }
  pe(type, el, x, y, id) {
    try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 18, height: 18, pressure: type === 'pointerup' ? 0 : 0.5 })); } catch (e) { /* 古い作り */ }
  }
  vis(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; }
    return true;
  }
  // 指の先に何があるか。押したい物の上に別の物があれば記す（指はその上の物に当たる）
  aim(el, label) {
    if (!this.shown(el)) return null;
    const now = this.ctx.b ? this.ctx.b.t : performance.now() / 1000;
    const c0 = this.cache.get(label);
    if (c0 && c0.el0 === el && now >= c0.t && now - c0.t < 2) return c0.a;
    if (!this.vis(el)) return null;
    let r = el.getBoundingClientRect();
    // 画面の外（下の方）にある釦は、人と同じく指で送って見える所に出してから押す
    //（送らずに押すと、端に寄せた所の別の札に当たっていた＝問屋の「買えない」の正体）
    if (r.bottom > innerHeight || r.top < 0) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); r = el.getBoundingClientRect(); }
    const x = clamp(r.left + r.width / 2, 1, innerWidth - 1), y = clamp(r.top + r.height / 2, 1, innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    const ok = !!top && (top === el || el.contains(top));
    if (!ok) this.ctx.blocked(label, el, top);
    this.ctx.tapSize(label, el, r);
    const a = { el: ok ? el : top, x, y, ok };
    this.cache.set(label, { el0: el, t: now, a });
    return a;
  }
  tap(el, label) {
    const a = this.aim(el, label);
    if (!a || !a.el) return false;
    const id = ++this.id;
    this.pe('pointerdown', a.el, a.x, a.y, id); this.pe('pointerup', a.el, a.x, a.y, id);
    if (a.el.click) a.el.click();
    this.ctx.taps++;
    return a.ok;
  }
  down(key, el, label) {
    if (this.held.has(key)) return true;
    const a = this.aim(el, label);
    if (!a || !a.el) return false;
    const id = ++this.id;
    this.pe('pointerdown', a.el, a.x, a.y, id);
    this.held.set(key, { el: a.el, x: a.x, y: a.y, id });
    this.ctx.taps++;
    return a.ok;
  }
  up(key) { const h = this.held.get(key); if (!h) return; this.pe('pointerup', h.el, h.x, h.y, h.id); this.held.delete(key); }
  // 左の親指の棒（ax, ay は -1〜1。上が前）
  stick(ax, ay, run) {
    if (Math.hypot(ax, ay) < 0.1) { if (this.move) { this.pe('pointerup', this.cv, this.move.x, this.move.y, this.move.id); this.move = null; } return true; }
    if (!this.move) {
      let got = null;
      // 操作側の入れ替え・安全な余白・丸の大きさを含む、実際の歩く範囲で探す。
      // 範囲の外では、戦場に届いても見回す指として受け取られる。
      const zone = this.moveZone?.getBoundingClientRect();
      if (!zone || zone.width < 1 || zone.height < 1) return false;
      for (let k = 0; k < this.stickSpots.length && !got; k++) {
        const spot = this.stickSpots[k];
        const x = zone.left + zone.width * spot[0], y = zone.top + zone.height * spot[1];
        const top = document.elementFromPoint(x, y);
        if (top === this.cv) got = { x, y }; else if (k === 0) this.ctx.blocked('親指の棒（歩く）', this.cv, top);
      }
      if (!got) { this.ctx.noStick(); return false; }
      this.move = { id: ++this.id, ox: got.x, oy: got.y, x: got.x, y: got.y };
      this.pe('pointerdown', this.cv, got.x, got.y, this.move.id);
    }
    // 端（50px）の外まで倒すと走る
    const R = run ? 78 : 44;
    this.move.x = this.move.ox + ax * R; this.move.y = this.move.oy + ay * R;
    this.pe('pointermove', this.cv, this.move.x, this.move.y, this.move.id);
    return true;
  }
  // 右側をなぞって向きを変える（d：回したい角度）
  turn(d) {
    // 指の感度は touch.js で掛かる。鍵盤・マウスの感度とは別。
    const f = clamp(-d / (0.0024 * (S.touchSens || 1) * 1.7), -170, 170);
    if (Math.abs(f) < 3) { if (this.look && ++this.look.idle > 8) { this.pe('pointerup', this.cv, this.look.x, this.look.y, this.look.id); this.look = null; } return; }
    if (!this.look || this.look.x + f < 24 || this.look.x + f > innerWidth - 24) {
      if (this.look) this.pe('pointerup', this.cv, this.look.x, this.look.y, this.look.id);
      this.look = null;
      // 任務の札は押して開く物。なぞる前に空いた戦場を探し、歩く棒の範囲も避ける。
      const zone = this.moveZone?.getBoundingClientRect();
      const swapped = zone && zone.left > innerWidth / 2;
      let blockedBy = null;
      for (const spot of this.lookSpots) {
        const x = innerWidth * (swapped ? 1 - spot[0] : spot[0]), y = innerHeight * spot[1];
        if (x + f < 24 || x + f > innerWidth - 24) continue;
        if (zone && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom) continue;
        const top = document.elementFromPoint(x, y);
        if (top !== this.cv) { if (!blockedBy) blockedBy = top; continue; }
        this.look = { id: ++this.id, x, y, idle: 0 };
        this.pe('pointerdown', this.cv, x, y, this.look.id);
        break;
      }
      // 別の空きからなぞれた時は失敗ではない。全候補が塞がった時は報告を残す。
      if (!this.look) { this.ctx.blocked('右側のなぞり（見回す）', this.cv, blockedBy); return; }
    }
    this.look.x += f; this.look.idle = 0;
    this.pe('pointermove', this.cv, this.look.x, this.look.y, this.look.id);
  }
  // 号令の輪：号令の丸を押したまま、選ぶ向きへ滑らせて放す
  order(id) {
    const i = RADIAL.findIndex((r) => r.id === id);
    const el = document.querySelector('#tc [data-b="cmd"]');
    if (i < 0 || !this.shown(el)) return false;
    if (!this.radial) this.radial = { id, i, n: 0, el };
    return true;
  }
  stepRadial() {
    const r = this.radial;
    if (!r) return;
    if (r.n === 0) {
      const a = this.aim(r.el, '号令');
      if (!a || !a.el) { this.radial = null; return; }
      r.a = a; r.pid = ++this.id;
      this.pe('pointerdown', a.el, a.x, a.y, r.pid);
      this.ctx.taps++;
    } else if (r.n <= 9) {
      const ang = r.i * Math.PI / 4, k = Math.min(1, (r.n - 1) / 3) * 60;
      this.pe('pointermove', r.a.el, r.a.x + Math.sin(ang) * k, r.a.y - Math.cos(ang) * k, r.pid);
    } else {
      const ang = r.i * Math.PI / 4;
      // 放した瞬間に号令が届くので、応答より先に今回の操作を記録する。
      this.ctx.radialDone(r.id);
      this.pe('pointerup', r.a.el, r.a.x + Math.sin(ang) * 60, r.a.y - Math.cos(ang) * 60, r.pid);
      this.radial = null;
    }
    r.n++;
  }
  // bot の頭が出した「したい事」を、指の操作に置き換える
  apply(inp, wantYaw, b) {
    const p = b.player, R = this.real, q = (s) => document.querySelector(s);
    const btn = (id) => q(`#tc [data-b="${id}"]`);
    // 狙い中のなぞりは向き直りではなく、的の切り替えになる。
    // 同じ相手を追う間はゲーム側の向き直りを待つ。前の指も放す。
    if (p.lock || this.radial) {
      if (this.look) {
        this.pe('pointerup', this.cv, this.look.x, this.look.y, this.look.id);
        this.look = null;
      }
    } else this.turn(adiff(p.yaw, wantYaw));
    const fw = inp.k.has('KeyW') ? 1 : 0, bk = inp.k.has('KeyS') ? 1 : 0;
    const side = (inp.k.has('KeyD') ? 1 : 0) - (inp.k.has('KeyA') ? 1 : 0);
    // 頭は向き直った後の前後左右を選ぶが、指のなぞりは少しずつ回る。
    // 今の視点で棒の向きを組み直し、列へ退く足が敵の方へ逸れないようにする。
    const da = adiff(p.yaw, wantYaw), forward = fw - bk;
    const cs = Math.cos(da), sn = Math.sin(da), length = Math.max(1, Math.hypot(side, forward));
    const stickX = (side * cs - forward * sn) / length;
    const stickY = -(forward * cs + side * sn) / length;
    // 指が届かなかった時に鍵盤で代わりに歩かせない。
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) R.keys.delete(k);
    // 山道の下知や構えて退く歩みを、性格の「走る」で上書きしない。
    this.stick(stickX, stickY, inp.runHeld || (this.ctx.per.run && !b.def.botOrders && !inp.guardHold && !b.botSurviving && !b.botRest));
    // 突く（溜めは押し続ける）
    if (inp.chargeHold) this.down('atk', btn('atk'), '突く（溜め）');
    // 「突いた回数」は指を置いた回数（毎コマ）でなく、実の一振りが出た数で数える（player.strike の呼び出しで数える。army_combat.js 下）
    else {
      this.up('atk');
      // 頭の中で向き直っていても、指と体はまだ回っていることがある。
      // 槍・刀は実際に向きが合ってから押す。構えと退く歩みは待たせない。
      const blade = p.weapon === 'spear' || p.weapon === 'sword';
      const facing = Math.abs(adiff(p.yaw, wantYaw)) < 0.3 && Math.abs(adiff(p.u.heading, wantYaw)) < 0.3;
      if (inp.leftPressed && (!blade || facing)) this.tap(btn('atk'), '突く');
    }
    if (inp.guardHold) this.down('grd', btn('grd'), '構え'); else this.up('grd');
    // 取る：押し続ける物（inp.k）は押したまま、一度だけの物（inp.e）は叩く
    const use = btn('use');
    if (inp.k.has('KeyE') && this.shown(use)) this.down('use', use, '取る');
    else {
      this.up('use');
      if (inp.e.has('KeyE')) { if (this.shown(use)) this.tap(use, '取る'); else if (this.shown(q('#prompt'))) this.tap(q('#prompt'), '取る（札）'); }
    }
    // 号令
    for (const [k, id] of [['KeyC', 'attack'], ['KeyZ', 'follow'], ['KeyX', 'hold'], ['KeyN', 'retreat']]) if (inp.e.has(k)) this.cmd(id, b);
    if (inp.quickCmd) this.cmd(inp.quickCmd, b);
    this.stepRadial();
    // 陣形・射撃：号令の丸を短く押して輪を開き（組頭から）、出てきた「陣形」「射撃」の丸を押す
    if (this.sub) {
      const sb = this.sub; sb.n++;
      if (sb.n === 1) this.tap(btn('cmd'), '号令（短く押す）');
      else if (this.shown(btn(sb.id))) { this.tap(btn(sb.id), sb.id === 'form' ? '陣形' : '射撃'); this.sub = null; }
      else if (sb.n > 6) { this.sub = null; this.ctx.noTouchCmd(sb.id); this.real.quickCmd = sb.id; const c = btn('cmd'); if (c && c.classList.contains('sel')) this.tap(c, '号令（閉じる）'); }
    }
    // そのほかの釦
    const MAP = { Space: () => btn('dodge'), KeyF: () => btn('rally'), KeyQ: () => btn('lock'), KeyR: () => btn('mount'), KeyV: () => q('#tc-view'), Enter: () => q('#hud #skiphint') };
    const NAME = { Space: '回避', KeyF: '鼓舞', KeyQ: '狙い', KeyR: '乗る', KeyV: '視点', Enter: '飛ばす' };
    // 「…」に畳まれた丸は、前のコマで「…」を開いてから押す（人もそうする）
    const keys = [...(this.pend || []), ...inp.e]; this.pend = null;
    for (const k of keys) {
      if (/^Key[EWSCZXN]$/.test(k)) continue;
      if (MAP[k]) {
        const el = MAP[k]();
        if (this.shown(el)) { this.tap(el, NAME[k]); continue; }
        if (k === 'Enter') continue;
        const more = btn('more');
        if (el && el.hidden && this.shown(more) && !more.classList.contains('sel')) { this.tap(more, '…（ほか）'); (this.pend = this.pend || []).push(k); continue; }
        // 丸が出ていないのが決まりどおりの時は数えない：指の丸が丸ごと出ていない（語り・幕間）、馬上の狙い・鼓舞（手綱と降りるを優先）
        const tc = q('#tc');
        if (!this.shown(tc) || !this.shown(btn('atk'))) continue;
        if (p.mounted && (k === 'KeyF' || k === 'KeyQ')) continue;
        // 敵が近くにいない時は、狙いの丸を隠すのが正しい。気まぐれな一押しを不具合に数えない。
        if (k === 'KeyQ' && !p.lock && !this.game.hud?.nearFoe) continue;
        this.ctx.noButton(NAME[k]); continue;
      }
      const dg = k.match(/^Digit(\d)$/);
      if (dg) {
        const opts = [...document.querySelectorAll('#choice .opt')];
        if (this.shown(q('#choice')) && opts[+dg[1] - 1]) { this.tap(opts[+dg[1] - 1], '選ぶ'); continue; }
        if ((k === 'Digit1' || k === 'Digit2') && this.shown(btn('wpn'))) { this.tap(btn('wpn'), '持替'); continue; }
      }
      // 指の端末に釦が無い操作（鍵盤でしか出せない）
      this.ctx.noTouch(k);
      R.edge.add(k); R.keys.add(k); this.ctx.releaseKeys.push(k);
    }
  }
  cmd(id, b) {
    if (!b.squad.some((s) => s.alive) || !b.player.selectedGroups().some((g) => g.count > 0)) return;
    if (this.order(id)) return;
    // 指の丸がまだ・もう出ていない時（開戦の札・戦の終わり・一時停止）は、人も押せないので問題に数えない
    const tc = document.getElementById('tc');
    if (b.over || b.ended || !tc || tc.hidden) { this.real.quickCmd = id; return; }
    // 陣形・射撃は号令の輪を開くと出る丸から（組頭から）
    if ((id === 'form' || id === 'fire') && b.G.rank >= 2) { if (!this.sub) this.sub = { id, n: 0 }; return; }
    // 号令の輪に無い号令（陣形・射撃など）は、指では出せない
    this.ctx.noTouchCmd(id);
    this.real.quickCmd = id;
  }
  releaseAll() {
    for (const k of [...this.held.keys()]) this.up(k);
    this.stick(0, 0); if (this.look) { this.pe('pointerup', this.cv, this.look.x, this.look.y, this.look.id); this.look = null; }
    if (this.radial && this.radial.a) this.pe('pointerup', this.radial.a.el, this.radial.a.x, this.radial.a.y, this.radial.pid);
    this.radial = null; this.sub = null;
  }
}

// ---------------- 見て回る目（人ごとの気にする所） ----------------
const pathOf = (el) => { const a = []; for (let e = el, i = 0; e && i < 3 && e !== document.body; i++, e = e.parentElement) a.unshift((e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '') || e.tagName.toLowerCase()); return a.join(' > '); };
const labelOf = (el) => (el ? (el.getAttribute && (el.getAttribute('aria-label') || '')) || (el.textContent || '').trim().slice(0, 14) || pathOf(el) : '（何も無い所）');

function makeCtx(per, aud) {
  const ctx = {
    per, aud, problems: [], byKey: new Map(), shotQ: [], taps: 0, attacks: 0, releaseKeys: [], where: '', battle: null, bid: '',
    add(key, title, what, sev, o = {}) {
      const k = key;
      let it = ctx.byKey.get(k);
      if (it) { it.count++; it.sev = Math.max(it.sev, sev); if (!it.battles.includes(ctx.bid) && ctx.bid) it.battles.push(ctx.bid); return it; }
      it = { key: k, cat: o.cat || '使いづらい', title, what, sev, count: 1, where: o.where || ctx.where, battles: ctx.bid ? [ctx.bid] : [], fix: o.fix || '', shot: null, from: per.key };
      ctx.byKey.set(k, it); ctx.problems.push(it);
      if (o.shot) ctx.shotQ.push(it);
      return it;
    },
    blocked(label, el, top) {
      if (openingWait(ctx.b?.player?.rt?.game) && !/出陣|見渡し/.test(label)) return;
      if (ctx.blockedSeen && ctx.blockedSeen.has(label)) return;
      (ctx.blockedSeen = ctx.blockedSeen || new Set()).add(label);
      const covered = top ? pathOf(top) : '画面の外';
      ctx.add(`tap-blocked:${label}|${top ? (top.id || top.className || top.tagName) : 'none'}`, `「${label}」を押そうとしたら、別の物に当たった`, `指の下にあったのは ${covered}「${labelOf(top)}」`, 2, { shot: true, fix: '重ねている札の置き場所をずらすか、pointer-events:none にする' });
    },
    tapSize(label, el, r) {
      if (r.width >= 44 && r.height >= 44) return;
      if (per.key !== 'chu' && per.key !== 'sen') return;
      ctx.add(`tap-small:${label}`, `「${label}」が指には小さい（44pt 未満）`, `${Math.round(r.width)}×${Math.round(r.height)}（${pathOf(el)}）`, per.key === 'chu' ? 2 : 1, { fix: '押せる所を 44pt 以上に（見た目は小さくても、押せる枠を広げる）' });
    },
    noStick() { if (openingWait(ctx.b?.player?.rt?.game)) return; ctx.add('stick-none', '親指で歩こうとしても、置く所がふさがっている', '歩く範囲の四か所とも、戦場の上に札がある', 3, { shot: true, fix: '歩く範囲から札を離す／読むだけの札に指を通す' }); },
    noButton(name) { if (openingWait(ctx.b?.player?.rt?.game)) return; ctx.add(`btn-none:${name}`, `「${name}」をしたいのに、押す丸が出ていない`, `欲しかった時：${ctx.where}`, 1, { fix: 'その時に使える釦は出す（touchFrame の出し入れ）' }); },
    noTouch(k) { const KN = { Digit3: '火縄銃に持ち替え（鍵盤の 3）', Digit4: '弓に持ち替え（鍵盤の 4）', KeyG: '号令先の切り替え（G）', KeyT: '肩の切り替え（T）' }; ctx.add(`touch-none:${k}`, `指の端末では「${KN[k] || k}」ができない（押す丸が無い）`, `bot の頭が ${k} を押したがった（${ctx.where}）`, 2, { fix: 'touch.js に釦を足すか、戦の方で要らなくする' }); },
    noTouchCmd(id) { ctx.add(`cmd-none:${id}`, `号令「${{ form: '陣形', fire: '射撃／停止', move: '前進', yari: '槍衾', charge: '突撃' }[id] || id}」が、指の号令の輪から出せない`, `号令の輪（RADIAL）に無い、または身分が足りず選べない（${ctx.where}）`, per.key === 'sen' ? 3 : 1, { fix: '号令の輪に足すか、短く押した時の指揮の札（数字の号令）を指で押せるようにする' }); },
    radialDone(id) { ctx.radialHandled = null; ctx.radialWant = { id, t: ctx.b ? ctx.b.t : 0 }; },
  };
  return ctx;
}

// 人ごとの遊び方の癖（brain の後に重ねる）
const HABIT = {
  chu(b, inp, c) {
    const p = b.player, u = p.u, t = b.t;
    // 迷う：時々、勝手な向きへ歩き出す（4〜10秒）
    if (!c.wander && Math.random() < 0.004 && t > 8) c.wander = { until: t + 4 + Math.random() * 6, yaw: Math.random() * Math.PI * 2, walk: Math.random() < 0.65 };
    if (c.wander && t > c.wander.until) c.wander = null;
    if (c.wander) { p.yaw = c.wander.yaw; inp.k.delete('KeyE'); if (c.wander.walk) inp.k.add('KeyW'); else inp.k.delete('KeyW'); }
    // 連打：敵がいなくても突く
    if (Math.random() < 0.3) inp.leftPressed = true;
    // 構えない
    if (Math.random() < 0.8) inp.guardHold = false;
    // 目についた丸を押してみる
    if (Math.random() < 0.01) inp.e.add(pick(['Space', 'KeyF', 'KeyQ']));
    // 台詞は飛ばす
    if (document.querySelector('#hud #skiphint:not([hidden])')) inp.e.add('Enter');
  },
  reki(b, inp, c) {
    const p = b.player, t = b.t;
    // 始めに一人称へ
    if (!c.fp && t > 1) { c.fp = true; inp.e.add('KeyV'); }
    // 45秒ごとに足を止めて、ぐるりと見回す
    if (!c.gaze && t > 20 && t - (c.gazeT || 0) > 45 && !b.army.nearestEnemy(p.u, 18)) { c.gaze = { until: t + 6, yaw0: p.yaw }; c.gazeT = t; c.gazeN = (c.gazeN || 0) + 1; }
    if (c.gaze) {
      if (t > c.gaze.until) c.gaze = null;
      else { inp.k.delete('KeyW'); inp.leftPressed = false; p.yaw = c.gaze.yaw0 + (1 - (c.gaze.until - t) / 6) * Math.PI * 2; if (!c.gaze.shot && c.gazeN <= 2) { c.gaze.shot = true; c.wantShot = `一人称で見回す（${Math.round(t)}秒）`; } }
    }
  },
  act(b, inp, c) {
    const p = b.player, u = p.u, t = b.t;
    // 持ち場を守る間も、見える空馬は記録する。寄り道できない事と馬が無い事を分ける。
    let seenHorse = null, horseDist = 30;
    if (b.army.looseHorses) for (const o of b.army.looseHorses) {
      if (!o.from || !o.h.parent || o.mode === 'fled') continue;
      const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
      if (d < horseDist && !b.army.wallBetween(u.pos, -1, o.h.position)) {
        horseDist = d; seenHorse = o; c.looseSeen = true;
      }
    }
    // 馬を見つけた記録は、持ち場や退避のために性格の動きを止める前に残す。
    if (b.def.botDefendsFort) { c.charge = 0; return; }
    // 桶狭間は戦の頭が実際の打ち手と反撃の待ちを決める。
    // 近い義元への再選択で、旗本へ突く準備や敵へ向いた構えを上書きしない。
    if (b.def.botOrders && b.flags.road) { c.charge = 0; return; }
    if (b.botSurviving || b.botSurviveUntil > t || b.botCovering || b.botFollowingTaba || b.def.botEvacuating?.(b) || (p.treatmentReady && inp.k.has('KeyE'))) { c.charge = 0; return; }
    if (b.botRest || b.flags.dpBack || b.flags.botBack || b.flags.retreating ||
        (b.flags.dp?.on && b.flags.dp.cur?.s.kind === 'move' && !b.flags.dp.cur.arr)) {
      c.charge = 0; inp.chargeHold = false; return;
    }
    // 設楽原の持ち場・射撃待ち・虎口の道筋は戦の頭に任せる。
    // 性格の突進で、奥の柵から敵の誘い込み場所へ引き戻さない。
    if (b.flags.fence) {
      c.charge = 0;
      // 持ち場のすぐそばで手綱が届く馬は、敵が迫っていない時に捕らえる。
      // 遠い馬を追うのは追い討ちで虎口を抜けた後。守りの下知と道筋を保つ。
      const post = b.flags.wave === 0 ? b.flags.prepPt : b.flags.commandPt;
      const atPost = !b.flags.pursuit && post && p.takeO &&
        Math.hypot(u.pos.x - post.x, u.pos.z - post.z) < 7 &&
        Math.hypot(p.takeO.h.position.x - post.x, p.takeO.h.position.z - post.z) < 7;
      const outside = b.flags.pursuit && b.flags.fenceRoute && u.pos.x >= b.flags.fenceRoute.frontX - 0.5;
      if (p.catching || (!p.mounted && p.mountT <= 0 && (atPost || outside) && !b.army.nearestEnemy(u, 6))) {
        if (p.catching || (p.takeO && t - (c.mountT || -9) > 4)) {
          if (!p.catching) { inp.e.add('KeyR'); c.mountT = t; c.mountTry = (c.mountTry || 0) + 1; }
          inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
          inp.leftPressed = false; inp.guardHold = false; inp.runHeld = false; inp.chargeHold = false;
        } else if (outside && seenHorse) {
          goTo(p, inp, seenHorse.h.position.x, seenHorse.h.position.z, 2.5);
          inp.k.add('KeyE'); inp.leftPressed = false; inp.guardHold = false; inp.runHeld = false; inp.chargeHold = false;
        }
      }
      return;
    }
    // 「待て」「持ち場を守れ」「柵の外へ出るな」等の下知（kind:'order' の任務）が生きている間は、
    // 遠い武将を求めて大軍へ突っ込まない（近くの敵だけを相手にし、組から離れすぎない）
    const ordered = b.objectives.some((o) => (o.kind === 'order' || /^(wait|hold|stay|post|guard|saku|fence)$/.test(o.id)) && o.state !== 'done' && o.state !== 'fail');
    // 馬に乗る（乗れるなら、空馬がそばにあれば）
    const ownHorse = p.canRide && p.loose && p.loose.mode !== 'fled';
    // 手綱を取る間は足を止める。走り抜けると距離が開き、乗る前に取り消される。
    if (p.catching) {
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
      inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false; c.charge = 0;
      return;
    }
    // 下知のある戦は、戦の頭が決めた反撃と矢玉の避け足を保つ。
    // 性格で構え直すと、突きを消し、鉄砲へ横に逃げる向きまで変えてしまう。
    if (b.def.botOrders) {
      // 持ち場のすぐそばの馬には、敵が迫っていない時だけ手を伸ばす。馬を追って持ち場は離れない。
      if (!p.mounted && p.mountT <= 0 && p.takeO && p.takeO === seenHorse &&
          !b.army.nearestEnemy(u, 6) && t - (c.mountT || -9) > 4) {
        inp.e.add('KeyR'); c.mountT = t; c.mountTry = (c.mountTry || 0) + 1;
        inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
        inp.guardHold = false; inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
      }
      c.charge = 0; return;
    }
    // 構えは正面だけに効く。近い別の敵ではなく、実際に打ち込む相手へ向く。
    // 毎コマのくじで構えを解くと、振りが当たる瞬間だけ無防備になってしまう。
    let attacker = null, attackDist = 10;
    for (const o of b.army.threats || []) {
      if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < attackDist) { attacker = o; attackDist = d; }
    }
    if (attacker) {
      if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
      p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.delete('KeyE');
      inp.guardHold = true; inp.runHeld = false;
      const reach = p.weapon === 'sword' ? 1.7 : 2.8;
      // 槍の届く所へ構えて詰める。騎馬の突進は追わずに受ける。
      if (!ordered && !b.def.botOrders && attackDist >= reach && !attacker.charging) goTo(p, inp, attacker.pos.x, attacker.pos.z, reach * 0.9);
      // 打ち込みが終わるまで受ける。別の敵への反撃で受けを解かない。
      inp.leftPressed = false;
      inp.chargeHold = false; c.charge = 0;
      return;
    }
    if (ordered) { c.charge = 0; inp.chargeHold = false; return; }
    if (!p.mounted && !p.catching && p.mountT <= 0 && (ownHorse || p.takeO) && t - (c.mountT || -9) > 4) {
      inp.e.add('KeyR'); c.mountT = t;
      // 口笛は馬を呼ぶ操作。近くで手綱を取る時だけ乗馬を試したと数える。
      if (p.takeO || Math.hypot(p.loose.x - u.pos.x, p.loose.z - u.pos.z) < 3.2) {
        c.mountTry = (c.mountTry || 0) + 1;
        // 手綱取りが始まるコマから止まる。後の敵追いで走り抜けない。
        inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
        inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false; c.charge = 0;
        return;
      }
    }
    // 主を失った空馬が30m内にいて、目の前に敵がいなければ、寄って手綱を取りに行く（人もそうする）
    const L = b.army.looseHorses;
    if (!p.mounted && u.alive && L && L.length) {
      let lo = null, ld = 30;
      for (const o of L) { if (!o.from || !o.h.parent || o.mode === 'fled') continue; const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z); if (d < ld) { ld = d; lo = o; } }
      if (lo) c.looseSeen = true;
      if (lo && !b.def.botOrders && !b.army.nearestEnemy(u, 6)) {
        goTo(p, inp, lo.h.position.x, lo.h.position.z, 2.5);
        inp.k.add('KeyE'); inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
        return;
      }
    }
    // 馬に乗れる機会は数える。柵・道・退避の下知は、遠い敵や馬への突進で上書きしない。
    if (b.def.botOrders) {
      const e = b.army.nearestEnemy(u, 3, (o) => !o.fleeing && !o.noTarget && !o.isStruct &&
        Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
      if (e) patientStrike(p, inp, e, dist(e.pos, u.pos));
      c.charge = 0; inp.chargeHold = false;
      return;
    }
    // その戦の頭が自分で退いている（深手の時に味方の組の後ろへ下がる等）間は、その退き方に任せる
    if (b.flags.dpBack || b.flags.botBack || b.botRest) return;
    // 味方の組の真ん中（組が少ない時は無し）。人のように、組の近くで戦い、危ない時は組の方へ退く
    let mateN = 0, cx = 0, cz = 0, lag = 0;
    for (const s of b.squad || []) if (s.alive && !s.fleeing) { mateN++; cx += s.pos.x; cz += s.pos.z; }
    // 足軽で自分の組を持たない時も、上役の列から離れない。
    if (mateN < 2 && b.hostGroup?.count) {
      mateN = 0; cx = 0; cz = 0;
      for (const s of b.hostGroup.units) if (s !== u && s.alive && !s.fleeing) { mateN++; cx += s.pos.x; cz += s.pos.z; }
    }
    if (mateN >= 2) { cx /= mateN; cz /= mateN; lag = Math.hypot(u.pos.x - cx, u.pos.z - cz); }
    // 周りの敵の数（8m 以内）
    let around = 0, sx = 0, sz = 0;
    b.army.forNear(u.pos.x, u.pos.z, 8, (o) => { if (o.team !== u.team && o.alive && !o.fleeing && o.type !== 'dummy' && !o.noTarget && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 8 && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) { around++; sx += o.pos.x; sz += o.pos.z; } });
    // 深手でも味方の列へ戻れたら打ち合う。失った体力の回復を条件にしない。
    const hpr = u.hp / u.maxHp;
    if (u.mobbed || around >= 4 || (hpr < 0.55 && lag > 6)) c.fall = true;
    if (!u.mobbed && around < 3 && (lag < 6 || around === 0)) c.fall = false;
    if (c.fall && around > 0) {
      const foe = b.army.nearestEnemy(u, 20);
      if (mateN >= 2 && lag > 4 && around <= 3) p.yaw = Math.atan2(cx - u.pos.x, cz - u.pos.z);
      else if (around >= 1) p.yaw = Math.atan2(u.pos.x - sx / around, u.pos.z - sz / around);
      else if (foe) p.yaw = Math.atan2(u.pos.x - foe.pos.x, u.pos.z - foe.pos.z);
      const backYaw = p.yaw;
      if (foe) p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      const diff = backYaw - p.yaw;
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.k.add(Math.cos(diff) >= 0 ? 'KeyW' : 'KeyS');
      // 右の歩みは（-cos, sin）。敵を向いたまま、退き口の側へ歩く。
      if (Math.abs(Math.sin(diff)) > 0.4) inp.k.add(Math.sin(diff) < 0 ? 'KeyD' : 'KeyA');
      inp.k.delete('KeyE'); inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = !!foe; inp.runHeld = false;
      c.fallN = (c.fallN || 0) + 1;
      return;
    }
    // 目の前の相手を先に払う。遠い武将や塀・別の階の相手へ突進して、近い兵を無視しない。
    const e = strikeTarget(b, ordered ? 12 : 30);
    const busho = e && (e.type === 'busho' || !!e.name) ? e : null;
    if (e) {
      const d = dist(e.pos, u.pos);
      // 組から離れすぎたら（8m）、敵へ行かず組の方へ戻る。組が前へ進めば、ついて行く
      if (mateN >= 2 && d > 3.5 && lag > 8) { goTo(p, inp, cx, cz, 4); inp.k.delete('KeyE'); inp.guardHold = true; return; }
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyE');
      const reach = p.weapon === 'sword' ? 1.9 : 2.8;
      if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85); else inp.k.delete('KeyW');
      if (e === busho) c.bushoMin = Math.min(c.bushoMin || 1e9, d);
      if (d < 14 && !p.lock && t - (c.lockT || -9) > 3) { inp.e.add('KeyQ'); c.lockT = t; }
      patientStrike(p, inp, e, d); c.charge = 0;
    } else if (!(b.flags.dp && b.flags.dp.on) && mateN >= 2 && lag > 10 && !inp.k.has('KeyW')) {
      // 段の任務や、先に決めた行き先を守る。
      // 敵が近くに居ない時は、組について歩く
      p.yaw = Math.atan2(cx - u.pos.x, cz - u.pos.z); inp.k.add('KeyW'); inp.k.delete('KeyE');
    }
  },
  sen(b, inp, c) {
    const p = b.player, u = p.u, t = b.t;
    if (!b.squad.length) return;
    if (t - (c.cmdT || -9) < 9 + Math.random() * 6) return;
    const e = b.army.nearestEnemy(u, 30);
    const g = b.squadGroups && b.squadGroups[0];
    let want = null;
    if (e) want = e.type === 'cavalry' && b.G.rank >= 2 ? 'yari' : (g && g.order === 'attack' ? 'focus' : 'attack');
    else if (u.hp < u.maxHp * 0.35) want = 'retreat';
    else want = g && g.order !== 'follow' ? 'follow' : (b.G.rank >= 2 && Math.random() < 0.3 ? 'form' : null);
    // 射撃（弓・鉄砲の組がいれば）も一度は試す
    if (!c.firedTry && b.G.rank >= 2 && e && b.squad.some((s) => s.type === 'bow' || s.type === 'gun')) { want = 'fire'; c.firedTry = true; }
    if (want) { inp.quickCmd = want; c.cmdT = t; }
    if (e && !(c.rallyT > t - 25) && Math.random() < 0.2) { inp.e.add('KeyF'); c.rallyT = t; }
  },
  sek(b, inp, c) {
    if (document.querySelector('#hud #skiphint:not([hidden])')) inp.e.add('Enter');
    inp.runHeld = true;
  },
};

// 鉄砲・弓を持っていれば、離れた敵に持ち替えて撃ってみる（中学生とせっかち以外。撃ち終えたら槍へ戻す）
function rangedHabit(b, inp, c) {
  const p = b.player, u = p.u, t = b.t;
  // 柵の内から突く戦では、持ち替えで守りの反撃を止めない。
  if (b.def.botDefendsFort) {
    if (p.weapon === 'gun' || p.weapon === 'bow') inp.e.add('Digit1');
    return;
  }
  // 退避・傷の処置・竹束の陰・持ち場を、射撃の癖で上書きしない。
  if (b.botSurviving || b.botSurviveUntil > t || b.botCovering || b.botFollowingTaba || b.botRest || b.flags.dpBack || b.flags.botBack ||
      (p.treatmentReady && inp.k.has('KeyE'))) {
    if (p.weapon === 'gun' || p.weapon === 'bow') inp.e.add('Digit1');
    return;
  }
  if (c.per.key === 'act' && (b.def.botOrders || b.objectives.some((o) => o.kind === 'order' && o.state !== 'done' && o.state !== 'fail'))) return;
  // 退却の下知中は、追手への射撃で歩みを止めない。槍に戻して退き口へ走る。
  if (b.flags.retreating && b.def.botOrders) {
    if (p.weapon === 'gun' || p.weapon === 'bow') inp.e.add('Digit1');
    return;
  }
  if (c.per.key === 'chu' || c.per.key === 'sek' || !(p.hasGun || p.hasBow) || p.mounted) return;
  const e = b.army.nearestEnemy(u, 60, (o) => !o.fleeing && o.type !== 'dummy');
  const d = e ? dist(e.pos, u.pos) : 99;
  const ranged = p.weapon === 'gun' || p.weapon === 'bow';
  if (!ranged && e && d > 14 && d < 55 && t - (c.rangeT || -99) > 40) { inp.e.add(p.hasGun ? 'Digit3' : 'Digit4'); c.rangeT = t; c.rangeTry = (c.rangeTry || 0) + 1; return; }
  if (ranged) {
    if (!e || d < 6 || t - c.rangeT > 20) { inp.e.add('Digit1'); return; }
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.k.delete('KeyW'); inp.leftPressed = false;
    inp.guardHold = true;
    if (Math.random() < 0.1) { inp.leftPressed = true; c.shotsFired = (c.shotsFired || 0) + 1; }
  }
}

// 変わり目の癖（1000人の表の habit・spd・view。性格の癖の後にさらに重ねる。変わり目が無ければ何もしない）
function variantHabit(b, inp, c) {
  if (!V.habit && !V.view && V.spd === 2) return;
  const p = b.player, u = p.u, t = b.t;
  // 歩き方の癖より、今まさに身を守っている操作を先にする。
  if (b.botCovering || b.botSurviving || b.botSurviveUntil > t || b.botFollowingTaba || b.def.botEvacuating?.(b)) return;
  const skip = document.querySelector('#hud #skiphint:not([hidden])');
  // 見え方：一人称の人は始めに視点を替える（歴史好きは自分で替える）
  if (V.view === 'fp' && !c.vfp && t > 1 && c.per.key !== 'reki') { c.vfp = true; inp.e.add('KeyV'); }
  // 下知のある戦の反撃と道筋を、構え直しや迷い歩きで上書きしない。
  if (b.def.botOrders) {
    if (V.habit === 'yomu') inp.e.delete('Enter');
    else if (V.spd === 3 && skip) inp.e.add('Enter');
    return;
  }
  if (V.habit === 'ren') {
    // 連打：敵がいてもいなくても突く。時々ほかの丸も押す
    if (Math.random() < 0.45) inp.leftPressed = true;
    if (Math.random() < 0.015) inp.e.add(pick(['Space', 'KeyF', 'KeyQ', 'KeyR']));
  } else if (V.habit === 'kamae') {
    // 構え多め：敵が近いと構えてばかり（突くのは時々）
    const e = b.army.nearestEnemy(u, 7);
    if (e) { inp.guardHold = Math.random() < 0.7; if (inp.guardHold && Math.random() < 0.6) inp.leftPressed = false; }
  } else if (V.habit === 'hashiri') {
    inp.runHeld = true;
  } else if (V.habit === 'mayoi') {
    // 迷子：時々、勝手な向きへ長く歩き出す
    if (!c.vwander && Math.random() < 0.006 && t > 8) c.vwander = { until: t + 6 + Math.random() * 10, yaw: Math.random() * Math.PI * 2 };
    if (c.vwander && t > c.vwander.until) c.vwander = null;
    if (c.vwander) { p.yaw = c.vwander.yaw; inp.k.delete('KeyE'); inp.k.add('KeyW'); inp.leftPressed = false; }
  }
  // 台詞を全部読む人は飛ばさない。速い人は（読む人でなければ）すぐ飛ばす
  if (V.habit === 'yomu') inp.e.delete('Enter');
  else if (V.spd === 3 && skip) inp.e.add('Enter');
}

// 人ごとの目（毎コマ。重い所は1秒ごと）
function watchStep(b, dt, c) {
  const per = c.per, p = b.player, u = p.u, t = b.t;
  c.acc = (c.acc || 0) + dt;
  const sec = c.acc >= 1; if (sec) c.acc = 0;
  // 号令の輪で選んだのに、号令が出ない
  if (c.radialWant && t - c.radialWant.t > 1) { if (!c.radialHandled || c.radialHandled.id !== c.radialWant.id || c.radialHandled.t < c.radialWant.t) c.add(`radial-fail:${c.radialWant.id}`, '号令の輪で選んだのに、号令が出なかった', `「${c.radialWant.id}」を選んで放した（${c.where}）`, 3, { shot: true, fix: 'touch.js の号令の丸の滑らせ方と player.js の radialSel を見直す' }); c.radialWant = null; }
  // 号令の効き目（出してから3秒で、組の何割が動き出したか）
  //   遠い組へは使番が走る（battle.js orderDelay）ので、号令が着いてから3秒で見る。
  //   動かなくてよい号令（待て・向き直れ・陣形・放て）と、もう持ち場にいる者は「動かない」に数えない
  if (c.cmdSeen && c.cmdSeen.due == null) c.cmdSeen.due = c.cmdSeen.t + 3 + Math.max(0, ...c.cmdSeen.groups.map((g) => (g.pending ? g.pending.t : 0)));
  // 三秒後には歩き終えている事もある。号令が届いてからの移動・打ち合いを覚える。
  if (c.cmdSeen && !c.cmdSeen.checked) for (const [s, response] of c.cmdSeen.response) {
    if (!s.alive || s.gone || s.fleeing || s.woundOut || s.rearWound || s.group.pending) continue;
    if (!response.started) { response.x = s.pos.x; response.z = s.pos.z; response.started = true; }
    if (Math.hypot(s.pos.x - response.x, s.pos.z - response.z) > 0.5 || Math.hypot(s.vel.x, s.vel.z) > 0.3 || s.target || s.atk) response.acted = true;
  }
  if (c.cmdSeen && !c.cmdSeen.checked && t > c.cmdSeen.due) {
    c.cmdSeen.checked = true;
    const remaining = b.squad.filter((s) => s.alive && !s.gone && c.cmdSeen.response.has(s));
    const live = remaining.filter((s) => !s.fleeing && !s.woundOut && !s.rearWound);
    const unavailable = remaining.length - live.length;
    // 逃亡・負傷は号令の遅れとは分けて報告する。戦列が崩れた事実を消さない。
    if (unavailable > 0 && unavailable >= remaining.length * 0.7 && !['hold', 'face', 'form', 'fire'].includes(c.cmdSeen.id)) c.add(`cmd-unfit:${c.cmdSeen.id}`, `号令「${c.cmdSeen.label}」を出したが、組の多くが戦列を離れている`, `${remaining.length}人のうち逃亡・負傷で動けない兵は${unavailable}人（${c.where}）`, 1, { cat: '辻褄', fix: '組が崩れた理由を確かめ、旗のそばで退避と立て直しを行う' });
    const atGoal = (s) => {
      const g = s.group;
      if (!g || !g.slotPos) return false;
      // 「かかれ」で敵がいない兵は組頭の後ろへ寄る。古い隊の持ち場では判定しない。
      if (c.cmdSeen.id === 'attack') return !!s.moveTo && Math.hypot(s.moveTo.x - s.pos.x, s.moveTo.z - s.pos.z) < 2.5;
      const sp = g.slotPos(s.slot, g.initial);
      return Math.hypot(sp.x - s.pos.x, sp.z - s.pos.z) < 2.5;
    };
    const moving = live.filter((s) => c.cmdSeen.response.get(s).acted || atGoal(s)).length;
    if (live.length >= 3 && !['hold', 'face', 'form', 'fire'].includes(c.cmdSeen.id) && moving < live.length * 0.3) c.add(`cmd-slow:${c.cmdSeen.id}`, `号令「${c.cmdSeen.label}」から3秒たっても、組の7割が動かない`, `${live.length}人のうち動いたのは${moving}人（${c.where}）`, per.key === 'sen' ? 2 : 1, { cat: '辻褄', shot: per.key === 'sen', fix: '号令を受けた兵がすぐ向きを変えて動き出すようにする（行き先・狙いの付け直し）' });
    if (!c.cmdSeen.fb && per.key === 'sen') c.add('cmd-nofb', '号令が届いたのか、画面で分からない', `号令のあと1秒、字幕も知らせも出なかった（${c.where}）`, 1, { fix: '号令を出したら、短い字幕か組の頭上の印で「届いた」を見せる' });
  }
  if (!sec) return;
  // ---- 中学生：次に何をすればいいか分からない時間 ----
  if (per.key === 'chu' && !c.wander) {
    const foe = b.army.nearestEnemy(u, 25);
    const objKey = b.objectives.map((o) => o.text + o.state + (o.progress || '')).join('|');
    if (objKey !== c.objKey) { c.objKey = objKey; c.objT = t; }
    const mk = b.markers.find((m) => !m.red) || b.markers[0];
    const md = mk ? (() => { const q = typeof mk.pos === 'function' ? mk.pos() : mk.pos; return q ? dist(q, u.pos) : null; })() : null;
    const lost = !foe && t - c.objT > 30 && (!mk || (md != null && md > 45));
    c.lostRun = lost ? (c.lostRun || 0) + 1 : 0;
    if (c.lostRun === 30) c.add(`lost:${c.bid}:${b.phase || ''}`, '次に何をすればいいか分からない時間が続いた', `${Math.round(t)}秒ごろ、段「${b.phase || '―'}」。任務「${(b.objectives.find((o) => !o.state) || {}).text || '―'}」のまま30秒、${mk ? `印は${Math.round(md)}m先` : '印も無い'}、近くに敵もいない`, 2, { cat: '使いづらい', shot: true, fix: '印を近くに出す・台詞で次の行き先を言う・進み具合を見せる' });
    c.lostSum = (c.lostSum || 0) + (lost ? 1 : 0);
  }
  // ---- 歴史好き：棒立ち・同じ装束・名ばかりの武将 ----
  if (per.key === 'reki') {
    if (!c.facDone) {
      c.facDone = true;
      // 稽古相手（藁人形・古参の八助のような、狙えない相手だけの隊）は敵の家に数えない
      const keiko = (g) => g.units.every((u) => u.type === 'dummy' || u.noTarget);
      const f0 = new Set(b.army.groups.filter((g) => g.team === 0 && g.count).map((g) => g.faction));
      const f1 = new Set(b.army.groups.filter((g) => g.team === 1 && g.count && !keiko(g)).map((g) => g.faction));
      for (const f of f1) if (f0.has(f) && f) c.add(`samefac:${c.bid}:${f}`, '敵と味方が同じ家の装束・旗で出てくる', `${c.battle}：両方に「${f}」の隊がいる`, 2, { cat: '辻褄', fix: '敵の隊の faction を、その戦の相手の家にする' });
      const dateS = b.def.date ? String(b.def.date(b)) : '';
      const bt = b.def.mapCastle ? null : BATTLES[b.index];
      const era = (s) => (String(s).match(/(永禄|元亀|天正|慶長|元和|文禄)[一二三四五六七八九十元]+年/) || [])[0];
      if (bt && dateS && era(dateS) && era(bt.year) && era(dateS) !== era(bt.year)) c.add(`date:${c.bid}`, '戦の中の日付と、戦の前の札の年が食い違う', `札「${bt.year}」／戦の中「${dateS}」`, 2, { cat: '辻褄', fix: 'def.date と SCENARIOS の year をそろえる' });
    }
    if (Math.round(t) % 5 === 0) {
      const near = b.army.units.filter((o) => o.alive && !o.isPlayer && o.type !== 'dummy' && o.type !== 'porter' && dist(o.pos, u.pos) < 35);
      const hot = near.filter((o) => b.army.nearestEnemy(o, 30));
      const idle = hot.filter((o) => Math.hypot(o.vel.x, o.vel.z) < 0.1 && !o.target && !o.atk && !o.fleeing && !(o.group && /hold|guard|yari/.test(o.group.order)));
      if (hot.length >= 6 && idle.length >= hot.length * 0.4) c.add(`bou:${c.bid}:${b.phase || ''}`, '敵が近いのに、まわりの兵の多くが棒立ち', `${Math.round(t)}秒：まわり35mの${hot.length}人のうち${idle.length}人が止まったまま（段 ${b.phase || '―'}）`, 2, { cat: '辻褄', shot: true, fix: '敵が30m内に入ったら、構える・にじり寄る・槍を揃えるなど体を動かす' });
      for (const o of near) {
        if (o.type !== 'busho' || !o.name) continue;
        const base = o.name.replace(/^.* /, '');
        if (!GENERALS[base] && !/組頭|足軽大将|物頭|侍大将/.test(o.name)) c.add(`noface:${base}`, '名のある武将なのに、顔も装束も並の侍と同じ', `${o.name}（${o.team === p.u.team ? '味方' : '敵'}）`, 1, { cat: '辻褄', fix: 'units.js の GENERALS に顔・甲冑・兜を足す' });
      }
    }
    // 画面の字（10秒ごと）
    if (Math.round(t) % 10 === 0) {
      const tx = (document.getElementById('hud') || {}).innerText || '';
      const m = tx.match(MODERN);
      if (m) c.add(`ui-modern:${m[1]}`, `画面の言葉に、時代に合わない外来語「${m[1]}」`, `HUD に「${m[1]}」`, 1, { cat: '数と文', fix: '和語・漢語に置き換える（例：ダメージ→傷、ボス→大将）' });
    }
  }
  // ---- アクション好き：手応え ----
  if (per.key === 'act' && p.mounted && !c.rode) { c.rode = true; c.rodeT = t; }
  // ---- せっかち：待たされる ----
  if (per.key === 'sek') {
    const objKey = b.objectives.map((o) => o.text + o.state + (o.progress || '')).join('|');
    if (objKey !== c.sObj) { c.sObj = objKey; c.sObjT = t; }
    const foe = b.army.nearestEnemy(u, 30);
    if (!foe && t - c.sObjT > 60 && !c.sWaitSaid) { c.sWaitSaid = true; c.add(`wait:${c.bid}:${b.phase || ''}`, '何もする事が無いまま待たされた', `${Math.round(t - c.sObjT)}秒、任務札が変わらず敵もいない（段 ${b.phase || '―'}）`, 2, { cat: '使いづらい', shot: true, fix: '飛ばせる（canSkip）ようにするか、待つ間にする事を置く' }); }
    if (c.sObjT === t) c.sWaitSaid = false;
    // 飛ばせない台詞が続く
    const sk = document.querySelector('#hud #skiphint');
    const talking = c.lastSayT != null && t - c.lastSayT < 3;
    c.noSkip = talking && (!sk || sk.hidden) ? (c.noSkip || 0) + 1 : 0;
    if (c.noSkip === 25) c.add(`noskip:${c.bid}:${b.phase || ''}`, '飛ばせない台詞が長く続いた', `25秒、台詞が続いて「飛ばす」が出ない（段 ${b.phase || '―'}）`, 2, { cat: '使いづらい', fix: 'この段も canSkip で飛ばせるようにする' });
    if (!c.firstFoe && b.army.nearestEnemy(u, 40)) c.firstFoe = t;
  }
}

// 監査の目（四つの目）の記録を、その人の重みで「困った事」に換える
function fromAudit(aud, c) {
  const per = c.per;
  const res = [];
  // 同じ見出しの物（「HUD の札どうしが重なる」の組み合わせ違いなど）は一つに束ねる
  const G = new Map();
  for (const it of aud.items) {
    if (per.ignore && per.ignore.test(it.key)) continue;
    const k = it.cat + '|' + it.title;
    const g = G.get(k) || { cat: it.cat, title: it.title, fix: it.fix, count: 0, care: false, samples: [] };
    g.count += it.count;
    if (per.cares && per.cares.test(it.key)) g.care = true;
    for (const sm of it.samples) if (g.samples.length < 3 && !g.samples.some((x) => x.what === sm.what)) g.samples.push(sm);
    G.set(k, g);
  }
  const out = [];
  for (const g of G.values()) {
    const w = (per.weights[g.cat] || 1) * (g.care ? 1.6 : 1);
    const score = w * (1 + Math.log2(g.count));
    if (score >= 2.2) out.push({ g, score });
  }
  out.sort((a, b) => b.score - a.score);
  for (const { g, score } of out.slice(0, 10)) {
    const s0 = g.samples[0] || {};
    const pr = { key: 'aud:' + g.cat + '|' + g.title, cat: g.cat, title: g.title, what: g.samples.slice(0, 2).map((x) => `${x.who ? x.who + '：' : ''}${x.what || ''}`).join('／'), sev: score >= 12 ? 3 : score >= 6 ? 2 : 1, count: g.count, where: s0.where || '', battles: [], fix: g.fix, shot: null, from: per.key };
    for (const x of g.samples) { const bid = (x.where || '').split('・')[0]; if (bid && !pr.battles.includes(bid)) pr.battles.push(bid); }
    res.push(pr);
  }
  return res;
}

// 遊べる戦の一覧（筋書きごと。信長で出陣・日本地図の城攻め・稽古場も）
function listPlayable() {
  const L = [];
  // 織田家編（筋書きの鍵 oda）ができていれば、それを主に遊ぶ
  if (SCENARIOS.oda) {
    setScenario('oda');
    BATTLES.forEach((bt, i) => {
      L.push({ kind: 'camp', scn: 'oda', i, id: bt.id, name: bt.name, rank: 0 });
      // 織田家編の戦を信長で遊ぶ（本能寺など）。&only=honnoji&mode=lord で信長の方だけを選べる
      if (lordList().some((l) => l.id === bt.id && l.scn === 'oda')) L.push({ kind: 'lord', scn: 'oda', i, id: bt.id, name: `${bt.name}（信長で出陣）`, rank: 4 });
    });
  }
  for (const sk of SCENARIO_ORDER) {
    if (!SCENARIOS[sk]) continue;
    setScenario(sk);
    BATTLES.forEach((bt, i) => {
      const rank = sk === 'nagashino' ? Math.max(0, Math.min(3, i - 1)) : sk === 'okehazama' ? i : Math.min(2, i);
      L.push({ kind: 'battle', scn: sk, i, id: bt.id, name: bt.name, rank });
      if (lordList().some((l) => l.id === bt.id && l.scn === sk)) L.push({ kind: 'lord', scn: sk, i, id: bt.id, name: `${bt.name}（信長で出陣）`, rank: 4 });
    });
  }
  L.push({ kind: 'castle', id: 'castle', name: '日本地図の城攻め', rank: 3 });
  L.push({ kind: 'dojo', id: 'dojo', name: '稽古場', rank: 0 });
  return L;
}

// 一回の持ち時間（実時間の秒。?budget=。botrun が上限の20分から余裕を引いて渡す）。過ぎたら今の戦を切り上げる
const BUDGET_END = { t: Infinity };

// 写真：描画を一時だけ戻し、外（botrun）に撮ってもらう
let shotN = 0;
async function shot(game, label) {
  if (Q.get('shots') !== '1' || shotN >= +(Q.get('maxshots') || 7)) return null;
  const id = ++shotN;
  const r = game.renderer;
  // 一枚だけ描いて、すぐ描くのをやめる（混んだ機械では一枚描くのに何十秒もかかるので、描き続けない）
  let drawn = false;
  if (r && r.__r0) r.render = (...x) => { r.render = () => {}; r.__r0(...x); drawn = true; };
  for (let k = 0; k < 150 && !drawn; k++) await wait(100);
  if (!drawn) { if (r) r.render = () => {}; return null; }
  await wait(200);
  window.__shotWant = { id, label };
  for (let k = 0; k < 200 && !(window.__shotDone && id in window.__shotDone); k++) await wait(100);
  window.__shotWant = null;
  return (window.__shotDone && window.__shotDone[id]) || null;
}

// ---------------- 感想の文（人ごとの口ぐせ） ----------------
function voiceOf(per, reports, probs, c) {
  const seen = new Set();
  // その人ならではの気づき（四つの目の共通の物でない物）を先に話す
  const sc = (x) => x.sev * 2 + Math.log2(x.count + 1) + (String(x.key).startsWith('aud:') ? 0 : 4);
  const top = [...probs].sort((a, b) => sc(b) - sc(a)).filter((x) => { const k = x.title.replace(/（[^）]*）$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
  const T = (it) => it.title.replace(/（[^）]*）$/, '');
  const won = reports.filter((r) => r.main === true).length, downs = reports.filter((r) => r.down).length;
  const kills = reports.reduce((a, r) => a + (r.kills || 0), 0), mins = Math.max(1, Math.round(reports.reduce((a, r) => a + (r.time || 0), 0) / 60));
  const names = reports.map((r) => r.battle.replace(/の戦い|の決戦/, '')).join('と');
  const L = [];
  if (per.key === 'chu') {
    L.push(pick(['とりあえずやってみた。', '友だちにすすめられて、やってみた。', 'えっと、遊んでみた。']));
    L.push(`${names}をやった。${won ? `${won}回はなんかクリアできた` : 'よく分かんないまま終わった'}${downs ? `。${downs}回すぐ死んだ…` : ''}。`);
    for (const it of top) L.push(`「${T(it)}」のとこ、${pick(['マジで意味わかんない', 'だるい', 'ムリ', 'ふつうに困った'])}。`);
    L.push(top.some((x) => x.sev >= 3) ? 'ぶっちゃけ、ここで一回やめかけた。' : '槍でつくのはちょっと楽しい。');
    if (probs.some((x) => /tap-small|font|tiny|small/.test(x.key))) L.push('あと字とボタン、もっと大きくして。指でおしにくい。');
  } else if (per.key === 'reki') {
    L.push(`${names}を、一人称で歩いて見て回りました。`);
    L.push(won ? '務めは果たせましたが、気になる所がいくつか。' : '務めは果たせませんでしたが、それより気になる所があります。');
    for (const it of top) L.push(`${T(it)}。${pick(['史実を知る者としては、ここは看過できません。', 'これでは興が醒めます。', '当時の人が見たら首を傾げるでしょう。', '細かい事ですが、こういう所で嘘っぽくなる。'])}`);
    if (!probs.some((x) => x.cat === '辻褄')) L.push('旗と甲冑の色の揃い方は、なかなか雰囲気が出ています。');
  } else if (per.key === 'act') {
    L.push(`とにかく突っ込んだ。${mins}分で${kills}人斬った。`);
    const at = reports.reduce((a, r) => a + (r.attacks || 0), 0), ht = reports.reduce((a, r) => a + (r.hits || 0), 0);
    if (at) L.push(`${at}回突いて${ht}回当たり。${ht / at < 0.25 ? '当たらなさすぎ。' : ht / at > 0.6 ? '当たりはいい感じ。' : 'まあまあ。'}`);
    for (const it of top) L.push(`${T(it)}、${pick(['手応えがスカスカ', 'ここは爽快感が死んでる', 'ストレスたまる', 'もったいない'])}。`);
    L.push(downs ? `${downs}回やられた。難しいのはいいけど、何でやられたか分かるようにしてほしい。` : kills > 20 ? 'ちょっと簡単すぎるかも。もっと強い奴と斬り合いたい。' : 'もっと派手に、じゃなくて重く斬り合いたい。');
  } else if (per.key === 'sen') {
    L.push(`${names}で、号令を${reports.reduce((a, r) => a + (r.cmds || 0), 0)}回かけました。${reports.some((r) => r.kind === 'lord') ? '信長でも出陣して、軍配も触りました。' : ''}`);
    for (const it of top) L.push(`${T(it)}。${pick(['采配の上で、これは痛い。', '指揮官としてはもどかしい。', '命令が信用できないと、策が立てられません。', 'ここが直れば、ぐっと指揮が楽しくなる。'])}`);
    L.push(won ? '勝てはしましたが、自分の采配で勝った手応えはまだ薄いです。' : '采配で負けたのか、操作で負けたのか分からないのが一番困ります。');
  } else {
    L.push(`昼休みに${mins}分ほど。${names}。`);
    for (const it of top) L.push(`${T(it)}。${pick(['時間がもったいない。', '待ってられない。', 'ここで閉じる人は多いと思う。', '正直、飛ばしたい。'])}`);
    const lm = Math.max(...reports.map((r) => r.loadMs || 0));
    if (lm > 8000) L.push(`読み込みも${Math.round(lm / 1000)}秒待たされた。`);
    L.push(won ? '勝ち負けはすぐ分かって、そこは良かった。' : '結局、何分遊べば一区切りなのかが分からない。');
  }
  if (c.bought && c.bought.length) L.push({ chu: `問屋で「${c.bought[0]}」買ってみた。`, reki: `問屋では${c.bought[0]}を求めました。`, act: `問屋で${c.bought[0]}を買った。強くなった感じがほしい。`, sen: `問屋で${c.bought[0]}を揃えました。`, sek: `問屋はさっと${c.bought[0]}だけ。` }[per.key]);
  return L.join('');
}

// 戦略家が軍配の図を開いて、隊を選び、下知を出して閉じる（全部、指で）
async function gunbaiTry(game, b, pad, c, aud, name, rep) {
  const mp = document.getElementById('tc-map');
  if (!pad.shown(mp)) { c.add('gunbai-nobtn', '信長で出陣しているのに、軍配の図を開く「地図」の釦が無い', c.where, 3, { cat: '使いづらい' }); return; }
  pad.cache.delete('地図（軍配）');
  pad.tap(mp, '地図（軍配）');
  await wait(500);
  const gb = document.getElementById('gunbai');
  if (!gb || gb.hidden) { c.add('gunbai-none', '「地図」を押しても軍配の図が開かない', c.where, 3, { cat: '使いづらい', shot: true }); return; }
  aud.scanDom(`${name}・軍配の図`);
  if (!c.gbShot) { c.gbShot = true; const f = await shot(game, `${name}・軍配の図`); if (f) rep.shots.push({ label: '軍配の図', file: f }); }
  const tx = gb.innerText || '';
  const kb = tx.match(/(右クリック|Esc|Shift|Ctrl)/);
  if (kb) c.add(`gunbai-kbd:${kb[1]}`, '軍配の図に、指の端末では使えない操作の案内がある', `「${tx.slice(Math.max(0, tx.indexOf(kb[1]) - 14), tx.indexOf(kb[1]) + 10).replace(/\s+/g, ' ')}」`, 1, { fix: 'isTouch の時は「長押し」「もう一度押す」などの言い方に' });
  const all = gb.querySelector('#gb-all');
  if (all) { pad.cache.delete('軍配：全部選ぶ'); pad.tap(all, '軍配：全部選ぶ'); await wait(250); }
  const ords = [...gb.querySelectorAll('#gb-ord [data-ord]')].filter((x) => !x.disabled);
  if (!ords.length) c.add('gunbai-noord', '軍配の図で隊を全部選んでも、下知の釦が押せない', `${gb.querySelectorAll('#gb-list li').length}の隊が並んでいる（${c.where}）`, 2, { cat: '使いづらい', shot: true });
  else {
    const before = b.army.groups.filter((g) => g.team === 0).map((g) => g.order + (g.lordPend ? '*' : '')).join(',');
    const pref = ords.filter((x) => /hold|retreat|yari|fire|move/.test(x.dataset.ord));
    const o = pick(pref.length ? pref : ords);
    pad.cache.delete('軍配：下知'); pad.tap(o, '軍配：下知');
    await wait(250);
    if (o.dataset.ord === 'move') {
      // 行き先：地図の真ん中より少し上（前）を押す
      const cv = document.getElementById('gb-cv'), r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.5, y = r.top + r.height * 0.32, top = document.elementFromPoint(x, y);
      pad.pe('pointerdown', top || cv, x, y, 9001); pad.pe('pointerup', top || cv, x, y, 9001); (top || cv).click && (top || cv).click();
      await wait(250);
      if (gb.querySelector('#gb-ord [data-ord="move"].on')) c.add('gunbai-pick', '軍配の図で「進め」の行き先を押しても、決まらない', c.where, 2, { cat: '使いづらい', shot: true });
    }
    c.gbCheck = { t: b.t, before, ord: o.textContent.replace(/^\d/, '').trim() };
    c.cmdN = (c.cmdN || 0) + 1;
  }
  const cl = gb.querySelector('#gb-close');
  pad.cache.delete('軍配：閉じる'); pad.tap(cl, '軍配：閉じる');
  await wait(300);
  if (!gb.hidden) { c.add('gunbai-noclose', '軍配の図の「閉じる」を押しても閉じない', c.where, 2); if (cl) cl.click(); }
  // 使番（遠くの備への下知）
  const lb = document.getElementById('lord-btn');
  if (lb && pad.shown(lb) && Math.random() < 0.6) {
    pad.cache.delete('使番'); pad.tap(lb, '使番'); await wait(400);
    const lp = document.getElementById('lord-panel');
    if (!lp || lp.hidden) c.add('tsukai-none', '「使番」を押しても札が開かない', c.where, 2);
    else {
      aud.scanDom(`${name}・使番`);
      const ob = [...lp.querySelectorAll('[data-ord]')].filter((x) => !x.disabled);
      if (ob.length) { pad.cache.delete('使番：下知'); pad.tap(pick(ob), '使番：下知'); c.cmdN = (c.cmdN || 0) + 1; await wait(250); }
      else c.add('tsukai-noord', '使番の札で、送れる下知が無い', `${lp.querySelectorAll('li').length}の備`, 1);
      if (!lp.hidden) { pad.cache.delete('使番'); pad.tap(lb, '使番'); await wait(200); }
    }
  }
  game.paused = false;
}

// 織田家編：戦のあとの画面を指で進めて城下へ行き、問屋で買い（馬・鉄砲・供）、出陣を押して次の戦の前の札まで
const BUY_WANT = { chu: /./, reki: /鉄砲|具足|弓/, act: /馬|刀|槍/, sen: /供|中間|若党|鉄砲|足軽/, sek: /馬/ };
// 変わり目の「問屋で何を買うか」（nashi は買わない＝見るだけ）
const BUY_V = { uma: /馬/, teppo: /鉄砲/, tomo: /供|中間|若党|足軽/, buki: /刀|槍|具足/, nashi: null };
async function campaignTown(game, c, aud, spec) {
  const pad = new TouchPad(game, c);
  const vis = (el) => pad.vis(el);
  const G = () => game.G;
  c.where = `${spec.name}の前・城下`; c.bid = '城下';
  // 1. 戦のあとの画面：次へ進む釦を押し続けて、城下（施設の札）が出るまで
  // 戦の終わりの引いていく場面は、混んだ機械では長くかかる。画面（#screen）が出るまでは数えずに待つ（2分まで）
  const tEnd = performance.now() + 120000;
  for (let k = 0; k < 30; k++) {
    if (document.querySelector('#screen [data-tab]')) break;
    const scr = document.getElementById('screen');
    if ((!scr || scr.hidden || !scr.innerText.trim()) && performance.now() < tEnd) { k--; await wait(1000); continue; }
    const bs = [...document.querySelectorAll('#screen button, #screen .btn')].filter(vis);
    const b = bs.find((x) => /城下|次へ|進む|続け|わかった|持ち帰|受け取|閉じ|はい/.test(x.textContent) && !/タイトル|やり直|易しく/.test(x.textContent)) || bs.find((x) => x.classList.contains('primary') && !/タイトル|やり直/.test(x.textContent));
    if (b) { pad.cache.clear(); pad.tap(b, `戦のあと：${b.textContent.trim().slice(0, 8)}`); }
    else { const sc = document.getElementById('screen'); if (sc) { pad.pe('pointerdown', sc, innerWidth / 2, innerHeight / 2, 7000 + k); pad.pe('pointerup', sc, innerWidth / 2, innerHeight / 2, 7000 + k); sc.click(); } }
    await wait(1200);
  }
  if (!document.querySelector('#screen [data-tab]')) {
    c.add('camp-notown', '戦のあと、城下へ進めなかった', `戦のあとの画面で釦を押し続けても、城下の札が出ない（${(document.getElementById('screen') || {}).innerText?.slice(0, 40) || '画面なし'}）`, 3, { cat: '使いづらい', shot: true, fix: '戦のあとの画面に、はっきりした「次へ（城下へ）」を置く' });
    await shot(game, '城下へ進めない');
    return false;
  }
  document.querySelector('.tour')?.remove();
  aud.scanDom(`${spec.name}の前・城下`);
  const f0 = await shot(game, `${spec.name}の前・城下`);
  c.townShot = f0 || c.townShot;
  // 2. 問屋
  const tabs = [...document.querySelectorAll('#screen [data-tab]')];
  const ton = tabs.find((x) => /問屋/.test(x.textContent));
  if (!ton) c.add('camp-notonya', '城下に「問屋」が見つからない', `施設：${tabs.map((x) => x.textContent.replace(/^\d+．/, '').trim().slice(0, 6)).join('・')}`, 1, { fix: '問屋（馬・鉄砲・供を買う）の札を城下に置く' });
  else if (c.per.key !== 'sek' || Math.random() < 0.4) {
    pad.cache.clear(); pad.tap(ton, '問屋'); await wait(700);
    aud.scanDom(`${spec.name}の前・問屋`);
    const kan0 = G().kan || 0;
    const ttx = (document.getElementById('screen') || {}).innerText || '';
    const kb = ttx.match(/(数字キー|[A-Z] キー|Tab|Enter|クリック)/);
    if (kb) c.add(`kbd-hint:問屋:${kb[1]}`, '指の端末なのに、問屋の説明が鍵盤の言い方', `「${ttx.slice(Math.max(0, ttx.indexOf(kb[1]) - 10), ttx.indexOf(kb[1]) + 12).replace(/\s+/g, ' ')}」`, 1, { fix: 'isTouch の時は「持替の丸で」などの言い方に' });
    const items = () => [...document.querySelectorAll('#screen [data-ty-hire], #screen [data-ty-buy], #screen [data-ty-horse]')].filter((x) => vis(x) && !x.disabled);
    const nameOf = (x) => ((x.closest('.item') || x).querySelector('.n') || x).textContent.replace(/\s+/g, ' ').trim().slice(0, 12);
    const all = items();
    const bw = V.buy ? BUY_V[V.buy] : BUY_WANT[c.per.key];
    const want = bw ? all.filter((x) => bw.test(nameOf(x))) : [];
    const tries = bw ? (want.length ? want : all).slice(0, c.per.key === 'sek' ? 1 : 2).map(nameOf) : [];
    c.shop = (c.shop || 0) + tries.length;
    for (const nm of tries) {
      // 買うと札が描き直されるので、名前で探し直す
      const x = items().find((y) => nameOf(y) === nm);
      if (!x) continue;
      const k0 = G().kan || 0;
      pad.cache.clear(); pad.tap(x, `問屋：${nm}`); await wait(600);
      // 所持金の半分を超える買い物は、確かめの札（「買う」）が出る。人と同じく、それを押して買う
      const yes = document.querySelector('#ty-cf [data-cf=yes]');
      if (yes && (G().kan || 0) >= k0) { pad.cache.clear(); pad.tap(yes, `問屋：${nm}（確かめ）`); await wait(600); }
      if ((G().kan || 0) < k0) (c.bought = c.bought || []).push(nm);
      else c.add('camp-buyfail', '問屋で「買う」を押しても、銭が減らない（買えていない？）', `押した物：${nm}（銭 ${k0}貫のまま）`, 2, { cat: '辻褄', shot: true, fix: '買えない時は釦を押せない見た目にし、理由を書く' });
    }
    if (!all.length) c.add('camp-nobuy', '問屋に入っても、買える物が一つも無い（銭が足りない？）', `銭 ${kan0}貫`, 1, { fix: '買えない理由（あと何貫）を品ごとに書く' });
    const f1 = await shot(game, `${spec.name}の前・問屋`);
    if (f1) c.tonyaShot = f1;
  }
  // 3. 出陣（上官屋敷の「任務を受けて出陣」→ 確かめの「出陣」）
  for (let k = 0; k < 5 && !document.getElementById('b-next') && !game.battle; k++) {
    let go = document.querySelector('#screen #go2') || document.querySelector('#screen #go');
    if (!go || !vis(go)) { const tt = [...document.querySelectorAll('#screen [data-tab]')].find((x) => /上官|屋敷/.test(x.textContent)); if (tt) { pad.cache.clear(); pad.tap(tt, '上官屋敷'); await wait(600); } go = document.querySelector('#screen #go2') || document.querySelector('#screen #go'); }
    if (!go) break;
    pad.cache.clear(); pad.tap(go, go.id === 'go2' ? '出陣（確かめ）' : '任務を受けて出陣'); await wait(1000);
  }
  if (!document.getElementById('b-next') && !game.battle) {
    c.add('camp-nogo', '城下から出陣できなかった', '「出陣」の釦が見つからない・押しても戦の前の札が出ない', 3, { cat: '使いづらい', shot: true });
    return false;
  }
  if (game.G.battle !== spec.i) spec.i = game.G.battle;
  return true;
}

async function playPersona(game, spec, aud, c) {
  const per = c.per, name = spec.name;
  c.battle = name; c.bid = name; c.where = name;
  const rep = c.curRep = { battle: name, key: spec.id, kind: spec.kind, scn: spec.scn || '', errors: [], stuck: [], waits: [], flow: [], named: [], time: 0, merit: 0, main: false, squad: '—', down: false, lines: '', loadMs: 0, storyLen: 0, kills: 0, hits: 0, attacks: 0, shots: [] };
  // ---- 始める（戦の前の札 → 押して出陣） ----
  let tClick = performance.now();
  const previousBattle = game.battle;
  if (spec.kind === 'dojo') { game.startDojo(); }
  else if (spec.kind === 'castle') {
    const G = newGame('bot', 'normal', 'nagashino');
    G.practice = true; G.rank = 3; G.aijirushi = 'maru'; G.owned.push('katana');
    const mk = MAP_KEYS[Math.floor(Math.random() * MAP_KEYS.length)];
    G.japan = null; ensureJapan(G, mk); game.G = G;
    game.japanMap('title', true); await wait(1500);
    aud.scanDom(`日本地図（${mk}）`);
    const J = window.__japan;
    const ids = J ? Object.keys(J.J.own).filter((id) => J.attackable(id)) : [];
    if (!ids.length) { rep.errors.push(`攻められる城が無い（${mk}）`); return rep; }
    const id = pick(ids); J.select(id); await wait(500);
    rep.note = `${mk}・${J.D.byId[id].name}`;
    tClick = performance.now(); J.attack();
  } else {
    // 織田家編を続けて遊ぶ時（spec.cont）は、城下の「出陣」から出た戦の前の札をそのまま使う
    if (!spec.cont) {
      const G = spec.kind === 'lord' ? lordGame(spec.scn) : newGame(spec.kind === 'camp' ? pick(['藤吉', '弥五郎', '小六']) : 'bot', 'normal', spec.scn);
      G.practice = spec.kind !== 'camp';
      if (spec.kind === 'battle') { G.rank = spec.rank; G.aijirushi = 'maru'; if (G.rank >= 2) G.owned.push('katana'); }
      if (spec.kind === 'camp') { G.aijirushi = G.aijirushi || 'maru'; if (spec.i > 0) { G.rank = Math.min(3, Math.ceil(spec.i / 2)); if (G.rank >= 2) G.owned.push('katana'); } }
      game.G = G; G.battle = spec.i;
      game.story(spec.i);
    }
    for (let k = 0; k < 30 && !document.getElementById('b-next'); k++) await wait(200);
    await wait(500);
    const st = document.querySelector('#screen .story');
    // 見えている字だけを数える（「もっと読む」に畳んだ続きは数えない）
    rep.storyLen = st ? st.innerText.replace(/もっと読む/g, '').replace(/\s+/g, '').length : 0;
    aud.scanDom(`${name}・戦の前の札`);
    if (per.key === 'reki') { const m = st && st.textContent.match(MODERN); if (m) c.add(`story-modern:${m[1]}`, `戦の前の札に、時代に合わない言葉「${m[1]}」`, name, 2, { cat: '数と文' }); await wait(Math.min(4000, rep.storyLen * 20)); }
    if (per.key === 'sek' && rep.storyLen > 220) c.add(`story-long:${spec.id}`, '戦の前の説明が長い', `${name}：${rep.storyLen}字（読むのに1分かかる）`, 1, { cat: '使いづらい', fix: '三行ほどに縮め、残りは「くわしく」に畳む' });
    if (per.key === 'chu' && rep.storyLen > 160) c.storyTooLong = rep.storyLen;
    // 変わり目：台詞を全部読む人・ゆっくりの人は、札を読んでから押す
    if (per.key !== 'reki' && (V.habit === 'yomu' || V.spd === 1)) await wait(Math.min(8000, rep.storyLen * (V.habit === 'yomu' ? 30 : 15)));
    const pad0 = new TouchPad(game, c);
    tClick = performance.now();
    const bn = document.getElementById('b-next');
    if (!bn || !pad0.tap(bn, '出陣（札の釦）')) { if (bn) bn.click(); else { rep.errors.push('戦の前の札に進む釦が無い'); return rep; } }
  }
  // 前の戦が残っていても、新しい戦と読み込み完了を待つ。札の釦の文言には頼らない。
  const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  for (let k = 0; k < 600; k++) {
    if (game.battle && game.battle !== previousBattle && document.getElementById('loading').hidden) break;
    if (performance.now() >= BUDGET_END.t) {
      rep.cut = true; rep.note = '試験の持ち時間が出陣の支度中に尽きた'; return rep;
    }
    const go = document.querySelector('#screen .campaign [data-go]');
    if (go && vis(go) && !go.disabled) go.click();
    // 読み込みのやり直しで戦の前の札へ戻った時も、釦から進む。
    const retry = document.getElementById('b-next');
    if (k > 10 && retry && vis(retry) && !retry.disabled && document.getElementById('loading').hidden) retry.click();
    await wait(100);
  }
  rep.loadMs = Math.round(performance.now() - tClick);
  const b = game.battle;
  if (!b || b === previousBattle || !document.getElementById('loading').hidden) { rep.errors.push('新しい戦の読み込みが終わらなかった'); return rep; }
  await wait(300);
  // 見渡し中は本番の入力が消される。飛ばす釦を押し、見渡しを閉じてから戦を進める。
  if (game.deployment) {
    const padView = new TouchPad(game, c);
    padView.tap(document.getElementById('deployment-skip'), '見渡しを飛ばす');
  }
  // 釦を押せなかった時も、共通の終了処理で札と入力の消去を終える。
  finishDeployment(game);
  if (per.key === 'sek' && rep.loadMs > 8000) c.add('load-slow', '戦が始まるまでの読み込みが長い', `${name}：押してから ${(rep.loadMs / 1000).toFixed(1)}秒（機械が混んでいる時の値）`, rep.loadMs > 20000 ? 3 : 2, { cat: '使いづらい', fix: '読み込みの間に、戦の心得を読ませる／重い物を後から足す' });
  await watchDeployment(game);
  // 開戦の札を読んで出陣する。札の下へ歩く指を置かない。
  // 後回しの札もここで出す。最初の歩みや開戦の記録より先に出陣を済ませる。
  const padIntro = new TouchPad(game, c);
  if (!enterBattle(game, padIntro)) {
    rep.errors.push('開戦の「出陣する」を押しても戦を始められなかった');
    game.stopBattle();
    return rep;
  }
  if (!b.flags.rojoUI) game.paused = false;
  document.getElementById('pause').hidden = true;
  // 本番と同じく、指を置く前に新しい戦の操作部を整える。
  // 最初の pointerdown の後で初期化すると、棒と構えが消えても道具側だけ押したままになる。
  touchFrame(0);
  aud.attach(b, name); aud.scanDom(`${name}・開戦`);
  // 人ごとの目：台詞と号令を拾う
  const om = aud.onMsg.bind(aud);
  aud.onMsg = (kind, text) => {
    om(kind, text);
    if (kind === '台詞') c.lastSayT = b.t;
    if (c.cmdSeen && b.t - c.cmdSeen.t < 1.2) c.cmdSeen.fb = true;
    if (per.key === 'reki' && (kind === '台詞' || kind === '見出し' || kind === '報せ')) { const m = String(text).match(MODERN); if (m) c.add(`say-modern:${m[1]}`, `台詞に時代に合わない言葉「${m[1]}」`, `「${String(text).slice(0, 40)}」（${kind}）`, 2, { cat: '数と文', fix: '当時の言い方に直す' }); }
  };
  const cmd0 = b.player.command.bind(b.player);
  const LBL = Object.fromEntries(RADIAL.map((r) => [r.id, r.label]));
  b.player.command = (id, ...a) => {
    // 取り消しや、組が尽きた知らせも操作への応答。兵が動いた記録とは分ける。
    c.radialHandled = { id, t: b.t };
    const groups = b.player.selectedGroups().slice(), previous = b.player.lastCmd;
    c.cmdSeen = { id, label: LBL[id] || id, t: b.t, groups, response: new Map() };
    const result = cmd0(id, ...a);
    // 拒まれた号令・同じ号令を押して取り消した時は、兵への下知として測らない。
    if (b.player.lastCmd === previous || !b.player.lastCmd) { c.cmdSeen = null; return result; }
    for (const g of groups) for (const s of g.units) if (s.alive) c.cmdSeen.response.set(s, { x: s.pos.x, z: s.pos.z, started: !g.pending, acted: false });
    c.cmdN = (c.cmdN || 0) + 1;
    return result;
  };
  // 自分の突きの当たり・討ち取り
  const P = b.player.u;
  // 一振りの開始だけを数える。向き直りと払いの着弾は、同じ振りの続き。
  // 続きの印も本体へ渡す。落とすと向き直りを繰り返し、払いも振り出しへ戻って当たらない。
  const strike0 = b.player.strike.bind(b.player);
  b.player.strike = (kind, third, impact = false, assisted = false) => {
    // 狙い補助の着弾を待つ間に拒まれた入力も、新しい一振りには数えない。
    if (!impact && !assisted && !b.player.assistImpact) rep.attacks = (rep.attacks || 0) + 1;
    const hits = rep.hits, structures = rep.structHits || 0;
    const r = strike0(kind, third, impact, assisted);
    if (rep.hits > hits) rep.hitSwings = (rep.hitSwings || 0) + 1;
    else if ((rep.structHits || 0) > structures) rep.structSwings = (rep.structSwings || 0) + 1;
    return r;
  };
  const dmg0 = b.army.damage.bind(b.army);
  const foeHits = new WeakMap();
  b.army.damage = (t, amount, src, opts) => {
    const hp = t && t.hp, alive = t && t.alive;
    const r = dmg0(t, amount, src, opts);
    if (src === P && t && t.isStruct && t.hp < hp) rep.structHits = (rep.structHits || 0) + 1;
    // 壁に止まった一撃や、すでに倒れた相手への呼び出しは当たりではない。
    const contact = alive && (t.hp < hp || /^(hit|armor|block)$/.test(opts?.out?.res || ''));
    if (src === P && t && !t.isStruct && contact) {
      rep.hits++;
      const n = (foeHits.get(t) || 0) + 1; foeHits.set(t, n);
      if (!t.alive) { rep.finishedHits = (rep.finishedHits || 0) + n; rep.finishedFoes = (rep.finishedFoes || 0) + 1; }
      if (game.hitstop > 0 || game.slowmo > 0) c.feel = (c.feel || 0) + 1;
      if (t.invuln && (t.type === 'busho' || t.name)) c.invulnHit = t.name || '武将';
    }
    return r;
  };
  const kill0 = b.army.kill.bind(b.army);
  b.army.kill = (t, src) => { if (src === P) rep.kills++; else if (src && src.team === P.team && t && t.team !== P.team) rep.allyKills = (rep.allyKills || 0) + 1; return kill0(t, src); };
  // 味方の隊の働き：5 秒ごとに、味方の隊（組を除く）の中心の動いた距離と、敵が 60m 内にいるのに 20 秒動かない隊を数える
  const AM = { at: 0, pos: new Map(), move: 0, idle: 0, samp: 0, low: 0 };
  const allyTick = () => {
    if (b.t < AM.at) return; AM.at = b.t + 5;
    let real = 0; for (const u of b.army.units) if (u.alive && u.team === P.team && !u.isPlayer && !u.fleeing) real++;
    if (real < 5 && b.t > 30) AM.low++;
    for (const g of b.army.groups) {
      if (g.team !== P.team || g.isPlayerSquad || g.routed || !g.count) continue;
      const c = g.center(), q = AM.pos.get(g);
      if (q) { const d = Math.hypot(c.x - q.x, c.z - q.z); AM.move += d; q.still = d < 1 ? q.still + 5 : 0; AM.samp++; if (q.still >= 20 && !g.units.some((u) => u.alive && (u.target || u.atk)) && b.army.nearestEnemy({ pos: c, team: P.team }, 60, (o) => !o.fleeing)) { AM.idle++; q.still = 0; } q.x = c.x; q.z = c.z; }
      else AM.pos.set(g, { x: c.x, z: c.z, still: 0 });
    }
    rep.ally = `隊${AM.pos.size}・動いた計${Math.round(AM.move)}m・味方の討ち取り${rep.allyKills || 0}・敵を前に20秒止まった${AM.idle}回・本物の味方5人未満${AM.low * 5}秒`;
  };
  const hurt = {};
  const td = b.player.takeDamage.bind(b.player);
  b.player.takeDamage = (a, src) => { const d = td(a, src); const k = src ? (src.isStruct ? '柵' : ({ bow: '弓', gun: '鉄砲', cavalry: '騎馬', samurai: '侍', busho: '武将', ashigaru: '足軽' }[src.type] || src.type)) : '?'; hurt[k] = (hurt[k] || 0) + (d || 0); if (src && (src.type === 'bow' || src.type === 'gun') && d > 0) { b.botShotT = b.t; b.botShooter = src; } return d; };
  // 指：本当の input を捕まえる（main の毎コマの b.update は、bot が回すので止める）
  const pad = new TouchPad(game, c);
  pad.real = touchInput(game);
  const step = b.update.bind(b);
  const inp = fake();
  b.update = (dt, i) => { if (i !== inp && !pad.real && i && i.edge) pad.real = i; };
  for (let k = 0; k < 40 && !pad.real && performance.now() < BUDGET_END.t; k++) {
    await wait(100);
    // 描画を休む時や日送り中も、釦につながった入力を直接取り直す。
    // 本番の更新が来ることを、指の操作を始める条件にしない。
    pad.real = touchInput(game) || pad.real;
  }
  const touch = isTouch && !!pad.real;
  if (!touch && !V.pc) c.add('no-touch', '指の操作に切り替わらなかった（input を捕まえられない）', `isTouch=${isTouch}`, 1, { cat: '落ちた' });
  c.b = b;
  const cap = spec.kind === 'dojo' ? 120 : (per.cap || 900);
  let t = 0, frames = 0, lastPos = { x: 0, z: 0 }, idle = 0, lastMain = '', midShot = false;
  const dt = 0.05;
  const onErr = (ev) => rep.errors.push(`${ev.message}（${(ev.filename || '').split('/').pop()}:${ev.lineno}）`);
  window.addEventListener('error', onErr);
  const s0 = await shot(game, `${name}・開戦`); if (s0) rep.shots.push({ label: '開戦', file: s0 });
  // 一時停止の札も、左上の「止める」から一度だけ見る（中学生・せっかち）
  let paused1 = !(per.key === 'chu' || per.key === 'sek' || V.pausy);
  let overShot = false, stepMs = 0;
  const prof = { brain: 0, pad: 0, tf: 0, upd: 0, eye: 0 };
  const tLoop = performance.now();
  let lastYield = tLoop;
  try {
    while (game.battle === b && !b.ended && t < cap && performance.now() < BUDGET_END.t) {
      // 早送り中に題の札が開いても、本番と同じく出陣してから操作する。
      // 戦の更新を直接呼ぶため、本番の「札を読む間は止める」をここでも守る。
      if (openingWait(game)) {
        if (!rep.openingWaitNoted) { rep.openingWaitNoted = true; rep.waits.push('出陣待ち：題の札と布陣の見渡しの間は移動を数えない'); }
        pad.releaseAll();
        if (pad.real) pad.real.endFrame();
        idle = 0;
        if (!enterBattle(game, pad)) { rep.errors.push('開戦の「出陣する」を押しても戦を始められなかった'); break; }
        // 出陣で再び出る丸を整えてから、次の指の操作を始める。
        pad.cache.clear();
        touchFrame(0);
        await wait(0); lastYield = performance.now();
        continue;
      }
      if (game.paused) {
        pad.releaseAll();
        if (pad.real) pad.real.endFrame();
        idle = 0;
        await wait(100); lastYield = performance.now();
        continue;
      }
      inp.endFrame();
      // 判断を休むコマだけ前の歩みを保つ。退避の横歩きを次の判断へ持ち越さない。
      if (!(V.spd === 1 && frames % 3 !== 0)) {
        for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) inp.k.delete(k);
      }
      inp.runHeld = false; inp.chargeHold = false;
      for (const k of c.releaseKeys) pad.real && pad.real.keys.delete(k);
      c.releaseKeys.length = 0;
      c.where = `${name}・${Math.round(b.t)}秒・${b.phase || ''}`;
      const ts = performance.now();
      const yaw0 = b.player.yaw;
      // 変わり目「ゆっくり」：考え直すのは3コマに一度（その間は前の手のまま）
      if (b.over || b.ended || b.flags.ending || b.player.catching) {
        brain(b, inp);
      } else if (!(V.spd === 1 && frames % 3 !== 0)) {
        brain(b, inp);
        if (HABIT[per.key]) HABIT[per.key](b, inp, c);
        rangedHabit(b, inp, c);
        variantHabit(b, inp, c);
      } else if (V.habit === 'hashiri') inp.runHeld = true;
      if (!b.over && !b.ended && !b.flags.ending && b.def.botSteer) b.def.botSteer(b, inp);
      const want = b.player.yaw;
      const t1 = performance.now();
      if (touch) {
        b.player.yaw = yaw0;
        pad.apply(inp, want, b);
        const t2 = performance.now();
        touchFrame(dt);
        const t3 = performance.now();
        step(dt, pad.real);
        pad.real.endFrame();
        prof.brain += t1 - ts; prof.pad += t2 - t1; prof.tf += t3 - t2; prof.upd += performance.now() - t3;
      } else {
        step(dt, inp);
      }
      frames++;
      const t4 = performance.now();
      aud.tick(dt);
      watchStep(b, dt, c);
      prof.eye += performance.now() - t4;
      stepMs += performance.now() - ts;
      t += dt;
      if (rep.decisionTime == null && (b.over || b.ended || b.flags.ending || !b.player.u.alive)) rep.decisionTime = Math.round(b.t);
      // 勝ち負けが決まった所（終わりの演出の前）を一枚
      if (b.over && !overShot) { overShot = true; const f = await shot(game, `${name}・勝ち負けが決まった所`); if (f) rep.shots.push({ label: '勝ち負けが決まった所', file: f }); }
      // 写真：困った事を見つけた時・山場・歴史好きの見回し
      if (c.shotQ.length) { const it = c.shotQ.shift(); if (!it.shot) { it.shot = await shot(game, it.title); } }
      if (c.wantShot) { const l = c.wantShot; c.wantShot = null; const f = await shot(game, l); if (f) rep.shots.push({ label: l, file: f }); }
      if (!midShot && (t > cap * 0.45 || (b.army.nearestEnemy(P, 12) && t > 40))) { midShot = true; const f = await shot(game, `${name}・山場`); if (f) rep.shots.push({ label: '山場', file: f }); }
      if (!paused1 && t > 25) {
        paused1 = true;
        const bt = document.getElementById('tc-pause');
        if (pad.tap(bt, '止める')) { await wait(500); aud.scanDom(`${name}・一時停止`); const rs = [...document.querySelectorAll('#pause button')].find((x) => /再開|戻る|続け/.test(x.textContent)); if (rs) pad.tap(rs, '再開'); else { game.paused = false; document.getElementById('pause').hidden = true; c.add('pause-noresume', '一時停止の札に「再開」の釦が見つからない', '#pause の中', 2); } await wait(300); game.paused = false; document.getElementById('pause').hidden = true; }
      }
      allyTick();
      const mo = b.objectives.filter((q) => q.kind === 'main').map((q) => q.text + (q.state ? `〔${q.state === 'done' ? '済' : '失'}〕` : '')).join('／');
      if (mo !== lastMain) { lastMain = mo; if (rep.flow.length < 14) rep.flow.push(`${Math.round(b.t)}s ${mo || '（任務なし）'}`); }
      const up = P.pos;
      // 札に指を遮られた時は操作の問題として記録済み。地形に阻まれた歩みと取り違えない。
      if (!openingWait(game) && !game.paused && (!touch || pad.move) && dist(up, lastPos) < 0.02 && inp.k.has('KeyW')) idle += dt; else idle = 0;
      if (idle > 8) { rep.stuck.push(`${Math.round(t)}秒：前へ進めない（${Math.round(up.x)}, ${Math.round(up.z)}・段 ${b.phase || '―'}）`); c.add(`stuck:${spec.id}:${Math.round(up.x / 10)},${Math.round(up.z / 10)}`, '前へ進もうとしても進めない所があった', `(${Math.round(up.x)}, ${Math.round(up.z)})・段 ${b.phase || '―'}`, 2, { cat: '辻褄', shot: true, fix: '当たり（柵・建物・地形）と道のつながりを見直す' }); idle = -30; }
      lastPos = { x: up.x, z: up.z };
      // 200コマごとではなく、0.3秒ごとに息をつく（始めの数十コマは顔や家紋の絵を作るので一コマが重く、外からの問い合わせに答えられなくなる）
      if (frames % 200 === 0 || performance.now() - lastYield > 300) { rep.time = Math.round(b.t); rep.merit = b.tracker.total(); rep.down = !P.alive; await wait(0); lastYield = performance.now(); }
    }
  } catch (e) { rep.errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' ')); }
  window.removeEventListener('error', onErr);
  pad.releaseAll();
  if (!overShot) { const sE = await shot(game, `${name}・終わり近く`); if (sE) rep.shots.push({ label: '終わり近く', file: sE }); }
  rep.stepMs = +(stepMs / Math.max(1, frames)).toFixed(1);
  rep.prof = Object.entries(prof).map(([k, v]) => `${k} ${(v / Math.max(1, frames)).toFixed(1)}`).join('・');
  rep.realSec = Math.round((performance.now() - tLoop) / 1000);
  b.update = step;
  rep.timeout = t >= cap && !b.over;
  if (performance.now() >= BUDGET_END.t && !b.over) { rep.cut = true; rep.note = '戦の任務とは別に、試験全体の持ち時間が尽きた'; rep.battle += '（試験の持ち時間で打ち切り）'; }
  rep.named = aud.endCheck(b, rep.timeout && cap >= 900);
  rep.time = rep.decisionTime ?? Math.round(b.t);
  rep.afterDecision = Math.max(0, Math.round(b.t) - rep.time);
  rep.merit = b.tracker.total();
  rep.main = b.tracker.main;
  rep.squad = b.squad.length ? `${b.squad.filter((s) => s.alive).length}/${b.squad.length}` : '—';
  rep.down = !!(b.result && b.result.down) || !P.alive;
  rep.hurt = Object.entries(hurt).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join('・');
  rep.lines = b.tracker.lines().map((l) => `${l.label} ${l.pts > 0 ? '+' : ''}${l.pts}`).join('、');
  rep.attacks = rep.attacks || 0;
  rep.cmds = c.cmdN || 0; c.cmdN = 0;
  rep.taps = c.taps;
  // ---- 戦の終わりに、人ごとに振り返る ----
  if (rep.errors.length) rep.errors.slice(0, 3).forEach((e) => c.add('err:' + e.slice(0, 50), '遊んでいる途中でゲームが落ちた（例外）', e, 3, { cat: '落ちた', fix: 'この行の前提（値が無い・死んだ兵など）を確かめる' }));
  if (rep.down) c.add(`down:${spec.id}`, per.key === 'chu' ? 'すぐに倒れてしまった' : '倒れて戦が終わった', `${rep.time}秒で倒れた（受けた傷：${rep.hurt || '―'}）`, per.key === 'chu' && rep.time < 150 ? 3 : per.key === 'act' ? 2 : 1, { cat: '使いづらい', fix: '初めの戦は受ける傷を減らす・危ない時に字幕で構えを教える' });
  if (per.key === 'chu' && c.lostSum > 60) c.add(`lostsum:${spec.id}`, 'この戦のあいだ、迷っていた時間が長い', `${name}：合わせて${Math.round(c.lostSum)}秒${c.storyTooLong ? `（戦の前の説明は${c.storyTooLong}字で、読まなかった）` : ''}`, 2, { fix: '最初の任務の印を近くに・大きく。長い説明は戦の中で一つずつ' });
  c.lostSum = 0;
  if (per.key === 'act') {
    // 門や柵に当たった振りを、兵への空振りに数えない。空を突いた振りは引き続き数える。
    const combatSwings = rep.attacks - (rep.structSwings || 0);
    if (combatSwings > 30 && (rep.hitSwings || 0) < combatSwings * 0.2) c.add(`act-miss:${spec.id}`, '突いても、なかなか当たらない', `${rep.attacks}回振り、門・柵に当たった振り${rep.structSwings || 0}回、兵に当たった振り${rep.hitSwings || 0}回`, 2, { cat: '使いづらい', fix: '狙いの補助と、敵まで通れる道・間合いを確かめる' });
    // まだ戦っている相手や、味方が討った相手への突きを討ち取りの回数に混ぜない。
    if (rep.finishedFoes >= 3 && rep.finishedHits / rep.finishedFoes > 6) c.add(`act-tanky:${spec.id}`, '一人倒すのに何度も突かされる', `平均 ${(rep.finishedHits / rep.finishedFoes).toFixed(1)}回で一人`, 1, { cat: '使いづらい', fix: '足軽は2〜3突きで倒れるくらいに' });
    if (!rep.down && rep.kills >= 15 && !(rep.hurt)) c.add(`act-easy:${spec.id}`, '歯ごたえがない（無傷で大勢倒せる）', `${rep.kills}人を無傷で討った`, 1, { cat: '使いづらい', fix: '敵の打ち返し・囲み方を強める' });
    if (rep.down && rep.time < 120) c.add(`act-hard:${spec.id}`, '始まってすぐやられる（難しすぎ）', `${rep.time}秒で倒れた（${rep.hurt || '―'}）`, 2, { cat: '使いづらい' });
    if (rep.hits > 10 && !c.feel) c.add('act-nofeel', '当たった手応え（止め・揺れ）が感じられない', `${rep.hits}回当てて、ヒットストップが一度も無い`, 2, { cat: '使いづらい', fix: 'battle.js の onPlayerLanded の hitstop を確かめる' });
    if (c.mountTry && !c.rode) c.add(`act-mountfail:${spec.id}`, '馬に乗ろうとしても乗れなかった', `${c.mountTry}回試した`, 2, { cat: '使いづらい', fix: '乗れない時は理由を字幕で' });
    // 乗れない身分や、船上・寺の中の戦では、空馬を足す必要はない。
    if (b.player.canRide && !b.def.noHorse && !c.mountTry && !c.rode && !c.looseSeen) c.add('act-nohorse', '馬に乗れる場面がなかった', name, 1, { cat: '使いづらい', fix: '空馬（主を失った馬）をもう少し置く' });
    if (c.invulnHit) c.add(`act-invuln:${c.invulnHit}`, '武将に斬りかかっても、傷がつかない（不死身）', c.invulnHit, 2, { cat: '辻褄', fix: '討てない武将なら、斬りかかれない理由を見せる' });
    if (rep.time > 180 && rep.kills < rep.time / 60) c.add(`act-dull:${spec.id}`, '斬り合う相手が少なくて退屈', `${Math.round(rep.time / 60)}分で${rep.kills}人`, 1, { cat: '使いづらい' });
    c.feel = 0; c.invulnHit = null; c.mountTry = 0; c.rode = false; c.looseSeen = false; c.bushoMin = 0;
  }
  if (per.key === 'sen' && !b.squad.length && spec.kind !== 'dojo') c.add(`sen-nosquad:${spec.id}`, 'この戦では号令できる組が無い（指揮する所が無い）', name, 1, { cat: '使いづらい' });
  if (per.key === 'sek') {
    if (rep.time > 420) c.add(`sek-long:${spec.id}`, '一つの戦が長い（7分を超えた）', `${name}：${Math.round(rep.time / 60)}分${rep.timeout ? '（10分で切り上げた）' : ''}`, rep.timeout ? 2 : 1, { cat: '使いづらい', fix: '途中で区切れる所（段の切れ目）に「ここまで」を置く' });
    if (c.firstFoe && c.firstFoe > 120) c.add(`sek-slowstart:${spec.id}`, '敵に会うまでが長い', `${Math.round(c.firstFoe)}秒歩いてやっと敵`, 1, { cat: '使いづらい' });
    c.firstFoe = 0;
  }
  // 戦のあとの画面も見る（指の端末なのに鍵盤の案内が出ていないか）
  await wait(3500);
  aud.scanDom(`${name}・戦のあと`);
  const scr = document.getElementById('screen');
  if (scr && !scr.hidden) {
    const tx = scr.innerText || '';
    const m = tx.match(/(Enter|Esc|Space|Tab|クリック|[「（ ][A-Z]キー|[ ・][A-Z] で)/);
    if (m && (per.key === 'chu' || per.key === 'sek')) c.add(`kbd-hint:${m[1]}`, '指の端末なのに、鍵盤・マウスの案内が出ている', `戦のあとの画面に「${tx.slice(Math.max(0, tx.indexOf(m[1]) - 12), tx.indexOf(m[1]) + 16).replace(/\s+/g, ' ')}」`, 1, { fix: 'isTouch の時は「画面を押す」などの言い方にする' });
    const f = await shot(game, `${name}・戦のあとの画面`); if (f) rep.shots.push({ label: '戦のあとの画面', file: f });
  }
  if (game.battle && spec.kind !== 'camp') game.stopBattle();
  return rep;
}

async function runPersona(game, key) {
  const per = PERSONAS[key] || PERSONAS.chu;
  window.__persona = per.key;
  // 速回し：描画は写真を撮る時だけ（それ以外は描かない＝速い）
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 500);
  window.cancelAnimationFrame = (id) => { clearTimeout(id); caf(id); };
  if (game.renderer) { game.renderer.__r0 = game.renderer.render.bind(game.renderer); game.renderer.render = () => {}; }
  game.noLock = true;
  const aud = new Auditor();
  window.__aud = aud;
  const c = makeCtx(per, aud);
  const log = [];
  const say = (s) => { log.push(s); window.__botLog = log.slice(-3).join(' ／ '); };
  aud.scanDom('タイトル');
  // 何を遊ぶか：その人の好みから、ばらばらに n 戦
  const all = listPlayable();
  const n = clamp(+(Q.get('n') || 1 + Math.floor(Math.random() * 3)), 1, 3);
  const only = ONLY ? all.filter((x) => ONLY.has(x.id) && (V.mode === 'lord' ? x.kind === 'lord' : !(x.kind === 'lord' && x.scn === 'oda'))) : null;
  const pool = only && only.length ? only : (per.prefer(all).length ? per.prefer(all) : all);
  const plan = [];
  // 半分は好みから、半分は全体から（いろいろな戦に当たるように）
  const stick = per.key === 'sen' || per.key === 'act' ? 1 : 0.65;
  for (let k = 0; k < n; k++) { const src = only || Math.random() < stick ? pool : all; const cand = src.filter((x) => !plan.includes(x)); if (cand.length) plan.push(pick(cand)); }
  if (per.key === 'sen' && !only && !plan.some((x) => x.kind === 'lord') && Math.random() < 0.5) { const l = all.filter((x) => x.kind === 'lord'); if (l.length) plan[0] = pick(l); }
  // 織田家編があれば、八割は「新しく始めて、戦と城下を続けて遊ぶ」
  const camp = all.filter((x) => x.kind === 'camp');
  if (camp.length && !only && Math.random() < 0.8) {
    plan.length = 0;
    // たいていは始めから。時々は途中の戦から（その身分の新しい手で）
    // 戦略家は組を預かる身分の戦から（組が無いと号令できない）
    const s0 = per.key === 'sen' ? 1 + Math.floor(Math.random() * Math.max(1, camp.length - 1)) : Math.random() < 0.75 ? 0 : Math.floor(Math.random() * camp.length);
    for (let k = 0; k < n && camp[s0 + k]; k++) plan.push({ ...camp[s0 + k], cont: k > 0 });
  }
  // 1000人の表の「遊ぶ所」「身分の進み」があれば、それで決める（種 pick で、どの戦かも決まる）
  if (V.mode && !only) {
    const lords = all.filter((x) => x.kind === 'lord');
    plan.length = 0;
    if (V.mode === 'lord' && lords.length) plan.push(lords[V.pick % lords.length]);
    else if (camp.length) {
      const q = Math.max(1, Math.floor(camp.length / 4));
      const at = Math.min(camp.length - 1, V.prog * q + (V.pick % q));
      if (V.mode === 'one') plan.push(camp[at]);
      else { const s0 = V.prog === 0 ? 0 : at; for (let k = 0; k < n && camp[s0 + k]; k++) plan.push({ ...camp[s0 + k], cont: k > 0 }); }
    }
    if (!plan.length) plan.push(all[V.pick % all.length]);
  }
  if (V.view === 'tp') c.fp = true;
  if (V.sens > 0) S.sens = V.sens;   // 見回しの感度（設定の画面で替える人の真似）   // 三人称の人：歴史好きでも一人称へ替えない
  const reports = [];
  const t0 = performance.now();
  if (+Q.get('budget') > 0) BUDGET_END.t = t0 + +Q.get('budget') * 1000;
  // 途中で打ち切られても感想が残るように、戦を一つ終えるごとに書き直す
  const partial = () => {
    const cur = c.curRep && !reports.includes(c.curRep) ? [{ ...c.curRep, cut: true, battle: c.curRep.battle + '（途中で打ち切り）' }] : [];
    const done = [...reports, ...cur];
    const probs = [...c.problems, ...fromAudit(aud, c).filter((x) => !c.byKey.has(x.key))];
    // 写真の無い困り事には、その戦の山場の写真を添える
    for (const it of probs) if (!it.shot) { const r = reports.find((x) => it.battles.includes(x.battle)) || reports[0]; const sh = r && r.shots && (r.shots.find((x) => x.label === '山場') || r.shots[0]); if (sh) it.shotNear = sh.file; }
    window.__botPartial = { persona: per.key, variant: V.row != null ? V : null, size: `${innerWidth}×${innerHeight}`, dpr: devicePixelRatio, touch: isTouch, quality: S.quality, plan: plan.map((x) => x.name), battles: done, problems: probs, audit: aud.items.length, feel: voiceOf(per, done, probs, c) };
  };
  window.__botFlush = () => { try { partial(); } catch (e) { /* 書けなくても続ける */ } return 1; };
  for (const spec of plan) {
    // 持ち時間の半分を過ぎていたら、次の戦は始めない
    if (performance.now() > t0 + (BUDGET_END.t - t0) * 0.5) { say(`持ち時間が足りないので${spec.name}は遊ばない`); break; }
    // 続けて遊ぶ時：戦のあとの画面を進めて城下へ、問屋で買い物、出陣
    if (spec.cont) {
      const ok = await campaignTown(game, c, aud, spec);
      if (!ok) { if (game.battle) game.stopBattle(); break; }
    }
    say(`${per.name}：${spec.name}を遊んでいます…`);
    let r;
    try { r = await playPersona(game, spec, aud, c); } catch (e) { r = { battle: spec.name, key: spec.id, errors: [String(e && e.stack || e).split('\n').slice(0, 3).join(' ')], stuck: [], waits: [], flow: [], named: [], time: 0, merit: 0, main: false, squad: '—', down: false, shots: [] }; if (game.battle) game.stopBattle(); }
    reports.push(r);
    say(`${spec.name}：${r.time}秒・任務${r.main === true ? '達成' : '失敗'}${r.down ? '・倒れた' : ''}`);
    partial();
  }
  if (game.battle) game.stopBattle();
  partial();
  window.__botData = { ...window.__botPartial, sec: Math.round((performance.now() - t0) / 1000), done: true };
}
