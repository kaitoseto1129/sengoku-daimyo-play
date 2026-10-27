import { isTouch } from "./touch.js";
import { $, singleBattleGuide, guidanceEnded, retreatRequired, rescueTarget } from "./hud_common.js";
import { VIEW } from "./viewport.js";
import { groundAt } from "./floors.js";
import { S } from "./settings.js";
import { currentObjective } from "./mission_guide.js";
import { sightScreenUnit } from "./battle_sight.js";
import { localClear } from "./army_local_way.js";
import { enemyKnown } from "./battle_intel.js";

export class HudTeamSigns {


  // 足元から旗へ一本で結ぶ。画面外なら同じ向きの端に旗印を残す。
  // 自分から目の前の相手へ。画面の上下左右は実際の投影に合わせる。
  drawEnemyDirection(g, rt, enemy, besideFoot = false) {
    // 横へなぞる案内中は、敵へ進む別向きの矢印を重ねない。
    if (isTouch && (rt.touchCoachActive || $('objectives').classList.contains('facing-order'))) return;
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    this.tmpV.set(p.x, p.y + .2, p.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return;
    let x = Math.max(24, Math.min(W - 24, (this.tmpV.x * .5 + .5) * W));
    let y = Math.max(76, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
    const goal = enemy.pos || enemy;
    this.tmpV.set(goal.x, (goal.y ?? p.y) + .2, goal.z).project(rt.camera);
    let dx = (this.tmpV.x * .5 + .5) * W - x, dy = (-this.tmpV.y * .5 + .5) * H - y;
    if (this.tmpV.z < -1 || this.tmpV.z > 1) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const gx = goal.x - p.x, gz = goal.z - p.z;
      const angle = Math.atan2(-(gx * Math.sin(yaw) + gz * Math.cos(yaw)),
        -gx * Math.cos(yaw) + gz * Math.sin(yaw));
      dx = Math.cos(angle) * 64; dy = Math.sin(angle) * 64;
    }
    const length = Math.hypot(dx, dy);
    if (length < 16) return;
    const compact = isTouch || besideFoot || rt.def.compactCombatGuides;
    const ux = dx / length, uy = dy / length, tip = Math.min(compact ? 32 : 76, length - 8);
    if (besideFoot) {
      x = Math.max(48, Math.min(W - 48, x + (ux < -.25 ? -48 : 48)));
      y = Math.max(100, Math.min(H - 48, y - 6));
      this.drawNavigationArrow(g, x + ux * 64, y + uy * 64, Math.atan2(dy, dx), 1, true);
      return;
    }
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x + ux * 8, y + uy * 8); g.lineTo(x + ux * tip, y + uy * tip);
    g.strokeStyle = '#14120f'; g.lineWidth = compact ? 5 : 12; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = compact ? 2 : 6; g.stroke();
    g.beginPath(); g.moveTo(x + ux * tip, y + uy * tip);
    const tail = tip - (compact ? 9 : 16), wing = compact ? 5 : 9;
    g.lineTo(x + ux * tail - uy * wing, y + uy * tail + ux * wing);
    g.lineTo(x + ux * tail + uy * wing, y + uy * tail - ux * wing); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }


