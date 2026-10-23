import { VIEW } from "./viewport.js";
import { $, setClass, setCssVar, groundFlag, travelSignPriority, singleBattleGuide, rescueTarget, guidanceEnded, retreatRequired } from "./hud_common.js";
import { groundAt } from "./floors.js";
import { currentObjective, navigationEnemy } from "./mission_guide.js";
import { sightScreenUnit, sightUnit } from "./battle_sight.js";
import { rainDanger } from "./arrow_rain.js";
import { S } from "./settings.js";

export class HudGround {


  destinationPointerClear(x, y, rects) {
    if (x < 40 || x > VIEW.w - 40 || y < 88 || y > VIEW.h - 40) return false;
    for (const r of rects) if (x + 40 > r.left && x - 40 < r.right && y + 40 > r.top && y - 40 < r.bottom) return false;
    return true;
  }


  // 画面外の旗と既存の任務を一組にし、知らせの枚数を増やさない。
  placeEdgeOrder(x, y) {
    const order = $('objectives');
    if (!this.notices.sources[1].selected || order.classList.contains('expand')) return;
    setClass(order, 'ground-order', true);
    const width = order.offsetWidth, height = order.offsetHeight;
    const left = x < VIEW.w / 2 ? x + 44 : x - width - 44;
    setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, left))) + 'px');
    setCssVar(order, '--ground-order-y', Math.round(Math.max(12, Math.min(VIEW.h - height - 48, y - height / 2))) + 'px');
  }


  // 行き先は矢印一つ。札に隠れた床を指す時は、空いている方向へ向ける。
  // 進む目当ての旗だけ大きくし、足元の自分の輪と区別する。
  drawMarkedGoalFlag(g, x, y, scale = 1) {
    this.drawSmallGoalFlag(g, x, y, scale);
  }


  // 出口は旗と区別できる門の形。文字の札を増やさず、足元を指す。
  drawGateSign(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-24, -48); g.lineTo(24, -48); g.lineTo(28, -40);
    g.lineTo(20, -40); g.lineTo(20, -8); g.lineTo(12, -8);
    g.lineTo(12, -34); g.lineTo(-12, -34); g.lineTo(-12, -8);
    g.lineTo(-20, -8); g.lineTo(-20, -40); g.lineTo(-28, -40); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }


  // 肩越しでも見下ろしでも、画面に映る道の進行方向に合わせる。
  destinationDirection(rt, pos) {
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = Math.atan2(this.tmpV.x, this.tmpV.z), p = rt.player.u.pos;
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    return Math.atan2(-forward, side);
  }


  drawDestinationPointer(g, rt, pos, guardFlag = false, arrowScale = .7) {
    // 指定した戦だけ、画面外へ回した補助旗と矢印も小さくそろえる。
    const pointerScale = rt.def.destinationPointerScale ?? 1;
    arrowScale *= pointerScale;
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    this.tmpV.set(pos.x, groundAt(rt.world, pos.x, pos.z, p.y) + .2, pos.z).project(rt.camera);
    const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
    const behind = this.tmpV.z < -1 || this.tmpV.z > 1;
    const rects = this.hudRects();
    if (guardFlag === 'gate') {
      // 出口の真上に門を重ねる。見切れたら中央へ戻さず、左右の端へ寄せる。
      if (!behind && this.destinationPointerClear(sx, sy, rects) &&
          sy >= 128 && this.floorGoalVisible(rt, pos)) {
        this.drawTaskDestinationSign(g, sx, sy - 28);
        return true;
      }
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z), dx = pos.x - p.x, dz = pos.z - p.z;
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const x = right >= 0 ? W - 48 : 48;
      const spot = this.avoidRects(x, H * .6, W, H, 'v', null, 34, 88, true);
      const y = this.liftAboveLowHud(x, spot ? spot[1] : H * .6, 144);
      this.drawTaskDestinationSign(g, x, y - 48);
      this.drawNavigationArrow(g, x, y + 6, Math.atan2(-forward, right), .65);
      this.placeEdgeOrder(x, y);
      return true;
    }
    if (!behind && this.destinationPointerClear(sx, sy, rects) && this.floorGoalVisible(rt, pos)) {
      // 行き先はひし形。操作の上矢印と逆向きに見える下矢印を置かない。
      if (guardFlag) this.drawFocusDiamond(g, sx, sy);
      else this.drawNavigationArrow(g, sx, sy, this.destinationDirection(rt, pos), arrowScale);
      if (guardFlag) this.drawMarkedGoalFlag(g, sx, sy - 12, pointerScale);
      return true;
    }
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const length = Math.hypot(right, forward);
    if (length < .001) return false;
    const cx = W / 2, cy = Math.max(100, (H + 48) / 2);
    const scale = Math.min((W / 2 - 48) / Math.max(.001, Math.abs(right)),
      Math.max(16, H / 2 - 100) / Math.max(.001, Math.abs(forward)));
    for (let i = 0; i <= 12; i++) {
      const step = scale * (1 - i / 12), x = cx + right * step, y = cy - forward * step;
      if (!this.destinationPointerClear(x, y, rects)) continue;
      if (!guardFlag && !rt.def.routeGuideArrowOnly) {
        if (rects.some(r => x + 40 > r.left && x - 40 < r.right && y + 40 > r.top && y - 80 < r.bottom)) continue;
        this.drawEdgeDestination(g, x, y, Math.atan2(-forward, right));
        this.placeEdgeOrder(x, y);
        return true;
      }
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right), arrowScale);
      if (guardFlag) this.drawMarkedGoalFlag(g, x, y - 12, pointerScale);
      else if (!rt.def.routeGuideArrowOnly || groundFlag(rt.missionGuide)) this.drawSmallGoalFlag(g, x, y - 12, .65);
      this.placeEdgeOrder(x, y);

      return true;
    }
    return false;
  }


  // 待つ場所は地面の太い点線の輪。任務札は印の外へ置く。
  drawGroundGuide(g, rt) {
    // 接敵中に描いた守備旗と同じ札の位置を保ち、別の行き先を重ねない。
    if (this.defendedFlagDrawn) return true;
    setClass($('objectives'), 'linked-destination', false);
    const guardWait = this.guardWait?.active && this.guardWait.rt === rt && rt.player.guard && this.guardFacing && this.defendEnemy?.alive ? this.guardWait : null;
    const retreat = this.retreatGuide?.active && this.retreatGuide.valid ? this.retreatGuide : null;
    // 防ぐ時は名前付きの盾だけにし、足形や待つ輪を重ねない。
    const hasCover = !!this.coverEl && !this.coverEl.hidden && !!rt.coverGuide?.valid;
    const fighting = !!(this.outlinedEnemy?.alive || this.aimGuideEnemy?.alive || this.defendEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive);
    // 現在の任務に対応する持ち場だけを行き先の候補にする。
    const route = rt.missionGuide?.objective === currentObjective(rt) ? rt.missionGuide : null;
    const travellingFlag = groundFlag(route) && route.distance > (route.marker.guideRadius || 8);
    // 今示している敵がいる間は進軍先を畳む。倒すか見失った後に旗へ戻す。
    const routePriority = !fighting && (travellingFlag || travelSignPriority(rt));
    const enemyGuide = !routePriority && singleBattleGuide(rt) && (rt.guideEnemyShown || rt.guideEnemyDirection) && rt.guideEnemy?.alive;
    const guardDestination = rt.def.keepGuardTaskLabel && rt.missionGuide?.marker?.guideArea === 'guard' &&
      !this.root.classList.contains('wait-guard-active') && !guardWait && !this.guardAlly;
    const dismount = !!this.actionLabel && !this.actionLabel.hidden && !!this.actionLabel.querySelector('.dismount-action') && rt.player.mounted;
    const helpedPerson = rescueTarget(rt) || this.guardAlly;
    const personLocated = helpedPerson?.alive && sightScreenUnit(rt, helpedPerson);
    const enabled = !this.root.classList.contains('wait-guard-active') && !$('objectives').classList.contains('facing-order') && (!personLocated || retreat || hasCover) && (!fighting || routePriority || retreat || hasCover) && !dismount && (!this.approachGuideEnemy || routePriority || retreat || hasCover) && (routePriority || retreat || hasCover || guardDestination || !enemyGuide && !navigationEnemy(rt) && !this.defendEnemy?.alive && !this.root.classList.contains('wait-guard-active') && !guardWait && !(rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive && !this.defendEnemy && !this.guardAlly) && !rainDanger(rt.army) && !S.reduceGuidance && !guidanceEnded(rt) && !this.openingActive && !rt.choice && !rt.player.camShot && !this.bigmap && !rt.dodgeGuide;
    const guide = rt.missionGuide?.objective === currentObjective(rt) ? rt.missionGuide : null;
    const cover = !retreat && this.coverEl && !this.coverEl.hidden && rt.coverGuide?.valid ? rt.coverGuide.pos : null;
    setClass(this.root, 'cover-guidance', hasCover);
    const attacking = !routePriority && !guardDestination && !retreat && !retreatRequired(rt) && (rt.guideEnemyShown || rt.guideEnemyDirection) && rt.guideEnemy?.alive;
    const flag = !guardWait && !retreat && !cover && !attacking && groundFlag(guide);
    const marker = guardWait || (!attacking && (!retreatRequired(rt) || guide?.marker?.guideArea === 'retreat') && guide?.objective === currentObjective(rt) && (guide.marker?.guideArea || flag || !guide.marker?.person && !guide.marker?.guidePerson && (!guide.marker?.entrance || !rt.def.town && !rt.def.dojo)) ? guide.marker : null);
    const order = $('objectives');
    setClass(order, 'travel-retreat', false);
    setClass(order, 'goal-visible', false);
    setClass(order, 'destination-sign', enabled && !!marker?.entrance && !retreat);
    const localOrder = enabled && !!(retreat || marker) && !cover && !flag && !(rt.def.compactHoldGuide && marker?.waitGuide) && this.notices.sources[1].selected && !order.classList.contains('expand');
    setClass(order, 'entrance-order', localOrder && !!marker?.entrance);
    if (order.classList.contains('ground-order') !== localOrder) this.groundOrderKey = null;
    setClass(order, 'ground-order', localOrder);
    setClass(this.root, 'route-task', enabled && !!marker && !retreat && !cover && !marker.guidePerson &&
      !marker.entrance && !marker.guideSymbol && !marker.waitGuide &&
      marker.guideArea !== 'wait' && marker.guideArea !== 'guard' && !rt.nearestInteract());
    if (!enabled || !retreat && !cover && !marker) return false;
    // 押す場所は操作札だけ。足元に押せそうな輪を重ねない。
    if (cover) return this.drawCoverDirection(g, rt, cover);
    if (!retreat && marker?.guideArea === 'guard') {
      return this.drawSingleDestination(g, rt, marker.guideDestination?.() || guide.pos, marker);
    }
    // 遠い門そのものを壁越しに指さず、通る順に置かれた道の印を使う。
    const routePoint = marker?.entrance && !rt.def.town && !rt.def.dojo ? guide.pos : null;
    const pos = retreat || cover || guardWait?.pos || routePoint || marker?.guideDestination?.() || guide.pos, radius = retreat ? retreat.radius : cover ? .9 : marker.guideRadius || 3;
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    // 手当てへ戻る時も共通の大旗へ導く。到着後は元の手当ての印へ渡す。
    if (retreat?.treatment && Math.hypot(pos.x - p.x, pos.z - p.z) >= radius) {
      const s = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .18, rt);
      const visible = !s.behind && s.x >= 48 && s.x <= W - 80 && s.y >= 154 && s.y <= H - 60 && this.floorGoalVisible(rt, pos);
      return this.drawRetreatDestination(g, rt, pos, visible, s.x, s.y, false);
    }
    if (!retreat && !cover && marker?.guideSymbol === 'fire') {
      setClass(order, 'ground-order', false);
      return this.drawWorkGuide(g, rt, marker);
    }
    if ((singleBattleGuide(rt) && !retreat && marker?.guideArea !== 'retreat' || retreat?.treatment) && !cover) {
      setClass(order, 'ground-order', false);
      setClass(order, 'destination-sign', false);
      setClass(order, 'entrance-order', false);
      return this.drawSingleDestination(g, rt, pos, retreat || marker);
    }
    // 移動の向きは道へ、到着の印は実際の場所へ分ける。
    if (!cover && !flag && !retreat?.treatment && (retreat || marker && (marker.guideArea !== 'wait' && !marker.waitGuide || Math.hypot(pos.x - p.x, pos.z - p.z) >= radius))) {
      setClass(order, 'ground-order', false);
      // 任務は既存の一枚。進む向きを伝える札は増やさない。
      return this.drawTravelGuide(g, rt, pos, radius, retreat?.ally || marker?.guideAlly?.() || null, !!retreat || marker?.guideArea === 'retreat', !!retreat || marker?.guideArea === 'retreat', false, marker?.guideGoal?.() || pos);
    }
    // 旗への案内は地面の行き先一つにまとめる。
    if (flag) return this.drawFlagGuide(g, rt, guide, pos);
    const reached = Math.hypot(pos.x - p.x, pos.z - p.z) < radius;
    const waiting = !flag && !retreat && !cover && (marker.guideArea === 'wait' || !!marker.waitGuide);
    // 到着の判定は保ち、待つ印は持ち場へ固定する。本人を追って場所を変えない。
    const foot = pos;
    const drawnRadius = waiting ? radius : retreat ? Math.max(1.8, radius) : cover ? .75 : Math.min(radius, 1.6);
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    let left = Infinity, top = Infinity, rightEdge = -Infinity, bottom = -Infinity, whole = true;
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2, px = foot.x + Math.cos(angle) * drawnRadius, pz = foot.z + Math.sin(angle) * drawnRadius;
      this.tmpV.set(px, groundAt(rt.world, px, pz, foot.y ?? p.y) + .15, pz).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z < -1 || this.tmpV.z > 1) whole = false;
      left = Math.min(left, sx); rightEdge = Math.max(rightEdge, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
    }
    whole = whole && left >= 12 && rightEdge <= W - 12 && top >= 64 && bottom <= H - 24 &&
      rightEdge - left <= (waiting ? W / 3 : 160) && bottom - top <= (waiting ? H / 3 : 80);
    const footY = marker?.entrance && Number.isFinite(foot.y) ? foot.y : groundAt(rt.world, foot.x, foot.z, foot.y ?? p.y) + .2;
    this.tmpV.set(foot.x, footY, foot.z).project(rt.camera);
    let x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
    const covered = retreat?.treatment && this.hudRects().some(r => r !== this.guideOrderRect &&
      x + 88 > r.left && x - 88 < r.right && y + 48 > r.top && y - 88 < r.bottom);
    const off = this.tmpV.z > 1 || this.tmpV.z < -1 || x < 50 || x > W - 50 || y < 76 || y > H - 24 || covered;
    whole = whole && !off;
    // 手当ての行き先が見える間は、輪と下向きの印に絞る。
    if (retreat?.treatment && off && !reached) this.drawTravelGuide(g, rt, pos, radius, null, false, false, true);
    const dx = pos.x - p.x, dz = pos.z - p.z, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw), forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (off && (!reached || waiting)) {
      const scale = Math.min((W / 2 - 65) / Math.max(.001, Math.abs(right)), (H / 2 - 120) / Math.max(.001, Math.abs(forward)));
      x = W / 2 + right * scale; y = H / 2 - forward * scale;
    }
    // 画面端や足元でも輪を欠かさず、全体が見える大きさで収める。
    const edgeX = retreat?.treatment ? 60 : 50, edgeY = retreat?.treatment ? 32 : 24;
    x = Math.max(edgeX, Math.min(W - edgeX, x));
    y = Math.max(76, Math.min(H - edgeY, y));
    if (off && retreat?.treatment) for (const r of this.hudRects()) {
      if (r !== this.guideOrderRect && x + 28 > r.left && x - 28 < r.right && y + 28 > r.top && y - 28 < r.bottom) {
        y = Math.max(100, r.top - 36);
      }
    }
    const ringX = whole ? (left + rightEdge) / 2 : x;
    const ringY = whole ? (top + bottom) / 2 : y;
    const ringW = cover ? Math.min(28, Math.max(18, (rightEdge - left) / 2)) : whole ? Math.max(retreat?.treatment ? 52 : 44, (rightEdge - left) / 2) : retreat?.treatment ? 52 : 44;
    const ringH = cover ? Math.min(12, Math.max(8, (bottom - top) / 2)) : whole ? Math.max(retreat?.treatment ? 20 : 15, (bottom - top) / 2) : retreat?.treatment ? 20 : 16;
    // 待つ点線は実際の地面へ投影する。画面端に偽の持ち場を作らない。
    if (waiting && rt.def.compactHoldGuide) {
      if (!off && this.drawFloorGoal(g, rt, foot.x, foot.z, false, .75)) this.drawSmallGoalFlag(g, x, y);
    } else if (waiting) {
      g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
      g.beginPath();
      let previousVisible = false;
      for (let i = 0; i <= 32; i++) {
        const angle = i / 32 * Math.PI * 2;
        const px = foot.x + Math.cos(angle) * drawnRadius, pz = foot.z + Math.sin(angle) * drawnRadius;
        this.tmpV.set(px, groundAt(rt.world, px, pz, foot.y ?? p.y) + .15, pz).project(rt.camera);
        const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
        const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1;
        if (visible && previousVisible) g.lineTo(sx, sy);
        else if (visible) g.moveTo(sx, sy);
        previousVisible = visible;
      }
      this.strokeGroundArea(g);
      g.restore();
    } else if (rt.def.groundCombatMarkers && !marker?.entrance && !retreat?.treatment) {
      if (!off) this.drawFloorGoal(g, rt, foot.x, foot.z, false, .6);
    } else if (!marker?.entrance && Math.hypot(rt.player.u.vel.x, rt.player.u.vel.z) < .05 && (retreat?.treatment ? !off : !(off && !reached))) {
      g.beginPath(); g.ellipse(ringX, ringY, ringW, ringH, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(154,132,88,.45)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(204,184,137,.65)'; g.lineWidth = 1; g.stroke();
    }
    if (whole && !marker?.entrance) { x = ringX; y = ringY; }
    // 布が画面外でも、輪と矢印に同じ短い名前を添える。
    if (flag && this.notices.sources[1].selected && !order.classList.contains('expand')) {
      g.font = 'bold 20px sans-serif';
      const half = Math.ceil(g.measureText('この はたへ').width / 2) + 12;
      const lx = Math.max(half + 8, Math.min(W - half - 8, x));
      const ly = Math.max(12, y - 112);
      g.fillStyle = '#14120f'; g.fillRect(lx - half, ly, half * 2, 36);
      g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('この はたへ', lx, ly + 18);
      setClass(this.root, 'flag-guide', true);
    }
    // 選ばれた一枚の札だけを輪の外へ。警告・判断・開いた任務一覧には割り込まない。
    if (localOrder) {
      // 手当ては移動用の見せ方にせず、今の操作だけを輪のそばへ置く。
      const measureKey = this.objKey + '|' + this.actionLabel?.textContent + '|' + W + '|' + H;
      if (this.groundOrderKey !== measureKey) {
        this.groundOrderKey = measureKey;
        this.groundOrderW = order.offsetWidth; this.groundOrderH = order.offsetHeight;
      }
      // 移動の札は輪のそばへ。待機と手当ては本人と目印の上を空ける。
      let labelX = Math.max(12, Math.min(W - this.groundOrderW - 12, x - this.groundOrderW / 2));
      let labelY = Math.max(12, Math.min(H - this.groundOrderH - 12, y - ringH - (retreat?.treatment ? 70 : 24) - this.groundOrderH - 12));
      // 待機と手当ての札は輪の横へ寄せる。横に入らない時だけ真上へ。
      if ((waiting || retreat?.treatment) && !off) {
        const gap = retreat?.treatment ? 12 : 36;
        const roomRight = W - 12 - (x + ringW + gap);
        const roomLeft = x - ringW - gap - 12;
        if (Math.max(roomRight, roomLeft) >= this.groundOrderW) {
          labelX = roomRight >= roomLeft ? x + ringW + gap : x - ringW - this.groundOrderW - gap;
          labelY = Math.max(12, Math.min(H - this.groundOrderH - 12, y - this.groundOrderH / 2));
        } else {
          // 横に収まらない時も、点線と足形の上を空ける。
          labelY = retreat?.treatment && y + ringH + 12 + this.groundOrderH <= H - 12
            ? y + ringH + 12
            : Math.max(12, y - (retreat?.treatment ? 70 : ringH + 24) - this.groundOrderH);
        }
      }
      const ally = !retreat?.treatment && retreat?.ally;
      if (ally?.alive) {
        this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.4 : 2.7), ally.pos.z).project(rt.camera);
        const ax = (this.tmpV.x * .5 + .5) * W, ay = (-this.tmpV.y * .5 + .5) * H;
        if (this.tmpV.z >= -1 && this.tmpV.z <= 1 && labelX < ax + 40 && labelX + this.groundOrderW > ax - 12 && labelY < ay + 8 && labelY + this.groundOrderH > ay - 48) {
          labelX = ax < W / 2 ? Math.min(W - this.groundOrderW - 12, ax + 48) : Math.max(12, ax - this.groundOrderW - 20);
        }
      }
      // 指定した戦の退避札だけ、折り返した実寸で命の欄の上へ離す。
      // 四分の一秒ごとの既存の採寸を使い、毎コマ測り直さない。
      if (retreat && rt.def.retreatOrderAvoidHealth) {
        this.hudRects();
        const health = this.healthRect;
        if (health && labelX < health.right + 8 && labelX + this.groundOrderW > health.left - 8 &&
            labelY < health.bottom + 8 && labelY + this.groundOrderH > health.top - 8)
          labelY = Math.max(12, health.top - this.groundOrderH - 8);
      }
      setCssVar(order, '--ground-order-x', Math.round(labelX) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(labelY) + 'px');
    }
    if (localOrder && (retreat?.treatment || !(off && (!reached || waiting)))) {
      const lx = parseFloat(order.style.getPropertyValue('--ground-order-x'));
      const ly = parseFloat(order.style.getPropertyValue('--ground-order-y'));
      if (!marker?.entrance && !waiting) this.drawGuideLink(g, x, off ? y : y - ringH, lx, ly, lx + this.groundOrderW, ly + this.groundOrderH);
    }
    // 門の足元と任務札を同じ旗・矢印で示す。画面外では一組のまま向ける。
    if (marker?.entrance) {
      if (off && !reached) {
        g.translate(Math.max(84, Math.min(W - 84, x)), Math.max(100, Math.min(H - 84, y)));
        g.rotate(Math.atan2(-forward, right) - Math.PI / 2);
        this.drawDestinationSign(g, 0, 0);
      } else this.drawDestinationSign(g, x, y);
      g.restore(); return true;
    }
    if (cover && !off) {
      g.beginPath(); g.ellipse(ringX, ringY, Math.max(36, ringW), Math.max(16, ringH), 0, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
      this.drawGoalArrow(g, ringX, ringY - Math.max(16, ringH) - 8);
      g.restore(); return true;
    }
    // 退く時はついていく味方の頭上に旗を立て、同じ矢印でその後ろの輪へ結ぶ。
    const ally = !retreat?.treatment && retreat?.ally;
    if (ally?.alive && !ally.gone && !ally.fleeing && sightUnit(rt, ally)) {
      this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.4 : 2.7), ally.pos.z).project(rt.camera);
      const ax = (this.tmpV.x * .5 + .5) * W, ay = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z >= -1 && this.tmpV.z <= 1 && ax > 24 && ax < W - 48 && ay > 80 && ay < H - 48) {
        this.drawGuideLink(g, x, y - ringH, ax - 3, ay - 36, ax + 30, ay);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, ay - 38); g.lineTo(ax + 28, ay - 38);
        g.lineTo(ax + 21, ay - 27); g.lineTo(ax + 28, ay - 16); g.lineTo(ax, ay - 16);
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff3ba'; g.fill();
      }
    }
    if (!localOrder && !retreat?.treatment && (retreat || cover)) {
      // 輪の脇へ太い矢印。札から戦場を横切る線は引かない。
      const side = x < W / 2 ? 1 : -1;
      const tip = x + side * (ringW + 8);
      g.beginPath(); g.moveTo(tip + side * 24, y); g.lineTo(tip, y);
      g.moveTo(tip + side * 8, y - 8); g.lineTo(tip, y); g.lineTo(tip + side * 8, y + 8);
      g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
    }
    if (retreat?.treatment && !off) {
      // 十字も札もこの輪のそばへ。離れた味方の旗へ線を伸ばさない。
      this.drawGoalArrow(g, x, y - 6);
      g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 4;
      g.beginPath(); g.rect(x + 26, y - 62, 24, 24); g.stroke(); g.fill();
      g.beginPath(); g.moveTo(x + 38, y - 57); g.lineTo(x + 38, y - 43);
      g.moveTo(x + 31, y - 50); g.lineTo(x + 45, y - 50);
      g.stroke(); g.restore(); return true;
    }
    // 同じ行き先の札は置かず、地面の目印一つにそろえる。
    g.translate(x, y); g.beginPath();
    if (off && !reached) {
      g.restore();
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right), .65);
      this.drawSmallGoalFlag(g, x, y - 16, .65);
      return true;
    } else if (flag) {
      // 実物の旗の足元に線の矢印だけを添える。
      this.drawGoalArrow(g, 0, 0); g.restore(); return true;
    } else if (cover && !rt.def.coverGuidePlace) {
      // 下がる場所は旗の根元。兵の旗と区別できる太い縁を付ける。
      g.moveTo(0, 8); g.lineTo(0, -56); g.lineTo(28, -56);
      g.lineTo(21, -43); g.lineTo(28, -30); g.lineTo(0, -30);
    } else if (waiting || marker?.waitGuide) {
      // 待つ輪の中には危険や操作に見える記号を足さない。
    } else {
      this.drawGoalArrow(g, 0, -6); g.restore(); return true;
    }
    g.closePath(); g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke(); g.fill();
    g.restore(); return true;
  }
}
