import { setCssVar, $, setClass, singleBattleGuide, dismountFirst, recovering, retreatRequired, guidanceEnded, travelSignPriority, rescueTarget, combatTask, taskLabel, leanHud, monIcon, dropSprite } from "./hud_common.js";
import { VIEW } from "./viewport.js";
import { isTouch, touchMovePoint } from "./touch.js";
import { S } from "./settings.js";
import { currentObjective, navigationEnemy, taskText } from "./mission_guide.js";
import { sightScreenUnit, sightUnit } from "./battle_sight.js";
import { rainDanger } from "./arrow_rain.js";
import { groundAt } from "./floors.js";
import { enemyKnown } from "./battle_intel.js";
import { GENERALS, FACTION } from "./units.js";
import { pinGuideOn, markedEnemy } from "./mission_pin.js";

// 共通の目標の輪・端の矢印・所属の形を使い、以前の案内を重ねない。
const PIN_OFF = "AdvanceStep ApproachRoute CornerArrow DefendedFlag DefendedLocation DefenseArea DefenseBoundary DefenseLine DefenseOverview DefensePattern DestinationArea DestinationPointer DestinationSign DestinationStep DirectionChain DoorFloorGoal EdgeDestination EscortFlag FlagDestinationSign FlagGuide FlagLink FloorGoal FloorWaymark FootDirection FootRoute GoalArrivalRing GoalArrow GoalFlagFrame GroundGuide GuardPost GuardPostFrame GuideLink MarkedGoalFlag MoveFootprints MoveGoal MoveOrigin NamedDestination NamedGoal NavigationArrow OffscreenDirection PassageGuides PlaceFrame PlayerSign RaisedGoalFlag RetreatDestination RetreatRoute ReturnDestination RouteBend RouteFootsteps RoutePath RouteTurn SelectedGoalFlag SingleDestination SmallGoalFlag SmallGoalFlagPath SwipeArrow TargetFootRing TaskDestinationSign TravelGuide WaitFootprints WaitFrame TargetPointer FocusDiamond EnemyOutline EnemyContour TeamWord EnemySign SpearSign UnitContrast EnemyDirection CoverDirection CoverSign MoveGesture ReleaseGesture EnemyMoveGesture".split(" ").map((n) => "draw" + n);
const off = () => false;

export class HudOverlay {

