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


  // 近い兵は小さな丸とひし形で示し、操作中も所属を見分けられるようにする。
  drawNearbyTeamSigns(g, rt, candidates) {
    if (this.teamSignsDrawn) return false;
    this.teamSignsDrawn = true;
    // 進軍・接敵・退避でも、近い兵の所属は小さな形で残す。字の札は増やさない。
    if (rt.def.town || rt.def.dojo || rt.over || rt.choice ||
        this.openingActive && !this.opening?.el.classList.contains('opening-controls') ||
        !rt.player.u.alive || rt.player.camShot || this.bigmap || S.reduceGuidance || guidanceEnded(rt)) return false;
    // 移動中も近い相手だけを選び、遠くの所属は増やさない。
    const guide = rt.missionGuide;
    const moving = guide?.marker && guide.distance >= (guide.marker.guideRadius || 8);
    const travelling = !!rt.dodgeGuide || retreatRequired(rt) || this.retreatGuide?.active ||
      !!rt.def.routeGuidePriority?.(rt) || moving && !rt.guideEnemyShown;
    const slots = this.teamSignSlots || (this.teamSignSlots = new Float32Array(24));
    const rects = this.hudRects(), p = rt.player.u;
    const enemyRange = rt.def.nearbyEnemySignRange ?? 18;
    const enemyLimit = Math.min(3, rt.def.nearbyEnemySignLimit ?? 3);
    // 両軍三人まで。行き先の旗と競わない小さな形にする。
    const allyLimit = Math.min(3, rt.def.nearbyAllySignLimit ?? 3);
    const visible = this.teamSignUnits || (this.teamSignUnits = []);
    // 視線の確認は既存の候補更新と同じ毎秒十回まで。入れ物は使い回す。
    const signAt = Math.floor(rt.t * 10);
    if (this.teamSignRt !== rt || this.teamSignAt !== signAt) {
      this.teamSignRt = rt; this.teamSignAt = signAt; visible.length = 0;
      let checkedAllies = 0, checkedEnemies = 0;
      for (const u of candidates) {
        const enemy = u.team !== p.team;
        // 描かない敵印の視線・地形は調べない。味方の印と戦闘相手の案内は保つ。
        if (enemy ? enemyLimit <= 0 : allyLimit <= 0) continue;
        if (!rt.player.showSquad && (enemy ? checkedEnemies : checkedAllies) >= 4) continue;
        if (u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' ||
            !u.alive || u.gone || u.offscreen || !u.mesh.visible ||
            u.group?.hidden || u.fleeing || u.woundOut ||
            Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > (rt.player.showSquad ? enemy ? enemyRange : 18 : Math.min(12, enemy ? enemyRange : 12)) ||
            u.team !== p.team && u.isOfficer && !enemyKnown(rt, u)) continue;
        if (sightScreenUnit(rt, u)) {
          visible.push(u);
          if (enemy) checkedEnemies++; else checkedAllies++;
        }
      }
    }
    let count = 0, enemies = 0, allies = 0;
    const focus = this.aimGuideEnemy || this.guardThreat || this.attackGuideEnemy || this.approachGuideEnemy || this.defendEnemy || rt.guideEnemy || rt.player.lock;
    const destinationPerson = guide?.marker?.guidePerson?.();
    const followAlly = rt.def.missionAlly?.(rt);
    const guard = rescueTarget(rt) || this.guardAlly || rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt);
    const passageUnits = rt.def.passageGuideUnits?.(rt);
    // 字の札は増やさず、頭上の小さな印を両軍三人ずつまでに絞る。
    const budget = 6;
    const focusFrame = focus?.alive && this.enemyFrameShown ? this.measurePersonFrame(focus, rt, true) : null;
    const focusTop = focusFrame?.top ?? 0, focusX = focusFrame?.cx ?? 0;
    const focusBottom = focusFrame?.bottom ?? 0;
    const focusLeft = focusFrame?.left ?? 0, focusRight = focusFrame?.right ?? 0;
    this.tmpV.set(p.pos.x, p.pos.y + (p.mounted ? 3.7 : (p.bodyHeight ?? 1.72) + .65), p.pos.z).project(rt.camera);
    const selfVisible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
    const selfX = (this.tmpV.x * .5 + .5) * VIEW.w, selfY = (-this.tmpV.y * .5 + .5) * VIEW.h;
    const selfFoot = this.project(p.pos, p.pos.y + .12, rt,
      this.teamSelfFootProjection || (this.teamSelfFootProjection = {}));
    g.save(); g.lineJoin = 'round';
    for (const u of visible) {
      if (count >= budget) break;
      const enemy = u.team !== p.team;
      // 攻撃の瞬間以外も近くの所属を示す。候補は本人に近い順のまま使う。
      if (!rt.player.showSquad && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 12) continue;
      if (travelling && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 12) continue;
      if ((enemy ? enemies >= enemyLimit : allies >= allyLimit) || u === focus && this.enemyFrameShown || u === this.battleSignEnemy || u === followAlly || u === guard || u === destinationPerson || passageUnits?.includes(u) ||
          !u.alive || u.gone || u.offscreen || !u.mesh.visible || u.group?.hidden || u.fleeing || u.woundOut ||
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > (enemy ? enemyRange : 18) ||
          enemy && u.isOfficer && !enemyKnown(rt, u)) continue;
      const head = u.human?.root.visible && u.human.bones?.Head;
      if (head) {
        head.updateWorldMatrix(true, false); head.getWorldPosition(this.tmpV); this.tmpV.y += .35;
        if (u.mesh) {
          this.tmpV.x += u.pos.x - u.mesh.position.x;
          this.tmpV.y += u.pos.y - u.mesh.position.y;
          this.tmpV.z += u.pos.z - u.mesh.position.z;
        }
      }
      else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted || u.type === 'cavalry' ? 3.5 : (u.bodyHeight ?? 1.72) + .3), u.pos.z);
      this.tmpV.project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) continue;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      if (x < 24 || x > VIEW.w - 56 || y < 76 || y > VIEW.h - 32) continue;
      // 混み合う時は小さい印を頭の脇へ寄せ、細い線で本人と結ぶ。
      let signX = x, signY = y, placed = false;
      for (let attempt = 0; attempt < 7; attempt++) {
        signX = x + (attempt ? (attempt % 2 ? -1 : 1) * (attempt < 3 ? 28 : 48) : 0);
        signY = y - (attempt >= 5 ? 32 : 0);
        if (signX < 24 || signX > VIEW.w - 24 || signY < 76 || signY > VIEW.h - 32) continue;
        if (focusFrame && (signX + 14 > focusLeft - 8 && signX - 14 < focusRight + 8 &&
            signY + 8 > focusTop - 8 && signY - 28 < focusBottom + 8 ||
            Math.abs(signX - focusX) < 24 && Math.abs(signY - focusTop) < 64)) continue;
        if (selfVisible && Math.abs(signX - selfX) < 40 && signY + 12 > selfY - 32 &&
            signY - 28 < (selfFoot.behind ? selfY + 40 : selfFoot.y + 24)) continue;
        let covered = false;
        for (const r of rects) if (signX + 16 > r.left && signX - 16 < r.right &&
            signY + 8 > r.top && signY - 28 < r.bottom) { covered = true; break; }
        if (covered) continue;
        for (let i = 0; i < count; i++) if (Math.abs(signX - slots[i * 2]) < 28 &&
            Math.abs(signY - slots[i * 2 + 1]) < 28) { covered = true; break; }
        if (!covered) { placed = true; break; }
      }
      if (!placed) continue;
      slots[count * 2] = signX; slots[count * 2 + 1] = signY; count++;
      if (signX !== x || signY !== y) {
        g.beginPath(); g.moveTo(x, y + 4); g.lineTo(signX, signY - 4);
        g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke();
        g.strokeStyle = '#fff3ba'; g.lineWidth = 1.5; g.stroke();
      }
      // すぐ近い徒歩の兵は肩の両脇も明るく縁取る。胴を塗らず、投影の入れ物は共用する。
      if (!u.mounted && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= 8) {
        const foot = this.project(u.pos, u.pos.y + .12, rt,
          this.nearbyFootProjection || (this.nearbyFootProjection = {}));
        const height = foot.y - y;
        if (!foot.behind && height > 24 && foot.y < VIEW.h - 16) {
          const half = Math.max(6, Math.min(18, height * .17));
          g.beginPath();
          g.moveTo(x - half, y + height * .24); g.lineTo(x - half, y + height * .56);
          g.moveTo(x + half, y + height * .24); g.lineTo(x + half, y + height * .56);
          g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
          g.strokeStyle = enemy ? '#fff0e4' : '#e7f8ff'; g.lineWidth = 2; g.stroke();
        }
      }
      if (enemy) {
        enemies++;
        // 敵は任務と同じひし形。味方の丸と形でも分ける。
        g.save(); g.translate(signX, signY + 10);
        const scale = rt.def.nearbyTeamSignScale || .5; g.scale(scale, scale);
        g.beginPath(); g.moveTo(0, -30); g.lineTo(16, -12);
        g.lineTo(0, 6); g.lineTo(-16, -12); g.closePath();
        g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
        g.fillStyle = '#b52d21'; g.fill(); g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
        continue;
      } else {
        allies++;
        this.drawAllySign(g, signX, signY); continue;
      }
    }
    g.restore(); return count > 0;
  }


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


  // 味方は小さい丸。追う旗や敵のひし形と形で分ける。
  drawAllySign(g, x, y, label = false) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.arc(x, y - 10, 5, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#e7f8ff'; g.lineWidth = 2; g.stroke(); g.restore();
    if (label) this.drawTeamWord(g, x + 30, y - 12, 'みかた');
  }


  // 敵は三角。小さい所属の印と、大きい戦闘相手の印で同じ形を使う。
  drawEnemySign(g, x, y, label = true) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x, y - 30); g.lineTo(x + 14, y - 6); g.lineTo(x - 14, y - 6); g.closePath();
    g.fillStyle = '#14120f'; g.fill();
    g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff4eb'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#ffb49d'; g.lineWidth = 2; g.stroke(); g.restore();
    if (label) this.drawTeamWord(g, x, y + 14, '敵');
  }


  // 所属の字は形のすぐ隣へ。札を追加せず、明暗の縁で床から分ける。
  drawTeamWord(g, x, y, word) {
    const scale = Math.max(1, S.textScale || 1);
    g.save(); g.font = `bold ${18 * scale}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const width = g.measureText(word).width + 12;
    g.fillStyle = '#14120f'; g.fillRect(x - width / 2, y - 13 * scale, width, 26 * scale);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.strokeText(word, x, y);
    g.fillStyle = '#fff'; g.fillText(word, x, y); g.restore();
  }


  // 刀の形と二重の縁で、暗い服の敵も色だけに頼らず示す。
  drawSwordSign(g, x, y) {
    g.save(); g.translate(x, y - 18); g.lineJoin = 'round';
    for (let side = -1; side <= 1; side += 2) {
      g.save(); g.scale(side, 1); g.beginPath();
      g.moveTo(-12, -8); g.lineTo(14, -48); g.lineTo(14, -37); g.lineTo(-7, -5); g.closePath();
      g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
      g.fillStyle = '#ffccb5'; g.fill();
      g.beginPath(); g.moveTo(-16, -14); g.lineTo(-2, -4);
      g.moveTo(-9, -8); g.lineTo(-15, 1);
      g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
      g.strokeStyle = '#ffccb5'; g.lineWidth = 3; g.stroke(); g.restore();
    }
    g.restore();
  }


  // 任務札と同じやりの形を、ねらう敵にも付ける。
  drawSpearSign(g, x, y) {
    g.save(); g.translate(x - 8, y - 40); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(16, 12); g.lineTo(10, 17);
    g.lineTo(10, 32); g.lineTo(6, 32); g.lineTo(6, 17); g.lineTo(0, 12); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }
}