  // 待機・回避の向きは足元から示す。背後へ向く時も端へ飛ばさない。
  drawFootDirection(g, rt, target) {
    if (this.footDirectionDrawn) return false;
    if (isTouch) {
      const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -(target.x - p.x) * Math.cos(yaw) + (target.z - p.z) * Math.sin(yaw) >= 0;
      const drew = this.drawRouteTurn(g, rt, right);
      if (drew) this.footDirectionDrawn = true;
      return drew;
    }
    if (singleBattleGuide(rt)) {
      const p = rt.player.u.pos, dx = target.x - p.x, dz = target.z - p.z;
      const length = Math.hypot(dx, dz);
      if (length < .1) return false;
      const start = this.project(p, p.y + .15, rt, this.facingFootProjection || (this.facingFootProjection = {}));
      if (start.behind) return false;
      // 足元から数歩先の地面へ。携帯でも指の手本と取り違えない細い矢印にする。
      const step = Math.min(6, length), x = p.x + dx / length * step, z = p.z + dz / length * step;
      const point = this.facingGroundPoint || (this.facingGroundPoint = {});
      point.x = x; point.z = z;
      const end = this.project(point, groundAt(rt.world, x, z, p.y) + .15, rt,
        this.facingGroundProjection || (this.facingGroundProjection = {}));
      let sx = end.x - start.x, sy = end.y - start.y;
      if (end.behind || Math.hypot(sx, sy) < 8) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        sx = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
        sy = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
      }
      const screenLength = Math.max(.001, Math.hypot(sx, sy));
      const ux = sx / screenLength, uy = sy / screenLength;
      const tip = Math.max(48, Math.min(88, screenLength));
      const fx = Math.max(24, Math.min(VIEW.w - 24, start.x));
      const fy = Math.max(76, Math.min(VIEW.h - 28, start.y));
      g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 76); g.clip();
      g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      g.moveTo(fx + ux * 12, fy + uy * 12); g.lineTo(fx + ux * tip, fy + uy * tip);
      g.moveTo(fx + ux * (tip - 13) - uy * 7, fy + uy * (tip - 13) + ux * 7);
      g.lineTo(fx + ux * tip, fy + uy * tip);
      g.lineTo(fx + ux * (tip - 13) + uy * 7, fy + uy * (tip - 13) - ux * 7);
      g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
      this.footDirectionDrawn = true;
      return true;
    }
    // 短い案内を指定した戦は、教えの途中も足元へ収める。操作の手本は専用の表示に任せる。
    if (rt.def.compactCombatGuides) {
      this.drawEnemyDirection(g, rt, target);
      this.footDirectionDrawn = true;
      return true;
    }
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    this.tmpV.set(p.x, p.y + .15, p.z).project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return false;
    let x = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
    let y = Math.max(112, Math.min(H - 24, (-this.tmpV.y * .5 + .5) * H));
    if (isTouch) {
      const foot = this.facingOriginProjection || (this.facingOriginProjection = {});
      foot.x = x; foot.y = y; foot.behind = false;
      const origin = this.clearMoveOrigin(rt, foot);
      x = origin.x; y = origin.y;
    }
    const dx = target.x - p.x, dz = target.z - p.z, length = Math.hypot(dx, dz);
    if (length < .1) return false;
    // 短い別向きの矢印を作らず、実際の行き先まで一本で結ぶ。
    const goal = this.project(target, groundAt(rt.world, target.x, target.z, p.y) + .15, rt,
      this.facingGoalProjection || (this.facingGoalProjection = {}));
    let goalX = goal.x, goalY = goal.y;
    if (goal.behind || goalX < 48 || goalX > W - 48 || goalY < 100 || goalY > H - 64) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const scale = Math.min((W / 2 - 64) / Math.max(.001, Math.abs(side)),
        (H / 2 - 100) / Math.max(.001, Math.abs(forward)));
      goalX = Math.max(48, Math.min(W - 48, W / 2 + side * scale));
      goalY = Math.max(100, Math.min(H - 64, H / 2 - forward * scale));
    }
    // 画面下で二つの投影が近づいても、なぞる長さと始点の丸を残す。
    if (Math.hypot(goalX - x, goalY - y) < 64) goalY = Math.max(40, y - 96);
    const drew = isTouch ? this.drawSwipeArrow(g, x, y, goalX, goalY, 32) : this.drawFlagLink(g, x, y, goalX, goalY);
    if (!rt.def.groundFlagGuides) this.drawSmallGoalFlag(g, goalX, goalY, .65, false, false, '');
    if (drew) { this.navigationTouchOrigin.look = true; this.footDirectionDrawn = true; }
    return drew;
  }


  // 今の任務や退避先がある間は、別の守備先を重ねない。
  defendedLocation(rt) {
    return rt && !rt.over && !rt.retryOpen && !rt.choice && !this.openingActive &&
      !rt.missionGuide?.marker && !rt.dodgeGuide && !this.retreatGuide?.active &&
      !rt.player.camShot && !this.bigmap && !S.reduceGuidance &&
      !(rt.missionGuide?.distance < (rt.missionGuide?.marker?.guideRadius || 8) && rt.def.waitFacingPoint?.(rt)) &&
      rt.def.defendLocation?.(rt);
  }


  drawDefendedLocation(g, rt) {
    // 接敵中も、今の任務で守る実旗の印は残す。知らせの札は増やさない。
    const guide = rt.missionGuide;
    if (guide?.objective === currentObjective(rt) && guide.marker?.guideDefend &&
        !rt.over && !rt.retryOpen && !rt.choice && !this.openingActive && !rt.dodgeGuide &&
        !this.retreatGuide?.active && !rt.player.camShot && !this.bigmap && !S.reduceGuidance)
      return this.drawDefendedFlag(g, rt, guide.marker, guide.marker.guideDestination?.() || guide.pos);
    const pos = this.defendedLocation(rt);
    if (!pos) return false;
    // 実旗を選んでいない時も、同じ守備の輪と札で場所を示す。
    const marker = this.defendedAreaMarker || (this.defendedAreaMarker = { guideDefend: true, guideRadius: 12 });
    return this.drawDefendedFlag(g, rt, marker, pos);
  }


  // 目標は太い縁の旗で示す。大きな戦闘用矢印はそのまま残す。
  drawTargetPointer(g, x, y, color, large = false) {
    // 実旗の四隅と移動先の札がある戦では、さらに大きな下矢印を足さない。
    if (large && this.rt?.def.compactFlagEmphasis) return;
    if (this.rt?.touchSwipeActive && !large) return;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    if (large) {
      g.moveTo(x - 7, y - 47); g.lineTo(x + 7, y - 47);
      g.lineTo(x + 7, y - 29); g.lineTo(x + 18, y - 29);
      g.lineTo(x, y - 7); g.lineTo(x - 18, y - 29); g.lineTo(x - 7, y - 29);
    } else {
      g.restore();
      this.drawSmallGoalFlag(g, x - 11, y - 7, .7);
      return;
    }
    g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = color; g.fill(); g.restore();
  }


  // 通す味方の名前と、その本人から進む先への矢印。札は既存分と合わせ三枚まで。
  drawPassageGuides(g, rt) {
    const units = rt.def.passageGuideUnits?.(rt), goal = rt.def.passageGuideDestination?.(rt);
    // 任務の行き先や戦う相手がある間は、味方からの別の矢印を足さない。
    if (rt.missionGuide?.marker || rt.guideEnemy?.alive || this.defendEnemy?.alive || this.approachGuideEnemy?.alive) return false;
    if (!units || !goal || rt.over || rt.choice || rt.player.camShot || this.bigmap ||
        this.openingActive || S.reduceGuidance || guidanceEnded(rt) || retreatRequired(rt) ||
        rt.dodgeGuide || this.retreatGuide?.active) return false;
    // 通す味方の場所へ移る時は、名札を増やさず進む床の矢印を一つ出す。
    const destination = rt.def.passageTaskDestination?.(rt);
    if (destination) {
      // ついて行く本人の頭上に小旗を一つ。床の印と同じ任務札で伝える。
      if (rt.def.groundAdvanceGuides) for (const u of units) {
        if (!u?.alive || u.gone || u.woundOut || u.fleeing || u.pos !== destination || !sightScreenUnit(rt, u)) continue;
        const head = this.project(u.pos, u.pos.y + (u.mounted ? 3.3 : u.bodyHeight ?? 1.72) + .3, rt,
          this.passageHead || (this.passageHead = {}));
        if (!head.behind && head.x >= 20 && head.x <= VIEW.w - 20 && head.y >= 76 && head.y <= VIEW.h - 32 &&
            !this.hudRects().some(r => head.x + 14 > r.left && head.x - 14 < r.right && head.y > r.top && head.y - 28 < r.bottom))
          this.drawAllySign(g, head.x, head.y);
        break;
      }
      const cue = this.passageFloor || (this.passageFloor = { x:0, y:0, z:0, at:-1 });
      const p = rt.player.u.pos;
      if (cue.rt !== rt || rt.t >= cue.at || Math.hypot(destination.x - cue.gx, destination.z - cue.gz) > 1) {
        cue.rt = rt; cue.at = rt.t + .5; cue.gx = destination.x; cue.gz = destination.z;
        cue.x = destination.x; cue.z = destination.z;
        cue.y = groundAt(rt.world, cue.x, cue.z, p.y);
        const point = this.passageFloorCandidate || (this.passageFloorCandidate = { x:0, y:0, z:0 });
        const toward = Math.atan2(p.x - destination.x, p.z - destination.z);
        for (let i = 0; i < 16; i++) {
          const angle = toward + i % 8 * Math.PI / 4, distance = i < 8 ? 3 : 5;
          point.x = destination.x + Math.sin(angle) * distance;
          point.z = destination.z + Math.cos(angle) * distance;
          point.y = groundAt(rt.world, point.x, point.z, p.y);
          if (Math.hypot(point.x - p.x, point.z - p.z) < 2 || !rt.world.walkable(point.x, point.z, point.y) ||
              !localClear(rt.army, p, point) || !this.clearDestinationFloor(rt, point.x, point.z)) continue;
          cue.x = point.x; cue.y = point.y; cue.z = point.z; break;
        }
      }
      if (rt.def.groundAdvanceGuides && this.drawAdvanceStep(g, rt, cue)) return true;
      return this.drawTravelGuide(g, rt, cue, 1, null, false);
    }
    let used = 1 + this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.touchCoachActive || !!rt.nearestInteract() || rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6) +
      Number(!!this.guardAlly || !!rt.def.guardGuideTarget?.(rt));
    for (const el of this.markerEls.values()) if (!el.hidden) used++;
    const rects = this.hudRects(), placed = this.passageRects || (this.passageRects = []);
    placed.length = 0;
    const end = this.project(goal, goal.y + .1, rt, this.passageEnd || (this.passageEnd = {}));
    const eligible = (u) => u?.alive && !u.gone && !u.woundOut && !u.fleeing && sightScreenUnit(rt, u);
    const selected = units.includes(rt.player.lock) ? rt.player.lock : units.includes(rt.player.aimed) ? rt.player.aimed : this.passageGuideUnit;
    this.passageGuideUnit = units.includes(selected) && eligible(selected) ? selected : null;
    if (!this.passageGuideUnit) for (const u of units) if (eligible(u)) { this.passageGuideUnit = u; break; }
    let drew = false;
    g.save(); g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    for (const u of units) {
      if (u !== this.passageGuideUnit || used >= 3 || !eligible(u)) continue;
      const f = this.measurePersonFrame(u, rt);
      if (!f) continue;
      const foot = this.project(u.pos, u.pos.y + .1, rt, this.passageFoot || (this.passageFoot = {}));
      if (!foot.behind && !end.behind && Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z) > 1.5)
        drew = this.drawDirectionChain(g, foot.x, foot.y, end.x, end.y, true, 64) || drew;
      this.drawAllySign(g, f.cx, f.top - 12); drew = true;
      const width = g.measureText(u.name).width + 16, x = f.cx;
      let y = f.top - 40;
      // 名札は本人へ短い線で結ぶ。
      for (const r of placed) if (x + width / 2 > r.left && x - width / 2 < r.right && y + 22 > r.top && y < r.bottom) y = r.top - 26;
      if (x - width / 2 < 12 || x + width / 2 > VIEW.w - 12 || y < 12 || y + 22 > VIEW.h - 24 ||
          rects.some((r) => x + width / 2 > r.left && x - width / 2 < r.right && y + 22 > r.top && y < r.bottom)) continue;
      const box = this.passageBoxes || (this.passageBoxes = [{}, {}]);
      const r = box[placed.length];
      if (!r) break;
      r.left = x - width / 2; r.right = x + width / 2; r.top = y; r.bottom = y + 22;
      placed.push(r); used++;
      g.beginPath(); g.moveTo(x, y + 22); g.lineTo(f.cx, f.top - 20);
      g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#14120f'; g.fillRect(r.left, y, width, 22);
      g.fillStyle = '#fff3ba'; g.fillText(u.name, x, y + 16);
    }
    g.restore(); return drew;
  }


  // 兵や部隊に印を重ねない。
  drawNearbyTeamSigns(g, rt, candidates) { return false; }


  // 近い体の外側だけを二重線で示す。材質や兵の数は変えない。
  drawUnitContrast(g, rt, u, personGoal = false, measuredFrame = null) {
    if (u === rt.player.u || singleBattleGuide(rt) || !personGoal && rt.def.noUnitContrast) return false;
    // 敵の印で測った枠は使い回し、同じ骨の行列と投影を重ねて更新しない。
    const f = measuredFrame || this.measurePersonFrame(u, rt, !!rt.def.positionPersonGuide);
    if (!f || f.bottom <= f.top) return false;
    const h = f.bottom - f.top, w = Math.max(8, Math.min(28, h * .23));
    const self = u === rt.player.u;
    const nearEnemy = !self && u.team !== rt.player.u.team && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 12;
    if (f.cx < w || f.cx > VIEW.w - w || f.top < (self || personGoal ? 0 : 64) || f.top > VIEW.h || !self && !personGoal && f.bottom > VIEW.h - 16) return false;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(f.cx - w * .45, f.bottom); g.lineTo(f.cx - w, f.top + h * .4);
    g.quadraticCurveTo(f.cx - w, f.top + h * .22, f.cx - w * .45, f.top + h * .2);
    g.bezierCurveTo(f.cx - w, f.top - 4, f.cx + w, f.top - 4, f.cx + w * .45, f.top + h * .2);
    g.quadraticCurveTo(f.cx + w, f.top + h * .22, f.cx + w, f.top + h * .4);
    g.lineTo(f.cx + w * .45, f.bottom);
    g.strokeStyle = '#14120f'; g.lineWidth = personGoal ? 10 : self ? 9 : nearEnemy ? 8 : 5; g.stroke();
    g.strokeStyle = personGoal ? '#fff3ba' : '#fff'; g.lineWidth = personGoal ? 5 : self || nearEnemy ? 4 : 2; g.stroke(); g.restore(); return true;
  }


  // 兵や部隊に印を重ねない。
  drawAllySign(g, x, y, label = false) { return false; }


  // 敵の所属と戦闘相手は、字を添えず同じ赤い▼で示す。
  drawEnemySign(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x - 14, y - 30); g.lineTo(x + 14, y - 30); g.lineTo(x, y - 6); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#ff342e'; g.fill(); g.restore();
  }
}
