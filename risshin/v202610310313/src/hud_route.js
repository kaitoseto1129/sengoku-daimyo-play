import { VIEW } from "./viewport.js";
import { groundAt } from "./floors.js";
import { localClear } from "./army_local_way.js";
import { $, setClass, setCssVar, singleBattleGuide, FLOOR_CROSS, FLOOR_FOOTPRINT, FLOOR_DIRECTION } from "./hud_common.js";
import { S } from "./settings.js";

export class HudRoute {


  // 道筋は足元から先端の旗へつながる実線にそろえる。
  drawRoutePath(g, rt, path, continuous = false, emphasize = false) {
    const screen = this.routePathScreen || (this.routePathScreen = new Float32Array(17 * 3));
    const W = VIEW.w, H = VIEW.h;
    const compact = !!rt.def.compactRouteGuide || continuous;
    let drew = false;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    this.routePathSolid ||= [];
    g.setLineDash(this.routePathSolid);
    const tip = this.routePathTip || (this.routePathTip = { x:0, y:0 });
    for (let part = 1; part < path.length; part++) {
      const a = path[part - 1], b = path[part];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        this.tmpV.set(x, groundAt(rt.world, x, z, rt.player.u.pos.y) + .25, z).project(rt.camera);
        screen[i * 3] = (this.tmpV.x * .5 + .5) * W;
        screen[i * 3 + 1] = (-this.tmpV.y * .5 + .5) * H;
        screen[i * 3 + 2] = this.tmpV.z >= -1 && this.tmpV.z <= 1 ? 1 : 0;
      }
      g.beginPath();
      let connected = false;
      for (let i = 1; i <= 16; i++) {
        const j = i * 3, k = j - 3;
        if (!screen[j + 2] || !screen[k + 2]) { connected = false; continue; }
        const x = screen[j], y = screen[j + 1], px = screen[k], py = screen[k + 1];
        if (Math.max(x, px) < 12 || Math.min(x, px) > W - 12 || Math.max(y, py) < 64 || Math.min(y, py) > H - 24) { connected = false; continue; }
        if (continuous) {
          // 画面から外れる所まで同じ線を保ち、その先端に旗を立てる。
          const dx = x - px, dy = y - py;
          let lo = 0, hi = 1;
          if (dx === 0 && (px < 48 || px > W - 48) || dy === 0 && (py < 112 || py > H - 32)) { connected = false; continue; }
          if (dx !== 0) { lo = Math.max(lo, Math.min((48 - px) / dx, (W - 48 - px) / dx)); hi = Math.min(hi, Math.max((48 - px) / dx, (W - 48 - px) / dx)); }
          if (dy !== 0) { lo = Math.max(lo, Math.min((112 - py) / dy, (H - 32 - py) / dy)); hi = Math.min(hi, Math.max((112 - py) / dy, (H - 32 - py) / dy)); }
          if (lo > hi) { connected = false; continue; }
          if (!connected || lo > 0) g.moveTo(px + dx * lo, py + dy * lo);
          tip.x = px + dx * hi; tip.y = py + dy * hi; tip.angle = Math.atan2(dy, dx);
          g.lineTo(tip.x, tip.y); connected = hi === 1;
        } else {
          if (!connected) g.moveTo(px, py);
          g.lineTo(x, y); connected = true;
        }
        drew = true;
      }
      g.strokeStyle = '#14120f'; g.lineWidth = emphasize ? 13 : rt.def.subtleGroundGuides || compact ? 8 : 13; g.stroke();
      g.strokeStyle = emphasize ? '#ffffff' : '#fff3ba'; g.lineWidth = emphasize ? 5 : rt.def.subtleGroundGuides || compact ? 2 : 5; g.stroke();
    }
    g.restore();
    return drew;
  }


  // 角の手前から先までを床へ投影し、明るい道の縁と太い折れ矢印にする。
  drawRouteBend(g, rt, sign) {
    const p = rt.player.u.pos, dx = sign.x - p.x, dz = sign.z - p.z;
    const distance = Math.hypot(dx, dz), outLength = Math.hypot(sign.dirX, sign.dirZ);
    if (sign.door || !Number.isFinite(outLength) || outLength < .01 || distance < .6 || distance > (rt.def.routeTurnDistance ?? 2.2)) return false;
    const ix = dx / distance, iz = dz / distance, ox = sign.dirX / outLength, oz = sign.dirZ / outLength;
    if (Math.abs(ix * oz - iz * ox) < .5 || rt.def.routeTurnReady?.(rt, sign) === false) return false;
    const point = this.bendPoint || (this.bendPoint = { x:0, y:0, z:0 });
    const screen = this.bendScreen || (this.bendScreen = new Float32Array(18));
    const projection = this.bendProjection || (this.bendProjection = {});
    const approach = Math.min(2.5, distance * .8);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let lane = 0; lane < 1; lane++) {
      const offset = lane === 0 ? 0 : lane === 1 ? -.65 : .65;
      for (let i = 0; i < 3; i++) {
        point.x = sign.x + (i === 0 ? -ix * approach : i === 2 ? ox * 2.5 : 0) +
          (i === 0 ? iz : i === 2 ? oz : iz + oz) * offset;
        point.z = sign.z + (i === 0 ? -iz * approach : i === 2 ? oz * 2.5 : 0) -
          (i === 0 ? ix : i === 2 ? ox : ix + ox) * offset;
        point.y = groundAt(rt.world, point.x, point.z, sign.y ?? p.y);
        if (lane === 0 && (!localClear(rt.army, i === 2 ? sign : p, point) || !this.floorGoalVisible(rt, point))) return false;
        this.project(point, point.y + .12, rt, projection);
        if (projection.behind || projection.x < 20 || projection.x > VIEW.w - 20 ||
            projection.y < 64 || projection.y > VIEW.h - 24) return false;
        const index = lane * 6 + i * 2;
        screen[index] = projection.x; screen[index + 1] = projection.y;
        left = Math.min(left, projection.x); right = Math.max(right, projection.x);
        top = Math.min(top, projection.y); bottom = Math.max(bottom, projection.y);
      }
    }
    if ((right - left) * (bottom - top) > VIEW.w * VIEW.h / 6) return false;
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    for (let lane = 0; lane >= 0; lane--) {
      const index = lane * 6;
      g.beginPath(); g.moveTo(screen[index], screen[index + 1]);
      g.lineTo(screen[index + 2], screen[index + 3]); g.lineTo(screen[index + 4], screen[index + 5]);
      if (lane === 0) {
        const ax = screen[4] - screen[2], ay = screen[5] - screen[3], length = Math.hypot(ax, ay) || 1;
        const ux = ax / length, uy = ay / length, head = Math.min(18, length * .6);
        g.moveTo(screen[4] - ux * head - uy * head * .65, screen[5] - uy * head + ux * head * .65);
        g.lineTo(screen[4], screen[5]);
        g.lineTo(screen[4] - ux * head + uy * head * .65, screen[5] - uy * head - ux * head * .65);
      }
      g.strokeStyle = '#14120f'; g.lineWidth = lane === 0 ? 16 : 7; g.stroke();
      g.strokeStyle = lane === 0 ? '#fff3ba' : '#ffffff'; g.lineWidth = lane === 0 ? 9 : 3; g.stroke();
    }
    g.restore();
    return true;
  }


  // 次に通る実際の角へ印を付け、遠くても同じ大きさで示す。
  drawCornerArrow(g, rt, pos) {
    const p = rt.player.u.pos, dx = pos.x - p.x, dz = pos.z - p.z;
    const length = Math.hypot(dx, dz);
    const floor = this.cornerFloor || (this.cornerFloor = { x:0, y:0, z:0 });
    floor.x = pos.x; floor.z = pos.z; floor.y = groundAt(rt.world, pos.x, pos.z, p.y);
    if (length < .1 || !this.floorGoalVisible(rt, floor)) return false;
    const screen = this.project(floor, floor.y + .1, rt,
      this.cornerFlagProjection || (this.cornerFlagProjection = {}));
    if (screen.behind || screen.x < 32 || screen.x > VIEW.w - 48 || screen.y < 112 || screen.y > VIEW.h - 24) return false;
    if (rt.def.groundRouteGuide && rt.def.cornerArrowMaxPixels) {
      // 曲がる実地点に一本だけ置き、旗や途中の矢印を重ねない。
      this.drawNavigationArrow(g, screen.x, screen.y, Math.PI / 2,
        Math.min(1, rt.def.cornerArrowMaxPixels / 52), true);
      this.placeEdgeOrder(screen.x, screen.y - 68);
    } else this.drawMoveGoal(g, rt, screen.x, screen.y);
    return true;
  }


  // 移動先には旗と目的を添える。任務札がある時は、その一枚を旗のそばへ移す。
  drawMoveGoal(g, rt, x, y) {
    // 旗・矢印・札を縦にそろえ、人の塊から離した一組の印にする。
    const scale = 1.15;
    const flag = this.drawRaisedGoalFlag(g, rt, x, y, false, scale, '');
    x = flag.x + 16 * scale;
    const tipY = flag.y - 56 * scale - 10;
    this.drawNavigationArrow(g, x, tipY, Math.PI / 2, .65, true);
    const labelBottom = tipY - 44;
    const order = $('objectives');
    if (this.notices.sources[1].selected && !order.classList.contains('expand')) {
      setClass(order, 'linked-destination', true);
      setClass(order, 'ground-order', true);
      const key = this.objKey + '|' + VIEW.w + '|' + VIEW.h + '|' + S.textScale;
      if (this.moveGoalOrderKey !== key) {
        this.moveGoalOrderKey = key;
        this.moveGoalOrderW = order.offsetWidth; this.moveGoalOrderH = order.offsetHeight;
      }
      const width = this.moveGoalOrderW, height = this.moveGoalOrderH;
      setCssVar(order, '--ground-order-x', Math.round(Math.max(12, Math.min(VIEW.w - width - 12, x - width / 2))) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(Math.max(12, labelBottom - height)) + 'px');
      return;
    }
    const occupied = this.notices.picks.length + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted')) +
      Number(!!rt.nearestInteract() || !!rt.touchCoachActive || rt.player.u.wounds?.bleed > .0001 ||
        rt.player.u.hp < rt.player.u.maxHp * .6);
    if (occupied >= 3) return;
    const label = 'この旗へ';
    const textScale = Math.max(1, S.textScale || 1), height = 32 * textScale;
    g.save(); g.font = `bold ${16 * textScale}px sans-serif`;
    const half = g.measureText(label).width / 2 + 8;
    g.fillStyle = '#14120f'; g.fillRect(x - half, labelBottom - height, half * 2, height);
    g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x, labelBottom - height / 2);
    g.restore();
  }


  // 足形と進む矢印を実際の床へ投影する。札や立体の素材は増やさない。
  drawFloorWaymark(g, rt, pos, footprints = false, direction = null, treatment = false) {
    const p = rt.player.u.pos, dx = pos.x - p.x, dz = pos.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < .1 && !treatment) return false;
    const ux = treatment ? 0 : direction?.dirX ?? dx / length, uz = treatment ? 1 : direction?.dirZ ?? dz / length;
    const point = this.floorWaymarkPoint || (this.floorWaymarkPoint = { x: 0, y: 0, z: 0 });
    point.x = pos.x; point.z = pos.z;
    point.y = pos.y ?? groundAt(rt.world, pos.x, pos.z, p.y);
    if (!this.floorGoalVisible(rt, point, false)) return false;
    if (singleBattleGuide(rt) && !this.openingActive && !footprints && !treatment && !direction) {
      const end = this.floorLineEnd || (this.floorLineEnd = { x:0, y:0, z:0 });
      end.x = pos.x + ux * .8; end.z = pos.z + uz * .8;
      end.y = groundAt(rt.world, end.x, end.z, point.y);
      const route = this.floorLineRoute || (this.floorLineRoute = []);
      route[0] = point; route[1] = end;
      const drawn = this.drawRoutePath(g, rt, route, true);
      if (drawn) this.drawSmallGoalFlag(g, this.routePathTip.x, this.routePathTip.y, .5, false, false, '');
      return drawn;
    }
    const shape = treatment ? FLOOR_CROSS : footprints ? FLOOR_FOOTPRINT : FLOOR_DIRECTION;
    const screen = this.floorWaymarkScreen || (this.floorWaymarkScreen = new Float32Array(32));
    for (let foot = 0; foot < (footprints ? 2 : 1); foot++) {
      for (let i = 0; i < shape.length; i += 2) {
        const across = shape[i] + (footprints ? (foot ? .4 : -.4) : 0);
        const along = shape[i + 1] + (footprints && foot ? .25 : 0);
        const x = pos.x + ux * along + uz * across, z = pos.z + uz * along - ux * across;
        this.tmpV.set(x, groundAt(rt.world, x, z, point.y) + .1, z).project(rt.camera);
        const sx = (this.tmpV.x * .5 + .5) * VIEW.w, sy = (-this.tmpV.y * .5 + .5) * VIEW.h;
        if (this.tmpV.z < -1 || this.tmpV.z > 1 || (!footprints &&
            (sx < 12 || sx > VIEW.w - 12 || sy < 64 || sy > VIEW.h - 24))) return false;
        screen[foot * shape.length + i] = sx; screen[foot * shape.length + i + 1] = sy;
      }
    }
    if (footprints || treatment || direction || rt.def.floorArrowMaxPixels) {
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      const count = shape.length * (footprints ? 2 : 1);
      for (let i = 0; i < count; i += 2) {
        left = Math.min(left, screen[i]); right = Math.max(right, screen[i]);
        top = Math.min(top, screen[i + 1]); bottom = Math.max(bottom, screen[i + 1]);
      }
      const extent = Math.max(right - left, bottom - top, 1);
      if (footprints && (right < 16 || left > VIEW.w - 16 || bottom < 64 || top > VIEW.h - 24)) return false;
      const scale = Math.min(footprints ? Math.max(18 / extent, Math.min(1, 40 / extent)) : direction ? Math.max(1, 44 / extent) : 1,
        direction?.maxPixels ? direction.maxPixels / extent : Infinity,
        treatment ? (rt.def.compactTreatmentSign ? 32 : 64) / extent : rt.def.floorArrowMaxPixels ? rt.def.floorArrowMaxPixels / extent : Infinity);
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      // 遠い床でも足形が横線につぶれないよう、縦横それぞれに読める大きさを保つ。
      const scaleX = footprints ? Math.max(scale, 24 / Math.max(1, right - left)) : scale;
      const scaleY = footprints ? Math.max(scale, 18 / Math.max(1, bottom - top)) : scale;
      for (let i = 0; i < count; i += 2) {
        screen[i] = cx + (screen[i] - cx) * scaleX;
        screen[i + 1] = cy + (screen[i + 1] - cy) * scaleY;
      }
    }
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineJoin = 'round'; g.beginPath();
    for (let foot = 0; foot < (footprints ? 2 : 1); foot++) {
      const offset = foot * shape.length;
      g.moveTo(screen[offset], screen[offset + 1]);
      for (let i = 2; i < shape.length; i += 2) g.lineTo(screen[offset + i], screen[offset + i + 1]);
      g.closePath();
    }
    g.strokeStyle = '#14120f'; g.lineWidth = footprints ? 5 : 8; g.stroke();
    g.fillStyle = footprints ? '#ffffff' : '#fff3ba'; g.fill(); g.restore();
    return true;
  }


  // 足元から次の角へ案内する。点を使い回し、道の検査は毎秒四回まで。
  drawRouteFootsteps(g, rt, goal) {
    const p = rt.player.u.pos;
    const trail = this.routeFootsteps || (this.routeFootsteps = {
      at: -1, points: Array.from({ length:32 }, () => ({ x:0, y:0, z:0, valid:false })), dirX:0, dirZ:0,
    });
    if (trail.rt !== rt || rt.t >= trail.at || rt.t < trail.at - .25 ||
        Math.hypot(goal.x - trail.gx, goal.z - trail.gz) > .5 || Math.hypot(p.x - trail.px, p.z - trail.pz) > .5) {
      trail.rt = rt; trail.at = rt.t + .25; trail.gx = goal.x; trail.gz = goal.z;
      trail.px = p.x; trail.pz = p.z;
      const dx = goal.x - p.x, dz = goal.z - p.z, length = Math.hypot(dx, dz);
      trail.dirX = dx / (length || 1); trail.dirZ = dz / (length || 1);
      const count = Math.min(trail.points.length, Math.max(1, Math.ceil(length / .8)));
      let clear = true;
      for (let i = 0; i < trail.points.length; i++) {
        const point = trail.points[i];
        if (i >= count) { point.valid = false; continue; }
        const step = Math.min(length - .35, .9 + Math.max(0, length - 1.25) * i / Math.max(1, count - 1));
        point.x = p.x + trail.dirX * step; point.z = p.z + trail.dirZ * step;
        point.y = groundAt(rt.world, point.x, point.z, p.y);
        clear = clear && rt.world.walkable(point.x, point.z, point.y) && localClear(rt.army, i ? trail.points[i - 1] : p, point);
        point.valid = length > .8 && clear;
      }
    }
    // 通り口へ向かう間は同じ矢印だけを並べ、遠い印から描いて行き先を残す。
    if (rt.def.routeFootsteps) {
      trail.maxPixels = 32;
      const rects = this.hudRects();
      const projection = this.footstepProjection || (this.footstepProjection = {});
      let lastX = -1000, lastY = -1000, count = 0;
      for (let i = trail.points.length - 1; i >= 0 && count < 6; i--) {
        const point = trail.points[i];
        if (!point.valid) continue;
        this.project(point, point.y + .1, rt, projection);
        if (projection.behind || projection.x < 32 || projection.x > VIEW.w - 32 ||
            projection.y < 80 || projection.y > VIEW.h - 32 ||
            Math.hypot(projection.x - lastX, projection.y - lastY) < 56 ||
            rects.some(r => projection.x + 20 > r.left && projection.x - 20 < r.right &&
              projection.y + 20 > r.top && projection.y - 20 < r.bottom)) continue;
        if (this.drawFloorWaymark(g, rt, point, false, trail)) {
          lastX = projection.x; lastY = projection.y; count++;
        }
      }
      this.routeArrowCount = count;
      trail.drawnAt = rt.t;
      return;
    }
    // 自分の輪・到着の旗・札の範囲を空け、途中の足あとだけを描く。
    trail.maxPixels = 32;
    const self = this.project(p, p.y + .12, rt,
      this.routeSelfProjection || (this.routeSelfProjection = {}));
    const end = this.project(goal, goal.y + .18, rt,
      this.routeEndProjection || (this.routeEndProjection = {}));
    const rects = this.hudRects();
    let lastX = -1000, lastY = -1000, arrowX = -1000, arrowY = -1000;
    const arrowGap = rt.def.groundRouteGuide ? 48 : 80;
    const projection = this.footstepProjection || (this.footstepProjection = {});
    // 道の途中に一つだけ矢印を入れる。向きは足あとと同じ実際の床に沿わせる。
    for (let i = Math.floor(trail.points.length / 2); i >= 0; i--) {
      const point = trail.points[i];
      if (!point.valid) continue;
      this.project(point, point.y + .1, rt, projection);
      if (projection.behind || projection.x < 48 || projection.x > VIEW.w - 48 ||
          projection.y < 96 || projection.y > VIEW.h - 48 ||
          !self.behind && Math.hypot(projection.x - self.x, projection.y - self.y) < arrowGap ||
          !end.behind && Math.hypot(projection.x - end.x, projection.y - end.y) < arrowGap ||
          rects.some(r => r !== this.guideOrderRect && projection.x + 32 > r.left &&
            projection.x - 32 < r.right && projection.y + 32 > r.top && projection.y - 32 < r.bottom)) continue;
      if (this.drawFloorWaymark(g, rt, point, false, trail)) {
        arrowX = projection.x; arrowY = projection.y; break;
      }
    }
    for (let i = 0; i < trail.points.length; i++) {
      const point = trail.points[i];
      if (!point.valid) continue;
      this.project(point, point.y + .1, rt, projection);
      if (projection.behind || Math.hypot(projection.x - lastX, projection.y - lastY) < 36 ||
          Math.hypot(projection.x - arrowX, projection.y - arrowY) < 44 ||
          !self.behind && Math.abs(projection.x - self.x) < 56 && Math.abs(projection.y - self.y) < 40 ||
          !end.behind && projection.x > end.x - 28 && projection.x < end.x + 64 &&
            projection.y > end.y - 80 && projection.y < end.y + 24 ||
          rects.some(r => r !== this.guideOrderRect && projection.x + 20 > r.left &&
            projection.x - 20 < r.right && projection.y + 16 > r.top && projection.y - 16 < r.bottom)) continue;
      if (this.drawFloorWaymark(g, rt, point, true, trail)) {
        lastX = projection.x; lastY = projection.y;
      }
    }
  }


  // 開いている戸口の中央に印を保ち、通れる手前の床に進む矢印を置く。
  drawDoorFloorGoal(g, rt, point, sign, x, y) {
    // 開口内の小さな矢印を使い、同じ戸口へ床の矢印を重ねない。
    if (sign.door && this.placeFrameShown) return true;
    const p = rt.player.u.pos, distance = Math.hypot(point.x - p.x, point.z - p.z);
    const direction = this.doorApproachDirection || (this.doorApproachDirection = { dirX:0, dirZ:0, maxPixels:48 });
    direction.dirX = (point.x - p.x) / (distance || 1);
    direction.dirZ = (point.z - p.z) / (distance || 1);
    const step = this.doorApproachPoint || (this.doorApproachPoint = { x:0, y:0, z:0 });
    const along = Math.max(0, distance - .8);
    step.x = p.x + direction.dirX * along; step.z = p.z + direction.dirZ * along;
    step.y = point.y;
    // 開口の床が見切れた時は、手前の通れる床まで戻す。
    for (let i = 0; i < 4; i++) {
      if (localClear(rt.army, p, step) && this.drawFloorWaymark(g, rt, step, false, direction)) return false;
      step.x = (step.x + p.x) / 2; step.z = (step.z + p.z) / 2;
      step.y = groundAt(rt.world, step.x, step.z, p.y);
    }
    return false;
  }


  // 次に歩ける床へ小さな印を置く。壁がある時は既存の道案内に従う。
  drawAdvanceStep(g, rt, goal) {
    const p = rt.player.u.pos;
    const step = this.advanceStep || (this.advanceStep = { x:0, y:0, z:0 });
    const direction = this.advanceDirection || (this.advanceDirection = { dirX:0, dirZ:0, maxPixels:32 });
    // 道と障害物は毎秒五回まで調べ、投影用の点と向きは使い回す。
    if (step.rt !== rt || rt.t >= step.at || rt.t < step.at - .2 ||
        Math.hypot(goal.x - step.gx, goal.z - step.gz) > 1 ||
        Math.hypot(p.x - step.px, p.z - step.pz) > 1) {
      step.rt = rt; step.at = rt.t + .2; step.gx = goal.x; step.gz = goal.z;
      step.px = p.x; step.pz = p.z;
      const next = rt.world.def.guideWay?.(rt.player.u, goal) ||
        rt.world.def.moveWay?.(rt.army, rt.player.u, goal) || goal;
      const dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz);
      step.valid = false;
      if (distance >= 2) {
        direction.dirX = dx / distance; direction.dirZ = dz / distance;
        const length = Math.min(5, distance);
        step.x = p.x + direction.dirX * length; step.z = p.z + direction.dirZ * length;
        step.y = groundAt(rt.world, step.x, step.z, p.y);
        step.valid = rt.world.walkable(step.x, step.z, step.y) && localClear(rt.army, p, step);
      }
    }
    if (!step.valid || !this.drawFloorWaymark(g, rt, step, false, direction)) return false;
    const screen = this.project(step, step.y + .1, rt,
      this.advanceProjection || (this.advanceProjection = {}));
    this.placeEdgeOrder(screen.x, screen.y);
    setClass(this.root, 'travel-guide', true);
    return true;
  }
}
