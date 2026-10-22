import { VIEW } from "./viewport.js";
import { isTouch, touchMoveLearned } from "./touch.js";
import { singleBattleGuide, setClass, $, retreatRequired, setCssVar } from "./hud_common.js";
import { S } from "./settings.js";
import { groundAt } from "./floors.js";
import { sightUnit, sightScreenUnit } from "./battle_sight.js";

export class HudGestures {


  // なぞる案内は足元から終点へ一本。開幕と移動、待つ向きで同じ太さを使う。
  clearMoveOrigin(rt, foot, lower = false) {
    const W = VIEW.w, H = VIEW.h;
    const result = this.clearMovePoint || (this.clearMovePoint = {});
    if (result.rt === rt && result.w === W && result.h === H && result.lower === lower && rt.t >= result.at && rt.t < result.at + .1) return result;
    result.rt = rt; result.w = W; result.h = H; result.at = rt.t; result.lower = lower;
    if (isTouch && !rt.def.town && !rt.def.dojo) {
      const start = this.playerControlOrigin(rt);
      result.x = start.x; result.y = start.y;
      return result;
    }
    // 町と道場は従来の操作面を使う。
    if (isTouch && singleBattleGuide(rt)) {
      result.x = W * (S.touchSwap ? .75 : .25);
      result.y = Math.max(144, H - 128);
      const obstacles = rt.def.moveGuideObstacles?.(rt);
      if (obstacles?.length) {
        const center = result.x, y = result.y;
        const screen = this.moveObstacleProjection || (this.moveObstacleProjection = {});
        const bodies = this.goalBodyRects(rt), rects = this.hudRects();
        let best = Infinity;
        // 指・上向き矢印・短い札まで空く場所を、移動する側の床で探す。
        for (let i = 0; i < 7; i++) {
          const x = center + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 48;
          if (x < 100 || x > W - 100 || (x < W / 2) === !!S.touchSwap) continue;
          let overlap = 0;
          for (const obstacle of obstacles) {
            const q = this.project(obstacle, obstacle.y, rt, screen);
            if (!q.behind && Math.abs(q.x - x) < 70 && q.y > y - 136 && q.y < y + 100) overlap += 10000;
          }
          for (let j = 0; j < this.goalBodyCount; j += 4)
            overlap += Math.max(0, Math.min(x + 40, bodies[j + 2]) - Math.max(x - 40, bodies[j])) *
              Math.max(0, Math.min(y + 44, bodies[j + 3]) - Math.max(y - 100, bodies[j + 1]));
          for (const r of rects) {
            if (r === this.guideOrderRect) continue;
            overlap += Math.max(0, Math.min(x + 90, r.right) - Math.max(x - 90, r.left)) *
              Math.max(0, Math.min(y + 76, r.bottom) - Math.max(y - 100, r.top));
          }
          const score = overlap * 100 + Math.abs(x - center);
          if (score < best) { best = score; result.x = x; }
        }
      }
      return result;
    }
    const bodies = this.goalBodyRects(rt), rects = this.hudRects();
    const frame = this.measurePersonFrame(rt.player.u, rt);
    const fx = lower ? W * (S.touchSwap ? .74 : .26) : foot.behind ? (S.touchSwap ? W - 160 : 160) : foot.x;
    const fy = lower ? H - 72 : foot.behind ? H - 120 : foot.y;
    let best = Infinity;
    // 人物と既存の札を避け、丸を置ける余白を探す。
    for (let row = 0; row < (lower ? 1 : 3); row++) for (let col = 0; col < 7; col++) {
      const x = Math.max(48, Math.min(W - 48, fx + (col - 3) * 64));
      const y = Math.max(132, Math.min(H - (lower ? 72 : 96), fy - row * 64));
      let overlap = 0;
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(x + 38, bodies[j + 2]) - Math.max(x - 38, bodies[j])) *
          Math.max(0, Math.min(y + 38, bodies[j + 3]) - Math.max(y - 38, bodies[j + 1]));
      if (frame) overlap += Math.max(0, Math.min(x + 40, frame.right + 8) - Math.max(x - 40, frame.left - 8)) *
        Math.max(0, Math.min(y + 40, frame.bottom + 8) - Math.max(y - 40, frame.top - 8));
      for (const r of rects) overlap += Math.max(0, Math.min(x + 38, r.right) - Math.max(x - 38, r.left)) *
        Math.max(0, Math.min(y + 38, r.bottom) - Math.max(y - 38, r.top));
      // 本人のひし形と指の丸の間に余白を保つ。
      if (!foot.behind && Math.hypot(x - foot.x, y - foot.y) < 80) continue;
      const score = overlap * 1000 + Math.hypot(x - fx, y - fy);
      if (score < best) { best = score; result.x = x; result.y = y; }
    }
    return result;
  }


  // 画面の面と離れた指の間に隙間を作り、押す矢印は付けない。
  drawReleaseGesture(g, rt, x, y) {
    x = Math.max(64, Math.min(VIEW.w - 64, x));
    y = Math.max(156, Math.min(VIEW.h - 60, y));
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-40, 10); g.lineTo(22, 10);
    g.lineTo(40, 34); g.lineTo(-22, 34); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    // 指先は画面より三十二画素上へ離して描く。
    g.beginPath(); g.moveTo(-5, -44); g.lineTo(-5, -66);
    g.quadraticCurveTo(0, -76, 5, -66); g.lineTo(5, -50);
    g.lineTo(12, -54); g.lineTo(24, -44); g.lineTo(20, -26);
    g.lineTo(-4, -26); g.lineTo(-18, -42);
    g.quadraticCurveTo(-24, -56, -5, -42); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
    this.releaseGestureDrawn = true;
    this.moveGestureDrawn = true;
    setClass($('objectives'), 'swipe-order', false);
    this.placeEdgeOrder(x, y - 104);
  }


  drawMoveOrigin(g, x, y, radius = 24, caption = '', shiftX = 0, shiftY = 0, linked = false) {
    // 始点を画面内へ収め、入力の中心も同じ位置へ合わせる。
    x = Math.max(36, Math.min(VIEW.w - 36, x));
    y = Math.max(44, Math.min(VIEW.h - 56, y));
    // 描いた丸は左右どちらにあっても、同じ大きさで歩く操作を受ける。
    const origin = this.navigationTouchOrigin || (this.navigationTouchOrigin = {});
    origin.rt = this.rt; origin.at = this.rt.t; origin.x = x; origin.y = y; origin.look = false; origin.radius = radius;
    // 操作を受ける半径は変えず、目で見る始点だけを小さくする。
    const control = isTouch && singleBattleGuide(this.rt);
    const compact = this.rt?.def.compactFloorGuides;
    if (control) radius = Math.max(24, radius);
    if (compact) radius = control ? 18 : 6;
    g.save(); g.beginPath();
    // 指先を入力の中心へ固定し、矢印と触る場所を一組にする。
    g.arc(x, y, Math.min(radius, 16), 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = compact ? 4 : 5; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = compact ? 1.5 : 2.5; g.stroke();
    if (isTouch) {
      g.beginPath(); g.moveTo(x - 5, y + 22); g.lineTo(x - 5, y);
      g.bezierCurveTo(x - 5, y - 9, x + 5, y - 9, x + 5, y);
      g.lineTo(x + 5, y + 18); g.lineTo(x + 12, y + 14);
      g.lineTo(x + 25, y + 24); g.lineTo(x + 21, y + 42);
      g.lineTo(x - 4, y + 42); g.lineTo(x - 19, y + 26);
      g.quadraticCurveTo(x - 25, y + 12, x - 5, y + 22); g.closePath();
      g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff3ba'; g.fill();
    }
    if (caption) {
      g.font = 'bold 16px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const width = g.measureText(caption).width;
      const left = Math.max(12, Math.min(VIEW.w - width - 20, control ? x - width / 2 : x + radius + 8));
      const top = Math.max(24, Math.min(VIEW.h - 24, control ? y + 60 : y));
      g.fillStyle = '#14120f'; g.fillRect(left - 4, top - 12, width + 8, 24);
      g.fillStyle = '#fff'; g.fillText(caption, left, top);
    }
    g.restore();
  }


  drawSwipeArrow(g, fromX, fromY, toX, toY, radius = 24, fixedOrigin = false) {
    const rt = this.rt;
    // なぞる操作図は開幕だけ。戦の途中は短い進路の矢印を使う。
    if (singleBattleGuide(rt) && !this.openingActive) return false;
    // 操作面の手本は一コマに一組。触る操作側の指とも重ねない。
    if (isTouch && (rt.touchCoachActive || this.moveGestureDrawn || this.root.classList.contains('attack-button-guide') ||
        this.root.classList.contains('wait-guard-active'))) return false;
    // 操作の一組にも一枠を使い、命の欄を含め三枚に収める。
    if (isTouch && this.notices.picks.length - Number(!!this.notices.sources[1].selected) + Number(!$('boss').hidden) +
        Number(!$('target').hidden) + Number(!$('h-hp').hidden) >= 3) return false;
    // 敵へ近づく間の指は、固定した操作面から一度だけ描く。
    if (isTouch && !fixedOrigin && $('objectives').classList.contains('enemy-move-help')) return false;
    if (!fixedOrigin && singleBattleGuide(rt) && isTouch) {
      const dx = toX - fromX, dy = toY - fromY, distance = Math.hypot(dx, dy) || 1;
      const origin = this.clearGestureOrigin(rt, dx / distance, dy / distance);
      fromX = origin.x; fromY = origin.y;
      toX = fromX + dx; toY = fromY + dy;
    }
    const shiftX = Math.max(36, Math.min(VIEW.w - 36, fromX)) - fromX;
    const shiftY = Math.max(44, Math.min(VIEW.h - 56, fromY)) - fromY;
    fromX += shiftX; toX += shiftX; fromY += shiftY; toY += shiftY;
    const dx = toX - fromX, dy = toY - fromY, distance = Math.hypot(dx, dy);
    if (distance < 44) return false;
    if (isTouch) this.moveGestureDrawn = true;
    // 指定した戦だけ足元へ短く収め、遠い旗まで兵を横切る線にしない。
    // 旗の位置と操作を受ける始点は動かさない。
    const compact = !!rt?.def.compactFloorGuides || isTouch && !!this.combatActionUnified;
    const end = Math.min(distance - 12, 24 + Math.min(
      isTouch && singleBattleGuide(rt) ? 64 : Infinity, rt?.def.swipeArrowLength ?? (compact ? 48 : Infinity)));
    g.save(); g.lineCap = 'round';
    this.routePathSolid ||= []; g.setLineDash(this.routePathSolid);
    g.beginPath();
    g.moveTo(fromX, fromY);
    const tipX = fromX + dx * end / distance, tipY = fromY + dy * end / distance;
    g.lineTo(tipX, tipY);
    // 指の矢じりは軌跡と同じ向き。行き先用の旗への置き換えは通さない。
    const ux = dx / distance, uy = dy / distance;
    g.moveTo(tipX - ux * 14 - uy * 8, tipY - uy * 14 + ux * 8);
    g.lineTo(tipX, tipY);
    g.lineTo(tipX - ux * 14 + uy * 8, tipY - uy * 14 - ux * 8);
    g.lineJoin = 'round';
    g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
    g.restore();
    const caption = isTouch && !this.notices.sources[1].selected
      ? `${Math.abs(dx) > Math.abs(dy) ? dx > 0 ? '右' : '左' : dy > 0 ? '下' : '上'}になぞる` : '';
    this.drawMoveOrigin(g, fromX, fromY, radius, caption, dx / distance * Math.min(56, end - 12), dy / distance * Math.min(56, end - 12));
    // なぞり方を含む既存の一枚を、実際に触る丸のそばへ移す。
    const order = $('objectives');
    if (isTouch && this.destinationMoveDirection && !order.classList.contains('enemy-move-help') && !this.retreatGuide?.active && !retreatRequired(rt) &&
        this.notices.sources[1].selected && !order.classList.contains('expand')) {
      setClass(order, 'swipe-order', true);
      const key = order.className + ':' + order.textContent + ':' + VIEW.w + ':' + VIEW.h;
      if (this.swipeOrderKey !== key) {
        this.swipeOrderKey = key;
        this.swipeOrderW = order.offsetWidth; this.swipeOrderH = order.offsetHeight;
      }
      const width = this.swipeOrderW, height = this.swipeOrderH;
      const left = Math.max(12, Math.min(VIEW.w - width - 12, fromX - width / 2));
      let top = dy > 0 ? fromY - height - 32 : fromY + 54;
      const health = this.healthRect;
      if (top + height > VIEW.h - 12 || health && left < health.right + 8 && left + width > health.left - 8 && top + height > health.top - 8)
        top = fromY - height - (dy < 0 ? 100 : 32);
      setCssVar(order, '--swipe-order-x', Math.round(left) + 'px');
      setCssVar(order, '--swipe-order-y', Math.round(Math.max(12, top)) + 'px');
    }
    return true;
  }


  // 指・矢印・短い説明を一組で置き、兵と既存の札を避ける。
  clearGestureOrigin(rt, dx, dy, look = false) {
    const W = VIEW.w, H = VIEW.h;
    const result = this.gestureOrigin || (this.gestureOrigin = {});
    if (result.rt === rt && result.w === W && result.h === H && result.dx === dx && result.dy === dy &&
        result.look === look && result.swap === S.touchSwap && rt.t >= result.at && rt.t < result.at + .2) return result;
    result.rt = rt; result.w = W; result.h = H; result.dx = dx; result.dy = dy;
    result.look = look; result.swap = S.touchSwap; result.at = rt.t;
    if (isTouch && !rt.def.town && !rt.def.dojo) {
      const start = this.playerControlOrigin(rt);
      result.x = start.x; result.y = start.y;
      return result;
    }
    const rightSide = look ? !S.touchSwap : !!S.touchSwap;
    const center = W * (rightSide ? .78 : .22), baseY = H - 112;
    result.x = Math.max(112, Math.min(W - 112, center));
    result.y = Math.max(112, Math.min(H - 88, baseY));
    // 見まわす始点は操作側へ固定し、兵が動いても触る場所を変えない。
    if (isTouch && look && singleBattleGuide(rt)) return result;
    const bodies = this.goalBodyRects(rt), rects = this.hudRects();
    let best = Infinity;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
      const x = Math.max(112, Math.min(W - 112, center + (col - 2) * 48));
      const y = Math.max(152, Math.min(H - 88, baseY - row * 32));
      if ((x > W / 2) !== rightSide) continue;
      const left = x - Math.max(96, -dx * 104 + 24), right = x + Math.max(96, dx * 104 + 24);
      const top = y - Math.max(64, -dy * 104 + 16), bottom = y + Math.max(56, dy * 104 + 16);
      if (top < 64 || bottom > H - 16) continue;
      let overlap = 0;
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(right, bodies[j + 2]) - Math.max(left, bodies[j])) *
          Math.max(0, Math.min(bottom, bodies[j + 3]) - Math.max(top, bodies[j + 1]));
      for (const r of rects) {
        if (r === this.guideOrderRect) continue;
        overlap += Math.max(0, Math.min(right, r.right + 8) - Math.max(left, r.left - 8)) *
          Math.max(0, Math.min(bottom, r.bottom + 8) - Math.max(top, r.top - 8));
      }
      const score = overlap * 1000 + Math.hypot(x - center, y - baseY);
      if (score < best) { best = score; result.x = x; result.y = y; }
    }
    return result;
  }


  drawMoveGesture(g, rt, target, x, y) {
    if (this.releaseMoveActive || this.releaseGestureDrawn || this.namedGoalDrawn && singleBattleGuide(rt) &&
        !this.retreatGuide?.active && !retreatRequired(rt)) return false;
    if (target && !singleBattleGuide(rt)) this.drawDestinationStep(g, rt, target);
    // 歩けた後は行き先だけを残す。旗が出た時も操作の手本を再開しない。
    if (touchMoveLearned(rt)) return false;
    // 合戦では足元の矢印を足さず、手の移動も同じ八方向へそろえる。
    const direction = target ? this.navigationDirection(rt, target) : '上';
    const dx = direction.includes('右') ? 1 : direction.includes('左') ? -1 : 0;
    const dy = direction.includes('下') ? 1 : direction.includes('上') ? -1 : 0;
    const length = Math.hypot(dx, dy) || 1;
    const start = this.clearGestureOrigin(rt, dx / length, dy / length);
    x = start.x; y = start.y;
    const drew = this.drawSwipeArrow(g, x, y, x + dx / length * 104, y + dy / length * 104, 32, true);
    const order = $('objectives');
    if (drew && this.namedGoalDrawn && !this.retreatGuide?.active && !retreatRequired(rt) &&
        this.notices.sources[1].selected && !order.classList.contains('expand')) {
      // 説明も指の始点に集める。携帯の行き先は小さい輪で示す。
      setClass(order, 'swipe-order', true);
      const key = order.textContent + ':' + VIEW.w + ':' + VIEW.h + ':' + S.textScale;
      if (this.moveGoalOrderKey !== key) {
        this.moveGoalOrderKey = key;
        this.moveGoalOrderW = order.offsetWidth; this.moveGoalOrderH = order.offsetHeight;
      }
      const width = this.moveGoalOrderW, height = this.moveGoalOrderH;
      setCssVar(order, '--swipe-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, x - width / 2))) + 'px');
      const top = dy < 0 ? y + 54 : y - height - 32;
      const health = this.healthRect;
      setCssVar(order, '--swipe-order-y', Math.round(Math.max(12,
        Math.min(top, VIEW.h - height - 12, health && x + width / 2 > health.left && x - width / 2 < health.right
          ? health.top - height - 8 : Infinity))) + 'px');
    }
    return drew;
  }


  // 見回す操作も、触る場所に指と横矢印を一組だけ置く。
  drawRouteTurn(g, rt, right) {
    if (isTouch && (rt.touchCoachActive || this.moveGestureDrawn ||
        this.notices.picks.length - Number(!!this.notices.sources[1].selected) + Number(!$('boss').hidden) + Number(!$('target').hidden) +
        Number(!$('h-hp').hidden) >= 3)) return false;
    const side = right ? 1 : -1, start = this.clearGestureOrigin(rt, side, 0, true);
    // 操作面へ指の軌跡を直接重ねる。別の押せる枠に見せない。
    const drew = this.drawSwipeArrow(g, start.x, start.y, start.x + side * 88, start.y, 26, true);
    if (drew) {
      // 指を置く始点を常に囲む。手が動いても、ここから横へなぞると分かる。
      g.save(); g.beginPath(); g.arc(start.x, start.y, 24, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
      this.navigationTouchOrigin.look = true;
    }
    return drew;
  }


  // 指の操作とは別に、自分の足元から実際の行き先へ細い矢印を結ぶ。
  drawFootRoute(g, rt, goal) {
    if (touchMoveLearned(rt)) return false;
    const p = rt.player.u.pos;
    const from = this.project(p, p.y + .08, rt, this.footRouteFrom || (this.footRouteFrom = {}));
    const to = this.project(goal, groundAt(rt.world, goal.x, goal.z, p.y) + .12, rt,
      this.footRouteTo || (this.footRouteTo = {}));
    if (from.behind || to.behind || to.x < 24 || to.x > VIEW.w - 24 || to.y < 64 || to.y > VIEW.h - 24) return false;
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (length < 36) return false;
    const ux = dx / length, uy = dy / length;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.beginPath(); g.moveTo(from.x + ux * 20, from.y + uy * 20); g.lineTo(to.x, to.y);
    g.moveTo(to.x - ux * 12 - uy * 7, to.y - uy * 12 + ux * 7); g.lineTo(to.x, to.y);
    g.lineTo(to.x - ux * 12 + uy * 7, to.y - uy * 12 - ux * 7);
    g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
    return true;
  }


  drawDirectionChain(g, fromX, fromY, toX, toY, single = false, maxLength = Infinity) {
    // 指の案内中は、地面に別の向きの矢印を足さない。
    if (isTouch && (this.rt.touchCoachActive || this.rt.dodgeGuide?.gestureShown)) return false;
    // 合戦では戦ごとの指定がなくても短い矢印一つにする。
    if (singleBattleGuide(this.rt)) { single = true; maxLength = Math.min(maxLength, 72); }
    // 指定の戦だけ、旗・待機・退避のどの経路でも線を足元の短い案内に収める。
    maxLength = Math.min(maxLength, this.rt?.def.guideArrowLength ?? Infinity);
    const dx = toX - fromX, dy = toY - fromY, distance = Math.hypot(dx, dy);
    if (distance < (single ? 40 : 76)) return false;
    g.save();
    g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 80); g.clip();
    if (single) {
      const start = Math.min(24, distance * .25);
      const angle = Math.atan2(dy, dx), end = Math.min(distance - 12, start + maxLength,
        start + (this.rt?.def.directionArrowLength ?? Infinity));
      g.beginPath(); g.moveTo(fromX + dx * start / distance, fromY + dy * start / distance);
      g.lineTo(fromX + dx * end / distance, fromY + dy * end / distance);
      g.lineCap = 'round';
      g.strokeStyle = '#14120f'; g.lineWidth = this.rt?.def.compactTravelArrow ? 4 : 11; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = this.rt?.def.compactTravelArrow ? 1.5 : 5; g.stroke();
      this.drawNavigationArrow(g, fromX + dx * end / distance, fromY + dy * end / distance, angle, .55, true);
    } else {
      this.directionDash ||= [8, 18];
      g.setLineDash(this.directionDash); g.lineCap = 'round';
      g.beginPath();
      g.moveTo(fromX + dx * 38 / distance, fromY + dy * 38 / distance);
      g.lineTo(toX - dx * 30 / distance, toY - dy * 30 / distance);
      g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
    }
    g.restore();
    return true;
  }


  // 行き先は小さな輪にまとめ、槍や相手の足元を覆わない。
  drawReturnDestination(g, x, y) {
    g.save();
    g.beginPath(); g.ellipse(x, y, 38, 14, 0, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 6; g.stroke();
    g.restore();
  }


  // 退避も既存の案内の長さを守り、乱戦を横切る長い線を引かない。
  drawRetreatRoute(g, rt, x, y) {
    if (isTouch && singleBattleGuide(rt)) return false;
    const p = rt.player.u.pos;
    const foot = this.project(p, p.y + .12, rt,
      this.returnRouteFoot || (this.returnRouteFoot = {}));
    if (foot.behind) return false;
    const dx = x - foot.x, dy = y - foot.y, distance = Math.hypot(dx, dy);
    if (distance < 64) return false;
    const ux = dx / distance, uy = dy / distance;
    // 輪の外側で止め、到着点と矢じりを重ねない。
    const end = Math.min(distance - 1 / Math.sqrt(ux * ux / (38 * 38) + uy * uy / (19 * 19)),
      32 + (rt.def.retreatArrowLength ?? rt.def.guideArrowLength ?? 72));
    if (end <= 32) return false;
    const tx = foot.x + ux * end, ty = foot.y + uy * end;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 80); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(foot.x + ux * 32, foot.y + uy * 32); g.lineTo(tx, ty);
    g.moveTo(tx - ux * 14 - uy * 8, ty - uy * 14 + ux * 8);
    g.lineTo(tx, ty); g.lineTo(tx - ux * 14 + uy * 8, ty - uy * 14 - ux * 8);
    g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke(); g.restore();
    return true;
  }


  drawRetreatDestination(g, rt, pos, visible, sx, sy, reached, way = pos, attachOrder = true, link = true) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    // 到着点の輪は実際の地面に固定する。別の場所へ向く足元の矢印は足さない。
    const obstacles = this.hudRects();
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = Math.atan2(this.tmpV.x, this.tmpV.z);
    const dx = way.x - p.x, dz = way.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const centerY = (154 + H - 86) / 2;
    const scale = Math.min((W / 2 - 88) / Math.max(.001, Math.abs(side)),
      Math.max(12, (H - 240) / 2) / Math.max(.001, Math.abs(forward)));
    const compact = !!rt.def.compactFieldGuides;
    const inset = compact ? 48 : Math.max(128, Math.min(224, W * .24));
    const x = visible ? sx : side >= 0 ? W - inset : inset;
    const y = visible ? sy : centerY - forward * scale;
    let cueX = Math.max(inset, Math.min(W - inset, x));
    let cueY = Math.max(154, Math.min(H - 76, y - (visible ? 80 : 0)));
    if (!visible) {
      // 端から余白を取り、旗・足元・矢じり全体を札から離す。
      let best = Infinity, bestY = cueY;
      for (let i = 0; i <= 12; i++) {
        const cy = 154 + Math.max(0, H - 230) * i / 12;
        let overlap = 0;
        for (const r of obstacles) {
          if (r === this.guideOrderRect) continue;
          overlap += Math.max(0, Math.min(cueX + 48, r.right) - Math.max(cueX - 32, r.left)) *
            Math.max(0, Math.min(cy + 48, r.bottom) - Math.max(cy - 80, r.top));
        }
        const score = overlap * 100 + Math.abs(cy - cueY);
        if (score < best) { best = score; bestY = cy; }
      }
      cueY = bestY;
    }
    // 集合先は輪と旗の一組。判定の位置は動かさない。
    g.save();
    let goalX = visible ? sx : cueX, goalY = visible ? sy : cueY;
    const treatment = !!this.retreatGuide?.treatment;
    const foot = this.project(p, p.y + .08, rt, this.retreatFootProjection || (this.retreatFootProjection = {}));
    if (compact && !treatment) {
      if (visible) this.drawReturnDestination(g, sx, sy);
      else this.drawReturnDestination(g, cueX, cueY);
      this.drawSmallGoalFlag(g, goalX, goalY, .65, false, false, '');
      if (!visible && !reached) this.drawNavigationArrow(g, cueX, cueY + 28,
        this.destinationDirection(rt, way), .5, true);
      if (isTouch && !reached && !touchMoveLearned(rt)) {
        const start = this.clearMoveOrigin(rt, foot);
        this.drawMoveGesture(g, rt, way, start.x, start.y);
      }
    } else if (rt.def.compactRetreatSign && visible) {
      // 見えている退避先は床へ描く。指・下矢印・十字の看板を同じ地点へ積まない。
      const placed = treatment
        ? this.drawFloorWaymark(g, rt, pos, false, null, true)
        : this.drawFloorGoal(g, rt, pos.x, pos.z, false, .65);
      if (!placed) {
        if (treatment) this.drawTreatmentCross(g, goalX, goalY);
        else this.drawReturnDestination(g, goalX, goalY);
      }
      if (!reached && link) this.drawRetreatRoute(g, rt, goalX, goalY);
      if (isTouch && !reached && !touchMoveLearned(rt)) {
        const start = this.clearMoveOrigin(rt, foot);
        this.drawMoveGesture(g, rt, way, start.x, start.y);
      }
    } else if (treatment) {
      // 移動中から十字を見せる。画面外でも同じ印を内側へ置く。
      const spot = this.avoidRects(goalX, goalY - 12, W, H, 'h', null, 28, 56, true);
      if (spot) { goalX = spot[0]; goalY = spot[1] + 12; }
      this.drawTreatmentCross(g, goalX, goalY);
      if (!reached) {
        if (link) this.drawRetreatRoute(g, rt, goalX, goalY);
        const start = this.clearMoveOrigin(rt, foot);
        if (isTouch) this.drawMoveGesture(g, rt, way, start.x, start.y);
        else this.drawNavigationArrow(g, goalX, goalY + 24, this.destinationDirection(rt, way), .7, true);
      }
    } else if (singleBattleGuide(rt)) {
      this.drawNamedGoal(g, goalX, goalY, visible ? null : Math.atan2(-forward, side));
      if (isTouch && !reached) {
        const start = this.clearMoveOrigin(rt, foot);
        this.drawMoveGesture(g, rt, way, start.x, start.y);
      }
    } else {
      // 行き先は一つ。見える時はその場所の丸、見えない時だけ同じ札の下に矢印を出す。
      if (visible) this.drawReturnDestination(g, goalX, goalY);
      else if (!reached) this.drawNavigationArrow(g, goalX, goalY,
        this.destinationDirection(rt, way), .85, true);
    }
    g.restore();
    // 下知は画面端の一枚へ。兵や行き先を追って札を動かさない。
    const order = $('objectives');
    if (attachOrder && this.notices.sources[1].selected && !order.classList.contains('expand')) {
      setClass(order, 'ground-order', true); setClass(order, 'travel-retreat', true);
      setClass(order, 'destination-sign', true);
      const sizeKey = order.textContent + ':' + W + ':' + H;
      if (this.retreatOrderSizeKey !== sizeKey) {
        this.retreatOrderSizeKey = sizeKey; this.retreatOrderWidth = order.offsetWidth; this.retreatOrderHeight = order.offsetHeight;
      }
      const width = this.retreatOrderWidth, height = this.retreatOrderHeight;
      let left = 12, top = 12, best = Infinity;
      // 上端を優先し、既存の札に重なる時だけ下の候補へ回す。
      for (let i = 0; i < 8; i++) {
        const side = i % 4;
        const lx = Math.max(12, Math.min(W - width - 12,
          side % 2 === 0 ? W - width - 12 : 12));
        const ly = Math.max(12, Math.min(H - height - 12,
          12 + Math.floor(i / 2) * Math.max(0, (H - height - 24) / 3)));
        let overlap = 0;
        for (const r of obstacles) {
          if (r === this.guideOrderRect) continue;
          overlap += Math.max(0, Math.min(lx + width + 8, r.right) - Math.max(lx - 8, r.left)) *
            Math.max(0, Math.min(ly + height + 8, r.bottom) - Math.max(ly - 8, r.top));
        }
        const score = overlap * 100 + i;
        if (score < best) { best = score; left = lx; top = ly; }
      }
      // 端の候補がどれも狭くても、命の欄には重ねない。
      const health = this.healthRect;
      if (health && left < health.right + 8 && left + width > health.left - 8 &&
          top < health.bottom + 8 && top + height > health.top - 8)
        top = Math.max(12, health.top - height - 8);
      // 札は唯一の目印へ添える。重なりがある場合だけ端の候補を使う。
      const nearX = Math.max(12, Math.min(W - width - 12, goalX - width / 2));
      const nearY = Math.max(12, Math.min(H - height - 12, goalY - height - 40));
      if (!obstacles.some(r => r !== this.guideOrderRect && nearX < r.right + 8 &&
          nearX + width > r.left - 8 && nearY < r.bottom + 8 && nearY + height > r.top - 8)) {
        left = nearX; top = nearY;
      }
      if (singleBattleGuide(rt) && visible && !treatment) {
        setClass(order, 'swipe-order', false);
        // 戻る場所のすぐ脇へ添える。札のために地面の輪を動かさない。
        const spot = this.goalFlagSpot(rt, goalX, goalY - 40, width, height);
        left = spot.labelX - width / 2; top = spot.labelY - height / 2;
      }
      if (!compact && isTouch && !reached && !treatment) {
        const start = this.gestureOrigin;
        if (start?.rt === rt) {
          left = Math.max(12, Math.min(W - width - 12, start.x - width / 2));
          top = Math.max(12, start.y - Math.max(64, height + 16));
          setClass(order, 'swipe-order', false);
        }
      }
      setCssVar(order, '--ground-order-x', left + 'px');
      setCssVar(order, '--ground-order-y', top + 'px');
      // 歩く操作の丸と当たり判定はそのまま残す。
    }
    return true;
  }


  // 命・敵・行き先の三枚。退く道筋は同じ形の矢印で示す。
  drawRetreatCues(g, rt) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    const enemy = this.retreatGuide.enemy;
    if (!enemy?.alive || !sightUnit(rt, enemy)) return;
    const frame = sightScreenUnit(rt, enemy) && this.measurePersonFrame(enemy, rt);
    const dx = enemy.pos.x - p.x, dz = enemy.pos.z - p.z;
    const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const x = frame ? frame.cx : side >= 0 ? W - 52 : 52;
    const y = frame ? Math.max(68, frame.top - 48) : Math.max(76, Math.min(H - 100, H / 2 - forward * 4));
    const textScale = Math.max(1, S.textScale || 1);
    const spot = this.avoidRects(x, y + 40, W, H, 'v', null, Math.max(26, 12 * textScale + 6), 64, true);
    if (!spot) return;
    const labelY = spot[1] - 40;
    g.save(); g.font = `bold ${20 * textScale}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const half = Math.max(20, g.measureText('敵').width / 2 + 6);
    g.fillStyle = '#14120f'; g.fillRect(spot[0] - half, labelY - 15, half * 2, 30);
    g.fillStyle = '#fff3ba'; g.fillText('敵', spot[0], labelY);
    if (frame) this.drawGuideLink(g, frame.cx, Math.max(24, frame.top - 4),
      spot[0] - half, labelY - 15, spot[0] + half, labelY + 15, true);
    else this.drawNavigationArrow(g, spot[0], labelY + 38, Math.atan2(-forward, side), .5);
    g.restore();
  }
}
