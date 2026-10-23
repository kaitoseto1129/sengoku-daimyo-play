import { isTouch } from "./touch.js";
import { $, singleBattleGuide, groundFlag, setClass, travelSignPriority, setCssVar, guardPostDistance, setText } from "./hud_common.js";
import { groundAt } from "./floors.js";
import { VIEW } from "./viewport.js";
import { S } from "./settings.js";
import { localClear } from "./army_local_way.js";
import { sightPoint } from "./battle_sight.js";

export class HudGoal {


  drawSingleDestination(g, rt, pos, marker) {
    // 守る旗と道が描かれている時は、別の到着点を足さない。
    if (this.defendedFlagDrawn && marker?.guideDefend) return true;
    // 危険な間は守る操作を先に見せ、安全になったら移動案内へ戻す。
    if (this.root.classList.contains('wait-guard-active')) return false;
    if (this.releaseMoveActive || this.releaseGestureDrawn) return true;
    // 向き直す間は、別方向の移動矢印を重ねない。
    if (isTouch && $('objectives').classList.contains('facing-order')) return false;
    // 持ち場と移動の描画から呼ばれても、今の行き先は一度だけ描く。
    if (this.defenseAreaDrawn && $('objectives').classList.contains('defense-order')) return true;
    if (singleBattleGuide(rt) && this.destinationDrawn) return true;
    this.destinationDrawn = true;
    if (singleBattleGuide(rt) && (groundFlag(rt.missionGuide) || marker?.guideWaitRing) &&
        !marker?.guidePerson && !marker?.entrance && !marker?.guideDefend && !marker?.treatment) {
      setClass(this.root, 'travel-guide', true);
      return this.drawNamedDestination(g, rt, pos);
    }
    if (this.drawDefendedFlag(g, rt, marker, pos)) return true;
    if (marker?.guideDefend && this.drawDefenseArea(g, rt, rt.missionGuide)) return true;
    const waitCue = marker === rt.missionGuide?.marker && this.waitDestinationCue(rt, rt.missionGuide);
    // 待つ場所は動かない到着点。目当ての旗と既存の札を一組にする。
    if (marker?.guideWaitRing || waitCue?.outside) {
      const goal = this.project(pos, groundAt(rt.world, pos.x, pos.z, pos.y ?? rt.player.u.pos.y) + .08, rt,
        this.waitRingProjection || (this.waitRingProjection = {}));
      const bounds = this.goalFlagBounds(rt, marker, pos);
      const flagVisible = bounds && bounds.left >= 32 && bounds.left + bounds.width <= VIEW.w - 32 &&
        bounds.top >= 80 && bounds.top + bounds.height <= VIEW.h - 32;
      const visible = flagVisible || !goal.behind && goal.x >= 64 && goal.x <= VIEW.w - 64 &&
        goal.y >= 112 && goal.y <= VIEW.h - 32 && this.floorGoalVisible(rt, pos);
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0), p = rt.player.u.pos;
      const side = -(pos.x - p.x) * Math.cos(yaw) + (pos.z - p.z) * Math.sin(yaw);
      const x = visible ? flagVisible ? bounds.left + bounds.width / 2 : goal.x : side >= 0 ? VIEW.w - 64 : 64;
      const y = visible ? flagVisible ? bounds.top : goal.y : Math.max(112, Math.min(VIEW.h - 64, VIEW.h * .55));
      // 実旗と画面外の案内に、同じ切れ込みのある旗印を付ける。
      if (visible) {
        if (flagVisible) this.drawGoalFlagFrame(g, bounds);
        else this.drawTargetFootRing(g, rt, pos, 1, false, true);
      }
      if (!flagVisible) this.drawSmallGoalFlag(g, x - 8, y - 10, .65, false, !!marker.guideDefend, '');
      if (!visible && (!waitCue || waitCue.outside)) {
        // 同じ旗形を端に残し、矢じり全体を画面内へ収める。
        const angle = this.destinationDirection(rt, pos);
        this.drawNavigationArrow(g, x + Math.cos(angle) * 24, y + Math.sin(angle) * 24,
          angle, .55, true);
      }
      if (!travelSignPriority(rt)) this.drawDestinationStep(g, rt, pos);
      this.placeEdgeOrder(x, y - 48);
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand')) {
        const left = parseFloat(order.style.getPropertyValue('--ground-order-x'));
        const top = parseFloat(order.style.getPropertyValue('--ground-order-y'));
        if (visible) this.drawGuideLink(g, x, y - 22, left, top, left + order.offsetWidth, top + order.offsetHeight, true);
      }
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    const escort = rt.def.escortGuideTarget?.(rt);
    if (escort?.alive && !S.reduceGuidance) {
      const head = this.project(escort.pos, escort.pos.y + (escort.bodyHeight ?? 1.72) + .2, rt,
        this.escortHeadProjection || (this.escortHeadProjection = {}));
      if (!head.behind && head.x >= 40 && head.x <= VIEW.w - 52 && head.y >= 64 && head.y <= VIEW.h - 24 && this.talkPersonVisible(rt, escort)) {
        // 相手が見えている間は、壁際の戸口へもう一つの印を出さない。
        this.placeEdgeOrder(head.x, head.y - 64);
        const frame = this.measurePersonFrame(escort, rt, true);
        this.drawPersonAction(g, rt, head.x, head.y, `${escort.name || 'この人'}と進む`, frame);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
    }
    if (rt.def.groundAdvanceGuides && !marker?.guideFlag && !groundFlag(rt.missionGuide) && marker?.guideArea !== 'wait' && marker?.guideArea !== 'guard' &&
        !marker?.waitGuide && !marker?.guideDefend && !marker?.treatment &&
        this.drawAdvanceStep(g, rt, pos)) return true;
    // 出口など固定した地点は、見える時も画面外でも同じ旗と矢印で示す。
    if (marker?.guideSymbol === 'gate' || marker?.guideDestinationFlag) {
      setClass(this.root, 'travel-guide', true);
      return this.drawDestinationPointer(g, rt, pos, marker.guideSymbol === 'gate' ? 'gate' : true, .65);
    }
    // 主の行き先は指の手本が出ていても、短い言葉と床の輪を残す。
    if (rt.touchSwipeActive && marker !== rt.missionGuide?.marker && !rt.def.routeDestinationSight && !marker?.guideFlag && !groundFlag(rt.missionGuide)) {
      if (!this.drawTargetFootRing(g, rt, pos, .65)) this.drawOffscreenDirection(g, rt, pos);
      return true;
    }
    // 志賀など、到着後に印を畳む指定のある戦だけ。退く途中の矢印は残す。
    if (rt.def.hideArrivedDestination && marker?.hideOnArrival && marker.hideNear &&
        Math.hypot(pos.x - rt.player.u.pos.x, pos.z - rt.player.u.pos.z) < marker.hideNear) {
      this.drawFloorGoal(g, rt, pos.x, pos.z, false, .6);
      return true;
    }
    // 通り口の案内を移動用の印より先に使い、矢印を二重にしない。
    const passage = rt.def.placeFrame?.(rt);
    if (this.placeFrameShown && passage) {
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    if (passage && rt.def.singlePassageArrow) {
      const goal = this.passageGoal || (this.passageGoal = { x: 0, y: 0, z: 0 });
      goal.x = (passage[2].x + passage[3].x) / 2;
      goal.y = (passage[2].y + passage[3].y) / 2;
      goal.z = (passage[2].z + passage[3].z) / 2;
      pos = goal;
    }
    const path = rt.def.guidePath?.(rt, marker);
    if (singleBattleGuide(rt) && !this.openingActive && path?.length > 1 &&
        !marker?.guidePerson && !marker?.person && !marker?.treatment) {
      const drawn = this.drawRoutePath(g, rt, path, true);
      if (drawn) this.drawSmallGoalFlag(g, this.routePathTip.x, this.routePathTip.y, .5, false, false, '');
      else this.drawDestinationPointer(g, rt, pos, true, .5);
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    // 浅瀬など二点を結ぶ道は、次に通る地面の旗一つで示す。
    // 道筋・大小の矢印・「ここへ」の札を同時に重ねない。
    if (singleBattleGuide(rt) && marker?.guideArea === 'move' && path?.length === 2 && !rt.def.routeWaymarks) {
      const p = rt.player.u.pos, start = path[0], end = path[1];
      const entered = (p.x - start.x) * (end.x - start.x) + (p.z - start.z) * (end.z - start.z) >= 0;
      const goal = entered ? end : start;
      // 細道では途中の案内点へ旗を足さず、実際の角の矢印一つにまとめる。
      if (rt.def.groundRouteGuide && rt.def.cornerArrowMaxPixels) {
        if (!this.drawCornerArrow(g, rt, pos)) this.drawOffscreenDirection(g, rt, pos);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
      // 稲葉山の細道は、空に浮く旗でなく足元から道筋をつなぐ。
      // 指定のない戦では、従来の旗一つの案内を保つ。
      if (rt.def.groundRouteGuide) {
        if (this.drawRoutePath(g, rt, path, true)) {
          const tip = this.routePathTip;
          this.drawNavigationArrow(g, tip.x, tip.y, tip.angle, .65);
        } else this.drawOffscreenDirection(g, rt, goal);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
      const point = this.moveFlagPoint || (this.moveFlagPoint = { x:0, y:0, z:0 });
      point.x = goal.x; point.z = goal.z;
      point.y = groundAt(rt.world, goal.x, goal.z, p.y);
      // 指定した戦の浅瀬だけ、見切れた旗にも向きを添える。既存の札避けを共用する。
      if (rt.def.movePathDirection) {
        setClass(this.root, 'travel-guide', true);
        return this.drawDestinationPointer(g, rt, point, true, .65);
      }
      const s = this.project(point, point.y + .1, rt,
        this.moveFlagProjection || (this.moveFlagProjection = {}));
      const visible = !s.behind && s.x > 32 && s.x < VIEW.w - 32 && s.y > 80 && s.y < VIEW.h - 24 &&
        this.floorGoalVisible(rt, point);
      if (visible) this.drawTargetFootRing(g, rt, point, 1, false, true);
      else {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const side = -(goal.x - p.x) * Math.cos(yaw) + (goal.z - p.z) * Math.sin(yaw);
        this.drawSmallGoalFlag(g, side >= 0 ? VIEW.w - 48 : 48, VIEW.h / 2, .65);
      }
      // 任務の一枚を旗のそばへ置く。操作の札が出る間は別の札を足さない。
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand') &&
          !order.classList.contains('facing-order') && !rt.touchCoachActive) {
        const width = order.offsetWidth, height = order.offsetHeight;
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const side = -(goal.x - p.x) * Math.cos(yaw) + (goal.z - p.z) * Math.sin(yaw);
        const x = visible ? s.x : side >= 0 ? VIEW.w - 72 : 72;
        const y = visible ? s.y : VIEW.h / 2;
        const spot = this.goalFlagSpot(rt, x, y - 64, width, height);
        setClass(order, 'ground-order', true);
        setCssVar(order, '--ground-order-x', Math.round(spot.labelX - width / 2) + 'px');
        setCssVar(order, '--ground-order-y', Math.round(spot.labelY - height / 2) + 'px');
      }
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    // 道の入口を先に示し、通った後は出口へ渡す。到着の判定には触れない。
    if (singleBattleGuide(rt) && marker?.guideArea === 'move' && path?.length > 1) {
      const p = rt.player.u.pos, start = path[0], end = path[path.length - 1];
      const dx = end.x - start.x, dz = end.z - start.z;
      const entered = (p.x - start.x) * dx + (p.z - start.z) * dz >= 0;
      // 浅瀬の二点の道は足元からつなぐ。入口を通った後は後戻りの線を残さない。
      let route = path;
      if (path.length === 2) {
        route = this.moveRoute || (this.moveRoute = []);
        route.length = 0; route.push(p);
        if (!entered) route.push(start);
        route.push(end);
      }
      // 岸を横切る白線は足さず、本人から渡り先への道筋一つにまとめる。
      const routeDrawn = this.drawRoutePath(g, rt, route, true);
      const arrow = this.moveRouteArrow || (this.moveRouteArrow = { x:0, y:0, z:0 });
      const direction = this.moveRouteDirection || (this.moveRouteDirection = { dirX:0, dirZ:0, maxPixels:36 });
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 2) continue;
        direction.dirX = (b.x - a.x) / length; direction.dirZ = (b.z - a.z) / length;
        const count = rt.def.routeWaymarks ? Math.min(6, Math.max(2, Math.ceil(length / 4))) : 2;
        for (let step = 1; step <= count; step++) {
          arrow.x = a.x + (b.x - a.x) * step / (count + 1);
          arrow.z = a.z + (b.z - a.z) * step / (count + 1);
          arrow.y = groundAt(rt.world, arrow.x, arrow.z, p.y);
          this.drawFloorWaymark(g, rt, arrow, false, direction);
        }
      }
      setClass(this.root, 'travel-guide', true);
      let x, y;
      if (routeDrawn) {
        x = this.routePathTip.x; y = this.routePathTip.y;
      } else {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
        const goal = entered ? end : start;
        const gx = goal.x - p.x, gz = goal.z - p.z;
        const side = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
        const forward = gx * Math.sin(yaw) + gz * Math.cos(yaw);
        x = side >= 0 ? VIEW.w - 48 : 48; y = VIEW.h / 2;
      }
      // 描いた道の先端を動かさない。印だけを中央へ寄せると案内線が途切れる。
      if (!routeDrawn) {
        x = Math.max(72, Math.min(VIEW.w - 72, x));
        y = Math.max(144, Math.min(VIEW.h - 112, y));
      }
      const goal = entered ? end : start;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const gx = goal.x - p.x, gz = goal.z - p.z;
      const angle = routeDrawn ? this.routePathTip.angle : Math.atan2(-(gx * Math.sin(yaw) + gz * Math.cos(yaw)), -gx * Math.cos(yaw) + gz * Math.sin(yaw));
      this.drawNavigationArrow(g, x, y, angle, 1);
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand')) {
        setClass(order, 'linked-destination', true);
        setClass(order, 'ground-order', true);
        const sizeKey = order.textContent + ':' + VIEW.w + ':' + VIEW.h;
        if (this.singleOrderKey !== sizeKey) {
          this.singleOrderKey = sizeKey;
          this.singleOrderW = order.offsetWidth; this.singleOrderH = order.offsetHeight;
        }
        const width = this.singleOrderW, height = this.singleOrderH;
        const lx = x + 44 + width <= VIEW.w - 12 ? x + 44 : x - width - 16;
        const left = Math.round(Math.max(12, Math.min(VIEW.w - width - 12, lx)));
        const top = Math.round(Math.max(24, Math.min(VIEW.h - height - 112, y - 32 - height)));
        setCssVar(order, '--ground-order-x', left + 'px');
        setCssVar(order, '--ground-order-y', top + 'px');
        this.drawGuideLink(g, x, y - 24, left, top, left + width, top + height, true);
      }
      // 命・任務と合わせ三枚まで。矢印の先に短い行き先だけを添える。
      const occupied = this.notices.picks.length + Number(!!this.healthRect) + Number(!$('boss').hidden) +
        Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
        Number(!!rt.nearestInteract() || !!rt.touchCoachActive);
      if (!rt.touchCoachActive && !this.notices.sources[1].selected && occupied < 3) {
        const scale = Math.max(1, S.textScale || 1), height = 30 * scale;
        g.save(); g.font = `bold ${20 * scale}px sans-serif`;
        const label = this.destinationPurpose(rt);
        const half = g.measureText(label).width / 2 + 10;
        const spot = this.avoidRects(x, y - 62, VIEW.w, VIEW.h, 'v', null, half + 4, height + 4, true);
        if (spot) {
          const left = spot[0] - half, top = spot[1] - height;
          this.drawGuideLink(g, x, y, left, top, left + half * 2, top + height, true);
          g.fillStyle = '#14120f'; g.fillRect(left, top, half * 2, height);
          g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(label, spot[0], top + height / 2);
        }
        g.restore();
      }
      return true;
    }
    if (singleBattleGuide(rt) && marker?.guideArea === 'move') {
      setClass(this.root, 'travel-guide', true);
      if (this.drawCornerArrow(g, rt, pos)) return true;
      // 角が見えない時は左右の端で向きを示し、自分の体の上へ戻さない。
      const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      this.drawNavigationArrow(g, side >= 0 ? VIEW.w - 48 : 48, VIEW.h / 2, Math.atan2(-forward, side), .65);
      return true;
    }
    // 帰る旗がある時は、道の途中に別方向の矢印を足さない。
    const defendRoute = marker?.guideDefend && !marker.guideFlag && path?.length > 1 && this.drawRoutePath(g, rt, path, true);
    if (!marker?.guideDefend && path?.length > 1) {
      const end = path[path.length - 1];
      // 道筋を描けても到着の印を省かない。浅瀬などの場所を地面で示す。
      const routeDrawn = this.drawRoutePath(g, rt, path);
      const goalDrawn = this.drawFloorGoal(g, rt, end.x, end.z, false, rt.def.routeGoalRadius ?? 1.4);
      if (goalDrawn) {
        const goal = this.project(end, groundAt(rt.world, end.x, end.z, rt.player.u.pos.y) + .18, rt);
        this.drawSmallGoalFlag(g, goal.x, goal.y, .65);
      }
      // 指定の戦では、見えている道筋と足元の矢印を二重に出さない。
      if (!rt.def.singleRouteGuide || !routeDrawn) this.drawApproachRoute(g, rt, pos, marker?.guideRadius || 3);
      if (routeDrawn || goalDrawn) {
        if (!goalDrawn) this.drawDestinationPointer(g, rt, end, true);
        setClass(this.root, 'travel-guide', true);
        return true;
      }
    }
    // 寺内は次の戸口・角への矢印一つ。見える戸口に重ね、壁越しなら通れる道へ向ける。
    const doorway = rt.def.routeDestinationSight && marker?.id === 'next' && !marker.waitGuide && marker.guideArea !== 'wait';
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const waiting = marker?.guideArea === 'wait' || marker?.guideArea === 'guard' || marker?.waitGuide;
    const nextMove = singleBattleGuide(rt) && marker?.guideArea === 'move' && !waiting;
    const signScale = rt.def.groundFlagGuides ? .65 : waiting || nextMove ? 1 : rt.def.compactDestinationSign || rt.def.compactTravelArrow ? .65 : 1;
    const point = this.singleGoalPoint || (this.singleGoalPoint = { x: 0, y: 0, z: 0 });
    const nextPoint = doorway && marker?.entrance ? rt.missionGuide?.pos || pos : pos;
    const sign = doorway ? rt.def.routeSignPoint?.(rt, nextPoint) || nextPoint : pos;
    point.x = sign.x; point.z = sign.z;
    point.y = sign.y ?? groundAt(rt.world, point.x, point.z, pos.y ?? p.y);
    // 携帯の道案内は、既存の任務一枚を次の戸口の旗へ添える。
    if (isTouch && doorway && rt.def.routeGuidePriority?.(rt)) {
      setClass(this.root, 'travel-guide', true);
      return this.drawNamedDestination(g, rt, point, sign.door ? sign.frame : null);
    }
    // 道の旗だけで終わらず、直近の通れる床にも進む向きを残す。
    if (doorway && !marker?.person && !marker?.guidePerson)
      this.drawDestinationStep(g, rt, point, true);
    // 旗を持つ人が動く時は根元を追う。待つ持ち場の中心は動かさない。
    const isFlag = !doorway && marker === rt.missionGuide?.marker && groundFlag(rt.missionGuide);
    let flagBounds = !waiting && (isFlag || marker?.guideFlag) ? this.goalFlagBounds(rt, marker, pos) : null;
    // 囲みと上の旗印まで入らなければ、画面端の案内へ渡す。
    const clippedFlag = flagBounds && (flagBounds.left < 28 || flagBounds.top < 100 ||
      flagBounds.left + flagBounds.width > W - 28 || flagBounds.top + flagBounds.height > H - 28);
    if (clippedFlag) flagBounds = null;
    if (isFlag && !waiting) {
      this.goalFlagBounds(rt, marker, pos);
      const foot = this.goalFlagFoot || pos;
      point.x = foot.x; point.z = foot.z;
      point.y = groundAt(rt.world, foot.x, foot.z, foot.y ?? p.y);
    }
    let s = this.project(point, point.y + .18, rt,
      this.singleGoalProjection || (this.singleGoalProjection = {}));
    if (doorway && sign.door && sign.frame) {
      // 床が画面下へ切れても、見えている入口を端の横矢印へ替えない。
      const frame = sign.frame;
      const head = this.doorwayHead || (this.doorwayHead = { x: 0, y: 0, z: 0 });
      head.x = (frame[1].x + frame[2].x) / 2;
      head.y = (frame[0].y + frame[1].y + frame[2].y + frame[3].y) / 4 + .3;
      head.z = (frame[1].z + frame[2].z) / 2;
      s = this.project(head, head.y, rt, s);
    }
    const sightPointPos = this.doorwayProbe || (this.doorwayProbe = { x: 0, y: 0, z: 0 });
    const doorDistance = Math.max(.001, Math.hypot(p.x - point.x, p.z - point.z));
    const doorInset = doorway && sign.door ? Math.min(.35, doorDistance * .5) / doorDistance : 0;
    sightPointPos.x = point.x + (p.x - point.x) * doorInset;
    sightPointPos.z = point.z + (p.z - point.z) * doorInset;
    sightPointPos.y = point.y;
    // 開口の見通しはカメラ側の面で調べる。本人側へ寄せると、
    // 三人称の視点からは壁の裏と判定され、見えている戸口の印まで消える。
    const cameraProbe = this.doorwayCameraProbe || (this.doorwayCameraProbe = { x: 0, y: 0, z: 0 });
    const cameraDistance = Math.max(.001, Math.hypot(rt.camera.position.x - point.x, rt.camera.position.z - point.z));
    const cameraInset = doorway && sign.door ? Math.min(.35, cameraDistance * .5) / cameraDistance : 0;
    cameraProbe.x = point.x + (rt.camera.position.x - point.x) * cameraInset;
    cameraProbe.z = point.z + (rt.camera.position.z - point.z) * cameraInset;
    cameraProbe.y = point.y;
    const sight = this.doorwaySight || (this.doorwaySight = { at: -1 });
    if (doorway && (sight.rt !== rt || sight.at <= rt.t || sight.at > rt.t + .5 ||
        sight.x !== point.x || sight.z !== point.z || Math.hypot(p.x - sight.px, p.z - sight.pz) > 1)) {
      sight.rt = rt; sight.at = rt.t + .5; sight.x = point.x; sight.z = point.z; sight.px = p.x; sight.pz = p.z;
      sight.clear = localClear(rt.army, p, sightPointPos);
    }
    this.placeFrameShown = false;
    const framedDoor = doorway && sign.door && sign.frame && sight.clear &&
      sightPoint(rt, cameraProbe, 170, true, 1.2) && this.drawPlaceFrame(g, rt, sign.frame);
    const bend = doorway && this.drawRouteBend(g, rt, sign);
    let visible = bend || framedDoor || !s.behind && s.x >= 48 && s.x <= W - 48 && s.y >= (doorway ? 64 : 100) && s.y <= H - 32 &&
      (doorway ? sight.clear && sightPoint(rt, cameraProbe, 170, true, 1.2) : waiting || this.floorGoalVisible(rt, point));
    if (flagBounds && !sightPoint(rt, point, 170, true, 1.6)) flagBounds = null;
    if (flagBounds) {
      const fx = Math.max(48, Math.min(W - 48, flagBounds.left + flagBounds.width / 2));
      const fy = Math.max(112, Math.min(H - 32, flagBounds.top));
      visible = fx >= 32 && fx <= W - 32 && fy >= 56 && fy <= H - 32;
      if (visible) { s.x = fx; s.y = fy; }
    }
    // 戸口の床が見える時は床を優先し、見切れた時だけ同じ開口の高さを使う。
    if (doorway && sign.door && visible) {
      const floor = this.project(point, point.y + .18, rt,
        this.doorFloorProjection || (this.doorFloorProjection = {}));
      if (!floor.behind && floor.x >= 32 && floor.x <= W - 32 && floor.y >= 64 && floor.y <= H - 32) s = floor;
    }
    // 目当ての実物が隠れた時は、近くの地面を別の旗に見立てない。
    if (isFlag && !waiting && !rt.def.footFlagGuides && (marker.guideFlagFrame || marker.guideFlagMesh) && !flagBounds) visible = false;
    if (clippedFlag) visible = false;
    // 指定済みの目的地は足元の投影を保つ。霧や斜面の視認判定で端へ移さない。
    const distance = Math.hypot(pos.x - p.x, pos.z - p.z);
    const atWait = waiting && (marker.guideArea === 'guard' ? guardPostDistance(rt, rt.missionGuide) : distance) < (marker.guideRadius || 8);
    // 小さい画面では、着地点の輪と一枚の札にまとめる。
    const mobileFlag = !atWait && singleBattleGuide(rt) && marker === rt.missionGuide?.marker &&
      !marker.red && !marker.person && !marker.guidePerson && !marker.entrance &&
      !marker.guideSymbol && !marker.treatment && !marker.guideDefend && marker.guideArea !== 'guard';
    if (!mobileFlag && waiting && !atWait && (isFlag || marker.guideFlag))
      this.drawTargetFootRing(g, rt, pos, 1.25, false, true);
    // 到着したら移動の旗を畳む。足元の丸に旗を重ねて、まだ進むように見せない。
    if (atWait && marker.guideArea !== 'guard' && !this.defendEnemy?.alive && !rt.def.waitFacingPoint?.(rt)) {
      if (!this.drawWaitFrame(g, rt, pos, marker.guideRadius || 8))
        this.drawTargetFootRing(g, rt, p, .65);
      setClass($('objectives'), 'ground-order', false);
      return true;
    }
    // 旗のそばに今の行動を一枚だけ置く。画面外では端の矢印へ渡す。
    if (mobileFlag) {
      setClass(this.root, 'edge-destination', true);
      setClass(this.root, 'travel-guide', true);
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const dx = point.x - p.x, dz = point.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      let x = s.x, y = s.y;
      const floor = this.project(point, point.y + .08, rt,
        this.goalArrivalProjection || (this.goalArrivalProjection = {}));
      visible = !floor.behind && floor.x >= 48 && floor.x <= W - 48 &&
        floor.y >= 100 && floor.y <= H - 32 && this.floorGoalVisible(rt, point);
      if (visible) {
        x = floor.x; y = floor.y - 60;
      } else {
        x = side >= 0 ? W - 84 : 84;
        y = Math.max(112, Math.min(H - 92, H * .55)) - 12;
      }
      // 見える時は床の輪、画面外では端の矢印一つ。
      const scale = Math.max(1, S.textScale || 1);
      const height = Math.ceil(40 * scale);
      g.save(); g.font = `bold ${22 * scale}px sans-serif`;
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const caption = this.destinationPurpose(rt);
      const width = g.measureText(caption).width + 24;
      const flagSpot = this.goalFlagSpot(rt, x, y, width, height);
      if (visible) this.drawTargetFootRing(g, rt, point, 1, false, true);
      else this.drawNavigationArrow(g, x, y,
        Math.atan2(-(dx * Math.sin(yaw) + dz * Math.cos(yaw)), side), .65, true);
      const left = flagSpot.labelX - width / 2;
      const top = flagSpot.labelY - height / 2;
      // 既存の任務をこの一枚へ置き換え、命の欄などと合わせて三枚まで。
      const occupied = this.notices.picks.length - Number(this.notices.sources[1].selected) +
        Number(!!this.healthRect) + Number(!$('boss').hidden) +
        Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
        Number(!!rt.nearestInteract() || !!rt.touchCoachActive);
      if (occupied < 3) {
        this.drawGuideLink(g, visible ? floor.x : x, visible ? floor.y - 22 : y, left, top, left + width, top + height, true);
        g.fillStyle = '#14120f';
        g.fillRect(left, top, width, height);
        g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(caption, flagSpot.labelX, flagSpot.labelY);
      } else setClass(this.root, 'edge-destination', false);
      g.restore();
      return true;
    }
    if (marker.guideArea === 'guard' && atWait && this.waitGuardButton && !this.waitGuardButton.hidden) return true;
    if (marker.guideArea === 'guard' && !atWait) {
      // 帰る旗とそこへ続く道だけを残し、下向きの大矢印を重ねない。
      return this.drawRetreatDestination(g, rt, pos, visible, s.x, s.y, false);
    }
    // 待つ輪を描いて処理を終える前に、足元から向く先を示す。
    const waitFacing = atWait && !this.defendEnemy?.alive && rt.def.waitFacingPoint?.(rt);
    if (waitFacing) {
      setClass($('objectives'), 'ground-order', false);
      this.drawFootDirection(g, rt, waitFacing);
      return true;
    }
    // 到着前は旗だけを示し、地面の輪を別の行き先に見せない。
    const waitFrame = marker.guideArea === 'wait' && atWait && !this.defendEnemy?.alive &&
      this.drawWaitFrame(g, rt, point, marker.guideRadius || 8);
    if (waitFrame && (atWait || !flagBounds) && (atWait || !s.behind && s.x >= 24 && s.x <= W - 24 && s.y >= 64 && s.y <= H - 24)) {
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand') && !order.classList.contains('facing-order')) {
        setClass(order, 'linked-destination', true); setClass(order, 'ground-order', true);
        const width = order.offsetWidth, height = order.offsetHeight;
        const anchor = atWait ? this.project(p, p.y + .08, rt,
          this.waitPlayerProjection || (this.waitPlayerProjection = {})) : s;
        setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(W - width - 12, anchor.x + 48))) + 'px');
        setCssVar(order, '--ground-order-y', Math.round(Math.max(64, Math.min(H - height - 24, anchor.y - height - 48))) + 'px');
      }
      return true;
    }
    // 接敵後は持ち場の大旗を畳み、相手の足元の印へ渡す。
    if (atWait && this.defendEnemy?.alive) return true;
    // 固定する指定のない持ち場だけ、同じ輪の中で見える場所へ旗と札を寄せる。
    // 到着の判定は元の中心・半径のまま。
    if (atWait && !visible && !rt.def.compactHoldGuide) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0), radius = marker.guideRadius || 8;
      for (let i = 0; i < 3; i++) {
        const offset = radius * (.85 - i * .25);
        point.x = pos.x + Math.sin(yaw) * offset;
        point.z = pos.z + Math.cos(yaw) * offset;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
        const flag = this.project(point, point.y + .18, rt);
        if (flag.behind || flag.x < 48 || flag.x > W - 80 || flag.y < 100 || flag.y > H - 32 ||
            !this.destinationPointerClear(flag.x, flag.y - 28, this.hudRects()) || !this.floorGoalVisible(rt, point)) continue;
        s = flag; visible = true; break;
      }
      if (!visible) {
        point.x = pos.x; point.z = pos.z;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
      }
    }
    // 到着後に持ち場が背中へ隠れても、戻る矢印は出さない。
    if (atWait && marker.guideArea !== 'guard') this.drawDestinationArea(g, rt, pos, marker.guideRadius || 8, false);
    // 戸口が曲がり角の向こうなら、壁に横矢印を貼らず、そこまで通れる床を示す。
    if (doorway && !visible) {
      const dx = point.x - p.x, dz = point.z - p.z, length = Math.hypot(dx, dz);
      const ahead = this.cornerFloorPoint || (this.cornerFloorPoint = { x:0, y:0, z:0 });
      for (let step = Math.min(5, length); step >= 1; step -= 1) {
        ahead.x = p.x + dx * step / length; ahead.z = p.z + dz * step / length;
        ahead.y = groundAt(rt.world, ahead.x, ahead.z, p.y);
        const q = this.project(ahead, ahead.y + .18, rt,
          this.cornerFloorProjection || (this.cornerFloorProjection = {}));
        if (q.behind || q.x < 64 || q.x > W - 64 || q.y < 100 || q.y > H - 48 ||
            !localClear(rt.army, p, ahead) || !this.floorGoalVisible(rt, ahead)) continue;
        point.x = ahead.x; point.y = ahead.y; point.z = ahead.z;
        s = q; visible = true; break;
      }
    }
    // 行き先は目的地の印か端の矢印にまとめ、足元の矢印と競わせない。
    let x = s.x, y = s.y;
    // 到着した輪が画面の下へ切れても、移動の矢印へ戻さない。
    if (!visible && atWait) {
      x = Math.max(80, Math.min(W - 80, x));
      y = Math.max(154, Math.min(H - 40, y));
    }
    setClass(this.root, 'travel-guide', true);
    // 指定した戦では旗と守備先も札を避ける。到着済みの持ち場は移動の案内へ戻さない。
    if ((rt.def.avoidAllDestinationNotices && !atWait ||
        !waiting && !groundFlag(rt.missionGuide) && rt.def.avoidDestinationNotices) &&
        (!visible || this.hudRects().some(r => x + 36 > r.left && x - 36 < r.right &&
          y + 8 > r.top && y - 64 < r.bottom))) {
      return this.drawDestinationPointer(g, rt, pos);
    }
    if (waiting && !atWait && !defendRoute && marker.guideArea !== 'guard' && !isFlag) {
      // 到着先の足形が遠くても、目の前の通れる床に一本だけ矢印を残す。
      const ahead = this.waitFloorAhead || (this.waitFloorAhead = { x: 0, y: 0, z: 0 });
      for (let step = Math.min(4, distance - 1.5); step >= 1.5; step -= 1) {
        ahead.x = p.x + (pos.x - p.x) * step / distance;
        ahead.z = p.z + (pos.z - p.z) * step / distance;
        ahead.y = groundAt(rt.world, ahead.x, ahead.z, p.y);
        if (localClear(rt.army, p, ahead) && this.drawFloorWaymark(g, rt, ahead)) break;
      }
    } else if (visible && !waiting && !nextMove && !rt.def.singleDestinationArrow && !doorway && !isFlag) this.drawApproachRoute(g, rt, pos, marker?.guideRadius || 3);
    g.save(); g.lineJoin = 'round';
    if (!visible && !atWait) {
      const way = this.singleGoalWay || (this.singleGoalWay = { x: 0, z: 0, at: -1 });
      if (way.rt !== rt || way.at <= rt.t || way.at > rt.t + .5 || way.gx !== point.x || way.gz !== point.z) {
        const next = doorway || groundFlag(rt.missionGuide) ? point : rt.world.def.guideWay?.(rt.player.u, point) || point;
        way.rt = rt; way.x = next.x; way.z = next.z;
        way.gx = point.x; way.gz = point.z; way.at = rt.t + .5;
      }
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
      const dx = way.x - p.x, dz = way.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      {
        const top = Math.min(144, H / 3), bottom = H - 80;
        const scale = Math.min(Math.max(12, W / 2 - 80) / Math.max(.001, Math.abs(side)),
          Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
        x = side >= 0 ? W - 64 : 64;
        y = doorway || isFlag ? (top + bottom) / 2 : (top + bottom) / 2 - forward * scale;
        // 見えない戸口には壁の上から下矢印を貼らず、画面の端で振り向く側を示す。
        if ((isFlag || waiting) && forward < 0) x = side >= 0 ? W - 64 : 64;
        // 道が見える時は、その先端に旗と矢印をまとめる。
        if (defendRoute) { x = this.routePathTip.x; y = this.routePathTip.y; }
        // 旗と矢印を一組にし、既存の札に重なる時は端に沿って空きを探す。
        if (doorway) {
          x = side >= 0 ? W - 80 : 80;
          const rects = this.hudRects(), bodies = this.goalBodyRects(rt);
          const middle = y;
          let best = Infinity;
          for (let i = 0; i < 25; i++) {
            const candidate = middle + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 12;
            if (candidate < 88 || candidate > H - 48) continue;
            if (rects.some(r => r !== this.guideOrderRect && x + 32 > r.left && x - 32 < r.right &&
                candidate + 32 > r.top && candidate - 32 < r.bottom)) continue;
            let overlap = 0;
            for (let j = 0; j < this.goalBodyCount; j += 4)
              overlap += Math.max(0, Math.min(x + 32, bodies[j + 2]) - Math.max(x - 32, bodies[j])) *
                Math.max(0, Math.min(candidate + 32, bodies[j + 3]) - Math.max(candidate - 32, bodies[j + 1]));
            const score = overlap * 1000 + Math.abs(candidate - middle);
            if (score < best) { best = score; y = candidate; }
          }
          // 戸口が隠れた時だけ端に一つ。札との間に別の矢印を足さない。
          // 操作の文と同じ本人基準の八方向へそろえる。
          const direction = this.navigationDirection(rt, sign);
          const ax = direction.includes('右') ? 1 : direction.includes('左') ? -1 : 0;
          const ay = direction.includes('下') ? 1 : direction.includes('上') ? -1 : 0;
          this.drawNavigationArrow(g, x, y, Math.atan2(ay, ax), .55, true);

        } else if (isFlag || !defendRoute && !marker?.treatment) {
          if (isFlag && !atWait) {
            const caption = rt.def.edgeDestinationCaption?.(rt, marker, distance) || `はたまで ${Math.ceil(distance)}メートル`;
            g.font = 'bold 16px sans-serif';
            const half = g.measureText(caption).width / 2 + 12;
            x = side >= 0 ? W - half - 12 : half + 12;
            setClass(this.root, 'edge-destination', true);
            this.drawEdgeDestination(g, x, y, side >= 0 ? 0 : Math.PI, !!marker.guideDefend, caption);
          } else {
            // 実物の旗でない道の角や木戸は、戦で決めた行き先の名を示す。
            const caption = rt.def.edgeDestinationLabel?.(rt);
            if (caption) {
              g.font = 'bold 16px sans-serif';
              const half = Math.max(36, g.measureText(caption).width / 2 + 12);
              x = side >= 0 ? W - half - 12 : half + 12;
            }
            this.drawEdgeDestination(g, x, y, side >= 0 ? 0 : Math.PI, !!marker.guideDefend, caption || '旗へ');
          }
        } else if (!marker?.treatment) this.drawNavigationArrow(g, x, y, defendRoute ? this.routePathTip.angle : Math.atan2(-forward, side), signScale);
        if (isFlag) this.flagEdgeSide = side >= 0 ? '右へ' : '左へ';
        if (marker?.treatment) this.drawTreatmentCross(g, x, y);
        else if (defendRoute && !doorway && !isFlag && !(rt.def.routeGuideArrowOnly && !waiting)) this.drawSmallGoalFlag(g, x - 12, y - 28, .65, false, !!marker.guideDefend);
      }
    }
    // 実物の旗には同じ旗形を付け、近い人の足元へ印を移さない。
    if (visible) {
      if (doorway) {
        // 戸口の枠と一本の矢印にまとめ、旗や足あとは重ねない。
        // 曲がり角はすでに描いた折れ矢印だけを使う。
        if (bend) {
          x = this.bendScreen[4]; y = this.bendScreen[5];
        } else if (framedDoor) {
          const bounds = this.doorwayBounds;
          x = bounds.arrowX; y = bounds.arrowY;
          // 枠の描画側で矢印を出す戦には追加しない。
          if (rt.def.routeFootsteps) this.drawNavigationArrow(g, x, y,
            this.destinationDirection(rt, sign), .65, true);
        } else {
          const direction = this.cornerFloorDirection || (this.cornerFloorDirection = { dirX:0, dirZ:0, maxPixels:64 });
          const span = Math.hypot(sign.x - p.x, sign.z - p.z) || 1;
          direction.dirX = (sign.x - p.x) / span; direction.dirZ = (sign.z - p.z) / span;
          if (!this.drawFloorWaymark(g, rt, point, false, direction))
            this.drawNavigationArrow(g, x, y, this.destinationDirection(rt, sign), .65, true);
        }
      } else if (marker?.treatment) {
        const floorSign = this.drawFloorWaymark(g, rt, point, false, null, true);
        if (!rt.def.compactTreatmentSign || !floorSign) this.drawTreatmentCross(g, x, y);
      } else if (isFlag || waiting) {
        // 移動中は本人の丸から行き先まで一本で結ぶ。
        const foot = this.project(p, p.y + .08, rt,
          this.destinationPlayerProjection || (this.destinationPlayerProjection = {}));
        if (atWait && marker.guideArea !== 'guard') this.drawFloorWaymark(g, rt, point, false);
        const smallGuard = marker.guideArea === 'guard' && rt.def.compactGuardDestination;
        // 白い自分の輪とは、太い墨縁と旗形で見分ける。
        // 布の囲みか持ち上げた旗を一つだけ出し、足元に別の旗を重ねない。
        if (rt.def.footFlagGuides) {
          this.drawSmallGoalFlag(g, x, y, .65, false, waiting);
        } else if (flagBounds && !smallGuard) {
          // 目当ての布だけ太く囲む。案内は札からの一本へまとめる。
          this.drawGoalFlagFrame(g, flagBounds, false, isFlag || !!marker.guideFlagFrame || !!marker.guideFlagMesh);
          // 目当ての旗の囲みだけを残す。
        } else if (marker.guideArea === 'guard') {
          // 守る場所は旗で示す。操作は持ち場の長押し釦へまとめる。
          this.drawSmallGoalFlag(g, x, y, smallGuard ? .5 : .65, false, true);
        } else {
          const flag = this.drawRaisedGoalFlag(g, rt, x, y, !!marker.guideDefend);
          x = flag.x; y = flag.y;
        }
        if (!foot.behind && !atWait && (!rt.def.singleRouteGuide || !defendRoute))
          this.drawFlagLink(g, foot.x, foot.y, x, y);
      } else if (marker?.guideArea === 'move' && !nextMove) this.drawTargetFootRing(g, rt, point);
      // 矢印が本人の体（頭から足）に重なる時は出さない（頭を指す矢印に見える）。
      else {
        const head = this.project(p, p.y + 2.1, rt), foot = this.project(p, p.y, rt);
        const onBody = Math.hypot(point.x - p.x, point.z - p.z) < 4 && !head.behind && Math.abs(x - head.x) < 44 && y > head.y - 50 && y < foot.y + 10;
        if (!onBody) this.drawNavigationArrow(g, x, y,
          rt.def.directionalDestinationArrow ? this.destinationDirection(rt, point) : Math.PI / 2, signScale);
      }
    }
    const order = $('objectives');
    const localOrder = (escort?.alive || doorway || isFlag || waiting || !singleBattleGuide(rt)) && this.notices.sources[1].selected && !order.classList.contains('expand');
    if (localOrder && !(isFlag && !visible && !atWait)) {
      // 向きは既存の任務札へ添える。新しい知らせの枠は増やさない。
      if (isFlag && !atWait) {
        const now = order.querySelector('li.cur .obj-now');
        if (now) {
          const direction = this.flagDirectionEl || (this.flagDirectionEl = document.createElement('small'));
          if (direction.parentNode !== now) now.appendChild(direction);
          direction.style.cssText = 'display:block!important;font-size:max(22px,calc(22px * var(--text-scale,1)))!important;line-height:1.4;white-space:nowrap';
          const remaining = rt.def.distanceUnit === 'steps' ? `あと${Math.max(1, Math.ceil(distance / .75))}歩` : `あと${Math.ceil(distance)}メートル`;
          const detail = rt.def.flagDirectionOnly ? (visible ? 'あの旗へ' : this.flagEdgeSide) :
            `${visible ? 'あの旗へ・' : this.flagEdgeSide + '・'}${remaining}`;
          setText(direction, detail);
          direction.hidden = false;
        }
      }
      setClass(order, 'linked-destination', true);
      setClass(order, 'ground-order', true);
      const sizeKey = order.textContent + ':' + W + ':' + H + ':' + (isFlag && !visible && !atWait);
      if (this.singleOrderKey !== sizeKey) {
        this.singleOrderKey = sizeKey;
        this.singleOrderW = order.offsetWidth; this.singleOrderH = order.offsetHeight;
      }
      const width = this.singleOrderW, height = this.singleOrderH;
      // 旗と札の間に余白を取り、一本の矢印で根元へ結ぶ。
      const besideFlag = doorway || isFlag || waiting;
      const doorBounds = doorway && visible && sign.door && this.placeFrameShown ? this.doorwayBounds : null;
      const flagLeft = doorBounds ? doorBounds.left : flagBounds ? Math.min(x - 28, flagBounds.left) : x - 28;
      const flagRight = doorBounds ? doorBounds.right : flagBounds ? Math.max(x + 40, flagBounds.left + flagBounds.width) : x + 40;
      const preferredX = doorway ? (x + 44 + width <= W - 12 ? x + 44 : x - width - 44) : besideFlag ? (flagRight + 16 + width <= W - 12 ? flagRight + 16 : flagLeft - width - 16) : x - width / 2;
      // 旗と指図を一か所で読めるよう、見えている旗の横へまとめる。
      let lx = besideFlag && (visible || doorway) ? Math.max(12, Math.min(W - width - 12, preferredX)) : x >= W / 2 ? W - width - 12 : 12;
      const overlapsFlag = besideFlag && lx < flagRight + 8 && lx + width > flagLeft - 8;
      const preferredY = doorway ? y - 22 - height / 2 : overlapsFlag ? Math.min(y - 72, flagBounds?.top ?? y - 72) - height - 16 : besideFlag ? (flagBounds?.top ?? y - 60) - height / 2 : y - 56 * signScale - height - 8;
      let ly = Math.max(12, Math.min(H - height - 12, besideFlag && (visible || doorway) ? preferredY : 16));
      // 護衛相手を隠さず、札は反対側の端で読む。命の欄より上へ置く。
      if (escort?.alive) {
        const head = this.escortHeadProjection;
        lx = head && !head.behind && head.x < W / 2 ? W - width - 16 : 16;
        ly = Math.max(64, Math.min(H - height - 80, 88));
      }
      setCssVar(order, '--ground-order-x', Math.round(lx) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(ly) + 'px');
      // 戸口の矢印と横の札を結び、隣の襖への札と取り違えないようにする。
      if (!escort?.alive && !doorway && !rt.def.footFlagGuides && !doorBounds && (!isFlag || visible && flagBounds)) this.drawGuideLink(g, flagBounds && visible ? flagBounds.left + flagBounds.width / 2 : x, flagBounds && visible ? flagBounds.top + flagBounds.height / 2 : y - 18,
        lx, ly, lx + width, ly + height, true, /この旗へ/.test(order.textContent));
    }
    const occupied = this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.nearestInteract() || !!rt.touchCoachActive || rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6);
    if (!singleBattleGuide(rt) && !localOrder && occupied < 3) {
      const label = atWait ? 'ここで待とう' : rt.def.travelGuideLabel?.(rt) || (marker?.guideArea === 'wait' ? '旗の輪に入ろう' : marker?.guideArea === 'retreat' ? '旗へもどろう' : '旗へ すすめ');
      g.font = 'bold 18px sans-serif';
      const half = g.measureText(label).width / 2 + 10;
      const spot = this.avoidRects(x, Math.max(100, y - 60), W, H, 'v', this.rectsAll, half + 4, 32, true);
      if (spot) {
        const lx = spot[0], ly = spot[1] - 16;
        this.drawGuideLink(g, x, y - 18, lx - half, ly - 16, lx + half, ly + 16);
        g.fillStyle = '#14120f'; g.fillRect(lx - half, ly - 16, half * 2, 32);
        g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, lx, ly);
      }
    }
    g.restore(); return true;
  }
}