  // 森部は先端が地面に刺さるピンで、到着する地点を示す。
  drawBattleGoalSign(g, rt, x, y, landmark, pin = null) {
    // 通る場所も待つ場所と同じ太い矢印で示す。
    if (landmark || rt.def.routeGuidePriority?.(rt))
      return this.drawDestinationPin(g, x, y);
    if (rt.def.key !== 'moribe') return this.drawDestinationPin(g, x, y);
    g.save(); g.lineJoin = 'round';
    // 横持ちでも中の残りを読める大きさ。渡河中は近づくほど同じピンが育つ。
    const pinScale = pin?.arrived ? 1.6 : 1 + .6 * Math.max(0, Math.min(1, pin?.progress || 0));
    g.translate(x, y); g.scale(pinScale, pinScale); x = 0; y = 0;
    // 地面の接点と短い軸を持たせ、人物の頭上の印と形を分ける。
    g.beginPath(); g.ellipse(x, y + 1, 11, 3, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,18,15,.65)'; g.fill();
    // 場所のピンは軸を長くし、兵の頭上の印と見分けられるよう地面までつなぐ。
    const stem = pin?.unit ? 13 : 43;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - stem);
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
    g.translate(0, 13 - stem);
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x - 10, y - 26);
    g.bezierCurveTo(x - 21, y - 48, x + 21, y - 48, x + 10, y - 26);
    g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = pin?.arrived ? '#14120f' : '#fff3ba'; g.fill();
    if (pin?.arrived) {
      g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    }
    // 移動先は塗りつぶしたピン。中の円は到着後に待つ時だけ使う。
    if (pin?.waiting || pin?.arrived) {
      g.beginPath(); g.arc(x, y - 33, 11, 0, Math.PI * 2);
      g.fillStyle = '#14120f'; g.fill();
    }
    // 実際の到着半径へ入った時だけ、同じピンの内周を閉じる。
    // 地点を踏み直す必要がないことを形で伝え、別の輪や札は足さない。
    if (pin?.arrived) {
      g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
    }
    if (pin?.progress > 0) {
      // ピンの中だけを満たす。待ち時間の札や別の印は増やさない。
      g.beginPath(); g.moveTo(x, y - 33);
      g.arc(x, y - 33, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pin.progress));
      g.closePath(); g.fillStyle = '#e8c25a'; g.fill();
    }
    g.restore();
  }

  // 文と矢印は同じ行き先・視点から向きを取る。入れ物は使い回す。
  battleMoveCue(rt, pos) {
    rt.camera.getWorldDirection(this.tmpV);
    const p = rt.player.u.pos, yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const cue = this.battleMoveState || (this.battleMoveState = {});
    cue.angle = Math.atan2(-forward, right);
    cue.direction = Math.abs(right) > Math.abs(forward) ? right >= 0 ? '右' : '左' : forward >= 0 ? '前' : '後ろ';
    return cue;
  }

  // 向く先は足元から短い一本で示す。目的地の札や操作の矢印を足さない。
  drawBattleDirection(g, rt, pos) {
    if (this.footDirectionDrawn) return false;
    const p = rt.player.u.pos, cue = this.battleMoveCue(rt, pos);
    const at = this.project(p, p.y + .12, rt,
      this.battleFootProjection || (this.battleFootProjection = {}));
    if (at.behind) return false;
    // 矢じりまで画面内に収め、足元のすぐそばに保つ。
    const x = Math.max(92, Math.min(VIEW.w - 92, at.x));
    const y = Math.max(152, Math.min(VIEW.h - 92, at.y));
    g.save(); g.translate(x, y); g.rotate(cue.angle); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(12, -5); g.lineTo(48, -5); g.lineTo(48, -14);
    g.lineTo(70, 0); g.lineTo(48, 14); g.lineTo(48, 5); g.lineTo(12, 5); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = this.waitFacingReady ? '#e4f2cb' : '#fff3ba'; g.fill(); g.restore();
    this.footDirectionDrawn = true;
    return true;
  }


  // 全戦の今の目標を一つだけ示す。輪は実物に固定し、札だけ空いた所へ逃がす。
  drawBattleGoal(g, rt) {
    // 行き先はこの印一つ。合流済みの半径では消し、別の輪を重ねない。
    // 稲生は到着判定と同じ行き先だけ。古い味方の輪へ誘わない。
    const inou = rt.def.key === 'inou', moribe = rt.def.key === 'moribe';
    // 桶狭間の行き先は共通のピン一本。別の投影位置へ同じピンを重ねない。
    if (inou || rt.def.key === 'okehazama' || rescueTarget(rt)) return;
    const guard = !moribe && (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
    // 接近戦の描画で途中を抜ける時も、守る本人の盾は残す。
    if (guard?.alive) {
      const frame = sightScreenUnit(rt, guard) && this.measurePersonFrame(guard, rt, true);
      if (frame && frame.cx >= 28 && frame.cx <= VIEW.w - 28 && frame.top >= 60 && frame.top < VIEW.h - 24)
        return this.drawPersonAction(g, rt, frame.cx, frame.top, '', frame, true);
      return false;
    }
    const pinTarget = rt.def.missionPin?.(rt);
    // 森部は任務が返したピン一本。敵や味方の位置で上書きしない。
    if (moribe && !pinTarget) return;
    // 到着後も同じピンの中を満たし、守備や集合が進んでいることを形で伝える。
    const guide = rt.missionGuide;
    const retreat = !inou && !moribe && this.retreatGuide?.active && this.retreatGuide.valid ? this.retreatGuide : null;
    const dodge = !moribe && rt.dodgeGuide?.valid ? rt.dodgeGuide : null;
    const objectives = moribe ? null : rt.def.objectiveEnemies?.(rt);
    const ally = !moribe && rt.def.missionAlly?.(rt);
    let unit = objectives?.find((u) => u.alive && !u.gone && !u.woundOut);
    const attacking = /たお|倒|討|崩|押せ|押し返/.test(taskLabel(rt, currentObjective(rt)?.text || ''));
    if (!moribe && !unit && !ally && (!guide?.marker || attacking)) {
      const target = this.attackCueEnemy || this.aimGuideEnemy || rt.guideEnemy || rt.player.lock;
      if (target?.alive && !target.gone && !target.woundOut) unit = target;
    }
    const waiting = moribe ? pinTarget.waiting : guide?.marker && /^(wait|guard)$/.test(guide.marker.guideArea);
    if (waiting && !attacking) unit = null;
    const enemy = !retreat && !dodge && !!unit && unit.team !== rt.player.u.team;
    // 討つ相手は名で探す。足元の輪・頭上の印・画面外の矢印も出さない。
    if (enemy) return;
    // 桶狭間が合流済み・戦闘中として消したピンを、古い任務の場所へ復活させない。
    if (rt.def.key === 'okehazama' && !retreat && !dodge && !pinTarget) return;
    let pos = moribe ? pinTarget : retreat || dodge?.pos || (waiting && !attacking ? guide.pos : null) || unit?.pos || pinTarget || guide?.marker && guide.pos || ally?.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const holding = !moribe && !enemy && !retreat && !dodge && /待/.test(taskLabel(rt, currentObjective(rt)?.text || ''));
    if (holding) pos = guide?.marker?.guideDestination?.() || guide?.marker?.guideGoal?.() || pos;
    const landmark = !moribe && !enemy && !retreat && !dodge && rt.def.destinationLandmark?.(rt);
    const route = !moribe && !holding && !enemy && !retreat && !dodge && guide?.marker?.id === 'next' &&
      rt.def.routeGuidePriority?.(rt) ? rt.def.routeSignPoint?.(rt, pos) : null;
    // 遠い表門の位置より、いま通れる手前の戸口を優先する。
    pos = route || landmark || pos;
    const radius = retreat?.radius || (dodge ? 1 : !enemy ? pinTarget?.hide ?? pinTarget?.r ?? guide?.marker?.guideRadius ?? 3 : 0);
    if (!enemy && Math.hypot(pos.x - rt.player.u.pos.x, pos.z - rt.player.u.pos.z) < radius) {
      const facing = !moribe && !retreat && !dodge && waiting && rt.def.waitFacingPoint?.(rt);
      if (facing) return this.drawBattleDirection(g, rt, facing);
      if (!waiting && !holding) return false;
    }
    if ((retreat && !retreat.treatment) || dodge) return this.drawBattleDirection(g, rt, pos);
    // 敵は既に姿を確かめた相手だけ。地形の向こうの伏兵は明かさない。
    let seen = true;
    if (enemy && !retreat) {
      if (unit.isOfficer && !enemyKnown(rt, unit)) return;
      seen = sightScreenUnit(rt, unit);
      const memory = this.battleGoalMemory || (this.battleGoalMemory = { rt:null, unit:null, t:-99, x:0, y:0, z:0 });
      if (seen) {
        memory.rt = rt; memory.unit = unit; memory.t = rt.t;
        memory.x = pos.x; memory.y = pos.y; memory.z = pos.z;
      } else {
        // 振り向いた時は最後に見た場所へ。隠れた敵の移動は追わない。
        if (memory.rt !== rt || memory.unit !== unit || rt.t - memory.t > 8) return;
        pos = memory;
      }
    }
    const y = enemy ? pos.y ?? rt.world.heightAt(pos.x, pos.z) : groundAt(rt.world, pos.x, pos.z, rt.player.u.pos.y);
    const at = this.project(pos, y + .2, rt, this.battleGoalProjection || (this.battleGoalProjection = {}));
    const W = VIEW.w, H = VIEW.h;
    const floor = this.battleGoalFloor || (this.battleGoalFloor = { x:0, y:0, z:0 });
    floor.x = pos.x; floor.y = y; floor.z = pos.z;
    const on = seen && (moribe || enemy || this.floorGoalVisible(rt, floor)) && !at.behind && at.x > 48 && at.x < W - 48 && at.y > 96 && at.y < H - 48;
    // 到着したピンは任務の下へ収める。足元の死体や槍・自分の体と重ねず、
    // 持ち場を見直しても同じ場所で満ちる。別の時計や札は作らない。
    if (moribe && pinTarget.arrived) {
      this.drawBattleGoalSign(g, rt, W - 54, 152, false, pinTarget);
      return true;
    }
    // 地面の行き先と画面外の向きは、この一つの印で示す。
    let x = at.x, sy = at.y - 54, angle = Math.PI / 2;
    if (!on) {
      const next = route || pos;
      const dx = next.x - rt.player.u.pos.x, dz = next.z - rt.player.u.pos.z;
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      angle = Math.atan2(-forward, right);
      const scale = Math.min((W / 2 - 64) / Math.max(.001, Math.abs(right)), (H / 2 - 100) / Math.max(.001, Math.abs(forward)));
      // 森部は実際の向きの端へ置く。後方の地点を横の端に固定しない。
      x = moribe ? W / 2 + right * scale : right >= 0 ? W - 64 : 64;
      sy = H / 2 - forward * scale;
    }
    const word = enemy ? 'この敵' : retreat?.treatment ? '手当てへ' : 'ここへ';
    // 進行札も一枚として数え、同時に三枚まで。輪と形だけは残す。
    let cards = Number(!!this.prog && !this.prog.hidden) + 1; // 体力も一枚。
    for (const item of this.notices.picks) {
      if (item.id === 'objectives' && !item.el.classList.contains('expand')) continue;
      cards++;
    }
    const label = enemy && cards < 3;
    // 札の上端から矢じりの下端までを一組で避ける。
    const spot = this.avoidRects(x, sy + 34, W, H, on ? '' : 'v', null, 52, 94, true);
    g.save(); g.lineJoin = 'round';
    if (on) {
      if (rt.def.key === 'moribe' && !enemy && !landmark) {
        this.drawBattleGoalSign(g, rt, at.x, at.y, landmark, pinTarget);
      } else {
        g.beginPath(); g.ellipse(at.x, at.y, enemy ? 29 : 38, enemy ? 12 : 16, 0, 0, Math.PI * 2);
        g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
        g.shadowColor = enemy ? 'transparent' : '#ffe28a'; g.shadowBlur = enemy ? 0 : 10;
        g.strokeStyle = enemy ? '#ffccb5' : '#fff3ba'; g.lineWidth = 5; g.stroke();
        g.shadowBlur = 0;
        if (!enemy) this.drawBattleGoalSign(g, rt, at.x, at.y, landmark);
      }
    }
    if (spot) {
      x = spot[0]; sy = spot[1] - 34;
      if (!on) {
        // 床と同じ形に矢印を添え、目的地と進む向きを結ぶ。
        if (!enemy) {
          if (moribe) {
            // ピンの先端そのものを行き先へ向け、別の矢印は足さない。
            g.save(); g.translate(x, sy - 16); g.rotate(angle - Math.PI / 2);
            this.drawBattleGoalSign(g, rt, 0, 0, landmark, pinTarget); g.restore();
          } else this.drawBattleGoalSign(g, rt, x, sy - 16, landmark, pinTarget);
        }
        if (!moribe) {
        g.save(); g.translate(x, sy); g.rotate(angle); g.beginPath();
        g.moveTo(-22, -9); g.lineTo(5, -9); g.lineTo(5, -21); g.lineTo(33, 0);
        g.lineTo(5, 21); g.lineTo(5, 9); g.lineTo(-22, 9); g.closePath();
        g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
        g.fillStyle = '#fff3ba'; g.fill(); g.restore();
        }
      } else if (label) {
        g.beginPath(); g.moveTo(x, sy); g.lineTo(at.x, at.y - 15);
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
        g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
      }
      if (label) {
        this.battleGoalLabelDrawn = true;
        g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        const half = g.measureText(word).width / 2 + 8;
        g.fillStyle = '#14120f'; g.fillRect(x - half, sy - 57, half * 2, 29);
        g.fillStyle = '#fff3df'; g.fillText(word, x, sy - 31);
      }
    }
    g.restore();
    return true;
  }

  // 兵や部隊に印を重ねない。
  drawMissionArea(g, rt) { return false; }

  missionEnemyVisible(rt, u) {
    const me = rt.player.u;
    return u?.alive && !u.gone && !u.fleeing && !u.woundOut &&
      !u.downed && !u.noTarget && !u.civ && !u.isStruct && u.team !== me.team &&
      u.mesh?.visible && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) <= 14 &&
      (!u.name || enemyKnown(rt, u)) && sightScreenUnit(rt, u);
  }

  // 兵や部隊に印を重ねない。
  drawMissionEnemies(g, rt) { return false; }

  // 兵や部隊に印を重ねない。
  drawFollowAlly(g, rt, ally) { return false; }

  // 今の任務・会話・狙う相手の名前だけを、暗い下地付きで読む。
  drawBattleNames(rt) {
    const cv = $('overlay'), W = VIEW.w, H = VIEW.h;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    if (!this.ovBlank) g.clearRect(0, 0, W, H);
    this.ovBlank = true;
    if (this.root.classList.contains('photo')) return;
    this.drawRainDrops(g, W, H, rt); this.drawBrim(g, W, H, rt);
    // 雨粒も笠の縁も無いコマは、次のコマで消す仕事を省く。
    this.ovBlank = !(this.drops && this.drops.length) && !((rt.player.fpK || 0) > 0.7);
    // 森部のピンはこの描画経路で一本だけ出す。通常の案内描画には進まない。
    if (rt.def.key === 'moribe' && !rt.over && !rt.choice && !this.introWaiting &&
        rt.player.u.alive && !rt.player.camShot && !this.bigmap) {
      if (this.drawBattleGoal(g, rt)) this.ovBlank = false;
    }
    if (!rt.over && !rt.choice && !this.introWaiting && rt.player.u.alive && !rt.player.camShot && !this.bigmap &&
        rt.def.drawMissionMarks?.(g, rt, this)) this.ovBlank = false;
    // 共通の頭上印と同じ一人だけ、具足の外周を太く縁取る。
    const enemy = !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap &&
      rt.player.u.alive && markedEnemy(rt);
    if (rt.def.key !== 'inou' && enemy && sightScreenUnit(rt, enemy)) {
      const frame = this.measurePersonFrame(enemy, rt);
      if (frame) { this.drawEnemyContour(g, rt, enemy, frame); this.ovBlank = false; }
    }
    // 本人の足元は兵が重なっても見える白い輪。行き先の旗とは形を分ける。
    if (this.drawPlayerSign(g, rt)) this.ovBlank = false;
    // 案内役は共通ピンの頭上の人型一つ。体の輪郭を別の人型に見せない。
    // 行き先は共通のピンに任せ、持ち場の輪や味方の旗を重ねて描かない。
    // 敵は頭上の赤い▼、武将の名と体力は field_signs.js。
    this.battleSignEnemy = null; this.enemyFrameShown = false;
  }

  // 兵の頭上の体力（近くの兵だけ）
  drawOverlay(rt) {
    if (pinGuideOn(rt)) { this.drawBattleNames(rt); return; }
    const pinOnly = pinGuideOn(rt);
    if (pinOnly !== this.pinOnly) { this.pinOnly = pinOnly; for (const n of PIN_OFF) { if (pinOnly) this[n] = off; else delete this[n]; } }
    const previousEnemyFrame = !!this.enemyFrameShown;
    this.enemyFrameShown = false;
    this.outlinedEnemy = null;
    this.enemyTouchShown = false;
    this.moveGestureDrawn = false;
    this.releaseGestureDrawn = false;
    this.defendedFlagDrawn = false;
    this.footDirectionDrawn = false;
    this.guardSymbolDrawn = false;
    this.battleGoalLabelDrawn = false;
    this.headingDrawn = false;
    if (this.flagDirectionEl) {
      this.flagDirectionEl.hidden = true;
      setCssVar(this.flagDirectionEl, 'display', 'none', 'important');
    }
    setClass($('objectives'), 'attached-destination', false);
    if (this.destinationDistanceLabel) this.destinationDistanceLabel.hidden = true;
    const cv = $('overlay');
    setClass(this.root, 'single-guide', singleBattleGuide(rt));
    // 写真モードでは頭上の名札・体力も消す
    if (this.root.classList.contains('photo')) { setClass($('objectives'), 'ground-order', false); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); this.ovBlank = true; return; }
    const W = VIEW.w, H = VIEW.h;
    // 通常の戦は自分の輪と相手の刀へ統一し、射程や照準の輪を重ねない。
    if (singleBattleGuide(rt) || rt.dodgeGuide || rt.missionGuide?.marker?.guideArea === 'guard') {
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
    }
    this.flagGuideDrawn = false;
    setClass(this.root, 'flag-guide', false);
    setClass(this.root, 'edge-destination', false);
    setClass(this.root, 'travel-guide', false);
    setClass($('objectives'), 'work-order', false);
    setClass(this.root, 'person-guide', !$('prompt').hidden && $('prompt').classList.contains('talk-target'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; this.ovBlank = true; }
    const g = cv.getContext('2d');
    // 前のコマに何も描かなかったなら、消す仕事も省く（携帯で画面いっぱいを毎コマ消すのは重い）
    if (!this.ovBlank) g.clearRect(0, 0, W, H);
    this.placeFrameShown = false;
    this.destinationDrawn = false;
    this.namedGoalDrawn = false;
    this.destinationStepDrawn = false;
    this.goalFlagDrawn = false;
    this.defenseAreaDrawn = false;
    setClass($('objectives'), 'defense-order', false);
    this.hudRects();
    this.teamSignsDrawn = false;
    this.battleCuesDrawn = false;
    if (pinOnly && !rt.over && !rt.choice && !this.introWaiting &&
        rt.player.u.alive && !rt.player.camShot && !this.bigmap) {
      this.battleCuesDrawn = this.drawBattleGoal(g, rt);
      this.battleCuesDrawn = this.drawNearbyTeamSigns(g, rt, rt.army.units) || this.battleCuesDrawn;
      this.ovBlank = false;
    }
    // 待つ間は本人の丸と既存の任務だけ。旗・向きの矢印・注意印を重ねない。
    if (this.quietWait && !rescueTarget(rt) && !rt.choice && !rt.over && !rt.dodgeGuide && !rainDanger(rt.army) && !retreatRequired(rt)) {
      setClass($('objectives'), 'ground-order', false);
      setClass($('objectives'), 'enemy-order', false);
      this.drawRainDrops(g, W, H, rt); this.drawBrim(g, W, H, rt);
      this.drawPlayerSign(g, rt);
      if (rt.def.nearbyTeamSignScale) this.drawNearbyTeamSigns(g, rt, rt.army.units);
      this.ovBlank = false;
      return;
    }
    if (dismountFirst(rt) || recovering(rt)) {
      setClass($('objectives'), 'ground-order', false);
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
      if (rt.dodgeRing) rt.dodgeRing.visible = false;
      let drew = this.drawPlayerSign(g, rt);
      // 下馬の釦は一つ。次に向かう場所だけを十字か旗で示す。
      if (dismountFirst(rt) && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !this.openingActive) {
        const cue = this.retreatGuide?.active && this.retreatGuide.valid ? this.retreatGuide : this.retreatDestination(rt, null);
        if (cue?.valid) {
          const pos = this.dismountDestination || (this.dismountDestination = { x:0, y:0, z:0 });
          pos.x = cue.x; pos.z = cue.z;
          pos.y = cue.y ?? groundAt(rt.world, cue.x, cue.z, rt.player.u.pos.y);
          const at = this.project(pos, pos.y + .18, rt, this.dismountProjection || (this.dismountProjection = {}));
          const visible = !at.behind && at.x > 48 && at.x < W - 48 && at.y > 100 && at.y < H - 80 && this.floorGoalVisible(rt, pos);
          const angle = this.destinationDirection(rt, pos);
          const x = visible ? at.x : Math.cos(angle) >= 0 ? W - 64 : 64;
          const y = visible ? at.y : H * .5;
          if (visible) this.drawTargetFootRing(g, rt, pos, cue.radius, false, true);
          if (cue.treatment) this.drawTreatmentCross(g, x, y);
          else this.drawSmallGoalFlag(g, x, y, .65, false, false, '');
          if (!visible) this.drawNavigationArrow(g, x, y + 24, angle, .6, true);
          drew = true;
        }
      }
      this.ovBlank = !drew && !this.battleCuesDrawn;
      return;
    }
    // なぞり始めは操作の一枚と、名前付きの自分・行き先に絞る。
    if (this.openingActive && this.opening?.el.classList.contains('opening-controls')) {
      this.drawNearbyTeamSigns(g, rt, rt.army.units);
      this.drawPlayerSign(g, rt);
      // 端の札と同じ旗形を実際の行き先に付け、操作の矢印と分ける。
      const opening = this.opening;
      if (opening.flagGround) {
        // 開幕も共通の行き先一つと、そのすぐ上の札を使う。
        this.drawNamedDestination(g, rt, opening.flagGround);
      }
      const origin = this.navigationTouchOrigin;
      if (isTouch && origin?.rt === rt && !origin.look) {
        this.moveGestureDrawn = true;
      }
      // 始まりの案内が描いた道と丸を使い、別の行き先の輪を重ねない。
      this.ovBlank = false;
      return;
    }
    if (!this.approachGuideEnemy?.alive || recovering(rt)) setClass($('objectives'), 'approach-order', false);
    let swipeDrawn = false;
    if (this.moveGuideEnemy?.alive && !rt.over && !rt.choice && !this.openingActive &&
        !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !retreatRequired(rt) &&
        !this.retreatGuide?.active && this.notices.sources[1].selected) {
      this.drawEnemyOutline(g, this.moveGuideEnemy, rt, true);
      this.drawEnemyMoveGesture(g, rt);
    }
    if (!$('objectives').classList.contains('facing-order') && !rt.over && !rt.choice && !rt.dodgeGuide && !this.retreatGuide?.active && !retreatRequired(rt) &&
        !rt.player.camShot && !this.bigmap && !this.openingActive && !S.reduceGuidance && !guidanceEnded(rt) &&
        rt.missionGuide?.objective === currentObjective(rt))
      swipeDrawn = this.drawDefenseArea(g, rt, rt.missionGuide);
    if (isTouch && $('objectives').classList.contains('facing-order') && this.notices.sources[1].selected &&
        !rt.over && !rt.choice && !this.openingActive && !rt.player.camShot && !this.bigmap && !S.reduceGuidance) {
      // 札は一行だけ。指と動く線は見回す側の操作面へ重ねる。
      const order = $('objectives');
      const sizeKey = `${order.textContent}|${W}|${H}|${S.textScale}`;
      if (this.facingOrderKey !== sizeKey) {
        this.facingOrderKey = sizeKey;
        this.facingOrderHeight = order.offsetHeight;
        this.facingOrderWidth = order.offsetWidth;
      }
      const width = this.facingOrderWidth, height = this.facingOrderHeight;
      const enemy = this.aimGuideEnemy || rt.def.waitFacingTarget?.(rt);
      this.drawFacingTarget(g, rt, enemy?.alive ? enemy.pos : rt.def.waitFacingPoint?.(rt));
      const frame = enemy?.alive && sightScreenUnit(rt, enemy) && this.measurePersonFrame(enemy, rt);
      const start = this.facingGestureOrigin || (this.facingGestureOrigin = {});
      // 向きを変える指は常に見回す操作面へ置く。敵の位置で始点を動かさない。
      const control = this.clearGestureOrigin(rt, this.facingSwipeRight ? 1 : -1, 0, true);
      start.x = control.x; start.y = control.y;
      const left = Math.max(12, Math.min(W - width - 12, start.x - width / 2));
      const top = Math.max(64, start.y - height - 32);
      if (frame) this.drawEnemyOutline(g, enemy, rt, true);
      setCssVar(order, '--facing-order-x', Math.round(left) + 'px');
      setCssVar(order, '--facing-order-y', Math.round(top) + 'px');
      swipeDrawn = this.drawRouteTurn(g, rt, this.facingSwipeRight, start) || swipeDrawn;
      this.footDirectionDrawn = true;
    }

    const movePoint = isTouch && touchMovePoint();
    if (movePoint && !this.openingActive && !rt.over && !rt.choice && !rt.player.camShot &&
        !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) && !rt.dodgeGuide &&
        !this.retreatGuide?.active && !retreatRequired(rt) && !rainDanger(rt.army) &&
        !this.aimGuideEnemy?.alive && !this.attackGuideEnemy?.alive && !rt.guideEnemyShown &&
        !$('objectives').classList.contains('facing-order')) {
      const cue = this.waitDestinationCue(rt, rt.missionGuide);
      if (this.releaseMoveActive && cue && !cue.outside && rt.player.u.moving > .05) {
        this.drawReleaseGesture(g, rt, movePoint.x, movePoint.y);
        swipeDrawn = true;
      }
    }

    // 向きを教える札を出した時は、長押しの釦が出ない場合も丸と旗を必ず結ぶ。
    const facingGuide = rt.missionGuide;
    if (isTouch && !this.defendedFlagDrawn && this.notices.sources[1].selected &&
        facingGuide?.distance < (facingGuide?.marker?.guideRadius || 8) &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active &&
        !this.openingActive && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !S.reduceGuidance &&
        !this.aimGuideEnemy?.alive && !rt.guideEnemyShown && !this.defendEnemy?.alive) {
      const facing = rt.def.waitFacingPoint?.(rt);
      if (facing) swipeDrawn = this.drawFootDirection(g, rt, facing) || swipeDrawn;
    }
    const aimEnemy = travelSignPriority(rt) || rescueTarget(rt) ? null : this.attackCueEnemy || this.aimGuideEnemy;
    if (aimEnemy?.alive && !rt.over && !rt.choice && !this.openingActive && !rt.player.camShot &&
        !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && sightScreenUnit(rt, aimEnemy) &&
        this.notices.sources[1].selected && !$('objectives').classList.contains('expand')) {
      const frame = this.measurePersonFrame(aimEnemy, rt);
      if (frame) {
        const order = $('objectives');
        setClass(order, 'ground-order', false); setClass(order, 'linked-destination', false);
        // 敵の札の指定は、相手を選び終えた後に一度だけ切り替える。
        setClass(this.root, 'guard-guide', false); setClass(this.root, 'melee-guide', false);
        rt.guideEnemy = aimEnemy; rt.guideEnemyShown = true; rt.guideEnemyDirection = false;
        this.placeFrameShown = false;
        this.drawNearbyTeamSigns(g, rt, rt.army.units);
        this.drawEnemyOutline(g, aimEnemy, rt, true);
        const enemyFrame = this.measurePersonFrame(aimEnemy, rt);
        const facingOrder = order.classList.contains('facing-order');
        setClass(order, 'enemy-order', !facingOrder && !!enemyFrame);
        if (enemyFrame && !facingOrder) {
          const key = order.className + '|' + order.textContent + '|' + W + '|' + H;
          if (this.enemyOrderKey !== key) {
            this.enemyOrderKey = key;
            this.enemyOrderW = order.offsetWidth; this.enemyOrderH = order.offsetHeight;
          }
          const width = this.enemyOrderW, height = this.enemyOrderH;
          const spot = rt.def.edgeCombatOrders && !singleBattleGuide(rt) ? this.combatOrderEdge(width, height) : this.enemyOrderSpot(enemyFrame, width, height, 60);
          setCssVar(order, '--enemy-order-move', `translate(${Math.round(spot.x)}px,${Math.round(spot.y)}px)`);
          if (order.classList.contains('enemy-move-help')) this.drawEnemyMoveGesture(g, rt);
          else {
            this.enemySwipeOrigin(rt, order, spot, key);
            this.drawGuideLink(g, enemyFrame.cx, Math.max(56, enemyFrame.top - 32),
              spot.x, spot.y, spot.x + width, spot.y + height, true, true);
          }
        }
        this.drawDefendedLocation(g, rt);
        this.drawGroundGuide(g, rt);
        const post = rt.missionGuide;
        if (post?.marker?.guideArea === 'guard') {
          const frame = rt.def.guardPostFrame?.(rt, post);
          if (frame) this.drawGuardPostFrame(g, rt, frame);
        }
        if (rt.lockRing) rt.lockRing.visible = false;
        if (rt.aimRing) rt.aimRing.visible = false;
        if (rt.reachRing) rt.reachRing.visible = false;
        this.drawRainDrops(g, W, H, rt); this.drawBrim(g, W, H, rt);
        this.drawPlayerSign(g, rt);
        this.ovBlank = false;
        return;
      }
    }
    const guideRects = this.personGuideRects || (this.personGuideRects = []); guideRects.length = 0;
    setClass($('objectives'), 'place-destination', !!rt.def.placeFrame?.(rt));
    // 戸口をたどる戦は、次に通る入口の矢印へまとめる。
    const routeDoor = rt.def.routeDestinationSight && rt.def.routeGuidePriority?.(rt) && rt.missionGuide?.marker?.id === 'next';
    let drew = (routeDoor ? false : this.drawPlaceFrame(g, rt)) || swipeDrawn;
    drew = this.drawDefendedLocation(g, rt) || drew;
    // 守備中は持ち場の境を残し、退く時は逃げ先の印だけを優先する。
    const holdGuide = rt.missionGuide?.objective === currentObjective(rt) ? rt.missionGuide : null;
    if (!this.defendedFlagDrawn && !retreatRequired(rt) && (holdGuide?.marker?.guideArea === 'guard' || !rt.guideEnemyShown && !this.defendEnemy) && (holdGuide?.marker?.guideArea === 'guard' || holdGuide?.marker?.waitAction &&
        holdGuide.distance < (holdGuide.marker.guideRadius || 8)) && !this.retreatGuide?.active && !rt.dodgeGuide &&
        (!this.coverEl || this.coverEl.hidden) && !S.reduceGuidance && !guidanceEnded(rt) &&
        !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap) {
      const hold = holdGuide.marker.guideDestination?.() || holdGuide.pos;
      if (hold) {
        const pressAtPost = isTouch && this.waitGuardButton && !this.waitGuardButton.hidden &&
          this.waitGuardButton.classList.contains('ground-hold');
        if (!pressAtPost && holdGuide.marker.guideArea !== 'wait' && (holdGuide.marker.guideArea !== 'guard' || !rt.def.compactGuardArea || this.openingActive))
          this.drawDestinationArea(g, rt, hold, holdGuide.marker.guideRadius || 8, false);
        if (holdGuide.marker.guideArea === 'guard') this.drawGuardPost(g, rt, holdGuide);
        else if (!holdGuide.marker.guideDefend && this.waitGuardButton?.disabled && holdGuide.distance < (holdGuide.marker.guideRadius || 8)) this.drawTargetFootRing(g, rt, hold);
        // 長押し中も、任務札の代わりに守る場所の旗を残す。
        if (!this.root.classList.contains('wait-guard-active') && this.openingActive && !this.opening?.flagGround) this.drawSingleDestination(g, rt, hold, holdGuide.marker);
        drew = true;
      }
    }
    if (this.openingActive && this.opening?.talkPerson?.alive) {
      drew = this.drawTalkPerson(g, rt, this.opening.talkPerson) || drew;
    }
    if (this.openingActive && this.opening?.flagGround) {
      const opening = this.opening;
      this.drawNamedDestination(g, rt, opening.flagGround);
      drew = true;
    }
    if (rt.dodgeGuide?.valid && !rt.dodgeGuide.rain && !rt.over && !rt.choice &&
        !this.openingActive && !rt.player.camShot && !this.bigmap) {
      const cue = rt.dodgeGuide;
      if (isTouch && cue.gestureShown) {
        // なぞる始点と終点は操作の一組だけで示す。
        drew = true;
      } else if (cue.onScreen) {
        this.drawReturnDestination(g, cue.markX, cue.markY);
        if (!cue.arrived) this.drawRetreatRoute(g, rt, cue.markX, cue.markY);
        drew = true;
      } else if (!cue.arrived && !S.reduceGuidance) {
        const foot = this.project(rt.player.u.pos, rt.player.u.pos.y + .08, rt,
          this.dodgeFootProjection || (this.dodgeFootProjection = {}));
        drew = this.drawDirectionChain(g, foot.behind ? W / 2 : foot.x, foot.behind ? H - 32 : foot.y,
          cue.markX, cue.markY, true, rt.def.retreatArrowLength) || drew;
      }
    }
    if (rt.touchMoveGoal && rt.touchSwipeActive && !rt.missionGuide?.marker && !this.retreatGuide?.active && !this.openingActive && !rt.dodgeGuide && !rt.over && !rt.choice &&
        !rt.player.camShot && !this.bigmap && !S.reduceGuidance) {
      const foot = this.project(rt.player.u.pos, rt.player.u.pos.y + .08, rt,
        this.swipeFootProjection || (this.swipeFootProjection = {}));
      const goal = this.project(rt.touchMoveGoal, rt.touchMoveGoal.y ?? groundAt(rt.world, rt.touchMoveGoal.x, rt.touchMoveGoal.z, rt.player.u.pos.y), rt,
        this.swipeGoalProjection || (this.swipeGoalProjection = {}));
      if (!foot.behind && !goal.behind) {
        // 画面外の行き先は端に収め、矢印だけを途中で切らない。
        const dx = goal.x - foot.x, dy = goal.y - foot.y;
        let scale = 1;
        if (dx > 0) scale = Math.min(scale, (W - 48 - foot.x) / dx);
        else if (dx < 0) scale = Math.min(scale, (48 - foot.x) / dx);
        if (dy > 0) scale = Math.min(scale, (H - 32 - foot.y) / dy);
        else if (dy < 0) scale = Math.min(scale, (100 - foot.y) / dy);
        if (scale > 0 && Math.hypot(dx, dy) * scale >= 40) {
          const x = foot.x + dx * scale, y = foot.y + dy * scale;
          this.drawSwipeArrow(g, foot.x, foot.y, x, y);
          if (!isTouch) this.drawMoveGoal(g, rt, x, y);
          drew = true;
        }
      }
    }
    // 目的の人の足元と札を結び、近づく相手を示す。
    for (const el of this.markerEls.values()) if (!S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('danger-notice') && !el.hidden && el.classList.contains('person-goal') && !el.classList.contains('edge') && el._tipX != null) {
      if (el._person?.alive && !el._talk) this.drawTargetFootRing(g, rt, el._person.pos);
      if (!el._talk) this.drawGuideLink(g, el._tipX, el._tipY, el._px - el._ow / 2, el._py - el._oh, el._px + el._ow / 2, el._py, true);
      drew = true;
    }
    // 札の枠が埋まっても、今話す相手の吹き出しは消さない。新しい札は増やさない。
    const talkGuide = rt.missionGuide?.objective === currentObjective(rt) && rt.missionGuide?.marker;
    const talkPerson = talkGuide?.guideTalk && talkGuide.guidePerson?.();
    if (talkPerson?.alive && !retreatRequired(rt) && !this.retreatGuide?.active && !S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !this.root.classList.contains('danger-notice') && (!this.root.classList.contains('talk-ready') || !$('prompt').classList.contains('talk-target'))) {
      drew = this.drawTalkGuide(g, rt, talkPerson) || drew;
    } else {
      if (talkPerson?.alive && this.root.classList.contains('talk-ready') && $('prompt').classList.contains('talk-target') &&
          !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide && !S.reduceGuidance &&
          !guidanceEnded(rt) && !retreatRequired(rt) && !this.retreatGuide?.active && this.talkPersonVisible(rt, talkPerson)) {
        const frame = this.measurePersonFrame(talkPerson, rt, true);
        if (frame) { this.drawTalkFocus(g, frame, rt, talkPerson); drew = true; }
      }
      setClass($('objectives'), 'talk-order', false);
      setClass(this.root, 'talk-edge', false);
      setClass(this.root, 'talk-located', false);
    }
    // 構える相手の印と、自分の足元からの向きを同じ相手へそろえる。
    const cam = rt.camera.position;
    const zoom = 1;
    const namesPut = [];
    // 所属の札と武将名が同じ兵の上に重ならないよう、その場所を先に空ける。
    if (this.fieldMarkBounds && !this.fieldMarkBox?.hidden) {
      for (const bounds of this.fieldMarkBounds) if (bounds[2]) namesPut.push(bounds);
    }
    // 近い兵の候補は 0.1 秒に一度だけ選び直す（毎コマ全兵を回さない。遠い兵・倒れた兵・寝ている兵は外す）
    const P = rt.player;
    const incoming = this.guardThreat || (!this.waitGuardButton?.hidden && this.defendEnemy);
    let dangerSign = false;
    const missionGuard = rescueTarget(rt) || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
    setClass(this.root, 'guard-guide', false);
    setClass(this.root, 'melee-guide', false);
    const blockingEnemy = navigationEnemy(rt);
    let focus = this.attackGuideEnemy?.alive ? this.attackGuideEnemy : !this.guardAlly && this.defendEnemy?.alive ? this.defendEnemy : blockingEnemy || (P.lock?.alive ? P.lock : P.aimed?.alive ? P.aimed : null);
    const nowT = rt.t || 0;
    // 画面へ戻った兵だけは候補の選び直しを待たず、そのコマで札を戻す。
    let entered = false;
    for (const u of this.ovOffscreen || []) if (!u.offscreen) { entered = true; break; }
    if (!this.ovCand || this.ovRt !== rt || entered || nowT - this.ovAt >= 0.1 || nowT < this.ovAt) {
      this.ovRt = rt; this.ovAt = nowT; const cand = this.ovCand || (this.ovCand = []); cand.length = 0;
      const offscreen = this.ovOffscreen || (this.ovOffscreen = []); offscreen.length = 0;
      for (const u of rt.army.units) {
        if (u.offscreen) { offscreen.push(u); continue; }
        if (!u.alive || u.isPlayer || u.civ || u.isStruct || u.noTarget || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
        if (Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) <= (u.team !== P.u.team || u.name && !u.isSub && u.type === 'busho' ? 56 : 30)) cand.push(u);
      }
      // 狙う相手を先にし、ほかは自分に近い兵から示す。
      const pos = P.u.pos;
      cand.sort((a, b) => a === focus ? -1 : b === focus ? 1 : a === this.guardAlly ? -1 : b === this.guardAlly ? 1 :
        (a.pos.x - pos.x) ** 2 + (a.pos.z - pos.z) ** 2 - (b.pos.x - pos.x) ** 2 - (b.pos.z - pos.z) ** 2);
    }
    // 到着して戦う時は、見える敵一人を頭上の印で示す。生きて見える間は印を移さない。
    const fightingTask = !!combatTask(rt) || /倒せ|たおせ|たおす|討ち取|崩せ|敵.*止め|敵.*押し返|引きつけ|引き付け|戦う/.test(taskText(rt, taskLabel(rt, currentObjective(rt)?.text || '')));
    const movingToFlag = travelSignPriority(rt) || !blockingEnemy && !this.defendEnemy && !!rt.missionGuide?.marker && /旗|組の列/.test(rt.missionGuide.label) &&
      rt.missionGuide.distance >= (rt.missionGuide.marker.guideRadius || 8) && !fightingTask;
    const objectiveEnemies = rt.def.objectiveEnemies?.(rt) || null;
    const retreating = !missionGuard && !blockingEnemy && !this.defendEnemy && !!rt.def.routeGuidePriority?.(rt) || !!rt.dodgeGuide || !!(this.coverEl && !this.coverEl.hidden) || retreatRequired(rt) ||
      !!(this.retreatGuide?.active && this.retreatGuide.valid) || rt.missionGuide?.marker?.guideArea === 'retreat';
    const approachingEntrance = !!rt.missionGuide?.marker?.entrance && !fightingTask;
    const inPlace = !!blockingEnemy || !!this.defendEnemy || !approachingEntrance && !movingToFlag && (!!missionGuard || fightingTask || !rt.missionGuide?.marker || rt.missionGuide.distance < 8);
    const canGuide = u => !movingToFlag && u?.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
      u.team !== P.u.team && !u.group?.hidden &&
      rt.def.enemyGuideAllowed?.(rt, u) !== false &&
      (u === blockingEnemy || u === this.defendEnemy || !objectiveEnemies?.length || objectiveEnemies.includes(u)) &&
      Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) < 18;
    const melee = P.weapon !== 'gun' && P.weapon !== 'bow';
    // 遠い敵は小さな囲みにせず、通れる向きを一本だけ示す。
    const canPoint = u => canGuide(u) && (!melee || u === this.approachGuideEnemy || objectiveEnemies?.includes(u) ||
      Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) <= 9) && (melee ? this.combatEnemyVisible(rt, u) : sightScreenUnit(rt, u));
    const previousEnemy = rt.guideEnemy;
    let hiddenEnemy = null;
    // 護衛中も、本人が狙っている敵の目印を主君の盾で消さない。
    const chosenEnemy = canPoint(P.lock) ? P.lock :
      canPoint(this.approachGuideEnemy) ? this.approachGuideEnemy :
      !canPoint(rt.guideEnemy) && focus === P.aimed && canPoint(focus) ? focus : null;
    const guardingCombat = !!missionGuard && !rescueTarget(rt) && !rt.def.routeGuidePriority?.(rt);
    if ((!missionGuard || guardingCombat || this.attackGuideEnemy || chosenEnemy) && !retreating && inPlace && (!this.guardAlly || guardingCombat || this.attackGuideEnemy || chosenEnemy) && !rt.over && !P.camShot && !this.openingActive) {
      if (chosenEnemy) rt.guideEnemy = chosenEnemy;
      if (this.defendEnemy) rt.guideEnemy = canPoint(this.defendEnemy) ? this.defendEnemy : null;
      else if (canPoint(blockingEnemy)) rt.guideEnemy = blockingEnemy;
      if (!this.defendEnemy && !canPoint(rt.guideEnemy)) {
        rt.guideEnemy = null;
        for (const u of this.ovCand) if (canPoint(u)) { rt.guideEnemy = u; break; }
      }
      if (!this.defendEnemy && focus === P.lock && canPoint(focus)) rt.guideEnemy = focus;
      if (!rt.guideEnemy) hiddenEnemy = this.defendEnemy ? canGuide(this.defendEnemy) ? this.defendEnemy : null : canGuide(previousEnemy) ? previousEnemy : canGuide(focus) ? focus : null;
      if (!this.defendEnemy && !rt.guideEnemy && !hiddenEnemy) {
        for (const u of this.ovCand) if (canGuide(u) && sightUnit(rt, u) && (!u.isOfficer || enemyKnown(rt, u))) { hiddenEnemy = u; break; }
      }
      focus = rt.guideEnemy || hiddenEnemy || focus;
    } else { rt.guideEnemy = null; if (singleBattleGuide(rt)) focus = null; }
    if (movingToFlag) { rt.guideEnemy = null; hiddenEnemy = null; focus = null; }
    // 一度示した敵が隠れたら、姿を囲まず通れる方向だけを示す。
    // 相手が隠れた時は、任務の道があればその戸口へ戻す。
    if (hiddenEnemy && rt.missionGuide?.marker && !this.defendEnemy) { hiddenEnemy = null; focus = rt.guideEnemy; }
    rt.guideEnemyDirection = !!hiddenEnemy;
    if (hiddenEnemy) {
      rt.guideEnemy = hiddenEnemy;
      const next = rt.world.def.guideWay?.(P.u, hiddenEnemy.pos) || hiddenEnemy.pos;
      this.drawOffscreenDirection(g, rt, next, 'enemy'); drew = true;
      setClass(this.root, 'melee-guide', melee);
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
    }
    // 迫る敵と攻撃相手の印を別々に描かず、選び終えた一人へそろえる。
    if (!focus && canPoint(incoming) && !retreating && !movingToFlag) focus = incoming;
    if (focus === incoming && focus?.alive && !rt.over && !rt.choice && !this.openingActive &&
        !P.camShot && !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) && !retreating &&
        sightScreenUnit(rt, focus)) {
      this.drawEnemyOutline(g, focus, rt, true);
      drew = true; dangerSign = true;
    }
    rt.guideEnemyShown = false;
    const quietBattle = this.root.classList.contains('combat-three') || !rt.def.town && !rt.def.dojo && !P.showSquad;
    let allySigns = 0, enemySigns = 0;
    const signSpots = this.signSpots || (this.signSpots = []); signSpots.length = 0;
    const protectedAlly = missionGuard || this.guardAlly;
    const measuredGuard = protectedAlly?.alive ? this.measurePersonFrame(protectedAlly, rt) : null;
    const guardFrame = measuredGuard ? Object.assign(this.guardSignFrame || (this.guardSignFrame = {}), measuredGuard) : null;
    this.hudRects();
    drew = this.drawNearbyTeamSigns(g, rt, this.ovCand) || drew;
    drew = this.drawPassageGuides(g, rt) || drew;
    const nameSlots = Math.max(0, 3 - 1 - this.notices.picks.length - Number(!!this.battleGoalLabelDrawn) -
      Number(!!this.prog && !this.prog.hidden) - Number(!$('boss').hidden) -
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')));
    for (const u of this.ovCand) {
      if (rescueTarget(rt) || protectedAlly?.alive && u !== focus) continue;
      // 開幕は目的地の輪と短い札にまとめ、離れた顔や青旗を重ねない。
      if (this.openingActive) continue;
      // 逃げる間は行き先一つだけを残し、敵味方の旗や刀を重ねない。
      if (rt.dodgeGuide || this.retreatGuide?.active && this.retreatGuide.valid || retreatRequired(rt)) continue;
      // 会話相手の名前は吹き出しと一組にし、通常の名札を重ねない。
      if (u === talkPerson && !S.reduceGuidance && !guidanceEnded(rt)) continue;
      // 普段の合戦では対象一人の囲みだけを残す。人数や戦い方は変えない。
      //   武将と名のある侍の名は、普段の合戦でも出す（kaito 10/23「武将の名前が出ていない」）。
      if (quietBattle && u !== focus && !(this.pinOnly && u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai'))) continue;
      // 小さな形だけを両軍六人まで。近い味方だけで敵の印を使い切らない。
      if (u !== focus && (u.team === P.u.team ? allySigns : enemySigns) >= 6) continue;
      // 守る相手は下で大きな盾だけを示し、ほかの印や名を重ねない。
      if ((retreating || this.root.classList.contains('wait-guard-active')) && u.team === P.u.team || u === this.guardAlly || u === missionGuard || u === hiddenEnemy) continue;
      // 普段の戦は選んだ敵一人だけ。組の詳しい表示では味方の印も残す。
      if (u.offscreen || !u.alive || u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      const knownGeneral = !!u.name && !u.isSub && u.type === 'busho';
      if (d > (u === focus && objectiveEnemies?.includes(u) ? 56 : knownGeneral ? 48 : 26) || !u.mesh.visible) continue;
      // 要る時だけ出す：敵は戦っている相手・狙っている相手、味方は傷ついた者（Alt で組を全部）
      // 敵の棒は、狙っている相手・自分に打ちかかる相手・すぐそばで打たれた相手だけ（遠くの斬り合いの棒が横一列に並ばないように）
      const fighting = P.lock === u || P.aimed === u || (u.target && u.target.isPlayer && d < 10) || (u.lastHitT < 3 && d < 7);
      // 味方の棒と名は、深手（六割を切った）の時だけ（乱戦で組の名が並ばないように。Alt で全部）
      const hurt = u.hp < u.maxHp * 0.6 && u.lastHitT < 10;
      // 武将（busho・名のある者）は、敵も味方も近ければ（18m 以内）いつも棒を出す（大将の傷み具合が戦の流れを決めるので）
      const showBar = !quietBattle && u.team === 0 && (hurt || (P.showSquad && u.isSub));
      // 組の者の名は、傷ついた時と Alt の時だけ（いつも出すと戦場が字だらけになる）
      // 名は名のある者だけ。名の無い侍・武将は狙った時と Alt の時だけ「侍」「武将」と出す（戦場を字で埋めない）
      let named = !quietBattle && u.team === 0 && d < 18 && !(u.isSub && !u.kerai && !hurt && !P.showSquad) && (u.name || ((u.type === 'samurai' || u.type === 'busho') && (P.lock === u || P.aimed === u || P.showSquad)));
      if (rt.def.singleEnemyPursuitSign && u === focus) named = false;
      // 最小のスマホ横：名は狙っている相手と、名のある武将（busho）だけ
      if (named && leanHud() && !(u.kerai || P.lock === u || P.aimed === u || (u.type === 'busho' && u.name))) named = false;
      // 遠目は家紋、中ほどは兜と顔、間近で名を読む。狙った相手の名は残す。
      if (knownGeneral && d >= 9 && P.lock !== u && P.aimed !== u && !this.pinOnly) named = false;
      // 武将と名のある侍は、敵も味方も頭上に名だけを小さく（旗の印は出さない。kaito 10/23 稲生 5）。
      if (this.pinOnly && u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai') && d < 40 && !u.fleeing) named = true;
      const crest = !this.pinOnly && !quietBattle && u.team === 0 && knownGeneral && d >= 22 && d < 48;
      // 剣や盾は選んだ相手一人だけ。周りの兵には追加しない。
      const ally = u.team === P.u.team, missionEnemy = !!objectiveEnemies?.includes(u), selected = (!missionGuard || guardingCombat || u === this.attackGuideEnemy || u === chosenEnemy) && !retreating && (!this.guardAlly || guardingCombat || u === this.attackGuideEnemy || u === chosenEnemy) && u === focus && !movingToFlag;
      const teamSign = selected && !rt.over && !rt.def.town && !rt.def.dojo && !P.camShot && !this.openingActive &&
        !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - P.u.pos.x, u.pos.z - P.u.pos.z) <= 22;
      if (!showBar && !named && !crest && !teamSign) continue;
      // 出す物が決まった者だけ、見えるか・画面のどこかを調べる（乱戦で何十人を毎コマ投影しない）
      if (knownGeneral && !enemyKnown(rt, u)) continue;
      if (knownGeneral && rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, u.pos)) continue;
      if (!(ally ? sightUnit(rt, u) : sightScreenUnit(rt, u))) continue;
      // 敵の札は実際の頭に合わせる。背丈や馬の高さで別の兵へずらさない。
      const head = !rt.def.positionPersonGuide && (selected || missionEnemy) && !ally && u.human?.root.visible && u.human.bones?.Head;
      if (head) { head.getWorldPosition(this.tmpV); this.tmpV.y += .35; }
      else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.3 : rt.def.bodyHeightGuides ? (u.bodyHeight ?? 1.72) + .3 : 2.35), u.pos.z);
      this.tmpV.project(rt.camera);
      const s = { x: (this.tmpV.x * .5 + .5) * W, y: (-this.tmpV.y * .5 + .5) * H, behind: this.tmpV.z > 1 || this.tmpV.z < -1 };
      if (s.behind || !selected && (s.x < 0 || s.x > W || s.y < 0 || s.y > H)) continue;
      // 札や指の丸の上には描かない（重ねて読めなくしない）
      const blocked = (this.rectsAll || []).some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 16 && s.y < r.bottom + 4);
      if (blocked && !named && !selected) continue;
      // 盾と本人の上には敵の印や名を重ねない。敵の人数や動きには触れない。
      if (!selected && guardFrame && s.x > guardFrame.left - 38 && s.x < guardFrame.right + 38 &&
          s.y > guardFrame.top - 100 && s.y < guardFrame.bottom + 16) continue;
      // 相手の形は札の枚数や頭上の空きに左右されず示す。言葉は任務の札一枚へまとめる。
      if (teamSign && (selected || !blocked && s.x >= 20 && s.x <= W - 20 && s.y >= 44 && s.y <= H - 24 &&
          !(this.rectsAll || []).some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 3 && s.y < r.bottom + 37))) {
        // 選んだ相手は頭上の大きな印と足元の輪で示す。
        const sx = s.x, sy = s.y - 16;
        let overlap = false;
        for (let i = 0; i < signSpots.length; i += 2) if (Math.abs(signSpots[i] - sx) < 24 && Math.abs(signSpots[i + 1] - sy) < 24) { overlap = true; break; }
        if (!selected && overlap) continue;
        signSpots.push(sx, sy);
        g.save(); g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
        if (!(dangerSign && u === incoming)) {
          if (ally) this.drawAllySign(g, sx, sy);
          else if (!ally && !selected) {
            this.drawEnemySign(g, sx, sy);
          }
        }
        if (ally) allySigns++; else enemySigns++;

        if (selected && !ally) {
          if (this.pinOnly) {
            const headFrame = this.measurePersonFrame(u, rt);
            if (headFrame) this.drawEnemyHeadPointer(g, headFrame, rt, u, false);
          }
          // 狙う一人の姿を空け、操作は既存の札へまとめる。
          if (rt.def.hidePlayerSign && !rt.def.hideDefenseArea && u === this.defendEnemy && !this.attackGuideEnemy && !this.approachGuideEnemy) {
            const area = this.defendArea || (this.defendArea = { x:0, y:0, z:0 });
            if (this.defendAreaEnemy !== u || this.defendAreaRt !== rt || !P.guard) {
              area.x = P.u.pos.x; area.y = P.u.pos.y; area.z = P.u.pos.z;
              this.defendAreaEnemy = u; this.defendAreaRt = rt;
            }
            this.drawDestinationArea(g, rt, area, 1.5, false, false, true);
          }
          // 守備中も敵の足元を示す。攻撃の押し方は向きが合ってから示す。
          if (!dangerSign || u !== incoming) this.drawEnemyOutline(g, u, rt, u === this.defendEnemy && !this.attackGuideEnemy);
          if (rt.lockRing) rt.lockRing.visible = false;
          if (rt.aimRing) rt.aimRing.visible = false;
          if (rt.reachRing) rt.reachRing.visible = false;
          setClass(this.root, 'melee-guide', P.weapon !== 'gun' && P.weapon !== 'bow');
          const body = this.enemyBodyRect || (this.enemyBodyRect = {});
          const frame = this.measurePersonFrame(u, rt);
          body.left = frame ? frame.left - 6 : s.x - 32;
          body.right = frame ? frame.right + 6 : s.x + 32;
          body.top = frame ? frame.top - 6 : s.y;
          body.bottom = frame ? frame.bottom + 6 : s.y + 74;
          guideRects.push(body);
          if (u === rt.guideEnemy && s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H) rt.guideEnemyShown = true;
        }
        g.restore(); drew = true;

      }
      if (crest) {
        const cx = s.x, cy = s.y - 12;
        if (namesPut.length >= nameSlots || namesPut.some((q) => Math.abs(q[0] - cx) < (q[2] + 24) / 2 + 12 && Math.abs(q[1] - cy) < 24)) continue;
        const gen = GENERALS[u.name.replace(/^.* /, '')];
        const mon = gen?.mon || FACTION[u.group?.faction]?.flag || (u.team === 0 ? rt.def.sides?.a?.mon : rt.def.sides?.b?.mon);
        if (!mon) continue;
        namesPut.push([cx, cy, 24]); drew = true;
        g.globalAlpha = Math.min(0.85, (48 - d) / 8);
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(cx - 13, cy - 13, 26, 26);
        g.drawImage(monIcon(mon), cx - 11, cy - 11, 22, 22);
        g.globalAlpha = 1;
        continue;
      }
      const k = Math.max(0.45, Math.min(1.2, 9 / d));
      const w = 34 * k, h = Math.max(3, 4 * k);
      const x = s.x / zoom - w / 2, y = s.y / zoom;
      // 戦わない者（逃げる町の者など：noTarget で打ちかからない）は、敵の赤でなく褪せた土色にする
      const civil = u.team !== 0 && u.noTarget && !(u.dmg > 0);
      const col = civil ? '#b3a58a' : u.team !== 0 ? (S.colorAssist ? '#ff9a1a' : '#d24a30') : u.isSub ? '#efe6cf' : (S.colorAssist ? '#4fc3f7' : '#4f7fca');
      const alpha = Math.min(1, (26 - d) / 6) * (u.lastHitT < 2 || u.team === 0 ? 1 : 0.7);
      g.globalAlpha = alpha;
      if (showBar && !blocked) {
        drew = true;
        // 敵は▼を添えた太い棒、味方は細い棒（色だけに頼らず形でも分ける）
        const hh = u.team !== 0 ? h : Math.max(2, h * 0.55);
        g.fillStyle = 'rgba(0,0,0,.7)';
        g.fillRect(x - 1, y - 1, w + 2, hh + 2);
        g.fillStyle = col;
        g.fillRect(x, y, w * (u.hp < u.maxHp * 0.35 ? 0.25 : 0.6), hh);

        // 乱戦で敵味方が入り混じる時のため：本人に斬りかかっている敵だけ、足元に薄い赤の輪（色だけでなく形でも、いつでも出す）
        if (u.team !== 0 && !civil && fighting) {
          const fp = this.project(u.pos, u.pos.y + 0.05, rt);
          if (!fp.behind) {
            g.globalAlpha = alpha * 0.55;
            g.strokeStyle = S.colorAssist ? '#ff9a1a' : '#e2472c';
            g.lineWidth = 2;
            g.beginPath(); g.ellipse(fp.x, fp.y, 12 * k, 4 * k, 0, 0, Math.PI * 2); g.stroke();
            g.globalAlpha = alpha;
          }
        }
      }
      if (named && namesPut.length < nameSlots) {
        // 名の字は 12px を下回らない（読めない字は置かない）
        g.font = `${Math.max(12, Math.round(11 * k * 1.1))}px "Shippori Mincho B1", serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)';
        const label = u.name || (u.type === 'busho' ? '武将' : '侍');
        // 先に書いた名と重なるなら書かない（字が重なって読めなくならないように）
        const lw = g.measureText(label).width, lx = s.x / zoom, ly = y - 3;
        // 任務の札に名の端が掛かった時も描かない。薄い字を透かして重ねない。
        if ((this.rectsAll || []).some((r) => lx + lw / 2 + 4 > r.left && lx - lw / 2 - 4 < r.right && ly + 4 > r.top && ly - 18 < r.bottom)) continue;
        if (namesPut.some((q) => Math.abs(q[0] - lx) < (q[2] + lw) / 2 + 12 && Math.abs(q[1] - ly) < 18)) continue;
        namesPut.push([lx, ly, lw]); drew = true;
        g.fillText(label, s.x / zoom + 1, y - 3 + 1);
        g.fillStyle = u.team !== 0 ? '#ffd0c4' : '#f3e6c4';
        g.fillText(label, s.x / zoom, y - 3);
      }
    }
    g.globalAlpha = 1;
    // 同じコマで選んだ相手を見て、待つ印と敵の印を重ねない。
    drew = this.drawGroundGuide(g, rt) || drew;
    drew = this.drawDefenseLine(g, rt) || drew;
    // 「この敵」の札は既存の任務一枚を移し、知らせの数を増やさない。
    const order = $('objectives');
    const captionEnemy = this.outlinedEnemy || (rt.guideEnemyShown && rt.guideEnemy);
    const enemyFrame = !this.defendedFlagDrawn && !this.root.classList.contains('wait-guard-active') && !missionGuard && !order.classList.contains('facing-order') &&
      captionEnemy?.alive && !rt.def.town && !rt.def.dojo &&
      this.notices.sources[1].selected && !order.classList.contains('expand') ?
      this.measurePersonFrame(captionEnemy, rt) : null;
    // 同じ敵を示す間は外して付け直さず、携帯の配置計算を増やさない。
    setClass(order, 'enemy-order', !!enemyFrame);
    if (enemyFrame && !this.root.classList.contains('attack-button-guide')) {
      const frame = enemyFrame;
      setClass(order, 'travel-retreat', false);
      const key = order.className + '|' + order.textContent + '|' + W + '|' + H;
      if (this.enemyOrderKey !== key) {
        this.enemyOrderKey = key;
        this.enemyOrderW = order.offsetWidth; this.enemyOrderH = order.offsetHeight;
      }
      const width = this.enemyOrderW, height = this.enemyOrderH;
      const spot = rt.def.edgeCombatOrders && !singleBattleGuide(rt) ? this.combatOrderEdge(width, height) : this.enemyOrderSpot(frame, width, height, 60);
      setCssVar(order, '--enemy-order-move', `translate(${Math.round(spot.x)}px,${Math.round(spot.y)}px)`);
      if (order.classList.contains('enemy-move-help')) this.drawEnemyMoveGesture(g, rt);
      else {
        this.enemySwipeOrigin(rt, order, spot, key);
        this.drawGuideLink(g, frame.cx, Math.max(56, frame.top - 32),
          spot.x, spot.y, spot.x + width, spot.y + height, true, true);
      }
    }
    const approach = movingToFlag ? null : this.approachGuideEnemy;
    const approachFrame = !this.defendedFlagDrawn && !enemyFrame && !rt.def.keepApproachTaskPanel && approach?.alive && this.notices.sources[1].selected && (!this.actionLabel?.hidden || !!combatTask(rt)) &&
      !order.classList.contains('expand') && !rt.over && !rt.choice && !this.openingActive && !P.camShot &&
      !this.bigmap && !S.reduceGuidance && !guidanceEnded(rt) ? this.measurePersonFrame(approach, rt, true) : null;
    if (approachFrame && !order.classList.contains('approach-order')) this.approachOrderKey = null;
    setClass(order, 'approach-order', !!approachFrame);
    if (approachFrame) {
      const key = order.className + '|' + order.textContent + '|' + W + '|' + H;
      if (this.approachOrderKey !== key) {
        this.approachOrderKey = key;
        this.approachOrderW = order.offsetWidth; this.approachOrderH = order.offsetHeight;
      }
      const width = this.approachOrderW, height = this.approachOrderH;
      const spot = rt.def.edgeCombatOrders && !singleBattleGuide(rt) ? this.combatOrderEdge(width, height) : this.enemyOrderSpot(approachFrame, width, height, 60);
      setCssVar(order, '--enemy-order-move', `translate(${Math.round(spot.x)}px,${Math.round(spot.y)}px)`);
      if (order.classList.contains('enemy-move-help')) this.drawEnemyMoveGesture(g, rt);
      else this.enemySwipeOrigin(rt, order, spot, key);
      // 曲がり道では旗へ進む道筋も残す。
      const way = this.approachClear?.enemy === approach && this.approachClear.bend ? this.approachClear.way : null;
      if (way) {
        const playerFoot = this.project(P.u.pos, P.u.pos.y + .08, rt,
          this.approachPlayerProjection || (this.approachPlayerProjection = {}));
        const bend = this.project(way, groundAt(rt.world, way.x, way.z, P.u.pos.y) + .08, rt,
          this.approachBendProjection || (this.approachBendProjection = {}));
        if (!bend.behind && !playerFoot.behind)
          this.drawDirectionChain(g, playerFoot.x, playerFoot.y, bend.x, bend.y, true, rt.def.meleeApproachArrowLength ?? 72);
      }
      drew = true;
    }
    // 同じ動作の説明は最初の三秒だけ。相手が替わっても点滅させない。
    // 携帯の操作釦・展開した任務・危険時の案内は隠さない。
    const compactOrder = rt.def.transientCombatOrders && !!(enemyFrame || approachFrame)
      && !retreating && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt)
      && !order.classList.contains('expand');
    const orderKind = compactOrder ? (this.aimGuideEnemy ? 'aim' : this.approachGuideEnemy ? 'approach' :
      this.attackGuideEnemy ? 'attack' : 'defend') + ':' + P.weapon + ':' + Number(!!P.guard) : '';
    if (this.combatOrderRt !== rt || this.combatOrderKind !== orderKind) {
      this.combatOrderRt = rt; this.combatOrderKind = orderKind; this.combatOrderAt = rt.t;
    }
    setClass(order, 'combat-order-quiet', !!compactOrder && rt.t - this.combatOrderAt > 3.2
      && !order.querySelector('button:not([disabled])'));
    const guard = retreating ? null : missionGuard || (!rt.guideEnemyShown ? this.guardAlly : null);
    // 本人が見える間は輪郭と短い言葉、隠れた時だけ移動の矢印を示す。
    if (guard?.alive && rt.def.guardGuideAllowed?.(rt) !== false && !S.reduceGuidance && !rt.over && !rt.choice && !P.camShot &&
        !this.bigmap && !this.openingActive && !$('objectives').classList.contains('expand')) {
      const helping = rescueTarget(rt) === guard;
      const frame = this.measurePersonFrame(guard, rt, true);
      const s = this.project(guard.pos, guard.pos.y + (guard.mounted ? 3.3 : 2.35), rt);
      if (frame) { s.x = frame.cx; s.y = frame.top - 6; }
      const off = !frame || !sightScreenUnit(rt, guard) || s.behind || s.x < 28 || s.x > W - 28 || s.y < 48 || s.y >= H - 24;
      if (rt.lockRing) rt.lockRing.visible = false;
      if (rt.aimRing) rt.aimRing.visible = false;
      if (rt.reachRing) rt.reachRing.visible = false;
      if (off) {
        const next = rt.world.def.guideWay?.(P.u, guard.pos) || guard.pos;
        rt.camera.getWorldDirection(this.tmpV);
        const angle = Math.atan2(next.x - P.u.pos.x, next.z - P.u.pos.z) - Math.atan2(this.tmpV.x, this.tmpV.z);
        s.x = Math.max(28, Math.min(W - 28, W / 2 - Math.sin(angle) * (W / 2 - 40)));
        s.y = Math.max(80, Math.min(H - 64, H / 2 - Math.cos(angle) * (H / 2 - 80)));
      }
      // 画面内は名前付きの旗、画面外は端の矢印で相手を示す。
      const x = Math.max(64, Math.min(W - 64, s.x));
      const y = Math.max(112, Math.min(H - 64, s.y));
      g.save();
      if (off) {
        const angle = Math.atan2(s.y - H / 2, s.x - W / 2);
        if (helping) {
          // 通常の行き先の印を消している時も、救助する方向は残す。
          g.save(); g.translate(x, y); g.rotate(angle);
          g.beginPath(); g.moveTo(18, 0); g.lineTo(-10, -12); g.lineTo(-10, 12); g.closePath();
          g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
          g.fillStyle = '#fff3ba'; g.fill(); g.restore();
        } else this.drawNavigationArrow(g, x, y, angle, .65);
        if (helping) {
          if (!this.notices.sources[1].selected) this.drawRescueHand(g, x, y - 32);
        }
      } else {
        if (!helping) this.drawPersonOutline(g, frame, true, true);
      }
      if (this.notices.sources[1].selected && !helping) {
        const order = $('objectives');
        setClass(order, 'ground-order', true);
        setClass(order, 'linked-destination', true);
        setClass(order, 'travel-retreat', false);
        const key = order.textContent + ':' + W + ':' + H;
        if (this.guardOrderSizeKey !== key) {
          this.guardOrderSizeKey = key;
          this.guardOrderWidth = order.offsetWidth; this.guardOrderHeight = order.offsetHeight;
        }
        const width = this.guardOrderWidth, height = this.guardOrderHeight;
        // 盾の横へ一枚だけ置く。上端へ押し戻された札でも盾を覆わない。
        const besideRight = s.x + 36, besideLeft = s.x - width - 36;
        const beside = !off && (besideRight + width <= W - 12 || besideLeft >= 12);
        const above = helping && !off;
        const left = Math.max(12, Math.min(W - width - 12, above ? s.x - width / 2 : off ? x < W / 2 ? x + 30 : x - width - 30 :
          beside ? besideRight + width <= W - 12 ? besideRight : besideLeft : s.x - width / 2));
        const top = Math.max(12, Math.min(H - height - 12, above ? frame.top - height - 76 : off ? y - height / 2 :
          beside ? frame.top - 30 - height / 2 : frame.top - 64 - height));
        setCssVar(order, '--ground-order-x', left + 'px');
        setCssVar(order, '--ground-order-y', top + 'px');
      }
      const label = helping ? 'この人' :
        rt.def.guardName?.(rt, guard) || `${guard.name || 'この人'}を守る`;
      this.drawPersonAction(g, rt, off ? x : frame.cx, off ? y : frame.top, label, off ? null : frame, !helping);
      g.restore(); drew = true;
      setClass(this.root, 'guard-guide', true);
    }
    // 自分の組も、目に入る者だけ白い印で示す。
    if (rt.player.showSquad && !this.root.classList.contains('combat-three') && !guard && !this.guardAlly) {
      g.font = '12px "Shippori Mincho B1", serif'; g.textAlign = 'center';
      for (const u of rt.squad) {
        if (u.offscreen || u === guard) continue;
        if (!sightUnit(rt, u)) continue;
        const s2 = this.project(u.pos, u.pos.y + 2.6, rt);
        if (s2.behind) continue;
        g.fillStyle = '#f1e9d6';
        // 組をまとめて見る時も、味方は共通の丸。
        g.beginPath(); g.arc(s2.x, s2.y - 3, 6, 0, Math.PI * 2);
        g.strokeStyle = '#14120f'; g.lineWidth = 3; g.stroke(); g.fill();
        if (u.name) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(u.name, s2.x + 1, s2.y - 10); g.fillStyle = '#f1e9d6'; g.fillText(u.name, s2.x, s2.y - 11); }
      }
    }
    // 組を向かわせた行き先は、戦場の地面に立てた本物の白い小旗と点線で示す（battle.js の updateDestMarks）
    // 一人称で雨の中にいる時だけ、画面（目の前）に雨粒が付いて、ゆっくり流れ落ちる。動きを減らす設定では出さない
    this.drawRainDrops(g, W, H, rt);
    this.drawBrim(g, W, H, rt);
    drew = this.drawPlayerSign(g, rt) || drew;
    // 次のコマに消さずに済むか：組の印・雨粒・笠の縁も描いていない時だけ
    if (previousEnemyFrame !== !!this.enemyFrameShown) this.notices.sync();
    this.ovBlank = !drew && !this.battleCuesDrawn && !rt.player.showSquad && !(this.drops && this.drops.length) && !((rt.player.fpK || 0) > 0.7);
  }


  // 一人称：画面の上の端に、かぶっている物の縁がうっすら見える（陣笠の縁・兜の眉庇）。上を向くほど大きく
  drawBrim(g, W, H, rt) {
    const P = rt.player, k = Math.max(0, ((P.fpK || 0) - 0.7) / 0.3);
    if (k <= 0 || !P.u.alive) return;
    const look = P.sightHat || 'jingasa';
    const kabuto = /kabuto/.test(look);
    const up = Math.max(0, Math.min(1, (P.pitch || 0) / 0.5));
    const h = H * (kabuto ? 0.045 : 0.035) * (1 + up * 1.6) * k;
    g.save();
    // 暗がりの勾配は、大きさ（整数の px）が変わった時だけ作り直す
    const bk = (kabuto ? 'k' : 'j') + Math.round(h) + ':' + W + ':' + H;
    if (!this.brimGr || this.brimGr.k !== bk || this.brimGr.g !== g) {
      const gr0 = g.createLinearGradient(0, 0, 0, h * 1.6);
      gr0.addColorStop(0, kabuto ? 'rgba(8,7,6,.82)' : 'rgba(20,16,12,.7)'); gr0.addColorStop(0.7, 'rgba(12,10,8,.35)'); gr0.addColorStop(1, 'rgba(12,10,8,0)');
      this.brimGr = { k: bk, g, gr: gr0 };
    }
    g.fillStyle = this.brimGr.gr;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
    // 縁は画面の両端で下がる弧（眉庇は真ん中が少し下がる）
    if (kabuto) { g.lineTo(W, h * 0.6); g.quadraticCurveTo(W / 2, h * 1.9, 0, h * 0.6); }
    else { g.lineTo(W, h * 1.5); g.quadraticCurveTo(W / 2, h * 0.2, 0, h * 1.5); }
    g.closePath(); g.fill();
    if (kabuto) {
      // 錣の端が左右にわずかに掛かる。向きを変えると、その先を見渡せる。
      g.fillStyle = 'rgba(8,7,6,.85)';
      const edge = W * 0.018 * k;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(edge, H * 0.2); g.quadraticCurveTo(edge * 0.3, H * 0.6, 0, H); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W, 0); g.lineTo(W - edge, H * 0.2); g.quadraticCurveTo(W - edge * 0.3, H * 0.6, W, H); g.closePath(); g.fill();
    }
    g.restore();
  }


  drawRainDrops(g, W, H, rt) {
    const P = rt.player, r = rt.world.rainLevel || 0;
    const on = !S.reduceMotion && (P.fpK || 0) > 0.6 && r > 0.3 && P.u.alive;
    const D = this.drops || (this.drops = []);
    const now = performance.now(), dt = Math.min(0.1, (now - (this.dropT || now)) / 1000); this.dropT = now;
    if (!on && !D.length) return;
    // 上を向くほど多く当たる
    if (on && Math.random() < dt * r * (6 + Math.max(0, P.pitch || 0) * 20) && D.length < 26) {
      D.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: 2 + Math.random() * Math.random() * 7, t: 0, life: 2.5 + Math.random() * 3, vy: 0, slide: Math.random() < 0.45 });
    }
    g.save();
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.t += dt;
      if (d.t > d.life || !on && d.t > 0.4) { D.splice(i, 1); continue; }
      // 大きい粒は重さで流れ落ち、筋を残す
      if (d.slide && d.r > 3.5) { d.vy = Math.min(90, d.vy + dt * 40 * (d.r / 5)); d.y += d.vy * dt; }
      const a = Math.min(1, d.t * 6) * (1 - d.t / d.life) * (on ? 1 : 0.4);
      g.globalAlpha = 0.5 * a;
      if (d.vy > 5) { g.strokeStyle = 'rgba(210,220,226,.35)'; g.lineWidth = d.r * 0.5; g.beginPath(); g.moveTo(d.x, d.y - Math.min(60, d.vy * 0.6)); g.lineTo(d.x, d.y); g.stroke(); }
      // 粒の絵は一枚だけ作って、大きさを変えて使い回す
      g.drawImage(dropSprite(), d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    g.restore();
    g.globalAlpha = 1;
  }
}
