import * as THREE from "three";
import { VIEW } from "./viewport.js";
import { groundAt } from "./floors.js";
import { $, setClass, setCssVar, singleBattleGuide, guardPostDistance } from "./hud_common.js";
import { mountainWay, localClear } from "./army_local_way.js";

export class HudWork {


  // 戸口と出口は同じ菱形。火付けと出る場所を一字でも見分ける。
  drawTaskDestinationSign(g, x, y, work = false) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, -23); g.lineTo(23, 0);
    g.lineTo(0, 23); g.lineTo(-23, 0); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.fillStyle = '#14120f'; g.font = 'bold 18px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(work ? '火' : '出', 0, 1); g.restore();
  }


  // 作業する建物を囲む。動かない建物の範囲は一度だけ測り、投影用の入れ物も使い回す。
  drawWorkBuilding(g, rt, marker) {
    if (marker.entrance) return this.drawWorkEntrance(g, rt, marker);
    if (!marker.guideObject) return null;
    const box = marker.workBounds || (marker.workBounds = new THREE.Box3().setFromObject(marker.guideObject));
    if (box.isEmpty()) return null;
    const points = this.workBuildingPoints || (this.workBuildingPoints = new Float64Array(16));
    const hull = this.workBuildingHull || (this.workBuildingHull = new Int8Array(17));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.tmpV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      let j = i;
      while (j > 0 && (points[(j - 1) * 2] > x || points[(j - 1) * 2] === x && points[(j - 1) * 2 + 1] > y)) {
        points[j * 2] = points[(j - 1) * 2]; points[j * 2 + 1] = points[(j - 1) * 2 + 1]; j--;
      }
      points[j * 2] = x; points[j * 2 + 1] = y;
    }
    if (right < 24 || left > VIEW.w - 24 || bottom < 100 || top > VIEW.h - 32 || right - left < 12 || bottom - top < 12) return null;
    let count = 0;
    for (let pass = 0; pass < 2; pass++) {
      const start = count;
      for (let step = 0; step < 8; step++) {
        const i = pass ? 7 - step : step;
        while (count >= start + 2) {
          const a = hull[count - 2] * 2, b = hull[count - 1] * 2;
          if ((points[b] - points[a]) * (points[i * 2 + 1] - points[a + 1]) -
              (points[b + 1] - points[a + 1]) * (points[i * 2] - points[a]) > 0) break;
          count--;
        }
        hull[count++] = i;
      }
      count--;
    }
    // 家の外周だけを太く縁取り、中の景色と周囲の兵はそのまま見せる。
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < count; i++) {
      const at = hull[i] * 2;
      if (i) g.lineTo(points[at], points[at + 1]); else g.moveTo(points[at], points[at + 1]);
    }
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
    const sign = this.workBuildingSign || (this.workBuildingSign = { x:0, y:0 });
    sign.x = Math.max(36, Math.min(VIEW.w - 36, (left + right) / 2));
    sign.y = Math.max(104, top - 8);
    return sign;
  }


  // 火付けも修理も、建物全体でなく実際に近づく戸口だけを囲む。
  drawWorkEntrance(g, rt, marker) {
    const door = typeof marker.pos === 'function' ? marker.pos() : marker.pos;
    const approach = marker.guideDestination?.();
    if (!door || !approach) return null;
    const dx = approach.x - door.x, dz = approach.z - door.z, length = Math.hypot(dx, dz) || 1;
    // 人や地面に隠れやすい足場ではなく、戸口の手前の胸の高さで見通しを調べる。
    const probe = this.workDoorProbe || (this.workDoorProbe = { x:0, y:0, z:0 });
    probe.x = door.x + dx / length * .35; probe.z = door.z + dz / length * .35;
    probe.y = (door.y ?? groundAt(rt.world, door.x, door.z, rt.player.u.pos.y)) + 1;
    if (!this.floorGoalVisible(rt, probe, false)) return null;
    const points = this.workDoorPoints || (this.workDoorPoints = new Float64Array(8));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const side = i === 0 || i === 3 ? -.75 : .75;
      this.tmpV.set(door.x + dz / length * side, (door.y ?? groundAt(rt.world, door.x, door.z, rt.player.u.pos.y)) + (i < 2 ? 1.9 : 0), door.z - dx / length * side).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
      const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
      points[i * 2] = x; points[i * 2 + 1] = y;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 24 || left > VIEW.w - 24 || bottom < 72 || top > VIEW.h - 32) return null;
    // 間近でも囲みを携帯画面の小さな範囲に収める。
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const scale = Math.min(1, 80 / Math.max(1, right - left), 96 / Math.max(1, bottom - top));
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = cx + (points[i * 2] - cx) * scale, y = cy + (points[i * 2 + 1] - cy) * scale;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.lineJoin = 'round'; g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(cx + (right - left) * scale * .28, cy - 4);
    g.lineTo(cx + (right - left) * scale * .28, cy + 4);
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke(); g.restore();
    const sign = this.workBuildingSign || (this.workBuildingSign = { x:0, y:0 });
    // 印の先を画面の余白へずらさず、入口の上辺へ固定する。
    sign.x = cx; sign.y = cy - (bottom - top) * scale / 2;
    return sign;
  }


  drawWorkGuide(g, rt, main) {
    // 戸口がある作業は入口だけを示し、それ以外は従来の作業場所へ導く。
    const p = main.guideDestination?.() || (typeof main.pos === 'function' ? main.pos() : main.pos);
    if (!p) return false;
    const foot = this.workGuideFoot || (this.workGuideFoot = { x:0, y:0, z:0 });
    foot.x = p.x; foot.z = p.z; foot.y = groundAt(rt.world, p.x, p.z, rt.player.u.pos.y);
    // 火付けは軒先の小さな炎一つ。任務札は所定の欄に残し、家や兵を囲まない。
    if (main.guideSymbol === 'fire') {
      const door = typeof main.pos === 'function' ? main.pos() : main.pos;
      const anchor = door || foot;
      const sign = this.project(anchor, (anchor.y ?? foot.y) + 2.7, rt);
      const order = $('objectives');
      setClass(order, 'work-order', false);
      setClass(order, 'destination-sign', false);
      setClass(order, 'entrance-order', false);
      if (!sign.behind && sign.x >= 24 && sign.x <= VIEW.w - 24 && sign.y >= 56 && sign.y <= VIEW.h - 32) {
        g.save(); g.translate(sign.x, sign.y); g.lineJoin = 'round';
        g.beginPath(); g.moveTo(0, -14);
        g.bezierCurveTo(3, -5, 11, -3, 9, 5);
        g.bezierCurveTo(7, 15, -10, 14, -9, 4);
        g.bezierCurveTo(-9, -1, -3, -4, -4, -8);
        g.lineTo(-1, -4); g.closePath();
        g.strokeStyle = '#18150f'; g.lineWidth = 4; g.stroke();
        g.fillStyle = '#ffe6a0'; g.fill(); g.restore();
      } else {
        const edge = this.drawOffscreenDirection(g, rt, p, true);
        if (edge) this.placeEdgeOrder(edge.x, edge.y);
      }
      setClass(this.root, 'travel-guide', true);
      return true;
    }
    const building = this.drawWorkBuilding(g, rt, main);
    const sign = building || this.project(foot, foot.y + .12, rt);
    const visible = !!building || !main.guideObject && !sign.behind && sign.x >= 48 && sign.x <= VIEW.w - 48 && sign.y >= 112 && sign.y <= VIEW.h - 32 && this.floorGoalVisible(rt, foot);
    if (visible) {
      if (!building) this.drawFloorGoal(g, rt, p.x, p.z, false, .6);
      // 戸口は囲みと任務札だけで案内し、火付けの一字札を重ねない。
      if (main.guideSymbol === 'fire') {
        if (!main.entrance) this.drawTaskDestinationSign(g, sign.x, sign.y - 28, true);
        if (this.root.classList.contains('working')) {
          this.hudRects();
          const button = this.workPromptRect;
          if (button) this.drawGuideLink(g, sign.x, sign.y - 8,
            button.left, button.top, button.right, button.bottom, true);
        }
      }
      else if (!building || !main.entrance) this.drawSmallGoalFlag(g, sign.x, sign.y, .65);
      const order = $('objectives');
      if (this.notices.sources[1].selected && !order.classList.contains('expand') && !this.root.classList.contains('working')) {
        setClass(order, 'work-order', true);
        const key = this.objKey + '|' + VIEW.w + '|' + VIEW.h;
        if (this.workOrderKey !== key) {
          this.workOrderKey = key;
          this.workOrderWidth = order.offsetWidth; this.workOrderHeight = order.offsetHeight;
        }
        const width = this.workOrderWidth, height = this.workOrderHeight;
        const left = main.entrance ? sign.x - width / 2 : sign.x + 40 + width <= VIEW.w - 12 ? sign.x + 40 : sign.x - width - 24;
        setCssVar(order, '--work-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, left))) + 'px');
        setCssVar(order, '--work-order-y', Math.round(Math.max(12, Math.min(VIEW.h - height - 24, sign.y - height - 12))) + 'px');
      }
    } else {
      const edge = this.drawOffscreenDirection(g, rt, p, true);
      if (edge) {
        if (!main.entrance) this.drawTaskDestinationSign(g, edge.x, edge.y - 48, true);
        // 新しい札を足さず、今の「家へ」の下知を端の矢印へ添える。
        this.placeEdgeOrder(edge.x, edge.y);
      }
    }
    setClass(this.root, 'travel-guide', true);
    return true;
  }


  // 持ち場へ歩く道は見える矢印一本。道調べは半秒ごと、入れ物は使い回す。
  drawApproachRoute(g, rt, pos, radius, retreat = false, arrowScale = .5) {
    const p = rt.player.u.pos;
    const c = this.approachRoute || (this.approachRoute = {
      scout: { id: 0, pos: { x: 0, y: 0, z: 0 } }, goal: { x: 0, y: 0, z: 0 },
      point: { x: 0, y: 0, z: 0 }, vertices: new Float64Array(72), screen: new Float64Array(6), at: -1
    });
    if (c.rt !== rt || rt.t < c.at - .5 || rt.t >= c.at || c.radius !== radius || c.retreat !== retreat ||
        Math.hypot(pos.x - c.gx, pos.z - c.gz) > .2 || Math.hypot(p.x - c.px, p.z - c.pz) > .5) {
      c.rt = rt; c.at = rt.t + .5; c.gx = pos.x; c.gz = pos.z; c.radius = radius; c.retreat = retreat;
      c.px = p.x; c.pz = p.z; c.count = 0;
      const from = c.scout.pos, to = c.point;
      from.x = p.x; from.y = p.y; from.z = p.z;
      c.goal.x = pos.x; c.goal.z = pos.z; c.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
      for (let step = 0; step < (retreat ? 4 : 2); step++) {
        const remaining = Math.hypot(pos.x - from.x, pos.z - from.z) - radius;
        if (remaining <= .15) break;
        const way = rt.def.approachGuidePoint?.(rt, from, c.goal) || rt.world.def.guideWay?.(c.scout, c.goal) || mountainWay(rt.army, c.scout, c.goal, true);
        const dx = way.x - from.x, dz = way.z - from.z, distance = Math.hypot(dx, dz);
        if (distance < .15) break;
        const length = Math.min(3, distance, remaining), ux = dx / distance, uz = dz / distance;
        to.x = from.x + ux * length; to.z = from.z + uz * length;
        to.y = groundAt(rt.world, to.x, to.z, from.y);
        if (!localClear(rt.army, from, to, true)) break;
        const start = c.count, back = Math.min(.5, length * .6);
        let clear = true;
        for (let i = 0; i < 3; i++) {
          const across = i === 1 ? 0 : i === 0 ? -.25 : .25;
          const along = i === 1 ? length : length - back;
          const x = from.x + ux * along - uz * across, z = from.z + uz * along + ux * across;
          const y = groundAt(rt.world, x, z, from.y);
          c.goal.x = x; c.goal.y = y; c.goal.z = z;
          if (Math.abs(y - from.y) > .6 || !localClear(rt.army, from, c.goal, true)) clear = false;
          c.vertices[c.count++] = x; c.vertices[c.count++] = y; c.vertices[c.count++] = z;
        }
        c.goal.x = pos.x; c.goal.z = pos.z; c.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
        if (!clear) { c.count = start; break; }
        from.x = to.x; from.y = to.y; from.z = to.z;
      }
    }
    let drew = false;
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'round';
    const playerFrame = this.measurePersonFrame(rt.player.u, rt);
    // 退却時は地面の二本を旗へ続ける。普段は見える一本だけ。
    for (let i = 0; i < Math.min(c.count, retreat ? 36 : 18); i += 9) {
      let visible = true;
      for (let j = 0; j < 3; j++) {
        const k = i + j * 3, q = c.point;
        q.x = c.vertices[k]; q.y = c.vertices[k + 1]; q.z = c.vertices[k + 2];
        if (!this.floorGoalVisible(rt, q, false)) { visible = false; break; }
        this.tmpV.set(q.x, q.y + .08, q.z).project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) { visible = false; break; }
        c.screen[j * 2] = (this.tmpV.x * .5 + .5) * VIEW.w;
        c.screen[j * 2 + 1] = (-this.tmpV.y * .5 + .5) * VIEW.h;
      }
      if (!visible) continue;
      // 地面の先端は動かさず、遠近で膨らむ羽だけを縮める。
      const screen = c.screen;
      const spanX = Math.max(screen[0], screen[2], screen[4]) - Math.min(screen[0], screen[2], screen[4]);
      const spanY = Math.max(screen[1], screen[3], screen[5]) - Math.min(screen[1], screen[3], screen[5]);
      const scale = Math.min(1, 36 / Math.max(1, spanX), 28 / Math.max(1, spanY));
      for (let j = 0; j < 6; j++) {
        const tip = screen[2 + j % 2];
        screen[j] = tip + (screen[j] - tip) * scale;
      }
      if (playerFrame && Math.max(screen[0], screen[2], screen[4]) > playerFrame.left - 6 &&
          Math.min(screen[0], screen[2], screen[4]) < playerFrame.right + 6 &&
          Math.max(screen[1], screen[3], screen[5]) > playerFrame.top - 6 &&
          Math.min(screen[1], screen[3], screen[5]) < playerFrame.bottom + 6) continue;
      const baseX = (screen[0] + screen[4]) / 2, baseY = (screen[1] + screen[5]) / 2;
      if (singleBattleGuide(rt) && !this.openingActive) {
        g.beginPath(); g.moveTo(baseX, baseY); g.lineTo(screen[2], screen[3]);
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
        g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
        this.drawSmallGoalFlag(g, screen[2], screen[3], .5, false, false, '');
      } else this.drawNavigationArrow(g, screen[2], screen[3], Math.atan2(screen[3] - baseY, screen[2] - baseX), arrowScale);
      drew = true;
      if (!retreat) break;
    }
    g.restore(); return drew;
  }


  // 旗は頭上、到着前の持ち場は床の道筋で示す。
  drawFlagGuide(g, rt, guide, pos) {
    const W = VIEW.w, H = VIEW.h, order = $('objectives');
    const waitButton = !!this.waitGuardButton && !this.waitGuardButton.hidden;
    // 判断や警告が先に選ばれている時は、新しい札を増やさない。
    if ((!this.notices.sources[1].selected && !waitButton) || order.classList.contains('expand')) return false;
    if (guide.marker.guideWaitRing && !waitButton) return this.drawSingleDestination(g, rt, pos, guide.marker);
    const waiting = guide.marker.guideArea === 'wait' || !!guide.marker.waitGuide;
    const reached = (guide.marker.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide.distance) < (guide.marker.guideRadius || 8);
    if (singleBattleGuide(rt) && !waitButton && !reached &&
        !guide.marker.guideDefend && guide.marker.guideArea !== 'guard')
      return this.drawNamedDestination(g, rt, pos);
    const text = waiting ? reached ? 'ここで まて' : 'ここへ すすめ' : 'この旗へ進む';
    // 布の中心や組の中心ではなく、目当ての旗を持つ人の足元を指す。
    // 待つ範囲の中心は実際の持ち場。近くの別の隊旗へ移さない。
    const bounds = waiting ? null : this.goalFlagBounds(rt, guide.marker, pos);
    const foot = waiting ? pos : this.goalFlagFoot || pos;
    if (waiting) this.drawDestinationArea(g, rt, pos, guide.marker.guideRadius || 8, false);
    // 到着後は、指示も操作も長押しボタン一枚に集める。
    if (waitButton) return true;
    if (waiting && !reached) {
      // 指図は既存の任務札に残し、下向き矢印付きの札は足さない。
      setClass(this.root, 'travel-guide', true);
      this.drawApproachRoute(g, rt, pos, guide.marker.guideRadius || 8);
      return true;
    }
    const floorY = groundAt(rt.world, foot.x, foot.z, foot.y ?? rt.player.u.pos.y);
    // 実旗の足元と端の小印を使う戦では、大きな札と矢印をもう一組描かない。
    if (rt.def.footFlagGuides) return this.drawDestinationPointer(g, rt, foot, true, .55);
    this.tmpV.set(foot.x, floorY + .18, foot.z).project(rt.camera);
    const goalX = (this.tmpV.x * .5 + .5) * W, goalY = (-this.tmpV.y * .5 + .5) * H;
    const visible = this.tmpV.z >= -1 && this.tmpV.z <= 1 && goalX >= 64 && goalX <= W - 64 &&
      goalY >= 112 && goalY <= H - 28 && this.floorGoalVisible(rt, foot);
    g.save(); g.lineJoin = 'round'; g.font = '900 28px sans-serif';
    const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const dx = foot.x - p.x, dz = foot.z - p.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const direction = forward < 0 ? side >= 0 ? '右後ろ' : '左後ろ' : Math.abs(side) > forward ? side >= 0 ? '右' : '左' : '前';
    const detail = visible || waiting && reached ? '' : `${direction}・あと${Math.max(1, Math.ceil(Math.hypot(dx, dz) / .75))}歩`;
    const half = Math.ceil(Math.max(g.measureText(text).width, detail ? g.measureText(detail).width * 2 / 3 : 0) / 2) + 12;
    const labelHeight = detail ? 68 : 44;
    let spot;
    if (waiting && reached) {
      // 待機中は画面外の持ち場にも移動の矢印を出さない。輪と一枚の札だけ。
      spot = this.avoidRects(Math.max(half + 12, Math.min(W - half - 12, goalX)),
        Math.max(100, Math.min(H - 48, goalY - 40)), W, H, 'h', null, half, labelHeight, true);
    } else if (visible) {
      if (bounds) this.drawSelectedGoalFlag(g, bounds, bounds.left + bounds.width / 2, bounds.top);
      const tipX = bounds ? bounds.left + bounds.width / 2 : goalX;
      const tipY = bounds ? bounds.top - 10 : goalY - 80;
      this.drawTargetPointer(g, tipX, tipY, '#fff3ba');
      spot = this.avoidRects(Math.max(half + 12, Math.min(W - half - 12, tipX)), Math.max(56, tipY - 38),
        W, H, 'h', null, half, 44, true);
    } else {
      const right = side >= 0, x = right ? W - 68 : 68;
      // 画面端に寄せ、矢じりの先から札まで同じ向きを保つ。
      const y = Math.max(100, Math.min(H - 80, H * .55));
      spot = this.avoidRects(right ? W - half - 92 : half + 92, y + 22,
        W, H, 'v', null, half, labelHeight, true);
      const edgeY = spot ? spot[1] - 22 : y;
      g.save(); g.translate(x, edgeY); g.rotate(Math.atan2(-forward, side) - Math.PI / 2);
      this.drawGoalArrow(g, 0, 0); g.restore();

    }
    // 雨待ちの任務も残す時は、既存の知らせと合わせて三枚まで。
    const occupied = this.notices.picks.length + Number(!this.root.classList.contains('working') && !!rt.nearestInteract()) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
    if (occupied >= 3) spot = null;
    if (spot) {
      const left = spot[0] - half, top = spot[1] - labelHeight;

      g.fillStyle = '#14120f'; g.fillRect(left, top, half * 2, labelHeight);
      g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, spot[0], top + 22);
      if (detail) {
        g.font = 'bold 16px sans-serif';
        g.fillText(detail, spot[0], top + 50);
      }
    }
    this.flagGuideDrawn = !!spot;
    setClass(this.root, 'flag-guide', this.flagGuideDrawn);
    g.restore(); return !!spot || !!visible;
  }
}
